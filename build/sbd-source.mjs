// The owner's SBD Dauntless, from the glb it came as to the pieces the game
// flies.
//
//   node build/sbd-source.mjs    ->  client/js/render/dauntlessModel.data.js
//
// Wants the decimator (see build/sculpt-source.mjs):
//
//   npm i --no-save meshoptimizer@0.22
//
// The sculpt is one welded skin of six hundred thousand triangles with no
// colour in it, caught in flight with her legs down, her greenhouse a frame
// of bars with nothing between them and the gunner's twin thirties stowed
// fore and aft in the fairing behind him. She came with nothing under her.
// She is cut into the pieces she can lose and the pieces of her that move --
// each wing at its root and again outboard of her legs, her tail, her
// airscrew, her two main legs on the hinges they swing in towards each other
// about, and the gunner's guns, which turn on their mounting -- her
// greenhouse is glazed, and what she carries is built here:
//
//   - the displacing trapeze under her belly, the yoke that swings her bomb
//     down and forward clear of her airscrew before it lets go, and the
//     thousand-pounder on it;
//   - a hundred-pounder on a rack under each outer wing, which go with it.
//
// Every triangle is tagged with what it is, and the paint is laid in the
// shader (see dauntlessModel.js).
//
// Her frame is the game's: nose +z, up +y, wheels on y = 0 and the span the
// twelve point six six metres an SBD had. The sculpt is level -- her thrust
// line flat -- and she sits three-point on the deck nose up by `TILT`, so
// everything is measured level and turned up afterwards.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, simplifier } from './sculpt-source.mjs';
import { readSculpt, heightsAt, glaze, splitBy, kit, pack, r3, V, X, Y, Z } from './plane-sculpt.mjs';

const SRC = path.join(ROOT, 'assets/models/Dauntless.glb');
const OUT = path.join(ROOT, 'client/js/render/dauntlessModel.data.js');

const SPAN = 12.66;
const { P, N, T: T0, nv: nv0 } = readSculpt(SRC, SPAN);

// ---- level to her own frame ---------------------------------------------
// The bottoms of her main wheels and her tail wheel, in the level frame,
// read off the sculpt: the deck is the line through them.
const MAIN = [1.66, -1.95, 2.28];
const TAILW = [0, -0.58, -3.66];
const TILT = Math.atan2(TAILW[1] - MAIN[1], MAIN[2] - TAILW[2]);
const CT = Math.cos(TILT), ST = Math.sin(TILT);
const GROUND = MAIN[1] * CT + MAIN[2] * ST;
const DZ = 0;
const F = (p) => [p[0], p[1] * CT + p[2] * ST - GROUND, -p[1] * ST + p[2] * CT + DZ];
const FN = (n) => [n[0], n[1] * CT + n[2] * ST, -n[1] * ST + n[2] * CT];

// ---- what she is made of ------------------------------------------------
export const TAG = {
  skin: 0, cowl: 1, glass: 2, blade: 3, spinner: 4, leg: 5, tyre: 6, metal: 7,
  cave: 8, wing: 9, tip: 10, bomb: 11, band: 12,
};

const PROP_Z = 4.16;           // the face of her cowling: everything ahead of it turns
const PROP_C = [0, 0, 4.25];
const PROP_R = 1.66;
const TAIL_CUT = -2.6;         // where a tail shot off comes away
const OUTER = 2.3;             // where an outer panel comes away, outboard of her legs
const ROOT_X = 0.78;           // where the wing proper starts, outboard of the fillet
// Each main leg: the hub of its wheel and the top of the leg, where it goes
// up into the wing and turns on its fore-and-aft hinge.
const LEG = { x: 1.66, hub: [1.66, -1.60, 2.28], r: 0.35, top: -0.80, z: 2.15 };
// The gunner's twin thirties, stowed in the fairing behind him, and the
// pivot they swing on.
const GUN = { x: 0.2, y: 0.66, z0: -1.12, z1: 0.16, at: [0, 0.66, 0.0] };
// The trapeze: its pivot under her belly between the wing roots, and the
// thousand-pounder on it.
const PIV_Z = 1.15;
const BOMB = { len: 1.85, r: 0.24, dz: 0.05 };
// The hundred-pounders under her outer panels.
const WBOMB = { len: 1.02, r: 0.105, x: 3.3, z: 1.25 };

