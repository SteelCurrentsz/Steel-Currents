// USS Enterprise, CV-6, as she looked in the middle of the Pacific war.
//
// The Big E: second of the three Yorktowns, laid down at Newport News in 1934,
// at Midway, the Eastern Solomons, Santa Cruz and Guadalcanal, and by the end
// of 1942 the only American carrier still in the fight. This is her in that
// fit -- the 1942 refit, with the 1.1-inch quads gone for 40 mm Bofors and
// Oerlikon galleries down both deck edges.
//
// Metres throughout, bow to +Z, up to +Y -- so starboard is -X, which is where
// her island goes. Waterline at y = 0. Her real
// figures, which everything below is measured off:
//
//   length overall        251.4 m      flight deck        244 x 26 m
//   waterline beam         25.4 m      extreme beam        34.8 m
//   draft                   7.9 m      freeboard, hangar   ~14 m
//   three centreline elevators, nine arresting wires, three barriers
//   eight 5"/38 in four sponsons, four quad 40 mm, thirty 20 mm
//   air group: 27 fighters, 38 dive bombers, 15 torpedo bombers
//
// Nothing here is a texture. Every plate, gallery, tub, boat, wire and aerial
// is geometry, because the ship is looked at from a masthead at fifty metres in
// the spectator view and a painted-on detail is a smear at that range.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic } from './merge.js';

// ------------------------------------------------------------- materials --

const M = {
  // Measure 21, navy blue: what she wore from mid-1942.
  hull: new THREE.MeshLambertMaterial({ color: 0x515d6b }),
  hullDark: new THREE.MeshLambertMaterial({ color: 0x424d59 }),
  boot: new THREE.MeshLambertMaterial({ color: 0x1a1e23 }),
  antifoul: new THREE.MeshLambertMaterial({ color: 0x6d2b23 }),
  // Douglas fir over the steel deck, weathered grey-brown.
  deck: new THREE.MeshLambertMaterial({ color: 0x7d7362 }),
  deckDark: new THREE.MeshLambertMaterial({ color: 0x6d6455 }),
  steel: new THREE.MeshLambertMaterial({ color: 0x5d6874 }),
  steelDark: new THREE.MeshLambertMaterial({ color: 0x46505b }),
  bright: new THREE.MeshLambertMaterial({ color: 0x7f8993 }),
  mark: new THREE.MeshLambertMaterial({ color: 0xd6d2c4 }),
  gun: new THREE.MeshLambertMaterial({ color: 0x525d68 }),
  gunDark: new THREE.MeshLambertMaterial({ color: 0x2b323a }),
  glass: new THREE.MeshLambertMaterial({ color: 0x1b2229 }),
  canvas: new THREE.MeshLambertMaterial({ color: 0x6e6a5c }),
  raft: new THREE.MeshLambertMaterial({ color: 0x2a2f34 }),
  // Inside the hangar, seen through the side openings: almost black.
  cave: new THREE.MeshLambertMaterial({ color: 0x171c21 }),
  curtain: new THREE.MeshLambertMaterial({ color: 0x3b444e }),
  // Deck blue 20-B: what the open steel decks were painted under Measure 21.
  deckBlue: new THREE.MeshLambertMaterial({ color: 0x39434f }),
  // Signal bunting, which is the one place on a warship in Measure 21 where
  // there is any colour at all -- and it is what you see first on her yardarm.
  flagRed: new THREE.MeshLambertMaterial({ color: 0xb0392f }),
  flagBlue: new THREE.MeshLambertMaterial({ color: 0x2f5c92 }),
  flagGold: new THREE.MeshLambertMaterial({ color: 0xd8b452 }),
  wire: new THREE.MeshLambertMaterial({ color: 0x232a31 }),
  // Blue-grey over light grey: the 1942 scheme her aircraft wore.
  planeTop: new THREE.MeshLambertMaterial({ color: 0x33475e }),
  planeBottom: new THREE.MeshLambertMaterial({ color: 0x9aa4ad }),
  prop: new THREE.MeshLambertMaterial({ color: 0x24282c }),
  star: new THREE.MeshLambertMaterial({ color: 0xd9dde2 }),
};

// ------------------------------------------------------------ primitives --

function box(g, m, w, h, d, x, y, z, ry = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.rotation.y = ry;
  g.add(o);
  return o;
}

function cyl(g, m, rt, rb, h, x, y, z, seg = 10) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  o.position.set(x, y, z);
  g.add(o);
  return o;
}

/** A horizontal tube: a boom, a rail, a wire, a gun barrel lying fore and aft. */
function tubeZ(g, m, r, len, x, y, z, seg = 8) {
  const o = cyl(g, m, r, r, len, x, y, z, seg);
  o.rotation.x = Math.PI / 2;
  return o;
}

function tubeX(g, m, r, len, x, y, z, seg = 8) {
  const o = cyl(g, m, r, r, len, x, y, z, seg);
  o.rotation.z = Math.PI / 2;
  return o;
}

/**
 * A railing: stanchions and three courses of wire, which is what the deck edge
 * of a carrier is made of for most of its length.
 */
function railing(g, pts, h = 1.1, courses = 3) {
  for (let i = 0; i < pts.length; i++) {
    const [x, y, z] = pts[i];
    box(g, M.steel, 0.06, h, 0.06, x, y + h / 2, z);
    if (i === 0) continue;
    const [px, py, pz] = pts[i - 1];
    const dx = x - px; const dz = z - pz; const dy = y - py;
    const len = Math.hypot(dx, dz, dy);
    for (let c = 1; c <= courses; c++) {
      const ry = (h * c) / courses;
      const rail = box(g, M.steel, 0.04, 0.04, len,
        (x + px) / 2, (y + py) / 2 + ry, (z + pz) / 2);
      rail.rotation.y = Math.atan2(dx, dz);
      rail.rotation.x = -Math.asin(dy / Math.max(0.001, len));
    }
  }
}

/** A gun tub: a ring of plating with a deck in it, hung off the ship's side. */
function tub(g, r, depth, x, y, z, seg = 14) {
  cyl(g, M.steel, r, r * 0.92, 0.12, x, y, z, seg);
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const w = (2 * Math.PI * r) / seg + 0.1;
    box(g, M.steel, w, depth, 0.14, x + Math.sin(a) * r, y + depth / 2, z + Math.cos(a) * r, a);
  }
}

// ------------------------------------------------------------------ hull --

/**
 * The hull: a cruiser bow, a long parallel body, and a transom.
 *
 * Built as a ladder of stations rather than a box, because everything hung on
 * her -- sponsons, galleries, boat davits, the deck-edge catwalks -- is placed
 * off the shell at that station, and a box would put them all in a straight
 * line down a flat side.
 */
const LOA = 251.4;
const WLB = 25.4;              // waterline beam
const FDW = 26.0;              // flight deck width
const FDL = 244.0;             // flight deck length
const DRAFT = 7.9;
// A Yorktown floats a good deal lower than her flight deck suggests: the shell
// plating stops at the hangar deck, about seven metres up, and the flight deck
// stands another nine and a half above that on the gallery-deck structure. All
// the daylight between the two is the open hangar side.
const HANGAR = 7.4;            // hangar deck above the waterline
const HTOP = 12.8;             // hangar overhead
const GALLERY = 13.4;          // gallery deck, slung under the flight deck
const FD = 17.0;               // flight deck above the waterline
// Where the hangar begins and ends, as stations. Forward of it is the
// forecastle, abaft it the quarterdeck: both open decks under the overhang.
const HGR_F = 0.64;
const HGR_A = -0.82;

/**
 * The lines.
 *
 * A hull is not a box with a pointed end: it is a set of curves, and every one
 * of them does a job. The entrance forward is hollow, so she pushes the water
 * aside instead of shouldering into it. The midbody is nearly parallel with a
 * touch of swell. The run aft narrows into a transom about a third of the beam.
 * Under all of it the sections are round-bilged -- a flat of bottom, a quarter
 * turn out to the topsides -- and the topsides flare forward and fall in a
 * little aft. The keel is straight for two-thirds of her and rises at both ends,
 * cut away under the forefoot and tucked up into the counter.
 *
 * All four of those are separate functions of the station, and the shell is
 * lofted through them. That is what makes it a hull rather than a slab.
 */

/** Half-beam of the shell at the waterline, station -1 (transom) to +1 (stem). */
function halfBeam(t) {
  const b = WLB / 2;
  if (t > 0.42) {
    // The entrance: hollow, so the waterlines are concave before they meet the
    // stem rather than running straight into a wedge.
    // Clamped: a station exactly at the stem puts k a hair over one in floating
    // point, and a negative number to a fractional power is not a number.
    const k = Math.min(1, (t - 0.42) / 0.58);
    return b * Math.max(0.007, Math.pow(Math.max(0, 1 - k * k), 0.6));
  }
  if (t < -0.62) {
    // The run, into a transom a third of the beam across.
    const k = (-t - 0.62) / 0.38;
    return b * (1 - 0.66 * Math.pow(k, 1.45));
  }
  // Parallel midbody, with the small swell amidships that every hull has.
  return b * (1 - 0.035 * t * t);
}

/** The keel line: straight amidships, rising at both ends. */
function keelY(t) {
  if (t > 0.70) {
    // Cutaway forefoot: the stem is raked, so the keel leaves the water well
    // aft of where the bow does.
    const k = Math.min(1, (t - 0.70) / 0.30);
    return -DRAFT * Math.max(0, 1 - Math.pow(Math.max(0, k), 1.45));
  }
  if (t < -0.76) {
    // The tuck up into the counter, over the screws.
    const k = (-t - 0.76) / 0.24;
    return -DRAFT * (1 - 0.62 * Math.pow(k, 1.5));
  }
  return -DRAFT;
}

/** How high the sheer stands: the hangar deck, rising forward. */
function sheer(t) {
  if (t > 0.5) return HANGAR + 5.2 * Math.pow((t - 0.5) / 0.5, 1.7);
  if (t < -0.85) return HANGAR + 1.1 * Math.pow((-t - 0.85) / 0.15, 1.5);
  return HANGAR + 0.4 * t * t;
}

/** Flare at the sheer: outward forward, a little tumblehome aft. */
function flare(t) {
  if (t > 0.30) return 0.03 + 0.34 * Math.pow((t - 0.30) / 0.70, 1.6);
  if (t < -0.55) return -0.04 * Math.min(1, (-t - 0.55) / 0.35);
  return 0.03;
}

/**
 * Where a station stands fore and aft, at a given height.
 *
 * Neither end of her is plumb. The stem rakes forward, so the forecastle stands
 * a couple of metres ahead of the forefoot and the cutwater is a curve rather
 * than a wall; the counter rakes the other way over the screws. Nothing about a
 * hull is a straight extrusion, and this is the function that says so.
 */
const STEM = 7.2;      // how far the forecastle stands ahead of the forefoot
const COUNTER = 3.2;   // and how far the transom's head stands abaft its foot

/**
 * The stem profile: not a rake, a curve.
 *
 * A straight raked stem is a line from the forefoot to the forecastle and it
 * looks like one. Hers sweeps: nearly upright where it leaves the water, then
 * curving further and further forward as it rises, so the forecastle stands
 * seven metres ahead of the point where the keel comes up. That curve is the
 * single line that says Yorktown from a mile off, and the flare over it is what
 * throws the sea aside when she is making thirty knots into a head swell.
 */
