// USS Cleveland, built out of her own lines.
//
// A Cleveland is a Brooklyn's machinery under a taller, narrower superstructure
// with the after turret taken out and put back as anti-aircraft: six hundred
// and ten feet on sixty-six of beam, twelve six-inch rifles in four triple
// turrets, twelve five-inch in six twin mounts, and enough forty-millimetre to
// make her the ship a Japanese pilot least wanted to attack.
//
// Her weather deck runs unbroken from stem to stern, with sheer forward and
// nothing but the fall of the sheer aft -- no step down to a quarterdeck. Right
// aft is where her aircraft live: two catapults, a crane on the centreline, and
// a hangar under the fantail.
//
// Local frame, as everywhere else in the renderer: +Z is the bow, +Y is up, and
// therefore starboard is -X. y = 0 is the waterline.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic } from './merge.js';
import { AERO, catapultProfile } from './aero.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import {
  box, cyl, tubeZ, tubeX, sphere, smooth, lerpTable, loftRings, loftShape,
  planHouse, ladder,
} from './shipkit.js';

export const LOA = 185.9;
export const BEAM = 20.2;
export const DRAFT = 7.5;
/** Starboard, in this frame. */
const S = -1;

// Measure 21, navy blue, the same as the rest of the fleet in the yard.
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
  canvas: 0x6a6e66,
  wire: 0x2c343c,
  brass: 0x9a8250,
  cave: 0x14181d,
  raft: 0x353b42,
  mark: 0xd2cec1,
  planeTop: 0x46586d,      // her float planes, blue-grey over light grey
  planeLow: 0x9aa4ad,
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
// `t` runs -1 at the transom to +1 at the stem. A cruiser's body plan is not a
// destroyer's: the entrance is fine but not knife-like, the maximum beam sits
// almost amidships and holds over a long parallel middle body, and the run aft
// is full because she has four shafts to feed.

// Half-breadths at the waterline. Her extreme beam is 20.2 m and it is measured
// at the deck edge, where the flare has added its share, so the moulded figure
// here comes out a little under ten.
const HALF_BEAM = [
  [-1.00, 3.94], [-0.92, 5.11], [-0.82, 6.38], [-0.70, 7.50], [-0.55, 8.47],
  [-0.38, 9.20], [-0.20, 9.69], [0.00, 9.84], [0.18, 9.74], [0.35, 9.40],
  [0.52, 8.72], [0.66, 7.65], [0.78, 6.28], [0.88, 4.63], [0.95, 2.68],
  [1.00, 0.29],
];

const KEEL = [
  [-1.00, -3.10], [-0.90, -5.90], [-0.80, -7.05], [-0.60, -7.48], [0.00, -7.52],
  [0.55, -7.42], [0.72, -6.95], [0.84, -5.45], [0.93, -2.70], [1.00, 1.90],
];

// One deck the whole way, at one height: no break, no step down to a
// quarterdeck. Her sheer rises forward and that is all it does.
const SHEER = [
  [-1.00, 7.30], [-0.80, 7.55], [-0.60, 7.80], [-0.40, 8.05], [-0.20, 8.26],
  [0.00, 8.46], [0.25, 8.82], [0.50, 9.42], [0.72, 10.24], [0.88, 10.98],
  [1.00, 11.55],
];

const halfBeam = (t) => lerpTable(HALF_BEAM, t);
const keelY = (t) => lerpTable(KEEL, t);
const sheer = (t) => lerpTable(SHEER, t);

/** How much her topsides flare out above the waterline. */
function flare(t) {
  return 0.08 + smooth((t - 0.1) / 0.9) * 0.40;
}

/** Her half-breadth at this station and this height. */
function shellAt(t, y) {
  const w = halfBeam(t);
  const k = keelY(t);
  const sh = sheer(t);
  if (y <= k) return 0;
  const up = Math.min(1, Math.max(0, (y - k) / Math.max(0.6, -k + 0.5)));
  const belly = Math.pow(up, 0.36);
  let half = w * belly;
  if (y > 0) half += w * flare(t) * Math.min(1, y / Math.max(1, sh)) * 0.30;
  return Math.max(0.03, Math.min(half, w * 1.5));
}

// The stem is raked and the counter overhangs, so where the shell actually is
// fore and aft depends on how high up you look.
const STEM = 6.4;
const COUNTER = 3.4;
function stemAt(y) { return STEM * Math.pow(Math.max(0, y + 2.5) / 14, 1.4); }
function counterAt(y) { return COUNTER * Math.pow(Math.max(0, y + 3.2) / 8.4, 1.15); }

function zAt(t, y) {
  let z = (t * LOA) / 2;
  if (t > 0.5) z += smooth((t - 0.5) / 0.5) * (stemAt(y) - STEM);
  else if (t < -0.74) z -= smooth((-t - 0.74) / 0.26) * (counterAt(y) - COUNTER);
  return z;
}

/** Her deck edge at a station, in metres from the bow, whichever deck it is. */
function deckAt(z) {
  const t = Math.max(-1, Math.min(1, z / (LOA / 2)));
  return sheer(t) + 0.28;
}

/** And how far outboard the deck edge is there. */
function halfDeck(z) {
  const t = Math.max(-1, Math.min(1, z / (LOA / 2)));
  return shellAt(t, sheer(t));
}

// ------------------------------------------------------------------ hull --

const BOOT_LO = -2.1;
const BOOT_HI = 0.7;
const STATIONS = 108;

/**
 * The three strakes, as functions of the station: red lead below the boot top,
 * the black boot topping through the waterline, and navy blue from there up to
 * whichever deck edge is above it.
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
 * Either height may be a number or a function of the station: the topsides band
 * has to follow the sheer, and her sheer has a step in it a whole deck high.
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
    const N = 12;
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
  const CAM = 4;
  const across = CAM * 2 + 1;
  for (let i = 0; i <= STATIONS; i++) {
    const t = -1 + (2 * i) / STATIONS;
    const sh = sheer(t);
    const w = shellAt(t, sh);
    const z = zAt(t, sh);
    for (let j = 0; j < across; j++) {
      const u = (j - CAM) / CAM;
      const crown = (1 - u * u) * 0.32;
      pos.push(u * w, sh + crown, z);
    }
  }
  for (let i = 0; i < STATIONS; i++) {
    for (let j = 0; j < across - 1; j++) {
      const a = i * across + j;
      const b = (i + 1) * across + j;
      // Wound so the deck faces up.
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
 * The gunwale: a strip of plating standing up all along both deck edges, low
 * along the waist and rising into a bulwark forward where the sea comes aboard.
 */
