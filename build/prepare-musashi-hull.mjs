// Turn the owner's IJN Musashi sculpts into what client/js/render/musashiHull.js
// ships: her hull, her superstructure, her funnel, her masts and her bridge
// tower as one painted mesh, and her three 46 cm turrets as the sculpt of her
// drew them, cut free so they train and elevate. In order:
//
//   * calibrate the sculpt of the whole of her into this game's frame -- bow
//     to +Z by a rotation, scaled to her 263 m, and floated at 10.4 m; her
//     paint (see build/musashi-source.mjs) rides along a triangle at a time;
//   * take her superstructure off her, from the foot of No.2 to the foot of
//     No.3, where the sculpt of the whole of her melted it, and stand in its
//     place her superstructure as the sculpt of that drew it -- her funnel,
//     her after superstructure, her mainmast, every gun platform and tub --
//     scaled so its 15.5 cm turrets stand where hers did, laid on her deck,
//     its starboard side and the mirror of it; and in the middle of it her
//     bridge tower as the sculpt of that drew it;
//   * cut her three turrets out of her exactly, gunhouse and barrels, down to
//     the barbette each trains on; cut out every other gun the sculpts cast
//     into her -- her 15.5 cm gunhouses, her 12.7 cm twins, her 25 mm, her
//     catapults -- and close every hole;
//   * sand the lumps off her decks, take the dents decimation left out of
//     everything flat on her without rounding her corners, lay her decks;
//   * fair her topsides; split her normals at every crease and wherever two
//     paints meet;
//   * read her surface off as a height map, which is what musashi.js stands
//     every mounting on, and her lines, which is what her interior and her
//     armour are fitted under;
//   * lift her turrets out of the finer decimation of her forecastle and her
//     quarterdeck, each gunhouse in the frame of its mounting with its three
//     barrels turned true along the sculpt's own; and her 15.5 cm triple, her
//     12.7 cm twin and her 25 mm pod off the owner's sculpts of them;
//   * bucket the hull into length-wise slices and pack it all, base64'd, into
//     a source file musashi.js decodes synchronously.
//
// The stages are build/sculpt.mjs and build/sculpt-parts.mjs; what is here is
// what is hers.
//
//   node build/prepare-musashi-hull.mjs
//
// Reads assets/models/musashi-*.glb (made by build/musashi-source.mjs), writes
// client/js/render/musashiHull.data.js. Re-run it whenever an asset or
// anything below changes; the data file is committed, so a fresh clone runs
// without this script.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readGlb, toGameFrame, bbox, fixWinding, boxCut, components,
  recomputeNormals, weld, stations, fair, hardEdges, shadePlating, boxUvs, denoise,
  paletteToLinear, paint, heightmap, heightBytes, pack, packPieceCompact, faceNormal,
} from './sculpt.mjs';
import {
  subMesh, wires, dropLoose, turnInward, thinFaces, clone, compact, creased, barrelsOf, turnedBarrels,
  strippedHouse, measureLines, flaps,
} from './sculpt-parts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET = (name) => path.join(ROOT, 'assets/models', name);
const OUT_DATA = process.argv[2] || path.join(ROOT, 'client/js/render/musashiHull.data.js');

const REAL_LOA = 263;
const DRAFT = 10.4;

// ---- read her, and put her in the game's frame -------------------------------
// The sculpt's own extent stem to stern and across, and her keel, flat along
// the whole of her at -0.19335. She is floated at her 10.4 m design draft. A
// unit of the sculpt is 138.35 m of her.
const SCULPT = {
  x0: -0.9507778882980347, x1: 0.950212836265564,
  z0: -0.1491166651248932, z1: 0.1481526643037796,
};
const UNIT = REAL_LOA / (SCULPT.x1 - SCULPT.x0);
const FRAME = {
  xc: (SCULPT.x0 + SCULPT.x1) / 2, zc: (SCULPT.z0 + SCULPT.z1) / 2,
  SCALE: UNIT, localKeel: -0.19335 + DRAFT / UNIT, keelY: 0,
};

// Her paints, as build/musashi-source.mjs numbers them.
const GREY = 0, DECK = 1, STEEL = 2;
/** Her upper deck amidships, and nothing lower than this faces the sky and is a deck. */
const DECK_Y = 7.72;
const DECK_FLOOR = 5.5;

// Her upper deck: flat at 7.72 m from her quarterdeck to abreast her bridge,
// and falling from there to 6.1 m at the foot of No.1, as the sculpt has it --
// the dip in her deck the Yamatos are known by, before it rises to her bow.
// Aft of z -110 her deck steps down to the aircraft deck, 5.3 m up, over her
// hangar.
const DECK_LINE = [[-200, 5.3], [-110.8, 5.3], [-109.6, 7.72], [6, 7.72], [10, 7.53], [14, 7.15], [18, 6.85], [22, 6.66], [26, 6.53],
  [30, 6.35], [34, 6.18], [38, 6.14], [60, 6.1]];
const deckAt = (z) => {
  if (z <= DECK_LINE[0][0]) return DECK_LINE[0][1];
  for (let i = 1; i < DECK_LINE.length; i++) {
    if (z > DECK_LINE[i][0]) continue;
    const [a, ya] = DECK_LINE[i - 1], [b, yb] = DECK_LINE[i];
    return ya + (yb - ya) * (z - a) / (b - a);
  }
  return DECK_LINE[DECK_LINE.length - 1][1];
};

/** A painted decimation of her, in the game's frame, with a paint a triangle. */
function load(file) {
  const raw = readGlb(file);
  const m = toGameFrame(raw, { length: REAL_LOA, keelY: 0, frame: FRAME });
  m.C = [];
  for (let t = 0; t < m.T.length; t += 3) m.C.push(raw.paint ? Math.round(raw.paint[m.T[t]]) : GREY);
  return m;
}

const m = load(ASSET('musashi-hull.glb'));
{
  const { lo, hi } = bbox(m);
  console.log('calibration: SCALE', FRAME.SCALE.toFixed(3), 'world bbox',
    lo.map((v) => v.toFixed(2)).join(' '), '..', hi.map((v) => v.toFixed(2)).join(' '));
}
console.log('winding fixed:', fixWinding(m), 'of', m.T.length / 3, 'triangles were backwards');

// ---- where her superstructure goes -------------------------------------------------
// From the foot of No.2's barbette to the foot of No.3's, all the way across
// her: what the sculpt of the whole of her stood there comes off down to her
// deck, and her superstructure goes in its place. Forward and abaft of that,
// alongside No.1, No.2 and No.3, the superstructure sculpt drew her tubs and
// her gun platforms on her deck too, and it is what stands there, outboard of
// the turrets' barbettes.
const ISLAND = { z0: -54.5, z1: 18.8 };
const SIDES = { z0: -79, z1: 44, x: 8.6 };

