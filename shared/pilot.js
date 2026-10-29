// An aeroplane with somebody in it, and the instructor who flies her.
//
// This used to be the client's alone: the one aeroplane under the player's
// hands was flown on a wing, a stick and a throttle, and every other fighter
// in the battle was a point on the chart turning at whatever its sustained
// rate came to. Nothing the simulation flew could roll past the vertical, go
// over the top of a loop, or get out of the way of a fighter on its tail.
//
// It lives in `shared` now so that both sides fly on it: the cockpit under a
// thumb, and the simulation's own fighter pilots when they are in a fight
// (see shared/dogfight.js). Same wing, same stick, same limits.

import {
  G, rollRate, rollTau, pitchTau, pitchRate, stallSpeed,
  thrust, drag, brakeDrag, clFor, alphaFor, wrapAngle,
} from './aero.js';

/** How much livelier a player's aeroplane is than her book figures. */
export const AGILITY = 1.6;

/** How long her dive brakes take to run all the way out, or all the way in. */
export const BRAKE_RUN = 1.5;

/** The most the rudder will skid her flight path round, in radians a second. */
const YAW_RATE = 0.24;

/**
 * The load she needs to hold her height at this bank, given its cosine.
 *
 * One over the cosine, which runs away towards the vertical, so a pilot pulls
 * as hard as he is going to past about seventy-five degrees and accepts going
 * downhill -- and on her back it is a push. It used to be cut off at four and a
 * half g and then turned straight over to minus four and a half the instant
 * she passed ninety degrees, which is nine g asked for in a single frame: she
 * bucked every time a hard turn went a degree past the vertical. Through the
 * last few degrees it now runs down to nothing and out the other side, which
 * is what a pilot's hand on the stick does.
 */
const HOLD_MAX = 4.5;
const HOLD_KNEE = 0.1;
export function holdG(cb) {
  if (Math.abs(cb) >= HOLD_KNEE) return Math.max(-HOLD_MAX, Math.min(HOLD_MAX, 1 / cb));
  return cb * (HOLD_MAX / HOLD_KNEE);
}

/**
 * An aeroplane with somebody in it.
 *
 * `Airborne` above is an autopilot: hand it a point and it goes there. This is
 * the other thing -- a flight model driven by a stick and a throttle, which is
 * what a player needs. It is deliberately the *simplified* model that a mobile
 * flight game uses, because that is what was asked for and because a full
 * six-degree-of-freedom aeroplane on a thumbstick is unflyable:
 *
 *   - the stick commands a pitch rate and a roll rate, not a control surface;
 *   - an instructor coordinates the turn with rudder, holds the nose up in a
 *     bank, and rolls the wings level when the stick is released;
 *   - the wing still has to do the work. Speed comes from thrust against drag
 *     and gravity down the flight path, the turn rate falls out of the bank
 *     and the speed the way a real coordinated turn does, and pulling harder
 *     than the wing will carry buffets and then stalls her.
 *
 * So she flies on her own energy: dive and she goes fast, haul her round at
 * low speed and she mushes and falls out of it. That is the part that has to
 * be real for the flying to be worth doing at all.
 */
export class Pilot {
  constructor(aero, {
    x = 0, y = 300, z = 0, heading = 0, speed = null, agility = AGILITY,
  } = {}) {
    this.a = aero;
    // How much livelier than her book figures she is under a player's hands.
    // A dogfight on a touch screen is fought at arm's length through an
    // instructor, and an aeroplane that answers at exactly her real roll and
    // pitch rates feels like a barge through that much indirection: she is
    // given a third again on both, and answers the controls quicker.
    this.agility = agility;
    this.x = x; this.y = y; this.z = z;
    this.heading = heading;
    this.pitch = 0;
    this.bank = 0;
    this.v = speed === null ? aero.vMax * 0.75 : speed;
    this.throttle = 1;
    // Her dive brakes, on a type that has them: whether the pilot has them
    // selected, and how far out they have got. They take a second and a half
    // to run out on their jacks and as long to come in, and nothing happens
    // on a type built without them.
    this.brakeCmd = false;
    this.brakes = 0;
    // What the stick is asking for, -1 to 1: nose up positive, right roll
    // positive.
    this.stickPitch = 0;
    this.stickRoll = 0;
    // The rudder, -1 to 1, positive the way positive roll turns her. Only the
    // instructor uses it (see `instruct`): the last few degrees onto a target
    // are trodden on with the feet, not rolled into, which is what makes a
    // mouse-aimed fighter sit steady on a mark instead of hunting round it.
    this.stickYaw = 0;
    // How fast she is actually rolling, in radians a second. A rate rather
    // than an angle, because that is what an aileron commands -- and a state
    // rather than a number worked out each frame, because she has inertia and
    // takes a moment to wind up to it and a moment to stop.
    this.roll = 0;
    // How hard the wing is being asked to work, in g, and how close that is to
    // letting go. The HUD reads both.
    this.g = 1;
    // The same, as her airframe has settled to it: what the angle her nose
    // stands off her path is drawn from. A wing takes a moment to take up a
    // load, and drawn off the instant figure her nose jerked up and down by
    // degrees in a frame whenever the stick was thrown from a pull to a push.
    this.gSeen = 1;
    this.stall = 0;
    this.alive = true;
    // The gale she is flying in, when there is one: {x, z} of wind in metres a
    // second and `rough`, how hard it throws her about. Set from outside every
    // frame (see shared/sea.js windAt); null in any weather short of one.
    this.gale = null;
    this.galeT = Math.random() * 100;
  }

