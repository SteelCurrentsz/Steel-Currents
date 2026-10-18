// The owner's A6M Zero, from the glb it came as to the pieces the game flies.
//
//   node build/zero-source.mjs    ->  client/js/render/zeroModel.data.js
//
// Wants the decimator (see build/sculpt-source.mjs):
//
//   npm i --no-save meshoptimizer@0.22
//
// The sculpt is one welded skin of a quarter of a million triangles with no
// colour in it, her gear down and her cockpit open: a frame of canopy bars
// with nothing between them and the seat showing through. What comes out is
// the same aeroplane in her own frame (nose +z, up +y, wheels on y = 0, span
// the 11 m an A6M5 had), decimated to what a sky full of them can afford,
// with her greenhouse glazed over so the cockpit is sealed, every triangle
// tagged with what it is -- skin, wing, cowling, glass, airscrew, leg, tyre --
// and the whole of her cut into the pieces she can lose: each wing at its root
// and again outboard, her tail aft of the roundel, her airscrew, and her three
// legs on the hinges they retract about. The paint itself is laid in the
// shader (see zeroModel.js), so a roundel is a crisp circle however big the
// triangles under it are.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, simplifier } from './sculpt-source.mjs';

const SRC = path.join(ROOT, 'assets/models/a6m-zero.glb');
const OUT = path.join(ROOT, 'client/js/render/zeroModel.data.js');

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
// The sculpt's frame: nose toward -x, span along z, up +y, about a unit and a
// half long. Measured in "src" metres first -- the sculpt turned into the
// game's frame at a span of twelve -- because that is what every number below
// was read off; the last step scales her to her real span and sets her down.
const S0 = 12 / 1.9;
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

// ---- what she is made of ------------------------------------------------
export const TAG = {
  skin: 0, cowl: 1, glass: 2, blade: 3, spinner: 4, leg: 5, tyre: 6, metal: 7,
  door: 8, wing: 9, tip: 10,
};

// Her fuselage's half-breadth along her length, read off sections of her.
const HW = [[-5.3, 0.04], [-4.5, 0.12], [-3.5, 0.2], [-2.5, 0.27], [-1.5, 0.36],
  [-1.0, 0.44], [0, 0.52], [1, 0.56], [2, 0.6], [3, 0.66], [4.3, 0.74]];
function halfWidth(z) {
  if (z <= HW[0][0]) return HW[0][1];
  for (let i = 1; i < HW.length; i++) {
    if (z <= HW[i][0]) {
      const [z0, w0] = HW[i - 1], [z1, w1] = HW[i];
      return w0 + (w1 - w0) * (z - z0) / (z1 - z0);
    }
  }
  return HW[HW.length - 1][1];
}

const THRUST_Y = 0.445;      // her airscrew's axis, off the spinner
const COWL_FRONT = 4.23;     // the lip of the cowling
const COWL_BACK = 3.02;      // and the firewall, where the black stops
const TAIL_CUT = -2.55;      // where a tail shot off comes away
const CLIP = 3.45;           // where a clipped wing comes away

// Where her main legs are and what they hinge about, worked out below.
const legs = { L: null, R: null };

function classify(cx, cy, cz) {
  const ax = Math.abs(cx);
  const r = Math.hypot(cx, cy - THRUST_Y);
  // The airscrew: everything in front of the cowling lip, and the blade roots
  // and spinner skirt just inside it.
  if (cz > 4.30 || (cz > 4.23 && (r > 0.72 || r < 0.33))) {
    // The yellow on the last few inches of each blade is cut into it here, so
    // it is the same wherever the blade is drawn from.
    return { seg: 'prop', tag: r < 0.31 ? TAG.spinner : r > 1.45 ? TAG.tip : TAG.blade };
  }
  // Her main legs, under the wing.
  if (ax > 1.15 && ax < 2.6 && cy < -0.62 && cz > 1.3 && cz < 4.2) {
    return { seg: cx > 0 ? 'gearR' : 'gearL', tag: TAG.leg };
  }
  // And the tail wheel.
  if (cz < -4.15 && cy < -1.13 && ax < 0.25) return { seg: 'gearT', tag: TAG.leg };
  // The cowling.
  if (cz > COWL_BACK && cz <= 4.3 && r < 0.86 && ax < 0.9) return { seg: 'body', tag: TAG.cowl };
  const hw = halfWidth(cz);
  const flying = ax > hw + 0.06;
  if (cz < TAIL_CUT) return { seg: 'tail', tag: ax > hw + 0.1 && cy < 0.2 ? TAG.wing : TAG.skin };
  // The wing proper starts outboard of her root fillets: those are part of
  // her fuselage, and a wing shot off at the root leaves them behind.
  if (ax > hw + 0.3 && cy < 0.45) {
    const side = cx > 0 ? 'R' : 'L';
    return { seg: (ax > CLIP ? 'wingOut' : 'wingIn') + side, tag: TAG.wing };
  }
  return { seg: 'body', tag: TAG.skin };
}

