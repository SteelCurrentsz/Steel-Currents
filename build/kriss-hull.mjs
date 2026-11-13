// One pipeline for the owner's whole-ship models that come as one Sketchfab
// export each -- kriss50's above all -- in the steps build/prepare-brooklyn-
// hull.mjs takes the Brooklyn through, but driven by a description of each
// ship rather than copied out for every one: build/prepare-fubuki-hull.mjs and
// its sisters are each a few dozen lines that say where the ship's model is,
// how long she is, how deep she floats, how she is painted and where on her
// every gun stands.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-<ship>-hull.mjs
//
// The models these come from are not drawn a mounting to a piece, as the
// Brooklyn's was: they are drawn a material, or a handful of parts, to a
// piece, so one piece of the model holds every gunhouse of hers and another
// every rail. A mounting is found instead by where it is: every run of faces
// that hang together and stand inside the box the ship's description gives
// for it, in her own frame, in metres -- her bow +Z, her waterline y = 0.
//
// SHOT=prefix writes a plan and an elevation of her, framed and floated, the
// faces each mounting took coloured by its kind, with a metre grid, as
// prefix-top.png and prefix-side.png; LIST=1 lists every piece of her where it
// stands; both stop there.
//
// Writes the ship's hull data module, which is committed, so a fresh clone
// runs without any of this.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simplifier, decimate as decimateWith } from './sculpt-source.mjs';
import { heightmap, heightBytes, pack, packPieceCompact, stations, faceNormal } from './sculpt.mjs';
import { measureLines } from './sculpt-parts.mjs';
import { mirrorSides, sealFromOutside } from './seal.mjs';
import { flatten } from './glb-flatten.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(process.env.SCULPT_TOOLS ? path.join(process.env.SCULPT_TOOLS, 'index.js') : import.meta.url);

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255].map((v) => v / 255);
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Whether a point is inside a box `{ x: [lo, hi], y: [lo, hi], z: [lo, hi] }`, any side of which may be left open. */
const inBox = (b, x, y, z, slack = 0) => (!b.x || (x >= b.x[0] - slack && x <= b.x[1] + slack))
  && (!b.y || (y >= b.y[0] - slack && y <= b.y[1] + slack))
  && (!b.z || (z >= b.z[0] - slack && z <= b.z[1] + slack));

/**
 * Build a ship off her model. `cfg`:
 *
 *   name, src, out       what she is called in the log, her model, her data module
 *   credit               the line her data module is headed with
 *   loa, draught         her length over all and how deep she floats, metres
 *   bow                  which way the model's bow points: '+x', '-x', '+z', '-z'
 *   lift                 metres her model's waterline is to be raised, if it floats wrong
 *   hull                 the model's nodes that draw her hull plating; by default
 *                        every node that reaches a metre under her waterline
 *   rigging              { y, len, faces }: runs of faces over y, longer than len
 *                        and of no more than `faces`, are wires, and come off her
 *   paints               { key: 0xrrggbb }: her colours
 *   paint(f)             the key a face is painted: f has cy (its height), up (it
 *                        looks at the sky), down, shell (it is her side), node, mat
 *   paintLines           heights her shell is cut straight along, where her paint changes
 *   kinds                { kind: { boxes: [box...], gun: {...}, nodes?: [...], keep?: false } }:
 *                        every mounting of a kind, a box each, and how it is cut
 *                        (see gunKind); `screw` is her screws
 *   remove               boxes whose faces are not hers and are taken off her
 *   measure              { name: [box...] }: the extent of what stands in each box
 *                        (a catapult, a lift), taken off her and written out
 *   keepIn               boxes of hers that are never a mounting's, whatever stands in them
 *   hullTris             how far her hull is decimated
 *   deckFallback         her deck's height where her lines find none
 *   extra                anything else her data module carries
 */
