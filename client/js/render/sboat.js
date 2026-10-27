// S-100, a Schnellboot of the S-100 class, built out of her own lines.
//
// Thirty-five metres, a hundred and seventeen tonnes, and forty-three knots
// on three Daimler-Benz diesels: the Allies called her an E-boat, and in the
// Channel and the North Sea she was the most dangerous small craft afloat.
// Mahogany planking on light-alloy frames, two torpedo tubes in the
// forecastle and, on the rails over her quarters, the mines she was sent out
// at night to lay across the convoy routes.
//
// Three things have to be right or she is not an S-boat.
//
// The first is the hull. A round-bilged displacement hull, not a planing
// one -- the Lürssen boats ran at speed with the sea running up their sides
// rather than skating over it, and that is what let them keep forty knots in
// a sea that stopped every British MTB -- with a long, high flared bow and the
// sheer running down to a low, wide transom.
//
// The second is the forecastle. The tubes are in it, not on it: from the S-38
// onwards the forecastle was carried forward over both tubes, so what shows
// is a smooth turtle-backed foredeck with the two mouths open in the bow
// either side of the stem.
//
// The third is the bridge. The Kalottenbrücke, the "skullcap": a low armoured
// dome over the wheelhouse, the one piece of armour aboard, with the open
// conning position on top of it.
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, y = 0 is the
// waterline.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { box, cyl, tubeZ, sphere, loftShape, planHouse, rail } from './shipkit.js';
import { arm } from './mounts.js';

const CLS = SHIP_CLASSES.sboat;
export const LOA = CLS.hull.length;      // 34.94 m
export const BEAM = CLS.hull.beam;       // 5.28 m
const HALF = LOA / 2;

// Kriegsmarine light grey over a dark grey boot, and a deck of grey-painted
// planking: an S-boat was a wooden boat, whatever colour she was painted.
const P = {
  light: 0x8f969d,
  hull: 0x7a8188,
  boot: 0x1b1e22,
  antifoul: 0x3b3f3c,
  deck: 0x5b5d58,
  deckSteel: 0x4d535a,
  steel: 0x7d858d,
  steelDark: 0x4a5159,
  bright: 0x9aa2aa,
  gun: 0x737b83,
  gunDark: 0x394046,
  mine: 0x2b2f33,
  glass: 0x24303a,
  cave: 0x0e1116,
  brass: 0x8a7340,
};
const MATS = {};
function mat(color) {
  if (!MATS[color]) MATS[color] = new THREE.MeshLambertMaterial({ color });
  return MATS[color];
}
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

// ------------------------------------------------------------- her lines --
//
// Stations from the transom at t = -1 to the stem at t = +1; metres, and
// y = 0 the waterline.

/** The top of her deck: a long, high bow running down to a low transom. */
const DECKLINE = [
  [-1.00, 1.32], [-0.70, 1.40], [-0.35, 1.55], [0.00, 1.72], [0.30, 1.92],
  [0.55, 2.15], [0.80, 2.45], [1.00, 2.72],
];
/** Her keel: a metre and two thirds down amidships, the forefoot cut away. */
const KEEL = [
  [-1.00, -0.60], [-0.90, -1.25], [-0.70, -1.60], [-0.30, -1.67], [0.20, -1.62],
  [0.50, -1.42], [0.70, -1.05], [0.82, -0.55], [0.90, 0.05], [0.96, 0.85],
  [1.00, 1.90],
];
/** Her half-breadth at the deck edge: 2.64 m, so 5.28 m of beam. */
const HALFB = [
  [-1.00, 2.20], [-0.80, 2.48], [-0.45, 2.62], [0.00, 2.64], [0.30, 2.56],
  [0.55, 2.30], [0.72, 1.92], [0.85, 1.42], [0.93, 0.90], [0.98, 0.40], [1.00, 0.08],
];
/** Her section, keel (v = 0) to deck edge (v = 1): round-bilged and flared. */
const SECTION = [
  [0.00, 0.10], [0.12, 0.42], [0.28, 0.70], [0.45, 0.86], [0.65, 0.95],
  [0.85, 0.99], [1.00, 1.00],
];

