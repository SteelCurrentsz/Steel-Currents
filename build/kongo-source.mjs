// Take the owner's IJN Kongo sculpts down to what the build works from.
//
//   npm i --no-save meshoptimizer@0.22          (see build/sculpt-source.mjs)
//   node build/kongo-source.mjs <hull.glb> <bridge.glb> <35.6cm turret.glb> \
//     <15.2cm casemate gun.glb> <12.7cm.glb> <25mm.glb>
//
// Any of them may be given as `-`, which leaves the asset made from it as it
// is: the sculpts are not committed (they are 9 to 85 MB), and one can be
// taken down again without the others to hand.
//
// She came as six sculpts:
//
//   * her hull: the whole ship as she was in 1944, hull and decks, her
//     superstructure, her two funnels, her turrets, her pagoda and her
//     casemates, rigged with wires from her stem to her mainmast to her
//     ensign staff. Her hull, her decks, her superstructure and her funnels
//     are what is taken from it; her turrets, her bridge and every gun are
//     the other sculpts', and build/prepare-kongo-hull.mjs cuts those out;
//   * her bridge, five times over, each copy stood at its own angle; the
//     fifth from the left (the one furthest along +X) is the one that came out
//     whole -- the others lean, or their rails melted, or their foot was
//     squashed -- and it is hers, turned square to her;
//   * her 35.6 cm twin on a square plinth, her 15.2 cm casemate gun on a table
//     with an anchor, a locker and a bucket on it, her 12.7 cm twins (one
//     whole, one smaller and three loose parts on one sheet), and her 25 mm
//     triple.
//
// Here her hull is painted, as she was in 1944: red below her boot topping,
// black boot topping through her waterline, and grey over it. In order:
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
//   kongo-hull.glb     her hull, superstructure and funnels, with her paint on
//                      every point as the attribute _PAINT (see PAINTS)
//   kongo-bridge.glb   her bridge, turned bow to -X like her hull
//   kongo-356.glb      her 35.6 cm twin turret
//   kongo-152.glb      her 15.2 cm casemate gun, off its table
//   kongo-127.glb      her 12.7 cm twin
//   kongo-25.glb       her 25 mm triple
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
const writeGlb = (file, m) => writeSourceGlb(file, m, 'build/kongo-source.mjs');
const decimate = (m, ratio, error, normalWeight = 0) => decimateWith(MeshoptSimplifier, m, ratio, error, normalWeight);
const out = (name) => path.join(ROOT, 'assets/models', name);

const [HULL_SRC, BRIDGE_SRC, MAIN_SRC, CASE_SRC, TWIN_SRC, AA_SRC] = process.argv.slice(2);
if (!AA_SRC) {
  console.error('usage: node build/kongo-source.mjs <hull.glb> <bridge.glb> <35.6cm.glb> '
    + '<15.2cm.glb> <12.7cm.glb> <25mm.glb>   (- for any of them to leave its asset as it is)');
  process.exit(1);
}
const given = (src) => src && src !== '-';

/** Her paints, as build/prepare-kongo-hull.mjs and the data file number them. */
export const PAINTS = ['grey', 'deck', 'steel deck', 'boot', 'red'];
const GREY = 0, BOOT = 3, RED = 4;

// A unit of the hull's sculpt is 117.3 m of her: 222.05 m stem to stern over
// 1.893. Her keel is flat at -0.2027, and she is floated at her 9.7 m draft.
// The boot topping runs from a metre under her waterline to a metre over it.
export const LOA = 222.05;
export const STEM = -0.9486, STERN = 0.9444;
const S = LOA / (STERN - STEM);
export const KEEL = -0.2027;
const WL = KEEL + 9.7 / S;
const BOOT_LO = WL - 1.0 / S;
const BOOT_HI = WL + 1.0 / S;

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

