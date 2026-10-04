// Turn the owner's IJN Musashi sculpts into what client/js/render/musashiHull.js
// ships: her hull, her superstructure, her bridge tower, her funnel and her
// masts as one painted mesh, and her three 46 cm turrets as the sculpt of her
// drew them, cut free so they train and elevate. In order:
//
//   * calibrate the sculpt of the whole of her into this game's frame -- bow
//     to +Z by a rotation, scaled to her 263 m, and floated at 10.4 m; her
//     paint (see build/musashi-source.mjs) rides along a triangle at a time;
//   * cut the melted head of her stem off and draw it afresh from her own
//     lines, closed, with her forecastle deck laid across it;
//   * take her superstructure off her, from the foot of No.2 to the foot of
//     No.3, where the sculpt of the whole of her melted it, and stand in its
//     place her superstructure as the sculpt of that drew it, whole and closed
//     -- her tower, her funnel, her raked mainmast, her after control station,
//     every gun platform and tub -- scaled so its 15.5 cm barbettes stand where
//     hers do, drawn to her beam and laid on her deck;
//   * cut her three turrets out of her exactly, gunhouse and barrels, down to
//     the barbette each trains on; cut out every other gun the sculpts cast
//     into her -- her 15.5 cm gunhouses, her 12.7 cm twins, her 25 mm, her
//     catapults -- and close every hole;
//   * sand the lumps off her decks, take the dents decimation left out of
//     everything flat on her without rounding her corners; draw her gunwale
//     abreast her superstructure afresh, and lay her deck afresh there and
//     wherever else the cuts left it holed; paint her decks;
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

// Her paints, as build/musashi-source.mjs numbers them; and her
// superstructure's grey, which is grey that is left as its sculpt drew it --
// not sanded, not torn off as a flap, not dropped for being small and apart
// (everything on its deck is a solid of its own) -- until her decks are laid.
const GREY = 0, DECK = 1, STEEL = 2, SUPER_GREY = 5;
const isSuper = (t) => m.C[t] === SUPER_GREY;
/** Her upper deck amidships, and nothing lower than this faces the sky and is a deck. */
const DECK_Y = 7.72;
const DECK_FLOOR = 5.5;

// Her upper deck: flat at 7.72 m from her quarterdeck to abreast her bridge,
// and falling from there to 6.14 m abreast No.2, as the sculpt has it -- the
// dip in her deck the Yamatos are known by -- before it rises to her bow, a
// few centimetres every few metres to 7.3 m where her stem head is drawn
// afresh, and from there as `BOW.deck` has it. Aft of z -110 her deck steps
// down to the aircraft deck, 5.3 m up, over her hangar.
const DECK_LINE = [[-200, 5.3], [-110.8, 5.3], [-109.6, 7.72], [6, 7.72], [10, 7.53], [14, 7.15], [18, 6.85], [22, 6.66], [26, 6.53],
  [30, 6.35], [34, 6.18], [38, 6.14], [44, 6.19], [48, 6.30], [52, 6.36], [56, 6.43], [64, 6.46], [72, 6.50], [80, 6.55],
  [88, 6.60], [92, 6.70], [96, 6.78], [100, 6.90], [104, 7.08], [108, 7.29], [112, 7.45], [116, 7.67], [120, 8.01],
  [124, 8.37], [127, 8.63], [129, 8.78], [131.5, 8.93]];
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
// alongside No.1, No.2 and No.3, the sculpt of the whole of her drew tubs and
// gun platforms that melted, and those come off too, outboard of the turrets'
// barbettes: her deck there is bare but for the 25 mm stood on it.
// The superstructure sculpt drew the back of No.2 a metre or two forward of
// the barbette its forward 15.5 cm stands on; nothing of it forward of that
// barbette, at 18.6 m, is kept (see build/musashi-source.mjs), and her deck
// between it and No.2 is bare.
const ISLAND = { z0: -54.5, z1: 20.35 };
const SIDES = { z0: -79, z1: 44, x: 8.6 };

// ---- her superstructure, as the sculpt of it drew it ----------------------------------
// Bow at -X, Y up, starboard at -Z, drawn whole on a slab of her hull, and
// cut off it a hand over its deck with a floor under everything (see
// build/musashi-source.mjs). 60.97 m a unit, which stands its two centreline
// 15.5 cm barbettes where hers are -- the forward one's middle, at `x` along
// it, on her z 14.6 -- and the backs of the No.2 and No.3 it drew within a
// metre or two of hers. The slab's deck, at `deck`, is laid on hers at her
// upper deck amidships, as one piece: what stands on it keeps its shape,
// every wall upright and every barbette top level. Its floors -- everything
// within `foot` metres of the slab's deck -- go a hand into her deck, and the
// next `ease` metres of every wall over them are eased down after them: where
// her deck falls away forward of her tower the walls there reach down to it,
// and nowhere does a wall end short of her deck with the dark under it.
//
// The slab is drawn broader amidships than she is -- its deck edge is
// `half(x)` out, two metres and more past hers where she is broadest -- and
// tapers more towards its ends. So it is drawn across to her own beam, a
// length of her at a time: everything on it is brought in towards her
// centreline by as much as her deck edge is in from the slab's there, which
// keeps a wall upright and puts what stood at the slab's deck edge at hers.
const SUPER = {
  scale: 60.97, x: -0.5365, z: 14.6, deck: -0.163, foot: 0.3, ease: 0.7,
  half: (x) => 0.338 - 0.095 * x * x,
};
/**
 * Her half-breadth and the top of her deck, off her as she is now; and her
 * side, a metre of her length at a time, where it is plain plating a metre
 * and a half under her deck edge.
 */
