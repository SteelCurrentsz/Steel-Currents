// Her bridge, from the inside.
//
// The hull models are built to be looked at from outside: the bridge on every
// one of them is a block with its windows painted on. The human view puts a
// man on his feet aboard her, and a man who goes up to the bridge expects to
// be stood in a wheelhouse -- the wheel in front of him and the telegraphs
// either side of it, the windows looking out over her forecastle, the chart
// table in the corner and the voice pipes coming up through the deck -- and
// to be able to walk out of it onto the wing.
//
// So this builds one, for any ship, out of her own plan. Where it goes is
// found off the same overhead height map the searchlights are placed on: the
// level of her bridge platform, the forward face of her superstructure at the
// level under it, and how wide she is there. What is in it is what a ship of
// her navy carried: a US wheelhouse in light grey over red-brown linoleum, a
// British one in cream over teak, a German one with a small brass wheel, a
// Japanese one with a great spoked wooden wheel. A boat gets the conning tower
// instead: the attack periscope through the middle of it and the plot beside.
//
// Everything is to scale, in metres, because the man standing in it is: his
// eye is a metre and sixty off the deck, the deckhead is two and a half over
// it, a door is a man's height.

import * as THREE from '../../../vendor/three.module.js';
import { freeboardOf, bridgeStation } from '../../../shared/sim.js';
import { mergeStatic } from './merge.js';

/** How every navy painted and fitted her wheelhouse. */
const STYLES = {
  usa: {
    out: 0x6f7a80, paint: 0xbac2bb, deck: 0x5c3427, trim: 0x2b3035,
    wheel: 'steel', wheelR: 0.33, spokes: 6, clearView: false, radar: true, planks: false,
  },
  gbr: {
    out: 0x9aa3a6, paint: 0xd2cdb9, deck: 0x8c6b45, trim: 0x3a3a34,
    wheel: 'brass', wheelR: 0.4, spokes: 8, clearView: true, radar: true, planks: true,
  },
  ger: {
    out: 0x8e959a, paint: 0xc3c4b8, deck: 0x7a5e3e, trim: 0x2f3236,
    wheel: 'small', wheelR: 0.26, spokes: 6, clearView: true, radar: false, planks: true,
  },
  jpn: {
    out: 0x7d8285, paint: 0xaeae9f, deck: 0x8b6b48, trim: 0x2d2b27,
    wheel: 'wood', wheelR: 0.55, spokes: 8, clearView: false, radar: false, planks: true,
  },
  fra: {
    out: 0x8a9196, paint: 0xbcbfb5, deck: 0x6e5a48, trim: 0x30343a,
    wheel: 'brass', wheelR: 0.38, spokes: 8, clearView: true, radar: false, planks: true,
  },
};

/** The words on the telegraph's face, in her own language. */
const TELEGRAPH = {
  usa: ['FLANK', 'FULL', 'STD', '2/3', '1/3', 'STOP', '1/3', '2/3', 'FULL'],
  gbr: ['FULL', 'HALF', 'SLOW', 'STOP', 'SLOW', 'HALF', 'FULL'],
  ger: ['ÄUSSERST', 'GROSSE', 'HALBE', 'LANGSAM', 'STOP', 'LANGSAM', 'HALBE', 'VOLLE'],
  jpn: ['第五', '第四', '原速', '半速', '微速', '停止', '微速', '半速', '後進'],
  fra: ['TOUTE', 'EN AVANT', 'DEMI', 'LENTE', 'STOP', 'LENTE', 'DEMI', 'ARRIÈRE'],
};

const HEIGHT = 2.5;   // deck to deckhead
const WALL = 0.12;    // her plating, and the lining inside it
const SILL = 1.05;    // the bottom of the windows
const HEAD = 2.02;    // and the top
const BODY = 0.26;    // how close a man's eye comes to anything

// ---------------------------------------------------------- materials ----

const mats = new Map();
function mat(color, opts = {}) {
  const key = `${color}:${JSON.stringify(opts)}`;
  if (!mats.has(key)) {
    // A little light of their own, so a wheelhouse at night is the dim room
    // it was under its red night lighting and not a black box.
    mats.set(key, new THREE.MeshLambertMaterial({
      color, emissive: new THREE.Color(color).multiplyScalar(opts.glow ?? 0.16), ...opts.three,
    }));
  }
  return mats.get(key);
}

/** A picture drawn on a canvas, or nothing where there is no canvas (the tests). */
function canvasTex(w, h, draw) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A face with a picture on it, lit like everything else and glowing a little. */
function faceMat(tex, fallback = 0xe6e0cc, glow = 0.35) {
  if (!tex) return mat(fallback);
  return new THREE.MeshLambertMaterial({
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: glow,
  });
}

/** A round instrument's face: a ring of ticks, the words round it, a needle. */
function dialTex(words, { bg = '#ece5cf', ink = '#141414', arc = Math.PI * 1.5, title = '' } = {}) {
  return canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = bg;
    c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = ink; c.fillStyle = ink;
    c.lineWidth = 6;
    c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 6, 0, Math.PI * 2); c.stroke();
    const n = words.length;
    const a0 = -Math.PI / 2 - arc / 2;
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? -Math.PI / 2 : a0 + (arc * i) / (n - 1);
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(w / 2 + Math.cos(a) * 96, h / 2 + Math.sin(a) * 96);
      c.lineTo(w / 2 + Math.cos(a) * 116, h / 2 + Math.sin(a) * 116);
      c.stroke();
      if (words[i]) {
        c.save();
        c.translate(w / 2 + Math.cos(a) * 76, h / 2 + Math.sin(a) * 76);
        c.rotate(a + Math.PI / 2);
        c.font = `bold ${words[i].length > 5 ? 13 : 17}px sans-serif`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(words[i], 0, 0);
        c.restore();
      }
    }
    if (title) {
      c.font = 'bold 15px sans-serif'; c.textAlign = 'center';
      c.fillText(title, w / 2, h / 2 + 52);
    }
    c.beginPath(); c.arc(w / 2, h / 2, 9, 0, Math.PI * 2); c.fill();
  });
}

/** A compass card: the points and the degrees, black on white. */
function compassTex() {
  return canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#efe9d6';
    c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#111'; c.strokeStyle = '#111';
    for (let d = 0; d < 360; d += 5) {
      const a = (d * Math.PI) / 180 - Math.PI / 2;
      const r0 = d % 30 === 0 ? 96 : 108;
      c.lineWidth = d % 30 === 0 ? 3 : 1.5;
      c.beginPath();
      c.moveTo(w / 2 + Math.cos(a) * r0, h / 2 + Math.sin(a) * r0);
      c.lineTo(w / 2 + Math.cos(a) * 122, h / 2 + Math.sin(a) * 122);
      c.stroke();
      if (d % 30 === 0) {
        c.font = 'bold 14px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(d).padStart(3, '0'), w / 2 + Math.cos(a) * 82, h / 2 + Math.sin(a) * 82);
      }
    }
    c.font = 'bold 30px serif';
    for (const [t, a] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
      const r = ((a - 90) * Math.PI) / 180;
      c.fillText(t, w / 2 + Math.cos(r) * 50, h / 2 + Math.sin(r) * 50);
    }
    c.beginPath(); c.moveTo(w / 2, h / 2 - 34); c.lineTo(w / 2 - 8, h / 2); c.lineTo(w / 2 + 8, h / 2); c.fill();
  });
}

