// Where the sea meets a ship.
//
// Two things, and they are the same event seen from either side of her
// plating. The sea used to run straight through every hull on it: a crest a
// little higher than her deck edge stood across the whole of her deck, flat,
// because a wave a few hundred metres long is flat over the width of a ship --
// so a sea that had slightly topped her side had her entire quarterdeck under
// a sheet of water. Now the sea is not drawn inside a hull at all, and against
// her it is held down to just under her deck edge (see HULL_GLSL in ocean.js).
//
// What that wave would have put on her deck has to go somewhere, and where it
// goes is up her side. Every ship close to the eye has the sea read off both
// her sides each frame, at stations stem to stern: how near it stands to her
// deck edge, and how fast it is climbing her -- because she is coming down
// into it, or it is coming up her, or her bow is being driven into the face
// of it. Where it is climbing hard and close to the top, it bursts off her
// plating: a curtain thrown up the side the wave struck and out away from
// her, as long as the stretch of her the wave met, shooting up in ropes and
// sheets, tearing into drops and blowing off downwind as mist.
//
// None of it is round. A splash out of a point is a fountain; a wave breaking
// against a ship breaks along a length of her, so the spray is laid along her
// side between the stations that felt it, thickest where the wave hit hardest
// and thinning toward where it did not. The sheets are drawn out along the way
// they are going and torn at the edges; the drops are the streaks they leave.
// And all of it comes and goes on a smooth envelope: the force on each station
// eases up and eases off, so a wave running down her side throws a curtain
// that travels with it rather than one that flickers on and off.

import * as THREE from '../../../vendor/three.module.js';
import { MAX_HULLS, HULL_STATIONS, HOLD_MARGIN } from './ocean.js';
import { noiseTexture, SKIES, SPRAY_TINT } from './muzzleblast.js';

/**
 * Where the sea's surface stands on a hull floating level, in her own frame.
 *
 * Every hull is floated a metre down -- see syncEntities in game.js -- so the
 * sea meets her a metre above the waterline she was drawn to.
 */
export const FLOAT_Y = 1.0;

// What each card is.
export const SHEET = 0;   // water torn off her side, the body of the splash
export const DROP = 1;    // what it comes apart into
export const MIST = 2;    // what blows off the top of it

/** How far off the eye a hull is still described to the sea, in metres. */
const HULL_RANGE = 9000;
/** And how far off spray off her is still worth throwing. */
const SPRAY_RANGE = 2600;
/** Stations along each side the sea is read at, stem to stern. */
const WATCH = 28;
/**
 * How many bursts a metre of her side throws a second, at full force. Each is
 * a sheet and the drops it breaks into, and now and then a puff of mist.
 */
const BURST_RATE = 2.2;

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const _box = new THREE.Box3();

// ---------------------------------------------------------------- plan --

/**
 * Read a curve laid out at increasing z, piecewise straight; `outside` is what
 * it is past either end, or null to hold the end value.
 */
function readAt(zs, vs, z, outside) {
  const n = zs.length;
  if (z <= zs[0]) return outside === null ? vs[0] : (z === zs[0] ? vs[0] : outside);
  if (z >= zs[n - 1]) return outside === null ? vs[n - 1] : (z === zs[n - 1] ? vs[n - 1] : outside);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (zs[mid] <= z) lo = mid; else hi = mid;
  }
  const f = (z - zs[lo]) / Math.max(1e-9, zs[hi] - zs[lo]);
  return vs[lo] + (vs[hi] - vs[lo]) * f;
}

/** The least of a curve anywhere between a and b. */
function leastOver(zs, vs, a, b, outside) {
  let m = Math.min(readAt(zs, vs, a, outside), readAt(zs, vs, b, outside));
  for (let i = 0; i < zs.length; i++) if (zs[i] > a && zs[i] < b && vs[i] < m) m = vs[i];
  return m;
}

/**
 * How high her side is drawn, along her: the top of her plating, read off the
 * triangles she is drawn with.
 *
 * Her lines are held to her plating only as high as her plating goes. Above
 * that they say what they always said, and they are generous: the Graf Spee's
 * forecastle side is drawn to five and a half metres where her sheer stands
 * at seven, and asked about six metres there her lines answer with the beam
 * of the ship. So this slices her, at a hand's breadth at a time up from the
 * water, and finds where she stops being as wide as she was -- on both sides
 * at once, the way her insides are fitted, so that a gallery or a gun tub on
 * one side is not taken for her side.
 *
 * Returns the height at each of `bins` lengths of her between z0 and z1, or
 * null if she has nothing to measure.
 */
