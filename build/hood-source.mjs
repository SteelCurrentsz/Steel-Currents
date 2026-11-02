// Take the owner's HMS Hood sculpts down to what the build works from.
//
//   npm i --no-save meshoptimizer@0.22 draco3d          (see build/sculpt-source.mjs)
//   node build/hood-source.mjs
//
// Reads the sculpts as the owner uploaded them, from assets/models/:
//
//   HMSHoodHull-compressed.glb               her, whole: hull, decks, bridge, funnels,
//                                            masts, turrets and every gun, rigged from
//                                            her jackstaff to her ensign staff
//   HoodBridgeNSuperstructure.compressed.glb her middle, finer: her bridge, conning
//                                            tower, funnels, boat deck, mainmast and
//                                            after superstructure, standing on a slab
//                                            of hull drawn the length of them
//   HoodMainGun.glb                          her 15-inch Mk II twin, on its barbette
//   5.5InchHMSHoodGun.glb                    her 5.5-inch BL Mk I in its shield
//   BritishQuadPomPom-compressed.glb         the 2-pdr Mk VII quadruple pom-pom
//   TripleBarrelTorpedo.glb                  a triple 21-inch bank
//
// (HMSHoodHull.glb, the first upload of her hull, is not used: it is the same
// sculpt gone wrong, with a melted copy of her fused on under her keel.)
//
// The two compressed sculpts are packed with meshopt, the superstructure with
// Draco; they are read out as they were (see readCompressed). Here her hull is
// painted as she was in May 1941 -- red below her boot topping, black boot
// topping through her waterline, Home Fleet grey over it -- and in order:
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
// Her superstructure is de-rigged the same way and cut off the slab it was
// sculpted on: what stands on the slab's decks is kept, the slab's own decks
// and its sides are not -- she has hers (see build/prepare-hood-hull.mjs).
//
// Her guns are each cleaned of what is not theirs and decimated on their own:
//
//   * the 15-inch: the Unrotated Projectile launcher the sculpt stood on its
//     roof, and the railed tub it stood in, go -- what is left is the
//     gunhouse, its rangefinder and its cupola, and the barbette under it;
//   * the 5.5-inch: the great disc it was sculpted standing on goes, down to
//     the ring under its shield;
//   * the pom-pom: the ring that floated under its pedestal goes.
//
// Writes, into assets/models/:
//
//   hood-hull.glb      her hull, with her paint on every point as _PAINT (see PAINTS)
//   hood-super.glb     her superstructure, off its slab
//   hood-15.glb        her 15-inch twin, with its barbette
//   hood-55.glb        her 5.5-inch
//   hood-pompom.glb    the quadruple pom-pom
//
// Coordinates here are each sculpt's own: length along X with her bow at -X,
// Y up, beam along Z.
import path from 'node:path';
import {
  ROOT, simplifier, readCompressed, writeGlb as writeSourceGlb, splitAt, splitByPaint, weldByPaint,
  decimate as decimateWith,
} from './sculpt-source.mjs';
import { components, boxCut } from './sculpt.mjs';
import { wires, subMesh } from './sculpt-parts.mjs';

const MeshoptSimplifier = await simplifier();
const writeGlb = (file, m) => writeSourceGlb(file, m, 'build/hood-source.mjs');
const decimate = (m, ratio, error, normalWeight = 0) => decimateWith(MeshoptSimplifier, m, ratio, error, normalWeight);
const asset = (name) => path.join(ROOT, 'assets/models', name);
const only = process.argv.slice(2);
const wanted = (name) => !only.length || only.includes(name);

/** Her paints, as build/prepare-hood-hull.mjs and the data file number them. */
export const PAINTS = ['grey', 'deck', 'steel deck', 'boot', 'red'];
const GREY = 0, BOOT = 3, RED = 4;

