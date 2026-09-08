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

/**
 * A puff with lumps in it.
 *
 * Smoke and fireballs are not soft round blobs, and a hundred soft round blobs
 * do not add up to one either -- they add up to fog, which is what every
 * explosion in this game used to look like. What a burning ship and a
 * detonating magazine have in common is the cauliflower: a mass of rounded
 * lobes, each one lit on the side the fire is on and dark on the other, packed
 * together with hard edges between them.
 *
 * So the sprite carries the lobes rather than the drift. One texture, drawn
 * once: a dozen overlapping circles inside the disc, each with its own soft
 * falloff, the whole thing masked back to a circle so it still fades at the
 * rim instead of ending on a square edge.
 */
function billowTexture(inner = 'rgba(255,255,255,0.95)') {
  const size = 128;
  const half = size / 2;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  // A deterministic scatter, so every client draws the same smoke.
  let seed = 20240617;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const lobe = (cx, cy, r, a) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, inner.replace(/[\d.]+\)$/, `${a})`));
    g.addColorStop(0.55, inner.replace(/[\d.]+\)$/, `${a * 0.72})`));
    g.addColorStop(1, inner.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  lobe(half, half, half * 0.9, 0.55);
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * half * 0.46;
    lobe(half + Math.cos(a) * d, half + Math.sin(a) * d,
      half * (0.2 + rnd() * 0.28), 0.4 + rnd() * 0.45);
  }
  // Back to a disc: a square-edged puff reads as a card, and a hundred cards
  // read as a wall.
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createRadialGradient(half, half, half * 0.42, half, half, half);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// Room for a magazine going up over a burning sea. A detonation alone puts a
// hundred and sixty lumps of fire into the air, and it has to do it without
// stealing every puff of smoke off the ships already alight.
/**
 * What the air does to one puff in one tick.
 *
 * Pulled out on its own because it is the whole difference between a column
 * and a mushroom, and it is worth being able to check without a renderer.
 *
 * Everything used to fall. That is right for a lump of burning debris and
 * wrong for smoke: hot smoke is lighter than the air it is in and it goes on
 * climbing for as long as it stays hot, which is most of a minute. Pulled down
 * by gravity instead, a burning ship had a grey mushroom sitting on her
 * funnel rather than a column standing a thousand feet over her.
 */
export function drift(p, dt) {
  const drag = Math.pow(1 - p.drag, dt);
  p.vx *= drag;
  p.vz *= drag;
  p.vy = p.vy * drag + p.lift * dt;
  return p;
}

const POOL_SIZE = 900;

