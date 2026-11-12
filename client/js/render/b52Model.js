// The owner's B-52H, as the game draws her.
//
// build/b52-source.mjs turns the model into her airframe and her glass, each
// painted at every point off the model's own textures. This decodes them and
// hangs what she carries on her: twelve AGM-86B cruise missiles on the two
// heavy stores adapters under her wings, six a side, and eight more on the
// rotary launcher in her bay. Each one is a mesh of its own in
// `userData.rack`, in the order she lets them go, so whatever holds her can
// take one off as it is fired.
import * as THREE from '../../../vendor/three.module.js';
import { decodePiece } from './sculpt.js';

// Fetched by loadB52() -- which loadShips waits on with the other aircraft --
// and not imported with the game.
let PIECES = null;
/** Her measurements, once loadB52() is in. */
export let B52 = null;
let loading = null;

export function loadB52() {
  loading ||= import('./b52Model.data.js').then((m) => {
    PIECES = m.B52_PIECES;
    B52 = m.B52_META;
  }, (e) => { loading = null; throw e; });
  return loading;
}

/** Whether she can be built now, without waiting for anything. */
export function b52Ready() { return !!PIECES; }

let GEOS = null;
/** Every piece of her, decoded once and shared by everything that draws her. */
export function b52Geometries() {
  if (GEOS) return GEOS;
  GEOS = { body: PIECES.body.map(decodePiece), glass: decodePiece(PIECES.glass), alcm: alcmGeometry() };
  return GEOS;
}

let MATS = null;
/** What she is made of: her grey paint, her glass, and her missiles' own. */
export function b52Materials() {
  if (MATS) return MATS;
  MATS = {
    skin: new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x30363c, shininess: 22 }),
    glass: new THREE.MeshPhongMaterial({
      color: 0x2d3a42, specular: 0xe6eef2, shininess: 120,
      transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
    }),
    alcm: new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x404850, shininess: 30 }),
    pylon: new THREE.MeshPhongMaterial({ color: 0x5d6368, specular: 0x202428, shininess: 18 }),
  };
  for (const m of Object.values(MATS)) m.userData.painted = true;
  return MATS;
}

/** An AGM-86B: six and a third metres, a blunt round body, a wedge nose, stub wings and a tail. */
export const ALCM_LEN = 6.32;
export const ALCM_R = 0.31;

/**
 * One AGM-86B as a geometry, nose +z, about its own middle: a white body with
 * a grey nose, its wings and fins folded out as they are once it is away.
 */
export function alcmGeometry() {
  const parts = [];
  const paint = (g, hex) => {
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g.toNonIndexed ? (g.index ? g.toNonIndexed() : g) : g;
  };
  const body = new THREE.CylinderGeometry(ALCM_R, ALCM_R, ALCM_LEN * 0.82, 10, 1);
  body.rotateX(Math.PI / 2);
  body.translate(0, 0, -ALCM_LEN * 0.05);
  parts.push(paint(body, 0xe9ebe6));
  const nose = new THREE.ConeGeometry(ALCM_R, ALCM_LEN * 0.18, 10, 1);
  nose.rotateX(Math.PI / 2);
  nose.translate(0, 0, ALCM_LEN * 0.41);
  parts.push(paint(nose, 0x7c8186));
  // The wings, swept, folded out of its belly; and the tail surfaces.
  const wing = new THREE.BoxGeometry(3.66, 0.05, 0.55);
  wing.translate(0, -0.12, 0.2);
  parts.push(paint(wing, 0xd9dbd6));
  const fin = new THREE.BoxGeometry(0.05, 0.75, 0.6);
  fin.translate(0, 0.45, -ALCM_LEN * 0.42);
  parts.push(paint(fin, 0xd9dbd6));
  const tp = new THREE.BoxGeometry(1.3, 0.05, 0.45);
  tp.translate(0, 0, -ALCM_LEN * 0.43);
  parts.push(paint(tp, 0xd9dbd6));
  // Merged by hand: positions, normals and colours one after another.
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let at = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, at * 3);
    nrm.set(g.attributes.normal.array, at * 3);
    col.set(g.attributes.color.array, at * 3);
    at += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

/**
 * Where each of her twenty missiles sits on her, [x, y, z] off her middle, in
 * the order she lets them go: the twelve on her wing pylons first -- out of
 * the drag, and turn about, port and starboard -- then the eight on the
 * rotary launcher in her bay.
 */
export const B52_PYLON = { x: 7.6, y: -0.55, z: 3.0 };
export function alcmStations() {
  const out = [];
  // Six on each heavy stores adapter: three abreast over three, nose forward.
  const under = [];
  for (const row of [0, 1]) for (const col of [-1, 0, 1]) under.push([col * 0.7, -row * 0.66 - (col ? 0 : 0.18), 0]);
  for (let k = 0; k < 6; k++) {
    for (const side of [-1, 1]) {
      const [dx, dy] = under[k];
      out.push([side * B52_PYLON.x + dx, B52_PYLON.y - 0.75 + dy, B52_PYLON.z]);
    }
  }
  // Eight round the drum of the rotary launcher, in her bay.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    out.push([Math.sin(a) * 0.75, -1.2 + Math.cos(a) * 0.75, 1.0]);
  }
  return out;
}

/**
 * A whole B-52H, nose +z, in her own group with the origin at her middle.
 * `userData.rack` is the twelve missiles on her pylons, in the order they go.
 */
export function b52Model() {
  const g = b52Geometries();
  const M = b52Materials();
  const p = new THREE.Group();
  for (const geo of g.body) p.add(new THREE.Mesh(geo, M.skin));
  const glass = new THREE.Mesh(g.glass, M.glass);
  glass.renderOrder = 2;
  p.add(glass);
  // The two pylons and their adapter beams.
  for (const side of [-1, 1]) {
    const py = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 4.2), M.pylon);
    py.position.set(side * B52_PYLON.x, B52_PYLON.y, B52_PYLON.z + 0.4);
    p.add(py);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 3.4), M.pylon);
    beam.position.set(side * B52_PYLON.x, B52_PYLON.y - 0.35, B52_PYLON.z);
    p.add(beam);
  }
  // The twelve under her wings. The eight on the drum are in her bay, which
  // is shut, and are not drawn.
  p.userData.rack = alcmStations().slice(0, 12).map((at) => {
    const m = new THREE.Mesh(g.alcm, M.alcm);
    m.position.fromArray(at);
    p.add(m);
    return m;
  });
  p.userData.props = [];
  p.userData.parts = [];
  p.userData.turrets = [];
  p.userData.kind = 'stratofortress';
  p.userData.span = 56.39;
  p.userData.length = 48.5;
  p.userData.sculpt = true;
  return p;
}
