// Take the owner's IJN Fuso sculpts down to what the build works from.
//
//   npm i --no-save meshoptimizer@0.22          (see build/sculpt-source.mjs)
//   node build/fuso-source.mjs <hull.glb> <superstructure.glb> <bridge.glb> <35.6cm turret.glb> \
//     <15.2cm casemate gun.glb> <12.7cm.glb> <25mm.glb>
//
// Any of them may be given as `-`, which leaves the asset made from it as it
// is: the sculpts are not committed (they are 9 to 100 MB), and one can be
// taken down again without the others to hand.
//
// She came as seven sculpts:
//
//   * her hull, on a display sheet: the whole ship, hull and decks and every
//     fitting, rigged with wires that fuse her to her own masts; and over it,
//     floating, her bridge on a block of its own, a copy of her laid on her
//     side, and a floatplane;
//   * her superstructure, whole -- her mainmast tower, her funnel, the
//     deckhouses between her turrets, her mainmast, her boats and cranes --
//     standing on a slab of hull drawn her length, and her forward tower;
//   * her bridge, twice over, a copy either side: the tower she is known for,
//     seven decks of it, rigged;
//   * her 35.6 cm twin on a plinth, her 15.2 cm gun in its shield on a table,
//     her 12.7 cm twins (three mountings on one sheet), and her 25 mm triple.
//
// Here her hull is painted, as she was at Kure in 1944: red below her boot
// topping, black boot topping through her waterline, and Kure grey over it
// (her decks are laid on after she is smoothed, in build/prepare-fuso-hull.mjs).
// In order:
//
//   * her hull alone is taken off the sheet -- the largest piece of it, from
//     the deck down, with the bridge block floating over her left behind;
//   * it is cut along two level lines -- the bottom and top of her boot
//     topping -- so both are straight and exactly where they are, and every
//     triangle is given the paint of the band it lies in;
//   * each point where two paints meet is split into one point per paint, so
//     the decimator keeps each line where it is;
//   * and she is decimated to the budget the fleet renders at.
//
// Of the superstructure, only what stands on the slab's deck is kept, inside
// its side, from her stern to her bridge; its rigging is taken off it while
// it is still fine enough to tell a wire from a spar, and the holes they leave
// where they ran into a mast or a wall are closed. Then it is decimated.
// Her bridge is the left-hand copy, taken apart from the right-hand one and
// rigged only with the wires that are spars. Her guns are taken off their
// tables and plinths and decimated each on its own.
//
// Writes, into assets/models/:
//
//   fuso-hull.glb     her hull, from the deck down, with her paint on every
//                     point as the attribute _PAINT (see PAINTS)
//   fuso-super.glb    her superstructure, above the slab's deck
//   fuso-bridge.glb   her bridge
//   fuso-356.glb      her 35.6 cm twin turret
//   fuso-152.glb      her 15.2 cm gun in its shield
//   fuso-127.glb      her 12.7 cm twin
//   fuso-25.glb       her 25 mm triple
//
// Coordinates here are each sculpt's own, which for the hull and her
// superstructure is length along X with her bow at +X, Y up, beam along Z.
import path from 'node:path';
import {
  ROOT, simplifier, readSource, writeGlb as writeSourceGlb, splitAt, splitByPaint, weldByPaint,
  decimate as decimateWith,
} from './sculpt-source.mjs';
import { components, weld, boxCut } from './sculpt.mjs';
import { wires, subMesh } from './sculpt-parts.mjs';

const MeshoptSimplifier = await simplifier();
const writeGlb = (file, m) => writeSourceGlb(file, m, 'build/fuso-source.mjs');
const decimate = (m, ratio, error, normalWeight = 0) => decimateWith(MeshoptSimplifier, m, ratio, error, normalWeight);
const out = (name) => path.join(ROOT, 'assets/models', name);

const [HULL_SRC, SUPER_SRC, BRIDGE_SRC, MAIN_SRC, CASE_SRC, TWIN_SRC, AA_SRC] = process.argv.slice(2);
if (!AA_SRC) {
  console.error('usage: node build/fuso-source.mjs <hull.glb> <superstructure.glb> <bridge.glb> <35.6cm.glb> '
    + '<15.2cm.glb> <12.7cm.glb> <25mm.glb>   (- for any of them to leave its asset as it is)');
  process.exit(1);
}
const given = (src) => src && src !== '-';

/** Her paints, as build/prepare-fuso-hull.mjs and the data file number them. */
export const PAINTS = ['grey', 'deck', 'steel deck', 'boot', 'red'];
const GREY = 0, BOOT = 3, RED = 4;

