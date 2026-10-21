// The owner's B5N, from the glb it came as to the pieces the game flies.
//
//   node build/b5n-source.mjs    ->  client/js/render/b5nModel.data.js
//
// Wants the decimator (see build/sculpt-source.mjs):
//
//   npm i --no-save meshoptimizer@0.22
//
// The sculpt is one welded skin of a quarter of a million triangles with no
// colour in it, caught in flight like the Suisei's: her wheels are up and
// there is nothing of them, her greenhouse is a frame of bars with nothing
// between them, and the gunner's 7.7 mm is a lump with its barrel cocked out to
// port. What she has that the Suisei had not is her airscrew -- three blades,
// properly made -- and her torpedo, a Type 91 slung under her belly on its
// crutch. So this cuts the sculpt into the pieces she can lose and the pieces
// of her that move -- each wing at its root and again at the fold, her tail,
// her airscrew and the fish -- and builds what the sculpt has not got: her
// legs, the glazing, and the gunner's gun on a mounting that turns. Every
// triangle is tagged with what it is, and the paint is laid in the shader (see
// b5nModel.js).
//
// Her frame is the game's: nose +z, up +y, wheels on y = 0 and the span the
// fifteen and a half metres a B5N2 had. She sits three-point on the deck, nose
// up by `TILT`, as every aeroplane in the kit does, so everything measured off
// the sculpt is measured level and turned up afterwards.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, simplifier } from './sculpt-source.mjs';

const SRC = path.join(ROOT, 'assets/models/b5n-kate.glb');
const OUT = path.join(ROOT, 'client/js/render/b5nModel.data.js');

// ---- read ---------------------------------------------------------------
function readGlb(file) {
  const b = readFileSync(file);
  let off = 12, json = null, bin = null;
  while (off < b.length) {
    const len = b.readUInt32LE(off), type = b.toString('ascii', off + 4, off + 8);
    if (type === 'JSON') json = JSON.parse(b.toString('utf8', off + 8, off + 8 + len));
    else bin = b.subarray(off + 8, off + 8 + len);
    off += 8 + len;
  }
  const acc = (i) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView];
    const n = { SCALAR: 1, VEC3: 3 }[a.type];
    const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
    const start = bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0);
    return new T(bin.buffer.slice(start, start + a.count * n * T.BYTES_PER_ELEMENT));
  };
  const p = json.meshes[0].primitives[0];
  return { pos: acc(p.attributes.POSITION), nor: acc(p.attributes.NORMAL), idx: acc(p.indices) };
}

const g = readGlb(SRC);
// The sculpt's frame is the Suisei's: nose toward -x, span along z, up +y,
// nineteen tenths of a unit across. Into hers, level, at her real span.
const SPAN = 15.52;
const S0 = SPAN / 1.90365;
const nv0 = g.pos.length / 3;
const P = new Float64Array(nv0 * 3);
const N = new Float64Array(nv0 * 3);
for (let i = 0; i < nv0; i++) {
  P[i * 3] = g.pos[i * 3 + 2] * S0;
  P[i * 3 + 1] = g.pos[i * 3 + 1] * S0;
  P[i * 3 + 2] = -g.pos[i * 3] * S0;
  N[i * 3] = g.nor[i * 3 + 2];
  N[i * 3 + 1] = g.nor[i * 3 + 1];
  N[i * 3 + 2] = -g.nor[i * 3];
}
const T0 = g.idx;

// ---- level to her own frame ---------------------------------------------
// Nose up by TILT, wheels on the deck. The fish is the thing that sets her
// legs: it hangs lower under her than her airscrew's tips nearly do, and runs
// back past the trailing edge, so sat steeply on her tail she would put its
// box tail on the deck. At this attitude and with her wheels this far down
// it clears by a hand's breadth.
const TILT = 0.149;
const CT = Math.cos(TILT), ST = Math.sin(TILT);
// Where her main wheels touch, level: under the centre section, ahead of her
// centre of gravity.
const MAIN_X = 1.9, MAIN_Z = 2.45, MAIN_Y = -2.42;
const GROUND = MAIN_Y * CT + MAIN_Z * ST;   // the deck, in the level frame turned up
const DZ = 0;
const F = (p) => [p[0], p[1] * CT + p[2] * ST - GROUND, -p[1] * ST + p[2] * CT + DZ];
const FN = (n) => [n[0], n[1] * CT + n[2] * ST, -n[1] * ST + n[2] * CT];

