// Monster One off the owner's model -- "Godzilla Minus One" by ArachnoBoy
// (https://sketchfab.com/3d-models/godzilla-minus-one-ccaf341a3e734263a88cecb5c49eac0e),
// under the Sketchfab Standard licence -- rigged so she can move.
//
// The model is a statue: five meshes standing in one pose, with no skeleton
// and nothing to animate. Everything the game does with her -- swimming with
// her plates out of the water, rearing up, swinging her tail, reaching for a
// ship, opening her jaw to fire -- needs a skeleton under her skin and every
// point of that skin told how much of each bone it follows. This builds both.
//
//   * The skeleton is laid down her by hand, off orthographic sections of the
//     model (hips, a spine of four, a neck of two, a skull and a jaw, a tail of
//     nine, two arms and two legs of three), in the model's own pose, each
//     bone square to the model so a turn about its X is a nod, about its Y a
//     swing to the side.
//
//   * Her skin -- one closed shell -- is weighted by distance measured over
//     the skin, not through the air: a point on her chest is a long way round
//     from her upper arm though it is a hand's breadth from it in space, and
//     her upper lip is a long way round from her lower one though the two
//     nearly touch. Weights measured through the air are what drag a chest out
//     with an arm and tear a lip open with the jaw; measured over the skin
//     they fall off where the body actually bends.
//
//   * The weights are then smoothed across the skin, so no point follows one
//     bone hard and its neighbour another: there is no crease anywhere a joint
//     bends.
//
//   * Everything that is not skin -- her teeth, her eyes, her tongue, her
//     claws and every one of the forty plates down her back -- is hard, and
//     moves with the skin it is rooted in as one piece, never bent.
//
// Out comes client/js/render/monsterOne.data.js: her meshes, in metres in the
// game's frame (+Z ahead, +Y up, her feet at y = 0), her bones, her weights,
// what the plates need to light up from the tail forward, and the model's own
// fourteen textures.
//
//   npm i --no-save sharp          (see build/sculpt-source.mjs)
//   SCULPT_TOOLS=<that node_modules> node build/prepare-monster.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(process.env.SCULPT_TOOLS ? path.join(process.env.SCULPT_TOOLS, 'index.js') : import.meta.url);
const sharp = require('sharp');

const SRC = 'assets/models/godzilla_minus_one.glb';
const OUT = 'client/js/render/monsterOne.data.js';
// She stands a hundred metres to the top of her plates. The film has her at
// fifty, which beside a battleship two hundred and sixty metres long is a
// creature that could not get its hands round a destroyer; at a hundred she
// can lift one.
const HEIGHT = 100;

// ------------------------------------------------------------ the model ---
const buf = readFileSync(SRC);
const jl = buf.readUInt32LE(12);
const J = JSON.parse(buf.subarray(20, 20 + jl).toString());
const BIN = buf.subarray(20 + jl + 8);

function accessor(i) {
  const a = J.accessors[i];
  const v = J.bufferViews[a.bufferView];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType];
  const stride = v.byteStride || n * size;
  const dv = new DataView(BIN.buffer, BIN.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0));
  const out = a.componentType === 5126 ? new Float32Array(a.count * n) : new Uint32Array(a.count * n);
  for (let k = 0; k < a.count; k++) {
    for (let c = 0; c < n; c++) {
      const o = k * stride + c * size;
      out[k * n + c] = a.componentType === 5126 ? dv.getFloat32(o, true)
        : a.componentType === 5125 ? dv.getUint32(o, true)
          : a.componentType === 5123 ? dv.getUint16(o, true) : dv.getUint8(o);
    }
  }
  return out;
}

const mul = (a, b) => {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
};
function compose(n) {
  if (n.matrix) return Float64Array.from(n.matrix);
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  return Float64Array.from([
    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]);
}

// Each mesh where it stands, in the model's units.
const placed = new Map();
(function walk(list, M) {
  for (const ni of list) {
    const n = J.nodes[ni];
    const W = mul(M, compose(n));
    if (n.mesh != null) placed.set(n.mesh, W);
    walk(n.children || [], W);
  }
})(J.scenes[0].nodes, Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));

