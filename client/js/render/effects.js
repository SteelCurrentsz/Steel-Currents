// Pooled sprite effects: shell splashes, explosions, fires, funnel smoke and
// smoke screens. One shared canvas texture, two materials. A gun's flash and
// smoke are handed on to muzzleblast.js.

import * as THREE from '../../../vendor/three.module.js';
import { Splashes } from './splash.js';
import { MuzzleBlasts, blastSize } from './muzzleblast.js';
import { SmokeTrails } from './trails.js';
import { Shards } from './shards.js';

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
    const entry = this.lights[this.lightCursor = (this.lightCursor + 1) % this.lights.length];
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
    this.stepLights(dt);
  }

  /** The flashes' lights dying away. */
  stepLights(dt) {
    for (const l of this.lights) {
      if (l.life > 0) {
        l.life -= dt;
        l.light.intensity *= Math.pow(l.fade ?? 0.02, dt);
        if (l.life <= 0) l.light.intensity = 0;
      }
    }
  }
}
