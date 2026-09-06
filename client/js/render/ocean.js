// The sea.
//
// Three things make water look like water, and this file is built round them.
//
// The shape is Gerstner, not a sum of sines: every particle of the surface
// travels in a circle rather than bobbing straight up and down, which is what
// draws the crests up sharp and leaves the troughs long and flat. The waves
// obey the deep-water dispersion relation — a long wave runs faster than a
// short one — so the pattern never settles into a repeating corrugation.
//
// The mesh is a disc carried under the camera with its rings spaced
// geometrically: a couple of metres across at the bow, kilometres at the
// horizon. A uniform grid over twenty kilometres cannot carry a wave shorter
// than a hundred metres however many triangles are spent on it, and spends
// nearly all of them on water too far away to see.
//
// The detail below the mesh — the chop, the ripples, the cat's paws — is
// carried by the fragment stage as normals off six octaves of scrolling noise
// with analytic derivatives, faded out with range so the horizon stays smooth
// instead of boiling.

import * as THREE from '../../../vendor/three.module.js';

// The wave train, shared by the shader and by heightAt() below. Wavelength in
// metres, amplitude as a fraction of the sea state's, steepness, and heading.
// They have to agree exactly or hulls will ride water the screen is not
// drawing, so both ends read these same numbers.
// Halved in length from what they were, because the train was a swell train:
// waves the better part of a kilometre long, which is an ocean crossing's worth
// of fetch and not a sea anybody fights in. Shorter waves put the same motion
// into a hull at a fraction of the height, which is the point -- the height is
// what was taking a carrier's screws out of the water.
/**
 * The scale that turns a weather preset into metres of wave.
 *
 * At the old value the four components summed to nearly eight metres of
 * amplitude -- a fifteen metre sea, which is a storm nobody launches aircraft
 * in, and which left a carrier's propellers in the air at the bottom of every
 * trough. This is a rough day rather than a gale.
 */
export const AMP_SCALE = 0.42;

export const WAVES = [
  { len: 470, amp: 1.00, steep: 0.62, dir: [0.86, 0.51] },
  { len: 235, amp: 0.52, steep: 0.70, dir: [-0.42, 0.91] },
  { len: 116, amp: 0.29, steep: 0.74, dir: [0.31, -0.95] },
  { len: 60, amp: 0.16, steep: 0.78, dir: [-0.97, -0.24] },
];
const G = 9.81;

// Exported so anything that has to sit on this water -- the wakes above all --
// can be displaced by the very same function, evaluated in its own vertex
// stage. Two shaders reading one piece of code is the only way two surfaces
// ever actually agree; matching one against the other by hand does not survive
// the first change to either.
export const WAVE_GLSL = /* glsl */`
// Deep-water gravity waves. Returns the displaced point; the surface normal and
// the fold of the surface (which is where foam is made) come back in the outs.
uniform float uTime;
uniform float uAmp;
uniform float uSteep;

const int NWAVE = ${WAVES.length};
uniform vec4 uWave[NWAVE];      // xy = direction, z = wavenumber, w = amplitude
uniform vec2 uWaveB[NWAVE];     // x = angular speed, y = steepness

vec3 gerstner(vec2 p, out vec3 nrm, out float fold) {
  vec3 disp = vec3(0.0);
  // Partial derivatives of the displaced position, accumulated as we go.
  vec3 ddx = vec3(1.0, 0.0, 0.0);
  vec3 ddz = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < NWAVE; i++) {
    vec2 d = uWave[i].xy;
    float k = uWave[i].z;
    float a = uWave[i].w * uAmp;
    float w = uWaveB[i].x;
    float q = uWaveB[i].y * uSteep / max(k * a * float(NWAVE), 1e-4);
    float ph = k * dot(d, p) - w * uTime;
    float c = cos(ph);
    float s = sin(ph);
    disp += vec3(q * a * d.x * c, a * s, q * a * d.y * c);
    float wa = k * a;
    ddx += vec3(-q * wa * d.x * d.x * s, wa * d.x * c, -q * wa * d.x * d.y * s);
    ddz += vec3(-q * wa * d.x * d.y * s, wa * d.y * c, -q * wa * d.y * d.y * s);
  }
  nrm = normalize(cross(ddz, ddx));
  // The determinant of the horizontal part: it goes to nothing where the crest
  // is about to fold over on itself, and that is where the water breaks.
  fold = ddx.x * ddz.z - ddx.z * ddz.x;
  return disp;
}
`;

