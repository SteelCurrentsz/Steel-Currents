// The owner's Bf 109T, from the glb it came as to the pieces the game flies.
//
//   node build/bf109-source.mjs    ->  client/js/render/bf109Model.data.js
//
// Wants the decimator (see build/sculpt-source.mjs):
//
//   npm i --no-save meshoptimizer@0.22
//
// The sculpt is one welded skin of three hundred thousand triangles with no
// colour in it, sat three-point on her wheels with her hood shut and a pair
// of bombs in a faired rack under her belly. The rack is built into her belly
// -- her skin is open over it -- so it stays, as part of her body; she flies
// as the Graf Zeppelin's fighter and drops nothing. She is cut into the
// pieces she can lose and the pieces of her that move -- each wing at its root
// and again at the fold, her tail, her airscrew and her two main legs on the
// hinges they swing out into her wings about -- and her hood is tagged as
// glass. The paint is laid in the shader (see bf109Model.js).
//
// Her frame is the game's: nose +z, up +y, wheels on y = 0 and the span the
// eleven point oh eight metres a Bf 109T had. The sculpt already sits on her
// wheels, nose up by `TILT`; everything is measured in the level frame -- her
// thrust line flat -- and turned up again afterwards.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, simplifier } from './sculpt-source.mjs';
import { readSculpt, heightsAt, splitBy, pack, r3, V } from './plane-sculpt.mjs';

const SRC = path.join(ROOT, 'assets/models/Bf-109.glb');
const OUT = path.join(ROOT, 'client/js/render/bf109Model.data.js');

const SPAN = 11.08;
const sculpt = readSculpt(SRC, SPAN);
const T0 = sculpt.T, nv0 = sculpt.nv;

// ---- level her ----------------------------------------------------------
// The sculpt stands with the bottoms of her wheels on y = -1.755 and her
// airscrew's disc square to a thrust line TILT nose-up. Level, about her
// wheels: F takes a level point back into her frame, wheels on the deck.
const TILT = 0.28;
const DY = 1.755;
const CT = Math.cos(TILT), ST = Math.sin(TILT);
const GROUND = 0, DZ = 0;
const P = new Float64Array(nv0 * 3);
const N = new Float64Array(nv0 * 3);
for (let i = 0; i < nv0; i++) {
  const y = sculpt.P[i * 3 + 1] + DY, z = sculpt.P[i * 3 + 2];
  P[i * 3] = sculpt.P[i * 3];
  P[i * 3 + 1] = y * CT - z * ST;
  P[i * 3 + 2] = y * ST + z * CT;
  const ny = sculpt.N[i * 3 + 1], nz = sculpt.N[i * 3 + 2];
  N[i * 3] = sculpt.N[i * 3];
  N[i * 3 + 1] = ny * CT - nz * ST;
  N[i * 3 + 2] = ny * ST + nz * CT;
}
const F = (p) => [p[0], p[1] * CT + p[2] * ST - GROUND, -p[1] * ST + p[2] * CT + DZ];
const FN = (n) => [n[0], n[1] * CT + n[2] * ST, -n[1] * ST + n[2] * CT];

// ---- what she is made of ------------------------------------------------
export const TAG = {
  skin: 0, cowl: 1, glass: 2, blade: 3, spinner: 4, leg: 5, tyre: 6, metal: 7,
  door: 8, wing: 9, tip: 10,
};

const PROP_Z = 4.24;           // the back of her spinner
const PROP_C = [0, 0.86, 4.45];
const PROP_R = 1.6;
const TAIL_CUT = -2.6;         // where a tail shot off comes away
const FOLD = 2.4;              // where her outer panels fold, and come away
const ROOT_X = 0.5;            // where the wing proper starts, outboard of the fillet
// Her hood: from the armour behind the pilot's head to the windscreen, above
// the sill.
const HOOD = { z0: 0.1, z1: 1.75, y: 1.62 };

// The line of each main leg, starboard side, read off the sculpt: the top
// of the strut where it goes up into her and the hub of the wheel.
const LEG = { top: [0.48, 0.44, 2.24], hub: [0.80, -0.40, 2.51], reach: 0.42, skin: 0.37 };
function legNear(ax, cy, cz) {
  const a = LEG.top, b = LEG.hub;
  const d = V.sub(b, a), w = V.sub([ax, cy, cz], a);
  const t = Math.max(0, Math.min(1.3, (w[0] * d[0] + w[1] * d[1] + w[2] * d[2]) / (d[0] * d[0] + d[1] * d[1] + d[2] * d[2])));
  const c = V.add(a, V.mul(d, t));
  return Math.hypot(ax - c[0], cy - c[1], cz - c[2]);
}

