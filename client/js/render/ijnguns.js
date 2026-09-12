// The Imperial Japanese Navy's mountings, drawn once and shared.
//
// Yamato, Shinano and Takao carry very nearly the same guns above the main
// battery -- the 12.7 cm Type 89 twin is on all three, the 25 mm Type 96 is on
// all three in three different mountings, and the big optical rangefinders and
// the Type 21 and Type 13 radars are the same sets bolted to different towers.
// So they are built here and each ship asks for them in her own paint.
//
// Every builder takes the ship's own material proxy `M`, so a Yamato in
// Kure grey and a Takao in the darker Yokosuka grey come out in their own
// colours from the same geometry.
//
// The mountings themselves, in the order a gunnery officer would list them:
//
//   fortySix      46 cm/45 Type 94 triple, the largest naval gun ever mounted
//   eightInch     20.3 cm/50 Type 3 No.2 twin, the standard IJN cruiser turret
//   fifteenFive   15.5 cm/60 Type 3 triple, Mogami's old main battery
//   typeEightNine 12.7 cm/40 Type 89 twin, the dual-purpose gun
//   triple25      25 mm/60 Type 96 triple in its shield
//   twin25        the same gun in a twin
//   single25      and on a pedestal
//   rocket        12 cm 28-barrel anti-aircraft rocket launcher
//   quadTorp      61 cm Type 92 quadruple torpedo mount
//
// and the fittings: `rangefinder`, `director`, `typeTwentyOne`,
// `typeThirteen`, `searchlight`.
//
// Local frame as everywhere: +Z is the bow, +Y is up, starboard is -X.

import * as THREE from '../../../vendor/three.module.js';
import { arm } from './mounts.js';
import { box, cyl, tubeZ, tubeX } from './shipkit.js';

/**
 * A gunhouse, lofted through a set of stations.
 *
 * `rows` are [dz, half-breadth at the deck, half-breadth at the roof, roof
 * height] from the rear plate forward. The roof is narrower than the sides,
 * which is the chamfer every Japanese turret has, and the winding puts every
 * face outwards -- a gunhouse wound the other way is not there at all, because
 * back faces are not drawn and you see straight through the near side into the
 * inside of the far one.
 */
export function gunhouse(m, mat, rows) {
  const pos = [];
  const idx = [];
  for (const [dz, wl, wu, h] of rows) {
    pos.push(-wl, 0, dz, wl, 0, dz, -wu, h, dz, wu, h, dz);
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    idx.push(a, b + 2, a + 2, a, b, b + 2);             // port side
    idx.push(a + 1, b + 3, b + 1, a + 1, a + 3, b + 3);  // starboard side
    idx.push(a + 2, b + 3, a + 3, a + 2, b + 2, b + 3);  // roof
    idx.push(a, b + 1, b, a, a + 1, b + 1);              // floor
  }
  const n = (rows.length - 1) * 4;
  idx.push(0, 3, 1, 0, 2, 3);                            // rear plate
  idx.push(n, n + 1, n + 3, n, n + 3, n + 2);            // face
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  m.add(new THREE.Mesh(geo, mat));
}

/**
 * 46 cm/45 Type 94, three in a turret.
 *
 * Two thousand seven hundred and seventy-four tonnes of turret -- more than a
 * destroyer -- carrying three eighteen-inch guns twenty-one metres long, each
 * throwing a shell of a tonne and a half. The face plate is 650 mm of armour
 * and the roof 270, and the whole of it trains on a barbette 13 metres across.
 *
 * The shape is particular and worth getting right: a long sloped face, a flat
 * chamfered roof with the two sighting hoods well forward, a pronounced
 * overhang at the rear where the rangefinder ports come out of both quarters,
 * and a 15.5 m base-length rangefinder in the turret itself on A and Y.
 */
