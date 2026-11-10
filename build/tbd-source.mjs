// The owner's TBD-1 Devastator, from the glb it came as to the pieces the game
// flies.
//
//   node build/tbd-source.mjs    ->  client/js/render/devastatorModel.data.js
//
// Wants the decimator (see build/sculpt-source.mjs):
//
//   npm i --no-save meshoptimizer@0.22
//
// The sculpt is one welded skin of half a million triangles with no colour in
// it, sat on her wheels nose-up the way she stood on a deck: legs down, her
// long greenhouse a frame of bars with nothing between them and the gunner's
// thirty stowed aft along her spine. She came with nothing under her belly.
// She is levelled -- her thrust line flat, the frame everything is measured
// in -- and cut into the pieces she can lose and the pieces of her that move:
// each wing at its root and again at the fold, outboard of her legs; her tail;
// her airscrew; her two main legs, which swing aft about their tops until the
// wheels lie half out of the wing the way a Devastator's did; and the
// gunner's gun, which turns on its mounting. Her greenhouse is glazed, and
// what she carries is built here:
//
//   - the Mark 13 aerial torpedo, slung under her belly a little off her
//     centreline, with its shroud ring round its tail.
//
// Every triangle is tagged with what it is, and the paint is laid in the
// shader (see devastatorModel.js).
//
// Her frame is the game's: nose +z, up +y, wheels on y = 0 and the span the
// fifteen point two four metres a TBD-1 had. She sits three-point on the deck
// nose up by `TILT`; everything is measured level and turned up afterwards.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, simplifier } from './sculpt-source.mjs';
import { readSculpt, heightsAt, glaze, splitBy, kit, pack, r3, V, X, Y, Z } from './plane-sculpt.mjs';

const SRC = path.join(ROOT, 'assets/models/TBD-1DEVASTATOR.glb');
const OUT = path.join(ROOT, 'client/js/render/devastatorModel.data.js');

const SPAN = 15.24;
const RAW = readSculpt(SRC, SPAN);

// ---- level her ----------------------------------------------------------
// The sculpt stands on its wheels with its thrust line twelve degrees up: the
// middle of her cowling and the middle of her fuselage aft of the gunner are
// level once she is turned nose-down by that much.
const LEVEL = (12 * Math.PI) / 180;
{
  const c = Math.cos(LEVEL), s = Math.sin(LEVEL);
  const { P, N } = RAW;
  for (let i = 0; i < RAW.nv; i++) {
    const y = P[i * 3 + 1], z = P[i * 3 + 2];
    P[i * 3 + 1] = y * c - z * s;
    P[i * 3 + 2] = y * s + z * c;
    const ny = N[i * 3 + 1], nz = N[i * 3 + 2];
    N[i * 3 + 1] = ny * c - nz * s;
    N[i * 3 + 2] = ny * s + nz * c;
  }
}

/**
 * Every triangle that crosses one of the planes x = `cuts` cut along it, so
 * that the panel coming away there comes away along a straight line and not a
 * row of teeth: the sculpt's skin is a few big triangles out on the wing, and
 * cut by where their middles fall the joint is a saw.
 */
