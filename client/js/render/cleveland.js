// USS Cleveland, built out of her own lines.
//
// A Cleveland is a Brooklyn's machinery under a taller, narrower superstructure
// with the after turret taken out and put back as anti-aircraft: six hundred
// and ten feet on sixty-six of beam, twelve six-inch rifles in four triple
// turrets, twelve five-inch in six twin mounts, and enough forty-millimetre to
// make her the ship a Japanese pilot least wanted to attack.
//
// She is not a flush-decker. Her forecastle deck runs from the stem aft to
// abreast the after superstructure and then breaks down a whole deck to the
// quarterdeck, which is where her aircraft live: two catapults, a crane on the
// centreline, and a hangar under the fantail. Get that break wrong and she is
// not a Cleveland, she is a large destroyer.
//
// Local frame, as everywhere else in the renderer: +Z is the bow, +Y is up, and
// therefore starboard is -X. y = 0 is the waterline.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic } from './merge.js';
import {
  box, cyl, tubeZ, tubeX, sphere, smooth, lerpTable, loftRings, ladder,
} from './shipkit.js';

export const LOA = 185.9;
export const BEAM = 20.2;
export const DRAFT = 7.5;
/** Starboard, in this frame. The accommodation ladder goes on this side. */
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

// Where the forecastle deck breaks down to the quarterdeck. One station wide,
// because on the ship it is one bulkhead.
const BREAK_T = -0.365;

const SHEER = [
  [-1.00, 5.05], [-0.80, 5.18], [-0.60, 5.32], [-0.45, 5.44],
  [BREAK_T - 0.008, 5.48],
  [BREAK_T + 0.008, 8.16],
  [-0.20, 8.28], [0.00, 8.46], [0.25, 8.82], [0.50, 9.42], [0.72, 10.24],
  [0.88, 10.98], [1.00, 11.55],
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

/** Which deck a station is on: the forecastle, or the quarterdeck abaft it. */
const BREAK_Z = (BREAK_T * LOA) / 2;

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

/**
 * Her weather decks: the forecastle from the stem aft to the break, and the
 * quarterdeck a whole deck lower from the break to the transom.
 *
 * Both come out of the one sheer table, because the step is in the table. The
 * near-vertical band the loft throws across the break is the break's own face,
 * and it gets a bulkhead behind it so it reads as the wall it is.
 */
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

  // The bulkhead at the break, with the door through it and the ladders down.
  const wB = shellAt(BREAK_T, sheer(BREAK_T + 0.01));
  const zB = zAt(BREAK_T, sheer(BREAK_T));
  box(g, M.steel, wB * 2, 2.9, 0.3, 0, sheer(BREAK_T - 0.01) + 1.45, zB - 0.1);
  box(g, M.gunDark, 1.1, 2.0, 0.16, S * 3.0, sheer(BREAK_T - 0.01) + 1.0, zB - 0.28);
  for (const sgn of [-1, 1]) {
    ladder(g, M.steelDark, sgn * (wB - 1.6), deckAt(BREAK_Z - 4) + 0.1,
      deckAt(BREAK_Z + 2), BREAK_Z - 4.2, BREAK_Z - 0.6);
  }
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
  return t;
}

/** A twin 40 mm, which is the same gun in a smaller tub. */
function twinBofors(g, x, y, z, ry) {
  const t = tub(g, 1.6, 1.15, x, y, z, ry, 14);
  const m = new THREE.Group();
  m.position.y = 0.35;
  t.add(m);
  cyl(m, M.gunDark, 0.44, 0.58, 0.5, 0, 0.25, 0, 12);
  box(m, M.gun, 1.2, 0.66, 1.05, 0, 0.78, -0.1);
  for (const dx of [-0.3, 0.3]) {
    tubeZ(m, M.gunDark, 0.08, 2.4, dx, 1.05, 1.2, 10);
    cyl(m, M.gunDark, 0.11, 0.11, 0.34, dx, 1.05, 2.3, 10).rotation.x = Math.PI / 2;
  }
  for (const sgn of [-1, 1]) box(m, M.steelDark, 0.44, 0.1, 0.44, sgn * 1.0, 0.55, -0.45);
  return t;
}

