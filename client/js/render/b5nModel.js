// The owner's B5N, as the game draws her.
//
// build/b5n-source.mjs turns the sculpt into pieces -- her body, her tail,
// each wing in two, her airscrew, her torpedo, the gunner's gun and her three
// legs -- every point tagged with what it is. This decodes them and paints
// her, the same way suiseiModel.js paints the Suisei: in the shader, off the
// point in her own frame, so a hinomaru is a circle and the line between her
// green and her grey runs straight along her however big the triangles under
// it are.
//
// A B5N2 as the carrier units had her from 1942: dark green over grey, a black
// cowling, hinomaru above and below the wing and on her sides in a white
// surround, the yellow strips on her inboard leading edges, a brown airscrew
// with yellow bands at the tips, and a Type 91 under her in its dull steel
// with its warhead dark.
import * as THREE from '../../../vendor/three.module.js';

// Her sculpt is several hundred kilobytes, and nothing on the title screen
// flies her, so it is not imported with the rest of the game: it is fetched by
// loadB5n() -- which loadShips (ships.js) waits on before a battle or the
// shipyard can want her -- and a captain is not kept at the loading screen
// for an aeroplane he has not yet seen.
let B5N_PIECES = null;
/** Her measurements -- hinges, guns, where she breaks -- once loadB5n() is in. */
export let B5N = null;
let loading = null;

export function loadB5n() {
  loading ||= import('./b5nModel.data.js').then((m) => {
    const meta = m.B5N_META;
    // How her legs go up, fitted against her own wing (see build/fit-gear.mjs):
    // inward about the hinge at the top of each leg into the centre section, and
    // the tail wheel back and up into her.
    Object.assign(meta.gearL, { up: 1.55, tuck: 0.22, slide: 0 });
    Object.assign(meta.gearR, { up: -1.55, tuck: 0.22, slide: 0 });
    Object.assign(meta.gearT, { up: -1.75, tuck: 0.35, slide: 0.2 });
    B5N_PIECES = m.B5N_PIECES;
    B5N = meta;
  }, (e) => { loading = null; throw e; });
  return loading;
}

/** The pieces a B5N can lose, and the parts of her that move. */
export const B5N_SEGS = ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR'];
export const B5N_PARTS = ['prop', 'store', 'gun', 'gearL', 'gearR', 'gearT'];

/**
 * The parts built in the level frame she was measured in, and turned up with
 * her: their own rotation is her tilt. Her legs are built plumb in hers.
 */
const LEVEL = new Set(['prop', 'store', 'gun']);

let TILT_Q = null;
/** Her tilt, as a rotation: worked out once she is in (see loadB5n). */
const tiltQ = () => (TILT_Q ||= new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -B5N.tilt));

/** The rotation a part of her sits at before it moves: see LEVEL. */
export function b5nRest(name, out = new THREE.Quaternion()) {
  if (LEVEL.has(name)) return out.copy(tiltQ());
  return out.identity();
}

