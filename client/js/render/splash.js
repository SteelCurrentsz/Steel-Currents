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
    col.push((0.68 + 0.32 * up) * fold, (0.78 + 0.22 * up) * fold, (0.85 + 0.15 * up) * fold);
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
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.6})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 128, Math.random() * 256, 0.6 + Math.random() * 2.2, 0, Math.PI * 2);
    ctx.fill();
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
    vertexColors: true, color: 0xf2f6fa, map,
    // Spray is bright: it scatters the sky's light back as well as the sun's.
    emissive: 0x3d4a56,
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
    float keep = 1.0 - top * 0.9 * nz - rim * rim * 0.85 * (0.4 + nz);
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
    col.push(0.86 * shade, 0.92 * shade, 0.97 * shade);
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

const DROP_VERT = /* glsl */`
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
varying float vA;
void main() {
  vA = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;
const DROP_FRAG = /* glsl */`
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5 || vA <= 0.0) discard;
  // A clot of spray rather than a dot: dense in the middle, frayed at the edge.
  float a = vA * smoothstep(0.5, 0.05, d) * (0.75 + 0.25 * sin(c.x * 23.0 + c.y * 17.0));
  gl_FragColor = vec4(0.92, 0.96, 1.0, a);
}
`;

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
  bomb: { tall: 0.85, wide: 1.2, stem: 0.46, side: [1, 3], head: 12, bloom: 1.8, surge: 22, reach: 2.0, drops: 1.4, delay: 0 },
  dc: { tall: 0.6, wide: 1.15, stem: 0.5, side: [2, 3], head: 13, bloom: 1.6, surge: 24, reach: 2.0, drops: 1.8, delay: 0.32 },
  torp: { tall: 1.15, wide: 0.75, stem: 0.42, side: [1, 2], head: 10, bloom: 1.5, surge: 14, reach: 1.6, drops: 1.2, delay: 0 },
  drop: { tall: 0.5, wide: 0.8, stem: 0.4, side: [0, 1], head: 4, bloom: 1.2, surge: 9, reach: 1.4, drops: 0.6, delay: 0 },
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

    // The puffs: the base surge and the head, one draw call between them.
    const puffGeo = makePuffGeometry();
    this.puffFade = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS), 1);
    this.puffFade.setUsage(THREE.DynamicDrawUsage);
    puffGeo.setAttribute('aFade', this.puffFade);
    this.puffMesh = new THREE.InstancedMesh(puffGeo, plumeMaterial(this.jetMesh.material.map), PUFFS);
    this.puffMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.puffMesh.frustumCulled = false;
    this.puffMesh.renderOrder = 3;
    for (let i = 0; i < PUFFS; i++) this.puffMesh.setMatrixAt(i, zero);
    scene.add(this.puffMesh);
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

    // The spray, as points: it is falling water, in clots.
    const dg = new THREE.BufferGeometry();
    this.dropPos = new Float32Array(DROPS * 3);
    this.dropSize = new Float32Array(DROPS);
    this.dropAlpha = new Float32Array(DROPS);
    dg.setAttribute('position', new THREE.BufferAttribute(this.dropPos, 3).setUsage(THREE.DynamicDrawUsage));
    dg.setAttribute('aSize', new THREE.BufferAttribute(this.dropSize, 1).setUsage(THREE.DynamicDrawUsage));
    dg.setAttribute('aAlpha', new THREE.BufferAttribute(this.dropAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.dropMat = new THREE.ShaderMaterial({
      vertexShader: DROP_VERT, fragmentShader: DROP_FRAG,
      uniforms: { uScale: { value: 600 } },
      transparent: true, depthWrite: false,
    });
    this.dropPoints = new THREE.Points(dg, this.dropMat);
    this.dropPoints.frustumCulled = false;
    this.dropPoints.renderOrder = 4;
    // Sized to the screen it is drawn on, so a clot of spray is metres across
    // and not pixels.
    this.dropPoints.onBeforeRender = (renderer, _s, camera) => {
      const h = renderer.getDrawingBufferSize(this._sz || (this._sz = new THREE.Vector2())).y;
      const fov = (camera.fov || 50) * Math.PI / 180;
      this.dropMat.uniforms.uScale.value = h / (2 * Math.tan(fov / 2));
    };
    scene.add(this.dropPoints);
    this.dropVel = new Float32Array(DROPS * 3);
    this.dropLife = new Float32Array(DROPS);
    // What landing does: 0 nothing, or the bore of the little splash it makes.
    this.dropKick = new Float32Array(DROPS);
    this.dropFree = [];
    for (let i = DROPS - 1; i >= 0; i--) this.dropFree.push(i);
    this.dropsLive = [];
  }

  /** The sea the waves go into. See SplashRings. */
  setWaves(waves) { this.waves = waves; }

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
    const height = base.height * kind.tall;
    const radius = base.radius * kind.wide;
    // Which way it came in, which is the way it throws: a shell arrives on a
    // slant and the water goes on the way it was going.
    const lean = Number.isFinite(opts.heading) ? opts.heading : Math.random() * Math.PI * 2;
    // A little splash thrown up by the spray off a big one is spires, foam and
    // a ring: the columns are kept for the rounds that carry the information.
    // The plumes are the splash now (see spires). What is left of the old
    // translucent column is its collar -- the skirt of water thrown out
    // sideways in the first instant -- and only where there is no plume
    // system to draw the rest (a scene built without one).
    const col = opts.child || this.jetMesh ? null : this.colPool.pop();
    if (!col && !opts.child) this.collar(x, z, height, radius);
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
    const h = base.height * kind.tall;
    this.spires(x, z, h, radius, kind, lean, bore);
    this.surge(x, z, h, radius, kind, opts.child);
    this.crest(x, z, h, radius, kind, lean, opts.child);
    this.spray(x, z, h, radius, kind, bore, lean);
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
      this.waves.add(x, z, height, radius, opts.kind === 'dc' ? 1.4 : 1);
    } else {
      const rings = Math.max(1, Math.round(3 * this.intensity));
      for (let i = 0; i < rings; i++) this.swell(x, z, radius, height, i);
    }
  }

  /** The skirt of water thrown out sideways in the first instant. */
  collar(x, z, height, radius) {
    const crown = this.crownPool.pop();
    if (!crown) return;
    crown.position.set(x, 0, z);
    crown.rotation.set(0, Math.random() * Math.PI * 2, 0);
    crown.material.opacity = 0.5;
    crown.visible = true;
    const rise = 0.22 + height * 0.006;
    this.columns.push({ col: null, core: null, crown, x, z, h: height * 0.7, r: radius, life: 0, rise, ttl: rise * 1.7 });
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
        slot, x: x + Math.sin(a) * off, z: z + Math.cos(a) * off,
        // Near vertical: what drives it up is under it.
        a, tilt: stem ? rnd(0, 0.04) : rnd(0.03, 0.1),
        w: radius * kind.stem * (stem ? rnd(0.95, 1.1) : rnd(0.45, 0.65)), h,
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
    this._e.set(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3);
    p.q = new THREE.Quaternion().setFromEuler(this._e);
    p.slot = slot;
    p.life = 0;
    this.puffs.push(p);
  }

  /**
   * The base surge: a ring of churned white water and mist thrown out low
   * across the sea from the foot of the splash in the first instant, dense and
   * turbulent, spreading fast and then hanging, wider than the stem ever is.
   */
  surge(x, z, height, radius, kind, child) {
    const n = Math.round(kind.surge * (child ? 0.4 : 1) * Math.max(0.6, this.intensity));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.25, 0.25);
      const size = radius * rnd(0.3, 0.46);
      const out = radius * kind.reach * rnd(0.6, 1.1);
      const ttl = 2.2 + height * 0.03;
      this.puff({
        x: x + Math.sin(a) * radius * 0.35, z: z + Math.cos(a) * radius * 0.35, y: size * 0.25,
        // Out fast and then hung up: it is thrown, and the air stops it.
        dx: Math.sin(a) * out, dz: Math.cos(a) * out, dy: size * 0.3,
        s0: size * 0.6, s1: size * 1.45, squash: 0.45,
        delay: kind.delay * 0.4 + rnd(0, 0.06), ttl: ttl * rnd(0.85, 1.15),
        peak: 0.95, spread: 0.25,
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
    const w = radius * kind.stem;
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

  /** The water thrown up out of it, which has to come down again somewhere. */
  spray(x, z, height, radius, kind, bore, lean) {
    const k = Math.max(0.35, bore / REF_BORE);
    const n = Math.round(Math.min(220, 14 * Math.pow(k, 1.3) * kind.drops) * this.intensity);
    // A big splash's spray makes splashes of its own where it lands; a small
    // one's is gone into the sea without a mark.
    let kids = bore >= 180 ? Math.round((2 + k * 2.5) * this.intensity) : 0;
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
      this.dropPos[s * 3 + 1] = rnd(0.5, 2.5);
      this.dropPos[s * 3 + 2] = z + Math.cos(a) * radius * kind.stem * rnd(0.2, 1.0);
      this.dropVel[s * 3] = Math.sin(a) * out;
      this.dropVel[s * 3 + 1] = v * rnd(0.55, 0.95);
      this.dropVel[s * 3 + 2] = Math.cos(a) * out;
      this.dropSize[s] = rnd(0.6, 1.8) * (0.7 + k * 0.45);
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
    if (this.waves) this.waves.update(dt);
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
      this._p.set(j.x, -j.h * 0.04 * Math.max(0, k - 0.4), j.z);
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
    if (!this.puffs.length) return;
    const m = this._m;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life += dt;
      const t = p.life - p.delay;
      if (t >= p.ttl) {
        this.puffMesh.setMatrixAt(p.slot, m.makeScale(0, 0, 0));
        this.puffFade.setX(p.slot, 0);
        this.puffFree.push(p.slot);
        this.puffs.splice(i, 1);
        continue;
      }
      if (t < 0) {
        this.puffMesh.setMatrixAt(p.slot, m.makeScale(0, 0, 0));
        this.puffFade.setX(p.slot, 0);
        continue;
      }
      const k = t / p.ttl;
      // Thrown, then stopped by the air: most of the way out in the first
      // third of its life.
      const go = 1 - Math.pow(1 - k, 3);
      const size = p.s0 + (p.s1 - p.s0) * Math.pow(k, 0.5);
      this._p.set(p.x + p.dx * go, Math.max(size * p.squash * 0.2, p.y + p.dy * k), p.z + p.dz * go);
      this._s.set(size * (1 + p.spread * k), size * p.squash, size * (1 + p.spread * k));
      m.compose(this._p, p.q, this._s);
      this.puffMesh.setMatrixAt(p.slot, m);
      // In quickly, and torn away to nothing as it goes.
      const tear = k < 0.35 ? 0 : (k - 0.35) / 0.65;
      this.puffFade.setX(p.slot, p.peak * Math.min(1, t * 9) * (1 - tear * tear * (3 - 2 * tear)));
    }
    this.puffMesh.instanceMatrix.needsUpdate = true;
    this.puffFade.needsUpdate = true;
  }

  stepDrops(dt) {
    if (!this.dropsLive.length) return;
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
      if (P[s * 3 + 1] <= 0 && V[s * 3 + 1] < 0) {
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
    const g = this.dropPoints.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }
}