export async function prepare(cfg) {
  const MeshoptSimplifier = await simplifier();
  MeshoptSimplifier.useExperimentalFeatures = true;
  const SRC = path.isAbsolute(cfg.src) ? cfg.src : path.join(ROOT, cfg.src);
  const OUT_DATA = path.isAbsolute(cfg.out) ? cfg.out : path.join(ROOT, cfg.out);
  const model = await flatten(readFileSync(SRC), cfg.groupDepth ?? 3);
  const { j } = model;
  const LOA = cfg.loa;
  const DRAUGHT = cfg.draught;

  // ---- her frame ---------------------------------------------------------------
  // Turned so her bow is +Z, keeping her a right-handed ship.
  {
    const P = model.P;
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], z = P[i + 2];
      if (cfg.bow === '+x') { P[i] = -z; P[i + 2] = x; } else if (cfg.bow === '-x') { P[i] = z; P[i + 2] = -x; } else if (cfg.bow === '-z') { P[i] = -x; P[i + 2] = -z; }
    }
  }
  // Pieces scaled away to nothing, left over in the export.
  {
    const box = new Map();
    for (let t = 0; t < model.T.length / 3; t++) {
      const l = model.L[t];
      let b = box.get(l);
      if (!b) box.set(l, b = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity]);
      for (let k = 0; k < 3; k++) {
        const v = model.T[t * 3 + k];
        for (let c = 0; c < 3; c++) { b[c * 2] = Math.min(b[c * 2], model.P[v * 3 + c]); b[c * 2 + 1] = Math.max(b[c * 2 + 1], model.P[v * 3 + c]); }
      }
    }
    const gone = new Set([...box].filter(([, b]) => b[1] - b[0] < 1e-6 && b[3] - b[2] < 1e-6 && b[5] - b[4] < 1e-6).map(([l]) => l));
    if (gone.size) {
      const T2 = [], G2 = [], L2 = [], M2 = [];
      for (let t = 0; t < model.T.length / 3; t++) {
        if (gone.has(model.L[t])) continue;
        T2.push(model.T[t * 3], model.T[t * 3 + 1], model.T[t * 3 + 2]); G2.push(model.G[t]); L2.push(model.L[t]); M2.push(model.M[t]);
      }
      model.T = T2; model.G = G2; model.L = L2; model.M = M2;
      console.log(`dropped ${gone.size} empty pieces`);
    }
  }
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < model.T.length; t++) {
    const i = model.T[t] * 3;
    for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], model.P[i + c]); hi[c] = Math.max(hi[c], model.P[i + c]); }
  }
  const SCALE = LOA / (hi[2] - lo[2]);
  const XC = (lo[0] + hi[0]) / 2, ZC = (lo[2] + hi[2]) / 2;
  // Floated at her draught: her keel -- the lowest of her -- that far under.
  const SINK = DRAUGHT + lo[1] * SCALE + (cfg.lift || 0);
  for (let i = 0; i < model.P.length; i += 3) {
    model.P[i] = (model.P[i] - XC) * SCALE;
    model.P[i + 1] = model.P[i + 1] * SCALE - SINK;
    model.P[i + 2] = (model.P[i + 2] - ZC) * SCALE;
  }
  const BEAM = (hi[0] - lo[0]) * SCALE;
  console.log(`${cfg.name}: x${SCALE.toFixed(2)}, ${LOA} m long, ${BEAM.toFixed(2)} m across, keel ${(lo[1] * SCALE - SINK).toFixed(2)}, truck ${(hi[1] * SCALE - SINK).toFixed(2)}`);

  // ---- her rigging -----------------------------------------------------------------
  // Stays, aerials and halyards drawn as runs of a few faces, a hand's breadth
  // thick and metres long, over her deck: decimated, a scatter of shards in the
  // sky. Every such run comes off her.
  const RIG = { y: 6, len: 3, faces: 24, ...(cfg.rigging || {}) };
  const WIRE = -7;
  {
    const P = model.P, T = model.T;
    const id = new Map(), up = [];
    const find = (a) => { while (up[a] !== a) { up[a] = up[up[a]]; a = up[a]; } return a; };
    const node = (v, l) => {
      const k = `${l},${Math.round(P[v * 3] * 1000)},${Math.round(P[v * 3 + 1] * 1000)},${Math.round(P[v * 3 + 2] * 1000)}`;
      let i = id.get(k);
      if (i === undefined) { i = up.length; id.set(k, i); up.push(i); }
      return i;
    };
    const nf = T.length / 3;
    const first = new Int32Array(nf);
    for (let t = 0; t < nf; t++) {
      const a = node(T[t * 3], model.L[t]), b = node(T[t * 3 + 1], model.L[t]), c = node(T[t * 3 + 2], model.L[t]);
      up[find(b)] = find(a); up[find(c)] = find(a);
      first[t] = a;
    }
    const parts = new Map();
    for (let t = 0; t < nf; t++) {
      const r = find(first[t]);
      let p = parts.get(r);
      if (!p) parts.set(r, p = { n: 0, area: 0, lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });
      p.n++;
      {
        const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
        const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
        const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
        p.area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
      }
      for (let k = 0; k < 3; k++) {
        const v = T[t * 3 + k];
        for (let c = 0; c < 3; c++) { p.lo[c] = Math.min(p.lo[c], P[v * 3 + c]); p.hi[c] = Math.max(p.hi[c], P[v * 3 + c]); }
      }
    }
    const wire = new Set();
    for (const [r, p] of parts) {
      const len = Math.hypot(p.hi[0] - p.lo[0], p.hi[1] - p.lo[1], p.hi[2] - p.lo[2]);
      const thin = Math.min(p.hi[0] - p.lo[0], p.hi[1] - p.lo[1], p.hi[2] - p.lo[2]) < 0.25;
      const upright = (p.hi[1] - p.lo[1]) > 0.95 * len;
      // A wire is thin all round: as much skin as a rod a hand across, not a
      // plate of deck or a sheet of plating, which are thin one way only.
      const rod = p.area < 0.3 * len;
      if (len > RIG.len && p.n <= RIG.faces && thin && rod && p.lo[1] > RIG.y && !upright) wire.add(r);
    }
    // Kept on her, as her model draws it, but marked: no mounting is made of
    // a wire, and nothing is seated on one.
    let cut = 0;
    for (let t = 0; t < nf; t++) if (wire.has(find(first[t]))) { model.L[t] = WIRE; cut++; }
    console.log(`rigging: ${wire.size} wires, ${cut} faces, kept off her decks`);
  }

  // ---- her flight deck (a carrier) --------------------------------------------------
  // The model's flight deck is flat plates over the top of her: everything of
  // them at the height of her deck comes off and its outline is kept -- how
  // far out each way it runs at every half metre of her length -- and
  // carrier.js lays her runway afresh over it, her lift wells cut through it.
  // Whatever stands on it or lies in it, inboard of a band along its edge and
  // outside her island, is carved off: her runway is clear end to end.
  let DECK = null;
  if (cfg.carrier) {
    const C = cfg.carrier;
    const P = model.P, T = model.T, nf = T.length / 3;
    const nrm = (t) => {
      const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const l = Math.hypot(...n);
      return [n[0] / (l || 1), n[1] / (l || 1), n[2] / (l || 1), l / 2];
    };
    // Its height: where the most of her area that looks at the sky is.
    const hist = new Map();
    for (let t = 0; t < nf; t++) {
      const [, ny, , area] = nrm(t);
      if (Math.abs(ny) < 0.98) continue;
      const y = (P[T[t * 3] * 3 + 1] + P[T[t * 3 + 1] * 3 + 1] + P[T[t * 3 + 2] * 3 + 1]) / 3;
      if (y < (C.minY ?? 8)) continue;
      const k = Math.round(y * 20);
      hist.set(k, (hist.get(k) || 0) + area);
    }
    let FD = 0, best = 0;
    for (const [k, a] of hist) if (a > best) { best = a; FD = k / 20; }
    const ISL = C.island;
    const inIsland = (x, z) => x > ISL.x0 && x < ISL.x1 && z > ISL.z0 && z < ISL.z1;
    const onDeck = new Set();
    for (let t = 0; t < nf; t++) {
      const ys = [0, 1, 2].map((k) => P[T[t * 3 + k] * 3 + 1]);
      if (Math.min(...ys) < FD - 0.08 || Math.max(...ys) > FD + 0.08) continue;
      if (Math.abs(nrm(t)[1]) < 0.9) continue;
      onDeck.add(t);
    }
    FD = 0;
    for (const t of onDeck) for (let k = 0; k < 3; k++) FD = Math.max(FD, P[T[t * 3 + k] * 3 + 1]);
    const PLAN = { z0: -Math.ceil(LOA / 2 + 2), dz: 0.5 };
    PLAN.nz = Math.ceil((-PLAN.z0 * 2) / PLAN.dz) + 1;
    const plan = { ...PLAN, port: new Float32Array(PLAN.nz), stbd: new Float32Array(PLAN.nz) };
    for (const t of onDeck) {
      const pts = [0, 1, 2].map((k) => { const v = T[t * 3 + k] * 3; return [P[v], P[v + 1], P[v + 2]]; });
      const zs = pts.map((q) => q[2]);
      const k0 = Math.ceil((Math.min(...zs) - PLAN.z0) / PLAN.dz), k1 = Math.floor((Math.max(...zs) - PLAN.z0) / PLAN.dz);
      for (let k = Math.max(0, k0); k <= Math.min(PLAN.nz - 1, k1); k++) {
        const z = PLAN.z0 + k * PLAN.dz;
        for (let e = 0; e < 3; e++) {
          const a = pts[e], b = pts[(e + 1) % 3];
          if ((a[2] - z) * (b[2] - z) > 0 || a[2] === b[2]) continue;
          const x = a[0] + (b[0] - a[0]) * ((z - a[2]) / (b[2] - a[2]));
          plan.port[k] = Math.max(plan.port[k], x);
          plan.stbd[k] = Math.max(plan.stbd[k], -x);
        }
      }
    }
    // A plate drawn short of her centreline on one side leaves a station
    // reading no deck that side: it is filled from the stations round it.
    for (const side of ['port', 'stbd']) {
      const a = plan[side];
      for (let k = 1; k < a.length - 1; k++) {
        if (a[k] > 0.5) continue;
        let lo = k - 1, hi = k + 1;
        while (hi < a.length && a[hi] <= 0.5) hi++;
        if (lo >= 0 && hi < a.length && a[lo] > 0.5 && hi - lo < 12) for (let q = k; q < hi; q++) a[q] = a[lo] + ((a[hi] - a[lo]) * (q - lo)) / (hi - lo);
        k = hi;
      }
    }
    const planAt = (side, z) => { const k = Math.round((z - plan.z0) / plan.dz); return k < 0 || k >= plan.nz ? 0 : plan[side][k]; };
    let FD_AFT = 0, FD_FWD = 0;
    for (let k = 0; k < plan.nz; k++) if (plan.port[k] > 0.5 && plan.stbd[k] > 0.5) { FD_AFT = plan.z0 + k * plan.dz; break; }
    for (let k = plan.nz - 1; k >= 0; k--) if (plan.port[k] > 0.5 && plan.stbd[k] > 0.5) { FD_FWD = plan.z0 + k * plan.dz; break; }
    // Abreast her island her runway stops at its face.
    {
      const face = new Float32Array(plan.nz).fill(99);
      for (let t = 0; t < nf; t++) {
        const v = [0, 1, 2].map((k) => T[t * 3 + k] * 3);
        const cx = (P[v[0]] + P[v[1]] + P[v[2]]) / 3, cy = (P[v[0] + 1] + P[v[1] + 1] + P[v[2] + 1]) / 3, cz = (P[v[0] + 2] + P[v[1] + 2] + P[v[2] + 2]) / 3;
        if (!inIsland(cx, cz) || cx > ISL.face || cy < FD + 0.8 || cy > FD + 6) continue;
        for (const q of v) {
          const kk = Math.round((P[q + 2] - plan.z0) / plan.dz);
          if (kk >= 0 && kk < plan.nz) face[kk] = Math.min(face[kk], -P[q]);
        }
      }
      for (let k = 0; k < plan.nz; k++) {
        const z = plan.z0 + k * plan.dz;
        if (z <= ISL.z0 + 1 || z >= ISL.z1 - 1) continue;
        let f = 99;
        for (let d = -12; d <= 12; d++) if (k + d >= 0 && k + d < plan.nz) f = Math.min(f, face[k + d]);
        if (f < plan.stbd[k]) plan.stbd[k] = Math.max(f - 0.05, 4);
      }
    }
    const BAND = 0.6;
    const T2 = [], G2 = [], L2 = [], M2 = [];
    let gone = 0;
    for (let t = 0; t < nf; t++) {
      const v = [0, 1, 2].map((k) => T[t * 3 + k] * 3);
      const cx = (P[v[0]] + P[v[1]] + P[v[2]]) / 3, cy = (P[v[0] + 1] + P[v[1] + 1] + P[v[2] + 1]) / 3, cz = (P[v[0] + 2] + P[v[1] + 2] + P[v[2] + 2]) / 3;
      let carve = onDeck.has(t);
      if (!carve && !inIsland(cx, cz) && cz > FD_AFT - 0.5 && cz < FD_FWD + 0.5 && cy > FD - 0.35) {
        const out = cx > 0 ? planAt('port', cz) : planAt('stbd', cz);
        carve = out > BAND && Math.abs(cx) < out - BAND;
      }
      if (carve) { gone++; continue; }
      T2.push(T[t * 3], T[t * 3 + 1], T[t * 3 + 2]); G2.push(model.G[t]); L2.push(model.L[t]); M2.push(model.M[t]);
    }
    model.T = T2; model.G = G2; model.L = L2; model.M = M2;
    const round = (a) => Array.from(a, (v) => +v.toFixed(2));
    DECK = { y: +FD.toFixed(3), flat: { aft: FD_AFT, fwd: FD_FWD }, drop: { aft: 0, fwd: 0 }, z0: plan.z0, dz: plan.dz, nz: plan.nz, port: round(plan.port), stbd: round(plan.stbd) };
    console.log(`flight deck: ${FD.toFixed(2)} m, ${FD_AFT} to ${FD_FWD}; ${onDeck.size} plates taken up, ${gone} faces carved off her runway;`,
      [-0.4, -0.2, 0, 0.2, 0.4].map((f) => `${(f * LOA).toFixed(0)}:${planAt('stbd', f * LOA).toFixed(1)}|${planAt('port', f * LOA).toFixed(1)}`).join(' '));
  }

  if (process.env.LIST) {
    const by = new Map();
    for (let t = 0; t < model.T.length / 3; t++) {
      const n = model.L[t];
      let b = by.get(n);
      if (!b) by.set(n, b = { n: 0, m: new Set(), lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });
      b.n++; b.m.add(model.M[t]);
      for (let k = 0; k < 3; k++) { const v = model.T[t * 3 + k]; for (let c = 0; c < 3; c++) { b.lo[c] = Math.min(b.lo[c], model.P[v * 3 + c]); b.hi[c] = Math.max(b.hi[c], model.P[v * 3 + c]); } }
    }
    for (const [n, b] of [...by].sort((a, c) => (c[1].lo[2] + c[1].hi[2]) - (a[1].lo[2] + a[1].hi[2]))) {
      console.log(`${n} ${j.nodes[n].name} ${b.n}t mat ${[...b.m].join('/')} x ${b.lo[0].toFixed(1)}..${b.hi[0].toFixed(1)} y ${b.lo[1].toFixed(1)}..${b.hi[1].toFixed(1)} z ${b.lo[2].toFixed(1)}..${b.hi[2].toFixed(1)}`);
    }
    process.exit(0);
  }

  // ---- her runs of faces -----------------------------------------------------------
  // Every run of faces that hang together, within a piece of the model: what
  // a mounting is made of.
  const parts = (() => {
    const P = model.P, T = model.T;
    const id = new Map(), up = [];
    const find = (a) => { while (up[a] !== a) { up[a] = up[up[a]]; a = up[a]; } return a; };
    const node = (v, l) => {
      const k = `${l},${Math.round(P[v * 3] * 1000)},${Math.round(P[v * 3 + 1] * 1000)},${Math.round(P[v * 3 + 2] * 1000)}`;
      let i = id.get(k);
      if (i === undefined) { i = up.length; id.set(k, i); up.push(i); }
      return i;
    };
    const nf = T.length / 3;
    const first = new Int32Array(nf);
    for (let t = 0; t < nf; t++) {
      const a = node(T[t * 3], model.L[t]), b = node(T[t * 3 + 1], model.L[t]), c = node(T[t * 3 + 2], model.L[t]);
      up[find(b)] = find(a); up[find(c)] = find(a);
      first[t] = a;
    }
    const byRoot = new Map();
    const list = [];
    for (let t = 0; t < nf; t++) {
      if (model.L[t] === WIRE) continue;
      const r = find(first[t]);
      let p = byRoot.get(r);
      if (!p) { p = { tris: [], node: model.L[t], lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }; byRoot.set(r, p); list.push(p); }
      p.tris.push(t);
      for (let k = 0; k < 3; k++) {
        const v = T[t * 3 + k];
        for (let c = 0; c < 3; c++) { p.lo[c] = Math.min(p.lo[c], P[v * 3 + c]); p.hi[c] = Math.max(p.hi[c], P[v * 3 + c]); }
      }
    }
    for (const p of list) p.mid = [0, 1, 2].map((c) => (p.lo[c] + p.hi[c]) / 2);
    return list;
  })();

  // CLUSTERS=1: the runs of faces off her hull, gathered where they stand
  // within a hand of each other, and listed with their boxes -- what her
  // mountings' boxes are drawn round. CLUSTERS_Y: only what stands over it.
  if (process.env.CLUSTERS) {
    const gap = +(process.env.CLUSTERS_GAP || 0.15);
    const big = +(process.env.CLUSTERS_BIG || LOA * 0.12);
    const yMin = +(process.env.CLUSTERS_Y ?? -99);
    let cl = parts.filter((p) => Math.max(p.hi[0] - p.lo[0], p.hi[1] - p.lo[1], p.hi[2] - p.lo[2]) < +(process.env.CLUSTERS_PART || big) && p.lo[1] > yMin && !(cfg.hull || []).includes(p.node))
      .map((p) => ({ n: p.tris.length, lo: [...p.lo], hi: [...p.hi], nodes: new Set([p.node]) }));
    const near = (A, B) => [0, 1, 2].every((c) => A.lo[c] - gap <= B.hi[c] && B.lo[c] - gap <= A.hi[c]);
    for (let merged = true; merged;) {
      merged = false;
      for (let a = 0; a < cl.length; a++) {
        for (let b = a + 1; b < cl.length; b++) {
          if (!near(cl[a], cl[b])) continue;
          const A = cl[a], B = cl[b];
          A.n += B.n; for (const nn of B.nodes) A.nodes.add(nn);
          for (let c = 0; c < 3; c++) { A.lo[c] = Math.min(A.lo[c], B.lo[c]); A.hi[c] = Math.max(A.hi[c], B.hi[c]); }
          cl.splice(b, 1); b--; merged = true;
        }
      }
    }
    cl = cl.filter((c) => c.n >= +(process.env.CLUSTERS_MIN || 40) && Math.max(c.hi[0] - c.lo[0], c.hi[2] - c.lo[2]) < big);
    cl.sort((a, b) => b.hi[2] + b.lo[2] - a.hi[2] - a.lo[2]);
    for (const c of cl) console.log(`${c.n}t nodes ${[...c.nodes].join('/')} x ${c.lo[0].toFixed(2)}..${c.hi[0].toFixed(2)} y ${c.lo[1].toFixed(2)}..${c.hi[1].toFixed(2)} z ${c.lo[2].toFixed(2)}..${c.hi[2].toFixed(2)}  (${(c.hi[0] - c.lo[0]).toFixed(1)}x${(c.hi[1] - c.lo[1]).toFixed(1)}x${(c.hi[2] - c.lo[2]).toFixed(1)})`);
    process.exit(0);
  }

  // PARTS_AT=x0,x1,y0,y1,z0,z1: every run of faces whose middle is in that box.
  if (process.env.PARTS_AT) {
    const [a, b, c, d, e, f] = process.env.PARTS_AT.split(',').map(Number);
    for (const p of parts) {
      if (!inBox({ x: [a, b], y: [c, d], z: [e, f] }, ...p.mid)) continue;
      console.log(`node ${p.node} ${p.tris.length}t x ${p.lo[0].toFixed(2)}..${p.hi[0].toFixed(2)} y ${p.lo[1].toFixed(2)}..${p.hi[1].toFixed(2)} z ${p.lo[2].toFixed(2)}..${p.hi[2].toFixed(2)}`);
    }
    process.exit(0);
  }

  // ---- her shell -------------------------------------------------------------------
  const nTri0 = model.T.length / 3;
  const HULL_PIECES = new Set(cfg.hull || []);
  if (!cfg.hull) {
    // Every piece that reaches a metre under her waterline and runs a third of her length.
    const ext = new Map();
    for (let t = 0; t < nTri0; t++) {
      const l = model.L[t];
      let e = ext.get(l);
      if (!e) ext.set(l, e = [Infinity, Infinity, -Infinity]);
      for (let k = 0; k < 3; k++) {
        const v = model.T[t * 3 + k];
        e[0] = Math.min(e[0], model.P[v * 3 + 1]); e[1] = Math.min(e[1], model.P[v * 3 + 2]); e[2] = Math.max(e[2], model.P[v * 3 + 2]);
      }
    }
    for (const [l, e] of ext) if (e[0] < -1 && e[2] - e[1] > LOA * 0.08) HULL_PIECES.add(l);
  }
  console.log('hull pieces:', [...HULL_PIECES].join(','));
  const WATERLINE = 0.0;
  const PAINT_LINES = cfg.paintLines || [WATERLINE];
  const HB = new Float32Array(Math.ceil(LOA) + 4);
  for (let t = 0; t < nTri0; t++) {
    if (!HULL_PIECES.has(model.L[t])) continue;
    for (let k = 0; k < 3; k++) {
      const v = model.T[t * 3 + k];
      const y = model.P[v * 3 + 1];
      if (y < -DRAUGHT * 0.8 || y > 2) continue;
      const i = Math.round(model.P[v * 3 + 2] + LOA / 2);
      if (i >= 0 && i < HB.length) HB[i] = Math.max(HB[i], Math.abs(model.P[v * 3]));
    }
  }
  const hbAt = (z) => HB[Math.max(0, Math.min(HB.length - 1, Math.round(z + LOA / 2)))];
  const SIDE_IN = cfg.sideIn ?? Math.max(0.6, BEAM * 0.06);
  function isShell(t) {
    if (!HULL_PIECES.has(model.L[t])) return false;
    const [a, b, c] = [model.T[t * 3], model.T[t * 3 + 1], model.T[t * 3 + 2]];
    const P = model.P;
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (ny > 0.5 * Math.hypot(nx, ny, nz)) return false;
    const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3, cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3, cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
    return cy < WATERLINE + 0.5 || Math.abs(cx) > hbAt(cz) - SIDE_IN || (Math.abs(cz) > 0.84 * LOA / 2 && cy < 3);
  }
  // Which mounting every face is: a run of faces is a mounting's if it stands
  // in that mounting's box.
  const KINDS = {};
  const kindOf = new Map();
  // And which of that kind's mountings: carried through every cut below.
  const mountIx = new Map();
  const NOT_HERS = new Set();
  const keepIn = cfg.keepIn || [];
  const kept = (p) => keepIn.some((b) => inBox(b, ...p.mid));
  const claim = (b, p, opt = {}) => {
    if (opt.nodes && !opt.nodes.includes(p.node)) return false;
    if (!opt.hullToo && HULL_PIECES.has(p.node) && !(b.nodes && b.nodes.includes(p.node))) return false;
    if (b.nodes && !b.nodes.includes(p.node)) return false;
    if (b.minFaces && p.tris.length < b.minFaces) return false;
    // And bits too small to be any of it: a bollard, a rivet.
    if (b.minSize && Math.max(p.hi[0] - p.lo[0], p.hi[1] - p.lo[1], p.hi[2] - p.lo[2]) < b.minSize) return false;
    // A box may leave out what stands in the boxes under it: a ventilator
    // beside a gunhouse, a rack of charges under a gun's barrels.
    if (b.not && b.not.some((n) => inBox(n, ...p.mid))) return false;
    return inBox(b, ...p.mid) && inBox(b, ...p.lo, b.slack ?? 0.4) && inBox(b, ...p.hi, b.slack ?? 0.4);
  };
  const taken = new Set();
  for (const box of cfg.remove || []) {
    for (const p of parts) if (!taken.has(p) && !kept(p) && claim(box, p, { hullToo: box.hullToo })) { for (const t of p.tris) NOT_HERS.add(t); taken.add(p); }
  }
  const MEASURED = {};
  for (const [name, boxes] of Object.entries(cfg.measure || {})) {
    MEASURED[name] = boxes.map((box) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity, n = 0;
      for (const p of parts) {
        if (taken.has(p) || kept(p) || !claim(box, p, { hullToo: box.hullToo })) continue;
        taken.add(p);
        for (const t of p.tris) NOT_HERS.add(t);
        n += p.tris.length;
        x0 = Math.min(x0, p.lo[0]); x1 = Math.max(x1, p.hi[0]); y0 = Math.min(y0, p.lo[1]); y1 = Math.max(y1, p.hi[1]); z0 = Math.min(z0, p.lo[2]); z1 = Math.max(z1, p.hi[2]);
      }
      if (!n) throw new Error(`${name}: nothing of her in ${JSON.stringify(box)}`);
      return { x: +((x0 + x1) / 2).toFixed(3), z: +((z0 + z1) / 2).toFixed(3), y0: +y0.toFixed(3), y1: +y1.toFixed(3), w: +(x1 - x0).toFixed(2), len: +(z1 - z0).toFixed(2) };
    });
    console.log(`${name}:`, MEASURED[name].map((c) => `(${c.x}, ${c.z}) y ${c.y0}..${c.y1} ${c.w}x${c.len}`).join(' '));
  }
  // A kind may find its mountings for itself (`auto`): every cluster of the
  // runs of faces in its regions -- parts within `gap` of each other -- whose
  // size, across and up, is a mounting's. Her galleries' Oerlikons, a few
  // dozen of them, each its own box.
  const findAuto = (kind, spec) => {
    const A = spec.auto;
    const gap = A.gap ?? 0.15;
    let cl = parts.filter((p) => !taken.has(p) && !kept(p) && !HULL_PIECES.has(p.node)
      && A.regions.some((r) => inBox(r, ...p.mid)) && Math.max(p.hi[0] - p.lo[0], p.hi[2] - p.lo[2]) < A.size[1])
      .map((p) => ({ ps: [p], lo: [...p.lo], hi: [...p.hi] }));
    const near = (X, Y) => [0, 1, 2].every((c) => X.lo[c] - gap <= Y.hi[c] && Y.lo[c] - gap <= X.hi[c]);
    for (let merged = true; merged;) {
      merged = false;
      for (let a = 0; a < cl.length; a++) {
        for (let b = a + 1; b < cl.length; b++) {
          if (!near(cl[a], cl[b])) continue;
          const X = cl[a], Y = cl[b];
          X.ps.push(...Y.ps);
          for (let c = 0; c < 3; c++) { X.lo[c] = Math.min(X.lo[c], Y.lo[c]); X.hi[c] = Math.max(X.hi[c], Y.hi[c]); }
          cl.splice(b, 1); b--; merged = true;
        }
      }
    }
    if (process.env.AUTO_DEBUG === kind) for (const c of cl) console.log(`  ${kind} cluster ${c.ps.reduce((q, p) => q + p.tris.length, 0)}t x ${c.lo[0].toFixed(1)}..${c.hi[0].toFixed(1)} y ${c.lo[1].toFixed(1)}..${c.hi[1].toFixed(1)} z ${c.lo[2].toFixed(1)}..${c.hi[2].toFixed(1)}`);
    cl = cl.filter((c) => {
      const w = Math.max(c.hi[0] - c.lo[0], c.hi[2] - c.lo[2]), h = c.hi[1] - c.lo[1];
      const n = c.ps.reduce((q, p) => q + p.tris.length, 0);
      return w >= A.size[0] && w <= A.size[1] && h >= (A.height ? A.height[0] : 0) && h <= (A.height ? A.height[1] : 99) && n >= (A.minFaces ?? 40) && n <= (A.maxFaces ?? Infinity);
    });
    cl.sort((a, b) => (b.lo[2] + b.hi[2]) - (a.lo[2] + a.hi[2]) || (a.lo[0] + a.hi[0]) - (b.lo[0] + b.hi[0]));
    spec.boxes = cl.map((c) => ({ x: [c.lo[0], c.hi[0]], y: [c.lo[1], c.hi[1]], z: [c.lo[2], c.hi[2]], parts: c.ps }));
    console.log(`${kind}: found ${spec.boxes.length} mountings by themselves`);
  };
  for (const [kind, spec] of Object.entries(cfg.kinds || {})) {
    if (spec.auto) findAuto(kind, spec);
    KINDS[kind] = spec.boxes.map((box) => {
      if (box.parts) {
        const s = new Set();
        for (const p of box.parts) { if (taken.has(p)) continue; taken.add(p); for (const t of p.tris) s.add(t); }
        return s;
      }
      const s = new Set();
      for (const p of parts) {
        if (taken.has(p) || kept(p) || !claim(box, p, { hullToo: box.hullToo ?? spec.hullToo, nodes: spec.nodes })) continue;
        taken.add(p);
        for (const t of p.tris) s.add(t);
      }
      if (s.size < (spec.min ?? 20)) throw new Error(`${kind}: only ${s.size} faces of her in ${JSON.stringify(box)}`);
      return s;
    });
    KINDS[kind].forEach((set, i) => { for (const t of set) { kindOf.set(t, kind); mountIx.set(t, i); } });
    console.log(`${kind}: ${KINDS[kind].length} mountings, ${KINDS[kind].map((s) => s.size).join('/')} faces`);
  }

  // ---- a look at her -----------------------------------------------------------------
  if (process.env.SHOT) await shoot(process.env.SHOT, model, kindOf, NOT_HERS, LOA);

  // Cut along her waterline and wherever her paint changes.
  for (const LEVEL of PAINT_LINES) {
    const { P, UV, T } = model;
    const nf = T.length / 3;
    const made = new Map();
    const cross = (a, b) => {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (made.has(key)) return made.get(key);
      const s = (LEVEL - P[a * 3 + 1]) / (P[b * 3 + 1] - P[a * 3 + 1]);
      const w = P.length / 3;
      P.push(P[a * 3] + (P[b * 3] - P[a * 3]) * s, LEVEL, P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * s);
      model.N.push(0, 1, 0);
      UV.push(UV[a * 2] + (UV[b * 2] - UV[a * 2]) * s, UV[a * 2 + 1] + (UV[b * 2 + 1] - UV[a * 2 + 1]) * s);
      made.set(key, w);
      return w;
    };
    let split = 0;
    const T2 = [], G2 = [], L2 = [], M2 = [], K2 = new Map(), X2 = new Set();
    const put = (t, a, b, c) => {
      const nt = T2.length / 3;
      T2.push(a, b, c); G2.push(model.G[t]); L2.push(model.L[t]); M2.push(model.M[t]);
      if (kindOf.has(t)) K2.set(nt, [kindOf.get(t), mountIx.get(t)]);
      if (NOT_HERS.has(t)) X2.add(nt);
    };
    for (let t = 0; t < nf; t++) {
      const v = [T[t * 3], T[t * 3 + 1], T[t * 3 + 2]];
      const sd = v.map((i) => Math.sign(P[i * 3 + 1] - LEVEL));
      if (kindOf.has(t) || NOT_HERS.has(t) || !isShell(t) || !(sd.includes(1) && sd.includes(-1))) { put(t, ...v); continue; }
      split++;
      const upp = [], down = [];
      for (let k = 0; k < 3; k++) {
        const a = v[k], b = v[(k + 1) % 3];
        if (sd[k] >= 0) upp.push(a);
        if (sd[k] <= 0) down.push(a);
        if (sd[k] * sd[(k + 1) % 3] < 0) { const w = cross(a, b); upp.push(w); down.push(w); }
      }
      for (const poly of [upp, down]) for (let k = 1; k + 1 < poly.length; k++) put(t, poly[0], poly[k], poly[k + 1]);
    }
    model.T = T2; model.G = G2; model.L = L2; model.M = M2;
    remap(K2, X2);
    console.log(`${LEVEL} m: ${split} triangles of her shell cut along it`);
  }
  function remap(K2, X2) {
    kindOf.clear(); mountIx.clear();
    for (const [t, [k, i]] of K2) { kindOf.set(t, k); mountIx.set(t, i); }
    NOT_HERS.clear();
    for (const t of X2) NOT_HERS.add(t);
  }
  // Every mounting's faces again, now they are renumbered.
  const rebuildKinds = () => {
    for (const k of Object.keys(KINDS)) KINDS[k] = cfg.kinds[k].boxes.map(() => new Set());
    for (const [t, k] of kindOf) KINDS[k][mountIx.get(t)].add(t);
  };
  rebuildKinds();

  // Her decks and her sides cut small, so her paint goes face by face.
  {
    const AMAX = cfg.amax ?? 0.6;
    const { P, UV } = model;
    const area = (T, t) => {
      if (kindOf.has(t) || NOT_HERS.has(t)) return 0;
      const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
      return ny > 0.85 * l || HULL_PIECES.has(model.L[t]) ? l / 2 : 0;
    };
    const len2 = (a, b) => (P[a * 3] - P[b * 3]) ** 2 + (P[a * 3 + 1] - P[b * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[b * 3 + 2]) ** 2;
    const key = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
    let made = 0;
    for (let pass = 0; pass < 16; pass++) {
      const T = model.T, nf = T.length / 3;
      const cut = new Map();
      for (let t = 0; t < nf; t++) {
        if (area(T, t) <= AMAX) continue;
        const v = [T[t * 3], T[t * 3 + 1], T[t * 3 + 2]];
        let e = 0;
        for (let k = 1; k < 3; k++) if (len2(v[k], v[(k + 1) % 3]) > len2(v[e], v[(e + 1) % 3])) e = k;
        cut.set(key(v[e], v[(e + 1) % 3]), -1);
      }
      if (!cut.size) break;
      const mid = (a, b) => {
        const k = key(a, b);
        let w = cut.get(k);
        if (w >= 0) return w;
        w = P.length / 3;
        P.push((P[a * 3] + P[b * 3]) / 2, (P[a * 3 + 1] + P[b * 3 + 1]) / 2, (P[a * 3 + 2] + P[b * 3 + 2]) / 2);
        model.N.push(0, 1, 0);
        UV.push((UV[a * 2] + UV[b * 2]) / 2, (UV[a * 2 + 1] + UV[b * 2 + 1]) / 2);
        cut.set(k, w);
        return w;
      };
      const T2 = [], G2 = [], L2 = [], M2 = [], K2 = new Map(), X2 = new Set();
      const put = (t, a, b, c) => {
        const nt = T2.length / 3;
        T2.push(a, b, c); G2.push(model.G[t]); L2.push(model.L[t]); M2.push(model.M[t]);
        if (kindOf.has(t)) K2.set(nt, [kindOf.get(t), mountIx.get(t)]);
        if (NOT_HERS.has(t)) X2.add(nt);
      };
      for (let t = 0; t < nf; t++) {
        const v = [T[t * 3], T[t * 3 + 1], T[t * 3 + 2]];
        const on = [0, 1, 2].map((k) => cut.has(key(v[k], v[(k + 1) % 3])));
        const n = on.filter(Boolean).length;
        if (!n) { put(t, ...v); continue; }
        let r = on.indexOf(true);
        if (n === 2 && !on[(r + 1) % 3]) r = (r + 2) % 3;
        const [a, b, c] = [v[r], v[(r + 1) % 3], v[(r + 2) % 3]];
        const ab = mid(a, b);
        if (n === 1) { put(t, a, ab, c); put(t, ab, b, c); } else if (n === 2) {
          const bc = mid(b, c);
          put(t, ab, b, bc); put(t, a, ab, bc); put(t, a, bc, c);
        } else {
          const bc = mid(b, c), ca = mid(c, a);
          put(t, a, ab, ca); put(t, ab, b, bc); put(t, ca, bc, c); put(t, ab, bc, ca);
        }
        made += n;
      }
      model.T = T2; model.G = G2; model.L = L2; model.M = M2;
      remap(K2, X2);
    }
    rebuildKinds();
    console.log(`decks: cut to ${AMAX} m2 a face, ${made} edges halved, ${model.T.length / 3} triangles`);
  }

  // ---- her paint ---------------------------------------------------------------------
  const PAINTS = cfg.paints;
  const PAINT_IDS = Object.keys(PAINTS);
  const PI = Object.fromEntries(PAINT_IDS.map((k, i) => [k, i]));
  const nTri = model.T.length / 3;
  const lab = new Uint8Array(nTri);
  const faceInfo = (t) => {
    const P = model.P, a = model.T[t * 3] * 3, b = model.T[t * 3 + 1] * 3, c = model.T[t * 3 + 2] * 3;
    const cx = (P[a] + P[b] + P[c]) / 3, cy = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, cz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    return {
      cx, cy, cz, up: Math.abs(ny) > 0.75 * l, down: ny < -0.9 * l, shell: isShell(t), node: model.L[t], mat: model.M[t],
      kind: kindOf.get(t) || null, hull: HULL_PIECES.has(model.L[t]), half: hbAt(cz),
    };
  };
  for (let t = 0; t < nTri; t++) {
    const k = cfg.paint(faceInfo(t));
    if (!(k in PI)) throw new Error(`no paint ${k}`);
    lab[t] = PI[k];
  }
  const PAL = { lab, cent: PAINT_IDS.map((k) => hex(PAINTS[k])) };
  const PALETTE = PAL.cent.map((c) => c.map((v) => Math.round(toLin(v) * 255)));

  /** A mesh of the triangles `pick` picks, painted by palette index a triangle. */
  function subMeshOf(pick) {
    const map = new Map();
    const P = [], T = [], C = [], LF = [];
    for (let t = 0; t < nTri; t++) {
      if (!pick(t)) continue;
      for (let k = 0; k < 3; k++) {
        const v = model.T[t * 3 + k];
        let w = map.get(v);
        if (w === undefined) { w = P.length / 3; map.set(v, w); P.push(model.P[v * 3], model.P[v * 3 + 1], model.P[v * 3 + 2]); }
        T.push(w);
      }
      C.push(PAL.lab[t]);
      LF.push(model.L[t]);
    }
    return { P, T, C, LF };
  }

  // ---- welding, decimating, and her normals ---------------------------------------
  function weldPainted(m) {
    const at = new Map();
    const posId = (v) => {
      const key = `${Math.round(m.P[v * 3] * 2000)},${Math.round(m.P[v * 3 + 1] * 2000)},${Math.round(m.P[v * 3 + 2] * 2000)}`;
      let id = at.get(key);
      if (id === undefined) { id = at.size; at.set(key, id); }
      return id;
    };
    const nf = m.T.length / 3;
    const ids = new Int32Array(m.T.length);
    for (let i = 0; i < m.T.length; i++) ids[i] = posId(m.T[i]);
    const seen = new Map();
    const keep = new Uint8Array(nf), two = m.S0 ? Uint8Array.from(m.S0) : new Uint8Array(nf);
    const upness = (t) => {
      const [x, y, z] = faceNormal(m, m.T[t * 3], m.T[t * 3 + 1], m.T[t * 3 + 2]);
      return y / (Math.hypot(x, y, z) || 1);
    };
    for (let t = 0; t < nf; t++) {
      const a = ids[t * 3], b = ids[t * 3 + 1], c = ids[t * 3 + 2];
      if (a === b || b === c || a === c) continue;
      const key = [a, b, c].sort((x, y) => x - y).join(',');
      const was = seen.get(key);
      if (was !== undefined) {
        const better = upness(t) > upness(was) + 0.01
          || (Math.abs(upness(t) - upness(was)) <= 0.01 && m.turned && m.turned[was] && !m.turned[t]);
        if (better) { keep[was] = 0; keep[t] = 1; two[t] = 1; seen.set(key, t); } else two[was] = 1;
        continue;
      }
      seen.set(key, t);
      keep[t] = 1;
    }
    const map = new Map();
    const P = [], paint = [], T = [];
    for (let t = 0; t < nf; t++) {
      if (!keep[t]) continue;
      const pk = m.C[t] * 2 + two[t];
      for (let k = 0; k < 3; k++) {
        const v = m.T[t * 3 + k];
        const key = ids[t * 3 + k] * 128 + pk;
        let w = map.get(key);
        if (w === undefined) { w = P.length / 3; map.set(key, w); P.push(m.P[v * 3], m.P[v * 3 + 1], m.P[v * 3 + 2]); paint.push(pk); }
        T.push(w);
      }
    }
    return { P, N: new Array(P.length).fill(0), T, paint };
  }
  function reduce(m, target, error, flags = [], pinned = null) {
    const w = weldPainted(m);
    // Her model exactly as drawn: nothing thinned out of it unless a ship asks.
    const ratio = cfg.decimate ? Math.min(1, target / (w.T.length / 3)) : 1;
    let lock = null;
    if (pinned) {
      lock = new Uint8Array(w.P.length / 3);
      for (let v = 0; v < lock.length; v++) lock[v] = pinned(w.P[v * 3], w.P[v * 3 + 1], w.P[v * 3 + 2]) ? 1 : 0;
    }
    const d = ratio < 1 ? decimateWith(MeshoptSimplifier, w, ratio, error, 0, flags, lock) : w;
    const C = [], S = [];
    for (let t = 0; t < d.T.length / 3; t++) { const pk = d.paint[d.T[t * 3]]; C.push(pk >> 1); S.push(pk & 1); }
    return { P: d.P, T: d.T, C, S };
  }
  function creaseNormals(m, deg = 38) {
    const { P, T, C } = m;
    const nf = T.length / 3;
    const fn = new Float32Array(nf * 3);
    for (let t = 0; t < nf; t++) {
      const [x, y, z] = faceNormal(m, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
      fn[t * 3] = x; fn[t * 3 + 1] = y; fn[t * 3 + 2] = z;
    }
    const cos = Math.cos((deg * Math.PI) / 180);
    const unit = (t) => { const l = Math.hypot(fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2]) || 1; return [fn[t * 3] / l, fn[t * 3 + 1] / l, fn[t * 3 + 2] / l]; };
    const round = new Map();
    for (let t = 0; t < nf; t++) for (let k = 0; k < 3; k++) {
      const v = T[t * 3 + k];
      if (!round.has(v)) round.set(v, []);
      round.get(v).push(t);
    }
    const P2 = [], N2 = [], T2 = new Array(T.length), keyOf = new Map();
    for (let t = 0; t < nf; t++) {
      const ut = unit(t);
      for (let k = 0; k < 3; k++) {
        const v = T[t * 3 + k];
        let nx = 0, ny = 0, nz = 0;
        for (const u of round.get(v)) {
          if (C[u] !== C[t]) continue;
          const uu = unit(u);
          if (uu[0] * ut[0] + uu[1] * ut[1] + uu[2] * ut[2] < cos) continue;
          nx += fn[u * 3]; ny += fn[u * 3 + 1]; nz += fn[u * 3 + 2];
        }
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        const key = `${v},${C[t]},${Math.round(nx * 40)},${Math.round(ny * 40)},${Math.round(nz * 40)}`;
        let w = keyOf.get(key);
        if (w === undefined) { w = P2.length / 3; keyOf.set(key, w); P2.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); N2.push(nx, ny, nz); }
        T2[t * 3 + k] = w;
      }
    }
    return { P: P2, N: N2, T: T2, C, S: m.S };
  }

  // ---- her hull --------------------------------------------------------------------
  const hullRaw = subMeshOf((t) => !kindOf.has(t) && !NOT_HERS.has(t) && model.L[t] !== WIRE);
  const wires = creaseNormals(reduce(subMeshOf((t) => !kindOf.has(t) && !NOT_HERS.has(t) && model.L[t] === WIRE), Infinity, 0));
  console.log('hull:', hullRaw.T.length / 3, 'triangles before decimation');
  hullRaw.S0 = orient(hullRaw);
  {
    // Her decks, every one of them looking up.
    let flipped = 0;
    const deckKeys = new Set((cfg.deckPaints || ['deck']).map((k) => PI[k]).filter((v) => v !== undefined));
    for (let t = 0; t < hullRaw.T.length / 3; t++) {
      const c = hullRaw.C[t];
      if (!deckKeys.has(c)) continue;
      const y = faceNormal(hullRaw, hullRaw.T[t * 3], hullRaw.T[t * 3 + 1], hullRaw.T[t * 3 + 2])[1];
      // A deck wound the wrong way round, so it looks down at her hold --
      // the model's own winding, or a deck under a boat or a gun that no
      // look from outside could see: turned to look up, as the deck it is.
      // She is drawn from both sides, so nothing goes missing by it.
      if (y < 0) {
        const a = hullRaw.T[t * 3 + 1];
        hullRaw.T[t * 3 + 1] = hullRaw.T[t * 3 + 2]; hullRaw.T[t * 3 + 2] = a;
        flipped++;
      }
    }
    console.log(`decks: ${flipped} wound upside down turned over`);
  }
  let hull = creaseNormals(reduce(hullRaw, cfg.hullTris || 60000, cfg.hullError || 0.002, ['Prune'],
    (x, y) => PAINT_LINES.some((l) => Math.abs(y - l) < 1e-3)));
  console.log('hull:', hull.T.length / 3, 'triangles,', hull.P.length / 3, 'points');

  // Her underwater body cut across every two metres, so the damage board finds her.
  {
    const STEP = 2;
    let cuts = 0;
    for (let c = -Math.floor(LOA / 2 / STEP) * STEP; c < LOA / 2; c += STEP) {
      const { P, N, T, C, S } = hull;
      const made = new Map();
      const cross = (a, b) => {
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        if (made.has(key)) return made.get(key);
        const s = (c - P[a * 3 + 2]) / (P[b * 3 + 2] - P[a * 3 + 2]);
        const w = P.length / 3;
        P.push(P[a * 3] + (P[b * 3] - P[a * 3]) * s, P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * s, c);
        const n = [0, 1, 2].map((k) => N[a * 3 + k] + (N[b * 3 + k] - N[a * 3 + k]) * s);
        const l = Math.hypot(...n) || 1;
        N.push(n[0] / l, n[1] / l, n[2] / l);
        made.set(key, w);
        return w;
      };
      const T2 = [], C2 = [], S2 = [];
      for (let t = 0; t < T.length / 3; t++) {
        const v = [T[t * 3], T[t * 3 + 1], T[t * 3 + 2]];
        const sd = v.map((i) => Math.sign(P[i * 3 + 2] - c));
        const low = v.some((i) => P[i * 3 + 1] < 0.5);
        if (!low || !(sd.includes(1) && sd.includes(-1))) { T2.push(...v); C2.push(C[t]); S2.push(S[t]); continue; }
        cuts++;
        const fore = [], aft = [];
        for (let k = 0; k < 3; k++) {
          const a = v[k], b = v[(k + 1) % 3];
          if (sd[k] >= 0) fore.push(a);
          if (sd[k] <= 0) aft.push(a);
          if (sd[k] * sd[(k + 1) % 3] < 0) { const w = cross(a, b); fore.push(w); aft.push(w); }
        }
        for (const poly of [fore, aft]) for (let k = 1; k + 1 < poly.length; k++) { T2.push(poly[0], poly[k], poly[k + 1]); C2.push(C[t]); S2.push(S[t]); }
      }
      hull = { P, N, T: T2, C: C2, S: S2 };
    }
    console.log(`stations: ${cuts} triangles of her underwater body cut every ${STEP} m`);
  }
  // Sealed: what the decimator kept on one side and not the other is copied
  // across, and every face seen from behind from outside is drawn from both sides.
  {
    // Nothing copied across her centreline: an island, a crane or a boat on
    // one side only stays on that side, as her model has it.
    const m = cfg.mirror ? mirrorSides(hull, { loa: LOA, y0: -DRAUGHT - 3, y1: 70 }) : { copied: 0 };
    const s = sealFromOutside(hull);
    console.log(`sealed: ${m.copied} faces copied across her centreline, ${s.made} drawn from both sides`);
  }
  const deckKeys = new Set((cfg.deckPaints || ['deck']).map((k) => PI[k]).filter((v) => v !== undefined));
  const surfaceOf = (t) => {
    const [x, y, z] = faceNormal(hull, hull.T[t * 3], hull.T[t * 3 + 1], hull.T[t * 3 + 2]);
    // Whatever is painted deck is drawn as deck: the paint and the surface agree.
    if (y > 0.3 * Math.hypot(x, y, z) && deckKeys.has(hull.C[t])) return 1;
    return hull.S[t] ? 2 : 0;
  };
  // Her surface, as a height map.
  let hx = 0;
  for (let i = 0; i < hull.P.length; i += 3) hx = Math.max(hx, Math.abs(hull.P[i]));
  const HM = { x0: -Math.ceil(hx + 1), z0: -Math.ceil(LOA / 2 + 2), step: 0.5 };
  HM.nx = Math.ceil((-HM.x0 * 2) / HM.step) + 1;
  HM.nz = Math.ceil((-HM.z0 * 2) / HM.step) + 1;
  const hm = heightmap(hull, HM);
  if (DECK) {
    // With her runway on it: what stands on her flight deck stands on that.
    for (let jz = 0; jz < HM.nz; jz++) {
      const z = HM.z0 + jz * HM.step;
      if (z < DECK.flat.aft || z > DECK.flat.fwd) continue;
      const k = Math.round((z - DECK.z0) / DECK.dz);
      for (let i = 0; i < HM.nx; i++) {
        const x = HM.x0 + i * HM.step;
        const out = x > 0 ? DECK.port[k] : DECK.stbd[k];
        if (out > 0 && Math.abs(x) <= out) hm[jz * HM.nx + i] = Math.max(hm[jz * HM.nx + i], DECK.y);
      }
    }
  }
  // Her lines.
  const DECK_FALL = cfg.deckFallback ?? DRAUGHT * 1.6;
  const st = stations(hull, { length: LOA, beamCap: Math.min(3.0, DECK_FALL * 0.5), edgeCap: DECK_FALL, slice: true, beamFloor: -(DRAUGHT - 0.4) });
  const y0 = -Math.ceil(DRAUGHT + 1);
  const LINES = measureLines(hull, st, { z0: -Math.ceil(LOA / 2 + 1), dz: 1, nz: Math.ceil(LOA) + 4, y0, dy: 0.5, ny: Math.ceil((DECK_FALL + 14 - y0) / 0.5), deckMin: cfg.deckMin ?? 2.0 }, DECK_FALL);
  {
    const { keel, half, ny } = LINES;
    let mended = 0;
    for (let k = 1; k + 1 < keel.length; k++) {
      const a = keel[k - 1], b = keel[k + 1];
      if (keel[k] < Math.max(a, b) + 3 || a > 0 || b > 0) continue;
      keel[k] = +((a + b) / 2).toFixed(2);
      for (let jj = 0; jj < ny; jj++) half[k * ny + jj] = +((half[(k - 1) * ny + jj] + half[(k + 1) * ny + jj]) / 2).toFixed(2);
      mended++;
    }
    const { deck } = LINES;
    for (let k = 1; k + 1 < deck.length; k++) {
      if (!(deck[k] < deck[k - 1] - 1.5)) continue;
      let e = k;
      while (e < deck.length && deck[e] < deck[k - 1] - 1.5) e++;
      if (e >= deck.length || e - k > 16 || deck[e] < deck[k - 1] - 0.5) continue;
      for (let q = k; q < e; q++) { deck[q] = +(deck[k - 1] + ((deck[e] - deck[k - 1]) * (q - k + 1)) / (e - k + 1)).toFixed(2); mended++; }
      k = e;
    }
    console.log(`lines: ${mended} stations mended`);
  }
  if (DECK) {
    // How far out her plating actually is up the height of her hangar: at
    // every metre of her length and every half metre of height, the least of
    // the outermost crossings of her shell to port and to starboard.
    const Z0 = -Math.ceil(LOA / 2), NZ = Math.ceil(LOA) + 1, Y0 = 1, DY = 0.5, NY = Math.ceil((DECK.y - 1) / DY);
    const byZ = Array.from({ length: NZ }, () => []);
    const { P, T } = hull;
    for (let t = 0; t < T.length; t += 3) {
      const zs = [P[T[t] * 3 + 2], P[T[t + 1] * 3 + 2], P[T[t + 2] * 3 + 2]];
      const k0 = Math.max(0, Math.ceil(Math.min(...zs) - Z0)), k1 = Math.min(NZ - 1, Math.floor(Math.max(...zs) - Z0));
      for (let k = k0; k <= k1; k++) byZ[k].push(t);
    }
    const span = (k, y) => {
      const z = Z0 + k;
      let lo = Infinity, hi = -Infinity;
      for (const t of byZ[k]) {
        const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
        const d = (P[b + 2] - P[c + 2]) * (P[a + 1] - P[c + 1]) + (P[c + 1] - P[b + 1]) * (P[a + 2] - P[c + 2]);
        if (Math.abs(d) < 1e-9) continue;
        const l1 = ((P[b + 2] - P[c + 2]) * (y - P[c + 1]) + (P[c + 1] - P[b + 1]) * (z - P[c + 2])) / d;
        const l2 = ((P[c + 2] - P[a + 2]) * (y - P[c + 1]) + (P[a + 1] - P[c + 1]) * (z - P[c + 2])) / d;
        if (l1 < 0 || l2 < 0 || l1 + l2 > 1) continue;
        const x = P[a] * l1 + P[b] * l2 + P[c] * (1 - l1 - l2);
        lo = Math.min(lo, x); hi = Math.max(hi, x);
      }
      return hi < lo ? 0 : Math.max(0, Math.min(hi, -lo));
    };
    const w = [];
    for (let k = 0; k < NZ; k++) for (let jy = 0; jy < NY; jy++) w.push(+span(k, Y0 + jy * DY).toFixed(2));
    LINES.inner = { z0: Z0, dz: 1, nz: NZ, y0: Y0, dy: DY, ny: NY, w };
  }
  {
    // Her rigging back on her, drawn from both sides, now her decks are measured.
    const base = hull.P.length / 3;
    hull.P.push(...wires.P); hull.N.push(...wires.N);
    for (const v of wires.T) hull.T.push(v + base);
    for (const c of wires.C) { hull.C.push(c); hull.S.push(1); }
  }
  const col = new Uint8Array(hull.P.length / 3 * 3);
  for (let t = 0; t < hull.T.length / 3; t++) for (let k = 0; k < 3; k++) col.set(PALETTE[hull.C[t]], hull.T[t * 3 + k] * 3);
  const uv = new Float32Array(hull.P.length / 3 * 2);
  const packed = pack(hull, col, uv, { buckets: cfg.buckets || 40, length: LOA, surfaceOf, kinds: 3, compact: true });
  console.log('packed hull', packed.blob.length, 'bytes in', packed.buckets, 'slices');

  // ---- her guns --------------------------------------------------------------------
  function groupMesh(set) {
    const m = subMeshOf((t) => set.has(t));
    const key = (v) => `${Math.round(m.P[v * 3] * 1000)},${Math.round(m.P[v * 3 + 1] * 1000)},${Math.round(m.P[v * 3 + 2] * 1000)}`;
    const id = new Map();
    const up = [];
    const find = (a) => { while (up[a] !== a) { up[a] = up[up[a]]; a = up[a]; } return a; };
    const node = (v) => { const k = key(v); let i = id.get(k); if (i === undefined) { i = up.length; id.set(k, i); up.push(i); } return i; };
    const nf = m.T.length / 3;
    const first = new Int32Array(nf);
    for (let t = 0; t < nf; t++) {
      const a = node(m.T[t * 3]), b = node(m.T[t * 3 + 1]), c = node(m.T[t * 3 + 2]);
      up[find(b)] = find(a); up[find(c)] = find(a);
      first[t] = a;
    }
    m.LF = [...first].map((a) => find(a));
    return m;
  }
  /** Where a mounting stands and which way it faces (see prepare-brooklyn-hull.mjs). */
  function seatOf(m, spec = {}) {
    // Its foot: the lowest of it, past the odd bolt or plate that hangs under
    // the rest -- the height three in a hundred of its points are under.
    const ys = [];
    for (let i = 1; i < m.P.length; i += 3) ys.push(m.P[i]);
    ys.sort((a, b) => a - b);
    const y0 = ys[Math.floor(ys.length * (spec.footAt ?? 0.03))];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const foot = spec.foot ?? 0.5;
    for (let i = 0; i < m.P.length; i += 3) {
      // Or, for a gunhouse standing on a plinth that is not under its middle,
    // the band of its walls (`footBand`, metres over its foot).
    const band = spec.footBand || [-0.3, foot];
    if (m.P[i + 1] > y0 + band[1] || m.P[i + 1] < y0 + band[0]) continue;
      x0 = Math.min(x0, m.P[i]); x1 = Math.max(x1, m.P[i]); z0 = Math.min(z0, m.P[i + 2]); z1 = Math.max(z1, m.P[i + 2]);
    }
    let x = (x0 + x1) / 2, z = (z0 + z1) / 2;
    // Or where the ship's description puts it, [x, z]: the centre of a
    // barbette the model hides under a gunhouse that overhangs it.
    if (Array.isArray(spec.pivot)) [x, z] = spec.pivot;
    if (spec.pivot === 'box') {
      let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
      for (let i = 0; i < m.P.length; i += 3) { a = Math.min(a, m.P[i]); b = Math.max(b, m.P[i]); c = Math.min(c, m.P[i + 2]); d = Math.max(d, m.P[i + 2]); }
      x = (a + b) / 2; z = (c + d) / 2;
    }
    let dx = 0, dz = 0;
    let far = 0;
    for (let i = 0; i < m.P.length; i += 3) far = Math.max(far, Math.hypot(m.P[i] - x, m.P[i + 2] - z));
    for (let i = 0; i < m.P.length; i += 3) {
      if (Math.hypot(m.P[i] - x, m.P[i + 2] - z) < far * 0.85) continue;
      dx += m.P[i] - x; dz += m.P[i + 2] - z;
    }
    let rest = Math.atan2(dx, dz);
    // A mounting laid fore and aft, as most are: put square on her line.
    if (spec.square) rest = Math.round(rest / (Math.PI / 2)) * (Math.PI / 2);
    if (spec.rest === 'axis') {
      // A bank of tubes trained as the model has it: along the long way of
      // it, the way of the two that is nearer her bow.
      let sxx = 0, szz = 0, sxz = 0, n = 0, mx = 0, mz = 0;
      for (let i = 0; i < m.P.length; i += 3) { mx += m.P[i]; mz += m.P[i + 2]; n++; }
      mx /= n; mz /= n;
      for (let i = 0; i < m.P.length; i += 3) {
        const dx = m.P[i] - mx, dz = m.P[i + 2] - mz;
        sxx += dx * dx; szz += dz * dz; sxz += dx * dz;
      }
      const th = 0.5 * Math.atan2(2 * sxz, szz - sxx);
      rest = Math.abs(th) <= Math.PI / 2 ? th : th - Math.sign(th) * Math.PI;
      if (spec.flipAxis && spec.flipAxis(x, z)) rest += rest > 0 ? -Math.PI : Math.PI;
    } else if (spec.rest !== undefined) rest = spec.rest;
    return { x, z, y: y0, rest };
  }
  function toMount(m, s) {
    const c = Math.cos(-s.rest), sn = Math.sin(-s.rest);
    const P = m.P.slice();
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i] - s.x, z = P[i + 2] - s.z;
      P[i] = x * c + z * sn;
      P[i + 1] -= s.y;
      P[i + 2] = -x * sn + z * c;
    }
    return { ...m, P };
  }
  function splitBarrels(m, guns, minLen, test = null) {
    let wide = 0;
    for (let i = 0; i < m.P.length; i += 3) wide = Math.max(wide, Math.abs(m.P[i]));
    let zMax = -Infinity, zMin = Infinity;
    for (let i = 2; i < m.P.length; i += 3) { zMax = Math.max(zMax, m.P[i]); zMin = Math.min(zMin, m.P[i]); }
    let face = zMin;
    for (let z = zMin; z < zMax; z += 0.1) {
      let w = 0;
      for (let i = 0; i < m.P.length; i += 3) if (Math.abs(m.P[i + 2] - z) < 0.06) w = Math.max(w, Math.abs(m.P[i]));
      if (w > wide * 0.6) face = z;
    }
    const pieces = new Map();
    for (let t = 0; t < m.T.length / 3; t++) {
      const lf = m.LF[t];
      if (!pieces.has(lf)) pieces.set(lf, []);
      pieces.get(lf).push(t);
    }
    const isBarrel = new Uint8Array(m.T.length / 3);
    for (const tris of pieces.values()) {
      let px0 = Infinity, px1 = -Infinity, pz0 = Infinity, pz1 = -Infinity, py0 = Infinity, py1 = -Infinity;
      for (const t of tris) for (let k = 0; k < 3; k++) {
        const v = m.T[t * 3 + k];
        px0 = Math.min(px0, m.P[v * 3]); px1 = Math.max(px1, m.P[v * 3]);
        py0 = Math.min(py0, m.P[v * 3 + 1]); py1 = Math.max(py1, m.P[v * 3 + 1]);
        pz0 = Math.min(pz0, m.P[v * 3 + 2]); pz1 = Math.max(pz1, m.P[v * 3 + 2]);
      }
      const narrow = px1 - px0 < Math.max(0.9, (wide * 2) / guns * 0.6);
      const along = pz1 - pz0 > (py1 - py0) * 1.5;
      if (process.env.PARTS && (process.env.PARTS === "1" || process.env.PARTS === CUR_KIND)) console.log(`  part ${tris.length}t x ${px0.toFixed(2)}..${px1.toFixed(2)} y ${py0.toFixed(2)}..${py1.toFixed(2)} z ${pz0.toFixed(2)}..${pz1.toFixed(2)} (face ${face.toFixed(2)})`);
      const is = test ? test({ px0, px1, py0, py1, pz0, pz1, face })
        : narrow && along && pz1 - pz0 > 0.8 && py1 - py0 < 1.2 && (pz1 > face + minLen || pz0 > face - 0.05);
      if (is) for (const t of tris) isBarrel[t] = 1;
    }
    const part = (want) => {
      const map = new Map();
      const P = [], T = [], C = [];
      for (let t = 0; t < m.T.length / 3; t++) {
        if (isBarrel[t] !== want) continue;
        for (let k = 0; k < 3; k++) {
          const v = m.T[t * 3 + k];
          let w = map.get(v);
          if (w === undefined) { w = P.length / 3; map.set(v, w); P.push(m.P[v * 3], m.P[v * 3 + 1], m.P[v * 3 + 2]); }
          T.push(w);
        }
        C.push(m.C[t]);
      }
      return { P, T, C };
    };
    return { house: part(0), barrels: part(1), face };
  }
  function boresOf(bar, guns, face) {
    const xs = [];
    for (let i = 0; i < bar.P.length; i += 3) if (bar.P[i + 2] > face + 0.5) xs.push(bar.P[i]);
    xs.sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < xs.length; i++) gaps.push([xs[i] - xs[i - 1], (xs[i] + xs[i - 1]) / 2]);
    const cuts = gaps.sort((a, b) => b[0] - a[0]).slice(0, guns - 1).map((g) => g[1]).sort((a, b) => a - b);
    const laneOf = (x) => cuts.filter((c) => x > c).length;
    const lanes = [...Array(guns)].map(() => ({ sz: 0, sy: 0, szz: 0, szy: 0, n: 0, sx: 0, tip: -Infinity }));
    for (let i = 0; i < bar.P.length; i += 3) {
      const x = bar.P[i], y = bar.P[i + 1], z = bar.P[i + 2];
      if (z < face + 0.3) continue;
      const l = lanes[laneOf(x)];
      l.sz += z; l.sy += y; l.szz += z * z; l.szy += z * y; l.n++; l.sx += x; l.tip = Math.max(l.tip, z);
    }
    if (lanes.some((l) => l.n < 3)) throw new Error(`a gun of ${guns} has a barrel with no points to it`);
    const fits = lanes.map((l) => {
      const den = l.n * l.szz - l.sz * l.sz;
      const slope = Math.abs(den) > 1e-9 ? (l.n * l.szy - l.sz * l.sy) / den : 0;
      const icpt = (l.sy - slope * l.sz) / l.n;
      return { x: l.sx / l.n, slope, yAt: (z) => icpt + slope * z, tip: l.tip };
    });
    const slope = fits.reduce((s, f) => s + f.slope, 0) / guns;
    return { fits, pitch: Math.atan(slope) };
  }
  const DEBUG = {};
  const paintOf = (m) => {
    const byV = new Uint8Array(m.P.length / 3);
    for (let t = 0; t < m.T.length / 3; t++) for (let k = 0; k < 3; k++) byV[m.T[t * 3 + k]] = m.C[t];
    return (i) => PALETTE[byV[i]];
  };
  /** One of each kind, in the frame of its mounting (see prepare-brooklyn-hull.mjs). */
  let CUR_KIND = '';
  function gunKind(kind, spec) {
    CUR_KIND = kind;
    const { guns, minLen = 1.5, tris = 1400, barrelTris = 400, inside = 0.4, test = null, whole = false, tubes = 0, error = 0.003, template = 0 } = spec;
    const g0 = KINDS[kind][template];
    const raw = groupMesh(g0);
    const s = seatOf(raw, { ...spec, rest: (spec.rests && spec.rests[template] !== undefined) ? spec.rests[template] : spec.rest,
      pivot: spec.pivots ? spec.pivots[template] : spec.pivot });
    const local = toMount(raw, s);
    if (tubes) {
      const hd = creaseNormals(reduce(local, tris, 0.002));
      let zMax = -Infinity;
      for (let i = 2; i < local.P.length; i += 3) zMax = Math.max(zMax, local.P[i]);
      const pts = [];
      for (let i = 0; i < local.P.length; i += 3) if (local.P[i + 2] > zMax - 0.3) pts.push([local.P[i], local.P[i + 1]]);
      pts.sort((a, b) => a[0] - b[0]);
      const gaps = [];
      for (let i = 1; i < pts.length; i++) gaps.push([pts[i][0] - pts[i - 1][0], (pts[i][0] + pts[i - 1][0]) / 2]);
      const cuts = gaps.sort((a, b) => b[0] - a[0]).slice(0, tubes - 1).map((g) => g[1]).sort((a, b) => a - b);
      const lanes = [...Array(tubes)].map(() => ({ x: 0, y: 0, n: 0 }));
      for (const [x, y] of pts) { const l = lanes[cuts.filter((c) => x > c).length]; l.x += x; l.y += y; l.n++; }
      // Each tube's axis: its mouth, and the breech end of it, back along the bank.
      let zMin = Infinity;
      for (let i = 2; i < local.P.length; i += 3) zMin = Math.min(zMin, local.P[i]);
      let muzzles = lanes.map((l) => [+(l.x / Math.max(1, l.n)).toFixed(3), +(l.y / Math.max(1, l.n)).toFixed(3), +zMax.toFixed(3)]);
      {
        // Better, the tubes themselves: the runs of faces that hang together
        // and lie the long way of the bank, long and narrow, each one's
        // middle its lane and its fore end its mouth.
        const P = local.P, T = local.T;
        const up = [], id = new Map();
        const find = (a) => { while (up[a] !== a) { up[a] = up[up[a]]; a = up[a]; } return a; };
        const node = (v) => {
          const k = `${Math.round(P[v * 3] * 500)},${Math.round(P[v * 3 + 1] * 500)},${Math.round(P[v * 3 + 2] * 500)}`;
          let i = id.get(k);
          if (i === undefined) { i = up.length; id.set(k, i); up.push(i); }
          return i;
        };
        const first = [];
        for (let t = 0; t < T.length; t += 3) {
          const a = node(T[t]), b = node(T[t + 1]), c = node(T[t + 2]);
          up[find(b)] = find(a); up[find(c)] = find(a);
          first.push(a);
        }
        const runs = new Map();
        for (let t = 0; t < T.length / 3; t++) {
          const r = find(first[t]);
          let q = runs.get(r);
          if (!q) runs.set(r, q = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });
          for (let k = 0; k < 3; k++) {
            const v = T[t * 3 + k];
            for (let c = 0; c < 3; c++) { q.lo[c] = Math.min(q.lo[c], P[v * 3 + c]); q.hi[c] = Math.max(q.hi[c], P[v * 3 + c]); }
          }
        }
        const len = zMax - zMin;
        const long = [...runs.values()].filter((q) => q.hi[2] - q.lo[2] > Math.min(len * 0.45, 3.0) && q.hi[0] - q.lo[0] < 1.0 && q.hi[1] - q.lo[1] < 1.0)
          .sort((a, b) => (b.hi[2] - b.lo[2]) - (a.hi[2] - a.lo[2]));
        // One to a lane: the longest at each place across the bank.
        const picked = [];
        for (const q of long) {
          const x = (q.lo[0] + q.hi[0]) / 2;
          if (picked.every((o) => Math.abs((o.lo[0] + o.hi[0]) / 2 - x) > 0.3)) picked.push(q);
          if (picked.length === tubes) break;
        }
        if (picked.length === tubes) {
          const mouth = Math.max(...picked.map((q) => q.hi[2]));
          muzzles = picked.map((q) => [+((q.lo[0] + q.hi[0]) / 2).toFixed(3), +((q.lo[1] + q.hi[1]) / 2).toFixed(3), +mouth.toFixed(3)])
            .sort((a, b) => a[0] - b[0]);
        } else console.log(`${kind}: ${picked.length} of ${tubes} tubes found as runs of their own; mouths from the fore end`);
      }
      let roof = 0;
      for (let i = 1; i < hd.P.length; i += 3) roof = Math.max(roof, hd.P[i]);
      console.log(`${kind}: bank of ${tubes}, ${hd.T.length / 3} triangles, mouths ${muzzles.map((m) => m.join(',')).join(' ')}, breech ${zMin.toFixed(2)}`);
      DEBUG[kind] = { hd, bd: { P: [], N: [], T: [], C: [] }, trunnion: [0, 0, 0], pitch: 0 };
      return {
        house: packPieceCompact(hd, paintOf(hd)).toString('base64'), guns: null,
        trunnion: [0, 0, 0], muzzles, pitch: 0, roof: +roof.toFixed(3), breech: +zMin.toFixed(3),
      };
    }
    if (whole) {
      const hd = creaseNormals(reduce(local, tris, error, spec.flags || []));
      let roof = 0, tip = null, far = -1;
      for (let i = 0; i < hd.P.length; i += 3) {
        roof = Math.max(roof, hd.P[i + 1]);
        const d = Math.hypot(hd.P[i + 1], hd.P[i + 2]);
        if (hd.P[i + 2] > 0 && d > far) { far = d; tip = [0, hd.P[i + 1], hd.P[i + 2]]; }
      }
      if (!tip) tip = [0, roof * 0.6, 0.5];
      const trunnion = [0, +(roof * 0.55).toFixed(3), 0];
      const muzzles = [[0, +(tip[1] - trunnion[1]).toFixed(3), +tip[2].toFixed(3)]];
      console.log(`${kind}: whole, ${hd.T.length / 3} triangles, muzzle ${muzzles[0].join(',')}, roof ${roof.toFixed(2)}`);
      DEBUG[kind] = { hd, bd: { P: [], N: [], T: [], C: [] }, trunnion, pitch: 0 };
      return { house: packPieceCompact(hd, paintOf(hd)).toString('base64'), guns: null, trunnion, muzzles, pitch: 0, roof: +roof.toFixed(3) };
    }
    const sp = splitBarrels({ ...local, LF: raw.LF }, guns, minLen, test);
    const { house, barrels } = sp;
    const face = spec.face ?? sp.face;
    const { fits, pitch } = boresOf(barrels, guns, face);
    const tz = face - inside;
    const ty = fits.reduce((a, f) => a + f.yAt(tz), 0) / guns;
    const trunnion = [0, ty, tz];
    const c = Math.cos(pitch), sn = Math.sin(pitch);
    const level = (x, y, z) => { const dy = y - ty, dz = z - tz; return [x, dy * c - dz * sn, dy * sn + dz * c]; };
    const bp = barrels.P.slice();
    for (let i = 0; i < bp.length; i += 3) { const [x, y, z] = level(bp[i], bp[i + 1], bp[i + 2]); bp[i] = x; bp[i + 1] = y; bp[i + 2] = z; }
    const muzzles = fits.map((f) => level(f.x, f.yAt(f.tip), f.tip).map((v) => +v.toFixed(3)));
    const hd = creaseNormals(reduce(house, tris, 0.003));
    const bd = creaseNormals(reduce({ P: bp, T: barrels.T, C: barrels.C }, barrelTris, 0.002));
    let roof = 0;
    for (let i = 1; i < hd.P.length; i += 3) roof = Math.max(roof, hd.P[i]);
    console.log(`${kind}: house ${hd.T.length / 3} triangles, barrels ${bd.T.length / 3}; face ${face.toFixed(2)}, `
      + `trunnion ${trunnion.map((v) => v.toFixed(2)).join('/')}, stowed at ${(pitch * 180 / Math.PI).toFixed(1)} deg, `
      + `muzzles ${muzzles.map((m) => m.join(',')).join(' ')}, roof ${roof.toFixed(2)}`);
    DEBUG[kind] = { hd, bd, trunnion, pitch };
    return {
      house: packPieceCompact(hd, paintOf(hd)).toString('base64'),
      guns: packPieceCompact(bd, paintOf(bd)).toString('base64'),
      trunnion: trunnion.map((v) => +v.toFixed(3)), muzzles, pitch: +pitch.toFixed(4), roof: +roof.toFixed(3),
    };
  }
  const GUNS = {};
  for (const [kind, spec] of Object.entries(cfg.kinds || {})) {
    if (!spec.gun) continue;
    GUNS[kind] = gunKind(kind, spec.gun);
    // And every mounting of the kind as her model draws that one: no copy of
    // one of them stood in the place of another that differs from it.
    const tpl = spec.gun.template || 0;
    GUNS[kind].each = KINDS[kind].map((_, i) => {
      if (i === tpl) return null;
      try { return gunKind(kind, { ...spec.gun, template: i }); } catch (e) {
        console.log(`${kind} ${i}: drawn as mounting ${tpl} (${e.message})`);
        return null;
      }
    });
    CUR_KIND = kind;
  }
  function seats(kind) {
    const g0 = GUNS[kind];
    const spec = cfg.kinds[kind].gun;
    return KINDS[kind].map((gi, i) => {
      const s = seatOf(groupMesh(gi), { ...spec, rest: (spec.rests && spec.rests[i] !== undefined) ? spec.rests[i] : spec.rest,
        pivot: spec.pivots ? spec.pivots[i] : spec.pivot });
      const g = (g0.each && g0.each[i]) || g0;
      const c = Math.cos(g.pitch), sn = Math.sin(g.pitch);
      const out = g.muzzles.map(([x, y, z]) => {
        const yy = y * c + z * sn + g.trunnion[1], zz = -y * sn + z * c + g.trunnion[2];
        return [Math.hypot(x, zz), yy];
      });
      const reach = out.reduce((a, o) => a + o[0], 0) / out.length;
      const my = out.reduce((a, o) => a + o[1], 0) / out.length + s.y;
      return { x: +s.x.toFixed(3), z: +s.z.toFixed(3), y: +s.y.toFixed(3), rest: +s.rest.toFixed(4), reach: +reach.toFixed(2), my: +my.toFixed(2) };
    });
  }
  const MOUNTS = Object.fromEntries(Object.keys(GUNS).map((k) => [k, seats(k)]));
  for (const [k, list] of Object.entries(MOUNTS)) {
    console.log(k, list.map((s) => `(${s.x}, ${s.z}) y ${s.y} rest ${(s.rest * 180 / Math.PI).toFixed(0)} reach ${s.reach} my ${s.my}`).join('\n   '));
  }
  // ---- her screws --------------------------------------------------------------------
  const SCREWS = (KINDS.screw || []).map((gi) => {
    const raw = groupMesh(gi);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < raw.P.length; i += 3) {
      x0 = Math.min(x0, raw.P[i]); x1 = Math.max(x1, raw.P[i]);
      y0 = Math.min(y0, raw.P[i + 1]); y1 = Math.max(y1, raw.P[i + 1]);
      z0 = Math.min(z0, raw.P[i + 2]); z1 = Math.max(z1, raw.P[i + 2]);
    }
    const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const P = raw.P.slice();
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) P[i + k] -= c[k];
    const m = creaseNormals(reduce({ P, T: raw.T, C: raw.C }, 400, 0.001));
    return {
      x: +c[0].toFixed(3), y: +c[1].toFixed(3), z: +c[2].toFixed(3), r: +(Math.max(x1 - x0, y1 - y0) / 2).toFixed(2),
      piece: packPieceCompact(m, paintOf(m)).toString('base64'),
    };
  });
  console.log('screws:', SCREWS.map((s) => `(${s.x}, ${s.y}, ${s.z}) r ${s.r}`).join(' '));

  // ---- a look at her, whole ----------------------------------------------------------
  if (process.env.DUMPBIN) {
    // DUMPBIN=prefix: her hull before and after its finishing, as raw points and triangles.
    const bin = (m, f) => {
      const P = Float32Array.from(m.P), T = Uint32Array.from(m.T);
      writeFileSync(f, Buffer.concat([Buffer.from(new Uint32Array([P.length, T.length]).buffer), Buffer.from(P.buffer), Buffer.from(T.buffer)]));
    };
    bin(hullRaw, `${process.env.DUMPBIN}-raw.bin`);
    bin(model, `${process.env.DUMPBIN}-all.bin`);
    bin(hull, `${process.env.DUMPBIN}-hull.bin`);
  }
  if (process.env.DUMP) dumpGlb(process.env.DUMP, hull, MOUNTS, DEBUG, PALETTE);

  // ---- write --------------------------------------------------------------------------
  writeFileSync(OUT_DATA,
    `// Generated by ${cfg.script} from the owner's model,\n`
    + `// ${cfg.credit}.\n`
    + `// Do not hand-edit -- regenerate from the source assets instead.\n`
    + `export const HULL_B64 = ${JSON.stringify(packed.blob.toString('base64'))};\n`
    + `// Her surface height, in centimetres, every ${HM.step} m.\n`
    + `export const SURFACE = ${JSON.stringify({ ...HM, b64: heightBytes(hm).toString('base64') })};\n`
    + `// One of each of her mountings as the model drew it, each in the frame of its own\n`
    + `// mounting: what trains, and the barrels about their trunnions.\n`
    + `export const GUNS = ${JSON.stringify(GUNS)};\n`
    + `// Where every one of her mountings stands, which way it faces, and its\n`
    + `// muzzles' reach and height stowed.\n`
    + `export const MOUNTS = ${JSON.stringify(MOUNTS)};\n`
    + `// Her screws, each about its hub.\n`
    + `export const SCREWS = ${JSON.stringify(SCREWS)};\n`
    + `// What the model draws that is built afresh -- catapults, lifts -- where it stood.\n`
    + `export const MEASURED = ${JSON.stringify(MEASURED)};\n`
    + `// Her lines as the model has them: keel, the deck over her insides, and\n`
    + `// her half-breadth at every half metre of height, a metre at a time.\n`
    + `export const LINES = ${JSON.stringify(LINES)};\n`
    + `// Her flight deck, a carrier's: its height and its outline (see carrier.js).\n`
    + `export const DECK = ${JSON.stringify(DECK)};\n`
    + `export const ISLAND = ${JSON.stringify(cfg.carrier ? cfg.carrier.island : null)};\n`
    + `export const EXTRA = ${JSON.stringify(cfg.extra || {})};\n`);
  console.log('wrote', path.relative(ROOT, OUT_DATA), `${(readFileSync(OUT_DATA).length / 1e6).toFixed(2)} MB`);
}