function deckOf(mesh) {
  const half = new Map(), top = new Map(), side = new Map();
  const cell = (x, z) => `${Math.round(x * 2)},${Math.round(z * 2)}`;
  const { P, T } = mesh;
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
    const cy = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, cz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
    const d = deckAt(cz);
    if (cy > d + 0.3 || cy < d - 2.0) continue;
    for (const v of [a, b, c]) {
      const k = Math.round(P[v + 2]);
      if (P[v + 1] > d - 1.5) half.set(k, Math.max(half.get(k) || 0, Math.abs(P[v])));
    }
    const [nx, ny, nz] = faceNormal(mesh, T[t], T[t + 1], T[t + 2]);
    if (ny < 0.7 * Math.hypot(nx, ny, nz)) continue;
    for (const v of [a, b, c]) {
      const k = cell(P[v], P[v + 2]);
      if (!(top.get(k) >= P[v + 1])) top.set(k, P[v + 1]);
    }
  }
  // Her side where it crosses the level a metre and a half under her deck.
  for (let t = 0; t < T.length; t += 3) {
    const v = [T[t] * 3, T[t + 1] * 3, T[t + 2] * 3];
    const lvl = deckAt((P[v[0] + 2] + P[v[1] + 2] + P[v[2] + 2]) / 3) - 1.5;
    for (let j = 0; j < 3; j++) {
      const a = v[j], b = v[(j + 1) % 3];
      const da = P[a + 1] - lvl, db = P[b + 1] - lvl;
      if ((da < 0) === (db < 0)) continue;
      const f = da / (da - db);
      const k = Math.round(P[a + 2] + (P[b + 2] - P[a + 2]) * f);
      side.set(k, Math.max(side.get(k) || 0, Math.abs(P[a] + (P[b] - P[a]) * f)));
    }
  }
  const sideAt = (z) => {
    const k = Math.round(z), v = [];
    for (let d = -4; d <= 4; d++) if (side.has(k + d)) v.push(side.get(k + d));
    v.sort((p, q) => p - q);
    return v.length ? v[v.length >> 1] : 0;
  };
  return {
    side: sideAt,
    half: (z) => half.get(Math.round(z)) || 0,
    top: (x, z) => {
      let best = -Infinity;
      for (const dx of [0, -0.5, 0.5]) for (const dz of [0, -0.5, 0.5]) {
        const v = top.get(cell(x + dx, z + dz));
        if (v !== undefined) best = Math.max(best, v);
      }
      return Number.isFinite(best) ? best : deckAt(z);
    },
  };
}
function superstructure(her) {
  const raw = readGlb(ASSET('musashi-super.glb'));
  const s = SUPER.scale;
  const P = [], N = [];
  for (let i = 0; i < raw.pos.length; i += 3) {
    const x = raw.pos[i], y = raw.pos[i + 1], z = raw.pos[i + 2];
    // A quarter turn, as the sculpt of the whole of her is turned: starboard,
    // -Z in the sculpt, is -X in her frame.
    const Z = SUPER.z - (x - SUPER.x) * s;
    const X = z * her.side(Z) / SUPER.half(x);
    const h = (y - SUPER.deck) * s;
    let Y = h + DECK_Y;
    if (h < SUPER.foot + SUPER.ease) {
      const drop = DECK_Y - (her.top(X, Z) - 0.3);
      Y -= drop * Math.min(1, (SUPER.foot + SUPER.ease - h) / SUPER.ease);
    }
    P.push(X, Y, Z);
    N.push(raw.nrm[i + 2], raw.nrm[i + 1], -raw.nrm[i]);
  }
  const T = Array.from(raw.idx);
  return { P, N, T, C: new Array(T.length / 3).fill(SUPER_GREY) };
}

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
    { name: 'forward of the island', x0: -SIDES.x, x1: SIDES.x, z0: ISLAND.z1, z1: 23.0, y0: deckAt(23) + 0.2, y1: 80 },
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
  // Where two of those boxes meet, the first closed what it left on the face
  // they share, and the second took what was behind that away: the cap is
  // left standing on her deck by itself, a wall of nothing.
  const shared = (x, z) => Math.abs(z - 6) < 1e-3 || Math.abs(z - ISLAND.z1) < 1e-3
    || (Math.abs(x) > SIDES.x - 1e-3 && Math.abs(z - ISLAND.z0) < 1e-3)
    || (Math.abs(Math.abs(x) - SIDES.x) < 1e-3 && z > ISLAND.z1 && z < 23.0);
  let n = 0;
  Object.assign(m, subMesh(m, (t) => {
    for (let j = 0; j < 3; j++) {
      const v = m.T[t * 3 + j] * 3;
      if (!shared(m.P[v], m.P[v + 2])) return true;
    }
    n++;
    return false;
  }));
  console.log(`${n} faces of cap left standing where two of those boxes met taken off`);
}

