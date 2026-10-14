// A ship blown apart by her own magazine.
//
// Not her plating peeled off a length of her with her insides left standing
// in the gap: a magazine does not take the skin off a ship, it takes the ship
// apart. What is drawn is three pieces of her, each the whole model torn at
// one or both ends along the same wandering tear (see sever.js), so they fit
// tooth for tooth at the moment she goes and then do not:
//
//   the length over the magazine, torn out at both ends and thrown upward --
//   a few feet, heaving and falling back, off a destroyer's handful of
//   five-inch rounds; a hundred metres and more, turning over, off a
//   battleship's main magazine;
//
//   the turrets that stood on it, lifted clean off their roller paths and
//   thrown higher still, because a turret is a lid on the magazine and the
//   blast comes up the trunk under it;
//
//   and what is left of her either side, parting, their broken ends dropping
//   into the sea and their far ends coming up, while the battle settles what
//   is left of her the way it already was.
//
// How hard is not a number made up for the effect. It is how much ammunition
// was stowed in that magazine (`tons`, off the wire; see detonate in sim.js),
// and the same tonnage sizes the fireball, the column and the splash.

import * as THREE from '../../../vendor/three.module.js';
import { cutUniforms, cutTree, copyOf, disposeCut, cloneMaterial } from './sever.js';

const G = 9.81;
const TMP = new THREE.Vector3();
const TMPQ = new THREE.Quaternion();

/** How hard a magazine of `tons` goes: about 0.3 for a destroyer's, 1 for a battleship's. */
export function blastPower(tons) {
  return THREE.MathUtils.clamp(Math.cbrt(Math.max(1, tons || 0)) / 10, 0.18, 1.4);
}

/** The two tears are seeded apart so they never run parallel. */
const SEED_AFT = 3.7;
const SEED_FORE = 19.3;

/** A mounting that stands on her and has to be cut whole or not at all. */
function isMount(o) {
  return !!(o.userData && (o.userData.mounting || o.userData.dynamic));
}

/** Its own burnt copy of every material, so the class's paint is not touched. */
function burn(o, k) {
  o.traverse((m) => {
    if (!m.isMesh || !m.material) return;
    const list = (Array.isArray(m.material) ? m.material : [m.material]).map((q) => {
      const c = cloneMaterial(q);
      if (c.color) c.color.multiplyScalar(k);
      if (c.emissive) c.emissive.setHex(0x000000);
      return c;
    });
    m.material = Array.isArray(m.material) ? list : list[0];
    m.userData.cutMat = true;
  });
}

