// The soldiers ashore, drawn: the men themselves, the dead, the blood.
//
// Every man is drawn from the owner's model of an American soldier of the
// war (see build/prepare-infantry.mjs):
//
//   "American Soldier WW2" (https://skfb.ly/pI7S8) by Diplomattheftgun1945,
//
// with "M1 Garand Asset" (https://skfb.ly/oPwXw) by lennur in his hands, both
// under Creative Commons Attribution 4.0 and credited on the Credits screen.
//
// There can be hundreds of them, so a man is not a scene graph of his own:
// he is ten pieces -- head, body, each upper arm, forearm, thigh and shin --
// and every piece of every man on the field is one instance of one mesh,
// placed each frame by working out his pose. Close to, the pieces are the
// detailed ones; further off, a few dozen faces each. The pose is worked out
// from what the simulation says he is doing: walking, running, sprinting,
// crouched, in the air, with his rifle up at his shoulder or carried across
// him, reloading. His arms reach for the rifle wherever it is (two-bone
// reach, elbows down and out), so whatever his body is doing his hands are on
// his weapon.
//
// The dead stay where they fell, for as long as there is room for them. A man
// hit bleeds from where the round went in; a man killed bleeds into the
// ground under him; a man caught by a shell or under a tank's tracks comes
// apart, and what was inside him goes across the ground with the blood.
//
// Local frame, as everywhere else: +Z forward, +Y up.

import * as THREE from '../../../vendor/three.module.js';
import { decode } from './vehicles.js';
import {
  SOLDIER_NEAR, SOLDIER_FAR, SOLDIER_JOINTS as J, SOLDIER_PIVOTS as PV, GARAND_NEAR, GARAND_FAR,
} from './infantry.data.js';
import { footing as bareFooting } from '../../../shared/infantry.js';
import { worksFloor } from '../../../shared/works.js';

/**
 * What a man, a body or a drop of blood comes to rest on: the ground, and in
 * a town the kerb, the lawn or the paving laid on it, or the heap a building
 * left -- which stand a little above the ground they are laid on, so blood
 * that stopped at the ground was under them and out of sight.
 */
export function footing(world, x, z) {
  const g = bareFooting(world, x, z);
  if (!world?.works) return g;
  const f = worksFloor(world, x, z);
  return g + (f.rise || 0);
}

const PARTS = ['torso', 'head', 'uarmL', 'uarmR', 'farmL', 'farmR', 'thighL', 'thighR', 'shinL', 'shinR', 'rifle'];
const NEAR_CAP = 700;
const FAR_CAP = 1800;
/** Within this many metres a man is drawn in full detail; past FAR_OUT not at all. */
const NEAR_OUT = 75;
const FAR_OUT = 2200;
const MAX_DEAD = 260;

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The rest pose, off the model: where each joint is, and the way each limb
// points standing as he was modelled.
const REST = {};
for (const sd of ['L', 'R']) {
  const S = v3(J[`shoulder${sd}`]), E = v3(J[`elbow${sd}`]), H = v3(J[`hand${sd}`]);
  const Hp = v3(J[`hip${sd}`]), K = v3(J[`knee${sd}`]), A = v3(J[`ankle${sd}`]);
  REST[sd] = {
    S, E, H, Hp, K, A,
    up: E.clone().sub(S).normalize(), fore: H.clone().sub(E).normalize(),
    L1: E.distanceTo(S), L2: H.distanceTo(E),
    thigh: K.clone().sub(Hp), shin: A.clone().sub(K),
  };
}
const WAIST = v3(PV.torso);
const NECK = v3(PV.head);
// Where the butt of his rifle goes when it is up: the pocket of his right shoulder.
const POCKET = new THREE.Vector3(-0.14, REST.R.S.y - 0.05, REST.R.S.z + 0.16);

// Scratch, reused every frame.
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _s1 = new THREE.Vector3(1, 1, 1);
const _zero = new THREE.Vector3(0, 0, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
// The pose's own scratch: a few hundred men a frame, and nothing allocated
// for any of them.
const SIDES = ['L', 'R'];
const LEG_TH = [0, 0];
const LEG_BEND = [0, 0];
const KNEE = [new THREE.Vector3(), new THREE.Vector3()];
const V = Array.from({ length: 14 }, () => new THREE.Vector3());
const TORSO_Q = new THREE.Quaternion();
const HEAD_Q = new THREE.Quaternion();
const RIFLE_Q = new THREE.Quaternion();
const ARM_Q = new THREE.Quaternion();
const WAIST_AT = new THREE.Vector3();

/** A rotation turning +Z to `dir`, keeping +Y as near up as it can. */
function aimQuat(dir, out) {
  _m2.lookAt(_zero, dir, Y);
  // lookAt points -Z at the target; the rifle points +Z.
  out.setFromRotationMatrix(_m2);
  _q2.setFromAxisAngle(Y, Math.PI);
  return out.multiply(_q2);
}

/**
 * Where his elbow goes, reaching from shoulder `S` to put his hand at `H`
 * with an upper arm of `L1` and a forearm of `L2`: bent away from `pole`.
 */
function reach(S, H, L1, L2, pole, out) {
  _a.subVectors(H, S);
  let d = _a.length();
  d = clamp(d, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  _a.normalize();
  const along = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const r = Math.sqrt(Math.max(0, L1 * L1 - along * along));
  _b.copy(pole).addScaledVector(_a, -pole.dot(_a)).normalize();
  out.copy(S).addScaledVector(_a, along).addScaledVector(_b, r);
  // And his hand, as far along as he can actually reach.
  return d;
}

// ---------------------------------------------------------------------------
// Materials and meshes
// ---------------------------------------------------------------------------

function bodyMaterial() {
  // A little of the uniform's own colour in the shade, so a man against the
  // light is olive drab and not a black cut-out.
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x15140f });
  m.userData.painted = true;
  return m;
}

