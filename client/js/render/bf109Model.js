// The owner's Bf 109T, as the game draws her.
//
// build/bf109-source.mjs turns the sculpt into pieces -- her body, her tail,
// each wing in two, her airscrew and her two main legs -- every point tagged
// with what it is. This decodes them and paints her in the shader, off the
// point in her own frame, the way b5nModel.js paints the B5N: Trägergruppe
// 186's 72 and 73 greens in splinter over her back, 65 blue under and up her
// sides, and her hood glazed in its heavy frames.
import * as THREE from '../../../vendor/three.module.js';
import { decodePiece, paintedMaterial, LW } from './sculptKit.js';

// Fetched by loadBf109() -- which loadShips (ships.js) waits on before a
// battle or the shipyard can want her -- and not imported with the game.
let PIECES = null;
/** Her measurements -- hinges, guns, where she breaks -- once loadBf109() is in. */
export let BF109 = null;
let loading = null;

export function loadBf109() {
  loading ||= import('./bf109Model.data.js').then((m) => {
    PIECES = m.BF109_PIECES;
    BF109 = m.BF109_META;
  }, (e) => { loading = null; throw e; });
  return loading;
}

/** The pieces a Messerschmitt can lose, and the parts of her that move. */
export const BF109_SEGS = ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR'];
export const BF109_PARTS = ['prop', 'gearL', 'gearR'];

/** Every part of her that moves is built level and turned up with her. */
let TILT_Q = null;
const tiltQ = () => (TILT_Q ||= new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -BF109.tilt));

/** The rotation a part of her sits at before it moves. */
export function bf109Rest(name, out = new THREE.Quaternion()) {
  return BF109_PARTS.includes(name) ? out.copy(tiltQ()) : out.identity();
}

/** Where each moving part's hinge is, in her own frame. */
export function bf109Hinge(name) {
  if (name === 'prop') return BF109.prop;
  const s = BF109[name];
  return s ? s.at : [0, 0, 0];
}

let GEOS = null;
/** Every piece of her, decoded once and shared by everything that draws her. */
export function bf109Geometries() {
  if (GEOS) return GEOS;
  GEOS = {};
  for (const [k, b64] of Object.entries(PIECES)) GEOS[k] = decodePiece(b64);
  return GEOS;
}

const f = (v) => v.toFixed(5);
const paint = () => /* glsl */`
vec3 bfPaint(float tag, vec3 q, vec3 n0) {
  float c = ${f(Math.cos(BF109.tilt))}, s = ${f(Math.sin(BF109.tilt))};
  float y = q.y + ${f(BF109.ground)};
  float z = q.z - ${f(BF109.dz)};
  vec3 p = vec3(q.x, y * c - z * s, y * s + z * c);
  vec3 n = vec3(n0.x, n0.y * c - n0.z * s, n0.y * s + n0.z * c);
  float ax = abs(p.x);
  if (tag > 9.5) return ${LW.YELLOW};
  if (tag > 7.5 && tag < 8.5) return ${LW.BLUE};
  if (tag < 0.5 || tag > 8.5) {
    vec3 col;
    if (tag > 8.5) {
      col = n.y > 0.0 ? lwSplinter(p.x, p.z) : ${LW.BLUE};
      float k = lwCross(ax - 4.0, p.z - 1.45, 0.52);
      if (p.z < -2.0) k = 0.0;
      if (k > 1.5) col = ${LW.BLACK}; else if (k > 0.5) col = ${LW.WHITE};
    } else {
      // The splinter over her back and down to the line of her hood; her
      // sides and her belly blue, the way the 109s of 1940 had them.
      col = (n.y > 0.5 || (p.y > 1.55 && n.y > -0.1)) ? lwSplinter(p.z, p.x * 2.0) : ${LW.BLUE};
      // Her fin and rudder in the greens both sides.
      if (p.z < -3.2 && p.y > 1.55) col = lwSplinter(p.z, p.y);
      if (abs(n.x) > 0.35 && ax < 0.6) {
        float k = lwCross(p.z + 1.75, p.y - 1.15, 0.38);
        if (k > 1.5) col = ${LW.BLACK}; else if (k > 0.5) col = ${LW.WHITE};
      }
    }
    return col;
  }
  if (tag < 1.5) return ${LW.BLACKGREEN};
  if (tag < 2.5) {
    // The hood's heavy frames: across her at the windscreen, the two hoops of
    // the hinged section and the armour behind the pilot, and along the sill
    // and the top of it.
    float fz = min(min(abs(p.z - 0.16), abs(p.z - 0.66)), min(abs(p.z - 1.18), abs(p.z - 1.62)));
    if (fz < 0.035 || p.y < 1.68 || (abs(p.x) < 0.05 && n.y > 0.8)) return lwSplinter(p.z, 0.0);
    return ${LW.GLASS};
  }
  if (tag < 4.5) return ${LW.BLACKGREEN};
  if (tag < 5.5) return ${LW.BLUE};
  if (tag < 6.5) return ${LW.TYRE};
  return ${LW.METAL};
}
`;

