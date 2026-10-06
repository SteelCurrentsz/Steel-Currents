// Take the owner's KMS Bismarck sculpts down to what the build works from.
//
//   npm i --no-save meshoptimizer@0.22          (see build/sculpt-source.mjs)
//   node build/bismarck-source.mjs <Bismarck.glb> <forward superstructure.glb> \
//     <38cm twin.glb> <15cm twin.glb> <10.5cm twin.glb> [<Tirpitz quad tubes.glb>]
//
// Any of them may be given as `-`, which leaves the asset made from it as it
// is: the sculpts are not committed (they are 10 to 60 MB), and one can be
// taken down again without the others to hand.
//
// She came as these sculpts:
//
//   * the whole of her -- hull, turrets, superstructure, masts -- a single
//     welded mesh of a million and a fifth triangles, bare of any colour,
//     whose upperworks melted: her tower is a sponge, her mainmast a lattice
//     of drips, and every wire she was rigged with is a tube fused into both.
//     Only her hull is taken from it, as the owner asked;
//   * her forward superstructure -- from the deck plates either side of
//     Bruno's barbette aft past her funnel: her conning tower, her bridge, her
//     tower mast and foretop, her funnel with its searchlight platforms, her
//     boats and the domes of her flak directors -- two and a half million
//     triangles drawn whole and closed, standing on her upper deck;
//   * her 38 cm twin turret, her 15 cm twin turret and her 10.5 cm twin
//     mounting, each on its own;
//   * and the quadruple 53.3 cm torpedo tube mounting her sister Tirpitz was
//     given in 1942, on its own, tubes along X with their muzzles at -X.
//
// Here the whole of her is painted, as she was in May 1941 after her Baltic
// stripes were painted out: red below her boot topping, black boot topping
// through her waterline, and grey over it (her decks are laid afresh in
// build/prepare-bismarck-hull.mjs, where a deck is a thing that can be told
// from a wall). In order:
//
//   * everything of her standing clear of her upper deck is taken off -- her
//     turrets, her melted superstructure, her masts and her rigging -- which
//     leaves the decimator her hull to spend its budget on;
//   * she is cut along two level lines -- the bottom and top of her boot
//     topping -- so both are straight and exactly where they are, and every
//     triangle is given the paint of the band it lies in;
//   * each point where two paints meet is split into one point per paint, so
//     the decimator keeps each line where it is;
//   * and she is decimated to the budget the fleet renders at.
//
// Everything else is decimated, and nothing is moved: each keeps its own
// frame, and build/prepare-bismarck-hull.mjs puts it where it goes.
//
// Writes, into assets/models/:
//
//   bismarck-hull.glb      her hull, with her paint on every point as the
//                          attribute _PAINT (see PAINTS)
//   bismarck-super.glb     her forward superstructure
//   bismarck-38.glb        her 38 cm twin turret
//   bismarck-15.glb        her 15 cm twin turret, off the platform it was
//                          sculpted on
//   bismarck-105.glb       her 10.5 cm twin mounting
//   tirpitz-tubes.glb      Tirpitz's quadruple torpedo tubes
//
// Coordinates here are each sculpt's own. The whole of her: length along X
// with her bow at -X, Y up, beam along Z, 1.90 units stem to stern.
import path from 'node:path';
import {
  ROOT, simplifier, readSource, writeGlb as writeSourceGlb, splitAt, splitByPaint, weldByPaint,
  decimate as decimateWith,
} from './sculpt-source.mjs';

const MeshoptSimplifier = await simplifier();
const writeGlb = (file, m) => writeSourceGlb(file, m, 'build/bismarck-source.mjs');
const decimate = (m, ratio, error, normalWeight = 0) => decimateWith(MeshoptSimplifier, m, ratio, error, normalWeight);
const out = (name) => path.join(ROOT, 'assets/models', name);

const [SRC, SUPER_SRC, MAIN_SRC, SEC_SRC, FLAK_SRC, TUBES_SRC] = process.argv.slice(2);
if (!FLAK_SRC) {
  console.error('usage: node build/bismarck-source.mjs <Bismarck.glb> <forward superstructure.glb> '
    + '<38cm.glb> <15cm.glb> <10.5cm.glb> [<quad tubes.glb>]   (- for any of them to leave its asset as it is)');
  process.exit(1);
}
const given = (src) => src && src !== '-';