// ---- her hull ---------------------------------------------------------------------
if (given(HULL_SRC)) {
  const raw = readSource(HULL_SRC);
  console.log('hull', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  let hull = compactOf(raw);
  // Her rigging, found on a copy of her in metres: every run of faces a
  // wire's thickness that runs out clear of what is under it, and every such
  // face aloft with next to nothing solid round it.
  if (!process.env.KEEP_WIRES) {
    const rig = wires({ P: hull.P.map((v) => v * S), N: hull.N, T: hull.T }, {
      r: 0.3, minLen: 2.5, girth: 1.2, air: 1.5, loose: true, near: 0.4, crowd: 3,
    });
    hull = compactOf(subMesh(hull, (t) => !rig[t]));
    console.log('her rigging:', rig.reduce((n, v) => n + v, 0), 'faces');
  }
  // Whatever is no longer joined to her and is small -- the stubs of wires,
  // a block hanging off a yard -- goes; anything of a size stays, since her
  // fittings are cast apart from her deck in places.
  {
    const parts = components(hull);
    const drop = new Uint8Array(hull.T.length / 3);
    let n = 0;
    for (const c of parts.slice(1)) {
      const size = Math.max(c.hi[0] - c.lo[0], c.hi[1] - c.lo[1], c.hi[2] - c.lo[2]) * S;
      if (size > 3 && c.tris.length > 60) continue;
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
  writeGlb(out('kongo-hull.glb'), decimate(painted, +(process.env.HULL_RATIO || 0.25), +(process.env.HULL_ERROR || 0.0003),
    +(process.env.HULL_NW ?? 0.02)));
}

// ---- her bridge -------------------------------------------------------------------
// Five copies on the sheet; the one furthest along +X stands square and whole.
// It is turned on the sheet by BRIDGE_YAW -- its radar's mattress, which lies
// across her, runs 21.5 degrees off the sheet's X -- and its bow is toward
// +X, -Z. It is turned back square, bow to -X like her hull, about the middle
// of its foot.
export const BRIDGE_COPY = { x0: 0.54, x1: 0.94, z0: -0.69, z1: -0.12 };
export const BRIDGE_YAW = 21.5 * Math.PI / 180;
if (given(BRIDGE_SRC)) {
  const raw = readSource(BRIDGE_SRC);
  console.log('bridge sheet', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  const B = BRIDGE_COPY;
  const m = compactOf(crop(raw, (x, y, z) => x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1));
  // Its middle, at the foot.
  let cx = 0, cz = 0, n = 0, foot = Infinity;
  for (let i = 0; i < m.P.length; i += 3) foot = Math.min(foot, m.P[i + 1]);
  for (let i = 0; i < m.P.length; i += 3) if (m.P[i + 1] < foot + 0.03) { cx += m.P[i]; cz += m.P[i + 2]; n++; }
  cx /= n; cz /= n;
  // Its bow, along the sheet, is (sin, -cos) of the yaw; it is turned to -X.
  //   x' = -(dx sin - dz cos),  z' = -(dx cos + dz sin)   (a turn, not a reflection)
  const s = Math.sin(BRIDGE_YAW), c = Math.cos(BRIDGE_YAW);
  for (let i = 0; i < m.P.length; i += 3) {
    const dx = m.P[i] - cx, dz = m.P[i + 2] - cz;
    m.P[i] = -(dx * s - dz * c); m.P[i + 1] -= foot; m.P[i + 2] = -(dx * c + dz * s);
    const nx = m.N[i], nz = m.N[i + 2];
    m.N[i] = -(nx * s - nz * c); m.N[i + 2] = -(nx * c + nz * s);
  }
  console.log(`its copy: ${m.T.length / 3} triangles, foot at ${foot.toFixed(4)}, middle ${cx.toFixed(4)}, ${cz.toFixed(4)}`);
  writeGlb(out('kongo-bridge.glb'), decimate(m, +(process.env.BRIDGE_RATIO || 0.09), +(process.env.BRIDGE_ERROR || 0.0008)));
}

// ---- her guns ---------------------------------------------------------------------
// Each is taken off its plinth, table or sheet and decimated on its own.
if (given(MAIN_SRC)) {
  // The turret and the ring it trains on, off the square plinth under it.
  const main = compactOf(crop(readSource(MAIN_SRC), (x, y) => y > -0.128));
  writeGlb(out('kongo-356.glb'), decimate(main, +(process.env.MAIN_RATIO || 0.035), 0.005, 0.02));
}
if (given(CASE_SRC)) {
  // The gun in its shield on its pedestal; not the table under it, nor the
  // anchor, the locker and the bucket on the table ahead of it, under its
  // barrel.
  const gun = compactOf(crop(readSource(CASE_SRC), (x, y, z) => y > -0.2 && Math.abs(z) < 0.3
    && (x < -0.16 || y > 0.12)));
  writeGlb(out('kongo-152.glb'), decimate(gun, +(process.env.CASE_RATIO || 0.012), 0.004, 0.02));
}
if (given(TWIN_SRC)) {
  // The sheet holds two mountings and three loose parts; the big one, with
  // the closed shield and its two barrels laid up toward +X, is her 12.7 cm
  // Type 89 twin.
  const twin = compactOf(crop(readSource(TWIN_SRC), (x, y, z) => x > 0.05 && z < 0.4));
  writeGlb(out('kongo-127.glb'), decimate(twin, +(process.env.TWIN_RATIO || 0.02), 0.006, 0.02));
}
if (given(AA_SRC)) {
  writeGlb(out('kongo-25.glb'), decimate(compactOf(readSource(AA_SRC)), +(process.env.AA_RATIO || 0.0045), 0.006, 0.02));
}
