// Catapults and their seaplanes, fitted to a ship whose model was not built
// with any of its own working.
//
// A great many of the hulls in the yard came with their catapults and their
// scouts already on them -- a girder amidships with a Jake sitting on it, two
// Kingfishers on the fantail -- drawn into the model as so much more of her
// structure. Nothing on them moves: the scout cannot be thrown off, and when
// she has gone she is still sitting there. This is what turns one of those
// into a working catapult.
//
// For each ship the fit says where her catapult stands and how it works:
//
//   at      [x, railTop, z] of its turntable, or of the middle of a fixed
//           cross-deck girder; railTop is the height of the rails the car
//           runs on -- or null, to stand it `lift` over the deck found under
//           it looking down from `probe`
//   base    the bearing it lies on when stowed, off her bow: 0 ahead, PI
//           astern, +-PI/2 abeam
//   out     how far it trains from there to shoot, radians, towards `sgn`
//           (0 for one fixed on the deck or across it)
//   back, front   the girder's two ends along its own length, from the turntable
//   a       where the car sits at rest along it
//   pair    true for a pair either side of her centreline, mirrored
//   cross   true for a single girder across the ship, shooting either way:
//           two cars, one to each beam (the KGV's and the Bismarck's)
//   draw    false where the model's own girder is left to carry the car (one
//           fixed to the deck, which never moves); otherwise the model's
//           girder is cut away with the scout on it and one drawn here that
//           trains
//   cut     boxes [x0, x1, y0, y1, z0, z1] of the model to cut away: the scout
//           the model sat on it, and its girder if one is drawn here instead
//
// Only what lies wholly inside a box is cut, so a deck or a bulkhead that
// merely passes through one is left where it is.

import * as THREE from '../../../vendor/three.module.js';
import { box, cyl } from './shipkit.js';
import { RIG, fitCatapults } from './catapult.js';
import { arado, jake, kingfisher, walrus, loire, kor1, ro43 } from './planekit.js';

const P = { steel: 0x6c737b, steelDark: 0x555c64, gunDark: 0x40464d };
const MATS = {};
const M = new Proxy({}, {
  get: (_, k) => (MATS[k] ||= new THREE.MeshLambertMaterial({ color: P[k] })),
});

/** Each type sat on her car, nose along the girder. */
const SCOUT = {
  arado: (car) => arado(car, 0, 0, 0, 0, false, { spin: true }),
  jake: (car) => jake(car, 0, 0, 0, 0, false, { spin: true }),
  kingfisher: (car) => kingfisher(car, 0, 0, 0, 0, { spin: true }),
  walrus: (car) => walrus(car, 0, 0, 0, 0, { spin: true }),
  loire: (car) => loire(car, 0, 0, 0, 0, { spin: true }),
  kor1: (car) => kor1(car, 0, 0, 0, 0, { spin: true }),
  ro43: (car) => ro43(car, 0, 0, 0, 0, { spin: true }),
};

// The rails, how far over the turntable the girder carries them.
const RAIL = 1.0;
// The car's cradle, over the rails: where her floats (or her hull) sit.
const CRADLE = 0.42;

/** Her fixed structure: nothing that trains or elevates. */
function fixedMeshes(g) {
  const out = [];
  g.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    for (let n = o; n && n !== g; n = n.parent) if (n.userData && n.userData.dynamic) return;
    out.push(o);
  });
  return out;
}

/**
 * Take out of the model what lies wholly inside any of `boxes`, in the ship's
 * own frame. Only her fixed structure: nothing that trains or elevates is
 * touched. A geometry the model shares with another ship of her class is not
 * cut in place: she is given her own index into it.
 */
