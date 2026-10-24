// KMS Graf Zeppelin, drawn from the owner's sculpt of her.
//
// Germany's one aircraft carrier, launched at Kiel in 1938 and never
// finished: two hundred and sixty-two metres, thirty-three thousand tonnes at
// deep load, a flight deck over two hangars one above the other, three lifts
// down her centreline and two compressed-air catapults at the forward end of
// her flight deck. She was armed like the cruiser her designers knew how to
// build -- sixteen 15 cm in casemates in her sides against destroyers, and a
// heavy flak battery of 10.5 cm twins standing on her flight deck in line with
// her island -- because nobody in the Kriegsmarine had ever seen a carrier
// fight.
//
// The numbers everything here is built to:
//
//   length overall     262.5 m           beam             31.5 m
//   draught              9.6 m, as the sculpt floats her (8.5 m in her book)
//   flight deck         15.6 m over the water, 244 m long
//   hangars             two, upper and lower, 16 m across
//   lifts               three, octagonal, 13 x 14 m, on the centreline
//   belt                100 mm; armour deck 60 mm; flight deck 20 mm
//   battery             8 x 1  15 cm SK C/28 (the owner's single)
//                       6 x 2  10.5 cm SK C/33 (the owner's twin)
//                      10 x 2  3.7 cm SK C/30
//                       4 x 4  2 cm Flakvierling 38
//   air group           20 Bf 109T, 12 Ju 87C, 12 Ju 87D
//
// Her hull, her island, her funnel, her galleries and her sponsons are the
// sculpt (see build/prepare-grafzeppelin-hull.mjs, which clears her flight
// deck of everything that was left lying on it and takes her runway off
// her). Built here:
//
//   * her runway, laid afresh over the outline of her own flight deck: one
//     flat planked sheet, round-downs at both ends as the sculpt has them,
//     with her three lift wells cut through it exactly to their octagons, the
//     catapult tracks forward, the arrester wires aft and her centreline;
//   * her three lifts, which run, and the wells and trunks they run in;
//   * her two hangars and the aircraft struck below in them, and a range of
//     them on her deck aft;
//   * her guns -- the 15 cm singles in her casemates forward and on her
//     sponsons aft, the 10.5 cm twins on her flight deck, the 3.7 cm and the
//     2 cm in her sponsons -- each where her drawings put it, each training;
//   * the floors and the backs of her forward casemates, which the sculpt cast
//     its guns into;
//   * her four screws, which turn;
//   * her deck cycle: the lift up, the taxi, the run-up, and the run off the
//     bow, and coming home the other way;
//
// and, inside her, her armour and her interior, fitted to her own lines.
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, y = 0 is the
// waterline, and starboard is -X.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip, steelMap, woodMap } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { arm } from './mounts.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { DECK_RUN, lightMounts } from '../../../shared/sim.js';
import { box, cyl, strip, sheet } from './shipkit.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { threeSeven, twoCm } from './kmguns.js';
import { bf109, ju87c, ju87d } from './planekit.js';
import { BF109 } from './bf109Model.js';
import { JU87 } from './ju87Model.js';
import { engineStart } from './deckengine.js';
import { DECK_KINDS, propBlur, propRate, deckClock, deckProfiles, rowSpeed } from './deckplane.js';
import {
  GZ_HULL_B64, GZ_SURFACE, GZ_DECK, GZ_ISLAND, GZ_MOUNTS, GZ_GUNS, GZ_SCREWS, GZ_LINES,
} from './grafZeppelinHull.data.js';

const CLS = SHIP_CLASSES.grafzeppelin;
export const LOA = CLS.hull.length;
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;
/** Starboard, in this frame. */
const S = -1;

