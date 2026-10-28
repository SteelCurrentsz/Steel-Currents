// The town and the sea walls, as they are drawn -- and as they come down.
//
// Everything here is raised from the plan the simulation keeps (see
// shared/works.js): the same streets, the same buildings on the same
// footprints, the same walls along the same shore. What this adds is what
// they look like. Period facades -- brick with sash windows, stucco,
// limestone, Art Deco piers and spandrels, painted clapboard -- shopfronts and
// awnings, gabled and hipped and flat roofs, chimneys and water tanks, a
// church spire, a town hall with a portico and a clock tower, a cinema with
// its marquee, kerbs and pavements, street lamps, trees, benches, telephone
// kiosks, pillar boxes and motor cars at the kerb.
//
// And what is done to them. A building goes through the stages the
// simulation puts it through -- holed, gutted, falling, a heap of rubble --
// and each change is drawn as it happens: the floors pancaking down in a
// cloud of brick dust, pieces of it thrown out across the street and
// tumbling to rest on whatever they land on, fire in what is left. A lamp
// post near a burst goes over, a tree falls, a car is thrown on its side and
// burns. A sea wall chips, loses its parapet, and when a section is breached
// it goes down in a slide of broken concrete into the sea.
//
// Drawn in chunks of the town, one mesh per material each, so the whole of it
// is a few dozen draw calls and a building coming down rebuilds only the
// chunk it stands in.

import * as THREE from '../../../vendor/three.module.js';
import {
  cityPlan, ruinOf, stageOf, STAGE, standingHeight, SURF, SURF_RISE, SURF_CELL, cityToWorld,
  wallSections, sectionSpan, WALL_WIDTH, PARAPET, worksFloor,
} from '../../../shared/works.js';
import { groundHeight, rawGround } from '../../../shared/world.js';

// ---------------------------------------------------------------------------
// Textures, painted once
// ---------------------------------------------------------------------------

const TEX = {};
const SIZE = 128;