function stemAt(y) { return STEM * Math.pow(Math.max(0, y) / 13.2, 1.45); }
/** The counter: the same idea at the other end, gentler, over the screws. */
function counterAt(y) { return COUNTER * Math.pow(Math.max(0, y) / 9.0, 1.25); }
/** Ease a curve in without leaving a crease across the middle body. */
function smooth(k) { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); }

function zAt(t, y) {
  let z = (t * LOA) / 2;
  // The stations take the profile's curve, and are pulled back as they take it
  // so the stem head -- her extreme point, which is what length overall is
  // measured to -- still lands where it should.
  if (t > 0.46) z += smooth((t - 0.46) / 0.54) * (stemAt(y) - STEM);
  else if (t < -0.70) z -= smooth((-t - 0.70) / 0.30) * (counterAt(y) - COUNTER);
  return z;
}

/** Where the bilge turn finishes, as a fraction of the section's height. */
const BILGE = 0.30;

// Where the paint changes. Deep, because a carrier's draft moves a long way
// between full bunkers and empty and because she is looked at from close aboard
// in a seaway: a shallow boot topping puts bottom paint above the water on
// every other wave.
const BOOT_LO = -2.2;
const BOOT_HI = 0.7;

/** The three strakes, clamped to a station's keel so none runs below the hull. */
function strakes(t) {
  const kb = keelY(t);
  const lo = Math.max(kb, BOOT_LO);
  const hi = Math.max(kb, BOOT_HI);
  return [[kb, lo, M.antifoul], [lo, hi, M.boot], [hi, sheer(t), M.hull]];
}

/**
 * The half-breadth of the shell at a station and a height.
 *
 * Below the bilge it is a quarter of an ellipse out from the keel; above it the
 * topside runs up nearly plumb, opening out by the flare. This one function is
 * the hull's whole shape, and the three paint strakes are lofted through it at
 * their own heights so they lie on the same surface.
 */
function shellAt(t, y) {
  const hb = halfBeam(t);
  const kb = keelY(t);
  const sh = sheer(t);
  if (y <= kb) return 0;
  if (y >= sh) return hb * (1 + flare(t));
  const v = (y - kb) / (sh - kb);
  if (v < BILGE) {
    const k = v / BILGE;
    return hb * Math.sqrt(Math.max(0, 1 - (1 - k) * (1 - k)));
  }
  const k = (v - BILGE) / (1 - BILGE);
  return hb * (1 + flare(t) * k * k);
}

/**
 * Loft one strake of paint through the lines.
 *
 * Both shells and, where asked, the surface that closes the top of the band --
 * which for the topside strake is the hangar deck.
 */
function loftBand(g, m, lo, hi, opts = {}) {
  const { N = 84, M = 9, cap = false } = opts;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const t = -1 + (2 * i) / N;
    const y0 = lo(t);
    const y1 = hi(t);
    for (let j = 0; j <= M; j++) {
      const y = y0 + ((y1 - y0) * j) / M;
      const w = shellAt(t, y);
      pos.push(-w, y, zAt(t, y));
    }
    for (let j = M; j >= 0; j--) {
      const y = y0 + ((y1 - y0) * j) / M;
      const w = shellAt(t, y);
      pos.push(w, y, zAt(t, y));
    }
  }
  const row = (M + 1) * 2;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < row - 1; j++) {
      const a = i * row + j;
      const b = (i + 1) * row + j;
      // Wound so the shell looks outboard. The ring runs up the port side and
      // back down the starboard, so getting this the wrong way round turns the
      // whole hull inside out at once: both sides get culled, and what you see
      // of her is the inside of the far side showing through the near one --
      // which reads as a ship with only one side to her.
      idx.push(a, b + 1, a + 1, a, b, b + 1);
    }
  }
  if (cap) {
    // The deck: a fan across the section at every station, port to starboard.
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const t = -1 + (2 * i) / N;
      const y = hi(t);
      const w = shellAt(t, y);
      pos.push(-w, y, zAt(t, y));
      pos.push(w, y, zAt(t, y));
    }
    for (let i = 0; i < N; i++) {
      const a = base + i * 2;
      // Wound so the deck faces up. Get this the other way round and the
      // forecastle, the hangar deck and the quarterdeck are all invisible from
      // above, and you see straight through the ship to the sea beyond.
      idx.push(a, a + 3, a + 1, a, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, m));
}

/**
 * Close one end of the shell, in paint.
 *
 * `out` is +1 at the stem and -1 at the transom, and it decides the winding, so
 * whichever end this is the surface looks out of the ship rather than into it.
 */
function capEnd(g, t, out) {
  for (const [lo, hi, mat] of strakes(t)) {
    if (hi - lo < 0.01) continue;
    const pos = [];
    const idx = [];
    const S = 8;
    for (let j = 0; j <= S; j++) {
      const y = lo + ((hi - lo) * j) / S;
      const w = shellAt(t, y);
      pos.push(-w, y, zAt(t, y), w, y, zAt(t, y));
    }
    for (let j = 0; j < S; j++) {
      const a = j * 2;
      if (out > 0) idx.push(a, a + 3, a + 2, a, a + 1, a + 3);
      else idx.push(a, a + 2, a + 3, a, a + 3, a + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, mat));
  }
}

function buildHull(g) {
  // Three strakes on one surface: antifouling from the keel to a foot below
  // the waterline, the boot topping across it, and the topside above. A paint
  // line is a waterline, not a line parallel to the keel -- so where the keel
  // rises above a strake, at the forefoot and under the counter, that strake
  // simply runs out. Clamping the bands to each other is what keeps the bottom
  // paint in the water where it belongs.
  const atLeast = (v) => (t) => Math.max(keelY(t), v);
  loftBand(g, M.antifoul, keelY, atLeast(BOOT_LO), { M: 7 });
  loftBand(g, M.boot, atLeast(BOOT_LO), atLeast(BOOT_HI), { M: 2 });
  loftBand(g, M.hull, atLeast(BOOT_HI), sheer, { M: 7, cap: true });

  // Both ends closed, and closed in the same three strakes the sides carry.
  //
  // The shell is lofted as a ring from station to station, which leaves the
  // first and last rings as open edges: the transom aft and, at the stem, a
  // slot a third of a metre wide running the whole height of the bow. The
  // transom used to be capped with one plate of topside grey -- no boot
  // topping, no bottom paint, a different ship below the waterline from the one
  // either side of it -- and the stem was not capped at all.
  capEnd(g, -1, -1);
  capEnd(g, 1, 1);
  // The stem bar itself: a rounded cutwater laid up the profile, painted at
  // each height with whatever the shell beside it is painted.
  for (let i = 0; i < 26; i++) {
    const y0 = keelY(1) + ((sheer(1) - keelY(1)) * i) / 26;
    const y1 = keelY(1) + ((sheer(1) - keelY(1)) * (i + 1)) / 26;
    const y = (y0 + y1) / 2;
    const band = strakes(1).find(([lo, hi]) => y >= lo && y < hi);
    const dz = zAt(1, y1) - zAt(1, y0);
    const bar = cyl(g, band ? band[2] : M.hull, 0.3, 0.3,
      Math.hypot(y1 - y0, dz) + 0.42, 0, y, zAt(1, y) + 0.05, 10);
    bar.rotation.x = -Math.atan2(dz, y1 - y0);
  }

  // The knuckle: a rubbing strake along the sheer, which is the line that gives
  // a hull its length when you look down it.
  for (let i = 0; i < 60; i++) {
    const t = -1 + (2 * i) / 60;
    const t2 = -1 + (2 * (i + 1)) / 60;
    const y = (sheer(t) + sheer(t2)) / 2 - 0.5;
    const z = (zAt(t, y) + zAt(t2, y)) / 2;
    const w = (shellAt(t, y) + shellAt(t2, y)) / 2;
    const len = Math.abs(zAt(t2, y) - zAt(t, y)) + 0.3;
    for (const s of [-1, 1]) {
      const b = box(g, M.hullDark, 0.34, 0.4, len, s * (w + 0.1), y, z);
      b.rotation.x = -(sheer(t2) - sheer(t)) / len * 0.5;
    }
  }

  // Portholes: two rows down the topside, in the parallel body where the
  // accommodation is. Small, and unmistakable at any range.
  for (const row of [HANGAR - 2.4, HANGAR - 4.6]) {
    for (let i = 0; i < 34; i++) {
      const t = -0.62 + (i / 33) * 1.1;
      const z = zAt(t, row);
      const w = shellAt(t, row);
      for (const s of [-1, 1]) {
        cyl(g, M.steelDark, 0.28, 0.28, 0.16, s * (w + 0.02), row, z, 8)
          .rotation.z = Math.PI / 2;
      }
    }
  }

  // Bilge keels, laid along the turn of the bilge where they belong.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 22; i++) {
      const t = -0.42 + (i / 21) * 0.84;
      const y = keelY(t) + (sheer(t) - keelY(t)) * BILGE * 0.62;
      const z = zAt(t, y);
      const w = shellAt(t, y);
      const bk = box(g, M.antifoul, 0.3, 1.3, (0.84 * LOA) / 42 + 0.4, s * (w + 0.5), y, z);
      bk.rotation.z = s * 0.9;
    }
  }

  // Four shafts on their bossings, A-brackets, screws and twin rudders.
  for (const s of [-1, 1]) {
    for (const o of [0.34, 0.72]) {
      const bx = s * WLB * o * 0.5;
      const sh = tubeZ(g, M.antifoul, 0.6, 26, bx, -DRAFT * 0.64, -LOA * 0.34, 10);
      sh.rotation.x = Math.PI / 2 + 0.055;
      // The A-bracket carrying the tail shaft.
      const arm = box(g, M.antifoul, 0.34, 3.0, 0.8, bx, -DRAFT * 0.5, -LOA * 0.415);
      arm.rotation.z = -s * 0.35;
      const boss = cyl(g, M.antifoul, 0.75, 0.85, 2.0, bx, -DRAFT * 0.66, -LOA * 0.40, 12);
      boss.rotation.x = Math.PI / 2;
      // Screw: hub and four blades.
      cyl(g, M.hullDark, 0.4, 0.4, 0.7, bx, -DRAFT * 0.68, -LOA * 0.435, 10)
        .rotation.x = Math.PI / 2;
      for (let k = 0; k < 4; k++) {
        const bl = box(g, M.hullDark, 0.3, 3.0, 0.14, bx, -DRAFT * 0.68, -LOA * 0.435);
        bl.rotation.z = (k / 4) * Math.PI * 2 + 0.3;
        bl.rotation.y = 0.35;
      }
    }
    box(g, M.antifoul, 0.42, 4.6, 3.6, s * 3.4, -DRAFT * 0.52, -LOA * 0.462);
  }

  // The bow: hawse pipes with the chain leading through them, and the anchors
  // stowed home against the shell.
  for (const s of [-1, 1]) {
    const t = 0.855;
    const y = sheer(t) - 2.6;
    const w = shellAt(t, y);
    const hz = zAt(t, y);
    cyl(g, M.steelDark, 0.6, 0.6, 1.6, s * (w - 0.2), y, hz, 10)
      .rotation.z = Math.PI / 2;
    const anc = box(g, M.steelDark, 0.4, 2.4, 1.6, s * (w + 0.2), y - 0.3, hz);
    anc.rotation.z = s * 0.09;
    box(g, M.steelDark, 0.3, 0.5, 2.4, s * (w + 0.2), y + 0.9, hz);
    // The chain running aft along the forecastle to the wildcat.
    for (let i = 0; i < 9; i++) {
      const tz = t - 0.011 * i;
      box(g, M.wire, 0.22, 0.22, 0.6, s * 2.2, sheer(tz) + 0.25, zAt(tz, sheer(tz)));
    }
  }
  // Jackstaff at the stem, ensign staff at the transom.
  box(g, M.steel, 0.14, 3.4, 0.14, 0, sheer(0.99) + 1.7, zAt(0.99, sheer(0.99)));
  box(g, M.steel, 0.14, 3.0, 0.14, 0, sheer(-0.99) + 1.5, zAt(-0.99, sheer(-0.99)));
}

