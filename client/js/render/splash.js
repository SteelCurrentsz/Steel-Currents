// Shell and bomb splashes: the column of water a round throws up when it
// misses, and the swell that runs out from it.
//
// These are meshes rather than billboards. A splash is the one effect in a
// naval action that a captain reads for *information* -- how far off the salvo
// fell, and whether it was straddling -- so it has to sit in the world
// convincingly from any angle, including from a masthead looking straight down
// at it. A sprite column is a painted flat that turns to face you; a real cone
// of water stays where the shell landed.
//
// Everything here is driven off one number: the bore of the gun that fired.
//
//   bore     column      swell        who fires it
//   127 mm    ~20 m      ~110 m       a destroyer's 5-inch
//   203 mm    ~35 m      ~190 m       a heavy cruiser's 8-inch
//   356 mm    ~63 m      ~350 m       a King George V's 14-inch
//   460 mm    ~83 m      ~460 m       Yamato
//
// Which is about right: a 5-inch splash is a spout you can lose in the swell
// and an 18-inch splash is taller than the ship that fired it, which is what
// made spotting the fall of shot possible at all.

import * as THREE from '../../../vendor/three.module.js';
import { noiseTexture, SKIES, SPRAY_TINT } from './muzzleblast.js';

/** The reference bore all the scaling hangs off: a 5-inch destroyer gun. */
const REF_BORE = 127;

/**
 * How big a splash a bore throws.
 *
 * Height goes up a little faster than the bore because the shell's mass goes
 * up as its cube, and the water thrown is mass times velocity; the exponents
 * are fitted to the four figures in the table above rather than derived, which
 * is honest about what they are.
 */
export function splashSize(bore = REF_BORE) {
  const k = Math.max(0.35, bore / REF_BORE);
  return {
    height: 23 * Math.pow(k, 1.12),
    // A splash is a *mass* of water, not a spout: the column that comes up off
    // a heavy shell is nearly half as wide as it is tall, boiling outwards as
    // it rises. A narrow spike is what a stone dropped in a pond does.
    radius: 5.4 * Math.pow(k, 1.02),
  };
}

/** A soft vertical gradient: dense at the foot of the column, mist at the head. */
function columnTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0.00, 'rgba(255,255,255,0.00)'); // the very base, hidden in the sea
  g.addColorStop(0.07, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.30, 'rgba(245,251,255,0.74)');
  g.addColorStop(0.55, 'rgba(238,248,255,0.44)');
  g.addColorStop(0.78, 'rgba(232,245,255,0.18)');
  g.addColorStop(1.00, 'rgba(226,242,255,0.00)'); // torn to nothing at the top
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 128);
  // A little streaking across the column, so it is water and not a cone.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i++) {
    // Long and thin, and thinning towards the top: the water leaves the sea in
    // ropes, and it is the gaps between them that make a column look like it is
    // going somewhere rather than just sitting there.
    const y = Math.random() * 128;
    ctx.fillStyle = `rgba(0,0,0,${(0.08 + Math.random() * 0.3) * (0.35 + y / 128)})`;
    ctx.fillRect(Math.random() * 16, y, 0.8 + Math.random() * 2, 12 + Math.random() * 48);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/**
 * One splash's worth of geometry, built once and shared.
 *
 * The column is an open cone standing on the water, drawn from both sides so
 * you can see the far wall of it through the near one -- which is what stops
 * it reading as a solid traffic cone.
 */
/**
 * The billowing profile of the column, as a multiple of its base radius.
 *
 * Water thrown up by a shell does not taper away like a cone. It leaves the sea
 * as a wide skirt, boils *outwards* as it rises -- the mass is widest around a
 * third of the way up, where it has had time to spread and has not yet run out
 * of momentum -- and only then tears apart into a head of spray. That shape,
 * more than anything else, is what makes a splash read as tons of water rather
 * than as a plume of smoke.
 */
function billow(t) {
  if (t < 0.16) return 1.06 - t * 0.9;                  // the skirt at the sea
  if (t < 0.48) return 0.92 + (t - 0.16) * 1.25;        // boiling outward
  if (t < 0.78) return 1.32 - (t - 0.48) * 0.5;         // the shoulder of it
  return 1.17 - (t - 0.78) * 3.4;                       // torn away at the head
}

function makeGeometry() {
  const column = new THREE.CylinderGeometry(1, 1, 1, 28, 16, true);
  column.translate(0, 0.5, 0);
  // Water does not come up as a cone. On top of the billowing profile the wall
  // is pushed in and out around the circumference and up the height, in three
  // frequencies, so the silhouette is lumpy from every bearing -- and since
  // each splash is turned to a random heading, the same shape never reads as
  // the same shape twice.
  const p = column.attributes.position;
  const col = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    const a = Math.atan2(x, z);
    const wob = billow(y) * (1
      + 0.19 * Math.sin(a * 3 + y * 6.4)
      + 0.13 * Math.sin(a * 5 - y * 9.1)
      + 0.09 * Math.sin(a * 8 + y * 14.3)
      + 0.11 * Math.sin(y * 12.0 + a));
    p.setX(i, x * wob);
    p.setZ(i, z * wob);
    // What comes up out of the sea is sea. The foot of the column carries the
    // water's own colour and only the top of the throw -- where it has been
    // torn apart and is more air than water -- goes white. A column that is
    // white all the way down reads as a sheet of paper standing on the swell.
    const up = Math.min(1, y * 1.35);
    col.push(
      0.62 + 0.38 * up,
      0.76 + 0.24 * up,
      0.84 + 0.16 * up,
    );
  }
  column.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  column.computeVertexNormals();
  // The crown: the collar of water thrown out sideways at the moment of impact,
  // leaning outwards. Short, wide, and gone in under a second.
  const crown = new THREE.CylinderGeometry(2.6, 0.8, 1, 24, 1, true);
  crown.translate(0, 0.5, 0);
  return { column, crown };
}

/**
 * The swell: a band of water with a raised crest that runs outward.
 *
 * Built by hand rather than taken from `RingGeometry` because that is flat, and
 * a flat ring seen from a bridge is an invisible ring. Three rings of vertices
 * -- trough, crest, trough -- give it a section, so it catches the light and
 * reads as water moving rather than a decal on it. Scaled wide in x and z and
 * separately in y, so the wave can spread without the crest growing taller.
 */