// The Kriegsmarine's light grey over everything, darker on her steel decks;
// her flight deck planked.
const P = {
  steel: 0x9a9fa3,
  steelDark: 0x6c7176,
  deckSteel: 0x5a6066,
  gun: 0x92979b,
  gunDark: 0x3e4349,
  cave: 0x15181b,
  armour: 0x4a5158,
  brass: 0x8a7340,
  stripe: 0xd8dce0,
  wire: 0x2a2d30,
  hangar: 0x7d8388,
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

// ----------------------------------------------------------- her sculpt --

let slicesCache = null;
const surface = surfaceOf(GZ_SURFACE);

/** Height of her surface at (x, z), her runway on it, or -99 off her. */
export const grafZeppelinSurfaceY = surface.surfaceY;
/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const grafZeppelinSeatY = surface.seatY;

let mats = null;
export function grafZeppelinMaterials() {
  if (mats) return mats;
  const plate = steelMap();
  const planks = woodMap();
  mats = {
    plating: new THREE.MeshPhongMaterial({
      vertexColors: true, map: plate, specularMap: plate,
      specular: 0x3a4148, shininess: 30,
    }),
    gunhouse: new THREE.MeshPhongMaterial({
      color: P.gun, map: plate, specularMap: plate, specular: 0x3a4148, shininess: 30,
    }),
    // Her flight deck: pine planking, weathered grey, as a German deck was
    // laid over its steel.
    deck: new THREE.MeshPhongMaterial({
      color: 0xa79f8c, map: planks, specularMap: planks, specular: 0x16181c, shininess: 5,
    }),
  };
  return mats;
}

/** Add the sculpted hull, painted and textured, as its length-wise slices. */
function hullModel(g) {
  if (!slicesCache) slicesCache = decodeSlices(GZ_HULL_B64);
  const m = grafZeppelinMaterials();
  for (const geo of slicesCache) g.add(new THREE.Mesh(geo, m.plating));
}

const guns = new Map();
/**
 * One of her guns as the owner sculpted it -- 'single' the 15 cm in its
 * shield, 'flak' the 10.5 cm twin -- decoded once, in the frame of its
 * mounting: the pivot at the origin, the foot of what trains at y = 0, the
 * bore along +Z; and where its trunnions and muzzles are.
 */
export function grafZeppelinGun(kind) {
  if (!guns.has(kind)) {
    const p = GZ_GUNS[kind];
    guns.set(kind, {
      house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
      trunnion: p.trunnion, muzzles: p.muzzles, roof: p.roof,
    });
  }
  return guns.get(kind);
}

// ------------------------------------------------------------- her lines --

const L = GZ_LINES;
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

// ------------------------------------------------------------ her decks --

/** Her flight deck. */
export const FD = GZ_DECK.y;
/** Her upper hangar deck and its deckhead, and her lower hangar deck and its. */
const HANGAR_U = 9.4;
const HANGAR_U_TOP = FD - 1.1;
const HANGAR_L = 3.8;
const HANGAR_L_TOP = HANGAR_U - 0.45;
/** How far each runs fore and aft; both are 16 m across where she is wide enough. */
// The upper hangar ends abaft her forward casemates: forward of them her
// side is open under her flight deck.
const HANGAR_U_Z = [-92, 74];
const HANGAR_L_Z = [-84, 70];
const HANGAR_HW = 8.0;

/** How far out her runway goes each way at z, 0 off it. */
function planAt(side, z) {
  const f = (z - GZ_DECK.z0) / GZ_DECK.dz;
  const i = Math.floor(f);
  if (i < 0 || i >= GZ_DECK.nz - 1) return 0;
  const u = f - i;
  return GZ_DECK[side][i] * (1 - u) + GZ_DECK[side][i + 1] * u;
}
/** The forward and after ends of her runway. */
const FD_FWD = (() => { let z = 0; while (planAt('port', z + 0.5) > 0) z += 0.5; return z; })();
const FD_AFT = (() => { let z = 0; while (planAt('port', z - 0.5) > 0) z -= 0.5; return z; })();
/**
 * How far her runway falls away at its ends: flat between `GZ_DECK.flat`,
 * and rounded down as the sculpt has it beyond -- a metre and a third at
 * the after end, which is the round-down a pilot coming aboard sees, and a
 * metre at the forward lip.
 */
const ROUND_AFT = [[0, 0], [2.2, 0.11], [5.0, 0.26], [7.7, 0.33], [10.5, 0.5], [13.3, 1.13], [15.3, 1.34]];
const ROUND_FWD = [[0, 0], [1.0, 0.2], [2.1, 1.0]];
function table(tab, d) {
  if (d <= 0) return 0;
  for (let i = 1; i < tab.length; i++) {
    if (d <= tab[i][0]) {
      const [a, ya] = tab[i - 1];
      const [b, yb] = tab[i];
      return ya + ((yb - ya) * (d - a)) / (b - a);
    }
  }
  return tab[tab.length - 1][1];
}
/** Her runway's height at z. */
export function fdY(z) {
  if (z < GZ_DECK.flat.aft) return FD - table(ROUND_AFT, GZ_DECK.flat.aft - z);
  if (z > GZ_DECK.flat.fwd) return FD - table(ROUND_FWD, z - GZ_DECK.flat.fwd);
  return FD;
}

/** Her lifts: where along her each is, and their octagon. */
const LIFTS = [58, 14, -40];
const LIFT_HW = 6.5;
const LIFT_HD = 7.0;
const LIFT_CH = 2.2;
/** The octagon a lift is cut to, round its own middle, given its half-width, half-depth and the cut off its corners. */
function liftOutline(hw = LIFT_HW, hd = LIFT_HD, ch = LIFT_CH) {
  return [
    [-hw + ch, -hd], [hw - ch, -hd], [hw, -hd + ch], [hw, hd - ch],
    [hw - ch, hd], [-hw + ch, hd], [-hw, hd - ch], [-hw, -hd + ch],
  ];
}
/** How far either side of the centreline the octagon of a lift well is, `dz` from its middle. */
function wellHalf(dz) {
  const a = Math.abs(dz);
  if (a > LIFT_HD) return 0;
  if (a <= LIFT_HD - LIFT_CH) return LIFT_HW;
  return LIFT_HW - (a - (LIFT_HD - LIFT_CH));
}

// ------------------------------------------------------------- her runway --

/**
 * Her runway: one planked sheet over the outline of her flight deck, with
 * her lift wells cut out of it to their octagons.
 *
 * It is laid in bands across her, half a metre deep, and a band boundary at
 * every corner of every octagon, so that inside any one band each side of a
 * well is a single straight edge and the sheet beside it a single trapezium:
 * the edge of the well is the edge of the planking, exactly, and not a run of
 * steps a half metre long.
 */
function runway(g) {
  const zs = [];
  for (let z = FD_AFT; z <= FD_FWD + 1e-6; z += 0.5) zs.push(z);
  for (const lz of LIFTS) for (const dz of [-LIFT_HD, -LIFT_HD + LIFT_CH, LIFT_HD - LIFT_CH, LIFT_HD]) zs.push(lz + dz);
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
    const lift = LIFTS.find((lz) => (za + zb) / 2 > lz - LIFT_HD && (za + zb) / 2 < lz + LIFT_HD);
    if (lift === undefined) {
      quad(la, ra, za, lb, rb, zb);
      continue;
    }
    const ea = wellHalf(za - lift), eb = wellHalf(zb - lift);
    quad(la, -ea, za, lb, -eb, zb);
    quad(ea, ra, za, eb, rb, zb);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const deck = new THREE.Mesh(geo, grafZeppelinMaterials().deck);
  deck.userData.deck = true;
  g.add(deck);
  return deck;
}

/**
 * Her deck markings: a broken white centreline, the two catapult tracks
 * forward, and the arrester wires across her after end with the sheaves at
 * their ends.
 */
function deckMarks(g) {
  const y = FD + 0.04;
  for (let z = FD_AFT + 10; z < FD_FWD - 8; z += 12) {
    if (LIFTS.some((lz) => Math.abs(z - lz) < LIFT_HD + 3.5)) continue;
    box(g, M.stripe, 0.5, 0.03, 6, 0, fdY(z) + 0.035, z);
  }
  // The two catapults, port and starboard of the centreline over her forward
  // end: a long slot in the deck with the shuttle in it, from abreast her
  // forward lift to near the lip, where the cradle threw the aeroplane off.
  for (const x of [-4.4, 4.4]) {
    box(g, M.deckSteel, 1.0, 0.05, 36, x, y, 86);
    box(g, M.cave, 0.22, 0.06, 35, x, y + 0.01, 86);
    box(g, M.gunDark, 0.7, 0.18, 1.6, x, y + 0.09, 69);
  }
  // Arrester wires, across her after end where an aeroplane coming aboard
  // picks one up.
  for (let z = FD_AFT + 16; z <= FD_AFT + 46; z += 6) {
    const half = Math.min(planAt('stbd', z), planAt('port', z)) - 1.2;
    const w = cyl(g, M.wire, 0.05, 0.05, half * 2, 0, fdY(z) + 0.12, z, 6);
    w.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) cyl(g, M.gunDark, 0.18, 0.2, 0.22, s * half, fdY(z) + 0.11, z, 10);
  }
}

