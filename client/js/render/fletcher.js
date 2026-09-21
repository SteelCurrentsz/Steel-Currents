// USS Fletcher, built out of her own lines.
//
// A Fletcher is a flush-decker: no forecastle break anywhere along her, one
// unbroken sheer from stem to transom, and that is the first thing to get right
// because it is the first thing anyone recognises her by. The rest is a very
// fine hull -- three hundred and seventy-six feet on twelve and a half of beam,
// a length to beam ratio of nearly ten, which is why she does thirty-six knots
// and why she rolls her rails under doing it.
//
// Everything here is to the real ship: 114.7 m over all, 12.1 m beam, 5.4 m
// mean draft, five 5"/38 in single enclosed mounts, two quintuple banks of
// twenty-one inch tubes on the centreline, ten Bofors barrels in five twins,
// seven Oerlikons, and the depth charge gear aft -- two stern racks and six
// K-guns -- that is half the reason she exists.
//
// She is drawn as she was in the middle of 1943: the round bridge, the SG on
// the mast and the Mk 4 over the director, the light battery brought up to ten
// forty-millimetre barrels, and Measure 21 over the whole of her.
//
// Local frame, as everywhere else in the renderer: +Z is the bow, +Y is up, and
// therefore starboard is -X. y = 0 is the waterline.

import * as THREE from '../../../vendor/three.module.js';
import { arm as armMount } from './mounts.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import {
  box, cyl, tubeZ, tubeX, smooth, fairTable, loftRings, loftShape,
  planHouse, ladder, sideLadder, rail,
} from './shipkit.js';

export const LOA = 114.7;
export const BEAM = 12.1;
export const DRAFT = 5.4;
/** Starboard, in this frame. The accommodation ladder goes on this side. */
const S = -1;

// Measure 21 -- navy blue overall -- which is what the Pacific destroyers wore
// from 1942. It is nearly black in anything but full sun, and that is correct:
// the whole point of the scheme was that she should not be there at all.
const P = {
  hull: 0x5b6878,
  hullDark: 0x4e5a68,
  boot: 0x20252b,
  antifoul: 0x7c342a,
  deck: 0x49535f,          // deck blue 20-B over the steel decks
  deckDark: 0x3f4854,
  steel: 0x6b7684,
  steelDark: 0x545e6a,
  bright: 0x8b95a1,
  gun: 0x626d79,
  gunDark: 0x3a424c,
  glass: 0x232b34,
  canvas: 0x6a6e66,        // boat covers and raft grating, weathered grey
  wire: 0x2c343c,
  rope: 0x7a7364,
  brass: 0x9a8250,
  cave: 0x14181d,
  raft: 0x353b42,
  mark: 0xd2cec1,
  rust: 0x8a5a44,
};
const MATS = {};
const mat = (color, opts) => {
  const key = color + (opts ? JSON.stringify(opts) : '');
  if (!MATS[key]) MATS[key] = new THREE.MeshLambertMaterial({ color, ...opts });
  return MATS[key];
};
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

// ----------------------------------------------------------- her own lines --
//
// `t` runs -1 at the transom to +1 at the stem. These three tables are the
// body plan: how wide she is, how deep, and how high her deck edge stands. A
// destroyer's are unlike a capital ship's in every one of them -- the entrance
// is very fine, the maximum beam is well aft of amidships, and the sheer
// forward is enormous, because at thirty-six knots in a head sea a low bow is
// a wet bow and a wet bow is a bow that is not there any more.
//
// They are read as a fair curve rather than a smoothstep between neighbours:
// see fairTable. A smoothstep is flat at both ends of every span, so a table
// of offsets comes out scalloped -- a bulge at each station with a flat
// between -- and a shipwright would send that back to the loft floor.

// Half-breadths at the waterline. Her extreme beam is 12.1 m and it is measured
// at the deck edge, where the flare has added its share, so the moulded figure
// here has to come out a little under six.
const HALF_BEAM = [
  [-1.00, 2.18], [-0.96, 2.50], [-0.90, 3.00], [-0.84, 3.46],
  [-0.76, 4.00], [-0.68, 4.46], [-0.60, 4.84], [-0.50, 5.20],
  [-0.40, 5.48], [-0.30, 5.66], [-0.20, 5.77], [-0.10, 5.82],
  [0.00, 5.83], [0.08, 5.80], [0.18, 5.69], [0.28, 5.49],
  [0.38, 5.21], [0.48, 4.85], [0.58, 4.39], [0.68, 3.81],
  [0.78, 3.11], [0.86, 2.43], [0.92, 1.77], [0.96, 1.17],
  [1.00, 0.16],
];

// The keel line, and the two ends of it that matter: a forefoot that cuts down
// hard to the bar, and a counter that sweeps up under the transom clear of the
// screws.
const KEEL = [
  [-1.00, -2.12], [-0.94, -3.42], [-0.88, -4.36], [-0.80, -4.96],
  [-0.70, -5.24], [-0.55, -5.36], [-0.30, -5.40], [0.00, -5.41],
  [0.30, -5.39], [0.50, -5.33], [0.62, -5.17], [0.72, -4.81],
  [0.80, -4.23], [0.88, -3.21], [0.94, -1.62], [0.98, 0.18],
  [1.00, 1.38],
];

// The deck edge. Three and a half metres of rise between the transom and the
// stemhead, all of it forward of amidships, which is the sheer of a ship meant
// to be driven hard into a head sea.
const SHEER = [
  [-1.00, 4.10], [-0.85, 4.16], [-0.70, 4.22], [-0.55, 4.30],
  [-0.40, 4.38], [-0.25, 4.48], [-0.10, 4.58], [0.00, 4.64],
  [0.15, 4.83], [0.30, 5.10], [0.45, 5.44], [0.60, 5.86],
  [0.72, 6.30], [0.84, 6.88], [0.92, 7.32], [1.00, 7.78],
];

const halfBeam = (t) => fairTable(HALF_BEAM, t);
const keelY = (t) => fairTable(KEEL, t);
const sheer = (t) => fairTable(SHEER, t);

/**
 * How much the topsides flare out above the waterline.
 *
 * Forward she flares hard -- that is what throws the bow wave down and out
 * instead of over the bridge -- and aft she is nearly wall-sided.
 */
function flare(t) {
  return 0.10 + smooth((t - 0.15) / 0.85) * 0.44;
}

/** Her half-breadth at this station and this height. */
function shellAt(t, y) {
  const w = halfBeam(t);
  const k = keelY(t);
  const sh = sheer(t);
  if (y <= k) return 0;
  // Round of the bilge low down, full amidships, tucking in under the counter.
  const up = Math.min(1, Math.max(0, (y - k) / Math.max(0.6, -k + 0.5)));
  const belly = Math.pow(up, 0.42);
  let half = w * belly;
  if (y > 0) half += w * flare(t) * Math.min(1, y / Math.max(1, sh)) * 0.34;
  return Math.max(0.03, Math.min(half, w * 1.5));
}

// The stem is raked and the transom overhangs, so where the shell actually is
// fore and aft depends on how high up you look.
//
// Her stations, fore to aft. These are the real ship's, converted from feet
// from the bow to metres from amidships, and her datasheet carries the same
// numbers for the mounts, the tubes and the depth charge gear, so the guns,
// the fish and the charges all come out of the things you can see.
//
// The order along the waist is what makes a Fletcher a Fletcher: bridge,
// funnel, tubes, funnel, tubes, after deckhouse. The forward funnel rises out
// of the bridge deckhouse rather than standing on its own -- try to give it a
// casing of its own and there is no room left for the after bank of tubes.
const BRIDGE_F = 21.5;
const BRIDGE_A = 3.5;
const FUNNEL_F = 5.5;
const MAST_Z = 9.0;
const TUBES_F = -3.0;
const FUNNEL_A = -11.2;
const CASING_A = [-15.0, -7.4];        // the after fire room casing
const TUBES_A = -19.0;
// The after deckhouse. One structure in two steps -- the lower part with mount
// 53 on it and the raised part with 54 -- and the two share a bulkhead at
// z = -35. They used to stand a metre apart, which left a slot straight down
// to the deck between the two after mounts that you could see daylight through
// from abeam.
const HOUSE_A = [-26.0, -35.0];        // after deckhouse, mount 53 on it
const HOUSE_B = [-35.0, -42.0];        // and the raised one, mount 54 on it
const HOUSE_A_W = 7.2;                 // wide enough for a pair of Bofors
const HOUSE_B_W = 6.2;

// The depth charge gear, which has to agree with her datasheet: two Mk 3 racks
// at the transom and six Mk 6 K-guns down the quarters. See shared/ships.js --
// there is a check that walks both and compares.
const DC_RACK_X = 2.0;
const DC_RACK_Z = -55.0;
const DC_THROWERS = [[4.35, -29.0], [4.05, -34.0], [3.62, -39.0]];

const STEM = 4.6;
const COUNTER = 2.6;
function stemAt(y) { return STEM * Math.pow(Math.max(0, y + 2) / 9.8, 1.5); }
function counterAt(y) { return COUNTER * Math.pow(Math.max(0, y + 2.4) / 6.6, 1.2); }

function zAt(t, y) {
  let z = (t * LOA) / 2;
  if (t > 0.5) z += smooth((t - 0.5) / 0.5) * (stemAt(y) - STEM);
  else if (t < -0.72) z -= smooth((-t - 0.72) / 0.28) * (counterAt(y) - COUNTER);
  return z;
}

// ------------------------------------------------------------------ hull --

const BOOT_LO = -1.6;
const BOOT_HI = 0.5;
const STATIONS = 84;

/**
 * One band of shell plating, lofted between two heights the whole way round.
 *
 * The two heights may each be a number or a function of the station, because
 * the topsides band has to follow the sheer: run its top along a constant and
 * she comes out a slab-sided barge with eight metres of freeboard amidships.
 *
 * Wound so the faces look outboard: get this backwards and every triangle on
 * both sides points inward, the single-sided materials cull the lot, and what
 * is left is the inside of the far side seen through the near one.
 */
function loftBand(g, m, lo, hi) {
  const loAt = typeof lo === 'function' ? lo : () => lo;
  const hiAt = typeof hi === 'function' ? hi : () => hi;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= STATIONS; i++) {
    const t = -1 + (2 * i) / STATIONS;
    const kb = keelY(t);
    const a = Math.max(loAt(t), kb);
    const b = Math.max(hiAt(t), kb);
    for (const [y, w] of [[a, shellAt(t, a)], [b, shellAt(t, b)]]) {
      pos.push(-w, y, zAt(t, y), w, y, zAt(t, y));
    }
  }
  // Each station contributes four vertices: port-low, stbd-low, port-high,
  // stbd-high. Stitch port up one side and starboard down the other.
  for (let i = 0; i < STATIONS; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    // Port side (-x): low to high.
    idx.push(a, b, a + 2, a + 2, b, b + 2);
    // Starboard (+x), wound the other way so it too faces outboard.
    idx.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, m));
}

/**
 * The strakes, as functions of the station: red lead below the boot top, the
 * black boot topping through the waterline, navy blue from there to just under
 * the deck edge, and the sheer strake -- the top plate of all, a shade darker
 * because it is the one that takes the weather.
 */
function strakeBands() {
  const sheerLo = (t) => sheer(t) - 0.75;
  return [
    [(t) => keelY(t) - 0.02, BOOT_LO, M.antifoul],
    [BOOT_LO, BOOT_HI, M.boot],
    [BOOT_HI, sheerLo, M.hull],
    [sheerLo, sheer, M.hullDark],
  ];
}

/** The same, evaluated at one station, for capping the ends. */
function strakes(t) {
  const kb = keelY(t);
  const up = (y) => Math.max(kb, y);
  return [
    [kb, up(BOOT_LO), M.antifoul],
    [up(BOOT_LO), up(BOOT_HI), M.boot],
    [up(BOOT_HI), up(sheer(t) - 0.75), M.hull],
    [up(sheer(t) - 0.75), sheer(t), M.hullDark],
  ];
}

/**
 * The camber closure at an end of her.
 *
 * Her deck is crowned -- a quarter of a metre higher on the centreline than at
 * the deck edge, so water runs off it -- and the end caps below are lofted to
 * the sheer line, which is the deck EDGE. Between the top of the transom plate
 * and the underside of the deck there was therefore a crescent of nothing, the
 * whole width of her and 0.26 m tall amidships, and from astern you looked
 * straight through it into the ship. This is the plate that closes it.
 */
