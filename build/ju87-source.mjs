// The owner's carrier Stuka, from the glb it came as to the pieces the game
// flies -- both of them: the Ju 87C dive bomber and the Ju 87D torpedo
// bomber are the one sculpt, and differ only in what hangs under it.
//
//   node build/ju87-source.mjs    ->  client/js/render/ju87Model.data.js
//
// Wants the decimator (see build/sculpt-source.mjs):
//
//   npm i --no-save meshoptimizer@0.22
//
// The sculpt is one welded skin of four hundred thousand triangles with no
// colour in it, caught in flight with her trousered legs down (a Stuka's
// never come up), her greenhouse a frame of bars with nothing between them,
// a long store slung on a crutch under her belly and a pair of pods under each
// outer wing. Those stores are cut away, and what each of the two carries is
// built here in their place:
//
//   - the C a bomb bay in her belly between the wing roots, with two doors
//     hinged along their outboard edges and the well behind them, an SC 500
//     hung in it, and an SC 250 on a rack under each outer wing;
//   - the D an aerial torpedo on a crutch under her belly, the bay doors
//     shut over an empty well.
//
// And for both, her glazing and the gunner's twin MG 81Z on a mounting that
// turns. Every triangle is tagged with what it is, and the paint is laid in
// the shader (see ju87Model.js).
//
// Her frame is the game's: nose +z, up +y, wheels on y = 0 and the span the
// thirteen point eight metres a Ju 87C had. She sits three-point on the deck,
// nose up by `TILT`, so everything measured off the sculpt -- which is level,
// in flight -- is measured level and turned up afterwards.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, simplifier } from './sculpt-source.mjs';
import { readSculpt, heightsAt, glaze, splitBy, kit, pack, r3, V, X, Y, Z } from './plane-sculpt.mjs';

const SRC = path.join(ROOT, 'assets/models/NavalStuka.glb');
const OUT = path.join(ROOT, 'client/js/render/ju87Model.data.js');

const SPAN = 13.8;
const { P, N, T: T0, nv: nv0 } = readSculpt(SRC, SPAN);

// ---- level to her own frame ---------------------------------------------
// The bottoms of her main wheels and her tail wheel, in the level frame,
// read off the sculpt: the deck is the line through them.
const MAIN = [1.54, -2.197, 2.80];
const TAILW = [0, -0.761, -4.84];
const TILT = Math.atan2(TAILW[1] - MAIN[1], MAIN[2] - TAILW[2]);
const CT = Math.cos(TILT), ST = Math.sin(TILT);
const GROUND = MAIN[1] * CT + MAIN[2] * ST;
const DZ = 0;
const F = (p) => [p[0], p[1] * CT + p[2] * ST - GROUND, -p[1] * ST + p[2] * CT + DZ];
const FN = (n) => [n[0], n[1] * CT + n[2] * ST, -n[1] * ST + n[2] * CT];

// ---- what she is made of ------------------------------------------------
export const TAG = {
  skin: 0, cowl: 1, glass: 2, blade: 3, spinner: 4, leg: 5, tyre: 6, metal: 7,
  door: 8, wing: 9, tip: 10, cave: 11, bomb: 12, band: 13, fish: 14, head: 15,
};

const PROP_Z = 5.08;           // the back of her spinner
const PROP_C = [0, 0.07, 5.17];
const PROP_R = 1.64;
const TAIL_CUT = -3.4;         // where a tail shot off comes away
const FOLD = 1.95;             // the knee of her wing: where the outer panels fold, and come away
const ROOT_X = 0.62;           // where the wing proper starts, outboard of the fillet
// The bay: the two halves of her keel between the wing roots, the doors
// hinged along their outboard edges.
const BAY = { x: 0.30, y: -0.36, z0: 0.05, z1: 2.30, hy: -0.39, roof: 0.06 };
// The SC 500 in it, and the SC 250 under each outer wing.
const SC500 = { len: 2.0, r: 0.235, at: [0, -0.215, 1.18] };
const SC250 = { len: 1.64, r: 0.184, x: 3.35, z: 1.35 };
// The D's aerial torpedo, an LT F5b, on its crutch under her keel.
const FISH = { len: 4.9, r: 0.225, y: -0.80, z: 0.48 };
// The gunner's pivot, at the after end of her greenhouse.
const GUN_AT = [0, 0.86, -0.10];