function classify(cx, cy, cz) {
  const ax = Math.abs(cx);
  if (cz > PROP_Z) {
    const r = Math.hypot(cx - PROP_C[0], cy - PROP_C[1]);
    return { seg: 'prop', tag: r < 0.2 ? TAG.spinner : r > PROP_R - 0.14 ? TAG.tip : TAG.blade };
  }
  if (cz > 3.9 && Math.hypot(cx, cy) < 0.45) return { seg: 'body', tag: TAG.cowl };
  // The gunner's guns, stowed along her spine.
  if (ax < GUN.x && cy > GUN.y && cz > GUN.z0 && cz < GUN.z1) return { seg: 'gun', tag: TAG.metal };
  // Her main legs and wheels, under the wing.
  if (ax > 1.2 && ax < 2.15 && cy < LEG.top - 0.03 && cz > 1.4 && cz < 2.9) {
    const tyre = Math.hypot(cy - LEG.hub[1], cz - LEG.hub[2]) < LEG.r + 0.02 && cy < -1.22;
    return { seg: cx > 0 ? 'gearR' : 'gearL', tag: tyre ? TAG.tyre : TAG.leg };
  }
  if (cz < TAIL_CUT) {
    // The tail wheel, which an SBD did not raise.
    if (ax < 0.14 && cy < -0.25 && cz > -3.85 && cz < -3.2) return { seg: 'tail', tag: cy < -0.4 ? TAG.tyre : TAG.leg };
    return { seg: 'tail', tag: ax > 0.3 && cy < 0.35 && cz < -3.0 ? TAG.wing : TAG.skin };
  }
  if (ax > ROOT_X && cy < 0.2 && cz > -1.0 && cz < 3.1) {
    const side = cx > 0 ? 'R' : 'L';
    return { seg: (ax > OUTER ? 'wingOut' : 'wingIn') + side, tag: TAG.wing };
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
// Pilot's hood and the gunner's, forward of his guns: the frames came
// without any glass in them.
const PP = Array.from(P);
const NN = Array.from(N);
glaze({ P, nv: nv0, used, PP, NN, TT, tags, segs, tag: TAG.glass,
  cy: 0.48, z0: 0.34, z1: 2.24, rMax: 0.66, inset: 0.95 });

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
// The airframe's pieces are written in her own frame. A moving part is
// written about its hinge in the level frame she was measured in, and turned
// up with her by the part's own rotation (see META). `rackL`/`rackR` are the
// wing bombs' racks, in her frame.
const PIECES = ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR', 'prop',
  'gearL', 'gearR', 'gun', 'trapeze', 'store', 'bombL', 'bombR', 'rackL', 'rackR', 'lugs',
  'lod', 'lodOutL', 'lodOutR'];
const pieces = {};
for (const name of PIECES) pieces[name] = { map: new Map(), P: [], N: [], G: [], T: [] };

const underAt = (x, z) => {
  const hs = heightsAt(P, T0, keepTri, x, z);
  return hs.length ? hs[0] : -0.6;
};
const belly = underAt(0, PIV_Z);
// The yoke's pivot is up inside her, so its arms are long enough to throw the
// bomb down and forward clear of the disc: a pivot on her skin swung it a
// hand's breadth.
const PIV = [0, belly + 0.42, PIV_Z - 0.15];
// Snug up under her, its back in the recess between her wing roots: an SBD
// stood low on her legs, and a thousand-pounder hung clear of her skin is on
// the deck.
const BOMB_C = [0, belly + 0.07 - BOMB.r, PIV_Z + BOMB.dz];
const wbAt = (s) => [s * WBOMB.x, underAt(s * WBOMB.x, WBOMB.z) - 0.1 - WBOMB.r, WBOMB.z];
const hingeOf = {
  prop: PROP_C,
  gearL: [-LEG.x, LEG.top, LEG.z],
  gearR: [LEG.x, LEG.top, LEG.z],
  gun: GUN.at,
  trapeze: PIV,
  store: PIV,
  bombL: wbAt(-1),
  bombR: wbAt(1),
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
const { slab, rod, bomb } = kit(pieces, put);

// The thousand-pounder, about its own middle, nose +z, its bands yellow: the
// same piece is the bomb on the yoke, the bomb leaving her and the bomb on its
// way down.
bomb('store', BOMB_C, BOMB.len, BOMB.r, TAG);
// The yoke: two arms from the pivot down to the lugs either side of the bomb,
// braced across, and the crutch the bomb's back bears on.
{
  const lugY = BOMB_C[1] + BOMB.r * 0.7;
  for (const s of [-1, 1]) {
    rod('trapeze', [s * 0.21, PIV[1], PIV[2] - 0.02], [s * (BOMB.r + 0.03), lugY, BOMB_C[2] + 0.22], 0.03, TAG.metal, 6);
    rod('trapeze', [s * 0.21, PIV[1], PIV[2] - 0.02], [s * (BOMB.r + 0.03), lugY, BOMB_C[2] - 0.22], 0.025, TAG.metal, 6);
  }
  rod('trapeze', [-(BOMB.r + 0.03), lugY, BOMB_C[2]], [BOMB.r + 0.03, lugY, BOMB_C[2]], 0.02, TAG.metal, 6);
  rod('trapeze', [-0.22, PIV[1], PIV[2] - 0.02], [0.22, PIV[1], PIV[2] - 0.02], 0.03, TAG.metal, 6);
  // The slots its arms come out of her belly through, which stay put.
  for (const s of [-1, 1]) slab('lugs', [s * 0.21, belly + 0.01, PIV[2] + 0.1], [X, Y, Z], [0.04, 0.03, 0.22], TAG.cave);
}
// The hundred-pounders and their racks.
bomb('bombL', hingeOf.bombL, WBOMB.len, WBOMB.r, TAG);
bomb('bombR', hingeOf.bombR, WBOMB.len, WBOMB.r, TAG);
for (const [name, c] of [['rackL', hingeOf.bombL], ['rackR', hingeOf.bombR]]) {
  const top = underAt(c[0], c[2]);
  const bot = c[1] + WBOMB.r + 0.03;
  slab(name, [c[0], (top + bot) / 2 + 0.01, c[2]], [X, Y, Z], [0.03, (top - bot) / 2 + 0.02, 0.26], TAG.wing);
  for (const dz of [-0.16, 0.16]) {
    for (const s of [-1, 1]) {
      rod(name, [c[0] + s * 0.03, bot + 0.01, c[2] + dz], [c[0] + s * WBOMB.r * 0.62, c[1] + WBOMB.r * 0.72, c[2] + dz],
        0.01, TAG.metal, 5);
    }
  }
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
    + `bomb ${lowest('store').toFixed(3)}, wing bombs ${lowest('bombL').toFixed(3)}, airscrew ${lowest('prop').toFixed(3)}, wheel ${lowest('gearR').toFixed(3)}`);
  if (lowest('store') < 0.08) throw new Error('she is standing on her bomb');
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
const meta = {
  span: SPAN,
  tilt: TILT, ground: GROUND, dz: DZ,
  cy: Math.round(F([0, 0.0, 0])[1] * 100) / 100,
  prop: tp(PROP_C),
  propR: PROP_R,
  // Each main leg swings inboard about a fore-and-aft hinge at its top, until
  // its wheel lies flat in the well at her wing root.
  gearL: { at: tp(hingeOf.gearL), axis: 'z', up: 1.57, tuck: 0.12 },
  gearR: { at: tp(hingeOf.gearR), axis: 'z', up: -1.57, tuck: 0.12 },
  // The trapeze and the bomb on it swing down and forward together about the
  // pivot, enough to throw the bomb clear of her airscrew.
  trapeze: { at: tp(PIV), axis: 'x', open: -0.95 },
  store: { at: tp(PIV), axis: 'x', open: -0.95, len: BOMB.len, r: BOMB.r },
  bombL: { at: tp(hingeOf.bombL), len: WBOMB.len, r: WBOMB.r },
  bombR: { at: tp(hingeOf.bombR), len: WBOMB.len, r: WBOMB.r },
  // The gunner's twin thirties, about their pivot, and the muzzles in their
  // own frame, laid aft.
  gun: { at: tp(GUN.at), muzzle: [0, 0.17, -1.08] },
  // Her two fifties in the top of the cowling, firing through the disc.
  guns: [tp([-0.2, 0.62, 3.95]), tp([0.2, 0.62, 3.95])],
  breaks: {
    tail: tp([0, 0.2, TAIL_CUT]),
    wingInL: tp([-ROOT_X, -0.5, 1.2]),
    wingInR: tp([ROOT_X, -0.5, 1.2]),
    wingOutL: tp([-OUTER, -0.5, 1.2]),
    wingOutR: tp([OUTER, -0.5, 1.2]),
    prop: tp(PROP_C),
  },
  exhaust: [tp([-0.62, -0.2, 3.4]), tp([0.62, -0.2, 3.4])],
  tips: [tp([-6.3, 0.0, 1.0]), tp([6.3, 0.0, 1.0])],
};
console.log('total', total, 'triangles', JSON.stringify(meta));

writeFileSync(OUT, `// Generated by build/sbd-source.mjs from the owner's SBD Dauntless.
// Do not hand-edit -- regenerate from assets/models/Dauntless.glb instead.
export const DAUNTLESS_PIECES = ${JSON.stringify(out, null, 0).replace(/","/g, '",\n  "')};
export const DAUNTLESS_META = ${JSON.stringify(meta)};
`);
console.log('wrote', OUT);
