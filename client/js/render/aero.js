// What a wing does in air.
//
// The aircraft used to be moved along a path: so many metres of deck in so many
// seconds, and a height curve fitted to look right. Nothing about it knew what
// an aeroplane is, so nothing about it could be right for the wrong reasons --
// she left the deck at the same point whatever she weighed, and turned as fast
// as the script said rather than as fast as her wing would let her.
//
// This is the small amount of aerodynamics it takes to fix that: lift and drag
// off a real wing area, thrust from a propeller that makes less of it the faster
// she goes, and a turn rate that falls out of the bank angle the way a
// coordinated turn actually does. The coefficients are the real machines'.

/** Wrap to -PI..PI, so a heading can be added to for ever. */
function wrapAngle(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

export const RHO = 1.225;              // kg/m3, sea level
export const G = 9.80665;

/**
 * Wind over the deck.
 *
 * This is the whole reason a loaded Avenger gets off five hundred feet of deck.
 * A carrier turns into wind and works up to thirty knots to launch, so the air
 * is already going past the wing before she has moved: her airspeed on the deck
 * is her speed over it plus this.
 *
 * Thirty knots is a launching carrier's own speed through the water with very
 * little natural wind in it, which is the honest figure. It used to be
 * forty-three, and that is a great deal of free airspeed: a loaded Avenger
 * unstuck in fifty-eight metres, which is a fifth of the Enterprise's flight
 * deck. She takes the whole of it now, as she did.
 */
export const WIND_OVER_DECK = 15.4;    // m/s, thirty knots

/**
 * The three types, to their own weights and wings.
 *
 * `thrust` is static thrust at full power; it falls away with speed, which is
 * what a propeller does. `vMax` is level top speed.
 */
export const AERO = {
  wildcat: {
    mass: 3610, wing: 24.2, span: 11.58, clMax: 1.55, cd0: 0.0250,
    thrust: 15600, vMax: 143, name: 'F4F-4',
    // How she handles: roll and pitch rates in radians a second at fighting
    // speed, how far over she will go, and what the airframe will take.
    rollRate: 2.9, pitchRate: 1.35, bankMax: 1.45, gLimit: 6.0,
  },
  dauntless: {
    mass: 4320, wing: 30.2, span: 12.66, clMax: 1.50, cd0: 0.0300,
    thrust: 15200, vMax: 125, name: 'SBD-3',
    rollRate: 2.1, pitchRate: 1.15, bankMax: 1.35, gLimit: 5.0,
  },
  avenger: {
    mass: 7210, wing: 45.5, span: 16.51, clMax: 1.60, cd0: 0.0310,
    thrust: 22400, vMax: 130, name: 'TBF-1',
    // A loaded torpedo bomber is a bus. She rolls slowly and she will not be
    // hauled about, which is exactly why she needs the fighters.
    rollRate: 1.5, pitchRate: 0.85, bankMax: 1.15, gLimit: 4.0,
  },
  // The cruiser's scout. Four hundred and fifty horsepower and a great float
  // hung under her, so she is slow and draggy -- and much too slow to get off
  // anything, which is exactly why she is shot off a catapult instead.
  kingfisher: {
    mass: 2600, wing: 24.3, span: 10.95, clMax: 1.50, cd0: 0.0410,
    thrust: 9000, vMax: 74, name: 'OS2U-3',
    rollRate: 1.6, pitchRate: 0.95, bankMax: 1.15, gLimit: 4.0,
  },
};

/** Aspect ratio: span squared over wing area, which is where induced drag comes from. */
export function aspect(a) { return (a.span * a.span) / a.wing; }

/** The speed below which the wing will not hold her up. */
export function stallSpeed(a, flaps = 1) {
  return Math.sqrt((2 * a.mass * G) / (RHO * a.wing * a.clMax * flaps));
}

/** Lift, in newtons. */
export function lift(a, v, cl) { return 0.5 * RHO * v * v * a.wing * cl; }

/** Drag, in newtons: what she has at zero lift, plus what the lift costs her. */
export function drag(a, v, cl) {
  const cd = a.cd0 + (cl * cl) / (Math.PI * aspect(a) * 0.78);
  return 0.5 * RHO * v * v * a.wing * cd;
}

/** Thrust, in newtons. A propeller makes most of it standing still. */
export function thrust(a, v, throttle = 1) {
  return a.thrust * throttle * Math.max(0.28, 1 - 0.52 * (v / a.vMax));
}

/** The lift coefficient she needs to hold her weight up at this speed. */
export function clFor(a, v, load = 1) {
  if (v < 1) return a.clMax;
  return Math.min(a.clMax, (2 * a.mass * G * load) / (RHO * v * v * a.wing));
}

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
    // How hard the wing is being asked to work, in g, and how close that is to
    // letting go. The HUD reads both.
    this.g = 1;
    this.stall = 0;
    this.alive = true;
  }

  /** The speed below which this wing will not hold her up in level flight. */
  get vStall() { return stallSpeed(this.a); }

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

    // Roll. A fighter rolls fast; a loaded torpedo bomber does not.
    const rollRate = (a.rollRate ?? 2.6) * q;
    const wantBank = this.stickRoll * (a.bankMax ?? 1.35);
    // The instructor: hands off, she rolls level on her own dihedral.
    const target = Math.abs(this.stickRoll) > 0.03 ? wantBank : 0;
    const dB = Math.max(-rollRate * s, Math.min(rollRate * s, target - this.bank));
    this.bank += dB;

    // Pitch. The stick asks for g; the wing decides whether it gets it.
    const pitchRate = (a.pitchRate ?? 1.15) * q;
    // In a bank she needs more than one g just to hold her height, and the
    // instructor feeds that in so she does not fall out of every turn.
    const hold = 1 / Math.max(0.25, Math.cos(this.bank));
    const askG = hold + this.stickPitch * (a.gLimit ?? 5.5);
    // The most this wing can pull at this speed.
    const maxG = Math.max(0.15, (this.v * this.v) / (vs * vs));
    this.g = Math.max(-1.5, Math.min(askG, maxG));
    // Buffet and departure: asking for more than the wing has.
    this.stall = Math.max(0, Math.min(1, (askG - maxG) / Math.max(1, maxG * 0.5)));

    // The turn. The horizontal part of the lift pulls her round -- which is
    // why a turn costs speed and why she cannot turn at all inverted at low g.
    const turn = (G * this.g * Math.sin(this.bank)) / Math.max(18, this.v);
    this.heading = wrapAngle(this.heading + turn * s);
    // And the vertical part against gravity gives the climb rate.
    const gamma = (G * (this.g * Math.cos(this.bank) - Math.cos(this.pitch)))
      / Math.max(18, this.v);
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + gamma * s));

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
      this.pitch -= 1.1 * this.stall * s;
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