// ------------------------------------------------------ her lift wells --

/** The wells, cut through her flight deck: coamings, trunks and guide rails. */
function liftWells(g) {
  for (const z of LIFTS) {
    const pts = liftOutline(LIFT_HW + 0.05, LIFT_HD + 0.05, LIFT_CH);
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[(i + 1) % pts.length];
      const len = Math.hypot(bx - ax, bz - az) + 0.2;
      const ry = Math.atan2(bx - ax, bz - az);
      box(g, M.steelDark, 0.3, 0.16, len, (ax + bx) / 2, FD + 0.06, z + (az + bz) / 2, ry);
      // The trunk down to the upper hangar deck, so the well is a well and
      // not a hole with her insides open under it.
      const trunk = box(g, M.steelDark, 0.24, FD - HANGAR_U, len,
        (ax + bx) / 2, (FD + HANGAR_U) / 2, z + (az + bz) / 2, ry);
      trunk.userData.inside = true;
    }
    for (const sgn of [-1, 1]) {
      for (const dz of [-LIFT_HD + 1.6, LIFT_HD - 1.6]) {
        box(g, M.gunDark, 0.3, FD - HANGAR_U, 0.3, sgn * (LIFT_HW + 0.12), (FD + HANGAR_U) / 2, z + dz)
          .userData.inside = true;
      }
    }
  }
}

