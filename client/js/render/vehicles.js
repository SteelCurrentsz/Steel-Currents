// The M4A2 Sherman and the Landing Craft Mechanized, drawn from the owner's
// models of them (see build/prepare-vehicles.mjs):
//
//   "M4A2 Sherman" (https://skfb.ly/oAXAL) by barking_dogo, and
//   "US Marine Landing Craft Utility" (https://skfb.ly/owIX6) by LM3D,
//
// both under Creative Commons Attribution 4.0 and credited on the Credits
// screen. Each is carried as a few vertex-coloured meshes; the Sherman's
// turret is one of them, cut free so it trains about its own ring.
//
// Local frame, as everywhere else: +Z forward, +Y up.

import * as THREE from '../../../vendor/three.module.js';
import {
  SHERMAN_HULL, SHERMAN_TURRET, SHERMAN_RING, SHERMAN_MUZZLE, LCM_HULL, LCM_RAMP, LCM_HINGE,
} from './vehicles.data.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';

/** One packed part (see `pack` in the build script) as a geometry. */
export function decode(b64) {
  const bin = typeof atob === 'function'
    ? Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    : new Uint8Array(Buffer.from(b64, 'base64'));
  const buf = bin.buffer;
  const head = new Float32Array(buf, 0, 8);
  const n = head[0];
  const ni = head[1];
  const lo = head.subarray(2, 5);
  const hi = head.subarray(5, 8);
  let o = 32;
  const q = new Uint16Array(buf.slice(o, o + n * 6));
  o += n * 6;
  const col = new Uint8Array(buf.slice(o, o + n * 3));
  o += n * 3;
  o += (4 - (o % 4)) % 4;
  const idx = n > 65535
    ? new Uint32Array(buf.slice(o, o + ni * 4))
    : new Uint16Array(buf.slice(o, o + ni * 2));
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) {
    const c = i % 3;
    pos[i] = lo[c] + (q[i] / 65535) * (hi[c] - lo[c]);
  }
  const colour = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) colour[i] = (col[i] / 255) ** 2.2;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

const cache = new Map();
function geo(key, b64) {
  if (!cache.has(key)) cache.set(key, decode(b64));
  return cache.get(key);
}

let mats = null;
function materials() {
  if (mats) return mats;
  mats = {
    tank: new THREE.MeshPhongMaterial({
      vertexColors: true, specular: 0x14160f, shininess: 8, side: THREE.DoubleSide,
      // A little of its own paint in the shade, so a tank against the light
      // is olive drab and not a black cut-out.
      emissive: 0x161a10,
    }),
    // The model is one flat light grey; she is painted the Navy's haze grey.
    craft: new THREE.MeshPhongMaterial({
      vertexColors: true, color: 0x9aa3aa, specular: 0x1c2024, shininess: 12, side: THREE.DoubleSide,
    }),
  };
  for (const m of Object.values(mats)) m.userData.painted = true;
  return mats;
}

/** The Sherman's ring, where its turret trains, in its own frame. */
export const SHERMAN_TURRET_RING = SHERMAN_RING;

/**
 * The Sherman, for the gun park and the battlefield, in the shape a battery
 * builder fills (see BUILDERS in battery.js): the hull on `g`, the turret
 * in a group of its own on the training list, and its gun on the list of
 * guns that fire.
 */
export function buildSherman(g) {
  const m = materials();
  const hull = new THREE.Mesh(geo('sherman-hull', SHERMAN_HULL), m.tank);
  hull.castShadow = true;
  g.add(hull);
  const turret = new THREE.Group();
  turret.position.set(...SHERMAN_RING);
  turret.userData.dynamic = true;
  turret.userData.tankTurret = true;
  const t = new THREE.Mesh(geo('sherman-turret', SHERMAN_TURRET), m.tank);
  t.castShadow = true;
  turret.add(t);
  // The gun's own node, at the height of its trunnions, for the flash and the
  // run-back; the model's barrel is part of the turret casting.
  const gun = new THREE.Group();
  gun.userData.dynamic = true;
  gun.position.set(0, 0.95, 0.4);
  turret.add(gun);
  g.add(turret);
  (g.userData.turn || (g.userData.turn = [])).push(turret);
  g.userData.guns.push({ node: gun, muzzleZ: SHERMAN_MUZZLE - 0.4, bore: 0.075, stroke: 0.12 });
  g.userData.tank = true;
}

/** How far the ramp turns about its hinge to lie on the sand, and how long it takes. */
const RAMP_DOWN = 0.86;
const RAMP_FALL = 2.2;

/** The Landing Craft Mechanized, as a ship builder returns her. */
export function buildLcm() {
  const cls = SHIP_CLASSES.lcm;
  const g = new THREE.Group();
  const m = materials();
  const mesh = new THREE.Mesh(geo('lcm', LCM_HULL), m.craft);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  // Her ramp, hinged across the foot of her bow: drawn up, as the model has
  // it, and let go forward onto the beach when she takes the ground (see
  // rampStep in the simulation). It does not come up again.
  const hinge = new THREE.Group();
  hinge.position.set(...LCM_HINGE);
  hinge.userData.dynamic = true;
  const ramp = new THREE.Mesh(geo('lcm-ramp', LCM_RAMP), m.craft);
  ramp.castShadow = true;
  hinge.add(ramp);
  g.add(hinge);
  g.userData.classId = 'lcm';
  let f = 0;
  g.userData.ramp = (down, dt) => {
    const want = down ? 1 : 0;
    // Falling, it gathers pace under its own weight.
    if (f !== want) {
      f = want > f ? Math.min(1, f + (dt / RAMP_FALL) * (0.3 + 1.7 * f)) : Math.max(0, f - dt / RAMP_FALL);
      hinge.rotation.x = RAMP_DOWN * f;
    }
    return f;
  };
  g.userData.rampNode = hinge;
  return {
    group: g, turrets: [], length: cls.hull.length, beam: cls.hull.beam,
    deckY: cls.cargo.vehicles.deck,
    secMounts: [], aaMounts: [], torpMounts: [],
  };
}
