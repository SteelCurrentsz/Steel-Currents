// Take the owner's KMS Graf Zeppelin sculpt down to what the build works from.
//
//   npm i --no-save meshoptimizer@0.22          (see build/sculpt-source.mjs)
//   node build/grafzeppelin-source.mjs <GrafZepplin.glb>
//
// She came as one sculpt: the whole of her -- hull, flight deck, island,
// funnel, galleries, sponsons, screws and rudder -- a single welded mesh of a
// million triangles, bare of any colour, standing on a display stand of eight
// pads on a base plate that is welded to her keel. Her flight deck has what a
// sculptor's clay leaves on it: a crushed aeroplane standing on its nose over
// her after lift, a heap where her middle lift is, and twisted frame-work
// along both edges aft. Her 15 cm and her light flak are cast in as lumps.
//
// Here only the stand comes off -- everything of her lower than a hand under
// the flat of her bottom, which is the base plate and the pads, and the bar
// keel under her forefoot with them -- and she is taken down to a fifth of
// her triangles. Everything else is done in build/prepare-grafzeppelin-hull.mjs,
// where her deck is a thing that can be told from her side.
//
// Writes assets/models/grafzeppelin-hull.glb. Coordinates are the sculpt's
// own: length along X with her bow at -X, Y up, beam along Z with her
// starboard side (her island) at -Z, 1.9025 units from her stem to the after
// end of her flight deck.
import path from 'node:path';
import {
  ROOT, simplifier, readSource, writeGlb as writeSourceGlb, decimate as decimateWith,
} from './sculpt-source.mjs';
import { subMesh } from './sculpt-parts.mjs';
import { components } from './sculpt.mjs';

const MeshoptSimplifier = await simplifier();
const writeGlb = (file, m) => writeSourceGlb(file, m, 'build/grafzeppelin-source.mjs');
const decimate = (m, ratio, error, normalWeight = 0) => decimateWith(MeshoptSimplifier, m, ratio, error, normalWeight);

const SRC = process.argv[2];
if (!SRC) {
  console.error('usage: node build/grafzeppelin-source.mjs <GrafZepplin.glb>');
  process.exit(1);
}

/**
 * The flat of her bottom, and the stretch of her the stand stands under: its
 * base plate's length, and how high its pads' arms hug her bilges. The plate's
 * top is a lumpy sheet as high as her bottom in places, and the pads are
 * welded to her -- their tops are her bottom where they stood, their arms her
 * bilge -- so over that stretch she cannot be told from her stand by any
 * test of a triangle. Her underbody there is taken off whole, stand and all,
 * from her bottom up to over the arms, and drawn afresh off her own sections
 * in the clear between the pads.
 */
export const BOTTOM = -0.2010;
const PLATE = { x0: -0.253, x1: 0.463 };
const ARM_TOP = -0.170;
/** Where she is in the clear: either end of the plate, and between each pad and the next. */
const CLEAR = [-0.259, -0.1705, -0.0815, 0.009, 0.100, 0.191, 0.2835, 0.376, 0.469];
/** How far the new underbody runs in under what is kept of her, all round it, and how far inside her plating. */
const LAP = 0.004, INSET = 0.00015;

