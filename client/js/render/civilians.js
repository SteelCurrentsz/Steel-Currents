// The people of the towns: the men and women in the streets of a town, the
// dockers on a harbour's apron and the ground crew about an airfield.
//
// They are the town's own life and nothing the battle keeps: the simulation
// does not know they are there, so every screen raises its own crowd and
// walks it about on its own. What it does read is the battle. Every burst,
// every gun fired and every round that comes in near them is heard, and
// they run from it -- away from where it went off, along the streets, as
// fast as they can, their arms up round their heads -- and then, when it has
// been quiet a while, they slow to a walk again. Those caught in a burst are
// killed: blown down, or taken apart close in, and the blood is the same
// blood the soldiers ashore bleed (see InfantryView). Those in a building
// when it comes down are buried with it.
//
// They are drawn with the soldiers' own bodies, undressed of their uniform
// and given a coat, trousers and a bare head each: see InfantryView's civil
// mode.

import * as THREE from '../../../vendor/three.module.js';
import {
  SURF, worldToCity, cityToWorld, buildingAt, buildingById, inFootprint, ruinOf, standingHeight,
} from '../../../shared/works.js';
import { InfantryView, footing } from './infantry.js';

/** How many people a battlefield's towns hold between them, at most. */
const MAX_PEOPLE = 900;
/** Past this far from the eye, nobody is walked about: nobody could see it. */
const LIVE_RANGE = 3200;
/** Walking pace, and running for their lives, metres a second. */
const WALK = [1.0, 1.6];
const RUN = [4.2, 6.4];
/** How long a fright lasts after the last thing that frightened them, seconds. */
const SCARED_FOR = 14;

// What they wear: coats and dresses, and trousers or skirts. Bright enough to
// read against the street, as the people of a town did not dress for war.
const COATS = [
  [0.32, 0.3, 0.3], [0.45, 0.32, 0.2], [0.2, 0.24, 0.38], [0.55, 0.5, 0.42], [0.62, 0.18, 0.15],
  [0.25, 0.32, 0.22], [0.7, 0.66, 0.55], [0.18, 0.18, 0.2], [0.45, 0.42, 0.5], [0.6, 0.45, 0.25],
  [0.3, 0.45, 0.6], [0.75, 0.72, 0.68],
];
const LEGS = [
  [0.18, 0.18, 0.2], [0.3, 0.27, 0.24], [0.22, 0.22, 0.3], [0.4, 0.36, 0.3], [0.15, 0.14, 0.13],
];
const SKINS = [[1.0, 0.82, 0.68], [0.92, 0.72, 0.56], [0.78, 0.58, 0.42], [0.58, 0.42, 0.3], [0.42, 0.3, 0.22]];
// Overalls for the dockers and the ground crew.
const WORK = [[0.2, 0.26, 0.38], [0.36, 0.34, 0.24], [0.5, 0.5, 0.48]];

const colour = (a, lift = 2.2) => new THREE.Color(a[0] * lift, a[1] * lift, a[2] * lift);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** Where a person can be on foot, on each kind of site. */
const ON_FOOT = new Set([SURF.walk, SURF.plaza, SURF.path, SURF.lawn, SURF.median, SURF.yard]);
const RUN_ON = new Set([...ON_FOOT, SURF.road, SURF.runway, SURF.mark]);

export class Civilians {
  constructor(scene, world, plans) {
    this.world = world;
    this.plans = plans.filter(Boolean);
    this.people = [];
    this.seq = 1;
    this.view = null;
    if (!this.plans.length) return;
    this.raise();
    if (this.people.length) {
      this.view = new InfantryView(scene, world, { civil: true, nearCap: 260, farCap: MAX_PEOPLE + 40 });
    }
  }

  /** The crowd, scattered over every site's pavements. */
  raise() {
    const want = this.plans.map((plan) => {
      const kind = plan.city.kind;
      if (kind === 'harbor') return 28;
      if (kind === 'airbase') return 18;
      return Math.round(Math.min(260, Math.max(30, plan.buildings.length * 0.45)));
    });
    const total = want.reduce((a, b) => a + b, 0);
    const k = total > MAX_PEOPLE ? MAX_PEOPLE / total : 1;
    this.plans.forEach((plan, i) => {
      const n = Math.floor(want[i] * k);
      const work = !!plan.city.kind;
      for (let j = 0, tries = 0; j < n && tries < n * 30; tries++) {
        const u = (Math.random() - 0.5) * plan.W;
        const v = (Math.random() - 0.5) * plan.D;
        if (!ON_FOOT.has(plan.surfAt(u, v)) && !(work && RUN_ON.has(plan.surfAt(u, v)))) continue;
        const w = cityToWorld(plan.city, u, v);
        if (this.walledIn(w.x, w.z)) continue;
        const coat = work ? pick(WORK) : pick(COATS);
        this.people.push({
          i: this.seq++, plan, x: w.x, z: w.z, y: footing(this.world, w.x, w.z),
          h: Math.random() * Math.PI * 2, sp: 0, pace: WALK[0] + Math.random() * (WALK[1] - WALK[0]),
          run: RUN[0] + Math.random() * (RUN[1] - RUN[0]),
          goal: null, wait: Math.random() * 6, scared: 0, from: null, alive: true,
          col: { coat: colour(coat), legs: colour(work ? coat : pick(LEGS)), skin: colour(pick(SKINS), 1.05) },
        });
        j++;
      }
    });
  }

