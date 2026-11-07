// The anti-aircraft light cruiser USS Ticonderoga, drawn from the owner's model
// of her.
//
// A light cruiser armed as the owner asked: six single Mk 71 203 mm guns,
// three forward and three aft, each three superfiring one over the next; six
// 76 mm dual-purpose singles, three a side, the gun the Leviathan carries; one
// Phalanx close-in weapon system on her centreline before her bridge; and a
// quintuple torpedo launcher a side abreast her after superstructure.
//
// Her hull and superstructure are the model -- "US CLAA Ticonderoga" by 全斗焕
// (https://skfb.ly/oHFAG), under Creative Commons Attribution 4.0 -- (see
// ticonderogaHull.js and build/prepare-ticonderoga-hull.mjs); every gun and
// launcher of hers is the model's own, but for her Phalanx, which the model
// draws far too finely to keep and which is the owner's own model of one
// (build/prepare-phalanx.mjs), as the Missouri's are. What is built here is
// everything that moves or fires:
//
//   * her six Mk 71 singles, the model's gunhouses on their rings, their
//     barrels on a cradle that elevates;
//   * her six 76 mm singles and her Phalanx;
//   * her two quintuple torpedo launchers, which train out over her side and
//     fire;
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
import {
  buildTiconderogaHull, ticonderogaSurfaceY, MOUNT_SEATS, SCULPT_LINES, ticonderogaMaterials, gunPiece,
} from './ticonderogaHull.js';
import { SCREWS } from './ticonderogaHull.data.js';
import { decodePiece } from './sculpt.js';
import { PHALANX } from './phalanx.data.js';

const CLS = SHIP_CLASSES.ticonderoga;
export const LOA = CLS.hull.length;
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;

const P = {
  phalanxGrey: 0x9aa0a6,
  armour: 0x4a5158,
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
export const deckAt = (z) => ticonderogaSurfaceY(0, z);

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
  m.add(new THREE.Mesh(piece.house, ticonderogaMaterials().sheet));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  cradle.rotation.x = -piece.pitch;
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, ticonderogaMaterials().sheet));
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
  if (!best || bd > 0.6) throw new Error(`the Ticonderoga has a ${what} at ${x}, ${z} her model does not`);
  return best;
}

function mainBattery(g) {
  const turrets = CLS.turrets.map((t) => {
    const s = seatFor(MOUNT_SEATS.main, t.x, t.z, 'turret');
    return sculpted(g, 'main', s.x, s.y, s.z, t.angle, CLS.gun.traverse, t.name);
  });
  g.userData.turrets = turrets;
  return turrets;
}

const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);

/**
 * A Phalanx Mk 15, the owner's own model of it (build/prepare-phalanx.mjs):
 * on a square pedestal 1.25 m high, the turntable and its yoke, which train,
 * and between the yoke's arms what elevates -- the radome, the six-barrelled
 * gun under it and the drum that feeds it. It trains and elevates faster
 * than anything else aboard.
 */
let phalanxGeo = null;
function phalanx(g, x, y, z, rest) {
  const piece = gunPiece('ciws');
  if (!phalanxGeo) phalanxGeo = { house: decodePiece(PHALANX.house), guns: decodePiece(PHALANX.guns) };
  // The pedestal, which does not train.
  box(g, M.phalanxGrey, 2.3, 1.25, 2.3, x, y + 0.62, z);
  const m = new THREE.Group();
  m.position.set(x, y + 1.25, z);
  m.rotation.y = rest;
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = 2.4;
  m.add(new THREE.Mesh(phalanxGeo.house, ticonderogaMaterials().sheet));
  const cradle = new THREE.Group();
  cradle.position.set(0, piece.trunnion[1] - 1.25, 0);
  cradle.add(new THREE.Mesh(phalanxGeo.guns, ticonderogaMaterials().sheet));
  m.add(cradle);
  arm(m, cradle, piece.muzzles.map(([mx, my, mz]) => [mx, my, mz]));
  g.add(m);
  return m;
}

function mountings(g) {
  const sec = CLS.secondary.mounts.map((spec) => {
    const s = seatFor(MOUNT_SEATS.dp, spec.x, spec.z, '76 mm single');
    const m = sculpted(g, 'dp', s.x, s.y, s.z, stowed(spec), CLS.secondary.traverse);
    m.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
    return m;
  });
  const aa = [];
  const lights = lightMounts(CLS);
  for (const gun of CLS.aa.guns) {
    const kind = gun.piece;
    for (const spec of gun.mounts) {
      const s = seatFor(MOUNT_SEATS[kind], spec.x, spec.z, `${gun.caliber} mm`);
      // A Phalanx is built at its own size (see phalanx), and slews like
      // nothing else aboard: well over a hundred degrees a second.
      const a = phalanx(g, s.x, s.y, s.z, stowed(spec));
      a.userData.ciws = true;
      a.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = spec.lift || null;
      aa.push(a);
    }
  }
  if (aa.length !== lights.length) throw new Error('the Ticonderoga built a light battery her datasheet does not list');
  const torp = CLS.torpedoes.mounts.map((spec) => torpedoBank(g, spec, CLS.torpedoes.traverse));
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  g.userData.torpMounts = torp;
  return { sec, aa, torp };
}

/**
 * One of her quintuple torpedo launchers, as the model drew it (see
 * gunPiece): it trains about its middle, its five tubes level, and its
 * muzzles are the ends of its tubes. Her two launchers are each other's
 * mirror, and each is its own piece.
 */
function torpedoBank(g, spec, trainRate) {
  const i = MOUNT_SEATS.tubes.indexOf(seatFor(MOUNT_SEATS.tubes, spec.x, spec.z, 'torpedo launcher'));
  const s = MOUNT_SEATS.tubes[i];
  const piece = gunPiece(`tubes${i}`);
  const m = new THREE.Group();
  m.position.set(s.x, s.y, s.z);
  m.rotation.y = stowed(spec);
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.name = `${spec.x > 0 ? 'port' : 'starboard'} tubes`;
  m.userData.trainRate = trainRate;
  m.add(new THREE.Mesh(piece.house, ticonderogaMaterials().sheet));
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
 *   the belt          five inches, from her forward gun's ring to her after
 *                     one's, from her armour deck down two and a half metres
 *                     under her waterline
 *   the armour deck   at the top of the belt
 *   the bulkheads     that close the citadel at both ends
 *   the barbettes     of her six guns, down to the armour deck
 */
const CITADEL = [-60, 62];
const ARMOUR_DECK = 3.0;
const BELT_FOOT = -2.5;
const BARBETTE_R = 2.6;

function armour(g) {
  const inside = (o) => { o.userData.inside = true; return o; };
  const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
  const N = 72;
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
    inside(sheet(g, M.armour, z0, z1, (z) => at(z, ARMOUR_DECK, 1.0), () => ARMOUR_DECK + (up ? 0.1 : -0.1), 56, up));
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
    hub.add(new THREE.Mesh(screwGeo[i], ticonderogaMaterials().sheet));
    g.add(hub);
  });
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['hullModel', buildTiconderogaHull],
  ['armour', armour],
  ['screws', screws],
];

export function buildTiconderoga() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'ticonderoga';
  g.userData.step = fitTubes(g, g.userData.torpMounts, CLS.torpedoes);
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
    torpMounts: g.userData.torpMounts || [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function ticonderogaParts() {
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
