// A harbour under attack, built out of primitives.
//
// Everything is placed from one seeded generator, so the same port is drawn
// every time rather than a different one each load — a title screen that
// reshuffles itself reads as noise. Repeated clutter (crates, drums, bollards,
// pilings, lit windows) goes through InstancedMesh, which keeps a yard this
// dense down to a few dozen draw calls.

import * as THREE from '../../../vendor/three.module.js';
import { buildShip } from './ships.js';

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Lambert, not Standard: nothing in the yard is a polished surface, everything
// is seen at a distance through smoke, and the physical model costs a great
// deal per pixel with this many lights on it.
const MAT = {
  stone: new THREE.MeshLambertMaterial({ color: 0x4a4741 }),
  concrete: new THREE.MeshLambertMaterial({ color: 0x5a5750 }),
  brick: new THREE.MeshLambertMaterial({ color: 0x53372c }),
  roof: new THREE.MeshLambertMaterial({ color: 0x2e3134 }),
  steel: new THREE.MeshLambertMaterial({ color: 0x434a51 }),
  rust: new THREE.MeshLambertMaterial({ color: 0x5b3520 }),
  tank: new THREE.MeshLambertMaterial({ color: 0x4e5450 }),
  timber: new THREE.MeshLambertMaterial({ color: 0x3a2c20 }),
  dark: new THREE.MeshLambertMaterial({ color: 0x24262a }),
  charred: new THREE.MeshLambertMaterial({ color: 0x191715 }),
  lit: new THREE.MeshBasicMaterial({ color: 0xffb460 }),
};

const box = (w, h, d, mat, x, y, z, ry = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (ry) m.rotation.y = ry;
  return m;
};

/** A pitched roof: a three-sided prism laid on its side. */
const roof = (w, h, d, mat, x, y, z, ry = 0) => {
  const g = new THREE.CylinderGeometry(h, h, d, 3, 1);
  g.rotateY(Math.PI / 6);
  g.rotateX(Math.PI / 2);
  g.scale(w / (h * 1.732), 1, 1);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  if (ry) m.rotation.y = ry;
  return m;
};

/** Collects transforms and emits one InstancedMesh per shape. */
class Batch {
  constructor(geo, mat) {
    this.geo = geo;
    this.mat = mat;
    this.items = [];
  }

  add(x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) {
    this.items.push({ x, y, z, sx, sy, sz, ry });
  }

  build(parent) {
    if (!this.items.length) return;
    const mesh = new THREE.InstancedMesh(this.geo, this.mat, this.items.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    this.items.forEach((it, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.ry);
      p.set(it.x, it.y, it.z);
      s.set(it.sx, it.sy, it.sz);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    });
    mesh.instanceMatrix.needsUpdate = true;
    parent.add(mesh);
  }
}

/**
 * Build the port and tell the fire system where it is burning.
 * Returns the group; the caller adds it to the scene.
 */
