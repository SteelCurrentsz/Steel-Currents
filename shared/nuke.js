// The atomic bomb a Silverplate B-29 carries: how big it is, and how fast what
// it does goes out across the sea.
//
// Shared because the simulation and the screen have to agree on one thing
// above all, which is where the front of the blast is at any moment: a ship
// is wrecked when the shock reaches her, and the ring of white water racing
// out across the sea is drawn where that shock is. Off the one function, the
// two cannot disagree.
//
// The figures are a sea battle's, not a city's. Over Hiroshima the fireball was
// three hundred and seventy metres across and the ring of near-total
// destruction a mile and a half; a warship is a great deal harder than a
// house, and at Bikini an airburst of the same size sank what was within half
// a mile of it and wrecked the topsides of what was within a mile. So: the
// fireball takes anything inside it, everything within NUKE.lethal is lost,
// the blast is heavy out to NUKE.heavy and is still breaking things and
// setting them alight to NUKE.reach -- and the wave thrown up off the sea
// goes out further than any of that.

export const NUKE = {
  /** The weapon, in pounds: what the yard reads out and nothing else uses. */
  pounds: 9700,
  /** Radius of the fireball, metres: inside it nothing survives. */
  fireball: 380,
  /** Everything afloat within this is lost. */
  lethal: 900,
  /** Out to here the blast wrecks a ship's upperworks and sets her alight. */
  heavy: 2200,
  /** And out to here it still does harm. */
  reach: 4200,
  /** How far an aeroplane can be from it, in the air, and live. */
  air: 2600,
  /** The front's time constant, seconds: see nukeFront. */
  tau: 3.2,
  /** How long the whole thing is worth drawing, seconds. */
  life: 90,
};

/**
 * How far out the shock front is, `age` seconds after the burst.
 *
 * It leaves at many times the speed of sound and slows as it spreads -- a
 * spherical shock loses its strength as the square of the distance and its
 * speed with it -- and the curve that does that, close enough to the measured
 * one for anyone watching, is an exponential approach to its furthest reach.
 * Two and a half kilometres in the first three seconds; the last of it,
 * sixty seconds of ring creeping out to the edge, is the wave.
 */
export function nukeFront(age) {
  if (!(age > 0)) return 0;
  return NUKE.reach * (1 - Math.exp(-age / NUKE.tau));
}

/**
 * What the blast is worth at a distance, as a share of a ship's whole life:
 * past one, she is lost. Falls away from the fireball's edge to the reach,
 * steeply at first -- which is what overpressure does -- and to nothing.
 */
export function nukeBite(d) {
  if (d <= NUKE.fireball) return 2.5;
  if (d <= NUKE.lethal) return 1.6;
  if (d >= NUKE.reach) return 0;
  if (d <= NUKE.heavy) {
    const k = (d - NUKE.lethal) / (NUKE.heavy - NUKE.lethal);
    return 1.0 - 0.7 * k;
  }
  const k = (d - NUKE.heavy) / (NUKE.reach - NUKE.heavy);
  return 0.3 * (1 - k) * (1 - k);
}
