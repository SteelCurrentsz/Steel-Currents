// The wake.
//
// A ship at sea leaves four things behind her, and they are four different
// things rather than one white smear:
//
//   the bow wave, thrown up where the stem parts the water;
//   the diverging waves, running out from the bow at nineteen and a half
//     degrees whatever her speed — Kelvin's angle, which falls out of deep
//     water dispersion and is why every wake looks alike from the air;
//   the transverse waves, arcs between those arms whose spacing is set by her
//     speed alone, 2πV²/g apart;
//   and the turbulent trail, the churned water off the screws, which is the
//     only part that is actually foam and the only part that persists.
//
// The trail is laid in the world rather than towed behind the hull, so it
// stays where the ship has been: put the helm over and the wake curves astern
// the way it should, instead of swinging round with her like a tail.

import * as THREE from '../../../vendor/three.module.js';

// How far she runs between trail points, and how many are kept.
const STEP_M = 26;
const POINTS = 56;
// How long a piece of wake stays on the water.
const LIFE = 105;
// Kelvin's half-angle, which is what the ribbon is laid out to.
const KELVIN = Math.tan(19.47 * Math.PI / 180);
// How far astern the ribbon goes on spreading. It ought to spread for ever —
// that is what Kelvin's angle means — but a mile astern that is a ribbon a
// third of a mile wide, which is a great deal of empty water to shade for a
// wave train that has faded out by then. Past this it runs parallel.
const RUN_CAP = 420;

const TRAIL_VERT = /* glsl */`
attribute float aAge;      // seconds since this piece of water was churned
attribute float aSide;     // -1 to port, +1 to starboard
attribute float aSpeed;    // how fast she was going when she made it
attribute float aHalf;     // half the ribbon's width here, in metres
attribute float aRun;      // how far astern of her this piece is, in metres
varying float vAge;
varying float vSide;
varying float vSpeed;
varying float vHalf;
varying float vRun;
varying float vDist;

void main() {
  vAge = aAge;
  vSide = aSide;
  vSpeed = aSpeed;
  vHalf = aHalf;
  vRun = aRun;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDist = length(wp.xyz - cameraPosition);
  // The sea is a mesh, and a long way off it is a coarse one: its triangles cut
  // chords under the crests they are meant to follow, so water that ought to be
  // below the foam ends up above it and eats holes in the wake. Lift the sheet
  // with range — a hand's breadth close to, a few metres a mile off, which at a
  // mile is a fifth of a degree and cannot be seen.
  wp.y += min(0.35 + vDist * 0.0045, 6.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const TRAIL_FRAG = /* glsl */`
uniform float uTime;
uniform float uLife;
uniform vec3 uFoam;
uniform float uOpacity;
uniform float uBeam;
varying float vAge;
varying float vSide;
varying float vSpeed;
varying float vHalf;
varying float vRun;
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
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.09; a *= 0.5; }
  return v;
}

