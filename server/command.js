// The staff: one command net per side, and everything that fights for it.
//
// Every unit in this game has its own brain and its own job -- a captain fights
// his ship, a battery commander lays his guns, a squadron leader takes his
// flight in, a bomb aimer works his sight -- and none of them can see more than
// their own horizon. What turns four kinds of brain into a side is this: they
// report what they see, and they are given orders in return.
//
// So the staff holds a plot, and the plot is built from signals rather than
// from the simulation. Nothing in here reads the true position of an enemy it
// has not been told about; a contact ages and goes stale; a ship that has seen
// nothing for a minute is working off somebody else's report. That is the one
// thing that makes a destroyer thrown out ahead worth throwing out ahead.
//
// And none of it goes on the wire. The appreciation, the fighting course, who
// is to concentrate on whom, when the strike goes and what the heavies are
// after -- all of it lives here, on the server, in objects no snapshot builder
// has ever heard of. A plan the other side can read is not a plan.

import { clamp, dist, headingTo, wrapAngle, angleDelta } from '../shared/math.js';
import { getClass } from '../shared/ships.js';
import { BATTERIES } from '../shared/batteries.js';

/** How long a contact is worth anything after the last report of it. */
const STALE = 45;

/** How often the staff writes a new appreciation. */
const THINK = 1.0;

/** What a hull is worth as a target, before range is taken into account. */
const WORTH = { CV: 100, BB: 78, CA: 55, CL: 42, DD: 26, SS: 34 };

/** And where each kind belongs in a fleet under way. */
const ORDER = { BB: 0, CA: 1, CL: 2, CV: 3, DD: 4, SS: 5 };

export function createStaff(team, skill = 0.7) {
  return {
    team,
    skill,
    think: Math.random() * THINK,
    // The plot. Keyed by the contact's own id, which is how a report is
    // matched to the contact it updates.
    contacts: new Map(),
    // The appreciation, rewritten every THINK seconds.
    guideId: 0,
    course: 0,
    axis: 0,
    centre: null,
    posture: 'seek',
    // Orders, by the unit they are for.
    stations: new Map(),
    fireAt: new Map(),
    torpRun: new Set(),
    batteryAt: new Map(),
    strikeAt: 0,
    strikeReady: 0,
    bomberAt: null,
    // Which end of the enemy's line this side has decided to fall on, and how
    // his line lies. Null until there is more than one of him on the plot.
    plan: null,
    // What this side has signalled lately, for the one line of it a captain is
    // allowed to see. The content is never sent anywhere.
    lastSignal: '',
  };
}

/**
 * A unit reporting a contact.
 *
 * This is the whole of the communication between them. A lookout on a
 * destroyer, a battery's rangetaker, a pilot's shout over the R/T: all of them
 * arrive here as the same four numbers and a time.
 */
export function report(staff, id, x, z, heading, kind, t, worth = 0) {
  const was = staff.contacts.get(id);
  staff.contacts.set(id, {
    id, x, z, heading, kind, t, worth,
    // How long this side has been holding her. A contact that has been on the
    // plot for a while is one the staff will commit to; one that was sighted a
    // moment ago might be a false alarm in the murk.
    since: was ? was.since : t,
  });
}

/** Everything the plot still believes in. */
function live(staff, t) {
  const out = [];
  for (const [id, c] of staff.contacts) {
    if (t - c.t > STALE) { staff.contacts.delete(id); continue; }
    out.push(c);
  }
  return out;
}

/**
 * What each of this side's own units can see, signalled in.
 *
 * Ships report what their lookouts have spotted; batteries report what is
 * inside their own rangefinders; flights report what they are over. The staff
 * never asks the simulation directly -- if nobody saw it, it is not on the
 * plot.
 */
