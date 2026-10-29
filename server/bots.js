// Ship captains.
//
// Each of these fights one hull, and each of them has a mind of his own: his
// gunnery, his torpedoes, his damage control and his smoke are his, and he
// works them off what he can see out of his own bridge windows. What he is not
// is a free agent. He belongs to a fleet, and the fleet has a staff -- see
// command.js -- which holds the plot, decides the fighting course, gives him
// his station in the line and tells him who to concentrate on.
//
// The difference that makes is the whole of this file's history. A captain
// left to himself steers to hold his own preferred range from his own chosen
// target, and what a dozen captains doing that produces is a dozen ships
// sailing away from each other in a dozen directions with the enemy somewhere
// astern of all of them. A captain under orders holds his station on the guide,
// turns when the line turns, and puts his shells into the ship the staff wants
// down. That is a fleet action.
//
// He may still disobey, and there is one thing he disobeys for: a ship that is
// being beaten to pieces hauls out of the line. That is not running away, it
// is what a wrecked ship is supposed to do, and it is the only case in here
// where a captain's own judgement overrules his orders.

import { clamp, dist, headingTo, wrapAngle, angleDelta } from '../shared/math.js';
import { getClass } from '../shared/ships.js';
import { blockedByLand } from '../shared/world.js';
import {
  fireGuns, fireTorpedoes, launchStrike, leadPoint, solveBallistic, useRepair,
  useSmoke, canFire, steerToward, sonarContact, assignedReady, submerged, layMine,
  torpedoVisible, assignMount, mountBears, manGun, layGun, lightMounts, aaBattery,
  applyInput, gunsDrowned, directParties,
} from '../shared/sim.js';
import { stationPoint } from './command.js';
import { setLamp } from '../shared/searchlights.js';

const SKILL = { rookie: 0.45, regular: 0.7, veteran: 0.9 };

export function createBotBrain(skill = 'regular') {
  return {
    skill: SKILL[skill] ?? 0.7,
    targetId: 0,
    retarget: 0,
    fireTimer: 0,
    torpTimer: 4 + Math.random() * 6,
    wander: Math.random() * Math.PI * 2,
    kite: Math.random() < 0.5 ? 1 : -1,
    // Seconds left of getting clear of a ship she is fouled on. See clearFoul.
    clearing: 0,
    clearAway: 1,
  };
}

/**
 * Get her clear of a ship she has run into.
 *
 * Two hulls that have met stay locked together until one of them backs out of
 * it (see stepCollisions in sim.js), and a captain does not stand there with
 * his stem in another ship's side waiting for something to happen. If the
 * other ship is ahead of her she goes astern; if it is abeam or astern she
 * goes ahead and puts her helm away from it. Either way she keeps at it for a
 * few seconds once she is clear, so she does not drive straight back in.
 *
 * Returns whether she is busy getting clear.
 */
function clearFoul(state, ship, brain, dt) {
  brain.clearing = Math.max(0, (brain.clearing || 0) - dt);
  if (ship.fouled && (ship.foulT || 0) > 1.2 && brain.clearing <= 0) {
    const other = state.ships.find((s) => s.id === ship.fouled);
    if (other) {
      const off = angleDelta(ship.heading, headingTo(ship.x, ship.z, other.x, other.z));
      brain.clearAway = Math.abs(off) < 1.75 ? -1 : 1;
      brain.clearSide = off >= 0 ? -1 : 1;
      brain.clearing = 7;
    }
  }
  if (brain.clearing <= 0) return false;
  if (brain.clearAway < 0) {
    ship.notch = 0;
    ship.rudderCmd = 0;
  } else {
    ship.notch = 5;
    ship.rudderCmd = brain.clearSide || 1;
  }
  return true;
}

/**
 * Aground: get her off it. Whichever end is on the bottom, she is driven the
 * other way -- astern off a bow on the beach, ahead off a stern -- with the
 * wheel amidships, for long enough to come clear. Stranded, there is nothing
 * a captain can do with the engines, and he stops trying.
 */
function clearGround(state, ship, brain, dt) {
  brain.ungrounding = Math.max(0, (brain.ungrounding || 0) - dt);
  if (ship.stranded) return false;
  if (ship.aground > 0 && brain.ungrounding <= 0) {
    brain.groundAway = (ship.groundAt || 0) >= 0 ? -1 : 1;
    brain.ungrounding = 12;
  }
  if (brain.ungrounding <= 0) return false;
  ship.notch = brain.groundAway < 0 ? 0 : 4;
  ship.rudderCmd = 0;
  if (!ship.aground && brain.ungrounding < 6) brain.ungrounding = 0;
  return true;
}

/** Preferred fighting distance, as a fraction of main battery range. */
function preferredRange(cls) {
  switch (cls.type) {
    case 'DD': return 0.42;
    case 'CL': return 0.72;
    case 'CA': return 0.78;
    case 'BB': return 0.82;
    case 'CV': return 1.6;
    default: return 0.7;
  }
}

/**
 * One captain's turn of thought.
 *
 * `conned` says somebody else has the helm -- a human, working her off the
 * chart. Her gunnery officer, her torpedo officer and her damage control party
 * are still hers and still do their jobs; what she will not do is steer herself
 * or fly off her own aircraft. Those two belong to whoever is conning her.
 */