function capCamber(g, t, out) {
  const sh = sheer(t);
  const w = Math.max(0.05, shellAt(t, sh));
  const z = zAt(t, sh);
  const N = 14;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const u = -1 + (2 * i) / N;
    pos.push(u * w, sh, z);
    pos.push(u * w, sh + (1 - u * u) * 0.26, z);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    const b = a + 2;
    if (out > 0) idx.push(a, b, a + 1, a + 1, b, b + 1);
    else idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.hullDark));
}

/** Close an end of the shell, painted in the same strakes. */
function capEnd(g, t, out) {
  for (const [lo, hi, m] of strakes(t)) {
    if (hi - lo < 0.02) continue;
    const N = 10;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= N; i++) {
      const y = lo + ((hi - lo) * i) / N;
      const w = shellAt(t, y);
      const z = zAt(t, y);
      pos.push(-w, y, z, w, y, z);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      if (out > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, m));
  }
}

/**
 * The weather deck: one sheet from stem to transom, because that is what a
 * flush-decker is. It has camber -- crowned along the centreline so water runs
 * off it -- and it follows the sheer, which forward is a great deal of it.
 */
function weatherDeck(g) {
  const pos = [];
  const idx = [];
  const CAM = 3;                     // points across the camber, per side
  const across = CAM * 2 + 1;
  for (let i = 0; i <= STATIONS; i++) {
    const t = -1 + (2 * i) / STATIONS;
    const sh = sheer(t);
    const w = shellAt(t, sh);
    const z = zAt(t, sh);
    for (let j = 0; j < across; j++) {
      const u = (j - CAM) / CAM;                     // -1 port to +1 starboard
      const crown = (1 - u * u) * 0.26;
      pos.push(u * w, sh + crown, z);
    }
  }
  for (let i = 0; i < STATIONS; i++) {
    for (let j = 0; j < across - 1; j++) {
      const a = i * across + j;
      const b = (i + 1) * across + j;
      // Wound so the deck faces up. Reverse these and you look straight down
      // through her into the uptakes.
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.deck));

  bulwark(g);
}

/**
 * The gunwale: a solid strip of plating standing up all along the deck edge,
 * low amidships and rising into a proper bulwark forward where the sea comes
 * aboard.
 *
 * It is lofted in one piece, outer face, cap and inner face, because it was a
 * row of separate flat plates laid round the curve of the bow -- and a row of
 * plates round a curve is a picket fence. From ahead you looked between them
 * and saw the sea through her, which is the hole in her bow; from abeam, at
 * deck height, the gaps ran aft down her whole side as a dashed line of
 * daylight.
 */
function bulwark(g) {
  const pos = [];
  const idx = [];
  const TH = 0.22;
  // Waist height all along, growing into a bulwark forward of the break.
  const capAt = (t) => 0.2 + 0.78 * smooth((t - 0.46) / 0.34);
  for (let i = 0; i <= STATIONS; i++) {
    const t = -1 + (2 * i) / STATIONS;
    const sh = sheer(t);
    const w = Math.max(0.06, shellAt(t, sh));
    const z = zAt(t, sh);
    const h = capAt(t);
    const inner = Math.max(0.03, w - TH);
    for (const sgn of [1, -1]) {
      pos.push(sgn * w, sh, z);                 // 0 outer foot
      pos.push(sgn * w, sh + h, z);             // 1 outer head
      pos.push(sgn * inner, sh + h, z);         // 2 inner head
      pos.push(sgn * inner, sh + 0.02, z);      // 3 inner foot
    }
  }
  const PER = 8;
  for (let i = 0; i < STATIONS; i++) {
    const a = i * PER;
    const b = (i + 1) * PER;
    for (let k = 0; k < 2; k++) {
      const o = k * 4;                          // 0 = port (+x), 4 = starboard
      const [A, B, C, D] = [a + o, a + o + 1, a + o + 2, a + o + 3];
      const [E, F, G, H] = [b + o, b + o + 1, b + o + 2, b + o + 3];
      if (k === 0) {
        idx.push(A, B, F, A, F, E);             // outer face, looking to port
        idx.push(B, C, G, B, G, F);             // the cap
        idx.push(C, D, H, C, H, G);             // inner face
      } else {
        idx.push(A, F, B, A, E, F);
        idx.push(B, G, C, B, F, G);
        idx.push(C, H, D, C, G, H);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.hull));
}

/** Bilge keels, shafts, struts, screws and rudders: what is under her. */
function underwater(g) {
  // Bilge keels: the long fins amidships that take the roll off her.
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 26; i++) {
      const t = -0.52 + (i / 25) * 0.92;
      const y = keelY(t) * 0.52;
      const w = shellAt(t, y);
      const b = box(g, M.antifoul, 0.1, 0.62, LOA * 0.038, sgn * w * 1.01, y, zAt(t, y));
      b.rotation.z = sgn * 0.6;
    }
  }
  // Two shafts, on struts, with three-bladed screws and the rudders behind.
  for (const sgn of [-1, 1]) {
    const x = sgn * 2.0;
    tubeZ(g, M.steelDark, 0.26, 13, x, -4.5, -34, 10);
    // The shaft bossing where the tube comes out of her: a fairing, not a step.
    cyl(g, M.antifoul, 0.5, 0.36, 3.2, x, -4.42, -29.6, 12).rotation.x = Math.PI / 2;
    // The A-bracket that carries the shaft outboard of the hull.
    for (const lean of [-0.5, 0.5]) {
      const st = cyl(g, M.steelDark, 0.16, 0.16, 2.6, x + sgn * 0.2, -3.6, -38.5, 8);
      st.rotation.z = lean * 0.55;
      st.rotation.x = 0.1;
    }
    cyl(g, M.steelDark, 0.34, 0.34, 1.1, x, -4.5, -40.4, 10).rotation.x = Math.PI / 2;
    // The screw itself: a hub and three broad blades, twisted.
    const hub = new THREE.Group();
    hub.position.set(x, -4.5, -41.1);
    hub.userData.dynamic = true;
    // Outward-turning, which is what a twin-screw destroyer has: seen from
    // astern the tops of the blades go outboard.
    hub.userData.screw = { hand: sgn };
    g.add(hub);
    cyl(hub, M.brass, 0.26, 0.4, 0.5, 0, 0, 0, 10).rotation.x = Math.PI / 2;
    for (let b = 0; b < 3; b++) {
      const bl = new THREE.Group();
      bl.rotation.z = (b / 3) * Math.PI * 2;
      hub.add(bl);
      for (let k = 0; k < 3; k++) {
        const f = (k + 0.5) / 3;
        const blade = box(bl, M.brass, 0.62 - 0.2 * f, 1.0 / 3 + 0.02, 0.11,
          0, 0.32 + f * 1.0, 0);
        blade.rotation.y = sgn * (0.75 - 0.4 * f);
      }
    }
    // Rudder, abaft each screw: the stock down through the counter, the blade
    // hung on it, and the pintle at its heel.
    cyl(g, M.antifoul, 0.2, 0.2, 1.6, x, -2.3, -43.2, 10);
    const r = box(g, M.antifoul, 0.22, 2.9, 2.3, x, -3.7, -43.2);
    r.rotation.x = 0.04;
  }
  // The skeg on the centreline, and the sole of the keel.
  box(g, M.antifoul, 0.5, 1.0, 26, 0, -5.1, -26);
  box(g, M.antifoul, 0.7, 0.34, LOA * 0.72, 0, -5.45, -4);
  // Sea chests and the condenser inlets: the grilles let into her bottom.
  for (const sgn of [-1, 1]) {
    for (const cz of [-6, -16]) {
      const t = cz / (LOA / 2);
      const y = -3.6;
      box(g, M.gunDark, 0.14, 0.7, 1.8, sgn * shellAt(t, y) * 0.99, y, cz);
    }
  }
}

/**
 * The stem bar and the transom.
 *
 * The bar has to be swept along the rake and not stacked up it: a stack of
 * upright blocks on a stem that runs aft four and a half metres in nine of
 * height comes out as a flight of stairs.
 */
function stemAndTransom(g) {
  const SEG = 22;
  const foot = keelY(1);
  const head = sheer(1) + 0.42;
  for (let i = 0; i < SEG; i++) {
    const y0 = foot + ((head - foot) * i) / SEG;
    const y1 = foot + ((head - foot) * (i + 1)) / SEG;
    const z0 = zAt(1, y0);
    const z1 = zAt(1, y1);
    const len = Math.hypot(y1 - y0, z1 - z0) + 0.05;
    const b = box(g, M.hull, 0.3, 0.34, len, 0, (y0 + y1) / 2, (z0 + z1) / 2);
    b.rotation.x = Math.atan2(y1 - y0, z1 - z0) - Math.PI / 2;
  }
  // The transom: a flat plate with the frames showing through it, and the
  // rubbing band round the top of it.
  const tw = shellAt(-1, sheer(-1));
  box(g, M.hullDark, tw * 2 * 0.96, 0.2, 0.26, 0, sheer(-1) - 0.12, zAt(-1, sheer(-1)) - 0.1);
  for (const sgn of [-1, 1]) {
    for (const fx of [0.35, 0.72]) {
      box(g, M.hullDark, 0.14, 2.4, 0.16,
        sgn * tw * fx, sheer(-1) - 1.4, zAt(-1, sheer(-1) - 1.4) - 0.06);
    }
  }
}

/**
 * The degaussing cable.
 *
 * A loop of heavy conductor strapped round the outside of the hull at deck
 * level to cancel her own magnetism, which is what kept her off the bottom of
 * a magnetic minefield. Every ship in the Pacific wore one and it is the one
 * line that runs the whole length of a destroyer's side.
 */
function degaussing(g) {
  const N = 40;
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const t0 = -0.94 + (i / N) * 1.86;
      const t1 = -0.94 + ((i + 1) / N) * 1.86;
      const y0 = sheer(t0) - 1.35;
      const y1 = sheer(t1) - 1.35;
      const w0 = shellAt(t0, y0);
      const w1 = shellAt(t1, y1);
      const z0 = zAt(t0, y0);
      const z1 = zAt(t1, y1);
      const len = Math.hypot(z1 - z0, w1 - w0) + 0.05;
      const c = box(g, M.steelDark, 0.12, 0.12, len,
        sgn * (w0 + w1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      c.rotation.y = sgn * Math.atan2(w1 - w0, z1 - z0);
    }
  }
}

function buildHull(g) {
  for (const [lo, hi, m] of strakeBands()) loftBand(g, m, lo, hi);
  capEnd(g, 1, 1);
  capEnd(g, -1, -1);
  capCamber(g, 1, 1);
  capCamber(g, -1, -1);
  weatherDeck(g);
  underwater(g);
  stemAndTransom(g);
  degaussing(g);
}

// -------------------------------------------------------- where things go --

/** Deck height on the centreline at this station, which everything stands on. */
function deckAt(z) {
  const t = Math.max(-1, Math.min(1, (z / (LOA / 2))));
  return sheer(t) + 0.26;
}

/**
 * The height of the deck under a point on it, camber and all.
 *
 * `deckAt` above is the crown -- the centreline, which is where a gun mounting
 * stands and what her datasheet is written to. Everything off the centreline
 * sits lower than that, by the full quarter-metre of camber out at the deck
 * edge, so a locker or a depth charge thrower placed on `deckAt` out by the
 * rail stands a hand's breadth clear of the plating it is supposed to be
 * bolted to. On a cambered deck that is most of what "floating" looks like.
 */
function deckAtX(x, z) {
  const t = Math.max(-1, Math.min(1, z / (LOA / 2)));
  const sh = sheer(t);
  const w = Math.max(0.05, shellAt(t, sh));
  const u = Math.min(1, Math.abs(x) / w);
  return sh + (1 - u * u) * 0.26;
}

/**
 * How far it is from the centreline to the deck edge at this station.
 *
 * Everything that lives against her side is placed off this rather than off a
 * number somebody typed: a destroyer is twelve metres across amidships and
 * three at the transom, so a gun tub that sits neatly abreast the funnel hangs
 * clean over the water if it is put at the same offset aft.
 */
