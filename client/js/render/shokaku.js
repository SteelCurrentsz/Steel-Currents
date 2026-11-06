// IJN Shokaku, drawn from the owner's model of her.
//
// The first of the two fleet carriers the Imperial Japanese Navy built once
// it was free of the treaties: two hundred and fifty-seven metres, thirty-two
// thousand tonnes at full load, a flight deck over two hangars one above the
// other, three lifts down her centreline and an island well forward on her
// starboard side, with her funnels trunked out through her starboard side
// and curving down to the water. She and her sister Zuikaku were the best
// carriers Japan ever had; Shokaku was at Pearl Harbor, the Coral Sea and
// Santa Cruz, and was torpedoed by the submarine Cavalla in the Philippine
// Sea in June 1944.
//
// The numbers everything here is built to:
//
//   length overall     257.5 m           beam             26 m
//   draught              9.5 m, as the model floats her
//   flight deck         14.7 m over the water, 240.5 m long, 30 m across
//   hangars             two, upper and lower
//   lifts               three, on the centreline
//   belt                165 mm abreast her magazines; armour deck 100-132 mm
//   battery             8 x 2  10 cm/65 Type 98, in sponsons (the model's)
//                      20 x 2  40 mm Bofors
//                      30 x 1  25 mm Type 96
//   air group           72: A6M Zero, D4Y Suisei, B5N
//
// Her hull, her island, her funnels, her galleries and her sponsons are the
// model -- "IJN CV SHOUKAKU 1960" by 全斗焕 (https://skfb.ly/o6w8T), under
// Creative Commons Attribution 4.0 -- (see build/prepare-shokaku-hull.mjs,
// which takes the jets the model ranged on her deck off her and lifts her
// flight deck off to its outline). Built here:
//
//   * her runway, laid afresh over the outline of her own flight deck: one
//     flat planked sheet, round-downs at both ends as the model has them,
//     with her three lift wells cut through it, the red and white bars on her
//     after round-down, the arrester wires aft and her centreline;
//   * her three lifts, which run, and the wells and trunks they run in;
//   * her two hangars and the aircraft struck below in them, and a strike
//     ranged on her deck aft;
//   * her guns -- the model's own 10 cm twins, 40 mm twins and 25 mm, each
//     where the model put it, each training;
//   * her four screws, the model's, which turn;
//   * her deck cycle: the lift up, the taxi, the run-up, and the run off the
//     bow, and coming home the other way;
//
// and, inside her, her armour and her interior, fitted to her own lines.
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
import { box, cyl, strip, sheet } from './shipkit.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { zero, suisei, b5n } from './planekit.js';
import { ZERO } from './zeroModel.js';
import { SUISEI } from './suiseiModel.js';
import { B5N } from './b5nModel.js';
import { engineStart } from './deckengine.js';
import {
  DECK_KINDS, propBlur, propRate, deckClock, deckProfiles, rowSpeed, recoveryAt,
} from './deckplane.js';
import {
  SHOKAKU_HULL_B64, SHOKAKU_SURFACE, SHOKAKU_DECK, SHOKAKU_ISLAND, SHOKAKU_GUNS, SHOKAKU_MOUNTS,
  SCREWS, SHOKAKU_LINES,
} from './shokakuHull.data.js';

const CLS = SHIP_CLASSES.shokaku;
export const LOA = CLS.hull.length;
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;

// The Navy's dark grey over everything, and her flight deck planked.
const P = {
  steel: 0x7c8086,
  steelDark: 0x55595f,
  deckSteel: 0x4c5056,
  gunDark: 0x3b3f44,
  cave: 0x15181b,
  armour: 0x4a5158,
  stripe: 0xd8dce0,
  red: 0xa8322a,
  wire: 0x2a2d30,
  hangar: 0x737980,
  canvas: 0x8a8a7e,
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
const surface = surfaceOf(SHOKAKU_SURFACE);

/** Height of her surface at (x, z), her runway on it, or -99 off her. */
export const shokakuSurfaceY = surface.surfaceY;
/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const shokakuSeatY = surface.seatY;
/** Where every one of her mountings stands: see prepare-shokaku-hull.mjs. */
export const MOUNT_SEATS = SHOKAKU_MOUNTS;

let mats = null;
export function shokakuMaterials() {
  if (mats) return mats;
  const plate = steelMap();
  const planks = woodMap();
  mats = {
    plating: new THREE.MeshPhongMaterial({
      vertexColors: true, map: plate, specularMap: plate, specular: 0x3a4148, shininess: 30,
    }),
    planked: new THREE.MeshPhongMaterial({
      vertexColors: true, map: planks, specularMap: planks, specular: 0x16181c, shininess: 5,
    }),
    // What the model drew as single sheets, seen from both sides; and every
    // one of her guns, whose shields are the same.
    sheet: new THREE.MeshPhongMaterial({
      vertexColors: true, map: plate, specularMap: plate, specular: 0x3a4148, shininess: 30,
      side: THREE.DoubleSide,
    }),
    // Her flight deck: planking, as a Japanese carrier's was laid.
    deck: new THREE.MeshPhongMaterial({
      color: 0x9a9179, map: planks, specularMap: planks, specular: 0x16181c, shininess: 5,
    }),
  };
  finish(mats.plating);
  finish(mats.sheet);
  finish(mats.planked, 'wood');
  finish(mats.deck, 'wood');
  return mats;
}

/** Add the model's hull, painted and textured, as its length-wise slices. */
function hullModel(g) {
  if (!slicesCache) slicesCache = decodeSlices(SHOKAKU_HULL_B64);
  const m = shokakuMaterials();
  for (const geo of slicesCache) {
    g.add(new THREE.Mesh(geo, [m.plating, m.planked, m.sheet][geo.userData.surface] || m.plating));
  }
}

const guns = new Map();
/**
 * One of her guns as the model drew it -- 'dp' her 10 cm twin, 'aa' her
 * 40 mm twin, 'lt' her 25 mm single -- decoded once, in the frame of its
 * mounting: the pivot at the origin, the foot of what trains at y = 0, the
 * bore along +Z; and where its trunnions and muzzles are.
 */
export function shokakuGun(kind) {
  if (!guns.has(kind)) {
    const p = SHOKAKU_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof,
    });
  }
  return guns.get(kind);
}