  /** The speed below which this wing will not hold her up in level flight. */
  get vStall() { return stallSpeed(this.a); }

  /**
   * The angle her nose is at, which is not the angle she is going.
   *
   * `pitch` is her flight path -- where the aeroplane is actually travelling.
   * What you see of her is that plus the angle of attack her wing is working
   * at, and the difference is several degrees at cruise and fifteen or more
   * hanging on the stall. Drawn on the flight path alone she flew like a dart:
   * nose exactly along the path at every speed, and level flight at the point
   * of the stall drawn dead level.
   */
  get attitude() {
    // Off her nose as a direction, so it stays right all the way round a loop
    // and on her back -- where the angle of attack lowers the nose against the
    // earth rather than raising it.
    const n = this.body().n;
    return Math.asin(Math.max(-1, Math.min(1, n.y)));
  }

  /**
   * Her flight path and her way up, as vectors in the world.
   *
   * These are what she is actually flown on. `heading`, `pitch` and `bank`
   * are worked out from them after every step, for everything that reads her
   * as three angles -- and if anything writes to those three angles, the
   * frame is rebuilt from what was written before the next step.
   *
   * Three angles is how she used to be flown, and three angles cannot go
   * through the vertical: at ninety degrees of pitch the heading means
   * nothing, and every loop had to be folded over the top by hand -- heading
   * swung round half a turn and bank flipped on its back in the one step --
   * which is where she twitched at the top of every loop and the bottom of
   * every split-S, and why a turn near the vertical came out at the wrong
   * rate. A direction and an up have no such place.
   */
  frame() {
    if (!this.F || this.heading !== this._h || this.pitch !== this._p || this.bank !== this._b) {
      const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
      const cg = Math.cos(this.pitch), sg = Math.sin(this.pitch);
      const cb = Math.cos(this.bank), sb = Math.sin(this.bank);
      this.F = { x: sh * cg, y: sg, z: ch * cg };
      const u0x = -sh * sg, u0y = cg, u0z = -ch * sg;
      this.U = { x: cb * u0x + sb * ch, y: cb * u0y, z: cb * u0z - sb * sh };
      this._h = this.heading; this._p = this.pitch; this._b = this.bank;
    }
    return this;
  }

  /** Write the three angles back from the frame. */
  angles() {
    const F = this.F, U = this.U;
    const fy = Math.max(-1, Math.min(1, F.y));
    this.pitch = Math.asin(fy);
    // Straight up or straight down the heading is wherever it was: what
    // changes going through the vertical is the bank, and it is read off the
    // way up against that heading.
    if (Math.hypot(F.x, F.z) > 1e-5) this.heading = Math.atan2(F.x, F.z);
    const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
    const cg = Math.cos(this.pitch), sg = Math.sin(this.pitch);
    const u0x = -sh * sg, u0y = cg, u0z = -ch * sg;
    this.bank = Math.atan2(U.x * ch - U.z * sh, U.x * u0x + U.y * u0y + U.z * u0z);
    this._h = this.heading; this._p = this.pitch; this._b = this.bank;
  }

  /**
   * Where her nose is pointed, and the way up through her canopy, as unit
   * vectors: her flight path turned up toward her lift by the angle her wing
   * is working at. This is what she is drawn at and what her guns are laid
   * on, all the way round a loop and upside down.
   */
  body() {
    this.frame();
    const F = this.F, U = this.U;
    const a = this.attitudeAlpha();
    const c = Math.cos(a), s = Math.sin(a);
    return {
      n: { x: F.x * c + U.x * s, y: F.y * c + U.y * s, z: F.z * c + U.z * s },
      u: { x: U.x * c - F.x * s, y: U.y * c - F.y * s, z: U.z * c - F.z * s },
    };
  }