export class Effects {
  constructor(scene, intensity = 1) {
    this.scene = scene;
    this.intensity = intensity;
    this.puffTex = softTexture('rgba(255,255,255,0.9)');
    this.glowTex = softTexture('rgba(255,236,190,1)');
    // The lumpy ones, for anything that is meant to boil rather than drift.
    this.billowTex = billowTexture('rgba(255,255,255,0.95)');
    this.emberTex = billowTexture('rgba(255,240,205,1)');

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
      // What the air does to it: -6 for anything with weight, positive for
      // smoke, which is buoyant for as long as it is hot.
      lift: opts.lift ?? -6,
    };
    s.position.set(opts.x, opts.y, opts.z);
    s.scale.setScalar(p.size);
    s.material.map = opts.billow
      ? (opts.glow ? this.emberTex : this.billowTex)
      : (opts.glow ? this.glowTex : this.puffTex);
    s.material.blending = opts.glow ? THREE.AdditiveBlending : THREE.NormalBlending;
    // Every puff hangs at its own angle and turns as it rises. Sprites all
    // sharing one rotation is the tell that a cloud is a handful of copies of
    // one picture, and it is the first thing the eye picks up.
    s.material.rotation = opts.spin0 ?? Math.random() * Math.PI * 2;
    p.spin = opts.spin ?? (Math.random() - 0.5) * 0.5;
    s.material.color.set(opts.color ?? 0xffffff);
    s.material.opacity = opts.opacity ?? 0.85;
    p.opacity0 = s.material.opacity;
    // A colour to cool towards, if it is something burning rather than
    // something drifting.
    if (opts.cool != null) {
      p.cool = true;
      const a = s.material.color;
      p.r0 = a.r; p.g0 = a.g; p.b0 = a.b;
      const b = new THREE.Color(opts.cool);
      p.r1 = b.r; p.g1 = b.g; p.b1 = b.b;
    }
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
   * An aeroplane coming apart: the pieces thrown out of it.
   *
   * Not smoke -- smoke billows and stands still, and this is the opposite of
   * that. These are small, hard, fast things going outwards and then falling,
   * with a little burning trash among them, and they are what tells you an
   * aeroplane blew up rather than that something caught fire near you.
   */
  debris(x, y, z, n = 10, scale = 1) {
    const count = Math.round(n * this.intensity);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 6 + Math.random() * 26;
      const out = 16 + Math.random() * 46;
      const hot = i % 4 === 0;
      this.spawn({
        x, y, z,
        vx: Math.cos(a) * out, vy: up, vz: Math.sin(a) * out,
        // Small and staying small: a piece of aeroplane does not billow.
        size: (1.6 + Math.random() * 2.6) * scale, grow: 0.6, ttl: 2.6 + Math.random() * 2.4,
        drag: 0.16,
        glow: hot,
        color: hot ? 0xffb057 : 0x2b2f34,
        opacity: hot ? 0.95 : 0.85,
      });
    }
    // And the smoke it all came out of.
    for (let i = 0; i < Math.round(4 * this.intensity); i++) {
      this.spawn({
        x, y, z,
        vx: (Math.random() - 0.5) * 16, vy: 2 + Math.random() * 8, vz: (Math.random() - 0.5) * 16,
        size: 9 * scale, grow: 16, ttl: 2.6 + Math.random() * 2,
        color: 0x33383e, opacity: 0.75,
      });
    }
  }

  /**
   * The smoke out of a burning aeroplane on her way down.
   *
   * One puff, laid where she is now: strung together as she falls it is the
   * trail, and the trail is the thing you actually see from a mile off.
   */
  wreckSmoke(x, y, z, fire = 1) {
    this.spawn({
      x, y, z,
      vx: (Math.random() - 0.5) * 5, vy: 1 + Math.random() * 3, vz: (Math.random() - 0.5) * 5,
      size: 5, grow: 13, ttl: 5 + Math.random() * 3.5,
      drag: 0.3, lift: 1.6, billow: true, color: 0x22252a, opacity: 0.7,
    });
    if (fire > 0 && Math.random() < 0.5) {
      this.spawn({
        x, y, z, size: 4.5, grow: 2, ttl: 0.4, glow: true,
        color: 0xffa042, opacity: 0.9, drag: 0.7,
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

  /**
   * Something burning aboard a ship.
   *
   * `heat` is how hard, 0 to 1, and it changes what a fire looks like rather
   * than only how much of it there is. A small one is a yellow flicker with a
   * thread of grey over it. A big one has a bright core with dark red rolling
   * out of the top of it, embers going up on the draught, and a column of
   * black that leans away and spreads -- which is what you actually see from
   * ten miles off, long before you can see the ship.
   */
  fire(x, y, z, heat = 0.5) {
    // A ship on fire is a black column, not an orange glow.
    //
    // What you see of a fuel fire from any distance at all is the smoke: an
    // oily, near-black, boiling column that leaves the flame in a narrow neck
    // and doubles its width every few seconds as it climbs, lit from below and
    // black everywhere else. The flame itself is small, low, and almost all of
    // it is at the bottom -- and it is where the light comes from.
    const h = Math.max(0.12, Math.min(1, heat));
    // The seat of it: bright, low, and short-lived, sitting in the fuel.
    this.spawn({
      x: x + (Math.random() - 0.5) * 5 * h, y: y + 1.5,
      z: z + (Math.random() - 0.5) * 5 * h,
      vy: 6 + Math.random() * 5 * h, size: 3.5 + 6 * h, grow: 7 + 8 * h,
      ttl: 0.6 + 0.4 * h, glow: true, billow: true,
      color: h > 0.6 ? 0xfff2c8 : 0xffc061, cool: 0xd8451c, opacity: 0.95,
    });
    // Flame rolling off the top of the seat, where the colour is.
    this.spawn({
      x: x + (Math.random() - 0.5) * 7 * h, y: y + 5 + 4 * h,
      z: z + (Math.random() - 0.5) * 7 * h,
      vy: 9 + 7 * h, vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3,
      size: 6 + 8 * h, grow: 13 + 12 * h, ttl: 0.9 + 0.7 * h,
      glow: true, billow: true,
      color: 0xff7a24, cool: 0x2a1a12, opacity: 0.55 + 0.3 * h,
    });
    // Embers, on the draught the fire makes itself.
    if (Math.random() < h) {
      this.spawn({
        x: x + (Math.random() - 0.5) * 10, y: y + 8,
        z: z + (Math.random() - 0.5) * 10,
        vy: 16 + Math.random() * 18, vx: (Math.random() - 0.5) * 9,
        vz: (Math.random() - 0.5) * 9,
        size: 1.1, grow: 0.4, ttl: 1.4 + Math.random(), glow: true,
        color: 0xffbe5e, cool: 0x30231a, opacity: 0.9,
      });
    }
    // And the column. Two puffs a call rather than one, started narrow right
    // over the flame and given a long life and a lot of growth, so what builds
    // up over a burning ship is a tall boiling stack rather than a haze that
    // has blown away by the time the next one is spawned.
    for (let i = 0; i < 2; i++) {
      const up = i * 0.5 + Math.random() * 0.5;
      this.spawn({
        x: x + (Math.random() - 0.5) * (3 + up * 10) * h,
        y: y + 8 + up * 22 * h,
        z: z + (Math.random() - 0.5) * (3 + up * 10) * h,
        vy: 11 + 9 * h, vx: (Math.random() - 0.5) * 4, vz: (Math.random() - 0.5) * 4,
        size: (5 + 7 * h) * (1 + up), grow: 13 + 22 * h,
        ttl: 11 + 13 * h, drag: 0.1, billow: true, lift: 1.6 + 2.2 * h,
        // Oily black over a bad fire, grey over a small one; and it darkens
        // further as it rises and cools, which is why the top of a column is
        // blacker than the bottom.
        color: h > 0.5 ? 0x17181a : 0x3c4247,
        cool: h > 0.5 ? 0x0a0b0c : 0x23272b,
        opacity: 0.55 + 0.4 * h,
      });
    }
  }

  funnelSmoke(x, y, z, load) {
    this.spawn({
      x, y, z, vy: 5 + load * 5, vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3,
      size: 7, grow: 16, ttl: 3.2, color: 0x2f343a, opacity: 0.22 + load * 0.2,
    });
  }

  /**
   * A magazine going up.
   *
   * Not a bigger explosion. What everybody who ever saw one describes is the
   * column: a mile of black smoke standing over the place where the ship was,
   * going up far faster than smoke has any business going and hanging there
   * long after the noise has gone. So that is what this is -- the flash at the
   * bottom is almost incidental, and it is over in a second.
   */
  magazine(x, y, z, scale = 1) {
    // Not a bigger explosion. What everybody who has seen one describes is the
    // shape: a wall of fire that boils outwards faster than it climbs, made of
    // hundreds of separate rounded lobes each lit from inside, white in the
    // middle and going orange and then black at the edges -- and the whole of
    // it throwing burning wreckage out on long flat trails that outrun it.
    //
    // So it is built as a boiling mass rather than a puff: a fireball of
    // lobes thrown out on a sphere, the ones low down held down by the sea so
    // it spreads along the water the way it really does, the streaks laid over
    // it, and the column going up out of the middle afterwards.
    const s = scale;
    this.flash(x, y + 14 * s, z, 6 * s);
    // The fireball. Thrown outwards on a sphere flattened by the sea, because
    // the water will not let it expand downwards and it goes sideways instead.
    const N = Math.round(96 * Math.min(1.4, this.intensity));
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      // Squashed: mostly out, a little up.
      const out = 26 + Math.random() * 74;
      const rise = up * up * 46;
      const heat = 1 - Math.min(1, (out / 100) * 0.7 + Math.random() * 0.3);
      this.spawn({
        x: x + Math.cos(a) * out * 0.5 * s,
        y: y + 4 + rise * 0.5 * s,
        z: z + Math.sin(a) * out * 0.5 * s,
        vx: Math.cos(a) * (18 + Math.random() * 30) * s,
        vy: 5 + rise * 0.5 + Math.random() * 12,
        vz: Math.sin(a) * (18 + Math.random() * 30) * s,
        size: (13 + Math.random() * 17) * s,
        grow: (22 + Math.random() * 28) * s,
        ttl: 1.5 + Math.random() * 2.4,
        billow: true, glow: true, drag: 0.5, lift: -2,
        // White-hot in the middle of it, orange at the edge, and every one of
        // them cooling to soot as it goes.
        color: heat > 0.62 ? 0xfff6e2 : heat > 0.3 ? 0xffc069 : 0xff7a22,
        cool: 0x241d18, opacity: 0.72,
      });
    }
    // The burning wreckage going out on flat trails, which is what gives the
    // thing its size: they leave the fireball behind and are still going.
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const flat = 0.25 + Math.random() * 0.9;
      this.spawn({
        x, y: y + 6 * s, z,
        vx: Math.cos(a) * (120 + Math.random() * 190) * s,
        vy: (40 + Math.random() * 130) * flat,
        vz: Math.sin(a) * (120 + Math.random() * 190) * s,
        size: 4 * s, grow: 5 * s, ttl: 2.4 + Math.random() * 2.2,
        glow: true, drag: 0.06, color: 0xffd07a, cool: 0x3a2a1e, opacity: 1,
      });
    }
    // And the column, standing over the place afterwards. It goes up out of
    // the middle of the fireball and keeps going long after the fire is out,
    // which is the part you see from the other end of the map.
    for (let i = 0; i < 34; i++) {
      const up = i / 34;
      this.spawn({
        x: x + (Math.random() - 0.5) * (30 + up * 90) * s,
        y: y + 10 + up * 230 * s,
        z: z + (Math.random() - 0.5) * (30 + up * 90) * s,
        vy: 20 + (1 - up) * 30, vx: (Math.random() - 0.5) * 10,
        vz: (Math.random() - 0.5) * 10,
        size: (30 + up * 54) * s, grow: 34 * s,
        ttl: 22 + up * 18, drag: 0.12, billow: true, lift: 3.4,
        color: up < 0.3 ? 0x151312 : 0x2c2724,
        opacity: 0.9 - up * 0.25,
      });
    }
    // Smoke lying on the water round her, from everything that came down.
    for (let i = 0; i < 10; i++) {
      this.spawn({
        x: x + (Math.random() - 0.5) * 180 * s, y: 5 + Math.random() * 18,
        z: z + (Math.random() - 0.5) * 180 * s,
        vy: 3, size: 46 * s, grow: 34, ttl: 22, drag: 0.25, billow: true, lift: 0.8,
        color: 0x231f1c, opacity: 0.62,
      });
    }
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
      drift(p, dt);
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y = Math.max(0.5, p.sprite.position.y + p.vy * dt);
      p.sprite.position.z += p.vz * dt;
      p.sprite.scale.setScalar(p.size + p.grow * p.life);
      p.sprite.material.rotation += p.spin * dt;
      // How it goes out. A puff of smoke thins evenly; a lump of burning fuel
      // is at its brightest immediately and cools through orange to black,
      // which is the whole difference between a fireball and a fog bank.
      if (p.cool) {
        const c = p.sprite.material.color;
        c.setRGB(
          p.r0 + (p.r1 - p.r0) * k,
          p.g0 + (p.g1 - p.g0) * k,
          p.b0 + (p.b1 - p.b0) * k,
        );
        p.sprite.material.opacity = p.opacity0 * Math.min(1, (1 - k) * 2.2);
      } else {
        p.sprite.material.opacity = p.opacity0 * (1 - k * k);
      }
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