export function fortySix(g, M, x, y, z, aft, rf = true) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = aft ? Math.PI : 0;
  m.userData.dynamic = true;
  m.userData.mounting = true;

  // The roller path and the collar the turret trains on.
  cyl(m, M.gunDark, 6.6, 6.9, 0.7, 0, -0.36, 0, 28);

  const H = 5.6;
  const rows = [
    [-6.40, 5.55, 4.70, H * 0.80],
    [-5.70, 6.05, 5.25, H * 0.93],
    [-3.60, 6.20, 5.40, H],
    [-0.60, 6.20, 5.40, H],
    [2.40, 6.10, 5.30, H],
    [4.40, 5.70, 4.95, H * 0.98],
    [6.10, 4.85, 4.15, H * 0.86],
    [7.05, 4.20, 3.60, H * 0.66],
  ];
  gunhouse(m, M.gun, rows);

  // The rangefinder in the turret roof: a long tube across the after end with
  // its ports out of both quarters. A and Y carried fifteen and a half metres
  // of it, which is why the turret is so deep from face to rear plate.
  if (rf) {
    box(m, M.gunDark, 3.8, 1.05, 2.2, 0, H + 0.52, -4.0);
    for (const sgn of [-1, 1]) {
      box(m, M.gunDark, 1.5, 1.0, 1.3, sgn * 5.3, H * 0.76, -3.4);
      cyl(m, M.glass, 0.30, 0.30, 0.12, sgn * 6.1, H * 0.76, -3.4, 8)
        .rotation.z = Math.PI / 2;
    }
  }
  // Sighting hoods either side of the face, roof hatches, and the vent cowls.
  for (const sgn of [-1, 1]) {
    box(m, M.gunDark, 1.15, 0.7, 1.7, sgn * 4.3, H + 0.34, 3.1);
    cyl(m, M.gunDark, 0.55, 0.55, 0.28, sgn * 2.9, H + 0.14, -1.0, 10);
    cyl(m, M.gunDark, 0.30, 0.30, 0.6, sgn * 1.4, H + 0.30, -5.0, 8);
    // Training-gear blisters on both quarters.
    box(m, M.gunDark, 0.6, 1.4, 2.0, sgn * 6.05, 1.6, -2.0);
  }
  // Rungs up the rear plate.
  for (let i = 0; i < 8; i++) {
    box(m, M.gunDark, 0.9, 0.08, 0.08, 0, 0.5 + i * 0.66, -6.46);
  }

  // The cradles. Unlike a German triple the three Type 94s are individually
  // sleeved and individually elevated -- but they are laid together, so one
  // node carries all three.
  const guns = new THREE.Group();
  guns.position.set(0, 4.05, 5.0);
  guns.rotation.x = -0.035;
  const muzzles = [];
  // Three metres seven between axes, which is what a turret thirteen metres
  // across the barbette has room for.
  for (const dx of [-3.7, 0, 3.7]) {
    tubeZ(guns, M.gunDark, 0.78, 4.2, dx, 0, 2.1, 14);   // jacket
    tubeZ(guns, M.gun, 0.56, 12.4, dx, 0, 10.0, 14);     // chase
    tubeZ(guns, M.gunDark, 0.58, 0.8, dx, 0, 16.4, 14);  // the muzzle swell
    muzzles.push([dx, 0, 16.9]);
    // The blast bag where the barrel comes through the face.
    cyl(guns, M.canvas, 1.05, 1.25, 1.5, dx, 0, 0.7, 12).rotation.x = Math.PI / 2;
  }
  m.add(guns);
  arm(m, guns, muzzles);
  g.add(m);
  return m;
}

/**
 * 20.3 cm/50 Type 3 No.2, two in a turret: Takao's main battery.
 *
 * A light, thin-skinned turret -- 25 mm of plate, proof against splinters and
 * nothing else -- with a distinctly sloped face and a flat roof carrying a
 * sighting hood each side. The two barrels are in one sleeve and elevate
 * together, which is why a Japanese heavy cruiser's salvos were so tight and
 * so prone to interference between the shells.
 */
