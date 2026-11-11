// HMS Agincourt, drawn from the owner's model of her.
//
// Two hundred and five metres of British dreadnought, and more turrets than
// any battleship ever built: fourteen 12-inch guns in seven twin turrets, all
// on her centreline -- Sunday to Saturday, as her crew named them -- twenty
// 6-inch along her sides, and ten 3-inch. She was laid down for Brazil as the
// Rio de Janeiro, sold on the stocks to the Ottoman Empire as the Sultan
// Osman I, and seized for the Royal Navy in August 1914 the day before she
// was to sail; she fought at Jutland with the 1st Battle Squadron, and her
// full broadside, it was said, looked like a battlecruiser blowing up.
//
// Her hull, her two tripods, her funnels, her flying deck and her boats are
// the model -- "HMS Agincourt (1913)" by kriss50 (https://skfb.ly/ptuBZ),
// under Creative Commons Attribution 4.0 -- (see agincourtHull.js and
// build/prepare-agincourt-hull.mjs). What is built here is everything that
// moves or fires:
//
//   * her seven turrets, the model's gunhouses on their barbettes, their
//     barrels on a cradle that elevates;
//   * her twenty 6-inch in their casemates, ten a side, which the model leaves
//     out and the build makes;
//   * her ten 3-inch, the model's own;
//   * her three submerged 21-inch tubes, one either beam forward and one in
//     her stern;
//   * her four screws, which turn;
//
// and, inside her, her armour and her interior, fitted to her own lines.
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, starboard is -X,
// y = 0 is the waterline.

import * as THREE from '../../../vendor/three.module.js';
import { arm } from './mounts.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { lightMounts } from '../../../shared/sim.js';
import { cyl, strip, sheet } from './shipkit.js';
import { fitTubes } from './tubes.js';
import { bowTube } from './rnguns.js';
import {
  buildAgincourtHull, agincourtSurfaceY, agincourtSeatY, MOUNT_SEATS, SCULPT_LINES, agincourtMaterials, gunPiece,
} from './agincourtHull.js';
import { AGINCOURT_SCREWS } from './agincourtHull.data.js';
import { decodePiece } from './sculpt.js';

const CLS = SHIP_CLASSES.agincourt;
export const LOA = CLS.hull.length;      // 204.7 m
export const BEAM = CLS.hull.beam;       // 27.1 m
export const DRAFT = CLS.hull.draft;     // 8.2 m

const P = {
  armour: 0x4a5158,
  steel: 0x6f757b,
  gunDark: 0x2c3035,
};

const MATS = {};
function mat(color) {
  if (!MATS[color]) MATS[color] = new THREE.MeshLambertMaterial({ color });
  return MATS[color];
}
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

// ------------------------------------------------------------- her lines --
//
// Off the model, a metre at a time along her (see the build script): her
// keel, the deck over her insides, and how far out her side is at every half
// metre of height. They are what her interior is fitted under and what the
// fleet's checks feel her plating over.

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
  // Beyond her ends there is no keel; the nearest station that has one.
  const a = L.keel[i] > 50 ? L.keel[Math.min(L.nz - 1, i + 1)] : L.keel[i];
  const b = L.keel[Math.min(L.nz - 1, i + 1)] > 50 ? a : L.keel[Math.min(L.nz - 1, i + 1)];
  const u = f - i;
  return a * (1 - u) + b * u;
}
/**
 * The deck over her insides at station t: the lowest deck anywhere across
 * her there with open air over it.
 */
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
/** How far her inner bottom stands over her keel, which her insides stand on. */
const INNER_BOTTOM = 0.15;
/** Where her deck is at (0, z): her own surface on the centreline. */
export const deckAt = (z) => agincourtSurfaceY(0, z);

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
  m.add(new THREE.Mesh(piece.house, agincourtMaterials().sheet));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  cradle.rotation.x = -piece.pitch;
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, agincourtMaterials().sheet));
  m.add(cradle);
  arm(m, cradle, piece.muzzles);
  g.add(m);
  return m;
}