// ---- her superstructure, as the sculpt of it drew it ----------------------------------
// Bow at +X, Y up, starboard at +Z. 59.37 m a unit: at that its 15.5 cm
// turrets stand where the sculpt of the whole of her had them, fore and aft
// of her superstructure, and its funnel and her tower within a metre or two
// of where hers were. Its deck is cambered and hers is not, and it came a
// little out of level: the deck it drew is fitted, and everything on it is
// shifted up or down by as much as that deck stands off hers at the same
// place -- which keeps a wall a wall -- so what stood on its deck stands on
// hers. Only its starboard side is used, and her port side is its mirror
// (see build/musashi-source.mjs). The slab of her hull it was drawn on is
// broader than the sculpt of the whole of her, `across` to one, and it is
// drawn to her beam, so what stood at its deck edge stands at hers.
const SUPER = { scale: 59.37, z0: -13.27, across: +(process.env.ACROSS || 1) };
function superstructure() {
  const raw = readGlb(ASSET('musashi-super.glb'));
  const s = SUPER.scale;
  const nv = raw.pos.length / 3;
  // Starboard is -X in her frame.
  const X = (i) => -raw.pos[i * 3 + 2] * s * SUPER.across, Y = (i) => raw.pos[i * 3 + 1] * s;
  const Z = (i) => raw.pos[i * 3] * s + SUPER.z0;
  // Its deck: the lowest face looking up in every square metre of it, over its
  // starboard side clear of her centreline, fitted by least squares in how far
  // out and how far along, and fitted again without what stood off it.
  const cells = new Map();
  const T = Array.from(raw.idx);
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t], b = T[t + 1], c = T[t + 2];
    const ux = X(b) - X(a), uy = Y(b) - Y(a), uz = Z(b) - Z(a);
    const vx = X(c) - X(a), vy = Y(c) - Y(a), vz = Z(c) - Z(a);
    const ny = uz * vx - ux * vz;
    const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx;
    if (Math.abs(ny) < 0.95 * Math.hypot(nx, ny, nz)) continue;
    const cx = (X(a) + X(b) + X(c)) / 3, cy = (Y(a) + Y(b) + Y(c)) / 3, cz = (Z(a) + Z(b) + Z(c)) / 3;
    if (cx > -1.5 || cx < -18.5 || cy < -9 || cy > -5.5) continue;
    const k = `${Math.floor(cx)},${Math.floor(cz)}`;
    if (!cells.has(k) || cy < cells.get(k)[2]) cells.set(k, [cx, cz, cy]);
  }
  const basis = (x, z) => { const a = Math.abs(x), w = z / 50; return [1, a, a * a, w, w * w, w * w * w]; };
  let rows = [...cells.values()];
  let coef = null;
  for (let pass = 0; pass < 3; pass++) {
    const K = 6;
    const A = [...Array(K)].map(() => new Array(K).fill(0)), B = new Array(K).fill(0);
    for (const [x, z, y] of rows) {
      const r = basis(x, z);
      for (let i = 0; i < K; i++) { B[i] += r[i] * y; for (let j = 0; j < K; j++) A[i][j] += r[i] * r[j]; }
    }
    for (let i = 0; i < K; i++) {
      for (let k = i + 1; k < K; k++) {
        const f = A[k][i] / A[i][i];
        for (let j = i; j < K; j++) A[k][j] -= f * A[i][j];
        B[k] -= f * B[i];
      }
    }
    coef = new Array(K).fill(0);
    for (let i = K - 1; i >= 0; i--) {
      let r = B[i];
      for (let j = i + 1; j < K; j++) r -= A[i][j] * coef[j];
      coef[i] = r / A[i][i];
    }
    const fit = (x, z) => basis(x, z).reduce((acc, v, i) => acc + v * coef[i], 0);
    const res = rows.map(([x, z, y]) => y - fit(x, z));
    const rms = Math.sqrt(res.reduce((acc, v) => acc + v * v, 0) / res.length);
    console.log(`superstructure deck fit, pass ${pass}: ${rows.length} squares, rms ${(rms * 100).toFixed(1)} cm`);
    rows = rows.filter((r, i) => Math.abs(res[i]) < Math.max(0.12, 2 * rms));
  }
  const deckOf = (x, z) => basis(x, z).reduce((acc, v, i) => acc + v * coef[i], 0);
  // Both sides, each point shifted by its own deck's stand-off from hers.
  const P = [], N = [], TT = [];
  for (const sgn of [1, -1]) {
    const base = P.length / 3;
    for (let i = 0; i < nv; i++) {
      const x = X(i) * sgn, z = Z(i);
      P.push(x, Y(i) + deckAt(z) - deckOf(x, z), z);
      N.push(-raw.nrm[i * 3 + 2] * sgn, raw.nrm[i * 3 + 1], raw.nrm[i * 3]);
    }
    // Its starboard side is -X: each copy keeps the faces on its own side of
    // her centreline, the mirror with its winding turned, so it faces out.
    for (let t = 0; t < T.length; t += 3) {
      const cx = (X(T[t]) + X(T[t + 1]) + X(T[t + 2])) / 3;
      if (cx > 0) continue;
      if (sgn > 0) TT.push(base + T[t], base + T[t + 1], base + T[t + 2]);
      else TT.push(base + T[t], base + T[t + 2], base + T[t + 1]);
    }
  }
  // Her centreline: what the cut at it left on either side is put on it, so
  // the two halves meet.
  for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i]) < 0.02) P[i] = 0;
  return { P, N, T: TT, C: new Array(TT.length / 3).fill(GREY), deckOf };
}

// ---- her bridge tower, as the sculpt of it drew it -----------------------------------
// Facing -X, Y up, port at +Z; 20.5 m a unit, which puts the roof of her main
// battery director 30 m over her deck, where the superstructure sculpt's
// tower had it. Its director stands over the one the superstructure sculpt
// drew, on her centreline, and its foot a hand into her deck.
const BRIDGE = { scale: 20.5, x: -0.4656, z: -0.470, foot: -0.8255, at: 1.18, sink: 0.25 };
function bridge() {
  const raw = readGlb(ASSET('musashi-bridge.glb'));
  const s = BRIDGE.scale;
  const P = [], N = [];
  for (let i = 0; i < raw.pos.length; i += 3) {
    P.push((raw.pos[i + 2] - BRIDGE.z) * s, (raw.pos[i + 1] - BRIDGE.foot) * s + deckAt(BRIDGE.at) - BRIDGE.sink,
      -(raw.pos[i] - BRIDGE.x) * s + BRIDGE.at);
    N.push(raw.nrm[i + 2], raw.nrm[i + 1], -raw.nrm[i]);
  }
  const T = Array.from(raw.idx);
  return { P, N, T, C: new Array(T.length / 3).fill(GREY) };
}
const BRIDGE_TOP = deckAt(BRIDGE.at) - BRIDGE.sink + (-0.35 - BRIDGE.foot) * BRIDGE.scale;

/** Append `b` to `a`. */
function append(a, b) {
  const base = a.P.length / 3;
  for (let i = 0; i < b.P.length; i++) { a.P.push(b.P[i]); a.N.push(b.N[i]); }
  for (let i = 0; i < b.T.length; i++) a.T.push(b.T[i] + base);
  for (let i = 0; i < b.C.length; i++) a.C.push(b.C[i]);
}

