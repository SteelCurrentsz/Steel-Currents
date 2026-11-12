// The United States Navy's wartime close-range and dual-purpose mountings.
//
// A twin 5"/38 in a Mk 32, a single 5"/25 on its open pedestal, a quadruple
// and a twin 40 mm Bofors, and a single 20 mm Oerlikon: the same four mountings went aboard everything from a
// Fletcher to an Iowa, in the same tubs, with the same directors alongside.
// They were drawn once for the Cleveland and are kept here so every American
// ship in the game carries the guns she actually carried, built the same way.
//
// Each builder takes the group to hang the mounting on, the ship's own
// material set -- so a Measure 22 Iowa and a Measure 21 Cleveland come out in
// their own paint -- and where the mounting stands. What comes back is the
// node that trains, already armed with its muzzles, which is what the scene
// lays and what the gunlayer's camera rides.
//
// Local frame as everywhere else: +Z is the bow, +Y is up, y = 0 the
// waterline. `ry` is the bearing the mounting is stowed on.

import * as THREE from '../../../vendor/three.module.js';
import { arm as armMount } from './mounts.js';
import { box, cyl, tubeZ, loftRings } from './shipkit.js';

/**
 * The splinter tub a light gun stands in: a ring of plate, open at the back so
 * the crew can get to it and the ready-use clips can come up.
 */