// ---- what she is made of ------------------------------------------------
export const TAG = {
  skin: 0, cowl: 1, glass: 2, blade: 3, spinner: 4, leg: 5, tyre: 6, metal: 7,
  door: 8, wing: 9, tip: 10, engine: 11, fish: 12, band: 13, head: 14,
};

const PROP_Z = 5.18;          // the back of her hub
const PROP_C = [0, -0.255, 5.30];
const PROP_R = 1.65;
const TAIL_CUT = -3.4;        // where a tail shot off comes away
const FOLD = 3.3;             // where her outer panels fold, and come away
const ROOT_X = 0.75;          // where the wing proper starts, outboard of the fillet
// The fish: a Type 91 on her centreline, its axis level under her belly.
const FISH = { y: -1.325, r: 0.19, z0: -3.15, z1: 4.55 };
// The gunner's position, where the sculpt's gun stood, at the after end of
// her greenhouse.
const GUN_AT = [0, 0.57, -0.30];

function classify(cx, cy, cz) {
  const ax = Math.abs(cx);
  // The sculpt's gun -- its lump of a breech and the barrel cocked out to
  // port over the side -- which is rebuilt on a mounting that turns.
  if (ax < 0.17 && cz > -0.70 && cz < -0.08 && cy > 0.52) return null;
  if (cx < -0.05 && cx > -1.1 && cz > -0.32 && cz < -0.08 && cy > 0.50) return null;
  if (cz > PROP_Z) {
    const r = Math.hypot(cx - PROP_C[0], cy - PROP_C[1]);
    return { seg: 'prop', tag: r < 0.24 ? TAG.spinner : r > PROP_R - 0.26 && (r < PROP_R - 0.17 || r > PROP_R - 0.10) ? TAG.tip : TAG.blade };
  }
  // The fish, and its box tail, below her belly; the crutch it hangs on is
  // hers and stays.
  if (cy < -1.085 && ax < 0.32 && cz > FISH.z0 && cz < FISH.z1
    && (Math.hypot(cx, cy - FISH.y) < 0.26 || (cz < -1.6 && ax < 0.30))) {
    return { seg: 'store', tag: cz > 3.55 ? TAG.head : TAG.fish };
  }
  if (cz < TAIL_CUT) return { seg: 'tail', tag: ax > 0.32 && cy < 0.35 && cz < -3.9 ? TAG.wing : TAG.skin };
  // The engine showing through the front of her cowling. The cowling itself
  // is skin, and the shader paints it black off a clean line round her.
  if (cz > 4.9 && Math.hypot(cx, cy - PROP_C[1]) < 0.62) return { seg: 'body', tag: TAG.engine };
  if (ax > ROOT_X && cz > -1.4 && cz < 3.4) {
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
for (let t = 0; t < T0.length; t += 3) {
  const a = T0[t], b = T0[t + 1], c = T0[t + 2];
  const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3;
  const cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
  const cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
  const k = classify(cx, cy, cz);
  if (!k) continue;
  TT.push(a, b, c);
  tags.push(k.tag);
  segs.push(k.seg);
  used[a] = used[b] = used[c] = 1;
}

// ---- seal the greenhouse ------------------------------------------------
// Glazed the way the Suisei's is: a skin laid just inside the envelope of her
// canopy bars, read off the sculpt, so the bars stand on the glass.
const CY = 0.42;
const Z0 = 0.46, Z1 = 2.98;
const NZ = 34, NA = 19;
const env = [];
for (let iz = 0; iz < NZ; iz++) {
  const z = Z0 + (Z1 - Z0) * iz / (NZ - 1);
  const row = [];
  for (let ia = 0; ia < NA; ia++) row.push(0.2);
  env.push(row);
  for (let i = 0; i < nv0; i++) {
    if (!used[i]) continue;
    const vz = P[i * 3 + 2];
    if (Math.abs(vz - z) > 0.12) continue;
    const x = P[i * 3], y = P[i * 3 + 1] - CY;
    if (y < -0.02 || Math.abs(x) > 0.62) continue;
    const r = Math.hypot(x, y);
    const a = Math.atan2(x, y);
    const ia = Math.round((a / Math.PI + 0.5) * (NA - 1));
    if (ia < 0 || ia >= NA) continue;
    for (let d = -1; d <= 1; d++) {
      const j = ia + d;
      if (j >= 0 && j < NA) row[j] = Math.max(row[j], Math.min(0.58, r));
    }
  }
}
for (let pass = 0; pass < 2; pass++) {
  const copy = env.map((r) => r.slice());
  for (let iz = 0; iz < NZ; iz++) {
    for (let ia = 0; ia < NA; ia++) {
      let s = 0, n = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let da = -1; da <= 1; da++) {
          const a = iz + dz, b = ia + da;
          if (a < 0 || a >= NZ || b < 0 || b >= NA) continue;
          const w = dz === 0 && da === 0 ? 2 : 1;
          s += copy[a][b] * w; n += w;
        }
      }
      env[iz][ia] = Math.max(copy[iz][ia] * 0.96, s / n);
    }
  }
}
const PP = Array.from(P);
const NN = Array.from(N);
{
  const base = PP.length / 3;
  for (let iz = 0; iz < NZ; iz++) {
    const z = Z0 + (Z1 - Z0) * iz / (NZ - 1);
    for (let ia = 0; ia < NA; ia++) {
      const a = (ia / (NA - 1) - 0.5) * Math.PI;
      const r = env[iz][ia] * 0.93;
      PP.push(Math.sin(a) * r, CY + Math.cos(a) * r, z);
      NN.push(Math.sin(a), Math.cos(a), 0);
    }
  }
  for (let iz = 0; iz < NZ - 1; iz++) {
    for (let ia = 0; ia < NA - 1; ia++) {
      const a = base + iz * NA + ia, b = a + 1, c = a + NA, d = c + 1;
      TT.push(a, c, b, b, c, d);
      tags.push(TAG.glass, TAG.glass);
      segs.push('body', 'body');
    }
  }
}