/**
 * The anti-submarine hunt.
 *
 * Returns whether she is running an attack, in which case her steering and her
 * telegraph belong to it and nothing else. Her guns go on firing at whatever
 * they were on: a destroyer depth charging a boat is still in the battle.
 *
 * The whole of it is speed. The set is drowned by her own flow noise much
 * above twenty knots, so she holds contact slowly; but a shallow pattern
 * dropped by a ship that is not moving goes off under her own quarterdeck, so
 * the moment the contact walks into the baffles she rings for everything she
 * has and runs over the plot. And then she keeps going, opens out, and comes
 * back round: a ship circling inside her own disturbance hears nothing at all.
 */
function hunt(state, ship, cls) {
  if (!cls.depthCharges || ship.dcLeft <= 0) return false;
  const got = sonarContact(state, ship);
  const at = got ? got.ship
    : (ship.dcTrack && ship.dcTrack.age < 70 ? ship.dcTrack : null);
  if (!at) return false;
  if (ship.dcHold > 0) {
    // Running out after the attack, to get clear of her own boiling water.
    steerToward(state, ship, headingTo(at.x, at.z, ship.x, ship.z));
    ship.notch = 5;
    return true;
  }
  steerToward(state, ship, headingTo(ship.x, ship.z, at.x, at.z));
  ship.notch = got ? 3 : 5;
  return true;
}

/**
 * A minelayer's captain, sowing.
 *
 * The mines go down where the enemy is going to be, and the one place a boat
 * running at forty knots can be sure of that is her own wake: anything
 * chasing her has to steam through it. So she lets one go whenever an enemy
 * ship is astern of her and closing, and keeps her way on while she does it.
 */
function sowMines(state, ship, cls) {
  if (!cls.mines || ship.mnLeft <= 0 || ship.mnCool > 0 || Math.abs(ship.speed) < 4) return;
  for (const foe of state.ships) {
    if (!foe.alive || foe.team === ship.team || submerged(foe)) continue;
    const d = dist(ship.x, ship.z, foe.x, foe.z);
    if (d > 3500 || d < 250) continue;
    // Astern of her, give or take a couple of points.
    const rel = wrapAngle(headingTo(ship.x, ship.z, foe.x, foe.z) - ship.heading);
    if (Math.abs(rel) < 2.1) continue;
    layMine(state, ship);
    return;
  }
}

/**
 * The mountings her captain has put on a ship by name, when her own gunnery
 * officer is not firing: his target is out of reach, or he has none, and a
 * turret or a bank laid on another ship has that ship inside its range. Only
 * those fire.
 */
function fireAssigned(state, ship, brain, cls, what) {
  if (what === 'guns') {
    if (brain.fireTimer > 0 || !canFire(ship) || !assignedReady(state, ship, 'main')) return;
    if (fireGuns(state, ship, null, { assignedOnly: true }) > 0) brain.fireTimer = 0.6 + (1 - brain.skill) * 2.5;
  } else if (cls.torpedoes && brain.torpTimer <= 0 && assignedReady(state, ship, 'torp')) {
    if (fireTorpedoes(state, ship, null, { assignedOnly: true }) > 0) brain.torpTimer = 12;
  }
}