export function eightInch(g, M, x, y, z, angle, rf = false) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.userData.rest = angle;
  m.userData.dynamic = true;
  m.userData.mounting = true;

  cyl(m, M.gunDark, 3.05, 3.2, 0.42, 0, -0.22, 0, 20);

  const H = 3.05;
  const rows = [
    [-3.15, 2.85, 2.35, H * 0.82],
    [-2.70, 3.05, 2.60, H * 0.94],
    [-1.60, 3.10, 2.68, H],
    [0.30, 3.10, 2.68, H],
    [1.80, 3.02, 2.60, H],
    [2.90, 2.72, 2.35, H * 0.95],
    [3.75, 2.20, 1.90, H * 0.80],
    [4.25, 1.80, 1.55, H * 0.62],
  ];
  gunhouse(m, M.gun, rows);

  if (rf) {
    box(m, M.gunDark, 2.2, 0.62, 1.2, 0, H + 0.32, -2.0);
    for (const sgn of [-1, 1]) {
      cyl(m, M.glass, 0.18, 0.18, 0.08, sgn * 2.7, H * 0.74, -1.8, 8)
        .rotation.z = Math.PI / 2;
    }
  }
  for (const sgn of [-1, 1]) {
    box(m, M.gunDark, 0.62, 0.46, 0.95, sgn * 2.2, H + 0.23, 1.7);
    cyl(m, M.gunDark, 0.30, 0.30, 0.18, sgn * 1.3, H + 0.09, -0.5, 8);
  }
  for (let i = 0; i < 5; i++) {
    box(m, M.gunDark, 0.6, 0.06, 0.06, 0, 0.4 + i * 0.55, -3.19);
  }

  const guns = new THREE.Group();
  guns.position.set(0, 2.15, 2.9);
  guns.rotation.x = -0.03;
  const muzzles = [];
  for (const dx of [-1.0, 1.0]) {
    tubeZ(guns, M.gunDark, 0.36, 2.1, dx, 0, 1.05, 12);
    tubeZ(guns, M.gun, 0.24, 7.4, dx, 0, 5.2, 12);
    tubeZ(guns, M.gunDark, 0.26, 0.4, dx, 0, 9.1, 12);
    muzzles.push([dx, 0, 9.35]);
    cyl(guns, M.canvas, 0.48, 0.58, 0.85, dx, 0, 0.4, 10).rotation.x = Math.PI / 2;
  }
  m.add(guns);
  arm(m, guns, muzzles);
  g.add(m);
  return m;
}

/**
 * 15.5 cm/60 Type 3, three in a turret: Yamato's secondary.
 *
 * These are Mogami's original main-battery turrets, taken off her when she was
 * re-gunned with eight-inch and put aboard the two battleships -- which is why
 * a 62,000-tonne ship carries a light cruiser's turret. Beautifully made,
 * fast-training, and armoured like a biscuit tin: 25 mm, and one of them going
 * up is what did for Yamato's amidships mountings.
 */
export function fifteenFive(g, M, x, y, z, angle) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.userData.rest = angle;
  m.userData.dynamic = true;
  m.userData.mounting = true;

  cyl(m, M.gunDark, 2.85, 3.0, 0.4, 0, -0.2, 0, 20);

  const H = 2.75;
  const rows = [
    [-2.95, 2.60, 2.15, H * 0.84],
    [-2.50, 2.82, 2.40, H * 0.95],
    [-1.40, 2.88, 2.48, H],
    [0.40, 2.88, 2.48, H],
    [1.90, 2.78, 2.40, H],
    [2.95, 2.45, 2.10, H * 0.94],
    [3.70, 1.95, 1.70, H * 0.78],
    [4.15, 1.60, 1.38, H * 0.60],
  ];
  gunhouse(m, M.gun, rows);
  for (const sgn of [-1, 1]) {
    box(m, M.gunDark, 0.55, 0.42, 0.9, sgn * 2.05, H + 0.21, 1.6);
  }
  box(m, M.gunDark, 1.9, 0.5, 1.0, 0, H + 0.26, -1.9);

  const guns = new THREE.Group();
  guns.position.set(0, 1.95, 2.8);
  guns.rotation.x = -0.03;
  const muzzles = [];
  for (const dx of [-1.15, 0, 1.15]) {
    tubeZ(guns, M.gunDark, 0.26, 1.6, dx, 0, 0.8, 10);
    tubeZ(guns, M.gun, 0.17, 7.1, dx, 0, 4.4, 10);
    tubeZ(guns, M.gunDark, 0.185, 0.3, dx, 0, 8.1, 10);
    muzzles.push([dx, 0, 8.3]);
    cyl(guns, M.canvas, 0.34, 0.42, 0.7, dx, 0, 0.34, 10).rotation.x = Math.PI / 2;
  }
  m.add(guns);
  arm(m, guns, muzzles);
  g.add(m);
  return m;
}