function bulwark(g) {
  const pos = [];
  const idx = [];
  const TH = 0.26;
  const capAt = (t) => 0.24 + 0.85 * smooth((t - 0.5) / 0.34);
  for (let i = 0; i <= STATIONS; i++) {
    const t = -1 + (2 * i) / STATIONS;
    const sh = sheer(t);
    const w = Math.max(0.06, shellAt(t, sh));
    const z = zAt(t, sh);
    const h = capAt(t);
    const inner = Math.max(0.03, w - TH);
    for (const sgn of [1, -1]) {
      pos.push(sgn * w, sh, z);
      pos.push(sgn * w, sh + h, z);
      pos.push(sgn * inner, sh + h, z);
      pos.push(sgn * inner, sh + 0.02, z);
    }
  }
  const PER = 8;
  for (let i = 0; i < STATIONS; i++) {
    const a = i * PER;
    const b = (i + 1) * PER;
    for (let k = 0; k < 2; k++) {
      const o = k * 4;
      const [A, B, C, D] = [a + o, a + o + 1, a + o + 2, a + o + 3];
      const [E, F, G, H] = [b + o, b + o + 1, b + o + 2, b + o + 3];
      if (k === 0) {
        idx.push(A, B, F, A, F, E);
        idx.push(B, C, G, B, G, F);
        idx.push(C, D, H, C, H, G);
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

/** Bilge keels, four shafts on struts, four screws and twin rudders. */
function underwater(g) {
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 26; i++) {
      const t = -0.42 + (i / 25) * 0.80;
      const y = keelY(t) * 0.50;
      const w = shellAt(t, y);
      const b = box(g, M.antifoul, 0.14, 0.9, LOA * 0.032, sgn * w * 1.01, y, zAt(t, y));
      b.rotation.z = sgn * 0.62;
    }
    // Two shafts a side: the inboard pair short, the outboard pair long, which
    // is what four screws on a cruiser look like from underneath.
    for (const [dx, tail, sz] of [[2.9, 20, -56], [6.0, 30, -48]]) {
      const x = sgn * dx;
      tubeZ(g, M.steelDark, 0.40, tail, x, -5.3, sz, 12);
      for (const lean of [-0.5, 0.5]) {
        const st = cyl(g, M.steelDark, 0.24, 0.24, 3.6, x + sgn * 0.3, -4.2,
          sz - tail * 0.42, 8);
        st.rotation.z = lean * 0.55;
        st.rotation.x = 0.1;
      }
      cyl(g, M.steelDark, 0.5, 0.5, 1.5, x, -5.3, sz - tail * 0.5, 12)
        .rotation.x = Math.PI / 2;
      const hub = new THREE.Group();
      hub.position.set(x, -5.3, sz - tail * 0.5 - 0.9);
      g.add(hub);
      cyl(hub, M.brass, 0.36, 0.56, 0.7, 0, 0, 0, 12).rotation.x = Math.PI / 2;
      for (let b = 0; b < 4; b++) {
        const bl = new THREE.Group();
        bl.rotation.z = (b / 4) * Math.PI * 2;
        hub.add(bl);
        for (let k = 0; k < 3; k++) {
          const f = (k + 0.5) / 3;
          const blade = box(bl, M.brass, 0.86 - 0.28 * f, 1.7 / 3 + 0.03, 0.14,
            0, 0.46 + f * 1.7, 0);
          blade.rotation.y = sgn * (0.72 - 0.38 * f);
        }
      }
    }
    // Twin rudders, abaft the inboard screws.
    const r = box(g, M.antifoul, 0.34, 4.4, 3.4, sgn * 2.9, -4.4, -72);
    r.rotation.x = 0.03;
  }
  // The skeg on the centreline and the sole of the keel.
  box(g, M.antifoul, 0.8, 1.4, 34, 0, -7.0, -50);
  box(g, M.antifoul, 1.0, 0.44, LOA * 0.70, 0, -7.55, -6);
}

function buildHull(g) {
  for (const [lo, hi, m] of strakeBands()) loftBand(g, m, lo, hi);
  capEnd(g, 1, 1);
  capEnd(g, -1, -1);
  weatherDeck(g);
  underwater(g);
  // The stem bar, swept along the rake rather than stacked up it.
  const SEG = 22;
  const foot = keelY(1);
  const head = sheer(1) + 0.5;
  for (let i = 0; i < SEG; i++) {
    const y0 = foot + ((head - foot) * i) / SEG;
    const y1 = foot + ((head - foot) * (i + 1)) / SEG;
    const z0 = zAt(1, y0);
    const z1 = zAt(1, y1);
    const len = Math.hypot(y1 - y0, z1 - z0) + 0.05;
    const b = box(g, M.hull, 0.36, 0.4, len, 0, (y0 + y1) / 2, (z0 + z1) / 2);
    b.rotation.x = Math.atan2(y1 - y0, z1 - z0) - Math.PI / 2;
  }
  // The hangar doors in the transom, under the quarterdeck: her aircraft come
  // out of the stern, which is the one thing everybody knows about a Cleveland.
  box(g, M.gunDark, 6.4, 3.0, 0.3, 0, 2.2, zAt(-1, 2.2) + 0.15);
  for (const sgn of [-1, 1]) box(g, M.steelDark, 0.2, 3.0, 0.34, sgn * 3.2, 2.2, zAt(-1, 2.2) + 0.15);
}

// -------------------------------------------------------------- armament --

/**
 * A triple 6"/47 in its Mk 16 turret.
 *
 * The thing that makes a Cleveland's turret hers and not a battleship's is the
 * proportion: it is a light turret, low and long, with a sloped face, a flat
 * roof that slopes down aft, and the three barrels close together in their own
 * sleeves because they are in a single slide.
 */
function sixInch(g, x, y, z, aft) {
  const mount = new THREE.Group();
  mount.position.set(x, y, z);
  mount.rotation.y = aft ? Math.PI : 0;
  g.add(mount);

  // The barbette she turns in, its roller path and the training rack.
  cyl(mount, M.steel, 3.5, 3.6, 2.4, 0, -1.2, 0, 24);
  cyl(mount, M.gunDark, 3.62, 3.62, 0.16, 0, 0.04, 0, 28);
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2;
    box(mount, M.gunDark, 0.14, 0.18, 0.18,
      Math.sin(a) * 3.55, 0.04, Math.cos(a) * 3.55, a + Math.PI / 2);
  }

  // The gunhouse.
  loftRings(mount, M.gun, [
    [3.05, 3.85, 0.10, 0.15],
    [3.10, 3.90, 0.10, 0.70],
    [3.05, 3.85, 0.05, 3.05],
    [2.72, 3.50, -0.10, 3.75],
    [2.10, 2.80, -0.20, 4.05],
  ], { px: 0.70, pz: 0.70, n: 24 });

  // The face, raked back over the ports, and the ports themselves.
  const face = box(mount, M.gun, 5.6, 3.3, 0.4, 0, 1.85, 3.35);
  face.rotation.x = -0.24;
  for (const dx of [-1.72, 0, 1.72]) {
    box(mount, M.gunDark, 1.05, 1.15, 0.24, dx, 1.95, 3.62);
  }
  // The rain gutter over the face, and the lifting eyes on the roof.
  box(mount, M.gunDark, 5.5, 0.14, 0.24, 0, 3.42, 3.05);
  for (const dx of [-1.2, 1.2]) box(mount, M.gunDark, 0.16, 0.24, 0.16, dx, 4.18, -0.8);

  // Sighting hoods either side, and the rangefinder blisters at the after
  // corners, which are what tell a Mk 16 from anything else.
  for (const sgn of [-1, 1]) {
    const hood = box(mount, M.gun, 0.95, 0.8, 1.5, sgn * 2.35, 2.9, 1.9);
    hood.rotation.z = sgn * 0.05;
    box(mount, M.glass, 0.34, 0.22, 0.14, sgn * 2.4, 3.0, 2.66);
    box(mount, M.gun, 1.05, 0.16, 1.6, sgn * 2.35, 3.32, 1.9);
    // The rangefinder arm out of the after end of the house.
    tubeX(mount, M.gun, 0.42, 1.5, sgn * 3.4, 2.6, -1.9, 12);
    cyl(mount, M.glass, 0.38, 0.38, 0.1, sgn * 4.1, 2.6, -1.9, 12)
      .rotation.z = Math.PI / 2;
  }

  // The access door in the back of the house, the ladder rungs up its side,
  // and the ready lockers round the barbette.
  box(mount, M.gunDark, 1.1, 2.1, 0.16, 0, 1.4, -3.95);
  for (const dy of [0.7, 1.9]) box(mount, M.steelDark, 0.16, 0.12, 0.12, 0.62, dy, -4.05);
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      box(mount, M.steelDark, 0.14, 0.09, 0.5, sgn * 3.06, 0.7 + i * 0.6, -2.4);
    }
  }

  // Three barrels, in one slide: 47 calibres of six inch is 7.2 m of gun, in a
  // jacket, through a bloomer at the port.
  const arm = new THREE.Group();
  arm.position.set(0, 1.95, 3.2);
  arm.rotation.x = -0.04;
  mount.add(arm);
  for (const dx of [-1.72, 0, 1.72]) {
    cyl(arm, M.canvas, 0.55, 0.62, 0.7, dx, 0, 0.35, 14).rotation.x = Math.PI / 2;
    tubeZ(arm, M.gunDark, 0.30, 2.4, dx, 0, 1.6, 14);       // the jacket
    tubeZ(arm, M.gunDark, 0.165, 7.2, dx, 0, 4.2, 14);      // and the tube
    cyl(arm, M.gunDark, 0.185, 0.20, 0.4, dx, 0, 7.9, 14).rotation.x = Math.PI / 2;
    cyl(arm, M.cave, 0.12, 0.12, 0.12, dx, 0, 8.06, 12).rotation.x = Math.PI / 2;
  }
  return mount;
}

/**
 * A twin 5"/38 in a Mk 32 enclosed mount: the dual-purpose gun that is half
 * the reason a Cleveland was worth building.
 */
function fiveInch(g, x, y, z, ry) {
  const mount = new THREE.Group();
  mount.position.set(x, y, z);
  mount.rotation.y = ry;
  // A twin 5"/38 trains on its own barbette, so the whole gunhouse comes
  // round: the welder leaves it alone and the scene lays it.
  mount.userData.dynamic = true;
  mount.userData.rest = ry;
  g.add(mount);
  cyl(mount, M.steelDark, 2.05, 2.15, 0.7, 0, -0.35, 0, 20);
  cyl(mount, M.gunDark, 2.2, 2.2, 0.14, 0, 0.05, 0, 24);
  loftRings(mount, M.gun, [
    [1.95, 2.35, 0.00, 0.12],
    [1.98, 2.38, 0.00, 0.65],
    [1.95, 2.35, -0.05, 2.05],
    [1.72, 2.12, -0.14, 2.65],
    [1.30, 1.65, -0.22, 2.92],
  ], { px: 0.66, pz: 0.66, n: 22 });
  const face = box(mount, M.gun, 3.5, 2.3, 0.26, 0, 1.35, 2.10);
  face.rotation.x = -0.20;
  for (const dx of [-0.72, 0.72]) box(mount, M.gunDark, 0.9, 0.8, 0.2, dx, 1.4, 2.3);
  box(mount, M.gunDark, 3.4, 0.1, 0.18, 0, 2.42, 1.94);
  for (const sgn of [-1, 1]) {
    box(mount, M.gun, 0.6, 0.58, 0.9, sgn * 1.42, 1.9, 1.1);
    box(mount, M.glass, 0.24, 0.16, 0.1, sgn * 1.42, 1.95, 1.6);
  }
  box(mount, M.gunDark, 1.0, 1.7, 0.14, 0, 1.05, -2.4);
  const arm = new THREE.Group();
  arm.position.set(0, 1.4, 1.95);
  arm.rotation.x = -0.05;
  mount.add(arm);
  for (const dx of [-0.72, 0.72]) {
    cyl(arm, M.canvas, 0.4, 0.46, 0.5, dx, 0, 0.28, 12).rotation.x = Math.PI / 2;
    tubeZ(arm, M.gunDark, 0.2, 1.6, dx, 0, 1.15, 12);
    tubeZ(arm, M.gunDark, 0.125, 4.8, dx, 0, 2.85, 12);
    cyl(arm, M.gunDark, 0.14, 0.15, 0.26, dx, 0, 5.2, 12).rotation.x = Math.PI / 2;
  }
  return mount;
}

/** The splinter tub a light gun stands in: a ring of plate, open at the back. */
function tub(g, r, h, x, y, z, ry, n = 16) {
  const t = new THREE.Group();
  t.position.set(x, y, z);
  t.rotation.y = ry;
  g.add(t);
  for (let i = 0; i < n; i++) {
    const a = -1.35 + (i / (n - 1)) * 4.9;
    box(t, M.steel, 0.13, h, (2 * Math.PI * r) / n + 0.12,
      Math.sin(a) * r, h / 2, Math.cos(a) * r, a + Math.PI / 2);
  }
  cyl(t, M.deckDark, r * 1.03, r * 1.03, 0.14, 0, 0.05, 0, n + 4);
  return t;
}