export function cutModel(g, boxes) {
  if (!boxes || !boxes.length) return 0;
  g.updateMatrixWorld(true);
  const toShip = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const inside = (p) => boxes.some(([x0, x1, y0, y1, z0, z1]) => p.x >= x0 && p.x <= x1
    && p.y >= y0 && p.y <= y1 && p.z >= z0 && p.z <= z1);
  let cut = 0;
  for (const o of fixedMeshes(g)) {
    const geo = o.geometry;
    const pos = geo.attributes.position;
    m.multiplyMatrices(toShip, o.matrixWorld);
    // Quickly: nothing of hers near any box at all.
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox.clone().applyMatrix4(m);
    if (!boxes.some(([x0, x1, y0, y1, z0, z1]) => bb.max.x >= x0 && bb.min.x <= x1
      && bb.max.y >= y0 && bb.min.y <= y1 && bb.max.z >= z0 && bb.min.z <= z1)) continue;
    const n = pos.count;
    const keep = new Uint8Array(n);
    for (let i = 0; i < n; i++) keep[i] = inside(v.fromBufferAttribute(pos, i).applyMatrix4(m)) ? 0 : 1;
    const index = geo.index ? geo.index.array : null;
    const tri = index ? index.length / 3 : n / 3;
    const corner = (t, k) => (index ? index[t * 3 + k] : t * 3 + k);
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: tri * 3, materialIndex: 0 }];
    const out = [];
    const regrouped = [];
    let dropped = 0;
    for (const gr of groups) {
      const start = out.length;
      const end = Math.min(tri * 3, gr.start + gr.count);
      for (let t = gr.start / 3; t < end / 3; t++) {
        const a = corner(t, 0), b = corner(t, 1), c = corner(t, 2);
        if (!keep[a] && !keep[b] && !keep[c]) { dropped++; continue; }
        out.push(a, b, c);
      }
      regrouped.push({ start, count: out.length - start, materialIndex: gr.materialIndex });
    }
    if (!dropped) continue;
    cut += dropped;
    const ng = new THREE.BufferGeometry();
    for (const k in geo.attributes) ng.setAttribute(k, geo.attributes[k]);
    ng.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(out, 1) : new THREE.Uint16BufferAttribute(out, 1));
    if (geo.groups.length) for (const gr of regrouped) ng.addGroup(gr.start, gr.count, gr.materialIndex);
    ng.boundingBox = geo.boundingBox;
    ng.boundingSphere = geo.boundingSphere;
    ng.userData = { ...geo.userData };
    o.geometry = ng;
  }
  return cut;
}

/** How high her deck is under a point, looking down from over it. */
function deckUnder(g, x, z, from) {
  g.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(x, from, z), new THREE.Vector3(0, -1, 0), 0, 80);
  const meshes = fixedMeshes(g);
  // Both faces: a model's girders and decks are not all wound the same way
  // up, and a deck seen from underneath is still the deck.
  const sides = new Map();
  for (const o of meshes) {
    for (const mt of [].concat(o.material)) {
      if (!sides.has(mt)) { sides.set(mt, mt.side); mt.side = THREE.DoubleSide; }
    }
  }
  const hit = ray.intersectObjects(meshes, false)[0];
  for (const [mt, s] of sides) mt.side = s;
  return hit ? hit.point.y : from - 2;
}

/** The girder, drawn along +Z in its turntable's frame from `back` to `front`. */
function girder(cat, back, front) {
  const len = front - back;
  const mid = (front + back) / 2;
  for (const rail of [-0.6, 0.6]) {
    box(cat, M.steel, 0.24, 0.42, len, rail, RAIL - 0.27, mid);
    box(cat, M.steelDark, 0.3, 0.1, len, rail, RAIL - 0.04, mid);
  }
  const bays = Math.max(2, Math.floor(len / 1.9));
  const bay = (len - 0.6) / bays;
  for (let i = 0; i <= bays; i++) box(cat, M.steel, 1.45, 0.18, 0.24, 0, RAIL - 0.5, back + 0.3 + i * bay);
  for (let i = 0; i < bays; i++) {
    const br = box(cat, M.steel, 0.12, 0.1, bay * 1.15, 0, RAIL - 0.62, back + 0.3 + (i + 0.5) * bay);
    br.rotation.x = i % 2 ? 0.35 : -0.35;
  }
  // The powder charge house at the breech end, and the buffer at the muzzle.
  box(cat, M.steel, 1.7, 1.0, 1.8, 0, RAIL + 0.2, back + 0.9);
  box(cat, M.steelDark, 0.8, 0.6, 0.8, 0, RAIL + 0.9, back + 0.9);
  box(cat, M.gunDark, 0.5, 0.35, 0.7, 0, RAIL + 0.1, front - 0.35);
}

