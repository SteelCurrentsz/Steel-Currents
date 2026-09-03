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
//   length overall        262.0 m      flight deck      254.5 x 26 m
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
import { AERO, launchProfile } from './aero.js';
import { DECK_RUN } from '../../../shared/sim.js';

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
  // The hangar is lit, and no light in this scene reaches inside it, so its
  // surfaces are drawn at a fixed tone rather than shaded. A Lambert surface
  // with nothing shining on it is black, which is what made the openings read
  // as holes cut in the side rather than as a space with a deck in it.
  hangarDeck: new THREE.MeshBasicMaterial({ color: 0x474d55 }),
  hangarSteel: new THREE.MeshBasicMaterial({ color: 0x565d66 }),
  hangarDark: new THREE.MeshBasicMaterial({ color: 0x363c43 }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xd9d3bd }),
  // Drawn flat for the same reason as the hangar behind them: a curtain in a
  // shadowed opening that takes no light is indistinguishable from a hole.
  curtain: new THREE.MeshBasicMaterial({ color: 0x3d454e }),
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
  // Insignia blue, which is the only other colour on a 1942 aeroplane.
  insignia: new THREE.MeshLambertMaterial({ color: 0x1d3866 }),
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
const LOA = 262.0;
const WLB = 25.4;              // waterline beam
const FDW = 26.0;              // flight deck width
const FDL = 254.5;             // flight deck length
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
  if (t > 0.32) {
    // The entrance: hollow, so the waterlines are concave before they meet the
    // stem rather than running straight into a wedge. It begins a third of the
    // way forward of amidships and takes the rest of her to close, which is
    // what a thirty-three knot hull wants and what makes her look like one.
    // Clamped: a station exactly at the stem puts k a hair over one in floating
    // point, and a negative number to a fractional power is not a number.
    const k = Math.min(1, (t - 0.32) / 0.68);
    return b * Math.max(0.007, Math.pow(Math.max(0, 1 - k * k), 0.72));
  }
  if (t < -0.52) {
    // The run, drawn out over the after half and closing into a transom under
    // a third of the beam across.
    const k = (-t - 0.52) / 0.48;
    return b * (1 - 0.71 * Math.pow(k, 1.5));
  }
  // Parallel midbody, with the small swell amidships that every hull has.
  return b * (1 - 0.05 * t * t);
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
const STEM = 7.8;      // how far the forecastle stands ahead of the forefoot
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
      // The opening itself. An open bay is left open -- there is a hangar
      // behind it to see now -- and the rest carry their curtain rolled down.
      if (!open) {
        box(g, M.curtain, 0.2, HTOP - HANGAR - 2.0, len - 1.0,
          s * (x - 0.16), mid + 0.05, zc);
      }
      if (!open) {
        // The roll the curtain winds onto, under the header.
        const r = cyl(g, M.steelDark, 0.24, 0.24, len - 1.2, s * (x - 0.3), HTOP - 1.4, zc, 8);
        r.rotation.x = Math.PI / 2;
      }
    }
    // The hangar overhead, seen from outside as the strip above the openings.
    if (overWell(zc)) {
      for (const s of [-1, 1]) {
        box(g, M.steelDark, x - 0.2 - LIFT_HW, 0.3, len,
          s * (LIFT_HW + (x - 0.2 - LIFT_HW) / 2), HTOP + 0.15, zc);
      }
    } else {
      box(g, M.steelDark, 2 * x - 0.4, 0.3, len, 0, HTOP + 0.15, zc);
    }
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
    if (overWell(zc)) {
      for (const s of [-1, 1]) {
        box(g, M.steelDark, GW - LIFT_HW, 0.32, len + 0.1,
          s * (LIFT_HW + (GW - LIFT_HW) / 2), GALLERY, zc);
      }
    } else {
      box(g, M.steelDark, 2 * GW, 0.32, len + 0.1, 0, GALLERY, zc);
    }
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

// ---------------------------------------------------- inside the hangar --

/**
 * The hangar deck, which is the reason the ship exists.
 *
 * A hundred and ninety metres of it, five and a half clear to the overhead, and
 * until now it was a black void behind the side openings. It is a working space:
 * plated deck with the tie-down strips let into it, transverse girders and
 * deckhead lights overhead, pillars taking the flight deck's weight down through
 * it, aircraft ranged along both sides with their wings folded, and the benches,
 * drums, crates and tractors of the people who kept them flying. All of it reads
 * through the side openings and, when a lift is down, straight up the well.
 */
function hangarInterior(g) {
  const zA = zAt(HGR_A, HANGAR) + 1.0;
  const zF = zAt(HGR_F, HANGAR) - 1.0;
  const at = (z) => Math.max(-1, Math.min(1, z / (LOA / 2)));
  const half = (z) => Math.max(2, sideX(at(z)) - 0.45);

  // The deck: plating with the tie-down strips down it fore and aft.
  const N = 40;
  for (let i = 0; i < N; i++) {
    const z0 = zA + ((zF - zA) * i) / N;
    const z1 = zA + ((zF - zA) * (i + 1)) / N;
    const zc = (z0 + z1) / 2;
    box(g, M.hangarDeck, 2 * half(zc), 0.3, z1 - z0 + 0.1, 0, HANGAR + 0.15, zc);
  }
  for (const dx of [-9.5, -5.5, -2.0, 2.0, 5.5, 9.5]) {
    box(g, M.hangarDark, 0.34, 0.1, zF - zA, dx, HANGAR + 0.34, (zA + zF) / 2);
  }

  // Overhead: transverse girders on their brackets, two longitudinal beams
  // running the length, and the deckhead lights between them.
  const bays = 26;
  for (let i = 0; i <= bays; i++) {
    const z = zA + ((zF - zA) * i) / bays;
    const w = half(z) - 0.3;
    if (overWell(z)) {
      for (const s of [-1, 1]) {
        box(g, M.hangarSteel, w - LIFT_HW, 0.55, 0.4,
          s * (LIFT_HW + (w - LIFT_HW) / 2), HTOP - 0.5, z);
      }
    } else {
      box(g, M.hangarSteel, 2 * w, 0.55, 0.4, 0, HTOP - 0.5, z);
    }
    for (const s of [-1, 1]) {
      const br = box(g, M.hangarSteel, 1.4, 0.3, 0.3, s * (w - 0.5), HTOP - 1.1, z);
      br.rotation.z = -s * 0.6;
    }
    if (i % 2 === 1 && !overWell(z)) {
      for (const s of [-1, 1]) box(g, M.lamp, 0.7, 0.16, 0.5, s * 4.6, HTOP - 0.85, z);
    }
  }
  for (const s of [-1, 1]) {
    box(g, M.hangarSteel, 0.4, 0.5, zF - zA, s * 7.9, HTOP - 1.0, (zA + zF) / 2);
  }

  // Pillars, carrying the flight deck down through the hangar, clear of the
  // wells and clear of the aircraft lanes.
  for (let i = 0; i < 13; i++) {
    const z = zA + 6 + ((zF - zA - 12) * i) / 12;
    if (overWell(z)) continue;
    for (const s of [-1, 1]) {
      box(g, M.hangarSteel, 0.42, HTOP - HANGAR - 0.4, 0.42, s * 7.9, (HANGAR + HTOP) / 2, z);
    }
  }

  // The fire curtains: rolled divisions that shut the hangar into three.
  for (const z of [zA + (zF - zA) * 0.34, zA + (zF - zA) * 0.68]) {
    if (overWell(z)) continue;
    const w = half(z) - 0.4;
    box(g, M.hangarDark, 2 * w, 0.9, 0.28, 0, HTOP - 1.5, z);
    for (const s of [-1, 1]) {
      box(g, M.hangarSteel, 0.3, HTOP - HANGAR - 0.4, 0.3, s * w, (HANGAR + HTOP) / 2, z);
    }
  }

  // Aircraft struck below, wings folded, ranged along both sides.
  const park = [-0.86, -0.72, -0.58, -0.44, -0.16, -0.02, 0.14, 0.30,
    0.52, 0.64, 0.76, 0.88];
  park.forEach((u, i) => {
    const z = (zA + zF) / 2 + u * ((zF - zA) / 2);
    if (overWell(z)) return;
    const s = i % 2 ? 1 : -1;
    const ry = s > 0 ? 1.5 : -1.5;
    // Struck below in squadron order, aft to forward: the torpedo bombers on
    // the after part of the deck where there is width for them, the dive
    // bombers amidships, the fighters forward and nearest the lifts.
    if (u < -0.4) avenger(g, s * (half(z) - 5.4), HANGAR + 0.55, z, ry);
    else if (u < 0.35) dauntless(g, s * (half(z) - 4.6), HANGAR + 0.55, z, ry, true);
    else wildcat(g, s * (half(z) - 4.0), HANGAR + 0.5, z, ry);
  });

  // The people's gear: benches and racks against the sides, drums, crates, and
  // a pair of deck tractors.
  for (let i = 0; i < 14; i++) {
    const z = zA + 8 + ((zF - zA - 16) * i) / 13;
    if (overWell(z)) continue;
    const s = i % 2 ? 1 : -1;
    const x = s * (half(z) - 0.9);
    box(g, M.hangarDark, 1.3, 1.0, 3.0, x, HANGAR + 0.8, z);
    if (i % 3 === 1) {
      for (const dz of [-0.7, 0.7]) {
        cyl(g, M.gunDark, 0.32, 0.32, 0.9, x - s * 1.2, HANGAR + 0.75, z + dz, 10);
      }
    }
    if (i % 4 === 2) box(g, M.canvas, 1.1, 0.9, 1.6, x - s * 1.4, HANGAR + 0.75, z);
  }
  for (const [tz, ts] of [[zA + 22, -1], [zF - 30, 1]]) {
    if (overWell(tz)) continue;
    const tx = ts * 3.2;
    box(g, M.gunDark, 1.6, 0.9, 3.0, tx, HANGAR + 0.75, tz);
    box(g, M.gunDark, 1.3, 0.7, 1.0, tx, HANGAR + 1.5, tz - 0.6);
    for (const dz of [-1.0, 1.0]) {
      for (const s of [-1, 1]) {
        cyl(g, M.wire, 0.35, 0.35, 0.3, tx + s * 0.85, HANGAR + 0.5, tz + dz, 10)
          .rotation.z = Math.PI / 2;
      }
    }
  }
}