/** A chart on the table: soundings, a coast, the track laid off in pencil. */
function chartTex(seed = 1) {
  return canvasTex(512, 384, (c, w, h) => {
    c.fillStyle = '#e9e2c8'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(70,90,120,0.35)'; c.lineWidth = 1;
    for (let x = 0; x < w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 0; y < h; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    let r = seed * 9301 + 49297;
    const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    c.fillStyle = '#d4c69a'; c.strokeStyle = '#6b5a35'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, h * 0.15);
    for (let x = 0; x <= w * 0.45; x += 16) c.lineTo(x, h * (0.12 + rnd() * 0.12) + x * 0.2);
    c.lineTo(0, h * 0.6); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = 'rgba(40,60,90,0.6)'; c.font = '10px serif';
    for (let i = 0; i < 70; i++) c.fillText(String(Math.round(10 + rnd() * 90)), w * (0.3 + rnd() * 0.68), h * (0.1 + rnd() * 0.85));
    c.strokeStyle = '#2a2a2a'; c.lineWidth = 1.6; c.setLineDash([10, 5]);
    c.beginPath(); c.moveTo(w * 0.25, h * 0.92); c.lineTo(w * 0.55, h * 0.55); c.lineTo(w * 0.9, h * 0.38); c.stroke();
    c.setLineDash([]);
    c.beginPath(); c.arc(w * 0.82, h * 0.72, 46, 0, Math.PI * 2); c.stroke();
    c.font = 'bold 16px serif'; c.fillStyle = '#4a3a20';
    c.fillText('N', w * 0.82 - 5, h * 0.72 - 50);
  });
}

/** The green face of a radar repeater, with the coast painted on it. */
function scopeTex() {
  return canvasTex(256, 256, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#0d3a1e'); g.addColorStop(1, '#03130a');
    c.fillStyle = g; c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(80,255,140,0.35)'; c.lineWidth = 1;
    for (let r = 30; r < w / 2; r += 30) { c.beginPath(); c.arc(w / 2, h / 2, r, 0, Math.PI * 2); c.stroke(); }
    c.strokeStyle = 'rgba(120,255,170,0.9)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w * 0.86, h * 0.18); c.stroke();
    c.fillStyle = 'rgba(120,255,170,0.8)';
    for (const [x, y] of [[0.7, 0.3], [0.32, 0.62], [0.6, 0.72]]) { c.beginPath(); c.arc(w * x, h * y, 3, 0, Math.PI * 2); c.fill(); }
  });
}

// ---------------------------------------------------------- the pieces ----

/** A box stood on `y` (its bottom), not centred on it. */
function slab(g, m, w, h, d, x, y, z, ry = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y + h / 2, z);
  o.rotation.y = ry;
  g.add(o);
  return o;
}
function post(g, m, r, h, x, y, z, seg = 12, r2 = r) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, seg), m);
  o.position.set(x, y + h / 2, z);
  g.add(o);
  return o;
}
/** A flat round face looking aft (-z), at its centre. */
function disc(g, m, r, x, y, z, toward = -1, seg = 32) {
  const o = new THREE.Mesh(new THREE.CircleGeometry(r, seg), m);
  o.position.set(x, y, z);
  o.rotation.y = toward < 0 ? Math.PI : 0;
  g.add(o);
  return o;
}
/** A brass ring round a face. */
function bezel(g, m, r, x, y, z, rot = null) {
  const o = new THREE.Mesh(new THREE.TorusGeometry(r, Math.max(0.008, r * 0.08), 8, 28), m);
  o.position.set(x, y, z);
  if (rot) o.rotation.set(rot[0], rot[1], rot[2]);
  g.add(o);
  return o;
}
/** A rail from one point to another. */
function rail(g, m, r, a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), m);
  o.position.copy(a).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.add(o);
  return o;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** A round instrument on a bulkhead: its case, its face and its glass. */
function gauge(g, M, r, x, y, z, tex, toward = -1) {
  const caseM = M.trim;
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.08, r * 1.08, 0.06, 24), caseM);
  c.rotation.x = Math.PI / 2;
  c.position.set(x, y, z - toward * 0.03);
  g.add(c);
  disc(g, faceMat(tex), r, x, y, z + toward * 0.002, toward);
  bezel(g, M.brass, r, x, y, z + toward * 0.004);
}

/** The ship's wheel: rim, spokes, hub, and the handles of a wooden one. */
function wheel(style, M) {
  const w = new THREE.Group();
  const R = style.wheelR;
  const wood = style.wheel === 'wood';
  const rimM = wood ? M.wood : style.wheel === 'steel' ? M.steel : M.brass;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, wood ? 0.032 : 0.022, 10, 40), rimM);
  w.add(rim);
  if (wood) {
    // An inner brass band, and the turned handles standing out past the rim.
    w.add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.018, 8, 28), M.brass));
  }
  for (let i = 0; i < style.spokes; i++) {
    const a = (i / style.spokes) * Math.PI * 2;
    const len = wood ? R * 1.32 : R;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, len, 8), wood ? M.wood : rimM);
    s.position.set(Math.cos(a) * len / 2, Math.sin(a) * len / 2, 0);
    s.rotation.z = a - Math.PI / 2;
    w.add(s);
    if (wood) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.11, 10), M.wood);
      h.position.set(Math.cos(a) * (R * 1.32 + 0.04), Math.sin(a) * (R * 1.32 + 0.04), 0);
      h.rotation.z = a - Math.PI / 2;
      w.add(h);
    }
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 16), M.brass);
  hub.rotation.x = Math.PI / 2;
  w.add(hub);
  // The king spoke, marked so the helmsman knows where amidships is.
  const king = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.03), M.red);
  king.position.set(0, R + (wood ? 0.02 : 0.03), 0);
  w.add(king);
  w.userData.dynamic = true;
  return w;
}

/**
 * An engine-order telegraph: the column, the drum with the dial on both
 * faces, and the handle that is rung round it. `lever` turns about its
 * pivot; Bridge.set lays it on the notch she is rung up to.
 */
function telegraph(g, M, words, x, z) {
  const t = new THREE.Group();
  t.position.set(x, 0, z);
  post(t, M.steel, 0.07, 0.1, 0, 0, 0, 16, 0.14);       // its foot
  post(t, M.steel, 0.055, 0.9, 0, 0.1, 0, 14);          // the column
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.13, 32), M.brass);
  drum.rotation.x = Math.PI / 2;
  drum.position.set(0, 1.18, 0);
  t.add(drum);
  const tex = dialTex(words, { arc: Math.PI * 1.55, title: 'ENGINES' });
  disc(t, faceMat(tex), 0.19, 0, 1.18, -0.066, -1);
  disc(t, faceMat(tex), 0.19, 0, 1.18, 0.066, 1);
  bezel(t, M.brass, 0.195, 0, 1.18, -0.068);
  bezel(t, M.brass, 0.195, 0, 1.18, 0.068);
  // The handle: an arm either side of the drum joined by a grip.
  const lever = new THREE.Group();
  lever.position.set(0, 1.18, 0);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.012), M.brass);
    arm.position.set(0, 0.15, s * 0.085);
    lever.add(arm);
  }
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 10), M.black);
  grip.rotation.x = Math.PI / 2;
  grip.position.set(0, 0.3, 0);
  lever.add(grip);
  // And the pointer on the dial, which shows the reply from the engine room.
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.15, 0.004), M.red);
  needle.position.set(0, 0.075, -0.07);
  lever.add(needle);
  lever.userData.dynamic = true;
  t.add(lever);
  // The answering bell on the column.
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.brass);
  bell.position.set(0, 0.85, -0.07);
  bell.rotation.x = Math.PI;
  t.add(bell);
  g.add(t);
  return { group: t, lever, n: words.length };
}

