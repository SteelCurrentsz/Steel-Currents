// The owner's TBF Avenger, from the glb it came as to the pieces the game
// flies.
//
//   node build/tbf-source.mjs    ->  client/js/render/avengerModel.data.js
//
// Wants the decimator (see build/sculpt-source.mjs):
//
//   npm i --no-save meshoptimizer@0.22
//
// The sculpt is one welded skin of a hundred and seventy thousand triangles
// with no colour in it, caught in flight: her wheels up and the doors shut
// over them, her bomb bay shut, her hood solid and the ball turret on her
// back with its fifty out of the after side of it. She is cut into the pieces
// she can lose and the pieces of her that move -- each wing at its root and
// again at the sto-wing's hinge, her tail, her airscrew, the bomb doors in her
// belly and the turret -- her hood is tagged as glass, and what the sculpt
// has not got is built here:
//
//   - her legs: two main legs that swing outboard into her wings about the
//     hinges a TBF's swung on, and the tail wheel that comes up into her;
//   - the well of her bomb bay behind the doors, and the Mark 13 in it, with
//     the shroud ring round its tail.
//
// Every triangle is tagged with what it is, and the paint is laid in the
// shader (see avengerModel.js).
//
// Her frame is the game's: nose +z, up +y, wheels on y = 0 and the span the
// sixteen point five one metres a TBF-1 had. The sculpt is level -- her thrust
// line flat -- and that is the frame everything is measured in; she sits
// three-point on the deck nose up by `TILT`, and is turned up afterwards.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, simplifier } from './sculpt-source.mjs';
import { readSculpt, heightsAt, splitBy, kit, pack, r3, V, X, Y, Z } from './plane-sculpt.mjs';

const SRC = path.join(ROOT, 'assets/models/Avenger.glb');
const OUT = path.join(ROOT, 'client/js/render/avengerModel.data.js');

const SPAN = 16.51;
const { P, N, T: T0 } = readSculpt(SRC, SPAN);

// ---- her legs, and the stance they give her -----------------------------
// The main legs come down out of the centre section, a metre and a half
// either side of her keel, and the tail wheel out of the bottom of her after
// fuselage ahead of the tailplane. Measured in the level frame: each leg's
// hinge, the hub of its wheel and the wheel's size.
const LEG = { x: 1.55, hinge: [1.55, -1.0, 2.25], hub: [1.55, -2.45, 2.55], r: 0.44, w: 0.21 };
const TLEG = { hinge: [0, -0.98, -4.50], hub: [0, -1.55, -4.75], r: 0.2, w: 0.12 };
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
  door: 8, wing: 9, tip: 10, cave: 11, fish: 12, head: 13,
};

const PROP_Z = 5.6;            // the face of her cowling: everything ahead of it turns
const PROP_C = [0, -0.88, 5.8];
const PROP_R = 2.05;
const TAIL_CUT = -3.6;         // where a tail shot off comes away, abaft the ventral step
const FOLD = 2.6;              // the sto-wing's hinge: where her outer panels fold, and come away
const ROOT_X = 0.95;           // where the wing proper starts, outboard of her sides
// Her hood: windscreen, the pilot's sliding canopy and the long glazing back
// to the turret, above the sill.
const HOOD = { z0: -0.05, z1: 3.25, y: 0.28, x: 0.6 };
// The ball turret on her back, which turns as one with its fifty: the ball
// above the ring it sits on, and the gun out of the after side of it.
const BALL = { x: 0.56, y: 0.27, z0: -1.18, z1: -0.1, at: [0, 0.27, -0.64] };
const GUNB = { x: 0.06, y: 0.45, z0: -1.4, z1: -0.9 };
// The bay: her belly between the wing roots, the doors hinged along their
// outboard edges and the Mark 13 behind them.
const BAY = { x: 0.42, y: -1.6, z0: -0.4, z1: 3.8, roof: -1.12 };
const FISH = { len: 4.09, r: 0.285, z: 1.7 };

