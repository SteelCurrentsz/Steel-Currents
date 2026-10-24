// The owner's carrier Stuka, as the game draws her: the Ju 87C dive bomber
// and the Ju 87D torpedo bomber, which are the one sculpt.
//
// build/ju87-source.mjs turns the sculpt into pieces -- her body, her tail,
// each wing in two at the knee, her airscrew, her bomb doors, the gunner's
// guns, and what each of the two carries -- every point tagged with what it
// is. This decodes them, puts each variant together, and paints her in the
// shader, off the point in her own frame, the way b5nModel.js paints the B5N.
//
// The C has a bomb bay in her belly with an SC 500 in it, its doors opening
// for the dive, and an SC 250 on a rack under each outer wing; the D has an
// aerial torpedo on a crutch under her keel and her bay doors shut. Both in
// Trägergruppe 186's 72 and 73 greens over 65 blue.
import * as THREE from '../../../vendor/three.module.js';
import { decodePiece, weldPieces, paintedMaterial, LW } from './sculptKit.js';

// Her sculpt is half a megabyte, and nothing on the title screen flies her, so
// it is fetched by loadJu87() -- which loadShips (ships.js) waits on before a
// battle or the shipyard can want her.
let PIECES = null;
/** Her measurements -- hinges, guns, where she breaks -- once loadJu87() is in. */
export let JU87 = null;
let loading = null;

export function loadJu87() {
  loading ||= import('./ju87Model.data.js').then((m) => {
    PIECES = m.JU87_PIECES;
    JU87 = m.JU87_META;
  }, (e) => { loading = null; throw e; });
  return loading;
}

/** The pieces a Stuka can lose. Her legs are fixed and go with her inner panels. */
export const JU87_SEGS = ['body', 'tail', 'wingInL', 'wingInR', 'wingOutL', 'wingOutR'];

/**
 * The parts built in the level frame she was measured in, and turned up with
 * her: their own rotation is her tilt.
 */
const LEVEL = new Set(['prop', 'bayPort', 'bayStbd', 'store', 'bombL', 'bombR', 'fish', 'gun']);

let TILT_Q = null;
const tiltQ = () => (TILT_Q ||= new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -JU87.tilt));

/** The rotation a part of her sits at before it moves: see LEVEL. */
export function ju87Rest(name, out = new THREE.Quaternion()) {
  if (LEVEL.has(name)) return out.copy(tiltQ());
  return out.identity();
}

/** Where each moving part's hinge is, in her own frame. */
export function ju87Hinge(name) {
  if (name === 'prop') return JU87.prop;
  const s = JU87[name];
  return s ? s.at : [0, 0, 0];
}

let RAW = null;
const GEOS = {};
/**
 * Every piece of one of the two, decoded once and shared by everything that
 * draws her: `variant` 'c' or 'd'. The C's outer panels carry her wing racks,
 * and the D's body her torpedo crutch and her bay doors shut for good.
 */
export function ju87Geometries(variant = 'c') {
  if (GEOS[variant]) return GEOS[variant];
  if (!RAW) {
    RAW = {};
    for (const [k, b64] of Object.entries(PIECES)) RAW[k] = decodePiece(b64);
  }
  const g = { ...RAW };
  if (variant === 'c') {
    g.wingOutL = weldPieces(RAW.wingOutL, RAW.rackL);
    g.wingOutR = weldPieces(RAW.wingOutR, RAW.rackR);
    g.lodOutL = weldPieces(RAW.lodOutL, RAW.rackL);
    g.lodOutR = weldPieces(RAW.lodOutR, RAW.rackR);
  } else {
    g.body = weldPieces(RAW.body, RAW.bayShut, RAW.crutch);
    g.lod = weldPieces(RAW.lod, RAW.crutch);
  }
  GEOS[variant] = g;
  return g;
}

