// Take the owner's IJN Musashi sculpts down to what the build works from.
//
//   npm i --no-save meshoptimizer@0.22          (see build/sculpt-source.mjs)
//   node build/musashi-source.mjs <Musashi.glb> <MusashiSuperstructure.glb> \
//     <15.5cm triple.glb> <12.7cm twin.glb> <25mm pod.glb>
//
// Any of them may be given as `-`, which leaves the asset made from it as it
// is: the sculpts are not committed (they are 30 to 140 MB), and one can be
// taken down again without the others to hand.
//
// She came as five sculpts:
//
//   * the whole of her -- hull, turrets, superstructure -- a single welded
//     mesh of a million and a third triangles, bare of any colour, whose
//     superstructure melted: her tower is a sponge, her mainmast a lattice of
//     drips, and every wire she was rigged with is a tube fused into both;
//   * her superstructure, from the back of No.2 to the back of No.3, standing
//     on a slab of her hull: a million and a half triangles drawn whole and
//     closed -- both sides of her, her tower, her funnel, her raked mainmast,
//     her after control station, every platform and tub -- and rigged with
//     wires a hand thick; it is what her superstructure is;
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
// Of the superstructure, only what stands on the slab's deck between No.2 and
// No.3 is kept, inside its side; its rigging is taken off it while it is
// still fine enough to tell a wire from a spar, what the wires alone held up
// goes with them, and the holes they leave where they ran into a mast or a
// wall are closed. Then it is decimated. Everything else is decimated, and
// nothing is moved: each keeps its own frame, and prepare-musashi-hull.mjs
// puts it where it goes.
//
// Writes, into assets/models/:
//
//   musashi-hull.glb      the whole of her, with her paint on every point as
//                         the attribute _PAINT (see PAINTS)
//   musashi-turrets.glb   her forecastle with No.1 and No.2 on it and her
//                         quarterdeck with No.3, finer, painted the same
//   musashi-super.glb     her superstructure, above the slab's deck
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
import { components, weld, boxCut } from './sculpt.mjs';
import { wires, subMesh } from './sculpt-parts.mjs';

const MeshoptSimplifier = await simplifier();
const writeGlb = (file, m) => writeSourceGlb(file, m, 'build/musashi-source.mjs');
const decimate = (m, ratio, error, normalWeight = 0) => decimateWith(MeshoptSimplifier, m, ratio, error, normalWeight);
const out = (name) => path.join(ROOT, 'assets/models', name);

