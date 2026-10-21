// Take the owner's IJN Matsu sculpts down to what the build works from.
//
//   npm i --no-save meshoptimizer@0.22          (see build/sculpt-source.mjs)
//   node build/matsu-source.mjs <hull.glb> <12.7cm sheet.glb> <25mm.glb> <tubes.glb>
//
// Any of them may be given as `-`, which leaves the assets made from it as
// they are: the sculpts are not committed (they are 21 to 53 MB), and one can
// be taken down again without the others to hand.
//
// She came as four sculpts:
//
//   * her hull: the whole ship as she was in 1944, hull and decks, her
//     bridge, her two funnels, her masts, her deckhouses, her guns and her
//     tubes, textured, and rigged from her stem to her masts to her ensign
//     staff. Her hull, decks, bridge, funnels, masts and deckhouses are what
//     is taken from it; her guns and her tubes are the other sculpts', and
//     build/prepare-matsu-hull.mjs cuts those out;
//   * a sheet of 12.7 cm Type 89 mountings: the open twin with its two fuze
//     setters, a twin in its shield, a smaller copy of the shielded one, and
//     a pair of barrels on their cradle lying loose. The open twin is the
//     one on her after deckhouse and the shielded one the one on her
//     forecastle; the copy and the loose barrels are not hers;
//   * her 25 mm Type 96 triple, on its ring with its layers' seats;
//   * her 61 cm quadruple bank of tubes, its shield over the breeches.
//
// Here her hull is painted as she was in 1944 -- red below her boot topping,
// black boot topping through her waterline, grey over it -- and her texture
// is left behind (the fleet's grey and its steel plate go on in the game).
// In order:
//
//   * her rigging is taken off her while she is still fine enough to tell a
//     wire from a spar, and what only the wires held up goes with them;
//   * she is cut along two level lines -- the bottom and top of her boot
//     topping -- so both are straight and exactly where they are, and every
//     triangle is given the paint of the band it lies in;
//   * each point where two paints meet is split into one point per paint, so
//     the decimator keeps each line where it is;
//   * and she is decimated to the budget the fleet renders at.
//
// Writes, into assets/models/:
//
//   matsu-hull.glb     her hull, superstructure, funnels and masts, with her
//                      paint on every point as the attribute _PAINT (see PAINTS)
//   matsu-127s.glb     her 12.7 cm twin in its shield (forward)
//   matsu-127.glb      her 12.7 cm open twin (aft)
//   matsu-25.glb       her 25 mm triple
//   matsu-tubes.glb    her 61 cm quadruple bank
//
// Coordinates here are each sculpt's own, which for the hull is length along
// X with her bow at -X, Y up, beam along Z.
import path from 'node:path';
import {
  ROOT, simplifier, readSource, writeGlb as writeSourceGlb, splitAt, splitByPaint, weldByPaint,
  decimate as decimateWith,
} from './sculpt-source.mjs';
import { components } from './sculpt.mjs';
import { wires, subMesh } from './sculpt-parts.mjs';

const MeshoptSimplifier = await simplifier();
const writeGlb = (file, m) => writeSourceGlb(file, m, 'build/matsu-source.mjs');
const decimate = (m, ratio, error, normalWeight = 0) => decimateWith(MeshoptSimplifier, m, ratio, error, normalWeight);
const out = (name) => path.join(ROOT, 'assets/models', name);

const [HULL_SRC, GUN_SRC, AA_SRC, TUBE_SRC] = process.argv.slice(2);
if (!TUBE_SRC) {
  console.error('usage: node build/matsu-source.mjs <hull.glb> <12.7cm sheet.glb> <25mm.glb> <tubes.glb>'
    + '   (- for any of them to leave its assets as they are)');
  process.exit(1);
}
const given = (src) => src && src !== '-';

/** Her paints, as build/prepare-matsu-hull.mjs and the data file number them. */
export const PAINTS = ['grey', 'deck', 'steel deck', 'boot', 'red'];
const GREY = 0, BOOT = 3, RED = 4;