// ------------------------------------------------------------- her lines --

const L = SHOKAKU_LINES;
const along = (z) => Math.max(0, Math.min(L.nz - 1.0001, (z - L.z0) / L.dz));
/** Her station at fraction t of her length, bow +1, as a z. */
export const zAt = (t) => (t * LOA) / 2;
/** The bottom of her keel at station t, the shallower of the stations either side. */
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
  const g = Math.max(0, Math.min(L.ny - 1.0001, (y - L.y0) / L.dy));
  const i = Math.floor(f);
  const j = Math.floor(g);
  const u = f - i;
  const v = g - j;
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
export const FD = SHOKAKU_DECK.y;
/** Her upper hangar deck and its deckhead, and her lower hangar deck and its. */
const HANGAR_U = 9.2;
const HANGAR_U_TOP = FD - 1.0;
const HANGAR_L = 4.0;
const HANGAR_L_TOP = HANGAR_U - 0.45;
/** How far each runs fore and aft: as far as her side is closed at its height. */
const HANGAR_U_Z = [-92, 90];
const HANGAR_L_Z = [-82, 78];
const HANGAR_HW = 11.0;

/** How far out her runway goes each way at z, 0 off it. */
function planAt(side, z) {
  const D = SHOKAKU_DECK;
  const f = (z - D.z0) / D.dz;
  const i = Math.floor(f);
  if (i < 0 || i >= D.nz - 1) return 0;
  const u = f - i;
  return D[side][i] * (1 - u) + D[side][i + 1] * u;
}
/** The forward and after ends of her runway. */
const FD_FWD = (() => { let z = 0; while (planAt('port', z + 0.5) > 0) z += 0.5; return z; })();
const FD_AFT = (() => { let z = 0; while (planAt('port', z - 0.5) > 0) z -= 0.5; return z; })();
/**
 * How far her runway falls away at its ends: flat between the ends the model
 * has it flat, and rounded down beyond -- a metre at the after end, which is
 * the round-down a pilot coming aboard sees, and a hand at the forward lip.
 */
const DROP = SHOKAKU_DECK.drop;
const FLAT = SHOKAKU_DECK.flat;
function rounded(d, len, drop) {
  if (d <= 0) return 0;
  const u = Math.min(1, d / len);
  return drop * u * u;
}
/** Her runway's height at z. */
export function fdY(z) {
  if (z < FLAT.aft) return FD - rounded(FLAT.aft - z, FLAT.aft - FD_AFT, DROP.aft);
  if (z > FLAT.fwd) return FD - rounded(z - FLAT.fwd, Math.max(0.5, FD_FWD - FLAT.fwd), DROP.fwd);
  return FD;
}

/**
 * Her three lifts: where along her each is, and the octagon of each -- its
 * half-width, its half-depth and the cut off its corners. The forward one is
 * the biggest, abreast her island, where the model marks it on her deck; the
 * after one is where the model marks it too; the middle one, abaft her
 * island, she had and the model's deck does not show.
 */
const LIFTS = [
  { z: 45.0, hw: 7.0, hd: 7.8, ch: 2.0 },
  { z: -17.0, hw: 6.5, hd: 6.5, ch: 1.6 },
  { z: -80.5, hw: 6.5, hd: 7.0, ch: 1.8 },
];
/** The octagon a lift is cut to, round its own middle. */
function liftOutline(hw, hd, ch) {
  return [
    [-hw + ch, -hd], [hw - ch, -hd], [hw, -hd + ch], [hw, hd - ch],
    [hw - ch, hd], [-hw + ch, hd], [-hw, hd - ch], [-hw, -hd + ch],
  ];
}
/** How far either side of the centreline the octagon of a lift well is, `dz` from its middle. */
function wellHalf(l, dz) {
  const a = Math.abs(dz);
  if (a > l.hd) return 0;
  if (a <= l.hd - l.ch) return l.hw;
  return l.hw - (a - (l.hd - l.ch));
}

// ------------------------------------------------------------- her runway --

/**
 * Her runway: one planked sheet over the outline of her flight deck, with
 * her lift wells cut out of it to their octagons. Laid in bands across her,
 * half a metre deep, with a band boundary at every corner of every octagon,
 * so that each side of a well is a single straight edge of the planking.
 */
