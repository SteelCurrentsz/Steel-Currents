// The Royal Navy's close-range and high-angle mountings, and a battleship's
// torpedo tube.
//
//   fourPointSeven  4.7-inch QF Mk VIII on its HA mounting, the Nelsons' and
//                   the Royal Navy's heavy anti-aircraft gun of the thirties
//   pomPom8         2-pdr Mk VIII in the eight-barrelled Mk VI mounting, the
//                   "Chicago piano"
//   pomPom4         the same gun in the four-barrelled Mk VII
//   bowTube         a 24.5-inch submerged torpedo tube, inside the bow
//
// Each builder takes the group to hang the mounting on, the ship's own
// material proxy `M` -- so a ship in her camouflage grey gets her own paint --
// and where the mounting stands. What comes back is the node that trains,
// armed with its muzzles through the mount API, which is what the scene lays
// and what the gunlayer's camera rides.
//
// Local frame as everywhere: +Z is the bow, +Y is up, starboard is -X.

import * as THREE from '../../../vendor/three.module.js';
import { arm } from './mounts.js';
import { box, cyl, tubeZ } from './shipkit.js';

function mounting(g, x, y, z, angle, trainRate) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.userData.rest = angle;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  m.userData.trainRate = trainRate;
  g.add(m);
  return m;
}

/**
 * A 4.7-inch QF Mk VIII on its Mk XII HA mounting.
 *
 * A forty-calibre gun on a pedestal, loaded by hand at any elevation up to
 * ninety degrees, behind a shield that is a front and two cheeks and nothing
 * else: the layer and the trainer sit out on either side of the cradle, and
 * the loaders stand behind it on the open deck with the fuze-setting tray.
 */
export function fourPointSeven(g, M, x, y, z, angle) {
  const m = mounting(g, x, y, z, angle, 1.25);
  // The pedestal, bolted to the deck, and the training base on it.
  cyl(m, M.gunDark, 1.05, 1.15, 0.24, 0, 0.12, 0, 16);
  cyl(m, M.gunDark, 0.46, 0.56, 1.05, 0, 0.76, 0, 12);
  box(m, M.gun, 1.3, 0.32, 1.5, 0, 1.36, 0.05);
  // The shield: a front plate with its top raked back, and two cheeks.
  const face = box(m, M.gun, 2.1, 1.55, 0.1, 0, 1.95, 1.05);
  face.rotation.x = -0.12;
  for (const sgn of [-1, 1]) {
    box(m, M.gun, 0.08, 1.35, 1.2, sgn * 1.03, 1.85, 0.48);
    // The layer's and the trainer's seats, and their handwheels.
    box(m, M.gunDark, 0.34, 0.08, 0.34, sgn * 0.78, 1.28, -0.35);
    cyl(m, M.gunDark, 0.16, 0.16, 0.05, sgn * 0.62, 1.62, 0.12, 10).rotation.z = Math.PI / 2;
  }
  // The sight ports in the face.
  for (const sgn of [-1, 1]) box(m, M.glass, 0.18, 0.14, 0.06, sgn * 0.55, 2.3, 1.12);
  const cradle = new THREE.Group();
  cradle.position.set(0, 1.78, 0.2);
  m.add(cradle);
  // The breech ring and the block, the cradle round the barrel and the
  // recoil cylinders under it, and the barrel out through the shield.
  cyl(cradle, M.gunDark, 0.22, 0.22, 0.8, 0, 0, -0.55, 12).rotation.x = Math.PI / 2;
  tubeZ(cradle, M.gunDark, 0.17, 1.6, 0, 0, 0.55, 12);
  tubeZ(cradle, M.gunDark, 0.07, 1.3, 0, -0.24, 0.35, 8);
  tubeZ(cradle, M.gun, 0.095, 3.7, 0, 0, 3.0, 12);
  cyl(cradle, M.gunDark, 0.11, 0.11, 0.22, 0, 0, 4.78, 12).rotation.x = Math.PI / 2;
  // The loading tray and the fuze setter behind the breech.
  box(cradle, M.gunDark, 0.3, 0.1, 0.9, 0, -0.18, -1.3);
  box(m, M.gunDark, 0.45, 0.8, 0.4, 0.75, 0.4, -1.05);
  arm(m, cradle, [[0, 0, 4.9]]);
  return m;
}

/** One 2-pdr barrel on its cradle: the water jacket, the barrel and the cone. */
function twoPounder(g, M, dx, dy) {
  tubeZ(g, M.gunDark, 0.11, 1.25, dx, dy, 0.25, 10);
  tubeZ(g, M.gun, 0.052, 0.95, dx, dy, 1.3, 8);
  cyl(g, M.gunDark, 0.09, 0.05, 0.3, dx, dy, 1.92, 10).rotation.x = Math.PI / 2;
  return [dx, dy, 2.07];
}

