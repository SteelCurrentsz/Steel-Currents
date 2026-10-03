// Take the owner's IJN Musashi sculpts down to what the build works from.
//
//   npm i --no-save meshoptimizer@0.22          (see build/sculpt-source.mjs)
//   node build/musashi-source.mjs <Musashi.glb> <MusashiSuperstructure.glb> \
//     <Musashi&YamatoBridge.glb> <15.5cm triple.glb> <12.7cm twin.glb> <25mm pod.glb>
//
// She came as six sculpts, none of them committed (they are 30 to 140 MB):
//
//   * the whole of her -- hull, turrets, superstructure -- a single welded
//     mesh of a million and a third triangles, bare of any colour, whose
//     superstructure melted: her tower is a sponge, her mainmast a lattice of
//     drips, and every wire she was rigged with is a tube fused into both;
//   * her superstructure alone, from abaft No.2 to forward of No.3, on a slab
//     of her hull: sharper, and what her funnel, her after superstructure and
//     every gun platform she has are built from;
//   * her bridge tower, twice over, side by side: what her tower is;
//   * and her 15.5 cm triple, her 12.7 cm twin and her shielded 25 mm triple,
//     each on its own.
//
// Here the whole of her is painted, as she was at Kure in 1942: red below her
// boot topping, black boot topping through her waterline, and Kure grey over
// it (her decks are laid on after she is smoothed, in
// build/prepare-musashi-hull.mjs, where a deck is a thing that can be told
// from a wall). In order:
//
//   * she is cut along two level lines -- the bottom and top of her boot
//     topping -- so both are straight and exactly where they are, and every
//     triangle is given the paint of the band it lies in;
//   * each point where two paints meet is split into one point per paint, so
//     the decimator keeps each line where it is;
//   * and she is decimated to the budget the fleet renders at, and the lengths
//     of her with her main turrets on them much less.
//
// Of the superstructure, only what stands on her deck is kept, and only her
// starboard side and a hand past her centreline: build/prepare-musashi-hull.mjs
// cuts it at her centreline and builds her port side as its mirror, because
// the sculpt drew her port side as something else -- her 12.7 cm on a deck
// lower, and platforms on posts where her starboard ones stand on deckhouses --
// and the two sides of the ship were alike. Of the bridge sculpt only the
// first of the two towers is kept. Everything else is decimated, and nothing
// is moved: each keeps its own frame, and prepare-musashi-hull.mjs puts it
// where it goes.
//
// Writes, into assets/models/:
//
//   musashi-hull.glb      the whole of her, with her paint on every point as
//                         the attribute _PAINT (see PAINTS)
//   musashi-turrets.glb   her forecastle with No.1 and No.2 on it and her
//                         quarterdeck with No.3, finer, painted the same
//   musashi-super.glb     her superstructure, starboard side, above her deck
//   musashi-bridge.glb    her bridge tower
//   musashi-155.glb       her 15.5 cm triple
//   musashi-127.glb       her 12.7 cm twin
//   musashi-25pod.glb     her shielded 25 mm triple
//
// Coordinates here are each sculpt's own. The whole of her: length along X
// with her bow at -X, Y up, beam along Z, 1.90 units stem to stern.
import path from 'node:path';
import {
  ROOT, simplifier, readSource, writeGlb as writeSourceGlb, splitAt, splitByPaint, weldByPaint,
  decimate as decimateWith,
} from './sculpt-source.mjs';

const MeshoptSimplifier = await simplifier();
const writeGlb = (file, m) => writeSourceGlb(file, m, 'build/musashi-source.mjs');
const decimate = (m, ratio, error, normalWeight = 0) => decimateWith(MeshoptSimplifier, m, ratio, error, normalWeight);
const out = (name) => path.join(ROOT, 'assets/models', name);

const [SRC, SUPER_SRC, BRIDGE_SRC, SEC6_SRC, SEC5_SRC, POD_SRC] = process.argv.slice(2);
if (!POD_SRC) {
  console.error('usage: node build/musashi-source.mjs <Musashi.glb> <MusashiSuperstructure.glb> '
    + '<Musashi&YamatoBridge.glb> <15.5cm.glb> <12.7cm.glb> <25mm pod.glb>');
  process.exit(1);
}

/** Her paints, as build/prepare-musashi-hull.mjs and the data file number them. */
export const PAINTS = ['grey', 'deck', 'steel deck', 'boot', 'red'];
const GREY = 0, BOOT = 3, RED = 4;

