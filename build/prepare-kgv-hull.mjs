// Turn the owner's HMS King George V sculpts into what
// client/js/render/kgvHull.js ships: her hull and superstructure as one
// painted mesh, and her guns -- her 14-inch quadruple and twin turrets, her
// 5.25-inch twin, her octuple pom-pom, her quadruple Bofors and her Oerlikon
// -- each cut so it trains and elevates. In order:
//
//   * calibrate the sculpt of her hull into this game's frame -- bow to +Z by
//     a quarter turn, scaled to her 227.1 m and floated at 9.9 m -- and take
//     her in to her own beam: the sculpt drew her a tenth too broad for her
//     length, 34.5 m on the waterline where she was 31.4;
//   * read her deck off her, station by station, camber and all;
//   * cut off everything the sculpt stood on her deck from forward of A
//     turret's barrels to abaft Y's -- its turrets, its superstructure, its
//     melted fittings -- and lay her deck again over it, smooth;
//   * stand on it the two finer sculpts of her superstructure, each where its
//     funnels and turrets are hers: the forward one -- B turret, her bridge,
//     her tower and her foremast -- forward of her fore funnel, and the after
//     one -- her fore funnel, which the owner asked for off this one, her
//     hangars and cranes, her after funnel, her mainmast and her after
//     superstructure -- from there aft; each off the slab of hull it was
//     sculpted on, with the guns it had cast in cut out, for kgv.js stands
//     her own there;
//   * close the holes the cuts and the decimation left, and give her single
//     sheets their other face;
//   * paint her decks, split her normals at every crease;
//   * read her surface off as a height map and her lines, which is what her
//     interior and her armour are fitted under;
//   * take her guns off the owner's sculpts of them, each in the frame of its
//     mounting with what elevates on a cradle of its own;
//   * bucket the hull into length-wise slices and pack it all, base64'd, into
//     a source file kgvHull.js decodes synchronously.
//
//   node build/prepare-kgv-hull.mjs
//
// Reads assets/models/kgv-*.glb (made by build/kgv-source.mjs), writes
// client/js/render/kgvHull.data.js.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readGlb, bbox, fixWinding, components, closeHoles, recomputeNormals, weld, stations, hardEdges,
  shadePlating, boxUvs, paletteToLinear, paint, heightmap, heightBytes, pack, packPieceCompact, faceNormal,
} from './sculpt.mjs';
import { blank, tube, lathe } from './fuso-parts.mjs';
import { subMesh, dropLoose, turnInward, thinFaces, creased, measureLines } from './sculpt-parts.mjs';
import { middle, append, splitAlong, closeSmallHoles, splitLong, twinSheets } from './kgv-mesh.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET = (name) => path.join(ROOT, 'assets/models', name);
const OUT_DATA = process.argv[2] || path.join(ROOT, 'client/js/render/kgvHull.data.js');

const REAL_LOA = 227.1;
const DRAFT = 9.9;

// ---- read her, and put her in the game's frame -------------------------------
// The sculpt's own extent stem to stern, and her keel, flat along her middle
// at -0.1665. A unit of it is 119.8 m of her, and her bow is at -X:
//
//   world_X =  local_Z * UNIT * NARROW      (her port side, +Z, is +X)
//   world_Y = (local_Y - WL) * UNIT
//   world_Z = -(local_X - XC) * UNIT
//
// NARROW takes her in to her own beam: 31.4 m, where the sculpt has her 34.5.
const SCULPT = { x0: -0.9498, x1: 0.9455, keel: -0.1665 };
const UNIT = REAL_LOA / (SCULPT.x1 - SCULPT.x0);
const XC = (SCULPT.x0 + SCULPT.x1) / 2;
const WL = SCULPT.keel + DRAFT / UNIT;
export const NARROW = 0.91;
const hullToWorld = (lx, ly, lz) => [lz * UNIT * NARROW, (ly - WL) * UNIT, -(lx - XC) * UNIT];
/** The world z of a station of the hull's sculpt. */
const zOf = (lx) => -(lx - XC) * UNIT;

// Her paints, as build/kgv-source.mjs numbers them; and her superstructure's
// grey, which is left as its sculpt drew it until her decks are painted.
const GREY = 0, DECK = 1, STEEL = 2, SUPER_GREY = 5;

const m = (() => {
  const raw = readGlb(ASSET('kgv-hull.glb'));
  const P = [], N = [];
  for (let i = 0; i < raw.pos.length; i += 3) {
    P.push(...hullToWorld(raw.pos[i], raw.pos[i + 1], raw.pos[i + 2]));
    // Normals go through the inverse transpose of the narrowing.
    const nx = raw.nrm[i + 2] / NARROW, ny = raw.nrm[i + 1], nz = -raw.nrm[i];
    const l = Math.hypot(nx, ny, nz) || 1;
    N.push(nx / l, ny / l, nz / l);
  }
  const mesh = { P, N, T: Array.from(raw.idx), C: [] };
  for (let t = 0; t < mesh.T.length; t += 3) mesh.C.push(raw.paint ? Math.round(raw.paint[mesh.T[t]]) : GREY);
  return mesh;
})();
{
  const { lo, hi } = bbox(m);
  console.log('calibration: UNIT', UNIT.toFixed(3), 'world bbox',
    lo.map((v) => v.toFixed(2)).join(' '), '..', hi.map((v) => v.toFixed(2)).join(' '));
}
console.log('winding fixed:', fixWinding(m), 'of', m.T.length / 3, 'triangles were backwards');
dropLoose(m, { maxArea: 3, maxDiag: 4 });
// Where she sat on her stand's two pillars, her keel was left open: closed,
// each hole in its own plane, with every other the decimation left.
{
  const st = closeHoles(m, new Uint8Array(m.T.length / 3).fill(1), () => null, { open: true });
  console.log(`her holes: ${st.loops} closed with ${st.capped} triangles`);
}

