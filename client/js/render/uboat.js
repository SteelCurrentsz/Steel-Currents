// U-48, a Type VIIB, built out of her own lines.
//
// Sixty-six and a half metres, seven hundred and fifty tonnes, and the most
// successful submarine of the war: fifty-five ships in twelve patrols. She is
// the only hull in this game that is not a ship, and almost nothing about the
// way the others are drawn applies to her.
//
// Four things have to be right or she is not a Type VII.
//
// The first is that there are two hulls. The pressure hull is a cylinder of
// eighteen-millimetre steel, faired to a cone at each end, and it is the only
// part of her that is watertight. Everything else -- the casing she is walked
// on, the saddle tanks down each side, the whole of the sharp bow and the
// sharp stern -- is free-flooding structure built round it, full of sea the
// moment she dives. That is why her sides are pierced with limber holes: they
// are not detail, they are the whole point of the outer hull.
//
// The second is the tower. A conning tower is not a bridge on a ship; it is a
// pressure-tight cylinder standing on the hull with a hatch down into it, and
// the bridge is the open platform on top. Abaft it is the Wintergarten, an
// open railed gallery carrying the flak, and above it the attack periscope,
// the sky periscope and the direction-finding loop.
//
// The third is the tubes. Five: four in the bow and one in the stern, fixed in
// the hull with nothing to train. A Type VII is aimed by pointing the boat.
// The outer doors are visible on the casing, and they swing.
//
// The fourth is that everything on the outside of the pressure hull drowns.
// The 8.8 cm on the casing and the 2 cm on the Wintergarten are both open
// mountings in the sea when she is down, and the simulation refuses to fire
// them -- see gunsDrowned.
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, starboard is -X,
// y = 0 is the surfaced waterline.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { box, cyl, tubeZ, sphere, ladder } from './shipkit.js';
import { arm } from './mounts.js';

const CLS = SHIP_CLASSES.u48;
export const LOA = CLS.hull.length;      // 66.5 m
export const BEAM = CLS.hull.beam;       // 6.2 m
export const DRAFT = CLS.hull.draft;
const HALF = LOA / 2;

// Kriegsmarine grey, and a great deal of it: a boat is one colour from end to
// end, with the wooden deck grating on the casing the only break in it.
const P = {
  hull: 0x5b626a,
  hullDark: 0x474e56,
  boot: 0x191c20,
  antifoul: 0x46433c,
  deck: 0x5a564b,          // the wooden grating on the casing
  deckSteel: 0x525960,
  steel: 0x656d76,
  steelDark: 0x4a5159,
  bright: 0x7f878f,
  gun: 0x5e666e,
  gunDark: 0x3a4046,
  canvas: 0x7d7d72,
  glass: 0x24303a,
  cave: 0x11151a,
  brass: 0x8a7340,
  // The boat's number, painted white on the tower early in the war and
  // painted out later. Hers was there in 1940.
  mark: 0xc9cdd2,
};

const MATS = {};
function mat(color) {
  if (!MATS[color]) MATS[color] = new THREE.MeshLambertMaterial({ color });
  return MATS[color];
}
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

// ------------------------------------------------------------- her lines --
//
// A Type VII is lofted from four curves, and every one of them is a curve --
// nothing about a submarine is a cylinder except the pressure hull inside her,
// and the mistake that makes a U-boat look like a toy is drawing the outside
// as one. The casing does not hang in the air over a tube: it is the top of
// the hull, and the hull comes up to meet it the whole length of the boat.
//
// Everything is metres, and y = 0 is the surfaced waterline.

/**
 * Her profile: the top of the casing, station by station from the stern at
 * t = -1 to the stem at t = +1.
 *
 * Nearly flat over the middle of her and lifting hard forward of the tower --
 * a Type VII's freeboard is under two metres amidships and getting on for four
 * at the stem, which is what keeps her dry enough to fight the gun in the
 * Atlantic and what gives her the profile everyone knows.
 */
const DECKLINE = [
  [-1.00, 1.02], [-0.93, 1.34], [-0.82, 1.58], [-0.64, 1.72], [-0.42, 1.82],
  [-0.18, 1.88], [0.08, 1.90], [0.30, 1.96], [0.48, 2.12], [0.64, 2.42],
  [0.77, 2.80], [0.87, 3.16], [0.94, 3.48], [1.00, 3.74],
];

/**
 * Her keel: four metres and three quarters down amidships, which is her
 * surfaced draught, sweeping up at both ends.
 *
 * Forward the sweep is the forefoot and it carries the stem clear of the water
 * a little abaft the extreme bow. Aft it is finer still, because everything
 * in the after body has to clear two screws and two rudders.
 */
const KEEL = [
  [-1.00, -1.10], [-0.96, -2.35], [-0.90, -3.40], [-0.82, -4.20], [-0.70, -4.60],
  [-0.50, -4.74], [-0.20, -4.74], [0.10, -4.74], [0.34, -4.70], [0.50, -4.56],
  [0.64, -4.24], [0.76, -3.66], [0.86, -2.84], [0.93, -1.82], [0.98, -0.68],
  [1.00, 0.20],
];

