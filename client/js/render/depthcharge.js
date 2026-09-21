// The depth charges in the water.
//
// A Mk 6 is a steel drum: eighteen inches across, twenty-eight long, six
// hundred pounds of it with three hundred of TNT inside, and a hydrostatic
// pistol in one end. It is not a weapon that is aimed and it does not steer.
// It goes over the stern or out of a K-gun, hits the water flat, and then
// falls -- and the whole of the attack is the eleven seconds it spends
// falling.
//
// Which is why it is worth drawing at all. From the bridge you see the splash
// and nothing else; from under the water, which is where the camera goes when
// a submarine is being fought, you watch eight drums come down out of the
// light above you, and that is the single most frightening thing in the game.
// So: the drum itself, drawn where it actually is, with the string of bubbles
// it drags down behind it.

import * as THREE from '../../../vendor/three.module.js';

/** The drum, lying on its side the way a charge falls. */
function drumGeometry() {
  const g = new THREE.CylinderGeometry(0.235, 0.235, 0.71, 12, 1, false);
  // A charge goes down end-first once it has settled, so the drum stands up.
  return g;
}

export class DepthCharges {
  constructor(scene, max = 48) {
    this.max = max;
    const mat = new THREE.MeshLambertMaterial({ color: 0x2b3138 });
    this.mesh = new THREE.InstancedMesh(drumGeometry(), mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    // The bubbles: a short column of them standing above each charge, which is
    // the air that went down with it coming back up.
    const bub = new THREE.MeshBasicMaterial({
      color: 0xdff0f6, transparent: true, opacity: 0.4, depthWrite: false,
    });
    this.bubbles = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.16, 6, 4), bub, max * 4);
    this.bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bubbles.frustumCulled = false;
    this.bubbles.count = 0;
    scene.add(this.bubbles);
    this.dummy = new THREE.Object3D();
    this.spin = 0;
  }

  /**
   * Put every charge in the water where it is.
   *
   * `list` is the wire's, interpolated: world position with `y` negative,
   * because a depth charge is only ever under the surface.
   */
  update(dt, list) {
    this.spin += dt;
    const d = this.dummy;
    let n = 0;
    let b = 0;
    for (const c of list) {
      if (n >= this.max) break;
      d.position.set(c.x, c.y, c.z);
      // Tumbling, slowly, the way a drum does going down.
      d.rotation.set(0.5 * Math.sin(this.spin * 1.7 + c.i), this.spin * 0.9 + c.i, 0.3);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.mesh.setMatrixAt(n, d.matrix);
      n++;
      for (let k = 0; k < 4; k++) {
        if (b >= this.bubbles.count + this.max * 4) break;
        const up = ((this.spin * 2.4 + k * 0.9 + c.i) % 3.6);
        d.position.set(
          c.x + Math.sin(k * 2.1 + c.i) * 0.5,
          c.y + up,
          c.z + Math.cos(k * 2.1 + c.i) * 0.5,
        );
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(0.6 + up * 0.22);
        d.updateMatrix();
        this.bubbles.setMatrixAt(b, d.matrix);
        b++;
      }
    }
    this.mesh.count = n;
    this.bubbles.count = b;
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
    if (b) this.bubbles.instanceMatrix.needsUpdate = true;
  }
}