function runway(g) {
  const zs = [];
  for (let z = FD_AFT; z <= FD_FWD + 1e-6; z += 0.5) zs.push(z);
  for (const l of LIFTS) for (const dz of [-l.hd, -l.hd + l.ch, l.hd - l.ch, l.hd]) zs.push(l.z + dz);
  zs.sort((a, b) => a - b);
  const pos = [];
  const uv = [];
  const idx = [];
  const quad = (xa0, xa1, za, xb0, xb1, zb) => {
    const n = pos.length / 3;
    const ya = fdY(za) + 0.02;
    const yb = fdY(zb) + 0.02;
    pos.push(xa0, ya, za, xa1, ya, za, xb1, yb, zb, xb0, yb, zb);
    uv.push(xa0, za, xa1, za, xb1, zb, xb0, zb);
    idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
  };
  for (let i = 0; i < zs.length - 1; i++) {
    const za = zs[i];
    const zb = zs[i + 1];
    if (zb - za < 1e-4) continue;
    const la = -planAt('stbd', za), ra = planAt('port', za);
    const lb = -planAt('stbd', zb), rb = planAt('port', zb);
    if (ra - la < 0.5 && rb - lb < 0.5) continue;
    const mid = (za + zb) / 2;
    const lift = LIFTS.find((l) => mid > l.z - l.hd && mid < l.z + l.hd);
    if (!lift) {
      quad(la, ra, za, lb, rb, zb);
      continue;
    }
    const ea = wellHalf(lift, za - lift.z), eb = wellHalf(lift, zb - lift.z);
    quad(la, -ea, za, lb, -eb, zb);
    quad(ea, ra, za, eb, rb, zb);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const deck = new THREE.Mesh(geo, shokakuMaterials().deck);
  deck.userData.deck = true;
  g.add(deck);
  return deck;
}

/** Whether z is in a lift well, with `margin` metres either side of it. */
const inWell = (z, margin = 0) => LIFTS.some((l) => Math.abs(z - l.z) < l.hd + margin);

/**
 * Her deck markings: a broken white centreline, the white bars across her
 * deck the model has, the red and white bars on her after round-down, and the
 * arrester wires across her after end with the sheaves at their ends.
 */
function deckMarks(g) {
  for (let z = FD_AFT + 12; z < FD_FWD - 6; z += 8) {
    if (inWell(z, 3.5)) continue;
    box(g, M.stripe, 0.45, 0.03, 4.5, 0, fdY(z) + 0.035, z);
  }
  // The bars across her: where the model's deck has them, short of her edges.
  for (const z of [-60.0, -35.0, -5.0, 22.0, 70.0]) {
    const half = Math.min(planAt('stbd', z), planAt('port', z)) - 1.0;
    box(g, M.stripe, half * 2, 0.03, 0.7, 0, fdY(z) + 0.036, z);
  }
  // The bars on her after round-down, which tell a pilot coming up her wake
  // where her deck stops: red and white, across her, the whole of the round.
  {
    const N = 9;
    for (let i = 0; i < N; i++) {
      const z0 = FD_AFT + 0.3 + (i * (FLAT.aft - FD_AFT + 1.5)) / N;
      const z1 = FD_AFT + 0.3 + ((i + 1) * (FLAT.aft - FD_AFT + 1.5)) / N;
      const z = (z0 + z1) / 2;
      const half = Math.min(planAt('stbd', z), planAt('port', z)) - 0.4;
      const bar = box(g, i % 2 ? M.stripe : M.red, half * 2, 0.03, z1 - z0, 0, fdY(z) + 0.04, z);
      bar.rotation.x = Math.atan2(fdY(z1) - fdY(z0), z1 - z0) * -1;
    }
  }
  // Arrester wires, across her after end where an aeroplane coming aboard
  // picks one up.
  for (let z = FD_AFT + 14; z <= FD_AFT + 40; z += 6.5) {
    if (inWell(z, 1)) continue;
    const half = Math.min(planAt('stbd', z), planAt('port', z)) - 1.2;
    const w = cyl(g, M.wire, 0.05, 0.05, half * 2, 0, fdY(z) + 0.12, z, 6);
    w.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) cyl(g, M.gunDark, 0.18, 0.2, 0.22, s * half, fdY(z) + 0.11, z, 10);
  }
}

// ------------------------------------------------------ her lift wells --

/** The wells, cut through her flight deck: coamings, trunks and guide rails. */
function liftWells(g) {
  for (const l of LIFTS) {
    const pts = liftOutline(l.hw + 0.05, l.hd + 0.05, l.ch);
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[(i + 1) % pts.length];
      const len = Math.hypot(bx - ax, bz - az) + 0.2;
      const ry = Math.atan2(bx - ax, bz - az);
      box(g, M.steelDark, 0.3, 0.16, len, (ax + bx) / 2, FD + 0.06, l.z + (az + bz) / 2, ry);
      // The well's sides down through her flight deck to the deckhead of her
      // upper hangar. Under that it is open: an aeroplane brought down on
      // the lift is wheeled off it into the hangar.
      const trunk = box(g, M.steelDark, 0.24, FD - HANGAR_U_TOP, len,
        (ax + bx) / 2, (FD + HANGAR_U_TOP) / 2, l.z + (az + bz) / 2, ry);
      trunk.userData.inside = true;
    }
    // And the guide rails it runs on, a pair each side, from the hangar deck
    // up to the flight deck.
    for (const sgn of [-1, 1]) {
      for (const dz of [-l.hd + 1.6, l.hd - 1.6]) {
        box(g, M.gunDark, 0.3, FD - HANGAR_U, 0.3, sgn * (l.hw + 0.12), (FD + HANGAR_U) / 2, l.z + dz)
          .userData.inside = true;
      }
    }
  }
}

/**
 * Her three lifts, which with her guns are the only things on her that move.
 * Each is an octagonal platform, planked like the deck it is part of, on its
 * own grillage, with the shoes that ride the rails in the trunk; each is its
 * own group so the weld leaves it alone.
 */
