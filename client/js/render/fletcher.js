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
// seven Oerlikons, and the depth charge gear aft that is half the reason she
// exists.
//
// Local frame, as everywhere else in the renderer: +Z is the bow, +Y is up, and
// therefore starboard is -X. y = 0 is the waterline.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic } from './merge.js';
import {
  box, cyl, tubeZ, tubeX, sphere, smooth, lerpTable, loftRings, ladder,
} from './shipkit.js';

export const LOA = 114.7;
export const BEAM = 12.1;
export const DRAFT = 5.4;
/** Starboard, in this frame. The whaleboat and the ladder go on this side. */
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

// Half-breadths at the waterline. Her extreme beam is 12.1 m and it is measured
// at the deck edge, where the flare has added its share, so the moulded figure
// here has to come out a little under six.
const HALF_BEAM = [
  [-1.00, 2.45], [-0.92, 2.98], [-0.80, 3.80], [-0.65, 4.57], [-0.50, 5.12],
  [-0.32, 5.58], [-0.15, 5.79], [0.00, 5.82], [0.15, 5.69], [0.32, 5.39],
  [0.50, 4.86], [0.65, 4.14], [0.78, 3.17], [0.88, 2.12], [0.95, 1.11],
  [1.00, 0.17],
];

const KEEL = [
  [-1.00, -2.35], [-0.90, -4.20], [-0.78, -5.05], [-0.60, -5.38], [0.00, -5.40],
  [0.55, -5.30], [0.72, -4.90], [0.84, -3.90], [0.93, -1.90], [1.00, 1.30],
];

const SHEER = [
  [-1.00, 4.15], [-0.80, 4.20], [-0.55, 4.30], [-0.25, 4.45], [0.00, 4.62],
  [0.30, 5.05], [0.55, 5.62], [0.75, 6.35], [0.90, 7.05], [1.00, 7.55],
];

const halfBeam = (t) => lerpTable(HALF_BEAM, t);
const keelY = (t) => lerpTable(KEEL, t);
const sheer = (t) => lerpTable(SHEER, t);

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
// Her stations, fore to aft. These are the real ship's, converted from feet
// from the bow to metres from amidships, and her datasheet carries the same
// numbers for the mounts and the tubes so the guns and the fish come out of
// the things you can see.
//
// The order along the waist is what makes a Fletcher a Fletcher: bridge,
// funnel, tubes, funnel, tubes, after deckhouse. The forward funnel rises out
// of the bridge deckhouse rather than standing on its own -- try to give it a
// casing of its own and there is no room left for the after bank of tubes.
const BRIDGE_F = 21.0;
const BRIDGE_A = 4.0;
const FUNNEL_F = 5.5;
const MAST_Z = 9.0;
const TUBES_F = -3.0;
const FUNNEL_A = -11.2;
const TUBES_A = -19.0;
const HOUSE_A = [-23.5, -34.0];        // after deckhouse, mount 53 on it
const HOUSE_B = [-35.0, -41.5];        // and the raised one, mount 54 on it

const STEM = 4.6;
const COUNTER = 2.6;
function stemAt(y) { return STEM * Math.pow(Math.max(0, y + 2) / 9.6, 1.5); }
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
const STATIONS = 68;

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
 * The three strakes, as functions of the station: red lead below the boot top,
 * the black boot topping through the waterline, and navy blue from there up to
 * the deck edge -- which is the sheer, and so rises three and a half metres
 * between the transom and the stem.
 */
function strakeBands() {
  return [
    [(t) => keelY(t) - 0.02, BOOT_LO, M.antifoul],
    [BOOT_LO, BOOT_HI, M.boot],
    [BOOT_HI, sheer, M.hull],
  ];
}

/** The same three, evaluated at one station, for capping the ends. */
function strakes(t) {
  const kb = keelY(t);
  return [
    [kb, Math.max(kb, BOOT_LO), M.antifoul],
    [Math.max(kb, BOOT_LO), Math.max(kb, BOOT_HI), M.boot],
    [Math.max(kb, BOOT_HI), sheer(t), M.hull],
  ];
}

