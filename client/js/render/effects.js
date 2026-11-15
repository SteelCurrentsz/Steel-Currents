// Pooled effects: shell splashes, explosions, fires, funnel smoke and smoke
// screens. The puffs are drawn as one instanced batch (see puffs.js). A gun's
// flash and smoke are handed on to muzzleblast.js.

import * as THREE from '../../../vendor/three.module.js';
import { Splashes } from './splash.js';
import { MuzzleBlasts, blastSize } from './muzzleblast.js';
import { SmokeTrails } from './trails.js';
import { Shards } from './shards.js';
import { PuffBatches } from './puffs.js';

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
const TMP_COLOR = new THREE.Color();
const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const MUZZLE_DIR = new THREE.Vector3();

export class Effects {
  constructor(scene, intensity = 1) {
    this.scene = scene;
    this.intensity = intensity;
    this.puffTex = softTexture('rgba(255,255,255,0.9)');
    this.glowTex = softTexture('rgba(255,236,190,1)');
    // The lumpy ones, for anything that is meant to boil rather than drift.
    this.billowTex = billowTexture('rgba(255,255,255,0.95)');
    this.emberTex = billowTexture('rgba(255,240,205,1)');

    // The puffs themselves: as many as there ever were room for, drawn in
    // one draw call however many are up (see puffs.js).
    this.puffs = new PuffBatches(scene, POOL_SIZE, {
      puff: this.puffTex, glow: this.glowTex, billow: this.billowTex, ember: this.emberTex,
    });
    this.active = [];

    // The water a round throws up is meshes, not sprites -- see splash.js.
    this.splashes = new Splashes(scene, intensity);
    // And what a gun leaves in the air is its own thing too -- see
    // muzzleblast.js.
    this.blasts = new MuzzleBlasts(scene, { intensity });
    // The fire and smoke burning pieces trail on the way down. See trails.js.
    this.trails = new SmokeTrails(scene, Math.round(6000 + 6000 * Math.min(1.7, intensity)));
    // What goes on in the air round an aeroplane: the smoke and the fire off
    // one that is hit, the black of a heavy shell bursting, and what is left of
    // one that blows up. Its own pool, because a sky full of flak and burning
    // aeroplanes would otherwise eat every trail the wreckage on the sea has --
    // and drawn bigger close to, because it is looked at from a cockpit.
    this.air = new SmokeTrails(scene, Math.round(9000 + 9000 * Math.min(1.6, intensity)),
      { maxPx: 480 });
    // And the scraps one blown apart throws. See shards.js.
    this.shards = new Shards(scene, Math.round(1500 + 1500 * Math.min(1.6, intensity)));
    // The fireballs, lent by the scene once it has them (see ExplosionSystem):
    // the same boiling heads of fire and soot a hit inside a ship is drawn
    // with, rather than a glowing disc.
    this.bursts = null;

    this.lights = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffbb66, 0, 900, 2);
      scene.add(l);
      this.lights.push({ light: l, life: 0 });
    }
    this.lightCursor = 0;
  }

  spawn(opts) {
    // No more at once than the pool ever held.
    if (this.active.length >= POOL_SIZE) return null;
    const color = TMP_COLOR.set(opts.color ?? 0xffffff);
    const p = {
      life: 0, ttl: opts.ttl ?? 1.2,
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
    p.x = opts.x; p.y = opts.y; p.z = opts.z;
    p.scale = p.size;
    // Which of the four pictures it is: the soft one or the lumpy one, and
    // lit (added to the scene) or not (laid over it).
    p.glow = !!opts.glow;
    p.which = opts.billow ? 1 : 0;
    // Every puff hangs at its own angle and turns as it rises. Sprites all
    // sharing one rotation is the tell that a cloud is a handful of copies of
    // one picture, and it is the first thing the eye picks up.
    p.rotation = opts.spin0 ?? Math.random() * Math.PI * 2;
    p.spin = opts.spin ?? (Math.random() - 0.5) * 0.5;
    p.r = color.r; p.g = color.g; p.b = color.b;
    p.opacity = opts.opacity ?? 0.85;
    p.opacity0 = p.opacity;
    // A colour to cool towards, if it is something burning rather than
    // something drifting.
    if (opts.cool != null) {
      p.cool = true;
      p.r0 = p.r; p.g0 = p.g; p.b0 = p.b;
      const b = TMP_COLOR.set(opts.cool);
      p.r1 = b.r; p.g1 = b.g; p.b1 = b.b;
    }
    this.active.push(p);
    return p;
  }

  /** The next of the flash lights to use, passing over any lent out. */
  nextLight() {
    const n = this.lights.length;
    for (let i = 0; i < n; i++) {
      const entry = this.lights[this.lightCursor = (this.lightCursor + 1) % n];
      if (!entry.held) return entry;
    }
    return this.spare || (this.spare = { light: new THREE.PointLight(), life: 0 });
  }

  /**
   * One of the flash lights, lent to something that wants a light of its own
   * for a while -- an atomic burst -- and given back with releaseLight. A
   * light brought into the scene or taken out of it recompiles every lit
   * material in it; one lent like this is already there.
   */
  holdLight() {
    const entry = this.lights.find((l) => !l.held);
    if (!entry) return null;
    entry.held = true;
    entry.life = 0;
    return entry.light;
  }

  releaseLight(light) {
    const entry = this.lights.find((l) => l.light === light);
    if (!entry) return;
    entry.held = false;
    entry.life = 0;
    light.intensity = 0;
    light.distance = 900;
  }

  flash(x, y, z, power = 1) {
    const entry = this.nextLight();
    entry.light.position.set(x, y, z);
    entry.light.color.setHex(0xffbb66);
    entry.light.intensity = 8 * power;
    entry.light.distance = 700 * power;
    entry.life = 0.12;
    entry.fade = 0.02;
  }

  /**
   * The light of a gun going off, thrown over the turret, the deck, the sea
   * and the smoke round it: as bright as the sun for the instant the gas is
   * alight, and gone again in a few hundredths of a second. The light falls
   * off with the square of the distance, so it is the size of the charge
   * squared that says how far it reaches.
   */
  gunFlash(x, y, z, caliber) {
    const entry = this.nextLight();
    const k = 0.5 + caliber / 250;
    entry.light.position.set(x, y, z);
    entry.light.color.setHex(0xffa452);
    entry.light.intensity = 170 * k * k;
    entry.light.distance = 90 + 160 * k;
    entry.life = 0.14;
    entry.fade = 1e-12;
  }

  /**
   * A round in the water: the column, the collar and the swell running out.
   *
   * The mesh work is in splash.js. What is left here is the mist -- the torn
   * top of the column, which is the one part of a splash that genuinely is a
   * cloud and so is the one part a billboard tells the truth about.
   */
  splash(x, z, caliber = 152, opts = {}) {
    // All of it is water now, in splash.js -- surge, stem and the head the
    // stem breaks into. No sprite mist over it: a billboard puff over a
    // column of water reads as smoke.
    this.splashes.splash(x, z, caliber, opts);
    // Whoever is watching may be close enough to wear some of it.
    if (this.onSplash && !opts.child) this.onSplash(x, z, caliber, opts);
  }

  /** An aircraft's round into the sea. See Splashes.spout. */
  spout(x, z, caliber = 12.7) { this.splashes.spout(x, z, caliber); }

  /** Something of an aeroplane dragging through the sea. See Splashes.skim. */
  skim(x, z, vx, vz, depth, dt) { this.splashes.skim(x, z, vx, vz, depth, dt); }

  hit(x, y, z, kind, caliber = 152) {
    if (kind === 'air') { this.strike(x, y, z, caliber); return; }
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

  /**
   * Something going up: a fireball, the soot it turns into, and what it throws.
   *
   * `vel` is how fast whatever blew up was going, when it was going anywhere:
   * an aeroplane at two hundred knots does not stop when her tanks go, and
   * neither does the fire. It is carried on down her track for a hundred
   * yards, smearing out as it slows, which is the shape every gun-camera film
   * of one going up has in it.
   */
  explosion(x, y, z, scale = 1, vel = null) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    this.flash(x, y + 10, z, 3 * scale);
    const k = Math.min(1.5, this.intensity);
    const vx = vel?.x || 0, vy = vel?.y || 0, vz = vel?.z || 0;
    // The ball, from the scene's blasts.
    if (this.bursts) {
      this.bursts.blast(x, y + 2 * scale, z, {
        size: 4 + 6 * scale,
        duration: 0.55 + 0.35 * scale,
        debris: Math.round((6 + 8 * scale) * k),
        light: false, plume: false, ring: false, linger: 2.2,
        power: Math.min(1, scale / 2),
      });
      // And two more, off to the side of it and a beat behind. One ball,
      // however it boils, is still a ball; a real blast is a cluster of heads
      // going off one after another, and the lopsided outline that gives it
      // is what keeps it from reading as a drawn circle.
      for (let i = 0; i < 2; i++) {
        const d = this.sphere(0.35);
        const off = (2.5 + Math.random() * 3) * scale;
        const bx = x + d.x * off + vx * 0.08, by = y + 2 * scale + Math.abs(d.y) * off, bz = z + d.z * off + vz * 0.08;
        this.later(0.04 + Math.random() * 0.1, () => this.bursts?.blast(bx, by, bz, {
          size: (2.4 + 3.6 * scale) * (0.6 + Math.random() * 0.25),
          duration: 0.45 + 0.3 * scale,
          debris: 0, light: false, plume: false, ring: false, linger: 2.2,
          power: Math.min(1, scale / 3),
        }));
      }
    }
    // Heads of burning fuel, each going out to soot as it climbs and slows:
    // the flash is light, but what stands there afterwards is burning gas
    // turning into smoke.
    const heads = Math.round(9 * k);
    for (let i = 0; i < heads; i++) {
      const d = this.sphere(0.55);
      const sp = (5 + Math.random() * 13) * Math.sqrt(scale);
      this.air.puff(
        x + d.x * 2 * scale, y + 3 * scale + d.y * 2 * scale, z + d.z * 2 * scale,
        d.x * sp + vx * 0.45, Math.abs(d.y) * sp * 0.8 + vy * 0.3 + 2, d.z * sp + vz * 0.45, {
          life: 2.2 + Math.random() * 1.6,
          size: (3 + Math.random() * 3) * scale, grow: (4.5 + Math.random() * 3) * scale,
          burn: 0.28 + Math.random() * 0.14, tone: 0.06 + Math.random() * 0.08,
        });
    }
    // And the smoke that hangs where it was, black, boiling out slowly.
    const smoke = Math.round(8 * k);
    for (let i = 0; i < smoke; i++) {
      const d = this.sphere(0.4);
      const sp = (2 + Math.random() * 6) * Math.sqrt(scale);
      this.air.puff(
        x + d.x * 4 * scale, y + 4 * scale + d.y * 3 * scale, z + d.z * 4 * scale,
        d.x * sp + vx * 0.2, d.y * sp + 2, d.z * sp + vz * 0.2, {
          delay: 0.15 + Math.random() * 0.35,
          life: 6 + Math.random() * 4,
          size: (5 + Math.random() * 3) * scale, grow: (6 + Math.random() * 4) * scale,
          burn: 0.02, tone: 0.07 + Math.random() * 0.1,
        });
    }
    // A few burning pieces thrown out of it on trails: a few, because a
    // dozen of them is a firework rather than an aeroplane.
    for (let i = 0; i < Math.round(3 * k); i++) {
      const a = Math.random() * Math.PI * 2, up = 0.2 + Math.random() * 0.5;
      const v = (25 + Math.random() * 30) * Math.sqrt(scale);
      this.trails.arc(x, y + 6, z, Math.cos(a) * v * (1 - up * 0.5) + vx * 0.5, v * up * 1.3,
        Math.sin(a) * v * (1 - up * 0.5) + vz * 0.5, {
          flight: 2 + Math.random() * 2, floor: 0.5, spacing: 0.03, limit: 40,
          size: 1.4 * scale, grow: 2.4 * scale, life: 2.4 + Math.random() * 1.5,
          burnFor: 0.6 + Math.random() * 1.2, tone: 0.25 + Math.random() * 0.4,
        });
    }
  }

  /**
   * An aeroplane flown into something: a ship's side, a deck, a hillside.
   *
   * Not explosion() made bigger. What every film of a kamikaze hit shows is
   * that it has a direction. The machine is doing two hundred knots and so is
   * everything in her tanks: the fuel goes on down her track as a sheet of
   * flame that rolls along the deck and over the side, the fireball is a
   * smear rather than a ball, the wreckage sprays forward in a fan, and what
   * stands over the place a second later is the thick black smoke of burning
   * petrol, not a grey puff. If she was still carrying her bomb, a hard white
   * flash and a real detonation come up out of the middle of all that.
   *
   * `heading` is the way she was flying (radians, the sim's convention),
   * `speed` how fast, `armed` whether her bomb or fish went with her.
   */
  impact(x, y, z, { heading = null, speed = 110, armed = false, scale = 1, dive = 0.35 } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    const s = scale;
    const k = Math.min(1.5, this.intensity);
    const h = Number.isFinite(heading) ? heading : Math.random() * Math.PI * 2;
    // Her track, and the two directions across it.
    const fx = Math.sin(h), fz = Math.cos(h);
    const sx = fz, sz = -fx;
    const v = clampN(speed || 110, 50, 260);
    const run = v / 110;
    const floor = this.groundAt ? Math.max(0, this.groundAt(x, z)) : 0;

    this.flash(x, y + 3, z, (armed ? 4.5 : 2.6) * s);

    // The first of it: where she struck, small and hot.
    if (this.bursts) {
      this.bursts.blast(x, y + 1, z, {
        size: (armed ? 11 : 9) * s, duration: armed ? 1.3 : 1.1,
        debris: Math.round((armed ? 26 : 14) * k),
        light: false, plume: false, ring: false, linger: 2.6, power: armed ? 0.55 : 0.2,
      });
    }

    // The fuel, carried on down her track: a run of fireballs, each a little
    // further on, a little later and a little lower, so the whole thing reads
    // as one sheet of flame rolling along the deck and spilling off it.
    const heads = armed ? 4 : 3;
    for (let i = 1; i <= heads; i++) {
      const f = i / heads;
      const d = (7 + 26 * f) * run * s * (0.8 + Math.random() * 0.4);
      const off = (Math.random() - 0.5) * 9 * s;
      const bx = x + fx * d + sx * off, bz = z + fz * d + sz * off;
      const by = Math.max(floor + 1, y - dive * d * 0.5) + Math.random() * 2;
      this.later(0.035 + f * 0.13 + Math.random() * 0.04, () => {
        if (!this.bursts) return;
        this.bursts.blast(bx, by, bz, {
          size: (armed ? 9 : 7.5) * s * (1.05 - f * 0.4) * (0.85 + Math.random() * 0.3),
          duration: 0.95 + Math.random() * 0.35,
          debris: Math.round(5 * k), light: false, plume: false, ring: false,
          linger: 2.4, power: 0.15,
        });
      });
    }

    // Burning petrol thrown on ahead of her: lumps of fire flung down her
    // track and spread across it, each cooling through orange to soot as it
    // slows. These are what turn the fireballs into a smear.
    const sheet = Math.round((armed ? 34 : 26) * k);
    for (let i = 0; i < sheet; i++) {
      const fwd = (0.25 + Math.random() * 0.75) * v * 0.32;
      const lat = (Math.random() - 0.5) * 2 * (6 + fwd * 0.45);
      const up = 2 + Math.random() * 9;
      const hot = Math.random();
      this.spawn({
        x: x + fx * Math.random() * 6 * s, y: y + 1 + Math.random() * 3, z: z + fz * Math.random() * 6 * s,
        vx: fx * fwd + sx * lat, vy: up, vz: fz * fwd + sz * lat,
        size: (3.5 + Math.random() * 4.5) * s, grow: (7 + Math.random() * 9) * s,
        ttl: 0.7 + Math.random() * 1.0, drag: 0.82, lift: 1.2,
        billow: true, glow: hot > 0.55,
        color: hot > 0.75 ? 0xffd28a : hot > 0.4 ? 0xf2862c : 0xb6461a,
        cool: hot > 0.55 ? 0x2a1408 : 0x16110d,
        opacity: hot > 0.55 ? 0.55 : 0.9,
      });
    }

    // The smoke of it: petrol burns black and thick, and it is what you see
    // of a hit from the next ship in the line -- a dark mass boiling up out
    // of the flame and leaning off down the track she came in on.
    const smoke = Math.round((armed ? 18 : 13) * k);
    for (let i = 0; i < smoke; i++) {
      const f = Math.random();
      const d = f * 30 * run * s;
      const lat = (Math.random() - 0.5) * 12 * s;
      this.air.puff(
        x + fx * d + sx * lat, y + 2 + Math.random() * 5 * s, z + fz * d + sz * lat,
        fx * v * 0.05 + (Math.random() - 0.5) * 4, 5 + Math.random() * 7, fz * v * 0.05 + (Math.random() - 0.5) * 4, {
          delay: 0.35 + f * 0.3 + Math.random() * 0.5,
          life: 7 + Math.random() * 6,
          size: (4.5 + Math.random() * 4) * s, grow: (8 + Math.random() * 6) * s,
          burn: Math.random() < 0.35 ? 0.12 + Math.random() * 0.1 : 0.02,
          tone: 0.02 + Math.random() * 0.06,
        });
    }
    // ...and standing over the place, climbing, after the flame is gone.
    for (let i = 0; i < Math.round(6 * k); i++) {
      const up = i / 6;
      this.later(0.7 + up * 0.8 + Math.random() * 0.3, () => this.spawn({
        x: x + fx * 8 * s + (Math.random() - 0.5) * 10 * s,
        y: y + 6 + up * 22 * s,
        z: z + fz * 8 * s + (Math.random() - 0.5) * 10 * s,
        vx: (Math.random() - 0.5) * 3, vy: 6 + Math.random() * 5, vz: (Math.random() - 0.5) * 3,
        size: (10 + up * 10) * s, grow: (9 + Math.random() * 5) * s,
        ttl: 9 + Math.random() * 6, drag: 0.3, billow: true, lift: 2.2,
        color: 0x161311, opacity: 0.82 - up * 0.2,
        spin: (Math.random() - 0.5) * 0.25,
      }));
    }

    // The wreckage: a fan thrown on ahead of her, low and fast, with a few
    // heavy pieces tumbling end over end and a scatter of sparks.
    const pieces = Math.round((armed ? 42 : 30) * this.intensity);
    for (let i = 0; i < pieces; i++) {
      const fwd = (0.25 + Math.random() * 0.85) * v * 0.45;
      const lat = (Math.random() - 0.5) * 2 * fwd * 0.55;
      const up = (0.05 + Math.pow(Math.random(), 1.6) * 0.55) * fwd + 3;
      this.shards.throw(x, y + 1, z,
        fx * fwd + sx * lat, up, fz * fwd + sz * lat, {
          life: 2.5 + Math.random() * 3.5,
          size: (0.3 + Math.pow(Math.random(), 2.4) * 1.5) * s,
          hot: i % 3 === 0 ? 1 : 0,
          floor,
        });
    }
    // Burning pieces on trails. Mostly forward, a couple thrown high.
    for (let i = 0; i < Math.round((armed ? 9 : 5) * k); i++) {
      const fwd = (0.2 + Math.random() * 0.6) * v * 0.35;
      const lat = (Math.random() - 0.5) * fwd * 1.1;
      const up = 8 + Math.random() * (armed ? 40 : 22);
      this.trails.arc(x, y + 2, z, fx * fwd + sx * lat, up, fz * fwd + sz * lat, {
        flight: 1.6 + Math.random() * 2.2, floor: floor + 0.5, spacing: 0.025, limit: 44,
        size: 1.2 * s, grow: 2.6 * s, life: 2.2 + Math.random() * 1.6,
        burnFor: 0.5 + Math.random() * 0.8, tone: 0.06 + Math.random() * 0.12,
      });
    }

    // What she was carrying. A hard white flash and a real detonation come up
    // through the fire a beat after she hits, with plating and a column of
    // smoke going up out of the ship.
    if (armed) {
      this.later(0.06, () => {
        this.flash(x, y + 8, z, 5 * s);
        if (this.bursts) {
          this.bursts.blast(x + fx * 4 * s, y + 3, z + fz * 4 * s, {
            size: 12 * s, duration: 1.7, debris: Math.round(46 * k),
            light: false, plume: true, ring: false, linger: 3, power: 0.75,
          });
        }
        for (let i = 0; i < Math.round(6 * k); i++) {
          const a = Math.random() * Math.PI * 2, up = 0.3 + Math.random() * 0.45;
          const sp = (35 + Math.random() * 45) * Math.sqrt(s);
          this.trails.arc(x, y + 5, z, Math.cos(a) * sp * (1 - up * 0.6), sp * up * 1.3,
            Math.sin(a) * sp * (1 - up * 0.6), {
              flight: 2 + Math.random() * 3, floor: floor + 0.5, spacing: 0.03, limit: 50,
              size: 1.8 * s, grow: 3.2 * s, life: 3 + Math.random() * 2,
              burnFor: 0.5 + Math.random() * 0.9, tone: 0.06 + Math.random() * 0.14,
            });
        }
      });
    }

    // Low enough to be in the water: she throws the sea up as well.
    if (y < floor + 4 && floor <= 0.5) this.splash(x + fx * 10, z + fz * 10, armed ? 380 : 240);
  }

  /** Something to set off a moment from now. See update. */
  later(t, fn) {
    (this.pending || (this.pending = [])).push({ t, fn });
  }

  /** A random direction, flattened towards the horizontal by `flat` (0..1). */
  sphere(flat = 0) {
    const a = Math.random() * Math.PI * 2;
    const y = (Math.random() * 2 - 1) * (1 - flat);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    return { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
  }

  /**
   * An aeroplane coming apart: the pieces thrown out of it.
   *
   * Not smoke -- smoke billows and stands still, and this is the opposite of
   * that. These are small, hard, fast things going outwards and then falling,
   * with a little burning trash among them, and they are what tells you an
   * aeroplane blew up rather than that something caught fire near you.
   */
  debris(x, y, z, n = 10, scale = 1, vel = null) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    const count = Math.round(n * this.intensity);
    // What it comes down on: the sea, or the ground where there is ground --
    // and a scrap that lands ashore lies there rather than going on through.
    const floor = this.groundAt ? Math.max(0, this.groundAt(x, z)) : 0;
    const vx = vel?.x || 0, vy = vel?.y || 0, vz = vel?.z || 0;
    for (let i = 0; i < count; i++) {
      const d = this.sphere(0.2);
      const out = 16 + Math.random() * 46;
      const hot = i % 4 === 0;
      // Torn scraps rather than dots: see shards.js. Three for every piece
      // there used to be, because most of an aeroplane is skin.
      for (let j = 0; j < 3; j++) {
        const sp = out * (0.5 + Math.random() * 0.7);
        const e = this.sphere(0.1);
        this.shards.throw(x, y, z,
          (d.x + e.x * 0.5) * sp + vx * 0.7,
          (Math.abs(d.y) + 0.25 + e.y * 0.4) * sp + vy * 0.5,
          (d.z + e.z * 0.5) * sp + vz * 0.7, {
            life: 3 + Math.random() * 3.5,
            size: (0.35 + Math.pow(Math.random(), 2) * 1.1) * scale,
            hot: hot && j === 0 ? 1 : 0,
            floor,
          });
      }
      // The burning ones leave a line of fire and then smoke behind them.
      if (hot) {
        this.trails.arc(x, y, z, d.x * out * 0.6 + vx * 0.4, (d.y * 0.5 + 0.2) * out * 0.5,
          d.z * out * 0.6 + vz * 0.4, {
            flight: 2, floor: 0.5, spacing: 0.03, limit: 30, gravity: 9.81,
            size: 1.1 * scale, grow: 2.2 * scale, life: 2.2 + Math.random() * 1.4,
            burnFor: hot ? 0.8 + Math.random() * 1.2 : 0, tone: 0.2 + Math.random() * 0.3,
          });
      }
    }
    // And the smoke it all came out of.
    for (let i = 0; i < Math.round(4 * this.intensity); i++) {
      const d = this.sphere(0.3);
      this.air.puff(x + d.x * 2, y + d.y * 2, z + d.z * 2,
        d.x * 8 + vx * 0.2, 2 + Math.random() * 5, d.z * 8 + vz * 0.2, {
          life: 4 + Math.random() * 3, size: 3.5 * scale, grow: 5 * scale,
          tone: 0.18 + Math.random() * 0.12,
        });
    }
  }

  /**
   * Sand and earth thrown up by something ploughing through it: a keel going
   * up a beach. Pale, low and slow -- it is dust, not smoke.
   */
  dust(x, y, z, size = 1) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    for (let i = 0; i < Math.max(1, Math.round(3 * this.intensity)); i++) {
      const d = this.sphere(0.5);
      this.air.puff(x + d.x * size * 3, y + Math.abs(d.y) * size, z + d.z * size * 3,
        d.x * 3 * size, 1 + Math.random() * 2.5 * size, d.z * 3 * size, {
          life: 3 + Math.random() * 3, size: 3 * size, grow: 7 * size,
          tone: 0.62 + Math.random() * 0.14,
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
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    for (let i = 0; i < 3; i++) {
      const d = this.sphere(0.3);
      this.air.puff(x + d.x, y + d.y, z + d.z, d.x * 3, 1 + Math.random() * 2, d.z * 3, {
        life: 5 + Math.random() * 3, size: 2.4, grow: 5.5,
        burn: fire > 0 ? 0.06 : 0, tone: 0.08 + Math.random() * 0.08,
      });
    }
    if (fire > 0) {
      this.air.puff(x, y, z, 0, 0, 0, { life: 0.35, size: 3, grow: 4, burn: 0.95, tone: 0.1 });
    }
  }

  /**
   * The trail off something moving through the air: an aeroplane hit and still
   * flying, one going down, a burning piece of one.
   *
   * Laid along the line it flew since the last call, not where it is now: at
   * ninety metres a second one puff a frame is a string of beads a metre and a
   * half apart, and one every tenth of a second is a row of balls. So `run` is
   * the caller's own -- an object kept with the thing that is smoking, which
   * remembers where the last puff went -- and the puffs are laid at a fixed
   * spacing along the way from there, closer than they are wide, so what is
   * left in the sky is one continuous ribbon that swells and breaks up as it
   * ages.
   *
   * `fire` is how much of her is alight, 0 to 1. Burning, the newest of it is
   * flame -- a short streaming tongue right behind her, white at the root and
   * orange at the tip, going straight into oily black smoke. Not burning,
   * which is a glycol or an oil leak or a shot-up engine, it is a thinner,
   * paler grey. `thick` scales the lot: a heavy is four engines' worth.
   */
  smokeRun(run, x, y, z, { fire = 0, thick = 1, heavy = false } = {}) {
    if (!run || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    if (run.x === undefined || Math.hypot(x - run.x, y - run.y, z - run.z) > 160) {
      run.x = x; run.y = y; run.z = z;
      return;
    }
    const dx = x - run.x, dy = y - run.y, dz = z - run.z;
    const d = Math.hypot(dx, dy, dz);
    const w = (heavy ? 1.8 : 1) * Math.max(0.3, thick);
    const step = (heavy ? 2.4 : 1.6) / Math.sqrt(Math.max(0.3, Math.min(1.6, this.intensity)));
    if (d < step) return;
    const n = Math.min(40, Math.floor(d / step));
    const ux = dx / d, uy = dy / d, uz = dz / d;
    const burning = fire > 0.05;
    for (let i = 1; i <= n; i++) {
      const px = run.x + ux * step * i, py = run.y + uy * step * i, pz = run.z + uz * step * i;
      const j = () => (Math.random() - 0.5);
      // The smoke.
      this.air.puff(px + j() * 0.6 * w, py + j() * 0.6 * w, pz + j() * 0.6 * w,
        j() * 1.6, 0.6 + Math.random() * 0.8, j() * 1.6, {
          life: (burning ? 6.5 : 4.5) * (0.8 + Math.random() * 0.4) * Math.min(1.4, 0.6 + thick * 0.5),
          size: (burning ? 1.3 : 0.9) * w * (0.8 + Math.random() * 0.4),
          grow: (burning ? 4.2 : 3) * w,
          burn: burning ? 0.035 : 0,
          tone: burning ? 0.04 + Math.random() * 0.07 : 0.34 + Math.random() * 0.12,
        });
      // And the flame, streaming back off her, only as long as it lasts.
      if (burning && Math.random() < Math.min(1, fire + 0.25)) {
        this.air.puff(px + j() * 0.4 * w, py + j() * 0.4 * w, pz + j() * 0.4 * w,
          j() * 0.8, 0.4, j() * 0.8, {
            life: (0.16 + Math.random() * 0.14) * (heavy ? 1.5 : 1),
            size: (1.5 + Math.random() * 1.0) * w, grow: 1.6 * w,
            burn: 0.96, tone: 0.08,
          });
      }
    }
    run.x += ux * step * n; run.y += uy * step * n; run.z += uz * step * n;
  }

  /**
   * A gun going off: the flash, and then the smoke that stands there.
   *
   * The work is in muzzleblast.js. What is left here is the light the flash
   * throws on the ship, and working out which way the bore is pointing when
   * the caller only knows the bearing.
   *
   * `aim` is the barrel's own line, elevation and all, when the model knows
   * it; without it the blast goes out level on `bearing`.
   */
  muzzle(x, y, z, bearing, caliber = 152, aim = null) {
    const d = aim
      ? MUZZLE_DIR.copy(aim).normalize()
      : MUZZLE_DIR.set(Math.sin(bearing), 0.04, Math.cos(bearing)).normalize();
    // A turret's barrels go off together and light the same water: one light
    // for the lot, out in the middle of the fire in front of the muzzles.
    if (!this.blasts.near(x, y, z)) {
      const L = blastSize(caliber);
      this.gunFlash(x + d.x * 0.35 * L, y + d.y * 0.35 * L + 2, z + d.z * 0.35 * L, caliber);
    }
    this.blasts.fire(x, y, z, d, caliber);
  }

  /**
   * A burst out of an aircraft's gun: the flicker at the muzzle and the thread
   * of smoke that goes astern with it.
   *
   * Not `muzzle`, which is scaled for a naval mounting and would hang a bank
   * of propellant smoke the size of a destroyer off a fighter's wing. What you
   * see of a fifty firing is a small hot flicker on the leading edge, gone in
   * a twentieth of a second, and a grey thread streaming back over the panel.
   *
   * `dx, dy, dz` is the way the bore is pointing, which is her nose rather
   * than her flight path.
   */
  wingGun(x, y, z, dx, dy, dz, calibre = 12.7) {
    const k = 0.55 + calibre / 26;
    this.air.puff(x + dx * 1.4, y + dy * 1.4, z + dz * 1.4, -dx * 14, -dy * 14, -dz * 14, {
      life: 0.6, size: 0.35 * k, grow: 1.8 * k, tone: 0.6, burn: 0.08,
    });
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
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    const scale = 0.4 + caliber / 200;
    // The burst itself: a hard orange flash that is gone in a fraction of a
    // second, inside the smoke it makes.
    this.air.puff(x, y, z, 0, 0, 0, {
      life: 0.2, size: 2.4 * scale, grow: 10 * scale, burn: 0.98, tone: 0.05,
    });
    // And the smoke. Black -- American and British heavy flak burst black, and
    // it is the one thing every gun-camera film of an attack has in it -- and
    // not a ball but a knot: a handful of curls thrown out of the one point,
    // tight and dense for the first second and then spreading and thinning
    // into the ragged smudge that hangs there long after.
    const n = Math.max(3, Math.round((4 + 3 * scale) * Math.min(1.5, this.intensity)));
    for (let i = 0; i < n; i++) {
      const d = this.sphere(0);
      const sp = (3 + Math.random() * 5) * scale;
      this.air.puff(x + d.x * 0.8 * scale, y + d.y * 0.8 * scale, z + d.z * 0.8 * scale,
        d.x * sp, d.y * sp + 0.5, d.z * sp, {
          life: 4.5 + Math.random() * 3,
          size: (2.2 + Math.random() * 1.4) * scale, grow: (3.4 + Math.random() * 1.8) * scale,
          burn: 0.025, tone: 0.03 + Math.random() * 0.07,
        });
    }
    // The shell case going out of it, too fast to be anything but a glint.
    for (let i = 0; i < Math.round(4 * Math.min(1.5, this.intensity)); i++) {
      const d = this.sphere(0);
      const sp = 40 + Math.random() * 50;
      this.shards.throw(x, y, z, d.x * sp, d.y * sp, d.z * sp,
        { life: 1.2 + Math.random(), size: 0.3 * scale, hot: 1 });
    }
  }

  /**
   * A salvo of flares and chaff off a modern aeroplane: each flare a white-hot
   * point falling away behind her on the line the simulation gave it, with a
   * thick white trail curling off it, and a glitter of foil round her tail.
   *
   * `list` is [vx, vy, vz, life] a flare, as the simulation threw them; the
   * flight is worked out here the same way it is there (see stepChaff), and
   * laid in one go, each puff waiting its turn.
   */
  flares(x, y, z, list) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Array.isArray(list)) return;
    const step = 0.05;
    for (const f of list) {
      let [vx, vy, vz, life] = f;
      let px = x, py = y, pz = z;
      for (let t = 0, k = 0; t < life && py > 0; t += step, k++) {
        // The flare itself: brightest at first, burning down as it goes.
        const left = 1 - t / life;
        this.air.puff(px, py, pz, 0, 0, 0, {
          delay: t, life: 0.14, size: 1.2 + 1.4 * left, grow: 2, burn: 0.99, tone: 1,
        });
        // And its smoke, every other step.
        if (k % 2 === 0) {
          this.air.puff(px, py, pz, (Math.random() - 0.5) * 0.8, 0.4, (Math.random() - 0.5) * 0.8, {
            delay: t, life: 2.6 + Math.random() * 1.2, size: 0.9, grow: 2.4, burn: 0, tone: 0.95,
          });
        }
        const drag = Math.exp(-1.4 * step);
        vx *= drag; vz *= drag;
        vy = Math.max(-28, vy - 9.8 * 0.6 * step);
        px += vx * step; py += vy * step; pz += vz * step;
      }
    }
    // The chaff: a cloud of foil glinting as it spreads behind her.
    for (let i = 0; i < Math.round(14 * Math.min(1.5, this.intensity)); i++) {
      const d = this.sphere(0);
      const sp = 6 + Math.random() * 14;
      this.shards.throw(x, y, z, d.x * sp, d.y * sp, d.z * sp,
        { life: 1.6 + Math.random() * 1.6, size: 0.12 + Math.random() * 0.12, hot: 0 });
    }
  }

  /**
   * A round arriving on an aeroplane: a spark off the metal, a scrap or two of
   * her skin, and a pinch of grey where it went in.
   */
  strike(x, y, z, caliber = 8) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    const k = 0.6 + caliber / 20;
    this.air.puff(x, y, z, 0, 0, 0, { life: 0.12, size: 0.8 * k, grow: 3 * k, burn: 0.98, tone: 0.1 });
    for (let i = 0; i < 3; i++) {
      const d = this.sphere(0);
      const sp = 12 + Math.random() * 25;
      this.shards.throw(x, y, z, d.x * sp, d.y * sp, d.z * sp,
        { life: 1 + Math.random() * 1.5, size: 0.18 + Math.random() * 0.25, hot: i === 0 ? 1 : 0 });
    }
    this.air.puff(x, y, z, (Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2,
      { life: 1.4, size: 0.7 * k, grow: 2.2 * k, tone: 0.42 });
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
    // The fireball proper is the scene's (see magazineBurst); what is here is
    // the base of it, rolling out low across the water.
    const N = Math.round(44 * Math.min(1.4, this.intensity));
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      // Squashed: mostly out, a little up.
      const out = 26 + Math.random() * 74;
      const rise = up * up * 22;
      const heat = 1 - Math.min(1, (out / 100) * 0.7 + Math.random() * 0.3);
      // Only the hottest heads are drawn as light. Added together, a hundred
      // of them burn the whole thing out to a white blob; laid over each other
      // as fire that cools to soot, they make a fireball with a black skin
      // breaking open on the orange underneath.
      const glow = heat > 0.7 && Math.random() < 0.5;
      this.spawn({
        x: x + Math.cos(a) * out * 0.5 * s,
        y: y + 4 + rise * 0.5 * s,
        z: z + Math.sin(a) * out * 0.5 * s,
        vx: Math.cos(a) * (18 + Math.random() * 30) * s,
        vy: 5 + rise * 0.5 + Math.random() * 12,
        vz: Math.sin(a) * (18 + Math.random() * 30) * s,
        size: (13 + Math.random() * 17) * s,
        grow: (22 + Math.random() * 28) * s,
        ttl: 1.1 + Math.random() * 1.6,
        billow: true, glow, drag: 0.5, lift: glow ? -2 : 1.5,
        // White-hot in the middle of it, orange at the edge, and every one of
        // them cooling to soot as it goes.
        color: heat > 0.62 ? 0xffd890 : heat > 0.3 ? 0xf08a32 : 0xb04416,
        cool: glow ? 0x3a1a0a : 0x14110f, opacity: glow ? 0.4 : 0.85,
      });
    }
    // The burning wreckage going out on long trails, which is what gives the
    // thing its size: they leave the fireball behind and are still going,
    // fire at the head and smoke behind, curving over and down to the sea.
    const streaks = Math.round(30 * Math.min(1.4, this.intensity));
    for (let i = 0; i < streaks; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.35 + Math.random() * 0.6;
      const v = (45 + Math.random() * 75) * Math.sqrt(s);
      const flight = 2.5 + Math.random() * 4;
      this.trails.arc(x, y + 6 * s, z,
        Math.cos(a) * v * (1 - up * 0.6), v * up * 1.3, Math.sin(a) * v * (1 - up * 0.6), {
          flight, floor: 0.5, spacing: 0.03, limit: 64,
          size: (2.2 + Math.random() * 1.6) * s, grow: 4 * s, life: 3.5 + Math.random() * 2.5,
          burnFor: flight * (0.3 + Math.random() * 0.5),
          tone: 0.25 + Math.random() * 0.45,
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

  /** `camera` is what the gun smoke is sorted against; see muzzleblast.js. */
  update(dt, camera) {
    if (this.pending && this.pending.length) {
      const due = [];
      this.pending = this.pending.filter((q) => ((q.t -= dt) > 0 ? true : (due.push(q), false)));
      for (const q of due) q.fn();
    }
    this.splashes.update(dt);
    this.blasts.update(dt, camera);
    this.trails.update(dt);
    this.air.update(dt);
    this.shards.update(dt);
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life += dt;
      const k = p.life / p.ttl;
      if (k >= 1) {
        // Out of order: which one fills the gap does not matter, and a splice
        // in the middle of nine hundred does.
        const last = this.active.pop();
        if (last !== p) this.active[i] = last;
        continue;
      }
      drift(p, dt);
      p.x += p.vx * dt;
      p.y = Math.max(0.5, p.y + p.vy * dt);
      p.z += p.vz * dt;
      p.scale = p.size + p.grow * p.life;
      p.rotation += p.spin * dt;
      // How it goes out. A puff of smoke thins evenly; a lump of burning fuel
      // is at its brightest immediately and cools through orange to black,
      // which is the whole difference between a fireball and a fog bank.
      if (p.cool) {
        p.r = p.r0 + (p.r1 - p.r0) * k;
        p.g = p.g0 + (p.g1 - p.g0) * k;
        p.b = p.b0 + (p.b1 - p.b0) * k;
        p.opacity = p.opacity0 * Math.min(1, (1 - k) * 2.2);
      } else {
        p.opacity = p.opacity0 * (1 - k * k);
      }
    }
    for (const p of this.active) this.puffs.add(p);
    this.puffs.write(camera);
    this.stepLights(dt);
  }

  /** The flashes' lights dying away. */
  stepLights(dt) {
    for (const l of this.lights) {
      if (l.life > 0 && !l.held) {
        l.life -= dt;
        l.light.intensity *= Math.pow(l.fade ?? 0.02, dt);
        if (l.life <= 0) l.light.intensity = 0;
      }
    }
  }
}
