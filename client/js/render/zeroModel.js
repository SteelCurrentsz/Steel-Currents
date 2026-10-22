// The owner's A6M Zero, as the game draws her.
//
// build/zero-source.mjs turns the sculpt into pieces -- her body, her tail,
// each wing in two, her airscrew and her three legs -- every point tagged with
// what it is. This decodes them and paints her.
//
// The paint is laid in the shader rather than in the points, because a
// decimated wing is a few big triangles and a roundel drawn in vertex colour
// on those is a smudge: here it is a circle, the yellow on her leading edge is
// a straight band, and the line between her green and her grey runs where it
// ran on her, whatever the triangles under it are. It reads the point in her
// own frame, so a piece that has come off her and is tumbling into the sea
// still carries its own roundel.
//
// A6M5, as a carrier unit had her in 1944: dark green over light grey, a black
// cowling, the yellow identification strips on the inboard leading edges,
// roundels above and below the wing and on her sides with a white surround,
// a brown airscrew with yellow tips, and her canopy glazed and shut.
import * as THREE from '../../../vendor/three.module.js';

// Her sculpt is several hundred kilobytes, and nothing on the title screen
// flies her, so it is not imported with the rest of the game: it is fetched by
// loadZero() -- which loadShips (ships.js) waits on before a battle or the
// shipyard can want her -- and a captain is not kept at the loading screen
// for an aeroplane he has not yet seen.
let ZERO_PIECES = null;
/** Her measurements -- hinges, guns, where she breaks -- once loadZero() is in. */
export let ZERO = null;
let loading = null;

export function loadZero() {
  loading ||= import('./zeroModel.data.js').then((m) => {
    const meta = m.ZERO_META;
    // How her legs go up, fitted against her own wing rather than set by eye (see
    // planekit's gearRig): each main leg swings in about its hinge, rises and
    // slides into its well, and the tail leg swings up into the sternpost.
    // `slide` is the travel along her span for a main leg, and fore and aft for the
    // tail. The sculpt's own numbers swung the mains a hundred degrees and lifted
    // them three tenths of a metre, which put both wheels up through the top of
    // the wing at the root.
    Object.assign(meta.gearL, { up: 1.35, tuck: 0.55, slide: -0.3 });
    Object.assign(meta.gearR, { up: -1.65, tuck: 0.4, slide: -0.4 });
    Object.assign(meta.gearT, { up: 1.2, tuck: 0.25, slide: 0 });
    ZERO_PIECES = m.ZERO_PIECES;
    ZERO = meta;
  }, (e) => { loading = null; throw e; });
  return loading;
}

/** The pieces a Zero can lose, and the parts of her that move. */
export const ZERO_SEGS = ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR'];
export const ZERO_PARTS = ['prop', 'gearL', 'gearR', 'gearT'];

function viewOf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new DataView(bytes.buffer);
}

/**
 * One piece back into a geometry. The tag rides in the red of a byte colour
 * attribute -- the one thing every weld in the game already carries through --
 * and the material reads it back out; see zeroMaterial.
 */
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
export function zeroGeometries() {
  if (GEOS) return GEOS;
  GEOS = {};
  for (const [k, b64] of Object.entries(ZERO_PIECES)) GEOS[k] = decode(b64);
  return GEOS;
}

const hex = (h) => {
  const c = new THREE.Color(h);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
};

// Her paint, in the order of the tags build/zero-source.mjs lays.
const GREEN = hex(0x3c4a30);
const GREY = hex(0xb3b29f);
const RED = hex(0xb02129);
const WHITE = hex(0xe9e7de);
const YELLOW = hex(0xd99a22);
const COWL = hex(0x18191b);
const GLASS = hex(0x2c4250);
const BLADE = hex(0x4a3221);
const SPINNER = hex(0x553826);
const LEG = hex(0x8b9089);
const TYRE = hex(0x1b1b1b);
const METAL = hex(0x3a3b3d);
const DOOR = hex(0xa9a996);