function elevators(g) {
  const lifts = [];
  LIFTS.forEach((l, i) => {
    const lift = new THREE.Group();
    lift.position.set(0, FD, l.z);
    lift.userData.dynamic = true;
    g.add(lift);
    const pts = liftOutline(l.hw - 0.06, l.hd - 0.06, l.ch - 0.025);
    const pos = [];
    const uv = [];
    const idx = [];
    const n = pts.length;
    for (const [px, pz] of pts) { pos.push(px, 0.02, pz); uv.push(px, pz + l.z); }
    for (const [px, pz] of pts) { pos.push(px, -0.25, pz); uv.push(px, pz + l.z); }
    pos.push(0, 0.02, 0); uv.push(0, l.z);
    pos.push(0, -0.25, 0); uv.push(0, l.z);
    const hubTop = 2 * n;
    const hubBot = 2 * n + 1;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      idx.push(hubTop, j, k);
      idx.push(hubBot, n + k, n + j);
      idx.push(k, n + j, n + k, k, j, n + j);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    lift.add(new THREE.Mesh(geo, shokakuMaterials().deck));
    // Her grillage under it, shallow enough that the lift sits on the upper
    // hangar deck flush, its beams in the pit under it and clear of the
    // lower hangar's deckhead.
    for (let k = -3; k <= 3; k++) box(lift, M.steelDark, 0.26, 0.16, 2 * l.hd - 2.4, k * 1.8, -0.33, 0);
    box(lift, M.steelDark, 2 * l.hw - 1.2, 0.16, 0.5, 0, -0.33, 0);
    for (const sgn of [-1, 1]) {
      for (const dz of [-l.hd + 1.6, l.hd - 1.6]) {
        box(lift, M.steel, 0.48, 0.36, 0.5, sgn * (l.hw - 0.32), -0.2, dz);
      }
    }
    mergeStatic(lift);
    lifts.push({ group: lift, phase: i / 3 });
  });
  return lifts;
}

// ------------------------------------------------------------ her hangars --

/**
 * How far out a hangar goes at z: twenty-two metres across, or less where
 * her plating draws in -- never past her plating anywhere up the height of
 * the hangar, nor within a metre of it, where her galleries and her
 * passages run along her side.
 */
function hangarHalf(z, y0, y1) {
  let plating = Infinity;
  // The narrowest within a few metres: a wall is drawn straight between
  // stations, and a frame left standing across a recess is not her side.
  for (let dz = -3; dz <= 3; dz++) {
    for (let y = y0; y <= y1 + 1e-6; y += 0.5) {
      const w = platingAt(z + dz, y);
      if (w > 0) plating = Math.min(plating, w);
    }
  }
  return Math.max(0.5, Math.min(HANGAR_HW, plating - 1.2));
}

/**
 * One hangar: its deck, its deckhead, its two sides and its two ends, and
 * the frames, lights and fire curtains a hangar is from inside.
 */
function hangarDeck(g, y0, y1, z0, z1) {
  const half = (z) => hangarHalf(z, y0 + 0.5, y1);
  const N = 60;
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
  for (let z = z0 + 4; z < z1 - 2; z += 4.2) {
    const w = half(z);
    for (const sgn of [-1, 1]) {
      box(g, M.steelDark, 0.28, y1 - y0, 0.38, sgn * (w - 0.16), (y0 + y1) / 2, z).userData.inside = true;
    }
    // The deckhead beams, but not across a lift well: the lift comes down it.
    if (y1 === HANGAR_U_TOP && inWell(z, 0.4)) continue;
    box(g, M.steelDark, w * 2 - 0.4, 0.32, 0.28, 0, y1 - 0.2, z).userData.inside = true;
  }
  for (let z = z0 + 6; z < z1 - 4; z += 7) {
    if (y1 === HANGAR_U_TOP && inWell(z, 1.5)) continue;
    box(g, M.canvas, 0.6, 0.16, 2.2, 0, y1 - 1.1, z).userData.inside = true;
  }
  // The fire curtains that divide a Japanese hangar into its bays, rolled up
  // under the deckhead.
  for (const z of [z0 + (z1 - z0) * 0.3, z0 + (z1 - z0) * 0.62]) {
    if (y1 === HANGAR_U_TOP && inWell(z, 1)) continue;
    const w = half(z) - 0.3;
    box(g, M.gunDark, w * 2, 0.5, 0.26, 0, y1 - 0.5, z).userData.inside = true;
  }
}

/**
 * Her two hangars, and the upper one's deckhead opened over each lift well:
 * the well comes down through it to the upper hangar deck.
 */
function hangars(g) {
  hangarDeck(g, HANGAR_U, HANGAR_U_TOP, HANGAR_U_Z[0], HANGAR_U_Z[1]);
  hangarDeck(g, HANGAR_L, HANGAR_L_TOP, HANGAR_L_Z[0], HANGAR_L_Z[1]);
}

/** Half the span of a Zero, a Suisei and a B5N, spread, and of a B5N folded. */
const SPREAD_HALF = { fighter: 5.5, dive: 5.75, torpedo: 7.75 };
const FOLDED_B5N = 3.8;
/** How far over a deck her machines' origins stand: their wheels are at it. */
const WHEELS = 0.04;

function machine(g, kind, x, y, z, yaw, folded) {
  const build = { fighter: zero, dive: suisei, torpedo: b5n }[kind];
  const a = build(g, x, y, z, yaw, folded, { lod: true });
  // Only the set of wings she is standing with: the weld bakes whatever is in
  // the tree whether or not it is being drawn, so an aircraft struck below
  // with her spread wings still on her is wing welded through the ship's side.
  if (folded) a.userData.wings?.spread?.removeFromParent();
  else a.userData.wings?.stowed?.removeFromParent();
  return a;
}

