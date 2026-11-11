// USS Nimitz, CVN-68, drawn from the owner's model of her.
//
// The first of the ten: a hundred thousand tons, two reactors, four screws,
// and three hundred and thirty-three metres of flight deck with its landing
// area angled off to port, four catapults and four lifts at her deck edge.
//
// The numbers everything here is built to:
//
//   length overall     332.8 m           beam at the waterline   40.8 m
//   draught             11.3 m, as the model floats her
//   flight deck         20.1 m over the water, 76.8 m across
//   hangar              one, under the gallery deck
//   battery             2 Phalanx, 4 Mk 29 Sea Sparrow, 2 Mk 49 RAM (the model's)
//   air wing            90: F/A-18C Hornet, E-2D Hawkeye, SH-60 Seahawk
//
// Her hull, her island, her flight deck, her lifts, her sponsons and every
// fitting on her are the model -- "USS NIMITZ CVN-68 AIRCRAFT CARRIER" by
// Muhamad Mirza Arrafi, under Creative Commons Attribution 4.0 -- (see
// build/prepare-nimitz-hull.mjs). Built here:
//
//   * her Phalanx, Sea Sparrow and RAM, each the model's own, each training:
//     a launcher swings onto the bearing of what it is firing at;
//   * her hangar, and her armour and her interior, fitted to her own lines;
//   * her deck cycle: a Hornet or a Hawkeye taxis to a bow catapult and is
//     shot off it, a Seahawk lifts off the deck forward of her island, and
//     coming home each comes down on her deck and is taken below.
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, y = 0 is the
// waterline, and starboard is -X.
import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip, steelMap, woodMap, finish } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { arm } from './mounts.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { DECK_RUN, lightMounts } from '../../../shared/sim.js';
import { box, strip, sheet } from './shipkit.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { f18, e2d, sh60 } from './planekit.js';
import {
  NIMITZ_HULL_B64, NIMITZ_SURFACE, NIMITZ_DECK, NIMITZ_ISLAND, NIMITZ_GUNS, NIMITZ_MOUNTS, NIMITZ_LINES,
} from './nimitzHull.data.js';

const CLS = SHIP_CLASSES.nimitz;
export const LOA = CLS.hull.length;
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;

const P = {
  steel: 0x707880,
  steelDark: 0x4c545c,
  deckSteel: 0x464c52,
  armour: 0x4a5158,
  hangar: 0x8a9096,
  canvas: 0x6b6759,
};
const MATS = {};
function mat(color) {
  if (!MATS[color]) MATS[color] = new THREE.MeshLambertMaterial({ color });
  return MATS[color];
}
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = (k) => { const c = clamp(k, 0, 1); return c * c * (3 - 2 * c); };

// ----------------------------------------------------------- her model --

let slicesCache = null;
const surface = surfaceOf(NIMITZ_SURFACE);
/** Height of her surface at (x, z), or -99 off her. */
export const nimitzSurfaceY = surface.surfaceY;
/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const nimitzSeatY = surface.seatY;
/** Where every one of her mountings stands: see prepare-nimitz-hull.mjs. */
export const MOUNT_SEATS = NIMITZ_MOUNTS;
export { NIMITZ_ISLAND as ISLAND };

let mats = null;
export function nimitzMaterials() {
  if (mats) return mats;
  const plate = steelMap();
  const planks = woodMap();
  mats = {
    plating: new THREE.MeshPhongMaterial({
      vertexColors: true, map: plate, specularMap: plate, specular: 0x3a4148, shininess: 30,
    }),
    deck: new THREE.MeshPhongMaterial({
      vertexColors: true, map: planks, specularMap: planks, specular: 0x16181c, shininess: 5,
    }),
    // What the model drew as single sheets, seen from both sides; and every
    // one of her mountings.
    sheet: new THREE.MeshPhongMaterial({
      vertexColors: true, map: plate, specularMap: plate, specular: 0x3a4148, shininess: 30,
      side: THREE.DoubleSide,
    }),
  };
  finish(mats.plating);
  finish(mats.sheet);
  finish(mats.deck, 'wood');
  return mats;
}