export function sideTops(group, z0, z1, bins, yTop) {
  if (!group) return null;
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const DY = 0.2;
  const y0 = FLOAT_Y + 0.4;
  const ny = Math.max(2, Math.ceil((yTop - y0) / DY) + 1);
  const dz = (z1 - z0) / bins;
  // Port and starboard limits of her plating, by station and height.
  const lo = new Float32Array(bins * ny).fill(Infinity);
  const hi = new Float32Array(bins * ny).fill(-Infinity);
  const P = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const cut = (ax, ay, az, bx, by, bz, y, out, o) => {
    const f = (y - ay) / (by - ay);
    out[o] = ax + (bx - ax) * f;
    out[o + 1] = az + (bz - az) * f;
  };
  const seg = [0, 0, 0, 0];
  const mark = (j, xa, za, xb, zb) => {
    // Every station the cut runs through, not only its two ends: a hull's
    // side is drawn in plates many stations long.
    let ia = Math.floor((Math.min(za, zb) - z0) / dz);
    let ib = Math.floor((Math.max(za, zb) - z0) / dz);
    ia = Math.max(0, ia);
    ib = Math.min(bins - 1, ib);
    for (let k = ia; k <= ib; k++) {
      const zc = Math.min(Math.max(z0 + (k + 0.5) * dz, Math.min(za, zb)), Math.max(za, zb));
      const f = Math.abs(zb - za) < 1e-6 ? 0 : (zc - za) / (zb - za);
      const x = xa + (xb - xa) * f;
      const c = k * ny + j;
      if (x < lo[c]) lo[c] = x;
      if (x > hi[c]) hi[c] = x;
    }
  };
  let any = false;
  const walk = (node) => {
    for (const ch of node.children) {
      // Her insides are inside her, and the ring that marks whose she is is
      // not plating.
      if (ch.userData?.inside) continue;
      const geo = ch.isMesh && !ch.isInstancedMesh ? ch.geometry : null;
      const mat = Array.isArray(ch.material) ? ch.material[0] : ch.material;
      m.multiplyMatrices(inv, ch.matrixWorld);
      // Nothing wholly above the heights being cut, or wholly under them: her
      // masts, her funnels and her bridgework are most of her triangles.
      if (geo && !geo.boundingBox && geo.attributes?.position) geo.computeBoundingBox();
      const box = geo?.boundingBox ? _box.copy(geo.boundingBox).applyMatrix4(m) : null;
      if (box && box.max.y >= y0 && box.min.y <= yTop && !(mat && mat.transparent)) {
        const pos = geo.attributes.position;
        const idx = geo.index;
        const n = idx ? idx.count : pos.count;
        for (let i = 0; i + 2 < n; i += 3) {
          for (let k = 0; k < 3; k++) {
            v.fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(m);
            P[k * 3] = v.x; P[k * 3 + 1] = v.y; P[k * 3 + 2] = v.z;
          }
          const ya = Math.min(P[1], P[4], P[7]);
          const yb = Math.max(P[1], P[4], P[7]);
          if (yb - ya < 1e-4 || yb < y0 || ya > yTop) continue;
          const j0 = Math.max(0, Math.ceil((ya - y0) / DY));
          const j1 = Math.min(ny - 1, Math.floor((yb - y0) / DY));
          for (let j = j0; j <= j1; j++) {
            const y = y0 + j * DY;
            let c = 0;
            for (let e = 0; e < 3 && c < 4; e++) {
              const a = e * 3;
              const b = ((e + 1) % 3) * 3;
              if ((P[a + 1] - y) * (P[b + 1] - y) < 0) {
                cut(P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2], y, seg, c);
                c += 2;
              }
            }
            if (c === 4) { mark(j, seg[0], seg[1], seg[2], seg[3]); any = true; }
          }
        }
      }
      if (ch.children.length) walk(ch);
    }
  };
  walk(group);
  if (!any) return null;

  const tops = new Float32Array(bins);
  for (let k = 0; k < bins; k++) {
    const at = (j) => {
      const c = k * ny + j;
      return hi[c] > lo[c] ? Math.min(-lo[c], hi[c]) : -1;
    };
    let wide = 0;
    let top = y0;
    for (let j = 0; j < ny; j++) {
      const b = at(j);
      if (wide > 0.5 && b < wide * 0.7 && (j + 1 >= ny || at(j + 1) < wide * 0.7)) break;
      if (b > wide) wide = b;
      if (b >= wide * 0.7) top = y0 + j * DY;
    }
    tops[k] = wide > 0.5 ? top : NaN;
  }
  return tops;
}

/**
 * What the sea has to know about a hull, off the lines she was built to.
 *
 * Every hull in the yard carries her lines -- her half-breadth at a station
 * and a height, held to the plating she is actually drawn with, and her sheer
 * -- for fitting her insides to. They are what this wants too. Three things
 * at each of HULL_STATIONS stations, stem to stern, laid out by z in her own
 * frame:
 *
 *   mask   her half-breadth at the waterline: the narrowest she is anywhere
 *          the sea's surface can stand against her, because she rolls and the
 *          sea runs up and down her side, and the outline it is kept out of
 *          has to be inside her at every one of those heights;
 *   deck   how high her deck edge is. Her sheer says where it was meant to
 *          be; her plating, which her lines are held to, says where it was
 *          drawn -- a quarterdeck a deck lower than the sheer is the plating's
 *          answer, found by climbing her side until she stops being as wide.
 *          Given `group`, the model she is drawn as, her plating is also
 *          measured directly (see sideTops) and the lower answer is kept;
 *   side   how far out her side is just under that edge, which is where a
 *          wave meets her and where its spray leaves her.
 *
 * Every station holds the least of the first two anywhere within a station of
 * it, so reading between two of them -- which the GPU does -- never says she
 * is wider or her deck higher than she is anywhere between them.
 *
 * A submarine has none of this. Her lines are her pressure hull, which is
 * under the water when she is surfaced, and her casing is free-flooding and
 * meant to be swept: a surfaced boat is supposed to have the sea over her.
 */