const PAINT = /* glsl */`
vec3 zeroPaint(float tag, vec3 p, vec3 n) {
  if (tag > 9.5) return ${YELLOW};
  if (tag < 0.5 || tag > 8.5) {
    // Her skin. Green over grey, the line running back along her side at
    // about the wing root and dropping toward the tail, and anything facing
    // well up or well down taking its own colour whatever its height.
    vec3 c;
    if (tag > 8.5) {
      c = n.y > 0.0 ? ${GREEN} : ${GREY};
      float ax = abs(p.x);
      // The roundels, above and below, three and a half metres out.
      vec2 d = vec2(ax - 3.45, p.z - 0.62);
      if (length(d) < 0.56) c = ${RED};
      // The yellow on her inboard leading edges.
      float le = 1.80 - 0.09 * ax;
      if (ax > 0.75 && ax < 2.75 && p.z > le - 0.24 && n.y > -0.2) c = ${YELLOW};
    } else {
      float line = p.z < 0.0 ? 1.70 + p.z * 0.135 : 1.70;
      c = p.y > line ? ${GREEN} : ${GREY};
      // The roundel on her side, in its white surround.
      vec2 d = vec2(p.z + 2.83, p.y - 1.30);
      float r = length(d);
      if (abs(n.x) > 0.25 && abs(p.x) < 0.6) {
        if (r < 0.40) c = ${RED};
        else if (r < 0.48) c = ${WHITE};
      }
      // And her fin and rudder, green both sides.
      if (p.z < -3.9 && p.y > 1.75) c = ${GREEN};
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
 * The one material every piece of every Zero is drawn with.
 *
 * Double-sided, because she can be broken: a wing that has come off shows the
 * inside of its own skin at the break, and that is drawn dark -- the inside of
 * an aeroplane, scorched -- rather than as the outside seen from behind.
 */
export function zeroMaterial() {
  if (MAT) return MAT;
  MAT = new THREE.MeshPhongMaterial({
    color: 0xffffff, specular: 0x3a4046, shininess: 34, side: THREE.DoubleSide,
  });
  // Not to be re-dressed as a flat-coloured part: see planekit's dressPlane.
  MAT.userData.painted = true;
  MAT.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
#ifndef USE_COLOR
attribute vec3 color;
#endif
varying float vZTag;
varying vec3 vZPos;
varying vec3 vZNrm;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vZTag = floor(color.r * 255.0 + 0.5);
vZPos = position;
vZNrm = normal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vZTag;
varying vec3 vZPos;
varying vec3 vZNrm;
${PAINT}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = zeroPaint(vZTag, vZPos, normalize(vZNrm));
if (!gl_FrontFacing) diffuseColor.rgb *= 0.12;`)
      .replace('#include <specularmap_fragment>', `#include <specularmap_fragment>
// Glass and a black cowling shine; the paint on her is a matt finish.
specularStrength = vZTag > 1.5 && vZTag < 2.5 ? 3.2 : (vZTag > 0.5 && vZTag < 1.5 ? 1.4 : 0.55);`);
  };
  MAT.customProgramCacheKey = () => 'zero-paint';
  return MAT;
}

/**
 * Which piece of her a point in her own frame belongs to, for a hole that has
 * to know whether the piece it was in is still there.
 */
export function zeroSegOf(x, y, z) {
  if (z < ZERO.breaks.tail[2]) return 'tail';
  const ax = Math.abs(x);
  if (ax > Math.abs(ZERO.breaks.wingOutR[0])) return x > 0 ? 'wingOutR' : 'wingOutL';
  if (ax > 0.95 && y < 2.1) return x > 0 ? 'wingInR' : 'wingInL';
  return 'body';
}

/**
 * A whole Zero as a scene-graph model, for a deck or anything else that draws
 * one aeroplane by herself rather than out of a batch.
 *
 * `opts.lod` draws her in the one coarse piece, for a machine parked on a deck
 * that will never move. Otherwise she is in her pieces, with her airscrew on a
 * hub that turns about +z -- `userData.prop`, as every other model in the kit
 * has -- and her legs on hinges: `userData.gear(u)`, 0 down and locked, 1 up.
 */
export function zeroModel(opts = {}) {
  const geos = zeroGeometries();
  const mat = zeroMaterial();
  const p = new THREE.Group();
  // Nothing of her is to be baked into whatever she is parked on: the paint
  // is read off the point in her own frame, and a weld moves every point.
  p.userData.dynamic = true;
  // Built from a sculpt rather than out of primitives.
  p.userData.sculpt = true;
  if (opts.lod) {
    p.add(new THREE.Mesh(geos.lod, mat));
  } else {
    for (const k of ZERO_SEGS) {
      const m = new THREE.Mesh(geos[k], mat);
      m.name = k;
      p.add(m);
    }
    const hub = new THREE.Group();
    hub.position.fromArray(ZERO.prop);
    const blades = new THREE.Mesh(geos.prop, mat);
    blades.position.fromArray(ZERO.prop).negate();
    hub.add(blades);
    p.add(hub);
    p.userData.prop = hub;
    const legs = [];
    for (const k of ['gearL', 'gearR', 'gearT']) {
      const spec = ZERO[k];
      const hinge = new THREE.Group();
      hinge.position.fromArray(spec.at);
      const m = new THREE.Mesh(geos[k], mat);
      m.position.fromArray(spec.at).negate();
      hinge.add(m);
      p.add(hinge);
      legs.push({ hinge, spec });
      // What the kit's own legs record when they are placed (see planekit's
      // mainGear): the sculpt's legs grow out of her skin, so the aeroplane
      // over each is at the top of it.
      m.userData.legFoot = { x: spec.at[0], z: spec.at[2], skin: spec.at[1], top: spec.at[1] };
    }
    p.userData.gear = (u) => {
      const k = Math.max(0, Math.min(1, u));
      const e = k * k * (3 - 2 * k);
      for (const { hinge, spec } of legs) {
        hinge.rotation.set(0, 0, 0);
        hinge.rotation[spec.axis] = spec.up * e;
        hinge.position.fromArray(spec.at);
        hinge.position.y += (spec.tuck || 0) * e;
        if (spec.axis === 'z') hinge.position.x += (spec.slide || 0) * e;
        else hinge.position.z += (spec.slide || 0) * e;
        // Up, and the doors shut over it.
        hinge.visible = k < 0.985;
      }
    };
  }
  // Her guns, for anything that asks the model where they are: see
  // planekit's muzzlesOf.
  for (const at of ZERO.guns) {
    const o = new THREE.Object3D();
    o.position.fromArray(at);
    o.userData.muzzle = 0.15;
    p.add(o);
  }
  return p;
}