/**
 * Where her air group is struck below, in both her hangars: a Kate either
 * side with her wings folded against her, and down the middle between them,
 * half a bay further aft, a Zero or a Suisei -- whose wings do not fold, or
 * fold only at the tips -- with her wings spread over the gap between the
 * Kates' tails and the next pair's noses. Clear of her lift wells in the
 * upper one. Every spot, what stands on it and whether she is folded.
 */
export function hangarSpots() {
  const spots = [];
  let mid = 0;
  for (const [y0, y1, [z0, z1]] of [[HANGAR_U, HANGAR_U_TOP, HANGAR_U_Z], [HANGAR_L, HANGAR_L_TOP, HANGAR_L_Z]]) {
    for (let z = z1 - 7; z > z0 + 6; z -= 14) {
      const w = hangarHalf(z, y0 + 0.5, y1);
      const clear = (zz, half) => !(y0 === HANGAR_U && inWell(zz, half));
      if (w >= 2 * FOLDED_B5N + 1.0 && clear(z, 6.5)) {
        const x = w - FOLDED_B5N - 0.4;
        spots.push({ x: -x, y: y0, z, kind: 'torpedo', folded: true });
        spots.push({ x, y: y0, z, kind: 'torpedo', folded: true });
      }
      const zm = z - 7;
      if (zm > z0 + 5 && hangarHalf(zm, y0 + 0.5, y1) >= SPREAD_HALF.dive + 0.5 && clear(zm, 5)) {
        spots.push({ x: 0, y: y0, z: zm, kind: mid++ % 2 ? 'dive' : 'fighter', folded: false });
      }
    }
  }
  return spots;
}

/**
 * Her air group: struck below, and a strike ranged aft on her deck with
 * wings spread, clear of the runway down her middle, the after lift and the
 * wires.
 *
 * Marked as inside, so a bomb through her flight deck finds aeroplanes under it.
 */
function airGroup(g) {
  for (const s of hangarSpots()) {
    const a = machine(g, s.kind, s.x, s.y + WHEELS, s.z, s.x < 0 ? 0.04 : s.x > 0 ? -0.04 : 0, s.folded);
    a.traverse((o) => { o.userData.inside = true; });
  }
  // The deck park, ranged abaft the middle lift and forward of the after one:
  // fighters first because they need the least deck, each with her inboard
  // wingtip clear of the widest wing that runs down the middle -- a B5N's --
  // and her outboard one inside the deck edge.
  const LANE = SPREAD_HALF.torpedo + 0.4;
  for (const [side, z, kind] of DECK_PARK) {
    const folded = kind === 'torpedo';
    const half = folded ? FOLDED_B5N : SPREAD_HALF[kind];
    machine(g, kind, side * (LANE + half), fdY(z) + WHEELS, z, side < 0 ? 0.06 : -0.06, folded);
  }
}
/** The strike ranged on her deck: which side, how far along her, and what. */
const DECK_PARK = [
  [-1, -66, 'fighter'], [1, -58, 'fighter'], [-1, -50, 'fighter'],
  [1, -42, 'dive'], [-1, -34, 'dive'], [1, -28, 'torpedo'],
];

// ------------------------------------------------------------ her guns --

/**
 * A mounting off the owner's model of it (see shokakuGun): what trains
 * stands at `y`, faces `rest`, and carries its barrels on a cradle about
 * their trunnions, laid back at the elevation the model stowed them at.
 */
function sculpted(g, kind, x, y, z, rest, trainRate, name) {
  const piece = shokakuGun(kind);
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = rest;
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = trainRate;
  if (name) m.userData.name = name;
  m.add(new THREE.Mesh(piece.house, shokakuMaterials().sheet));
  // The model's 10 cm gunhouse has a hatch or two in its roof, and the
  // gaps decimating it opened round the edges of its plates: under them is a
  // deckhead, not the turntable a gunhouse's height further down.
  if (kind === 'dp') m.add(liner());
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  cradle.rotation.x = -piece.pitch;
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, shokakuMaterials().sheet));
  m.add(cradle);
  arm(m, cradle, piece.muzzles);
  g.add(m);
  return m;
}

let linerGeo = null;
/** A deckhead inside her 10 cm gunhouse, short of its walls and its face. */
function liner() {
  if (!linerGeo) {
    linerGeo = new THREE.BoxGeometry(2.5, 0.04, 2.4);
    linerGeo.translate(0, 1.8, 0.05);
    const n = linerGeo.attributes.position.count;
    const c = new THREE.Color(0x5f6468);
    linerGeo.setAttribute('color', new THREE.BufferAttribute(
      new Float32Array(n * 3).map((_, i) => [c.r, c.g, c.b][i % 3]), 3));
  }
  return new THREE.Mesh(linerGeo, shokakuMaterials().sheet);
}

/** The seat the build measured for a mounting of her datasheet, by where it is. */
function seatFor(list, x, z, what) {
  let best = null, bd = Infinity;
  for (const s of list) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) { bd = d; best = s; }
  }
  if (!best || bd > 0.6) throw new Error(`the Shokaku has a ${what} at ${x}, ${z} her model does not`);
  return best;
}

const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);

