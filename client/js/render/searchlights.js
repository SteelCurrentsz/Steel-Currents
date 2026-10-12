// Searchlights.
//
// Where they stand is found off the ship's own model rather than written down
// class by class: she is drawn once from straight overhead into a small height
// map, and the lamps go where a ship of her type carries them -- out on her
// bridge wings and on her after superstructure, a pair each, one either side;
// on a carrier's island, one each side of it; on a boat's tower. The same map
// is the plan of her the searchlight panel shows (see Hud.buildLampPanel).
//
// What a lamp throws is three things. The beam itself, a long soft cone drawn
// additively, which is what you see of a searchlight from anywhere but in
// front of it -- and which stands out far more in fog or rain, because then
// the air has something in it to light. The pool it puts on the sea, which
// the ocean shader draws (it is not lit by three's lights). And for the few
// lamps nearest the eye a real spotlight, so a ship caught in one lights up.

import * as THREE from '../../../vendor/three.module.js';
import { lampCount, LAMP_PITCH } from '../../../shared/searchlights.js';
import { freeboardOf } from '../../../shared/sim.js';

/** How far a beam is drawn, in metres. */
export const BEAM_LENGTH = 2200;
/** Half the angle of the beam. A real one was a degree or two across. */
export const BEAM_HALF = 0.022;
/** How many lamps get a real spotlight at once: the nearest to the eye. */
export const SPOTS = 3;

const LAMP_COLOR = new THREE.Color(0xfff2d6);

// Plans already worked out, by class. Her lines do not change.
const PLANS = new Map();

/**
 * Her plan from overhead, and her lamps on it.
 *
 * Returns { lamps: [{ x, y, z, side, name }], map: { w, h, halfX, halfZ,
 * heights } } in her own frame: bow at +z, port at +x. Without a renderer --
 * in the tests, under node -- the lamps are put where a ship of her size would
 * have them, which is near enough for anything that is not drawn.
 */
export function lampPlan(view, renderer = null) {
  const cls = view.cls;
  const key = view.classId || cls?.id;
  if (PLANS.has(key)) return PLANS.get(key);
  let plan = null;
  if (renderer && view.group) {
    try { plan = measuredPlan(view, renderer); } catch { plan = null; }
  }
  if (!plan) plan = guessedPlan(cls);
  PLANS.set(key, plan);
  return plan;
}

function guessedPlan(cls) {
  const L = cls.hull.length, B = cls.hull.beam;
  const fb = freeboardOf(cls);
  const up = fb + 4 + 6 * (cls.hull.superstructure || 1);
  const n = lampCount(cls);
  const lamps = [];
  if (n === 1) lamps.push({ x: 0, y: fb + 5, z: 0.02 * L, side: 0, name: 'Tower' });
  else if (n === 2) {
    lamps.push({ x: -B * 0.18, y: up + 6, z: 0.05 * L, side: 1, name: 'Island, port side' });
    lamps.push({ x: -B * 0.42, y: up + 6, z: 0.05 * L, side: -1, name: 'Island, starboard side' });
  } else {
    for (const [z, y, where] of [[0.2 * L, up, 'Bridge'], [-0.22 * L, up - 3, 'After superstructure']]) {
      lamps.push({ x: B * 0.3, y, z, side: 1, name: `${where}, port` });
      lamps.push({ x: -B * 0.3, y, z, side: -1, name: `${where}, starboard` });
    }
  }
  return { lamps, map: null };
}

const HEIGHT_VERT = /* glsl */`
uniform float uLum;
varying float vY;
varying float vDark;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vY = w.y;
  float lum = uLum;
#ifdef USE_COLOR
  lum *= dot(color.rgb, vec3(0.3, 0.59, 0.11));
#endif
  // Black paint: a funnel cap, the top of a stack. Not a platform for a lamp.
  vDark = lum < 0.045 ? 1.0 : 0.0;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const HEIGHT_FRAG = /* glsl */`
