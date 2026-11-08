// The Russian destroyer Sovremenny, drawn from the owner's model of her.
//
// A destroyer of the missile age armed as the owner asked: a twin AK-130
// 130 mm gun forward and another aft, for surface fire; four AK-630
// six-barrelled close-in guns, two on the sponsons either side of her bridge
// and two abreast her funnel, which stop missiles as well as aeroplanes; two
// RBU-1000 rocket launchers either side of her hangar, which throw their bombs
// at ships, at submarines and at torpedoes coming at her; eight P-270 Moskit
// anti-ship missiles in two quadruple launchers abreast her bridge; two 3S90
// Uragan single-arm launchers for her surface-to-air missiles; and two twin
// 533 mm tubes in her waist for TEST-71ME homing torpedoes.
//
// Her hull and superstructure are the model -- "Sovremenny-class destroyer"
// by SB-129 (https://skfb.ly/pBN6X), under Creative Commons Attribution 4.0
// -- (see sovremennyHull.js and build/prepare-sovremenny-hull.mjs); her guns
// and her RBUs are the model's own, her Moskit and Uragan launchers are drawn
// on her by the model and her missiles leave from where the model puts their
// mouths. What is built here is everything that moves or fires:
//
//   * her two AK-130s, the model's gunhouses on their rings, their barrels on
//     a cradle that elevates;
//   * her four AK-630s and her two RBU-1000s, which train whole;
//   * her two twin torpedo tubes, which the model does not draw: built here,
//     fixed on her waist deck, pointing forward and out over her side;
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
  buildSovremennyHull, sovremennySurfaceY, MOUNT_SEATS, SCULPT_LINES, sovremennyMaterials, gunPiece,
} from './sovremennyHull.js';
import { SCREWS } from './sovremennyHull.data.js';
import { decodePiece } from './sculpt.js';

const CLS = SHIP_CLASSES.sovremenny;
export const LOA = CLS.hull.length;
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;

const P = {
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
export const deckAt = (z) => sovremennySurfaceY(0, z);

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
  m.add(new THREE.Mesh(piece.house, sovremennyMaterials().sheet));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  cradle.rotation.x = -piece.pitch;
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, sovremennyMaterials().sheet));
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
  if (!best || bd > 0.6) throw new Error(`the Sovremenny has a ${what} at ${x}, ${z} her model does not`);
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

function mountings(g) {
  const aa = [];
  const lights = lightMounts(CLS);
  for (const gun of CLS.aa.guns) {
    for (const spec of gun.mounts) {
      const s = seatFor(MOUNT_SEATS[gun.piece], spec.x, spec.z, `${gun.caliber} mm`);
      // An AK-630 slews like nothing else aboard: well over a hundred degrees
      // a second.
      const a = sculpted(g, gun.piece, s.x, s.y, s.z, stowed(spec), 2.4);
      a.userData.ciws = !!gun.ciws;
      a.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = spec.lift || null;
      aa.push(a);
    }
  }
  if (aa.length !== lights.length) throw new Error('the Sovremenny built a light battery her datasheet does not list');
  // Her RBU-1000s: each is laid by the simulation, by her own fire control or
  // by whoever has gone down to it (see stepRbu), held on the bearing it last
  // fired on, and goes back to where it is stowed.
  const rbu = CLS.rbu.mounts.map((spec, i) => {
    const s = seatFor(MOUNT_SEATS.rbu, spec.x, spec.z, 'RBU-1000');
    const m = sculpted(g, 'rbu', s.x, s.y, s.z, stowed(spec), CLS.rbu.traverse, `RBU ${i + 1}`);
    m.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
    return m;
  });
  const torp = CLS.torpedoes.mounts.map((spec) => torpedoTubes(g, spec));
  g.userData.secMounts = [];
  g.userData.aaMounts = aa;
  g.userData.rbuMounts = rbu;
  g.userData.torpMounts = torp;
  return { sec: [], aa, rbu, torp };
}