/**
 * Her half-breadth over the saddle tanks: 3.10 m, so 6.2 m of beam.
 *
 * The saddle tanks are the main ballast, blistered on to the pressure hull
 * outside it, and they are why she is wider than the tube she is built round.
 * They run about two thirds of her length and die away at both ends.
 */
const HALFB = [
  [-1.00, 0.13], [-0.95, 0.52], [-0.88, 1.08], [-0.78, 1.78], [-0.64, 2.42],
  [-0.46, 2.88], [-0.24, 3.06], [0.00, 3.10], [0.20, 3.08], [0.36, 2.96],
  [0.50, 2.70], [0.62, 2.32], [0.74, 1.82], [0.84, 1.28], [0.92, 0.74],
  [0.97, 0.34], [1.00, 0.10],
];

/**
 * And the section: her half-breadth as a fraction of the maximum, from the
 * keel at v = 0 to the edge of the casing at v = 1.
 *
 * This is the one curve that is the same at every station, and it is the shape
 * of a saddle-tank boat: a narrow flat keel, a hard turn of bilge, the widest
 * point a metre below the waterline where the tanks bulge, and then a long
 * tumblehome up to a casing three quarters of her beam wide. A ship's section
 * is widest at the deck. A submarine's is widest under water.
 */
const SECTION = [
  [0.00, 0.055], [0.06, 0.30], [0.14, 0.53], [0.24, 0.73], [0.36, 0.88],
  [0.48, 0.965], [0.58, 1.000], [0.68, 0.995], [0.78, 0.960], [0.86, 0.905],
  [0.93, 0.842], [1.00, 0.770],
];

/**
 * The pressure hull: the only watertight thing aboard.
 *
 * A cylinder of eighteen-millimetre steel, four metres seventy across, coned
 * away at both ends, sitting low in the outer hull with its crown a hand's
 * breadth above the surfaced waterline. Radius as a fraction of the maximum.
 */
const PRESSURE = [
  [-1.00, 0.00], [-0.94, 0.30], [-0.86, 0.55], [-0.76, 0.74], [-0.64, 0.88],
  [-0.50, 0.96], [-0.34, 1.00], [0.00, 1.00], [0.26, 1.00], [0.40, 0.98],
  [0.52, 0.93], [0.64, 0.84], [0.74, 0.72], [0.84, 0.55], [0.92, 0.37],
  [0.97, 0.20], [1.00, 0.00],
];
/** Her greatest pressure-hull radius, and the height of its axis. */
const R = 2.35;
const PY = -2.10;

function lerpAt(table, t) {
  const c = Math.max(table[0][0], Math.min(table[table.length - 1][0], t));
  if (c <= table[0][0]) return table[0][1];
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

/** Her pressure-hull radius at a station. */
export function hullR(t) { return lerpAt(PRESSURE, t) * R; }
/** Her keel at a station, and the top of her casing there. */
export function keelAt(t) { return lerpAt(KEEL, t); }
export function sheerAt(t) { return lerpAt(DECKLINE, t); }
/** Her greatest half-breadth at a station -- over the saddle tanks. */
export function outerR(t) { return lerpAt(HALFB, t); }
/** The section fraction at a height fraction. */
function sectionF(v) { return lerpAt(SECTION, Math.max(0, Math.min(1, v))); }

/**
 * Her half-breadth at a station and a height: the shell itself.
 *
 * This is the function the whole outside of her is built from, and everything
 * that has to sit on her side -- limber holes, planes, tube doors -- asks it
 * where the side is rather than guessing.
 */
export function shellAt(t, y) {
  const k = keelAt(t);
  const d = sheerAt(t);
  if (d - k < 0.01) return 0.02;
  return outerR(t) * sectionF((y - k) / (d - k));
}

/** The height of the casing -- the walking deck -- at a station. */
export function deckAt(z) { return sheerAt(Math.max(-1, Math.min(1, z / HALF))); }
/** How far outboard the casing edge is there. */
export function halfDeck(z) {
  const t = Math.max(-1, Math.min(1, z / HALF));
  return Math.max(0.10, outerR(t) * SECTION[SECTION.length - 1][1]);
}

// ------------------------------------------------------------------ hull --

/**
 * A body of revolution, lofted from a table of radii.
 *
 * Used for the pressure hull and for nothing else: the outside of her is not
 * a body of revolution and drawing it as one is the whole of what is wrong
 * with most models of a U-boat.
 */
function revolve(g, m, rad, yOf, t0, t1, N = 60, SEG = 20, squash = 1) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const t = t0 + ((t1 - t0) * i) / N;
    const r = Math.max(0.01, rad(t));
    const y = yOf(t);
    const z = t * HALF;
    for (let k = 0; k < SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      pos.push(Math.sin(a) * r, y + Math.cos(a) * r * squash, z);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < SEG; k++) {
      const a = i * SEG + k;
      const b = i * SEG + ((k + 1) % SEG);
      idx.push(a, b, a + SEG, a + SEG, b, b + SEG);
    }
  }
  // Both ends closed on a centre point, or she is a pipe.
  const aft = pos.length / 3;
  pos.push(0, yOf(t0), t0 * HALF);
  for (let k = 0; k < SEG; k++) idx.push(aft, (k + 1) % SEG, k);
  const fwd = pos.length / 3;
  pos.push(0, yOf(t1), t1 * HALF);
  for (let k = 0; k < SEG; k++) idx.push(fwd, N * SEG + k, N * SEG + ((k + 1) % SEG));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, m));
}