// The paint is laid out in the level frame she was measured in -- see
// build/ju87-source.mjs -- so her points are turned back down before
// anything is read off them.
const f = (v) => v.toFixed(5);
const paint = () => /* glsl */`
vec3 juLevel(vec3 p) {
  float y = p.y + ${f(JU87.ground)};
  float z = p.z - ${f(JU87.dz)};
  float c = ${f(Math.cos(JU87.tilt))}, s = ${f(Math.sin(JU87.tilt))};
  return vec3(p.x, y * c - z * s, y * s + z * c);
}
vec3 juPaint(float tag, vec3 q, vec3 n0) {
  if (tag > 14.5) return ${LW.HEAD};
  if (tag > 13.5) return ${LW.FISH};
  if (tag > 12.5) return ${LW.BAND};
  if (tag > 11.5) return ${LW.BOMB};
  if (tag > 10.5) return ${LW.CAVE};
  if (tag > 9.5) return ${LW.YELLOW};
  if (tag > 7.5 && tag < 8.5) return ${LW.BLUE};
  if (tag < 0.5 || tag > 8.5 || (tag > 4.5 && tag < 5.5)) {
    vec3 p = juLevel(q);
    // The normal, turned back down the same way.
    float c = ${f(Math.cos(JU87.tilt))}, s = ${f(Math.sin(JU87.tilt))};
    vec3 n = vec3(n0.x, n0.y * c - n0.z * s, n0.y * s + n0.z * c);
    float ax = abs(p.x);
    vec3 col;
    if (tag > 8.5) {
      // A wing or a tailplane: splinter on whatever faces up, blue under.
      col = n.y > 0.0 ? lwSplinter(p.x, p.z) : ${LW.BLUE};
      // The crosses, above and below, well out on the outer panels.
      float k = lwCross(ax - 4.75, p.z - 1.05, 0.62);
      if (abs(p.z) > 3.6) k = 0.0;
      if (k > 1.5) col = ${LW.BLACK}; else if (k > 0.5) col = ${LW.WHITE};
    } else {
      // Her fuselage and her trousers: splinter down to where she turns
      // under, blue beneath; her fin both sides in the greens.
      col = n.y > -0.62 ? lwSplinter(p.z, p.y + p.x * 0.3) : ${LW.BLUE};
      if (tag > 4.5) col = n.y > -0.75 ? lwSplinter(p.z, p.y + p.x) : ${LW.BLUE};
      // The cross on each side of her, abaft the greenhouse.
      if (abs(n.x) > 0.35 && tag < 0.5) {
        float k = lwCross(p.z + 2.35, p.y - 0.25, 0.46);
        if (k > 1.5) col = ${LW.BLACK}; else if (k > 0.5) col = ${LW.WHITE};
      }
      // The white band round her tail the Mediterranean units wore is not
      // hers; her spinner's black-green, and the stubs of her exhausts.
    }
    return col;
  }
  if (tag < 1.5) return ${LW.BLACKGREEN};
  if (tag < 2.5) return ${LW.GLASS};
  if (tag < 3.5) return ${LW.BLACKGREEN};
  if (tag < 4.5) return ${LW.BLACKGREEN};
  if (tag < 6.5) return ${LW.TYRE};
  return ${LW.METAL};
}
`;

let MAT = null;
/** The one material every piece of every Stuka is drawn with. */
export function ju87Material() {
  if (MAT) return MAT;
  MAT = paintedMaterial('ju87-paint', 'juPaint', paint(),
    'vSTag > 1.5 && vSTag < 2.5 ? 3.2 : (vSTag > 6.5 && vSTag < 7.5 ? 1.4 : 0.5)');
  return MAT;
}

/** Which piece of her a point in her own frame belongs to. */
export function ju87SegOf(x, y, z) {
  if (z < JU87.breaks.tail[2]) return 'tail';
  const ax = Math.abs(x);
  if (ax > Math.abs(JU87.breaks.wingOutR[0])) return x > 0 ? 'wingOutR' : 'wingOutL';
  if (ax > Math.abs(JU87.breaks.wingInR[0]) && y < JU87.breaks.wingInR[1] + 0.3) {
    return x > 0 ? 'wingInR' : 'wingInL';
  }
  return 'body';
}

/**
 * How an outer panel lies folded: rolled about its own span until its
 * leading edge is up, then swung back about the knee to lie along her side.
 */