/**
 * Her three lifts, which with her guns are the only things on her that move.
 *
 * Each is an octagonal platform, planked like the deck it is part of, on its
 * own grillage, with the shoes that ride the rails in the trunk. Each is its
 * own group so the weld leaves it alone.
 */
function elevators(g) {
  const lifts = [];
  LIFTS.forEach((z, i) => {
    const lift = new THREE.Group();
    lift.position.set(0, FD, z);
    lift.userData.dynamic = true;
    g.add(lift);
    // A hand's clearance all round inside the well, and no more: across the
    // corners an inset of the sides alone opens a gap a foot wide.
    const pts = liftOutline(LIFT_HW - 0.06, LIFT_HD - 0.06, LIFT_CH - 0.025);
    const pos = [];
    const uv = [];
    const idx = [];
    const n = pts.length;
    for (const [px, pz] of pts) { pos.push(px, 0.02, pz); uv.push(px, pz + z); }
    for (const [px, pz] of pts) { pos.push(px, -0.5, pz); uv.push(px, pz + z); }
    pos.push(0, 0.02, 0); uv.push(0, z);
    pos.push(0, -0.5, 0); uv.push(0, z);
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
    lift.add(new THREE.Mesh(geo, grafZeppelinMaterials().deck));
    for (let k = -3; k <= 3; k++) box(lift, M.steelDark, 0.26, 0.4, 2 * LIFT_HD - 2.4, k * 1.9, -0.72, 0);
    box(lift, M.steelDark, 2 * LIFT_HW - 1.2, 0.32, 0.5, 0, -0.94, 0);
    for (const sgn of [-1, 1]) {
      for (const dz of [-LIFT_HD + 1.6, LIFT_HD - 1.6]) {
        box(lift, M.steel, 0.48, 0.6, 0.5, sgn * (LIFT_HW - 0.32), -0.48, dz);
      }
    }
    mergeStatic(lift);
    lifts.push({ group: lift, phase: i / 3 });
  });
  return lifts;
}

// ------------------------------------------------------------ her hangars --

/**
 * How far out a hangar goes at z: sixteen metres across, or her own breadth
 * less her side and the passage beside it -- and never past her plating
 * anywhere up the height of the hangar, which is narrower than her lines
 * where her boat recesses are let into her side aft.
 */
function hangarHalf(z, y) {
  const I = L.inner;
  const k = Math.round((z - I.z0) / I.dz);
  const band = I[y < HANGAR_U ? 'lower' : 'upper'];
  // The narrowest within a few metres: a wall is drawn straight between
  // stations, and a frame left standing across a recess is not her side.
  let plating = Infinity;
  for (let j = k - 3; j <= k + 3; j++) if (j >= 0 && j < I.nz && band[j] > 0) plating = Math.min(plating, band[j] - 0.5);
  return Math.min(HANGAR_HW, shellAt((2 * z) / LOA, y) - 1.4, plating);
}

/**
 * One hangar: its deck, its deckhead, its two sides and its two ends, and
 * the frames, lights and fire curtains a hangar is from inside.
 */
function hangarDeck(g, y0, y1, z0, z1) {
  const half = (z) => Math.max(0.5, hangarHalf(z, y0 + 0.5));
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
    box(g, M.steelDark, w * 2 - 0.4, 0.32, 0.28, 0, y1 - 0.2, z).userData.inside = true;
  }
  for (let z = z0 + 6; z < z1 - 4; z += 7) box(g, M.canvas, 0.6, 0.16, 2.2, 0, y1 - 1.1, z).userData.inside = true;
  for (const z of [z0 + (z1 - z0) * 0.3, z0 + (z1 - z0) * 0.62]) {
    const w = half(z) - 0.3;
    box(g, M.gunDark, w * 2, 0.5, 0.26, 0, y1 - 0.5, z).userData.inside = true;
  }
}

function hangars(g) {
  hangarDeck(g, HANGAR_U, HANGAR_U_TOP, HANGAR_U_Z[0], HANGAR_U_Z[1]);
  hangarDeck(g, HANGAR_L, HANGAR_L_TOP, HANGAR_L_Z[0], HANGAR_L_Z[1]);
}