/** The pressure hull, which is the boat. Everything else is built round it. */
function pressureHull(g) {
  revolve(g, M.hullDark, hullR, () => PY, -0.96, 0.96, 56, 20);
}

/**
 * The outer hull, lofted station by station off the four curves.
 *
 * A ring at each station runs up the starboard side from the keel to the edge
 * of the casing, straight across the casing, and down the port side back to
 * the keel -- so the deck she is walked on is the top of the same closed
 * surface as her bottom, and there is no seam between them and nothing hanging
 * in the air. `band` is a strake: the shell is plated in horizontal bands
 * rather than lofted in one piece, so that the boot topping and the
 * anti-fouling below it are the plating and not a decal laid over it.
 */
function shell(g, m, v0, v1, t0 = -0.995, t1 = 0.995, N = 96, K = 7, swell = 1) {
  const pos = [];
  const idx = [];
  const ring = (K + 1) * 2;
  for (let i = 0; i <= N; i++) {
    const t = t0 + ((t1 - t0) * i) / N;
    const k = keelAt(t);
    const d = sheerAt(t);
    const w = outerR(t) * swell;
    for (let j = 0; j <= K; j++) {
      const v = v0 + ((v1 - v0) * j) / K;
      pos.push(w * sectionF(v), k + (d - k) * v, t * HALF);
    }
    for (let j = K; j >= 0; j--) {
      const v = v0 + ((v1 - v0) * j) / K;
      pos.push(-w * sectionF(v), k + (d - k) * v, t * HALF);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j;
      const b = i * ring + ((j + 1) % ring);
      idx.push(a, b, a + ring, a + ring, b, b + ring);
    }
  }
  // Both ends shut on a point, so she holds water.
  for (const [base, t, flip] of [[0, t0, true], [N * ring, t1, false]]) {
    const c = pos.length / 3;
    const k = keelAt(t);
    const d = sheerAt(t);
    pos.push(0, k + (d - k) * (v0 + v1) / 2, t * HALF);
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

/**
 * The outside of her: the free-flooding casing over the pressure hull, the
 * saddle tanks down each side, the sharp bow and the finer stern.
 *
 * None of it is watertight and none of it ever was -- the sea is inside it the
 * whole time she is under -- which is why her sides are cut with limber holes
 * and why a shell through it does nothing at all.
 */
function outerHull(g) {
  // The body, in three strakes: the bottom in anti-fouling, the boot topping
  // at the surfaced waterline, and the topsides up to the casing.
  shell(g, M.antifoul, 0.00, 0.655, -0.995, 0.995, 100, 8);
  shell(g, M.boot, 0.645, 0.760, -0.995, 0.995, 100, 3, 1.002);
  shell(g, M.hull, 0.750, 1.000, -0.995, 0.995, 100, 6, 1.002);
  limberHoles(g);
}

/**
 * The limber holes.
 *
 * A row of slots down each side under the edge of the casing, and the single
 * most recognisable thing about a U-boat's outline after the tower. They are
 * what let the outer hull flood and drain, and a Type VII's pattern -- a long
 * run of them from the bow to the tower and a shorter run aft -- is on every
 * photograph of her.
 */
function limberHoles(g) {
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 38; i++) {
      const t = -0.86 + (1.70 * i) / 37;
      const z = t * HALF;
      const y = deckAt(z) - 0.62;
      const w = shellAt(t, y);
      if (w < 0.45) continue;
      box(g, M.cave, 0.12, 0.34, 0.58, sgn * (w - 0.03), y, z);
    }
    // And the drain slots low down on the saddle tanks, at the turn of bilge.
    for (let i = 0; i < 16; i++) {
      const t = -0.56 + (1.10 * i) / 15;
      const y = -2.55;
      const w = shellAt(t, y);
      if (w < 0.5) continue;
      box(g, M.cave, 0.10, 0.24, 0.44, sgn * (w - 0.03), y, t * HALF);
    }
  }
}

/**
 * The casing: the wooden walking deck laid on top of the hull, the steel
 * margin it is laid in, and the coaming down each edge.
 *
 * The deck surface itself is the top of the hull -- see `shell` -- so what is
 * built here is only what is laid on it.
 */
