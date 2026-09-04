// Admiral Hipper, built out of her own lines.
//
// Six hundred and sixty-five feet of German heavy cruiser: eight twenty-point-
// three centimetre guns in four twin turrets, twelve ten-point-five in six
// stabilised twins, six torpedo tubes a side, and a tower bridge with the
// biggest rangefinder anybody put on a cruiser sitting on top of it.
//
// She is flush-decked, which is the first thing to get right -- no forecastle
// break, no step down to a quarterdeck, one weather deck from the stem to the
// transom with a knuckle running most of her length. The second is the bow.
// She was completed with a straight stem, took green water over Anton in any
// sort of sea, and came out of the yard in 1940 with the raked, flared
// Atlantic bow she is remembered by. The third is the funnel cap: a flat
// mushroom on a raked oval funnel, fitted at the same refit to keep her own
// smoke out of the foretop, and the one silhouette detail that says Hipper and
// not Prinz Eugen at a distance.
//
// Local frame, as everywhere else in the renderer: +Z is the bow, +Y is up, and
// therefore starboard is -X. y = 0 is the waterline.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic } from './merge.js';
import { buildInterior, bySection } from './interior.js';
import { AERO, catapultProfile } from './aero.js';
import { DECK_RUN } from '../../../shared/sim.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import {
  box, cyl, tubeZ, tubeX, sphere, smooth, lerpTable, loftRings, loftShape,
  planHouse, ladder,
} from './shipkit.js';

const CLS = SHIP_CLASSES.hipper;
export const LOA = CLS.hull.length;      // 203 m
export const BEAM = CLS.hull.beam;       // 21.5 m
export const DRAFT = CLS.hull.draft;     // 7.7 m
/** Starboard, in this frame. */
const S = -1;