const raw = readSource(SRC);
console.log('sculpt', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');

/**
 * Her section at x, under `top`: how far out her side is each way at height
 * y -- cut through her triangles, not read off whichever points fall near x --
 * a fiftieth of a hundredth of a unit of height at a time.
 */
function sectionAt(x, top) {
  const BIN = 0.0002, n = Math.ceil((top - BOTTOM) / BIN) + 1;
  const port = new Float32Array(n), stbd = new Float32Array(n);
  const { P, T } = raw;
  // Each triangle crossing the station leaves a segment of her section;
  // every height bin a segment spans takes how far out the segment is there.
  const mark = (y, z) => {
    const k = Math.round((y - BOTTOM) / BIN);
    if (k < 0 || k >= n) return;
    if (z > 0) port[k] = Math.max(port[k], z); else stbd[k] = Math.max(stbd[k], -z);
  };
  for (let t = 0; t < T.length; t += 3) {
    const pts = [];
    for (let j = 0; j < 3; j++) {
      const a = T[t + j] * 3, b = T[t + (j + 1) % 3] * 3;
      if ((P[a] - x) * (P[b] - x) > 0 || P[a] === P[b]) continue;
      const u = (x - P[a]) / (P[b] - P[a]);
      pts.push([P[a + 1] + (P[b + 1] - P[a + 1]) * u, P[a + 2] + (P[b + 2] - P[a + 2]) * u]);
    }
    if (pts.length < 2) continue;
    const [[ya, za], [yb, zb]] = pts;
    const k0 = Math.ceil((Math.min(ya, yb) - BOTTOM) / BIN), k1 = Math.floor((Math.max(ya, yb) - BOTTOM) / BIN);
    mark(ya, za); mark(yb, zb);
    for (let k = Math.max(0, k0); k <= Math.min(n - 1, k1); k++) {
      const y = BOTTOM + k * BIN;
      if (Math.sign(za) !== Math.sign(zb)) continue;
      mark(y, za + (zb - za) * ((y - ya) / (yb - ya)));
    }
  }
  // Her keel is the lowest height her section reaches; aft of her middle it
  // lifts toward her run. Under it there is nothing of her.
  let kk = 0;
  while (kk < n - 1 && !port[kk] && !stbd[kk]) kk++;
  for (const h of [port, stbd]) for (let k = n - 2; k >= 0; k--) if (!h[k]) h[k] = h[k + 1];
  const at = (h) => (y) => h[Math.max(0, Math.min(n - 1, Math.round((y - BOTTOM) / BIN)))];
  return { port: at(port), stbd: at(stbd), keel: BOTTOM + kk * BIN };
}

// Off with her underbody over the stand: every triangle whose middle is in
// the stretch and under the arms' reach.
const cut = subMesh(raw, (t) => {
  let cx = 0, cy = 0;
  for (let j = 0; j < 3; j++) { const v = raw.T[t * 3 + j] * 3; cx += raw.P[v] / 3; cy += raw.P[v + 1] / 3; }
  return !(cx > PLATE.x0 && cx < PLATE.x1 && cy < ARM_TOP);
});
// She was one piece, stand and all; what the cut leaves standing apart from
// her is what was left of the stand.
const pieces = components(cut).sort((a, b) => b.tris.length - a.tris.length);
const hers = new Uint8Array(cut.T.length / 3);
for (const t of pieces[0].tris) hers[t] = 1;
const hull = subMesh(cut, (t) => hers[t]);
console.log(`without her stand: ${hull.T.length / 3} triangles; ${pieces.length - 1} pieces of it left apart from her dropped`);

// Her underbody, lofted afresh. A ring a station, from the top of her
// starboard side down it, across her flat bottom and up her port side, each
// point on the section she has in the clear either side of the station --
// the two of them weighed by how near each is -- and a hand inside it. It runs
// a little way in under what is kept of her at its ends and along its top,
// so there is never a gap between them to see the sea through.
{
  const top = ARM_TOP + LAP;
  const sections = CLEAR.map((x) => ({ x, ...sectionAt(x, top + 0.001) }));
  const NY = 48, NB = 14;
  const x0 = PLATE.x0 - LAP, x1 = PLATE.x1 + LAP;
  const NX = Math.ceil((x1 - x0) / 0.004);
  const P = [], T = [];
  const ringOf = (x) => {
    let i = 0;
    while (i < sections.length - 2 && sections[i + 1].x < x) i++;
    const a = sections[i], b = sections[i + 1];
    const u = Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)));
    const keel = a.keel * (1 - u) + b.keel * u;
    // Each section read at the same fraction of the way from its own keel to
    // the top, so where her keel lifts her bilge lifts with it.
    const w = (side, f) => a[side](a.keel + (top - a.keel) * f) * (1 - u) + b[side](b.keel + (top - b.keel) * f) * u - INSET;
    const yAt = (f) => keel + INSET + (top - keel - INSET) * f;
    const ring = [];
    for (let j = NY; j >= 0; j--) ring.push([x, yAt(j / NY), -w('stbd', j / NY)]);
    const zs = -w('stbd', 0), zp = w('port', 0);
    for (let j = 1; j < NB; j++) ring.push([x, yAt(0), zs + ((zp - zs) * j) / NB]);
    for (let j = 0; j <= NY; j++) ring.push([x, yAt(j / NY), w('port', j / NY)]);
    return ring;
  };
  let per = 0;
  for (let i = 0; i <= NX; i++) {
    const ring = ringOf(x0 + ((x1 - x0) * i) / NX);
    per = ring.length;
    for (const p of ring) P.push(p[0], p[1], p[2]);
  }
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < per - 1; j++) {
      const a = i * per + j, b = a + 1, c = a + per, d = c + 1;
      // Wound to face out of her: round from starboard to port is down and
      // across, so the quad faces away from her middle this way round.
      T.push(a, c, b, b, c, d);
    }
  }
  const N = new Array(P.length).fill(0);
  const loft = { P, N, T };
  // Area-weighted face normals at each point.
  for (let t = 0; t < T.length; t += 3) {
    const [a, b, c] = [T[t] * 3, T[t + 1] * 3, T[t + 2] * 3];
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) N[v + k] += f[k];
  }
  // Which way round that is, checked rather than trusted: the middle of her
  // bottom faces down.
  const mid = Math.floor(NX / 2) * per + Math.floor(per / 2);
  if (N[mid * 3 + 1] > 0) {
    for (let t = 0; t < T.length; t += 3) { const k = T[t + 1]; T[t + 1] = T[t + 2]; T[t + 2] = k; }
    for (let i = 0; i < N.length; i++) N[i] = -N[i];
  }
  for (let i = 0; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
    N[i] /= l; N[i + 1] /= l; N[i + 2] /= l;
  }
  const base = hull.P.length / 3;
  for (let i = 0; i < loft.P.length; i++) { hull.P.push(loft.P[i]); hull.N.push(loft.N[i]); }
  for (const v of loft.T) hull.T.push(v + base);
  console.log(`her underbody over the stand lofted afresh: ${NX + 1} stations, ${loft.T.length / 3} triangles`);
}
writeGlb(path.join(ROOT, 'assets/models/grafzeppelin-hull.glb'),
  decimate(hull, +(process.env.HULL_RATIO || 0.2), +(process.env.HULL_ERROR || 0.00025), +(process.env.HULL_NW ?? 0.02)));
