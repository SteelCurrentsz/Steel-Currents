// HMS Rodney, drawn from the owner's reference sculpt of her.
//
// Two hundred and sixteen metres of the most peculiar battleship ever built:
// nine sixteen-inch guns in three triple turrets, every one of them forward of
// a tower bridge like a block of flats, so that the armoured citadel round her
// magazines and machinery could be short enough to be fourteen inches thick
// inside a Washington treaty tonnage. Her twelve 6-inch are all aft, round her
// after superstructure, and she has two torpedo tubes under water in her bow.
//
// Her hull, her tower, her funnel and her masts are the sculpt (see
// rodneyHull.js and build/prepare-rodney-hull.mjs), in the 1942 Admiralty
// disruptive scheme the sculpt is painted in, cleaned of the texture's stains
// and smears; plated in steel and decked in teak. What is built here is
// everything that moves or fires:
//
//   * her three 16-inch turrets, the sculpt's own gunhouses cut free of her
//     and painted as she is, with their barrels turned true along the
//     sculpt's barrels -- A low on the forecastle, B superfiring on its
//     barbette, and X low again in front of her tower;
//   * her six 6-inch twins, each the owner's own sculpt of the gun on a
//     barbette where the ship sculpt drew a lump for it: two pairs facing
//     ahead, the middle one superfiring, and one pair at the after end of her
//     superstructure facing astern;
//   * her six 4.7-inch HA guns on her upper deck either side of her after
//     superstructure, her eight-barrelled pom-poms on the platforms either
//     side of her funnel and her four-barrelled ones in the tubs abreast her
//     mainmast, and her Oerlikons;
//   * her two submerged 24.5-inch bow tubes, and the sluice doors in her side
//     they fire through;
//   * her screws, which turn;
//
// and, inside her, her armour -- the inclined belt and the armoured deck of
// her citadel, and its bulkheads -- and her interior, fitted to her own lines.
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, starboard is -X,
// y = 0 is the waterline.

import * as THREE from '../../../vendor/three.module.js';
import { arm } from './mounts.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { lightMounts } from '../../../shared/sim.js';
import { box, cyl, strip, sheet } from './shipkit.js';
import { oerlikon } from './usnguns.js';
import { fourPointSeven, pomPom8, pomPom4, bowTube } from './rnguns.js';
import {
  buildRodneyHull, rodneySeatY, rodneySurfaceY, turretPieces, TURRET_PIECES, secondaryPieces,
  SECONDARY_PIECE, SCULPT_LINES, rodneyMaterials,
} from './rodneyHull.js';

const CLS = SHIP_CLASSES.rodney;
export const LOA = CLS.hull.length;      // 216.4 m
export const BEAM = CLS.hull.beam;       // 33.8 m
export const DRAFT = CLS.hull.draft;     // 8.6 m

// Her own paints, for everything built here, as the sculpt's cleaned paint
// has them (see build/prepare-rodney-hull.mjs): the Admiralty light grey her
// guns and her upperworks are in, its dark blue, and the rest.
const P = {
  light: 0x849aa5,
  dark: 0x1f3546,
  steel: 0x7a8f99,
  steelDark: 0x55636b,
  gun: 0x849aa5,
  gunDark: 0x4a565d,
  canvas: 0x8c8a7c,
  glass: 0x25303a,
  brass: 0x8a7340,
  deckDark: 0x5d6a71,
  armour: 0x4d555c,
};

const MATS = {};
function mat(color) {
  if (!MATS[color]) MATS[color] = new THREE.MeshLambertMaterial({ color });
  return MATS[color];
}
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

// ------------------------------------------------------------- her lines --
//
// Off the sculpt, a metre at a time along her (see the build script): her
// keel, the deck over her insides, and how far out her side is at every half
// metre of height. They are what her interior and her armour are fitted under
// and what the fleet's checks feel her plating over.