// ---- decimate -----------------------------------------------------------
function splitBy(key) {
  const map = new Map();
  const P2 = [], N2 = [], T2 = [];
  for (let t = 0; t < TT.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const v = TT[t + k];
      const id = v + '|' + key(t / 3);
      let n = map.get(id);
      if (n === undefined) {
        n = P2.length / 3;
        map.set(id, n);
        P2.push(PP[v * 3], PP[v * 3 + 1], PP[v * 3 + 2]);
        N2.push(NN[v * 3], NN[v * 3 + 1], NN[v * 3 + 2]);
      }
      T2.push(n);
    }
  }
  return { P: P2, N: N2, T: T2 };
}
const split = splitBy((t) => tags[t] + segs[t]);
const simplify = await simplifier();
const [outIdx, err] = simplify.simplify(Uint32Array.from(split.T), Float32Array.from(split.P), 3,
  32000 * 3, 0.004, []);
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
// The airframe's pieces are written in her own frame. A moving part is
// written about its hinge, in whichever frame it turns in: the airscrew, the
// fish and the gun in the level frame (they are turned up with her by the
// part's own rotation, see META), the legs in hers, because a leg stands plumb
// on the deck. The coarse one is in three, so that a machine ranged with her
// wings folded can be drawn coarse too: her outer panels are the two `lodOut`
// pieces.
const PIECES = ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR', 'prop',
  'store', 'gun', 'gearL', 'gearR', 'gearT', 'lod', 'lodOutL', 'lodOutR'];
const pieces = {};
for (const name of PIECES) pieces[name] = { map: new Map(), P: [], N: [], G: [], T: [] };

// The hinges, level.
const hingeOf = {
  prop: PROP_C,
  store: [0, FISH.y, (FISH.z0 + FISH.z1) / 2],
  gun: GUN_AT,
};
const LEVEL_PARTS = new Set(Object.keys(hingeOf));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

