// The owner's TBD-1 Devastator, as the game draws her.
//
// build/tbd-source.mjs turns the sculpt into pieces -- her body, her tail,
// each wing in two at the fold, her airscrew, her two main legs, the gunner's
// thirty and the Mark 13 slung under her belly -- every point tagged with what
// it is. This decodes them and paints her in the shader, off the point in her
// own frame, the way the Dauntless is painted (see dauntlessModel.js): the
// non-specular blue-gray over light gray the Navy's carrier aircraft wore in
// the spring of 1942, with the white star in its blue disc and no bars -- the
// red ball in the middle of it was painted out that May, a month before
// Midway.
import * as THREE from '../../../vendor/three.module.js';
import { decodePiece, weldPieces, paintedMaterial, USN } from './sculptKit.js';

// Fetched by loadDevastator() -- which loadShips (ships.js) waits on before a
// battle or the shipyard can want her -- and not imported with the game.
let PIECES = null;
/** Her measurements -- hinges, guns, where she breaks -- once loadDevastator() is in. */
export let DEVASTATOR = null;
let loading = null;

export function loadDevastator() {
  loading ||= import('./devastatorModel.data.js').then((m) => {
    PIECES = m.DEVASTATOR_PIECES;
    DEVASTATOR = m.DEVASTATOR_META;
  }, (e) => { loading = null; throw e; });
  return loading;
}

/** The pieces a Devastator can lose. Her tail wheel is fixed and goes with her tail. */
export const DEVASTATOR_SEGS = ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR'];

/**
 * The parts built in the level frame she was measured in, and turned up with
 * her: their own rotation is her tilt.
 */
const LEVEL = new Set(['prop', 'gearL', 'gearR', 'gun', 'store']);

let TILT_Q = null;
const tiltQ = () => (TILT_Q ||= new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -DEVASTATOR.tilt));

/** The rotation a part of her sits at before it moves: see LEVEL. */
export function devastatorRest(name, out = new THREE.Quaternion()) {
  if (LEVEL.has(name)) return out.copy(tiltQ());
  return out.identity();
}

/** Where each moving part's hinge is, in her own frame. */
export function devastatorHinge(name) {
  if (name === 'prop') return DEVASTATOR.prop;
  const s = DEVASTATOR[name];
  return s ? s.at : [0, 0, 0];
}

let GEOS = null;
/** Every piece of her, decoded once and shared by everything that draws her. */
export function devastatorGeometries() {
  if (GEOS) return GEOS;
  const raw = {};
  for (const [k, b64] of Object.entries(PIECES)) raw[k] = decodePiece(b64);
  GEOS = { ...raw };
  // The crutch the torpedo hangs in stays with her when it goes.
  GEOS.body = weldPieces(raw.body, raw.crutch);
  GEOS.lod = weldPieces(raw.lod, raw.crutch);
  return GEOS;
}

// Blue-gray over light gray, as she was at Midway.
const BLUEGRAY = 'vec3(0.0844, 0.1301, 0.1878)';
const LIGHTGRAY = 'vec3(0.4342, 0.4564, 0.4452)';

// The paint is laid out in the level frame she was measured in -- see
// build/tbd-source.mjs -- so her points are turned back down before anything
// is read off them. Her moving parts are written about their own hinges and
// are painted by what they are, not where.
const f = (v) => v.toFixed(5);
const paint = () => /* glsl */`
float tbdStar(vec2 p, float r) {
  if (length(p) >= r) return 0.0;
  return usnStar5(p, r * 0.98, 0.38) < 0.0 ? 1.0 : 2.0;
}
vec3 tbdPaint(float tag, vec3 q, vec3 n0) {
  float c = ${f(Math.cos(DEVASTATOR.tilt))}, s = ${f(Math.sin(DEVASTATOR.tilt))};
  float y = q.y + ${f(DEVASTATOR.ground)};
  float z = q.z - ${f(DEVASTATOR.dz)};
  vec3 p = vec3(q.x, y * c - z * s, y * s + z * c);
  vec3 n = vec3(n0.x, n0.y * c - n0.z * s, n0.y * s + n0.z * c);
  float ax = abs(p.x);
  if (tag > 11.5) return ${USN.HEAD};
  if (tag > 10.5) return ${USN.FISH};
  if (tag > 9.5) return ${USN.TIP};
  if (tag > 7.5 && tag < 8.5) return ${USN.CAVE};
  if (tag > 6.5 && tag < 7.5) return ${USN.METAL};
  if (tag > 5.5 && tag < 6.5) return ${USN.TYRE};
  if (tag > 4.5 && tag < 5.5) return ${LIGHTGRAY};
  if (tag > 2.5 && tag < 4.5) return ${USN.BLADE};
  if (tag > 1.5 && tag < 2.5) return ${USN.GLASS};
  if (tag > 0.5 && tag < 1.5) return ${USN.ENGINE};
  vec3 col;
  float k = 0.0;
  if (tag > 8.5) {
    // A wing or a tailplane: blue-gray on whatever faces up, light gray
    // under, and the star on top of her port wing and under her starboard one.
    col = n.y > 0.0 ? ${BLUEGRAY} : ${LIGHTGRAY};
    if (abs(p.z - 1.4) < 1.4) {
      if (n.y > 0.0 && p.x > 0.0) k = tbdStar(vec2(p.x - 5.6, p.z - 1.45), 0.62);
      if (n.y < 0.0 && p.x < 0.0) k = tbdStar(vec2(p.x + 5.6, p.z - 1.45), 0.62);
    }
  } else {
    // Her fuselage: blue-gray over her back and down her sides to the line
    // of her wing roots, light gray under her.
    float down = smoothstep(-0.15, -0.45, n.y);
    col = mix(${BLUEGRAY}, ${LIGHTGRAY}, down);
    if (p.y < -1.35 && p.z > -2.6) col = ${LIGHTGRAY};
    // The star on each side of her, abaft the gunner.
    if (abs(n.x) > 0.3 && ax < 0.7) k = tbdStar(vec2(p.z + 2.05, p.y + 0.72), 0.42);
  }
  if (k > 1.5) col = ${USN.BLUE}; else if (k > 0.5) col = ${USN.STAR};
  return col;
}
`;