export function hullPlan(lines, group = null) {
  if (!lines || typeof lines.shellAt !== 'function' || typeof lines.sheer !== 'function') return null;
  const zAt = typeof lines.zAt === 'function'
    ? (t, y) => lines.zAt(t, y)
    : (t) => (t * lines.loa) / 2;
  const FINE = 400;
  const n = FINE + 1;
  const zw = new Float64Array(n);
  const mask = new Float64Array(n);
  const zd = new Float64Array(n);
  const deck = new Float64Array(n);
  const side = new Float64Array(n);
  // How wide she is at her widest, so the ends of her can be told from her body.
  let widest = 0;
  for (let i = 0; i <= 20; i++) widest = Math.max(widest, lines.shellAt(-1 + i / 10, FLOAT_Y + 1));
  const body = Math.max(1.5, widest * 0.15);
  const inBody = new Uint8Array(n);
  let highest = 0;
  for (let i = 0; i < n; i++) {
    const t = -1 + (2 * i) / FINE;
    const sheer = lines.sheer(t);
    let m = Infinity;
    const top = Math.min(FLOAT_Y + 1.5, sheer - 0.3);
    for (let y = FLOAT_Y - 2; y <= top + 1e-6; y += 0.25) m = Math.min(m, lines.shellAt(t, y));
    mask[i] = Number.isFinite(m) ? Math.max(0, m) : 0;
    // Not where she is narrowing to her stem or her counter and is a few feet
    // across, where any reading of her plating is a step: there her sheer is
    // all there is to go on. And only where she stays narrow, not where one
    // reading between two of her plates comes up short.
    let edge = sheer;
    let wide = 0;
    highest = Math.max(highest, sheer);
    for (let y = FLOAT_Y + 0.4; y <= sheer + 0.6; y += 0.15) {
      const b = lines.shellAt(t, y);
      if (wide > body && b < wide * 0.7 && lines.shellAt(t, y + 0.3) < wide * 0.7) {
        edge = y - 0.15;
        break;
      }
      if (b > wide) wide = b;
    }
    inBody[i] = wide > body ? 1 : 0;
    deck[i] = Math.min(edge, sheer + 0.3);
    zw[i] = zAt(t, FLOAT_Y);
    zd[i] = zAt(t, deck[i]);
  }
  // And where her plating is drawn to, which is lower than her lines in
  // places and is the deck edge a sea actually meets.
  if (group) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      lo = Math.min(lo, zd[i], zw[i]);
      hi = Math.max(hi, zd[i], zw[i]);
    }
    lo -= 1;
    hi += 1;
    const bins = Math.min(1000, Math.max(16, Math.ceil((hi - lo) / 0.5)));
    const tops = sideTops(group, lo, hi, bins, highest + 1);
    if (tops) {
      for (let i = 0; i < n; i++) {
        if (!inBody[i]) continue;
        const k = Math.min(bins - 1, Math.max(0, Math.floor(((zd[i] - lo) / (hi - lo)) * bins)));
        const top = tops[k];
        if (Number.isFinite(top) && top < deck[i]) deck[i] = Math.max(FLOAT_Y + 0.3, top);
      }
    }
  }
  // A deck does not come and go over a couple of feet of her, so a reading
  // that stands alone is taken for the plating and not for the deck: the
  // middle of seven, each way along her. A step a deck down -- a quarterdeck
  // -- runs for tens of metres and comes through it untouched.
  {
    const was = Float64Array.from(deck);
    const win = [];
    for (let i = 0; i < n; i++) {
      win.length = 0;
      for (let k = Math.max(0, i - 3); k <= Math.min(n - 1, i + 3); k++) win.push(was[k]);
      win.sort((a, b) => a - b);
      deck[i] = win[win.length >> 1];
    }
  }
  for (let i = 0; i < n; i++) {
    const t = -1 + (2 * i) / FINE;
    zd[i] = zAt(t, deck[i]);
    // Out on her plating rather than on the lines, which are held a hand's
    // breadth inside it.
    const b = lines.shellAt(t, deck[i] - 0.35);
    side[i] = b > 0 ? b + 0.55 : 0;
  }
  // Freeboard amidships. A hull whose deck is not well clear of the water is a
  // boat's pressure hull, and the sea is meant to be over her.
  const mid = deck[FINE >> 1];
  if (!(mid > FLOAT_Y + 1.2)) return null;

  const z0 = Math.min(zw[0], zd[0]);
  const z1 = Math.max(zw[n - 1], zd[n - 1]);
  const S = HULL_STATIONS;
  const dz = (z1 - z0) / (S - 1);
  const rows = new Float32Array(S * 4);
  let beam = 0;
  for (let k = 0; k < S; k++) {
    const z = z0 + k * dz;
    rows[k * 4] = Math.max(0, leastOver(zw, mask, z - dz, z + dz, 0));
    rows[k * 4 + 1] = leastOver(zd, deck, z - dz, z + dz, null);
    rows[k * 4 + 2] = Math.max(0, readAt(zd, side, z, 0));
    beam = Math.max(beam, rows[k * 4 + 2] * 2);
  }
  return { z0, z1, span: z1 - z0, rows, beam, deckMid: mid, freeboard: mid - FLOAT_Y };
}

/** What a plan says at z in her own frame, read between stations as the GPU reads it. */
export function planAt(plan, z, out = {}) {
  const S = HULL_STATIONS;
  const u = Math.min(1, Math.max(0, (z - plan.z0) / plan.span)) * (S - 1);
  const k = Math.min(S - 2, Math.floor(u));
  const f = u - k;
  const r = plan.rows;
  out.mask = r[k * 4] + (r[k * 4 + 4] - r[k * 4]) * f;
  out.deck = r[k * 4 + 1] + (r[k * 4 + 5] - r[k * 4 + 1]) * f;
  out.side = r[k * 4 + 2] + (r[k * 4 + 6] - r[k * 4 + 2]) * f;
  return out;
}

/** How far out from her the sea feels her, in metres. */
export function holdReach(plan) { return 6 + 0.3 * plan.beam; }
/** How softly it is eased down to her deck edge, in metres. */
export function holdSoftness(plan) { return Math.min(1.1, Math.max(0.5, plan.freeboard * 0.3)); }

// Worked out once a class. Her lines do not change, and the walk down them and
// over her plating is the better part of a frame for a big ship.
const PLANS = new Map();

function planOf(view) {
  const cls = view.cls;
  if (!cls || cls.dive) return null;
  const key = view.classId || cls.id;
  if (PLANS.has(key)) return PLANS.get(key);
  const plan = hullPlan(view.group?.userData?.lines, view.group);
  PLANS.set(key, plan);
  return plan;
}

