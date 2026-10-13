// The targeting panel's picture of her: the ship herself, as she is built for
// the battle, stood in a fixed view off her starboard quarter -- not a model to
// be turned about, but the one look at her a gunnery officer has from his
// position, with her turrets trained and her guns laid as they are on the
// water this instant.
//
// It carries a renderer of its own, built the first time the key is pressed,
// and builds a model of each class the first time it is asked to show one.

import * as THREE from '../../../vendor/three.module.js';
import { buildShip } from './ships.js';

// Her models, one a class, kept across the panel being raised and put away:
// building a hull is the slow part, and she does not change.
const MODELS = new Map();

export class TargetingView {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xc4d8e6, 0x2a3440, 1.35));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
    sun.position.set(0.6, 1, 0.35);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(28, 2, 1, 6000);
    this.models = MODELS;
    this.shown = null;
    this.classId = null;
  }

  /** Show this class: built once, and kept for the next time she is asked for. */
  build(classId) {
    if (classId === this.classId) return;
    if (this.shown) this.scene.remove(this.shown.group);
    let m = this.models.get(classId);
    if (!m) {
      m = buildShip(classId);
      // Nothing of the battle on her: no plot ring, no searchlight beams.
      m.group.traverse((o) => {
        if (o.userData && (o.userData.marker || o.userData.lamp !== undefined)) o.visible = false;
      });
      // Measured on what is drawn of her: the plot ring and anything else
      // hidden would make her box half again her size.
      m.group.updateMatrixWorld(true);
      const box = new THREE.Box3();
      m.group.traverseVisible((o) => {
        if (!o.isMesh || !o.geometry) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
      });
      m.size = box.getSize(new THREE.Vector3());
      // And a scatter of points off her own surfaces, which is what is fitted
      // to the panel: her box seen across a corner is far wider than she is.
      m.points = [];
      const v = new THREE.Vector3();
      m.group.traverseVisible((o) => {
        const pos = o.isMesh && o.geometry?.attributes?.position;
        if (!pos) return;
        const step = Math.max(1, Math.floor(pos.count / 60));
        for (let i = 0; i < pos.count; i += step) m.points.push(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).clone());
      });
      m.mid = box.getCenter(new THREE.Vector3());
      this.models.set(classId, m);
    }
    this.scene.add(m.group);
    this.shown = m;
    this.classId = classId;
  }

  /**
   * Her mountings as they are on the water: the training and the elevation of
   * every turret copied off `live`, her view in the battle. Nothing is copied
   * from a ship with no view to read.
   */
  follow(live) {
    const m = this.shown;
    if (!m || !live) return;
    const lists = [[m.turrets, live.turrets], [m.secMounts, live.secMounts], [m.aaMounts, live.aaMounts]];
    for (const [mine, theirs] of lists) {
      if (!mine || !theirs) continue;
      const n = Math.min(mine.length, theirs.length);
      for (let i = 0; i < n; i++) {
        const a = mine[i], b = theirs[i];
        if (!a || !b) continue;
        a.rotation.y = b.rotation.y;
        const ga = a.userData.gunNode, gb = b.userData.gunNode;
        if (ga && gb && ga !== a) ga.rotation.x = gb.rotation.x;
      }
    }
  }

  render() {
    const m = this.shown;
    if (!m) return;
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 150;
    const pr = this.renderer.getPixelRatio();
    if (this.canvas.width !== Math.round(w * pr) || this.canvas.height !== Math.round(h * pr)) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
    }
    // One view, always the same: off her starboard bow-quarter, a little above
    // her, standing far enough off for the whole of her to fit across the
    // panel. It is not turned by anything.
    // Brought in until she just fills the panel,
    // with a margin: a destroyer and a battleship each fill it.
    const dir = new THREE.Vector3(-0.62, 0.30, 0.72).normalize();
    const cam = this.camera;
    const corners = m.points;
    const fits = (d) => {
      cam.position.copy(m.mid).addScaledVector(dir, d);
      cam.lookAt(m.mid);
      cam.updateMatrixWorld(true);
      return corners.every((c) => {
        const q = c.clone().project(cam);
        return Math.abs(q.x) < 0.94 && Math.abs(q.y) < 0.9 && q.z < 1;
      });
    };
    if (this.fitFor !== m || this.fitAspect !== cam.aspect) {
      let lo = 1, hi = Math.max(m.size.x, m.size.z) * 8;
      for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
      this.fitD = hi;
      this.fitFor = m;
      this.fitAspect = cam.aspect;
    }
    cam.position.copy(m.mid).addScaledVector(dir, this.fitD);
    cam.lookAt(m.mid);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.shown) this.scene.remove(this.shown.group);
    this.shown = null;
    this.renderer.dispose();
    // A canvas a context; the panel's canvas goes when the panel does.
    this.renderer.forceContextLoss();
  }
}