/**
 * 12.7 cm/40 Type 89, two on a mounting: the dual-purpose gun of the fleet.
 *
 * On the later ships it is in a shield -- an open-backed box with a sloped
 * front, high enough to clear the breeches at eighty degrees of elevation --
 * and that is the version all three of these ships carry. The two barrels are
 * well separated and have no blast bags: the shield is the only thing between
 * the crew and the muzzle blast, and it is why a Type 89 crew went deaf.
 */
export function typeEightNine(g, M, x, y, z, angle, shielded = true) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.userData.rest = angle;
  m.userData.dynamic = true;
  m.userData.mounting = true;

  cyl(m, M.gunDark, 1.55, 1.7, 0.36, 0, -0.18, 0, 16);
  // The pedestal and the training rack inside it.
  cyl(m, M.gunDark, 1.05, 1.15, 0.9, 0, 0.42, 0, 14);

  if (shielded) {
    // A shield rather than a gunhouse: three sides and a roof, open at the
    // back where the ammunition comes up.
    const H = 2.35;
    const rows = [
      [-1.55, 1.95, 1.70, H],
      [-0.20, 2.00, 1.75, H],
      [1.15, 1.92, 1.68, H],
      [2.05, 1.60, 1.40, H * 0.92],
      [2.55, 1.25, 1.10, H * 0.74],
    ];
    // Open at the rear, so the back plate is left off: built as a strip
    // rather than through gunhouse().
    const pos = [];
    const idx = [];
    for (const [dz, wl, wu, h] of rows) {
      pos.push(-wl, 0.55, dz, wl, 0.55, dz, -wu, h, dz, wu, h, dz);
    }
    for (let i = 0; i < rows.length - 1; i++) {
      const a = i * 4;
      const b = (i + 1) * 4;
      idx.push(a, b + 2, a + 2, a, b, b + 2);
      idx.push(a + 1, b + 3, b + 1, a + 1, a + 3, b + 3);
      idx.push(a + 2, b + 3, a + 3, a + 2, b + 2, b + 3);
    }
    const n = (rows.length - 1) * 4;
    idx.push(n, n + 1, n + 3, n, n + 3, n + 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    m.add(new THREE.Mesh(geo, M.gun));
    // The layer's port in the face, one each side of the barrels.
    for (const sgn of [-1, 1]) {
      box(m, M.gunDark, 0.34, 0.30, 0.1, sgn * 1.0, 1.85, 2.55);
    }
  }

  const guns = new THREE.Group();
  guns.position.set(0, 1.45, 0.55);
  guns.rotation.x = -0.12;
  const muzzles = [];
  for (const dx of [-0.78, 0.78]) {
    tubeZ(guns, M.gunDark, 0.21, 1.1, dx, 0, 0.55, 10);
    tubeZ(guns, M.gun, 0.125, 4.0, dx, 0, 3.0, 10);
    muzzles.push([dx, 0, 5.05]);
  }
  // The loading trays and the fuze setters behind the breeches.
  for (const dx of [-0.78, 0.78]) {
    box(guns, M.gunDark, 0.34, 0.26, 1.0, dx, -0.28, -0.8);
  }
  m.add(guns);
  arm(m, guns, muzzles);
  g.add(m);
  return m;
}

/** The 25 mm Type 96 barrel and its flash hider, built once. */
function barrel25(g, M, dx, dy) {
  tubeZ(g, M.gunDark, 0.075, 0.5, dx, dy, 0.25, 8);
  tubeZ(g, M.gun, 0.045, 1.45, dx, dy, 1.2, 8);
  tubeZ(g, M.gunDark, 0.06, 0.18, dx, dy, 2.0, 8);
  // The fifteen-round magazine standing up out of the receiver, which is the
  // Type 96's whole problem: the gun stops every fifteen rounds.
  box(g, M.gunDark, 0.12, 0.5, 0.26, dx, dy + 0.36, 0.1);
  return [dx, dy, 2.12];
}

