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
import { b29Ready } from './b29Model.js';
import { weld, HoleField, holeRows } from './planes.js';
import { VIC } from '../../../shared/formation.js';

// Where each machine of a vic flies, in her leader's own frame: see
// shared/formation.js, which the simulation reads too.

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
    // A stand-in, built before her own model was in: thrown away and built
    // again now that it is.
    if (b && b.stub && b29Ready()) { this.drop(b); this.batches.delete(kind); b = null; }
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
    // Her bay doors and the weapon in her bay, on a machine that is drawn
    // opening the one and letting go of the other (the B-29): lifted out the
    // same way, each about its own hinge or its own middle, so each machine
    // of the formation can have them where she has them.
    const trims = [];
    if (g.userData.liftTrims) {
      g.updateMatrixWorld(true);
      const lift = (node, kind, open = 0) => {
        node.updateMatrixWorld(true);
        const at = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
        const rot = new THREE.Quaternion().setFromRotationMatrix(node.matrixWorld);
        const base = new THREE.Matrix4().copy(node.matrixWorld).invert();
        const { geo: tg, mats: tm } = weld(node, base);
        node.parent.remove(node);
        const mesh = new THREE.InstancedMesh(tg, tm, this.max);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.count = 0;
        this.scene.add(mesh);
        trims.push({ kind, at, rot, open, mesh, n: 0 });
      };
      for (const d of g.userData.parts || []) lift(d.node, 'door', d.open);
      for (const cr of g.userData.rack || []) lift(cr, 'bomb');
    }
    const { geo, mats } = weld(g);
    // Her skin is cut where she has been hit: see HoleField.
    const mesh = new THREE.InstancedMesh(geo, this.holes.material(mats), this.max);
    mesh.userData.holeRow = holeRows(mesh, this.max);
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
    b = { mesh, props, trims, n: 0, stub: !!g.userData.stub };
    this.batches.set(kind, b);
    return b;
  }

  /** A batch done with: out of the scene and its geometry let go. */
  drop(b) {
    for (const m of [b.mesh, ...b.props.map((q) => q.mesh), ...b.trims.map((q) => q.mesh)]) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
  }

  /**
   * Where a hole at `h` is on a heavy of this type, in her own frame: the same
   * ray her holes are cut by. Null when the ray finds no aeroplane.
   */
  pointOn(kind, h, span, out) {
    const at = this.holes.snap(kind, this.batch(kind).mesh.geometry, h, span);
    return at ? out.copy(at.p) : null;
  }

  /** A new frame: nothing is in the air until it has been added. */
  begin(dt = 0) {
    // The airscrews, wound on at the rate a cruising heavy turns hers.
    this.spin = (this.spin + dt * 22) % (Math.PI * 2);
    for (const b of this.batches.values()) {
      b.n = 0;
      for (const q of b.props) q.n = 0;
      for (const q of b.trims) q.n = 0;
    }
    this.holes.begin();
  }

  /**
   * One formation: her leader's place in the sky and how many of her are left.
   *
   * `count` machines are drawn, each at her own station on the leader -- or
   * the stations `mask` names -- so a squadron that has lost two comes
   * through as a vic with two gaps in it.
   */
  add(kind, x, y, z, heading, bank, pitch, count, holes = null, span = 31, mask = 0, trim = null) {
    const b = this.batch(kind);
    const d = this.dummy;
    const n = Math.max(1, Math.min(VIC.length, count | 0));
    const sn = Math.sin(heading);
    const cs = Math.cos(heading);
    // `mask` is which stations are still flying, when a machine has gone out
    // of the middle of the vic and left a gap there.
    // Which machine of the formation is carrying the weapon: the first of
    // her still flying, which is the leader unless the leader has gone.
    let carrier = -1;
    for (let i = 0; i < VIC.length; i++) {
      if (mask ? (mask >> i) & 1 : i < n) { carrier = i; break; }
    }
    for (let i = 0; i < VIC.length && b.n < this.max; i++) {
      if (mask ? !((mask >> i) & 1) : i >= n) continue;
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
      // What the fighters and the flak have made of her skin. A heavy is
      // thirty metres across and flies straight and level through everything
      // the fleet can put up, so she is the aeroplane in this battle that ends
      // a sortie looking most like a colander.
      b.mesh.userData.holeRow.array[b.n] = this.holes.on(d.matrix, holes, span, i, b.mesh.geometry, kind);
      b.mesh.setMatrixAt(b.n++, d.matrix);
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
      // Her bay doors, open as far as `trim.bay` says on the machine with the
      // weapon and shut on the others; and the weapon, in her bay until it
      // has gone.
      for (const q of b.trims) {
        if (q.n >= this.max) continue;
        const mine = i === carrier && trim;
        if (q.kind === 'bomb' && !(mine && trim.bomb)) continue;
        this.pm.makeRotationFromQuaternion(q.rot);
        if (q.kind === 'door') this.pm.multiply(this.sp.makeRotationZ(q.open * (mine ? trim.bay || 0 : 0)));
        this.pm.setPosition(q.at);
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
      b.mesh.userData.holeRow.needsUpdate = true;
      for (const q of [...b.props, ...b.trims]) {
        q.mesh.count = q.n;
        q.mesh.visible = q.n > 0;
        q.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    this.holes.end();
  }
}
