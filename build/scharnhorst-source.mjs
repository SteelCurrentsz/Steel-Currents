// Take the owner's KMS Scharnhorst sculpts down to what the build works from.
//
//   npm i --no-save meshoptimizer@0.22          (see build/sculpt-source.mjs)
//   node build/scharnhorst-source.mjs <hull.glb> <bridge and front superstructure.glb> \
//     <mid and aft superstructure.glb> <28cm triple.glb> <15cm single.glb>
//
// Any of them may be given as `-`, which leaves the asset made from it as it
// is: the sculpts are not committed (they are 3 to 40 MB), and one can be
// taken down again without the others to hand.
//
// She came as eight sculpts. Three of them are the Bismarck's and the
// Tirpitz's own, line for line -- her 15 cm twin turret, her 10.5 cm twin and
// the quadruple tubes -- and are not taken down again: her model uses
// assets/models/bismarck-15.glb, bismarck-105.glb and tirpitz-tubes.glb as
// build/bismarck-source.mjs made them. The other five:
//
//   * her hull: the whole of her, a million triangles, whose upperworks are
//     soft lumps. Only her hull is taken from it, as the owner asked, and her
//     paint put on it here;
//   * her bridge and front superstructure: the fore half of a ship on a stand,
//     sculpted shorter and narrower than her hull -- its own Anton and Bruno,
//     its conning tower, bridge, tower mast, foretop, funnel and the boats and
//     cranes abaft it. Only what stands on its deck from abaft Bruno to abaft
//     her funnel is taken, as the owner asked;
//   * her mid and aft superstructure: a whole ship again, bow to +X, sculpted
//     to its own proportions and rigged with wires from stem to masthead to
//     stern. Only what stands on its deck from abaft her funnel to forward of
//     Caesar is taken -- her cranes, her hangar, her mainmast, her after
//     control position -- with every wire taken off it;
//   * her 28 cm triple turret, barrels along -X, standing on its ring;
//   * her 15 cm single in its shield on its pedestal, barrel along -X.
//
// Each superstructure keeps its own frame: build/prepare-scharnhorst-hull.mjs
// puts it where it goes on her.
//
// Writes, into assets/models/:
//
//   scharnhorst-hull.glb    her hull, with her paint on every point as the
//                           attribute _PAINT (see PAINTS)
//   scharnhorst-fore.glb    her bridge and front superstructure and funnel
//   scharnhorst-aft.glb     her mid and aft superstructure, mainmast, cranes
//   scharnhorst-28.glb      her 28 cm triple turret
//   scharnhorst-15.glb      her 15 cm single, in its shield
//
// Coordinates here are each sculpt's own. Her hull: length along X with her
// bow at -X, Y up, beam along Z, 1.8989 units stem to stern.
import path from 'node:path';
import {
  ROOT, simplifier, readSource, writeGlb as writeSourceGlb, splitAt, splitByPaint, weldByPaint,
  decimate as decimateWith,
} from './sculpt-source.mjs';
import { components } from './sculpt.mjs';
import { wires, subMesh } from './sculpt-parts.mjs';

const MeshoptSimplifier = await simplifier();
const writeGlb = (file, m) => writeSourceGlb(file, m, 'build/scharnhorst-source.mjs');
const decimate = (m, ratio, error, normalWeight = 0) => decimateWith(MeshoptSimplifier, m, ratio, error, normalWeight);
const out = (name) => path.join(ROOT, 'assets/models', name);

const [HULL_SRC, FORE_SRC, AFT_SRC, MAIN_SRC, SEC_SRC] = process.argv.slice(2);
if (!SEC_SRC) {
  console.error('usage: node build/scharnhorst-source.mjs <hull.glb> <fore superstructure.glb> '
    + '<aft superstructure.glb> <28cm.glb> <15cm single.glb>   (- for any of them to leave its asset as it is)');
  process.exit(1);
}
const given = (src) => src && src !== '-';

