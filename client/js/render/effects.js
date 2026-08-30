// Pooled sprite effects: shell splashes, explosions, muzzle flash, fires,
// funnel smoke and smoke screens. One shared canvas texture, two materials.

import * as THREE from '../../../vendor/three.module.js';
import { Splashes, splashSize } from './splash.js';

function softTexture(inner = 'rgba(255,255,255,0.95)', outer = 'rgba(255,255,255,0)') {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.45, inner.replace(/[\d.]+\)$/, '0.45)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

const POOL_SIZE = 320;

export class Effects {
  constructor(scene, intensity = 1) {
    this.scene = scene;
    this.intensity = intensity;
    this.puffTex = softTexture('rgba(255,255,255,0.9)');
    this.glowTex = softTexture('rgba(255,236,190,1)');

    this.smokeMat = new THREE.SpriteMaterial({ map: this.puffTex, transparent: true, depthWrite: false, opacity: 0.8 });
    this.glowMat = new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

    this.pool = [];
    this.active = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const s = new THREE.Sprite(this.smokeMat.clone());
      s.visible = false;
      scene.add(s);
      this.pool.push(s);
    }

    // The water a round throws up is meshes, not sprites -- see splash.js.
    this.splashes = new Splashes(scene, intensity);

    this.lights = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffbb66, 0, 900, 2);
      scene.add(l);
      this.lights.push({ light: l, life: 0 });
    }
    this.lightCursor = 0;
  }

  take() {
    const s = this.pool.pop();
    if (!s) return null;
    s.visible = true;
    return s;
  }

  spawn(opts) {
    const s = this.take();
    if (!s) return null;
    const p = {
      sprite: s, life: 0, ttl: opts.ttl ?? 1.2,
      vx: opts.vx ?? 0, vy: opts.vy ?? 0, vz: opts.vz ?? 0,
      grow: opts.grow ?? 12, size: opts.size ?? 12,
      fade: opts.fade ?? 1, drag: opts.drag ?? 0.6,
    };
    s.position.set(opts.x, opts.y, opts.z);
    s.scale.setScalar(p.size);
    s.material.map = opts.glow ? this.glowTex : this.puffTex;
    s.material.blending = opts.glow ? THREE.AdditiveBlending : THREE.NormalBlending;
    s.material.color.set(opts.color ?? 0xffffff);
    s.material.opacity = opts.opacity ?? 0.85;
    p.opacity0 = s.material.opacity;
    this.active.push(p);
    return p;
  }

  flash(x, y, z, power = 1) {
    const entry = this.lights[this.lightCursor = (this.lightCursor + 1) % this.lights.length];
    entry.light.position.set(x, y, z);
    entry.light.intensity = 8 * power;
    entry.light.distance = 700 * power;
    entry.life = 0.12;
  }

  /**
   * A round in the water: the column, the collar and the swell running out.
   *
   * The mesh work is in splash.js. What is left here is the mist -- the torn
   * top of the column, which is the one part of a splash that genuinely is a
   * cloud and so is the one part a billboard tells the truth about.
   */
  splash(x, z, caliber = 152) {
    this.splashes.splash(x, z, caliber);
    const { height, radius } = splashSize(caliber);
    const n = Math.max(2, Math.round(5 * this.intensity));
    for (let i = 0; i < n; i++) {
      // Thrown round the head and the shoulder of the mass, not stacked up its
      // middle: what feathers a splash is the spray coming off its edges.
      const t = 0.42 + (i / n) * 0.62;
      const a = Math.random() * Math.PI * 2;
      const out = radius * (0.5 + Math.random() * 0.85);
      this.spawn({
        x: x + Math.sin(a) * out,
        y: height * t,
        z: z + Math.cos(a) * out,
        vy: height * 0.24 * (1 - t * 0.5),
        vx: Math.sin(a) * radius * 0.9,
        vz: Math.cos(a) * radius * 0.9,
        size: radius * (1.5 + Math.random() * 1.3), grow: radius * 1.9,
        ttl: 1.5 + height * 0.024 + Math.random() * 0.5,
        color: 0xe8f2fc, opacity: 0.42, drag: 0.8,
      });
    }
  }

  hit(x, y, z, kind, caliber = 152) {
    const big = kind === 'citadel' ? 2.4 : kind === 'pen' ? 1.3 : 0.8;
    this.flash(x, y + 6, z, big);
    this.spawn({ x, y: y + 4, z, size: 16 * big, grow: 34 * big, ttl: 0.35, glow: true, color: 0xffd08a, opacity: 1 });
    const puffs = Math.max(1, Math.round(3 * big * this.intensity));
    for (let i = 0; i < puffs; i++) {
      this.spawn({
        x, y: y + 4 + i * 3, z,
        vx: (Math.random() - 0.5) * 12, vy: 5 + Math.random() * 8, vz: (Math.random() - 0.5) * 12,
        size: 12 * big, grow: 18, ttl: 1.6 + Math.random(),
        color: kind === 'shatter' || kind === 'ricochet' ? 0xcfd8e0 : 0x53565a, opacity: 0.7,
      });
    }
  }

  explosion(x, y, z, scale = 1) {
    this.flash(x, y + 10, z, 3 * scale);
    this.spawn({ x, y: y + 8, z, size: 40 * scale, grow: 90 * scale, ttl: 0.5, glow: true, color: 0xffc266, opacity: 1 });
    for (let i = 0; i < Math.round(8 * this.intensity); i++) {
      this.spawn({
        x, y: y + 6, z,
        vx: (Math.random() - 0.5) * 30, vy: 8 + Math.random() * 22, vz: (Math.random() - 0.5) * 30,
        size: 22 * scale, grow: 30, ttl: 2.4 + Math.random() * 2,
        color: 0x3c4046, opacity: 0.8,
      });
    }
  }

  muzzle(x, y, z, bearing, caliber = 152) {
    const scale = 0.5 + caliber / 250;
    this.flash(x, y + 4, z, scale);
    this.spawn({
      x: x + Math.sin(bearing) * 10, y: y + 3, z: z + Math.cos(bearing) * 10,
      size: 10 * scale, grow: 26 * scale, ttl: 0.22, glow: true, color: 0xffdca0, opacity: 1,
    });
    this.spawn({
      x: x + Math.sin(bearing) * 16, y: y + 4, z: z + Math.cos(bearing) * 16,
      vx: Math.sin(bearing) * 24, vz: Math.cos(bearing) * 24, vy: 4,
      size: 12 * scale, grow: 22, ttl: 2.2, color: 0x9aa2aa, opacity: 0.5,
    });
  }

  fire(x, y, z) {
    this.spawn({
      x: x + (Math.random() - 0.5) * 8, y: y + 4, z: z + (Math.random() - 0.5) * 8,
      vy: 9 + Math.random() * 5, size: 9, grow: 12, ttl: 1.1, glow: true,
      color: 0xff8a2a, opacity: 0.95,
    });
    this.spawn({
      x, y: y + 10, z, vy: 12, vx: (Math.random() - 0.5) * 6,
      size: 14, grow: 26, ttl: 3, color: 0x24272b, opacity: 0.55,
    });
  }

  funnelSmoke(x, y, z, load) {
    this.spawn({
      x, y, z, vy: 5 + load * 5, vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3,
      size: 7, grow: 16, ttl: 3.2, color: 0x2f343a, opacity: 0.22 + load * 0.2,
    });
  }

  smokeScreen(x, z) {
    for (let i = 0; i < 3; i++) {
      this.spawn({
        x: x + (Math.random() - 0.5) * 120, y: 6 + Math.random() * 14, z: z + (Math.random() - 0.5) * 120,
        vy: 1.2, size: 70, grow: 26, ttl: 22, color: 0xdfe6ec, opacity: 0.5, drag: 0.2,
      });
    }
  }

  update(dt) {
    this.splashes.update(dt);
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life += dt;
      const k = p.life / p.ttl;
      if (k >= 1) {
        p.sprite.visible = false;
        this.pool.push(p.sprite);
        this.active.splice(i, 1);
        continue;
      }
      const drag = Math.pow(1 - p.drag, dt);
      p.vx *= drag; p.vz *= drag;
      p.vy = p.vy * drag - 6 * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y = Math.max(0.5, p.sprite.position.y + p.vy * dt);
      p.sprite.position.z += p.vz * dt;
      p.sprite.scale.setScalar(p.size + p.grow * p.life);
      p.sprite.material.opacity = p.opacity0 * (1 - k * k);
    }
    for (const l of this.lights) {
      if (l.life > 0) {
        l.life -= dt;
        l.light.intensity *= Math.pow(0.02, dt);
        if (l.life <= 0) l.light.intensity = 0;
      }
    }
  }
}
