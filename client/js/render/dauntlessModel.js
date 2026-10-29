// The owner's SBD Dauntless, as the game draws her.
//
// build/sbd-source.mjs turns the sculpt into pieces -- her body, her tail,
// each wing in two, her airscrew, her two main legs, the gunner's twin
// thirties, the displacing trapeze with the thousand-pounder on it and a
// hundred-pounder under each outer wing -- every point tagged with what it
// is. This decodes them and paints her in the shader, off the point in her own
// frame, in the US Navy's 1943 tri-colour with the star-and-bar, the same as
// the Hellcat she flies with (see hellcatModel.js).
import * as THREE from '../../../vendor/three.module.js';
import { decodePiece, weldPieces, paintedMaterial, USN } from './sculptKit.js';

// Fetched by loadDauntless() -- which loadShips (ships.js) waits on before a
// battle or the shipyard can want her -- and not imported with the game.
let PIECES = null;
/** Her measurements -- hinges, guns, where she breaks -- once loadDauntless() is in. */
export let DAUNTLESS = null;
let loading = null;

export function loadDauntless() {
  loading ||= import('./dauntlessModel.data.js').then((m) => {
    PIECES = m.DAUNTLESS_PIECES;
    DAUNTLESS = m.DAUNTLESS_META;
  }, (e) => { loading = null; throw e; });
  return loading;
}

/** The pieces a Dauntless can lose. Her tail wheel is fixed and goes with her tail. */
export const DAUNTLESS_SEGS = ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR'];

/**
 * The parts built in the level frame she was measured in, and turned up with
 * her: their own rotation is her tilt.
 */
const LEVEL = new Set(['prop', 'gearL', 'gearR', 'gun', 'trapeze', 'store', 'bombL', 'bombR']);

let TILT_Q = null;
const tiltQ = () => (TILT_Q ||= new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -DAUNTLESS.tilt));

/** The rotation a part of her sits at before it moves: see LEVEL. */
export function dauntlessRest(name, out = new THREE.Quaternion()) {
  if (LEVEL.has(name)) return out.copy(tiltQ());
  return out.identity();
}

/** Where each moving part's hinge is, in her own frame. */
export function dauntlessHinge(name) {
  if (name === 'prop') return DAUNTLESS.prop;
  const s = DAUNTLESS[name];
  return s ? s.at : [0, 0, 0];
}

let GEOS = null;
/**
 * Every piece of her, decoded once and shared by everything that draws her.
 * Her outer panels carry the racks for her wing bombs, and her body the
 * fittings her trapeze hangs on.
 */
export function dauntlessGeometries() {
  if (GEOS) return GEOS;
  const raw = {};
  for (const [k, b64] of Object.entries(PIECES)) raw[k] = decodePiece(b64);
  GEOS = { ...raw };
  GEOS.body = weldPieces(raw.body, raw.lugs);
  GEOS.wingOutL = weldPieces(raw.wingOutL, raw.rackL);
  GEOS.wingOutR = weldPieces(raw.wingOutR, raw.rackR);
  GEOS.lod = weldPieces(raw.lod, raw.lugs);
  GEOS.lodOutL = weldPieces(raw.lodOutL, raw.rackL);
  GEOS.lodOutR = weldPieces(raw.lodOutR, raw.rackR);
  return GEOS;
}

// The paint is laid out in the level frame she was measured in -- see
// build/sbd-source.mjs -- so her points are turned back down before anything
// is read off them. Her moving parts are written about their own hinges and
// are painted by what they are, not where.
const f = (v) => v.toFixed(5);
const paint = () => /* glsl */`
vec3 sbdPaint(float tag, vec3 q, vec3 n0) {
  float c = ${f(Math.cos(DAUNTLESS.tilt))}, s = ${f(Math.sin(DAUNTLESS.tilt))};
  float y = q.y + ${f(DAUNTLESS.ground)};
  float z = q.z - ${f(DAUNTLESS.dz)};
  vec3 p = vec3(q.x, y * c - z * s, y * s + z * c);
  vec3 n = vec3(n0.x, n0.y * c - n0.z * s, n0.y * s + n0.z * c);
  float ax = abs(p.x);
  if (tag > 11.5) return ${USN.BAND};
  if (tag > 10.5) return ${USN.BOMB};
  if (tag > 9.5) return ${USN.TIP};
  if (tag > 7.5 && tag < 8.5) return ${USN.CAVE};
  if (tag > 6.5 && tag < 7.5) return ${USN.METAL};
  if (tag > 5.5 && tag < 6.5) return ${USN.TYRE};
  if (tag > 4.5 && tag < 5.5) return ${USN.WHITE};
  if (tag > 2.5 && tag < 4.5) return ${USN.BLADE};
  if (tag > 1.5 && tag < 2.5) return ${USN.GLASS};
  if (tag > 0.5 && tag < 1.5) return ${USN.ENGINE};
  vec3 col;
  float k = 0.0;
  if (tag > 8.5) {
    // A wing or a tailplane: sea blue on whatever faces up, white under, and
    // the star on top of her port wing and under her starboard one.
    col = n.y > 0.0 ? ${USN.SEA} : ${USN.WHITE};
    if (abs(p.z) < 3.0) {
      if (n.y > 0.0 && p.x > 0.0) k = usnStar(vec2(p.x - 4.3, p.z - 1.0), 0.48);
      if (n.y < 0.0 && p.x < 0.0) k = usnStar(vec2(p.x + 4.3, p.z - 1.0), 0.48);
    }
  } else {
    // Her fuselage, her greenhouse's frames and her spats of fairing: sea
    // blue along her back, intermediate blue down her sides and on her fin,
    // white under her.
    float up = smoothstep(0.35, 0.65, n.y);
    float down = smoothstep(-0.25, -0.5, n.y);
    col = mix(mix(${USN.MID}, ${USN.SEA}, up), ${USN.WHITE}, down);
    if (p.z < -2.9 && p.y > 0.4 && abs(n.x) > 0.5) col = ${USN.MID};
    // The star-and-bar on each side of her, abaft the gunner.
    if (abs(n.x) > 0.3 && ax < 0.8) k = usnStar(vec2(p.z + 2.0, p.y - 0.05), 0.36);
  }
  if (k > 1.5) col = ${USN.BLUE}; else if (k > 0.5) col = ${USN.STAR};
  return col;
}
`;