function classify(cx, cy, cz) {
  const ax = Math.abs(cx);
  if (cz > PROP_Z) {
    const r = Math.hypot(cx - PROP_C[0], cy - PROP_C[1]);
    return { seg: 'prop', tag: r < 0.31 ? TAG.spinner : TAG.blade };
  }
  // Her main legs, under the roots of her wings: whatever is near the line
  // of each strut, from its top down to the axle, and below her skin.
  if (cy < LEG.skin && legNear(ax, cy, cz) < LEG.reach) {
    return { seg: cx > 0 ? 'gearR' : 'gearL', tag: TAG.leg };
  }
  if (cz < TAIL_CUT) {
    // The tail wheel, which a 109 of her vintage did not raise.
    if (ax < 0.12 && cy < 1.12 && cz > -3.45 && cz < -2.95) return { seg: 'tail', tag: TAG.tyre };
    return { seg: 'tail', tag: ax > 0.25 && cy > 1.2 && cy < 1.75 && cz < -3.0 ? TAG.wing : TAG.skin };
  }
  if (ax < 0.42 && cz > HOOD.z0 && cz < HOOD.z1 && cy > HOOD.y) return { seg: 'body', tag: TAG.glass };
  if (ax > ROOT_X && (cy < 1.0 || ax > 1.0) && cz > -0.2 && cz < 3.2) {
    const side = cx > 0 ? 'R' : 'L';
    return { seg: (ax > FOLD ? 'wingOut' : 'wingIn') + side, tag: TAG.wing };
  }
  return { seg: 'body', tag: TAG.skin };
}

// ---- tag every triangle -------------------------------------------------
const TT = [];
const tags = [];
const segs = [];
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
}

// The legs, now that we know which triangles they are: the top of each strut
// is its hinge, the bottom of it the tyre, and the plate standing outboard of
// the strut is its door.
const legs = {};
for (const side of ['L', 'R']) {
  const seg = 'gear' + side;
  let top = -Infinity, bot = Infinity;
  for (let t = 0; t < segs.length; t++) {
    if (segs[t] !== seg) continue;
    for (let k = 0; k < 3; k++) {
      const v = TT[t * 3 + k];
      top = Math.max(top, P[v * 3 + 1]);
      bot = Math.min(bot, P[v * 3 + 1]);
    }
  }
  let sum = [0, 0, 0], n = 0, wc = [0, 0, 0], wn = 0;
  for (let t = 0; t < segs.length; t++) {
    if (segs[t] !== seg) continue;
    for (let k = 0; k < 3; k++) {
      const v = TT[t * 3 + k];
      const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
      if (p[1] > top - 0.1 && Math.abs(p[0]) < 0.6) { sum = V.add(sum, p); n++; }
      if (p[1] < bot + 0.62) { wc = V.add(wc, p); wn++; }
    }
  }
  const hinge = V.mul(sum, 1 / Math.max(1, n));
  wc = V.mul(wc, 1 / Math.max(1, wn));
  legs[side] = { hinge, wheel: wc, bot };
  // The tyre: everything of her leg within a wheel's radius of its hub.
  const hub = [wc[0], bot + 0.32, wc[2]];
  for (let t = 0; t < segs.length; t++) {
    if (segs[t] !== seg) continue;
    const a = TT[t * 3], b = TT[t * 3 + 1], c = TT[t * 3 + 2];
    const cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
    const cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
    if (Math.hypot(cy - hub[1], cz - hub[2]) < 0.36 && cy < hub[1] + 0.34) tags[t] = TAG.tyre;
  }
  console.log(side, 'leg hinge', r3(hinge), 'wheel', r3(wc), 'bottom', bot.toFixed(3));
}

// ---- decimate -----------------------------------------------------------
const split = splitBy(Array.from(P), Array.from(N), TT, (t) => tags[t] + segs[t]);
const simplify = await simplifier();
const [outIdx, err] = simplify.simplify(Uint32Array.from(split.T), Float32Array.from(split.P), 3,
  30000 * 3, 0.004, []);
