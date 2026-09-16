// FS Surcouf: the croiseur sous-marin.
//
// She is built the way the U-boat is built -- lofted off her own curves rather
// than drawn as a cylinder, because nothing about a submarine is a cylinder
// except the pressure hull inside her -- and then the things that make her
// the Surcouf and not a Type VII are put on top of it:
//
//   the turret   two 20.3 cm guns in a pressure-tight mounting forward of the
//                tower, with its own rangefinder on the roof. It is the
//                largest gun ever carried by a submarine and it is the whole
//                reason she existed.
//   the tower    tall, slab-sided, and carrying the eight-metre rangefinder
//                she needed to shoot at what the guns could reach.
//   the hangar   a pressure-tight cylinder abaft the tower with a floatplane
//                folded in it, and the crane that lifted her out.
//   the hold     a compartment forward for the crews of the ships she sank,
//                which is why she is a hundred and ten metres long.
//
// Everything is metres and y = 0 is the surfaced waterline.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { box, cyl, tubeZ, sphere, ladder, loftRings } from './shipkit.js';
import { arm } from './mounts.js';

const CLS = SHIP_CLASSES.surcouf;
export const LOA = CLS.hull.length;      // 110 m
export const BEAM = CLS.hull.beam;       // 9 m
export const DRAFT = CLS.hull.draft;     // 7.25 m
const HALF = LOA / 2;

// French grey, and she went to sea in one of them.
//
// The Marine Nationale painted her Gris Bleu 1 overall above water with the
// casing a good deal darker, and after 1940 in British service she kept it.
// The distinctive thing about her in every photograph is how little of her
// there is above water for how long she is: a black strip of casing, a very
// large turret on it, and a tower.
const P = {
  light: 0x8d939b,         // topsides, tower, turret
  hull: 0x646b73,          // her sides down to the boot topping
  hullDark: 0x474e56,      // the pressure hull, seen only in a cutaway
  boot: 0x191c20,
  antifoul: 0x3a3f3b,
  deck: 0x41443f,          // the slatted casing
  deckSteel: 0x474d54,
  steel: 0x7f878f,
  steelDark: 0x4b525a,
  bright: 0x9aa2aa,
  gun: 0x767e86,
  gunDark: 0x393f45,
  canvas: 0x7b7b70,
  glass: 0x222e38,
  cave: 0x0d1015,
  brass: 0x8a7340,
  mark: 0xd2d6da,
};

const MATS = {};
function mat(color) {
  if (!MATS[color]) MATS[color] = new THREE.MeshLambertMaterial({ color });
  return MATS[color];
}
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

// ------------------------------------------------------------- her lines --

/** The top of her casing, stern at t = -1 to stem at t = +1. */
const DECKLINE = [
  [-1.00, 1.30], [-0.90, 1.66], [-0.76, 1.92], [-0.58, 2.06], [-0.36, 2.14],
  [-0.12, 2.18], [0.10, 2.20], [0.32, 2.28], [0.50, 2.48], [0.66, 2.86],
  [0.80, 3.34], [0.90, 3.80], [0.96, 4.16], [1.00, 4.44],
];

/** Her keel: seven and a quarter metres down amidships, sweeping up at both ends. */
const KEEL = [
  [-1.00, -1.55], [-0.92, -3.10], [-0.82, -4.55], [-0.68, -5.85], [-0.50, -6.70],
  [-0.28, -7.15], [0.00, -7.25], [0.26, -7.20], [0.46, -6.95], [0.62, -6.40],
  [0.76, -5.40], [0.87, -4.10], [0.95, -2.70], [1.00, -1.40],
];

/** Her greatest half-breadth, over the saddle tanks. */
const HALFB = [
  [-1.00, 0.55], [-0.90, 1.55], [-0.78, 2.60], [-0.62, 3.55], [-0.42, 4.20],
  [-0.20, 4.48], [0.02, 4.50], [0.24, 4.44], [0.42, 4.20], [0.58, 3.74],
  [0.72, 3.04], [0.84, 2.20], [0.93, 1.36], [1.00, 0.52],
];

/** A submarine's section is widest under water, not at the deck. */
const SECTION = [
  [0.00, 0.060], [0.06, 0.32], [0.14, 0.55], [0.24, 0.75], [0.36, 0.90],
  [0.48, 0.972], [0.58, 1.000], [0.68, 0.994], [0.78, 0.955], [0.86, 0.896],
  [0.93, 0.800], [1.00, 0.690],
];