// A unit of the hull's sheet is 116.3 m of her: 212.75 m stem to stern over
// 1.8295. Her keel is flat at -0.4700, and she is floated at her 9.7 m draft.
// The boot topping runs from a metre under her waterline to a metre over it.
const LOA = 212.75;
const STERN = -0.9510, STEM = 0.8785;
const S = LOA / (STEM - STERN);
const KEEL = -0.4700;
const WL = KEEL + 9.7 / S;
const BOOT_LO = WL - 1.0 / S;
const BOOT_HI = WL + 1.0 / S;
// Her deck is at -0.33 over her and the sheet's bridge block floats from
// -0.2575 up; nothing over her deck is hers to keep, so she is taken off the
// sheet from a hand over her deck down.
const HULL_TOP = -0.262;

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
  console.log('sheet', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  // Her, from the deck down: the sheet's bridge block, her copy laid on her
  // side and the floatplane are all over -0.26.
  let hull = compactOf(crop(raw, (x, y) => y < HULL_TOP && x > STERN - 0.01 && x < STEM + 0.01));
  // Whatever of that is not joined to her -- her screws' loose blades, a
  // pole -- goes.
  const parts = components(hull);
  const keep = new Uint8Array(hull.T.length / 3);
  for (const t of parts[0].tris) keep[t] = 1;
  console.log(`her hull: ${parts.length} pieces, the biggest ${parts[0].tris.length} of ${hull.T.length / 3} triangles`);
  hull = compactOf(subMesh(hull, (t) => keep[t]));
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
  writeGlb(out('fuso-hull.glb'), decimate(painted, +(process.env.HULL_RATIO || 0.2), +(process.env.HULL_ERROR || 0.0004),
    +(process.env.HULL_NW ?? 0.02)));
}

// ---- her superstructure -----------------------------------------------------------
// Bow at +X, Y up; her starboard side is +Z. A unit of it is 88 m of her: which
// puts her mainmast, her funnel and her turrets where the hull sheet has them.
// The slab's deck is highest along her middle and falls away to each side
// (SLAB_DECK); hers is flat across, so the slab's is laid flat first:
// everything on it is lifted by as much as the slab's deck under it is lower
// than at its centreline, which keeps a wall a wall and stands everything on
// a deck as level as hers. What stands on that deck -- from a hand over it up,
// from her stern to the front of her bridge, and out to the slab's side -- is
// cut out of it square (see boxCut): every wall, tub and barbette ends a hand
// over the deck it stood on, cut clean, and the two ends of it, and its
// sides, are closed.
//
// Its rigging is found on a copy of it in metres (see wires): every run of
// faces a wire's thickness that runs out clear of what is under it, and every
// such face aloft with next to nothing solid round it. Her mainmast is a spar
// a forearm thick, and stays. What only the wires held up goes with them; and
// where a wire ran into a mast or a wall, the mouth it leaves is closed with a
// fan.
const SLAB_DECK = [[0, -0.1755], [0.05, -0.1765], [0.08, -0.185], [0.1, -0.196], [0.14, -0.2], [0.18, -0.1985],
  [0.2, -0.215], [0.24, -0.23]];