  /** The angle her nose stands off her flight path, toward her lift. */
  attitudeAlpha() {
    const g = this.gSeen ?? this.g;
    const a = alphaFor(this.a, this.v, Math.max(0.2, Math.abs(g)));
    // Past the stall the wing has let go, and she stops flying at an angle of
    // attack and starts falling at one.
    //
    // And it goes through nothing on its way from loaded one way to loaded
    // the other, as a wing does. Turned over on the sign of the load instead,
    // the nose jumped the whole of twice her angle of attack in one frame
    // every time she was pushed over the top of a climb or eased out of a
    // dive -- which is the twitch she had going up and coming down.
    const sign = Math.max(-1, Math.min(1, g / 0.6));
    return a * (1 - 0.7 * this.stall) * sign;
  }

  /**
   * One step of flying.
   *
   * Sub-stepped, because a stick hard over at three hundred knots turns her
   * fast enough that a whole frame of it in one go is visibly wrong.
   */
  step(dt, seaAt = 0, solid = null) {
    const h = Math.min(dt, 1 / 60);
    for (let n = 0, steps = Math.max(1, Math.ceil(dt / h - 1e-9)); n < steps && this.alive; n++) {
      const s = Math.min(h, dt - n * h);
      if (s <= 0) break;
      this.substep(s, seaAt, solid);
    }
    return this;
  }

