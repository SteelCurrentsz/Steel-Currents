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
 * she takes much more of it than a battleship, which spans several waves at
 * once and has their slopes cancel out under her bottom before they are ever a
 * heeling moment -- and what is left has a much stiffer ship to shift.
 *
 * The destroyer end of this used to be pinned at the ceiling: she took the
 * whole angle of the water, which put five degrees of roll on a Fletcher in the
 * roughest preset and made her tiring to watch. She now takes a little under
 * three fifths of it. The curve was re-fitted rather than simply scaled, so the
 * big ships come down only slightly and a short hull still heels more than
 * twice what a long one does.
 */
export function rollHeed(length) {
  return Math.min(1, Math.max(0.16, Math.pow(62.5 / length, 0.915)));
}

/**
 * How much of it reaches her fore and aft, which is much less.
 *
 * Pitch falls away far faster with length than roll does, because a ship only
 * pitches to a wave of about her own length: put a two-hundred-and-sixty-metre
 * carrier in a hundred-metre sea and the crests under her bow and her stern
 * cancel, and she goes through it flat. That is why a destroyer's bow is in the
 * air and Enterprise, in the same water, is not moving.
 *
 * Re-fitted with the roll curve, and for the same reason: a Fletcher nodding a
 * degree and a half is a ship nobody wants to aim from. She takes about half
 * what she did, and still pitches four times what a carrier does.
 */
export function pitchHeed(length) {
  return Math.min(1, Math.max(0.09, Math.pow(75.8 / length, 1.78)));
}

/**
 * How much of the sea's rise and fall she takes up: all of it.
 *
 * This used to be a fraction, to stop a carrier looking as though she were
 * plunging. It was the wrong lever. The number coming out of the sea is a water
 * level, and a ship drawn at half a water level is a ship the sea has left --
 * which put her propellers in the air at the bottom of every trough.
 *
 * The filtering belongs where the water is measured, not here: the sea is now
 * averaged over her whole waterplane, so a wave shorter than she is lifts her
 * hardly at all and the long swell lifts her with everything else on it. She
 * follows that mean exactly, and stays in the water.
 */
export function heaveHeed() { return 1; }

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
    this.heaveHeed = heaveHeed(hull.length);
    // Heave has a period of its own too -- she is a cork on a spring made of
    // her own waterplane -- and it goes with her length like pitch does.
    this.heaveW = (Math.PI * 2) / (pitchPeriod(hull.length) * 1.25);
    this.roll = 0;
    this.rollV = 0;
    this.pitch = 0;
    this.pitchV = 0;
    this.heave = 0;
    this.heaveV = 0;
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
    const heaveTo = att.heave * this.heaveHeed;
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
      // And she rises and falls on the same sort of spring, well damped: a
      // hull that bobbed would look like a float on a line.
      this.heaveV += (this.heaveW * this.heaveW * (heaveTo - this.heave)
        - 2 * HEAVE_ZETA * this.heaveW * this.heaveV) * h;
      this.heave += this.heaveV * h;
    }
    return this;
  }
}

const ROLL_ZETA = 0.13;
const PITCH_ZETA = 1.25;
const HEAVE_ZETA = 1.1;