export function tub(g, M, r, h, x, y, z, ry, n = 16) {
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

/**
 * A twin 5"/38 in a Mk 32 enclosed mount: the dual-purpose gun that is half
 * the reason a Cleveland was worth building, and the whole of the reason an
 * Iowa could be left alone by aircraft.
 */
export function fiveInch38(g, M, x, y, z, ry) {
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
  const cradle = new THREE.Group();
  cradle.position.set(0, 1.4, 1.95);
  cradle.rotation.x = -0.05;
  mount.add(cradle);
  for (const dx of [-0.72, 0.72]) {
    cyl(cradle, M.canvas, 0.4, 0.46, 0.5, dx, 0, 0.28, 12).rotation.x = Math.PI / 2;
    tubeZ(cradle, M.gunDark, 0.2, 1.6, dx, 0, 1.15, 12);
    tubeZ(cradle, M.gunDark, 0.125, 4.8, dx, 0, 2.85, 12);
    cyl(cradle, M.gunDark, 0.14, 0.15, 0.26, dx, 0, 5.2, 12).rotation.x = Math.PI / 2;
  }
  armMount(mount, cradle, [-0.72, 0.72].map((dx) => [dx, 0, 5.36]));
  return mount;
}

/**
 * A single 5"/25 on its Mk 19 open pedestal mount: the Treaty cruisers' and
 * the pre-war battleships' anti-aircraft gun, a short, quick-firing gun that
 * a crew could load at any elevation, worked in the open with nothing over
 * it but the sky. Its trunnions stand high on the carriage and well back
 * along the barrel, so it can be laid up near the vertical without its breech
 * striking the deck; the fuze setter and the loading tray ride on its left.
 */
export function fiveInch25(g, M, x, y, z, ry) {
  const mount = new THREE.Group();
  mount.position.set(x, y, z);
  mount.rotation.y = ry;
  mount.userData.dynamic = true;
  mount.userData.rest = ry;
  g.add(mount);
  // The pedestal, bolted to the deck, and the carriage that trains on it.
  cyl(mount, M.steelDark, 0.62, 0.78, 0.5, 0, 0.25, 0, 16);
  cyl(mount, M.gunDark, 0.58, 0.58, 0.12, 0, 0.56, 0, 16);
  box(mount, M.gun, 1.3, 0.34, 1.5, 0, 0.78, 0.05);
  // Its two side brackets, which carry the trunnions.
  for (const sgn of [-1, 1]) box(mount, M.gun, 0.14, 0.9, 0.85, sgn * 0.42, 1.28, 0.1);
  // The pointer's and the trainer's seats and their sights, either side.
  for (const sgn of [-1, 1]) {
    box(mount, M.steelDark, 0.34, 0.08, 0.34, sgn * 0.95, 1.0, -0.25);
    box(mount, M.gunDark, 0.12, 0.5, 0.12, sgn * 0.95, 1.25, 0.05);
    box(mount, M.gunDark, 0.14, 0.14, 0.42, sgn * 0.82, 1.62, 0.2);
  }
  // The fuze setter and the loading tray on its left.
  box(mount, M.gunDark, 0.36, 0.6, 0.5, 0.85, 0.85, -0.65);
  box(mount, M.steel, 0.2, 0.1, 0.9, 0.62, 1.15, -0.7);
  const cradle = new THREE.Group();
  cradle.position.set(0, 1.55, 0.15);
  mount.add(cradle);
  // The slide and the recoil cylinders under the barrel, the breech housing
  // behind the trunnions, and the barrel: twenty-five calibres, a shade over
  // three metres of it.
  box(cradle, M.gun, 0.5, 0.46, 1.5, 0, -0.06, 0.1);
  box(cradle, M.gunDark, 0.56, 0.52, 0.7, 0, 0, -0.85);
  for (const sgn of [-1, 1]) tubeZ(cradle, M.gunDark, 0.07, 1.2, sgn * 0.17, -0.27, 0.35, 8);
  tubeZ(cradle, M.gunDark, 0.13, 1.1, 0, 0.04, 1.2, 12);
  tubeZ(cradle, M.gunDark, 0.095, 2.2, 0, 0.04, 2.8, 12);
  cyl(cradle, M.gunDark, 0.11, 0.11, 0.18, 0, 0.04, 3.82, 12).rotation.x = Math.PI / 2;
  mount.userData.trainRate = 0.6;
  armMount(mount, cradle, [[0, 0.04, 3.92]]);
  return mount;
}

/**
 * A quadruple 40 mm Bofors, with its own Mk 51 director alongside. `tubR` is
 * the tub's radius, for a ship whose tubs stand closer to her funnels than
 * the fleet's usual one allows, and `lockers` the bearings round the tub its
 * ready-use lockers stand on, for one whose tubs are at the deck edge.
 */
export function quadBofors(g, M, x, y, z, ry, { tubR = 2.5, lockers = [2.2, 2.8, 3.5, 4.1] } = {}) {
  const t = tub(g, M, tubR, 1.25, x, y, z, ry, 18);
  const m = new THREE.Group();
  m.position.y = 0.4;
  m.userData.dynamic = true;
  m.userData.rest = ry;
  t.add(m);
  cyl(m, M.gunDark, 0.66, 0.86, 0.6, 0, 0.3, 0, 14);
  box(m, M.gun, 2.5, 0.8, 1.3, 0, 0.95, -0.15);
  box(m, M.gun, 2.1, 0.5, 0.6, 0, 1.5, -0.5);
  const cradle = new THREE.Group();
  cradle.position.set(0, 1.25, 0);
  cradle.rotation.x = -0.14;
  m.add(cradle);
  for (const dx of [-0.95, -0.32, 0.32, 0.95]) {
    tubeZ(cradle, M.gunDark, 0.085, 2.9, dx, 0, 1.5, 10);
    cyl(cradle, M.gunDark, 0.12, 0.12, 0.4, dx, 0, 2.9, 10).rotation.x = Math.PI / 2;
    box(cradle, M.gunDark, 0.2, 0.5, 0.5, dx, 0.3, -0.2);   // the clip loader
  }
  m.userData.trainRate = 1.4;      // a quad Bofors is a heavy thing to swing
  armMount(m, cradle, [-0.95, -0.32, 0.32, 0.95].map((dx) => [dx, 0, 3.1]));
  for (const sgn of [-1, 1]) {
    box(m, M.gunDark, 0.4, 0.5, 0.4, sgn * 1.5, 1.15, -0.5);
    box(m, M.steelDark, 0.5, 0.1, 0.5, sgn * 1.5, 0.9, -0.5);
  }
  // The Mk 51 director on the tub rim: a man, a sight and a joystick.
  const d = new THREE.Group();
  d.position.set(1.9 * (tubR / 2.5), 0.5, -1.4 * (tubR / 2.5));
  t.add(d);
  cyl(d, M.gunDark, 0.22, 0.3, 0.8, 0, 0.4, 0, 10);
  box(d, M.gun, 0.5, 0.42, 0.6, 0, 0.95, 0);
  box(d, M.glass, 0.2, 0.16, 0.08, 0, 1.0, 0.32);
  // Ready-use lockers round the outside of the tub.
  for (const a of lockers) {
    box(g, M.steelDark, 0.6, 0.85, 0.5,
      x + Math.sin(a) * (tubR + 0.5), y + 0.42, z + Math.cos(a) * (tubR + 0.5), a);
  }
  return m;
}

/** A twin 40 mm, which is the same gun in a smaller tub. */
export function twinBofors(g, M, x, y, z, ry) {
  const t = tub(g, M, 1.6, 1.15, x, y, z, ry, 14);
  const m = new THREE.Group();
  m.position.y = 0.35;
  m.userData.dynamic = true;
  m.userData.rest = ry;
  t.add(m);
  cyl(m, M.gunDark, 0.44, 0.58, 0.5, 0, 0.25, 0, 12);
  box(m, M.gun, 1.2, 0.66, 1.05, 0, 0.78, -0.1);
  const cradle = new THREE.Group();
  cradle.position.set(0, 1.05, 0);
  cradle.rotation.x = -0.14;
  m.add(cradle);
  for (const dx of [-0.3, 0.3]) {
    tubeZ(cradle, M.gunDark, 0.08, 2.4, dx, 0, 1.2, 10);
    cyl(cradle, M.gunDark, 0.11, 0.11, 0.34, dx, 0, 2.3, 10).rotation.x = Math.PI / 2;
  }
  m.userData.trainRate = 1.7;
  armMount(m, cradle, [-0.3, 0.3].map((dx) => [dx, 0, 2.5]));
  for (const sgn of [-1, 1]) box(m, M.steelDark, 0.44, 0.1, 0.44, sgn * 1.0, 0.55, -0.45);
  return m;
}

/** A single 20 mm Oerlikon on its pedestal, in a small tub. */
export function oerlikon(g, M, x, y, z, ry) {
  const t = tub(g, M, 1.0, 1.0, x, y, z, ry, 10);
  const o = new THREE.Group();
  o.position.y = 0.3;
  o.userData.dynamic = true;
  o.userData.rest = ry;
  t.add(o);
  cyl(o, M.gunDark, 0.17, 0.24, 0.95, 0, 0.48, 0, 10);
  const gun = new THREE.Group();
  gun.position.y = 0.98;
  gun.rotation.x = -0.34;
  o.add(gun);
  tubeZ(gun, M.gunDark, 0.058, 1.9, 0, 0, 0.95, 8);
  cyl(gun, M.gunDark, 0.1, 0.1, 0.5, 0, 0, 0.5, 8).rotation.x = Math.PI / 2;
  cyl(gun, M.gunDark, 0.32, 0.32, 0.16, 0, 0.3, -0.05, 12).rotation.z = Math.PI / 2;
  box(gun, M.gun, 0.5, 0.16, 0.5, 0, -0.2, -0.45);
  for (const sgn of [-1, 1]) box(gun, M.gunDark, 0.1, 0.34, 0.1, sgn * 0.22, -0.28, -0.6);
  o.userData.trainRate = 2.9;
  armMount(o, gun, [[0, 0, 1.9]]);
  return o;
}

/**
 * A twin 20 mm Oerlikon, the Mk 24 mount: two guns side by side on one
 * pedestal, under one shield, in a tub a little wider than a single's.
 */
export function twinOerlikon(g, M, x, y, z, ry) {
  const t = tub(g, M, 1.2, 1.0, x, y, z, ry, 12);
  const o = new THREE.Group();
  o.position.y = 0.3;
  o.userData.dynamic = true;
  o.userData.rest = ry;
  t.add(o);
  cyl(o, M.gunDark, 0.2, 0.28, 0.95, 0, 0.48, 0, 10);
  const gun = new THREE.Group();
  gun.position.y = 0.98;
  gun.rotation.x = -0.34;
  o.add(gun);
  for (const dx of [-0.2, 0.2]) {
    tubeZ(gun, M.gunDark, 0.058, 1.9, dx, 0, 0.95, 8);
    cyl(gun, M.gunDark, 0.1, 0.1, 0.5, dx, 0, 0.5, 8).rotation.x = Math.PI / 2;
    cyl(gun, M.gunDark, 0.3, 0.3, 0.14, dx, 0.3, -0.05, 12).rotation.z = Math.PI / 2;
  }
  box(gun, M.gun, 0.9, 0.5, 0.06, 0, 0.1, 0.25);
  box(gun, M.gun, 0.6, 0.16, 0.5, 0, -0.2, -0.45);
  for (const sgn of [-1, 1]) box(gun, M.gunDark, 0.1, 0.34, 0.1, sgn * 0.3, -0.28, -0.6);
  o.userData.trainRate = 2.6;
  armMount(o, gun, [[-0.2, 0, 1.9], [0.2, 0, 1.9]]);
  return o;
}
