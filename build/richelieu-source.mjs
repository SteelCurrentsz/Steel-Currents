// Take the owner's Richelieu sculpts down to what the build works from.
//
//   npm i --no-save meshoptimizer@0.22          (see build/sculpt-source.mjs)
//   node build/richelieu-source.mjs <hull.glb> <superstructure.glb> \
//     <380mm quad.glb> <152mm triple.glb> <100mm twin.glb>
//
// Any of them may be given as `-`, which leaves the asset made from it as it
// is: the sculpts are not committed (they are 5 to 40 MB), and one can be
// taken down again without the others to hand.
//
// She came as these sculpts:
//
//   * the whole of her, drawn for her hull: a single welded mesh of a million
//     triangles, bare of any colour, flush-decked from stem to stern. Only her
//     hull and her deck are taken from it, as the owner asked -- nothing that
//     stands on it;
//   * the whole of her again, drawn for her upperworks: her tower and bridge,
//     her mack, her after superstructure, her boats and the tubs and
//     platforms of her anti-aircraft guns, standing on a hull of its own that
//     is broader than hers. Only what stands on its deck is taken, from
//     abaft its one 380 mm turret to the break of its quarterdeck;
//   * and her 380 mm quadruple turret, her 152 mm triple turret and her
//     100 mm twin mounting, each on its own.
//
// Her hull is painted as she was in 1940: red below her boot topping, black
// boot topping through her waterline, and grey over it (her decks are laid
// afresh in build/prepare-richelieu-hull.mjs). In order:
//
//   * everything standing clear of her upper deck is taken off her hull sculpt
//     -- its turrets, its superstructure, its boats -- which leaves the
//     decimator her hull to spend its budget on;
//   * she is cut along two level lines -- the bottom and top of her boot
//     topping -- so both are straight and exactly where they are, and every
//     triangle is given the paint of the band it lies in;
//   * each point where two paints meet is split into one point per paint, so
//     the decimator keeps each line where it is;
//   * and she is decimated to the budget the fleet renders at.
//
// Her upperworks are cropped to what stands on the deck of the sculpt that
// drew them, inside its rails, and decimated. Nothing is moved: each keeps its
// own frame, and build/prepare-richelieu-hull.mjs puts it where it goes.
//
// Writes, into assets/models/:
//
//   richelieu-hull.glb     her hull, with her paint on every point as the
//                          attribute _PAINT (see PAINTS)
//   richelieu-super.glb    her upperworks
//   richelieu-380.glb      her 380 mm quadruple turret
//   richelieu-152.glb      her 152 mm triple turret
//   richelieu-100.glb      her 100 mm twin mounting
//
// Coordinates here are each sculpt's own: length along X with her bow at -X,
// Y up, beam along Z, 1.90 units stem to stern.
import path from 'node:path';
import {
  ROOT, simplifier, readSource, writeGlb as writeSourceGlb, splitAt, splitByPaint, weldByPaint,
  decimate as decimateWith,
} from './sculpt-source.mjs';

const MeshoptSimplifier = await simplifier();
const writeGlb = (file, m) => writeSourceGlb(file, m, 'build/richelieu-source.mjs');
const decimate = (m, ratio, error, normalWeight = 0) => decimateWith(MeshoptSimplifier, m, ratio, error, normalWeight);
const out = (name) => path.join(ROOT, 'assets/models', name);

const [SRC, SUPER_SRC, MAIN_SRC, SEC_SRC, DP_SRC] = process.argv.slice(2);
if (!DP_SRC) {
  console.error('usage: node build/richelieu-source.mjs <hull.glb> <superstructure.glb> '
    + '<380mm.glb> <152mm.glb> <100mm.glb>   (- for any of them to leave its asset as it is)');
  process.exit(1);
}
const given = (src) => src && src !== '-';

/** Her paints, as build/prepare-richelieu-hull.mjs and the data file number them. */
export const PAINTS = ['grey', 'deck', 'steel deck', 'boot', 'red'];
const GREY = 0, BOOT = 3, RED = 4;

// A unit of her hull sculpt is 130.2 m of her: 247.85 m stem to stern over
// 1.9031. Her keel is flat at -0.2237, and she is floated at her 9.6 m draft.
// The boot topping runs from nine tenths of a metre under her waterline to
// nine tenths over it.
const S = 247.85 / 1.9031;
const KEEL = -0.2237;
const WL = KEEL + 9.6 / S;
const BOOT_LO = WL - 0.9 / S;
const BOOT_HI = WL + 0.9 / S;

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

/**
 * How far out a sculpt's side is, and how high its gunwale, every `step`
 * along it: the furthest any point is from its middle between `y0` and `y1`
 * (a band of its side under its deck edge), and the highest point within
 * `edge` of that breadth -- its deck edge, the top of its side.
 */