/**
 * Her air group, struck below with their wings folded -- two abreast in her
 * narrow hangars -- and a strike ranged aft on her deck with wings spread,
 * clear of the runway down her middle, the after lift and the wires.
 *
 * Marked as inside, so a bomb through her flight deck finds aeroplanes under it.
 */
function airGroup(g) {
  const build = { fighter: bf109, dive: ju87c, torpedo: ju87d };
  const kinds = ['fighter', 'fighter', 'dive', 'torpedo'];
  let k = 0;
  for (const [y0, [z0, z1]] of [[HANGAR_U, HANGAR_U_Z], [HANGAR_L, HANGAR_L_Z]]) {
    for (let z = z0 + 9; z < z1 - 9; z += 13) {
      if (y0 === HANGAR_U && LIFTS.some((lz) => Math.abs(z - lz) < LIFT_HD + 5)) continue;
      const w = hangarHalf(z, y0 + 0.5);
      if (w < 6) continue;
      for (const x of [-3.4, 3.4]) {
        const kind = kinds[k++ % kinds.length];
        const a = build[kind](g, x, y0 + 0.02, z, x < 0 ? 0.05 : -0.05, true, { lod: true });
        a.traverse((o) => { o.userData.inside = true; });
      }
    }
  }
  // The deck park: a strike ranged aft, fighters first because they need the
  // least deck. Her deck aft is twenty-six metres across, and a Stuka's
  // wing down the middle of it is fourteen: so they are ranged with their
  // wings folded back, either side of the lane, each with its inboard edge
  // clear of the widest wing that runs down it.
  const LANE = AERO_HALF + 0.4;
  const ranged = [
    [1, -112, 'fighter'], [-1, -104, 'fighter'], [1, -96, 'fighter'],
    [-1, -86, 'dive'], [1, -76, 'dive'], [-1, -66, 'torpedo'],
  ];
  for (const [side, z, kind] of ranged) {
    const a = build[kind](g, 0, fdY(z) + 0.05, z, side < 0 ? 0.05 : -0.05, true, { lod: true });
    // How far she stands out from her own centreline, folded, read off her.
    a.updateMatrixWorld(true);
    const box3 = new THREE.Box3().setFromObject(a);
    const half = Math.max(-box3.min.x, box3.max.x);
    a.position.x = side * (LANE + half);
  }
}

/** Half the span of the widest aeroplane that goes down her deck: a Stuka's. */
const AERO_HALF = 13.8 / 2;

// ------------------------------------------------------------ her guns --

/**
 * A mounting off one of the owner's sculpts of it: what trains stands at `y`
 * on its deck or floor, faces `rest`, and carries its barrels on a cradle
 * about their trunnions. `bores` draws the barrels their own length where the
 * sculpt's are stubs.
 */
function sculpted(g, piece, x, y, z, rest, trainRate, bores = null) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = rest;
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = trainRate;
  m.add(new THREE.Mesh(piece.house, grafZeppelinMaterials().gunhouse));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, M.gun));
  let muzzles = piece.muzzles;
  if (bores) {
    muzzles = piece.muzzles.map(([mx]) => [mx, 0, bores.len]);
    for (const [mx] of piece.muzzles) {
      cyl(cradle, M.gun, bores.r * 0.8, bores.r, bores.len, mx, 0, bores.len / 2, 10).rotation.x = Math.PI / 2;
      cyl(cradle, M.gunDark, bores.r * 0.95, bores.r * 0.95, 0.22, mx, 0, bores.len - 0.11, 10).rotation.x = Math.PI / 2;
    }
  }
  m.add(cradle);
  arm(m, cradle, muzzles);
  g.add(m);
  return m;
}

/**
 * Where each of her 15 cm stands: on the floor the gun the sculpt cast there
 * was carved down to (see build/prepare-grafzeppelin-hull.mjs). The datasheet
 * carries the height of the muzzle; this is the height of the deck under it.
 */
function seatOf(spec) {
  const s = GZ_MOUNTS.secondary.find((m) => Math.abs(m.x - spec.x) < 0.05 && Math.abs(m.z - spec.z) < 0.05);
  if (!s) throw new Error(`the Graf Zeppelin has no floor for a 15 cm at ${spec.x}, ${spec.z}`);
  return s.seat;
}

/**
 * Where each of her light guns stands: her 10.5 cm on their bases on her
 * runway, and the rest on the sponson, tub or deck the sculpt has under
 * them. The datasheet carries the height of the muzzle; this is the height
 * of the platform under it.
 */