const MESHES = J.meshes.map((m, mi) => {
  const p = m.primitives[0];
  const M = placed.get(mi);
  const P = accessor(p.attributes.POSITION);
  const N = accessor(p.attributes.NORMAL);
  const n = P.length / 3;
  const pos = new Float64Array(n * 3);
  const nrm = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    pos[i * 3] = M[0] * x + M[4] * y + M[8] * z + M[12];
    pos[i * 3 + 1] = M[1] * x + M[5] * y + M[9] * z + M[13];
    pos[i * 3 + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
    const a = N[i * 3], b = N[i * 3 + 1], c = N[i * 3 + 2];
    let nx = M[0] * a + M[4] * b + M[8] * c, ny = M[1] * a + M[5] * b + M[9] * c, nz = M[2] * a + M[6] * b + M[10] * c;
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm[i * 3] = nx / l; nrm[i * 3 + 1] = ny / l; nrm[i * 3 + 2] = nz / l;
  }
  return {
    name: ['skin', 'teeth', 'tongue', 'eyes', 'plates'][mi],
    material: p.material, n, pos, nrm,
    uv: accessor(p.attributes.TEXCOORD_0),
    tangent: p.attributes.TANGENT != null ? accessor(p.attributes.TANGENT) : null,
    index: accessor(p.indices),
  };
});
const [SKIN, TEETH, TONGUE, EYES, PLATES] = MESHES;

// The model's units to metres: her top is the top of her tallest plate.
let top = 0;
for (const m of MESHES) for (let i = 1; i < m.pos.length; i += 3) top = Math.max(top, m.pos[i]);
const SCALE = HEIGHT / top;

// ----------------------------------------------------------- the bones ---
// In the model's units, read off sections of her: x across (+x her left), y
// up from her soles, z ahead. `tail` is where a bone with no child ends.
const MIRROR = (b) => ({ ...b, name: b.name.replace('.L', '.R'), parent: b.parent.replace('.L', '.R'), at: [-b.at[0], b.at[1], b.at[2]], tail: b.tail && [-b.tail[0], b.tail[1], b.tail[2]] });
const LEFT = [
  { name: 'upperArm.L', parent: 'chest', at: [1.02, 3.82, 0.62] },
  { name: 'foreArm.L', parent: 'upperArm.L', at: [1.15, 3.2, 0.86] },
  { name: 'hand.L', parent: 'foreArm.L', at: [1.13, 3.2, 1.5], tail: [1.13, 3.05, 1.92] },
  { name: 'thigh.L', parent: 'hips', at: [0.62, 1.95, 0.2] },
  { name: 'shin.L', parent: 'thigh.L', at: [0.88, 1.05, 0.72] },
  { name: 'foot.L', parent: 'shin.L', at: [0.85, 0.42, 0.12], tail: [0.9, 0.1, 1.3] },
];
const BONES = [
  { name: 'hips', parent: '', at: [0, 1.75, -0.05] },
  { name: 'spine1', parent: 'hips', at: [0, 2.45, 0.05] },
  { name: 'spine2', parent: 'spine1', at: [0, 3.1, 0.35] },
  { name: 'chest', parent: 'spine2', at: [0, 3.7, 0.6] },
  { name: 'neck1', parent: 'chest', at: [0, 4.15, 0.78] },
  { name: 'neck2', parent: 'neck1', at: [0, 4.5, 0.92] },
  { name: 'head', parent: 'neck2', at: [0, 4.82, 1.1], tail: [0, 4.95, 2.05] },
  { name: 'jaw', parent: 'head', at: [0, 4.84, 1.36], tail: [0, 4.68, 1.97] },
  { name: 'tail0', parent: 'hips', at: [0, 1.45, -0.75] },
  { name: 'tail1', parent: 'tail0', at: [0, 1.05, -1.55] },
  { name: 'tail2', parent: 'tail1', at: [0, 0.75, -2.4] },
  { name: 'tail3', parent: 'tail2', at: [0, 0.6, -3.25] },
  { name: 'tail4', parent: 'tail3', at: [0, 0.52, -4.1] },
  { name: 'tail5', parent: 'tail4', at: [0, 0.48, -4.95] },
  { name: 'tail6', parent: 'tail5', at: [0, 0.47, -5.8] },
  { name: 'tail7', parent: 'tail6', at: [0, 0.47, -6.6] },
  { name: 'tail8', parent: 'tail7', at: [0, 0.47, -7.3], tail: [0, 0.46, -7.95] },
  ...LEFT,
  ...LEFT.map(MIRROR),
];
const BI = new Map(BONES.map((b, i) => [b.name, i]));
// Each bone's line: from its own joint to the joint of the child it leads
// to (the hips to the spine, the chest to the neck), or to its tail.
const LEADS = { hips: 'spine1', chest: 'neck1' };
for (const b of BONES) {
  const child = LEADS[b.name] ? BONES[BI.get(LEADS[b.name])]
    : BONES.find((c) => c.parent === b.name && !c.name.includes('.') === !b.name.includes('.'))
      || BONES.find((c) => c.parent === b.name);
  b.end = b.tail || child.at;
}
const NB = BONES.length;