/** Her 10 cm twins, in the order her datasheet lists them. */
function mainBattery(g) {
  const turrets = CLS.turrets.map((t) => {
    const s = seatFor(MOUNT_SEATS.dp, t.x, t.z, '10 cm twin');
    const m = sculpted(g, 'dp', s.x, s.y, s.z, stowed(t), CLS.gun.traverse, t.name);
    m.userData.rest = undefined;
    return m;
  });
  g.userData.turrets = turrets;
  return turrets;
}

/** Her light battery, in the order her datasheet lists it. */
function mountings(g) {
  const aa = [];
  const lights = lightMounts(CLS);
  for (const gun of CLS.aa.guns) {
    const kind = gun.caliber === 40 ? 'aa' : 'lt';
    for (const spec of gun.mounts) {
      const s = seatFor(MOUNT_SEATS[kind], spec.x, spec.z, `${gun.caliber} mm`);
      const a = sculpted(g, kind, s.x, s.y, s.z, stowed(spec), kind === 'aa' ? 0.6 : 0.8);
      a.userData.rest = 0;
      a.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = spec.lift || null;
      aa.push(a);
    }
  }
  if (aa.length !== lights.length) throw new Error('the Shokaku built a light battery her datasheet does not list');
  g.userData.aaMounts = aa;
  return { aa };
}

// ------------------------------------------------------------ her armour --

/**
 * Her armour, as structure inside her: none of it to be seen while her
 * plating is whole, all of it once a shell has opened her up.
 *
 *   the belt          165 mm abreast her magazines, 46 mm her machinery,
 *                     from under her waterline up to her lower hangar deck
 *   the armour deck   flat over the citadel under her lower hangar
 *   the bulkheads     that close the citadel at both ends
 */
const CITADEL = [-72, 76];
const ARMOUR_DECK = HANGAR_L - 0.35;
const BELT_TOP = HANGAR_L - 0.4;
const BELT_FOOT = -3.8;

function armour(g) {
  const inside = (o) => { if (o) o.userData.inside = true; return o; };
  const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
  const N = 56;
  const [z0, z1] = CITADEL;
  const belt = strip();
  for (let i = 0; i < N; i++) {
    const za = z0 + ((z1 - z0) * i) / N;
    const zb = z0 + ((z1 - z0) * (i + 1)) / N;
    for (const sgn of [-1, 1]) {
      belt.quad([sgn * at(za, BELT_TOP, 0.8), BELT_TOP, za], [sgn * at(za, BELT_FOOT, 0.8), BELT_FOOT, za],
        [sgn * at(zb, BELT_FOOT, 0.8), BELT_FOOT, zb], [sgn * at(zb, BELT_TOP, 0.8), BELT_TOP, zb], [-sgn, 0, 0]);
    }
  }
  inside(belt.mesh(g, M.armour));
  for (const up of [true, false]) {
    inside(sheet(g, M.armour, z0, z1, (z) => at(z, ARMOUR_DECK, 1.0), () => ARMOUR_DECK + (up ? 0.06 : -0.06), 48, up));
  }
  for (const z of [z0, z1]) {
    const bh = strip();
    const ys = [];
    for (let y = BELT_FOOT; y < BELT_TOP; y += 1.0) ys.push(y);
    ys.push(BELT_TOP);
    for (let i = 0; i < ys.length - 1; i++) {
      const wa = at(z, ys[i], 1.1);
      const wb = at(z, ys[i + 1], 1.1);
      for (const face of [1, -1]) {
        bh.quad([-wa, ys[i], z], [wa, ys[i], z], [wb, ys[i + 1], z], [-wb, ys[i + 1], z], [0, 0, face]);
      }
    }
    inside(bh.mesh(g, M.armour));
  }
}

// --------------------------------------------------------------- screws --

// Her four screws, each as the model drew it, on the end of its shaft.
let screwGeo = null;
function screws(g) {
  if (!screwGeo) screwGeo = SCREWS.map((s) => decodePiece(s.piece));
  SCREWS.forEach((s, i) => {
    const hub = new THREE.Group();
    hub.position.set(s.x, s.y, s.z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand: s.x < 0 ? -1 : 1 };
    hub.add(new THREE.Mesh(screwGeo[i], shokakuMaterials().sheet));
    g.add(hub);
  });
}

// ------------------------------------------------------------ deck cycle --

/** How far a lift goes down: to the upper hangar deck, flush with it. */
const LIFT_DROP = FD - HANGAR_U;
// The launch, phase by phase, in the evolution's own seconds: the lift up out
// of the hangar with her on it, the taxi to the spot, and the run-up against
// the brakes until the flag. Everything after that is flown.
const UP = 3.6;
const TAXIED = 7.4;
const ROLL = 9.0;
/**
 * Where she starts her run: well aft, a little forward of the wires, with the
 * whole of the deck ahead of her. She taxis aft off the after lift to it, and
 * runs over all three lifts, which are flush with the deck while an
 * evolution is on.
 */
const SPOT = FD_AFT + 24;
/** Where she picks up a wire: a little way up the deck from the round-down. */
function landZ() { return FD_AFT + 20; }

/**
 * The aeroplane that goes down her deck, and where it waits: a B5N for a
 * torpedo strike, a Suisei for a dive bombing one, and a Zero when it is
 * fighters going off. All three ride the same group; the ones not flying are
 * put out of sight.
 */