export function stepBot(state, ship, brain, dt, conned = false, staff = null) {
  if (!ship.alive) return;
  const cls = getClass(ship.classId);
  brain.retarget -= dt;
  brain.fireTimer -= dt;
  brain.torpTimer -= dt;

  // What the fleet wants of him, and what he can see for himself. The order
  // wins on who to shoot at -- that is the concentration, and it is the whole
  // point of having a staff -- and his own eyes win on whether he can actually
  // see her.
  // A staged battle's script outranks the staff: the director has said who
  // she is shooting at (see server/stage.js).
  const ordered = brain.forced && isValidTarget(state, ship, brain.forced) ? brain.forced
    : staff ? staff.fireAt.get(ship.id) : 0;
  if (ordered && isValidTarget(state, ship, ordered)) {
    brain.targetId = ordered;
  } else if (brain.retarget <= 0 || !isValidTarget(state, ship, brain.targetId)) {
    brain.retarget = 2.5;
    brain.targetId = pickTarget(state, ship);
  }
  const target = state.ships.find((s) => s.id === brain.targetId);
  // On the ship as well as in the brain, so it goes out with her snapshot: a
  // captain watching one of his ships work wants to know what she is shooting
  // at, and the brain is the server's alone.
  ship.targetId = target ? target.id : 0;
  workLamps(state, ship, cls, target);
  // Fouled on another ship: getting clear comes before anything else she
  // might want to do with her helm.
  const clearing = !conned && (clearGround(state, ship, brain, dt) || clearFoul(state, ship, brain, dt));
  // Fish in the water coming at her: combing them comes before her station,
  // her target and her torpedo run.
  const comb = !conned && !clearing ? torpedoThreat(state, ship, cls) : null;
  // And shells falling round her: she does not hold a steady course for the
  // enemy's gunnery officer.
  evasion(state, ship, brain, cls, dt);

  // Damage control: put fires out once a couple are burning, or when badly hurt.
  if ((ship.fires >= 2 || ship.flooding >= 1 || ship.hp < ship.maxHp * 0.4) && ship.repairCd <= 0) {
    useRepair(state, ship);
  }
  // And her parties, sent where they are wanted rather than left to find out.
  if (state.tick % 30 === ship.id % 30) directParties(ship);
  // Her guns and her depth, which are a captain's to work as much as her helm.
  if (!conned) splitFire(state, ship, brain, cls, target);
  manFlak(state, ship, cls, brain, conned);
  workDive(state, ship, cls, brain, target, conned);
  if (!conned && !ship.secShell && cls.secondary) ship.secShell = cls.secondary.shells.he ? 'he' : 'ap';

  // Badly hurt: below a third of her and making water. She used to fall out of
  // the line here, put her helm over a hundred and fifty degrees and run, which
  // is the one thing a ship in this battle must never do -- it took the heaviest
  // hull on the board out of the action the moment she was hurt, and it looked
  // like cowardice because it was.
  //
  // She stays in. What being hurt changes is how she fights it: she closes,
  // because a ship this far gone has a short time left and the only use she can
  // put it to is getting her remaining guns close enough to tell.
  const hurt = ship.hp < ship.maxHp * 0.3 && (ship.flooding >= 2 || ship.fires >= 3);

  // Her aircraft go whether or not her guns have anything to shoot at: a
  // carrier's reach is her air group, not her five-inch.
  flyOff(state, ship, cls, staff, conned);
  if (!conned) sowMines(state, ship, cls);

  if (!target) {
    // Nothing afloat to fight. He keeps his station and the fleet keeps
    // looking -- which is a great deal better than a dozen hulls each going
    // off to look on their own.
    if (clearing) { /* backing clear of a ship she is fouled on */ } else if (conned) layAhead(ship);
    else if (comb) steerComb(state, ship, comb);
    else if (!keepStation(state, ship, brain, staff, dt)) patrol(state, ship, brain, dt);
    if (!conned && !clearing) avoidCollision(state, ship, cls, brain);
    shellShore(state, ship, brain, cls);
    fireAssigned(state, ship, brain, cls, 'guns');
    fireAssigned(state, ship, brain, cls, 'torps');
    return;
  }

  const d = dist(ship.x, ship.z, target.x, target.z);
  const bearingToTarget = headingTo(ship.x, ship.z, target.x, target.z);

  // Aim with lead, degraded by skill so rookies miss ahead of the bow wave.
  const sol = solveBallistic(cls.gun, clamp(d, 500, cls.gun.range));
  const lead = leadPoint(ship.x, ship.z, target, d / Math.max(0.5, sol.tof));
  const err = (1 - brain.skill) * d * 0.05;
  ship.aimX = lead.x + (Math.random() * 2 - 1) * err;
  ship.aimZ = lead.z + (Math.random() * 2 - 1) * err;

  if (!conned && !clearing) {
    if (comb) {
      steerComb(state, ship, comb);
    } else if (hunt(state, ship, cls)) {
      // A boat under her, and she is the only ship on the board that can do
      // anything about it. She comes off whatever else she was doing until the
      // contact is dead or lost: the racks fire themselves -- see
      // stepDepthAttack -- and the whole of the captain's part in an attack is
      // putting his stern over the plot at the right moment.
    } else if (hurt) {
      // Going down fighting, and going down closer. Twenty degrees off the
      // bearing so her broadside still bears rather than only her forward
      // turret, and everything the engine room has left.
      steerToward(state, ship, wrapAngle(bearingToTarget + brain.kite * 0.35 + brain.jinkOff));
      ship.notch = 5;
      brain.pressing = true;
    } else if (staff && staff.torpRun.has(ship.id) && cls.torpedoes) {
      // The flotilla is going in. Straight at her until the fish are away and
      // then out on the disengaged bow -- but only to the beam, never past it:
      // the retirement used to be a hundred and twenty-six degrees, which put
      // the enemy astern and the destroyer out of the battle for as long as it
      // took her to come round again.
      const run = brain.torpTimer > 8
        ? wrapAngle(bearingToTarget + brain.kite * Math.PI * 0.5)
        : wrapAngle(bearingToTarget + brain.kite * 0.30);
      steerToward(state, ship, run);
      ship.notch = 5;
    } else {
      // In the line. He steers the fleet course and holds his station on the
      // guide, and the only thing that moves him off it is the guide herself
      // turning.
      if (!keepStation(state, ship, brain, staff, dt)) {
        // No staff, or he is the guide: the fighting course, which keeps the
        // broadside bearing and the range where it is wanted. Never away --
        // and without a staff to work it out for him, never more than the beam
        // either, so a ship fighting on her own account still ends the minute
        // closer to the enemy than she started it.
        const want = staff ? staff.course
          : wrapAngle(bearingToTarget + brain.kite * Math.PI * 0.42);
        steerToward(state, ship, wrapAngle(want + brain.jinkOff));
        // Closing is done at everything she has. A fleet that ambles up to the
        // action at three-quarter speed arrives after it.
        ship.notch = 5;
      }
    }
  }

  // Whatever he wants of his helm, he does not want it into another ship.
  if (!conned && !clearing) avoidCollision(state, ship, cls, brain);

  // Destroyers duck into smoke when caught in the open.
  if (cls.smokeCharges && ship.smoke > 0 && ship.smokeActive <= 0 && ship.hp < ship.maxHp * 0.65 && d < cls.gun.range * 0.6) {
    useSmoke(state, ship);
  }

  const canSee = target.spottedBy[ship.team];
  // In an arcade battle nothing but range holds the guns: not the weather,
  // and not an island across the line of fire either.
  const clear = !!state.world?.arcade
    || !blockedByLand(state.world, ship.x, ship.z, target.x, target.z);
  if (canSee && clear && d < cls.gun.range * 0.95 && brain.fireTimer <= 0 && canFire(ship)) {
    // Unless her captain has said what she is loaded with, in which case
    // that is what she fires.
    if (!ship.shellSet) ship.shellType = pickShell(cls, getClass(target.classId), d);
    if (fireGuns(state, ship) > 0) brain.fireTimer = 0.6 + (1 - brain.skill) * 2.5;
  } else {
    fireAssigned(state, ship, brain, cls, 'guns');
  }

  if (cls.torpedoes && canSee && clear && brain.torpTimer <= 0 && d < cls.torpedoes.range * 0.85) {
    const tSol = leadPoint(ship.x, ship.z, target, cls.torpedoes.speed);
    const saveAimX = ship.aimX, saveAimZ = ship.aimZ;
    ship.aimX = tSol.x; ship.aimZ = tSol.z;
    if (fireTorpedoes(state, ship) > 0) brain.torpTimer = 12;
    ship.aimX = saveAimX; ship.aimZ = saveAimZ;
  } else {
    fireAssigned(state, ship, brain, cls, 'torps');
  }
}