/**
 * The wake map, and how the sea reads it.
 *
 * Two square patches of water carried under the camera -- a kilometre across
 * at a metre a texel, and twelve kilometres at twelve -- with what every ship
 * afloat has done to the surface written into them. See wakefield.js. Both
 * stages of this shader read it through here, so the water is displaced by
 * exactly what it is shaded by.
 *
 * Everything in the map is positive so that two wakes crossing can be added:
 * R is how far the surface is lifted, G how far it is pulled down, B foam and
 * A how churned the water is at all.
 */
export const WAKE_GLSL = /* glsl */`
uniform sampler2D uWakeNear;
uniform sampler2D uWakeFar;
uniform vec4 uWakeNearAt;    // xy centre, z half-extent
uniform vec4 uWakeFarAt;
uniform float uWakeScale;    // metres of lift one channel stands for
uniform float uWakeStep;     // one near texel, in metres

vec4 wakeAt(vec2 p) {
  // The map is drawn by a camera looking straight down, and a camera looking
  // down has its own up: the patch's V axis runs the opposite way to world Z.
  // Sampled without that flip the whole wake comes back mirrored about the
  // ship -- laid out ahead of her instead of astern, offset to one side, with
  // a hole in the water where the bow wave should be.
  vec2 un = vec2(p.x - uWakeNearAt.x, uWakeNearAt.y - p.y) / uWakeNearAt.z * 0.5 + 0.5;
  vec2 uf = vec2(p.x - uWakeFarAt.x, uWakeFarAt.y - p.y) / uWakeFarAt.z * 0.5 + 0.5;
  // Faded out before either patch runs off its own edge, or the edge texel is
  // smeared out across the sea by the clamp and a wake ends in a straight line
  // ruled a kilometre from the ship.
  float en = max(abs(un.x - 0.5), abs(un.y - 0.5)) * 2.0;
  float ef = max(abs(uf.x - 0.5), abs(uf.y - 0.5)) * 2.0;
  vec4 near = texture2D(uWakeNear, un) * (1.0 - smoothstep(0.86, 0.99, en));
  vec4 far = texture2D(uWakeFar, uf) * (1.0 - smoothstep(0.90, 0.99, ef));
  // The near patch wins where it has anything to say, because it has twelve
  // times the detail; the far one carries the rest of the horizon.
  return mix(far, near, 1.0 - smoothstep(0.80, 0.96, en));
}

/**
 * How far the wake has moved the surface at a point, in metres.
 *
 * The near patch only. It is the one with the detail in it -- the far patch is
 * sixteen metres to a texel, where a bow wave is a single sample -- and this
 * is called four times a pixel to get the slope, so halving what each call
 * costs is worth more here than anywhere else in the shader. Past the near
 * patch the wake is carried by its foam, which is all there is to see of one
 * at a kilometre anyway.
 */
float wakeLift(vec2 p) {
  vec2 un = vec2(p.x - uWakeNearAt.x, uWakeNearAt.y - p.y) / uWakeNearAt.z * 0.5 + 0.5;
  float en = max(abs(un.x - 0.5), abs(un.y - 0.5)) * 2.0;
  vec4 w = texture2D(uWakeNear, un) * (1.0 - smoothstep(0.86, 0.99, en));
  return (w.r - w.g) * uWakeScale;
}
`;