// ------------------------------------------------------------ the lifts --

/**
 * The three lift platforms, which are the only moving thing on her but the guns.
 *
 * Each is its own group so the welder leaves it alone, and each carries what it
 * is bringing up: an aircraft comes off the hangar deck, rides up the well and
 * is on the flight deck a few seconds later. That is the whole point of the
 * ship, and until now the elevators were three painted rectangles.
 *
 * @returns {Array<{group: THREE.Group, phase: number}>}
 */
function elevators(g) {
  const lifts = [];
  const zs = liftZs();
  zs.forEach((z, i) => {
    const lift = new THREE.Group();
    lift.position.set(0, FD, z);
    lift.userData.dynamic = true;
    g.add(lift);
    // The platform: a plated deck with its own planking over the steel.
    box(lift, M.hullDark, 2 * LIFT_HW - 0.3, 0.5, 2 * LIFT_HW - 0.3, 0, -0.42, 0);
    for (let k = 0; k < 14; k++) {
      const w = (2 * LIFT_HW - 0.5) / 14;
      box(lift, k % 3 === 1 ? M.deckDark : M.deck, w - 0.05, 0.3, 2 * LIFT_HW - 0.5,
        -LIFT_HW + 0.25 + w * (k + 0.5), -0.15, 0);
    }
    // Its edge coaming, and the guide shoes that ride the rails in the trunk.
    for (const s of [-1, 1]) {
      box(lift, M.steelDark, 0.2, 0.35, 2 * LIFT_HW - 0.3, s * (LIFT_HW - 0.2), -0.02, 0);
      box(lift, M.steelDark, 2 * LIFT_HW - 0.3, 0.35, 0.2, 0, -0.02, s * (LIFT_HW - 0.2));
      for (const dz of [-LIFT_HW + 1.2, LIFT_HW - 1.2]) {
        box(lift, M.steel, 0.4, 0.6, 0.5, s * (LIFT_HW - 0.35), -0.45, dz);
      }
    }
    // The forward and midships lifts run empty. A lift at the top is part of
    // the flight deck, so an aeroplane parked on one is an aeroplane on the
    // runway -- and there is never anything on the runway but the one going
    // off it. The ready aircraft is on the after lift, and it is not built
    // into the lift: it lives on the ship and rides it, so it can get off.
    mergeStatic(lift);
    lifts.push({ group: lift, phase: i / zs.length });
  });
  return lifts;
}

/** The aircraft that flies when she launches, and where it waits. */
function deckAircraft(g) {
  const plane = new THREE.Group();
  plane.userData.dynamic = true;
  g.add(plane);
  const body = avenger(plane, 0, 0, 0, 0, true, true);
  return {
    group: plane,
    prop: body.userData.prop || null,
    wings: body.userData.wings || null,
    gear: body.userData.gear || null,
  };
}

const LIFT_DROP = FD - HANGAR - 0.55;

// The launch, phase by phase. Everything before the flag is deck handling and
// is timed; the run itself is flown and takes as long as the aeroplane takes.
const DOWN = 1.2;       // the lift on its way to the hangar
const UP = 3.6;         // and back to the flight deck, wings going out on the way
const TAXIED = 6.4;     // taxied forward off the lift and lined up
const ROLL = 7.6;       // run up against the brakes, and the flag
const TAXI = 20;        // metres of deck she taxis forward over
/** Ease a 0..1 run so machinery starts and stops rather than snapping. */
function ease(k) { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); }

/**
 * Her deck cycle: the lifts working, and the launch when one is called for.
 *
 * Idle, each lift runs its own slow round -- at the flight deck, down the well,
 * on the hangar deck, back up -- staggered so the three are never doing the
 * same thing at once, and the after lift has the ready aircraft standing on it.
 *
 * A launch is the whole evolution, because that is what it looks like from the
 * bridge and it is the reason the ship exists: the after lift takes her down to
 * the hangar deck, brings her up, she taxis aft to the spot, runs up against
 * the brakes, and goes down the deck and off over the bow. Twelve seconds, and
 * the aeroplane the simulation then flies is the one you watched leave.
 */