function classify(cx, cy, cz, ny) {
  const ax = Math.abs(cx);
  // The sculpt's own belly store and the crutch it hangs on.
  if (ax < 0.34 && cz > -0.8 && cz < 2.95 && cy < (cz < 0 ? -0.52 : ax < 0.12 ? -0.585 : -0.6)) return null;
  // And the pods under her outer wings.
  if (ax > 3.85 && ax < 4.85 && cz > 0.0 && cz < 2.75 && cy < -0.27) return null;
  if (cz > PROP_Z) {
    const r = Math.hypot(cx - PROP_C[0], cy - PROP_C[1]);
    return { seg: 'prop', tag: r < 0.36 ? TAG.spinner : TAG.blade };
  }
  if (ax < BAY.x && cy < BAY.y && cz > BAY.z0 && cz < BAY.z1 && ny < 0.2) {
    return { seg: cx < 0 ? 'bayPort' : 'bayStbd', tag: TAG.door };
  }
  if (cz < TAIL_CUT) return { seg: 'tail', tag: ax > 0.3 && cy < 0.6 && cz < -4.3 ? TAG.wing : TAG.skin };
  // Her exhaust stubs.
  if (ax > 0.47 && cz > 3.35 && cz < 4.55 && cy > -0.32 && cy < 0.1 && ax < 0.62) return { seg: 'body', tag: TAG.metal };
  // Her legs, trousers and spats, which stand on the inner panels; the tyre
  // showing out of the bottom of the spat.
  if (ax > 1.2 && ax < 1.95 && cy < -0.5 && cz > 1.3 && cz < 3.4) {
    return { seg: cx > 0 ? 'wingInR' : 'wingInL', tag: cy < -1.98 ? TAG.tyre : TAG.leg };
  }
  if (ax > ROOT_X && (cy < 0.12 || ax > 1.2) && cz > -1.2 && cz < (ax > 2.2 ? 4.2 : 3.4)) {
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
  const ny = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1];
  const k = classify(cx, cy, cz, ny / 3);
  if (!k) continue;
  keepTri[t / 3] = 1;
  TT.push(a, b, c);
  tags.push(k.tag);
  segs.push(k.seg);
  used[a] = used[b] = used[c] = 1;
}

// ---- seal the greenhouse ------------------------------------------------
const PP = Array.from(P);
const NN = Array.from(N);
glaze({ P, nv: nv0, used, PP, NN, TT, tags, segs, tag: TAG.glass,
  cy: 0.56, z0: -0.30, z1: 2.16, rMax: 0.68, inset: 0.94 });

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
// up with her by the part's own rotation (see META). `bayShut` is both doors
// shut, in her frame, for the D, whose doors never open; `rackL`/`rackR`
// are the C's wing racks and `crutch` the D's torpedo crutch, in her frame.
const PIECES = ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR', 'prop',
  'bayPort', 'bayStbd', 'bayShut', 'store', 'bombL', 'bombR', 'rackL', 'rackR', 'fish', 'crutch',
  'gun', 'lod', 'lodOutL', 'lodOutR'];
const pieces = {};
for (const name of PIECES) pieces[name] = { map: new Map(), P: [], N: [], G: [], T: [] };

const wingUnder = (x, z) => {
  const hs = heightsAt(P, T0, keepTri, x, z);
  return hs.length ? hs[0] : -0.3;
};
const bombAt = (s) => {
  const top = wingUnder(s * SC250.x, SC250.z);
  return [s * SC250.x, top - 0.11 - SC250.r, SC250.z];
};
const hingeOf = {
  prop: PROP_C,
  bayPort: [-BAY.x, BAY.hy, (BAY.z0 + BAY.z1) / 2],
  bayStbd: [BAY.x, BAY.hy, (BAY.z0 + BAY.z1) / 2],
  store: SC500.at,
  bombL: bombAt(-1),
  bombR: bombAt(1),
  fish: [0, FISH.y, FISH.z],
  gun: GUN_AT,
};
const LEVEL_PARTS = new Set(Object.keys(hingeOf));

