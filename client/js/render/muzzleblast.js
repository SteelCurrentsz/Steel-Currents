// What a big gun leaves in the air when it goes off.
//
// Three things, on three clocks. The flash is a ball of burning propellant gas
// thrown out of the muzzle, white at the heart and orange at the skin, and it
// is gone in a fifth of a second. The cloud it burns into is the part that
// makes it a gun: brown-grey, shoved out along the bore faster than anything
// else on the screen and then stopped dead by the air, lit from inside for an
// instant by the fire it came out of. After that it only hangs there, boiling
// over slowly, drifting down the wind and thinning into rags for fifteen or
// twenty seconds while the ship steams out from under it. And under a heavy
// gun laid low, the blast hits the sea and throws a ring of spray off it.
//
// None of it is little round sprites. A cloud built out of a few dozen soft
// dots reads as a few dozen soft dots, however many there are; what a cloud of
// gunsmoke actually is, is a few big lumpy masses, each one lit on the side the
// sun is on and dark in its own folds. So each piece here is a card big enough
// to be one of those masses, drawn as a sphere with a cauliflower skin, and the
// skin is three-dimensional noise sampled on the sphere's own surface -- fixed
// to the world, so walking round a cloud shows its other side rather than the
// same picture turned to face you.
//
// Every piece of every blast is one instance of one quad, in one draw, sorted
// back to front on the CPU each frame. A fleet action puts a few hundred of
// them in the air; one draw call and a sort of a few hundred numbers is
// nothing, where a mesh apiece was a draw call apiece.

import * as THREE from '../../../vendor/three.module.js';

// What each card is.
const FLASH = 0;   // burning gas: light, not smoke
const SMOKE = 1;   // the cloud, hot for a moment and then only smoke
const RING = 2;    // the blast on the water, lying flat
const JET = 3;     // the tongue of flame driven out down the bore

/**
 * How big a gun's blast is, in metres: roughly the distance its cloud is
 * thrown out down the bore. A sixteen-inch gun puts its smoke fifty metres out;
 * a five-inch about sixteen. Near enough in proportion to the bore, because the
 * charge goes up with its cube and a ball of gas with the cube root of that.
 */
export function blastSize(caliber) {
  return 1 + caliber * 0.12;
}

/**
 * How a blast is built: how many cards of each kind, how long they last.
 *
 * `sibling` is a barrel of a mounting whose first barrel has already been
 * drawn this frame. Three barrels of one turret fire into one cloud, not
 * three, and drawing three full clouds on top of one another turns a broadside
 * into a white wall.
 */
export function blastRecipe(caliber, sibling = false, intensity = 1) {
  const S = Math.min(1.2, caliber / 406);
  // A good many heads to a heavy gun's cloud rather than a few big ones: it
  // is the number of them, each lit on its own sunny side and dark in its own
  // folds, that makes a cloud read as billowing smoke and not as a blur.
  let smoke = caliber >= 300 ? 8 : caliber >= 180 ? 6 : caliber >= 120 ? 4 : 3;
  smoke = Math.max(1, Math.round(smoke * Math.min(1.3, Math.max(0.5, intensity))));
  if (sibling) smoke = Math.max(1, Math.round(smoke * 0.34));
  return {
    size: blastSize(caliber),
    // The core, the ball, and on a heavy gun the jet out ahead of it. The
    // other barrels of a turret fire into the first one's fireball, so they
    // get only the white core on their own muzzles: three fireballs stacked
    // on one another burn out to a flat yellow.
    flash: sibling ? 1 : caliber >= 200 ? 3 : 2,
    flashLife: 0.10 + caliber * 0.0003,
    // And every barrel its own jet of flame down the bore, a tenth of a
    // second on a sixteen-inch gun.
    jet: 1,
    jetLife: 0.07 + caliber * 0.0001,
    smoke,
    smokeLife: 8 + caliber * 0.026,
    // How long the fire is still alight inside the cloud: about as long as
    // the flash itself, which it is the tail end of.
    heat: 0.04 + 0.05 * S,
    opacity: 0.76 + 0.18 * Math.min(1, S),
    ring: !sibling && caliber >= 100,
    ringLife: 0.55 + 0.55 * S,
  };
}

// --------------------------------------------------------------- noise --

/**
 * Random values laid out so one bilinear fetch gives two layers of a 3D
 * lattice: the green channel is the red one shifted by (37, 17), which is
 * where the next layer up starts. One texture read per octave of value noise
 * instead of eight hashes, which is the difference between a cloud the GPU can
 * afford a screenful of and one it cannot.
 */
