// IJN Takao, drawn from the owner's reference sculpt.
//
// Two hundred and four metres of Japanese heavy cruiser: ten twenty-centimetre
// guns in five twin turrets, sixteen Long Lance tubes on the upper deck, and
// thirty-four and a half knots on fifteen thousand tonnes. She is a torpedo
// ship with a heavy gun armament bolted on, and the thing that makes her
// dangerous is not the guns -- the Type 93 is oxygen-driven, forty knots,
// twenty kilometres, and leaves no wake to see it coming.
//
// Her hull, her castle of a bridge, her funnels and masts are the sculpt (see
// takaoHull.js and build/prepare-takao-hull.mjs): stripped of its rigging,
// smoothed, textured, and cut open where she carried her guns. What is built
// here is everything that moves or fires:
//
//   * her five turrets, the sculpt's own gunhouses cut free of her and rigged
//     to train, with barrels turned true along the sculpt's barrels, rigged to
//     elevate -- three forward, No.3 facing aft at the foot of the bridge and
//     No.2 superfiring over both, and two aft;
//   * her four 12.7 cm Type 89 twins, in the sculpt's own tubs abreast the
//     funnels;
//   * her four quadruple Long Lance mountings on the upper deck, each trained
//     out through its own opening in her side -- the three slots a side that
//     are the thing you know a Takao by from abeam -- with the reloads racked
//     behind the forward opening;
//   * her ten triple and four twin 25 mm, on her bridge wings, her shelter
//     deck, her aircraft deck and fore and aft;
//   * her catapults on the sculpt's turntables and the floatplanes on them,
//     her screws, and her capstans and bollards, pressed flat out of the
//     sculpt as lumps and drawn here as the fittings they were.
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
import { box, cyl, tubeZ } from './shipkit.js';
import { jake } from './planekit.js';
import { typeEightNine, triple25, twin25 } from './ijnguns.js';
import {
  buildTakaoHull, takaoSeatY, takaoSurfaceY, turretPieces, TURRET_PIECES, SCULPT_LINES,
} from './takaoHull.js';

const CLS = SHIP_CLASSES.takao;
export const LOA = CLS.hull.length;      // 203.8 m
export const BEAM = CLS.hull.beam;       // 20.4 m
export const DRAFT = CLS.hull.draft;     // 6.3 m
/** Starboard, in this frame. */
const S = -1;

// Yokosuka grey, which is darker and bluer than the Kure grey Yamato wears,
// for everything built here; her hull carries the same paint as vertex colour.
const P = {
  hull: 0x565e67,
  deck: 0x8a6c48,          // linoleum
  deckSteel: 0x4b5259,
  steel: 0x646c75,
  steelDark: 0x4f565e,
  gun: 0x5e666f,
  gunDark: 0x3b4147,
  canvas: 0x87877c,
  glass: 0x27333e,
  cave: 0x13171b,
  brass: 0x8a7340,
  torpedo: 0x2e3338,
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
// metre of height. They are what her interior is fitted under and what the
// fleet's checks feel her plating over.

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
  // Beyond her ends there is no keel; the nearest station that has one.
  const a = L.keel[i] > 50 ? L.keel[Math.min(L.nz - 1, i + 1)] : L.keel[i];
  const b = L.keel[Math.min(L.nz - 1, i + 1)] > 50 ? a : L.keel[Math.min(L.nz - 1, i + 1)];
  const u = f - i;
  return a * (1 - u) + b * u;
}
/**
 * The deck over her insides at station t: the lowest deck anywhere across
 * her there with open air over it -- her forecastle and quarterdeck at the
 * ends, the upper deck her tubes stand on amidships.
 */
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
export const deckAt = (z) => takaoSurfaceY(0, z);

// ---------------------------------------------------------- main battery --

/**
 * One of her 20.3 cm/50 Type 3 No.2 twin turrets, as the sculpt drew it.
 *
 * The gunhouse is the piece of her the build script's box took out of her,
 * down to the deck or barbette it trains on, so it stands exactly where the
 * sculpt had it and turns about the pivot the sculpt's own barbette is
 * centred on. The barrels are measured off the sculpt -- where each runs, how
 * far apart, how thick along its length -- and turned true: they elevate
 * about trunnions just inside the face, from the few degrees the sculpt stows
 * them at.
 */
