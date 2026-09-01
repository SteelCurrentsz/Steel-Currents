// Bot captains. Each bot picks a target it can actually see, opens the range
// or closes it depending on what it is driving, and fires when a firing
// solution is good enough — the same public sim API a human player drives.

import { clamp, dist, headingTo, wrapAngle, angleDelta } from '../shared/math.js';
import { getClass } from '../shared/ships.js';
import { blockedByLand } from '../shared/world.js';
import {
  fireGuns, fireTorpedoes, launchStrike, leadPoint, solveBallistic, useRepair,
  useSmoke, canFire, steerToward,
} from '../shared/sim.js';

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
export function stepBot(state, ship, brain, dt, conned = false) {
  if (!ship.alive) return;
  const cls = getClass(ship.classId);
  brain.retarget -= dt;
  brain.fireTimer -= dt;
  brain.torpTimer -= dt;

  if (brain.retarget <= 0 || !isValidTarget(state, ship, brain.targetId)) {
    brain.retarget = 2.5;
    brain.targetId = pickTarget(state, ship);
  }
  const target = state.ships.find((s) => s.id === brain.targetId);

  // Damage control: put fires out once a couple are burning, or when badly hurt.
  if ((ship.fires >= 2 || ship.flooding >= 1 || ship.hp < ship.maxHp * 0.4) && ship.repairCd <= 0) {
    useRepair(state, ship);
  }

  if (!target) {
    // Nothing afloat to fight. If a shore battery is inside the guns as she
    // goes past, she puts a few rounds into it -- but she does not stop to do
    // it: an emplacement is not going anywhere and the capture zones are.
    if (conned) layAhead(ship);
    else patrol(state, ship, brain, dt);
    shellShore(state, ship, brain, cls);
    return;
  }

  const d = dist(ship.x, ship.z, target.x, target.z);
  const want = preferredRange(cls) * cls.gun.range;
  const bearingToTarget = headingTo(ship.x, ship.z, target.x, target.z);

  // Aim with lead, degraded by skill so rookies miss ahead of the bow wave.
  const sol = solveBallistic(cls.gun, clamp(d, 500, cls.gun.range));
  const lead = leadPoint(ship.x, ship.z, target, d / Math.max(0.5, sol.tof));
  const err = (1 - brain.skill) * d * 0.05;
  ship.aimX = lead.x + (Math.random() * 2 - 1) * err;
  ship.aimZ = lead.z + (Math.random() * 2 - 1) * err;

  // Manoeuvre: hold the preferred band and keep the broadside working.
  let desired;
  if (d > want * 1.12) desired = bearingToTarget;
  else if (d < want * 0.62) desired = wrapAngle(bearingToTarget + Math.PI);
  else desired = wrapAngle(bearingToTarget + brain.kite * Math.PI * 0.42);

  // Angle the bow at incoming fire when hurt, to bounce shells.
  if (ship.hp < ship.maxHp * 0.3 && cls.type !== 'DD') {
    desired = wrapAngle(bearingToTarget + brain.kite * 0.6);
  }
  if (!conned) {
    steerToward(state, ship, desired);
    ship.notch = d > want * 1.3 ? 5 : ship.hp < ship.maxHp * 0.35 ? 5 : 4;
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
  if (!conned && cls.planes && canSee && d < cls.planes.strikeRange) {
    const p = leadPoint(ship.x, ship.z, target, 78);
    const saveAimX = ship.aimX, saveAimZ = ship.aimZ;
    ship.aimX = p.x; ship.aimZ = p.z;
    launchStrike(state, ship);
    ship.aimX = saveAimX; ship.aimZ = saveAimZ;
  }
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

function patrol(state, ship, brain, dt) {
  ship.notch = 4;
  const cap = state.caps.find((c) => c.owner !== ship.team) || state.caps[0];
  const goal = cap ? { x: cap.x, z: cap.z } : { x: 0, z: 0 };
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