/** A single 20 mm Oerlikon on its pedestal, in a small tub. */
function oerlikon(g, x, y, z, ry) {
  const t = tub(g, 1.0, 1.0, x, y, z, ry, 10);
  const o = new THREE.Group();
  o.position.y = 0.3;
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
  return t;
}

// -------------------------------------------------------- superstructure --

// Her levels, named once so anything bolted to one can find it.
const FCASTLE = () => deckAt(20);            // the forecastle deck amidships
const L01 = () => FCASTLE() + 3.1;           // the main deckhouse roof
const L02 = () => L01() + 3.0;               // the bridge structure
const L03 = () => L02() + 2.9;               // the navigating bridge
const L04 = () => L03() + 2.6;               // the open bridge

const BRIDGE_F = 36;
const BRIDGE_A = 10;
const FUNNEL_F = 15.5;
const FUNNEL_A = -10.5;
const AFTWORKS = [-34, -14];                 // the after superstructure

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
  // The deckhouse on the forecastle deck, running from abaft turret 2 aft to
  // the funnel.
  loftRings(g, M.steel, [
    [8.1, (BRIDGE_F - BRIDGE_A) / 2, (BRIDGE_F + BRIDGE_A) / 2, base],
    [8.1, (BRIDGE_F - BRIDGE_A) / 2, (BRIDGE_F + BRIDGE_A) / 2, L01()],
  ]);
  box(g, M.deckDark, 16.4, 0.14, BRIDGE_F - BRIDGE_A - 0.6, 0, L01() + 0.07, 23);
  // 02: the bridge structure proper, narrower and shorter.
  loftRings(g, M.steel, [
    [5.6, 7.6, 27.5, L01()],
    [5.6, 7.6, 27.5, L02()],
  ]);
  box(g, M.deckDark, 11.4, 0.14, 15.4, 0, L02() + 0.07, 27.5);
  // 03: the navigating bridge, with the window band round its front.
  loftRings(g, M.steel, [
    [4.5, 5.6, 28.6, L02()],
    [4.5, 5.6, 28.6, L03()],
  ]);
  box(g, M.deckDark, 9.2, 0.14, 11.4, 0, L03() + 0.07, 28.6);
  // 04: the open bridge inside its splinter coaming.
  loftRings(g, M.steel, [
    [3.6, 4.0, 29.0, L03()],
    [3.6, 4.0, 29.0, L04()],
  ]);
  box(g, M.deckDark, 7.4, 0.14, 8.2, 0, L04() + 0.07, 29.0);

  // The armoured conning tower, built into the front of the whole thing: five
  // inches of plate with a sight slit round it, and the flying bridge on top.
  cyl(g, M.steel, 2.6, 2.9, L02() - base, 0, (base + L02()) / 2, 32.8, 20);
  cyl(g, M.gunDark, 2.72, 2.72, 0.36, 0, L02() - 1.3, 32.8, 20);
  cyl(g, M.steel, 2.4, 2.6, 1.2, 0, L02() + 0.6, 32.8, 20);
  cyl(g, M.deckDark, 2.9, 2.9, 0.14, 0, L02() + 1.25, 32.8, 20);

  // Windows: the band round the front of the navigating bridge.
  for (let i = 0; i < 15; i++) {
    const a = -1.35 + (i / 14) * 2.7;
    const r = 4.9;
    const wx = Math.sin(a) * r * 0.92;
    const wz = 28.6 + Math.cos(a) * r * 1.08;
    box(g, M.glass, 1.0, 0.9, 0.12, wx, L02() + 1.9, wz, a);
    box(g, M.steelDark, 1.04, 0.12, 0.14, wx, L02() + 2.42, wz, a);
    box(g, M.steelDark, 1.04, 0.12, 0.14, wx, L02() + 1.4, wz, a);
  }
  // Doors and portholes down the deckhouse sides, and the ladders between decks.
  for (const sgn of [-1, 1]) {
    for (const dz of [13, 20, 31]) {
      box(g, M.gunDark, 0.16, 2.0, 1.0, sgn * 8.2, base + 1.05, dz);
    }
    for (const dz of [11.5, 15.5, 17.5, 25.5, 27.5, 33.5]) {
      cyl(g, M.glass, 0.22, 0.22, 0.1, sgn * 8.16, base + 2.0, dz, 10)
        .rotation.z = Math.PI / 2;
      cyl(g, M.steelDark, 0.28, 0.28, 0.07, sgn * 8.13, base + 2.0, dz, 10)
        .rotation.z = Math.PI / 2;
    }
    ladder(g, M.steelDark, sgn * 6.6, base + 0.1, L01(), 11.0, 14.4);
    ladder(g, M.steelDark, sgn * 4.6, L01() + 0.1, L02(), 20.2, 23.4);
    ladder(g, M.steelDark, sgn * 3.4, L02() + 0.1, L03(), 22.4, 25.2);
  }

  // The open bridge: splinter plating, a pelorus, the engine order telegraphs,
  // the target designation transmitter, and the wings out either side.
  const N = 22;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    if (Math.abs(a - Math.PI) < 0.38) continue;
    const r = 3.9;
    const cx = Math.sin(a) * r * 0.95;
    const cz = 29.0 + Math.cos(a) * r * 1.05;
    box(g, M.steel, 0.16, 1.3, (2 * Math.PI * r) / N + 0.14, cx, L04() + 0.7, cz,
      a + Math.PI / 2);
    box(g, M.steelDark, 0.4, 0.12, (2 * Math.PI * r) / N + 0.14, cx, L04() + 1.38, cz,
      a + Math.PI / 2);
  }
  cyl(g, M.gunDark, 0.2, 0.24, 1.3, 0, L04() + 0.7, 31.4, 10);
  box(g, M.gunDark, 0.66, 0.24, 0.66, 0, L04() + 1.4, 31.4);
  for (const sgn of [-1, 1]) {
    cyl(g, M.gunDark, 0.3, 0.36, 1.05, sgn * 1.8, L04() + 0.55, 30.8, 10);
    box(g, M.gun, 0.55, 0.5, 0.42, sgn * 1.8, L04() + 1.3, 30.8);
    // The wings, on their brackets, with a signal lamp and a repeater on each.
    box(g, M.deckDark, 3.2, 0.16, 3.6, sgn * 4.9, L04(), 29.4);
    for (const bz of [27.9, 30.9]) {
      const br = box(g, M.steel, 3.0, 0.18, 0.24, sgn * 4.9, L04() - 0.6, bz);
      br.rotation.z = sgn * 0.4;
    }
    box(g, M.steel, 0.16, 1.2, 3.6, sgn * 6.42, L04() + 0.68, 29.4);
    box(g, M.steelDark, 0.42, 0.12, 3.6, sgn * 6.38, L04() + 1.32, 29.4);
    cyl(g, M.gunDark, 0.3, 0.3, 0.5, sgn * 6.18, L04() + 0.8, 30.6, 10);
    box(g, M.glass, 0.36, 0.36, 0.07, sgn * 6.18, L04() + 0.8, 30.88);
  }

  // The Mk 34 main battery director on its barbette, with the Mk 8 fire
  // control radar -- the flat rectangular aerial -- on the roof of it.
  const dirY = L04() + 0.7;
  cyl(g, M.steel, 1.9, 2.1, 1.8, 0, dirY + 0.9, 26.4, 20);
  const dir = new THREE.Group();
  dir.position.set(0, dirY + 1.8, 26.4);
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
  // The two forward Mk 37s, abreast the bridge one level down from the main
  // director, which is where a Cleveland carries them.
  for (const sgn of [-1, 1]) {
    mk37(g, sgn * 3.4, L03() + 1.4, 23.5, sgn * 0.22);
  }
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
    const y0 = L01() + 0.2;
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
  // The casing each funnel stands on, and the boat deck between them.
  for (const [cz, depth, wide] of [[FUNNEL_F, 10.5, 9.6], [FUNNEL_A, 9.5, 9.2]]) {
    box(g, M.steel, wide, 3.1, depth, 0, FCASTLE() + 1.55, cz);
    box(g, M.deckDark, wide + 0.3, 0.16, depth, 0, FCASTLE() + 3.1, cz);
  }
  box(g, M.steel, 8.0, 3.1, 15.0, 0, FCASTLE() + 1.55, 2.5);
  box(g, M.deckDark, 8.3, 0.16, 15.0, 0, FCASTLE() + 3.1, 2.5);
  // Ventilator cowls along the boat deck, turned to the wind.
  for (const [vz, sgn] of [[9, -1], [9, 1], [1, -1], [1, 1], [-4, -1], [-4, 1], [-17, 1]]) {
    const v = new THREE.Group();
    v.position.set(sgn * (halfDeck(vz) - 2.6), FCASTLE() + 0.1, vz);
    g.add(v);
    cyl(v, M.steel, 0.42, 0.5, 2.8, 0, 1.4, 0, 12);
    const bell = cyl(v, M.steel, 0.78, 0.44, 1.0, 0, 3.0, 0.3, 14);
    bell.rotation.x = -1.1;
    cyl(v, M.cave, 0.62, 0.62, 0.12, 0, 3.28, 0.78, 14).rotation.x = -1.1;
  }
}