function segDist(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz) / (abx * abx + aby * aby + abz * abz)));
  return Math.hypot(p[0] - a[0] - abx * t, p[1] - a[1] - aby * t, p[2] - a[2] - abz * t);
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------ her skin ---
// Points that share a place are one point of the shell: the model splits
// them along every seam in its texture, and a seam is not a cut in her skin.
function welded(m) {
  const key = new Map();
  const of = new Int32Array(m.n);
  const at = [];
  for (let i = 0; i < m.n; i++) {
    const k = `${Math.round(m.pos[i * 3] * 1e4)},${Math.round(m.pos[i * 3 + 1] * 1e4)},${Math.round(m.pos[i * 3 + 2] * 1e4)}`;
    let u = key.get(k);
    if (u === undefined) { u = at.length; key.set(k, u); at.push([m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]]); }
    of[i] = u;
  }
  const nbr = at.map(() => new Map());
  for (let t = 0; t < m.index.length; t += 3) {
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const u = of[m.index[t + a]], v = of[m.index[t + b]];
      if (u === v) continue;
      const d = Math.hypot(at[u][0] - at[v][0], at[u][1] - at[v][1], at[u][2] - at[v][2]);
      nbr[u].set(v, d); nbr[v].set(u, d);
    }
  }
  // Which shell each point is on.
  const shell = new Int32Array(at.length).fill(-1);
  let shells = 0;
  for (let s = 0; s < at.length; s++) {
    if (shell[s] >= 0) continue;
    const stack = [s];
    shell[s] = shells;
    while (stack.length) {
      const u = stack.pop();
      for (const v of nbr[u].keys()) if (shell[v] < 0) { shell[v] = shells; stack.push(v); }
    }
    shells++;
  }
  return { of, at, nbr, shell, shells };
}