// ---- her deck, as the sculpt has it --------------------------------------------------
// Her weather deck is one deck from her stem to her stern, rising forward to
// her bow and cambered across. It is read off the sculpt station by station:
// at each, the lowest face looking up over each of a row of points across
// her -- nothing on a deck is lower than the deck -- and a camber fitted
// through them, y = a - b x^2, run along her (see fill).
const DECK_Z = { z0: -114, z1: 114 };
const deck = (() => {
  const { P, T } = m;
  const up = [];
  for (let t = 0; t < T.length; t += 3) {
    const [nx, ny, nz] = faceNormal(m, T[t], T[t + 1], T[t + 2]);
    if (ny > 0.5 * Math.hypot(nx, ny, nz)) up.push(T[t] * 3, T[t + 1] * 3, T[t + 2] * 3);
  }
  // Bucketed by metre of her length, for speed.
  const byZ = new Map();
  for (let i = 0; i < up.length; i += 3) {
    const zs = [up[i], up[i + 1], up[i + 2]].map((a) => P[a + 2]);
    for (let k = Math.floor(Math.min(...zs)); k <= Math.ceil(Math.max(...zs)); k++) {
      if (!byZ.has(k)) byZ.set(k, []);
      byZ.get(k).push(i);
    }
  }
  const lowest = (x, z, lo = 3, hi = Infinity) => {
    let best = Infinity;
    for (const i of byZ.get(Math.floor(z)) || []) {
      const a = up[i], b = up[i + 1], c = up[i + 2];
      const d = (P[b + 2] - P[c + 2]) * (P[a] - P[c]) + (P[c] - P[b]) * (P[a + 2] - P[c + 2]);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((P[b + 2] - P[c + 2]) * (x - P[c]) + (P[c] - P[b]) * (z - P[c + 2])) / d;
      const l2 = ((P[c + 2] - P[a + 2]) * (x - P[c]) + (P[a] - P[c]) * (z - P[c + 2])) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      const y = l1 * P[a + 1] + l2 * P[b + 1] + l3 * P[c + 1];
      if (y > lo && y < hi && y < best) best = y;
    }
    return best;
  };
  // Amidships her superstructure stands on all of her deck but its edge, and
  // the sculpt has no deck under it: her deck is read at its edge, where it
  // is clear -- the lowest face looking up between two metres and half a
  // metre in from her side, either side -- and carried across her flat. Her
  // camber, where the sculpt has her deck clear right across, is a few
  // centimetres in ten metres.
  const side = (z) => {
    // Her breadth at the deck: the furthest out a face looking up is, near
    // the level of the deck there.
    let w = 0;
    for (const i of byZ.get(Math.floor(z)) || []) {
      for (const a of [up[i], up[i + 1], up[i + 2]]) if (Math.abs(P[a + 2] - z) < 1 && P[a + 1] > 3) w = Math.max(w, Math.abs(P[a]));
    }
    return w;
  };
  const A = [], B = [];
  for (let z = DECK_Z.z0; z <= DECK_Z.z1; z++) {
    const w = side(z + 0.37);
    const ys = [];
    for (const d of [0.6, 1.0, 1.4, 1.8]) for (const sgn of [-1, 1]) {
      const y = lowest(sgn * (w - d), z + 0.37);
      if (Number.isFinite(y)) ys.push(y);
    }
    ys.sort((p, q) => p - q);
    A.push(ys.length >= 3 ? ys[ys.length >> 1] : NaN); B.push(0);
  }
  const fill = (arr) => {
    const first = arr.findIndex(Number.isFinite), last = arr.length - 1 - [...arr].reverse().findIndex(Number.isFinite);
    for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) arr[i] = arr[i < first ? first : i > last ? last : i - 1];
    // What stands at her deck edge here and there -- a boat, a 5.25-inch's
    // barbette, a hatch -- reads high: her deck is the low fifth of the
    // stations round each, then a median of five.
    const low = arr.map((_, i) => { const w = arr.slice(Math.max(0, i - 10), i + 11).sort((p, q) => p - q); return w[Math.floor(w.length / 5)]; });
    return low.map((_, i) => { const w = low.slice(Math.max(0, i - 2), i + 3).sort((p, q) => p - q); return w[w.length >> 1]; });
  };
  if (process.env.DECKLINE) console.log(A.map((y, i) => `${DECK_Z.z0 + i}:${y.toFixed(2)}`).join(' '));
  const a = fill(A), b = fill(B);
  const at = (arr, z) => {
    const f = Math.min(Math.max(z - DECK_Z.z0, 0), DECK_Z.z1 - DECK_Z.z0);
    const i = Math.min(Math.floor(f), arr.length - 2);
    return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
  };
  const y = (x, z) => at(a, z) - at(b, z) * x * x;
  console.log('her deck:', [-110, -80, -50, -20, 0, 20, 50, 80, 100, 110]
    .map((z) => `${z}:${y(0, z).toFixed(2)}/${y(10, z).toFixed(2)}`).join(' '));
  return { y, lowest };
})();

/**
 * Her half-breadth at z: how far out the section of her through each metre
 * of her length goes between heights `lo` and `hi` under her deck. Read off
 * the section and not off her points: a long triangle of her side has none in
 * most metres of her length.
 */
function breadthOf(mesh, lo, hi) {
  const bins = new Map();
  const { P, T } = mesh;
  for (let t = 0; t < T.length; t += 3) {
    const v = [T[t] * 3, T[t + 1] * 3, T[t + 2] * 3];
    const zs = v.map((a) => P[a + 2]);
    for (let k = Math.ceil(Math.min(...zs)); k <= Math.floor(Math.max(...zs)); k++) {
      for (let j = 0; j < 3; j++) {
        const a = v[j], b = v[(j + 1) % 3];
        if ((P[a + 2] - k) * (P[b + 2] - k) > 0 || P[a + 2] === P[b + 2]) continue;
        const f = (k - P[a + 2]) / (P[b + 2] - P[a + 2]);
        const y = P[a + 1] + (P[b + 1] - P[a + 1]) * f;
        if (y < lo(k) || y > hi(k)) continue;
        bins.set(k, Math.max(bins.get(k) || 0, Math.abs(P[a] + (P[b] - P[a]) * f)));
      }
    }
  }
  return (z) => {
    const k = Math.round(z);
    let best = Infinity;
    for (let d = -1; d <= 1; d++) if (bins.has(k + d)) best = Math.min(best, bins.get(k + d));
    return best === Infinity ? 0 : best;
  };
}
/** Her half-breadth just under her deck. */
const halfBreadth = breadthOf(m, (z) => deck.y(0, z) - 2.5, (z) => deck.y(0, z) - 0.4);
console.log('her half-breadth under her deck:', Array.from({ length: 39 }, (_, i) => -114 + i * 6).map((z) => `${z}:${halfBreadth(z).toFixed(1)}`).join(' '));

// ---- her guns: where they stand ------------------------------------------------------
// Her 14-inch turrets: the sculpt of them (assets/models/KGVMainGuns.glb) at
// 22 m a unit, which makes her quadruple gunhouse fourteen metres long and
// twelve across, and her twin's barbette ten and a half across. A and Y
// quadruple, B twin, superfiring over A from its own barbette four metres
// high. A stands where the hull's sculpt has her gunhouse (its face at
// -0.528), B where the forward sculpt has its barbette, Y where the after
// sculpt has its gunhouse. `seat` is the top of the barbette each trains on,
// `deck` the deck it stands on, `r` its barbette's radius.
export const MAIN_SCALE = 22;
// Each pivot is this far behind its gunhouse's face, in the sculpt of it.
const PIVOT_BACK = { quad: 0.285, twin: 0.295 };

