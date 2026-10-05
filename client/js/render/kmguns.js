// The Kriegsmarine's light anti-aircraft guns, drawn once for the Bismarck.
//
// They are the Admiral Hipper's own mountings (see hipper.js), taken out so a
// second ship can carry them in her own paint: every builder takes the ship's
// material proxy `M`, which has to have `gun`, `gunDark`, `steelDark` and
// `cave`.
//
//   threeSeven   3.7 cm SK C/30 twin on its stabilised Dopp LC/30 mounting
//   twoCm        2 cm Flakvierling 38, four barrels behind a light shield --
//                or, with `quad` false, the 2 cm C/30 single on its pedestal
//
// Local frame as everywhere: +Z is the bow, +Y is up.

import * as THREE from '../../../vendor/three.module.js';
import { box, cyl, tubeZ } from './shipkit.js';
import { arm } from './mounts.js';

/**
 * The 3.7 cm SK C/30 twin: two long semi-automatic guns in a cradle slung
 * between two trunnion arms on a pedestal, open, with the layer's and
 * trainer's seats out on either side.
 */
export function threeSeven(g, M, x, y, z, ry) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  g.add(m);
  // The pedestal, the roller path it trains on, and the toothed rack.
  cyl(m, M.steelDark, 0.60, 0.76, 0.85, 0, 0.42, 0, 14);
  cyl(m, M.gunDark, 0.72, 0.72, 0.16, 0, 0.92, 0, 14);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    box(m, M.gunDark, 0.08, 0.12, 0.12, Math.sin(a) * 0.74, 0.92, Math.cos(a) * 0.74, a);
  }
  cyl(m, M.steelDark, 0.56, 0.56, 0.3, 0, 1.14, 0, 14);
  // The two trunnion arms the stabilised cradle hangs between.
  for (const sgn of [-1, 1]) {
    const armY = box(m, M.gun, 0.24, 1.05, 0.62, sgn * 0.82, 1.75, -0.05);
    armY.rotation.z = -sgn * 0.10;
    cyl(m, M.gunDark, 0.22, 0.22, 0.3, sgn * 0.9, 2.2, -0.05, 12).rotation.z = Math.PI / 2;
    cyl(m, M.steelDark, 0.13, 0.13, 0.38, sgn * 1.02, 2.2, -0.05, 8).rotation.z = Math.PI / 2;
  }
  box(m, M.gun, 1.75, 0.42, 0.9, 0, 1.32, -0.15);
  // The elevating cradle, on the trunnions, and the two guns in it.
  const cradle = new THREE.Group();
  cradle.position.set(0, 2.2, -0.05);
  m.add(cradle);
  for (const sgn of [-1, 1]) box(cradle, M.gun, 0.14, 0.5, 1.5, sgn * 0.62, 0, 0.35);
  box(cradle, M.gunDark, 1.4, 0.22, 1.4, 0, -0.2, 0.3);
  box(cradle, M.gunDark, 1.4, 0.16, 0.3, 0, 0.2, -0.35);
  for (const sgn of [-1, 1]) {
    const bx = sgn * 0.34;
    box(cradle, M.gunDark, 0.34, 0.4, 1.05, bx, 0.06, -0.05);
    tubeZ(cradle, M.gunDark, 0.115, 0.55, bx, 0.06, 0.72, 10);
    tubeZ(cradle, M.gunDark, 0.062, 1.85, bx, 0.06, 1.9, 10);
    cyl(cradle, M.gunDark, 0.085, 0.085, 0.3, bx, 0.06, 2.92, 10).rotation.x = Math.PI / 2;
    cyl(cradle, M.cave, 0.04, 0.04, 0.16, bx, 0.06, 3.02, 8).rotation.x = Math.PI / 2;
    box(cradle, M.steelDark, 0.24, 0.07, 0.7, bx, 0.3, -0.15);
    const chute = box(cradle, M.steelDark, 0.22, 0.5, 0.22, bx, -0.34, -0.5);
    chute.rotation.x = 0.32;
  }
  m.userData.trainRate = 1.5;
  arm(m, cradle, [[-0.34, 0.06, 3.08], [0.34, 0.06, 3.08]]);
  // The layer and the trainer on their seats, with their handwheels.
  for (const sgn of [-1, 1]) {
    box(m, M.steelDark, 0.5, 0.09, 0.44, sgn * 1.3, 1.62, -0.5);
    box(m, M.steelDark, 0.09, 0.42, 0.09, sgn * 1.3, 1.4, -0.5);
    cyl(m, M.gunDark, 0.24, 0.24, 0.06, sgn * 1.12, 1.95, -0.05, 12).rotation.z = Math.PI / 2;
    const br = box(m, M.gun, 0.62, 0.12, 0.3, sgn * 1.05, 1.55, -0.5);
    br.rotation.z = -sgn * 0.1;
  }
  // The splinter plate across the front of the carriage, and the ready-use
  // clips in their racks abaft it.
  const plate = box(m, M.gun, 1.9, 0.62, 0.09, 0, 1.62, 0.75);
  plate.rotation.x = -0.20;
  for (const sgn of [-1, 1]) box(m, M.steelDark, 0.26, 0.5, 0.36, sgn * 0.55, 1.62, -0.85);
  return m;
}

