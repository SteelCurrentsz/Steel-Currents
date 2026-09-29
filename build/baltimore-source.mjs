// Take the owner's USS Baltimore sculpt, and the sculpt of her twin 5-inch
// mount, down to what the build works from.
//
//   npm i --no-save meshoptimizer@0.22          (see build/sculpt-source.mjs)
//   node build/baltimore-source.mjs <BaltimoreUSS.glb> <5inchDoubleBarrelUS.glb>
//
// The sculpt of her (a single welded mesh of 749 thousand triangles, not
// committed: it is 18 MB) is bare -- no texture, no colours at all -- so she
// is painted here, in Measure 22 as the fleet's other American cruiser is:
// red lead below the boot topping, black boot topping through her waterline,
// 5-N navy blue from there up to a level line at the height of the lowest
// point of her main deck edge, and grey over everything above it (the deck
// blue on her decks is laid on after she is smoothed, in
// build/prepare-baltimore-hull.mjs, where a deck is a thing that can be told
// from a wall). In order:
//
//   * she is cut along three level lines -- the bottom and top of her boot
//     topping, and the Measure 22 line -- so all three are straight and
//     exactly where they are, and every triangle is given the paint of the
//     band it lies in;
//   * each point where two paints meet is split into one point per paint, so
//     the decimator keeps each line where it is;
//   * she is decimated to the budget the fleet renders at, and the lengths of
//     her with her turrets on them much less;
//   * and her 5-inch mount is decimated on its own.
//
// Writes, into assets/models/:
//
//   baltimore-hull.glb     the whole of her, with her paint on every point as
//                          the attribute _PAINT (see PAINTS)
//   baltimore-turrets.glb  her forecastle with turrets 1 and 2 on it and her
//                          quarterdeck with turret 3, finer, painted the same
//   baltimore-5inch.glb    her twin 5-inch/38, decimated
//
// Coordinates here are the sculpt's own: length along X with her bow at -X,
// Y up, beam along Z, 1.9 units stem to stern.
import path from 'node:path';
import {
  ROOT, simplifier, readSource, writeGlb as writeSourceGlb, splitAt, splitByPaint, weldByPaint,
  decimate as decimateWith,
} from './sculpt-source.mjs';

const MeshoptSimplifier = await simplifier();
const writeGlb = (file, m) => writeSourceGlb(file, m, 'build/baltimore-source.mjs');
const decimate = (m, ratio, error, normalWeight = 0) => decimateWith(MeshoptSimplifier, m, ratio, error, normalWeight);

const [SRC, GUN_SRC] = process.argv.slice(2);
if (!SRC || !GUN_SRC) {
  console.error('usage: node build/baltimore-source.mjs <BaltimoreUSS.glb> <5inchDoubleBarrelUS.glb>');
  process.exit(1);
}

/** Her paints, as build/prepare-baltimore-hull.mjs and the data file number them. */
export const PAINTS = ['grey', 'navy', 'deck', 'boot', 'red'];
const GREY = 0, NAVY = 1, BOOT = 3, RED = 4;

// A unit of the sculpt is 108.06 m of her: 205.3 m stem to stern over 1.8999.
// Her keel is flat at -0.2084, and she draws 7.3 m. The boot topping runs from
// most of a metre under her waterline to seven tenths over it; Measure 22's
// line is at the lowest point of her main deck edge, 5.5 m up, from amidships
// aft -- a hand under it, so her deck edge is grey.
const S = 205.3 / 1.8999;
const WL = -0.2084 + 7.3 / S;
const BOOT_LO = WL - 0.9 / S;
const BOOT_HI = WL + 0.7 / S;
const M22 = WL + 5.45 / S;

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

const hull = decimate(painted, +(process.env.HULL_RATIO || 0.11), +(process.env.HULL_ERROR || 0.0004), +(process.env.HULL_NW ?? 0.02));
writeGlb(path.join(ROOT, 'assets/models/baltimore-hull.glb'), hull);

// Her forecastle, from a metre over her waterline up, with turrets 1 and 2 on
// it, and her quarterdeck with turret 3: more of her than the turrets, which
// is what lets them be cut out of it cleanly.
{
  const keep = [];
  const P = painted.P, T = painted.T;
  for (let t = 0; t < T.length; t += 3) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) { const v = T[t + k]; cx += P[v * 3] / 3; cy += P[v * 3 + 1] / 3; cz += P[v * 3 + 2] / 3; }
    const fwd = cx > -0.67 && cx < -0.32, aft = cx > 0.42 && cx < 0.62;
    if ((fwd || aft) && Math.abs(cz) < 0.05 && cy > WL + 1 / S) keep.push(T[t], T[t + 1], T[t + 2]);
  }
  const turrets = decimate({ ...painted, T: keep }, +(process.env.TURRET_RATIO || 0.3), 0.00012);
  writeGlb(path.join(ROOT, 'assets/models/baltimore-turrets.glb'), turrets);
}

// ---- her 5-inch mount --------------------------------------------------------------
// Six of it on her, five metres of gunhouse each: a hundredth of the sculpt's
// four hundred thousand triangles still has every face of the shield, its
// hatches and its sight hoods.
{
  const gun = readSource(GUN_SRC);
  console.log('5-inch', gun.P.length / 3, 'points', gun.T.length / 3, 'triangles');
  const out = decimate({ P: gun.P, N: gun.N, T: gun.T, paint: null },
    +(process.env.GUN_RATIO || 0.014), 0.0015);
  writeGlb(path.join(ROOT, 'assets/models/baltimore-5inch.glb'), out);
}