/**
 * 25 mm/60 Type 96, three on a mounting behind a shield.
 *
 * The standard heavy close-range mounting: three Hotchkiss guns side by side
 * on a powered mount, with a curved splinter shield round the front and the
 * layers sitting out in the open behind it. Yamato ended with fifty of these.
 */
export function triple25(g, M, x, y, z, angle, shielded = true) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.userData.rest = angle;
  m.userData.dynamic = true;
  m.userData.mounting = true;

  cyl(m, M.gunDark, 0.95, 1.05, 0.3, 0, -0.15, 0, 14);
  cyl(m, M.gunDark, 0.6, 0.66, 0.55, 0, 0.27, 0, 12);
  if (shielded) {
    // A curved shield: five plates round the front of the mounting.
    for (let i = -2; i <= 2; i++) {
      const a = i * 0.34;
      box(m, M.gun, 0.46, 1.35, 0.08, Math.sin(a) * 1.35, 1.1, Math.cos(a) * 1.35)
        .rotation.y = a;
    }
  }
  const guns = new THREE.Group();
  guns.position.set(0, 1.0, 0.35);
  guns.rotation.x = -0.22;
  const muzzles = [];
  for (const dx of [-0.42, 0, 0.42]) muzzles.push(barrel25(guns, M, dx, 0));
  // The layer's seats and the shoulder rests, which is how it was aimed.
  for (const sgn of [-1, 1]) {
    box(guns, M.gunDark, 0.22, 0.06, 0.26, sgn * 0.72, -0.22, -0.7);
  }
  m.add(guns);
  arm(m, guns, muzzles);
  g.add(m);
  return m;
}

/** The same gun, two on a mounting. */
export function twin25(g, M, x, y, z, angle) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.userData.rest = angle;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  cyl(m, M.gunDark, 0.78, 0.86, 0.26, 0, -0.13, 0, 12);
  cyl(m, M.gunDark, 0.48, 0.54, 0.5, 0, 0.24, 0, 10);
  const guns = new THREE.Group();
  guns.position.set(0, 0.9, 0.3);
  guns.rotation.x = -0.22;
  const muzzles = [];
  for (const dx of [-0.26, 0.26]) muzzles.push(barrel25(guns, M, dx, 0));
  m.add(guns);
  arm(m, guns, muzzles);
  g.add(m);
  return m;
}

/** And on a pedestal, laid by one man on his shoulders. */
export function single25(g, M, x, y, z, angle) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.userData.rest = angle;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  cyl(m, M.gunDark, 0.55, 0.62, 0.22, 0, -0.11, 0, 12);
  cyl(m, M.gunDark, 0.22, 0.26, 0.7, 0, 0.35, 0, 10);
  const guns = new THREE.Group();
  guns.position.set(0, 0.85, 0.22);
  guns.rotation.x = -0.24;
  const muzzles = [barrel25(guns, M, 0, 0)];
  box(guns, M.gunDark, 0.5, 0.05, 0.22, 0, -0.2, -0.62);
  m.add(guns);
  arm(m, guns, muzzles);
  g.add(m);
  return m;
}

/**
 * The 12 cm 28-barrel anti-aircraft rocket launcher.
 *
 * Shinano and the later Yamato refit carried these: a rotating box of
 * twenty-eight tubes in four rows of seven that threw a barrage of incendiary
 * rockets up in front of an attacking formation. It was loud, it was
 * spectacular, and by every account it hit almost nothing.
 */
export function rocket(g, M, x, y, z, angle) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.userData.rest = angle;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  cyl(m, M.gunDark, 0.85, 0.95, 0.3, 0, -0.15, 0, 14);
  cyl(m, M.gunDark, 0.5, 0.56, 0.7, 0, 0.35, 0, 12);
  const guns = new THREE.Group();
  guns.position.set(0, 1.15, 0.2);
  guns.rotation.x = -0.5;
  const muzzles = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      const dx = (c - 3) * 0.19;
      const dy = (r - 1.5) * 0.19;
      tubeZ(guns, M.gunDark, 0.075, 1.15, dx, dy, 0.58, 6);
      if (r === 3) muzzles.push([dx, dy, 1.2]);
    }
  }
  box(guns, M.gun, 1.55, 0.9, 0.16, 0, 0, -0.05);
  m.add(guns);
  arm(m, guns, muzzles);
  g.add(m);
  return m;
}