  /**
   * `solid`, if given, says whether the line she flew this substep went into
   * anything hard ashore -- a hill, a house -- and where: she stops there,
   * as she does on the sea.
   */
  substep(s, seaAt, solid = null) {
    const a = this.a;
    this.frame();
    const F = this.F, U = this.U;
    const vs = this.vStall;
    // How much authority she has: a control surface works on dynamic pressure,
    // so an aeroplane near the stall is soggy and one going flat out is
    // vicious. Below the stall she has almost nothing.
    const q = Math.min(1.6, Math.max(0.12, (this.v / (vs * 1.7)) ** 2));

    // Roll: the stick asks for a rate of roll, not an angle of bank.
    //
    // It is an aileron: she keeps going round for as long as it is held,
    // which is what makes a roll, a barrel roll, a roll off the top and plain
    // inverted flight things she can be flown through. The rate is hers --
    // her helix angle wound up over her own span at her own speed -- and she
    // does not get to it at once: there is an aeroplane's worth of inertia to
    // start turning, and the air has to damp her into a steady roll.
    const held = Math.abs(this.stickRoll) > 0.03;
    const want = held
      ? this.stickRoll * rollRate(a, this.v) * this.agility
      // Hands off she rolls level on her own dihedral, and slowly -- and only
      // from the right way up. An aeroplane on her back does not right
      // herself: she hangs there until the pilot rolls her out.
      : (Math.abs(this.bank) < Math.PI * 0.55
        ? Math.max(-0.16, Math.min(0.16, -this.bank * 0.6)) : 0);
    const kr = 1 - Math.exp(-s / (rollTau(a, this.v) / this.agility));
    this.roll += (want - this.roll) * kr;
    // Positive roll is positive bank: her lift swung round toward the wing
    // she turns with, about her own flight path.
    rotate(U, F, -this.roll * s);

    // Pitch. The stick asks for g; the wing decides whether it gets it.
    const rate = pitchRate(a) * q * this.agility;
    // In a turn she needs more than one g just to hold her height, and the
    // instructor feeds that in so she does not fall out of every turn -- the
    // other way on her back, where holding her level is a push. Past about
    // seventy degrees of bank the g needed runs away, and what a pilot does
    // there is pull as hard as he is going to and accept going downhill.
    const hold = holdG(Math.cos(this.bank));
    // Full back stick asks for everything the structure was stressed to.
    const limit = a.gLimit ?? 5.5;
    const askG = hold + this.stickPitch * (limit - 1);
    // The most this wing can pull at this speed, which is a different question
    // from the most the structure will stand.
    const wingG = Math.max(0.15, (this.v * this.v) / (vs * vs));
    const maxG = Math.min(wingG, limit);
    // And the most it will take the other way: a wing is built to be loaded
    // one way up.
    const minG = -Math.min(wingG, limit * 0.45);
    const kp = 1 - Math.exp(-s / (pitchTau(a, this.v) / this.agility));
    this.g += (Math.max(minG, Math.min(askG, maxG)) - this.g) * kp;
    this.gSeen += (this.g - this.gSeen) * (1 - Math.exp(-s / 0.12));
    // Buffet and departure: asking the wing for more than it has.
    this.stall = Math.max(0, Math.min(1, (askG - wingG) / Math.max(1, wingG * 0.5)));

    // Where she is being pulled: her lift along her way up, the rudder's skid
    // along her wing, and gravity -- and the part of that square to her path
    // swings the path round, which is a turn, a climb, a loop or a dive
    // depending only on which way her lift is pointed.
    const v = Math.max(18, this.v);
    const W = cross(U, F);
    const yaw = this.stickYaw * YAW_RATE * Math.min(1.2, q) * v;
    let ax = G * this.g * U.x + yaw * W.x;
    let ay = G * this.g * U.y + yaw * W.y - G;
    let az = G * this.g * U.z + yaw * W.z;
    const along = ax * F.x + ay * F.y + az * F.z;
    ax -= along * F.x; ay -= along * F.y; az -= along * F.z;
    const acc = Math.hypot(ax, ay, az);
    if (acc > 1e-6) {
      // Rate-limited, because an aeroplane has mass and a tailplane: she
      // swings her nose as fast as her elevator will move it and no faster.
      const w = Math.min(acc / v, Math.max(rate, 0.35));
      const axis = cross(F, { x: ax / acc, y: ay / acc, z: az / acc });
      rotate(F, axis, w * s);
      rotate(U, axis, w * s);
    }

    // Energy: thrust against drag and the component of weight along the path.
    const cl = Math.min(a.clMax, clFor(a, this.v, Math.abs(this.g)));
    const T = thrust(a, this.v, this.throttle);
    // A skid is draggy, which is the price of treading her round.
    if (a.brake) {
      const want = this.brakeCmd ? 1 : 0;
      this.brakes += Math.max(-s / BRAKE_RUN, Math.min(s / BRAKE_RUN, want - this.brakes));
    } else this.brakes = 0;
    const D = drag(a, this.v, cl) * (1 + this.stall * 2.2 + Math.abs(this.stickYaw) * 0.25)
      + brakeDrag(a, this.v, this.brakes);
    this.v += ((T - D) / a.mass - G * F.y) * s;
    this.v = Math.max(8, Math.min(a.vMax * 1.55, this.v));

    // A stalled wing drops the nose whether the pilot likes it or not --
    // toward the earth, which on her back is toward her own canopy -- and a
    // wing goes first.
    if (this.stall > 0.35 && this.v < vs * 1.05) {
      const down = cross(F, { x: 0, y: -1, z: 0 });
      const dl = Math.hypot(down.x, down.y, down.z);
      if (dl > 1e-4) {
        const ang = 1.1 * this.stall * s;
        rotate(F, down, ang);
        rotate(U, down, ang);
      }
      rotate(U, F, -(this.roll >= 0 ? 1 : -1) * 0.5 * this.stall * s);
    }

    // A gale throws her about: the gusts kick her wings over and drop her and
    // lift her, and low over the sea that is a thing to be fighting all the
    // time. The air she is flying in is on its way somewhere, too, and carries
    // the whole of her with it.
    const gl = this.gale;
    let gx = 0, gz = 0, gy = 0;
    if (gl) {
      this.galeT += s;
      const t = this.galeT;
      const k = gl.rough || 0;
      gx = gl.x || 0; gz = gl.z || 0;
      rotate(U, F, -k * (0.32 * Math.sin(t * 2.3 + 0.4) + 0.18 * Math.sin(t * 5.7 + 1.9)) * s);
      const wing = cross(U, F);
      const kick = -k * (0.10 * Math.sin(t * 1.7 + 2.1) + 0.06 * Math.sin(t * 4.3)) * s;
      rotate(F, wing, kick);
      rotate(U, wing, kick);
      gy = k * (2.4 * Math.sin(t * 1.13) + 1.3 * Math.sin(t * 3.7 + 0.8));
    }
    orthonormal(F, U);

    const x0 = this.x, y0 = this.y, z0 = this.z;
    this.x += (F.x * this.v + gx) * s;
    this.z += (F.z * this.v + gz) * s;
    this.y += (F.y * this.v + gy) * s;
    const hit = solid ? solid(x0, y0, z0, this.x, this.y, this.z) : null;
    if (hit) {
      this.x = hit.x; this.y = hit.y; this.z = hit.z;
      this.alive = false;
      this.struck = hit;
      this.angles();
      return;
    }
    // The sea is hard.
    if (this.y < seaAt + 2) {
      this.y = seaAt + 2;
      if (F.y < 0) { F.y = 0; orthonormal(F, U); }
      this.alive = false;
    }
    this.angles();
  }
}