/** A quadruple 40 mm Bofors, with its own director alongside. */
function quadBofors(g, x, y, z, ry) {
  const t = tub(g, 2.5, 1.25, x, y, z, ry, 18);
  const m = new THREE.Group();
  m.position.y = 0.4;
  m.userData.dynamic = true;
  m.userData.rest = ry;
  t.add(m);
  cyl(m, M.gunDark, 0.66, 0.86, 0.6, 0, 0.3, 0, 14);
  box(m, M.gun, 2.5, 0.8, 1.3, 0, 0.95, -0.15);
  box(m, M.gun, 2.1, 0.5, 0.6, 0, 1.5, -0.5);
  for (const dx of [-0.95, -0.32, 0.32, 0.95]) {
    tubeZ(m, M.gunDark, 0.085, 2.9, dx, 1.25, 1.5, 10);
    cyl(m, M.gunDark, 0.12, 0.12, 0.4, dx, 1.25, 2.9, 10).rotation.x = Math.PI / 2;
    box(m, M.gunDark, 0.2, 0.5, 0.5, dx, 1.55, -0.2);   // the clip loader
  }
  for (const sgn of [-1, 1]) {
    box(m, M.gunDark, 0.4, 0.5, 0.4, sgn * 1.5, 1.15, -0.5);
    box(m, M.steelDark, 0.5, 0.1, 0.5, sgn * 1.5, 0.9, -0.5);
  }
  // The Mk 51 director on the tub rim: a man, a sight and a joystick.
  const d = new THREE.Group();
  d.position.set(1.9, 0.5, -1.4);
  t.add(d);
  cyl(d, M.gunDark, 0.22, 0.3, 0.8, 0, 0.4, 0, 10);
  box(d, M.gun, 0.5, 0.42, 0.6, 0, 0.95, 0);
  box(d, M.glass, 0.2, 0.16, 0.08, 0, 1.0, 0.32);
  // Ready-use lockers round the outside of the tub.
  for (const a of [2.2, 2.8, 3.5, 4.1]) {
    box(g, M.steelDark, 0.6, 0.85, 0.5,
      x + Math.sin(a) * 3.0, y + 0.42, z + Math.cos(a) * 3.0, a);
  }
  return m;
}

/** A twin 40 mm, which is the same gun in a smaller tub. */
function twinBofors(g, x, y, z, ry) {
  const t = tub(g, 1.6, 1.15, x, y, z, ry, 14);
  const m = new THREE.Group();
  m.position.y = 0.35;
  m.userData.dynamic = true;
  m.userData.rest = ry;
  t.add(m);
  cyl(m, M.gunDark, 0.44, 0.58, 0.5, 0, 0.25, 0, 12);
  box(m, M.gun, 1.2, 0.66, 1.05, 0, 0.78, -0.1);
  for (const dx of [-0.3, 0.3]) {
    tubeZ(m, M.gunDark, 0.08, 2.4, dx, 1.05, 1.2, 10);
    cyl(m, M.gunDark, 0.11, 0.11, 0.34, dx, 1.05, 2.3, 10).rotation.x = Math.PI / 2;
  }
  for (const sgn of [-1, 1]) box(m, M.steelDark, 0.44, 0.1, 0.44, sgn * 1.0, 0.55, -0.45);
  return m;
}

/** A single 20 mm Oerlikon on its pedestal, in a small tub. */
function oerlikon(g, x, y, z, ry) {
  const t = tub(g, 1.0, 1.0, x, y, z, ry, 10);
  const o = new THREE.Group();
  o.position.y = 0.3;
  o.userData.dynamic = true;
  o.userData.rest = ry;
  t.add(o);
  cyl(o, M.gunDark, 0.17, 0.24, 0.95, 0, 0.48, 0, 10);
  const g2 = new THREE.Group();
  g2.position.y = 0.98;
  g2.rotation.x = -0.34;
  o.add(g2);
  tubeZ(g2, M.gunDark, 0.058, 1.9, 0, 0, 0.95, 8);
  cyl(g2, M.gunDark, 0.1, 0.1, 0.5, 0, 0, 0.5, 8).rotation.x = Math.PI / 2;
  cyl(g2, M.gunDark, 0.32, 0.32, 0.16, 0, 0.3, -0.05, 12).rotation.z = Math.PI / 2;
  box(g2, M.gun, 0.5, 0.16, 0.5, 0, -0.2, -0.45);
  for (const sgn of [-1, 1]) box(g2, M.gunDark, 0.1, 0.34, 0.1, sgn * 0.22, -0.28, -0.6);
  return o;
}

// -------------------------------------------------------- superstructure --

// Her levels, named once so anything bolted to one can find it.
const FCASTLE = () => deckAt(20);            // the forecastle deck amidships
const L01 = () => FCASTLE() + 3.1;           // the main deckhouse roof
const L02 = () => L01() + 3.0;               // the bridge structure
const L03 = () => L02() + 2.9;               // the navigating bridge
const L04 = () => L03() + 2.6;               // the open bridge

// The superstructure deck runs most of her length, and everything above the
// weather deck stands on it. The stations below are laid out so that no mount
// is inside anything: a twin 5"/38 is five metres of house and seven more of
// gun in front of it, and the waist is only so long.
const BRIDGE_F = 37;                         // the superstructure deck, forward
const BRIDGE_A = -34;                        // and aft
const M51_Z = 32.5;                          // mount 51, on the 01 level
const TOWER = [10, 29.5];                    // the bridge tower on the 01 roof
const FUNNEL_F = 2.0;
const FUNNEL_A = -15.0;
const WAIST_F = 6.0;                         // the forward pair of waist mounts
const WAIST_A = -8.5;                        // and the after pair
const WAIST_X = 6.7;
const AFTWORKS = [-36, -22];                 // the after superstructure, tier 2
// The aviation arrangements, right aft: two catapults on the quarterdeck with
// the crane between them and the hangar under it.
const CAT_Z = -70;                           // where the turntables stand
const CAT_X = 5.9;                           // and how far off the centreline
// The girder, in the turntable's own frame. The pivot is near its after end,
// not in the middle of it: a catapult swings its muzzle out over the water and
// hardly moves its breech, which is the only way it can train out at all
// without the after end of it sweeping across her quarterdeck.
const CAT_BACK = -5.0;
const CAT_FRONT = 14.0;
const CAT_A = CAT_BACK + 1.6;                // the car, at rest at the breech
const CAT_STROKE = 17.0;                     // how much track she has ahead
const CAT_REST = 0.10;                       // trained fore and aft
const CAT_OUT = 1.16;                        // and trained out to shoot
const PLANE_Y = 1.95;                        // the aeroplane, on her cradle
const PLANE_Z = 0.2;
// How long the simulation gives the whole evolution. The model is paced to it,
// so the aeroplane leaves the track on the tick her flight goes on the plot.
const DECK_RUN = SHIP_CLASSES.cleveland.planes.deckRun;
const M52_Z = -27.0;                         // mount 52, on its roof

/** A deck plate cut to a house's plan, with an edge to it you can see. */
function plate(g, pts, y, t = 0.16) {
  return loftShape(g, M.deckDark, [{ pts, y: y - t }, { pts, y }], { floor: true });
}

/**
 * Splinter plating round the edge of a platform, left open across the back
 * where the ladder comes up.
 */
function screen(g, pts, y, h) {
  let zmin = Infinity;
  for (const [, z] of pts) zmin = Math.min(zmin, z);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.06) continue;
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    if (mz < zmin + 0.05 && Math.abs(mx) < 1.7) continue;
    const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
    box(g, M.steel, 0.15, h, len + 0.08, mx, y + h / 2, mz, ry);
    box(g, M.steelDark, 0.38, 0.12, len + 0.08, mx, y + h + 0.06, mz, ry);
  }
}

/**
 * The forward superstructure: a tower, which is what makes her look like a
 * cruiser and not a big destroyer.
 *
 * Deck on deck it goes: the long deckhouse on the forecastle, the 01 with the
 * boat deck round it, the bridge structure, the navigating bridge with its
 * windows, the open bridge above that, and the Mk 34 director with its Mk 8
 * radar on top of the lot.
 */