/**
 * How much of her the sea still has to keep off, nought to one.
 *
 * All of it while she floats. As she settles the sea is let in over her --
 * the outline it is kept out of draws in from her sides -- and once she has
 * gone, or broken, or is a boat under the water, none of it.
 */
export function holdStrength(view, plan) {
  if (!view.group || view.group.visible === false) return 0;
  if (view.going || view.halves) return 0;
  const settle = (view.sinkY || 0) / Math.max(1, plan.freeboard);
  return (1 - smooth(0.25, 0.6, settle)) * (1 - smooth(0.1, 0.6, view.depth || 0));
}

// ------------------------------------------------------------- shaders --

const VERT = /* glsl */`
attribute vec4 iCenter;   // where, and the half-width of the card
attribute vec4 iVel;      // which way it is going, and how long a streak that leaves
attribute vec4 iA;        // age, life, seed, what it is
attribute vec4 iB;        // opacity, the sea under it, how hard it was thrown, spare
uniform float uFogDensity;
uniform vec3 uSunDir;
varying vec2 vUv;
varying vec4 vA;
varying vec4 vB;
varying float vAspect;
varying float vKeep;
varying float vFog;
varying float vBack;
varying float vThin;

void main() {
  vUv = position.xy * 2.0;
  vA = iA;
  vB = iB;
  vec4 mv = viewMatrix * vec4(iCenter.xyz, 1.0);
  vec3 vv = (viewMatrix * vec4(iVel.xyz, 0.0)).xyz;
  // Which way it is crossing the screen: its velocity seen from the eye, less
  // the part of it that is only coming toward the eye or going away.
  float depth = min(mv.z, -0.5);
  vec2 sv = vv.xy - mv.xy * (vv.z / depth);
  float sl = length(sv);
  vec2 ax = sl > 1e-4 ? sv / sl : vec2(0.0, 1.0);
  vec2 pe = vec2(-ax.y, ax.x);
  // Drawn out along it by how far it goes in the moment the eye takes it in:
  // water in flight is a streak, not a blob.
  float R = iCenter.w;
  // Never smaller than a pixel or so. A drop a few inches across is a fraction
  // of one from a cable off, and a card that small comes and goes as it
  // crosses the pixel grid -- which is a sparkle, not spray. Kept at a pixel
  // and thinned in proportion, it covers the screen it really covers.
  float least = 0.0022 * -depth / projectionMatrix[1][1];
  vThin = R < least ? (R * R) / (least * least) : 1.0;
  R = max(R, least);
  float along = R + 0.5 * sl * iVel.w;
  vAspect = along / R;
  vec2 off = ax * (position.y * 2.0 * along) + pe * (position.x * 2.0 * R);
  mv.xy += off;
  // Where on the card is in the world, for the sea: going back into the water
  // softly rather than cut off along the swell in a hard line. The rows of the
  // view matrix are the camera's axes, so this is the card's own up and right.
  float wy = iCenter.y + viewMatrix[1][0] * off.x + viewMatrix[1][1] * off.y;
  vKeep = smoothstep(iB.y - 0.3, iB.y + 0.6 + R * 0.35, wy);
  // And thinned as the eye goes into it, or spray over the bridge is one white
  // card across the screen.
  vKeep *= smoothstep(0.6 * R, 2.5 * R + 1.0, -mv.z);
  vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  vBack = max(0.0, dot(normalize(mv.xyz), sunV));
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
uniform vec3 uFogColor;
uniform vec3 uTint;
varying vec2 vUv;
varying vec4 vA;
varying vec4 vB;
varying float vAspect;
varying float vKeep;
varying float vFog;
varying float vBack;
varying float vThin;

float vn(vec3 x) {
  vec3 p = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  vec2 uv = p.xy + vec2(37.0, 17.0) * p.z + f.xy;
  vec2 rg = texture2D(uNoise, (uv + 0.5) / 256.0).xy;
  return mix(rg.x, rg.y, f.z);
}

void main() {
  vec2 p = vUv;
  float r = length(p);
  float age = vA.x;
  float u = clamp(age / vA.y, 0.0, 1.0);
  float seed = vA.z;
  float kind = vA.w;
  // The card in its own proportions, so the grain of the noise is the same
  // along it as across it however far it has been drawn out.
  vec2 q = vec2(p.x, p.y * vAspect);
  float a;
  float lit = 1.0;
  if (kind < 0.5) {
    // A sheet of water thrown up her side. Not a ball: a fan, narrow at the
    // end it leaves her by and spreading toward the end it is going, with its
    // edges pushed out in places and eaten back in others so that no two are
    // the same shape, and streaked along the way it is travelling -- which is
    // what water torn off a hull at speed looks like, ropes rather than foam.
    vec3 s3 = vec3(q * 1.6 + seed * 37.0, seed * 11.0 + age * 0.9);
    float n1 = vn(s3);
    float n2 = vn(s3 * 2.3 + 5.1);
    float n3 = vn(vec3(q.x * 6.5 + seed * 7.0, q.y * 1.1 - age * 2.2, seed * 23.0));
    float lead = p.y * 0.5 + 0.5;
    // Its sides wander along their length rather than running straight, or a
    // fan of water is a shard of glass.
    float n4 = vn(vec3(sign(p.x) * 3.1 + seed * 13.0, q.y * 2.6 + seed * 5.0, age * 0.7));
    float wide = mix(0.30, 0.92, smoothstep(0.0, 0.8, lead))
               * (1.0 + 0.40 * (n1 - 0.5) + 0.42 * (n4 - 0.5));
    float tip = 0.80 + 0.36 * (n2 - 0.5);
    float body = (1.0 - smoothstep(wide * 0.38, wide * 1.04, abs(p.x)))
               * (1.0 - smoothstep(tip - 0.35, tip, p.y))
               * smoothstep(-1.0, -0.62, p.y);
    float dens = body * (0.62 + 0.55 * n3);
    // And coming apart as it climbs, from its leading end back, into ropes
    // and holes: what reaches the top of a splash is not a sheet any more.
    float thr = (0.08 + 0.62 * u) * (0.55 + 0.6 * lead);
    dens *= smoothstep(thr - 0.10, thr + 0.22, n2 * 0.4 + n3 * 0.45 + (1.0 - lead) * 0.25);
    a = dens * smoothstep(0.0, 0.07, age) * (1.0 - smoothstep(0.55, 1.0, u));
    lit = 0.88 + 0.16 * n3;
  } else if (kind < 1.5) {
    if (r > 1.0) discard;
    // A drop, drawn as the streak it makes in the moment the eye takes it in,
    // brightest at the head.
    float across = 1.0 - smoothstep(0.25, 1.0, abs(p.x));
    float along = 1.0 - smoothstep(0.5, 1.0, abs(p.y));
    a = across * along * (0.55 + 0.45 * smoothstep(-0.8, 0.9, p.y));
    a *= smoothstep(0.0, 0.05, age) * (1.0 - smoothstep(0.75, 1.0, u));
  } else {
    if (r > 1.0) discard;
    // Mist off the top, in wisps rather than a ball: thickening for a moment
    // as it is thrown clear, then thinning out downwind.
    vec3 m3 = vec3(q * 0.9 + seed * 19.0, seed * 5.0 + age * 0.25);
    float w = vn(m3) * 0.6 + vn(m3 * 2.4 + 3.3) * 0.4;
    a = (1.0 - smoothstep(0.2, 1.0, r)) * smoothstep(0.32, 0.78, w + (1.0 - r) * 0.2);
    a *= smoothstep(0.0, 0.3, age) * (1.0 - smoothstep(0.3, 1.0, u));
    lit = 0.92;
  }
  a *= vB.x * vKeep * vThin;
  if (a < 0.003) discard;
  // White water: the sky in it from every side and the sun on it from one,
  // and looking toward the sun through it, it lights up. The sun is taken
  // half out of its colour first: a low sun puts a warm cast on spray, not a
  // pink one, because so much of what a drop sends back is the sky.
  vec3 sun = mix(uSunCol, vec3(dot(uSunCol, vec3(0.333))), 0.5);
  vec3 col = uTint * (uSkyCol * 1.2 + sun * (0.62 + 0.38 * clamp(uSunDir.y, 0.0, 1.0))) * lit * 1.1;
  col += uSunCol * pow(vBack, 5.0) * (0.35 + 0.65 * (1.0 - a)) * 0.9;
  col = mix(col, uFogColor, vFog);
  gl_FragColor = vec4(col * a, a);
}
`;

