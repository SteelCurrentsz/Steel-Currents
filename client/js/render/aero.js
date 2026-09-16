// The interactive flight model: a take-off run, a pilot's hands, and a wreck.
//
// What a wing does in air is in `shared/aero.js`, because the simulation flies
// on it too. This is what sits on top of it and is only ever the client's: the
// deck run, the catapult stroke, the stick under somebody's thumb, and an
// aeroplane falling out of the sky with nobody flying her.
//
// Everything in the shared module is re-exported here, so the rest of the
// client goes on importing one aero module.

import {
  RHO, G, WIND_OVER_DECK, AERO, HEAVY_AERO,
  rollRate, rollTau, pitchTau, pitchRate, aspect, stallSpeed,
  lift, drag, thrust, clFor, alphaFor, flightAttitude, weathercock,
  wrapAngle, turnFor, holdBank,
} from '../../../shared/aero.js';

export {
  RHO, G, WIND_OVER_DECK, AERO, HEAVY_AERO,
  rollRate, rollTau, pitchTau, pitchRate, aspect, stallSpeed,
  lift, drag, thrust, clFor, alphaFor, flightAttitude, weathercock,
  turnFor, holdBank,
};

/**
 * A take-off run, integrated properly.
 *
 * She starts stopped on the deck with the wind already over her wing, opens up,
 * and rolls until the wing is carrying her. Rolling friction goes as the weight
 * still on her wheels, so it eases off as the lift builds -- which is why the
 * last part of the run is much quicker than the first.
 */
export class DeckRun {
  constructor(aero) {
    this.a = aero;
    this.v = 0;                        // over the deck
    this.run = 0;                      // metres of deck used
    this.vr = stallSpeed(aero, 1.35) * 1.06;   // rotate speed, flaps down
    this.flying = false;
  }

  /** One step. Returns how far she has rolled. */
  step(dt) {
    const a = this.a;
    const air = this.v + WIND_OVER_DECK;
    const w = a.mass * G;
    const cl = Math.min(a.clMax * 1.35, clFor(a, air));
    const L = lift(a, air, cl);
    const onWheels = Math.max(0, w - L);
    const roll = 0.03 * onWheels;      // tyres on planking
    const T = thrust(a, air);
    const D = drag(a, air, cl);
    this.v = Math.max(0, this.v + ((T - D - roll) / a.mass) * dt);
    this.run += this.v * dt;
    if (air >= this.vr) this.flying = true;
    return this.run;
  }

  /** Her airspeed, which is what the wing sees. */
  get airspeed() { return this.v + WIND_OVER_DECK; }
}

/**
 * A whole launch, integrated once and then read off.
 *
 * The evolution has to be a pure function of the time since the flag dropped --
 * the tests step it about, the shipyard freezes it, and two clients watching the
 * same ship must see the same aeroplane in the same place. So the physics is
 * run once, at a fixed step, and what comes out is a table: how far up the deck
 * she is at each moment, how high, how nose-up, and whether the wing has her.
 *
 * Returns `{ dt, rows }` where each row is `[distance, height, pitch, flying]`.
 */
export function launchProfile(aero, deckAhead) {
  const dt = 1 / 120;
  const run = new DeckRun(aero);
  const rows = [[0, 0, 0, 0]];
  let y = 0;
  let pitch = 0;
  let v = 0;
  let s = 0;
  let t = 0;
  while (t < 18) {
    t += dt;
    if (!run.flying) {
      run.step(dt);
      s = run.run;
      v = run.airspeed;
      // She comes up on her tail as the elevator bites, in the last of the run.
      const near = Math.max(0, (v / run.vr) - 0.86) / 0.14;
      pitch = Math.min(0.14, near * 0.14);
      rows.push([s, 0, pitch, 0]);
      continue;
    }
    // Off, and climbing on whatever thrust is left over. The height she makes
    // is the excess power divided by her weight, which is why she stays low
    // over the bow with a fish under her.
    const cl = clFor(aero, v);
    const T = thrust(aero, v);
    const D = drag(aero, v, cl);
    const best = Math.max(0.02, (T - D) / (aero.mass * G));
    pitch += Math.max(-0.5 * dt, Math.min(0.5 * dt, Math.min(0.22, best) - pitch));
    v += ((T - D) / aero.mass - G * Math.sin(pitch)) * dt;
    v = Math.max(stallSpeed(aero) * 0.95, v);
    s += v * Math.cos(pitch) * dt;
    y += v * Math.sin(pitch) * dt;
    rows.push([s, y, pitch, 1]);
    // Off, over the bow and climbing away: the evolution is over and whatever
    // flies her next takes her from here. Run on any further and the whole
    // launch cycle gets longer for pictures nobody is looking at.
    if (s > deckAhead + 25 && y > 18) break;
  }
  return { dt, rows };
}

