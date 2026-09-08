// The wake, as water.
//
// A wake used to be a sheet drawn over the sea: its own mesh, its own shading,
// lifted a hand's breadth clear of the surface so it would win the depth test.
// However carefully it was shaded it was a thing laid on the water rather than
// the water itself, and from the air that is exactly what it looked like -- a
// white shape floating a little above a sea that was not doing anything.
//
// This is the other way round. Nothing is drawn on the sea at all. What a ship
// leaves behind her is written into a map -- how much the water is lifted or
// pulled down at each point, how much foam is on it, how churned it is -- and
// the ocean reads that map in its own vertex and fragment stages. The surface
// is displaced by it. The ocean's own normals bend round it, its own lighting
// falls on it, its own chop rides over it. There is no wake object in the
// scene and nothing to fit against anything, because the wake is not on the
// water: it is the water.
//
// The map is two square patches of sea carried under the camera:
//
//   near   two kilometres across at a metre or two a texel, for the ship you
//          are standing on and anything close enough to see the bow break;
//   far    sixteen kilometres at sixteen metres, for the rest of the horizon.
//
// Both are re-drawn every frame from the ships' tracks and both are snapped to
// their own texel grid, so the water does not crawl when the camera moves. The
// near one is carried ahead of the eye rather than under it: an orbit camera
// stands astern of the ship it is watching, and a patch centred on the camera
// puts its best detail on the water behind you and the ship herself outside
// it altogether.
//
// What is in the map is four numbers, all of them positive so they can be
// added together where two wakes cross -- which is what water does:
//
//   R  how far the surface is lifted, over WAKE_H metres
//   G  how far it is pulled down, the same
//   B  foam
//   A  disturbance: how churned this water is at all

import * as THREE from '../../../vendor/three.module.js';

/** The metres of lift one full channel of the map stands for. */
export const WAKE_H = 5.0;

/** How wide the two patches are, in metres. */
export const NEAR_M = 2048;
export const FAR_M = 16384;

// Kelvin's half-angle. Every wake on deep water opens at this, whatever the
// ship and whatever her speed: it falls out of the dispersion relation, and it
// is why a wake photographed from the air always looks the same shape.
export const KELVIN = Math.tan((19.47 * Math.PI) / 180);

// How far she runs between the points of her track, and how many are kept.
export const STEP_M = 22;
export const POINTS = 64;
// Vertices across the ribbon. It is a strip of parameter space, not a picture:
// what is drawn into the map is worked out per texel in the fragment stage, so
// the columns only have to be close enough to keep the strip's own edges
// straight where it bends.
const COLS = 9;
/** How long a piece of wake stays on the water, in seconds. */
export const LIFE = 120;
// The ribbon goes on spreading at Kelvin's angle, which a mile astern is a
// ribbon a third of a mile wide. Past this it runs parallel: the wave train
// has faded by then and the rest is a straight band of dead water.
const RUN_CAP = 520;

// The strip is laid out in the world, so a ship that puts her helm over leaves
// her wake curving astern instead of swinging it round with her like a tail.
const RIBBON_VERT = /* glsl */`
attribute float aAge;      // seconds since this piece of water was disturbed
attribute float aSide;     // -1 to port, +1 to starboard
attribute float aSpeed;    // how fast she was going when she made it
attribute float aHalf;     // half the strip's width here, in metres
attribute float aRun;      // how far astern of her stem this is, in metres
attribute float aTail;     // 1 in the body of the strip, 0 at its far end
varying float vAge;
varying float vTail;
varying float vSide;
varying float vSpeed;
varying float vHalf;
varying float vRun;

void main() {
  vAge = aAge;
  vSide = aSide;
  vSpeed = aSpeed;
  vHalf = aHalf;
  vRun = aRun;
  vTail = aTail;
  // Straight into the map's own frame: the camera looking down on it is
  // orthographic, so this is a plan of the sea and nothing else.
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RIBBON_FRAG = /* glsl */`
precision highp float;
uniform float uLife;
uniform float uBeam;
uniform float uStern;      // her length: stem to transom
uniform float uScale;      // metres of lift one channel stands for
uniform float uOpacity;
varying float vAge;
varying float vSide;
varying float vSpeed;
varying float vHalf;
varying float vRun;
varying float vTail;

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
/**
 * Noise for the map.
 *
 * Three octaves and no more. The map holds a metre or two to a texel, so an
 * octave finer than that cannot be stored in it -- what is drawn is one
 * sample of it per texel, and magnified back up on screen that is not lace,
 * it is a field of squares with hard edges. The fine detail is put back per
 * pixel by the ocean, which has as many samples as there are pixels; what
 * belongs here is only what the map can actually carry.
 */
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * vnoise(p); p *= 2.07; a *= 0.5; }
  return v / 0.875;
}