// ---- her bow ------------------------------------------------------------------------
// The sculpt of the whole of her melted her stem head: her hawse pipes and the
// bulwark round her forecastle came out as lumps standing off her side, with a
// slit between her side and her deck you can see the sea through, and the top
// of her stem is a scatter of loose plates. From `z` forward and `y` up she is
// cut off (the cut closes her where it went through her), and drawn afresh as
// the sculpt has her lines just aft of the damage: her side, flaring out to
// her deck edge, run forward to her stem, and her forecastle deck laid across
// it, flush, at the height the sculpt has it on her centreline.
//
// `hb(z, y)` is her half-breadth, read off the sculpt as the lesser of her two
// sides (a lump stands out of one side or the other) up to `fair`, and run
// from there into her stem as (stem - z)^p, where `stem(y)` is how far forward
// her stem is at that height and `p` is fuller the higher up her side it is,
// as the sculpt draws her bow flaring.
const BOW = {
  z: 108, y: 4.0, fair: 125, dz: 0.5, dy: 0.25,
  // Her deck on the centreline, z -> y.
  deck: [[104, 7.12], [108, 7.29], [112, 7.45], [116, 7.67], [120, 8.01], [124, 8.37], [127, 8.63], [129, 8.78],
    [131.5, 8.93]],
  // Her stem, y -> z.
  stem: [[4, 127.9], [5, 128.2], [6, 128.6], [7, 129.6], [8, 130.6], [9, 131.4], [9.5, 131.6]],
  p: (y) => Math.max(0.35, 0.72 - 0.0675 * (y - 4)),
};
const lerpTable = (tab, v) => {
  if (v <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) {
    if (v > tab[i][0]) continue;
    const [a, ya] = tab[i - 1], [b, yb] = tab[i];
    return ya + (yb - ya) * (v - a) / (b - a);
  }
  return tab[tab.length - 1][1];
};
{
  // Her half-breadth either side, a metre along and a quarter metre up.
  const Z0 = BOW.z - 2, NZ = BOW.fair - Z0 + 1, Y0 = BOW.y - 0.5, NY = Math.round((10 - Y0) / BOW.dy) + 1;
  const sides = [new Float64Array(NZ * NY), new Float64Array(NZ * NY)];
  const { P, T } = m;
  for (let t = 0; t < T.length; t += 3) {
    const v = [T[t] * 3, T[t + 1] * 3, T[t + 2] * 3];
    for (let iz = 0; iz < NZ; iz++) {
      const z = Z0 + iz;
      const pts = [];
      for (let k = 0; k < 3; k++) {
        const a = v[k], b = v[(k + 1) % 3];
        if ((P[a + 2] - z) * (P[b + 2] - z) > 0 || P[a + 2] === P[b + 2]) continue;
        const f = (z - P[a + 2]) / (P[b + 2] - P[a + 2]);
        pts.push([P[a] + (P[b] - P[a]) * f, P[a + 1] + (P[b + 1] - P[a + 1]) * f]);
      }
      if (pts.length < 2) continue;
      const [[xa, ya], [xb, yb]] = pts;
      for (let iy = 0; iy < NY; iy++) {
        const y = Y0 + iy * BOW.dy;
        if ((ya - y) * (yb - y) > 0) continue;
        const x = ya === yb ? xa : xa + (xb - xa) * (y - ya) / (yb - ya);
        const side = sides[x < 0 ? 0 : 1];
        side[iz * NY + iy] = Math.max(side[iz * NY + iy], Math.abs(x));
      }
    }
  }
  const read = (iz, iy) => {
    const a = sides[0][iz * NY + iy], b = sides[1][iz * NY + iy];
    return a && b ? Math.min(a, b) : a || b;
  };
  const measured = (z, y) => {
    const fz = Math.min(NZ - 1.001, Math.max(0, z - Z0)), fy = Math.min(NY - 1.001, Math.max(0, (y - Y0) / BOW.dy));
    const iz = Math.floor(fz), iy = Math.floor(fy), u = fz - iz, w = fy - iy;
    return (read(iz, iy) * (1 - u) + read(iz + 1, iy) * u) * (1 - w) + (read(iz, iy + 1) * (1 - u) + read(iz + 1, iy + 1) * u) * w;
  };
  const deckY = (z) => lerpTable(BOW.deck, z);
  const stemZ = (y) => lerpTable(BOW.stem, y);
  const hb = (z, y) => {
    const top = deckY(Math.min(z, BOW.fair));
    const yy = Math.min(y, top);
    if (z <= BOW.fair) return measured(z, yy);
    const zs = stemZ(yy);
    if (z >= zs) return 0;
    return measured(BOW.fair, yy) * ((zs - z) / (zs - BOW.fair)) ** BOW.p(yy);
  };
  // Off with the melted head of her.
  const cut = boxCut(m, { x0: -30, x1: 30, y0: BOW.y, y1: 40, z0: BOW.z, z1: 140 }, { rescue: true });
  console.log(`her bow: ${cut.cut} triangles cut, closed with ${cut.caps.filter((n) => n).join('/')}`);
  // And her new one: her side as a grid over z and the height of it, each
  // side; her deck as a strip across the top of each section.
  const zEnd = stemZ(deckY(140));
  const zs = [];
  for (let z = BOW.z; z < zEnd; z += BOW.dz) zs.push(z);
  zs.push(zEnd);
  const NT = Math.round((deckY(BOW.fair) - BOW.y) / BOW.dy);
  const bow = { P: [], N: [], T: [], C: [] };
  const vid = (x, y, z, nx, ny, nz) => { bow.P.push(x, y, z); bow.N.push(nx, ny, nz); return bow.P.length / 3 - 1; };
  // Forward of where her stem is at the foot of the new work, the foot of
  // each section is her stem, at the height it is that far forward.
  const stemFoot = (z) => (z <= stemZ(BOW.y) ? BOW.y : lerpTable(BOW.stem.map(([y, zz]) => [zz, y]), z));
  for (const sgn of [-1, 1]) {
    const rows = zs.map((z) => {
      const top = deckY(z), foot = Math.min(top, stemFoot(z));
      const row = [];
      for (let k = 0; k <= NT; k++) {
        const y = foot + (top - foot) * (k / NT);
        row.push(vid(sgn * hb(z, y), y, z, sgn, 0, 0));
      }
      return row;
    });
    for (let i = 0; i + 1 < rows.length; i++) {
      for (let k = 0; k < NT; k++) {
        const a = rows[i][k], b = rows[i + 1][k], c = rows[i + 1][k + 1], d = rows[i][k + 1];
        bow.T.push(a, b, c, a, c, d);
        bow.C.push(GREY, GREY);
      }
    }
  }
  // Her forecastle deck, from her side to her side.
  const across = 6;
  const deckRows = zs.map((z) => {
    const y = deckY(z), w = hb(z, y);
    const row = [];
    for (let k = 0; k <= across; k++) row.push(vid(-w + (2 * w * k) / across, y, z, 0, 1, 0));
    return row;
  });
  for (let i = 0; i + 1 < deckRows.length; i++) {
    for (let k = 0; k < across; k++) {
      const a = deckRows[i][k], b = deckRows[i + 1][k], c = deckRows[i + 1][k + 1], d = deckRows[i][k + 1];
      bow.T.push(a, b, c, a, c, d);
      bow.C.push(DECK, DECK);
    }
  }
  fixWinding(bow);
  append(m, bow);
  console.log(`her bow: drawn afresh from ${BOW.z} m forward, ${bow.T.length / 3} triangles; her stem head at ${zEnd.toFixed(1)} m`);
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
// Between No.2 and No.3, inside her side; and whatever of it stands clear of
// her deck with nothing under it -- a block a wire held up -- goes.
{
  const her = deckOf(m);
  const sup = superstructure(her);
  // Its ends were cut square to her turrets' barbettes, and closed, before it
  // came here (see build/musashi-source.mjs). Towards them it is broader than
  // she is, and what stood past her side has nothing of hers under it. Nor is
  // what it drew along its own deck edge kept, which it brings to hers: the
  // rail there, and the sponsons and boat chocks standing out over its side,
  // whose outer skin is past hers and goes -- what is left of them is a
  // shelf standing out from her gunwale and a sheet of plate on her deck edge
  // that is there only from inboard, with nothing behind it. Her own gunwale
  // is there.
  const RAIL = { in: 0.45, up: 1.6 };
  let rail = 0;
  const onDeck = subMesh(sup, (t) => {
    const [x, y, z] = middle(sup, t);
    if (Math.abs(x) >= her.side(z) + 0.1) return false;
    if (Math.abs(x) > her.side(z) - RAIL.in && y < deckAt(z) + RAIL.up) { rail++; return false; }
    return true;
  });
  console.log(`superstructure: ${rail} faces of its deck edge taken off at hers`);
  const scraps = new Uint8Array(onDeck.T.length / 3);
  let nScraps = 0;
  for (const c of components(onDeck)) {
    const diag = Math.hypot(c.hi[0] - c.lo[0], c.hi[1] - c.lo[1], c.hi[2] - c.lo[2]);
    if (c.tris.length > 80 || diag > 6 || c.lo[1] < deckAt((c.lo[2] + c.hi[2]) / 2) + 3) continue;
    for (const t of c.tris) scraps[t] = 1;
    nScraps++;
  }
  const kept = subMesh(onDeck, (t) => !scraps[t]);
  console.log(`superstructure: ${kept.T.length / 3} triangles on her deck, ${nScraps} scraps of it left in the air`);
  if (process.env.PARTS) {
    for (const c of components(kept).slice(0, +process.env.PARTS)) {
      console.log('  part', c.tris.length, c.lo.map((v) => v.toFixed(1)).join(','), '..', c.hi.map((v) => v.toFixed(1)).join(','));
    }
  }
  append(m, kept);
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
// No.3, and one either side of her abreast her funnel -- the wing turrets.
//
// The centreline pair stand on the barbettes the superstructure sculpt drew
// for them, which are whole: its own gunhouse is cut off each at the top of
// the barbette (`cuts`), the cut closes the barbette's top flat, and the
// owner's sculpt of the turret trains on it. `seat` is where that turret's
// foot is, which puts the floor of its gunhouse on the barbette's top; the
// after one sits a little down over its barbette, so that its roof clears the
// platform of her after control station, which overhangs it.
//
// The superstructure sculpt is Musashi after her 1944 refit, when the wing
// turrets were landed, and drew none. They go back abreast her funnel, on her
// upper deck -- no barbette, the floor of the gunhouse on her planking -- and
// whatever of her superstructure stood there comes off down to the deck: the
// deckhouse at the foot of her funnel and the 25 mm tub on it, as far as the
// gunhouse swings and no further in than the columns her 12.7 cm stand on
// (`WING.well`, three boxes that between them leave the well round the
// turret; the columns are a hand clear of every one). In the well a turret
// stows trained out on its own beam: trained fore and aft its barrels would
// lie in the deckhouse.
const WING = {
  x: 15.2, z: -18.6, seat: 7.5, deck: 7.72, top: 12.35,
  well: [[[12.4, 20], [-23.7, -13.5]], [[10.3, 20], [-21.0, -16.0]], [[10.9, 12.4], [-21.8, -15.6]]],
};
const wingCuts = (sgn) => WING.well.map(([x, z]) => ({
  x: sgn > 0 ? x : [-x[1], -x[0]], z, y: [WING.deck + 0.05, WING.top], deck: WING.deck,
}));
export const SECONDARY = [
  { name: '15.5 fore', x: 0, z: 14.55, rest: 0, seat: 13.3, cuts: [{ x: [-4.6, 4.6], z: [9.0, 19.0], y: [13.5, 23.0] }] },
  { name: '15.5 aft', x: 0, z: -50.55, rest: Math.PI, seat: 12.15,
    cuts: [{ x: [-4.9, 4.9], z: [-54.9, -45.6], y: [12.35, 16.3] }, { x: [-4.9, 4.9], z: [-54.9, -47.1], y: [16.3, 21] }] },
  { name: '15.5 wing stbd', x: -WING.x, z: WING.z, rest: -Math.PI / 2, seat: WING.seat, cuts: wingCuts(-1) },
  { name: '15.5 wing port', x: WING.x, z: WING.z, rest: Math.PI / 2, seat: WING.seat, cuts: wingCuts(1) },
];

// ---- her 12.7 cm ------------------------------------------------------------------
// Six 12.7 cm/40 Type 89 twins in their shields, three a side abreast her
// funnel, the middle pair a deck higher than the others: the superstructure
// sculpt drew each in its shield on its own drum. The shield is cut off the
// drum, which is what the owner's sculpt of the mount stands on; `seat` is
// the top of the drum.
export const DP = [
  { name: '12.7 fwd', x: 8.70, z: -12.68, seat: 12.45, x0: 5.3, x1: 12.6, top: 15.6 },
  { name: '12.7 mid', x: 8.07, z: -23.99, seat: 15.15, x0: 4.7, x1: 11.9, top: 17.6 },
  { name: '12.7 aft', x: 8.36, z: -32.96, seat: 12.5, x0: 5.3, x1: 12.2, top: 15.7 },
].flatMap((d) => [-1, 1].map((sgn) => ({
  name: `${d.name} ${sgn > 0 ? 'port' : 'stbd'}`, x: sgn * d.x, z: d.z, seat: d.seat, rest: sgn * Math.PI / 2,
  cut: { x: sgn > 0 ? [d.x0, d.x1] : [-d.x1, -d.x0], z: [d.z - 3.8, d.z + 3.8], y: [d.seat, d.top] },
})));

// ---- her 25 mm ------------------------------------------------------------------
// Triple 25 mm Type 96. Round her superstructure, where the superstructure
// sculpt drew them: in shields (`pod`) on the pedestals abreast her tower and
// her mainmast and on her deck edge abreast her tower and her funnel, and open
// in their tubs -- at the foot of the forward 15.5 cm,
// on the side of her tower, on the barbette the wing turret stood on before
// 1944, abreast her funnel and abreast the after 15.5 cm. Then the four at her
// stern, two a side, in their shields, and the rest -- on her forecastle,
// abreast No.2 and No.3 and on her quarterdeck -- open, on their pedestals.
// Every one stands where a sculpt drew one, which is cut away down to the deck,
// the floor of the tub or the top of the pedestal it stood on (`deck`), from a
// hand over it to `top` (four metres over it if not given) and `r` round it;
// the tub, and the pedestal, stay. The tub abreast her funnel forward went
// with the deckhouse it stood on to make the well for her wing turret.
const LIGHT0 = [
  // The sculpt drew this pair out of step: the port tub is two and a half
  // metres further out and further aft than the starboard one, its ring half
  // fallen in round the gun in it. Port stands its own (`port`), and that
  // tub, gun and ring, is cut away down to her deck.
  { name: 'tub abreast 15.5 fore', x: 7.06, z: 14.5, deck: 7.08, r: 1.3, top: 9.6,
    port: { x: 9.63, z: 11.89, deck: 7.35, box: { x: [7.5, 11.75], z: [9.75, 14.0], y: [7.5, 9.8] } } },
  { name: 'tub tower fwd', x: 6.65, z: 2.6, deck: 12.8, r: 1.25, top: 15.0 },
  { name: 'tub tower aft', x: 9.0, z: -0.2, deck: 12.67, r: 1.25, top: 15.0 },
  { name: 'pod abreast tower', x: 11.79, z: -0.09, deck: 9.3, pod: true, r: 2.35, top: 12.3 },
  { name: 'tub wing barbette', x: 12.72, z: -6.65, deck: 10.43, r: 1.4, top: 13.0 },
  { name: 'tub abreast funnel', x: 13.8, z: -28.8, deck: 10.45, r: 1.4, top: 13.5 },
  { name: 'pod abreast mainmast', x: 14.84, z: -35.14, deck: 9.3, pod: true, r: 2.35, top: 11.4 },
  { name: 'pod 01 abreast mainmast', x: 11.3, z: -37.37, deck: 10.1, pod: true, r: 2.2, top: 12.8 },
  { name: 'tub abreast 15.5 aft', x: 12.94, z: -49.5, deck: 8.0, r: 1.3, top: 10.5 },
  { name: 'open abreast No.3', x: 13.16, z: -62.09, deck: 7.72, r: 2.4 },
  { name: 'open quarterdeck', x: 15.0, z: -89.6, deck: 7.65, r: 2.2 },
  { name: 'pod stern fwd', x: 16.45, z: -95.26, deck: 7.6, pod: true, r: 2.5 },
  { name: 'pod stern aft', x: 14.25, z: -100.09, deck: 7.6, pod: true, r: 2.2 },
  { name: 'open forecastle', x: 8.0, z: 65.3, deck: 6.45, r: 1.6 },
  { name: 'open abreast No.2', x: 8.1, z: 42.3, deck: 6.15, r: 1.5 },
  // And two a side at her deck edge, in their shields, facing out: abreast her
  // tower and abreast her funnel. The sculpt drew each on her deck edge itself,
  // half of it out past her side, and what stood past her side went with the
  // rest of that (see `onDeck`), leaving the back of each shield standing on
  // her gunwale like a hood. The cut (`box`) takes the hood and nothing
  // inboard of it -- the platforms over the deck there reach out to within a
  // hand of it -- and each stands its own width in from her side.
  { name: 'pod deck edge abreast tower', x: 17.3, z: -4.55, deck: 7.72, pod: true, r: 2.0,
    box: { x: [17.05, 20.5], z: [-6.75, -2.35], y: [7.87, 10.7] } },
  { name: 'pod deck edge abreast funnel', x: 17.3, z: -30.4, deck: 7.72, pod: true, r: 2.0,
    box: { x: [17.05, 20.5], z: [-32.8, -28.3], y: [7.87, 10.7] } },
];
export const LIGHT = LIGHT0.flatMap(({ port, ...l }) => [-1, 1].map((sgn) => {
  const own = sgn > 0 && port ? port : l;
  return {
    ...l, ...own, name: `${l.name} ${sgn > 0 ? 'port' : 'stbd'}`, x: sgn * own.x,
    ...(own.box ? { box: { ...own.box, x: sgn > 0 ? own.box.x : [-own.box.x[1], -own.box.x[0]] } } : {}),
  };
}));

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
  ...LIGHT.map((l) => (l.box
    ? { name: l.name, x0: l.box.x[0], x1: l.box.x[1], z0: l.box.z[0], z1: l.box.z[1], y0: l.box.y[0], y1: l.box.y[1], deck: l.deck }
    : { name: l.name, x0: l.x - l.r, x1: l.x + l.r, z0: l.z - l.r, z1: l.z + l.r,
      y0: l.deck + 0.15, y1: l.top ?? l.deck + 4.2, deck: l.deck })),
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
    // Where nothing is stood back on the place, it is pressed to the deck
    // round it, sheer and camber and all, so no step shows where it stood.
    const ring = [];
    if (b.clear) {
      for (let i = 0; i < m.P.length; i += 3) {
        const x = m.P[i], y = m.P[i + 1], z = m.P[i + 2];
        const out = Math.max(b.x0 - x, x - b.x1, b.z0 - z, z - b.z1);
        if (out > 0.05 && out < 1.5 && Math.abs(y - b.deck) < 0.25) ring.push([x, y, z]);
      }
    }
    const deckAt = (x, z) => {
      if (!ring.length) return b.deck;
      let w = 0, s = 0;
      for (const [rx, ry, rz] of ring) {
        const k = 1 / ((rx - x) ** 2 + (rz - z) ** 2 + 0.01) ** 2;
        w += k; s += k * ry;
      }
      return s / w;
    };
    let n = 0;
    for (let i = 0; i < m.P.length; i += 3) {
      const x = m.P[i], y = m.P[i + 1], z = m.P[i + 2];
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || y < b.deck - (b.clear ? 0.6 : 0.05)
        || y > b.y0 + 1e-4) continue;
      m.P[i + 1] = deckAt(x, z);
      n++;
    }
    if (process.env.VERBOSE) console.log(`${b.name}: ${n} points pressed down on to the deck at ${b.deck}`);
  }
  console.log(`cut: ${CUT_BOXES.length} mountings and ${TURRETS.length} turrets out of her`);
}
recomputeNormals(m);
dropLoose(m, { keep: isSuper });
console.log(`faces facing in: ${turnInward(m)} turned`);
// What the cuts and the rigging left hanging in the air -- a block or a stub
// of wire with nothing under it, well clear of her deck -- goes.
{
  const drop = new Uint8Array(m.T.length / 3);
  let n = 0;
  const parts = components(m);
  for (const c of parts) {
    const diag = Math.hypot(c.hi[0] - c.lo[0], c.hi[1] - c.lo[1], c.hi[2] - c.lo[2]);
    const mid = (c.lo[2] + c.hi[2]) / 2;
    if (c.tris.length > 400 || diag > 9 || c.lo[1] < deckAt(mid) + 5 || c.tris.some(isSuper)) continue;
    for (const t of c.tris) drop[t] = 1;
    n++;
  }
  // Her superstructure is many pieces that stand on or in one another, and a
  // piece of it is only loose if nothing else of her is within a hand of it:
  // what the guns cut off it were holding up -- a yard on the roof of a
  // turret, a rangefinder's arms -- and nothing holds up now.
  const near = 0.25;
  const grid = new Map();
  const key = (x, y, z) => `${Math.floor(x / near)},${Math.floor(y / near)},${Math.floor(z / near)}`;
  const owner = new Int32Array(m.P.length / 3).fill(-1);
  parts.forEach((c, k) => { for (const t of c.tris) for (let j = 0; j < 3; j++) owner[m.T[t * 3 + j]] = k; });
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] < 0) continue;
    const kk = key(m.P[i * 3], m.P[i * 3 + 1], m.P[i * 3 + 2]);
    if (!grid.has(kk)) grid.set(kk, new Set());
    grid.get(kk).add(owner[i]);
  }
  let loose = 0;
  parts.forEach((c, k) => {
    if (k === 0 || !c.tris.some(isSuper) || c.lo[1] < deckAt((c.lo[2] + c.hi[2]) / 2) + 2) return;
    for (const t of c.tris) {
      for (let j = 0; j < 3; j++) {
        const i = m.T[t * 3 + j], x = m.P[i * 3], y = m.P[i * 3 + 1], z = m.P[i * 3 + 2];
        const gx = Math.floor(x / near), gy = Math.floor(y / near), gz = Math.floor(z / near);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) {
          const s2 = grid.get(`${gx + a},${gy + b},${gz + d}`);
          if (s2 && (s2.size > 1 || !s2.has(k))) return;
        }
      }
    }
    for (const t of c.tris) drop[t] = 1;
    loose++;
  });
  Object.assign(m, subMesh(m, (t) => !drop[t]));
  console.log(`scraps: ${n} pieces left in the air taken off her, and ${loose} of her superstructure touching nothing`);
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

