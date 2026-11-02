// HMS Hood, drawn from the owner's sculpts of her.
//
// Two hundred and sixty-two metres and forty-two thousand tonnes: the
// largest warship in the world for twenty years, a battlecruiser fast enough
// to catch anything that could fight her and armed to fight anything that
// could catch her. Eight 15-inch in four twin turrets, two forward and two
// aft; twelve 5.5-inch, six a side, along her superstructure; her pom-poms
// abreast her bridge and her mainmast; and two submerged 21-inch tubes in her
// bow.
//
// Her hull and superstructure are the sculpts (see hoodHull.js and
// build/prepare-hood-hull.mjs); every one of her guns is a sculpt. What is
// built here is everything that moves or fires:
//
//   * her four 15-inch turrets, the sculpt's own gunhouse on a barbette, its
//     barrels on a cradle that elevates -- A and B forward, B superfiring;
//     X and Y aft, facing astern, X superfiring;
//   * her twelve 5.5-inch in their shields, six a side: one abreast her
//     bridge, four in the bays under her shelter deck and one on it;
//   * her five quadruple pom-poms, in the tubs abreast her bridge and her
//     mainmast, and on her centreline on a bandstand on her after deck;
//   * her two submerged tubes, in her bow, and the doors in her side they
//     fire through;
//   * her four screws, which turn;
//
// and, inside her, her armour and her interior, fitted to her own lines.
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, y = 0 is the
// waterline, and starboard is -X.

import * as THREE from '../../../vendor/three.module.js';
import { arm } from './mounts.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { lightMounts } from '../../../shared/sim.js';
import { box, cyl, strip, sheet } from './shipkit.js';
import { fitTubes } from './tubes.js';
import { bowTube } from './rnguns.js';
import {
  buildHoodHull, hoodSurfaceY, MOUNT_SEATS, SCULPT_LINES, hoodMaterials, gunPiece,
} from './hoodHull.js';
import { SCREWS } from './hoodHull.data.js';

const CLS = SHIP_CLASSES.hood;
export const LOA = CLS.hull.length;
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;

// Her own paints, for everything built here: Home Fleet grey on her guns and
// her fittings.
const P = {
  steel: 0x7a8289,
  steelDark: 0x5a6168,
  gun: 0x737b82,
  gunDark: 0x40464c,
  armour: 0x4a5158,
  brass: 0x8a7340,
  glass: 0x25303a,
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
/** The deck over her insides at station t: her forecastle deck, and her quarterdeck abaft it. */
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
export const deckAt = (z) => hoodSurfaceY(0, z);

// ---------------------------------------------------------- main battery --

// Each of her 15-inch turrets trains on a barbette nine and a half metres
// across: the drum the sculpt stood it on.
const BARBETTE_R = 4.8;

/**
 * A mounting off one of the owner's sculpts of it (see gunPiece): what trains
 * stands at `y`, faces `rest`, and carries its barrels on a cradle about
 * their trunnions.
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
  m.add(new THREE.Mesh(piece.house, hoodMaterials().plating));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, M.gun));
  m.add(cradle);
  arm(m, cradle, piece.muzzles);
  g.add(m);
  return m;
}

function mainBattery(g) {
  const turrets = MOUNT_SEATS.turrets.map((spec) => sculpted(g, 'main', spec.x, spec.seat, spec.z, spec.rest, CLS.gun.traverse, spec.name));
  g.userData.turrets = turrets;
  return turrets;
}

/** The barbettes her turrets train on, from her deck up. */
function barbettes(g) {
  for (const t of MOUNT_SEATS.turrets) {
    const foot = t.deck - 0.3;
    const top = t.seat - 0.02;
    cyl(g, M.steel, BARBETTE_R, BARBETTE_R, top - foot, t.x, (top + foot) / 2, t.z, 48);
    // The roller path's lip at its top, and the coaming round its foot where
    // it goes through her deck.
    cyl(g, M.steelDark, BARBETTE_R + 0.08, BARBETTE_R + 0.08, 0.16, t.x, top - 0.08, t.z, 48);
    cyl(g, M.steelDark, BARBETTE_R + 0.2, BARBETTE_R + 0.2, 0.4, t.x, foot + 0.32, t.z, 48);
  }
}

// ------------------------------------------------------ her 5.5-inch -----

/** Each 5.5-inch seat, port and starboard, in the order her datasheet lists them. */
function secondarySeats() {
  return MOUNT_SEATS.secondary.flatMap((s) => [s, { ...s, x: -s.x, rest: -s.rest }]);
}

/** The ring each 5.5-inch trains on, a hand proud of the deck it stands on. */
function secondaryRings(g) {
  for (const s of secondarySeats()) cyl(g, M.steelDark, 1.25, 1.35, 0.12, s.x, s.y + 0.04, s.z, 24);
}

// ------------------------------------------------ the light guns and tubes --

const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);
const nearest = (list, x, z) => list.reduce((a, b) => (Math.hypot(b.x - Math.abs(x), b.z - z) < Math.hypot(a.x - Math.abs(x), a.z - z) ? b : a));

