// A harbour under attack, built out of primitives.
//
// Everything is placed from one seeded generator, so the same port is drawn
// every time rather than a different one each load — a title screen that
// reshuffles itself reads as noise. Repeated clutter (crates, drums, bollards,
// pilings, lit windows) goes through InstancedMesh, which keeps a yard this
// dense down to a few dozen draw calls.

import * as THREE from '../../../vendor/three.module.js';
import { buildShip } from './ships.js';
import { buildIowa } from './iowa.js';

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
  ground: new THREE.MeshLambertMaterial({ color: 0x2b2621 }),
  tarmac: new THREE.MeshLambertMaterial({ color: 0x1f2126 }),
  lit: new THREE.MeshBasicMaterial({ color: 0xffb460 }),
};

const box = (w, h, d, mat, x, y, z, ry = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (ry) m.rotation.y = ry;
  return m;
};

/**
 * A ridge roof as a unit prism, for the instanced batches.
 *
 * It runs from y = -1 to y = 0.5 and is one unit across and one long, so that
 * scaling an instance by (width, h, depth) puts the eaves at the parent box's
 * top and the ridge half of h above it — the same shape a per-mesh helper made,
 * without a geometry per building.
 */
function roofGeo() {
  const A = [-0.5, -1], B = [0.5, -1], C = [0, 0.5];
  const F = -0.5, K = 0.5;                      // the two gable ends
  const p = [];
  const tri = (a, b, c) => p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  const at = (v, z) => [v[0], v[1], z];
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };

  tri(at(A, K), at(B, K), at(C, K));
  tri(at(B, F), at(A, F), at(C, F));
  quad(at(A, F), at(A, K), at(C, K), at(C, F));
  quad(at(C, F), at(C, K), at(B, K), at(B, F));
  quad(at(B, F), at(B, K), at(A, K), at(A, F));

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.computeVertexNormals();
  return geo;
}

// The land the port stands on. The height field is module-level and fixed, so
// anything that has to sit on the island — a house, a bomb crater — can ask it
// where the ground is without the answer depending on draw order.
const ISLAND = (() => {
  let s = 20260821 >>> 0;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const bumps = [];
  for (let i = 0; i < 34; i++) {
    bumps.push({
      x: -2500 + r() * 5000,
      z: 1000 + r() * 1400,
      r: 260 + r() * 460,
      h: 26 + r() * 160,
    });
  }
  return { bumps };
})();

/** Ground level at a point ashore; below zero is sea. */
export function islandHeight(x, z) {
  // Seaward of the quay the beach shelves away; behind it the yard is flat for
  // as far back as the sheds and the tank farm stand, and only then does it
  // start to climb into the town and the ridge behind.
  let h;
  if (z < 415) h = ((z - 300) / 115) * 24 - 24;
  else if (z < 900) h = 0;
  else h = Math.pow(Math.min(1, (z - 900) / 1400), 1.5) * 104;
  if (z > 2300) h -= Math.pow((z - 2300) / 560, 2) * 220;

  for (const b of ISLAND.bumps) {
    const d = Math.hypot(x - b.x, (z - b.z) * 1.25) / b.r;
    if (d < 1) h += b.h * Math.pow(Math.cos((d * Math.PI) / 2), 2);
  }

  // And the ends: the ground runs out into the sea on either hand. The island
  // is wide enough now to cross the whole frame, so those ends are off-screen —
  // but the field still has to close, or the mesh would end in a cliff.
  const taper = 1 - Math.pow(Math.min(1, Math.max(0, (Math.abs(x) - 2620) / 700)), 1.7);
  return h * taper - (1 - taper) * 30;
}

/** The island as drawn: a height field meshed edge to edge, with the shoreline
 *  falling out of it wherever the ground crosses sea level. */
function buildIsland() {
  const X0 = -3600, X1 = 3600, Z0 = 300, Z1 = 2900;
  const NX = 96, NZ = 38;
  const pos = [], idx = [];
  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      const x = X0 + ((X1 - X0) * i) / NX;
      const z = Z0 + ((Z1 - Z0) * j) / NZ;
      pos.push(x, islandHeight(x, z), z);
    }
  }
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i;
      idx.push(a, a + NX + 1, a + 1, a + 1, a + NX + 1, a + NX + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, MAT.ground);
  mesh.renderOrder = -1;
  return mesh;
}

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
/**
 * The port and the island it stands on.
 *
 * Repeated structure — every crane member, every shed, every house — goes
 * through an InstancedMesh batch. The island runs the whole width of the frame
 * now, which is three times the yard it was, and drawing that a mesh at a time
 * would cost a thousand draw calls for what fits in a dozen.
 *
 * @returns {{group: THREE.Group, battleship: THREE.Group, update: (t:number)=>void}}
 */