function canvasTexture(key, paint, w = SIZE, h = SIZE) {
  if (TEX[key]) return TEX[key];
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  paint(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  TEX[key] = t;
  return t;
}

// A small fixed-seed generator, so the textures come out the same each load.
function rngOf(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function grain(g, w, h, n, lo, hi, seed = 1) {
  const r = rngOf(seed);
  for (let i = 0; i < n; i++) {
    const v = Math.floor(lo + r() * (hi - lo));
    g.fillStyle = `rgba(${v},${v},${v},${0.06 + r() * 0.1})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

// One bay of one floor of each kind of facade, in light neutral tones: the
// wall's own colour is laid over it by the vertex colours, so one painting
// serves every brick building in the town whatever its brick.
function sash(g, x, y, w, h, frame = '#eeeae0') {
  g.fillStyle = frame;
  g.fillRect(x - 3, y - 3, w + 6, h + 6);
  g.fillStyle = '#1d2630';
  g.fillRect(x, y, w, h);
  // A reflection of the sky in the top of the glass.
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, 'rgba(150,170,190,0.35)');
  gr.addColorStop(1, 'rgba(20,30,40,0)');
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
  g.fillStyle = frame;
  g.fillRect(x, y + h / 2 - 1.5, w, 3);
  g.fillRect(x + w / 2 - 1.5, y, 3, h);
}

const FACADE = {
  brick: (g, w, h) => {
    g.fillStyle = '#d8d0c8';
    g.fillRect(0, 0, w, h);
    const r = rngOf(7);
    for (let y = 0; y < h; y += 6) {
      for (let x = ((y / 6) % 2) * 7 - 7; x < w; x += 14) {
        const v = 200 + Math.floor(r() * 40);
        g.fillStyle = `rgb(${v},${v - 8},${v - 14})`;
        g.fillRect(x + 1, y + 1, 12, 4);
      }
    }
    sash(g, w * 0.28, h * 0.22, w * 0.44, h * 0.52);
    g.fillStyle = '#ece6da';
    g.fillRect(w * 0.24, h * 0.17, w * 0.52, 5);
    g.fillRect(w * 0.24, h * 0.76, w * 0.52, 4);
  },
  stucco: (g, w, h) => {
    g.fillStyle = '#f1ece2';
    g.fillRect(0, 0, w, h);
    grain(g, w, h, 900, 180, 255, 3);
    sash(g, w * 0.3, h * 0.2, w * 0.4, h * 0.55, '#f8f5ee');
    // Shutters.
    g.fillStyle = '#9aa69a';
    g.fillRect(w * 0.16, h * 0.18, w * 0.11, h * 0.59);
    g.fillRect(w * 0.73, h * 0.18, w * 0.11, h * 0.59);
  },
  stone: (g, w, h) => {
    g.fillStyle = '#ece6d8';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,110,95,0.35)';
    g.lineWidth = 1;
    for (let y = 0; y < h; y += 16) {
      g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke();
      for (let x = ((y / 16) % 2) * 20; x < w; x += 40) {
        g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + 16); g.stroke();
      }
    }
    grain(g, w, h, 600, 150, 230, 5);
    sash(g, w * 0.3, h * 0.2, w * 0.4, h * 0.6, '#f4efe4');
    // A pediment over it.
    g.fillStyle = '#f6f2e8';
    g.beginPath();
    g.moveTo(w * 0.24, h * 0.17); g.lineTo(w * 0.5, h * 0.07); g.lineTo(w * 0.76, h * 0.17);
    g.closePath(); g.fill();
  },
  deco: (g, w, h) => {
    g.fillStyle = '#f2ede2';
    g.fillRect(0, 0, w, h);
    grain(g, w, h, 500, 190, 255, 9);
    // Piers running up the whole face, and a spandrel between the windows.
    g.fillStyle = '#fbf8f0';
    g.fillRect(0, 0, w * 0.14, h);
    g.fillRect(w * 0.86, 0, w * 0.14, h);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(w * 0.14, 0, 2, h);
    g.fillRect(w * 0.86 - 2, 0, 2, h);
    g.fillStyle = '#1b232b';
    g.fillRect(w * 0.2, h * 0.08, w * 0.6, h * 0.62);
    g.fillStyle = 'rgba(160,180,200,0.25)';
    g.fillRect(w * 0.2, h * 0.08, w * 0.6, h * 0.2);
    g.fillStyle = '#d8d0c0';
    for (let k = 1; k < 3; k++) g.fillRect(w * 0.2 + (w * 0.6 * k) / 3 - 1, h * 0.08, 2, h * 0.62);
    g.fillStyle = '#c9c1ae';
    g.fillRect(w * 0.2, h * 0.74, w * 0.6, h * 0.2);
    g.fillStyle = '#b8af99';
    for (let k = 0; k < 4; k++) g.fillRect(w * 0.24 + k * w * 0.14, h * 0.78, w * 0.08, h * 0.12);
  },
  wood: (g, w, h) => {
    g.fillStyle = '#f2efe8';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(80,70,60,0.28)';
    for (let y = 3; y < h; y += 7) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
    sash(g, w * 0.3, h * 0.24, w * 0.4, h * 0.5, '#ffffff');
    g.fillStyle = '#f8f8f4';
    g.fillRect(0, 0, 5, h);
    g.fillRect(w - 5, 0, 5, h);
  },
  shop: (g, w, h) => {
    g.fillStyle = '#e8e2d6';
    g.fillRect(0, 0, w, h);
    // The fascia, the glass, a stallriser under it and a door to one side.
    g.fillStyle = '#3b3a36';
    g.fillRect(0, 0, w, h * 0.2);
    g.fillStyle = '#e9d9a8';
    g.fillRect(w * 0.12, h * 0.06, w * 0.76, h * 0.08);
    g.fillStyle = '#26323c';
    g.fillRect(w * 0.06, h * 0.26, w * 0.6, h * 0.5);
    g.fillStyle = 'rgba(170,190,205,0.3)';
    g.fillRect(w * 0.06, h * 0.26, w * 0.6, h * 0.16);
    g.fillStyle = '#5a4030';
    g.fillRect(w * 0.06, h * 0.76, w * 0.6, h * 0.2);
    g.fillStyle = '#4a3428';
    g.fillRect(w * 0.72, h * 0.3, w * 0.22, h * 0.7);
    g.fillStyle = '#26323c';
    g.fillRect(w * 0.76, h * 0.34, w * 0.14, h * 0.26);
  },
  warehouse: (g, w, h) => {
    FACADE.brick(g, w, h);
    g.fillStyle = '#d8d0c8';
    g.fillRect(w * 0.2, h * 0.15, w * 0.6, h * 0.65);
    g.fillStyle = '#4a3b30';
    g.fillRect(w * 0.3, h * 0.35, w * 0.4, h * 0.65);
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    for (let x = w * 0.3; x < w * 0.7; x += 8) { g.beginPath(); g.moveTo(x, h * 0.35); g.lineTo(x, h); g.stroke(); }
    sash(g, w * 0.36, h * 0.12, w * 0.28, h * 0.14);
  },
};

const GROUND = {
  asphalt: (g, w, h) => {
    g.fillStyle = '#7a7a76';
    g.fillRect(0, 0, w, h);
    grain(g, w, h, 2400, 40, 200, 11);
  },
  slab: (g, w, h) => {
    g.fillStyle = '#c9c4b8';
    g.fillRect(0, 0, w, h);
    grain(g, w, h, 900, 120, 230, 13);
    g.strokeStyle = 'rgba(70,65,55,0.45)';
    for (let k = 0; k <= 2; k++) {
      g.beginPath(); g.moveTo(0, k * h / 2 + 0.5); g.lineTo(w, k * h / 2 + 0.5); g.stroke();
      g.beginPath(); g.moveTo(k * w / 2 + 0.5, 0); g.lineTo(k * w / 2 + 0.5, h); g.stroke();
    }
  },
  grass: (g, w, h) => {
    g.fillStyle = '#6c8a4c';
    g.fillRect(0, 0, w, h);
    const r = rngOf(17);
    for (let i = 0; i < 2600; i++) {
      const v = r();
      g.fillStyle = `rgba(${60 + v * 70},${100 + v * 70},${40 + v * 40},0.5)`;
      g.fillRect(r() * w, r() * h, 1, 2 + r() * 2);
    }
  },
  setts: (g, w, h) => {
    g.fillStyle = '#8e8a82';
    g.fillRect(0, 0, w, h);
    const r = rngOf(19);
    for (let y = 0; y < h; y += 8) {
      for (let x = ((y / 8) % 2) * 5; x < w; x += 10) {
        const v = 150 + Math.floor(r() * 60);
        g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
        g.fillRect(x + 1, y + 1, 8, 6);
      }
    }
  },
  gravel: (g, w, h) => {
    g.fillStyle = '#a49b88';
    g.fillRect(0, 0, w, h);
    grain(g, w, h, 3000, 70, 240, 23);
  },
  concrete: (g, w, h) => {
    g.fillStyle = '#c6c2b8';
    g.fillRect(0, 0, w, h);
    grain(g, w, h, 1800, 110, 230, 29);
    // The marks of the shuttering it was poured in.
    g.strokeStyle = 'rgba(80,75,65,0.22)';
    for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
    g.beginPath(); g.moveTo(0.5, 0); g.lineTo(0.5, h); g.stroke();
  },
  roof: (g, w, h) => {
    g.fillStyle = '#e4e0da';
    g.fillRect(0, 0, w, h);
    const r = rngOf(31);
    for (let y = 0; y < h; y += 10) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, y, w, 2);
      for (let x = ((y / 10) % 2) * 6; x < w; x += 12) {
        g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.12})`;
        g.fillRect(x, y + 2, 1.5, 8);
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

/** The wall colours a building's `wall` index picks from, and the facade each is painted with. */
const WALLS = [
  { k: 'brick', c: 0x9a5640 }, { k: 'brick', c: 0x86493a }, { k: 'brick', c: 0xa86a4a }, { k: 'brick', c: 0x7c5446 },
  { k: 'stucco', c: 0xe2d6b8 }, { k: 'stucco', c: 0xd9c9a4 }, { k: 'stucco', c: 0xe9e1cc },
  { k: 'stone', c: 0xd6ccb2 }, { k: 'stone', c: 0xc2b9a2 },
  { k: 'deco', c: 0xeee4cc }, { k: 'deco', c: 0xdcd2ba }, { k: 'deco', c: 0xd0c6b0 },
  { k: 'wood', c: 0xf0ece0 }, { k: 'wood', c: 0xa8bba8 }, { k: 'wood', c: 0xd2bd92 },
];
/** And the roofs: terracotta, dark slate, grey slate, weathered copper, tar. */
const ROOFS = [0xa0503a, 0x464a52, 0x62666c, 0x6b9a84, 0x45443f];
const CHAR = [0.08, 0.07, 0.065];

const col = (hex, k = 1) => [((hex >> 16) & 255) / 255 * k, ((hex >> 8) & 255) / 255 * k, (hex & 255) / 255 * k];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------------------------------------------------------------------------
// Geometry, welded per material
// ---------------------------------------------------------------------------

class Buf {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; }

  tri(a, b, c, ua, ub, uc, ca, cb = ca, cc = ca) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    this.p.push(...a, ...b, ...c);
    this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.u.push(...(ua || [0, 0]), ...(ub || [0, 0]), ...(uc || [0, 0]));
    this.c.push(...ca, ...cb, ...cc);
  }

  /** A quad a-b-c-d, wound counter-clockwise as seen from the side it faces. */
  quad(a, b, c, d, uv = null, ca = [1, 1, 1], cb = ca, cc = cb, cd = cc) {
    const q = uv || [[0, 0], [1, 0], [1, 1], [0, 1]];
    this.tri(a, b, c, q[0], q[1], q[2], ca, cb, cc);
    this.tri(a, c, d, q[0], q[2], q[3], ca, cc, cd);
  }

  get empty() { return !this.p.length; }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

class Bufs {
  constructor() { this.m = new Map(); }
  get(k) { let b = this.m.get(k); if (!b) { b = new Buf(); this.m.set(k, b); } return b; }
  /** Into a group, one mesh per material. */
  meshes(mats) {
    const g = new THREE.Group();
    for (const [k, b] of this.m) {
      if (b.empty) continue;
      const mesh = new THREE.Mesh(b.geometry(), mats[k] || mats.plain);
      mesh.matrixAutoUpdate = false;
      g.add(mesh);
    }
    return g;
  }
}

/** A box, axis-aligned in a frame given by `F(a, y, c)`, into a buffer: sides and top, no bottom. */
function boxInto(buf, F, a0, a1, y0, y1, c0, c1, color, uvScale = 0) {
  const P = (a, y, c) => F(a, y, c);
  const uv = (s, t) => (uvScale ? [s * uvScale, t * uvScale] : [0, 0]);
  const w = a1 - a0, d = c1 - c0, h = y1 - y0;
  const Q = (p0, p1, p2, p3, len) => buf.quad(p0, p1, p2, p3, [uv(0, 0), uv(len, 0), uv(len, h), uv(0, h)], color);
  Q(P(a0, y0, c1), P(a1, y0, c1), P(a1, y1, c1), P(a0, y1, c1), w);
  Q(P(a1, y0, c0), P(a0, y0, c0), P(a0, y1, c0), P(a1, y1, c0), w);
  Q(P(a1, y0, c1), P(a1, y0, c0), P(a1, y1, c0), P(a1, y1, c1), d);
  Q(P(a0, y0, c0), P(a0, y0, c1), P(a0, y1, c1), P(a0, y1, c0), d);
  buf.quad(P(a0, y1, c1), P(a1, y1, c1), P(a1, y1, c0), P(a0, y1, c0), null, color);
}

/** An n-sided column or cone, from radius r0 at y0 to r1 at y1, round (a, c) in the frame. */
function cylInto(buf, F, a, c, r0, r1, y0, y1, color, n = 8, cap = true) {
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * Math.PI * 2;
    const t1 = ((i + 1) / n) * Math.PI * 2;
    const p0 = F(a + Math.cos(t0) * r0, y0, c + Math.sin(t0) * r0);
    const p1 = F(a + Math.cos(t1) * r0, y0, c + Math.sin(t1) * r0);
    const p2 = F(a + Math.cos(t1) * r1, y1, c + Math.sin(t1) * r1);
    const p3 = F(a + Math.cos(t0) * r1, y1, c + Math.sin(t0) * r1);
    if (r1 > 1e-4) buf.quad(p1, p0, p3, p2, null, color);
    else buf.tri(p1, p0, p3, null, null, null, color);
    if (cap && r1 > 1e-4) buf.tri(F(a, y1, c), p2, p3, null, null, null, color);
  }
}

/** A lump of something: a squashed icosahedron, for a tree's crown or a heap. */
function blobInto(buf, F, a, y, c, rx, ry, rz, color, seed = 1) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  // The geometry is unwelded -- each corner of each face its own vertex -- so
  // the roughness is keyed on where a corner is, not which vertex it is, or
  // every face would come apart from its neighbours.
  const jit = (x, yy, z) => {
    const h = Math.sin(Math.round(x * 97) * 12.9898 + Math.round(yy * 97) * 78.233 + Math.round(z * 97) * 37.719 + seed) * 43758.5453;
    return 0.85 + (h - Math.floor(h)) * 0.3;
  };
  const V = (i) => {
    const k = jit(p.getX(i), p.getY(i), p.getZ(i));
    return F(a + p.getX(i) * rx * k, y + p.getY(i) * ry * k, c + p.getZ(i) * rz * k);
  };
  for (let i = 0; i < p.count; i += 3) {
    const shade = 0.82 + 0.18 * ((p.getY(i) + 1) / 2);
    buf.tri(V(i), V(i + 1), V(i + 2), null, null, null, color.map((v) => v * shade));
  }
  g.dispose();
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

/** A building's own frame: a along its width, c out of its front, y up from the town's level. */
function frameOf(b, L) {
  const s = Math.sin(b.rot);
  const k = Math.cos(b.rot);
  return (a, y, c) => [b.x + k * a + s * c, L + y, b.z - s * a + k * c];
}

/** Bay width and floor height for a building's facade. */
function bayOf(b) {
  const bay = b.kind === 'warehouse' ? 4.6 : b.kind === 'house' || b.kind === 'terrace' ? 2.9
    : b.kind === 'hall' || b.kind === 'church' ? 4 : 3.2;
  return { bay, fh: Math.max(2.6, b.h / Math.max(1, b.floors)) };
}

/**
 * One face of a building: from corner (a0, c0) to (a1, c1) in its frame,
 * facing outward, in bays -- each bay its own column, so a gutted building's
 * walls can stand to a ragged edge rather than a ruled line. `tops[k]` is how
 * high bay k stands.
 */
function faceInto(bufs, F, key, tint, a0, c0, a1, c1, y0, tops, fh, shopBand = 0, inner = null) {
  const n = tops.length;
  for (let k = 0; k < n; k++) {
    const f0 = k / n;
    const f1 = (k + 1) / n;
    const pa = a0 + (a1 - a0) * f0, pc = c0 + (c1 - c0) * f0;
    const qa = a0 + (a1 - a0) * f1, qc = c0 + (c1 - c0) * f1;
    const top = tops[k];
    if (top <= y0 + 0.05) continue;
    let y = y0;
    if (shopBand > 0 && top > y0 + shopBand) {
      bufs.get('shop').quad(F(pa, y, pc), F(qa, y, qc), F(qa, y + shopBand, qc), F(pa, y + shopBand, pc),
        [[0, 0], [1, 0], [1, 1], [0, 1]].map(([s, t]) => [s, 1 - t]), tint.map((v) => Math.min(1, v * 1.15)));
      y += shopBand;
    }
    const v0 = (y - y0) / fh;
    const v1 = (top - y0) / fh;
    // Painted rows run top-down in the canvas, so v is flipped.
    bufs.get(key).quad(F(pa, y, pc), F(qa, y, qc), F(qa, top, qc), F(pa, top, pc),
      [[0, -v0], [1, -v0], [1, -v1], [0, -v1]], tint);
    // The inside of the same wall, burned black, where the roof has gone.
    if (inner) {
      bufs.get('plain').quad(F(qa + inner[0], y0, qc + inner[1]), F(pa + inner[0], y0, pc + inner[1]),
        F(pa + inner[0], top, pc + inner[1]), F(qa + inner[0], top, qc + inner[1]), null, CHAR);
      // And the top of the wall, where it was broken off.
      bufs.get('plain').quad(F(pa, top, pc), F(qa, top, qc), F(qa + inner[0], top, qc + inner[1]),
        F(pa + inner[0], top, pc + inner[1]), null, tint.map((v) => v * 0.55));
    }
  }
}

/** A heap of what a building was, over its footprint and spilling past it. */
function heapInto(buf, F, w, d, H, tint, seed) {
  const r = rngOf(seed);
  const N = 7;
  const M = 7;
  const spill = 2.5 + H * 0.4;
  const pts = [];
  for (let j = 0; j <= M; j++) {
    const row = [];
    for (let i = 0; i <= N; i++) {
      const fa = i / N * 2 - 1;
      const fc = j / M * 2 - 1;
      const edge = Math.max(Math.abs(fa), Math.abs(fc));
      const a = fa * (w / 2 + spill);
      const c = fc * (d / 2 + spill);
      const h = edge >= 0.999 ? -0.15 : H * Math.pow(1 - edge, 0.7) * (0.65 + r() * 0.7);
      row.push([a + (edge < 0.999 ? (r() - 0.5) * 1.5 : 0), h, c + (edge < 0.999 ? (r() - 0.5) * 1.5 : 0)]);
    }
    pts.push(row);
  }
  const dust = [0.58, 0.55, 0.5];
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      const p = [pts[j][i], pts[j][i + 1], pts[j + 1][i + 1], pts[j + 1][i]].map(([a, y, c]) => F(a, y, c));
      const k = r();
      const cc = mixc(tint, dust, 0.35 + k * 0.4).map((v) => v * (0.7 + r() * 0.3));
      buf.quad(p[0], p[3], p[2], p[1], null, cc);
    }
  }
}