/**
 * A carrier's air officer sending off whatever is ready.
 *
 * A conned ship's aircraft are her captain's to send, and nobody else's --
 * unless he has told her air officer to send them himself (`autoLaunch`),
 * in which case they go the way every other carrier's do.
 *
 * Everybody else's go the moment they can go, at the first enemy anybody on
 * her side has spotted. A squadron ranged on a deck is a squadron doing
 * nothing. This used to wait for a ship inside her own gun range -- a
 * carrier's guns reach a fraction of what her aircraft do, so she sat on a
 * full deck with the enemy reported and in reach of her strike.
 *
 * The range she launches at is half again what a flight can reach, because
 * the target is coming towards her and the strike takes several minutes to
 * get out; the point she sends them at is brought inside the radius, and the
 * aircraft find the ship themselves from there.
 */
function flyOff(state, ship, cls, staff, conned) {
  if (!cls.planes || (conned && !ship.autoLaunch)) return;
  const reach = cls.planes.strikeRange * 1.5;
  let mark = staff && staff.strikeAt
    ? state.ships.find((q) => q.id === staff.strikeAt && q.alive && q.spottedBy[ship.team]) : null;
  if (!mark) {
    let bestD = reach;
    for (const q of state.ships) {
      if (!q.alive || q.team === ship.team || !q.spottedBy[ship.team]) continue;
      const d = dist(ship.x, ship.z, q.x, q.z);
      if (d < bestD) { bestD = d; mark = q; }
    }
  }
  if (!mark || dist(ship.x, ship.z, mark.x, mark.z) >= reach) return;
  const p = leadPoint(ship.x, ship.z, mark, cls.planes.cruiseSpeed);
  // Inside what launchStrike will accept.
  const d = dist(ship.x, ship.z, p.x, p.z);
  const most = cls.planes.strikeRange * 0.98;
  const k = d > most ? most / d : 1;
  const saveAimX = ship.aimX, saveAimZ = ship.aimZ;
  ship.aimX = ship.x + (p.x - ship.x) * k;
  ship.aimZ = ship.z + (p.z - ship.z) * k;
  launchStrike(state, ship);
  ship.aimX = saveAimX; ship.aimZ = saveAimZ;
}

/**
 * Keeping station.
 *
 * The one behaviour that turns a collection of hulls into a fleet. His station
 * is a bearing and a distance from the guide -- the flagship -- so it moves and
 * turns with her, and he follows her: her course, not the one on the signal
 * pad, because she is the ship he can see and the one going into the action.
 *
 * He steers for a point a little ahead of his station along her course, so he
 * comes up into it rather than across it, and he is never put more than a
 * right angle off her heading to get there. A ship that finds herself ahead
 * of her station used to put her helm over and steam back to it -- straight
 * away from the enemy -- and that, more than anything, was the fleet turning
 * out of the battle. Now she holds the flagship's course and eases until her
 * station comes up to her. Astern of it she cracks on.
 *
 * Returns false when he has no station to keep, which is the guide's case and
 * the submarine's, and they steer for themselves.
 */
const LEAD = 900;
function keepStation(state, ship, brain, staff, dt) {
  if (!staff) return false;
  const at = stationPoint(state, staff, ship);
  if (!at) return false;
  const guide = state.ships.find((q) => q.id === staff.guideId && q.alive);
  const gh = guide ? guide.heading : staff.course;
  const fx = Math.sin(gh);
  const fz = Math.cos(gh);
  const dx = at.x - ship.x;
  const dz = at.z - ship.z;
  // How far her station is ahead of her, along the flagship's course.
  const along = dx * fx + dz * fz;
  const want = headingTo(ship.x, ship.z, at.x + fx * LEAD, at.z + fz * LEAD);
  const off = clamp(angleDelta(gh, want), -Math.PI * 0.45, Math.PI * 0.45);
  // Zigzagging on her station when she is under fire, by half what a ship on
  // her own would: enough to throw a salvo off, not enough to foul the line.
  steerToward(state, ship, wrapAngle(gh + off + (brain.jinkOff || 0) * 0.5));
  // The flagship's speed, and the difference made up on it. A human flag may
  // be going astern or stopped; the fleet does not go astern after her, it
  // stops with her.
  const gn = guide ? clamp(guide.notch ?? 5, 1, 5) : 5;
  if (along > 1500) ship.notch = 5;
  else if (along > 200) ship.notch = Math.min(5, gn + 1);
  else if (along < -1500) ship.notch = Math.max(1, gn - 3);
  else if (along < -200) ship.notch = Math.max(2, gn - 1);
  else ship.notch = gn;
  void brain;
  void dt;
  return true;
}

