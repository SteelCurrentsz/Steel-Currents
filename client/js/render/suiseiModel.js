// The owner's D4Y Suisei, as the game draws her.
//
// build/suisei-source.mjs turns the sculpt into pieces -- her body, her tail,
// each wing in two, her airscrew, her bomb doors, the bomb, the gunner's gun
// and her three legs -- every point tagged with what it is. This decodes them
// and paints her, the same way zeroModel.js paints the Zero: in the shader,
// off the point in her own frame, so a hinomaru is a circle and the line
// between her green and her grey runs straight along her however big the
// triangles under it are.
//
// D4Y2 as a carrier unit had her in 1944: dark green over grey, hinomaru above
// and below the wing and on her sides in a white surround, the yellow strips
// on her inboard leading edges, a brown airscrew with yellow bands at the tips,
// and her greenhouse glazed.
import * as THREE from '../../../vendor/three.module.js';

// Her sculpt is several hundred kilobytes, and nothing on the title screen
// flies her, so it is not imported with the rest of the game: it is fetched by
// loadSuisei() -- which loadShips (ships.js) waits on before a battle or the
// shipyard can want her -- and a captain is not kept at the loading screen
// for an aeroplane he has not yet seen.
let SUISEI_PIECES = null;
/** Her measurements -- hinges, guns, where she breaks -- once loadSuisei() is in. */
export let SUISEI = null;
let loading = null;

export function loadSuisei() {
  loading ||= import('./suiseiModel.data.js').then((m) => {
    const meta = m.SUISEI_META;
    // How her legs go up, fitted against her own wing (see zeroModel.js and
    // planekit's gearRig). Her port leg is hinged lower in the sculpt than her
    // starboard one, so the two do not travel the same: given the same swing the
    // port wheel came up through the top of her wing.
    Object.assign(meta.gearL, { up: 1.65, tuck: 0.15, slide: 0 });
    Object.assign(meta.gearR, { up: -1.4, tuck: -0.05, slide: 0 });
    Object.assign(meta.gearT, { up: -1.9, tuck: 0.45, slide: 0.3 });
    SUISEI_PIECES = m.SUISEI_PIECES;
    SUISEI = meta;
  }, (e) => { loading = null; throw e; });
  return loading;
}

/** The pieces a Suisei can lose, and the parts of her that move. */
export const SUISEI_SEGS = ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR'];
export const SUISEI_PARTS = ['prop', 'bayPort', 'bayStbd', 'store', 'gun', 'gearL', 'gearR', 'gearT'];

/**
 * The parts built in the level frame she was measured in, and turned up with
 * her: their own rotation is her tilt. Her legs are built plumb in hers.
 */
const LEVEL = new Set(['prop', 'bayPort', 'bayStbd', 'store', 'gun']);

/** The rotation a part of her sits at before it moves: see LEVEL. */
export function suiseiRest(name, out = new THREE.Quaternion()) {
  if (LEVEL.has(name)) return out.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -SUISEI.tilt);
  return out.identity();
}

/** Where each moving part's hinge is, in her own frame. */
export function suiseiHinge(name) {
  if (name === 'prop') return SUISEI.prop;
  const s = SUISEI[name];
  return s ? s.at : [0, 0, 0];
}

function viewOf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new DataView(bytes.buffer);
}