/** Distances over the skin from `seeds` (point -> starting distance). */
function overSkin(G, seeds, only) {
  const d = new Float64Array(G.at.length).fill(Infinity);
  // A binary heap: the shell is ten thousand points and this runs once a bone.
  const heap = [];
  const push = (u, k) => {
    heap.push([k, u]);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  for (const [u, k] of seeds) { if (k < d[u]) { d[u] = k; push(u, k); } }
  while (heap.length) {
    const [k, u] = pop();
    if (k > d[u]) continue;
    for (const [v, w] of G.nbr[u]) {
      if (only && !only(v)) continue;
      const nk = k + w;
      if (nk < d[v]) { d[v] = nk; push(v, nk); }
    }
  }
  return d;
}

const G = welded(SKIN);
let main = 0;
{
  const count = new Map();
  for (let u = 0; u < G.at.length; u++) count.set(G.shell[u], (count.get(G.shell[u]) || 0) + 1);
  main = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
const onMain = (u) => G.shell[u] === main;
const NU = G.at.length;

// Which bone each point of the shell is nearest, through the air, and how
// near. That is not the weighting -- it is only where each bone takes hold
// of the skin: the nearest quarter of the points that are nearest it, which
// for an upper arm is the ring of skin round the upper arm and not the patch
// of chest beside it.
const nearest = new Int32Array(NU);
const nearD = new Float64Array(NU);
for (let u = 0; u < NU; u++) {
  let best = -1, bd = Infinity;
  for (let b = 0; b < NB; b++) {
    // A bone of one side never takes hold of the other side of her.
    const side = Math.sign(BONES[b].at[0]);
    if (side && Math.sign(G.at[u][0]) === -side) continue;
    const d = segDist(G.at[u], BONES[b].at, BONES[b].end);
    if (d < bd) { bd = d; best = b; }
  }
  nearest[u] = best; nearD[u] = bd;
}
const dists = [];
for (let b = 0; b < NB; b++) {
  const mine = [];
  for (let u = 0; u < NU; u++) if (onMain(u) && nearest[u] === b) mine.push(nearD[u]);
  mine.sort((a, c) => a - c);
  const cut = mine.length ? mine[Math.floor(mine.length * 0.25)] : 0;
  const seeds = [];
  for (let u = 0; u < NU; u++) if (onMain(u) && nearest[u] === b && nearD[u] <= cut) seeds.push([u, 0]);
  if (!seeds.length) throw new Error(`bone ${BONES[b].name} takes hold of nothing`);
  dists.push(overSkin(G, seeds, onMain));
}

// From distance to weight: each bone's pull falls off as the fourth power of
// how far round the skin it is, against how thick she is there -- so a joint
// in her thick waist blends over a long stretch and a knuckle over a short
// one. Four bones at most to a point.
const W4 = new Float64Array(NU * NB);
for (let u = 0; u < NU; u++) {
  if (!onMain(u)) continue;
  const scale = Math.max(0.12, nearD[u]);
  let sum = 0;
  for (let b = 0; b < NB; b++) {
    const d = dists[b][u] / scale;
    const w = 1 / (Math.pow(d, 4) + 1e-4);
    W4[u * NB + b] = w; sum += w;
  }
  for (let b = 0; b < NB; b++) W4[u * NB + b] /= sum;
}
// Smoothed over the skin, a point taking a little of the average of the
// points round it each pass.
function relax(W, passes, k) {
  const tmp = new Float64Array(NB);
  for (let p = 0; p < passes; p++) {
    const next = Float64Array.from(W);
    for (let u = 0; u < NU; u++) {
      if (!onMain(u)) continue;
      tmp.fill(0);
      let tw = 0;
      for (const [v, len] of G.nbr[u]) {
        const w = 1 / Math.max(1e-4, len);
        tw += w;
        for (let b = 0; b < NB; b++) tmp[b] += W[v * NB + b] * w;
      }
      if (!tw) continue;
      for (let b = 0; b < NB; b++) next[u * NB + b] = W[u * NB + b] * (1 - k) + (tmp[b] / tw) * k;
    }
    W.set(next);
  }
}
relax(W4, 12, 0.5);

// The jaw is cut from the skull here, and not by the weighting above: her
// lips lie a finger's width apart and through the air they are one place.
// Over the skin they are not -- the way from one to the other is round the
// corner of her mouth -- so each point of her head is given to the jaw by
// how much nearer it is, round the skin, to her chin than to her nose.
const HEAD = BI.get('head'), JAW = BI.get('jaw');
{
  const chin = [], crown = [];
  for (let u = 0; u < NU; u++) {
    if (!onMain(u)) continue;
    const [x, y, z] = G.at[u];
    if (z > 1.62 && y < 4.74 && y > 4.6) chin.push([u, 0]);
    if (z > 1.62 && y > 4.9) crown.push([u, 0]);
    void x;
  }
  const near = (u) => onMain(u) && G.at[u][2] > 1.0 && G.at[u][1] > 4.3;
  const dJ = overSkin(G, chin, near);
  const dH = overSkin(G, crown, near);
  for (let u = 0; u < NU; u++) {
    if (!near(u)) continue;
    const [, y, z] = G.at[u];
    const a = dJ[u], h = dH[u];
    if (!Number.isFinite(a) || !Number.isFinite(h)) continue;
    // Sharp across the lips, where the two are a long way apart round the
    // corner, and soft behind the corner of her mouth and down her throat,
    // where the skin does stretch as she opens it.
    const frac = smooth(0.38, 0.62, h / (a + h));
    const region = smooth(1.28, 1.46, z) * smooth(4.5, 4.62, y);
    const take = frac * region;
    // What the skull and the neck under it held, the jaw takes its share of.
    const from = [HEAD, BI.get('neck2')];
    for (const b of from) {
      const w = W4[u * NB + b] * take;
      W4[u * NB + b] -= w;
      W4[u * NB + JAW] += w;
    }
  }
}

/** The four strongest of a point's weights, summing to one, in bytes. */
function packed(Wrow) {
  const order = Array.from(Wrow.keys()).sort((a, b) => Wrow[b] - Wrow[a]).slice(0, 4);
  const sum = order.reduce((s, b) => s + Wrow[b], 0) || 1;
  const w = order.map((b) => Wrow[b] / sum);
  const q = w.map((x) => Math.round(x * 255));
  // Exactly 255 between them, the rounding put back on the strongest.
  q[0] += 255 - q.reduce((s, x) => s + x, 0);
  return { idx: order, q };
}

// Every point on her main shell, its four bones.
const skinW = new Array(NU);
for (let u = 0; u < NU; u++) if (onMain(u)) skinW[u] = packed(W4.subarray(u * NB, (u + 1) * NB));

// The nearest point of the main shell to anywhere, by brute force through a
// coarse grid of them.
const grid = new Map();
const CELL = 0.15;
const cellOf = (p) => `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)},${Math.floor(p[2] / CELL)}`;
for (let u = 0; u < NU; u++) {
  if (!onMain(u)) continue;
  const k = cellOf(G.at[u]);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(u);
}
function nearestSkin(p) {
  const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL), cz = Math.floor(p[2] / CELL);
  let best = -1, bd = Infinity;
  for (let r = 0; r < 12 && (best < 0 || r * CELL < bd + CELL); r++) {
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
      if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== r) continue;
      for (const u of grid.get(`${cx + i},${cy + j},${cz + k}`) || []) {
        const d = Math.hypot(p[0] - G.at[u][0], p[1] - G.at[u][1], p[2] - G.at[u][2]);
        if (d < bd) { bd = d; best = u; }
      }
    }
  }
  return { u: best, d: bd };
}

