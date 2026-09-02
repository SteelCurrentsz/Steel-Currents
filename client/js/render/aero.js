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

export const RHO = 1.225;              // kg/m3, sea level
export const G = 9.80665;

/**
 * Wind over the deck.
 *
 * This is the whole reason a loaded Avenger gets off five hundred feet of deck.
 * A carrier turns into wind and works up to thirty knots to launch, so the air
 * is already going past the wing at forty-odd knots before she has moved: her
 * airspeed on the deck is her speed over it plus this.
 */
export const WIND_OVER_DECK = 22;      // m/s, about 43 knots

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
  },
  dauntless: {
    mass: 4320, wing: 30.2, span: 12.66, clMax: 1.50, cd0: 0.0300,
    thrust: 15200, vMax: 125, name: 'SBD-3',
  },
  avenger: {
    mass: 7210, wing: 45.5, span: 16.51, clMax: 1.60, cd0: 0.0310,
    thrust: 22400, vMax: 130, name: 'TBF-1',
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
    if (s > deckAhead + 60 && y > 24) break;
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
