// Take the owner's USS Massachusetts sculpt down to what the build works from.
//
//   npm i --no-save meshoptimizer@0.22          (see build/sculpt-source.mjs)
//   node build/massachusetts-source.mjs <Massachusetts.glb>
//
// The sculpt (a single welded mesh of a million triangles, not committed: it
// is 26 MB) is bare -- no texture, no colours at all -- so she is painted
// here, in Measure 22 as she wore it in 1944 and 1945: red lead below the boot
// topping, black boot topping through her waterline, 5-N navy blue from there
// up to a level line at the height of the lowest point of her main deck edge,
// and haze grey over everything above it (the deck blue on her decks is laid
// on after she is smoothed, in build/prepare-massachusetts-hull.mjs, where a
// deck is a thing that can be told from a wall). In order:
//
//   * she is cut along three level lines -- the bottom and top of her boot
//     topping, and the Measure 22 line -- so all three are straight and
//     exactly where they are, and every triangle is given the paint of the
//     band it lies in;
//   * each point where two paints meet is split into one point per paint, so
//     the decimator keeps each line where it is;
//   * and she is decimated to the budget the fleet renders at, and the lengths
//     of her with her turrets on them much less.
//
// Her twin 5-inch is the owner's sculpt of the mount the Baltimore carries --
// the same file -- and the prepared one in assets/models/baltimore-5inch.glb
// is what she is built with.
//
// Writes, into assets/models/:
//
//   massachusetts-hull.glb     the whole of her, with her paint on every point
//                              as the attribute _PAINT (see PAINTS)
//   massachusetts-turrets.glb  her forecastle with turrets 1 and 2 on it and
//                              her quarterdeck with turret 3, finer, painted
//                              the same
//
// Coordinates here are the sculpt's own: length along X with her bow at -X,
// Y up, beam along Z, 1.89 units stem to stern.
import path from 'node:path';
import {
  ROOT, simplifier, readSource, writeGlb as writeSourceGlb, splitAt, splitByPaint, weldByPaint,
  decimate as decimateWith,
} from './sculpt-source.mjs';

const MeshoptSimplifier = await simplifier();
const writeGlb = (file, m) => writeSourceGlb(file, m, 'build/massachusetts-source.mjs');
const decimate = (m, ratio, error, normalWeight = 0) => decimateWith(MeshoptSimplifier, m, ratio, error, normalWeight);

const [SRC] = process.argv.slice(2);
if (!SRC) {
  console.error('usage: node build/massachusetts-source.mjs <Massachusetts.glb>');
  process.exit(1);
}

/** Her paints, as build/prepare-massachusetts-hull.mjs and the data file number them. */
export const PAINTS = ['grey', 'navy', 'deck', 'boot', 'red'];
const GREY = 0, NAVY = 1, BOOT = 3, RED = 4;

// A unit of the sculpt is 109.45 m of her: 207.26 m stem to stern over
// 1.8937. Her keel is flat at -0.2208, and she is floated at 9.0 m -- the
// sculpt draws her 14.4 m deep to her main deck edge, and at her 10.3 m
// design draft that would leave her four metres of freeboard, which is not the
// ship. The boot
// topping runs from a metre under her waterline to most of a metre over it;
// Measure 22's line is at the lowest point of her main deck edge, -0.0900, a
// hand under it, so her deck edge is grey.
const S = 207.26 / 1.8937;
const KEEL = -0.2208;
const WL = KEEL + 9.0 / S;
const BOOT_LO = WL - 1.0 / S;
const BOOT_HI = WL + 0.8 / S;
const M22 = -0.0900 - 0.1 / S;
// Her turrets, with some of her round them: No.1 and No.2 on her forecastle
// and No.3 on her quarterdeck, along her; and no further out than her
// barbettes.
const TURRET_SPANS = [[-0.62, -0.12], [0.25, 0.66]];
const TURRET_HALF = 0.075;

// ---- her --------------------------------------------------------------------------
const raw = readSource(SRC);
console.log('sculpt', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
for (const y of [BOOT_LO, BOOT_HI, M22]) console.log(`cut level at ${y.toFixed(4)}: ${splitAt(raw, y)} triangles split`);
const paint = new Uint8Array(raw.T.length / 3);
const tally = [0, 0, 0, 0, 0];
for (let t = 0; t < raw.T.length / 3; t++) {
  let cy = 0;
  for (let j = 0; j < 3; j++) cy += raw.P[raw.T[t * 3 + j] * 3 + 1] / 3;
  paint[t] = cy < BOOT_LO ? RED : cy < BOOT_HI ? BOOT : cy < M22 ? NAVY : GREY;
  tally[paint[t]]++;
}
console.log('paint:', PAINTS.map((p, k) => `${p} ${tally[k]}`).join(', '));
const painted = weldByPaint(splitByPaint(raw, paint));
console.log('painted', painted.P.length / 3, 'points');

const hull = decimate(painted, +(process.env.HULL_RATIO || 0.08), +(process.env.HULL_ERROR || 0.0004), +(process.env.HULL_NW ?? 0.02));
writeGlb(path.join(ROOT, 'assets/models/massachusetts-hull.glb'), hull);

// Her forecastle with turrets 1 and 2 on it, and her quarterdeck with turret
// 3, from a metre over her waterline up: more of her than the turrets, which
// is what lets them be cut out of it cleanly.
{
  const keep = [];
  const P = painted.P, T = painted.T;
  for (let t = 0; t < T.length; t += 3) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) { const v = T[t + k]; cx += P[v * 3] / 3; cy += P[v * 3 + 1] / 3; cz += P[v * 3 + 2] / 3; }
    const on = TURRET_SPANS.some(([a, b]) => cx > a && cx < b);
    if (on && Math.abs(cz) < TURRET_HALF && cy > WL + 1 / S) keep.push(T[t], T[t + 1], T[t + 2]);
  }
  const turrets = decimate({ ...painted, T: keep }, +(process.env.TURRET_RATIO || 0.25), 0.00012);
  writeGlb(path.join(ROOT, 'assets/models/massachusetts-turrets.glb'), turrets);
}