/**
 * One hard piece -- a tooth, a plate, a claw -- moving as one with the skin it
 * is rooted in: the weights of the skin nearest the part of it nearest the
 * skin, averaged, given to every point of it.
 */
function rooted(points) {
  const near = points.map((p) => ({ p, ...nearestSkin(p) })).sort((a, b) => a.d - b.d);
  const roots = near.slice(0, Math.max(1, Math.ceil(near.length * 0.1)));
  const acc = new Float64Array(NB);
  for (const r of roots) {
    const w = skinW[r.u];
    for (let k = 0; k < 4; k++) acc[w.idx[k]] += w.q[k] / 255;
  }
  return { w: packed(acc), roots };
}

/** The shells of a mesh, as lists of its points. */
function shellsOf(m) {
  const Gm = welded(m);
  const out = Array.from({ length: Gm.shells }, () => []);
  for (let i = 0; i < m.n; i++) out[Gm.shell[Gm.of[i]]].push(i);
  return out;
}
const pointOf = (m, i) => [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]];

const weights = MESHES.map((m) => ({ idx: new Uint8Array(m.n * 4), w: new Uint8Array(m.n * 4) }));
function give(mi, i, pw) {
  for (let k = 0; k < 4; k++) {
    weights[mi].idx[i * 4 + k] = pw.idx[k] ?? 0;
    weights[mi].w[i * 4 + k] = pw.q[k] ?? 0;
  }
}
const rigid = (b) => ({ idx: [b, 0, 0, 0], q: [255, 0, 0, 0] });