function put(name, p, n, tag, lod = false) {
  const pc = pieces[name];
  const level = LEVEL_PARTS.has(name) && !lod;
  const at = level ? V.sub(p, hingeOf[name]) : F(p);
  const k = pc.P.length / 3;
  pc.P.push(...at);
  pc.N.push(...(level ? n : FN(n)));
  pc.G.push(tag);
  return k;
}

const lodOf = (seg) => (seg === 'wingOutL' ? 'lodOutL' : seg === 'wingOutR' ? 'lodOutR' : 'lod');
for (const [idxs, coarse] of [[outIdx, false], [lodIdx, true]]) {
  for (let t = 0; t < idxs.length; t += 3) {
    const seg = vSeg[idxs[t]];
    const names = coarse ? [lodOf(seg)] : seg === 'bayPort' || seg === 'bayStbd' ? [seg, 'bayShut'] : [seg];
    for (const name of names) {
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
}

// ---- what the sculpt has not got ----------------------------------------
const { lathe, slab, rod, bomb } = kit(pieces, put);

// The well of the bay: a roof, two walls and two ends, dark, so the doors open
// on the inside of her and not on whatever of her the sculpt has in there.
{
  const yb = BAY.hy - 0.04, yt = BAY.roof, x = BAY.x - 0.02;
  const zc = (BAY.z0 + BAY.z1) / 2, hz = (BAY.z1 - BAY.z0) / 2 - 0.02;
  slab('body', [0, yt, zc], [X, Y, Z], [x, 0.02, hz], TAG.cave);
  for (const s of [-1, 1]) slab('body', [s * x, (yt + yb) / 2, zc], [X, Y, Z], [0.02, (yt - yb) / 2, hz], TAG.cave);
  for (const s of [-1, 1]) slab('body', [0, (yt + yb) / 2, zc + s * hz], [X, Y, Z], [x, (yt - yb) / 2, 0.02], TAG.cave);
  // The frames across the roof of it, and the crutch the bomb hangs in.
  for (let i = 0; i <= 5; i++) {
    slab('body', [0, yt - 0.04, BAY.z0 + 0.12 + (i / 5) * (BAY.z1 - BAY.z0 - 0.24)], [X, Y, Z],
      [x - 0.01, 0.03, 0.03], TAG.metal);
  }
  const top = SC500.at[1] + SC500.r + 0.05;
  slab('body', [0, (yt + top) / 2 - 0.02, SC500.at[2]], [X, Y, Z], [0.05, (yt - top) / 2, 0.55], TAG.metal);
}

// The C's SC 500 in the bay and the SC 250 under each outer wing, each
// written about its own middle, nose +z: the same piece is the bomb on the
// rack, the bomb leaving her and the bomb on its way down.
bomb('store', SC500.at, SC500.len, SC500.r, TAG);
bomb('bombL', hingeOf.bombL, SC250.len, SC250.r, TAG);
bomb('bombR', hingeOf.bombR, SC250.len, SC250.r, TAG);
// Their racks: a faired pylon under the wing, and the sway braces bearing on
// the bomb either side of its lugs.
for (const [name, c] of [['rackL', hingeOf.bombL], ['rackR', hingeOf.bombR]]) {
  const top = wingUnder(c[0], c[2]);
  const bot = c[1] + SC250.r + 0.04;
  slab(name, [c[0], (top + bot) / 2 + 0.01, c[2]], [X, Y, Z], [0.045, (top - bot) / 2 + 0.02, 0.42], TAG.wing);
  for (const dz of [-0.26, 0.26]) {
    for (const s of [-1, 1]) {
      rod(name, [c[0] + s * 0.04, bot + 0.01, c[2] + dz], [c[0] + s * SC250.r * 0.62, c[1] + SC250.r * 0.72, c[2] + dz],
        0.014, TAG.metal, 5);
    }
  }
}

// The D's LT F5b: warhead, air flask, afterbody, its box tail and the two
// screws, about its own middle, nose +z.
{
  const L = FISH.len, R = FISH.r, c = hingeOf.fish;
  const tail = V.add(c, [0, 0, -L / 2]);
  lathe('fish', tail, Z, [
    [0, 0.05], [L * 0.04, R * 0.42], [L * 0.16, R * 0.88], [L * 0.24, R], [L * 0.72, R],
    [L * 0.88, R * 0.97], [L * 0.95, R * 0.78], [L * 0.99, R * 0.36], [L, 0],
  ], TAG.fish, 16, (s) => (s > L * 0.72 ? TAG.head : TAG.fish));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const o = [Math.sin(a), Math.cos(a), 0];
    const sd = [Math.cos(a), -Math.sin(a), 0];
    slab('fish', V.add(tail, [o[0] * R * 0.75, o[1] * R * 0.75, L * 0.05]), [sd, o, Z], [0.008, R * 0.55, L * 0.05], TAG.fish);
  }
  // The wooden box tail a German air-dropped torpedo wore to steady its fall,
  // shed when it hit the water.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const o = [Math.sin(a), Math.cos(a), 0];
    const sd = [Math.cos(a), -Math.sin(a), 0];
    slab('fish', V.add(tail, [o[0] * R * 1.15, o[1] * R * 1.15, L * 0.03]), [o, sd, Z], [0.012, R * 0.82, L * 0.075], TAG.band);
  }
  for (const [dz, r] of [[-0.02, R * 0.62], [0.05, R * 0.55]]) {
    for (let b = 0; b < 2; b++) {
      const a = b * Math.PI / 2 + (dz > 0 ? Math.PI / 4 : 0);
      slab('fish', V.add(tail, [0, 0, dz]), [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], Z],
        [r, 0.03, 0.01], TAG.metal);
    }
  }
  // Its crutch: a beam along her keel and the sway braces down onto it.
  const keel = (z) => {
    const hs = heightsAt(P, T0, keepTri, 0.0, z);
    return hs.length ? hs[0] : -0.5;
  };
  const z0 = c[2] - 0.9, z1 = c[2] + 0.9;
  const top = Math.min(keel(z0), keel(z1)) + 0.02;
  const beam = c[1] + R + 0.05;
  slab('crutch', [0, (top + beam) / 2, c[2]], [X, Y, Z], [0.05, (top - beam) / 2, 0.95], TAG.metal);
  for (const z of [z0 + 0.15, z1 - 0.15]) {
    for (const s of [-1, 1]) rod('crutch', [s * 0.05, beam + 0.02, z], [s * R * 0.7, c[1] + R * 0.7, z], 0.016, TAG.metal, 5);
  }
}