function casing(g) {
  const N = 84;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const t = -0.955 + (1.91 * i) / N;
    const z = t * HALF;
    const w = Math.max(0.06, halfDeck(z) - 0.30);
    const y = deckAt(z) + 0.035;
    pos.push(-w, y, z, w, y, z);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    const b = (i + 1) * 2;
    idx.push(a, b + 1, a + 1, a, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.deck));

  // The coaming down each edge of the casing.
  for (let i = 0; i < N; i++) {
    const t = -0.955 + (1.91 * i) / N;
    const t2 = -0.955 + (1.91 * (i + 1)) / N;
    const z = t * HALF;
    const z2 = t2 * HALF;
    const w = (halfDeck(z) + halfDeck(z2)) / 2 - 0.08;
    if (w < 0.12) continue;
    for (const sgn of [-1, 1]) {
      box(g, M.deckSteel, 0.16, 0.10, Math.abs(z2 - z) + 0.03,
        sgn * w, (deckAt(z) + deckAt(z2)) / 2 + 0.05, (z + z2) / 2);
    }
  }
  // The deck grating's own planking runs athwartships on a boat, not fore and
  // aft, and the battens that hold it read as a ladder from above.
  for (let i = 0; i < 64; i++) {
    const t = -0.92 + (1.84 * i) / 63;
    const z = t * HALF;
    const w = halfDeck(z) - 0.30;
    if (w < 0.25) continue;
    box(g, M.deckSteel, w * 2 - 0.14, 0.035, 0.09, 0, deckAt(z) + 0.07, z);
  }
}


// ----------------------------------------------------------------- tower --

/**
 * The conning tower and the bridge on top of it, with the Wintergarten abaft.
 *
 * The tower is a pressure-tight cylinder with a hatch down into the control
 * room; the bridge is the open platform on its roof, with the UZO pedestal on
 * the front of it. The Wintergarten is the railed gallery aft carrying the
 * flak. Above it all: the attack periscope, the sky periscope and the DF loop.
 */
function tower(g) {
  const TZ = 1.0;                 // she sits a little abaft amidships
  const base = deckAt(TZ);
  // The fairing round the foot of the tower, which is free-flooding like the
  // rest of the casing and is what makes a Type VII's tower look wider at the
  // bottom than it is.
  const fair = [[-4.6, 1.35], [-2.6, 1.62], [0, 1.72], [2.4, 1.62], [4.2, 1.28], [5.2, 0.75]];
  loftHouse(g, M.hull, fair, base, 1.40, TZ, 0.88);
  // The pressure-tight tower itself, standing inside the fairing.
  loftHouse(g, M.hull, [[-2.2, 1.18], [0, 1.30], [2.0, 1.22], [3.0, 0.86]],
    base + 1.40, 0.90, TZ, 0.93);

  const bridge = base + 2.30;
  // The bridge coaming: an open platform with the spray deflector round its
  // forward face.
  loftHouse(g, M.steel, [[-2.4, 1.22], [0, 1.34], [2.2, 1.26], [3.2, 0.90]],
    bridge, 0.88, TZ, 1.0);
  box(g, M.cave, 2.0, 0.70, 2.0, 0, bridge + 0.40, TZ + 0.3);

  // The UZO pedestal on the forward rail -- the surface attack sight, which is
  // what she actually aims with on the surface.
  cyl(g, M.steelDark, 0.10, 0.12, 0.75, 0, bridge + 1.2, TZ + 3.0, 8);
  box(g, M.gunDark, 0.46, 0.20, 0.22, 0, bridge + 1.62, TZ + 3.0);

  // The two periscopes and the DF loop, standing out of the bridge.
  //
  // The attack scope is the thin one and stands further forward; the sky
  // scope, for searching, is fatter and abaft it. The loop is the round
  // direction-finding aerial on the after rail.
  const scopes = new THREE.Group();
  scopes.position.set(0, bridge, TZ);
  cyl(scopes, M.steelDark, 0.075, 0.085, 3.9, 0.42, 1.95, 0.55, 8);
  box(scopes, M.steelDark, 0.20, 0.30, 0.14, 0.42, 3.72, 0.62);
  cyl(scopes, M.steelDark, 0.125, 0.14, 3.2, -0.45, 1.60, -0.35, 8);
  box(scopes, M.steelDark, 0.28, 0.34, 0.18, -0.45, 3.05, -0.28);
  g.add(scopes);
  // The DF loop on its stub mast.
  cyl(g, M.steelDark, 0.06, 0.06, 0.85, 0, bridge + 1.25, TZ - 1.5, 6);
  const loop = cyl(g, M.steelDark, 0.42, 0.42, 0.07, 0, bridge + 1.72, TZ - 1.5, 16);
  loop.rotation.x = Math.PI / 2;

  // The Wintergarten: the open gallery abaft the tower that the flak stands
  // on, with its rail and the plating round the bottom of it.
  const wz = TZ - 4.4;
  const plat = box(g, M.steel, 2.55, 0.16, 3.0, 0, bridge - 0.55, wz);
  plat.userData.name = 'wintergarten';
  for (const [dx, dz, w, d] of [[0, -1.55, 2.55, 0.14], [-1.28, 0, 0.14, 3.0], [1.28, 0, 0.14, 3.0]]) {
    box(g, M.steel, w, 0.62, d, dx, bridge - 0.24, wz + dz);
  }
  for (const h of [0.30, 0.58, 0.86]) {
    box(g, M.steelDark, 2.55, 0.045, 0.045, 0, bridge - 0.47 + h, wz - 1.5);
    for (const sgn of [-1, 1]) box(g, M.steelDark, 0.045, 0.045, 3.0, sgn * 1.28, bridge - 0.47 + h, wz);
  }
  // The ladder up the after face of the tower to it.
  ladder(g, M.steelDark, 0, base + 0.3, bridge - 0.6, TZ - 2.6, TZ - 3.4);

  // The jumping wires: the aerial running from the stem over the tower to the
  // stern, which every boat carried and which is the only thing about her
  // outline above the casing besides the tower itself.
  for (const [z0, z1, y0, y1] of [
    [TZ + 1.3, 0.965 * HALF, bridge + 1.1, deckAt(0.965 * HALF) + 0.35],
    [TZ - 2.0, -0.955 * HALF, bridge + 0.4, deckAt(-0.955 * HALF) + 0.30],
  ]) {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const za = z0 + ((z1 - z0) * i) / n;
      const zb = z0 + ((z1 - z0) * (i + 1)) / n;
      const ya = y0 + (y1 - y0) * Math.pow(i / n, 0.72);
      const yb = y0 + (y1 - y0) * Math.pow((i + 1) / n, 0.72);
      const seg = box(g, M.steelDark, 0.05, 0.05, Math.hypot(zb - za, yb - ya),
        0, (ya + yb) / 2, (za + zb) / 2);
      seg.rotation.x = -Math.atan2(yb - ya, zb - za);
    }
  }
}