export class Rupture {
  /**
   * `zc` is the middle of the magazine, metres along her in her own frame;
   * `tons` what was in it; `motion` { v, h } the way she had on her.
   */
  constructor(view, zc, tons, motion = { v: 0, h: 0 }) {
    this.view = view;
    const cls = view.cls;
    const len = cls.hull.length;
    const beam = cls.hull.beam;
    this.len = len;
    this.power = blastPower(tons);
    const P = this.power;
    this.jag = Math.min(9, 1.5 + beam * 0.16);
    // The length of her that goes: about a beam of her off a destroyer's
    // magazine, two off a battleship's. Never so short the two tears cross,
    // and never up to her ends.
    const hw = THREE.MathUtils.clamp(beam * (0.35 + 0.6 * P), this.jag * 1.3, len * 0.16);
    const lim = len / 2 - this.jag - 4;
    zc = THREE.MathUtils.clamp(zc, -lim + hw, lim - hw);
    this.zc = zc;
    this.z0 = zc - hw;
    this.z1 = zc + hw;
    const z0 = this.z0;
    const z1 = this.z1;

    const group = view.group;
    group.updateMatrixWorld(true);
    const world = group.parent;
    // Her own model is not drawn from here on: the three pieces are. It is
    // still posed by the battle, and the two pieces left afloat ride on it.
    this.hidden = group.children.filter((c) => c !== view.marker && c.visible);
    const inBand = (z) => z >= z0 && z <= z1;
    const make = (U, inside, throwMounts) => {
      const piece = copyOf(view);
      piece.position.set(0, 0, 0);
      piece.quaternion.identity();
      piece.scale.set(1, 1, 1);
      // Her mountings are cut whole: a turret is not torn in half by a tear
      // that wanders through its barbette. The ones over the magazine are
      // the chunk's, or are thrown; on the other pieces they are not there.
      const mounts = piece.children.filter(isMount);
      const keep = [];
      const thrown = [];
      for (const m of mounts) {
        piece.remove(m);
        const z = m.position.z;
        if (throwMounts === null) { if (!inBand(z)) keep.push(m); continue; }
        if (inBand(z)) (throwMounts ? thrown : keep).push(m);
      }
      cutTree(piece, U, inside, null);
      for (const m of keep) piece.add(m);
      group.add(piece);
      return { piece, U, thrown };
    };
    const opts = (o) => ({ seed: SEED_AFT, seed2: SEED_FORE, ...o });
    // Her two ends. The fore piece keeps what is forward of the forward tear,
    // the after piece what is abaft the after one.
    this.fore = make(cutUniforms(z1, 1, this.jag, { seed: SEED_FORE }),
      (z) => z >= z1, null);
    this.aft = make(cutUniforms(z0, -1, this.jag, { seed: SEED_AFT }),
      (z) => z <= z0, null);
    // And the length between them.
    const chunk = make(cutUniforms(z0, 0, this.jag, opts({ z2: z1, band: true })),
      inBand, true);
    this.chunk = chunk;
    for (const c of this.hidden) c.visible = false;

    // The way she had on her, in the world.
    const vx = Math.sin(motion.h || 0) * (motion.v || 0);
    const vz = Math.cos(motion.h || 0) * (motion.v || 0);
    // Her beam, in the world: what is thrown goes mostly up and a little
    // out to one side or the other.
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(
      group.getWorldQuaternion(TMPQ)).setY(0).normalize();

    // The chunk is thrown in the world, not on her: it turns about its own
    // middle, at the height of her deck.
    const pivot = new THREE.Object3D();
    group.localToWorld(pivot.position.set(0, cls.hull.draft * 0.2, zc));
    group.getWorldQuaternion(pivot.quaternion);
    world.add(pivot);
    pivot.updateMatrixWorld(true);
    pivot.attach(chunk.piece);
    // How hard it goes up: heaved a few metres by a small magazine, thrown a
    // hundred and more by a big one. A thousand tons of hull is not light,
    // which is why it never goes as high as the turrets do.
    const up = 3 + 44 * Math.pow(P, 1.7);
    const out = (Math.random() - 0.5) * 6 * P;
    this.flyers = [{
      obj: pivot, piece: chunk.piece, U: chunk.U, hull: true,
      vx: vx * 0.5 + side.x * out, vy: up, vz: vz * 0.5 + side.z * out,
      // Turning end over end about her beam, mostly, and a little about her
      // length.
      axis: new THREE.Vector3(1, 0, (Math.random() - 0.5) * 0.6)
        .applyQuaternion(pivot.quaternion).normalize(),
      spin: (Math.random() < 0.5 ? -1 : 1) * (0.08 + 0.55 * P * (0.5 + Math.random())),
      size: hw * 2,
      wet: false,
    }];
    // Her turrets over it, thrown clear of the chunk and higher than it.
    for (const m of chunk.thrown) {
      burn(m, 0.3);
      // It was taken off the copy before the copy was put on her, so where
      // it stands in the world is where it stood on her.
      m.updateMatrix();
      m.matrix.premultiply(group.matrixWorld).premultiply(
        new THREE.Matrix4().copy(world.matrixWorld).invert());
      m.matrix.decompose(m.position, m.quaternion, m.scale);
      world.add(m);
      const tup = up * (1.15 + Math.random() * 0.55) + 6 * P;
      const tout = (Math.random() - 0.5) * (8 + 22 * P);
      const along = (Math.random() - 0.5) * 10 * P;
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(pivot.quaternion);
      this.flyers.push({
        obj: m, hull: false,
        vx: vx * 0.5 + side.x * tout + fwd.x * along,
        vy: tup,
        vz: vz * 0.5 + side.z * tout + fwd.z * along,
        axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        spin: (0.4 + Math.random() * 1.8) * (0.4 + P),
        size: 6 + 8 * P,
        wet: false,
      });
    }
    this.t = 0;
    // How far her two ends go over and how fast they part: a battleship
    // broken by her main magazine stands both ends up out of the sea.
    this.lean = 0.12 + 0.3 * Math.min(1, P);
    this.apart = 1.2 + 6 * P;
  }