// How far each turret stands up on its barbette above where the sculpt cast
// it. The sculpt sinks the three on her open deck -- No.1, No.3 and No.5 --
// down to their roller paths, with the axis of the guns seven-tenths of a
// metre off the deck and level with the top of her bulwark: trained on the
// beam and laid for a ship at five miles, they went into her own side. The
// ship had them a good deal higher than that, and so does this -- high enough
// for the guns to come down to their depression stop over the bulwark -- with
// the superfiring pair still clear over their roofs.
const RAISE = [0.5, 0, 0.55, 0, 0.65];

function twentyCm(g, i) {
  const spec = TURRET_PIECES[i];
  const { house, guns } = turretPieces(i);
  const m = new THREE.Group();
  m.position.set(0, spec.seat + RAISE[i], spec.z);
  // Her bearing is her rotation: the simulation lays her by setting it.
  m.rotation.y = spec.facing;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = CLS.gun.traverse;
  m.add(new THREE.Mesh(house, M.gun));
  const cradle = new THREE.Group();
  cradle.position.set(spec.trunnion[0], spec.trunnion[1], spec.trunnion[2]);
  cradle.rotation.x = -spec.pitch;
  cradle.add(new THREE.Mesh(guns, M.gun));
  // The canvas blast bags where the barrels go through the face, so no
  // elevation shows daylight round them.
  for (const [x] of spec.muzzles) {
    cyl(cradle, M.canvas, 0.74, 0.80, 0.9, x, 0, 0.75, 14).rotation.x = Math.PI / 2;
  }
  m.add(cradle);
  arm(m, cradle, spec.muzzles);
  g.add(m);
  return m;
}

function mainBattery(g) {
  const turrets = TURRET_PIECES.map((_, i) => twentyCm(g, i));
  g.userData.turrets = turrets;
  return turrets;
}

/**
 * The roller paths the three turrets on her open deck train on, which are
 * ship and not gun. The sculpt's own is a ragged flange a box cuts to pieces,
 * so it goes and this stands in its place, under the gunhouse.
 */
function barbettes(g) {
  TURRET_PIECES.forEach((spec, i) => {
    if (!spec.lift) return;
    const h = spec.lift + RAISE[i] + 0.12;
    cyl(g, M.steelDark, 3.25, 3.4, h, 0, spec.seat - 0.12 + h / 2, spec.z, 28);
    cyl(g, M.deckSteel, 3.6, 3.6, 0.1, 0, spec.seat - 0.05, spec.z, 28);
  });
  // And the pedestals her 12.7 cm twins stand on in their tubs (see
  // mountings).
  for (const m of CLS.secondary.mounts) {
    const floor = secSeat(m);
    const top = floor + SEC_UP - 0.34;
    cyl(g, M.steelDark, 1.62, 1.72, top - floor + 0.05, m.x, (top + floor - 0.05) / 2, m.z, 20);
  }
}

// ------------------------------------------------------------ the tubes --

// Her four quadruple mountings, off her datasheet. Each stands on the upper
// deck inside her side and trains out through the opening in front of it.
const TORP = CLS.torpedoes;
// The upper deck they stand on, amidships: under the shelter deck for the
// forward pair and the reloads, in the open well for the after pair. It is
// not her surface there -- a height map sees the shelter deck over it -- so it
// is the deck over her insides, which is exactly this deck.
const upperDeck = (z) => deckOver((2 * z) / LOA);

/**
 * A quadruple Type 92 Model 1 mounting for the 61 cm Type 93.
 *
 * Four tubes two over two in a shield, low enough to train under her shelter
 * deck -- there is a metre and three quarters between the upper deck and the
 * deckhead there -- and pivoted near its breech end, so that trained out on the
 * beam its muzzles stand out through the opening in her side and its breech
 * clears the deckhouse inboard of it.
 */