export function stepDeck(deck, t) {
  if (!deck) return;
  const { lifts, plane } = deck;
  const aft = lifts[lifts.length - 1];
  // How long each part of the evolution takes. Everything up to the flag is a
  // handling job and is timed; everything after it is flown, and takes as long
  // as the aeroplane takes.
  const LAUNCH = ROLL + (deck.profile ? deck.profile.rows.length * deck.profile.dt : 12);
  // Played so that she leaves the deck exactly when the simulation puts her
  // squadron in the air. Left to run at its own length the evolution took four
  // seconds longer, and for those four seconds the squadron was already up:
  // three markers flying off the bow while the aeroplane you were watching was
  // still on the planking, which is the aircraft that appeared out of nothing.
  const pace = LAUNCH / DECK_RUN;
  const run = deck.launchAt === null ? -1 : (t - deck.launchAt) * pace;

  // The lifts, idling.
  const PERIOD = 34;
  for (const l of lifts) {
    if (l === aft && run >= 0 && run < LAUNCH) continue;
    let u = ((t / PERIOD) + l.phase) % 1;
    if (u < 0) u += 1;
    let k = 0;                                   // 0 at the flight deck, 1 below
    if (u < 0.36) k = 0;
    else if (u < 0.48) k = (u - 0.36) / 0.12;
    else if (u < 0.86) k = 1;
    else k = 1 - (u - 0.86) / 0.14;
    l.group.position.y = FD - LIFT_DROP * ease(k);
  }

  if (!plane) return;
  const p = plane.group;
  const AFT_Z = aft.group.position.z;
  // Wings spread or stowed. Folded she is struck below and rides the lift;
  // spread she is ready to go, and she cannot fly any other way.
  const wings = (out) => {
    if (!plane.wings) return;
    plane.wings.spread.visible = out;
    plane.wings.stowed.visible = !out;
  };
  const gear = (u) => { if (plane.gear) plane.gear(u); };

  if (deck.airborne) return;        // she is flying; the scene has her now
  if (run >= LAUNCH) {
    // The evolution is over, so she went -- and she has to be handed over
    // whether or not a frame happened to land in the last tenth of a second of
    // the deck run. At five frames a second it would not, and she would snap
    // back to the lift with the squadron she is flying still in the air.
    deck.airborne = true;
    aft.group.position.y = FD;
    wings(true);
    gear(1);
    p.visible = true;
    // Where the deck run actually left her, not a spot picked by hand: put her
    // anywhere else and she jumps at the moment she is handed over.
    const end = deck.profile ? deck.profile.rows[deck.profile.rows.length - 1] : null;
    const spotZ = aft.group.position.z - 0.45 + TAXI;
    p.position.set(0, FD + (end ? end[1] : 26.34) + 0.34, spotZ + (end ? end[0] : 210));
    p.rotation.set(end ? -end[2] : -0.20, 0, 0);
    return;
  }
  if (run < 0) {
    // Waiting: standing on the after lift, wherever the lift happens to be.
    wings(false);
    gear(0);
    p.visible = true;
    p.position.set(0, aft.group.position.y + 0.34, AFT_Z - 0.45);
    p.rotation.set(0, 0.08, 0);
    if (plane.prop) plane.prop.rotation.z = 0;
    return;
  }

  // Where she starts her run: off the lift and forward onto the centreline.
  // She used to be dragged thirty-nine metres AFT to a spot behind the lift,
  // nose-first, which is a hundred-ton aeroplane sliding backwards -- correct
  // for handlers ranging her, and unreadable as taxiing. She taxis forward
  // under her own power instead, which is what it looks like from the island.
  const LIFT_Z = AFT_Z - 0.45;
  const SPOT = LIFT_Z + TAXI;
  let y = FD;
  let z = LIFT_Z;
  let pitch = 0;
  let yaw = 0.08;
  let turning = 0;                      // how fast the propeller is going round

  if (run < DOWN) {
    // Down the well with her, to the hangar deck.
    wings(false);
    gear(0);
    const k = ease(run / DOWN);
    y = deck.startY + (FD - LIFT_DROP - deck.startY) * k;
    aft.group.position.y = y;
  } else if (run < UP) {
    // And back up, which is the lift doing the job it is there for. Her wings
    // go out on the way, once she is clear of the hangar overhead.
    const k = ease((run - DOWN) / (UP - DOWN));
    y = (FD - LIFT_DROP) + LIFT_DROP * k;
    aft.group.position.y = y;
    turning = k * 8;
    wings(run > UP - 0.9);
  } else if (run < TAXIED) {
    // Taxiing: forward off the lift under power, swinging onto the centreline
    // as she goes. Fourteen knots, which is a brisk taxi.
    const k = ease((run - UP) / (TAXIED - UP));
    aft.group.position.y = FD;
    wings(true);
    gear(0);
    z = LIFT_Z + TAXI * k;
    yaw = 0.08 * (1 - k);
    turning = 11;
    // She rocks a little on her oleos as she rolls.
    pitch = 0.006 * Math.sin(run * 9);
  } else if (run < ROLL) {
    // Held on the brakes with the engine wound right up, waiting for the flag.
    aft.group.position.y = FD;
    z = SPOT;
    yaw = 0;
    turning = 30;
    pitch = -0.012 * Math.sin((run - TAXIED) * 22);
  } else {
    // The deck run, flown rather than drawn: thrust against drag and rolling
    // friction, the wing taking her weight as the speed builds, and the wheels
    // leaving the planking when it finally does. Read out of the profile the
    // physics was integrated into, so the evolution is the same every time and
    // the same on every screen.
    aft.group.position.y = FD;
    wings(true);
    const pr = deck.profile;
    const i = Math.min(pr.rows.length - 1, Math.max(0, Math.round((run - ROLL) / pr.dt)));
    const [s2, h, th, up] = pr.rows[i];
    z = SPOT + s2;
    y = FD + h;
    pitch = -th;
    yaw = 0;
    turning = 34;
    gear(up ? Math.min(1, (h - 3) / 14) : 0);
    // Once she is well clear of the bow -- and once the simulation has actually
    // put her squadron up -- she belongs to whatever is flying her.
    if (z > fdEndF(0) + 40 && run >= LAUNCH) deck.airborne = true;
  }

  p.visible = true;
  p.position.set(0, y + 0.34, z);
  p.rotation.set(pitch, yaw, 0);
  if (plane.prop) plane.prop.rotation.z += turning * 0.05;
}

/**
 * When each part of the evolution happens, on the clock the ship is stepped
 * with rather than on the evolution's own.
 *
 * The whole thing is played at whatever pace makes her leave the deck exactly
 * when the simulation puts her squadron up, so the wall-clock time of "wings
 * out" moves with the aeroplane's deck run. Anything that wants to know when
 * a phase happens has to ask, not count seconds of its own.
 */
export function deckPhases(deck) {
  const LAUNCH = ROLL + (deck && deck.profile ? deck.profile.rows.length * deck.profile.dt : 12);
  const k = DECK_RUN / LAUNCH;
  return { down: DOWN * k, up: UP * k, taxied: TAXIED * k, roll: ROLL * k, launch: DECK_RUN };
}

