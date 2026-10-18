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
import { Pilot, AGILITY, instruct } from '../../../shared/pilot.js';

export {
  RHO, G, WIND_OVER_DECK, AERO, HEAVY_AERO,
  rollRate, rollTau, pitchTau, pitchRate, aspect, stallSpeed,
  lift, drag, thrust, clFor, alphaFor, flightAttitude, weathercock,
  turnFor, holdBank,
  Pilot, AGILITY, instruct,
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
 * Three parts to it, the way every deck launch looked from the island. The
 * run, slow at first and quicker as the wing takes her weight off the wheels.
 * The wheels coming off the planking short of the bow, and the few feet of
 * height the cushion of air between the wing and the deck holds her at. And
 * the bow going past under her: the cushion goes with it, she settles towards
 * the water by a few metres with her nose still up, and only when she has
 * built a few more knots does she climb away. That sag off the bow is the
 * whole look of a loaded aeroplane leaving a carrier.
 *
 * Returns `{ dt, rows, vr, bow }` where each row is
 * `[distance, height, pitch, flying, speed]`, `vr` is the speed she flies at
 * and `bow` is the time she crosses the bow.
 */
export function launchProfile(aero, deckAhead) {
  const dt = 1 / 120;
  const run = new DeckRun(aero);
  const rows = [[0, 0, 0, 0, 0]];
  let y = 0;
  let pitch = 0;
  let v = 0;
  let s = 0;
  let t = 0;
  let vy = 0;
  let bow = -1;
  // How long the sag off the bow lasts, and how fast she sinks at the worst of it.
  const SAG = 2.0;
  const SINK = 3.2;
  while (t < 24) {
    t += dt;
    if (!run.flying) {
      run.step(dt);
      s = run.run;
      v = run.airspeed;
      // She comes up on her tail as the elevator bites, in the last of the run.
      const near = Math.max(0, (v / run.vr) - 0.86) / 0.14;
      pitch = Math.min(0.14, near * 0.14);
      rows.push([s, 0, pitch, 0, run.v]);
      continue;
    }
    const cl = clFor(aero, v);
    const T = thrust(aero, v);
    const D = drag(aero, v, cl);
    const best = Math.max(0.02, (T - D) / (aero.mass * G));
    const over = s < deckAhead;
    if (over) {
      // Off the wheels and over the deck still, in ground effect: she holds a
      // couple of metres and lets the speed come.
      pitch += Math.max(-0.5 * dt, Math.min(0.5 * dt, 0.12 - pitch));
      vy += ((2.2 - y) * 1.6 - vy) * Math.min(1, dt * 3);
    } else {
      if (bow < 0) bow = t;
      const k = t - bow;
      if (k < SAG) {
        // The bow has gone and the cushion with it. Nose up, sinking.
        pitch += Math.max(-0.4 * dt, Math.min(0.4 * dt, 0.13 - pitch));
        const want = -SINK * Math.sin(Math.PI * Math.min(1, k / SAG));
        vy += (want - vy) * Math.min(1, dt * 4);
      } else {
        // And away, on whatever thrust is left over. The height she makes is
        // the excess power divided by her weight, which is why she stays low
        // with a fish under her.
        pitch += Math.max(-0.5 * dt, Math.min(0.5 * dt, Math.min(0.22, best + 0.06) - pitch));
        vy += (v * Math.min(0.22, best) - vy) * Math.min(1, dt * 1.5);
      }
    }
    v += ((T - D) / aero.mass - G * (vy / Math.max(1, v))) * dt;
    v = Math.max(stallSpeed(aero) * 0.95, v);
    s += Math.sqrt(Math.max(0, v * v - vy * vy)) * dt;
    y += vy * dt;
    rows.push([s, y, pitch, 1, v - WIND_OVER_DECK]);
    // Off, past the sag and climbing away: the evolution is over and whatever
    // flies her next takes her from here. Run on any further and the whole
    // launch cycle gets longer for pictures nobody is looking at.
    if (bow >= 0 && t - bow > SAG + 1.2 && vy > 1) break;
  }
  return { dt, rows, vr: run.vr - WIND_OVER_DECK, bow };
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