let MAT = null;
/** The one material every piece of every Dauntless is drawn with. */
export function dauntlessMaterial() {
  if (MAT) return MAT;
  MAT = paintedMaterial('sbd-paint', 'sbdPaint', paint(),
    'vSTag > 1.5 && vSTag < 2.5 ? 3.2 : (vSTag > 6.5 && vSTag < 7.5 ? 1.4 : 0.35)');
  return MAT;
}

/** Which piece of her a point in her own frame belongs to. */
export function dauntlessSegOf(x, y, z) {
  if (z < DAUNTLESS.breaks.tail[2]) return 'tail';
  const ax = Math.abs(x);
  if (ax > Math.abs(DAUNTLESS.breaks.wingOutR[0])) return x > 0 ? 'wingOutR' : 'wingOutL';
  if (ax > Math.abs(DAUNTLESS.breaks.wingInR[0]) && y < DAUNTLESS.breaks.wingInR[1] + 0.5) {
    return x > 0 ? 'wingInR' : 'wingInL';
  }
  return 'body';
}

/**
 * A whole Dauntless as a scene-graph model, for a deck or anything else that
 * draws one aeroplane by herself. An SBD did not fold her wings: she is
 * twelve and a half metres across on the deck and in the hangar.
 *
 * `opts.lod` draws her coarse, legs down. Otherwise she is in her pieces, with
 * her airscrew on a hub (`userData.prop`), her legs on hinges
 * (`userData.gear(u)`, 0 down and locked, 1 up), the trapeze and the bomb on
 * it swinging down together (`userData.bay(u)`, 0 stowed, 1 swung out), and
 * the gunner's guns on their mounting (`userData.gun`). Her weapons are
 * `userData.store` and `userData.wingStores` either way.
 */
export function dauntlessModel(opts = {}) {
  const geos = dauntlessGeometries();
  const mat = dauntlessMaterial();
  const p = new THREE.Group();
  p.userData.dynamic = true;
  p.userData.sculpt = true;
  const hinged = (name) => {
    const h = new THREE.Group();
    h.position.fromArray(dauntlessHinge(name));
    const rest = new THREE.Group();
    dauntlessRest(name, rest.quaternion);
    h.add(rest);
    const turn = new THREE.Group();
    rest.add(turn);
    const m = new THREE.Mesh(geos[name], mat);
    m.name = name;
    turn.add(m);
    p.add(h);
    return { h, turn, m };
  };
  if (opts.lod) {
    p.add(new THREE.Mesh(geos.lod, mat));
    p.add(new THREE.Mesh(geos.lodOutL, mat));
    p.add(new THREE.Mesh(geos.lodOutR, mat));
  } else {
    for (const k of DAUNTLESS_SEGS) {
      const m = new THREE.Mesh(geos[k], mat);
      m.name = k;
      p.add(m);
    }
    p.userData.prop = hinged('prop').turn;
    const gun = hinged('gun');
    p.userData.gun = gun.turn;
    gun.turn.rotation.order = 'YXZ';
    const legs = [];
    for (const k of ['gearL', 'gearR']) {
      const spec = DAUNTLESS[k];
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
  const yoke = hinged('trapeze');
  const store = hinged('store');
  p.userData.store = store.h;
  p.userData.bay = (u) => {
    const k = Math.max(0, Math.min(1, u));
    yoke.turn.rotation.x = DAUNTLESS.trapeze.open * k;
    store.turn.rotation.x = DAUNTLESS.store.open * k;
  };
  p.userData.wingStores = [hinged('bombL').h, hinged('bombR').h];
  p.userData.fold = null;
  for (const at of DAUNTLESS.guns) {
    const o = new THREE.Object3D();
    o.position.fromArray(at);
    o.userData.muzzle = 0.15;
    p.add(o);
  }
  return p;
}
