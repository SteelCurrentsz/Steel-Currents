// USS Brooklyn, drawn from the owner's model of her.
//
// The first of the American "six-inch cruisers", laid down under the London
// Treaty's tonnage when the Mogamis' fifteen 6.1 in guns had to be answered:
// a hundred and eighty-five metres, fifteen 6"/47 in five triple turrets --
// three forward, No.2 superfiring over No.1 and No.3 down on her main deck
// abaft it, stowed facing astern; No.4 superfiring over No.5 aft -- a flush
// deck, a hangar under her quarterdeck, and thirty-two and a half knots. She
// fought from the North Atlantic convoys to Sicily, Salerno, Anzio and the
// landings in southern France.
//
// Her hull, her bridge, her funnels, her masts, her hangar and her crane are
// the model -- "USS Brooklyn" by kriss50 (https://skfb.ly/ptOVJ), under
// Creative Commons Attribution 4.0 -- (see brooklynHull.js and
// build/prepare-brooklyn-hull.mjs). She is armed as she was in 1945. What is
// built here is everything that moves or fires:
//
//   * her five 6 in turrets, the model's gunhouses with the life rafts
//     lashed to them, their barrels on a cradle that elevates;
//   * her eight single 5"/25s on their open pedestals, two a side abreast her
//     forward superstructure and two a side abreast her after one. The model
//     draws four enclosed twin 5"/38s there -- the fit of her sisters Helena
//     and St. Louis, and of the Savannah and the Honolulu once they were
//     rebuilt -- which the Brooklyn never carried: they are taken off her
//     (see the build script) and her own guns stand on the decks they stood
//     on;
//   * her four quadruple 40 mm Bofors and twelve of her Oerlikons, as the
//     model draws them; and the two twin 40 mm on her forecastle and the six
//     Oerlikons the model leaves off, built here;
//   * her two catapults on her fantail, on the model's own turntables, which
//     train out over her quarters and throw a Kingfisher off on the
//     simulation's clock;
//   * her four screws, the model's, which turn;
//
// and, inside her, her armour and her interior, fitted to her own lines.
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, y = 0 is the
// waterline.

import * as THREE from '../../../vendor/three.module.js';
import { arm } from './mounts.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { lightMounts } from '../../../shared/sim.js';
import { box, cyl, strip, sheet } from './shipkit.js';
import { fiveInch25, twinBofors, oerlikon } from './usnguns.js';
import { kingfisher } from './planekit.js';
import { RIG, fitCatapults } from './catapult.js';
import {
  buildBrooklynHull, brooklynSurfaceY, brooklynSeatY, MOUNT_SEATS, SCULPT_LINES, brooklynMaterials, gunPiece,
} from './brooklynHull.js';
import { BROOKLYN_SCREWS as SCREWS, BROOKLYN_CATAPULTS as CATAPULTS } from './brooklynHull.data.js';
import { decodePiece } from './sculpt.js';

const CLS = SHIP_CLASSES.brooklyn;
export const LOA = CLS.hull.length;
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;

// Her own paints, for everything built here, as Measure 22 has them and as
// her model is painted (see the build script): haze grey on her guns and her
// fittings, deck blue on their floors.
const P = {
  steel: 0x87909a,
  steelDark: 0x5c646d,
  gun: 0x87909a,
  gunDark: 0x4d545c,
  deckDark: 0x3e4856,
  canvas: 0x8c8a7c,
  glass: 0x25303a,
  armour: 0x4d555c,
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
export const deckAt = (z) => brooklynSurfaceY(0, z);

// ---------------------------------------------------------------- guns ----

/**
 * A mounting off the owner's model of it (see gunPiece): what trains stands
 * at `y`, faces `rest`, and carries its barrels on a cradle about their
 * trunnions, laid back at the elevation the model stowed them at.
 */
function sculpted(g, kind, x, y, z, rest, trainRate, name) {
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
  m.add(new THREE.Mesh(piece.house, brooklynMaterials().sheet));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  cradle.rotation.x = -piece.pitch;
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, brooklynMaterials().sheet));
  m.add(cradle);
  arm(m, cradle, piece.muzzles);
  g.add(m);
  return m;
}

/** The seat the build measured for a mounting of her datasheet, by where it is. */
function seatFor(list, x, z, what) {
  let best = null, bd = Infinity;
  for (const s of list) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) { bd = d; best = s; }
  }
  if (!best || bd > 0.6) throw new Error(`the Brooklyn has a ${what} at ${x}, ${z} her model does not`);
  return best;
}

function mainBattery(g) {
  const turrets = CLS.turrets.map((t) => {
    const s = seatFor(MOUNT_SEATS.main, t.x, t.z, 'turret');
    return sculpted(g, 'main', s.x, s.y, s.z, t.rest ?? t.angle, CLS.gun.traverse, t.name);
  });
  g.userData.turrets = turrets;
  return turrets;
}

const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);

/**
 * A light gun built here trains inside its tub, and the tub is turned to open
 * behind it; the scene lays the gun by its bearing in her frame, so it hangs
 * off her, not off the tub, where the tub has it.
 */