/**
 * Keeping clear of other ships.
 *
 * A captain does not steer for his station, his target or his torpedo run
 * with his eyes shut. Every ship within a couple of miles is watched for where
 * she will be against where he will be -- the closest the two will come on
 * their present courses and speeds, and how soon -- and one that is going to
 * pass closer than the two hulls and a margin can stand is acted on: the wheel
 * put over away from where she will be, harder the closer and sooner it is,
 * and the engines eased if she is ahead and close. Head on, both go to
 * starboard and pass port to port, which is the rule of the road and the
 * reason two ships doing this never turn into each other.
 *
 * Friend and enemy alike, and a wreck too: thirty thousand tons going down is
 * as hard as thirty thousand tons fighting. A boat down under everybody's keel
 * is not in the way. Returns whether he altered for anybody.
 */
const LOOK_AHEAD = 70;
const WATCH_RANGE = 3200;
function avoidCollision(state, ship, cls, brain) {
  const h = ship.heading;
  const v = Math.max(0, ship.speed || 0);
  const vx = Math.sin(h) * v;
  const vz = Math.cos(h) * v;
  let worst = null;
  let worstUrgency = 0;
  for (const o of state.ships) {
    if (o === ship) continue;
    if (!o.alive && !(o.sinking && !o.sinking.under)) continue;
    const ocls = getClass(o.classId);
    if ((ocls.dive && submerged(o)) || (cls.dive && submerged(ship))) continue;
    const dx = o.x - ship.x;
    const dz = o.z - ship.z;
    const d = Math.hypot(dx, dz);
    if (d > WATCH_RANGE) continue;
    const ov = o.alive ? Math.max(0, o.speed || 0) : 0;
    const rvx = Math.sin(o.heading) * ov - vx;
    const rvz = Math.cos(o.heading) * ov - vz;
    const rv2 = rvx * rvx + rvz * rvz;
    const tc = rv2 > 1e-3 ? clamp(-(dx * rvx + dz * rvz) / rv2, 0, LOOK_AHEAD) : 0;
    const cx = dx + rvx * tc;
    const cz = dz + rvz * tc;
    const cpa = Math.hypot(cx, cz);
    // Two hulls end to end is the worst case of how they can meet, and room
    // to spare on top of it.
    const safe = (cls.hull.length + ocls.hull.length) * 0.5 + 160;
    if (cpa >= safe) continue;
    const urgency = (1 - cpa / safe) + (1 - tc / LOOK_AHEAD);
    if (urgency > worstUrgency) {
      worstUrgency = urgency;
      worst = { o, d, cx, cz, cpa, tc, safe, closing: dx * rvx + dz * rvz < 0 };
    }
  }
  brain.avoiding = worst ? worst.o.id : 0;
  if (!worst) return false;
  // Which side she will be on when she is closest, and away from it. Dead
  // ahead or dead astern, starboard.
  const at = angleDelta(h, Math.atan2(worst.cx, worst.cz));
  const side = Math.abs(at) < 0.12 || Math.abs(at) > Math.PI - 0.12 ? 1 : -Math.sign(at);
  const turn = clamp(0.35 + worstUrgency * 0.5, 0.35, 1.3);
  steerToward(state, ship, wrapAngle(h + side * turn));
  // And off the engines when she is ahead, close and being closed: way is
  // what does the damage. Not all the way off, though, and not for a ship that
  // is already opening: a ship with no way on her cannot steer, and two of
  // them stopped bow to bow wait for each other for the rest of the action.
  const ahead = Math.abs(angleDelta(h, headingTo(ship.x, ship.z, worst.o.x, worst.o.z))) < 1.0;
  if (ahead && worst.closing && worst.d < worst.safe * 3) {
    ship.notch = Math.min(ship.notch, worst.d < worst.safe * 1.6 ? 2 : 3);
  }
  return true;
}

/**
 * Lay the guns on the nearest enemy battery inside them and open fire.
 *
 * High explosive: there is no citadel in a gun pit and no belt to beat, only a
 * shield and the crew behind it. Returns whether anything was engaged.
 */
function shellShore(state, ship, brain, cls) {
  let best = null;
  let bestD = Infinity;
  for (const b of state.batteries) {
    if (!b.alive || b.team === ship.team) continue;
    const d = dist(ship.x, ship.z, b.x, b.z);
    if (d > cls.gun.range * 0.95 || d >= bestD) continue;
    best = b;
    bestD = d;
  }
  if (!best) { ship.firingBat = 0; return false; }
  ship.firingBat = best.id;
  ship.aimX = best.x;
  ship.aimZ = best.z;
  if (brain.fireTimer <= 0 && canFire(ship)) {
    if (!ship.shellSet) ship.shellType = cls.gun.shells.he ? 'he' : 'ap';
    if (fireGuns(state, ship) > 0) brain.fireTimer = 0.6 + (1 - brain.skill) * 2.5;
  }
  return true;
}

function pickShell(cls, targetCls, d) {
  if (!cls.gun.shells.he) return 'ap';
  // AP into fat armoured broadsides, HE into anything thin or far away.
  if (targetCls.type === 'DD' || targetCls.type === 'CV') return 'he';
  if (cls.type === 'BB') return 'ap';
  if (targetCls.armor.belt > cls.gun.shells.ap.pen * 1.3) return 'he';
  return d < cls.gun.range * 0.6 ? 'ap' : 'he';
}

function isValidTarget(state, ship, id) {
  const t = state.ships.find((s) => s.id === id);
  return !!t && t.alive && t.spottedBy[ship.team];
}

