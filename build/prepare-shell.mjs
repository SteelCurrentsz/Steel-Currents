// Turn the owner's shell model (assets/models/Meshy_AI_Shell_affixed_to_meta_
// 1120123606_generate-maximum-compressed.glb) into what client/js/render/
// shellModel.data.js ships: the shell's own profile, nose to base.
//
//   node build/prepare-shell.mjs
//
// The model is a shell standing nose up (+Y) clamped to a metal plaque behind
// it (-Z), in one welded skin of a hundred and sixty thousand triangles. A
// shell is turned on a lathe, so all of it that is wanted is its profile: how
// far out from its axis it is at each point along it -- the base, the driving
// band, the body, the bourrelet, and the ogive running up to the point. That
// is read off the half of it facing away from the plaque (where nothing is
// clamped to it), and the game turns it again (see shellGeometry in
// render/ordnance.js), so five hundred rounds in the air at once are a few
// hundred triangles each and not a hundred and sixty thousand.
//
// Written out nose first along +Z, a metre long and centred on its middle,
// its radius in the same metres. Writes client/js/render/shellModel.data.js,
// which is committed, so a fresh clone runs without this script.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, readCompressed } from './sculpt-source.mjs';

const SRC = process.argv[2] || path.join(ROOT, 'assets/models/Meshy_AI_Shell_affixed_to_meta_1120123606_generate-maximum-compressed.glb');
const OUT = path.join(ROOT, 'client/js/render/shellModel.data.js');

const m = await readCompressed(SRC);
const P = m.P;
console.log(`${path.basename(SRC)}: ${m.T.length / 3} triangles`);

// Its axis: a circle fitted to the front of its body, clear of the plaque
// and of the clamps.
const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
for (let i = 0; i < P.length; i += 3) {
  const y = P[i + 1];
  if (y < -0.45 || y > -0.05 || P[i + 2] < 0.12) continue;
  const x = P[i], z = P[i + 2];
  const r = [x, z, 1], q = -(x * x + z * z);
  for (let a = 0; a < 3; a++) { for (let c = 0; c < 3; c++) A[a][c] += r[a] * r[c]; b[a] += r[a] * q; }
}
const M = A.map((r, i) => [...r, b[i]]);
for (let i = 0; i < 3; i++) {
  const p = M[i][i];
  for (let j = i; j < 4; j++) M[i][j] /= p;
  for (let k = 0; k < 3; k++) if (k !== i) { const f = M[k][i]; for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j]; }
}
const cx = -M[0][3] / 2, cz = -M[1][3] / 2;
console.log(`axis at x ${cx.toFixed(4)}, z ${cz.toFixed(4)}`);

// How far out it is along its length, off the half of it facing out.
const BINS = 140;
let y0 = Infinity, y1 = -Infinity;
const pts = [];
for (let i = 0; i < P.length; i += 3) {
  const dx = P[i] - cx, dz = P[i + 2] - cz;
  if (dz <= 0 || Math.abs(Math.atan2(dx, dz)) > 1.0) continue;
  const r = Math.hypot(dx, dz);
  if (r > 0.2) continue;
  pts.push([P[i + 1], r]);
  y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]);
}
const prof = [];
for (let k = 0; k <= BINS; k++) {
  const ya = y0 + ((y1 - y0) * (k - 0.5)) / BINS, yb = y0 + ((y1 - y0) * (k + 0.5)) / BINS;
  let r = 0;
  for (const [y, q] of pts) if (y >= ya && y < yb && q > r) r = q;
  prof.push([y0 + ((y1 - y0) * k) / BINS, r]);
}
// Bins nothing fell in, from their neighbours; the point and the middle of
// the base closed.
for (let k = 1; k < prof.length - 1; k++) if (!prof[k][1]) prof[k][1] = (prof[k - 1][1] + prof[k + 1][1]) / 2;
prof[prof.length - 1][1] = 0;
// Smoothed a little along its length: each bin's radius is the outermost
// point that happened to fall in it, which wanders by a hair from bin to bin.
for (let pass = 0; pass < 2; pass++) {
  const r = prof.map((p) => p[1]);
  for (let k = 1; k < prof.length - 1; k++) prof[k][1] = (r[k - 1] + 2 * r[k] + r[k + 1]) / 4;
}
// Nose first, a metre long, centred.
const L = y1 - y0;
let ring = prof.map(([y, r]) => [(y - y0) / L - 0.5, r / L]).reverse();
// Only the points that bend it (Douglas-Peucker): the rest are on a
// straight line between their neighbours, near enough.
const dp = (a, c) => {
  let worst = -1, at = -1;
  for (let k = a + 1; k < c; k++) {
    const t = (ring[k][0] - ring[a][0]) / ((ring[c][0] - ring[a][0]) || 1e-9);
    const d = Math.abs(ring[a][1] + (ring[c][1] - ring[a][1]) * t - ring[k][1]);
    if (d > worst) { worst = d; at = k; }
  }
  return worst > 0.0014 ? [...dp(a, at), ...dp(at, c).slice(1)] : [ring[a], ring[c]];
};
const keep = dp(0, ring.length - 1);
ring = keep.map(([z, r]) => [+z.toFixed(4), +r.toFixed(4)]);
// The base, flat, back to the axis.
ring.push([ring[ring.length - 1][0], 0]);
let rmax = 0;
for (const [, r] of ring) rmax = Math.max(rmax, r);
console.log(`${ring.length} profile points; ${(1 / (2 * rmax)).toFixed(2)} calibres long`);
writeFileSync(OUT, '// Written by build/prepare-shell.mjs from the owner\'s shell model: its profile,\n'
  + '// [z, radius] nose first along +Z, a metre long and centred on its middle.\n'
  + `export const SHELL_PROFILE = ${JSON.stringify(ring)};\n`);
console.log(`wrote ${path.relative(ROOT, OUT)}`);