function cutAcross(raw, cuts) {
  const P = Array.from(raw.P), N = Array.from(raw.N);
  let T = Array.from(raw.T);
  let made = 0;
  for (const X0 of cuts) {
    const T2 = [];
    const memo = new Map();
    const mid = (a, b) => {
      const k = a < b ? a + ',' + b : b + ',' + a;
      if (memo.has(k)) return memo.get(k);
      const u = (X0 - P[a * 3]) / (P[b * 3] - P[a * 3]);
      const w = P.length / 3;
      for (let c = 0; c < 3; c++) P.push(P[a * 3 + c] + (P[b * 3 + c] - P[a * 3 + c]) * u);
      P[w * 3] = X0;
      const n = [0, 1, 2].map((c) => N[a * 3 + c] + (N[b * 3 + c] - N[a * 3 + c]) * u);
      const l = Math.hypot(...n) || 1;
      N.push(n[0] / l, n[1] / l, n[2] / l);
      memo.set(k, w);
      made++;
      return w;
    };
    for (let t = 0; t < T.length; t += 3) {
      const v = [T[t], T[t + 1], T[t + 2]];
      const sd = v.map((i) => Math.sign(P[i * 3] - X0));
      if (!(sd.includes(1) && sd.includes(-1))) { T2.push(...v); continue; }
      const a = [], b = [];
      for (let k = 0; k < 3; k++) {
        const i = v[k], j = v[(k + 1) % 3];
        if (sd[k] >= 0) a.push(i);
        if (sd[k] <= 0) b.push(i);
        if (sd[k] * sd[(k + 1) % 3] < 0) { const w = mid(i, j); a.push(w); b.push(w); }
      }
      for (const poly of [a, b]) for (let k = 1; k + 1 < poly.length; k++) T2.push(poly[0], poly[k], poly[k + 1]);
    }
    T = T2;
  }
  console.log(`cut: ${made} points made along the folds`);
  return { P: Float64Array.from(P), N: Float64Array.from(N), T: Uint32Array.from(T), nv: P.length / 3 };
}

// ---- her stance ---------------------------------------------------------
// The bottoms of her main wheels and her tail wheel, in the level frame, read
// off the sculpt: the deck is the line through them.
const MAIN = [1.75, -3.04, 2.93];
const TAILW = [0, -1.46, -4.19];
const TILT = Math.atan2(TAILW[1] - MAIN[1], MAIN[2] - TAILW[2]);
const CT = Math.cos(TILT), ST = Math.sin(TILT);
const GROUND = MAIN[1] * CT + MAIN[2] * ST;
const DZ = 0;
const F = (p) => [p[0], p[1] * CT + p[2] * ST - GROUND, -p[1] * ST + p[2] * CT + DZ];
const FN = (n) => [n[0], n[1] * CT + n[2] * ST, -n[1] * ST + n[2] * CT];

// ---- what she is made of ------------------------------------------------
export const TAG = {
  skin: 0, cowl: 1, glass: 2, blade: 3, spinner: 4, leg: 5, tyre: 6, metal: 7,
  cave: 8, wing: 9, tip: 10, fish: 11, head: 12,
};

const PROP_Z = 5.42;           // the face of her cowling: everything ahead of it turns
const PROP_C = [0, -0.64, 5.55];
const PROP_R = 1.6;
const TAIL_CUT = -2.9;         // where a tail shot off comes away
const FOLD = 3.95;             // where her outer panels fold up, and come away
const { P, N, T: T0, nv: nv0 } = cutAcross(RAW, [-FOLD, FOLD]);
const ROOT_X = 0.9;            // where the wing proper starts, outboard of the fillet
// Each main leg: the hub of its wheel, and the top of the leg under the wing
// where it turns aft on its hinge.
const LEG = { x: 1.75, hub: [1.75, -2.66, 2.93], r: 0.38, top: -1.86, z: 2.95 };
// The gunner's thirty, stowed aft along her spine, and the pivot it swings on.
const GUN = { x: 0.33, y: 0.02, z0: -1.12, z1: -0.15, at: [0, 0.0, -0.55] };
// The Mark 13, under her belly between her wheels.
const FISH = { len: 4.09, r: 0.285, x: 0.12, z: 1.95 };

