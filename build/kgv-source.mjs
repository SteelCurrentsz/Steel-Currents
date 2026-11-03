// Take the owner's HMS King George V sculpts down to what the build works from.
//
//   npm i --no-save meshoptimizer@0.22 draco3d          (see build/sculpt-source.mjs)
//   node build/kgv-source.mjs [hull|front|aft|14|525|pompom|bofors|oerlikon ...]
//
// Reads the sculpts as the owner uploaded them:
//
//   assets/models/KGVHullModel-balanced-compressed.glb
//        her, whole, on a display stand: hull, decks, turrets, bridge,
//        funnels, masts and rigging
//   assets/models/KGVFrontSuperstructure(Dontuseboiler)-balanced-compressed.glb
//        her forward half, finer: B turret, her bridge and tower, her
//        foremast and her fore funnel ("boiler") and catapult, standing on
//        a slab of her hull. Its funnel is not used: the after sculpt's is.
//   assets/models/KGVMidNAftSuperstructure(UseBoiler)-balanced-compressed.glb
//        her middle and after half, finer: her fore funnel ("boiler") and its
//        hangars, her cranes, her after funnel, her mainmast and after
//        superstructure and Y turret, on a slab of her hull -- drawn bow to +X
//   assets/models/KGVMainGuns.glb
//        her three 14-inch turrets side by side: A (quadruple), B (twin) and
//        Y (quadruple), gunhouses only, barrels along +Z
//   assets/models/40mmQuadBofors-balanced-compressed.glb
//        a quadruple 40 mm Bofors Mk II, on a block
//   20mmSingleOerlikonGun.glb
//        a single 20 mm Oerlikon on its pedestal, barrel along -X
//
// Her octuple pom-pom is built by build/prepare-kgv-hull.mjs out of the
// quadruple 2-pdr the Hood carries (BritishQuadPomPom-compressed.glb), taken
// down here to kgv-pompom.glb.
//
// Her 5.25-inch twin is the one the after sculpt cast abreast her mainmast,
// port side, taken off it whole (gunhouse only; its barrels are drawn again
// by build/prepare-kgv-hull.mjs).
//
// The hull is painted -- red below her boot topping, black boot topping
// through her waterline, Home Fleet grey over it -- with each paint line cut
// straight into her, as build/hood-source.mjs does the Hood's.
//
// Writes, into assets/models/:
//
//   kgv-hull.glb       her hull, with her paint on every point as _PAINT
//   kgv-front.glb      the forward sculpt, from just under its deck up
//   kgv-aft.glb        the after sculpt, from just under its deck up
//   kgv-14a.glb        A turret          kgv-14b.glb   B turret
//   kgv-14y.glb        Y turret          kgv-525.glb   the 5.25-inch gunhouse
//   kgv-bofors.glb     the quad Bofors   kgv-oerlikon.glb  the Oerlikon
//   kgv-pompom.glb     the quadruple 2-pdr
//
// Coordinates are each sculpt's own.
import path from 'node:path';
import {
  ROOT, simplifier, readCompressed, writeGlb as writeSourceGlb, splitAt, splitByPaint, weldByPaint,
  decimate as decimateWith,
} from './sculpt-source.mjs';
import { components } from './sculpt.mjs';
import { wires, subMesh } from './sculpt-parts.mjs';

const MeshoptSimplifier = await simplifier();
const writeGlb = (file, m) => writeSourceGlb(file, m, 'build/kgv-source.mjs');
const decimate = (m, ratio, error, normalWeight = 0) => decimateWith(MeshoptSimplifier, m, ratio, error, normalWeight);
const asset = (name) => path.join(ROOT, 'assets/models', name);
const only = process.argv.slice(2);
const wanted = (name) => !only.length || only.includes(name);

/** Her paints, as build/prepare-kgv-hull.mjs and the data file number them. */
export const PAINTS = ['grey', 'deck', 'steel deck', 'boot', 'red'];
const GREY = 0, BOOT = 3, RED = 4;

// A unit of her hull's sculpt is 119.82 m of her: 227.1 m over its 1.8953
// stem to stern. Her keel is flat at -0.1665 (the stand's pillars meet it
// there), and she is floated at 9.9 m, her draught at deep load. Her boot
// topping runs from 0.6 m under her waterline to 0.9 m over it.
export const LOA = 227.1;
export const HULL_X = { x0: -0.9498, x1: 0.9455 };
export const UNIT = LOA / (HULL_X.x1 - HULL_X.x0);
export const KEEL = -0.1665;
export const DRAFT = 9.9;
const WL = KEEL + DRAFT / UNIT;
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
const compactOf = (m) => subMesh({ P: m.P, N: m.N, T: m.T }, () => true);
/** Every piece of `m` but its biggest that is smaller than `size` m across (at `s` m a unit) goes. */
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
/** Its rigging, found in metres at `s` a unit (see wires); not where `keep` says. */
function unrig(m, s, opts, keep = () => false) {
  if (process.env.KEEP_WIRES) return m;
  const rig = wires({ P: m.P.map((v) => v * s), N: m.N, T: m.T },
    { ...opts, only: (x, y, z) => !keep(x / s, y / s, z / s) });
  console.log('  rigging:', rig.reduce((n, v) => n + v, 0), 'faces');
  return compactOf(subMesh(m, (t) => !rig[t]));
}