// ------------------------------------------------------------ breakers --

const _eye = new THREE.Vector3();

/** The sea against every ship near the eye: held off her, and thrown up her side. */
export class Breakers {
  constructor(scene, ocean, { intensity = 1, max } = {}) {
    this.scene = scene;
    this.ocean = ocean;
    this.intensity = intensity;
    this.max = max ?? Math.round(1200 * Math.min(1.8, Math.max(0.4, intensity)));
    this.parts = [];
    this.wind = { x: 0, z: 0 };
    this.fogColor = new THREE.Color(0, 0, 0);
    // What is being watched on each ship, kept with her and gone with her.
    this.watched = new WeakMap();
    // Which plan is in which row of the sea's plan texture.
    this.slots = new Array(MAX_HULLS).fill(null);
    // The hulls bound to the sea this frame, nearest first.
    this.bound = [];

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(
      [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const attr = (name) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    };
    this.aCenter = attr('iCenter');
    this.aVel = attr('iVel');
    this.aA = attr('iA');
    this.aB = attr('iB');
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
        uFogColor: { value: this.fogColor },
        uFogDensity: { value: 0 },
        uTint: { value: new THREE.Color(...SPRAY_TINT) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      // Premultiplied, the same as the gun smoke, so the two lie over each
      // other properly when a ship fires into her own spray.
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
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    scene.add(this.mesh);

    this._order = [];
  }

  /**
   * The hour, the cloud and the wind, as the gun smoke has them: see
   * MuzzleBlasts.setAtmosphere. Spray is lit by the same sky.
   */
  setAtmosphere({ preset = 'day', overcast = 0, sunDir = null, wind = null } = {}) {
    const k = SKIES[preset] || SKIES.day;
    const u = this.mat.uniforms;
    const sun = new THREE.Color(...k.sun);
    const sky = new THREE.Color(...k.sky);
    const flat = (sun.r + sun.g + sun.b) / 3;
    const grey = (sky.r + sky.g + sky.b) / 3 + flat * 0.4;
    u.uSunCol.value.copy(sun).multiplyScalar(1 - 0.85 * overcast);
    u.uSkyCol.value.copy(sky).lerp(new THREE.Color(grey, grey, grey + flat * 0.02), overcast);
    if (sunDir) u.uSunDir.value.copy(sunDir).normalize();
    if (wind) { this.wind.x = wind.x || 0; this.wind.z = wind.z || 0; }
  }

  /** What is being watched on one ship, set up the first time she is seen. */
  stateOf(view) {
    let st = this.watched.get(view);
    if (st !== undefined) return st;
    const plan = view.group ? planOf(view) : null;
    st = null;
    if (plan) {
      // The stations the sea is read at, and what she is at each of them.
      const zs = new Float32Array(WATCH);
      const deck = new Float32Array(WATCH);
      const side = new Float32Array(WATCH);
      const slope = new Float32Array(WATCH);
      const at = {};
      for (let j = 0; j < WATCH; j++) {
        const z = plan.z0 + plan.span * (0.02 + (0.96 * j) / (WATCH - 1));
        planAt(plan, z, at);
        zs[j] = z;
        deck[j] = at.deck;
        side[j] = at.side;
      }
      // Which way her side faces at each: out, and forward where she narrows
      // to her stem. That is what her way drives into the water.
      for (let j = 0; j < WATCH; j++) {
        const a = Math.max(0, j - 1);
        const b = Math.min(WATCH - 1, j + 1);
        slope[j] = (side[b] - side[a]) / Math.max(1e-6, zs[b] - zs[a]);
      }
      const n = WATCH * 2;
      st = {
        view, plan, zs, deck, side, slope,
        over: new Float32Array(n), rise: new Float32Array(n),
        force: new Float32Array(n), sea: new Float32Array(n), push: new Float32Array(n),
        owed: new Float32Array(n),
        m: new THREE.Matrix4(), primed: false,
        px: 0, pz: 0, vx: 0, vz: 0, strength: 0, dist: 0,
      };
    }
    this.watched.set(view, st);
    return st;
  }

  /**
   * One frame of it, for the ships in `views` -- anything with a `group`,
   * a `cls` and the founder's state on it, which is to say a ShipView.
   */
  update(dt, camera, views = []) {
    const eye = camera ? camera.getWorldPosition(_eye) : null;
    const live = [];
    for (const view of views) {
      const st = this.stateOf(view);
      if (!st) continue;
      st.strength = holdStrength(view, st.plan);
      if (st.strength <= 0) { st.primed = false; continue; }
      const g = view.group;
      g.updateMatrix();
      st.m.copy(g.matrix);
      if (g.parent) {
        g.parent.updateWorldMatrix(true, false);
        st.m.premultiply(g.parent.matrixWorld);
      }
      const e = st.m.elements;
      st.dist = eye ? Math.hypot(e[12] - eye.x, e[13] - eye.y, e[14] - eye.z) : 0;
      if (st.dist < HULL_RANGE) live.push(st);
    }
    live.sort((a, b) => a.dist - b.dist);
    this.bind(live.length > MAX_HULLS ? live.slice(0, MAX_HULLS) : live);
    if (dt > 0) {
      for (const st of live) {
        if (st.dist < SPRAY_RANGE) this.watch(st, dt); else st.primed = false;
      }
    }
    this.step(dt, camera);
  }

  /** Describe the nearest hulls to the sea, so it keeps out of them. */
  bind(list) {
    this.bound = list;
    const u = this.ocean?.material?.uniforms;
    if (!u || !u.uHullCount) return;
    u.uHullCount.value = list.length;
    const tex = this.ocean.hullPlan;
    let dirty = false;
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      const plan = st.plan;
      const e = st.m.elements;
      u.uHullInv.value[i].copy(st.m).invert();
      const zc = (plan.z0 + plan.z1) / 2;
      const reach = Math.hypot(plan.span / 2, plan.beam / 2) + holdReach(plan) + 2;
      u.uHullAt.value[i].set(e[12] + e[8] * zc, e[14] + e[10] * zc, reach * reach, st.strength);
      u.uHullDim.value[i].set(plan.z0, plan.span, holdReach(plan), holdSoftness(plan));
      if (tex && this.slots[i] !== plan) {
        const row = tex.image.data;
        const o = i * HULL_STATIONS * 4;
        for (let k = 0; k < HULL_STATIONS * 4; k++) {
          row[o + k] = THREE.DataUtils.toHalfFloat(plan.rows[k]);
        }
        this.slots[i] = plan;
        dirty = true;
      }
    }
    if (dirty) tex.needsUpdate = true;
  }

  /**
   * Read the sea off both her sides, and throw what climbs her.
   *
   * The force at each station is how near the sea stands to her deck edge,
   * times how hard it is coming at her there: climbing her side, or being
   * driven into by her bow. It eases up quickly and off slowly, which is what
   * a wave does against a ship -- it strikes, and then falls away.
   */
  watch(st, dt) {
    const e = st.m.elements;
    const ocean = this.ocean;
    // Her way through the water, off where she was a frame ago. A jump of
    // more than a ship's speed is not way, it is her being put somewhere.
    if (st.primed) {
      const vx = (e[12] - st.px) / dt;
      const vz = (e[14] - st.pz) / dt;
      if (Math.hypot(vx, vz) > 40) st.primed = false;
      else {
        const k = 1 - Math.exp(-dt / 0.25);
        st.vx += (vx - st.vx) * k;
        st.vz += (vz - st.vz) * k;
      }
    }
    // Coming back into sight of the eye, or put somewhere new: nothing she was
    // doing when last watched carries over.
    const fresh = !st.primed;
    if (fresh) {
      st.vx = 0;
      st.vz = 0;
      st.force.fill(0);
      st.owed.fill(0);
    }
    st.px = e[12];
    st.pz = e[14];
    st.primed = true;

    const kRise = 1 - Math.exp(-dt / 0.12);
    for (let j = 0; j < WATCH; j++) {
      const z = st.zs[j];
      const deck = st.deck[j];
      const side = st.side[j];
      const fb = deck - FLOAT_Y;
      for (let s = 0; s < 2; s++) {
        const i = j * 2 + s;
        const sign = s ? 1 : -1;
        // A metre off her side at the height of her deck edge.
        const lx = sign * (side + 1);
        const wx = e[12] + e[0] * lx + e[4] * deck + e[8] * z;
        const wy = e[13] + e[1] * lx + e[5] * deck + e[9] * z;
        const wz = e[14] + e[2] * lx + e[6] * deck + e[10] * z;
        const h = ocean.heightAt(wx, wz);
        // How far over her deck edge the sea stands there, in her own frame.
        const over = e[5] * (h - wy);
        if (fresh) st.rise[i] = 0;
        else st.rise[i] += ((over - st.over[i]) / dt - st.rise[i]) * kRise;
        st.over[i] = over;
        // What the sea is there as it is drawn: held under her deck edge.
        st.sea[i] = Math.min(h, wy - HOLD_MARGIN);
        // Out at the very point of her stem or her counter there is no side
        // for a sea to strike.
        if (side < 0.4) { st.force[i] *= Math.exp(-dt / 0.3); st.push[i] = 0; continue; }
        // Her side driven into the water: her way, along the way her side faces.
        const nx = e[0] * sign - e[8] * st.slope[j];
        const nz = e[2] * sign - e[10] * st.slope[j];
        const nl = Math.hypot(nx, nz) || 1;
        const ram = Math.max(0, (st.vx * nx + st.vz * nz) / nl);
        const push = Math.max(0, st.rise[i]) + 0.55 * ram;
        st.push[i] = push;
        // Close to the top and coming at her hard: that is the blow, and what
        // throws a sea up a ship's side is how fast it arrives, not how high
        // it ends up -- a metre a second or so at the most here, her own
        // motion and the wave's together. It is struck while it arrives at
        // her deck edge; once the sea is well over it, that length of her is
        // in the sea and is not being struck any more.
        const near = smooth(-1.0 - 0.15 * fb, 0.1, over) * (1 - smooth(0.6, 1.8, over));
        let want = near * smooth(0.05, 1.2, push);
        // A sea that stays up over her deck edge goes on slopping back off
        // her plating for as long as it is there, but gently.
        want = Math.max(want, 0.15 * smooth(0, 1.2, over) * (0.5 + 0.5 * smooth(0, 1.2, push)));
        // Her bow put into the face of a sea throws it up her flare even
        // when the crest is well under her deck edge.
        want = Math.max(want, smooth(-0.55 * fb, -0.1 * fb, over) * smooth(1.5, 4.5, push) * 0.7);
        want = Math.min(1, want) * st.strength;
        const tau = want > st.force[i] ? 0.08 : 0.45;
        st.force[i] += (want - st.force[i]) * (1 - Math.exp(-dt / tau));
      }
    }

    // And what all that throws. Laid along her side between each pair of
    // stations, in proportion to how hard each was struck, so a wave that hit
    // a stretch of her throws spray along that stretch and nowhere else.
    //
    // No more of it at once than a sea front can strike along her, which is
    // a few tens of metres however much of her is under it: a quarterdeck
    // pooped from end to end is a ship in green water, not a ship inside a
    // cloud.
    let struck = 0;
    for (let j = 0; j + 1 < WATCH; j++) {
      const len = st.zs[j + 1] - st.zs[j];
      for (let s = 0; s < 2; s++) struck += (st.force[j * 2 + s] + st.force[(j + 1) * 2 + s]) * 0.5 * len;
    }
    const most = 18 + 0.12 * st.plan.span;
    const lod = Math.min(1, Math.max(0.35, 1.3 - st.dist / 1800)) * Math.min(1, most / Math.max(1e-6, struck));
    for (let j = 0; j + 1 < WATCH; j++) {
      const len = st.zs[j + 1] - st.zs[j];
      for (let s = 0; s < 2; s++) {
        const a = st.force[j * 2 + s];
        const b = st.force[(j + 1) * 2 + s];
        const mean = (a + b) / 2;
        const i = j * 2 + s;
        if (mean < 0.015) { st.owed[i] = 0; continue; }
        st.owed[i] += mean * BURST_RATE * len * dt * this.intensity * lod;
        while (st.owed[i] >= 1) {
          st.owed[i] -= 1;
          this.burst(st, j, s ? 1 : -1, a, b);
        }
      }
    }
  }

  /**
   * One burst off her side, somewhere between stations j and j + 1: a sheet,
   * the drops it comes apart into and sometimes a puff of mist.
   */
  burst(st, j, sign, fa, fb) {
    // Where along the stretch: more of it toward whichever end was struck
    // harder, so the curtain thickens and thins smoothly along her.
    const r = Math.random();
    const t = Math.abs(fb - fa) < 1e-4 ? r
      : (Math.sqrt(fa * fa + (fb * fb - fa * fa) * r) - fa) / (fb - fa);
    const f = fa + (fb - fa) * t;
    const z = st.zs[j] + (st.zs[j + 1] - st.zs[j]) * t;
    const deck = st.deck[j] + (st.deck[j + 1] - st.deck[j]) * t;
    const side = st.side[j] + (st.side[j + 1] - st.side[j]) * t;
    const i0 = j * 2 + (sign > 0 ? 1 : 0);
    const sea = st.sea[i0] + (st.sea[i0 + 2] - st.sea[i0]) * t;
    const push = st.push[i0] + (st.push[i0 + 2] - st.push[i0]) * t;
    const e = st.m.elements;
    // Out of her frame into the world: a point, and a direction.
    const at = (lx, ly, lz) => ({
      x: e[12] + e[0] * lx + e[4] * ly + e[8] * lz,
      y: e[13] + e[1] * lx + e[5] * ly + e[9] * lz,
      z: e[14] + e[2] * lx + e[6] * ly + e[10] * lz,
    });
    // Thrown with a share of her way: the sea it came out of was standing
    // still, but it came off her plating.
    const way = (vx, vy, vz) => ({
      x: e[0] * vx + e[4] * vy + e[8] * vz + st.vx * 0.45,
      y: e[1] * vx + e[5] * vy + e[9] * vz,
      z: e[2] * vx + e[6] * vy + e[10] * vz + st.vz * 0.45,
    });
    // A big ship's spray is bigger: the same sea against more of her.
    const scale = Math.min(1.5, Math.max(0.8, Math.sqrt(st.plan.freeboard / 4)));
    const shove = Math.min(3, push * 0.3);

    // The sheet: off her plating just under the deck edge, where the water
    // that climbed her side leaves it, going up and out away from her.
    {
      const p = at(sign * (side + 0.15 + Math.random() * 0.4),
        deck - 0.2 - Math.random() * (0.5 + 0.6 * f), z);
      const up = (3.4 + 8.0 * f + shove) * (0.75 + 0.5 * Math.random());
      const v = way(sign * (0.5 + 1.9 * f) * (0.5 + Math.random()), up,
        (Math.random() - 0.5) * (0.8 + 1.6 * f));
      this.add({
        kind: SHEET, x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z,
        r0: (0.35 + 0.4 * f) * scale,
        r1: (1.0 + 1.7 * f) * (0.8 + 0.4 * Math.random()) * scale, rg: 2.2,
        life: 1.0 + 0.9 * f + 0.4 * Math.random(),
        drag: 0.55, grav: 1, windK: 0.35, stretch: 0.12,
        op: 0.5 + 0.4 * f, base: sea, force: f,
      });
    }
    // The drops: thrown harder and wider, and falling back through the rest.
    const drops = 2 + (Math.random() < 0.3 + 0.5 * f ? 1 : 0) + (f > 0.6 ? 1 : 0);
    for (let k = 0; k < drops; k++) {
      const p = at(sign * (side + 0.1 + Math.random() * 0.6),
        deck - 0.1 - Math.random() * 0.7, z + (Math.random() - 0.5) * 1.5);
      const up = (3.4 + 8.8 * f + shove) * (0.6 + 0.75 * Math.random());
      const v = way(sign * (0.9 + 3.2 * f) * (0.4 + Math.random()), up,
        (Math.random() - 0.5) * (1.4 + 2.6 * f));
      const rad = (0.04 + 0.07 * Math.random()) * scale;
      this.add({
        kind: DROP, x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z,
        r0: rad, r1: rad, rg: 1,
        life: 1.6 + 1.2 * Math.random(),
        drag: 0.12, grav: 1, windK: 0.2, stretch: 0.10,
        op: 0.6, base: sea, force: f,
      });
    }
    // The mist off the top of a hard one, which the wind takes.
    if (f > 0.25 && Math.random() < 0.12 + 0.3 * f) {
      const p = at(sign * (side + 0.5 + Math.random() * 1.0),
        deck + 0.5 + f * (1.5 + 2 * Math.random()), z);
      const v = way(sign * (0.4 + 0.8 * f), 0.8 + 2.2 * f, (Math.random() - 0.5) * 1.2);
      this.add({
        kind: MIST, x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z,
        r0: (0.9 + 1.2 * f) * scale,
        r1: (3.0 + 4.0 * f) * (0.8 + 0.4 * Math.random()) * scale, rg: 0.9,
        life: 2.4 + 1.6 * Math.random(),
        drag: 1.8, grav: 0.12, windK: 1, stretch: 0,
        op: 0.12 + 0.14 * f, base: sea, force: f,
      });
    }
  }

  /** One card into the pool, recycling the most nearly gone if it is full. */
  add(p) {
    if (this.parts.length >= this.max) {
      let worst = 0;
      let k = -1;
      for (let i = 0; i < this.parts.length; i++) {
        const q = this.parts[i];
        const g = q.age / q.life;
        if (g > worst) { worst = g; k = i; }
      }
      if (k < 0) return null;
      this.parts[k] = this.parts[this.parts.length - 1];
      this.parts.pop();
    }
    p.age = 0;
    p.r = p.r0;
    p.seed = Math.random();
    this.parts.push(p);
    return p;
  }

  /** Fly everything already thrown, and hand it to the GPU back to front. */
  step(dt, camera) {
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
    const wx = this.wind.x;
    const wz = this.wind.z;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life || (p.kind !== MIST && p.vy < 0 && p.y < p.base - 0.6)) {
        parts[i] = parts[parts.length - 1];
        parts.pop();
        continue;
      }
      // The air takes it toward the wind's own speed, slowly for a drop and
      // at once for mist; and it falls.
      const damp = Math.exp(-p.drag * dt);
      const ax = wx * p.windK;
      const az = wz * p.windK;
      p.vx = ax + (p.vx - ax) * damp;
      p.vy = p.vy * damp - 9.81 * p.grav * dt;
      p.vz = az + (p.vz - az) * damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.r = p.r0 + (p.r1 - p.r0) * (1 - Math.exp(-p.age * p.rg));
    }