// ---- her gunwale amidships ---------------------------------------------------------
// Abreast her superstructure what the cuts pressed down on to her deck at her
// side -- the melted boats, booms and rails stood along it -- lies there as a
// shelf of planking standing out past her side, a metre and more of it, with
// a skirt of plate hanging off its edge: a ledge on her side with daylight
// under it. Her side there is all but upright, flaring out a few centimetres
// a metre towards her deck: whatever stands out past it, from two and a half
// metres under her deck to half a metre over it, is laid back against it.
const GUNWALE = { REF: 4.6, FLARE: 0.06, z0: ISLAND.z0 - 2, z1: ISLAND.z1 + 5.5, side: [new Map(), new Map()] };
const amidships = (z) => z > GUNWALE.z0 && z < GUNWALE.z1;
/** Her side amidships at height `y`, on the side `x` is on: the median of a metre either way of `z`. */
const gunwaleAt = (x, y, z) => {
  const map = GUNWALE.side[x < 0 ? 0 : 1], k = Math.round(z * 2), v = [];
  for (let d = -2; d <= 2; d++) if (map.has(k + d)) v.push(map.get(k + d));
  v.sort((p, q) => p - q);
  return v.length ? v[v.length >> 1] + GUNWALE.FLARE * (y - GUNWALE.REF) : 0;
};
{
  const { P, T } = m;
  const { REF, side } = GUNWALE, SLACK = 0.12;
  // Her side at REF, half a metre at a time, each side: where her plating
  // goes through that waterline.
  for (let t = 0; t < T.length; t += 3) {
    const v = [T[t], T[t + 1], T[t + 2]].map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
    const d = v.map((p) => p[1] - REF);
    if ((d[0] > 0 && d[1] > 0 && d[2] > 0) || (d[0] < 0 && d[1] < 0 && d[2] < 0)) continue;
    const pts = [];
    for (let k = 0; k < 3; k++) {
      const p = v[k], q = v[(k + 1) % 3], dp = d[k], dq = d[(k + 1) % 3];
      if ((dp < 0) !== (dq < 0)) { const s = dp / (dp - dq); pts.push([p[0] + (q[0] - p[0]) * s, p[2] + (q[2] - p[2]) * s]); }
    }
    if (pts.length !== 2 || !amidships(pts[0][1])) continue;
    const n = Math.max(1, Math.ceil(Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) / 0.1));
    for (let s = 0; s <= n; s++) {
      const x = pts[0][0] + (pts[1][0] - pts[0][0]) * s / n, z = pts[0][1] + (pts[1][1] - pts[0][1]) * s / n;
      const map = side[x < 0 ? 0 : 1], k = Math.round(z * 2);
      map.set(k, Math.max(map.get(k) || 0, Math.abs(x)));
    }
  }
  let n = 0;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    if (!amidships(z)) continue;
    const d = deckAt(z);
    if (y < d - 2.5 || y > d + 0.5) continue;
    const at = gunwaleAt(x, y, z);
    if (!at || Math.abs(x) <= at + SLACK) continue;
    P[i] = Math.sign(x) * (at - 0.02);
    n++;
  }
  console.log(`gunwale amidships: ${n} points standing out past her side laid back against it`);
}