// A unit of the sculpt is 138.35 m of her: 263 m stem to stern over 1.9010.
// Her keel is flat at -0.19335, and she is floated at her 10.4 m design draft.
// The boot topping runs from a metre under her waterline to a metre over it.
const S = 263 / 1.9010;
const KEEL = -0.19335;
const WL = KEEL + 10.4 / S;
const BOOT_LO = WL - 1.0 / S;
const BOOT_HI = WL + 1.0 / S;
// Her main turrets, with some of her round them: No.1 and No.2 on her
// forecastle and No.3 on her quarterdeck, along her; and no further out than
// their barbettes.
const TURRET_SPANS = [[-0.545, -0.13], [0.375, 0.645]];
const TURRET_HALF = 0.08;

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

// ---- her --------------------------------------------------------------------------
{
  const raw = readSource(SRC);
  console.log('sculpt', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  for (const y of [BOOT_LO, BOOT_HI]) console.log(`cut level at ${y.toFixed(4)}: ${splitAt(raw, y)} triangles split`);
  const paint = new Uint8Array(raw.T.length / 3);
  const tally = [0, 0, 0, 0, 0];
  for (let t = 0; t < raw.T.length / 3; t++) {
    let cy = 0;
    for (let j = 0; j < 3; j++) cy += raw.P[raw.T[t * 3 + j] * 3 + 1] / 3;
    paint[t] = cy < BOOT_LO ? RED : cy < BOOT_HI ? BOOT : GREY;
    tally[paint[t]]++;
  }
  console.log('paint:', PAINTS.map((p, k) => `${p} ${tally[k]}`).join(', '));
  const painted = weldByPaint(splitByPaint(raw, paint));
  console.log('painted', painted.P.length / 3, 'points');

  const hull = decimate(painted, +(process.env.HULL_RATIO || 0.075), +(process.env.HULL_ERROR || 0.0004), +(process.env.HULL_NW ?? 0.02));
  writeGlb(out('musashi-hull.glb'), hull);

  // Her forecastle with No.1 and No.2 on it, and her quarterdeck with No.3,
  // from a metre over her waterline up: more of her than the turrets, which
  // is what lets them be cut out of it cleanly.
  const turrets = decimate(crop(painted, (x, y, z) => TURRET_SPANS.some(([a, b]) => x > a && x < b)
    && Math.abs(z) < TURRET_HALF && y > WL + 1 / S), +(process.env.TURRET_RATIO || 0.3), 0.00012);
  writeGlb(out('musashi-turrets.glb'), turrets);
}

// ---- her superstructure -------------------------------------------------------------
// Bow at +X, Y up; her starboard side is +Z. Her deck is at -0.111 on her
// centreline and -0.133 at her side: what stands on it, from a hand under it,
// and her starboard side with her centreline in it.
{
  const raw = readSource(SUPER_SRC);
  console.log('superstructure', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  const above = crop(raw, (x, y, z) => y > -0.15 && z > -0.03);
  console.log('above her deck, starboard:', above.T.length / 3, 'triangles');
  writeGlb(out('musashi-super.glb'), decimate(above, +(process.env.SUPER_RATIO || 0.035), +(process.env.SUPER_ERROR || 0.0006)));
}

// ---- her bridge tower -------------------------------------------------------------------
// Two towers side by side, one turned half round from the other; the first,
// at -X, faces -X, which is ahead.
{
  const raw = readSource(BRIDGE_SRC);
  console.log('bridge', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  const tower = crop(raw, (x) => x < -0.02);
  console.log('the first tower:', tower.T.length / 3, 'triangles');
  writeGlb(out('musashi-bridge.glb'), decimate(tower, +(process.env.BRIDGE_RATIO || 0.018), +(process.env.BRIDGE_ERROR || 0.0015)));
}

// ---- her guns ----------------------------------------------------------------------
// The 15.5 cm triple and the 12.7 cm twin, each on its own; the 25 mm pod is
// four of the same pod side by side, and the first is kept.
{
  const sec6 = readSource(SEC6_SRC);
  writeGlb(out('musashi-155.glb'), decimate(sec6, +(process.env.SEC6_RATIO || 0.0045), 0.006));
  const sec5 = readSource(SEC5_SRC);
  writeGlb(out('musashi-127.glb'), decimate(sec5, +(process.env.SEC5_RATIO || 0.003), 0.008));
  const pod = crop(readSource(POD_SRC), (x, y, z) => x > 0.06 && z < -0.2);
  writeGlb(out('musashi-25pod.glb'), decimate(pod, +(process.env.POD_RATIO || 0.0016), 0.008));
}
