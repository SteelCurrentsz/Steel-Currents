// The Panzerschiffe Admiral Scheer and Admiral Graf Spee, drawn from the
// owner's model of the Scheer.
//
// The two were sisters, laid down a year apart to the same lines: a cruiser
// hull carrying two triple 28 cm turrets, eight single 15 cm in shields along
// her upper deck, three twin 10.5 cm, two quadruple banks of tubes on her
// quarterdeck and a catapult abaft her funnel. What set them apart by the end
// was flak. The Graf Spee was scuttled in December 1939 with the light battery
// she was built with -- eight 3.7 cm in four twins, a handful of 2 cm singles
// -- and the Scheer went on through the war being given more: twin 3.7 cm on
// her turret roofs, sixteen 2 cm quadruples in tubs along her upper deck and a
// pair of 4 cm singles on her quarterdeck.
//
// Her hull and superstructure are the model -- "The Third Reich Navy large
// cruiser ADM. SCHEER" by 全斗焕, under Creative Commons Attribution 4.0 --
// (see scheerHull.js and build/prepare-scheer-hull.mjs); every one of her guns
// is the model's own, cut out of it. What is built here is everything that
// moves or fires, mounting by mounting off each ship's own datasheet, so the
// Graf Spee carries the guns the Scheer's model carries that she did and not
// the ones she did not:
//
//   * her two 28 cm triples, the model's gunhouses, their barrels on a cradle
//     that elevates;
//   * her eight 15 cm singles and her three 10.5 cm twins;
//   * her flak, each mounting the model's own -- and on the Scheer the twins
//     on her turret roofs ride round with their turrets;
//   * her two quadruple banks of tubes, housed on her quarterdeck, which train
//     out over her quarters and fire;
//   * her catapult on its turntable, which trains out to port and throws an
//     Arado off it;
//   * her two screws, the model's, which turn;
//
// and, inside her, her armour and her interior, fitted to her own lines.
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, y = 0 is the
// waterline.

import * as THREE from '../../../vendor/three.module.js';
import { arm } from './mounts.js';
import { fitTubes } from './tubes.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { lightMounts } from '../../../shared/sim.js';
import { box, cyl, strip, sheet } from './shipkit.js';
import { RIG, fitCatapults } from './catapult.js';
import { arado } from './planekit.js';
import {
  buildScheerHull, scheerSurfaceY, MOUNT_SEATS, SCULPT_LINES, scheerMaterials, gunPiece,
} from './scheerHull.js';
import { SCREWS, CATAPULT } from './scheerHull.data.js';
import { decodePiece } from './sculpt.js';

// Both are drawn to the Scheer's hull, and both datasheets say so.
const HULL = SHIP_CLASSES.scheer.hull;
export const LOA = HULL.length;
export const BEAM = HULL.beam;
export const DRAFT = HULL.draft;

const P = {
  armour: 0x4a5158,
  steelDark: 0x5a6168,
  gunDark: 0x40464c,
};

const MATS = {};
function mat(color) {
  if (!MATS[color]) MATS[color] = new THREE.MeshLambertMaterial({ color });
  return MATS[color];
}
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

// ------------------------------------------------------------- her lines --

const L = SCULPT_LINES;
const along = (z) => Math.max(0, Math.min(L.nz - 1.0001, (z - L.z0) / L.dz));
const lerp = (arr, f) => {
  const i = Math.floor(f);
  const u = f - i;
  return arr[i] * (1 - u) + arr[Math.min(arr.length - 1, i + 1)] * u;
};
/** Her station at fraction t of her length, bow +1, as a z. */
export const zAt = (t) => (t * LOA) / 2;
/** The bottom of her keel at station t. */
export function keelY(t) {
  const f = along(zAt(t));
  const i = Math.floor(f);
  const a = L.keel[i] > 50 ? L.keel[Math.min(L.nz - 1, i + 1)] : L.keel[i];
  const b = L.keel[Math.min(L.nz - 1, i + 1)] > 50 ? a : L.keel[Math.min(L.nz - 1, i + 1)];
  const u = f - i;
  return a * (1 - u) + b * u;
}
/** The deck over her insides at station t. */
export function deckOver(t) {
  return lerp(L.deck, along(zAt(t)));
}
/** How far out from her centreline her side is, at station t and height y. */
export function shellAt(t, y) {
  const f = along(zAt(t));
  const g = Math.max(0, Math.min(L.ny - 1.0001, (y - L.y0) / L.dy));
  const i = Math.floor(f);
  const j = Math.floor(g);
  const u = f - i;
  const v = g - j;
  const at = (a, b) => L.half[Math.min(L.nz - 1, a) * L.ny + Math.min(L.ny - 1, b)];
  return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v)
    + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
}
/** Her lines, for the interior and the tests. */
export const LINES = { loa: LOA, sheer: deckOver, keelY, shellAt, zAt };
const INNER_BOTTOM = 0.15;
/** Where her deck is at (0, z): her own surface on the centreline. */
export const deckAt = (z) => scheerSurfaceY(0, z);

