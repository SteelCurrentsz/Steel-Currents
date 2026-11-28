// Putting a seaplane down on the water, and getting her off it again.
//
// A float plane and a flying boat are made to come down on the sea. What
// decides whether she has alighted or crashed is how she meets it: settled
// on in a gentle descent, wings level, not much over her stall and with her
// nose up enough for the floats -- or the step of her hull -- to take it,
// she skims and settles and sits there; dropped in, dug in nose first, with a
// wing down or at cruise, she cartwheels and breaks up the same as anything
// else that flies into the sea.
//
// On the water she is a boat with an engine: she taxis on her throttle, turns
// on her water rudder (slowly, and hardly at all when she has no way on her),
// and gets off again by opening up until she is going fast enough to fly and
// lifting her nose.
//
// Everything here is shared: the simulation flies its own seaplanes down and
// off by these rules, and the cockpit a player flies one from uses the same
// ones, so what the pilot sees happen is what the simulation says happened.

import { AERO, stallSpeed, thrust, alphaFor } from './aero.js';

/** Every machine in the game built to come down on the water. */
export const SEAPLANES = new Set(['arado', 'kingfisher', 'besson', 'loire', 'walrus', 'kor1', 'ro43', 'jake']);

/** Whether this type can alight on the sea. */
export function isSeaplane(type) { return SEAPLANES.has(type); }

/**
 * What she can be put down in, and no worse:
 *   sink    the fastest she may be coming down, metres a second -- a pilot
 *           settles her on at a couple; more than this and she is dropped in
 *   over    the fastest she may be going, as a multiple of her stall speed
 *   bank    how far a wing may be down, radians: a float pontoon or a wingtip
 *           float that meets the water first digs in and swings her over
 *   nose    how far her path may point down, radians: steeper than this the
 *           float bows go under and she goes over on her back
 */
export const ALIGHT = { sink: 4.5, over: 1.6, bank: 0.27, nose: -0.16 };

/** Her stall speed, off her type. */
export function vStallOf(type) {
  const a = AERO[type];
  return a ? stallSpeed(a) : 30;
}

/**
 * Whether she can come down here like this: null if she alights, and if she
 * does not, why -- which is what the pilot is told as she breaks up.
 *
 * `v` is her speed through the air, `vy` her rate of climb (negative coming
 * down), `pitch` the angle of her path, `bank` her bank.
 */
export function alightFault(type, { v, vy, pitch = 0, bank = 0 }) {
  if (!isSeaplane(type)) return 'not a seaplane';
  const vs = vStallOf(type);
  if ((vy ?? 0) < -ALIGHT.sink) return 'dropped in';
  if ((v ?? 0) > vs * ALIGHT.over) return 'too fast';
  // All the way round: a wing down is a wing down whichever way up she is.
  const b = Math.abs(Math.atan2(Math.sin(bank), Math.cos(bank)));
  if (b > ALIGHT.bank) return 'wing in';
  if ((pitch ?? 0) < ALIGHT.nose) return 'nose in';
  return null;
}

/** How fast she has to be going on the water before she will fly off it. */
export function unstickSpeed(type) { return vStallOf(type) * 1.15; }

/**
 * How her nose sits on the water, radians up, at speed `v`.
 *
 * Lying still she sits a little tail-down on her floats. Opened up, she
 * ploughs: her bows climb as she pushes her own bow wave up to the hump,
 * nose well up and her tail dragging; over it she gets up on the step and
 * planes, and her nose comes down to nearly level; and at the last
 * -- her pilot easing the stick back, `rotating` as a share of the pull that
 * flies her off -- she is lifted onto the after end of her floats, nose up
 * at the angle she will fly away at, and off. Shared, so
 * a seaplane drawn running across the water off the simulation and one flown
 * off it by a player sit at the same angles at the same speeds.
 */