function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

/** Turn `v` about the unit vector `ax` by `ang` radians, in place. */
function rotate(v, ax, ang) {
  const l = Math.hypot(ax.x, ax.y, ax.z);
  if (l < 1e-9 || !ang) return v;
  const kx = ax.x / l, ky = ax.y / l, kz = ax.z / l;
  const c = Math.cos(ang), s = Math.sin(ang);
  const d = (kx * v.x + ky * v.y + kz * v.z) * (1 - c);
  const x = v.x * c + (ky * v.z - kz * v.y) * s + kx * d;
  const y = v.y * c + (kz * v.x - kx * v.z) * s + ky * d;
  const z = v.z * c + (kx * v.y - ky * v.x) * s + kz * d;
  v.x = x; v.y = y; v.z = z;
  return v;
}

/** Unit `F`, and `U` square to it and unit, against creeping arithmetic. */
function orthonormal(F, U) {
  let l = Math.hypot(F.x, F.y, F.z) || 1;
  F.x /= l; F.y /= l; F.z /= l;
  const d = U.x * F.x + U.y * F.y + U.z * F.z;
  U.x -= F.x * d; U.y -= F.y * d; U.z -= F.z * d;
  l = Math.hypot(U.x, U.y, U.z);
  if (l < 1e-6) {
    // Degenerate: pick any up square to her path.
    const t = Math.abs(F.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const w = cross(F, t);
    const u = cross(w, F);
    l = Math.hypot(u.x, u.y, u.z) || 1;
    U.x = u.x / l; U.y = u.y / l; U.z = u.z / l;
    return;
  }
  U.x /= l; U.y /= l; U.z /= l;
}


/**
 * The instructor: fly her at a point in the sky.
 *
 * This is mouse-aim, the way the big air-combat games fly a fighter from a
 * mouse or a thumb. The player does not hold a stick at all. He drags the
 * view, a marker sits where he is looking, and this works the stick, the
 * ailerons and the rudder to put the aeroplane's nose on it: rolling her into
 * the turn so her lift is pointed at the mark and pulling, treading the last
 * few degrees on with the rudder, and keeping her wings level when the mark is
 * dead ahead. Look left and she goes left; look up and she climbs.
 *
 * It is a pilot, not a cheat. Everything it does goes through the same stick,
 * throttle and wing as a pilot's hands would -- she still turns at the rate
 * her wing gives her, bleeds speed in a hard turn, and will not be pulled past
 * what the wing will carry. It just never asks for more than that: the pull is
 * held to the edge of the buffet, so she does not stall out of a turn the way
 * a thumb on a stick would have her.
 *
 * `aim` is a unit vector, in the world, of where the player wants her nose.
 * Headings run the game's way round: positive bank turns her towards rising
 * heading.
 */
export function instruct(p, aim) {
  // (Anything flown without a frame of its own is read off its three angles.)
  if (p.frame) p.frame();
  const F = p.F || pathOf(p);
  const U = p.U || upOf(p);
  // Her own axes: forward down her flight path, up through her canopy, and
  // out along the wing she turns towards with positive bank. Taken off the
  // vectors she is flown on, not rebuilt from three angles, so they mean the
  // same thing pointing straight up as they do level.
  const W = cross(U, F);
  // Where the mark is, in her own frame.
  const c = aim.x * F.x + aim.y * F.y + aim.z * F.z;
  const b = aim.x * U.x + aim.y * U.y + aim.z * U.z;
  const s = aim.x * W.x + aim.y * W.y + aim.z * W.z;
  const off = Math.acos(Math.max(-1, Math.min(1, c)));

  const a = p.a;
  const vs = stallSpeed(a);
  const v = Math.max(20, p.v);
  const wingG = (v * v) / (vs * vs);
  const limit = a.gLimit ?? 5.5;
  const span = Math.max(1, limit - 1);
  const agility = p.agility || 1;
  const rmax = Math.max(0.1, rollRate(a, p.v) * agility);
  // How long she takes to answer the ailerons and the elevator. The stick is
  // worked against where she will be once she has answered, not where she is:
  // she has a roll on and a pull on, and a pilot who waits until the wing is
  // where he wants it before he takes them off goes past it, comes back, and
  // goes past it again -- which on the screen is an aeroplane that wags.
  const tauR = rollTau(a, p.v) / agility;
  const tauP = pitchTau(a, p.v) / agility;
  const cb = Math.cos(p.bank);
  // The g she needs just to hold her height in the bank she is in, which the
  // flight model feeds in on its own (see Pilot.substep).
  const hold = holdG(cb);
  // And never past the buffet: the most the wing will give, less that.
  const top = Math.max(0, (Math.min(wingG * 0.92, limit) - hold) / span);

  // ---- a mark near the horizon: a turn ------------------------------------
  // Bank into it the way a pilot does -- as far as the wing will hold her up
  // and no further, so she comes round on the edge of the buffet without
  // falling out of it -- and work the nose up or down onto it with the stick.
  const yawErr = wrapAngle(Math.atan2(aim.x, aim.z) - p.heading);
  const aimGamma = Math.asin(Math.max(-1, Math.min(1, aim.y)));
  // How far the mark is round from her, as an angle in the sky rather than a
  // difference of headings: up off the horizon the same heading difference is
  // a great deal less of a turn, and flown as though it were not she banked
  // hard for a mark only a few degrees off her nose and swung past it.
  const side = yawErr * Math.cos(aimGamma);
  const most = Math.min(1.40, wingG * 0.9 > 1.02 ? Math.acos(1 / (wingG * 0.9)) : 0.2);
  const wantBank = Math.max(-most, Math.min(most, side * 4.0));
  const rollT = ((wrapAngle(wantBank - p.bank) - p.roll * tauR) * 5.5) / rmax;
  // The nose, in the vertical. Pulling in a bank lifts her nose along her own
  // up, which is only partly the world's, so it takes more in a steep one --
  // and nothing at all on her wing tip, where the elevator moves her nose
  // along the horizon. That runs smoothly through the vertical bank: turned
  // over on the sign of the cosine there it reversed the stick in a frame.
  const climbing = (G * (p.g * cb - Math.cos(p.pitch))) / v;
  const gErr = aimGamma - p.pitch - climbing * tauP;
  const lift = cb / Math.max(cb * cb, 0.35 * 0.35);
  const pitchT = ((gErr * 3.2 * v) / G / span) * lift;
  // Rudder, for the last few degrees: a skid onto the mark instead of a roll.
  const yawT = Math.max(-1, Math.min(1, side * 9)) * (1 - smooth(0.05, 0.25, Math.abs(side)));

  // ---- a mark well above or below: over the top ---------------------------
  // Roll until her lift points at it and pull, which is how a loop, an
  // Immelmann and a split-S are all flown.
  let rollTo = Math.atan2(s, b);
  // Dead under her canopy's floor the two ways round are the same distance,
  // and the noise between them threw the stick from one to the other: she goes
  // on round the way she is already rolling.
  if (Math.abs(rollTo) > 2.6 && p.roll * rollTo < 0 && Math.abs(p.roll) > 0.15) {
    rollTo -= Math.sign(rollTo) * Math.PI * 2;
  }
  // And with the mark on her nose there is nothing to roll towards: which way
  // it lies from a point it is sitting on is whichever way the last rounding
  // error went, and that slammed the ailerons from stop to stop the moment
  // she arrived on anything above or below her. Close in she is laid on with
  // the elevator and the rudder instead, the way the last few degrees of any
  // shot are.
  const far = smooth(0.04, 0.22, off);
  const rollV = ((rollTo * far - p.roll * tauR) * 5.5) / rmax;
  // Pull to the mark once her lift is on it; close in, up or down onto it.
  // How fast her path is already swinging toward her canopy is taken off, and
  // so is what gravity is already doing across her path -- pointed straight up
  // she needs no g at all to go on pointing straight up.
  const swinging = (G * (p.g - U.y)) / v;
  const pull = far * off * Math.max(0, Math.cos(rollTo)) + (1 - far) * Math.atan2(b, Math.max(1e-3, c));
  const pitchV = (U.y - hold + ((pull - swinging * tauP) * 3.2 * v) / G) / span;
  const yawV = Math.max(-1, Math.min(1, s * 9)) * (1 - far);

  // A heavy bomber is not looped or split-essed: whatever the mark, she is
  // flown round in a turn and pushed or pulled onto it.
  //
  // And a mark a long way off her nose is flown the same way, wherever it is.
  // Turning flat onto something behind her works from level flight; from the
  // bottom of a loop, nose down with the mark level behind her, it is a
  // diving spiral that never comes out. Putting her lift on the mark and
  // pulling always does. So is anything with her own nose near the vertical,
  // where her heading is whichever way the last rounding error left it.
  const k = (a.gLimit ?? 5.5) > 3.2
    ? Math.max(
      smooth(0.42, 0.62, Math.abs(aim.y)),
      smooth(1.0, 1.5, off) * smooth(0.25, 0.5, -p.pitch),
      smooth(0.95, 1.25, Math.abs(p.pitch)),
    )
    : 0;
  p.stickRoll = Math.max(-1, Math.min(1, rollT + (rollV - rollT) * k));
  p.stickPitch = Math.max(-0.55, Math.min(top, 1, pitchT + (pitchV - pitchT) * k));
  p.stickYaw = yawT + (yawV - yawT) * k;
  return off;
}

function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * How hard the stick can be pulled without the wing letting go.
 *
 * The same sum the instructor makes: the most the wing will give at this
 * speed, kept a little short of the buffet and never past the spar, less what
 * holding her height in this bank already takes. A manoeuvre flown at this is
 * flown on the edge of the buffet, which is where a good pilot flies one.
 */
export function pullTop(p) {
  const a = p.a;
  const vs = stallSpeed(a);
  const v = Math.max(20, p.v);
  const wingG = (v * v) / (vs * vs);
  const limit = a.gLimit ?? 5.5;
  const hold = holdG(Math.cos(p.bank));
  return Math.max(0, Math.min(1, (Math.min(wingG * 0.92, limit) - hold) / Math.max(1, limit - 1)));
}

/**
 * The set pieces.
 *
 * Mouse-aim flies her at a point, and that is most of flying. What it cannot
 * do is the handful of things a fighter pilot does with his hands rather than
 * his eyes -- roll her right round to spoil a gunner's aim, haul her over the
 * top, roll her on her back and pull through to reverse and lose height --
 * because none of them is "point the nose at that". Each of these is a short
 * script for the stick, flown through the same wing as everything else: she
 * rolls at her own rate, she pulls to the edge of the buffet and no further,
 * and a loop started too slow hangs at the top exactly the way a real one
 * does.
 *
 *   roll       an aileron roll: the stick hard over and held, round once
 *   barrel     nose up, then rolled round while pulling, so she corkscrews
 *              round a point ahead of her rather than about her own axis
 *   loop       wings level, then pulled right round
 *   immelmann  half a loop and rolled out on top: height for a reversal
 *   splitS     rolled on her back and pulled through: height for a reversal
 *   break      the hardest turn she has, one way, for a couple of seconds
 *   scissors   rolled hard one way and then the other, pulling all the time
 */
export const MANEUVERS = ['roll', 'barrel', 'loop', 'immelmann', 'splitS', 'break', 'scissors'];

/** Start one. `dir` is which way it rolls or turns: 1 right, -1 left. */
export function startManeuver(p, kind, dir = 1) {
  if (!MANEUVERS.includes(kind)) return false;
  const cg = Math.cos(p.pitch);
  p.man = {
    kind, dir: dir < 0 ? -1 : 1, t: 0, stage: 0,
    // How far her flight path has swung, and how far she has rolled, since it
    // started -- which is what says when a loop is a loop and a roll a roll.
    turned: 0, rolled: 0,
    fx: Math.sin(p.heading) * cg, fy: Math.sin(p.pitch), fz: Math.cos(p.heading) * cg,
  };
  return true;
}

/** Stop one, wherever she is in it. */
export function endManeuver(p) { p.man = null; }

/**
 * Work the stick for the manoeuvre she is in. Call once a frame before
 * `step`; returns false (and clears it) once it is flown.
 */
export function flyManeuver(p, dt) {
  const m = p.man;
  if (!m) return false;
  m.t += dt;
  // Where she has got to since the last frame.
  const cg = Math.cos(p.pitch);
  const fx = Math.sin(p.heading) * cg, fy = Math.sin(p.pitch), fz = Math.cos(p.heading) * cg;
  const dot = Math.max(-1, Math.min(1, fx * m.fx + fy * m.fy + fz * m.fz));
  m.turned += Math.acos(dot);
  m.fx = fx; m.fy = fy; m.fz = fz;
  m.rolled += Math.abs(p.roll) * dt;
  const top = pullTop(p);
  const rmax = Math.max(0.1, rollRate(p.a, p.v) * (p.agility || 1));
  // Roll her to a bank and hold it there.
  const rollTo = (bank) => Math.max(-1, Math.min(1, (wrapAngle(bank - p.bank) * 5) / rmax));
  let stickRoll = 0;
  let stickPitch = 0;
  let done = false;
  const TWO_PI = Math.PI * 2;
  switch (m.kind) {
    case 'roll':
      stickRoll = m.dir;
      // A touch of back stick while she is the right way up and a touch of
      // forward while she is on her back, so the nose does not fall away.
      stickPitch = 0.1 * Math.cos(p.bank);
      if (m.rolled >= TWO_PI * 0.97) done = true;
      break;
    case 'barrel':
      if (m.stage === 0) {
        // Nose up first: a barrel roll goes round a point above and ahead.
        stickRoll = rollTo(0);
        stickPitch = top * 0.85;
        if (m.turned > 0.32 || m.t > 1.2) { m.stage = 1; m.rolled = 0; }
      } else {
        stickRoll = m.dir * 0.8;
        stickPitch = top * 0.5;
        if (m.rolled >= TWO_PI * 0.95) done = true;
      }
      break;
    case 'loop':
      if (m.stage === 0) {
        stickRoll = rollTo(0);
        if (Math.abs(wrapAngle(p.bank)) < 0.12 || m.t > 1.2) { m.stage = 1; m.turned = 0; }
      } else {
        stickPitch = Math.max(0.35, top);
        if (m.turned >= TWO_PI * 0.93) done = true;
      }
      break;
    case 'immelmann':
      if (m.stage === 0) {
        stickRoll = rollTo(0);
        if (Math.abs(wrapAngle(p.bank)) < 0.12 || m.t > 1.2) { m.stage = 1; m.turned = 0; }
      } else if (m.stage === 1) {
        stickPitch = Math.max(0.35, top);
        if (m.turned >= Math.PI * 0.94) { m.stage = 2; m.rolled = 0; }
      } else {
        // Half a roll out, the right way up and going back the way she came.
        stickRoll = m.rolled < 1.5 ? m.dir : rollTo(0);
        if (m.rolled > 1.5 && Math.abs(wrapAngle(p.bank)) < 0.15) done = true;
      }
      break;
    case 'splitS':
      if (m.stage === 0) {
        stickRoll = m.rolled < 1.5 ? m.dir : rollTo(Math.PI);
        if (Math.abs(wrapAngle(p.bank - Math.PI)) < 0.2) { m.stage = 1; m.turned = 0; }
      } else {
        stickPitch = Math.max(0.35, top);
        if (m.turned >= Math.PI * 0.92) done = true;
      }
      break;
    case 'break':
      stickRoll = rollTo(m.dir * 1.35);
      stickPitch = top;
      if (m.t > 2.4) done = true;
      break;
    case 'scissors':
      // Reverse every second and a bit: each reversal puts her nose across
      // the other man's path and makes him overshoot or out-turn himself.
      stickRoll = rollTo((Math.floor(m.t / 1.3) % 2 ? -1 : 1) * m.dir * 1.4);
      // Pulling only while she is banked over: hauled back through wings
      // level she would simply go straight up.
      stickPitch = top * 0.9 * Math.min(1, Math.abs(Math.sin(p.bank)) * 1.4);
      if (m.t > 5.2) done = true;
      break;
    default:
      done = true;
  }
  // However it was flown, it is over in a quarter of a minute: a loop that
  // has hung at the top for that long has turned into something else.
  if (m.t > 16) done = true;
  if (done) { p.man = null; return false; }
  p.stickRoll = stickRoll;
  p.stickPitch = stickPitch;
  p.stickYaw = 0;
  return true;
}

/** Her flight path as a unit vector in the world. */
export function pathOf(p) {
  const cg = Math.cos(p.pitch);
  return { x: Math.sin(p.heading) * cg, y: Math.sin(p.pitch), z: Math.cos(p.heading) * cg };
}

/** And the way up through her canopy, which is where her lift points. */
export function upOf(p) {
  const ch = Math.cos(p.heading), sh = Math.sin(p.heading);
  const cg = Math.cos(p.pitch), sg = Math.sin(p.pitch);
  const cb = Math.cos(p.bank), sb = Math.sin(p.bank);
  const u0x = -sh * sg, u0y = cg, u0z = -ch * sg;
  return { x: cb * u0x + sb * ch, y: cb * u0y, z: cb * u0z - sb * sh };
}