function pickTarget(state, ship) {
  let best = 0, bestScore = -Infinity;
  const cls = getClass(ship.classId);
  for (const s of state.ships) {
    if (!s.alive || s.team === ship.team || !s.spottedBy[ship.team]) continue;
    const d = dist(ship.x, ship.z, s.x, s.z);
    if (d > cls.gun.range * 1.1) continue;
    const sc = getClass(s.classId);
    // Prefer close, hurt, and squishy.
    let score = -d / 1000 + (1 - s.hp / s.maxHp) * 4 + (sc.type === 'CV' ? 5 : 0);
    // The ship shooting at her is the one she answers: that is the duel the
    // whole of her gunnery is for.
    if (s.targetId === ship.id) score += 2.5;
    // A destroyer or a boat inside her own torpedo range is the most
    // dangerous thing on the sea, whatever she looks like on the plot.
    if (sc.torpedoes && d < sc.torpedoes.range * 0.9 && (sc.type === 'DD' || sc.type === 'SS')) score += 3;
    // And one her guns can actually hurt: an armour-piercing shell that
    // cannot beat a belt and a high-explosive one into a battleship's side
    // are both wasted, so a cruiser does not spend the action on a battleship
    // while a heavy cruiser is in reach.
    const pen = cls.gun.shells.ap ? cls.gun.shells.ap.pen : 0;
    if (pen < sc.armor.belt * 0.7 && sc.type === 'BB') score -= 2;
    // And the ship she was on, so she is not swung between two ships of a
    // line for the sake of a few hundred metres.
    if (s.id === ship.targetId) score += 1.2;
    if (score > bestScore) { bestScore = score; best = s.id; }
  }
  return best;
}

/**
 * Nothing in sight: go and look for the enemy.
 *
 * She used to steer for whichever circle on the chart her side did not own,
 * which is what a captain does in a game about circles. There are no circles
 * now, so she does what a captain in a fleet action does: closes the enemy's
 * last known position, or the middle of the sea if nobody has reported one.
 */
function patrol(state, ship, brain, dt) {
  ship.notch = 4;
  let goal = null;
  let near = Infinity;
  for (const s of state.ships) {
    if (!s.alive || s.team === ship.team) continue;
    const d = dist(ship.x, ship.z, s.x, s.z);
    if (d < near) { near = d; goal = { x: s.x, z: s.z }; }
  }
  if (!goal) goal = { x: 0, z: 0 };
  steerToward(state, ship, headingTo(ship.x, ship.z, goal.x, goal.z));
  layAhead(ship);
}

// ---------------------------------------------------------------------------
// What a captain does that a gunnery officer does not
// ---------------------------------------------------------------------------

/**
 * The torpedo she has to do something about: the soonest of those her side
 * can see that will pass inside her length on present courses, with time
 * enough left in its run to get there. Null when there is none.
 */
const COMB_LOOK = 50;
function torpedoThreat(state, ship, cls) {
  if (!state.torps || !state.torps.length) return null;
  if (cls.dive && submerged(ship)) return null;
  let worst = null;
  const v = Math.max(0, ship.speed || 0);
  const svx = Math.sin(ship.heading) * v;
  const svz = Math.cos(ship.heading) * v;
  const close = cls.hull.length * 0.5 + 45;
  for (const tp of state.torps) {
    if (tp.team === ship.team) continue;
    if (tp.aboard) continue;
    const dx = tp.x - ship.x;
    const dz = tp.z - ship.z;
    if (dx * dx + dz * dz > 7000 * 7000) continue;
    if (!torpedoVisible(state, tp, ship.team)) continue;
    const sp = tp.speed || 0;
    const left = Math.max(0, ((tp.range || 0) - (tp.travelled || 0)) / Math.max(1, sp));
    const rvx = Math.sin(tp.heading) * sp - svx;
    const rvz = Math.cos(tp.heading) * sp - svz;
    const rv2 = rvx * rvx + rvz * rvz;
    if (rv2 < 1e-3) continue;
    const tc = -(dx * rvx + dz * rvz) / rv2;
    if (tc < 0 || tc > Math.min(COMB_LOOK, left)) continue;
    const cpa = Math.hypot(dx + rvx * tc, dz + rvz * tc);
    if (cpa > close) continue;
    if (!worst || tc < worst.tc) worst = { tp, tc, cpa };
  }
  return worst;
}

/**
 * Comb the track: turn end-on to the fish, toward it or away from it,
 * whichever is the smaller turn, at everything she has. End-on she is a few
 * metres of target instead of the whole of her length, and a spread fired at
 * her beam goes down either side.
 */
function steerComb(state, ship, comb) {
  const h = comb.tp.heading;
  const away = wrapAngle(h);
  const into = wrapAngle(h + Math.PI);
  const pick = Math.abs(angleDelta(ship.heading, away)) < Math.abs(angleDelta(ship.heading, into))
    ? away : into;
  steerToward(state, ship, pick);
  ship.notch = 5;
}

/**
 * Zigzag under fire.
 *
 * A gunnery officer lays his next salvo where his last one says she will be,
 * and a ship that holds a steady course is giving him that. So when shells
 * are coming down round her she alters every so often -- a few points one
 * way, then the other -- which is what a captain chasing salvoes does. The
 * offset is left on the brain (`jinkOff`) for whatever is steering her to add
 * to its course.
 */