/** A 2 cm Flakvierling 38, or with `quad` false the 2 cm C/30 single. */
export function twoCm(g, M, x, y, z, ry, quad = true) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  g.add(m);
  // The base plate, the training column and the ring it swings on.
  cyl(m, M.steelDark, 0.72, 0.78, 0.12, 0, 0.06, 0, 14);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    box(m, M.steelDark, 0.16, 0.1, 0.4, Math.sin(a) * 0.5, 0.16, Math.cos(a) * 0.5, a);
  }
  cyl(m, M.steelDark, 0.34, 0.46, 0.62, 0, 0.42, 0, 12);
  cyl(m, M.gunDark, 0.4, 0.4, 0.1, 0, 0.78, 0, 12);
  // The carriage, which trains with the mounting: the trunnion carriers, the
  // layer's seat, his handwheels, and the shield with its two wings.
  const carriage = new THREE.Group();
  carriage.position.set(0, 0.86, 0);
  m.add(carriage);
  for (const sgn of [-1, 1]) {
    box(carriage, M.gunDark, 0.13, 0.55, 0.3, sgn * 0.42, 0.18, -0.05);
    cyl(carriage, M.gunDark, 0.12, 0.12, 0.05, sgn * 0.5, 0.36, -0.05, 10).rotation.z = Math.PI / 2;
    cyl(carriage, M.steelDark, 0.16, 0.16, 0.04, sgn * 0.5, 0.2, -0.42, 10).rotation.z = Math.PI / 2;
  }
  box(carriage, M.gunDark, 0.38, 0.08, 0.34, 0, 0.06, -0.62);
  box(carriage, M.gunDark, 0.34, 0.36, 0.07, 0, 0.26, -0.8);
  const shield = box(carriage, M.gun, quad ? 1.18 : 0.8, 0.78, 0.09, 0, 0.42, 0.5);
  shield.rotation.x = -0.12;
  for (const sgn of [-1, 1]) {
    const wing = box(carriage, M.gun, quad ? 0.4 : 0.3, 0.72, 0.08, sgn * (quad ? 0.75 : 0.5), 0.4, 0.4);
    wing.rotation.y = -sgn * 0.5;
  }
  // The guns, which elevate about the trunnions.
  const guns = new THREE.Group();
  guns.position.set(0, 0.36, -0.05);
  carriage.add(guns);
  const spots = quad ? [[-0.24, -0.3], [0.24, -0.3], [-0.24, 0.04], [0.24, 0.04]] : [[0, -0.16]];
  for (const [bx, by] of spots) {
    box(guns, M.gunDark, 0.14, 0.15, 0.62, bx, by, -0.05);
    tubeZ(guns, M.gunDark, 0.075, 0.34, bx, by, 0.37, 8);
    tubeZ(guns, M.gunDark, 0.042, 1.30, bx, by, 1.1, 6);
    cyl(guns, M.gunDark, 0.075, 0.05, 0.16, bx, by, 1.79, 8).rotation.x = Math.PI / 2;
    box(guns, M.gunDark, 0.1, 0.4, 0.17, bx + 0.17, by + 0.26, -0.01);
  }
  m.userData.trainRate = quad ? 2.1 : 2.8;
  arm(m, guns, spots.map(([bx, by]) => [bx, by, 1.89]));
  return m;
}