/**
 * Everything one building is drawn with, as it stands now, into `bufs`.
 */
function buildingInto(bufs, b, L, ruin) {
  const st = stageOf(ruin?.d || 0, !!ruin?.c);
  if (st === STAGE.cleared) return;
  const F = frameOf(b, L);
  const r = rngOf(b.seed);
  const pal = WALLS[b.wall] || WALLS[0];
  const d = ruin?.d || 0;
  // Smoke-blackened as it is knocked about, and black once it has burned.
  const scorch = Math.min(0.7, d * 0.7) + (ruin?.f ? 0.1 : 0);
  const tint = mixc(col(pal.c), CHAR, scorch);
  const key = b.kind === 'warehouse' ? 'warehouse' : pal.k;
  const { bay, fh } = bayOf(b);
  const hw = b.w / 2;
  const hd = b.d / 2;

  if (st === STAGE.rubble) {
    heapInto(bufs.get('plain'), F, b.w, b.d, standingHeight(b, ruin), tint, b.seed);
    // A corner or two of it still standing out of the heap.
    for (const [sa, sc] of [[-1, -1], [1, 1]]) {
      if (r() < 0.4) continue;
      const h = Math.min(b.h, 3 + r() * Math.min(9, b.h * 0.4));
      const tops = [h, h * (0.4 + r() * 0.4)];
      const a0 = sa * hw;
      const c0 = sc * hd;
      faceInto(bufs, F, key, tint, a0, c0, a0 - sa * Math.min(b.w * 0.35, 6), c0, 0, tops, fh, 0, [0, -sc * 0.35]);
    }
    return;
  }

  // How high each bay of each face stands.
  const standing = st >= STAGE.gutted;
  const flat = b.roof === 'flat';
  const wallTop = b.h + (flat && !standing ? 0.9 : 0);
  const topsFor = (len) => {
    const n = Math.max(1, Math.round(len / bay));
    const out = [];
    for (let k = 0; k < n; k++) {
      if (st === STAGE.falling) out.push(b.h * (0.18 + r() * 0.42));
      else if (st === STAGE.gutted) out.push(b.h - r() * fh * 1.4);
      else out.push(wallTop);
    }
    return out;
  };
  const shop = b.extra?.shops && st < STAGE.falling ? Math.min(4.2, fh * 1.25) : 0;
  const inner = standing ? 0.35 : 0;
  // Front, back, right, left: each wound so it faces out.
  faceInto(bufs, F, key, tint, -hw, hd, hw, hd, 0, topsFor(b.w), fh, shop, inner ? [0, -inner] : null);
  faceInto(bufs, F, key, tint, hw, -hd, -hw, -hd, 0, topsFor(b.w), fh, 0, inner ? [0, inner] : null);
  faceInto(bufs, F, key, tint, hw, hd, hw, -hd, 0, topsFor(b.d), fh, 0, inner ? [-inner, 0] : null);
  faceInto(bufs, F, key, tint, -hw, -hd, -hw, hd, 0, topsFor(b.d), fh, 0, inner ? [inner, 0] : null);

  // Holes the shells have made in it: black, and more of them the worse it is.
  if (st >= STAGE.hit) {
    const n = Math.round(d * 4 + (b.w + b.d) * d * 0.12);
    for (let k = 0; k < n; k++) {
      const side = Math.floor(r() * 4);
      const s = 1.2 + r() * Math.min(4.5, b.h * 0.3);
      const y = Math.min(b.h - s - 0.2, 0.5 + r() * b.h * 0.9);
      if (y < 0.3) continue;
      const len = side < 2 ? b.w : b.d;
      const t = (r() - 0.5) * (len - s - 1);
      const o = 0.06;
      const P = side === 0 ? (u, v) => F(t + u, y + v, hd + o)
        : side === 1 ? (u, v) => F(-t - u, y + v, -hd - o)
          : side === 2 ? (u, v) => F(hw + o, y + v, -t - u)
            : (u, v) => F(-hw - o, y + v, t + u);
      const j = () => (r() - 0.5) * s * 0.35;
      bufs.get('plain').quad(P(-s / 2 + j(), j()), P(s / 2 + j(), j()), P(s / 2 + j(), s + j()), P(-s / 2 + j(), s + j()), null, [0.05, 0.045, 0.04]);
    }
  }

  if (standing) {
    // The floor of it, burned out, and in a building that has fallen in on
    // itself the heap of its floors inside its walls.
    bufs.get('plain').quad(F(-hw, 0.08, hd), F(hw, 0.08, hd), F(hw, 0.08, -hd), F(-hw, 0.08, -hd), null, CHAR);
    if (st === STAGE.falling) heapInto(bufs.get('plain'), (a, y, c) => F(a * 0.8, y, c * 0.8), b.w, b.d, b.h * 0.22, tint, b.seed + 1);
    // A church's spire and a town hall's clock tower outlast the roof.
    if (st === STAGE.gutted) extrasInto(bufs, b, F, tint, r, true);
    return;
  }

  // ---- the roof
  const rc = col(ROOFS[b.roofCol] ?? ROOFS[0], 1 - scorch * 0.6);
  const roof = bufs.get('roof');
  const eave = b.h;
  const o = 0.35;
  if (flat) {
    const ins = 0.3;
    roof.quad(F(-hw + ins, eave, hd - ins), F(hw - ins, eave, hd - ins), F(hw - ins, eave, -hd + ins), F(-hw + ins, eave, -hd + ins),
      [[0, 0], [b.w / 4, 0], [b.w / 4, b.d / 4], [0, b.d / 4]], col(0x5a5852, 1 - scorch * 0.5));
    // The inside of the parapet, and its coping.
    const pl = bufs.get('plain');
    const cap = mixc(tint, [0.85, 0.83, 0.78], 0.4);
    const P = [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd]];
    const I = [[-hw + ins, hd - ins], [hw - ins, hd - ins], [hw - ins, -hd + ins], [-hw + ins, -hd + ins]];
    for (let k = 0; k < 4; k++) {
      const [a0, c0] = I[k];
      const [a1, c1] = I[(k + 1) % 4];
      pl.quad(F(a1, eave, c1), F(a0, eave, c0), F(a0, wallTop, c0), F(a1, wallTop, c1), null, tint.map((v) => v * 0.8));
      const [p0, q0] = P[k];
      const [p1, q1] = P[(k + 1) % 4];
      pl.quad(F(p0, wallTop, q0), F(p1, wallTop, q1), F(a1, wallTop, c1), F(a0, wallTop, c0), null, cap);
    }
    // Set back storeys, the way the zoning of the day made a tall building
    // step in as it rose.
    if (b.tiers) {
      let prevK = 1;
      let prevH = b.h;
      for (const t of b.tiers) {
        const tw = (b.w * t.k) / 2;
        const td = (b.d * t.k) / 2;
        const n = (len) => Array(Math.max(1, Math.round(len / bay))).fill(t.h);
        faceInto(bufs, F, key, tint, -tw, td, tw, td, prevH, n(tw * 2), fh);
        faceInto(bufs, F, key, tint, tw, -td, -tw, -td, prevH, n(tw * 2), fh);
        faceInto(bufs, F, key, tint, tw, td, tw, -td, prevH, n(td * 2), fh);
        faceInto(bufs, F, key, tint, -tw, -td, -tw, td, prevH, n(td * 2), fh);
        roof.quad(F(-tw, t.h, td), F(tw, t.h, td), F(tw, t.h, -td), F(-tw, t.h, -td), null, col(0x5a5852));
        prevK = t.k;
        prevH = t.h;
      }
      void prevK;
    }
  } else if (b.roof === 'saw') {
    // North lights: a run of sloped roofs with glazing in their steep faces.
    const n = Math.max(2, Math.round(b.w / 8));
    const tw = b.w / n;
    const H = b.roofH;
    const glass = [0.16, 0.2, 0.24];
    for (let k = 0; k < n; k++) {
      const a0 = -hw + k * tw;
      const a1 = a0 + tw;
      roof.quad(F(a0, eave, hd), F(a0, eave, -hd), F(a1, eave + H, -hd), F(a1, eave + H, hd), [[0, 0], [b.d / 3, 0], [b.d / 3, 2], [0, 2]], rc);
      bufs.get('plain').quad(F(a1, eave, -hd), F(a1, eave, hd), F(a1, eave + H, hd), F(a1, eave + H, -hd), null, glass);
      bufs.get('plain').tri(F(a0, eave, hd), F(a1, eave, hd), F(a1, eave + H, hd), null, null, null, tint);
      bufs.get('plain').tri(F(a1, eave, -hd), F(a0, eave, -hd), F(a1, eave + H, -hd), null, null, null, tint);
    }
  } else {
    // Gabled or hipped, the ridge along the longer side.
    const along = b.w >= b.d;
    const L1 = (along ? b.w : b.d) / 2 + o;
    const S1 = (along ? b.d : b.w) / 2 + o;
    const H = b.roofH;
    const hip = b.roof === 'hip' ? Math.min(L1 - 0.5, S1) : 0;
    // In the roof's own frame: x along the ridge, z across it.
    const R = along ? (x, y, z) => F(x, y, z) : (x, y, z) => F(z, y, -x);
    const ridge = eave + H;
    const uvs = (len) => [[0, 0], [len / 3, 0], [len / 3, S1 / 1.2], [0, S1 / 1.2]];
    const drop = 0.25;
    // The two long faces.
    roof.quad(R(-L1, eave - drop, S1), R(L1, eave - drop, S1), R(L1 - hip, ridge, 0), R(-L1 + hip, ridge, 0), uvs(L1 * 2), rc);
    roof.quad(R(L1, eave - drop, -S1), R(-L1, eave - drop, -S1), R(-L1 + hip, ridge, 0), R(L1 - hip, ridge, 0), uvs(L1 * 2), rc);
    if (hip > 0) {
      roof.tri(R(L1, eave - drop, S1), R(L1, eave - drop, -S1), R(L1 - hip, ridge, 0), [0, 0], [S1 / 1.5, 0], [S1 / 3, S1 / 1.2], rc);
      roof.tri(R(-L1, eave - drop, -S1), R(-L1, eave - drop, S1), R(-L1 + hip, ridge, 0), [0, 0], [S1 / 1.5, 0], [S1 / 3, S1 / 1.2], rc);
    } else {
      // The gable ends, in the wall itself.
      const g = bufs.get(key);
      const half = S1 - o;
      const v0 = -(b.h / fh);
      const v1 = -((b.h + H) / fh);
      const ends = [[L1 - o, 1], [-(L1 - o), -1]];
      for (const [x, sgn] of ends) {
        const a = R(x, eave, sgn * half);
        const c = R(x, eave, -sgn * half);
        const top = R(x, ridge - 0.15, 0);
        g.tri(a, c, top, [0, v0], [half * 2 / bay, v0], [half / bay, v1], tint);
      }
    }
    // The underside of the eaves, so the roof is not paper from below.
    bufs.get('plain').quad(R(L1, eave - drop, S1), R(-L1, eave - drop, S1), R(-L1, eave, S1 - o), R(L1, eave, S1 - o), null, tint.map((v) => v * 0.6));
    bufs.get('plain').quad(R(-L1, eave - drop, -S1), R(L1, eave - drop, -S1), R(L1, eave, -S1 + o), R(-L1, eave, -S1 + o), null, tint.map((v) => v * 0.6));
  }
  extrasInto(bufs, b, F, tint, r, false);
}