/**
 * A catapult shot, integrated the same way a deck run is.
 *
 * A cruiser's floatplane cannot take herself off: she is put on a cradle and
 * thrown, sixty-odd knots in about seventy feet of track, which is two and a
 * half g in the small of the observer's back. So the run is not thrust against
 * drag -- it is the catapult's stroke -- and only what happens after the end
 * of the track is flying.
 *
 * Same shape of answer as `launchProfile`: `{ dt, rows }` with each row
 * `[distance, height, pitch, flying]`, distance measured along the track from
 * where she sat.
 */
export function catapultProfile(aero, stroke = 21) {
  const dt = 1 / 120;
  // Off the end at a comfortable margin over the stall, flaps down.
  const vEnd = stallSpeed(aero, 1.35) * 1.12;
  const acc = (vEnd * vEnd) / (2 * stroke);
  const rows = [[0, 0, 0, 0]];
  let s = 0;
  let v = 0;
  let y = 0;
  let pitch = 0;
  let t = 0;
  let off = false;
  while (t < 16) {
    t += dt;
    if (!off) {
      v = Math.min(vEnd, v + acc * dt);
      s = Math.min(stroke, s + v * dt);
      // She sits nose-up on the cradle and comes up a little more as she goes.
      pitch = 0.05 + 0.05 * (v / vEnd);
      rows.push([s, 0, pitch, 0]);
      if (s >= stroke - 1e-6) off = true;
      continue;
    }
    // Off the end of the track with barely enough speed: she sags towards the
    // water first and only starts climbing once she has a few knots in hand,
    // which is what a catapult launch looks like from the quarterdeck.
    const cl = clFor(aero, v);
    const T = thrust(aero, v);
    const D = drag(aero, v, cl);
    const best = (T - D) / (aero.mass * G);
    const want = Math.max(-0.06, Math.min(0.16, best));
    pitch += Math.max(-0.4 * dt, Math.min(0.4 * dt, want - pitch));
    v += ((T - D) / aero.mass - G * Math.sin(pitch)) * dt;
    v = Math.max(stallSpeed(aero) * 0.95, v);
    s += v * Math.cos(pitch) * dt;
    y += v * Math.sin(pitch) * dt;
    rows.push([s, y, pitch, 1]);
    if (s > stroke + 120 && y > 10) break;
  }
  return { dt, rows };
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
  constructor(aero, { x = 0, y = 300, z = 0, heading = 0, speed = null } = {}) {
    this.a = aero;
    this.x = x; this.y = y; this.z = z;
    this.heading = heading;
    this.pitch = 0;
    this.bank = 0;
    this.v = speed === null ? aero.vMax * 0.75 : speed;
    this.throttle = 1;
    // What the stick is asking for, -1 to 1: nose up positive, right roll
    // positive.
    this.stickPitch = 0;
    this.stickRoll = 0;
    // How fast she is actually rolling, in radians a second. A rate rather
    // than an angle, because that is what an aileron commands -- and a state
    // rather than a number worked out each frame, because she has inertia and
    // takes a moment to wind up to it and a moment to stop.
    this.roll = 0;
    // How hard the wing is being asked to work, in g, and how close that is to
    // letting go. The HUD reads both.
    this.g = 1;
    this.stall = 0;
    this.alive = true;
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
    const a = alphaFor(this.a, this.v, Math.max(0.2, Math.abs(this.g)));
    // Past the stall the wing has let go, and she stops flying at an angle of
    // attack and starts falling at one: the nose comes down toward her path
    // rather than standing further and further above it.
    const nose = this.pitch + a * (1 - 0.7 * this.stall);
    return Math.max(-1.5, Math.min(1.5, nose));
  }

  /**
   * One step of flying.
   *
   * Sub-stepped, because a stick hard over at three hundred knots turns her
   * fast enough that a whole frame of it in one go is visibly wrong.
   */
  step(dt, seaAt = 0) {
    const a = this.a;
    const h = Math.min(dt, 1 / 60);
    for (let n = 0, steps = Math.max(1, Math.ceil(dt / h)); n < steps; n++) {
      const s = Math.min(h, dt - n * h);
      if (s <= 0) break;
      this.substep(s, seaAt);
    }
    return this;
  }

  substep(s, seaAt) {
    const a = this.a;
    const vs = this.vStall;
    // How much authority she has: a control surface works on dynamic pressure,
    // so an aeroplane near the stall is soggy and one going flat out is
    // vicious. Below the stall she has almost nothing.
    const q = Math.min(1.6, Math.max(0.12, (this.v / (vs * 1.7)) ** 2));

    // Roll: the stick asks for a rate of roll, not an angle of bank.
    //
    // It used to ask for an angle. Stick hard over meant eighty-three degrees
    // and not one degree more, so there was no such thing as rolling past the
    // vertical -- and an aileron roll, a barrel roll, a roll off the top, or
    // simply flying her upside down for a moment were not things the aeroplane
    // could be made to do at all. That is not what an aileron does. It asks
    // for a rate, and she keeps going round for as long as it is held.
    //
    // The rate is hers: her helix angle wound up over her own span at her own
    // speed. And she does not get to it at once -- there is an aeroplane's
    // worth of inertia to start turning and the air has to damp her into a
    // steady roll, which is the roll mode and takes a sixth of a second on a
    // fighter and a third on a heavy.
    const held = Math.abs(this.stickRoll) > 0.03;
    // No `q` on this one. The helix angle already carries the whole of the
    // speed dependence -- that is what makes it the right number to store --
    // and multiplying by dynamic pressure on top of it counted her airspeed
    // twice and had a Wildcat rolling at a hundred and fifty degrees a second.
    const want = held
      ? this.stickRoll * rollRate(a, this.v)
      // Hands off she rolls level on her own dihedral, and slowly. Nine degrees
      // a second: a hard bank takes eight or nine seconds to come out of on its
      // own, which is what dihedral does -- it is a weak righting moment out of
      // sideslip, not a second pair of ailerons.
      //
      // And only from the right way up. An aeroplane on her back does not
      // right herself: she hangs there until the pilot rolls her out, which is
      // exactly why inverted flight is something a pilot holds rather than
      // something that happens to him.
      : (Math.abs(this.bank) < Math.PI * 0.55
        ? Math.max(-0.16, Math.min(0.16, -this.bank * 0.6)) : 0);
    const kr = 1 - Math.exp(-s / rollTau(a, this.v));
    this.roll += (want - this.roll) * kr;
    this.bank = wrapAngle(this.bank + this.roll * s);

    // Pitch. The stick asks for g; the wing decides whether it gets it.
    const rate = pitchRate(a) * q;
    // In a turn she needs more than one g just to hold her height, and the
    // instructor feeds that in so she does not fall out of every turn.
    //
    // Which way that g has to go depends on which way up she is. On her back
    // the lift points at the ground, so holding her level means pushing: a
    // negative g, not a bigger positive one.
    //
    // And there is a limit to how much the instructor will feed in. Past about
    // seventy degrees of bank the g needed to hold height runs away -- at
    // eighty-two it is seven and at ninety it is infinite -- and what a pilot
    // actually does there is pull as hard as he is going to and accept that he
    // is going downhill. That is what a hard turn costs, and it is why one
    // ends lower than it began.
    const c = Math.cos(this.bank);
    const HOLD_MAX = 4.5;
    const hold = Math.max(-HOLD_MAX, Math.min(HOLD_MAX,
      Math.abs(c) < 1e-3 ? Math.sign(c || 1) * HOLD_MAX : 1 / c));
    // Full back stick asks for everything the structure was stressed to and
    // not a pound more. It used to add the limit load factor on top of
    // whatever the bank was already asking for, so a Lancaster in a turn was
    // being asked for four g -- half as much again as her spar would take, on
    // an aeroplane with fourteen thousand pounds of bombs in the bay.
    const limit = a.gLimit ?? 5.5;
    const askG = hold + this.stickPitch * (limit - 1);
    // The most this wing can pull at this speed, which is a different question
    // from the most the structure will stand: near the stall the wing runs out
    // first and at speed the spar does.
    const wingG = Math.max(0.15, (this.v * this.v) / (vs * vs));
    const maxG = Math.min(wingG, limit);
    // And the most it will take the other way. A wing is built to be loaded
    // one way up: the negative limit on these airframes was around two fifths
    // of the positive one, which is why a pilot rolls and pulls rather than
    // pushing through.
    const minG = -Math.min(wingG, limit * 0.45);
    // She does not get it at once either. An elevator starts her pitching and
    // the tail damps her into a steady g, and on a heavy that is the better
    // part of half a second -- which is most of what "she should not react so
    // suddenly" means.
    const kp = 1 - Math.exp(-s / pitchTau(a, this.v));
    this.g += (Math.max(minG, Math.min(askG, maxG)) - this.g) * kp;
    // Buffet and departure: asking the wing for more than it has. The spar is
    // not the wing -- over-stressing her is not stalling her -- so this is
    // against what the wing will give and nothing else.
    this.stall = Math.max(0, Math.min(1, (askG - wingG) / Math.max(1, wingG * 0.5)));

    // The turn. The horizontal part of the lift pulls her round -- which is
    // why a turn costs speed and why she cannot turn at all inverted at low g.
    const turn = (G * this.g * Math.sin(this.bank)) / Math.max(18, this.v);
    this.heading = wrapAngle(this.heading + turn * s);
    // And the vertical part against gravity gives the climb rate.
    const gamma = (G * (this.g * Math.cos(this.bank) - Math.cos(this.pitch)))
      / Math.max(18, this.v);
    // Rate-limited, because an aeroplane has mass and a tailplane: she swings
    // her nose as fast as her elevator will move it and no faster. The limit
    // was worked out and then not used, so at speed she could snap from a
    // vertical dive to a vertical climb inside a frame.
    const dP = Math.max(-rate * s, Math.min(rate * s, gamma * s));
    this.pitch += dP;
    // Over the top.
    //
    // A loop, an Immelmann and a split-S all take her through the vertical,
    // and in a heading-pitch-bank frame that is where the arithmetic folds:
    // past ninety degrees of pitch she is going the other way round and upside
    // down. It used to be handled by clamping her a few degrees short of the
    // vertical, which is why she could be stood on her tail and no further and
    // why none of those manoeuvres was flyable. Fold the frame the way it
    // actually folds instead, and she goes over the top and comes out the
    // other side inverted, as she should.
    if (this.pitch > Math.PI / 2) {
      this.pitch = Math.PI - this.pitch;
      this.heading = wrapAngle(this.heading + Math.PI);
      this.bank = wrapAngle(this.bank + Math.PI);
    } else if (this.pitch < -Math.PI / 2) {
      this.pitch = -Math.PI - this.pitch;
      this.heading = wrapAngle(this.heading + Math.PI);
      this.bank = wrapAngle(this.bank + Math.PI);
    }

    // Energy: thrust against drag and the component of weight along the path.
    const cl = Math.min(a.clMax, clFor(a, this.v, Math.abs(this.g)));
    const T = thrust(a, this.v, this.throttle);
    const D = drag(a, this.v, cl) * (1 + this.stall * 2.2);
    this.v += ((T - D) / a.mass - G * Math.sin(this.pitch)) * s;
    // She can be slower than the stall -- that is what a stall is -- but not
    // stopped, and not faster than the airframe allows in a dive.
    this.v = Math.max(8, Math.min(a.vMax * 1.55, this.v));

    // A stalled wing drops the nose whether the pilot likes it or not.
    if (this.stall > 0.35 && this.v < vs * 1.05) {
      // Downwards, which on her back is towards her own canopy: the nose drops
      // relative to the earth and not relative to her.
      this.pitch -= 1.1 * this.stall * s * Math.sign(Math.cos(this.bank) || 1);
      this.bank += (this.bank >= 0 ? 1 : -1) * 0.5 * this.stall * s;
    }

    const ground = this.v * Math.cos(this.pitch);
    this.x += Math.sin(this.heading) * ground * s;
    this.z += Math.cos(this.heading) * ground * s;
    this.y += this.v * Math.sin(this.pitch) * s;
    // The sea is hard.
    if (this.y < seaAt + 2) {
      this.y = seaAt + 2;
      if (this.pitch < 0) this.pitch = 0;
      this.alive = false;
    }
  }
}