/** The pressure hull: a cylinder five and a half metres across, coned at both ends. */
const PRESSURE = [
  [-1.00, 0.00], [-0.93, 0.32], [-0.84, 0.58], [-0.72, 0.78], [-0.60, 0.90],
  [-0.46, 0.97], [-0.30, 1.00], [0.00, 1.00], [0.24, 1.00], [0.38, 0.98],
  [0.50, 0.93], [0.62, 0.84], [0.73, 0.71], [0.83, 0.54], [0.92, 0.36],
  [0.97, 0.19], [1.00, 0.00],
];
const R = 2.75;
const PY = -3.10;

function lerpAt(table, t) {
  const c = Math.max(table[0][0], Math.min(table[table.length - 1][0], t));
  if (c <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (c <= table[i][0]) {
      const [t0, v0] = table[i - 1];
      const [t1, v1] = table[i];
      const k = (c - t0) / (t1 - t0);
      return v0 + (v1 - v0) * (k * k * (3 - 2 * k));
    }
  }
  return table[table.length - 1][1];
}

export function hullR(t) { return lerpAt(PRESSURE, t) * R; }
export function keelAt(t) { return lerpAt(KEEL, t); }
export function sheerAt(t) { return lerpAt(DECKLINE, t); }
export function outerR(t) { return lerpAt(HALFB, t); }
function sectionF(v) { return lerpAt(SECTION, Math.max(0, Math.min(1, v))); }

/** Her half-breadth at a station and a height: the shell itself. */
export function shellAt(t, y) {
  const k = keelAt(t);
  const d = sheerAt(t);
  if (d - k < 0.01) return 0.02;
  return outerR(t) * sectionF((y - k) / (d - k));
}

/** The top of her casing at a point along her, in metres from amidships. */
export function deckAt(z) { return sheerAt(Math.max(-1, Math.min(1, z / HALF))); }

// ------------------------------------------------------------- the hull --

/**
 * The outside of her: saddle tanks, casing and all, lofted station by station.
 *
 * Three bands of colour up her side, because that is how she was painted and
 * because it is what stops a long grey hull reading as a tube: antifouling
 * under the surfaced waterline, a black boot topping across it, and her grey
 * above.
 */