// ------------------------------------------------ hangar and gallery decks --

/** Half-breadth of the ship's side at the sheer, where the hangar stands on it. */
function sideX(t) { return shellAt(t, sheer(t)); }

/**
 * The hangar and the gallery deck: the two storeys between the hull and the
 * flight deck.
 *
 * This is the part of a Yorktown that people get wrong. The flight deck does
 * not sit on stilts with daylight under it: the hangar sides are plated the
 * whole length of the hangar, broken by a run of large openings closed with
 * roller curtains, and above them the gallery deck is plated again right up to
 * the deck edge. What you see between the waterline and the flight deck is a
 * wall with two rows of holes in it, not a trellis -- and the openings are what
 * gave her crew light and air and let them run engines on the hangar deck.
 */
function hangarSides(g) {
  const BAYS = 26;
  const mid = (HANGAR + HTOP) / 2;
  for (let i = 0; i < BAYS; i++) {
    const t0 = HGR_A + (HGR_F - HGR_A) * (i / BAYS);
    const t1 = HGR_A + (HGR_F - HGR_A) * ((i + 1) / BAYS);
    const tc = (t0 + t1) / 2;
    const z0 = zAt(t0, HANGAR);
    const z1 = zAt(t1, HANGAR);
    const len = z1 - z0;
    const zc = (z0 + z1) / 2;
    const x = sideX(tc);
    // Three bays in eight stand open; the rest carry their curtain rolled down.
    const open = i % 4 === 1;
    for (const s of [-1, 1]) {
      // Sill and header: continuous plating top and bottom of the opening.
      box(g, M.hull, 0.34, 1.0, len + 0.2, s * x, HANGAR + 0.45, zc);
      box(g, M.hull, 0.34, 1.0, len + 0.2, s * x, HTOP - 0.5, zc);
      // The frame between one bay and the next.
      box(g, M.hull, 0.38, HTOP - HANGAR, 0.85, s * x, mid, z0);
      // The opening itself: either the dark of the hangar or a curtain in it.
      box(g, open ? M.cave : M.curtain, 0.2, HTOP - HANGAR - 2.0,
        len - 1.0, s * (x - 0.16), mid + 0.05, zc);
      if (!open) {
        // The roll the curtain winds onto, under the header.
        const r = cyl(g, M.steelDark, 0.24, 0.24, len - 1.2, s * (x - 0.3), HTOP - 1.4, zc, 8);
        r.rotation.x = Math.PI / 2;
      }
    }
    // The hangar overhead, seen from outside as the strip above the openings.
    box(g, M.steelDark, 2 * x - 0.4, 0.3, len, 0, HTOP + 0.15, zc);
  }

  // Bulkheads closing the hangar fore and aft, with the big doors in them.
  for (const t of [HGR_F, HGR_A]) {
    const x = sideX(t);
    const z = zAt(t, HANGAR);
    box(g, M.hull, 2 * x, HTOP - HANGAR, 0.5, 0, mid, z);
    box(g, M.steelDark, 9.0, 4.4, 0.24, 0, HANGAR + 2.4, z + (t > 0 ? -0.3 : 0.3));
    for (const s of [-1, 1]) {
      box(g, M.steelDark, 0.3, 2.2, 0.2, s * 5.6, HANGAR + 1.3, z + (t > 0 ? -0.3 : 0.3));
    }
  }

  // The gallery deck: a plated storey carrying the ready rooms, the guns' crews
  // and the twenty-millimetre galleries, right out to the deck edge.
  // It follows the flight deck's own outline, drawing in at both ends with it.
  // Run it out square and its plating stands proud of the deck edge where the
  // deck has tapered away, and the pillars under the after overhang come out as
  // a bare frame hanging in the air abaft the round-down.
  const z0 = fdEndA(0) + 3;
  const z1 = fdEndF(0) - 3;
  const SEG = 34;
  for (let i = 0; i < SEG; i++) {
    const za = z0 + ((z1 - z0) * i) / SEG;
    const zb = z0 + ((z1 - z0) * (i + 1)) / SEG;
    const zc = (za + zb) / 2;
    const len = zb - za;
    const GW = fdHalf(zc) - 0.35;
    const ang = Math.atan2(fdHalf(zb) - fdHalf(za), len);
    // The deck under it, and the side plating up to the flight deck.
    box(g, M.steelDark, 2 * GW, 0.32, len + 0.1, 0, GALLERY, zc);
    for (const s of [-1, 1]) {
      box(g, M.hull, 0.3, FD - GALLERY - 0.85, len + 0.1, s * GW,
        (GALLERY + FD - 0.85) / 2 + 0.15, zc, s * ang);
      // Scuttles down the gallery, and a watertight door every fifth frame.
      if (i % 2 === 0) {
        cyl(g, M.glass, 0.3, 0.3, 0.14, s * (GW + 0.16), GALLERY + 1.5, zc, 8)
          .rotation.z = Math.PI / 2;
      }
      if (i % 5 === 2) {
        box(g, M.steelDark, 0.14, 1.9, 0.85, s * (GW + 0.18), GALLERY + 1.05, zc);
      }
    }
  }

  // Where the gallery deck runs past the ends of the hangar it stands on its own
  // legs, down to the forecastle and the quarterdeck below.
  for (const [ta, tb] of [[HGR_F, 0.955], [-0.955, HGR_A]]) {
    for (let i = 0; i <= 4; i++) {
      const t = ta + (tb - ta) * (i / 4);
      const y = sheer(t);
      const z = zAt(t, y);
      const w = Math.min(fdHalf(z) - 1.2, sideX(t) - 0.4);
      if (w <= 1) continue;
      for (const s of [-1, 1]) {
        box(g, M.steelDark, 0.44, GALLERY - y, 0.44, s * w, (GALLERY + y) / 2, z);
      }
      box(g, M.steelDark, 2 * w, 0.34, 0.44, 0, GALLERY - 0.3, z);
    }
  }
}

// --------------------------------------------- forecastle and quarterdeck --

/**
 * The open decks at either end, under the overhang of the flight deck.
 *
 * Forward: the ground tackle -- windlass, wildcats, chain pipes, bitts and a
 * breakwater to keep a head sea out of it. Aft: the capstans and the towing
 * fittings. Neither has anything to do with flying, and both are what makes the
 * ends of her read as a ship rather than as the ends of a runway.
 */
function groundTackle(g) {
  // Deck blue over the open decks at both ends. The shell plating is lofted in
  // one piece and its cap doubles as the deck, so the paint that belongs on a
  // horizontal surface goes on as a thin plate over the top of it -- otherwise
  // the forecastle comes out the colour of the ship's side, which it never was.
  for (const [ta, tb] of [[HGR_F, 0.965], [-0.965, HGR_A]]) {
    const N = 12;
    for (let i = 0; i < N; i++) {
      const t0 = ta + (tb - ta) * (i / N);
      const t1 = ta + (tb - ta) * ((i + 1) / N);
      const tc = (t0 + t1) / 2;
      const y0 = sheer(t0);
      const y1 = sheer(t1);
      const z0 = zAt(t0, y0);
      const z1 = zAt(t1, y1);
      const w = shellAt(tc, sheer(tc)) - 0.12;
      if (w <= 0.2) continue;
      const d = box(g, M.deckBlue, 2 * w, 0.12, Math.hypot(z1 - z0, y1 - y0) + 0.1,
        0, (y0 + y1) / 2 + 0.09, (z0 + z1) / 2);
      d.rotation.x = -Math.atan2(y1 - y0, z1 - z0);
    }
  }

  // The breakwater, angled to throw the water outboard.
  {
    const t = 0.74;
    const y = sheer(t);
    const z = zAt(t, y);
    const w = sideX(t) - 1.0;
    for (let i = 0; i < 7; i++) {
      const x = -w + (2 * w * (i + 0.5)) / 7;
      const b = box(g, M.hull, (2 * w) / 7 - 0.15, 2.0, 0.35, x, y + 1.0, z);
      b.rotation.x = -0.22;
    }
  }
  // The windlass amidships on the forecastle, a wildcat either side of it.
  {
    const t = 0.80;
    const y = sheer(t);
    const z = zAt(t, y);
    box(g, M.steelDark, 5.2, 1.5, 2.6, 0, y + 0.75, z);
    for (const s of [-1, 1]) {
      const w = cyl(g, M.steel, 0.85, 0.85, 1.0, s * 3.3, y + 0.9, z, 12);
      w.rotation.z = Math.PI / 2;
      // The chain pipe it feeds, down into the locker.
      cyl(g, M.steelDark, 0.42, 0.42, 0.5, s * 2.2, y + 0.25, z - 3.4, 10);
    }
  }
  // Bitts, chocks and fairleads down both sides of both open decks.
  for (const [ta, tb, n] of [[0.70, 0.93, 5], [-0.955, HGR_A - 0.01, 3]]) {
    for (let i = 0; i < n; i++) {
      const t = ta + ((tb - ta) * (i + 0.5)) / n;
      const y = sheer(t);
      const z = zAt(t, y);
      const x = sideX(t) - 1.1;
      if (x < 1) continue;
      for (const s of [-1, 1]) {
        for (const dz of [-0.7, 0.7]) {
          cyl(g, M.steelDark, 0.24, 0.28, 1.0, s * x, y + 0.5, z + dz, 8);
        }
        box(g, M.steelDark, 0.9, 0.7, 1.9, s * (x + 0.7), y + 0.35, z);
      }
    }
  }
  // Two capstans on the quarterdeck, and the after towing bitts between them.
  {
    const t = -0.90;
    const y = sheer(t);
    const z = zAt(t, y);
    for (const s of [-1, 1]) cyl(g, M.steel, 0.7, 0.85, 1.1, s * 3.0, y + 0.55, z, 12);
    box(g, M.steelDark, 3.0, 0.9, 1.4, 0, y + 0.45, z - 3.4);
  }
  // Guardrails round the open ends.
  for (const [ta, tb] of [[0.665, 0.94], [-0.945, HGR_A - 0.005]]) {
    for (const s of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = ta + (tb - ta) * (i / 8);
        const y = sheer(t);
        pts.push([s * (sideX(t) - 0.25), y, zAt(t, y)]);
      }
      railing(g, pts, 1.1, 3);
    }
  }
}

// --------------------------------------------------------- the flight deck --

/** Where the deck's midpoint sits: a shade forward of the ship's own midships. */
const FD_MID = LOA * 0.012;
/** Deck station, -1 at the round-down to +1 at the forward edge. */
function fdU(z) { return (z - FD_MID) / (FDL / 2); }
const FD_TAPER_F = 0.42;       // how much width the bow end loses
const FD_TAPER_A = 0.30;       // and the after end

/**
 * Half-width of the flight deck at a station.
 *
 * The deck is not a rectangle. It carries its full breadth over the middle
 * two-thirds and then draws in at both ends -- sharply forward, where the bow
 * has no beam to stand on, more gently aft round the round-down. That taper is
 * the shape you recognise a Yorktown by from the air, and everything laid on
 * the deck -- coaming, catwalks, gun galleries -- has to follow it.
 */