const [SRC, SUPER_SRC, SEC6_SRC, SEC5_SRC, POD_SRC] = process.argv.slice(2);
if (!POD_SRC) {
  console.error('usage: node build/musashi-source.mjs <Musashi.glb> <MusashiSuperstructure.glb> '
    + '<15.5cm.glb> <12.7cm.glb> <25mm pod.glb>   (- for any of them to leave its asset as it is)');
  process.exit(1);
}
const given = (src) => src && src !== '-';

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
if (given(SRC)) {
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
// Bow at -X, Y up; her starboard side is -Z. A unit of it is 61 m of her. The
// slab's deck is flat across at -0.163 out to the middle of each side, and
// falls away from there to its deck edge, a metre at the most (SLAB_DECK). Hers
// is flat across, so the slab's is laid flat first: everything on it is lifted
// by as much as the slab's deck under it is lower than at its centreline,
// which keeps a wall a wall and stands everything on a deck as level as hers.
// What stands on that deck -- from a hand over it up, between the backs of
// No.2 and No.3, and out to the slab's side amidships -- is cut out of it
// square (see boxCut): every wall, tub and barbette ends a hand over the deck
// it stood on, cut clean, and the two ends of it, and its sides, are closed.
//
// Its rigging is found on a copy of it in metres (see wires): every run of
// faces a wire's thickness that runs out over her clear of what is under it,
// and every such face aloft with next to nothing solid round it, which is
// what is left of a wire where the runs of a dozen of them meet. Her mainmast
// and her tower's poles are spars a forearm thick, and stay. What only the
// wires held up -- the blocks where they crossed -- goes with them; and where a
// wire ran into a mast or a wall, the mouth it leaves is closed with a fan.
const SLAB_DECK = [[0, -0.163], [0.15, -0.1634], [0.2, -0.1654], [0.25, -0.1698], [0.3, -0.1762], [0.33, -0.1791],
  [0.4, -0.18]];
const slabDeck = (z) => {
  const a = Math.abs(z);
  for (let i = 1; i < SLAB_DECK.length; i++) {
    const [z0, y0] = SLAB_DECK[i - 1], [z1, y1] = SLAB_DECK[i];
    if (a <= z1) return y0 + (y1 - y0) * (a - z0) / (z1 - z0);
  }
  return SLAB_DECK[SLAB_DECK.length - 1][1];
};
const SUPER_UNIT = 60.97;
// From the back of No.3 to the back of No.2 -- 54.4 m abaft and 18.6 m forward
// of the middle of her, where build/prepare-musashi-hull.mjs lays it -- and out
// to her side amidships, where her beam is the slab's.
const SUPER_BOX = { x0: -0.602, x1: 0.595, y0: -0.163 + 0.15 / SUPER_UNIT, y1: 1, z0: -0.336, z1: 0.336 };
if (given(SUPER_SRC)) {
  const raw = readSource(SUPER_SRC);
  console.log('superstructure', raw.P.length / 3, 'points', raw.T.length / 3, 'triangles');
  const { P, N, T } = raw;
  for (let i = 0; i < P.length; i += 3) P[i + 1] += SLAB_DECK[0][1] - slabDeck(P[i + 2]);
  // Only what is near the box goes into the cut, which is quicker than all of it.
  const near = [];
  for (let t = 0; t < T.length; t += 3) {
    let hi = -Infinity, lo = Infinity, xl = Infinity, xh = -Infinity;
    for (let k = 0; k < 3; k++) {
      const v = T[t + k] * 3;
      hi = Math.max(hi, P[v + 1]); lo = Math.min(lo, P[v + 1]); xl = Math.min(xl, P[v]); xh = Math.max(xh, P[v]);
    }
    if (hi > SUPER_BOX.y0 - 0.002 && xh > SUPER_BOX.x0 - 0.002 && xl < SUPER_BOX.x1 + 0.002) near.push(T[t], T[t + 1], T[t + 2]);
  }
  let m = subMesh({ P, N, T: near }, () => true);
  const cut = boxCut(m, SUPER_BOX, { keep: 'inside', rescue: true });
  // Not the floor the cut laid under it all: what stood on the slab's deck
  // stands a hand into hers (see prepare-musashi-hull.mjs), and a floor
  // stretched under a melted sculpt is as likely to be laid across the open
  // deck between two deckhouses as under either of them.
  const floor = (t) => [0, 1, 2].every((j) => Math.abs(m.P[m.T[t * 3 + j] * 3 + 1] - SUPER_BOX.y0) < 1e-7);
  m = subMesh(m, (t) => !floor(t));
  for (let i = 0; i < m.N.length; i++) if (!Number.isFinite(m.N[i])) m.N[i] = 0;
  console.log('on its deck:', m.T.length / 3, 'triangles; the cut closed with', cut.caps.join('/'));
  const rig = wires({ P: m.P.map((v) => v * SUPER_UNIT), N: m.N, T: m.T }, {
    r: 0.22, minLen: 2.5, girth: 1.2, air: 1.5, loose: true, near: 0.4, crowd: 3,
  });
  m = subMesh(m, (t) => !rig[t]);
  console.log('its rigging:', rig.reduce((n, v) => n + v, 0), 'faces');
  // What the wires held up: anything whose foot is clear of the deck.
  {
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
  // The mouths the wires left: every open rim clear of the deck and no more
  // than two metres across, closed with a fan from its middle, run the other
  // way round from the faces round it.
  {
    const canon = weld(m);
    const edges = new Map();
    const ek = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
    for (let t = 0; t < m.T.length / 3; t++) {
      for (let j = 0; j < 3; j++) {
        const a = canon[m.T[t * 3 + j]], b = canon[m.T[t * 3 + (j + 1) % 3]];
        const e = edges.get(ek(a, b));
        if (e) e.n++; else edges.set(ek(a, b), { n: 1, a, b });
      }
    }
    const next = new Map();
    for (const e of edges.values()) if (e.n === 1) next.set(e.a, e.b);
    const seen = new Set();
    let closed = 0;
    for (const s0 of next.keys()) {
      if (seen.has(s0)) continue;
      const loop = [];
      let v = s0;
      while (v !== undefined && !seen.has(v)) { seen.add(v); loop.push(v); v = next.get(v); }
      if (v !== s0 || loop.length < 3) continue;
      let cx = 0, cy = 0, cz = 0, low = Infinity;
      for (const u of loop) {
        cx += m.P[u * 3] / loop.length; cy += m.P[u * 3 + 1] / loop.length; cz += m.P[u * 3 + 2] / loop.length;
        low = Math.min(low, m.P[u * 3 + 1] - SUPER_BOX.y0);
      }
      let across = 0;
      for (const u of loop) across = Math.max(across, Math.hypot(m.P[u * 3] - cx, m.P[u * 3 + 1] - cy, m.P[u * 3 + 2] - cz));
      if (low * SUPER_UNIT < 0.5 || across * SUPER_UNIT > 2) continue;
      const c = m.P.length / 3;
      m.P.push(cx, cy, cz);
      m.N.push(0, 1, 0);
      for (let i = 0; i < loop.length; i++) m.T.push(loop[(i + 1) % loop.length], loop[i], c);
      closed++;
    }
    console.log('mouths closed where the rigging ran in:', closed);
  }
  writeGlb(out('musashi-super.glb'), decimate(m, +(process.env.SUPER_RATIO || 0.1), +(process.env.SUPER_ERROR || 0.0003)));
}

// ---- her guns ----------------------------------------------------------------------
// The 15.5 cm triple and the 12.7 cm twin, each on its own; the 25 mm pod is
// four of the same pod side by side, and the first is kept.
if (given(SEC6_SRC)) {
  const sec6 = readSource(SEC6_SRC);
  writeGlb(out('musashi-155.glb'), decimate(sec6, +(process.env.SEC6_RATIO || 0.0045), 0.006));
}
if (given(SEC5_SRC)) {
  const sec5 = readSource(SEC5_SRC);
  writeGlb(out('musashi-127.glb'), decimate(sec5, +(process.env.SEC5_RATIO || 0.003), 0.008));
}
if (given(POD_SRC)) {
  const pod = crop(readSource(POD_SRC), (x, y, z) => x > 0.06 && z < -0.2);
  writeGlb(out('musashi-25pod.glb'), decimate(pod, +(process.env.POD_RATIO || 0.0016), 0.008));
}
