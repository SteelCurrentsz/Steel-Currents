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
  useSmoke, canFire, steerToward,
} from '../shared/sim.js';
import { stationPoint } from './command.js';

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
  };
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
  const ordered = staff ? staff.fireAt.get(ship.id) : 0;
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

  // Damage control: put fires out once a couple are burning, or when badly hurt.
  if ((ship.fires >= 2 || ship.flooding >= 1 || ship.hp < ship.maxHp * 0.4) && ship.repairCd <= 0) {
    useRepair(state, ship);
  }

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

  if (!target) {
    // Nothing afloat to fight. He keeps his station and the fleet keeps
    // looking -- which is a great deal better than a dozen hulls each going
    // off to look on their own.
    if (conned) layAhead(ship);
    else if (!keepStation(state, ship, brain, staff, dt)) patrol(state, ship, brain, dt);
    shellShore(state, ship, brain, cls);
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

  if (!conned) {
    if (hurt) {
      // Going down fighting, and going down closer. Twenty degrees off the
      // bearing so her broadside still bears rather than only her forward
      // turret, and everything the engine room has left.
      steerToward(state, ship, wrapAngle(bearingToTarget + brain.kite * 0.35));
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
        steerToward(state, ship, want);
        // Closing is done at everything she has. A fleet that ambles up to the
        // action at three-quarter speed arrives after it.
        ship.notch = 5;
      }
    }
  }

  // Destroyers duck into smoke when caught in the open.
  if (cls.smokeCharges && ship.smoke > 0 && ship.smokeActive <= 0 && ship.hp < ship.maxHp * 0.65 && d < cls.gun.range * 0.6) {
    useSmoke(state, ship);
  }

  const canSee = target.spottedBy[ship.team];
  const clear = !blockedByLand(state.world, ship.x, ship.z, target.x, target.z);
  if (canSee && clear && d < cls.gun.range * 0.95 && brain.fireTimer <= 0 && canFire(ship)) {
    ship.shellType = pickShell(cls, getClass(target.classId), d);
    if (fireGuns(state, ship) > 0) brain.fireTimer = 0.6 + (1 - brain.skill) * 2.5;
  }

  if (cls.torpedoes && canSee && clear && brain.torpTimer <= 0 && d < cls.torpedoes.range * 0.85) {
    const tSol = leadPoint(ship.x, ship.z, target, cls.torpedoes.speed);
    const saveAimX = ship.aimX, saveAimZ = ship.aimZ;
    ship.aimX = tSol.x; ship.aimZ = tSol.z;
    if (fireTorpedoes(state, ship) > 0) brain.torpTimer = 12;
    ship.aimX = saveAimX; ship.aimZ = saveAimZ;
  }

  // A conned ship's aircraft are her captain's to send, and nobody else's.
  //
  // Everybody else's go the moment they can go. A squadron ranged on a deck is
  // a squadron doing nothing, and a carrier with her aircraft aboard is a
  // target rather than a warship -- so she flies them off as soon as they are
  // fuelled and the lift is clear, and they close the last of the distance
  // themselves.
  //
  // The range she launches at is half again what a flight can reach, because
  // the target is coming towards her and the strike takes several minutes to
  // form up and get out. Holding them on deck until the enemy was inside the
  // radius of action meant a carrier waited to be attacked before answering.
  if (!conned && cls.planes) {
    const mark = staff && staff.strikeAt
      ? state.ships.find((q) => q.id === staff.strikeAt && q.alive) : target;
    const reach = cls.planes.strikeRange * 1.5;
    if (mark && dist(ship.x, ship.z, mark.x, mark.z) < reach) {
      const p = leadPoint(ship.x, ship.z, mark, cls.planes.cruiseSpeed);
      const saveAimX = ship.aimX, saveAimZ = ship.aimZ;
      ship.aimX = p.x; ship.aimZ = p.z;
      launchStrike(state, ship);
      ship.aimX = saveAimX; ship.aimZ = saveAimZ;
    }
  }
}

/**
 * Keeping station.
 *
 * The one behaviour that turns a collection of hulls into a fleet. His station
 * is a bearing and a distance from the guide, so it moves and turns with her;
 * he steers for it, and once he is on it he steers the fleet course like
 * everybody else. Out of station he uses the difference in speed to get back
 * -- ahead of station he eases, astern of it he cracks on.
 *
 * Returns false when he has no station to keep, which is the guide's case and
 * the submarine's, and they steer for themselves.
 */
function keepStation(state, ship, brain, staff, dt) {
  if (!staff) return false;
  const at = stationPoint(state, staff, ship);
  if (!at) return false;
  const d = dist(ship.x, ship.z, at.x, at.z);
  const cls = getClass(ship.classId);
  if (d > 260) {
    // Not on it. Steer for it, and put on whatever she needs to close the
    // gap -- a ship two miles out of station is no use to anybody.
    steerToward(state, ship, headingTo(ship.x, ship.z, at.x, at.z));
    ship.notch = d > 1200 ? 5 : 4;
  } else {
    // On it. Steer the fleet course, and hold the guide's speed -- hers, not a
    // number written down here. The guide cracks on at everything she has now,
    // so a line holding three-quarters could never stay with her: every ship in
    // it fell out of station, worked up to full to catch her, eased back, and
    // dropped astern again for the whole action.
    steerToward(state, ship, staff.course);
    const guide = state.ships.find((q) => q.id === staff.guideId && q.alive);
    ship.notch = guide ? guide.notch : 5;
  }
  void brain;
  void dt;
  void cls;
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
  if (!best) return false;
  ship.aimX = best.x;
  ship.aimZ = best.z;
  if (brain.fireTimer <= 0 && canFire(ship)) {
    ship.shellType = cls.gun.shells.he ? 'he' : 'ap';
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
    // Prefer close, hurt, and squishy.
    const score = -d / 1000 + (1 - s.hp / s.maxHp) * 4 + (getClass(s.classId).type === 'CV' ? 5 : 0);
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

/** Nothing in sight: the guns train ahead and wait. */
function layAhead(ship) {
  ship.aimX = ship.x + Math.sin(ship.heading) * 5000;
  ship.aimZ = ship.z + Math.cos(ship.heading) * 5000;
}

export const BOT_NAMES = [
  'Halsey', 'Spruance', 'Cunningham', 'Lütjens', 'Nagumo', 'Vian', 'Tovey',
  'Mikawa', 'Burke', 'Somerville', 'Ciliax', 'Tanaka', 'Lee', 'Oldendorf',
];