function classify(cx, cy, cz) {
  const ax = Math.abs(cx);
  if (cz > PROP_Z) {
    const r = Math.hypot(cx - PROP_C[0], cy - PROP_C[1]);
    return { seg: 'prop', tag: r < 0.22 ? TAG.spinner : r > PROP_R - 0.14 ? TAG.tip : TAG.blade };
  }
  if (cz > 5.15 && Math.hypot(cx, cy - PROP_C[1]) < 0.5) return { seg: 'body', tag: TAG.cowl };
  // The gunner's gun, laid aft along her spine.
  if (ax < GUN.x && cy > GUN.y && cz > GUN.z0 && cz < GUN.z1) return { seg: 'gun', tag: TAG.metal };
  // Her main legs and wheels, under the wing.
  if (ax > 1.2 && ax < 2.3 && cy < LEG.top && cz > 2.2 && cz < 3.6) {
    const tyre = Math.hypot(cy - LEG.hub[1], cz - LEG.hub[2]) < LEG.r + 0.02 && cy < -2.2;
    return { seg: cx > 0 ? 'gearR' : 'gearL', tag: tyre ? TAG.tyre : TAG.leg };
  }
  if (cz < TAIL_CUT) {
    // The tail wheel, which a Devastator did not raise.
    if (ax < 0.2 && cy < -1.15 && cz > -4.5 && cz < -3.6) return { seg: 'tail', tag: cy < -1.25 ? TAG.tyre : TAG.leg };
    return { seg: 'tail', tag: ax > 0.36 && cy < 0.5 && cz < -3.4 ? TAG.wing : TAG.skin };
  }
  if (ax > ROOT_X && cy < -0.3 && cz > -0.6 && cz < 3.6) {
    const side = cx > 0 ? 'R' : 'L';
    return { seg: (ax > FOLD ? 'wingOut' : 'wingIn') + side, tag: TAG.wing };
  }
  return { seg: 'body', tag: TAG.skin };
}

// ---- tag every triangle -------------------------------------------------
const TT = [];
const tags = [];
const segs = [];
const used = new Uint8Array(nv0);
const keepTri = new Uint8Array(T0.length / 3);
for (let t = 0; t < T0.length; t += 3) {
  const a = T0[t], b = T0[t + 1], c = T0[t + 2];
  const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3;
  const cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
  const cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
  const k = classify(cx, cy, cz);
  if (!k) continue;
  keepTri[t / 3] = 1;
  TT.push(a, b, c);
  tags.push(k.tag);
  segs.push(k.seg);
  if (k.seg !== 'gun') used[a] = used[b] = used[c] = 1;
}

// ---- glaze the greenhouse -----------------------------------------------
// From the windscreen back over the pilot, the observer and the gunner: the
// frames came without any glass in them.
const PP = Array.from(P);
const NN = Array.from(N);
glaze({ P, nv: nv0, used, PP, NN, TT, tags, segs, tag: TAG.glass,
  cy: 0.0, z0: -0.15, z1: 3.55, rMax: 0.72, inset: 0.95 });

// ---- decimate -----------------------------------------------------------
const split = splitBy(PP, NN, TT, (t) => tags[t] + segs[t]);
const simplify = await simplifier();
const [outIdx, err] = simplify.simplify(Uint32Array.from(split.T), Float32Array.from(split.P), 3,
  34000 * 3, 0.004, []);
console.log(`decimated ${split.T.length / 3} to ${outIdx.length / 3} triangles, error ${err.toExponential(2)}`);
const [lodIdx] = simplify.simplify(Uint32Array.from(split.T), Float32Array.from(split.P), 3,
  7500 * 3, 0.02, []);
const vTag = new Int16Array(split.P.length / 3).fill(-1);
const vSeg = new Array(split.P.length / 3);
for (let t = 0; t < split.T.length / 3; t++) {
  for (let k = 0; k < 3; k++) {
    const v = split.T[t * 3 + k];
    vTag[v] = tags[t];
    vSeg[v] = segs[t];
  }
}

// ---- the pieces ---------------------------------------------------------
const PIECES = ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR', 'prop',
  'gearL', 'gearR', 'gun', 'store', 'crutch', 'lod', 'lodOutL', 'lodOutR'];
const pieces = {};
for (const name of PIECES) pieces[name] = { map: new Map(), P: [], N: [], G: [], T: [] };

const underAt = (x, z) => {
  const hs = heightsAt(P, T0, keepTri, x, z);
  return hs.length ? hs[0] : -1.7;
};
const belly = Math.min(underAt(FISH.x, FISH.z - 1), underAt(FISH.x, FISH.z), underAt(FISH.x, FISH.z + 1));
// Snug up under her, a third of its depth in the recess of her belly.
const FISH_C = [FISH.x, belly + 0.12 - FISH.r, FISH.z];
const hingeOf = {
  prop: PROP_C,
  gearL: [-LEG.x, LEG.top, LEG.z],
  gearR: [LEG.x, LEG.top, LEG.z],
  gun: GUN.at,
  store: FISH_C,
};
const LEVEL_PARTS = new Set(Object.keys(hingeOf));