/**
 * The inside of the conning tower.
 *
 * A Type VII's tower is not a bridge: it is a second pressure vessel standing
 * on the first, with a hatch down into the control room and another up on to
 * the bridge, and a man in it at action stations. What is in there is the
 * attack periscope's lower body, the aiming gear it drives, the helm repeater
 * and the ladder between the two hatches -- and it is in here for the same
 * reason a cruiser's bridge is furnished: a shell through the tower ought to
 * open on to the room, not on to a lit box.
 */
function towerInside(g) {
  const TZ = 1.0;
  const inside = new THREE.Group();
  inside.userData.inside = true;
  const FLOOR = 2.05;
  const ROOF = 4.12;

  // The deck of the tower compartment, with the lower hatch through it, and
  // the underside of the bridge deck over it.
  box(inside, M.steelDark, 1.75, 0.09, 3.10, 0, FLOOR, TZ);
  box(inside, M.steelDark, 1.70, 0.09, 3.00, 0, ROOF, TZ);
  cyl(inside, M.cave, 0.34, 0.34, 0.10, 0, FLOOR + 0.06, TZ - 0.95, 12);
  cyl(inside, M.steelDark, 0.40, 0.40, 0.08, 0, ROOF - 0.06, TZ + 0.55, 12);

  // The attack periscope, which is the whole reason for the compartment: its
  // barrel comes down through the deck into the well below, and the layer sits
  // at it on a saddle that goes round with the scope.
  cyl(inside, M.steelDark, 0.11, 0.11, 2.00, 0.30, FLOOR + 1.02, TZ + 0.55, 10);
  cyl(inside, M.gunDark, 0.24, 0.24, 0.34, 0.30, FLOOR + 1.30, TZ + 0.55, 12);
  box(inside, M.gunDark, 0.30, 0.16, 0.46, 0.30, FLOOR + 1.16, TZ + 0.20);
  box(inside, M.steelDark, 0.34, 0.10, 0.34, 0.66, FLOOR + 0.62, TZ + 0.45);
  // And the sky periscope's barrel going up through the after end of it.
  cyl(inside, M.steelDark, 0.16, 0.16, 2.00, -0.34, FLOOR + 1.02, TZ - 0.40, 10);

  // The helm repeater and the two telegraphs on the forward bulkhead: she is
  // steered from down in the control room and conned from up here, and these
  // are what carries one to the other.
  cyl(inside, M.brass, 0.26, 0.26, 0.06, 0, FLOOR + 1.18, TZ + 1.32, 14)
    .rotation.x = Math.PI / 2;
  for (const sgn of [-1, 1]) {
    cyl(inside, M.steelDark, 0.10, 0.13, 0.80, sgn * 0.56, FLOOR + 0.40, TZ + 1.18, 10);
    cyl(inside, M.brass, 0.17, 0.17, 0.07, sgn * 0.56, FLOOR + 0.84, TZ + 1.18, 12);
  }

  // The torpedo-aiming calculator on the port side, and the plot board beside
  // it: a bearing and a range go in, a gyro angle goes down to the tubes.
  box(inside, M.steelDark, 0.26, 0.72, 0.90, -0.72, FLOOR + 0.44, TZ + 0.10);
  box(inside, M.bright, 0.05, 0.34, 0.50, -0.56, FLOOR + 0.74, TZ + 0.10);
  box(inside, M.steelDark, 0.24, 0.50, 0.70, 0.74, FLOOR + 0.33, TZ - 0.70);

  // The ladder between the two hatches, and the voicepipe beside it.
  ladder(inside, M.steelDark, -0.55, FLOOR + 0.10, ROOF - 0.12, TZ - 0.80, TZ - 0.62);
  cyl(inside, M.steelDark, 0.07, 0.07, ROOF - FLOOR - 0.2, -0.80, (FLOOR + ROOF) / 2, TZ - 1.05, 8);

  // The bench the watch below sits on, and the lamp over the chart shelf.
  box(inside, M.steelDark, 0.60, 0.09, 0.90, -0.30, FLOOR + 0.46, TZ - 1.05);
  box(inside, M.canvas, 0.18, 0.10, 0.18, 0.40, ROOF - 0.20, TZ - 0.10);
  g.add(inside);
}