/** The car on the rails, and her scout on it. */
function carAndScout(cat, aero, a) {
  const car = new THREE.Group();
  car.position.set(0, 0, a);
  car.userData.dynamic = true;
  cat.add(car);
  box(car, M.gunDark, 1.5, 0.2, 2.8, 0, RAIL + 0.1, 0);
  for (const dz of [-1.0, 1.0]) {
    box(car, M.steelDark, 2.2, 0.14, 0.3, 0, RAIL + CRADLE - 0.07, dz);
    for (const sx of [-1, 1]) box(car, M.steelDark, 0.1, CRADLE - 0.2, 0.1, sx * 0.95, RAIL + 0.1 + (CRADLE - 0.2) / 2, dz);
  }
  const plane = SCOUT[aero](car);
  // Sat down on the cradle by her own lowest point, whatever she is: a float
  // plane's floats, a flying boat's keel.
  car.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(plane);
  bb.applyMatrix4(new THREE.Matrix4().copy(car.matrixWorld).invert());
  plane.position.y += RAIL + CRADLE - bb.min.y;
  return { car, plane, planeY: plane.position.y, planeZ: plane.position.z };
}

/**
 * Fit a ship with working catapults and their scouts, off her `fit`. Returns
 * the deck fitCatapults made, or null for a ship with no fit.
 */
export function fitSeaplanes(g, fit, run) {
  if (!fit) return null;
  cutModel(g, fit.cut);
  const [x0, atY, z0] = fit.at;
  // Rails at a height given, or stood on a pedestal over whatever deck is
  // under the turntable once the model's own catapult is out of the way.
  const railTop = atY ?? deckUnder(g, x0, z0, fit.probe ?? 30) + (fit.lift ?? 1.5);
  const front = fit.front;
  const back = fit.cross ? 0 : fit.back ?? -3;
  const a = fit.a ?? (fit.cross ? front * 0.45 : back + 3.6);
  const sides = fit.pair || fit.cross ? [1, -1] : [fit.sgn ?? 1];
  const cats = [];
  let planeY = 0;
  let planeZ = 0;
  for (const sgn of sides) {
    const x = fit.pair ? x0 * sgn : x0;
    const cat = new THREE.Group();
    // The turntable sits a rail's height under the rails.
    cat.position.set(x, railTop - RAIL, z0);
    // A pair is each other's mirror image; a cross-deck girder points both
    // ways at once.
    const base = fit.cross ? sgn * Math.PI / 2 : fit.pair && sgn < 0 ? -fit.base : fit.base;
    cat.rotation.y = base + sgn * (fit.rest ?? 0);
    cat.userData.dynamic = true;
    cat.userData.name = 'catapult';
    g.add(cat);
    if (fit.draw !== false) {
      if (!fit.cross) {
        // On a pedestal down to her deck, and a turntable on that.
        const deck = deckUnder(g, x, z0, railTop - 0.6);
        const h = Math.max(0.2, railTop - RAIL - deck);
        cyl(g, M.steelDark, 1.3, 1.5, h + 0.05, x, deck + h / 2, z0, 18);
        cyl(cat, M.steelDark, 1.6, 1.75, 0.4, 0, 0.2, 0, 20);
      }
      girder(cat, back, front);
    }
    const s = carAndScout(cat, fit.aero, a);
    planeY = s.planeY;
    planeZ = s.planeZ;
    cats.push({ group: cat, car: s.car, plane: s.plane, prop: s.plane.userData.prop, sgn, base });
  }
  const rig = {
    ...RIG, BACK: back, FRONT: front, A: a,
    STROKE: +(front - 0.7 - a).toFixed(2),
    REST: fit.rest ?? 0, OUT: fit.out ?? 0, PLANE_Y: planeY, PLANE_Z: planeZ,
  };
  return fitCatapults(g, {
    cats, rig, deckY: railTop, catX: x0, catZ: z0, run, aero: fit.aero,
  });
}