function sideOf(m, { step, y0, y1, edge }) {
  const { P } = m;
  const lo = -1, n = Math.ceil(2 / step);
  const half = new Float64Array(n), top = new Float64Array(n).fill(-9);
  for (let i = 0; i < P.length; i += 3) {
    const y = P[i + 1];
    if (y < y0 || y > y1) continue;
    const b = Math.floor((P[i] - lo) / step);
    if (b >= 0 && b < n) half[b] = Math.max(half[b], Math.abs(P[i + 2]));
  }
  for (let i = 0; i < P.length; i += 3) {
    const b = Math.floor((P[i] - lo) / step);
    if (b < 0 || b >= n || !half[b]) continue;
    if (Math.abs(P[i + 2]) > half[b] - edge && P[i + 1] < y1 + 0.03) top[b] = Math.max(top[b], P[i + 1]);
  }
  const at = (arr) => (x) => {
    const f = (x - lo) / step - 0.5, i = Math.max(0, Math.min(n - 2, Math.floor(f))), u = Math.max(0, Math.min(1, f - i));
    return arr[i] * (1 - u) + arr[i + 1] * u;
  };
  return { half: at(half), top: at(top) };
}

// ---- her hull ---------------------------------------------------------------------
if (given(SRC)) {
  const raw = readSource(SRC);
  console.log('sculpt', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  // Her deck edge, a centimetre of the sculpt at a time: the top of her side,
  // which is level at -0.089 from her stern to her forward turret and rises
  // from there to her stem head. What stands more than half a metre over it
  // comes off here; build/prepare-richelieu-hull.mjs takes her down further.
  const side = sideOf(raw, { step: 0.01, y0: -0.13, y1: -0.095, edge: 0.004 });
  const hull = crop(raw, (x, y) => y < Math.max(side.top(x), -0.0889) + 0.5 / S);
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
  writeGlb(out('richelieu-hull.glb'),
    decimate(painted, +(process.env.HULL_RATIO || 0.1), +(process.env.HULL_ERROR || 0.00025), +(process.env.HULL_NW ?? 0.02)));
}

// ---- her upperworks --------------------------------------------------------------
// Bow at -X, Y up, its deck at -0.0968. What is taken is what stands more
// than a third of a metre over that deck, inside a metre of its side (its
// rails and its boat booms are left behind), from just abaft the barbette of
// its 380 mm turret -- which is drawn here on its own, and twice -- aft to
// the break of its quarterdeck, which is drawn afresh.
export const SUPER_DECK = -0.0968;
export const SUPER_SPAN = [-0.235, 0.651];
if (given(SUPER_SRC)) {
  const raw = readSource(SUPER_SRC);
  console.log('superstructure', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  const side = sideOf(raw, { step: 0.01, y0: -0.11, y1: -0.099, edge: 0.004 });
  // A triangle is kept if its middle is in the span and inside the rails, and
  // any corner of it stands a third of a metre over the deck -- which keeps
  // every wall down to its foot, and takes the deck itself and what lies flat
  // on it.
  const { P } = raw;
  const kept = [];
  for (let t = 0; t < raw.T.length; t += 3) {
    let cx = 0, cz = 0, top = -9;
    for (let k = 0; k < 3; k++) {
      const v = raw.T[t + k];
      cx += P[v * 3] / 3; cz += P[v * 3 + 2] / 3; top = Math.max(top, P[v * 3 + 1]);
    }
    if (cx > SUPER_SPAN[0] && cx < SUPER_SPAN[1] && top > SUPER_DECK + 0.003 && Math.abs(cz) < side.half(cx) - 0.008) {
      kept.push(raw.T[t], raw.T[t + 1], raw.T[t + 2]);
    }
  }
  const up = { ...raw, T: kept };
  console.log('upperworks:', up.T.length / 3, 'triangles on its deck');
  writeGlb(out('richelieu-super.glb'),
    decimate(up, +(process.env.SUPER_RATIO || 0.06), +(process.env.SUPER_ERROR || 0.002)));
}

// ---- her guns ----------------------------------------------------------------------
// Each on its own, barrels along -X.
if (given(MAIN_SRC)) {
  writeGlb(out('richelieu-380.glb'), decimate(readSource(MAIN_SRC), +(process.env.MAIN_RATIO || 0.05), 0.003));
}
if (given(SEC_SRC)) {
  writeGlb(out('richelieu-152.glb'), decimate(readSource(SEC_SRC), +(process.env.SEC_RATIO || 0.02), 0.003));
}
if (given(DP_SRC)) {
  writeGlb(out('richelieu-100.glb'), decimate(readSource(DP_SRC), +(process.env.DP_RATIO || 0.025), 0.003));
}