// ---- the flaps on her upperworks, and the dents in her flats -----------------------
const FLAPS = process.env.NOSMOOTH ? new Uint8Array(m.T.length / 3) : flaps(m, {
  only: (x, y, z) => y > 6.0 && y < 45 && z > -118,
});
for (let t = 0; t < FLAPS.length; t++) if (isSuper(t)) FLAPS[t] = 0;
{
  const n = FLAPS.reduce((s, v) => s + v, 0);
  Object.assign(m, subMesh(m, (t) => !FLAPS[t]));
  console.log(`flaps: ${n} faces of torn plate taken off her upperworks`);
}
dropLoose(m, { keep: isSuper });
const thin = thinFaces(m, 0.5);
if (!process.env.NOSMOOTH) {
  const up = denoise(m, weld(m), {
    sigmaS: 1.0, sigmaR: 0.33, normalIters: 10, vertexIters: 25, max: 0.35,
    only: (x, y, z, t) => y > DECK_Y + 0.6 && !thin[t] && !isSuper(t),
  });
  console.log(`upperworks denoised: ${up.points} points, ${(up.movedMean * 100).toFixed(1)} cm on average`);
  recomputeNormals(m);
  const d = denoise(m, weld(m), {
    sigmaS: 0.6, sigmaR: 0.35, normalIters: 6, vertexIters: 15, max: 0.2, only: (x, y, z, t) => !thin[t] && !isSuper(t),
  });
  console.log(`denoised: ${d.points} points, ${(d.movedMean * 100).toFixed(1)} cm on average`);
  recomputeNormals(m);
}
// ---- her gunwale and her deck amidships, made good ------------------------------
// Laid back, what stood out past her side there is out of the way; but her
// deck edge under it is still the sculpt's, melted -- torn, with the sea to
// be seen through it here and there, and a sheet of the superstructure
// sculpt's rail standing on it that is only there from inboard. And her deck
// between her side and her superstructure is what the cuts that took her own
// off it left: holed, dented, and strewn with the flakes of what they pressed
// down into it. So abreast her superstructure, and as far forward as her deck
// dips to No.2:
//
//   * whatever lies wholly within `in` of her side, from `down` under her deck
//     to `up` over it, comes off, and her side plating and her deck edge are
//     drawn in over the gap afresh, plain: her side straight up to her deck,
//     her deck out to her side, a hand past the gap all round and a few
//     centimetres proud of what is left, so the seam never shows daylight;
//   * whatever of hers lies wholly within `flake` of her deck inboard of that
//     comes off, and her deck is laid afresh over it, flat, from her gunwale
//     to her gunwale -- under her superstructure too, which stands on it with
//     its feet a hand into it. What is left of the old deck lies in the new
//     one's plane, and is planked the same.
{
  const G = { in: 0.6, down: 1.0, up: 1.6, lap: 0.15, out: 0.03, lift: 0.02, step: 0.5, flake: 0.5, z1: 23.0, across: 2.0 };
  const inBand = (v) => {
    const x = m.P[v * 3], y = m.P[v * 3 + 1], z = m.P[v * 3 + 2];
    if (!amidships(z)) return false;
    const d = deckAt(z);
    return y > d - G.down && y < d + G.up && Math.abs(x) > gunwaleAt(x, y, z) - G.in;
  };
  const relaid = (z) => z > ISLAND.z0 && z < G.z1;
  const onDeck = (v) => {
    const x = m.P[v * 3], y = m.P[v * 3 + 1], z = m.P[v * 3 + 2];
    return relaid(z) && Math.abs(y - deckAt(z)) < G.flake;
  };
  const all = (t, f) => f(m.T[t * 3]) && f(m.T[t * 3 + 1]) && f(m.T[t * 3 + 2]);
  const before = m.T.length / 3;
  let flakes = 0;
  Object.assign(m, subMesh(m, (t) => {
    if (all(t, inBand)) return false;
    if (!isSuper(t) && all(t, onDeck)) { flakes++; return false; }
    return true;
  }));
  const strip = { P: [], N: [], T: [], C: [] };
  const vert = (p, n) => { strip.P.push(...p); strip.N.push(...n); return strip.P.length / 3 - 1; };
  const quad = (a, b, c, d, want) => {
    const [nx, ny, nz] = faceNormal(strip, a, b, c);
    const flip = nx * want[0] + ny * want[1] + nz * want[2] < 0;
    strip.T.push(...(flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d]));
    strip.C.push(GREY, GREY);
  };
  const n = Math.round((GUNWALE.z1 - GUNWALE.z0) / G.step);
  for (const sgn of [-1, 1]) {
    const rows = [];
    for (let i = 0; i <= n; i++) {
      const z = GUNWALE.z0 + i * G.step, d = deckAt(z);
      const yLow = d - G.down - G.lap, edge = gunwaleAt(sgn, d, z) + G.out;
      const out = [sgn, 0, 0], up = [0, 1, 0];
      rows.push({
        low: vert([sgn * (gunwaleAt(sgn, yLow, z) + G.out), yLow, z], out),
        sideTop: vert([sgn * edge, d + G.lift, z], out),
        deckEdge: vert([sgn * edge, d + G.lift, z], up),
        deckIn: vert([sgn * (edge - G.out - G.in - G.lap), d + G.lift, z], up),
      });
    }
    for (let i = 0; i < n; i++) {
      const a = rows[i], b = rows[i + 1];
      quad(a.low, b.low, b.sideTop, a.sideTop, [sgn, 0, 0]);
      quad(a.deckEdge, b.deckEdge, b.deckIn, a.deckIn, [0, 1, 0]);
    }
  }
  // Her deck, from her gunwale to her gunwale, a strip across her at a time.
  const nd = Math.round((G.z1 - ISLAND.z0) / G.step);
  const nGunwale = strip.T.length / 3;
  for (let i = 0; i < nd; i++) {
    const za = ISLAND.z0 + i * G.step, zb = za + G.step;
    const row = (z) => {
      const d = deckAt(z), w0 = gunwaleAt(-1, d, z) - G.in, w1 = gunwaleAt(1, d, z) - G.in;
      const n = Math.ceil((w0 + w1) / G.across), out = [];
      for (let k = 0; k <= n; k++) out.push(vert([-w0 + (w0 + w1) * k / n, d, z], [0, 1, 0]));
      return out;
    };
    const a = row(za), b = row(zb);
    // The two rows may have a different number of points across her: walk
    // both from her starboard gunwale to her port one.
    let p = 0, q = 0;
    while (p < a.length - 1 || q < b.length - 1) {
      const xa = p < a.length - 1 ? strip.P[a[p + 1] * 3] : Infinity, xb = q < b.length - 1 ? strip.P[b[q + 1] * 3] : Infinity;
      const tri = xa <= xb ? [a[p], a[p + 1], b[q]] : [a[p], b[q + 1], b[q]];
      const [, ny] = faceNormal(strip, ...tri);
      strip.T.push(...(ny < 0 ? [tri[0], tri[2], tri[1]] : tri));
      strip.C.push(GREY);
      if (xa <= xb) p++; else q++;
    }
  }
  append(m, strip);
  console.log(`gunwale amidships: ${before - flakes - (m.T.length - strip.T.length) / 3} faces of it taken off, `
    + `and her side and deck edge drawn in afresh, ${nGunwale} triangles`);
  console.log(`deck amidships: ${flakes} faces of the old one, flakes and all, taken up, `
    + `and laid afresh, ${strip.T.length / 3 - nGunwale} triangles`);
}