/**
 * A civilian's head: bare, a face and a head of hair, in the frame the
 * soldier's helmeted head is modelled in (its origin at the neck).
 */
function civilHead() {
  const skin = new THREE.SphereGeometry(0.105, 10, 8).scale(0.92, 1.08, 1).translate(0, 0.16, 0.01);
  const hair = new THREE.SphereGeometry(0.112, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)
    .scale(0.95, 1.0, 1.05).translate(0, 0.175, -0.008);
  const neck = new THREE.CylinderGeometry(0.05, 0.055, 0.1, 6).translate(0, 0.04, 0);
  const paint = (g, c) => {
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set(c, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g.toNonIndexed();
  };
  const parts = [paint(skin, [1, 1, 1]), paint(hair, [0.22, 0.15, 0.1]), paint(neck, [0.95, 0.95, 0.95])];
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'color']) {
    const len = parts.reduce((t, q) => t + q.attributes[k].array.length, 0);
    const arr = new Float32Array(len);
    let o = 0;
    for (const q of parts) { arr.set(q.attributes[k].array, o); o += q.attributes[k].array.length; }
    g.setAttribute(k, new THREE.BufferAttribute(arr, 3));
  }
  g.computeVertexNormals();
  return g;
}

/**
 * The soldier's own pieces with the olive drab taken out of them: the
 * shading kept, the colour left to the instance, so each civilian can be
 * dressed in his own coat and trousers.
 */
function undyed(geo) {
  const c = geo.attributes.color;
  if (!c) return geo;
  let top = 1e-6;
  for (let i = 0; i < c.count; i++) top = Math.max(top, c.getX(i) * 0.3 + c.getY(i) * 0.59 + c.getZ(i) * 0.11);
  for (let i = 0; i < c.count; i++) {
    const l = (c.getX(i) * 0.3 + c.getY(i) * 0.59 + c.getZ(i) * 0.11) / top;
    const v = 0.5 + 0.5 * l;
    c.setXYZ(i, v, v, v);
  }
  c.needsUpdate = true;
  return geo;
}

function partSet(scene, data, rifle, cap, civil = false) {
  const mat = bodyMaterial();
  const gun = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 30, specular: 0x222222 });
  gun.userData.painted = true;
  const set = {};
  for (const k of PARTS) {
    let geo = k === 'rifle' ? decode(rifle) : decode(data[k]);
    if (civil && k === 'head') geo = civilHead();
    else if (civil && k !== 'rifle') geo = undyed(geo);
    const mesh = new THREE.InstancedMesh(geo, k === 'rifle' ? gun : mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = !civil && cap <= NEAR_CAP;
    mesh.receiveShadow = false;
    // Instance colours, so each side's uniform can be told apart.
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(mesh);
    set[k] = mesh;
  }
  return set;
}

// The model's paint is dark, and under the battle's light it read as black:
// each side's men are lifted, ours in their own olive drab and the enemy's
// toward a cold field grey, so the two can be told apart at a glance.
const TINT = [new THREE.Color(2.0, 1.95, 1.75), new THREE.Color(1.45, 1.55, 1.85)];
const DEAD_TINT = [new THREE.Color(1.6, 1.5, 1.4), new THREE.Color(1.2, 1.25, 1.45)];

const DRESS = new THREE.Color();
/** The colour of one piece of a civilian: `col` is { coat, legs, skin }, each a THREE.Color. */
function partColour(col, part, k = 1) {
  const c = part === 'head' ? col.skin
    : part.startsWith('thigh') || part.startsWith('shin') ? col.legs : col.coat;
  return DRESS.copy(c).multiplyScalar(k);
}
function dress(set, n, col, k) {
  for (const part of PARTS) set[part].setColorAt(n, partColour(col, part, k));
}

// ---------------------------------------------------------------------------
// Blood
// ---------------------------------------------------------------------------