/** Add the model's hull, painted, as its length-wise slices. */
function hullModel(g) {
  if (!slicesCache) slicesCache = decodeSlices(NIMITZ_HULL_B64);
  const m = nimitzMaterials();
  for (const geo of slicesCache) {
    g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }
}

const pieces = new Map();
/**
 * One of her mountings as the model drew it -- 'ciws' her Phalanx, 'sparrow'
 * her Mk 29, 'ram' her Mk 49 -- decoded once, in the frame of its mounting.
 */
export function nimitzGun(kind) {
  if (!pieces.has(kind)) {
    const p = NIMITZ_GUNS[kind];
    pieces.set(kind, { house: decodePiece(p.house), trunnion: p.trunnion, muzzles: p.muzzles, roof: p.roof });
  }
  return pieces.get(kind);
}

// ------------------------------------------------------------- her lines --

const L = NIMITZ_LINES;
const along = (z) => Math.max(0, Math.min(L.nz - 1.0001, (z - L.z0) / L.dz));
/** Her station at fraction t of her length, bow +1, as a z. */
export const zAt = (t) => (t * LOA) / 2;
/** The bottom of her keel at station t. */
export function keelY(t) {
  const f = along(zAt(t));
  const i = Math.floor(f);
  const a = L.keel[i] > 50 ? L.keel[Math.min(L.nz - 1, i + 1)] : L.keel[i];
  const b = L.keel[Math.min(L.nz - 1, i + 1)] > 50 ? a : L.keel[Math.min(L.nz - 1, i + 1)];
  return Math.max(a, b);
}
/** How far out from her centreline her side is, at station t and height y. */
export function shellAt(t, y) {
  const f = along(zAt(t));
  const gy = Math.max(0, Math.min(L.ny - 1.0001, (y - L.y0) / L.dy));
  const i = Math.floor(f);
  const j = Math.floor(gy);
  const u = f - i;
  const v = gy - j;
  const at = (a, b) => L.half[Math.min(L.nz - 1, a) * L.ny + Math.min(L.ny - 1, b)];
  return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v)
    + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
}
/** How far out her plating actually is at (z, y): see the build's `inner`. */
function platingAt(z, y) {
  const I = L.inner;
  const k = Math.round((z - I.z0) / I.dz);
  const j = Math.round((y - I.y0) / I.dy);
  if (k < 0 || k >= I.nz || j < 0 || j >= I.ny) return 0;
  return I.w[k * I.ny + j];
}

// ------------------------------------------------------------ her decks --

/** Her flight deck. */
export const FD = NIMITZ_DECK.y;
/** Her hangar deck, and its deckhead: one hangar, seven and a half metres high. */
export const HANGAR = 12.1;
const HANGAR_TOP = FD - 2.6;
const HANGAR_Z = [-100, 90];
const HANGAR_HW = 14.0;

function hangarHalf(z, y0, y1) {
  let plating = Infinity;
  for (let dz = -3; dz <= 3; dz++) {
    for (let y = y0; y <= y1 + 1e-6; y += 0.5) {
      const w = platingAt(z + dz, y);
      if (w > 0) plating = Math.min(plating, w);
    }
  }
  return Math.max(0.5, Math.min(HANGAR_HW, plating - 1.2));
}

