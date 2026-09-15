// The aeroplane on the damage board.
//
// The ships have had one of these since the shells started going through
// compartments rather than into a hit-point bar: her own hull in wire, turning
// in the air over the panel, with the part that has been hit lit up on the
// place it actually is. An aeroplane had the same damage model underneath --
// engine, tanks, wings, tail, crew, structure, each with its own strength and
// its own consequence (see shared/airframe.js) -- and no way at all to see it.
// A pilot watched his aeroplane get slower and refuse to turn and was told
// nothing about why.
//
// So: the same board, at an aeroplane's scale. Her own model, the one she is
// drawn with in the air, in wire; every piece of her coloured by the condition
// of the part of her it belongs to; the fire where the fire is.
//
// Which piece belongs to which part is worked out from where the piece is on
// her, because nothing else knows: a wing is what is out past the fuselage
// sides, an engine is what is forward of the firewall, a tail is what is aft
// of the sternpost. That is approximate and it is honest about being so -- the
// board's job is to say "your port wing is shot about", and a piece of fairing
// assigned to the fuselage instead of the wing does not change that.

import * as THREE from '../../../vendor/three.module.js';
import { PARTS } from '../../../shared/airframe.js';
import {
  wildcat, dauntless, avenger, arado, kingfisher, zero, suisei, tenzan, jake,
  heavyBomber, HEAVY_KINDS,
} from './planekit.js';

const BUILD = {
  wildcat, dauntless, avenger, arado, kingfisher, zero, suisei, tenzan, jake,
};

/** Whether this is one of the heavy squadrons rather than a carrier machine. */
const isHeavy = (kind) => HEAVY_KINDS.includes(kind);

/** Sound, knocked about, gone -- the same three the ship's board uses. */
const SOUND = new THREE.Color(0x58c8e8);
const HURT = new THREE.Color(0xe2c14f);
const GONE = new THREE.Color(0xe2564f);
const NEUTRAL = new THREE.Color(0x2f6d84);

/** What the pilot is told each part is called. */
export const PART_NAME = Object.fromEntries(PARTS.map((p) => [p.k, p.name]));

/**
 * Which part of an aeroplane a piece of her belongs to.
 *
 * By where it is, in fractions of her own length and span, so the same rule
 * works on a Wildcat and on a Tenzan half as big again. `box` is the piece's
 * own bounding box and `sz` the whole aeroplane's.
 */
export function partOfPiece(c, lo, hi) {
  const len = hi.z - lo.z;
  const halfSpan = Math.max(hi.x, -lo.x);
  const nose = hi.z - len * 0.17;
  const stern = lo.z + len * 0.26;
  // Out past the sides of the body: a wing, or the tailplane if it is aft.
  const outboard = Math.abs(c.x) > halfSpan * 0.13;
  if (c.z < stern) return 'tail';
  if (c.z > nose) return 'engine';
  if (outboard) {
    // The inner third of the panel is where the tanks are, which is why a
    // wing root hit sets an aeroplane alight and a wing tip hit does not.
    return Math.abs(c.x) < halfSpan * 0.42 ? 'tanks' : 'wings';
  }
  // On the centreline: the cockpit is the part of her over the wing, and
  // everything else is structure.
  const midZ = (lo.z + hi.z) / 2;
  const midY = (lo.y + hi.y) / 2;
  if (c.y > midY + (hi.y - lo.y) * 0.08 && c.z > midZ - len * 0.14
    && c.z < midZ + len * 0.24) return 'crew';
  return 'body';
}