function offTheTub(g, a, m) {
  const tub = a.parent;
  a.removeFromParent();
  a.position.set(tub.position.x, tub.position.y + a.position.y, tub.position.z);
  a.rotation.y = stowed(m);
  g.add(a);
  return a;
}

function mountings(g) {
  // Her 5"/25s, each on the deck under it.
  const sec = CLS.secondary.mounts.map((spec) => {
    const m = fiveInch25(g, M, spec.x, brooklynSeatY(spec.x, spec.z, 0.8), spec.z, stowed(spec));
    m.userData.rest = 0;
    m.userData.mounting = true;
    m.userData.trainRate = CLS.secondary.traverse;
    m.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
    return m;
  });
  const aa = [];
  const lights = lightMounts(CLS);
  for (const gun of CLS.aa.guns) {
    for (const spec of gun.mounts) {
      let a;
      if (gun.piece) {
        // As the model draws it, where it stands.
        const s = seatFor(MOUNT_SEATS[gun.piece], spec.x, spec.z, `${gun.caliber} mm`);
        a = sculpted(g, gun.piece, s.x, s.y, s.z, stowed(spec), gun.piece === 'quad' ? 1.4 : 2.9);
      } else if (gun.caliber === 40) {
        a = offTheTub(g, twinBofors(g, M, spec.x, brooklynSeatY(spec.x, spec.z, 0.8), spec.z, stowed(spec)), spec);
      } else {
        a = offTheTub(g, oerlikon(g, M, spec.x, brooklynSeatY(spec.x, spec.z, 0.6), spec.z, stowed(spec)), spec);
      }
      a.userData.rest = 0;
      a.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = spec.lift || null;
      aa.push(a);
    }
  }
  if (aa.length !== lights.length) throw new Error('the Brooklyn built a light battery her datasheet does not list');
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  return { sec, aa };
}

// ------------------------------------------------------------ aviation ----

// Her catapults, on her fantail either side of her hangar hatch, where the
// model stands them: each girder on a turntable halfway along it -- the
// pedestal is the model's, and stays -- pointing astern when stowed and
// trained out over her quarter to shoot. In the turntable's own frame the
// girder runs from its breech ten and a half metres forward of the pivot to
// its muzzle ten and a half aft of it.
const STBD = CATAPULTS[0];
const HALF = STBD.len / 2;
/** How far out from her centreline each turntable stands, and where along her. */
export const CAT_X = +((Math.abs(CATAPULTS[0].x) + Math.abs(CATAPULTS[1].x)) / 2).toFixed(3);
export const CAT_Z = STBD.z;
export const CAT_RIG = { ...RIG, BACK: -HALF, FRONT: HALF, A: -HALF + 2.0, STROKE: HALF * 2 - 3.0, REST: 0.02 };
const CAT_DECK = STBD.y0 - 0.05;

function aviation(g) {
  const cats = [];
  // The starboard catapult first: the simulation puts her first scout up to
  // starboard, and the two are worked turn and turn about.
  for (const c of CATAPULTS) {
    const side = Math.sign(c.x);
    const cat = new THREE.Group();
    cat.position.set(c.x, CAT_DECK, c.z);
    const base = Math.PI;
    const sgn = -side;
    cat.rotation.y = base + sgn * CAT_RIG.REST;
    cat.userData.dynamic = true;
    g.add(cat);
    const len = CAT_RIG.FRONT - CAT_RIG.BACK;
    const mid = (CAT_RIG.FRONT + CAT_RIG.BACK) / 2;
    // The training ring on the model's pedestal, the two rails, and the
    // sleepers between them.
    cyl(cat, M.steelDark, 1.3, 1.4, 0.3, 0, 0.15, 0, 18);
    for (const rail of [-0.6, 0.6]) {
      box(cat, M.steel, 0.26, 0.5, len, rail, 0.75, mid);
      box(cat, M.steelDark, 0.3, 0.12, len, rail, 1.04, mid);
    }
    for (let i = 0; i < 11; i++) {
      box(cat, M.steel, 1.5, 0.2, 0.26, 0, 0.5, CAT_RIG.BACK + 0.8 + i * ((len - 1.6) / 10));
    }
    // Trusswork under the girder either side of the turntable, where it is
    // carried out with nothing under it.
    for (let i = 0; i < 8; i++) {
      const br = box(cat, M.steel, 0.14, 0.12, 2.2, 0, 0.35, CAT_RIG.BACK + 1.6 + i * 2.4);
      br.rotation.x = i % 2 ? 0.5 : -0.5;
    }
    // The powder charge house over the breech: the catapult is a gun.
    box(cat, M.steel, 1.8, 1.0, 1.8, 0, 1.0, CAT_RIG.BACK + 0.6);
    box(cat, M.steelDark, 0.9, 0.6, 0.9, 0, 1.7, CAT_RIG.BACK + 0.6);
    const car = new THREE.Group();
    car.position.set(0, 0, CAT_RIG.A);
    car.userData.dynamic = true;
    cat.add(car);
    box(car, M.steelDark, 1.6, 0.36, 1.6, 0, 1.35, 0);
    box(car, M.steel, 1.7, 0.2, 0.5, 0, 1.15, -0.8);
    const plane = kingfisher(car, 0, CAT_RIG.PLANE_Y - 0.35, CAT_RIG.PLANE_Z, 0, { spin: true });
    cats.push({ group: cat, car, plane, prop: plane.userData.prop, sgn, base });
  }
  g.userData.catapults = cats;
}