varying float vY;
varying float vDark;
void main() {
  // Metres over a hundred and twenty, in two channels: coarse and fine; and
  // whether it is painted black, in the third.
  float h = clamp(vY / 120.0, 0.0, 0.9999);
  float c = floor(h * 255.0) / 255.0;
  gl_FragColor = vec4(c, (h - c) * 255.0, vDark, 1.0);
}
`;

function measuredPlan(view, renderer) {
  const g = view.group;
  const cls = view.cls;
  // Drawn in her own frame: where she is in the world is put back after.
  const keep = { p: g.position.clone(), q: g.quaternion.clone(), s: g.scale.clone(), par: g.parent };
  g.position.set(0, 0, 0);
  g.quaternion.identity();
  g.scale.set(1, 1, 1);
  g.updateMatrixWorld(true);
  // Only her: whatever else rides on her group -- the ring round her on the
  // plot, a wake, the lamps themselves -- is put out of the picture for the
  // moment it is taken. Anything standing well outside her length or her
  // beam is not part of her.
  const L = cls.hull.length, B = cls.hull.beam;
  const hidden = [];
  const cb = new THREE.Box3();
  for (const c of g.children) {
    if (!c.visible) continue;
    cb.setFromObject(c);
    if (cb.isEmpty()) continue;
    const far = Math.max(Math.abs(cb.min.z), Math.abs(cb.max.z)) > L * 0.62
      || Math.max(Math.abs(cb.min.x), Math.abs(cb.max.x)) > B * 0.9
      || c.userData.lamp !== undefined;
    if (far) { c.visible = false; hidden.push(c); }
  }
  const halfZ = L * 0.52 + 2;
  const halfX = B * 0.5 * 1.12 + 1;
  // Fine enough across her that a bridge wing is a few pixels wide.
  const w = 96;
  const h = Math.max(128, Math.min(1024, Math.round(w * (halfZ / halfX))));
  const cam = new THREE.OrthographicCamera(-halfX, halfX, halfZ, -halfZ, 1, 400);
  // Straight down, bow at the top of the picture. The camera's right is then
  // her -x, which is her starboard: the plan reads the way a plan is drawn.
  cam.position.set(0, 200, 0);
  cam.up.set(0, 0, 1);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true });
  // A height material a mesh, by how dark its paint is and whether it is
  // painted per vertex: the black of a funnel cap is what tells it from a
  // platform, and a merged mesh carries its paint in its vertex colours.
  const mats = new Map();
  const swapped = [];
  const heightMat = (lum, vc) => {
    const key = `${Math.round(lum * 40)}:${vc ? 1 : 0}`;
    if (!mats.has(key)) {
      mats.set(key, new THREE.ShaderMaterial({
        vertexShader: HEIGHT_VERT, fragmentShader: HEIGHT_FRAG, side: THREE.DoubleSide,
        vertexColors: vc, uniforms: { uLum: { value: lum } },
      }));
    }
    return mats.get(key);
  };
  g.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
    // What is never drawn is not her: hit boxes and proxies carry a material
    // that is switched off, and swapping it for one that is not would stand
    // them up in the picture as solid platforms in the air.
    if (!m0 || m0.visible === false || (m0.transparent && (m0.opacity ?? 1) < 0.3)) {
      if (o.visible) { o.visible = false; hidden.push(o); }
      return;
    }
    const col = m0 && m0.color ? m0.color : null;
    const lum = col ? col.r * 0.3 + col.g * 0.59 + col.b * 0.11 : 1;
    const vc = !!(m0 && m0.vertexColors && o.geometry?.attributes?.color);
    swapped.push([o, o.material]);
    o.material = heightMat(lum, vc);
  });
  const mat = { dispose() { for (const m of mats.values()) m.dispose(); } };
  const scene = new THREE.Scene();
  if (keep.par) keep.par.remove(g);
  scene.add(g);
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const buf = new Uint8Array(w * h * 4);
  try {
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  } finally {
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    scene.remove(g);
    for (const [o, m] of swapped) o.material = m;
    for (const c of hidden) c.visible = true;
    if (keep.par) keep.par.add(g);
    g.position.copy(keep.p);
    g.quaternion.copy(keep.q);
    g.scale.copy(keep.s);
    g.updateMatrixWorld(true);
    rt.dispose();
    mat.dispose();
  }
  // Heights, in metres; NaN where there is nothing of her.
  const heights = new Float32Array(w * h);
  const dark = new Uint8Array(w * h);
  let any = 0;
  for (let i = 0; i < w * h; i++) {
    const a = buf[i * 4 + 3];
    if (a < 128) { heights[i] = NaN; continue; }
    heights[i] = (buf[i * 4] / 255 + buf[i * 4 + 1] / 255 / 255) * 120;
    dark[i] = buf[i * 4 + 2] > 128 ? 1 : 0;
    any++;
  }
  if (any < 50) return null;
  const map = { w, h, halfX, halfZ, heights, dark };
  const found = findLamps(cls, map);
  // Her lamps where they were found, or where a ship her size would have
  // them -- but the map either way: the human view walks her deck off it.
  const lamps = found ? found.map((l) => ground(map, l)) : guessedPlan(cls).lamps;
  return { lamps, map };
}

// Pixel to her own frame, and back. Row 0 is the bottom of the picture --
// her stern -- and column 0 its left, which is her port side.
function colX(map, i) { return ((i + 0.5) / map.w * 2 - 1) * -map.halfX; }
function rowZ(map, j) { return ((j + 0.5) / map.h * 2 - 1) * map.halfZ; }
function at(map, i, j) {
  if (i < 0 || j < 0 || i >= map.w || j >= map.h) return NaN;
  return map.heights[j * map.w + i];
}

function findLamps(cls, map) {
  const L = cls.hull.length;
  // Her deck, off the picture itself: most of a ship seen from overhead is
  // deck, so it is the low quarter of the heights in it.
  const all = [];
  for (const y of map.heights) if (Number.isFinite(y)) all.push(y);
  all.sort((a, b) => a - b);
  const deck = all.length ? all[Math.floor(all.length * 0.3)] : freeboardOf(cls);
  const n = lampCount(cls);
  const rows = (z0, z1) => {
    const out = [];
    for (let j = 0; j < map.h; j++) {
      const z = rowZ(map, j);
      if (z >= z0 * L && z <= z1 * L) out.push(j);
    }
    return out;
  };
  // The outermost point on one side of a row that stands well above her
  // deck, and how high it is there. `s` is +1 for port (+x), -1 starboard.
  const edge = (j, s, over) => {
    const half = map.w / 2;
    let best = null;
    for (let k = 0; k < half; k++) {
      // Walk in from the side toward the middle.
      const i = s > 0 ? k : map.w - 1 - k;
      const y = at(map, i, j);
      if (Number.isFinite(y) && y > over) { best = { i, y }; break; }
    }
    if (!best) return null;
    // The height a little in from the edge, which is the top of whatever the
    // edge belongs to rather than the rim of it.
    let top = best.y;
    for (let d = 1; d <= 3; d++) {
      const y = at(map, best.i - s * d, j);
      if (Number.isFinite(y)) top = Math.max(top, y);
    }
    return { x: colX(map, best.i), y: top, i: best.i };
  };

  if (n === 1) {
    // A boat: the top of her tower, at its forward edge.
    let top = -Infinity, ti = 0, tj = 0;
    for (let j = 0; j < map.h; j++) for (let i = 0; i < map.w; i++) {
      const y = at(map, i, j);
      if (Number.isFinite(y) && y > top && Math.abs(rowZ(map, j)) < 0.3 * L) { top = y; ti = i; tj = j; }
    }
    if (!Number.isFinite(top)) return null;
    let fj = tj;
    while (fj + 1 < map.h && at(map, ti, fj + 1) > top - 1.2) fj++;
    return [{ x: colX(map, ti), y: at(map, ti, fj) + 0.7, z: rowZ(map, fj), side: 0, name: 'Tower' }];
  }

  if (n === 2) {
    // A carrier: the island is the tall thing standing on her flight deck.
    let top = -Infinity, tj = 0;
    for (const j of rows(-0.4, 0.4)) for (let i = 0; i < map.w; i++) {
      const y = at(map, i, j);
      if (Number.isFinite(y) && y > top) { top = y; tj = j; }
    }
    if (!Number.isFinite(top)) return null;
    // Down from its top to a level a searchlight platform stands at, and its
    // two edges there.
    const level = deck + (top - deck) * 0.55;
    let best = null;
    for (const j of rows(-0.4, 0.4)) {
      const ins = [];
      for (let i = 0; i < map.w; i++) {
        const y = at(map, i, j);
        if (Number.isFinite(y) && y > level) ins.push(i);
      }
      if (ins.length < 2) continue;
      const span = ins[ins.length - 1] - ins[0];
      const score = span + (Math.abs(j - tj) < map.h * 0.04 ? 6 : 0);
      if (!best || score > best.score) best = { j, a: ins[0], b: ins[ins.length - 1], score };
    }
    if (!best) return null;
    // On what is actually there at the island's edge, not on the level the
    // edge was looked for at: a lamp stands on plating, not on a number.
    const ya = at(map, best.a, best.j);
    const yb = at(map, best.b, best.j);
    return [
      { x: colX(map, best.a), y: ya + 0.7, z: rowZ(map, best.j), side: 1, name: 'Island, port side' },
      { x: colX(map, best.b), y: yb + 0.7, z: rowZ(map, best.j), side: -1, name: 'Island, starboard side' },
    ];
  }

  // Everybody else: a pair on the bridge and a pair aft. For each, the row of
  // her where the structure standing on her deck is tallest and broadest,
  // and the two edges of it there.
  // The top of her bridge and the top of her after superstructure -- the
  // after fire-control and radar platform -- each the highest level in its
  // half of her that has room on it for a lamp either side. A funnel's rim
  // or a mast top is high and has no room; the platform under the radar does.
  const pick = (z0, z1, minW, strict = 2, maxL = Infinity) => {
    let best = null;
    for (const j of rows(z0, z1)) {
      const cols = [];
      for (let i = 0; i < map.w; i++) {
        const y = at(map, i, j);
        if (Number.isFinite(y) && y > deck + 1.8) cols.push([i, y, map.dark ? map.dark[j * map.w + i] : 0]);
      }
      if (cols.length < 3) continue;
      const levels = [...new Set(cols.map(([, y]) => Math.round(y * 2) / 2))].sort((a, b) => b - a);
      for (const L of levels) {
        if (L > maxL) continue;
        // Only solid plating at that level: every pixel round it at it too.
        // A stay or an aerial is a line a pixel wide across the picture, and
        // a lamp stood on one floats in the air.
        const solid = (i) => {
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            if (!(at(map, i + di, j + dj) >= L - 0.6)) return false;
          }
          return true;
        };
        const on = cols.filter(([i, y]) => y >= L - 0.45 && solid(i));
        if (on.length < 2) continue;
        // Nothing black up there: that level is the top of a funnel.
        if (strict > 0 && on.some((c) => c[2])) continue;
        // The two outermost pixels of that level: its two edges.
        let lo = on[0], hi = on[0];
        for (const c of on) { if (c[0] < lo[0]) lo = c; if (c[0] > hi[0]) hi = c; }
        const width = Math.abs(colX(map, hi[0]) - colX(map, lo[0]));
        if (width < minW) continue;
        // And one piece of plating from edge to edge, more or less, not two
        // things far apart at the same height.
        if (strict > 1 && on.length < (hi[0] - lo[0] + 1) * 0.6) continue;
        // A platform, not a rim or a yard: solid across its middle -- a
        // funnel's top is a ring with the inside of the funnel in it -- and
        // with deck under each edge for a metre or so fore and aft, which a
        // yardarm or the lip of a funnel has not.
        const mid = Math.round((lo[0] + hi[0]) / 2);
        if (!(at(map, mid, j) >= L - 1.5)) continue;
        const rowM = (2 * map.halfZ) / map.h;
        const reach = Math.max(2, Math.round(0.9 / rowM));
        const firm = (col) => {
          let n = 0, ok = 0;
          for (let d = -reach; d <= reach; d++) {
            n++;
            if (at(map, col, j + d) >= L - 0.6) ok++;
          }
          return ok / n >= 0.75;
        };
        const inA = lo[0] + 1, inB = hi[0] - 1;
        if (strict > 0 && (!firm(inA) || !firm(inB))) continue;
        const score = L + 0.05 * width;
        if (!best || score > best.score) best = { j, lo, hi, L, score };
        break;
      }
    }
    return best;
  };
  const B = cls.hull.beam;
  // As strictly as her model allows: a clean platform if she has one, and
  // the best seat on solid plating there is if she has not.
  const best = (z0, z1, w, maxL = Infinity) => pick(z0, z1, w, 2, maxL) || pick(z0, z1, w, 1, maxL)
    || pick(z0, z1, w, 0, maxL) || pick(z0, z1, w * 0.6, 0, maxL);
  const fwd = best(0.0, 0.42, Math.max(2.4, B * 0.28));
  // Aft, no higher than the bridge: what stands higher than her bridge aft is
  // her mainmast and its yards, and a lamp up there is not on a platform.
  const aft = fwd && (best(-0.44, -0.04, Math.max(2.0, B * 0.2), fwd.L - 1)
    || best(-0.44, -0.04, Math.max(2.0, B * 0.2)));
  if (!fwd || !aft) return null;
  const out = [];
  // Stood on the plating at each edge, a little in from it, with the foot of
  // its pedestal on that plating: the drum sits 0.7 m above what it stands on.
  const seat = (b, c) => {
    const s = c === b.lo ? 1 : -1;   // column 0 is her port side
    const i = c[0] + s;              // one pixel in from the edge
    // On the level it was found at, both of the pair: they stand on the
    // same platform.
    return { x: colX(map, i), y: b.L + 0.7 };
  };
  for (const [b, where] of [[fwd, 'Bridge'], [aft, 'After superstructure']]) {
    const z = rowZ(map, b.j);
    const p = seat(b, b.lo);
    const q = seat(b, b.hi);
    out.push({ x: p.x, y: p.y, z, side: 1, name: `${where}, port` });
    out.push({ x: q.x, y: q.y, z, side: -1, name: `${where}, starboard` });
  }
  return out.map((l) => ground(map, l));
}

/**
 * Stood on whatever is under it. Whatever the search above settled on, the
 * foot of a lamp's pedestal goes on the plating at the place it stands --
 * the highest of the few pixels round it -- so no lamp is ever in the air.
 */
function ground(map, l) {
  const i = Math.round((((-l.x / map.halfX) + 1) / 2) * map.w - 0.5);
  const j = Math.round((((l.z / map.halfZ) + 1) / 2) * map.h - 0.5);
  let top = -Infinity;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const y = at(map, i + di, j + dj);
    if (Number.isFinite(y)) top = Math.max(top, y);
  }
  return Number.isFinite(top) ? { ...l, y: top + 0.7 } : l;
}

/**
 * Her plan as a picture, for the searchlight panel: lit by height, the way an
 * overhead photograph of a ship at sea reads -- dark deck, pale tops.
 */
export function planImage(plan, width = 160) {
  const m = plan.map;
  if (!m || typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = m.w;
  cv.height = m.h;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(m.w, m.h);
  let lo = Infinity, hi = -Infinity;
  for (const y of m.heights) if (Number.isFinite(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
  for (let j = 0; j < m.h; j++) {
    for (let i = 0; i < m.w; i++) {
      // Top of the picture is her bow: row j counts up from the stern.
      const o = ((m.h - 1 - j) * m.w + i) * 4;
      const y = at(m, i, j);
      if (!Number.isFinite(y)) { img.data[o + 3] = 0; continue; }
      const t = (y - lo) / Math.max(1, hi - lo);
      // A little relief off the slope, so the edges of things read.
      const dx = (at(m, i + 1, j) || y) - (at(m, i - 1, j) || y);
      const dz = (at(m, i, j + 1) || y) - (at(m, i, j - 1) || y);
      const shade = Math.max(-0.25, Math.min(0.25, (dx - dz) * 0.06));
      const v = Math.max(0, Math.min(1, 0.22 + 0.62 * Math.sqrt(t) + shade));
      img.data[o] = 70 + 150 * v;
      img.data[o + 1] = 82 + 150 * v;
      img.data[o + 2] = 92 + 140 * v;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  void width;
  return cv;
}

// ---------------------------------------------------------------- beams --

const BEAM_VERT = /* glsl */`
varying float vAlong;
varying vec3 vN;
varying vec3 vV;
varying float vFogK;
uniform float uFogDensity;
void main() {
  // The cone is laid along +z, from the lamp (0) to its far end (1).
  vAlong = clamp(position.z / ${BEAM_LENGTH.toFixed(1)}, 0.0, 1.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  float fd = uFogDensity * length(mv.xyz);
  vFogK = exp(-fd * fd);
  gl_Position = projectionMatrix * mv;
}
`;
const BEAM_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uStrength;
varying float vAlong;
varying vec3 vN;
varying vec3 vV;
varying float vFogK;
void main() {
  // Brightest down the middle of the cone as the eye sees it, soft at its
  // edges, and dying away along its length -- quickly at first, then slowly:
  // the light scattered back out of the air falls off as the beam spreads.
  float core = pow(abs(dot(normalize(vN), normalize(vV))), 1.3);
  float fall = pow(1.0 - vAlong, 1.6) * (0.35 + 0.65 * exp(-vAlong * 5.0));
  float a = core * fall * uStrength * mix(0.35, 1.0, vFogK);
  gl_FragColor = vec4(uColor * a, a);
}
`;

let BEAM_GEO = null;
function beamGeometry() {
  if (BEAM_GEO) return BEAM_GEO;
  const far = Math.tan(BEAM_HALF) * BEAM_LENGTH;
  // A cylinder's top is its +y end, and turned about x by a right angle +y
  // goes to +z -- so the wide end is the top, and goes out to the far end of
  // the beam, with the narrow one at the lamp.
  const g = new THREE.CylinderGeometry(far, 0.45, BEAM_LENGTH, 20, 24, true);
  // Along +z, starting at the lamp.
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, BEAM_LENGTH / 2);
  BEAM_GEO = g;
  return g;
}

