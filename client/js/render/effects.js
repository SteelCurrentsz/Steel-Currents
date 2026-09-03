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
      fade: opts.fade ?? 1,
      // Clamped: the drag term below is pow(1 - drag, dt), so a drag over 1
      // raises a negative base to a fractional power. That is NaN, and a
      // sprite with a NaN position is one that silently disappears.
      drag: Math.min(1, Math.max(0, opts.drag ?? 0.6)),
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

  /**
   * A gun going off: the flash, and then the smoke that stands there.
   *
   * The flash is over in a fifth of a second and is the part everybody draws.
   * The smoke is the part that makes it look like a gun: a bank of propellant
   * smoke thrown out along the bore, slowing almost at once because it has no
   * momentum of its own, and then hanging beside the ship for ten or fifteen
   * seconds while she steams out from under it. A heavy gun makes a great deal
   * of it and an Oerlikon makes almost none, so all of it scales off the bore.
   */
  muzzle(x, y, z, bearing, caliber = 152) {
    const scale = 0.5 + caliber / 250;
    const sn = Math.sin(bearing);
    const cs = Math.cos(bearing);
    this.flash(x, y + 4, z, scale);
    this.spawn({
      x: x + sn * 10, y: y + 3, z: z + cs * 10,
      size: 10 * scale, grow: 26 * scale, ttl: 0.22, glow: true, color: 0xffdca0, opacity: 1,
    });
    // The burning propellant, still alight for a moment out past the muzzle.
    this.spawn({
      x: x + sn * 20 * scale, y: y + 3.5, z: z + cs * 20 * scale,
      vx: sn * 40 * scale, vz: cs * 40 * scale, vy: 2,
      size: 7 * scale, grow: 20 * scale, ttl: 0.32, glow: true,
      color: 0xffb057, opacity: 0.9, drag: 0.97,
    });
    // And the bank of smoke: several puffs down the bore line, each thrown a
    // little further and each a little slower than the one before it, so what
    // stands there is a plume with a shape rather than one ball.
    const puffs = Math.max(2, Math.round((1 + caliber / 120) * this.intensity));
    for (let i = 0; i < puffs; i++) {
      const f = i / Math.max(1, puffs - 1);
      const out = (8 + f * 30) * scale;
      const spread = (1 - f) * 3 + f * 7;
      this.spawn({
        x: x + sn * out + (Math.random() - 0.5) * spread,
        y: y + 3 + f * 2.5 + (Math.random() - 0.5) * spread * 0.5,
        z: z + cs * out + (Math.random() - 0.5) * spread,
        vx: sn * (26 - f * 16) * scale + (Math.random() - 0.5) * 5,
        vz: cs * (26 - f * 16) * scale + (Math.random() - 0.5) * 5,
        vy: 2.2 + Math.random() * 2.5,
        size: (5 + f * 5) * scale, grow: (11 + f * 9) * scale,
        ttl: 5.5 + caliber * 0.028 + Math.random() * 3,
        color: i === 0 ? 0xc4bfb4 : 0xa4a49c,
        // Thin. A turret firing a full salvo lays down one of these per gun
        // and a four-turret broadside lays down four banks on top of each
        // other: at any real opacity that is a white wall with a ship
        // somewhere behind it.
        opacity: 0.26 - f * 0.07, drag: 0.93,
      });
    }
  }

  /**
   * A heavy anti-aircraft round bursting: the flash, and the black puff that
   * hangs there afterwards.
   *
   * This is what a miss looks like, and nearly all of them are misses. The
   * shell is fused for a time of flight and goes off wherever it happens to be
   * when the fuse runs out, which is why the sky over a ship under air attack
   * fills up with these whether or not anything is being hit.
   */
  flakBurst(x, y, z, caliber = 127) {
    const scale = 0.4 + caliber / 200;
    this.spawn({
      x, y, z, size: 4 * scale, grow: 13 * scale, ttl: 0.22,
      glow: true, color: 0xffd9a0, opacity: 1,
    });
    const n = Math.max(1, Math.round(2 * this.intensity));
    for (let i = 0; i < n; i++) {
      this.spawn({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 5,
        z: z + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 7, vy: 1 + Math.random() * 2,
        vz: (Math.random() - 0.5) * 7,
        size: 5.5 * scale, grow: 12 * scale,
        ttl: 3.6 + Math.random() * 2.4,
        // Black. American and British heavy flak burst black; it is the one
        // thing every gun-camera film of an attack has in it.
        color: 0x2b2c2e, opacity: 0.62, drag: 0.9,
      });
    }
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