const BASE_TOP = 0.32;
function lightSeat(gun, m) {
  if (gun.caliber === 105) return FD + BASE_TOP;
  return LIGHT_SEATS.get(`${m.x},${m.z}`) ?? grafZeppelinSeatY(m.x, m.z, 1.0);
}
/** The platforms her light guns stand on, as the sculpt has them. */
const LIGHT_SEATS = new Map([
  ['-16.5,37', 9.2], ['16.5,37', 9.2],
  ['-16.4,-3.3', 11.3], ['16.4,-3.3', 11.3],
  ['-16.75,-50.35', 12.16], ['16.75,-50.35', 12.16],
  ['-15.5,-72.4', 12.73], ['15.5,-72.4', 12.73],
  ['-12.9,-115.85', 11.65], ['12.9,-115.85', 11.65],
  ['-3.4,116', 9.5], ['3.4,116', 9.5],
  ['-12.8,-15.2', 15.18], ['12.8,-15.2', 15.6],
]);

/** The back wall of her forward casemate, at z: where the sculpt's wall line runs. */
const casemateWall = (z) => 7.24 + 0.1317 * (97 - z);

/**
 * Her 15 cm singles, in the order her datasheet lists them: starboard
 * forward to aft, then port. The four in her forward casemates lay from
 * their ports -- see the game's gun sight, which carries the layer's eye out
 * through the port a casemate gun looks out of.
 */
function mainBattery(g) {
  const piece = grafZeppelinGun('single');
  const turrets = CLS.turrets.map((spec) => {
    const seat = seatOf(spec);
    const m = sculpted(g, piece, spec.x, seat, spec.z, spec.rest, CLS.gun.traverse);
    m.userData.rest = undefined;
    m.userData.name = spec.name;
    if (spec.z > 70) {
      // The port it looks out of: the mouth of the casemate, a little
      // outboard of the shield, as long as the recess lets it be.
      const out = Math.sign(spec.x);
      m.userData.casemate = {
        x: out * (Math.abs(spec.x) + 2.4), y: seat + piece.trunnion[1], z: spec.z,
        half: 3.6, high: 1.5,
      };
    }
    return m;
  });
  g.userData.turrets = turrets;
  return turrets;
}

/**
 * The floors her forward 15 cm stand on, and the backs of the casemate
 * behind them: a steel deck from the wall out past each gun's shield, and a
 * dark bulkhead along the wall, so the casemate is a casemate and not a hole
 * in her side.
 */
function casemates(g) {
  for (const spec of CLS.turrets) {
    if (spec.z < 70) continue;
    const s = Math.sign(spec.x);
    const wall = casemateWall(spec.z);
    const outer = Math.abs(spec.x) + 3.1;
    const floor = seatOf(spec);
    box(g, M.deckSteel, outer - wall + 0.6, 0.35, 5.6, s * (wall - 0.3 + outer) / 2, floor - 0.175, spec.z);
    box(g, M.steelDark, outer - wall + 0.6, 0.6, 5.8, s * (wall - 0.3 + outer) / 2, floor - 0.6, spec.z);
    // The back of it, closing her side behind the gun where the sculpt's
    // cast-in gun was taken away: plated, the height of the shield.
    box(g, M.steelDark, 0.14, 4.1, 5.8, s * (wall - 0.4), floor + 2.05, spec.z);
  }
  // And the low ring each after 15 cm trains on, on her ledge.
  for (const spec of CLS.turrets) {
    if (spec.z > 70) continue;
    cyl(g, M.steelDark, 1.9, 2.0, 0.22, spec.x, seatOf(spec) + 0.08, spec.z, 24);
  }
}

const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);