// ---------------------------------------------------------------- guns ----

/**
 * A mounting off the owner's model of it (see gunPiece): what trains stands
 * at `y`, faces `rest`, and carries its barrels on a cradle about their
 * trunnions, laid back at the elevation the model stowed them at.
 */
function sculpted(g, kind, x, y, z, rest, trainRate, name, bare = false) {
  const piece = gunPiece(kind);
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = rest;
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = trainRate;
  if (name) m.userData.name = name;
  // Drawn from both sides: a shield is a sheet seen from behind as often as
  // in front.
  m.add(new THREE.Mesh(bare && piece.bare ? piece.bare : piece.house, scheerMaterials().sheet));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  cradle.rotation.x = -piece.pitch;
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, scheerMaterials().sheet));
  m.add(cradle);
  arm(m, cradle, piece.muzzles);
  g.add(m);
  return m;
}

/** The seat the build measured for a mounting of her datasheet, by where it is. */
function seatFor(list, x, z, what, cls) {
  let best = null, bd = Infinity;
  for (const s of list) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) { bd = d; best = s; }
  }
  if (!best || bd > 0.6) throw new Error(`the ${cls.name} has a ${what} at ${x}, ${z} her model does not`);
  return best;
}

const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);

function mainBattery(g, cls) {
  // A turret nothing of hers stands on is drawn bare of the tubs on its roof
  // the Scheer's twins stand in: the Graf Spee's.
  const ridden = new Set(lightMounts(cls).map((m) => m.turret).filter(Boolean));
  const turrets = cls.turrets.map((t) => {
    const s = seatFor(MOUNT_SEATS.main, t.x, t.z, 'turret', cls);
    return sculpted(g, 'main', s.x, s.y, s.z, t.angle, cls.gun.traverse, t.name, !ridden.has(t.name));
  });
  g.userData.turrets = turrets;
  return turrets;
}

// How fast each kind of light gun is trained round.
const TRAIN = { heavy: 0.4, twin: 0.7, bofors: 0.8, quad: 1.0, single: 1.2 };

function mountings(g, cls) {
  const sec = cls.secondary.mounts.map((spec) => {
    const s = seatFor(MOUNT_SEATS.sec, spec.x, spec.z, '15 cm', cls);
    const m = sculpted(g, 'sec', s.x, s.y, s.z, stowed(spec), cls.secondary.traverse);
    m.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
    return m;
  });
  const aa = [];
  const lights = lightMounts(cls);
  const turrets = g.userData.turrets || [];
  for (const gun of cls.aa.guns) {
    const kind = gun.piece;
    for (const spec of gun.mounts) {
      const s = seatFor(MOUNT_SEATS[kind], spec.x, spec.z, `${gun.caliber} mm`, cls);
      const a = sculpted(g, kind, s.x, s.y, s.z, stowed(spec), TRAIN[kind] || 0.7);
      // A twin on a turret's roof goes round with the turret: the scene puts
      // it where its spot on the roof has trained to each frame (see `ride`
      // in scene.js), and lays it in her frame like every other.
      const carrier = spec.turret && turrets.find((t) => t.userData.name === spec.turret);
      if (spec.turret && !carrier) throw new Error(`the ${cls.name} has no turret ${spec.turret} to stand a gun on`);
      if (carrier) {
        a.userData.ride = { turret: carrier, x: s.x - carrier.position.x, y: s.y - carrier.position.y, z: s.z - carrier.position.z };
        // Turned with it: the spot is measured with the turret trained the
        // way the model drew it.
        const c = Math.cos(-carrier.rotation.y), sn = Math.sin(-carrier.rotation.y);
        const { x, z } = a.userData.ride;
        a.userData.ride.x = x * c + z * sn;
        a.userData.ride.z = -x * sn + z * c;
      }
      a.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = spec.lift || null;
      aa.push(a);
    }
  }
  if (aa.length !== lights.length) throw new Error(`the ${cls.name} built a light battery her datasheet does not list`);
  const torp = cls.torpedoes.mounts.map((spec) => torpedoBank(g, spec, cls));
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  g.userData.torpMounts = torp;
  return { sec, aa, torp };
}

/**
 * One of her quadruple banks of tubes, as the model drew it (see gunPiece):
 * the bank in its housing trains about its middle, its four tubes level, and
 * its muzzles are the after ends of its tubes, out of the housing. Her two
 * banks are each other's mirror, and each is its own piece.
 */