export class PlaneBoard {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 2.2, 0.1, 400);
    this.scene.add(new THREE.HemisphereLight(0x9fd8ee, 0x0b1a24, 1.4));
    this.spin = 0.7;
    this.tilt = 0.36;
    this.zoom = 1;
    this.held = false;
    this.time = 0;
    this.kind = null;
    this.fires = [];
    this.grabbed(canvas);
  }

  /**
   * Take hold of her and turn her.
   *
   * The same as the ship's board: a board you cannot turn shows one side of an
   * aeroplane and the wing you want is always the other one.
   */
  grabbed(canvas) {
    const pts = new Map();
    let pinch = 0;
    canvas.style.touchAction = 'none';
    const gap = () => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    canvas.addEventListener('pointerdown', (e) => {
      try { canvas.setPointerCapture?.(e.pointerId); } catch { /* no capture */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) pinch = gap();
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const was = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const d = gap();
        if (pinch > 8 && d > 8) {
          this.zoom = Math.max(0.5, Math.min(3, this.zoom * (d / pinch)));
          pinch = d;
        }
        return;
      }
      this.held = true;
      this.spin -= (e.clientX - was.x) * 0.012;
      this.tilt = Math.max(-0.7, Math.min(1.4, this.tilt + (e.clientY - was.y) * 0.010));
      e.preventDefault();
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = 0;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', up);
    canvas.addEventListener('dblclick', () => {
      this.held = false;
      this.tilt = 0.36;
      this.zoom = 1;
    });
  }

  /**
   * Stand an aeroplane on the board.
   *
   * Called again when the pilot takes a different machine. Only the model is
   * rebuilt: a WebGL context is not a thing to make and throw away.
   */
  build(kind) {
    if (this.kind === kind) return;
    this.kind = kind;
    if (this.rig) {
      this.scene.remove(this.rig);
      this.rig.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
    }
    this.rig = new THREE.Group();
    this.scene.add(this.rig);

    const holder = new THREE.Group();
    if (isHeavy(kind)) {
      // A heavy is asked for by name and comes back whole, already in flight
      // trim -- she has no undercarriage to raise, because she is only ever
      // drawn in the air. Her interior is a group the cutaway raises and is
      // left down here: a damage board is her outline, not her insides.
      holder.add(heavyBomber(kind));
    } else {
      const f = BUILD[kind] || BUILD.wildcat;
      // In flight trim: wheels up, wings spread, nothing hanging off her.
      if (kind === 'avenger' || kind === 'tenzan') f(holder, 0, 0, 0, 0, false, false, { gear: false });
      else if (kind === 'kingfisher') f(holder, 0, 0, 0, 0, {});
      else f(holder, 0, 0, 0, 0, false, { gear: false });
    }
    holder.updateMatrixWorld(true);

    // Her whole extent, so the parts can be told apart in fractions of her.
    const whole = new THREE.Box3();
    holder.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      for (let n = o; n; n = n.parent) if (n.visible === false) return;
      whole.union(new THREE.Box3().setFromObject(o));
    });
    const mid = whole.getCenter(new THREE.Vector3());

    // Every piece in wire, coloured by the part it belongs to.
    this.painted = [];
    const box = new THREE.Box3();
    const c = new THREE.Vector3();
    holder.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      let shown = true;
      for (let n = o; n; n = n.parent) if (n.visible === false) shown = false;
      if (!shown) { o.visible = false; return; }
      box.setFromObject(o);
      box.getCenter(c);
      const k = partOfPiece(c, whole.min, whole.max);
      const mat = new THREE.MeshBasicMaterial({
        color: NEUTRAL, wireframe: true, transparent: true, opacity: 0.30,
        depthWrite: false,
      });
      o.material = mat;
      this.painted.push({ mat, k });
    });
    // Stood on her own middle, so she turns about herself.
    holder.position.sub(mid);
    this.rig.add(holder);
    this.len = Math.max(whole.max.z - whole.min.z, whole.max.x - whole.min.x);

    // Where each part is, for the fire to burn in the right place and for a
    // tap to find it.
    this.where = {};
    for (const p of PARTS) this.where[p.k] = new THREE.Vector3();
    const n = {};
    holder.traverse((o) => {
      if (!o.isMesh || !o.geometry || o.visible === false) return;
      box.setFromObject(o);
      box.getCenter(c);
      const k = partOfPiece(c, whole.min, whole.max);
      this.where[k].add(c);
      n[k] = (n[k] || 0) + 1;
    });
    for (const p of PARTS) {
      if (n[p.k]) this.where[p.k].multiplyScalar(1 / n[p.k]);
      this.where[p.k].sub(mid);
    }

    // The fire: a handful of billboards over whatever is alight.
    for (const f2 of this.fires) this.rig.remove(f2);
    this.fires = [];
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry(this.len * 0.09, this.len * 0.09),
        new THREE.MeshBasicMaterial({
          color: 0xff9a3c, transparent: true, opacity: 0, depthWrite: false,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        }),
      );
      s.visible = false;
      this.rig.add(s);
      this.fires.push(s);
    }
  }

  /**
   * What she looks like now.
   *
   * `dm` is the report off the wire: six part fractions, then how hard she is
   * burning, how fast she is leaking and how much fuel is left.
   */
  update(dm, dt) {
    this.time += dt;
    if (!this.rig) return;
    if (!this.held) this.spin += dt * 0.26;
    this.rig.rotation.y = this.spin;
    this.rig.rotation.x = this.tilt;

    const frac = {};
    PARTS.forEach((p, i) => { frac[p.k] = dm ? (dm[i] ?? 1) : 1; });
    const fire = dm ? (dm[6] || 0) : 0;
    for (const q of this.painted) {
      const f = frac[q.k] ?? 1;
      // Sound is the cold blue the ship's board uses; a part being shot about
      // warms through amber and ends at red, and the wire brightens with it so
      // the eye goes to the damage rather than having to hunt for a hue.
      if (f > 0.66) q.mat.color.copy(SOUND).lerp(HURT, (1 - f) / 0.34);
      else if (f > 0) q.mat.color.copy(HURT).lerp(GONE, (0.66 - f) / 0.66);
      else q.mat.color.copy(GONE);
      q.mat.opacity = 0.22 + (1 - f) * 0.5;
    }

    // Where she is burning: the part that is worst hit and alight.
    let seat = null;
    if (fire > 0.02) {
      let worst = 1;
      for (const p of PARTS) {
        const f = frac[p.k] ?? 1;
        if ((p.k === 'tanks' || p.k === 'engine') && f < worst) { worst = f; seat = p.k; }
      }
      if (!seat) seat = 'tanks';
    }
    for (const [i, s] of this.fires.entries()) {
      if (!seat) { s.visible = false; continue; }
      const at = this.where[seat];
      const t = this.time * 2.2 + i * 1.7;
      s.visible = true;
      s.position.set(
        at.x + Math.sin(t * 1.3) * this.len * 0.03,
        at.y + ((t * 0.5) % 1) * this.len * 0.13,
        at.z - ((t * 0.5) % 1) * this.len * 0.10,
      );
      s.material.opacity = fire * 0.5 * (1 - ((t * 0.5) % 1));
      s.quaternion.copy(this.camera.quaternion);
      s.quaternion.premultiply(this.rigInv || (this.rigInv = new THREE.Quaternion()));
    }

    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 140;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
    }
    // Far enough off that she fits the panel with air round her: drawn at
    // half her own length the wing tips ran off both sides of the board.
    const d = (this.len * 1.85) / this.zoom;
    this.camera.position.set(0, d * 0.16, d);
    this.camera.lookAt(0, 0, 0);
    // The billboards face the camera through the rig's own turn.
    this.rigInv = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-this.rig.rotation.x, -this.rig.rotation.y, 0, 'YXZ'));
    this.renderer.render(this.scene, this.camera);
  }

  dispose() { this.renderer.dispose(); }
}