/** The middle of triangle `t`. */
const middle = (mesh, t) => {
  const { P, T } = mesh;
  const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
  return [(P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3];
};

// ---- take her superstructure off her ----------------------------------------------------
// Cut off a hand over her deck, and what that leaves pressed down on to it.
{
  const boxes = [
    { name: 'island', x0: -30, x1: 30, z0: ISLAND.z0, z1: 6, y0: deckAt(0) + 0.2, y1: 80 },
    { name: 'island fwd', x0: -30, x1: 30, z0: 6, z1: ISLAND.z1, y0: deckAt(6) + 0.2, y1: 80 },
    { name: 'abreast No.1/2 port', x0: SIDES.x, x1: 30, z0: ISLAND.z1, z1: SIDES.z1, y0: deckAt(ISLAND.z1) + 0.2, y1: 80 },
    { name: 'abreast No.1/2 stbd', x0: -30, x1: -SIDES.x, z0: ISLAND.z1, z1: SIDES.z1, y0: deckAt(ISLAND.z1) + 0.2, y1: 80 },
    { name: 'abreast No.3 port', x0: SIDES.x, x1: 30, z0: SIDES.z0, z1: ISLAND.z0, y0: deckAt(0) + 0.2, y1: 80 },
    { name: 'abreast No.3 stbd', x0: -30, x1: -SIDES.x, z0: SIDES.z0, z1: ISLAND.z0, y0: deckAt(0) + 0.2, y1: 80 },
  ];
  for (const b of boxes) {
    const r = boxCut(m, b, { rescue: true });
    console.log(`cut ${b.name}: ${r.cut} triangles, caps ${r.caps.filter((n) => n).join('/') || 'none'}`);
    let n = 0;
    for (let i = 0; i < m.P.length; i += 3) {
      const x = m.P[i], y = m.P[i + 1], z = m.P[i + 2];
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || y > b.y0 + 1e-4 || y < deckAt(z) - 0.05) continue;
      m.P[i + 1] = deckAt(z);
      n++;
    }
    console.log(`${b.name}: ${n} points pressed down on to her deck`);
  }
}

// ---- the wires she was rigged with --------------------------------------------------
// Her aerials, from her jackstaff up to her tower and from her mainmast down to
// her crane, ran to masts that are no longer there. Not her crane, whose jib
// is a lattice of wire-thin members.
// The one from her mainmast to her crane is made one with the crane's jib, so
// it is taken off along its own line -- two wires, spreading from her crane to
// four and a half metres either side at her mainmast -- from where her
// superstructure was cut off, 32.6 m up, down to the head of her crane.
const AFT_AERIAL = { a: [-54.5, 32.6], b: [-118.0, 21.8], r: 0.9, x: 5.5 };
{
  const rigging = wires(m, { only: (x, y, z) => z > -118 && y > 16 });
  const { a, b, r } = AFT_AERIAL;
  for (let t = 0; t < m.T.length / 3; t++) {
    const [x, y, z] = middle(m, t);
    if (z > a[0] || z < b[0] || Math.abs(x) > AFT_AERIAL.x) continue;
    const f = (z - a[0]) / (b[0] - a[0]);
    if (Math.abs(y - (a[1] + (b[1] - a[1]) * f)) < r) rigging[t] = 1;
  }
  const n = rigging.reduce((s, v) => s + v, 0);
  const kept = subMesh(m, (t) => !rigging[t]);
  Object.assign(m, kept);
  console.log(`her rigging: ${n} faces taken off her`);
}

// ---- and stand hers in its place ------------------------------------------------------
{
  const sup = superstructure();
  const keep = (t) => {
    const [x, y, z] = middle(sup, t);
    if (y < deckAt(z) + 0.12) return false;
    const island = z > ISLAND.z0 && z < ISLAND.z1;
    const side = z > SIDES.z0 && z < SIDES.z1 && Math.abs(x) > SIDES.x;
    if (!island && !side) return false;
    // Its own tower, where hers stands.
    if (Math.abs(x) < 9.5 && z > -7.5 && z < 8.5 && y > BRIDGE_TOP) return false;
    return true;
  };
  const onDeck = subMesh(sup, keep);
  // Its rigging, which ran to the tower that is no longer there, and which a
  // sculpt fuses into tubes (see wires).
  // Not her mainmast, a pole whose sides the decimator left as slivers, nor the
  // derricks on it.
  const MAINMAST = { x: 4, z0: -38, z1: -26 };
  const rigging = wires(onDeck, {
    r: 0.35, minLen: 2.5, air: 1.8, loose: true, ground: (x, z) => deckAt(z),
    only: (x, y, z) => !(Math.abs(x) < MAINMAST.x && z > MAINMAST.z0 && z < MAINMAST.z1),
  });
  // And what that leaves hanging in the air: every scrap of it, off anything
  // else, that stands clear of her deck.
  const unrigged = subMesh(onDeck, (t) => !rigging[t]);
  const scraps = new Uint8Array(unrigged.T.length / 3);
  let nScraps = 0;
  for (const c of components(unrigged)) {
    const diag = Math.hypot(c.hi[0] - c.lo[0], c.hi[1] - c.lo[1], c.hi[2] - c.lo[2]);
    if (c.tris.length > 80 || diag > 6 || c.lo[1] < deckAt((c.lo[2] + c.hi[2]) / 2) + 3) continue;
    for (const t of c.tris) scraps[t] = 1;
    nScraps++;
  }
  const kept = subMesh(unrigged, (t) => !scraps[t]);
  console.log(`superstructure: ${rigging.reduce((s, v) => s + v, 0)} faces of rigging taken off it, `
    + `and ${nScraps} scraps of it left in the air`);
  // Its feet a hand into her deck.
  for (let i = 0; i < kept.P.length; i += 3) {
    const d = deckAt(kept.P[i + 2]);
    if (kept.P[i + 1] < d + 0.3) kept.P[i + 1] = d - 0.3;
  }
  console.log(`superstructure: ${kept.T.length / 3} triangles on her deck`);
  if (process.env.PARTS) {
    for (const c of components(kept).slice(0, +process.env.PARTS)) {
      console.log('  part', c.tris.length, c.lo.map((v) => v.toFixed(1)).join(','), '..', c.hi.map((v) => v.toFixed(1)).join(','));
    }
  }
  append(m, kept);
  const br = bridge();
  console.log(`bridge: ${br.T.length / 3} triangles, its foot at ${(deckAt(BRIDGE.at) - BRIDGE.sink).toFixed(2)}, `
    + `its base's roof at ${BRIDGE_TOP.toFixed(2)}`);
  append(m, br);
}