  /** Whether a point is inside a building that is still standing. */
  walledIn(x, z) {
    const b = buildingAt(this.world, x, z, 0.4);
    return !!(b && standingHeight(b, ruinOf(this.world, b.id)) > 2);
  }

  /** Whether a person can stand at a point of this site: `run` lets them onto the roads. */
  footable(plan, x, z, run) {
    const { u, v } = worldToCity(plan.city, x, z);
    const t = plan.surfAt(u, v);
    if (!(run ? RUN_ON : ON_FOOT).has(t) && !(plan.city.kind && RUN_ON.has(t))) return false;
    return !this.walledIn(x, z);
  }

  /** Somewhere to walk to: a point near by on the pavement, or away from `from` if frightened. */
  aim(p) {
    const plan = p.plan;
    for (let k = 0; k < 12; k++) {
      let a;
      let d;
      if (p.scared > 0 && p.from) {
        const away = Math.atan2(p.x - p.from.x, p.z - p.from.z);
        a = away + (Math.random() - 0.5) * 1.4;
        d = 30 + Math.random() * 70;
      } else {
        a = Math.random() * Math.PI * 2;
        d = 12 + Math.random() * 50;
      }
      const x = p.x + Math.sin(a) * d;
      const z = p.z + Math.cos(a) * d;
      if (this.footable(plan, x, z, p.scared > 0)) { p.goal = { x, z }; return; }
    }
    p.goal = null;
    p.wait = 0.5 + Math.random() * 2;
  }

  update(dt, camera) {
    if (!this.view) return;
    const cam = camera?.position;
    const list = [];
    for (const p of this.people) {
      if (!p.alive) continue;
      const near = !cam || Math.hypot(p.x - cam.x, p.z - cam.z) < LIVE_RANGE;
      if (!near) continue;
      p.scared = Math.max(0, p.scared - dt);
      let speed = 0;
      if (p.wait > 0 && p.scared <= 0) {
        p.wait -= dt;
      } else {
        if (!p.goal) this.aim(p);
        if (p.goal) {
          const dx = p.goal.x - p.x;
          const dz = p.goal.z - p.z;
          const d = Math.hypot(dx, dz);
          speed = p.scared > 0 ? p.run : p.pace;
          if (d < 1) {
            p.goal = null;
            if (p.scared <= 0) p.wait = Math.random() < 0.4 ? 1 + Math.random() * 8 : 0;
            speed = 0;
          } else {
            const step = Math.min(d, speed * dt);
            const nx = p.x + (dx / d) * step;
            const nz = p.z + (dz / d) * step;
            // A wall, a heap of rubble or the edge of the town in the way:
            // somewhere else, then.
            if (this.footable(p.plan, nx, nz, p.scared > 0)) {
              p.x = nx; p.z = nz;
              const want = Math.atan2(dx, dz);
              p.h += Math.atan2(Math.sin(want - p.h), Math.cos(want - p.h)) * Math.min(1, dt * 8);
            } else {
              p.goal = null;
              speed = 0;
            }
          }
        }
      }
      p.sp = speed;
      p.y = footing(this.world, p.x, p.z);
      list.push({
        i: p.i, tm: 0, x: p.x, y: p.y, z: p.z, h: p.h, yaw: p.h, pitch: 0,
        f: p.scared > 0 ? 2 | 256 : 0, sp: speed, col: p.col,
      });
    }
    this.view.sync(list, dt, camera || { position: new THREE.Vector3() });
  }

  // ------------------------------------------------------------- the battle

  /** Everybody within `r` of (x, z) runs from it. */
  scare(x, z, r) {
    for (const p of this.people) {
      if (!p.alive) continue;
      if (Math.abs(p.x - x) > r || Math.abs(p.z - z) > r) continue;
      if (Math.hypot(p.x - x, p.z - z) > r) continue;
      const fresh = p.scared <= 0;
      p.scared = SCARED_FOR * (0.7 + Math.random() * 0.6);
      p.from = { x, z };
      p.wait = 0;
      // Not all at once: the ones further off take a moment to see what it was.
      if (fresh || Math.random() < 0.5) p.goal = null;
    }
  }

