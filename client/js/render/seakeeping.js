// How a hull behaves in a seaway.
//
// The sea does not set a ship's attitude. It pushes her towards one, and what
// she does about it is her own business: she has a righting moment and a great
// deal of mass, so she swings at her own period and goes on swinging after the
// wave that started it has run out from under her.
//
// Both halves of that scale with her size, and that is the whole point of this
// file. Sampling the water under four points of a hull -- which is what used to
// decide her attitude on its own -- cannot tell a destroyer from a battleship,
// because the swell running here is the better part of a kilometre long and its
// slope across twelve metres of destroyer is the same slope as across
// thirty-three of battleship. Every ship in the fleet took the same three and a
// half degrees of roll and the same two and a half of pitch. Size has to tell.

/**
 * Her natural roll period, in seconds.
 *
 * A hull rolls like a pendulum whose length is set by her beam and her
 * stability, and for a warship the two together come out at a little under
 * three root-beam: about nine seconds for a Fletcher, sixteen for an Iowa.
 */
export function rollPeriod(beam) { return 2.7 * Math.sqrt(beam); }

/**
 * Her natural pitch period, in seconds.
 *
 * Pitch is a much shorter, much stiffer motion than roll -- she has far more
 * righting moment fore and aft than she has athwartships -- and it goes with
 * her length: about five seconds for a destroyer and seven for a battleship.
 */
export function pitchPeriod(length) { return 0.44 * Math.sqrt(length) * 1.02; }

/**
 * How much of the sea's slope reaches her athwartships.
 *
 * A destroyer is shorter than the swell running under her and lies along it, so
 * she takes very nearly all of it. A battleship spans several waves at once and
 * their slopes cancel out under her bottom before they are ever a heeling
 * moment -- and what is left has a much stiffer ship to shift.
 */
export function rollHeed(length) {
  return Math.min(1, Math.max(0.16, Math.pow(115 / length, 1.3)));
}

/**
 * How much of it reaches her fore and aft, which is much less.
 *
 * Pitch falls away far faster with length than roll does, because a ship only
 * pitches to a wave of about her own length: put a two-hundred-and-sixty-metre
 * carrier in a hundred-metre sea and the crests under her bow and her stern
 * cancel, and she goes through it flat. That is why a destroyer's bow is in the
 * air and Enterprise, in the same water, is not moving.
 */
export function pitchHeed(length) {
  return Math.min(1, Math.max(0.09, Math.pow(108 / length, 2.1)));
}

/**
 * One hull's motion in the water, integrated frame by frame.
 *
 * Roll and pitch are each a lightly damped spring driven by the slope of the
 * sea; heave is not, because heave is flotation and a ship that does not follow
 * the water in heave is a ship with daylight under her.
 */
export class Seakeeping {
  constructor(hull) {
    this.rollW = (Math.PI * 2) / rollPeriod(hull.beam);
    this.pitchW = (Math.PI * 2) / pitchPeriod(hull.length);
    this.rollHeed = rollHeed(hull.length);
    this.pitchHeed = pitchHeed(hull.length);
    this.roll = 0;
    this.rollV = 0;
    this.pitch = 0;
    this.pitchV = 0;
  }

  /**
   * Take one frame of it.
   *
   * `att` is what the water under her is doing -- the pitch and roll of the
   * surface itself. `heel` is anything holding her over that is not the sea: a
   * rudder hard across, which lays a ship into her turn.
   */
  step(att, dt, heel = 0) {
    // Sub-stepped, so a long frame neither blows the springs up nor runs her
    // motion in slow motion.
    const n = Math.min(8, Math.max(1, Math.ceil(dt / 0.04)));
    const h = dt / n;
    const rollTo = att.roll * this.rollHeed + heel;
    const pitchTo = att.pitch * this.pitchHeed;
    for (let i = 0; i < n; i++) {
      // Roll is lightly damped: critically damped, she would simply track the
      // water and there would be no roll to watch at all.
      this.rollV += (this.rollW * this.rollW * (rollTo - this.roll)
        - 2 * ROLL_ZETA * this.rollW * this.rollV) * h;
      this.roll += this.rollV * h;
      // Pitch is not. A ship pitches into a wave and stops there; she does not
      // go on nodding after it, and a hull that did would look like a toy.
      this.pitchV += (this.pitchW * this.pitchW * (pitchTo - this.pitch)
        - 2 * PITCH_ZETA * this.pitchW * this.pitchV) * h;
      this.pitch += this.pitchV * h;
    }
    return this;
  }
}

const ROLL_ZETA = 0.13;
const PITCH_ZETA = 1.25;
