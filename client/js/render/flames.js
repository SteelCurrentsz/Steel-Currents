// Fire, as an object rather than a picture of one.
//
// Smoke is a cloud and a billboard tells the truth about it. Flame is not: it
// is a body with a shape, it stands up off the deck, and walking round a
// burning ship has to show you the other side of it. A flat card facing the
// camera gives that away the moment the camera moves -- the fire turns with
// you, which is the one thing fire does not do.
//
// So a fire here is a handful of tapered lobes of real geometry, licking up
// from the seat of it, each one on its own clock: born low and fat, stretching
// and thinning as it rises, going from white through orange to nothing, and
// starting again. They are drawn additively so they pile into a bright core
// where they overlap, which is what makes the middle of a fire read as hotter
// than its edges.

import * as THREE from '../../../vendor/three.module.js';

// How many lobes one fire is made of, and how many fires can burn at once.
const LOBES = 7;
const MAX_FIRES = 22;

/** One tapered lick of flame: fat at the bottom, drawn to a point at the top. */
function lobeGeometry() {
  // A cone with its sides pulled in, so it is a flame rather than a party hat:
  // the profile swells just above the base and then runs out to the tip.
  const g = new THREE.ConeGeometry(0.5, 1.6, 7, 4, true);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // 0 at the base, 1 at the tip.
    const k = (v.y + 0.8) / 1.6;
    const swell = Math.sin(Math.min(1, k) * Math.PI * 0.62) * 1.25 + 0.25;
    p.setXYZ(i, v.x * swell, v.y, v.z * swell);
  }
  g.computeVertexNormals();
  g.translate(0, 0.8, 0);
  return g;
}

export class Flames {
  constructor(scene, intensity = 1) {
    this.scene = scene;
    this.intensity = intensity;
    this.geo = lobeGeometry();
    this.fires = new Map();
    this.free = [];
    this.time = 0;
  }

  make() {
    if (this.free.length) return this.free.pop();
    const g = new THREE.Group();
    g.userData.lobes = [];
    for (let i = 0; i < LOBES; i++) {
      const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
        color: 0xffa63c, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      // Each lobe starts somewhere else in its own life, so the fire is never
      // seven flames doing the same thing at the same moment.
      m.userData = {
        phase: Math.random(),
        rate: 0.9 + Math.random() * 0.9,
        lean: Math.random() * Math.PI * 2,
        off: (Math.random() - 0.5),
        off2: (Math.random() - 0.5),
      };
      g.add(m);
      g.userData.lobes.push(m);
    }
    this.scene.add(g);
    return g;
  }

  /**
   * Keep a fire burning at a place on a ship.
   *
   * Called every frame for every compartment that is alight: the key is what
   * ties this frame's call to the same fire as last frame's, so the flames
   * live and lick rather than being respawned from nothing sixty times a
   * second. Stop calling and the fire goes out on its own.
   */
  at(key, x, y, z, heat, span = 8) {
    let f = this.fires.get(key);
    if (!f) {
      if (this.fires.size >= MAX_FIRES) return;
      f = { group: this.make(), heat: 0, seen: 0 };
      this.fires.set(key, f);
    }
    f.group.position.set(x, y, z);
    f.span = span;
    // Eased, so a fire that has just caught grows into its size and one that
    // has been put out dies back rather than snapping off.
    f.heat += (heat - f.heat) * 0.08;
    f.seen = 0.35;
  }

  update(dt) {
    this.time += dt;
    for (const [key, f] of this.fires) {
      f.seen -= dt;
      if (f.seen <= 0) f.heat += (0 - f.heat) * 0.06;
      if (f.seen <= 0 && f.heat < 0.02) {
        f.group.visible = false;
        this.free.push(f.group);
        this.fires.delete(key);
        continue;
      }
      f.group.visible = true;
      const h = Math.max(0.05, f.heat);
      // How big the fire is: a fire in a compartment is the width of the
      // compartment, and it stands up about as high as it is wide.
      const base = Math.max(2.2, f.span * 0.22) * (0.55 + h * 0.75);
      for (const m of f.group.userData.lobes) {
        const u = m.userData;
        u.phase += dt * u.rate * (0.7 + h * 0.9);
        if (u.phase >= 1) {
          u.phase -= 1;
          // A new lick starts somewhere else in the seat of the fire.
          u.lean = Math.random() * Math.PI * 2;
          u.off = (Math.random() - 0.5);
          u.off2 = (Math.random() - 0.5);
        }
        const k = u.phase;
        // Up it goes, stretching and narrowing, and leaning over as it thins.
        const rise = k * base * 2.3;
        const wide = (1 - k * 0.72) * (0.75 + h * 0.5);
        const tall = (0.7 + k * 1.5) * (0.8 + h * 0.6);
        m.position.set(
          u.off * base * 0.8 + Math.sin(this.time * 2.2 + u.lean) * base * 0.12 * k,
          rise,
          u.off2 * base * 0.8 + Math.cos(this.time * 1.7 + u.lean) * base * 0.12 * k,
        );
        m.scale.set(base * wide, base * tall, base * wide);
        m.rotation.y = u.lean + this.time * 0.4;
        // Leaning with the draught as it goes up.
        m.rotation.z = Math.sin(u.lean) * k * 0.4;
        m.rotation.x = Math.cos(u.lean) * k * 0.4;
        // White at the seat, orange in the body, gone at the tip.
        const c = m.material.color;
        if (k < 0.22) c.setRGB(1, 0.93, 0.72);
        else if (k < 0.55) c.setRGB(1, 0.62, 0.19);
        else c.setRGB(0.86, 0.26, 0.06);
        m.material.opacity = Math.min(1, h * 1.3) * (1 - k) * (k < 0.12 ? k / 0.12 : 1) * 0.85;
      }
    }
  }

  dispose() {
    for (const [, f] of this.fires) this.scene.remove(f.group);
    for (const g of this.free) this.scene.remove(g);
    this.fires.clear();
    this.free.length = 0;
    this.geo.dispose();
  }
}
