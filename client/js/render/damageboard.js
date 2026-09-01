// The damage board: her own ship, stood in the air over the panel, with the
// compartments that have been opened burning through her.
//
// It is the one place the state of the ship is read now that there is no bar to
// read it off. A hull is not a number that runs down -- she is compartments,
// and what a damage control officer wants to know is which of them are open to
// the sea, not what fraction of an abstraction is left.

import * as THREE from '../../../vendor/three.module.js';
import { buildShip } from './ships.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { SECTIONS } from '../../../shared/sim.js';

// Sound, hurt, gone. Read straight off the compartment, so the board says the
// same thing the simulation does.
const SOUND = new THREE.Color(0x58c8e8);
const HURT = new THREE.Color(0xe2c14f);
const GONE = new THREE.Color(0xe2564f);

export class DamageBoard {
  constructor(canvas, classId) {
    this.canvas = canvas;
    this.classId = classId;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1.9, 1, 4000);
    this.scene.add(new THREE.HemisphereLight(0x9fd8ee, 0x0b1a24, 1.5));
    const key = new THREE.DirectionalLight(0xbfe8ff, 0.9);
    key.position.set(-0.4, 1, 0.6);
    this.scene.add(key);

    const cls = SHIP_CLASSES[classId];
    this.len = cls.hull.length;
    this.beam = cls.hull.beam;

    // Her own model, drawn as a hologram: her shape in outline, lit from within
    // rather than by the sun. It is the ship, not a diagram of one.
    this.rig = new THREE.Group();
    this.scene.add(this.rig);
    const built = buildShip(classId);
    this.hull = built.group;
    this.hull.traverse((o) => {
      if (!o.isMesh) return;
      // Normal blending, not additive: a wireframe hull drawn additively over
      // itself saturates, and what came out was a white slug rather than a
      // ship. Her shape has to survive being lit from inside.
      o.material = new THREE.MeshBasicMaterial({
        color: 0x63c4e4, wireframe: true, transparent: true, opacity: 0.36,
        depthWrite: false,
      });
    });
    this.rig.add(this.hull);

    // A slab over each compartment, standing in for the bulkheads she is
    // actually divided by. This is what carries the colour.
    this.slabs = {};
    for (const sec of SECTIONS) {
      if (sec.from === null) continue;
      const half = this.len / 2;
      const z0 = Math.max(-1, sec.from) * half;
      const z1 = Math.min(1, sec.to) * half;
      const g = new THREE.BoxGeometry(this.beam * 0.92, this.beam * 0.5, z1 - z0);
      const m = new THREE.MeshBasicMaterial({
        color: SOUND, transparent: true, opacity: 0.14, depthWrite: false,
      });
      const box = new THREE.Mesh(g, m);
      box.position.set(0, this.beam * 0.1, (z0 + z1) / 2);
      this.rig.add(box);
      // The bulkhead at its forward end, so the divisions read as divisions.
      const bh = new THREE.Mesh(
        new THREE.PlaneGeometry(this.beam * 0.92, this.beam * 0.5),
        new THREE.MeshBasicMaterial({
          color: 0x7fd4ec, transparent: true, opacity: 0.22, side: THREE.DoubleSide,
        }),
      );
      bh.position.set(0, this.beam * 0.1, z1);
      this.rig.add(bh);
      this.slabs[sec.k] = { box, mat: m };
    }
    // The superstructure has no station along her, so it is shown as a band
    // standing above the whole of her middle.
    const wg = new THREE.BoxGeometry(this.beam * 0.5, this.beam * 0.44, this.len * 0.34);
    const wm = new THREE.MeshBasicMaterial({
      color: SOUND, transparent: true, opacity: 0.14, depthWrite: false,
    });
    const works = new THREE.Mesh(wg, wm);
    works.position.set(0, this.beam * 0.62, this.len * 0.03);
    this.rig.add(works);
    this.slabs.works = { box: works, mat: wm };

    // Where she has been holed. Marks are added as the hits come in.
    this.marks = new THREE.Group();
    this.rig.add(this.marks);
    // Big enough to read at this range, and drawn over the hull rather than
    // behind it: a hole you cannot see is not much of a damage board.
    this.markGeo = new THREE.SphereGeometry(Math.max(2.4, this.beam * 0.14), 10, 8);
    this.markMat = new THREE.MeshBasicMaterial({
      color: 0xffc07a, transparent: true, opacity: 0.95, depthTest: false,
    });

    this.spin = 0.6;
    this.frame(this.len);
  }

  /** Stand off far enough to see the whole of her. */
  frame(len) {
    this.dist = len * 1.15;
  }

  /** A hole in her, at the point on her own hull where the shell went in. */
  hole(lx, ly, lz) {
    if (this.marks.children.length > 90) {
      this.marks.remove(this.marks.children[0]);
    }
    const m = new THREE.Mesh(this.markGeo, this.markMat);
    m.renderOrder = 3;
    // Pushed out onto her side, so a hole sits on the plating it went through
    // rather than floating somewhere inside her.
    const side = lx === 0 ? 1 : Math.sign(lx);
    m.position.set(side * Math.max(Math.abs(lx), this.beam * 0.42),
      Math.max(-this.beam * 0.2, Math.min(this.beam * 0.9, ly)), lz);
    this.marks.add(m);
  }

  /** `sec` is the wire's [integrity 0-100, penetrations] per compartment. */
  update(sec, dt) {
    this.spin += dt * 0.24;
    this.rig.rotation.y = this.spin;
    this.rig.rotation.x = 0.34;
    if (sec) {
      SECTIONS.forEach((s, i) => {
        const slab = this.slabs[s.k];
        if (!slab || !sec[i]) return;
        const f = Math.max(0, Math.min(1, sec[i][0] / 100));
        const col = f > 0.6 ? SOUND.clone().lerp(HURT, (1 - f) / 0.4)
          : HURT.clone().lerp(GONE, Math.min(1, (0.6 - f) / 0.6));
        slab.mat.color.copy(col);
        slab.mat.opacity = 0.12 + (1 - f) * 0.44;
      });
    }
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 160;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.set(0, this.dist * 0.34, this.dist);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
  }
}