function halfDeck(z) {
  const t = Math.max(-1, Math.min(1, (z / (LOA / 2))));
  return shellAt(t, sheer(t));
}

// -------------------------------------------------------------- armament --

/**
 * A 5"/38 Mk 30 in its enclosed mount.
 *
 * Not a turret -- a destroyer's five-inch is a gunhouse of thin plate on a
 * barbette, weather protection rather than armour -- but it trains and it
 * elevates, and the shape of it is the most recognisable thing on her deck:
 * a rounded box with a sloped face, a long barrel and the blast bag round it.
 */
function fiveInch(g, x, y, z, aft) {
  const mount = new THREE.Group();
  mount.position.set(x, y, z);
  mount.rotation.y = aft ? Math.PI : 0;
  g.add(mount);

  // The barbette she stands on, the roller path and the training rack.
  cyl(mount, M.steelDark, 1.58, 1.66, 0.55, 0, -0.28, 0, 20);
  cyl(mount, M.gunDark, 1.72, 1.72, 0.14, 0, 0.03, 0, 24);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    box(mount, M.gunDark, 0.1, 0.16, 0.14,
      Math.sin(a) * 1.66, 0.03, Math.cos(a) * 1.66, a + Math.PI / 2);
  }

  // The gunhouse. A Mk 30 is a light pressed-steel shield, not a turret: about
  // three metres across, three and a half fore and aft, with a flat face raked
  // back, near-vertical sides on a soft corner radius, and a roof that slopes
  // down aft. It is 20 mm of splinter plating and looks it.
  loftRings(mount, M.gun, [
    [1.50, 1.80, 0.00, 0.10],
    [1.52, 1.82, 0.00, 0.55],
    [1.50, 1.80, -0.02, 1.70],
    [1.34, 1.66, -0.10, 2.24],
    [1.06, 1.34, -0.16, 2.46],
  ], { px: 0.62, pz: 0.62, n: 20 });

  // The face, raked back over the gun port, and the bloomer at the port itself.
  const face = box(mount, M.gun, 2.72, 1.95, 0.22, 0, 1.15, 1.62);
  face.rotation.x = -0.20;
  box(mount, M.gunDark, 1.05, 0.86, 0.2, 0, 1.2, 1.76);
  // The rain gutter along the top of the face, and the lifting eyes on the roof.
  box(mount, M.gunDark, 2.7, 0.09, 0.16, 0, 2.02, 1.5);
  for (const sgn of [-1, 1]) box(mount, M.gunDark, 0.1, 0.16, 0.1, sgn * 0.5, 2.5, -0.3);
  // The escape scuttle in the roof, and the periscope hood beside it.
  cyl(mount, M.gunDark, 0.34, 0.34, 0.12, S * 0.6, 2.48, 0.4, 12);
  cyl(mount, M.gunDark, 0.14, 0.16, 0.3, -S * 0.7, 2.54, 0.5, 8);

  // Sighting hoods either side of the face -- pointer and trainer -- each with
  // its slit, which is the detail that makes a 5"/38 read as a 5"/38.
  for (const sgn of [-1, 1]) {
    const hood = box(mount, M.gun, 0.6, 0.56, 0.86, sgn * 1.08, 1.66, 0.86);
    hood.rotation.z = sgn * 0.06;
    box(mount, M.glass, 0.24, 0.16, 0.1, sgn * 1.08, 1.7, 1.3);
    box(mount, M.gunDark, 0.64, 0.1, 0.9, sgn * 1.08, 1.95, 0.86);
    // The telescope tube itself, poking out of the slit.
    cyl(mount, M.gunDark, 0.07, 0.07, 0.34, sgn * 1.08, 1.7, 1.38, 8)
      .rotation.x = Math.PI / 2;
  }

  // The access door in the back of the house, with its dogs, and the empty-case
  // chute below it.
  box(mount, M.gunDark, 0.86, 1.5, 0.12, 0, 0.95, -1.82);
  for (const dy of [0.5, 1.4]) box(mount, M.steelDark, 0.12, 0.1, 0.1, 0.5, dy, -1.9);
  box(mount, M.gunDark, 0.55, 0.42, 0.55, 0, 0.5, -1.95);
  // Grab rails up the side of the house, for the crew closing up at action.
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      box(mount, M.steelDark, 0.1, 0.07, 0.4, sgn * 1.5, 0.5 + i * 0.5, -1.1);
    }
    // And the footrail round the foot of the house.
    box(mount, M.steelDark, 0.12, 0.1, 2.6, sgn * 1.46, 0.16, 0.1);
  }
  // The training and elevating handwheels on the after corners: local control,
  // which is what she is fought on when the director has gone.
  for (const sgn of [-1, 1]) {
    cyl(mount, M.gunDark, 0.2, 0.2, 0.07, sgn * 1.18, 1.0, -1.5, 10)
      .rotation.z = Math.PI / 2;
  }

  // The barrel: 38 calibres of 5 inch is 4.83 m of tube, in its slide, with the
  // jacket over the breech end and the blast bag where it comes through.
  const arm = new THREE.Group();
  arm.position.set(0, 1.2, 1.44);
  arm.rotation.x = -0.05;
  mount.add(arm);
  cyl(arm, M.canvas, 0.44, 0.52, 0.6, 0, 0, 0.32, 14).rotation.x = Math.PI / 2;
  tubeZ(arm, M.gunDark, 0.2, 1.7, 0, 0, 1.25, 14);          // the jacket
  tubeZ(arm, M.gunDark, 0.128, 4.9, 0, 0, 2.9, 14);         // and the tube
  cyl(arm, M.gunDark, 0.145, 0.155, 0.28, 0, 0, 5.25, 14).rotation.x = Math.PI / 2;
  cyl(arm, M.cave, 0.1, 0.1, 0.1, 0, 0, 5.36, 12).rotation.x = Math.PI / 2;
  armMount(mount, arm, [[0, 0, 5.44]]);

  // Ready-service lockers round the barbette: the rounds she can fire before
  // the hoist has to catch up.
  for (const a of [2.1, 2.6, 3.7, 4.2]) {
    box(mount, M.steelDark, 0.5, 0.75, 0.42,
      Math.sin(a) * 1.95, 0.35, Math.cos(a) * 1.95, a);
  }
  return mount;
}

/**
 * A quintuple bank of twenty-one inch tubes.
 *
 * Ten of these are why a Fletcher is worth being frightened of. They sit on the
 * centreline where the deck is widest, they train out to either beam, and each
 * tube is a Mark 15 -- twenty-four feet of it -- so the bank is longer than it
 * looks in a photograph.
 */
function torpedoBank(g, z) {
  const bank = new THREE.Group();
  bank.position.set(0, deckAt(z), z);
  g.add(bank);
  // The training base and its ring.
  cyl(bank, M.steelDark, 1.0, 1.15, 0.55, 0, 0.27, 0, 14);
  cyl(bank, M.gunDark, 1.2, 1.2, 0.12, 0, 0.56, 0, 16);
  const rack = new THREE.Group();
  rack.position.y = 0.62;
  // The bank trains: the welder leaves it and everything on it alone.
  rack.userData.dynamic = true;
  rack.userData.rest = 0;
  bank.add(rack);
  // Five tubes, side by side, the outer pair sat a little lower so the bank
  // reads as the trapezoid it is rather than a slab.
  for (let i = 0; i < 5; i++) {
    const off = (i - 2) * 0.78;
    const drop = Math.abs(i - 2) * 0.09;
    const tube = new THREE.Group();
    tube.position.set(off, 0.62 - drop, 0);
    rack.add(tube);
    tubeZ(tube, M.gun, 0.34, 7.3, 0, 0, 0, 14);
    // The reinforcing bands along it, and the muzzle door.
    for (const bz of [-2.7, -0.9, 0.9, 2.7]) tubeZ(tube, M.gunDark, 0.37, 0.16, 0, 0, bz, 14);
    cyl(tube, M.gunDark, 0.35, 0.3, 0.2, 0, 0, 3.72, 14).rotation.x = Math.PI / 2;
    // The impulse charge breech aft, and the spoon over the muzzle that keeps
    // the fish from diving as she leaves.
    cyl(tube, M.gunDark, 0.3, 0.36, 0.5, 0, 0, -3.7, 12).rotation.x = Math.PI / 2;
    box(tube, M.gunDark, 0.5, 0.1, 0.7, 0, -0.3, 3.5);
    // The air charging line and the depth-setting spindle along the top.
    box(tube, M.steelDark, 0.07, 0.07, 6.4, off > 0 ? 0.2 : -0.2, 0.3, 0);
  }
  // The trainer's seat and the sight bar on the side of the bank.
  box(rack, M.gunDark, 0.5, 0.12, 0.5, S * 2.1, 0.05, -1.9);
  box(rack, M.gunDark, 0.16, 0.7, 0.16, S * 2.1, 0.42, -1.9);
  box(rack, M.gun, 3.9, 0.22, 0.5, 0, 0.02, -3.3);
  // The trainer's handwheel and the blast shield he sits behind.
  cyl(rack, M.gunDark, 0.26, 0.26, 0.08, S * 2.35, 0.55, -1.9, 10)
    .rotation.z = Math.PI / 2;
  box(rack, M.gun, 0.14, 0.95, 1.3, S * 2.5, 0.72, -1.4);
  // The five muzzle doors, which is where a fish leaves her.
  armMount(rack, rack, [0, 1, 2, 3, 4].map((i) =>
    [(i - 2) * 0.78, 0.62 - Math.abs(i - 2) * 0.09, 3.82]));
  return rack;
}

/** A twin 40 mm Bofors in its splinter shield, on its own bandstand. */
function bofors(g, x, y, z, ry, radius = 1.55) {
  const tub = new THREE.Group();
  tub.position.set(x, y, z);
  tub.rotation.y = ry;
  g.add(tub);
  // The shield: a ring of plate about waist high, open at the back. How wide
  // it is matters: the pair abreast the after funnel have a fire room casing
  // on one hand and the deck edge on the other, and the one on the fantail has
  // a depth charge rack either side of it.
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a = -1.35 + (i / (N - 1)) * 4.9;
    const r = radius;
    // The plate lies along the tangent, not the radius. Set this to `a` and
    // every gun tub on her comes out a starburst of spokes.
    box(tub, M.steel, 0.12, 1.15, (2 * Math.PI * r) / N + 0.12,
      Math.sin(a) * r, 0.58, Math.cos(a) * r, a + Math.PI / 2);
    // The stiffener along the top of the plate, which every splinter shield
    // has and which is what keeps it from reading as card.
    box(tub, M.steelDark, 0.22, 0.1, (2 * Math.PI * r) / N + 0.12,
      Math.sin(a) * r, 1.19, Math.cos(a) * r, a + Math.PI / 2);
  }
  cyl(tub, M.deckDark, radius + 0.05, radius + 0.05, 0.14, 0, 0.05, 0, 18);
  // The mount: a pedestal, the cradle and two barrels with their flash hiders.
  const gunG = new THREE.Group();
  gunG.position.y = 0.35;
  // The gun swings inside its shield; the shield is structure and does not.
  gunG.userData.dynamic = true;
  gunG.userData.rest = ry;
  tub.add(gunG);
  cyl(gunG, M.gunDark, 0.42, 0.55, 0.5, 0, 0.25, 0, 12);
  box(gunG, M.gun, 1.15, 0.62, 1.0, 0, 0.75, -0.1);
  // The barrels in their own cradle, so they lift off the trunnion instead of
  // being welded flat to the mounting: a Bofors following an aeroplane is
  // mostly elevation, and it is the part you notice.
  const cradle = new THREE.Group();
  cradle.position.set(0, 1.0, 0);
  cradle.rotation.x = -0.16;
  gunG.add(cradle);
  for (const sgn of [-1, 1]) {
    tubeZ(cradle, M.gunDark, 0.075, 2.3, sgn * 0.28, 0, 1.15, 10);
    cyl(cradle, M.gunDark, 0.11, 0.11, 0.34, sgn * 0.28, 0, 2.2, 10)
      .rotation.x = Math.PI / 2;
    // Magazine feeding from above, which is what makes a Bofors look busy.
    box(cradle, M.gunDark, 0.16, 0.55, 0.2, sgn * 0.28, 0.34, 0.5);
    // And the clip guide the loader drops the four-round frames into.
    box(cradle, M.steelDark, 0.2, 0.26, 0.16, sgn * 0.28, 0.66, 0.34);
  }
  gunG.userData.trainRate = 1.7;   // a twin Bofors, power-worked
  armMount(gunG, cradle, [[-0.28, 0, 2.4], [0.28, 0, 2.4]]);
  // Layer's and trainer's seats either side.
  for (const sgn of [-1, 1]) {
    box(gunG, M.gunDark, 0.34, 0.1, 0.34, sgn * 0.85, 0.72, -0.5);
    box(gunG, M.gunDark, 0.1, 0.4, 0.1, sgn * 0.85, 0.5, -0.5);
    // The handwheels they work her with when the director is gone.
    cyl(gunG, M.gunDark, 0.17, 0.17, 0.06, sgn * 0.62, 0.95, -0.34, 10)
      .rotation.z = Math.PI / 2;
  }
  // Ready-use ammunition against the inside of the shield.
  for (const sgn of [-1, 1]) {
    box(tub, M.gunDark, 0.4, 0.5, 0.7, sgn * (radius - 0.26), 0.35, -1.1);
  }
  return gunG;
}

