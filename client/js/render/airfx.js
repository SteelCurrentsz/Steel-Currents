// What an aeroplane leaves in the air: her vapour trails, and the flash and
// the smoke of her guns.
//
// The trails are ribbons laid behind her wingtips -- faint in level flight,
// thick and white when she is pulled hard and the air over her tips is wrung
// out into cloud -- and behind her engine when she is high enough for the
// exhaust to freeze into a contrail. Each is a strip of points she has been
// through, widening and thinning as it ages, rebuilt each frame to face the
// camera. One draw call for every trail in the sky.
//
// The muzzle flash is hers, not the sky's. A flash put into the world where
// the gun was when it fired is left a dozen metres behind a fighter in the
// twentieth of a second it lasts; this one is drawn on her, at each muzzle, in
// her own frame, a different shape every frame the trigger is held. The
// smoke is the sky's: a grey thread off each gun that the slipstream takes and
// the aeroplane flies out of.
import * as THREE from '../../../vendor/three.module.js';

// ---- the trails ------------------------------------------------------------

/** How long a piece of trail lasts, in seconds, and how wide it grows to. */
const TIP_LIFE = 2.6;
const TIP_WIDE = [0.18, 1.6];
const ENGINE_LIFE = 9;
const ENGINE_WIDE = [0.6, 9];

class Trail {
  constructor(life, wide, max) {
    this.life = life;
    this.wide = wide;
    this.max = max;
    this.pts = [];
    this.seen = 0;
  }

  push(x, y, z, a, t) {
    const last = this.pts[this.pts.length - 1];
    // Laid every metre and a half or every fortieth of a second, whichever
    // comes first, so a fast aeroplane's trail is as smooth as a slow one's.
    if (last && Math.hypot(x - last.x, y - last.y, z - last.z) < 1.5 && t - last.t < 0.025) {
      last.x = x; last.y = y; last.z = z; last.a = a;
      return;
    }
    this.pts.push({ x, y, z, a, t });
    if (this.pts.length > this.max) this.pts.shift();
  }

  trim(t) {
    while (this.pts.length && t - this.pts[0].t > this.life) this.pts.shift();
  }
}