// Kriegsmarine grey, which is a colder and lighter grey than measure 21: hellgrau
// 50 on the topsides, dunkelgrau 51 on the hull, and the decks in a brown-grey
// deck paint over the wood.
const P = {
  hull: 0x6d7681,
  hullDark: 0x5c646e,
  boot: 0x1d2126,
  antifoul: 0x71352c,
  deck: 0x655f52,          // planked weather deck
  deckSteel: 0x5a6069,     // and the steel decks round the mountings
  deckDark: 0x4a505a,
  steel: 0x7b838d,
  steelDark: 0x616973,
  bright: 0x99a1aa,
  gun: 0x6e767f,
  gunDark: 0x3b4149,
  glass: 0x1f252b,
  canvas: 0x6e7166,
  wire: 0x2a3038,
  brass: 0x9a8250,
  cave: 0x14171b,
  raft: 0x3a3f46,
  mark: 0xd0ccc0,
  planeTop: 0x5c6a58,      // her Arados: splinter green over pale blue
  planeLow: 0x9fb0bd,
  swast: 0xb4372f,
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
// `t` runs -1 at the transom to +1 at the stem. A German heavy cruiser's body
// plan: a very fine entrance under a flared bow, maximum beam a little abaft
// amidships, a long parallel middle body, and a broad flat run aft to a
// transom -- she is a three-shaft ship and the water has to get to the wing
// screws.

// Half-breadths at the waterline. Extreme beam is 21.5 m at the deck edge,
// where the flare has had its say, so the moulded figure here is a little over
// ten.
const HALF_BEAM = [
  [-1.00, 4.35], [-0.94, 5.42], [-0.86, 6.62], [-0.74, 7.98], [-0.60, 9.05],
  [-0.44, 9.80], [-0.26, 10.24], [-0.08, 10.42], [0.10, 10.36], [0.26, 10.06],
  [0.42, 9.44], [0.56, 8.50], [0.68, 7.26], [0.79, 5.72], [0.88, 3.94],
  [0.95, 2.02], [1.00, 0.26],
];

const KEEL = [
  [-1.00, -2.30], [-0.92, -5.30], [-0.84, -6.85], [-0.70, -7.55], [-0.20, -7.74],
  [0.20, -7.72], [0.52, -7.55], [0.70, -6.90], [0.84, -5.10], [0.93, -2.20],
  [1.00, 2.40],
];

// One deck, flush, from stem to transom. Her sheer rises hard forward -- the
// Atlantic bow is a metre and a half of extra freeboard at the stem over what
// she had when she was built -- and falls a little aft.
const SHEER = [
  [-1.00, 5.40], [-0.82, 5.56], [-0.62, 5.76], [-0.40, 6.00], [-0.18, 6.26],
  [0.04, 6.54], [0.26, 6.94], [0.46, 7.58], [0.64, 8.52], [0.80, 9.72],
  [0.92, 10.85], [1.00, 11.70],
];

const halfBeam = (t) => lerpTable(HALF_BEAM, t);
const keelY = (t) => lerpTable(KEEL, t);
const sheer = (t) => lerpTable(SHEER, t);

/**
 * How much her topsides flare out above the waterline.
 *
 * Very little amidships -- she has a knuckle and slab sides above it -- and a
 * great deal in the last fifth, which is the Atlantic bow.
 */
function flare(t) {
  return 0.06 + smooth((t - 0.42) / 0.58) * 0.86;
}

/** Her half-breadth at this station and this height. */
function shellAt(t, y) {
  const w = halfBeam(t);
  const k = keelY(t);
  const sh = sheer(t);
  if (y <= k) return 0;
  const up = Math.min(1, Math.max(0, (y - k) / Math.max(0.6, -k + 0.5)));
  const belly = Math.pow(up, 0.34);
  let half = w * belly;
  if (y > 0) half += w * flare(t) * Math.min(1, y / Math.max(1, sh)) * 0.30;
  return Math.max(0.03, Math.min(half, w * 1.62));
}

// The stem is raked hard and the counter overhangs, so where the shell is fore
// and aft depends on how high up you look. The Atlantic bow throws the stem
// eight metres forward between the waterline and the deck edge.
const STEM = 8.6;
const COUNTER = 2.6;
function stemAt(y) { return STEM * Math.pow(Math.max(0, y + 2.6) / 15.7, 1.25); }
function counterAt(y) { return COUNTER * Math.pow(Math.max(0, y + 2.6) / 9.2, 1.1); }

function zAt(t, y) {
  let z = (t * LOA) / 2;
  if (t > 0.46) z += smooth((t - 0.46) / 0.54) * (stemAt(y) - STEM);
  else if (t < -0.80) z -= smooth((-t - 0.80) / 0.20) * (counterAt(y) - COUNTER);
  return z;
}

/** Her deck edge at a station, in metres from amidships. */
export function deckAt(z) {
  const t = Math.max(-1, Math.min(1, z / (LOA / 2)));
  return sheer(t) + 0.30;
}

/** And how far outboard the deck edge is there. */
export function halfDeck(z) {
  const t = Math.max(-1, Math.min(1, z / (LOA / 2)));
  return shellAt(t, sheer(t));
}

// ------------------------------------------------------------------ hull --

const BOOT_LO = -2.3;
const BOOT_HI = 0.6;
const STATIONS = 116;

/**
 * The three strakes, as functions of the station: red lead below the boot top,
 * the black boot topping through the waterline, and grey from there up to the
 * deck edge.
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

/**
 * One band of shell plating, lofted between two heights the whole way round.
 *
 * Either height may be a number or a function of the station. Every band runs
 * the full length and shares its edges with its neighbours, which is what
 * keeps her watertight: a hull built as separate pieces has a seam you can see
 * daylight through wherever two of them disagree by a millimetre.
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
  for (let i = 0; i < STATIONS; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    idx.push(a, b, a + 2, a + 2, b, b + 2);
    idx.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, m));
}

/** Close an end of the shell, painted in the same three strakes. */
function capEnd(g, t, out) {
  for (const [lo, hi, m] of strakes(t)) {
    if (hi - lo < 0.02) continue;
    const N = 14;
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

/** Her weather deck: one sheet from the stem to the transom, cambered. */
function weatherDeck(g) {
  const pos = [];
  const idx = [];
  const CAM = 5;
  const across = CAM * 2 + 1;
  for (let i = 0; i <= STATIONS; i++) {
    const t = -1 + (2 * i) / STATIONS;
    const sh = sheer(t);
    const w = shellAt(t, sh);
    const z = zAt(t, sh);
    for (let j = 0; j < across; j++) {
      const u = (j - CAM) / CAM;
      const crown = (1 - u * u) * 0.30;
      pos.push(u * w, sh + crown, z);
    }
  }
  for (let i = 0; i < STATIONS; i++) {
    for (let j = 0; j < across - 1; j++) {
      const a = i * across + j;
      const b = (i + 1) * across + j;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.deck));
}

/**
 * The knuckle, and the bulwark forward of it.
 *
 * A German cruiser has a hard chine in her topsides running most of her
 * length -- the plating turns out at it -- and forward of Anton the deck edge
 * carries a solid bulwark instead of rails, because the Atlantic bow was
 * fitted to keep the sea out of the forecastle and rails do not.
 */
function knuckleAndBulwark(g) {
  // The knuckle: a narrow strake of plating standing proud, from the transom
  // to where the flare takes over forward.
  const pos = [];
  const idx = [];
  const N = 90;
  for (let i = 0; i <= N; i++) {
    const t = -1 + (2 * i * 0.86) / N;
    const y = sheer(t) - 1.55;
    const w = shellAt(t, y);
    const z = zAt(t, y);
    for (const [yy, ww] of [[y - 0.16, w], [y + 0.16, w + 0.10]]) {
      pos.push(-ww, yy, z, ww, yy, z);
    }
  }
  for (let i = 0; i < N; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    idx.push(a, b, a + 2, a + 2, b, b + 2);
    idx.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.hullDark));

  // The bulwark: from the stem back to abreast Anton, both sides, with a
  // capping rail along the top of it.
  for (const sgn of [-1, 1]) {
    const bp = [];
    const bi = [];
    const Z0 = 58;
    const Z1 = LOA / 2;
    const K = 26;
    for (let i = 0; i <= K; i++) {
      const z = Z0 + ((Z1 - Z0) * i) / K;
      const t = Math.min(1, z / (LOA / 2));
      const sh = sheer(t);
      const w = shellAt(t, sh);
      const zz = zAt(t, sh);
      const h = 0.55 + smooth((z - Z0) / (Z1 - Z0)) * 0.75;
      bp.push(sgn * w, sh, zz, sgn * w, sh + h, zz);
      bp.push(sgn * (w - 0.16), sh, zz, sgn * (w - 0.16), sh + h, zz);
    }
    for (let i = 0; i < K; i++) {
      const a = i * 4;
      const b = (i + 1) * 4;
      // Outboard face, inboard face, and the cap between them.
      if (sgn > 0) {
        bi.push(a, a + 1, b, a + 1, b + 1, b);
        bi.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
        bi.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
      } else {
        bi.push(a, b, a + 1, a + 1, b, b + 1);
        bi.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
        bi.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
      }
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    bg.setIndex(bi);
    bg.computeVertexNormals();
    g.add(new THREE.Mesh(bg, M.hull));
  }
}

/** Three shafts, their brackets, three screws and twin rudders. */
function sternGear(g) {
  // She is a three-shaft ship: one on the centreline and one on each wing.
  for (const [sx, sz, len] of [[0, -78, 16], [S * 5.2, -72, 21], [-S * 5.2, -72, 21]]) {
    const y = keelY(sz / (LOA / 2)) + 1.5;
    tubeZ(g, M.steelDark, 0.42, len, sx, y, sz, 10);
    // The A-bracket carrying the wing shafts, and the boss on the centreline.
    if (sx !== 0) {
      for (const lean of [-0.7, 0.7]) {
        const arm = cyl(g, M.steelDark, 0.28, 0.28, 3.4, sx, y + 1.5, sz - len / 2 + 2.2, 8);
        arm.rotation.z = lean;
      }
    }
    // The screw itself: a boss and three broad blades.
    const hub = new THREE.Group();
    hub.position.set(sx, y, sz - len / 2 - 0.4);
    g.add(hub);
    cyl(hub, M.brass, 0.5, 0.66, 1.1, 0, 0, 0, 12).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const bl = new THREE.Group();
      bl.rotation.z = (i / 3) * Math.PI * 2;
      hub.add(bl);
      const blade = box(bl, M.brass, 1.15, 2.5, 0.20, 0, 1.6, 0);
      blade.rotation.y = 0.42;
    }
  }
  // Twin rudders, abaft the wing shafts, hung on their stocks.
  for (const sgn of [-1, 1]) {
    const rz = -88;
    const y = keelY(rz / (LOA / 2)) + 2.6;
    const r = box(g, M.steelDark, 0.34, 5.0, 3.6, sgn * 3.4, y, rz);
    r.rotation.y = sgn * 0.02;
    cyl(g, M.steelDark, 0.30, 0.30, 2.0, sgn * 3.4, y + 3.2, rz + 0.7, 8);
  }
}

/** The whole shell: three strakes, both ends capped, the deck over the top. */
function hull(g) {
  for (const [lo, hi, m] of strakeBands()) loftBand(g, m, lo, hi);
  capEnd(g, 1, 1);
  capEnd(g, -1, -1);
  weatherDeck(g);
  knuckleAndBulwark(g);
  sternGear(g);
  // The transom itself: a flat plate, which is what a transom is, rather than
  // the pinched point the cap alone would leave.
  const t = -1;
  const sh = sheer(t);
  const w = shellAt(t, sh);
  box(g, M.hull, w * 2, 0.5, 0.4, 0, sh - 0.25, zAt(t, sh) - 0.1);
  // Anchors, hawse pipes and the cable running to the capstans.
  for (const sgn of [-1, 1]) {
    const az = 88;
    const t2 = az / (LOA / 2);
    const y = sheer(t2) - 2.4;
    const wx = shellAt(t2, y);
    const hp = cyl(g, M.cave, 0.5, 0.5, 0.5, sgn * (wx - 0.1), y, zAt(t2, y), 10);
    hp.rotation.z = Math.PI / 2;
    // The stocked anchor sitting in its own recess in the plating.
    box(g, M.gunDark, 0.28, 1.9, 1.15, sgn * (wx - 0.22), y - 0.2, zAt(t2, y) - 0.5);
    box(g, M.gunDark, 0.30, 0.34, 2.0, sgn * (wx - 0.22), y - 1.0, zAt(t2, y) - 0.5);
  }
}

// ------------------------------------------------------------ the battery --

/**
 * A twin 20.3 cm in its Drh LC/34 mounting.
 *
 * The German heavy turret is not the rounded American gunhouse: it is a slab-
 * sided box with a steeply sloped face, a flat roof, and a distinct step where
 * the roof plate overhangs the sides. The two guns are close together in one
 * shield, which is why a Hipper's salvoes went out in pairs.
 *
 * `range` gives Cäsar the big stereoscopic rangefinder that sticks out either
 * side of her -- the one turret aboard that carried one.
 */
function eightInch(g, x, y, z, aft, range = false) {
  const mount = new THREE.Group();
  mount.position.set(x, y, z);
  mount.rotation.y = aft ? Math.PI : 0;
  mount.userData.dynamic = true;
  g.add(mount);

  // The barbette she trains on, and the ring of it standing above the deck.
  cyl(mount, M.steelDark, 3.9, 4.0, 1.5, 0, -0.55, 0, 20);
  cyl(mount, M.gunDark, 3.55, 3.55, 0.3, 0, 0.22, 0, 20);

  // The gunhouse. Ten metres long, seven across, a sloped face and a roof that
  // overhangs at the back.
  const house = [
    [3.50, 4.55, 0.0, 0.30],
    [3.55, 4.75, 0.1, 1.10],
    [3.50, 4.80, 0.2, 2.85],
    [3.30, 4.65, 0.2, 3.55],
  ];
  loftRings(mount, M.gun, house, { n: 22, px: 0.72, pz: 0.60 });
  // The face, which on a German turret is a separate steeply raked plate.
  const face = box(mount, M.gun, 6.4, 2.9, 0.55, 0, 1.85, 4.35);
  face.rotation.x = -0.36;
  // The roof, with its overhang aft and the two sighting hoods on it.
  box(mount, M.gun, 7.15, 0.22, 9.6, 0, 3.62, -0.35);
  box(mount, M.gunDark, 7.3, 0.09, 9.75, 0, 3.5, -0.35);
  for (const sgn of [-1, 1]) {
    cyl(mount, M.gun, 0.44, 0.5, 0.5, sgn * 2.15, 3.85, 2.05, 12);
    box(mount, M.glass, 0.5, 0.22, 0.12, sgn * 2.15, 3.92, 2.5);
  }
  // The rangefinder, on the one turret that has one: a long tube through her
  // with a hood standing out either side.
  if (range) {
    tubeX(mount, M.gun, 0.42, 7.6, 0, 3.35, -1.9, 12);
    for (const sgn of [-1, 1]) {
      box(mount, M.gun, 0.6, 0.7, 0.9, sgn * 3.65, 3.35, -1.9);
      box(mount, M.glass, 0.12, 0.32, 0.5, sgn * 3.95, 3.38, -1.9);
    }
  }
  // Ventilator mushrooms and the ladder up the back of her.
  for (const sgn of [-1, 1]) cyl(mount, M.gun, 0.24, 0.24, 0.4, sgn * 1.1, 3.9, -3.2, 8);
  ladder(mount, M.steelDark, 0, 0.3, 3.5, -4.4, -4.0);

  // The guns. Close together in one shield, with the blast bags round them
  // where they come through the face.
  const guns = new THREE.Group();
  guns.position.set(0, 1.95, 4.05);
  mount.add(guns);
  mount.userData.guns = guns;
  for (const sgn of [-1, 1]) {
    const bx = sgn * 1.28;
    // The bag: a truncated cone of canvas laced round the trunnion.
    const bag = cyl(guns, M.canvas, 0.62, 0.86, 1.15, bx, 0.16, 0.35, 12);
    bag.rotation.x = Math.PI / 2;
    // The barrel: a jacket, a chase and a muzzle swell.
    tubeZ(guns, M.gunDark, 0.40, 2.4, bx, 0.16, 1.6, 12);
    tubeZ(guns, M.gunDark, 0.29, 6.4, bx, 0.16, 5.6, 12);
    tubeZ(guns, M.gunDark, 0.33, 0.5, bx, 0.16, 8.6, 12);
    cyl(guns, M.cave, 0.19, 0.19, 0.3, bx, 0.16, 8.8, 10).rotation.x = Math.PI / 2;
  }
  return mount;
}

/**
 * A twin 10.5 cm SK C/33 in its Dopp. L. C/31 mounting.
 *
 * The German heavy anti-aircraft gun and the mounting that made it worth
 * having: triaxially stabilised, so the guns stay laid while the ship rolls,
 * which is why the whole thing sits on a tall pedestal with the shield well
 * clear of the deck.
 */
function tenFive(g, x, y, z, ry) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.dynamic = true;
  g.add(m);
  // The stabilised pedestal: a drum with the roller path on top of it.
  cyl(m, M.steelDark, 1.05, 1.25, 1.5, 0, 0.75, 0, 16);
  cyl(m, M.gunDark, 1.15, 1.15, 0.22, 0, 1.6, 0, 16);
  // The shield: open at the back, sloped at the front, which is what a C/31
  // looks like from any angle you would see one.
  const sh = new THREE.Group();
  sh.position.set(0, 1.72, 0);
  m.add(sh);
  loftShape(sh, M.gun, [
    { pts: shieldPlan(1.55, 1.35, 1.05), y: 0 },
    { pts: shieldPlan(1.52, 1.30, 1.00), y: 1.35 },
    { pts: shieldPlan(1.30, 1.05, 0.80), y: 1.72 },
  ], { cap: true });
  // The two guns, side by side and elevated a little.
  const guns = new THREE.Group();
  guns.position.set(0, 1.05, 0.9);
  guns.rotation.x = -0.20;
  sh.add(guns);
  for (const sgn of [-1, 1]) {
    const bx = sgn * 0.52;
    const bag = cyl(guns, M.canvas, 0.24, 0.34, 0.5, bx, 0, 0.1, 10);
    bag.rotation.x = Math.PI / 2;
    tubeZ(guns, M.gunDark, 0.115, 4.4, bx, 0, 2.3, 10);
    cyl(guns, M.cave, 0.07, 0.07, 0.2, bx, 0, 4.45, 8).rotation.x = Math.PI / 2;
  }
  // The layers' seats and the fuse-setting gear hanging off the back.
  box(m, M.steelDark, 2.0, 0.16, 0.7, 0, 1.9, -1.35);
  for (const sgn of [-1, 1]) box(m, M.gunDark, 0.34, 0.5, 0.34, sgn * 0.75, 2.2, -1.2);
  return m;
}

/** The plan of a 10.5 cm shield: a rounded front carried back to an open box. */
function shieldPlan(hw, front, back) {
  const pts = [];
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI;
    pts.push([Math.sin(a) * hw, front * Math.cos(a) * 0.55 + front * 0.45]);
  }
  pts.push([hw * 0.86, -back], [-hw * 0.86, -back]);
  return pts;
}