/** Her light battery, in the order her datasheet lists it. */
function mountings(g) {
  const flak = grafZeppelinGun('flak');
  const aa = [];
  const lights = lightMounts(CLS);
  for (const gun of CLS.aa.guns) {
    for (const m of gun.mounts) {
      let a;
      const y = lightSeat(gun, m);
      if (gun.caliber === 105) {
        a = sculpted(g, flak, m.x, y, m.z, stowed(m), 0.3, { r: 0.075, len: 4.8 });
      } else if (gun.caliber === 37) {
        a = threeSeven(g, M, m.x, y, m.z, stowed(m));
      } else {
        a = twoCm(g, M, m.x, y, m.z, stowed(m), m.guns === 4);
      }
      a.userData.rest = 0;
      a.userData.sector = { angle: m.angle, arc: m.arc, stow: stowed(m) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = m.lift || null;
      aa.push(a);
    }
  }
  if (aa.length !== lights.length) throw new Error('the Graf Zeppelin built a light battery her datasheet does not list');
  g.userData.aaMounts = aa;
  return { aa };
}

/**
 * The round bases her 10.5 cm turrets train on, standing on her runway, and
 * the platforms her light guns stand on where her sponson is not a floor.
 */
function gunBases(g) {
  for (const gun of CLS.aa.guns) {
    for (const m of gun.mounts) {
      if (gun.caliber === 105) {
        cyl(g, M.steelDark, 2.7, 2.8, BASE_TOP - 0.04, m.x, FD + (BASE_TOP - 0.04) / 2, m.z, 28);
        cyl(g, M.steel, 2.55, 2.55, 0.05, m.x, FD + BASE_TOP - 0.02, m.z, 28);
      } else {
        const r = gun.caliber === 37 ? 1.5 : 1.3;
        const seat = lightSeat(gun, m);
        const foot = grafZeppelinSeatY(m.x, m.z, r);
        const lo = foot > -50 ? Math.min(foot, seat) : seat - 0.4;
        const h = Math.max(0.2, seat - lo + 0.02);
        cyl(g, M.steelDark, r, r + 0.08, h, m.x, seat + 0.02 - h / 2, m.z, 18);
      }
    }
  }
}

// ------------------------------------------------------------ her armour --

/**
 * Her armour, as structure inside her: none of it to be seen while her
 * plating is whole, all of it once a shell has opened her up.
 *
 *   the belt          100 mm abreast her machinery and magazines, from under
 *                     her waterline up to her lower hangar deck
 *   the armour deck   60 mm, flat over the citadel under her lower hangar
 *   the bulkheads     that close the citadel at both ends
 */
const CITADEL = [-78, 80];
const ARMOUR_DECK = HANGAR_L - 0.35;
const BELT_TOP = HANGAR_L - 0.4;
const BELT_FOOT = -3.6;

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

/**
 * One blade of a screw, standing out from the hub along +y: a broad, rounded
 * blade, widest two thirds of the way out, a plate thin fore and aft.
 */
function bladeGeometry(r) {
  const root = 0.4, n = 14;
  const shape = new THREE.Shape();
  const half = (u) => r * 0.36 * Math.sin(Math.PI * Math.min(1, 0.12 + u * 0.95)) ** 0.7 + 0.12;
  shape.moveTo(-half(0), root);
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    shape.lineTo(-half(u) * (1 - 0.3 * u), root + u * (r - root));
  }
  for (let i = n; i >= 0; i--) {
    const u = i / n;
    shape.lineTo(half(u) * (1 + 0.15 * u), root + u * (r - root));
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: false, curveSegments: 4 });
  geo.translate(0, 0, -0.045);
  return geo;
}

/**
 * Her four screws, three-bladed, on the ends of her shafts where the sculpt
 * drew them, the two sides handed against each other: each blade stands out
 * from the hub across the shaft and is set at her pitch to it.
 */
function screws(g) {
  GZ_SCREWS.forEach((s) => {
    const hub = new THREE.Group();
    hub.position.set(s.x, s.y, s.z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand: Math.sign(s.x) || 1 };
    cyl(hub, M.brass, 0.45, 0.34, 0.85, 0, 0, 0, 14).rotation.x = Math.PI / 2;
    cyl(hub, M.brass, 0.34, 0.08, 0.7, 0, 0, -0.78, 12).rotation.x = Math.PI / 2;
    const geo = bladeGeometry(s.r);
    for (let k = 0; k < 3; k++) {
      const arm = new THREE.Group();
      arm.rotation.z = (k / 3) * Math.PI * 2;
      const bl = new THREE.Mesh(geo, M.brass);
      bl.rotation.y = 0.55 * hub.userData.screw.hand;
      arm.add(bl);
      hub.add(arm);
    }
    g.add(hub);
  });
}

// ------------------------------------------------------------ deck cycle --

const LIFT_DROP = FD - HANGAR_U - 0.55;
// The launch, phase by phase, in the evolution's own seconds: the lift up out
// of the hangar with her on it, the taxi forward to the spot, and the run-up
// against the brakes until the flag. Everything after that is flown.
const UP = 3.6;
const TAXIED = 7.4;
const ROLL = 9.0;
/**
 * Where she starts her run: well aft, a little forward of the wires, with the
 * whole of the deck ahead of her. A Stuka with a torpedo under her is five
 * and a half tonnes on a draggy wing, and from forward of the after lift she
 * went off the bow still sinking: so she taxis aft off the lift instead, and
 * runs over all three lifts, which are flush with the deck while an
 * evolution is on.
 */
const SPOT = FD_AFT + 24;
/** Where she picks up a wire: a little way up the deck from the round-down. */
function landZ() { return FD_AFT + 20; }

/**
 * The aeroplane that goes down her deck, and where it waits: a Ju 87D for a
 * torpedo strike, a Ju 87C for a dive bombing one, and a Bf 109 when it is
 * fighters going off. All three ride the same group; the ones not flying are
 * put out of sight.
 */
