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

/**
 * The kinds of trail, and how each one lives.
 *
 * `life` is how long a piece of it lasts, in seconds; `wide` what it is born
 * and dies at, in metres; `head` how long after she has passed through a
 * piece of air the trail is fully formed there -- vapour off a tip is there
 * at once, an engine's contrail is a few lengths of clear air behind her
 * before the exhaust freezes; `sink` how fast it settles; `rgb` its colour.
 */
const KIND = {
  tip: { life: 2.6, wide: [0.22, 1.8], head: 0.02, sink: 0, rgb: [0.96, 0.97, 0.99], max: 120 },
  engine: { life: 11, wide: [0.7, 11], head: 0.18, sink: 0.35, rgb: [0.97, 0.98, 1.0], max: 200 },
  // Petrol out of a holed wing tank: a white plume that bursts out of the
  // hole, spreads fast and evaporates in a few seconds.
  fuel: { life: 3.4, wide: [0.35, 5.5], head: 0.01, sink: 0.6, rgb: [0.99, 0.99, 1.0], max: 160 },
};

// How many metres of trail one repeat of the texture covers.
const TEX_LEN = 34;

class Trail {
  constructor(kind) {
    Object.assign(this, KIND[kind]);
    this.pts = [];
    this.seen = 0;
    // Each trail starts somewhere different along the texture, so no two of
    // them carry the same lumps in the same places.
    this.phase = Math.random();
  }

  push(x, y, z, a, t) {
    const last = this.pts[this.pts.length - 1];
    // Laid every metre and a half or every fortieth of a second, whichever
    // comes first, so a fast aeroplane's trail is as smooth as a slow one's.
    if (last && Math.hypot(x - last.x, y - last.y, z - last.z) < 1.5 && t - last.t < 0.025) {
      const prev = this.pts[this.pts.length - 2];
      last.d = prev ? prev.d + Math.hypot(x - prev.x, y - prev.y, z - prev.z) : 0;
      last.x = x; last.y = y; last.z = z; last.a = a;
      return;
    }
    const d = last ? last.d + Math.hypot(x - last.x, y - last.y, z - last.z) : 0;
    this.pts.push({ x, y, z, a, t, d });
    if (this.pts.length > this.max) this.pts.shift();
  }

  trim(t) {
    while (this.pts.length && t - this.pts[0].t > this.life) this.pts.shift();
  }
}

/**
 * The ribbon's texture: soft across it, brightest down the middle and gone at
 * the edges so it reads as vapour and not as a strip of paper, and lumpy along
 * it, the way a real trail is thicker in some places than others.
 */