void main() {
  float age = vAge / uLife;
  if (age > 1.0) discard;
  float s = abs(vSide);
  // Where this pixel is in metres off her track, which is what all three wake
  // systems are actually sized in. The ribbon widens astern, so the same s
  // means very different water at the stern and a mile back.
  float m = s * vHalf;

  // ---- the turbulent trail -------------------------------------------------
  // Churned water: solid white behind the screws, spreading and thinning as it
  // is left behind. It opens out slowly — it is dead water, not a wave system,
  // so it does not follow Kelvin's angle out to the horizon. And it does not
  // fade evenly: it breaks into patches, and that break-up is most of what
  // says the sea is moving under it.
  float coreW = uBeam * 1.15 + vRun * 0.05;
  float core = (1.0 - smoothstep(coreW * 0.40, coreW, m))
             * (1.0 - smoothstep(0.15, 1.0, pow(age, 0.85)));
  // The noise is anchored to the age of the water and to metres across it,
  // rather than to the screen or to the ribbon, so a patch of foam keeps its
  // size and its shape while it drifts astern and dies.
  vec2 np = vec2(m * 0.045 * sign(vSide), vAge * 0.45);
  float churn = fbm(np * 1.6) * 0.65 + fbm(np * 5.5 + 11.0) * 0.35;
  // Directly astern of the transom the water is not patchy foam yet, it is a
  // solid boil off the screws — it takes ten seconds or so to break up. Lift
  // the noise floor over that stretch so the trail leaves the ship joined to
  // her instead of starting a boat-length behind.
  float boil = 1.0 - smoothstep(2.0, 12.0, vAge);
  // The window is kept wide and the bias low on purpose: bias the noise up far
  // enough and the smoothstep saturates, the break-up disappears, and the wake
  // stops being churned water and becomes a white stroke painted on the sea.
  core *= smoothstep(0.30, 0.86, churn + 0.18 * (1.0 - age) + boil * 0.62);

  // ---- the diverging waves -------------------------------------------------
  // Kelvin's arms. The ribbon is laid out to spread at his angle, so they ride
  // its edges; they are crests of water rather than foam, so they hold their
  // brightness far longer than the churn does.
  float armW = uBeam * 1.4 + vRun * 0.035;
  float arm = exp(-pow((m - vHalf * 0.84) / armW, 2.0));
  // Feathered: each arm is a train of short crests, not a drawn line. Broken up
  // with noise rather than a sine — a sine lays an even comb across the wake,
  // and an even comb is the one thing no wake has ever had.
  float feather = 0.42 + 0.58 * fbm(vec2(vRun * 0.02, sign(vSide) * 3.0 + vAge * 0.06));
  arm *= feather * (1.0 - smoothstep(0.25, 1.0, age));

  // ---- the transverse waves ------------------------------------------------
  // Arcs between the arms, spaced by her speed alone: 2*pi*V^2/g, which at
  // twenty knots is about sixty-five metres and at thirty is a hundred and
  // fifty. Drawn in the age of the water, which is distance over speed.
  float lam = max(6.2831853 * vSpeed * vSpeed / 9.81, 8.0);
  float phase = vAge * vSpeed / lam;
  float trans = pow(max(0.0, sin(phase * 6.2831853)), 5.0);
  // They are crests catching the light, not foam: faint, and gone well before
  // the churn is.
  trans *= (1.0 - smoothstep(0.0, 0.58, s)) * (1.0 - smoothstep(0.10, 0.62, age));
  trans *= 0.55 + 0.45 * fbm(vec2(phase * 1.4, m * 0.02));

  // The churn is the wake. The wave systems are there to be caught in the
  // light at the right moment, not to be a second white stripe.
  float a = clamp(core * 0.92 + arm * 0.30 + trans * 0.15, 0.0, 1.0);
  // Nothing at the very edge of the ribbon, or the ribbon is what you see —
  // and feathered well in from it, because a wake seen from a mile off and
  // nearly edge-on is a few pixels tall, and a hard edge there reads as a
  // painted slab rather than as water.
  a *= 1.0 - smoothstep(0.35, 1.0, s);
  a *= smoothstep(0.0, 0.02, vAge);
  // She has to be moving to leave anything.
  a *= clamp(vSpeed / 4.0, 0.0, 1.0) * uOpacity;
  // Eased off with range. Air and haze do this to real white water, and there
  // is a rendering reason as well: a mile off, the ribbon is seen so nearly
  // edge-on that it is a few dozen pixels tall, and every gradient in it is
  // squeezed into those. Held at full strength it stops being water and
  // becomes a white rectangle laid on the sea.
  a *= 1.0 / (1.0 + vDist / 900.0);
  if (a < 0.004) discard;

  vec3 col = mix(uFoam * 0.72, uFoam, core);
  gl_FragColor = vec4(col, a);
}
`;

const BOW_FRAG = /* glsl */`
uniform float uTime;
uniform float uSpeed;
uniform vec3 uFoam;
varying vec2 vUv;

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
  // uv.y runs from the stem aft, uv.x across her.
  float along = vUv.y;
  float side = abs(vUv.x - 0.5) * 2.0;

  // The moustache: white water thrown out and back from the stem, standing
  // clear of the hull and falling away aft.
  float v = clamp(uSpeed / 15.0, 0.0, 1.4);
  float spread = 0.10 + along * (0.55 + 0.35 * v);
  float band = exp(-pow((side - spread) / (0.10 + along * 0.16), 2.0));
  band *= (1.0 - smoothstep(0.25, 1.0, along));

  vec2 np = vec2(vUv.x * 6.0, along * 7.0 - uTime * 2.6);
  float froth = fbm(np * 1.4) * 0.6 + fbm(np * 4.4 + 5.0) * 0.4;
  float a = band * smoothstep(0.26, 0.68, froth + 0.25);
  // And the sheet of water right at the stem, which is solid rather than lacy.
  a = max(a, (1.0 - smoothstep(0.0, 0.16, along)) * (1.0 - smoothstep(0.0, 0.34, side)) * 0.85);
  a *= clamp(uSpeed / 5.0, 0.0, 1.0);
  if (a < 0.006) discard;
  gl_FragColor = vec4(uFoam, a * 0.9);
}
`;

/**
 * One ship's wake. Told where she is each frame; lays her trail, and keeps the
 * bow wave under her stem.
 */
export class Wake {
  constructor(scene, { length = 120, beam = 14, foam = 0xdfeaf6, trail = true } = {}) {
    this.scene = scene;
    this.length = length;
    this.beam = beam;
    this.pts = [];          // {x, z, t, v} laid down along her track
    this.clock = 0;
    this.opacity = 1;
    this.hasTrail = trail;

    // ---- the trail ---------------------------------------------------------
    if (trail) this.buildTrail(scene, foam);

    // ---- the bow wave ------------------------------------------------------
    // Carried with the hull: unlike the trail, it is made new every moment and
    // has no memory of where she has been.
    const bowGeo = new THREE.PlaneGeometry(beam * 5.0, length * 0.72, 1, 1);
    bowGeo.rotateX(-Math.PI / 2);
    bowGeo.translate(0, 0, -length * 0.36);
    this.bowMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main() { vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: BOW_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 0 },
        uFoam: { value: new THREE.Color(foam) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.bow = new THREE.Mesh(bowGeo, this.bowMat);
    this.bow.frustumCulled = false;
    this.bow.renderOrder = 3;
    this.bow.visible = false;
  }

  /** The ribbon of churned water she leaves in the world behind her. */
  buildTrail(scene, foam) {
    const n = POINTS;
    const pos = new Float32Array(n * 2 * 3);
    const age = new Float32Array(n * 2);
    const side = new Float32Array(n * 2);
    const speed = new Float32Array(n * 2);
    const halfw = new Float32Array(n * 2);
    const run = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; }
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
    geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    geo.setAttribute('aHalf', new THREE.BufferAttribute(halfw, 1));
    geo.setAttribute('aRun', new THREE.BufferAttribute(run, 1));
    geo.setIndex(idx);
    this.trailGeo = geo;

    this.trailMat = new THREE.ShaderMaterial({
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uLife: { value: LIFE },
        uOpacity: { value: 1 },
        uBeam: { value: this.beam },
        uFoam: { value: new THREE.Color(foam) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.trail = new THREE.Mesh(geo, this.trailMat);
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 2;
    this.trail.visible = false;
    scene.add(this.trail);
  }

  /** The bow wave rides on the hull, so it is parented to her. */
  attach(group) {
    group.add(this.bow);
    this.bow.position.set(0, 1.2, this.length * 0.46);
  }

  /**
   * Where she is now. `ocean` is asked for the height of the water under each
   * piece of the trail, so the foam lies on the swell instead of cutting
   * through it.
   */
  update(dt, x, z, heading, speed, ocean) {
    this.clock += dt;
    this.bowMat.uniforms.uTime.value = this.clock;
    this.bowMat.uniforms.uSpeed.value = Math.abs(speed);
    this.bow.visible = Math.abs(speed) > 0.4;

    if (!this.hasTrail) return;

    // pts[0] is the live head, which stays on her stern; everything behind it
    // is water she has already been through and does not move again. The head
    // is measured against the last fixed piece rather than against itself —
    // measure it against itself and it is always a single frame away, and the
    // trail never gets past its first point.
    const cur = { x, z, t: this.clock, v: Math.abs(speed), h: heading };
    if (this.pts.length < 2) {
      this.pts = [cur, { ...cur }];
    } else if (Math.hypot(x - this.pts[1].x, z - this.pts[1].z) >= STEP_M) {
      this.pts.unshift(cur);
      if (this.pts.length > POINTS) this.pts.length = POINTS;
    } else {
      this.pts[0] = cur;
    }

    this.trailMat.uniforms.uTime.value = this.clock;
    if (this.pts.length < 3) { this.trail.visible = false; return; }
    this.trail.visible = true;

    const pos = this.trailGeo.attributes.position;
    const age = this.trailGeo.attributes.aAge;
    const spd = this.trailGeo.attributes.aSpeed;
    const hlf = this.trailGeo.attributes.aHalf;
    const rn = this.trailGeo.attributes.aRun;
    const n = POINTS;

    for (let i = 0; i < n; i++) {
      const spare = i >= this.pts.length;
      const p = this.pts[Math.min(i, this.pts.length - 1)];
      // Vertices past the end of the track are stacked on the last point; age
      // them out of the shader's life so they discard instead of piling into a
      // bright knot at the tail.
      const a = spare ? LIFE + 1 : this.clock - p.t;
      // How far astern this piece is, which is what sets how wide the wake has
      // spread by the time it gets there.
      const run = i * STEP_M;
      const half = Math.max(this.beam * 0.62,
        this.beam * 0.55 + Math.min(run, RUN_CAP) * KELVIN);
      const nx = Math.cos(p.h);
      const nz = -Math.sin(p.h);
      for (const s of [0, 1]) {
        const sgn = s === 0 ? -1 : 1;
        const px = p.x + nx * half * sgn;
        const pz = p.z + nz * half * sgn;
        // Laid on the water itself. What it needs to clear the sea by is a
        // question of how far off it is being looked at, so the shader does it.
        const y = ocean ? ocean.heightAt(px, pz) : 0;
        const k = i * 2 + s;
        pos.setXYZ(k, px, y, pz);
        age.setX(k, a);
        spd.setX(k, p.v);
        hlf.setX(k, half);
        rn.setX(k, run);
      }
    }
    pos.needsUpdate = true;
    age.needsUpdate = true;
    spd.needsUpdate = true;
    hlf.needsUpdate = true;
    rn.needsUpdate = true;
  }

  setOpacity(v) {
    this.opacity = v;
    if (this.hasTrail) this.trailMat.uniforms.uOpacity.value = v;
  }

  dispose() {
    if (this.hasTrail) {
      this.trail.removeFromParent();
      this.trailGeo.dispose();
    }
    this.bow.removeFromParent();
    this.bow.geometry.dispose();
  }
}