/**
 * The after superstructure: the secondary director, the mainmast, and the
 * house that turret 3's barbette rises through.
 */
function afterWorks(g) {
  const base = FCASTLE();
  const [z0, z1] = AFTWORKS;
  loftRings(g, M.steel, [
    [6.2, (z1 - z0) / 2, (z0 + z1) / 2, base],
    [6.2, (z1 - z0) / 2, (z0 + z1) / 2, base + 3.1],
  ]);
  box(g, M.deckDark, 12.6, 0.14, z1 - z0 - 0.6, 0, base + 3.17, (z0 + z1) / 2);
  // A second, shorter tier carrying the after director.
  loftRings(g, M.steel, [
    [4.2, 4.6, -24.5, base + 3.1],
    [4.2, 4.6, -24.5, base + 6.0],
  ]);
  box(g, M.deckDark, 8.6, 0.14, 9.4, 0, base + 6.07, -24.5);
  for (const sgn of [-1, 1]) {
    for (const dz of [-18, -30]) {
      box(g, M.gunDark, 0.16, 2.0, 1.0, sgn * 6.3, base + 1.05, dz);
    }
    ladder(g, M.steelDark, sgn * 5.0, base + 0.1, base + 3.1, -15.0, -18.4);
  }
  // The after Mk 34 director, which can fight the after turrets on her own.
  const dirY = base + 6.0;
  cyl(g, M.steel, 1.7, 1.9, 1.5, 0, dirY + 0.75, -24.5, 18);
  const dir = new THREE.Group();
  dir.position.set(0, dirY + 1.5, -24.5);
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
  // And the after pair, abreast the after director.
  for (const sgn of [-1, 1]) {
    mk37(g, sgn * 3.2, base + 4.4, -17.0, Math.PI - sgn * 0.22);
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
  const FZ = 21.0;
  for (const [lx, lz] of [[0, 1.7], [-1.7, -1.4], [1.7, -1.4]]) {
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
  const mBase = FCASTLE() + 3.1;
  const mTop = mBase + 11.0;
  const MZ = -17.5;
  for (const [lx, lz] of [[0, -1.6], [-1.5, 1.3], [1.5, 1.3]]) {
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
  const spans = [
    [fTop + 5.0, FZ, mTop + 1.2, MZ, 2.4],
    [mTop + 1.2, MZ, FCASTLE() + 1.2, -46.0, 2.0],
    [fTop + 5.0, FZ, deckAt(50) + 1.0, 50.0, 1.6],
  ];
  for (const [ay, az, by, bz, spread] of spans) {
    for (const sgn of [-1, 1]) {
      const a = new THREE.Vector3(sgn * 0.6, ay, az);
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
  for (const a of [0, 2.09, 4.19]) {
    const bl = box(p, M.gunDark, 0.22, 3.2, 0.08, 0, 1.35, 4.95);
    bl.rotation.z = a;
  }
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
  const qd = deckAt(-70);
  for (const sgn of [-1, 1]) {
    const cz = -70;
    const cat = new THREE.Group();
    cat.position.set(sgn * 5.2, qd, cz);
    cat.rotation.y = sgn * 0.10;
    g.add(cat);
    // The turntable the catapult trains on, and the girder itself.
    cyl(cat, M.steelDark, 2.2, 2.4, 0.6, 0, 0.3, 0, 18);
    for (const rail of [-0.9, 0.9]) {
      box(cat, M.steel, 0.34, 0.5, 18, rail, 1.05, 0);
      box(cat, M.steelDark, 0.42, 0.14, 18, rail, 1.36, 0);
    }
    for (let i = 0; i < 9; i++) {
      box(cat, M.steel, 2.2, 0.24, 0.34, 0, 0.75, -8.0 + i * 2.05);
    }
    // The powder charge house at the after end, and the car on the rails.
    box(cat, M.steel, 2.4, 1.3, 2.6, 0, 1.3, -9.1);
    box(cat, M.steelDark, 2.2, 0.4, 1.9, 0, 1.75, 1.2);
    seaPlane(cat, 0, 2.1, 1.4, 0);
  }
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

/** Boats: two motor launches and two whaleboats, on davits on the boat deck. */
function boats(g) {
  const deckY = FCASTLE() + 3.1;
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
    box(hull, M.steelDark, len * 0.2, 0.14, len * 0.62, 0, len * 0.062, -0.2);
    // Davits, and the falls hanging from them.
    for (const dz of [z - len * 0.42, z + len * 0.42]) {
      const dav = cyl(g, M.steel, 0.18, 0.24, 4.2, x - sgn * 0.8, deckY + 2.1, dz, 8);
      dav.rotation.z = sgn * 0.3;
      box(g, M.wire, 0.06, 2.2, 0.06, x, deckY + 3.3, dz);
    }
  };
  for (const sgn of [-1, 1]) {
    boat(sgn * 7.2, 6.5, 10.5, sgn);
    boat(sgn * 7.2, -4.0, 8.2, sgn);
  }
  // Carley floats and life rafts, stowed against the deckhouse sides.
  const racks = [[24, 8.3, FCASTLE() + 1.6], [16, 8.3, FCASTLE() + 1.6],
    [-20, 6.4, FCASTLE() + 1.6], [-28, 6.4, FCASTLE() + 1.6]];
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
  put(-86, 62, (z) => (z > 36 && z < 50) || (z > -62 && z < -36)
    || (z > BREAK_Z - 3 && z < BREAK_Z + 3));
}

/** Searchlights, lockers, life buoys and the accommodation ladder. */
function fittings(g) {
  // Two 36" searchlights on platforms abreast the after funnel.
  for (const sgn of [-1, 1]) {
    const sl = new THREE.Group();
    sl.position.set(sgn * 5.4, FCASTLE() + 3.3, FUNNEL_A + 4.5);
    g.add(sl);
    cyl(sl, M.steelDark, 1.15, 1.15, 0.14, 0, -0.6, 0, 16);
    cyl(sl, M.gunDark, 0.3, 0.34, 0.9, 0, -0.15, 0, 10);
    const drum = cyl(sl, M.bright, 0.82, 0.82, 0.9, 0, 0.55, 0, 18);
    drum.rotation.x = Math.PI / 2;
    cyl(sl, M.glass, 0.74, 0.74, 0.1, 0, 0.55, 0.5, 18).rotation.x = Math.PI / 2;
  }
  for (const [lz, sgn] of [[30, -1], [30, 1], [-6, -1], [-6, 1], [-32, -1], [-32, 1]]) {
    box(g, M.steel, 1.0, 1.2, 2.0, sgn * (halfDeck(lz) - 1.6), deckAt(lz) + 0.6, lz);
  }
  for (const [bx, bz] of [[S * 6.35, 29.4], [-S * 6.35, 29.4], [0, -90]]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.12, 6, 12), M.mark);
    t.position.set(bx, bz > 0 ? L04() + 0.7 : deckAt(bz) + 1.5, bz);
    t.rotation.y = Math.PI / 2;
    g.add(t);
  }
  // The accommodation ladder, rigged down the starboard side in harbour.
  const az = -2;
  ladder(g, M.steelDark, S * (halfDeck(az) + 0.5), deckAt(az) - 4.6, deckAt(az) + 0.2,
    az - 5.2, az + 1.0);
  box(g, M.steelDark, 1.4, 0.16, 2.4, S * (halfDeck(az) + 0.8), deckAt(az) - 4.7, az - 6.2);
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
  // Mount 51, on a bandstand at the front of the bridge structure. It has to
  // stand high enough that its guns clear turret 2's roof: put it on the 01
  // level, where it looks right, and the barrels are inside the turret.
  cyl(g, M.steel, 2.3, 2.5, 1.5, 0, L02() + 0.45, 33.0, 20);
  fiveInch(g, 0, L02() + 1.2, 33.0, 0);
  fiveInch(g, 0, FCASTLE() + 3.2, -30.5, Math.PI);
  for (const sgn of [-1, 1]) {
    fiveInch(g, sgn * 7.0, FCASTLE() + 3.2, 8.0, sgn * 0.30);
    fiveInch(g, sgn * 7.0, FCASTLE() + 3.2, -3.5, Math.PI - sgn * 0.30);
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
  // Four quads: two abreast the bridge on the 01 level, one on the after
  // superstructure, one on the quarterdeck abreast the crane.
  for (const sgn of [-1, 1]) {
    quadBofors(g, sgn * 5.4, L01() + 0.2, 15.0, sgn * 0.5);
  }
  quadBofors(g, 0, FCASTLE() + 6.15, -20.0, 0);
  quadBofors(g, 0, deckAt(-80) + 0.1, -80.0, 0);
  // Six twins: abreast the funnels, on the forecastle abreast turret 2, and on
  // the quarterdeck abreast turret 4.
  for (const sgn of [-1, 1]) {
    twinBofors(g, sgn * 6.6, FCASTLE() + 3.25, FUNNEL_F - 6.5, sgn * 0.7);
    twinBofors(g, sgn * (halfDeck(50) - 2.4), deckAt(50) + 0.1, 50.0, sgn * 0.8);
    twinBofors(g, sgn * (halfDeck(-50) - 2.4), deckAt(-50) + 0.1, -50.0, sgn * 0.8);
  }
  // Ten Oerlikons: round the bridge, along the boat deck and right forward.
  // Ten Oerlikons, in pairs. None of them on the centreline: her turrets stow
  // trained fore and aft and a 6"/47 is eleven metres of gun from the trunnion,
  // so the centreline in front of turret 1 and abaft turret 4 is inside one.
  for (const [oz, oy, ox] of [
    [33.0, L02() + 0.1, 4.6],
    [25.0, L03() + 0.1, 3.4],
    [-1.0, FCASTLE() + 3.25, 8.0],
    [66.0, deckAt(66) + 0.1, 3.2],
    [-64.0, deckAt(-64) + 0.1, 3.6],
  ]) {
    for (const sgn of [-1, 1]) oerlikon(g, sgn * ox, oy, oz, sgn * 1.1);
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
  return { group: g, turrets, length: LOA, beam: BEAM, deckY: sheer(0) };
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

export { LOA as CLEVELAND_LOA, BEAM as CLEVELAND_BEAM, DRAFT as CLEVELAND_DRAFT, deckAt };