/** A twin 3.7 cm SK C/30 on its stabilised pedestal. */
function threeSeven(g, x, y, z, ry) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.dynamic = true;
  g.add(m);
  cyl(m, M.steelDark, 0.62, 0.78, 1.0, 0, 0.5, 0, 14);
  cyl(m, M.gunDark, 0.7, 0.7, 0.18, 0, 1.05, 0, 14);
  const cradle = new THREE.Group();
  cradle.position.set(0, 1.35, 0);
  m.add(cradle);
  // The trunnion frame, the two guns, and the pair of ready-use racks.
  box(cradle, M.gunDark, 1.35, 0.5, 0.7, 0, 0.1, -0.2);
  const guns = new THREE.Group();
  guns.rotation.x = -0.30;
  cradle.add(guns);
  for (const sgn of [-1, 1]) {
    tubeZ(guns, M.gunDark, 0.075, 2.6, sgn * 0.32, 0.22, 1.35, 8);
    box(guns, M.gunDark, 0.2, 0.24, 0.7, sgn * 0.32, 0.22, 0.1);
  }
  for (const sgn of [-1, 1]) box(m, M.steelDark, 0.3, 0.5, 0.5, sgn * 0.85, 1.3, -0.6);
  return m;
}

/** A 2 cm Flakvierling: four barrels on one carriage behind a light shield. */
function twoCm(g, x, y, z, ry, quad = true) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.dynamic = true;
  g.add(m);
  cyl(m, M.steelDark, 0.42, 0.56, 0.7, 0, 0.35, 0, 12);
  const cradle = new THREE.Group();
  cradle.position.set(0, 0.85, 0);
  m.add(cradle);
  box(cradle, M.gunDark, 0.75, 0.4, 0.5, 0, 0.05, -0.1);
  // The shield: a low plate with the notches the barrels come through.
  const shield = box(cradle, M.gun, 1.15, 0.62, 0.1, 0, 0.28, 0.42);
  shield.rotation.x = -0.14;
  const guns = new THREE.Group();
  guns.rotation.x = -0.42;
  cradle.add(guns);
  const spots = quad ? [[-0.22, 0.1], [0.22, 0.1], [-0.22, 0.42], [0.22, 0.42]] : [[0, 0.2]];
  for (const [bx, by] of spots) {
    tubeZ(guns, M.gunDark, 0.045, 1.5, bx, by, 0.85, 6);
    // The drum magazine standing up beside each barrel.
    cyl(guns, M.gunDark, 0.13, 0.13, 0.12, bx, by + 0.2, 0.2, 8);
  }
  return m;
}

/** A triple bank of 53.3 cm tubes on its training ring. */
function torpedoBank(g, x, y, z, ry) {
  const bank = new THREE.Group();
  bank.position.set(x, y, z);
  bank.rotation.y = ry;
  bank.userData.dynamic = true;
  g.add(bank);
  cyl(bank, M.steelDark, 0.95, 1.15, 0.55, 0, 0.28, 0, 16);
  // The three tubes side by side in one cradle, and the layer's shield.
  const cradle = new THREE.Group();
  cradle.position.set(0, 1.05, 0);
  bank.add(cradle);
  box(cradle, M.steelDark, 2.7, 0.5, 1.1, 0, -0.35, 0);
  for (let i = -1; i <= 1; i++) {
    const tx = i * 0.82;
    tubeZ(cradle, M.gun, 0.36, 8.6, tx, 0, 0, 14);
    cyl(cradle, M.gunDark, 0.38, 0.38, 0.25, tx, 0, 4.3, 14).rotation.x = Math.PI / 2;
    cyl(cradle, M.cave, 0.3, 0.3, 0.1, tx, 0, 4.46, 12).rotation.x = Math.PI / 2;
    // The rails and the after door.
    box(cradle, M.steelDark, 0.16, 0.4, 1.0, tx, -0.42, -3.9);
  }
  box(cradle, M.gun, 1.5, 1.15, 0.14, 0, 0.35, -4.5);
  return bank;
}

// ------------------------------------------------- deckhouses and the tower --

// Where everything lives along her. Read once, here, rather than typed into
// half a dozen builders that then drift apart.
const A_Z = 66;                 // Anton
const B_Z = 52;                 // Bruno, superfiring over her
const BRIDGE = [22, 47];        // the tower, foot to fore end
const FUNNEL_Z = 6;
const CAT_Z = -12;              // the catapult, athwartships
// Her catapult's stroke. The trolley sits inboard of the ring and is thrown
// out along the girder; she is off the end of it in about seventy feet.
const CAT_A = -8.0;             // the trolley at rest, inboard end of the track
const CAT_STROKE = 20.0;        // and how much track she has to be thrown down
const CAT_TRAIN = 0.30;         // how far the ring swings round to shoot
const HANGAR = [-32, -18];      // the aircraft house
const AFT_TOWER = [-46, -34];   // the after control position

/**
 * Her superstructure deck, station by station: how far out its edge is.
 *
 * Narrower than her hull the whole way, because a cruiser has a waist -- a
 * walkway outboard of the superstructure that the boats, the tubes and the
 * secondary mountings stand on sponsons off. Built out to the deck edge she
 * has no deck left at all: planking at the bow, planking at the stern, and
 * superstructure everywhere in between.
 */
const SUPER_HALF = [
  [-50, 4.6], [-44, 5.5], [-36, 6.2], [-24, 6.8], [-10, 7.0],
  [4, 7.0], [16, 6.8], [28, 6.4], [40, 5.4], [46, 4.3],
];
const X_Z = -48;                // Cäsar
const Y_Z = -62;                // Dora

/** A deckhouse: a rounded-corner box standing on the deck at this station. */
function house(g, m, hw, z0, z1, y0, h, opts = {}) {
  const zc = (z0 + z1) / 2;
  const hd = Math.abs(z1 - z0) / 2;
  loftRings(g, m, [
    [hw, hd, zc, y0],
    [hw, hd, zc, y0 + h],
  ], { n: opts.n || 22, px: opts.px === undefined ? 0.90 : opts.px, pz: opts.pz === undefined ? 0.90 : opts.pz });
  // The deck on top of it, a little proud all round: that lip is what makes a
  // deckhouse read as a deckhouse and not as a block.
  loftRings(g, M.deckSteel, [
    [hw + 0.12, hd + 0.12, zc, y0 + h],
    [hw + 0.12, hd + 0.12, zc, y0 + h + 0.14],
  ], { n: opts.n || 22, px: opts.px === undefined ? 0.90 : opts.px, pz: opts.pz === undefined ? 0.90 : opts.pz });
}

/** Portholes in a row along a house side, and a door at one end of it. */
function ports(g, x, y, z0, z1, n) {
  for (let i = 0; i < n; i++) {
    const z = z0 + ((z1 - z0) * (i + 0.5)) / n;
    for (const sgn of [-1, 1]) {
      cyl(g, M.cave, 0.17, 0.17, 0.08, sgn * x, y, z, 10).rotation.z = Math.PI / 2;
      cyl(g, M.steel, 0.22, 0.22, 0.05, sgn * x, y, z, 10).rotation.z = Math.PI / 2;
    }
  }
}

/**
 * The superstructure deck: the long, low house that runs from abreast Bruno to
 * abaft the after tower, and which everything else on her stands on.
 *
 * She is flush-decked, so this is the deck the secondary battery, the tubes,
 * the boats and the aircraft all live on, and getting its edge right is most
 * of getting her silhouette right.
 */
function superstructureDeck(g) {
  const Y = deckAt(0);
  // One continuous house, wider amidships than at its ends.
  const rings = [];
  for (const [z, hw] of SUPER_HALF) rings.push([z, hw]);
  const pos = [];
  const idx = [];
  const H = 3.1;
  for (let i = 0; i < rings.length; i++) {
    const [z, hw] = rings[i];
    const y0 = deckAt(z);
    pos.push(-hw, y0, z, hw, y0, z, -hw, y0 + H, z, hw, y0 + H, z);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    // Port side, starboard side.
    idx.push(a, a + 2, b, a + 2, b + 2, b);
    idx.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
  }
  // The two ends.
  const e0 = 0;
  const e1 = (rings.length - 1) * 4;
  idx.push(e0, e0 + 1, e0 + 2, e0 + 1, e0 + 3, e0 + 2);
  idx.push(e1, e1 + 2, e1 + 1, e1 + 1, e1 + 2, e1 + 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.steel));
  // Its deck, which is where everything above stands.
  const dp = [];
  const di = [];
  for (let i = 0; i < rings.length; i++) {
    const [z, hw] = rings[i];
    const y0 = deckAt(z) + H;
    dp.push(-hw - 0.2, y0, z, hw + 0.2, y0, z);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const a = i * 2;
    di.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
  dg.setIndex(di);
  dg.computeVertexNormals();
  g.add(new THREE.Mesh(dg, M.deckSteel));
  ports(g, 6.9, Y + 1.7, -30, 30, 16);
  return Y + H;
}

/** How high the superstructure deck is at a station. */
function sdeck(z) { return deckAt(z) + 3.1; }

/** And how far outboard its edge is there. */
function sHalf(z) { return lerpTable(SUPER_HALF, z); }

/**
 * A sponson: a platform carried out from the superstructure deck to the deck
 * edge, with the brackets under it that hold it up.
 *
 * Every mounting on her beam stands on one. Without them the secondary
 * battery, the light battery and the tubes are all standing a metre or two
 * outboard of the deck they are supposed to be bolted to, in the air.
 */