export function buildHarbour(fires, seed = 20260820) {
  const rng = makeRng(seed);
  const g = new THREE.Group();
  const QUAY_Z = 430;
  const QUAY_TOP = 9;

  const crates = new Batch(new THREE.BoxGeometry(1, 1, 1), MAT.timber);
  const drums = new Batch(new THREE.CylinderGeometry(1, 1, 1, 10), MAT.rust);
  const bollards = new Batch(new THREE.CylinderGeometry(1, 1.3, 1, 8), MAT.dark);
  const pilings = new Batch(new THREE.CylinderGeometry(1, 1, 1, 6), MAT.timber);
  const windows = new Batch(new THREE.PlaneGeometry(1, 1), MAT.lit);
  const lamps = new Batch(new THREE.BoxGeometry(1, 1, 1), MAT.steel);

  // -- the quay itself ------------------------------------------------------

  g.add(box(2200, 30, 150, MAT.stone, -100, QUAY_TOP - 15, QUAY_Z + 60));
  g.add(box(2200, 3, 6, MAT.dark, -100, QUAY_TOP + 1, QUAY_Z - 12));
  // Fenders and pilings along the face.
  for (let x = -1150; x < 950; x += 26) {
    pilings.add(x + rng() * 4, QUAY_TOP - 9, QUAY_Z - 16, 1.4, 20, 1.4);
  }
  for (let x = -1120; x < 940; x += 62) {
    bollards.add(x, QUAY_TOP + 2, QUAY_Z - 22, 2.2, 4.5, 2.2);
  }
  for (let x = -1080; x < 920; x += 150) {
    // Quayside lamp standards, dark — the power is out.
    lamps.add(x, QUAY_TOP + 9, QUAY_Z - 30, 1.2, 18, 1.2);
    lamps.add(x, QUAY_TOP + 18, QUAY_Z - 33, 1.2, 1.2, 6);
  }

  // -- warehouse row --------------------------------------------------------

  const sheds = [];
  let x = -1020;
  while (x < 900) {
    const w = 90 + rng() * 80;
    const d = 60 + rng() * 30;
    const h = 26 + rng() * 16;
    const z = QUAY_Z + 90 + rng() * 40;
    const burnt = rng() < 0.34;
    g.add(box(w, h, d, burnt ? MAT.charred : MAT.brick, x + w / 2, h / 2, z));
    if (!burnt) {
      g.add(roof(w + 4, 11, d + 3, MAT.roof, x + w / 2, h + 5, z));
      // Lit windows in two rows, a scatter of them dark.
      for (let i = 0; i < Math.floor(w / 14); i++) {
        for (const wy of [h * 0.35, h * 0.68]) {
          if (rng() < 0.42) continue;
          windows.add(x + 8 + i * 14, wy, z - d / 2 - 0.6, 4, 6, 1);
        }
      }
      // Roof ventilators.
      for (let i = 0; i < 3; i++) {
        g.add(box(5, 6, 5, MAT.steel, x + w * (0.2 + i * 0.3), h + 12, z));
      }
    } else {
      // Burnt out: the roof is gone and the gable ends stand as stubs.
      g.add(box(6, h * 0.5, d, MAT.charred, x + 3, h * 1.25, z));
      g.add(box(6, h * 0.35, d, MAT.charred, x + w - 3, h * 1.18, z));
    }
    sheds.push({ x: x + w / 2, z, w, h, burnt });
    x += w + 22 + rng() * 30;
  }

  // -- gantry cranes --------------------------------------------------------

  const craneAt = (cx) => {
    const c = new THREE.Group();
    const H = 78;
    // Four legs, splayed, with cross-bracing.
    for (const lx of [-16, 16]) {
      for (const lz of [-14, 14]) {
        c.add(box(4, H, 4, MAT.steel, lx * 1.15, H / 2, lz));
      }
      c.add(box(3, 2.5, 30, MAT.steel, lx * 1.15, H * 0.42, 0));
      c.add(box(3, 2.5, 30, MAT.steel, lx * 1.15, H * 0.74, 0));
    }
    c.add(box(40, 3, 3, MAT.steel, 0, H * 0.5, -14));
    c.add(box(40, 3, 3, MAT.steel, 0, H * 0.82, 14));
    // Head frame, jib out over the water, counterweight inboard.
    c.add(box(44, 8, 34, MAT.steel, 0, H + 4, 0));
    c.add(box(7, 5, 130, MAT.steel, 0, H + 10, -62));
    c.add(box(10, 5, 26, MAT.steel, 0, H + 10, 30));
    c.add(box(16, 12, 16, MAT.dark, 0, H + 6, 34));
    // Hoist rope and block.
    c.add(box(0.8, 44, 0.8, MAT.dark, 0, H - 12, -96));
    c.add(box(6, 4, 6, MAT.rust, 0, H - 34, -96));
    // Operator's cab under the frame.
    c.add(box(10, 9, 10, MAT.dark, 13, H - 6, -8));
    c.position.set(cx, QUAY_TOP, QUAY_Z + 34);
    return c;
  };
  for (const cx of [-760, -430, -60, 300, 640]) g.add(craneAt(cx));

  // -- oil tank farm, well ablaze ------------------------------------------

  const tankFarm = new THREE.Group();
  const tanks = [
    { x: 70, z: 790, r: 44, h: 34, fire: true },
    { x: 200, z: 812, r: 40, h: 30, fire: false },
    { x: 330, z: 786, r: 46, h: 36, fire: true },
    { x: 460, z: 815, r: 38, h: 28, fire: false },
    { x: 590, z: 792, r: 42, h: 32, fire: true },
  ];
  for (const t of tanks) {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(t.r, t.r, t.h, 22, 1, true),
      t.fire ? MAT.charred : MAT.tank,
    );
    body.position.set(t.x, t.h / 2, t.z);
    tankFarm.add(body);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, 2, 22), MAT.tank);
    cap.position.set(t.x, t.h, t.z);
    if (t.fire) cap.visible = false;
    tankFarm.add(cap);
    // Bund wall around the base, and a stair up the side.
    tankFarm.add(new THREE.Mesh(
      new THREE.CylinderGeometry(t.r + 12, t.r + 12, 5, 20, 1, true), MAT.concrete,
    ).translateX(t.x).translateY(2.5).translateZ(t.z));
    tankFarm.add(box(2, t.h, 2, MAT.steel, t.x + t.r, t.h / 2, t.z));
    if (t.fire) {
      fires.addFire(t.x, t.h * 0.9, t.z, {
        width: t.r * 2.1, height: t.r * 3.4, layers: 3, intensity: 1.15,
        smokeWidth: t.r * 5.5, smokeHeight: 620, lean: 0.34,
        light: t.x < 300, lightRange: 900, embers: 90,
      });
    }
  }
  // Pipework between the tanks.
  for (let i = 0; i < tanks.length - 1; i++) {
    const a = tanks[i];
    const b = tanks[i + 1];
    tankFarm.add(box(Math.abs(b.x - a.x), 2.2, 2.2, MAT.rust, (a.x + b.x) / 2, 7, (a.z + b.z) / 2));
  }
  g.add(tankFarm);

  // -- the town behind ------------------------------------------------------

  for (let i = 0; i < 46; i++) {
    const bx = -1250 + rng() * 2300;
    const bz = 940 + rng() * 520;
    const bw = 40 + rng() * 70;
    const bh = 24 + rng() * 60;
    const bd = 40 + rng() * 60;
    g.add(box(bw, bh, bd, rng() < 0.4 ? MAT.concrete : MAT.brick, bx, bh / 2, bz));
    if (rng() < 0.5) g.add(roof(bw + 3, 9, bd + 3, MAT.roof, bx, bh + 4, bz));
    for (let k = 0; k < 5; k++) {
      if (rng() < 0.55) continue;
      windows.add(bx - bw / 2 + 6 + rng() * (bw - 12), 8 + rng() * (bh - 14), bz - bd / 2 - 0.6, 3.5, 5, 1);
    }
  }
  // Two mill chimneys, one of them alight at the head.
  for (const [cx, cz, ch, alight] of [[-880, 1010, 130, false], [420, 1060, 150, true]]) {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(7, 12, ch, 14), MAT.brick);
    stack.position.set(cx, ch / 2, cz);
    g.add(stack);
    if (alight) {
      fires.addFire(cx, ch, cz, {
        width: 20, height: 40, layers: 2, intensity: 0.8,
        smokeWidth: 110, smokeHeight: 460, lean: 0.4, light: false, embers: 20,
      });
    }
  }

  // -- cargo on the quay ----------------------------------------------------

  for (let i = 0; i < 190; i++) {
    const cx = -1120 + rng() * 2000;
    const cz = QUAY_Z + 4 + rng() * 46;
    const s = 5 + rng() * 6;
    const stack = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < stack; k++) {
      crates.add(cx, QUAY_TOP + s / 2 + k * s, cz, s, s, s * (0.8 + rng() * 0.5), rng() * 0.6);
    }
  }
  for (let i = 0; i < 130; i++) {
    drums.add(-1100 + rng() * 1950, QUAY_TOP + 3, QUAY_Z + 6 + rng() * 44, 2.4, 6, 2.4);
  }
  // Rail wagons on the quayside track.
  for (let i = 0; i < 7; i++) {
    const wx = -700 + i * 110 + rng() * 20;
    g.add(box(84, 16, 20, i % 3 === 0 ? MAT.rust : MAT.dark, wx, QUAY_TOP + 10, QUAY_Z + 74));
  }

  // -- the mole and its light ----------------------------------------------

  const mole = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const mx = -1180 - i * 34;
    const mz = QUAY_Z - 30 - i * 26;
    mole.add(box(56, 20 + rng() * 8, 46, MAT.stone, mx, 2, mz, rng() * 0.4));
  }
  const light = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(7, 12, 62, 16), MAT.concrete);
  tower.position.y = 31;
  light.add(tower);
  light.add(new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 10, 16), MAT.dark).translateY(66));
  light.position.set(-2060, 8, -230);
  mole.add(light);
  g.add(mole);

  // -- ships in the port ----------------------------------------------------

  // A tanker alongside, burning from stem to stern: the brightest thing here.
  const tanker = new THREE.Group();
  tanker.add(box(300, 26, 44, MAT.charred, 0, 4, 0));
  tanker.add(box(60, 26, 40, MAT.dark, 108, 26, 0));
  tanker.add(box(12, 26, 12, MAT.rust, 118, 46, 0));
  for (let i = -5; i <= 3; i++) tanker.add(box(10, 8, 30, MAT.rust, i * 26, 20, 0));
  tanker.position.set(-150, 0, QUAY_Z - 58);
  tanker.rotation.y = 0.02;
  g.add(tanker);
  for (let i = -4; i <= 3; i++) {
    const v = rng();
    // Only every other seat carries its own column and its own light: eight of
    // each would be eight full-height transparent quads over the same pixels,
    // and the pall over the ship is the same either way.
    const heavy = i % 2 === 0;
    fires.addFire(-150 + i * 34 + (rng() - 0.5) * 14, 14 + v * 10, QUAY_Z - 58, {
      width: 24 + v * 20, height: 38 + v * 46, layers: heavy ? 3 : 2,
      intensity: 1.0 + v * 0.4,
      smokeWidth: 130 + v * 90, smokeHeight: heavy ? 520 + v * 240 : 0,
      lean: 0.22 + v * 0.2,
      light: i % 4 === 0, lightRange: 900, embers: 70,
    });
  }

  // A freighter that has gone down at her berth, listing hard with her
  // superstructure still above water and alight.
  const wreck = buildShip('cleveland');
  wreck.group.position.set(180, -7, QUAY_Z - 62);
  wreck.group.rotation.set(0, 0.03, 0.42);
  g.add(wreck.group);
  fires.addFire(196, 12, QUAY_Z - 62, {
    width: 40, height: 70, layers: 3, intensity: 1.1,
    smokeWidth: 150, smokeHeight: 520, lean: 0.26, lightRange: 700, embers: 60,
  });

  // A destroyer still fast alongside, dark and intact.
  const moored = buildShip('fletcher');
  moored.group.position.set(470, -1, QUAY_Z - 52);
  moored.group.rotation.y = 0.015;
  g.add(moored.group);

  // A warehouse well alight at the head of the quay.
  const blaze = sheds.find((s) => s.burnt && s.x > 40) || sheds[0];
  fires.addFire(blaze.x, blaze.h * 0.7, blaze.z, {
    width: blaze.w * 0.7, height: blaze.h * 2.3, layers: 4, intensity: 1.2,
    smokeWidth: 300, smokeHeight: 720, lean: 0.32, lightRange: 900, embers: 110,
  });
  // And a second seat further down the row.
  const far = sheds.find((s) => s.burnt && s.x < -180 && s.x > -520);
  if (far) {
    fires.addFire(far.x, far.h * 0.6, far.z, {
      width: far.w * 0.65, height: far.h * 2.1, layers: 4, intensity: 1.05,
      smokeWidth: 260, smokeHeight: 640, lean: 0.3, lightRange: 700, embers: 80,
    });
  }
  // Burning oil spread on the water off the tanker.
  for (let i = 0; i < 5; i++) {
    fires.addFire(-250 + i * 60, 1, QUAY_Z - 132 + (rng() - 0.5) * 44, {
      width: 46, height: 20, layers: 2, intensity: 0.85,
      smokeWidth: 140, smokeHeight: i % 2 ? 340 : 0, lean: 0.5,
      light: false, embers: 25,
    });
  }

  // -- headland behind the town --------------------------------------------

  for (let i = 0; i < 5; i++) {
    const hx = -1600 + i * 800;
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(420 + rng() * 260, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      MAT.dark,
    );
    hill.scale.set(1, 0.30 + rng() * 0.18, 0.7);
    hill.position.set(hx, -20, 1750 + rng() * 300);
    g.add(hill);
  }

  crates.build(g);
  drums.build(g);
  bollards.build(g);
  pilings.build(g);
  lamps.build(g);
  windows.build(g);
  return g;
}