/**
 * A Mk 51 director: the little box on a pedestal with a gyro sight in it that
 * lays a Bofors mounting.
 *
 * One man, standing in a tub of his own beside the gun, holding a ring sight
 * on the aeroplane while the mounting follows him. Every twin forty on her was
 * laid by one of these, and without them she is five guns being aimed over
 * open sights.
 */
function mk51(g, x, y, z, ry) {
  const d = new THREE.Group();
  d.position.set(x, y, z);
  d.rotation.y = ry;
  g.add(d);
  // The tub it stands in: chest high, open aft.
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a = -1.1 + (i / (N - 1)) * 4.2;
    const r = 0.82;
    box(d, M.steel, 0.1, 0.95, (2 * Math.PI * r) / N + 0.1,
      Math.sin(a) * r, 0.48, Math.cos(a) * r, a + Math.PI / 2);
  }
  cyl(d, M.deckDark, 0.86, 0.86, 0.12, 0, 0.04, 0, 14);
  cyl(d, M.gunDark, 0.16, 0.22, 0.95, 0, 0.5, 0, 10);
  // The director itself: a box with the sight ring on the front of it.
  const head = box(d, M.gun, 0.52, 0.42, 0.62, 0, 1.18, 0.05);
  head.rotation.x = -0.1;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 5, 12), M.gunDark);
  ring.position.set(0, 1.26, 0.36);
  d.add(ring);
  box(d, M.gunDark, 0.1, 0.1, 0.42, 0, 1.18, 0.4);
  return d;
}

/** A single 20 mm Oerlikon on its pedestal, behind a splinter shield. */
function oerlikon(g, x, y, z, ry) {
  const o = new THREE.Group();
  o.position.set(x, y, z);
  o.rotation.y = ry;
  g.add(o);
  // The tub: waist-high plate, open at the back.
  const N = 9;
  for (let i = 0; i < N; i++) {
    const a = -1.15 + (i / (N - 1)) * 4.3;
    const r = 0.95;
    box(o, M.steel, 0.1, 1.0, (2 * Math.PI * r) / N + 0.1,
      Math.sin(a) * r, 0.5, Math.cos(a) * r, a + Math.PI / 2);
    box(o, M.steelDark, 0.2, 0.09, (2 * Math.PI * r) / N + 0.1,
      Math.sin(a) * r, 1.03, Math.cos(a) * r, a + Math.PI / 2);
  }
  cyl(o, M.deckDark, 1.0, 1.0, 0.1, 0, 0.03, 0, 14);
  cyl(o, M.gunDark, 0.22, 0.3, 1.1, 0, 0.55, 0, 10);
  // The ready-use drums in their rack against the inside of the tub.
  for (const dx of [-0.55, 0.55]) {
    cyl(o, M.gunDark, 0.19, 0.19, 0.24, dx, 0.28, -0.62, 10);
  }
  const g2 = new THREE.Group();
  g2.position.y = 1.15;
  g2.userData.dynamic = true;
  g2.userData.rest = ry;
  o.add(g2);
  // The gun: barrel, the big drum magazine on top, and the shoulder rests.
  // It is shoulder-controlled, so the whole gun swings up with the barrel --
  // the drum and the rests go round with it, because they are bolted to it.
  const cradle = new THREE.Group();
  cradle.position.set(0, 0.1, 0);
  cradle.rotation.x = -0.22;
  g2.add(cradle);
  tubeZ(cradle, M.gunDark, 0.05, 1.9, 0, 0, 0.9, 8);
  // The perforated cooling shroud over the breech end of it.
  tubeZ(cradle, M.steelDark, 0.085, 0.8, 0, 0, 0.42, 8);
  cyl(cradle, M.gunDark, 0.28, 0.28, 0.16, 0, 0.32, 0.1, 12);
  box(cradle, M.gunDark, 0.16, 0.3, 0.5, 0, 0, -0.2);
  for (const sgn of [-1, 1]) box(cradle, M.gunDark, 0.06, 0.24, 0.06, sgn * 0.2, -0.15, -0.45);
  // The Mk 14 gyro sight in front of the gunner's face.
  box(cradle, M.gun, 0.2, 0.2, 0.26, 0, 0.3, -0.05);
  g2.userData.trainRate = 2.9;     // an Oerlikon, swung by a man's shoulders
  armMount(g2, cradle, [[0, 0, 1.9]]);
  return g2;
}

// -------------------------------------------------------- superstructure --

/**
 * The heights of her bridge levels above the waterline, named once so a life
 * buoy or an Oerlikon can be put on one without guessing.
 */
function bridgeDeck(n) { return deckAt(15) + [0, 3.0, 5.8, 7.5][n]; }

/**
 * The bridge structure.
 *
 * A Fletcher's is small and stacked: the deckhouse on the weather deck, the
 * charthouse and pilothouse above it, an open bridge on top of that with the
 * splinter plating round it, and the Mk 37 director sitting over the whole
 * thing. It is close and cramped and it is where everything happens.
 *
 * The levels are lofted as plans rather than as rounded boxes, because a
 * bridge front is a bullnose -- a rounded face carried round on to straight
 * sides and closed square at the back -- and a stack of boxes is the one thing
 * that makes a model read as a model. See planHouse.
 */
function bridge(g) {
  // The house sits on the deck, and the deck rises half a metre under it, so
  // its foot is taken from the low end: a house founded on the high end stands
  // clear of her own deck at the other.
  const base = Math.min(deckAtX(4.70, BRIDGE_A), deckAtX(4.70, BRIDGE_F)) - 0.10;
  const L01 = bridgeDeck(1);       // the 01 level roof: the gun deck
  const L02 = bridgeDeck(2);       // the pilothouse roof
  const L03 = bridgeDeck(3);       // the open bridge deck

  // 01 level: the long deckhouse. Galley, radio, the wardroom and the ladders
  // up, and a gun deck on top of it.
  const plan01 = planHouse({ hw: 4.70, nose: 2.9, tail: 0, zFront: BRIDGE_F, zBack: BRIDGE_A });
  loftShape(g, M.steel, [{ pts: plan01, y: base }, { pts: plan01, y: L01 }],
    { cap: false });
  // Its roof, laid as a plate a little proud of the sides so there is an eave.
  const roof01 = planHouse({ hw: 4.82, nose: 3.0, tail: 0, zFront: BRIDGE_F + 0.1, zBack: BRIDGE_A - 0.1 });
  loftShape(g, M.deckDark, [{ pts: roof01, y: L01 - 0.16 }, { pts: roof01, y: L01 }]);

  // 02: charthouse aft, pilothouse forward, one house with a rounded front.
  const plan02 = planHouse({ hw: 3.95, nose: 3.3, tail: 0, zFront: 20.9, zBack: 10.4 });
  loftShape(g, M.steel, [{ pts: plan02, y: L01 }, { pts: plan02, y: L02 }], { cap: false });
  const roof02 = planHouse({ hw: 4.06, nose: 3.4, tail: 0, zFront: 21.0, zBack: 10.3 });
  loftShape(g, M.deckDark, [{ pts: roof02, y: L02 - 0.16 }, { pts: roof02, y: L02 }]);

  // 03: the open bridge, inside its splinter coaming.
  const plan03 = planHouse({ hw: 3.15, nose: 2.8, tail: 0, zFront: 19.9, zBack: 12.6 });
  loftShape(g, M.steel, [{ pts: plan03, y: L02 }, { pts: plan03, y: L03 }], { cap: false });
  const roof03 = planHouse({ hw: 3.25, nose: 2.9, tail: 0, zFront: 20.0, zBack: 12.5 });
  loftShape(g, M.deckDark, [{ pts: roof03, y: L03 - 0.16 }, { pts: roof03, y: L03 }]);

  // Watertight doors and portholes down both sides of the deckhouse, which is
  // most of what you actually see of a superstructure at any distance.
  for (const sgn of [-1, 1]) {
    for (const dz of [6.4, 12.0, 18.4]) {
      box(g, M.gunDark, 0.14, 1.78, 0.86, sgn * 4.64, base + 1.05, dz);
      // The coaming round it, and the clips down the closing edge.
      box(g, M.steelDark, 0.1, 1.98, 1.04, sgn * 4.6, base + 1.05, dz);
      for (const dy of [0.5, 1.05, 1.6]) {
        cyl(g, M.steelDark, 0.07, 0.07, 0.14, sgn * 4.72, base + dy, dz + 0.34, 6)
          .rotation.z = Math.PI / 2;
      }
    }
    for (const dz of [4.8, 8.8, 10.6, 14.4, 16.2, 20.4]) {
      cyl(g, M.glass, 0.19, 0.19, 0.1, sgn * 4.68, base + 1.9, dz, 10)
        .rotation.z = Math.PI / 2;
      cyl(g, M.steelDark, 0.25, 0.25, 0.1, sgn * 4.64, base + 1.9, dz, 10)
        .rotation.z = Math.PI / 2;
    }
    // The inclined ladder up to the gun deck, and a vertical one to the 02.
    ladder(g, M.steelDark, sgn * 4.1, deckAt(5.4) + 0.1, L01, 5.4, 7.8);
    sideLadder(g, M.steelDark, {
      out: sgn, skin: 3.9, z: 11.4, y0: L01 + 0.1, y1: L02, half: 0.26, stand: 0.18,
    });
  }

  // The pilothouse windows: the band right round the front of the 02 level,
  // set into a coaming, with the wing doors at the after end of the run.
  for (let i = 0; i < 13; i++) {
    const a = -1.32 + (i / 12) * 2.64;
    const r = 3.62;
    const wx = Math.sin(a) * r * 1.0;
    const wz = 17.6 + Math.cos(a) * r * 1.0;
    box(g, M.glass, 0.94, 0.9, 0.16, wx, L01 + 1.9, wz, a);
    box(g, M.steelDark, 1.0, 0.12, 0.2, wx, L01 + 2.42, wz, a);
    box(g, M.steelDark, 1.0, 0.12, 0.2, wx, L01 + 1.38, wz, a);
  }
  for (const sgn of [-1, 1]) {
    box(g, M.gunDark, 0.14, 1.72, 0.82, sgn * 3.88, L01 + 0.95, 12.2);
  }

  // The open bridge above: splinter plating round it with a wind deflector on
  // the cap, the pelorus on the centreline, the engine order telegraph, the
  // target designation transmitter and the captain's chair.
  const N = 22;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    if (Math.abs(a - Math.PI) < 0.40) continue;      // the way in, aft
    const r = 3.20;
    const cx = Math.sin(a) * r;
    const cz = 16.2 + Math.cos(a) * r;
    box(g, M.steel, 0.14, 1.15, (2 * Math.PI * r) / N + 0.12, cx, L03 + 0.62, cz,
      a + Math.PI / 2);
    box(g, M.steelDark, 0.34, 0.1, (2 * Math.PI * r) / N + 0.12, cx, L03 + 1.22, cz,
      a + Math.PI / 2);
  }
  // The pelorus, the two engine order telegraphs and the captain's chair.
  cyl(g, M.gunDark, 0.16, 0.2, 1.15, 0, L03 + 0.6, 18.1, 10);
  box(g, M.gunDark, 0.55, 0.2, 0.55, 0, L03 + 1.2, 18.1);
  for (const sgn of [-1, 1]) {
    cyl(g, M.gunDark, 0.24, 0.3, 0.95, sgn * 1.5, L03 + 0.5, 17.6, 10);
    box(g, M.gun, 0.45, 0.4, 0.35, sgn * 1.5, L03 + 1.15, 17.6);
  }
  box(g, M.steelDark, 0.5, 0.12, 0.5, S * 2.2, L03 + 0.62, 14.6);
  box(g, M.steelDark, 0.5, 0.6, 0.12, S * 2.2, L03 + 0.9, 14.35);
  // The chart table on the after side of the open bridge, and the voice pipes
  // down to the wheelhouse.
  box(g, M.steelDark, 1.5, 0.12, 0.7, -S * 1.6, L03 + 0.78, 13.6);
  for (const sgn of [-1, 1]) {
    cyl(g, M.brass, 0.07, 0.07, 1.0, sgn * 0.8, L03 + 0.5, 13.3, 8);
  }

  // Bridge wings, on their brackets, with the coaming, the signal lamp and a
  // gyro repeater on each.
  for (const sgn of [-1, 1]) {
    box(g, M.deckDark, 2.5, 0.14, 3.2, sgn * 4.4, L03, 16.4);
    for (const bz of [15.1, 17.7]) {
      const br = box(g, M.steel, 2.3, 0.16, 0.2, sgn * 4.4, L03 - 0.5, bz);
      br.rotation.z = sgn * 0.4;
    }
    box(g, M.steel, 0.14, 1.05, 3.2, sgn * 5.6, L03 + 0.6, 16.4);
    box(g, M.steelDark, 0.36, 0.1, 3.2, sgn * 5.55, L03 + 1.16, 16.4);
    // The 12-inch signal lamp on its pedestal, and the gyro repeater.
    cyl(g, M.gunDark, 0.26, 0.26, 0.44, sgn * 5.4, L03 + 0.72, 17.5, 10);
    box(g, M.glass, 0.32, 0.32, 0.06, sgn * 5.4, L03 + 0.72, 17.74);
    cyl(g, M.gunDark, 0.14, 0.18, 0.8, sgn * 4.7, L03 + 0.5, 15.3, 8);
    box(g, M.gunDark, 0.34, 0.16, 0.34, sgn * 4.7, L03 + 0.94, 15.3);
    // A pair of long glasses on their stand, which is what a lookout has.
    cyl(g, M.gunDark, 0.09, 0.09, 0.7, sgn * 5.1, L03 + 0.5, 16.4, 8);
    tubeZ(g, M.gunDark, 0.06, 0.5, sgn * 5.1, L03 + 0.9, 16.4, 8);
  }
  // Flag bags at the after end of the wings, where the bunting lives.
  for (const sgn of [-1, 1]) {
    box(g, M.steelDark, 0.75, 0.72, 1.5, sgn * 3.5, L02 + 0.3, 11.6);
    box(g, M.canvas, 0.62, 0.1, 1.36, sgn * 3.5, L02 + 0.67, 11.6);
  }
  // The ready-service lockers and the pyrotechnic stowage on the 01 roof, and
  // the life rafts against the after face of the 02.
  for (const sgn of [-1, 1]) {
    box(g, M.steel, 0.62, 0.8, 1.2, sgn * 4.0, L01 + 0.4, 4.9);
    box(g, M.steelDark, 0.5, 0.62, 0.5, sgn * 2.6, L01 + 0.31, 10.6);
  }

  return director(g, L03);
}