/** Close an end of the shell, painted in the same three strakes. */
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
    for (let i = 0; i < 22; i++) {
      const t = -0.5 + (i / 21) * 0.86;
      const y = keelY(t) * 0.52;
      const w = shellAt(t, y);
      const b = box(g, M.antifoul, 0.1, 0.62, LOA * 0.04, sgn * w * 1.01, y, zAt(t, y));
      b.rotation.z = sgn * 0.6;
    }
  }
  // Two shafts, on struts, with three-bladed screws and the rudders behind.
  for (const sgn of [-1, 1]) {
    const x = sgn * 2.0;
    tubeZ(g, M.steelDark, 0.26, 13, x, -4.5, -34, 10);
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
    // Rudder, abaft each screw.
    const r = box(g, M.antifoul, 0.22, 2.9, 2.3, x, -3.7, -43.2);
    r.rotation.x = 0.04;
  }
  // The skeg on the centreline, and the sole of the keel.
  box(g, M.antifoul, 0.5, 1.0, 26, 0, -5.1, -26);
  box(g, M.antifoul, 0.7, 0.34, LOA * 0.72, 0, -5.45, -4);
}

function buildHull(g) {
  for (const [lo, hi, m] of strakeBands()) loftBand(g, m, lo, hi);
  capEnd(g, 1, 1);
  capEnd(g, -1, -1);
  weatherDeck(g);
  underwater(g);
  // The stem bar. It has to be swept along the rake and not stacked up it:
  // a stack of upright blocks on a stem that runs aft 4.6 m in 9.6 m of
  // height comes out as a flight of stairs.
  const SEG = 18;
  const foot = keelY(1);
  const head = sheer(1) + 0.4;
  for (let i = 0; i < SEG; i++) {
    const y0 = foot + ((head - foot) * i) / SEG;
    const y1 = foot + ((head - foot) * (i + 1)) / SEG;
    const z0 = zAt(1, y0);
    const z1 = zAt(1, y1);
    const len = Math.hypot(y1 - y0, z1 - z0) + 0.04;
    const b = box(g, M.hull, 0.3, 0.34, len, 0, (y0 + y1) / 2, (z0 + z1) / 2);
    b.rotation.x = Math.atan2(y1 - y0, z1 - z0) - Math.PI / 2;
  }
}

// -------------------------------------------------------------- armament --

/** Deck height on the centreline at this station, which everything stands on. */
function deckAt(z) {
  const t = Math.max(-1, Math.min(1, (z / (LOA / 2))));
  return sheer(t) + 0.26;
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

  // Sighting hoods either side of the face -- pointer and trainer -- each with
  // its slit, which is the detail that makes a 5"/38 read as a 5"/38.
  for (const sgn of [-1, 1]) {
    const hood = box(mount, M.gun, 0.6, 0.56, 0.86, sgn * 1.08, 1.66, 0.86);
    hood.rotation.z = sgn * 0.06;
    box(mount, M.glass, 0.24, 0.16, 0.1, sgn * 1.08, 1.7, 1.3);
    box(mount, M.gunDark, 0.64, 0.1, 0.9, sgn * 1.08, 1.95, 0.86);
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
    // The impulse charge breech aft.
    cyl(tube, M.gunDark, 0.3, 0.36, 0.5, 0, 0, -3.7, 12).rotation.x = Math.PI / 2;
  }
  // The trainer's seat and the sight bar on the side of the bank.
  box(rack, M.gunDark, 0.5, 0.12, 0.5, S * 2.1, 0.05, -1.9);
  box(rack, M.gunDark, 0.16, 0.7, 0.16, S * 2.1, 0.42, -1.9);
  box(rack, M.gun, 3.9, 0.22, 0.5, 0, 0.02, -3.3);
  return rack;
}