    const count = parts.length;
    this.geo.instanceCount = count;
    this.mesh.visible = count > 0;
    if (!count) return;

    // Back to front: the white of a sheet in front is laid over the one
    // behind it rather than the other way about.
    const order = this._order;
    order.length = count;
    for (let i = 0; i < count; i++) order[i] = i;
    if (camera) {
      const eye = camera.getWorldPosition(_eye);
      for (const p of parts) {
        const dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z;
        p.depth = dx * dx + dy * dy + dz * dz;
      }
      order.sort((a, b) => parts[b].depth - parts[a].depth);
    }

    const C = this.aCenter.array, V = this.aVel.array, A = this.aA.array, B = this.aB.array;
    for (let j = 0; j < count; j++) {
      const p = parts[order[j]];
      const o = j * 4;
      C[o] = p.x; C[o + 1] = p.y; C[o + 2] = p.z; C[o + 3] = p.r;
      V[o] = p.vx; V[o + 1] = p.vy; V[o + 2] = p.vz; V[o + 3] = p.stretch;
      A[o] = p.age; A[o + 1] = p.life; A[o + 2] = p.seed; A[o + 3] = p.kind;
      B[o] = p.op; B[o + 1] = p.base; B[o + 2] = p.force; B[o + 3] = 0;
    }
    for (const a of [this.aCenter, this.aVel, this.aA, this.aB]) {
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