/** Where each moving part's hinge is, in her own frame. */
export function b5nHinge(name) {
  if (name === 'prop') return B5N.prop;
  const s = B5N[name];
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
export function b5nGeometries() {
  if (GEOS) return GEOS;
  GEOS = {};
  for (const [k, b64] of Object.entries(B5N_PIECES)) GEOS[k] = decode(b64);
  return GEOS;
}

const hex = (h) => {
  const c = new THREE.Color(h);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
};
const f = (v) => v.toFixed(5);

const GREEN = hex(0x34432c);
const GREY = hex(0xa9ac99);
const RED = hex(0xb02129);
const WHITE = hex(0xe9e7de);
const YELLOW = hex(0xd99a22);
const COWL = hex(0x161719);
const GLASS = hex(0x2a3e4b);
const BLADE = hex(0x4a3221);
const SPINNER = hex(0x5a3624);
const LEG = hex(0x8b9089);
const TYRE = hex(0x1b1b1b);
const METAL = hex(0x34363a);
const DOOR = hex(0xa1a492);
const ENGINE = hex(0x3c3d3f);
const FISH = hex(0x6c7276);
const HEAD = hex(0x2f3336);

// The paint is laid out in the level frame she was measured in -- see
// build/b5n-source.mjs -- so the body's points are turned back down before
// anything is read off them.
const paint = () => /* glsl */`
vec3 b5nLevel(vec3 p) {
  float y = p.y + ${f(B5N.ground)};
  float z = p.z - ${f(B5N.dz)};
  float c = ${f(Math.cos(B5N.tilt))}, s = ${f(Math.sin(B5N.tilt))};
  return vec3(p.x, y * c - z * s, y * s + z * c);
}
vec3 b5nPaint(float tag, vec3 q, vec3 n) {
  if (tag > 13.5) return ${HEAD};
  if (tag > 12.5) return ${YELLOW};
  if (tag > 11.5) return ${FISH};
  if (tag > 10.5) return ${ENGINE};
  if (tag > 9.5) return ${YELLOW};
  if (tag < 0.5 || tag > 8.5) {
    vec3 p = b5nLevel(q);
    vec3 c;
    float ax = abs(p.x);
    if (tag > 8.5) {
      // A wing or a tailplane: green whatever faces up, grey whatever faces
      // down.
      c = n.y > 0.0 ? ${GREEN} : ${GREY};
      // The hinomaru, above and below, well out on the outer panels.
      if (length(vec2(ax - 5.4, p.z - 1.75)) < 0.68) c = ${RED};
      // The yellow on her inboard leading edges.
      float le = 3.20 - 0.025 * ax;
      if (ax > 0.9 && ax < 3.2 && p.z > le - 0.24 && n.y > -0.2 && p.z > 0.0) c = ${YELLOW};
    } else {
      // Her fuselage: the line at about the wing root, rising toward the
      // tail, and her fin green both sides.
      float line = p.z > -0.5 ? -0.30 : -0.30 + (-0.5 - p.z) * 0.05;
      c = p.y > line ? ${GREEN} : ${GREY};
      // The fillets at her wing roots are wing as far as the paint goes:
      // whatever faces well up is green and whatever faces well down grey.
      if (n.y > 0.55 && p.y < -0.2) c = ${GREEN};
      if (n.y < -0.55) c = ${GREY};
      if (p.z < -4.2 && p.y > 0.3) c = ${GREEN};
      // Her cowling, black from the front of it back to the gills.
      if (p.z > 4.40) c = ${COWL};
      // The hinomaru on her side, in its white surround.
      float r = length(vec2(p.z + 2.5, p.y + 0.02));
      if (abs(n.x) > 0.25 && ax < 0.6) {
        if (r < 0.40) c = ${RED};
        else if (r < 0.49) c = ${WHITE};
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
 * The one material every piece of every B5N is drawn with. Double-sided, for
 * the same reason the Suisei's is: a piece shot off shows the inside of her
 * skin at the break, and it is drawn dark.
 */
export function b5nMaterial() {
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
varying float vBTag;
varying vec3 vBPos;
varying vec3 vBNrm;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vBTag = floor(color.r * 255.0 + 0.5);
vBPos = position;
vBNrm = normal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vBTag;
varying vec3 vBPos;
varying vec3 vBNrm;
${paint()}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = b5nPaint(vBTag, vBPos, normalize(vBNrm));
if (!gl_FrontFacing) diffuseColor.rgb *= 0.12;`)
      .replace('#include <specularmap_fragment>', `#include <specularmap_fragment>
// Glass and bare metal shine; her paint is a matt finish.
specularStrength = vBTag > 1.5 && vBTag < 2.5 ? 3.2 : (vBTag > 6.5 && vBTag < 7.5 ? 1.4 : 0.55);`);
  };
  MAT.customProgramCacheKey = () => 'b5n-paint';
  return MAT;
}