function fdHalf(z) {
  const HW = FDW / 2;
  const u = fdU(z);
  if (u > 0.78) { const k = Math.min(1, (u - 0.78) / 0.22); return HW * (1 - FD_TAPER_F * k * k); }
  if (u < -0.80) { const k = Math.min(1, (-u - 0.80) / 0.20); return HW * (1 - FD_TAPER_A * k * k); }
  return HW;
}

/** The other way about: how far forward, and aft, the deck reaches at a breadth. */
function fdEndF(x) {
  const HW = FDW / 2;
  const r = Math.min(1, Math.abs(x) / HW);
  const k = Math.min(1, Math.sqrt(Math.max(0, (1 - r) / FD_TAPER_F)));
  return (0.78 + 0.22 * k) * (FDL / 2) + FD_MID;
}
function fdEndA(x) {
  const HW = FDW / 2;
  const r = Math.min(1, Math.abs(x) / HW);
  const k = Math.min(1, Math.sqrt(Math.max(0, (1 - r) / FD_TAPER_A)));
  return -(0.80 + 0.20 * k) * (FDL / 2) + FD_MID;
}

/**
 * The flight deck: planked, marked out, and standing on the gallery deck.
 *
 * A Yorktown's flight deck is not part of the hull -- it is a structure built
 * on top of it, open at the sides, with the hangar underneath and daylight
 * between the two. That is why the deck edge has catwalks slung under it and
 * why the bow is open: it is the one thing that makes an American carrier of
 * this generation look like what it is.
 */
function flightDeck(g) {
  const HW = FDW / 2;
  // The deck itself, planked fore and aft in Douglas fir. Every plank is cut to
  // the deck's outline, so the ends taper instead of running square off.
  const planks = 42;
  for (let i = 0; i < planks; i++) {
    const x = -HW + (FDW * (i + 0.5)) / planks;
    const zf = fdEndF(Math.abs(x) + FDW / planks / 2);
    const za = fdEndA(Math.abs(x) + FDW / planks / 2);
    box(g, i % 3 === 1 ? M.deckDark : M.deck, FDW / planks - 0.04, 0.34,
      zf - za, x, FD, (zf + za) / 2);
  }
  // Deck edge coaming, following the outline round both ends.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 46; i++) {
      const u0 = -1 + (2 * i) / 46;
      const u1 = -1 + (2 * (i + 1)) / 46;
      const z0 = u0 * (FDL / 2) + FD_MID;
      const z1 = u1 * (FDL / 2) + FD_MID;
      const x0 = fdHalf(z0);
      const x1 = fdHalf(z1);
      const len = Math.hypot(z1 - z0, x1 - x0);
      const c = box(g, M.steelDark, 0.3, 0.5, len + 0.1,
        (s * (x0 + x1)) / 2, FD + 0.1, (z0 + z1) / 2);
      c.rotation.y = s * Math.atan2(x1 - x0, z1 - z0);
    }
  }
  // The transverse edges at either end, closing the outline.
  for (const [z, w] of [[fdEndF(0), fdHalf(fdEndF(0) - 0.1)],
    [fdEndA(0), fdHalf(fdEndA(0) + 0.1)]]) {
    box(g, M.steelDark, 2 * w, 0.5, 0.3, 0, FD + 0.1, z);
  }
  // The round-down aft that stopped a burble over the ramp: the deck falls away
  // over the last few metres.
  const rampW = 2 * fdHalf(fdEndA(0) + 5);
  const ramp = box(g, M.deck, rampW, 0.34, 9, 0, FD - 0.5, fdEndA(0) + 4);
  ramp.rotation.x = 0.13;

  // The supporting structure under it: transverse frames and stanchions down to
  // the hangar roof, which is what the daylight between the decks shows.
  for (let i = -13; i <= 13; i++) {
    const z = (i / 13) * (FDL / 2 - 6) + LOA * 0.012;
    const t = (z / (LOA / 2));
    const w = Math.min(2 * fdHalf(z), halfBeam(t) * 2 + 4);
    box(g, M.steelDark, w, 0.8, 0.5, 0, FD - 0.6, z);
    // The pillars stand on whatever deck is under them -- the gallery deck over
    // the hangar, the open deck beyond its ends -- so none of them hangs free.
    const foot = t > HGR_F || t < HGR_A ? sheer(Math.max(-1, Math.min(1, t))) : GALLERY;
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.6);
      box(g, M.steelDark, 0.4, FD - 1.0 - foot, 0.4, x, (FD - 1.0 + foot) / 2, z);
    }
  }

  // Markings: the centreline down the whole deck, and the dashed lines marking
  // the landing area's edges, which draw in with the deck.
  box(g, M.mark, 0.5, 0.06, FDL * 0.86, 0, FD + 0.2, FD_MID);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 30; i++) {
      const z = fdEndA(0) + 8 + i * 4.4;
      if (z > fdEndF(0) - 8) break;
      const x = s * (fdHalf(z) - 2.2);
      const m = box(g, M.mark, 0.34, 0.06, 2.6, x, FD + 0.2, z);
      m.rotation.y = s * Math.atan2(fdHalf(z + 2) - fdHalf(z - 2), 4);
    }
  }

  // Three centreline elevators: outline, platform, and the gap round it.
  const LIFTS = [FDL * 0.34, FDL * 0.0, -FDL * 0.3];
  for (const lz of LIFTS) {
    const z = lz + LOA * 0.012;
    for (const s of [-1, 1]) {
      box(g, M.steelDark, 0.24, 0.4, 14.6, s * 7.3, FD + 0.16, z);
      box(g, M.steelDark, 14.8, 0.4, 0.24, 0, FD + 0.16, z + s * 7.3);
    }
    // The platform, a shade proud of the deck, with its own planking.
    for (let i = 0; i < 12; i++) {
      box(g, i % 3 === 1 ? M.deckDark : M.deck, 14.2 / 12 - 0.05, 0.3, 14.2,
        -7.1 + (14.2 * (i + 0.5)) / 12, FD + 0.02, z);
    }
  }

  // Arresting gear: nine wires across the after third, raised on their fairleads.
  for (let i = 0; i < 9; i++) {
    const z = fdEndA(0) + 14 + i * 5.4;
    const w = fdHalf(z) - 1.4;
    tubeX(g, M.wire, 0.075, 2 * w, 0, FD + 0.42, z, 6);
    for (const s of [-1, 1]) {
      box(g, M.steelDark, 0.5, 0.3, 0.5, s * w, FD + 0.3, z);
    }
  }
  // Three crash barriers, forward of the wires: stanchions and their cables.
  for (let i = 0; i < 3; i++) {
    const z = -FDL * 0.06 + i * 6.5 + FD_MID;
    const w = fdHalf(z) - 1.0;
    for (const s of [-1, 1]) {
      box(g, M.steelDark, 0.34, 1.5, 0.34, s * w, FD + 0.9, z);
    }
    tubeX(g, M.wire, 0.09, 2 * w, 0, FD + 1.5, z, 6);
    tubeX(g, M.wire, 0.09, 2 * w, 0, FD + 0.9, z, 6);
  }

  // Palisades: the folding wind screens forward of the parking area.
  {
    const z = FDL * 0.31 + FD_MID;
    const w = fdHalf(z) - 2;
    // Folded down, which is how they lie whenever the deck park is aft: raised,
    // they stand across the deck like a row of hoardings.
    for (let i = 0; i < 7; i++) {
      const x = -w + i * ((2 * w) / 6);
      const p = box(g, M.canvas, (2 * w) / 6 - 0.4, 2.0, 0.16, x, FD + 0.32, z - 0.9);
      p.rotation.x = Math.PI / 2 - 0.06;
    }
  }
}

/**
 * The catwalks: a gallery slung under the deck edge for the whole length of
 * her, with the light guns in tubs off it and the life rafts on its rails.
 *
 * This is the detail that reads at any range. A carrier without them is a
 * plank on a hull; with them the deck edge has depth and the ship has a scale.
 */
function catwalks(g) {
  const y = FD - 1.9;
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 30; i++) {
      const t = -1 + (2 * i) / 30;
      const z = t * (FDL / 2 - 4) + FD_MID;
      const hw = fdHalf(z);
      const x = s * (hw + 0.9);
      const ang = s * Math.atan2(fdHalf(z + 3) - fdHalf(z - 3), 6);
      // Grating, and the brackets carrying it off the deck edge.
      box(g, M.steelDark, 2.0, 0.14, (FDL - 8) / 30 + 0.2, x, y, z, ang);
      if (i % 2 === 0) {
        const br = box(g, M.steelDark, 2.4, 0.22, 0.2, s * (hw + 0.2), y + 0.55, z);
        br.rotation.z = s * 0.5;
      }
      pts.push([x + s * 0.9, y + 0.07, z]);
      // Life rafts stowed against the outboard rail.
      if (i % 3 === 1) {
        const r = cyl(g, M.raft, 0.32, 0.32, 1.9, x + s * 0.75, y + 1.0, z, 8);
        r.rotation.x = Math.PI / 2;
      }
    }
    railing(g, pts, 1.05, 2);
  }
}

// ------------------------------------------------------------- the island --

/**
 * The island: small, on the starboard side, with the funnel built into it.
 *
 * A Yorktown's island is about a tenth of the deck's length and five metres
 * wide, and it is one structure, not a bridge with a chimney beside it: the
 * uptakes come up through it and the funnel is its after end, canted a few
 * degrees outboard so the smoke clears the deck. Everything on it is stepped in
 * from the level below, which is what gives it its profile, and everything
 * stands on the level below -- there is nothing on a warship that is not bolted
 * to something.
 *
 * Bottom to top: the base at flight-deck level with its doors and ready
 * lockers, the pilot house, the flag bridge, air plot, sky control; the tripod
 * mast between the bridge and the funnel; the funnel with its cap, grille,
 * steam pipes and siren; searchlight platforms either side of it; Mk 37
 * directors fore and aft; and 20 mm galleries wherever there was room.
 */