// ---- tag every triangle -------------------------------------------------
const triSeg = [];
const triTag = new Uint8Array(T0.length / 3);
for (let t = 0; t < T0.length; t += 3) {
  const a = T0[t], b = T0[t + 1], c = T0[t + 2];
  const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3;
  const cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
  const cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
  const k = classify(cx, cy, cz);
  triSeg.push(k.seg);
  triTag[t / 3] = k.tag;
}

// The legs, now that we know which triangles they are: the top of each strut
// is its hinge, the lowest of it is the tyre, and the plate standing outboard
// of the tyre is the door.
for (const side of ['L', 'R']) {
  const seg = 'gear' + side;
  let top = -Infinity, hinge = [0, 0, 0], hn = 0, bot = Infinity;
  const pts = [];
  for (let t = 0; t < triSeg.length; t++) {
    if (triSeg[t] !== seg) continue;
    for (let k = 0; k < 3; k++) {
      const v = T0[t * 3 + k];
      pts.push(v);
      top = Math.max(top, P[v * 3 + 1]);
      bot = Math.min(bot, P[v * 3 + 1]);
    }
  }
  for (const v of pts) {
    if (P[v * 3 + 1] > top - 0.08) {
      hinge[0] += P[v * 3]; hinge[1] += P[v * 3 + 1]; hinge[2] += P[v * 3 + 2]; hn++;
    }
  }
  hinge = hinge.map((h) => h / Math.max(1, hn));
  // The wheel: the bottom of the leg, and its hub a tyre's radius above.
  let wc = [0, 0, 0], wn = 0;
  for (const v of pts) {
    if (P[v * 3 + 1] < bot + 0.5) { wc[0] += P[v * 3]; wc[1] += P[v * 3 + 1]; wc[2] += P[v * 3 + 2]; wn++; }
  }
  wc = wc.map((h) => h / Math.max(1, wn));
  wc[1] = bot + 0.30;
  legs[side] = { hinge, wheel: wc, bot };
  for (let t = 0; t < triSeg.length; t++) {
    if (triSeg[t] !== seg) continue;
    const a = T0[t * 3], b = T0[t * 3 + 1], c = T0[t * 3 + 2];
    const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3;
    const cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
    const cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
    const out = (cx - wc[0]) * Math.sign(wc[0]);
    const dr = Math.hypot(cy - wc[1], cz - wc[2]);
    if (out > 0.07 && cy > bot + 0.12) triTag[t] = TAG.door;
    else if (dr > 0.17 && dr < 0.36 && Math.abs(out) < 0.11) triTag[t] = TAG.tyre;
  }
}
// The tail wheel's hinge: the top of its strut.
let tailHinge = [0, -1.13, -4.4];
{
  let top = -Infinity, sum = [0, 0, 0], n = 0;
  const pts = [];
  for (let t = 0; t < triSeg.length; t++) {
    if (triSeg[t] !== 'gearT') continue;
    for (let k = 0; k < 3; k++) { const v = T0[t * 3 + k]; pts.push(v); top = Math.max(top, P[v * 3 + 1]); }
  }
  let bot = Infinity;
  for (const v of pts) bot = Math.min(bot, P[v * 3 + 1]);
  for (const v of pts) if (P[v * 3 + 1] > top - 0.06) { sum[0] += P[v * 3]; sum[1] += P[v * 3 + 1]; sum[2] += P[v * 3 + 2]; n++; }
  if (n) tailHinge = sum.map((s) => s / n);
  for (let t = 0; t < triSeg.length; t++) {
    if (triSeg[t] !== 'gearT') continue;
    const a = T0[t * 3];
    if (P[a * 3 + 1] < bot + 0.2) triTag[t] = TAG.tyre;
  }
}