// ---- which way her faces face (see prepare-brooklyn-hull.mjs) ---------------------
function orient(m, cell = 0.4) {
  const { P, T } = m;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], P[i + c]); hi[c] = Math.max(hi[c], P[i + c]); }
  for (let c = 0; c < 3; c++) { lo[c] -= 1; hi[c] += 1; }
  const n = [0, 1, 2].map((c) => Math.ceil((hi[c] - lo[c]) / cell));
  const nx0 = n[0], nxy = n[0] * n[1];
  const grid = new Uint8Array(n[0] * n[1] * n[2]);
  const nf = T.length / 3;
  for (let t = 0; t < nf; t++) {
    const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
    const len = Math.max(Math.hypot(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]),
      Math.hypot(P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]), Math.hypot(P[c] - P[b], P[c + 1] - P[b + 1], P[c + 2] - P[b + 2]));
    const steps = Math.max(1, Math.ceil(len / (cell * 0.5)));
    for (let p = 0; p <= steps; p++) {
      for (let q = 0; q <= steps - p; q++) {
        const u = p / steps, v = q / steps, w = 1 - u - v;
        const i = Math.floor((P[a] * w + P[b] * u + P[c] * v - lo[0]) / cell);
        const jj = Math.floor((P[a + 1] * w + P[b + 1] * u + P[c + 1] * v - lo[1]) / cell);
        const k = Math.floor((P[a + 2] * w + P[b + 2] * u + P[c + 2] * v - lo[2]) / cell);
        grid[k * nxy + jj * nx0 + i] = 1;
      }
    }
  }
  const clear = (x, y, z, dx, dy, dz) => {
    let i = Math.floor((x - lo[0]) / cell), jj = Math.floor((y - lo[1]) / cell), k = Math.floor((z - lo[2]) / cell);
    const si = dx > 0 ? 1 : -1, sj = dy > 0 ? 1 : -1, sk = dz > 0 ? 1 : -1;
    const ti = Math.abs(cell / (dx || 1e-12)), tj = Math.abs(cell / (dy || 1e-12)), tk = Math.abs(cell / (dz || 1e-12));
    let mi = ((dx > 0 ? (i + 1) * cell + lo[0] - x : x - (i * cell + lo[0]))) * ti / cell;
    let mj = ((dy > 0 ? (jj + 1) * cell + lo[1] - y : y - (jj * cell + lo[1]))) * tj / cell;
    let mk = ((dz > 0 ? (k + 1) * cell + lo[2] - z : z - (k * cell + lo[2]))) * tk / cell;
    for (;;) {
      if (i < 0 || jj < 0 || k < 0 || i >= n[0] || jj >= n[1] || k >= n[2]) return true;
      if (grid[k * nxy + jj * nx0 + i]) return false;
      if (mi < mj && mi < mk) { i += si; mi += ti; } else if (mj < mk) { jj += sj; mj += tj; } else { k += sk; mk += tk; }
    }
  };
  const DIRS = [];
  for (let q = 0; q < 26; q++) {
    const yy = 1 - (2 * (q + 0.5)) / 26, r = Math.sqrt(1 - yy * yy), th = q * 2.39996;
    const d = [Math.cos(th) * r, yy, Math.sin(th) * r];
    if (Math.abs(d[2]) < 0.8) DIRS.push(d);
  }
  const S0 = new Uint8Array(nf), turned = new Uint8Array(nf);
  let flipped = 0, sheets = 0;
  const lift = cell * 1.6;
  for (let t = 0; t < nf; t++) {
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
    let [fx, fy, fz] = faceNormal(m, a, b, c);
    const l = Math.hypot(fx, fy, fz);
    if (!(l > 1e-12)) continue;
    fx /= l; fy /= l; fz /= l;
    let front = 0, back = 0;
    for (const [wa, wb, wc] of [[1 / 3, 1 / 3, 1 / 3], [0.7, 0.15, 0.15], [0.15, 0.7, 0.15], [0.15, 0.15, 0.7]]) {
      const x = P[a * 3] * wa + P[b * 3] * wb + P[c * 3] * wc;
      const y = P[a * 3 + 1] * wa + P[b * 3 + 1] * wb + P[c * 3 + 1] * wc;
      const z = P[a * 3 + 2] * wa + P[b * 3 + 2] * wb + P[c * 3 + 2] * wc;
      for (const [dx, dy, dz] of DIRS) {
        const dot = dx * fx + dy * fy + dz * fz;
        if (Math.abs(dot) < 0.25) continue;
        const sgn = dot > 0 ? 1 : -1;
        if (clear(x + sgn * fx * lift + dx * lift, y + sgn * fy * lift + dy * lift, z + sgn * fz * lift + dz * lift, dx, dy, dz)) {
          if (sgn > 0) front++; else back++;
        }
      }
    }
    if (front >= 3 && back >= 3) { S0[t] = 1; sheets++; } else if (back > front) {
      T[t * 3 + 1] = c; T[t * 3 + 2] = b;
      turned[t] = 1;
      flipped++;
    }
  }
  console.log(`faces: ${flipped} turned to face out, ${sheets} seen from both sides`);
  m.turned = turned;
  return S0;
}