let MAT = null;
/** The one material every piece of every Messerschmitt is drawn with. */
export function bf109Material() {
  if (MAT) return MAT;
  MAT = paintedMaterial('bf109-paint', 'bfPaint', paint(),
    'vSTag > 1.5 && vSTag < 2.5 ? 3.2 : (vSTag > 6.5 && vSTag < 7.5 ? 1.4 : 0.5)');
  return MAT;
}

/** Which piece of her a point in her own frame belongs to. */
export function bf109SegOf(x, y, z) {
  if (z < BF109.breaks.tail[2]) return 'tail';
  const ax = Math.abs(x);
  if (ax > Math.abs(BF109.breaks.wingOutR[0])) return x > 0 ? 'wingOutR' : 'wingOutL';
  if (ax > Math.abs(BF109.breaks.wingInR[0]) && y < BF109.breaks.wingInR[1] + 0.35) {
    return x > 0 ? 'wingInR' : 'wingInL';
  }
  return 'body';
}

/**
 * How an outer panel lies folded: swung up about the hinge along the top of
 * the joint, a little past upright, so the two lean in over her.
 */
function foldQ(side) {
  const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(tiltQ());
  return new THREE.Quaternion().setFromAxisAngle(axis, side * 1.95);
}

function foldable(p, geo, mat, spec, side) {
  const at = new THREE.Vector3().fromArray(spec.at);
  const hinge = new THREE.Group();
  hinge.position.copy(at);
  const swing = new THREE.Group();
  hinge.add(swing);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(at).negate();
  swing.add(m);
  p.add(hinge);
  return { swing, q: foldQ(side), mesh: m };
}

/**
 * A whole Messerschmitt as a scene-graph model, for a deck or anything else
 * that draws one aeroplane by herself.
 *
 * `opts.lod` draws her coarse, legs down. Otherwise she is in her pieces, with
 * her airscrew on a hub (`userData.prop`) and her legs on hinges
 * (`userData.gear(u)`, 0 down and locked, 1 up). Either way her outer panels
 * fold (`userData.fold(u)`), and `opts.folded` puts her down with them folded.
 */
export function bf109Model(opts = {}) {
  const geos = bf109Geometries();
  const mat = bf109Material();
  const p = new THREE.Group();
  p.userData.dynamic = true;
  p.userData.sculpt = true;
  let outer;
  if (opts.lod) {
    p.add(new THREE.Mesh(geos.lod, mat));
    outer = [foldable(p, geos.lodOutL, mat, BF109.foldL, -1), foldable(p, geos.lodOutR, mat, BF109.foldR, 1)];
  } else {
    for (const k of BF109_SEGS) {
      if (k === 'wingOutL' || k === 'wingOutR') continue;
      const m = new THREE.Mesh(geos[k], mat);
      m.name = k;
      p.add(m);
    }
    outer = [foldable(p, geos.wingOutL, mat, BF109.foldL, -1), foldable(p, geos.wingOutR, mat, BF109.foldR, 1)];
    outer[0].mesh.name = 'wingOutL';
    outer[1].mesh.name = 'wingOutR';
    const hinged = (name) => {
      const h = new THREE.Group();
      h.position.fromArray(bf109Hinge(name));
      const rest = new THREE.Group();
      bf109Rest(name, rest.quaternion);
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
    const legs = [];
    for (const k of ['gearL', 'gearR']) {
      const spec = BF109[k];
      const { h, turn, m } = hinged(k);
      legs.push({ hinge: h, turn, spec });
      m.userData.legFoot = { x: spec.at[0], z: spec.at[2], skin: spec.at[1], top: spec.at[1] };
    }
    p.userData.gear = (u) => {
      const k = Math.max(0, Math.min(1, u));
      const e = k * k * (3 - 2 * k);
      for (const { hinge, turn, spec } of legs) {
        turn.rotation.set(0, 0, spec.up * e);
        hinge.position.fromArray(spec.at);
        hinge.position.y += (spec.tuck || 0) * e;
        hinge.visible = k < 0.985;
      }
    };
  }
  p.userData.fold = (u) => {
    const k = Math.max(0, Math.min(1, u));
    const e = k * k * (3 - 2 * k);
    for (const o of outer) o.swing.quaternion.identity().slerp(o.q, e);
    p.userData.folded = k > 0.5;
  };
  p.userData.fold(opts.folded ? 1 : 0);
  for (const at of BF109.guns) {
    const o = new THREE.Object3D();
    o.position.fromArray(at);
    o.userData.muzzle = 0.15;
    p.add(o);
  }
  return p;
}