/** Her paints, as build/prepare-scharnhorst-hull.mjs and the data file number them. */
export const PAINTS = ['grey', 'deck', 'steel deck', 'boot', 'red'];
const GREY = 0, BOOT = 3, RED = 4;

// Her hull's sculpt is 1.8989 units stem to stern, which is her 234.9 m; but
// it was sculpted a sixth too full for its length -- 35 m across and 16.5 deep
// at that scale, where she was 30 m across and 14.05 deep -- so her length is
// taken at 123.7 m a unit and her sections, across and up, at 106 (see
// build/prepare-scharnhorst-hull.mjs). Her keel is flat at -0.2330 and she is
// floated at 9.1 m; her boot topping runs from nine tenths of a metre under
// her waterline to nine tenths over it.
export const LOA = 234.9;
export const STEM = -0.95099, STERN = 0.94788;
export const KEEL = -0.2330;
export const SECTION = 106.0;
const DRAFT = 9.1;
const WL = KEEL + DRAFT / SECTION;
const BOOT_LO = WL - 0.9 / SECTION;
const BOOT_HI = WL + 0.9 / SECTION;

/** The triangles of `m` whose middles pass `keep(x, y, z)`. */
function crop(m, keep) {
  const { P, T } = m;
  const kept = [];
  for (let t = 0; t < T.length; t += 3) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) { const v = T[t + k]; cx += P[v * 3] / 3; cy += P[v * 3 + 1] / 3; cz += P[v * 3 + 2] / 3; }
    if (keep(cx, cy, cz)) kept.push(T[t], T[t + 1], T[t + 2]);
  }
  return { ...m, T: kept };
}
/** Only the points a mesh uses. */
const compactOf = (m) => subMesh({ ...m, N: m.N }, () => true);

/**
 * Her deck edge along her, read off the sculpt: at every hundredth of a unit
 * of her length, walking up her side from her waterline, the last height at
 * which she is still nine tenths of the breadth she has under it -- above
 * that it is a deckhouse or a gunhouse, not her side.
 */
function deckEdge(m) {
  const { P } = m;
  const n = 200, x0 = -1, dx = 0.01, dy = 0.002;
  const lv = Array.from({ length: n }, () => new Map());
  for (let i = 0; i < P.length; i += 3) {
    const k = Math.floor((P[i] - x0) / dx);
    if (k < 0 || k >= n) continue;
    const key = Math.round(P[i + 1] / dy);
    lv[k].set(key, Math.max(lv[k].get(key) || 0, Math.abs(P[i + 2])));
  }
  const edge = new Float64Array(n).fill(NaN);
  for (let k = 0; k < n; k++) {
    const keys = [...lv[k].keys()].sort((a, b) => a - b);
    let under = 0, top = null;
    for (const key of keys) {
      const y = key * dy, w = lv[k].get(key);
      if (y < WL) { under = Math.max(under, w); continue; }
      if (top !== null && y > top + 0.04) break;
      if (w >= 0.9 * under) { under = Math.max(under, w); top = y; }
    }
    if (top !== null) edge[k] = top;
  }
  return (x) => {
    const k = Math.max(0, Math.min(n - 1, Math.floor((x - x0) / dx)));
    for (let d = 0; d < 6; d++) {
      for (const j of [k - d, k + d]) if (j >= 0 && j < n && !Number.isNaN(edge[j])) return edge[j];
    }
    return -0.08;
  };
}

/** Drop what is no longer joined to it and is smaller than `size` units, or fewer than `tris` triangles. */
function dropDebris(m, size, tris) {
  const parts = components(m);
  const drop = new Uint8Array(m.T.length / 3);
  let n = 0;
  for (const c of parts) {
    const s = Math.max(c.hi[0] - c.lo[0], c.hi[1] - c.lo[1], c.hi[2] - c.lo[2]);
    if (s > size && c.tris.length > tris) continue;
    for (const t of c.tris) drop[t] = 1;
    n++;
  }
  console.log(`  ${parts.length} pieces, ${n} small loose ones dropped`);
  return compactOf(subMesh(m, (t) => !drop[t]));
}