/** A twin 40 mm Bofors in its splinter shield, on its own bandstand. */
function bofors(g, x, y, z, ry) {
  const tub = new THREE.Group();
  tub.position.set(x, y, z);
  tub.rotation.y = ry;
  g.add(tub);
  // The shield: a ring of plate about waist high, open at the back.
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a = -1.35 + (i / (N - 1)) * 4.9;
    const r = 1.55;
    // The plate lies along the tangent, not the radius. Set this to `a` and
    // every gun tub on her comes out a starburst of spokes.
    box(tub, M.steel, 0.12, 1.15, (2 * Math.PI * r) / N + 0.12,
      Math.sin(a) * r, 0.58, Math.cos(a) * r, a + Math.PI / 2);
  }
  cyl(tub, M.deckDark, 1.6, 1.6, 0.14, 0, 0.05, 0, 18);
  // The mount: a pedestal, the cradle and two barrels with their flash hiders.
  const gunG = new THREE.Group();
  gunG.position.y = 0.35;
  // The gun swings inside its shield; the shield is structure and does not.
  gunG.userData.dynamic = true;
  gunG.userData.rest = ry;
  tub.add(gunG);
  cyl(gunG, M.gunDark, 0.42, 0.55, 0.5, 0, 0.25, 0, 12);
  box(gunG, M.gun, 1.15, 0.62, 1.0, 0, 0.75, -0.1);
  for (const sgn of [-1, 1]) {
    tubeZ(gunG, M.gunDark, 0.075, 2.3, sgn * 0.28, 1.0, 1.15, 10);
    cyl(gunG, M.gunDark, 0.11, 0.11, 0.34, sgn * 0.28, 1.0, 2.2, 10)
      .rotation.x = Math.PI / 2;
    // Magazine feeding from above, which is what makes a Bofors look busy.
    box(gunG, M.gunDark, 0.16, 0.55, 0.2, sgn * 0.28, 1.34, 0.5);
  }
  // Layer's and trainer's seats either side.
  for (const sgn of [-1, 1]) {
    box(gunG, M.gunDark, 0.34, 0.1, 0.34, sgn * 0.85, 0.72, -0.5);
    box(gunG, M.gunDark, 0.1, 0.4, 0.1, sgn * 0.85, 0.5, -0.5);
  }
  // Ready-use ammunition against the inside of the shield.
  for (const sgn of [-1, 1]) box(tub, M.gunDark, 0.4, 0.5, 0.7, sgn * 1.5, 0.35, -1.1);
  return gunG;
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
  }
  cyl(o, M.gunDark, 0.22, 0.3, 1.1, 0, 0.55, 0, 10);
  const g2 = new THREE.Group();
  g2.position.y = 1.15;
  g2.userData.dynamic = true;
  g2.userData.rest = ry;
  o.add(g2);
  // The gun: barrel, the big drum magazine on top, and the shoulder rests.
  const bar = tubeZ(g2, M.gunDark, 0.05, 1.9, 0, 0.1, 0.9, 8);
  bar.rotation.x = Math.PI / 2 - 0.22;
  cyl(g2, M.gunDark, 0.28, 0.28, 0.16, 0, 0.42, 0.1, 12);
  box(g2, M.gunDark, 0.16, 0.3, 0.5, 0, 0.1, -0.2);
  for (const sgn of [-1, 1]) box(g2, M.gunDark, 0.06, 0.24, 0.06, sgn * 0.2, -0.05, -0.45);
  return g2;
}

// -------------------------------------------------------- superstructure --

/**
 * The bridge structure.
 *
 * A Fletcher's is small and stacked: the deckhouse on the weather deck, the
 * charthouse and pilothouse above it, an open bridge on top of that with the
 * splinter plating round it, and the Mk 37 director sitting over the whole
 * thing. It is close and cramped and it is where everything happens.
 */