function lerpAt(table, t) {
  const c = Math.max(table[0][0], Math.min(table[table.length - 1][0], t));
  for (let i = 1; i < table.length; i++) {
    if (c <= table[i][0]) {
      const [t0, v0] = table[i - 1];
      const [t1, v1] = table[i];
      const k = (c - t0) / (t1 - t0);
      return v0 + (v1 - v0) * (k * k * (3 - 2 * k));
    }
  }
  return table[table.length - 1][1];
}

export function keelAt(t) { return lerpAt(KEEL, t); }
export function sheerAt(t) { return lerpAt(DECKLINE, t); }
function outerR(t) { return lerpAt(HALFB, t); }
function sectionF(v) { return lerpAt(SECTION, Math.max(0, Math.min(1, v))); }

/** Her half-breadth at a station and a height. */
export function shellAt(t, y) {
  const k = keelAt(t);
  const d = sheerAt(t);
  if (d - k < 0.01 || y <= k) return 0.02;
  return outerR(t) * sectionF((y - k) / (d - k));
}
/** Her deck height, and the deck edge, at a distance along her. */
export function deckAt(z) { return sheerAt(Math.max(-1, Math.min(1, z / HALF))); }
function halfDeck(z) { return Math.max(0.08, outerR(Math.max(-1, Math.min(1, z / HALF)))); }

// ------------------------------------------------------------------ hull --

/**
 * One band of her plating, between two heights, lofted stem to transom and
 * closed at both ends: the transom is the flat fan across her stern.
 */
function band(g, m, ylo, yhi, N = 72, K = 6, swell = 1) {
  const pos = [];
  const idx = [];
  const ring = (K + 1) * 2;
  const t0 = -1, t1 = 0.995;
  const ys = (t, j) => {
    const k = keelAt(t);
    const d = sheerAt(t);
    const a = Math.max(k, Math.min(d, ylo));
    const b = Math.max(a + 0.001, Math.min(d, yhi));
    return a + ((b - a) * j) / K;
  };
  for (let i = 0; i <= N; i++) {
    const t = t0 + ((t1 - t0) * i) / N;
    for (let j = 0; j <= K; j++) {
      const y = ys(t, j);
      pos.push(shellAt(t, y) * swell, y, t * HALF);
    }
    for (let j = K; j >= 0; j--) {
      const y = ys(t, j);
      pos.push(-shellAt(t, y) * swell, y, t * HALF);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j;
      const b = i * ring + ((j + 1) % ring);
      idx.push(a, b, a + ring, a + ring, b, b + ring);
    }
  }
  for (const [base, t, flip] of [[0, t0, true], [N * ring, t1, false]]) {
    const c = pos.length / 3;
    pos.push(0, (ys(t, 0) + ys(t, K)) / 2, t * HALF);
    for (let j = 0; j < ring; j++) {
      const a = base + j;
      const b = base + ((j + 1) % ring);
      if (flip) idx.push(c, b, a); else idx.push(c, a, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, m));
}

function hull(g) {
  band(g, M.antifoul, -3, -0.06);
  band(g, M.boot, -0.06, 0.22, 72, 2, 1.002);
  band(g, M.hull, 0.22, 9, 72, 6, 1.002);
  // The rubbing strake along the deck edge, and the spray rail low on the
  // bow that turns the sea down off her flare at speed.
  for (let i = 0; i < 40; i++) {
    const t = -0.98 + (1.94 * i) / 39;
    const t2 = -0.98 + (1.94 * (i + 1)) / 39;
    const z = t * HALF;
    const z2 = t2 * HALF;
    const y = (sheerAt(t) + sheerAt(t2)) / 2 - 0.12;
    const w = (shellAt(t, y) + shellAt(t2, y)) / 2;
    for (const sgn of [-1, 1]) {
      const s = box(g, M.steelDark, 0.10, 0.12, Math.hypot(z2 - z, shellAt(t2, y) - shellAt(t, y)) + 0.02,
        sgn * (w + 0.03), y, (z + z2) / 2);
      s.rotation.y = sgn * Math.atan2(shellAt(t2, y) - shellAt(t, y), z2 - z);
    }
    if (t > 0.35 && t < 0.95) {
      const ys = 0.55;
      const ws = (shellAt(t, ys) + shellAt(t2, ys)) / 2;
      for (const sgn of [-1, 1]) {
        const r = box(g, M.hull, 0.12, 0.06, Math.abs(z2 - z) + 0.04, sgn * (ws + 0.04), ys, (z + z2) / 2);
        r.rotation.y = sgn * Math.atan2(shellAt(t2, ys) - shellAt(t, ys), z2 - z);
      }
    }
  }
}

/** The deck: planking, a margin round it and the turtle-back of the forecastle. */
function deck(g) {
  const N = 80;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const t = -0.995 + (1.97 * i) / N;
    const z = t * HALF;
    const w = Math.max(0.05, halfDeck(z) - 0.02);
    const y = deckAt(z) + 0.01;
    // A little camber, so the deck sheds water and reads as a deck.
    pos.push(-w, y, z, 0, y + 0.10, z, w, y, z);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 3;
    const b = (i + 1) * 3;
    idx.push(a, b + 1, a + 1, a, b, b + 1);
    idx.push(a + 1, b + 2, a + 2, a + 1, b + 1, b + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.deck));
  // The toe rail down each side.
  rail(g, M.steelDark, -16.6, 13.5, (z) => halfDeck(z) - 0.12, (z) => deckAt(z), 1.9, [-1, 1], 0.55);
}