  /**
   * A burst at (x, y, z) that kills inside `kill` metres and takes people
   * apart inside `gib`, and frightens everybody inside `fright`.
   */
  burst(x, y, z, kill, gib, fright) {
    for (const p of this.people) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - x, p.z - z, (p.y + 1) - (y ?? p.y));
      if (d > kill) continue;
      // The edge of it is a matter of luck: a doorway, a kerb, a man between.
      if (d > kill * 0.6 && Math.random() < (d - kill * 0.6) / (kill * 0.4)) continue;
      this.die(p, x, z, d < gib);
    }
    this.scare(x, z, fright);
  }

  /** One of them killed, by something at (x, z): `apart` if it took them to pieces. */
  die(p, x, z, apart) {
    if (!p.alive) return;
    p.alive = false;
    const dx = p.x - x;
    const dz = p.z - z;
    const d = Math.hypot(dx, dz) || 1;
    this.view?.kill({
      i: p.i, tm: 0, x: p.x, y: p.y, z: p.z, h: p.h, c: 0,
      dx: dx / d, dz: dz / d, hx: p.x, hy: p.y + 1.2, hz: p.z,
      p: apart ? 0 : (Math.random() < 0.5 ? 1 : 2), g: apart ? 1 : 0, col: p.col,
    }, 0);
  }

  /** What the battle did: see onEvents in game.js. */
  event(ev) {
    if (!this.view) return;
    switch (ev.e) {
      case 'landhit':
      case 'bldghit': {
        const cal = ev.cal || 152;
        const k = ev.bomb ? 1.7 : 1;
        const kill = (2.5 + cal / 26) * k;
        this.burst(ev.x, ev.y, ev.z, kill, kill * 0.5, (70 + cal * 0.9) * k);
        break;
      }
      case 'airburst': {
        const cal = ev.cal || 152;
        const kill = 2 + cal / 40;
        this.burst(ev.x, ev.y, ev.z, kill, kill * 0.3, 60 + cal * 0.6);
        break;
      }
      case 'crater':
        if (ev.c) this.scare(ev.c.x, ev.c.z, 80 + (ev.c.r || 4) * 8);
        break;
      case 'muzzle':
        // A gun going off in the street, or a ship's broadside off the front.
        if (Number.isFinite(ev.x)) this.scare(ev.x, ev.z, 90 + (ev.cal || 100) * 0.9);
        break;
      case 'rf': {
        // A rifle or a machine gun: whoever the round went into, and
        // everybody within earshot of it.
        if (Number.isFinite(ev.tx)) {
          for (const p of this.people) {
            if (p.alive && Math.hypot(p.x - ev.tx, p.z - ev.tz) < 0.9 && Math.abs(p.y + 1 - (ev.ty ?? p.y + 1)) < 1.2) {
              this.die(p, ev.x, ev.z, false);
            }
          }
          this.scare(ev.tx, ev.tz, 90);
        }
        if (Number.isFinite(ev.x)) this.scare(ev.x, ev.z, 110);
        break;
      }
      case 'airHit':
        // A fighter's guns walked down the street.
        if (ev.land || ev.air === 0) {
          for (const p of this.people) {
            if (p.alive && Math.hypot(p.x - ev.x, p.z - ev.z) < 2.2) this.die(p, ev.x, ev.z, Math.random() < 0.25);
          }
          this.scare(ev.x, ev.z, 120);
        }
        break;
      case 'ruin': {
        // A building coming down: whoever was in it or at the foot of it is under it.
        if (ev.k !== 'b' || !(ev.s >= 3)) break;
        const b = buildingById(this.world, ev.id);
        if (!b) break;
        for (const p of this.people) {
          if (p.alive && inFootprint(b, p.x, p.z, 3)) this.die(p, b.x, b.z, Math.random() < 0.6);
        }
        this.scare(b.x, b.z, 140);
        break;
      }
      case 'nuke': {
        const kt = ev.kt || 15;
        const R = 900 * Math.cbrt(kt / 15);
        this.burst(ev.x, null, ev.z, R, R * 0.6, R * 4);
        break;
      }
      case 'detonate':
        // A ship blowing up alongside the quay.
        this.burst(ev.x, null, ev.z, 60, 40, 900);
        break;
      default: break;
    }
  }

  dispose() {
    this.view?.dispose();
    this.view = null;
  }
}