/**
 * The lamps on one ship's model: the drum on its pedestal, trained and
 * elevated, and the beam out of it when it is lit.
 */
export class ShipLamps {
  constructor(view, plan, haze = 0.3) {
    this.view = view;
    this.plan = plan;
    this.lamps = plan.lamps.map((p, k) => this.build(p, k, haze));
  }

  build(p, k, haze) {
    const base = new THREE.Group();
    base.position.set(p.x, p.y, p.z);
    base.userData.lamp = k;
    const yaw = new THREE.Group();
    base.add(yaw);
    const tilt = new THREE.Group();
    yaw.add(tilt);
    // A pedestal and a drum: a metre and a half across, black, with the
    // glass on the front of it.
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.6, metalness: 0.4 });
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.7, 10), dark);
    ped.position.y = -0.35;
    base.add(ped);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.0, 16), dark);
    drum.rotation.x = Math.PI / 2;
    drum.position.y = 0.35;
    tilt.add(drum);
    const glassMat = new THREE.MeshBasicMaterial({ color: 0x3a4148 });
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.56, 18), glassMat);
    glass.position.set(0, 0.35, 0.51);
    tilt.add(glass);
    const beam = new THREE.Mesh(beamGeometry(), new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
      uniforms: {
        uColor: { value: LAMP_COLOR.clone() },
        uStrength: { value: 0.8 + 1.3 * haze },
        uFogDensity: { value: 0 },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    beam.position.set(0, 0.35, 0.55);
    beam.visible = false;
    beam.frustumCulled = false;
    beam.renderOrder = 6;
    tilt.add(beam);
    this.view.group.add(base);
    return { p, base, yaw, tilt, glass, glassMat, beam, on: false, yawNow: 0, pitchNow: -0.04 };
  }

  /**
   * Where each is trained and whether it is lit. `states` is [{ on, yaw,
   * pitch }] by index, or null for all of them dark.
   */
  set(states, dt = 0, fog = null) {
    this.lamps.forEach((l, k) => {
      const s = states && states[k];
      const on = !!(s && s.on);
      if (s) {
        // Trained round by hand, not snapped: eased toward where it is laid.
        const kk = dt > 0 ? 1 - Math.exp(-dt / 0.12) : 1;
        const d = Math.atan2(Math.sin(s.yaw - l.yawNow), Math.cos(s.yaw - l.yawNow));
        l.yawNow += d * kk;
        l.pitchNow += (s.pitch - l.pitchNow) * kk;
      }
      l.yaw.rotation.y = l.yawNow;
      // Up is a negative rotation about her x when +z is the way it faces.
      l.tilt.rotation.x = -Math.max(LAMP_PITCH.min, Math.min(LAMP_PITCH.max, l.pitchNow));
      if (on !== l.on) {
        l.on = on;
        l.beam.visible = on;
        l.glassMat.color.set(on ? 0xfff6e4 : 0x3a4148);
      }
      if (fog) l.beam.material.uniforms.uFogDensity.value = fog.density || 0;
    });
  }

  /** The lamp's glass and the way it faces, in the world. */
  eye(k, out = { pos: new THREE.Vector3(), dir: new THREE.Vector3() }) {
    const l = this.lamps[k];
    if (!l) return null;
    // Up through her to the world and down through the lamp, so a lamp
    // trained this frame is read where it is trained.
    l.tilt.updateWorldMatrix(true, false);
    out.pos.set(0, 0.35, 0.7).applyMatrix4(l.tilt.matrixWorld);
    out.dir.set(0, 0, 1).transformDirection(l.tilt.matrixWorld);
    return out;
  }

  dispose() {
    for (const l of this.lamps) l.base.removeFromParent();
  }
}