function bridge(g) {
  const base = FCASTLE();
  // The superstructure deck: one long deckhouse on the weather deck, running
  // from abaft turret 2 to abreast the after turrets. Everything above her
  // weather deck stands on its roof. The deck under her has sheer, so her
  // sides are carried down past the lowest point of it: the surplus is buried
  // inside the hull, and there is no daylight anywhere along her foot.
  const sole = deckAt(BRIDGE_A) - 1.2;
  loftRings(g, M.steel, [
    [8.1, (BRIDGE_F - BRIDGE_A) / 2, (BRIDGE_F + BRIDGE_A) / 2, sole],
    [8.1, (BRIDGE_F - BRIDGE_A) / 2, (BRIDGE_F + BRIDGE_A) / 2, L01()],
  ]);
  box(g, M.deckDark, 16.4, 0.14, BRIDGE_F - BRIDGE_A - 0.8, 0, L01() + 0.07,
    (BRIDGE_F + BRIDGE_A) / 2);
  // Above the 01 roof she is not a stack of boxes. Every level is a bullnose
  // forward carried round on to straight sides and closed by a square back,
  // each set back from the one below it, with the armoured conning tower
  // standing in the middle of the bridge front and the pilothouse windows
  // wrapped round it. That shape is what makes a Cleveland's bridge her own.
  const ARC = 9;
  const plan = (hw, zBack, zFront, nose) =>
    planHouse({ hw, zBack, zFront, nose, arc: ARC });

  // 02: the bridge structure on the 01 roof, tumbling home as it rises, with
  // the pilothouse deck laid over it and a walkway all round its front.
  loftShape(g, M.steel, [
    { pts: plan(5.90, TOWER[0], TOWER[1], 5.30), y: L01() },
    { pts: plan(5.76, TOWER[0], TOWER[1] - 0.18, 5.20), y: L02() - 1.1 },
    { pts: plan(5.58, TOWER[0], TOWER[1] - 0.40, 5.05), y: L02() },
  ]);
  const d02 = plan(5.72, TOWER[0], TOWER[1] - 0.26, 5.16);
  plate(g, d02, L02() + 0.14);
  screen(g, d02, L02() + 0.14, 1.02);

  // 03: the pilothouse. Her front plating flares out from the deck to the
  // sill, the window band above it stands vertical, and the roof overhangs it
  // as an eyebrow -- which is the whole reason a bridge front reads as a
  // bridge front and not as a box.
  const PH_A = 13.0;
  const PH_F = 27.4;
  const ph = (hw, nose) => plan(hw, PH_A, PH_F, nose);
  loftShape(g, M.steel, [
    { pts: ph(4.30, 4.10), y: L02() + 0.14 },
    { pts: ph(4.70, 4.50), y: L02() + 1.05 },
    { pts: ph(4.70, 4.50), y: L02() + 2.55 },
    { pts: ph(4.60, 4.40), y: L03() },
  ]);
  plate(g, plan(5.05, PH_A, PH_F + 0.42, 4.86), L03() + 0.16);

  // The windows, laid along the pilothouse plan so they follow the bullnose
  // instead of being strung across a flat face.
  const wall = ph(4.74, 4.54);
  for (let i = 0; i < wall.length; i++) {
    const a = wall[i];
    const b = wall[(i + 1) % wall.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    if (len < 0.1 || mz < PH_A + 3.4) continue;
    const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
    box(g, M.glass, 0.1, 1.25, len * 0.9, mx, L02() + 1.82, mz, ry);
    box(g, M.steelDark, 0.16, 0.13, len + 0.06, mx, L02() + 2.5, mz, ry);
    box(g, M.steelDark, 0.16, 0.13, len + 0.06, mx, L02() + 1.12, mz, ry);
  }

  // 04: sky control, and the open bridge on its roof inside splinter plating.
  loftShape(g, M.steel, [
    { pts: plan(3.80, 16.0, 26.2, 3.70), y: L03() + 0.16 },
    { pts: plan(3.70, 16.0, 26.0, 3.60), y: L04() },
  ]);
  const d04 = plan(4.00, 15.8, 26.4, 3.86);
  plate(g, d04, L04() + 0.14);
  screen(g, d04, L04() + 0.14, 1.24);

  // The armoured conning tower: five inches of plate standing right through
  // the bridge, its face proud of the pilothouse front with the sight slit in
  // line with the windows, and a lookout platform on top of it.
  const CT_Z = 26.2;
  cyl(g, M.steel, 2.62, 2.86, L03() - L01(), 0, (L01() + L03()) / 2, CT_Z, 22);
  cyl(g, M.gunDark, 2.74, 2.74, 0.4, 0, L02() + 1.75, CT_Z, 22);
  cyl(g, M.steel, 2.5, 2.62, 0.5, 0, L02() + 2.2, CT_Z, 22);
  cyl(g, M.deckDark, 2.92, 2.92, 0.16, 0, L03() + 0.16, CT_Z, 22);
  for (let i = 0; i < 12; i++) {
    const a = -1.5 + (i / 11) * 3.0;
    const rx = Math.sin(a) * 2.86;
    const rz = CT_Z + Math.cos(a) * 2.86;
    cyl(g, M.steelDark, 0.05, 0.05, 1.0, rx, L03() + 0.7, rz, 6);
  }
  for (const rr of [0.62, 1.06]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.86, 0.05, 5, 26,
      Math.PI * 1.06), M.steelDark);
    ring.position.set(0, L03() + rr, CT_Z);
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = -Math.PI * 0.53;
    g.add(ring);
  }

  // Doors and portholes down the deckhouse sides, and ladders between decks.
  for (const sgn of [-1, 1]) {
    for (const dz of [-26, -12, 13, 24, 33]) {
      box(g, M.gunDark, 0.16, 2.0, 1.0, sgn * 8.2, deckAt(dz) + 1.05, dz);
    }
    for (const dz of [-30, -20, -3, 8, 21, 28, 35]) {
      cyl(g, M.glass, 0.22, 0.22, 0.1, sgn * 8.16, deckAt(dz) + 2.0, dz, 10)
        .rotation.z = Math.PI / 2;
      cyl(g, M.steelDark, 0.28, 0.28, 0.07, sgn * 8.13, deckAt(dz) + 2.0, dz, 10)
        .rotation.z = Math.PI / 2;
    }
    for (const dz of [12.6, 21.0]) {
      box(g, M.gunDark, 0.16, 1.9, 0.95, sgn * 5.6, L01() + 1.0, dz);
    }
    ladder(g, M.steelDark, sgn * 6.6, deckAt(35.9) + 0.1, L01(), 34.4, 37.4);
    ladder(g, M.steelDark, sgn * 4.9, L01() + 0.1, L02(), 10.6, 13.8);
    ladder(g, M.steelDark, sgn * 3.6, L02() + 0.2, L03(), 13.4, 16.2);
    ladder(g, M.steelDark, sgn * 2.6, L03() + 0.24, L04(), 16.4, 19.0);
  }

  // The open bridge itself: the pelorus on the centreline, the target
  // designation transmitters either side of it, and the wings out beyond.
  cyl(g, M.gunDark, 0.2, 0.24, 1.3, 0, L04() + 0.8, 23.4, 10);
  box(g, M.gunDark, 0.66, 0.24, 0.66, 0, L04() + 1.5, 23.4);
  for (const sgn of [-1, 1]) {
    cyl(g, M.gunDark, 0.3, 0.36, 1.05, sgn * 1.9, L04() + 0.66, 22.6, 10);
    box(g, M.gun, 0.55, 0.5, 0.42, sgn * 1.9, L04() + 1.4, 22.6);
    // The wings, on their brackets, with a signal lamp and a repeater on each.
    box(g, M.deckDark, 3.2, 0.16, 3.6, sgn * 5.2, L04() + 0.14, 20.6);
    for (const bz of [19.1, 22.1]) {
      const br = box(g, M.steel, 3.0, 0.18, 0.24, sgn * 5.2, L04() - 0.5, bz);
      br.rotation.z = sgn * 0.4;
    }
    box(g, M.steel, 0.16, 1.24, 3.6, sgn * 6.72, L04() + 0.76, 20.6);
    box(g, M.steelDark, 0.42, 0.12, 3.6, sgn * 6.68, L04() + 1.44, 20.6);
    box(g, M.steel, 3.2, 1.24, 0.16, sgn * 5.2, L04() + 0.76, 18.86);
    cyl(g, M.gunDark, 0.3, 0.3, 0.5, sgn * 6.48, L04() + 0.9, 21.8, 10);
    box(g, M.glass, 0.36, 0.36, 0.07, sgn * 6.48, L04() + 0.9, 22.08);
  }

  // The two forward Mk 37s, abreast the tower one level down from the main
  // director, which is where a Cleveland carries them.
  for (const sgn of [-1, 1]) {
    mk37(g, sgn * 3.4, L03() + 1.4, 14.0, sgn * 0.22);
  }

  // The Mk 34 main battery director on its barbette, with the Mk 8 fire
  // control radar -- the flat rectangular aerial -- on the roof of it.
  const dirY = L04() + 0.7;
  cyl(g, M.steel, 1.9, 2.1, 1.8, 0, dirY + 0.9, 18.0, 20);
  const dir = new THREE.Group();
  dir.position.set(0, dirY + 1.8, 18.0);
  g.add(dir);
  cyl(dir, M.steelDark, 1.85, 1.9, 0.34, 0, 0.17, 0, 20);
  loftRings(dir, M.gun, [
    [1.85, 2.05, 0, 0.34],
    [1.9, 2.1, 0, 0.85],
    [1.85, 2.05, 0, 2.5],
    [1.5, 1.7, -0.06, 2.95],
  ], { px: 0.66, pz: 0.66, n: 20 });
  const dface = box(dir, M.gun, 3.2, 1.9, 0.26, 0, 1.6, 1.95);
  dface.rotation.x = -0.12;
  for (const sgn of [-1, 1]) {
    tubeX(dir, M.gun, 0.36, 2.4, sgn * 2.9, 1.75, 0.1, 12);
    cyl(dir, M.glass, 0.34, 0.34, 0.1, sgn * 4.1, 1.75, 0.1, 12)
      .rotation.z = Math.PI / 2;
    box(dir, M.gunDark, 0.6, 0.4, 0.9, sgn * 1.3, 2.2, 1.5);
  }
  // Mk 8: a flat slotted array, not a bedspring. It is the aerial that made
  // American cruiser gunnery what it was after 1943.
  const mk8 = new THREE.Group();
  mk8.position.set(0, 3.5, 0.2);
  dir.add(mk8);
  box(mk8, M.steelDark, 4.6, 1.5, 0.22, 0, 0, 0);
  box(mk8, M.gunDark, 4.7, 0.14, 0.3, 0, 0.82, 0);
  box(mk8, M.gunDark, 4.7, 0.14, 0.3, 0, -0.82, 0);
  for (let i = 0; i < 11; i++) {
    box(mk8, M.gunDark, 0.06, 1.3, 0.06, -2.0 + (i / 10) * 4.0, 0, 0.16);
  }
  cyl(dir, M.steelDark, 0.2, 0.24, 0.9, 0, 3.0, 0.2, 8);
  return dir;
}

/**
 * A Mk 37 director: the tub the five-inch battery is aimed from, with its
 * rangefinder arms out either side and the Mk 12/22 aerials on the roof.
 */
function mk37(g, x, y, z, ry) {
  const d = new THREE.Group();
  d.position.set(x, y, z);
  d.rotation.y = ry;
  g.add(d);
  cyl(d, M.steel, 1.55, 1.75, 1.3, 0, -0.65, 0, 18);
  cyl(d, M.steelDark, 1.5, 1.55, 0.28, 0, 0.14, 0, 18);
  loftRings(d, M.gun, [
    [1.5, 1.7, 0, 0.28],
    [1.55, 1.75, 0, 0.72],
    [1.5, 1.7, 0, 2.05],
    [1.22, 1.4, -0.06, 2.45],
  ], { px: 0.64, pz: 0.64, n: 18 });
  const f = box(d, M.gun, 2.6, 1.6, 0.24, 0, 1.3, 1.6);
  f.rotation.x = -0.13;
  for (const sgn of [-1, 1]) {
    tubeX(d, M.gun, 0.3, 1.9, sgn * 2.3, 1.45, 0.1, 12);
    cyl(d, M.glass, 0.28, 0.28, 0.09, sgn * 3.25, 1.45, 0.1, 12)
      .rotation.z = Math.PI / 2;
  }
  // Mk 12 dish and the Mk 22 "orange peel" beside it, which is the pair every
  // American director wore after 1943.
  cyl(d, M.steelDark, 0.16, 0.2, 0.7, 0, 2.75, 0.1, 8);
  const mk12 = new THREE.Group();
  mk12.position.set(0, 3.2, 0.15);
  d.add(mk12);
  for (const yy of [-0.6, 0.6]) box(mk12, M.steelDark, 2.6, 0.12, 0.16, 0, yy, 0);
  for (let i = 0; i < 7; i++) {
    box(mk12, M.steelDark, 0.07, 1.2, 0.07, -0.9 + (i / 6) * 1.8, 0, 0);
  }
  const peel = cyl(d, M.steelDark, 0.34, 0.34, 1.5, 1.55, 3.2, 0.15, 12);
  peel.scale.set(1, 1, 0.3);
  peel.rotation.x = Math.PI / 2;
  return d;
}