/** Her hangar: its deck, its deckhead, its sides and ends, and its frames. */
function hangar(g) {
  const [z0, z1] = HANGAR_Z;
  const y0 = HANGAR, y1 = HANGAR_TOP;
  const half = (z) => hangarHalf(z, y0 + 0.5, y1);
  const N = 70;
  sheet(g, M.deckSteel, z0, z1, half, () => y0, N).userData.inside = true;
  sheet(g, M.steelDark, z0, z1, half, () => y1, N, false).userData.inside = true;
  for (const out of [1, -1]) {
    const w = strip();
    for (let i = 0; i < N; i++) {
      const za = z0 + ((z1 - z0) * i) / N;
      const zb = z0 + ((z1 - z0) * (i + 1)) / N;
      for (const sgn of [-1, 1]) {
        w.quad([sgn * half(za), y0, za], [sgn * half(za), y1, za],
          [sgn * half(zb), y1, zb], [sgn * half(zb), y0, zb], [sgn * out, 0, 0]);
      }
    }
    const m = w.mesh(g, out > 0 ? M.steel : M.hangar);
    if (m) m.userData.inside = true;
  }
  for (const [z, out] of [[z0, -1], [z1, 1]]) {
    for (const face of [1, -1]) {
      const e = strip();
      const w = half(z);
      e.quad([-w, y0, z], [w, y0, z], [w, y1, z], [-w, y1, z], [0, 0, out * face]);
      const m = e.mesh(g, face > 0 ? M.steel : M.hangar);
      if (m) m.userData.inside = true;
    }
  }
  for (let z = z0 + 4; z < z1 - 2; z += 5) {
    const w = half(z);
    for (const sgn of [-1, 1]) {
      box(g, M.steelDark, 0.3, y1 - y0, 0.4, sgn * (w - 0.17), (y0 + y1) / 2, z).userData.inside = true;
    }
    box(g, M.steelDark, w * 2 - 0.4, 0.34, 0.3, 0, y1 - 0.2, z).userData.inside = true;
  }
  // The fire doors that divide it into its three bays.
  for (const z of [z0 + (z1 - z0) / 3, z0 + (2 * (z1 - z0)) / 3]) {
    const w = half(z) - 0.3;
    box(g, M.canvas, w * 2, 0.6, 0.3, 0, y1 - 0.5, z).userData.inside = true;
  }
}

// ------------------------------------------------------------ her armour --

const CITADEL = [-90, 95];
const ARMOUR_DECK = 4.2;
const BELT_TOP = 3.2;
const BELT_FOOT = -4.5;

function armour(g) {
  const inside = (o) => { if (o) o.userData.inside = true; return o; };
  const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
  const N = 64;
  const [z0, z1] = CITADEL;
  const belt = strip();
  for (let i = 0; i < N; i++) {
    const za = z0 + ((z1 - z0) * i) / N;
    const zb = z0 + ((z1 - z0) * (i + 1)) / N;
    for (const sgn of [-1, 1]) {
      belt.quad([sgn * at(za, BELT_TOP, 1.0), BELT_TOP, za], [sgn * at(za, BELT_FOOT, 1.0), BELT_FOOT, za],
        [sgn * at(zb, BELT_FOOT, 1.0), BELT_FOOT, zb], [sgn * at(zb, BELT_TOP, 1.0), BELT_TOP, zb], [-sgn, 0, 0]);
    }
  }
  inside(belt.mesh(g, M.armour));
  for (const up of [true, false]) {
    inside(sheet(g, M.armour, z0, z1, (z) => at(z, ARMOUR_DECK, 1.2), () => ARMOUR_DECK + (up ? 0.06 : -0.06), 48, up));
  }
}

// ------------------------------------------------------------ her guns --

/**
 * A mounting off the owner's model of it: it trains whole, about its own
 * pivot, its muzzle the middle of its face. `hidden` builds it without its
 * model -- the Phalanx are drawn once, as her battery, and their places in
 * her light battery are the same two mountings.
 */
function sculpted(g, kind, x, y, z, rest, trainRate, name, hidden = false) {
  const piece = nimitzGun(kind);
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = rest;
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = trainRate;
  if (name) m.userData.name = name;
  if (!hidden) m.add(new THREE.Mesh(piece.house, nimitzMaterials().sheet));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  m.add(cradle);
  arm(m, cradle, piece.muzzles);
  g.add(m);
  return m;
}

function seatFor(list, x, z, what) {
  let best = null, bd = Infinity;
  for (const s of list) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) { bd = d; best = s; }
  }
  if (!best || bd > 0.6) throw new Error(`the Nimitz has a ${what} at ${x}, ${z} her model does not`);
  return best;
}
const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);

/** Her two Phalanx, as her battery, in the order her datasheet lists them. */
function mainBattery(g) {
  const turrets = CLS.turrets.map((t) => {
    const s = seatFor(MOUNT_SEATS.ciws, t.x, t.z, 'Phalanx');
    const m = sculpted(g, 'ciws', s.x, s.y, s.z, stowed(t), CLS.gun.traverse, t.name);
    m.userData.rest = undefined;
    return m;
  });
  g.userData.turrets = turrets;
  return turrets;
}

