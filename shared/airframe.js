// What happens to an aeroplane that is hit.
//
// A flight used to be one bar. Four aeroplanes shared a single pool of hit
// points, flak took it down evenly, and when it reached nothing all four
// vanished at the same instant -- so a squadron flew through a battleship's
// close-range battery entirely undamaged right up to the moment it ceased to
// exist. Nothing about it was an aeroplane: there was no engine to hit, no
// tank to set alight, no wing to shoot off, and no such thing as the one
// machine that gets home on a dead engine with her observer dead in the back.
//
// This is the same model the ships have, at an aeroplane's scale. A ship is a
// set of compartments, each with its own strength and its own consequence when
// it goes; an aeroplane is a set of parts, and the parts are what actually
// decide what a hit does:
//
//   engine   she loses her power and drops out of formation
//   tanks    she leaks, and she may catch fire
//   wings    she loses her lift and her manoeuvre; both gone, so is she
//   tail     she cannot be flown accurately, so she cannot bomb accurately
//   crew     nobody is flying her
//   body     her structure, and whatever is slung under it
//
// Every part is hit in proportion to the area it presents, not to how
// important it is -- which is why the wings take most of the rounds and the
// pilot takes very few, and why the few that do find him settle the matter.

/**
 * The parts of an aeroplane.
 *
 * `share` is how much of her strength is in that part; `area` is how much of
 * her a round coming in has to hit to find it. They are not the same thing:
 * a wing is most of what you can hit and very little of what kills her, and a
 * pilot is the other way round.
 */
export const PARTS = [
  { k: 'engine', name: 'Engine', share: 0.15, area: 0.13 },
  { k: 'tanks', name: 'Tanks', share: 0.15, area: 0.19 },
  { k: 'wings', name: 'Wings', share: 0.26, area: 0.34 },
  { k: 'tail', name: 'Tail', share: 0.16, area: 0.15 },
  { k: 'crew', name: 'Crew', share: 0.13, area: 0.07 },
  { k: 'body', name: 'Fuselage', share: 0.15, area: 0.12 },
];

/** The parts that, knocked out, put her in the sea there and then. */
export const FATAL = new Set(['wings', 'crew']);

/** One aeroplane, whole. `hp` is what the class datasheet gives a machine. */
export function freshAirframe(hp) {
  const parts = {};
  for (const p of PARTS) parts[p.k] = { hp: hp * p.share, max: hp * p.share };
  return {
    parts,
    // How hard she is burning, 0 to 1, and how much of her fuel is running out
    // over the side a second. Both of them are what a hit leaves behind rather
    // than what it does at the time, and both of them are what actually brings
    // an aeroplane down: very few are shot to pieces in the air.
    fire: 0,
    leak: 0,
    // How much of her endurance she has left, as a fraction. She burns it
    // flying and loses it through her tanks.
    fuel: 1,
    // Whether she is still flying, and whether she is still with the flight.
    alive: true,
    left: false,
  };
}

/** What she has left, as a fraction of a whole aeroplane. */
export function airframeHp(a) {
  let hp = 0;
  let max = 0;
  for (const p of PARTS) { hp += Math.max(0, a.parts[p.k].hp); max += a.parts[p.k].max; }
  return max > 0 ? hp / max : 0;
}

/**
 * Which part a round that has found her finds.
 *
 * By presented area, so most of them go through a wing and very few reach the
 * pilot -- and a part already shot away cannot be hit again, so a machine with
 * her tail gone takes the next burst somewhere that still matters.
 */
export function partHit(a, roll) {
  let total = 0;
  for (const p of PARTS) if (a.parts[p.k].hp > 0) total += p.area;
  if (total <= 0) return 'body';
  let pick = roll * total;
  for (const p of PARTS) {
    if (a.parts[p.k].hp <= 0) continue;
    pick -= p.area;
    if (pick <= 0) return p.k;
  }
  return 'body';
}

/**
 * Put damage into one aeroplane.
 *
 * Returns what it did: which part took it, whether that part is out, and
 * whether she is finished. Damage past what a part had left runs on into her
 * structure, because a round that goes clean through a wing tank has still
 * gone through the wing.
 *
 * `roll` is two numbers from the simulation's own generator, so a replay of
 * the same battle takes the same aeroplanes down in the same order.
 */