function sponson(g, x, z, hw, hd) {
  const y = sdeck(z);
  const sgn = Math.sign(x) || 1;
  const inner = sHalf(z) - 0.3;
  const outer = Math.abs(x) + hw;
  if (outer <= inner) return;
  const mid = (inner + outer) / 2;
  const w = outer - inner;
  box(g, M.deckSteel, w, 0.18, hd * 2, sgn * mid, y + 0.08, z);
  // The brackets: a knee at each corner, hung under the platform and running
  // in to the ship's side, which is what carries a sponson. Set so its top
  // edge meets the underside of what it is holding up -- a bracket with a gap
  // over it is holding up nothing at all.
  const LEAN = 0.46;
  const bw = w * 0.95;
  const rise = (bw * Math.sin(LEAN) + 0.14 * Math.cos(LEAN)) / 2;
  for (const dz of [-hd * 0.8, hd * 0.8]) {
    const k = box(g, M.steel, bw, 0.14, 1.4, sgn * mid, y + 0.02 - rise, z + dz);
    k.rotation.z = sgn * LEAN;
  }
  // And a low coaming round the outboard edge of it.
  box(g, M.steel, 0.16, 0.85, hd * 2, sgn * outer, y + 0.5, z);
}

/**
 * The tower bridge, level by level.
 *
 * A German cruiser's bridge is a tower, not a stack of boxes, and the Hipper's
 * is the tallest thing about her. From the superstructure deck up:
 *
 *   0  the bridge block, with the armoured conning tower inside it and the
 *      two 10.5 cm directors on their pedestals either side
 *   1  the admiral's bridge -- a bullnose front with a continuous window band,
 *      open wings each side carrying a pelorus and a signal lamp
 *   2  the navigating bridge, set back, with the chart house behind it
 *   3  the trunk, and the searchlight platform round it
 *   4  the foretop: the fire-control position, and on top of it the seven-metre
 *      stereoscopic rangefinder in a hood that trains, with the radar mattress
 *      on its face
 *
 * With the ladders between them, the voice pipes, the flag lockers and the
 * splinter mattresses that were lashed round every open bridge in the war.
 */
function bridge(g) {
  const foot = sdeck(BRIDGE[0]);
  const zc = (BRIDGE[0] + BRIDGE[1]) / 2;
  const at = (pts) => pts.map(([x, z]) => [x, z + zc]);

  // -- 0. the bridge block, and the conning tower inside it ------------------
  const p0 = at(planHouse({ hw: 6.4, zBack: BRIDGE[0] - zc, zFront: BRIDGE[1] - zc - 2, nose: 5.4, arc: 11 }));
  loftShape(g, M.steel, [{ pts: p0, y: foot }, { pts: p0, y: foot + 3.0 }]);
  box(g, M.deckSteel, 12.6, 0.16, 22.0, 0, foot + 3.05, zc - 1);
  // Doors and portholes down both sides of it, and the ladders up to the deck
  // above at the after corners.
  for (const sgn of [-1, 1]) {
    box(g, M.steelDark, 0.12, 1.9, 0.85, sgn * 6.42, foot + 0.95, zc - 6);
    box(g, M.steelDark, 0.12, 1.9, 0.85, sgn * 6.42, foot + 0.95, zc + 4);
    for (const pz of [-8, -4, 0, 4, 8]) {
      cyl(g, M.cave, 0.17, 0.17, 0.1, sgn * 6.44, foot + 1.9, zc + pz, 10)
        .rotation.z = Math.PI / 2;
      cyl(g, M.steel, 0.22, 0.22, 0.06, sgn * 6.44, foot + 1.9, zc + pz, 10)
        .rotation.z = Math.PI / 2;
    }
    ladder(g, M.steelDark, sgn * 5.4, foot, foot + 3.0, zc - 9.5, zc - 7.6);
    // The 10.5 cm director on its pedestal: a stabilised drum with the
    // rangefinder through it, which is what lays her heavy flak.
    const dir = new THREE.Group();
    dir.position.set(sgn * 5.9, foot + 3.15, zc - 7.5);
    dir.userData.dynamic = true;
    g.add(dir);
    cyl(dir, M.steelDark, 0.8, 0.95, 1.1, 0, 0.55, 0, 14);
    loftRings(dir, M.gun, [[1.25, 1.15, 0, 1.1], [1.25, 1.15, 0, 2.4], [1.05, 0.95, 0, 2.8]],
      { n: 14, px: 0.74, pz: 0.72 });
    tubeX(dir, M.gun, 0.22, 3.6, 0, 2.0, 0.2, 10);
    for (const e of [-1, 1]) box(dir, M.glass, 0.08, 0.2, 0.3, e * 1.85, 2.02, 0.2);
  }
  // The armoured conning tower, standing through the block: thick plate, a
  // vision slit all the way round, and the tube down to the transmitting
  // station under it.
  loftRings(g, M.steelDark, [
    [2.6, 2.8, zc + 5.5, foot],
    [2.6, 2.8, zc + 5.5, foot + 2.2],
    [2.4, 2.6, zc + 5.5, foot + 3.4],
  ], { n: 16, px: 0.8, pz: 0.8 });
  loftRings(g, M.cave, [
    [2.63, 2.83, zc + 5.5, foot + 2.35],
    [2.63, 2.83, zc + 5.5, foot + 2.72],
  ], { n: 16, px: 0.8, pz: 0.8, cap: false });

  // -- 1. the admiral's bridge ----------------------------------------------
  const p1 = at(planHouse({ hw: 5.4, zBack: -9, zFront: 10, nose: 4.6, arc: 11 }).map(([x, z]) => [x, z + 1]));
  loftShape(g, M.steel, [{ pts: p1, y: foot + 3.2 }, { pts: p1, y: foot + 6.0 }]);
  box(g, M.deckSteel, 14.4, 0.16, 20.0, 0, foot + 6.05, zc + 0.5);
  // Her window band, carried round the bullnose in one run.
  for (const [zz, hw] of [[zc + 8.5, 5.0], [zc + 5, 5.35], [zc, 5.4], [zc - 4, 5.2]]) {
    box(g, M.glass, hw * 2 - 0.3, 0.95, 1.7, 0, foot + 4.9, zz);
    box(g, M.steel, hw * 2 - 0.2, 0.12, 1.75, 0, foot + 5.44, zz);
  }
  // The wings, and what stands on them: a pelorus, a signal lamp, and the
  // splinter mattresses lashed to the rail.
  for (const sgn of [-1, 1]) {
    box(g, M.deckSteel, 2.6, 0.14, 4.4, sgn * 6.6, foot + 6.05, zc + 3);
    cyl(g, M.brass, 0.16, 0.16, 1.0, sgn * 6.9, foot + 6.6, zc + 3.4, 10);
    cyl(g, M.gun, 0.3, 0.3, 0.28, sgn * 6.9, foot + 7.15, zc + 3.4, 12);
    searchlight(g, sgn * 6.4, foot + 6.15, zc + 1.4, sgn * 1.4);
    railRing(g, sgn * 6.6, foot + 6.1, zc + 3, 1.3, 2.2);
    for (const mz of [zc + 1.6, zc + 3.0, zc + 4.4]) {
      box(g, M.canvas, 0.22, 0.62, 1.1, sgn * 7.7, foot + 6.5, mz);
    }
    // Voice pipes down the after face of her, and the flag locker.
    cyl(g, M.brass, 0.075, 0.075, 2.7, sgn * 3.4, foot + 4.6, zc - 8.4, 8);
    box(g, M.steelDark, 1.5, 0.75, 0.6, sgn * 3.6, foot + 6.45, zc - 8.2);
    ladder(g, M.steelDark, sgn * 4.6, foot + 3.2, foot + 6.0, zc - 9.2, zc - 7.5);
  }

  // -- 2. the navigating bridge and the chart house --------------------------
  const p2 = at(planHouse({ hw: 4.3, zBack: -7, zFront: 8, nose: 3.7, arc: 10 }).map(([x, z]) => [x, z + 1]));
  loftShape(g, M.steel, [{ pts: p2, y: foot + 6.2 }, { pts: p2, y: foot + 9.0 }]);
  for (const [zz, hw] of [[zc + 7, 3.9], [zc + 3, 4.25], [zc - 1, 4.2]]) {
    box(g, M.glass, hw * 2 - 0.3, 0.9, 1.5, 0, foot + 7.9, zz);
    box(g, M.steel, hw * 2 - 0.2, 0.1, 1.55, 0, foot + 8.38, zz);
  }
  box(g, M.deckSteel, 10.0, 0.16, 13.0, 0, foot + 9.05, zc + 0.5);
  // The chart house abaft it, with its own door and skylight.
  house(g, M.steel, 3.1, zc - 7.5, zc - 2.5, foot + 6.2, 2.5, { n: 16 });
  box(g, M.steelDark, 0.1, 1.8, 0.8, 3.15, foot + 7.1, zc - 5);
  box(g, M.glass, 1.6, 0.1, 2.0, 0, foot + 8.78, zc - 5);
  for (const sgn of [-1, 1]) {
    ladder(g, M.steelDark, sgn * 3.6, foot + 6.2, foot + 9.0, zc - 8.6, zc - 7.2);
  }

  // -- 3. the trunk, and the lights round it --------------------------------
  loftRings(g, M.steel, [
    [3.3, 3.6, zc, foot + 9.2],
    [2.9, 3.1, zc, foot + 13.5],
    [2.6, 2.8, zc, foot + 17.0],
  ], { n: 18, px: 0.78, pz: 0.78 });
  // A door into it and the ladder up its after face, in a cage.
  box(g, M.steelDark, 1.0, 1.9, 0.1, 0, foot + 10.2, zc - 3.5);
  ladder(g, M.steelDark, 0, foot + 9.2, foot + 17.0, zc - 3.4, zc - 3.4);
  for (let i = 0; i < 7; i++) {
    const y = foot + 10.4 + i * 0.95;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 5, 10), M.steelDark);
    hoop.position.set(0, y, zc - 3.75);
    hoop.rotation.x = Math.PI / 2;
    g.add(hoop);
  }
  for (const sgn of [-1, 1]) {
    box(g, M.deckSteel, 2.4, 0.14, 3.0, sgn * 3.6, foot + 12.5, zc);
    searchlight(g, sgn * 3.9, foot + 12.6, zc, sgn * 1.3);
    railRing(g, sgn * 3.6, foot + 12.55, zc, 1.4, 1.7);
    // The brackets carrying the platform out from the trunk.
    const br = box(g, M.steel, 1.9, 0.12, 1.2, sgn * 3.5, foot + 11.9, zc);
    br.rotation.z = sgn * 0.5;
  }

  // -- 4. the foretop ---------------------------------------------------------
  box(g, M.deckSteel, 8.4, 0.16, 7.0, 0, foot + 17.0, zc);
  railRing(g, 0, foot + 17.05, zc, 4.1, 3.4);
  loftRings(g, M.steel, [
    [3.5, 3.0, zc, foot + 17.1],
    [3.5, 3.0, zc, foot + 19.6],
  ], { n: 18, px: 0.72, pz: 0.7 });
  // The fire-control position's own vision slits, fore and aft.
  for (const zz of [zc + 2.6, zc - 2.6]) {
    box(g, M.glass, 6.2, 0.7, 0.16, 0, foot + 18.6, zz);
    box(g, M.steel, 6.35, 0.1, 0.2, 0, foot + 19.1, zz);
  }
  // The hood, which trains: a squat drum with the seven-metre rangefinder out
  // of it either side, and the sighting hoods on top.
  const top = new THREE.Group();
  top.position.set(0, foot + 19.7, zc);
  top.userData.dynamic = true;
  g.add(top);
  loftRings(top, M.gun, [[2.5, 2.1, 0, 0], [2.5, 2.1, 0, 1.5], [2.1, 1.8, 0, 2.0]],
    { n: 18, px: 0.7, pz: 0.68 });
  tubeX(top, M.gun, 0.36, 7.2, 0, 1.0, 0.4, 12);
  for (const sgn of [-1, 1]) {
    box(top, M.gun, 0.55, 0.62, 0.8, sgn * 3.4, 1.0, 0.4);
    box(top, M.glass, 0.1, 0.28, 0.44, sgn * 3.68, 1.02, 0.4);
    cyl(top, M.gun, 0.26, 0.3, 0.34, sgn * 1.0, 2.1, 0.2, 10);
  }
  // Her radar: a mattress on the face of the hood by 1941, and it trains with
  // it. The dipoles are what make it read as an aerial and not as a board.
  const mattress = box(top, M.steelDark, 5.0, 2.2, 0.22, 0, 2.5, 2.0);
  mattress.rotation.x = -0.06;
  for (let i = -3; i <= 3; i++) {
    for (const yy of [1.9, 2.5, 3.1]) {
      box(top, M.gunDark, 0.05, 0.05, 0.5, i * 0.7, yy, 2.24);
    }
  }

  // The pole mast abaft the tower, stepped on the admiral's bridge roof, with
  // her yards and the wireless aerials off it.
  const mz = zc - 7.5;
  const mFoot = foot + 6.2;
  cyl(g, M.steel, 0.26, 0.42, 18.0, 0, mFoot + 9.0, mz, 10);
  cyl(g, M.steel, 0.14, 0.22, 6.0, 0, mFoot + 20.5, mz, 8);
  for (const [yy, half] of [[mFoot + 14.0, 5.4], [mFoot + 19.4, 3.2]]) {
    tubeX(g, M.steel, 0.11, half * 2, 0, yy, mz, 8);
    // The lifts and halyards hanging off each yardarm.
    for (const sgn of [-1, 1]) {
      box(g, M.wire, 0.04, 1.4, 0.04, sgn * half * 0.9, yy - 0.7, mz);
    }
  }
  // The starfish that carries the after control position's aerials.
  for (const sgn of [-1, 1]) {
    const arm = box(g, M.steel, 2.6, 0.1, 0.1, sgn * 1.3, mFoot + 8.0, mz);
    arm.rotation.z = sgn * 0.22;
  }
  return foot;
}