/** Kept for the tests and for anything that only wants the lifts moved. */
export function stepLifts(lifts, t) {
  stepDeck({ lifts, plane: null, launchAt: null, startY: FD, airborne: false }, t);
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

/**
 * The three centreline lifts.
 *
 * Each one is a hole through the ship: through the flight deck, through the
 * gallery deck under it and through the hangar overhead, with a platform
 * running up and down inside it. Everything laid across those decks has to be
 * cut round the wells, which is why they are declared here rather than inside
 * the deck that happens to draw them first.
 */
const LIFT_HW = 7.4;                 // half the well, athwartships and fore-and-aft
const LIFT_AT = [0.34, 0.0, -0.30];  // where they sit along the flight deck
function liftZs() { return LIFT_AT.map((u) => u * FDL + FD_MID); }

/** The parts of a fore-and-aft run that are not over a well. */
function clearOfWells(z0, z1) {
  let spans = [[z0, z1]];
  for (const lz of liftZs()) {
    const a = lz - LIFT_HW;
    const b = lz + LIFT_HW;
    const out = [];
    for (const [s0, s1] of spans) {
      if (b <= s0 || a >= s1) { out.push([s0, s1]); continue; }
      if (s0 < a - 0.01) out.push([s0, a]);
      if (s1 > b + 0.01) out.push([b, s1]);
    }
    spans = out;
  }
  return spans;
}

/** Whether a station lies over a well at all. */
function overWell(z) { return liftZs().some((lz) => Math.abs(z - lz) < LIFT_HW); }
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
    const m = i % 3 === 1 ? M.deckDark : M.deck;
    // Planks over a lift stop at the well and start again the far side of it:
    // the hole has to be a hole, or the platform comes up through the deck.
    const runs = Math.abs(x) < LIFT_HW ? clearOfWells(za, zf) : [[za, zf]];
    for (const [a, b] of runs) {
      box(g, m, FDW / planks - 0.04, 0.34, b - a, x, FD, (a + b) / 2);
    }
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
    if (overWell(z)) {
      // A frame across a well would be a girder through the middle of the hole.
      for (const s of [-1, 1]) {
        box(g, M.steelDark, w / 2 - LIFT_HW, 0.8, 0.5,
          s * (LIFT_HW + (w / 2 - LIFT_HW) / 2), FD - 0.6, z);
      }
    } else {
      box(g, M.steelDark, w, 0.8, 0.5, 0, FD - 0.6, z);
    }
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
  // The centreline is painted on the deck, so where there is no deck there is
  // no line: it stops at each well and picks up the far side. Run it straight
  // through and it hangs across the opening whenever a lift goes down.
  for (const [a, b] of clearOfWells(FD_MID - FDL * 0.43, FD_MID + FDL * 0.43)) {
    box(g, M.mark, 0.5, 0.06, b - a, 0, FD + 0.2, (a + b) / 2);
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i < 30; i++) {
      const z = fdEndA(0) + 8 + i * 4.4;
      if (z > fdEndF(0) - 8) break;
      const x = s * (fdHalf(z) - 2.2);
      const m = box(g, M.mark, 0.34, 0.06, 2.6, x, FD + 0.2, z);
      m.rotation.y = s * Math.atan2(fdHalf(z + 2) - fdHalf(z - 2), 4);
    }
  }

  // The three wells: coaming round the opening in the flight deck, and the
  // trunk that runs down from it to the hangar for the platform to move in.
  for (const z of liftZs()) {
    for (const s of [-1, 1]) {
      box(g, M.steelDark, 0.3, 0.45, 2 * LIFT_HW + 0.6, s * LIFT_HW, FD + 0.18, z);
      box(g, M.steelDark, 2 * LIFT_HW + 0.6, 0.45, 0.3, 0, FD + 0.18, z + s * LIFT_HW);
      // The trunk, and the guide rails the platform runs on.
      box(g, M.hullDark, 0.3, FD - HANGAR, 2 * LIFT_HW,
        s * (LIFT_HW + 0.15), (FD + HANGAR) / 2, z);
      box(g, M.hullDark, 2 * LIFT_HW + 0.6, FD - HANGAR, 0.3,
        0, (FD + HANGAR) / 2, z + s * (LIFT_HW + 0.15));
      for (const dz of [-LIFT_HW + 1.2, LIFT_HW - 1.2]) {
        box(g, M.steel, 0.22, FD - HANGAR - 0.4, 0.34, s * (LIFT_HW - 0.12),
          (FD + HANGAR) / 2, z + dz);
      }
    }
    // The lift's own machinery: the sheaves over the head of the trunk.
    for (const s of [-1, 1]) {
      const sh = cyl(g, M.steelDark, 0.5, 0.5, 0.3, s * (LIFT_HW - 0.5), FD - 1.0, z, 12);
      sh.rotation.z = Math.PI / 2;
    }
  }

  // Arresting gear: nine wires across the after third, raised on their fairleads.
  // Nine of them, all abaft the after lift: a wire laid across a well has
  // nothing under it for half its length the moment the platform drops.
  for (let i = 0; i < 9; i++) {
    const z = fdEndA(0) + 12 + i * 3.8;
    const w = fdHalf(z) - 1.4;
    tubeX(g, M.wire, 0.075, 2 * w, 0, FD + 0.42, z, 6);
    for (const s of [-1, 1]) {
      box(g, M.steelDark, 0.5, 0.3, 0.5, s * w, FD + 0.3, z);
    }
  }
  // Three crash barriers, forward of the wires: stanchions and their cables.
  for (let i = 0; i < 3; i++) {
    const z = -FDL * 0.24 + i * 6.0 + FD_MID;
    const w = fdHalf(z) - 1.0;
    for (const s of [-1, 1]) {
      box(g, M.steelDark, 0.34, 1.5, 0.34, s * w, FD + 0.9, z);
    }
    tubeX(g, M.wire, 0.09, 2 * w, 0, FD + 1.5, z, 6);
    tubeX(g, M.wire, 0.09, 2 * w, 0, FD + 0.9, z, 6);
  }

  // Palisades: the folding wind screens forward of the parking area.
  {
    const z = FDL * 0.26 + FD_MID;
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
// The light guns built during the current pass, so the builder can hand them
// to the scene. Reset when a build starts: two Enterprises in one action must
// not end up sharing one another's mountings.
let AA_MOUNTS = [];

function bofors(g, x, y, z, ry) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  // She trains: the welder leaves her alone and the scene lays her.
  m.userData.dynamic = true;
  m.userData.rest = ry;
  g.add(m);
  AA_MOUNTS.push(m);
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
  // She trains: the welder leaves her alone and the scene lays her.
  m.userData.dynamic = true;
  m.userData.rest = ry;
  g.add(m);
  AA_MOUNTS.push(m);
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

// ------------------------------------------------------------ her aircraft --
//
// Three types, and each is built round the one thing that identifies it: a
// Wildcat's wings swing back and lie flat along its sides on the Grumman
// sto-wing; a Dauntless has the perforated split flaps above and below its
// trailing edge; an Avenger has the ball turret amidships. Everything else --
// the cowl and its gills, the exhaust stubs, the framing of the greenhouse,
// the arrestor hook, the star on its blue disc -- they share, so it is built
// once and each type says what size it wants it.
//
// Their real dimensions, because they are looked at from a metre away on a
// lift and from the hangar side openings:
//
//   F4F-4 Wildcat    8.8 m long   11.6 m span, 4.4 folded   2.8 m high
//   SBD-3 Dauntless 10.0 m long   12.7 m span, no fold      4.1 m high
//   TBF-1 Avenger   12.2 m long   16.5 m span, 5.6 folded   4.7 m high
//
// In each of these the origin is where the tyres touch the deck, and the nose
// points along +z.

/**
 * A lofted body: a rounded section carried along a set of stations.
 *
 * An aeroplane fuselage is not a brick, and built out of boxes it reads as one.
 * The player now rides one of these off the deck from two metres away, so the
 * body is lofted through its own sections the same way the ship's shell is: a
 * superelliptic ring at each station, stitched between stations, capped at both
 * ends so there is no looking straight up the inside of her.
 *
 * `stations` run from the sternpost forward, each `{ z, w, h, y }` -- the full
 * width and depth of the section there and the height of its centre.
 */
function airframe(p, m, stations, opt = {}) {
  const seg = opt.seg || 20;
  // An aeroplane is very nearly a body of revolution. She was being drawn at
  // 0.78, which is a rounded box, and it made every one of them look like a van
  // with wings; a monocoque fuselage is much closer to an ellipse than that.
  const e = opt.e === undefined ? 0.94 : opt.e;   // 1 is an ellipse, less is boxier
  const flat = opt.flat || 0;                     // flatten the underside by this much
  const pos = [];
  const idx = [];
  for (const st of stations) {
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const x = (st.w / 2) * Math.sign(c) * Math.pow(Math.abs(c), e);
      let y = (st.h / 2) * Math.sign(s) * Math.pow(Math.abs(s), e);
      if (y < 0) y *= 1 - flat;
      pos.push(x, st.y + y, st.z);
    }
  }
  // Blue-grey over light grey, and the line between them runs along the widest
  // point of the section -- which is where the painters put it. The two skins
  // share their vertices and differ only in which faces go to which material.
  const low = [];
  const half = Math.floor(seg / 2);
  const bin = (j) => (j < half ? idx : low);
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      const a = i * seg + j;
      const d = i * seg + j1;
      const b = (i + 1) * seg + j;
      const c = (i + 1) * seg + j1;
      bin(j).push(a, c, b, a, d, c);
    }
  }
  const cap = (i, out) => {
    const st = stations[i];
    const hub = pos.length / 3;
    pos.push(0, st.y, st.z + out * st.w * 0.14);
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      const a = i * seg + j;
      const b = i * seg + j1;
      if (out > 0) bin(j).push(hub, a, b);
      else bin(j).push(hub, b, a);
    }
  };
  if (opt.capA !== false) cap(0, -1);
  if (opt.capF !== false) cap(stations.length - 1, 1);
  const skin = (list, mat) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(list);
    g.computeVertexNormals();
    const o = new THREE.Mesh(g, mat);
    p.add(o);
    return o;
  };
  const top = skin(idx, m);
  skin(low, opt.mBot || m);
  return top;
}

/** Half-thickness of a symmetric section, as a fraction of the chord. */
function foil(u, t) {
  return 5 * t * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u
    + 0.2843 * u * u * u - 0.1015 * u * u * u * u);
}

/**
 * One lifting surface: a tapered panel with a real section, built as an upper
 * skin and a lower skin so the two can be painted apart -- which is the point,
 * because a 1942 aeroplane is blue-grey above and light grey below, and that is
 * what tells you which way up she is against the sea.
 *
 * `x, y, z` is the leading edge at the root; the panel is carried `span` out to
 * `side`, tapering from `rootC` to `tipC`, and the tip is rounded off.
 */