// ---- the finer sculpts of her superstructure -------------------------------------------
// Each is put on her where its funnels are hers. The hull's sculpt has her
// fore funnel at -0.0203 and her after funnel at 0.1887; the forward sculpt
// has her fore funnel at 0.3594, the after one at 0.7824 and her after funnel
// at 0.2159, bow to +X. That makes the forward sculpt 0.295 of a unit of the
// hull's to its unit and the after one 0.369 -- and with those, B's barbette,
// the gunhouses of Y and her mainmast fall where the hull's sculpt has them
// within a metre or two. Each stands on its slab's deck (`deck(sx)`, which
// in the after sculpt falls forward), put on hers, and sunk a hand.
const HULL_FORE_FUNNEL = -0.0203;
const FRONT = { k: 0.295, funnel: 0.3594, deck: () => -0.365, flip: false };
const AFT = {
  k: 0.369, funnel: 0.7824, flip: true,
  deck: (sx) => (sx < 0.08 ? -0.2545 : sx > 0.32 ? -0.2715 - Math.min(0.0145, Math.max(0, sx - 0.32) * 0.03) : -0.2545 - (sx - 0.08) / 0.24 * 0.017),
};
const SINK = 0.10;
/** Where the hull's sculpt has a point of a finer one, along her (hull units). */
const hullX = (S, sx) => HULL_FORE_FUNNEL + (S.flip ? -1 : 1) * (sx - S.funnel) * S.k;
/** A point of one of the finer sculpts, in the game's frame. */
function superToWorld(S, sx, sy, sz) {
  const x = (S.flip ? -sz : sz) * S.k * UNIT * NARROW;
  const z = zOf(hullX(S, sx));
  const y = deck.y(x, z) + (sy - S.deck(sx)) * S.k * UNIT - SINK;
  return [x, y, z];
}
/** The cut between the two: the after sculpt's from a little forward of her fore funnel aft. */
const SEAM_X = -0.055;
export const SEAM_Z = +zOf(SEAM_X).toFixed(2);

// Her turrets.
export const TURRETS = (() => {
  const yOfDeck = (z) => deck.y(0, z);
  const A = { name: 'A', kind: 'quad', z: zOf(-0.528) - PIVOT_BACK.quad * MAIN_SCALE, rest: 0, r: 6.2 };
  A.deck = yOfDeck(A.z); A.seat = A.deck + 0.45;
  const bz = superToWorld(FRONT, -0.583, -0.2475, 0);
  const B = { name: 'B', kind: 'twin', z: bz[2], rest: 0, r: 5.3, seat: bz[1], deck: yOfDeck(bz[2]) };
  // Y on the ring of the barbette the after sculpt stood its gunhouse on, at
  // -0.606 in it, a little aft of where its gunhouse's face puts it.
  const yRing = superToWorld(AFT, -0.606, -0.231, 0);
  const Y = { name: 'Y', kind: 'quad', z: yRing[2], rest: Math.PI, r: 6.2 };
  Y.deck = yOfDeck(Y.z); Y.seat = yRing[1];
  return [A, B, Y].map((t) => ({ ...t, x: 0, z: +t.z.toFixed(2), seat: +t.seat.toFixed(3), deck: +t.deck.toFixed(3) }));
})();
console.log('her turrets:', TURRETS.map((t) => `${t.name} z ${t.z} seat ${t.seat} deck ${t.deck}`).join('; '));

// Her 5.25-inch twins, port side (the starboard ones are their mirrors): two
// abreast her bridge and fore funnel, on the forward sculpt and the after,
// and two abreast her after funnel and mainmast, on the after one. Where each
// sculpt cast one -- the middle of its drum, the top of the barbette it
// stands on -- and its drum's radius, in the sculpt's units.
const CAST_525 = [
  { name: '5.25 bridge', S: FRONT, x: 0.042, z: -0.386, seat: -0.3615, r: 0.08 },
  { name: '5.25 fore funnel', S: AFT, x: 0.79, z: -0.294, seat: -0.165, r: 0.05 },
  { name: '5.25 after funnel', S: AFT, x: 0.209, z: -0.296, seat: -0.192, r: 0.058 },
  { name: '5.25 mainmast', S: AFT, x: -0.018, z: -0.273, seat: -0.242, r: 0.058 },
];
export const SECONDARY = CAST_525.map((c) => {
  const [x, y, z] = superToWorld(c.S, c.x, c.seat, c.z);
  return { name: c.name, x: +Math.abs(x).toFixed(2), z: +z.toFixed(2), y: +y.toFixed(3), rest: Math.PI / 2 };
});
console.log('her 5.25-inch:', SECONDARY.map((s) => `${s.name} ${s.x}/${s.z} at ${s.y}`).join('; '));

// Her octuple pom-poms: one a side abreast her foremast, on the platform the
// forward sculpt cast one on; one a side abreast her fore funnel, on the
// roof of her hangar; and one on her centreline on her after superstructure,
// over Y turret -- each where the after sculpt has its tub. The sculpt's own,
// melted, is cut out of each down to the floor, and kgv.js stands hers there.
const CAST_POMPOM = [
  { name: 'pom-pom foremast', S: FRONT, x: 0.15, z: -0.215, floor: -0.16, box: [0.085, 0.215, -0.31, -0.12] },
  { name: 'pom-pom fore funnel', S: AFT, x: 0.765, z: -0.145, floor: -0.052, r: 0.05 },
  { name: 'pom-pom after superstructure', S: AFT, x: -0.452, z: 0, floor: -0.135, r: 0.05, centre: true },
];

// ---- her hull, cut down to her deck --------------------------------------------------------
// From forward of A turret's barrels to abaft Y's, everything the sculpt
// stood on her deck inboard of her deck edge comes off her, from a hand under
// her deck up. Her deck edge -- her bulwarks and rails -- stays.
export const CLEARED = { z0: -79, z1: 75.5, edge: 0.9, under: 0.15 };
{
  const inside = (x, y, z) => Math.min(y - (deck.y(x, z) - CLEARED.under), halfBreadth(z) - CLEARED.edge - Math.abs(x),
    z - CLEARED.z0, CLEARED.z1 - z);
  const before = m.T.length / 3;
  splitAlong(m, inside, { drop: true });
  dropLoose(m, { maxArea: 4, maxDiag: 6 });
  console.log(`her deck cleared: ${before} triangles, ${m.T.length / 3} left`);
}
// And laid again: a sheet over what was cleared, a hair over where her deck
// was and a hand out over the edge of the cut, along her camber.
const LAID = (() => {
  const g = blank();
  const z0 = CLEARED.z0, z1 = CLEARED.z1, dz = 1.0, nx = 24;
  const rows = [];
  for (let z = z0; z <= z1 + 1e-6; z += dz) {
    const w = halfBreadth(z) - CLEARED.edge + 0.35;
    const row = [];
    for (let i = 0; i <= nx; i++) {
      const x = -w + (2 * w * i) / nx;
      g.P.push(x, deck.y(x, z) + 0.02, z); g.N.push(0, 1, 0);
      row.push(g.P.length / 3 - 1);
    }
    rows.push(row);
  }
  for (let r = 0; r + 1 < rows.length; r++) {
    for (let i = 0; i < nx; i++) {
      const a = rows[r][i], b = rows[r][i + 1], c = rows[r + 1][i + 1], d = rows[r + 1][i];
      // z rising, x rising: (a, d, c) runs anticlockwise seen from above.
      g.T.push(a, d, c, a, c, b); g.C.push(DECK, DECK);
    }
  }
  return g;
})();

// ---- the finer sculpts, stood on her --------------------------------------------------------
/**
 * One of the finer sculpts: read, its cast guns cut out of it where `cuts`
 * says (in its own frame), put on her, cut to where it is hers (`keep`, of a
 * hull station), off its slab and in from her side.
 */