// ---- a plan and an elevation of her, with a metre grid -----------------------------
const KIND_COLOURS = [[220, 40, 40], [40, 160, 40], [40, 80, 230], [230, 150, 20], [170, 40, 200], [20, 190, 190], [120, 90, 40], [240, 90, 160]];
async function shoot(prefix, model, kindOf, notHers, LOA) {
  const sharp = require('sharp');
  const kinds = [...new Set(kindOf.values())];
  const Q = model.P;
  const qlo = [Infinity, Infinity, Infinity], qhi = [-Infinity, -Infinity, -Infinity];
  for (const v of model.T) for (let c = 0; c < 3; c++) { qlo[c] = Math.min(qlo[c], Q[v * 3 + c]); qhi[c] = Math.max(qhi[c], Q[v * 3 + c]); }
  const Z0 = +(process.env.SHOT_Z0 ?? qlo[2]), Z1 = +(process.env.SHOT_Z1 ?? qhi[2]);
  const px = +(process.env.SHOT_PX || Math.min(14, 2600 / (Z1 - Z0)));
  const view = async (name, ax, depth, flipY) => {
    const aLo = qlo[ax] - 1, aHi = qhi[ax] + 1;
    const W = Math.ceil((Z1 - Z0) * px) + 80, H = Math.ceil((aHi - aLo) * px) + 60;
    const buf = new Uint8Array(W * H * 3).fill(255), zb = new Float32Array(W * H).fill(-Infinity);
    for (let t = 0; t < model.T.length / 3; t++) {
      const v = [0, 1, 2].map((k) => model.T[t * 3 + k] * 3);
      const pts = v.map((i) => [40 + (Q[i + 2] - Z0) * px, 30 + (flipY ? (aHi - Q[i + ax]) : (Q[i + ax] - aLo)) * px, Q[i + depth] * (depth === 0 ? -1 : 1)]);
      const [a, b, c] = v;
      const ux = Q[b] - Q[a], uy = Q[b + 1] - Q[a + 1], uz = Q[b + 2] - Q[a + 2], vx = Q[c] - Q[a], vy = Q[c + 1] - Q[a + 1], vz = Q[c + 2] - Q[a + 2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; const l = Math.hypot(...n) || 1;
      const shade = 0.4 + 0.6 * Math.abs(n[depth] / l);
      const k = kindOf.get(t);
      let col;
      if (k) col = KIND_COLOURS[kinds.indexOf(k) % KIND_COLOURS.length].map((x) => Math.round(x * shade));
      else if (notHers.has(t)) col = [Math.round(250 * shade), Math.round(230 * shade), 0];
      else { const g = Math.round(200 * shade); col = [g, g, g + 15]; }
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
      const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
      const [p0, p1, p2] = pts;
      const d = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1]);
      if (Math.abs(d) < 1e-9) continue;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const w0 = ((p1[1] - p2[1]) * (x - p2[0]) + (p2[0] - p1[0]) * (y - p2[1])) / d;
        const w1 = ((p2[1] - p0[1]) * (x - p2[0]) + (p0[0] - p2[0]) * (y - p2[1])) / d;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
        const zz = w0 * p0[2] + w1 * p1[2] + w2 * p2[2] + (k ? 0.3 : 0);
        const kk = y * W + x;
        if (zz <= zb[kk]) continue;
        zb[kk] = zz; buf.set(col, kk * 3);
      }
    }
    let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
    const step = (Z1 - Z0) > 120 ? 5 : (Z1 - Z0) > 40 ? 2 : 1;
    for (let z = Math.ceil(Z0 / step) * step; z <= Z1; z += step) {
      const x = 40 + (z - Z0) * px;
      svg += `<line x1="${x}" y1="20" x2="${x}" y2="${H}" stroke="${z % (step * 2) ? '#0002' : '#0006'}" stroke-width="1"/>`;
      if (z % (step * 2) === 0) svg += `<text x="${x + 1}" y="14" font-size="11" font-family="sans-serif">${z}</text>`;
    }
    for (let a = Math.ceil(aLo); a <= aHi; a += 1) {
      const y = 30 + (flipY ? (aHi - a) : (a - aLo)) * px;
      svg += `<line x1="30" y1="${y}" x2="${W}" y2="${y}" stroke="${a ? (a % 2 ? '#0001' : '#0003') : '#f00a'}" stroke-width="1"/>`;
      if (a % 2 === 0) svg += `<text x="2" y="${y + 4}" font-size="10" font-family="sans-serif">${a}</text>`;
    }
    svg += `<text x="${W - 260}" y="${H - 6}" font-size="12" font-family="sans-serif">${kinds.map((k, i) => `${k}=${['red', 'green', 'blue', 'orange', 'purple', 'cyan', 'brown', 'pink'][i % 8]}`).join(' ')}</text></svg>`;
    await sharp(Buffer.from(buf), { raw: { width: W, height: H, channels: 3 } }).composite([{ input: Buffer.from(svg) }]).png().toFile(`${prefix}-${name}.png`);
  };
  await view('top', 0, 1, false);
  await view('side', 1, 0, true);
  console.log('shot', prefix);
  if (!process.env.SHOT_GO) process.exit(0);
}