const L = SCULPT_LINES;
const along = (z) => Math.max(0, Math.min(L.nz - 1.0001, (z - L.z0) / L.dz));
const lerp = (arr, f) => {
  const i = Math.floor(f);
  const u = f - i;
  return arr[i] * (1 - u) + arr[Math.min(arr.length - 1, i + 1)] * u;
};
/** Her station at fraction t of her length, bow +1, as a z. */
export const zAt = (t) => (t * LOA) / 2;
/** The bottom of her keel at station t. */
export function keelY(t) {
  const f = along(zAt(t));
  const i = Math.floor(f);
  const a = L.keel[i] > 50 ? L.keel[Math.min(L.nz - 1, i + 1)] : L.keel[i];
  const b = L.keel[Math.min(L.nz - 1, i + 1)] > 50 ? a : L.keel[Math.min(L.nz - 1, i + 1)];
  const u = f - i;
  return a * (1 - u) + b * u;
}
/** The deck over her insides at station t: her upper deck, end to end. */
export function deckOver(t) {
  return lerp(L.deck, along(zAt(t)));
}
/** How far out from her centreline her side is, at station t and height y. */
export function shellAt(t, y) {
  const f = along(zAt(t));
  const g = Math.max(0, Math.min(L.ny - 1.0001, (y - L.y0) / L.dy));
  const i = Math.floor(f);
  const j = Math.floor(g);
  const u = f - i;
  const v = g - j;
  const at = (a, b) => L.half[Math.min(L.nz - 1, a) * L.ny + Math.min(L.ny - 1, b)];
  return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v)
    + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
}
/** Her lines, for the interior and the tests. */
export const LINES = { loa: LOA, sheer: deckOver, keelY, shellAt, zAt };
/** How far her inner bottom stands over her keel, which her insides stand on. */
const INNER_BOTTOM = 0.15;
/** Where her deck is at (0, z): her own surface on the centreline. */
export const deckAt = (z) => rodneySurfaceY(0, z);

// ---------------------------------------------------------- main battery --

/**
 * One of her 16-inch/45 Mk I triples, as the sculpt drew it.
 *
 * The gunhouse is the piece of her the build script's box took out of her,
 * down to the barbette or ring it trains on, so it stands exactly where the
 * sculpt had it and turns about the middle of that barbette. The barrels are
 * measured off the sculpt -- where each runs, how far apart, how thick along
 * its length -- and turned true: they elevate together in one cradle, as a
 * Nelson's did, about trunnions just inside the face.
 */
function sixteenInch(g, i) {
  const spec = TURRET_PIECES[i];
  const { house, guns } = turretPieces(i);
  const m = new THREE.Group();
  m.position.set(0, spec.seat, spec.z);
  // Her bearing is her rotation: the simulation lays her by setting it. All
  // three face ahead.
  m.rotation.y = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = CLS.gun.traverse;
  // The gunhouse in her own paint, plated as her upperworks are.
  m.add(new THREE.Mesh(house, rodneyMaterials().plating));
  const cradle = new THREE.Group();
  cradle.position.set(spec.trunnion[0], spec.trunnion[1], spec.trunnion[2]);
  cradle.rotation.x = -spec.pitch;
  cradle.add(new THREE.Mesh(guns, M.gun));
  // The canvas blast bags where the barrels go through the face, so no
  // elevation shows daylight round them.
  for (const [x] of spec.muzzles) {
    cyl(cradle, M.canvas, 0.86, 0.94, 1.1, x, 0, 0.75, 16).rotation.x = Math.PI / 2;
  }
  m.add(cradle);
  arm(m, cradle, spec.muzzles);
  g.add(m);
  return m;
}

function mainBattery(g) {
  const turrets = TURRET_PIECES.map((_, i) => sixteenInch(g, i));
  g.userData.turrets = turrets;
  return turrets;
}

// ------------------------------------------------------ secondary battery --

/**
 * Where each of her 6-inch twins stands, off the build script: the middle of
 * the lump the sculpt drew for it, which way it faces, and the top of the
 * barbette it trains on. The datasheet lists them port and starboard in
 * pairs, as the build lists the port ones.
 */