function gatherReports(state, staff) {
  const t = state.t;
  const them = 1 - staff.team;
  for (const s of state.ships) {
    if (!s.alive || s.team !== them) continue;
    if (!s.spottedBy[staff.team]) continue;
    report(staff, s.id, s.x, s.z, s.heading, 'ship', t,
      WORTH[getClass(s.classId).type] ?? 40);
  }
  // Guns ashore are not a secret: both sides put them on the chart before the
  // battle started. What changes is whether one is still in action.
  for (const b of state.batteries) {
    if (!b.alive || b.team === staff.team) continue;
    report(staff, b.id, b.x, b.z, b.heading, 'battery', t, 30);
  }
  for (const p of state.planes) {
    if (p.dead || p.team === staff.team) continue;
    // Aircraft are reported by whoever they are over, which is the only way
    // anybody knew: a strike coming in was a radar plot or a lookout's shout.
    let seen = false;
    for (const s of state.ships) {
      if (!s.alive || s.team !== staff.team) continue;
      if (dist(p.x, p.z, s.x, s.z) < 14000) { seen = true; break; }
    }
    if (seen) report(staff, p.id, p.x, p.z, p.heading, 'air', t, 20);
  }
  for (const bm of (state.bombers || [])) {
    if (!bm.alive || bm.team === staff.team) continue;
    if (bm.spottedBy[staff.team]) {
      report(staff, bm.id, bm.x, bm.z, bm.heading, 'heavy', t, 45);
    }
  }
}

/** This side's own ships, heaviest first, so the line forms in the right order. */
function ownLine(state, staff) {
  return state.ships
    .filter((s) => s.alive && s.team === staff.team)
    .sort((a, b) => {
      const ca = getClass(a.classId);
      const cb = getClass(b.classId);
      const oa = ORDER[ca.type] ?? 9;
      const ob = ORDER[cb.type] ?? 9;
      if (oa !== ob) return oa - ob;
      return cb.hull.length - ca.hull.length;
    });
}

/**
 * The appreciation.
 *
 * Where the enemy is, what course this side ought to be on to fight him, who
 * leads the line, where everybody else stations on her, and who is to shoot at
 * whom. Written once a second and handed out as orders.
 */