function superstructure(file, S, keep, cuts) {
  const raw = readGlb(ASSET(file));
  let s = { P: Array.from(raw.pos), N: Array.from(raw.nrm), T: Array.from(raw.idx), C: new Array(raw.idx.length / 3).fill(SUPER_GREY) };
  // Its cast guns, in its own frame: each cut, and what the cut leaves loose
  // is dropped below.
  for (const g of cuts) {
    splitAlong(s, g, { drop: true });
    s = subMesh(s, () => true);
  }
  // Into her frame.
  const P = [], N = [];
  for (let i = 0; i < s.P.length; i += 3) {
    P.push(...superToWorld(S, s.P[i], s.P[i + 1], s.P[i + 2]));
    const nx = (S.flip ? -s.N[i + 2] : s.N[i + 2]) / NARROW, ny = s.N[i + 1], nz = S.flip ? s.N[i] : -s.N[i];
    const l = Math.hypot(nx, ny, nz) || 1;
    N.push(nx / l, ny / l, nz / l);
  }
  s = { P, N, T: s.T, C: s.C };
  fixWinding(s);
  // Where it is hers, and over her deck, and inboard of her side.
  splitAlong(s, (x, y, z) => -keep(z), { drop: true });
  splitAlong(s, (x, y, z) => (deck.y(x, z) - 0.05) - y, { drop: true });
  splitAlong(s, (x, y, z) => Math.abs(x) - (halfBreadth(z) - 0.35), { drop: true });
  s = subMesh(s, () => true);
  // What is left a piece on its own lying on her deck -- the slab's rails, cut
  // off it -- is not hers; nor is a scrap of wire in the air, a speck the
  // decimation left, or a gun's barrel cut off its gunhouse.
  {
    const drop = new Uint8Array(s.T.length / 3);
    let n = 0;
    for (const c of components(s)) {
      const ext = [0, 1, 2].map((k) => c.hi[k] - c.lo[k]).sort((a, b) => a - b);
      const diag = Math.hypot(...ext);
      const mid = [0, 1, 2].map((k) => (c.lo[k] + c.hi[k]) / 2);
      const low = c.hi[1] < deck.y(mid[0], mid[2]) + 0.8 && diag < 12;
      const speck = diag < 0.5 || (diag < 2.5 && c.tris.length < 120);
      const barrel = ext[2] < 9 && ext[1] < 0.75 && ext[2] > 2 && c.tris.length < 1500;
      if (!low && !speck && !barrel) continue;
      for (const t of c.tris) drop[t] = 1;
      n++;
    }
    s = subMesh(s, (t) => !drop[t]);
    console.log(`${file}: ${n} loose pieces taken off`);
  }
  const { n, tris } = closeSmallHoles(s, 10.0, { thinRim: 30 });
  console.log(`${file}: ${s.T.length / 3} triangles on her; ${n} holes and cut ends closed, ${tris} triangles`);
  return s;
}
/** A cylinder about (cx, cz), of radius r, from y0 to y1, either side: positive inside. */
const cylCut = (cx, cz, r, y0, y1, both = true) => (x, y, z) => Math.min(
  r - Math.min(Math.hypot(x - cx, z - cz), both ? Math.hypot(x - cx, z + cz) : Infinity), y - y0, y1 - y);
/** A box, either side: positive inside. */
const boxCut = ([x0, x1, z0, z1], y0, y1) => (x, y, z) => Math.min(x - x0, x1 - x, y - y0, y1 - y,
  Math.max(Math.min(z - z0, z1 - z), Math.min(-z - z0, z1 + z)));
const castCuts = (S) => [
  ...CAST_525.filter((c) => c.S === S).map((c) => cylCut(c.x, c.z, c.r + 0.005, c.seat + 0.003, c.seat + 0.13)),
  ...CAST_POMPOM.filter((c) => c.S === S).map((c) => (c.box ? boxCut(c.box, c.floor + 0.003, c.floor + 0.09)
    : cylCut(c.x, c.z, c.r, c.floor + 0.003, c.floor + 0.08, !c.centre))),
];
const front = superstructure('kgv-front.glb', FRONT, (z) => z - SEAM_Z, [
  ...castCuts(FRONT),
  // B turret: its gunhouse, off its barbette, and its barrels.
  boxCut([-0.752, -0.405, -0.155, 0.155], -0.2485, -0.05),
  // A block the slab carried forward of B's barbette, standing on her deck
  // where she had nothing.
  boxCut([-0.95, -0.775, -0.15, 0.15], -0.362, -0.2),
  boxCut([-1.0, -0.745, -0.05, 0.05], -0.25, -0.17),
  // The forward 5.25-inch's barrels, laid along her deck forward of it.
  boxCut([-0.25, -0.03, -0.47, -0.36], -0.29, -0.235),
]);
const aft = superstructure('kgv-aft.glb', AFT, (z) => SEAM_Z - z, [
  ...castCuts(AFT),
  // Y turret: its gunhouse off its barbette, under her after superstructure,
  // and its barrels.
  boxCut([-0.70, -0.47, -0.15, 0.15], -0.2325, -0.15),
  boxCut([-0.86, -0.69, -0.1, 0.1], -0.218, -0.165),
  // The barrels of the after pair of 5.25-inch, laid aft.
  boxCut([-0.2, -0.06, 0.24, 0.33], -0.24, -0.16),
  boxCut([0.03, 0.155, 0.27, 0.33], -0.19, -0.12),
]);

// Her hull's plating, in pieces short enough to measure: the decimation drew
// her side amidships as a few triangles tens of metres long, and everything
// that reads her shape off her points -- the damage board's lines, the
// stations her normals are split at -- would find most metres of her with
// no point of her side in them.
{
  const before = m.T.length / 3;
  splitLong(m, 3.0);
  console.log(`her plating: ${before} triangles split to ${m.T.length / 3}, none longer than 3 m along an edge`);
}
append(m, LAID);
append(m, front);
append(m, aft);

// ---- what the gun cuts left open, plated over ----------------------------------------------
/** A plate at height y over the ellipse about (cx, cz), facing up. */
function capDisk(mesh, cx, y, cz, rx, rz, paintOf = SUPER_GREY) {
  const SEG = 48;
  const base = mesh.P.length / 3;
  mesh.P.push(cx, y, cz); mesh.N.push(0, 1, 0);
  for (let k = 0; k <= SEG; k++) {
    const a = (2 * Math.PI * k) / SEG;
    mesh.P.push(cx + rx * Math.cos(a), y, cz + rz * Math.sin(a)); mesh.N.push(0, 1, 0);
  }
  // x = cos, z = sin, the angle rising: clockwise seen from above, so
  // (centre, k + 1, k) faces up.
  for (let k = 0; k < SEG; k++) { mesh.T.push(base, base + 2 + k, base + 1 + k); mesh.C.push(paintOf); }
}
/** A plate at height y over [x0, x1] x [z0, z1], facing up. */
function capRect(mesh, x0, x1, y, z0, z1, paintOf = SUPER_GREY) {
  const base = mesh.P.length / 3;
  for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) { mesh.P.push(x, y, z); mesh.N.push(0, 1, 0); }
  mesh.T.push(base, base + 2, base + 1, base, base + 3, base + 2); mesh.C.push(paintOf, paintOf);
}
// Where the 5.25-inch were cut off their barbettes, and the pom-poms out of
// their tubs: each plated over a hair over the cut, which is what kgv.js
// stands the gun on.
for (const c of CAST_525) {
  for (const side of [-1, 1]) {
    const [x, y, z] = superToWorld(c.S, c.x, c.seat + 0.003, side * c.z);
    const r = (c.r + 0.005) * c.S.k * UNIT + 0.15;
    capDisk(m, x, y + 0.01, z, r, r);
  }
}
for (const c of CAST_POMPOM) {
  for (const side of c.centre ? [1] : [-1, 1]) {
    if (c.box) {
      const [x0, x1, z0, z1] = c.box;
      const a = superToWorld(c.S, x0, c.floor + 0.003, side * z0), b = superToWorld(c.S, x1, c.floor + 0.003, side * z1);
      capRect(m, Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.max(a[1], b[1]) + 0.01, Math.min(a[2], b[2]), Math.max(a[2], b[2]));
    } else {
      const [x, y, z] = superToWorld(c.S, c.x, c.floor + 0.003, side * c.z);
      const r = c.r * c.S.k * UNIT;
      capDisk(m, x, y + 0.01, z, r, r);
    }
  }
}