function bridge(g) {
  const base = deckAt(15);
  const L01 = bridgeDeck(1);       // the 01 level roof: the gun deck
  const L02 = bridgeDeck(2);       // the pilothouse roof
  const L03 = bridgeDeck(3);       // the open bridge deck

  // 01 level: the long deckhouse. Galley, radio, the wardroom and the ladders
  // up, and a gun deck on top of it.
  loftRings(g, M.steel, [
    [4.70, (BRIDGE_F - BRIDGE_A) / 2, (BRIDGE_F + BRIDGE_A) / 2, base],
    [4.70, (BRIDGE_F - BRIDGE_A) / 2, (BRIDGE_F + BRIDGE_A) / 2, L01],
  ]);
  box(g, M.deckDark, 9.5, 0.12, BRIDGE_F - BRIDGE_A - 0.4, 0, L01 + 0.06,
    (BRIDGE_F + BRIDGE_A) / 2);
  // 02: charthouse forward, pilothouse over it, wrapped round the front.
  loftRings(g, M.steel, [
    [3.90, 4.25, 15.75, L01],
    [3.90, 4.25, 15.75, L02],
  ]);
  box(g, M.deckDark, 8.0, 0.12, 8.2, 0, L02 + 0.06, 15.75);
  // 03: the open bridge, inside its splinter coaming.
  loftRings(g, M.steel, [
    [3.10, 3.10, 16.0, L02],
    [3.10, 3.10, 16.0, L03],
  ]);
  box(g, M.deckDark, 6.4, 0.12, 6.4, 0, L03 + 0.06, 16.0);

  // Watertight doors and portholes down both sides of the deckhouse, which is
  // most of what you actually see of a superstructure at any distance.
  for (const sgn of [-1, 1]) {
    for (const dz of [7.0, 18.0]) {
      box(g, M.gunDark, 0.14, 1.75, 0.85, sgn * 4.66, base + 0.9, dz);
      cyl(g, M.steelDark, 0.09, 0.09, 0.16, sgn * 4.74, base + 0.9, dz + 0.3, 8)
        .rotation.z = Math.PI / 2;
    }
    for (const dz of [5.6, 9.6, 11.6, 13.6, 20.0]) {
      cyl(g, M.glass, 0.19, 0.19, 0.1, sgn * 4.7, base + 1.75, dz, 10)
        .rotation.z = Math.PI / 2;
      cyl(g, M.steelDark, 0.24, 0.24, 0.06, sgn * 4.68, base + 1.75, dz, 10)
        .rotation.z = Math.PI / 2;
    }
    // The inclined ladder up to the gun deck, and vertical rungs above it.
    ladder(g, M.steelDark, sgn * 4.3, deckAt(5.2) + 0.1, L01, 5.2, 7.4);
    for (let i = 0; i < 6; i++) {
      box(g, M.steelDark, 0.5, 0.07, 0.07, sgn * 1.5, L01 + 0.3 + i * 0.44, 11.8);
    }
  }

  // The pilothouse windows: the band right round the front of the 02 level,
  // set into a coaming, with the wing doors at the after end of the run.
  for (let i = 0; i < 13; i++) {
    const a = -1.34 + (i / 12) * 2.68;
    const r = 3.55;
    const wx = Math.sin(a) * r * 1.02;
    const wz = 15.75 + Math.cos(a) * r * 1.04;
    box(g, M.glass, 0.92, 0.86, 0.1, wx, L01 + 1.85, wz, a);
    box(g, M.steelDark, 0.96, 0.1, 0.12, wx, L01 + 2.34, wz, a);
    box(g, M.steelDark, 0.96, 0.1, 0.12, wx, L01 + 1.38, wz, a);
  }
  for (const sgn of [-1, 1]) {
    box(g, M.gunDark, 0.12, 1.7, 0.8, sgn * 3.85, L01 + 0.9, 12.6);
  }

  // The open bridge above: splinter plating round it with a wind deflector on
  // the cap, the pelorus on the centreline, the engine order telegraph, the
  // target designation transmitter and the captain's chair.
  const N = 20;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    if (Math.abs(a - Math.PI) < 0.42) continue;      // the way in, aft
    const r = 3.16;
    const cx = Math.sin(a) * r;
    const cz = 16.0 + Math.cos(a) * r;
    box(g, M.steel, 0.14, 1.15, (2 * Math.PI * r) / N + 0.12, cx, L03 + 0.62, cz,
      a + Math.PI / 2);
    box(g, M.steelDark, 0.34, 0.1, (2 * Math.PI * r) / N + 0.12, cx, L03 + 1.22, cz,
      a + Math.PI / 2);
  }
  cyl(g, M.gunDark, 0.16, 0.2, 1.15, 0, L03 + 0.6, 18.0, 10);
  box(g, M.gunDark, 0.55, 0.2, 0.55, 0, L03 + 1.2, 18.0);
  for (const sgn of [-1, 1]) {
    cyl(g, M.gunDark, 0.24, 0.3, 0.95, sgn * 1.5, L03 + 0.5, 17.6, 10);
    box(g, M.gun, 0.45, 0.4, 0.35, sgn * 1.5, L03 + 1.15, 17.6);
  }
  box(g, M.steelDark, 0.5, 0.12, 0.5, S * 2.2, L03 + 0.62, 14.6);
  box(g, M.steelDark, 0.5, 0.6, 0.12, S * 2.2, L03 + 0.9, 14.35);

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
    cyl(g, M.gunDark, 0.26, 0.26, 0.44, sgn * 5.4, L03 + 0.72, 17.5, 10);
    box(g, M.glass, 0.32, 0.32, 0.06, sgn * 5.4, L03 + 0.72, 17.74);
    cyl(g, M.gunDark, 0.14, 0.18, 0.8, sgn * 4.7, L03 + 0.5, 15.3, 8);
    box(g, M.gunDark, 0.34, 0.16, 0.34, sgn * 4.7, L03 + 0.94, 15.3);
  }
  // Flag bags at the after end of the wings, where the bunting lives.
  for (const sgn of [-1, 1]) {
    box(g, M.steelDark, 0.75, 0.72, 1.5, sgn * 3.5, L02 + 0.5, 11.6);
    box(g, M.canvas, 0.62, 0.1, 1.36, sgn * 3.5, L02 + 0.87, 11.6);
  }

  // The Mk 37 director on its barbette: the box, the rangefinder arms out
  // either side under their hoods, the trainer's hatch, and the Mk 4 radar --
  // the bedspring -- on the roof of it.
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
    tubeX(dir, M.gun, 0.3, 1.9, sgn * 2.3, 1.5, 0.1, 12);
    cyl(dir, M.glass, 0.28, 0.28, 0.08, sgn * 3.2, 1.5, 0.1, 12)
      .rotation.z = Math.PI / 2;
    box(dir, M.gunDark, 0.5, 0.36, 0.8, sgn * 1.05, 1.9, 1.15);
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
 * The heights of her three bridge levels above the waterline, named once so a
 * life buoy or an Oerlikon can be put on one without guessing.
 */
