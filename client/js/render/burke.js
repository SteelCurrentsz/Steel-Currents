// The US Navy destroyer Arleigh Burke (DDG-51), drawn from the model of her.
//
// A destroyer of the Aegis age armed as the owner asked: a single 5-inch
// Mk 45 forward, for surface fire only; two Phalanx close-in guns, one over
// her bridge and one over her hangar-less after deckhouse; two 25 mm Mk 38
// chain guns, one a side amidships, dual-purpose; two Mk 32 triple tubes for
// homing torpedoes; eight Harpoon canisters; and two Mk 41 vertical
// launchers, twenty-nine cells forward and sixty-one aft, whose loading is
// her captain's to choose.
//
// Her hull and superstructure are the model -- "1:1 Low poly US NAVY DDG-51
// USS Arleigh Burke." by Yi Tsung Lee (https://skfb.ly/o7TNV), under
// Creative Commons Attribution 4.0 -- (see burkeHull.js and
// build/prepare-burke-hull.mjs); every gun and tube of hers is the model's
// own. What is built here is everything that moves or fires:
//
//   * her Mk 45, the model's gunhouse on its ring, its barrel on a cradle
//     that elevates;
//   * her two Phalanx and her two Mk 38s;
//   * her two Mk 32 triples, which train out over her side to fire;
//   * her two screws, the model's, which turn;
//
// and, inside her, her armour and her interior, fitted to her own lines.
// Her VLS cells and Harpoon canisters are painted on the model; a missile
// leaves from the cell or the canister mouth the datasheet gives.
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, y = 0 is the
// waterline.

import * as THREE from '../../../vendor/three.module.js';
import { arm } from './mounts.js';
import { fitTubes } from './tubes.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { fitHelipad } from './helipad.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { lightMounts } from '../../../shared/sim.js';
import { box, cyl, strip, sheet } from './shipkit.js';
import {
  buildBurkeHull, burkeSurfaceY, MOUNT_SEATS, SCULPT_LINES, burkeMaterials, gunPiece,
} from './burkeHull.js';
import { SCREWS } from './burkeHull.data.js';
import { decodePiece } from './sculpt.js';

const CLS = SHIP_CLASSES.burke;
export const LOA = CLS.hull.length;
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;

const P = {
  armour: 0x4a5158,
};

const MATS = {};
function mat(color) {
  if (!MATS[color]) MATS[color] = new THREE.MeshLambertMaterial({ color });
  return MATS[color];
}
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

// ------------------------------------------------------------- her lines --

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
/** The deck over her insides at station t. */
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
const INNER_BOTTOM = 0.15;
/** Where her deck is at (0, z): her own surface on the centreline. */
export const deckAt = (z) => burkeSurfaceY(0, z);

// ---------------------------------------------------------------- guns ----

/**
 * A mounting off the owner's model of it (see gunPiece): what trains stands
 * at `y`, faces `rest`, and carries its barrels on a cradle about their
 * trunnions, laid back at the elevation the model stowed them at.
 */
function sculpted(g, kind, x, y, z, rest, trainRate, name) {
  const piece = gunPiece(kind);
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = rest;
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = trainRate;
  if (name) m.userData.name = name;
  // Drawn from both sides: a shield is a sheet seen from behind as often as
  // in front.
  m.add(new THREE.Mesh(piece.house, burkeMaterials().sheet));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  cradle.rotation.x = -piece.pitch;
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, burkeMaterials().sheet));
  m.add(cradle);
  arm(m, cradle, piece.muzzles);
  g.add(m);
  return m;
}

/** The seat the build measured for a mounting of her datasheet, by where it is. */
function seatFor(list, x, z, what) {
  let best = null, bd = Infinity;
  for (const s of list) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) { bd = d; best = s; }
  }
  if (!best || bd > 0.6) throw new Error(`the Burke has a ${what} at ${x}, ${z} her model does not`);
  return best;
}

function mainBattery(g) {
  const turrets = CLS.turrets.map((t) => {
    const s = seatFor(MOUNT_SEATS.main, t.x, t.z, 'turret');
    return sculpted(g, 'main', s.x, s.y, s.z, t.angle, CLS.gun.traverse, t.name);
  });
  g.userData.turrets = turrets;
  return turrets;
}

const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);

function mountings(g) {
  const sec = CLS.secondary.mounts.map((spec) => {
    const s = seatFor(MOUNT_SEATS.mk38, spec.x, spec.z, 'Mk 38');
    const m = sculpted(g, CLS.secondary.piece, s.x, s.y, s.z, stowed(spec), CLS.secondary.traverse);
    m.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
    return m;
  });
  const aa = [];
  const lights = lightMounts(CLS);
  for (const gun of CLS.aa.guns) {
    for (const spec of gun.mounts) {
      const s = seatFor(MOUNT_SEATS[gun.piece], spec.x, spec.z, gun.name);
      // A Phalanx slews like nothing else aboard: well over a hundred
      // degrees a second.
      const a = sculpted(g, gun.piece, s.x, s.y, s.z, stowed(spec), 2.4);
      a.userData.ciws = !!gun.ciws;
      a.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = spec.lift || null;
      aa.push(a);
    }
  }
  if (aa.length !== lights.length) throw new Error('the Burke built a light battery her datasheet does not list');
  const torp = CLS.torpedoes.mounts.map((spec) => torpedoBank(g, spec, CLS.torpedoes.traverse));
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  g.userData.torpMounts = torp;
  return { sec, aa, torp };
}