export function noiseTexture() {
  const N = 256;
  const r = new Uint8Array(N * N);
  let s = 0x9e3779b9;
  for (let i = 0; i < r.length; i++) {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    s ^= s >>> 12;
    r[i] = s & 255;
  }
  const data = new Uint8Array(N * N * 2);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const o = (y * N + x) * 2;
      data[o] = r[y * N + x];
      data[o + 1] = r[((y + 17) & 255) * N + ((x + 37) & 255)];
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------- shaders --

const VERT = /* glsl */`
attribute vec4 iCenter;   // where, and the half-width of the card
attribute vec4 iA;        // age, life, how long it burns, seed
attribute vec4 iB;        // what it is, opacity, how hot, and a jet's width
attribute vec4 iTint;     // what colour the smoke is, in daylight; a jet's bore
uniform float uFogDensity;
uniform vec3 uSunDir;
varying vec2 vUv;
varying vec4 vA;
varying vec4 vB;
varying vec3 vTint;
varying vec3 vSunV;
varying float vFog;
varying float vKeep;      // how much of it survives the sea and the lens

void main() {
  vUv = position.xy * 2.0;
  vA = iA;
  vB = iB;
  vTint = iTint.rgb;
  vSunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float R = iCenter.w;
  vec4 mv;
  if (iB.x > 2.5) {
    // The jet: a card laid along the bore as the eye sees it, from the muzzle
    // out to the length it has reached, as wide as the flame. Seen down the
    // bore it shortens to a bloom as wide as it is long, which is what a gun
    // firing at you looks like.
    vec3 dirV = normalize((viewMatrix * vec4(iTint.xyz, 0.0)).xyz);
    vec4 m0 = viewMatrix * vec4(iCenter.xyz, 1.0);
    vec2 ax = dirV.xy;
    float al = length(ax);
    ax = al > 1e-4 ? ax / al : vec2(1.0, 0.0);
    vec2 across = vec2(-ax.y, ax.x);
    float W = iB.w;
    float run = R * al + W;
    float along = position.y + 0.5;
    mv = m0;
    mv.xy += ax * (along * run - 0.35 * W) + across * position.x * 2.0 * W;
    mv.z += dirV.z * R * along;
    // Across in widths, and along in fractions of the flame's own length --
    // nought at the muzzle, one at the tip -- so the shape is drawn the same
    // whichever way it is seen from.
    vUv = vec2(position.x * 2.0, (along * run - 0.35 * W) / max(R * al + 0.3 * W, 1e-3));
    vKeep = 1.0;
  } else if (iB.x > 1.5) {
    // The ring lies on the water rather than facing the camera.
    mv = viewMatrix * vec4(iCenter.xyz + vec3(position.x, 0.0, position.y) * 2.0 * R, 1.0);
    vKeep = 1.0;
  } else {
    mv = viewMatrix * vec4(iCenter.xyz, 1.0);
    // A flash miles off is still a flash: the light of it blooms to a few
    // pixels whatever the geometry says, and a salvo you cannot see fired is
    // one you cannot see coming.
    if (iB.x < 0.5) R = max(R, 0.008 * -mv.z / projectionMatrix[1][1]);
    vec2 off = position.xy * 2.0 * R;
    mv.xy += off;
    // Where on the card is in the world, for the sea. The rows of the view
    // matrix are the camera's axes, so this is the card's own up and right.
    float wy = iCenter.y + viewMatrix[1][0] * off.x + viewMatrix[1][1] * off.y;
    // Gone into the sea softly rather than cut off by it: a flat card meeting
    // the swell draws the swell, in a hard line along its bottom edge.
    float sea = smoothstep(0.0, clamp(R * 0.35, 2.0, 14.0), wy);
    // And thinned as the eye goes into it, or a cloud the camera is inside is
    // one grey card across the whole of the screen.
    float near = smoothstep(0.7 * R, 2.4 * R, -mv.z);
    vKeep = sea * mix(1.0, near, step(0.5, iB.x));
  }
  float fd = uFogDensity * length(mv.xyz);
  vFog = 1.0 - exp(-fd * fd);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */`
uniform sampler2D uNoise;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
uniform vec3 uFogColor;
varying vec2 vUv;
varying vec4 vA;
varying vec4 vB;
varying vec3 vTint;
varying vec3 vSunV;
varying float vFog;
varying float vKeep;

float vn(vec3 x) {
  vec3 p = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  vec2 uv = p.xy + vec2(37.0, 17.0) * p.z + f.xy;
  vec2 rg = texture2D(uNoise, (uv + 0.5) / 256.0).xy;
  return mix(rg.x, rg.y, f.z);
}

float fbm4(vec3 p) {
  float v = 0.5 * vn(p);
  p = p * 2.03 + vec3(1.7, 9.2, 3.1);
  v += 0.25 * vn(p);
  p = p * 2.01 + vec3(5.3, 2.8, 7.7);
  v += 0.125 * vn(p);
  p = p * 2.04 + vec3(3.9, 6.1, 1.3);
  return v + 0.0625 * vn(p);
}

float fbm2(vec3 p) {
  return 0.5 * vn(p) + 0.25 * vn(p * 2.03 + vec3(1.7, 9.2, 3.1));
}

// Burning gas, by how hot: dull red at the edges where it is mixing with the
// air, through orange, to a near-white heart. Kept off pure white except in
// the very middle, or the flash is a light bulb rather than a fire.
vec3 fireRamp(float t) {
  vec3 c = mix(vec3(0.22, 0.035, 0.005), vec3(0.88, 0.22, 0.025), smoothstep(0.0, 0.28, t));
  c = mix(c, vec3(1.0, 0.50, 0.10), smoothstep(0.24, 0.52, t));
  c = mix(c, vec3(1.0, 0.72, 0.30), smoothstep(0.50, 0.78, t));
  return mix(c, vec3(1.0, 0.93, 0.78), smoothstep(0.80, 1.0, t));
}

// The card as a sphere seen face on: the surface point under this pixel, in
// view space. Past the limb it is the limb, so the lumps standing out from it
// still have a direction to be sampled in.
vec3 ball(vec2 p, out float z) {
  float r = length(p);
  float rc = min(r, 1.0);
  z = sqrt(max(0.0, 1.0 - rc * rc));
  return r > 1.0 ? vec3(p / r, 0.0) : vec3(p, z);
}

vec4 flash(vec2 p, float r, float age, float u, float seed, float hot) {
  float z;
  vec3 nW = (vec4(ball(p, z), 0.0) * viewMatrix).xyz;
  // Fast: a flame changes shape completely in a few frames. Warped, so it
  // tears into tongues rather than rippling evenly round a ball.
  vec3 q = nW * 2.4 + vec3(seed * 53.0, seed * 29.0, age * 11.0);
  q += (vn(q * 0.5 + 7.0) - 0.5) * 1.6;
  float n = fbm4(q);
  float N = clamp((n - 0.47) * 3.0, -1.0, 1.0);
  float fine = vn(q * 4.1 + 3.0) - 0.5;
  // The noise pushes the edge out in places and eats it back in others.
  float edge = (0.56 + 0.12 * u) * (1.0 + 0.55 * N + 0.25 * fine);
  float body = 1.0 - smoothstep(edge * 0.74, edge, r);
  // Up in a frame and going straight away.
  float env = smoothstep(0.0, 0.01, age) * pow(1.0 - u, 1.3);
  // Hottest at the heart and in the thick of the turbulence; cooling in from
  // the outside, and all of it cooling as it goes.
  // And for the first two or three frames, white: the instant the gas leaves
  // the muzzle it is far hotter than anything that follows.
  float burst = exp(-age / 0.035);
  float t = hot * (1.2 - 0.95 * r / max(edge, 0.05)) + 0.38 * N + 0.2 * fine - u * 0.75
          + 0.45 * burst * hot;
  // Soot rolling through it as it cools: the dark veins across a fireball are
  // most of what separates one from a glowing balloon.
  float vein = smoothstep(0.50, 0.72, vn(q * 1.9 + 21.0))
             * smoothstep(0.1, 0.7, u + (1.0 - hot) * 0.45);
  // Toward a dark red-brown, not toward black: yellow scaled down is olive,
  // and a green fireball is the one colour a fireball never is.
  // Where it is thin or going out it is cooler, and so redder: dim yellow over
  // a blue sky adds up to green, which is not a colour fire comes in.
  t *= 0.45 + 0.55 * body * env;
  vec3 c = mix(fireRamp(clamp(t, 0.0, 1.0)), vec3(0.20, 0.06, 0.02), 0.8 * vein);
  // The light it throws round itself, which is what a bright thing does to an
  // eye. Out well inside the card, or the card shows as a pale square.
  float glow = (exp(-r * r * 3.5) * 0.30 + exp(-r * 2.2) * 0.08)
             * (1.0 - smoothstep(0.55, 1.0, r));
  // Not much past one: the red runs out of room first, and a fire whose red
  // has stopped while its green carries on climbing turns lemon.
  vec3 rgb = c * body * env * (0.80 + 0.50 * hot)
           + vec3(1.0, 0.58, 0.26) * glow * env * (0.25 + 0.6 * hot) * (1.0 + 2.2 * burst);
  // A body to it as well. A fireball is thick: it hides what is behind it,
  // most of all through the middle, rather than only adding light to it.
  float a = body * env * (0.75 + 0.2 * vein) * (0.6 + 0.4 * z);
  return vec4(rgb * (1.0 - vFog * 0.7), a);
}

// The flame out of the muzzle: a cone of burning gas, white where it leaves
// the bore, yellow and then orange toward its ragged tip, widening as it goes.
// It is the first thing to arrive and the first to go -- out to its full
// length in a couple of frames and burnt out in a tenth of a second -- and it
// is what makes a gun's flash a blast driven one way rather than a ball.
vec4 jet(vec2 p, float age, float u, float seed) {
  float s = clamp(p.y, 0.0, 1.0);
  // How far out it has got: the gas is out of the bore faster than the eye.
  float reach = smoothstep(0.0, 0.035, age);
  if (p.y > reach + 0.02) return vec4(0.0);
  float sr = s / max(reach, 0.05);
  vec3 q = vec3(p.x * 2.2, sr * 3.4 - age * 40.0, seed * 47.0);
  float n = fbm2(q) + 0.35 * (vn(q * 3.1 + 5.0) - 0.5);
  // Narrow at the muzzle, opening out, and torn ragged at the sides and tip.
  float hw = (0.16 + 0.84 * pow(sr, 0.7)) * (0.85 + 0.55 * (n - 0.45));
  float side = 1.0 - smoothstep(hw * 0.55, hw, abs(p.x));
  float tip = 1.0 - smoothstep(0.72, 1.0, sr + 0.25 * (n - 0.5));
  float back = smoothstep(-0.12, 0.04, p.y);
  float body = side * tip * back;
  float env = smoothstep(0.0, 0.008, age) * pow(1.0 - u, 1.6);
  // Hottest on the axis close to the muzzle; cooler out at the edges and tip.
  float t = (1.15 - 0.85 * sr) * (1.0 - 0.55 * abs(p.x) / max(hw, 0.05)) + 0.25 * (n - 0.5) - 0.6 * u;
  vec3 c = fireRamp(clamp(t, 0.0, 1.0)) * (1.1 + 0.6 * exp(-age / 0.02));
  float a = body * env * (0.75 + 0.25 * (1.0 - sr));
  return vec4(c * a * (1.0 - vFog * 0.7), a * 0.85);
}

vec4 smoke(vec2 p, float r, float age, float u, float tau, float seed, float op) {
  // The ball sits inside the card with room round it for the lumps. Its
  // shading is worked out on a sphere the size of the whole card, though:
  // taken off the ball itself, the light changes abruptly where the ball's
  // limb is, and that draws a circle inside every cloud.
  float z;
  vec3 nV = ball(p, z);
  vec3 nW = (vec4(nV, 0.0) * viewMatrix).xyz;
  // Small enough inside the card that its tallest heads still stand clear of
  // the card's edge. Let out to the edge, they were cut off by it in an arc,
  // and a cloud with a circle drawn round its top is a cloud on a card.
  float rb = length(p / 0.64);

  // The field it is made of. Fixed to the cloud, and turning over slowly the
  // whole time: that slow boil is the difference between smoke and a grey
  // balloon. Two scales of it: the heads, a few to a card, which give the
  // cloud its shape and its light; and the fine stuff on top of them, which
  // gives it a texture and tears it into rags at the end.
  vec3 q = nW * 1.15 + vec3(seed * 61.0, seed * 17.0 - age * 0.06, seed * 33.0);
  // Warped, or the heads are round and evenly spaced, which real smoke never is.
  q += (vn(q * 0.7 + 11.0) - 0.5) * vec3(1.3, 0.9, -1.1);
  float H = fbm2(q);
  float Hn = clamp((H - 0.37) * 3.6, -1.0, 1.0);
  float n = 0.5 * vn(q * 2.6 + 4.0) + 0.3 * vn(q * 5.3 + 9.0) + 0.2 * vn(q * 10.9 + 2.0);
  float N = clamp((n - 0.5) * 2.8, -1.0, 1.0);

  // The cauliflower: heads standing proud of the mean radius, and the edge
  // going from firm to ragged as the cloud loses the shove that made it.
  // Firm and sharp-edged while it is new and dense -- the heads of a fresh
  // cloud of cordite smoke stand out against the sky like cauliflower --
  // softening only as it thins.
  float lump = 1.0 + 0.25 * Hn + 0.18 * N;
  float soft = mix(0.11, 0.40, smoothstep(0.0, 0.7, u));
  float a = 1.0 - smoothstep(lump * (1.0 - soft), lump * (1.0 + soft * 0.35), rb);
  a *= 1.0 - smoothstep(0.92, 1.0, r);
  if (a < 0.003) return vec4(0.0);

  // Thickest through the middle, and coming apart into separate rags as it
  // thins -- from the outside in, the way smoke does, not evenly all over.
  // Thin at the limb, where the eye only grazes it, so the heads are firm
  // through their middles and feathered at their edges rather than glassy
  // discs with a hard rim.
  float dens = a * (0.30 + 0.70 * z) * (0.82 + 0.3 * N);
  float thr = 0.62 * smoothstep(0.06, 1.0, u);
  dens *= smoothstep(thr - 0.06, thr + 0.24, (H * 0.55 + n * 0.45) * 0.9 + z * 0.3);

  // Light. The sphere gives the broad shape of it; the heads are found by
  // looking a little way toward the sun -- more smoke that way means this
  // point is in the shadow of a head, less means it is on top of one.
  float Hl = fbm2(q + uSunDir * 0.55);
  float bump = clamp(0.5 + (H - Hl) * 4.0, 0.0, 1.0);
  // Leant toward the eye: lit right out to the limb, a sphere draws its own
  // outline, and a cloud of them is a cloud of outlines.
  float lam = clamp(dot(normalize(vec3(nV.xy, nV.z + 0.4)), vSunV) * 0.55 + 0.45, 0.0, 1.0);
  float sunK = lam * mix(0.16, 1.45, bump) * (0.80 + 0.40 * N);
  // The sky gets into the heads and not into the folds between them.
  vec3 amb = mix(uGroundCol, uSkyCol, nW.y * 0.5 + 0.5)
           * mix(0.58, 1.10, bump) * mix(0.74, 1.05, smoothstep(-0.7, 0.7, Hn));
  // Dirty and brown while it is thick and new -- cordite smoke comes out of a
  // gun a yellowish brown -- greying as it thins out.
  vec3 albedo = vTint * mix(vec3(0.70, 0.61, 0.49), vec3(1.0), smoothstep(0.0, 0.2, u));
  vec3 col = albedo * (uSunCol * sunK + amb);
  // Looking toward the sun through the thin edge of it, the edge lights up.
  col += uSunCol * pow(max(0.0, -vSunV.z), 3.0) * (1.0 - z) * (1.0 - dens) * 0.55;

  // The fire still in it, for the first moment: in patches through the
  // thickest of it, where the gas has not yet mixed with enough air to go
  // out -- not a disc of orange the size of the card.
  float heat = tau > 0.0 ? exp(-age / tau) : 0.0;
  float spot = smoothstep(0.35, 1.0, z) * smoothstep(0.48, 0.80, H * 0.6 + n * 0.4 + 0.1 * z);
  float t = heat * spot * 1.25;
  vec3 em = fireRamp(clamp(t, 0.0, 1.0)) * smoothstep(0.02, 0.25, t) * 1.2 * heat;
  // And soot while it burns, lit from inside where the fire still is -- and
  // all of it, for the instant the flash is alight inside it, lit orange.
  // The light through it is filtered on the way, toward red: grey laid over
  // a yellow flame comes out olive, and smoke in front of a fire never does.
  // Over in a few frames: lit by the fire it came out of, not glowing on its
  // own, so it is smoke a moment after the flash is gone and not a bank of
  // orange fog.
  float lit = tau > 0.0 ? exp(-age / 0.045) : 0.0;
  col = col * (1.0 - 0.45 * heat) * mix(vec3(1.0), vec3(1.3, 0.85, 0.55), lit)
      + vec3(0.55, 0.22, 0.06) * heat * spot * 0.7
      + vec3(0.85, 0.42, 0.14) * lit * (0.25 + 0.35 * z) * (0.7 + 0.6 * H);

  // It comes out of the fireball as the fireball cools, rather than being
  // there over the top of it from the first frame; then it is at its thickest,
  // and thins slowly for the rest of its life.
  float env = smoothstep(0.0, 0.16, age) * pow(1.0 - u, 1.5);
  float alpha = clamp(dens * op * env, 0.0, 1.0);
  // The glow goes with the smoke it is in, edges and all: drawn on the
  // silhouette alone it is a hot disc, and a hot disc half hidden behind the
  // next puff is a ring.
  vec3 rgb = col * alpha + em * min(1.0, dens * 1.6) * op * smoothstep(0.0, 0.03, age);
  rgb = mix(rgb, uFogColor * alpha, vFog);
  return vec4(rgb, alpha);
}

vec4 ring(vec2 p, float r, float age, float u, float seed) {
  // The front runs out fast and slows; behind it the sea is roughed white.
  // Not a drawn circle: a broken band of spray, torn up by the water it is
  // running over, widening and going ragged as it slows.
  float front = 0.12 + 0.80 * sqrt(u);
  float w = 0.07 + 0.22 * u;
  float d = (r - front) / w;
  float band = exp(-d * d);
  float n = vn(vec3(p * 6.0, seed * 31.0)) * 0.55 + vn(vec3(p * 15.0, seed * 13.0 + 5.0)) * 0.45;
  float a = band * smoothstep(0.22, 0.72, n) * pow(1.0 - u, 1.4) * 0.40;
  a += (1.0 - smoothstep(0.0, front, r)) * smoothstep(0.4, 0.8, n) * 0.08 * (1.0 - u);
  a *= 1.0 - smoothstep(0.82, 1.0, r);
  vec3 c = vTint * (uSunCol * 0.7 + uSkyCol);
  c = mix(c, uFogColor, vFog);
  return vec4(c * a, a);
}

void main() {
  vec2 p = vUv;
  float age = vA.x;
  float u = clamp(age / vA.y, 0.0, 1.0);
  if (vB.x > 2.5) {
    vec4 j = jet(p, age, u, vA.w);
    if (j.a < 0.002) discard;
    gl_FragColor = j;
    return;
  }
  float r = length(p);
  if (r > 1.0) discard;
  vec4 c;
  if (vB.x < 0.5) c = flash(p, r, age, u, vA.w, vB.z);
  else if (vB.x < 1.5) c = smoke(p, r, age, u, vA.z, vA.w, vB.y);
  else c = ring(p, r, age, u, vA.w);
  c *= vKeep;
  if (c.a < 0.002 && max(c.r, max(c.g, c.b)) < 0.002) discard;
  gl_FragColor = c;
}
`;

// ---------------------------------------------------------- the light --

/**
 * What the air is like, as the smoke sees it: the colour of the sun on its lit
 * side, of the sky on its shaded side, of the sea under it. In display
 * colours, because that is what these shaders write -- the same as the
 * explosions, so a burning ship and the gun that set her alight agree.
 */
export const SKIES = {
  day: { sun: [0.74, 0.71, 0.65], sky: [0.40, 0.44, 0.50], ground: [0.24, 0.29, 0.32] },
  dawn: { sun: [0.72, 0.52, 0.36], sky: [0.30, 0.29, 0.35], ground: [0.13, 0.15, 0.18] },
  dusk: { sun: [0.68, 0.49, 0.37], sky: [0.27, 0.27, 0.34], ground: [0.12, 0.14, 0.17] },
  night: { sun: [0.21, 0.24, 0.31], sky: [0.10, 0.12, 0.17], ground: [0.04, 0.05, 0.07] },
};

// Propellant smoke in daylight: a light, faintly warm grey.
const SMOKE_TINT = [0.86, 0.83, 0.78];
export const SPRAY_TINT = [0.86, 0.89, 0.92];

const MAX = 768;

const _side = new THREE.Vector3();
const _up = new THREE.Vector3();

/** Every gun blast in the scene: one pool, one draw. */
export class MuzzleBlasts {
  constructor(scene, { intensity = 1, max = MAX } = {}) {
    this.scene = scene;
    this.intensity = intensity;
    this.max = max;
    this.parts = [];
    // The barrels already drawn this frame, so the second and third of a
    // turret join the first one's cloud instead of making their own.
    this.batch = [];
    this.wind = { x: 0, z: 0 };
    this.fogColor = new THREE.Color(0, 0, 0);

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(
      [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const attr = (name) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    };
    this.aCenter = attr('iCenter');
    this.aA = attr('iA');
    this.aB = attr('iB');
    this.aTint = attr('iTint');
    geo.instanceCount = 0;
    this.geo = geo;

    this.noise = noiseTexture();
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uNoise: { value: this.noise },
        uSunDir: { value: new THREE.Vector3(0.4, 0.75, -0.5).normalize() },
        uSunCol: { value: new THREE.Color() },
        uSkyCol: { value: new THREE.Color() },
        uGroundCol: { value: new THREE.Color() },
        uFogColor: { value: this.fogColor },
        uFogDensity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      // Premultiplied: the fire adds light and the smoke takes it away, and
      // neither straight additive nor straight alpha can do both.
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    // Raw colours out, like every other effect shader in the game.
    this.mat.toneMapped = false;
    this.setAtmosphere({});

    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
    scene.add(this.mesh);

    this._eye = new THREE.Vector3();
    this._order = [];
  }

  /**
   * The hour, the cloud and the wind.
   *
   * `sunDir` points at the sun. `overcast` 0 to 1 takes the sun off the lit
   * side and spreads it over the sky, which is why smoke on a grey day is flat.
   * `wind` is metres a second over the water, x and z.
   */
  setAtmosphere({ preset = 'day', overcast = 0, sunDir = null, wind = null } = {}) {
    const k = SKIES[preset] || SKIES.day;
    const u = this.mat.uniforms;
    const sun = new THREE.Color(...k.sun);
    const sky = new THREE.Color(...k.sky);
    // What the sun loses under cloud mostly comes back as sky.
    const flat = (sun.r + sun.g + sun.b) / 3;
    u.uSunCol.value.copy(sun).multiplyScalar(1 - 0.85 * overcast);
    u.uSkyCol.value.copy(sky).lerp(new THREE.Color(
      (sky.r + sky.g + sky.b) / 3 + flat * 0.4,
      (sky.r + sky.g + sky.b) / 3 + flat * 0.4,
      (sky.r + sky.g + sky.b) / 3 + flat * 0.42), overcast);
    u.uGroundCol.value.setRGB(...k.ground);
    if (sunDir) u.uSunDir.value.copy(sunDir).normalize();
    if (wind) { this.wind.x = wind.x || 0; this.wind.z = wind.z || 0; }
  }

  /** One card into the pool, recycling the most nearly gone if it is full. */
  add(p) {
    if (this.parts.length >= this.max) {
      let worst = 0;
      let k = -1;
      for (let i = 0; i < this.parts.length; i++) {
        const q = this.parts[i];
        const e = q.age / q.life;
        if (e > worst) { worst = e; k = i; }
      }
      if (k < 0) return null;
      this.parts[k] = this.parts[this.parts.length - 1];
      this.parts.pop();
    }
    p.age = p.age || 0;
    p.r = p.r0;
    this.parts.push(p);
    return p;
  }

  /**
   * A gun going off at (x, y, z), its bore pointing along `dir`.
   *
   * Call once a barrel. The first barrel of a mounting gets the full blast;
   * the others fired in the same frame from within a few metres of it get
   * their own flash and a share of the cloud.
   */
  /** Whether a barrel within a few metres of (x, y, z) has fired this frame. */
  near(x, y, z) {
    for (const b of this.batch) {
      const dx = b.x - x, dy = b.y - y, dz = b.z - z;
      if (dx * dx + dy * dy + dz * dz < 64) return true;
    }
    return false;
  }

  fire(x, y, z, dir, caliber = 152) {
    const sibling = this.near(x, y, z);
    this.batch.push({ x, y, z });

    const R = blastRecipe(caliber, sibling, this.intensity);
    const L = R.size;
    const d = dir;
    // Two directions across the bore, for scattering things off its line.
    _side.set(-d.z, 0, d.x);
    if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
    _side.normalize();
    _up.crossVectors(_side, d).normalize();
    if (_up.y < 0) _up.negate();

    // The flash. A white core sitting on the muzzle, the ball of burning gas
    // out in front of it, and on a heavy gun the jet beyond that -- each a
    // little further, bigger and cooler, so seen from the side it is a fire
    // with a shape and seen down the bore it is a bloom.
    const flashes = [
      { at: 0.03, out: 0.08, r0: 0.10, r1: 0.24, life: 0.55, hot: 1.0 },
      { at: 0.10, out: 0.48, r0: 0.20, r1: 0.68, life: 1.0, hot: 0.8 },
      { at: 0.20, out: 1.00, r0: 0.14, r1: 0.44, life: 0.8, hot: 0.55 },
    ];
    for (let i = 0; i < R.flash; i++) {
      const f = flashes[i];
      const k = 10;
      this.add({
        kind: FLASH,
        x: x + d.x * f.at * L, y: y + d.y * f.at * L, z: z + d.z * f.at * L,
        vx: d.x * (f.out - f.at) * L * k, vy: d.y * (f.out - f.at) * L * k,
        vz: d.z * (f.out - f.at) * L * k,
        k, lift: 0, windK: 0,
        r0: f.r0 * L, r1: f.r1 * L * (0.9 + Math.random() * 0.2), rg: 16, grow: 0,
        life: R.flashLife * f.life * (0.9 + Math.random() * 0.2),
        tau: 0, seed: Math.random(), op: 1, hot: f.hot, tint: SMOKE_TINT,
      });
    }

    // The jet: from the muzzle out along the bore, white at the root and
    // orange at its ragged tip, out to its full length in a couple of frames
    // and burnt out before the cloud has formed round it.
    for (let i = 0; i < R.jet; i++) {
      this.add({
        kind: JET, x, y, z, vx: 0, vy: 0, vz: 0, k: 0, lift: 0, windK: 0,
        r0: 0.9 * L, r1: 0.9 * L, rg: 1, grow: 0, w: 0.17 * L,
        life: R.jetLife * (0.9 + Math.random() * 0.2),
        tau: 0, seed: Math.random(), op: 1, hot: 1, tint: [d.x, d.y, d.z],
      });
    }

    // The cloud: thrown out down the bore, each card further than the last
    // and each stopping where the air stops it, so what stands there is a
    // bank with a shape -- dense by the muzzle, ragged at the far end.
    const n = R.smoke;
    for (let i = 0; i < n; i++) {
      const f = sibling ? 0.3 + Math.random() * 0.5 : (n > 1 ? i / (n - 1) : 0.4);
      const reach = (0.15 + 0.95 * f) * L;
      const k = 4.5 + Math.random();
      const s = (Math.random() - 0.5) * 0.34 * L;
      const h = (Math.random() - 0.25) * 0.16 * L;
      const start = 0.05 * L;
      this.add({
        kind: SMOKE,
        x: x + d.x * start, y: y + d.y * start, z: z + d.z * start,
        vx: (d.x * (reach - start) + _side.x * s + _up.x * h) * k,
        vy: (d.y * (reach - start) + _side.y * s + _up.y * h) * k,
        vz: (d.z * (reach - start) + _side.z * s + _up.z * h) * k,
        k,
        // Hot, so it climbs for a while; then it is only drifting.
        lift: 0.6 + 1.2 * Math.min(1, caliber / 406),
        windK: 1,
        r0: 0.12 * L,
        r1: (0.30 + 0.22 * f) * L * (0.88 + Math.random() * 0.24) * (sibling ? 1.1 : 1),
        rg: 6 + Math.random() * 1.5,
        grow: 0.014 * L * (1 + f),
        life: R.smokeLife * (0.85 + Math.random() * 0.3),
        tau: R.heat * (1 - 0.6 * f),
        seed: Math.random(), op: R.opacity, hot: 0, tint: SMOKE_TINT,
      });
    }

    // The blast on the water, if the gun is low enough over it for the blast
    // to reach it -- which a heavy gun laid for a near target always is.
    if (R.ring && y < 0.07 * caliber + 3) {
      this.add({
        kind: RING,
        x: x + d.x * 0.4 * L, y: 0.6, z: z + d.z * 0.4 * L,
        vx: 0, vy: 0, vz: 0, k: 0, lift: 0, windK: 0,
        r0: 0.95 * L, r1: 0.95 * L, rg: 1, grow: 0,
        life: R.ringLife, tau: 0, seed: Math.random(), op: 1, hot: 0, tint: SPRAY_TINT,
      });
    }
  }

  /**
   * A plain cloud with no fire in it: dust off the ground under a coast gun,
   * say. Velocity is metres a second at birth; it stops the way the gun smoke
   * does.
   */
  puff(x, y, z, vx, vy, vz, size, life, tint = SMOKE_TINT, opacity = 0.6) {
    this.add({
      kind: SMOKE, x, y, z, vx, vy, vz, k: 3, lift: 0.3, windK: 1,
      r0: size * 0.5, r1: size, rg: 3, grow: size * 0.06,
      life, tau: 0, seed: Math.random(), op: opacity, hot: 0, tint,
    });
  }

  update(dt, camera) {
    this.batch.length = 0;
    const u = this.mat.uniforms;
    const fog = this.scene.fog;
    if (fog && fog.isFogExp2) {
      // Fog colours live in linear space; these shaders write display colours.
      this.fogColor.copy(fog.color).convertLinearToSRGB();
      u.uFogDensity.value = fog.density;
    } else {
      u.uFogDensity.value = 0;
    }

    const parts = this.parts;
    const wx = this.wind.x, wz = this.wind.z;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) {
        parts[i] = parts[parts.length - 1];
        parts.pop();
        continue;
      }
      // The blast's shove dies away in a fraction of a second; then it is the
      // wind's, and the smoke's own heat lifting it.
      const damp = Math.exp(-p.k * dt);
      p.vx *= damp; p.vy *= damp; p.vz *= damp;
      const w = p.windK * (1 - Math.exp(-p.age * 0.7));
      const rise = p.lift * Math.exp(-p.age / 6) + (p.kind === SMOKE ? 0.25 : 0);
      p.x += (p.vx + wx * w) * dt;
      p.y += (p.vy + rise) * dt;
      p.z += (p.vz + wz * w) * dt;
      if (p.kind === SMOKE && p.y < 1) p.y = 1;
      p.r = p.r0 + (p.r1 - p.r0) * (1 - Math.exp(-p.age * p.rg)) + p.grow * p.age;
    }

    const count = parts.length;
    this.geo.instanceCount = count;
    this.mesh.visible = count > 0;
    if (!count) return;

    // Back to front, or a dark fold at the back of a cloud is drawn over the
    // lit head at the front of it.
    const order = this._order;
    order.length = count;
    for (let i = 0; i < count; i++) order[i] = i;
    if (camera) {
      const e = camera.getWorldPosition(this._eye);
      for (const p of parts) {
        const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z;
        p.depth = dx * dx + dy * dy + dz * dz;
      }
      order.sort((a, b) => parts[b].depth - parts[a].depth);
    }

    const C = this.aCenter.array, A = this.aA.array, B = this.aB.array, T = this.aTint.array;
    for (let j = 0; j < count; j++) {
      const p = parts[order[j]];
      const o = j * 4;
      C[o] = p.x; C[o + 1] = p.y; C[o + 2] = p.z; C[o + 3] = p.r;
      A[o] = p.age; A[o + 1] = p.life; A[o + 2] = p.tau; A[o + 3] = p.seed;
      B[o] = p.kind; B[o + 1] = p.op; B[o + 2] = p.hot; B[o + 3] = p.w || 0;
      T[o] = p.tint[0]; T[o + 1] = p.tint[1]; T[o + 2] = p.tint[2]; T[o + 3] = 0;
    }
    for (const a of [this.aCenter, this.aA, this.aB, this.aTint]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, count * 4);
      a.needsUpdate = true;
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
    this.noise.dispose();
  }
}