function bridgeDeck(n) { return deckAt(15) + [0, 3.0, 5.8, 7.5][n]; }

/**
 * Two funnels, raked with the mast, each with its cap, its steam pipes and the
 * grab rails up the side. The forward one is fatter -- it takes two boilers.
 */
function funnels(g) {
  const stacks = [[FUNNEL_F, 1.60, 1.84, 9.4, 1.16], [FUNNEL_A, 1.46, 1.68, 8.6, 1.14]];
  for (const [z, rt, rb, h, fa] of stacks) {
    const y0 = deckAt(z) + (z > 0 ? 3.0 : 2.7);
    const f = new THREE.Group();
    f.position.set(0, y0, z);
    f.rotation.x = -0.12;                       // raked aft, like her mast
    g.add(f);
    // The casing is oval in plan, not round: wider athwartships than fore-aft.
    const s = cyl(f, M.steel, rt, rb, h, 0, h / 2, 0, 20);
    s.scale.set(1, 1, fa);
    // The cap, and the black band round the lip.
    const cap = cyl(f, M.gunDark, rt * 1.12, rt * 1.06, 0.42, 0, h + 0.1, 0, 20);
    cap.scale.set(1, 1, fa);
    const inner = cyl(f, M.cave, rt * 0.84, rt * 0.84, 0.3, 0, h + 0.22, 0, 18);
    inner.scale.set(1, 1, fa);
    // Steam escape pipes up the after side, and the whistle on the forward one.
    for (const sgn of [-1, 1]) {
      cyl(f, M.steelDark, 0.13, 0.13, h * 0.92, sgn * rb * 0.6, h * 0.5, -rb * fa * 0.72, 8);
    }
    // Grab rails: the rungs up the side of every funnel there has ever been.
    for (let i = 0; i < 7; i++) {
      box(f, M.steelDark, 0.48, 0.06, 0.06, S * rb * 0.72, 1.2 + i * 1.05, -rb * fa * 0.34);
    }
    // The apron where the casing meets the deckhouse.
    cyl(f, M.steelDark, rb * 1.14, rb * 1.24, 0.5, 0, -0.2, 0, 20).scale.set(1, 1, fa);
  }
  // A casing over each fire room, one under each funnel -- and, crucially, a
  // gap between them and another abaft the second, because that is where the
  // torpedo mounts go. Run one unbroken casing the length of the waist and the
  // tubes end up inside it.
  box(g, M.steel, 6.2, 2.7, 7.4, 0, deckAt(FUNNEL_A) + 1.35, FUNNEL_A);
  box(g, M.deckDark, 6.4, 0.14, 7.4, 0, deckAt(FUNNEL_A) + 2.7, FUNNEL_A);
  // Ventilator cowls along it, turned to the wind. None of them within reach
  // of a torpedo bank: the one that stood at frame -4 was inside the arc the
  // forward tubes train through, and a cowl two metres tall is not something
  // fifteen tons of tubes swings over.
  for (const [vz, sgn] of [[12, -1], [12, 1], [3, -1], [3, 1], [-9, -1], [-13, 1]]) {
    const v = new THREE.Group();
    v.position.set(sgn * (halfDeck(vz) - 1.9), deckAt(vz) + 0.1, vz);
    g.add(v);
    cyl(v, M.steel, 0.34, 0.4, 2.2, 0, 1.1, 0, 10);
    const bell = cyl(v, M.steel, 0.62, 0.36, 0.8, 0, 2.4, 0.25, 12);
    bell.rotation.x = -1.1;
    cyl(v, M.cave, 0.5, 0.5, 0.1, 0, 2.62, 0.62, 12).rotation.x = -1.1;
  }
}