// The gunner's twin MG 81Z on its mounting at the back of the greenhouse,
// written about its pivot and laid fore and aft with the muzzles aft: the
// batch turns it in azimuth about her vertical and in elevation about her beam.
const GUN_MUZZLE = [0, 0.05, -0.98];
{
  const c = GUN_AT;
  const at = (p) => V.add(c, p);
  rod('gun', at([0, -0.22, 0]), at([0, 0.0, 0]), 0.03, TAG.metal, 6);              // the pillar
  slab('gun', at([0, 0.04, 0.06]), [X, Y, Z], [0.075, 0.05, 0.20], TAG.metal);      // the twin receiver
  for (const s of [-1, 1]) {
    rod('gun', at([s * 0.04, 0.05, -0.12]), at([s * 0.04, GUN_MUZZLE[1], GUN_MUZZLE[2]]), 0.011, TAG.metal, 6);
    rod('gun', at([s * 0.04, 0.05, -0.12]), at([s * 0.04, 0.05, -0.42]), 0.021, TAG.metal, 7);
    // The belt boxes either side.
    slab('gun', at([s * 0.13, 0.0, 0.08]), [X, Y, Z], [0.045, 0.08, 0.10], TAG.metal);
  }
  rod('gun', at([0, 0.02, 0.26]), at([0, -0.08, 0.30]), 0.016, TAG.metal, 6);       // the grips
  // The armoured shield it fires through.
  slab('gun', at([0, 0.06, -0.24]), [X, Y, Z], [0.20, 0.17, 0.008], TAG.metal);
}