/** Her paints, as build/prepare-bismarck-hull.mjs and the data file number them. */
export const PAINTS = ['grey', 'deck', 'steel deck', 'boot', 'red'];
const GREY = 0, BOOT = 3, RED = 4;

// A unit of the sculpt is 132.1 m of her: 251 m stem to stern over 1.9001.
// Her keel is flat at -0.20075, and she is floated at her 9.3 m design draft.
// The boot topping runs from nine tenths of a metre under her waterline to
// nine tenths over it.
const S = 251 / 1.9000584;
const KEEL = -0.20075;
const WL = KEEL + 9.3 / S;
const BOOT_LO = WL - 0.9 / S;
const BOOT_HI = WL + 0.9 / S;
const XC = -0.00092;

// Her gunwale over her keel, metres, along her: level at 15 m from her stern
// to sixty metres forward of the middle of her, and rising from there to her
// stem head, as the sculpt has it. What stands more than a hand over it comes
// off here; build/prepare-bismarck-hull.mjs takes her down to it exactly.
const SHEER = [[-130, 15.25], [-123, 15.25], [-122, 15.0], [60, 15.0], [63, 15.25], [77, 15.5], [84, 15.75], [88, 16.0],
  [92, 16.25], [96, 16.5], [99, 16.75], [102, 17.0], [106, 17.25], [109, 17.5], [111, 17.75], [113, 18.0], [116, 18.25],
  [118, 18.5], [120, 18.75], [122, 19.0], [124, 19.25], [130, 19.5]];
const sheerAt = (z) => {
  for (let i = 1; i < SHEER.length; i++) {
    if (z > SHEER[i][0]) continue;
    const [a, ya] = SHEER[i - 1], [b, yb] = SHEER[i];
    return ya + (yb - ya) * (z - a) / (b - a);
  }
  return SHEER[SHEER.length - 1][1];
};

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

// ---- her hull ---------------------------------------------------------------------
if (given(SRC)) {
  const raw = readSource(SRC);
  console.log('sculpt', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  // Off with everything standing on her: a triangle whose middle is more than
  // thirty centimetres over her gunwale where it is.
  const hull = crop(raw, (x, y) => (y - KEEL) * S < sheerAt(-(x - XC) * S) + 0.3);
  console.log('her hull:', hull.T.length / 3, 'triangles under her gunwale');
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
  writeGlb(out('bismarck-hull.glb'),
    decimate(painted, +(process.env.HULL_RATIO || 0.12), +(process.env.HULL_ERROR || 0.00025), +(process.env.HULL_NW ?? 0.02)));
}

// ---- her forward superstructure ---------------------------------------------------
// Bow at -Z, Y up. It stands on her upper deck at its lowest, -0.556, and is
// kept whole: its railings and ladders hold up at the budget it is taken down
// to, which is a twentieth of it.
if (given(SUPER_SRC)) {
  const raw = readSource(SUPER_SRC);
  console.log('superstructure', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  writeGlb(out('bismarck-super.glb'),
    decimate(raw, +(process.env.SUPER_RATIO || 0.05), +(process.env.SUPER_ERROR || 0.002)));
}

// ---- her guns ----------------------------------------------------------------------
// Each on its own, barrels along -X. The 15 cm turret was sculpted on a slab
// of deck with a rail round it, which is not hers and is taken off at its top.
if (given(MAIN_SRC)) {
  writeGlb(out('bismarck-38.glb'), decimate(readSource(MAIN_SRC), +(process.env.MAIN_RATIO || 0.03), 0.004));
}
if (given(SEC_SRC)) {
  const sec = crop(readSource(SEC_SRC), (x, y) => y > -0.24);
  writeGlb(out('bismarck-15.glb'), decimate(sec, +(process.env.SEC_RATIO || 0.012), 0.004));
}
if (given(FLAK_SRC)) {
  writeGlb(out('bismarck-105.glb'), decimate(readSource(FLAK_SRC), +(process.env.FLAK_RATIO || 0.008), 0.004));
}
if (given(TUBES_SRC)) {
  writeGlb(out('tirpitz-tubes.glb'), decimate(readSource(TUBES_SRC), +(process.env.TUBES_RATIO || 0.006), 0.002));
}