function put(name, p, n, tag, lod = false) {
  const pc = pieces[name];
  const at = LEVEL_PARTS.has(name) && !lod ? sub(p, hingeOf[name]) : F(p);
  const nn = LEVEL_PARTS.has(name) && !lod ? n : FN(n);
  const k = pc.P.length / 3;
  pc.P.push(...at);
  pc.N.push(...nn);
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
// A little kit of solids, each written straight into a piece. `xf` takes a
// point from where it is built to the frame the piece is written in; for the
// level-frame parts it is the identity and `put` takes off the hinge.
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
function basis(axis) {
  const w = V.norm(axis);
  const t = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = V.norm(V.cross(t, w));
  return [u, V.cross(w, u), w];
}
/**
 * A body of revolution: `prof` is [along, radius] pairs from `from` along `axis`.
 *
 * Each band between two stations has its own points, so a band of another
 * colour -- a tyre on its hub -- is a seam and not a smear of every colour
 * between the two.
 */
function lathe(name, from, axis, prof, tag, seg = 12, tagAt = null, putFn = put) {
  const [u, v, w] = basis(axis);
  const pc = pieces[name];
  const ring = (i, t) => {
    const [s, r] = prof[i];
    // The surface normal of the profile, from its slope.
    const a = prof[Math.max(0, i - 1)], b = prof[Math.min(prof.length - 1, i + 1)];
    const ds = b[0] - a[0], dr = b[1] - a[1];
    const l = Math.hypot(ds, dr) || 1;
    const row = [];
    for (let j = 0; j < seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      const radial = V.add(V.mul(u, Math.cos(th)), V.mul(v, Math.sin(th)));
      const p = V.add(V.add(from, V.mul(w, s)), V.mul(radial, r));
      const n = V.norm(V.add(V.mul(radial, ds / l), V.mul(w, -dr / l)));
      row.push(putFn(name, p, n, t));
    }
    return row;
  };
  for (let i = 0; i < prof.length - 1; i++) {
    const t = tagAt ? tagAt((prof[i][0] + prof[i + 1][0]) / 2, (prof[i][1] + prof[i + 1][1]) / 2) : tag;
    const r0 = ring(i, t), r1 = ring(i + 1, t);
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      pc.T.push(r0[j], r1[j], r1[j1], r0[j], r1[j1], r0[j1]);
    }
  }
}
/** A box, centred at `c`, along the axes `ax` (three unit vectors) with half sizes `h`. */
function slab(name, c, ax, h, tag, putFn = put) {
  const pc = pieces[name];
  for (let f = 0; f < 3; f++) {
    for (const s of [-1, 1]) {
      const n = V.mul(ax[f], s);
      const a = ax[(f + 1) % 3], b = ax[(f + 2) % 3];
      const ha = h[(f + 1) % 3], hb = h[(f + 2) % 3];
      const ctr = V.add(c, V.mul(n, h[f]));
      const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) =>
        putFn(name, V.add(V.add(ctr, V.mul(a, i * ha)), V.mul(b, j * hb)), n, tag));
      if (s > 0) pc.T.push(q[0], q[1], q[2], q[0], q[2], q[3]);
      else pc.T.push(q[0], q[2], q[1], q[0], q[3], q[2]);
    }
  }
}
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
/** A tube between two points. */
function rod(name, a, b, r, tag, seg = 8, putFn = put) {
  const d = sub(b, a);
  const l = Math.hypot(d[0], d[1], d[2]);
  lathe(name, a, d, [[0, r], [l, r]], tag, seg, null, putFn);
}
/** A tyre on its hub, about `axis`. */
function wheel(name, c, axis, R, w, putFn = put) {
  const w2 = w / 2;
  const from = V.add(c, V.mul(V.norm(axis), -w2));
  lathe(name, from, axis, [
    [0, R * 0.42], [0.0, R * 0.80], [w * 0.08, R * 0.95], [w2, R], [w - w * 0.08, R * 0.95],
    [w, R * 0.80], [w, R * 0.42],
  ], TAG.tyre, 18, (s, r) => (r < R * 0.5 ? TAG.leg : TAG.tyre), putFn);
  lathe(name, from, axis, [[0, R * 0.42], [w * 0.3, R * 0.40], [w * 0.5, R * 0.18]], TAG.leg, 12, null, putFn);
  lathe(name, V.add(from, V.mul(V.norm(axis), w)), V.mul(axis, -1),
    [[0, R * 0.42], [w * 0.3, R * 0.40], [w * 0.5, R * 0.18]], TAG.leg, 12, null, putFn);
}