function wing(p, mTop, mBot, o) {
  const S = o.stations || 7;
  const C = o.chordwise || 14;
  const side = o.side;
  const rootC = o.rootC;
  const tipC = o.tipC === undefined ? rootC * 0.6 : o.tipC;
  const t = o.thick === undefined ? 0.115 : o.thick;
  const camber = o.camber === undefined ? 0.022 : o.camber;
  const round = o.round !== false;
  const up = [];
  const dn = [];
  for (let k = 0; k <= S; k++) {
    const f = k / S;
    // Ease the last station in so the tip is rounded off, not sheared square.
    const tipR = round ? Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (f - 0.88) / 0.12), 2))) : 1;
    const c = rootC + (tipC - rootC) * f;
    const x = o.x + side * o.span * f;
    const y = o.y + Math.sin(o.dihedral || 0) * o.span * f;
    const zle = o.z - (o.sweep || 0) * f;
    const tw = (o.twist || 0) * f;
    for (let i = 0; i <= C; i++) {
      const u = i / C;
      const ht = foil(u, t) * c * tipR;
      const yc = camber * 4 * u * (1 - u) * c;
      const lift = tw * (u - 0.25) * c;
      const z = zle - u * c;
      up.push(x, y + yc + ht + lift, z);
      dn.push(x, y + yc - ht + lift, z);
    }
  }
  const skin = (arr, mat, flip) => {
    const idx = [];
    for (let k = 0; k < S; k++) {
      for (let i = 0; i < C; i++) {
        const a = k * (C + 1) + i;
        const b = (k + 1) * (C + 1) + i;
        if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1);
        else idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    p.add(new THREE.Mesh(g, mat));
  };
  skin(up, mTop, side < 0);
  skin(dn, mBot, side > 0);
  // Tip and root, closed between the two skins.
  const shut = (k, mat, flip) => {
    const pos = [];
    for (let i = 0; i <= C; i++) {
      const a = (k * (C + 1) + i) * 3;
      pos.push(up[a], up[a + 1], up[a + 2], dn[a], dn[a + 1], dn[a + 2]);
    }
    const idx = [];
    for (let i = 0; i < C; i++) {
      const a = i * 2;
      if (flip) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    p.add(new THREE.Mesh(g, mat));
  };
  shut(S, mTop, side < 0);
  if (o.rootCap !== false) shut(0, mBot, side > 0);
}

/** A radial in its cowling: gills, cowl ring, spinner, blades, exhaust stubs. */
function radial(p, r, y, z, span, blades = 3, spin = false) {
  const SEG = 20;
  // The engine itself, seen down the throat of the cowl.
  cyl(p, M.gunDark, r * 0.84, r * 0.84, 1.0, 0, y, z - 0.2, SEG).rotation.x = Math.PI / 2;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    cyl(p, M.gunDark, 0.12, 0.12, 0.46, Math.sin(a) * r * 0.6, y + Math.cos(a) * r * 0.6,
      z + 0.08, 6).rotation.x = Math.PI / 2;
  }
  // The cowling: a ring that swells to its widest a third of the way back and
  // then fairs into the fuselage behind it, rather than the drum it was -- a
  // NACA cowl is a wing section wrapped round an engine, not a bucket.
  airframe(p, M.planeTop, [
    { z: z - 1.30, w: r * 2.04, h: r * 2.04, y },
    { z: z - 0.62, w: r * 2.10, h: r * 2.10, y },
    { z: z - 0.10, w: r * 2.06, h: r * 2.06, y },
    { z: z + 0.34, w: r * 1.86, h: r * 1.86, y },
    { z: z + 0.60, w: r * 1.52, h: r * 1.52, y },
  ], { seg: SEG, e: 1, capF: false, capA: false, mBot: M.planeTop });
  // The gills round its after lip, laid into the cowl rather than standing off.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    box(p, M.planeBottom, 0.16, 0.16, 0.26, Math.sin(a) * r * 1.0, y + Math.cos(a) * r * 1.0,
      z - 1.22, a);
  }
  // Spinner, hub and blades. On an aeroplane that is going to run her engine
  // the blades go in a group of their own so the welder leaves them.
  const spinner = cyl(p, M.prop, 0.06, 0.30, 0.74, 0, y, z + 0.86, 14);
  spinner.rotation.x = Math.PI / 2;
  let disc = p;
  if (spin) {
    disc = new THREE.Group();
    disc.position.set(0, y, z + 1.02);
    disc.userData.dynamic = true;
    p.add(disc);
    p.userData.prop = disc;
  }
  for (let i = 0; i < blades; i++) {
    // A blade is not a plank: wide at the root, narrow and twisted at the tip,
    // and it is the twist that catches the light going round.
    const bl = new THREE.Group();
    bl.position.set(0, spin ? 0 : y, spin ? 0 : z + 1.02);
    bl.rotation.z = (i / blades) * Math.PI * 2 + 0.4;
    disc.add(bl);
    const N = 5;
    const L = span / 2;
    for (let k = 0; k < N; k++) {
      const f = (k + 0.5) / N;
      const seg2 = box(bl, M.prop, 0.30 - 0.19 * f, L * 0.9 / N + 0.02, 0.07,
        0, L * (0.10 + 0.9 * f), 0);
      seg2.rotation.y = 0.56 - 0.42 * f;
    }
  }
  // Exhaust stubs out of the cowl's lower flanks.
  for (const sgn of [-1, 1]) {
    cyl(p, M.gunDark, 0.09, 0.09, 0.5, sgn * r * 0.68, y - r * 0.6, z - 1.45, 6)
      .rotation.x = Math.PI / 2;
  }
}

/** A greenhouse: framed bays with the dark of the cockpit behind them. */
function greenhouse(p, w, h, y, z0, z1, bays) {
  const len = z1 - z0;
  box(p, M.cave, w * 0.9, h * 0.9, len, 0, y + h / 2, z0 + len / 2);
  for (let i = 0; i < bays; i++) {
    const d = len / bays;
    const z = z0 + d * (i + 0.5);
    box(p, M.glass, w, h * 0.86, d - 0.1, 0, y + h * 0.5, z);
    box(p, M.planeTop, w + 0.04, h * 0.9, 0.07, 0, y + h * 0.5, z + d / 2);
  }
  // The windscreen, raked back over the instrument panel, and its frame.
  const scr = box(p, M.glass, w * 0.96, h * 0.95, 0.1, 0, y + h * 0.5, z1 + 0.12);
  scr.rotation.x = -0.42;
  const arch = box(p, M.planeTop, w + 0.05, h * 0.99, 0.09, 0, y + h * 0.5, z1 + 0.2);
  arch.rotation.x = -0.42;
  // The rails it slides on, and the coaming round the sill.
  for (const s of [-1, 1]) box(p, M.planeTop, 0.08, 0.1, len, s * w / 2, y, z0 + len / 2);
  box(p, M.planeTop, w + 0.06, 0.12, 0.1, 0, y + h * 0.94, z0 + 0.06);
}

/** Fin, rudder, tailplane and elevators, lofted like the wings they are. */
function empennage(p, finH, finC, span, chord, y, z) {
  // Fin and rudder: one panel stood on edge, so the section is a real one.
  const fin = new THREE.Group();
  fin.position.set(0, y, z);
  fin.rotation.z = Math.PI / 2;
  p.add(fin);
  wing(fin, M.planeTop, M.planeTop, {
    side: 1, x: 0, y: 0, z: finC * 0.55, span: finH, rootC: finC, tipC: finC * 0.5,
    sweep: finC * 0.42, thick: 0.088, camber: 0, stations: 5, chordwise: 9,
  });
  // The rudder hinged on its trailing edge, and the tab on that.
  box(p, M.planeTop, 0.055, finH * 0.76, 0.06, 0, y + finH * 0.44, z - finC * 0.1);
  box(p, M.planeBottom, 0.13, 0.11, finC * 0.34, 0, y + finH * 0.03, z - finC * 0.44);
  for (const s of [-1, 1]) {
    wing(p, M.planeTop, M.planeBottom, {
      side: s, x: 0, y, z: z + chord * 0.5, span: span / 2, rootC: chord,
      tipC: chord * 0.62, sweep: chord * 0.22, thick: 0.095, camber: 0,
      stations: 5, chordwise: 9, rootCap: false,
    });
    // The elevator hinge line, laid into the surface it hinges on.
    box(p, M.planeTop, span / 2 - 0.16, 0.05, 0.06, s * span / 4, y + 0.055,
      z - chord * 0.18);
  }
}

/**
 * The star on its blue disc: upper surfaces of the wings and both sides of the
 * fuselage, which is where the 1942 marking went.
 *
 * The star is built out of five arms rather than drawn as a five-sided disc: a
 * pentagon at this range is a blob, and the shape is the only thing on the
 * aeroplane that says whose it is.
 */
function insignia(p, x, y, z, r, up = true) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  if (!up) m.rotation.z = Math.PI / 2;    // stand it on the fuselage side
  p.add(m);
  cyl(m, M.insignia, r, r, 0.06, 0, 0, 0, 16);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.2;
    box(m, M.star, r * 0.36, 0.05, r * 0.95,
      Math.sin(a) * r * 0.42, 0.055, Math.cos(a) * r * 0.42, a);
  }
  cyl(m, M.star, r * 0.32, r * 0.32, 0.05, 0, 0.055, 0, 10);
}

/** A main leg: oleo, scissors, wheel and the door on its side. */
function mainGear(p, s, x, z, len, r, rake = 0.12) {
  const leg = new THREE.Group();
  leg.position.set(x, len, z);
  leg.rotation.z = -s * rake;
  p.add(leg);
  cyl(leg, M.planeBottom, 0.12, 0.14, len * 0.62, 0, -len * 0.3, 0, 8);
  cyl(leg, M.bright, 0.085, 0.085, len * 0.44, 0, -len * 0.72, 0, 8);
  box(leg, M.planeBottom, 0.05, len * 0.3, 0.16, s * 0.12, -len * 0.5, 0.1);
  const tyre = cyl(leg, M.prop, r, r, 0.28, s * 0.16, -len * 0.93, 0, 14);
  tyre.rotation.z = Math.PI / 2;
  cyl(leg, M.bright, r * 0.42, r * 0.42, 0.3, s * 0.16, -len * 0.93, 0, 10)
    .rotation.z = Math.PI / 2;
  box(p, M.cave, 0.5, 0.16, 0.66, x - s * 0.1, len * 0.1, z);
  return leg;
}

