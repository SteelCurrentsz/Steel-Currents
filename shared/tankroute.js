// Steel Currents - the way a tank's commander picks his road across the land.
//
// Left to its own crew a tank used to drive straight at what it was after and
// feel its way round whatever was in front of its nose. That gets it stuck:
// against the water's edge when the enemy is across a bay, in the corner of a
// town's blocks, at the foot of a ridge it could have gone round. So before he
// sets off the commander reads the map: a coarse grid over the ground between
// him and where he is going, every square of it dry or shallow enough to ford,
// clear of houses, and joined to its neighbours only where the tracks will
// climb the slope between them -- and the town's streets cheaper to drive
// than the fields, so that in a town he keeps to the roads. The cheapest line
// across it (A*) is his route. Where he cannot get all the way -- the enemy is
// a ship, or on another island -- the route ends at the nearest point of the
// land he can reach, which is the beach facing it.

import { MAP_HALF } from './world.js';
import { cityPlans, surfaceAt, buildingAt, ruinOf, stageOf, STAGE, SURF } from './works.js';

/** What a square costs to drive across, for each kind of town surface (SURF): the roads cheapest. */
const SURF_COST = [1, 0.4, 0.65, 0.8, 0.65, 0.75, 0.7, 0.9, 0.45, 0.45];

/** How many squares of map he will read at most, and how many he will try before giving up. */
const MAX_SIDE = 260;
const MAX_EXPAND = 20000;
/** How many squares he reads without getting any nearer before he settles for the nearest he has found. */
const NO_GAIN = 2000;

/** The map's own squares, in metres: every route's squares are a whole number of them. */
const LATTICE = 7;

/**
 * The ground every route has read so far, by the map's square: its height
 * and what its surface costs to drive on. The houses are read again every
 * time, since they come down; the ground is kept, a crater or two short of
 * the truth, which the tank's own driving finds out about as it goes.
 */
const SEEN = new WeakMap();
function mapOf(world) {
  let m = SEEN.get(world);
  if (!m || m.size > 400000) SEEN.set(world, (m = new Map()));
  return m;
}

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** A house standing at a point that a tank cannot drive through (rubble and cleared sites it can). */
function houseIn(world, x, z, pad) {
  const b = buildingAt(world, x, z, pad);
  if (!b) return false;
  const r = ruinOf(world, b.id);
  const st = stageOf(r?.d || 0, !!r?.c);
  return st < STAGE.rubble;
}

/**
 * The cheapest route a tank can drive from `from` to `to`, as world points
 * `[{x, z}, ...]` (not including where it starts), and whether it reaches
 * `to` or stops short of it at the nearest ground it can get to.
 *
 * `opt.ground(x, z)` is the ground the tank stands on, `opt.wade` how deep it
 * will ford, `opt.grade` the steepest rise over run it will climb, `opt.width`
 * how wide it is. Null if it is standing somewhere it cannot drive from at all.
 */