/**
 * Drop every piece that is not stood on her: pieces that touch -- a point of
 * one within `gap` of a point of another -- are one cluster, and every cluster
 * but those touching her biggest piece or bigger than `size` goes. Taking her
 * wires off leaves the yards and blocks they held hanging in the air, some of
 * them still hooked to each other.
 */
function dropFloating(m, gap, size) {
  const parts = components(m);
  const owner = new Int32Array(m.P.length / 3).fill(-1);
  parts.forEach((c, i) => { for (const t of c.tris) for (let j = 0; j < 3; j++) owner[m.T[t * 3 + j]] = i; });
  const cells = new Map();
  const cell = (v) => [Math.floor(m.P[v * 3] / gap), Math.floor(m.P[v * 3 + 1] / gap), Math.floor(m.P[v * 3 + 2] / gap)];
  for (let v = 0; v < owner.length; v++) {
    if (owner[v] < 0) continue;
    const k = cell(v).join(',');
    if (!cells.has(k)) cells.set(k, new Set());
    cells.get(k).add(owner[v]);
  }
  const root = parts.map((_, i) => i);
  const find = (i) => { while (root[i] !== i) { root[i] = root[root[i]]; i = root[i]; } return i; };
  for (let v = 0; v < owner.length; v++) {
    if (owner[v] < 0) continue;
    const [ix, iy, iz] = cell(v);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) {
      const s = cells.get(`${ix + a},${iy + b},${iz + d}`);
      if (s) for (const o of s) root[find(o)] = find(owner[v]);
    }
  }
  const lo = new Map(), hi = new Map();
  parts.forEach((c, i) => {
    const r = find(i);
    const l = lo.get(r) || [Infinity, Infinity, Infinity], h = hi.get(r) || [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 3; k++) { l[k] = Math.min(l[k], c.lo[k]); h[k] = Math.max(h[k], c.hi[k]); }
    lo.set(r, l); hi.set(r, h);
  });
  const main = find(0);
  const drop = new Uint8Array(m.T.length / 3);
  let n = 0;
  parts.forEach((c, i) => {
    const r = find(i);
    if (r === main) return;
    const l = lo.get(r), h = hi.get(r);
    if (Math.max(h[0] - l[0], h[1] - l[1], h[2] - l[2]) > size) return;
    for (const t of c.tris) drop[t] = 1;
    n++;
  });
  console.log(`  ${n} pieces hanging in the air dropped`);
  return compactOf(subMesh(m, (t) => !drop[t]));
}

/** Take the rigging off a superstructure, read in metres at `s` a unit. */
function unrig(m, s) {
  const rig = wires({ P: m.P.map((v) => v * s), N: m.N, T: m.T }, {
    r: 0.3, minLen: 2.5, girth: 1.2, air: 1.5, loose: true, near: 0.4, crowd: 3,
  });
  console.log(`  rigging: ${rig.reduce((n, v) => n + v, 0)} faces`);
  return compactOf(subMesh(m, (t) => !rig[t]));
}