/** Tailwheel and the hook stowed up under the sternpost. */
function tailGear(p, z, r, hookLen, len = 0.42) {
  // The wheel and its leg in a group of their own, so they can be swung up
  // into the sternpost; the hook stays where it is, because a hook that goes
  // up with the wheel is a hook that cannot catch a wire.
  const leg = new THREE.Group();
  leg.position.set(0, r + len, z);
  p.add(leg);
  cyl(leg, M.planeBottom, 0.09, 0.11, len, 0, -len * 0.52, 0, 8);
  cyl(leg, M.prop, r, r, 0.16, 0, -len, 0, 10).rotation.z = Math.PI / 2;
  const hook = box(p, M.gunDark, 0.09, 0.09, hookLen, 0, r + 0.75, z - hookLen * 0.42);
  hook.rotation.x = -0.34;
  box(p, M.gunDark, 0.2, 0.16, 0.3, 0, r + 0.4, z - hookLen * 0.86);
  return leg;
}

/**
 * A panel folded on the Grumman sto-wing.
 *
 * The hinge is skewed, so the panel does two things at once: it stands up on
 * edge with its leading edge down, and it swings aft until it lies fore and aft
 * alongside the fuselage. Both come out of the same pair of right angles -- the
 * span turned aft, the chord turned up -- with a little skew on top so the tips
 * ride up as they go back, which is what it looks like on a deck.
 */
function foldWing(p, s, o) {
  const hinge = new THREE.Group();
  hinge.position.set(o.at[0], o.at[1], o.at[2]);
  hinge.rotation.x = o.skew || 0;          // tips carried up as they go aft
  hinge.rotation.z = s * (o.lean || 0);
  p.add(hinge);
  const w = new THREE.Group();
  w.rotation.order = 'ZYX';
  w.rotation.y = s * Math.PI / 2;          // the span swung aft
  w.rotation.z = -s * Math.PI / 2;         // the chord stood on end, LE down
  hinge.add(w);
  wing(w, M.planeTop, M.planeBottom, {
    side: s, x: 0, y: 0, z: 0, span: o.span, rootC: o.rootC, tipC: o.tipC,
    sweep: o.sweep, thick: o.thick, camber: 0.02, twist: -0.02,
  });
  // The guns in the leading edge, which folded is the bottom edge.
  for (const [gx, gy] of o.guns || []) {
    box(w, M.gunDark, 0.22, 0.22, 0.24, s * gx, gy, -0.16);
  }
  // The star, on what is now the outboard face of her.
  insignia(w, s * o.span * 0.54, 0.16, -o.rootC * 0.5, o.star);
  return w;
}

// A carrier aeroplane stands on her tail: nose up, so the wing is at an angle
// of attack while she is still on the deck and she flies herself off it. That
// is done here by carrying the centreline up as it goes forward -- the frames
// stay upright, which is what they are, and the gear stays where it belongs:
// a long main leg forward and a stub wheel under the sternpost.
const sitline = (f, k) => (z) => f + k * z;

/** An F4F-4 Wildcat with her wings swung back flat along her sides. */
function wildcat(g, x, y, z, ry) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  const cl = sitline(1.36, 0.15);
  // The barrel body: deepest at the wing, tapering hard to a slender sternpost.
  airframe(p, M.planeTop, [
    { z: -4.05, w: 0.18, h: 0.58, y: cl(-4.05) + 0.35 },
    { z: -3.50, w: 0.42, h: 0.86, y: cl(-3.50) + 0.27 },
    { z: -2.80, w: 0.66, h: 1.12, y: cl(-2.80) + 0.18 },
    { z: -2.00, w: 0.86, h: 1.36, y: cl(-2.00) + 0.11 },
    { z: -1.10, w: 1.04, h: 1.56, y: cl(-1.10) + 0.05 },
    { z: -0.20, w: 1.18, h: 1.72, y: cl(-0.20) + 0.01 },
    { z: 0.60, w: 1.24, h: 1.80, y: cl(0.60) },
    { z: 1.40, w: 1.24, h: 1.80, y: cl(1.40) },
    { z: 2.20, w: 1.18, h: 1.70, y: cl(2.20) + 0.02 },
    { z: 2.90, w: 1.08, h: 1.52, y: cl(2.90) + 0.05 },
    { z: 3.55, w: 0.94, h: 1.30, y: cl(3.55) + 0.08 },
  ], { flat: 0.10, e: 0.95, mBot: M.planeBottom });
  radial(p, 0.8, cl(3.9) + 0.08, 3.85, 3.0);
  greenhouse(p, 0.96, 0.64, cl(1.0) + 0.86, 0.05, 1.65, 3);
  // The turtledeck aft of the hood, running down to the fin.
  airframe(p, M.planeTop, [
    { z: -3.60, w: 0.30, h: 0.30, y: cl(-3.60) + 0.42 },
    { z: -2.20, w: 0.62, h: 0.52, y: cl(-2.20) + 0.52 },
    { z: -0.90, w: 0.82, h: 0.66, y: cl(-0.90) + 0.62 },
    { z: 0.00, w: 0.90, h: 0.70, y: cl(0.00) + 0.66 },
  ], { flat: 0.3, e: 0.96, capF: false, mBot: M.planeTop });
  // The sto-wing: the panels pivot on a skewed hinge at the root, stand up on
  // edge with the leading edge down, and swing aft to lie fore and aft along
  // her sides. It is why twice as many of them fitted below as of anything
  // else, and the aeroplane ends up no wider than her own tailplane.
  for (const s of [-1, 1]) foldWing(p, s, {
    at: [s * 0.62, cl(1.05) - 0.74, 1.6], skew: 0.10, lean: 0.05,
    span: 4.15, rootC: 1.80, tipC: 1.26, sweep: 0.30, thick: 0.112,
    star: 0.56, guns: [[0.9, 0.14], [2.0, 0.11]],
  });
  // The hinge fairings left standing at the roots, and the stub the panels
  // fold off.
  for (const s of [-1, 1]) {
    box(p, M.planeTop, 0.56, 0.78, 1.5, s * 0.68, cl(1.1) - 0.14, 1.25);
    const hinge = box(p, M.planeBottom, 0.86, 0.34, 1.0, s * 0.98, cl(1.1) - 0.12, 1.3);
    hinge.rotation.z = s * 0.22;
  }
  insignia(p, 0.40, cl(-1.5) + 0.08, -1.5, 0.38, false);
  insignia(p, -0.40, cl(-1.5) + 0.08, -1.5, 0.38, false);
  empennage(p, 1.34, 1.16, 3.75, 0.92, cl(-3.5) + 0.34, -3.3);
  // Her narrow-track gear cranks up into the fuselage sides, so it stands close
  // in under her and the wheels are half buried when it is down.
  for (const s of [-1, 1]) mainGear(p, s, s * 0.72, 1.5, 1.02, 0.34, 0.02);
  tailGear(p, -3.85, 0.17, 1.0, 0.3);
  // Aerial mast and the wire back to the fin.
  box(p, M.planeTop, 0.07, 0.62, 0.07, 0, cl(0.5) + 1.32, 0.5);
  const wire = box(p, M.wire, 0.03, 0.03, 3.9, 0, cl(-1.4) + 1.28, -1.4);
  wire.rotation.x = -0.2;
  return p;
}