let MAT = null;
/** The one material every piece of every Devastator is drawn with. */
export function devastatorMaterial() {
  if (MAT) return MAT;
  MAT = paintedMaterial('tbd-paint', 'tbdPaint', paint(),
    'vSTag > 1.5 && vSTag < 2.5 ? 3.2 : (vSTag > 6.5 && vSTag < 7.5 ? 1.4 : 0.3)');
  return MAT;
}

/** Which piece of her a point in her own frame belongs to. */
export function devastatorSegOf(x, y, z) {
  if (z < DEVASTATOR.breaks.tail[2]) return 'tail';
  const ax = Math.abs(x);
  if (ax > Math.abs(DEVASTATOR.breaks.wingOutR[0])) return x > 0 ? 'wingOutR' : 'wingOutL';
  if (ax > Math.abs(DEVASTATOR.breaks.wingInR[0]) && y < DEVASTATOR.breaks.wingInR[1] + 0.5) {
    return x > 0 ? 'wingInR' : 'wingInL';
  }
  return 'body';
}

/**
 * An outer panel on its fold: a Devastator's folded straight up about a
 * fore-and-aft hinge on the top of the wing, until it stood a little past
 * upright over her.
 */
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
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side * 1.72);
  return { swing, q, mesh: m };
}

/**
 * A whole Devastator as a scene-graph model, for a deck or anything else that
 * draws one aeroplane by herself.
 *
 * `opts.lod` draws her coarse, legs down. Otherwise she is in her pieces, with
 * her airscrew on a hub (`userData.prop`), her legs on hinges
 * (`userData.gear(u)`, 0 down and locked, 1 up) and the gunner's gun on its
 * mounting (`userData.gun`). Either way her outer panels fold
 * (`userData.fold(u)`), `opts.folded` puts her down with them folded, and her
 * torpedo is `userData.store`.
 */
export function devastatorModel(opts = {}) {
  const geos = devastatorGeometries();
  const mat = devastatorMaterial();
  const p = new THREE.Group();
  p.userData.dynamic = true;
  p.userData.sculpt = true;
  const hinged = (name) => {
    const h = new THREE.Group();
    h.position.fromArray(devastatorHinge(name));
    const rest = new THREE.Group();
    devastatorRest(name, rest.quaternion);
    h.add(rest);
    const turn = new THREE.Group();
    rest.add(turn);
    const m = new THREE.Mesh(geos[name], mat);
    m.name = name;
    turn.add(m);
    p.add(h);
    return { h, turn, m };
  };
  let outer;
  if (opts.lod) {
    p.add(new THREE.Mesh(geos.lod, mat));
    outer = [foldable(p, geos.lodOutL, mat, DEVASTATOR.foldL, -1), foldable(p, geos.lodOutR, mat, DEVASTATOR.foldR, 1)];
  } else {
    for (const k of DEVASTATOR_SEGS) {
      if (k === 'wingOutL' || k === 'wingOutR') continue;
      const m = new THREE.Mesh(geos[k], mat);
      m.name = k;
      p.add(m);
    }
    outer = [foldable(p, geos.wingOutL, mat, DEVASTATOR.foldL, -1), foldable(p, geos.wingOutR, mat, DEVASTATOR.foldR, 1)];
    outer[0].mesh.name = 'wingOutL';
    outer[1].mesh.name = 'wingOutR';
    p.userData.prop = hinged('prop').turn;
    const gun = hinged('gun');
    p.userData.gun = gun.turn;
    gun.turn.rotation.order = 'YXZ';
    const legs = [];
    for (const k of ['gearL', 'gearR']) {
      const spec = DEVASTATOR[k];
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
      }
    };
  }
  const store = hinged('store');
  p.userData.store = store.h;
  p.userData.fold = (u) => {
    const k = Math.max(0, Math.min(1, u));
    const e = k * k * (3 - 2 * k);
    for (const o of outer) o.swing.quaternion.identity().slerp(o.q, e);
    p.userData.folded = k > 0.5;
  };
  p.userData.fold(opts.folded ? 1 : 0);
  for (const at of DEVASTATOR.guns) {
    const o = new THREE.Object3D();
    o.position.fromArray(at);
    o.userData.muzzle = 0.15;
    p.add(o);
  }
  return p;
}