/**
 * Where a mounting of her datasheet stands: the seat the build measured for
 * the model's own gun there, by where it is -- or, for a gun she carries that
 * the model does not (`added`), her deck under it.
 */
function seatFor(kinds, spec, what, id) {
  if (spec.added) return { x: spec.x, z: spec.z, y: agincourtSeatY(spec.x, spec.z, spec.foot || 1.2) + (spec.up || 0) };
  let best = null, bd = Infinity;
  for (const k of kinds) {
    for (const s of MOUNT_SEATS[k]) {
      const d = Math.hypot(s.x - spec.x, s.z - spec.z);
      if (d < bd) { bd = d; best = s; }
    }
  }
  if (!best || bd > 0.6) throw new Error(`the ${id} has a ${what} at ${spec.x}, ${spec.z} her model does not`);
  return best;
}

const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);

function mainBattery(g, cls = CLS) {
  const turrets = cls.turrets.map((t) => {
    const kind = t.piece || 'main';
    const s = seatFor([kind], t, 'turret', cls.id);
    return sculpted(g, kind, s.x, s.y, s.z, t.angle, cls.gun.traverse, t.name);
  });
  g.userData.turrets = turrets;
  return turrets;
}

function mountings(g, cls = CLS) {
  // Her 6-inch, each in its casemate, trained by the bearing the simulation
  // gives it, in her own frame.
  const sec = cls.secondary.mounts.map((spec) => {
    const s = seatFor(['cas'], spec, '6-inch casemate', cls.id);
    return sculpted(g, 'cas', s.x, s.y, s.z, stowed(spec), cls.secondary.traverse);
  });
  // The light battery, laid by the scene: each carries its own arc and stops
  // off her datasheet (see ShipView.layMounts).
  const aa = [];
  const lights = lightMounts(cls);
  for (const gun of cls.aa.guns) {
    for (const spec of gun.mounts) {
      const kind = spec.piece || gun.piece;
      const s = seatFor([kind], spec, `${gun.caliber} mm`, cls.id);
      const a = sculpted(g, kind, s.x, s.y, s.z, stowed(spec), 0.9);
      a.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
      a.userData.stops = gun.elev || null;
      // And how high its barrels have to be to clear her, bearing by bearing.
      a.userData.lift = spec.lift || null;
      aa.push(a);
    }
  }
  if (aa.length !== lights.length) throw new Error(`the ${cls.id} built a light battery her datasheet does not list`);
  // Her submerged tubes, and the doors they fire through. Built into her:
  // each stays on its own line whatever gyro angle its fish is set to.
  const torp = cls.torpedoes.mounts.map((spec) => {
    const t = bowTube(g, M, spec.x, spec.my, spec.z, spec.angle, tubeLength(spec) - 1.5);
    t.userData.rest = 0;
    t.userData.laid = false;
    return t;
  });
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  g.userData.torpMounts = torp;
  return { sec, aa, torp };
}

/**
 * How far from its breech a submerged tube runs before it reaches her side:
 * along its own bearing, to where her plating is at the height of the tube.
 */
function tubeLength(m) {
  const dx = Math.sin(m.angle), dz = Math.cos(m.angle);
  for (let s = 0.5; s < 40; s += 0.05) {
    const x = m.x + dx * s, z = m.z + dz * s;
    if (Math.abs(x) >= shellAt((2 * z) / LOA, m.my) - 0.05 || Math.abs(z) > LOA / 2) return s;
  }
  return 6;
}

// ------------------------------------------------------------ her armour --

/**
 * Her armour, as structure inside the ship: none of it to be seen while her
 * plating is whole, all of it when a shell has opened her up.
 *
 *   the belt          nine inches over her machinery and magazines, from her
 *                     first barbette to her last, from her main deck down
 *                     under her waterline -- thin for a dreadnought: she was
 *                     built for a navy that wanted guns more than armour
 *   the armour deck   at the top of it
 *   the bulkheads     that close it at both ends
 *   the barbettes     of her turrets, down to the armour deck
 */