function evasion(state, ship, brain, cls, dt) {
  brain.jinkOff = brain.jinkOff || 0;
  if (state.tick % 10 === ship.id % 10) {
    for (const sh of state.shells) {
      if (sh.team === ship.team || sh.fuse || !sh.g) continue;
      // Where it comes down, and where she will be by then.
      const disc = sh.vy * sh.vy + 2 * sh.g * Math.max(0, sh.y);
      const t = (sh.vy + Math.sqrt(disc)) / sh.g;
      if (!(t > 0) || t > 60) continue;
      const ix = sh.x + sh.vx * t;
      const iz = sh.z + sh.vz * t;
      const v = ship.speed || 0;
      const px = ship.x + Math.sin(ship.heading) * v * t;
      const pz = ship.z + Math.cos(ship.heading) * v * t;
      if ((ix - px) ** 2 + (iz - pz) ** 2 < 420 * 420) { brain.fireAt = state.t; break; }
    }
  }
  const hot = state.t - (brain.fireAt ?? -1e9) < 14;
  // A destroyer swings hard and often; a battleship a few degrees, slowly.
  const amp = { DD: 0.5, SS: 0.4, CL: 0.34, CA: 0.3, CV: 0.3, BB: 0.2 }[cls.type] ?? 0.3;
  const period = { DD: 14, SS: 18, CL: 20, CA: 22, CV: 24, BB: 30 }[cls.type] ?? 22;
  brain.jinkT = (brain.jinkT || 0) + dt;
  const want = hot ? amp * brain.skill * (Math.sin((brain.jinkT / period) * Math.PI * 2) >= 0 ? 1 : -1) : 0;
  // Eased onto, so the wheel is put over rather than snapped.
  brain.jinkOff += clamp(want - brain.jinkOff, -0.25 * dt, 0.25 * dt);
}

/**
 * Split her fire.
 *
 * A turret that cannot bear on the ship her gunnery officer is fighting --
 * the after turrets with the enemy fine on the bow, say -- is put on the best
 * other ship it can bear on, off the same targeting panel a captain uses, and
 * given back the moment it can bear again. Only mountings she put on a ship
 * herself are ever taken off one: whatever her captain has given a target is
 * his. Not on a ship somebody is conning: her targeting panel is his.
 */
function splitFire(state, ship, brain, cls, target) {
  if (state.tick % 30 !== ship.id % 30 || !ship.turrets.length) return;
  if (gunsDrowned(ship)) return;
  brain.split = brain.split || new Set();
  const range = cls.gun.range * 0.95;
  const tb = target ? headingTo(ship.x, ship.z, target.x, target.z) : 0;
  const tIn = target && dist(ship.x, ship.z, target.x, target.z) < range;
  for (const t of ship.turrets) {
    const key = `main:${t.id}`;
    const mine = brain.split.has(key);
    if (ship.assign && ship.assign[key] && !mine) continue;
    const spec = cls.turrets[t.id];
    if (!target || (tIn && mountBears(ship, spec, tb))) {
      if (mine) { assignMount(state, ship, 'main', t.id, 0); brain.split.delete(key); }
      continue;
    }
    let best = null;
    let bestV = -Infinity;
    for (const s of state.ships) {
      if (!s.alive || s.team === ship.team || !s.spottedBy[ship.team] || s.id === target.id) continue;
      const d = dist(ship.x, ship.z, s.x, s.z);
      if (d > range) continue;
      if (!mountBears(ship, spec, headingTo(ship.x, ship.z, s.x, s.z))) continue;
      if (!state.world?.arcade && blockedByLand(state.world, ship.x, ship.z, s.x, s.z)) continue;
      const v = -d / 1000 + (1 - s.hp / s.maxHp) * 3;
      if (v > bestV) { bestV = v; best = s; }
    }
    if (best) {
      if (!ship.assign || ship.assign[key] !== best.id) assignMount(state, ship, 'main', t.id, best.id);
      brain.split.add(key);
    } else if (mine) {
      assignMount(state, ship, 'main', t.id, 0);
      brain.split.delete(key);
    }
  }
}

/**
 * Go down to a close-range mounting when there are aeroplanes about.
 *
 * A pair of hands on a mounting walking its own tracer onto an aeroplane is
 * worth more than the director's barrage (MANNED_AA in sim.js), and a captain
 * who has nothing better to do with his own while a strike comes in goes and
 * does it. He takes the heaviest automatic gun that bears on the nearest
 * aeroplane coming at her, holds it on her, and gives it back when the sky is
 * clear. Not on a ship somebody is conning: her guns are his to man.
 */