function island(g) {
  // Starboard, which in this frame is negative x: the bow is +z and up is +y,
  // so the right hand side of a ship facing her own bow is -x. It was on the
  // wrong side of her, which on a carrier is not a detail -- the whole point of
  // an island is that it is out of the way of the landing circuit, and the
  // circuit is flown to port.
  const S = -1;
  // Her island hangs over the side. Only a metre of it stands on the flight
  // deck; the rest is cantilevered out past the deck edge on a sponson, which
  // is the whole point -- every square metre of it kept inboard is a square
  // metre taken off the landing area.
  const X = S * (FDW / 2 - 1.0);  // its inboard face, a metre in from the edge
  const Z = LOA * 0.06;
  const W = 5.6;
  const cx = X + S * (W / 2);
  /** Athwartships, in island terms: outboard is positive. */
  const ox = (d) => cx + S * d;
  /** A level's floor, as a height above the water. */
  const D = (h) => FD + h;

  // ------------------------------------------------------------ the base --
  // The sponson under it: a plated box off the gallery deck reaching out past
  // the deck edge, because the island's outboard four-fifths stand on nothing
  // else. Deep brackets under that, down onto the ship's side.
  {
    const sxi = S * (FDW / 2 - 2.6);       // where it ties into the gallery deck
    const sxo = ox(W / 2 + 0.7);           // and how far out it reaches
    const sw = Math.abs(sxo - sxi);
    const scx = (sxi + sxo) / 2;
    box(g, M.steelDark, sw, 0.34, 27.4, scx, GALLERY, Z);
    box(g, M.hull, 0.32, FD - GALLERY - 0.2, 27.4, sxo, (GALLERY + FD) / 2, Z);
    for (const dz of [-13.5, 13.5]) {
      box(g, M.hull, sw, FD - GALLERY - 0.2, 0.3, scx, (GALLERY + FD) / 2, Z + dz);
    }
    for (let i = 0; i < 7; i++) {
      const z = Z - 12 + i * 4;
      const br = box(g, M.steelDark, sw + 1.4, 0.28, 0.28, scx, GALLERY - 1.5, z);
      br.rotation.z = -S * 0.42;
      box(g, M.steelDark, 0.24, 3.4, 0.24, sxo, GALLERY - 1.6, z);
    }
    // A walkway outboard of the sponson, under the island's own gallery.
    box(g, M.steelDark, 1.7, 0.14, 24.0, sxo + S * 1.0, GALLERY + 0.1, Z);
    const pts = [];
    for (let i = 0; i <= 9; i++) pts.push([sxo + S * 1.8, GALLERY + 0.2, Z - 11.5 + i * 2.55]);
    railing(g, pts, 1.0, 2);
  }

  // The island proper, standing on the flight deck and overhanging the side.
  box(g, M.hull, W, 4.0, 26.4, cx, D(2.0), Z);
  box(g, M.steelDark, W + 0.5, 0.3, 26.8, cx, D(4.0), Z);
  // The gallery round the foot of it, which is where her people actually walk.
  for (const s of [-1, 1]) {
    const gx = cx + S * s * (W / 2 + 0.9);
    box(g, M.steelDark, 1.9, 0.16, 22.0, gx, D(4.1), Z);
    for (const bz of [-8, -3, 2, 7]) {
      const br = box(g, M.steelDark, 2.1, 0.16, 0.16, cx + S * s * (W / 2 + 0.6),
        D(3.5), Z + bz);
      br.rotation.z = -S * s * 0.5;
    }
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push([cx + S * s * (W / 2 + 1.75), D(4.2), Z - 11 + i * 2.75]);
    railing(g, pts, 1.0, 2);
  }
  // Doors and ladders down the inboard face, where the deck crew reach it.
  for (const dz of [-9.0, -3.0, 3.0, 9.0]) {
    box(g, M.steelDark, 0.16, 2.0, 0.9, ox(-W / 2 - 0.1), D(1.0), Z + dz);
  }
  for (const dz of [-10.5, 7.5]) {
    for (let i = 0; i < 7; i++) {
      box(g, M.steel, 0.5, 0.08, 0.1, ox(-W / 2 - 0.24), D(0.4 + i * 0.6), Z + dz);
    }
    for (const s of [-1, 1]) {
      box(g, M.steel, 0.1, 4.4, 0.1, ox(-W / 2 - 0.24), D(2.2), Z + dz + s * 0.25);
    }
  }
  // Ready-service lockers and life rafts stowed against the outboard face.
  for (const dz of [-7.5, -1.5, 4.5]) {
    box(g, M.steelDark, 1.1, 1.3, 2.6, ox(W / 2 + 0.55), D(0.65), Z + dz);
  }
  for (const dz of [-11.0, 8.5]) {
    const r = cyl(g, M.raft, 0.34, 0.34, 2.4, ox(W / 2 + 0.35), D(2.6), Z + dz, 8);
    r.rotation.x = Math.PI / 2;
  }

  // ------------------------------------------- the second deck and its guns --
  // A platform round the island at the top of the base, carrying the 20 mm and
  // the funnel's own uptake casing, which starts here and goes all the way up.
  box(g, M.hull, W - 0.4, 2.6, 22.4, cx, D(5.3), Z - 0.5);
  box(g, M.steelDark, W + 3.0, 0.3, 7.4, ox(0.8), D(6.6), Z + 9.4);
  {
    const pts = [];
    for (let i = 0; i <= 4; i++) pts.push([ox(W / 2 + 2.0), D(6.75), Z + 6.2 + i * 1.6]);
    railing(g, pts, 1.0, 2);
  }
  for (const dz of [6.8, 10.6]) oerlikon(g, ox(W / 2 + 1.3), D(6.75), Z + dz, S * 1.4);

  // ------------------------------------------------------- the bridge decks --
  // Each stepped in from the one below it, with its window band and its wings.
  // Lower and longer than a battleship's tower: a Yorktown's island is a
  // wheelhouse on a box, not a pagoda, and the whole of it stands well under
  // the height of her funnel.
  const decks = [
    ['pilot', 6.6, 5.0, 9.8, 2.7, 8.0],    // floor, width, length, height, centre
    ['flag', 9.3, 4.6, 8.6, 2.4, 7.8],
    ['plot', 11.7, 4.0, 6.8, 2.2, 7.8],
    ['sky', 13.9, 3.4, 5.0, 1.7, 8.0],
  ];
  for (const [name, y, w, d, h, dz] of decks) {
    const z = Z + dz;
    box(g, M.hull, w, h, d, cx, D(y) + h / 2, z);
    box(g, M.steelDark, w + 0.5, 0.28, d + 0.5, cx, D(y + h) + 0.14, z);
    if (name !== 'sky') {
      // The window band runs round three sides of a pilot house.
      box(g, M.glass, w + 0.14, h * 0.36, d * 0.9, cx, D(y) + h * 0.66, z);
      box(g, M.glass, w * 0.86, h * 0.36, d + 0.14, cx, D(y) + h * 0.66, z);
    } else {
      // Sky control is open, behind a splinter bulwark.
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        box(g, M.steel, 0.9, 1.2, 0.18, cx + Math.sin(a) * (w / 2), D(y) + 0.6,
          z + Math.cos(a) * (d / 2), a);
      }
    }
    // Wing bridges: a platform out each side on its brackets, with a rail.
    for (const s of [-1, 1]) {
      const wx = cx + S * s * (w / 2 + 0.85);
      box(g, M.steelDark, 1.8, 0.14, d * 0.72, wx, D(y) + 0.07, z);
      for (const bz of [-d * 0.28, d * 0.28]) {
        const br = box(g, M.steelDark, 2.0, 0.16, 0.16, cx + S * s * (w / 2 + 0.6),
          D(y) - 0.5, z + bz);
        br.rotation.z = -S * s * 0.45;
      }
      const pts = [];
      for (let i = 0; i <= 4; i++) {
        pts.push([cx + S * s * (w / 2 + 1.65), D(y) + 0.12, z - d * 0.36 + (i * d * 0.72) / 4]);
      }
      railing(g, pts, 1.0, 2);
    }
  }
  // ------------------------------------------------- the open bridge --
  // A Yorktown was conned from the open bridge, not from behind glass: a
  // walkway wrapped round the front and both sides of the pilot house behind a
  // splinter bulwark, with the pelorus on each wing and the engine telegraphs
  // by the centreline. It is the shape that makes the forward end of the
  // island read as a bridge rather than as another box on the pile.
  for (const [y, w, d, dz, bh] of [[6.6, 5.0, 9.8, 8.0, 1.25], [9.3, 4.6, 8.6, 7.8, 1.15]]) {
    const z = Z + dz;
    const ow = w / 2 + 1.7;
    const od = d / 2 + 1.5;
    const N = 19;
    for (let i = 0; i < N; i++) {
      const a = -1.95 + (i / (N - 1)) * 3.9;
      const px = cx + Math.sin(a) * ow;
      const pz = z + Math.cos(a) * od;
      // The bulwark, and the platform it stands on.
      box(g, M.hull, 1.05, bh, 0.22, px, D(y) + bh / 2, pz, a);
      box(g, M.steelDark, 1.05, 0.16, 1.9, px - Math.sin(a) * 0.85,
        D(y) + 0.08, pz - Math.cos(a) * 0.85, a);
      // A stiffener down the outside of it, and a bracket under the platform.
      if (i % 3 === 0) {
        box(g, M.hullDark, 0.18, bh, 0.18, cx + Math.sin(a) * (ow + 0.12),
          D(y) + bh / 2, z + Math.cos(a) * (od + 0.12));
        const br = box(g, M.steelDark, 2.0, 0.16, 0.16,
          cx + Math.sin(a) * (ow - 0.9), D(y) - 0.6, z + Math.cos(a) * (od - 0.9));
        br.rotation.y = -a;
        br.rotation.z = Math.sin(a) > 0 ? 0.5 : -0.5;
      }
    }
    // The pelorus on each wing, and the telegraphs by the centreline.
    for (const sgn of [-1, 1]) {
      const px = cx + sgn * (ow - 0.7);
      cyl(g, M.steelDark, 0.16, 0.2, 1.0, px, D(y) + 0.5, z + od * 0.35, 8);
      cyl(g, M.bright, 0.34, 0.34, 0.16, px, D(y) + 1.05, z + od * 0.35, 12);
      cyl(g, M.steelDark, 0.2, 0.24, 1.1, cx + sgn * 1.1, D(y) + 0.55, z + od - 0.9, 8);
      box(g, M.bright, 0.36, 0.4, 0.22, cx + sgn * 1.1, D(y) + 1.2, z + od - 0.9);
    }
    // The windscreen over the front of the bulwark.
    for (let i = 0; i < 5; i++) {
      const a = -0.5 + (i / 4) * 1.0;
      const wv = box(g, M.glass, 1.0, 0.55, 0.1, cx + Math.sin(a) * (ow + 0.02),
        D(y) + bh + 0.26, z + Math.cos(a) * (od + 0.02), a);
      wv.rotation.x = -0.22;
    }
  }
  // The chart house abaft the pilot house, and the ladder up its side.
  box(g, M.hull, 4.2, 2.4, 3.2, cx, D(6.6) + 1.2, Z + 1.6);
  box(g, M.glass, 4.34, 0.8, 2.6, cx, D(6.6) + 1.6, Z + 1.6);
  box(g, M.steelDark, 4.7, 0.24, 3.6, cx, D(9.0), Z + 1.6);
  for (let i = 0; i < 5; i++) {
    box(g, M.steel, 0.5, 0.08, 0.1, ox(-4.2 / 2 - 0.2), D(4.4 + i * 0.55), Z + 1.6);
  }
  for (const sgn of [-1, 1]) {
    box(g, M.steel, 0.1, 2.6, 0.1, ox(-4.2 / 2 - 0.2), D(5.6), Z + 1.6 + sgn * 0.25);
  }

  // The two 24-inch signal lamps, standing on the pilot house wings.
  for (const s of [-1, 1]) {
    const wx = cx + S * s * (5.0 / 2 + 0.85);
    box(g, M.steelDark, 0.3, 0.85, 0.3, wx, D(6.6) + 0.57, Z + 10.6);
    cyl(g, M.bright, 0.44, 0.44, 0.6, wx, D(6.6) + 1.25, Z + 10.6, 12)
      .rotation.x = Math.PI / 2;
  }
  // Flag bags on the flag bridge wings, and the halyard cleats above them.
  for (const s of [-1, 1]) {
    const wx = cx + S * s * (4.6 / 2 + 0.85);
    box(g, M.canvas, 1.4, 0.8, 2.2, wx, D(9.3) + 0.5, Z + 5.0);
  }

  // ------------------------------------------------------------ the funnel --
  // The uptake casing, canted a few degrees outboard so the smoke clears the
  // deck, with the cap flaring off the top of it and a grille across the mouth.
  const FZ = Z - 6.6;
  const FY0 = 6.6;
  const FY1 = 16.4;
  const FH = FY1 - FY0;
  // Long. A Yorktown's uptake casing is not a chimney stuck on the back of the
  // bridge, it is the whole after half of the island -- twelve metres of it
  // fore and aft, which is most of the structure's length.
  const FL = 12.4;
  const fun = new THREE.Group();
  fun.position.set(ox(0.35), D((FY0 + FY1) / 2), FZ);
  fun.rotation.z = -S * 0.055;
  g.add(fun);
  box(fun, M.hull, W + 0.6, FH, FL, 0, 0, 0);
  // Corner strakes and the horizontal ribs down it, so it reads as riveted
  // plating rather than as one solid block of nothing.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(fun, M.hullDark, 0.32, FH, 0.32, sx * (W + 0.6) / 2, 0, sz * (FL / 2 - 0.2));
    }
  }
  for (let i = 1; i <= 3; i++) {
    const y = -FH / 2 + (i * FH) / 4;
    box(fun, M.hullDark, W + 0.9, 0.22, FL + 0.3, 0, y, 0);
  }
  // The cap: a flared collar, a black band round it, and the grille of bars
  // across the mouth with the dark of the uptake behind them.
  box(fun, M.steelDark, W + 1.6, 0.5, FL + 1.1, 0, FH / 2 + 0.25, 0);
  box(fun, M.boot, W + 1.3, 0.85, FL + 0.7, 0, FH / 2 + 0.9, 0);
  box(fun, M.cave, W - 0.5, 0.3, FL - 1.2, 0, FH / 2 + 1.2, 0);
  for (let i = 0; i < 7; i++) {
    box(fun, M.steelDark, 0.16, 0.3, FL - 1.0,
      -(W - 0.7) / 2 + (i * (W - 0.7)) / 6, FH / 2 + 1.32, 0);
  }
  for (let i = 0; i < 3; i++) {
    box(fun, M.steelDark, W - 0.5, 0.3, 0.16, 0, FH / 2 + 1.32,
      -(FL - 1.4) / 2 + (i * (FL - 1.4)) / 2);
  }
  // Steam pipes up the after face, standing proud of it, with their whistles.
  for (const s of [-1, 1]) {
    cyl(fun, M.steelDark, 0.26, 0.26, FH + 2.2, s * 1.6, 1.1, -FL / 2 - 0.3, 8);
    box(fun, M.steelDark, 0.5, 0.45, 0.5, s * 1.6, FH / 2 + 1.5, -FL / 2 - 0.3);
  }
  // The siren on the forward face, and a ladder up the outboard one.
  for (const s of [-1, 1]) {
    cyl(fun, M.bright, 0.34, 0.44, 0.9, s * 0.9, FH / 2 - 2.0, FL / 2 + 0.3, 10)
      .rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 11; i++) {
    box(fun, M.steel, 0.1, 0.08, 0.5, -S * (W + 0.6) / 2 - S * 0.22,
      -FH / 2 + 0.6 + i * (FH - 1.2) / 10, 1.2);
  }
  for (const dz of [0.95, 1.45]) {
    box(fun, M.steel, 0.1, FH - 0.8, 0.1, -S * (W + 0.6) / 2 - S * 0.22, 0, dz);
  }
  // A gallery round the foot of the casing, with a pair of 20 mm on it.
  box(g, M.steelDark, W + 4.2, 0.3, FL + 1.6, ox(0.9), D(FY0 + 0.15), FZ);
  {
    const pts = [];
    for (let i = 0; i <= 5; i++) pts.push([ox(W / 2 + 2.4), D(FY0 + 0.3), FZ - 5.0 + i * 2.0]);
    railing(g, pts, 1.0, 2);
  }
  for (const dz of [-3.2, 3.2]) oerlikon(g, ox(W / 2 + 1.6), D(FY0 + 0.3), FZ + dz, S * 1.4);
  // Searchlight platforms either side of the funnel, on their brackets.
  for (const s of [-1, 1]) {
    const px = cx + S * s * (W / 2 + 1.9);
    box(g, M.steelDark, 3.4, 0.28, 4.4, px, D(12.4), FZ + 0.6);
    for (const bz of [-1.4, 1.4]) {
      const br = box(g, M.steelDark, 3.0, 0.18, 0.18, cx + S * s * (W / 2 + 1.1),
        D(11.7), FZ + 0.6 + bz);
      br.rotation.z = -S * s * 0.5;
    }
    cyl(g, M.bright, 0.78, 0.78, 1.2, px, D(13.3), FZ + 0.6, 14).rotation.x = Math.PI / 2;
    box(g, M.steelDark, 0.5, 1.0, 0.5, px, D(12.9), FZ + 0.6);
    const pts = [];
    for (let i = 0; i <= 3; i++) pts.push([px + S * s * 1.6, D(12.55), FZ - 1.4 + i * 1.4]);
    railing(g, pts, 1.0, 2);
  }

  // -------------------------------------------------------- the tripod mast --
  // Stepped on the second deck between the bridge and the funnel, so its legs
  // land on structure rather than on air.
  const mastZ = Z + 1.35;
  const mastFoot = D(6.6);
  const mastTop = D(25.6);
  // The legs are splayed at the foot and gather at the truck -- that is what
  // makes it a tripod rather than three posts standing side by side. Each is
  // lofted between the two points it actually runs between, so it leans the
  // way it should instead of leaning outwards as it rises.
  for (const [dx, dz] of [[0, 1.7], [-2.3, -1.7], [2.3, -1.7]]) {
    const x0 = cx + S * dx;
    const z0 = mastZ + dz;
    const rise = mastTop - mastFoot;
    const len = Math.hypot(cx - x0, rise, mastZ - z0);
    const leg = cyl(g, M.steel, 0.2, 0.34, len,
      (x0 + cx) / 2, (mastFoot + mastTop) / 2, (z0 + mastZ) / 2, 8);
    leg.rotation.x = Math.atan2(mastZ - z0, rise);
    leg.rotation.z = Math.atan2(x0 - cx, rise);
  }
  // Cross bracing between the legs.
  for (const h of [9.6, 12.8, 16.0, 19.2, 22.4]) {
    const k = 1 - (h - 6.6) / (25.6 - 6.6);
    box(g, M.steel, 4.6 * k + 0.5, 0.16, 0.16, cx, D(h), mastZ - 1.9 * k);
    box(g, M.steel, 0.16, 0.16, 4.5 * k + 0.5, cx, D(h), mastZ + 0.35 * k);
  }
  // The lookout's platform, and the signal yard with its halyards.
  box(g, M.steelDark, 3.4, 0.2, 3.0, cx, D(17.6), mastZ);
  {
    const pts = [];
    for (let i = 0; i <= 4; i++) pts.push([ox(1.5), D(17.7), mastZ - 1.4 + i * 0.7]);
    railing(g, pts, 1.0, 2);
  }
  box(g, M.steel, 11.0, 0.18, 0.18, cx, D(21.2), mastZ);
  for (const s of [-1, 1]) {
    for (let i = 1; i <= 3; i++) {
      const wr = box(g, M.wire, 0.05, 5.6, 0.05, cx + S * s * i * 1.7, D(18.5), mastZ);
      wr.rotation.z = -S * s * 0.15 * i;
    }
  }
  // A hoist of bunting on the outboard halyard. On a ship painted one colour
  // from her boot topping to her masthead, the signal flags are the only colour
  // there is, and at any range they are the first thing the eye finds on her.
  {
    const bunting = [M.flagRed, M.mark, M.flagBlue, M.flagGold, M.flagRed, M.mark, M.flagBlue];
    const hx = cx + S * 3 * 1.7;
    const drop = 1.05;
    const step = 0.24;
    // The halyard the hoist is bent onto, led from the yardarm down and out.
    const rope = box(g, M.wire, 0.06, drop * bunting.length + 0.6, 0.06,
      hx + S * (0.5 + step * (bunting.length - 1) / 2),
      D(20.9) - (drop * (bunting.length - 1)) / 2 - 0.35, mastZ);
    rope.rotation.z = -S * Math.atan2(step * (bunting.length - 1), drop * (bunting.length - 1));
    for (let i = 0; i < bunting.length; i++) {
      const y = D(20.9) - 0.35 - i * drop;
      const f = box(g, bunting[i], 0.1, 0.86, 0.95, hx + S * (0.5 + i * step), y, mastZ);
      f.rotation.z = -S * 0.45;
      f.rotation.y = 0.12 * (i % 2 ? 1 : -1);
    }
  }
  // Two more halyards led down to the flag bags on the bridge wings.
  for (const s of [-1, 1]) {
    const hw = box(g, M.wire, 0.05, 11.4, 0.05, cx + S * s * 2.9, D(15.4), mastZ + 1.2);
    hw.rotation.x = -0.30;
    hw.rotation.z = -S * s * 0.16;
  }
  // The air-search bedspring: a wide rectangular mattress of dipoles on a short
  // topmast above the truck. It is the biggest single thing on her upperworks
  // and the one that says 1942 rather than 1938 -- so it is built at the size
  // it was, not as a token on a stick.
  box(g, M.steel, 2.6, 0.6, 2.8, cx, D(24.6), mastZ);
  cyl(g, M.steel, 0.18, 0.24, 2.6, cx, D(26.1), mastZ, 8);
  const sc = new THREE.Group();
  sc.position.set(cx, D(27.2), mastZ);
  // Trained round on its trunnion, so the mattress shows its face from the beam
  // and from the bow rather than standing edge-on to both.
  sc.rotation.y = 1.15;
  g.add(sc);
  const SCW = 6.4;
  const SCH = 2.7;
  for (const y of [0, SCH]) box(sc, M.steel, SCW, 0.18, 0.34, 0, y, 0);
  for (const sx of [-1, 1]) box(sc, M.steel, 0.18, SCH, 0.34, sx * SCW / 2, SCH / 2, 0);
  for (let i = 0; i < 13; i++) {
    const x = -SCW / 2 + 0.25 + (i * (SCW - 0.5)) / 12;
    box(sc, M.steel, 0.1, SCH - 0.2, 0.1, x, SCH / 2, 0);
    for (const y of [SCH * 0.3, SCH * 0.7]) {
      box(sc, M.steel, 0.07, 0.07, 0.85, x, y, 0.4);
    }
  }
  // Its backing frame and the trunnion it turns on.
  box(sc, M.steel, SCW - 0.6, 0.12, 0.12, 0, SCH / 2, -0.35);
  for (const sx of [-1, 1]) box(sc, M.steel, 0.12, 0.12, 0.8, sx * 1.4, SCH / 2, -0.2);
  cyl(sc, M.steelDark, 0.3, 0.3, 0.7, 0, -0.5, 0, 10);
  // SG surface-search in its cheese housing, on the starboard yardarm.
  const sg = cyl(g, M.steel, 0.95, 0.95, 0.55, ox(2.4), D(22.8), mastZ, 14);
  sg.rotation.x = Math.PI / 2;
  box(g, M.steel, 0.32, 2.0, 0.22, ox(2.4), D(21.9), mastZ);
  // Whip aerials down the outboard side of the island, hinged out.
  for (const dz of [-12.0, -6.0, 6.0, 11.0]) {
    const w = cyl(g, M.wire, 0.05, 0.09, 6.0, ox(W / 2 + 0.3), D(6.6), Z + dz, 6);
    w.rotation.z = S * 0.35;
  }

  // ------------------------------------------------------- fire control --
  // Mk 37 directors with their Mk 4 antennas: one on the air plot's roof
  // looking forward, one on a platform abaft the funnel.
  const dirs = [[D(13.9), Z + 8.0, 1], [D(10.6), Z - 15.0, -1]];
  for (const [y, z, fwd] of dirs) {
    if (fwd < 0) {
      // The after director's platform, carried off the island's after end.
      box(g, M.steelDark, 5.4, 0.3, 5.0, cx, y - 0.15, z);
      for (const s of [-1, 1]) {
        const br = box(g, M.steelDark, 2.6, 0.18, 0.18, cx + S * s * 1.6, y - 0.9, z);
        br.rotation.z = -S * s * 0.5;
      }
      box(g, M.hull, 3.2, 3.6, 5.6, cx, y - 1.9, z + 1.9);
    }
    const d = new THREE.Group();
    d.position.set(cx, y, z);
    d.rotation.y = fwd > 0 ? 0 : Math.PI;
    g.add(d);
    cyl(d, M.gun, 1.55, 1.75, 1.0, 0, 0.5, 0, 14);
    box(d, M.gun, 3.0, 1.9, 3.4, 0, 1.95, 0);
    box(d, M.gunDark, 3.1, 0.5, 0.2, 0, 2.5, 1.7);
    box(d, M.glass, 2.2, 0.4, 0.16, 0, 2.2, 1.75);
    // The Mk 4 mattress on its trunnions.
    box(d, M.steel, 2.6, 1.9, 0.16, 0, 3.55, 0.2);
    for (let i = 0; i < 5; i++) box(d, M.steel, 0.08, 0.08, 0.5, -1.0 + i * 0.5, 3.55, 0.45);
    for (const s of [-1, 1]) cyl(d, M.gun, 0.2, 0.2, 0.5, s * 1.4, 2.95, 0.2, 8).rotation.z = Math.PI / 2;
  }

  // The short pole mast abaft the funnel, with its yard and the after signal
  // light on it: the second stick every photograph of her shows.
  {
    const pz = Z - 15.0;
    const py = D(10.9);
    cyl(g, M.steel, 0.16, 0.26, 11.0, cx, py + 5.5, pz, 8);
    box(g, M.steel, 6.0, 0.14, 0.14, cx, py + 8.4, pz);
    for (const s of [-1, 1]) {
      cyl(g, M.bright, 0.26, 0.26, 0.4, cx + S * s * 2.6, py + 8.7, pz, 10)
        .rotation.x = Math.PI / 2;
      const st = box(g, M.wire, 0.05, 5.4, 0.05, cx + S * s * 2.2, py + 6.0, pz);
      st.rotation.z = -S * s * 0.16;
    }
    cyl(g, M.steel, 0.1, 0.14, 3.0, cx, py + 12.2, pz, 6);
  }

  // The flag staff at the island's truck.
  box(g, M.steel, 0.14, 3.4, 0.14, cx, D(17.3), Z + 8.0);   // at the truck of the island
}