// ----------------------------------------------------------------- tubes --

// Her two 53.3 cm tubes, side by side in the forecastle and firing ahead.
// The bank is where its tubes are and its muzzles are where the mouths open
// in her bow; the class data is read off the same numbers.
const TUBE_Z = 11.9;
const TUBE_Y = 1.75;
const TUBE_X = 0.82;
const TUBE_HALF = 3.6;

function tubes(g) {
  const bank = new THREE.Group();
  bank.position.set(0, TUBE_Y, TUBE_Z);
  bank.userData.dynamic = true;
  bank.userData.mounting = true;
  const bores = [];
  for (const sgn of [-1, 1]) {
    tubeZ(bank, M.steelDark, 0.31, TUBE_HALF * 2, sgn * TUBE_X, 0, 0, 14);
    tubeZ(bank, M.cave, 0.27, 0.1, sgn * TUBE_X, 0, TUBE_HALF + 0.02, 14);
    bores.push([sgn * TUBE_X, 0, TUBE_HALF]);
  }
  arm(bank, bank, bores);
  g.add(bank);
  // And the troughs in the bow ahead of the mouths, down which the fish run
  // out clear of her stem.
  for (const sgn of [-1, 1]) {
    box(g, M.cave, 0.50, 0.54, 0.9, sgn * TUBE_X * 0.92, TUBE_Y, TUBE_Z + TUBE_HALF + 0.45);
  }
  g.userData.torpMounts = [bank];
  return [bank];
}

// ---------------------------------------------------------------- bridge --

const BR_FRONT = 4.4;
const BR_BACK = 0.0;
const BR_H = 1.75;
export function bridgeTop() { return deckAt((BR_FRONT + BR_BACK) / 2) + BR_H; }

/**
 * The Kalottenbrücke: a low wheelhouse under an armoured skullcap, with the
 * conning position open on the top of it behind a breast-high screen.
 */