/** A voice pipe: up out of the deck, round, and a bell mouth with its lid. */
function voicePipe(g, M, x, z, top) {
  post(g, M.brass, 0.032, top, x, 0, z, 10);
  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.034, 0.12, 16, 1, true), M.brass2);
  mouth.position.set(x, top + 0.06, z);
  g.add(mouth);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.012, 16), M.brass);
  lid.position.set(x, top + 0.13, z - 0.06);
  lid.rotation.x = -1.1;
  g.add(lid);
  bezel(g, M.brass, 0.075, x, top + 0.12, z, [Math.PI / 2, 0, 0]);
}

/** A ladder up a bulkhead to a hatch in the deckhead. */
function ladderUp(g, M, x, z, h, facing = 1) {
  for (const s of [-0.22, 0.22]) slab(g, M.steel, 0.05, h, 0.05, x + s, 0, z);
  for (let y = 0.3; y < h - 0.1; y += 0.3) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.44, 8), M.steel);
    r.rotation.z = Math.PI / 2;
    r.position.set(x, y, z + facing * 0.02);
    g.add(r);
  }
  // The scuttle in the deckhead it goes up to, and its coaming.
  slab(g, M.trim, 0.72, 0.08, 0.06, x, h - 0.08, z - 0.33);
  slab(g, M.trim, 0.72, 0.08, 0.06, x, h - 0.08, z + 0.33);
  slab(g, M.trim, 0.06, 0.08, 0.72, x - 0.36, h - 0.08, z);
  slab(g, M.trim, 0.06, 0.08, 0.72, x + 0.36, h - 0.08, z);
}

/** A watertight door, open and dogged back against the outside of her. */
function doorLeaf(g, M, x, z, side) {
  const d = new THREE.Group();
  slab(d, M.out, 0.05, 1.86, 0.78, 0, 0, 0);
  for (const y of [0.25, 0.93, 1.6]) {
    const dog = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.08, 8), M.steel);
    dog.rotation.z = Math.PI / 2;
    dog.position.set(side * 0.05, y, -0.34);
    d.add(dog);
  }
  slab(d, M.steel, 0.04, 0.04, 0.16, side * 0.045, 1.0, -0.28);
  // Its rubber gasket, round the edge.
  slab(d, M.black, 0.02, 1.8, 0.03, -side * 0.03, 0.03, 0.37);
  slab(d, M.black, 0.02, 1.8, 0.03, -side * 0.03, 0.03, -0.37);
  d.position.set(x, 0.12, z);
  g.add(d);
}

// ---------------------------------------------------------- where it goes --

/**
 * Where on her the wheelhouse is, in her own frame: the middle of its deck
 * (x = 0), the forward face of it, its width and depth, and the wings out
 * either side. Off her plan where there is one, off her class where not.
 */
export function bridgeSpot(cls, plan) {
  const L = cls.hull.length, B = cls.hull.beam;
  const sub = cls.type === 'SS';
  const carrier = cls.type === 'CV';
  const fb = freeboardOf(cls);
  const map = plan && plan.map;
  const lamps = (plan && plan.lamps) || [];
  const at = (x, z) => {
    if (!map) return NaN;
    const i = Math.round((((-x / map.halfX) + 1) / 2) * map.w - 0.5);
    const j = Math.round((((z / map.halfZ) + 1) / 2) * map.h - 0.5);
    if (i < 0 || j < 0 || i >= map.w || j >= map.h) return NaN;
    return map.heights[j * map.w + i];
  };
  // Her main deck, about where the bridge stands.
  const zGuess = bridgeStation(cls) * L / 2;
  let deck = fb + 1;
  if (map) {
    const all = [];
    for (const y of map.heights) if (Number.isFinite(y)) all.push(y);
    all.sort((a, b) => a - b);
    if (all.length) deck = all[Math.floor(all.length * 0.3)];
  }
  if (sub) {
    const tower = lamps[0];
    const z = tower ? tower.z - 0.6 : zGuess;
    // Up in her sail, under the open bridge on top of it: the attack
    // position, clear of the water when she is on the surface.
    const top = tower ? tower.y - 0.7 : deck + 4.5;
    return {
      kind: 'tower', z, floor: Math.max(deck + 0.6, top - 2.25 - 0.45), width: Math.max(2.3, Math.min(3.2, B * 0.42)),
      depth: Math.max(3.6, Math.min(5, L * 0.06)), wing: 0, front: z + 2,
    };
  }
  const pair = lamps.filter((l) => /^(Bridge|Island)/.test(l.name));
  const platform = pair.length ? Math.min(...pair.map((l) => l.y)) - 0.7 : deck + 6 + 4 * (cls.hull.superstructure || 1);
  const zl = pair.length ? pair[0].z : zGuess;
  const span = pair.length ? Math.max(...pair.map((l) => Math.abs(l.x))) : B * 0.3;
  // The wheelhouse is the deck under her open bridge, with the wings on its
  // level. Not so low that it is down among her gunhouses.
  let floor = platform - (HEIGHT + 0.25);
  if (floor < deck + 2.2) floor = Math.max(deck + 2.2, platform);
  // The forward face of her at a man's chest on that deck.
  let front = zl + 2;
  if (map) {
    let z = zl;
    for (; z < zl + 18; z += 0.2) {
      const y = at(0, z);
      if (!(y >= floor + 1.2)) break;
    }
    front = Math.max(zl + 1.2, z - 0.15);
  }
  const depth = carrier ? 4.2 : Math.max(4.2, Math.min(7, L * 0.026));
  // A carrier's island is on her starboard edge: everything about it is
  // offset that way.
  const x0 = carrier && pair.length ? (pair[0].x + pair[pair.length - 1].x) / 2 : 0;
  let width = Math.min(B * 0.62, carrier ? 7 : 15);
  if (map) {
    // As wide as she is there, short of her edges.
    let w = 0;
    for (let x = 0; x < B; x += 0.2) {
      const zc = front - depth / 2;
      if (!(at(x0 + x, zc) >= floor + 1) && !(at(x0 - x, zc) >= floor + 1)) break;
      w = 2 * x;
    }
    if (w > 3) width = Math.min(width, w - 0.3);
  }
  width = Math.max(carrier ? 3.6 : 4.4, width);
  const reach = pair.length ? Math.max(...pair.map((l) => Math.abs(l.x - x0))) : span;
  const wing = Math.max(1.6, Math.min(4.5, reach - width / 2 + 0.6));
  return { kind: 'house', x0, z: front - depth / 2, front, floor, width, depth, wing };
}

// ---------------------------------------------------------- the room ----

/**
 * Build her wheelhouse. Returns { group, walk, spot, set(state), clipBox,
 * stand } -- the model, in her frame and hidden until it is wanted; the map
 * a man walks in it on; where the helmsman stands; and the box of her own
 * model that has to be cut away round it for it to be seen.
 */