const VERT = /* glsl */`
uniform float uFade;        // how far out the short waves are given up
varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
varying float vFold;
varying float vDist;
varying float vWake;
${WAVE_GLSL}
${WAKE_GLSL}

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 nrm;
  float fold;
  vec3 d = gerstner(wp.xz, nrm, fold);
  // The rings are spaced geometrically, so past a few kilometres a wave is
  // shorter than the triangle carrying it. Rather than let it alias, hand it
  // over to the fragment stage: the water flattens with range, which is what
  // it does anyway.
  float far = length(wp.xyz - cameraPosition);
  float keep = 1.0 - smoothstep(uFade * 0.35, uFade, far);
  wp.xyz += d * keep;
  // And the wake, which is the water and not something laid on it. Displaced
  // here, in the same stage and on the same vertex as the swell: a ship's bow
  // wave is a lump in the sea, and this is where it is put there.
  //
  // Only as far out as the mesh can carry it. The disc's rings are spaced
  // geometrically, so a few kilometres away a triangle is longer than the
  // whole bow wave and displacing it would draw a spike; out there the wake is
  // carried by the shading alone, which is what it looks like at that range
  // anyway.
  float wkeep = 1.0 - smoothstep(uFade * 0.10, uFade * 0.30, far);
  wp.y += wakeLift(wp.xz) * wkeep;
  vWake = wkeep;
  vWorld = wp.xyz;
  vNormal = normalize(mix(vec3(0.0, 1.0, 0.0), nrm, keep));
  vCrest = d.y;
  vFold = fold;
  vDist = far;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSkyTint;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uAmp;
uniform float uSpecular;
uniform float uFogDensity;
uniform vec3 uFogColor;
uniform vec2 uGlare;
uniform float uGlareSize;
uniform float uStreak;
uniform float uUnder;
uniform float uChop;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
varying float vFold;
varying float vDist;
varying float vWake;
${WAKE_GLSL}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Value noise with its gradient, so the chop can be turned into a normal
// without sampling the field four times over.
vec3 dnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 du = 6.0 * f * (1.0 - f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  float k1 = b - a, k2 = c - a, k3 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k3 * u.x * u.y,
              du.x * (k1 + k3 * u.y),
              du.y * (k2 + k3 * u.x));
}

float onoise(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * dnoise(p).x; p *= 2.11; a *= 0.5; }
  return v;
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 toEye = cameraPosition - vWorld;
  float dcam = length(toEye);
  vec3 v = toEye / max(dcam, 1e-4);
  vec3 l = normalize(uLightDir);

  // ---- chop ---------------------------------------------------------------
  // Six octaves of travelling noise, from swell-sized down to a ripple, each
  // drifting on its own bearing so the surface never reads as one sliding
  // texture. Every octave is dropped as soon as it is smaller than the pixel
  // it would land in, which is what keeps the horizon from crawling.
  vec2 q = vWorld.xz;
  // What a ship has done to this piece of water. One sample for the foam and
  // the churn; the slope of the wake comes from four more below.
  vec4 wk = wakeAt(q);
  float churned = clamp(wk.a, 0.0, 1.0);
  vec2 slope = vec2(0.0);
  float wl = 62.0;          // wavelength of the first octave, in metres
  float ht = 0.75;          // and its height
  vec2 drift = vec2(0.72, 0.69);
  for (int i = 0; i < 6; i++) {
    float k = 6.2831853 / wl;
    // Deep water again: the short ones run slowly, the long ones fast.
    float sp = sqrt(9.81 / k);
    vec3 nz = dnoise(q * k * 0.5 + drift * uTime * sp * k * 0.16);
    // An octave is kept only while it still covers a few pixels. Below that it
    // is detail the screen cannot resolve and shimmer it certainly can, and a
    // sea that sparkles like television static is the one thing worse than a
    // sea with no ripples on it at all.
    float lod = clamp(wl * 340.0 / max(dcam, 1.0) - 1.2, 0.0, 1.0);
    slope += nz.yz * ht * k * 0.5 * lod;
    wl *= 0.44;
    ht *= 0.52;
    drift = vec2(drift.y, -drift.x) * 0.98 + vec2(0.08, -0.05);
  }
  // Inside a wake the swell is knocked down -- a ship flattens the sea she has
  // been through -- but the surface is rougher, not smoother: it is a metre of
  // confused water with no pattern in it. So the chop is damped and a fine
  // ripple of its own put in its place.
  vec2 wp2 = q * 0.55 + vec2(uTime * 0.6, -uTime * 0.45);
  vec3 r1 = dnoise(wp2);
  vec3 r2 = dnoise(wp2 * 2.7 + 5.0);
  vec2 rip = r1.yz + r2.yz * 0.5;
  float ripLod = clamp(240.0 / max(dcam, 1.0), 0.0, 1.0);
  slope = slope * (1.0 - 0.55 * churned) + rip * 0.35 * churned * ripLod;
  n = normalize(n + vec3(-slope.x, 0.0, -slope.y) * uChop);

  // And the wake's own shape. Read as the gradient of the height in the map
  // rather than carried down from the vertex stage, so the water is shaded as
  // the surface it actually is at every pixel -- including out beyond where
  // the mesh is fine enough to be displaced at all, which is most of the sea.
  float ws = max(uWakeStep, dcam * 0.004);
  float hx = wakeLift(q + vec2(ws, 0.0)) - wakeLift(q - vec2(ws, 0.0));
  float hz = wakeLift(q + vec2(0.0, ws)) - wakeLift(q - vec2(0.0, ws));
  vec2 wslope = vec2(hx, hz) / (2.0 * ws);
  // Held back with range for the same reason every octave of the chop is: a
  // slope resolved finer than the pixel it lands in is not detail, it is
  // sparkle.
  wslope *= clamp(1.0 - dcam / 9000.0, 0.0, 1.0);
  n = normalize(n + vec3(-wslope.x, 0.0, -wslope.y));

  // ---- water ---------------------------------------------------------------
  // Schlick's Fresnel about water's 0.02 reflectance: near vertical you look
  // into the water, near grazing it is a mirror of the sky. Getting this term
  // right is most of what separates sea from painted blue.
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // What is under the surface: dark, with the light of the sky carried down
  // into the backs of the waves. Water scatters green, which is why a wave
  // with the sun behind it glows and the rest of the sea does not.
  float lift = clamp(vCrest / max(uAmp * 1.6, 0.001), -1.0, 1.0);
  vec3 body = mix(uDeep, uShallow, clamp(lift * 0.5 + 0.5, 0.0, 1.0));
  float sss = pow(clamp(dot(v, -l) * 0.5 + 0.5, 0.0, 1.0), 3.0)
            * clamp(lift, 0.0, 1.0) * clamp(1.0 - ndv, 0.0, 1.0);
  body += uLightColor * sss * 0.16;

  // The sky it is reflecting: brighter overhead, and the horizon haze low down.
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uFogColor, uSkyTint, clamp(r.y * 1.8 + 0.15, 0.0, 1.0));
  vec3 col = mix(body, sky, fres);

  // ---- the light on it -----------------------------------------------------
  // A rough microfacet lobe rather than a mirror: the sun's disc smeared over
  // the chop is a glitter path, and its width is the roughness of the water.
  vec3 h = normalize(l + v);
  float ndh = clamp(dot(n, h), 0.0, 1.0);
  // Rougher with range: the further off the water is, the more of it is inside
  // one pixel, and a mirror averaged over a hundred ripples is not a mirror.
  float rough = 0.075 + 0.30 * clamp(dcam / 2500.0, 0.0, 1.0);
  float a2 = rough * rough * rough * rough;
  float dgg = a2 / max(3.14159 * pow(ndh * ndh * (a2 - 1.0) + 1.0, 2.0), 1e-5);
  float glint = dgg * clamp(dot(n, l) * 0.5 + 0.5, 0.0, 1.0);
  col += uLightColor * glint * uSpecular * 0.55 * fres * 8.0;

  // The broad pool of light on the water under the sun or the moon.
  float gd = length(vWorld.xz - uGlare) / uGlareSize;
  col += uLightColor * exp(-gd * gd * 1.6) * 0.08 * uSpecular;

  // ---- foam ----------------------------------------------------------------
  // Where the Gerstner surface folds over on itself the wave is breaking, and
  // that — not simply "high" — is where a whitecap belongs.
  float breaking = smoothstep(0.34, 0.02, vFold);
  float crest = smoothstep(uAmp * 0.85, uAmp * 1.45, vCrest);
  // Whitecaps come in patches the size of a wave, not in speckle: the noise
  // that breaks them up is metres across, not centimetres.
  float lace = onoise(q * 0.022 + uTime * 0.02) * 0.65 + onoise(q * 0.11) * 0.35;
  float foam = clamp(breaking * 1.0 + crest * 0.45, 0.0, 1.0)
             * smoothstep(0.40, 0.74, lace);
  foam *= clamp(1.0 - dcam / 7000.0, 0.0, 1.0);
  // The wake's own foam, broken up by the same lace so it is patchy the way a
  // whitecap is, but laid on far harder. A breaking crest is water with white
  // in it and sixty per cent is right for that; the wash off a battleship's
  // screws is white all the way through, and the two cannot go through the
  // same term at the same strength.
  //
  // The map cannot hold detail finer than a texel, so what it gives back is a
  // soft blob with the shape of the map's own grid in its edges. The lace is
  // put back here, where there is a sample for every pixel: a fine noise that
  // eats into the edges of the foam and leaves the middle of it alone, so a
  // wash that is solid white down the middle breaks into flecks and holes at
  // its margins the way broken water does. Faded out with range, because at
  // two miles that detail is smaller than a pixel and all it does is crawl.
  float wkB = clamp(wk.b, 0.0, 1.0);
  float fine = onoise(q * 0.42 + uTime * 0.05) * 0.62
             + onoise(q * 1.35 - uTime * 0.09) * 0.38;
  float fineLod = clamp(600.0 / max(dcam, 1.0), 0.0, 1.0);
  // Only where the map is unsure. Solid foam stays solid.
  float bite = (1.0 - smoothstep(0.55, 0.95, wkB)) * fineLod * 0.55;
  wkB *= mix(1.0, smoothstep(0.24, 0.70, fine), bite);
  float wkFoam = wkB * mix(0.62, 1.0, smoothstep(0.24, 0.86, lace))
               * clamp(1.0 - dcam / 9000.0, 0.0, 1.0);
  // Foam is lit by whatever is lighting the sea, so at night it is grey and by
  // day it is white. Painting it white either way puts snow on a night ocean.
  vec3 white = mix(uSkyTint * 1.35 + uLightColor * 0.20, vec3(0.95, 0.98, 1.0),
                   clamp(uSkyTint.r + uSkyTint.g + uSkyTint.b, 0.0, 1.0));
  col = mix(col, white, foam * 0.6);
  col = mix(col, white, wkFoam * 0.94);

  // ---- fires ashore --------------------------------------------------------
  // A reflection is a path, not a pool: widest at the source and narrowing to
  // the viewer's feet, and cut into streaks by the swell.
  if (uStreak > 0.0) {
    float reach = max(0.0, vWorld.z - cameraPosition.z);
    float halfw = 40.0 + 0.30 * reach;
    float off = (vWorld.x - uGlare.x) / halfw;
    float path = exp(-off * off * 2.4);
    path *= smoothstep(0.0, 120.0, reach)
          * (1.0 - smoothstep(uGlare.y, uGlare.y + 900.0, vWorld.z));
    path *= 1.0 - smoothstep(0.0, 1500.0, abs(vWorld.z - uGlare.y));
    vec2 sp = vec2(vWorld.x * 0.0075, vWorld.z * 0.0022 - uTime * 0.8);
    float s = onoise(sp * 2.2) * 0.65 + onoise(sp * 7.0 + 3.1) * 0.35;
    float streak = smoothstep(0.36, 0.74, s);
    col += uLightColor * uStreak * path * (streak * 0.92 + 0.08);
    col *= mix(1.0, 0.7 + 0.3 * streak, path * 0.8);
  }

  float fog = 1.0 - exp(-pow(dcam * uFogDensity, 2.0));
  col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));

  // Seen from underneath, the surface is not the opaque sheet it is from above:
  // looking steeply up it is a window onto the sky, and towards the horizontal
  // it turns into a mirror.
  float alpha = 1.0;
  if (uUnder > 0.0) {
    float look = clamp(abs(v.y), 0.0, 1.0);
    alpha = mix(0.95, 0.16, pow(look, 0.7));
    col = mix(col * 0.45 + vec3(0.02, 0.09, 0.13), col, look);
  }

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const OCEAN_PRESETS = {
  night: {
    deep: 0x040e19, shallow: 0x123049, sky: 0x1d3d5c,
    light: 0xcfe1f8, specular: 1.0, amp: 2.9, fog: 0.00005, fogColor: 0x0b1a2b,
    lightDir: new THREE.Vector3(0.35, 0.42, -1).normalize(),
  },
  dawn: {
    deep: 0x08192b, shallow: 0x1f4260, sky: 0x8a7570,
    light: 0xffc98f, specular: 0.9, amp: 2.6, fog: 0.000045, fogColor: 0x3a3f52,
    lightDir: new THREE.Vector3(0.75, 0.18, -0.6).normalize(),
  },
  dusk: {
    deep: 0x0d2338, shallow: 0x27506e, sky: 0x7d6672,
    light: 0xffd9b3, specular: 0.85, amp: 3.2, fog: 0.00005, fogColor: 0x2f3247,
    lightDir: new THREE.Vector3(-0.6, 0.25, -1).normalize(),
  },
  day: {
    deep: 0x07253d, shallow: 0x2a6c90, sky: 0x8dbcd8,
    light: 0xffffff, specular: 0.8, amp: 2.4, fog: 0.00004, fogColor: 0x8fadc2,
    lightDir: new THREE.Vector3(0.4, 0.75, -0.5).normalize(),
  },
};

/**
 * A disc of water carried under the camera, with its rings spaced
 * geometrically so the triangles are where the eye is.
 *
 * `inner` is the spacing at the middle of it and `size` the diameter, so a
 * hundred and sixty rings run from a couple of metres at the bow out to the
 * horizon — which is a tenth of the triangles a uniform grid of the same reach
 * would need, laid where they are actually looked at.
 */
function discGeometry(size, rings, sectors, inner = 3) {
  const outer = size / 2;
  const pos = [];
  const idx = [];
  // The middle, so there is no hole under the camera.
  pos.push(0, 0, 0);
  const ringR = [];
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    ringR.push(inner * Math.pow(outer / inner, t));
  }
  for (let i = 0; i < rings; i++) {
    const r = ringR[i];
    for (let j = 0; j < sectors; j++) {
      const a = (j / sectors) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  const at = (i, j) => 1 + i * sectors + ((j % sectors) + sectors) % sectors;
  for (let j = 0; j < sectors; j++) idx.push(0, at(0, j + 1), at(0, j));
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < sectors; j++) {
      const a = at(i, j);
      const b = at(i, j + 1);
      const c = at(i + 1, j + 1);
      const d = at(i + 1, j);
      idx.push(a, b, c, a, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  // It is always under the camera, so it is never off-screen.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), outer * 2);
  return geo;
}

/** A single transparent texel, for a sea nobody has sailed on yet. */
const BLANK = new THREE.DataTexture(new Uint8Array(4), 1, 1);
BLANK.needsUpdate = true;

export class Ocean {
  /**
   * @param size    diameter of the disc in metres.
   * @param detail  triangles to spend on it: the old segment count, reused so
   *                the quality setting still means something.
   */
  constructor(preset = 'night', size = 26000, detail = 260) {
    const p = OCEAN_PRESETS[preset] || OCEAN_PRESETS.night;
    this.preset = p;

    const rings = Math.max(48, Math.round(detail * 0.62));
    const sectors = Math.max(64, Math.round(detail * 0.72));
    const geo = discGeometry(size, rings, sectors, 2.5);

    // The wave train, precomputed into the form the shader wants.
    const wave = [];
    const waveB = [];
    for (const w of WAVES) {
      const k = (Math.PI * 2) / w.len;
      const len = Math.hypot(w.dir[0], w.dir[1]);
      wave.push(new THREE.Vector4(w.dir[0] / len, w.dir[1] / len, k, w.amp));
      waveB.push(new THREE.Vector2(Math.sqrt(G * k), w.steep));
    }

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: p.amp },
        uSteep: { value: 1 },
        uChop: { value: 1 },
        uFade: { value: size * 0.34 },
        uWave: { value: wave },
        uWaveB: { value: waveB },
        uDeep: { value: new THREE.Color(p.deep) },
        uShallow: { value: new THREE.Color(p.shallow) },
        uSkyTint: { value: new THREE.Color(p.sky) },
        uLightDir: { value: p.lightDir.clone() },
        uLightColor: { value: new THREE.Color(p.light) },
        uSpecular: { value: p.specular },
        uFogDensity: { value: p.fog },
        uFogColor: { value: new THREE.Color(p.fogColor) },
        uGlare: { value: new THREE.Vector2(300, 1400) },
        uGlareSize: { value: 1600 },
        uStreak: { value: 0 },
        uUnder: { value: 0 },
        // The wake map. Empty until a WakeField binds itself to these, and
        // harmless empty: a blank map is water nobody has been through.
        uWakeNear: { value: BLANK },
        uWakeFar: { value: BLANK },
        uWakeNearAt: { value: new THREE.Vector4(0, 0, 512, 0) },
        uWakeFarAt: { value: new THREE.Vector4(0, 0, 6144, 0) },
        uWakeScale: { value: 5 },
        uWakeStep: { value: 1 },
      },
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
  }

  /** Put the moon/sun pool where the light actually comes from. */
  setGlare(x, z, size = 2200) {
    this.material.uniforms.uGlare.value.set(x, z);
    this.material.uniforms.uGlareSize.value = size;
  }

  /** Strength of a broken fire reflection over the glare pool; 0 turns it off. */
  setStreak(v) {
    this.material.uniforms.uStreak.value = v;
  }

  /** Switch the surface to how it looks from underneath it. */
  setUnder(on) {
    this.material.uniforms.uUnder.value = on ? 1 : 0;
    this.material.transparent = !!on;
    this.material.depthWrite = !on;
    this.material.side = on ? THREE.DoubleSide : THREE.FrontSide;
    this.material.needsUpdate = true;
    // Drawn after the hull, so the ship still occludes the water beyond her.
    this.mesh.renderOrder = on ? 1 : -1;
  }

  setSeaState(state) {
    const k = 0.4 + state * 0.28;
    this.material.uniforms.uAmp.value = this.preset.amp * k * AMP_SCALE;
    // A calm sea is glassy and a rough one is not: the chop rides the state
    // rather than sitting at one strength whatever the weather.
    this.material.uniforms.uChop.value = 0.5 + Math.min(1.6, k) * 0.75;
  }

  update(dt, cameraPos) {
    this.material.uniforms.uTime.value += dt;
    if (cameraPos) {
      // Carried with the camera exactly. The wave field is worked out from the
      // world position of each vertex, so the water stays where it is while the
      // triangles slide under it; snapping the disc to a grid instead would
      // make the fine rings visibly crawl.
      this.mesh.position.x = cameraPos.x;
      this.mesh.position.z = cameraPos.z;
    }
  }

  /**
   * The wave parameter that lands on a world point: feed this to `gerstner()`
   * in a vertex shader and the vertex comes out at (x, z) on the surface. What
   * rides the water is placed by where it is, not by where the water started.
   */
  paramAt(x, z, time = this.material.uniforms.uTime.value) {
    const s = this.sample(x, z, time);
    return { x: s.px, z: s.pz };
  }

  /**
   * Where the surface is at a world point, and which way it is tilted.
   *
   * This mirrors `gerstner()` in the vertex shader, so hulls ride the water the
   * screen is drawing; the two have to be changed together. Gerstner waves move
   * the surface sideways as well as up, so the sample point is walked back to
   * the parameter that lands on the point asked about — three passes is inside
   * a centimetre at these steepnesses.
   */
  sample(x, z, time = this.material.uniforms.uTime.value) {
    const u = this.material.uniforms;
    const amp = u.uAmp.value;
    const steep = u.uSteep.value;
    const n = WAVES.length;
    let px = x;
    let pz = z;
    let out = { y: 0, nx: 0, ny: 1, nz: 0 };
    for (let pass = 0; pass < 3; pass++) {
      let dx = 0;
      let dy = 0;
      let dz = 0;
      let ddxx = 1;
      let ddxy = 0;
      let ddxz = 0;
      let ddzx = 0;
      let ddzy = 0;
      let ddzz = 1;
      for (let i = 0; i < n; i++) {
        const w = WAVES[i];
        const len = Math.hypot(w.dir[0], w.dir[1]);
        const dirx = w.dir[0] / len;
        const dirz = w.dir[1] / len;
        const k = (Math.PI * 2) / w.len;
        const a = w.amp * amp;
        const om = Math.sqrt(G * k);
        const q = (w.steep * steep) / Math.max(k * a * n, 1e-4);
        const ph = k * (dirx * px + dirz * pz) - om * time;
        const c = Math.cos(ph);
        const s = Math.sin(ph);
        dx += q * a * dirx * c;
        dy += a * s;
        dz += q * a * dirz * c;
        const wa = k * a;
        ddxx += -q * wa * dirx * dirx * s;
        ddxy += wa * dirx * c;
        ddxz += -q * wa * dirx * dirz * s;
        ddzx += -q * wa * dirx * dirz * s;
        ddzy += wa * dirz * c;
        ddzz += -q * wa * dirz * dirz * s;
      }
      // Walk the parameter back so the displaced point lands where asked.
      px = x - dx;
      pz = z - dz;
      // Cross of the two tangents, which is the normal.
      const nx = ddzy * ddxz - ddzz * ddxy;
      const ny = ddzz * ddxx - ddzx * ddxz;
      const nz = ddzx * ddxy - ddzy * ddxx;
      const l = Math.hypot(nx, ny, nz) || 1;
      out = { y: dy, px, pz, nx: nx / l, ny: ny / l, nz: nz / l };
    }
    return out;
  }

  /** Wave height at a world point. */
  heightAt(x, z, time = this.material.uniforms.uTime.value) {
    return this.sample(x, z, time).y;
  }

  /**
   * The attitude a hull of this length and beam takes on the sea here.
   *
   * Averaged over her whole waterplane rather than read off four corners of it.
   * That is what a hull actually does: she displaces the water under the whole
   * of her, so what lifts her is the mean level under her bottom, and a wave
   * much shorter than she is has a crest under one part of her and a trough
   * under another and lifts her not at all. Out of that one change comes both
   * halves of the behaviour -- a destroyer rides every wave because she is
   * shorter than most of them, and a carrier goes through the short ones and
   * lifts only to the long swell.
   *
   * It has to be the mean and not a fraction of a sample, because the number is
   * a water level: draw her at some damped fraction of it and the sea leaves
   * her, which puts her screws in the air at the bottom of every trough.
   */
  attitude(x, z, heading, length, beam, time = this.material.uniforms.uTime.value) {
    const sh = Math.sin(heading);
    const ch = Math.cos(heading);
    const hl = length * 0.46;
    const hb = Math.max(beam * 0.5, 4);
    const at = (fwd, side) => this.heightAt(
      x + sh * fwd + ch * side, z + ch * fwd - sh * side, time);

    // Seven stations along her, three abreast at each: enough to average out a
    // sea a good deal shorter than she is without costing a sample per metre.
    const STA = 7;
    let sum = 0;
    let n = 0;
    let fwdSum = 0;
    let aftSum = 0;
    let fwdN = 0;
    let aftN = 0;
    let portSum = 0;
    let stbdSum = 0;
    let armF = 0;
    let armS = 0;
    for (let i = 0; i < STA; i++) {
      const u = STA === 1 ? 0 : (i / (STA - 1)) * 2 - 1;   // -1 aft to +1 forward
      const fwd = u * hl;
      for (const side of [-hb * 0.7, 0, hb * 0.7]) {
        const h = at(fwd, side);
        sum += h; n++;
        if (u > 0.1) { fwdSum += h; fwdN++; armF += fwd; }
        else if (u < -0.1) { aftSum += h; aftN++; }
        if (side < 0) { portSum += h; armS += -side; }
        else if (side > 0) stbdSum += h;
      }
    }
    const heave = sum / n;
    // Pitch and roll from the difference between her halves, over the distance
    // between where those halves act.
    const armFwd = fwdN ? armF / fwdN : hl;
    const trim = fwdN && aftN ? (fwdSum / fwdN) - (aftSum / aftN) : 0;
    const list = (stbdSum - portSum) / STA;
    const armSide = armS / STA;
    return {
      heave,
      pitch: Math.atan2(trim, armFwd * 2),
      roll: Math.atan2(list, armSide * 2),
    };
  }
}