/** The same two, as her light battery: what her CIWS fire from. */
function mountings(g) {
  const aa = [];
  const lights = lightMounts(CLS);
  for (const gun of CLS.aa.guns) {
    for (const spec of gun.mounts) {
      const s = seatFor(MOUNT_SEATS.ciws, spec.x, spec.z, 'Phalanx');
      const a = sculpted(g, 'ciws', s.x, s.y, s.z, stowed(spec), 1.4, null, true);
      a.userData.rest = 0;
      a.userData.ciws = !!gun.ciws;
      a.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
      a.userData.stops = gun.elev || null;
      aa.push(a);
    }
  }
  if (aa.length !== lights.length) throw new Error('the Nimitz built a light battery her datasheet does not list');
  g.userData.aaMounts = aa;
  return { aa };
}

/**
 * Her Sea Sparrow and RAM launchers, in the order her datasheet lists their
 * rails: each the model's own, stowed pointing out over her side, and
 * swinging onto the bearing of whatever it is told to fire at.
 */
function launchers(g) {
  return CLS.missiles.rails.map(([x, , z, rest, kind]) => {
    const which = kind === 'ram' ? 'ram' : 'sparrow';
    const s = seatFor(MOUNT_SEATS[which], x, z, which);
    const m = new THREE.Group();
    m.position.set(s.x, s.y, s.z);
    m.rotation.y = rest;
    m.userData.dynamic = true;
    m.add(new THREE.Mesh(nimitzGun(which).house, nimitzMaterials().sheet));
    g.add(m);
    return { group: m, want: rest, rest, hold: 0 };
  });
}

// ------------------------------------------------------------ deck cycle --

/** Her two bow catapults: where each starts, across, and how long its stroke is. */
const CATS = [{ x: -5.2, z: 72 }, { x: 6.4, z: 74 }];
const STROKE = 92;
/** Where her aircraft come out onto the deck: off her forward lifts, abaft the catapults. */
const PARK = { x: -27, z: 22 };
/** Where a Seahawk lifts off from, forward of her island. */
const HELO = { x: -8, z: 4 };
/** Where they come down coming home: up her deck from the round-down. */
const LAND = { x: 0, z: -138 };
/** The machine each of her roles is (see her `types`). */
const KIND_OF = { fighter: 'f18', dive: 'f18', torpedo: 'sh60', aew: 'e2d' };
const ON = 0.04;

/** The aeroplane on her deck: one of each of her three types, the ones not in use put out of sight. */
function deckAircraft(g) {
  const plane = new THREE.Group();
  plane.userData.dynamic = true;
  g.add(plane);
  const kinds = {
    f18: f18(plane, 0, 0, 0, 0, false, {}),
    e2d: e2d(plane, 0, 0, 0, 0, false, {}),
    sh60: sh60(plane, 0, 0, 0, 0, false, {}),
  };
  const out = { group: plane, kinds, role: 'fighter', kind: 'f18' };
  out.pick = (role) => {
    const k = KIND_OF[role] || 'f18';
    for (const [n, v] of Object.entries(kinds)) v.visible = n === k;
    out.role = role;
    out.kind = k;
    out.body = kinds[k];
    out.gear = kinds[k].userData.gear;
    out.turn = kinds[k].userData.turn;
  };
  out.pick('fighter');
  return out;
}

/**
 * A catapult shot, in the evolution's own seconds from the flag: the stroke,
 * flown to the end of the track in `CAT_T`, and the first moments off the bow
 * climbing away. Her place along the track, her height over the deck and her
 * pitch.
 */
const CAT_T = 2.4;
const OFF_T = 0.4;
function shot(k) {
  if (k < CAT_T) {
    const u = k / CAT_T;
    return { s: STROKE * u * u, h: 0, pitch: 0.03 + 0.04 * u, v: (2 * STROKE / CAT_T) * u };
  }
  const v = 2 * STROKE / CAT_T;
  const e = k - CAT_T;
  return { s: STROKE + v * e, h: 2.5 * e * e + 1.2 * e, pitch: Math.min(0.16, 0.07 + 0.2 * e), v };
}