export function buildBridge(cls, plan) {
  const spot = bridgeSpot(cls, plan);
  const nation = STYLES[cls.nation] ? cls.nation : 'usa';
  const style = STYLES[nation];
  const M = {
    out: mat(style.out), paint: mat(style.paint), deck: mat(style.deck, { glow: 0.12 }),
    trim: mat(style.trim), steel: mat(0x4b5258), brass: mat(0xb38f45, { glow: 0.22 }),
    black: mat(0x16181b), wood: mat(0x6a4426, { glow: 0.14 }), red: mat(0xa22b22, { glow: 0.3 }),
    leather: mat(0x3e2a1c), canvas: mat(0xb9b29a), grate: mat(0x5b4a35),
    glass: new THREE.MeshLambertMaterial({
      color: 0xa9cbd8, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide,
    }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xffe2b0 }),
    // Open-ended things -- a bell mouth, a lamp shade, a scope's hood -- are
    // seen from inside as well as out.
    brass2: mat(0xb38f45, { glow: 0.22, three: { side: THREE.DoubleSide } }),
    trim2: mat(style.trim, { three: { side: THREE.DoubleSide } }),
    black2: mat(0x16181b, { three: { side: THREE.DoubleSide } }),
    nightLamp: new THREE.MeshBasicMaterial({ color: 0xff4a3a }),
  };
  const g = new THREE.Group();
  g.name = 'bridge-room';
  g.position.set(spot.x0 || 0, spot.floor, spot.z);
  const parts = new THREE.Group();
  g.add(parts);
  const built = spot.kind === 'tower'
    ? buildTower(parts, M, style, nation, spot)
    : buildHouse(parts, M, style, nation, spot, cls);
  // Welded into one mesh a colour -- except anything with a picture on it, a
  // dial face or the chart, which the weld would lose the mapping of.
  parts.traverse((o) => { if (o.isMesh && o.material && o.material.map) o.userData.dynamic = true; });
  mergeStatic(parts);
  g.visible = false;

  const walk = walkMap(spot, built.blocks, built.open);
  const W = spot.width / 2 + (spot.wing || 0);
  const clipBox = new THREE.Box3(
    new THREE.Vector3((spot.x0 || 0) - W - 0.1, spot.floor - 0.05, spot.z - spot.depth / 2 - 0.2),
    new THREE.Vector3((spot.x0 || 0) + W + 0.1, spot.floor + HEIGHT + 0.3, spot.z + spot.depth / 2 + 0.25),
  );
  // The wheelhouse's own model is in her frame, offset to its place.
  const stand = { x: (spot.x0 || 0) + built.stand.x, z: spot.z + built.stand.z };
  return {
    group: g, walk, spot, clipBox, stand,
    // How far along her the wing doors are, in her frame; none in a conning tower.
    door: built.door === undefined ? null : spot.z + built.door,
    /** Where in it a point in her frame is: 'house', 'port', 'starboard'. */
    where(x) {
      const lx = x - (spot.x0 || 0);
      if (Math.abs(lx) <= spot.width / 2) return 'house';
      return lx > 0 ? 'port' : 'starboard';
    },
    /**
     * The wheel over to her rudder, the telegraphs on what she is rung up to
     * (-1 astern .. 1 full), and the compass on her heading.
     */
    set({ rudder = 0, throttle = 0, heading = 0 } = {}) {
      // The gyro repeater's card turns under its lubber line as she does.
      if (built.card) built.card.rotation.z = -heading;
      if (built.wheel) built.wheel.rotation.z = -rudder * 4.5;
      // Ahead is over to one side of the dial, astern the other.
      for (const t of built.telegraphs) t.lever.rotation.z = -throttle * 1.25;
      if (built.periscope) built.periscope.rotation.y += 0.002;
    },
  };
}