// Her skin, and the claws on it.
for (let i = 0; i < SKIN.n; i++) {
  const u = G.of[i];
  if (onMain(u)) give(0, i, skinW[u]);
}
for (let s = 0; s < G.shells; s++) {
  if (s === main) continue;
  const pts = [];
  for (let i = 0; i < SKIN.n; i++) if (G.shell[G.of[i]] === s) pts.push(i);
  const { w } = rooted(pts.map((i) => pointOf(SKIN, i)));
  for (const i of pts) give(0, i, w);
}
// Her teeth: each with the gum it is rooted in, top or bottom.
let upper = 0, lower = 0;
for (const pts of shellsOf(TEETH)) {
  const { roots } = rooted(pts.map((i) => pointOf(TEETH, i)));
  let jaw = 0;
  for (const r of roots) { const w = skinW[r.u]; for (let k = 0; k < 4; k++) if (w.idx[k] === JAW) jaw += w.q[k] / 255; }
  const isLower = jaw / roots.length > 0.5;
  if (isLower) lower++; else upper++;
  for (const i of pts) give(1, i, rigid(isLower ? JAW : HEAD));
}
// Her tongue lies in her lower jaw, and her eyes are in her skull.
for (let i = 0; i < TONGUE.n; i++) give(2, i, rigid(JAW));
for (let i = 0; i < EYES.n; i++) give(3, i, rigid(HEAD));

// Her plates, each as one piece with the back it stands on, and for each
// point of them how far forward along her it stands and how far up its plate
// -- which is what the glow climbs, from the tip of her tail to the back of
// her head, and up each plate from its root to its points.
const SPINE_LINE = ['tail8', 'tail7', 'tail6', 'tail5', 'tail4', 'tail3', 'tail2', 'tail1', 'tail0', 'hips', 'spine1', 'spine2', 'chest', 'neck1', 'neck2', 'head']
  .map((n) => BONES[BI.get(n)].at);
SPINE_LINE.unshift(BONES[BI.get('tail8')].end);
const lineLen = [0];
for (let k = 1; k < SPINE_LINE.length; k++) {
  const a = SPINE_LINE[k - 1], b = SPINE_LINE[k];
  lineLen.push(lineLen[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
}
function alongSpine(p) {
  let best = 0, bd = Infinity;
  for (let k = 1; k < SPINE_LINE.length; k++) {
    const a = SPINE_LINE[k - 1], b = SPINE_LINE[k];
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const L2 = abx * abx + aby * aby + abz * abz;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz) / L2));
    const d = Math.hypot(p[0] - a[0] - abx * t, p[1] - a[1] - aby * t, p[2] - a[2] - abz * t);
    if (d < bd) { bd = d; best = (lineLen[k - 1] + t * Math.sqrt(L2)) / lineLen[lineLen.length - 1]; }
  }
  return best;
}
const glow = new Float32Array(PLATES.n * 2);
const plateShells = shellsOf(PLATES);
for (const pts of plateShells) {
  const P = pts.map((i) => pointOf(PLATES, i));
  const { w, roots } = rooted(P);
  for (const i of pts) give(4, i, w);
  // Its root: the middle of the part of it nearest her skin.
  const root = [0, 0, 0];
  for (const r of roots) for (let k = 0; k < 3; k++) root[k] += r.p[k] / roots.length;
  const along = alongSpine(root);
  let reach = 1e-6;
  for (const p of P) reach = Math.max(reach, Math.hypot(p[0] - root[0], p[1] - root[1], p[2] - root[2]));
  for (const i of pts) {
    const p = pointOf(PLATES, i);
    glow[i * 2] = along;
    glow[i * 2 + 1] = Math.min(1, Math.hypot(p[0] - root[0], p[1] - root[1], p[2] - root[2]) / reach);
  }
}

// ------------------------------------------------------------- written ---
const b64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64');
const f32 = (a) => b64(Float32Array.from(a));

function meshOut(m, mi) {
  const pos = new Float32Array(m.n * 3);
  for (let i = 0; i < m.n * 3; i++) pos[i] = m.pos[i] * SCALE;
  return {
    name: m.name,
    material: m.material,
    count: m.n,
    position: b64(pos),
    normal: f32(m.nrm),
    uv: f32(m.uv),
    tangent: m.tangent ? f32(m.tangent) : null,
    index: b64(Uint16Array.from(m.index)),
    skinIndex: b64(weights[mi].idx),
    skinWeight: b64(weights[mi].w),
    glow: m === PLATES ? b64(glow) : null,
  };
}

