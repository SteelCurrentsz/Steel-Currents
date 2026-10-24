// The owner's F6F Hellcat, from the glb it came as to the pieces the game
// flies.
//
//   node build/hellcat-source.mjs    ->  client/js/render/hellcatModel.data.js
//
// Wants the decimator (see build/sculpt-source.mjs):
//
//   npm i --no-save meshoptimizer@0.22
//
// The sculpt is one welded skin of a hundred and eighty thousand triangles
// with no colour in it, caught in flight: her wheels up and the doors shut
// over them, so she came with no undercarriage at all. She is cut into the
// pieces she can lose and the pieces of her that move -- each wing at its
// root and again at the sto-wing's hinge, her tail and her airscrew -- her
// hood is tagged as glass, and her legs are built here: two main legs that
// swing aft into her wings about the hinges a Hellcat's swung on, and the
// tail wheel that comes up into her after fuselage. The paint is laid in the
// shader (see hellcatModel.js).
//
// Her frame is the game's: nose +z, up +y, wheels on y = 0 and the span the
// thirteen point oh six metres an F6F-3 had. The sculpt is level -- her thrust
// line flat -- and that is the frame everything is measured in; she sits
// three-point on the deck nose up by `TILT`, and is turned up afterwards.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, simplifier } from './sculpt-source.mjs';
import { readSculpt, heightsAt, splitBy, kit, pack, r3, V, X, Y, Z } from './plane-sculpt.mjs';

const SRC = path.join(ROOT, 'assets/models/Hellcat.glb');
const OUT = path.join(ROOT, 'client/js/render/hellcatModel.data.js');

const SPAN = 13.06;
const { P, N, T: T0, nv: nv0 } = readSculpt(SRC, SPAN);

// ---- her legs, and the stance they give her -----------------------------
// The main legs come down out of the wing just outboard of the centre
// section, three point three metres apart, and the tail wheel out of the
// bottom of her after fuselage under the fin. Measured in the level frame:
// each leg's hinge, the hub of its wheel and the wheel's size.
const LEG = { x: 1.68, hinge: [1.68, -0.50, 2.02], hub: [1.68, -1.74, 2.18], r: 0.42, w: 0.20 };
const TLEG = { hinge: [0, -0.62, -3.70], hub: [0, -1.00, -3.98], r: 0.17, w: 0.10 };
// The deck is the line through the bottoms of her main wheels and her tail
// wheel.
const MAIN = [LEG.x, LEG.hub[1] - LEG.r, LEG.hub[2]];
const TAILW = [0, TLEG.hub[1] - TLEG.r, TLEG.hub[2]];
const TILT = Math.atan2(TAILW[1] - MAIN[1], MAIN[2] - TAILW[2]);
const CT = Math.cos(TILT), ST = Math.sin(TILT);
const GROUND = MAIN[1] * CT + MAIN[2] * ST;
const DZ = 0;
const F = (p) => [p[0], p[1] * CT + p[2] * ST - GROUND, -p[1] * ST + p[2] * CT + DZ];
const FN = (n) => [n[0], n[1] * CT + n[2] * ST, -n[1] * ST + n[2] * CT];

// ---- what she is made of ------------------------------------------------
export const TAG = {
  skin: 0, cowl: 1, glass: 2, blade: 3, spinner: 4, leg: 5, tyre: 6, metal: 7,
  door: 8, wing: 9, tip: 10,       // tip: the yellow end of a blade
};

const PROP_Z = 4.09;           // the face of her cowling: everything ahead of it turns
const PROP_C = [0, -0.01, 4.30];
const PROP_R = 1.97;
const TAIL_CUT = -2.6;         // where a tail shot off comes away
const FOLD = 2.25;             // the sto-wing's hinge: where her outer panels fold, and come away
const ROOT_X = 0.86;           // where the wing proper starts, outboard of the fillet
// Her hood: windscreen and sliding canopy, above the sill.
const HOOD = { z0: 0.15, z1: 1.66, y: 0.97, x: 0.45 };
// The ring of her cowling, which is painted with her and not as glass or
// engine, and the face of it with the engine behind.
const COWL_Z = 3.95;