function vapourTexture() {
  if (typeof document === 'undefined') return null;
  const W = 32, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  // A few octaves of smooth noise along the trail, tiling.
  const wave = (v) => 0.55
    + 0.22 * Math.sin(v * Math.PI * 2 * 3 + 0.7)
    + 0.14 * Math.sin(v * Math.PI * 2 * 7 + 2.1)
    + 0.09 * Math.sin(v * Math.PI * 2 * 13 + 4.4);
  for (let y = 0; y < H; y++) {
    const v = y / H;
    const lump = wave(v);
    // The core wanders a little from side to side.
    const off = 0.06 * Math.sin(v * Math.PI * 2 * 5 + 1.3);
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W * 2 - 1 - off;
      const core = Math.exp(-u * u * 4.2);
      const strand = 0.85 + 0.15 * Math.sin((u * 9 + v * Math.PI * 2 * 4) * 1.7);
      const al = Math.max(0, Math.min(1, core * (0.55 + 0.45 * lump) * strand));
      const k = (y * W + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(al * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Contrails {
  constructor(scene, maxQuads = 7000) {
    this.trails = new Map();
    this.max = maxQuads;
    this.time = 0;
    const pos = new Float32Array(maxQuads * 4 * 3);
    const col = new Float32Array(maxQuads * 4 * 4);
    const uv = new Float32Array(maxQuads * 4 * 2);
    const idx = new Uint32Array(maxQuads * 6);
    for (let q = 0; q < maxQuads; q++) {
      const v = q * 4;
      idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], q * 6);
    }
    this.geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
    this.uv = new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('color', this.col);
    this.geo.setAttribute('uv', this.uv);
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      map: vapourTexture(), vertexColors: true, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, fog: true,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  trail(id, kind) {
    let tr = this.trails.get(id);
    if (!tr) { tr = new Trail(kind); this.trails.set(id, tr); }
    return tr;
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
      const tr = this.trail(id, 'tip');
      p.fromArray(tip).applyMatrix4(m);
      tr.push(p.x, p.y, p.z, a, t);
      tr.seen = t;
    });
    // And the engine's own, once she is up where the air is cold enough: a
    // proper contrail, thin at first and spreading into a broad white road.
    const high = Math.max(0, Math.min(1, (y - 1800) / 2200));
    const ea = high * 0.8 * Math.max(0.3, fast);
    const id = key + ':e';
    if (engine && (ea > 0.01 || this.trails.has(id))) {
      const tr = this.trail(id, 'engine');
      p.fromArray(nose).applyMatrix4(m);
      tr.push(p.x, p.y, p.z, ea, t);
      tr.seen = t;
    }
  }

  /**
   * Fuel streaming out of a holed tank, at `x, y, z` in the world, this
   * frame. `key` is which tank on which aeroplane; `a` how thick the plume is.
   */
  vent(key, x, y, z, a = 0.7) {
    const tr = this.trail(key + ':f', 'fuel');
    tr.push(x, y, z, a, this.time);
    tr.seen = this.time;
  }

  /** Age them and rebuild the ribbons to face `camera`. */
  update(dt, camera) {
    this.time += dt;
    const t = this.time;
    const pos = this.pos.array;
    const col = this.col.array;
    const uvs = this.uv.array;
    const eye = camera.position;
    let q = 0;
    const side = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const view = new THREE.Vector3();
    for (const [id, tr] of this.trails) {
      tr.trim(t);
      if (!tr.pts.length && t - tr.seen > 1) { this.trails.delete(id); continue; }
      const pts = tr.pts;
      const [r, g, b] = tr.rgb;
      const last = pts.length - 1;
      for (let i = 0; i < last && q < this.max; i++) {
        const a = pts[i], c = pts[i + 1];
        if (Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z) > 60) continue;
        dir.set(c.x - a.x, c.y - a.y, c.z - a.z);
        view.set(a.x - eye.x, a.y - eye.y, a.z - eye.z);
        side.crossVectors(dir, view);
        const sl = side.length();
        if (sl < 1e-6) continue;
        side.multiplyScalar(1 / sl);
        const v = q * 4;
        const put = (k, p, s, end) => {
          const age = Math.max(0, t - p.t);
          const life = age / tr.life;
          // It spreads quickly at first and then slowly, the way a plume of
          // vapour mixes into the air round it.
          const w = (tr.wide[0] + (tr.wide[1] - tr.wide[0]) * Math.sqrt(Math.min(1, life))) * 0.5;
          // And settles as it goes.
          const sink = tr.sink * age;
          pos[(v + k) * 3] = p.x + side.x * w * s;
          pos[(v + k) * 3 + 1] = p.y + side.y * w * s - sink;
          pos[(v + k) * 3 + 2] = p.z + side.z * w * s;
          uvs[(v + k) * 2] = s < 0 ? 0 : 1;
          uvs[(v + k) * 2 + 1] = p.d / TEX_LEN + tr.phase;
          // Forming behind her rather than painted on at her tail, and thinning
          // to nothing at its far end rather than cut off.
          const form = Math.min(1, age / Math.max(1e-3, tr.head));
          const fade = Math.max(0, 1 - life);
          // A trail gets thinner as it gets wider: the same vapour, spread.
          const thin = tr.wide[0] / (w * 2);
          const alpha = p.a * form * form * fade * Math.sqrt(fade)
            * (0.55 + 0.45 * Math.min(1, thin * 6)) * (end ? 0 : 1);
          // A touch of grey in the old part of it, which is lit from one side
          // and has the sky behind it.
          const shade = 1 - 0.1 * Math.min(1, life);
          col[(v + k) * 4] = r * shade;
          col[(v + k) * 4 + 1] = g * shade;
          col[(v + k) * 4 + 2] = b * shade;
          col[(v + k) * 4 + 3] = alpha;
        };
        put(0, a, -1, i === 0);
        put(1, a, 1, i === 0);
        put(2, c, -1, false);
        put(3, c, 1, false);
        q++;
      }
    }
    this.geo.setDrawRange(0, q * 6);
    this.mesh.visible = q > 0;
    if (q) {
      this.pos.needsUpdate = true;
      this.col.needsUpdate = true;
      this.uv.needsUpdate = true;
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