// ---- her hull ---------------------------------------------------------------------
if (wanted('hull')) {
  const raw = await readCompressed(asset('KGVHullModel-balanced-compressed.glb'));
  console.log('hull', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  // Off her stand: its plinth and the two pillars she sat on, all under her keel.
  let hull = compactOf(crop(raw, (x, y) => y > KEEL - 0.0008));
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
  writeGlb(asset('kgv-hull.glb'), decimate(painted, +(process.env.HULL_RATIO || 0.05), +(process.env.HULL_ERROR || 0.0005),
    +(process.env.HULL_NW ?? 0.02)));
}

// ---- her superstructure -----------------------------------------------------------
// Each sculpt stands on a slab of her hull. What is over the slab's deck is
// kept, from a little under it up; the slab itself goes, for hers is there
// (see build/prepare-kgv-hull.mjs). Her cranes' jibs are lattices of thin
// members, which wires() would take for rigging: they are left alone.
//
//   deck     the slab's deck, where it is lowest
//   unit     metres a unit, near enough, for finding wires
export const FRONT = { deck: -0.366, unit: 35.35 };
export const AFT = { deck: -0.286, unit: 44.2 };
if (wanted('front')) {
  const raw = await readCompressed(asset('KGVFrontSuperstructure(Dontuseboiler)-balanced-compressed.glb'));
  console.log('front', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  let m = compactOf(crop(raw, (x, y) => y > FRONT.deck - 0.012));
  // Her catapult and the aircraft on it, abaft her funnel, are not kept (the
  // after sculpt has her from her fore funnel aft), so no wire of theirs is
  // looked for there either.
  m = compactOf(crop(m, (x) => x < 0.62));
  m = unrig(m, FRONT.unit, { r: 0.2, minLen: 2.0, girth: 1.0, air: 1.4, loose: true, near: 0.35, crowd: 3 });
  m = dropSmall(m, FRONT.unit, 0.8, 40);
  writeGlb(asset('kgv-front.glb'), decimate(m, +(process.env.FRONT_RATIO || 0.03), +(process.env.FRONT_ERROR || 0.0012), 0.02));
}
if (wanted('aft')) {
  const raw = await readCompressed(asset('KGVMidNAftSuperstructure(UseBoiler)-balanced-compressed.glb'));
  console.log('aft', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  let m = compactOf(crop(raw, (x, y) => y > AFT.deck - 0.012));
  // Her cranes: between her funnels, from the deck to their jibs' heads.
  const crane = (x, y, z) => x > 0.2 && x < 0.75 && Math.abs(z) > 0.1 && Math.abs(z) < 0.36 && y > -0.2 && y < 0.0;
  m = unrig(m, AFT.unit, { r: 0.2, minLen: 2.0, girth: 1.0, air: 1.4, loose: true, near: 0.35, crowd: 3 }, crane);
  m = dropSmall(m, AFT.unit, 0.8, 40);
  writeGlb(asset('kgv-aft.glb'), decimate(m, +(process.env.AFT_RATIO || 0.035), +(process.env.AFT_ERROR || 0.001), 0.02));
}

// ---- her guns ---------------------------------------------------------------------
if (wanted('14')) {
  const raw = await readCompressed(asset('KGVMainGuns.glb'));
  const all = compactOf(raw);
  for (const [name, x0, x1] of [['a', -1, -0.3], ['b', -0.3, 0.3], ['y', 0.3, 1]]) {
    const gun = dropSmall(compactOf(crop(all, (x) => x > x0 && x < x1)), 21.5, 0.25, 30);
    writeGlb(asset(`kgv-14${name}.glb`), decimate(gun, +(process.env.MAIN_RATIO || 0.02), 0.002, 0.02));
  }
}
if (wanted('525')) {
  // Off the after sculpt: its port after 5.25-inch, abreast her mainmast, the
  // drum of it about (-0.016, 0.274) on her deck at -0.2545, and the box of
  // its gun shield standing out of its face; not its barrels, laid aft out
  // of the shield, which are drawn again.
  const raw = await readCompressed(asset('KGVMidNAftSuperstructure(UseBoiler)-balanced-compressed.glb'));
  const gun = dropSmall(compactOf(crop(raw, (x, y, z) => y > -0.2545 && y < -0.153
    && (Math.hypot(x + 0.016, z - 0.274) < 0.062 || (x > -0.086 && x < -0.04 && z > 0.245 && z < 0.295))
    && !(x < -0.05 && Math.abs(z - 0.313) < 0.008))), 44.21, 0.6, 60);
  writeGlb(asset('kgv-525.glb'), decimate(gun, +(process.env.SEC_RATIO || 0.25), 0.0015, 0.02));
}
if (wanted('bofors')) {
  // The mounting, off its block (the top of which is at -0.29).
  const raw = await readCompressed(asset('40mmQuadBofors-balanced-compressed.glb'));
  const gun = dropSmall(compactOf(crop(raw, (x, y) => y > -0.285)), 2.6, 0.12, 20);
  writeGlb(asset('kgv-bofors.glb'), decimate(gun, +(process.env.BOFORS_RATIO || 0.007), 0.005, 0.02));
}
if (wanted('pompom')) {
  // The 2-pdr quadruple the Hood carries, off the same sculpt, decimated for
  // the eight of them she carries (build/prepare-kgv-hull.mjs makes each an
  // octuple): the mounting and its pedestal, not the ring under it.
  const raw = await readCompressed(asset('BritishQuadPomPom-compressed.glb'));
  const gun = dropSmall(compactOf(crop(raw, (x, y) => y > -0.56)), 2, 0.15, 20);
  writeGlb(asset('kgv-pompom.glb'), decimate(gun, +(process.env.AA_RATIO || 0.006), 0.004, 0.02));
}
if (wanted('oerlikon')) {
  const raw = await readCompressed(path.join(ROOT, '20mmSingleOerlikonGun.glb'));
  const gun = dropSmall(compactOf(raw), 1.45, 0.08, 20);
  writeGlb(asset('kgv-oerlikon.glb'), decimate(gun, +(process.env.OERLIKON_RATIO || 0.008), 0.003, 0.02));
}