export class Contrails {
  constructor(scene, maxQuads = 6000) {
    this.trails = new Map();
    this.max = maxQuads;
    this.time = 0;
    const pos = new Float32Array(maxQuads * 4 * 3);
    const col = new Float32Array(maxQuads * 4 * 4);
    const idx = new Uint32Array(maxQuads * 6);
    for (let q = 0; q < maxQuads; q++) {
      const v = q * 4;
      idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], q * 6);
    }
    this.geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('color', this.col);
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      fog: true,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  /**
   * Lay trail behind one aeroplane for this frame.
   *
   * `key` is which aeroplane; `m` is her world matrix; `tips` is where her
   * wingtips are in her own frame and `nose` her engine; `g` is how hard she
   * is pulling, `v` how fast she is going and `y` how high she is. `has`
   * says which tips she still has -- a wing shot off takes its tip and its
   * trail with it -- and `engine` whether her engine's trail is laid at all.
   */
  lay(key, m, tips, nose, g, v, y, has = null, engine = true) {
    const t = this.time;
    // The tips: a wisp at speed in level flight, and cloud when she is hauled
    // round -- low pressure over the tip is what condenses the vapour, and it
    // goes as the lift she is making.
    const pull = Math.max(0, Math.min(1, (Math.abs(g) - 1.6) / 3.2));
    const fast = Math.max(0, Math.min(1, (v - 70) / 90));
    const damp = 0.12 + Math.max(0, Math.min(1, (y - 1500) / 3000)) * 0.2;
    const a = Math.min(0.95, fast * damp + pull * 0.8);
    const p = new THREE.Vector3();
    tips.forEach((tip, i) => {
      const id = key + ':' + i;
      // That wingtip has gone: so has its trail, at once.
      if (has && !has[i]) { this.trails.delete(id); return; }
      let tr = this.trails.get(id);
      if (!tr) { tr = new Trail(TIP_LIFE, TIP_WIDE, 120); this.trails.set(id, tr); }
      p.fromArray(tip).applyMatrix4(m);
      tr.push(p.x, p.y, p.z, a, t);
      tr.seen = t;
    });
    // And the engine's own, once she is up where the air is cold enough: a
    // proper contrail, thin at first and spreading into a broad white road.
    const high = Math.max(0, Math.min(1, (y - 1800) / 2200));
    const ea = high * 0.75 * Math.max(0.3, fast);
    const id = key + ':e';
    let tr = this.trails.get(id);
    if (engine && (ea > 0.01 || tr)) {
      if (!tr) { tr = new Trail(ENGINE_LIFE, ENGINE_WIDE, 160); this.trails.set(id, tr); }
      p.fromArray(nose).applyMatrix4(m);
      tr.push(p.x, p.y, p.z, ea, t);
      tr.seen = t;
    }
  }

  /** Age them and rebuild the ribbons to face `camera`. */
  update(dt, camera) {
    this.time += dt;
    const t = this.time;
    const pos = this.pos.array;
    const col = this.col.array;
    const eye = camera.position;
    let q = 0;
    const side = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const view = new THREE.Vector3();
    for (const [id, tr] of this.trails) {
      tr.trim(t);
      if (!tr.pts.length && t - tr.seen > 1) { this.trails.delete(id); continue; }
      const pts = tr.pts;
      for (let i = 0; i + 1 < pts.length && q < this.max; i++) {
        const a = pts[i], b = pts[i + 1];
        if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) > 60) continue;
        dir.set(b.x - a.x, b.y - a.y, b.z - a.z);
        view.set(a.x - eye.x, a.y - eye.y, a.z - eye.z);
        side.crossVectors(dir, view);
        const sl = side.length();
        if (sl < 1e-6) continue;
        side.multiplyScalar(1 / sl);
        const v = q * 4;
        const put = (k, p, s) => {
          const age = (t - p.t) / tr.life;
          const w = (tr.wide[0] + (tr.wide[1] - tr.wide[0]) * Math.sqrt(Math.max(0, age))) * 0.5;
          pos[(v + k) * 3] = p.x + side.x * w * s;
          pos[(v + k) * 3 + 1] = p.y + side.y * w * s;
          pos[(v + k) * 3 + 2] = p.z + side.z * w * s;
          const fade = Math.max(0, 1 - age);
          const alpha = p.a * fade * fade * (k < 2 ? 1 : 1);
          col.set([0.95, 0.96, 0.98, alpha], (v + k) * 4);
        };
        put(0, a, -1);
        put(1, a, 1);
        put(2, b, -1);
        put(3, b, 1);
        q++;
      }
    }
    this.geo.setDrawRange(0, q * 6);
    this.mesh.visible = q > 0;
    if (q) {
      this.pos.needsUpdate = true;
      this.col.needsUpdate = true;
    }
  }
}

// ---- the guns --------------------------------------------------------------

/** A flame, soft and hot in the middle: white through yellow to nothing. */
function flameTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,240,1)');
  grad.addColorStop(0.25, 'rgba(255,226,140,0.95)');
  grad.addColorStop(0.55, 'rgba(255,150,50,0.55)');
  grad.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The flash itself: a star facing forward and two crossed blades of flame
 * along the bore, so it reads from the side and from behind as well as head
 * on. Built at unit size along +z, scaled per shot.
 */