// The muzzles: the tip of each 20 mm barrel standing out of her leading edge,
// and the two 7.7 mm in the top of her cowling firing through the airscrew.
const cannon = { L: null, R: null };
for (let i = 0; i < nv0; i++) {
  const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
  const ax = Math.abs(x);
  if (ax < 1.4 || ax > 2.4 || y < -0.75 || y > 0.2 || z < 2.9) continue;
  const s = x > 0 ? 'R' : 'L';
  if (!cannon[s] || z > cannon[s][2]) cannon[s] = [x, y, z];
}

// The barrels are one each side and the same each side: the one that stands
// furthest out of its leading edge is the one read, mirrored to the other.
{
  const best = !cannon.R || (cannon.L && cannon.L[2] > cannon.R[2]) ? cannon.L : cannon.R;
  if (best) { cannon.L = [-Math.abs(best[0]), best[1], best[2]]; cannon.R = [Math.abs(best[0]), best[1], best[2]]; }
}

// ---- seal the cockpit ---------------------------------------------------
// The greenhouse is glazed over: a skin laid just inside the envelope of her
// canopy bars, so the bars stand on the glass the way they did on her and the
// seat and the pilot's head are behind something rather than open to the sky.
const CY = 0.48;                       // the sill, about which the envelope is read
const Z0 = 0.30, Z1 = 2.32;
const NZ = 26, NA = 19;
const env = [];
for (let iz = 0; iz < NZ; iz++) {
  const z = Z0 + (Z1 - Z0) * iz / (NZ - 1);
  const row = [];
  for (let ia = 0; ia < NA; ia++) row.push(0.2);
  env.push(row);
  for (let i = 0; i < nv0; i++) {
    const vz = P[i * 3 + 2];
    if (Math.abs(vz - z) > 0.16) continue;
    const x = P[i * 3], y = P[i * 3 + 1] - CY;
    if (y < -0.02 || Math.abs(x) > 0.7) continue;
    const r = Math.hypot(x, y);
    const a = Math.atan2(x, y);           // 0 straight up, +-pi/2 at the sills
    const ia = Math.round((a / Math.PI + 0.5) * (NA - 1));
    if (ia < 0 || ia >= NA) continue;
    for (let d = -1; d <= 1; d++) {
      const j = ia + d;
      if (j >= 0 && j < NA) row[j] = Math.max(row[j], Math.min(0.6, r));
    }
  }
}
// Smoothed along her and across, so the glazing is a fair curve rather than
// the shape of whichever bar happened to be nearest.
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