/** The depth charge gear aft: two stern racks and the K-guns amidships of them. */
function depthCharges(g) {
  // The racks: rails running to the transom with the charges nose to tail on
  // them. This is what a destroyer is actually for.
  for (const sgn of [-1, 1]) {
    const x = sgn * 2.45;
    for (const rail of [-0.35, 0.35]) {
      box(g, M.steelDark, 0.1, 0.34, 13, x + rail, deckAt(-48) + 0.3, -48);
    }
    for (let i = 0; i < 7; i++) {
      const z = -43 - i * 1.75;
      const c = cyl(g, M.gunDark, 0.34, 0.34, 0.86, x, deckAt(z) + 0.62, z, 12);
      c.rotation.x = Math.PI / 2;
      cyl(g, M.steelDark, 0.36, 0.36, 0.08, x, deckAt(z) + 0.62, z + 0.45, 12)
        .rotation.x = Math.PI / 2;
    }
    // The release gear at the after end of each rail.
    box(g, M.steelDark, 0.9, 0.5, 0.6, x, deckAt(-54) + 0.5, -54.2);
  }
  // K-guns: the throwers that put a pattern out on either beam, with their
  // charges stowed in cradles alongside.
  for (const sgn of [-1, 1]) {
    for (const z of [-30, -34.5, -39]) {
      const k = new THREE.Group();
      k.position.set(sgn * (halfDeck(z) - 0.9), deckAt(z), z);
      k.rotation.z = sgn * 0.62;
      g.add(k);
      cyl(k, M.gunDark, 0.3, 0.42, 1.7, 0, 0.85, 0, 12);
      cyl(k, M.gunDark, 0.36, 0.36, 0.8, 0, 1.9, 0, 12);
      box(k, M.steelDark, 0.8, 0.16, 0.8, 0, 0.08, 0);
      // The charge in its cradle beside the thrower.
      const c = cyl(g, M.gunDark, 0.33, 0.33, 0.84,
        sgn * (halfDeck(z) - 2.2), deckAt(z) + 0.5, z, 12);
      c.rotation.x = Math.PI / 2;
      box(g, M.steelDark, 0.7, 0.2, 0.7, sgn * (halfDeck(z) - 2.2), deckAt(z) + 0.12, z);
    }
  }
  // The smoke generators right aft, which is the other half of a screen.
  for (const sgn of [-1, 1]) {
    const t = cyl(g, M.gunDark, 0.42, 0.42, 1.5, sgn * 3.1, deckAt(-51) + 0.7, -51, 12);
    t.rotation.x = Math.PI / 2;
  }
}

// ------------------------------------------------------- deck furnishings --

