// The owner's TBF Avenger, as the game draws her.
//
// build/tbf-source.mjs turns the sculpt into pieces -- her body, her tail,
// each wing in two at the sto-wing's hinge, her airscrew, the bomb doors in
// her belly, the Mark 13 behind them, the ball turret with its fifty, and the
// three legs built for her -- every point tagged with what it is. This
// decodes them and paints her in the shader, off the point in her own frame,
// in the US Navy's 1943 tri-colour with the star-and-bar, the same as the
// Hellcats and the Dauntlesses she flies with (see hellcatModel.js).
import * as THREE from '../../../vendor/three.module.js';
import { decodePiece, weldPieces, paintedMaterial, USN } from './sculptKit.js';

// Fetched by loadAvenger() -- which loadShips (ships.js) waits on before a
// battle or the shipyard can want her -- and not imported with the game.
let PIECES = null;
/** Her measurements -- hinges, guns, where she breaks -- once loadAvenger() is in. */
export let AVENGER = null;
let loading = null;

export function loadAvenger() {
  loading ||= import('./avengerModel.data.js').then((m) => {
    PIECES = m.AVENGER_PIECES;
    AVENGER = m.AVENGER_META;
  }, (e) => { loading = null; throw e; });
  return loading;
}

/** The pieces an Avenger can lose. */
export const AVENGER_SEGS = ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR'];
/** Every part of her that moves, built level and turned up with her. */
const LEVEL = new Set(['prop', 'bayPort', 'bayStbd', 'store', 'gun', 'gearL', 'gearR', 'gearT']);

let TILT_Q = null;
const tiltQ = () => (TILT_Q ||= new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -AVENGER.tilt));

/** The rotation a part of her sits at before it moves. */
export function avengerRest(name, out = new THREE.Quaternion()) {
  return LEVEL.has(name) ? out.copy(tiltQ()) : out.identity();
}

/** Where each moving part's hinge is, in her own frame. */
export function avengerHinge(name) {
  if (name === 'prop') return AVENGER.prop;
  const s = AVENGER[name];
  return s ? s.at : [0, 0, 0];
}

let GEOS = null;
/** Every piece of her, decoded once and shared by everything that draws her. */
export function avengerGeometries() {
  if (GEOS) return GEOS;
  GEOS = {};
  for (const [k, b64] of Object.entries(PIECES)) GEOS[k] = decodePiece(b64);
  GEOS.lodDown = weldPieces(GEOS.lod, GEOS.lodGear);
  return GEOS;
}

const f = (v) => v.toFixed(5);
// The paint is laid out in the level frame she was measured in -- see
// build/tbf-source.mjs -- so her points are turned back down before anything
// is read off them. Her moving parts are written about their own hinges and
// are painted by what they are, not where.
const paint = () => /* glsl */`
vec3 tbfPaint(float tag, vec3 q, vec3 n0) {
  float c = ${f(Math.cos(AVENGER.tilt))}, s = ${f(Math.sin(AVENGER.tilt))};
  float y = q.y + ${f(AVENGER.ground)};
  float z = q.z - ${f(AVENGER.dz)};
  vec3 p = vec3(q.x, y * c - z * s, y * s + z * c);
  vec3 n = vec3(n0.x, n0.y * c - n0.z * s, n0.y * s + n0.z * c);
  float ax = abs(p.x);
  if (tag > 12.5) return ${USN.HEAD};
  if (tag > 11.5) return ${USN.FISH};
  if (tag > 10.5) return ${USN.CAVE};
  // The blades, black, with the yellow tips.
  if (tag > 9.5 && tag < 10.5) return ${USN.TIP};
  if (tag > 2.5 && tag < 4.5) return ${USN.BLADE};
  // Her legs, their doors and her bomb doors are white, the underside colour.
  if ((tag > 4.5 && tag < 5.5) || (tag > 7.5 && tag < 8.5)) return ${USN.WHITE};
  if (tag > 5.5 && tag < 6.5) return ${USN.TYRE};
  if (tag > 6.5 && tag < 7.5) return ${USN.METAL};
  if (tag > 0.5 && tag < 1.5) return ${USN.ENGINE};
  if (tag > 1.5 && tag < 2.5) {
    // The long hood: the windscreen's frame, the hoops across her between
    // the pilot's, the radioman's and the gunner's places, and the sill
    // along her; the rest is glass. The turret's ball, which is written
    // about its own ring, has its hoop round its waist and a frame over it.
    if (q.y < 0.0 || length(q.xz) < 0.75) {
      if (abs(q.y - 0.1) < 0.03 || abs(q.x) < 0.025) return ${USN.SEA};
      return ${USN.GLASS};
    }
    float fz = min(min(abs(p.z - 3.12), abs(p.z - 2.35)), min(min(abs(p.z - 1.55), abs(p.z - 0.8)), abs(p.z - 0.05)));
    if (fz < 0.04 || p.y < 0.36) return ${USN.SEA};
    return ${USN.GLASS};
  }
  vec3 col;
  float k = 0.0;
  if (tag > 8.5) {
    // A wing or a tailplane: sea blue on whatever faces up, white under; the
    // star on top of her port wing and under her starboard one.
    col = n.y > 0.0 ? ${USN.SEA} : ${USN.WHITE};
    if (abs(p.z) < 3.5) {
      if (n.y > 0.0 && p.x > 0.0) k = usnStar(vec2(p.x - 5.6, p.z - 1.6), 0.58);
      if (n.y < 0.0 && p.x < 0.0) k = usnStar(vec2(p.x + 5.6, p.z - 1.6), 0.58);
    }
  } else {
    // Her fuselage: sea blue along her back, intermediate blue down her sides
    // and on her fin, and white under her, shading into each other the way a
    // spray gun leaves it. Laid by how far up or down her a point is from her
    // axis rather than by which way it faces, because the sculpt's skin is too
    // rough round her wing roots to draw a straight line by its normals.
    float yc = mix(-0.85, -0.45, clamp((4.0 - p.z) / 8.0, 0.0, 1.0));
    float h = mix(1.05, 0.75, clamp((-1.0 - p.z) / 5.0, 0.0, 1.0));
    float v = (p.y - yc) / h;
    float up = smoothstep(0.55, 0.75, v);
    float down = smoothstep(-0.45, -0.65, v);
    col = mix(mix(${USN.MID}, ${USN.SEA}, up), ${USN.WHITE}, down);
    if (p.z < -4.0 && p.y > 0.3) col = ${USN.MID};
    // The star-and-bar on each side of her, abaft the turret.
    if (abs(n.x) > 0.3 && ax < 1.0 && p.z < -1.2) k = usnStar(vec2(p.z + 2.75, p.y + 0.62), 0.52);
  }
  if (k > 1.5) col = ${USN.BLUE}; else if (k > 0.5) col = ${USN.STAR};
  return col;
}
`;