function buildHouse(g, M, style, nation, spot, cls) {
  const W = spot.width, D = spot.depth, H = HEIGHT;
  const hw = W / 2, hd = D / 2;
  const blocks = [];   // [x0, z0, x1, z1] where a man cannot stand
  const open = [];     // [x0, z0, x1, z1, y] where he can, beyond the room
  const block = (x, z, w, d) => blocks.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2]);

  // --- the deck --------------------------------------------------------
  slab(g, M.out, W + 0.02, 0.18, D + 0.02, 0, -0.18, 0);
  if (style.planks) {
    // Laid fore and aft, with the caulking between them.
    const n = Math.round(W / 0.14);
    for (let i = 0; i < n; i++) {
      slab(g, i % 2 ? M.deck : mat(new THREE.Color(style.deck).multiplyScalar(0.92).getHex(), { glow: 0.12 }),
        W / n - 0.008, 0.012, D - 2 * WALL, -hw + (i + 0.5) * (W / n), 0, 0);
    }
  } else {
    slab(g, M.deck, W - 2 * WALL, 0.012, D - 2 * WALL, 0, 0, 0);
    // The linoleum's seams.
    for (let x = -hw + 1.2; x < hw - 0.5; x += 1.2) slab(g, M.trim, 0.008, 0.014, D - 2 * WALL, x, 0, 0);
  }

  // --- the forward bulkhead and its windows ------------------------------
  const zf = hd - WALL / 2;
  slab(g, M.out, W, SILL, WALL, 0, 0, zf);
  slab(g, M.out, W, H - HEAD, WALL, 0, HEAD, zf);
  slab(g, M.paint, W - 2 * WALL, SILL - 0.05, 0.02, 0, 0.05, zf - WALL / 2 - 0.01);
  slab(g, M.paint, W - 2 * WALL, H - HEAD, 0.02, 0, HEAD, zf - WALL / 2 - 0.01);
  const nWin = Math.max(3, Math.round(W / 1.05));
  const mull = 0.11;
  const paneW = (W - (nWin + 1) * mull) / nWin;
  for (let i = 0; i <= nWin; i++) {
    const x = -hw + mull / 2 + i * (paneW + mull);
    slab(g, M.out, mull, HEAD - SILL, WALL, x, SILL, zf);
  }
  for (let i = 0; i < nWin; i++) {
    const x = -hw + mull + paneW / 2 + i * (paneW + mull);
    const pane = slab(g, M.glass, paneW, HEAD - SILL, 0.01, x, SILL, zf);
    pane.renderOrder = 2;
    // Each frame's brass trim inside.
    slab(g, M.trim, paneW, 0.03, 0.03, x, SILL, zf - 0.07);
    slab(g, M.trim, paneW, 0.03, 0.03, x, HEAD - 0.03, zf - 0.07);
  }
  // The clear-view screen on the middle pane: a disc of glass spun fast
  // enough that spray cannot stay on it.
  if (style.clearView) {
    const x = -hw + mull + paneW / 2 + Math.floor(nWin / 2) * (paneW + mull);
    const r = Math.min(0.28, paneW * 0.4);
    const ring = bezel(g, M.trim, r, x, (SILL + HEAD) / 2, zf - 0.06);
    ring.scale.z = 1.6;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 14), M.trim);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(x, (SILL + HEAD) / 2, zf - 0.08);
    g.add(hub);
  }
  // The sill shelf under the windows, with what the officer of the watch
  // keeps on it.
  slab(g, M.wood, W - 2 * WALL, 0.035, 0.28, 0, SILL - 0.035, zf - WALL / 2 - 0.14);
  const binoc = (x) => {
    for (const s of [-0.035, 0.035]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.16, 12), M.black);
      b.rotation.x = Math.PI / 2;
      b.position.set(x + s, SILL + 0.03, zf - 0.22);
      g.add(b);
    }
  };
  binoc(hw * 0.45);
  binoc(-hw * 0.6);

  // Instruments over the windows, looking aft: the rudder angle indicator in
  // the middle, the clock, the revolutions and the clinometer.
  const yI = HEAD + (H - HEAD) * 0.48;
  const iz = zf - WALL / 2 - 0.03;
  const rIn = Math.min(0.15, (H - HEAD) * 0.4);
  gauge(g, M, rIn, 0, yI, iz, dialTex(['35', '20', '10', '0', '10', '20', '35'], { arc: Math.PI * 0.9, title: 'RUDDER' }));
  gauge(g, M, rIn * 0.85, -hw * 0.35, yI, iz, dialTex(['12', '3', '6', '9'], { arc: Math.PI * 1.5, title: '' }));
  gauge(g, M, rIn * 0.85, hw * 0.35, yI, iz, dialTex(['0', '50', '100', '150', '200', '250'], { arc: Math.PI * 1.4, title: 'R.P.M.' }));
  gauge(g, M, rIn * 0.8, hw * 0.7, yI, iz, dialTex(['40', '20', '0', '20', '40'], { arc: Math.PI * 0.8, title: 'HEEL' }));
  gauge(g, M, rIn * 0.8, -hw * 0.7, yI, iz, dialTex(['0', '10', '20', '30', '40'], { arc: Math.PI * 1.3, title: 'KNOTS' }));

  // --- the sides: windows forward, the door to the wing aft ---------------
  // Laid out about the athwartships passage between the two wing doors,
  // which is kept clear: the conning position forward of it, the chart
  // table, the chart house door, the ladder and the radar aft of it.
  const doorW = 0.82;
  const AFT = 1.1;   // the depth of the space aft of the passage
  const doorZ = -hd + WALL + AFT + doorW / 2;
  for (const s of [1, -1]) {
    const x = s * (hw - WALL / 2);
    const xi = s * (hw - WALL - 0.01);
    // Aft of the door: plain plating.
    const aftLen = doorZ - doorW / 2 + hd;
    slab(g, M.out, WALL, H, aftLen, x, 0, -hd + aftLen / 2);
    slab(g, M.paint, 0.02, H - 0.05, aftLen - WALL, xi, 0.05, -hd + aftLen / 2 + WALL / 2);
    // Over the door, and its frame and coaming.
    slab(g, M.out, WALL, H - 1.98, doorW, x, 1.98, doorZ);
    slab(g, M.trim, WALL + 0.06, 0.14, doorW, x, 0, doorZ);
    slab(g, M.trim, WALL + 0.08, 1.98, 0.06, x, 0, doorZ - doorW / 2 - 0.03);
    slab(g, M.trim, WALL + 0.08, 1.98, 0.06, x, 0, doorZ + doorW / 2 + 0.03);
    doorLeaf(g, M, s * (hw + 0.05), doorZ - doorW / 2 - 0.42, s);
    // Forward of the door: plating under the sill and over the head, windows between.
    const z0 = doorZ + doorW / 2, len = hd - z0;
    slab(g, M.out, WALL, SILL, len, x, 0, z0 + len / 2);
    slab(g, M.out, WALL, H - HEAD, len, x, HEAD, z0 + len / 2);
    slab(g, M.paint, 0.02, SILL - 0.05, len - WALL, xi, 0.05, z0 + len / 2 - WALL / 2);
    const n = Math.max(1, Math.round(len / 1.0));
    const pw = (len - (n + 1) * mull) / n;
    for (let i = 0; i <= n; i++) slab(g, M.out, WALL, HEAD - SILL, mull, x, SILL, z0 + mull / 2 + i * (pw + mull));
    for (let i = 0; i < n; i++) {
      const zc = z0 + mull + pw / 2 + i * (pw + mull);
      slab(g, M.glass, 0.01, HEAD - SILL, pw, x, SILL, zc).renderOrder = 2;
    }
    slab(g, M.wood, 0.26, 0.035, len - WALL, s * (hw - WALL - 0.13), SILL - 0.035, z0 + len / 2 - WALL / 2);
    // A sound-powered telephone, its handset in its cradle, and the alarm push.
    const px = s * (hw - WALL - 0.06);
    slab(g, M.trim, 0.1, 0.32, 0.22, px, 1.25, doorZ - doorW / 2 - 0.35);
    slab(g, M.black, 0.06, 0.05, 0.2, px - s * 0.06, 1.47, doorZ - doorW / 2 - 0.35);
    slab(g, M.red, 0.04, 0.1, 0.1, px, 1.7, doorZ - doorW / 2 - 0.7);
  }

  // --- the after bulkhead: the chart house door, the ladder, the clock ---
  const zb = -hd + WALL / 2;
  const cw = Math.min(1.25, W * 0.24), cd = 0.82;
  const chartX = hw - WALL - cw / 2 - 0.05;
  const lx = -hw + 0.55;
  const radar = style.radar && W > 5;
  // The chart house door between the ladder (and the radar beside it) and the chart table.
  const dx = ((radar ? lx + 1.35 : lx + 0.3) + (chartX - cw / 2)) / 2;
  slab(g, M.out, W, H, WALL, 0, 0, zb);
  slab(g, M.paint, W - 2 * WALL, H - 0.05, 0.02, 0, 0.05, zb + WALL / 2 + 0.01);
  // The door to the chart house, shut.
  // A shade darker than the bulkhead round it, as a door is that gets
  // handled forty times a watch.
  const doorM = mat(new THREE.Color(style.paint).multiplyScalar(0.72).getHex());
  slab(g, doorM, 0.78, 1.86, 0.04, dx, 0.12, zb + WALL / 2 + 0.03);
  for (const s of [-1, 1]) slab(g, M.trim, 0.05, 1.9, 0.05, dx + s * 0.42, 0.1, zb + WALL / 2 + 0.03);
  slab(g, M.trim, 0.78, 0.14, 0.06, dx, 0, zb + WALL / 2 + 0.04);
  slab(g, M.trim, 0.9, 0.06, 0.05, dx, 1.98, zb + WALL / 2 + 0.03);
  for (const y of [0.35, 1.0, 1.65]) {
    const dog = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 8), M.steel);
    dog.rotation.x = Math.PI / 2;
    dog.position.set(dx + 0.33, y, zb + WALL / 2 + 0.08);
    g.add(dog);
  }
  gauge(g, M, 0.11, dx - 0.2, 2.2, zb + WALL / 2 + 0.03, dialTex(['12', '3', '6', '9']), 1);
  gauge(g, M, 0.09, dx + 0.2, 2.2, zb + WALL / 2 + 0.03, dialTex(['RAIN', 'CHANGE', 'FAIR'], { arc: Math.PI * 1.2, title: 'BAROMETER' }), 1);
  // A fire extinguisher and the first aid locker by the door.
  post(g, M.red, 0.07, 0.55, dx - 0.55, 0.3, zb + WALL / 2 + 0.1, 14);
  slab(g, M.paint, 0.3, 0.36, 0.12, dx + 0.6, 1.25, zb + WALL / 2 + 0.06);
  slab(g, M.red, 0.12, 0.03, 0.005, dx + 0.6, 1.45, zb + WALL / 2 + 0.125);
  // The ladder to the open bridge over the deckhead, starboard aft.
  ladderUp(g, M, lx, -hd + WALL + 0.07, H, 1);
  block(lx, -hd + 0.3, 0.7, 0.45);

  // --- the deckhead: beams, the cable runs, the lights ---------------------
  slab(g, M.out, W + 0.02, 0.2, D + 0.02, 0, H, 0);
  slab(g, M.paint, W - 2 * WALL, 0.02, D - 2 * WALL, 0, H - 0.02, 0);
  for (let z = -hd + 0.5; z < hd - 0.3; z += 0.55) slab(g, M.paint, W - 2 * WALL, 0.14, 0.07, 0, H - 0.16, z);
  for (const x of [-hw * 0.55, hw * 0.55]) {
    slab(g, M.steel, 0.16, 0.03, D - 2 * WALL, x, H - 0.22, 0);
    for (let k = 0; k < 4; k++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, D - 2 * WALL, 6), M.black);
      c.rotation.x = Math.PI / 2;
      c.position.set(x - 0.05 + k * 0.033, H - 0.2, 0);
      g.add(c);
    }
  }
  for (const [x, z] of [[-hw * 0.3, hd * 0.3], [hw * 0.3, hd * 0.3], [0, -hd * 0.45]]) {
    post(g, M.trim, 0.13, 0.05, x, H - 0.24, z, 18);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.lamp);
    glow.position.set(x, H - 0.24, z);
    g.add(glow);
    // The red night light beside each, so a man keeps his eyes for the dark.
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 6), M.nightLamp);
    red.position.set(x + 0.22, H - 0.2, z);
    g.add(red);
  }
  // The voice pipe run overhead, out to the forward pipes.
  for (let k = 0; k < 3; k++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, D - 0.8, 10), M.brass);
    p.rotation.x = Math.PI / 2;
    p.position.set(-hw * 0.18 - k * 0.09, H - 0.3, -0.2);
    g.add(p);
  }

  // --- the conning position ---------------------------------------------
  const zs = hd - 1.45;
  // The steering stand: its column, its head, and the gyro repeater on it.
  post(g, M.trim, 0.2, 0.08, 0, 0, zs, 18, 0.26);
  slab(g, M.trim, 0.34, 0.95, 0.3, 0, 0.08, zs);
  slab(g, M.trim, 0.42, 0.26, 0.38, 0, 1.03, zs);
  slab(g, M.steel, 0.3, 0.02, 0.005, 0, 0.6, zs - 0.153);  // its maker's plate
  const bowl = post(g, M.brass, 0.17, 0.12, 0, 1.29, zs + 0.02, 24, 0.15);
  bowl.rotation.x = -0.35;
  const card = new THREE.Mesh(new THREE.CircleGeometry(0.15, 32), faceMat(compassTex(), 0xe8e2cc, 0.45));
  card.rotation.x = -Math.PI / 2 - 0.35;
  card.position.set(0, 1.43, zs - 0.03);
  g.add(card);
  card.userData.dynamic = true;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), M.brass);
  hood.position.set(0, 1.4, zs + 0.06);
  hood.rotation.x = 0.9;
  g.add(hood);
  // The wheel, on its shaft out of the stand, facing the helmsman.
  const wh = wheel(style, M);
  const wheelY = 1.0 + (style.wheel === 'wood' ? 0.1 : 0);
  wh.position.set(0, wheelY, zs - 0.27);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 10), M.steel);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.set(0, wheelY, zs - 0.2);
  g.add(shaft);
  g.add(wh);
  block(0, zs, 0.6, 0.6);
  // The helmsman's grating, on the deck behind the wheel.
  for (let k = 0; k < 6; k++) slab(g, M.grate, 0.8, 0.05, 0.06, 0, 0, zs - 0.55 - k * 0.1);
  for (const x of [-0.37, 0, 0.37]) slab(g, M.grate, 0.05, 0.05, 0.6, x, 0, zs - 0.8);
  open.push([-0.4, zs - 1.1, 0.4, zs - 0.5, 0.05]);

  // Telegraphs either side of him -- one a shaft on a ship with two, and two
  // a side on one with four, as the big ships had.
  const words = TELEGRAPH[nation];
  const telegraphs = [];
  const shafts = cls.shafts || (cls.type === 'DD' ? 2 : 4);
  const tx = Math.min(1.0, hw - 0.6);
  telegraphs.push(telegraph(g, M, words, tx, zs - 0.05));
  telegraphs.push(telegraph(g, M, words, -tx, zs - 0.05));
  block(tx, zs - 0.05, 0.42, 0.42);
  block(-tx, zs - 0.05, 0.42, 0.42);
  if (shafts >= 4 && hw > 2.6) {
    telegraphs.push(telegraph(g, M, words, tx + 0.48, zs - 0.05));
    telegraphs.push(telegraph(g, M, words, -tx - 0.48, zs - 0.05));
    block(tx + 0.48, zs - 0.05, 0.42, 0.42);
    block(-tx - 0.48, zs - 0.05, 0.42, 0.42);
  }
  // The revolution telegraph, a small dial on its own column beside the port one.
  post(g, M.steel, 0.04, 1.05, tx + (shafts >= 4 && hw > 2.6 ? 0.95 : 0.45), 0, zs + 0.2, 10);
  gauge(g, M, 0.08, tx + (shafts >= 4 && hw > 2.6 ? 0.95 : 0.45), 1.15, zs + 0.17,
    dialTex(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], { arc: Math.PI * 1.8 }));

  // The voice pipes, up through the deck forward of the stand: to the
  // plot, the director, the engine room, the wheel below, the captain's
  // sea cabin.
  for (let k = 0; k < 5; k++) voicePipe(g, M, -0.55 + k * 0.13, hd - WALL - 0.22, 1.22 + (k % 2) * 0.08);
  block(-0.29, hd - WALL - 0.22, 0.85, 0.3);
  // And the captain's chair, to starboard of them, where he can see past the
  // helmsman to the bow.
  {
    const cx = -Math.min(hw - 0.75, 1.9), cz = hd - 0.95;
    post(g, M.steel, 0.05, 0.85, cx, 0, cz, 12);
    post(g, M.steel, 0.22, 0.04, cx, 0, cz, 18);
    const ring = bezel(g, M.steel, 0.2, cx, 0.42, cz, [Math.PI / 2, 0, 0]);
    ring.scale.set(1, 1, 1);
    slab(g, M.leather, 0.5, 0.1, 0.46, cx, 0.85, cz);
    slab(g, M.leather, 0.5, 0.5, 0.08, cx, 0.95, cz - 0.22);
    for (const s of [-1, 1]) slab(g, M.steel, 0.04, 0.04, 0.42, cx + s * 0.26, 1.15, cz);
    block(cx, cz, 0.6, 0.6);
  }

  // --- the chart table, port aft ----------------------------------------
  {
    const cx = chartX, cz = -hd + WALL + cd / 2 + 0.04;
    slab(g, M.wood, cw, 0.88, cd, cx, 0, cz);
    for (let k = 0; k < 3; k++) {
      slab(g, M.trim, cw - 0.1, 0.008, 0.005, cx, 0.25 + k * 0.24, cz + cd / 2 + 0.002);
      slab(g, M.brass, 0.1, 0.02, 0.02, cx, 0.36 + k * 0.24, cz + cd / 2 + 0.01);
    }
    slab(g, M.wood, cw + 0.06, 0.04, cd + 0.06, cx, 0.88, cz);
    const chart = new THREE.Mesh(new THREE.PlaneGeometry(cw - 0.08, cd - 0.08), faceMat(chartTex(cls.hull.length | 0), 0xe6dfc2, 0.3));
    chart.rotation.x = -Math.PI / 2;
    chart.position.set(cx, 0.925, cz);
    g.add(chart);
    // Its fiddle rail, the parallel rule, the dividers, a pencil.
    slab(g, M.wood, cw + 0.06, 0.04, 0.02, cx, 0.92, cz - cd / 2 - 0.02);
    slab(g, M.black, 0.45, 0.012, 0.05, cx - 0.1, 0.925, cz + 0.1, 0.4);
    slab(g, M.black, 0.45, 0.012, 0.05, cx - 0.1, 0.925, cz + 0.17, 0.4);
    for (const r of [-0.25, 0.25]) slab(g, M.brass, 0.17, 0.008, 0.012, cx + 0.15, 0.93, cz - 0.15, r);
    slab(g, M.red, 0.15, 0.01, 0.01, cx - 0.2, 0.93, cz - 0.22, 1.2);
    // The chart lamp on its gooseneck, hooded so it lights the chart and
    // nothing else.
    post(g, M.black, 0.015, 0.5, cx + cw / 2 - 0.08, 0.92, cz - cd / 2 + 0.08, 8);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.1, 14, 1, true), M.trim2);
    shade.position.set(cx + cw / 2 - 0.2, 1.4, cz - cd / 2 + 0.2);
    g.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 6), M.nightLamp);
    bulb.position.set(cx + cw / 2 - 0.2, 1.36, cz - cd / 2 + 0.2);
    g.add(bulb);
    // The chronometer in its box beside it.
    slab(g, M.wood, 0.24, 0.16, 0.24, cx - cw / 2 + 0.17, 0.92, cz - cd / 2 + 0.17);
    block(cx, cz, cw + 0.1, cd + 0.1);
  }

  // --- the radar repeater, where she had one ----------------------------
  if (radar) {
    const rx = lx + 0.95, rz = -hd + WALL + 0.3;
    slab(g, M.trim, 0.55, 1.05, 0.55, rx, 0, rz);
    const hoodR = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.3, 20, 1, true), M.black2);
    hoodR.position.set(rx, 1.2, rz);
    g.add(hoodR);
    const ppi = new THREE.Mesh(new THREE.CircleGeometry(0.17, 32), faceMat(scopeTex(), 0x1b6b36, 0.9));
    ppi.rotation.x = -Math.PI / 2;
    ppi.position.set(rx, 1.06, rz);
    g.add(ppi);
    for (let k = 0; k < 4; k++) post(g, M.black, 0.018, 0.03, rx - 0.15 + k * 0.1, 1.0, rz + 0.24, 10).rotation.x = Math.PI / 2;
    block(rx, rz, 0.6, 0.6);
  }

  // --- the wings ---------------------------------------------------------
  const wingL = spot.wing || 0;
  const wz0 = -hd, wz1 = Math.min(hd, -hd + Math.max(2.4, D * 0.75));
  if (wingL > 0.5) {
    for (const s of [1, -1]) {
      const x0 = s * hw, x1 = s * (hw + wingL), xc = (x0 + x1) / 2;
      slab(g, M.out, wingL, 0.14, wz1 - wz0, xc, -0.14, (wz0 + wz1) / 2);
      if (style.planks) {
        for (let z = wz0 + 0.07; z < wz1 - 0.05; z += 0.14) slab(g, M.deck, wingL - 0.04, 0.012, 0.12, xc, 0, z);
      }
      // A bulwark with a canvas dodger forward, rails round the rest.
      slab(g, M.out, wingL, 1.05, 0.06, xc, 0, wz1 - 0.03);
      slab(g, M.canvas, wingL, 0.3, 0.02, xc, 1.05, wz1 - 0.04);
      const edge = x1 - s * 0.03;
      for (let z = wz0 + 0.05; z <= wz1 - 0.05; z += 0.9) post(g, M.out, 0.025, 1.1, edge, 0, z, 8);
      for (const y of [0.5, 1.08]) rail(g, M.out, 0.022, V(edge, y, wz0 + 0.03), V(edge, y, wz1 - 0.05));
      for (let x = Math.min(x0, x1) + 0.4; x < Math.max(x0, x1) - 0.1; x += 0.9) post(g, M.out, 0.025, 1.1, x, 0, wz0 + 0.03, 8);
      for (const y of [0.5, 1.08]) rail(g, M.out, 0.022, V(x0, y, wz0 + 0.03), V(edge, y, wz0 + 0.03));
      // Its pelorus, for taking bearings: a stand, a card, and the sight vanes.
      const px = s * (hw + wingL - 0.55), pz = wz1 - 0.55;
      post(g, M.steel, 0.06, 1.1, px, 0, pz, 12);
      const card2 = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), faceMat(compassTex(), 0xe8e2cc, 0.3));
      card2.rotation.x = -Math.PI / 2;
      card2.position.set(px, 1.13, pz);
      g.add(card2);
      bezel(g, M.brass, 0.165, px, 1.13, pz, [Math.PI / 2, 0, 0]);
      slab(g, M.brass, 0.015, 0.12, 0.02, px, 1.13, pz + 0.17);
      slab(g, M.brass, 0.015, 0.06, 0.02, px, 1.13, pz - 0.17);
      block(px, pz, 0.35, 0.35);
      // A signalling lamp on its bracket, aft on the wing.
      const sx = s * (hw + wingL * 0.5);
      post(g, M.steel, 0.03, 1.05, sx, 0, wz0 + 0.3, 8);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.26, 18), M.trim);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(sx, 1.18, wz0 + 0.3);
      g.add(lamp);
      disc(g, M.glass, 0.1, sx, 1.18, wz0 + 0.44, 1);
      block(sx, wz0 + 0.3, 0.3, 0.3);
      open.push([Math.min(x0, x1) - 0.05, wz0 + 0.06, Math.max(x0, x1) - 0.06, wz1 - 0.06, 0]);
    }
    // Out through the doors.
    open.push([-hw - 0.2, doorZ - doorW / 2 + 0.08, hw + 0.2, doorZ + doorW / 2 - 0.08, 0]);
  }
  return { blocks, open, wheel: wh, telegraphs, card, door: doorZ, stand: { x: 0, z: zs - 0.85 } };
}