/** The motor whaleboat on her davits, and the rafts along the deckhouse. */
function boatsAndRafts(g) {
  // One 26-foot motor whaleboat, starboard side amidships, swung inboard.
  const x = S * (halfDeck(-14) - 1.3);
  const z = -14;
  const y = deckAt(z) + 2.4;
  const hull = new THREE.Group();
  hull.position.set(x, y, z);
  hull.rotation.z = S * 0.05;
  g.add(hull);
  // A boat is a boat, not a box: pointed at both ends, with a sheer of her own.
  const N = 9;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const u = (i / N) * 2 - 1;
    const w = 1.0 * Math.pow(Math.max(0, 1 - u * u), 0.42);
    const zz = u * 4.0;
    const sh = 0.5 + 0.22 * u * u;
    pos.push(-w, -0.45, zz, w, -0.45, zz, -w * 1.05, sh, zz, w * 1.05, sh, zz);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    idx.push(a, b, a + 2, a + 2, b, b + 2);
    idx.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  hull.add(new THREE.Mesh(geo, M.steel));
  // The cover, narrower than her gunwales so the sheer of her still shows.
  box(hull, M.steelDark, 1.25, 0.12, 4.0, 0, 0.42, -0.2);
  box(hull, M.steelDark, 0.8, 0.44, 1.4, 0, 0.32, -1.6);
  // Davits, and the falls hanging down from them.
  //
  // Outboard of the boat, which is the only place a davit can be if it is to
  // swing her over the side -- and, just as much to the point, the only place
  // it is not standing in the way of the after bank of tubes. The after davit
  // used to be inboard of her and two feet inside the arc the tubes swing
  // through: train the bank to port and five twenty-one inch tubes went
  // straight through it.
  for (const dz of [z - 2.9, z + 2.9]) {
    const dav = cyl(g, M.steel, 0.13, 0.17, 4.6, x + S * 0.55, deckAt(dz) + 2.3, dz, 8);
    dav.rotation.z = S * 0.3;
    box(g, M.wire, 0.05, 2.2, 0.05, x, deckAt(dz) + 3.6, dz);
  }
  // Carley floats: the oval rafts stacked against the deckhouse and the funnels.
  const racks = [
    [16.0, 4.85, deckAt(15) + 1.4],       // against the bridge deckhouse
    [8.0, 4.85, deckAt(15) + 1.4],
    [FUNNEL_A - 2.6, 3.25, deckAt(FUNNEL_A) + 1.3],   // the after fire room
    [-28.0, 3.75, deckAt(-28) + 1.3],     // and the after deckhouse
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
  // Bitts and fairleads down both sides, which is what a deck is covered in.
  for (const bz of [40, 26, 10, -8, -24, -40, -50]) {
    for (const sgn of [-1, 1]) {
      const t = bz / (LOA / 2);
      const w = shellAt(t, sheer(t)) - 0.55;
      for (const off of [-0.35, 0.35]) {
        cyl(g, M.steelDark, 0.14, 0.16, 0.6, sgn * (w + off * 0), deckAt(bz) + 0.3, bz + off, 8);
      }
      box(g, M.steelDark, 0.5, 0.16, 1.0, sgn * w, deckAt(bz) + 0.08, bz);
    }
  }
  // The jackstaff forward and the ensign staff right aft.
  cyl(g, M.bright, 0.05, 0.07, 3.2, 0, deckAt(52) + 1.6, 52, 8);
  cyl(g, M.bright, 0.05, 0.07, 3.6, 0, deckAt(-55) + 1.8, -55, 8);
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
  put(-54, 25, (z) => (z > 20 && z < 40) || (z > -44 && z < -30));
}

/** The odds and ends: lockers, searchlight, life buoys, the binnacle. */
function fittings(g) {
  // Twenty-four inch searchlight on its platform abaft the funnel.
  const sl = new THREE.Group();
  sl.position.set(0, deckAt(-8.2) + 2.95, -8.2);
  g.add(sl);
  cyl(sl, M.steelDark, 0.9, 0.9, 0.12, 0, -0.5, 0, 14);
  cyl(sl, M.gunDark, 0.22, 0.26, 0.7, 0, -0.15, 0, 10);
  const drum = cyl(sl, M.bright, 0.62, 0.62, 0.7, 0, 0.4, 0, 16);
  drum.rotation.x = Math.PI / 2;
  cyl(sl, M.glass, 0.56, 0.56, 0.08, 0, 0.4, 0.38, 16).rotation.x = Math.PI / 2;
  // Ready-service lockers along the deckhouse sides.
  for (const [lz, sgn] of [[20, -1], [20, 1], [-22, -1], [-22, 1], [-31, -1], [-31, 1]]) {
    box(g, M.steel, 0.7, 0.9, 1.4, sgn * (halfDeck(lz) - 1.1), deckAt(lz) + 0.45, lz);
  }
  // Life buoys on the bridge wings and the after deckhouse.
  for (const [bx, bz] of [[S * 5.55, 16], [-S * 5.55, 16], [0, -46]]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 6, 12), M.mark);
    t.position.set(bx, bz > 0 ? bridgeDeck(3) + 0.6 : deckAt(bz) + 1.4, bz);
    t.rotation.y = Math.PI / 2;
    g.add(t);
  }
  // Depth charge davit and the boat boom stowed against the side.
  box(g, M.steelDark, 0.16, 0.16, 5.0, -S * (halfDeck(-10) - 0.7), deckAt(-10) + 1.1, -10);
}

