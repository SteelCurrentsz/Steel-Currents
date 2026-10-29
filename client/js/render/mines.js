// The mines your own side has laid.
//
// A moored mine is under the sea at the end of its wire and nobody on the
// surface can see it -- which is the point of it. The boat that laid it wrote
// down where, and that is what this draws: the mine itself on its mooring a
// couple of metres down, and a small dan buoy over it on the surface, yellow
// while it is still settling and red once it has armed and will go off against
// anything that touches it, friend or not.

import * as THREE from '../../../vendor/three.module.js';

const SETTLING = new THREE.Color(0xe0b43a);
const ARMED = new THREE.Color(0xd2412e);

export class Mines {
  constructor(scene, max = 64) {
    this.max = max;
    this.mine = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.45, 12, 8),
      new THREE.MeshLambertMaterial({ color: 0x2b2f33 }), max);
    // The dan buoy: a short pole with a flag on it, standing out of the sea.
    const buoy = new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6);
    buoy.translate(0, 0.7, 0);
    const flag = new THREE.BoxGeometry(0.02, 0.32, 0.46);
    flag.translate(0, 1.22, 0.24);
    const float = new THREE.SphereGeometry(0.2, 8, 6);
    this.buoy = new THREE.InstancedMesh(mergeGeometries([buoy, flag, float]),
      new THREE.MeshBasicMaterial({ color: 0xffffff }), max);
    for (const m of [this.mine, this.buoy]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    this.dummy = new THREE.Object3D();
    this.t = 0;
  }

  /** `list` is the wire's: the mines this side laid, and whether each has armed. */
  update(dt, list) {
    this.t += dt;
    const d = this.dummy;
    let n = 0;
    for (const m of list) {
      if (n >= this.max) break;
      d.position.set(m.x, -2.4, m.z);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      this.mine.setMatrixAt(n, d.matrix);
      // Riding the swell over it, and leaning a little to it.
      d.position.set(m.x, -0.15 + 0.12 * Math.sin(this.t * 1.3 + m.i), m.z);
      d.rotation.set(0.12 * Math.sin(this.t * 0.9 + m.i), m.i, 0.1 * Math.cos(this.t * 1.1 + m.i));
      d.updateMatrix();
      this.buoy.setMatrixAt(n, d.matrix);
      this.buoy.setColorAt(n, m.ar ? ARMED : SETTLING);
      n++;
    }
    this.mine.count = n;
    this.buoy.count = n;
    if (n) {
      this.mine.instanceMatrix.needsUpdate = true;
      this.buoy.instanceMatrix.needsUpdate = true;
      if (this.buoy.instanceColor) this.buoy.instanceColor.needsUpdate = true;
    }
  }
}

/** A handful of plain geometries, as one. */
function mergeGeometries(list) {
  const pos = [];
  const nor = [];
  const idx = [];
  let base = 0;
  for (const src of list) {
    const g = src.index ? src : src.toNonIndexed();
    const p = g.attributes.position.array;
    const nm = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(nm[i]); }
    if (g.index) for (const i of g.index.array) idx.push(base + i);
    else for (let i = 0; i < p.length / 3; i++) idx.push(base + i);
    base += p.length / 3;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}