/** A boat's conning tower: the attack periscope, the plot, the helm and the hatch. */
function buildTower(g, M, style, nation, spot) {
  const W = spot.width, D = spot.depth, H = 2.25;
  const hw = W / 2, hd = D / 2;
  const blocks = [];
  const block = (x, z, w, d) => blocks.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2]);
  const hull = mat(0x5d6468);
  slab(g, hull, W, 0.16, D, 0, -0.16, 0);
  slab(g, M.grate, W - 0.3, 0.02, D - 0.3, 0, 0, 0);
  // A pressure hull is round: drawn as plating in strakes with the frames
  // inside it. The viewports -- thick glass in heavy rings, forward and either
  // side -- are holes in it a man can put his eye to.
  const P0 = 1.43, P1 = 1.67, PW = 0.12;   // the band the ports are cut in, and half a port
  const pz = hd * 0.3;
  for (const s of [1, -1]) {
    const x = s * (hw - WALL / 2);
    slab(g, hull, WALL, P0, D, x, 0, 0);
    slab(g, hull, WALL, H - P1, D, x, P1, 0);
    slab(g, hull, WALL, P1 - P0, pz - PW + hd, x, P0, (-hd + pz - PW) / 2);
    slab(g, hull, WALL, P1 - P0, hd - pz - PW, x, P0, (pz + PW + hd) / 2);
    for (let z = -hd + 0.4; z < hd; z += 0.5) {
      if (Math.abs(z - pz) < 0.2) continue;
      slab(g, M.paint, 0.08, H - 0.1, 0.05, s * (hw - WALL - 0.04), 0.05, z);
    }
  }
  const zf = hd - WALL / 2;
  slab(g, hull, W, P0, WALL, 0, 0, zf);
  slab(g, hull, W, H - P1, WALL, 0, P1, zf);
  for (const [a, b] of [[-hw, -0.45 - PW], [-0.45 + PW, 0.45 - PW], [0.45 + PW, hw]]) {
    slab(g, hull, b - a, P1 - P0, WALL, (a + b) / 2, P0, zf);
  }
  slab(g, hull, W, H, WALL, 0, 0, -hd + WALL / 2);
  slab(g, hull, W, 0.18, D, 0, H, 0);
  const pc = (P0 + P1) / 2;
  for (const [x, z, ry] of [[-0.45, hd - WALL - 0.02, 0], [0.45, hd - WALL - 0.02, 0],
    [hw - WALL - 0.02, pz, Math.PI / 2], [-hw + WALL + 0.02, pz, Math.PI / 2]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.035, 10, 24), M.brass);
    ring.position.set(x, pc, z);
    ring.rotation.y = ry;
    g.add(ring);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), M.glass);
    glass.position.set(x, pc, z);
    glass.rotation.y = ry;
    g.add(glass);
    // The deadlight that swings down over it, hinged open.
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 20), M.brass);
    lid.position.set(x + (ry ? 0 : 0), pc + 0.2, z + (ry ? 0 : -0.08));
    if (ry) lid.position.x += x > 0 ? -0.08 : 0.08;
    lid.rotation.set(ry ? 0 : 0.3, 0, ry ? (x > 0 ? 0.3 : -0.3) : 0);
    if (!ry) lid.rotation.x = Math.PI / 2 - 0.3;
    else lid.rotation.z = (x > 0 ? 1 : -1) * (Math.PI / 2 - 0.3);
    g.add(lid);
  }
  // The attack periscope, up through the middle with its training handles.
  const peri = new THREE.Group();
  peri.position.set(0, 0, -0.2);
  post(peri, M.steel, 0.1, H, 0, 0, 0, 18);
  slab(peri, M.trim, 0.3, 0.28, 0.32, 0, 1.38, -0.15);
  post(peri, M.black, 0.04, 0.06, 0, 1.5, -0.33, 12).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.28, 10), M.black);
    h.rotation.z = Math.PI / 2;
    h.position.set(s * 0.3, 1.38, -0.15);
    peri.add(h);
  }
  peri.userData.dynamic = true;
  g.add(peri);
  block(0, -0.3, 0.55, 0.55);
  // The helm, forward, and the plane wheels and depth gauges beside it.
  const wh = wheel({ ...style, wheelR: 0.24, spokes: 6, wheel: 'steel' }, M);
  wh.position.set(0, 1.1, hd - 0.45);
  g.add(wh);
  slab(g, M.trim, 0.3, 1.1, 0.25, 0, 0, hd - 0.25);
  block(0, hd - 0.3, 0.4, 0.4);
  gauge(g, M, 0.12, -0.85, 1.15, hd - WALL - 0.02, dialTex(['0', '20', '40', '60', '80', '100', '120'], { arc: Math.PI * 1.6, title: 'DEPTH' }));
  gauge(g, M, 0.1, 0.85, 1.15, hd - WALL - 0.02, dialTex(['35', '0', '35'], { arc: Math.PI * 0.9, title: 'RUDDER' }));
  gauge(g, M, 0.09, 0, 1.95, hd - WALL - 0.02, dialTex(['0', '5', '10', '15', '20'], { arc: Math.PI * 1.3, title: 'KNOTS' }));
  // The torpedo director: a cabinet of dials and cranks along the port side.
  slab(g, M.trim, 0.5, 1.4, Math.min(1.6, D * 0.4), hw - WALL - 0.27, 0, -0.1);
  for (let k = 0; k < 4; k++) {
    gauge(g, M, 0.07, hw - WALL - 0.53, 1.0 + (k % 2) * 0.22, -0.4 + Math.floor(k / 2) * 0.35,
      dialTex(['0', '90', '180', '270']), -1);
  }
  block(hw - WALL - 0.27, -0.1, 0.55, Math.min(1.6, D * 0.4) + 0.1);
  // The ladder up to the bridge hatch, and the one down to the control room.
  ladderUp(g, M, -hw + 0.55, -hd + WALL + 0.07, H, 1);
  block(-hw + 0.55, -hd + 0.3, 0.7, 0.45);
  for (let k = 0; k < 4; k++) voicePipe(g, M, -hw + 0.3, -0.3 + k * 0.15, 1.2);
  block(-hw + 0.3, -0.07, 0.3, 0.7);
  for (const [x, z] of [[0, hd * 0.4], [0, -hd * 0.6]]) {
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.nightLamp);
    glow.position.set(x, H - 0.02, z);
    g.add(glow);
  }
  return { blocks, open: [], wheel: wh, telegraphs: [], periscope: peri, stand: { x: 0, z: hd - 1.15 } };
}