function makeSwellGeometry(seg = 108) {
  const pos = [];
  const uv = [];
  const idx = [];
  // Trough behind, crest, and a short steep face in front: a wave running
  // outward is not symmetrical, and the steep side is the side it is going.
  const bands = [[0.62, 0], [0.86, 0.55], [1.0, 1], [1.07, 0.5], [1.13, 0]];
  for (let b = 0; b < bands.length; b++) {
    const [r, y] = bands[b];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      // Nor is it a circle. The ring is pushed in and out around its
      // circumference so it spreads unevenly, the way water does when it is
      // running out across a sea that already has a swell on it.
      const wob = 1
        + 0.034 * Math.sin(a * 2 + 0.7)
        + 0.021 * Math.sin(a * 3 - 1.9);
      pos.push(Math.sin(a) * r * wob, y, Math.cos(a) * r * wob);
      uv.push(i / seg, b / (bands.length - 1));
    }
  }
  const row = seg + 1;
  for (let b = 0; b < bands.length - 1; b++) {
    for (let i = 0; i < seg; i++) {
      const a = b * row + i;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Foam along the crest and nothing at the troughs. */
function swellTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0.00, 'rgba(255,255,255,0)');
  g.addColorStop(0.20, 'rgba(244,251,255,0.14)');
  g.addColorStop(0.40, 'rgba(248,253,255,0.42)');
  g.addColorStop(0.53, 'rgba(255,255,255,0.66)');
  g.addColorStop(0.68, 'rgba(242,250,255,0.34)');
  g.addColorStop(0.86, 'rgba(232,245,255,0.10)');
  g.addColorStop(1.00, 'rgba(226,240,252,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 128);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return t;
}

// A full salvo from a battleship is nine shells and a fleet action has several
// ships firing at once, so the pool has to take a couple of straddles at a time
// without a splash going missing. They are cheap: one shared geometry, one draw
// call each, and culled when they are over the horizon.
/**
 * The patch of churned water a splash leaves behind: torn foam, not a ring.
 *
 * Drawn as blobs rather than a gradient because foam is lumpy, and a soft
 * circle on the sea reads as a lens flare rather than as water.
 */
function foamTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2;
    // Packed towards the middle, thinning out to nothing at the rim.
    const rr = Math.pow(Math.random(), 0.6) * 0.46;
    const x = size / 2 + Math.cos(a) * rr * size;
    const y = size / 2 + Math.sin(a) * rr * size;
    const r = (2 + Math.random() * 9) * (1 - rr);
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1.5, r));
    const alpha = 0.5 * (1 - rr / 0.46);
    g.addColorStop(0, `rgba(255,255,255,${alpha.toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.5, r), 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}

const COLUMNS = 30;
const SWELLS = 72;
// The spires that come up round the main mass, every one its own size and lean.
const JETS = 420;
// The water that comes back down out of them, and the little splashes it makes.
const DROPS = 2600;
const G = 9.81;

/** Value noise in three dimensions, for knobbling a plume. */
function vnoise(x, y, z) {
  const h = (a, b, c) => {
    const n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}

/**
 * One plume of water.
 *
 * A heavy shell does not throw up a sheet. It throws up a handful of plumes
 * standing close together -- each a column of white water as thick as a house,
 * swelling into a knobbled head of spray where it runs out of push, some twice
 * the height of the others -- and that is the shape every photograph of a fall
 * of shot has. Closed at the top and lumpy all over, so it is a body of water
 * from every side and from above, not a surface you can see through.
 */
function makePlumeGeometry() {
  // The profile, foot to head: a waist low down, swelling to the head, and a
  // rounded top. Radius over height, both out of one.
  const prof = [
    [0.5, 0], [0.56, 0.04], [0.46, 0.14], [0.44, 0.28], [0.5, 0.42], [0.6, 0.55],
    [0.74, 0.66], [0.86, 0.76], [0.88, 0.84], [0.78, 0.9], [0.6, 0.95], [0.34, 0.985], [0.001, 1],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(prof, 22);
  const p = g.attributes.position;
  const col = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    const r = Math.hypot(x, z);
    // Knobbled: big lumps and little ones, more of both up in the head, where
    // the water is breaking up.
    const n = (vnoise(x * 2.4, y * 5.0, z * 2.4) - 0.5) * 0.5
      + (vnoise(x * 6.0 + 9, y * 13.0, z * 6.0 + 4) - 0.5) * 0.35
      + (vnoise(x * 14.0 - 3, y * 28.0, z * 14.0 + 7) - 0.5) * 0.22;
    const k = 1 + n * (0.5 + y * 1.1);
    if (r > 1e-4) { p.setX(i, x * k); p.setZ(i, z * k); }
    p.setY(i, y + n * 0.04 * y);
    // White water at the head, the sea's own colour coming up through it low
    // down, where it is still more water than air -- and darker in the folds,
    // which is what gives a heap of foam its shape.
    const up = Math.min(1, y * 1.15);
    const fold = 0.82 + 0.36 * Math.max(-0.5, Math.min(0.5, n));
    col.push((0.8 + 0.2 * up) * fold, (0.86 + 0.14 * up) * fold, (0.9 + 0.1 * up) * fold);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Lit, opaque water, that fades instance by instance by breaking up rather
 * than by going see-through: a plume coming down is torn into spray, and a
 * hashed alpha draws that, where a translucent one draws a pane of glass.
 */
/** Foam, streaked up the plume the way the water is going. */
function foamStreakTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 256;
    const g = 190 + Math.random() * 50;
    ctx.fillStyle = `rgba(${g - 12},${g - 4},${g},${0.18 + Math.random() * 0.3})`;
    ctx.fillRect(x, y, 1 + Math.random() * 3, 10 + Math.random() * 60);
  }
  // And the brighter threads between them. Streaks, not dots: a texture
  // stippled with round flecks put polka dots on every column of water.
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.5})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 256, 0.6 + Math.random() * 1.4, 6 + Math.random() * 30);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  return t;
}

const PLUME_NOISE = /* glsl */`
varying vec3 vObj;
float ph(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float pn(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ph(i), ph(i + vec3(1, 0, 0)), u.x), mix(ph(i + vec3(0, 1, 0)), ph(i + vec3(1, 1, 0)), u.x), u.y),
             mix(mix(ph(i + vec3(0, 0, 1)), ph(i + vec3(1, 0, 1)), u.x), mix(ph(i + vec3(0, 1, 1)), ph(i + vec3(1, 1, 1)), u.x), u.y), u.z);
}
`;

/**
 * Lit, opaque water, that fades instance by instance by breaking up rather
 * than by going see-through: a plume coming down is torn into spray, and a
 * hashed alpha draws that, where a translucent one draws a pane of glass.
 *
 * And it is frayed where water is frayed -- at its head, where it is breaking
 * up into spray, and round its silhouette, where the eye is looking through
 * the thinnest of it -- so its edge is spray and not a skin.
 */
function plumeMaterial(map) {
  const m = new THREE.MeshLambertMaterial({
    vertexColors: true, color: 0xf8fbfd, map,
    // Spray is bright: it scatters the sky's light back as well as the sun's,
    // and is white against the sea even in a poor light.
    emissive: 0x5a6670,
    // Dense in its body and soft only at its edges (see below), so it is a
    // body of water and not a pane -- but soft where it frays, which a hashed
    // alpha draws as a screen door.
    transparent: true,
    depthWrite: false,
  });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aFade;\nvarying float vFade;\nvarying vec3 vObj;\n'
      + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFade = aFade;\n  vObj = position;');
    sh.fragmentShader = 'varying float vFade;\n' + PLUME_NOISE
      + sh.fragmentShader.replace('#include <alphahash_fragment>', `
  {
    float nz = pn(vObj * vec3(7.0, 13.0, 7.0)) * 0.65 + pn(vObj * vec3(19.0, 31.0, 19.0)) * 0.35;
    float top = smoothstep(0.6, 1.0, vObj.y);
    float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));
    // And roped up its length: water driven up out of the sea goes up in
    // strands, and it is the gaps between them at its edges that stop a
    // column reading as a smooth glass tube.
    float rope = pn(vObj * vec3(15.0, 1.6, 15.0) + vec3(0.0, 5.0, 0.0));
    float keep = 1.0 - top * 0.9 * nz - rim * rim * 1.1 * (0.45 + nz)
               - rim * 0.55 * smoothstep(0.4, 0.8, rope);
    diffuseColor.a *= vFade * clamp(keep, 0.0, 1.0);
  }`);
  };
  return m;
}

/**
 * A puff of torn water: a lumpy ball, knobbled all over, for the surge round the
 * foot of a splash and the head it breaks into at the top. The same material as
 * the plumes, so it is lit, opaque in its body and frayed at its edge.
 */
function makePuffGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position;
  const col = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    // Billows, not shards: big soft lumps and only a little knobbling on them.
    const n = (vnoise(x * 1.6 + 3, y * 1.6, z * 1.6 - 2) - 0.5) * 0.5
      + (vnoise(x * 3.6, y * 3.6 + 5, z * 3.6) - 0.5) * 0.16;
    const k = 1 + n;
    p.setXYZ(i, x * k, y * k, z * k);
    const shade = 0.82 + 0.3 * Math.max(-0.5, Math.min(0.5, n)) + 0.08 * y;
    col.push(0.93 * shade, 0.96 * shade, 0.99 * shade);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // The icosahedron comes with every face's corners its own, which shades it
  // flat -- a heap of facets, which reads as ice. The corners that are the same
  // point are given the same normal, so it shades as the soft billow it is.
  const nrm = g.attributes.normal;
  const sum = new Map();
  const key = (i) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    const v = sum.get(k) || [0, 0, 0];
    v[0] += nrm.getX(i); v[1] += nrm.getY(i); v[2] += nrm.getZ(i);
    sum.set(k, v);
  }
  for (let i = 0; i < p.count; i++) {
    const v = sum.get(key(i));
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    nrm.setXYZ(i, v[0] / l, v[1] / l, v[2] / l);
  }
  return g;
}

const PUFFS = 1100;

/**
 * Spray and white water, as cards that face the eye.
 *
 * Two kinds share the one vertex stage. A drop is drawn out along the way it
 * is going across the screen -- water in flight is a streak, never a dot --
 * and a puff of white water is a soft card with no outline of its own: its
 * shape is a threshold walked through noise, so its edge is torn and ragged
 * and it comes apart into holes as it ages, which is what spray does and what
 * a lit ball of geometry, however knobbled, never did.
 */
const CARD_VERT = /* glsl */`
attribute vec4 iPos;     // where, and its half-width
attribute vec4 iShape;   // height over width, opacity, seed, how far through its life
attribute vec3 iVel;     // which way it is going, for a streak
uniform float uStretch;  // how many seconds of its flight a streak is drawn
uniform float uFogDensity;
varying vec2 vUv;
varying vec4 vShape;
varying float vFog;
varying float vThin;
varying float vAspect;

void main() {
  vUv = position.xy * 2.0;
  vShape = iShape;
  vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0);
  vec3 vv = (viewMatrix * vec4(iVel, 0.0)).xyz;
  float depth = min(mv.z, -0.5);
  vec2 sv = vv.xy - mv.xy * (vv.z / depth);
  float sl = length(sv) * uStretch;
  vec2 ax = sl > 1e-4 ? normalize(sv) : vec2(0.0, 1.0);
  vec2 pe = vec2(-ax.y, ax.x);
  float R = iPos.w;
  // Never less than about a pixel, and thinned in proportion rather than
  // left to sparkle as it crosses the pixel grid.
  float least = 0.0018 * -depth / projectionMatrix[1][1];
  vThin = R < least ? (R * R) / (least * least) : 1.0;
  R = max(R, least);
  float along = R * iShape.x + 0.5 * sl;
  vAspect = along / R;
  mv.xy += ax * (position.y * 2.0 * along) + pe * (position.x * 2.0 * R);
  // Not cut off by the eye going into it.
  vThin *= smoothstep(0.4 * R, 2.0 * R + 0.8, -mv.z);
  float fd = uFogDensity * length(mv.xyz);
  vFog = 1.0 - exp(-fd * fd);
  gl_Position = projectionMatrix * mv;
}
`;

const CARD_FRAG = /* glsl */`
uniform sampler2D uNoise;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uFogColor;
uniform vec3 uTint;
uniform float uSunUp;
varying vec2 vUv;
varying vec4 vShape;
varying float vFog;
varying float vThin;
varying float vAspect;

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
  float seed = vShape.z;
  float k = vShape.w;
  float a;
  float lit;