/** One piece back into a geometry, the tag in the red of a byte colour. */
function decode(b64) {
  const dv = viewOf(b64);
  const nv = dv.getUint32(0, true);
  const nt = dv.getUint32(4, true);
  let p = 8;
  const pos = new Float32Array(nv * 3);
  for (let k = 0; k < nv * 3; k++, p += 2) pos[k] = dv.getInt16(p, true) / 1000;
  const nrm = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++, p += 3) {
    const x = dv.getInt8(p) / 127, y = dv.getInt8(p + 1) / 127, z = dv.getInt8(p + 2) / 127;
    const l = Math.hypot(x, y, z) || 1;
    nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l;
  }
  const col = new Uint8Array(nv * 3);
  for (let i = 0; i < nv; i++, p++) col[i * 3] = dv.getUint8(p);
  if (p % 2) p++;
  const idx = new Uint16Array(nt * 3);
  for (let k = 0; k < nt * 3; k++, p += 2) idx[k] = dv.getUint16(p, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

let GEOS = null;
/** Every piece of her, decoded once and shared by everything that draws her. */
export function suiseiGeometries() {
  if (GEOS) return GEOS;
  GEOS = {};
  for (const [k, b64] of Object.entries(SUISEI_PIECES)) GEOS[k] = decode(b64);
  return GEOS;
}

const hex = (h) => {
  const c = new THREE.Color(h);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
};
const f = (v) => v.toFixed(5);

const GREEN = hex(0x35452c);
const GREY = hex(0xa8ab98);
const RED = hex(0xb02129);
const WHITE = hex(0xe9e7de);
const YELLOW = hex(0xd99a22);
const COWL = hex(0x18191b);
const GLASS = hex(0x2a3e4b);
const BLADE = hex(0x4a3221);
const SPINNER = hex(0x5a3624);
const LEG = hex(0x8b9089);
const TYRE = hex(0x1b1b1b);
const METAL = hex(0x34363a);
const DOOR = hex(0xa1a492);
const CAVE = hex(0x0d0e0f);
const BOMB = hex(0x46493f);

// The paint is laid out in the level frame she was measured in -- see
// build/suisei-source.mjs -- so the body's points are turned back down
// before anything is read off them.
const paint = () => /* glsl */`
vec3 suiseiLevel(vec3 p) {
  float y = p.y + ${f(SUISEI.ground)};
  float z = p.z - ${f(SUISEI.dz)};
  float c = ${f(Math.cos(SUISEI.tilt))}, s = ${f(Math.sin(SUISEI.tilt))};
  return vec3(p.x, y * c - z * s, y * s + z * c);
}
vec3 suiseiPaint(float tag, vec3 q, vec3 n) {
  if (tag > 13.5) return ${GREY};
  if (tag > 12.5) return ${YELLOW};
  if (tag > 11.5) return ${BOMB};
  if (tag > 10.5) return ${CAVE};
  if (tag > 9.5) return ${YELLOW};
  if (tag < 0.5 || tag > 8.5) {
    vec3 p = suiseiLevel(q);
    vec3 c;
    float ax = abs(p.x);
    if (tag > 8.5) {
      // A wing or a tailplane: green whatever faces up, grey whatever faces
      // down.
      c = n.y > 0.0 ? ${GREEN} : ${GREY};
      // The hinomaru, above and below, near the tips.
      if (length(vec2(ax - 3.9, p.z - 0.62)) < 0.55) c = ${RED};
      // The yellow on her inboard leading edges.
      float le = 1.80 - 0.08 * ax;
      if (ax > 0.85 && ax < 2.9 && p.z > le - 0.22 && n.y > -0.2 && p.z > -2.0) c = ${YELLOW};
    } else {
      // Her fuselage: the line at about the wing root, rising toward the
      // tail, and her fin green both sides.
      float line = p.z > -0.5 ? -0.42 : -0.42 + (-0.5 - p.z) * 0.06;
      c = p.y > line ? ${GREEN} : ${GREY};
      // The fillets at her wing roots are wing as far as the paint goes:
      // whatever faces well up is green and whatever faces well down grey.
      if (n.y > 0.55 && p.y < 0.0) c = ${GREEN};
      if (n.y < -0.55) c = ${GREY};
      if (p.z < -3.55 && p.y > 0.15) c = ${GREEN};
      // The hinomaru on her side, in its white surround.
      float r = length(vec2(p.z + 2.2, p.y + 0.25));
      if (abs(n.x) > 0.25 && ax < 0.5) {
        if (r < 0.36) c = ${RED};
        else if (r < 0.44) c = ${WHITE};
      }
    }
    return c;
  }
  if (tag < 1.5) return ${COWL};
  if (tag < 2.5) return ${GLASS};
  if (tag < 3.5) return ${BLADE};
  if (tag < 4.5) return ${SPINNER};
  if (tag < 5.5) return ${LEG};
  if (tag < 6.5) return ${TYRE};
  if (tag < 7.5) return ${METAL};
  return ${DOOR};
}
`;

let MAT = null;
/**
 * The one material every piece of every Suisei is drawn with. Double-sided,
 * for the same reason the Zero's is: a piece shot off shows the inside of her
 * skin at the break, and it is drawn dark.
 */
export function suiseiMaterial() {
  if (MAT) return MAT;
  MAT = new THREE.MeshPhongMaterial({
    color: 0xffffff, specular: 0x3a4046, shininess: 34, side: THREE.DoubleSide,
  });
  MAT.userData.painted = true;
  MAT.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
#ifndef USE_COLOR
attribute vec3 color;
#endif
varying float vSTag;
varying vec3 vSPos;
varying vec3 vSNrm;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSTag = floor(color.r * 255.0 + 0.5);
vSPos = position;
vSNrm = normal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vSTag;
varying vec3 vSPos;
varying vec3 vSNrm;
${paint()}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = suiseiPaint(vSTag, vSPos, normalize(vSNrm));
if (!gl_FrontFacing) diffuseColor.rgb *= 0.12;`)
      .replace('#include <specularmap_fragment>', `#include <specularmap_fragment>
// Glass and bare metal shine; her paint is a matt finish.
specularStrength = vSTag > 1.5 && vSTag < 2.5 ? 3.2 : (vSTag > 6.5 && vSTag < 7.5 ? 1.4 : 0.55);`);
  };
  MAT.customProgramCacheKey = () => 'suisei-paint';
  return MAT;
}

/** Which piece of her a point in her own frame belongs to. */
export function suiseiSegOf(x, y, z) {
  if (z < SUISEI.breaks.tail[2]) return 'tail';
  const ax = Math.abs(x);
  if (ax > Math.abs(SUISEI.breaks.wingOutR[0])) return x > 0 ? 'wingOutR' : 'wingOutL';
  if (ax > Math.abs(SUISEI.breaks.wingInR[0]) && y < SUISEI.breaks.wingInR[1] + 0.5) {
    return x > 0 ? 'wingInR' : 'wingInL';
  }
  return 'body';
}

/**
 * A whole Suisei as a scene-graph model, for a deck or anything else that
 * draws one aeroplane by herself.
 *
 * `opts.lod` draws her in the one coarse piece. Otherwise she is in her
 * pieces, with her airscrew on a hub (`userData.prop`), her legs on hinges
 * (`userData.gear(u)`, 0 down and locked, 1 up), her bomb doors
 * (`userData.bay(u)`, 0 shut, 1 open) and her bomb on the crutch
 * (`userData.store`).
 */
export function suiseiModel(opts = {}) {
  const geos = suiseiGeometries();
  const mat = suiseiMaterial();
  const p = new THREE.Group();
  p.userData.dynamic = true;
  p.userData.sculpt = true;
  if (opts.lod) {
    p.add(new THREE.Mesh(geos.lod, mat));
  } else {
    for (const k of SUISEI_SEGS) {
      const m = new THREE.Mesh(geos[k], mat);
      m.name = k;
      p.add(m);
    }
    const hinged = (name) => {
      const h = new THREE.Group();
      h.position.fromArray(suiseiHinge(name));
      const rest = new THREE.Group();
      suiseiRest(name, rest.quaternion);
      h.add(rest);
      const turn = new THREE.Group();
      rest.add(turn);
      const m = new THREE.Mesh(geos[name], mat);
      m.name = name;
      turn.add(m);
      p.add(h);
      return { h, turn, m };
    };
    p.userData.prop = hinged('prop').turn;
    const doors = ['bayPort', 'bayStbd'].map((k) => ({ k, ...hinged(k) }));
    p.userData.bay = (u) => {
      const k = Math.max(0, Math.min(1, u));
      for (const d of doors) d.turn.rotation.z = SUISEI[d.k].open * k;
    };
    p.userData.store = hinged('store').h;
    const gun = hinged('gun');
    p.userData.gun = gun.turn;
    gun.turn.rotation.order = 'YXZ';
    const legs = [];
    for (const k of ['gearL', 'gearR', 'gearT']) {
      const spec = SUISEI[k];
      const { h, turn, m } = hinged(k);
      legs.push({ hinge: h, turn, spec });
      m.userData.legFoot = { x: spec.at[0], z: spec.at[2], skin: spec.at[1], top: spec.at[1] };
    }
    p.userData.gear = (u) => {
      const k = Math.max(0, Math.min(1, u));
      const e = k * k * (3 - 2 * k);
      for (const { hinge, turn, spec } of legs) {
        turn.rotation.set(0, 0, 0);
        turn.rotation[spec.axis] = spec.up * e;
        hinge.position.fromArray(spec.at);
        hinge.position.y += (spec.tuck || 0) * e;
        if (spec.axis === 'z') hinge.position.x += (spec.slide || 0) * e;
        else hinge.position.z += (spec.slide || 0) * e;
        hinge.visible = k < 0.985;
      }
    };
  }
  for (const at of SUISEI.guns) {
    const o = new THREE.Object3D();
    o.position.fromArray(at);
    o.userData.muzzle = 0.15;
    p.add(o);
  }
  return p;
}