// ---------------------------------------------------------------- weapons --

/**
 * A 5"/38 single mount, open-backed with its shield.
 *
 * Marked dynamic and recorded, because these are the guns the simulation lays:
 * eight of them, and each one trains on its own pintle. Being dynamic also
 * keeps the welder off them, which is what lets them turn at all.
 */
function fiveInch(g, root, x, y, z, ry) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.dynamic = true;
  (root.userData.turrets || (root.userData.turrets = [])).push(m);
  g.add(m);
  cyl(m, M.gunDark, 1.25, 1.35, 0.5, 0, 0.25, 0, 16);
  // The shield: front plate, two sides, open at the back.
  box(m, M.gun, 2.5, 2.1, 0.18, 0, 1.55, 1.15);
  for (const s of [-1, 1]) box(m, M.gun, 0.18, 2.1, 2.3, s * 1.25, 1.55, 0);
  box(m, M.gun, 2.6, 0.18, 2.4, 0, 2.6, 0);
  // Trunnions, cradle and the barrel through the shield.
  for (const s of [-1, 1]) cyl(m, M.gunDark, 0.22, 0.22, 0.4, s * 0.6, 1.5, 0.2, 10).rotation.z = Math.PI / 2;
  const arm = new THREE.Group();
  arm.position.set(0, 1.5, 0.2);
  arm.rotation.x = -0.22;
  m.add(arm);
  box(arm, M.gunDark, 0.75, 0.7, 1.6, 0, 0, -0.4);
  tubeZ(arm, M.gun, 0.135, 4.6, 0, 0, 2.4, 12);
  tubeZ(arm, M.gunDark, 0.19, 0.5, 0, 0, 0.75, 12);
  // Loader's platform and the ready-service racks round the base.
  cyl(m, M.steelDark, 2.1, 2.1, 0.1, 0, 0.05, -0.6, 16);
  for (let i = 0; i < 8; i++) {
    const a = -1.9 + i * 0.5;
    box(m, M.steelDark, 0.3, 0.9, 0.3, Math.sin(a) * 1.9, 0.5, Math.cos(a) * 1.9 - 0.6);
  }
  // The mount turns as one thing, so everything on it welds down to one draw
  // call. Left loose, eight of these cost a hundred and sixty.
  mergeStatic(m);
  return m;
}