/**
 * Her deck cycle. A launch brings a Hornet or a Hawkeye out onto the deck off
 * her forward lifts; she taxis round onto whichever catapult is next, the
 * shuttle takes her, she runs up against the holdback, and the catapult
 * throws her off the bow. A Seahawk winds her rotor up forward of the
 * island, lifts, and goes away low ahead of the ship. Coming home, each comes
 * down on her deck aft -- the jets into the wires -- and is taken below.
 */
export function stepDeck(deck, t) {
  if (!deck) return;
  const { plane } = deck;
  const dt = Math.max(0, Math.min(0.5, t - (deck.lastT ?? t)));
  deck.lastT = t;
  for (const l of deck.launchers || []) {
    if (l.hold > 0) l.hold -= dt;
    else l.want = l.rest;
    const d = Math.atan2(Math.sin(l.want - l.group.rotation.y), Math.cos(l.want - l.group.rotation.y));
    l.group.rotation.y += clamp(d, -2.2 * dt, 2.2 * dt);
  }
  if (!plane) return;
  const p = plane.group;
  if (deck.owner && p.parent !== deck.owner) return;
  const helo = plane.kind === 'sh60';
  const turn = (rate) => plane.turn && plane.turn(rate * dt);

  if (deck.landAt != null) {
    const k = t - deck.landAt;
    p.visible = true;
    if (helo) {
      // Down onto the deck aft, her rotor still turning, and below.
      const h = Math.max(0, 12 * (1 - k / 3));
      p.position.set(LAND.x, FD + ON + h, LAND.z + 30);
      p.rotation.set(0, 0, 0);
      turn(30 * Math.max(0, 1 - (k - 3) / 4));
      if (k > 6) { deck.landAt = null; deck.stowed = true; p.visible = false; }
    } else {
      // Into the wires: a hundred metres from a hundred and thirty knots to
      // nothing in two seconds, and then off the landing area to starboard.
      const ROLL = 2.2;
      let z, x = LAND.x, yaw = 0;
      if (k < ROLL) { const u = k / ROLL; z = LAND.z + 95 * (1 - (1 - u) * (1 - u)); } else {
        const u = ease((k - ROLL) / 6);
        z = LAND.z + 95 + 40 * u;
        x = LAND.x - 22 * u;
        yaw = -0.5 * Math.sin(Math.PI * u);
      }
      if (plane.gear) plane.gear(0);
      p.position.set(x, FD + ON, z);
      p.rotation.set(0, yaw, 0);
      turn(8);
      if (k > ROLL + 6) { deck.landAt = null; deck.stowed = true; p.visible = false; }
    }
    return;
  }
  if (deck.launchAt == null || deck.airborne) {
    if (deck.stowed || deck.airborne) p.visible = false;
    return;
  }
  const dur = deck.dur ?? DECK_RUN;
  const run = t - deck.launchAt;
  const FLOWN = helo ? 3.2 : CAT_T + OFF_T;
  const HANDLE = Math.max(1, dur - FLOWN);
  if (run >= dur) {
    if (!deck.airborne) deck.airborneAt = t;
    deck.airborne = true;
    p.visible = false;
    return;
  }
  p.visible = true;
  if (plane.gear) plane.gear(0);
  if (helo) {
    // Her rotor wound up on the deck, then up and away ahead of the ship.
    if (run < HANDLE) {
      p.position.set(HELO.x, FD + ON, HELO.z);
      p.rotation.set(0, 0, 0);
      turn(30 * Math.min(1, run / Math.max(0.5, HANDLE * 0.8)));
    } else {
      const k = (run - HANDLE) / FLOWN;
      const up = 14 * ease(Math.min(1, k * 1.6));
      const fwd = 36 * k * k;
      p.position.set(HELO.x * (1 - k), FD + ON + up, HELO.z + fwd);
      p.rotation.set(-0.12 * k, 0, 0);
      turn(32);
    }
    return;
  }
  const cat = CATS[deck.cat || 0];
  if (run < HANDLE) {
    // Out from the lift and round onto the catapult, then held back against
    // the shuttle at full power.
    const TAXI = HANDLE * 0.7;
    if (run < TAXI) {
      const u = ease(run / TAXI);
      const x = PARK.x + (cat.x - PARK.x) * u;
      const z = PARK.z + (cat.z - PARK.z) * Math.sin((u * Math.PI) / 2);
      const yaw = Math.atan2(cat.x - PARK.x, (cat.z - PARK.z) * Math.cos((u * Math.PI) / 2) + 1e-3) * (1 - u);
      p.position.set(x, FD + ON, z);
      p.rotation.set(0, yaw, 0);
      turn(6);
    } else {
      p.position.set(cat.x, FD + ON, cat.z);
      p.rotation.set(-0.012 * Math.sin(run * 30), 0, 0);
      turn(14);
    }
    return;
  }
  const s = shot(run - HANDLE);
  p.position.set(cat.x, FD + ON + s.h, cat.z + s.s);
  p.rotation.set(-s.pitch, 0, 0);
  if (plane.gear) plane.gear(run - HANDLE > CAT_T ? Math.min(1, (run - HANDLE - CAT_T) / 2) : 0);
  turn(16);
}