/** Chimneys, towers, porticoes, signs and the rest of what makes a building the one it is. */
function extrasInto(bufs, b, F, tint, r, ruined) {
  const pl = bufs.get('plain');
  const e = b.extra || {};
  const hw = b.w / 2;
  const hd = b.d / 2;
  const stone = mixc(tint, [0.9, 0.88, 0.82], 0.3);
  if (e.spire) {
    // The tower at the west end and its broach spire.
    const tc = hd - 3;
    boxInto(bufs.get('stone'), F, -3, 3, 0, b.h + 9, tc - 3, tc + 3, stone, 0.25);
    cylInto(bufs.get('roof'), F, 0, tc, 3.6, 0, b.h + 9, b.h + 9 + e.spire, col(ROOFS[2]), 8, false);
    pl.quad(F(-0.9, b.h + 3, tc + 3.05), F(0.9, b.h + 3, tc + 3.05), F(0.9, b.h + 6.5, tc + 3.05), F(-0.9, b.h + 6.5, tc + 3.05), null, [0.08, 0.08, 0.1]);
  }
  if (e.clock) {
    const top = b.h + e.clock;
    boxInto(bufs.get('stone'), F, -3.2, 3.2, b.h - 0.5, top, -3.2, 3.2, stone, 0.25);
    cylInto(bufs.get('roof'), F, 0, 0, 4.4, 0, top, top + 4.5, col(ROOFS[3]), 4, false);
    const fy = top - 3;
    for (const [fa, fc, ra, rcz] of [[0, 3.25, 1, 0], [0, -3.25, -1, 0], [3.25, 0, 0, -1], [-3.25, 0, 0, 1]]) {
      const P = (u, v) => F(fa + ra * u, fy + v, fc + rcz * u);
      pl.quad(P(-1.5, -1.5), P(1.5, -1.5), P(1.5, 1.5), P(-1.5, 1.5), null, [0.92, 0.9, 0.82]);
    }
  }
  if (ruined) return;
  if (e.portico) {
    // Six columns, an entablature and a pediment, up a flight of steps.
    const out = hd + 4.5;
    const H = Math.min(b.h * 0.8, 11);
    boxInto(pl, F, -12, 12, 0, 1.2, hd, out + 1.5, mixc(stone, [0.7, 0.7, 0.7], 0.2));
    for (let k = 0; k < 6; k++) cylInto(bufs.get('stone'), F, -10 + k * 4, out, 0.55, 0.5, 1.2, H, stone, 10);
    boxInto(bufs.get('stone'), F, -11.5, 11.5, H, H + 1.6, hd - 0.2, out + 0.9, stone, 0.25);
    const g = bufs.get('stone');
    g.tri(F(-11.5, H + 1.6, out + 0.9), F(11.5, H + 1.6, out + 0.9), F(0, H + 5, out + 0.9), null, null, null, stone);
    bufs.get('roof').quad(F(11.5, H + 1.6, out + 0.9), F(11.5, H + 1.6, hd - 0.2), F(0, H + 5, hd - 0.2), F(0, H + 5, out + 0.9), null, col(ROOFS[2]));
    bufs.get('roof').quad(F(-11.5, H + 1.6, hd - 0.2), F(-11.5, H + 1.6, out + 0.9), F(0, H + 5, out + 0.9), F(0, H + 5, hd - 0.2), null, col(ROOFS[2]));
  }
  if (e.flag) {
    cylInto(pl, F, 0, 0, 0.08, 0.06, b.h + (e.clock || 0) + 4.5, b.h + (e.clock || 0) + 12, [0.85, 0.85, 0.85], 4);
  }
  if (e.marquee) {
    // The canopy over the doors, lit underneath, and the name up the corner.
    boxInto(pl, F, -hw * 0.8, hw * 0.8, 3.6, 4.6, hd, hd + 3.2, [0.85, 0.75, 0.4]);
    boxInto(bufs.get('glow'), F, hw - 2.2, hw - 0.6, 5, b.h + 4, hd + 0.1, hd + 1.0, [1, 0.35, 0.25]);
  }
  if (e.awning) {
    const stripes = [[0.75, 0.2, 0.18], [0.92, 0.9, 0.84], [0.2, 0.42, 0.3], [0.86, 0.66, 0.2]];
    const s = stripes[Math.floor(r() * stripes.length)];
    pl.quad(F(-hw + 0.5, 2.7, hd + 1.9), F(hw - 0.5, 2.7, hd + 1.9), F(hw - 0.5, 3.6, hd + 0.05), F(-hw + 0.5, 3.6, hd + 0.05), null, s);
    pl.quad(F(hw - 0.5, 2.7, hd + 1.9), F(-hw + 0.5, 2.7, hd + 1.9), F(-hw + 0.5, 3.6, hd + 0.05), F(hw - 0.5, 3.6, hd + 0.05), null, s.map((v) => v * 0.6));
  }
  if (e.porch) {
    const pa = (r() - 0.5) * (b.w - 4);
    boxInto(pl, F, pa - 1.6, pa + 1.6, 2.6, 2.85, hd, hd + 2, [0.9, 0.9, 0.88]);
    for (const s of [-1, 1]) boxInto(pl, F, pa + s * 1.4 - 0.1, pa + s * 1.4 + 0.1, 0, 2.6, hd + 1.7, hd + 1.9, [0.95, 0.95, 0.92]);
  }
  const brick = col(0x8a4a38);
  if (e.chimney || e.chimneys) {
    const n = e.chimneys ? Math.max(1, Math.floor(b.w / 7)) : 1;
    for (let k = 0; k < n; k++) {
      const ca = n === 1 ? b.w * (r() - 0.5) * 0.5 : -hw + (k + 0.5) * (b.w / n);
      boxInto(pl, F, ca - 0.4, ca + 0.4, b.h, b.h + b.roofH + 1.1, -0.4, 0.4, brick);
      boxInto(pl, F, ca - 0.5, ca + 0.5, b.h + b.roofH + 1.1, b.h + b.roofH + 1.3, -0.5, 0.5, brick.map((v) => v * 0.8));
    }
  }
  if (e.tank) {
    const ta = hw - 3;
    const tc = -hd + 3;
    for (const [sa, sc] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) boxInto(pl, F, ta + sa * 1 - 0.1, ta + sa * 1 + 0.1, b.h + 0.9, b.h + 3, tc + sc - 0.1, tc + sc + 0.1, [0.25, 0.22, 0.2]);
    cylInto(pl, F, ta, tc, 1.5, 1.5, b.h + 3, b.h + 5.6, [0.45, 0.33, 0.24], 10);
    cylInto(pl, F, ta, tc, 1.6, 0, b.h + 5.6, b.h + 6.6, [0.3, 0.25, 0.2], 10, false);
  }
  if (e.mast) {
    const top = b.tiers ? b.tiers[b.tiers.length - 1].h : b.h;
    cylInto(pl, F, 0, 0, 0.35, 0.12, top, top + e.mast, [0.7, 0.7, 0.7], 6);
  }
}

// ---------------------------------------------------------------------------
// Street furniture
// ---------------------------------------------------------------------------