// The gunner's Type 92 7.7 mm, on a mounting that turns. Written about the
// pivot of it, laid fore and aft with the muzzle aft: the batch turns it in
// azimuth about her vertical and in elevation about her beam.
const GUN_MUZZLE = [0, 0.06, -0.90];
{
  const c = GUN_AT;
  const at = (p) => V.add(c, p);
  rod('gun', at([0, -0.18, 0]), at([0, 0.02, 0]), 0.03, TAG.metal, 6);           // the pintle
  slab('gun', at([0, 0.06, 0.05]), [X, Y, Z], [0.035, 0.045, 0.18], TAG.metal);   // receiver
  rod('gun', at([0, 0.06, -0.12]), at(GUN_MUZZLE), 0.012, TAG.metal, 6);          // barrel
  rod('gun', at([0, 0.06, -0.12]), at([0, 0.06, -0.54]), 0.024, TAG.metal, 8);    // its jacket
  lathe('gun', at([0, 0.105, 0.04]), Y, [[0, 0.11], [0.05, 0.11], [0.05, 0]], TAG.metal, 14);  // the pan
  rod('gun', at([0, 0.03, 0.23]), at([0, -0.06, 0.27]), 0.016, TAG.metal, 6);     // the grip
  slab('gun', at([0, 0.13, -0.42]), [X, Y, Z], [0.004, 0.03, 0.004], TAG.metal);  // foresight
}

// Her legs, built standing on the deck in her own frame.
function underAt(x, z, dx = 0.06, dz = 0.08) {
  let lo = Infinity;
  for (let i = 0; i < nv0; i++) {
    if (!used[i]) continue;
    if (Math.abs(P[i * 3] - x) > dx || Math.abs(P[i * 3 + 2] - z) > dz) continue;
    if (P[i * 3 + 1] < lo) lo = P[i * 3 + 1];
  }
  return lo;
}
const legs = {};
const MAIN_R = 0.38;
for (const [side, s] of [['L', -1], ['R', 1]]) {
  const lx = s * MAIN_X, lz = MAIN_Z - 0.06;
  const hinge = F([lx, underAt(lx, lz) + 0.01, lz]);
  const name = 'gear' + side;
  const W = MAIN_R;
  const axle = [s * (MAIN_X - 0.04), W, hinge[2] + 0.06];
  const putF = (nm, p, n, tag) => {
    const pc = pieces[nm];
    const k = pc.P.length / 3;
    pc.P.push(...sub(p, hinge));
    pc.N.push(...n);
    pc.G.push(tag);
    return k;
  };
  // A long oleo, because she stands tall over her fish: its sliding lower
  // half bright, the scissors, and the fork round the wheel.
  const x0 = s * (MAIN_X + 0.06);
  const top = [x0, hinge[1], hinge[2]];
  const knee = [x0, W + 0.42, axle[2]];
  rod(name, top, knee, 0.075, TAG.leg, 8, putF);
  rod(name, knee, [x0, W, axle[2]], 0.055, TAG.metal, 8, putF);
  rod(name, [x0, W, axle[2]], axle, 0.04, TAG.leg, 6, putF);
  slab(name, [x0, W + 0.30, axle[2] + 0.09], [X, Y, Z], [0.016, 0.13, 0.035], TAG.leg, putF);
  // The drag strut, back to the spar.
  rod(name, [x0, hinge[1] - 0.04, hinge[2] - 0.55], [x0, (hinge[1] + W) * 0.55, hinge[2] - 0.02], 0.035,
    TAG.leg, 6, putF);
  wheel(name, axle, X, W, 0.20, putF);
  // The door on the leg, which closes the well when she is up.
  const dl = hinge[1] - (W + 0.16);
  slab(name, [s * (MAIN_X + 0.15), W + 0.16 + dl / 2, axle[2] - 0.03], [X, Y, Z], [0.012, dl / 2, 0.26],
    TAG.door, putF);
  legs[side] = hinge;
}
{
  const tz = -5.12;
  const hinge = F([0, underAt(0, tz, 0.08, 0.1) + 0.02, tz]);
  const W = 0.16;
  const axle = [0, W, hinge[2] - 0.14];
  const putF = (nm, p, n, tag) => {
    const pc = pieces[nm];
    const k = pc.P.length / 3;
    pc.P.push(...sub(p, hinge));
    pc.N.push(...n);
    pc.G.push(tag);
    return k;
  };
  rod('gearT', hinge, [0, W + 0.16, axle[2] + 0.03], 0.04, TAG.leg, 8, putF);
  for (const s of [-1, 1]) rod('gearT', [s * 0.055, W + 0.18, axle[2] + 0.03], [s * 0.055, W, axle[2]], 0.017, TAG.leg, 6, putF);
  rod('gearT', [-0.07, W, axle[2]], [0.07, W, axle[2]], 0.02, TAG.metal, 6, putF);
  wheel('gearT', axle, X, W, 0.085, putF);
  legs.T = hinge;
}