/**
 * The Mk 37 director on its barbette: the box, the rangefinder arms out either
 * side under their hoods, the trainer's hatch, and the Mk 4 radar -- the
 * bedspring -- on the roof of it.
 */
function director(g, L03) {
  const dirBase = L03 + 0.6;
  cyl(g, M.steel, 1.5, 1.7, 1.4, 0, dirBase + 0.7, 15.2, 18);
  const dir = new THREE.Group();
  dir.position.set(0, dirBase + 1.4, 15.2);
  g.add(dir);
  cyl(dir, M.steelDark, 1.45, 1.5, 0.3, 0, 0.15, 0, 18);
  loftRings(dir, M.gun, [
    [1.45, 1.6, 0, 0.3],
    [1.5, 1.65, 0, 0.75],
    [1.45, 1.6, 0, 2.1],
    [1.2, 1.35, -0.05, 2.5],
  ], { px: 0.62, pz: 0.62, n: 18 });
  const dface = box(dir, M.gun, 2.5, 1.6, 0.22, 0, 1.35, 1.5);
  dface.rotation.x = -0.12;
  for (const sgn of [-1, 1]) {
    // The rangefinder arms: a 12-foot base, which is what a Mk 37 carried.
    tubeX(dir, M.gun, 0.3, 1.9, sgn * 2.3, 1.5, 0.1, 12);
    cyl(dir, M.glass, 0.28, 0.28, 0.08, sgn * 3.2, 1.5, 0.1, 12)
      .rotation.z = Math.PI / 2;
    box(dir, M.gunDark, 0.5, 0.36, 0.8, sgn * 1.05, 1.9, 1.15);
    // The pointer's and trainer's telescopes through the face.
    cyl(dir, M.gunDark, 0.08, 0.08, 0.3, sgn * 0.75, 1.3, 1.62, 8)
      .rotation.x = Math.PI / 2;
  }
  box(dir, M.gunDark, 0.7, 0.1, 0.7, 0, 2.55, -0.5);
  // Mk 4: a mattress of dipoles on a frame above the director, on its trunnion.
  cyl(dir, M.steelDark, 0.16, 0.2, 0.8, 0, 2.7, 0.1, 8);
  const bed = new THREE.Group();
  bed.position.set(0, 3.5, 0.15);
  dir.add(bed);
  for (const yy of [-0.95, 0.95]) box(bed, M.steelDark, 3.0, 0.12, 0.12, 0, yy, 0);
  box(bed, M.steelDark, 0.12, 2.0, 0.12, 0, 0, 0);
  for (let i = 0; i < 9; i++) {
    const bx = -1.4 + (i / 8) * 2.8;
    box(bed, M.steelDark, 0.07, 1.95, 0.07, bx, 0, 0);
    for (const yy of [-0.6, 0, 0.6]) tubeZ(bed, M.bright, 0.04, 0.36, bx, yy, 0.22, 6);
  }
  return dir;
}

/** The mast: a tripod abaft the bridge, with the search radar on it. */
function mast(g) {
  const base = deckAt(15) + 3.0;       // its feet stand on the 01 level roof
  const top = base + 9.2;              // the tripod; the topmast goes above it
  // Three legs, leaning IN as they rise -- a tripod that splayed outward going
  // up would be holding nothing up at all.
  for (const [lx, lz] of [[0, 1.4], [-1.4, -1.1], [1.4, -1.1]]) {
    const a = new THREE.Vector3(lx, base, MAST_Z + lz);
    const b = new THREE.Vector3(0, top, MAST_Z);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const leg = cyl(g, M.steel, 0.14, 0.2, a.distanceTo(b), mid.x, mid.y, mid.z, 8);
    leg.rotation.z = Math.atan2(b.x - a.x, b.y - a.y) * -1;
    leg.rotation.x = Math.atan2(b.z - a.z, b.y - a.y);
  }
  // The cross bracing between the legs, a third of the way up: a tripod
  // without it is three poles that happen to meet.
  for (const f of [0.34, 0.66]) {
    const y = base + (top - base) * f;
    const r = 1.4 * (1 - f);
    for (const [ax, az, bx, bz] of [
      [0, r, -r, -r * 0.79], [0, r, r, -r * 0.79], [-r, -r * 0.79, r, -r * 0.79],
    ]) {
      const a = new THREE.Vector3(ax, y, MAST_Z + az);
      const b = new THREE.Vector3(bx, y, MAST_Z + bz);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const br = box(g, M.steel, 0.09, 0.09, a.distanceTo(b) + 0.05, mid.x, mid.y, mid.z);
      br.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    }
  }
  // The topmast above the tripod, and the yard with the halyards on it.
  cyl(g, M.steel, 0.07, 0.13, 7.0, 0, top + 3.3, MAST_Z, 8);
  box(g, M.steel, 6.4, 0.12, 0.12, 0, top + 1.5, MAST_Z);
  for (const sgn of [-1, 1]) {
    box(g, M.wire, 0.03, 3.0, 0.03, sgn * 2.9, top - 0.1, MAST_Z);
    // Signal bunting, which is the one bit of colour on a ship in Measure 21.
    for (let i = 0; i < 3; i++) {
      box(g, mat([0xb0392f, 0xd8b452, 0x2f5c92][i]), 0.5, 0.38, 0.04,
        sgn * (1.1 + i * 0.8), top + 1.0 - i * 0.1, MAST_Z);
    }
  }
  // SG surface-search radar: the small curved dish on the platform, and SC air
  // search above it as a mattress on the topmast.
  const plat = new THREE.Group();
  plat.position.set(0, top - 0.6, MAST_Z);
  g.add(plat);
  cyl(plat, M.deckDark, 1.1, 1.1, 0.1, 0, 0, 0, 12);
  // A rail round it, because a man has to stand up there to work on the set.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    if (Math.abs(a - Math.PI) < 0.5) continue;
    cyl(plat, M.steelDark, 0.04, 0.04, 0.9, Math.sin(a) * 1.05, 0.45, Math.cos(a) * 1.05, 5);
  }
  // The pedestal the aerial turns on. Without it the dish is a thing hanging
  // in the air a metre above its own platform.
  cyl(plat, M.steelDark, 0.14, 0.18, 1.05, 0, 0.45, 0.2, 8);
  const sg = new THREE.Group();
  sg.position.y = 0.9;
  plat.add(sg);
  for (let i = 0; i < 9; i++) {
    const a = -0.9 + (i / 8) * 1.8;
    box(sg, M.bright, 0.1, 1.2, 0.1, Math.sin(a) * 0.95, 0, Math.cos(a) * 0.95 - 0.6, a);
  }
  box(sg, M.steelDark, 0.16, 0.16, 0.7, 0, 0, -0.2);
  const sc = new THREE.Group();
  sc.position.set(0, top + 5.4, MAST_Z);
  g.add(sc);
  box(sc, M.steelDark, 4.4, 0.1, 0.1, 0, 0.75, 0);
  box(sc, M.steelDark, 4.4, 0.1, 0.1, 0, -0.75, 0);
  for (let i = 0; i < 7; i++) {
    const x = -2.0 + (i / 6) * 4.0;
    box(sc, M.steelDark, 0.07, 1.5, 0.07, x, 0, 0);
  }
  // Aerial wires: down from the yard to insulators on the after deckhouse, and
  // one span forward to the bridge. They have to land on something -- run them
  // off on a bearing and they leave the ship altogether.
  const anchors = [
    [top + 4.0, MAST_Z, deckAt(HOUSE_B[0]) + 3.4, HOUSE_B[0], 1.9],
    [top + 4.0, MAST_Z, deckAt(26) + 5.0, 26.0, 1.1],
  ];
  for (const [ay, az, by, bz, spread] of anchors) {
    for (const sgn of [-1, 1]) {
      const a = new THREE.Vector3(sgn * 0.5, ay, az);
      const b = new THREE.Vector3(sgn * spread, by, bz);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const w = box(g, M.wire, 0.035, 0.035, a.distanceTo(b), mid.x, mid.y, mid.z);
      w.lookAt(b);
    }
  }
}

/**
 * Two funnels, raked with the mast, each with its cap, its steam pipes and the
 * grab rails up the side. The forward one is fatter -- it takes two boilers.
 */