function foldQ(side) {
  const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.45);
  const back = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), side * 1.5);
  return back.multiply(roll);
}

/** Hang an outer panel on its knee, so that it can fold back along her. */
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
 * A whole Stuka as a scene-graph model, for a deck or anything else that
 * draws one aeroplane by herself: `opts.variant` 'c' or 'd'.
 *
 * `opts.lod` draws her coarse, with what she carries still on her. Otherwise
 * she is in her pieces, with her airscrew on a hub (`userData.prop`), the C's
 * bomb doors on their hinges (`userData.bay(u)`, 0 shut, 1 open), her weapons
 * (`userData.store`, and the C's `userData.wingStores`) and the gunner's guns
 * on their mounting (`userData.gun`). Either way her outer panels fold
 * (`userData.fold(u)`, 0 spread, 1 folded back along her), and `opts.folded`
 * puts her down with them folded.
 */
export function ju87Model(opts = {}) {
  const variant = opts.variant === 'd' ? 'd' : 'c';
  const geos = ju87Geometries(variant);
  const mat = ju87Material();
  const p = new THREE.Group();
  p.userData.dynamic = true;
  p.userData.sculpt = true;
  const hinged = (name, geo = geos[name]) => {
    const h = new THREE.Group();
    h.position.fromArray(ju87Hinge(name));
    const rest = new THREE.Group();
    ju87Rest(name, rest.quaternion);
    h.add(rest);
    const turn = new THREE.Group();
    rest.add(turn);
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    turn.add(m);
    p.add(h);
    return { h, turn, m };
  };
  let outer;
  if (opts.lod) {
    p.add(new THREE.Mesh(geos.lod, mat));
    outer = [foldable(p, geos.lodOutL, mat, JU87.foldL, -1), foldable(p, geos.lodOutR, mat, JU87.foldR, 1)];
  } else {
    for (const k of JU87_SEGS) {
      if (k === 'wingOutL' || k === 'wingOutR') continue;
      const m = new THREE.Mesh(geos[k], mat);
      m.name = k;
      p.add(m);
    }
    outer = [foldable(p, geos.wingOutL, mat, JU87.foldL, -1), foldable(p, geos.wingOutR, mat, JU87.foldR, 1)];
    outer[0].mesh.name = 'wingOutL';
    outer[1].mesh.name = 'wingOutR';
    p.userData.prop = hinged('prop').turn;
    const gun = hinged('gun');
    p.userData.gun = gun.turn;
    gun.turn.rotation.order = 'YXZ';
    gun.turn.rotation.x = 0.25;
  }
  if (variant === 'c') {
    if (!opts.lod) {
      const doors = ['bayPort', 'bayStbd'].map((k) => ({ turn: hinged(k).turn, open: JU87[k].open }));
      p.userData.bay = (u) => {
        const k = Math.max(0, Math.min(1, u));
        for (const d of doors) d.turn.rotation.z = d.open * k;
      };
    }
    p.userData.store = hinged('store').h;
    p.userData.wingStores = [hinged('bombL').h, hinged('bombR').h];
    // The wing bombs hang off the panels, and fold with them.
    for (const [i, s] of [[0, outer[0]], [1, outer[1]]]) {
      const b = p.userData.wingStores[i];
      const at = new THREE.Vector3().fromArray(i ? JU87.foldR.at : JU87.foldL.at);
      b.position.sub(at);
      s.swing.add(b);
    }
  } else {
    p.userData.store = hinged('fish').h;
  }
  p.userData.fold = (u) => {
    const k = Math.max(0, Math.min(1, u));
    const e = k * k * (3 - 2 * k);
    for (const o of outer) o.swing.quaternion.identity().slerp(o.q, e);
    p.userData.folded = k > 0.5;
  };
  p.userData.fold(opts.folded ? 1 : 0);
  for (const at of JU87.guns) {
    const o = new THREE.Object3D();
    o.position.fromArray(at);
    o.userData.muzzle = 0.15;
    p.add(o);
  }
  return p;
}