/** Drops of blood in the air and on the ground; the guts and the pieces of men; the pools. */
class Gore {
  constructor(scene) {
    this.scene = scene;
    // Drops: flying, and then splashed flat where they land.
    const drop = new THREE.IcosahedronGeometry(1, 0);
    this.drops = new THREE.InstancedMesh(drop, new THREE.MeshLambertMaterial({ color: 0x7a0808, emissive: 0x1a0000 }), 3200);
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.drops.frustumCulled = false;
    this.drops.count = 0;
    scene.add(this.drops);
    this.dropList = [];
    // Guts and lumps: wet, glistening, pink and dark red.
    const lump = new THREE.CapsuleGeometry(0.5, 1, 3, 6);
    this.lumps = new THREE.InstancedMesh(lump, new THREE.MeshPhongMaterial({ shininess: 80, specular: 0x553333 }), 600);
    this.lumps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.lumps.frustumCulled = false;
    this.lumps.count = 0;
    this.lumps.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(this.lumps);
    this.lumpList = [];
    // Pools: flat, dark, spreading.
    const disc = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
    this.pools = new THREE.InstancedMesh(disc, new THREE.MeshLambertMaterial({
      color: 0x3a0303, transparent: true, opacity: 0.88, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }), 500);
    this.pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pools.frustumCulled = false;
    this.pools.count = 0;
    this.pools.renderOrder = 2;
    scene.add(this.pools);
    this.poolList = [];
    // A mist of it in the air where a round went through.
    const N = 900;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(N), 1));
    g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(N), 1));
    g.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.mist = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `attribute float alpha; attribute float size; attribute vec3 tint; varying float vA; varying vec3 vT;
        void main() { vA = alpha; vT = tint; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * 300.0 / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; varying vec3 vT;
        void main() { vec2 p = gl_PointCoord - 0.5; float r = dot(p, p); if (r > 0.25) discard;
          gl_FragColor = vec4(vT, vA * (1.0 - r * 4.0)); }`,
    }));
    this.mist.frustumCulled = false;
    scene.add(this.mist);
    this.mistList = [];
    this.mistNext = 0;
    this.mistN = N;
  }

  /** A spurt of drops from a point, along a direction, `n` of them, `speed` m/s. */
  spurt(x, y, z, dx, dy, dz, n = 14, speed = 4, size = 0.022, world = null) {
    for (let k = 0; k < n; k++) {
      if (this.dropList.length >= 3000) this.dropList.shift();
      const sp = speed * (0.4 + Math.random());
      this.dropList.push({
        x, y, z,
        vx: dx * sp + (Math.random() - 0.5) * speed * 0.8,
        vy: dy * sp + Math.random() * speed * 0.5,
        vz: dz * sp + (Math.random() - 0.5) * speed * 0.8,
        s: size * (0.5 + Math.random()), t: 0, landed: false, life: 80 + Math.random() * 60, world,
      });
    }
  }

  /** A puff of red mist. */
  puff(x, y, z, n = 6, size = 0.5, tint = [0.42, 0.02, 0.02]) {
    for (let k = 0; k < n; k++) {
      this.mistList[this.mistNext] = {
        x: x + (Math.random() - 0.5) * 0.3, y: y + (Math.random() - 0.5) * 0.3, z: z + (Math.random() - 0.5) * 0.3,
        vx: (Math.random() - 0.5) * 1.5, vy: Math.random() * 0.6, vz: (Math.random() - 0.5) * 1.5,
        t: 0, life: 0.6 + Math.random() * 0.8, s: size * (0.6 + Math.random() * 0.8), tint,
      };
      this.mistNext = (this.mistNext + 1) % this.mistN;
    }
  }

  /** Guts, or lumps of what was a man, thrown out from a point. */
  spill(x, y, z, dx, dz, n = 8, speed = 5, world = null) {
    for (let k = 0; k < n; k++) {
      if (this.lumpList.length >= 580) this.lumpList.shift();
      const gut = Math.random() < 0.6;
      this.lumpList.push({
        x, y, z,
        vx: dx * speed * Math.random() + (Math.random() - 0.5) * speed,
        vy: 1.5 + Math.random() * speed * 0.7,
        vz: dz * speed * Math.random() + (Math.random() - 0.5) * speed,
        rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
        sx: (Math.random() - 0.5) * 12, sy: (Math.random() - 0.5) * 12,
        // A length of gut is long and thin; a lump is a lump.
        r: gut ? 0.03 + Math.random() * 0.025 : 0.05 + Math.random() * 0.06,
        len: gut ? 0.25 + Math.random() * 0.45 : 0.02 + Math.random() * 0.08,
        col: gut ? new THREE.Color().setRGB(0.62 + Math.random() * 0.15, 0.24 + Math.random() * 0.1, 0.24) : new THREE.Color().setRGB(0.38, 0.03, 0.03),
        landed: false, t: 0, world,
      });
    }
  }

  /** A pool of blood spreading on the ground to `r` metres over `secs`. */
  pool(x, z, y, r = 0.9, secs = 18) {
    if (this.poolList.length >= 480) this.poolList.shift();
    this.poolList.push({ x, y: y + 0.03, z, r, secs, t: 0, a: Math.random() * 6, sq: 0.7 + Math.random() * 0.5 });
  }

  update(dt) {
    // Drops.
    let n = 0;
    const m = _m;
    for (let i = this.dropList.length - 1; i >= 0; i--) {
      const p = this.dropList[i];
      p.t += dt;
      if (p.t > p.life) { this.dropList.splice(i, 1); continue; }
      if (!p.landed) {
        p.vy -= 9.8 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const g = p.world ? footing(p.world, p.x, p.z) : 0;
        const floor = Math.max(g, 0.02);
        if (p.y <= floor) { p.y = floor + 0.015; p.landed = true; p.s *= 1.5; }
      }
    }
    for (const p of this.dropList) {
      if (n >= 3200) break;
      const fade = p.t > p.life - 10 ? (p.life - p.t) / 10 : 1;
      if (p.landed) m.compose(_v.set(p.x, p.y, p.z), _q.identity(), _c.set(p.s * fade, p.s * 0.05, p.s * fade));
      else m.compose(_v.set(p.x, p.y, p.z), _q.identity(), _c.set(p.s, p.s * 1.6, p.s));
      this.drops.setMatrixAt(n++, m);
    }
    this.drops.count = n;
    this.drops.instanceMatrix.needsUpdate = true;
    // Guts.
    n = 0;
    for (const p of this.lumpList) {
      p.t += dt;
      if (!p.landed) {
        p.vy -= 9.8 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.rx += p.sx * dt; p.ry += p.sy * dt;
        const g = p.world ? footing(p.world, p.x, p.z) : 0;
        const floor = Math.max(g, 0) + p.r * 0.8;
        if (p.y <= floor) {
          p.y = floor;
          // A bounce, and then it lies there, flat along the ground.
          if (Math.abs(p.vy) > 2.5) { p.vy *= -0.25; p.vx *= 0.4; p.vz *= 0.4; } else { p.landed = true; p.rx = Math.PI / 2; }
        }
      }
      _e.set(p.rx, p.ry, p.rz);
      _q.setFromEuler(_e);
      m.compose(_v.set(p.x, p.y, p.z), _q, _c.set(p.r * 2, p.len + p.r * 2, p.r * 2));
      this.lumps.setMatrixAt(n, m);
      this.lumps.setColorAt(n, p.col);
      n++;
    }
    this.lumps.count = n;
    this.lumps.instanceMatrix.needsUpdate = true;
    if (this.lumps.instanceColor) this.lumps.instanceColor.needsUpdate = true;
    // Pools.
    n = 0;
    for (const p of this.poolList) {
      p.t += dt;
      const k = Math.min(1, p.t / p.secs);
      const r = p.r * Math.sqrt(0.05 + 0.95 * k);
      _q.setFromAxisAngle(Y, p.a);
      m.compose(_v.set(p.x, p.y, p.z), _q, _c.set(r, 1, r * p.sq));
      this.pools.setMatrixAt(n++, m);
    }
    this.pools.count = n;
    this.pools.instanceMatrix.needsUpdate = true;
    // Mist.
    const pos = this.mist.geometry.attributes.position;
    const al = this.mist.geometry.attributes.alpha;
    const sz = this.mist.geometry.attributes.size;
    const ti = this.mist.geometry.attributes.tint;
    for (let i = 0; i < this.mistN; i++) {
      const p = this.mistList[i];
      if (!p) { al.array[i] = 0; continue; }
      p.t += dt;
      if (p.t > p.life) { this.mistList[i] = null; al.array[i] = 0; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      pos.setXYZ(i, p.x, p.y, p.z);
      al.array[i] = 0.7 * (1 - p.t / p.life);
      sz.array[i] = p.s * (1 + p.t * 1.5);
      ti.setXYZ(i, p.tint[0], p.tint[1], p.tint[2]);
    }
    pos.needsUpdate = true; al.needsUpdate = true; sz.needsUpdate = true; ti.needsUpdate = true;
  }

  dispose() {
    for (const o of [this.drops, this.lumps, this.pools, this.mist]) {
      this.scene.remove(o);
      o.geometry.dispose();
      o.material.dispose();
    }
  }
}