// A unit of the hull's sculpt is 52.6 m of her: 100 m stem to stern over
// 1.900. Her keel is flat at -0.2270, and she is floated at her 3.3 m draft.
// The boot topping runs from half a metre under her waterline to half a
// metre over it.
export const LOA = 100.0;
export const STEM = -0.951, STERN = 0.949;
const S = LOA / (STERN - STEM);
export const KEEL = -0.227;
const WL = KEEL + 3.3 / S;
const BOOT_LO = WL - 0.5 / S;
const BOOT_HI = WL + 0.5 / S;

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
/** Its one piece: whatever came away from the sheet with it, a sliver of the next, is left. */
function largest(m) {
  const [c] = components(m).sort((a, b) => b.tris.length - a.tris.length);
  const keep = new Uint8Array(m.T.length / 3);
  for (const t of c.tris) keep[t] = 1;
  return compactOf(subMesh(m, (t) => keep[t]));
}
/** The sculpt as read, without its texture: her paint is her own. */
const untextured = (file) => ({ ...readSource(file), UV: null, jpg: null });

// ---- her hull ---------------------------------------------------------------------
if (given(HULL_SRC)) {
  const raw = untextured(HULL_SRC);
  console.log('hull', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  let hull = compactOf(raw);
  // Her rigging, found on a copy of her in metres: every run of faces a
  // wire's thickness that runs out clear of what is under it, and every such
  // face aloft with next to nothing solid round it. A destroyer's wires are
  // the same wires as a battleship's, on a ship half as high.
  if (!process.env.KEEP_WIRES) {
    const rig = wires({ P: hull.P.map((v) => v * S), N: hull.N, T: hull.T }, {
      r: 0.18, minLen: 2.0, girth: 0.8, air: 1.2, loose: true, near: 0.3, crowd: 3,
    });
    hull = compactOf(subMesh(hull, (t) => !rig[t]));
    console.log('her rigging:', rig.reduce((n, v) => n + v, 0), 'faces');
  }
  // Whatever is no longer joined to her and is small -- the stubs of wires,
  // a block hanging off a yard -- goes; anything of a size stays.
  {
    const parts = components(hull);
    const drop = new Uint8Array(hull.T.length / 3);
    let n = 0;
    for (const c of parts.slice(1)) {
      const size = Math.max(c.hi[0] - c.lo[0], c.hi[1] - c.lo[1], c.hi[2] - c.lo[2]) * S;
      if (size > 1.5 && c.tris.length > 60) continue;
      for (const t of c.tris) drop[t] = 1;
      n++;
    }
    hull = compactOf(subMesh(hull, (t) => !drop[t]));
    console.log(`her hull: ${parts.length} pieces, ${n} small loose ones dropped`);
  }
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
  writeGlb(out('matsu-hull.glb'), decimate(painted, +(process.env.HULL_RATIO || 0.3), +(process.env.HULL_ERROR || 0.0002),
    +(process.env.HULL_NW ?? 0.02)));
}

// ---- her guns ---------------------------------------------------------------------
// Each is taken off its sheet and decimated on its own.
if (given(GUN_SRC)) {
  const sheet = readSource(GUN_SRC);
  // The open twin stands on the right of the sheet (+X), its barrels laid up
  // toward +X; the shielded one on the left, its barrels toward -X. The
  // smaller copy of the shielded one is off at +Z and the loose barrels off
  // at -Z, both clear of these two.
  const open = compactOf(crop(sheet, (x, y, z) => x > 0.06 && z > -0.6 && z < 0.3));
  writeGlb(out('matsu-127.glb'), largest(decimate(open, +(process.env.TWIN_RATIO || 0.02), 0.004, 0.02)));
  const shield = compactOf(crop(sheet, (x, y, z) => x < -0.26 && z > -0.6 && z < -0.1));
  writeGlb(out('matsu-127s.glb'), largest(decimate(shield, +(process.env.SHIELD_RATIO || 0.03), 0.004, 0.02)));
}
if (given(AA_SRC)) {
  writeGlb(out('matsu-25.glb'), decimate(compactOf(readSource(AA_SRC)), +(process.env.AA_RATIO || 0.007), 0.005, 0.02));
}
if (given(TUBE_SRC)) {
  writeGlb(out('matsu-tubes.glb'), decimate(compactOf(readSource(TUBE_SRC)), +(process.env.TUBE_RATIO || 0.015), 0.004, 0.02));
}