function dumpGlb(file, hull, MOUNTS, DEBUG, PALETTE) {
  const P = [], N = [], C = [], T = [];
  const add = (m, place) => {
    const base = P.length / 3;
    const byV = new Uint8Array(m.P.length / 3);
    for (let t = 0; t < m.T.length / 3; t++) for (let k = 0; k < 3; k++) byV[m.T[t * 3 + k]] = m.C[t];
    for (let i = 0; i < m.P.length / 3; i++) {
      const [p, n] = place([m.P[i * 3], m.P[i * 3 + 1], m.P[i * 3 + 2]], [m.N[i * 3], m.N[i * 3 + 1], m.N[i * 3 + 2]]);
      P.push(...p); N.push(...n); C.push(...PALETTE[byV[i]].map((v) => v / 255));
    }
    for (const v of m.T) T.push(base + v);
  };
  add(hull, (p, n) => [p, n]);
  const rotY = (v, a) => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
  const rotX = (v, a) => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)];
  for (const [kind, list] of Object.entries(MOUNTS)) {
    const d = DEBUG[kind];
    for (const s of list) {
      const at = (v) => { const r = rotY(v, s.rest); return [r[0] + s.x, r[1] + s.y, r[2] + s.z]; };
      add(d.hd, (p, n) => [at(p), rotY(n, s.rest)]);
      add(d.bd, (p, n) => {
        const q = rotX(p, -d.pitch);
        return [at([q[0] + d.trunnion[0], q[1] + d.trunnion[1], q[2] + d.trunnion[2]]), rotY(rotX(n, -d.pitch), s.rest)];
      });
    }
  }
  const f32 = (a) => Buffer.from(Float32Array.from(a).buffer);
  const bufs = [f32(P), f32(N), f32(C), Buffer.from(Uint32Array.from(T).buffer)];
  let off = 0;
  const views = bufs.map((b, i) => { const v = { buffer: 0, byteOffset: off, byteLength: b.length, target: i < 3 ? 34962 : 34963 }; off += b.length; return v; });
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i++) { mn[i % 3] = Math.min(mn[i % 3], P[i]); mx[i % 3] = Math.max(mx[i % 3], P[i]); }
  const js = Buffer.from(JSON.stringify({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.8 }, doubleSided: true }],
    buffers: [{ byteLength: off }], bufferViews: views,
    accessors: [
      { bufferView: 0, componentType: 5126, count: P.length / 3, type: 'VEC3', min: mn, max: mx },
      { bufferView: 1, componentType: 5126, count: P.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: P.length / 3, type: 'VEC3' },
      { bufferView: 3, componentType: 5125, count: T.length, type: 'SCALAR' },
    ],
  }));
  const jsPad = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const body = Buffer.concat(bufs);
  const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jsPad.length + 8 + body.length, 8);
  const c1 = Buffer.alloc(8); c1.writeUInt32LE(jsPad.length, 0); c1.writeUInt32LE(0x4e4f534a, 4);
  const c2 = Buffer.alloc(8); c2.writeUInt32LE(body.length, 0); c2.writeUInt32LE(0x004e4942, 4);
  writeFileSync(file, Buffer.concat([head, c1, jsPad, c2, body]));
  console.log('dumped', file);
}