/**
 * 61 cm Type 92 quadruple torpedo mount: Takao's broadside.
 *
 * Four Type 93 Long Lances in a rotating shielded box on the upper deck, with
 * the reload rack alongside. The Long Lance is the reason a Japanese heavy
 * cruiser is dangerous well beyond her gun range -- oxygen-driven, forty knots,
 * twenty kilometres, and no wake to see it coming.
 */
export function quadTorp(g, M, x, y, z, angle) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.userData.rest = angle;
  m.userData.dynamic = true;
  m.userData.mounting = true;
  cyl(m, M.gunDark, 1.25, 1.35, 0.3, 0, -0.15, 0, 16);
  const guns = new THREE.Group();
  guns.position.set(0, 0.95, 0);
  const muzzles = [];
  // Two over two, in the shielded box.
  for (const dy of [-0.38, 0.38]) {
    for (const dx of [-0.4, 0.4]) {
      tubeZ(guns, M.gun, 0.35, 8.6, dx, dy, 0, 12);
      muzzles.push([dx, dy, 4.4]);
    }
  }
  // The splinter box round the tubes, and the training gear under it.
  box(guns, M.gunDark, 1.75, 0.18, 8.2, 0, 0.82, 0);
  box(guns, M.gunDark, 0.14, 1.7, 8.2, -0.86, 0, 0);
  box(guns, M.gunDark, 0.14, 1.7, 8.2, 0.86, 0, 0);
  box(guns, M.gunDark, 1.75, 1.7, 0.16, 0, 0, -4.2);
  m.add(guns);
  arm(m, guns, muzzles);
  g.add(m);
  return m;
}

/**
 * A coincidence rangefinder on its own mounting.
 *
 * `span` is the base length in metres, which is the whole specification of
 * one: the longer the base the finer the angle it can resolve and the better
 * the range it gives. Yamato's main director carried fifteen and a half metres
 * of it, which is the longest ever put to sea.
 */
export function rangefinder(g, M, x, y, z, span, ry = 0) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.dynamic = true;
  tubeX(m, M.gunDark, span * 0.055, span, 0, 0, 0, 12);
  for (const sgn of [-1, 1]) {
    cyl(m, M.gunDark, span * 0.075, span * 0.075, 0.3, sgn * span * 0.5, 0, 0, 12)
      .rotation.z = Math.PI / 2;
    cyl(m, M.glass, span * 0.05, span * 0.05, 0.08, sgn * (span * 0.5 + 0.2), 0, 0, 10)
      .rotation.z = Math.PI / 2;
  }
  g.add(m);
  return m;
}

/** A director tower: the drum the rangefinder sits on, with its own hood. */
export function director(g, M, x, y, z, r = 1.5, h = 1.9) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.userData.dynamic = true;
  cyl(m, M.steel, r, r * 1.05, h, 0, h / 2, 0, 16);
  cyl(m, M.steelDark, r * 1.08, r * 1.08, 0.16, 0, h + 0.08, 0, 16);
  // The sighting ports round the front of the drum.
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.28;
    box(m, M.cave, 0.42, 0.26, 0.06, Math.sin(a) * r, h * 0.62, Math.cos(a) * r)
      .rotation.y = a;
  }
  g.add(m);
  return m;
}

/**
 * Type 21 air-search radar: the mattress.
 *
 * A rectangular lattice of dipoles in a frame, bolted to the top of the main
 * director. It is the aerial that went to sea on Yamato in 1943 and it looks
 * exactly like a bedstead, which is what everyone called it.
 */
