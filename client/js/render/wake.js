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
// Only the last of those is white. The other three are water — sloping water,
// which is seen because it catches the sky and the sun at angles the sea round
// it does not. So this is not a foam decal laid over the ocean: it is a patch
// of the same surface. It is displaced by the ocean's own Gerstner function,
// from the ocean's own uniforms, in its own vertex stage; it adds the wake's
// wave systems to the surface normal; and it draws only the *difference* those
// make to the shading. Where there is no wake left, the difference is nothing
// and the patch is invisible — which is what makes the join seamless. There is
// no join.
//
// The trail is laid in the world rather than towed behind the hull, so it
// stays where the ship has been: put the helm over and the wake curves astern
// the way it should, instead of swinging round with her like a tail.

import * as THREE from '../../../vendor/three.module.js';
import { WAVE_GLSL } from './ocean.js';

// How far she runs between trail points, and how many are kept.
const STEP_M = 26;
const POINTS = 56;
// How many vertices across the ribbon. Two was enough when this was a flat
// decal; a sheet that has to follow a swell needs enough of them to bend.
const COLS = 13;
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
attribute vec2 aTan;       // which way she was heading here, in world xz
varying float vAge;
varying float vSide;
varying float vSpeed;
varying float vHalf;
varying float vRun;
varying vec2 vTan;
varying float vDist;
varying vec3 vWorld;
varying vec3 vSea;         // the ocean's own normal under this pixel
${WAVE_GLSL}