/** A ring of stanchions and a rail, which is what every platform has round it. */
function railRing(g, x, y, z, hw, hd) {
  const pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    pts.push(x + Math.sin(a) * hw, y + 1.0, z + Math.cos(a) * hd);
  }
  const p2 = [];
  for (let i = 0; i < N; i++) {
    p2.push(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2],
      pts[(i + 1) * 3], pts[(i + 1) * 3 + 1], pts[(i + 1) * 3 + 2]);
    p2.push(pts[i * 3], y, pts[i * 3 + 2], pts[i * 3], y + 1.0, pts[i * 3 + 2]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3));
  g.add(new THREE.LineSegments(geo,
    new THREE.LineBasicMaterial({ color: 0xb9c1c8, transparent: true, opacity: 0.5 })));
}

/** A signal or fighting searchlight on its pedestal, with the glass in it. */
function searchlight(g, x, y, z, ry) {
  const s = new THREE.Group();
  s.position.set(x, y, z);
  s.rotation.y = ry;
  g.add(s);
  cyl(s, M.steelDark, 0.14, 0.18, 0.8, 0, 0.4, 0, 8);
  const drum = cyl(s, M.steel, 0.62, 0.62, 0.8, 0, 1.15, 0, 14);
  drum.rotation.x = Math.PI / 2;
  cyl(s, M.glass, 0.56, 0.56, 0.1, 0, 1.15, 0.42, 14).rotation.x = Math.PI / 2;
  cyl(s, M.steel, 0.66, 0.66, 0.12, 0, 1.15, -0.42, 14).rotation.x = Math.PI / 2;
}

// ------------------------------------------- funnel, hangar and her Arados --

/**
 * Her boiler rooms' uptakes, the casing over them, and the funnel they feed.
 *
 * Twelve high-pressure boilers in three rooms, and every one of them has to
 * get its smoke to the same place, so the whole of her midships is a casing
 * with the uptakes inside it. What is on the outside of that casing is what
 * you actually see of a boiler room: the fan intakes standing up out of it,
 * the mushroom heads, the big cowls each side drawing air down to the fire
 * rooms, the ash hoists and the fan house.
 *
 * And on top, the funnel: raked aft, oval in section, with the flat cap fitted
 * in 1940 on four struts to throw her own smoke clear of the foretop. Prinz
 * Eugen never had one and Hipper always did after that refit, so it is the one
 * detail that tells them apart at any range you can see a ship at.
 */