void main() {
  float age = vAge / uLife;
  if (age > 1.0) discard;
  float sgn = sign(vSide + 1e-6);
  float m = abs(vSide) * vHalf;          // metres off her track
  float run = vRun;                      // metres astern of her stem

  // How hard she is pushing. A ship at steerage way makes almost nothing; one
  // at thirty knots is throwing a wave three metres high off her bow.
  float drive = clamp(vSpeed / 8.5, 0.0, 1.4);
  if (drive < 0.02) discard;

  // Kelvin. The arm of the wedge is at m = run * tan(19.47 degrees), and every
  // wave system in here is placed against it. Its apex is her stem: the offset
  // is her own half beam and no more, so the wedge springs from her side and
  // opens astern instead of starting a beam wide with the ship inside it.
  float armM = run * ${KELVIN.toFixed(5)} + uBeam * 0.50;
  float arm = m / max(armM, 1.0);

  // ---- how wide the white water is here -----------------------------------
  //
  // The one curve that gives a wake its shape seen from the air, and the thing
  // the old one had no notion of: white water does not begin at full width. It
  // begins at the cutwater, which is a few feet across, and opens from there
  // -- out to her own side by the time it is abreast of the bridge, a little
  // wider at her quarter, and then spreading slowly astern for as long as the
  // water stays broken. Every term in the foam below is measured against it,
  // so the whole wake comes to a point at her stem.
  float alongHull = clamp(run / max(uStern, 1.0), 0.0, 1.0);
  // Her own half beam at this point of her length: a fine entry over the
  // forward third, parallel middle body, a slight taper into the transom.
  float hullHalf = uBeam * 0.5 * smoothstep(0.0, 0.30, alongHull)
                 * (1.0 - 0.10 * smoothstep(0.72, 1.0, alongHull));
  // How far astern of the transom this water is: nothing at all until she has
  // gone by, and it is only past her that the wash is free to open out.
  float runS = max(run - uStern, 0.0);
  // Sublinear, because a wake broadens quickly just astern of the screws and
  // then hardly at all: linear opening puts a wedge a quarter of a mile wide
  // behind a destroyer.
  float openAft = pow(runS, 0.86) * 0.115;
  // What the stem itself throws. The water she shoulders aside leaves the
  // cutwater and runs out and aft at something like seventeen degrees, so it
  // is a couple of feet of white at the bow and is standing well off her side
  // by the time it is abreast of the bridge. Capped, because past that it is
  // no longer the bow wave breaking but the diverging train, and that is the
  // arm of the wedge lower down rather than the white alongside her.
  float bowOut = min(run * 0.30, uBeam * 0.62);
  // The white lies outboard of her plating rather than against it, and stands
  // further off the further aft it is.
  float spread = max(hullHalf, bowOut) + uBeam * (0.04 + 0.16 * alongHull)
               + openAft;
  // What the mound and the hollows are measured against. They are shapes in
  // the water rather than marks on it, so they are never a hairline.
  float wide = max(spread, uBeam * 0.32);

  // Both wave systems are set by her speed alone. The transverse spacing is
  // 2*pi*V^2/g -- sixty-five metres at twenty knots, a hundred and fifty at
  // thirty -- and the diverging waves are the shorter of the two.
  float lam = clamp(6.2831853 * vSpeed * vSpeed / 9.81, 10.0, 300.0);
  float kT = 6.2831853 / lam;
  float kD = 6.2831853 / (lam * 0.62);

  // Nothing lasts. The waves go long before the foam does -- they are water,
  // and water spreads its energy until there is none of it anywhere -- so they
  // are given their own, much shorter, life.
  float liveW = 1.0 - smoothstep(0.02, 0.42, age);
  float liveF = 1.0 - smoothstep(0.10, 1.00, age);

  // ---- the shape of the water ---------------------------------------------
  // The mound the stem pushes ahead of itself, the trough her own displacement
  // drags along her side, and the hollow the screws pull down astern. This is
  // the biggest single thing a hull does to the sea and the wake did not have
  // it at all: what was drawn before was a pattern of waves on flat water,
  // when the water round a ship at speed is not flat to begin with.
  float bowRun = 1.0 - smoothstep(0.0, uStern * 0.20, run);
  float bowSide = 1.0 - smoothstep(wide * 0.55, wide * 1.9, m);
  float bow = bowRun * bowSide * drive * drive * 0.50;

  float sideRun = smoothstep(uStern * 0.05, uStern * 0.25, run)
                * (1.0 - smoothstep(uStern * 0.70, uStern * 1.10, run));
  float sideM = smoothstep(wide * 0.55, wide * 1.05, m)
              * (1.0 - smoothstep(wide * 1.35, wide * 2.4, m));
  float hollow = -sideRun * sideM * drive * 0.30;

  float sternRun = smoothstep(uStern * 0.78, uStern * 1.00, run)
                 * (1.0 - smoothstep(uStern * 1.05, uStern * 1.9, run));
  float sternM = 1.0 - smoothstep(wide * 0.45, wide * 1.4, m);
  float hollowAft = -sternRun * sternM * drive * 0.36;

  // The diverging system: the feathers that leave the bow at an angle to her
  // track and end on Kelvin's arm. They live *on* the arm and nowhere else --
  // which is the whole shape of a wake from the air -- so the envelope round
  // them is tight. Driven any wider than this and what comes out is a comb of
  // parallel bars sweeping across half a kilometre of sea.
  const float CP = 0.82, SP = 0.58;      // about thirty-five degrees
  float phD = kD * (run * CP + m * SP);
  float envD = smoothstep(0.52, 0.86, arm) * (1.0 - smoothstep(1.00, 1.34, arm));
  float ampD = uBeam * 0.048 * envD * drive * liveW
             * (1.0 - smoothstep(140.0, 900.0, run));

  // The transverse system: arcs strung between the arms, bowing away from her,
  // so the phase runs on the distance from the ship rather than down the track.
  // Always the fainter of the two, and from directly overhead almost the only
  // thing you can see inside the wedge.
  float rad = sqrt(run * run + m * m * 0.8);
  float phT = kT * rad;
  float envT = (1.0 - smoothstep(0.22, 0.84, arm))
             * smoothstep(uStern * 0.18, uStern * 0.85, run);
  float ampT = uBeam * 0.028 * envT * drive * liveW
             * (1.0 - smoothstep(110.0, 700.0, run));

  float h = bow + hollow + hollowAft + ampD * sin(phD) + ampT * sin(phT);

  // The churned water itself is not flat: it is a metre of confused chop with
  // nothing to do with the swell, and it is what makes a wake read as water
  // rather than as paint once the wave train has gone.
  float wash = smoothstep(uStern * 0.55, uStern * 1.05, run)
             * (1.0 - smoothstep(0.30, 0.95, arm)) * liveF * drive;
  // Scaled so the finest octave of it is several texels across. A metre of
  // confused water is real, but the map cannot hold a metre, and what it gives
  // back when asked for one is a grid of squares.
  vec2 cp = vec2(m * 0.10 * sgn, run * 0.09 - vAge * 0.35);
  h += (fbm(cp * 0.42) - 0.5) * 0.42 * wash;

  // ---- foam ---------------------------------------------------------------
  // Three things, and in the photograph they are the whole of the white water.
  //
  // The sheet at the stem: it starts at the very bow, because that is where a
  // ship makes white water -- the stem shoulders the sea aside and it breaks
  // there, before anything else in the wake exists.
  float stem = (1.0 - smoothstep(uStern * 0.06, uStern * 0.36, run))
             * (1.0 - smoothstep(spread * 0.50, spread * 1.20, m))
             * clamp(vSpeed / 5.0, 0.0, 1.0);

  // The band down her side: the bow wave breaking and being dragged aft along
  // the hull. It is the brightest thing in the picture and it runs unbroken
  // from her stem to her quarter.
  //
  // Its inner edge is her own plating and its outer edge is the spread, so at
  // the cutwater it is a bright line a couple of feet across and by the bridge
  // it is a band the width of her flare. Measured from her side and not from
  // her centreline: put it inboard of her beam and the ship stands on top of
  // the brightest thing in her own wake.
  float bandIn = max(hullHalf * 0.80, uBeam * 0.03);
  float band = smoothstep(bandIn * 0.45, bandIn, m)
             * (1.0 - smoothstep(spread * 0.98, spread * 1.50, m))
             * (1.0 - smoothstep(uStern * 0.95, uStern * 1.45, run))
             * clamp(vSpeed / 5.5, 0.0, 1.0);

  // The wash off her screws: solid behind the transom, opening slowly and
  // breaking into patches as it is left behind. The clock on it starts at the
  // transom rather than at the stem -- the water just astern of her is the
  // newest in the wake, however long ago her bow went past it.
  float tSt = max(vAge - uStern / max(vSpeed, 2.0), 0.0);
  float ageF = tSt / uLife;
  // The same spread the rest of the foam is measured against, so the wash
  // leaves the transom at exactly the width the band alongside her had.
  float coreW = spread;
  float core = (1.0 - smoothstep(coreW * 0.58, coreW * 1.18, m))
             * (1.0 - smoothstep(0.10, 1.0, pow(ageF, 0.8)))
             * smoothstep(uStern * 0.62, uStern * 0.95, run);

  // Broken up by noise anchored to the age of the water and to metres across
  // it, so a patch of foam keeps its size and its shape while it drifts astern
  // and dies rather than crawling about.
  vec2 np = vec2(m * 0.05 * sgn, tSt * 0.42);
  float churn = fbm(np * 0.85) * 0.62 + fbm(np * 1.9 + 11.0) * 0.38;
  // Straight astern of the transom it is not patchy yet, it is a solid boil.
  float boil = 1.0 - smoothstep(3.0, 16.0, tSt);
  float mask = smoothstep(0.32, 0.80, churn + 0.20 * (1.0 - ageF));
  mask = max(mask, boil * smoothstep(0.14, 0.50, churn + 0.26));
  core *= mask;

  // And the feathers on the diverging crests, where they are steep enough to
  // break: a row of white marks down the outside of the wake rather than a
  // clean line, which is what the arm of a wake actually looks like.
  float froth = fbm(vec2(m * 0.045 * sgn, run * 0.042 - vAge * 1.1));
  float steepD = abs(ampD) * kD;
  // Broken up by a much finer noise than the wash is: a feather on a wave
  // face is a few metres of white, not a floe.
  float lace = fbm(vec2(m * 0.075 * sgn, run * 0.070 - vAge * 1.1));
  // Only the very top of the crest breaks. Opened any wider than this and what
  // comes out is not a feather on a wave face but a floe.
  float crest = smoothstep(0.03, 0.13, steepD)
              * smoothstep(0.72, 0.99, sin(phD) * 0.5 + 0.5)
              * smoothstep(0.34, 0.60, lace) * liveF;
  // And the arm itself carries white for a long way whether or not the crest
  // under it is breaking: in the photograph the two arms of the wedge are
  // marked out in white to the edge of the frame.
  float armFoam = smoothstep(0.88, 0.99, arm) * (1.0 - smoothstep(1.01, 1.11, arm))
                * smoothstep(uStern * 0.4, uStern * 1.2, run)
                * (1.0 - smoothstep(400.0, 1500.0, run))
                * smoothstep(0.32, 0.66, lace * 0.6 + froth * 0.4)
                * liveF * drive;

  float foam = clamp(stem * 0.95
                   + band * smoothstep(0.30, 0.74, froth + 0.22) * 1.0
                   + core * 1.0
                   + crest * 0.70 + armFoam * 0.62, 0.0, 1.0);
  foam *= liveF;

  // How churned this water is at all, which is what tells the sea to put its
  // own chop away here and roughen instead. Only where something is actually
  // happening: a blanket over the whole strip flattens a quarter of a square
  // kilometre of sea round every ship afloat.
  float disturbed = clamp(stem + band * 0.8 + core + wash * 0.7, 0.0, 1.0);

  // Feathered in from the strip's own edges, or the strip is what you see.
  // Ramped in just abaft the stem as well. The strip begins at her bow, so
  // without this every term in it starts at full strength along one straight
  // line drawn across the water -- which is the one edge in the whole thing
  // that gives it away.
  float nose = smoothstep(0.0, uStern * 0.05, run);
  float edge = (1.0 - smoothstep(0.52, 0.90, abs(vSide))) * vTail * nose;
  edge *= smoothstep(0.0, 0.015, vAge);
  edge *= uOpacity;

  h *= edge;
  foam *= edge;
  disturbed *= edge;

  gl_FragColor = vec4(max(h, 0.0) / uScale, max(-h, 0.0) / uScale,
                      foam, disturbed);
}
`;

/**
 * One ship's track, and the strip of parameter space drawn from it.
 *
 * Told where she is each frame. Keeps the points she has been through and
 * rebuilds the strip that covers them; the strip is drawn into the wake map by
 * the field below, twice -- once into each patch.
 */
export class Wake {
  constructor({ length = 120, beam = 14 } = {}) {
    this.length = length;
    this.beam = beam;
    // The head of the track rides her stem. Every wave she makes is made at
    // the bow, so a track that starts at her transom has no water in it where
    // the bow wave actually is.
    this.bowOffset = length * 0.5;
    this.pts = [];
    this.clock = 0;
    this.opacity = 1;
    this.build();
  }

  build() {
    const verts = POINTS * COLS;
    const pos = new Float32Array(verts * 3);
    const age = new Float32Array(verts);
    const side = new Float32Array(verts);
    const speed = new Float32Array(verts);
    const half = new Float32Array(verts);
    const run = new Float32Array(verts);
    const tail = new Float32Array(verts);
    for (let i = 0; i < POINTS; i++) {
      for (let j = 0; j < COLS; j++) side[i * COLS + j] = (j / (COLS - 1)) * 2 - 1;
    }
    const idx = [];
    for (let i = 0; i < POINTS - 1; i++) {
      for (let j = 0; j < COLS - 1; j++) {
        const a = i * COLS + j;
        idx.push(a, a + 1, a + COLS + 1, a, a + COLS + 1, a + COLS);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
    geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    geo.setAttribute('aHalf', new THREE.BufferAttribute(half, 1));
    geo.setAttribute('aRun', new THREE.BufferAttribute(run, 1));
    geo.setAttribute('aTail', new THREE.BufferAttribute(tail, 1));
    geo.setIndex(idx);
    // A bounding sphere big enough for anything the strip can become, so the
    // ortho camera drawing the map never culls a wake that is half inside it.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.geo = geo;

    this.mat = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      uniforms: {
        uLife: { value: LIFE },
        uBeam: { value: this.beam },
        uStern: { value: this.length },
        uScale: { value: WAKE_H },
        uOpacity: { value: 1 },
      },
      // Where two wakes cross, the water does both. Added rather than blended,
      // which is what superposition means and what stops one ship's wake
      // cutting a hole in another's.
      transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Where she is now, and how fast. Lays another piece of track if she has run far enough. */
  update(dt, x, z, heading, speed) {
    this.clock += dt;
    const bx = x + Math.sin(heading) * this.bowOffset;
    const bz = z + Math.cos(heading) * this.bowOffset;
    const cur = { x: bx, z: bz, t: this.clock, v: Math.abs(speed), h: heading };
    // How far she is from the last piece of water she laid. Further than she
    // could have sailed since means she did not sail it -- she was put there,
    // at the start of a battle or when a view of her is built fresh -- and
    // joining the two would rule a straight band of wake across the sea from
    // where she was to where she is.
    const gap = this.pts.length > 1
      ? Math.hypot(bx - this.pts[1].x, bz - this.pts[1].z) : 0;
    const jumped = this.pts.length > 1
      && gap > Math.max(STEP_M * 3, Math.abs(speed) * dt * 8 + STEP_M);
    if (this.pts.length < 2 || jumped) {
      this.pts = [cur, { ...cur }];
    } else if (gap >= STEP_M) {
      this.pts.unshift(cur);
      if (this.pts.length > POINTS) this.pts.length = POINTS;
    } else {
      this.pts[0] = cur;
    }

    this.lay();
  }

  /** Write the track she has laid into the strip. */
  lay() {
    if (this.pts.length < 3) { this.mesh.visible = false; return; }
    this.mesh.visible = true;

    const pos = this.geo.attributes.position;
    const age = this.geo.attributes.aAge;
    const spd = this.geo.attributes.aSpeed;
    const hlf = this.geo.attributes.aHalf;
    const rn = this.geo.attributes.aRun;
    const tl = this.geo.attributes.aTail;
    // How near this row is to the end of the track she has actually laid. The
    // last stretch of it is faded out, because a strip that simply stops draws
    // a straight line ruled across the sea -- and it stops in the wrong place
    // as well: a ship working up from rest has a short track whose oldest
    // water is only a few seconds old, so nothing else fades it either.
    const last = this.pts.length - 1;
    for (let i = 0; i < POINTS; i++) {
      const spare = i >= this.pts.length;
      const p = this.pts[Math.min(i, this.pts.length - 1)];
      // Vertices past the end of the track are stacked on the last point and
      // aged out of the shader's life, so they discard instead of piling into
      // a bright knot at the tail.
      const a = spare ? LIFE + 1 : this.clock - p.t;
      const fade = spare ? 0 : Math.min(1, (last - i) / 7);
      const run = i * STEP_M;
      // Half again as wide as Kelvin's arm: the diverging waves live *on* the
      // arm, and a strip that ends there puts them under its own edge fade.
      const half = Math.max(this.beam * 1.7,
        (this.beam * 0.85 + Math.min(run, RUN_CAP) * KELVIN) * 1.35);
      const nx = Math.cos(p.h);
      const nz = -Math.sin(p.h);
      for (let j = 0; j < COLS; j++) {
        const off = half * ((j / (COLS - 1)) * 2 - 1);
        const k = i * COLS + j;
        pos.setXYZ(k, p.x + nx * off, 0, p.z + nz * off);
        age.setX(k, a);
        spd.setX(k, p.v);
        hlf.setX(k, half);
        rn.setX(k, run);
        tl.setX(k, fade);
      }
    }
    pos.needsUpdate = true;
    age.needsUpdate = true;
    spd.needsUpdate = true;
    hlf.needsUpdate = true;
    rn.needsUpdate = true;
    tl.needsUpdate = true;
  }

  /**
   * She has stopped making way and started going down.
   *
   * The track she has already laid is left to age out of the water on its own
   * -- it is real water and it does not vanish because she has -- but nothing
   * more is laid, and what is there is taken out quickly. A Kelvin pattern
   * running away from a hull standing on end is nonsense.
   */
  stop(dt = 0) {
    this.clock += dt;
    if (this.pts.length) {
      this.setOpacity(Math.max(0, this.opacity - dt * 0.8));
      if (this.opacity <= 0) this.pts = [];
      else { this.lay(); return; }
    }
    this.mesh.visible = false;
  }

  setOpacity(v) {
    this.opacity = v;
    this.mat.uniforms.uOpacity.value = v;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}

/**
 * The map itself: two patches of sea, and the pass that draws them.
 *
 * Nothing here is added to the scene. The strips live in a scene of this
 * field's own and are drawn straight down into two render targets, once per
 * frame, before the water is drawn. What comes out is handed to the ocean,
 * which is the only thing that ever reads it.
 */
export class WakeField {
  constructor({ size = 1024 } = {}) {
    this.size = size;
    this.scene = new THREE.Scene();
    this.wakes = new Set();
    // Straight down, orthographic: what is rendered is a plan of the sea.
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 400);
    this.cam.rotation.order = 'YXZ';
    this.cam.rotation.x = -Math.PI / 2;
    this.cascades = [
      { span: NEAR_M, centre: new THREE.Vector2(), rt: null },
      { span: FAR_M, centre: new THREE.Vector2(), rt: null },
    ];
    for (const c of this.cascades) c.rt = this.target(size);
  }

  target(size) {
    const rt = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      // Eight bits a channel, and deliberately.
      //
      // A float target would carry the height more finely, but half-float
      // colour attachments are not renderable everywhere and adding into one
      // is rarer still -- and where they are not, the whole map comes back
      // blank and there is no wake at all rather than a coarse one. The
      // encoding was chosen to survive this: lift and fall are separate
      // channels so nothing has to be signed, which is what lets the blend add
      // two wakes together, and five metres over two hundred and fifty-five
      // steps is two centimetres of water.
      type: THREE.UnsignedByteType,
    });
    rt.texture.generateMipmaps = false;
    return rt;
  }

  add(wake) {
    this.wakes.add(wake);
    this.scene.add(wake.mesh);
  }

  remove(wake) {
    this.wakes.delete(wake);
    this.scene.remove(wake.mesh);
  }

  /**
   * Draw both patches, centred where the camera is looking.
   *
   * Each is snapped to its own texel grid. Without that the whole map slides
   * by a fraction of a texel every frame and the water shimmers along with it,
   * which is the one artefact of a scheme like this that the eye picks up
   * immediately.
   */
  render(renderer, camera) {
    // Ahead of the eye, not under it. The camera looks at the ship from astern
    // at half a kilometre or more, so a patch centred on the camera has the
    // ship out past its edge -- which is where all the detail is wanted.
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const flat = Math.hypot(fwd.x, fwd.z) || 1;
    const camX = camera.position.x + (fwd.x / flat) * NEAR_M * 0.3;
    const camZ = camera.position.z + (fwd.z / flat) * NEAR_M * 0.3;
    const prevTarget = renderer.getRenderTarget();
    // The renderer's clear colour is global state and the sky is drawn with
    // it, so it goes back exactly as it was found.
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    for (const c of this.cascades) {
      const texel = c.span / this.size;
      // The far patch stays under the eye: it is what carries the horizon, and
      // biasing it forward would drop the wakes astern of you off its edge.
      const cx = c.span === NEAR_M ? camX : camera.position.x;
      const cz = c.span === NEAR_M ? camZ : camera.position.z;
      c.centre.set(Math.round(cx / texel) * texel, Math.round(cz / texel) * texel);
      const half = c.span / 2;
      this.cam.left = -half;
      this.cam.right = half;
      this.cam.top = half;
      this.cam.bottom = -half;
      this.cam.position.set(c.centre.x, 200, c.centre.y);
      this.cam.updateProjectionMatrix();
      this.cam.updateMatrixWorld(true);
      renderer.setRenderTarget(c.rt);
      renderer.render(this.scene, this.cam);
    }
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
  }

  /** Hand the map to the ocean, which is the only thing that reads it. */
  bind(uniforms) {
    if (!uniforms.uWakeNear) return;
    uniforms.uWakeNear.value = this.cascades[0].rt.texture;
    uniforms.uWakeFar.value = this.cascades[1].rt.texture;
    uniforms.uWakeNearAt.value.set(this.cascades[0].centre.x,
      this.cascades[0].centre.y, NEAR_M / 2, 0);
    uniforms.uWakeFarAt.value.set(this.cascades[1].centre.x,
      this.cascades[1].centre.y, FAR_M / 2, 0);
    uniforms.uWakeScale.value = WAKE_H;
    uniforms.uWakeStep.value = NEAR_M / this.size;
  }

  dispose() {
    for (const c of this.cascades) c.rt.dispose();
    this.wakes.clear();
  }
}