// Her tubes, which the model does not draw: two 533 mm tubes side by side in
// a cradle on a low pedestal, painted her grey.
const TUBE = { len: 7.6, r: 0.36, gap: 0.33, pedestal: 0.55 };
let tubeGeo = null;
function tubeGeometry() {
  if (tubeGeo) return tubeGeo;
  const barrel = new THREE.CylinderGeometry(TUBE.r, TUBE.r, TUBE.len, 16, 1, false);
  barrel.rotateX(Math.PI / 2);
  // The breech door and the muzzle ring, a little proud of the tube.
  const ring = new THREE.CylinderGeometry(TUBE.r * 1.12, TUBE.r * 1.12, 0.22, 16);
  ring.rotateX(Math.PI / 2);
  const cradle = new THREE.BoxGeometry(TUBE.gap * 2 + TUBE.r * 2.2, 0.35, TUBE.len * 0.55);
  const pedestal = new THREE.CylinderGeometry(0.55, 0.75, TUBE.pedestal, 16);
  tubeGeo = { barrel, ring, cradle, pedestal };
  return tubeGeo;
}
const TUBE_MAT = new THREE.MeshLambertMaterial({ color: 0x6f7377 });
const TUBE_DARK = new THREE.MeshLambertMaterial({ color: 0x3d4044 });

/**
 * One of her twin tubes, fixed on her waist deck at the bearing its datasheet
 * gives, pointing forward and out over her side. Nothing trains: the fish is a
 * homing one, run out on the tube's line and turned onto its target by its own
 * seeker (see stepTorpedoes). Its muzzles are the forward ends of its tubes.
 */
function torpedoTubes(g, spec) {
  const G = tubeGeometry();
  const y = sovremennySurfaceY(spec.x, spec.z);
  const m = new THREE.Group();
  m.position.set(spec.x, y, spec.z);
  m.rotation.y = spec.angle;
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.fixed = true;
  m.userData.name = `${spec.x > 0 ? 'port' : 'starboard'} tubes`;
  m.userData.trainRate = 0;
  const ped = new THREE.Mesh(G.pedestal, TUBE_DARK);
  ped.position.y = TUBE.pedestal / 2;
  m.add(ped);
  const axis = TUBE.pedestal + 0.18 + TUBE.r;
  const cradleMesh = new THREE.Mesh(G.cradle, TUBE_DARK);
  cradleMesh.position.y = TUBE.pedestal + 0.18;
  m.add(cradleMesh);
  const bores = [];
  for (const x of [-TUBE.gap, TUBE.gap]) {
    const b = new THREE.Mesh(G.barrel, TUBE_MAT);
    b.position.set(x, axis, 0);
    m.add(b);
    for (const z of [-TUBE.len / 2, TUBE.len / 2]) {
      const r = new THREE.Mesh(G.ring, TUBE_DARK);
      r.position.set(x, axis, z);
      m.add(r);
    }
    bores.push([x, axis, -TUBE.len / 2, TUBE.len / 2]);
  }
  const cradle = new THREE.Group();
  cradle.position.set(0, axis, 0);
  m.add(cradle);
  arm(m, cradle, bores.map(([x, , , zm]) => [x, 0, zm]));
  m.userData.bores = bores;
  g.add(m);
  return m;
}

// ------------------------------------------------------------ her armour --

/**
 * Her armour, as structure inside the ship: none of it to be seen while her
 * plating is whole, all of it when a shell has opened her up.
 *
 *   the side          splinter plating over her machinery and her magazines,
 *                     from her forward gun's ring to her after one's, from her
 *                     armour deck down a metre and a half under her waterline
 *   the armour deck   at the top of it
 *   the bulkheads     that close it at both ends
 *   the barbettes     of her two AK-130s, down to the armour deck
 */
const CITADEL = [-50, 44];
const ARMOUR_DECK = 2.0;
const BELT_FOOT = -1.5;
const BARBETTE_R = 2.0;

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
    hub.add(new THREE.Mesh(screwGeo[i], sovremennyMaterials().sheet));
    g.add(hub);
  });
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['hullModel', buildSovremennyHull],
  ['armour', armour],
  ['screws', screws],
];

export function buildSovremenny() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'sovremenny';
  g.userData.step = fitTubes(g, g.userData.torpMounts, CLS.torpedoes);
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
    torpMounts: g.userData.torpMounts || [],
    rbuMounts: g.userData.rbuMounts || [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function sovremennyParts() {
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
