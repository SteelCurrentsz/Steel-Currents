// The targeting panel's picture of her: the ship herself, as she is built for
// the battle, with her turrets trained and her guns laid as they are on the
// water this instant. It opens off her starboard bow-quarter, fitted to the
// panel, and a drag turns the view round her and a pinch or the wheel brings
// it in; the mounting picked on the bar over it is ringed where it stands.
//
// It carries a renderer of its own, built the first time the key is pressed,
// and builds a model of each class the first time it is asked to show one.

import * as THREE from '../../../vendor/three.module.js';
import { BoardRenderer } from './boardgl.js';
import { buildShip, loadShips, shipReady } from './ships.js';
import { MARK_KIND } from './damageboard.js';

// Her models, one a class, kept across the panel being raised and put away:
// building a hull is the slow part, and she does not change.
const MODELS = new Map();

export class TargetingView {
  constructor(canvas) {
    this.canvas = canvas;
    // One context shared by every board: see boardgl.js.
    this.renderer = new BoardRenderer(canvas);
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
    // Where the view stands round her: a bearing and an elevation off her
    // middle, and how far in from the fitted distance.
    this.yaw = Math.atan2(-0.62, 0.72);
    this.pitch = 0.32;
    this.zoom = 1;
    this.pick = null;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48),
      new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 10;
    this.ring.visible = false;
    this.scene.add(this.ring);
    this.bindDrag();
  }

  /** Drag to turn round her; pinch or the wheel to come in. */
  bindDrag() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    const pts = new Map();
    let last = null, spread = 0;
    const gap = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      last = { x: e.clientX, y: e.clientY };
      if (pts.size === 2) spread = gap();
      e.preventDefault();
    });
    c.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2) {
        const g = gap();
        if (spread > 0) this.zoom = THREE.MathUtils.clamp(this.zoom * (g / spread), 0.6, 4);
        spread = g;
        return;
      }
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      this.yaw -= dx * 0.01;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.008, -0.15, 1.45);
      e.preventDefault();
    });
    const up = (e) => { pts.delete(e.pointerId); spread = pts.size >= 2 ? gap() : 0; if (pts.size === 1) last = [...pts.values()][0]; };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(-e.deltaY * 0.0015), 0.6, 4);
      e.preventDefault();
    }, { passive: false });
  }

  /**
   * Ring one of her mountings, or none: `{ kind, i, at }` off the bar over the
   * picture (see targetingMounts), `at` where her datasheet stands it.
   */
  select(pick) { this.pick = pick || null; }

  /** The model's mounting a pick names, if the model has one for it. */
  mountOf(pick) {
    const m = this.shown;
    if (!m || !pick) return null;
    const torps = (m.torpMounts && m.torpMounts.length ? m.torpMounts : m.group.userData.torpMounts) || [];
    const list = pick.kind === 'main' ? m.turrets : pick.kind === 'sec' ? m.secMounts
      : pick.kind === 'dp' ? m.aaMounts : torps;
    return (list || [])[pick.i] || null;
  }

  /** Show this class: built once, and kept for the next time she is asked for. */
  build(classId) {
    if (classId === this.classId) return;
    // Not fetched yet: asked for, and shown on a later frame once it is in.
    if (!shipReady(classId)) { loadShips([classId], null, { quiet: true }).catch(() => {}); return; }
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
        // Gone through her deck on the water, gone from the picture too.
        a.visible = !b.userData.gone;
        a.rotation.y = b.rotation.y;
        const ga = a.userData.gunNode, gb = b.userData.gunNode;
        if (ga && gb && ga !== a) ga.rotation.x = gb.rotation.x;
      }
    }
  }

  /**
   * The rounds she has been seen to take, each marked where it went in:
   * red for one that got in, orange for one that holed her and was stopped by
   * her armour, white for one her armour turned away. The spot it struck and
   * nothing round it -- a penetration is a hole in one place, not a
   * compartment. `list` is `[lx, ly, lz, kind]` in her own frame.
   */
  setHits(id, list) {
    const m = this.shown;
    const n = list ? list.v || list.length : 0;
    const key = `${id}|${this.classId}|${n}`;
    if (key === this.hitKey) return;
    this.hitKey = key;
    if (!this.hitGroup) {
      this.hitGroup = new THREE.Group();
      this.hitGroup.renderOrder = 9;
      const mat = (color, opacity) => new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, depthTest: false, depthWrite: false,
      });
      this.hitMat = { pen: mat(0xff2a1a, 0.95), dent: mat(0xffa03a, 0.9), none: mat(0xffffff, 0.75) };
      this.scene.add(this.hitGroup);
    }
    for (const c of [...this.hitGroup.children]) this.hitGroup.remove(c);
    if (!m || !list) return;
    const beam = Math.min(m.size.x, m.size.z) || 20;
    const rad = Math.max(0.8, beam * 0.045);
    if (!this.hitGeo || this.hitRad !== rad) {
      this.hitGeo = new THREE.SphereGeometry(rad, 10, 8);
      this.hitRad = rad;
    }
    for (const [lx, ly, lz, kind] of list) {
      const what = MARK_KIND[kind] || 'pen';
      const dot = new THREE.Mesh(this.hitGeo, this.hitMat[what]);
      dot.position.set(lx, ly, lz);
      // A round that got in is drawn larger, so it reads at a glance.
      if (what === 'pen') dot.scale.setScalar(1.35);
      dot.renderOrder = what === 'pen' ? 12 : 11;
      this.hitGroup.add(dot);
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
    // Brought in until she just fills the panel from wherever it is looking
    // at her, with a margin -- so a destroyer and a battleship each fill it,
    // broadside or end on -- and then in or out by the pinch. Worked out again
    // only when the view has turned.
    const cam = this.camera;
    const cp = Math.cos(this.pitch);
    const look = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const key = `${m.mid.x}|${this.yaw.toFixed(3)}|${this.pitch.toFixed(3)}|${cam.aspect.toFixed(3)}`;
    if (this.fitKey !== key || this.fitFor !== m) {
      const pts = m.points;
      const step = Math.max(1, Math.floor(pts.length / 700));
      const fits = (d) => {
        cam.position.copy(m.mid).addScaledVector(look, d);
        cam.lookAt(m.mid);
        cam.updateMatrixWorld(true);
        const q = new THREE.Vector3();
        for (let k = 0; k < pts.length; k += step) {
          q.copy(pts[k]).project(cam);
          if (Math.abs(q.x) > 0.94 || Math.abs(q.y) > 0.9 || q.z >= 1) return false;
        }
        return true;
      };
      let lo = 1, hi = Math.max(m.size.x, m.size.z) * 8;
      for (let k = 0; k < 22; k++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
      this.fitD = hi;
      this.fitKey = key;
      this.fitFor = m;
    }
    cam.position.copy(m.mid).addScaledVector(look, this.fitD / this.zoom);
    cam.lookAt(m.mid);
    // The ring round the mounting picked, where it stands on her now.
    const mount = this.mountOf(this.pick);
    if (this.pick && (mount || this.pick.at)) {
      let x, y, z, r;
      if (mount) {
        const b = new THREE.Box3().setFromObject(mount);
        const c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
        x = c.x; y = b.min.y + 0.3; z = c.z; r = Math.max(2.5, Math.max(sz.x, sz.z) * 0.62);
      } else {
        x = this.pick.at.x; z = this.pick.at.z; y = m.mid.y; r = 4;
      }
      this.ring.position.set(x, y, z);
      this.ring.scale.setScalar(r);
      this.ring.material.opacity = 0.65 + 0.3 * Math.sin(performance.now() / 180);
      this.ring.visible = true;
    } else {
      this.ring.visible = false;
    }
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