export function planRoute(world, from, to, opt) {
  const edge = (world.half || MAP_HALF) - 90;
  const span = Math.max(Math.abs(to.x - from.x), Math.abs(to.z - from.z));
  const margin = Math.max(160, span * 0.35);
  // Squares a whole number of the map's own (LATTICE), lined up on it, so
  // that what one route read of the ground the next can use again.
  const k = Math.max(1, Math.ceil((span + margin * 2) / MAX_SIDE / LATTICE));
  const cell = LATTICE * k;
  const x0 = Math.floor(Math.max(-edge, Math.min(from.x, to.x) - margin) / cell) * cell;
  const z0 = Math.floor(Math.max(-edge, Math.min(from.z, to.z) - margin) / cell) * cell;
  const x1 = Math.min(edge, Math.max(from.x, to.x) + margin);
  const z1 = Math.min(edge, Math.max(from.z, to.z) + margin);
  const nx = Math.max(2, Math.ceil((x1 - x0) / cell) + 1);
  const nz = Math.max(2, Math.ceil((z1 - z0) / cell) + 1);
  const N = nx * nz;
  const town = cityPlans(world).length > 0;
  const pad = (opt.width || 3) * 0.5 + 1;
  const wet = -(opt.wade || 1) * 0.5;

  // Read lazily: most of the box is never looked at.
  const hgt = new Float32Array(N).fill(NaN);
  const cost = new Float32Array(N); // 0 not yet read, -1 impassable
  const seen = mapOf(world);
  const read = (i) => {
    if (cost[i] !== 0) return cost[i];
    const x = x0 + (i % nx) * cell;
    const z = z0 + Math.floor(i / nx) * cell;
    const key = (Math.round(x / LATTICE) + 4096) * 8192 + Math.round(z / LATTICE) + 4096;
    let m = seen.get(key);
    if (m === undefined) {
      const g = opt.ground(x, z);
      m = [g, town ? SURF_COST[surfaceAt(world, x, z)] ?? 1 : 1];
      seen.set(key, m);
    }
    const g = m[0];
    hgt[i] = g;
    let c = m[1];
    if (g < wet) c = -1;
    else if (town && houseIn(world, x, z, pad)) c = -1;
    if (c > 0 && g < 0.3) c *= 2.5; // in the shallows: slow, and drowned engines
    cost[i] = c;
    return c;
  };
  const idx = (x, z) => {
    const i = Math.round((x - x0) / cell);
    const j = Math.round((z - z0) / cell);
    return Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i));
  };

  // Where he is: the nearest drivable square to his hull.
  let start = idx(from.x, from.z);
  if (read(start) < 0) {
    const si = start % nx;
    const sj = Math.floor(start / nx);
    let found = -1;
    for (let r = 1; r <= 3 && found < 0; r++) {
      for (let dj = -r; dj <= r && found < 0; dj++) {
        for (let di = -r; di <= r; di++) {
          const i = si + di;
          const j = sj + dj;
          if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
          if (read(j * nx + i) > 0) { found = j * nx + i; break; }
        }
      }
    }
    if (found < 0) return null;
    start = found;
  }
  const goal = idx(to.x, to.z);
  const gi = goal % nx;
  const gj = Math.floor(goal / nx);
  const hOf = (i) => Math.hypot((i % nx) - gi, Math.floor(i / nx) - gj) * cell;

  const gs = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const shut = new Uint8Array(N);
  // A binary heap of node indices, keyed on f.
  const heap = [];
  const fk = new Float32Array(N);
  const push = (i) => {
    heap.push(i);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (fk[heap[p]] <= fk[heap[k]]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && fk[heap[l]] < fk[heap[m]]) m = l;
        if (r < heap.length && fk[heap[r]] < fk[heap[m]]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  // The heuristic is weighted a little past the cheapest square: a near
  // enough route found quickly is worth more to him than the best one late.
  const H = 0.6;
  gs[start] = 0;
  fk[start] = hOf(start) * H;
  push(start);
  let best = start;
  let bestH = hOf(start);
  let n = 0;
  let gain = 0;
  let reached = false;
  // Near enough: what he is going to may be standing in a house, or be a
  // house, and the square under it is not one he can drive onto.
  const near = Math.max(cell * 1.5, opt.near ?? 18);
  const climb = opt.grade * 0.92;
  while (heap.length && n < MAX_EXPAND && n - gain < NO_GAIN) {
    const cur = pop();
    if (shut[cur]) continue;
    shut[cur] = 1;
    n++;
    const h = hOf(cur);
    if (h < bestH) { bestH = h; best = cur; gain = n; }
    if (cur === goal || h <= near) { reached = true; best = cur; break; }
    const ci = cur % nx;
    const cj = Math.floor(cur / nx);
    const cg = hgt[cur];
    for (const [di, dj, len] of DIRS) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const nb = j * nx + i;
      if (shut[nb]) continue;
      const c = read(nb);
      if (c < 0) continue;
      // Not across the corner of a house or the water.
      if (di && dj && (read(cj * nx + i) < 0 || read(j * nx + ci) < 0)) continue;
      const run = len * cell;
      const rise = (hgt[nb] - cg) / run;
      if (rise > climb) continue;
      // Down a slope it would go over on, or over a drop it would land on its nose off, no.
      if (-rise > opt.grade * 1.6) continue;
      const steep = Math.max(0, rise) / opt.grade;
      const g = gs[cur] + run * (c + (read(cur) - c) * 0.5) * (1 + steep * steep * 3);
      if (g >= gs[nb]) continue;
      gs[nb] = g;
      came[nb] = cur;
      fk[nb] = g + hOf(nb) * H;
      push(nb);
    }
  }
  // Back from the end to where he is.
  const pts = [];
  for (let k = best; k !== -1 && k !== start; k = came[k]) {
    pts.push({ x: x0 + (k % nx) * cell, z: z0 + Math.floor(k / nx) * cell });
  }
  pts.reverse();
  // The last of it is where he was going, if he can get there.
  if (reached && best === goal && pts.length) pts[pts.length - 1] = { x: to.x, z: to.z };
  return { pts: thin(pts), reached, end: pts.length ? pts[pts.length - 1] : { x: from.x, z: from.z }, cell };
}

/** Drop the points of a route that are on a straight run, keeping the bends and no gap over sixty metres. */
function thin(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let k = 1; k < pts.length - 1; k++) {
    const a = out[out.length - 1];
    const b = pts[k];
    const c = pts[k + 1];
    const bend = Math.abs((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)) > 1e-6;
    if (bend || Math.hypot(b.x - a.x, b.z - a.z) > 60) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