// ------------------------------------------------------------ her armour --

/**
 * Her armour, as structure inside the ship: none of it to be seen while her
 * plating is whole, all of it when a shell has opened her up. The Brooklyns
 * were the first American cruisers built with an armoured box round their
 * machinery and their magazines both, inside a narrow belt:
 *
 *   the belt          five and five-eighths inches over her machinery and
 *                     her forward magazines, tapering under her waterline
 *   the armour deck   two inches over the belt
 *   the bulkheads     that close the citadel at both ends
 *   her after box     three-quarters of an inch less round her after
 *                     magazines, inside her side
 *   the barbettes     of her five turrets, six inches, down to her armour
 *                     deck
 */
const CITADEL = [-38, 63];
const AFTER_BOX = [-64, -38];
const ARMOUR_DECK = 3.3;
const BELT_FOOT = -2.0;

function armour(g) {
  const inside = (o) => { o.userData.inside = true; return o; };
  const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
  const N = 40;
  const box3 = (z0, z1, top, foot, inset) => {
    const side = strip();
    for (let i = 0; i < N; i++) {
      const za = z0 + ((z1 - z0) * i) / N;
      const zb = z0 + ((z1 - z0) * (i + 1)) / N;
      for (const sgn of [-1, 1]) {
        side.quad([sgn * at(za, top, inset), top, za], [sgn * at(za, foot, inset), foot, za],
          [sgn * at(zb, foot, inset), foot, zb], [sgn * at(zb, top, inset), top, zb],
          [-sgn, 0, 0]);
      }
    }
    inside(side.mesh(g, M.armour));
    for (const up of [true, false]) {
      inside(sheet(g, M.armour, z0, z1, (z) => at(z, top, inset), () => top + (up ? 0.05 : -0.05), 24, up));
    }
    for (const z of [z0, z1]) {
      const bh = strip();
      const ys = [];
      for (let y = foot; y < top; y += 1.0) ys.push(y);
      ys.push(top);
      for (let i = 0; i < ys.length - 1; i++) {
        const wa = at(z, ys[i], inset + 0.3), wb = at(z, ys[i + 1], inset + 0.3);
        for (const face of [1, -1]) {
          bh.quad([-wa, ys[i], z], [wa, ys[i], z], [wb, ys[i + 1], z], [-wb, ys[i + 1], z], [0, 0, face]);
        }
      }
      inside(bh.mesh(g, M.armour));
    }
  };
  // The belt and its deck over her machinery and her forward magazines.
  box3(CITADEL[0], CITADEL[1], ARMOUR_DECK, BELT_FOOT, 0.4);
  // And the box round her after magazines, inside her side.
  box3(AFTER_BOX[0], AFTER_BOX[1], 0.8, -4.0, 2.2);
  // Her barbettes, from under the deck each turret stands on down to her
  // armour deck: the trunk every shell and every charge comes up.
  for (const s of MOUNT_SEATS.main) {
    const top = s.y - 0.3;
    if (top <= ARMOUR_DECK) continue;
    inside(cyl(g, M.armour, 3.1, 3.1, top - ARMOUR_DECK, s.x, (top + ARMOUR_DECK) / 2, s.z, 24));
  }
}

// --------------------------------------------------------------- screws --

// Her four screws, each as the model drew it, on the end of its shaft: the
// wing pair forward and the inner pair further aft.
let screwGeo = null;
function screws(g) {
  if (!screwGeo) screwGeo = SCREWS.map((s) => decodePiece(s.piece));
  SCREWS.forEach((s, i) => {
    const hub = new THREE.Group();
    hub.position.set(s.x, s.y, s.z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand: s.x < 0 ? -1 : 1 };
    hub.add(new THREE.Mesh(screwGeo[i], brooklynMaterials().sheet));
    g.add(hub);
  });
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['hullModel', buildBrooklynHull],
  ['aviation', aviation],
  ['armour', armour],
  ['screws', screws],
];

export function buildBrooklyn() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'brooklyn';
  // Her catapults. She carries her own launch: the scene only tells her when
  // the order was given, and she knows what a launch looks like.
  fitCatapults(g, {
    cats: g.userData.catapults, rig: CAT_RIG, deckY: CAT_DECK,
    catX: CAT_X, catZ: CAT_Z, run: CLS.planes.deckRun, aero: 'kingfisher',
  });
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function brooklynParts() {
  const parts = [];
  const builders = [...STATIC, ['mainBattery', mainBattery], ['mountings', mountings]];
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