function appreciate(state, staff) {
  const t = state.t;
  const seen = live(staff, t).filter((c) => c.kind === 'ship' || c.kind === 'battery');
  const line = ownLine(state, staff);
  const heavies = line.filter((s) => {
    const ty = getClass(s.classId).type;
    return ty === 'BB' || ty === 'CA' || ty === 'CL';
  });

  // The guide: the heaviest ship still able to lead. The whole line forms on
  // her, and if she goes the next one takes it up.
  const guide = heavies[0] || line[0] || null;
  staff.guideId = guide ? guide.id : 0;
  if (!guide) { staff.posture = 'seek'; return; }

  // The enemy's centre of gravity, weighted by what each contact is worth: one
  // battleship counts for four destroyers, which is what a staff means by the
  // enemy's main body.
  let wx = 0;
  let wz = 0;
  let wsum = 0;
  let prize = null;
  let prizeScore = -Infinity;
  for (const c of seen) {
    if (c.kind !== 'ship') continue;
    wx += c.x * c.worth;
    wz += c.z * c.worth;
    wsum += c.worth;
    const sc = c.worth - dist(guide.x, guide.z, c.x, c.z) * 0.002;
    if (sc > prizeScore) { prizeScore = sc; prize = c; }
  }
  staff.centre = wsum > 0 ? { x: wx / wsum, z: wz / wsum } : null;

  if (!staff.centre) {
    // Nothing on the plot. The fleet sweeps down the battlefield in company
    // rather than each hull wandering off on its own -- which is what a fleet
    // that has lost contact actually does, and it is the only way the line is
    // still a line when contact is regained.
    staff.posture = 'seek';
    const shore = seen.find((c) => c.kind === 'battery');
    const goal = shore || { x: 0, z: -Math.sign(guide.z || 1) * state.world.half * 0.5 };
    staff.axis = headingTo(guide.x, guide.z, goal.x, goal.z);
    setCourse(staff, staff.axis);
    stationTheLine(staff, line, guide);
    staff.fireAt.clear();
    staff.torpRun.clear();
    staff.lastSignal = 'sweep';
    return;
  }

  // What the whole side is going to do about him. With one ship in front of
  // us the centre of gravity is the ship; with several it is a point between
  // them that nobody is at, and steering for it is how a fleet arrives in the
  // middle of an enemy line with his whole force able to fire and its own
  // split. The plan names one end of him instead.
  const plan = pointOfAttack(seen.filter((c) => c.kind === 'ship'), guide);
  staff.plan = plan;
  const mark = plan || staff.centre;

  const gcls = getClass(guide.classId);
  const range = dist(guide.x, guide.z, mark.x, mark.z);
  staff.axis = headingTo(guide.x, guide.z, mark.x, mark.z);

  // The fighting range: far enough out that her belt is doing its job, close
  // enough in that her guns are. A cruiser wants to be closer than a
  // battleship and a destroyer closer still, but the line is fought at the
  // guide's band because the line fights together.
  const want = gcls.gun.range * (gcls.type === 'BB' ? 0.74 : 0.66);

  // And the course. This is the whole of the difference between a fleet that
  // fights and a fleet that runs away: she is never steered *from* the enemy,
  // she is steered so that her broadside bears and the range closes or holds.
  //
  // Ninety degrees off the bearing is the beam -- every gun in action, range
  // steady -- and that is now the limit. Anything past it puts the enemy
  // abaft the beam, which is the geometry of running away whatever it is
  // called on the signal pad, and the fleet used to be sent to a hundred and
  // thirty degrees any time it found itself inside two thirds of its own
  // fighting range. Inside that range it stays on the beam and fights there.
  const sideOf = staff.side || (staff.side = Math.random() < 0.5 ? 1 : -1);
  let off = Math.PI * 0.5;
  if (range > want * 1.15) off = Math.PI * 0.16;         // bows on, closing
  else if (range > want * 0.9) off = Math.PI * 0.34;     // angling in
  staff.posture = range > want * 1.2 ? 'close' : 'engage';
  let aim = wrapAngle(staff.axis + sideOf * off);
  staff.lastSignal = '';

  // Crossing the T. If the enemy's main body is steering across our front and
  // we are up on his bow, the line turns to bring every gun to bear down the
  // length of his -- which is the manoeuvre the whole of a battle line exists
  // to perform, and it is worth the risk of a few minutes end-on.
  //
  // One course goes on the signal pad, not two. This used to work out the
  // fighting course, order it, and then order the crossing course on top of it
  // in the same appreciation -- and because a course is altered rather than
  // jumped to, the fleet got half a turn one way and half a turn back, every
  // second, for the whole action. Yamato sat a hundred and sixty degrees off
  // the enemy the entire way in, steaming away from a battle nobody had told
  // her to leave, because the two orders cancelled exactly.
  const lead = seen.find((c) => c.id === (plan ? plan.id : (prize && prize.id)));
  if (lead && range < want * 0.9) {
    const theirCourse = lead.heading;
    const bearingFromThem = headingTo(lead.x, lead.z, guide.x, guide.z);
    const onTheirBow = Math.abs(angleDelta(theirCourse, bearingFromThem)) < 0.7;
    if (onTheirBow) {
      // Across his bow on whichever hand still closes him. Taken off our own
      // side of the line regardless, the manoeuvre was as likely to be the one
      // that opens the range as the one that shuts it.
      const a = wrapAngle(theirCourse + Math.PI * 0.5);
      const b = wrapAngle(theirCourse - Math.PI * 0.5);
      aim = Math.abs(angleDelta(staff.axis, a)) <= Math.abs(angleDelta(staff.axis, b)) ? a : b;
      staff.lastSignal = 'crossing';
    }
  }
  setCourse(staff, aim);

  if (staff.lastSignal !== 'crossing') {
    staff.lastSignal = plan ? 'concentrate' : 'engage';
  }
  stationTheLine(staff, line, guide, plan);
  distributeFire(state, staff, line, seen, plan);
  orderTorpedoes(state, staff, line, seen, want);
  orderAir(state, staff, seen);
  orderBatteries(state, staff);
  orderHeavies(state, staff, seen);
}