/** Which piece of her a point in her own frame belongs to. */
export function b5nSegOf(x, y, z) {
  if (z < B5N.breaks.tail[2]) return 'tail';
  const ax = Math.abs(x);
  if (ax > Math.abs(B5N.breaks.wingOutR[0])) return x > 0 ? 'wingOutR' : 'wingOutL';
  if (ax > Math.abs(B5N.breaks.wingInR[0]) && y < B5N.breaks.wingInR[1] + 0.4) {
    return x > 0 ? 'wingInR' : 'wingInL';
  }
  return 'body';
}

/**
 * Hang an outer panel on its fold, so that it can swing up over her back.
 * The hinge runs fore and aft in the level frame she was measured in, so the
 * swing is about that line turned up with her.
 */
function foldable(p, geo, mat, spec) {
  const at = new THREE.Vector3().fromArray(spec.at);
  const hinge = new THREE.Group();
  hinge.position.copy(at);
  const swing = new THREE.Group();
  hinge.add(swing);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(at).negate();
  swing.add(m);
  p.add(hinge);
  const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(tiltQ());
  return { swing, axis, up: spec.up, mesh: m };
}

/**
 * A whole B5N as a scene-graph model, for a deck or anything else that draws
 * one aeroplane by herself.
 *
 * `opts.lod` draws her coarse. Otherwise she is in her pieces, with her
 * airscrew on a hub (`userData.prop`), her legs on hinges (`userData.gear(u)`,
 * 0 down and locked, 1 up), her fish on its crutch (`userData.store`) and the
 * gunner's gun on its mounting (`userData.gun`). Either way her outer panels
 * fold (`userData.fold(u)`, 0 spread, 1 folded over her back), and
 * `opts.folded` puts her down with them folded.
 */
export function b5nModel(opts = {}) {
  const geos = b5nGeometries();
  const mat = b5nMaterial();
  const p = new THREE.Group();
  p.userData.dynamic = true;
  p.userData.sculpt = true;
  let outer;
  if (opts.lod) {
    p.add(new THREE.Mesh(geos.lod, mat));
    outer = [foldable(p, geos.lodOutL, mat, B5N.foldL), foldable(p, geos.lodOutR, mat, B5N.foldR)];
  } else {
    for (const k of B5N_SEGS) {
      if (k === 'wingOutL' || k === 'wingOutR') continue;
      const m = new THREE.Mesh(geos[k], mat);
      m.name = k;
      p.add(m);
    }
    outer = [foldable(p, geos.wingOutL, mat, B5N.foldL), foldable(p, geos.wingOutR, mat, B5N.foldR)];
    outer[0].mesh.name = 'wingOutL';
    outer[1].mesh.name = 'wingOutR';
    const hinged = (name) => {
      const h = new THREE.Group();
      h.position.fromArray(b5nHinge(name));
      const rest = new THREE.Group();
      b5nRest(name, rest.quaternion);
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
    p.userData.store = hinged('store').h;
    const gun = hinged('gun');
    p.userData.gun = gun.turn;
    gun.turn.rotation.order = 'YXZ';
    gun.turn.rotation.x = 0.25;
    const legs = [];
    for (const k of ['gearL', 'gearR', 'gearT']) {
      const spec = B5N[k];
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
  p.userData.fold = (u) => {
    const k = Math.max(0, Math.min(1, u));
    const e = k * k * (3 - 2 * k);
    for (const o of outer) o.swing.quaternion.setFromAxisAngle(o.axis, o.up * e);
    p.userData.folded = k > 0.5;
  };
  p.userData.fold(opts.folded ? 1 : 0);
  for (const at of B5N.guns) {
    const o = new THREE.Object3D();
    o.position.fromArray(at);
    o.userData.muzzle = 0.15;
    p.add(o);
  }
  return p;
}