/**
 * Two raked funnels, and the boat deck between them.
 *
 * A Cleveland's funnels are oval in plan, longer fore and aft than they are
 * across, and they are set well apart with the waist five-inch mounts and the
 * boats between them.
 */
function funnels(g) {
  const stacks = [[FUNNEL_F, 2.15, 2.5, 12.6, 1.3], [FUNNEL_A, 2.0, 2.35, 11.8, 1.28]];
  for (const [z, rt, rb, h, fa] of stacks) {
    const y0 = L01() + 0.15;
    const f = new THREE.Group();
    f.position.set(0, y0, z);
    f.rotation.x = -0.11;
    g.add(f);
    const s = cyl(f, M.steel, rt, rb, h, 0, h / 2, 0, 22);
    s.scale.set(1, 1, fa);
    const cap = cyl(f, M.gunDark, rt * 1.1, rt * 1.05, 0.5, 0, h + 0.12, 0, 22);
    cap.scale.set(1, 1, fa);
    const inner = cyl(f, M.cave, rt * 0.84, rt * 0.84, 0.34, 0, h + 0.26, 0, 20);
    inner.scale.set(1, 1, fa);
    for (const sgn of [-1, 1]) {
      cyl(f, M.steelDark, 0.17, 0.17, h * 0.9, sgn * rb * 0.62, h * 0.5, -rb * fa * 0.7, 8);
    }
    for (let i = 0; i < 9; i++) {
      box(f, M.steelDark, 0.55, 0.07, 0.07, S * rb * 0.72, 1.4 + i * 1.2, -rb * fa * 0.32);
    }
    cyl(f, M.steelDark, rb * 1.14, rb * 1.26, 0.7, 0, -0.3, 0, 22).scale.set(1, 1, fa);
  }
  // The uptake casing each funnel rises out of, standing on the 01 roof.
  for (const cz of [FUNNEL_F, FUNNEL_A]) {
    box(g, M.steel, 8.2, 1.5, 8.0, 0, L01() + 0.75, cz);
    box(g, M.deckDark, 8.5, 0.16, 8.0, 0, L01() + 1.5, cz);
  }
  // Ventilator cowls along the weather deck outboard of the deckhouse, turned
  // to the wind, and well clear of the waist mounts on the deck above.
  for (const [vz, sgn] of [[26, -1], [26, 1], [-1, -1], [-1, 1], [-20, -1], [-20, 1]]) {
    const v = new THREE.Group();
    v.position.set(sgn * (halfDeck(vz) - 1.5), deckAt(vz) + 0.1, vz);
    g.add(v);
    cyl(v, M.steel, 0.42, 0.5, 2.4, 0, 1.2, 0, 12);
    const bell = cyl(v, M.steel, 0.78, 0.44, 1.0, 0, 2.6, 0.3, 14);
    bell.rotation.x = -1.1;
    cyl(v, M.cave, 0.62, 0.62, 0.12, 0, 2.88, 0.78, 14).rotation.x = -1.1;
  }
}

/**
 * The after superstructure: the secondary director, the mainmast, and the
 * house that turret 3's barbette rises through.
 */
function afterWorks(g) {
  const [z0, z1] = AFTWORKS;
  // Tier 2, on the superstructure deck: mount 52 stands on its roof.
  loftRings(g, M.steel, [
    [6.0, (z1 - z0) / 2, (z0 + z1) / 2, L01()],
    [6.0, (z1 - z0) / 2, (z0 + z1) / 2, L01() + 2.9],
  ]);
  box(g, M.deckDark, 12.2, 0.14, z1 - z0 - 0.6, 0, L01() + 2.97, (z0 + z1) / 2);
  // Tier 3, forward of mount 52, carrying the after director.
  loftRings(g, M.steel, [
    [4.0, 3.0, -20.5, L01() + 2.9],
    [4.0, 3.0, -20.5, L01() + 5.6],
  ]);
  box(g, M.deckDark, 8.2, 0.14, 6.2, 0, L01() + 5.67, -20.5);
  for (const sgn of [-1, 1]) {
    ladder(g, M.steelDark, sgn * 5.2, L01() + 0.1, L01() + 2.9, -32.8, -35.8);
  }
  // The after Mk 34 director, which can fight the after turrets on her own.
  const dirY = L01() + 5.6;
  cyl(g, M.steel, 1.7, 1.9, 1.5, 0, dirY + 0.75, -20.5, 18);
  const dir = new THREE.Group();
  dir.position.set(0, dirY + 1.5, -20.5);
  dir.rotation.y = Math.PI;
  g.add(dir);
  cyl(dir, M.steelDark, 1.65, 1.7, 0.3, 0, 0.15, 0, 18);
  loftRings(dir, M.gun, [
    [1.65, 1.85, 0, 0.3],
    [1.7, 1.9, 0, 0.78],
    [1.65, 1.85, 0, 2.2],
    [1.35, 1.5, -0.06, 2.6],
  ], { px: 0.66, pz: 0.66, n: 18 });
  const dface = box(dir, M.gun, 2.9, 1.7, 0.24, 0, 1.4, 1.75);
  dface.rotation.x = -0.12;
  for (const sgn of [-1, 1]) {
    tubeX(dir, M.gun, 0.32, 2.1, sgn * 2.6, 1.55, 0.1, 12);
    cyl(dir, M.glass, 0.3, 0.3, 0.1, sgn * 3.65, 1.55, 0.1, 12).rotation.z = Math.PI / 2;
  }
  // And the after pair of Mk 37s, abreast tier 3.
  for (const sgn of [-1, 1]) {
    mk37(g, sgn * 5.0, L01() + 3.1, -20.5, Math.PI - sgn * 0.22);
  }
  const mk8 = new THREE.Group();
  mk8.position.set(0, 3.1, 0.2);
  dir.add(mk8);
  box(mk8, M.steelDark, 4.0, 1.3, 0.2, 0, 0, 0);
  for (const yy of [-0.72, 0.72]) box(mk8, M.gunDark, 4.1, 0.12, 0.28, 0, yy, 0);
  cyl(dir, M.steelDark, 0.18, 0.22, 0.8, 0, 2.65, 0.2, 8);
}

/**
 * Foremast and mainmast: tripods, because a cruiser's aerials are heavy and a
 * pole would whip.
 */
function masts(g) {
  // Foremast, stepped on the 02 level abaft the bridge, with the SK air search
  // aerial -- the bedspring -- and SG surface search on a platform below it.
  const fBase = L02();
  const fTop = fBase + 13.0;
  const FZ = 11.5;
  for (const [lx, lz] of [[0, 2.6], [-2.5, -2.0], [2.5, -2.0]]) {
    const a = new THREE.Vector3(lx, fBase, FZ + lz);
    const b = new THREE.Vector3(0, fTop, FZ);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const leg = cyl(g, M.steel, 0.2, 0.28, a.distanceTo(b), mid.x, mid.y, mid.z, 8);
    leg.rotation.z = Math.atan2(b.x - a.x, b.y - a.y) * -1;
    leg.rotation.x = Math.atan2(b.z - a.z, b.y - a.y);
  }
  cyl(g, M.steel, 0.1, 0.18, 8.0, 0, fTop + 3.9, FZ, 8);
  box(g, M.steel, 9.0, 0.14, 0.14, 0, fTop + 1.6, FZ);
  for (const sgn of [-1, 1]) {
    box(g, M.wire, 0.05, 3.4, 0.05, sgn * 3.4, fTop - 0.1, FZ);
    for (let i = 0; i < 3; i++) {
      box(g, mat([0xb0392f, 0xd8b452, 0x2f5c92][i]), 0.62, 0.46, 0.06,
        sgn * 3.4, fTop + 0.9 - i * 0.62, FZ);
    }
  }
  // The SG platform, and its dish.
  const plat = new THREE.Group();
  plat.position.set(0, fTop - 1.2, FZ);
  g.add(plat);
  cyl(plat, M.deckDark, 1.5, 1.5, 0.12, 0, 0, 0, 14);
  cyl(plat, M.steelDark, 0.18, 0.22, 1.2, 0, 0.55, 0.25, 8);
  const sg = new THREE.Group();
  sg.position.set(0, 1.15, 0.25);
  plat.add(sg);
  for (let i = 0; i < 11; i++) {
    const a = -0.95 + (i / 10) * 1.9;
    box(sg, M.bright, 0.12, 1.5, 0.12, Math.sin(a) * 1.15, 0, Math.cos(a) * 1.15 - 0.8, a);
  }
  box(sg, M.steelDark, 0.2, 0.2, 0.85, 0, 0, -0.25);
  // SK: the six-metre mattress at the masthead.
  const sk = new THREE.Group();
  sk.position.set(0, fTop + 6.6, FZ);
  g.add(sk);
  for (const yy of [-1.9, 1.9]) box(sk, M.steelDark, 6.0, 0.16, 0.16, 0, yy, 0);
  box(sk, M.steelDark, 0.16, 3.9, 0.16, 0, 0, 0);
  for (let i = 0; i < 11; i++) {
    const x = -2.7 + (i / 10) * 5.4;
    box(sk, M.steelDark, 0.09, 3.7, 0.09, x, 0, 0);
    for (const yy of [-1.2, 0, 1.2]) tubeZ(sk, M.bright, 0.05, 0.42, x, yy, 0.25, 6);
  }

  // Mainmast, on the after superstructure, carrying the after aerials.
  const mBase = L01();
  const mTop = mBase + 11.5;
  const MZ = -13.0;
  for (const [lx, lz] of [[0, -2.4], [-2.3, 1.9], [2.3, 1.9]]) {
    const a = new THREE.Vector3(lx, mBase, MZ + lz);
    const b = new THREE.Vector3(0, mTop, MZ);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const leg = cyl(g, M.steel, 0.17, 0.24, a.distanceTo(b), mid.x, mid.y, mid.z, 8);
    leg.rotation.z = Math.atan2(b.x - a.x, b.y - a.y) * -1;
    leg.rotation.x = Math.atan2(b.z - a.z, b.y - a.y);
  }
  cyl(g, M.steel, 0.09, 0.15, 6.0, 0, mTop + 2.9, MZ, 8);
  box(g, M.steel, 7.0, 0.12, 0.12, 0, mTop + 1.2, MZ);
  // Aerial wires, from each masthead to something they can be made fast to.
  // Aerial wires, from each masthead to something they can be made fast to.
  // They are strung outboard of the centreline so they do not run through the
  // turrets and the mounts, which are all on it.
  const spans = [
    [fTop + 5.0, FZ, mTop + 1.2, MZ, 4.2],
    [mTop + 1.2, MZ, L01() + 1.2, -40.0, 4.6],
    [fTop + 5.0, FZ, L01() + 1.2, 34.0, 4.6],
  ];
  for (const [ay, az, by, bz, spread] of spans) {
    for (const sgn of [-1, 1]) {
      const a = new THREE.Vector3(sgn * 1.4, ay, az);
      const b = new THREE.Vector3(sgn * spread, by, bz);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const w = box(g, M.wire, 0.05, 0.05, a.distanceTo(b), mid.x, mid.y, mid.z);
      w.lookAt(b);
    }
  }
}