function deckAircraft(g) {
  const plane = new THREE.Group();
  plane.userData.dynamic = true;
  g.add(plane);
  const kinds = {};
  const make = (role, body, exhaust) => {
    const prop = body.userData.prop || null;
    kinds[role] = {
      body, prop,
      wings: null,
      fold: body.userData.fold || null,
      gear: body.userData.gear || null,
      blur: propBlur(prop),
      exhaust,
    };
  };
  make('torpedo', b5n(plane, 0, 0, 0, 0, true, {}), B5N.exhaust);
  make('fighter', zero(plane, 0, 0, 0, 0, false, {}), ZERO.exhaust);
  make('dive', suisei(plane, 0, 0, 0, 0, false, {}), SUISEI.exhaust);
  const out = { group: plane, kinds, role: 'torpedo' };
  out.pick = (role) => {
    const r = kinds[role] ? role : 'torpedo';
    for (const [k, v] of Object.entries(kinds)) v.body.visible = k === r;
    const k = kinds[r];
    out.role = r;
    out.prop = k.prop; out.wings = k.wings; out.fold = k.fold; out.gear = k.gear;
    out.blur = k.blur; out.exhaust = k.exhaust;
  };
  out.pick('torpedo');
  return out;
}

/** The deck plane's height over whatever she stands on: her wheels are at her origin. */
const ON = 0.04;

function below(deck, p, aft) {
  if (deck.owner && p.parent !== deck.owner) return;
  p.position.set(0, FD - LIFT_DROP + ON, aft.group.position.z - 0.4);
  p.rotation.set(0, 0.08, 0);
}

/**
 * Her deck cycle: the lifts working, and the launch when one is called for.
 *
 * Idle, each lift runs its own slow round -- at the flight deck, down the
 * well, on the upper hangar deck, back up -- staggered so the three are never
 * doing the same thing at once. A launch brings the after lift up with the
 * aircraft on it, she taxis aft to the spot, runs up against the brakes, and
 * goes down the deck and off over the bow.
 *
 * The whole time an evolution is on, every lift is at the flight deck: a lift
 * down the well is a hole across the runway, and an aeroplane taking off
 * across one is an aeroplane in the hangar.
 */
export function stepDeck(deck, t) {
  if (!deck) return;
  const { lifts, plane } = deck;
  const aft = lifts[lifts.length - 1];
  const pr = deck.profile;
  const FLOWN = pr ? pr.rows.length * pr.dt : 12;
  const LAUNCH = ROLL + FLOWN;
  const clock = deckClock(ROLL, FLOWN, deck.dur ?? DECK_RUN);
  const pace = clock.pace;
  const run = deck.launchAt === null || deck.launchAt === undefined
    ? -1 : clock.at(t - deck.launchAt);

  const dt = Math.max(0, Math.min(0.5, t - (deck.lastT ?? t)));
  deck.lastT = t;
  const ranging = run >= 0 && run < LAUNCH + 2;
  const FLUSH = 1.4;
  deck.flush = Math.max(0, Math.min(1,
    (deck.flush ?? 0) + (ranging ? dt / FLUSH : -dt / FLUSH)));

  const PERIOD = 42;
  const working = (run >= 0 && run < LAUNCH) || deck.landAt != null;
  for (const l of lifts) {
    if (l === aft && working) continue;
    let u = ((t / PERIOD) + l.phase) % 1;
    if (u < 0) u += 1;
    let k = 0;
    if (u < 0.36) k = 0;
    else if (u < 0.48) k = (u - 0.36) / 0.12;
    else if (u < 0.86) k = 1;
    else k = 1 - (u - 0.86) / 0.14;
    const idle = FD - LIFT_DROP * ease(k);
    l.group.position.y = idle + (FD - idle) * ease(deck.flush);
  }

  if (!plane) return;
  const p = plane.group;
  if (deck.owner && p.parent !== deck.owner) return;
  const AFT_Z = aft.group.position.z;
  // How far her wings are spread, 0 folded to 1 out.
  const wings = (out) => {
    const u = Math.max(0, Math.min(1, +out));
    if (plane.fold) { plane.fold(1 - u); return; }
    if (!plane.wings) return;
    plane.wings.spread.visible = u >= 0.5;
    plane.wings.stowed.visible = u < 0.5;
  };

  // Coming home: she picks up a wire over the round-down, rolls up the deck to
  // the after lift and the lift takes her below.
  if (deck.landAt != null) {
    const at = recoveryAt(t - deck.landAt, landZ(), AFT_Z - 0.4);
    if (!at.done) {
      p.visible = true;
      wings(at.wings);
      const ly = FD - LIFT_DROP * at.lift;
      aft.group.position.y = ly;
      p.position.set(0, ly + ON, at.z);
      p.rotation.set(0, 0, 0);
      if (plane.prop) plane.prop.rotation.z += at.turning * dt;
      return;
    }
    deck.landAt = null;
    deck.stowed = true;
    p.visible = false;
    below(deck, p, aft);
    return;
  }

  if (run < 0 || deck.airborne) {
    if (deck.stowed || deck.airborne) { p.visible = false; below(deck, p, aft); }
    return;
  }
  if (run >= LAUNCH) {
    if (!deck.airborne) deck.airborneAt = t;
    deck.airborne = true;
    p.visible = false;
    if (plane.gear) plane.gear(1);
    below(deck, p, aft);
    return;
  }

  // The evolution.
  p.visible = true;
  const spot = SPOT;
  let power = 0;
  let speed = 0;
  if (run < UP) {
    if (plane.gear) plane.gear(0);
    const u = ease(run / UP);
    aft.group.position.y = FD - LIFT_DROP * (1 - u);
    wings(Math.min(1, Math.max(0, (u - 0.3) / 0.6)));
    p.position.set(0, aft.group.position.y + ON, AFT_Z - 0.4);
    p.rotation.set(0, 0.08 * (1 - u), 0);
  } else if (run < ROLL) {
    aft.group.position.y = FD;
    wings(true);
    if (plane.gear) plane.gear(0);
    if (run < TAXIED) {
      const u = ease((run - UP) / (TAXIED - UP));
      p.position.set(0, FD + ON, AFT_Z - 0.4 + (spot - (AFT_Z - 0.4)) * u);
      p.rotation.set(0, 0, 0.006 * Math.sin(run * 9));
      power = 0.22;
    } else {
      power = 0.3 + 0.7 * Math.min(1, (run - TAXIED) / (ROLL - TAXIED));
      p.position.set(0, FD + ON, spot);
      p.rotation.set(-0.012 * Math.sin((run - TAXIED) * 22) * power, 0, 0);
    }
  } else {
    // And the run itself, flown out of the profile her own weight and wing
    // were integrated into.
    aft.group.position.y = FD;
    wings(true);
    power = 1;
    const i = Math.min(pr.rows.length - 1, Math.max(0, Math.round((run - ROLL) / pr.dt)));
    const [s2, h, th, up] = pr.rows[i];
    speed = rowSpeed(pr, i);
    p.position.set(0, FD + ON + h, spot + s2);
    p.rotation.set(-th, 0, 0);
    const off = pr.bow >= 0 ? (run - ROLL) - pr.bow : -1;
    if (plane.gear) plane.gear(up && off > 0 ? Math.min(1, off / 2.6) : 0);
  }
  {
    const START = 1.2;
    const el = t - deck.launchAt;
    const rate = propRate(engineStart(deck.engine || (deck.engine = {}), run >= START,
      el - START / pace, power, dt, deck.fx, p, plane.exhaust), speed, pr ? pr.vr : 30);
    if (plane.prop) plane.prop.rotation.z += rate * dt;
    if (plane.blur) plane.blur(rate);
  }
}