/** A quadruple 40 mm Bofors on its power mount. */
function bofors(g, x, y, z, ry) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  g.add(m);
  cyl(m, M.gunDark, 1.0, 1.15, 0.45, 0, 0.22, 0, 14);
  box(m, M.gun, 2.0, 0.9, 1.7, 0, 0.85, -0.3);
  for (const s of [-1, 1]) box(m, M.gun, 0.5, 1.1, 1.0, s * 1.1, 1.0, -0.2);
  const arm = new THREE.Group();
  arm.position.set(0, 1.25, 0.2);
  arm.rotation.x = -0.5;
  m.add(arm);
  box(arm, M.gunDark, 1.5, 0.55, 1.2, 0, 0, -0.3);
  for (const dx of [-0.45, -0.15, 0.15, 0.45]) {
    tubeZ(arm, M.gun, 0.055, 2.5, dx, 0.12, 1.3, 8);
    box(arm, M.gunDark, 0.16, 0.16, 0.5, dx, 0.12, -0.5);
  }
  // The two loaders' seats and the sight between them.
  for (const s of [-1, 1]) box(m, M.gunDark, 0.4, 0.1, 0.4, s * 0.85, 1.35, -1.0);
  box(m, M.gun, 0.3, 0.5, 0.3, 0, 1.6, -0.5);
  return m;
}

/** A single 20 mm Oerlikon on its pedestal, with its shoulder rests. */
function oerlikon(g, x, y, z, ry) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  g.add(m);
  cyl(m, M.gunDark, 0.24, 0.34, 1.15, 0, 0.57, 0, 10);
  const arm = new THREE.Group();
  arm.position.set(0, 1.15, 0);
  arm.rotation.x = -0.55;
  m.add(arm);
  tubeZ(arm, M.gun, 0.05, 1.9, 0, 0, 0.75, 8);
  box(arm, M.gunDark, 0.3, 0.34, 0.7, 0, 0, -0.2);
  cyl(arm, M.gunDark, 0.24, 0.24, 0.18, 0, 0.3, -0.05, 12);
  for (const s of [-1, 1]) box(arm, M.gunDark, 0.1, 0.42, 0.1, s * 0.22, -0.3, -0.5);
  // The splinter shield round the pedestal.
  for (let i = 0; i < 9; i++) {
    const a = -1.6 + (i / 8) * 3.2;
    box(m, M.steel, 0.42, 1.0, 0.1, Math.sin(a) * 0.85, 0.5, Math.cos(a) * 0.85, a);
  }
  return m;
}

/**
 * Where her guns actually were: eight 5-inch in four sponsons at the corners of
 * the flight deck, four quad Bofors, and Oerlikons the whole length of both
 * catwalks. The five-inch could not fire across the deck, which is why they are
 * where they are and why she was always short of them forward.
 */
function armament(g) {
  const gy = GALLERY;                        // the gallery deck
  // Starboard is -x, so the starboard pair come first to match the datasheet's
  // order, which is the order the simulation lays them in.
  const sponsons = [
    [-1, LOA * 0.30], [-1, -LOA * 0.24],     // starboard, forward and aft
    [1, LOA * 0.26], [1, -LOA * 0.28],       // port
  ];
  for (const [s, z] of sponsons) {
    const x = s * (fdHalf(z) + 1.2);
    // The sponson: a platform on brackets off the ship's side.
    box(g, M.steel, 7.0, 0.3, 13.0, x + s * 1.2, gy, z);
    for (const dz of [-4.5, 0, 4.5]) {
      const br = box(g, M.steelDark, 6.6, 0.4, 0.4, x + s * 1.0, gy - 1.4, z + dz);
      br.rotation.z = -s * 0.35;
    }
    const pts = [];
    for (let i = 0; i <= 6; i++) pts.push([x + s * 4.4, gy + 0.15, z - 6 + i * 2]);
    railing(g, pts, 1.0, 2);
    fiveInch(g, g, x + s * 1.2, gy + 0.15, z + 3.4, s > 0 ? 1.2 : -1.2);
    fiveInch(g, g, x + s * 1.2, gy + 0.15, z - 3.4, s > 0 ? 1.5 : -1.5);
    // Ready-service lockers and the ammunition hoist between the two guns.
    box(g, M.steelDark, 1.6, 1.4, 2.2, x + s * 3.2, gy + 0.85, z);
  }

  // Eight quad Bofors in their tubs: a pair right forward on the bow gallery,
  // where a Yorktown was blindest and where they were the first thing added; a
  // pair behind them; two on the starboard side abaft the island, hung out over
  // the deck edge on their own sponsons; and two aft.
  const forty = [
    [1, LOA * 0.455], [-1, LOA * 0.455],
    [1, LOA * 0.40], [-1, LOA * 0.40],
    [-1, -LOA * 0.005], [-1, -LOA * 0.055],
    [1, -LOA * 0.41], [-1, -LOA * 0.40],
  ];
  for (const [s, z] of forty) {
    const x = s * (Math.min(fdHalf(z) + 0.4, halfBeam(z / (LOA / 2)) + 3.4));
    // The sponson it stands on, carried off the gallery deck on brackets.
    box(g, M.steelDark, 6.0, 0.3, 6.0, x, gy + 0.6, z);
    for (const dz of [-2.0, 2.0]) {
      const br = box(g, M.steelDark, 3.2, 0.2, 0.2, x - s * 1.4, gy - 0.1, z + dz);
      br.rotation.z = s * 0.5;
    }
    tub(g, 3.0, 1.2, x, gy + 0.6, z, 14);
    bofors(g, x, gy + 0.72, z, z > 0 ? 0 : Math.PI);
    // Ready-service lockers round the inboard side of the tub.
    for (const dz of [-2.2, 2.2]) {
      box(g, M.steelDark, 1.1, 1.0, 1.4, x - s * 2.6, gy + 1.1, z + dz);
    }
  }

  // Oerlikons down both catwalks, in their own shields.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 15; i++) {
      const t = -1 + (2 * i) / 14;
      const z = t * (FDL / 2 - 12) + LOA * 0.012;
      // Not where the five-inch sponsons already are.
      if (sponsons.some(([ss, sz]) => ss === s && Math.abs(sz - z) < 8)) continue;
      if (forty.some(([ss, sz]) => ss === s && Math.abs(sz - z) < 6)) continue;
      oerlikon(g, s * (fdHalf(z) + 1.4), FD - 1.83, z, s > 0 ? 1.5 : -1.5);
    }
  }
}

// ------------------------------------------------------- boats and cranes --