function funnels(g) {
  // Height matters more than anything else about a funnel, and it is the one
  // thing a model gets wrong: hers stand about forty-seven feet above the
  // water, which is a little over the top of her bridge and a long way under
  // her masthead. Drawn to nine metres they came out as factory chimneys.
  const stacks = [[FUNNEL_F, 1.66, 1.92, 6.5, 1.16, bridgeDeck(1) - 0.45],
    [FUNNEL_A, 1.52, 1.76, 6.3, 1.14, deckAt(FUNNEL_A) + 2.55]];
  for (const [z, rt, rb, h, fa, y0] of stacks) {
    const f = new THREE.Group();
    f.position.set(0, y0, z);
    f.rotation.x = -0.12;                       // raked aft, like her mast
    g.add(f);
    // The casing is oval in plan, not round: longer fore and aft than it is
    // wide, because that is the shape the uptakes from two boiler rooms make.
    const s = cyl(f, M.steel, rt, rb, h, 0, h / 2, 0, 20);
    s.scale.set(1, 1, fa);
    // The cap, and the black band round the lip.
    const cap = cyl(f, M.gunDark, rt * 1.12, rt * 1.06, 0.42, 0, h + 0.1, 0, 20);
    cap.scale.set(1, 1, fa);
    const inner = cyl(f, M.cave, rt * 0.84, rt * 0.84, 0.3, 0, h + 0.22, 0, 18);
    inner.scale.set(1, 1, fa);
    // The rain cap's supports, and the sirens on the forward one.
    for (const sgn of [-1, 1]) {
      box(f, M.steelDark, 0.1, 0.5, 0.1, sgn * rt * 0.8, h - 0.1, 0);
    }
    // Steam escape pipes up the after side, and the whistle on the forward one.
    for (const sgn of [-1, 1]) {
      cyl(f, M.steelDark, 0.13, 0.13, h * 0.92, sgn * rb * 0.6, h * 0.5, -rb * fa * 0.72, 8);
    }
    if (z > 0) {
      cyl(f, M.brass, 0.17, 0.2, 0.7, S * 0.55, h * 0.72, rb * fa * 0.78, 10);
      cyl(f, M.brass, 0.1, 0.13, 0.5, -S * 0.5, h * 0.66, rb * fa * 0.8, 8);
    }
    // Grab rails: the rungs up the side of every funnel there has ever been,
    // spaced to the casing rather than to a number, so a short funnel does not
    // grow a ladder out of the top of it.
    for (let i = 0; i < 7; i++) {
      box(f, M.steelDark, 0.48, 0.06, 0.06, S * rb * 0.72,
        0.9 + (i * (h - 1.6)) / 6, -rb * fa * 0.34);
    }
    // The apron where the casing meets the deckhouse.
    cyl(f, M.steelDark, rb * 1.14, rb * 1.24, 0.5, 0, -0.2, 0, 20).scale.set(1, 1, fa);
    // And the guys that stay it, which every raked funnel carries.
    for (const sgn of [-1, 1]) {
      const a = new THREE.Vector3(sgn * rb * 0.9, h * 0.82, 0);
      const b = new THREE.Vector3(sgn * (rb + 1.9), 0.2, -1.2);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const gw = box(f, M.wire, 0.04, 0.04, a.distanceTo(b), mid.x, mid.y, mid.z);
      gw.lookAt(b);
    }
  }
  // A casing over the after fire room -- and, crucially, a gap forward of it
  // and another abaft it, because that is where the torpedo mounts go. Run one
  // unbroken casing the length of the waist and the tubes end up inside it.
  const cz = (CASING_A[0] + CASING_A[1]) / 2;
  const cd = Math.abs(CASING_A[1] - CASING_A[0]);
  const cTop = deckAt(cz) + 2.7;
  const cFoot = Math.min(deckAtX(2.8, CASING_A[0]), deckAtX(2.8, CASING_A[1])) - 0.06;
  box(g, M.steel, 5.6, cTop - cFoot, cd, 0, (cTop + cFoot) / 2, cz);
  box(g, M.deckDark, 5.8, 0.14, cd, 0, cTop, cz);
  // Doors and a ladder up the side of it.
  for (const sgn of [-1, 1]) {
    box(g, M.gunDark, 0.12, 1.7, 0.8, sgn * 2.76, deckAt(cz) + 0.9, cz + 2.2);
    sideLadder(g, M.steelDark, {
      out: sgn, skin: 2.8, z: cz - 2.0, y0: deckAt(cz) + 0.15, y1: deckAt(cz) + 2.7,
      half: 0.24, stand: 0.16,
    });
  }
  // Ventilator cowls along her, turned to the wind.
  //
  // Where they stand is decided three times over: not inside a deckhouse --
  // the pair that stood abreast the bridge were buried in it and could not be
  // seen at all -- not over the side, and not within reach of a torpedo bank.
  // The one that stood at frame -4 was inside the arc the forward tubes train
  // through, and a cowl two metres tall is not something fifteen tons of tubes
  // swings over. `[z, inboard, deck]`: how far in from the deck edge, and
  // which deck it stands on.
  const cowls = [
    [13.5, 0.55, bridgeDeck(1)],   // on the 01 roof, outboard of the pilothouse
    [1.6, 1.9, null],
    [-9.2, 1.9, null],
    [-13.4, 1.9, null],
    [-27.5, 1.2, null],
  ];
  for (const [vz, inb, on] of cowls) for (const sgn of [-1, 1]) {
    const v = new THREE.Group();
    const x = on === null ? halfDeck(vz) - inb : 4.70 - inb;
    v.position.set(sgn * x, (on === null ? deckAtX(sgn * x, vz) : on) + 0.05, vz);
    g.add(v);
    cyl(v, M.steel, 0.34, 0.4, 2.2, 0, 1.1, 0, 10);
    const bell = cyl(v, M.steel, 0.62, 0.36, 0.8, 0, 2.4, 0.25, 12);
    bell.rotation.x = -1.1;
    cyl(v, M.cave, 0.5, 0.5, 0.1, 0, 2.62, 0.62, 12).rotation.x = -1.1;
  }
  // And the mushroom heads, which is the other half of how a ship breathes.
  for (const [vz, inb] of [[22.5, 1.5], [-21.0, 1.5], [-43.5, 0.9]]) {
    for (const sgn of [-1, 1]) {
      const x = sgn * (halfDeck(vz) - inb);
      cyl(g, M.steel, 0.24, 0.28, 0.6, x, deckAtX(x, vz) + 0.3, vz, 10);
      cyl(g, M.steelDark, 0.42, 0.34, 0.22, x, deckAtX(x, vz) + 0.66, vz, 12);
    }
  }
}

/** The after deckhouse: mounts 53 and 54 stand on it, and the depth charge
 * gear is worked from it. */
function afterHouse(g) {
  for (const [[z0, z1], wide, h] of [[HOUSE_A, HOUSE_A_W, 2.5], [HOUSE_B, HOUSE_B_W, 3.4]]) {
    const cz = (z0 + z1) / 2;
    const d = Math.abs(z1 - z0);
    // Her roof is where the mountings on it stand, so it is held to the crown
    // and her foot is carried down to the lowest the deck gets under her --
    // the outboard corner at the after end, because the deck is cambered and
    // her sheer falls aft. A house founded on the crown alone stands clear of
    // her own deck all along both sides.
    const top = deckAt(cz) + h;
    const foot = Math.min(deckAtX(wide / 2, z0), deckAtX(wide / 2, z1)) - 0.06;
    box(g, M.steel, wide, top - foot, d, 0, (top + foot) / 2, cz);
    box(g, M.deckDark, wide + 0.2, 0.14, d, 0, top, cz);
    // Doors, portholes and the ladder up, down both sides of each house.
    for (const sgn of [-1, 1]) {
      box(g, M.gunDark, 0.12, 1.7, 0.8, sgn * (wide / 2 - 0.02), deckAt(cz) + 0.9, cz + d * 0.3);
      for (const f of [-0.28, 0.06]) {
        cyl(g, M.glass, 0.17, 0.17, 0.1, sgn * (wide / 2 - 0.03), deckAt(cz) + 1.6, cz + d * f, 10)
          .rotation.z = Math.PI / 2;
        cyl(g, M.steelDark, 0.22, 0.22, 0.08, sgn * (wide / 2 - 0.05), deckAt(cz) + 1.6, cz + d * f, 10)
          .rotation.z = Math.PI / 2;
      }
      sideLadder(g, M.steelDark, {
        out: sgn, skin: wide / 2, z: cz - d * 0.34, y0: deckAt(cz) + 0.15,
        y1: deckAt(cz) + h, half: 0.24, stand: 0.16,
      });
    }
  }
  // The after conning position and the emergency steering gear on the lower
  // house, which is what she is steered from when the bridge has gone.
  box(g, M.steel, 1.6, 1.1, 1.4, 0, deckAt(-24.6) + 3.05, -24.6);
  cyl(g, M.gunDark, 0.3, 0.3, 0.1, 0, deckAt(-24.6) + 3.66, -24.2, 12)
    .rotation.x = Math.PI / 2;
}

// --------------------------------------------------------- depth charges --
//
// The other half of what she is for, and the half that is never in the
// photographs because it lives on the quarterdeck under a tarpaulin.
//
// Two Mk 3 racks at the transom with the charges nose to tail on their rails,
// and six Mk 6 K-guns down the quarters to throw a charge out on either beam.
// Everything here stands where her datasheet says it does, because the
// simulation drops the charges from those stations and a rack modelled a metre
// from where the charges leave her is a rack that is not the rack.

/** Where a rack's rails run at this station: they pinch in as she narrows. */
function rackX(z) { return Math.min(DC_RACK_X, halfDeck(z) - 0.62); }

function depthCharges(g) {
  // The racks. Two rails apiece, rollers between them, and the charges lying
  // on the rollers waiting to be tripped over the stern one at a time.
  for (const sgn of [-1, 1]) {
    const SEG = 16;
    const z0 = -47.3;
    const z1 = -56.6;
    for (let i = 0; i < SEG; i++) {
      const za = z0 + ((z1 - z0) * i) / SEG;
      const zb = z0 + ((z1 - z0) * (i + 1)) / SEG;
      const xa = rackX(za);
      const xb = rackX(zb);
      const len = Math.hypot(zb - za, xb - xa) + 0.05;
      for (const rail of [-0.3, 0.3]) {
        const r = box(g, M.steelDark, 0.11, 0.36, len,
          sgn * ((xa + xb) / 2 + rail),
          deckAtX(sgn * (xa + xb) / 2, (za + zb) / 2) + 0.30, (za + zb) / 2);
        r.rotation.y = sgn * Math.atan2(xb - xa, zb - za);
      }
      // The sleepers the rails are bolted down to.
      if (i % 3 === 0) {
        box(g, M.steelDark, 0.62, 0.12, 0.16, sgn * xa, deckAtX(sgn * xa, za) + 0.06, za);
      }
    }
    // Seven Mk 6 charges on each rack, which is what a Fletcher stowed on the
    // rails with the rest of them below.
    for (let i = 0; i < 7; i++) {
      const z = -48.3 - i * 1.25;
      const x = sgn * rackX(z);
      const y = deckAtX(x, z) + 0.60;
      const c = cyl(g, M.gunDark, 0.235, 0.235, 0.71, x, y, z, 12);
      c.rotation.x = Math.PI / 2;
      // The rolled hoop at each end of the drum and the hydrostatic pistol in
      // the after face of it.
      for (const e of [-0.34, 0.34]) {
        cyl(g, M.steelDark, 0.25, 0.25, 0.06, x, y, z + e, 12).rotation.x = Math.PI / 2;
      }
      cyl(g, M.steelDark, 0.09, 0.09, 0.16, x, y, z - 0.42, 8).rotation.x = Math.PI / 2;
    }
    // The release gear at the after end of each rail: the tripping lever, the
    // hand wheel that sets the interval, and the stop that holds the string.
    const rz = DC_RACK_Z - 0.6;
    const rx = sgn * rackX(rz);
    const ry = deckAtX(rx, rz);
    box(g, M.steelDark, 0.92, 0.62, 0.7, rx, ry + 0.31, rz);
    box(g, M.gunDark, 0.24, 0.72, 0.16, rx, ry + 0.76, rz + 0.3);
    cyl(g, M.gunDark, 0.22, 0.22, 0.07, rx - sgn * 0.5, ry + 0.53, rz, 10)
      .rotation.z = Math.PI / 2;
    // And the chute at the very end, over the transom, which is the last thing
    // a charge touches.
    const cz = -56.8;
    const chute = box(g, M.steelDark, 0.76, 0.16, 1.2,
      sgn * rackX(cz), deckAtX(sgn * rackX(cz), cz) + 0.22, cz);
    chute.rotation.x = 0.18;
  }

  // The K-guns: the throwers that put a pattern out on either beam, with the
  // arbor loaded and the next charge in its cradle alongside.
  for (const [ax, az] of DC_THROWERS) {
    for (const sgn of [-1, 1]) {
      const k = new THREE.Group();
      k.position.set(sgn * ax, deckAtX(sgn * ax, az), az);
      k.rotation.z = -sgn * 0.35;
      g.add(k);
      // The bedplate, the trunnion block and the barrel itself.
      box(k, M.steelDark, 0.8, 0.18, 0.8, 0, 0.09, 0);
      cyl(k, M.gunDark, 0.26, 0.36, 1.6, 0, 0.85, 0, 12);
      cyl(k, M.gunDark, 0.31, 0.31, 0.7, 0, 1.8, 0, 12);
      // The breech and the firing lanyard bracket at its foot.
      cyl(k, M.steelDark, 0.26, 0.3, 0.32, 0, 0.14, 0, 10);
      box(k, M.steelDark, 0.16, 0.34, 0.14, 0.3, 0.4, 0);
      // The arbor sitting in the barrel with its charge on the head of it,
      // which is what a loaded K-gun looks like.
      const ar = cyl(k, M.gunDark, 0.235, 0.235, 0.71, 0, 2.2, 0, 12);
      ar.rotation.x = Math.PI / 2;
      cyl(k, M.steelDark, 0.25, 0.25, 0.06, 0, 2.2, 0.34, 12).rotation.x = Math.PI / 2;
      // The loading tray at the foot of it, which the next charge is rolled
      // up on to.
      box(k, M.steelDark, 0.24, 0.1, 0.9, 0, 0.2, 0.55);
    }
  }

  // The ready charges for the throwers, in chocks against the deckhouse side
  // between them: outboard of the house, inboard of the guns, which is the
  // only strip of deck on a destroyer that is not already spoken for.
  for (const cz of [-31.5, -36.5]) {
    for (const sgn of [-1, 1]) {
      for (const dz of [-0.55, 0.55]) {
        const x = sgn * 4.05;
        const c = cyl(g, M.gunDark, 0.235, 0.235, 0.71,
          x, deckAtX(x, cz) + 0.46, cz + dz, 12);
        c.rotation.x = Math.PI / 2;
      }
      box(g, M.steelDark, 0.62, 0.3, 1.9, sgn * 4.05, deckAtX(sgn * 4.05, cz) + 0.15, cz);
    }
  }

  // The reload stowage on the centreline abaft the after mount: charges on end
  // in their chocks, which is the rest of the fifty-six she carries.
  for (let i = 0; i < 6; i++) {
    const z = -48.6 - (i % 3) * 1.5;
    const x = (i < 3 ? -1 : 1) * 0.9;
    cyl(g, M.gunDark, 0.235, 0.235, 0.71, x, deckAtX(x, z) + 0.41, z, 12);
    box(g, M.steelDark, 0.62, 0.1, 0.62, x, deckAtX(x, z) + 0.05, z);
  }

  // The smoke generators right aft, which is the other half of a screen: a
  // destroyer laying smoke does it with these and with her funnels together.
  for (const sgn of [-1, 1]) {
    const z = -50.5;
    const x = sgn * (halfDeck(z) - 0.95);
    const t = cyl(g, M.gunDark, 0.42, 0.42, 1.5, x, deckAtX(x, z) + 0.63, z, 12);
    t.rotation.x = Math.PI / 2;
    box(g, M.steelDark, 0.8, 0.3, 0.7, x, deckAtX(x, z) + 0.15, z);
  }
}

