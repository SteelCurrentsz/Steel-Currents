// The soldier or tank a player has in hand, moved on his own screen ahead of
// the snapshots.
//
// Everything else on the field is drawn a little behind the battle (see
// INTERP_DELAY in game.js), which is what keeps it smooth. The one thing a
// player is driving cannot be: drawn there, a push on the stick shows up a
// fifth of a second or more later, and the camera that rides on him drags
// after it. So he is walked -- or it is driven -- here, by the same code the
// battle uses (predictSoldier, driveHull), off the stick as it is this
// frame, and the battle's own word on where he is is taken up as it comes:
// the difference between the snapshot and where we had him at that moment,
// eased in over a few tenths of a second, the same way our own ship is (see
// correctOwn in game.js). Put somewhere else altogether -- a jump, a lost
// stretch of snapshots -- and he is put there.

import { wrapAngle, angleDelta } from '../../shared/math.js';
import { DT } from '../../shared/sim.js';

const lerp = (a, b, t) => a + (b - a) * t;

/** How long a correction takes to be taken up, in seconds. */
const TAU = 0.25;

/** The most steps of the battle's own length run in one frame. */
const MOST_STEPS = 12;

export class Held {
  /**
   * `body` is the thing moved: at least `x, z, y, h`. `step(body, dt)` moves
   * it one step; `snap` is how far out it can be before it is simply put
   * where the battle has it, in metres.
   */
  constructor(body, step, { snap = 6, dead = 0.05 } = {}) {
    this.body = body;
    this.step = step;
    this.snapAt = snap;
    this.dead = dead;
    this.track = [];
    this.fix = null;
    this.spare = 0;
    this.lastST = -Infinity;
    // Where he was a step before the last, and where he is drawn: between
    // the two, by how far into the next step this frame is. The battle
    // moves him thirty times a second and the screen draws him sixty, and
    // drawn on the steps alone he went in a stride and a stop, by turns.
    this.prev = { x: body.x, z: body.z, y: body.y, h: body.h };
    this.drawn = { x: body.x, z: body.z, y: body.y, h: body.h };
  }

  /**
   * Run him on by `dt` of the battle's seconds, in steps no longer than the
   * battle's own so the legs and the tracks behave as they do there; then
   * take up a frame's worth of the last correction and note where he has got
   * to at `t`, the moment on the battle's clock this frame stands for.
   */
  advance(dt, t) {
    const b = this.body;
    this.spare = Math.min(this.spare + Math.max(0, dt), DT * MOST_STEPS);
    const pv = this.prev;
    while (this.spare >= DT) {
      pv.x = b.x; pv.z = b.z; pv.y = b.y; pv.h = b.h;
      this.step(b, DT);
      this.spare -= DT;
    }
    const f = this.fix;
    if (f) {
      const k = 1 - Math.exp(-Math.max(0, dt) / TAU);
      const dx = f.x * k, dz = f.z * k, dy = f.y * k, dh = f.h * k;
      b.x += dx; b.z += dz; b.y += dy; b.h = wrapAngle(b.h + dh);
      pv.x += dx; pv.z += dz; pv.y += dy; pv.h = wrapAngle(pv.h + dh);
      f.x -= dx; f.z -= dz; f.y -= dy; f.h -= dh;
    }
    const u = Math.min(1, this.spare / DT);
    const d = this.drawn;
    d.x = lerp(pv.x, b.x, u); d.z = lerp(pv.z, b.z, u); d.y = lerp(pv.y, b.y, u);
    d.h = wrapAngle(pv.h + angleDelta(pv.h, b.h) * u);
    if (Number.isFinite(t)) {
      const tr = this.track;
      while (tr.length && t <= tr[tr.length - 1].t) tr.pop();
      tr.push({ t, x: b.x, z: b.z, y: b.y, h: b.h });
      while (tr.length > 2 && tr[0].t < t - 2) tr.shift();
    }
  }

  /** Where we had him at a moment just past on the battle's clock. */
  at(t) {
    const tr = this.track;
    const b = this.body;
    if (!tr.length || t >= tr[tr.length - 1].t) return b;
    if (t <= tr[0].t) return tr[0];
    let i = tr.length - 1;
    while (i > 0 && tr[i - 1].t > t) i--;
    const p = tr[i - 1];
    const q = tr[i];
    const k = (t - p.t) / Math.max(1e-6, q.t - p.t);
    return { x: lerp(p.x, q.x, k), z: lerp(p.z, q.z, k), y: lerp(p.y, q.y, k), h: p.h + angleDelta(p.h, q.h) * k };
  }

  /**
   * The battle's word on where he was at `st`: `s` with `x, z, y, h`, and
   * whatever else of it is to be taken as it is (`take`).
   */
  correct(s, st, take = null) {
    if (!(st > this.lastST)) return;
    this.lastST = st;
    const b = this.body;
    const was = this.at(st);
    const ex = s.x - was.x;
    const ez = s.z - was.z;
    if (Math.hypot(ex, ez) > this.snapAt) {
      this.reset(s);
      if (take) take(b, s);
      return;
    }
    const near = Math.hypot(ex, ez) < this.dead;
    this.fix = {
      x: near ? 0 : ex, z: near ? 0 : ez, y: (s.y ?? was.y) - was.y,
      h: Number.isFinite(s.h) ? angleDelta(was.h, s.h) : 0,
    };
    if (take) take(b, s);
  }

  /** Put him where the battle has him, and forget where we had him. */
  reset(s) {
    const b = this.body;
    b.x = s.x; b.z = s.z;
    if (Number.isFinite(s.y)) b.y = s.y;
    if (Number.isFinite(s.h)) b.h = s.h;
    this.prev = { x: b.x, z: b.z, y: b.y, h: b.h };
    this.drawn = { ...this.prev };
    this.track = [];
    this.fix = null;
  }
}