function longLance(g, x, y, z, angle) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = TORP.traverse;
  // The training ring and the platform the crew stand on.
  cyl(m, M.gunDark, 1.35, 1.5, 0.22, 0, 0.11, 0, 18);
  box(m, M.steelDark, 2.1, 0.12, 3.6, 0, 0.26, -0.8);
  const muzzles = [];
  const REAR = -3.1;
  const FRONT = 5.3;
  const len = FRONT - REAR;
  const mid = (FRONT + REAR) / 2;
  for (const dy of [0.62, 1.2]) {
    for (const dx of [-0.36, 0.36]) {
      tubeZ(m, M.steel, 0.27, len, dx, dy, mid, 12);
      // The muzzle band and the door over it.
      cyl(m, M.gunDark, 0.3, 0.3, 0.16, dx, dy, FRONT - 0.1, 12).rotation.x = Math.PI / 2;
      muzzles.push([dx, dy, FRONT]);
    }
  }
  // The shield: sides, roof and the breech end, open at the muzzles.
  box(m, M.gunDark, 1.66, 0.08, len - 1.6, 0, 1.52, mid - 0.8);
  for (const sgn of [-1, 1]) {
    box(m, M.gunDark, 0.08, 1.2, len - 1.6, sgn * 0.8, 0.94, mid - 0.8);
    // The stiffeners down it.
    for (let k = 0; k < 4; k++) {
      box(m, M.steelDark, 0.06, 1.1, 0.12, sgn * 0.85, 0.94, REAR + 0.9 + k * 1.7);
    }
  }
  box(m, M.gunDark, 1.66, 1.26, 0.1, 0, 0.93, REAR);
  // The layer's hood on the roof, low, and the sight in it.
  box(m, M.gunDark, 0.7, 0.18, 0.9, -0.4, 1.63, REAR + 1.2);
  box(m, M.glass, 0.5, 0.08, 0.06, -0.4, 1.63, REAR + 1.66);
  arm(m, m, muzzles);
  g.add(m);
  return m;
}

/**
 * The reloads behind the forward opening: four more Type 93s a side, racked
 * two over two on their trolleys fore and aft along the passage, which is the
 * torpedo you see through the forward slot in her side.
 */
function reloads(g) {
  for (const sgn of [-1, 1]) {
    const x = sgn * 7.9;
    const y = upperDeck(5.6);
    for (let k = 0; k < 3; k++) box(g, M.steelDark, 1.7, 0.14, 0.2, x, y + 0.12, 2.6 + k * 3.0);
    for (const dy of [0.45, 1.05]) {
      for (const dx of [-0.35, 0.35]) {
        const tx = x + dx;
        tubeZ(g, M.torpedo, 0.27, 7.6, tx, y + dy, 5.6, 12);
        // The warhead, which is what the Type 93 is.
        cyl(g, M.torpedo, 0.27, 0.12, 0.7, tx, y + dy, 9.75, 12).rotation.x = Math.PI / 2;
      }
    }
  }
}

// ------------------------------------------------------ the other guns --

// Every mounting is stood on whatever of her is under its pivot -- deck, tub
// or platform -- read off the sculpt, in the place the sculpt had cast the gun
// into her before it was cut out.
const seat = (m, r) => takaoSeatY(m.x, m.z, r);
// Drawn where she stows the mounting, not on the middle of its arc.
const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);
// The floor of a 12.7 cm twin's tub, the same both sides of her.
const secSeat = (m) => Math.max(takaoSeatY(m.x, m.z, 1.3), takaoSeatY(-m.x, m.z, 1.3));
// How high over it the mounting stands. The sculpt's tubs are walled a metre
// and a half high, level with the trunnions of a twin stood on the floor of
// one: trained on the beam, its guns went into the wall. So each stands on a
// pedestal, high enough for its guns to come down to their depression stop
// over the rim.
const SEC_UP = 0.7;