// ---- the rest of her deck, made good where the cuts holed it ------------------
// Abaft No.3 the cuts left a pit in her deck on the port side with the sea at
// the bottom of it; round the open 25 mm abreast No.2 and on her forecastle
// lie the melted rings of the tubs the sculpt drew them in, and the holes they
// were cut out of; and her bow is joined on with a crack. Each of those is
// laid afresh as her deck amidships is: what of hers lies wholly within
// `flake` of her deck there comes off, and a flat deck is laid over it, `lap`
// past the hole all round, and turned down a hand into what is left of the
// old one round its edge, so no seam shows daylight -- either side of her
// (`both`) or across her. `y` is her deck there, flat; where it is not given
// the new deck follows her sheer (`deckAt`).
const DECK_PATCHES = [
  { name: 'abaft No.3', x: [-14.5, 14.5], z: [-92.6, -70.4], y: 7.71 },
  { name: 'abreast No.2', x: [5.0, 11.4], z: [39.3, 45.3], y: 6.19, both: true },
  { name: 'on her forecastle', x: [4.6, 11.4], z: [62.0, 68.6], y: 6.46, both: true },
  // And where her bow, drawn afresh, meets the rest of her: the two decks end
  // on the same line without sharing a point of it, and the sea shows through
  // the hair between them.
  { name: 'where her bow was drawn afresh', x: [-6.45, 6.45], z: [106.0, 108.7] },
];
{
  const D = { flake: 0.5, lap: 0.3, step: 0.5, across: 2.0, skirt: 0.15 };
  const patch = { P: [], N: [], T: [], C: [] };
  const vert = (p) => { patch.P.push(...p); patch.N.push(0, 1, 0); return patch.P.length / 3 - 1; };
  let taken = 0;
  for (const d of DECK_PATCHES) {
    for (const [x0, x1] of d.both ? [[-d.x[1], -d.x[0]], d.x] : [d.x]) {
      const at = (z) => d.y ?? deckAt(z) + 0.01;
      const inside = (v) => {
        const x = m.P[v * 3], y = m.P[v * 3 + 1], z = m.P[v * 3 + 2];
        return Math.abs(y - at(z)) < D.flake && x > x0 + D.lap && x < x1 - D.lap && z > d.z[0] + D.lap && z < d.z[1] - D.lap;
      };
      Object.assign(m, subMesh(m, (t) => {
        if (isSuper(t) || !inside(m.T[t * 3]) || !inside(m.T[t * 3 + 1]) || !inside(m.T[t * 3 + 2])) return true;
        taken++;
        return false;
      }));
      const nx = Math.ceil((x1 - x0) / D.across), nz = Math.ceil((d.z[1] - d.z[0]) / D.step);
      const grid = [];
      for (let i = 0; i <= nz; i++) {
        const row = [];
        const z = d.z[0] + (d.z[1] - d.z[0]) * i / nz;
        for (let k = 0; k <= nx; k++) row.push(vert([x0 + (x1 - x0) * k / nx, at(z), z]));
        grid.push(row);
      }
      // Its edge, turned down into the old deck: each side of it a strip
      // from the edge of the new deck to a hand under it, facing out of it.
      const skirt = (edge, out) => {
        for (let k = 0; k < edge.length - 1; k++) {
          const a = edge[k], b = edge[k + 1];
          const pa = patch.P.slice(a * 3, a * 3 + 3), pb = patch.P.slice(b * 3, b * 3 + 3);
          const a2 = vert([pa[0], pa[1] - D.skirt, pa[2]]), b2 = vert([pb[0], pb[1] - D.skirt, pb[2]]);
          const [nx0, , nz0] = faceNormal(patch, a, b, b2);
          patch.T.push(...(nx0 * out[0] + nz0 * out[1] < 0 ? [a, b2, b, a, a2, b2] : [a, b, b2, a, b2, a2]));
          patch.C.push(GREY, GREY);
        }
      };
      skirt(grid[0], [0, -1]);
      skirt(grid[nz], [0, 1]);
      skirt(grid.map((r) => r[0]), [-1, 0]);
      skirt(grid.map((r) => r[nx]), [1, 0]);
      for (let i = 0; i < nz; i++) {
        for (let k = 0; k < nx; k++) {
          const a = grid[i][k], b = grid[i][k + 1], c = grid[i + 1][k + 1], e = grid[i + 1][k];
          // Facing up: x across, z along, so (a, e, c) and (a, c, b) turn the right way.
          patch.T.push(a, e, c, a, c, b);
          patch.C.push(GREY, GREY);
        }
      }
    }
  }
  for (let t = 0; t < patch.T.length; t += 3) {
    if (faceNormal(patch, patch.T[t], patch.T[t + 1], patch.T[t + 2])[1] < -0.01) throw new Error('a deck patch faces down');
  }
  append(m, patch);
  console.log(`deck abaft No.3, abreast No.2, on her forecastle and at her bow: ${taken} faces of it taken up, `
    + `and laid afresh, ${patch.T.length / 3} triangles`);
}
for (let t = 0; t < m.C.length; t++) if (isSuper(t)) m.C[t] = GREY;

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
  // What the cuts pressed down into her deck lies in it as a scatter of
  // flakes at every angle, a hand either side of it: any of them that faces up
  // at all is planking.
  // But not the shelf laid back against her side amidships, which stands on
  // edge there now and is her side.
  const laidBack = (t) => {
    const [cx, cy, cz] = middle(m, t);
    const at = amidships(cz) && gunwaleAt(cx, cy, cz);
    return at && Math.abs(cx) > at - 0.3;
  };
  const pressed = (t) => {
    for (let j = 0; j < 3; j++) {
      const v = T[t * 3 + j] * 3;
      if (Math.abs(P[v + 1] - deckAt(P[v + 2])) > 0.25) return false;
    }
    return true;
  };
  for (let t = 0; t < nf; t++) {
    if (C[t] !== GREY) continue;
    const [nx, ny, nz] = faceNormal(m, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
    if (ny > 0 && pressed(t) && !(ny < 0.5 * Math.hypot(nx, ny, nz) && laidBack(t))) { C[t] = DECK; teak++; continue; }
    if (ny < 0.8 * Math.hypot(nx, ny, nz)) continue;
    const [, cy, cz] = middle(m, t);
    if (cy < DECK_FLOOR) continue;
    if (Math.abs(cy - deckAt(cz)) < 0.45) { C[t] = DECK; teak++; } else { C[t] = STEEL; steel++; }
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