/** Kept for the tests and for anything that only wants the lifts moved. */
export function stepLifts(lifts, t) {
  stepDeck({ lifts, plane: null, launchAt: null }, t);
}

// ---------------------------------------------------------------- build ----

/** Her lines, for the interior and the tests. */
export const LINES = { loa: LOA, sheer: () => HANGAR_L, keelY, shellAt, zAt };

const STATIC = [
  ['hullModel', hullModel],
  ['runway', runway],
  ['deckMarks', deckMarks],
  ['liftWells', liftWells],
  ['hangars', hangars],
  ['armour', armour],
  ['airGroup', airGroup],
  ['screws', screws],
];

export function buildShokaku() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  // Her insides are fitted under her lower hangar deck: there is nothing under
  // that but her machinery and her magazines, and the hangars over it are
  // built above, by hand, because on a carrier they are the ship rather than
  // the accommodation in it.
  buildInterior(g, {
    loa: LOA, shellAt, keelY: (t) => keelY(t) + 0.15, sheer: () => HANGAR_L, zAt, hollow: true,
  });
  const lifts = elevators(g);
  const plane = deckAircraft(g);
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'shokaku';

  const deck = {
    lifts, plane, launchAt: null, landAt: null, stowed: true,
    owner: g, flush: 0, lastT: 0, airborne: false,
    pending: [], flightId: 0,
  };
  // One integrated run for each of her three types, from the spot to the bow.
  {
    const spot = SPOT;
    deck.profiles = deckProfiles(DECK_KINDS.ijn, FD_FWD - spot);
    deck.endPoses = {};
    for (const [role, pr] of Object.entries(deck.profiles)) {
      const end = pr.rows[pr.rows.length - 1];
      deck.endPoses[role] = { x: 0, y: FD + end[1] + ON, z: spot + end[0], pitch: end[2] };
    }
    deck.profile = deck.profiles.torpedo;
    deck.endPose = deck.endPoses.torpedo;
  }
  g.userData.deck = deck;
  g.userData.deckPlane = plane.group;
  g.userData.landingSpot = [0, FD + ON, landZ()];
  g.userData.step = (t) => stepDeck(deck, t);
  g.userData.launch = (t, role, dur = DECK_RUN) => {
    deck.launchAt = t;
    deck.landAt = null;
    deck.stowed = false;
    deck.airborne = false;
    deck.engine = {};
    deck.dur = dur;
    plane.pick(role);
    deck.profile = deck.profiles[plane.role];
    deck.endPose = deck.endPoses[plane.role];
    plane.group.visible = true;
  };
  g.userData.recover = (t = deck.lastT ?? 0, role = null) => {
    // The one that has just come down, not whichever went off last.
    if (role) plane.pick(role);
    deck.landAt = t;
    deck.launchAt = null;
    deck.stowed = false;
    deck.airborne = false;
    if (plane.gear) plane.gear(0);
    plane.group.visible = true;
  };
  g.userData.stow = () => {
    deck.airborne = false;
    deck.launchAt = null;
    deck.landAt = null;
    deck.stowed = true;
    plane.group.visible = false;
    below(deck, plane.group, lifts[lifts.length - 1]);
  };
  g.userData.stow();

  dressShip(g);
  return {
    group: g, turrets, lifts,
    deckPlane: plane.group,
    length: LOA, beam: BEAM, deckY: HANGAR_L, flightDeckY: FD,
    secMounts: [], aaMounts: g.userData.aaMounts || [], torpMounts: [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function shokakuParts() {
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

export { SHOKAKU_ISLAND as ISLAND, LIFTS, FD_FWD, FD_AFT, HANGAR_U, HANGAR_L, LIFT_DROP };
