// USS North Carolina, drawn from the owner's model of her.
//
// The first of the American fast battleships: two hundred and twenty-two
// metres, nine 16-inch/45 in three triple turrets -- No.1 and No.2 forward,
// No.2 superfiring; No.3 aft -- twenty 5-inch/38 in ten twin mounts, five a
// side, a tower forward of two funnels, and twenty-eight knots. She was
// commissioned in April 1941, the first new American battleship in eighteen
// years, and was at sea for the rest of the war: the Eastern Solomons, a
// torpedo from I-19 off Guadalcanal, the Gilberts, the Marshalls, the
// Marianas, Okinawa and Tokyo Bay.
//
// Her hull, her superstructure, her funnels, her masts, her catapults, her
// crane and her Kingfishers are the model -- "USS North Carolina (War
// Thunder) Heavy Cavalry" by KojfDiscord (https://skfb.ly/pKNuG), under
// Creative Commons Attribution 4.0 -- (see northcarolinaHull.js and
// build/prepare-northcarolina-hull.mjs). She is armed as she was in 1945.
// What is built here is everything that moves or fires:
//
//   * her three 16-inch turrets, the model's gunhouses with the life rafts
//     lashed to them, their barrels on a cradle that elevates;
//   * her ten twin 5-inch/38s, the model's, five a side;
//   * her fifteen quadruple 40 mm Bofors in their tubs -- four on the
//     platforms her 1.1-inch quadruples stood on, which the model draws and
//     the build takes off her, and eleven more on her decks -- and her twenty
//     single and eight twin 20 mm Oerlikons, which the model leaves off;
//   * her four screws, the model's, which turn;
//
// and, inside her, her armour and her interior, fitted to her own lines.
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, y = 0 is the
// waterline.

import * as THREE from '../../../vendor/three.module.js';
import { arm } from './mounts.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { lightMounts } from '../../../shared/sim.js';
import { cyl, strip, sheet } from './shipkit.js';
import { quadBofors, oerlikon, twinOerlikon } from './usnguns.js';
import {
  buildNorthCarolinaHull, northCarolinaSurfaceY, northCarolinaSeatY, MOUNT_SEATS, SCULPT_LINES, northCarolinaMaterials, gunPiece,
} from './northcarolinaHull.js';
import { NORTHCAROLINA_SCREWS as SCREWS } from './northcarolinaHull.data.js';
import { decodePiece } from './sculpt.js';

const CLS = SHIP_CLASSES.northcarolina;
export const LOA = CLS.hull.length;
export const BEAM = CLS.hull.beam;
export const DRAFT = CLS.hull.draft;

// Her own paints, for everything built here: haze grey on her light guns and
// their tubs, deck blue on their floors.
const P = {
  steel: 0x87909a,
  steelDark: 0x5c646d,
  gun: 0x87909a,
  gunDark: 0x4d545c,
  deckDark: 0x3e4856,
  glass: 0x25303a,
  armour: 0x4d555c,
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
export const deckAt = (z) => northCarolinaSurfaceY(0, z);

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
  m.add(new THREE.Mesh(piece.house, northCarolinaMaterials().sheet));
  const cradle = new THREE.Group();
  cradle.position.set(...piece.trunnion);
  cradle.rotation.x = -piece.pitch;
  if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, northCarolinaMaterials().sheet));
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
  if (!best || bd > 0.6) throw new Error(`the North Carolina has a ${what} at ${x}, ${z} her model does not`);
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

/**
 * A light gun built here trains inside its tub, and the tub is turned to open
 * behind it; the scene lays the gun by its bearing in her frame, so it hangs
 * off her, not off the tub, where the tub has it.
 */
function offTheTub(g, a, m) {
  const tub = a.parent;
  a.removeFromParent();
  a.position.set(tub.position.x, tub.position.y + a.position.y, tub.position.z);
  a.rotation.y = stowed(m);
  g.add(a);
  return a;
}

function mountings(g) {
  // Her 5-inch twins, as the model draws them, where it stands them.
  const sec = CLS.secondary.mounts.map((spec) => {
    const s = seatFor(MOUNT_SEATS.sec, spec.x, spec.z, '5-inch/38');
    const m = sculpted(g, 'sec', s.x, s.y, s.z, stowed(spec), CLS.secondary.traverse);
    m.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
    return m;
  });
  // Her Bofors and her Oerlikons, each on the deck under it.
  const aa = [];
  const lights = lightMounts(CLS);
  for (const gun of CLS.aa.guns) {
    for (const spec of gun.mounts) {
      let a;
      if (gun.caliber === 40) {
        a = offTheTub(g, quadBofors(g, M, spec.x, northCarolinaSeatY(spec.x, spec.z, 1.2), spec.z, stowed(spec),
          { tubR: 2.3, lockers: [] }), spec);
      } else if (spec.guns === 2) {
        a = offTheTub(g, twinOerlikon(g, M, spec.x, northCarolinaSeatY(spec.x, spec.z, 0.6), spec.z, stowed(spec)), spec);
      } else {
        a = offTheTub(g, oerlikon(g, M, spec.x, northCarolinaSeatY(spec.x, spec.z, 0.6), spec.z, stowed(spec)), spec);
      }
      a.userData.rest = 0;
      a.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
      a.userData.stops = gun.elev || null;
      a.userData.lift = spec.lift || null;
      aa.push(a);
    }
  }
  if (aa.length !== lights.length) throw new Error('the North Carolina built a light battery her datasheet does not list');
  g.userData.secMounts = sec;
  g.userData.aaMounts = aa;
  return { sec, aa };
}

// ------------------------------------------------------------ her armour --

/**
 * Her armour, as structure inside the ship: none of it to be seen while her
 * plating is whole, all of it when a shell has opened her up. An all-or-
 * nothing citadel from No.1 barbette to No.3:
 *
 *   the belt          twelve inches, inclined inside her plating, from her
 *                     armour deck down under her waterline
 *   the armour deck   five and a half inches over it
 *   the bulkheads     that close the box at both ends
 */
const BELT = [-66, 63];
const ARMOUR_DECK = 2.6;
const BELT_FOOT = -6.0;

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
  // The belt and its deck over her magazines and her machinery.
  box(BELT[0], BELT[1], ARMOUR_DECK, BELT_FOOT, 0.4);

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
    hub.add(new THREE.Mesh(screwGeo[i], northCarolinaMaterials().sheet));
    g.add(hub);
  });
}

// ---------------------------------------------------------------- build ----

const STATIC = [
  ['hullModel', buildNorthCarolinaHull],
  ['armour', armour],
  ['screws', screws],
];

export function buildNorthCarolina() {
  const g = new THREE.Group();
  for (const [, build] of STATIC) build(g);
  buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
  mergeStatic(g, bySection(LOA));
  const turrets = mainBattery(g);
  mountings(g);
  mergeMoving(g);
  g.userData.classId = 'northcarolina';
  dressShip(g);
  return {
    group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
    secMounts: g.userData.secMounts || [],
    aaMounts: g.userData.aaMounts || [],
  };
}

/** Every piece of her and where it sits, for the tests. */
export function northCarolinaParts() {
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