function put(name, p, n, tag, lod = false) {
  const pc = pieces[name];
  const level = LEVEL_PARTS.has(name) && !lod;
  const k = pc.P.length / 3;
  pc.P.push(...(level ? V.sub(p, hingeOf[name]) : F(p)));
  pc.N.push(...(level ? n : FN(n)));
  pc.G.push(tag);
  return k;
}

const lodOf = (seg) => (seg === 'wingOutL' ? 'lodOutL' : seg === 'wingOutR' ? 'lodOutR' : 'lod');
for (const [idxs, coarse] of [[outIdx, false], [lodIdx, true]]) {
  for (let t = 0; t < idxs.length; t += 3) {
    const seg = vSeg[idxs[t]];
    const name = coarse ? lodOf(seg) : seg;
    const pc = pieces[name];
    for (let k = 0; k < 3; k++) {
      const v = idxs[t + k];
      let n = pc.map.get(v);
      if (n === undefined) {
        n = put(name, [split.P[v * 3], split.P[v * 3 + 1], split.P[v * 3 + 2]],
          [split.N[v * 3], split.N[v * 3 + 1], split.N[v * 3 + 2]], vTag[v], coarse);
        pc.map.set(v, n);
      }
      pc.T.push(n);
    }
  }
}

// ---- what the sculpt has not got ----------------------------------------
const { lathe, slab, rod } = kit(pieces, put);

// The Mark 13, about its own middle, nose +z: a blunt warhead, a long
// cylinder, a tapering afterbody, the box tail and the plywood shroud ring
// round it.
{
  const c = FISH_C, L = FISH.len, R = FISH.r;
  const from = V.add(c, [0, 0, -L / 2]);
  lathe('store', from, Z, [
    [0, 0], [0.02, R * 0.3], [0.22, R * 0.62], [0.62, R * 0.86], [1.1, R], [L - 0.95, R],
    [L - 0.55, R * 0.97], [L - 0.25, R * 0.84], [L - 0.07, R * 0.52], [L, 0],
  ], TAG.fish, 16);
  // The warhead, painted on the nose third.
  lathe('store', V.add(from, [0, 0, L - 0.98]), Z, [
    [0, R * 1.005], [0.4, R * 1.005], [0.7, R * 0.975], [0.91, R * 0.86], [0.97, R * 0.56],
  ], TAG.head, 16);
  // Fins and rudders, and the ring round them.
  for (const [ax, ay] of [[1, 0], [0, 1]]) {
    slab('store', V.add(from, [0, 0, 0.18]), [X, Y, Z], [ax ? R * 1.05 : 0.008, ay ? R * 1.05 : 0.008, 0.16], TAG.fish);
  }
  lathe('store', V.add(from, [0, 0, -0.08]), Z, [
    [0, R * 1.18], [0.01, R * 1.28], [0.33, R * 1.28], [0.34, R * 1.18], [0.33, R * 1.18], [0.01, R * 1.18],
  ], TAG.metal, 18);
}
// The crutch it hangs in: two sway braces either side and the shackle strap
// over its back, which stay with her when it goes.
{
  const c = FISH_C, R = FISH.r;
  for (const dz of [-0.75, 0.75]) {
    for (const s of [-1, 1]) {
      rod('crutch', [c[0] + s * 0.16, belly + 0.02, c[2] + dz], [c[0] + s * R * 0.78, c[1] + R * 0.62, c[2] + dz], 0.025, TAG.metal, 6);
    }
  }
  slab('crutch', [c[0], belly - 0.005, c[2]], [X, Y, Z], [0.12, 0.03, 0.95], TAG.metal);
}