/** One prop's model, in its own frame with its foot at the origin, as a buffer. */
function propModel(t) {
  const b = new Buf();
  const F = (a, y, c) => [a, y, c];
  const iron = [0.12, 0.14, 0.13];
  switch (t) {
    case 'lamp':
      // A cast-iron standard: fluted base, post, crook and lantern.
      cylInto(b, F, 0, 0, 0.22, 0.14, 0, 1.0, iron, 8);
      cylInto(b, F, 0, 0, 0.07, 0.06, 1.0, 4.4, iron, 6);
      boxInto(b, F, -0.05, 0.05, 4.3, 4.4, 0, 0.55, iron);
      cylInto(b, F, 0, 0.55, 0.2, 0.28, 3.95, 4.3, iron, 6);
      break;
    case 'lampglass':
      cylInto(b, F, 0, 0.55, 0.16, 0.2, 3.6, 3.95, [1, 1, 1], 6);
      break;
    case 'tree':
      cylInto(b, F, 0, 0, 0.2, 0.14, 0, 3.4, [0.3, 0.24, 0.18], 6);
      blobInto(b, F, 0, 4.8, 0, 2.3, 2.1, 2.3, [0.26, 0.4, 0.2], 3);
      blobInto(b, F, 0.8, 5.9, 0.4, 1.5, 1.4, 1.5, [0.3, 0.45, 0.22], 5);
      break;
    case 'bigtree':
      cylInto(b, F, 0, 0, 0.32, 0.22, 0, 5, [0.32, 0.26, 0.19], 7);
      blobInto(b, F, 0, 7.2, 0, 3.8, 3.2, 3.8, [0.24, 0.38, 0.18], 7);
      blobInto(b, F, -1.4, 8.6, 0.8, 2.4, 2.1, 2.4, [0.28, 0.43, 0.21], 9);
      blobInto(b, F, 1.5, 8.2, -0.9, 2.2, 2, 2.2, [0.22, 0.36, 0.17], 11);
      break;
    case 'bench':
      boxInto(b, F, -0.9, 0.9, 0.42, 0.48, -0.22, 0.22, [0.45, 0.32, 0.2]);
      boxInto(b, F, -0.9, 0.9, 0.48, 0.9, -0.24, -0.18, [0.45, 0.32, 0.2]);
      for (const s of [-1, 1]) boxInto(b, F, s * 0.8 - 0.04, s * 0.8 + 0.04, 0, 0.45, -0.2, 0.2, iron);
      break;
    case 'car': {
      // A saloon of the thirties: long bonnet, upright cabin, running boards
      // and separate wings. White, to take the colour the instance is given.
      const body = [0.92, 0.92, 0.92];
      boxInto(b, F, -0.82, 0.82, 0.45, 1.05, -2.2, 2.2, body);
      boxInto(b, F, -0.75, 0.75, 1.05, 1.62, -1.35, 0.55, body);
      boxInto(b, F, -0.7, 0.7, 1.12, 1.52, -1.3, 0.5, [0.15, 0.18, 0.22]);
      boxInto(b, F, -0.95, 0.95, 0.32, 0.4, -1.4, 1.4, [0.1, 0.1, 0.1]);
      boxInto(b, F, -0.5, 0.5, 0.6, 1.0, 2.2, 2.32, [0.6, 0.6, 0.58]);
      for (const [sa, sc] of [[-1, -1.45], [1, -1.45], [-1, 1.45], [1, 1.45]]) {
        cylInto(b, (a, y, c) => [a, y, c], sa * 0.85, sc, 0.36, 0.36, 0, 0.0001, [0.05, 0.05, 0.05], 8, false);
        boxInto(b, F, sa * 0.85 - 0.12, sa * 0.85 + 0.12, 0, 0.72, sc - 0.36, sc + 0.36, [0.06, 0.06, 0.06]);
      }
      break;
    }
    case 'phone':
      boxInto(b, F, -0.5, 0.5, 0, 2.4, -0.5, 0.5, [0.72, 0.1, 0.08]);
      boxInto(b, F, -0.42, 0.42, 0.9, 2.1, 0.5, 0.52, [0.2, 0.25, 0.3]);
      cylInto(b, F, 0, 0, 0.62, 0.3, 2.4, 2.7, [0.72, 0.1, 0.08], 4, true);
      break;
    case 'pillar':
      cylInto(b, F, 0, 0, 0.28, 0.28, 0, 1.45, [0.72, 0.1, 0.08], 10);
      cylInto(b, F, 0, 0, 0.32, 0.1, 1.45, 1.7, [0.72, 0.1, 0.08], 10);
      break;
    case 'hydrant':
      cylInto(b, F, 0, 0, 0.14, 0.12, 0, 0.75, [0.75, 0.15, 0.1], 8);
      cylInto(b, F, 0, 0, 0.16, 0.02, 0.75, 0.9, [0.75, 0.15, 0.1], 8, false);
      break;
    case 'bollard':
      cylInto(b, F, 0, 0, 0.3, 0.26, 0, 0.6, [0.15, 0.15, 0.15], 8);
      cylInto(b, F, 0, 0, 0.38, 0.38, 0.6, 0.72, [0.15, 0.15, 0.15], 8);
      break;
    case 'kiosk':
      boxInto(b, F, -1.4, 1.4, 0, 2.4, -1.1, 1.1, [0.22, 0.38, 0.28]);
      boxInto(b, F, -1.2, 1.2, 1.0, 2.0, 1.1, 1.14, [0.85, 0.82, 0.7]);
      cylInto(b, F, 0, 0, 2.3, 0.2, 2.4, 3.3, [0.22, 0.38, 0.28], 6, false);
      break;
    case 'fountain': {
      const stone = [0.78, 0.75, 0.68];
      for (let k = 0; k < 16; k++) {
        const a0 = (k / 16) * Math.PI * 2;
        const a1 = ((k + 1) / 16) * Math.PI * 2;
        const R = 5.5;
        const p = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
        b.quad(p(a1, R, 0), p(a0, R, 0), p(a0, R, 0.7), p(a1, R, 0.7), null, stone);
        b.quad(p(a1, R, 0.7), p(a0, R, 0.7), p(a0, R - 0.5, 0.7), p(a1, R - 0.5, 0.7), null, stone);
        b.tri([0, 0.5, 0], p(a1, R - 0.5, 0.5), p(a0, R - 0.5, 0.5), null, null, null, [0.35, 0.5, 0.58]);
      }
      cylInto(b, F, 0, 0, 0.6, 0.45, 0, 2.2, stone, 10);
      cylInto(b, F, 0, 0, 1.8, 0.4, 2.2, 2.6, stone, 12);
      cylInto(b, F, 0, 0, 0.3, 0.1, 2.6, 3.6, [0.6, 0.75, 0.85], 8);
      break;
    }
    case 'statue':
      boxInto(b, F, -1.6, 1.6, 0, 0.6, -1.6, 1.6, [0.7, 0.68, 0.62]);
      boxInto(b, F, -1.0, 1.0, 0.6, 3.6, -1.0, 1.0, [0.78, 0.75, 0.68]);
      cylInto(b, F, 0, 0, 0.45, 0.35, 3.6, 5.4, [0.35, 0.45, 0.38], 8);
      blobInto(b, F, 0, 5.75, 0, 0.32, 0.38, 0.32, [0.35, 0.45, 0.38], 2);
      break;
    case 'bandstand': {
      const white = [0.92, 0.92, 0.88];
      cylInto(b, F, 0, 0, 5, 5, 0, 1, [0.75, 0.72, 0.66], 8);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        cylInto(b, F, Math.cos(a) * 4.5, Math.sin(a) * 4.5, 0.12, 0.12, 1, 4.2, white, 6);
      }
      cylInto(b, F, 0, 0, 5.6, 0, 4.2, 6.6, [0.35, 0.55, 0.45], 8, false);
      break;
    }
    default:
      boxInto(b, F, -0.3, 0.3, 0, 1, -0.3, 0.3, [0.5, 0.5, 0.5]);
  }
  return b;
}

const CAR_COLOURS = [0x1c1c1e, 0x2a3b2e, 0x5a1e1a, 0x24304a, 0x7a7466, 0x3e2f24];

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

const CHUNK = 140;
const DEBRIS_MAX = 900;
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

export class WorksView {
  /**
   * `fx` is the battle's effects (dust, smoke, splashes); `flames` its fires.
   */
  constructor(scene, world, { effects = null, flames = null, time = 'day' } = {}) {
    this.scene = scene;
    this.world = world;
    this.fx = effects;
    this.flames = flames;
    this.night = time === 'night' || time === 'dusk';
    this.group = new THREE.Group();
    this.group.name = 'works';
    scene.add(this.group);
    this.mats = this.materials();
    this.plan = cityPlan(world);
    this.chunks = new Map();
    this.dirty = new Set();
    this.falling = [];
    this.recent = new Map();
    this.smoulder = 0;
    // What each building looked like when it was last drawn, so a change can
    // be drawn as a change. Not read off the world: in a standalone build the
    // world is the simulation's own, and it has already moved on by the time
    // the event arrives.
    this.known = new Map();
    for (const id in world.ruin?.b || {}) this.known.set(Number(id), { ...world.ruin.b[id] });
    if (this.plan) {
      this.surface();
      for (const b of this.plan.buildings) {
        const k = this.chunkOf(b);
        if (!this.chunks.has(k)) this.chunks.set(k, { list: [], group: null });
        this.chunks.get(k).list.push(b);
      }
      for (const k of this.chunks.keys()) this.buildChunk(k);
      this.props();
    }
    this.walls = [];
    this.wallTops = this.intactTops();
    (world.works?.walls || []).forEach((_, ri) => this.buildWall(ri));
    this.debris = this.debrisField();
  }