function classify(cx, cy, cz, ny) {
  const ax = Math.abs(cx);
  if (cz > PROP_Z) {
    const r = Math.hypot(cx - PROP_C[0], cy - PROP_C[1]);
    return { seg: 'prop', tag: r < 0.26 ? TAG.spinner : r > PROP_R - 0.16 ? TAG.tip : TAG.blade };
  }
  // The engine behind the mouth of the cowling.
  if (cz > 5.25 && Math.hypot(cx, cy - PROP_C[1]) < 0.62) return { seg: 'body', tag: TAG.cowl };
  if (ax < GUNB.x && cy > GUNB.y && cz > GUNB.z0 && cz < GUNB.z1) return { seg: 'gun', tag: TAG.metal };
  if (ax < BALL.x && cy > BALL.y && cz > BALL.z0 && cz < BALL.z1) return { seg: 'gun', tag: TAG.glass };
  if (ax < BAY.x && cy < BAY.y && cz > BAY.z0 && cz < BAY.z1 && ny < 0.2) {
    return { seg: cx < 0 ? 'bayPort' : 'bayStbd', tag: TAG.door };
  }
  if (cz < TAIL_CUT) return { seg: 'tail', tag: ax > 0.35 && cy > -0.2 && cy < 0.45 && cz < -4.0 ? TAG.wing : TAG.skin };
  if (ax < HOOD.x && cz > HOOD.z0 && cz < HOOD.z1 && cy > HOOD.y) return { seg: 'body', tag: TAG.glass };
  if (ax > ROOT_X && (cy < -0.45 || ax > 1.1) && cz > -0.7 && cz < 3.5) {
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
  const ny = (N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1]) / 3;
  const k = classify(cx, cy, cz, ny);
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
  34000 * 3, 0.004, []);
console.log(`decimated ${split.T.length / 3} to ${outIdx.length / 3} triangles, error ${err.toExponential(2)}`);
const [lodIdx] = simplify.simplify(Uint32Array.from(split.T), Float32Array.from(split.P), 3,
  8000 * 3, 0.02, []);
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
// The airframe's pieces are written in her own frame; a moving part about its
// hinge in the level frame, turned up with her by its own rotation (see
// META), so a leg swings out along her span and not across her. `bayShut` is
// both doors shut, in her frame, for the coarse model and the hangar.
const PIECES = ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR', 'prop',
  'bayPort', 'bayStbd', 'store', 'gun', 'gearL', 'gearR', 'gearT',
  'lod', 'lodOutL', 'lodOutR', 'lodGear'];
const pieces = {};
for (const name of PIECES) pieces[name] = { map: new Map(), P: [], N: [], G: [], T: [] };
const keel = (x, z) => {
  const hs = heightsAt(P, T0, keepTri, x, z);
  return hs.length ? hs[0] : -1.85;
};
const doorY = keel(BAY.x - 0.01, (BAY.z0 + BAY.z1) / 2);
const hingeOf = {
  prop: PROP_C,
  bayPort: [-BAY.x, doorY, (BAY.z0 + BAY.z1) / 2],
  bayStbd: [BAY.x, doorY, (BAY.z0 + BAY.z1) / 2],
  // The fish snug under the roof of the bay, clear of the doors.
  store: [0, BAY.roof - 0.04 - FISH.r, FISH.z],
  gun: BALL.at,
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

// ---- what the sculpt has not got ----------------------------------------
const { lathe, slab, rod } = kit(pieces, put);

// The well of the bay: a roof, two walls and two ends, dark, so the doors open
// on the inside of her and not on whatever of her the sculpt has in there;
// the frames across its roof and the shackle the fish hangs from.
{
  const yb = doorY + 0.03, yt = BAY.roof, x = BAY.x - 0.03;
  const zc = (BAY.z0 + BAY.z1) / 2, hz = (BAY.z1 - BAY.z0) / 2 - 0.03;
  slab('body', [0, yt, zc], [X, Y, Z], [x, 0.02, hz], TAG.cave);
  for (const s of [-1, 1]) slab('body', [s * x, (yt + yb) / 2, zc], [X, Y, Z], [0.02, (yt - yb) / 2, hz], TAG.cave);
  for (const s of [-1, 1]) slab('body', [0, (yt + yb) / 2, zc + s * hz], [X, Y, Z], [x, (yt - yb) / 2, 0.02], TAG.cave);
  for (let i = 0; i <= 6; i++) {
    slab('body', [0, yt - 0.04, BAY.z0 + 0.15 + (i / 6) * (BAY.z1 - BAY.z0 - 0.3)], [X, Y, Z],
      [x - 0.01, 0.03, 0.03], TAG.metal);
  }
  const top = hingeOf.store[1] + FISH.r;
  for (const dz of [-0.75, 0.75]) {
    slab('body', [0, (yt + top) / 2, FISH.z + dz], [X, Y, Z], [0.04, (yt - top) / 2 + 0.01, 0.06], TAG.metal);
  }
}

// The Mark 13: its warhead, air flask and afterbody, the cruciform tail with
// the shroud ring round it and the two screws, about its own middle, nose +z.
// The same piece is the fish in the bay, the fish leaving her and the fish on
// its way down.
{
  const L = FISH.len, R = FISH.r, c = hingeOf.store;
  const tail = V.add(c, [0, 0, -L / 2]);
  lathe('store', tail, Z, [
    [0, 0.05], [L * 0.03, R * 0.40], [L * 0.14, R * 0.86], [L * 0.22, R], [L * 0.78, R],
    [L * 0.92, R * 0.95], [L * 0.97, R * 0.72], [L * 0.995, R * 0.30], [L, 0],
  ], TAG.fish, 16, (s) => (s > L * 0.76 ? TAG.head : TAG.fish));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const o = [Math.sin(a), Math.cos(a), 0];
    const sd = [Math.cos(a), -Math.sin(a), 0];
    slab('store', V.add(tail, [o[0] * R * 0.72, o[1] * R * 0.72, L * 0.045]), [sd, o, Z], [0.008, R * 0.5, L * 0.045], TAG.fish);
  }
  // The shroud ring.
  lathe('store', V.add(tail, [0, 0, L * 0.01]), Z, [[0, R * 1.18], [L * 0.07, R * 1.18], [L * 0.07, R * 1.12], [0, R * 1.12], [0, R * 1.18]],
    TAG.fish, 18);
  for (const [dz, r] of [[-0.02, R * 0.62], [0.05, R * 0.55]]) {
    for (let b = 0; b < 2; b++) {
      const a = b * Math.PI / 2 + (dz > 0 ? Math.PI / 4 : 0);
      slab('store', V.add(tail, [0, 0, dz]), [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], Z],
        [r, 0.03, 0.01], TAG.metal);
    }
  }
}