export function buildHarbour(fires, seed = 20260820) {
  const rng = makeRng(seed);
  const g = new THREE.Group();
  const QUAY_Z = 430;
  const QUAY_TOP = 9;
  // How far the yard runs either side of the centre line.
  const X0 = -2560, X1 = 2560;

  const UNIT = new THREE.BoxGeometry(1, 1, 1);
  const crates = new Batch(UNIT, MAT.timber);
  const drums = new Batch(new THREE.CylinderGeometry(1, 1, 1, 10), MAT.rust);
  const bollards = new Batch(new THREE.CylinderGeometry(1, 1.3, 1, 8), MAT.dark);
  const pilings = new Batch(new THREE.CylinderGeometry(1, 1, 1, 6), MAT.timber);
  const windows = new Batch(new THREE.PlaneGeometry(1, 1), MAT.lit);
  const steel = new Batch(UNIT, MAT.steel);
  const dark = new Batch(UNIT, MAT.dark);
  const brick = new Batch(UNIT, MAT.brick);
  const concrete = new Batch(UNIT, MAT.concrete);
  const charred = new Batch(UNIT, MAT.charred);
  const rust = new Batch(UNIT, MAT.rust);
  const roofs = new Batch(roofGeo(), MAT.roof);
  const tarmac = new Batch(UNIT, MAT.tarmac);

  // -- the quay itself ------------------------------------------------------

  g.add(box(X1 - X0, 30, 150, MAT.stone, (X0 + X1) / 2, QUAY_TOP - 15, QUAY_Z + 60));
  dark.add((X0 + X1) / 2, QUAY_TOP + 1, QUAY_Z - 12, X1 - X0, 3, 6);
  for (let x = X0 + 30; x < X1 - 30; x += 26) {
    pilings.add(x + rng() * 4, QUAY_TOP - 9, QUAY_Z - 16, 1.4, 20, 1.4);
  }
  for (let x = X0 + 40; x < X1 - 40; x += 62) {
    bollards.add(x, QUAY_TOP + 2, QUAY_Z - 22, 2.2, 4.5, 2.2);
  }
  for (let x = X0 + 80; x < X1 - 80; x += 150) {
    // Quayside lamp standards, dark — the power is out.
    steel.add(x, QUAY_TOP + 9, QUAY_Z - 30, 1.2, 18, 1.2);
    steel.add(x, QUAY_TOP + 18, QUAY_Z - 33, 1.2, 1.2, 6);
  }

  // -- warehouse row --------------------------------------------------------

  const sheds = [];
  let x = X0 + 60;
  while (x < X1 - 120) {
    const w = 90 + rng() * 80;
    const d = 60 + rng() * 30;
    const h = 26 + rng() * 16;
    const z = QUAY_Z + 90 + rng() * 40;
    const burnt = rng() < 0.32;
    const cx = x + w / 2;
    (burnt ? charred : brick).add(cx, h / 2, z, w, h, d);
    if (!burnt) {
      roofs.add(cx, h + 5, z, w + 4, 11, d + 3);
      for (let i = 0; i < Math.floor(w / 14); i++) {
        for (const wy of [h * 0.35, h * 0.68]) {
          if (rng() < 0.42) continue;
          windows.add(x + 8 + i * 14, wy, z - d / 2 - 0.6, 4, 6, 1);
        }
      }
      for (let i = 0; i < 3; i++) steel.add(cx - w * 0.3 + i * w * 0.3, h + 12, z, 5, 6, 5);
    } else {
      // Burnt out: the roof is gone and the gable ends stand as stubs.
      charred.add(x + 3, h * 1.25, z, 6, h * 0.5, d);
      charred.add(x + w - 3, h * 1.18, z, 6, h * 0.35, d);
    }
    sheds.push({ x: cx, w, h, z, burnt });
    x += w + 30 + rng() * 60;
  }

  // -- gantry cranes --------------------------------------------------------

  const craneAt = (cx) => {
    const H = 78;
    const at = (b, dx, dy, dz, sx, sy, sz) =>
      b.add(cx + dx, QUAY_TOP + dy, QUAY_Z + 34 + dz, sx, sy, sz);
    for (const lx of [-16, 16]) {
      for (const lz of [-14, 14]) at(steel, lx * 1.15, H / 2, lz, 4, H, 4);
      at(steel, lx * 1.15, H * 0.42, 0, 3, 2.5, 30);
      at(steel, lx * 1.15, H * 0.74, 0, 3, 2.5, 30);
    }
    at(steel, 0, H * 0.5, -14, 40, 3, 3);
    at(steel, 0, H * 0.82, 14, 40, 3, 3);
    at(steel, 0, H + 4, 0, 44, 8, 34);
    at(steel, 0, H + 10, -62, 7, 5, 130);
    at(steel, 0, H + 10, 30, 10, 5, 26);
    at(dark, 0, H + 6, 34, 16, 12, 16);
    at(dark, 0, H - 12, -96, 0.8, 44, 0.8);
    at(rust, 0, H - 34, -96, 6, 4, 6);
    at(dark, 13, H - 6, -8, 10, 9, 10);
  };
  for (let cx = X0 + 260; cx < X1 - 260; cx += 330) craneAt(cx);

  // -- the battleship dock --------------------------------------------------

  // A fitting-out berth: an apron pushed out into the basin with a battleship
  // lying along its outer face, two hammerheads over her, and the shops she was
  // being worked on from behind.
  const DOCK_X = -640;
  const DOCK_Z = QUAY_Z - 92;
  concrete.add(DOCK_X, QUAY_TOP - 8, DOCK_Z + 46, 620, 34, 96);
  dark.add(DOCK_X, QUAY_TOP + 1, DOCK_Z + 2, 620, 3, 8);
  for (let px = DOCK_X - 300; px <= DOCK_X + 300; px += 22) {
    pilings.add(px, QUAY_TOP - 10, DOCK_Z - 2, 1.6, 22, 1.6);
  }
  for (let bx = DOCK_X - 280; bx <= DOCK_X + 280; bx += 56) {
    bollards.add(bx, QUAY_TOP + 2, DOCK_Z + 10, 2.6, 5, 2.6);
  }
  // Two hammerhead cranes standing over the berth.
  for (const hx of [DOCK_X - 190, DOCK_X + 170]) {
    for (const lx of [-13, 13]) {
      for (const lz of [-13, 13]) steel.add(hx + lx, QUAY_TOP + 46, DOCK_Z + 54 + lz, 5, 92, 5);
    }
    steel.add(hx, QUAY_TOP + 94, DOCK_Z + 54, 34, 10, 34);
    steel.add(hx, QUAY_TOP + 100, DOCK_Z + 8, 9, 7, 130);
    dark.add(hx, QUAY_TOP + 100, DOCK_Z + 96, 20, 14, 26);
    dark.add(hx, QUAY_TOP + 76, DOCK_Z - 44, 1.0, 48, 1.0);
  }
  // The fitting-out shops behind the berth.
  for (let i = 0; i < 4; i++) {
    const sx = DOCK_X - 260 + i * 175;
    brick.add(sx, 24, QUAY_Z + 120, 150, 48, 90);
    roofs.add(sx, 53, QUAY_Z + 120, 154, 14, 93);
    for (let k = 0; k < 9; k++) {
      windows.add(sx - 62 + k * 15, 14 + (k % 2) * 16, QUAY_Z + 74, 5, 7, 1);
    }
  }

  // The ship herself, moored along the outer face of the apron.
  const bb = buildIowa();
  bb.group.position.set(DOCK_X + 40, 0, DOCK_Z - 26);
  bb.group.rotation.y = Math.PI / 2 + 0.02;
  // Guns trained fore and aft as she would lie alongside, not at the town.
  bb.turrets.forEach((t, i) => { t.rotation.y += i === 2 ? -0.16 : 0.12; });
  g.add(bb.group);

  // -- oil tank farm, well ablaze ------------------------------------------

  const tanks = [
    { x: 70, z: 790, r: 44, h: 34, fire: true },
    { x: 200, z: 812, r: 40, h: 30, fire: false },
    { x: 330, z: 786, r: 46, h: 36, fire: true },
    { x: 460, z: 815, r: 38, h: 28, fire: false },
    { x: 590, z: 792, r: 42, h: 32, fire: true },
    { x: 1180, z: 800, r: 40, h: 30, fire: false },
    { x: 1310, z: 780, r: 44, h: 34, fire: true },
    { x: 1440, z: 806, r: 38, h: 28, fire: false },
  ];
  for (const t of tanks) {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(t.r, t.r, t.h, 20, 1, true),
      t.fire ? MAT.charred : MAT.tank,
    );
    body.position.set(t.x, t.h / 2, t.z);
    g.add(body);
    if (!t.fire) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, 2, 20), MAT.tank);
      cap.position.set(t.x, t.h, t.z);
      g.add(cap);
    }
    g.add(new THREE.Mesh(
      new THREE.CylinderGeometry(t.r + 12, t.r + 12, 5, 18, 1, true), MAT.concrete,
    ).translateX(t.x).translateY(2.5).translateZ(t.z));
    steel.add(t.x + t.r, t.h / 2, t.z, 2, t.h, 2);
    if (t.fire) {
      fires.addFire(t.x, t.h * 0.9, t.z, {
        width: t.r * 3.2, height: t.r * 6.2, layers: 3, intensity: 1.3,
        smokeWidth: t.r * 7.0, smokeHeight: 900, lean: 0.34,
        light: t.x < 300, lightRange: 1500, embers: 130,
      });
    }
  }
  for (let i = 0; i < tanks.length - 1; i++) {
    const a = tanks[i], b = tanks[i + 1];
    if (Math.abs(b.x - a.x) > 400) continue;
    rust.add((a.x + b.x) / 2, 7, (a.z + b.z) / 2, Math.abs(b.x - a.x), 2.2, 2.2);
  }

  // -- the rail yard --------------------------------------------------------

  // Four roads of track behind the sheds, with wagons standing on them and an
  // engine shed at the throat.
  for (let i = 0; i < 4; i++) {
    const tz = QUAY_Z + 196 + i * 26;
    dark.add(0, 1.2, tz, X1 - X0 - 400, 1.2, 4.4);
  }
  for (let i = 0; i < 46; i++) {
    const wx = X0 + 340 + rng() * (X1 - X0 - 700);
    const road = Math.floor(rng() * 4);
    (rng() < 0.3 ? rust : dark).add(wx, QUAY_TOP + 8, QUAY_Z + 196 + road * 26, 22, 14, 9);
  }
  brick.add(-260, 30, QUAY_Z + 300, 240, 60, 110);
  roofs.add(-260, 66, QUAY_Z + 300, 244, 18, 113);
  for (let i = 0; i < 3; i++) dark.add(-330 + i * 70, 74, QUAY_Z + 300, 14, 20, 14);

  // -- roads through the yard ----------------------------------------------

  tarmac.add(0, 0.6, QUAY_Z + 168, X1 - X0 - 260, 0.8, 22);
  tarmac.add(0, 0.6, QUAY_Z + 400, X1 - X0 - 700, 0.8, 18);
  for (let i = 0; i < 9; i++) {
    const rx = X0 + 400 + i * 520;
    tarmac.add(rx, 0.6, QUAY_Z + 290, 16, 0.8, 250);
  }

  // -- the town behind ------------------------------------------------------

  for (let i = 0; i < 150; i++) {
    const bx = -2300 + rng() * 4600;
    const bz = 940 + rng() * 700;
    const bw = 40 + rng() * 70;
    const bh = 24 + rng() * 60;
    const bd = 40 + rng() * 60;
    // Set into the slope rather than perched on it, so no house stands on stilts
    // where the ground falls away under one corner.
    const gy = islandHeight(bx, bz) - 6;
    if (gy < -4) continue;
    (rng() < 0.4 ? concrete : brick).add(bx, gy + bh / 2, bz, bw, bh, bd);
    if (rng() < 0.5) roofs.add(bx, gy + bh + 4, bz, bw + 3, 9, bd + 3);
    for (let k = 0; k < 5; k++) {
      if (rng() < 0.55) continue;
      windows.add(bx - bw / 2 + 6 + rng() * (bw - 12), gy + 8 + rng() * (bh - 14),
        bz - bd / 2 - 0.6, 3.5, 5, 1);
    }
  }

  // A church, which is the one thing in a town like this with a spire on it.
  {
    const cx = -520, cz = 1180;
    const gy = islandHeight(cx, cz) - 4;
    brick.add(cx, gy + 22, cz, 46, 44, 96);
    roofs.add(cx, gy + 50, cz, 50, 16, 99);
    brick.add(cx, gy + 40, cz + 54, 22, 80, 22);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(15, 46, 4), MAT.roof);
    spire.position.set(cx, gy + 103, cz + 54);
    spire.rotation.y = Math.PI / 4;
    g.add(spire);
  }

  // Water towers and radio masts on the ridge.
  for (const [tx, tz] of [[-1500, 1320], [900, 1260]]) {
    const gy = islandHeight(tx, tz);
    for (const dx of [-9, 9]) for (const dz of [-9, 9]) steel.add(tx + dx, gy + 22, tz + dz, 3, 44, 3);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 22, 14), MAT.rust);
    tank.position.set(tx, gy + 55, tz);
    g.add(tank);
  }
  for (const [mx, mz, mh] of [[-1980, 1500, 190], [1620, 1560, 170]]) {
    const gy = islandHeight(mx, mz);
    steel.add(mx, gy + mh / 2, mz, 4, mh, 4);
    for (let k = 1; k <= 3; k++) steel.add(mx, gy + (mh * k) / 4, mz, 22, 1.6, 1.6);
  }

  // Two mill chimneys, one of them alight at the head.
  for (const [cx, cz, ch, alight] of [[-760, 1010, 130, false], [420, 1060, 150, true]]) {
    const gy = islandHeight(cx, cz) - 4;
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(7, 12, ch, 14), MAT.brick);
    stack.position.set(cx, gy + ch / 2, cz);
    g.add(stack);
    if (alight) {
      fires.addFire(cx, gy + ch, cz, {
        width: 30, height: 76, layers: 2, intensity: 0.95,
        smokeWidth: 150, smokeHeight: 700, lean: 0.4, light: false, embers: 30,
      });
    }
  }

  // -- coastal batteries and searchlights ----------------------------------

  const beams = [];
  for (const [bx, bz] of [[-2180, 700], [-900, 940], [980, 900], [2140, 720]]) {
    const gy = Math.max(0, islandHeight(bx, bz));
    // An emplacement: a concrete ring with a gun in it.
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(20, 22, 8, 16, 1, true), MAT.concrete);
    ring.position.set(bx, gy + 4, bz);
    g.add(ring);
    dark.add(bx, gy + 8, bz, 9, 6, 12);
    const brl = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 26, 8), MAT.steel);
    brl.rotation.set(-1.05, 0, 0);
    brl.position.set(bx, gy + 14, bz - 8);
    g.add(brl);

    // The searchlight beside it, and the beam it is sweeping.
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 4, 14), MAT.lit);
    lamp.rotation.z = Math.PI / 2;
    lamp.position.set(bx + 34, gy + 10, bz);
    g.add(lamp);

    // A searchlight beam is narrow at the lamp and spreads as it climbs, so the
    // cone is built with its apex on the lamp rather than on the cloud base,
    // and it thins out with height instead of ending in a hard rim.
    const beamGeo = new THREE.ConeGeometry(58, 2400, 16, 1, true);
    beamGeo.rotateX(Math.PI);
    beamGeo.translate(0, 1200, 0);
    const beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec2 vUv;
        void main(){
          float a = pow(1.0 - vUv.y, 1.7) * 0.085 + 0.006;
          gl_FragColor = vec4(0.80, 0.86, 0.95, a);
        }`,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    const pivot = new THREE.Group();
    pivot.position.set(bx + 34, gy + 10, bz);
    pivot.add(beam);
    g.add(pivot);
    beams.push({ pivot, phase: rng() * 6.28, rate: 0.09 + rng() * 0.06, lean: 0.5 + rng() * 0.3 });
  }

  // -- cargo on the quay ----------------------------------------------------

  for (let i = 0; i < 420; i++) {
    const cx = X0 + 80 + rng() * (X1 - X0 - 160);
    const cz = QUAY_Z + 4 + rng() * 46;
    const s = 5 + rng() * 6;
    const stack = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < stack; k++) {
      crates.add(cx, QUAY_TOP + s / 2 + k * s, cz, s, s, s * (0.8 + rng() * 0.5), rng() * 0.6);
    }
  }
  for (let i = 0; i < 300; i++) {
    drums.add(X0 + 100 + rng() * (X1 - X0 - 200), QUAY_TOP + 3, QUAY_Z + 6 + rng() * 44, 2.4, 6, 2.4);
  }

  // -- the mole and its light ----------------------------------------------

  const mole = new THREE.Group();
  for (let i = 0; i < 30; i++) {
    const mx = X1 + 40 + i * 30;
    const mz = QUAY_Z - 20 - i * 24;
    mole.add(box(56, 20 + rng() * 8, 46, MAT.stone, mx, 2, mz, rng() * 0.4));
  }
  const light = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(7, 12, 62, 16), MAT.concrete);
  tower.position.y = 31;
  light.add(tower);
  light.add(new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 10, 16), MAT.dark).translateY(66));
  light.position.set(X1 + 940, 8, QUAY_Z - 740);
  mole.add(light);
  g.add(mole);

  // -- ships in the port ----------------------------------------------------

  // A tanker alongside, burning from stem to stern.
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
      width: 34 + v * 30, height: 66 + v * 80, layers: heavy ? 3 : 2,
      intensity: 1.15 + v * 0.4,
      smokeWidth: 150 + v * 110, smokeHeight: heavy ? 700 + v * 320 : 0,
      lean: 0.22 + v * 0.2,
      light: i % 4 === 0, lightRange: 1400, embers: 90,
    });
  }

  // A freighter that has gone down at her berth, listing hard.
  const wreck = buildShip('cleveland');
  wreck.group.position.set(180, -7, QUAY_Z - 62);
  wreck.group.rotation.set(0, 0.03, 0.42);
  g.add(wreck.group);
  fires.addFire(196, 12, QUAY_Z - 62, {
    width: 58, height: 120, layers: 3, intensity: 1.25,
    smokeWidth: 190, smokeHeight: 760, lean: 0.26, lightRange: 1200, embers: 90,
  });

  // Destroyers still fast alongside, dark and intact.
  for (const [dx, dz] of [[470, QUAY_Z - 52], [900, QUAY_Z - 56], [1720, QUAY_Z - 50]]) {
    const moored = buildShip('fletcher');
    moored.group.position.set(dx, -1, dz);
    moored.group.rotation.y = 0.015;
    g.add(moored.group);
  }

  // Warehouses well alight down the row.
  // Seats of fire the length of the row, so the whole island is alight rather
  // than one bright patch amidships with dark ends either side of it.
  const alight = sheds.filter((sd) => sd.burnt);
  alight.forEach((sd, i) => {
    if (i % 2) return;
    fires.addFire(sd.x, sd.h * 0.7, sd.z, {
      width: sd.w * 0.95, height: sd.h * (3.6 + rng() * 1.6), layers: 3,
      intensity: 1.2 + rng() * 0.3,
      smokeWidth: 320 + rng() * 130, smokeHeight: 880 + rng() * 300, lean: 0.3,
      light: i % 4 === 0, lightRange: 1600, embers: 120,
    });
  });
  // And in the town on the slope behind, where the incendiaries went.
  for (let i = 0; i < 9; i++) {
    const fx = -2200 + i * 500 + (rng() - 0.5) * 180;
    const fz = 980 + rng() * 520;
    const fy = islandHeight(fx, fz);
    if (fy < 4) continue;
    fires.addFire(fx, fy + 10, fz, {
      width: 40 + rng() * 40, height: 90 + rng() * 90, layers: 2,
      intensity: 1.0 + rng() * 0.3,
      smokeWidth: 220 + rng() * 120, smokeHeight: 700 + rng() * 260, lean: 0.36,
      light: false, embers: 60,
    });
  }
  // Burning oil spread on the water off the tanker.
  for (let i = 0; i < 5; i++) {
    fires.addFire(-250 + i * 60, 1, QUAY_Z - 132 + (rng() - 0.5) * 44, {
      width: 62, height: 34, layers: 2, intensity: 0.95,
      smokeWidth: 170, smokeHeight: i % 2 ? 440 : 0, lean: 0.5,
      light: false, embers: 25,
    });
  }

  // -- the island itself ----------------------------------------------------

  g.add(buildIsland());

  crates.build(g);
  drums.build(g);
  bollards.build(g);
  pilings.build(g);
  windows.build(g);
  steel.build(g);
  dark.build(g);
  brick.build(g);
  concrete.build(g);
  charred.build(g);
  rust.build(g);
  roofs.build(g);
  tarmac.build(g);

  return {
    group: g,
    battleship: bb.group,
    berth: { x: DOCK_X + 40, y: 0, z: DOCK_Z - 26 },
    /** Sweep the searchlights. */
    update(t) {
      for (const b of beams) {
        b.pivot.rotation.z = Math.sin(t * b.rate + b.phase) * b.lean;
        b.pivot.rotation.x = Math.sin(t * b.rate * 0.6 + b.phase * 2) * 0.16;
      }
    },
  };
}