  materials() {
    const std = (map, extra = {}) => new THREE.MeshStandardMaterial({
      map, vertexColors: true, roughness: 0.92, metalness: 0, ...extra,
    });
    const m = {};
    for (const k of Object.keys(FACADE)) m[k] = std(canvasTexture(`f-${k}`, FACADE[k]));
    m.roof = std(canvasTexture('g-roof', GROUND.roof));
    m.plain = std(null);
    m.glow = new THREE.MeshBasicMaterial({ vertexColors: true });
    const ground = (k) => std(canvasTexture(`g-${k}`, GROUND[k]), {
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    m.asphalt = ground('asphalt');
    m.slab = ground('slab');
    m.grass = ground('grass');
    m.setts = ground('setts');
    m.gravel = ground('gravel');
    m.kerb = std(canvasTexture('g-slab', GROUND.slab));
    m.concrete = std(canvasTexture('g-concrete', GROUND.concrete));
    return m;
  }

  chunkOf(b) {
    return `${Math.floor(b.u / CHUNK)},${Math.floor(b.v / CHUNK)}`;
  }

  /** (Re)build one chunk of the town as it now stands. */
  buildChunk(k) {
    const ch = this.chunks.get(k);
    if (!ch) return;
    if (ch.group) {
      this.group.remove(ch.group);
      ch.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    const bufs = new Bufs();
    for (const b of ch.list) buildingInto(bufs, b, this.plan.level, ruinOf(this.world, b.id));
    ch.group = bufs.meshes(this.mats);
    this.group.add(ch.group);
  }

  // ---- the ground: streets, pavements and kerbs, lawns and paving

  surface() {
    const plan = this.plan;
    const { nu, nv, surf, W, D, level: L, city } = plan;
    const KIND = {
      [SURF.road]: 'asphalt', [SURF.walk]: 'slab', [SURF.lawn]: 'grass', [SURF.plaza]: 'setts',
      [SURF.yard]: 'gravel', [SURF.path]: 'gravel', [SURF.median]: 'grass',
    };
    const TILE = { asphalt: 6, slab: 3, grass: 5, setts: 2.5, gravel: 4 };
    const bufs = new Bufs();
    const P = (u, y, v) => {
      const w = cityToWorld(city, u, v);
      return [w.x, y, w.z];
    };
    const uvAt = (u, v, k) => {
      const w = cityToWorld(city, u, v);
      return [w.x / TILE[k], w.z / TILE[k]];
    };
    // Row by row, each run of one kind of surface as one quad.
    for (let j = 0; j < nv; j++) {
      let i = 0;
      while (i < nu) {
        const t = surf[j * nu + i];
        let e = i + 1;
        while (e < nu && surf[j * nu + e] === t) e++;
        if (t) {
          const k = KIND[t];
          const y = L + 0.04 + SURF_RISE[t];
          const u0 = -W / 2 + i * SURF_CELL;
          const u1 = -W / 2 + e * SURF_CELL;
          const v0 = -D / 2 + j * SURF_CELL;
          const v1 = v0 + SURF_CELL;
          const c = t === SURF.path ? [0.92, 0.86, 0.74] : t === SURF.median ? [0.95, 1, 0.95] : [1, 1, 1];
          bufs.get(k).quad(P(u0, y, v1), P(u1, y, v1), P(u1, y, v0), P(u0, y, v0),
            [uvAt(u0, v1, k), uvAt(u1, v1, k), uvAt(u1, v0, k), uvAt(u0, v0, k)], c);
        }
        i = e;
      }
    }
    // Kerbs: wherever two cells meet at different heights, the face between them.
    const rise = (i, j) => (i < 0 || j < 0 || i >= nu || j >= nv ? -1 : surf[j * nu + i] ? SURF_RISE[surf[j * nu + i]] : -1);
    const kerb = bufs.get('kerb');
    const stoneC = [0.82, 0.8, 0.76];
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const h = rise(i, j);
        if (h < 0) continue;
        const v0 = -D / 2 + j * SURF_CELL;
        const u0 = -W / 2 + i * SURF_CELL;
        // Each face is drawn by the higher cell, facing the lower one.
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const o = rise(i + di, j + dj);
          if (o < 0 || o >= h - 0.01) continue;
          const yl = L + 0.04 + o;
          const yh = L + 0.04 + h;
          let a, b2;
          if (di === 1) { a = [u0 + SURF_CELL, v0 + SURF_CELL]; b2 = [u0 + SURF_CELL, v0]; }
          if (di === -1) { a = [u0, v0]; b2 = [u0, v0 + SURF_CELL]; }
          if (dj === 1) { a = [u0, v0 + SURF_CELL]; b2 = [u0 + SURF_CELL, v0 + SURF_CELL]; }
          if (dj === -1) { a = [u0 + SURF_CELL, v0]; b2 = [u0, v0]; }
          kerb.quad(P(a[0], yl, a[1]), P(b2[0], yl, b2[1]), P(b2[0], yh, b2[1]), P(a[0], yh, a[1]),
            [[0, 0], [1, 0], [1, 0.1], [0, 0.1]], stoneC);
        }
      }
    }
    const g = bufs.meshes(this.mats);
    g.traverse((o) => { if (o.isMesh) o.renderOrder = 1; });
    this.group.add(g);
    this.ground = g;
  }

  // ---- street furniture

  props() {
    const plan = this.plan;
    const L = plan.level;
    this.prop = [];
    const types = {};
    for (const p of plan.props) {
      const t = p.t === 'tree' && p.big ? 'bigtree' : p.t;
      (types[t] || (types[t] = [])).push(p);
    }
    this.inst = {};
    for (const [t, list] of Object.entries(types)) {
      const buf = propModel(t);
      const mat = t === 'car'
        ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 })
        : this.mats.plain;
      const mesh = new THREE.InstancedMesh(buf.geometry(), mat, list.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const entries = list.map((p, k) => {
        const rise = SURF_RISE[plan.surfAt(p.u, p.v)] || 0;
        const e = {
          p, t, k, mesh, x: p.x, y: L + 0.04 + rise, z: p.z, yaw: p.yaw,
          tilt: 0, tiltDir: 0, spin: 0, roll: 0, gone: false, burnt: false, fallMax: 0,
        };
        this.prop.push(e);
        return e;
      });
      mesh.userData.entries = entries;
      this.inst[t] = mesh;
      if (t === 'car') {
        entries.forEach((e) => {
          tmpC.setHex(CAR_COLOURS[e.p.c % CAR_COLOURS.length]);
          mesh.setColorAt(e.k, tmpC);
        });
      }
      entries.forEach((e) => this.place(e));
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
    // The lamps' glass: lit at dusk and through the night.
    const lamps = types.lamp || [];
    if (lamps.length) {
      const glass = new THREE.InstancedMesh(propModel('lampglass').geometry(), new THREE.MeshBasicMaterial({
        color: this.night ? 0xffd890 : 0xb8c2c8,
      }), lamps.length);
      this.glass = glass;
      this.inst.lamp.userData.glass = glass;
      this.inst.lamp.userData.entries.forEach((e) => this.place(e));
      glass.instanceMatrix.needsUpdate = true;
      glass.computeBoundingSphere();
      this.group.add(glass);
    }
    this.moving = new Set();
    // Anything standing where a building has already been cleared, or one is
    // already down, goes as it would have.
    for (const b of plan.buildings) {
      const r = ruinOf(this.world, b.id);
      if (r?.c) this.clearProps(b.x, b.z, Math.hypot(b.w, b.d) / 2 + 2);
    }
  }

  /** Put one prop's instance where and how it now is. */
  place(e) {
    if (e.gone) {
      tmpM.makeScale(0, 0, 0);
    } else {
      // Over on its side about its foot, toward `tiltDir`, then turned on its own axis.
      tmpE.set(0, e.yaw + e.spin, 0);
      tmpQ.setFromEuler(tmpE);
      if (e.tilt || e.roll) {
        const ax = tmpV.set(Math.cos(e.tiltDir), 0, -Math.sin(e.tiltDir));
        const q2 = new THREE.Quaternion().setFromAxisAngle(ax, e.tilt + e.roll);
        tmpQ.premultiply(q2);
      }
      tmpS.set(1, 1, 1);
      tmpM.compose(tmpV.set(e.x, e.y, e.z), tmpQ, tmpS);
    }
    e.mesh.setMatrixAt(e.k, tmpM);
    e.mesh.instanceMatrix.needsUpdate = true;
    const glass = e.mesh.userData.glass;
    if (glass) {
      glass.setMatrixAt(e.k, tmpM);
      glass.instanceMatrix.needsUpdate = true;
    }
  }

  /** Hide whatever street furniture stands inside a circle: the ground has been cleared for a gun. */
  clearProps(x, z, r) {
    if (!this.prop) return;
    for (const e of this.prop) {
      if (e.gone || Math.hypot(e.x - x, e.z - z) > r) continue;
      e.gone = true;
      this.place(e);
    }
  }