/** A lofted deckhouse: `rows` are [dz, half-breadth] from aft forward. */
function loftHouse(g, m, rows, y, h, z0, taper = 0.94) {
  const pos = [];
  const idx = [];
  for (const [dz, w] of rows) {
    const z = z0 + dz;
    pos.push(-w, y, z, w, y, z, -w * taper, y + h, z, w * taper, y + h, z);
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    idx.push(a, b + 2, a + 2, a, b, b + 2);
    idx.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
    idx.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  // The two ends, so a deckhouse is a box and not a tunnel.
  const n = rows.length;
  idx.push(0, 2, 3, 0, 3, 1);
  const e = (n - 1) * 4;
  idx.push(e, e + 3, e + 2, e, e + 1, e + 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, m));
}

// ------------------------------------------------------------------ guns --

/**
 * The 8.8 cm SK C/35 on the casing forward of the tower.
 *
 * A deck gun, which is a different animal from a ship's gun: no shield, no
 * turret, no director and no power. It stands on a pedestal on the casing,
 * it is trained and laid by hand by men standing in the open on a wet deck,
 * and the ready-use rounds come up through the hatch one at a time. It is for
 * a merchantman not worth a torpedo.
 */
function deckGun(g) {
  const z = 9.0;
  const y = deckAt(z);
  const m = new THREE.Group();
  m.position.set(0, y, z);
  m.userData.dynamic = true;
  m.userData.mounting = true;
  // The pedestal and the training ring.
  cyl(g, M.steelDark, 0.62, 0.72, 0.42, 0, y + 0.21, z, 14);
  cyl(m, M.gunDark, 0.50, 0.56, 0.30, 0, 0.45, 0, 14);
  // The saddle, the trunnion standards and the layer's seat.
  box(m, M.gun, 0.78, 0.42, 0.70, 0, 0.78, 0);
  for (const sgn of [-1, 1]) box(m, M.gun, 0.14, 0.52, 0.34, sgn * 0.40, 1.12, 0);
  box(m, M.gunDark, 0.30, 0.10, 0.36, -0.62, 0.92, -0.35);
  cyl(m, M.gunDark, 0.30, 0.30, 0.05, -0.72, 1.14, -0.15, 12).rotation.z = Math.PI / 2;

  // The gun itself, in its cradle: it elevates, so it is its own node.
  const guns = new THREE.Group();
  guns.position.set(0, 1.12, 0);
  guns.rotation.x = -0.05;
  tubeZ(guns, M.gunDark, 0.16, 0.72, 0, 0, 0.18, 12);     // breech ring
  box(guns, M.gunDark, 0.30, 0.30, 0.40, 0, 0, -0.30);    // breech
  tubeZ(guns, M.gun, 0.095, 3.30, 0, 0, 1.95, 12);        // chase
  tubeZ(guns, M.gunDark, 0.105, 0.16, 0, 0, 3.62, 12);    // muzzle swell
  // The recuperator over the barrel, which is what a C/35 has instead of a
  // shield and is the easiest way to tell one at a distance.
  tubeZ(guns, M.gunDark, 0.075, 1.30, 0, 0.20, 0.90, 8);
  m.add(guns);
  arm(m, guns, [[0, 0, 3.78]]);
  g.add(m);
  g.userData.turrets = [m];
  return [m];
}

/**
 * The 2 cm C/30 on the Wintergarten.
 *
 * One barrel on a pedestal mounting with a shoulder rest and a twenty-round
 * magazine standing up out of the receiver. Like the deck gun it is outside
 * the pressure hull and it drowns.
 */
function flak(g) {
  const z = -5.6;
  const y = deckAt(1.0) + 2.30 - 0.47;
  const m = new THREE.Group();
  m.position.set(0, y, z);
  m.userData.dynamic = true;
  m.userData.mounting = true;
  cyl(m, M.gunDark, 0.22, 0.28, 0.30, 0, 0.15, 0, 12);
  box(m, M.gun, 0.34, 0.26, 0.30, 0, 0.42, 0);
  const guns = new THREE.Group();
  guns.position.set(0, 0.56, 0);
  guns.rotation.x = -0.30;
  box(guns, M.gunDark, 0.16, 0.18, 0.46, 0, 0, -0.10);    // receiver
  tubeZ(guns, M.gun, 0.032, 1.30, 0, 0, 0.82, 8);         // barrel
  tubeZ(guns, M.gunDark, 0.05, 0.16, 0, 0, 1.48, 8);      // flash hider
  box(guns, M.gunDark, 0.08, 0.30, 0.12, 0.14, 0.16, -0.05);  // the magazine
  box(guns, M.gunDark, 0.10, 0.10, 0.30, 0, -0.14, -0.34);    // shoulder rest
  m.add(guns);
  arm(m, guns, [[0, 0, 1.58]]);
  g.add(m);
  g.userData.aaMounts = [m];
  return [m];
}