// ------------------------------------------------------- deck furnishings --

/**
 * One of her float planes: a Seahawk on its single central float, wings out,
 * sitting on a catapult car.
 */
function seaPlane(g, x, y, z, ry) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  // Fuselage, upper and lower, so she is not a silhouette from any angle.
  loftRings(p, M.planeTop, [
    [0.5, 4.2, 0, 1.05],
    [0.62, 4.4, 0, 1.5],
    [0.5, 4.2, -0.2, 2.0],
  ], { px: 0.6, pz: 0.7, n: 12 });
  box(p, M.planeLow, 1.0, 0.7, 8.0, 0, 0.75, 0);
  // Wing, tailplane and fin.
  box(p, M.planeTop, 11.6, 0.32, 2.1, 0, 1.72, 0.5);
  box(p, M.planeLow, 11.4, 0.26, 2.0, 0, 1.5, 0.5);
  box(p, M.planeTop, 4.2, 0.24, 1.2, 0, 1.15, -3.6);
  box(p, M.planeTop, 0.22, 1.9, 1.4, 0, 1.9, -3.9);
  // Cockpit, engine and propeller.
  box(p, M.glass, 0.86, 0.6, 2.4, 0, 2.0, 0.9);
  cyl(p, M.gunDark, 0.62, 0.66, 1.2, 0, 1.35, 4.2, 14).rotation.x = Math.PI / 2;
  cyl(p, M.gunDark, 0.14, 0.14, 0.3, 0, 1.35, 4.9, 10).rotation.x = Math.PI / 2;
  // The airscrew as its own group, so it can be wound up on the cradle.
  const prop = new THREE.Group();
  prop.position.set(0, 1.35, 4.95);
  prop.userData.dynamic = true;
  p.add(prop);
  for (const a of [0, 2.09, 4.19]) {
    const bl = box(prop, M.gunDark, 0.22, 3.2, 0.08, 0, 0, 0);
    bl.rotation.z = a;
  }
  p.userData.prop = prop;
  // The float she lands on, on its struts.
  box(p, M.planeLow, 1.1, 0.85, 8.2, 0, -0.35, 0.2);
  box(p, M.planeLow, 0.8, 0.5, 1.4, 0, 0.05, 4.2);
  for (const [sx, sz] of [[0.8, 2.2], [-0.8, 2.2], [0.8, -1.6], [-0.8, -1.6]]) {
    const st = box(p, M.steelDark, 0.12, 1.3, 0.12, sx, 0.5, sz);
    st.rotation.z = sx > 0 ? 0.5 : -0.5;
  }
  for (const sgn of [-1, 1]) {
    box(p, M.planeLow, 0.5, 0.5, 1.9, sgn * 4.3, 1.35, 0.6);
    box(p, M.steelDark, 0.1, 0.9, 0.1, sgn * 4.3, 1.55, 0.6);
  }
  return p;
}

/**
 * Her aviation: two catapults on the quarterdeck, the crane on the centreline
 * abaft them, and the aircraft themselves.
 *
 * This is the after end of a Cleveland. Take it away and she is a gunboat with
 * a very long stern.
 */
function aviation(g) {
  const qd = deckAt(CAT_Z);
  const cats = [];
  for (const sgn of [-1, 1]) {
    const cat = new THREE.Group();
    cat.position.set(sgn * CAT_X, qd, CAT_Z);
    cat.rotation.y = sgn * CAT_REST;
    // She trains, so the welder leaves her and everything under her alone.
    cat.userData.dynamic = true;
    g.add(cat);
    // The turntable the catapult trains on, and the girder itself.
    const len = CAT_FRONT - CAT_BACK;
    const mid = (CAT_FRONT + CAT_BACK) / 2;
    cyl(cat, M.steelDark, 2.0, 2.2, 0.6, 0, 0.3, 0, 18);
    for (const rail of [-0.75, 0.75]) {
      box(cat, M.steel, 0.3, 0.5, len, rail, 1.05, mid);
      box(cat, M.steelDark, 0.36, 0.14, len, rail, 1.36, mid);
    }
    for (let i = 0; i < 10; i++) {
      box(cat, M.steel, 1.8, 0.24, 0.3, 0, 0.75, CAT_BACK + 0.9 + i * 1.95);
    }
    // Trusswork under the girder forward, where it is carried out over the
    // side with nothing under it but the sea.
    for (let i = 0; i < 6; i++) {
      const br = box(cat, M.steel, 0.16, 0.14, 2.4, 0, 0.55, CAT_BACK + 6.4 + i * 1.9);
      br.rotation.x = i % 2 ? 0.6 : -0.6;
    }
    // The powder charge house at the after end: the catapult is a gun, and
    // this is its breech.
    box(cat, M.steel, 2.2, 1.3, 2.6, 0, 1.3, CAT_BACK + 0.6);
    box(cat, M.steelDark, 1.1, 0.9, 1.1, 0, 2.1, CAT_BACK + 0.6);
    // The car she is bolted to, which is the thing that actually moves.
    const car = new THREE.Group();
    car.position.set(0, 0, CAT_A);
    car.userData.dynamic = true;
    cat.add(car);
    box(car, M.steelDark, 1.9, 0.4, 1.9, 0, 1.75, 0);
    box(car, M.steel, 2.0, 0.24, 0.5, 0, 1.5, -0.9);
    const plane = seaPlane(car, 0, 1.95, 0.2, 0);
    cats.push({ group: cat, car, plane, prop: plane.userData.prop, sgn });
  }
  g.userData.catapults = cats;
  // The aircraft crane on the centreline, with its jib stowed fore and aft.
  const cr = new THREE.Group();
  cr.position.set(0, qd, -86.0);
  g.add(cr);
  cyl(cr, M.steel, 1.15, 1.35, 4.2, 0, 2.1, 0, 16);
  cyl(cr, M.steelDark, 1.5, 1.5, 0.3, 0, 0.15, 0, 18);
  const jib = new THREE.Group();
  jib.position.set(0, 4.1, 0);
  jib.rotation.x = -0.12;
  cr.add(jib);
  for (const sgn of [-1, 1]) {
    for (const dx of [-0.45, 0.45]) {
      box(jib, M.steel, 0.16, 0.16, 15.0, dx, sgn * 0.42, 7.2);
    }
  }
  for (let i = 0; i < 9; i++) {
    box(jib, M.steel, 1.0, 0.1, 0.1, 0, 0, 0.8 + i * 1.7);
    box(jib, M.steel, 0.1, 0.9, 0.1, 0.45, 0, 0.8 + i * 1.7);
    box(jib, M.steel, 0.1, 0.9, 0.1, -0.45, 0, 0.8 + i * 1.7);
  }
  box(jib, M.wire, 0.05, 2.6, 0.05, 0, -1.4, 14.2);
  box(jib, M.gunDark, 0.5, 0.4, 0.5, 0, -2.7, 14.2);
  // Her other two aircraft are struck down in the hangar under the quarterdeck,
  // which is what the doors in her transom are for.
  // The recovery mat, stowed against the bulwark.
  box(g, M.canvas, 5.0, 0.14, 9.0, S * 6.4, qd + 0.1, -66);
}

/**
 * Her launch, from the order to the aeroplane leaving the end of the track.
 *
 * A cruiser does not have a deck to run down: the catapult trains out on its
 * turntable until it is pointing off the quarter, the pilot winds the engine
 * right up against the holdback, and then a powder charge throws the whole
 * cradle down eighteen metres of girder. The whole thing is played on the same
 * clock the simulation launches on, so what the eye sees leave the ship and
 * what the plot says is in the air are the same event.
 */
const TRAIN = 3.4;                     // trained out and pointing off the bow
const RUNUP = 5.0;                     // engine wound up, waiting for the flag
const HOME = 4.0;                      // and trained back in afterwards