// ---- her main battery ------------------------------------------------------------
// Nine 46 cm/45 in three triples: No.1 on her forecastle, No.2 superfiring over
// it, and No.3 on her quarterdeck facing astern. `z` is the pivot, the middle
// of the barbette the sculpt drew each gunhouse on, and `s` which way it
// faces; every other length is along the turret's own axis from the pivot,
// positive towards its muzzles. `floor` is the top of that barbette: the
// gunhouse is cut off there, and what is under it is ship. The house is cut
// out of her up to `cut`; the piece that trains is lifted out of the finer
// decimation up to `top`, which for No.1 is under No.2's barrels where they
// lie over its roof.
export const TURRETS = [
  { name: 'No.1', x: 0, z: 53.9, s: 1, floor: 7.0, seat: 7.0, face: 6.95,
    house: { along: [-10.6, 7.0], across: [-7.8, 7.8], top: 10.95, cut: 12.4 },
    barrels: { along: 18.85, y: [7.9, 9.7] } },
  { name: 'No.2', x: 0, z: 30.75, s: 1, floor: 9.7, seat: 9.7, face: 7.65,
    house: { along: [-10.4, 7.7], across: [-7.8, 7.8], top: 14.8, cut: 14.8 },
    barrels: { along: 18.75, y: [10.5, 12.3] } },
  { name: 'No.3', x: 0, z: -64.25, s: -1, floor: 8.9, seat: 8.9, face: 8.35,
    house: { along: [-9.6, 8.4], across: [-7.8, 7.8], top: 14.9, cut: 14.9 },
    barrels: { along: 19.0, y: [9.5, 11.2] } },
];
const BARREL_HALF = 3.95;
const alongZ = (t, a) => t.z + t.s * a;
function turretBoxes(t, top) {
  const { along, across } = t.house;
  const za = alongZ(t, along[0]), zb = alongZ(t, along[1]);
  const ba = alongZ(t, along[1] - 0.01 * t.s), bb = alongZ(t, t.barrels.along + 0.3);
  return [
    { name: `${t.name} house`, x0: t.x + across[0], x1: t.x + across[1], y0: t.floor, y1: top,
      z0: Math.min(za, zb), z1: Math.max(za, zb) },
    { name: `${t.name} barrels`, x0: t.x - BARREL_HALF, x1: t.x + BARREL_HALF, y0: t.barrels.y[0], y1: t.barrels.y[1],
      z0: Math.min(ba, bb), z1: Math.max(ba, bb) },
  ];
}

// ---- her 15.5 cm ------------------------------------------------------------------
// Four 15.5 cm/60 triples: one on her centreline forward of her tower over
// No.2, one on her centreline at the after end of her superstructure over
// No.3, and one either side of her between her tower and her funnel -- the
// wing turrets. The superstructure sculpt is Musashi after her 1944 refit,
// when the wing turrets were landed: the barbette each stood on is still
// there, on the deckhouse that runs out to her deck edge abaft her tower, with
// a 25 mm tub on it where the turret had been, a searchlight post beside the
// tub and a shielded 25 mm at the deck edge outboard of it. Those come off --
// everything over the top of the barbette within the turret's swing, and the
// pod at the deck edge down to her deck -- and the turret stands on the
// barbette again, the same either side. The centreline pair are the
// superstructure sculpt's own, cut off at the top of the barbette each stands
// on. The mounting that goes on every one of the four is the owner's own
// sculpt of the turret; `seat` is the top of the barbette it trains on.
const WING = { x: 14.4, z: -2.0, seat: 10.65 };
const wingCuts = (sgn) => {
  const span = (a, b) => (sgn > 0 ? [a, b] : [-b, -a]);
  return [
    // Over the barbette, as far as the gunhouse swings.
    { x: span(9.1, 19.7), z: [-7.3, 3.3], y: [WING.seat + 0.1, 30] },
    // The pod at her deck edge outboard of it, down to her deck.
    { x: span(17.2, 21.3), z: [-5.1, -0.3], y: [7.92, WING.seat + 0.1], deck: 7.72 },
  ];
};
export const SECONDARY = [
  { name: '15.5 fore', x: 0, z: 14.6, rest: 0, seat: 12.35, cuts: [{ x: [-3.9, 3.9], z: [11.05, 22.0], y: [12.35, 17.6] }] },
  { name: '15.5 aft', x: 0, z: -50.0, rest: Math.PI, seat: 12.4, cuts: [{ x: [-4.3, 4.3], z: [-55.7, -44.9], y: [12.4, 16.2] }] },
  { name: '15.5 wing stbd', x: -WING.x, z: WING.z, rest: 0, seat: WING.seat, cuts: wingCuts(-1) },
  { name: '15.5 wing port', x: WING.x, z: WING.z, rest: 0, seat: WING.seat, cuts: wingCuts(1) },
];

// ---- her 12.7 cm ------------------------------------------------------------------
// Six 12.7 cm/40 Type 89 twins in their shields, three a side abreast her
// funnel, the middle pair a deck higher than the others: the superstructure
// sculpt drew each as a melted dome on its own column. The dome is cut off the
// column, which is what the owner's sculpt of the mount stands on.
export const DP = [
  { name: '12.7 fwd', x: 8.23, z: -9.41, seat: 11.4, x0: 4.9, x1: 12.2, top: 17.0 },
  { name: '12.7 mid', x: 8.10, z: -18.40, seat: 12.6, x0: 4.8, x1: 12.0, top: 17.2 },
  { name: '12.7 aft', x: 8.58, z: -28.97, seat: 11.35, x0: 5.1, x1: 12.3, top: 16.9 },
].flatMap((d) => [-1, 1].map((sgn) => ({
  name: `${d.name} ${sgn > 0 ? 'port' : 'stbd'}`, x: sgn * d.x, z: d.z, seat: d.seat, rest: sgn * Math.PI / 2,
  cut: { x: sgn > 0 ? [d.x0, d.x1] : [-d.x1, -d.x0], z: [d.z - 3.4, d.z + 3.4], y: [d.seat, d.top] },
})));

// ---- her 25 mm ------------------------------------------------------------------
// Triple 25 mm Type 96. Round her superstructure and the four at her stern,
// two a side, in the shields the owner sculpted (`pod`); the rest -- on her
// forecastle, abreast No.3 and on her quarterdeck -- open, on their pedestals.
// Every one stands where a sculpt drew one, which is cut away down to the deck
// it stood on (`deck`); the cut runs a hand over it.
const LIGHT0 = [
  { name: 'pod abreast 15.5 fore', x: 11.73, z: 17.62, deck: 6.85, pod: true, r: 2.5 },
  { name: 'pod abreast tower', x: 13.16, z: 9.48, deck: 7.6, pod: true, r: 2.6 },
  { name: 'pod deck edge', x: 18.39, z: -22.40, deck: 7.72, pod: true, r: 2.5 },
  { name: 'pod 01 fwd', x: 12.63, z: -24.59, deck: 10.45, pod: true, r: 2.2 },
  { name: 'pod 01 mid', x: 14.27, z: -31.20, deck: 10.35, pod: true, r: 2.7 },
  { name: 'pod 01 aft', x: 9.70, z: -35.28, deck: 10.15, pod: true, r: 2.3 },
  { name: 'pod abreast mainmast', x: 12.05, z: -41.17, deck: 7.72, pod: true, r: 2.4 },
  { name: 'pod deck edge aft', x: 18.81, z: -44.35, deck: 7.72, pod: true, r: 2.6 },
  { name: 'pod abreast 15.5 aft', x: 12.67, z: -49.56, deck: 7.72, pod: true, r: 2.4 },
  { name: 'open abreast No.3', x: 13.16, z: -62.09, deck: 7.72, r: 2.4 },
  { name: 'open quarterdeck', x: 15.0, z: -89.6, deck: 7.65, r: 2.2 },
  { name: 'pod stern fwd', x: 16.45, z: -95.26, deck: 7.6, pod: true, r: 2.5 },
  { name: 'pod stern aft', x: 14.25, z: -100.09, deck: 7.6, pod: true, r: 2.2 },
  { name: 'open forecastle', x: 8.0, z: 65.3, deck: 6.45, r: 1.6 },
  { name: 'open abreast No.2', x: 8.1, z: 42.3, deck: 6.15, r: 1.5 },
];
export const LIGHT = LIGHT0.flatMap((l) => [-1, 1].map((sgn) => ({
  ...l, name: `${l.name} ${sgn > 0 ? 'port' : 'stbd'}`, x: sgn * l.x,
})));