  /**
   * A burst at (x, z): street furniture near it is knocked flat, away from
   * it, and a car near enough is thrown over and set alight.
   */
  blast(x, z, cal = 152, y = null) {
    if (!this.prop) return;
    const reach = 3 + cal / 22;
    for (const e of this.prop) {
      if (e.gone) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d > reach) continue;
      const away = Math.atan2(e.x - x, e.z - z);
      const near = 1 - d / reach;
      if (e.t === 'car') {
        if (!e.burnt) {
          e.burnt = true;
          tmpC.setRGB(0.07, 0.06, 0.055);
          e.mesh.setColorAt(e.k, tmpC);
          e.mesh.instanceColor.needsUpdate = true;
        }
        if (near > 0.45 && !e.fallMax) {
          // Thrown: over on its side or its roof, and shoved along.
          e.fallMax = near > 0.75 ? Math.PI : Math.PI / 2;
          e.tiltDir = away;
          e.vel = { x: Math.sin(away) * 6 * near, z: Math.cos(away) * 6 * near, y: 3 * near };
          this.moving.add(e);
        }
        continue;
      }
      if (['bench', 'hydrant', 'bollard'].includes(e.t) || (['fountain', 'statue', 'bandstand', 'kiosk'].includes(e.t) && near > 0.6)) {
        e.gone = true;
        this.place(e);
        this.spray(e.x, e.y + 0.5, e.z, 6, [0.5, 0.48, 0.45], 0.35);
        continue;
      }
      if (['fountain', 'statue', 'bandstand', 'kiosk'].includes(e.t)) continue;
      if (e.fallMax) continue;
      // Lamps, trees, telephone kiosks and pillar boxes go over.
      e.fallMax = e.t === 'tree' || e.t === 'bigtree' ? 1.38 : 1.5;
      e.tiltDir = away;
      e.omega = 0.4 + near * 1.6;
      this.moving.add(e);
    }
    void y;
  }

  /** Knock over everything inside a falling building's footprint and round its foot. */
  underFall(b) {
    if (!this.prop) return;
    const R = Math.hypot(b.w, b.d) / 2 + 3;
    for (const e of this.prop) {
      if (e.gone || e.fallMax) continue;
      if (Math.hypot(e.x - b.x, e.z - b.z) > R) continue;
      e.fallMax = 1.45;
      e.tiltDir = Math.atan2(e.x - b.x, e.z - b.z);
      e.omega = 0.8;
      this.moving.add(e);
    }
  }

  stepProps(dt) {
    if (!this.moving || !this.moving.size) return;
    for (const e of this.moving) {
      if (e.vel) {
        // A car in the air: on its own momentum and gravity, until it is down.
        e.x += e.vel.x * dt;
        e.z += e.vel.z * dt;
        e.vel.y -= 9.8 * dt;
        const floor = groundHeight(this.world, e.x, e.z) + 0.04;
        e.y += e.vel.y * dt;
        e.tilt = Math.min(e.fallMax, e.tilt + dt * 4);
        if (e.y <= floor) {
          e.y = floor;
          e.vel.x *= 0.5;
          e.vel.z *= 0.5;
          if (Math.abs(e.vel.y) < 1.5 && e.tilt >= e.fallMax) { e.vel = null; this.moving.delete(e); }
          e.vel && (e.vel.y = -e.vel.y * 0.2);
        }
      } else {
        // A post going over: angular acceleration that grows as it leans,
        // the way anything falls that is pinned at its foot.
        e.omega += (9.8 / 3) * Math.sin(Math.max(0.12, e.tilt)) * dt;
        e.tilt += e.omega * dt;
        if (e.tilt >= e.fallMax) {
          e.tilt = e.fallMax;
          // A little bounce, then still.
          if (e.omega > 1.2) e.omega = -e.omega * 0.18;
          else { this.moving.delete(e); if (e.t !== 'tree' && e.t !== 'bigtree') this.spray(e.x + Math.sin(e.tiltDir) * 3, e.y + 0.3, e.z + Math.cos(e.tiltDir) * 3, 3, [0.3, 0.3, 0.3], 0.2); }
        }
      }
      this.place(e);
    }
  }

  // ---- sea walls

  /** Every wall point's walkway height with the walls intact, kept for drawing a breach against. */
  intactTops() {
    const w = this.world;
    const runs = w.works?.walls || [];
    if (!runs.length) return [];
    const held = w.ruin?.w;
    if (w.ruin) w.ruin.w = {};
    const out = runs.map((run) => run.pts.map(([x, z]) => groundHeight(w, x, z)));
    if (w.ruin) w.ruin.w = held;
    return out;
  }

  buildWall(ri) {
    const run = this.world.works.walls[ri];
    const old = this.walls[ri];
    if (old) {
      this.group.remove(old);
      old.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    const bufs = new Bufs();
    const con = bufs.get('concrete');
    const rub = bufs.get('plain');
    const pts = run.pts;
    const tops = this.wallTops[ri];
    const W2 = run.width / 2;
    const n = wallSections(run);
    const dmg = (s) => this.world.ruin?.w?.[ri * 1000 + s]?.d || 0;
    const secOf = (k) => Math.min(n - 1, Math.floor(k / 2));
    // One cross-section per point: back edge, walkway, parapet, sea face, foot.
    const cross = pts.map(([x, z, nx, nz], k) => {
      const T = tops[k];
      const F = [x + nx * W2, z + nz * W2];
      const B = [x - nx * W2, z - nz * W2];
      const sea = rawGround(this.world, F[0] + nx * 5, F[1] + nz * 5);
      const foot = Math.max(-26, Math.min(sea, -0.6) - 2.5);
      const back = Math.min(T - 0.3, rawGround(this.world, B[0] - nx * 2, B[1] - nz * 2)) - 1.2;
      const batter = (T + PARAPET - foot) * 0.1;
      return { x, z, nx, nz, T, F, B, foot, back, batter };
    });
    const P = (q, off, y) => [q.x + q.nx * off, y, q.z + q.nz * off];
    let s0 = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = cross[k];
      const b = cross[k + 1];
      const sec = secOf(k);
      const d = dmg(sec);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const s1 = s0 + len;
      // Each section poured on its own, a shade different from the next,
      // and blackened the more it has been hit.
      const shade = (0.9 + ((sec * 7919) % 13) / 130) * (1 - Math.min(0.55, d * 0.55));
      const c = [shade, shade * 0.99, shade * 0.96];
      const u = (s) => s / 4;
      if (d >= 1) {
        // Breached: a slide of broken concrete from the back of the wall out
        // into the sea, lower than the walkway was by two-thirds.
        const r = rngOf(ri * 1000 + sec + 1);
        const prof = (q) => {
          const R = Math.max(q.back + 1, q.T * 0.38);
          return [
            [-W2, Math.max(q.back, R - 0.5)],
            [-W2 * 0.4, R + (r() - 0.5) * 1.2],
            [W2 * 0.2, R * 0.85 + (r() - 0.5) * 1.5],
            [W2 + 3, R * 0.45],
            [W2 + q.batter + 3 + R * 0.6, q.foot + 1],
          ];
        };
        const pa = prof(a);
        const pb = prof(b);
        for (let m = 0; m < pa.length - 1; m++) {
          const cc = mixc([0.55, 0.53, 0.5], c, 0.4).map((v) => v * (0.75 + r() * 0.25));
          rub.quad(P(a, pa[m][0], pa[m][1]), P(a, pa[m + 1][0], pa[m + 1][1]), P(b, pb[m + 1][0], pb[m + 1][1]), P(b, pb[m][0], pb[m][1]), null, cc);
        }
        // The faces of the sections either side, where they were broken off.
        const tx = b.x - a.x;
        const tz = b.z - a.z;
        if (k > 0 && secOf(k - 1) !== sec && dmg(secOf(k - 1)) < 1) this.wallEnd(con, a, W2, tx, tz, c);
        if (k + 1 < pts.length - 1 && secOf(k + 1) !== sec && dmg(secOf(k + 1)) < 1) this.wallEnd(con, b, W2, -tx, -tz, c);
        s0 = s1;
        continue;
      }
      // The parapet goes first: chipped, then gone.
      const par = d >= 0.6 ? 0.25 : d >= 0.4 ? PARAPET * 0.6 : PARAPET;
      const IN = W2 - 1;
      // Walkway.
      con.quad(P(a, -W2, a.T), P(a, IN, a.T), P(b, IN, b.T), P(b, -W2, b.T),
        [[u(s0), -W2 / 4], [u(s0), IN / 4], [u(s1), IN / 4], [u(s1), -W2 / 4]], c);
      // Parapet: inside, coping, then the sea face all the way down.
      con.quad(P(a, IN, a.T), P(a, IN, a.T + par), P(b, IN, b.T + par), P(b, IN, b.T),
        [[u(s0), 0], [u(s0), par / 4], [u(s1), par / 4], [u(s1), 0]], c);
      con.quad(P(a, IN, a.T + par), P(a, W2, a.T + par), P(b, W2, b.T + par), P(b, IN, b.T + par), null, c.map((v) => v * 1.05));
      con.quad(P(a, W2, a.T + par), P(a, W2 + a.batter, a.foot), P(b, W2 + b.batter, b.foot), P(b, W2, b.T + par),
        [[u(s0), (a.T + par) / 4], [u(s0), a.foot / 4], [u(s1), b.foot / 4], [u(s1), (b.T + par) / 4]], c.map((v) => v * 0.92));
      // The back of it, down to the ground behind.
      con.quad(P(a, -W2, a.back), P(a, -W2, a.T), P(b, -W2, b.T), P(b, -W2, b.back),
        [[u(s0), a.back / 4], [u(s0), a.T / 4], [u(s1), b.T / 4], [u(s1), b.back / 4]], c.map((v) => v * 0.85));
      // A dark line where one section's pour meets the next.
      if (k > 0 && secOf(k - 1) !== sec) {
        rub.quad(P(a, -W2 - 0.02, a.T + 0.03), P(a, W2 + 0.02, a.T + 0.03), P(a, W2 + 0.02, a.T + 0.13), P(a, -W2 - 0.02, a.T + 0.13), null, [0.25, 0.25, 0.24]);
      }
      s0 = s1;
    }
    const e0 = cross[0];
    const e1 = cross[1];
    const z0 = cross[cross.length - 2];
    const z1 = cross[cross.length - 1];
    if (dmg(0) < 1) this.wallEnd(con, e0, W2, e0.x - e1.x, e0.z - e1.z, [0.85, 0.84, 0.8]);
    if (dmg(n - 1) < 1) this.wallEnd(con, z1, W2, z1.x - z0.x, z1.z - z0.z, [0.85, 0.84, 0.8]);
    const g = bufs.meshes(this.mats);
    this.walls[ri] = g;
    this.group.add(g);
  }

  /**
   * The end of a run of wall, or the broken face beside a breach: its whole
   * cross-section, facing along (tx, tz).
   */
  wallEnd(buf, q, W2, tx, tz, c) {
    const P = (off, y) => [q.x + q.nx * off, y, q.z + q.nz * off];
    const p = [P(-W2, q.back), P(W2 + q.batter, q.foot), P(W2, q.T + PARAPET), P(-W2, q.T)];
    const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
    const vx = p[2][0] - p[0][0], vy = p[2][1] - p[0][1], vz = p[2][2] - p[0][2];
    const nx = uy * vz - uz * vy;
    const nz = ux * vy - uy * vx;
    if (nx * tx + nz * tz >= 0) buf.quad(p[0], p[1], p[2], p[3], null, c);
    else buf.quad(p[0], p[3], p[2], p[1], null, c);
  }

  // ---- debris

  debrisField() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.95 }), DEBRIS_MAX);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    for (let k = 0; k < DEBRIS_MAX; k++) mesh.setColorAt(k, tmpC.setRGB(0.5, 0.5, 0.5));
    return { mesh, list: [] };
  }

  /**
   * Throw `n` pieces of something out from (x, y, z): brick, stone, glass,
   * concrete. Each flies on its own momentum, tumbles, lands on whatever is
   * under it -- the street, a heap, the sea -- bounces, slides and lies there.
   */
  spray(x, y, z, n, color, size = 0.6, speed = 9, up = 6) {
    const D = this.debris;
    for (let k = 0; k < n; k++) {
      if (D.list.length >= DEBRIS_MAX) {
        // The oldest piece lying on the ground makes way.
        const at = D.list.findIndex((p) => p.rest);
        if (at < 0) return;
        D.list.splice(at, 1);
      }
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.9);
      const s = size * (0.4 + Math.random() * 1.1);
      D.list.push({
        x, y, z,
        vx: Math.sin(a) * v, vz: Math.cos(a) * v, vy: up * (0.4 + Math.random()),
        rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
        wx: (Math.random() - 0.5) * 14, wy: (Math.random() - 0.5) * 14, wz: (Math.random() - 0.5) * 14,
        sx: s * (0.7 + Math.random() * 0.8), sy: s * (0.4 + Math.random() * 0.6), sz: s * (0.6 + Math.random() * 0.8),
        c: color.map((cc) => cc * (0.75 + Math.random() * 0.4)),
        rest: false, life: 70 + Math.random() * 50,
      });
    }
  }

  stepDebris(dt) {
    const D = this.debris;
    const m = D.mesh;
    let w = 0;
    for (let k = 0; k < D.list.length; k++) {
      const p = D.list[k];
      p.life -= dt;
      if (p.life <= 0) continue;
      if (!p.rest) {
        p.vy -= 9.8 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
        const g = groundHeight(this.world, p.x, p.z);
        if (g < 0 && p.y < 0) {
          // Into the sea.
          if (p.sx > 0.5 && this.fx && Math.random() < 0.3) this.fx.splash(p.x, p.z, 20 + p.sx * 30);
          continue;
        }
        const floor = Math.max(0, g + (worksFloor(this.world, p.x, p.z).rise || 0)) + p.sy / 2;
        if (p.y <= floor) {
          p.y = floor;
          if (Math.abs(p.vy) < 1.2) {
            p.vx *= 0.6; p.vz *= 0.6; p.wx *= 0.5; p.wy *= 0.5; p.wz *= 0.5; p.vy = 0;
            if (Math.hypot(p.vx, p.vz) < 0.4) { p.rest = true; p.rx = Math.round(p.rx / (Math.PI / 2)) * (Math.PI / 2); p.rz = Math.round(p.rz / (Math.PI / 2)) * (Math.PI / 2); }
          } else {
            p.vy = -p.vy * 0.28;
            p.vx *= 0.7; p.vz *= 0.7;
          }
        }
      }
      D.list[w++] = p;
      // Lying there; in its last few seconds, settling out of sight.
      const fade = Math.min(1, p.life / 6);
      tmpE.set(p.rx, p.ry, p.rz);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpV.set(p.x, p.y - (1 - fade) * p.sy, p.z), tmpQ, tmpS.set(p.sx, p.sy, p.sz));
      m.setMatrixAt(w - 1, tmpM);
      m.setColorAt(w - 1, tmpC.setRGB(p.c[0], p.c[1], p.c[2]));
    }
    D.list.length = w;
    m.count = w;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  // ---- what the battle does to it

  /** A shell into a building: a burst on its face and pieces of it across the street. */
  hit(ev) {
    const b = this.plan?.byId.get(ev.id);
    const pal = b ? col((WALLS[b.wall] || WALLS[0]).c) : [0.6, 0.55, 0.5];
    const n = Math.min(40, 6 + Math.round((ev.cal || 152) / 25));
    this.spray(ev.x, ev.y, ev.z, n, pal, 0.35 + (ev.cal || 152) / 900, 7 + (ev.cal || 152) / 40, 5);
    // Glass, out of every window near it.
    this.spray(ev.x, ev.y + 1, ev.z, Math.round(n / 2), [0.5, 0.6, 0.65], 0.15, 6, 3);
    this.blast(ev.x, ev.z, ev.cal || 152);
  }

  /** What the server said has been done to a building or a section of wall. */
  ruin(ev) {
    let was = null;
    if (ev.k === 'b') {
      was = this.known.get(ev.id) || null;
      this.known.set(ev.id, { d: ev.d, f: ev.f || 0, ...(ev.c ? { c: 1 } : {}) });
    }
    if (ev.k === 'w') {
      this.buildWall(ev.run);
      const run = this.world.works.walls[ev.run];
      if (!run) return;
      const [k0, k1] = sectionSpan(run, ev.sec);
      const [ax, az, nx, nz] = run.pts[k0];
      const [bx, bz] = run.pts[k1];
      const x = (ax + bx) / 2;
      const z = (az + bz) / 2;
      const T = this.wallTops[ev.run]?.[k0] || run.top;
      if (ev.d >= 1) {
        // The section going: a slide of concrete into the sea, and the dust of it.
        for (let k = 0; k < 4; k++) this.spray(x + nx * (k * 4), T * 0.8, z + nz * (k * 4), 30, [0.66, 0.64, 0.6], 1.1, 10, 7);
        if (this.fx) {
          for (let k = 0; k < 6; k++) this.fx.dust(x + nx * (k * 5 - 8), T * 0.6, z + nz * (k * 5 - 8), 4);
          this.fx.splash(x + nx * (run.width / 2 + 8), z + nz * (run.width / 2 + 8), 500);
        }
      } else {
        this.spray(ev.x ?? x, (ev.y || T) + 0.5, ev.z ?? z, 14, [0.68, 0.66, 0.62], 0.5, 8, 5);
      }
      return;
    }
    const b = this.plan?.byId.get(ev.id);
    if (!b) return;
    const st = stageOf(ev.d, !!ev.c);
    const before = stageOf(was?.d || 0, !!was?.c);
    if (st === STAGE.cleared) {
      this.clearProps(b.x, b.z, Math.hypot(b.w, b.d) / 2 + 2);
    }
    if (st !== before) {
      // The floors going down: what stood a moment ago, sinking into its own
      // dust while the new heap comes up under it.
      if ((st === STAGE.falling || st === STAGE.rubble) && before < st && before !== STAGE.cleared) {
        this.collapse(b, was);
      }
      this.dirty.add(this.chunkOf(b));
      this.recent.set(b.id, 150);
    }
  }

  collapse(b, was) {
    const bufs = new Bufs();
    buildingInto(bufs, b, this.plan.level, was || null);
    const g = bufs.meshes(this.mats);
    // Re-centred on its own foot, so it can be sunk and tipped about it.
    const L = this.plan.level;
    g.traverse((o) => { if (o.isMesh) { o.geometry.translate(-b.x, -L, -b.z); o.matrixAutoUpdate = true; } });
    g.position.set(b.x, L, b.z);
    this.group.add(g);
    const h = standingHeight(b, was);
    this.falling.push({
      g, b, t: 0, T: 1.8 + h / 22, h,
      axis: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
      lean: (Math.random() - 0.3) * 0.18,
    });
    this.underFall(b);
    const pal = col((WALLS[b.wall] || WALLS[0]).c);
    const R = Math.hypot(b.w, b.d) / 2;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      this.spray(b.x + Math.sin(a) * R * 0.6, L + h * 0.5, b.z + Math.cos(a) * R * 0.6, 6, pal, 0.5 + h / 60, 6 + h / 8, 3);
    }
    if (this.fx) {
      const n = Math.min(10, 3 + Math.round(R / 6));
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        this.fx.dust(b.x + Math.sin(a) * R * 0.8, L + 1 + Math.random() * h * 0.4, b.z + Math.cos(a) * R * 0.8, 2.5 + R / 8);
      }
    }
  }

  stepFalling(dt) {
    for (let k = this.falling.length - 1; k >= 0; k--) {
      const f = this.falling[k];
      f.t += dt;
      const s = Math.min(1, f.t / f.T);
      // Slowly at first and then all at once: a building comes down at the
      // speed things fall.
      const e = s * s;
      f.g.scale.y = Math.max(0.02, 1 - e * 0.97);
      f.g.position.y = this.plan.level - e * 0.4;
      f.g.setRotationFromAxisAngle(f.axis, f.lean * e);
      if (this.fx && Math.random() < dt * 6) {
        const a = Math.random() * Math.PI * 2;
        const R = Math.hypot(f.b.w, f.b.d) / 2;
        this.fx.dust(f.b.x + Math.sin(a) * R, this.plan.level + f.h * (1 - e) * 0.5, f.b.z + Math.cos(a) * R, 2 + R / 10);
      }
      if (s >= 1) {
        this.group.remove(f.g);
        f.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        this.falling.splice(k, 1);
      }
    }
  }

  /** Called when the ground has been redrawn: walls are re-cut against it. */
  groundChanged() {
    (this.world.works?.walls || []).forEach((_, ri) => this.buildWall(ri));
  }

  update(dt, camera) {
    if (this.dirty.size) {
      for (const k of this.dirty) this.buildChunk(k);
      this.dirty.clear();
    }
    this.stepFalling(dt);
    this.stepProps(dt);
    this.stepDebris(dt);
    if (!this.plan) return;
    // Fire, in the burning buildings nearest the eye: flame out of the
    // windows and the roof, and the smoke of a town alight.
    const eye = camera?.position;
    const L = this.plan.level;
    const burning = [];
    for (const key in this.world.ruin?.b || {}) {
      const r = this.world.ruin.b[key];
      if (!r.f) continue;
      const b = this.plan.byId.get(Number(key));
      if (!b) continue;
      burning.push({ b, r, d: eye ? Math.hypot(b.x - eye.x, b.z - eye.z) : 0 });
    }
    burning.sort((a, b) => a.d - b.d);
    for (const { b, r } of burning.slice(0, 14)) {
      const h = standingHeight(b, r);
      this.flames?.at(`town${b.id}`, b.x, L + Math.max(2, h * 0.7), b.z, 0.55 + r.d * 0.4, Math.min(28, Math.max(b.w, b.d) * 0.8));
    }
    // And what has come down lately goes on smoking.
    this.smoulder -= dt;
    if (this.smoulder <= 0 && this.fx) {
      this.smoulder = 0.45;
      for (const [id, t] of this.recent) {
        const left = t - 0.45;
        if (left <= 0) { this.recent.delete(id); continue; }
        this.recent.set(id, left);
        const b = this.plan.byId.get(id);
        if (!b || (eye && Math.hypot(b.x - eye.x, b.z - eye.z) > 4000)) continue;
        const h = standingHeight(b, ruinOf(this.world, id));
        this.fx.wreckSmoke(b.x + (Math.random() - 0.5) * b.w * 0.5, L + h + 1, b.z + (Math.random() - 0.5) * b.d * 0.5, 0);
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}