/**
 * One of her Mk 32 triples, as the model drew it (see gunPiece): it trains
 * about its pedestal, its three tubes level, and its muzzles are the ends of
 * its tubes. Her port and starboard triples are each their own piece.
 */
function torpedoBank(g, spec, trainRate) {
  const s = seatFor(MOUNT_SEATS.tubes, spec.x, spec.z, 'Mk 32 triple');
  const piece = gunPiece(`tubes${s.piece}`);
  const m = new THREE.Group();
  m.position.set(s.x, s.y, s.z);
  m.rotation.y = stowed(spec);
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.name = `${spec.x > 0 ? 'port' : 'starboard'} tubes`;
  m.userData.trainRate = trainRate;
  m.add(new THREE.Mesh(piece.house, burkeMaterials().sheet));
  // Nothing elevates: the cradle is where the tubes' axes are, so that the
  // muzzles are read off the line the fish leave along.
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  m.add(cradle);
  arm(m, cradle, piece.bores.map(([x, y, , zm]) => [x, y - piece.trunnion[1], zm]));
  m.userData.bores = piece.bores;
  g.add(m);
  return m;
}

// ------------------------------------------------------------ her armour --

/**
 * Her armour, as structure inside the ship: none of it to be seen while her
 * plating is whole, all of it when a shell has opened her up.
 *
 *   the side          Kevlar splinter plating over her machinery, her
 *                     magazines and her two launchers, from her forward VLS
 *                     to her after one, from her armour deck down a metre
 *                     and a half under her waterline
 *   the armour deck   at the top of it
 *   the bulkheads     that close it at both ends
 *   the barbette      of her Mk 45, down to the armour deck
 */
const CITADEL = [-48, 48];
const ARMOUR_DECK = 2.0;
const BELT_FOOT = -1.5;
const BARBETTE_R = 2.0;

function armour(g) {
  const inside = (o) => { o.userData.inside = true; return o; };
  const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
  const N = 72;
  const [z0, z1] = CITADEL;
  const belt = strip();
  for (let i = 0; i < N; i++) {
    const za = z0 + ((z1 - z0) * i) / N;
    const zb = z0 + ((z1 - z0) * (i + 1)) / N;
    for (const sgn of [-1, 1]) {
      belt.quad([sgn * at(za, ARMOUR_DECK, 1.0), ARMOUR_DECK, za], [sgn * at(za, BELT_FOOT, 1.0), BELT_FOOT, za],
        [sgn * at(zb, BELT_FOOT, 1.0), BELT_FOOT, zb], [sgn * at(zb, ARMOUR_DECK, 1.0), ARMOUR_DECK, zb],
        [-sgn, 0, 0]);
    }
  }
  inside(belt.mesh(g, M.armour));
  for (const up of [true, false]) {
    inside(sheet(g, M.armour, z0, z1, (z) => at(z, ARMOUR_DECK, 1.0), () => ARMOUR_DECK + (up ? 0.1 : -0.1), 56, up));
  }
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
  for (const t of MOUNT_SEATS.main) {
    const top = deckOver((2 * t.z) / LOA) - 0.3;
    inside(cyl(g, M.armour, BARBETTE_R, BARBETTE_R, top - ARMOUR_DECK, t.x, (top + ARMOUR_DECK) / 2, t.z, 32));
  }
}

// --------------------------------------------------------------- screws --

// Her two screws, each as the model drew it, on the end of its shaft.
let screwGeo = null;
function screws(g) {
  if (!screwGeo) screwGeo = SCREWS.map((s) => decodePiece(s.piece));
  SCREWS.forEach((s, i) => {
    const hub = new THREE.Group();
    hub.position.set(s.x, s.y, s.z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand: s.x < 0 ? -1 : 1 };
    hub.add(new THREE.Mesh(screwGeo[i], burkeMaterials().sheet));
    g.add(hub);
  });
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['hullModel', buildBurkeHull],
  ['armour', armour],
  ['screws', screws],
];

export function buildBurke() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'burke';
  g.userData.step = fitTubes(g, g.userData.torpMounts, CLS.torpedoes);
  dressShip(g);
  // Her helicopter, on her pad (see helipad.js).
  fitHelipad(g, { pad: CLS.planes.helipad, kind: CLS.planes.type });
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
    torpMounts: g.userData.torpMounts || [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function burkeParts() {
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