// The coarse one, for a machine parked on a deck: her legs down and her gun
// stowed. Her airscrew and her fish are the sculpt's and the coarse
// decimation already carries them.
for (const name of ['gun', 'gearL', 'gearR', 'gearT']) {
  const src = pieces[name], dst = pieces.lod;
  // The parts written so far are about their hinges; put them back.
  const back = LEVEL_PARTS.has(name)
    ? (p) => F(V.add(p, hingeOf[name]))
    : (p) => V.add(p, name === 'gearT' ? legs.T : legs[name.slice(-1)]);
  const backN = LEVEL_PARTS.has(name) ? FN : (n) => n;
  const base = dst.P.length / 3;
  const nv = src.P.length / 3;
  for (let i = 0; i < nv; i++) {
    dst.P.push(...back(src.P.slice(i * 3, i * 3 + 3)));
    dst.N.push(...backN(src.N.slice(i * 3, i * 3 + 3)));
    dst.G.push(src.G[i]);
  }
  for (const v of src.T) dst.T.push(base + v);
}

// ---- check her stance ---------------------------------------------------
// Nothing of her but her wheels may be on or under the deck.
{
  let low = Infinity, at = null;
  for (const name of ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR']) {
    const pc = pieces[name];
    for (let i = 0; i < pc.P.length; i += 3) if (pc.P[i + 1] < low) { low = pc.P[i + 1]; at = pc.P.slice(i, i + 3); }
  }
  let fish = Infinity;
  const st = pieces.store;
  for (let i = 0; i < st.P.length; i += 3) {
    fish = Math.min(fish, F(V.add(st.P.slice(i, i + 3), hingeOf.store))[1]);
  }
  let blade = Infinity;
  const pr = pieces.prop;
  for (let i = 0; i < pr.P.length; i += 3) {
    blade = Math.min(blade, F(V.add(pr.P.slice(i, i + 3), hingeOf.prop))[1]);
  }
  const tw = pieces.gearT;
  let tail = Infinity;
  for (let i = 0; i < tw.P.length; i += 3) tail = Math.min(tail, tw.P[i + 1] + legs.T[1]);
  console.log(`lowest of her airframe ${low.toFixed(3)} at ${at.map((v) => v.toFixed(2))}, fish ${fish.toFixed(3)}, `
    + `airscrew ${blade.toFixed(3)}, tail wheel ${tail.toFixed(3)}`);
  if (fish < 0.08 || low < 0.08) throw new Error('she is standing on her fish');
}

// ---- pack ---------------------------------------------------------------
// u32 vertex count, u32 triangle count, Int16 positions in millimetres, Int8
// normals, a tag byte a vertex, a byte of padding to an even offset, Uint16
// indices.
function pack(pc) {
  const nv = pc.P.length / 3, nt = pc.T.length / 3;
  if (nv >= 65536) throw new Error('piece too big for Uint16 indices');
  const h = Buffer.alloc(8);
  h.writeUInt32LE(nv, 0);
  h.writeUInt32LE(nt, 4);
  const pos = Buffer.from(Int16Array.from(pc.P, (v) => Math.round(v * 1000)).buffer);
  const nrm = Buffer.from(Int8Array.from(pc.N, (v) => Math.max(-127, Math.min(127, Math.round(v * 127)))).buffer);
  const tag = Buffer.from(Uint8Array.from(pc.G));
  const head = 8 + pos.length + nrm.length + tag.length;
  return Buffer.concat([h, pos, nrm, tag, Buffer.alloc(head % 2),
    Buffer.from(Uint16Array.from(pc.T).buffer)]).toString('base64');
}