// The fifty's barrel, out of the stub the sculpt has to its muzzle.
rod('gun', [0, 0.555, -1.32], [0, 0.585, -1.62], 0.022, TAG.metal, 6);

// The floor of the turret's ring: the sculpt has nothing under the ball, so
// a ball trained round would show the inside of her.
lathe('body', [0, BALL.y - 0.02, BALL.at[2]], Y, [[0, 0], [0, BALL.x], [0.02, BALL.x + 0.01], [0.03, 0]], TAG.metal, 24);

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
// the oleo from its hinge in the centre section down to the wheel, raked a
// little forward, the torque links on its front, the wheel on its outboard
// side, the side brace back up into the wing and the fairing door on its
// outboard face.
for (const [name, s] of [['gearL', -1], ['gearR', 1]]) {
  const top = [s * LEG.hinge[0], LEG.hinge[1], LEG.hinge[2]];
  const hub = [s * LEG.hub[0], LEG.hub[1], LEG.hub[2]];
  const axleTop = V.add(hub, [-s * 0.15, 0.05, 0]);
  rod(name, V.add(top, [0, 0.06, 0]), V.add(axleTop, [0, 0.6, -0.05]), 0.085, TAG.leg, 10);   // the cylinder
  rod(name, V.add(axleTop, [0, 0.62, -0.05]), axleTop, 0.06, TAG.metal, 10);                   // the piston
  rod(name, axleTop, V.add(hub, [s * 0.02, 0, 0]), 0.05, TAG.leg, 8);                          // the axle
  rod(name, V.add(axleTop, [0, 0.50, 0.03]), V.add(axleTop, [0, 0.29, 0.18]), 0.024, TAG.metal, 6);
  rod(name, V.add(axleTop, [0, 0.29, 0.18]), V.add(axleTop, [0, 0.06, 0.03]), 0.024, TAG.metal, 6);
  rod(name, V.add(axleTop, [0, 0.75, -0.04]), V.add(top, [s * 0.55, 0.0, -0.1]), 0.04, TAG.leg, 8);
  wheel(name, hub, LEG.r, LEG.w);
  const dx = -s * 0.2;
  slab(name, [(top[0] + axleTop[0]) / 2 + dx, (top[1] + axleTop[1] + 0.2) / 2, top[2] + 0.06],
    [X, Y, Z], [0.012, (top[1] - axleTop[1] - 0.1) / 2, 0.26], TAG.door);
}
// The tail wheel: a raked leg out of the bottom of her and a solid tyre in a
// fork, and the arrestor hook's stinger beside it.
{
  const top = TLEG.hinge, hub = TLEG.hub;
  rod('gearT', V.add(top, [0, 0.05, 0]), V.add(hub, [0, 0.14, 0.03]), 0.055, TAG.leg, 8);
  for (const s of [-1, 1]) rod('gearT', V.add(hub, [s * 0.08, 0.16, 0.05]), V.add(hub, [s * 0.08, 0, 0]), 0.02, TAG.leg, 6);
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
      if (pc.P[i + 1] < low) { low = pc.P[i + 1]; at = pc.P.slice(i, i + 3); }
    }
  }
  console.log(`tilt ${(TILT * 180 / Math.PI).toFixed(1)} deg, doors ${doorY.toFixed(3)}, lowest of her airframe ${low.toFixed(3)} at ${at.map((v) => v.toFixed(2))}, `
    + `main wheel ${lowest('gearR').toFixed(3)}, tail wheel ${lowest('gearT').toFixed(3)}, airscrew ${lowest('prop').toFixed(3)}, `
    + `fish ${lowest('store').toFixed(3)}, doors ${lowest('bayStbd').toFixed(3)}`);
  if (low < 0.15) throw new Error('her airframe is on the deck');
  if (lowest('store') < lowest('bayStbd') + 0.02) throw new Error('her fish is through her bomb doors');
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
// The sto-wing's hinge: behind the leading edge of the joint, on its top
// surface, so a panel stood on its leading edge does not reach the deck.
const FOLD_Z = 2.55;
const foldTop = (x) => {
  const hs = heightsAt(P, T0, keepTri, x, FOLD_Z);
  return hs.length ? hs[hs.length - 1] : -0.5;
};
const under = (x, z) => {
  const hs = heightsAt(P, T0, keepTri, x, z);
  return hs.length ? hs[0] : -0.8;
};
const meta = {
  span: SPAN,
  // How far she is turned nose-up from the level she was measured in, and
  // where that level frame's origin is in hers: the shader paints in the
  // level frame, so a paint line drawn along her is straight along her.
  tilt: TILT, ground: GROUND, dz: DZ,
  cy: Math.round(F([0, -0.7, 0])[1] * 100) / 100,
  prop: tp(PROP_C),
  propR: PROP_R,
  // The bomb doors, hinged along their outboard edges, port opening down to
  // port and starboard to starboard.
  bayPort: { at: tp(hingeOf.bayPort), axis: 'z', open: -1.5 },
  bayStbd: { at: tp(hingeOf.bayStbd), axis: 'z', open: 1.5 },
  // The fish, about its own middle.
  store: { at: tp(hingeOf.store), len: FISH.len, r: FISH.r },
  // The turret, about the middle of its ring, and the fifty's muzzle in its
  // own frame, laid aft.
  gun: { at: tp(BALL.at), muzzle: [0, 0.315, -0.98] },
  // Each main leg swings outboard about its hinge, ninety degrees, and its
  // wheel comes up flat into the wing; the tail wheel aft and up into her.
  gearL: { at: tp(hingeOf.gearL), axis: 'z', up: -1.55, tuck: 0.12 },
  gearR: { at: tp(hingeOf.gearR), axis: 'z', up: 1.55, tuck: 0.12 },
  gearT: { at: tp(hingeOf.gearT), axis: 'x', up: 1.45, tuck: 0.1 },
  // A fifty in each outer panel, firing outside the disc.
  guns: [-3.9, 3.9].map((x) => tp([x, under(x, 2.7) + 0.14, 2.95])),
  // The panels turn on their leading edge until it is down, and swing aft
  // to lie along her sides: the Grumman sto-wing.
  foldL: { at: tp([-FOLD, foldTop(-FOLD), FOLD_Z]) },
  foldR: { at: tp([FOLD, foldTop(FOLD), FOLD_Z]) },
  breaks: {
    tail: tp([0, -0.4, TAIL_CUT]),
    wingInL: tp([-ROOT_X, -0.9, 1.4]),
    wingInR: tp([ROOT_X, -0.9, 1.4]),
    wingOutL: tp([-FOLD, -0.9, 1.4]),
    wingOutR: tp([FOLD, -0.9, 1.4]),
    prop: tp(PROP_C),
  },
  exhaust: [tp([-0.72, -1.2, 4.3]), tp([0.72, -1.2, 4.3])],
  tips: [tp([-8.1, -0.15, 1.75]), tp([8.1, -0.15, 1.75])],
};
console.log('total', total, 'triangles', JSON.stringify(meta));

writeFileSync(OUT, `// Generated by build/tbf-source.mjs from the owner's TBF Avenger.
// Do not hand-edit -- regenerate from assets/models/Avenger.glb instead.
export const AVENGER_PIECES = ${JSON.stringify(out, null, 0).replace(/","/g, '",\n  "')};
export const AVENGER_META = ${JSON.stringify(meta)};
`);
console.log('wrote', OUT);