// ---- weld the glazing on and decimate -----------------------------------
// Positions and normals of everything, the glazing appended.
const PP = Array.from(P);
const NN = Array.from(N);
const TT = Array.from(T0);
const tags = Array.from(triTag);
const segs = triSeg.slice();
{
  const base = PP.length / 3;
  for (let iz = 0; iz < NZ; iz++) {
    const z = Z0 + (Z1 - Z0) * iz / (NZ - 1);
    for (let ia = 0; ia < NA; ia++) {
      const a = (ia / (NA - 1) - 0.5) * Math.PI;
      const r = env[iz][ia] * 0.975;
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

// One vertex per (point, tag, piece), so a paint line or a break is a seam the
// decimator keeps rather than a smear across it.
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
const TARGET = 30000;
const [outIdx, err] = simplify.simplify(Uint32Array.from(split.T), Float32Array.from(split.P), 3,
  TARGET * 3, 0.004, []);
console.log(`decimated ${split.T.length / 3} to ${outIdx.length / 3} triangles, error ${err.toExponential(2)}`);

// Which tag and piece each kept triangle is: off its corners, which all carry
// the same pair because every vertex was split on it.
const vTag = new Int16Array(split.P.length / 3).fill(-1);
const vSeg = new Array(split.P.length / 3);
for (let t = 0; t < split.T.length / 3; t++) {
  for (let k = 0; k < 3; k++) {
    const v = split.T[t * 3 + k];
    vTag[v] = tags[t];
    vSeg[v] = segs[t];
  }
}

// ---- into her own frame -------------------------------------------------
// The A6M5's span, wheels on the deck, and her middle about the origin.
const K = 11.0 / 12.0;
const DY = 1.83 * K;
const DZ = -1.0;
const tx = (v) => [split.P[v * 3] * K, split.P[v * 3 + 1] * K + DY, split.P[v * 3 + 2] * K + DZ];
const tp = (p) => [p[0] * K, p[1] * K + DY, p[2] * K + DZ];

const PIECES = ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR', 'prop',
  'gearL', 'gearR', 'gearT', 'lod'];
const pieces = {};
for (const name of PIECES) pieces[name] = { map: new Map(), P: [], N: [], G: [], T: [] };
// And the whole of her again, much coarser, in one piece: what a machine parked
// on a deck is drawn with, where nothing about her moves or comes off.
const [lodIdx] = simplify.simplify(Uint32Array.from(split.T), Float32Array.from(split.P), 3,
  7000 * 3, 0.02, []);
const all = [];
for (let t = 0; t < outIdx.length; t += 3) all.push([outIdx, t, vSeg[outIdx[t]]]);
for (let t = 0; t < lodIdx.length; t += 3) all.push([lodIdx, t, 'lod']);
for (const [idxs, t, seg] of all) {
  const outIdx = idxs;
  const pc = pieces[seg];
  for (let k = 0; k < 3; k++) {
    const v = outIdx[t + k];
    let n = pc.map.get(v);
    if (n === undefined) {
      n = pc.P.length / 3;
      pc.map.set(v, n);
      pc.P.push(...tx(v));
      pc.N.push(split.N[v * 3], split.N[v * 3 + 1], split.N[v * 3 + 2]);
      pc.G.push(vTag[v]);
    }
    pc.T.push(n);
  }
}

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
  if (name !== 'lod') total += pieces[name].T.length / 3;
  console.log(name, pieces[name].P.length / 3, 'points', pieces[name].T.length / 3, 'triangles');
}
const r3 = (a) => a.map((v) => Math.round(v * 1000) / 1000);
const meta = {
  span: 11.0,
  // Her airscrew turns about this point, about +z.
  prop: r3(tp([0, THRUST_Y, 4.3])),
  propR: Math.round(1.6 * K * 1000) / 1000,
  // Each main leg swings inward about a fore-and-aft hinge at its top; the
  // tail wheel back and up about a thwartships one.
  // A little past square, so the wheel is tucked up into the root of the
  // wing rather than lying under it.
  // `tuck` is how far the leg rises into its well as it comes up.
  gearL: { at: r3(tp(legs.L.hinge)), axis: 'z', up: 1.74, tuck: 0.3 },
  gearR: { at: r3(tp(legs.R.hinge)), axis: 'z', up: -1.74, tuck: 0.3 },
  gearT: { at: r3(tp(tailHinge)), axis: 'x', up: 1.45, tuck: 0.1 },
  // The four guns: the 7.7s in the cowling and the 20 mm in the wings.
  guns: [
    r3(tp([-0.17, THRUST_Y + 0.52, COWL_FRONT - 0.05])),
    r3(tp([0.17, THRUST_Y + 0.52, COWL_FRONT - 0.05])),
    r3(tp(cannon.L || [-1.9, -0.3, 3.4])),
    r3(tp(cannon.R || [1.9, -0.3, 3.4])),
  ],
  // Where each piece breaks off, for the smoke and the flash of it going.
  breaks: {
    tail: r3(tp([0, 0.1, TAIL_CUT])),
    wingInL: r3(tp([-0.9, -0.3, 1.8])),
    wingInR: r3(tp([0.9, -0.3, 1.8])),
    wingOutL: r3(tp([-CLIP, -0.2, 1.9])),
    wingOutR: r3(tp([CLIP, -0.2, 1.9])),
    prop: r3(tp([0, THRUST_Y, 4.3])),
  },
  // Her exhausts, either side of the cowling, for the smoke when she starts.
  exhaust: [r3(tp([-0.66, THRUST_Y - 0.25, 3.25])), r3(tp([0.66, THRUST_Y - 0.25, 3.25]))],
  // The tips, for her vapour trails.
  tips: [r3(tp([-5.95, 0.25, 1.85])), r3(tp([5.95, 0.25, 1.85]))],
};
console.log('total', total, 'triangles', JSON.stringify(meta));

writeFileSync(OUT, `// Generated by build/zero-source.mjs from the owner's A6M Zero.
// Do not hand-edit -- regenerate from assets/models/a6m-zero.glb instead.
export const ZERO_PIECES = ${JSON.stringify(out, null, 0).replace(/","/g, '",\n  "')};
export const ZERO_META = ${JSON.stringify(meta)};
`);
console.log('wrote', OUT);