function secondarySeat(m) {
  const seat = SECONDARY_PIECE.seats.find((s) => Math.abs(s.x - Math.abs(m.x)) < 0.05 && Math.abs(s.z - m.z) < 0.05);
  if (!seat) throw new Error(`the Rodney has a 6-inch turret at ${m.x}, ${m.z} her build does not`);
  return seat;
}

/**
 * One of her 6-inch/50 Mk XXII twins in its Mk XVIII turret: the owner's own
 * sculpt of it, turned to face ahead and cut off square at its foot, with its
 * barrels turned true along the sculpt's. The after pair, which the ship
 * sculpt painted in the dark blue of her camouflage, are in it here too.
 */
function sixInch(g, spec, paint) {
  const seat = secondarySeat(spec);
  const { house, guns } = secondaryPieces();
  const m = new THREE.Group();
  m.position.set(spec.x, seat.up, spec.z);
  m.rotation.y = seat.rest;
  // Laid by the bearing the simulation gives her, in her own frame: her
  // rotation is her bearing, not an offset from where she was built.
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = CLS.secondary.traverse;
  m.add(new THREE.Mesh(house, paint));
  const cradle = new THREE.Group();
  cradle.position.set(...SECONDARY_PIECE.trunnion);
  cradle.rotation.x = -SECONDARY_PIECE.pitch;
  cradle.add(new THREE.Mesh(guns, M.gun));
  for (const [x] of SECONDARY_PIECE.muzzles) {
    cyl(cradle, M.canvas, 0.34, 0.38, 0.5, x, 0, 0.4, 12).rotation.x = Math.PI / 2;
  }
  m.add(cradle);
  arm(m, cradle, SECONDARY_PIECE.muzzles);
  g.add(m);
  return m;
}

/**
 * The barbette each 6-inch trains on, from her deck up to its roller path, in
 * the paint of the turret on it.
 */
function secondaryBarbettes(g) {
  for (const spec of CLS.secondary.mounts) {
    const seat = secondarySeat(spec);
    const foot = rodneySeatY(spec.x, spec.z, 1.4) - 0.2;
    const h = seat.up - foot;
    cyl(g, seat.rest > 1 ? M.dark : M.light, 2.85, 3.0, h, spec.x, foot + h / 2, spec.z, 28);
    // The ring the turret sits on, a hand wider than the barbette.
    cyl(g, M.gunDark, 3.1, 3.1, 0.14, spec.x, seat.up - 0.07, spec.z, 28);
  }
}

// -------------------------------------------------- the anti-aircraft guns --

// Drawn where she stows the mounting, not on the middle of its arc.
const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);