console.log(`decimated ${split.T.length / 3} to ${outIdx.length / 3} triangles, error ${err.toExponential(2)}`);
const [lodIdx] = simplify.simplify(Uint32Array.from(split.T), Float32Array.from(split.P), 3,
  7000 * 3, 0.02, []);
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
// The airframe's pieces are written in her own frame; her airscrew and her
// legs about their hinges in the level frame, turned up with her by their own
// rotation (see META), so a leg swings out along her wing and not across it.
const PIECES = ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR', 'prop',
  'gearL', 'gearR', 'lod', 'lodOutL', 'lodOutR'];
const pieces = {};
for (const name of PIECES) pieces[name] = { map: new Map(), P: [], N: [], G: [], T: [] };
const hingeOf = { prop: PROP_C, gearL: legs.L.hinge, gearR: legs.R.hinge };
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

// ---- check her stance ---------------------------------------------------
{
  let low = Infinity, at = null;
  for (const name of ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR']) {
    const pc = pieces[name];
    for (let i = 0; i < pc.P.length; i += 3) {
      if (pc.G[i / 3] === TAG.tyre) continue;
      if (pc.P[i + 1] < low) { low = pc.P[i + 1]; at = pc.P.slice(i, i + 3); }
    }
  }
  let wheel = Infinity, blade = Infinity;
  for (let i = 0; i < pieces.gearR.P.length; i += 3) wheel = Math.min(wheel, F(V.add(pieces.gearR.P.slice(i, i + 3), hingeOf.gearR))[1]);
  for (let i = 0; i < pieces.prop.P.length; i += 3) blade = Math.min(blade, F(V.add(pieces.prop.P.slice(i, i + 3), PROP_C))[1]);
  console.log(`lowest of her airframe ${low.toFixed(3)} at ${at.map((v) => v.toFixed(2))}, wheel ${wheel.toFixed(3)}, airscrew ${blade.toFixed(3)}`);
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
const foldTop = (x) => {
  const hs = heightsAt(P, T0, keepTri, x, 1.4);
  return hs.length ? hs[hs.length - 1] : 0.75;
};
const meta = {
  span: SPAN,
  tilt: TILT, ground: GROUND, dz: DZ,
  cy: Math.round(F([0, 1.2, 0])[1] * 100) / 100,
  prop: tp(PROP_C),
  propR: PROP_R,
  // Each main leg swings outward and up about a fore-and-aft hinge at its
  // top, into the well under her wing: the narrow track every 109 pilot
  // cursed was the price of legs that hung off her fuselage.
  gearL: { at: tp(legs.L.hinge), axis: 'z', up: -1.32, tuck: 0.05 },
  gearR: { at: tp(legs.R.hinge), axis: 'z', up: 1.32, tuck: 0.05 },
  // Two MG 17 over the engine and an MG FF in each wing.
  guns: [
    tp([-0.13, 1.45, 3.95]), tp([0.13, 1.45, 3.95]),
    tp([-2.6, 0.75, 2.88]), tp([2.6, 0.75, 2.88]),
  ],
  // Her outer panels fold up about a hinge along the top of the joint, fore
  // and aft in the level frame.
  foldL: { at: tp([-FOLD, foldTop(-FOLD), 1.4]) },
  foldR: { at: tp([FOLD, foldTop(FOLD), 1.4]) },
  breaks: {
    tail: tp([0, 1.3, TAIL_CUT]),
    wingInL: tp([-ROOT_X, 0.6, 1.5]),
    wingInR: tp([ROOT_X, 0.6, 1.5]),
    wingOutL: tp([-FOLD, 0.7, 1.4]),
    wingOutR: tp([FOLD, 0.7, 1.4]),
    prop: tp(PROP_C),
  },
  exhaust: [tp([-0.5, 0.92, 3.1]), tp([0.5, 0.92, 3.1])],
  tips: [tp([-5.5, 0.95, 1.6]), tp([5.5, 0.95, 1.6])],
};
console.log('total', total, 'triangles', JSON.stringify(meta));

writeFileSync(OUT, `// Generated by build/bf109-source.mjs from the owner's Bf 109T.
// Do not hand-edit -- regenerate from assets/models/Bf-109.glb instead.
export const BF109_PIECES = ${JSON.stringify(out, null, 0).replace(/","/g, '",\n  "')};
export const BF109_META = ${JSON.stringify(meta)};
`);
console.log('wrote', OUT);
