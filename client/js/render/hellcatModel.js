// The owner's F6F Hellcat, as the game draws her.
//
// build/hellcat-source.mjs turns the sculpt into pieces -- her body, her tail,
// each wing in two at the sto-wing's hinge, her airscrew and the three legs
// built for her -- every point tagged with what it is. This decodes them and
// paints her in the shader, off the point in her own frame, the way
// bf109Model.js paints the Messerschmitt: the US Navy's 1943 tri-colour, sea
// blue over intermediate blue over white, with the star-and-bar on her sides,
// on top of her port wing and under her starboard one.
import * as THREE from '../../../vendor/three.module.js';
import { decodePiece, weldPieces, paintedMaterial, USN } from './sculptKit.js';

// Fetched by loadHellcat() -- which loadShips (ships.js) waits on before a
// battle or the shipyard can want her -- and not imported with the game.
let PIECES = null;
/** Her measurements -- hinges, guns, where she breaks -- once loadHellcat() is in. */
export let HELLCAT = null;
let loading = null;

export function loadHellcat() {
  loading ||= import('./hellcatModel.data.js').then((m) => {
    PIECES = m.HELLCAT_PIECES;
    HELLCAT = m.HELLCAT_META;
  }, (e) => { loading = null; throw e; });
  return loading;
}

/** The pieces a Hellcat can lose, and the parts of her that move. */
export const HELLCAT_SEGS = ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR'];
export const HELLCAT_PARTS = ['prop', 'gearL', 'gearR', 'gearT'];

/** Every part of her that moves is built level and turned up with her. */
let TILT_Q = null;
const tiltQ = () => (TILT_Q ||= new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -HELLCAT.tilt));

/** The rotation a part of her sits at before it moves. */
export function hellcatRest(name, out = new THREE.Quaternion()) {
  return HELLCAT_PARTS.includes(name) ? out.copy(tiltQ()) : out.identity();
}

/** Where each moving part's hinge is, in her own frame. */
export function hellcatHinge(name) {
  if (name === 'prop') return HELLCAT.prop;
  const s = HELLCAT[name];
  return s ? s.at : [0, 0, 0];
}

let GEOS = null;
/** Every piece of her, decoded once and shared by everything that draws her. */
export function hellcatGeometries() {
  if (GEOS) return GEOS;
  GEOS = {};
  for (const [k, b64] of Object.entries(PIECES)) GEOS[k] = decodePiece(b64);
  GEOS.lodDown = weldPieces(GEOS.lod, GEOS.lodGear);
  return GEOS;
}

const f = (v) => v.toFixed(5);
// The paint is laid out in the level frame she was measured in -- see
// build/hellcat-source.mjs -- so her points are turned back down before
// anything is read off them. Her moving parts are written about their own
// hinges and are painted by what they are, not where.
const paint = () => /* glsl */`
vec3 hcPaint(float tag, vec3 q, vec3 n0) {
  float c = ${f(Math.cos(HELLCAT.tilt))}, s = ${f(Math.sin(HELLCAT.tilt))};
  float y = q.y + ${f(HELLCAT.ground)};
  float z = q.z - ${f(HELLCAT.dz)};
  vec3 p = vec3(q.x, y * c - z * s, y * s + z * c);
  vec3 n = vec3(n0.x, n0.y * c - n0.z * s, n0.y * s + n0.z * c);
  float ax = abs(p.x);
  // The blades, black, with the yellow tips that keep a deck crew's heads on.
  if (tag > 9.5) return ${USN.TIP};
  if (tag > 2.5 && tag < 4.5) return ${USN.BLADE};
  // Her legs, their doors and her wells are white, the underside colour.
  if ((tag > 4.5 && tag < 5.5) || (tag > 7.5 && tag < 8.5)) return ${USN.WHITE};
  if (tag > 5.5 && tag < 6.5) return ${USN.TYRE};
  if (tag > 6.5 && tag < 7.5) return ${USN.METAL};
  if (tag > 0.5 && tag < 1.5) return ${USN.ENGINE};
  if (tag > 1.5 && tag < 2.5) {
    // The hood: the windscreen's frame and the sliding canopy's two hoops
    // across her, and the sill along her; the rest is glass.
    float fz = min(min(abs(p.z - 1.62), abs(p.z - 1.32)), min(abs(p.z - 0.72), abs(p.z - 0.18)));
    if (fz < 0.035 || p.y < 1.02) return ${USN.SEA};
    return ${USN.GLASS};
  }
  vec3 col;
  float k = 0.0;
  if (tag > 8.5) {
    // A wing or a tailplane: sea blue on whatever faces up, white under; the
    // star on top of her port wing and under her starboard one, its bars
    // along the span.
    col = n.y > 0.0 ? ${USN.SEA} : ${USN.WHITE};
    if (abs(p.z) < 3.0) {
      if (n.y > 0.0 && p.x > 0.0) k = usnStar(vec2(p.x - 4.45, p.z - 1.38), 0.46);
      if (n.y < 0.0 && p.x < 0.0) k = usnStar(vec2(p.x + 4.45, p.z - 1.38), 0.46);
    }
  } else {
    // Her fuselage: sea blue along her back, intermediate blue down her sides
    // and on her fin, shading into each other the way a spray gun leaves it,
    // and white under her.
    float up = smoothstep(0.35, 0.65, n.y);
    float down = smoothstep(-0.25, -0.5, n.y);
    col = mix(mix(${USN.MID}, ${USN.SEA}, up), ${USN.WHITE}, down);
    if (p.z < -2.9 && p.y > 0.5 && abs(n.x) > 0.5) col = ${USN.MID};
    // The star-and-bar on each side of her, abaft the cockpit.
    if (abs(n.x) > 0.3 && ax < 0.9) k = usnStar(vec2(p.z + 1.55, p.y - 0.05), 0.40);
  }
  if (k > 1.5) col = ${USN.BLUE}; else if (k > 0.5) col = ${USN.STAR};
  return col;
}
`;