/**
 * How far from its breech a submerged tube runs before it reaches her side:
 * along its own bearing, to where her plating is at the height of the tube.
 */
function tubeLength(m) {
  const dx = Math.sin(m.angle), dz = Math.cos(m.angle);
  for (let s = 0.5; s < 30; s += 0.05) {
    const x = m.x + dx * s, z = m.z + dz * s;
    if (Math.abs(x) >= shellAt((2 * z) / LOA, m.my) - 0.05) return s;
  }
  return 6;
}

/**
 * The sluice door each tube fires through: a round plate let into her side
 * three and a half metres under the water, lying on her plating where the
 * tube's line comes out through it -- her bow is fine there, and a door
 * square to the tube would stand half out of her.
 */
function tubeDoors(g) {
  for (const m of CLS.torpedoes.mounts) {
    const s = tubeLength(m);
    const x = m.x + Math.sin(m.angle) * s, z = m.z + Math.cos(m.angle) * s;
    // Her side there, and the way it faces: out, and as far forward as she
    // narrows towards her stem.
    const t = (2 * z) / LOA, dt = 1 / LOA;
    const lean = (shellAt(t + dt, m.my) - shellAt(t - dt, m.my)) / 1.0;
    const sgn = Math.sign(m.x);
    const yaw = Math.atan2(sgn, -lean);
    // Onto her plating itself: the sculpt is a hand fuller on one bow than
    // the other, so the door is put where a line in along her side's normal
    // meets it.
    const out = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const at = new THREE.Vector3(sgn * shellAt(t, m.my), m.my, z);
    g.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(at.clone().addScaledVector(out, 3), out.clone().negate(), 0, 6);
    const hit = ray.intersectObject(g, true)[0];
    // And turned to it, flare and all: her bow leans out over the door.
    const face = out.clone();
    if (hit && hit.face) {
      face.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      if (face.dot(out) < 0) face.negate();
    }
    if (hit) at.copy(hit.point).addScaledVector(face, 0.015);
    const door = new THREE.Group();
    door.position.copy(at);
    door.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face);
    cyl(door, M.gunDark, 0.62, 0.62, 0.06, 0, 0, 0.0, 20).rotation.x = Math.PI / 2;
    cyl(door, M.glass, 0.44, 0.44, 0.06, 0, 0, 0.02, 20).rotation.x = Math.PI / 2;
    g.add(door);
  }
}