function boatsAndCranes(g) {
  const HW = FDW / 2;   // the crane stands just inboard of the deck edge
  // The aircraft crane, on the starboard side abaft the island: a boom on a
  // king post, which is how they got a floatplane or a wrecked aircraft over
  // the side.
  const kx = -(HW - 1.0);
  const kz = -LOA * 0.10;
  cyl(g, M.steel, 0.5, 0.6, 9.0, kx, HANGAR + 4.5, kz, 10);
  const boom = cyl(g, M.steel, 0.3, 0.42, 15.0, kx - 4.5, HANGAR + 8.6, kz + 1.0, 10);
  boom.rotation.z = 1.05;
  boom.rotation.y = 0.25;
  // The fall hangs straight down off the boom head, with the hook block on it.
  box(g, M.wire, 0.06, 7.6, 0.06, kx - 8.6, HANGAR + 6.4, kz + 2.2);
  box(g, M.steelDark, 0.6, 0.8, 0.6, kx - 8.6, HANGAR + 2.4, kz + 2.2);
  cyl(g, M.steelDark, 0.42, 0.42, 0.24, kx - 8.6, HANGAR + 2.9, kz + 2.2, 10)
    .rotation.z = Math.PI / 2;

  // Boats in their davits under the flight deck overhang, both sides: two motor
  // whaleboats and a pair of forty-foot utility boats.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const z = -LOA * 0.04 - i * 13;
      const x = s * (halfBeam(z / (LOA / 2)) + 1.6);
      // Hull: a shallow wedge, with a canopy over the after half.
      const hull = box(g, M.bright, 2.4, 1.5, 9.0, x, HANGAR + 1.9, z);
      hull.rotation.z = s * 0.06;
      box(g, M.steelDark, 2.0, 0.25, 8.4, x, HANGAR + 2.3, z);
      box(g, M.canvas, 1.9, 0.9, 3.2, x, HANGAR + 2.8, z - 2.0);
      // Davits, and the falls hanging from them.
      for (const dz of [-4, 4]) {
        const dav = cyl(g, M.steel, 0.16, 0.2, 5.4, x - s * 0.4, HANGAR + 4.4, z + dz, 8);
        dav.rotation.z = s * 0.32;
        box(g, M.wire, 0.06, 2.6, 0.06, x, HANGAR + 3.2, z + dz);
      }
    }
  }

}

// ------------------------------------------------------------- the air group --

/** An SBD Dauntless, folded or spread, in the 1942 blue-grey over light grey. */
function dauntless(g, x, y, z, ry, folded = false) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  // Fuselage: a tapered body with the cockpit glazing along the top.
  box(p, M.planeTop, 1.15, 1.35, 6.6, 0, 0.95, 0);
  box(p, M.planeBottom, 1.05, 0.5, 6.2, 0, 0.35, 0);
  box(p, M.glass, 0.9, 0.55, 2.6, 0, 1.75, 0.3);
  // Engine, cowl and propeller.
  cyl(p, M.gunDark, 0.72, 0.78, 1.1, 0, 1.0, 3.6, 14).rotation.x = Math.PI / 2;
  cyl(p, M.prop, 0.16, 0.16, 0.4, 0, 1.0, 4.2, 10).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const bl = box(p, M.prop, 0.28, 3.1, 0.1, 0, 1.0, 4.35);
    bl.rotation.z = (i / 3) * Math.PI * 2;
  }
  // Wings: the Dauntless did not fold, so they are always out.
  for (const s of [-1, 1]) {
    const w = box(p, M.planeTop, 5.6, 0.22, 1.85, s * 3.1, 0.75, 0.4);
    w.rotation.z = s * 0.045;
    box(p, M.planeBottom, 5.6, 0.1, 1.7, s * 3.1, 0.63, 0.4);
    // The perforated dive flaps along the trailing edge.
    box(p, M.gunDark, 5.4, 0.08, 0.4, s * 3.1, 0.72, -0.6);
  }
  box(p, M.star, 1.3, 0.04, 1.3, -3.4, 0.88, 0.4);
  // Tail: fin, rudder and tailplane.
  box(p, M.planeTop, 0.16, 1.7, 1.5, 0, 2.0, -3.0);
  for (const s of [-1, 1]) box(p, M.planeTop, 1.8, 0.14, 1.0, s * 1.0, 1.05, -3.1);
  // Undercarriage: fixed spatted legs and a tailwheel.
  for (const s of [-1, 1]) {
    box(p, M.planeTop, 0.3, 0.9, 0.5, s * 1.5, 0.35, 1.2);
    cyl(p, M.prop, 0.35, 0.35, 0.24, s * 1.5, 0.32, 1.2, 10).rotation.z = Math.PI / 2;
  }
  cyl(p, M.prop, 0.16, 0.16, 0.14, 0, 0.2, -3.2, 8).rotation.z = Math.PI / 2;
  if (folded) p.scale.set(0.98, 1, 1);
  return p;
}

/** An F4F Wildcat, wings folded back along the fuselage as they were on deck. */
function wildcat(g, x, y, z, ry) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  box(p, M.planeTop, 1.25, 1.5, 5.4, 0, 1.15, 0);
  box(p, M.planeBottom, 1.15, 0.55, 5.0, 0, 0.45, 0);
  box(p, M.glass, 0.95, 0.6, 1.8, 0, 2.0, 0.2);
  cyl(p, M.gunDark, 0.78, 0.82, 1.2, 0, 1.2, 2.9, 14).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const bl = box(p, M.prop, 0.3, 3.0, 0.11, 0, 1.2, 3.6);
    bl.rotation.z = (i / 3) * Math.PI * 2 + 0.4;
  }
  // Folded wings: swung back and up along the sides, which is the Wildcat's
  // own trick and the reason so many of them fitted on a deck.
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.7, 1.5, 0.3);
    w.rotation.z = s * 1.35;
    w.rotation.x = 0.12;
    p.add(w);
    box(w, M.planeTop, 0.24, 4.4, 1.7, s * 0.1, -2.0, -0.6);
    box(w, M.planeBottom, 0.12, 4.2, 1.5, s * 0.22, -2.0, -0.6);
  }
  box(p, M.planeTop, 0.16, 1.6, 1.3, 0, 2.1, -2.4);
  for (const s of [-1, 1]) box(p, M.planeTop, 1.5, 0.13, 0.9, s * 0.85, 1.2, -2.5);
  for (const s of [-1, 1]) {
    box(p, M.planeTop, 0.22, 0.7, 0.3, s * 0.6, 0.5, 0.9);
    cyl(p, M.prop, 0.3, 0.3, 0.2, s * 0.6, 0.3, 0.9, 10).rotation.z = Math.PI / 2;
  }
  return p;
}

/** A TBF Avenger, wings folded alongside: the biggest thing on her deck. */
function avenger(g, x, y, z, ry) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  box(p, M.planeTop, 1.5, 1.9, 8.2, 0, 1.35, 0);
  box(p, M.planeBottom, 1.4, 0.6, 7.8, 0, 0.5, 0);
  box(p, M.glass, 1.1, 0.7, 2.4, 0, 2.4, 1.2);
  // The ball turret, which is what says Avenger at any distance.
  cyl(p, M.glass, 0.62, 0.62, 0.8, 0, 2.5, -1.3, 12);
  cyl(p, M.gunDark, 0.9, 0.95, 1.4, 0, 1.4, 4.4, 14).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const bl = box(p, M.prop, 0.34, 3.9, 0.12, 0, 1.4, 5.2);
    bl.rotation.z = (i / 3) * Math.PI * 2 + 0.9;
  }
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.85, 1.7, 0.9);
    w.rotation.z = s * 1.42;
    w.rotation.x = 0.16;
    p.add(w);
    box(w, M.planeTop, 0.3, 6.2, 2.1, s * 0.12, -2.9, -0.9);
    box(w, M.planeBottom, 0.16, 6.0, 1.9, s * 0.26, -2.9, -0.9);
  }
  box(p, M.planeTop, 0.2, 2.2, 1.9, 0, 2.6, -3.6);
  for (const s of [-1, 1]) box(p, M.planeTop, 2.2, 0.16, 1.2, s * 1.2, 1.35, -3.7);
  for (const s of [-1, 1]) {
    box(p, M.planeTop, 0.26, 0.95, 0.36, s * 1.1, 0.6, 1.5);
    cyl(p, M.prop, 0.38, 0.38, 0.26, s * 1.1, 0.38, 1.5, 10).rotation.z = Math.PI / 2;
  }
  return p;
}

/**
 * A deckload spot: the air group ranged aft the way it was before a strike,
 * fighters first because they take off in the shortest run.
 */
function airGroup(g) {
  const y = FD + 0.35;
  const z0 = -FDL * 0.40;
  let z = z0;
  // Six Wildcats in two ranks.
  for (let i = 0; i < 6; i++) {
    const s = i % 2 ? 1 : -1;
    wildcat(g, s * 5.2 + (i % 2 ? 1.4 : -1.4), y, z + Math.floor(i / 2) * 7.4, s * 0.13);
  }
  z += 24;
  // Nine Dauntlesses, wings out, staggered across the deck.
  for (let i = 0; i < 9; i++) {
    const col = i % 3;
    dauntless(g, (col - 1) * 8.2, y, z + Math.floor(i / 3) * 8.6, (col - 1) * 0.08);
  }
  z += 28;
  // Four Avengers at the after end, where there is width for their span.
  for (let i = 0; i < 4; i++) {
    const s = i % 2 ? 1 : -1;
    avenger(g, s * 6.0, y, z + Math.floor(i / 2) * 10.2, s * 0.1);
  }
}

// ------------------------------------------------------------------ build --

/**
 * The whole ship, welded down to one mesh per material.
 *
 * @returns {{group: THREE.Group, length: number, beam: number, deckY: number}}
 */
/**
 * Every piece she is built from, in world axis-aligned boxes, before the weld.
 *
 * Only used by the tests, which check that nothing is left hanging in the air:
 * a model this size is easy to break by moving one deck and forgetting what
 * stood on it.
 */
export function enterpriseParts() {
  const g = new THREE.Group();
  buildHull(g);
  hangarSides(g);
  groundTackle(g);
  flightDeck(g);
  catwalks(g);
  island(g);
  armament(g);
  boatsAndCranes(g);
  g.updateMatrixWorld(true);
  const parts = [];
  g.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    o.geometry.computeBoundingBox();
    const lb = o.geometry.boundingBox;
    const bb = lb.clone().applyMatrix4(o.matrixWorld);
    parts.push({
      min: [bb.min.x, bb.min.y, bb.min.z],
      max: [bb.max.x, bb.max.y, bb.max.z],
      // Its own size, before it was turned: a gun barrel laid at forty degrees
      // has a fat axis-aligned box and is still a stick.
      size: [lb.max.x - lb.min.x, lb.max.y - lb.min.y, lb.max.z - lb.min.z],
    });
  });
  return parts;
}

export function buildEnterprise() {
  const g = new THREE.Group();
  buildHull(g);
  hangarSides(g);
  groundTackle(g);
  flightDeck(g);
  catwalks(g);
  island(g);
  armament(g);
  boatsAndCranes(g);
  airGroup(g);
  mergeStatic(g);
  return {
    group: g,
    // In the order the sponsons were built, which is the order the datasheet
    // lists them: starboard forward pair, starboard after pair, then port.
    turrets: g.userData.turrets || [],
    length: LOA, beam: FDW, deckY: HANGAR, flightDeckY: FD,
  };
}

export { LOA, FDW, FDL, HANGAR, FD };