// ------------------------------------------------------- deck furnishings --

/**
 * Her life rafts, stowed in their racks along the deckhouses.
 *
 * She carried a twenty-six foot motor whaleboat on davits abreast the after
 * funnel as well, and it is not here: on the model it read as a boat hanging
 * in the air off two sticks beside the uptakes, which is worse than no boat at
 * all. The Carley floats are what a destroyer's crew actually went over the
 * side into, and they are stowed where they were -- against the bridge
 * deckhouse, the after fire room casing and the after deckhouse, lashed into
 * racks a man can cut them out of in the dark.
 */
function boatsAndRafts(g) {
  // Carley floats: the oval rafts stacked against the deckhouse and the
  // funnels. They go where a man can get at them and nowhere a torpedo bank
  // swings.
  const racks = [
    [16.0, 4.85, bridgeDeck(0) + 1.4],    // against the bridge deckhouse
    [8.0, 4.85, bridgeDeck(0) + 1.4],
    [FUNNEL_A - 0.6, 3.36, deckAt(FUNNEL_A) + 1.3],   // the after fire room
    [-30.0, 3.96, deckAt(-30) + 1.3],     // and the after deckhouse
  ];
  for (const [rz, rx, ry] of racks) for (const sgn of [-1, 1]) {
    const r = new THREE.Group();
    r.position.set(sgn * rx, ry, rz);
    r.rotation.z = sgn * 0.16;
    r.rotation.x = 0.12;
    g.add(r);
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.21, 7, 16), M.raft);
    t.scale.set(1, 0.6, 1);
    t.rotation.y = Math.PI / 2;
    r.add(t);
    // Slatted grating across the middle of it, which is what a Carley float is
    // -- a cork ring with a floor you stand in, not a solid disc.
    for (let i = -2; i <= 2; i++) {
      box(r, M.canvas, 0.05, 0.14, 1.5 * Math.sqrt(Math.max(0.05, 1 - (i / 2.6) ** 2)),
        0, i * 0.19, 0);
    }
    // The rack it is lashed into, so it is stowed against something.
    for (const dz of [-1.05, 1.05]) {
      box(r, M.steelDark, 0.42, 0.12, 0.12, sgn * -0.24, 0, dz);
      box(r, M.steelDark, 0.1, 1.3, 0.09, sgn * -0.42, 0, dz);
    }
  }
}

/** Ground tackle forward: windlass, wildcats, chain, anchors, bitts. */
function groundTackle(g) {
  const z = 44;
  const y = deckAt(z);
  // The windlass, with a wildcat either side and the capstan head on top.
  box(g, M.steelDark, 2.6, 0.9, 1.6, 0, y + 0.45, z);
  for (const sgn of [-1, 1]) {
    cyl(g, M.gunDark, 0.5, 0.5, 0.42, sgn * 1.5, y + 0.7, z, 12).rotation.z = Math.PI / 2;
    cyl(g, M.steelDark, 0.34, 0.4, 0.7, sgn * 0.55, y + 1.2, z, 10);
  }
  // Chain from each wildcat forward to the hawse, and the anchor in it.
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      const f = i / 11;
      const cz = z + 1.2 + f * 6.4;
      const cx = sgn * (1.5 - f * 0.45);
      cyl(g, M.gunDark, 0.11, 0.11, 0.34, cx, deckAt(cz) + 0.16, cz, 6)
        .rotation.x = Math.PI / 2 + (i % 2) * 0.9;
    }
    // Chain pipe and the hawse the cable goes out through.
    cyl(g, M.gunDark, 0.28, 0.28, 0.4, sgn * 1.05, deckAt(z + 7.6) + 0.2, z + 7.6, 10);
    const t = (z + 9.4) / (LOA / 2);
    const hy = sheer(t) - 1.1;
    const hw = shellAt(t, hy);
    cyl(g, M.cave, 0.42, 0.42, 0.5, sgn * hw * 0.94, hy, zAt(t, hy), 10)
      .rotation.z = Math.PI / 2;
    // The stockless anchor housed in it, flukes against the plating.
    const a = new THREE.Group();
    a.position.set(sgn * hw * 1.0, hy - 0.1, zAt(t, hy) - 0.9);
    a.rotation.y = sgn * 0.1;
    g.add(a);
    cyl(a, M.gunDark, 0.16, 0.16, 1.7, 0, 0, 0, 8).rotation.x = Math.PI / 2;
    box(a, M.gunDark, 0.2, 0.55, 1.0, 0, -0.2, -0.85);
    for (const fl of [-1, 1]) box(a, M.gunDark, 0.18, 0.3, 0.8, 0, fl * 0.42, -1.15);
  }
  // The bullnose at the stem, which is what she is towed and moored by.
  {
    const t = 52.6 / (LOA / 2);
    const by = sheer(t) + 0.55;
    box(g, M.steelDark, 1.0, 0.5, 0.5, 0, by, zAt(t, by) - 0.2);
    cyl(g, M.cave, 0.22, 0.22, 0.6, 0, by, zAt(t, by) - 0.2, 10).rotation.x = Math.PI / 2;
  }
  // Bitts, chocks and fairleads down both sides, which is what a deck is
  // covered in and the first thing a bare model is missing.
  for (const bz of [46, 40, 30, 20, 10, -2, -12, -22, -32, -40, -48]) {
    for (const sgn of [-1, 1]) {
      const w = halfDeck(bz) - 0.62;
      if (w < 0.8) continue;
      const by = deckAtX(sgn * w, bz);
      for (const off of [-0.34, 0.34]) {
        cyl(g, M.steelDark, 0.13, 0.15, 0.62, sgn * w, by + 0.31, bz + off, 8);
        cyl(g, M.steelDark, 0.16, 0.16, 0.08, sgn * w, by + 0.6, bz + off, 8);
      }
      box(g, M.steelDark, 0.5, 0.18, 1.02, sgn * w, by + 0.09, bz);
      // The chock in the bulwark beside them, which is what a line runs out of.
      box(g, M.steelDark, 0.4, 0.3, 0.44, sgn * (halfDeck(bz) - 0.12),
        deckAtX(halfDeck(bz), bz) + 0.2, bz + 1.5);
    }
  }
  // The jackstaff forward. There is no ensign staff aft to go with it: it is
  // unshipped at sea, and the fantail Bofors trains through where it stood.
  cyl(g, M.bright, 0.05, 0.07, 3.2, 0, deckAt(52) + 1.6, 52, 8);
  // Hatches and ammunition scuttles down the length of her.
  for (const [hz, hw, hd] of [[38, 1.0, 1.2], [18, 0.9, 1.1], [-6, 0.9, 1.1],
    [-17, 0.9, 1.1], [-44, 0.9, 1.1], [-48.5, 0.8, 1.0]]) {
    box(g, M.steelDark, hw, 0.2, hd, 0, deckAt(hz) + 0.12, hz);
    box(g, M.gunDark, hw * 0.8, 0.1, hd * 0.8, 0, deckAt(hz) + 0.24, hz);
  }
}

/**
 * Guard rails round the weather deck, and the lifelines on their stanchions.
 *
 * A destroyer's deck edge is a stanchion every six feet with three wires rove
 * through it. Without them she reads as a hull with a flat top; with them she
 * reads as a ship somebody works on.
 */
function railings(g) {
  const put = (z0, z1, skip) => {
    for (let z = z0; z <= z1; z += 3.1) {
      if (skip && skip(z)) continue;
      const t = z / (LOA / 2);
      const sh = sheer(t);
      const w = shellAt(t, sh) - 0.28;
      if (w < 0.5) continue;
      for (const sgn of [-1, 1]) {
        cyl(g, M.steelDark, 0.045, 0.05, 1.05, sgn * w, sh + 0.55, zAt(t, sh), 6);
        for (const wy of [0.35, 0.68, 1.0]) {
          box(g, M.wire, 0.03, 0.03, 3.15, sgn * w, sh + wy, zAt(t, sh) + 1.55);
        }
      }
    }
  };
  // The whole deck edge, less the stretches the mounts and the racks own --
  // and less the forecastle, where the bulwark does the same job and a rail
  // standing in it looks like a fence growing out of a wall.
  put(-54, 25, (z) => (z > 20 && z < 40) || (z > -44 && z < -26));
  // And the rail round the after deckhouse roofs, where the depth charge
  // party works and where there is nothing at all between a man and the sea.
  for (const [[z0, z1], wide, h] of [[HOUSE_A, HOUSE_A_W, 2.5], [HOUSE_B, HOUSE_B_W, 3.4]]) {
    rail(g, M.steelDark, z0 - 0.5, z1 + 0.5, () => wide / 2 - 0.12,
      () => deckAt((z0 + z1) / 2) + h, 2.6, [-1, 1], 0.95);
  }
}