export function typeTwentyOne(g, M, x, y, z, ry = 0, w = 3.6, h = 2.2) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  box(m, M.steelDark, w, 0.1, 0.1, 0, h / 2, 0);
  box(m, M.steelDark, w, 0.1, 0.1, 0, -h / 2, 0);
  box(m, M.steelDark, 0.1, h, 0.1, -w / 2, 0, 0);
  box(m, M.steelDark, 0.1, h, 0.1, w / 2, 0, 0);
  // Four rows of dipoles, which is what a Type 21 array is.
  for (let r = 0; r < 4; r++) {
    const dy = (r - 1.5) * (h / 4.6);
    box(m, M.steelDark, w * 0.94, 0.05, 0.05, 0, dy, 0);
    for (let c = 0; c < 8; c++) {
      const dx = (c - 3.5) * (w / 8.6);
      box(m, M.steelDark, 0.05, h / 6, 0.05, dx, dy, 0.12);
    }
  }
  g.add(m);
  return m;
}

/**
 * Type 13 air-search radar: the ladder.
 *
 * A vertical dipole array lashed to a mast, which is how every late-war
 * Japanese ship carried one. Cheap, and it worked.
 */
export function typeThirteen(g, M, x, y, z, ry = 0, h = 3.4) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  box(m, M.steelDark, 0.09, h, 0.09, 0, h / 2, 0);
  for (let i = 0; i < 6; i++) {
    const dy = 0.4 + (i * (h - 0.7)) / 5;
    box(m, M.steelDark, 1.5, 0.05, 0.05, 0, dy, 0);
    box(m, M.steelDark, 0.05, 0.05, 0.34, -0.72, dy, 0.17);
    box(m, M.steelDark, 0.05, 0.05, 0.34, 0.72, dy, 0.17);
  }
  g.add(m);
  return m;
}

/** A 110 cm searchlight in its ring, with the shutter closed. */
export function searchlight(g, M, x, y, z, r = 0.72) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.userData.dynamic = true;
  cyl(m, M.gunDark, 0.16, 0.2, 1.0, 0, -0.6, 0, 8);
  cyl(m, M.steel, r, r, 0.55, 0, 0, 0, 16).rotation.x = Math.PI / 2;
  cyl(m, M.glass, r * 0.92, r * 0.92, 0.06, 0, 0, 0.3, 16).rotation.x = Math.PI / 2;
  // The trunnion ring it swings in.
  for (const sgn of [-1, 1]) {
    box(m, M.gunDark, 0.12, 0.5, 0.12, sgn * (r + 0.08), -0.2, 0);
  }
  g.add(m);
  return m;
}

/** A ventilation cowl, which every Japanese superstructure is covered in. */
export function cowl(g, M, x, y, z, r = 0.3, h = 1.4, ry = 0) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  cyl(m, M.steel, r, r, h, 0, h / 2, 0, 10);
  cyl(m, M.steelDark, r * 1.15, r * 1.15, r * 1.4, 0, h + r * 0.5, r * 0.5, 10)
    .rotation.x = Math.PI / 2.4;
  g.add(m);
  return m;
}

/** A carley float or a cutter on its chocks, stowed against the deckhouse. */
export function boat(g, M, x, y, z, len = 9.0, ry = 0) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  const w = len * 0.16;
  const rows = [
    [-len / 2, w * 0.15], [-len * 0.36, w * 0.72], [-len * 0.12, w],
    [len * 0.14, w * 0.97], [len * 0.36, w * 0.70], [len / 2, w * 0.12],
  ];
  const pos = [];
  const idx = [];
  for (const [dz, hw] of rows) {
    pos.push(-hw, 0, dz, hw, 0, dz, -hw * 0.82, w * 0.78, dz, hw * 0.82, w * 0.78, dz);
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    idx.push(a, b + 2, a + 2, a, b, b + 2);
    idx.push(a + 1, b + 3, b + 1, a + 1, a + 3, b + 3);
    idx.push(a + 2, b + 3, a + 3, a + 2, b + 2, b + 3);
    idx.push(a, b + 1, b, a, a + 1, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  m.add(new THREE.Mesh(geo, M.boat));
  // Chocks under her and the gripes over her.
  for (const dz of [-len * 0.28, len * 0.28]) {
    box(m, M.steelDark, w * 2.1, 0.22, 0.35, 0, -0.12, dz);
  }
  g.add(m);
  return m;
}