function stepCatapults(deck, t) {
  const pr = deck.profile;
  const shot = pr.rows.length * pr.dt;
  // Paced so the aeroplane leaves the track at exactly the moment the
  // simulation puts her squadron up, however long the integrated shot takes.
  const pace = (RUNUP + shot) / deck.run;
  const run = deck.launchAt === null ? -1 : (t - deck.launchAt) * pace;
  // Both catapults train out on the order and both come back in afterwards --
  // she is flying off aircraft, and that is a quarterdeck evolution, not one
  // man's job on one girder.
  let out = 0;
  if (run >= 0) {
    if (run < TRAIN) out = smooth(run / TRAIN);
    else if (run < RUNUP + shot) out = 1;
    else out = 1 - smooth((run - RUNUP - shot) / HOME);
  }
  for (const c of deck.cats) {
    c.group.rotation.y = c.sgn * (CAT_REST + (CAT_OUT - CAT_REST) * out);
    if (deck.live !== c || run < 0) {
      // Sitting on her cradle with the engine ticking over, waiting her turn.
      c.car.position.z = CAT_A;
      if (!c.gone) {
        c.plane.position.set(0, PLANE_Y, PLANE_Z);
        c.plane.rotation.set(0, 0, 0);
        if (c.prop) c.prop.rotation.z += 0.04;
      }
      continue;
    }
    let along = CAT_A;
    let y = 0;
    let pitch = 0;
    let turning = 30;
    if (run < TRAIN) {
      // Trained out on the turntable, engine coming up as she goes round.
      turning = 3 + 14 * out;
    } else if (run < RUNUP) {
      // Held on the holdback with the engine wound right up: she shakes.
      pitch = 0.005 * Math.sin((run - TRAIN) * 26);
    } else if (run < RUNUP + shot) {
      // The shot itself, read off the integrated profile.
      turning = 34;
      const i = Math.min(pr.rows.length - 1,
        Math.max(0, Math.round((run - RUNUP) / pr.dt)));
      const [s2, h, th] = pr.rows[i];
      along = CAT_A + s2;
      y = h;
      pitch = -th;
      // Off the end of the girder and climbing away. She is handed over at the
      // end of the profile, which the pacing above puts on the same tick the
      // simulation puts her flight on the plot.
      if (s2 > CAT_STROKE + 34 && run >= RUNUP + shot - pr.dt) {
        deck.airborne = true;
        c.gone = true;
      }
    } else {
      // Gone. A frame can step clean over the last row of the profile, so the
      // hand-over is latched here as well: past the end of the shot she is
      // away, whether or not a frame landed on the moment she left the track.
      deck.airborne = true;
      c.gone = true;
      turning = 0;
    }
    c.car.position.z = Math.min(CAT_A + CAT_STROKE, along);
    if (!c.gone) {
      // Past the end of the girder there is no car under her: she carries on
      // along the line of the track on her own.
      c.plane.position.set(0, PLANE_Y + y,
        PLANE_Z + Math.max(0, along - (CAT_A + CAT_STROKE)));
      c.plane.rotation.set(pitch, 0, 0);
      if (c.prop) c.prop.rotation.z += turning * 0.05;
    }
  }
}

/** Boats: two motor launches and two whaleboats, on davits on the boat deck. */
function boats(g) {
  const deckY = L01();
  const boat = (x, z, len, sgn) => {
    const hull = new THREE.Group();
    hull.position.set(x, deckY + 2.2, z);
    hull.rotation.z = sgn * 0.04;
    g.add(hull);
    const N = 11;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= N; i++) {
      const u = (i / N) * 2 - 1;
      const w = (len * 0.15) * Math.pow(Math.max(0, 1 - u * u), 0.4);
      const zz = u * (len / 2);
      const sh = len * 0.07 + len * 0.03 * u * u;
      pos.push(-w, -len * 0.06, zz, w, -len * 0.06, zz,
        -w * 1.05, sh, zz, w * 1.05, sh, zz);
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
    // The cover, over her gunwales rather than down inside them: a boat with
    // an open top is a hole a ray fired from above goes straight into.
    box(hull, M.steelDark, len * 0.32, 0.14, len * 0.94, 0, len * 0.078, 0);
    // Davits, and the falls hanging from them.
    for (const dz of [z - len * 0.42, z + len * 0.42]) {
      const dav = cyl(g, M.steel, 0.18, 0.24, 4.2, x - sgn * 0.8, deckY + 2.1, dz, 8);
      dav.rotation.z = sgn * 0.3;
      box(g, M.wire, 0.06, 2.2, 0.06, x, deckY + 3.3, dz);
    }
  };
  // Between the funnels and abaft the after one, clear of the waist mounts.
  for (const sgn of [-1, 1]) {
    boat(sgn * 6.9, 18.0, 10.5, sgn);
    boat(sgn * 6.9, -20.0, 8.2, sgn);
  }
  // Carley floats and life rafts, stowed against the deckhouse sides.
  const racks = [[31, 8.3, deckAt(31) + 1.6], [-10, 8.3, deckAt(-10) + 1.6],
    [-27, 8.1, deckAt(-27) + 1.6], [-38, 6.4, deckAt(-38) + 1.6]];
  for (const [rz, rx, ry] of racks) for (const sgn of [-1, 1]) {
    const r = new THREE.Group();
    r.position.set(sgn * rx, ry, rz);
    r.rotation.z = sgn * 0.14;
    r.rotation.x = 0.1;
    g.add(r);
    const t = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.24, 7, 16), M.raft);
    t.scale.set(1, 0.6, 1);
    t.rotation.y = Math.PI / 2;
    r.add(t);
    for (let i = -2; i <= 2; i++) {
      box(r, M.canvas, 0.06, 0.15, 1.7 * Math.sqrt(Math.max(0.05, 1 - (i / 2.6) ** 2)),
        0, i * 0.21, 0);
    }
    for (const dz of [-1.2, 1.2]) {
      box(r, M.steelDark, 0.46, 0.13, 0.13, sgn * -0.26, 0, dz);
      box(r, M.steelDark, 0.11, 1.5, 0.1, sgn * -0.46, 0, dz);
    }
  }
}

/** Windlass, cables, hawses, anchors, bitts and the staffs at both ends. */
function groundTackle(g) {
  const z = 74;
  const y = deckAt(z);
  box(g, M.steelDark, 4.4, 1.4, 2.6, 0, y + 0.7, z);
  for (const sgn of [-1, 1]) {
    cyl(g, M.gunDark, 0.85, 0.85, 0.7, sgn * 2.5, y + 1.05, z, 14)
      .rotation.z = Math.PI / 2;
    cyl(g, M.steelDark, 0.55, 0.65, 1.1, sgn * 0.95, y + 1.9, z, 12);
    // Cable from the wildcat forward to the hawse, and the anchor in it.
    for (let i = 0; i < 14; i++) {
      const f = i / 13;
      const cz = z + 1.8 + f * 9.5;
      cyl(g, M.gunDark, 0.17, 0.17, 0.5, sgn * (2.5 - f * 0.7), deckAt(cz) + 0.24, cz, 6)
        .rotation.x = Math.PI / 2 + (i % 2) * 0.9;
    }
    cyl(g, M.gunDark, 0.44, 0.44, 0.6, sgn * 1.8, deckAt(z + 11) + 0.3, z + 11, 10);
    const t = (z + 13.5) / (LOA / 2);
    const hy = sheer(t) - 1.6;
    const hw = shellAt(t, hy);
    cyl(g, M.cave, 0.62, 0.62, 0.7, sgn * hw * 0.94, hy, zAt(t, hy), 12)
      .rotation.z = Math.PI / 2;
    const a = new THREE.Group();
    a.position.set(sgn * hw * 1.0, hy - 0.15, zAt(t, hy) - 1.3);
    a.rotation.y = sgn * 0.1;
    g.add(a);
    cyl(a, M.gunDark, 0.24, 0.24, 2.6, 0, 0, 0, 8).rotation.x = Math.PI / 2;
    box(a, M.gunDark, 0.3, 0.85, 1.5, 0, -0.3, -1.3);
    for (const fl of [-1, 1]) box(a, M.gunDark, 0.26, 0.45, 1.2, 0, fl * 0.62, -1.75);
  }
  for (const bz of [66, 48, 26, 0, -22, -48, -66, -80]) {
    for (const sgn of [-1, 1]) {
      const w = halfDeck(bz) - 0.9;
      for (const off of [-0.5, 0.5]) {
        cyl(g, M.steelDark, 0.2, 0.23, 0.85, sgn * w, deckAt(bz) + 0.42, bz + off, 8);
      }
      box(g, M.steelDark, 0.75, 0.22, 1.5, sgn * w, deckAt(bz) + 0.11, bz);
    }
  }
  cyl(g, M.bright, 0.07, 0.1, 4.6, 0, deckAt(86) + 2.3, 86, 8);
  cyl(g, M.bright, 0.07, 0.1, 5.0, 0, deckAt(-88) + 2.5, -88, 8);
}

/**
 * A deck edge is a stanchion every six feet with three wires rove through it,
 * and a cruiser has half a mile of it.
 */
function railings(g) {
  const put = (z0, z1, skip) => {
    for (let z = z0; z <= z1; z += 3.4) {
      if (skip && skip(z)) continue;
      const t = z / (LOA / 2);
      const sh = sheer(t);
      const w = shellAt(t, sh) - 0.42;
      if (w < 0.8) continue;
      for (const sgn of [-1, 1]) {
        cyl(g, M.steelDark, 0.06, 0.07, 1.15, sgn * w, sh + 0.62, zAt(t, sh), 6);
        for (const wy of [0.4, 0.78, 1.14]) {
          box(g, M.wire, 0.04, 0.04, 3.45, sgn * w, sh + wy, zAt(t, sh) + 1.7);
        }
      }
    }
  };
  // The whole of both deck edges, less the stretches the turrets, the catapults
  // and the bulwark forward own.
  put(-86, 62, (z) => (z > 36 && z < 50) || (z > -62 && z < -36));
}