function mountings(g) {
  const sec = [];
  const aa = [];
  const torp = [];
  // The 12.7 cm twins in their tubs.
  for (const m of CLS.secondary.mounts) {
    const s = typeEightNine(g, M, m.x, secSeat(m) + SEC_UP, m.z, stowed(m));
    // Laid by the bearing the simulation gives her, in her own frame: her
    // rotation is her bearing, not an offset from where she was built.
    s.userData.rest = 0;
    sec.push(s);
  }
  // The light battery, laid by the scene: each carries its own arc and stops
  // off her datasheet (see ShipView.layMounts).
  const light = lightMounts(CLS);
  let k = 0;
  for (const gun of CLS.aa.guns) {
    for (const m of gun.mounts) {
      const y = seat(m, 0.9) + 0.16;
      const a = m.guns === 2 ? twin25(g, M, m.x, y, m.z, stowed(m)) : triple25(g, M, m.x, y, m.z, stowed(m));
      a.userData.rest = 0;
      a.userData.sector = { angle: m.angle, arc: m.arc, stow: stowed(m) };
      a.userData.stops = gun.elev || null;
      // And how high its barrels have to be to clear her, bearing by bearing.
      a.userData.lift = m.lift || null;
      aa.push(a);
      k++;
    }
  }
  if (k !== light.length) throw new Error('the Takao built a light battery her datasheet does not list');
  // The tubes, trained out through their openings.
  for (const m of TORP.mounts) {
    const t = longLance(g, m.x, upperDeck(m.z) + 0.02, m.z, stowed(m));
    t.userData.rest = 0;
    torp.push(t);
  }
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  g.userData.torpMounts = torp;
  return { sec, aa, torp };
}

// ----------------------------------------------------------- aviation --

// The catapult turntables the sculpt has at her deck edges abreast the
// mainmast, and her aircraft deck abaft them.
const CAT_X = 10.2;
const CAT_Z = -26.6;
const CAT_LEN = 19.0;

/**
 * Her two catapults, on the sculpt's own turntables at the deck edge, stowed
 * fore and aft pointing aft along her aircraft deck -- where their charge
 * houses and girders lie in every photograph of her -- with a Jake on each.
 */
function aviation(g) {
  for (const sgn of [-1, 1]) {
    const x = sgn * CAT_X;
    const y = takaoSeatY(x, CAT_Z, 1.1);
    const c = new THREE.Group();
    c.position.set(x, y, CAT_Z);
    c.rotation.y = Math.PI + sgn * 0.06;
    c.userData.dynamic = true;
    cyl(c, M.steelDark, 1.3, 1.45, 0.3, 0, 0.15, 0, 16);
    box(c, M.steel, 1.4, 0.6, CAT_LEN, 0, 0.6, CAT_LEN / 2 - 3.0);
    // The girder's webs and the rails along the top.
    for (let i = 0; i <= 14; i++) {
      box(c, M.steelDark, 1.5, 0.12, 0.2, 0, 0.36, -2.6 + i * ((CAT_LEN - 0.8) / 14));
    }
    for (const dx of [-0.46, 0.46]) box(c, M.steelDark, 0.14, 0.14, CAT_LEN, dx, 0.97, CAT_LEN / 2 - 3.0);
    box(c, M.steelDark, 1.8, 0.5, 1.8, 0, 0.55, -3.4);        // the charge house
    box(c, M.steel, 2.0, 0.2, 2.2, 0, 0.98, CAT_LEN - 4.0);   // the head
    g.add(c);
  }
}

/**
 * Her floatplanes: a Jake on each catapult, and a third struck down on her
 * aircraft deck with her wings folded, on the centreline where the sculpt had
 * its own. Kept out of the ship's own builders, as the carriers' are.
 */
function airGroup(g) {
  for (const sgn of [-1, 1]) {
    const x = sgn * CAT_X;
    const y = takaoSeatY(x, CAT_Z, 1.1) + 1.06;
    const a = jake(g, x - sgn * 0.5, y, CAT_Z - 6.5, Math.PI + sgn * 0.06, false, {});
    a.userData.wings?.stowed?.removeFromParent();
  }
  const y = takaoSeatY(-1.8, -33.5, 1.5) + 0.3;
  box(g, M.steelDark, 3.6, 0.3, 6.0, -1.8, y - 0.15, -33.5);
  const a = jake(g, -1.8, y, -33.5, Math.PI, true, {});
  a.userData.wings?.spread?.removeFromParent();
}