// ---- check her stance ---------------------------------------------------
{
  let low = Infinity, at = null;
  for (const name of ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR']) {
    const pc = pieces[name];
    for (let i = 0; i < pc.P.length; i += 3) {
      if (pc.G[i / 3] === TAG.tyre || pc.G[i / 3] === TAG.leg) continue;
      if (pc.P[i + 1] < low) { low = pc.P[i + 1]; at = pc.P.slice(i, i + 3); }
    }
  }
  const lowest = (name) => {
    let lo = Infinity;
    const pc = pieces[name];
    for (let i = 0; i < pc.P.length; i += 3) lo = Math.min(lo, F(V.add(pc.P.slice(i, i + 3), hingeOf[name]))[1]);
    return lo;
  };
  console.log(`lowest of her airframe ${low.toFixed(3)} at ${at.map((v) => v.toFixed(2))}, fish ${lowest('fish').toFixed(3)}, `
    + `bomb ${lowest('store').toFixed(3)}, wing bombs ${lowest('bombL').toFixed(3)}, airscrew ${lowest('prop').toFixed(3)}`);
  if (lowest('fish') < 0.08) throw new Error('she is standing on her fish');
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
// Where each outer panel folds: along the top of her wing at the knee, fore and
// aft in the level frame, at its trailing edge, so the panel swings back along
// her side.
const kneeTop = (x) => {
  const hs = heightsAt(P, T0, keepTri, x, 0.1);
  return hs.length ? hs[hs.length - 1] : -0.2;
};
const meta = {
  span: SPAN,
  // How far she is turned nose-up from the level she was measured in, and
  // where that level frame's origin is in hers: the shader paints in the
  // level frame, so a paint line drawn along her is straight along her.
  tilt: TILT, ground: GROUND, dz: DZ,
  // The middle of her airframe, up from her wheels: what a hole is aimed at.
  cy: Math.round(F([0, 0.1, 0])[1] * 100) / 100,
  prop: tp(PROP_C),
  propR: PROP_R,
  // The bomb doors, hinged along their outboard edges, port opening down to
  // port and starboard to starboard.
  bayPort: { at: tp(hingeOf.bayPort), axis: 'z', open: -1.45 },
  bayStbd: { at: tp(hingeOf.bayStbd), axis: 'z', open: 1.45 },
  // The weapons, each about its own middle.
  store: { at: tp(hingeOf.store), len: SC500.len, r: SC500.r },
  bombL: { at: tp(hingeOf.bombL), len: SC250.len, r: SC250.r },
  bombR: { at: tp(hingeOf.bombR), len: SC250.len, r: SC250.r },
  fish: { at: tp(hingeOf.fish), len: FISH.len, r: FISH.r },
  // The gunner's guns, about their pivot, and the muzzles in their own frame.
  gun: { at: tp(GUN_AT), muzzle: GUN_MUZZLE },
  // An MG 17 in each inner panel, just inboard of the knee.
  guns: [tp([-1.80, -0.36, 2.92]), tp([1.80, -0.36, 2.92])],
  // Her outer panels fold back along her sides about the knee, the leading
  // edge turned down, the way a Ju 87C's did.
  foldL: { at: tp([-FOLD, kneeTop(-FOLD), 0.1]) },
  foldR: { at: tp([FOLD, kneeTop(FOLD), 0.1]) },
  breaks: {
    tail: tp([0, 0.3, TAIL_CUT]),
    wingInL: tp([-ROOT_X, -0.4, 1.2]),
    wingInR: tp([ROOT_X, -0.4, 1.2]),
    wingOutL: tp([-FOLD, -0.4, 1.2]),
    wingOutR: tp([FOLD, -0.4, 1.2]),
    prop: tp(PROP_C),
  },
  exhaust: [tp([-0.55, -0.1, 3.9]), tp([0.55, -0.1, 3.9])],
  tips: [tp([-6.85, 0.1, 1.2]), tp([6.85, 0.1, 1.2])],
};
console.log('total', total, 'triangles', JSON.stringify(meta));

writeFileSync(OUT, `// Generated by build/ju87-source.mjs from the owner's carrier Stuka.
// Do not hand-edit -- regenerate from assets/models/NavalStuka.glb instead.
export const JU87_PIECES = ${JSON.stringify(out, null, 0).replace(/","/g, '",\n  "')};
export const JU87_META = ${JSON.stringify(meta)};
`);
console.log('wrote', OUT);