export function hitAirframe(a, damage, roll, roll2) {
  const out = { part: null, knocked: false, lit: false, leaking: false, down: false };
  if (!a.alive) return out;
  const k = partHit(a, roll);
  const c = a.parts[k];
  out.part = k;
  const had = c.hp;
  c.hp -= damage;
  if (c.hp <= 0) {
    out.knocked = true;
    // What is left over goes into her structure.
    const spill = Math.max(0, damage - Math.max(0, had));
    if (k !== 'body') a.parts.body.hp -= spill * 0.5;
    if (FATAL.has(k)) { out.down = true; a.alive = false; return out; }
  }
  if (a.parts.body.hp <= 0) { out.down = true; a.alive = false; return out; }

  // A tank that has been through is a tank that is running out, and petrol and
  // hot metal in the same place is a fire more often than not.
  if (k === 'tanks') {
    // How much of the tank this round opened. Everything that follows goes
    // with that rather than with the fact that a round arrived at all --
    // flak is applied twenty times a second, and a flat chance per call set
    // every aeroplane in the game alight within a second of the first round
    // through a tank, so almost nothing was ever shot down: they all burned.
    const bite = Math.min(1, damage / Math.max(1, c.max));
    a.leak = Math.min(0.35, a.leak + bite * 0.9);
    out.leaking = true;
    // Very likely, never certain: a round can go through a tank and leave
    // nothing but a fuel trail, and plenty of them did.
    if (roll2 < Math.min(0.85, bite * 2.2)) {
      // Reported only when it starts. A machine already alight that takes
      // another round through the same tank is not a second fire.
      out.lit = a.fire <= 0;
      a.fire = Math.max(a.fire, 0.3 + Math.min(0.45, bite * 3));
    }
  }
  // An engine hit is oil and heat, and it burns too -- less often, and it is
  // the fire that is out in front of the pilot rather than under him.
  if (k === 'engine' && c.hp <= 0 && roll2 < 0.30) {
    out.lit = a.fire <= 0;
    a.fire = Math.max(a.fire, 0.3);
  }
  return out;
}

/**
 * A second of a damaged aeroplane's life.
 *
 * Fire burns through what is holding her up; a leak empties her tanks. Neither
 * is instant and both of them are what finally puts her in the water -- an
 * aeroplane that flies out of the flak still flying is very often one that
 * does not get home.
 *
 * Returns 'fire', 'dry' or null: how she went, if she went.
 */
export function stepAirframe(a, dt, roll) {
  if (!a.alive) return null;
  if (a.fire > 0) {
    // It grows, and it eats the airframe under it. A slipstream will
    // occasionally blow one out, which is the only way a burning aeroplane
    // ever got home.
    a.fire = Math.min(1, a.fire + 0.06 * dt);
    a.parts.body.hp -= a.parts.body.max * 0.10 * a.fire * dt;
    a.parts.wings.hp -= a.parts.wings.max * 0.06 * a.fire * dt;
    // A slipstream will occasionally blow one out. Two per cent of a second,
    // so about a quarter of them go out before they have burned her down --
    // which is the only way a burning aeroplane ever got home. Written as a
    // per-frame chance it came to seven in ten every second, and no aeroplane
    // in the game ever burned for longer than a moment.
    if (roll < 0.02 * dt) a.fire = 0;
    if (a.parts.body.hp <= 0 || a.parts.wings.hp <= 0) { a.alive = false; return 'fire'; }
  }
  // A holed tank is a machine that will not get home, not one that falls out
  // of the sky: at her worst she has four or five minutes of fuel left, which
  // is the difference between ditching alongside the fleet and ditching alone.
  if (a.leak > 0) a.fuel -= a.leak * dt * 0.010;
  if (a.fuel <= 0) { a.alive = false; return 'dry'; }
  return null;
}

/**
 * How well a damaged aeroplane still flies, as multipliers on the whole one.
 *
 * This is the part that has to reach the game. A machine with her engine shot
 * about cannot keep station, one with her tail shot about cannot be aimed, and
 * one with a wing panel gone can neither turn nor carry herself -- and all
 * three of those are things a captain being attacked can see happening.
 */
export function airframeState(a) {
  const frac = (k) => Math.max(0, a.parts[k].hp) / a.parts[k].max;
  const eng = frac('engine');
  const wing = frac('wings');
  const tail = frac('tail');
  return {
    // What she can still make. An engine at half is a machine that cannot hold
    // her place in the formation, which is why she drops out of it.
    speed: 0.35 + 0.65 * eng,
    // What she can still be hauled round at.
    turn: 0.25 + 0.45 * wing + 0.30 * tail,
    // And what she can still hit with. A bomb aimed by an aeroplane that will
    // not fly straight goes where the aeroplane was pointing, which is not
    // where the target is.
    aim: 0.20 + 0.45 * tail + 0.35 * wing,
    // Whether she is any use to the strike at all.
    // Whether she is any use to the strike at all. A fire is not in this: a
    // burning aeroplane goes on flying, and very often goes on attacking,
    // until the fire has eaten enough of her -- and counting one as crippled
    // the moment it started meant a single tank hit took a machine out of the
    // sky instantly.
    crippled: eng <= 0 || wing < 0.34,
  };
}

/**
 * The flight as a whole: what it is worth now.
 *
 * A formation goes at the speed of its slowest and turns at the rate of its
 * worst, because otherwise it is not a formation -- which is the same reason
 * a strike climbs at the rate of its heaviest aeroplane.
 */
export function flightState(machines) {
  let speed = 1;
  let turn = 1;
  let aim = 0;
  let n = 0;
  let smoking = 0;
  for (const a of machines) {
    if (!a.alive || a.left) continue;
    const s = airframeState(a);
    speed = Math.min(speed, s.speed);
    turn = Math.min(turn, s.turn);
    aim += s.aim;
    n++;
    if (a.fire > 0.05 || a.leak > 0.02) smoking++;
  }
  return {
    count: n,
    speed: n ? speed : 1,
    turn: n ? turn : 1,
    // Averaged, because each aeroplane aims her own bomb.
    aim: n ? aim / n : 0,
    smoking,
  };
}