// ---------------------------------------------------------------------------
// Tracer, flash and the round going in
// ---------------------------------------------------------------------------

class Rounds {
  constructor(scene) {
    this.scene = scene;
    const N = 400;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.list = [];
    this.N = N;
  }

  fire(x, y, z, tx, ty, tz, mg) {
    if (this.list.length >= this.N) this.list.shift();
    const L = Math.hypot(tx - x, ty - y, tz - z) || 1;
    this.list.push({ x, y, z, dx: (tx - x) / L, dy: (ty - y) / L, dz: (tz - z) / L, L, t: 0, mg, flash: 0.06 });
  }

  update(dt) {
    const pos = this.lines.geometry.attributes.position;
    const col = this.lines.geometry.attributes.color;
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i];
      r.t += dt;
      // 850 metres a second: the streak goes down the line and is gone.
      const head = Math.min(r.L, r.t * 850);
      const tail = Math.max(0, head - (r.mg ? 14 : 7));
      if (tail >= r.L) { this.list.splice(i, 1); continue; }
      pos.setXYZ(n * 2, r.x + r.dx * tail, r.y + r.dy * tail, r.z + r.dz * tail);
      pos.setXYZ(n * 2 + 1, r.x + r.dx * head, r.y + r.dy * head, r.z + r.dz * head);
      const k = r.mg ? 1 : 0.45;
      col.setXYZ(n * 2, 0, 0, 0);
      col.setXYZ(n * 2 + 1, 1.0 * k, 0.75 * k, 0.4 * k);
      n++;
    }
    this.lines.geometry.setDrawRange(0, n * 2);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.lines);
    this.lines.geometry.dispose();
    this.lines.material.dispose();
  }
}

// ---------------------------------------------------------------------------
// The barracks
// ---------------------------------------------------------------------------

/** A Quonset hut: corrugated half-cylinder, end walls, a door, olive drab. */
function buildHut(team) {
  const g = new THREE.Group();
  const iron = new THREE.MeshLambertMaterial({ color: team === 0 ? 0x7d8456 : 0x6f7266, side: THREE.DoubleSide });
  const wall = new THREE.MeshLambertMaterial({ color: 0x6b6450 });
  const R = 4.3, L = 16;
  const shell = new THREE.CylinderGeometry(R, R, L, 18, 1, true, -Math.PI / 2, Math.PI);
  // Its axis along the hut, and the half of it that is the roof up.
  shell.rotateX(-Math.PI / 2);
  // Corrugations, in the shading.
  const p = shell.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getX(i), p.getY(i));
    const k = 1 + 0.012 * Math.sin(a * 60);
    p.setX(i, p.getX(i) * k); p.setY(i, p.getY(i) * k);
  }
  shell.computeVertexNormals();
  const roof = new THREE.Mesh(shell, iron);
  roof.castShadow = true;
  roof.receiveShadow = true;
  g.add(roof);
  for (const s of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.CircleGeometry(R, 18, 0, Math.PI).rotateZ(-Math.PI / 2).rotateZ(Math.PI / 2), wall);
    end.position.z = (s * L) / 2;
    if (s < 0) end.rotation.y = Math.PI;
    g.add(end);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.3, 0.2), new THREE.MeshLambertMaterial({ color: 0x3a3226 }));
  door.position.set(0, 1.15, L / 2 + 0.05);
  g.add(door);
  // The hut faces its men down its long axis; the frame turns it.
  g.userData.ruin = () => {
    roof.scale.set(1, 0.35, 1);
    iron.color.set(0x2a2723);
    wall.color.set(0x2a2622);
  };
  return g;
}

// ---------------------------------------------------------------------------
// The men
// ---------------------------------------------------------------------------