function bridge(g) {
  const y0 = deckAt(BR_BACK);
  const top = bridgeTop();
  const layers = [];
  for (const [f, hw, nose] of [[0, 1.40, 1.30], [0.55, 1.32, 1.20], [0.85, 1.18, 1.05], [1, 1.02, 0.95]]) {
    layers.push({
      pts: planHouse({ hw, zFront: BR_FRONT - f * 0.35, zBack: BR_BACK + f * 0.2, nose, tail: 0.25, arc: 9 }),
      y: y0 - 0.05 + (top - y0 + 0.05) * f,
    });
  }
  loftShape(g, M.light, layers);
  // The windows round the front of the dome, which are slits: it is armour.
  for (let i = -3; i <= 3; i++) {
    const a = (i / 3) * 1.05;
    const r = 1.18;
    const w = box(g, M.glass, 0.34, 0.14, 0.05,
      Math.sin(a) * r, top - 0.42, BR_FRONT - 1.05 + Math.cos(a) * (r - 0.15));
    w.rotation.y = a;
  }
  // The conning position on top: a breast-high screen round an open well.
  const sy = top;
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2;
    const a1 = ((i + 1) / 16) * Math.PI * 2;
    const rx = 0.95, rz = 1.25;
    const cz = (BR_FRONT + BR_BACK) / 2 - 0.05;
    const x0 = Math.sin(a0) * rx, z0 = cz + Math.cos(a0) * rz;
    const x1 = Math.sin(a1) * rx, z1 = cz + Math.cos(a1) * rz;
    const s = box(g, M.light, 0.06, 0.62, Math.hypot(x1 - x0, z1 - z0) + 0.02,
      (x0 + x1) / 2, sy + 0.31, (z0 + z1) / 2);
    s.rotation.y = Math.atan2(x1 - x0, z1 - z0);
  }
  box(g, M.deckSteel, 1.7, 0.05, 2.3, 0, sy + 0.02, (BR_FRONT + BR_BACK) / 2 - 0.05);
  // The compass binnacle and the torpedo sight on the forward edge.
  cyl(g, M.brass, 0.12, 0.15, 0.85, 0, sy + 0.43, BR_FRONT - 1.0, 10);
  box(g, M.gunDark, 0.18, 0.22, 0.42, 0.45, sy + 0.62, BR_FRONT - 1.2);
  // The mast, stepped on the after end of the bridge, with her yard and the
  // radar warning aerial she carried by 1944.
  const mz = BR_BACK + 0.35;
  cyl(g, M.steelDark, 0.07, 0.10, 4.6, 0, sy + 2.3, mz, 8);
  box(g, M.steelDark, 1.9, 0.07, 0.07, 0, sy + 3.6, mz);
  cyl(g, M.steelDark, 0.18, 0.18, 0.28, 0, sy + 4.35, mz, 10);
  // The deckhouse abaft the bridge: the engine room's casing and its
  // skylights, and the hatch the motor mechanics went down.
  const hz0 = -9.8, hz1 = -0.4;
  for (let i = 0; i < 6; i++) {
    const za = hz0 + ((hz1 - hz0) * i) / 6;
    const zb = hz0 + ((hz1 - hz0) * (i + 1)) / 6;
    const zc = (za + zb) / 2;
    const h = 0.5;
    box(g, M.light, 1.9, h, zb - za + 0.01, 0, deckAt(zc) + h / 2, zc);
    box(g, M.glass, 1.2, 0.04, (zb - za) * 0.55, 0, deckAt(zc) + h + 0.02, zc);
  }
  // The exhausts, out of her sides abaft the engines, under the deck edge.
  for (const sgn of [-1, 1]) {
    for (const z of [-12.2, -13.4]) {
      const y = 0.75;
      const w = shellAt(z / HALF, y);
      cyl(g, M.cave, 0.13, 0.13, 0.2, sgn * (w - 0.03), y, z, 10).rotation.z = Math.PI / 2;
    }
  }
  // The smoke generator on the transom.
  cyl(g, M.steelDark, 0.25, 0.25, 0.9, 0.9, deckAt(-16.8) + 0.45, -16.8, 10);
}

// ------------------------------------------------------------------ guns --