/**
 * Which end of him to fall on.
 *
 * Against one ship there is nothing to decide: you go for her. Against two or
 * more there is, and it is the oldest decision in a fleet action -- because a
 * line is not a thing you fight all at once. You pick an end, you put your
 * whole force onto it, and you are on top of that end before the rest of him
 * can come round and support it. Two ships on one is how ships are sunk; four
 * ships on four is how an afternoon is spent.
 *
 * So with more than one contact on the plot the staff works out his line --
 * the axis through the two contacts furthest apart, which is what his
 * formation looks like on a plot however he thinks he is steaming -- and names
 * the near end of it as the point of attack. Everything else in the
 * appreciation is aimed there instead of at his centre of gravity: the fleet
 * course, the divisions, and the concentration of fire.
 *
 * None of this is signalled anywhere the other side can read it. It lives on
 * the staff object, which no snapshot builder has ever heard of.
 */
function pointOfAttack(ships, guide) {
  if (ships.length < 2) return null;
  let a = null;
  let b = null;
  let spread = -1;
  for (let i = 0; i < ships.length; i++) {
    for (let j = i + 1; j < ships.length; j++) {
      const d = dist(ships[i].x, ships[i].z, ships[j].x, ships[j].z);
      if (d > spread) { spread = d; a = ships[i]; b = ships[j]; }
    }
  }
  if (!a || !b) return null;
  // The end nearer to us, because that is the end we reach first and the one
  // his far wing has furthest to come to help.
  const near = dist(guide.x, guide.z, a.x, a.z) <= dist(guide.x, guide.z, b.x, b.z) ? a : b;
  const far = near === a ? b : a;
  return {
    id: near.id,
    x: near.x,
    z: near.z,
    n: ships.length,
    spread,
    // The bearing his line lies along, from the end we are falling on toward
    // the rest of him. The second division comes up across it.
    line: headingTo(near.x, near.z, far.x, far.z),
  };
}

/**
 * The fleet's course, altered rather than jumped to.
 *
 * A signal to turn is a turn, and a line of ships turning together takes time
 * over it. Written straight in, the course flicks fifty degrees between one
 * appreciation and the next -- the enemy's centre of gravity moves as contacts
 * come and go -- and every ship in the line spends the whole action chasing a
 * station that has already moved somewhere else.
 */
export function setCourse(staff, want) {
  // The one thing a course in this battle may never be, whatever manoeuvre
  // asked for it: away.
  //
  // Every signal here is worked out from something other than the bearing to
  // the enemy -- the fighting course is an offset from it, crossing the T is
  // worked off *his* course, and a sweep is worked off the chart -- so any of
  // them can come out pointing the wrong way as the geometry changes under
  // them. Rather than remembering that at four call sites, the limit lives
  // here: a course more than ninety degrees off the bearing to him is pulled
  // back to the beam on the side it was already leaning, which keeps which way
  // round the turn goes and throws away only the part of it that was retreat.
  const away = angleDelta(staff.axis, want);
  const BEAM = Math.PI * 0.5;
  const aimed = Math.abs(away) <= BEAM ? want
    : wrapAngle(staff.axis + Math.sign(away) * BEAM);
  const d = angleDelta(staff.course, aimed);
  const MOST = 0.22;                                   // per appreciation
  staff.course = wrapAngle(staff.course + clamp(d, -MOST, MOST));
}

/**
 * Where everybody stands relative to the guide.
 *
 * Line ahead for the heavy ships, because that is how a battle line fights:
 * every ship's broadside clear of the next, the whole line turning together.
 * The destroyers go out ahead as a screen, on either bow, where they can see
 * first and are placed for a torpedo attack when the order comes. A carrier
 * keeps well away on the disengaged side.
 *
 * A station is a bearing and a distance from the guide, not a point on the
 * chart: the formation moves with her and turns with her, which is what makes
 * it a formation rather than a set of waypoints.
 */
