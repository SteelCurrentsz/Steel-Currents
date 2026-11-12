// HMS Ajax, drawn from the owner's model of her.
//
// A Leander-class light cruiser of 1935: a hundred and sixty-nine metres,
// eight 6 in in four twin turrets -- A and B forward, B superfiring; X
// superfiring over Y aft -- one great trunked funnel, and thirty-two and a
// half knots. With the Exeter and the Achilles she ran the Admiral Graf Spee
// into Montevideo off the River Plate in December 1939, and she went on to
// Norway, Matapan, Crete, the Malta convoys and the Normandy beaches.
//
// Her hull, her bridge, her funnel, her masts and her boats are the model --
// "HMS Ajax" by kriss50 (https://skfb.ly/ptKuX), under Creative Commons
// Attribution 4.0 -- (see ajaxHull.js and build/prepare-ajax-hull.mjs). Every
// gun of hers is the model's own, as she was armed in the middle of the war.
// What is built here is everything that moves or fires:
//
//   * her four 6 in turrets, the model's gunhouses on their barbettes, their
//     barrels on a cradle that elevates;
//   * her four twin 4 in HA mountings, two a side abreast her funnel;
//   * her two quadruple 2-pdr pom-poms, her quadruple 0.5 in machine gun and
//     her twin and single 20 mm Oerlikons;
//   * her two quadruple banks of 21 in tubes, one a side abreast her funnel,
//     which train out and fire;
//   * her four screws, the model's, which turn;
//
// and, inside her, her armour and her interior, fitted to her own lines.
// (Her boats, her catapult and her crane are the model's and stay where it
// put them.)
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, y = 0 is the
// waterline.

import * as THREE from '../../../vendor/three.module.js';
import { arm } from './mounts.js';
import { fitTubes } from './tubes.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { lightMounts } from '../../../shared/sim.js';
import { cyl, strip, sheet } from './shipkit.js';
import {
  buildAjaxHull, ajaxSurfaceY, MOUNT_SEATS, SCULPT_LINES, ajaxMaterials, gunPiece,
} from './ajaxHull.js';
import { AJAX_SCREWS as SCREWS } from './ajaxHull.data.js';
import { decodePiece } from './sculpt.js';

const CLS = SHIP_CLASSES.ajax;
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
export const deckAt = (z) => ajaxSurfaceY(0, z);

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
  m.add(new THREE.Mesh(piece.house, ajaxMaterials().sheet));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  cradle.rotation.x = -piece.pitch;
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, ajaxMaterials().sheet));
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
  if (!best || bd > 0.6) throw new Error(`the Ajax has a ${what} at ${x}, ${z} her model does not`);
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
    const s = seatFor(MOUNT_SEATS.sec, spec.x, spec.z, '4 in twin');
    const m = sculpted(g, 'sec', s.x, s.y, s.z, stowed(spec), CLS.secondary.traverse);
    m.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
    return m;
  });
  const aa = [];
  const lights = lightMounts(CLS);
  for (const gun of CLS.aa.guns) {
    const kind = gun.piece || (gun.role === 'dp' ? 'dp' : 'aa');
    for (const spec of gun.mounts) {
      const s = seatFor(MOUNT_SEATS[kind], spec.x, spec.z, `${gun.caliber} mm`);
      const a = sculpted(g, kind, s.x, s.y, s.z, stowed(spec), kind === 'pompom' ? 0.5 : 0.8);
      a.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = spec.lift || null;
      aa.push(a);
    }
  }
  if (aa.length !== lights.length) throw new Error('the Ajax built a light battery her datasheet does not list');
  const torp = CLS.torpedoes.mounts.map((spec) => torpedoBank(g, spec, CLS.torpedoes.traverse));
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  g.userData.torpMounts = torp;
  return { sec, aa, torp };
}

/**
 * One of her quadruple banks of 21 in tubes, as the model drew it (see
 * gunPiece): it trains about its middle, its four tubes level, and its
 * muzzles are the flared after ends of its tubes. Her two banks are each
 * other's mirror, and each is its own piece.
 */