/** A 2 cm C/38 on its pedestal: `twin` for the Zwilling amidships. */
function twentyMil(g, x, y, z, rest, twin) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = rest;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.rest = rest;
  cyl(m, M.gunDark, 0.20, 0.26, 0.55, 0, 0.27, 0, 12);
  box(m, M.gun, 0.46, 0.30, 0.36, 0, 0.66, 0);
  box(m, M.gun, 0.70, 0.44, 0.05, 0, 0.92, 0.32);     // the splinter shield
  const guns = new THREE.Group();
  guns.position.set(0, 0.86, 0);
  const xs = twin ? [-0.14, 0.14] : [0];
  for (const gx of xs) {
    box(guns, M.gunDark, 0.14, 0.18, 0.50, gx, 0, -0.08);
    tubeZ(guns, M.gun, 0.032, 1.30, gx, 0, 0.82, 8);
    tubeZ(guns, M.gunDark, 0.05, 0.16, gx, 0, 1.48, 8);
    box(guns, M.gunDark, 0.08, 0.26, 0.12, gx, 0.18, -0.02);
  }
  m.add(guns);
  arm(m, guns, xs.map((gx) => [gx, 0, 1.56]));
  g.add(m);
  return m;
}

/** The 3.7 cm Flak M42 aft, in its shield, on its bandstand over the rails. */
function aftGun(g) {
  const z = -12.6;
  const y = deckAt(z) + 0.12;
  cyl(g, M.steelDark, 1.05, 1.10, 0.24, 0, deckAt(z) + 0.06, z, 16);
  const m = new THREE.Group();
  m.position.set(0, y, z);
  m.rotation.y = Math.PI;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.rest = Math.PI;
  cyl(m, M.gunDark, 0.38, 0.46, 0.45, 0, 0.22, 0, 14);
  box(m, M.gun, 0.86, 0.45, 0.70, 0, 0.68, 0);
  // The shield, bent round the front of the mounting.
  for (const [sx, a] of [[0, 0], [-0.62, 0.55], [0.62, -0.55]]) {
    const s = box(m, M.gun, 0.72, 0.80, 0.05, sx, 1.05, 0.48 - Math.abs(sx) * 0.35);
    s.rotation.y = a;
  }
  for (const sgn of [-1, 1]) box(m, M.gunDark, 0.24, 0.12, 0.40, sgn * 0.62, 0.62, -0.42);  // the layers' seats
  const guns = new THREE.Group();
  guns.position.set(0, 1.05, 0);
  box(guns, M.gunDark, 0.26, 0.30, 0.90, 0, 0, -0.10);
  tubeZ(guns, M.gun, 0.05, 2.10, 0, 0, 1.30, 10);
  tubeZ(guns, M.gunDark, 0.075, 0.30, 0, 0, 2.35, 10);
  box(guns, M.gunDark, 0.14, 0.34, 0.26, 0, 0.30, -0.15);   // the clip in the feed
  m.add(guns);
  arm(m, guns, [[0, 0, 2.50]]);
  g.add(m);
  g.userData.turrets = [m];
  return [m];
}

function lightGuns(g) {
  // The single 2 cm forward, in its tub on the forecastle between the tubes.
  const fz = 8.6;
  cyl(g, M.light, 0.82, 0.86, 0.42, 0, deckAt(fz) + 0.21, fz, 16);
  cyl(g, M.cave, 0.74, 0.74, 0.02, 0, deckAt(fz) + 0.43, fz, 16);
  const bow = twentyMil(g, 0, deckAt(fz) + 0.05, fz, 0, false);
  // The Zwilling on its platform over the engine-room casing.
  const az = -4.6;
  const py = deckAt(az) + 0.5;
  cyl(g, M.steelDark, 0.95, 0.95, 0.10, 0, py + 0.05, az, 16);
  rail(g, M.steelDark, az - 0.9, az + 0.9, () => 0.9, () => py + 0.1, 0.6, [-1, 1], 0.5);
  const twin = twentyMil(g, 0, py + 0.1, az, Math.PI, true);
  g.userData.aaMounts = [bow, twin];
  return [bow, twin];
}

// ----------------------------------------------------------------- mines --

// Where the mines stand on her rails, in the order they go over the stern:
// the aftmost pair first, port and starboard turn about. The class data's
// `rails` say where each rail ends at the transom.
const MINE_X = 1.82;
const MINE_Z = [-14.9, -10.9, -6.9];
const MINE_R = 0.42;