export function waterTrim(type, v, rotating = 1) {
  const x = Math.max(0, v || 0) / unstickSpeed(type);
  if (x <= HUMP) return 0.035 + 0.075 * Math.sin((x / HUMP) * Math.PI / 2);
  if (x <= 0.75) return 0.11 - 0.065 * smooth((x - HUMP) / (0.75 - HUMP));
  // How far back her pilot has the stick, as a share of what lifts her off.
  const r = rotating === true ? 1 : rotating === false ? 0 : Math.max(0, Math.min(1, rotating));
  const top = 0.065 + (liftOff(type) - 0.065) * r;
  return 0.045 + (top - 0.045) * smooth((x - 0.75) / 0.25);
}

/**
 * The angle she is lifted to as she comes off: what her wing works at to hold
 * her up at the speed she unsticks at, so the nose she flies away with is
 * the nose she had on the water.
 */
const LIFT_OFF = {};
function liftOff(type) {
  if (LIFT_OFF[type] === undefined) {
    const a = AERO[type];
    LIFT_OFF[type] = a ? Math.max(0.1, alphaFor(a, unstickSpeed(type), 1)) : 0.15;
  }
  return LIFT_OFF[type];
}

function smooth(u) {
  const c = Math.max(0, Math.min(1, u));
  return c * c * (3 - 2 * c);
}

/**
 * The water's hold on her, as a share of what her engine gives standing
 * still: her floats plough harder and harder up to the hump, a little under
 * half her flying speed, and then she gets up on the step and planes, and the
 * water lets go of more and more of her as her wing takes her weight. Worked
 * as a share of her own power because that is how they were designed -- a
 * float sized so the engine could just get her over the hump -- and so a
 * light seaplane at full throttle is off in half a minute or so, which is
 * what they did, and idles along at a walking pace at the throttle she taxis
 * on.
 */
const HUMP = 0.42;
function waterHold(x) {
  if (x <= HUMP) return 0.56 * (x / HUMP) ** 1.2;
  return 0.56 - 0.26 * Math.min(1, (x - HUMP) / (1 - HUMP));
}

/** The slowest she will drift with the engine off before she lies still. */
const DRIFT = 0.2;

/** How hard she slows coming down off the step, metres a second squared. */
const SETTLE = 3.5;

/** The hardest her water rudder will turn her, radians a second. */
const RUDDER = 0.4;

/**
 * A moment on the water. `s` is { v, heading } and is changed in place;
 * `throttle` is 0 to 1, `rudder` -1 to 1 (positive to starboard), and `off`
 * whether she is trying to get off. Returns true on the moment she flies off
 * it: she is fast enough and her pilot has her nose up.
 */
export function stepAfloat(type, s, { throttle = 0, rudder = 0, off = false, dt }) {
  const a = AERO[type] || AERO.kingfisher;
  const v = Math.max(0, s.v || 0);
  const push = thrust(a, v, Math.max(0, Math.min(1, throttle))) / a.mass;
  let hold = (thrust(a, 0, 1) / a.mass) * waterHold(v / unstickSpeed(type)) + (v > DRIFT ? 0.05 : 0);
  // Just put down with her throttle back: she comes down off the step as
  // her wing lets go of her and digs her floats in, and runs off her landing
  // speed in a few lengths. Opened up, she stays on the step and goes.
  if (!off && throttle < 0.5 && v > unstickSpeed(type) * 0.7) hold += SETTLE;
  s.v = Math.max(0, v + (push - hold) * dt);
  if (s.v < DRIFT && throttle < 0.02) s.v = 0;
  // She turns on her water rudder and the slipstream over her own rudder:
  // a little even when she is barely moving, and more with way on her.
  const rate = RUDDER * Math.min(1, 0.2 + s.v * 0.04) * Math.max(-1, Math.min(1, rudder));
  s.heading = wrap(s.heading + rate * dt);
  return off && s.v >= unstickSpeed(type);
}

function wrap(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}