// ---------------------------------------------------------- walking in it --

/**
 * The map a man walks the wheelhouse on, in her frame, in the same form as
 * her plan (see walker.js) but exact: a wall is a wall however thin it is
 * drawn. Everywhere he may stand is the deck's own height; everywhere else is
 * too high to climb.
 */
function walkMap(spot, blocks, open) {
  const cell = 0.08;
  const x0 = spot.x0 || 0;
  const halfX = spot.width / 2 + (spot.wing || 0) + 0.6;
  const halfZ = spot.depth / 2 + 0.6;
  const w = Math.ceil((2 * halfX) / cell), h = Math.ceil((2 * halfZ) / cell);
  const F = spot.floor;
  const heights = new Float32Array(w * h).fill(F + 20);
  const map = { w, h, halfX, halfZ, heights, cx: x0, cz: spot.z, exact: true };
  // Room-local (x across, z along from the middle of the room) for cell (i, j).
  const lx = (i) => ((i + 0.5) / w * 2 - 1) * -halfX;
  const lz = (j) => ((j + 0.5) / h * 2 - 1) * halfZ;
  const fill = (ax, az, bx, bz, y) => {
    for (let j = 0; j < h; j++) {
      const z = lz(j);
      if (z < az || z > bz) continue;
      for (let i = 0; i < w; i++) {
        const x = lx(i);
        if (x >= ax && x <= bx) heights[j * w + i] = F + y;
      }
    }
  };
  const wall = WALL + BODY;
  fill(-spot.width / 2 + wall, -spot.depth / 2 + wall, spot.width / 2 - wall, spot.depth / 2 - wall, 0);
  for (const [ax, az, bx, bz, y] of open) fill(ax + (ax < -spot.width / 2 ? BODY : 0), az, bx - (bx > spot.width / 2 ? BODY : 0), bz, y);
  for (const [ax, az, bx, bz] of blocks) fill(ax - BODY * 0.7, az - BODY * 0.7, bx + BODY * 0.7, bz + BODY * 0.7, 20);
  // The helmsman's grating stands a little proud of the deck.
  for (const o of open) if (o[4]) fill(o[0], o[1], o[2], o[3], o[4]);
  return map;
}