function mountings(g) {
  const sec = [];
  const seats = secondarySeats();
  if (seats.length !== CLS.secondary.mounts.length) throw new Error('the Hood built a secondary battery her datasheet does not list');
  CLS.secondary.mounts.forEach((spec, i) => {
    const s = seats[i];
    const m = sculpted(g, 'sec', spec.x, s.y, spec.z, stowed(spec), CLS.secondary.traverse);
    m.userData.rest = 0;
    m.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
    sec.push(m);
  });
  const aa = [];
  const lights = lightMounts(CLS);
  let k = 0;
  for (const gun of CLS.aa.guns) {
    for (const m of gun.mounts) {
      const seat = nearest(MOUNT_SEATS.pompom, m.x, m.z);
      const a = sculpted(g, 'pompom', m.x, seat.y, m.z, stowed(m), 0.7);
      a.userData.rest = 0;
      a.userData.sector = { angle: m.angle, arc: m.arc, stow: stowed(m) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = m.lift || null;
      aa.push(a);
      k++;
    }
  }
  if (k !== lights.length) throw new Error('the Hood built a light battery her datasheet does not list');
  // Her submerged tubes, in her bow, and the doors they fire through. Built
  // into her: each stays on its own line whatever gyro angle its fish is set
  // to, so the scene leaves it where it is.
  const torp = CLS.torpedoes.mounts.map((spec) => {
    // The tube ends a little inside her plating, so its cap is under it.
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

// ------------------------------------------------------------ her armour --

/**
 * Her armour, as structure inside the ship: none of it to be seen while her
 * plating is whole, all of it when a shell has opened her up.
 *
 *   the belt          12 inches, from A's barbette to Y's, inclined with her
 *                     side, from her main deck down below her waterline
 *   the upper belt    7 inches over it, up to her forecastle deck
 *   the armour deck   over the citadel, closing it at the top of the belt
 *   the bulkheads     that close the citadel at both ends
 *   the barbettes     of her four turrets, 12 inches, down to the armour deck
 */
const CITADEL = [-98, 76];
const ARMOUR_DECK = 2.6;
const UPPER_TOP = 6.6;
const BELT_FOOT = -4.0;

function armour(g) {
  const inside = (o) => { o.userData.inside = true; return o; };
  const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
  const N = 64;
  const [z0, z1] = CITADEL;
  // The upper belt runs up to her deck less a hand: abaft the step down to her
  // quarterdeck that is a good deal under UPPER_TOP, and it must not stand
  // through her deck there.
  const sideDeck = (z) => Math.min(...[-1, 1].map((sgn) => hoodSurfaceY(sgn * (at(z, ARMOUR_DECK, 0) - 1.5), z)));
  const upperTop = (z) => Math.max(ARMOUR_DECK + 0.5, Math.min(UPPER_TOP, sideDeck(z) - 0.6));
  for (const [topOf, foot] of [[() => ARMOUR_DECK, BELT_FOOT], [upperTop, ARMOUR_DECK]]) {
    const belt = strip();
    for (let i = 0; i < N; i++) {
      const za = z0 + ((z1 - z0) * i) / N;
      const zb = z0 + ((z1 - z0) * (i + 1)) / N;
      const ta = topOf(za), tb = topOf(zb);
      for (const sgn of [-1, 1]) {
        belt.quad([sgn * at(za, ta, 0.9), ta, za], [sgn * at(za, foot, 0.9), foot, za],
          [sgn * at(zb, foot, 0.9), foot, zb], [sgn * at(zb, tb, 0.9), tb, zb],
          [-sgn, 0, 0]);
      }
    }
    inside(belt.mesh(g, M.armour));
  }
  for (const up of [true, false]) {
    inside(sheet(g, M.armour, z0, z1, (z) => at(z, ARMOUR_DECK, 0.9), () => ARMOUR_DECK + (up ? 0.1 : -0.1), 48, up));
  }
  for (const z of [z0, z1]) {
    const bh = strip();
    const ys = [];
    for (let y = BELT_FOOT; y < ARMOUR_DECK; y += 1.0) ys.push(y);
    ys.push(ARMOUR_DECK);
    for (let i = 0; i < ys.length - 1; i++) {
      const wa = at(z, ys[i], 1.2), wb = at(z, ys[i + 1], 1.2);
      for (const face of [1, -1]) {
        bh.quad([-wa, ys[i], z], [wa, ys[i], z], [wb, ys[i + 1], z], [-wb, ys[i + 1], z], [0, 0, face]);
      }
    }
    inside(bh.mesh(g, M.armour));
  }
  for (const t of MOUNT_SEATS.turrets) {
    const top = t.deck - 0.3;
    inside(cyl(g, M.armour, BARBETTE_R - 0.1, BARBETTE_R - 0.1, top - ARMOUR_DECK, t.x, (top + ARMOUR_DECK) / 2, t.z, 32));
  }
}

// --------------------------------------------------------------- screws --

// Her four screws, on the ends of her shafts (see prepare-hood-hull.mjs):
// three-bladed, four and a half metres across, and handed; the inner pair's
// shafts carried on aft to them.
function screws(g) {
  for (const s of SCREWS) {
    if (!s.wing) {
      const shaft = cyl(g, M.steelDark, 0.28, 0.28, 9.0, s.x, s.y + 0.15, s.z + 4.5, 12);
      shaft.rotation.x = Math.PI / 2 - 0.035;
    }
    const hub = new THREE.Group();
    hub.position.set(s.x, s.y, s.z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand: Math.sign(s.x) };
    cyl(hub, M.brass, 0.5, 0.38, 1.0, 0, 0, 0, 14).rotation.x = Math.PI / 2;
    cyl(hub, M.brass, 0.38, 0.1, 0.7, 0, 0, -0.8, 12).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const bl = box(hub, M.brass, s.r * 0.55, 0.12, s.r * 1.3,
        Math.sin(a) * s.r * 0.5, Math.cos(a) * s.r * 0.5, 0);
      bl.rotation.z = a;
      bl.rotation.x = 0.4 * Math.sign(s.x);
    }
    g.add(hub);
  }
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['hullModel', buildHoodHull],
  ['barbettes', barbettes],
  ['secondaryRings', secondaryRings],
  ['tubeDoors', tubeDoors],
  ['armour', armour],
  ['screws', screws],
];

export function buildHood() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'hood';
  // Her tubes fire on the simulation's clock.
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
export function hoodParts() {
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
