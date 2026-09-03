// The torpedo, and the track it leaves on the water.
//
// A torpedo used to be a grey box seven metres long sliding across the sea.
// This is the weapon instead: a body, a rounded head, a tapered tail with the
// control surfaces on it and a pair of contra-rotating screws, running at the
// depth it was set to with only the top of it breaking the surface -- and,
// behind it, the track.
//
// The track is the whole point. A Mk 15 was a wet-heater torpedo: it burned
// alcohol and air, and it put the exhaust out through the propeller boss. What
// came up behind it was a rope of white bubbles standing out against the sea
// for a minute or more, and that rope is the single most important thing in a
// torpedo action. Ships were conned off torpedo tracks. Lookouts were posted
// for nothing else. A torpedo you cannot see coming is not a weapon in a game,
// it is an accident that happens to you -- so the track is modelled properly:
// a ribbon of churned water laid in the world where the fish has been, riding
// the same swell as everything else, plus the bubbles boiling up along it.

import * as THREE from '../../../vendor/three.module.js';
import { WAVE_GLSL } from './ocean.js';

// How far the fish runs between track points, how many are kept, and how long
// a piece of track stands on the water before the sea takes it.
const STEP_M = 7;
const POINTS = 90;
const LIFE = 42;
// Half the width of the track, in metres. A torpedo's wake is a narrow thing:
// this is a rope of bubbles, not a ship's wake.
const HALF = 1.5;

/**
 * One torpedo: body, head, tail cone, fins and screws.
 *
 * Built to the real thing's proportions -- a Mk 15 is 533 mm across and 7.3 m
 * long, which is a very slender object indeed -- and pointing down +Z so an
 * instance can be laid along its own course.
 */
export function torpedoGeometry() {
  const RINGS = [
    // [z along the fish, radius]. Nose first: a rounded warhead, a long
    // parallel body, and a tail cone back to the screws.
    [3.65, 0.00], [3.58, 0.12], [3.45, 0.20], [3.25, 0.25], [2.90, 0.267],
    [1.60, 0.267], [0.00, 0.267], [-1.30, 0.267], [-2.05, 0.25],
    [-2.60, 0.20], [-3.05, 0.14], [-3.30, 0.10],
  ];
  const N = 12;
  const pos = [];
  const idx = [];
  for (const [z, r] of RINGS) {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      pos.push(Math.cos(a) * r, Math.sin(a) * r, z);
    }
  }
  for (let k = 0; k < RINGS.length - 1; k++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a = k * N + i;
      const b = k * N + j;
      const c = (k + 1) * N + i;
      const d = (k + 1) * N + j;
      idx.push(a, c, d, a, d, b);
    }
  }
  const cap = (ringIndex, z, flip) => {
    const hub = pos.length / 3;
    const base = ringIndex * N;
    pos.push(0, 0, z);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      if (flip) idx.push(hub, base + j, base + i);
      else idx.push(hub, base + i, base + j);
    }
  };
  cap(RINGS.length - 1, RINGS[RINGS.length - 1][0] - 0.05, true);

  // The four tail fins, on the diagonals where a Mk 15 carries them, and the
  // upper vertical that shows above the surface.
  const fin = (ang) => {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const base = pos.length / 3;
    // A flat blade: root at the tail cone, tip out beyond the body.
    const pts = [
      [0.10, -1.15], [0.62, -1.15], [0.62, -3.05], [0.10, -3.05],
    ];
    for (const [r, z] of pts) pos.push(c * r, s * r, z);
    for (const [r, z] of pts) pos.push(c * r * 0.98 - s * 0.03, s * r * 0.98 + c * 0.03, z);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    idx.push(base + 4, base + 6, base + 5, base + 4, base + 7, base + 6);
  };
  for (const a of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) fin(a);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** The two contra-rotating screws on the tail, as one small blade disc. */