// The model's textures, each re-encoded as WebP: her colours and the normals
// the light catches her scales by at the size they came in and at a quality
// nobody can tell from the original at the distance anyone sees her from,
// and the maps only her teeth and her tongue read (a few hundred points
// between them) at half that. Her two specular masks are kept in their alpha,
// which is the channel three.js reads a specular intensity from.
const HALF = new Set([5, 6, 7, 8]);
const MASK = new Set([4, 13]);
const NORMALS = new Set([3, 7, 12]);
const images = [];
for (let i = 0; i < J.images.length; i++) {
  const im = J.images[i];
  const v = J.bufferViews[im.bufferView];
  const raw = BIN.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  let s = sharp(Buffer.from(raw));
  if (HALF.has(i)) s = s.resize(512, 512);
  if (!MASK.has(i)) s = s.removeAlpha();
  const out = await s.webp({ quality: NORMALS.has(i) ? 90 : 82, alphaQuality: 90, smartSubsample: true }).toBuffer();
  images.push(out.toString('base64'));
}
// The materials as the model has them, by which texture goes where.
const tex = (t) => (t ? J.textures[t.index].source : null);
const MATERIALS = J.materials.map((m) => {
  const pbr = m.pbrMetallicRoughness || {};
  const cc = m.extensions?.KHR_materials_clearcoat || {};
  const sp = m.extensions?.KHR_materials_specular || {};
  return {
    name: m.name,
    map: tex(pbr.baseColorTexture),
    mr: tex(pbr.metallicRoughnessTexture),
    roughness: pbr.roughnessFactor ?? 1,
    metalness: pbr.metallicFactor ?? 1,
    ao: tex(m.occlusionTexture),
    normal: tex(m.normalTexture),
    clearcoat: cc.clearcoatFactor ?? 0,
    clearcoatMap: tex(cc.clearcoatTexture),
    clearcoatRoughness: cc.clearcoatRoughnessFactor ?? 0,
    clearcoatRoughnessMap: tex(cc.clearcoatRoughnessTexture),
    clearcoatNormal: tex(cc.clearcoatNormalTexture),
    specular: sp.specularFactor ?? 1,
    specularMap: tex(sp.specularTexture),
  };
});

const bonesOut = BONES.map((b) => ({
  name: b.name,
  parent: b.parent ? BI.get(b.parent) : -1,
  at: b.at.map((v) => +(v * SCALE).toFixed(4)),
  end: b.end.map((v) => +(v * SCALE).toFixed(4)),
}));

const meshes = MESHES.map(meshOut);
let src = `// Generated by build/prepare-monster.mjs from the owner's model,
// ${JSON.stringify(J.asset.extras?.title || 'Godzilla Minus One')} by ${J.asset.extras?.author || 'ArachnoBoy'}, ${J.asset.extras?.license || 'Sketchfab Standard'}.
// Do not hand-edit -- regenerate from the source assets instead.
//
// Her meshes in metres (+Z ahead, +Y up, her soles at y = 0), each point's
// four bones and weights, her bones as joints in the same frame, and the
// model's textures as WebP.
export const SCALE = ${SCALE};
export const HEIGHT = ${HEIGHT};
export const BONES = ${JSON.stringify(bonesOut)};
export const MATERIALS = ${JSON.stringify(MATERIALS)};
`;
meshes.forEach((m, i) => {
  src += `export const MESH_${i} = { name: ${JSON.stringify(m.name)}, material: ${m.material}, count: ${m.count},\n`;
  for (const k of ['position', 'normal', 'uv', 'tangent', 'index', 'skinIndex', 'skinWeight', 'glow']) {
    src += `  ${k}: ${m[k] ? `"${m[k]}"` : 'null'},\n`;
  }
  src += '};\n';
});
src += `export const MESHES = [${meshes.map((_, i) => `MESH_${i}`).join(', ')}];\n`;
images.forEach((s, i) => { src += `export const IMAGE_${i} = "${s}";\n`; });
src += `export const IMAGES = [${images.map((_, i) => `IMAGE_${i}`).join(', ')}];\n`;
writeFileSync(OUT, src);
console.log(`${OUT}: ${Math.round(src.length / 1024)} KB; ${NB} bones; ${upper} upper and ${lower} lower teeth; ${plateShells.length} plates; scale ${SCALE.toFixed(3)} m a unit`);