function hull(g) {
  const STATIONS = 54;
  const RINGS = 13;
  const pos = [];
  const idx = [];
  const bands = [];
  for (let s = 0; s <= STATIONS; s++) {
    const t = -1 + (2 * s) / STATIONS;
    const k = keelAt(t);
    const d = sheerAt(t);
    for (let r = 0; r <= RINGS; r++) {
      const f = r / RINGS;
      const y = k + (d - k) * f;
      const hw = shellAt(t, y);
      pos.push(hw, y, t * HALF);
      bands.push(y);
    }
  }
  const at = (s, r) => s * (RINGS + 1) + r;
  // Both sides, so the shell is closed: mirrored in x as it is written.
  const half = pos.length / 3;
  for (let i = 0; i < half; i++) {
    pos.push(-pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  }
  for (let s = 0; s < STATIONS; s++) {
    for (let r = 0; r < RINGS; r++) {
      const a = at(s, r);
      const b = at(s + 1, r);
      const c = at(s + 1, r + 1);
      const e = at(s, r + 1);
      idx.push(a, b, c, a, c, e);
      idx.push(half + a, half + c, half + b, half + a, half + e, half + c);
    }
  }
  // And the flat of the casing between the two sides, which is the deck.
  for (let s = 0; s < STATIONS; s++) {
    const a = at(s, RINGS);
    const b = at(s + 1, RINGS);
    idx.push(a, half + a, b, b, half + a, half + b);
  }
  // Both ends, closed.
  //
  // A loft is a tube: written without these it is open at the stem and the
  // stern, and what you see there is the inside of her lit from the wrong side
  // -- a flat white sheet where her transom should be. She is a hundred and
  // ten metres long and both of her ends are in shot most of the time.
  for (const [s, wind] of [[0, false], [STATIONS, true]]) {
    for (let r = 0; r < RINGS; r++) {
      const a = at(s, r);
      const b = at(s, r + 1);
      if (wind) idx.push(a, b, half + b, a, half + b, half + a);
      else idx.push(a, half + b, b, a, half + a, half + b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Painted in three bands by the height of each vertex.
  const col = [];
  const hex = (c) => new THREE.Color(c);
  const grey = hex(P.hull);
  const boot = hex(P.boot);
  const foul = hex(P.antifoul);
  const deck = hex(P.deck);
  const all = pos.length / 3;
  for (let i = 0; i < all; i++) {
    const y = pos[i * 3 + 1];
    const t = pos[i * 3 + 2] / HALF;
    const c = y >= sheerAt(t) - 0.06 ? deck
      : y > 0.28 ? grey : y > -0.55 ? boot : foul;
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  g.add(mesh);
  // The casing slatting: a line of gratings down the middle of her, which is
  // what the crew walked on and what tells the eye how long she is.
  for (let z = -HALF + 9; z < HALF - 13; z += 2.4) {
    const d = deckAt(z);
    box(g, M.deckSteel, 2.4, 0.06, 1.9, 0, d + 0.04, z);
  }
}

// ------------------------------------------------------------ the turret --

/**
 * Two 20.3 cm M1924 in one pressure-tight mounting, forward of the tower.
 *
 * It is a cruiser's turret on a submarine and it looks like one: a tall
 * barbette standing out of the casing, a slab-sided gunhouse with a sloped
 * face, the two barrels close together because the mounting had to be as small
 * as a hull opening allows, and the rangefinder across the back of the roof.
 */
function mainTurret(g) {
  const Z = CLS.turrets[0].z;
  const t = new THREE.Group();
  t.position.set(0, deckAt(Z), Z);
  t.userData.dynamic = true;
  // The barbette: pressure-tight, and it goes down into her.
  cyl(t, M.steelDark, 2.35, 2.45, 1.30, 0, -0.55, 0, 20);
  cyl(t, M.light, 2.30, 2.35, 0.55, 0, 0.30, 0, 20);
  // The gunhouse. Rounded corners and a face sloped back, the way the drawing
  // has it: a flat slab would read as a shed.
  loftRings(t, M.light, [
    [2.25, 2.70, 0.00, 0.55],
    [2.28, 2.78, 0.05, 1.00],
    [2.20, 2.72, 0.10, 2.35],
    [1.92, 2.44, 0.14, 2.90],
  ], { n: 20, px: 0.58, pz: 0.62 });
  // The rangefinder across the back of the roof, and its hoods.
  box(t, M.steel, 3.60, 0.42, 0.44, 0, 3.12, -1.30);
  cyl(t, M.gunDark, 0.24, 0.24, 0.30, 1.80, 3.12, -1.30, 10);
  cyl(t, M.gunDark, 0.24, 0.24, 0.30, -1.80, 3.12, -1.30, 10);
  // The sighting hoods either side of the face.
  box(t, M.steel, 0.55, 0.40, 0.60, 1.70, 2.70, 0.90);
  box(t, M.steel, 0.55, 0.40, 0.60, -1.70, 2.70, 0.90);
  // The cradle, which elevates.
  const cradle = new THREE.Group();
  cradle.position.set(0, 1.55, 1.10);
  t.add(cradle);
  const muzzles = [];
  for (const x of [-0.78, 0.78]) {
    // The trunnion block and the slide.
    box(cradle, M.gunDark, 0.62, 0.62, 1.20, x, 0, 0.10);
    // Twenty-three calibres of barrel: 4.67 m of gun outside the face.
    tubeZ(cradle, M.gun, 0.145, 4.70, x, 0.02, 2.55, 12);
    // The muzzle, a shade wider.
    cyl(cradle, M.gunDark, 0.17, 0.17, 0.30, x, 0.02, 4.85, 12);
    muzzles.push([x, 0.02, 5.00]);
  }
  arm(t, cradle, muzzles);
  g.add(t);
  return [t];
}

// -------------------------------------------------------------- the tower --

/**
 * Her conning tower, the hangar abaft it and the crane that served it.
 *
 * The hangar is the thing nothing else in this game has: a pressure-tight
 * cylinder with a door in the after end, a floatplane folded inside it, and a
 * derrick to lift her over the side. Working it meant lying on the surface for
 * twenty minutes, which is the whole argument against the type.
 */
function tower(g) {
  const Z = -2.0;
  const base = deckAt(Z);
  // The tower proper: tall and slab-sided, with the bridge on top.
  loftRings(g, M.light, [
    [2.05, 5.40, Z, base],
    [2.10, 5.55, Z, base + 0.35],
    [2.05, 5.40, Z, base + 3.90],
    [1.85, 4.90, Z, base + 4.60],
  ], { n: 20, px: 0.55, pz: 0.66 });
  // The bridge coaming and the periscope standards.
  loftRings(g, M.steel, [
    [1.55, 2.30, Z + 1.4, base + 4.60],
    [1.60, 2.36, Z + 1.4, base + 4.80],
    [1.52, 2.24, Z + 1.4, base + 5.80],
  ], { n: 18, px: 0.52, pz: 0.62 });
  for (const [x, dz, h] of [[0.42, -0.6, 4.6], [-0.42, -1.5, 4.0]]) {
    cyl(g, M.gunDark, 0.13, 0.13, h, x, base + 5.4 + h / 2, Z + dz, 10);
  }
  // The eight-metre rangefinder on the after end of the bridge: the reason she
  // could shoot at anything further off than she could see from a periscope.
  box(g, M.steel, 5.20, 0.50, 0.55, 0, base + 6.10, Z - 1.6);
  cyl(g, M.gunDark, 0.27, 0.27, 0.34, 2.60, base + 6.10, Z - 1.6, 10);
  cyl(g, M.gunDark, 0.27, 0.27, 0.34, -2.60, base + 6.10, Z - 1.6, 10);
  ladder(g, M.bright, 0, base + 0.2, base + 4.5, Z - 5.0, Z - 5.3);

  // The hangar: a cylinder let into the after end of the tower structure.
  const HZ = -12.5;
  const hb = deckAt(HZ);
  const hangar = new THREE.Group();
  hangar.rotation.x = Math.PI / 2;
  const hg = new THREE.Group();
  cyl(hg, M.light, 1.75, 1.75, 7.00, 0, 0, 0, 20);
  hangar.add(hg);
  hangar.position.set(0, hb + 1.85, HZ);
  g.add(hangar);
  // The door in the after end, and the rails the aeroplane came out on.
  cyl(g, M.steelDark, 1.72, 1.72, 0.22, 0, hb + 1.85, HZ - 3.55, 20);
  sphere(g, M.light, 1.74, 0, hb + 1.85, HZ + 3.40, 14);
  for (const x of [-0.78, 0.78]) {
    box(g, M.deckSteel, 0.20, 0.10, 6.0, x, hb + 0.10, HZ - 7.5);
  }
  // The crane: a derrick stepped abaft the hangar, topped over the side.
  const cz = HZ - 7.2;
  const cb = deckAt(cz);
  cyl(g, M.steel, 0.32, 0.36, 1.10, 0, cb + 0.55, cz, 10);
  const boom = new THREE.Group();
  boom.position.set(0, cb + 1.05, cz);
  boom.rotation.set(0.52, 0.0, 0);
  cyl(boom, M.steel, 0.16, 0.20, 6.40, 0, 3.10, 0, 8);
  g.add(boom);
  cyl(g, M.gunDark, 0.06, 0.06, 1.40, 0, cb + 5.6, cz + 2.6, 6);
}

// ----------------------------------------------------------------- the AA --

/** Two 37 mm on the after end of the tower, and a pair of Hotchkiss below them. */
function flak(g) {
  const out = [];
  const spec = CLS.aa.guns;
  for (const gun of spec) {
    for (const m of gun.mounts) {
      const node = new THREE.Group();
      node.position.set(m.x, m.my, m.z);
      node.userData.dynamic = true;
      const heavy = gun.caliber >= 30;
      cyl(node, M.steelDark, heavy ? 0.46 : 0.30, heavy ? 0.52 : 0.34,
        0.34, 0, 0.17, 0, 12);
      box(node, M.gun, heavy ? 0.70 : 0.46, 0.34, heavy ? 0.80 : 0.52,
        0, 0.52, 0);
      const cradle = new THREE.Group();
      cradle.position.set(0, 0.70, 0);
      cradle.rotation.x = -0.32;
      node.add(cradle);
      const muzzles = [];
      const barrels = m.guns || 1;
      for (let i = 0; i < barrels; i++) {
        const x = (i - (barrels - 1) / 2) * (heavy ? 0.34 : 0.22);
        tubeZ(cradle, M.gunDark, heavy ? 0.055 : 0.032,
          heavy ? 2.10 : 1.30, x, 0, heavy ? 1.05 : 0.65, 8);
        muzzles.push([x, 0, heavy ? 2.10 : 1.30]);
      }
      arm(node, cradle, muzzles);
      g.add(node);
      out.push(node);
    }
  }
  return out;
}

// -------------------------------------------------------------- the tubes --

/** Eight tubes: four in the bow and a trainable four in the casing. */
function tubes(g) {
  const mounts = [];
  // Shaped the way the boat's dive step wants to read them: the bow doors and
  // the stern doors kept apart, each one with the hand it swings on, because
  // opening a cap is a rotation about the hinge and the hinge is on the
  // outboard side of the tube. A flat list of nodes cannot say which way a
  // door opens, and the step that swings them expects to be told.
  const caps = { bow: [], stern: [] };
  for (const m of CLS.torpedoes.mounts) {
    const node = new THREE.Group();
    node.position.set(m.x, m.my, m.z);
    node.userData.dynamic = true;
    if (Math.abs(m.z) > 30) {
      // In the bow. Four doors in the stem, hinged outboard so each swings
      // clear of its own tube mouth, and the dark of the tube behind it.
      for (let i = 0; i < 4; i++) {
        const side = i % 2 ? 1 : -1;
        const x = side * 0.62;
        const y = i < 2 ? 0.55 : -0.55;
        cyl(node, M.cave, 0.26, 0.26, 0.40, x, y, 0.78, 12).rotation.x = Math.PI / 2;
        const hinge = new THREE.Group();
        hinge.position.set(x + side * 0.30, y, 1.0);
        hinge.userData.dynamic = true;
        const leaf = cyl(hinge, M.steelDark, 0.30, 0.30, 0.12, -side * 0.30, 0, 0, 12);
        leaf.rotation.x = Math.PI / 2;
        box(hinge, M.steel, 0.09, 0.11, 0.11, -side * 0.05, 0, 0.04);
        node.add(hinge);
        caps.bow.push({ node: hinge, hand: side });
      }
    } else {
      // The training mount in the casing: a pressure-tight drum with four
      // tubes in it, which is what she had abaft the tower.
      cyl(node, M.steelDark, 0.95, 0.95, 4.60, 0, 0.10, 0, 14);
      for (const x of [-0.45, 0.45]) {
        for (const y of [-0.38, 0.38]) {
          tubeZ(node, M.gunDark, 0.29, 4.90, x, y + 0.10, 0.2, 10);
        }
      }
    }
    g.add(node);
    mounts.push(node);
  }
  return { mounts, caps };
}

/** Her stern: two screws and the rudders and planes round them. */
function stern(g) {
  const z = -HALF + 3.0;
  for (const x of [-1.55, 1.55]) {
    cyl(g, M.steelDark, 0.30, 0.42, 1.30, x, keelAt(-0.94) + 1.9, z + 1.2, 10);
    const boss = new THREE.Group();
    boss.position.set(x, keelAt(-0.94) + 1.9, z + 0.4);
    boss.userData.screw = true;
    boss.userData.dynamic = true;
    cyl(boss, M.brass, 0.22, 0.26, 0.34, 0, 0, 0, 10);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 1.30, 0.06),
        M.brass,
      );
      blade.position.set(Math.sin(a) * 0.62, Math.cos(a) * 0.62, 0);
      blade.rotation.z = -a;
      blade.rotation.y = 0.42;
      boss.add(blade);
    }
    g.add(boss);
  }
  // The rudders, and the after hydroplanes outboard of them.
  box(g, M.hull, 0.16, 2.60, 1.90, 0, keelAt(-0.97) + 1.7, z - 1.4);
  for (const x of [-2.60, 2.60]) {
    box(g, M.hull, 2.10, 0.16, 1.40, x, keelAt(-0.94) + 1.6, z + 0.2);
  }
  // And the forward planes, on the bow.
  for (const x of [-3.10, 3.10]) {
    box(g, M.hull, 2.40, 0.16, 1.50, x, 0.45, HALF - 12.0);
  }
}

export function buildSurcouf() {
  const g = new THREE.Group();
  hull(g);
  tower(g);
  stern(g);
  // Her insides, on the pressure hull's lines -- the only part of her that has
  // an inside at all.
  buildInterior(g, {
    loa: LOA,
    shellAt: (t, y) => {
      const r = hullR(t);
      const dy = y - PY;
      if (Math.abs(dy) >= r) return 0.02;
      return Math.sqrt(Math.max(0, r * r - dy * dy)) * 0.94;
    },
    keelY: (t) => PY - hullR(t) * 0.94,
    sheer: (t) => PY + hullR(t) * 0.88,
    zAt: (t) => t * HALF,
  });
  mergeStatic(g, bySection(LOA));
  const turrets = mainTurret(g);
  const aaMounts = flak(g);
  const { mounts: torpMounts, caps } = tubes(g);
  mergeMoving(g);
  g.userData.classId = 'surcouf';
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckAt(0),
    secMounts: [], aaMounts, torpMounts, tubeCaps: caps,
  };
}