function screwGeometry() {
  const pos = [];
  const idx = [];
  let n = 0;
  for (const [z, ang0] of [[-3.32, 0], [-3.52, Math.PI / 4]]) {
    for (let b = 0; b < 4; b++) {
      const a = ang0 + (b / 4) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const w = 0.05;
      pos.push(c * 0.05 - s * w, s * 0.05 + c * w, z);
      pos.push(c * 0.32 - s * w, s * 0.32 + c * w, z + 0.03);
      pos.push(c * 0.32 + s * w, s * 0.32 - c * w, z - 0.03);
      pos.push(c * 0.05 + s * w, s * 0.05 - c * w, z);
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
      n += 4;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ------------------------------------------------------------- the track --

const TRACK_VERT = /* glsl */`
attribute float aAge;      // seconds since the fish churned this water
attribute float aSide;     // -1 to port of the track, +1 to starboard
attribute float aRun;      // how far astern of the fish, in metres
varying float vAge;
varying float vSide;
varying float vRun;
varying vec3 vWorld;
varying vec3 vSea;
varying float vDist;
${WAVE_GLSL}

void main() {
  vAge = aAge;
  vSide = aSide;
  vRun = aRun;
  // Lifted on to the swell, but not carried along it.
  //
  // A ship's wake ribbon is laid out in wave *parameter* space and displaced
  // bodily, which is why it lands exactly on the water. A torpedo track cannot
  // be: it is a record of where the weapon actually was, in world coordinates,
  // and the fish herself is drawn at those coordinates too. Displace it
  // bodily and the Gerstner term slides the rope ten metres sideways from the
  // torpedo that laid it. So only the vertical part is taken -- the track
  // rides up and down the swell with the sea, and stays under its own fish.
  vec3 nrm;
  float fold;
  vec3 d = gerstner(position.xz, nrm, fold);
  vec3 world = vec3(position.x, position.y + d.y, position.z);
  float dist = length(world - cameraPosition);
  // Clear of the surface by a hand's breadth, growing with range: far off, the
  // ocean is a coarse mesh whose triangles cut chords under their own crests.
  world.y += min(0.10 + dist * 0.0035, 5.0);
  vWorld = world;
  vSea = nrm;
  vDist = dist;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const TRACK_FRAG = /* glsl */`
uniform float uLife;
uniform vec3 uFoam;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uTime;
varying float vAge;
varying float vSide;
varying float vRun;
varying vec3 vWorld;
varying vec3 vSea;
varying float vDist;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.07; a *= 0.5; }
  return v;
}

void main() {
  float age = clamp(vAge / uLife, 0.0, 1.0);
  // Across the track: full in the middle, gone at the edges. The rope widens
  // and softens as it ages, which is the bubbles rising and spreading out.
  float across = abs(vSide);
  float spread = 0.42 + age * 0.58;
  float band = 1.0 - smoothstep(spread * 0.45, spread, across);

  // The bubbles themselves. Two scales of noise scrolling slowly astern: the
  // boil right behind the screws, and the broken foam left further back.
  vec2 p = vec2(vWorld.x, vWorld.z) * 0.55;
  float boil = fbm(p + vec2(0.0, uTime * 0.35));
  float broke = fbm(p * 0.34 - vec2(uTime * 0.11, 0.0));
  float bubbles = smoothstep(0.34, 0.78, boil * 0.65 + broke * 0.45);

  // The boil right behind her screws is solid white and churning; a few
  // seconds astern it has already broken up into the rope of separate bubbles
  // that a lookout actually sees, and the sea goes on taking that apart.
  float fresh = 1.0 - smoothstep(0.0, 0.035, age);
  float body = mix(bubbles, 1.0, fresh * 0.85);

  float fade = pow(1.0 - age, 1.35);
  float alpha = band * body * fade * 0.85;
  // Right at the head of the track it is hidden under the fish herself.
  alpha *= smoothstep(2.6, 5.0, vRun);
  if (alpha < 0.004) discard;

  // Foam is white, but white against a sunlit sea reads as a cut-out. Let the
  // sea's own normal tip it a little the way the water beside it is tipped.
  float lean = clamp(vSea.y, 0.0, 1.0);
  vec3 col = uFoam * (0.72 + lean * 0.28);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);
  col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

/**
 * Every torpedo in the water, and every track behind them.
 *
 * One geometry for all the tracks and one instanced mesh for all the fish, so
 * a full ten-tube salvo costs two draw calls. A track is kept for a while
 * after its torpedo has gone -- it ran, and the water remembers it for a
 * minute whether or not the weapon is still there.
 */
export class Torpedoes {
  constructor(scene, ocean = null, max = 48) {
    this.scene = scene;
    this.ocean = ocean;
    this.max = max;
    this.tracks = new Map();   // id -> { pts, seen, dead }
    this.clock = 0;

    const geo = torpedoGeometry();
    // Torpedo bronze, gone dark with paint and seawater. Light enough to read
    // against the sea, which a real one very deliberately was not.
    this.mat = new THREE.MeshLambertMaterial({ color: 0x5a6169, emissive: 0x14171a });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.screwMat = new THREE.MeshBasicMaterial({
      color: 0xb9c2cb, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    });
    this.screws = new THREE.InstancedMesh(screwGeometry(), this.screwMat, max);
    this.screws.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.screws.frustumCulled = false;
    scene.add(this.screws);

    this.dummy = new THREE.Object3D();
    this.park(0);
    this.buildTrack(scene);
  }

  buildTrack(scene) {
    const verts = this.max * POINTS * 2;
    const pos = new Float32Array(verts * 3);
    const age = new Float32Array(verts);
    const side = new Float32Array(verts);
    const run = new Float32Array(verts);
    const idx = [];
    for (let t = 0; t < this.max; t++) {
      const base = t * POINTS * 2;
      for (let i = 0; i < POINTS; i++) {
        side[base + i * 2] = -1;
        side[base + i * 2 + 1] = 1;
      }
      for (let i = 0; i < POINTS - 1; i++) {
        const a = base + i * 2;
        idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    g.setAttribute('aRun', new THREE.BufferAttribute(run, 1));
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    this.trackGeo = g;

    // The sea's own wave train and air, handed over rather than copied, so the
    // track rides exactly the water everything else is riding.
    const sea = this.ocean ? this.ocean.material.uniforms : null;
    const borrow = (name, fallback) => (sea && sea[name] ? sea[name] : fallback);
    this.trackMat = new THREE.ShaderMaterial({
      vertexShader: TRACK_VERT,
      fragmentShader: TRACK_FRAG,
      uniforms: {
        uTime: borrow('uTime', { value: 0 }),
        uAmp: borrow('uAmp', { value: 2.9 }),
        uSteep: borrow('uSteep', { value: 1 }),
        uWave: borrow('uWave', { value: [] }),
        uWaveB: borrow('uWaveB', { value: [] }),
        uFogColor: borrow('uFogColor', { value: new THREE.Color(0x0b1a2b) }),
        uFogDensity: borrow('uFogDensity', { value: 0.00005 }),
        uLife: { value: LIFE },
        uFoam: { value: new THREE.Color(0xe8f1fa) },
      },
      transparent: true,
      depthWrite: false,
      // Both sides. The ribbon is laid across the track by hand and its winding
      // follows whichever way the fish happened to be running -- and a track
      // is water anyway, which is as visible from under it as over it.
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.track = new THREE.Mesh(g, this.trackMat);
    this.track.frustumCulled = false;
    this.track.renderOrder = 2;
    scene.add(this.track);
  }

  park(from) {
    const d = this.dummy;
    d.position.set(0, -20000, 0);
    d.quaternion.identity();
    d.scale.setScalar(0.001);
    d.updateMatrix();
    for (let i = from; i < this.max; i++) {
      this.mesh.setMatrixAt(i, d.matrix);
      this.screws.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.screws.instanceMatrix.needsUpdate = true;
  }

  /**
   * Take this frame's torpedoes: `[{ i, x, z, h }]` in world coordinates.
   *
   * The track is laid here rather than in the shader because it is a record of
   * where the weapon has been, and only the client that has been watching it
   * knows that. Points go down every few metres of run, so a fish crossing the
   * screen leaves a rope and one running away leaves a line.
   */
  update(dt, list, seaAt = null) {
    this.clock += dt;
    const live = new Set();
    let n = 0;
    for (const tp of list) {
      live.add(tp.i);
      let tr = this.tracks.get(tp.i);
      if (!tr) {
        tr = { pts: [], slot: -1 };
        this.tracks.set(tp.i, tr);
      }
      const last = tr.pts[tr.pts.length - 1];
      if (!last || Math.hypot(tp.x - last.x, tp.z - last.z) >= STEP_M) {
        tr.pts.push({ x: tp.x, z: tp.z, t: this.clock });
        if (tr.pts.length > POINTS) tr.pts.shift();
      }
      tr.head = tp;
      // The fish herself: running at set depth with the top of her awash, laid
      // along her own course.
      if (n < this.max) {
        // Running just under the surface with her back awash. A torpedo set
        // for a battleship ran ten or fifteen feet down and showed nothing but
        // its track; one set for a destroyer ran shallow enough to see, and
        // that is the one worth drawing.
        const y = (seaAt ? seaAt(tp.x, tp.z) : 0) - 0.26;
        const d = this.dummy;
        d.position.set(tp.x, y, tp.z);
        d.rotation.set(0, tp.h, 0);
        d.scale.setScalar(1);
        d.updateMatrix();
        this.mesh.setMatrixAt(n, d.matrix);
        // The screws, turning. At two hundred revolutions a minute nobody can
        // see a blade, so this is a blur disc that spins slowly enough to read.
        d.rotation.set(0, tp.h, this.clock * 9);
        d.updateMatrix();
        this.screws.setMatrixAt(n, d.matrix);
        tr.slot = n;
        n++;
      }
    }
    this.park(n);

    // A track outlives its torpedo: she detonated or ran out of fuel, and the
    // rope of bubbles she left is still on the water.
    for (const [id, tr] of this.tracks) {
      if (!live.has(id)) {
        tr.head = null;
        const last = tr.pts[tr.pts.length - 1];
        if (!last || this.clock - last.t > LIFE) { this.tracks.delete(id); continue; }
      }
      while (tr.pts.length && this.clock - tr.pts[0].t > LIFE) tr.pts.shift();
      if (!tr.pts.length && !tr.head) this.tracks.delete(id);
    }
    this.writeTracks();
  }

  writeTracks() {
    const pos = this.trackGeo.attributes.position.array;
    const age = this.trackGeo.attributes.aAge.array;
    const run = this.trackGeo.attributes.aRun.array;
    let slot = 0;
    let used = 0;
    for (const tr of this.tracks.values()) {
      if (slot >= this.max) break;
      // The live head counts as the newest point, so the rope starts at the
      // screws instead of at whatever point was last laid down -- otherwise
      // there is a gap of open water between the fish and her own track.
      const pts = tr.head
        ? [...tr.pts, { x: tr.head.x, z: tr.head.z, t: this.clock }]
        : tr.pts;
      if (pts.length < 2) { slot++; continue; }
      const base = slot * POINTS * 2;
      // Astern of the head first, so `aRun` counts backwards along the rope
      // the way it does behind a ship.
      const headX = tr.head ? tr.head.x : pts[pts.length - 1].x;
      const headZ = tr.head ? tr.head.z : pts[pts.length - 1].z;
      let acc = 0;
      for (let i = 0; i < POINTS; i++) {
        // Walk from the newest point back. Beyond the end of the track every
        // remaining vertex is pinned to the oldest one, which collapses the
        // spare quads to nothing rather than leaving them at the origin.
        const k = Math.max(0, pts.length - 1 - i);
        const p = pts[k];
        const prev = pts[Math.max(0, k - 1)];
        const nx = pts[Math.min(pts.length - 1, k + 1)];
        // Which way the track is running here, so the ribbon can be laid
        // across it.
        let tx = nx.x - prev.x;
        let tz = nx.z - prev.z;
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl; tz /= tl;
        if (i > 0) acc += Math.hypot(p.x - pts[Math.min(pts.length - 1, k + 1)].x,
          p.z - pts[Math.min(pts.length - 1, k + 1)].z);
        const a = base + i * 2;
        pos[a * 3] = p.x + tz * HALF;
        pos[a * 3 + 1] = 0;
        pos[a * 3 + 2] = p.z - tx * HALF;
        pos[(a + 1) * 3] = p.x - tz * HALF;
        pos[(a + 1) * 3 + 1] = 0;
        pos[(a + 1) * 3 + 2] = p.z + tx * HALF;
        const old = this.clock - p.t;
        age[a] = old;
        age[a + 1] = old;
        const r = Math.hypot(p.x - headX, p.z - headZ);
        run[a] = r;
        run[a + 1] = r;
      }
      slot++;
      used = slot;
    }
    this.trackGeo.setDrawRange(0, Math.max(0, used * (POINTS - 1) * 6));
    this.trackGeo.attributes.position.needsUpdate = true;
    this.trackGeo.attributes.aAge.needsUpdate = true;
    this.trackGeo.attributes.aRun.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.screws);
    this.scene.remove(this.track);
    this.mesh.geometry.dispose();
    this.screws.geometry.dispose();
    this.trackGeo.dispose();
    this.mat.dispose();
    this.screwMat.dispose();
    this.trackMat.dispose();
  }
}