export class InfantryView {
  /**
   * `civil` draws them as townspeople rather than soldiers: no rifle, bare
   * heads, arms swinging as they walk or thrown up as they run, and each in
   * the colours his own entry carries (`col`: coat, trousers, skin).
   */
  constructor(scene, world, { civil = false, nearCap = NEAR_CAP, farCap = FAR_CAP } = {}) {
    this.scene = scene;
    this.world = world;
    this.civil = civil;
    this.nearCap = nearCap;
    this.farCap = farCap;
    this.near = partSet(scene, SOLDIER_NEAR, GARAND_NEAR, nearCap, civil);
    this.far = partSet(scene, SOLDIER_FAR, GARAND_FAR, farCap, civil);
    this.gore = new Gore(scene);
    this.rounds = new Rounds(scene);
    // Each man's own animation state, by his id.
    this.anim = new Map();
    this.dead = [];
    this.pieces = [];
    this.huts = new Map();
    this.hide = 0;
    this.time = 0;
  }

  /**
   * Each man's pose, as the matrices of his ten pieces and his rifle,
   * written into the sets at `n` (near or far). `p` is what the simulation
   * says of him; `a` is his animation state.
   */
  pose(p, a, set, n) {
    const crouch = a.crouch, run = a.run, air = a.air, aim = a.aim;
    // His legs: a stride whose length and lift go with his pace.
    const amp = lerp(lerp(0.42, 0.85, run), 0.32, crouch) * a.moving;
    const base = lerp(0, 0.75, crouch * (1 - a.kneel));
    const kb0 = lerp(0.08, 1.05, crouch * (1 - a.kneel));
    const kbA = lerp(0.55, 1.25, run) * a.moving;
    for (let k = 0; k < 2; k++) {
      const sd = SIDES[k];
      const ph = a.phase + (k ? Math.PI : 0);
      let th = -amp * Math.sin(ph) - base;
      let bend = kb0 + kbA * Math.max(0, Math.cos(ph));
      // Down on one knee to shoot: the right knee on the ground, the left up.
      if (a.kneel > 0) {
        th = lerp(th, sd === 'R' ? -0.15 : -1.3, a.kneel);
        bend = lerp(bend, sd === 'R' ? 2.05 : 1.45, a.kneel);
      }
      if (air > 0) {
        th = lerp(th, sd === 'L' ? -0.75 : -0.25, air);
        bend = lerp(bend, sd === 'L' ? 1.2 : 0.7, air);
      }
      LEG_TH[k] = th;
      LEG_BEND[k] = bend;
    }
    // How low his hips go to keep his lowest foot -- or his knee, kneeling --
    // on the ground.
    let low = Infinity;
    for (let k = 0; k < 2; k++) {
      const R = REST[SIDES[k]];
      _q.setFromAxisAngle(X, LEG_TH[k]);
      KNEE[k].copy(R.thigh).applyQuaternion(_q).add(R.Hp);
      _q2.setFromAxisAngle(X, LEG_TH[k] + LEG_BEND[k]);
      _b.copy(R.shin).applyQuaternion(_q2).add(KNEE[k]);
      low = Math.min(low, _b.y - 0.09, KNEE[k].y - 0.07);
    }
    const drop = air > 0 ? lerp(-low, 0.1, air) : -low;
    // His body: leaning into a run, over his rifle crouched, and turned at
    // the waist toward where he is looking.
    const lean = lerp(lerp(0.04, lerp(0.16, 0.32, a.sprint), run), 0.28, crouch * (1 - aim * 0.5)) - aim * 0.04;
    const twist = clamp(a.twist, -0.9, 0.9);
    const torsoQ = TORSO_Q.setFromEuler(_e.set(lean, twist, 0, 'YXZ'));
    const waist = WAIST_AT.copy(WAIST);
    waist.y += drop + (a.moving > 0.1 ? Math.abs(Math.sin(a.phase)) * 0.03 * run : 0);
    // A point on his body, carried with his waist as it leans and turns.
    const T = (pt, out) => out.copy(pt).sub(WAIST).applyQuaternion(torsoQ).add(waist);
    const B = a.matrix;
    const put = (part, pos, q) => {
      _m.compose(pos, q, _s1);
      _m.premultiply(B);
      set[part].setMatrixAt(n, _m);
    };
    put('torso', waist, torsoQ);
    // His head follows his eyes up and down, a little.
    HEAD_Q.copy(torsoQ).multiply(_q2.setFromAxisAngle(X, clamp(-a.pitch * 0.6 - lean * 0.6, -0.6, 0.5)));
    if (a.noHead) set.head.setMatrixAt(n, ZERO); else put('head', T(NECK, V[0]), HEAD_Q);
    // The legs.
    for (let k = 0; k < 2; k++) {
      const sd = SIDES[k];
      if (a.noLeg === sd) { set[`thigh${sd}`].setMatrixAt(n, ZERO); set[`shin${sd}`].setMatrixAt(n, ZERO); continue; }
      const hip = V[1].copy(REST[sd].Hp);
      hip.y += drop;
      put(`thigh${sd}`, hip, _q2.setFromAxisAngle(X, LEG_TH[k]));
      const knee = V[2].copy(KNEE[k]);
      knee.y += drop;
      put(`shin${sd}`, knee, _q2.setFromAxisAngle(X, LEG_TH[k] + LEG_BEND[k]));
    }
    // The rifle: up at his right shoulder along his line of sight when he is
    // aiming, carried across his chest otherwise.
    const pitch = a.pitch;
    const aimDir = V[3].set(Math.sin(twist) * Math.cos(pitch), Math.sin(pitch), Math.cos(twist) * Math.cos(pitch));
    const pocket = T(POCKET, V[4]);
    const portDir = V[5].set(0.42, lerp(0.62, 0.5, a.reload), 0.66).normalize().applyQuaternion(torsoQ);
    const portButt = T(V[6].set(-0.17, lerp(0.98, 1.05, a.reload), 0.24), V[6]);
    const dir = portDir.lerp(aimDir, aim).normalize();
    const butt = portButt.lerp(pocket, aim);
    const gripR = V[7].copy(butt).addScaledVector(dir, 0.3);
    gripR.y -= 0.07;
    const gripL = V[8].copy(butt).addScaledVector(dir, a.reload > 0.5 ? 0.42 : 0.63);
    gripL.y -= a.reload > 0.5 ? -0.05 : 0.045;
    if (a.dropped || this.civil) set.rifle.setMatrixAt(n, ZERO);
    else put('rifle', butt, aimQuat(dir, RIFLE_Q));
    // And his arms, reaching for it.
    for (let k = 0; k < 2; k++) {
      const sd = k ? 'L' : 'R';
      const side = k ? 1 : -1;
      const R = REST[sd];
      if (a.noArm === sd) { set[`uarm${sd}`].setMatrixAt(n, ZERO); set[`farm${sd}`].setMatrixAt(n, ZERO); continue; }
      const S = T(R.S, V[9]);
      const pole = V[10].set(side * 0.7, -1, -0.35).applyQuaternion(torsoQ);
      let target = k ? gripL : gripR;
      if (this.civil && !a.splay) {
        // Unarmed: his arms swing against his legs as he walks, and in a
        // panic they are up round his head as he runs.
        const sw = Math.sin(a.phase + (k ? 0 : Math.PI)) * lerp(0.12, 0.5, run) * a.moving;
        const hang = V[11].set(side * 0.1, -0.52 * Math.cos(sw), 0.52 * Math.sin(sw) + 0.04);
        const up = V[13].set(side * 0.16, 0.3 + 0.05 * Math.sin(a.phase * 2 + k), 0.12);
        target = hang.lerp(up, a.panic || 0).applyQuaternion(torsoQ).add(S);
      }
      if (a.splay) target = V[11].set(side * 0.5, -0.1, 0.25).applyQuaternion(torsoQ).add(S);
      const E = V[12];
      reach(S, target, R.L1, R.L2, pole, E);
      _a.subVectors(E, S).normalize();
      put(`uarm${sd}`, S, ARM_Q.setFromUnitVectors(R.up, _a));
      _b.subVectors(target, E).normalize();
      put(`farm${sd}`, E, ARM_Q.setFromUnitVectors(R.fore, _b));
    }
  }

