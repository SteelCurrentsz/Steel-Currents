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

/**
 * Where each part sits on an aeroplane, as a box in her own frame.
 *
 * Normalised: x across her from wingtip to wingtip, y up from the thrust line,
 * z along her from tail to spinner, each running -1 to 1. The client scales
 * the box by the span and length of whichever machine she actually is, so one
 * table does for a Wildcat and for a Lancaster.
 *
 * This exists so that a hole is somewhere rather than nowhere. A round that
 * finds her wing makes a hole out on the wing; one that finds her engine makes
 * it in the nose. Without it the damage was a set of numbers falling and there
 * was nothing on the aeroplane to see.
 */
export const PART_BOX = {
  engine: { x: [-0.10, 0.10], y: [-0.06, 0.10], z: [0.62, 0.95] },
  tanks: { x: [-0.42, 0.42], y: [-0.05, 0.05], z: [0.02, 0.34] },
  wings: { x: [-1.00, 1.00], y: [-0.04, 0.04], z: [-0.10, 0.30] },
  tail: { x: [-0.34, 0.34], y: [-0.02, 0.22], z: [-1.00, -0.62] },
  crew: { x: [-0.09, 0.09], y: [0.04, 0.16], z: [0.16, 0.46] },
  body: { x: [-0.11, 0.11], y: [-0.09, 0.09], z: [-0.55, 0.55] },
};

/** How many holes are kept on one airframe before the oldest is written over. */
export const MAX_HOLES = 14;

/**
 * How much damage buys one hole.
 *
 * Not a threshold on the single hit, which is what this was first written as
 * and which does not work: fire arrives here thirty times a second in slivers
 * of four or five, so a per-hit test either fires on every tick and fills her
 * skin in two seconds or -- with a number big enough to stop that -- never
 * fires at all and she is shot down without a mark on her.
 *
 * So it is a till. Every hit puts its damage in, and a hole comes out each
 * time there is enough in there to have made one. The rate of holes then
 * follows the rate of fire rather than the tick rate, which is the only way
 * it means anything: a burst that takes a tenth of her puts the same number
 * of holes in her whether the simulation runs at thirty ticks or at three.
 */
export const HOLE_COST = 14;

/**
 * How big a hole a burst of this size tears, in metres.
 *
 * A rifle-calibre round makes a hole you have to look for and a 40 mm shell
 * makes one you can see from the next aeroplane. The damage number a hit
 * arrives with already carries the calibre -- twenty rounds of .303 in a
 * second is a smaller number than one Bofors shell -- so the size comes off
 * that rather than off a calibre nobody passes down here.
 */
export function holeSize(damage) {
  return Math.min(0.85, 0.06 + Math.sqrt(Math.max(0, damage)) * 0.055);
}

/**
 * Record where a round went through her.
 *
 * Kept on the airframe, in her own frame, so the hole is a fact about the
 * aeroplane rather than something the client invents to have something to
 * draw: the same list goes on her damage board, out on the wire, and onto the
 * model, and a test can ask how many holes are in her wing.
 */
export function punchAirframe(a, part, damage, roll, roll2, roll3) {
  const box = PART_BOX[part] || PART_BOX.body;
  const lerp = (r, u) => r[0] + (r[1] - r[0]) * u;
  const hole = {
    k: part,
    x: lerp(box.x, roll),
    y: lerp(box.y, roll2),
    z: lerp(box.z, roll3),
    r: holeSize(damage),
  };
  if (!a.holes) a.holes = [];
  // A wing is a finite amount of wing. Past a certain number of them the holes
  // stop being separate holes and start being one piece of missing aeroplane,
  // and the oldest is written over rather than the list growing without end.
  if (a.holes.length >= MAX_HOLES) a.holes.shift();
  a.holes.push(hole);
  return hole;
}

/** One aeroplane, whole. `hp` is what the class datasheet gives a machine. */
export function freshAirframe(hp) {
  const parts = {};
  for (const p of PARTS) parts[p.k] = { hp: hp * p.share, max: hp * p.share };
  return {
    parts,
    // Every round that has been through her, where it went and how big a hole
    // it left, and the damage taken since the last one. See punchAirframe.
    holes: [],
    pend: 0,
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
  const out = {
    part: null, knocked: false, lit: false, leaking: false, down: false, hole: null,
  };
  if (!a.alive) return out;
  const k = partHit(a, roll);
  const c = a.parts[k];
  out.part = k;
  // The holes it made, where it made them. Everything below is what the damage
  // does to her; this is the holes themselves, and they stay in her skin.
  a.pend = (a.pend || 0) + damage;
  if (a.pend >= HOLE_COST) {
    // One hit, one hole, and its size comes off what actually arrived. A
    // stream of rifle calibre fills the till a sliver at a time and leaves
    // small holes; one Bofors shell fills it at a stroke and leaves a hole you
    // can see from the next aeroplane.
    const bite = Math.min(a.pend, Math.max(HOLE_COST, damage));
    a.pend -= bite;
    out.hole = punchAirframe(a, k, bite,
      (roll * 7.31 + a.holes.length * 0.37) % 1,
      (roll2 * 5.17 + a.holes.length * 0.61) % 1,
      (roll * roll2 * 11.7 + a.holes.length * 0.23) % 1);
  }
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
    // And whether she is finished: not hurt, not crippled, but going down.
    //
    // A pilot knows the difference. A machine with an engine out and half a
    // wing gone is one he turns for home in and very often gets there; one
    // that is burning hard with her structure open and her tanks running out
    // is one he has a minute in, and what he does with that minute is the
    // whole of why this is a separate question from `crippled`.
    doomed: a.fire > 0.55
      || frac('body') <= 0.1
      || (eng <= 0 && wing < 0.2)
      || (a.leak > 0.2 && (a.fuel ?? 1) < 0.08),
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