/** An SBD Dauntless: the perforated dive flaps are the whole point of her. */
function dauntless(g, x, y, z, ry, folded = false) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  const cl = sitline(1.44, 0.13);
  airframe(p, M.planeTop, [
    { z: -4.85, w: 0.18, h: 0.56, y: cl(-4.85) + 0.37 },
    { z: -4.20, w: 0.38, h: 0.82, y: cl(-4.20) + 0.29 },
    { z: -3.40, w: 0.58, h: 1.04, y: cl(-3.40) + 0.20 },
    { z: -2.40, w: 0.76, h: 1.22, y: cl(-2.40) + 0.13 },
    { z: -1.30, w: 0.92, h: 1.40, y: cl(-1.30) + 0.06 },
    { z: -0.20, w: 1.02, h: 1.52, y: cl(-0.20) + 0.01 },
    { z: 0.90, w: 1.08, h: 1.58, y: cl(0.90) },
    { z: 2.00, w: 1.06, h: 1.54, y: cl(2.00) + 0.01 },
    { z: 3.00, w: 0.98, h: 1.40, y: cl(3.00) + 0.04 },
    { z: 3.80, w: 0.88, h: 1.24, y: cl(3.80) + 0.07 },
  ], { flat: 0.08, e: 0.95, mBot: M.planeBottom });
  radial(p, 0.72, cl(4.0) + 0.06, 3.95, 3.2);
  // The greenhouse: pilot forward, gunner aft under a long open hood.
  greenhouse(p, 0.92, 0.70, cl(0.9) + 0.76, -1.0, 2.05, 4);
  box(p, M.cave, 0.84, 0.5, 1.4, 0, cl(-1.6) + 0.92, -1.7);
  // His twin thirties on their ring, and the ring itself.
  cyl(p, M.planeTop, 0.46, 0.48, 0.14, 0, cl(-2.0) + 0.98, -2.0, 14);
  for (const s of [-1, 1]) {
    const gun = cyl(p, M.gunDark, 0.055, 0.055, 1.5, s * 0.16, cl(-2.1) + 1.22, -2.1, 6);
    gun.rotation.x = -0.5;
  }
  box(p, M.gunDark, 0.5, 0.12, 0.4, 0, cl(-1.9) + 1.04, -1.9);
  // Wings: a flat centre section with dihedral outboard of it, the ailerons,
  // and the split flaps -- perforated above and below -- that are her mark.
  const WY = cl(0.9) - 0.52;
  for (const s of [-1, 1]) {
    wing(p, M.planeTop, M.planeBottom, {
      side: s, x: 0, y: WY, z: 1.9, span: 1.9, rootC: 2.35, tipC: 2.20,
      sweep: 0.06, thick: 0.118, camber: 0.024, stations: 3, round: false,
      rootCap: false,
    });
    const w = new THREE.Group();
    w.position.set(s * 1.9, WY, 0);
    w.rotation.z = -s * 0.175;
    p.add(w);
    wing(w, M.planeTop, M.planeBottom, {
      side: s, x: 0, y: 0, z: 1.84, span: 4.35, rootC: 2.20, tipC: 1.18,
      sweep: 0.62, thick: 0.112, camber: 0.024, twist: -0.03, rootCap: false,
    });
    box(w, M.planeTop, 1.66, 0.11, 0.5, s * 3.5, 0.06, -0.28);         // aileron
    box(w, M.gunDark, 1.5, 0.09, 0.14, s * 3.5, 0.02, 1.66);           // leading-edge slot
    // The split flaps, closed: two thin perforated panels lying along the
    // trailing edge, upper and lower, not the pair of shelves standing off it
    // they were. Open, they are the whole reason an SBD can put a bomb where
    // she puts one; closed, they should hardly show.
    for (const dy of [0.075, -0.075]) {
      box(w, M.gunDark, 4.0, 0.05, 0.42, s * 2.1, dy, -0.34);
      for (let i = 0; i < 9; i++) {
        cyl(w, M.cave, 0.055, 0.055, 0.07, s * (0.45 + i * 0.4), dy, -0.34, 6);
      }
    }
    insignia(w, s * 2.5, 0.16, 0.55, 0.62);
    // Her two thirties in the wing roots, and the pitot under the port panel.
    box(w, M.gunDark, 0.18, 0.18, 0.2, s * 0.5, -0.1, 1.82);
  }
  insignia(p, 0.35, cl(-2.3) + 0.11, -2.3, 0.34, false);
  insignia(p, -0.35, cl(-2.3) + 0.11, -2.3, 0.34, false);
  empennage(p, 1.5, 1.32, 3.9, 1.02, cl(-4.3) + 0.4, -4.0);
  // The crutch that swung her bomb clear of the propeller, and the bomb on it.
  const cr = box(p, M.gunDark, 0.14, 0.55, 1.5, 0, cl(1.2) - 1.05, 1.3);
  cr.rotation.x = 0.1;
  cyl(p, M.gunDark, 0.17, 0.17, 1.7, 0, cl(1.0) - 1.35, 1.2, 10).rotation.x = Math.PI / 2;
  cyl(p, M.gunDark, 0.17, 0.02, 0.5, 0, cl(1.9) - 1.35, 2.2, 10).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    box(p, M.gunDark, 0.02, 0.3, 0.3, s * 0.1, cl(0.3) - 1.35, 0.45);
  }
  for (const s of [-1, 1]) mainGear(p, s, s * 1.5, 1.7, 1.06, 0.4);
  tailGear(p, -4.45, 0.19, 1.2, 0.34);
  box(p, M.planeTop, 0.07, 0.7, 0.07, 0, cl(0.6) + 1.4, 0.6);
  const wire = box(p, M.wire, 0.03, 0.03, 4.6, 0, cl(-1.8) + 1.4, -1.8);
  wire.rotation.x = -0.16;
  if (folded) p.scale.set(0.995, 1, 1);
  return p;
}