#ifdef DROP
  // A drop, or a little clot of them: a streak bright at its head and
  // tapering off behind, frayed along its length.
  float across = 1.0 - smoothstep(0.15, 1.0, abs(p.x));
  float along = 1.0 - smoothstep(0.35, 1.0, abs(p.y));
  float head = 0.45 + 0.55 * smoothstep(-0.9, 0.7, p.y);
  float fray = vn(vec3(p.x * 2.5 + seed * 41.0, p.y * vAspect * 1.5 + seed * 13.0, seed * 7.0));
  a = across * along * head * (0.55 + 0.7 * fray);
  lit = 0.95 + 0.1 * fray;
#else
  // White water: thrown, torn and blowing apart.
  float r = length(p);
  vec3 s3 = vec3(p * 1.35 + seed * 37.0, seed * 9.0 + k * 1.2);
  float f1 = vn(s3);
  float f2 = vn(s3 * 2.3 + vec3(3.3, 1.7, 0.0));
  float f3 = vn(vec3(p.x * 6.5 + seed * 11.0, p.y * 3.0 - k * 2.4, seed * 5.0 + 2.0));
  float f = f1 * 0.52 + f2 * 0.3 + f3 * 0.18;
  // The edge is the noise, not a circle: a soft falloff pushed in and out by
  // the coarse octaves so no two are the same shape and none is round.
  float f4 = vn(vec3(p * 4.2 + seed * 23.0, seed * 3.0 + k * 0.8));
  float edge = r + (f1 - 0.5) * 1.1 + (f2 - 0.5) * 0.5 + (f4 - 0.5) * 0.35;
  float env = 1.0 - smoothstep(0.22, 0.85, edge);
  // Torn apart as it goes: the threshold climbs through the noise, so the
  // thin places open into holes first and it ends as threads and nothing.
  float thr = 0.26 + 0.55 * k;
  float body = smoothstep(thr - 0.1, thr + 0.18, f * 0.8 + f4 * 0.2 + (1.0 - r) * 0.25);
  // And under the body a faint haze of what it is shedding.
  float haze = 0.22 * (1.0 - k) * env;
  a = max(env * body, haze) * (0.8 + 0.35 * f3);
  // Lit from above, and darker where it is thick: it has some body to it,
  // rather than being flat white paper.
  lit = mix(0.8, 1.06, smoothstep(-0.8, 0.9, p.y + (f2 - 0.5) * 0.6))
      * mix(1.0, 0.86, smoothstep(0.55, 0.95, env * body));