function manFlak(state, ship, cls, brain, conned) {
  if (conned || !cls.aa) return;
  if (ship.manned && ship.manned.k !== 'aa') return;
  const lm = lightMounts(cls);
  if (!lm.length || gunsDrowned(ship)) return;
  let foe = null;
  let foeV = Infinity;
  for (const p of state.planes || []) {
    if (p.dead || p.team === ship.team || p.phase === 'landing') continue;
    const d = dist(ship.x, ship.z, p.x, p.z);
    if (d > cls.aa.range) continue;
    // The one coming for her, and the ones with something to drop, first.
    const v = d - (p.targetId === ship.id ? 900 : 0) - ((p.torp || p.bomb) && !p.dropped ? 600 : 0);
    if (v < foeV) { foeV = v; foe = p; }
  }
  if (!foe) {
    if (brain.manning) { manGun(ship, {}); brain.manning = false; }
    return;
  }
  const battery = aaBattery(cls);
  const at = battery.length - lm.length;
  const b = headingTo(ship.x, ship.z, foe.x, foe.z);
  const d = dist(ship.x, ship.z, foe.x, foe.z);
  const dp = new Set();
  let n = 0;
  for (const g of cls.aa.guns || []) {
    for (let j = 0; j < g.mounts.length; j++) { if (g.role === 'dp') dp.add(n + j); }
    n += g.mounts.length;
  }
  let pick = -1;
  let pickV = -Infinity;
  for (let i = 0; i < lm.length; i++) {
    const m = battery[at + i];
    if (!m || dp.has(i) || d > m.range || !mountBears(ship, m, b)) continue;
    const v = m.caliber * m.guns;
    if (v > pickV) { pickV = v; pick = i; }
  }
  if (pick < 0) {
    if (brain.manning) { manGun(ship, {}); brain.manning = false; }
    return;
  }
  if (!ship.manned || ship.manned.i !== pick) {
    manGun(ship, { k: 'aa', i: pick });
    // Her own captain at the gun, not a player: the tracer stays on the
    // battery's rhythm rather than going out with every tick (see stepPlanes).
    if (ship.manned) ship.manned.auto = true;
  }
  brain.manning = true;
  layGun(ship, { x: foe.x, z: foe.z, y: foe.y ?? 200 });
}

/**
 * A submarine captain's depth.
 *
 * Down to periscope depth to make an attack and to keep out of sight, deep
 * the moment something that can hunt her -- a ship with depth charges, or an
 * aeroplane -- is close, and up on the surface to charge her air and make
 * her speed when there is nothing about. A boat that has come up for air
 * stays up until she has most of it back, unless she is found.
 */
function workDive(state, ship, cls, brain, target, conned) {
  if (!cls.dive || conned) return;
  const D = cls.dive;
  let asw = Infinity;
  let near = Infinity;
  for (const s of state.ships) {
    if (!s.alive || s.team === ship.team) continue;
    const d = dist(ship.x, ship.z, s.x, s.z);
    near = Math.min(near, d);
    if (getClass(s.classId).depthCharges) asw = Math.min(asw, d);
  }
  let air = Infinity;
  for (const p of state.planes || []) {
    if (p.dead || p.team === ship.team) continue;
    air = Math.min(air, dist(ship.x, ship.z, p.x, p.z));
  }
  const o2 = ship.oxygen / Math.max(1, D.oxygen);
  const hunted = asw < 3500 || air < 3000;
  if (brain.blowing && (o2 > 0.75 || asw < 2200 || air < 1800)) brain.blowing = false;
  let want;
  if (brain.blowing) want = 0;
  else if (hunted) want = o2 > 0.06 ? D.max * 0.85 : 0;
  else if (near < 10000 || (target && cls.torpedoes
    && dist(ship.x, ship.z, target.x, target.z) < cls.torpedoes.range * 1.3)) {
    want = o2 > 0.2 ? D.periscope : 0;
  } else want = 0;
  if (want === 0 && o2 < 0.3) brain.blowing = true;
  if (ship.depthCmd !== want) applyInput(ship, { depth: want });
  // Deep and being hunted: slow, because her own screws are what the set
  // above her is listening for.
  if (hunted && want > D.periscope && asw < 2500) ship.notch = Math.min(ship.notch, 3);
}

/** Nothing in sight: the guns train ahead and wait. */
function layAhead(ship) {
  ship.aimX = ship.x + Math.sin(ship.heading) * 5000;
  ship.aimZ = ship.z + Math.cos(ship.heading) * 5000;
}

export const BOT_NAMES = [
  'Halsey', 'Spruance', 'Cunningham', 'Lütjens', 'Nagumo', 'Vian', 'Tovey',
  'Mikawa', 'Burke', 'Somerville', 'Ciliax', 'Tanaka', 'Lee', 'Oldendorf',
];

/**
 * Her searchlights, at night or in a fog: on the ship she is fighting once
 * she is close enough for a lamp to find it, and dark otherwise. A lit lamp
 * gives her away to everybody (see stepDetection), so she only shows one when
 * she is already engaged and near -- which is when they were used: to hold a
 * target the guns had found, in the last few thousand yards of a night action.
 */
export const LAMP_RANGE = 6000;
function workLamps(state, ship, cls, target) {
  if (!ship.lamps || !ship.lamps.length) return;
  const dark = state.world?.time === 'night' || state.world?.fog;
  const d = target ? dist(ship.x, ship.z, target.x, target.z) : Infinity;
  const want = !!(dark && target && d < LAMP_RANGE
    && target.spottedBy?.[ship.team] && !(cls.dive && ship.depth > 0.6));
  const bearing = target ? wrapAngle(headingTo(ship.x, ship.z, target.x, target.z) - ship.heading) : 0;
  ship.lamps.forEach((l, k) => {
    // The bridge pair only, and only the one on the side she bears on: the
    // lamp on the far wing would be shining across her own bridge.
    const side = ship.lamps.length === 1 ? 0 : (k % 2 === 0 ? 1 : -1);
    const fwd = ship.lamps.length < 4 || k < 2;
    const bears = side === 0 || Math.sign(bearing) === side || Math.abs(bearing) < 0.3;
    const on = want && fwd && bears;
    if (on === l.on && (!on || Math.abs(angleDelta(l.yaw, bearing)) < 0.02)) return;
    setLamp(ship, cls, { k, on, yaw: bearing, pitch: on ? -Math.atan2(14, Math.max(200, d)) : l.pitch });
  });
}