// ---------------------------------------------------------------- build ----

/** Her lines, for the interior and the tests. */
export const LINES = { loa: LOA, sheer: () => HANGAR, keelY, shellAt, zAt };

const STATIC = [
  ['hullModel', hullModel],
  ['hangar', hangar],
  ['armour', armour],
];

export function buildNimitz() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, {
    loa: LOA, shellAt, keelY: (t) => keelY(t) + 0.15, sheer: () => HANGAR, zAt, hollow: true,
  });
  const plane = deckAircraft(g);
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  const rails = launchers(g);
  mergeMoving(g);
  g.userData.classId = 'nimitz';

  const deck = {
    plane, launchers: rails, launchAt: null, landAt: null, stowed: true,
    owner: g, lastT: 0, airborne: false, pending: [], flightId: 0, cat: 0,
  };
  g.userData.deck = deck;
  g.userData.deckPlane = plane.group;
  g.userData.landingSpot = [LAND.x, FD + ON, LAND.z];
  g.userData.step = (t) => stepDeck(deck, t);
  /**
   * A launcher told to fire: rail `at` of her datasheet swings onto the
   * bearing `b` (off her bow) and holds it while its missile goes.
   */
  g.userData.trainLauncher = (at, b) => {
    const l = rails[at];
    if (!l || !Number.isFinite(b)) return;
    l.want = b;
    l.hold = 3;
  };
  // Told how long the deck has to get her off (see the launch event): what
  // the evolution is played to.
  g.userData.launch = (t, role, dur = DECK_RUN) => {
    deck.launchAt = t;
    deck.landAt = null;
    deck.stowed = false;
    deck.airborne = false;
    deck.dur = dur;
    plane.pick(role);
    if (plane.kind !== 'sh60') deck.cat = (deck.cat + 1) % CATS.length;
    const cat = CATS[deck.cat];
    deck.endPose = plane.kind === 'sh60'
      ? { x: 0, y: FD + 14 + ON, z: HELO.z + 36, pitch: 0.12 }
      : { x: cat.x, y: FD + ON + shot(CAT_T + OFF_T).h, z: cat.z + shot(CAT_T + OFF_T).s, pitch: shot(CAT_T + OFF_T).pitch };
    plane.group.visible = true;
  };
  g.userData.recover = (t = deck.lastT ?? 0, role = null) => {
    plane.pick(role || 'fighter');
    deck.landAt = t;
    deck.launchAt = null;
    deck.stowed = false;
    deck.airborne = false;
    plane.group.visible = true;
  };
  g.userData.stow = () => {
    deck.airborne = false;
    deck.launchAt = null;
    deck.landAt = null;
    deck.stowed = true;
    plane.group.visible = false;
  };
  g.userData.stow();

  dressShip(g);
  return {
    group: g, turrets, lifts: [],
    deckPlane: plane.group,
    length: LOA, beam: BEAM, deckY: HANGAR, flightDeckY: FD,
    secMounts: [], aaMounts: g.userData.aaMounts || [], torpMounts: [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function nimitzParts() {
  const parts = [];
  const builders = [...STATIC, ['mainBattery', mainBattery], ['mountings', mountings]];
  for (const [name, build] of builders) {
    const g = new THREE.Group();
    build(g);
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      parts.push({ from: name, min: bb.min.toArray(), max: bb.max.toArray() });
    });
  }
  return parts;
}