// ----------------------------------------------------------------- tubes --

/**
 * The torpedo tubes: four in the bow and one in the stern.
 *
 * What is built here is the outer doors -- the bow caps -- and they are the
 * one thing on this boat that moves for a reason other than being aimed. A
 * tube is blown, the cap swings out of the way, the fish goes, and the cap
 * shuts again. They are their own nodes and the welder is told to leave them
 * alone, because a door baked into the casing is a door that never opens.
 *
 * `torpMounts` gets the two banks, so the simulation has something to fire
 * from and the muzzles are where the doors are.
 */
function tubes(g) {
  const caps = { bow: [], stern: [] };
  const mounts = [];

  // The bow: four doors in two pairs, one pair above the other, which is how a
  // Type VII's are arranged. They are well down the stem and well under water,
  // so each one is set on the shell at its own height rather than on a flat
  // face -- a tube door standing off the plating is a door on the wrong boat.
  const bt = 0.855;
  const bz = bt * HALF;
  const bow = new THREE.Group();
  bow.position.set(0, 0, bz);
  bow.userData.dynamic = true;
  bow.userData.mounting = true;
  const bores = [];
  for (const [side, dy] of [[-1, -1.05], [1, -1.05], [-1, -2.05], [1, -2.05]]) {
    const dx = side * Math.max(0.34, shellAt(bt, dy) - 0.30);
    bores.push([dx, dy, 0.62]);
    // The tube mouth, recessed into the bow.
    cyl(bow, M.cave, 0.28, 0.28, 0.34, dx, dy, 0.30, 12).rotation.x = Math.PI / 2;
    cyl(bow, M.steelDark, 0.35, 0.35, 0.16, dx, dy, 0.44, 12).rotation.x = Math.PI / 2;
    // And the door, hinged outboard so it swings clear of the mouth.
    const hinge = new THREE.Group();
    hinge.position.set(dx + side * 0.33, dy, 0.52);
    hinge.userData.dynamic = true;
    const leaf = cyl(hinge, M.steel, 0.33, 0.33, 0.09, -side * 0.33, 0, 0, 12);
    leaf.rotation.x = Math.PI / 2;
    box(hinge, M.steelDark, 0.10, 0.12, 0.12, -side * 0.06, 0, 0.04);
    bow.add(hinge);
    caps.bow.push({ node: hinge, hand: side });
  }
  arm(bow, bow, bores);
  g.add(bow);
  mounts.push(bow);

  // And the one aft, on the centreline between the screws.
  const st = -0.872;
  const sz = st * HALF;
  const sy = -1.55;
  const stern = new THREE.Group();
  stern.position.set(0, 0, sz);
  stern.userData.dynamic = true;
  stern.userData.mounting = true;
  cyl(stern, M.cave, 0.28, 0.28, 0.34, 0, sy, -0.30, 12).rotation.x = Math.PI / 2;
  cyl(stern, M.steelDark, 0.35, 0.35, 0.16, 0, sy, -0.44, 12).rotation.x = Math.PI / 2;
  const sh = new THREE.Group();
  sh.position.set(0.33, sy, -0.52);
  sh.userData.dynamic = true;
  cyl(sh, M.steel, 0.33, 0.33, 0.09, -0.33, 0, 0, 12).rotation.x = Math.PI / 2;
  stern.add(sh);
  caps.stern.push({ node: sh, hand: 1 });
  arm(stern, stern, [[0, sy, -0.62]]);
  g.add(stern);
  mounts.push(stern);

  g.userData.torpMounts = mounts;
  g.userData.tubeCaps = caps;
  return { mounts, caps };
}

// -------------------------------------------------------------- fittings --

/**
 * Everything else on her outside: the net cutter on the stem, the diving
 * planes fore and aft, the capstan, the bollards, the hatches a boat is
 * stored and boarded through, and the ready-use ammunition locker for the
 * deck gun.
 */