function stationTheLine(staff, line, guide, plan = null) {
  staff.stations.clear();
  let heavy = 0;
  let wing = 0;
  let screen = 0;
  const disengaged = -(staff.side || 1);
  for (const s of line) {
    if (s.id === guide.id) continue;
    const ty = getClass(s.classId).type;
    if (ty === 'DD') {
      // Two miles ahead, fanned either bow. Odd numbers to starboard, even to
      // port, so a flotilla of four comes out as two on each side.
      const k = screen++;
      const side = k % 2 ? 1 : -1;
      const out = 2200 + Math.floor(k / 2) * 900;
      staff.stations.set(s.id, { bearing: side * 0.55, range: out, role: 'screen' });
    } else if (ty === 'CV') {
      staff.stations.set(s.id, {
        bearing: Math.PI * 0.72 * disengaged, range: 6500, role: 'carrier',
      });
    } else if (ty === 'SS') {
      // A submarine does not keep station with anybody. She is told where the
      // enemy is and left to it.
      staff.stations.set(s.id, { bearing: 0, range: 0, role: 'free' });
    } else if (plan && (heavy + wing) % 2 === 1) {
      // The second division, told off when there is a line to fall on rather
      // than a single ship to chase. She comes up on the engaged bow and a
      // little wide of the guide, so the same end of his line is under fire
      // from two bearings at once and no single fire-control solution of his
      // answers both of us.
      //
      // Forward of the guide's beam, never astern of her: a division sent to
      // work round a flank that drops back to do it is not working round
      // anything, and the whole side has to keep going forward.
      wing += 1;
      staff.stations.set(s.id, {
        bearing: (staff.side || 1) * 0.46,
        range: 1500 + (wing - 1) * 900,
        role: 'wing',
      });
    } else {
      // Line ahead, astern of the guide at seven hundred yards.
      heavy += 1;
      staff.stations.set(s.id, { bearing: Math.PI, range: heavy * 700, role: 'line' });
    }
  }
}

/**
 * Who shoots at whom.
 *
 * Ships are handed out to targets rather than each captain choosing for
 * himself, and the point of that is concentration: two ships on one enemy sink
 * her in half the time one does, and a line that spreads its fire over four
 * targets sinks nothing. Every enemy worth shooting at gets one ship, and then
 * the rest of the line doubles up on the most valuable of them.
 */
function distributeFire(state, staff, line, seen, plan = null) {
  staff.fireAt.clear();
  const shooters = line.filter((s) => {
    const cls = getClass(s.classId);
    return cls.gun && !cls.dive;
  });
  const marks = seen
    .filter((c) => c.kind === 'ship')
    .sort((a, b) => b.worth - a.worth);
  if (!marks.length || !shooters.length) return;
  const load = new Map(marks.map((m) => [m.id, 0]));
  for (const s of shooters) {
    const cls = getClass(s.classId);
    let best = null;
    let bestScore = -Infinity;
    for (const m of marks) {
      const d = dist(s.x, s.z, m.x, m.z);
      if (d > cls.gun.range * 1.05) continue;
      // Worth, less the range, less how many are already on her, plus a great
      // deal if she is the end of his line the side has decided to fall on.
      //
      // That last term is what makes the plan an attack rather than a course.
      // Falling on one end of him means the guns fall on it too: without it the
      // line steers for the near end and then shares its fire out across the
      // whole of him by worth, which is the thing the manoeuvre exists to
      // avoid. The concentration term still applies on top, so the fifth ship
      // on her looks elsewhere.
      const onPlan = plan && m.id === plan.id ? 44 : 0;
      const sc = m.worth * 1.6 + onPlan - d * 0.004 - (load.get(m.id) || 0) * 26;
      if (sc > bestScore) { bestScore = sc; best = m; }
    }
    if (!best) continue;
    staff.fireAt.set(s.id, best.id);
    load.set(best.id, (load.get(best.id) || 0) + 1);
  }
}