function mountings(g) {
  const sec = [];
  const aa = [];
  const torp = [];
  // The 6-inch: the forward and middle pairs in her light grey, the after
  // pair in her dark blue, as the ship sculpt painted the lumps they replace.
  const light = new THREE.MeshPhongMaterial({ color: P.light });
  const dark = new THREE.MeshPhongMaterial({ color: P.dark });
  for (const spec of CLS.secondary.mounts) {
    const seat = secondarySeat(spec);
    sec.push(sixInch(g, spec, seat.rest > 1 ? dark : light));
  }
  // Every light mounting is laid by the scene, and carries its own arc and
  // stops off her datasheet (see ShipView.layMounts), and how high its
  // barrels have to be to clear her, bearing by bearing.
  const lights = lightMounts(CLS);
  let k = 0;
  for (const gun of CLS.aa.guns) {
    for (const m of gun.mounts) {
      let a;
      if (gun.caliber === 120) {
        a = fourPointSeven(g, M, m.x, rodneySeatY(m.x, m.z, 1.0), m.z, stowed(m));
      } else if (gun.caliber === 40) {
        // In its tub, on the floor of it.
        const y = rodneySeatY(m.x, m.z, m.guns === 8 ? 1.6 : 0.9);
        a = (m.guns === 8 ? pomPom8 : pomPom4)(g, M, m.x, y, m.z, stowed(m));
      } else {
        a = oerlikon(g, M, m.x, rodneySeatY(m.x, m.z, 0.8), m.z, stowed(m));
        // The gun trains inside its tub, and the tub is turned to open
        // behind it; the scene lays the gun by its bearing in her frame, so
        // it hangs off her, not off the tub, where the tub has it.
        const tub = a.parent;
        a.removeFromParent();
        a.position.set(tub.position.x, tub.position.y + a.position.y, tub.position.z);
        a.rotation.y = stowed(m);
        g.add(a);
      }
      a.userData.rest = 0;
      a.userData.sector = { angle: m.angle, arc: m.arc, stow: stowed(m) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = m.lift || null;
      aa.push(a);
      k++;
    }
  }
  if (k !== lights.length) throw new Error('the Rodney built a light battery her datasheet does not list');
  // Her bow tubes, and the doors they fire through.
  for (const m of CLS.torpedoes.mounts) {
    const t = bowTube(g, M, m.x, m.my, m.z, m.angle, tubeLength(m));
    t.userData.rest = 0;
    torp.push(t);
  }
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  g.userData.torpMounts = torp;
  return { sec, aa, torp };
}

// ------------------------------------------------------------- the tubes --

/**
 * How far from its breech a bow tube runs before it reaches her side: along
 * its own bearing, to where her plating is at the height of the tube.
 */
function tubeLength(m) {
  const dx = Math.sin(m.angle), dz = Math.cos(m.angle);
  for (let s = 0.5; s < 30; s += 0.05) {
    const x = m.x + dx * s, z = m.z + dz * s;
    if (Math.abs(x) >= shellAt((2 * z) / LOA, m.my) - 0.05) return s;
  }
  return 6;
}

/**
 * The sluice door each tube fires through: a round plate in her side a few
 * metres under the water, square to the tube, with the ring of rivets it
 * seats on.
 */
function tubeDoors(g) {
  for (const m of CLS.torpedoes.mounts) {
    const s = tubeLength(m);
    const x = m.x + Math.sin(m.angle) * s, z = m.z + Math.cos(m.angle) * s;
    const door = new THREE.Group();
    door.position.set(x, m.my, z);
    door.rotation.y = m.angle;
    cyl(door, M.gunDark, 0.62, 0.62, 0.08, 0, 0, 0.02, 20).rotation.x = Math.PI / 2;
    cyl(door, M.glass, 0.44, 0.44, 0.1, 0, 0, 0.04, 20).rotation.x = Math.PI / 2;
    g.add(door);
  }
}

// ------------------------------------------------------------ her armour --

/**
 * Her armour, as structure inside the ship: none of it is to be seen while her
 * plating is whole, and all of it is when a shell has opened her up.
 *
 *   the belt          356 mm over her magazines and 330 over her machinery,
 *                     inside her plating and inclined eighteen degrees, top
 *                     outboard, from her middle deck to well under the water
 *   the armour deck   159 mm on her middle deck over the citadel
 *   the bulkheads     that close the citadel at both ends
 *   the barbettes     of A, B and X down to the armour deck
 *
 * The citadel is short -- from A's magazines to the after end of her
 * machinery -- because that is the whole idea of the ship.
 */
const CITADEL = [-66, 50];
const ARMOUR_DECK = 3.1;
const BELT_FOOT = -5.2;

function armour(g) {
  const inside = (o) => { o.userData.inside = true; return o; };
  const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
  const N = 48;
  const [z0, z1] = CITADEL;
  // The belt, inclined eighteen degrees: a metre inboard of her plating at
  // the armour deck, and the rake of the plate further in at its foot.
  const rake = Math.tan((18 * Math.PI) / 180) * (ARMOUR_DECK - BELT_FOOT);
  const belt = strip();
  for (let i = 0; i < N; i++) {
    const za = z0 + ((z1 - z0) * i) / N;
    const zb = z0 + ((z1 - z0) * (i + 1)) / N;
    for (const sgn of [-1, 1]) {
      belt.quad([sgn * at(za, ARMOUR_DECK, 1.0), ARMOUR_DECK, za], [sgn * at(za, BELT_FOOT, 1.0 + rake), BELT_FOOT, za],
        [sgn * at(zb, BELT_FOOT, 1.0 + rake), BELT_FOOT, zb], [sgn * at(zb, ARMOUR_DECK, 1.0), ARMOUR_DECK, zb],
        [-sgn, 0, 0]);
    }
  }
  inside(belt.mesh(g, M.armour));
  // The armour deck, over the top of the belt, both faces.
  for (const up of [true, false]) {
    inside(sheet(g, M.armour, z0, z1, (z) => at(z, ARMOUR_DECK, 1.0), () => ARMOUR_DECK + (up ? 0.08 : -0.08), 40, up));
  }
  // The bulkheads that close the citadel, cut to her section at every height.
  for (const z of [z0, z1]) {
    const bh = strip();
    const ys = [];
    for (let y = BELT_FOOT; y < ARMOUR_DECK; y += 1.0) ys.push(y);
    ys.push(ARMOUR_DECK);
    for (let i = 0; i < ys.length - 1; i++) {
      const wa = at(z, ys[i], 1.3), wb = at(z, ys[i + 1], 1.3);
      for (const face of [1, -1]) {
        bh.quad([-wa, ys[i], z], [wa, ys[i], z], [wb, ys[i + 1], z], [-wb, ys[i + 1], z], [0, 0, face]);
      }
    }
    inside(bh.mesh(g, M.armour));
  }
  // The barbettes of her three turrets, down from their gunhouses through her
  // decks to the armour deck: fifteen inches of it, and the trunk every shell
  // and every charge comes up.
  for (const t of TURRET_PIECES) {
    const top = deckAt(t.z) - 0.4;
    inside(cyl(g, M.armour, 5.6, 5.6, top - ARMOUR_DECK, 0, (top + ARMOUR_DECK) / 2, t.z, 28));
  }
}

// --------------------------------------------------------------- screws --

// Her two shafts, and the four-bladed screw on each, where the sculpt had
// them before the build cut them off (see prepare-rodney-hull.mjs).
const SCREWS = [
  { x: -4.3, y: -5.6, z: -90.9, r: 2.7, hand: -1 },
  { x: 4.3, y: -5.6, z: -90.9, r: 2.7, hand: 1 },
];

function screws(g) {
  for (const s of SCREWS) {
    const hub = new THREE.Group();
    hub.position.set(s.x, s.y, s.z);
    // She turns, so the welder is told to leave her alone.
    hub.userData.dynamic = true;
    hub.userData.screw = { hand: s.hand };
    cyl(hub, M.brass, 0.62, 0.45, 1.1, 0, 0, 0, 14).rotation.x = Math.PI / 2;
    cyl(hub, M.brass, 0.45, 0.12, 0.7, 0, 0, -0.85, 12).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const bl = box(hub, M.brass, s.r * 0.55, 0.12, s.r * 1.45,
        Math.sin(a) * s.r * 0.55, Math.cos(a) * s.r * 0.55, 0);
      bl.rotation.z = a;
      bl.rotation.x = 0.4 * s.hand;
    }
    g.add(hub);
  }
}

// ---------------------------------------------------------------- build ----

// What is built here besides her guns: the sculpt, and the parts of her that
// are not the sculpt -- the barbettes her 6-inch stand on, the doors her bow
// tubes fire through, her armour and her screws.
const STATIC = [
  ['hullModel', buildRodneyHull],
  ['barbettes', secondaryBarbettes],
  ['tubeDoors', tubeDoors],
  ['armour', armour],
  ['screws', screws],
];

export function buildRodney() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  // Her insides stand on her inner bottom, a hand's breadth over her keel.
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  // And inside every part of her that moves, after her batteries are on her.
  mergeMoving(g);
  g.userData.classId = 'rodney';
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
    torpMounts: g.userData.torpMounts || [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function rodneyParts() {
  const parts = [];
  const builders = [...STATIC, ['mainBattery', mainBattery], ['mountings', mountings]];
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