// ---- the tops of B's and Y's barbettes ---------------------------------------------------
// Each sculpt's gunhouse came off its barbette at the top of it and left it
// open: each is plated over, a hair under where kgv.js stands the gunhouse.
// A's is drawn by kgv.js, up from her deck.
export const BARBETTE_TOPS = [
  { name: 'B', z: TURRETS[1].z, r: 4.85 },
  { name: 'Y', z: TURRETS[2].z, r: 5.05 },
];
for (const b of BARBETTE_TOPS) {
  const t = TURRETS.find((q) => q.name === b.name);
  capDisk(m, 0, t.seat - 0.01, b.z, b.r, b.r);
}

if (process.env.DUMP) {
  const { writeGlb } = await import('./sculpt-source.mjs');
  const paintOf = new Float32Array(m.P.length / 3);
  for (let t = 0; t < m.T.length / 3; t++) for (let j = 0; j < 3; j++) paintOf[m.T[t * 3 + j]] = m.C[t];
  writeGlb(process.env.DUMP, { P: m.P, N: m.N, T: m.T, paint: paintOf }, 'dump');
  if (process.env.STAGE === 'merge') process.exit(0);
}

// ---- her paint, where the decimation smeared it ---------------------------------------
// Nothing over her boot topping is red, and nothing a metre and a half over
// her waterline is boot topping.
{
  let n = 0;
  for (let t = 0; t < m.C.length; t++) {
    if (m.C[t] !== 3 && m.C[t] !== 4) continue;
    const [, cy] = middle(m, t);
    if ((m.C[t] === 4 && cy > 0.4) || (m.C[t] === 3 && cy > 1.4)) { m.C[t] = GREY; n++; }
  }
  console.log(`her paint: ${n} triangles over her boot topping painted grey`);
}