// ---- her aircraft deck -----------------------------------------------------------
// Right aft the sculpt melted everything on her aircraft deck into one -- her
// two catapults, her boats, the bulwarks and the rails -- and it is cut away
// down to the deck, all but her crane, the coaming of her hangar hatch and
// her ensign staff: musashi.js stands two catapults there that train. And
// forward of the step, outboard, the forward ends of the catapults' girders.
const AIRCRAFT_DECK = [
  { name: 'aircraft deck stbd', x: [-19, -3.8], z: [-132, -110.6], y: [5.45, 16], deck: 5.3 },
  { name: 'aircraft deck port', x: [3.8, 19], z: [-132, -110.6], y: [5.45, 16], deck: 5.3 },
  { name: 'aircraft deck aft', x: [-3.8, 3.8], z: [-130.6, -124.3], y: [5.45, 16], deck: 5.3 },
  { name: 'aircraft deck abaft hatch', x: [-3.8, 3.8], z: [-120.3, -116.2], y: [5.45, 16], deck: 5.3 },
  { name: 'girders stbd', x: [-19, -4.6], z: [-109.6, -96.8], y: [7.8, 16], deck: 7.65 },
  { name: 'girders port', x: [4.6, 19], z: [-109.6, -96.8], y: [7.8, 16], deck: 7.65 },
];

// ---- her screws -----------------------------------------------------------------
// Four shafts, the outer pair ending forward of the inner. The sculpt melted
// the screw on the end of each into a lump; it is cut off, and musashi.js
// draws a screw there that turns.
export const SCREWS = [
  { x: 4.0, y: -8.6, z: -110.2, r: 2.5 },
  { x: -4.0, y: -8.6, z: -110.2, r: 2.5 },
  { x: 9.0, y: -8.4, z: -100.2, r: 2.5 },
  { x: -9.0, y: -8.4, z: -100.2, r: 2.5 },
];
const SCREW_BOXES = SCREWS.map((s) => ({ name: `screw ${s.x}`, x0: s.x - 2.8, x1: s.x + 2.8, y0: s.y - 2.8, y1: s.y + 2.5,
  z0: s.z - 0.9, z1: s.z + 0.9 }));

// Every cut, as boxes: `deck` is what the stump the cut leaves is pressed down
// on to.
const CUT_BOXES = [
  ...SCREW_BOXES,
  ...AIRCRAFT_DECK.map((e) => ({ name: e.name, x0: e.x[0], x1: e.x[1], z0: e.z[0], z1: e.z[1],
    y0: e.y[0], y1: e.y[1], deck: e.deck })),
  ...SECONDARY.flatMap((e) => e.cuts.map((c, k) => ({ name: `${e.name}${k ? ` ${k}` : ''}`, x0: c.x[0], x1: c.x[1],
    z0: c.z[0], z1: c.z[1], y0: c.y[0], y1: c.y[1], deck: c.deck }))),
  ...DP.map((e) => ({ name: e.name, x0: e.cut.x[0], x1: e.cut.x[1], z0: e.cut.z[0], z1: e.cut.z[1],
    y0: e.cut.y[0], y1: e.cut.y[1] })),
  ...LIGHT.map((l) => ({ name: l.name, x0: l.x - l.r, x1: l.x + l.r, z0: l.z - l.r, z1: l.z + l.r,
    y0: l.deck + 0.15, y1: l.deck + 4.2, deck: l.deck })),
];
const hullBoxes = (t) => turretBoxes(t, t.house.cut);

if (process.env.CHECK) {
  const { P, T } = m;
  const check = (b) => {
    const out = {};
    const walls = [['x0', 0, b.x0, 2, [b.z0, b.z1]], ['x1', 0, b.x1, 2, [b.z0, b.z1]],
      ['z0', 2, b.z0, 0, [b.x0, b.x1]], ['z1', 2, b.z1, 0, [b.x0, b.x1]], ['y1', 1, b.y1, 0, [b.x0, b.x1]]];
    for (const [nm, ax, val, other, [o0, o1]] of walls) {
      let len = 0;
      for (let t = 0; t < T.length; t += 3) {
        const v = [T[t], T[t + 1], T[t + 2]].map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
        const d = v.map((p) => p[ax] - val);
        if ((d[0] > 0 && d[1] > 0 && d[2] > 0) || (d[0] < 0 && d[1] < 0 && d[2] < 0)) continue;
        const pts = [];
        for (let k = 0; k < 3; k++) {
          const p = v[k], q = v[(k + 1) % 3], dp = d[k], dq = d[(k + 1) % 3];
          if ((dp < 0) !== (dq < 0)) { const s = dp / (dp - dq); pts.push([0, 1, 2].map((j) => p[j] + (q[j] - p[j]) * s)); }
        }
        if (pts.length < 2) continue;
        const [a, c] = pts;
        const third = ax === 1 ? 2 : 1;
        const lim = ax === 1 ? [b.z0, b.z1] : [b.y0, b.y1];
        const inside = (p) => p[other] >= o0 && p[other] <= o1 && p[third] >= lim[0] && p[third] <= lim[1];
        if (inside(a) || inside(c)) len += Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
      }
      out[nm] = +len.toFixed(1);
    }
    return out;
  };
  for (const b of [...CUT_BOXES, ...TURRETS.flatMap(hullBoxes)]) {
    if (process.env.CHECK !== '1' && !b.name.includes(process.env.CHECK)) continue;
    console.log(b.name.padEnd(30), JSON.stringify(check(b)));
  }
  process.exit(0);
}

// ---- cut every gun out of her ---------------------------------------------------
{
  for (const b of [...CUT_BOXES, ...TURRETS.flatMap(hullBoxes)]) {
    const r = boxCut(m, b, { rescue: true });
    if (process.env.VERBOSE) console.log(`cut ${b.name}: ${r.cut} triangles, caps ${r.caps.filter((n) => n).join('/') || 'none'}`);
  }
  for (const b of CUT_BOXES.filter((k) => k.deck !== undefined)) {
    let n = 0;
    for (let i = 0; i < m.P.length; i += 3) {
      const x = m.P[i], y = m.P[i + 1], z = m.P[i + 2];
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || y < b.deck - 0.05 || y > b.y0 + 1e-4) continue;
      m.P[i + 1] = b.deck;
      n++;
    }
    if (process.env.VERBOSE) console.log(`${b.name}: ${n} points pressed down on to the deck at ${b.deck}`);
  }
  console.log(`cut: ${CUT_BOXES.length} mountings and ${TURRETS.length} turrets out of her`);
}
recomputeNormals(m);
dropLoose(m);
console.log(`faces facing in: ${turnInward(m)} turned`);
// What the cuts and the rigging left hanging in the air -- a block or a stub
// of wire with nothing under it, well clear of her deck -- goes.
{
  const drop = new Uint8Array(m.T.length / 3);
  let n = 0;
  for (const c of components(m)) {
    const diag = Math.hypot(c.hi[0] - c.lo[0], c.hi[1] - c.lo[1], c.hi[2] - c.lo[2]);
    const mid = (c.lo[2] + c.hi[2]) / 2;
    if (c.tris.length > 400 || diag > 9 || c.lo[1] < deckAt(mid) + 5) continue;
    for (const t of c.tris) drop[t] = 1;
    n++;
  }
  Object.assign(m, subMesh(m, (t) => !drop[t]));
  console.log(`scraps: ${n} pieces left in the air taken off her`);
}