// ---- her hull ---------------------------------------------------------------------
if (given(HULL_SRC)) {
  const raw = readSource(HULL_SRC);
  console.log('hull', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  // Off with everything standing on her: a triangle whose middle is more than
  // thirty centimetres over her deck edge where it is.
  const edge = deckEdge(raw);
  const hull = compactOf(crop(raw, (x, y) => y < edge(x) + 0.3 / SECTION));
  console.log('her hull:', hull.T.length / 3, 'triangles under her deck edge; deck edge',
    [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9].map((x) => `${x}:${edge(x).toFixed(4)}`).join(' '));
  for (const y of [BOOT_LO, BOOT_HI]) console.log(`cut level at ${y.toFixed(4)}: ${splitAt(hull, y)} triangles split`);
  const paint = new Uint8Array(hull.T.length / 3);
  const tally = [0, 0, 0, 0, 0];
  for (let t = 0; t < hull.T.length / 3; t++) {
    let cy = 0;
    for (let j = 0; j < 3; j++) cy += hull.P[hull.T[t * 3 + j] * 3 + 1] / 3;
    paint[t] = cy < BOOT_LO ? RED : cy < BOOT_HI ? BOOT : GREY;
    tally[paint[t]]++;
  }
  console.log('paint:', PAINTS.map((p, k) => `${p} ${tally[k]}`).join(', '));
  const painted = weldByPaint(splitByPaint(hull, paint));
  console.log('painted', painted.P.length / 3, 'points');
  writeGlb(out('scharnhorst-hull.glb'),
    decimate(painted, +(process.env.HULL_RATIO || 0.15), +(process.env.HULL_ERROR || 0.00025), +(process.env.HULL_NW ?? 0.02)));
}

// ---- her bridge and front superstructure -------------------------------------------
// Its deck is level at -0.145. What is taken is what stands on it from the
// after face of Bruno's barbette (-0.105) to abaft her funnel (0.69), and no
// further out than the edge of its deck: its conning tower, bridge, tower
// mast and foretop, funnel and the platforms and boats round them. Its own
// 15 cm and its light guns go with it here; build/prepare-scharnhorst-hull.mjs
// cuts them out where hers stand.
export const FORE = { deck: -0.145, x0: -0.105, x1: 0.69 };
if (given(FORE_SRC)) {
  const raw = readSource(FORE_SRC);
  console.log('fore superstructure', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  let m = compactOf(crop(raw, (x, y) => x > FORE.x0 && x < FORE.x1 && y > FORE.deck + 0.0015));
  console.log(' cropped to', m.T.length / 3, 'triangles');
  m = unrig(m, 56);
  m = dropDebris(m, 0.03, 40);
  m = dropFloating(m, 0.004, 0.2);
  writeGlb(out('scharnhorst-fore.glb'),
    decimate(m, +(process.env.FORE_RATIO || 0.12), +(process.env.FORE_ERROR || 0.0012), 0.02));
}

// ---- her mid and aft superstructure ------------------------------------------------
// Bow to +X; its deck is level at -0.198 abreast its funnel, rising to -0.192
// abreast its after control position. What is taken is what stands a hand
// over the highest of that, from forward of Caesar's gunhouse (-0.385) to
// abaft her funnel (0.135), every wire it was rigged with taken off first.
export const AFT = { deck: -0.190, x0: -0.385, x1: 0.135 };
if (given(AFT_SRC)) {
  const raw = readSource(AFT_SRC);
  console.log('aft superstructure', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  let m = compactOf(crop(raw, (x, y) => x > AFT.x0 && x < AFT.x1 && y > AFT.deck + 0.0015));
  console.log(' cropped to', m.T.length / 3, 'triangles');
  m = unrig(m, 90);
  m = dropDebris(m, 0.02, 40);
  m = dropFloating(m, 0.003, 0.2);
  writeGlb(out('scharnhorst-aft.glb'),
    decimate(m, +(process.env.AFT_RATIO || 0.12), +(process.env.AFT_ERROR || 0.0012), 0.02));
}

// ---- her guns ----------------------------------------------------------------------
if (given(MAIN_SRC)) {
  writeGlb(out('scharnhorst-28.glb'), decimate(readSource(MAIN_SRC), +(process.env.MAIN_RATIO || 0.03), 0.004, 0.02));
}
if (given(SEC_SRC)) {
  writeGlb(out('scharnhorst-15.glb'), decimate(readSource(SEC_SRC), +(process.env.SEC_RATIO || 0.05), 0.004, 0.02));
}