/**
 * When the destroyers are let off the leash.
 *
 * A torpedo attack is a fleet decision, not a captain's: the flotilla goes in
 * together, at a moment when the range is right and there is something worth
 * spending them on. Until then they stay on the screen where they were put.
 */
function orderTorpedoes(state, staff, line, seen, want) {
  staff.torpRun.clear();
  const marks = seen.filter((c) => c.kind === 'ship').sort((a, b) => b.worth - a.worth);
  if (!marks.length) return;
  const prize = marks[0];
  for (const s of line) {
    const cls = getClass(s.classId);
    if (!cls.torpedoes) continue;
    const d = dist(s.x, s.z, prize.x, prize.z);
    // Inside twice the fish's range and worth the run. A destroyer sent in at
    // four times her torpedo range is a destroyer sunk on the way.
    if (d < cls.torpedoes.range * 2.1 && prize.worth >= 40) {
      staff.torpRun.add(s.id);
      staff.lastSignal = 'torpedoes';
    }
  }
  void want;
}

/**
 * The air.
 *
 * One target for the whole strike, and the strike goes when enough of it is
 * ready to go. Carrier aircraft sent off one deck at a time and aimed at
 * whatever each flight happened to see arrive over the enemy in ones and twos
 * and were shot down in ones and twos; a hundred aeroplanes arriving at one
 * ship in four minutes is what sank her.
 */
function orderAir(state, staff, seen) {
  const marks = seen.filter((c) => c.kind === 'ship').sort((a, b) => b.worth - a.worth);
  staff.strikeAt = marks.length ? marks[0].id : 0;
  // How many decks are ready. The staff holds the strike until at least half
  // of what it has can go together.
  let ready = 0;
  let decks = 0;
  for (const s of state.ships) {
    if (!s.alive || s.team !== staff.team) continue;
    const cls = getClass(s.classId);
    if (!cls.planes || !s.squadrons || !s.squadrons.length) continue;
    decks += 1;
    if (s.squadrons.some((q) => q.state === 'deck' && q.cooldown <= 0)) ready += 1;
  }
  staff.strikeReady = decks > 0 && ready >= Math.max(1, Math.ceil(decks / 2)) ? 1 : 0;
  // Every flight in the air is told what the strike is after, and every
  // fighter is told to stay with it.
  for (const p of state.planes) {
    if (p.dead || p.team !== staff.team) continue;
    if (p.pilot) continue;                               // a man is flying her
    p.orderTarget = staff.strikeAt;
    p.orderEscort = p.role === 'fighter' ? staff.strikeAt : 0;
  }
}

/** The guns ashore, given the target the staff wants down rather than the one
 *  each battery commander happens to like the look of. */
function orderBatteries(state, staff) {
  staff.batteryAt.clear();
  const load = new Map();
  for (const bat of state.batteries) {
    if (!bat.alive || bat.team !== staff.team) continue;
    const spec = BATTERIES[bat.batteryId];
    if (!spec) continue;
    let best = 0;
    let bestScore = -Infinity;
    for (const c of staff.contacts.values()) {
      if (c.kind !== 'ship') continue;
      const d = dist(bat.x, bat.z, c.x, c.z);
      if (d > spec.range * 0.98) continue;
      const sc = c.worth * 1.4 - d * 0.004 - (load.get(c.id) || 0) * 18;
      if (sc > bestScore) { bestScore = sc; best = c.id; }
    }
    if (best) {
      staff.batteryAt.set(bat.id, best);
      load.set(best, (load.get(best) || 0) + 1);
      bat.orderTarget = best;
    } else {
      bat.orderTarget = 0;
    }
  }
}