#endif
  a *= vShape.y * vThin;
  if (a < 0.003) discard;
  vec3 sun = mix(uSunCol, vec3(dot(uSunCol, vec3(0.333))), 0.5);
  vec3 col = uTint * (uSkyCol * 1.2 + sun * (0.62 + 0.38 * uSunUp)) * lit * 1.1;
  col = mix(col, uFogColor, vFog);
  gl_FragColor = vec4(col * a, a);
}
`;

/** One pool of cards, puffs or drops, drawn in one call. */
function cardMesh(scene, count, uniforms, drop) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(
    [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const attr = (name, n) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(count * n), n);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name, a);
    return a;
  };
  const out = { pos: attr('iPos', 4), shape: attr('iShape', 4), vel: attr('iVel', 3), geo };
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    vertexShader: CARD_VERT,
    fragmentShader: CARD_FRAG,
    defines: drop ? { DROP: 1 } : {},
    uniforms: { ...uniforms, uStretch: { value: drop ? 0.07 : 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  mat.toneMapped = false;
  out.mat = mat;
  out.mesh = new THREE.Mesh(geo, mat);
  out.mesh.frustumCulled = false;
  out.mesh.renderOrder = drop ? 4 : 3;
  scene.add(out.mesh);
  return out;
}

/** Hand the first `n` written cards of a pool to the GPU. */
function flush(c, n) {
  c.geo.instanceCount = n;
  c.mesh.visible = n > 0;
  if (!n) return;
  for (const [a, w] of [[c.pos, 4], [c.shape, 4], [c.vel, 3]]) {
    a.clearUpdateRanges();
    a.addUpdateRange(0, n * w);
    a.needsUpdate = true;
  }
}

/**
 * How each kind of thing that goes into the sea throws it up.
 *
 * Every one of them is the same three things, which is what a photograph of
 * any of them shows (see the notes on Splashes): a base surge of churned white
 * water spreading low across the sea, a stem driven up out of the middle of it,
 * and a head the stem breaks into at the top of its throw, raining back down
 * round its own edge. What changes is the proportions.
 *
 *   shell  a tall narrow stem and a head no wider than a few of it
 *   bomb   a thicker stem, a bigger head, a heavier surge
 *   dc     the sea heaving up white first, then a thick stem bursting up out of
 *          it into a broad head, over a wide surge
 *   torp   a tall column standing against a ship's side
 *   drop   a torpedo going in off a low run: low, and thrown forward
 *
 * `stem` is the stem's radius over the splash's, `side` how many thinner jets
 * stand round it, `head` how many puffs its head is made of and `bloom` how
 * wide they open out over the stem, `surge` how many puffs the base surge is
 * and `reach` how far out it runs.
 */
const KINDS = {
  shell: { tall: 1, wide: 1, stem: 0.4, side: [0, 2], head: 10, bloom: 1.5, surge: 18, reach: 1.7, drops: 1, delay: 0 },
  bomb: { tall: 0.85, wide: 1.2, stem: 0.46, side: [1, 3], head: 12, bloom: 1.8, surge: 22, reach: 2.0, drops: 1.4, delay: 0, maxH: 70 },
  dc: { tall: 0.6, wide: 1.15, stem: 0.5, side: [2, 3], head: 13, bloom: 1.6, surge: 24, reach: 2.0, drops: 1.8, delay: 0.32, maxH: 45 },
  torp: { tall: 1, wide: 1, stem: 0.5, side: [2, 3], head: 13, bloom: 1.25, surge: 18, reach: 1.8, drops: 1.2, delay: 0, maxH: 70 },
  drop: { tall: 0.5, wide: 0.8, stem: 0.4, side: [0, 1], head: 4, bloom: 1.2, surge: 9, reach: 1.4, drops: 0.6, delay: 0, maxH: 25 },
  // A sea broken against her bow: low and wide, thrown out and back along her
  // side rather than up, with no column in the middle of it.
  // No spires: a sea is not a column, and thin plumes stood up beside her
  // stem read as sticks. It goes up as torn sheets of white water (see sheet).
  bow: { tall: 0.5, wide: 1.6, stem: 0.12, side: [3, 5], head: 0, bloom: 2.0, surge: 0, reach: 0.7, drops: 2.2, delay: 0, maxH: 22, ring: 0, puffs: 0, sheets: 14 },
  // Her bow coming down out of the air onto the back of a sea: a slab of
  // water flung out on both sides of her, wider than it is high.
  slam: { tall: 0.42, wide: 2.1, stem: 0.1, side: [4, 6], head: 0, bloom: 2.3, surge: 0, reach: 0.8, drops: 2.6, delay: 0, maxH: 18, ring: 0, puffs: 0, sheets: 18 },
};

const rnd = (a, b) => a + Math.random() * (b - a);

export class Splashes {
  /**
   * `intensity` is the graphics quality dial the rest of the effects use: it
   * thins the spray and the little splashes on a slow machine, never the
   * column, because the column is the part that carries the information.
   */
  constructor(scene, intensity = 1) {
    this.scene = scene;
    this.intensity = intensity;
    // The waves a splash throws, when there is a sea to write them into (see
    // SplashRings in wakefield.js). Without one it falls back to the swell
    // meshes below.
    this.waves = null;
    const geo = makeGeometry();
    this.colTex = columnTexture();
    this.swellTex = swellTexture();
    this.foamTex = foamTexture();
    this.swellGeo = makeSwellGeometry();
    this.foamGeo = new THREE.PlaneGeometry(2, 2);

    const colMat = new THREE.MeshBasicMaterial({
      map: this.colTex, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, color: 0xf2f8ff, vertexColors: true,
    });
    const swellMat = new THREE.MeshBasicMaterial({
      map: this.swellTex, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, color: 0xe8f3ff,
    });
    const crownMat = new THREE.MeshBasicMaterial({
      map: this.colTex, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, color: 0xdcecfa,
    });
    const foamMat = new THREE.MeshBasicMaterial({
      map: this.foamTex, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, color: 0xeef6ff,
    });

    this.colPool = [];
    this.corePool = [];
    this.crownPool = [];
    this.swellPool = [];
    this.foamPool = [];
    for (let i = 0; i < COLUMNS; i++) {
      const m = new THREE.Mesh(geo.column, colMat.clone());
      m.visible = false; m.renderOrder = 3;
      scene.add(m); this.colPool.push(m);
      // The same wall again, inside and turned the other way. Where the two
      // overlap -- the middle of the mass -- the water is opaque; at the edges
      // only one of them is in the way, and it feathers.
      const core = new THREE.Mesh(geo.column, colMat.clone());
      core.visible = false; core.renderOrder = 3;
      scene.add(core); this.corePool.push(core);
      const c = new THREE.Mesh(geo.crown, crownMat.clone());
      c.visible = false; c.renderOrder = 3;
      scene.add(c); this.crownPool.push(c);
      const f = new THREE.Mesh(this.foamGeo, foamMat.clone());
      f.visible = false; f.renderOrder = 1; f.rotation.x = -Math.PI / 2;
      scene.add(f); this.foamPool.push(f);
    }
    for (let i = 0; i < SWELLS; i++) {
      const m = new THREE.Mesh(this.swellGeo, swellMat.clone());
      m.visible = false; m.renderOrder = 2;
      scene.add(m); this.swellPool.push(m);
    }
    this.columns = [];
    this.swells = [];
    this.foams = [];

    // The spires: one draw call for all of them, each fading on its own.
    const jetGeo = makePlumeGeometry();
    this.jetFade = new THREE.InstancedBufferAttribute(new Float32Array(JETS), 1);
    this.jetFade.setUsage(THREE.DynamicDrawUsage);
    jetGeo.setAttribute('aFade', this.jetFade);
    this.jetMesh = new THREE.InstancedMesh(jetGeo, plumeMaterial(foamStreakTexture()), JETS);
    this.jetMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.jetMesh.frustumCulled = false;
    this.jetMesh.renderOrder = 3;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < JETS; i++) this.jetMesh.setMatrixAt(i, zero);
    scene.add(this.jetMesh);

    // The puffs -- the base surge, the head, and white water thrown off a
    // ship -- and the spray: cards, one draw call each, lit by the sky (see
    // setAtmosphere).
    this.noise = noiseTexture();
    this.fogColor = new THREE.Color(0, 0, 0);
    this.cardU = {
      uNoise: { value: this.noise },
      uSunCol: { value: new THREE.Color() },
      uSkyCol: { value: new THREE.Color() },
      uFogColor: { value: this.fogColor },
      uFogDensity: { value: 0 },
      uTint: { value: new THREE.Color(...SPRAY_TINT) },
      uSunUp: { value: 0.75 },
    };
    this.puffCards = cardMesh(scene, PUFFS, this.cardU, false);
    this.dropCards = cardMesh(scene, DROPS, this.cardU, true);
    this.setAtmosphere({});
    this.puffFree = [];
    for (let i = PUFFS - 1; i >= 0; i--) this.puffFree.push(i);
    this.puffs = [];

    this.jetFree = [];
    for (let i = JETS - 1; i >= 0; i--) this.jetFree.push(i);
    this.jets = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();

    // The spray: it is falling water, drawn as the streaks it makes.
    this.dropPos = new Float32Array(DROPS * 3);
    this.dropSize = new Float32Array(DROPS);
    this.dropAlpha = new Float32Array(DROPS);
    // The sea under each where it was thrown, which is where it goes back in.
    this.dropBase = new Float32Array(DROPS);
    this.dropVel = new Float32Array(DROPS * 3);
    this.dropLife = new Float32Array(DROPS);
    // What landing does: 0 nothing, or the bore of the little splash it makes.
    this.dropKick = new Float32Array(DROPS);
    this.dropFree = [];
    for (let i = DROPS - 1; i >= 0; i--) this.dropFree.push(i);
    this.dropsLive = [];
  }

  /**
   * The hour and the cloud, as the gun smoke and the spray off the ships have
   * them (see MuzzleBlasts.setAtmosphere): white water is lit by the sky.
   */
  setAtmosphere({ preset = 'day', overcast = 0, sunDir = null } = {}) {
    const k = SKIES[preset] || SKIES.day;
    const u = this.cardU;
    const sun = new THREE.Color(...k.sun);
    const sky = new THREE.Color(...k.sky);
    const flat = (sun.r + sun.g + sun.b) / 3;
    const grey = (sky.r + sky.g + sky.b) / 3 + flat * 0.4;
    u.uSunCol.value.copy(sun).multiplyScalar(1 - 0.85 * overcast);
    u.uSkyCol.value.copy(sky).lerp(new THREE.Color(grey, grey, grey + flat * 0.02), overcast);
    if (sunDir) u.uSunUp.value = Math.min(1, Math.max(0, sunDir.y / (sunDir.length() || 1)));
  }

  /**
   * Where the sea stands at a point. A splash goes up out of the water that is
   * there, which in a heavy sea is metres above or below the mean -- stood on
   * nought, a splash in a trough hung in the air and one on a crest was
   * buried in it.
   */
  seaY(x, z) {
    return this.sea ? this.sea.heightAt(x, z) : 0;
  }

  /** The sea the waves go into. See SplashRings. */
  setWaves(waves) { this.waves = waves; }

  /**
   * Where the ships are, as a function handing back the ship views: a splash
   * is kept to her side, and the water it throws comes aboard her (see
   * refreshHulls).
   */
  setHulls(fn) { this.hullSource = fn; }

  /** The sea, to tell when a wave is higher than a deck. */
  setSea(ocean) { this.sea = ocean; }

  /**
   * A sea higher than her deck edge comes aboard: wherever a crest stands over
   * the gunwale it breaks across the deck in white water. Sampled down both
   * sides of every hull near enough to see it, a few times a second.
   */
  overtop(dt) {
    if (!this.sea || !this._hulls || !this._hulls.length) return;
    this.overClock = (this.overClock || 0) - dt;
    if (this.overClock > 0) return;
    this.overClock = 0.18;
    const v = this._ov || (this._ov = new THREE.Vector3());
    let budget = 6;
    for (const h of this._hulls) {
      for (let k = 0; k < 7 && budget > 0; k++) {
        const lz = (k / 6 - 0.5) * 1.8 * h.L;
        for (const side of [-1, 1]) {
          const lx = side * this.halfBeam(h, lz);
          v.set(lx, h.deck, lz).applyMatrix4(h.mw);
          const sea = this.sea.heightAt(v.x, v.z);
          if (sea > v.y + 0.15 && Math.random() < 0.7) {
            budget--;
            // A little in from the edge, which is where it lands.
            const w = (this._ow || (this._ow = new THREE.Vector3())).set(lx * 0.6, h.deck, lz).applyMatrix4(h.mw);
            this.deckSplash(w.x, w.y, w.z, Math.min(3, 0.8 + (sea - v.y) * 1.4));
          }
        }
      }
    }
  }

  /** Every hull on the sea this frame, in a form a point can be tested against. */
  refreshHulls() {
    const out = this._hulls || (this._hulls = []);
    let n = 0;
    if (this.hullSource) {
      for (const v of this.hullSource()) {
        const g = v && v.group;
        if (!g || !g.visible) continue;
        const ud = g.userData || {};
        const L = (ud.length || v.cls?.hull?.length || 0) / 2;
        const B = (ud.beam || v.cls?.hull?.beam || 0) / 2;
        if (!(L > 0 && B > 0)) continue;
        // Her own placing only, not every fitting on her: the renderer brings
        // the thousands of meshes under her up to date once a frame anyway,
        // and doing it here as well was the most expensive line in the game.
        g.updateWorldMatrix(true, false);
        const h = out[n] || (out[n] = { mw: new THREE.Matrix4(), inv: new THREE.Matrix4() });
        h.mw.copy(g.matrixWorld);
        h.inv.copy(g.matrixWorld).invert();
        h.x = h.mw.elements[12];
        h.z = h.mw.elements[14];
        h.L = L;
        h.B = B;
        h.deck = ud.deckY ?? Math.max(4, B * 0.7);
        h.reach = L + B + 4;
        n++;
      }
    }
    out.length = n;
    return out;
  }

  /** How far out her side is at `lz` along her, near enough: full amidships, fining to her ends. */
  halfBeam(h, lz) {
    const t = Math.min(1, Math.abs(lz) / h.L);
    return h.B * Math.sqrt(Math.max(0, 1 - t * t * t * t)) * (lz > 0 ? 1 - 0.3 * t * t : 1);
  }

  /** The hull (x, z) is over, and where it is in her own frame -- or null. */
  hullAt(x, z, pad = 0) {
    const hs = this._hulls;
    if (!hs || !hs.length) return null;
    const v = this._hv || (this._hv = new THREE.Vector3());
    for (const h of hs) {
      if (Math.abs(x - h.x) > h.reach + pad || Math.abs(z - h.z) > h.reach + pad) continue;
      v.set(x, 0, z).applyMatrix4(h.inv);
      if (Math.abs(v.z) > h.L + pad) continue;
      if (Math.abs(v.x) > this.halfBeam(h, v.z) + pad) continue;
      return { h, lx: v.x, lz: v.z };
    }
    return null;
  }

  /** The height of her deck in the world, over a point of her own. */
  deckWorld(h, lx, lz) {
    const v = this._dv || (this._dv = new THREE.Vector3());
    return v.set(lx, h.deck, lz).applyMatrix4(h.mw).y;
  }

  /**
   * Water coming down on a deck: it does not go through her into the sea. It
   * lands, bursts across the planking in a sheet of white and spray, and runs
   * off -- which is what a ship beside a heavy near miss takes aboard.
   */
  deckSplash(x, y, z, size) {
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const s0 = size * rnd(0.5, 0.9);
      this.puff({
        x, y: y + s0 * 0.15, z,
        dx: Math.sin(a) * size * rnd(1, 2.4), dz: Math.cos(a) * size * rnd(1, 2.4), dy: 0,
        s0: s0 * 0.6, s1: s0 * 1.5, squash: 0.35,
        delay: 0, ttl: rnd(0.9, 1.5), peak: 0.85, spread: 0.6, deck: y,
      });
    }
    // (No droplets thrown back up off the deck: they read as specks.)
    for (let i = 0; i < 0; i++) {
      const d = this.dropFree.pop();
      if (d === undefined) break;
      const a = Math.random() * Math.PI * 2;
      const up = rnd(2, 5) * Math.sqrt(size);
      this.dropPos[d * 3] = x; this.dropPos[d * 3 + 1] = y + 0.3; this.dropPos[d * 3 + 2] = z;
      this.dropVel[d * 3] = Math.sin(a) * up * 0.8;
      this.dropVel[d * 3 + 1] = up;
      this.dropVel[d * 3 + 2] = Math.cos(a) * up * 0.8;
      this.dropSize[d] = size * rnd(0.3, 0.6);
      this.dropAlpha[d] = 0;
      this.dropLife[d] = 0;
      this.dropKick[d] = 0;
      this.dropsLive.push(d);
    }
  }

  /**
   * Something in the water at (x, z).
   *
   * `bore` is the gun's calibre in millimetres; a torpedo, a bomb or a depth
   * charge passes the bore that throws the same weight of water. `opts.kind`
   * says what it was -- see KINDS -- because a depth charge and a shell of the
   * same weight do not throw the same shape.
   */
  splash(x, z, bore = REF_BORE, opts = {}) {
    const kind = KINDS[opts.kind] || KINDS.shell;
    const base = splashSize(bore);
    // Never in her. A round that is in the water is in the water beside her,
    // so a splash whose point falls inside a hull -- a near miss under her
    // side, a ship that has moved on since the round was reckoned -- is stood
    // off her side, the side it was nearer. What it throws can still come
    // aboard (see stepDrops and stepPuffs).
    if (!opts.onDeck) {
      if (!this._hulls) this.refreshHulls();
      const at = this.hullAt(x, z, base.radius * kind.wide * 0.3);
      if (at) {
        const side = at.lx === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(at.lx);
        const out = this.halfBeam(at.h, at.lz) + base.radius * kind.wide * 0.45 + 1;
        const v = (this._sv || (this._sv = new THREE.Vector3())).set(side * out, 0, at.lz).applyMatrix4(at.h.mw);
        x = v.x;
        z = v.z;
      }
    }
    const height = base.height * kind.tall;
    const radius = base.radius * kind.wide;
    // Which way it came in, which is the way it throws: a shell arrives on a
    // slant and the water goes on the way it was going.
    const lean = Number.isFinite(opts.heading) ? opts.heading : Math.random() * Math.PI * 2;
    // A little splash thrown up by the spray off a big one is spires, foam and
    // a ring: the columns are kept for the rounds that carry the information.
    // The plumes are the splash now (see spires). The old translucent column
    // is only drawn where there is no plume system (a scene built without
    // one). Its collar -- a flat skirt laid on the sea round the foot -- is
    // gone: it read as a white oval floating on the water.
    const col = opts.child || this.jetMesh ? null : this.colPool.pop();
    if (col) {
      const crown = this.crownPool.pop();
      const core = this.corePool.pop();
      col.position.set(x, 0, z);
      col.rotation.y = Math.random() * Math.PI * 2;
      col.material.opacity = 1;
      col.visible = true;
      if (core) {
        core.position.set(x, 0, z);
        core.rotation.y = col.rotation.y + 1.9 + Math.random();
        core.visible = true;
      }
      // Leaned off the vertical, the way it came in, and squashed on one axis.
      const tilt = rnd(0.03, 0.14);
      col.rotation.z = Math.sin(lean) * tilt;
      col.rotation.x = Math.cos(lean) * tilt;
      if (crown) {
        crown.position.set(x, 0, z);
        crown.rotation.y = Math.random() * Math.PI * 2;
        crown.material.opacity = 0.6;
        crown.visible = true;
      }
      // A tall column takes longer to go up and much longer to come down: an
      // 18-inch splash stands for the better part of four seconds, which is
      // what makes it possible to spot a straddle at twenty thousand yards.
      const rise = (0.22 + height * 0.006) * (opts.kind === 'dc' ? 1.8 : 1);
      this.columns.push({
        col, core, crown, x, z, h: height, r: radius,
        squash: opts.kind === 'drop' ? 0.5 : 0.7 + Math.random() * 0.5,
        life: 0, rise, ttl: rise + 1.3 + height * 0.022,
      });
    }
    // Held to what each of them actually throws: a torpedo against a ship's
    // side or a bomb stands sixty or seventy metres, whatever weight of water
    // the shell table would give it, and a column scaled past that is a
    // spindle, not a splash.
    const h = Math.min(base.height * kind.tall, kind.maxH || Infinity);
    // And the bigger it is, the thicker it is for its height: a heavy splash
    // is a mass of water, not a taller thin one.
    // As wide as its height makes it and no wider: a column held to seventy
    // metres is not as broad as the shell table's weight of water would be.
    const r = Math.min(radius, h * 0.22);
    this.thick = Math.min(1.6, 1 + 0.2 * Math.max(0, h / 23 - 1));
    // Everything below stands on the water that is actually there.
    this.base = this.seaY(x, z);
    if (kind.sheets) {
      // A sea broken against a ship: sheets of white water, no column.
      this.sheet(x, z, h, r, kind, lean);
    } else {
      this.spires(x, z, h, r, kind, lean, bore);
      this.surge(x, z, h, r, kind, opts.child);
      this.crest(x, z, h, r, kind, lean, opts.child);
      // The crown: water thrown up and out round the foot in torn sheets, which
      // is what the edge of a real splash is -- not a ring of round heaps.
      if (kind.surge > 0) this.crown(x, z, h, r, kind, opts.child);
    }
    // And the water coming back down out of the head, in clots, round the
    // stem and out past it.
    if (!opts.child) this.spray(x, z, h, r, kind, bore, lean);
    // The patch of churned water underneath it, which is what actually marks
    // where the round went in. With a sea to write into it is written there,
    // torn up, by the ring (see SplashRings); without one it is two patches
    // laid on the water, turned and stretched differently.
    for (let k = 0; k < (this.waves ? 0 : opts.child ? 1 : 2); k++) {
      const foam = this.foamPool.pop();
      if (!foam) break;
      foam.position.set(x + rnd(-0.4, 0.4) * radius, 0.28 + k * 0.02, z + rnd(-0.4, 0.4) * radius);
      foam.rotation.z = Math.random() * Math.PI * 2;
      foam.material.opacity = 0;
      foam.visible = true;
      this.foams.push({
        m: foam, r0: radius * (1.3 + k * 0.4), r1: radius * (3.6 + k * 1.4),
        stretch: rnd(0.55, 1.0), life: 0, ttl: 3.4 + height * 0.05, peak: k ? 0.4 : 0.6,
      });
    }
    // And the wave that runs out from it: into the sea itself if there is one
    // to write to, or as the swell meshes if there is not.
    if (this.waves) {
      // A sea breaking on a ship's bow throws spray, not a wave: the water in
      // it was the wave already, and it leaves no ring of white running out
      // over the sea. See `ring` in KINDS.
      if (kind.ring === undefined) this.waves.add(x, z, height, radius, opts.kind === 'dc' ? 1.4 : 1);
    } else {
      const rings = Math.max(1, Math.round(3 * this.intensity));
      for (let i = 0; i < rings; i++) this.swell(x, z, radius, height, i);
    }
  }

  /**
   * A small thing into the sea: an aircraft's round, or a stream of them.
   *
   * Not a shell splash scaled down -- a rifle bullet does not throw a column,
   * it throws a thin white spout a few metres high that is gone in a second,
   * and a stream of them walks a line of those across the water, which is how
   * a pilot sees where his burst went. `bore` is the round's calibre in
   * millimetres: a twenty-millimetre shell throws a good deal more than a
   * thirty.
   */
  spout(x, z, bore = 12.7) {
    this.base = this.seaY(x, z);
    const k = Math.max(0.6, Math.min(2, bore / 12.7));
    const h = rnd(3.2, 5) * k;
    const w = rnd(0.4, 0.58) * Math.sqrt(k);
    // The spout, and now and then a thinner one leaning off it.
    for (let i = 0; i < (Math.random() < 0.4 ? 2 : 1); i++) {
      const slot = this.jetFree.pop();
      if (slot === undefined) break;
      const a = Math.random() * Math.PI * 2;
      const hh = h * (i ? rnd(0.5, 0.75) : 1);
      const rise = 0.12 + hh * 0.02;
      this.jets.push({
        y0: this.base || 0, slot, x: x + (i ? Math.sin(a) * w * 0.6 : 0), z: z + (i ? Math.cos(a) * w * 0.6 : 0),
        a, tilt: i ? rnd(0.1, 0.25) : rnd(0, 0.08),
        w: w * (i ? 0.6 : 1), h: hh, delay: 0, rise, ttl: rise + 0.55 + hh * 0.05, life: 0,
      });
    }
    // A puff of white water at its foot.
    this.puff({
      x, z, y: 0.2, dx: 0, dz: 0, dy: 0.2,
      s0: w * 1.2, s1: w * 3, squash: 0.75,
      delay: 0, ttl: rnd(0.7, 1.1), peak: 0.6, spread: 0.4, low: true,
    });
    // And a little ring off it, while the sea has room for one: the rings off
    // the shell splashes are the ones that matter, and a burst of a hundred
    // rounds must not push them out.
    if (this.waves && this.waves.live.length < 48 && Math.random() < 0.35) {
      this.waves.add(x, z, h * 0.6, w * 2, 0.5);
    }
  }

  /**
   * Something of an aeroplane dragging through the sea: a wingtip in a low
   * turn, her belly, her floats. `vx`, `vz` is how fast it is going and `depth`
   * how far into the water it is. The water is thrown up behind it in a sheet
   * and falls back in a line of spray, and the sea is left torn up where it
   * went -- called every frame it is in, it lays that line along her track.
   */
  skim(x, z, vx, vz, depth = 0.3, dt = 1 / 60) {
    const sp = Math.hypot(vx, vz);
    if (sp < 1) return;
    const ux = vx / sp, uz = vz / sp;
    const d = Math.max(0.1, Math.min(2, depth));
    this.base = this.seaY(x, z);
    // How much she throws goes with her speed and how deep she is in.
    const n = Math.min(10, Math.round((1 + sp * dt * 0.6) * (0.6 + d) * this.intensity));
    for (let i = 0; i < n; i++) {
      const s = this.dropFree.pop();
      if (s === undefined) break;
      // Thrown up and out to either side of the thing cutting the water, and
      // carried on a little with it.
      const side = Math.random() < 0.5 ? -1 : 1;
      const out = rnd(2, 6) * (0.6 + d);
      const up = rnd(3, 8) * Math.sqrt(0.5 + d);
      const back = rnd(0, 1) * sp * dt;
      this.dropPos[s * 3] = x - ux * back + rnd(-0.3, 0.3);
      this.dropPos[s * 3 + 1] = this.base + rnd(0.1, 0.4);
      this.dropBase[s] = this.base;
      this.dropPos[s * 3 + 2] = z - uz * back + rnd(-0.3, 0.3);
      this.dropVel[s * 3] = ux * sp * rnd(0.15, 0.4) - uz * side * out;
      this.dropVel[s * 3 + 1] = up;
      this.dropVel[s * 3 + 2] = uz * sp * rnd(0.15, 0.4) + ux * side * out;
      this.dropSize[s] = rnd(0.5, 1.3) * (0.7 + d * 0.6);
      this.dropAlpha[s] = 0;
      this.dropLife[s] = 0;
      this.dropKick[s] = 0;
      this.dropsLive.push(s);
    }
    // The white water torn up where it went through, left lying on the sea.
    this.skimT = (this.skimT || 0) - dt;
    if (this.skimT > 0) return;
    this.skimT = 0.05;
    const w = 0.8 + d * 1.6;
    this.puff({
      x, z, y: 0.2, dx: ux * sp * 0.12, dz: uz * sp * 0.12, dy: 0.4 + d,
      s0: w * 0.8, s1: w * 2.4, squash: 0.75,
      delay: 0, ttl: rnd(1.2, 1.8), peak: 0.75, spread: 0.6, low: true,
    });
    // A rooster tail of it off a deep cut.
    if (d > 0.5) {
      const slot = this.jetFree.pop();
      if (slot !== undefined) {
        const h = rnd(2, 4) * d;
        const rise = 0.15 + h * 0.02;
        this.jets.push({
          y0: this.base || 0, slot, x: x - ux * 2, z: z - uz * 2, a: Math.atan2(-ux, -uz), tilt: rnd(0.3, 0.5),
          w: 0.5 + d * 0.4, h, delay: 0, rise, ttl: rise + 0.6, life: 0,
        });
      }
    }
    // And a ripple running out from it, every so often.
    this.skimRing = (this.skimRing || 0) - 0.05;
    if (this.waves && this.skimRing <= 0 && this.waves.live.length < 56) {
      this.skimRing = 0.25;
      this.waves.add(x, z, 4 + d * 6, 1 + d, 0.8);
    }
  }

  /**
   * The crown: a ring of thin sheets of water leaning out from the foot of the
   * splash, short and ragged, thrown up in the first instant and falling away
   * outward. Drawn with the same torn plumes as the stem, laid over.
   */
  crown(x, z, height, radius, kind, child) {
    const n = Math.round((child ? 4 : 10 + Math.min(8, height / 10)) * Math.max(0.6, this.intensity));
    for (let i = 0; i < n; i++) {
      const slot = this.jetFree.pop();
      if (slot === undefined) return;
      const a = (i / n) * Math.PI * 2 + rnd(-0.3, 0.3);
      const off = radius * rnd(0.35, 0.6);
      const h = height * rnd(0.1, 0.3) * (kind.tall < 0.7 ? 1.3 : 1);
      const rise = 0.12 + h * 0.008;
      this.jets.push({
        y0: this.base || 0, slot, x: x + Math.sin(a) * off, z: z + Math.cos(a) * off,
        // Leaning well out, the way it is thrown.
        a, tilt: rnd(0.35, 0.95),
        w: radius * rnd(0.06, 0.13), h,
        delay: kind.delay + rnd(0, 0.05), rise, ttl: rise + 0.7 + h * 0.02, life: 0,
      });
    }
  }

  /**
   * The stem: one narrow, rough column driven straight up out of the middle,
   * the full height of the splash -- the thing a spotter reads -- and a jet or
   * two thinner than it standing close in against it, so its edge is torn
   * rather than smooth.
   */
  spires(x, z, height, radius, kind, lean, bore) {
    const sides = Math.round(rnd(kind.side[0], kind.side[1] + 0.99) * Math.min(1, 0.5 + bore / 400));
    for (let i = 0; i <= sides; i++) {
      const slot = this.jetFree.pop();
      if (slot === undefined) return;
      const stem = i === 0;
      const a = lean + (Math.random() - 0.5) * Math.PI * 2;
      const off = stem ? radius * rnd(0, 0.08) : radius * rnd(0.12, 0.3);
      const h = height * (stem ? rnd(0.96, 1.04) : rnd(0.55, 0.85));
      const rise = (0.2 + h * 0.0065) * (stem ? 1 : rnd(0.9, 1.15));
      this.jets.push({
        y0: this.base || 0, slot, x: x + Math.sin(a) * off, z: z + Math.cos(a) * off,
        // Near vertical: what drives it up is under it.
        a, tilt: stem ? rnd(0, 0.04) : rnd(0.03, 0.1),
        w: radius * kind.stem * (this.thick || 1) * (stem ? rnd(0.95, 1.1) : rnd(0.45, 0.65)), h,
        delay: kind.delay + (stem ? 0 : rnd(0.02, 0.12)), rise,
        ttl: rise + 1.2 + h * 0.022,
        life: 0,
      });
    }
  }

  /** One puff, of the surge or of the head. */
  puff(p) {
    const slot = this.puffFree.pop();
    if (slot === undefined) return;
    p.slot = slot;
    p.life = 0;
    p.seed = Math.random();
    // Off the sea where it was thrown, unless it was put on a deck.
    p.base = p.deck === undefined ? (this.base ?? this.seaY(p.x, p.z)) : 0;
    this.puffs.push(p);
  }

  /**
   * The base surge: a ring of churned white water and mist thrown out low
   * across the sea from the foot of the splash in the first instant, dense and
   * turbulent, spreading fast and then hanging, wider than the stem ever is.
   */
  surge(x, z, height, radius, kind, child) {
    const n = Math.round(kind.surge * 1.4 * (child ? 0.4 : 1) * Math.max(0.6, this.intensity));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.4, 0.4);
      // Small, many and torn, rather than a few round heaps: flattened
      // heaps on the water read as a ring of white ovals.
      const size = radius * rnd(0.16, 0.28);
      const out = radius * kind.reach * rnd(0.5, 1.1);
      const ttl = 1.8 + height * 0.025;
      this.puff({
        x: x + Math.sin(a) * radius * 0.3, z: z + Math.cos(a) * radius * 0.3, y: size * 0.5,
        // Out fast and then hung up: it is thrown, and the air stops it.
        dx: Math.sin(a) * out, dz: Math.cos(a) * out, dy: size * rnd(0.6, 1.4),
        s0: size * 0.5, s1: size * 1.3, squash: rnd(0.7, 0.95),
        delay: kind.delay * 0.4 + rnd(0, 0.08), ttl: ttl * rnd(0.75, 1.15),
        peak: rnd(0.55, 0.8), spread: 0.4, low: true,
      });
    }
  }

  /**
   * The crest: where the stem runs out of push it breaks into a head of spray,
   * puff over puff, wider the higher they are -- the mushroom every photograph
   * of a fall of shot has over each column -- softer and thinner than the stem,
   * opening out as it hangs and drifting off downwind.
   */
  crest(x, z, height, radius, kind, lean, child) {
    const n = Math.round(kind.head * (child ? 0.35 : 1) * Math.max(0.6, this.intensity));
    const w = radius * kind.stem * (this.thick || 1);
    const rise = 0.2 + height * 0.0065;
    for (let i = 0; i < n; i++) {
      // Up the top half of the stem, crowding toward the top.
      const u = 0.5 + 0.5 * Math.pow(Math.random(), 0.6);
      const a = lean + Math.random() * Math.PI * 2;
      const off = w * (0.3 + kind.bloom * (u - 0.5) * 1.6) * rnd(0.4, 1);
      const size = w * (0.7 + kind.bloom * (u - 0.4)) * rnd(0.75, 1.15);
      const ttl = 1.6 + height * 0.035;
      this.puff({
        x: x + Math.sin(a) * off, z: z + Math.cos(a) * off, y: height * u * 0.92,
        // Opening outward and sinking as it goes, the way the head of a column
        // spreads and comes back down over itself.
        dx: Math.sin(a) * w * kind.bloom * rnd(0.4, 1.0), dz: Math.cos(a) * w * kind.bloom * rnd(0.4, 1.0),
        dy: -height * rnd(0.08, 0.2),
        s0: size * 0.45, s1: size * 1.45, squash: rnd(0.8, 1.05),
        // Each one blooms as the top of the stem goes past it.
        delay: kind.delay + rise * u * rnd(0.85, 1.05), ttl: ttl * rnd(0.85, 1.15),
        // Softer and thinner than the stem it came off.
        peak: rnd(0.5, 0.72), spread: 0.5,
      });
    }
  }

  /**
   * A sea broken against a ship: torn sheets of white water flung up and out
   * along the way it was going, which climb, hang a moment and fall back --
   * thrown, not grown, so they arc like the tons of water they are.
   */
  sheet(x, z, height, radius, kind, lean) {
    const n = Math.round(kind.sheets * Math.max(0.6, this.intensity));
    for (let i = 0; i < n; i++) {
      // Fanned either side of the way it is thrown, most of it near the middle.
      const a = lean + (Math.random() + Math.random() - 1) * 0.9;
      const u = Math.random();
      const up = Math.sqrt(2 * G * height * (0.25 + 0.75 * u));
      const out = up * rnd(0.25, 0.6) * kind.wide * 0.6;
      const size = radius * rnd(0.22, 0.42) * (0.7 + 0.5 * (1 - u));
      this.puff({
        x: x + Math.sin(a) * radius * rnd(0, 0.3), z: z + Math.cos(a) * radius * rnd(0, 0.3), y: size * 0.3,
        vx: Math.sin(a) * out, vz: Math.cos(a) * out, vy: up * rnd(0.75, 1.0),
        s0: size * 0.55, s1: size * rnd(1.6, 2.3), squash: rnd(0.75, 1.15),
        delay: rnd(0, 0.12), ttl: rnd(1.3, 2.0) * Math.sqrt(height / 14),
        peak: rnd(0.6, 0.85), spread: 0.3,
      });
    }
  }

  /** The water thrown up out of it, which has to come down again somewhere. */
  spray(x, z, height, radius, kind, bore, lean) {
    const k = Math.max(0.35, bore / REF_BORE);
    const n = Math.round(Math.min(160, 12 * Math.pow(k, 1.2) * kind.drops) * this.intensity);
    // A big splash's spray makes splashes of its own where it lands; a small
    // one's is gone into the sea without a mark.
    let kids = 0;
    for (let i = 0; i < n; i++) {
      const s = this.dropFree.pop();
      if (s === undefined) return;
      const a = lean + (Math.random() - 0.5) * Math.PI * 2.2;
      const u = rnd(0.25, 0.95);
      const v = Math.sqrt(2 * G * height * u);
      // Up the stem with it, and out of its head: so it falls round the edge
      // of the head and down past the stem, like rain off it.
      const out = rnd(0.07, 0.24) * v + rnd(0, 0.4) * Math.sqrt(G * radius);
      this.dropPos[s * 3] = x + Math.sin(a) * radius * kind.stem * rnd(0.2, 1.0);
      this.dropPos[s * 3 + 1] = (this.base || 0) + rnd(0.5, 2.5);
      this.dropBase[s] = this.base || 0;
      this.dropPos[s * 3 + 2] = z + Math.cos(a) * radius * kind.stem * rnd(0.2, 1.0);
      this.dropVel[s * 3] = Math.sin(a) * out;
      this.dropVel[s * 3 + 1] = v * rnd(0.55, 0.95);
      this.dropVel[s * 3 + 2] = Math.cos(a) * out;
      this.dropSize[s] = rnd(0.25, 0.7) * (0.7 + k * 0.35);
      this.dropAlpha[s] = 0;
      this.dropLife[s] = -(kind.delay + rnd(0, 0.25));
      let kick = 0;
      if (kids > 0 && Math.random() < 0.35) { kids--; kick = Math.min(150, bore * rnd(0.12, 0.22)); }
      this.dropKick[s] = kick;
      this.dropsLive.push(s);
    }
  }

  swell(x, z, radius, height, i) {
    const m = this.swellPool.pop();
    if (!m) return;
    m.position.set(x, 0.35, z);
    m.rotation.y = Math.random() * Math.PI * 2;
    m.visible = true;
    m.material.opacity = 0;
    this.swells.push({
      m, x, z,
      delay: i * 0.16,
      r0: radius * (1.15 + i * 0.5),
      // Deep-water waves run at a speed set by their length, and a bigger
      // splash makes a longer wave; this is that, flattened into something a
      // battle can be read through.
      speed: 9 + height * 0.16 - i * 1.1,
      crest: Math.max(0.2, height * 0.038) * (1 - i * 0.22),
      peak: 0.34 - i * 0.075,
      life: 0,
      ttl: 1.9 + height * 0.032 + i * 0.25,
    });
  }

  update(dt) {
    const fog = this.scene.fog;
    if (fog && fog.isFogExp2) {
      // Fog colours live in linear space; these shaders write display colours.
      this.fogColor.copy(fog.color).convertLinearToSRGB();
      this.cardU.uFogDensity.value = fog.density;
    } else {
      this.cardU.uFogDensity.value = 0;
    }
    if (this.waves) this.waves.update(dt);
    this.refreshHulls();
    this.overtop(dt);
    // How many deck splashes a frame may start: a straddle lands a great deal
    // of water on a ship at once, and every drop of it does not need a splash.
    this.deckBudget = 8;
    for (let i = this.columns.length - 1; i >= 0; i--) {
      const c = this.columns[i];
      c.life += dt;
      const k = c.life / c.ttl;
      if (k >= 1) {
        if (c.col) { c.col.visible = false; this.colPool.push(c.col); }
        if (c.core) { c.core.visible = false; this.corePool.push(c.core); }
        if (c.crown) { c.crown.visible = false; this.crownPool.push(c.crown); }
        this.columns.splice(i, 1);
        continue;
      }
      // Up fast, easing off at the top of its throw; then it sags back into the
      // sea rather than shrinking, which is the difference between water
      // falling and a cone being scaled down.
      let f;
      let spread;
      if (c.life < c.rise) {
        const u = c.life / c.rise;
        f = Math.sin(u * Math.PI * 0.5);
        spread = 0.55 + u * 0.45;
      } else {
        const u = (c.life - c.rise) / (c.ttl - c.rise);
        f = (1 - u) * (1 - u * u * 0.3);
        spread = 1 + u * 0.34;
        // And it goes back where it came from: the foot of the column settles
        // under the surface as it falls, so what is left at the end is a patch
        // of disturbed water rather than a slab standing on it.
        if (c.col) c.col.position.y = -c.h * 0.05 * u;
      }
      if (c.col) {
        c.col.scale.set(c.r * spread, Math.max(0.6, c.h * f), c.r * spread * c.squash);
        c.col.material.opacity = 0.9 * (1 - k) * (1 - k * k);
      }
      if (c.core && c.col) {
        c.core.position.y = c.col.position.y;
        c.core.scale.set(c.r * spread * 0.74, Math.max(0.5, c.h * f * 0.88), c.r * spread * 0.74 * c.squash);
        c.core.rotation.z = c.col.rotation.z * 0.6;
        c.core.rotation.x = c.col.rotation.x * 0.6;
        c.core.material.opacity = c.col.material.opacity * 0.85;
      }
      if (c.crown) {
        // The collar is thrown out in the first fifth of a second and is gone
        // before the column has finished rising.
        const u = Math.min(1, c.life / (c.rise * 1.6));
        c.crown.scale.set(c.r * (1 + u * 2.6), c.h * 0.16 * (1 - u * 0.5), c.r * (1 + u * 2.6));
        c.crown.material.opacity = 0.6 * (1 - u) * (1 - u);
        if (u >= 1 && c.crown.visible) { c.crown.visible = false; this.crownPool.push(c.crown); c.crown = null; }
      }
    }

    this.stepJets(dt);
    this.stepPuffs(dt);
    this.stepDrops(dt);

    for (let i = this.foams.length - 1; i >= 0; i--) {
      const f = this.foams[i];
      f.life += dt;
      const k = f.life / f.ttl;
      if (k >= 1) {
        f.m.visible = false; this.foamPool.push(f.m);
        this.foams.splice(i, 1);
        continue;
      }
      // Spreads quickly at first and then drifts, the way a patch of aerated
      // water does before the sea closes over it again.
      const r = f.r0 + (f.r1 - f.r0) * Math.pow(k, 0.45);
      f.m.scale.set(r, r * (f.stretch || 1), 1);
      f.m.material.opacity = f.peak * Math.min(1, f.life * 5) * (1 - k) * (1 - k);
    }

    for (let i = this.swells.length - 1; i >= 0; i--) {
      const s = this.swells[i];
      s.life += dt;
      if (s.life < s.delay) continue;
      const t = s.life - s.delay;
      const k = t / s.ttl;
      if (k >= 1) {
        s.m.visible = false; this.swellPool.push(s.m);
        this.swells.splice(i, 1);
        continue;
      }
      const r = s.r0 + s.speed * t * (1 - 0.28 * k);
      const decay = s.r0 / r;
      s.m.scale.set(r, s.crest * Math.max(0.15, Math.pow(decay, 0.6)), r);
      const rise = Math.min(1, t * 3.5);
      const fade = (1 - k) * (1 - k) * (1 - k * 0.4);
      s.m.material.opacity = s.peak * rise * rise * (3 - 2 * rise) * fade;
    }
  }

  stepJets(dt) {
    if (!this.jets.length) return;
    const m = this._m;
    for (let i = this.jets.length - 1; i >= 0; i--) {
      const j = this.jets[i];
      j.life += dt;
      const t = j.life - j.delay;
      if (t >= j.ttl) {
        this.jetMesh.setMatrixAt(j.slot, m.makeScale(0, 0, 0));
        this.jetFade.setX(j.slot, 0);
        this.jetFree.push(j.slot);
        this.jets.splice(i, 1);
        continue;
      }
      if (t < 0) {
        this.jetMesh.setMatrixAt(j.slot, m.makeScale(0, 0, 0));
        this.jetFade.setX(j.slot, 0);
        continue;
      }
      let f;
      let spread;
      let droop = 0;
      if (t < j.rise) {
        const u = t / j.rise;
        f = Math.sin(u * Math.PI * 0.5);
        spread = 0.5 + u * 0.5;
      } else {
        const u = (t - j.rise) / (j.ttl - j.rise);
        f = (1 - u) * (1 - u * u * 0.25);
        spread = 1 + u * 0.6;
        // A spire that has run out of push does not shrink: its head falls
        // away outward, and it bends over as it comes down.
        droop = u * 0.5;
      }
      const k = t / j.ttl;
      this._e.set(Math.cos(j.a) * (j.tilt + droop), 0, -Math.sin(j.a) * (j.tilt + droop));
      this._q.setFromEuler(this._e);
      this._p.set(j.x, (j.y0 || 0) - j.h * 0.04 * Math.max(0, k - 0.4), j.z);
      this._s.set(j.w * spread, Math.max(0.3, j.h * f), j.w * spread);
      m.compose(this._p, this._q, this._s);
      this.jetMesh.setMatrixAt(j.slot, m);
      // Whole while it stands; torn up into spray as it comes down.
      const tear = k < 0.5 ? 0 : (k - 0.5) / 0.5;
      this.jetFade.setX(j.slot, Math.min(1, t * 10) * (1 - tear * tear * (3 - 2 * tear)));
    }
    this.jetMesh.instanceMatrix.needsUpdate = true;
    this.jetFade.needsUpdate = true;
  }

  stepPuffs(dt) {
    const C = this.puffCards;
    const P = C.pos.array, S = C.shape.array, V = C.vel.array;
    let n = 0;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life += dt;
      const t = p.life - p.delay;
      if (t >= p.ttl) {
        this.puffFree.push(p.slot);
        this.puffs.splice(i, 1);
        continue;
      }
      if (t < 0) continue;
      const k = t / p.ttl;
      const size = p.s0 + (p.s1 - p.s0) * Math.pow(k, 0.5);
      let x, y, z, vy = 0;
      if (p.vy !== undefined) {
        // Thrown: it flies, and the air takes the way off it.
        const drag = 1 - Math.exp(-t * 0.9);
        x = p.x + p.vx * drag / 0.9;
        z = p.z + p.vz * drag / 0.9;
        y = p.base + p.y + p.vy * t - 0.5 * G * t * t;
        vy = p.vy - G * t;
        if (y < p.base) { y = p.base; vy = 0; }
      } else {
        // Thrown, then stopped by the air: most of the way out in the first
        // third of its life.
        const go = 1 - Math.pow(1 - k, 3);
        x = p.x + p.dx * go;
        z = p.z + p.dz * go;
        y = p.base + Math.max(size * p.squash * 0.2, p.y + p.dy * k);
      }
      // Surge running in under a ship goes up over her, not through her: it
      // comes aboard and across her deck.
      if (p.low) {
        const at = this.hullAt(x, z);
        if (at) {
          const deck = this.deckWorld(at.h, at.lx, at.lz) + size * p.squash * 0.3;
          if (y < deck) y = deck;
        }
      }
      // In quickly, and torn away to nothing as it goes.
      const tear = k < 0.35 ? 0 : (k - 0.35) / 0.65;
      const fade = p.peak * Math.min(1, t * 9) * (1 - tear * tear * (3 - 2 * tear));
      const o = n * 4;
      // A card is soft to its edge, so it is drawn a little larger than the
      // heap of geometry it replaces to cover the same water.
      P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = size * (1 + p.spread * k) * 1.25;
      S[o] = p.squash; S[o + 1] = fade; S[o + 2] = p.seed; S[o + 3] = k;
      V[n * 3] = 0; V[n * 3 + 1] = 0; V[n * 3 + 2] = 0;
      n++;
    }
    flush(C, n);
  }

  stepDrops(dt) {
    if (!this.dropsLive.length) { flush(this.dropCards, 0); return; }
    const P = this.dropPos;
    const V = this.dropVel;
    const drag = Math.exp(-dt * 0.35);
    for (let i = this.dropsLive.length - 1; i >= 0; i--) {
      const s = this.dropsLive[i];
      this.dropLife[s] += dt;
      if (this.dropLife[s] < 0) continue;
      V[s * 3] *= drag;
      V[s * 3 + 2] *= drag;
      V[s * 3 + 1] -= G * dt;
      P[s * 3] += V[s * 3] * dt;
      P[s * 3 + 1] += V[s * 3 + 1] * dt;
      P[s * 3 + 2] += V[s * 3 + 2] * dt;
      // Thinning as it goes, the way a clot of spray tears itself up in the air.
      const age = this.dropLife[s];
      this.dropAlpha[s] = 0.55 * Math.min(1, age * 6) * Math.max(0.25, 1 - age * 0.12);
      this.dropSize[s] *= 1 + dt * 0.18;
      // Coming down on a deck: it lands there, not in the sea under her.
      if (V[s * 3 + 1] < 0 && this._hulls && this._hulls.length) {
        const at = this.hullAt(P[s * 3], P[s * 3 + 2]);
        if (at) {
          const deck = this.deckWorld(at.h, at.lx, at.lz);
          if (P[s * 3 + 1] <= deck) {
            if (this.deckBudget > 0) {
              this.deckBudget--;
              this.deckSplash(P[s * 3], deck, P[s * 3 + 2], Math.max(0.8, this.dropSize[s]));
            }
            this.dropAlpha[s] = 0;
            this.dropSize[s] = 0;
            this.dropFree.push(s);
            this.dropsLive.splice(i, 1);
            continue;
          }
          // Over her and still above her deck: carry on falling.
          continue;
        }
      }
      if (P[s * 3 + 1] <= this.dropBase[s] && V[s * 3 + 1] < 0) {
        // Back in the sea. A big enough clot of it makes a splash of its own,
        // and a ring of its own -- which is what the water round a heavy fall of
        // shot is doing for seconds after the columns have gone.
        const kick = this.dropKick[s];
        if (kick > 0) this.splash(P[s * 3], P[s * 3 + 2], kick, { kind: 'drop', child: true });
        this.dropAlpha[s] = 0;
        this.dropSize[s] = 0;
        this.dropFree.push(s);
        this.dropsLive.splice(i, 1);
      }
    }
    // And into the cards, drawn out along the way each is going.
    const C = this.dropCards;
    const CP = C.pos.array, CS = C.shape.array, CV = C.vel.array;
    let n = 0;
    for (const s of this.dropsLive) {
      if (this.dropLife[s] < 0 || this.dropAlpha[s] <= 0) continue;
      const o = n * 4;
      CP[o] = P[s * 3]; CP[o + 1] = P[s * 3 + 1]; CP[o + 2] = P[s * 3 + 2];
      // Half-width: a clot of spray is far narrower than it is long in flight.
      CP[o + 3] = this.dropSize[s] * 0.3;
      CS[o] = 1; CS[o + 1] = this.dropAlpha[s] * 1.3; CS[o + 2] = (s * 0.618) % 1; CS[o + 3] = 0;
      CV[n * 3] = V[s * 3]; CV[n * 3 + 1] = V[s * 3 + 1]; CV[n * 3 + 2] = V[s * 3 + 2];
      n++;
    }
    flush(C, n);
  }
}