const CITADEL = [-72, 64];
const ARMOUR_DECK = 1.8;
const BELT_FOOT = -2.4;
const BARBETTE_R = 4.4;

function armour(g, cls = CLS) {
  const inside = (o) => { o.userData.inside = true; return o; };
  const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
  const N = 96;
  const [z0, z1] = CITADEL;
  const belt = strip();
  for (let i = 0; i < N; i++) {
    const za = z0 + ((z1 - z0) * i) / N;
    const zb = z0 + ((z1 - z0) * (i + 1)) / N;
    for (const sgn of [-1, 1]) {
      belt.quad([sgn * at(za, ARMOUR_DECK, 0.6), ARMOUR_DECK, za], [sgn * at(za, BELT_FOOT, 0.6), BELT_FOOT, za],
        [sgn * at(zb, BELT_FOOT, 0.6), BELT_FOOT, zb], [sgn * at(zb, ARMOUR_DECK, 0.6), ARMOUR_DECK, zb],
        [-sgn, 0, 0]);
    }
  }
  inside(belt.mesh(g, M.armour));
  for (const up of [true, false]) {
    inside(sheet(g, M.armour, z0, z1, (z) => at(z, ARMOUR_DECK, 0.6), () => ARMOUR_DECK + (up ? 0.1 : -0.1), 72, up));
  }
  for (const z of [z0, z1]) {
    const bh = strip();
    const ys = [];
    for (let y = BELT_FOOT; y < ARMOUR_DECK; y += 1.0) ys.push(y);
    ys.push(ARMOUR_DECK);
    for (let i = 0; i < ys.length - 1; i++) {
      const wa = at(z, ys[i], 0.9), wb = at(z, ys[i + 1], 0.9);
      for (const face of [1, -1]) {
        bh.quad([-wa, ys[i], z], [wa, ys[i], z], [wb, ys[i + 1], z], [-wb, ys[i + 1], z], [0, 0, face]);
      }
    }
    inside(bh.mesh(g, M.armour));
  }
  for (const t of cls.turrets) {
    const top = agincourtSeatY(t.x, t.z, 2) - 0.3;
    inside(cyl(g, M.armour, BARBETTE_R, BARBETTE_R, top - ARMOUR_DECK, t.x, (top + ARMOUR_DECK) / 2, t.z, 32));
  }
}

// --------------------------------------------------------------- screws --

// Her four screws, each as the model drew it.
let screwGeo = null;
function screws(g) {
  if (!screwGeo) screwGeo = AGINCOURT_SCREWS.map((s) => decodePiece(s.piece));
  AGINCOURT_SCREWS.forEach((s, i) => {
    const hub = new THREE.Group();
    hub.position.set(s.x, s.y, s.z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand: s.x < 0 ? -1 : 1 };
    hub.add(new THREE.Mesh(screwGeo[i], agincourtMaterials().sheet));
    g.add(hub);
  });
}

// ---------------------------------------------------------------- build ----

const staticOf = (cls) => [
  ['hullModel', buildAgincourtHull],
  ['armour', (g) => armour(g, cls)],
  ['screws', screws],
];

/** The Agincourt, armed off her datasheet. */
export function buildAgincourt() {
  const cls = CLS;
  const g = new THREE.Group();
  for (const [, build] of staticOf(cls)) build(g);
  // Her insides stand on her inner bottom, a hand's breadth over her keel
  // plate.
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g, cls);
  mountings(g, cls);
  // And inside every part of her that moves, after her batteries are on her.
  mergeMoving(g);
  g.userData.classId = 'agincourt';
  // Her tubes fire on the simulation's clock.
  g.userData.step = fitTubes(g, g.userData.torpMounts, cls.torpedoes);
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
    torpMounts: g.userData.torpMounts || [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function agincourtParts() {
  const cls = CLS;
  const parts = [];
  const builders = [...staticOf(cls), ['mainBattery', (g) => mainBattery(g, cls)], ['mountings', (g) => mountings(g, cls)]];
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