/**
 * Flying: a coordinated turn and a climb she has the power for.
 *
 * She banks to turn and the turn rate falls out of the bank -- g tan(phi) over
 * v -- so she cannot come round faster than her speed and her wing allow. She
 * climbs on whatever thrust is left after drag, which is why a loaded torpedo
 * bomber goes up like a lift with the brakes on.
 */
export class Airborne {
  constructor(aero, x, y, z, heading, speed) {
    this.a = aero;
    this.x = x; this.y = y; this.z = z;
    this.heading = heading;
    this.v = speed;
    this.bank = 0;
    this.pitch = 0;
  }

  /** Fly one step towards a point. */
  step(dt, tx, ty, tz) {
    const a = this.a;
    const h = Math.min(dt, 0.06);
    for (let n = 0; n < Math.ceil(dt / h); n++) {
      const step = Math.min(h, dt - n * h);
      if (step <= 0) break;
      // Where she wants to be pointed, and how far off she is.
      const want = Math.atan2(tx - this.x, tz - this.z);
      let err = want - this.heading;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      // Bank into it, up to sixty degrees, and roll at a rate a pilot could.
      const wantBank = Math.max(-1.05, Math.min(1.05, err * 2.4));
      this.bank += Math.max(-2.2 * step, Math.min(2.2 * step, wantBank - this.bank));
      // A coordinated turn: the horizontal part of the lift turns her.
      this.heading += (G * Math.tan(this.bank) / Math.max(20, this.v)) * step;

      // Climb on what is left after drag, and dive to trade height for speed.
      const cl = clFor(a, this.v, 1 / Math.max(0.3, Math.cos(this.bank)));
      const T = thrust(a, this.v);
      const D = drag(a, this.v, cl);
      const climbWant = Math.max(-0.32, Math.min(0.30, (ty - this.y) / 240));
      // The most she can climb at is the excess power divided by her weight.
      const best = Math.max(0, (T - D)) / (a.mass * G);
      const gamma = Math.max(-0.32, Math.min(best, climbWant));
      this.pitch += Math.max(-1.4 * step, Math.min(1.4 * step, gamma - this.pitch));
      this.v += ((T - D) / a.mass - G * Math.sin(this.pitch)) * step;
      this.v = Math.max(stallSpeed(a) * 0.92, Math.min(a.vMax, this.v));

      const ground = this.v * Math.cos(this.pitch);
      this.x += Math.sin(this.heading) * ground * step;
      this.z += Math.cos(this.heading) * ground * step;
      this.y += this.v * Math.sin(this.pitch) * step;
    }
    return this;
  }
}