function flashGeometry() {
  const parts = [];
  const disc = new THREE.PlaneGeometry(1, 1);
  disc.translate(0, 0, 0.15);
  parts.push(disc);
  for (const r of [0, Math.PI / 2]) {
    const blade = new THREE.PlaneGeometry(0.55, 2.2);
    blade.rotateX(Math.PI / 2);
    blade.translate(0, 0, 1.0);
    blade.rotateZ(r);
    parts.push(blade);
  }
  const pos = [], uv = [], idx = [];
  for (const g of parts) {
    const base = pos.length / 3;
    const p = g.attributes.position, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); uv.push(u.getX(i), u.getY(i)); }
    for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

export class GunFlashes {
  constructor(scene, max = 96) {
    this.max = max;
    this.n = 0;
    this.mesh = new THREE.InstancedMesh(flashGeometry(), new THREE.MeshBasicMaterial({
      map: flameTexture(), color: 0xffffff, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    scene.add(this.mesh);
    // The light of it on her wings and cowling, flickering with it.
    this.light = new THREE.PointLight(0xffb45a, 0, 30, 2);
    scene.add(this.light);
    this.lit = 0;
    this.m = new THREE.Matrix4();
    this.t = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.smokeT = new Map();
  }

  begin() { this.n = 0; }

  /**
   * One aeroplane's guns going this frame: a flash at each muzzle, on her, and
   * a puff of smoke off each now and then, left in the air behind her.
   *
   * `m` is her world matrix, `muzzles` her guns in her own frame, `vel` how
   * she is moving, `cal` the calibre of each gun (or one for all), and `key`
   * which aeroplane, so her smoke is paced on its own clock.
   */
  fire(key, m, muzzles, vel, cal, fx, dt, light = true) {
    const p = this.v;
    let smoke = (this.smokeT.get(key) || 0) - dt;
    const puff = smoke <= 0;
    if (puff) smoke = 0.045;
    this.smokeT.set(key, smoke);
    // Down her bore, in the world.
    const bx = m.elements[8], by = m.elements[9], bz = m.elements[10];
    muzzles.forEach((mz, i) => {
      const c = Array.isArray(cal) ? (cal[i] ?? 12.7) : cal;
      const k = 0.5 + c / 28;
      if (this.n < this.max) {
        // A different flash every frame: they never look alike twice, which
        // is what makes a burst read as a burst rather than a lamp.
        const len = k * (0.45 + Math.random() * 0.75);
        const wide = k * (0.5 + Math.random() * 0.45);
        this.q.setFromAxisAngle(this.s.set(0, 0, 1), Math.random() * Math.PI);
        this.t.compose(p.fromArray(mz), this.q, this.s.set(wide, wide, len));
        this.m.multiplyMatrices(m, this.t);
        this.mesh.setMatrixAt(this.n++, this.m);
      }
      if (puff && fx) {
        p.fromArray(mz).applyMatrix4(m);
        // The gas leaves the muzzle at her own speed and stops in the air
        // almost at once, so it is left behind her as a thread off each gun.
        fx.spawn({
          x: p.x + bx * 0.6, y: p.y + by * 0.6, z: p.z + bz * 0.6,
          vx: vel.x * 0.35 + bx * 6, vy: vel.y * 0.35 + by * 6 + 0.4, vz: vel.z * 0.35 + bz * 6,
          size: 0.35 * k, grow: 2.6 * k, ttl: 0.9 + Math.random() * 0.5,
          color: 0xa29f96, opacity: 0.32, drag: 0.92, lift: 0.4,
        });
      }
    });
    if (light) {
      p.set(0, 0, 0);
      for (const mz of muzzles) { p.x += mz[0]; p.y += mz[1]; p.z += mz[2]; }
      p.multiplyScalar(1 / Math.max(1, muzzles.length)).applyMatrix4(m);
      this.light.position.copy(p);
      this.lit = 0.06;
      this.light.intensity = 40 + Math.random() * 60;
    }
  }

  end(dt) {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n) this.mesh.instanceMatrix.needsUpdate = true;
    this.lit -= dt;
    if (this.lit <= 0) this.light.intensity = 0;
  }
}