const slabDeck = (z) => {
  const a = Math.abs(z);
  for (let i = 1; i < SLAB_DECK.length; i++) {
    const [z0, y0] = SLAB_DECK[i - 1], [z1, y1] = SLAB_DECK[i];
    if (a <= z1) return y0 + (y1 - y0) * (a - z0) / (z1 - z0);
  }
  return SLAB_DECK[SLAB_DECK.length - 1][1];
};
const SUPER_UNIT = 88;
// From her stern to the back of her bridge's block, which the bridge sculpt
// stands in the place of, from a metre and a half over her deck up -- the deck itself
// ripples a hand either way -- and out to where her hull's side is under it:
// the slab is a third broader than her hull, and what stood out past her
// side is not hers to keep.
export const SUPER_BOX = { x0: -0.943, x1: 0.545, y0: SLAB_DECK[0][1] + 1.4 / SUPER_UNIT, y1: 1, z0: -0.175, z1: 0.175 };
if (given(SUPER_SRC)) {
  const raw = readSource(SUPER_SRC);
  console.log('superstructure', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  const { P, N, T } = raw;
  for (let i = 0; i < P.length; i += 3) P[i + 1] += SLAB_DECK[0][1] - slabDeck(P[i + 2]);
  // Only what is near the box goes into the cut, which is quicker than all of it.
  const near = [];
  for (let t = 0; t < T.length; t += 3) {
    let hi = -Infinity, xl = Infinity, xh = -Infinity;
    for (let k = 0; k < 3; k++) {
      const v = T[t + k] * 3;
      hi = Math.max(hi, P[v + 1]); xl = Math.min(xl, P[v]); xh = Math.max(xh, P[v]);
    }
    if (hi > SUPER_BOX.y0 - 0.002 && xh > SUPER_BOX.x0 - 0.002 && xl < SUPER_BOX.x1 + 0.002) near.push(T[t], T[t + 1], T[t + 2]);
  }
  let m = subMesh({ P, N, T: near }, () => true);
  const cut = boxCut(m, SUPER_BOX, { keep: 'inside', rescue: true });
  // Not the floor the cut laid under it all: what stood on the slab's deck
  // stands a hand into hers (see prepare-fuso-hull.mjs).
  const floor = (t) => [0, 1, 2].every((j) => Math.abs(m.P[m.T[t * 3 + j] * 3 + 1] - SUPER_BOX.y0) < 1e-7);
  m = subMesh(m, (t) => !floor(t));
  for (let i = 0; i < m.N.length; i++) if (!Number.isFinite(m.N[i])) m.N[i] = 0;
  console.log('on its deck:', m.T.length / 3, 'triangles; the cut closed with', cut.caps.join('/'));
  if (!process.env.KEEP_WIRES) {
    const rig = wires({ P: m.P.map((v) => v * SUPER_UNIT), N: m.N, T: m.T }, {
      r: 0.22, minLen: 2.5, girth: 1.2, air: 1.5, loose: true, near: 0.4, crowd: 3,
    });
    m = subMesh(m, (t) => !rig[t]);
    console.log('its rigging:', rig.reduce((n, v) => n + v, 0), 'faces');
    const drop = new Uint8Array(m.T.length / 3);
    let n = 0;
    for (const c of components(m)) {
      if ((c.lo[1] - SUPER_BOX.y0) * SUPER_UNIT < 1.5 && c.tris.length > 30) continue;
      for (const t of c.tris) drop[t] = 1;
      n++;
    }
    m = subMesh(m, (t) => !drop[t]);
    console.log('what only the rigging held up:', n, 'pieces');
  }
  writeGlb(out('fuso-super.glb'), decimate(m, +(process.env.SUPER_RATIO || 0.12), +(process.env.SUPER_ERROR || 0.0003)));
}

// ---- her bridge -------------------------------------------------------------------
// Two copies side by side on the sheet; the left one, whose masthead carries
// the radar, is hers. Its rigging runs from its yardarm platform down to her
// deck; what is a wire there is taken off it like her superstructure's.
if (given(BRIDGE_SRC)) {
  const raw = readSource(BRIDGE_SRC);
  console.log('bridge sheet', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  let m = compactOf(crop(raw, (x) => x < -0.012));
  console.log('left copy', m.T.length / 3, 'triangles');
  if (!process.env.KEEP_WIRES) {
    const BRIDGE_UNIT = 19;
    const rig = wires({ P: m.P.map((v) => v * BRIDGE_UNIT), N: m.N, T: m.T }, {
      r: 0.12, minLen: 1.5, girth: 0.9, air: 1.0, loose: true, near: 0.3, crowd: 3,
    });
    m = subMesh(m, (t) => !rig[t]);
    console.log('its rigging:', rig.reduce((n, v) => n + v, 0), 'faces');
  }
  writeGlb(out('fuso-bridge.glb'), decimate(m, +(process.env.BRIDGE_RATIO || 0.05), +(process.env.BRIDGE_ERROR || 0.0012)));
}

// ---- her guns ---------------------------------------------------------------------
// Each is taken off its plinth, table or sheet and decimated on its own.
if (given(MAIN_SRC)) {
  // The turret and the ring it trains on, off the square plinth under it.
  const main = compactOf(crop(readSource(MAIN_SRC), (x, y) => y > -0.118));
  writeGlb(out('fuso-356.glb'), decimate(main, +(process.env.MAIN_RATIO || 0.035), 0.006, 0.02));
}
if (given(CASE_SRC)) {
  // The gun and its shield, and the pedestal's cone it stands on; not the
  // table, the screen on it, or the plank under them.
  const gun = compactOf(crop(readSource(CASE_SRC), (x, y, z) => Math.abs(z) < 0.25 && y > -0.13
    && (x < 0.09 || y > 0.2) && x < 0.7));
  writeGlb(out('fuso-152.glb'), decimate(gun, +(process.env.CASE_RATIO || 0.013), 0.006, 0.02));
}
if (given(TWIN_SRC)) {
  // The sheet holds three mountings; the big one, with the open shield and
  // the two long barrels, is her 12.7 cm Type 89 twin.
  const twin = compactOf(crop(readSource(TWIN_SRC), (x, y, z) => x > 0.06 && z > -0.57 && z < 0.26 && y > -0.33));
  writeGlb(out('fuso-127.glb'), decimate(twin, +(process.env.TWIN_RATIO || 0.009), 0.008, 0.02));
}
if (given(AA_SRC)) {
  writeGlb(out('fuso-25.glb'), decimate(compactOf(readSource(AA_SRC)), +(process.env.AA_RATIO || 0.005), 0.008, 0.02));
}