function funnel(g) {
  const foot = sdeck(FUNNEL_Z);
  const Z0 = FUNNEL_Z - 8;
  const Z1 = FUNNEL_Z + 8;
  // -- the casing over the fire rooms ---------------------------------------
  house(g, M.steel, 5.6, Z0, Z1, foot, 3.4);
  const base = foot + 3.4;
  // Its doors, and the ash hoist trunks at the after corners.
  for (const sgn of [-1, 1]) {
    box(g, M.steelDark, 0.1, 1.9, 0.85, sgn * 5.62, foot + 0.95, FUNNEL_Z - 4.5);
    box(g, M.steelDark, 0.1, 1.9, 0.85, sgn * 5.62, foot + 0.95, FUNNEL_Z + 4.5);
    cyl(g, M.steel, 0.42, 0.42, 3.4, sgn * 4.6, foot + 1.7, Z0 + 0.9, 10);
    cyl(g, M.steelDark, 0.5, 0.5, 0.3, sgn * 4.6, foot + 3.5, Z0 + 0.9, 10);
    ladder(g, M.steelDark, sgn * 5.0, foot, base, Z0 + 0.4, Z0 + 1.9);
    // The big boiler-room air cowls: what a fire room breathes through.
    for (const cz of [FUNNEL_Z - 6.2, FUNNEL_Z + 6.2]) {
      const v = new THREE.Group();
      v.position.set(sgn * 5.0, base, cz);
      g.add(v);
      cyl(v, M.steel, 0.55, 0.62, 3.0, 0, 1.5, 0, 14);
      const bell = cyl(v, M.steel, 0.95, 0.58, 1.2, 0, 3.4, 0.35, 16);
      bell.rotation.x = -1.05;
      cyl(v, M.cave, 0.78, 0.78, 0.1, 0, 3.72, 0.9, 16).rotation.x = -1.05;
      // The stay that holds a three-metre cowl up in a seaway.
      const stay = box(v, M.steelDark, 0.07, 2.4, 0.07, sgn * 0.5, 1.6, -0.5);
      stay.rotation.z = -sgn * 0.2;
    }
  }
  // The fan house on the casing top, and the mushroom heads round it.
  house(g, M.steel, 3.2, FUNNEL_Z - 6.5, FUNNEL_Z - 2.5, base, 1.9, { n: 16 });
  for (const sgn of [-1, 1]) {
    for (const mz of [FUNNEL_Z + 5.6, FUNNEL_Z + 2.2]) {
      cyl(g, M.steel, 0.3, 0.34, 0.9, sgn * 3.7, base + 0.45, mz, 12);
      cyl(g, M.steelDark, 0.62, 0.5, 0.32, sgn * 3.7, base + 1.05, mz, 14);
    }
  }
  // Gratings over the uptakes: the one part of a boiler room you can see down
  // into from the deck above it.
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      box(g, M.gunDark, 0.9, 0.06, 0.16, sgn * 2.2, base + 0.09, FUNNEL_Z - 1.4 + i * 0.7);
    }
  }

  // -- the funnel -----------------------------------------------------------
  const f = new THREE.Group();
  f.position.set(0, base, FUNNEL_Z);
  f.rotation.x = -0.12;
  g.add(f);
  loftRings(f, M.steel, [
    [3.5, 4.5, 0, 0],
    [3.3, 4.2, 0, 3.5],
    [3.0, 3.8, 0, 7.5],
    [2.85, 3.6, 0, 10.5],
  ], { n: 22, px: 0.85, pz: 0.85, cap: false });
  // The mouth, and the black inside it.
  loftRings(f, M.gunDark, [
    [2.85, 3.6, 0, 10.5],
    [2.72, 3.45, 0, 10.9],
  ], { n: 22, px: 0.85, pz: 0.85, cap: false });
  cyl(f, M.cave, 2.6, 2.6, 0.2, 0, 10.7, 0, 20).scale.set(1, 1, 1.26);
  // The uptake trunks standing inside the mouth: three fire rooms, three
  // trunks, and you can see the tops of them down the funnel.
  for (const uz of [-1.7, 0, 1.7]) {
    loftRings(f, M.gunDark, [[1.0, 0.7, uz, 9.4], [1.0, 0.7, uz, 10.35]],
      { n: 12, px: 0.8, pz: 0.8 });
  }
  // The bands round her, which is how a funnel is stiffened.
  for (const by of [1.6, 4.6, 7.6]) {
    const k = 1 - by * 0.019;
    loftRings(f, M.steelDark, [
      [3.52 * k, 4.52 * k, 0, by - 0.11],
      [3.58 * k, 4.6 * k, 0, by],
      [3.52 * k, 4.52 * k, 0, by + 0.11],
    ], { n: 22, px: 0.85, pz: 0.85, cap: false });
  }
  // The cap, on four struts over the mouth, with the lip turned down round it.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    cyl(f, M.steelDark, 0.14, 0.14, 1.3, Math.sin(a) * 2.3, 11.3, Math.cos(a) * 2.9, 8);
  }
  loftRings(f, M.steel, [
    [3.62, 4.45, 0, 12.0],
    [3.72, 4.58, 0, 12.28],
    [3.66, 4.50, 0, 12.5],
  ], { n: 22, px: 0.92, pz: 0.92 });
  // The steam pipes up her after face, the siren, and the ladder in its cage.
  for (const sgn of [-1, 1]) {
    cyl(f, M.steelDark, 0.16, 0.16, 10.0, sgn * 1.5, 5.4, -3.4, 8);
    cyl(f, M.steelDark, 0.2, 0.2, 0.4, sgn * 1.5, 10.5, -3.4, 8);
  }
  cyl(f, M.brass, 0.2, 0.2, 0.7, 0, 8.6, -3.5, 10);
  box(f, M.steelDark, 0.9, 0.5, 0.5, 0, 8.2, -3.6);
  ladder(f, M.steelDark, 0.9, 0.6, 10.0, -3.5, -3.3);
  for (let i = 0; i < 8; i++) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.03, 5, 10), M.steelDark);
    hoop.position.set(0.9, 1.4 + i * 1.1, -3.75);
    hoop.rotation.x = Math.PI / 2;
    f.add(hoop);
  }
  // The grab rails round her, the rungs everybody paints over.
  for (let i = 0; i < 6; i++) {
    box(f, M.steelDark, 0.5, 0.05, 0.05, 3.1, 1.4 + i * 1.3, 0);
  }

  // The mainmast: a light pole abaft the funnel carrying the after yard and
  // the wireless aerials down to the foremast.
  cyl(g, M.steel, 0.16, 0.28, 17.0, 0, foot + 8.5, FUNNEL_Z - 11.5, 8);
  tubeX(g, M.steel, 0.09, 8.0, 0, foot + 13.0, FUNNEL_Z - 11.5, 8);
  const aerial = box(g, M.wire, 0.05, 0.05, 30.0, 0, foot + 15.6, FUNNEL_Z + 3.5);
  aerial.rotation.x = -0.09;
  // The searchlight platform round her, which is where the big lights live.
  box(g, M.deckSteel, 13.0, 0.16, 4.4, 0, base + 4.6, FUNNEL_Z + 1);
  for (const sgn of [-1, 1]) {
    searchlight(g, sgn * 5.6, base + 4.7, FUNNEL_Z + 1, sgn * 1.5);
    railRing(g, sgn * 5.6, base + 4.65, FUNNEL_Z + 1, 1.6, 1.9);
    // Carried out from the funnel on brackets, and reached by a ladder.
    const br = box(g, M.steel, 3.0, 0.12, 1.4, sgn * 4.6, base + 3.9, FUNNEL_Z + 1);
    br.rotation.z = sgn * 0.42;
    ladder(g, M.steelDark, sgn * 4.4, base, base + 4.6, FUNNEL_Z + 3.4, FUNNEL_Z + 2.2);
  }
  // The boat deck each side of the casing, with the cutters on their chocks.
  // It is a deck: there has to be something under a boat.
  for (const sgn of [-1, 1]) {
    box(g, M.deckSteel, 4.0, 0.18, 19.0, sgn * 6.4, foot + 3.45, FUNNEL_Z);
    for (const zz of [FUNNEL_Z + 8.5, FUNNEL_Z, FUNNEL_Z - 8.5]) {
      const st = cyl(g, M.steel, 0.16, 0.16, 3.4, sgn * 7.9, foot + 1.7, zz, 8);
      st.rotation.z = sgn * 0.06;
    }
    for (const bz of [FUNNEL_Z + 5.5, FUNNEL_Z - 5.5]) {
      boat(g, sgn * 6.6, foot + 3.6, bz, 4.6);
      // The davits that swing her out.
      for (const dz of [bz - 2.4, bz + 2.4]) {
        const dav = cyl(g, M.steel, 0.12, 0.16, 4.2, sgn * 8.0, foot + 5.4, dz, 8);
        dav.rotation.z = sgn * -0.32;
      }
    }
  }
}

/** A ship's boat on her chocks: pointed at both ends, with a cover over her. */
function boat(g, x, y, z, len) {
  const hull = new THREE.Group();
  hull.position.set(x, y + 0.7, z);
  g.add(hull);
  const N = 9;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const u = (i / N) * 2 - 1;
    const w = (len * 0.135) * Math.pow(Math.max(0, 1 - u * u), 0.42);
    const zz = u * (len / 2);
    const sh = 0.42 + 0.2 * u * u;
    pos.push(-w, -0.42, zz, w, -0.42, zz, -w * 1.05, sh, zz, w * 1.05, sh, zz);
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
  box(hull, M.canvas, len * 0.24, 0.12, len * 0.86, 0, 0.36, -0.1);
  // The chocks she sits on.
  for (const cz of [-len * 0.22, len * 0.22]) {
    box(g, M.steelDark, len * 0.3, 0.5, 0.34, x, y + 0.25, z + cz);
  }
}

/**
 * The aircraft: a hangar, a catapult across her, a crane, and two Arado 196s.
 *
 * A Hipper carried three of them and worked them off a single athwartships
 * catapult on the centreline abaft the funnel, with a hangar forward of it and
 * a heavy crane on the starboard side to fish them out of the water again.
 */
function aircraft(g) {
  const foot = sdeck(-24);
  // The hangar: a house with a big roller door in its after face.
  house(g, M.steel, 6.2, HANGAR[0], HANGAR[1], foot, 4.2);
  box(g, M.steelDark, 7.0, 3.4, 0.2, 0, foot + 1.8, HANGAR[0] - 0.05);
  for (let i = 0; i < 7; i++) {
    box(g, M.steel, 6.6, 0.08, 0.24, 0, foot + 0.5 + i * 0.5, HANGAR[0] - 0.14);
  }
  // The catapult: a long girder across her on a training ring, with the
  // trolley on it and an Arado sitting on the trolley.
  //
  // It works. The ring trains, the trolley runs out along the girder and the
  // aeroplane is thrown off the end of it -- so the whole thing is left out of
  // the weld and driven by stepCatapult below, the same way the carrier's
  // lifts and the Cleveland's catapults are.
  const cat = new THREE.Group();
  cat.position.set(0, sdeck(CAT_Z) + 1.4, CAT_Z);
  cat.userData.dynamic = true;
  g.add(cat);
  cyl(cat, M.steelDark, 2.0, 2.3, 0.9, 0, -0.75, 0, 18);
  // The girder itself, athwartships, twenty-two metres of it. Her stroke runs
  // out along its own +z, so the group is turned to lie across her and the
  // trolley runs to starboard.
  const girder = new THREE.Group();
  girder.rotation.y = Math.PI / 2;
  cat.add(girder);
  box(girder, M.steel, 1.9, 0.75, 22.0, 0, 0, 0);
  box(girder, M.steelDark, 2.3, 0.16, 22.0, 0, 0.44, 0);
  for (let i = -4; i <= 4; i++) {
    box(girder, M.steelDark, 2.1, 0.5, 0.16, 0, -0.15, i * 2.4);
  }
  // The trolley, and the aeroplane on it.
  const car = new THREE.Group();
  car.position.z = CAT_A;
  girder.add(car);
  box(car, M.gunDark, 2.2, 0.34, 3.0, 0, 0, 0);
  const plane = new THREE.Group();
  plane.position.set(0, 0.33, 0);
  car.add(plane);
  const p2 = arado(plane, 0, 0, 0, 0);
  g.userData.catapult = { cat, girder, car, plane, prop: p2.userData.prop };
  // And a second one struck down beside the hangar, wings folded back.
  arado(g, S * 5.6, foot + 0.35, HANGAR[0] + 4.5, S * 0.25, true);
  // The crane: a pedestal, a lattice jib, and the whip hanging off it.
  const crane = new THREE.Group();
  crane.position.set(S * 6.6, sdeck(-30), -30);
  crane.rotation.y = Math.PI * 0.94;
  g.add(crane);
  cyl(crane, M.steel, 0.85, 1.05, 3.2, 0, 1.6, 0, 14);
  cyl(crane, M.steelDark, 1.0, 1.0, 0.3, 0, 3.3, 0, 14);
  const jib = new THREE.Group();
  jib.position.set(0, 3.5, 0);
  jib.rotation.x = -0.55;
  crane.add(jib);
  for (const sgn of [-1, 1]) {
    box(jib, M.steel, 0.14, 0.14, 15.0, sgn * 0.42, 0.42, 7.2);
    box(jib, M.steel, 0.14, 0.14, 15.0, sgn * 0.42, -0.42, 7.2);
  }
  for (let i = 0; i < 9; i++) {
    const z = 0.8 + i * 1.7;
    box(jib, M.steel, 0.9, 0.08, 0.08, 0, 0.42, z);
    box(jib, M.steel, 0.9, 0.08, 0.08, 0, -0.42, z);
    const d = box(jib, M.steel, 0.08, 0.9, 0.08, 0.42, 0, z);
    d.rotation.x = 0.6;
  }
  box(jib, M.steelDark, 1.1, 1.1, 0.5, 0, 0, 14.6);
  box(g, M.wire, 0.05, 3.2, 0.05, S * 6.6 + Math.sin(Math.PI * 0.94) * 12.4,
    sdeck(-30) + 5.6, -30 + Math.cos(Math.PI * 0.94) * 12.4);
}

/**
 * An Arado 196: the shipboard floatplane every German cruiser flew.
 *
 * A low-wing monoplane on two big floats, with a radial engine and a long
 * greenhouse for the pilot and his observer. `folded` swings the wings back
 * along her sides, which is how she is struck down.
 */
