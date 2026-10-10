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
//   B  foam: how much of the surface is white
//   A  aeration: water her screws have been through, full of fine bubbles,
//      which the sea draws paler and glassier than the water round it

import * as THREE from '../../../vendor/three.module.js';

/**
 * The metres of lift one full channel of the map stands for.
 *
 * Two and a half, where it was five: nothing a hull does to the sea stands
 * more than a metre high now (see the heights in the strip's shader), and
 * over eight bits that is a centimetre a step instead of two.
 */
export const WAKE_H = 2.5;

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
// The longest track she keeps, measured from her stem. Her strip is faded out
// toward this by distance, so its far end is soft and stays put rather than
// stepping aft a whole piece of track every time she lets go of one.
const TRACK_M = (POINTS - 2) * STEP_M;

/** Hermite step, as GLSL has it. */
function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * How far astern of her stem her own waves run before they have died.
 *
 * A ship's length or so past her transom, and never more than a few hundred
 * metres past it whatever she is. The strip's shader fades the wave train
 * out by here and the strip only spreads at Kelvin's angle this far, so the
 * two are worked out from one place.
 */
export function waveReach(length) {
  return length * 1.1 + Math.min(length * 1.4, 260);
}

// The strip is laid out in the world, so a ship that puts her helm over leaves
// her wake curving astern instead of swinging it round with her like a tail.
const RIBBON_VERT = /* glsl */`
attribute float aAge;      // seconds since this piece of water was disturbed
attribute float aSide;     // -1 to port, +1 to starboard
attribute float aSpeed;    // how fast she was going when she made it
attribute float aHalf;     // half the strip's width here, in metres
attribute float aRun;      // how far astern of her stem this is, in metres
attribute float aTail;     // 1 in the body of the strip, 0 at its far end
attribute float aOdo;      // how far she had run, all told, when she laid it
varying float vAge;
varying float vTail;
varying float vSide;
varying float vSpeed;
varying float vHalf;
varying float vRun;
varying float vOdo;
varying vec2 vWorld;

void main() {
  vAge = aAge;
  vSide = aSide;
  vSpeed = aSpeed;
  vHalf = aHalf;
  vRun = aRun;
  vTail = aTail;
  vOdo = aOdo;
  // The strip's mesh sits at the origin, so this is where it is on the sea.
  vWorld = position.xz;
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
uniform float uReach;      // how far astern of her stem her waves have died
uniform float uScale;      // metres of lift one channel stands for
uniform float uOpacity;
varying float vAge;
varying float vSide;
varying float vSpeed;
varying float vHalf;
varying float vRun;
varying float vTail;
varying float vOdo;
varying vec2 vWorld;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
// Wrapped before it is hashed, so the noise is as good thirty kilometres out
// as it is in the middle of the map. See the ocean's dnoise.
float cell(vec2 i) { return hash21(mod(i, 289.0)); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(cell(i), cell(i + vec2(1, 0)), u.x),
             mix(cell(i + vec2(0, 1)), cell(i + vec2(1, 1)), u.x), u.y);
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

// What a hull does to the height of the sea, in metres. The same for every
// ship afloat: a battleship spreads her wave over more water than a destroyer
// does, she does not stand it any higher. These used to be fractions of her
// beam, so a Yamato threw a sea three times the height of a Fletcher's and
// the two wakes looked like different oceans.
const float BOW_H = 0.85;     // the mound she shoulders ahead of her stem
const float SIDE_H = 0.40;    // the trough her displacement drags along her
const float AFT_H = 0.45;     // the hollow under her counter
const float DIV_H = 0.36;     // the diverging waves off her bow
const float TRANS_H = 0.22;   // the transverse waves strung astern of her
const float CHOP_H = 0.26;    // the confused water her screws leave

void main() {
  float age = vAge / uLife;
  if (age > 1.0) discard;
  float sgn = sign(vSide + 1e-6);
  float m = abs(vSide) * vHalf;          // metres off her track
  float run = vRun;                      // metres astern of her stem

  // How hard she is pushing. Nothing at steerage way and full height by ten
  // knots or so -- and, once she is under way, not a matter of how big she
  // is or how hard she is driven: see the heights above.
  float drive = smoothstep(0.6, 5.5, vSpeed);
  if (drive < 0.01) discard;

  // Kelvin. The arm of the wedge is at m = run * tan(19.47 degrees), and the
  // waves off her bow are placed against it. Its apex is her stem: the offset
  // is her own half beam and no more, so the wedge springs from her side and
  // opens astern instead of starting a beam wide with the ship inside it.
  float armM = run * ${KELVIN.toFixed(5)} + uBeam * 0.50;
  float arm = m / max(armM, 1.0);

  // ---- how wide the white water is here -----------------------------------
  //
  // The one curve that gives a wake its shape seen from the air: white water
  // does not begin at full width. It begins at the cutwater, which is a few
  // feet across, and opens from there -- out to her own side by the time it
  // is abreast of the bridge, a little wider at her quarter, and then
  // spreading slowly astern for as long as the water stays broken. Every term
  // in the foam below is measured against it, so the whole wake comes to a
  // point at her stem.
  float alongHull = clamp(run / max(uStern, 1.0), 0.0, 1.0);
  // Her own half beam at this point of her length: a fine entry over the
  // forward third, parallel middle body, a slight taper into the transom.
  float hullHalf = uBeam * 0.5 * smoothstep(0.0, 0.30, alongHull)
                 * (1.0 - 0.10 * smoothstep(0.72, 1.0, alongHull));
  // How far astern of the transom this water is: nothing at all until she has
  // gone by, and it is only past her that the wash is free to open out.
  float runS = max(run - uStern, 0.0);
  // Sublinear, because a wake broadens quickly just astern of the screws and
  // then hardly at all.
  float openAft = pow(runS, 0.80) * 0.10;
  // What the stem itself throws: a couple of feet of white at the bow,
  // standing well off her side by the time it is abreast of the bridge.
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

  // Her waves are hers. They stand round her and go along with her, and a
  // ship's length or so past her transom they have spread themselves into
  // nothing. They used to run out along Kelvin's arms for the better part of
  // a mile, with a line of white on each, and from any height at all that was
  // a great arrowhead ruled on the sea with the ship at its point.
  float near = 1.0 - smoothstep(uStern * 1.05, uReach, run);
  // And nothing lasts. The waves go first -- they are water, and water spreads
  // its energy until there is none of it anywhere.
  float liveW = 1.0 - smoothstep(0.02, 0.30, age);

  // The clock on the trail starts at her transom rather than her stem: the
  // water just astern of her is the newest in the wake, however long ago her
  // bow went past it.
  float tSt = max(vAge - uStern / max(vSpeed, 2.0), 0.0);
  float ageF = tSt / uLife;
  // The foam goes in well under half the time the bubbles under it take to
  // come up, and the bubbles thin out from the start rather than all at once
  // at the end. That is the whole look of an old wake: a long pale band with
  // no white left on it, fading into the sea.
  float liveF = 1.0 - smoothstep(0.0, 0.42, ageF);
  float liveA = pow(1.0 - smoothstep(0.02, 1.0, ageF), 1.6);

  // ---- the shape of the water ---------------------------------------------
  // The mound the stem pushes ahead of itself, the trough her own displacement
  // drags along her side, and the hollow the screws pull down astern.
  float bowRun = 1.0 - smoothstep(0.0, uStern * 0.20, run);
  float bowSide = 1.0 - smoothstep(wide * 0.55, wide * 1.9, m);
  float bow = bowRun * bowSide * drive * BOW_H;

  float sideRun = smoothstep(uStern * 0.05, uStern * 0.25, run)
                * (1.0 - smoothstep(uStern * 0.70, uStern * 1.10, run));
  float sideM = smoothstep(wide * 0.55, wide * 1.05, m)
              * (1.0 - smoothstep(wide * 1.35, wide * 2.4, m));
  float hollow = -sideRun * sideM * drive * SIDE_H;

  float sternRun = smoothstep(uStern * 0.78, uStern * 1.00, run)
                 * (1.0 - smoothstep(uStern * 1.05, uStern * 1.9, run));
  float sternM = 1.0 - smoothstep(wide * 0.45, wide * 1.4, m);
  float hollowAft = -sternRun * sternM * drive * AFT_H;

  // The diverging system: the feathers that leave the bow at an angle to her
  // track and end on Kelvin's arm. They live on the arm and nowhere else, so
  // the envelope round them is tight.
  const float CP = 0.82, SP = 0.58;      // about thirty-five degrees
  float phD = kD * (run * CP + m * SP);
  float envD = smoothstep(0.55, 0.85, arm) * (1.0 - smoothstep(0.98, 1.22, arm));
  float ampD = DIV_H * envD * drive * liveW * near;

  // The transverse system: arcs strung between the arms, bowing away from her,
  // so the phase runs on the distance from the ship rather than down the track.
  float rad = sqrt(run * run + m * m * 0.8);
  float phT = kT * rad;
  float envT = (1.0 - smoothstep(0.22, 0.80, arm))
             * smoothstep(uStern * 0.18, uStern * 0.85, run);
  float ampT = TRANS_H * envT * drive * liveW * near;

  float h = bow + hollow + hollowAft + ampD * sin(phD) + ampT * sin(phT);

  // ---- in the water's own frame -------------------------------------------
  // Everything below that is broken up -- the patches of foam, the threads of
  // it, the ragged edges of the trail -- is broken up by noise laid in the
  // water rather than on the ship: across her track in metres off it, and
  // along it by how far she had run when she laid it. Neither of those moves
  // while she sails on, so a patch of foam stays on the piece of sea she left
  // it on and dies there. It used to be measured from her stem, and slid
  // after her down the wake -- and jumped back twenty metres every time she
  // laid another piece of track.
  vec2 wq = vec2(m * sgn, vOdo);
  // The water does go on moving, slowly, on its own clock: the noise turns
  // over on the age of the water, so a patch changes shape as it dies rather
  // than sitting there like a transfer.
  float stir = vAge * 0.035;
  float clump = fbm(vWorld * 0.032 + 3.7 + stir * 0.5);

  // ---- the trail ------------------------------------------------------------
  // The water her screws have been through. It leaves her transom at the
  // width of the white water alongside her and opens slowly from there --
  // the same opening every other term is measured against. Its edges are
  // ragged, because churned water does not stop along a ruled line.
  float coreW = spread;
  float behind = smoothstep(uStern * 0.62, uStern * 0.95, run);
  float inCore = 1.0 - smoothstep(coreW * (0.40 + 0.30 * clump),
                                  coreW * (0.95 + 0.30 * clump), m);
  float inBand = 1.0 - smoothstep(coreW * (0.70 + 0.25 * clump),
                                  coreW * (1.25 + 0.30 * clump), m);

  // The confused water just astern of her is not flat: it is a heap of short
  // chop with nothing to do with the swell, and it settles in half a minute.
  float wash = behind * inBand * (1.0 - smoothstep(4.0, 40.0, tSt)) * drive;
  h += (fbm(vWorld * 0.075 + stir * 4.0) - 0.5) * CHOP_H * wash;

  // ---- foam ---------------------------------------------------------------
  // How much of the surface is white, which the ocean turns into foam per
  // pixel. Never all of it: even the boil under her counter is broken water
  // with the sea showing through.
  //
  // The sheet at the stem, where she shoulders the sea aside and it breaks.
  float stem = (1.0 - smoothstep(uStern * 0.06, uStern * 0.36, run))
             * (1.0 - smoothstep(spread * 0.50, spread * 1.20, m))
             * drive;

  // The band down her side: the bow wave breaking and being dragged aft along
  // the hull, from her stem to her quarter. Its inner edge is her own plating
  // and its outer edge is the spread -- put it inboard of her beam and the
  // ship stands on top of the brightest thing in her own wake.
  float bandIn = max(hullHalf * 0.80, uBeam * 0.03);
  float band = smoothstep(bandIn * 0.45, bandIn, m)
             * (1.0 - smoothstep(spread * 0.98, spread * 1.50, m))
             * (1.0 - smoothstep(uStern * 0.95, uStern * 1.45, run))
             * drive;
  float froth = fbm(vec2(wq.x * 0.06, wq.y * 0.05) + stir);
  band *= smoothstep(0.25, 0.70, froth + 0.20);

  // The wash off her screws. Nearly solid straight astern of the transom; a
  // few hundred metres back it has broken into threads drawn out along the
  // track -- the shear between the churned water and the sea either side
  // pulls the foam into lines -- and patches; past that there is no white
  // left, only the pale band it was lying on.
  float streak = fbm(vec2(wq.x * 0.11, wq.y * 0.016) + stir);
  float boil = 1.0 - smoothstep(2.0, 14.0, tSt);
  float lo = 0.30 + 0.30 * smoothstep(0.0, 0.40, ageF);
  float breakUp = smoothstep(lo, lo + 0.30, streak * 0.6 + clump * 0.4);
  float core = inCore * behind * liveF * mix(breakUp * 0.60, 0.76, boil);

  // And the crests of the diverging waves, where they are steep enough to
  // break -- close in on her bow and nowhere else.
  float lace = fbm(vec2(wq.x * 0.075, wq.y * 0.07) + stir * 2.0);
  float steepD = abs(ampD) * kD;
  float crest = smoothstep(0.015, 0.06, steepD)
              * smoothstep(0.74, 0.99, sin(phD) * 0.5 + 0.5)
              * smoothstep(0.40, 0.64, lace);

  float foam = clamp(stem * 0.72 + band * 0.62 + core + crest * 0.45, 0.0, 0.86);

  // ---- aeration -----------------------------------------------------------
  // The water her screws and her bow have been through, foam or no foam. It
  // is a little wider than the white on it, and it lasts the whole life of
  // the wake: the bubbles take minutes to come up.
  float aer = inBand * behind * liveA * mix(0.70, 1.0, clump) * drive;
  aer = max(aer, max(stem, band) * 0.55);
  // Anything white has bubbles under it.
  aer = max(aer, foam * 0.8);

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
  aer *= edge;

  gl_FragColor = vec4(max(h, 0.0) / uScale, max(-h, 0.0) / uScale, foam, aer);
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
    this.reach = waveReach(length);
    this.pts = [];
    this.clock = 0;
    // How far her stem has run, all told. Every piece of her track carries
    // the reading it was laid at, so how far astern of her any of it is comes
    // straight off the difference -- and so does where a patch of foam sits
    // along it, which is what keeps it on the piece of sea it was made on.
    this.odo = 0;
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
    const odo = new Float32Array(verts);
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
    geo.setAttribute('aOdo', new THREE.BufferAttribute(odo, 1));
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
        uReach: { value: this.reach },
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
    // How far she is from the last piece of water she laid. Further than she
    // could have sailed since means she did not sail it -- she was put there,
    // at the start of a battle or when a view of her is built fresh -- and
    // joining the two would rule a straight band of wake across the sea from
    // where she was to where she is.
    const gap = this.pts.length > 1
      ? Math.hypot(bx - this.pts[1].x, bz - this.pts[1].z) : 0;
    const jumped = this.pts.length > 1
      && gap > Math.max(STEP_M * 3, Math.abs(speed) * dt * 8 + STEP_M);
    // Run on from wherever her stem was last frame. Not across a jump: she did
    // not sail that.
    const head = this.pts[0];
    if (head && !jumped) this.odo += Math.hypot(bx - head.x, bz - head.z);
    const cur = {
      x: bx, z: bz, t: this.clock, v: Math.abs(speed), h: heading, odo: this.odo,
    };
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
    const od = this.geo.attributes.aOdo;
    const last = this.pts.length - 1;
    const lastRun = this.odo - this.pts[last].odo;
    for (let i = 0; i < POINTS; i++) {
      const spare = i >= this.pts.length;
      const p = this.pts[Math.min(i, last)];
      // Vertices past the end of the track are stacked on the last point and
      // aged out of the shader's life, so they discard instead of piling into
      // a bright knot at the tail.
      const a = spare ? LIFE + 1 : this.clock - p.t;
      // How far astern of her stem this piece of track is, measured along it.
      //
      // It used to be counted -- the row's number times the length of a piece
      // -- which is right only at the instant a piece is laid. Between pieces
      // her stem runs on and the first piece behind it stays put, so the
      // whole wake was stretched a little more every frame, and then the
      // moment she laid the next piece every row moved one number down and
      // the wake behind her jumped twenty metres back to where it started.
      // Twice a second at speed: the whole wake pulsing and resetting.
      const run = this.odo - p.odo;
      // How near this row is to the end of the track she has actually laid.
      // The last stretch of it is faded out, because a strip that simply stops
      // draws a straight line ruled across the sea -- and it stops in the
      // wrong place as well: a ship working up from rest has a short track
      // whose oldest water is only a few seconds old, so nothing else fades it
      // either. By distance, both ends of it, so it slides rather than steps.
      const fade = spare ? 0
        : Math.min(1, Math.max(0, (lastRun - run) / (STEP_M * 5)))
          * (1 - smooth(TRACK_M * 0.6, TRACK_M, run));
      // Half again as wide as Kelvin's arm out to where her waves die, so the
      // diverging waves are not under the strip's own edge fade; and wide
      // enough past that for the trail, which goes on opening slowly.
      const runS = Math.max(run - this.length, 0);
      const trail = 2.6 * (this.beam * 0.82 + Math.pow(runS, 0.8) * 0.10);
      const half = Math.max(this.beam * 1.7,
        (this.beam * 0.85 + Math.min(run, this.reach) * KELVIN) * 1.35, trail);
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
        od.setX(k, p.odo);
      }
    }
    pos.needsUpdate = true;
    age.needsUpdate = true;
    spd.needsUpdate = true;
    hlf.needsUpdate = true;
    rn.needsUpdate = true;
    tl.needsUpdate = true;
    od.needsUpdate = true;
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
// ------------------------------------------------------- the waves off a splash

// How fast the ring off a splash runs out, in metres a second. The same number
// the simulation rolls ships with (SURGE_SPEED in sim.js), so the hull that is
// thrown about is thrown about as the wave the eye can see reaches her.
export const RING_SPEED = 11;
const RINGS = 96;

const RING_VERT = /* glsl */`
attribute vec4 aRing;   // xy where it went in, z when, w how high the first crest stands
attribute vec4 aShape;  // x crest-to-crest length, y how long it runs, z seed, w foam
varying vec2 vWorld;
varying vec4 vRing;
varying vec4 vShape;
void main() {
  vRing = aRing;
  vShape = aShape;
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const RING_FRAG = /* glsl */`
uniform float uTime;
uniform float uScale;
uniform float uSpeed;
varying vec2 vWorld;
varying vec4 vRing;
varying vec4 vShape;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  float age = uTime - vRing.z;
  float life = vShape.y;
  if (age < 0.0 || age > life) discard;
  float lam = vShape.x;
  float seed = vShape.z;
  vec2 d = vWorld - vRing.xy;
  float r = length(d);
  float th = atan(d.y, d.x);
  // Not a circle. Water thrown out of a splash leaves it unevenly -- more of it
  // goes the way the shell was travelling, and the sea it runs across has a
  // swell of its own -- so the ring is lobed and torn round its circumference,
  // differently every time.
  float warp = 1.0 + 0.075 * sin(3.0 * th + seed) + 0.05 * sin(5.0 * th - seed * 1.7)
    + 0.03 * sin(9.0 * th + seed * 3.1) + 0.06 * (noise(d / (lam * 1.6) + seed) - 0.5);
  float rr = r / warp;
  float front = uSpeed * age + lam * 0.6;
  float s = (rr - front) / lam;
  // A leading crest and a train of lower ones behind it, the way a wave group
  // off an impact runs out: steep in front, dying away astern.
  float env = exp(-max(s, 0.0) * max(s, 0.0) * 5.0) * exp(min(s, 0.0) * 0.6);
  float spread = sqrt(lam * 2.5 / (lam * 2.5 + front));
  float fade = 1.0 - smoothstep(life * 0.5, life, age);
  float h = vRing.w * env * cos(6.2832 * s) * spread * fade;
  // And where it went in: the cavity the shell punched closing up again,
  // heaving the water in the middle up and down for a few seconds.
  float core = exp(-(rr * rr) / (lam * lam * 1.4));
  h += vRing.w * 1.2 * core * exp(-age * 0.9) * cos(age * 3.1);
  // Foam: torn white water on the leading crest while it is young, and the
  // patch in the middle where the column came down, broken up so neither is a
  // disc.
  float tear = noise(d / (lam * 0.45) + seed * 2.3) * 0.6 + noise(d / (lam * 0.16) - seed) * 0.4;
  float crest = smoothstep(0.25, 0.9, env * max(0.0, cos(6.2832 * s))) * exp(-age * 0.55) * spread;
  // The churned water where it came down, in torn clots and streaks with dark
  // water between them -- never a white disc.
  float churn = smoothstep(lam * 2.1, lam * 0.3, rr * (0.6 + tear * 0.9)) * exp(-age * 0.12);
  float clots = smoothstep(0.32, 0.72, tear + 0.3 * churn);
  float foam = vShape.w * clamp(crest * tear * 1.6 + churn * clots, 0.0, 1.0) * fade;
  float aer = vShape.w * churn * 0.8 * fade;
  gl_FragColor = vec4(max(h, 0.0) / uScale, max(-h, 0.0) / uScale, foam, aer);
}
`;

/**
 * The waves a splash throws, written into the wake map.
 *
 * Not a ring laid on the water: the water itself. Each one lifts and drops the
 * surface in the map the ocean is displaced by, so the crest running out from
 * a near miss is the sea moving -- lit by the sea's own light, carrying the
 * sea's own chop, crossing the swell and the other splashes' rings by adding
 * to them -- and the foam it tears up is foam in the sea, not a decal on it.
 */
export class SplashRings {
  constructor() {
    const geo = new THREE.PlaneGeometry(2, 2);
    geo.rotateX(-Math.PI / 2);
    this.ring = new THREE.InstancedBufferAttribute(new Float32Array(RINGS * 4), 4);
    this.shape = new THREE.InstancedBufferAttribute(new Float32Array(RINGS * 4), 4);
    this.ring.setUsage(THREE.DynamicDrawUsage);
    this.shape.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aRing', this.ring);
    geo.setAttribute('aShape', this.shape);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: WAKE_H },
        uSpeed: { value: RING_SPEED },
      },
      // Added, the same as a wake: where two rings cross the water does both.
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
    this.mesh = new THREE.InstancedMesh(geo, this.mat, RINGS);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.clock = 0;
    this.live = [];
    this.m = new THREE.Matrix4();
  }

  /**
   * A ring off a splash at (x, z). `height` is how tall the column stood and
   * `radius` how wide its foot was (see splashSize), which is all the size of
   * the wave needs to know; `foam` is how much white water it leaves.
   */
  add(x, z, height, radius, foam = 1) {
    // The crest stands in proportion to the water thrown, and is held under
    // what the map can carry: a metre and a half off an eighteen-inch shell.
    const amp = Math.min(1.6, 0.018 * height + 0.05);
    const lam = 3 + radius * 1.05;
    // It runs until it has gone as far as the simulation says it is felt.
    const reach = 75 * Math.pow(Math.max(0.35, height / 23), 0.91);
    const life = Math.min(30, Math.max(4, reach / RING_SPEED));
    if (this.live.length >= RINGS) this.live.shift();
    // A small splash leaves less white water than a big one, not the same
    // patch smaller.
    const white = foam * Math.min(1, 0.3 + height / 50);
    this.live.push({ x, z, t0: this.clock, amp, lam, life, seed: Math.random() * 100, foam: white });
  }

  update(dt) {
    this.clock += dt;
    this.mat.uniforms.uTime.value = this.clock;
    this.live = this.live.filter((r) => this.clock - r.t0 < r.life);
    const n = this.live.length;
    for (let i = 0; i < n; i++) {
      const r = this.live[i];
      // The quad only has to cover where the water is moving yet.
      const span = RING_SPEED * (this.clock - r.t0) + r.lam * 4;
      this.m.makeScale(span, 1, span).setPosition(r.x, 0, r.z);
      this.mesh.setMatrixAt(i, this.m);
      this.ring.setXYZW(i, r.x, r.z, r.t0, r.amp);
      this.shape.setXYZW(i, r.lam, r.life, r.seed, r.foam);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.ring.needsUpdate = true;
    this.shape.needsUpdate = true;
  }
}

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
    // And the rings the splashes throw, drawn into the same map.
    this.rings = new SplashRings();
    this.scene.add(this.rings.mesh);
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