// A unit of her hull's sculpt is 138.05 m of her: 262.3 m over its 1.900 stem
// to stern. Her keel is flat at -0.2253, and she is floated at 9.0 m -- her
// draught in May 1941, deep with oil and stores for the Atlantic. Her boot
// topping runs from 0.6 m under her waterline to 0.9 m over it.
export const LOA = 262.3;
export const UNIT = LOA / 1.9;
export const KEEL = -0.2253;
const WL = KEEL + 9.0 / UNIT;
const BOOT_LO = WL - 0.6 / UNIT;
const BOOT_HI = WL + 0.9 / UNIT;

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
const compactOf = (m) => subMesh({ P: m.P, N: m.N, T: m.T }, () => true);
/** Every piece of `m` but its biggest that is smaller than `size` across (in units of `s` metres) goes. */
function dropSmall(m, s, size, tris) {
  const parts = components(m);
  const drop = new Uint8Array(m.T.length / 3);
  let n = 0;
  for (const c of parts.slice(1)) {
    const d = Math.max(c.hi[0] - c.lo[0], c.hi[1] - c.lo[1], c.hi[2] - c.lo[2]) * s;
    if (d > size && c.tris.length > tris) continue;
    for (const t of c.tris) drop[t] = 1;
    n++;
  }
  console.log(`  ${parts.length} pieces, ${n} small loose ones dropped`);
  return compactOf(subMesh(m, (t) => !drop[t]));
}
/**
 * Its rigging, found on a copy of it in metres at `s` a unit (see wires) --
 * but not its decks. A deck sculpted as long slivers, each a few centimetres
 * across and a boat's length long, is as thin as a wire to wires(), and the
 * superstructure came out of it with wedges cut out of its shelter deck. A
 * wire is round, and no face of it lies flat among others that do; a sliver
 * of a deck does, so a flat face with two or more flat neighbours level with
 * it is deck and stays.
 */
function unrig(m, s, opts) {
  if (process.env.KEEP_WIRES) return m;
  const rig = wires({ P: m.P.map((v) => v * s), N: m.N, T: m.T }, opts);
  const { P, T } = m;
  const nf = T.length / 3;
  const flat = new Uint8Array(nf);
  const level = new Float64Array(nf);
  for (let t = 0; t < nf; t++) {
    const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    flat[t] = Math.abs(ny) > 0.97 * Math.hypot(nx, ny, nz) ? 1 : 0;
    level[t] = (P[a + 1] + P[b + 1] + P[c + 1]) / 3;
  }
  const at = new Map();
  const key = (i) => `${P[i * 3].toFixed(6)},${P[i * 3 + 1].toFixed(6)},${P[i * 3 + 2].toFixed(6)}`;
  const edge = (i, j) => { const a = key(i), b = key(j); return a < b ? `${a}|${b}` : `${b}|${a}`; };
  for (let t = 0; t < nf; t++) {
    if (!flat[t]) continue;
    for (let j = 0; j < 3; j++) {
      const e = edge(T[t * 3 + j], T[t * 3 + (j + 1) % 3]);
      if (!at.has(e)) at.set(e, []);
      at.get(e).push(t);
    }
  }
  let kept = 0;
  for (let t = 0; t < nf; t++) {
    if (!rig[t] || !flat[t]) continue;
    let n = 0;
    for (let j = 0; j < 3; j++) {
      for (const o of at.get(edge(T[t * 3 + j], T[t * 3 + (j + 1) % 3])) || []) {
        if (o !== t && Math.abs(level[o] - level[t]) < 2e-4) n++;
      }
    }
    if (n >= 2) { rig[t] = 0; kept++; }
  }
  console.log('  rigging:', rig.reduce((n, v) => n + v, 0), 'faces;', kept, 'flat faces of a deck kept');
  return compactOf(subMesh(m, (t) => !rig[t]));
}