// ---- her deck edge ----------------------------------------------------------------
// The sculpt of the whole of her drew her guard rails and their stanchions
// along her deck edge, and they melted: what is left of them is a row of teeth
// and broken loops standing on her gunwale. Forward and abaft her
// superstructure -- where her deck edge is that sculpt's, and not the
// superstructure sculpt's, whose rails are whole -- whatever stands on her deck
// within a metre and a half of her side is pressed down into it.
{
  const { P } = m;
  const half = new Map();
  for (let i = 0; i < P.length; i += 3) {
    const y = P[i + 1], z = P[i + 2];
    const d = deckAt(z);
    if (y < d - 1.5 || y > d - 0.2) continue;
    const k = Math.round(z);
    half.set(k, Math.max(half.get(k) || 0, Math.abs(P[i])));
  }
  const inHull = (z) => (z > ISLAND.z1 && z < 108) || (z > -109.6 && z < ISLAND.z0);
  // Her gunwale, a metre at a time: the top of her side and her deck at it.
  const edge = new Map();
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    const k = Math.round(z), hb = half.get(k), d = deckAt(z);
    if (!hb || Math.abs(x) < hb - 1.5 || y < d - 1.0 || y > d + 0.12) continue;
    edge.set(k, Math.max(edge.get(k) ?? -99, y));
  }
  // Only what is all rail: a point every face round which is thin (see
  // thinFaces), so her plating is never moved.
  const railFace = thinFaces(m, 0.3);
  const plate = new Uint8Array(P.length / 3);
  for (let t = 0; t < m.T.length / 3; t++) {
    if (railFace[t]) continue;
    for (let j = 0; j < 3; j++) plate[m.T[t * 3 + j]] = 1;
  }
  let n = 0;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    if (!inHull(z) || plate[i / 3]) continue;
    const d = deckAt(z), hb = half.get(Math.round(z));
    if (!hb || Math.abs(x) < hb - 1.5 || y < d + 0.12 || y > d + 2.4) continue;
    P[i + 1] = edge.get(Math.round(z)) ?? d;
    n++;
  }
  // And the stumps of her stanchions, which the decimator left as solid
  // little spikes on her gunwale: her gunwale is the median of the tops of
  // her side, a metre at a time over thirteen metres of her, and nothing out
  // at her side stands over it.
  const tops = new Map();
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    const k = Math.round(z), hb = half.get(k);
    if (!hb || Math.abs(x) < hb - 1.0 || y > deckAt(z) + 2.5) continue;
    tops.set(k, Math.max(tops.get(k) ?? -99, y));
  }
  const gunwale = (k) => {
    const v = [];
    for (let d = -6; d <= 6; d++) if (tops.has(k + d)) v.push(tops.get(k + d));
    v.sort((p, q) => p - q);
    return v.length ? v[v.length >> 1] : undefined;
  };
  let spikes = 0;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    if (!inHull(z)) continue;
    const k = Math.round(z), hb = half.get(k), gw = gunwale(k);
    if (!hb || gw === undefined || Math.abs(x) < hb - 1.0 || y < gw + 0.15 || y > deckAt(z) + 2.5) continue;
    P[i + 1] = gw;
    spikes++;
  }
  console.log(`deck edge: ${n} points of melted rail pressed down into it, ${spikes} points of stanchion stumps taken down`);
}

// ---- the flaps on her upperworks, and the dents in her flats -----------------------
const FLAPS = process.env.NOSMOOTH ? new Uint8Array(m.T.length / 3) : flaps(m, {
  only: (x, y, z) => y > 6.0 && y < 45 && z > -118,
});
{
  const n = FLAPS.reduce((s, v) => s + v, 0);
  Object.assign(m, subMesh(m, (t) => !FLAPS[t]));
  console.log(`flaps: ${n} faces of torn plate taken off her upperworks`);
}
dropLoose(m);
const thin = thinFaces(m, 0.5);
if (!process.env.NOSMOOTH) {
  const up = denoise(m, weld(m), {
    sigmaS: 1.0, sigmaR: 0.33, normalIters: 10, vertexIters: 25, max: 0.35,
    only: (x, y, z, t) => y > DECK_Y + 0.6 && !thin[t],
  });
  console.log(`upperworks denoised: ${up.points} points, ${(up.movedMean * 100).toFixed(1)} cm on average`);
  recomputeNormals(m);
  const d = denoise(m, weld(m), {
    sigmaS: 0.6, sigmaR: 0.35, normalIters: 6, vertexIters: 15, max: 0.2, only: (x, y, z, t) => !thin[t],
  });
  console.log(`denoised: ${d.points} points, ${(d.movedMean * 100).toFixed(1)} cm on average`);
  recomputeNormals(m);
}

