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
//   * her hangar, on the deck her hangar doors open onto, with the four doors
//     cut through its sides; and her armour and her interior, fitted to her
//     own lines;
//   * her four lifts, the model's own plates, which run between her flight
//     deck and her hangar deck;
//   * her deck cycle: an aeroplane is towed out of the hangar onto a lift and
//     brought up; a Hornet or a Hawkeye taxis off it to a bow catapult and is
//     shot off, and a Seahawk is towed to the spot abreast the island and goes
//     straight up off it. Coming home a jet traps, taxis aft onto an after
//     lift and goes down; a Seahawk comes straight down onto the spot and is
//     towed to a lift. Each is towed in through the door.
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
  NIMITZ_HULL_B64, NIMITZ_SURFACE, NIMITZ_DECK, NIMITZ_ISLAND, NIMITZ_GUNS, NIMITZ_MOUNTS, NIMITZ_LINES, NIMITZ_LIFTS,
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
    // Her lifts: the model's slab, its top her flight deck and its underside
    // seen from below whenever one is up and an aeroplane is not on it.
    lift: new THREE.MeshPhongMaterial({
      vertexColors: true, map: planks, specularMap: planks, specular: 0x16181c, shininess: 5,
      side: THREE.DoubleSide,
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
  finish(mats.lift, 'wood');
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
/**
 * Her hangar deck, and its deckhead: one hangar, eight metres high, on the
 * deck the model's hangar doors open onto. It runs from abaft her after lifts
 * to where her bow closes in on it.
 */
export const HANGAR = 7.4;
const HANGAR_TOP = FD - 2.6;
const HANGAR_Z = [-121, 62];
const HANGAR_HW = 18.3;
/** The head of her hangar doors, as the model has them. */
const DOOR_TOP = 15.8;

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

/** The hangar door on her `side` (-1 starboard, +1 port) that z is in, if any. */
const doorAt = (side, z, margin = 0) => LIFTS.find((l) => l.side === side
  && Math.abs(z - l.door.z) < l.door.hd + margin);

/**
 * Her hangar: its deck, its deckhead, its sides and ends, and its frames, and
 * her four hangar doors opened through its sides to her lifts.
 */
function hangar(g) {
  const [z0, z1] = HANGAR_Z;
  const y0 = HANGAR, y1 = HANGAR_TOP;
  const half = (z) => hangarHalf(z, y0 + 0.5, y1);
  const N = 70;
  sheet(g, M.deckSteel, z0, z1, half, () => y0, N).userData.inside = true;
  sheet(g, M.steelDark, z0, z1, half, () => y1, N, false).userData.inside = true;
  // Her sides, cut at every door jamb: under a door's head there is no side.
  const zs = [];
  for (let i = 0; i <= N; i++) zs.push(z0 + ((z1 - z0) * i) / N);
  for (const l of LIFTS) zs.push(l.door.z - l.door.hd, l.door.z + l.door.hd);
  zs.sort((a, b) => a - b);
  for (const out of [1, -1]) {
    const w = strip();
    for (let i = 0; i + 1 < zs.length; i++) {
      const za = zs[i], zb = zs[i + 1];
      if (zb - za < 1e-3 || za < z0 || zb > z1) continue;
      for (const sgn of [-1, 1]) {
        const foot = doorAt(sgn, (za + zb) / 2) ? DOOR_TOP : y0;
        w.quad([sgn * half(za), foot, za], [sgn * half(za), y1, za],
          [sgn * half(zb), y1, zb], [sgn * half(zb), foot, zb], [sgn * out, 0, 0]);
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
      if (doorAt(sgn, z, 0.4)) continue;
      box(g, M.steelDark, 0.3, y1 - y0, 0.4, sgn * (w - 0.17), (y0 + y1) / 2, z).userData.inside = true;
    }
    box(g, M.steelDark, w * 2 - 0.4, 0.34, 0.3, 0, y1 - 0.2, z).userData.inside = true;
  }
  // The fire doors that divide it into its three bays.
  for (const z of [z0 + (z1 - z0) / 3, z0 + (2 * (z1 - z0)) / 3]) {
    const w = half(z) - 0.3;
    box(g, M.canvas, w * 2, 0.6, 0.3, 0, y1 - 0.5, z).userData.inside = true;
  }
  // Each door out through her side: its sill, its jambs and its head, from
  // the hangar's side out to her plating.
  for (const l of LIFTS) {
    const { z, hd } = l.door;
    const w = half(z);
    const out = Math.abs(l.door.x) + 0.3;
    const mid = (w + out) / 2, thick = out - w + 0.2;
    box(g, M.deckSteel, thick, 0.12, 2 * hd, l.side * mid, y0 - 0.06, z).userData.inside = true;
    box(g, M.hangar, thick, 0.25, 2 * hd, l.side * mid, DOOR_TOP + 0.12, z).userData.inside = true;
    for (const e of [-1, 1]) {
      box(g, M.hangar, thick, DOOR_TOP - y0, 0.25, l.side * mid, (y0 + DOOR_TOP) / 2, z + e * hd).userData.inside = true;
    }
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

// ------------------------------------------------------------- her lifts --

/**
 * Her four lifts, as the model has them (see build/prepare-nimitz-hull.mjs):
 * a plate out beyond her deck edge, sixteen metres by twenty-seven, that
 * runs between her flight deck and her hangar deck. Each faces one of her
 * hangar doors, a little abaft it, and the door is what an aeroplane is
 * taken through between the lift and the hangar.
 */
export const LIFTS = NIMITZ_LIFTS.map((l, i) => ({
  ...l, i, side: Math.sign(l.x),
  // Her hangar door: a little forward of the lift's middle, as the model has it.
  door: { z: l.z - 2.1, hd: 10.6, x: Math.sign(l.x) * 19.3 },
}));
/** How far a lift runs: from her flight deck down to her hangar deck. */
export const LIFT_DROP = FD - HANGAR;
/** How deep the model's lift slab is, from her flight deck to its underside. */
const LIFT_DEPTH = 1.83;
/** How long a lift takes to run its length, in seconds. */
const LIFT_T = 3.4;

/** Her four lifts: each a group of its own, its plate the model's and a grillage under it. */
function elevators(g) {
  const m = nimitzMaterials();
  return LIFTS.map((l) => {
    const lift = new THREE.Group();
    lift.position.set(l.x, FD, l.z);
    lift.userData.dynamic = true;
    g.add(lift);
    // The model's slab, top, sides and underside (see LIFT_UNDER in
    // build/prepare-nimitz-hull.mjs): it goes down whole, and nothing of it is
    // left in her deck for it to come up through.
    lift.add(new THREE.Mesh(decodePiece(l.piece), m.lift));
    // Its girders, under the slab.
    for (let k = -3; k <= 3; k++) box(lift, M.steel, 0.3, 0.3, 2 * l.hd - 1.2, k * (l.hw - 1) / 3, -LIFT_DEPTH - 0.15, 0);
    box(lift, M.steel, 2 * l.hw - 0.8, 0.3, 0.4, 0, -LIFT_DEPTH - 0.15, 0);
    mergeStatic(lift);
    return { group: lift, y: FD, want: FD, rate: LIFT_DROP / LIFT_T, by: null, spec: l };
  });
}

// ------------------------------------------------------------ deck cycle --

/** Her two bow catapults: where each starts, across, and how long its stroke is. */
const CATS = [{ x: -5.2, z: 72 }, { x: 6.4, z: 74 }];
const STROKE = 92;
/** Where a Seahawk lifts off and comes down: her deck abreast the island, on her centreline. */
export const HELO = { x: 0, z: 2 };
/** How high a Seahawk hovers over the spot before she goes. */
export const HELO_RISE = 18;
/** Where they come down coming home: up her deck from the round-down. */
const LAND = { x: 0, z: -138 };
/** The machine each of her roles is, when the order does not say (see her `types`). */
const KIND_OF = { fighter: 'f18', dive: 'f18', torpedo: 'sh60', aew: 'e2d' };
const ON = 0.04;
/** Which of her lifts each evolution would rather have, in order. */
const PREFER = {
  launch: [0, 1], heloLaunch: [1, 0], recover: [2, 3, 1], heloRecover: [1, 2, 0],
};

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
/** How long a Seahawk takes to go straight up from the spot to her hover. */
const RISE_T = 3.2;

/**
 * Each evolution as its phases, each [name, seconds]. What is flown -- the
 * catapult shot, the Seahawk's climb -- takes the time it takes; what is
 * handled is played at whatever pace fits the time the deck has been given.
 */
const PLANS = {
  launch: [['down', LIFT_T], ['out', 2.2], ['up', LIFT_T], ['taxi', 5.2], ['hold', 1.6]],
  heloLaunch: [['down', LIFT_T], ['out', 2.2], ['up', LIFT_T], ['tow', 3.6], ['spin', 2.6]],
  recover: [['roll', 2.2], ['taxi', 6.4], ['down', LIFT_T], ['in', 2.4]],
  heloRecover: [['spin', 3.0], ['tow', 3.6], ['down', LIFT_T], ['in', 2.4]],
};
/** Which phase of `plan` she is in at `k` seconds, played over `total` seconds. */
function phaseAt(plan, k, total) {
  const sum = plan.reduce((s, [, d]) => s + d, 0);
  const f = total ? total / sum : 1;
  let at = 0;
  for (const [name, d] of plan) {
    const len = d * f;
    if (k < at + len) return { name, u: (k - at) / len, len };
    at += len;
  }
  return { name: 'done', u: 1, len: 0, over: k - at };
}

/** A cubic from a to d through b and c, as `n` points. */
function cubic(a, b, c, d, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    out.push([0, 1].map((k) => v * v * v * a[k] + 3 * v * v * u * b[k] + 3 * v * u * u * c[k] + u * u * u * d[k]));
  }
  return out;
}
/** Half a turn about (cx, cz), from angle a0 to a1 (radians off +z), radius r, as points. */
function arc(cx, cz, r, a0, a1, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.sin(a) * r, cz + Math.cos(a) * r]);
  }
  return out;
}
/**
 * A taxiway through `pts`, walked by how far along it she is: where she is
 * at fraction `u` of its length, and which way it runs there.
 */
function taxiway(pts) {
  const run = [0];
  for (let i = 1; i < pts.length; i++) run.push(run[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = run[run.length - 1] || 1;
  return (u) => {
    const s = clamp(u, 0, 1) * len;
    let i = 1;
    while (i < pts.length - 1 && run[i] < s) i++;
    const a = pts[i - 1], b = pts[i];
    const f = (s - run[i - 1]) / ((run[i] - run[i - 1]) || 1);
    return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
  };
}
/** Easing from one heading to another the short way round. */
function turnTo(a, b, k) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * ease(k);
}

/**
 * The way she goes over the deck, for an evolution on lift `l`. Out to a
 * catapult, she taxis forward off the lift and swings in onto the track. A
 * Seahawk is towed between the lift and the spot. Home from a trap a jet
 * has rolled out up her centreline: she turns about -- to starboard for a
 * starboard lift, to port for the port one -- runs aft clear of the island,
 * and comes onto the lift nose aft.
 */
function routeFor(a, l) {
  if (a.plan === 'launch') {
    const cat = CATS[a.cat || 0];
    return taxiway(cubic([l.x, l.z], [l.x, l.z + 16], [cat.x, cat.z - 22], [cat.x, cat.z]));
  }
  if (a.plan === 'heloLaunch') {
    return taxiway(cubic([l.x, l.z], [l.x - l.side * 10, l.z], [HELO.x, HELO.z - 12], [HELO.x, HELO.z]));
  }
  if (a.plan === 'heloRecover') {
    return taxiway(cubic([HELO.x, HELO.z], [HELO.x, HELO.z - 10], [l.x - l.side * 10, l.z], [l.x, l.z]));
  }
  // Rolled out to here, nose forward: round about onto a lane eight metres
  // off her centreline, aft down it, and out onto the lift.
  const x0 = LAND.x, z0 = LAND.z + 95;
  const s = l.side;
  const R = 4;
  const turn = [];
  for (let i = 0; i <= 16; i++) {
    const t = (Math.PI * i) / 16;
    turn.push([x0 + s * R - s * R * Math.cos(t), z0 + R * Math.sin(t)]);
  }
  const lane = x0 + 2 * s * R;
  return taxiway([...turn, ...cubic([lane, l.z + 24], [lane, l.z + 10], [l.x, l.z + 10], [l.x, l.z])]);
}

/** Where an aeroplane stands in her hangar, waiting at the door of lift `l`. */
const inHangar = (l) => ({ x: l.side * 12.5, z: l.door.z });

/**
 * An aeroplane of one of her three types, for the deck to use: taken from
 * those she has drawn already and not in use, or drawn now.
 */
function machine(deck, kind) {
  const pool = deck.pool[kind] || (deck.pool[kind] = []);
  let m = pool.find((x) => !x.busy);
  if (!m) {
    const make = { f18, e2d, sh60 }[kind];
    m = { body: make(deck.planes, 0, 0, 0, 0, false, {}), busy: false, kind };
    pool.push(m);
  }
  m.busy = true;
  m.body.visible = true;
  return m;
}
function release(m) {
  if (!m) return;
  m.busy = false;
  m.body.visible = false;
}
/** The first of the lifts `which` that nobody else has. */
function claimLift(deck, which, actor) {
  const i = which.find((n) => !deck.lifts[n].by) ?? which[0];
  const l = deck.lifts[i];
  if (l.by && l.by !== actor) l.by.lift = null;
  l.by = actor;
  return l;
}

/**
 * Everything her deck is doing: what each aeroplane on it is doing, and her
 * lifts doing what those aeroplanes want of them.
 *
 * Each launch and each recovery is an aeroplane of her own with its own
 * clock. A launch comes up from the hangar on a forward lift: she is towed
 * out through the hangar door onto it, it brings her up flush with the
 * flight deck, and she taxis off it onto whichever catapult is next and is
 * shot off the bow; a Seahawk is towed off it to the spot abreast the island,
 * winds her rotor up, and goes straight up. Coming home a jet traps, rolls
 * out, and taxis round the island onto an after lift; a Seahawk comes straight
 * down onto the spot, her rotor runs down, and she is towed to the lift. The
 * lift takes each down and she is towed in through the door, and the lift
 * comes up empty. Two can be at it at once -- one going down aft while the
 * next comes in to land -- and each has her own lift.
 */
export function stepDeck(deck, t) {
  if (!deck) return;
  const dt = Math.max(0, Math.min(0.5, t - (deck.lastT ?? t)));
  deck.lastT = t;
  deck.dt = dt;
  for (const l of deck.launchers || []) {
    if (l.hold > 0) l.hold -= dt;
    else l.want = l.rest;
    const d = Math.atan2(Math.sin(l.want - l.group.rotation.y), Math.cos(l.want - l.group.rotation.y));
    l.group.rotation.y += clamp(d, -2.2 * dt, 2.2 * dt);
  }
  const lifts = deck.lifts || [];
  // A lift nobody wants comes back up flush with the deck.
  for (const l of lifts) { if (!l.by) { l.want = FD; l.rate = LIFT_DROP / LIFT_T; } }
  for (const a of deck.actors || []) poseActor(deck, a, t, true);
  for (const l of lifts) {
    l.y += clamp(l.want - l.y, -l.rate * dt, l.rate * dt);
    l.group.position.y = l.y;
  }
  for (const a of deck.actors || []) poseActor(deck, a, t, false);
  if (deck.actors) deck.actors = deck.actors.filter((a) => !a.done);
}

/**
 * One aeroplane's evolution at time `t`. Called twice a frame: first only to
 * say what she wants of her lift (`plan`), and then, with the lift moved, to
 * put her where she is.
 */
function poseActor(deck, a, t, plan) {
  const k = t - a.t0;
  const helo = a.kind === 'sh60';
  const flown = a.plan === 'launch' ? CAT_T + OFF_T : a.plan === 'heloLaunch' ? RISE_T : 0;
  const ph = phaseAt(PLANS[a.plan], k, a.dur ? Math.max(1, a.dur - flown) : 0);
  const L = a.lift;
  const l = a.spec;
  const mine = L && L.by === a;
  const free = () => { if (mine) L.by = null; a.lift = null; };
  if (plan) {
    if (!mine) return;
    // Down for her, or with her; up with her, or waiting up for her.
    if (ph.name === 'down' || ph.name === 'out' || ph.name === 'in') {
      L.want = HANGAR; L.rate = LIFT_DROP / Math.max(0.8, ph.name === 'down' ? ph.len : LIFT_T);
    } else if (ph.name === 'up') {
      L.want = FD; L.rate = LIFT_DROP / Math.max(0.8, ph.len);
    } else if (ph.name === 'done' || ph.name === 'hold' || ph.name === 'spin' && a.plan === 'heloLaunch') {
      free();
    } else {
      L.want = FD; L.rate = LIFT_DROP / LIFT_T;
    }
    return;
  }
  const p = a.m.body;
  const turn = (rate) => p.userData.turn(rate * deck.dt);
  const onLift = () => (mine ? L.y : FD) + ON;
  const hold = inHangar(l);
  p.userData.gear(0);
  p.rotation.set(0, 0, 0);
  a.route ||= routeFor(a, l);
  if (a.plan === 'launch' || a.plan === 'heloLaunch') {
    if (ph.name === 'down') {
      p.position.set(hold.x, HANGAR + ON, hold.z);
      return;
    }
    if (ph.name === 'out') {
      const u = ease(ph.u);
      p.position.set(hold.x + (l.x - hold.x) * u, onLift(), hold.z + (l.z - hold.z) * u);
      return;
    }
    if (ph.name === 'up') {
      p.position.set(l.x, onLift(), l.z);
      return;
    }
    if (ph.name === 'taxi' || ph.name === 'tow') {
      const w = a.route(ease(ph.u));
      p.position.set(w.x, FD + ON, w.z);
      // A jet on her own power, nose down the taxiway; a Seahawk on her
      // tractor, nose forward.
      p.rotation.y = helo ? 0 : w.yaw;
      if (ph.u > 0.35) free();
      if (!helo) turn(6);
      return;
    }
    free();
    if (a.plan === 'heloLaunch') {
      if (ph.name === 'spin') {
        // Her rotor wound up on the spot.
        p.position.set(HELO.x, FD + ON, HELO.z);
        turn(30 * clamp(ph.u * 1.2, 0, 1));
        return;
      }
      // Straight up off the spot to her hover, and there she is handed to the sky.
      const e = Math.min(1, ph.over / RISE_T);
      p.position.set(HELO.x, FD + ON + HELO_RISE * ease(e), HELO.z);
      p.rotation.set(-0.04 * e, 0, 0);
      turn(32);
      if (ph.over >= RISE_T) { a.off = true; done(deck, a, t); }
      return;
    }
    const cat = CATS[a.cat || 0];
    if (ph.name === 'hold') {
      // Held back against the shuttle at full power.
      p.position.set(cat.x, FD + ON, cat.z);
      p.rotation.set(-0.012 * Math.sin(k * 30), 0, 0);
      turn(14);
      return;
    }
    const s = shot(ph.over);
    p.position.set(cat.x, FD + ON + s.h, cat.z + s.s);
    p.rotation.set(-s.pitch, 0, 0);
    p.userData.gear(ph.over > CAT_T ? Math.min(1, (ph.over - CAT_T) / 2) : 0);
    turn(16);
    if (ph.over >= CAT_T + OFF_T) { a.off = true; done(deck, a, t); }
    return;
  }
  // Coming home. Nose aft on an after lift and forward on a forward one, so
  // she goes through the door sideways on her tractor, wings along it.
  const park = helo ? 0 : (l.z < -60 ? Math.PI : 0);
  if (ph.name === 'roll') {
    // Into the wires: a hundred metres from a hundred and thirty knots to
    // nothing in two seconds.
    const u = ph.u;
    p.position.set(LAND.x, FD + ON, LAND.z + 95 * (1 - (1 - u) * (1 - u)));
    turn(8);
    return;
  }
  if (ph.name === 'spin') {
    // Down on the spot, her rotor running down.
    p.position.set(HELO.x, FD + ON, HELO.z);
    turn(30 * Math.max(0, 1 - ph.u));
    return;
  }
  if (ph.name === 'taxi' || ph.name === 'tow') {
    const w = a.route(ease(ph.u));
    p.position.set(w.x, FD + ON, w.z);
    p.rotation.y = helo ? 0 : ph.u < 0.8 ? w.yaw : turnTo(w.yaw, park, (ph.u - 0.8) / 0.2);
    if (!helo) turn(5);
    return;
  }
  if (ph.name === 'down') {
    p.position.set(l.x, onLift(), l.z);
    p.rotation.y = park;
    return;
  }
  if (ph.name === 'in') {
    const u = ease(ph.u);
    p.position.set(l.x + (hold.x - l.x) * u, onLift(), l.z + (hold.z - l.z) * u);
    p.rotation.y = park;
    return;
  }
  free();
  done(deck, a, t);
}

/**
 * The end of an evolution: off the deck one way or the other, and her model
 * put away.
 *
 * One that has just gone off the bow, or up off the spot, says so on the deck
 * herself -- where she left it, when, and what she is -- for the game to hand
 * her to the flight the simulation put up (see flyLaunched). Her own, not
 * whichever launch was called last: the order for the next one comes in the
 * same breath as the word that she is up, and it used to overwrite her, or
 * strike her below while she was still on the catapult, and she vanished.
 */
function done(deck, a, t) {
  if (a.done) return;
  a.done = true;
  if (a.lift && a.lift.by === a) a.lift.by = null;
  release(a.m);
  if (a.endPose && a.off) {
    deck.endPose = a.endPose;
    deck.plane = a.planeInfo;
    deck.launchAt = a.t0;
    deck.airborneAt = t;
    deck.airborne = true;
  }
}

/** Start an evolution: `plan` is one of PLANS. */
function begin(deck, t, plan, kind, role, dur) {
  const a = { plan, kind, role, t0: t, dur, m: machine(deck, kind), done: false, lift: null };
  a.lift = claimLift(deck, PREFER[plan], a);
  a.spec = a.lift.spec;
  if (plan === 'launch') a.cat = deck.cat = (deck.cat + 1) % CATS.length;
  deck.actors.push(a);
  return a;
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
  const lifts = elevators(g);
  // The aeroplanes on her deck: a group of their own, drawn as they are wanted.
  const planes = new THREE.Group();
  planes.userData.dynamic = true;
  g.add(planes);
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  const rails = launchers(g);
  mergeMoving(g);
  g.userData.classId = 'nimitz';

  const deck = {
    lifts, planes, pool: {}, actors: [], current: null,
    // What the game reads of the launch going on: see flyLaunched.
    plane: { role: 'fighter', kind: 'f18', group: planes },
    launchers: rails, launchAt: null, airborne: false, stowed: true,
    owner: g, lastT: 0, dt: 0, pending: [], flightId: 0, cat: 0,
  };
  // One of each drawn at once, so the first launch has nothing to wait for.
  for (const k of ['f18', 'e2d', 'sh60']) release(machine(deck, k));
  g.userData.deck = deck;
  g.userData.deckPlane = planes;
  g.userData.landingSpot = [LAND.x, FD + ON, LAND.z];
  g.userData.step = (t) => stepDeck(deck, t);
  // Her deck is worked on the battle's clock, not the screen's: each of her
  // launches leaves the bow when the simulation has her leave it (see the
  // game's deckClock).
  g.userData.simClock = true;
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
  // the evolution is played to. `kind` is which of her types she is.
  g.userData.launch = (t, role, dur = DECK_RUN, kind = null) => {
    const k = kind && kind in { f18: 1, e2d: 1, sh60: 1 } ? kind : KIND_OF[role] || 'f18';
    const helo = k === 'sh60';
    const a = begin(deck, t, helo ? 'heloLaunch' : 'launch', k, role, dur);
    deck.current = a;
    deck.stowed = false;
    deck.dur = dur;
    // Where she will leave the deck, and what she is: hers, published on the
    // deck when she goes (see done). One still on her way to the bow from an
    // earlier order keeps hers.
    a.planeInfo = { role, kind: k, group: a.m.body };
    if (helo) {
      a.endPose = { x: HELO.x, y: FD + ON + HELO_RISE, z: HELO.z, pitch: 0, v: 6 };
    } else {
      const s = shot(CAT_T + OFF_T);
      const cat = CATS[a.cat];
      a.endPose = { x: cat.x, y: FD + ON + s.h, z: cat.z + s.s, pitch: s.pitch };
    }
  };
  // One of hers down: a jet in the wires, or a Seahawk on the spot.
  g.userData.recover = (t = deck.lastT ?? 0, role = null, kind = null) => {
    const k = kind && kind in { f18: 1, e2d: 1, sh60: 1 } ? kind : KIND_OF[role] || 'f18';
    begin(deck, t, k === 'sh60' ? 'heloRecover' : 'recover', k, role, 0);
  };
  // Told the deck is done with the launch it was on. Every aeroplane on her
  // deck has her own evolution and her own clock, so there is nothing to
  // strike below: one still on her way to a catapult goes on to it and off
  // the bow, which is where the simulation has put her. Striking her below
  // here is what made a launch vanish whenever the next order, or a trap,
  // came in while she was still on the deck. And the word of the last one to
  // go is left for the game to read, however soon after it this comes.
  g.userData.stow = () => {
    deck.current = null;
    deck.stowed = true;
  };

  dressShip(g);
  return {
    group: g, turrets, lifts,
    deckPlane: planes,
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