let MAT = null;
/** The one material every piece of every Avenger is drawn with. */
export function avengerMaterial() {
  if (MAT) return MAT;
  MAT = paintedMaterial('tbf-paint', 'tbfPaint', paint(),
    'vSTag > 1.5 && vSTag < 2.5 ? 3.2 : (vSTag > 6.5 && vSTag < 7.5 ? 1.4 : 0.35)');
  return MAT;
}

/** Which piece of her a point in her own frame belongs to. */
export function avengerSegOf(x, y, z) {
  if (z < AVENGER.breaks.tail[2]) return 'tail';
  const ax = Math.abs(x);
  if (ax > Math.abs(AVENGER.breaks.wingOutR[0])) return x > 0 ? 'wingOutR' : 'wingOutL';
  if (ax > Math.abs(AVENGER.breaks.wingInR[0]) && y < AVENGER.breaks.wingInR[1] + 0.5) {
    return x > 0 ? 'wingInR' : 'wingInL';
  }
  return 'body';
}

/**
 * How an outer panel lies folded on the Grumman sto-wing: turned about its
 * own span until its leading edge is down, then swung aft about the hinge to
 * lie along her side, its upper surface outboard.
 */
function foldQ(side) {
  const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.48);
  const back = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), side * 1.68);
  return back.multiply(roll);
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
 * A whole Avenger as a scene-graph model, for a deck or anything else that
 * draws one aeroplane by herself.
 *
 * `opts.lod` draws her coarse, legs down and her doors shut. Otherwise she is
 * in her pieces, with her airscrew on a hub (`userData.prop`), her legs on
 * hinges (`userData.gear(u)`, 0 down and locked, 1 up), her bomb doors
 * (`userData.bay(u)`, 0 shut, 1 open), the fish in her bay
 * (`userData.store`) and the turret on its ring (`userData.gun`). Either way
 * her outer panels fold (`userData.fold(u)`), and `opts.folded` puts her down
 * with them folded.
 */
export function avengerModel(opts = {}) {
  const geos = avengerGeometries();
  const mat = avengerMaterial();
  const p = new THREE.Group();
  p.userData.dynamic = true;
  p.userData.sculpt = true;
  let outer;
  if (opts.lod) {
    p.add(new THREE.Mesh(geos.lodDown, mat));
    outer = [foldable(p, geos.lodOutL, mat, AVENGER.foldL, -1), foldable(p, geos.lodOutR, mat, AVENGER.foldR, 1)];
  } else {
    for (const k of AVENGER_SEGS) {
      if (k === 'wingOutL' || k === 'wingOutR') continue;
      const m = new THREE.Mesh(geos[k], mat);
      m.name = k;
      p.add(m);
    }
    outer = [foldable(p, geos.wingOutL, mat, AVENGER.foldL, -1), foldable(p, geos.wingOutR, mat, AVENGER.foldR, 1)];
    outer[0].mesh.name = 'wingOutL';
    outer[1].mesh.name = 'wingOutR';
    const hinged = (name) => {
      const h = new THREE.Group();
      h.position.fromArray(avengerHinge(name));
      const rest = new THREE.Group();
      avengerRest(name, rest.quaternion);
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
    const gun = hinged('gun');
    p.userData.gun = gun.turn;
    gun.turn.rotation.order = 'YXZ';
    const doors = ['bayPort', 'bayStbd'].map((k) => ({ turn: hinged(k).turn, open: AVENGER[k].open }));
    p.userData.bay = (u) => {
      const k = Math.max(0, Math.min(1, u));
      for (const d of doors) d.turn.rotation.z = d.open * k;
    };
    p.userData.store = hinged('store').h;
    const legs = [];
    for (const k of ['gearL', 'gearR', 'gearT']) {
      const spec = AVENGER[k];
      const { h, turn, m } = hinged(k);
      legs.push({ hinge: h, turn, spec });
      m.userData.legFoot = { x: spec.at[0], z: spec.at[2], skin: spec.at[1], top: spec.at[1] };
    }
    p.userData.gear = (u) => {
      const k = Math.max(0, Math.min(1, u));
      const e = k * k * (3 - 2 * k);
      for (const { hinge, turn, spec } of legs) {
        if (spec.axis === 'x') turn.rotation.set(spec.up * e, 0, 0);
        else turn.rotation.set(0, 0, spec.up * e);
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
  for (const at of AVENGER.guns) {
    const o = new THREE.Object3D();
    o.position.fromArray(at);
    o.userData.muzzle = 0.15;
    p.add(o);
  }
  return p;
}