function deckAircraft(g) {
  const plane = new THREE.Group();
  plane.userData.dynamic = true;
  g.add(plane);
  const kinds = {};
  // Each with her stacks, either side of the cowling behind the airscrew, as
  // her sculpt has them.
  const make = (role, body, exhaust) => {
    const prop = body.userData.prop || null;
    kinds[role] = {
      body, prop,
      wings: body.userData.wings || null,
      fold: body.userData.fold || null,
      gear: body.userData.gear || null,
      blur: propBlur(prop),
      exhaust,
    };
  };
  make('fighter', bf109(plane, 0, 0, 0, 0, false, {}), BF109.exhaust);
  make('dive', ju87c(plane, 0, 0, 0, 0, false, {}), JU87.exhaust);
  make('torpedo', ju87d(plane, 0, 0, 0, 0, false, {}), JU87.exhaust);
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

function below(deck, p, aft) {
  if (deck.owner && p.parent !== deck.owner) return;
  p.position.set(0, FD - LIFT_DROP + 0.05, aft.group.position.z - 0.4);
  p.rotation.set(0, 0.08, 0);
}

/**
 * Her deck cycle: the lifts working, and the launch when one is called for.
 *
 * Idle, each lift runs its own slow round -- at the flight deck, down the
 * well, on the upper hangar deck, back up -- staggered so the three are never
 * doing the same thing at once. A launch brings the after lift up with the
 * aircraft on it, she taxis forward to the spot, runs up against the brakes,
 * and goes down the deck and off over the bow.
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
  // How far her wings are spread, 0 folded to 1 out: the sculpts swing their
  // outer panels back along their sides.
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
    const k = t - deck.landAt;
    if (k < 3.0) {
      const u = ease(k / 3.0);
      p.visible = true;
      wings(true);
      aft.group.position.y = FD;
      p.position.set(0, FD + 0.05, landZ() + (AFT_Z - landZ()) * u);
      p.rotation.set(0, 0, 0);
      return;
    }
    if (k < 6.4) {
      const u = ease((k - 3.0) / 3.4);
      wings(1 - Math.min(1, (k - 3.0) / 1.6));
      aft.group.position.y = FD - LIFT_DROP * u;
      p.position.set(0, FD - LIFT_DROP * u + 0.05, AFT_Z - 0.4);
      p.visible = true;
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
    p.position.set(0, aft.group.position.y + 0.05, AFT_Z - 0.4);
    p.rotation.set(0, 0.08 * (1 - u), 0);
  } else if (run < ROLL) {
    aft.group.position.y = FD;
    wings(true);
    if (plane.gear) plane.gear(0);
    if (run < TAXIED) {
      const u = ease((run - UP) / (TAXIED - UP));
      p.position.set(0, FD + 0.05, AFT_Z - 0.4 + (spot - (AFT_Z - 0.4)) * u);
      p.rotation.set(0, 0, 0.006 * Math.sin(run * 9));
      power = 0.22;
    } else {
      power = 0.3 + 0.7 * Math.min(1, (run - TAXIED) / (ROLL - TAXIED));
      p.position.set(0, FD + 0.05, spot);
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
    p.position.set(0, FD + 0.05 + h, spot + s2);
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
  ['casemates', casemates],
  ['gunBases', gunBases],
  ['armour', armour],
  ['airGroup', airGroup],
  ['screws', screws],
];

export function buildGrafZeppelin() {
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
  g.userData.classId = 'grafzeppelin';

  const deck = {
    lifts, plane, launchAt: null, landAt: null, stowed: true,
    owner: g, flush: 0, lastT: 0, airborne: false,
    pending: [], flightId: 0,
  };
  // One integrated run for each of her three types, from the spot to the bow.
  {
    const spot = SPOT;
    deck.profiles = deckProfiles(DECK_KINDS.ger, FD_FWD - spot);
    deck.endPoses = {};
    for (const [role, pr] of Object.entries(deck.profiles)) {
      const end = pr.rows[pr.rows.length - 1];
      deck.endPoses[role] = { x: 0, y: FD + end[1] + 0.05, z: spot + end[0], pitch: end[2] };
    }
    deck.profile = deck.profiles.torpedo;
    deck.endPose = deck.endPoses.torpedo;
  }
  g.userData.deck = deck;
  g.userData.deckPlane = plane.group;
  g.userData.landingSpot = [0, FD + 0.05, landZ()];
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
  g.userData.recover = (t = deck.lastT ?? 0) => {
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
export function grafZeppelinParts() {
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

export { GZ_ISLAND as ISLAND, LIFTS, FD_FWD, FD_AFT };