function arado(g, x, y, z, ry, folded = false) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  // The floats first: she sits on them, and they are half of what she looks
  // like from anywhere but directly above.
  for (const sgn of [-1, 1]) {
    const fl = new THREE.Group();
    fl.position.set(sgn * 1.55, 0, 0.2);
    p.add(fl);
    loftRings(fl, M.planeLow, [
      [0.24, 0.30, -3.6, 0.0], [0.34, 0.42, -2.4, -0.05],
      [0.40, 0.5, -0.6, -0.1], [0.40, 0.5, 1.2, -0.08],
      [0.32, 0.4, 2.8, 0.1], [0.16, 0.2, 3.9, 0.35],
    ].map(([hw, hd, zz, yy]) => [hw, hd, zz, yy]), { n: 12, px: 0.8, pz: 0.9 });
    // The struts up to the fuselage and out to the wing.
    for (const sz of [-1.4, 1.4]) {
      const st = cyl(fl, M.planeTop, 0.07, 0.07, 1.5, 0, 0.8, sz, 6);
      st.rotation.z = -sgn * 0.42;
    }
  }
  // The fuselage: a slim body with the greenhouse most of the way along it.
  loftRings(p, M.planeTop, [
    [0.30, 0.34, -4.4, 1.62], [0.44, 0.5, -3.2, 1.62], [0.55, 0.6, -1.6, 1.62],
    [0.60, 0.66, 0.0, 1.62], [0.62, 0.68, 1.4, 1.62], [0.58, 0.64, 2.6, 1.62],
    [0.52, 0.58, 3.3, 1.62],
  ], { n: 14, px: 0.85, pz: 0.85, cap: false });
  // The cowling and the propeller.
  cyl(p, M.gunDark, 0.62, 0.66, 1.1, 0, 1.62, 3.9, 14).rotation.x = Math.PI / 2;
  cyl(p, M.planeTop, 0.16, 0.3, 0.5, 0, 1.62, 4.6, 10).rotation.x = Math.PI / 2;
  // The blades in a group of their own, so they can be turned over.
  const prop = new THREE.Group();
  prop.position.set(0, 1.62, 4.75);
  p.add(prop);
  for (let i = 0; i < 3; i++) {
    const bl = box(prop, M.gunDark, 0.16, 3.0, 0.06, 0, 0, 0);
    bl.rotation.z = (i / 3) * Math.PI * 2;
  }
  p.userData.prop = prop;
  // The greenhouse, which on an Arado runs almost to the fin.
  loftRings(p, M.glass, [
    [0.42, 0.5, -2.0, 2.1], [0.5, 0.55, 0.4, 2.16], [0.46, 0.5, 2.4, 2.12],
  ], { n: 12, px: 0.8, pz: 0.85 });
  for (const zz of [-1.4, 0.2, 1.8]) box(p, M.planeTop, 1.02, 0.62, 0.07, 0, 2.12, zz);
  // The wings, spread or swung back along her.
  const wing = (sgn, back) => {
    const w = new THREE.Group();
    w.position.set(sgn * 0.5, 1.35, 0.4);
    if (back) w.rotation.y = sgn * 1.42;
    p.add(w);
    const pos = [];
    const idx = [];
    const N = 6;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const span = sgn * u * 5.3;
      const chord = 1.85 - u * 0.55;
      const th = 0.20 * (1 - u * 0.5);
      pos.push(span, 0.0, chord * 0.5, span, th, chord * 0.16,
        span, 0.0, -chord * 0.5, span, -th * 0.35, chord * 0.16);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 4;
      const b = (i + 1) * 4;
      for (const [p0, p1] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
        idx.push(a + p0, b + p0, a + p1, a + p1, b + p0, b + p1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    w.add(new THREE.Mesh(geo, M.planeTop));
  };
  for (const sgn of [-1, 1]) wing(sgn, folded);
  // Tailplane and fin.
  box(p, M.planeTop, 3.4, 0.09, 0.9, 0, 1.72, -3.7);
  box(p, M.planeTop, 0.10, 1.5, 1.3, 0, 2.4, -3.9);
  return p;
}

// ------------------------------------------------------------ the after end --

/** The after control position: a short tower with its own director on top. */
function afterTower(g) {
  const foot = sdeck(-40);
  house(g, M.steel, 5.0, AFT_TOWER[0], AFT_TOWER[1], foot, 3.4);
  const zc = (AFT_TOWER[0] + AFT_TOWER[1]) / 2;
  loftRings(g, M.steel, [
    [3.2, 3.4, zc, foot + 3.5],
    [3.0, 3.2, zc, foot + 6.2],
  ], { n: 16, px: 0.72, pz: 0.7 });
  box(g, M.deckSteel, 7.4, 0.16, 8.0, 0, foot + 6.25, zc);
  // The after director, with its own rangefinder through it.
  const dir = new THREE.Group();
  dir.position.set(0, foot + 6.4, zc);
  dir.userData.dynamic = true;
  g.add(dir);
  loftRings(dir, M.gun, [[2.0, 1.8, 0, 0], [2.0, 1.8, 0, 1.4], [1.7, 1.55, 0, 1.9]],
    { n: 16, px: 0.7, pz: 0.68 });
  tubeX(dir, M.gun, 0.3, 6.2, 0, 0.95, 0.3, 12);
  for (const sgn of [-1, 1]) {
    box(dir, M.gun, 0.5, 0.55, 0.7, sgn * 2.95, 0.95, 0.3);
    box(dir, M.glass, 0.09, 0.24, 0.4, sgn * 3.2, 0.97, 0.3);
  }
  // And the bandstand over Cäsar that the after Flakvierling stands on: it has
  // to be carried out over the turret, because there is no deck left aft of
  // here that a barbette is not already using.
  for (const sgn of [-1, 1]) {
    const leg = cyl(g, M.steel, 0.2, 0.2, 5.0, sgn * 2.2, foot + 2.5, -49.5, 8);
    leg.rotation.x = 0.12;
  }
  box(g, M.deckSteel, 5.6, 0.18, 4.6, 0, foot + 5.0, -50);
  railRing(g, 0, foot + 5.1, -50, 2.8, 2.3);
}

/** Depth charge rails, paravanes and the other things bolted to her quarter. */
function fittings(g) {
  // Capstans and the cable holders on the forecastle.
  for (const sgn of [-1, 1]) {
    cyl(g, M.steelDark, 0.62, 0.7, 0.8, sgn * 3.2, deckAt(80) + 0.4, 80, 12);
    cyl(g, M.gunDark, 0.42, 0.42, 0.6, sgn * 3.2, deckAt(80) + 1.05, 80, 10);
    box(g, M.steelDark, 1.0, 0.5, 1.4, sgn * 5.4, deckAt(74) + 0.25, 74);
  }
  // Bollards down both sides, which is what tells you the scale of a deck.
  for (const z of [86, 70, 34, -14, -44, -70, -84]) {
    for (const sgn of [-1, 1]) {
      const x = sgn * (halfDeck(z) - 0.9);
      for (const dz of [-0.5, 0.5]) {
        cyl(g, M.steelDark, 0.14, 0.16, 0.7, x, deckAt(z) + 0.35, z + dz, 8);
      }
    }
  }
  // Ventilator cowls along the superstructure deck, turned to the wind.
  for (const [vz, sgn] of [[30, -1], [30, 1], [18, -1], [-2, 1], [-16, -1], [-38, 1]]) {
    const v = new THREE.Group();
    v.position.set(sgn * 7.6, sdeck(vz), vz);
    g.add(v);
    cyl(v, M.steel, 0.3, 0.36, 1.9, 0, 0.95, 0, 10);
    const bell = cyl(v, M.steel, 0.55, 0.32, 0.7, 0, 2.1, 0.22, 12);
    bell.rotation.x = -1.1;
    cyl(v, M.cave, 0.44, 0.44, 0.08, 0, 2.3, 0.54, 12).rotation.x = -1.1;
  }
  // Carley floats and life rafts stowed against the deckhouse sides -- against
  // them, in racks on the house, not hanging in the air a metre outboard of
  // the deck they are supposed to be on.
  for (const rz of [36, 12, -8, -36]) {
    for (const sgn of [-1, 1]) {
      const r = new THREE.Group();
      r.position.set(sgn * (sHalf(rz) - 0.15), sdeck(rz) + 1.15, rz);
      r.rotation.z = sgn * 0.16;
      g.add(r);
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.2, 7, 14), M.raft);
      t.scale.set(1, 0.62, 1);
      t.rotation.y = Math.PI / 2;
      r.add(t);
    }
  }
  // Her ensign staff aft and the jackstaff forward.
  cyl(g, M.steel, 0.07, 0.1, 4.4, 0, deckAt(-96) + 2.2, -96, 8);
  cyl(g, M.steel, 0.07, 0.1, 3.2, 0, deckAt(96) + 1.6, 96, 8);
  // Accommodation ladders stowed against her side amidships.
  for (const sgn of [-1, 1]) {
    const l = box(g, M.steelDark, 0.2, 0.5, 7.0, sgn * (halfDeck(-2) - 0.3), deckAt(-2) - 1.2, -2);
    l.rotation.x = 0.06;
  }
}

/** Railings along every open edge she has. */
function railings(g) {
  const pts = [];
  const run = (from, to, y) => {
    const N = Math.max(2, Math.round(Math.abs(to - from) / 3));
    for (const sgn of [-1, 1]) {
      for (let i = 0; i < N; i++) {
        const z0 = from + ((to - from) * i) / N;
        const z1 = from + ((to - from) * (i + 1)) / N;
        const x0 = sgn * (halfDeck(z0) - 0.25);
        const x1 = sgn * (halfDeck(z1) - 0.25);
        const y0 = y(z0);
        const y1 = y(z1);
        for (const h of [0.45, 0.9, 1.25]) {
          pts.push(x0, y0 + h, z0, x1, y1 + h, z1);
        }
        pts.push(x0, y0, z0, x0, y0 + 1.25, z0);
      }
    }
  };
  // The weather deck abaft the bulwark, and the quarterdeck.
  run(-96, 56, deckAt);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(geo,
    new THREE.LineBasicMaterial({ color: 0xb9c1c8, transparent: true, opacity: 0.45 })));
}

// ------------------------------------------------------------------ build --

/** Everything that does not move, in the order it is built. */
const STATIC = [
  ['hull', hull],
  ['superstructureDeck', superstructureDeck],
  ['bridge', bridge],
  ['funnel', funnel],
  ['aircraft', aircraft],
  ['afterTower', afterTower],
  ['sponsons', sponsons],
  ['fittings', fittings],
  ['railings', railings],
];