// ---- check her stance ---------------------------------------------------
const lowest = (name) => {
  let lo = Infinity;
  const pc = pieces[name];
  for (let i = 0; i < pc.P.length; i += 3) lo = Math.min(lo, F(V.add(pc.P.slice(i, i + 3), hingeOf[name]))[1]);
  return lo;
};
{
  let low = Infinity, at = null;
  for (const name of ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR']) {
    const pc = pieces[name];
    for (let i = 0; i < pc.P.length; i += 3) {
      if (pc.G[i / 3] === TAG.tyre || pc.G[i / 3] === TAG.leg) continue;
      if (pc.P[i + 1] < low) { low = pc.P[i + 1]; at = pc.P.slice(i, i + 3); }
    }
  }
  console.log(`tilt ${(TILT * 180 / Math.PI).toFixed(1)} deg, belly ${belly.toFixed(3)}, lowest of her airframe ${low.toFixed(3)} at ${at.map((v) => v.toFixed(2))}, `
    + `torpedo ${lowest('store').toFixed(3)}, airscrew ${lowest('prop').toFixed(3)}, wheel ${lowest('gearR').toFixed(3)}`);
  if (lowest('store') < 0.08) throw new Error('she is standing on her torpedo');
  if (low < 0.1) throw new Error('her airframe is on the deck');
}

// ---- pack ---------------------------------------------------------------
const out = {};
let total = 0;
for (const name of PIECES) {
  out[name] = pack(pieces[name]);
  if (!name.startsWith('lod')) total += pieces[name].T.length / 3;
  console.log(name, pieces[name].P.length / 3, 'points', pieces[name].T.length / 3, 'triangles');
}
const tp = (p) => r3(F(p));
// The fold: on the top of the wing at the joint, a little aft of its leading
// edge, so the panel swung up stands on the joint and not through it.
const FOLD_Z = 1.6;
const foldTop = (x) => {
  const hs = heightsAt(P, T0, keepTri, x, FOLD_Z);
  return hs.length ? hs[hs.length - 1] : -1.2;
};
const meta = {
  span: SPAN,
  tilt: TILT, ground: GROUND, dz: DZ,
  cy: Math.round(F([0, -0.6, 0])[1] * 100) / 100,
  prop: tp(PROP_C),
  propR: PROP_R,
  // Each main leg swings aft about its top until the wheel lies half out of
  // the wing under it, as a Devastator's did: she never hid them.
  gearL: { at: tp(hingeOf.gearL), axis: 'x', up: 1.45, tuck: 0.05 },
  gearR: { at: tp(hingeOf.gearR), axis: 'x', up: 1.45, tuck: 0.05 },
  // The torpedo, about its own middle.
  store: { at: tp(FISH_C), len: FISH.len, r: FISH.r },
  // The gunner's thirty, about its pivot, and its muzzle in its own frame,
  // laid aft.
  gun: { at: tp(GUN.at), muzzle: [0, 0.12, -0.75] },
  // The pilot's thirty, in the top of the cowling, firing through the disc.
  guns: [tp([0.22, 0.12, 4.6])],
  // The outer panels fold straight up about a fore-and-aft hinge on the top
  // of the wing at the joint.
  foldL: { at: tp([-FOLD, foldTop(-FOLD), FOLD_Z]) },
  foldR: { at: tp([FOLD, foldTop(FOLD), FOLD_Z]) },
  breaks: {
    tail: tp([0, -0.4, TAIL_CUT]),
    wingInL: tp([-ROOT_X, -1.3, 1.2]),
    wingInR: tp([ROOT_X, -1.3, 1.2]),
    wingOutL: tp([-FOLD, -1.3, 1.2]),
    wingOutR: tp([FOLD, -1.3, 1.2]),
    prop: tp(PROP_C),
  },
  exhaust: [tp([-0.7, -0.95, 4.6]), tp([0.7, -0.95, 4.6])],
  tips: [tp([-7.5, -1.0, 1.4]), tp([7.5, -1.0, 1.4])],
};
console.log('total', total, 'triangles', JSON.stringify(meta));

writeFileSync(OUT, `// Generated by build/tbd-source.mjs from the owner's TBD-1 Devastator.
// Do not hand-edit -- regenerate from assets/models/TBD-1DEVASTATOR.glb instead.
export const DEVASTATOR_PIECES = ${JSON.stringify(out, null, 0).replace(/","/g, '",\n  "')};
export const DEVASTATOR_META = ${JSON.stringify(meta)};
`);
console.log('wrote', OUT);
