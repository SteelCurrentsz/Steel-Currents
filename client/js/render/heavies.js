// The heavy squadrons, over the battle.
//
// Built the way the carrier flights are built and for the same reason: one
// welded geometry per type, drawn as an instanced batch, so a sky with six
// formations of four-engined bombers in it costs the same handful of draw
// calls as a sky with one. What is different is that a heavy is thirty metres
// across and flies in a vic of three, so the batch is small and the spacing is
// a bomber's spacing rather than a fighter's.
//
// The models are the same models the bomber yard looks at -- her own span, her
// own engines, her own turrets -- with her structure left out: the inside of
// her is a group that only the cutaway raises, and `weld` skips anything that
// is not being shown.

import * as THREE from '../../../vendor/three.module.js';
import { heavyBomber } from './planekit.js';
import { weld, HoleField } from './planes.js';

/**
 * Where each machine of a vic flies, in her leader's own frame.
 *
 * Line astern stepped down and out, which is what a bomber formation was: far
 * enough apart that one aeroplane blowing up does not take the next with her,
 * close enough that every gun in the formation bears on the same fighter.
 */
const VIC = [
  [0, 0, 0],
  [-52, -14, -46],
  [52, -14, -46],
  [-104, -28, -92],
  [104, -28, -92],
  [0, -22, -92],
  [-156, -40, -138],
  [156, -40, -138],
  [0, -44, -184],
];

export class Heavies {
  constructor(scene, max = 27) {
    this.scene = scene;
    this.max = max;
    this.batches = new Map();
    this.dummy = new THREE.Object3D();
    this.dummy.rotation.order = 'YXZ';
    this.props = [];
    this.spin = 0;
    // Scratch, so a sky with nine formations in it does not allocate a
    // hundred matrices a frame.
    this.pm = new THREE.Matrix4();
    this.sp = new THREE.Matrix4();
    this.axis = new THREE.Vector3(0, 0, 1);
    // What the fighters and the flak have made of her skin, in one batch.
    this.holes = new HoleField(scene);
  }

  /**
   * The welded model of one type, built the first time she is asked for.
   *
   * Not at boot: five four-engined bombers is a good deal of geometry to build
   * for a battle that may have no heavies in it at all, and the ones that are
   * in it are known the moment the first snapshot arrives.
   */
  batch(kind) {
    let b = this.batches.get(kind);
    if (b) return b;
    const g = heavyBomber(kind);
    // Her airscrews turn, so they are lifted out and drawn as batches of their
    // own -- nothing welded into a body can move. The same trick the carrier
    // aircraft use; see `flightModels`.
    const discs = (g.userData.props || []).slice();
    const parts = discs.map((d) => {
      d.updateMatrixWorld(true);
      const at = new THREE.Vector3().setFromMatrixPosition(d.matrixWorld);
      const rot = new THREE.Quaternion().setFromRotationMatrix(d.matrixWorld);
      const base = new THREE.Matrix4().copy(d.matrixWorld).invert();
      const { geo, mats } = weld(d, base);
      d.parent.remove(d);
      return { at, rot, geo, mats };
    });
    const { geo, mats } = weld(g);
    const mesh = new THREE.InstancedMesh(geo, mats, this.max);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.scene.add(mesh);
    const props = parts.map((sp) => {
      const pm = new THREE.InstancedMesh(sp.geo, sp.mats, this.max);
      pm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      pm.frustumCulled = false;
      pm.count = 0;
      this.scene.add(pm);
      return { spec: sp, mesh: pm, n: 0 };
    });
    b = { mesh, props, n: 0 };
    this.batches.set(kind, b);
    return b;
  }

  /** A new frame: nothing is in the air until it has been added. */
  begin(dt = 0) {
    // The airscrews, wound on at the rate a cruising heavy turns hers.
    this.spin = (this.spin + dt * 22) % (Math.PI * 2);
    for (const b of this.batches.values()) {
      b.n = 0;
      for (const q of b.props) q.n = 0;
    }
    this.holes.begin();
  }

  /**
   * One formation: her leader's place in the sky and how many of her are left.
   *
   * `count` machines are drawn, each at her own station on the leader, so a
   * squadron that has lost two comes through as a vic with two gaps in it.
   */
  add(kind, x, y, z, heading, bank, pitch, count, holes = null, span = 31) {
    const b = this.batch(kind);
    const d = this.dummy;
    const n = Math.max(1, Math.min(VIC.length, count | 0));
    const sn = Math.sin(heading);
    const cs = Math.cos(heading);
    for (let i = 0; i < n && b.n < this.max; i++) {
      const [ox, oy, oz] = VIC[i];
      d.position.set(x + cs * ox + sn * oz, y + oy, z - sn * ox + cs * oz);
      // Nose up is a negative rotation about her own X axis, and a bank to
      // starboard is a negative one about her Z -- the same convention every
      // other aeroplane in the game is drawn with, and the heavies were the
      // one batch passing both straight through. A formation turning right
      // dropped her left wing, and cruised three degrees nose-down while she
      // was at it.
      d.rotation.set(-(pitch || 0), heading, -(bank || 0));
      d.updateMatrix();
      b.mesh.setMatrixAt(b.n++, d.matrix);
      // What the fighters and the flak have made of her skin. A heavy is
      // thirty metres across and flies straight and level through everything
      // the fleet can put up, so she is the aeroplane in this battle that ends
      // a sortie looking most like a colander.
      this.holes.on(d.matrix, holes, span, i, b.mesh.geometry, kind);
      // Her airscrews, turning about their own shafts wherever the engine
      // mounted them, and then carried round by whatever the aeroplane herself
      // is doing. Each machine of the formation gets her own, so all four
      // engines of all three bombers are turning.
      this.sp.makeRotationAxis(this.axis, this.spin);
      for (const q of b.props) {
        if (q.n >= this.max) continue;
        this.pm.makeRotationFromQuaternion(q.spec.rot);
        this.pm.multiply(this.sp);
        this.pm.setPosition(q.spec.at);
        this.pm.premultiply(d.matrix);
        q.mesh.setMatrixAt(q.n++, this.pm);
      }
    }
  }

  /** The frame is finished: whatever was not added is not in the sky. */
  end() {
    for (const b of this.batches.values()) {
      b.mesh.count = b.n;
      b.mesh.visible = b.n > 0;
      b.mesh.instanceMatrix.needsUpdate = true;
      for (const q of b.props) {
        q.mesh.count = q.n;
        q.mesh.visible = q.n > 0;
        q.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    this.holes.end();
  }
}