function classify(cx, cy, cz) {
  const ax = Math.abs(cx);
  if (cz > PROP_Z) {
    const r = Math.hypot(cx - PROP_C[0], cy - PROP_C[1]);
    return { seg: 'prop', tag: r < 0.15 ? TAG.spinner : r > PROP_R - 0.14 ? TAG.tip : TAG.blade };
  }
  // The engine behind the mouth of the cowling.
  if (cz > COWL_Z && Math.hypot(cx, cy) < 0.5) return { seg: 'body', tag: TAG.cowl };
  if (cz < TAIL_CUT) return { seg: 'tail', tag: ax > 0.3 && cy < 0.45 && cz < -2.8 ? TAG.wing : TAG.skin };
  if (ax < HOOD.x && cz > HOOD.z0 && cz < HOOD.z1 && cy > HOOD.y) return { seg: 'body', tag: TAG.glass };
  if (ax > ROOT_X && cy < 0.45 && cz > -0.4 && cz < 3.0) {
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
// rotation (see META), so a leg swings aft along her and not across her.
const PIECES = ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR', 'prop',
  'gearL', 'gearR', 'gearT', 'lod', 'lodOutL', 'lodOutR', 'lodGear'];
const pieces = {};
for (const name of PIECES) pieces[name] = { map: new Map(), P: [], N: [], G: [], T: [] };
const hingeOf = {
  prop: PROP_C,
  gearL: [-LEG.hinge[0], LEG.hinge[1], LEG.hinge[2]],
  gearR: LEG.hinge,
  gearT: TLEG.hinge,
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

// ---- her undercarriage --------------------------------------------------
const { lathe, slab, rod } = kit(pieces, put);
const under = (x, z) => {
  const hs = heightsAt(P, T0, keepTri, x, z);
  return hs.length ? hs[0] : -0.5;
};

/** A wheel about its hub, its axle along x: the tyre, and the hub in it. */
function wheel(name, hub, r, w) {
  lathe(name, V.add(hub, [-w / 2, 0, 0]), X, [
    [0, r * 0.42], [0, r * 0.80], [w * 0.10, r * 0.95], [w * 0.5, r], [w * 0.90, r * 0.95],
    [w, r * 0.80], [w, r * 0.42],
  ], TAG.tyre, 18);
  lathe(name, V.add(hub, [-w * 0.55, 0, 0]), X, [[0, 0], [0.02, r * 0.45], [w * 1.08, r * 0.45], [w * 1.1, 0]],
    TAG.metal, 14);
}

// Each main leg, written in the level frame where it stands down and locked:
// the oleo from its hinge in the wing down to the wheel, the torque links on
// its forward face, the wheel on the inboard side of it, and the fairing
// door on the outboard face that closes the well behind it.
const legs = {};
for (const [name, s] of [['gearL', -1], ['gearR', 1]]) {
  const top = [s * LEG.hinge[0], LEG.hinge[1], LEG.hinge[2]];
  const hub = [s * LEG.hub[0], LEG.hub[1], LEG.hub[2]];
  const axleTop = V.add(hub, [s * 0.14, 0.05, 0]);
  rod(name, V.add(top, [0, 0.06, 0]), V.add(axleTop, [0, 0.55, 0]), 0.075, TAG.leg, 10);   // the cylinder
  rod(name, V.add(axleTop, [0, 0.58, 0]), axleTop, 0.055, TAG.metal, 10);                 // the piston
  // The fork round the wheel.
  rod(name, axleTop, V.add(hub, [-s * 0.02, 0, 0]), 0.045, TAG.leg, 8);
  // The torque links, a scissors on the front of the oleo.
  rod(name, V.add(axleTop, [0, 0.48, 0.03]), V.add(axleTop, [0, 0.28, 0.17]), 0.022, TAG.metal, 6);
  rod(name, V.add(axleTop, [0, 0.28, 0.17]), V.add(axleTop, [0, 0.06, 0.03]), 0.022, TAG.metal, 6);
  // The drag strut back up into the wing.
  rod(name, V.add(axleTop, [0, 0.70, 0]), V.add(top, [0, 0.0, -0.55]), 0.035, TAG.leg, 8);
  wheel(name, hub, LEG.r, LEG.w);
  // The door on the outboard face of the leg, from the wing down to the axle.
  const dx = s * 0.17;
  slab(name, [(top[0] + axleTop[0]) / 2 + dx, (top[1] + axleTop[1] + 0.2) / 2, top[2] + 0.02],
    [X, Y, Z], [0.012, (top[1] - axleTop[1] - 0.1) / 2, 0.22], TAG.door);
  legs[name] = { top, hub };
}
// The tail wheel: a short leg out of the bottom of her and a solid tyre.
{
  const top = TLEG.hinge, hub = TLEG.hub;
  rod('gearT', V.add(top, [0, 0.05, 0]), V.add(hub, [0, 0.06, 0.02]), 0.05, TAG.leg, 8);
  for (const s of [-1, 1]) rod('gearT', V.add(hub, [s * 0.07, 0.12, 0.04]), V.add(hub, [s * 0.07, 0, 0]), 0.018, TAG.leg, 6);
  wheel('gearT', hub, TLEG.r, TLEG.w);
}
// The coarse model stands on legs too: the same legs, in her own frame.
for (const name of ['gearL', 'gearR', 'gearT']) {
  const pc = pieces[name], lg = pieces.lodGear, base = lg.P.length / 3;
  for (let i = 0; i < pc.P.length; i += 3) {
    lg.P.push(...F(V.add(pc.P.slice(i, i + 3), hingeOf[name])));
    lg.N.push(...FN(pc.N.slice(i, i + 3)));
    lg.G.push(pc.G[i / 3]);
  }
  for (const v of pc.T) lg.T.push(base + v);
}

// ---- check her stance ---------------------------------------------------
{
  let low = Infinity, at = null;
  for (const name of ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR']) {
    const pc = pieces[name];
    for (let i = 0; i < pc.P.length; i += 3) {
      if (pc.P[i + 1] < low) { low = pc.P[i + 1]; at = pc.P.slice(i, i + 3); }
    }
  }
  const lowest = (name) => {
    let lo = Infinity;
    const pc = pieces[name];
    for (let i = 0; i < pc.P.length; i += 3) lo = Math.min(lo, F(V.add(pc.P.slice(i, i + 3), hingeOf[name]))[1]);
    return lo;
  };
  console.log(`tilt ${(TILT * 180 / Math.PI).toFixed(1)} deg, lowest of her airframe ${low.toFixed(3)} at ${at.map((v) => v.toFixed(2))}, `
    + `main wheel ${lowest('gearR').toFixed(3)}, tail wheel ${lowest('gearT').toFixed(3)}, airscrew ${lowest('prop').toFixed(3)}, `
    + `wing under the leg ${under(LEG.x, LEG.hinge[2]).toFixed(3)}`);
  if (low < 0.15) throw new Error('her airframe is on the deck');
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
// The sto-wing's hinge: just behind the leading edge of the joint, on its top
// surface, so a panel stood on its leading edge does not reach the deck.
const FOLD_Z = 1.95;
const foldTop = (x) => {
  const hs = heightsAt(P, T0, keepTri, x, FOLD_Z);
  return hs.length ? hs[hs.length - 1] : -0.1;
};
const meta = {
  span: SPAN,
  // How far she is turned nose-up from the level she was measured in, and
  // where that level frame's origin is in hers: the shader paints in the
  // level frame, so a paint line drawn along her is straight along her.
  tilt: TILT, ground: GROUND, dz: DZ,
  cy: Math.round(F([0, 0.1, 0])[1] * 100) / 100,
  prop: tp(PROP_C),
  propR: PROP_R,
  // Each main leg swings straight aft about its hinge, ninety degrees, and
  // comes up into the wing; the tail wheel aft and up into her.
  gearL: { at: tp(hingeOf.gearL), axis: 'x', up: 1.57, tuck: 0.18 },
  gearR: { at: tp(hingeOf.gearR), axis: 'x', up: 1.57, tuck: 0.18 },
  gearT: { at: tp(hingeOf.gearT), axis: 'x', up: 1.45, tuck: 0.12 },
  // Six fifties, three in each outer panel just outboard of the fold.
  guns: [-3.30, -2.95, -2.60, 2.60, 2.95, 3.30].map((x) => tp([x, under(x, 2.0) + 0.12, 2.46 - (Math.abs(x) - 2.25) * 0.16])),
  // The panels turn on their leading edge until it is down, and swing aft
  // to lie along her sides: the Grumman sto-wing.
  foldL: { at: tp([-FOLD, foldTop(-FOLD), FOLD_Z]) },
  foldR: { at: tp([FOLD, foldTop(FOLD), FOLD_Z]) },
  breaks: {
    tail: tp([0, 0.2, TAIL_CUT]),
    wingInL: tp([-ROOT_X, -0.3, 1.2]),
    wingInR: tp([ROOT_X, -0.3, 1.2]),
    wingOutL: tp([-FOLD, -0.3, 1.2]),
    wingOutR: tp([FOLD, -0.3, 1.2]),
    prop: tp(PROP_C),
  },
  exhaust: [tp([-0.62, -0.25, 3.3]), tp([0.62, -0.25, 3.3])],
  tips: [tp([-6.5, 0.25, 1.4]), tp([6.5, 0.25, 1.4])],
};
console.log('total', total, 'triangles', JSON.stringify(meta));

writeFileSync(OUT, `// Generated by build/hellcat-source.mjs from the owner's F6F Hellcat.
// Do not hand-edit -- regenerate from assets/models/Hellcat.glb instead.
export const HELLCAT_PIECES = ${JSON.stringify(out, null, 0).replace(/","/g, '",\n  "')};
export const HELLCAT_META = ${JSON.stringify(meta)};
`);
console.log('wrote', OUT);