/** The odds and ends: lockers, searchlight, life buoys, the binnacle. */
function fittings(g) {
  // Twenty-four inch searchlight on its platform abaft the forward funnel.
  const sl = new THREE.Group();
  sl.position.set(0, deckAt(FUNNEL_A) + 2.7 + 0.58, -8.2);
  g.add(sl);
  cyl(sl, M.steelDark, 0.9, 0.9, 0.12, 0, -0.5, 0, 14);
  cyl(sl, M.gunDark, 0.22, 0.26, 0.7, 0, -0.15, 0, 10);
  const drum = cyl(sl, M.bright, 0.62, 0.62, 0.7, 0, 0.4, 0, 16);
  drum.rotation.x = Math.PI / 2;
  cyl(sl, M.glass, 0.56, 0.56, 0.08, 0, 0.4, 0.38, 16).rotation.x = Math.PI / 2;
  // Ready-service lockers along the deckhouse sides and round the after
  // mounts, which is where the five-inch ammunition actually lives.
  for (const [lz, sgn] of [[19.4, -1], [19.4, 1], [-20.4, -1], [-20.4, 1],
    [-36.0, -1], [-36.0, 1], [-46.6, -1], [-46.6, 1]]) {
    const w = halfDeck(lz) - 0.72;
    if (w < 1.2) continue;
    box(g, M.steel, 0.7, 0.9, 1.4, sgn * w, deckAtX(sgn * w, lz) + 0.45, lz);
    box(g, M.steelDark, 0.74, 0.1, 1.44, sgn * w, deckAtX(sgn * w, lz) + 0.92, lz);
  }
  // Life buoys on the bridge wings and the after deckhouse.
  for (const [bx, bz, by] of [
    [S * 5.55, 16, bridgeDeck(3) + 0.6],
    [-S * 5.55, 16, bridgeDeck(3) + 0.6],
    [0, -43.6, deckAt(-43.6) + 1.2],
  ]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 6, 12), M.mark);
    t.position.set(bx, by, bz);
    t.rotation.y = Math.PI / 2;
    g.add(t);
    box(g, M.steelDark, 0.14, 0.9, 0.12, bx, by - 0.45, bz);
  }
  // The boat boom stowed against her port side, and the accommodation ladder
  // triced up on the starboard.
  box(g, M.steelDark, 0.16, 0.16, 5.0, -S * (halfDeck(-10) - 0.7), deckAt(-10) + 1.1, -10);
  for (let i = 0; i < 9; i++) {
    box(g, M.steelDark, 0.7, 0.07, 0.2, S * (halfDeck(-4) - 0.55),
      deckAt(-4) + 0.5 + i * 0.28, -6.4 + i * 0.3);
  }
  // Fire hoses on their reels down the waist, and the fire main itself.
  for (const sgn of [-1, 1]) {
    for (const hz of [14.0, -2.0, -28.0]) {
      const w = halfDeck(hz) - 0.95;
      if (w < 1.2) continue;
      const reel = cyl(g, M.steelDark, 0.3, 0.3, 0.34,
        sgn * w, deckAtX(sgn * w, hz) + 0.42, hz, 12);
      reel.rotation.z = Math.PI / 2;
      cyl(g, M.gunDark, 0.1, 0.1, 0.9, sgn * w, deckAtX(sgn * w, hz) + 0.2, hz, 8);
    }
  }
}

/**
 * Her light anti-aircraft battery: five twin Bofors and seven Oerlikons, which
 * is the 1943 refit and the reason a Fletcher could keep her feet in the
 * Solomons.
 *
 * Where each one is standing is decided by three things at once, and all three
 * have to be satisfied or she is wrong in a way that shows: the tub has to be
 * on something, it may not hang over the side -- her beam is measured over
 * everything -- and it may not be inside a five-inch barrel. The after mounts
 * stow trained aft and a 5"/38 is nearly seven metres of gun on the
 * centreline, so anything standing on the centreline between mount 53 and the
 * transom is inside one. A pair on the fantail is the arrangement that looks
 * right in a photograph and cannot be built; the pair goes on the deckhouse,
 * where there is beam for it, and the odd one goes abaft everything.
 */
function lightAA(g) {
  const mounts = [];
  const keep = (m) => { mounts.push(m); return m; };
  g.userData.aaMounts = mounts;
  // Two twin Bofors in tubs abreast the after funnel, bracketed off the fire
  // room casing and standing on the main deck.
  for (const sgn of [-1, 1]) {
    keep(bofors(g, sgn * 4.28, deckAtX(sgn * 4.28, FUNNEL_A) + 0.03, FUNNEL_A,
      sgn * 0.45, 1.40));
  }
  // Two side by side on the after deckhouse, under mount 53's barrel and
  // outboard of it.
  for (const sgn of [-1, 1]) {
    keep(bofors(g, sgn * 2.15, deckAt((HOUSE_A[0] + HOUSE_A[1]) / 2) + 2.5,
      -32.2, sgn * 0.5, 1.30));
  }
  // And one right aft on the fantail between the depth charge racks, trained
  // astern where there is nothing of her own in the way.
  keep(bofors(g, 0, deckAt(-54.8) + 0.05, -54.8, Math.PI, 1.30));

  // Their directors. Every twin forty was laid by a man in a Mk 51 tub beside
  // it holding a ring sight on the aeroplane; without them she is five guns
  // being aimed over open sights.
  mk51(g, S * 3.70, bridgeDeck(1), 3.9, S * 0.9);
  mk51(g, S * 1.95, deckAt((HOUSE_B[0] + HOUSE_B[1]) / 2) + 3.4, -40.3, S * 2.7);

  // Seven Oerlikons: two on the 01 level between the funnel and the mast, two
  // on sponsons at the forward end of it, two in the waist at the deck edge,
  // and one right forward on the forecastle.
  const roof01 = bridgeDeck(1);
  for (const sgn of [-1, 1]) {
    keep(oerlikon(g, sgn * 3.5, roof01, 8.2, sgn * 1.1));
    keep(oerlikon(g, sgn * 4.5, roof01, 19.2, sgn * 0.8));
    keep(oerlikon(g, sgn * (halfDeck(-24) - 1.75),
      deckAtX(halfDeck(-24) - 1.75, -24) + 0.02, -24, sgn * 1.1));
  }
  keep(oerlikon(g, 0, deckAt(28) + 0.02, 28, 0));
  // The two forward Oerlikons stand on sponsons bracketed off the side of the
  // bridge deckhouse: a tub hanging in the air off her side is the one thing
  // that gives a gun platform away.
  for (const sgn of [-1, 1]) {
    cyl(g, M.deckDark, 1.2, 1.2, 0.16, sgn * 4.5, roof01 - 0.1, 19.2, 14);
    for (const bz of [18.3, 20.1]) {
      const br = box(g, M.steel, 1.8, 0.16, 0.22, sgn * 4.25, roof01 - 0.62, bz);
      br.rotation.z = sgn * 0.42;
    }
  }
}

/** The five 5"/38 mounts, at the stations her datasheet gives: two forward
 * superfiring, one on the after deckhouse, two aft superfiring. */
function mainBattery(g) {
  const spots = [
    [32, deckAt(32), false],
    [24, deckAt(24) + 2.6, false],
    // Their barbettes stand on the roof, not in it: the ring is 0.55 m deep,
    // so the mounting is that much higher than the plate it is bolted to.
    [-28, deckAt((HOUSE_A[0] + HOUSE_A[1]) / 2) + 2.5 + 0.56, true],
    [-37, deckAt((HOUSE_B[0] + HOUSE_B[1]) / 2) + 3.4 + 0.56, true],
    [-45, deckAt(-45), true],             // 55, on the fantail
  ];
  return spots.map(([z, y, aft]) => {
    // The superfiring forward mount stands on its own barbette ring.
    if (z === 24) {
      cyl(g, M.steel, 2.3, 2.5, 2.6, 0, deckAt(24) + 1.3, 24, 16);
      // With a ladder up the side of it, because somebody has to get in.
      sideLadder(g, M.steelDark, {
        out: S, skin: 2.4, z: 22.4, y0: deckAt(24) + 0.1, y1: deckAt(24) + 2.6,
        half: 0.24, stand: 0.16,
      });
    }
    return fiveInch(g, 0, y, z, aft);
  });
}

// ------------------------------------------------------------------ build --

/**
 * Everything on her that does not move, as a list of named sub-assemblies.
 *
 * Named, because when a measurement says something hangs 0.4 m over the side
 * the only useful next question is what, and a merged mesh cannot answer it.
 */
const STATIC = [
  ['hull', buildHull],
  ['afterHouse', afterHouse],
  ['bridge', bridge],
  ['funnels', funnels],
  ['mast', mast],
  ['boats', boatsAndRafts],
  ['groundTackle', groundTackle],
  ['depthCharges', depthCharges],
  ['fittings', fittings],
  ['lightAA', lightAA],
  ['torpedoes', (g) => {
    g.userData.torpMounts = [torpedoBank(g, TUBES_F), torpedoBank(g, TUBES_A)];
  }],
  ['railings', railings],
];

/**
 * The whole ship, welded down to one mesh per material.
 *
 * The five-inch mounts come back as their own groups so the simulation can
 * train them; everything else is static and is merged, which takes a couple of
 * thousand little pieces down to a handful of draw calls.
 *
 * @returns {{group: THREE.Group, turrets: THREE.Group[], length: number,
 *            beam: number, deckY: number}}
 */
export function buildFletcher() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  // Her insides, fitted to her own lines, and the weld split one buffer per
  // compartment so a compartment blown out of her can have its plating taken
  // off and you can see them. See interior.js.
  buildInterior(g, { loa: LOA, shellAt, keelY, sheer, zAt });
  // Everything static welded into one mesh per material. Done before the guns
  // go on, because the guns have to keep moving.
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  // And inside every part of her that moves -- after her batteries are on her,
  // because they are put on after the hull is welded and a weld run before
  // them finds nothing to do. A mounting is welded in its own frame, so it
  // goes on training and elevating exactly as it did and costs two draw calls
  // instead of a hundred. See mergeMoving.
  mergeMoving(g);

  g.userData.classId = 'fletcher';
  // Steel where she is plated and planking where she is decked: the maps go
  // on after the weld, when she is a handful of meshes rather than a few
  // hundred, and the weld is what gave her the coordinates to put them on.
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: sheer(0),
    // Everything else aboard that trains: her tubes and her light battery.
    // See ships.js -- the scene lays them the same way it lays her turrets.
    torpMounts: g.userData.torpMounts || [],
    aaMounts: g.userData.aaMounts || [],
  };
}

/**
 * Every piece of her and where it sits, for the tests.
 *
 * `moving` marks anything under a group the welder was told to leave alone --
 * the gun mounts -- so a check can tell a mount that trains from a deckhouse
 * that does not.
 */
export function fletcherParts() {
  const parts = [];
  for (const [name, build] of [...STATIC, ['mainBattery', mainBattery]]) {
    const g = new THREE.Group();
    build(g);
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      // Whether it rides something that moves -- a gun mounting, a training
      // torpedo bank. Those are allowed to swing out over the side; a locker
      // bolted to the deck is not.
      let moving = false;
      for (let n = o; n; n = n.parent) if (n.userData && n.userData.dynamic) { moving = true; break; }
      o.geometry.computeBoundingBox();
      const lb = o.geometry.boundingBox;
      const bb = lb.clone().applyMatrix4(o.matrixWorld);
      parts.push({
        from: name,
        min: [bb.min.x, bb.min.y, bb.min.z],
        max: [bb.max.x, bb.max.y, bb.max.z],
        // Its own size, before it was turned: a gun barrel laid at forty
        // degrees has a fat axis-aligned box and is still a stick.
        size: [lb.max.x - lb.min.x, lb.max.y - lb.min.y, lb.max.z - lb.min.z],
        moving,
      });
    });
  }
  return parts;
}

/**
 * Where her depth charge gear stands, for the check that holds the model and
 * the datasheet together. Racks first and then throwers, which is the order
 * everything else numbers them in. See chargeMounts.
 */
export function fletcherCharges() {
  const out = [];
  for (const sgn of [-1, 1]) out.push({ x: sgn * rackX(DC_RACK_Z), z: DC_RACK_Z });
  for (const [ax, az] of DC_THROWERS) {
    for (const sgn of [-1, 1]) out.push({ x: sgn * ax, z: az });
  }
  return out;
}

export {
  LOA as FLETCHER_LOA, BEAM as FLETCHER_BEAM, DRAFT as FLETCHER_DRAFT,
  deckAt, halfDeck, sheer,
};