// ---- her decks' paint ---------------------------------------------------------------
// Her weather deck is planked, the sculpt's where it was left and hers where
// it was laid again; her superstructure's decks, platforms and flats are
// steel, the dark grey of a deck that is walked on, and its walls her grey.
{
  const { T, C } = m;
  let planked = 0, steel = 0;
  for (let t = 0; t < T.length / 3; t++) {
    const [nx, ny, nz] = faceNormal(m, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
    const flat = ny > 0.8 * Math.hypot(nx, ny, nz);
    const [cx, cy, cz] = middle(m, t);
    if (C[t] === GREY && flat && Math.abs(cy - deck.y(cx, cz)) < 0.25 && Math.abs(cx) < halfBreadth(cz) - 0.3) { C[t] = DECK; planked++; }
    if (C[t] !== SUPER_GREY) continue;
    if (flat && cy > deck.y(cx, cz) + 0.3) { C[t] = STEEL; steel++; } else C[t] = GREY;
  }
  console.log(`decks: ${planked} faces of her weather deck planked, ${steel} of her superstructure's decks steel`);
}

// ---- the faces that face in, and her normals split at her creases --------------------
// Holes the decimation tore in her that the cuts did not make -- a pinhole in
// a funnel, a seam opened along a wall -- are closed first.
{
  const { n, tris } = closeSmallHoles(m, 4.0, { thinRim: 12 });
  console.log(`her plating: ${n} pinholes and slits closed, ${tris} triangles`);
}
console.log(`faces facing in: ${turnInward(m)} turned`);
recomputeNormals(m);
const st = stations(m, { length: REAL_LOA, beamCap: 6.8, edgeCap: 10.0, slice: true, beamFloor: 0 });
const canon = weld(m);
const thin = thinFaces(m, 0.5);
const plating = hardEdges(m, canon, st, {
  crease: 44 * Math.PI / 180, plateTilt: 35 * Math.PI / 180, foot: -4.0, smooth: thin,
});
shadePlating(m, plating, { along: 3.0, up: 0.5 });

// ---- her single sheets, given their other face ----------------------------------
// The sculpts draw a bulwark, a platform's rim, a boat's gunwale, a splinter
// shield as one sheet of plate, and the simplification left slivers at her
// seams through which the inside of a wall is in view: drawn one-sided, each
// is the sky seen from behind. Each face of her over her waterline that looks
// out into the open from behind is given a twin facing the other way (see
// twinSheets).
{
  const nf = m.T.length / 3;
  const twins = twinSheets(m, { rays: 7, reach: 8, only: (t) => t < nf && middle(m, t)[1] > 1.5 });
  console.log(`her single sheets: ${twins} faces given a twin`);
}

// ---- her surface, as a height map --------------------------------------------------
const HM = { x0: -17, z0: -115, step: 0.5, nx: 69, nz: 461 };
const hm = heightmap(m, HM);
/** Her surface at (x, z), off the height map: the top of what is there. */
const surfaceAt = (x, z) => {
  const i = Math.round((x - HM.x0) / HM.step), k = Math.round((z - HM.z0) / HM.step);
  if (i < 0 || i >= HM.nx || k < 0 || k >= HM.nz) return -99;
  return hm[k * HM.nx + i];
};

// ---- paint -----------------------------------------------------------------------------
// The Home Fleet's medium grey, her deck planking, the dark grey of her
// steel decks, her black boot topping and her red bottom.
const PALETTE = [
  [0x7a, 0x82, 0x89],
  [0x9a, 0x8f, 0x74],
  [0x55, 0x5c, 0x65],
  [0x19, 0x1c, 0x20],
  [0x8c, 0x3a, 0x2c],
].map(paletteToLinear);
const paintOfVertex = new Uint8Array(m.P.length / 3);
for (let t = 0; t < m.T.length / 3; t++) for (let j = 0; j < 3; j++) paintOfVertex[m.T[t * 3 + j]] = m.C[t];
const uvArr = boxUvs(m);
const col = paint(m, (i) => PALETTE[paintOfVertex[i]]);

function packPiece(mesh) {
  if (!mesh.C) return packPieceCompact(mesh);
  const byV = new Uint8Array(mesh.P.length / 3);
  for (let t = 0; t < mesh.T.length / 3; t++) for (let j = 0; j < 3; j++) byV[mesh.T[t * 3 + j]] = mesh.C[t];
  return packPieceCompact(mesh, (i) => PALETTE[byV[i]]);
}

// ---- her guns, as the owner sculpted them ------------------------------------------
// Each is put in the frame of its mounting: the pivot at the origin, the foot
// of what trains at y = 0, the bore along +z. What elevates -- the barrels
// and what carries them -- is lifted off it on to a cradle about its
// trunnions, turned down level if it was sculpted laid up; what is left
// trains.
//
//   file      the decimated sculpt (see build/kgv-source.mjs)
//   map       a point of the sculpt into the mounting's frame, in metres;
//             `turn` the same for a normal
//   trunnion  [y, z] of its trunnions in the mounting's frame
//   elev      how far it was sculpted laid up, radians
//   cradle    (x, y, z) => whether a point of the sculpt elevates
//   muzzles   [x, y, z] of each muzzle, in the cradle's frame
//   house     (mesh) => the house as it is to be (stretched, say)
function gunPiece(file, { map, turn, trunnion, elev = 0, cradle = () => false, muzzles, holes = 0.5 }) {
  const raw = readGlb(ASSET(file));
  const P = [], N = [], src = [];
  for (let i = 0; i < raw.pos.length; i += 3) {
    P.push(...map(raw.pos[i], raw.pos[i + 1], raw.pos[i + 2]));
    N.push(...turn(raw.nrm[i], raw.nrm[i + 1], raw.nrm[i + 2]));
    src.push(raw.pos[i], raw.pos[i + 1], raw.pos[i + 2]);
  }
  const mesh = { P, N, T: Array.from(raw.idx), C: new Array(raw.idx.length / 3).fill(GREY) };
  fixWinding(mesh);
  const lifts = new Uint8Array(mesh.T.length / 3);
  for (let t = 0; t < lifts.length; t++) {
    const c = [0, 1, 2].map((k) => (src[mesh.T[t * 3] * 3 + k] + src[mesh.T[t * 3 + 1] * 3 + k] + src[mesh.T[t * 3 + 2] * 3 + k]) / 3);
    lifts[t] = cradle(...c) ? 1 : 0;
  }
  // Off square at its foot: nothing under it.
  const house = subMesh(mesh, (t) => !lifts[t]);
  splitAlong(house, (x, y) => -y, { drop: true });
  const shut = closeSmallHoles(house, holes);
  for (let t = 0; t < house.T.length / 3; t++) {
    const [nx, ny, nz] = faceNormal(house, house.T[t * 3], house.T[t * 3 + 1], house.T[t * 3 + 2]);
    house.C[t] = ny > 0.9 * Math.hypot(nx, ny, nz) && middle(house, t)[1] < 0.6 ? STEEL : GREY;
  }
  creased(house, 40);
  const guns = subMesh(mesh, (t) => lifts[t]);
  // Into the cradle's frame: origin on the trunnions, the bore along +z.
  const c = Math.cos(elev), s = Math.sin(elev);
  const [ty, tz] = trunnion;
  for (let i = 0; i < guns.P.length; i += 3) {
    const y = guns.P[i + 1] - ty, z = guns.P[i + 2] - tz;
    guns.P[i + 1] = y * c - z * s; guns.P[i + 2] = y * s + z * c;
    const ny = guns.N[i + 1], nz = guns.N[i + 2];
    guns.N[i + 1] = ny * c - nz * s; guns.N[i + 2] = ny * s + nz * c;
  }
  if (guns.T.length) creased(guns, 40);
  let roof = 0;
  for (let i = 1; i < house.P.length; i += 3) roof = Math.max(roof, house.P[i]);
  const out = { house, guns, trunnion: [0, +ty.toFixed(3), +tz.toFixed(3)], roof: +roof.toFixed(3), muzzles };
  console.log(`${file}: ${shut.n} holes closed; house ${house.T.length / 3} triangles, ${roof.toFixed(2)} m high; cradle ${guns.T.length / 3} `
    + `triangles about trunnions ${ty.toFixed(2)} m up, ${tz.toFixed(2)} m ahead`);
  return out;
}
const ident = (x, y, z) => [x, y, z];
/** Barrels drawn out past `from` (in the cradle's frame) by `k`, and the muzzles with them. */
function stretch(g, from, k) {
  let tip = 0;
  for (let i = 2; i < g.guns.P.length; i += 3) {
    if (g.guns.P[i] > from) g.guns.P[i] = from + (g.guns.P[i] - from) * k;
    tip = Math.max(tip, g.guns.P[i]);
  }
  g.muzzles = g.muzzles.map(([x, y]) => [x, y, +tip.toFixed(3)]);
  return tip;
}

// Her 14-inch Mk VII: the quadruple turret, A and Y, and the twin, B, at
// MAIN_SCALE. Barrels along +z, laid level, their axes at -0.032 and the
// faces of the gunhouses at 0.075 (quadruple) and 0.065 (twin). The sculpt
// drew the barrels short of a 14-inch/45: forward of a few metres out of the
// face they are drawn out to it.
const S14 = MAIN_SCALE;
function mainPiece(file, { px, pz, foot, face, barrels }) {
  const g = gunPiece(file, {
    map: (x, y, z) => [(x - px) * S14, (y - foot) * S14, (z - pz) * S14], turn: ident,
    trunnion: [(-0.032 - foot) * S14, (face - 0.035 - pz) * S14],
    cradle: (x, y, z) => z > face + 0.004 && barrels.some((bx) => Math.hypot(x - bx, y + 0.032) < 0.03),
    muzzles: barrels.map((bx) => [+((bx - px) * S14).toFixed(3), 0, 0]),
  });
  const tip = stretch(g, 3.4, 1.28);
  console.log(`${file}: barrels drawn out to ${tip.toFixed(2)} m from the trunnions`);
  return g;
}
const MAIN_A = mainPiece('kgv-14a.glb', { px: -0.626, pz: -0.215, foot: -0.0957, face: 0.075, barrels: [-0.7925, -0.6821, -0.5714, -0.4583] });
const MAIN_B = mainPiece('kgv-14b.glb', { px: -0.005, pz: -0.2316, foot: -0.0953, face: 0.065, barrels: [-0.0636, 0.0531] });
const MAIN_Y = mainPiece('kgv-14y.glb', { px: 0.626, pz: -0.215, foot: -0.0951, face: 0.075, barrels: [0.4596, 0.5727, 0.6830, 0.7930] });

// Her 5.25-inch Mk I twin: the gunhouse the after sculpt cast abreast her
// mainmast, at the after sculpt's own scale (0.369 of 119.8 m a unit), which
// makes its drum five metres across. Its barrels pointed -x in it, cast as
// two spikes, and are drawn again: a 5.25-inch/50 either side of its shield's
// middle, from inside the drum to a muzzle six and a half metres out of its
// trunnions.
const S525 = AFT.k * UNIT;
const SEC = gunPiece('kgv-525.glb', {
  map: (x, y, z) => [(z - 0.274) * S525, (y + 0.2545) * S525, -(x + 0.016) * S525],
  turn: (x, y, z) => [z, y, -x],
  trunnion: [(-0.188 + 0.2545) * S525, (-0.016 + 0.05) * S525],
  muzzles: [],
  holes: 1.5,
});
// The sculpt drew its drum into the wall of her after superstructure on its
// inboard side, and that side came off it with the wall: its drum is drawn
// again whole round it, a hair outside the sculpt's, from its foot to the
// edge of its roof, with its roof plated under the sculpt's.
{
  const R = 0.0625 * S525, top = (-0.1655 + 0.2545) * S525;
  const g = blank();
  lathe(g, 0, 0, R, R, [[0.0, 1.0], [top, 1.0]], 64, GREY);
  // And the band round its foot.
  lathe(g, 0, 0, R, R, [[0.1, 1.035], [0.3, 1.035]], 64, GREY);
  for (let t = 0; t < g.T.length / 3; t++) {
    const [nx, ny, nz] = faceNormal(g, g.T[t * 3], g.T[t * 3 + 1], g.T[t * 3 + 2]);
    if (ny < -0.5 * Math.hypot(nx, ny, nz)) g.C[t] = -1;
  }
  const drum = subMesh(g, (t) => g.C[t] !== -1);
  creased(drum, 40);
  append(SEC.house, drum);
  console.log(`kgv-525.glb: its drum drawn again, ${R.toFixed(2)} m across the radius, ${top.toFixed(2)} m high`);
}
{
  const len = 6.5, xs = [-0.72, 0.38];
  const g = blank();
  for (const x of xs) {
    tube(g, [x, 0, -0.9], [x, 0, 1.6], 0.24, 0.22, 20, GREY);
    tube(g, [x, 0, 1.6], [x, 0, len - 0.3], 0.13, 0.1, 20, GREY);
    tube(g, [x, 0, len - 0.3], [x, 0, len], 0.115, 0.11, 20, GREY);
  }
  creased(g, 40);
  SEC.guns = g;
  SEC.muzzles = xs.map((x) => [x, 0, len]);
}

// Her 2-pdr Mk VIII on the octuple Mk VI mounting: the Hood's quadruple
// (assets/models/kgv-pompom.glb, two rows of two) at 1.6 m a unit, its
// platform and shield drawn out half as wide again, and its barrels, breeches
// and ammunition boxes twice over side by side -- two rows of four.
const PP = { scale: 1.6, pivot: [-0.11, 0], foot: -0.46, trunnion: [-0.04, 0.14], elev: 0.52 };
const POMPOM = (() => {
  const { scale, pivot, foot, trunnion: [tx, ty], elev } = PP;
  const c = Math.cos(elev), s = Math.sin(elev);
  const g = gunPiece('kgv-pompom.glb', {
    map: (x, y, z) => [(z - pivot[1]) * scale, (y - foot) * scale, -(x - pivot[0]) * scale],
    turn: (x, y, z) => [z, y, -x],
    trunnion: [(ty - foot) * scale, -(tx - pivot[0]) * scale], elev,
    cradle: (x, y, z) => {
      const u = (tx - x) * c + (y - ty) * s, v = -(tx - x) * s + (y - ty) * c;
      return u > -0.25 && u < 1.05 && v > -0.27 && v < 0.3 && Math.abs(z) < 0.27 && (x > -0.48 || y > 0.3);
    },
    muzzles: [],
  });
  const W = 1.45, OFF = 0.45;
  for (let i = 0; i < g.house.P.length; i += 3) g.house.P[i] *= W;
  for (let i = 0; i < g.house.N.length; i += 3) {
    g.house.N[i] /= W;
    const l = Math.hypot(g.house.N[i], g.house.N[i + 1], g.house.N[i + 2]) || 1;
    for (let k = 0; k < 3; k++) g.house.N[i + k] /= l;
  }
  const two = { P: [], N: [], T: [], C: [] };
  for (const dx of [-OFF, OFF]) {
    append(two, { P: g.guns.P.map((v, i) => (i % 3 === 0 ? v + dx : v)), N: g.guns.N, T: g.guns.T, C: g.guns.C });
  }
  g.guns = two;
  const q = [[-0.14, 0.19, 0.81], [0.14, 0.19, 0.81], [-0.14, -0.11, 0.98], [0.14, -0.11, 0.98]];
  g.muzzles = [-OFF, OFF].flatMap((dx) => q.map(([z, v, u]) => [+(z * scale + dx).toFixed(3), +(v * scale).toFixed(3), +(u * scale).toFixed(3)]));
  return g;
})();

// The quadruple 40 mm Bofors Mk II: 2.7 m a unit, which makes it four metres
// across. Its barrels pointed +z in the sculpt, laid up thirty degrees about
// trunnions at (y 0.43, z -0.12); its cradle is its four barrels in their
// two pairs, their breeches and loading trays.
const BF = { scale: 2.7, pz: -0.05, foot: -0.285, ty: 0.43, tz: -0.12, elev: 0.51 };
const BOFORS = (() => {
  const { scale, pz, foot, ty, tz, elev } = BF;
  const c = Math.cos(elev), s = Math.sin(elev);
  return gunPiece('kgv-bofors.glb', {
    map: (x, y, z) => [x * scale, (y - foot) * scale, (z - pz) * scale], turn: ident,
    trunnion: [(ty - foot) * scale, (tz - pz) * scale], elev,
    cradle: (x, y, z) => {
      const u = (z - tz) * c + (y - ty) * s, v = -(z - tz) * s + (y - ty) * c;
      return u > -0.3 && v > -0.2 && v < 0.22 && Math.abs(x) > 0.17 && Math.abs(x) < 0.5;
    },
    muzzles: [-0.3875, -0.275, 0.275, 0.3875].map((x) => [+(x * scale).toFixed(3), 0, +(0.96 * scale).toFixed(3)]),
  });
})();

// The 20 mm Oerlikon on its pedestal: 1.45 m a unit, which makes it a man's
// height and a half to the top of its shield. Its barrel pointed -x, laid up
// nine and a half degrees about trunnions at (x 0.1, y 0.28) on its column;
// the gun, its magazine and its shoulder rests elevate, its shield and column
// train.
const OE = { scale: 1.45, px: 0.03, foot: -0.69, tx: 0.1, ty: 0.28, elev: 0.165 };
const OERLIKON = (() => {
  const { scale, px, foot, tx, ty, elev } = OE;
  return gunPiece('kgv-oerlikon.glb', {
    map: (x, y, z) => [z * scale, (y - foot) * scale, -(x - px) * scale], turn: (x, y, z) => [z, y, -x],
    trunnion: [(ty - foot) * scale, -(tx - px) * scale], elev,
    cradle: (x, y, z) => {
      const shield = x > -0.32 && x < -0.14 && Math.abs(z) > 0.05;
      return !shield && (y > 0.3 || (x < -0.25 && y > 0.2) || (x > 0.35 && y > 0.18));
    },
    muzzles: [[0, 0, +(1.085 * scale).toFixed(3)]],
  });
})();

if (process.env.STAGE === 'guns') {
  const { writeGlb } = await import('./sculpt-source.mjs');
  const dir = process.env.PIECES || '.';
  for (const [name, g] of Object.entries({ mainA: MAIN_A, mainB: MAIN_B, mainY: MAIN_Y, sec: SEC, pompom: POMPOM, bofors: BOFORS, oerlikon: OERLIKON })) {
    const all = { P: [...g.house.P], N: [...g.house.N], T: [...g.house.T], C: [...g.house.C] };
    if (g.guns.T.length) append(all, { P: g.guns.P.map((v, i) => v + g.trunnion[i % 3]), N: g.guns.N, T: g.guns.T, C: g.guns.C });
    writeGlb(path.join(dir, `${name}-all.glb`), { P: all.P, N: all.N, T: all.T }, 'piece');
  }
  process.exit(0);
}

// ---- where her light guns stand ---------------------------------------------------------
// Port side, the starboard ones their mirrors, except what stands on her
// centreline. `y` is what each stands on: a tub's floor as it was plated, or
// her surface where it stands.
export const POMPOMS = CAST_POMPOM.map((c) => {
  const [x, y, z] = superToWorld(c.S, c.x, c.floor + 0.003, c.z);
  return { name: c.name, x: +Math.abs(x).toFixed(2), z: +z.toFixed(2), y: +(y + 0.01).toFixed(3), centre: !!c.centre };
});
/** Where a mounting stands at (x, z): the median of her surface within r of it. */
const seatAt = (x, z, r = 1.0) => {
  const hs = [];
  for (let dz = -r; dz <= r + 1e-6; dz += HM.step) for (let dx = -r; dx <= r + 1e-6; dx += HM.step) {
    if (dx * dx + dz * dz > r * r + 1e-6) continue;
    const y = surfaceAt(x + dx, z + dz);
    if (y > -50) hs.push(y);
  }
  hs.sort((a, b) => a - b);
  return hs.length ? hs[hs.length >> 1] : -99;
};
const standing = (list) => list.map((g) => ({ ...g, y: +seatAt(g.x, g.z, g.r || 1.0).toFixed(3) }));
const edge = (z, inset) => +(halfBreadth(z) - inset).toFixed(2);

// Her four quadruple Bofors -- two as she carried them in 1945 and two more
// where she carried single ones -- one a side on her forecastle abaft A
// turret, and one a side on her quarterdeck abaft Y, each clear of the sweep
// of its turret's barrels.
export const BOFORS_SEATS = standing([
  { name: 'Bofors forecastle', x: 8.0, z: 46.0, r: 2.0 },
  { name: 'Bofors quarterdeck', x: 4.6, z: -84.5, r: 2.0 },
]);

// Her thirty-six Oerlikons, eighteen a side, along the edge of her deck as
// she carried them by 1945: on her forecastle forward of A and abreast B, on
// her deck abreast her superstructure clear of her 5.25-inch and her boats,
// and on her quarterdeck abreast Y and abaft it, with a second row inboard
// near her stern. Her superstructure's decks are too crowded to take one.
export const OERLIKON_SEATS = standing([
  { z: 92.0, inset: 1.3 }, { z: 86.0, inset: 1.3 }, { z: 80.0, inset: 1.3 }, { z: 51.0, inset: 1.3 },
  { z: 42.0, inset: 1.3 }, { z: 36.0, inset: 1.3 }, { z: 24.0, inset: 1.3 }, { z: -4.0, inset: 1.2 },
  { z: -14.0, inset: 1.2 }, { z: -44.0, inset: 1.2 }, { z: -58.0, inset: 1.3 }, { z: -66.0, inset: 1.3 },
  { z: -74.0, inset: 1.3 }, { z: -82.0, inset: 1.3 }, { z: -90.0, inset: 1.3 }, { z: -98.0, inset: 1.3 },
  { z: -95.0, inset: 4.3 }, { z: -101.0, inset: 2.9 },
].map(({ z, inset }) => ({ name: 'Oerlikon', x: edge(z, inset), z, r: 0.8 })));
console.log('her Bofors:', BOFORS_SEATS.map((s) => `${s.x}/${s.z}@${s.y}`).join(' '));
console.log('her Oerlikons:', OERLIKON_SEATS.map((s) => `${s.x}/${s.z}@${s.y}`).join(' '));
console.log('her pom-poms:', POMPOMS.map((s) => `${s.x}/${s.z}@${s.y}`).join(' '));

// ---- her lines, as the sculpt has them --------------------------------------------
// Off the round metre, so a plane through a station's points does not cut
// each triangle there at a corner (see prepare-fuso-hull.mjs).
const LINES = measureLines(m, st, { z0: -112.9963, dz: 1, nz: 226, y0: -10.5, dy: 0.5, ny: 40 }, deck.y(0, 0));

// ---- slice, pack and write ------------------------------------------------------------
const surfaceOf = (t) => (m.C[t] === DECK ? 1 : 0);
const packed = pack(m, col, uvArr, { buckets: 64, length: REAL_LOA, surfaceOf, compact: true });
console.log('buckets', packed.buckets, 'tris', packed.tris);
const b64 = packed.blob.toString('base64');
console.log('packed hull', packed.blob.length, 'bytes ->', b64.length, 'base64 chars');
const piece = (g) => ({
  trunnion: g.trunnion, muzzles: g.muzzles, roof: g.roof,
  house: packPiece(g.house).toString('base64'), guns: g.guns.T.length ? packPiece(g.guns).toString('base64') : null,
});
const r6 = (v) => +v.toFixed(6);
const deckLine = [];
for (let z = -112; z <= 112; z += 4) deckLine.push(+deck.y(0, z).toFixed(3));
const mounts = {
  turrets: TURRETS.map(({ name, kind, x, z, rest, seat, deck: d, r }) => ({ name, kind, x, z, rest: r6(rest), seat, deck: d, r })),
  secondary: SECONDARY.map(({ name, x, z, y, rest }) => ({ name, x, z, y, rest: r6(rest) })),
  pompom: POMPOMS,
  bofors: BOFORS_SEATS,
  oerlikon: OERLIKON_SEATS,
  // Her deck on her centreline, every four metres from -112 to 112.
  deck: deckLine,
};
writeFileSync(OUT_DATA,
  `// Generated by build/prepare-kgv-hull.mjs from the owner's sculpts.\n`
  + `// Do not hand-edit -- regenerate from the source assets instead.\n`
  + `export const KGV_HULL_B64 = ${JSON.stringify(b64)};\n`
  + `// Her surface height, in centimetres, every ${HM.step} m: see kgvSurfaceY.\n`
  + `export const KGV_SURFACE = ${JSON.stringify({ ...HM, b64: heightBytes(hm).toString('base64') })};\n`
  + `// Her 14-inch quadruple and twin, her 5.25-inch twin, her octuple pom-pom,\n`
  + `// her quadruple Bofors and her Oerlikon, as the owner sculpted them, each\n`
  + `// in the frame of its mounting.\n`
  + `export const KGV_GUNS = ${JSON.stringify({
    mainA: piece(MAIN_A), mainB: piece(MAIN_B), mainY: piece(MAIN_Y), sec: piece(SEC),
    pompom: piece(POMPOM), bofors: piece(BOFORS), oerlikon: piece(OERLIKON),
  })};\n`
  + `// Where her turrets, her 5.25-inch and her light guns stand; port side,\n`
  + `// the starboard ones their mirrors.\n`
  + `export const KGV_MOUNTS = ${JSON.stringify(mounts)};\n`
  + `// Her lines as the sculpt has them: keel, the deck over her insides, and\n`
  + `// her half-breadth at every half metre of height, a metre at a time.\n`
  + `export const KGV_LINES = ${JSON.stringify(LINES)};\n`);
console.log('wrote', OUT_DATA);