/** Her main battery: four twin eight-inch, Cäsar with the rangefinder. */
function mainBattery(g) {
  const turrets = [];
  // Anton and Bruno stand on the weather deck and on a barbette above it;
  // Cäsar and Dora the same the other way round.
  turrets.push(eightInch(g, 0, deckAt(A_Z) + 0.1, A_Z, false));
  turrets.push(eightInch(g, 0, deckAt(B_Z) + 4.0, B_Z, false));
  turrets.push(eightInch(g, 0, deckAt(X_Z) + 4.0, X_Z, true, true));
  turrets.push(eightInch(g, 0, deckAt(Y_Z) + 0.1, Y_Z, true));
  g.userData.turrets = turrets;
  return turrets;
}

/** The barbettes B and C stand on, which are part of the ship, not the guns. */
function barbettes(g) {
  for (const [z, h] of [[B_Z, 4.0], [X_Z, 4.0]]) {
    house(g, M.steel, 6.4, z - 7.5, z + 7.5, deckAt(z), h, { px: 0.85, pz: 0.8 });
  }
  // The breakwater forward of Anton, which every ship with an Atlantic bow has.
  const bw = box(g, M.steel, 13.0, 1.3, 0.3, 0, deckAt(76) + 0.65, 76);
  bw.rotation.x = -0.22;
  for (const sgn of [-1, 1]) {
    const w = box(g, M.steel, 0.3, 1.3, 4.0, sgn * 6.4, deckAt(78) + 0.65, 78);
    w.rotation.y = sgn * 0.22;
  }
}

/**
 * The platforms every beam mounting stands on, built before the welder runs so
 * they are part of the ship rather than part of the gun.
 */
function sponsons(g) {
  for (const m of CLS.secondary.mounts) sponson(g, m.x, m.z, 2.3, 2.6);
  for (const gun of CLS.aa.guns) {
    for (const m of gun.mounts) {
      if (m.x === 0) continue;
      sponson(g, m.x, m.z, gun.caliber === 37 ? 1.5 : 1.2, gun.caliber === 37 ? 1.7 : 1.4);
    }
  }
  for (const m of CLS.torpedoes.mounts) sponson(g, m.x, m.z, 2.0, 2.6);
}

/** The secondary battery, the light battery and the tubes, off the datasheet. */
function mountings(g) {
  const sec = [];
  const aa = [];
  const torp = [];
  for (const m of CLS.secondary.mounts) {
    sec.push(tenFive(g, m.x, sdeck(m.z) + 0.16, m.z, m.angle));
  }
  for (const gun of CLS.aa.guns) {
    for (const m of gun.mounts) {
      // The one on the centreline right aft is on the bandstand carried over
      // Cäsar; the rest stand on the superstructure deck or on a sponson.
      const y = m.x === 0 ? sdeck(-40) + 5.2 : sdeck(m.z) + 0.16;
      aa.push(gun.caliber === 37
        ? threeSeven(g, m.x, y, m.z, m.angle)
        : twoCm(g, m.x, y, m.z, m.angle));
    }
  }
  for (const m of CLS.torpedoes.mounts) {
    torp.push(torpedoBank(g, m.x, sdeck(m.z) + 0.16, m.z, m.angle));
  }
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  g.userData.torpMounts = torp;
}

/**
 * The whole ship.
 *
 * Everything static is welded into as few meshes as the materials allow; the
 * mountings are built afterwards and left alone, because they have to train.
 */
/**
 * Her catapult, working.
 *
 * The same evolution the Cleveland flies, athwartships instead of fore and
 * aft: the ring trains round into the wind, the engine runs up on the trolley,
 * and the shot itself is read off the integrated catapult profile -- thrust
 * against her weight down twenty metres of track and then flying. Once she is
 * off the end of it the flight is drawn out where the shot left her, so the
 * model goes out of sight until she is craned back aboard.
 */
const CAT_TRAIN_T = 2.4;        // seconds to swing the ring round
const CAT_RUNUP = 5.4;          // and to wind the engine up on the trolley

function stepCatapult(deck, t) {
  const c = deck.cat;
  if (!c) return;
  const pr = deck.profile;
  const shot = pr.rows.length * pr.dt;
  // Paced so she leaves the track at the moment the simulation puts her
  // flight up, however long the integrated shot takes.
  const pace = (CAT_RUNUP + shot) / deck.run;
  const run = deck.launchAt === null ? -1 : (t - deck.launchAt) * pace;

  // The ring trains out on the order and comes back afterwards.
  let out = 0;
  if (run >= 0) {
    if (run < CAT_TRAIN_T) out = smooth(run / CAT_TRAIN_T);
    else if (run < CAT_RUNUP + shot) out = 1;
    else out = 1 - smooth((run - CAT_RUNUP - shot) / 3.5);
  }
  c.cat.rotation.y = CAT_TRAIN * out;

  if (run < 0) {
    // On the trolley, inboard, with the engine ticking over.
    c.car.position.z = CAT_A;
    c.plane.position.set(0, 0.33, 0);
    c.plane.rotation.set(0, 0, 0);
    c.plane.visible = !deck.gone;
    if (c.prop && !deck.gone) c.prop.rotation.z += 0.04;
    return;
  }
  if (deck.gone) { c.plane.visible = false; return; }

  let along = CAT_A;
  let y = 0;
  let pitch = 0;
  let turning = 3;
  if (run < CAT_TRAIN_T) {
    turning = 3 + 14 * out;
  } else if (run < CAT_RUNUP) {
    // Held on the trolley with the engine wound right up: she shakes.
    turning = 30;
    pitch = 0.005 * Math.sin((run - CAT_TRAIN_T) * 26);
  } else if (run < CAT_RUNUP + shot) {
    turning = 34;
    const i = Math.min(pr.rows.length - 1,
      Math.max(0, Math.round((run - CAT_RUNUP) / pr.dt)));
    const [s2, h, th] = pr.rows[i];
    along = CAT_A + s2;
    y = h;
    // Nose up: she is climbing away off the end of the girder.
    pitch = th;
  } else {
    deck.airborne = true;
    deck.gone = true;
    c.plane.visible = false;
    return;
  }
  c.car.position.z = Math.min(CAT_A + CAT_STROKE, along);
  // Past the end of the girder there is no trolley under her: she carries on
  // along the line of the track on her own.
  c.plane.position.set(0, 0.33 + y,
    Math.max(0, along - (CAT_A + CAT_STROKE)));
  c.plane.rotation.set(pitch, 0, 0);
  c.plane.visible = true;
  if (c.prop) c.prop.rotation.z += turning * 0.05;
}

export function buildHipper() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  barbettes(g);
  // Her insides, fitted to her own lines, and the weld split one buffer per
  // compartment so a compartment blown out of her can have its plating taken
  // off and you can see them. See interior.js.
  buildInterior(g, { loa: LOA, shellAt, keelY, sheer, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  g.userData.classId = 'hipper';

  // Her catapult, and the handful of calls the scene works it with. She flies
  // her Arados off it the same way the Cleveland flies her Kingfishers: the
  // simulation says when, and the ship knows what a launch looks like.
  const deck = {
    cat: g.userData.catapult, live: null, launchAt: null, airborne: false,
    gone: false, plane: null, flightId: 0, pending: [], endMatrix: null,
    // Paced to her own launch, not the carrier's. Both ships used to take the
    // carrier's twenty-four-second deck cycle, so the simulation put a scout
    // on the plot fifteen seconds before the model left the girder.
    aero: 'arado', run: CLS.planes ? CLS.planes.deckRun : DECK_RUN,
    profile: catapultProfile(AERO.arado, CAT_STROKE),
  };
  g.userData.deck = deck;
  g.userData.deckPlane = g.userData.catapult ? g.userData.catapult.plane : null;
  g.userData.step = (t) => stepCatapult(deck, t);
  g.userData.launch = (t) => {
    deck.launchAt = t;
    deck.airborne = false;
    deck.gone = false;
    if (deck.cat) deck.cat.plane.visible = true;
  };
  // She has no hangar lift and no arrester wire: a floatplane alights
  // alongside and is fished out by the crane and put back on her trolley, so
  // being recovered and being struck below are the same evolution.
  g.userData.recover = () => {
    deck.airborne = false;
    deck.launchAt = null;
    deck.gone = false;
    if (!deck.cat) return;
    if (deck.cat.plane.parent !== deck.cat.car) deck.cat.car.add(deck.cat.plane);
    deck.cat.plane.position.set(0, 0.33, 0);
    deck.cat.plane.rotation.set(0, 0, 0);
    deck.cat.plane.visible = true;
    deck.cat.car.position.z = CAT_A;
    deck.cat.cat.rotation.y = 0;
  };
  g.userData.stow = g.userData.recover;
  // Where she comes back to: her own trolley, out on the end of the girder.
  g.userData.landingSpot = [S * 9, sdeck(CAT_Z) + 2.4, CAT_Z];

  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: sheer(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
    torpMounts: g.userData.torpMounts || [],
    deckPlane: g.userData.deckPlane,
  };
}

/**
 * Every piece of her and where it sits, for the tests.
 *
 * `moving` marks anything under a group the welder was told to leave alone --
 * a gun mounting, a training bank of tubes -- so a check can tell a mounting
 * that swings out over the side from a locker bolted to the deck.
 */
export function hipperParts() {
  const parts = [];
  const builders = [...STATIC, ['barbettes', barbettes], ['mainBattery', mainBattery],
    ['mountings', mountings]];
  for (const [name, build] of builders) {
    const g = new THREE.Group();
    build(g);
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      let moving = false;
      for (let n = o; n; n = n.parent) if (n.userData && n.userData.dynamic) { moving = true; break; }
      o.geometry.computeBoundingBox();
      const lb = o.geometry.boundingBox;
      const bb = lb.clone().applyMatrix4(o.matrixWorld);
      parts.push({
        from: name,
        min: [bb.min.x, bb.min.y, bb.min.z],
        max: [bb.max.x, bb.max.y, bb.max.z],
        size: [lb.max.x - lb.min.x, lb.max.y - lb.min.y, lb.max.z - lb.min.z],
        moving,
      });
    });
  }
  return parts;
}

export { sheer, shellAt, zAt, sdeck, sHalf };