void main() {
  vAge = aAge;
  vSide = aSide;
  vSpeed = aSpeed;
  vHalf = aHalf;
  vRun = aRun;
  vTan = aTan;

  // The vertex arrives as the wave *parameter* that lands where this piece of
  // wake belongs, so displacing it here puts it exactly on the sea — the same
  // sea, from the same numbers, at the same instant. Nothing is matched up
  // afterwards because nothing was ever apart.
  vec3 nrm;
  float fold;
  vec3 d = gerstner(position.xz, nrm, fold);
  vec3 world = position + d;
  // A hand's breadth clear of it, growing with range: the ocean is a mesh, and
  // far off it is a coarse one whose triangles cut chords under the crests they
  // are meant to follow. Analytic water and drawn water part company out there,
  // and the drawn water wins the depth test.
  float dist = length(world - cameraPosition);
  world.y += min(0.12 + dist * 0.0035, 5.0);

  vWorld = world;
  vSea = nrm;
  vDist = dist;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const TRAIL_FRAG = /* glsl */`
uniform float uLife;
uniform vec3 uFoam;
uniform float uOpacity;
uniform float uBeam;
uniform float uStern;      // how far aft of the stem her screws are
// Borrowed from the ocean, so the wake is lit by whatever is lighting the sea.
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uSkyTint;
uniform vec3 uDeep;
uniform vec3 uFogColor;
uniform float uSpecular;
uniform float uFogDensity;
varying float vAge;
varying float vSide;
varying float vSpeed;
varying float vHalf;
varying float vRun;
varying vec2 vTan;
varying float vDist;
varying vec3 vWorld;
varying vec3 vSea;

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

// How brightly a surface of this normal throws the sun back at the eye.
float lobe(vec3 n, vec3 l, vec3 v, float rough) {
  vec3 h = normalize(l + v);
  float ndh = clamp(dot(n, h), 0.0, 1.0);
  float a2 = rough * rough * rough * rough;
  float d = a2 / max(3.14159 * pow(ndh * ndh * (a2 - 1.0) + 1.0, 2.0), 1e-5);
  return d * clamp(dot(n, l) * 0.5 + 0.5, 0.0, 1.0);
}
float schlick(vec3 n, vec3 v) {
  return 0.02 + 0.98 * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
}

void main() {
  float age = vAge / uLife;
  if (age > 1.0) discard;
  float s = abs(vSide);
  // Where this pixel is in metres off her track, which is what all three wake
  // systems are actually sized in. The ribbon widens astern, so the same s
  // means very different water at the stern and a mile back.
  float m = s * vHalf;
  float sgn = sign(vSide + 1e-6);

  vec3 toEye = cameraPosition - vWorld;
  float dcam = length(toEye);
  vec3 v = toEye / max(dcam, 1e-4);
  vec3 l = normalize(uLightDir);
  vec3 sea = normalize(vSea);

  // ---- her wave systems ----------------------------------------------------
  // Both are set by her speed alone. The transverse spacing is 2*pi*V^2/g --
  // sixty-five metres at twenty knots, a hundred and fifty at thirty -- and the
  // diverging waves are the shorter system, about two thirds of it.
  float lam = clamp(6.2831853 * vSpeed * vSpeed / 9.81, 9.0, 260.0);
  float kT = 6.2831853 / lam;
  float kD = 6.2831853 / (lam * 0.66);

  // Nothing survives for ever. The waves go long before the foam does: they are
  // water, and water spreads its energy out until there is none of it anywhere.
  // ...and how hard she is pushing. A ship at steerage way makes almost nothing;
  // one at twenty knots is throwing a wave a couple of metres high off her bow.
  float drive = clamp(vSpeed / 9.0, 0.0, 1.5);
  // ...and the ribbon's forward end is her stem, where there is no wave yet. It
  // builds over her own length. Without that the sheet starts at full strength
  // on a straight line drawn across the water ahead of her, which is the one
  // edge in the whole thing that would give the trick away.
  float lead = smoothstep(0.0, uStern * 0.62, vRun);
  float alive = (1.0 - smoothstep(0.05, 0.85, age))
              * clamp(vSpeed / 3.5, 0.0, 1.0) * drive * lead;

  // The diverging system: the feathers that run out and back from the bow at an
  // angle to her track, ending on Kelvin's arms. They travel outward, so the
  // pattern stands still relative to her and sweeps across the water as she
  // goes on -- which is exactly what it does off a real bow.
  //   phase = kD * (run*cos(phi) + |s|*sin(phi)), phi the way they run.
  const float CP = 0.82, SP = 0.58;      // cos/sin of about thirty-five degrees
  float phD = kD * (vRun * CP + m * SP);
  // Strongest along the arm and dying inside it and outside it.
  // Normalised so 1 is Kelvin's arm. Near the stem the arm has not opened out
  // yet, so the scale there is her own beam -- the bow wave's shoulder stands
  // off her side, not under her keel, and a scale any smaller draws the
  // moustache inside the hull where it reads as an outline round her.
  float arm = m / max(vRun * ${KELVIN.toFixed(5)} + uBeam * 1.35, 1.0);
  float envD = smoothstep(0.10, 0.72, arm) * (1.0 - smoothstep(0.86, 1.28, arm));
  // A big ship pushes a big wave, and it is bigger at the bow than a mile aft.
  float ampD = uBeam * 0.155 * envD * alive
             * (1.0 - smoothstep(120.0, 1100.0, vRun)) * 0.85;

  // The transverse system: arcs between the arms, spaced by her speed. They bow
  // away from her, so the phase runs on the distance from the ship rather than
  // straight down the track.
  float rad = sqrt(vRun * vRun + m * m * 0.85);
  float phT = kT * rad;
  float envT = (1.0 - smoothstep(0.35, 1.02, arm)) * smoothstep(uStern * 0.25, uStern * 0.9, vRun);
  float ampT = uBeam * 0.105 * envT * alive * (1.0 - smoothstep(90.0, 780.0, vRun));

  // Slopes, in the track's own frame: along her, and out from her.
  float dAlong = ampD * cos(phD) * kD * CP + ampT * cos(phT) * kT * (vRun / max(rad, 1.0));
  float dOut   = ampD * cos(phD) * kD * SP + ampT * cos(phT) * kT * (m * 0.85 / max(rad, 1.0));
  // ...and out into the world, using the heading she was on when she laid this.
  vec2 tan2 = normalize(vTan);
  vec2 nrm2 = vec2(tan2.y, -tan2.x) * sgn;
  vec2 slope = tan2 * dAlong + nrm2 * dOut;
  // Fine ripple over the whole disturbed patch: the water she has been through
  // is never smooth, whatever the two big systems are doing.
  vec2 rp = vec2(m * 0.16, vRun * 0.16 + vAge * 0.9);
  float ripple = (fbm(rp) - 0.5) * 0.24 * alive * (1.0 - smoothstep(0.0, 1.05, arm));
  slope += vec2(ripple, ripple * 0.6);

  vec3 n = normalize(sea + vec3(-slope.x, 0.0, -slope.y));


  // ---- what that difference looks like -------------------------------------
  // The sea under this pixel has already been drawn. All that is wanted here is
  // what the wake changes about it: a face turned into the light glints, a face
  // turned away goes dark and blue. Draw the difference and nothing else, and
  // there is no edge to the wake because there is no wake where it is nothing.
  float rough = 0.075 + 0.30 * clamp(dcam / 2500.0, 0.0, 1.0);
  float fSea = schlick(sea, v);
  float fWake = schlick(n, v);
  // The sun's lobe, weighted by how much of it the surface is reflecting at
  // all -- the same arithmetic the ocean uses, so a glint on a wake crest and a
  // glint on a swell crest are the same brightness for the same tilt.
  float dGlint = lobe(n, l, v, rough) * fWake - lobe(sea, l, v, rough) * fSea;
  float dFres = fWake - fSea;

  vec3 add = uLightColor * max(dGlint, 0.0) * uSpecular * 0.55 * 8.0;
  // Sky is brighter than the body of the water, so more Fresnel is brighter and
  // less is darker. The bright half is added; the dark half is blended, since a
  // frame buffer cannot be given a negative amount of light.
  add += max(dFres, 0.0) * uSkyTint * 1.15;
  float aDark = clamp(-dFres, 0.0, 1.0) * 0.75;

  // ---- the turbulent trail -------------------------------------------------
  // Churned water: solid white behind the screws, spreading and thinning as it
  // is left behind. It opens out slowly -- it is dead water, not a wave system,
  // so it does not follow Kelvin's angle out to the horizon. And it does not
  // fade evenly: it breaks into patches, and that break-up is most of what
  // says the sea is moving under it.
  // Nothing is churned until her screws have been over it, and the clock on the
  // foam starts there rather than at the stem: the water just astern of the
  // transom is the newest in the wake, however long ago her bow went past it.
  float runS = max(vRun - uStern, 0.0);
  float tSt = max(vAge - uStern / max(vSpeed, 2.0), 0.0);
  float ageF = tSt / uLife;
  float coreW = uBeam * 1.15 + runS * 0.05;
  float core = (1.0 - smoothstep(coreW * 0.40, coreW, m))
             * (1.0 - smoothstep(0.15, 1.0, pow(ageF, 0.85)))
             * smoothstep(uStern * 0.55, uStern * 1.15, vRun);
  // The noise is anchored to the age of the water and to metres across it,
  // rather than to the screen or to the ribbon, so a patch of foam keeps its
  // size and its shape while it drifts astern and dies.
  vec2 np = vec2(m * 0.045 * sgn, tSt * 0.45);
  float churn = fbm(np * 1.6) * 0.65 + fbm(np * 5.5 + 11.0) * 0.35;
  // Directly astern of the transom the water is not patchy foam yet, it is a
  // solid boil off the screws -- it takes ten seconds or so to break up. Lift
  // the noise floor over that stretch so the trail leaves the ship joined to
  // her instead of starting a boat-length behind.
  float boil = 1.0 - smoothstep(1.5, 8.0, tSt);
  // The window is kept wide and the bias low on purpose: bias the noise up far
  // enough and the smoothstep saturates, the break-up disappears, and the wake
  // stops being churned water and becomes a white stroke painted on the sea.
  // The boil is laid over the top as its own term rather than folded into the
  // bias, so it can be near solid without flattening everything else with it --
  // and even it is torn at the edges.
  float mask = smoothstep(0.30, 0.86, churn + 0.18 * (1.0 - ageF));
  mask = max(mask, boil * smoothstep(0.16, 0.54, churn + 0.22));
  core *= mask;

  // Foam on the wave crests as well: the diverging waves break along their
  // faces where they are steepest, which is what puts the row of white
  // feathers down the outside of a wake rather than a clean line.
  float steepD = abs(ampD) * kD;
  float crestD = smoothstep(0.28, 0.72, steepD) * smoothstep(0.25, 0.95, sin(phD) * 0.5 + 0.5);
  crestD *= smoothstep(0.25, 0.35, churn) * alive;

  // The moustache: the white water the stem throws out and back along the
  // shoulder of the bow wave. It used to be a flat card carried on the hull,
  // which the sea's own crests cut straight through -- the one place the wake
  // and the water visibly disagreed. On the ribbon it rides the swell with
  // everything else.
  float bowT = 1.0 - smoothstep(0.10, 1.15, vRun / max(uStern, 1.0));
  float shoulder = smoothstep(0.16, 0.58, arm) * (1.0 - smoothstep(0.66, 1.10, arm));
  float froth = fbm(vec2(m * 0.10 * sgn, vRun * 0.09 - vAge * 1.6));
  float moustache = bowT * shoulder * clamp(vSpeed / 6.0, 0.0, 1.0)
                  * smoothstep(0.34, 0.70, froth + 0.22);
  // ...and the sheet of water right at the stem, which is solid rather than lacy.
  float stem = (1.0 - smoothstep(0.0, 0.17, vRun / max(uStern, 1.0)))
             * (1.0 - smoothstep(0.15, 0.78, arm))
             * clamp(vSpeed / 6.0, 0.0, 1.0) * 0.85;

  float foam = clamp(core * 0.92 + crestD * 0.55 + moustache * 0.80 + stem, 0.0, 1.0);
  // Foam is lit by whatever is lighting the sea, so at night it is grey and by
  // day it is white -- the ocean does this too, and by the same arithmetic.
  vec3 white = mix(uSkyTint * 1.35 + uLightColor * 0.20, uFoam,
                   clamp(uSkyTint.r + uSkyTint.g + uSkyTint.b, 0.0, 1.0));

  // Nothing at the very edge of the ribbon, or the ribbon is what you see --
  // and feathered well in from it, because a wake seen from a mile off and
  // nearly edge-on is a few pixels tall.
  float edge = 1.0 - smoothstep(0.86, 1.0, s);
  edge *= smoothstep(0.0, 0.02, vAge);
  foam *= edge * uOpacity;
  aDark *= edge * uOpacity;
  add *= edge * uOpacity;

  // Hazed with range like everything else on the water.
  float fog = 1.0 - exp(-pow(dcam * uFogDensity, 2.0));
  float clear = clamp(1.0 - fog, 0.0, 1.0);
  add *= clear;

  float a = clamp(foam + aDark * (1.0 - foam), 0.0, 1.0);
  if (a < 0.003 && dot(add, add) < 1e-6) discard;

  // Premultiplied: the colour already carries its own coverage, which is what
  // lets one pass both add light to a wave face and take it off the one behind.
  vec3 rgb = mix(white, uFogColor, fog) * foam
           + mix(uDeep, uFogColor, fog) * aDark * (1.0 - foam)
           + add;
  gl_FragColor = vec4(rgb, a);
}
`;

/**
 * One ship's wake. Told where she is each frame; lays the whole thing -- the
 * moustache at her stem, the two wave systems, and the churn off her screws --
 * as one sheet of water on one surface.
 *
 * `ocean` is not optional in spirit: the ribbon is displaced by that ocean's
 * wave train, from that ocean's own uniform objects, so the two cannot drift
 * apart however either is later retuned.
 */
export class Wake {
  constructor(scene, { length = 120, beam = 14, foam = 0xdfeaf6, ocean = null } = {}) {
    this.scene = scene;
    this.length = length;
    this.beam = beam;
    this.ocean = ocean;
    this.bowOffset = length * 0.45;
    this.pts = [];          // {x, z, t, v} laid down along her track
    this.clock = 0;
    this.opacity = 1;
    this.buildTrail(scene, foam);

  }

  /** The ribbon of churned water she leaves in the world behind her. */
  buildTrail(scene, foam) {
    const n = POINTS;
    const cols = COLS;
    const verts = n * cols;
    const pos = new Float32Array(verts * 3);
    const age = new Float32Array(verts);
    const side = new Float32Array(verts);
    const speed = new Float32Array(verts);
    const halfw = new Float32Array(verts);
    const run = new Float32Array(verts);
    const tang = new Float32Array(verts * 2);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < cols; j++) side[i * cols + j] = (j / (cols - 1)) * 2 - 1;
    }
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        idx.push(a, b, d, a, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
    geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    geo.setAttribute('aHalf', new THREE.BufferAttribute(halfw, 1));
    geo.setAttribute('aRun', new THREE.BufferAttribute(run, 1));
    geo.setAttribute('aTan', new THREE.BufferAttribute(tang, 2));
    geo.setIndex(idx);
    this.trailGeo = geo;

    // The wave train, the clock, the light and the air are all the ocean's own
    // uniform objects, handed over rather than copied. Retune the sea and the
    // wake follows in the same frame, because it is reading the same numbers.
    const sea = this.ocean ? this.ocean.material.uniforms : null;
    const borrow = (name, fallback) => (sea && sea[name] ? sea[name] : fallback);

    this.trailMat = new THREE.ShaderMaterial({
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      uniforms: {
        uTime: borrow('uTime', { value: 0 }),
        uAmp: borrow('uAmp', { value: 2.9 }),
        uSteep: borrow('uSteep', { value: 1 }),
        uWave: borrow('uWave', { value: [] }),
        uWaveB: borrow('uWaveB', { value: [] }),
        uLightDir: borrow('uLightDir', { value: new THREE.Vector3(0.35, 0.42, -1) }),
        uLightColor: borrow('uLightColor', { value: new THREE.Color(0xcfe1f8) }),
        uSkyTint: borrow('uSkyTint', { value: new THREE.Color(0x1d3d5c) }),
        uDeep: borrow('uDeep', { value: new THREE.Color(0x040e19) }),
        uFogColor: borrow('uFogColor', { value: new THREE.Color(0x0b1a2b) }),
        uSpecular: borrow('uSpecular', { value: 1 }),
        uFogDensity: borrow('uFogDensity', { value: 0.00005 }),
        uLife: { value: LIFE },
        uOpacity: { value: 1 },
        uBeam: { value: this.beam },
        uStern: { value: this.length },
        uFoam: { value: new THREE.Color(foam) },
      },
      transparent: true,
      depthWrite: false,
      // Premultiplied alpha: the shader hands over colour that already carries
      // its own coverage, which is the only way one pass can both add a glint
      // to a wave face and darken the trough beside it.
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
    });
    this.trail = new THREE.Mesh(geo, this.trailMat);
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 2;
    this.trail.visible = false;
    scene.add(this.trail);
  }

  /**
   * Where she is now. `ocean` is asked for the wave parameter that lands under
   * each piece of the trail, so the shader's own displacement puts the sheet
   * exactly on the water rather than near it.
   */
  update(dt, x, z, heading, speed, ocean) {
    if (ocean && !this.ocean) this.ocean = ocean;
    const sea = ocean || this.ocean;
    this.clock += dt;

    // pts[0] is the live head, which stays on her stern; everything behind it
    // is water she has already been through and does not move again. The head
    // is measured against the last fixed piece rather than against itself —
    // measure it against itself and it is always a single frame away, and the
    // trail never gets past its first point.
    // The head of the ribbon rides her stem, not her transom. Every wave she
    // makes is made at the bow -- the diverging feathers start there and run
    // out and back past her side -- so a ribbon that begins at the stern has no
    // water in it where the side waves actually are.
    const bx = x + Math.sin(heading) * this.bowOffset;
    const bz = z + Math.cos(heading) * this.bowOffset;
    const cur = { x: bx, z: bz, t: this.clock, v: Math.abs(speed), h: heading };
    if (this.pts.length < 2) {
      this.pts = [cur, { ...cur }];
    } else if (Math.hypot(bx - this.pts[1].x, bz - this.pts[1].z) >= STEP_M) {
      this.pts.unshift(cur);
      if (this.pts.length > POINTS) this.pts.length = POINTS;
    } else {
      this.pts[0] = cur;
    }

    if (this.pts.length < 3) { this.trail.visible = false; return; }
    this.trail.visible = true;

    const pos = this.trailGeo.attributes.position;
    const age = this.trailGeo.attributes.aAge;
    const spd = this.trailGeo.attributes.aSpeed;
    const hlf = this.trailGeo.attributes.aHalf;
    const rn = this.trailGeo.attributes.aRun;
    const tg = this.trailGeo.attributes.aTan;
    const n = POINTS;
    const cols = COLS;

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
      // Half again as wide as Kelvin's arm. The diverging waves live *on* the
      // arm, and a ribbon that ends there puts them under its own edge fade --
      // which is why they were invisible however hard they were driven.
      const half = Math.max(this.beam * 1.95,
        (this.beam * 1.35 + Math.min(run, RUN_CAP) * KELVIN) * 1.45);
      // Which way she was heading here, and the beam either side of it.
      const tx = Math.sin(p.h);
      const tz = Math.cos(p.h);
      const nx = Math.cos(p.h);
      const nz = -Math.sin(p.h);
      // The wave parameter that lands on her track here. The cross offset is
      // carried in parameter space too: it is within a metre of the world one
      // at these steepnesses, and it lets the sheet stretch with the swell
      // instead of being pegged flat across it.
      const par = sea ? sea.paramAt(p.x, p.z) : { x: p.x, z: p.z };
      for (let j = 0; j < cols; j++) {
        const t = (j / (cols - 1)) * 2 - 1;
        const off = half * t;
        const k = i * cols + j;
        pos.setXYZ(k, par.x + nx * off, 0, par.z + nz * off);
        age.setX(k, a);
        spd.setX(k, p.v);
        hlf.setX(k, half);
        rn.setX(k, run);
        tg.setXY(k, tx, tz);
      }
    }
    pos.needsUpdate = true;
    age.needsUpdate = true;
    spd.needsUpdate = true;
    hlf.needsUpdate = true;
    rn.needsUpdate = true;
    tg.needsUpdate = true;
  }

  setOpacity(v) {
    this.opacity = v;
    this.trailMat.uniforms.uOpacity.value = v;
  }

  dispose() {
    this.trail.removeFromParent();
    this.trailGeo.dispose();
  }
}
