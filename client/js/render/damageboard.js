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
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1.9, 1, 4000);
    this.scene.add(new THREE.HemisphereLight(0x9fd8ee, 0x0b1a24, 1.5));
    const key = new THREE.DirectionalLight(0xbfe8ff, 0.9);
    key.position.set(-0.4, 1, 0.6);
    this.scene.add(key);
    // How she is stood: turned about her mast, and tipped so you are looking
    // down on her. She turns herself until somebody takes hold of her, and
    // from then on she is theirs.
    this.spin = 0.6;
    this.tilt = 0.34;
    this.zoom = 1;
    this.held = false;
    this.grabbed(canvas);
    this.build(classId);
  }

  /**
   * Take hold of her and turn her.
   *
   * A damage board you cannot turn is a picture of one side of a ship, and
   * the side you want is always the other one -- a hole in her starboard
   * quarter is behind the drawing. Drag to swing her round and to tip her over
   * so you can look down into her or up at her keel; pinch, or roll the wheel,
   * to come in closer. She stops turning herself the moment she is touched.
   */
  grabbed(canvas) {
    let last = null;
    let pinch = 0;
    const pts = new Map();
    // The panel scrolls and the chart pans; neither should happen because
    // somebody dragged the ship.
    canvas.style.touchAction = 'none';

    const turn = (dx, dy) => {
      this.held = true;
      this.spin -= dx * 0.011;
      // Not over the top: she tips from looking up at her keel to looking
      // straight down on her deck and stops there, because past either end
      // the drag reverses and it feels broken.
      this.tilt = Math.max(-0.6, Math.min(1.45, this.tilt + dy * 0.009));
    };
    const gap = () => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      last = { x: e.clientX, y: e.clientY };
      if (pts.size === 2) pinch = gap();
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const was = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        // Two fingers: the gap between them is the zoom, and what is left of
        // the movement still turns her.
        const d = gap();
        if (pinch > 8 && d > 8) {
          this.zoom = Math.max(0.45, Math.min(3.2, this.zoom * (d / pinch)));
          pinch = d;
        }
        return;
      }
      turn(e.clientX - was.x, e.clientY - was.y);
      last = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = 0;
      if (!pts.size) last = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', up);
    canvas.addEventListener('wheel', (e) => {
      this.zoom = Math.max(0.45, Math.min(3.2, this.zoom * Math.pow(1.12, -Math.sign(e.deltaY))));
      e.preventDefault();
    }, { passive: false });
    // Back to where she started: turning herself, on the beam, at full length.
    canvas.addEventListener('dblclick', () => {
      this.held = false;
      this.tilt = 0.34;
      this.zoom = 1;
    });
  }

  /**
   * Stand a hull on the board.
   *
   * Called again when the board is asked to show somebody else's ship -- a
   * captain watching another ship from her own bridge reads her condition,
   * and reading a Fletcher's compartments off a drawing of an Iowa is worse
   * than useless. Only the model is rebuilt; the renderer and the canvas it
   * is drawing into are kept, because a WebGL context is not a thing to throw
   * away and make again every time somebody taps the chart.
   */
  build(classId) {
    if (this.classId === classId) return;
    this.classId = classId;
    if (this.rig) {
      this.scene.remove(this.rig);
      this.rig.traverse((o) => {
        if (o.isMesh) { o.geometry?.dispose?.(); }
      });
    }

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
    // She turns herself slowly until somebody takes hold of her.
    if (!this.held) this.spin += dt * 0.24;
    this.rig.rotation.y = this.spin;
    this.rig.rotation.x = this.tilt;
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
    const d = this.dist / this.zoom;
    this.camera.position.set(0, d * 0.34, d);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
  }
}