/**
 * The few real spotlights, handed each frame to the lit lamps nearest the eye,
 * and the same lamps described to the sea so it draws the pool each throws.
 * A fixed number of lights, always in the scene: adding and taking away
 * lights makes every material in the scene recompile.
 */
export class LampLights {
  constructor(scene, ocean) {
    this.ocean = ocean;
    this.spots = [];
    for (let i = 0; i < SPOTS; i++) {
      const s = new THREE.SpotLight(LAMP_COLOR, 0, BEAM_LENGTH * 1.2, BEAM_HALF * 1.6, 0.45, 0);
      s.castShadow = false;
      scene.add(s);
      scene.add(s.target);
      this.spots.push(s);
    }
    this.eye = { pos: new THREE.Vector3(), dir: new THREE.Vector3() };
  }

  /** `lit` is [{ lamps: ShipLamps, k }] for every lamp lit this frame. */
  update(lit, camera) {
    const cam = camera.position;
    const list = [];
    for (const it of lit) {
      const e = it.lamps.eye(it.k);
      if (!e) continue;
      list.push({ pos: e.pos.clone(), dir: e.dir.clone(), d: e.pos.distanceToSquared(cam) });
    }
    list.sort((a, b) => a.d - b.d);
    const u = this.ocean?.material?.uniforms;
    for (let i = 0; i < SPOTS; i++) {
      const s = this.spots[i];
      const l = list[i];
      if (!l) {
        s.intensity = 0;
        if (u?.uLampPos) u.uLampPos.value[i].w = 0;
        continue;
      }
      s.intensity = 40;
      s.position.copy(l.pos);
      s.target.position.copy(l.pos).addScaledVector(l.dir, 400);
      s.target.updateMatrixWorld();
      if (u?.uLampPos) {
        u.uLampPos.value[i].set(l.pos.x, l.pos.y, l.pos.z, 1);
        u.uLampDir.value[i].set(l.dir.x, l.dir.y, l.dir.z, Math.cos(BEAM_HALF * 1.5));
      }
    }
  }
}