function torpedoBank(g, spec, trainRate) {
  const i = MOUNT_SEATS.tubes.indexOf(seatFor(MOUNT_SEATS.tubes, spec.x, spec.z, 'bank of tubes'));
  const s = MOUNT_SEATS.tubes[i];
  const piece = gunPiece(`tubes${i}`);
  const m = new THREE.Group();
  m.position.set(s.x, s.y, s.z);
  m.rotation.y = stowed(spec);
  m.userData.rest = 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.name = `${spec.x > 0 ? 'port' : 'starboard'} tubes`;
  m.userData.trainRate = trainRate;
  m.add(new THREE.Mesh(piece.house, ajaxMaterials().sheet));
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
 * plating is whole, all of it when a shell has opened her up. The Leanders
 * were armoured against destroyers' guns, and no more:
 *
 *   the belt          three inches, abreast her machinery, from her armour
 *                     deck down a metre and a half under her waterline
 *   the armour deck   an inch over her machinery, at the top of the belt
 *   the box citadels  over her magazines fore and aft: three and a half
 *                     inches of side and two of crown
 *   the bulkheads     that close the belt at both ends
 */
const BELT = [-22, 19];
const MAGAZINES = [[37, 52], [-55, -40]];
const ARMOUR_DECK = 2.6;
const BELT_FOOT = -1.5;

function armour(g) {
  const inside = (o) => { o.userData.inside = true; return o; };
  const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
  const N = 32;
  const box = (z0, z1, top, foot, inset) => {
    const side = strip();
    for (let i = 0; i < N; i++) {
      const za = z0 + ((z1 - z0) * i) / N;
      const zb = z0 + ((z1 - z0) * (i + 1)) / N;
      for (const sgn of [-1, 1]) {
        side.quad([sgn * at(za, top, inset), top, za], [sgn * at(za, foot, inset), foot, za],
          [sgn * at(zb, foot, inset), foot, zb], [sgn * at(zb, top, inset), top, zb],
          [-sgn, 0, 0]);
      }
    }
    inside(side.mesh(g, M.armour));
    for (const up of [true, false]) {
      inside(sheet(g, M.armour, z0, z1, (z) => at(z, top, inset), () => top + (up ? 0.05 : -0.05), 24, up));
    }
    for (const z of [z0, z1]) {
      const bh = strip();
      const ys = [];
      for (let y = foot; y < top; y += 1.0) ys.push(y);
      ys.push(top);
      for (let i = 0; i < ys.length - 1; i++) {
        const wa = at(z, ys[i], inset + 0.3), wb = at(z, ys[i + 1], inset + 0.3);
        for (const face of [1, -1]) {
          bh.quad([-wa, ys[i], z], [wa, ys[i], z], [wb, ys[i + 1], z], [-wb, ys[i + 1], z], [0, 0, face]);
        }
      }
      inside(bh.mesh(g, M.armour));
    }
  };
  // The belt and its deck over her boiler and engine rooms.
  box(BELT[0], BELT[1], ARMOUR_DECK, BELT_FOOT, 0.4);
  // And her magazines, boxed in below her waterline.
  for (const [z0, z1] of MAGAZINES) box(z0, z1, 0.2, -3.6, 2.0);
}

// --------------------------------------------------------------- screws --

// Her four screws, each as the model drew it, on the end of its shaft: the
// wing pair forward and the inner pair further aft.
let screwGeo = null;
function screws(g) {
  if (!screwGeo) screwGeo = SCREWS.map((s) => decodePiece(s.piece));
  SCREWS.forEach((s, i) => {
    const hub = new THREE.Group();
    hub.position.set(s.x, s.y, s.z);
    hub.userData.dynamic = true;
    hub.userData.screw = { hand: s.x < 0 ? -1 : 1 };
    hub.add(new THREE.Mesh(screwGeo[i], ajaxMaterials().sheet));
    g.add(hub);
  });
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['hullModel', buildAjaxHull],
  ['armour', armour],
  ['screws', screws],
];

export function buildAjax() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'ajax';
  g.userData.step = fitTubes(g, g.userData.torpMounts, CLS.torpedoes);
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
    torpMounts: g.userData.torpMounts || [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function ajaxParts() {
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