// ---- her hull ---------------------------------------------------------------------
if (wanted('hull')) {
  const raw = await readCompressed(asset('HMSHoodHull-compressed.glb'));
  console.log('hull', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  let hull = compactOf(raw);
  hull = unrig(hull, UNIT, { r: 0.22, minLen: 2.5, girth: 1.0, air: 1.5, loose: true, near: 0.35, crowd: 3 });
  hull = dropSmall(hull, UNIT, 1.5, 60);
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
  writeGlb(asset('hood-hull.glb'), decimate(painted, +(process.env.HULL_RATIO || 0.05), +(process.env.HULL_ERROR || 0.0005),
    +(process.env.HULL_NW ?? 0.02)));
}

// ---- her superstructure -----------------------------------------------------------
// A unit of it is 55.4 m of her: what puts its two funnels where her hull's
// are, 18.9 m apart. The slab it stands on is her forecastle deck (SLAB.low),
// and on that her shelter deck (SLAB.high), three and a half metres over it,
// from her bridge aft -- inboard amidships, with her forecastle deck carried
// past it either side as the walk her 5.5-inch stand on, and her full breadth
// abaft her boat deck. Everything over her forecastle deck is kept, from a
// hand over it up, inside the slab's sides; the deck itself goes, and so do
// the slab's sides, for hers are there (see build/prepare-hood-hull.mjs).
export const SUPER_UNIT = 55.4;
export const SLAB = { low: -0.257, high: -0.194, x0: -0.953, x1: 0.949, side: 0.262, over: 0.002 };
if (wanted('super')) {
  const raw = await readCompressed(asset('HoodBridgeNSuperstructure.compressed.glb'));
  console.log('superstructure', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  let m = compactOf(raw);
  m = unrig(m, SUPER_UNIT, { r: 0.2, minLen: 2.0, girth: 1.0, air: 1.4, loose: true, near: 0.35, crowd: 3 });
  // Only what is near the box goes into the cut, which is quicker than all of it.
  m = compactOf(crop(m, (x, y) => y > SLAB.low - 0.02));
  const box = { x0: SLAB.x0 + 0.004, x1: SLAB.x1 - 0.004, y0: SLAB.low + SLAB.over, y1: 2, z0: -SLAB.side, z1: SLAB.side };
  const cut = boxCut(m, box, { keep: 'inside', rescue: true });
  for (let i = 0; i < m.N.length; i++) if (!Number.isFinite(m.N[i])) m.N[i] = 0;
  console.log(`  over her forecastle deck: ${m.T.length / 3} triangles, closed with ${cut.caps.join('/')}`);
  m = dropSmall(compactOf(m), SUPER_UNIT, 1.2, 40);
  writeGlb(asset('hood-super.glb'), decimate(m, +(process.env.SUPER_RATIO || 0.07), +(process.env.SUPER_ERROR || 0.0004), 0.02));
}

// ---- her guns ---------------------------------------------------------------------
if (wanted('15')) {
  // Off the plinth's flange (under -0.43), and without the UP launcher and its
  // railed tub, which float over the roof from 0.29 up.
  const raw = await readCompressed(asset('HoodMainGun.glb'));
  const gun = dropSmall(compactOf(crop(raw, (x, y) => y > -0.43 && y < 0.29)), 10, 0.3, 30);
  writeGlb(asset('hood-15.glb'), decimate(gun, +(process.env.MAIN_RATIO || 0.05), 0.002, 0.02));
}
if (wanted('55')) {
  // The gun and its shield, and the ring under the shield; not the disc
  // round them, which is everything under -0.135.
  const raw = await readCompressed(asset('5.5InchHMSHoodGun.glb'));
  const gun = dropSmall(compactOf(crop(raw, (x, y, z) => y > -0.135 && Math.hypot(x - 0.11, z) < 0.62)), 5, 0.2, 20);
  writeGlb(asset('hood-55.glb'), decimate(gun, +(process.env.SEC_RATIO || 0.06), 0.002, 0.02));
}
if (wanted('pompom')) {
  // The mounting and its pedestal; not the ring that floats under it, from -0.56 down.
  const raw = await readCompressed(asset('BritishQuadPomPom-compressed.glb'));
  const gun = dropSmall(compactOf(crop(raw, (x, y) => y > -0.56)), 2, 0.15, 20);
  writeGlb(asset('hood-pompom.glb'), decimate(gun, +(process.env.AA_RATIO || 0.012), 0.003, 0.02));
}