function mineRails(g) {
  for (const sgn of [-1, 1]) {
    for (const off of [-0.2, 0.2]) {
      const z0 = -4.8, z1 = -17.3;
      const n = 10;
      for (let i = 0; i < n; i++) {
        const za = z0 + ((z1 - z0) * i) / n;
        const zb = z0 + ((z1 - z0) * (i + 1)) / n;
        const zc = (za + zb) / 2;
        box(g, M.steelDark, 0.07, 0.09, Math.abs(zb - za) + 0.02, sgn * MINE_X + off, deckAt(zc) + 0.05, zc);
      }
    }
    // The ramp over the transom the mines roll down.
    const r = box(g, M.steelDark, 0.5, 0.05, 0.7, sgn * MINE_X, deckAt(-17.2) - 0.1, -17.35);
    r.rotation.x = -0.45;
  }
}

/** One mine on its sinker, with its horns, standing on a rail. */
function mine(x, z) {
  const m = new THREE.Group();
  m.position.set(x, deckAt(z) + 0.1, z);
  m.userData.dynamic = true;
  box(m, M.steelDark, 0.62, 0.34, 0.62, 0, 0.17, 0);        // the sinker
  sphere(m, M.mine, MINE_R, 0, 0.34 + MINE_R, 0, 14);
  for (const [hx, hy, hz] of [[0, 1, 0], [0.7, 0.7, 0], [-0.7, 0.7, 0], [0, 0.7, 0.7], [0, 0.7, -0.7]]) {
    const h = cyl(m, M.gunDark, 0.035, 0.05, 0.16, hx * (MINE_R + 0.05), 0.34 + MINE_R + hy * (MINE_R + 0.05), hz * (MINE_R + 0.05), 6);
    h.lookAt(new THREE.Vector3(hx * 2, 0.34 + MINE_R + hy * 2, hz * 2));
    h.rotateX(Math.PI / 2);
  }
  return m;
}

function mineRack(g) {
  const rack = [];
  for (const z of MINE_Z) {
    for (const sgn of [1, -1]) {
      const m = mine(sgn * MINE_X, z);
      g.add(m);
      rack.push(m);
    }
  }
  g.userData.mineRack = rack;
  return rack;
}

// ---------------------------------------------------------------- screws --

/** Three screws on three shafts, and a rudder behind each. */
function screws(g) {
  for (const [x, hand] of [[-1.25, -1], [0, 1], [1.25, 1]]) {
    const z = -15.6 + (x === 0 ? -0.6 : 0);
    const y = x === 0 ? -1.05 : -0.95;
    tubeZ(g, M.gunDark, 0.07, 4.0, x, y + 0.25, z + 2.2, 8);
    const hub = new THREE.Group();
    hub.position.set(x, y, z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand };
    cyl(hub, M.brass, 0.13, 0.08, 0.22, 0, 0, 0, 10).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const bl = box(hub, M.brass, 0.34, 0.045, 0.30, Math.sin(a) * 0.26, Math.cos(a) * 0.26, 0);
      bl.rotation.z = a;
      bl.rotation.x = 0.4;
    }
    g.add(hub);
    box(g, M.gunDark, 0.07, 0.75, 0.6, x, y - 0.05, z - 0.75);
  }
}

// ----------------------------------------------------------------- build --

const STATIC = [
  ['hull', hull],
  ['deck', deck],
  ['bridge', bridge],
  ['mineRails', mineRails],
];

export function buildSboat() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, {
    loa: LOA,
    shellAt: (t, y) => Math.max(0.02, shellAt(t, y) * 0.94),
    keelY: (t) => keelAt(t) + 0.08,
    sheer: (t) => sheerAt(t) - 0.05,
    zAt: (t) => t * HALF,
  });
  mergeStatic(g, bySection(LOA));
  const turrets = aftGun(g);
  const aaMounts = lightGuns(g);
  const torpMounts = tubes(g);
  const rack = mineRack(g);
  screws(g);
  mergeMoving(g);
  g.userData.classId = 'sboat';
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckAt(0),
    secMounts: [], aaMounts, torpMounts,
    // The mines still on her rails, in the order they go over the stern.
    mineRack: rack,
  };
}