/**
 * The heavies.
 *
 * Level bombing from fifteen thousand feet at a warship under helm is very
 * nearly useless and the staff knows it, so the squadrons are sent where a
 * stick is worth laying: a coast battery, a ship that has been stopped, or --
 * failing either -- the largest thing afloat, on the chance she is hit hard
 * enough to slow down. Which of those it is, is a plan, and it is not on the
 * wire.
 *
 * With more than one squadron up they are dealt out rather than piled on: a
 * second vic laying a second stick on a battery the first one has already
 * wrecked is fourteen thousand pounds thrown away, and there is usually
 * something else ashore worth having.
 */
function orderHeavies(state, staff, seen) {
  const aims = [];
  for (const c of seen) {
    if (c.kind === 'battery') {
      // A gun position cannot move, which is the only thing a level bomber
      // asks of a target.
      aims.push({ x: c.x, z: c.z, id: 0, worth: 120 - dist(0, 0, c.x, c.z) * 0.001 });
      continue;
    }
    if (c.kind !== 'ship') continue;
    const s = state.ships.find((q) => q.id === c.id);
    const slow = s ? clamp(1 - s.speed / 12, 0, 1) : 0.4;
    // A stopped ship is worth four times a fast one to a level bomber, and
    // that is not a weighting, it is arithmetic: the aimer's error goes up
    // with her speed and everything else about the problem stays the same.
    aims.push({ x: c.x, z: c.z, id: c.id, worth: c.worth * (0.3 + slow * 1.6) });
  }
  aims.sort((a, b) => b.worth - a.worth);
  staff.bomberAt = aims.length ? aims[0] : null;
  if (!aims.length) return;
  // Each squadron takes the best target nobody else has been given, and falls
  // back to the best of the lot when there are more squadrons than targets.
  const taken = new Map();
  for (const bm of (state.bombers || [])) {
    if (!bm.alive || bm.team !== staff.team) continue;
    // Only between runs: a squadron on the bombing run is not re-aimed, and a
    // squadron that has let go is on her way out.
    if (bm.phase !== 'inbound') continue;
    let best = aims[0];
    let score = -Infinity;
    for (const a of aims) {
      // What she is worth, less what it costs to get there, less whatever is
      // already going to be laid on her.
      const sc = a.worth - dist(bm.x, bm.z, a.x, a.z) * 0.0015
        - (taken.get(a) || 0) * 70;
      if (sc > score) { score = sc; best = a; }
    }
    taken.set(best, (taken.get(best) || 0) + 1);
    bm.aimX = best.x;
    bm.aimZ = best.z;
    bm.targetId = best.id;
  }
}

/**
 * One turn of the staff's thought, for one side.
 *
 * Called every tick and does its work once a second; the rest of the time it
 * only takes reports, because a contact an hour old is worth nothing and one a
 * second old is worth everything.
 */
export function stepStaff(state, staff, dt) {
  gatherReports(state, staff);
  staff.think -= dt;
  if (staff.think > 0) return;
  staff.think = THINK;
  appreciate(state, staff);
}

/**
 * The station a ship has been given, as a point on the chart.
 *
 * Bearing is relative to the guide's own course, so the formation turns with
 * her: a ship stationed astern of the guide is astern of her whichever way she
 * is heading, which is the whole of what station-keeping means.
 */
export function stationPoint(state, staff, ship) {
  const st = staff.stations.get(ship.id);
  if (!st || !st.range) return null;
  const guide = state.ships.find((s) => s.id === staff.guideId && s.alive);
  if (!guide || guide.id === ship.id) return null;
  // Off the guide's actual heading, not off the course the staff has just
  // signalled. A ship keeps station on the ship ahead, not on the signal: work
  // it off the order and every station in the fleet jumps the instant the flag
  // goes up, while the guide is still putting her wheel over, and the whole
  // line spends the turn chasing a point that is not where anybody is.
  const a = wrapAngle(guide.heading + st.bearing);
  return {
    x: guide.x + Math.sin(a) * st.range,
    z: guide.z + Math.cos(a) * st.range,
    role: st.role,
  };
}