/** A TBF-1 Avenger: the ball turret is what names her at any range. */
function avenger(g, x, y, z, ry, folded = true, spin = false) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  const cl = sitline(1.74, 0.12);
  // A deep body with the bomb bay in the belly of it -- she is a big aeroplane,
  // and the whole middle of her is the space a torpedo goes in.
  airframe(p, M.planeTop, [
    { z: -5.90, w: 0.20, h: 0.66, y: cl(-5.90) + 0.44 },
    { z: -5.20, w: 0.40, h: 0.92, y: cl(-5.20) + 0.36 },
    { z: -4.40, w: 0.64, h: 1.18, y: cl(-4.40) + 0.27 },
    { z: -3.40, w: 0.92, h: 1.50, y: cl(-3.40) + 0.17 },
    { z: -2.40, w: 1.12, h: 1.72, y: cl(-2.40) + 0.10 },
    { z: -1.20, w: 1.28, h: 1.92, y: cl(-1.20) + 0.05 },
    { z: 0.10, w: 1.38, h: 2.06, y: cl(0.10) },
    { z: 1.40, w: 1.40, h: 2.10, y: cl(1.40) },
    { z: 2.60, w: 1.36, h: 2.02, y: cl(2.60) + 0.02 },
    { z: 3.60, w: 1.26, h: 1.86, y: cl(3.60) + 0.05 },
    { z: 4.40, w: 1.14, h: 1.66, y: cl(4.40) + 0.08 },
    { z: 4.95, w: 1.02, h: 1.48, y: cl(4.95) + 0.11 },
  ], { flat: 0.06, e: 0.95, mBot: M.planeBottom });
  radial(p, 0.95, cl(5.2) + 0.1, 5.1, 3.9, 3, spin);
  // The bay, its doors, and the fish inside them.
  for (const s of [-1, 1]) {
    box(p, M.planeBottom, 0.1, 0.34, 4.3, s * 0.5, cl(1.2) - 1.02, 1.2);
  }
  box(p, M.cave, 0.86, 0.16, 4.1, 0, cl(1.2) - 1.1, 1.2);
  // The fish itself, up in the bay where she carries it.
  cyl(p, M.steelDark, 0.26, 0.26, 4.0, 0, cl(1.1) - 0.96, 1.1, 12).rotation.x = Math.PI / 2;
  cyl(p, M.steelDark, 0.26, 0.06, 0.8, 0, cl(3.2) - 0.96, 3.3, 12).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    box(p, M.steelDark, 0.03, 0.46, 0.46, s * 0.15, cl(-0.9) - 0.96, -0.9);
    box(p, M.steelDark, 0.46, 0.03, 0.46, 0, cl(-0.9) - 0.96 + s * 0.23, -0.9);
  }
  greenhouse(p, 1.14, 0.80, cl(2.3) + 1.0, 1.05, 3.55, 4);
  // The turret: a glazed ball on its ring with the fifty out of the side.
  cyl(p, M.planeTop, 0.72, 0.74, 0.3, 0, cl(-0.5) + 0.96, -0.5, 14);
  cyl(p, M.glass, 0.66, 0.68, 0.9, 0, cl(-0.5) + 1.5, -0.5, 14);
  cyl(p, M.planeTop, 0.62, 0.42, 0.34, 0, cl(-0.5) + 2.02, -0.5, 14);
  // The frames of it, which are what you actually see of a turret at range.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    box(p, M.planeTop, 0.07, 0.94, 0.07, Math.sin(a) * 0.66, cl(-0.5) + 1.5,
      -0.5 + Math.cos(a) * 0.66, a);
    box(p, M.planeTop, 0.07, 0.94, 0.07, -Math.sin(a) * 0.66, cl(-0.5) + 1.5,
      -0.5 - Math.cos(a) * 0.66, a);
  }
  cyl(p, M.planeTop, 0.68, 0.68, 0.07, 0, cl(-0.5) + 1.94, -0.5, 14);
  const fifty = cyl(p, M.gunDark, 0.06, 0.06, 1.5, 0.3, cl(-0.4) + 1.6, 0.1, 6);
  fifty.rotation.x = -0.35;
  // The spine aft of her, and the tunnel gun under the tail.
  airframe(p, M.planeTop, [
    { z: -4.60, w: 0.30, h: 0.30, y: cl(-4.60) + 0.5 },
    { z: -3.20, w: 0.60, h: 0.52, y: cl(-3.20) + 0.62 },
    { z: -1.60, w: 0.76, h: 0.66, y: cl(-1.60) + 0.72 },
    { z: -0.90, w: 0.80, h: 0.70, y: cl(-0.90) + 0.74 },
  ], { flat: 0.3, e: 0.96, capF: false, mBot: M.planeTop });
  box(p, M.cave, 0.4, 0.1, 0.7, 0, cl(-3.0) - 0.68, -3.0);
  const tunnel = cyl(p, M.gunDark, 0.05, 0.05, 0.9, 0, cl(-3.0) - 0.6, -3.05, 6);
  tunnel.rotation.x = 0.5;
  // The same sto-wing as the Wildcat's, on a wing half as big again -- and
  // both states of it are built, because an aeroplane spreads her wings before
  // she runs and folds them again when she is struck below. Which pair is
  // showing is a matter of which group is visible, so the evolution can spread
  // them at the right moment instead of her taking off folded.
  const WY = cl(1.5) - 0.82;
  const stowed = new THREE.Group();
  const spread = new THREE.Group();
  p.add(stowed);
  p.add(spread);
  for (const s of [-1, 1]) {
    // The centre section stays put whether she is folded or spread.
    wing(p, M.planeTop, M.planeBottom, {
      side: s, x: 0, y: WY, z: 2.9, span: 0.95, rootC: 3.0, tipC: 2.9,
      sweep: 0.04, thick: 0.118, stations: 2, round: false, rootCap: false,
    });
    foldWing(stowed, s, {
      at: [s * 0.92, WY - 0.72, 2.8], skew: 0.09, lean: 0.05,
      span: 6.0, rootC: 2.9, tipC: 1.5, sweep: 0.85, thick: 0.112, star: 0.72,
      guns: [[2.0, 0.12]],
    });
    const w = new THREE.Group();
    w.position.set(s * 0.95, WY, 2.9);
    w.rotation.z = -s * 0.06;
    spread.add(w);
    wing(w, M.planeTop, M.planeBottom, {
      side: s, x: 0, y: 0, z: 0, span: 7.25, rootC: 2.9, tipC: 1.5,
      sweep: 0.85, thick: 0.112, camber: 0.024, twist: -0.03, rootCap: false,
    });
    box(w, M.planeTop, 2.1, 0.11, 0.62, s * 5.2, 0.06, -1.9);        // aileron
    box(w, M.planeTop, 2.9, 0.12, 0.8, s * 1.9, 0.02, -2.3);         // flap
    box(w, M.gunDark, 0.22, 0.22, 0.24, s * 1.5, 0.1, 0.04);         // wing fifty
    insignia(w, s * 4.0, 0.16, -0.6, 0.72);
  }
  stowed.visible = folded;
  spread.visible = !folded;
  p.userData.wings = { stowed, spread };
  insignia(p, 0.48, cl(-2.6) + 0.10, -2.6, 0.46, false);
  insignia(p, -0.48, cl(-2.6) + 0.10, -2.6, 0.46, false);
  empennage(p, 2.05, 1.7, 5.8, 1.3, cl(-5.2) + 0.46, -4.8);
  const legs = [-1, 1].map((s) => ({ s, g: mainGear(p, s, s * 1.55, 2.3, 1.3, 0.46) }));
  const tailLeg = tailGear(p, -5.5, 0.21, 1.1, 0.36);
  const down = legs.map((l) => l.g.rotation.z);
  // 0 is down and locked, 1 is up and the doors shut behind her.
  p.userData.gear = (u) => {
    const k = Math.max(0, Math.min(1, u));
    const e = k * k * (3 - 2 * k);
    legs.forEach((l, i) => { l.g.rotation.z = down[i] + l.s * 1.5 * e; });
    tailLeg.rotation.x = 1.6 * e;
  };
  box(p, M.planeTop, 0.08, 0.8, 0.08, 0, cl(1.4) + 1.9, 1.4);
  const wire = box(p, M.wire, 0.03, 0.03, 5.4, 0, cl(-1.6) + 1.86, -1.6);
  wire.rotation.x = -0.14;
  return p;
}


// Nothing is ranged on the flight deck. A carrier lying in her berth with a
// deck park is a carrier that cannot land an aircraft or work her lifts, and it
// is not how one is found at the start of a watch: the group is struck below,
// and what is coming up is on the lifts. The deck is a runway, and a runway
// with aeroplanes parked on it is a car park.

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
  hangarInterior(g);
  groundTackle(g);
  flightDeck(g);
  catwalks(g);
  island(g);
  armament(g);
  boatsAndCranes(g);
  elevators(g);
  deckAircraft(g);
  g.updateMatrixWorld(true);
  const parts = [];
  g.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    // Whether it rides something that moves -- a lift platform, a gun mounting.
    // Those are allowed over an open well; the deck is not.
    let moving = false;
    for (let n = o; n; n = n.parent) if (n.userData && n.userData.dynamic) { moving = true; break; }
    o.geometry.computeBoundingBox();
    const lb = o.geometry.boundingBox;
    const bb = lb.clone().applyMatrix4(o.matrixWorld);
    parts.push({
      min: [bb.min.x, bb.min.y, bb.min.z],
      max: [bb.max.x, bb.max.y, bb.max.z],
      // Its own size, before it was turned: a gun barrel laid at forty degrees
      // has a fat axis-aligned box and is still a stick.
      size: [lb.max.x - lb.min.x, lb.max.y - lb.min.y, lb.max.z - lb.min.z],
      moving,
    });
  });
  return parts;
}

export function buildEnterprise() {
  AA_MOUNTS = [];
  const g = new THREE.Group();
  buildHull(g);
  hangarSides(g);
  hangarInterior(g);
  groundTackle(g);
  flightDeck(g);
  catwalks(g);
  island(g);
  armament(g);
  boatsAndCranes(g);
  const lifts = elevators(g);
  const plane = deckAircraft(g);
  mergeStatic(g);
  // The deck runs whenever anything is drawing her -- the shipyard and the
  // battle both -- so the ship carries her own animation rather than each scene
  // having to know she has elevators. `launch` starts the evolution; the
  // simulation calls it when a squadron goes.
  // Her take-off, integrated once out of her own weight and wing so it can be
  // read back the same way every time. The deck ahead of her is what is left
  // between where she lines up and the bow.
  const spot = lifts[lifts.length - 1].group.position.z - 0.45 + TAXI;
  const deck = {
    lifts, plane, launchAt: null, startY: FD, airborne: false,
    profile: launchProfile(AERO.avenger, fdEndF(0) - spot),
  };
  g.userData.deck = deck;
  g.userData.deckPlane = plane.group;
  g.userData.step = (t) => stepDeck(deck, t);
  g.userData.launch = (t) => {
    deck.launchAt = t;
    deck.airborne = false;
    deck.startY = lifts[lifts.length - 1].group.position.y;
  };
  // Called when whatever was flying her is finished with her: she comes home
  // to the after lift and waits for the next launch.
  g.userData.recover = () => {
    deck.airborne = false;
    deck.launchAt = null;
    // Struck below again: wings folded, wheels down, on the lift.
    if (plane.gear) plane.gear(0);
    if (plane.wings) {
      plane.wings.spread.visible = false;
      plane.wings.stowed.visible = true;
    }
    plane.group.rotation.set(0, 0.08, 0);
  };
  return {
    group: g,
    lifts,
    deckPlane: plane.group,
    // In the order the sponsons were built, which is the order the datasheet
    // lists them: starboard forward pair, starboard after pair, then port.
    turrets: g.userData.turrets || [],
    aaMounts: AA_MOUNTS,
    length: LOA, beam: FDW, deckY: HANGAR, flightDeckY: FD,
  };
}

// The three types on their own, so they can be looked at and measured
// without a ship round them.
export const __aircraft = { wildcat, dauntless, avenger };

export { LOA, FDW, FDL, HANGAR, FD, LIFT_HW, liftZs };