  /**
   * Once a frame, after she is posed. Returns the splashes made this frame,
   * in the world -- { x, z, size, hull } -- for the battle to make water of.
   */
  step(dt) {
    this.t += dt;
    const t = this.t;
    const splashes = [];
    // Her two ends, hinged at their broken ends: the broken end goes down
    // into the sea and the far end comes up, and the two of them part.
    const ease = (x) => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); };
    const lean = this.lean * ease(t / 9) + Math.min(0.25, t * 0.004);
    const gap = this.apart * (1 - Math.exp(-t / 3)) + t * 0.15;
    for (const [part, end, at] of [[this.fore, 1, this.z1], [this.aft, -1, this.z0]]) {
      if (!part) continue;
      const p = part.piece;
      // Rotation about her beam at the broken end: positive puts +z down, so
      // the fore piece turns the other way to lift its stem.
      const a = -end * lean;
      p.rotation.set(a, 0, end * 0.04 * ease(t / 12));
      // Put back so the broken end stays where it was, parting from the other.
      TMP.set(0, 0, at).applyEuler(p.rotation);
      p.position.set(0, -ease(t / 6) * 1.5, at + end * gap - TMP.z);
      p.position.y -= TMP.y;
      p.updateMatrixWorld(true);
      part.U.uCutInv.value.copy(p.matrixWorld).invert();
    }
    // What was thrown.
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      const o = f.obj;
      if (!f.wet) {
        f.vy -= G * dt;
        // Air does not slow a turret much, but it slows the scraps round it.
        f.vx *= Math.exp(-dt * 0.08);
        f.vz *= Math.exp(-dt * 0.08);
      } else {
        // In the water: stopped dead, and going down.
        const k = Math.exp(-dt * 2.5);
        f.vx *= k; f.vz *= k;
        f.vy = f.vy * k + (-2.5 - (f.hull ? 1.5 : 3)) * (1 - k);
        f.spin *= Math.exp(-dt * 1.2);
      }
      o.position.x += f.vx * dt;
      o.position.y += f.vy * dt;
      o.position.z += f.vz * dt;
      o.quaternion.premultiply(TMPQ.setFromAxisAngle(f.axis, f.spin * dt));
      if (!f.wet && f.vy < 0 && o.position.y < 1) {
        f.wet = true;
        splashes.push({ x: o.position.x, z: o.position.z, size: f.size, hull: f.hull, fall: -f.vy });
      }
      o.updateMatrixWorld(true);
      if (f.U) f.U.uCutInv.value.copy(f.piece.matrixWorld).invert();
      if (f.wet && o.position.y < -(f.hull ? 40 + this.len * 0.1 : 30)) {
        this.drop(f);
        this.flyers.splice(i, 1);
      }
    }
    return splashes;
  }

  drop(f) {
    if (f.obj.parent) f.obj.parent.remove(f.obj);
    disposeCut(f.obj);
  }

  dispose() {
    for (const f of this.flyers) this.drop(f);
    this.flyers.length = 0;
    for (const part of [this.fore, this.aft]) {
      if (!part) continue;
      if (part.piece.parent) part.piece.parent.remove(part.piece);
      disposeCut(part.piece);
    }
    this.fore = this.aft = null;
  }
}