// ------------------------------------------------------------- fittings --

/**
 * Her capstans and bollards, in the places the sculpt had them as lumps --
 * pressed flat out of her deck by the build script and drawn here as what
 * they are -- and her ensign staff.
 */
function fittings(g) {
  const on = (x, z) => takaoSeatY(x, z, 0.5);
  // The capstans: two on the forecastle abaft the cable gear, two right aft.
  for (const [x, z] of [[2.5, 84.5], [-2.5, 84.5], [3.2, -84.2], [-3.2, -84.2]]) {
    const y = on(x, z);
    cyl(g, M.steelDark, 0.95, 1.05, 0.55, x, y + 0.28, z, 16);
    cyl(g, M.gunDark, 0.72, 0.8, 0.5, x, y + 0.8, z, 16);
    cyl(g, M.steelDark, 0.9, 0.9, 0.1, x, y + 1.1, z, 16);
  }
  // Bollards in pairs along each side of her forecastle and quarterdeck.
  for (const z of [92, 76, 66, -66, -72.5, -78, -90]) {
    for (const sgn of [-1, 1]) {
      const hw = Math.max(1, shellAt((2 * z) / LOA, deckAt(z)) - 1.3);
      const x = sgn * hw;
      const y = on(x, z);
      for (const dz of [-0.45, 0.45]) cyl(g, M.steelDark, 0.2, 0.22, 0.75, x, y + 0.38, z + dz, 10);
      box(g, M.steelDark, 0.8, 0.14, 1.5, x, y + 0.07, z);
    }
  }
  // The ensign staff on her stern.
  const sz = -0.975 * LOA / 2;
  cyl(g, M.steelDark, 0.08, 0.13, 5.0, 0, on(0, sz) + 2.5, sz, 8);
}

/** Four screws, which turn. */
function screws(g) {
  for (const [x, z, r, hand] of [
    [-5.2, -0.845 * LOA / 2, 1.85, -1],
    [5.2, -0.845 * LOA / 2, 1.85, 1],
    [-2.4, -0.885 * LOA / 2, 1.8, 1],
    [2.4, -0.885 * LOA / 2, 1.8, -1],
  ]) {
    const hub = new THREE.Group();
    hub.position.set(x, -4.5, z);
    // She turns, so the welder is told to leave her alone.
    hub.userData.dynamic = true;
    hub.userData.screw = { hand };
    cyl(hub, M.brass, 0.5, 0.35, 0.7, 0, 0, 0, 12).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const bl = box(hub, M.brass, r * 0.6, 0.1, r * 1.5,
        Math.sin(a) * r * 0.55, Math.cos(a) * r * 0.55, 0);
      bl.rotation.z = a;
      bl.rotation.x = 0.42;
    }
    g.add(hub);
  }
}

// ---------------------------------------------------------------- build ----

// What is built here besides her guns: the sculpt, and the parts of her that
// are not the sculpt -- her catapults and the aeroplanes on them, her reloads,
// her fittings, and her screws.
const STATIC = [
  ['hullModel', buildTakaoHull],
  ['aviation', aviation],
  ['airGroup', airGroup],
  ['reloads', reloads],
  ['fittings', fittings],
  ['screws', screws],
];

export function buildTakao() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  barbettes(g);
  // Her insides stand on her inner bottom, a hand's breadth over her keel
  // plate. Her bottom is the sculpt's, and rounded: fitted right down to the
  // bottom of it, the keel of her interior only touched her plating along the
  // centreline and stood out through it wherever the plating was a centimetre
  // off the line.
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  // And inside every part of her that moves, after her batteries are on her.
  mergeMoving(g);
  g.userData.classId = 'takao';
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
    torpMounts: g.userData.torpMounts || [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function takaoParts() {
  const parts = [];
  const builders = [...STATIC, ['barbettes', barbettes],
    ['mainBattery', mainBattery], ['mountings', mountings]];
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