// ---- her decks -------------------------------------------------------------------
// Her weather deck is holystoned teak from stem to stern; her superstructure
// decks, her platforms and her turret roofs are steel, the dark of a deck that
// is walked on. Whatever faces the sky at her deck is teak; whatever faces it
// higher up is steel; and an island of one in the other smaller than a square
// metre takes the paint round it.
{
  const { P, T, C } = m;
  const nf = T.length / 3;
  let teak = 0, steel = 0;
  for (let t = 0; t < nf; t++) {
    if (C[t] !== GREY) continue;
    const [nx, ny, nz] = faceNormal(m, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
    if (ny < 0.8 * Math.hypot(nx, ny, nz)) continue;
    const [, cy, cz] = middle(m, t);
    if (cy < DECK_FLOOR) continue;
    if (Math.abs(cy - deckAt(cz)) < 0.45 || (cz > 40 && cy < 11.5)) { C[t] = DECK; teak++; } else { C[t] = STEEL; steel++; }
  }
  console.log(`decks: ${teak} faces of teak, ${steel} of steel`);
}

// ---- fair her sides, and split her normals at her creases ------------------------
const FAIR = {
  passes: 24, lambda: 0.5, mu: -0.53, max: 0.3, foot: -4.0, midbody: 0.8,
  planZ: [-125, 125, 5], planY: [-10, 7, 1],
};
let canon = weld(m);
const st = stations(m, { length: REAL_LOA, beamCap: 7.4, edgeCap: 11.5, slice: true, beamFloor: 0 });
if (!process.env.NOFAIR) fair(m, canon, st, FAIR);
recomputeNormals(m);
canon = weld(m);
const plating = hardEdges(m, canon, st, {
  crease: 44 * Math.PI / 180, plateTilt: 35 * Math.PI / 180, foot: FAIR.foot, smooth: thin,
});
shadePlating(m, plating, { along: 3.0, up: 0.5 });

if (process.env.DUMP) {
  const { writeGlb } = await import('./sculpt-source.mjs');
  const paintOf = new Float32Array(m.P.length / 3);
  for (let t = 0; t < m.T.length / 3; t++) for (let j = 0; j < 3; j++) paintOf[m.T[t * 3 + j]] = m.C[t];
  writeGlb(process.env.DUMP, { P: m.P, N: m.N, T: m.T, paint: paintOf }, 'dump');
}
if (process.env.STAGE === 'hull') process.exit(0);

// ---- her surface, as a height map --------------------------------------------------
const HM = { x0: -21, z0: -132, step: 0.5, nx: 85, nz: 529 };
const hm = heightmap(m, HM);

// ---- paint -----------------------------------------------------------------------------
// Kure grey, teak, the steel of her upper decks, her boot topping and red lead.
const PALETTE = [
  [0x6a, 0x72, 0x7c],
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
/** Its roof and every flat of it steel deck, the rest grey. */
function roofed(mesh, over) {
  mesh.C = [];
  for (let t = 0; t < mesh.T.length / 3; t++) {
    const [nx, ny, nz] = faceNormal(mesh, mesh.T[t * 3], mesh.T[t * 3 + 1], mesh.T[t * 3 + 2]);
    let cy = 0;
    for (let j = 0; j < 3; j++) cy += mesh.P[mesh.T[t * 3 + j] * 3 + 1] / 3;
    mesh.C.push(ny > 0.85 * Math.hypot(nx, ny, nz) && cy > over ? STEEL : GREY);
  }
  return mesh;
}

// ---- her turrets ----------------------------------------------------------------------
const tm = load(ASSET('musashi-turrets.glb'));
fixWinding(tm);
const turretParts = [];
for (const t of TURRETS) {
  const toLocal = (x, z) => [t.s * (x - t.x), t.s * (z - t.z)];
  const boxes = turretBoxes(t, t.house.top);
  const piece = clone(tm);
  boxCut(piece, boxes[0], { keep: 'inside' });
  const house0 = compact(piece);
  for (let i = 0; i < house0.P.length; i += 3) {
    const [x, z] = toLocal(house0.P[i], house0.P[i + 2]);
    house0.P[i] = x; house0.P[i + 2] = z;
    house0.N[i] *= t.s; house0.N[i + 2] *= t.s;
  }
  const pts = [];
  for (let i = 0; i < tm.P.length; i += 3) {
    const [x, z] = toLocal(tm.P[i], tm.P[i + 2]);
    const y = tm.P[i + 1];
    if (z < t.face + 0.6 || z > t.barrels.along || Math.abs(x) > BARREL_HALF || y < t.barrels.y[0] || y > t.barrels.y[1]) continue;
    pts.push([z, x, y]);
  }
  const bar = barrelsOf(pts, 3, t.face, t.barrels.along, { rMin: 0.2, rMax: 0.75, bin: 0.4 });
  const { house: stripped, holes } = strippedHouse(house0, bar, t.face, t.floor + 0.02, { ahead: 0.3, axisR: 0.75 });
  const house = stripped;
  if (!process.env.NOSMOOTH) {
    recomputeNormals(house);
    const thinH = thinFaces(house, 0.4);
    denoise(house, weld(house), {
      sigmaS: 0.45, sigmaR: 0.35, normalIters: 6, vertexIters: 15, max: 0.12, only: (x, y, z, q) => !thinH[q],
    });
  }
  roofed(house, t.floor + 1.5);
  creased(house, 40);
  for (let i = 1; i < house.P.length; i += 3) house.P[i] = (house.P[i] < t.floor + 0.01 ? t.seat : house.P[i]) - t.seat;
  let roof = 0;
  for (let i = 1; i < house.P.length; i += 3) roof = Math.max(roof, house.P[i]);
  const trunnion = [0, bar.yAt(t.face - 1.2) - t.seat, t.face - 1.2];
  const reach = bar.reachFrom(t.face - 1.2);
  const guns = turnedBarrels({ ...bar, yAt: (a) => bar.yAt(a) - t.seat }, trunnion, reach, 18);
  const muzzles = bar.xs.map((x) => [+x.toFixed(3), 0, +reach.toFixed(3)]);
  console.log(`${t.name}: gunhouse ${house.T.length / 3} triangles (${holes} holes closed), roof ${roof.toFixed(2)} m up; barrels at `
    + `${bar.xs.map((x) => x.toFixed(2)).join('/')}, ${reach.toFixed(2)} m trunnion to muzzle, stowed at `
    + `${(bar.pitch * 180 / Math.PI).toFixed(1)} degrees`);
  turretParts.push({
    name: t.name, x: t.x, z: t.z, rest: t.s > 0 ? 0 : Math.PI, seat: t.seat, roof: +roof.toFixed(3),
    trunnion: trunnion.map((v) => +v.toFixed(3)), muzzles, pitch: +bar.pitch.toFixed(4), house, guns,
  });
}

// ---- her guns, as the owner sculpted them ------------------------------------------
// Each is put in the frame of its mounting: the pivot at the origin, the foot
// of what trains at y = 0, the bore along +z. Its own barrels are lifted off
// it and go on the cradle, about trunnions a little inside the face; what is
// left -- the gunhouse, the shield, the pod -- trains.
//
//   file      the decimated sculpt (see build/musashi-source.mjs)
//   scale     metres a unit of the sculpt
//   pivot     [x, z] of the pivot, in the sculpt
//   facing    the sculpt's own direction its barrels point: '-x' or '-z'
//   foot      the sculpt's y of the foot: everything under it is dropped
//   face      how far ahead of the pivot the barrels come out (sculpt units)
//   lanes     where across each barrel runs; barrelY their height; r how
//             far out from its axis a barrel's skin is
function gunPiece(file, { scale, pivot, facing, foot, face, lanes = [], barrelY = 0, r = 0, trunnionIn = 0.08 }) {
  const raw = readGlb(ASSET(file));
  const P = [], N = [];
  const toLocal = (x, y, z) => (facing === '-x'
    ? [(z - pivot[1]) * scale, (y - foot) * scale, -(x - pivot[0]) * scale]
    : [-(x - pivot[0]) * scale, (y - foot) * scale, -(z - pivot[1]) * scale]);
  for (let i = 0; i < raw.pos.length; i += 3) {
    P.push(...toLocal(raw.pos[i], raw.pos[i + 1], raw.pos[i + 2]));
    const n = facing === '-x' ? [raw.nrm[i + 2], raw.nrm[i + 1], -raw.nrm[i]] : [-raw.nrm[i], raw.nrm[i + 1], -raw.nrm[i + 2]];
    N.push(...n);
  }
  const mesh = { P, N, T: Array.from(raw.idx) };
  fixWinding(mesh);
  const faceZ = face * scale, yB = (barrelY - foot) * scale, rB = r * scale;
  const isBarrel = (t) => {
    if (!lanes.length) return false;
    const [x, y, z] = middle(mesh, t);
    return z > faceZ && lanes.some((l) => Math.hypot(x - l * scale, y - yB) < rB);
  };
  const above = (t) => {
    for (let j = 0; j < 3; j++) if (mesh.P[mesh.T[t * 3 + j] * 3 + 1] < -1e-3) return false;
    return true;
  };
  const house = roofed(subMesh(mesh, (t) => above(t) && !isBarrel(t)), 99);
  dropLoose(house, { maxArea: 0.05 * scale * scale, maxDiag: 0.15 * scale });
  creased(house, 40);
  const tz = faceZ - trunnionIn * scale;
  const guns = subMesh(mesh, (t) => isBarrel(t));
  for (let i = 0; i < guns.P.length; i += 3) { guns.P[i + 1] -= yB; guns.P[i + 2] -= tz; }
  if (guns.T.length) creased(guns, 40);
  let tip = 0;
  for (let i = 2; i < guns.P.length; i += 3) tip = Math.max(tip, guns.P[i]);
  let roof = 0;
  for (let i = 1; i < house.P.length; i += 3) roof = Math.max(roof, house.P[i]);
  const muzzles = lanes.map((l) => [+(l * scale).toFixed(3), 0, +tip.toFixed(3)]);
  console.log(`${file}: house ${house.T.length / 3} triangles, roof ${roof.toFixed(2)} m; barrels ${guns.T.length / 3} `
    + `triangles, trunnion ${yB.toFixed(2)} m up and ${tz.toFixed(2)} m ahead, ${tip.toFixed(2)} m to the muzzle`);
  return {
    house, guns, trunnion: [0, +yB.toFixed(3), +tz.toFixed(3)], muzzles, roof: +roof.toFixed(3),
  };
}
// The 15.5 cm triple: a unit of the sculpt is 7.2 m, which draws her gunhouse
// as wide as the ones the superstructure sculpt has; it trains on the barbette
// under its skirt, which is dropped (her own barbettes are the ship's).
const SEC6 = gunPiece('musashi-155.glb', {
  scale: 7.2, pivot: [0.255, 0], facing: '-x', foot: -0.27, face: 0.42, lanes: [-0.2, 0, 0.2],
  barrelY: -0.043, r: 0.045, trunnionIn: 0.12,
});
// The 12.7 cm twin in its shield: 4.2 m a unit, as large as the domes the
// superstructure sculpt drew; the deck it was sculpted on is dropped.
const SEC5 = gunPiece('musashi-127.glb', {
  scale: 4.2, pivot: [0.02, 0], facing: '-x', foot: -0.19, face: 0.57, lanes: [-0.08, 0.08],
  barrelY: -0.099, r: 0.05, trunnionIn: 0.12,
});
// The 25 mm triple in its shield, which faces -z; its guns are inside it, laid
// at the elevation they were sculpted at, and it trains as one piece.
const POD = gunPiece('musashi-25pod.glb', {
  scale: 6.2, pivot: [0.4485, -0.6], facing: '-z', foot: -0.15, face: 0, lanes: [],
});
POD.muzzles = [-0.4, 0, 0.4].map((x) => [x, 0, 1.6]);
POD.trunnion = [0, 1.5, 0.3];

// ---- her lines, as the sculpt has them --------------------------------------------
const LINES = measureLines(m, st, { z0: -131, dz: 1, nz: 263, y0: -11, dy: 0.5, ny: 40 }, DECK_Y);
// Under her quarterdeck the sculpt drew her hangar's floor, two metres up,
// and the measure takes it for her deck: her insides go up to her deck there.
for (let i = 0; i < LINES.deck.length; i++) {
  const z = LINES.z0 + i * LINES.dz;
  if (LINES.deck[i] < deckAt(z) - 1.5) LINES.deck[i] = +deckAt(z).toFixed(2);
}

// ---- slice, pack and write ------------------------------------------------------------
const surfaceOf = (t) => (m.C[t] === DECK ? 1 : 0);
const packed = pack(m, col, uvArr, { buckets: 64, length: REAL_LOA, surfaceOf, compact: true });
console.log('buckets', packed.buckets, 'tris', packed.tris);
const b64 = packed.blob.toString('base64');
console.log('packed hull', packed.blob.length, 'bytes ->', b64.length, 'base64 chars');
const turrets = turretParts.map((p) => ({
  name: p.name, x: p.x, z: p.z, rest: +p.rest.toFixed(6), seat: p.seat, roof: p.roof, trunnion: p.trunnion,
  muzzles: p.muzzles, pitch: p.pitch,
  house: packPiece(p.house).toString('base64'), guns: packPiece(p.guns).toString('base64'),
}));
const piece = (g) => ({
  trunnion: g.trunnion, muzzles: g.muzzles, roof: g.roof,
  house: packPiece(g.house).toString('base64'), guns: g.guns.T.length ? packPiece(g.guns).toString('base64') : null,
});
const mounts = {
  secondary: SECONDARY.map(({ name, x, z, rest, seat }) => ({ name, x, z, rest: +rest.toFixed(6), seat })),
  dp: DP.map(({ name, x, z, rest, seat }) => ({ name, x, z, rest: +rest.toFixed(6), seat })),
  light: LIGHT.map(({ name, x, z, deck, pod }) => ({ name, x, z, deck, pod: !!pod })),
};
writeFileSync(OUT_DATA,
  `// Generated by build/prepare-musashi-hull.mjs from the owner's sculpts.\n`
  + `// Do not hand-edit -- regenerate from the source assets instead.\n`
  + `export const MUSASHI_HULL_B64 = ${JSON.stringify(b64)};\n`
  + `// Her surface height, in centimetres, every ${HM.step} m: see musashiSurfaceY.\n`
  + `export const MUSASHI_SURFACE = ${JSON.stringify({ ...HM, b64: heightBytes(hm).toString('base64') })};\n`
  + `// Her three turrets as the sculpt drew them, each in the frame of its own\n`
  + `// mounting: the gunhouse, painted, and the barrels about their trunnions.\n`
  + `export const MUSASHI_TURRETS = ${JSON.stringify(turrets)};\n`
  + `// Her 15.5 cm triple, 12.7 cm twin and shielded 25 mm triple, as the owner\n`
  + `// sculpted them, each in the frame of its mounting.\n`
  + `export const MUSASHI_GUNS = ${JSON.stringify({ sec6: piece(SEC6), sec5: piece(SEC5), pod: piece(POD) })};\n`
  + `// Where each of them stands.\n`
  + `export const MUSASHI_MOUNTS = ${JSON.stringify(mounts)};\n`
  + `// Her four screws, on the ends of her shafts.\n`
  + `export const SCREWS = ${JSON.stringify(SCREWS)};\n`
  + `// Her lines as the sculpt has them: keel, the deck over her insides, and\n`
  + `// her half-breadth at every half metre of height, a metre at a time.\n`
  + `export const MUSASHI_LINES = ${JSON.stringify(LINES)};\n`);
console.log('wrote', OUT_DATA);