function fittings(g) {
  // The net cutter: a serrated blade along the top of the stem, for cutting
  // through harbour nets. Early-war boats all carried one.
  for (let i = 0; i < 9; i++) {
    const t = 0.88 + (0.11 * i) / 8;
    const z = t * HALF;
    const y = deckAt(z) - 0.1 + 0.5 * (i / 8);
    box(g, M.steelDark, 0.09, 0.34 - 0.02 * i, 0.42, 0, y, z);
  }

  // The diving planes: the forward pair out of the casing at the bow and the
  // after pair beside the screws. They are what she is held down by -- a
  // submarine at depth is flying, not floating.
  for (const sgn of [-1, 1]) {
    const fz = 0.70 * HALF;
    const fp = box(g, M.steelDark, 1.55, 0.13, 1.05,
      sgn * (shellAt(0.70, -1.55) + 0.70), -1.55, fz);
    fp.rotation.z = sgn * 0.05;
    const az = -0.82 * HALF;
    const ap = box(g, M.steelDark, 1.75, 0.13, 1.25,
      sgn * (shellAt(-0.82, -1.85) + 0.78), -1.85, az);
    ap.rotation.z = sgn * 0.05;
  }

  // The capstan and the bollards forward, and the bollards aft.
  cyl(g, M.steelDark, 0.24, 0.28, 0.30, 0, deckAt(0.80 * HALF) + 0.15, 0.80 * HALF, 12);
  for (const sgn of [-1, 1]) {
    for (const t of [0.74, -0.74]) {
      const z = t * HALF;
      box(g, M.steelDark, 0.30, 0.22, 0.16, sgn * (halfDeck(z) - 0.22), deckAt(z) + 0.11, z);
    }
  }

  // The hatches: the fore-ends torpedo loading hatch, the galley hatch and the
  // engine-room hatch. A boat is stored through these and they are on the
  // casing where the deck is widest.
  for (const [z, w] of [[0.55 * HALF, 0.62], [-0.30 * HALF, 0.50], [-0.62 * HALF, 0.54]]) {
    cyl(g, M.steelDark, w / 2, w / 2, 0.12, 0, deckAt(z) + 0.08, z, 14);
    cyl(g, M.gunDark, w / 2 - 0.09, w / 2 - 0.09, 0.08, 0, deckAt(z) + 0.15, z, 14);
  }

  // The ready-use locker for the deck gun, which is the only thing on the
  // casing forward of the tower besides the gun itself.
  box(g, M.steel, 0.55, 0.34, 0.85, -0.72, deckAt(4.2) + 0.17, 4.2);
  box(g, M.steel, 0.55, 0.34, 0.85, 0.72, deckAt(4.2) + 0.17, 4.2);

  // Her number on the tower, painted white. Hers was up in 1940 and painted
  // out later in the war; this is the boat of the twelve patrols.
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      box(g, mat(P.mark), 0.04, 0.34, 0.16,
        sgn * 1.66, deckAt(1.0) + 1.72, 1.0 + 0.9 - i * 0.32);
    }
  }
}

/** Twin screws on twin shafts, twin rudders, and the after planes' guards. */
function screws(g) {
  for (const [x, hand] of [[-1.15, -1], [1.15, 1]]) {
    const z = -0.90 * HALF;
    tubeZ(g, M.gunDark, 0.16, 3.4, x, -1.95, z + 2.1, 10);
    // The bracket carrying the shaft out of the hull.
    const br = box(g, M.hull, 0.22, 1.2, 0.48, x, -1.55, z + 1.3);
    br.rotation.z = -Math.sign(x) * 0.26;
    const hub = new THREE.Group();
    hub.position.set(x, -1.95, z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand };
    cyl(hub, M.brass, 0.26, 0.16, 0.30, 0, 0, 0, 10).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const bl = box(hub, M.brass, 0.50, 0.065, 0.86,
        Math.sin(a) * 0.42, Math.cos(a) * 0.42, 0);
      bl.rotation.z = a;
      bl.rotation.x = 0.40;
    }
    g.add(hub);
  }
  // Two rudders, one behind each screw, which is what gives a Type VII her
  // turning circle on the surface.
  for (const x of [-1.15, 1.15]) {
    box(g, M.gunDark, 0.12, 1.70, 1.05, x, -1.90, -0.952 * HALF);
  }
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['pressureHull', pressureHull],
  ['outerHull', outerHull],
  ['casing', casing],
  ['tower', tower],
  ['towerInside', towerInside],
  ['fittings', fittings],
  ['screws', screws],
];

export function buildUboat() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  // Her insides. A boat is one long tube of compartments with no bulkhead deck
  // and no citadel: fore-ends, forward berthing, control room, engine room,
  // motor room, after-ends. The interior builder wants a ship's lines, so it
  // is given the pressure hull's -- which is the only part of her that has an
  // inside at all.
  buildInterior(g, {
    loa: LOA,
    shellAt: (t, y) => {
      const r = hullR(t);
      const dy = y - PY;
      if (Math.abs(dy) >= r) return 0.02;
      return Math.sqrt(Math.max(0, r * r - dy * dy)) * 0.94;
    },
    keelY: (t) => PY - hullR(t) * 0.94,
    sheer: (t) => PY + hullR(t) * 0.88,
    zAt: (t) => t * HALF,
  });
  mergeStatic(g, bySection(LOA));
  const turrets = deckGun(g);
  const aaMounts = flak(g);
  const { mounts: torpMounts, caps } = tubes(g);
  mergeMoving(g);
  g.userData.classId = 'u48';
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckAt(0),
    secMounts: [], aaMounts, torpMounts,
    // The bow caps, for the client to swing when a tube fires.
    tubeCaps: caps,
  };
}

export function uboatParts() {
  const parts = [];
  const builders = [...STATIC, ['deckGun', deckGun], ['flak', flak], ['tubes', tubes]];
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