const out = {};
let total = 0;
for (const name of PIECES) {
  out[name] = pack(pieces[name]);
  if (!name.startsWith('lod')) total += pieces[name].T.length / 3;
  console.log(name, pieces[name].P.length / 3, 'points', pieces[name].T.length / 3, 'triangles');
}
const r3 = (a) => a.map((v) => Math.round(v * 1000) / 1000);
const tp = (p) => r3(F(p));
// Where each outer panel folds: along the top of her wing at the joint, fore
// and aft in the level frame.
const foldY = (x) => {
  let hi = -Infinity;
  for (let i = 0; i < nv0; i++) {
    if (!used[i] || Math.abs(P[i * 3] - x) > 0.05 || P[i * 3 + 2] < 0.5 || P[i * 3 + 2] > 2.5) continue;
    if (P[i * 3 + 1] < 0.4) hi = Math.max(hi, P[i * 3 + 1]);
  }
  return hi;
};
const meta = {
  span: SPAN,
  // How far she is turned nose-up from the level she was measured in, and
  // where that level frame's origin is in hers: the shader paints in the
  // level frame, so a paint line drawn along her is straight along her.
  tilt: TILT, ground: GROUND, dz: DZ,
  // The middle of her airframe, up from her wheels: what a hole is aimed at.
  cy: Math.round(F([0, -0.35, 0])[1] * 100) / 100,
  // Her airscrew turns about this point, about her thrust line.
  prop: tp(PROP_C),
  propR: PROP_R,
  // The parts that turn in the level frame are turned up with her by `tilt`;
  // the legs are in hers. Each main leg swings inward about a fore-and-aft
  // hinge at its top, the tail wheel back and up into her.
  gearL: { at: r3(legs.L), axis: 'z', up: 1.571, tuck: 0.0 },
  gearR: { at: r3(legs.R), axis: 'z', up: -1.571, tuck: 0.0 },
  gearT: { at: r3(legs.T), axis: 'x', up: -1.55, tuck: 0.04 },
  // The fish, about its own middle, on her centreline.
  store: { at: tp(hingeOf.store), len: FISH.z1 - FISH.z0, r: FISH.r },
  // The gunner's gun, about its pivot, and its muzzle in its own frame.
  gun: { at: tp(GUN_AT), muzzle: GUN_MUZZLE },
  // A B5N2 carried no fixed gun at all.
  guns: [],
  // Her outer panels fold up over her back, about a hinge along the top of
  // the joint, port over starboard so the tips cross clear of each other.
  foldL: { at: tp([-FOLD, foldY(-FOLD), 0]), up: -2.58 },
  foldR: { at: tp([FOLD, foldY(FOLD), 0]), up: 2.46 },
  breaks: {
    tail: tp([0, 0.1, TAIL_CUT]),
    wingInL: tp([-ROOT_X, -0.7, 1.4]),
    wingInR: tp([ROOT_X, -0.7, 1.4]),
    wingOutL: tp([-FOLD, -0.35, 1.5]),
    wingOutR: tp([FOLD, -0.35, 1.5]),
    prop: tp(PROP_C),
  },
  exhaust: [tp([-0.74, -0.62, 4.35]), tp([0.74, -0.62, 4.35])],
  tips: [tp([-7.7, 0.12, 1.9]), tp([7.7, 0.12, 1.9])],
};
console.log('total', total, 'triangles', JSON.stringify(meta));

writeFileSync(OUT, `// Generated by build/b5n-source.mjs from the owner's B5N.
// Do not hand-edit -- regenerate from assets/models/b5n-kate.glb instead.
export const B5N_PIECES = ${JSON.stringify(out, null, 0).replace(/","/g, '",\n  "')};
export const B5N_META = ${JSON.stringify(meta)};
`);
console.log('wrote', OUT);