  /**
   * Draw the men. `list` is every soldier as the screen has him this frame
   * (interpolated): `{ i, tm, x, y, z, h, yaw, pitch, f, sp }`. `team` is the
   * viewer's side, `camera` where he is looking from, `own` the id of the man
   * the player has in hand, if any (drawn without his head, the camera being
   * in it, when `firstPerson`).
   */
  sync(list, dt, camera, team = 0, own = 0, firstPerson = false) {
    this.time += dt;
    const cam = camera.position;
    let nn = 0, nf = 0;
    const seen = new Set();
    for (let p of list) {
      seen.add(p.i);
      let a = this.anim.get(p.i);
      if (!a) {
        a = { phase: Math.random() * 6, crouch: 0, kneel: 0, run: 0, sprint: 0, air: 0, aim: 0, reload: 0, moving: 0, twist: 0, pitch: 0, matrix: new THREE.Matrix4(), last: p };
        this.anim.set(p.i, a);
      }
      a.last = p;
      const f = p.f || 0;
      const k = 1 - Math.exp(-dt * 9);
      // He turns, rather than snapping round to every new heading the
      // snapshots have for him: a man changing direction takes a moment.
      if (a.h === undefined) a.h = p.h;
      else {
        const dh = Math.atan2(Math.sin(p.h - a.h), Math.cos(p.h - a.h));
        a.h += dh * Math.min(1, dt * 16);
      }
      p = { ...p, h: a.h };
      a.last = p;
      const sp = Math.abs(p.sp || 0);
      a.moving += ((sp > 0.25 ? 1 : 0) - a.moving) * k;
      a.run += ((sp > 2.4 ? 1 : 0) - a.run) * k;
      a.sprint += ((f & 2 ? 1 : 0) - a.sprint) * k;
      a.crouch += ((f & 1 ? 1 : 0) - a.crouch) * k;
      // On one knee when he is down and not going anywhere.
      a.kneel += ((f & 1 && sp < 0.4 ? 1 : 0) - a.kneel) * k * 0.7;
      a.air += ((f & 4 ? 1 : 0) - a.air) * Math.min(1, dt * 14);
      const aiming = (f & 32) || ((f & 128) && !(f & 2));
      a.aim += ((aiming && !(f & 16) && !(f & 2) ? 1 : 0) - a.aim) * Math.min(1, dt * 7);
      a.reload += ((f & 16 ? 1 : 0) - a.reload) * k;
      a.phase += dt * (sp / 1.45) * Math.PI * (1 + a.run * 0.15);
      a.twist = Math.atan2(Math.sin(p.yaw - p.h), Math.cos(p.yaw - p.h));
      a.pitch = p.pitch || 0;
      a.noHead = firstPerson && p.i === own;
      // Through his own eyes his rifle and hands are drawn in front of the
      // camera (fps.js), and the rest of him is not in view.
      if (a.noHead && this.ownInHand) continue;
      const d = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
      if (d > FAR_OUT) continue;
      _q.setFromAxisAngle(Y, p.h);
      a.matrix.compose(_v.set(p.x, p.y, p.z), _q, _s1);
      const near = d < NEAR_OUT && nn < this.nearCap - 40;
      const set = near ? this.near : this.far;
      const n = near ? nn++ : nf++;
      if (!near && nf >= this.farCap) continue;
      a.panic = (a.panic || 0) + (((f & 256) ? 1 : 0) - (a.panic || 0)) * k;
      this.pose(p, a, set, n);
      if (p.col) dress(set, n, p.col, 1);
      else for (const part of PARTS) set[part].setColorAt(n, TINT[p.tm === team ? 0 : 1]);
    }
    for (const id of this.anim.keys()) if (!seen.has(id) && !this.dead.some((c) => c.id === id)) this.anim.delete(id);
    // The dead, where they fell.
    for (const c of this.dead) {
      c.t += dt;
      const a = c.a;
      // Over he goes, quicker as he goes.
      const fall = Math.min(1, (c.t / 0.75) ** 2);
      a.crouch = 0; a.run = 0; a.air = 0; a.moving = 0; a.aim = 0; a.reload = 0; a.splay = fall > 0.5;
      a.kneel = c.c ? 1 - fall : 0;
      a.twist = 0; a.pitch = 0.2;
      _q.setFromAxisAngle(Y, c.h);
      _q2.setFromAxisAngle(_c.set(1, 0, 0), -Math.PI / 2 * fall * c.way);
      _q.multiply(_q2);
      const y = lerp(c.y, c.g + 0.12, fall);
      a.matrix.compose(_v.set(c.x, y, c.z), _q, _s1);
      const d = Math.hypot(c.x - cam.x, c.y - cam.y, c.z - cam.z);
      if (d > FAR_OUT) continue;
      const near = d < NEAR_OUT && nn < this.nearCap - 40;
      const set = near ? this.near : this.far;
      const n = near ? nn++ : nf++;
      if (!near && nf >= this.farCap) continue;
      this.pose(c, a, set, n);
      if (c.col) dress(set, n, c.col, 0.8);
      else for (const part of PARTS) set[part].setColorAt(n, DEAD_TINT[c.tm === team ? 0 : 1]);
      // His rifle, on the ground beside him.
      if (a.dropped) {
        _q.setFromAxisAngle(Y, c.h + 1.2);
        _q2.setFromAxisAngle(_c.set(0, 0, 1), Math.PI / 2);
        _q.multiply(_q2);
        _m.compose(_v.set(c.x + Math.sin(c.h + 1.6) * 0.8, c.g + 0.04, c.z + Math.cos(c.h + 1.6) * 0.8), _q, _s1);
        set.rifle.setMatrixAt(n, _m);
      }
    }
    // Pieces of men, thrown.
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.t += dt;
      if (!p.still) {
        p.vy -= 9.8 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        _q.setFromEuler(_e.set(p.sx * dt, p.sy * dt, 0));
        p.q.multiply(_q);
        const g = footing(this.world, p.x, p.z);
        if (p.y < g + 0.08) {
          p.y = g + 0.08;
          if (Math.abs(p.vy) > 3) { p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; } else p.still = true;
          // Where it lands, it bleeds.
          if (!p.bled) { p.bled = true; this.gore.pool(p.x, p.z, g, 0.35 + Math.random() * 0.3, 6); }
        }
      }
      const d = Math.hypot(p.x - cam.x, p.z - cam.z);
      if (d > NEAR_OUT * 3 || nn >= this.nearCap) continue;
      const n = nn++;
      for (const part of PARTS) this.near[part].setMatrixAt(n, ZERO);
      _m.compose(_v.set(p.x, p.y, p.z), p.q, _s1);
      this.near[p.part].setMatrixAt(n, _m);
      this.near[p.part].setColorAt(n, p.col ? partColour(p.col, p.part, 0.8) : DEAD_TINT[p.tm === team ? 0 : 1]);
      if (p.t > 240) this.pieces.splice(i, 1);
    }
    for (const [s, n] of [[this.near, nn], [this.far, nf]]) {
      for (const part of PARTS) {
        const m = s[part];
        m.count = Math.min(n, m.instanceMatrix.count);
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
    this.gore.update(dt);
    this.rounds.update(dt);
  }

  /** The barracks off the snapshot: `[id, team, x, z, h, alive]`. */
  barracks(list, team) {
    for (const [id, tm, x, z, h, alive] of list || []) {
      let hut = this.huts.get(id);
      if (!hut) {
        hut = buildHut(tm === team ? 0 : 1);
        hut.position.set(x, footing(this.world, x, z), z);
        hut.rotation.y = h;
        this.scene.add(hut);
        this.huts.set(id, hut);
      }
      if (!alive && !hut.userData.ruined) { hut.userData.ruined = true; hut.userData.ruin(); }
    }
  }

  // ------------------------------------------------------------- events --

  /** A rifle or a machine gun fired: the streak down the line, and what it hit. */
  shot(ev) {
    this.rounds.fire(ev.x, ev.y, ev.z, ev.tx, ev.ty, ev.tz, !!ev.g);
    if (ev.k === 2) {
      // Dirt kicked up.
      this.gore.puff(ev.tx, ev.ty + 0.1, ev.tz, 3, 0.35, [0.36, 0.31, 0.24]);
    }
  }

  /** A man hit and still standing: blood out of the wound, the way the round was going. */
  wound(ev) {
    const n = 10 + Math.round(Math.min(30, ev.n || 30) * 0.5);
    this.gore.spurt(ev.x, ev.y, ev.z, ev.dx || 0, (ev.dy || 0) + 0.15, ev.dz || 0, n, 3.5, 0.022, this.world);
    // And back out of the way it came in, less of it.
    this.gore.spurt(ev.x, ev.y, ev.z, -(ev.dx || 0) * 0.4, 0.2, -(ev.dz || 0) * 0.4, Math.round(n / 3), 1.6, 0.018, this.world);
    this.gore.puff(ev.x, ev.y, ev.z, 5, 0.45);
    // And it runs down him onto the ground where he stands.
    this.gore.pool(ev.x, ev.z, footing(this.world, ev.x, ev.z), 0.18 + Math.random() * 0.12, 3);
  }

  /**
   * A man killed: he goes over, he bleeds out where he lies, and if it was
   * a shell or a tank that did it, he comes apart.
   */
  kill(ev, team) {
    const was = this.anim.get(ev.i);
    const g = footing(this.world, ev.x, ev.z);
    const dx = ev.dx || 0, dz = ev.dz || 0;
    const hl = Math.hypot(dx, dz) || 1;
    // Turned to face where it came from, so he goes over backward away from it.
    const face = Math.hypot(dx, dz) > 0.05 ? Math.atan2(-dx, -dz) : ev.h;
    const a = was ? { ...was, matrix: new THREE.Matrix4() } : {
      phase: 0, crouch: ev.c, kneel: 0, run: 0, sprint: 0, air: 0, aim: 0, reload: 0, moving: 0, twist: 0, pitch: 0, matrix: new THREE.Matrix4(),
    };
    a.dropped = true;
    const corpse = { id: ev.i, x: ev.x, y: ev.y, z: ev.z, g, h: face, tm: ev.tm, t: 0, c: ev.c, a, way: 1, col: ev.col };
    // Blood: a great deal of it, out of where he was hit, and a pool under him.
    this.gore.spurt(ev.hx ?? ev.x, ev.hy ?? ev.y + 1.2, ev.hz ?? ev.z, dx / hl, 0.4, dz / hl, 34, 4.5, 0.025, this.world);
    this.gore.puff(ev.hx ?? ev.x, ev.hy ?? ev.y + 1.2, ev.hz ?? ev.z, 9, 0.6);
    const lie = { x: ev.x - Math.sin(face) * 0.9, z: ev.z - Math.cos(face) * 0.9 };
    this.gore.pool(lie.x, lie.z, footing(this.world, lie.x, lie.z), 0.9 + Math.random() * 0.5, 22);
    // A head shot: what was in it goes with the round.
    if (ev.p === 0) {
      this.gore.spurt(ev.hx, ev.hy, ev.hz, dx / hl, 0.3, dz / hl, 26, 6, 0.028, this.world);
      this.gore.spill(ev.hx, ev.hy, ev.hz, dx / hl, dz / hl, 3, 3, this.world);
    }
    if (ev.g) {
      // Taken apart: his head and a limb or two thrown, his guts across the
      // ground, and the ground round him red.
      a.noHead = true;
      a.noArm = Math.random() < 0.6 ? (Math.random() < 0.5 ? 'L' : 'R') : null;
      a.noLeg = Math.random() < 0.5 ? (Math.random() < 0.5 ? 'L' : 'R') : null;
      const throwPiece = (part, y) => {
        this.pieces.push({
          part, tm: ev.tm, col: ev.col, x: ev.x, y: ev.y + y, z: ev.z,
          vx: (dx / hl) * 5 + (Math.random() - 0.5) * 8, vy: 3 + Math.random() * 6, vz: (dz / hl) * 5 + (Math.random() - 0.5) * 8,
          sx: (Math.random() - 0.5) * 14, sy: (Math.random() - 0.5) * 14,
          q: new THREE.Quaternion().setFromEuler(_e.set(Math.random() * 6, Math.random() * 6, 0)), t: 0,
        });
        if (this.pieces.length > 160) this.pieces.shift();
      };
      throwPiece('head', 1.5);
      if (a.noArm) { throwPiece(`farm${a.noArm}`, 1.1); throwPiece(`uarm${a.noArm}`, 1.3); }
      if (a.noLeg) { throwPiece(`shin${a.noLeg}`, 0.3); throwPiece(`thigh${a.noLeg}`, 0.7); }
      this.gore.spurt(ev.x, ev.y + 1.0, ev.z, dx / hl, 0.6, dz / hl, 120, 7, 0.03, this.world);
      this.gore.spill(ev.x, ev.y + 0.9, ev.z, dx / hl, dz / hl, 16, 6, this.world);
      this.gore.puff(ev.x, ev.y + 1, ev.z, 24, 1.1);
      for (let k = 0; k < 4; k++) {
        const r = 1 + Math.random() * 3;
        const ang = Math.random() * Math.PI * 2;
        const x = ev.x + Math.sin(ang) * r, z = ev.z + Math.cos(ang) * r;
        this.gore.pool(x, z, footing(this.world, x, z), 0.5 + Math.random() * 0.8, 8);
      }
    } else {
      // Shot, his guts come out of him where he lies, a while after he goes down.
      if (ev.p === 1 && Math.random() < 0.55) {
        setTimeout(() => this.gore.spill(lie.x, g + 0.25, lie.z, dx / hl, dz / hl, 4 + Math.round(Math.random() * 4), 1.5, this.world), 650);
      }
    }
    this.anim.delete(ev.i);
    this.dead.push(corpse);
    if (this.dead.length > MAX_DEAD) this.dead.shift();
  }

  /** A grenade into a tank or a gun pit: the flash, and the dirt. */
  grenade(ev) {
    this.gore.puff(ev.x, ev.y, ev.z, 12, 1.4, [0.25, 0.22, 0.18]);
  }

  dispose() {
    for (const s of [this.near, this.far]) {
      for (const m of Object.values(s)) {
        this.scene.remove(m);
        m.geometry.dispose();
      }
    }
    for (const h of this.huts.values()) this.scene.remove(h);
    this.gore.dispose();
    this.rounds.dispose();
  }
}