function torpedoBank(g, spec, cls) {
  const i = MOUNT_SEATS.tubes.indexOf(seatFor(MOUNT_SEATS.tubes, spec.x, spec.z, 'bank of tubes', cls));
  const s = MOUNT_SEATS.tubes[i];
  const piece = gunPiece(`tubes${i}`);
  const m = new THREE.Group();
  m.position.set(s.x, s.y, s.z);
  m.rotation.y = stowed(spec);
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.name = `${spec.x > 0 ? 'port' : 'starboard'} tubes`;
  m.userData.trainRate = cls.torpedoes.traverse;
  m.add(new THREE.Mesh(piece.house, scheerMaterials().sheet));
  // Nothing elevates: the cradle is where the tubes' axes are, so that the
  // muzzles are read off the line the fish leave along.
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  m.add(cradle);
  arm(m, cradle, piece.bores.map(([x, y, , zm]) => [x, y - piece.trunnion[1], zm]));
  m.userData.bores = piece.bores;
  g.add(m);
  return m;
}

// ------------------------------------------------------------ her armour --

/**
 * Her armour, as structure inside the ship: none of it to be seen while her
 * plating is whole, all of it when a shell has opened her up.
 *
 *   the belt          eighty millimetres, from Anton's barbette to Bruno's,
 *                     from her armour deck down under her waterline
 *   the armour deck   at the top of the belt
 *   the bulkheads     that close the citadel at both ends
 *   the barbettes     of her two turrets, down to the armour deck
 */
const CITADEL = [-48, 54];
const ARMOUR_DECK = 2.6;
const BELT_FOOT = -2.6;
const BARBETTE_R = 4.3;

function armour(g) {
  const inside = (o) => { o.userData.inside = true; return o; };
  const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
  const N = 60;
  const [z0, z1] = CITADEL;
  const belt = strip();
  for (let i = 0; i < N; i++) {
    const za = z0 + ((z1 - z0) * i) / N;
    const zb = z0 + ((z1 - z0) * (i + 1)) / N;
    for (const sgn of [-1, 1]) {
      belt.quad([sgn * at(za, ARMOUR_DECK, 1.0), ARMOUR_DECK, za], [sgn * at(za, BELT_FOOT, 1.0), BELT_FOOT, za],
        [sgn * at(zb, BELT_FOOT, 1.0), BELT_FOOT, zb], [sgn * at(zb, ARMOUR_DECK, 1.0), ARMOUR_DECK, zb],
        [-sgn, 0, 0]);
    }
  }
  inside(belt.mesh(g, M.armour));
  for (const up of [true, false]) {
    inside(sheet(g, M.armour, z0, z1, (z) => at(z, ARMOUR_DECK, 1.0), () => ARMOUR_DECK + (up ? 0.1 : -0.1), 48, up));
  }
  for (const z of [z0, z1]) {
    const bh = strip();
    const ys = [];
    for (let y = BELT_FOOT; y < ARMOUR_DECK; y += 1.0) ys.push(y);
    ys.push(ARMOUR_DECK);
    for (let i = 0; i < ys.length - 1; i++) {
      const wa = at(z, ys[i], 1.3), wb = at(z, ys[i + 1], 1.3);
      for (const face of [1, -1]) {
        bh.quad([-wa, ys[i], z], [wa, ys[i], z], [wb, ys[i + 1], z], [-wb, ys[i + 1], z], [0, 0, face]);
      }
    }
    inside(bh.mesh(g, M.armour));
  }
  for (const t of MOUNT_SEATS.main) {
    const top = deckOver((2 * t.z) / LOA) - 0.3;
    inside(cyl(g, M.armour, BARBETTE_R, BARBETTE_R, top - ARMOUR_DECK, t.x, (top + ARMOUR_DECK) / 2, t.z, 32));
  }
}

// --------------------------------------------------------------- screws --

// Her two screws, each as the model drew it, on the end of its shaft.
let screwGeo = null;
function screws(g) {
  if (!screwGeo) screwGeo = SCREWS.map((s) => decodePiece(s.piece));
  SCREWS.forEach((s, i) => {
    const hub = new THREE.Group();
    hub.position.set(s.x, s.y, s.z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand: s.x < 0 ? -1 : 1 };
    hub.add(new THREE.Mesh(screwGeo[i], scheerMaterials().sheet));
    g.add(hub);
  });
}