/** Searchlights, lockers and life buoys. */
function fittings(g) {
  // Two 36" searchlights on platforms abreast the after funnel.
  for (const sgn of [-1, 1]) {
    const sl = new THREE.Group();
    sl.position.set(sgn * 4.4, L01() + 3.05, -29.0);
    g.add(sl);
    cyl(sl, M.steelDark, 1.15, 1.15, 0.14, 0, -0.6, 0, 16);
    cyl(sl, M.gunDark, 0.3, 0.34, 0.9, 0, -0.15, 0, 10);
    const drum = cyl(sl, M.bright, 0.82, 0.82, 0.9, 0, 0.55, 0, 18);
    drum.rotation.x = Math.PI / 2;
    cyl(sl, M.glass, 0.74, 0.74, 0.1, 0, 0.55, 0.5, 18).rotation.x = Math.PI / 2;
  }
  for (const [lz, sgn] of [[41, -1], [41, 1], [-42, -1], [-42, 1], [-60, -1], [-60, 1]]) {
    box(g, M.steel, 1.0, 1.2, 2.0, sgn * (halfDeck(lz) - 1.6), deckAt(lz) + 0.6, lz);
  }
  for (const [bx, bz] of [[S * 6.35, 20.6], [-S * 6.35, 20.6], [0, -90]]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.12, 6, 12), M.mark);
    t.position.set(bx, bz > 0 ? L04() + 0.7 : deckAt(bz) + 1.5, bz);
    t.rotation.y = Math.PI / 2;
    g.add(t);
  }
}

// ------------------------------------------------------------------ build --

/**
 * Everything on her that does not move, as a list of named sub-assemblies.
 *
 * Named, because when a measurement says something hangs over the side or
 * stands inside a gun barrel, the only useful next question is what.
 */
const STATIC = [
  ['hull', buildHull],
  ['bridge', bridge],
  ['funnels', funnels],
  ['afterWorks', afterWorks],
  ['masts', masts],
  ['aviation', aviation],
  ['boats', boats],
  ['groundTackle', groundTackle],
  ['fittings', fittings],
  ['lightAA', lightAA],
  ['secondary', secondary],
  ['railings', railings],
];

/**
 * Twelve five-inch in six twin mounts: one on the centreline forward,
 * superfiring over turret 2, one aft on the after superstructure, and four in
 * the waist, two a side, on the boat deck.
 */
function secondary(g) {
  const mounts = [];
  g.userData.secMounts = mounts;
  // Mount 51, on the 01 roof forward of the bridge tower, superfiring over
  // turret 2. It stands here and not higher up the tower because a twin 5"/38
  // has seven metres of gun in front of it: any further forward and the
  // barrels are inside turret 2, any further aft and the mount is inside the
  // navigating bridge, which is where it was.
  cyl(g, M.steel, 2.3, 2.5, 1.5, 0, L01() + 0.45, M51_Z, 20);
  mounts.push(fiveInch(g, 0, L01() + 1.2, M51_Z, 0));
  // Mount 52, aft, on the roof of the after superstructure.
  cyl(g, M.steel, 2.3, 2.5, 1.5, 0, L01() + 3.35, M52_Z, 20);
  mounts.push(fiveInch(g, 0, L01() + 4.1, M52_Z, Math.PI));
  // And the four waist mounts, on sponsons at the edge of the 01 roof, two a
  // side, stowed fore and aft.
  for (const sgn of [-1, 1]) {
    cyl(g, M.steel, 2.3, 2.5, 1.2, 0, L01() + 0.6, 0, 20).position
      .set(sgn * WAIST_X, L01() + 0.6, WAIST_F);
    mounts.push(fiveInch(g, sgn * WAIST_X, L01() + 1.2, WAIST_F, sgn * 0.26));
    cyl(g, M.steel, 2.3, 2.5, 1.2, 0, L01() + 0.6, 0, 20).position
      .set(sgn * WAIST_X, L01() + 0.6, WAIST_A);
    mounts.push(fiveInch(g, sgn * WAIST_X, L01() + 1.2, WAIST_A, Math.PI - sgn * 0.26));
  }
}

/**
 * Her light battery: twenty-eight forty-millimetre barrels in four quads and
 * six twins, and ten Oerlikons.
 *
 * Where they go is decided by where the six-inch barrels lie. Her turrets stow
 * trained fore and aft, and a 6"/47 is seven metres of gun on the centreline:
 * anything standing there in front of turret 1 or abaft turret 4 is inside one.
 */
function lightAA(g) {
  const mounts = [];
  const keep = (m) => { mounts.push(m); return m; };
  g.userData.aaMounts = mounts;
  // Four quads: two abreast the bridge on the 01 level, one on the after
  // superstructure, one on the quarterdeck abreast the crane.
  for (const sgn of [-1, 1]) {
    keep(quadBofors(g, sgn * 6.6, L01() + 0.2, 33.5, sgn * 0.5));
  }
  keep(quadBofors(g, 0, L01() + 3.05, -33.0, 0));
  keep(quadBofors(g, 0, deckAt(-80) + 0.1, -80.0, 0));
  // Six twins: abreast the funnels, on the forecastle abreast turret 2, and on
  // the quarterdeck abreast turret 4.
  for (const sgn of [-1, 1]) {
    keep(twinBofors(g, sgn * 7.85, L01() + 0.15, 10.5, sgn * 0.7));
    keep(twinBofors(g, sgn * (halfDeck(50) - 2.4), deckAt(50) + 0.1, 50.0, sgn * 0.8));
    keep(twinBofors(g, sgn * (halfDeck(-50) - 2.4), deckAt(-50) + 0.1, -50.0, sgn * 0.8));
  }
  // Ten Oerlikons: round the bridge, along the boat deck and right forward.
  // Ten Oerlikons, in pairs. None of them on the centreline: her turrets stow
  // trained fore and aft and a 6"/47 is eleven metres of gun from the trunnion,
  // so the centreline in front of turret 1 and abaft turret 4 is inside one.
  for (const [oz, oy, ox] of [
    [12.0, L02() + 0.1, 4.6],
    [24.0, L01() + 0.15, 7.2],
    [-3.0, L01() + 0.15, 7.6],
    [66.0, deckAt(66) + 0.1, 3.2],
    [-64.0, deckAt(-64) + 0.1, 3.6],
  ]) {
    for (const sgn of [-1, 1]) keep(oerlikon(g, sgn * ox, oy, oz, sgn * 1.1));
  }
}

/**
 * The four triple 6" turrets, at the stations her datasheet gives: two forward
 * superfiring, two aft with 3 firing over 4.
 */
function mainBattery(g) {
  const spots = [
    [58, deckAt(58), false],
    [44, deckAt(44) + 3.6, false],
    [-42, deckAt(-42) + 3.6, true],
    [-56, deckAt(-56), true],
  ];
  return spots.map(([z, y, aft]) => {
    // The superfiring turrets stand on their own barbette rings.
    if (z === 44) cyl(g, M.steel, 3.4, 3.6, 3.7, 0, deckAt(44) + 1.85, 44, 22);
    if (z === -42) cyl(g, M.steel, 3.4, 3.6, 3.7, 0, deckAt(-42) + 1.85, -42, 22);
    return sixInch(g, 0, y, z, aft);
  });
}

export function buildCleveland() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  // Everything static welded into one mesh per material. Done before the guns
  // go on, because the guns have to keep moving.
  mergeStatic(g);
  const turrets = mainBattery(g);
  g.userData.classId = 'cleveland';
  const secMounts = g.userData.secMounts || [];
  const aaMounts = g.userData.aaMounts || [];

  // Her catapults. Like the carrier, she carries her own launch: the scene only
  // tells her when the order was given, and she knows what a launch looks like.
  const cats = g.userData.catapults || [];
  const deck = {
    cats, live: null, launchAt: null, airborne: false, plane: null,
    aero: 'kingfisher', run: DECK_RUN,
    profile: catapultProfile(AERO.kingfisher, CAT_STROKE),
  };
  g.userData.deck = deck;
  g.userData.deckPlane = cats.length ? cats[0].plane : null;
  g.userData.step = (t) => stepCatapults(deck, t);
  g.userData.launch = (t) => {
    // The two catapults are used turn and turn about, which is what keeps one
    // of them free while the other is being reloaded by the crane.
    const next = cats.find((c) => !c.gone && c !== deck.live) || deck.live;
    deck.live = next;
    deck.launchAt = t;
    deck.airborne = false;
    if (next) {
      next.gone = false;
      next.plane.visible = true;
      g.userData.deckPlane = next.plane;
      g.userData.deckPlaneOwner = next;
      deck.plane = { group: next.plane, prop: next.prop };
      // Where she comes back to: her own cradle, not a spot on the deck.
      g.userData.landingSpot = [next.sgn * CAT_X, deckAt(CAT_Z) + PLANE_Y + 0.6,
        CAT_Z + CAT_A];
    }
  };
  // Whatever was flying her is finished with her: she is back on her cradle,
  // craned aboard and bolted down for the next shot.
  g.userData.recover = () => {
    const c = g.userData.deckPlaneOwner || deck.live;
    deck.airborne = false;
    deck.launchAt = null;
    if (!c) return;
    c.gone = false;
    if (c.plane.parent !== c.car) c.car.add(c.plane);
    c.plane.position.set(0, PLANE_Y, PLANE_Z);
    c.plane.rotation.set(0, 0, 0);
    c.plane.visible = true;
    c.car.position.z = CAT_A;
    c.group.rotation.y = c.sgn * CAT_REST;
  };
  // A cruiser has no hangar and no lift: there is nowhere for a scout to go
  // but back on her cradle, so being struck below and being craned aboard are
  // the same evolution. The carrier tells the two apart; she does not.
  g.userData.stow = g.userData.recover;
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: sheer(0),
    secMounts, aaMounts,
  };
}

/**
 * Every piece of her and where it sits, for the tests.
 *
 * `moving` marks anything under a group the welder was told to leave alone --
 * the gun mounts -- so a check can tell a turret that trains from a deckhouse
 * that does not.
 */
export function clevelandParts() {
  const parts = [];
  for (const [name, build] of [...STATIC, ['mainBattery', mainBattery]]) {
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

export {
  LOA as CLEVELAND_LOA, BEAM as CLEVELAND_BEAM, DRAFT as CLEVELAND_DRAFT,
  deckAt, halfDeck,
};