// ------------------------------------------------------------------ build --

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

/** The after deckhouse: mounts 53 and 54 stand on it, and the depth charge
 * gear is worked from it. */
function afterHouse(g) {
  for (const [[z0, z1], wide, h] of [[HOUSE_A, 7.2, 2.5], [HOUSE_B, 6.2, 3.4]]) {
    const cz = (z0 + z1) / 2;
    const d = Math.abs(z1 - z0);
    box(g, M.steel, wide, h, d, 0, deckAt(cz) + h / 2, cz);
    box(g, M.deckDark, wide + 0.2, 0.14, d, 0, deckAt(cz) + h, cz);
  }
}

/**
 * Her light anti-aircraft battery: five twin Bofors and seven Oerlikons, which
 * is the 1943 refit and the reason a Fletcher could keep her feet in the
 * Solomons. Two Bofors in tubs abreast the after funnel, one on the after
 * deckhouse, two on the fantail bandstands.
 */
function lightAA(g) {
  const mounts = [];
  const keep = (m) => { mounts.push(m); return m; };
  g.userData.aaMounts = mounts;
  // Five twin Bofors: two in tubs abreast the after funnel, two abreast on the
  // after deckhouse, and one right aft on the fantail between the depth charge
  // racks.
  //
  // Where they are is decided by where the 5-inch barrels lie. The after mounts
  // stow trained aft, and a barrel is nearly seven metres of gun on the
  // centreline: anything standing on the centreline between mount 53 and the
  // transom is inside one. A pair on the fantail is the arrangement that looks
  // right in a photograph and cannot be built -- twenty-four feet of deck will
  // not take two tubs and a five-inch barrel between them -- so the pair goes
  // on the deckhouse, where there is beam for it, and the odd one goes abaft
  // everything.
  for (const sgn of [-1, 1]) {
    keep(bofors(g, sgn * 3.9, deckAt(FUNNEL_A) + 0.1, FUNNEL_A, sgn * 0.45));
  }
  for (const sgn of [-1, 1]) {
    keep(bofors(g, sgn * 2.5, deckAt(-32.2) + 2.5, -32.2, sgn * 0.5));
  }
  keep(bofors(g, 0, deckAt(-54.8) + 0.1, -54.8, 0));
  // Seven Oerlikons: four on the 01 level round the bridge, two in the waist,
  // one on the forecastle.
  const roof01 = deckAt(15) + 3.0;
  for (const [oz, oy, ox] of [
    [19.0, roof01, 3.5], [7.0, roof01, 3.5],
    [-24.0, deckAt(-24) + 0.05, halfDeck(-24) - 1.75],
  ]) {
    for (const sgn of [-1, 1]) keep(oerlikon(g, sgn * ox, oy, oz, sgn * 1.1));
  }
  keep(oerlikon(g, 0, deckAt(28) + 0.05, 28, 0));
}

/** The five 5"/38 mounts, at the stations her datasheet gives: two forward
 * superfiring, one on the after deckhouse, two aft superfiring. */
function mainBattery(g) {
  const spots = [
    [32, deckAt(32), false],
    [24, deckAt(24) + 2.6, false],
    [-28, deckAt(-28) + 2.5, true],       // 53, on the after deckhouse
    [-37, deckAt(-37) + 3.4, true],       // 54, superfiring over 55
    [-45, deckAt(-45), true],             // 55, on the fantail
  ];
  return spots.map(([z, y, aft]) => {
    // The superfiring forward mount stands on its own barbette ring.
    if (z === 24) cyl(g, M.steel, 2.3, 2.5, 2.6, 0, deckAt(24) + 1.3, 24, 16);
    return fiveInch(g, 0, y, z, aft);
  });
}

export function buildFletcher() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  // Everything static welded into one mesh per material. Done before the guns
  // go on, because the guns have to keep moving.
  mergeStatic(g);
  const turrets = mainBattery(g);

  g.userData.classId = 'fletcher';
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

export { LOA as FLETCHER_LOA, BEAM as FLETCHER_BEAM, DRAFT as FLETCHER_DRAFT, deckAt };