/**
 * The eight-barrelled Mk VI pom-pom.
 *
 * Two rows of four guns on one cradle, the upper row set a little back, each
 * gun fed from the side by a fourteen-round belt in its tray; a trainer's
 * seat and sight on one side of the mounting and a layer's on the other, and
 * the whole of it the size of a small car.
 */
export function pomPom8(g, M, x, y, z, angle) {
  const m = mounting(g, x, y, z, angle, 1.1);
  cyl(m, M.gunDark, 1.45, 1.55, 0.3, 0, 0.15, 0, 20);
  cyl(m, M.gunDark, 1.1, 1.2, 0.4, 0, 0.5, 0, 18);
  // The carriage: the two side plates the cradle hangs in, and the body.
  for (const sgn of [-1, 1]) box(m, M.gun, 0.12, 1.1, 1.6, sgn * 1.38, 1.15, 0.0);
  box(m, M.gun, 2.6, 0.5, 1.3, 0, 0.9, -0.15);
  const cradle = new THREE.Group();
  cradle.position.set(0, 1.35, 0.1);
  m.add(cradle);
  const muzzles = [];
  for (const [dy, dz] of [[0.22, -0.12], [-0.2, 0.05]]) {
    const row = new THREE.Group();
    row.position.set(0, dy, dz);
    cradle.add(row);
    for (const dx of [-0.84, -0.28, 0.28, 0.84]) {
      const [mx, my, mz] = twoPounder(row, M, dx, 0);
      muzzles.push([mx, my + dy, mz + dz]);
    }
    // The ammunition trays alongside each row.
    box(row, M.gunDark, 2.3, 0.14, 0.9, 0, 0.18, -0.4);
  }
  box(cradle, M.gun, 2.45, 0.7, 0.9, 0, 0, -0.75);
  // The layer's and the trainer's positions, out either side.
  for (const sgn of [-1, 1]) {
    box(m, M.gunDark, 0.5, 0.1, 0.5, sgn * 1.75, 0.8, -0.3);
    box(m, M.gunDark, 0.18, 0.5, 0.28, sgn * 1.75, 1.3, 0.1);
    box(m, M.glass, 0.12, 0.12, 0.06, sgn * 1.75, 1.5, 0.26);
  }
  arm(m, cradle, muzzles);
  return m;
}

/** The four-barrelled Mk VII: one row of the same guns on a smaller carriage. */
export function pomPom4(g, M, x, y, z, angle) {
  const m = mounting(g, x, y, z, angle, 1.3);
  cyl(m, M.gunDark, 0.95, 1.05, 0.26, 0, 0.13, 0, 16);
  cyl(m, M.gunDark, 0.7, 0.78, 0.36, 0, 0.44, 0, 14);
  for (const sgn of [-1, 1]) box(m, M.gun, 0.1, 0.9, 1.3, sgn * 1.12, 1.0, 0.0);
  box(m, M.gun, 2.1, 0.4, 1.0, 0, 0.8, -0.1);
  const cradle = new THREE.Group();
  cradle.position.set(0, 1.18, 0.05);
  m.add(cradle);
  const muzzles = [];
  for (const dx of [-0.75, -0.25, 0.25, 0.75]) muzzles.push(twoPounder(cradle, M, dx, 0));
  box(cradle, M.gunDark, 1.9, 0.14, 0.8, 0, 0.18, -0.4);
  box(cradle, M.gun, 2.0, 0.55, 0.8, 0, -0.05, -0.7);
  for (const sgn of [-1, 1]) box(m, M.gunDark, 0.45, 0.1, 0.45, sgn * 1.45, 0.7, -0.3);
  arm(m, cradle, muzzles);
  return m;
}

/**
 * A 24.5-inch submerged torpedo tube, inside her bow.
 *
 * The tube runs from its breech in the torpedo room forward and outboard to a
 * sluice door in her side plating, a few metres under the water. It does not
 * train -- a battleship's bow tube is aimed by pointing the battleship, and the
 * few degrees either way are the gyro angle set on the fish -- so the
 * mounting is the tube, from breech to door, and its muzzle is the door.
 * `length` is how far the door is from the breech along it.
 */
export function bowTube(g, M, x, y, z, angle, length) {
  const m = mounting(g, x, y, z, angle, 0.2);
  // The breech door and its locking ring, and the tube.
  cyl(m, M.gunDark, 0.52, 0.52, 0.3, 0, 0, 0.15, 16).rotation.x = Math.PI / 2;
  tubeZ(m, M.steel, 0.4, length - 0.3, 0, 0, 0.3 + (length - 0.3) / 2, 16);
  // The water round the tube and the impulse air bottle over it.
  tubeZ(m, M.gunDark, 0.18, 2.2, 0, 0.62, 1.6, 10);
  // The sluice and the bow cap at the outer end.
  cyl(m, M.gunDark, 0.5, 0.5, 0.18, 0, 0, length - 0.1, 16).rotation.x = Math.PI / 2;
  arm(m, m, [[0, 0, length]]);
  return m;
}