let MAT = null;
/** The one material every piece of every Hellcat is drawn with. */
export function hellcatMaterial() {
  if (MAT) return MAT;
  MAT = paintedMaterial('hellcat-paint', 'hcPaint', paint(),
    'vSTag > 1.5 && vSTag < 2.5 ? 3.2 : (vSTag > 6.5 && vSTag < 7.5 ? 1.4 : 0.35)');
  return MAT;
}

/** Which piece of her a point in her own frame belongs to. */
export function hellcatSegOf(x, y, z) {
  if (z < HELLCAT.breaks.tail[2]) return 'tail';
  const ax = Math.abs(x);
  if (ax > Math.abs(HELLCAT.breaks.wingOutR[0])) return x > 0 ? 'wingOutR' : 'wingOutL';
  if (ax > Math.abs(HELLCAT.breaks.wingInR[0]) && y < HELLCAT.breaks.wingInR[1] + 0.5) {
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
  const back = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), side * 1.52);
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
 * A whole Hellcat as a scene-graph model, for a deck or anything else that
 * draws one aeroplane by herself.
 *
 * `opts.lod` draws her coarse, legs down. Otherwise she is in her pieces, with
 * her airscrew on a hub (`userData.prop`) and her legs on hinges
 * (`userData.gear(u)`, 0 down and locked, 1 up). Either way her outer panels
 * fold (`userData.fold(u)`), and `opts.folded` puts her down with them folded.
 */
export function hellcatModel(opts = {}) {
  const geos = hellcatGeometries();
  const mat = hellcatMaterial();
  const p = new THREE.Group();
  p.userData.dynamic = true;
  p.userData.sculpt = true;
  let outer;
  if (opts.lod) {
    p.add(new THREE.Mesh(geos.lodDown, mat));
    outer = [foldable(p, geos.lodOutL, mat, HELLCAT.foldL, -1), foldable(p, geos.lodOutR, mat, HELLCAT.foldR, 1)];
  } else {
    for (const k of HELLCAT_SEGS) {
      if (k === 'wingOutL' || k === 'wingOutR') continue;
      const m = new THREE.Mesh(geos[k], mat);
      m.name = k;
      p.add(m);
    }
    outer = [foldable(p, geos.wingOutL, mat, HELLCAT.foldL, -1), foldable(p, geos.wingOutR, mat, HELLCAT.foldR, 1)];
    outer[0].mesh.name = 'wingOutL';
    outer[1].mesh.name = 'wingOutR';
    const hinged = (name) => {
      const h = new THREE.Group();
      h.position.fromArray(hellcatHinge(name));
      const rest = new THREE.Group();
      hellcatRest(name, rest.quaternion);
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
    for (const k of ['gearL', 'gearR', 'gearT']) {
      const spec = HELLCAT[k];
      const { h, turn, m } = hinged(k);
      legs.push({ hinge: h, turn, spec });
      m.userData.legFoot = { x: spec.at[0], z: spec.at[2], skin: spec.at[1], top: spec.at[1] };
    }
    p.userData.gear = (u) => {
      const k = Math.max(0, Math.min(1, u));
      const e = k * k * (3 - 2 * k);
      for (const { hinge, turn, spec } of legs) {
        turn.rotation.set(spec.up * e, 0, 0);
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
  for (const at of HELLCAT.guns) {
    const o = new THREE.Object3D();
    o.position.fromArray(at);
    o.userData.muzzle = 0.15;
    p.add(o);
  }
  return p;
}