// ------------------------------------------------------------- catapult ----
//
// Her catapult: the girder the model drew on its turntable on the boat deck
// abaft her funnel, between her cranes, trained fifty-one degrees out to port
// where the model stood it -- which is where it is stowed. On the order it
// trains on round to eighty-one degrees off her bow, the Arado on its car is
// run down it, and she is thrown off over her port side; and it trains back
// in. The girder and its turntable are the model's (CATAPULT, in the frame of
// its own turntable: the girder along +Z towards the end the scout leaves
// from); the car and the Arado on it are drawn here and worked by
// fitCatapults.
export const CAT = { x: CATAPULT.x, y: CATAPULT.y, z: CATAPULT.z, base: CATAPULT.rest };
// Its rails, how far up the turntable they run.
export const CAT_TOP = CATAPULT.top;
// Out to eighty-one degrees off her bow to shoot.
export const CAT_OUT = 1.42 - CATAPULT.rest;
// The car rests forward of the gantry over the girder's after end, with the
// Arado's floats clear of it and her tail over its top, and runs to within
// half a metre of the forward end.
export const CAT_RIG = {
  // In the girder's own frame, which faces out over her port bow.
  ...RIG, BACK: CATAPULT.back, FRONT: CATAPULT.front, A: 1.2, STROKE: +(CATAPULT.front - 1.2 - 0.55).toFixed(2),
  REST: 0, OUT: CAT_OUT, PLANE_Y: 0.42, PLANE_Z: 0,
};

let catGeo = null;
/** Her catapult on its turntable, and the car and the Arado on its girder. */
function aviation(g) {
  if (!catGeo) catGeo = decodePiece(CATAPULT.piece);
  const cat = new THREE.Group();
  cat.position.set(CAT.x, CAT.y, CAT.z);
  cat.rotation.y = CAT.base;
  cat.userData.dynamic = true;
  cat.userData.name = 'catapult';
  cat.add(new THREE.Mesh(catGeo, scheerMaterials().sheet));
  g.add(cat);
  // The car runs on the rails on top of the girder.
  const car = new THREE.Group();
  car.position.set(0, CAT_TOP, CAT_RIG.A);
  car.userData.dynamic = true;
  cat.add(car);
  // The trolley on the rails, and the cradle her floats sit in: a chock under
  // each forward and aft and the arms up to them.
  box(car, M.gunDark, 1.3, 0.2, 2.6, 0, 0.1, 0);
  for (const cz of [0.9, -0.9]) {
    box(car, M.steelDark, 2.6, 0.16, 0.3, 0, 0.3, cz);
    for (const sx of [-1, 1]) box(car, M.steelDark, 0.12, 0.34, 0.12, sx * 1.15, 0.42, cz);
  }
  const plane = arado(car, 0, CAT_RIG.PLANE_Y, CAT_RIG.PLANE_Z, 0, false, { spin: true });
  g.userData.catapults = [{ group: cat, car, plane, prop: plane.userData.prop, sgn: 1, base: CAT.base }];
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['hullModel', buildScheerHull],
  ['armour', armour],
  ['screws', screws],
  ['aviation', aviation],
];

/** One of the two, `id` 'scheer' or 'spee', armed off her own datasheet. */
export function buildPanzerschiff(id) {
  const cls = SHIP_CLASSES[id];
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g, cls);
  mountings(g, cls);
  mergeMoving(g);
  g.userData.classId = id;
  const tubes = fitTubes(g, g.userData.torpMounts, cls.torpedoes);
  fitCatapults(g, {
    cats: g.userData.catapults, rig: CAT_RIG, deckY: CAT.y + CAT_TOP,
    catX: CAT.x, catZ: CAT.z, run: cls.planes.deckRun, aero: 'arado',
  });
  // Her tubes work on the same clock as her catapult.
  const catapults = g.userData.step;
  g.userData.step = (t) => { catapults(t); tubes(t); };
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
    torpMounts: g.userData.torpMounts || [],
    deckPlane: g.userData.deckPlane,
  };
}

export const buildScheer = () => buildPanzerschiff('scheer');
export const buildSpee = () => buildPanzerschiff('spee');

/** Every piece of her and where it sits, for the tests. */
export function panzerschiffParts(id) {
  const cls = SHIP_CLASSES[id];
  const parts = [];
  const builders = [...STATIC, ['mainBattery', (g) => mainBattery(g, cls)],
    ['mountings', (g) => { mainBattery(g, cls); mountings(g, cls); }]];
  for (const [name, build] of builders) {
    const g = new THREE.Group();
    build(g);
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      let moving = false;
      for (let n = o; n; n = n.parent) if (n.userData && n.userData.dynamic) { moving = true; break; }
      o.geometry.computeBoundingBox();
      const lb = o.geometry.boundingBox;
      const bb = lb.clone().applyMatrix4(o.matrixWorld);
      parts.push({
        from: name,
        min: [bb.min.x, bb.min.y, bb.min.z],
        max: [bb.max.x, bb.max.y, bb.max.z],
        size: [lb.max.x - lb.min.x, lb.max.y - lb.min.y, lb.max.z - lb.min.z],
        moving,
      });
    });
  }
  return parts;
}
