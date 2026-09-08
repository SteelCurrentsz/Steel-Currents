// Authoritative battle simulation. The server owns an instance of this and
// broadcasts snapshots; the client runs the same code to predict its own hull
// between snapshots, so steering feels immediate without desyncing.

import {
  clamp, lerp, wrapAngle, angleDelta, approachAngle, approach, dist, dist2,
  headingTo, localToWorld, worldToLocal, pointInBox, makeRng, gauss, TAU,
} from './math.js';
import { getClass } from './ships.js';
import {
  freshAirframe, hitAirframe, stepAirframe, airframeState, flightState,
  airframeHp, PARTS as AIR_PARTS,
} from './airframe.js';
import {
  BATTERIES, batteryGun, batteryArc, batteryHp, batteryAa,
} from './batteries.js';
import {
  MAP_HALF, blockedByLand, islandAt, islandRadius, landAt, spawnPoint, getWeather,
  groundHeight,
} from './world.js';

export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

const THROTTLE_NOTCHES = [-1, 0, 0.25, 0.5, 0.75, 1]; // index 0 is astern
export const MIN_NOTCH = 0;
export const MAX_NOTCH = THROTTLE_NOTCHES.length - 1;


let nextEntityId = 1;
function eid() { return nextEntityId++; }

export function createState(world, opts = {}) {
  return {
    world,
    t: 0,
    tick: 0,
    ships: [],
    // The guns that were bolted to the ground before the fleets arrived.
    batteries: [],
    shells: [],
    torps: [],
    planes: [],
    events: [],
    rng: makeRng((world.seed ^ 0x9e3779b9) >>> 0),
    mode: opts.mode || 'domination',
    over: false,
    winner: -1,
    reason: '',
  };
}

/**
 * Where a hull starts: the berth her captain gave her on the order-of-battle
 * chart, or the spawn line when she was not given one.
 *
 * The placement is checked here rather than taken on trust. The client draws
 * the chart from the same seed and the same position, so it raises the same
 * coastline this does, and a berth the chart accepted is accepted here.
 *
 * A berth that is nevertheless aground is *moved off the rock*, not thrown
 * away: she is walked out to the nearest clear water and left there. Sending
 * her back to the spawn line instead would undo the captain's plan without
 * telling him -- his squadron would form up in the corner he spent a minute
 * moving it out of -- and a hull fifty metres from where he put her is a great
 * deal closer to his intention than one five miles away. Only a berth with no
 * water anywhere near it falls back to the line.
 */
function berth(world, team, index, at, cls) {
  const line = spawnPoint(world, team, index);
  if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.z)) return line;
  const half = (world?.half || MAP_HALF) - 150;
  const x = clamp(at.x, -half, half);
  const z = clamp(at.z, -half, half);
  const heading = Number.isFinite(at.h) ? wrapAngle(at.h) : line.heading;
  // Only that she is afloat, with room for her own beam. A captain who wants
  // to start his destroyers tucked in under the headland is entitled to: the
  // test is whether she is aground, not whether she has a comfortable offing.
  // The exact rim rather than the collision mask, so an anchorage a few tens
  // of metres off an island's beach is not refused by a hundred-and-fifty-metre
  // grid cell.
  const clear = shipClearance(cls);
  if (!islandAt(world, x, z, clear)) return { x, z, heading };
  const off = nearestWater(world, x, z, clear, half);
  return off ? { x: off.x, z: off.z, heading } : line;
}

/**
 * The closest open water to a point, or null if there is none within reach.
 *
 * A ring search outward in steps a shade under the hull's own clearance, so
 * nothing that would float is stepped over, taking the first bearing that is
 * clear. Sixteen bearings is enough to find the sea off any headland this
 * world grows, and the whole search is a few hundred cheap rim tests -- it
 * runs once per hull at the moment she is created and never again.
 */
function nearestWater(world, x, z, clear, half, reach = 1500) {
  const step = Math.max(30, clear * 0.9);
  for (let r = step; r <= reach; r += step) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const px = clamp(x + Math.sin(a) * r, -half, half);
      const pz = clamp(z + Math.cos(a) * r, -half, half);
      if (!islandAt(world, px, pz, clear)) return { x: px, z: pz };
    }
  }
  return null;
}

/**
 * How much water a hull needs round her to count as afloat, in metres.
 *
 * Her own half-beam and a little for the swing, which is what actually decides
 * whether she is touching. Her length does not come into it — a battleship laid
 * along a shore is no more aground than a destroyer is.
 */
export function shipClearance(cls) {
  return Math.max(20, cls.hull.beam * 0.6);
}

export function addShip(state, {
  id, name, classId, team, index, isBot = false, playerId = null, at = null,
  airGroup = null,
}) {
  const cls = getClass(classId);
  const sp = berth(state.world, team, index, at, cls);
  const ship = {
    id: id || eid(),
    playerId,
    name,
    isBot,
    classId: cls.id,
    team,
    x: sp.x, z: sp.z, heading: sp.heading,
    speed: 0,
    notch: 1,
    rudder: 0,          // -1 port .. 1 starboard, current
    rudderCmd: 0,
    // Where her captain has told her to go, if anywhere. A course laid off on
    // the chart rather than a wheel held over.
    wayX: null,
    wayZ: null,
    hp: cls.hp,
    maxHp: cls.hp,
    // She is not a pool of hit points. She is compartments, and this is them.
    sections: freshSections(cls.hp),
    alive: true,
    fires: 0,
    // Where the sea is in her, how far over she is lying, and how far down.
    // All three come out of the water in her compartments; see buoyancy.
    sink: 0, heel: 0, trim: 0,
    // The station her back went at, if it went. See breakStation.
    broke: null,
    flooding: 0,
    repairCd: 0,
    repairActive: 0,
    // How many times her damage control party has been called away. The first
    // shores; the second gets the pumps going. See useRepair.
    dcStage: 0,
    // How fresh the shoring is, nought to one, and whether the pumps are
    // running.
    shored: 0,
    pumping: 0,
    smoke: cls.smokeCharges,
    smokeActive: 0,
    engineDamage: 0,
    steeringDamage: 0,
    shellType: 'ap',
    // Which ship her main battery is laid on, or 0. Her gunnery officer picks
    // it (see stepBot) whoever has the con, and it is the one thing about a
    // ship's fire that the bridge you are standing on cannot work out from
    // looking: an aim point is a patch of sea ahead of a ship making twenty
    // knots, not the ship.
    targetId: 0,
    aimX: sp.x + Math.sin(sp.heading) * 6000,
    aimZ: sp.z + Math.cos(sp.heading) * 6000,
    turrets: cls.turrets.map((t) => ({ id: t.id, angle: t.angle, elev: 0, cooldown: 0, disabled: 0 })),
    torpMounts: cls.torpedoes ? cls.torpedoes.mounts.map((m) => ({ id: m.id, angle: m.angle, cooldown: 0 })) : [],
    // The secondary battery, mount by mount. It is not laid by her captain --
    // a secondary mounting is in local control, and the gun captain shoots at
    // whatever he can see and bear on -- so each one carries its own target,
    // its own training and its own loading.
    secMounts: cls.secondary
      ? cls.secondary.mounts.map((m, i) => ({
        id: i, angle: m.angle, elev: 0, cooldown: 0, disabled: 0, target: 0,
      }))
      : [],
    // How long since her light battery last opened up, per aircraft, so the
    // tracer on screen is the tracer the simulation is firing.
    aaFire: 0,
    squadrons: cls.planes
      ? Array.from({ length: cls.planes.squadrons }, (_, i) => ({ id: i, state: 'deck', cooldown: 0 }))
      : [],
    airGroup: cls.planes ? normaliseAirGroup(cls, airGroup) : null,
    // How long her deck is still busy with the last launch. One aeroplane goes
    // at a time: the lift has to fetch her, she has to taxi aft and run up, and
    // nothing else can use the deck while she is on it.
    deckBusy: 0,
    // A launch ordered and not yet off the deck.
    launching: null,
    spottedBy: [false, false],
    lastFiredAt: -999,
    kills: 0,
    damageDealt: 0,
    ribbons: { hits: 0, cits: 0, torps: 0, fires: 0 },
    respawnAt: 0,
    input: { throttleUp: false, throttleDown: false },
  };
  state.ships.push(ship);
  return ship;
}

export function shipClass(ship) { return getClass(ship.classId); }

/** Muzzle-speed compression: shells fly faster than life so battles stay readable. */
function effVelocity(gunSpec) { return gunSpec.shells.ap.velocity * 1.5; }
function gravityFor(gunSpec) {
  const v = effVelocity(gunSpec);
  return (v * v) / gunSpec.range;
}

/**
 * Firing solution for range `d` from a gun `h` metres above the water, aimed at
 * the target's waterline. Solving for the low arc keeps shells arriving at belt
 * height in a knife fight and plunging onto decks at extreme range.
 */
export function solveBallistic(gunSpec, d, h = 0) {
  const v = effVelocity(gunSpec);
  const g = gravityFor(gunSpec);
  const A = (g * d * d) / (2 * v * v);
  const disc = d * d - 4 * A * (A - h);
  if (disc <= 0) {
    // Beyond maximum range: fall back to the 45-degree solution.
    const elev = Math.PI / 4;
    return { elev, tof: (d / (v * Math.cos(elev))), v, g };
  }
  const u = (d - Math.sqrt(disc)) / (2 * A);
  const elev = Math.atan(u);
  const tof = d / (v * Math.cos(elev));
  return { elev, tof, v, g };
}

/**
 * Put a shell in the air -- unless it is not a shell.
 *
 * A round whose position or velocity is not a number is not a round: it never
 * lands, it never misses, and every screen it reaches divides by it. One did
 * get out once, from a secondary mounting laid on a bearing worked out by
 * dividing by a muzzle velocity that mounting did not have, and what a player
 * saw was the battle stopping with "the provided value is non-finite" -- the
 * browser refusing a gun's report whose loudness had been worked out from the
 * distance to a shell that was nowhere.
 *
 * So the last thing between a firing solution and the world checks that the
 * solution is arithmetic. Nothing here should ever have to fire: this is the
 * rail, not the road, and a shot thrown away by it is a bug upstream.
 */
function fireShell(state, shell) {
  for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'g']) {
    if (!Number.isFinite(shell[k])) return false;
  }
  state.shells.push(shell);
  return true;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * Put the wheel over for a course, keeping her off the rocks.
 *
 * Shared, because both ends of the wire have to steer a ship the same way: the
 * server because it is the authority, the client because it predicts its own
 * hull and a client that steered differently would fight the server every tick.
 */
export function steerToward(state, ship, desiredHeading) {
  // Nudge around islands rather than beaching.
  const look = 900;
  const ahead = {
    x: ship.x + Math.sin(ship.heading) * look,
    z: ship.z + Math.cos(ship.heading) * look,
  };
  let target = desiredHeading;
  for (const i of state.world.islands) {
    // The island's reach on the bearing she is looking down, not a circle round
    // it: she should not sheer away from a bay she could sail into.
    const reach = islandRadius(i, Math.atan2(ahead.x - i.x, ahead.z - i.z));
    if (dist(ahead.x, ahead.z, i.x, i.z) < reach + 300) {
      target = headingTo(i.x, i.z, ship.x, ship.z);
      break;
    }
  }
  const edge = (state.world.half || MAP_HALF) - 900;
  if (Math.abs(ship.x) > edge || Math.abs(ship.z) > edge) {
    target = headingTo(ship.x, ship.z, 0, 0);
  }
  ship.rudderCmd = clamp(angleDelta(ship.heading, target) * 2.2, -1, 1);
}

/** How close she has to get before a waypoint counts as reached. */
export const WAYPOINT_REACHED = 260;

/**
 * Steer for the point her captain put on the chart.
 *
 * She holds the last course she was given once she gets there rather than
 * rounding up and stopping: a course order is a course, not a berth.
 */
export function steerToWaypoint(state, ship) {
  if (ship.wayX === null || ship.wayZ === null) return false;
  if (dist(ship.x, ship.z, ship.wayX, ship.wayZ) < WAYPOINT_REACHED) {
    ship.wayX = null;
    ship.wayZ = null;
    ship.rudderCmd = 0;
    return false;
  }
  steerToward(state, ship, headingTo(ship.x, ship.z, ship.wayX, ship.wayZ));
  return true;
}

export function applyInput(ship, input) {
  if (!ship.alive) return;
  if (typeof input.notch === 'number') ship.notch = clamp(Math.round(input.notch), MIN_NOTCH, MAX_NOTCH);
  if (typeof input.rudder === 'number') ship.rudderCmd = clamp(input.rudder, -1, 1);
  if (typeof input.aimX === 'number' && typeof input.aimZ === 'number') {
    ship.aimX = input.aimX; ship.aimZ = input.aimZ;
  }
  if (input.shellType === 'ap' || input.shellType === 'he') ship.shellType = input.shellType;
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

function stepMovement(state, ship, dt) {
  const cls = shipClass(ship);
  const engine = ship.engineDamage > 0 ? 0.45 : 1;
  // Rudder swings toward its commanded angle at the hull's rudder-shift rate.
  const shift = (ship.steeringDamage > 0 ? 2.4 : 1) * cls.rudderShift;
  ship.rudder = approach(ship.rudder, ship.rudderCmd, (2 / shift) * dt);

  const speedFrac = clamp(Math.abs(ship.speed) / cls.maxSpeed, 0, 1);
  // A hull barely answers the helm below steerage way, and bites hardest near
  // half speed, which is why full-ahead turns are wider than half-ahead turns.
  const helm = Math.min(1, speedFrac * 2.4) * (1 - 0.25 * speedFrac);
  const rate = cls.turnRate * ship.rudder * helm * Math.sign(ship.speed || 1);
  ship.heading = wrapAngle(ship.heading + rate * dt);

  // A hull heels and scrubs off speed in a hard turn, so the telegraph setting
  // is only the speed you get when the rudder is amidships.
  const bleed = 1 - cls.speedLossInTurn * Math.abs(ship.rudder) * helm;
  // And water inside her costs more than any turn does. Every tonne of it is
  // a tonne she has to drag, she is sitting deeper so there is more of her in
  // the water, and once she is lying over her screws and her rudder are not
  // square to it any more. A destroyer with her forward magazine flooded does
  // not make thirty-six knots.
  const flood = 1 - Math.min(0.75, ship.sink / Math.max(1, cls.hull.draft * 0.9) * 0.8
    + Math.abs(ship.heel) * 0.9);
  const ordered = THROTTLE_NOTCHES[ship.notch] * (ship.notch === 0 ? cls.reverseSpeed : cls.maxSpeed) * engine;
  const target = ordered * bleed * flood;
  const accel = cls.accel * (target < ship.speed ? 1.6 : 1) * engine;
  ship.speed = approach(ship.speed, target, accel * dt);
  const v = ship.speed;
  const nx = ship.x + Math.sin(ship.heading) * v * dt;
  const nz = ship.z + Math.cos(ship.heading) * v * dt;

  // Land: a grounded ship stops dead and takes hull damage.
  const isle = islandAt(state.world, nx, nz, cls.hull.beam);
  if (isle) {
    if (isle.shore) {
      // Real coastline. There is no centre to be pushed away from — the shape
      // is a shape — so she stops where she struck and is backed a length down
      // her own wake, which is where the water she was last floating in is.
      const back = Math.sign(ship.speed || 1) * 14;
      const bx = ship.x - Math.sin(ship.heading) * back;
      const bz = ship.z - Math.cos(ship.heading) * back;
      if (!islandAt(state.world, bx, bz, cls.hull.beam)) { ship.x = bx; ship.z = bz; }
    } else {
      const away = headingTo(isle.x, isle.z, ship.x, ship.z);
      ship.x = isle.x + Math.sin(away) * (isle.r + cls.hull.beam + 4);
      ship.z = isle.z + Math.cos(away) * (isle.r + cls.hull.beam + 4);
    }
    if (Math.abs(ship.speed) > 4) {
      damageShip(state, ship, null, Math.abs(ship.speed) * 42, 'grounding');
      state.events.push({ e: 'ground', x: ship.x, z: ship.z });
    }
    ship.speed *= 0.1;
  } else {
    ship.x = nx; ship.z = nz;
  }

  // Map border acts like a shoal: you slow and take damage rather than leave.
  const edge = (state.world.half || MAP_HALF) - 120;
  if (Math.abs(ship.x) > edge || Math.abs(ship.z) > edge) {
    ship.x = clamp(ship.x, -edge, edge);
    ship.z = clamp(ship.z, -edge, edge);
    ship.speed *= 0.9;
    damageShip(state, ship, null, 220 * dt, 'border');
  }
}

function stepCollisions(state, dt) {
  const alive = state.ships.filter((s) => s.alive);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j];
      const ca = shipClass(a), cb = shipClass(b);
      const minD = (ca.hull.length + cb.hull.length) * 0.28;
      const d = dist(a.x, a.z, b.x, b.z);
      if (d > minD || d === 0) continue;
      const push = (minD - d) * 0.5;
      const h = headingTo(a.x, a.z, b.x, b.z);
      a.x -= Math.sin(h) * push; a.z -= Math.cos(h) * push;
      b.x += Math.sin(h) * push; b.z += Math.cos(h) * push;
      const rel = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.2;
      if (rel > 3) {
        const dmg = rel * 55 * dt * 30;
        damageShip(state, a, b, dmg * (cb.hp / ca.hp) * 0.5, 'ram');
        damageShip(state, b, a, dmg * (ca.hp / cb.hp) * 0.5, 'ram');
        a.speed *= 0.55; b.speed *= 0.55;
        state.events.push({ e: 'ram', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Gunnery
// ---------------------------------------------------------------------------

function turretWorldPos(ship, cls, t) {
  const spec = cls.turrets[t.id];
  const w = localToWorld(spec.x, spec.z, ship.heading);
  return { x: ship.x + w.x, z: ship.z + w.z };
}

/**
 * Where a gun's muzzle is: the point the shell leaves the ship from.
 *
 * A mounting stands at (x, z) on the deck and trains about that point, and the
 * muzzle is `reach` metres out along whatever bearing it is laid on, `my`
 * metres above the water. Both numbers are measured off the built model and
 * checked against it, so a shell starts where the flash does rather than at
 * the middle of the barbette at a height guessed from how tall her
 * superstructure is -- which on a heavy cruiser put it six metres above her
 * own gun, and on a battleship a hundred feet short of the muzzle.
 *
 * `gun` is the barrel's index in the mounting and `guns` how many it has, so
 * the shells of a salvo leave the three bores of a triple turret rather than
 * all three leaving the middle one.
 */
export function muzzlePos(ship, cls, mount, battery, bearing, gun = 0, guns = 1) {
  const w = localToWorld(mount.x, mount.z, ship.heading);
  const reach = battery.reach || 8;
  // Across the face of the mounting, so a wing gun is offset from the centre
  // one. A hair over a metre a barrel is right for everything from a 2 cm to
  // a 16 inch, because what sets it is the recoil gear and not the bore.
  const across = (gun - (guns - 1) / 2) * 1.4;
  return {
    x: ship.x + w.x + Math.sin(bearing) * reach + Math.cos(bearing) * across,
    z: ship.z + w.z + Math.cos(bearing) * reach - Math.sin(bearing) * across,
    y: mount.my != null ? mount.my : 11 + cls.hull.superstructure * 5,
  };
}

/**
 * How high and how low a mounting can point, in radians.
 *
 * A gun is not a turret that shoots anywhere. It has stops: a 16"/50 lifts to
 * forty-five degrees and depresses to two below the horizontal, a 5"/38 goes
 * to eighty-five because it was built to shoot at aeroplanes, and a Bofors
 * goes past the vertical. And the depression stop is the reason a ship cannot
 * shoot at something alongside her: the guns will not come down that far,
 * because if they did they would be pointing at her own forecastle.
 *
 * A battery may say so itself. Where it does not, its role does: that is what
 * `role` is for, and a dual-purpose gun is dual-purpose because of its stops.
 */
const ELEV_BY_ROLE = {
  surface: { min: -0.035, max: 0.79 },
  dp: { min: -0.09, max: 1.48 },
  aa: { min: -0.17, max: 1.62 },
};
export function gunLimits(battery) {
  if (!battery) return ELEV_BY_ROLE.surface;
  if (battery.elev) return battery.elev;
  return ELEV_BY_ROLE[battery.role] || ELEV_BY_ROLE.surface;
}

/** Bearing a turret wants, clamped into its firing arc; null when it cannot bear. */
function turretDesired(ship, cls, t) {
  const spec = cls.turrets[t.id];
  const world = headingTo(ship.x, ship.z, ship.aimX, ship.aimZ);
  const local = wrapAngle(world - ship.heading);
  const off = angleDelta(spec.angle, local);
  const limited = Math.abs(off) > spec.arc;
  const local2 = limited ? wrapAngle(spec.angle + Math.sign(off) * spec.arc) : local;
  return { angle: local2, blocked: limited };
}

function stepTurrets(state, ship, dt) {
  const cls = shipClass(ship);
  // How far up the guns are, which is the same solution she fires on: at eight
  // hundred yards a battleship's guns are almost flat, and at her extreme
  // range they are up at twenty degrees. It is on the wire because it is the
  // most visible thing a turret does and nothing else can work it out -- a
  // ship on the horizon shows you her elevation and not her fire-control
  // problem.
  const d = clamp(dist(ship.x, ship.z, ship.aimX, ship.aimZ), 400, cls.gun.range);
  const elev = solveBallistic(cls.gun, d, 12).elev;
  const stops = gunLimits(cls.gun);
  for (const t of ship.turrets) {
    if (t.disabled > 0) { t.disabled -= dt; continue; }
    const want = turretDesired(ship, cls, t);
    t.angle = approachAngle(t.angle, want.angle, cls.gun.traverse * dt);
    // A gun that cannot bear comes down to the loading angle rather than
    // standing there pointing at the sky over her own bridge -- and one that
    // can never goes past its own stops.
    const aim = want.blocked ? 0.03 : clamp(elev, stops.min, stops.max);
    t.elev += clamp(aim - t.elev, -0.5 * dt, 0.5 * dt);
    t.elev = clamp(t.elev, stops.min, stops.max);
    // Off the target as well as off the arc: a solution her guns cannot reach
    // is a solution she has not got, and she checks fire rather than shooting
    // at the stop and missing by a mile every time.
    t.laid = !want.blocked && elev <= stops.max && elev >= stops.min;
    if (t.cooldown > 0) t.cooldown -= dt;
  }
}

export function canFire(ship) {
  if (!ship.alive) return false;
  return ship.turrets.some((t) => t.cooldown <= 0 && t.disabled <= 0 && t.laid !== false);
}

/** Fire every turret that is loaded and on target. Returns barrels fired. */
export function fireGuns(state, ship) {
  if (!ship.alive) return 0;
  const cls = shipClass(ship);
  const gun = cls.gun;
  const spec = gun.shells[ship.shellType] || gun.shells.ap;
  const d = clamp(dist(ship.x, ship.z, ship.aimX, ship.aimZ), 400, gun.range);
  let fired = 0;

  const stops = gunLimits(gun);
  const solution = solveBallistic(gun, d, 12).elev;
  for (const t of ship.turrets) {
    if (t.cooldown > 0 || t.disabled > 0) continue;
    const tSpec = cls.turrets[t.id];
    const want = turretDesired(ship, cls, t);
    if (want.blocked) continue;
    // Nor past her stops: a gun that will not come down that far does not
    // shoot at something alongside her, and one that will not go up that far
    // does not reach.
    if (solution > stops.max || solution < stops.min) continue;
    if (Math.abs(angleDelta(t.angle, want.angle)) > 0.035) continue;

    const bearing = wrapAngle(ship.heading + t.angle);
    // Dispersion: a cone that widens with range, tightened by the gun's sigma.
    const spreadBase = (d * 0.0125) / gun.sigma;
    for (let g = 0; g < tSpec.guns; g++) {
      const lat = clamp(gauss(state.rng), -2.4, 2.4) * spreadBase * 0.35;
      const rng = clamp(gauss(state.rng), -2.4, 2.4) * spreadBase;
      const aimDist = clamp(d + rng, 300, gun.range);
      // Each barrel from its own muzzle: the three shells of a salvo leave
      // three bores a yard apart, not one point in the middle of the turret.
      const mz = muzzlePos(ship, cls, tSpec, gun, bearing, g, tSpec.guns);
      const s2 = solveBallistic(gun, aimDist, mz.y);
      const b = bearing + Math.atan2(lat, Math.max(600, d));
      const vh = s2.v * Math.cos(s2.elev);
      fireShell(state, {
        id: eid(),
        owner: ship.id, team: ship.team,
        x: mz.x, z: mz.z, y: mz.y,
        vx: Math.sin(b) * vh, vz: Math.cos(b) * vh, vy: s2.v * Math.sin(s2.elev),
        g: s2.g,
        spec, caliber: gun.caliber,
        classId: cls.id,
        life: 0,
      }) && fired++;
    }
    t.cooldown = gun.reload;
    // Which mounting it was, so the client can put the flash on the muzzles of
    // that turret -- it has the model and knows exactly where they are.
    const mz0 = muzzlePos(ship, cls, tSpec, gun, bearing);
    state.events.push({
      e: 'muzzle', x: mz0.x, z: mz0.z, y: mz0.y, b: bearing,
      cal: gun.caliber, ship: ship.id, t: t.id,
    });
  }
  if (fired > 0) ship.lastFiredAt = state.t;
  return fired;
}

/**
 * What a flight actually drops, and what it does when it arrives.
 *
 * One place, because two things call it: the flight's own attack run, and a
 * pilot pressing the button. A torpedo bomber puts real fish in the water and
 * they run; a dive bomber's bomb either hits or it does not, because there is
 * nothing to run on and nothing to comb.
 */
function deliverOrdnance(state, p, best, P) {
  const lead = leadPoint(p.x, p.z, best, P.torpSpeed);
  const base = headingTo(p.x, p.z, lead.x, lead.z);
  const torp = p.torp ?? p.count;
  for (let i = 0; i < torp; i++) {
    const spread = P.dropSpread / Math.max(0.3, (p.wear && p.wear.aim) || 1);
    const off = (i - (torp - 1) / 2) * spread;
    state.torps.push({
      id: eid(), owner: p.owner, team: p.team,
      x: p.x, z: p.z, heading: wrapAngle(base + off),
      speed: P.torpSpeed, range: P.torpRange, travelled: 0,
      damage: P.torpDamage, detection: 900, arming: 200, flood: P.floodChance,
    });
  }
  // The dive bombers go in over the top. Whether a bomb hits is settled here
  // -- there is nothing to run on and nothing to comb, so a bomb is a die roll
  // and not a body to fly -- but where it is going is sent up the wire, so
  // what a captain sees is bombs coming down at his ship and bursting on her
  // or throwing water up alongside. They used to be settled in silence: the
  // damage arrived and nothing whatever happened on screen.
  // How well she can still aim. A bomb released by an aeroplane that will not
  // fly straight goes where the aeroplane was pointing, and that is not where
  // the ship is -- so a flight shot about on the way in misses, which is most
  // of what a close-range battery is actually for.
  const aim = (p.wear && p.wear.aim !== undefined) ? p.wear.aim : 1;
  for (let i = 0; i < (p.bomb || 0); i++) {
    const hit = state.rng() <= (P.bombHit ?? 0.4) * aim;
    // A miss is a miss you can see: it goes into the water short, over or off
    // her beam, which is where they went.
    const off = hit ? 0 : 45 + state.rng() * 130;
    const ang = state.rng() * Math.PI * 2;
    state.events.push({
      e: 'bomb', team: p.team, i: p.id,
      x: p.x, z: p.z,
      tx: best.x + Math.sin(ang) * off,
      tz: best.z + Math.cos(ang) * off,
      hit: hit ? 1 : 0,
    });
    if (!hit) continue;
    const owner = state.ships.find((s) => s.id === p.owner) || null;
    const cls = getClass(best.classId);
    const lb = worldToLocal(p.x - best.x, p.z - best.z, best.heading);
    const cell = sectionAt(clamp(lb.z / (cls.hull.length * 0.5), -1, 1), 'deck');
    // Where on her it landed, so the burst breaks what it actually reached
    // rather than something at the other end of the ship.
    bombHit(state, best, owner, cell, lb.x >= 0 ? 1 : -1, P,
      { x: lb.x, y: freeboardOf(cls), z: lb.z });
  }
}

/**
 * A bomb arriving on her deck, and how far into her it gets.
 *
 * A bomb has no belt to beat. It comes down on top of her, so the only armour
 * in its way is her deck -- and how much of the ship it reaches is decided
 * there and nowhere else. Three things can happen, and which one it is comes
 * out of the arithmetic rather than off a list:
 *
 * It fails to beat the deck and bursts on top of it. That wrecks whatever is
 * standing about up there and starts a fire, and the ship underneath is
 * untouched: it is why a battleship's armoured deck was worth what it cost.
 *
 * It beats the deck and bursts inside her, in the compartment under it. That
 * is the ordinary bomb hit, and it is bad.
 *
 * Or it is so far over the deck it was built to beat that it goes through
 * everything -- deck, the deck below, her bottom -- and bursts low down in
 * her or under her. Then she is not only wrecked, she is holed below the
 * waterline, and she floods exactly as though she had been torpedoed there.
 * That is what a thousand-pound bomb does to a destroyer.
 */
export function bombHit(state, ship, owner, cell, side, P, at) {
  const cls = shipClass(ship);
  const base = P.bombDamage ?? 4000;
  const deck = Math.max(6, cls.armor.deck);
  const through = (P.bombPen ?? 60) / deck;
  const bore = P.bombBore ?? 0.36;
  let dmg;
  let kind = 'bomb';
  if (through < 1) {
    // Stopped by the deck. A great deal of noise and very little ship.
    dmg = base * 0.22;
    kind = 'bombDeck';
  } else if (through < 2.2) {
    dmg = base;
  } else {
    // Through the lot.
    dmg = base * 1.15;
  }
  damageShip(state, ship, owner, dmg, 'bomb', cell);
  ship.sections[cell].pens++;
  // What the burst reached. Through the deck it is whatever was in the
  // compartment under it; stopped on the deck it is everything standing about
  // on top of her -- the mountings, the directors, the people working them --
  // which is why an armoured deck saves the ship and not her upperworks.
  wreckContents(state, ship, through >= 1 ? cell : 'works', bore, 'bomb', at);
  if (through >= 2.2) {
    // Out through her bottom, or bursting against it. Either way the sea is
    // inside her, and it is inside her a long way down.
    openHull(state, ship, cell, 6 + state.rng() * 10, side,
      cls.hull.draft * (0.6 + state.rng() * 0.3));
  }
  // Fire. A bomb stopped on the deck starts more of them than one that goes
  // through, because everything it sets alight is in the open where the air is.
  const fire = (P.bombFire ?? 0.3) * (kind === 'bombDeck' ? 1.4 : 1);
  if (state.rng() < fire) startFire(state, ship, cell, 0.35);
}

/**
 * A flight firing her guns at something, for the look of it.
 *
 * The damage is done wherever it is done; this is the tracer reaching out from
 * her to it, which is the only thing that tells anybody watching that she is
 * shooting at all. Throttled, because a trigger held down is a message every
 * tenth of a second and a wire full of them is not worth the tracer.
 */
function gunsSeen(state, p, tx, tz, air) {
  if (state.t - (p.gunAt ?? -9) < 0.12) return;
  p.gunAt = state.t;
  state.events.push({
    e: 'airGuns', i: p.id, team: p.team,
    x: p.x, z: p.z, tx, tz, air: air ? 1 : 0,
  });
}

/**
 * A flight somebody is flying by hand.
 *
 * The simulation owns everything that matters about a flight -- what shoots at
 * her, what she can attack, whether her squadron is home -- but a player
 * cannot fly an aeroplane through fifteen snapshots a second of somebody
 * else's autopilot. So the client that has taken her sends where she is, the
 * same way it already sends where its own ship is aiming, and the simulation
 * stops steering her and gets on with everything else.
 *
 * The checks are the point: a flight can only be flown by the side that owns
 * her, only while she is up, and only from a position she could actually have
 * reached. Nobody teleports a torpedo bomber into somebody's engine room.
 */
export function flyPlane(state, ship, msg) {
  if (!ship || !ship.alive) return false;
  const p = state.planes.find((q) => q.id === msg.i);
  if (!p || p.dead) return false;
  if (p.team !== ship.team || p.owner !== ship.id) return false;
  if (!Number.isFinite(msg.x) || !Number.isFinite(msg.z) || !Number.isFinite(msg.h)) return false;
  // No further than she could have flown since the last word from her, with a
  // good margin for a slow connection. A flight doing three hundred knots
  // covers a hundred and fifty metres a second.
  const cls = shipClass(ship);
  const top = (cls.planes ? cls.planes.cruiseSpeed : 80) * 3.2;
  const since = Math.max(0.05, Math.min(2, state.t - (p.flownAt ?? state.t)));
  const reach = top * since + 80;
  if (dist(p.x, p.z, msg.x, msg.z) > reach) return false;
  p.x = msg.x;
  p.z = msg.z;
  p.heading = wrapAngle(msg.h);
  p.flown = true;
  p.flownAt = state.t;
  // Under a pilot she is not hunting on her own account any more.
  p.targetAir = 0;
  return true;
}

/**
 * The pilot's guns.
 *
 * A fighter's whole armament is fixed forward, so this is only ever "what is
 * she pointed at, and is it close enough" -- there is no aiming to do beyond
 * putting the nose on it, which is what the reticle is for. Anything inside a
 * narrow cone ahead of her and inside gun range takes it: another flight, or
 * a ship's upperworks.
 */
export function strafe(state, ship, id, dt) {
  const p = state.planes.find((q) => q.id === id);
  if (!p || p.dead || !ship || p.owner !== ship.id) return false;
  const cls = shipClass(ship);
  const P = cls.planes;
  if (!P) return false;
  const RANGE = 700;
  const CONE = 0.16;                       // about nine degrees either side
  const bore = (x, z) => Math.abs(angleDelta(p.heading, headingTo(p.x, p.z, x, z)));
  // Another flight first: that is what a fighter is for.
  for (const q of state.planes) {
    if (q.dead || q.team === p.team) continue;
    if (dist(p.x, p.z, q.x, q.z) > RANGE || bore(q.x, q.z) > CONE) continue;
    // Through the airframe model, the same way flak goes in: fifty calibre
    // into one machine of the formation, which may take her engine, may set
    // her tanks alight, and may do very little. This used to come off a single
    // pool of hit points shared by the whole flight, so a fighter's fire was
    // the one thing in the game an aeroplane could not be individually hurt
    // by -- four machines came apart together or not at all.
    hurtFlight(state, q, (P.fighterGuns ?? FIGHTER_GUNS) * p.count * dt, 'fighters');
    gunsSeen(state, p, q.x, q.z, true);
    return true;
  }
  for (const s of state.ships) {
    if (!s.alive || s.team === p.team) continue;
    if (dist(p.x, p.z, s.x, s.z) > RANGE || bore(s.x, s.z) > CONE) continue;
    const owner = state.ships.find((q) => q.id === p.owner) || null;
    damageShip(state, s, owner, (P.strafeDamage ?? 260) * p.count * dt, 'he', 'works');
    gunsSeen(state, p, s.x, s.z, false);
    return true;
  }
  return false;
}

/**
 * Let go of a flight: the pilot has left her, or been shot out of her.
 *
 * She goes back on the autopilot where she is, heading for whatever she was
 * sent after -- not back to the beginning of her sortie.
 */
export function releasePlane(state, id) {
  const p = state.planes.find((q) => q.id === id);
  if (!p) return;
  p.flown = false;
  p.hunt = 0;
}

/**
 * Drop what she is carrying, now, because the pilot said so.
 *
 * The same weapons the autopilot would have dropped, on the same terms -- she
 * still has to be near enough to something to be dropping at it.
 */
export function dropOrdnance(state, ship, id) {
  const p = state.planes.find((q) => q.id === id);
  if (!p || p.dead || !ship || p.owner !== ship.id) return false;
  if (p.dropped) return false;
  const cls = shipClass(ship);
  const P = cls.planes;
  if (!P) return false;
  // What is on her rack. A fighter carries nothing to drop -- her guns are her
  // weapon -- and letting her "drop" used to mark her as having attacked and
  // turn her for home without anything whatever leaving the aeroplane.
  const torp = p.torp ?? 0;
  const bomb = p.bomb ?? 0;
  if (torp <= 0 && bomb <= 0) return false;
  // Near enough to be dropping at something, on the same terms the autopilot
  // presses home on: a torpedo wants to be inside the distance the target
  // cannot comb, a bomb wants to be released off a dive rather than lobbed.
  let best = null;
  let bestD = torp > 0 ? 1600 : 1200;
  for (const s of state.ships) {
    if (!s.alive || s.team === p.team) continue;
    const d = dist(p.x, p.z, s.x, s.z);
    if (d < bestD) { best = s; bestD = d; }
  }
  if (!best) return false;
  p.dropped = true;
  deliverOrdnance(state, p, best, P);
  // The fish going into the sea, which everybody within sight can see. The
  // autopilot's drop has always raised this; a drop the pilot made himself
  // raised nothing at all, so a player who let his torpedoes go watched an
  // empty patch of water and had no way of knowing anything had happened.
  if (torp > 0) state.events.push({ e: 'airDrop', x: p.x, z: p.z, r: p.role });
  p.phase = 'return';
  return true;
}

// ---------------------------------------------------------------------------
// The light battery
// ---------------------------------------------------------------------------
//
// Anti-aircraft fire is not a circle round the ship. It is a few dozen barrels
// bolted to particular places on her, each with a sector of sky its own
// superstructure lets it see, and an aeroplane coming in fine on the bow is
// met by a fraction of what one coming in on the beam would meet. So the
// battery is built out of the mountings on the datasheet -- the light guns,
// and every dual-purpose mounting she has, because a 5"/38 is an
// anti-aircraft gun -- and only the barrels that can actually train onto the
// bearing do any damage.

const AA_CACHE = new Map();
const r = (v) => Math.round(v * 10) / 10;

/** Every barrel aboard that can be pointed at an aeroplane, with its sector. */
export function aaBattery(cls) {
  const hit = AA_CACHE.get(cls.id);
  if (hit) return hit;
  const out = [];
  const add = (m, range, caliber, name, battery) => out.push({
    x: m.x, z: m.z, angle: m.angle, arc: m.arc, guns: m.guns || 1,
    // How far up and how far down that mounting will go, off the battery it
    // belongs to. A quadruple 1.1" and a 5"/38 are both anti-aircraft guns and
    // they do not have the same stops.
    up: gunLimits(battery),
    range, caliber, name,
  });
  // The heavy dual-purpose mountings first: they are the ones that reach.
  if (cls.gun && cls.gun.role === 'dp') {
    for (const t of cls.turrets) {
      add(t, cls.aa ? cls.aa.range : 4000, cls.gun.caliber, cls.gun.name, cls.gun);
    }
  }
  if (cls.secondary && cls.secondary.role === 'dp') {
    for (const m of cls.secondary.mounts) {
      add(m, cls.aa ? cls.aa.range : 4000, cls.secondary.caliber, cls.secondary.name,
        cls.secondary);
    }
  }
  for (const g of (cls.aa && cls.aa.guns) || []) {
    for (const m of g.mounts) add(m, g.range, g.caliber, g.name, g);
  }
  AA_CACHE.set(cls.id, out);
  return out;
}

/** Total barrels in her light battery, bearing or not. */
export function aaBarrels(cls) {
  return aaBattery(cls).reduce((n, m) => n + m.guns, 0);
}

/**
 * What she can actually bring to bear on an aeroplane on that bearing, as a
 * share of her whole battery, and how many barrels that is.
 */
export function aaBearing(cls, ship, px, pz, py) {
  const battery = aaBattery(cls);
  const d = dist(ship.x, ship.z, px, pz);
  const bearing = headingTo(ship.x, ship.z, px, pz);
  // How high she has to point to be on him. An aeroplane straight overhead is
  // above a five-inch mounting's stops and the Bofors on the quarterdeck are
  // the only things that can follow him up there; one coming in on the wave
  // tops is below everything's, because the guns will not depress into her own
  // upperworks. Both of those are why aircraft attacked the way they did.
  const up = py == null ? null
    : Math.atan2(py - (ship.y || 0), Math.max(1, Math.hypot(px - ship.x, pz - ship.z)));
  let all = 0;
  let on = 0;
  for (const m of battery) {
    all += m.guns;
    if (d > m.range) continue;
    if (!mountBears(ship, m, bearing)) continue;
    if (up !== null && (up > m.up.max || up < m.up.min)) continue;
    on += m.guns;
  }
  return { share: all > 0 ? on / all : 0, barrels: on, of: all, bearing, range: d };
}

// ---------------------------------------------------------------------------
// The secondary battery
// ---------------------------------------------------------------------------
//
// A secondary mounting is not laid by the captain. It is in local control: the
// gun captain is told which side to watch, picks the nearest thing he can see
// and bear on, and opens up on his own. So this is a battery of small
// independent fire-control problems rather than one big one -- which is why
// the waist mountings on one side go on firing while the ones on the other
// side have nothing to shoot at, and why turning the ship changes who is in
// action without anybody ordering anything.

/** Where a mounting is in the world, given the ship's heading. */
function mountWorldPos(ship, spec) {
  const w = localToWorld(spec.x, spec.z, ship.heading);
  return { x: ship.x + w.x, z: ship.z + w.z };
}

/** Can this mounting be laid on that bearing, or is her own ship in the way? */
export function mountBears(ship, spec, worldBearing) {
  const local = wrapAngle(worldBearing - ship.heading);
  return Math.abs(angleDelta(spec.angle, local)) <= spec.arc;
}

/**
 * What a secondary mounting shoots at: the nearest enemy she can see, inside
 * her own range, on a bearing she can actually train to.
 */
function secondaryTarget(state, ship, spec, S) {
  let best = null;
  let bestD = Infinity;
  for (const foe of state.ships) {
    if (!foe.alive || foe.team === ship.team) continue;
    if (!foe.spottedBy[ship.team]) continue;
    const d = dist(ship.x, ship.z, foe.x, foe.z);
    if (d > S.range || d >= bestD) continue;
    if (!mountBears(ship, spec, headingTo(ship.x, ship.z, foe.x, foe.z))) continue;
    best = foe;
    bestD = d;
  }
  return best;
}

function stepSecondary(state, ship, dt) {
  const cls = shipClass(ship);
  const S = cls.secondary;
  if (!S || !ship.secMounts.length) return;
  const spec0 = S.shells[ship.shellType] || S.shells.he || S.shells.ap;
  for (const m of ship.secMounts) {
    if (m.disabled > 0) { m.disabled -= dt; continue; }
    if (m.cooldown > 0) m.cooldown -= dt;
    const spec = S.mounts[m.id];
    const foe = secondaryTarget(state, ship, spec, S);
    if (!foe) {
      // Nothing on her side: back to the bearing she rests on.
      m.angle = approachAngle(m.angle, spec.angle, S.traverse * dt);
      m.elev += clamp(-m.elev, -0.9 * dt, 0.9 * dt);
      m.target = 0;
      continue;
    }
    m.target = foe.id;
    // Lead her: a five-inch shell takes seconds to get there and the target is
    // making twenty knots across the line of sight.
    //
    // How long it is in the air comes off the firing solution the guns are
    // actually laid with, which is also what settles the elevation below. It
    // used to be worked out from `spec.velocity` -- and `spec` is the
    // mounting, which has a position, an arc and a number of guns and has
    // never had a muzzle velocity. So the flight time was a division by
    // undefined, and from the first moment a secondary mounting saw anything
    // to shoot at, its bearing was not a number: it fired shells with no
    // position and no velocity, and every one of them poisoned whatever it
    // touched at the far end of the wire.
    const d = dist(ship.x, ship.z, foe.x, foe.z);
    const aim = solveBallistic(S, clamp(d, 400, S.range), 10);
    const flight = aim.tof;
    const lx = foe.x + Math.sin(foe.heading) * foe.speed * flight;
    const lz = foe.z + Math.cos(foe.heading) * foe.speed * flight;
    const world = headingTo(ship.x, ship.z, lx, lz);
    const local = wrapAngle(world - ship.heading);
    const off = angleDelta(spec.angle, local);
    const want = Math.abs(off) > spec.arc
      ? wrapAngle(spec.angle + Math.sign(off) * spec.arc)
      : local;
    m.angle = approachAngle(m.angle, want, S.traverse * dt);
    // And how far up the gun captain has his guns, on the same solution --
    // never past the stops on the mounting.
    const stops = gunLimits(S);
    m.elev += clamp(clamp(aim.elev, stops.min, stops.max) - m.elev, -0.9 * dt, 0.9 * dt);
    m.elev = clamp(m.elev, stops.min, stops.max);
    if (m.cooldown > 0) continue;
    if (Math.abs(angleDelta(m.angle, want)) > 0.05) continue;
    if (Math.abs(off) > spec.arc) continue;
    if (aim.elev > stops.max || aim.elev < stops.min) continue;

    const pos = mountWorldPos(ship, spec);
    const bearing = wrapAngle(ship.heading + m.angle);
    const aimD = clamp(dist(pos.x, pos.z, lx, lz), 400, S.range);
    const spreadBase = (aimD * 0.0125) / S.sigma;
    for (let g = 0; g < spec.guns; g++) {
      const lat = clamp(gauss(state.rng), -2.4, 2.4) * spreadBase * 0.35;
      const rng = clamp(gauss(state.rng), -2.4, 2.4) * spreadBase;
      const shotD = clamp(aimD + rng, 300, S.range);
      const mz = muzzlePos(ship, cls, spec, S, bearing, g, spec.guns);
      const s2 = solveBallistic(S, shotD, mz.y);
      const b = bearing + Math.atan2(lat, Math.max(600, aimD));
      const vh = s2.v * Math.cos(s2.elev);
      fireShell(state, {
        id: eid(),
        owner: ship.id, team: ship.team,
        x: mz.x, z: mz.z, y: mz.y,
        vx: Math.sin(b) * vh, vz: Math.cos(b) * vh, vy: s2.v * Math.sin(s2.elev),
        g: s2.g,
        spec: spec0, caliber: S.caliber,
        classId: cls.id,
        life: 0,
      });
    }
    m.cooldown = S.reload;
    // `s` is which mounting fired, so the flash goes on that mounting's own
    // barrels: a battery in local control is a dozen guns each doing its own
    // thing, and they have to look like it.
    const mz0 = muzzlePos(ship, cls, spec, S, bearing);
    state.events.push({
      e: 'muzzle', x: mz0.x, z: mz0.z, y: mz0.y, b: bearing,
      cal: S.caliber, ship: ship.id, s: m.id,
    });
    ship.lastFiredAt = state.t;
  }
}

// ---------------------------------------------------------------------------
// Coast artillery
// ---------------------------------------------------------------------------
//
// A battery is a gun that cannot move, cannot be hidden and cannot be reasoned
// with. It picks the nearest enemy inside its own maximum range that it can
// both see and bear on, trains onto her at whatever rate a mounting of its
// weight comes round, and fires on its own reload. Everything that decides any
// of that is the battery's own datasheet.

/**
 * Put a battery on the ground.
 *
 * `heading` is the bearing the emplacement was laid on; the guns train either
 * side of it as far as the mounting allows and no further.
 */
export function addBattery(state, { id, batteryId, team, x, z, heading = 0 }) {
  const b = BATTERIES[batteryId];
  if (!b) return null;
  const bat = {
    id: id || eid(),
    batteryId,
    team,
    x, z,
    // Standing on the ground, which is what puts its muzzle above the sea and
    // gives it the extra reach a gun on a hill has always had.
    //
    // The highest ground under the emplacement's own footprint, not the height
    // at the one point it is pinned to. A gun pit is levelled into a hillside
    // before the gun goes in it, and taking the middle of a slope would leave
    // the uphill half of the platform buried and the downhill half in the air.
    y: batteryPad(state.world, x, z, b.span),
    heading: wrapAngle(heading),
    // The island it is standing on, kept so its own hill is not counted as
    // being in its way. Null on a real coastline, which is one piece of land
    // and has no single shape to take out of the test.
    own: (() => { const g = islandAt(state.world, x, z, 0); return g && !g.shore ? g : null; })(),
    angle: 0,                 // training, relative to the bearing it was laid on
    // The bearing the crew is shifting the whole mounting onto, when what they
    // can see is outside the arc the mounting allows from where it is laid.
    relayTo: null,
    cooldown: b.reload * 0.35, // not every gun opens fire on the same second
    hp: batteryHp(b),
    maxHp: batteryHp(b),
    alive: true,
    targetId: 0,
    lastFiredAt: -999,
    kills: 0,
    damageDealt: 0,
  };
  state.batteries.push(bat);
  return bat;
}

/**
 * The height a battery's platform is cut at, in metres.
 *
 * Sampled round the emplacement rather than at its centre and taking the
 * highest: the pad is levelled *into* the slope, so it stands at the height of
 * the uphill side and the ground falls away from the downhill one. That is how
 * a gun position is built, and it is also the only way a flat platform and a
 * hillside can meet without one of them going through the other.
 */
export function batteryPad(world, x, z, span = 20) {
  // Over the whole of what the emplacement covers -- the pit and the apron
  // banked round it -- not just the gun's own circle. Sampling the middle only
  // left the uphill side of the platform buried: the hill went on climbing past
  // where anybody had looked, and came up through the revetment with the gun
  // standing inside it.
  let top = groundHeight(world, x, z);
  for (const k of BATTERY_FOOTPRINT) {
    const r = Math.max(6, span * k);
    for (let a = 0; a < 16; a++) {
      const th = (a / 16) * TAU;
      const h = groundHeight(world, x + Math.cos(th) * r, z + Math.sin(th) * r);
      if (h > top) top = h;
    }
  }
  // And then a little higher again. A gun position is not a slice taken off a
  // hill flush with the top of it -- it is an earthwork, spoil dug out and
  // banked up until the piece stands clear of everything round it. Standing the
  // pad exactly at the highest ground it covers left the hill grazing the
  // platform wherever the sampling had missed by a metre, and the gun looked
  // half-buried; standing it proud means the emplacement is a small hill of its
  // own and nothing can come up through it.
  return Math.max(4, top + batteryRise(span));
}

/** How far a gun's earthwork stands above the ground it is dug out of. */
export function batteryRise(span = 20) {
  return Math.max(2.2, span * 0.11);
}

/**
 * The rings the pad is sampled on, as multiples of the battery's span.
 *
 * The last of them is the outer edge of the apron, so nothing the emplacement
 * is drawn with stands on ground that was never measured.
 */
export const BATTERY_FOOTPRINT = [0.25, 0.5, 0.75, 1.0, 1.18, 1.35];

/** Whoever fired a shell: a ship, or one of the guns ashore. */
function shellOwner(state, sh) {
  return sh.fromBattery
    ? state.batteries.find((b) => b.id === sh.owner)
    : state.ships.find((x) => x.id === sh.owner);
}

/**
 * Where a battery's sight line starts.
 *
 * Not at the gun. A battery stands on the ground, and a flat test run from a
 * point that is itself ashore says every bearing out of it is closed. So the
 * line is picked up a little way out along the bearing, past the gun's own
 * ground — which is what a gun on a hill actually shoots over.
 */
function batteryEye(state, bat, bearing) {
  const limit = bat.own ? (bat.own.rmax || bat.own.r) * 2 + 300 : 900;
  for (let r = 150; r <= limit; r += 150) {
    const x = bat.x + Math.sin(bearing) * r;
    const z = bat.z + Math.cos(bearing) * r;
    if (!islandAt(state.world, x, z, 0)) return { x, z };
  }
  return bat;
}

/** The enemy this battery would rather be shooting at, or null. */
function batteryTarget(state, bat, b, gun, arcLimit = true) {
  const arc = batteryArc(b);
  let best = null;
  let bestD = Infinity;
  for (const ship of state.ships) {
    if (!ship.alive || ship.team === bat.team) continue;
    const d = dist(bat.x, bat.z, ship.x, ship.z);
    // Out of range is out of range. This is the whole of what range means.
    if (d > gun.range || d > bestD) continue;
    const bearing = headingTo(bat.x, bat.z, ship.x, ship.z);
    // Inside the arc the mounting allows, or it can never bear -- unless we are
    // asking the other question, which is what the battery could reach if it
    // were re-laid.
    if (arcLimit && Math.abs(angleDelta(bat.heading, bearing)) > arc) continue;
    // And in sight: a hill between the two of them stops the shooting the same
    // way it stops a ship's — but not the hill the gun is standing on.
    if (d > 900) {
      const eye = batteryEye(state, bat, bearing);
      if (blockedByLand(state.world, eye.x, eye.z, ship.x, ship.z, bat.own)) continue;
    }
    best = ship;
    bestD = d;
  }
  return best;
}

/**
 * How fast a battery can be shifted onto a new bearing, in radians a second.
 *
 * Not the traverse: the traverse is the gun swinging on its own mounting, and
 * this is the mounting itself being re-laid, which on a pedestal is a matter of
 * the whole crew on the training gear and on a casemated piece is a matter of
 * concrete. So a gun that can already point anywhere never does it, a wide
 * mounting does it slowly, and a narrow one -- a casemate cut for one stretch
 * of water -- barely does it at all.
 */
function relayRate(b) {
  if ((b.traverse ?? 120) >= 360) return 0;
  return 0.02 + (b.traverse ?? 120) / 120 * 0.03;
}

function stepBatteries(state, dt) {
  for (const bat of state.batteries) {
    if (!bat.alive) continue;
    const b = BATTERIES[bat.batteryId];
    const gun = batteryGun(bat.batteryId);
    if (bat.cooldown > 0) bat.cooldown -= dt;

    // Anything that shoots upward takes its share of whatever flies over it.
    const aa = batteryAa(b);
    if (aa) {
      for (const p of state.planes) {
        if (p.team === bat.team) continue;
        const d = dist(bat.x, bat.z, p.x, p.z);
        if (d < aa.range) hurtFlight(state, p, aa.dps * dt * aaBite(d, aa.range));
      }
    }

    const arc = batteryArc(b);
    // Re-acquired twice a second rather than thirty times. Working out what a
    // battery can *see* is the expensive part -- the walk clear of its own
    // ground and the sight line over everything else -- and nothing on a
    // battlefield moves far in a thirtieth of a second.
    if (state.tick % 15 === bat.id % 15) {
      const found = batteryTarget(state, bat, b, gun);
      bat.targetId = found ? found.id : 0;
    }
    // But the cheap half of it is checked every tick. A ship that has just run
    // out of range or out of the arc must not go on being shot at for the rest
    // of the half-second until the battery next looks up.
    let target = bat.targetId
      ? state.ships.find((sp) => sp.id === bat.targetId && sp.alive)
      : null;
    if (target) {
      const d = dist(bat.x, bat.z, target.x, target.z);
      const bearing = headingTo(bat.x, bat.z, target.x, target.z);
      if (d > gun.range || Math.abs(angleDelta(bat.heading, bearing)) > arc) {
        target = null;
        bat.targetId = 0;
      }
    }
    // Nothing it can bear on: is there something it *could* bear on if the
    // mounting were shifted? A coast battery is not a fixture -- a crew that
    // can see a ship outside its arc gets on the training gear and brings the
    // whole mounting round onto her, and that is the difference between a gun
    // that fights the action it is in and one that spends it pointed at an
    // empty stretch of sea because of where it happened to be laid.
    if (!target && state.tick % 15 === bat.id % 15) {
      const rate = relayRate(b);
      if (rate > 0) {
        const off = batteryTarget(state, bat, b, gun, false);
        bat.relayTo = off ? headingTo(bat.x, bat.z, off.x, off.z) : null;
      }
    }
    if (!target && bat.relayTo !== null && bat.relayTo !== undefined) {
      const rate = relayRate(b);
      bat.heading = approachAngle(bat.heading, bat.relayTo, rate * dt);
      if (Math.abs(angleDelta(bat.heading, bat.relayTo)) < 0.01) bat.relayTo = null;
    }
    // With nothing to shoot at, back to the bearing it was laid on.
    const want = target
      ? clamp(angleDelta(bat.heading, headingTo(bat.x, bat.z, target.x, target.z)), -arc, arc)
      : 0;
    bat.angle = approachAngle(bat.angle, want, gun.traverse * dt);
    if (!target) { bat.targetId = 0; continue; }
    bat.relayTo = null;
    if (bat.cooldown > 0) continue;
    // Laid on, or still coming round.
    if (Math.abs(angleDelta(bat.angle, want)) > 0.02) continue;
    fireBattery(state, bat, b, gun, target);
  }
}

/**
 * The arc a battery chooses to shoot on.
 *
 * A gun laying on a distant ship has two solutions to pick from: a flat one
 * that arrives at belt height, and a lofted one that comes down on the deck.
 * Real coast gunnery used both — flat for a target close in, plunging fire for
 * one a long way off, because a deck is thinner than a belt and a shell falling
 * out of the sky finds it.
 *
 * `solveBallistic` always takes the low root of whatever gun it is handed, so
 * the choice is made here instead, by handing it a gun whose nominal maximum
 * range makes the low root come out at the elevation we want. For a shot of
 * `d` metres at elevation θ that range is `d / sin 2θ` — which is the range
 * equation read backwards.
 */
function loftedGun(state, gun, d) {
  // Half the salvos go up. Which half is drawn per salvo rather than per
  // battery, so a gun that is firing steadily straddles a target in both
  // planes rather than settling into one habit.
  const plunging = state.rng() < 0.5;
  const theta = plunging
    ? 0.56 + state.rng() * 0.17     // 32 to 42 degrees: down onto the deck
    : 0.14 + state.rng() * 0.16;    // 8 to 17 degrees: flat, into the belt
  const nominal = d / Math.max(0.08, Math.sin(2 * theta));
  // Never shorter than the shot itself: a nominal range under the distance is
  // a gun that cannot reach, and the solver would give back its 45-degree
  // fallback and drop the shell short.
  return { ...gun, range: Math.max(nominal, d * 1.02) };
}

function fireBattery(state, bat, b, gun, target) {
  const spec = gun.shells.ap;
  const d = clamp(dist(bat.x, bat.z, target.x, target.z), 400, gun.range);
  const bearing = wrapAngle(bat.heading + bat.angle);
  // A bedded gun shoots tighter than a rolling one, and the lead is the same
  // problem a ship's gunnery officer has: where she will be, not where she is.
  const s2 = solveBallistic(gun, d, bat.y);
  // The full flight time, up to a minute of it: at forty thousand metres a
  // shell is a good half-minute in the air, and a battery that leads by thirty
  // seconds of it lays every salvo astern of the target.
  const lead = Math.min(s2.tof, 60);
  const ax = target.x + Math.sin(target.heading) * target.speed * lead;
  const az = target.z + Math.cos(target.heading) * target.speed * lead;
  const aimD = clamp(dist(bat.x, bat.z, ax, az), 400, gun.range);
  const aimB = headingTo(bat.x, bat.z, ax, az);
  const spreadBase = (aimD * 0.0125) / gun.sigma;

  // One arc for the whole salvo: the barrels of a battery are laid together.
  const arc = loftedGun(state, gun, aimD);
  for (let g = 0; g < b.barrels; g++) {
    const lat = clamp(gauss(state.rng), -2.4, 2.4) * spreadBase * 0.35;
    const rng = clamp(gauss(state.rng), -2.4, 2.4) * spreadBase;
    const shotD = clamp(aimD + rng, 300, gun.range);
    const sol = solveBallistic(arc, shotD, bat.y);
    const bb = aimB + Math.atan2(lat, Math.max(600, aimD));
    const vh = sol.v * Math.cos(sol.elev);
    fireShell(state, {
      id: eid(),
      owner: bat.id, team: bat.team, fromBattery: true,
      x: bat.x + Math.sin(bb) * 14, z: bat.z + Math.cos(bb) * 14,
      y: bat.y + 6,
      vx: Math.sin(bb) * vh, vz: Math.cos(bb) * vh, vy: sol.v * Math.sin(sol.elev),
      g: sol.g,
      spec, caliber: gun.caliber,
      classId: null,
      life: 0,
    });
  }
  bat.cooldown = gun.reload;
  bat.lastFiredAt = state.t;
  state.events.push({
    e: 'muzzle', x: bat.x, z: bat.z, y: bat.y + 6, b: bearing,
    cal: gun.caliber, battery: bat.id,
  });
}

/**
 * A shell arriving on a battery.
 *
 * There is no citadel to find and no belt to bounce off — an emplacement is a
 * hole in the ground with a gun in it — so the question is only whether the
 * shell beats what the crew has over their heads. If it does not, it still
 * throws splinters about, which is why a battery under fire from a destroyer
 * is being worn down rather than ignored.
 */
function resolveBatteryHit(state, sh, bat) {
  const b = BATTERIES[bat.batteryId];
  const spec = sh.spec;
  const through = spec.pen >= b.armour;
  const dmg = spec.damage * (through ? 0.5 : 0.12);
  bat.hp -= dmg;
  const shooter = shellOwner(state, sh);
  if (shooter) {
    shooter.damageDealt += dmg;
    if (shooter.ribbons) shooter.ribbons.hits++;
  }
  state.events.push({
    e: 'hit', x: bat.x, y: bat.y + 5, z: bat.z, cal: sh.caliber,
    kind: through ? 'pen' : 'shatter', victim: bat.id, battery: true,
  });
  if (bat.hp <= 0 && bat.alive) {
    bat.alive = false;
    bat.hp = 0;
    if (shooter) shooter.kills++;
    state.events.push({ e: 'batterySilenced', x: bat.x, y: bat.y, z: bat.z, id: bat.id });
  }
}

function stepShells(state, dt) {
  const out = [];
  for (const sh of state.shells) {
    sh.life += dt;
    const px = sh.x, pz = sh.z, py = sh.y;
    sh.x += sh.vx * dt;
    sh.z += sh.vz * dt;
    sh.vy -= sh.g * dt;
    sh.y += sh.vy * dt;

    let consumed = false;
    // Ship intersection: sample the segment so fast shells cannot tunnel.
    for (const target of state.ships) {
      if (!target.alive || target.team === sh.team) continue;
      const cls = getClass(target.classId);
      const halfLen = cls.hull.length * 0.5;
      const halfBeam = cls.hull.beam * 0.5 + 2;
      const deck = 9 + cls.hull.superstructure * 14;
      if (dist2(sh.x, sh.z, target.x, target.z) > (halfLen + 260) * (halfLen + 260)) continue;
      const steps = 4;
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        const cx = lerp(px, sh.x, f), cz = lerp(pz, sh.z, f), cy = lerp(py, sh.y, f);
        if (cy > deck || cy < -2) continue;
        if (!pointInBox(cx, cz, target.x, target.z, target.heading, halfLen, halfBeam)) continue;
        resolveShellHit(state, sh, target, cx, cz, cy);
        consumed = true;
        break;
      }
      if (consumed) break;
    }
    if (consumed) continue;

    // And the guns ashore, which are a low, wide target rather than a hull.
    for (const bat of state.batteries) {
      if (!bat.alive || bat.team === sh.team) continue;
      const b = BATTERIES[bat.batteryId];
      const reach = b.span * 0.5 + 6;
      if (dist2(sh.x, sh.z, bat.x, bat.z) > (reach + 240) * (reach + 240)) continue;
      const steps = 4;
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        const cx = lerp(px, sh.x, f), cz = lerp(pz, sh.z, f), cy = lerp(py, sh.y, f);
        if (cy > bat.y + 14 || cy < bat.y - 4) continue;
        if (dist2(cx, cz, bat.x, bat.z) > reach * reach) continue;
        resolveBatteryHit(state, sh, bat);
        consumed = true;
        break;
      }
      if (consumed) break;
    }
    if (consumed) continue;

    if (sh.y <= 0) {
      const isle = islandAt(state.world, sh.x, sh.z, 0);
      state.events.push({ e: isle ? 'landhit' : 'splash', x: sh.x, z: sh.z, cal: sh.caliber });
      continue;
    }
    // A shell always ends on the water or on something, so this is only a net
    // under the arithmetic. It has to clear the longest flight on the largest
    // battlefield, which for a coast gun shooting across seventy thousand yards
    // is well over a minute.
    if (sh.life > 200) continue;
    out.push(sh);
  }
  state.shells = out;
}

/** Which part of the hull a shell struck, and the armour it must beat. */
function hitSection(target, cls, lx, lz, y, descentAngle) {
  const halfLen = cls.hull.length * 0.5;
  const rel = Math.abs(lz) / halfLen;
  const plunging = descentAngle > 0.52; // ~30 degrees, a deck hit
  // A citadel is a box of armour round her machinery and her magazines. A ship
  // with a couple of centimetres of plating amidships has not got one -- a
  // destroyer's machinery is behind her side and nothing else -- and calling
  // that a citadel made a Fletcher explode to a battleship's shell that in
  // fact goes in one side of her and out the other.
  const boxed = cls.armor.citadel >= 25;
  if (rel > 0.74) return { part: lz > 0 ? 'bow' : 'stern', armor: cls.armor.bow, cit: false };
  if (y > 11 + cls.hull.superstructure * 6) return { part: 'superstructure', armor: cls.armor.superstructure, cit: false };
  if (plunging) return { part: 'deck', armor: cls.armor.deck, cit: boxed && rel < 0.58 };
  // The citadel is the machinery and magazine box amidships, below the belt's
  // upper edge - the only place a shell can break a ship's back in one hit.
  return { part: 'belt', armor: cls.armor.belt, cit: boxed && rel < 0.6 && y < 10 };
}

/**
 * How square the shell met the plate.
 *
 * Everything about whether a shell gets in turns on this one number, and it is
 * a geometry problem and nothing else: the angle between the shell's line of
 * flight and the normal of the plate it arrived at. Nought is square on, which
 * is a shell at its best; a right angle is a shell running along the face of
 * the plate, which is a shell that never gets in whatever it is carrying.
 *
 * Her side is vertical and athwartships, so a belt hit is judged on how much
 * of the shell's flight is across the ship -- which is the whole of why
 * turning towards the enemy angles the belt, and why plunging fire meets it
 * badly as well. Her decks are horizontal, so a deck hit is judged on how
 * steeply the shell is falling. Her bow and her stern are neither: the plating
 * there is raked, so a shell coming down her length meets it a great deal
 * better than the same shell would meet the belt amidships.
 */
function strikeCos(sh, target, part) {
  const v = worldToLocal(sh.vx, sh.vz, target.heading);
  const speed = Math.hypot(v.x, sh.vy, v.z);
  if (!(speed > 0)) return 1;
  if (part === 'deck') return clamp(Math.abs(sh.vy) / speed, 0, 1);
  if (part === 'bow' || part === 'stern') {
    return clamp((Math.abs(v.x) + Math.abs(v.z) * 0.5) / speed, 0, 1);
  }
  return clamp(Math.abs(v.x) / speed, 0, 1);
}

/**
 * Whether it glanced off her instead of going in.
 *
 * A shell that arrives far enough off square does not penetrate the plate
 * however much penetration it is carrying: it turns on the face of it and goes
 * away over the ship. Where that begins is well known -- about sixty degrees
 * from the normal for an armour-piercing shell, and by about seventy-five
 * there is nothing that will not bounce.
 *
 * Except for one thing. A shell whose calibre is a good deal greater than the
 * plate is thick does not glance: it takes the plate with it, because there is
 * not enough steel there to turn something that size. That is overmatch, and
 * it is why a battleship's shells go through a cruiser's ends at any angle at
 * all while the cruiser's bounce off her.
 */
function ricochets(state, theta, spec, armor) {
  if (spec.caliber >= armor * 14.3) return false;
  // High explosive is fused to burst on the plate rather than to go through
  // it, so it only skips at angles where nothing whatever would bite.
  const lo = spec.type === 'ap' ? 1.047 : 1.396;
  const hi = spec.type === 'ap' ? 1.309 : 1.484;
  if (theta < lo) return false;
  if (theta >= hi) return true;
  return state.rng() < (theta - lo) / (hi - lo);
}

/** How far into the compartment each kind of burst reaches. */
const REACH = {
  citadel: 8, pen: 3, he: 1.5, overpen: 0.4, torpedo: 5, bomb: 6,
};

/**
 * Her magazine going up.
 *
 * The one thing that can end a capital ship in a second, and the reason her
 * magazines are the deepest, best-protected boxes in her: a shell that beats
 * every plate between the sea and the cordite and bursts among it does not
 * damage the ship, it ends her. Hood was hit at six in the morning and was
 * gone three minutes later, out of a company of fourteen hundred and nineteen.
 *
 * So it is not a large number of hit points. It is:
 *
 *   the compartment, gone -- not wrecked, gone, with the length of hull it was;
 *   the sea into her through the hole where it was, on both sides, at the
 *   depth of her keel, because there is no side left there to keep it out;
 *   the fires it starts in whatever is next to it;
 *   every mounting aboard out of action, because the shock does that;
 *   and a column of smoke and a report that carries the length of the map.
 *
 * She usually goes. Sometimes she does not, and then she is a ship with a
 * length of herself missing, which is its own kind of finish.
 */
function detonate(state, ship, where, owner) {
  const cls = shipClass(ship);
  const c = ship.sections[where];
  if (!c) return;
  // The compartment itself, and a great deal of what is either side of it.
  const gone = c.hp;
  c.hp = 0;
  ship.hp = hullIntegrity(ship);
  damageShip(state, ship, owner, gone + cls.hp * 0.34, 'magazine', where);
  if (!ship.alive) {
    state.events.push({
      e: 'detonate', ship: ship.id, at: where,
      x: r(ship.x), z: r(ship.z), cls: ship.classId,
    });
    return;
  }
  // Her side is not holed here, it is not there. Both sides, right down to
  // her keel, which is as open to the sea as a ship gets.
  const open = cls.hull.beam * cls.hull.draft * 0.55;
  openHull(state, ship, where, open, 1, cls.hull.draft * 0.9);
  openHull(state, ship, where, open, -1, cls.hull.draft * 0.9);
  c.side = 0;
  // And in the compartments either side of it, because a bulkhead next to a
  // magazine that has gone is not a bulkhead any more.
  const at = SECTIONS.findIndex((q) => q.k === where);
  for (const j of [at - 1, at + 1]) {
    const n = SECTIONS[j];
    if (!n || n.from === null) continue;
    damageShip(state, ship, owner, cls.hp * 0.09, 'magazine', n.k);
    openHull(state, ship, n.k, open * 0.22, 1, cls.hull.draft * 0.6);
    startFire(state, ship, n.k, 0.7);
  }
  startFire(state, ship, 'works', 0.5);
  // The shock. Nothing aboard is laying a gun for a while.
  for (const t of ship.turrets) t.disabled = Math.max(t.disabled, 26 + state.rng() * 20);
  for (const m of ship.secMounts) m.disabled = Math.max(m.disabled || 0, 20 + state.rng() * 16);
  ship.engineDamage = Math.max(ship.engineDamage, 18 + state.rng() * 20);
  ship.steeringDamage = Math.max(ship.steeringDamage, 18 + state.rng() * 20);
  ship.flooding = floodedCount(ship);
  state.events.push({
    e: 'detonate', ship: ship.id, at: where,
    x: r(ship.x), z: r(ship.z), cls: ship.classId,
  });
}

/**
 * What the burst found in the compartment it went off in.
 *
 * Nothing in a ship breaks because a number reached zero. Her machinery stops
 * when a shell gets into her machinery space and wrecks it, her steering jams
 * when one gets into the steering gear, and a mounting goes out when something
 * bursts under it -- and none of those three follows from any of the others,
 * or from how much damage she has taken elsewhere.
 *
 * The chance is the size of the burst against the size of the room it went off
 * in, which is why a six-inch shell in a destroyer's engine room stops her and
 * the same shell in a battleship's is a hole in a bulkhead. A shell that went
 * clean through her without bursting found almost nothing.
 */
function wreckContents(state, ship, where, bore, kind, at) {
  const cls = shipClass(ship);
  const room = sectionVolume(cls, where);
  // How much of the compartment the burst filled. The bursting charge goes as
  // the cube of the bore, so that is what this goes as.
  const reach = REACH[kind] ?? 1;
  const odds = room > 0
    ? clamp(bore * bore * bore * 9000 * reach / room, 0, 0.85)
    : 0.35;
  if (state.rng() >= odds) return;
  if (where === 'mid') {
    // Her machinery: steam everywhere, and none of it anywhere it is wanted.
    ship.engineDamage = Math.max(ship.engineDamage, 9 + state.rng() * 16);
  } else if (where === 'stern') {
    ship.steeringDamage = Math.max(ship.steeringDamage, 9 + state.rng() * 16);
  } else if (where === 'fwd' || where === 'aft') {
    // A magazine. Not a canned detonation -- a shell that gets into one is
    // already doing citadel damage -- but a fire in a handling room is the
    // worst fire there is in a ship.
    startFire(state, ship, where, 0.45);
  }
  // And the one mounting the burst actually reached.
  //
  // It used to take a mounting at random out of the whole ship whenever a
  // round got into her upperworks, so a five-inch hit abaft the funnel put A
  // turret out of action a hundred and fifty feet away, and there was no
  // knowing which one you had hit because it was not the one you had hit. A
  // burst reaches as far as a burst reaches: the nearest mounting to it, and
  // only if it is inside that.
  const hurt = nearestMount(ship, cls, at);
  if (hurt && hurt.d <= burstReach(kind, bore)) {
    hurt.m.disabled = Math.max(hurt.m.disabled || 0, 10 + state.rng() * 14);
  }
}

/**
 * How far a burst reaches, in metres, measured from where it went off.
 *
 * Scaled off a twelve-inch shell, because the bursting charge goes as the cube
 * of the bore and the radius it wrecks things inside goes as the cube root of
 * the charge -- which leaves the radius going as the bore. A five-inch shell
 * on the boat deck is a two-metre event; a torpedo is a fifteen-metre one.
 */
const BURST_M = {
  citadel: 11, pen: 7, he: 5, overpen: 2, shatter: 1.5, splash: 1.5,
  torpedo: 15, bomb: 13, magazine: 30,
};
function burstReach(kind, bore) {
  return (BURST_M[kind] ?? 4) * (bore / 0.3);
}

/**
 * The mounting nearest a point in her own frame, and how far off it is.
 *
 * Every mounting in the yard carries where it stands -- `x`, `z` and the
 * height of its muzzles -- because the guns are laid and fired from those
 * numbers. So "what did this shell hit" is a question the simulation can
 * answer properly rather than by drawing lots.
 */
function nearestMount(ship, cls, at) {
  if (!at) return null;
  let best = null;
  let bd = Infinity;
  const look = (live, spec) => {
    if (!live || !spec) return;
    for (let i = 0; i < live.length && i < spec.length; i++) {
      const s = spec[i];
      const d = Math.hypot((s.x || 0) - at.x, (s.my || 0) - at.y, s.z - at.z);
      if (d < bd) { bd = d; best = live[i]; }
    }
  };
  look(ship.turrets, cls.turrets);
  look(ship.secMounts, cls.secondary ? cls.secondary.mounts : null);
  return best ? { m: best, d: bd } : null;
}

export function resolveShellHit(state, sh, target, cx, cz, cy) {
  const cls = getClass(target.classId);
  const spec = sh.spec;
  const l = worldToLocal(cx - target.x, cz - target.z, target.heading);
  const speed = Math.hypot(sh.vx, sh.vz);
  const descent = Math.atan2(-sh.vy, Math.max(1, speed));
  const sec = hitSection(target, cls, l.x, l.z, cy, descent);

  // The geometry of the strike, and what her plate is worth against it. A
  // plate met at an angle is thicker in the shell's path than it is on the
  // drawing -- which is the whole of why a ship angles -- and the shell has
  // lost some of its penetration on the way out to her.
  const cosT = strikeCos(sh, target, sec.part);
  const theta = Math.acos(cosT);
  const travelled = dist(0, 0, sh.vx * sh.life, sh.vz * sh.life);
  const penFall = clamp(1.12 - travelled / 30000, 0.5, 1);
  const effArmor = sec.armor / Math.max(0.18, cosT);
  const pen = spec.pen * penFall;

  let dmg = 0, kind = 'pen';
  if (ricochets(state, theta, spec, sec.armor)) {
    kind = 'ricochet'; dmg = 0;
  } else if (spec.type === 'ap') {
    if (pen < effArmor) {
      // It broke up on the face of the plate. Some of the energy still gets
      // in; the shell does not.
      kind = 'shatter'; dmg = spec.damage * 0.04;
    } else if (sec.cit && pen > effArmor * 1.05) {
      // Into the box: her machinery and her magazines. It got there by going
      // through her armour, which is quite enough to start the fuse, and there
      // is nothing behind the plate to stop the burst.
      kind = 'citadel'; dmg = spec.damage;
    } else if (sec.armor < spec.fuseArm && pen > effArmor * 3) {
      // Straight through her. An armour-piercing shell is fused to burst a set
      // distance in, and it needs to meet a plate of a certain thickness to
      // start the fuse at all -- so a battleship's shell through a destroyer's
      // unarmoured side, or through a cruiser's bow, goes in one side and out
      // the other and bursts in the sea beyond her. Two holes and very little
      // else, which is why nobody fires armour-piercing at a destroyer.
      kind = 'overpen'; dmg = spec.damage * 0.1;
    } else {
      kind = 'pen'; dmg = spec.damage * 0.33;
    }
  } else {
    // High explosive does not have to get inside her to do its work, but it
    // does have to beat the plate to do it anywhere that matters.
    //
    // Against the plate as it is drawn, not as the shell met it. A shell fused
    // to burst on the face of the armour drives its hole through by blast, and
    // blast does not care what angle it arrived at or how far it has come:
    // there is no long shank of steel trying to stay pointed at anything.
    // Putting high explosive through the same arithmetic as armour-piercing
    // meant a five-inch shell could not open a destroyer's nineteen
    // millimetres of side, which is what the gun was for.
    if (spec.pen >= sec.armor) { kind = 'he'; dmg = spec.damage * 0.4; }
    else { kind = 'splash'; dmg = spec.damage * 0.1; }
    const fireRoll = state.rng();
    if (fireRoll < spec.fireChance * (target.fires >= 4 ? 0.3 : 1)) {
      // Where the shell went, not somewhere on the ship in general.
      startFire(state, target,
        sectionAt(l.z / (cls.hull.length * 0.5), sec.part), 0.3);
    }
  }

  // Whoever fired it: a ship, or one of the guns ashore. A battery carries the
  // same id, team, kills and damage a hull does, so it can be credited the
  // same way without the damage code having to know which it is holding.
  const owner = shellOwner(state, sh);
  const where = sectionAt(l.z / (cls.hull.length * 0.5), sec.part);
  if (dmg > 0) damageShip(state, target, owner, dmg, kind, where);
  // A penetration is a hole in her, and holes are what she is now counted in.
  // A shell that bounced or shattered on the plate has not opened anything.
  if (PENETRATING.has(kind)) target.sections[where].pens++;
  // And whatever was standing in the compartment the burst went off in. This
  // is the only way anything aboard her breaks: no threshold anywhere brings
  // her machinery to a stand, and no accumulation of damage somewhere else
  // does either. A shell got into her engine room, or it did not.
  if (kind !== 'ricochet' && kind !== 'shatter' && kind !== 'splash') {
    wreckContents(state, target, where, sh.caliber / 1000, kind,
      { x: l.x, y: cy, z: l.z });
  }
  // And whether it found the cordite.
  //
  // A shell that beat every plate between the sea and her magazine and burst
  // among the charges is the one hit that does not damage a ship. The three
  // things all have to be true: it got into the box (which means it beat her
  // belt or her deck), it beat it decisively rather than just squeezing
  // through, and the box it got into was a magazine and not her machinery.
  // Then it is the size of the burst against the size of the handling room,
  // the same arithmetic as everything else that happens inside her.
  if (kind === 'citadel' && (where === 'fwd' || where === 'aft')
    && pen > effArmor * 1.5 && target.alive) {
    const room = sectionVolume(cls, where) || 1;
    const bore = sh.caliber / 1000;
    if (state.rng() < clamp(bore * bore * bore * 27000 / room, 0, 0.3)) {
      detonate(state, target, where, owner);
    }
  }
  // And it is a hole in her plating, not only an entry in a book.
  //
  // A shell that goes through the side takes a piece of it with her: about her
  // own calibre across for a clean penetration, several times that where the
  // burst has blown the plating in. Below the waterline the sea comes straight
  // in; above it, nothing happens until she has settled far enough for the sea
  // to reach the hole -- which is how a ship hit high up in the forenoon
  // founders in the afternoon.
  if (HOLING.has(kind)
    && sec.part !== 'deck' && sec.part !== 'superstructure') {
    const bore = sh.caliber / 1000;
    const blown = kind === 'citadel' ? 9 : kind === 'he' ? 3.5
      : kind === 'overpen' ? 1.6 : 2.2;
    const area = Math.PI * (bore * blown * 0.5) ** 2;
    // Where it went in, relative to her waterline, and which side of her.
    const depth = -(cy - 0.6);
    const side = l.x >= 0 ? 1 : -1;
    openHull(state, target, where, area, side, depth);
    // A shell that went clean through her came out the other side, and the
    // hole it came out by is as much use to the sea as the one it went in by.
    // That is the whole of what an overpenetration is worth, and against a
    // ship with no armour worth beating it is worth a good deal.
    if (kind === 'overpen') openHull(state, target, where, area, -side, depth);
  }
  // A battery keeps no ribbon book: there is nobody aboard it to give one to.
  if (owner && owner.ribbons) {
    owner.ribbons.hits++;
    if (kind === 'citadel') owner.ribbons.cits++;
  }
  state.events.push({
    e: 'hit', kind, part: sec.part,
    x: cx, y: cy, z: cz, cal: sh.caliber,
    victim: target.id, owner: sh.owner, dmg: Math.round(dmg),
  });
}

// ---------------------------------------------------------------------------
// Torpedoes
// ---------------------------------------------------------------------------

/**
 * Where a torpedo mounting wants to be laid, and where it is allowed to be.
 *
 * The same problem as a turret's: the bearing the captain is aiming at, cut
 * down to the sector the bank can actually train through.
 */
/**
 * Can a bank of tubes fire on this bearing without putting the fish into her
 * own ship?
 *
 * A torpedo does not leave a barrel at half a mile a second: it goes over the
 * side, into the water, and runs. So the tube has to be pointed somewhere the
 * fish can actually get clear from -- and a bank on the centreline of a
 * destroyer, trained anywhere near fore and aft, is pointed down a hundred
 * and fourteen metres of her own deck.
 *
 * The test is the geometry and nothing else: from where the tube sits inside
 * her hull box, does the line of the shot reach the side before it reaches
 * the bow or the stern, and does it do it inside a beam's run? A Fletcher's
 * centreline mount comes out of that with about thirty degrees blind either
 * side of the bow and the same astern, which is what she really had.
 */
export function torpedoClear(cls, spec, local) {
  const hx = cls.hull.beam * 0.5;
  const hz = cls.hull.length * 0.5;
  const dx = Math.sin(local);
  const dz = Math.cos(local);
  // Which side she has to go out over. A mount on the centreline may use
  // either; one on the beam has to use its own, because the other one is
  // across the whole ship.
  const wall = spec.x > 0.5 ? hx : spec.x < -0.5 ? -hx : (dx > 0 ? hx : -hx);
  const across = wall - spec.x;
  if (Math.abs(dx) < 1e-6 || Math.sign(dx) !== Math.sign(across)) return false;
  // How far she runs before she is over the side, and before she would be
  // over the bow or the stern.
  const side = across / dx;
  const end = Math.abs(dz) < 1e-6 ? Infinity : ((dz > 0 ? hz : -hz) - spec.z) / dz;
  // Clear of the side first, and within a beam of running: a fish still over
  // her forecastle thirty metres from the tube is a fish in her own bow.
  return side <= end && side <= cls.hull.beam;
}

/**
 * Where the tubes want to point: the aim bearing, brought inside their arc,
 * and off any bearing their own hull is in the way of.
 *
 * A bank asked for a bearing it cannot shoot on trains to the nearest one it
 * can, which is what a torpedo officer does -- he lays the mount on the edge
 * of the arc and waits for the ship to come round.
 */
function torpDesired(ship, spec, local, cls) {
  const off = angleDelta(spec.angle, local);
  let want = Math.abs(off) > spec.arc
    ? wrapAngle(spec.angle + Math.sign(off) * spec.arc)
    : local;
  if (!cls || torpedoClear(cls, spec, want)) return want;
  // Blocked. Walk out to either side of the wanted bearing and take the
  // nearest one that is both inside the arc and clear of her own hull.
  for (let step = 0.04; step <= Math.PI; step += 0.04) {
    for (const sgn of [1, -1]) {
      const t = wrapAngle(want + sgn * step);
      if (Math.abs(angleDelta(spec.angle, t)) > spec.arc) continue;
      if (torpedoClear(cls, spec, t)) return t;
    }
  }
  return want;
}

/**
 * Train the tubes.
 *
 * A bank of torpedo tubes is not a thing that fires wherever it is pointed at
 * the instant the button is pressed: it is fifteen tons of tubes on a training
 * ring, and it has to be brought round onto the firing bearing first. So it
 * follows the aim point on its own gear, and the order to fire is only obeyed
 * once it has arrived.
 */
function stepTorpMounts(state, ship, dt) {
  const cls = shipClass(ship);
  if (!cls.torpedoes || !ship.torpMounts.length) return;
  const T = cls.torpedoes;
  const world = headingTo(ship.x, ship.z, ship.aimX, ship.aimZ);
  const local = wrapAngle(world - ship.heading);
  const rate = (T.traverse ?? 0.3) * dt;
  for (const m of ship.torpMounts) {
    m.angle = approachAngle(m.angle, torpDesired(ship, T.mounts[m.id], local, cls), rate);
  }
}

export function fireTorpedoes(state, ship) {
  const cls = shipClass(ship);
  if (!cls.torpedoes || !ship.alive) return 0;
  const T = cls.torpedoes;
  let launched = 0;
  for (const m of ship.torpMounts) {
    if (m.cooldown > 0) continue;
    const spec = T.mounts[m.id];
    const world = headingTo(ship.x, ship.z, ship.aimX, ship.aimZ);
    const local = wrapAngle(world - ship.heading);
    if (Math.abs(angleDelta(spec.angle, local)) > spec.arc) continue;
    // Her own hull is not something to fire a torpedo through. The bank trains
    // to the nearest bearing it can shoot on, so it will be sitting on the
    // edge of the blind sector with the target beyond it -- and firing there
    // is five fish thirty degrees off the target for the sake of pressing the
    // button. The order is refused until the ship has come round.
    if (!torpedoClear(cls, spec, local)) continue;
    if (!torpedoClear(cls, spec, m.angle)) continue;
    // And she has to have come round. Fired before the bank has trained, the
    // fish go where the tubes were pointing, which is over her own bow.
    if (Math.abs(angleDelta(m.angle, torpDesired(ship, spec, local, cls))) > 0.05) continue;
    const pos = localToWorld(spec.x, spec.z, ship.heading);
    // Down the line of the tubes, which is where a torpedo goes.
    const base = wrapAngle(ship.heading + m.angle);
    for (let i = 0; i < spec.tubes; i++) {
      const off = (i - (spec.tubes - 1) / 2) * (T.spread / Math.max(1, spec.tubes - 1)) * 2;
      state.torps.push({
        id: eid(), owner: ship.id, team: ship.team,
        x: ship.x + pos.x, z: ship.z + pos.z,
        heading: wrapAngle(base + off),
        speed: T.speed, range: T.range, travelled: 0,
        damage: T.damage, detection: T.detection, arming: T.arming,
        flood: T.floodChance,
      });
      launched++;
    }
    m.cooldown = T.reload;
    state.events.push({ e: 'torpLaunch', x: ship.x + pos.x, z: ship.z + pos.z, ship: ship.id });
  }
  return launched;
}

function stepTorpedoes(state, dt) {
  const out = [];
  for (const tp of state.torps) {
    const nx = tp.x + Math.sin(tp.heading) * tp.speed * dt;
    const nz = tp.z + Math.cos(tp.heading) * tp.speed * dt;
    tp.travelled += tp.speed * dt;
    tp.x = nx; tp.z = nz;
    const bound = state.world.half || MAP_HALF;
    if (tp.travelled > tp.range || Math.abs(tp.x) > bound || Math.abs(tp.z) > bound) continue;
    if (islandAt(state.world, tp.x, tp.z, 0)) { state.events.push({ e: 'splash', x: tp.x, z: tp.z, cal: 200 }); continue; }

    let hit = false;
    if (tp.travelled > tp.arming) {
      for (const target of state.ships) {
        if (!target.alive || target.team === tp.team) continue;
        const cls = getClass(target.classId);
        if (!pointInBox(tp.x, tp.z, target.x, target.z, target.heading, cls.hull.length * 0.5, cls.hull.beam * 0.5 + 3)) continue;
        const owner = state.ships.find((s) => s.id === tp.owner);
        // What she has between the warhead and the inside of the ship. A big
        // hull carries her machinery well inboard of her side, with bulges,
        // voids and the fuel tanks between -- so the charge spends itself on
        // her protection rather than on her. A destroyer has her beam and
        // nothing else, and her belt, such as it is, was never meant for this.
        const reduction = clamp((cls.hull.beam - 12) / 46, 0, 0.42)
          + clamp(cls.armor.belt / 900, 0, 0.15);
        const lt = worldToLocal(tp.x - target.x, tp.z - target.z, target.heading);
        const hole = sectionAt(lt.z / (cls.hull.length * 0.5), 'belt');
        // A torpedo does not break a ship in half. It opens her side, and the
        // sea does the rest -- which is why a torpedoed ship goes down slowly,
        // by the compartment, and not in a flash. What the warhead itself
        // wrecks is local to where it went off: frames, the plating round it,
        // whatever was standing against that bulkhead. The ship is killed by
        // the water, and the water is what this is really for.
        damageShip(state, target, owner, tp.damage * 0.28 * (1 - reduction), 'torpedo', hole);
        target.sections[hole].pens++;
        // Four metres under water and against her side, which is where a
        // torpedo goes off and a long way below anything that trains.
        wreckContents(state, target, hole, 0.533, 'torpedo',
          { x: lt.x, y: -4, z: lt.z });
        // Because it does not make a hole, it makes a room: thirty to sixty
        // square metres of her side is simply gone, four metres under water, on
        // whichever side she was hit -- which is why one torpedo puts a list on
        // a ship and two on the same side roll her over.
        //
        // The anti-torpedo protection of a big hull cuts the opening down but
        // does not close it: that is what the bulges were for.
        const side = lt.x >= 0 ? 1 : -1;
        openHull(state, target, hole,
          (34 + state.rng() * 30) * (1 - reduction), side, 4 + state.rng() * 2.5);
        if (owner) owner.ribbons.torps++;
        state.events.push({ e: 'torpHit', x: tp.x, z: tp.z, victim: target.id, owner: tp.owner });
        hit = true;
        break;
      }
    }
    if (!hit) out.push(tp);
  }
  state.torps = out;
}

// ---------------------------------------------------------------------------
// Carrier air groups
// ---------------------------------------------------------------------------

/** The air group a class sails with unless a captain has said otherwise. */
export function defaultAirGroup(cls) {
  const g = cls.planes && cls.planes.group;
  return g ? { ...g.default } : null;
}

/**
 * Take what a captain asked for and make it something she can actually embark.
 *
 * Each type is clamped to its own limits, the whole group to her capacity, and
 * she must sail with enough strike aircraft to be worth sending. Anything the
 * trimming leaves over goes to the fighters, who are the ones you can always
 * find room for. Both ends run this, so a request that arrives malformed --
 * or edited on its way -- is landed on a legal group rather than rejected.
 */
export function normaliseAirGroup(cls, want) {
  const spec = cls.planes && cls.planes.group;
  if (!spec) return null;
  if (!want || typeof want !== 'object') return { ...spec.default };
  const pick = (k) => {
    const v = Math.round(Number(want[k]));
    if (!Number.isFinite(v)) return spec.default[k];
    return Math.max(spec.min[k], Math.min(spec.max[k], v));
  };
  const g = { fighters: pick('fighters'), dive: pick('dive'), torpedo: pick('torpedo') };
  // Enough strike aircraft to be worth the deck space.
  let strike = g.dive + g.torpedo;
  while (strike < spec.minStrike) {
    if (g.torpedo < spec.max.torpedo) g.torpedo++;
    else if (g.dive < spec.max.dive) g.dive++;
    else break;
    strike = g.dive + g.torpedo;
  }
  // And no more aircraft than she has hangar for: trim the fighters first,
  // then whichever strike type she has most of.
  let total = g.fighters + g.dive + g.torpedo;
  while (total > spec.total) {
    if (g.fighters > spec.min.fighters) g.fighters--;
    else if (g.dive > g.torpedo && g.dive > spec.min.dive) g.dive--;
    else if (g.torpedo > spec.min.torpedo) g.torpedo--;
    else if (g.dive > spec.min.dive) g.dive--;
    else break;
    total = g.fighters + g.dive + g.torpedo;
  }
  return g;
}

/**
 * Which of her compartments the flight deck stands on.
 *
 * A carrier's flight deck is a structure built on top of the hull, and it is
 * only as good as what is underneath it. Blow the machinery spaces open and
 * the deck over them goes with them: there is a hole in the planking where
 * aircraft have to run.
 *
 * The deck run starts at the round-down and goes the length of her, so it
 * crosses the after magazine, the machinery and the forward magazine. Any one
 * of those opened up and there is nothing to fly off.
 */
const DECK_OVER = ['aft', 'mid', 'fwd'];

/**
 * Is her flight deck wrecked?
 *
 * Not damaged -- wrecked. A compartment has to be gone, not merely holed,
 * before the deck above it is unusable: a carrier fought with her deck full of
 * holes all through the war, and patched them between strikes.
 */
export function flightDeckOut(ship) {
  if (!ship.sections) return false;
  return DECK_OVER.some((k) => ship.sections[k] && ship.sections[k].hp <= 0);
}

/** How long one launch takes the deck, from the lift going down to wheels up. */
// How long her deck is fouled by one launch. It is the whole evolution -- lift
// down, lift up, taxi, run up, and the run itself, which is flown and takes as
// long as a loaded Avenger takes to get her wheels off five hundred feet of
// planking. Nothing else can use the deck until she is off it.
export const DECK_CYCLE = 26;
/** No nearer than this: closer than her own deck run is not a target. */
export const MIN_STRIKE_RANGE = 1200;

export function launchStrike(state, ship) {
  const cls = shipClass(ship);
  if (!cls.planes || !ship.alive) return false;
  if (ship.deckBusy > 0) return false;
  // Nothing takes off over a hole. See flightDeckOut.
  if (flightDeckOut(ship)) return false;
  const sq = ship.squadrons.find((s) => s.state === 'deck' && s.cooldown <= 0);
  if (!sq) return false;
  const d = dist(ship.x, ship.z, ship.aimX, ship.aimZ);
  if (d > cls.planes.strikeRange) return false;
  // And not at a point on top of her. A squadron sent to where it already is
  // arrives on the next tick and is recovered on the one after -- the aircraft
  // is still on the lift when the simulation has already flown it out and
  // brought it home, which is not a strike, it is a bookkeeping entry.
  if (d < MIN_STRIKE_RANGE) return false;
  sq.state = 'flying';
  ship.deckBusy = cls.planes.deckCycle ?? DECK_CYCLE;
  // The order is not the launch. Pressing it rings the deck: the lift fetches
  // her up, she taxis forward, runs up against the brakes and goes down the
  // deck, and only when her wheels leave the planking is there an aeroplane in
  // the air. Putting the squadron on the board on the tick the button was
  // pressed had one appear over the ship while the model of her was still
  // taxiing past the island.
  // A strike is not one lump of aeroplanes. It is up to three flights, and they
  // do not want the same things: the fighters go to clear the air and then to
  // shoot up whatever is small enough to hurt, the dive bombers will take
  // anything they are pointed at, and the torpedo bombers are only worth their
  // fuel against something big. So they go up as separate flights and each one
  // finds its own target.
  const group = ship.airGroup || defaultAirGroup(cls) || cls.planes.flight
    || { fighters: 0, dive: 0, torpedo: 4 };
  const share = (n) => Math.max(0, Math.round(n / cls.planes.squadrons));
  let fighters = share(group.fighters);
  let bomb = share(group.dive);
  let torp = share(group.torpedo);
  // A group small enough to round away to nothing still sends what it has:
  // otherwise a captain who embarked two torpedo bombers watches a squadron
  // fly out, find the enemy and drop nothing at all.
  if (fighters + bomb + torp === 0) {
    if (group.torpedo > 0) torp = 1;
    else if (group.dive > 0) bomb = 1;
    else if (group.fighters > 0) fighters = 1;
    else torp = 1;
  }
  ship.launching = {
    sqId: sq.id, left: cls.planes.deckRun ?? DECK_RUN,
    tx: ship.aimX, tz: ship.aimZ,
    // The first flight off the deck leads the strike; the rest form on her.
    // Filled in when she is actually airborne, because until then there is no
    // flight to be the leader.
    lead: 0, slot: 0,
    // Which side a catapult ship is shooting off this time. She has two and
    // uses them turn and turn about.
    side: (ship.catSide = -(ship.catSide || 1)),
    flights: [
      { role: 'fighter', count: fighters, torp: 0, bomb: 0 },
      { role: 'dive', count: bomb, torp: 0, bomb },
      { role: 'torpedo', count: torp, torp, bomb: 0 },
    ].filter((f) => f.count > 0),
    escort: fighters,
  };
  state.events.push({ e: 'launch', x: ship.x, z: ship.z, ship: ship.id });
  return true;
}

/**
 * How long from the flag to her wheels leaving the deck.
 *
 * The lift, the taxi, the run-up and the deck run itself. It is what the model
 * on screen takes, and the two have to agree or an aeroplane appears in the sky
 * while the one you are watching is still on the planking.
 */
export const DECK_RUN = 24.5;

/**
 * How far ahead of the ship the deck run leaves an aeroplane.
 *
 * She does not appear over the ship: she has just run the length of the
 * planking and gone off the bow, climbing away, and where she is at that
 * moment is where whatever flies her next has to pick her up. Born at the ship
 * instead, she was three or four hundred metres from her own flight the
 * instant she existed -- and the client, finding the aeroplane it was drawing
 * that far from the squadron it belonged to, dragged it across the gap. That
 * is the aeroplane that takes off and then teleports.
 *
 * The figure is where the Enterprise's launch evolution actually leaves her,
 * measured off the integrated deck run rather than guessed: she starts at the
 * round-down and her wheels leave the planking amidships.
 */
export const DECK_RUN_OUT = 156;

/**
 * Where a launch leaves her, relative to the ship: how far, and on what
 * bearing off her head.
 *
 * A carrier's aeroplane goes off the bow, so she is dead ahead. A cruiser's
 * scout is thrown off a catapult that has been trained out over the side, so
 * she is off the beam -- and putting her ahead instead is a scout that appears
 * a hundred and fifty metres from where you watched her go. The distances are
 * measured off the integrated launch each ship actually flies.
 */
export function launchOffset(cls, side = 1) {
  const P = cls.planes || {};
  const out = P.runOut ?? DECK_RUN_OUT;
  const bearing = (P.runBearing ?? 0) * (P.runBearing ? side : 1);
  return { out, bearing };
}

/**
 * Put a flight in the air, once she has actually left the deck -- and then
 * range the next one and send her down after her.
 *
 * A squadron does not leave the deck abreast. One aeroplane at a time comes up
 * the lift, taxis forward, runs up and goes, and the next one follows her
 * down. It used to put every flight of the strike into the air on the same
 * tick, which is three squadrons appearing at once round the single aeroplane
 * you had just watched take off.
 */
function stepLaunch(state, ship, dt) {
  const L = ship.launching;
  if (!L) return;
  const cls = shipClass(ship);
  const sq = ship.squadrons.find((s) => s.id === L.sqId);
  // The deck going out is not something to find out about at the end of the
  // run: she is on it now, at eighty knots, and the moment the planking opens
  // under her there is nowhere for her to go.
  const wrecked = ship.alive && sq && sq.state === 'flying' && flightDeckOut(ship);
  L.left -= dt;
  if (L.left > 0 && !wrecked) return;
  // She was sunk, or her squadron was struck below while she was on the run.
  // Whatever of the strike is already up stops waiting for the rest of it.
  if (!ship.alive || !sq || sq.state !== 'flying') {
    ship.launching = null;
    releaseStrike(state, ship, L.sqId);
    return;
  }
  // The deck went out from under her while she was running down it.
  //
  // She is at eighty knots on a deck with a hole in it and there is nowhere to
  // go: she goes into it. Whatever of the strike had already left carries on
  // -- they are in the air and the ship's troubles are no longer theirs -- and
  // the rest of the squadron is still below, so it is put back on the board
  // for whenever the deck is fit to use again.
  if (flightDeckOut(ship)) {
    ship.launching = null;
    ship.deckBusy = 0;
    sq.state = 'deck';
    sq.cooldown = Math.max(sq.cooldown, 30);
    releaseStrike(state, ship, L.sqId);
    state.events.push({ e: 'deckCrash', ship: ship.id, x: r(ship.x), z: r(ship.z) });
    damageShip(state, ship, null, cls.hp * 0.02, 'fire', 'works');
    startFire(state, ship);
    return;
  }
  const f = L.flights.shift();
  if (f) {
    // Off the bow on the ship's own head, climbing, and turning toward the
    // target from there: the deck run is down her centreline, not toward
    // whatever she has been laid on.
    // Where this ship's launch actually leaves her: off the bow down a flight
    // deck, off the beam off a catapult.
    const off = launchOffset(cls, L.side || 1);
    const away = wrapAngle(ship.heading + off.bearing);
    const p = {
      id: eid(), owner: ship.id, team: ship.team, sqId: sq.id, role: f.role,
      // What she is, as against what she is for. A cruiser flies float planes
      // and a carrier flies three different machines, and the role alone does
      // not say which: a catapult scout's role is `dive`, so drawn off the
      // role she came out as a Dauntless on a battleship's quarterdeck.
      type: cls.planes.type || null,
      speed: cls.planes.cruiseSpeed,
      x: ship.x + Math.sin(away) * off.out,
      z: ship.z + Math.cos(away) * off.out,
      heading: away,
      tx: L.tx, tz: L.tz,
      torp: f.torp, bomb: f.bomb,
      count: f.count,
      // Fighters are harder to catch than a loaded bomber, and they are what
      // keeps the flak and the enemy's CAP off the ones carrying the weapons.
      // Where the launch actually leaves her, off the ground: the end of the
      // integrated deck run or catapult shot, not a number chosen to look
      // right. She climbs away from there under her own power.
      y: cls.planes.runHeight ?? 41,
      vy: 4,
      hp: planeHp(cls, f, L),
      // The aeroplanes themselves. A flight is not a hit-point bar with a
      // number of aircraft written on it: it is that many machines, each with
      // her own engine, tanks, wings, tail and crew, and each of them able to
      // be hit, set on fire, crippled or shot down on her own. See
      // airframe.js.
      perHp: planeHp(cls, f, L) / Math.max(1, f.count),
      machines: Array.from({ length: f.count },
        () => freshAirframe(planeHp(cls, f, L) / Math.max(1, f.count))),
      // She does not set off on her own. A strike forms up over the ship and
      // goes out together -- see stepFormation.
      phase: 'formup', dropped: false, life: 0, hunt: 0,
      lead: L.lead, slot: L.slot++,
      // Set while somebody is flying her by hand; see flyPlane.
      flown: false, flownAt: 0, dead: false,
      targetId: 0, targetAir: 0, turn: 0,
    };
    if (!L.lead) L.lead = p.id;
    state.planes.push(p);
    // Which flight the aeroplane that has just gone down the deck became.
    //
    // The client draws one aeroplane in full -- the model it watched come up
    // the lift and run -- and it has to know which marker on the plot she is.
    // It used to work that out by taking whichever of the carrier's flights
    // was youngest, and the answer changed under it every time another one
    // went: the aeroplane already in the air was let go of, snapped onto the
    // formation of the flight that had just left, and the flight she had been
    // was drawn from nothing somewhere else. That is the squadron that takes
    // off one at a time and then all jumps together.
    state.events.push({ e: 'airborne', ship: ship.id, i: p.id, r: p.role });
  }
  if (!L.flights.length) {
    ship.launching = null;
    // The last of them is up, so the strike is complete and it goes.
    releaseStrike(state, ship, L.sqId);
    return;
  }
  // The next one is ranged and goes down the deck after her. The deck stays
  // busy for the whole of it, so nothing else can use it meanwhile.
  L.left = cls.planes.deckRun ?? DECK_RUN;
  ship.deckBusy = Math.max(ship.deckBusy, L.left + (cls.planes.deckCycle ?? DECK_CYCLE) * 0.35);
  state.events.push({ e: 'launch', x: ship.x, z: ship.z, ship: ship.id });
}

/**
 * The strike is complete: it stops circling and sets off.
 *
 * Nothing about this moves an aeroplane. It changes what each of them is
 * flying towards, and they fly there.
 */
function releaseStrike(state, ownerId, sqId) {
  for (const p of state.planes) {
    if (p.owner !== ownerId || p.sqId !== sqId) continue;
    if (p.phase === 'formup') p.phase = 'outbound';
  }
}

/**
 * Is the strike formed up and ready to go?
 *
 * Two things have to be true: the last of it is off the deck, and everybody
 * is in station. Releasing it the moment the last aeroplane's wheels came up
 * put the leader a mile and a half ahead of the flight that had just taken
 * off, and since they all cruise at the same speed nobody could ever close
 * that -- so the strike went out as a string of three rather than as one
 * formation. It waits, going round its circle, until they are on her.
 */
function strikeFormed(state, lead, ship) {
  if (ship && ship.launching && ship.launching.sqId === lead.sqId) return false;
  // Somebody has been lost, or cannot join for some reason we have not thought
  // of. A strike does not circle its own carrier for ever.
  let youngest = lead.life;
  let joined = true;
  for (const q of state.planes) {
    if (q.dead || q.id === lead.id) continue;
    if (q.owner !== lead.owner || q.sqId !== lead.sqId) continue;
    youngest = Math.min(youngest, q.life);
    const g = formationGoal(state, q, ship);
    if (g && dist(q.x, q.z, g.x, g.z) > JOIN) joined = false;
  }
  // On her, or the rendezvous has taken as long as a rendezvous is allowed to
  // take. A strike does not circle its own carrier for ever waiting for a
  // flight that has been shot down or cannot close for some reason we have
  // not thought of: it goes.
  return joined || youngest > RENDEZVOUS;
}

/**
 * How far off her leader each flight of a strike stands.
 *
 * Across and astern, in the leader's own frame, in metres. Wide enough that
 * three formations read as three formations rather than one smear, close
 * enough that they read as one strike -- which is the point of forming up at
 * all. A strike that goes out in company arrives in company; three flights
 * that each set off the moment their wheels came up arrive one at a time and
 * are shot down one at a time.
 */
const STATION = [[0, 0], [250, -210], [-270, -250], [460, -450], [-490, -490]];

/** How near the enemy the strike breaks formation and each flight goes in. */
const BREAK_RANGE = 4000;

/** Near enough her station to count as joined up. */
const JOIN = 420;
/** And how long the whole strike will wait for the last of it, in seconds. */
const RENDEZVOUS = 20;

/**
 * Where a flight is trying to be while the strike is still forming up, or
 * while it is on its way out in company.
 *
 * The leader flies a left-hand circuit over the ship until the last of them is
 * off the deck. Everybody else flies to her station on the leader. Both of
 * them are goals, not positions: nothing here sets x or z, so there is no way
 * for any of it to put an aeroplane anywhere. It can only ever make her fly
 * somewhere.
 */
function formationGoal(state, p, carrier) {
  if (!p.lead || p.lead === p.id) {
    if (p.phase !== 'formup') return null;
    // The form-up circle: a mile-wide left-hand orbit over the ship, at the
    // rate she can hold, so she is always turning gently rather than beating
    // back and forth across the same patch of sky.
    if (!carrier) return null;
    // Flown at the rate she can actually hold it: a mile-and-a-half circle at
    // ninety metres a second, so the point she is chasing is going round it a
    // shade slower than she is and she can sit on it instead of cutting the
    // corner every lap.
    const R = 1500;
    const a = p.life * 0.06;
    return { x: carrier.x + Math.sin(a) * R, z: carrier.z + Math.cos(a) * R };
  }
  const lead = state.planes.find((q) => q.id === p.lead && !q.dead);
  // Her leader has been shot down, or has already gone in. She is her own
  // leader from here.
  if (!lead) { p.lead = p.id; return null; }
  if (lead.phase === 'return') { p.lead = p.id; return null; }
  // In sight of the enemy the formation breaks and each flight makes its own
  // attack, which is what a strike does over the target: they arrive together
  // and they go in separately, from different bearings, so the flak cannot
  // concentrate on any one of them.
  if (p.phase !== 'formup') {
    for (const s of state.ships) {
      if (!s.alive || s.team === p.team) continue;
      if (dist(lead.x, lead.z, s.x, s.z) < BREAK_RANGE) { p.lead = p.id; return null; }
    }
  }
  const [sx, sz] = STATION[Math.min(STATION.length - 1, p.slot || 0)];
  const sn = Math.sin(lead.heading);
  const cs = Math.cos(lead.heading);
  return { x: lead.x + sn * sz + cs * sx, z: lead.z + cs * sz - sn * sx };
}

/**
 * What each kind can sustain in a turn, in radians a second, and how fast she
 * rolls into one.
 *
 * A Wildcat clean at cruise comes round at about sixteen degrees a second; a
 * loaded Avenger with a torpedo slung under her is a good deal slower than
 * that, and it is why a torpedo attack has to be set up from a long way out.
 */
/**
 * What a fighter's guns do to another aeroplane, in damage a second.
 *
 * Six half-inch guns firing into another aircraft settle it quickly once
 * somebody is in position -- seconds, not minutes. At twenty-six, which is
 * where this started, two flights of Wildcats could turn about each other for
 * four minutes without either of them going down, which is not a fighter
 * action, it is an escort.
 */
const FIGHTER_GUNS = 85;

const TURN_RATE = { fighter: 0.28, dive: 0.22, scout: 0.22, torpedo: 0.17 };
const ROLL_RATE = 0.5;

/** Gravity, which everything in the air is subject to. */
const G = 9.80665;

/**
 * What each kind can do in the vertical, and how high she can get.
 *
 * `climb` is her best rate of climb at sea level in metres a second -- a
 * Wildcat's twenty-two hundred feet a minute, a loaded Avenger's eleven -- and
 * it falls off as she gets up, because the engine is breathing thinner air.
 * `dive` is what the airframe will stand going down. Between them and gravity
 * they are the whole of an aeroplane's vertical.
 *
 * A flight used to have no height at all. The client drew her at a height it
 * worked out from how long she had been up, which meant every aeroplane in the
 * game climbed at the same rate to the same altitude whatever she was and
 * whatever she was doing, and a dive bomber dived by changing a number on the
 * client that nothing else could see.
 */
const AIRFRAME = {
  // `g` is how hard she can change what her vertical speed is doing, in
  // gravities. A ship's aeroplane on passage pulls almost nothing; a fighter
  // manoeuvring pulls a fair amount; a dive bomber pushing over the top and
  // pulling out at the bottom pulls a great deal, because that is the whole
  // manoeuvre. Left at a third of a gravity for everybody a dive bomber took
  // half a minute to get her nose down, which is not a dive -- she arrived
  // over the target still flying level and dropped her bomb out of the
  // window, which is exactly what it looked like.
  fighter: { climb: 11.5, ceiling: 3800, dive: 34, g: 1.3 },
  dive: { climb: 9.0, ceiling: 3600, dive: 118, g: 2.7 },
  scout: { climb: 5.5, ceiling: 3000, dive: 26, g: 0.4 },
  torpedo: { climb: 6.0, ceiling: 2900, dive: 30, g: 0.55 },
};

/** What a strike cruises at, and what it comes down to in order to attack. */
const CRUISE_ALT = 760;
/**
 * And the height it forms up at, which is lower.
 *
 * Everybody joins at the rendezvous height and the whole strike climbs out
 * together afterwards. Having the leader circle at cruising height instead
 * left each flight that came off the deck two hundred metres below her and
 * climbing -- and climbing costs speed, so they could not close either, and
 * the strike went out strung a kilometre apart.
 */
const FORM_ALT = 260;
/** A torpedo bomber runs in on the water; a dive bomber comes over the top. */
const RUN_IN_ALT = { torpedo: 42, dive: 1150, fighter: 300, scout: 260 };
/**
 * A dive bombing attack, which is a shape rather than a height.
 *
 * She climbs to the perch on the way in, comes over the top of her target,
 * and goes down a straight line at fifty-odd degrees until she is close
 * enough to be sure of her aim. Height against ground range is what a dive
 * angle is, so the profile is written that way round and the angle falls out
 * of it -- fifteen hundred metres of height given up over nine hundred of
 * ground is a fifty-one degree dive, which is a dive bomber's dive.
 *
 * What it replaces was a bomber that flew flat at nine hundred metres and let
 * go: the bomb had to be thrown thirty degrees above the horizontal to reach
 * the ship at all, and nothing about it looked like an attack.
 */
const DIVE_PERCH = 1150;       // the height she pushes over from
const DIVE_PUSH = 900;         // and the ground range she does it at
const DIVE_DROP = 260;         // her height when the bomb leaves her
const DIVE_AT = 240;           // and the range -- just inside the release
/**
 * And the speed she holds coming down, which is what the brakes are for.
 *
 * A dive bomber without her brakes out arrives too fast to aim and too fast
 * to pull out; with them she holds about two hundred and fifty knots all the
 * way down whatever the angle. So her speed through the air is the constant
 * and her speed over the ground is what is left of it once the vertical has
 * taken its share -- which is why a steep dive crosses the ground slowly and
 * why the flak gets a long look at her.
 */
const DIVE_SPEED = 128;
/**
 * How far out each kind starts changing height, and where she has to be at it.
 *
 * A torpedo bomber does not dive at her target: she lets down miles out and
 * runs in flat on the water, which is why she is in the flak so long and why
 * she needs the fighters. A dive bomber does the opposite -- she comes in high
 * and pushes over on top. Both have to be at the right height before they get
 * there, not diving for it at the last moment.
 */
// A dive bomber starts for the perch the moment she is out of company, which
// is a long way out: two hundred and fifty metres of climb at a loaded
// bomber's rate of climb is most of a minute, and she has to be at the top of
// it before she is over her target rather than still going up underneath her.
const RUN_IN_FROM = { torpedo: 5200, dive: 9000, fighter: 3000, scout: 3200 };
const RUN_IN_BY = { torpedo: 1400, dive: 900, fighter: 600, scout: 800 };

/** The best rate of climb anything in this strike can hold. */
function slowestClimb(state, p) {
  let slow = Infinity;
  for (const q of state.planes) {
    if (q.dead || q.owner !== p.owner || q.sqId !== p.sqId) continue;
    const f = AIRFRAME[q.role] || AIRFRAME.scout;
    if (f.climb < slow) slow = f.climb;
  }
  return Number.isFinite(slow) ? slow : (AIRFRAME[p.role] || AIRFRAME.scout).climb;
}

/**
 * The height she wants to be at, which is a matter of what she is doing.
 *
 * Forming up and on passage she is at cruising height. Once she is in to
 * attack she goes to the height her weapon is delivered from: a torpedo
 * bomber comes right down to the water, a dive bomber goes up and over the
 * top to push down on her target. Coming home she lets down onto her deck.
 */
function wantedHeight(state, p, carrier, inCompany) {
  // In company she flies her leader's height. That is what keeping station
  // means, and without it the flights drift apart in the vertical and then in
  // the horizontal too, because height is speed: one climbing while another is
  // levelling off is one slower than the other.
  if (inCompany && p.lead && p.lead !== p.id) {
    const lead = state.planes.find((q) => q.id === p.lead && !q.dead);
    if (lead) return lead.y || CRUISE_ALT;
  }
  // Forming up: everybody at the rendezvous height, so nobody is climbing
  // while she is trying to close.
  if (p.phase === 'formup') return FORM_ALT;
  if (p.phase === 'return') {
    if (!carrier) return CRUISE_ALT;
    const d = dist(p.x, p.z, carrier.x, carrier.z);
    // Down the glide over the last two miles. It is a long let-down because
    // she is coming down from cruising height with a bomber's rate of descent,
    // and a squadron that arrives over her ship still at altitude has to circle
    // to get rid of it.
    if (d > 3400) return CRUISE_ALT;
    return 30 + (CRUISE_ALT - 30) * Math.min(1, (d - 300) / 3100);
  }
  if (p.phase !== 'outbound') return CRUISE_ALT;
  // A fighter goes to whatever height the thing she is after is at.
  if (p.targetAir) {
    const foe = state.planes.find((q) => q.id === p.targetAir && !q.dead);
    if (foe) return Math.max(60, foe.y || CRUISE_ALT);
  }
  const mark = state.ships.find((q) => q.id === p.targetId && q.alive);
  if (!mark) return CRUISE_ALT;
  const d = dist(p.x, p.z, mark.x, mark.z);
  const from = RUN_IN_FROM[p.role] ?? 3600;
  if (d > from) return CRUISE_ALT;
  // The dive, which is its own shape and not an eased approach to a height.
  if (p.role === 'dive') {
    if (d > DIVE_PUSH) {
      // Still climbing to the perch: she wants to be over the top of her
      // target with height in hand, not arriving at it level.
      const k = clamp((d - DIVE_PUSH) / Math.max(1, from - DIVE_PUSH), 0, 1);
      return DIVE_PERCH + (CRUISE_ALT - DIVE_PERCH) * k;
    }
    // Over the top and down. She pushes over from the height she actually
    // reached, which is not always the perch: a strike is still climbing out
    // when the target is only a few miles away, and a dive flown down to a
    // line she never got up to is a climb followed by a dive. Whatever she has
    // when she arrives on top of her target is what she gives up.
    if (p.perch === undefined) p.perch = Math.max(DIVE_DROP + 260, p.y);
    // Straight in the ground range, which is what makes it a constant angle
    // all the way to the release.
    const k = clamp((d - DIVE_AT) / (DIVE_PUSH - DIVE_AT), 0, 1);
    return DIVE_DROP + (p.perch - DIVE_DROP) * k;
  }
  const at = RUN_IN_ALT[p.role] ?? 260;
  const by = RUN_IN_BY[p.role] ?? 700;
  // Eased into over the run-in, so she is at her attack height before she gets
  // there rather than diving for it at the last moment.
  const k = clamp((d - by) / Math.max(1, from - by), 0, 1);
  return at + (CRUISE_ALT - at) * k;
}

/**
 * How much of a battery's fire is telling, at a given fraction of its range.
 *
 * Anti-aircraft fire is not one weapon with one reach. The heavy dual-purpose
 * guns throw a shell eleven thousand yards and burst it on a time fuse, and
 * out at the edge of that they hardly ever hit anything: what they do is break
 * up a formation and make it fly badly. What kills aeroplanes is the automatic
 * guns inside three thousand yards, and the twenty-millimetre inside one.
 *
 * So the reach is the heavy battery's and the killing is the light one's, and
 * a strike is meant to get through and lose part of itself doing it. It used
 * to fall off from full effect to sixty per cent across the whole envelope,
 * which put a strike under something very near point-blank fire from the
 * moment it was sighted -- and the arithmetic of that is that no strike ever
 * arrived. Every squadron the Enterprise flew off was shot into the sea three
 * thousand metres short of the ship it was sent to attack, every time, and
 * nobody ever saw a bomb dropped.
 */
function aaBite(d, range) {
  const u = clamp(d / range, 0, 1);
  return 0.10 + 0.90 * Math.pow(1 - u, 2.2);
}

/** How big a hull is, for the purpose of deciding who goes after her. */
function bulk(s) { return getClass(s.classId).hull.length; }

/**
 * What a flight is looking for, which depends entirely on what it is.
 *
 * A fighter's business is the other side's aircraft; with the air clear she
 * goes down on whatever is small enough for a few fifties to hurt -- a
 * destroyer's bridge and her open mounts, not a battleship's belt.
 *
 * A dive bomber will take anything she is pointed at, so she takes the nearest
 * thing worth a bomb.
 *
 * A torpedo bomber is carrying one fish and will get one run at it, and a fish
 * is wasted on a destroyer: she goes for the biggest hull afloat.
 */
export function pickAirTarget(state, p) {
  const REACH = 9000;
  if (p.role === 'fighter') {
    let air = null;
    let airD = 5200;
    for (const q of state.planes) {
      if (q.team === p.team || q.id === p.id) continue;
      const d = dist(p.x, p.z, q.x, q.z);
      if (d < airD) { air = q; airD = d; }
    }
    if (air) return { air };
  }
  let best = null;
  let score = Infinity;
  for (const s2 of state.ships) {
    if (!s2.alive || s2.team === p.team) continue;
    const d = dist(p.x, p.z, s2.x, s2.z);
    if (d > REACH) continue;
    let v;
    if (p.role === 'fighter') v = bulk(s2) * 2.2 + d * 0.02;          // the smallest
    else if (p.role === 'torpedo') v = -bulk(s2) * 6 + d * 0.02;      // the biggest
    else v = d * 0.02;                                               // the nearest
    if (v < score) { best = s2; score = v; }
  }
  return best ? { ship: best } : null;
}

function stepPlanes(state, dt) {
  const out = [];
  for (const p of state.planes) {
    // Already shot down this tick by another flight, or already home. She is
    // kept in the array until the tick ends so whatever killed her can still
    // find her, and she is dropped here rather than counted again.
    if (p.dead) continue;
    const carrier = state.ships.find((s) => s.id === p.owner);
    const cls = carrier ? getClass(carrier.classId) : null;
    const P = cls && cls.planes ? cls.planes : null;
    if (!P) continue;
    p.life += dt;

    // Anti-aircraft fire from every enemy that can bear chews the squadron
    // down. Only the barrels that can actually train onto her do anything:
    // coming in fine on the bow of a ship whose after battery is masked is a
    // different proposition from crossing her beam.
    for (const s of state.ships) {
      if (!s.alive || s.team === p.team) continue;
      const scls = getClass(s.classId);
      if (!scls.aa) continue;
      const d = dist(p.x, p.z, s.x, s.z);
      if (d >= scls.aa.range) continue;
      const bear = aaBearing(scls, s, p.x, p.z, p.y);
      if (bear.barrels === 0) continue;
      hurtFlight(state, p, scls.aa.dps * bear.share * dt * aaBite(d, scls.aa.range));
      // And the tracer that goes with it. One burst at a time per ship, on the
      // gun's own rhythm rather than every tick, or the wire carries a
      // thousand rounds a second nobody could see anyway.
      s.aaFire -= dt;
      if (s.aaFire <= 0) {
        s.aaFire = 0.22 + 0.5 / Math.max(1, bear.barrels / 8);
        state.events.push({
          e: 'aa', ship: s.id, x: r(s.x), z: r(s.z),
          tx: r(p.x), tz: r(p.z), n: bear.barrels,
          // What is doing the shooting at this range: the heavy dual-purpose
          // mountings out here, the automatic guns close in.
          cal: d > 2600 ? 127 : d > 1500 ? 40 : 20,
        });
      }
    }
    // What the last second did to her: fires burning through, tanks running
    // out, and the machines that can no longer keep station falling out of the
    // formation. It is here rather than inside the guns because most of what
    // brings an aeroplane down happens after the burst that did it.
    stepFlightDamage(state, p, dt);
    if (p.dead || p.hp <= 0) {
      if (!p.dead) killFlight(state, p, 'flak');
      continue;
    }

    // Where she is trying to be while the strike is forming up over the ship,
    // and while it is going out in company afterwards. Null once she has
    // broken away to make her own attack.
    const station = formationGoal(state, p, carrier);
    // The leader decides when the strike goes.
    if (p.phase === 'formup' && (!p.lead || p.lead === p.id)
      && strikeFormed(state, p, carrier)) {
      releaseStrike(state, p.owner, p.sqId);
    }

    // Every couple of seconds she looks again for the thing she is actually
    // after, which is not the same thing for every flight in the strike.
    p.hunt -= dt;
    if (p.phase === 'outbound' && p.hunt <= 0) {
      p.hunt = 2;
      const want = pickAirTarget(state, p);
      if (want && want.air) {
        p.targetAir = want.air.id; p.targetId = 0;
        p.tx = want.air.x; p.tz = want.air.z;
      } else if (want && want.ship) {
        p.targetId = want.ship.id; p.targetAir = 0;
        p.tx = want.ship.x; p.tz = want.ship.z;
      }
    }
    // And she follows it: a ship under way is not where she was two seconds ago.
    if (p.phase === 'outbound') {
      const mark = p.targetAir
        ? state.planes.find((q) => q.id === p.targetAir)
        : state.ships.find((q) => q.id === p.targetId && q.alive);
      if (mark) { p.tx = mark.x; p.tz = mark.z; }
      else if (p.targetAir || p.targetId) { p.targetAir = 0; p.targetId = 0; p.hunt = 0; }
    }

    // Where she goes, unless there is somebody in her. A flight under a pilot
    // is flown by the client that took her and steered by nobody here; if the
    // word from that client stops coming she is picked up again on the next
    // tick and carries on to wherever she was sent.
    if (p.flown && state.t - (p.flownAt ?? 0) > 1.5) p.flown = false;
    if (!p.flown) {
      let goalX = p.tx, goalZ = p.tz;
      if (p.phase === 'return' && carrier) { goalX = carrier.x; goalZ = carrier.z; }
      // In company: she flies her station on the leader rather than at the
      // target, and only breaks off when the strike is close enough to attack.
      else if (station) { goalX = station.x; goalZ = station.z; }
      const want = headingTo(p.x, p.z, goalX, goalZ);
      // She rolls into a turn and out of it.
      //
      // A flight used to change course at 1.1 radians a second, which is sixty
      // degrees -- that is a marker being dragged round a chart, not an
      // aeroplane, and on screen it read as a formation snapping from one
      // heading to another and back. What she can really do is a sustained
      // rate that depends on what she is, and she has to bank to get it and
      // roll level to come out: the rate itself is what is rate-limited, so
      // there are no corners anywhere in her track.
      // As fast as her worst aeroplane can be hauled round. A formation turns
      // at the rate of the machine with the shot-up wing, because otherwise it
      // is not a formation.
      const wear = p.wear || { speed: 1, turn: 1, aim: 1 };
      const rate = (TURN_RATE[p.role] ?? 0.22) * wear.turn;
      const asked = clamp(angleDelta(p.heading, want) * 1.5, -rate, rate);
      const was = p.turn ?? 0;
      p.turn = was + clamp(asked - was, -ROLL_RATE * dt, ROLL_RATE * dt);
      p.heading = wrapAngle(p.heading + p.turn * dt);
      // Joining up is done on the throttle. A flight astern of her station
      // cannot ever catch her leader at the same cruise, so she opens up a
      // little to close and comes back to cruise once she is on -- which is
      // the whole of formation flying and costs one multiplication.
      // And at the speed of her slowest. An engine shot about is an aeroplane
      // that cannot make her cruise, and a flight that waits for her.
      let speed = P.cruiseSpeed * wear.speed;
      if (station) {
        const off = dist(p.x, p.z, station.x, station.z);
        speed *= clamp(1 + (off - 120) / 900, 0.9, 1.22);
      }

      // The vertical, which she has weight in.
      //
      // She climbs at the rate her engine has power to spare for, and that
      // falls off as she gets up into thinner air. She dives at whatever the
      // airframe will stand. And she cannot change her vertical speed
      // instantly in either direction, because she has mass: the rate of
      // change is held to about a third of a gravity, which is what a pilot
      // would pull.
      const frame = AIRFRAME[p.role] || AIRFRAME.scout;
      const wantY = wantedHeight(state, p, carrier, !!station);
      // A formation climbs at the rate its slowest aeroplane can hold, because
      // otherwise it is not a formation. Left to their own rates the fighters
      // were at cruising height while the torpedo bombers were still two
      // hundred metres below and climbing -- and climbing costs speed, so the
      // strike went out strung further and further apart the higher it got.
      const best = (station ? Math.min(frame.climb, slowestClimb(state, p)) : frame.climb)
        * wear.speed;
      const rise = best * Math.max(0.15, 1 - p.y / frame.ceiling);
      // How hard she goes after the height she wants. A dive bomber pushing
      // over wants her nose down now, and she has the wing to do it with.
      const pull = G * (frame.g ?? 0.34) * dt;
      // A dive bomber holds the line she is diving down rather than easing
      // onto it: a lazy gain leaves her a couple of hundred metres above the
      // profile all the way in, which is a shallow glide and not a dive.
      const askVy = clamp((wantY - p.y) * (p.role === 'dive' ? 1.4 : 0.22),
        -frame.dive, rise);
      p.vy = (p.vy || 0) + clamp(askVy - (p.vy || 0), -pull, pull);
      p.y = Math.max(14, p.y + p.vy * dt);

      // And height is speed. Going down she gains it and going up she pays
      // for it, which is why a dive bomber is fast in the dive and a loaded
      // bomber climbing out is slow.
      //
      // Except in the dive itself. There the brakes hold her airspeed and the
      // ground speed is whatever is left over -- so the steeper she is, the
      // slower she crosses the ground. Without that she went down at the same
      // hundred and fifteen metres a second she cruised at and could not get
      // her nose past thirty degrees: a fast shallow glide, not a dive.
      if (p.role === 'dive' && p.vy < -12) {
        speed = Math.sqrt(Math.max(400, DIVE_SPEED * DIVE_SPEED - p.vy * p.vy));
      } else {
        speed *= 1 + clamp(-p.vy / 34, -0.16, 0.45);
      }

      // How fast she is crossing the ground. Kept on the flight because the
      // client draws her attitude off it: the angle her nose is at is the
      // angle of her own flight path, which is her rate of climb over this,
      // and there is no other way to know it from outside.
      p.speed = speed;
      p.x += Math.sin(p.heading) * speed * dt;
      p.z += Math.cos(p.heading) * speed * dt;
    } else {
      // Somebody is flying her: her bank is his, and the client that has her
      // draws it off his own stick rather than off this.
      p.turn = 0;
    }

    if (p.flown) { out.push(p); continue; }

    if (p.phase === 'outbound' && p.role === 'fighter') {
      // A fighter's attack: guns, in a turning fight or in a firing pass.
      const foe = p.targetAir ? state.planes.find((q) => q.id === p.targetAir) : null;
      if (foe && dist(p.x, p.z, foe.x, foe.z) < 420) {
        // Both flights are shooting; the one with more aircraft up and the
        // better position does more of it. She wears them down rather than
        // deciding it in one pass.
        const bite = P.fighterGuns ?? FIGHTER_GUNS;
        hurtFlight(state, foe, bite * p.count * dt, 'fighters');
        hurtFlight(state, p,
          (foe.role === 'fighter' ? bite * 0.85 : bite * 0.3) * foe.count * dt, 'fighters');
        gunsSeen(state, p, foe.x, foe.z, true);
        gunsSeen(state, foe, p.x, p.z, true);
        if (foe.hp <= 0) killFlight(state, foe, 'fighters');
        out.push(p);
        continue;
      }
      // Nothing left in the air to fight: down on the small stuff with guns.
      const mark = state.ships.find((q) => q.id === p.targetId && q.alive);
      if (mark && dist(p.x, p.z, mark.x, mark.z) < 260) {
        const owner = state.ships.find((q) => q.id === p.owner) || null;
        const strafe = (P.strafeDamage ?? 260) * p.count;
        damageShip(state, mark, owner, strafe, 'he', 'works');
        mark.sections.works.pens += 1;
        if (state.rng() < 0.3) startFire(state, mark);
        p.gunAt = -9;
        gunsSeen(state, p, mark.x, mark.z, false);
        p.phase = 'return';
      } else if (p.life > 260) {
        // Out of patrol endurance. It used to be a hundred and fifty seconds,
        // which was most of a sortie once a strike started spending a minute
        // forming up over the ship: the escort turned for home about the time
        // it found anything to fight.
        p.phase = 'return';
      }
      out.push(p);
      continue;
    }

    if (p.phase === 'outbound') {
      // The attack run.
      //
      // A strike does not fly at a ship and let go at whatever range it
      // happens to be. A torpedo bomber comes down to the water and runs in
      // straight and level until she is close enough that the fish cannot be
      // combed; a dive bomber comes over the top and drops steep. Both of them
      // hold their weapons until they are properly in -- which is what makes
      // them worth shooting at on the way, and what makes the flak worth
      // having.
      let best = null;
      let bestD = 2200;
      const want = state.ships.find((q) => q.id === p.targetId && q.alive);
      if (want) {
        const d = dist(p.x, p.z, want.x, want.z);
        if (d < bestD) { best = want; bestD = d; }
      }
      if (!best) {
        for (const s of state.ships) {
          if (!s.alive || s.team === p.team) continue;
          const d = dist(p.x, p.z, s.x, s.z);
          if (d < bestD) { best = s; bestD = d; }
        }
      }
      // How close each kind presses before it lets go.
      //
      // A torpedo has to be dropped near enough that the target cannot turn
      // away from it. A bomb has to be dropped from a dive, which means going
      // in over the top of her and letting go a few hundred metres out -- a
      // bomber releasing at twelve hundred and fifty metres from two hundred
      // up is not dive bombing, it is lobbing, and the only way a bomb gets
      // from there to the ship is by being thrown thirty degrees above the
      // horizontal. She presses home instead, and pays the flak for it.
      const RELEASE = p.torp > 0 ? 900 : 260;
      if (best && bestD < RELEASE) {
        deliverOrdnance(state, p, best, P);
        state.events.push({ e: 'airDrop', x: p.x, z: p.z, r: p.role });
        p.phase = 'return';
      } else if (best && bestD < 2200) {
        // In the run. She steers for the point she wants to drop from rather
        // than at the ship itself: a torpedo bomber wants to be off the beam,
        // where the target is longest, and a dive bomber wants to be over her.
        if (p.torp > 0) {
          const beam = best.heading + (angleDelta(headingTo(best.x, best.z, p.x, p.z),
            best.heading) > 0 ? Math.PI / 2 : -Math.PI / 2);
          p.tx = best.x + Math.sin(beam) * 1100;
          p.tz = best.z + Math.cos(beam) * 1100;
        } else {
          p.tx = best.x;
          p.tz = best.z;
        }
      } else if (dist(p.x, p.z, p.tx, p.tz) < 200 || p.life > 180) {
        p.phase = 'return';
      }
    } else if (p.phase === 'return' && carrier
      && dist(p.x, p.z, carrier.x, carrier.z) < 300) {
      // Home. Her squadron is struck below and rearmed by the sweep below.
      //
      // Only on the way home. A flight forming up over the ship is within
      // three hundred metres of her for most of a minute, and taking that for
      // a recovery struck the whole strike below the moment it left the deck.
      //
      // Unless there is no deck left to come home to, in which case she is
      // over her own ship with nowhere to put her wheels down and she goes in
      // the water alongside.
      if (flightDeckOut(carrier)) { killFlight(state, p, 'nodeck'); continue; }
      p.dead = true;
      continue;
    } else if (!carrier || p.life > 300) {
      // Out of fuel, or her ship is gone from under her.
      killFlight(state, p, 'fuel');
      continue;
    }
    out.push(p);
  }
  state.planes = out;
  sweepSquadrons(state);
}

/**
 * How much aeroplane a flight is worth.
 *
 * Fighters are harder to catch than a loaded bomber, and a strike with an
 * escort over it is harder still, because the escort is what keeps the enemy's
 * fighters off the machines carrying the weapons.
 *
 * Twice over, spread over her machines. A flight now dies one aeroplane
 * at a time rather than all at once when a shared bar empties, and a single
 * machine goes down when a part that matters is knocked out rather than when
 * the last of her hit points is gone -- so the same weight of flak takes the
 * same time to wipe out a formation only if each machine is given rather more
 * than her share of the old bar.
 */
function planeHp(cls, f, L) {
  return cls.planes.hp * (f.role === 'fighter' ? 1.35 : 1)
    * (1 + (f.role === 'fighter' ? 0 : L.escort * 0.18)) * 2.0;
}

/**
 * Damage into a flight, aeroplane by aeroplane.
 *
 * Fire is not shared out evenly over a formation. A gun lays on one machine
 * and stays on her until she goes down or the layer loses her, which is why a
 * flight comes out of the flak with three whole aeroplanes and one burning
 * rather than with four each a quarter shot away. So the damage goes into
 * whichever machine is being shot at, and it is the same machine from tick to
 * tick until she is finished with.
 *
 * This is where a flight stopped being a hit-point bar. It used to be one
 * number for the whole formation: flak took it down evenly, nothing about an
 * aeroplane was in it anywhere, and when it reached nothing every machine in
 * the flight vanished in the same instant.
 */
function hurtFlight(state, p, damage, why = 'flak') {
  if (!p.machines || !p.machines.length) { p.hp -= damage; return; }
  // What is shooting at her, so that when the last of her goes it is reported
  // as what actually did it rather than as flak by default.
  p.hurtBy = why;
  const live = p.machines.filter((a) => a.alive && !a.left);
  if (!live.length) return;
  let a = live.includes(p.aimed) ? p.aimed : null;
  if (!a) { a = live[Math.min(live.length - 1, Math.floor(state.rng() * live.length))]; }
  p.aimed = a;
  const hit = hitAirframe(a, damage, state.rng(), state.rng());
  if (hit.lit) {
    state.events.push({ e: 'planeFire', i: p.id, x: r(p.x), z: r(p.z), team: p.team });
  }
  if (hit.down) { losePlane(state, p, a, 'shot'); p.aimed = null; }
  // The last of her, here and now: whatever is shooting has to be able to see
  // that it killed her on the tick it did it.
  if (!p.machines.some((m) => m.alive && !m.left)) { p.hp = 0; killFlight(state, p, why); }
}

/**
 * One aeroplane out of a flight -- not the flight.
 *
 * She is reported on her own so that what a captain sees is one machine
 * falling out of a formation that flies on, which is what it looked like.
 * `why` is what did it: shot to pieces, burned, out of fuel, or crippled and
 * turned back -- and over the sea, hundreds of miles from a deck, crippled is
 * very rarely a machine that gets home.
 */
function losePlane(state, p, a, why) {
  if (a.gone) return;
  a.gone = true;
  a.alive = false;
  const slot = p.machines.indexOf(a);
  state.events.push({
    e: 'planeDown', i: p.id, team: p.team, x: r(p.x), z: r(p.z),
    slot, h: r(p.heading), y: r(p.y ?? 220), why,
  });
}

/**
 * A second in the life of a damaged flight.
 *
 * Fire burns through what is holding a machine up and a holed tank runs her
 * dry, and both take their time about it -- which is why very few aeroplanes
 * are actually shot to pieces in the air and a great many of them simply do
 * not come back.
 */
function stepFlightDamage(state, p, dt) {
  if (!p.machines || !p.machines.length) return;
  for (const a of p.machines) {
    if (!a.alive || a.left) continue;
    const end = stepAirframe(a, dt, state.rng());
    if (end) losePlane(state, p, a, end);
  }
  // A machine that cannot keep station drops out of the formation and turns
  // for home on her own. If she is the last of the flight there is no
  // formation to drop out of: the flight gives up the attack and limps home,
  // which is what a crippled aeroplane does rather than falling out of the
  // sky. She can still be shot at all the way.
  for (;;) {
    const live = p.machines.filter((a) => a.alive && !a.left);
    const bad = live.find((a) => airframeState(a).crippled);
    if (!bad) break;
    if (live.length > 1) { bad.left = true; losePlane(state, p, bad, 'crippled'); continue; }
    if (p.phase !== 'return') {
      p.phase = 'return';
      state.events.push({ e: 'planeCrippled', i: p.id, team: p.team, x: r(p.x), z: r(p.z) });
    }
    break;
  }
  const fs = flightState(p.machines);
  p.wear = fs;
  p.count = fs.count;
  // What is left of her, in the units the rest of the simulation counts in.
  let hp = 0;
  for (const a of p.machines) if (a.alive && !a.left) hp += airframeHp(a) * (p.perHp || 0);
  p.hp = hp;
  // She cannot drop what she has not got left to drop it with.
  if (p.torp) p.torp = Math.min(p.torp, fs.count);
  if (p.bomb) p.bomb = Math.min(p.bomb, fs.count);
  if (!fs.count) killFlight(state, p, p.hurtBy || 'flak');
}

/**
 * Take a flight out of the air, once and for all.
 *
 * Marked rather than spliced, because the loop that finds it is iterating the
 * same array a moment later: a flight shot down by another flight has to stay
 * findable until the tick ends, and it must not be counted twice while it is.
 */
function killFlight(state, p, why) {
  if (p.dead) return;
  p.dead = true;
  p.hp = -1;
  state.events.push({ e: 'planesLost', i: p.id, x: p.x, z: p.z, team: p.team, why });
}

/**
 * Bring home any squadron that is marked flying with nothing of it left in
 * the air.
 *
 * This used to be worked out per flight, at the moment each one left: "am I
 * the last of my squadron?" -- and the answer was read off an array that had
 * not been rebuilt yet, so a flight that had already gone still counted as
 * airborne. Two flights of the same squadron leaving on the same tick each saw
 * the other as still out, neither released the squadron, and the carrier could
 * never rearm it. Her aircraft simply never came back.
 *
 * A sweep cannot get that wrong. It asks the only question that matters --
 * is there anything of this squadron still in the air? -- against the array as
 * it now stands, every tick, and it self-heals if anything ever does slip
 * through.
 */
function sweepSquadrons(state) {
  for (const ship of state.ships) {
    if (!ship.squadrons.length) continue;
    const cls = getClass(ship.classId);
    if (!cls.planes) continue;
    for (const sq of ship.squadrons) {
      if (sq.state !== 'flying') continue;
      // Still on the deck run: ordered up, not yet off.
      if (ship.launching && ship.launching.sqId === sq.id) continue;
      if (state.planes.some((p) => p.owner === ship.id && p.sqId === sq.id)) continue;
      sq.state = 'deck';
      sq.cooldown = cls.planes.rearm;
    }
  }
}

/** Simple constant-bearing intercept used by aircraft and bots. */
export function leadPoint(fromX, fromZ, target, projSpeed) {
  const tvx = Math.sin(target.heading) * target.speed;
  const tvz = Math.cos(target.heading) * target.speed;
  let t = dist(fromX, fromZ, target.x, target.z) / Math.max(1, projSpeed);
  for (let i = 0; i < 3; i++) {
    const px = target.x + tvx * t, pz = target.z + tvz * t;
    t = dist(fromX, fromZ, px, pz) / Math.max(1, projSpeed);
  }
  return { x: target.x + tvx * t, z: target.z + tvz * t, t };
}

// ---------------------------------------------------------------------------
// Damage, fires, flooding, repair
// ---------------------------------------------------------------------------

/**
 * Something is alight in one of her compartments.
 *
 * A fire is not a counter on the ship any more: it is a thing burning in a
 * particular compartment, which grows, eats the structure round it, spreads
 * into the compartments next door, and is put out by the sea when the sea
 * gets there. `where` says which compartment; without one it is the
 * superstructure, which is where most fires start.
 */
function startFire(state, ship, where = 'works', strength = 0.35) {
  const c = ship.sections[where] || ship.sections.works;
  if (!c) return;
  const was = c.fire;
  c.fire = Math.min(1, c.fire + strength);
  ship.fires = burningCount(ship);
  if (was < 0.05) state.events.push({ e: 'fire', ship: ship.id, at: where });
}

/** How many of her compartments are alight. */
function burningCount(ship) {
  let n = 0;
  for (const s of SECTIONS) if (ship.sections[s.k].fire > 0.08) n++;
  return n;
}

/** How many of her compartments have water in them. */
function floodedCount(ship) {
  let n = 0;
  for (const s of SECTIONS) {
    if (s.from === null) continue;
    const c = ship.sections[s.k];
    if (c.wP + c.wS > 1) n++;
  }
  return n;
}

/**
 * Open her plating to the sea.
 *
 * `area` is how big the hole is in square metres and `side` is which side of
 * her it is on -- which is the whole of why she lies over afterwards. A shell
 * that goes in below the waterline makes a hole about its own calibre; a
 * torpedo makes one the size of a room.
 *
 * Above the waterline nothing comes in until she settles far enough for the
 * sea to reach it, which is what makes a ship that has been hit high up
 * suddenly start flooding an hour later.
 */
export function openHull(state, ship, where, area, side, depth) {
  const c = ship.sections[where];
  if (!c || area <= 0) return;
  const first = c.holeP + c.holeS < 0.01;
  if (side < 0) c.holeP += area; else c.holeS += area;
  // And which side of her the water in here is going to sit on. Remembered on
  // the compartment rather than worked out from which holes are still open --
  // a damage control party that shores the holes does not make the water that
  // is already inside her run back across to the other side, and taking the
  // side off the holes meant she snapped bolt upright the moment the repair
  // button was pressed.
  if (!c.side) c.side = side < 0 ? -1 : 1;
  // How far below her waterline the hole is, so the head of water over it can
  // be worked out. Holes above the waterline are recorded at a negative depth
  // and only start drawing when she has settled onto them.
  //
  // The deepest hole is the one that governs. The sea comes in where it has
  // the most weight of water behind it, and it does not care that there is
  // another hole in the same compartment up by the deck edge -- so a
  // compartment holed four metres down floods at four metres down, whatever
  // else has since been shot through it. Taking the shallowest instead meant a
  // ship torpedoed under water and then hit high up amidships stopped flooding
  // altogether, which is the wrong way round in every particular.
  c.holeY = Math.max(c.holeY ?? -99, depth);
  if (first) state.events.push({ e: 'flood', ship: ship.id, at: where });
  ship.flooding = floodedCount(ship);
}

/**
 * The sea coming in, going where it wants to go, and what it does to her.
 *
 * Water enters through a hole at a rate that depends on how deep the hole is:
 * a hole a metre down fills slowly, and the same hole with five metres of sea
 * over it fills fast. So as she settles, everything already open to the sea
 * starts flooding harder -- which is why a ship that is slowly going down
 * usually goes down suddenly at the end. That is all this is, and everything
 * else about how she sinks falls out of it.
 */
/**
 * How much of a compartment is in wing spaces, each side.
 *
 * This is what decides whether flooding puts a list on her. Water lies level:
 * pour it into one open box and its weight ends up on the centreline, however
 * it got in. What throws a ship over is the water trapped out at the side of
 * her -- the wing compartments, the bunkers, the spaces outboard of the
 * machinery -- because that water cannot get across to the other side.
 *
 * So a hole on the starboard side fills the starboard wing first, which heels
 * her; then the middle of the compartment, which does not; and the port wing
 * last, which brings her back upright. That is why a ship hit by one torpedo
 * lists and then slowly rights herself as the compartment presses full, and it
 * is why counter-flooding works.
 */
const WING = 0.16;

/** Where the water in a compartment ends up, port and starboard. */
function splitWater(total, vol, side) {
  if (total <= 0) return [0, 0];
  if (!side || vol <= 0) return [total / 2, total / 2];
  const wing = vol * WING;
  const near = Math.min(total, wing);
  let rest = total - near;
  const even = Math.min(rest, Math.max(0, vol - 2 * wing));
  rest -= even;
  const nearTot = near + even / 2;
  const farTot = even / 2 + rest;
  return side > 0 ? [farTot, nearTot] : [nearTot, farTot];
}

/**
 * The sea coming in, going where it wants to go, and what it does to her.
 *
 * Water enters through a hole at a rate that depends on how deep the hole is:
 * a hole a metre down fills slowly, and the same hole with five metres of sea
 * over it fills fast. So as she settles, everything already open to the sea
 * starts flooding harder -- which is why a ship that is slowly going down
 * usually goes down suddenly at the end. That is all this is, and everything
 * else about how she sinks falls out of it.
 */
function stepFlooding(state, ship, dt) {
  const cls = shipClass(ship);
  const b = buoyancy(ship);
  // What the damage control party has managed to do about it. Shoring is a
  // box built over the hole and a stack of timber behind it: it cuts the sea
  // down, it does not shut it out, and it works loose again as the sea keeps
  // at it. So it buys her time and nothing else. See useRepair.
  const shored = 1 - 0.72 * clamp(ship.shored || 0, 0, 1);
  let took = 0;
  for (const s of SECTIONS) {
    if (s.from === null) continue;
    const c = ship.sections[s.k];
    const vol = sectionVolume(cls, s.k);
    // What she is open to the sea by here. The holes she has actually had made
    // in her -- nothing floods a compartment that has not been holed -- worked
    // up by how much of the structure round them has gone. A hole in plating
    // that has been shot to pieces is not the neat orifice it was: the metal
    // between one hole and the next has gone with them, the frames behind have
    // gone, and what was three holes is one. So the compartment that has taken
    // the most damage is the one the sea gets into fastest, which is where the
    // water starts and where it stays worst.
    const wrecked = 1 - clamp(c.hp / c.max, 0, 1);
    const open = (c.holeP + c.holeS) * (1 + wrecked * 1.5) * shored;
    if (open > 0 && vol > 0) {
      // How much sea is standing over the hole now: what it was when it was
      // made, plus however much deeper she is sitting since.
      const head = (c.holeY ?? 1) + b.sink;
      c.inflow = 0;
      if (head > 0.05) {
        // Torricelli, with the usual coefficient for a ragged hole in
        // plating -- and choked by the wreckage and the machinery the water
        // has to get past, which is what makes a flooded compartment take a
        // minute rather than five seconds.
        const rate = 0.62 * open * Math.sqrt(2 * 9.81 * head) * 0.16;
        const full = c.water / vol;
        const q = Math.min(vol - c.water, rate * (1 - full * 0.7) * dt);
        if (q > 0) { c.water += q; took += q; c.inflow = q / dt; }
      }
    } else {
      c.inflow = 0;
    }
    // And it puts the fire out, which is the one good thing about it. The
    // water is in the bottom of the compartment, which is where the fire is,
    // so it starts knocking it down as soon as there is any depth of it --
    // and the more there is, the faster. Waiting for the compartment to be a
    // quarter full meant a fire went on burning in a flooded space, because
    // the water was draining onward through a wrecked bulkhead as fast as it
    // came in and the level never got there.
    if (c.fire > 0 && vol > 0) {
      const depth = Math.min(1, c.water / (vol * 0.12));
      if (depth > 0.02) c.fire = Math.max(0, c.fire - dt * 1.1 * depth);
    }
  }

  // Through a bulkhead that has been wrecked, into the compartment next door.
  // A sound bulkhead holds; one with its plating opened does not, which is why
  // a hit that opens two compartments to each other is so much worse than two
  // hits that do not.
  for (let i = 0; i < SECTIONS.length - 1; i++) {
    const a = SECTIONS[i];
    const bb = SECTIONS[i + 1];
    if (a.from === null || bb.from === null) continue;
    const ca = ship.sections[a.k];
    const cb = ship.sections[bb.k];
    const worst = Math.min(ca.hp / ca.max, cb.hp / cb.max);
    if (worst > 0.25) continue;
    const va = sectionVolume(cls, a.k);
    const vb = sectionVolume(cls, bb.k);
    if (!va || !vb) continue;
    const head = ca.water / va - cb.water / vb;
    if (Math.abs(head) < 0.02) continue;
    const gap = Math.max(0, 1 - worst * 4);
    const move = clamp(head * Math.min(va, vb) * 0.08 * gap * dt,
      -cb.water, ca.water);
    ca.water -= move;
    cb.water += move;
  }

  // The pumps, if they have been got going -- which takes a second call-away;
  // the first only gets the party to the bulkheads. They are slow. A ship's
  // pumping will beat a shell hole and it will not beat a torpedo, and that is
  // exactly the distinction it ought to be making. They take it out of
  // whichever compartment has most in it, which is where the suctions are led
  // first.
  if (ship.pumping > 0) {
    let left = pumpRate(cls) * dt;
    const wet = SECTIONS
      .filter((s) => s.from !== null && ship.sections[s.k].water > 0)
      .sort((a, q) => ship.sections[q.k].water - ship.sections[a.k].water);
    for (const s of wet) {
      if (left <= 0) break;
      const c = ship.sections[s.k];
      const q = Math.min(c.water, left);
      c.water -= q;
      left -= q;
      c.inflow = (c.inflow || 0) - q / dt;
    }
    ship.flooding = floodedCount(ship);
  }

  // Where it all ends up, port and starboard: derived from how much there is
  // and which side of her is open, never accumulated. Water does not remember
  // which hole it came through -- it lies level -- and treating the two sides
  // as separate buckets gave a destroyer the whole of a flooded compartment
  // standing on one side of her, which is a heeling moment no destroyer has
  // ever had.
  for (const s of SECTIONS) {
    if (s.from === null) continue;
    const c = ship.sections[s.k];
    const vol = sectionVolume(cls, s.k);
    // Which side of her the water is on. Remembered from when she was opened,
    // so shoring the hole does not send the water back across the ship; the
    // holes themselves are only the fallback, for water that got in some way
    // that did not go through openHull.
    const side = c.side
      || (c.holeS > c.holeP ? 1 : c.holeP > c.holeS ? -1 : 0);
    const [wp, ws] = splitWater(c.water, vol, side);
    c.wP = wp;
    c.wS = ws;
  }
  if (took > 0) ship.flooding = floodedCount(ship);

  // What the water does to her structure: a compartment full of sea is a
  // compartment that is not holding anything up.
  // Water works on her structure too -- bulkheads that were never meant to
  // hold this much give way -- but only slowly. What sinks a ship is the
  // buoyancy, not an accountancy of hit points: leave this high enough to
  // matter on its own and a battleship with one small hole in her forefoot
  // founders in nine minutes without ever settling an inch.
  if (took > 0) {
    damageShip(state, ship, null, cls.hp * 0.0004 * ship.flooding * dt, 'flood');
  }

  // And whether she is still floating. Not a hit-point total: she goes when
  // the sea comes in over her deck edge, which depends entirely on how much
  // water is inside her and where it is.
  const after = buoyancy(ship);
  ship.sink = after.sink;
  ship.heel = after.heel;
  ship.trim = after.trim;
  // Her back can go before she does. Once it has, there is no ship: two
  // halves, and neither of them floats for long.
  if (ship.alive && ship.broke == null) {
    const at = breakStation(ship);
    if (at != null) {
      ship.broke = at;
      state.events.push({ e: 'break', ship: ship.id, at: r(at), x: r(ship.x), z: r(ship.z) });
      founder(state, ship, 'broken');
      return;
    }
  }
  // Over on her beam ends, or the sea coming in over the deck edge. Either
  // way she has stopped being a ship.
  if (ship.alive && Math.abs(after.heel) > 1.25) founder(state, ship, 'capsize');
  else if (ship.alive && after.reserve <= 0) founder(state, ship, 'flooding');
}

/**
 * Fire in a ship: it grows where it is, eats what is round it, and gets into
 * the next compartment.
 */
function stepFires(state, ship, dt) {
  const cls = shipClass(ship);
  let any = false;
  const spread = [];
  for (let i = 0; i < SECTIONS.length; i++) {
    const k = SECTIONS[i].k;
    const c = ship.sections[k];
    if (c.fire <= 0) continue;
    any = true;
    // It grows until it has everything in the compartment that will burn, and
    // then it burns out. A compartment already wrecked has less left in it.
    // It goes on growing while there is anything left in the compartment to
    // burn, and dies back once there is not. There used to be a floor here --
    // anything under two per cent was called out -- and it quietly made fire
    // unable to spread at all: a fire that has just got through a bulkhead
    // starts very small indeed, and it was put out on the same tick it caught.
    // A fire takes minutes to develop, not seconds. At the rate this ran
    // first, anything alight at all was an inferno in three quarters of a
    // minute, and since a developed fire spreads, one shell burned a cruiser
    // out end to end inside two.
    const fuel = Math.max(0.15, c.hp / c.max);
    c.fire = clamp(c.fire + (0.012 * fuel - 0.005) * dt, 0, 1);
    damageShip(state, ship, null, cls.hp * 0.0012 * c.fire * dt, 'fire', k);
    // Into the compartments either side of it, through the bulkhead. A big
    // fire gets through faster than a small one -- but it is a steel bulkhead,
    // and it takes minutes, not seconds. Set too fast, one hit put the whole
    // ship alight inside a minute and a half and burned her out on her own.
    if (c.fire > 0.45) {
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= SECTIONS.length) continue;
        spread.push([SECTIONS[j].k, c.fire * 0.014 * dt, k]);
      }
      // And up into the superstructure, where the boats and the paint are.
      if (k !== 'works') spread.push(['works', c.fire * 0.007 * dt, k]);
    }
  }
  for (const [k, amt, from] of spread) {
    const n = ship.sections[k];
    const src = ship.sections[from];
    // A steel bulkhead holds a fire back. It gets through where the structure
    // has already been opened up -- a hole in the bulkhead, a wrecked
    // compartment, a door left open by the blast -- and not otherwise. Without
    // this every fire ran the length of the ship on its own, and one shell
    // burned a cruiser out end to end.
    if (Math.min(n.hp / n.max, src.hp / src.max) > 0.6) continue;
    // Not into a compartment that is already under water.
    const vol = sectionVolume(cls, k);
    if (vol && n.water > vol * 0.3) continue;
    if (n.fire < 0.9) startFire(state, ship, k, amt);
  }
  if (any) ship.fires = burningCount(ship);
}

/**
 * Has her back broken?
 *
 * A hull is a girder. Blow a compartment out of the middle of it, or flood one
 * end of it hard enough while the other end is still buoyant, and the girder
 * fails: she breaks at the bulkhead where the bending is worst, and the two
 * halves go down separately. It is what happened to a good many of them, and
 * it is not something to be scripted -- it either follows from the damage or
 * it does not.
 *
 * Returns the station she breaks at, in fractions of her half-length, or null.
 */
export function breakStation(ship) {
  if (ship.broke != null) return ship.broke;
  const cls = shipClass(ship);
  const b = buoyancy(ship);
  // Nothing breaks a hull that is not carrying a great deal of water. A ship
  // with a compartment shot out of her and no flooding is a damaged ship, not
  // a broken one, and she steams home.
  if (b.water < b.free * 0.35) return null;
  let worst = null;
  let worstLoad = 0;
  for (let i = 1; i < SECTIONS.length - 1; i++) {
    const s = SECTIONS[i];
    if (s.from === null) continue;
    const c = ship.sections[s.k];
    // The girder has to be actually cut, not merely damaged: the compartment
    // at the break is gone.
    if (c.hp > c.max * 0.02) continue;
    const mid = (s.from + s.to) / 2;
    // The bending moment: the water forward of this station against the water
    // abaft it. A ship flooded evenly settles; a ship flooded at one end
    // breaks, because the buoyant end is holding the flooded end up.
    let fwd = 0;
    let aft = 0;
    for (const q of SECTIONS) {
      if (q.from === null) continue;
      const w = ship.sections[q.k].wP + ship.sections[q.k].wS;
      if ((q.from + q.to) / 2 > mid) fwd += w; else aft += w;
    }
    const unbalance = Math.abs(fwd - aft) / Math.max(1, fwd + aft);
    const load = unbalance * 0.7 + (b.water / Math.max(1, b.free)) * 0.5;
    if (load > worstLoad) { worstLoad = load; worst = mid; }
  }
  return worstLoad > 0.95 ? worst : null;
}

/**
 * She has stopped floating.
 *
 * There is no separate "sunk" state to animate: what she does on the way down
 * is whatever her water and her wreckage make her do, and the clients read
 * that off her trim, her heel, and whether her back went.
 */
function founder(state, ship, kind) {
  ship.alive = false;
  ship.speed = 0;
  const at = breakStation(ship);
  if (at != null) ship.broke = at;
  state.events.push({
    e: 'sink', ship: ship.id, x: ship.x, z: ship.z, by: 0, kind,
    // How she is going: how far over, how far down by the head, and where her
    // back went if it went. The client puts her under on these and nothing
    // else, so two ships never go down the same way.
    heel: r(ship.heel), trim: r(ship.trim), broke: ship.broke ?? null,
  });
}

/**
 * How a ship is divided up for damage.
 *
 * She has no pool of hit points that runs down; she has compartments, and what
 * kills her is water where water should not be. Each section holds its own
 * share of what she can take, and where a shell goes in decides which one pays.
 * The two the fight turns on are her machinery, which is what she moves on, and
 * her steering aft.
 *
 * `from` and `to` are fractions of her half-length: +1 is the stem, -1 the
 * transom. The superstructure has no station -- it is everything above the
 * weather deck, wherever along her it is hit.
 */
/** The outcomes that actually put a hole in her and let the sea in. */
export const PENETRATING = new Set(['pen', 'citadel', 'he', 'torpedo', 'bomb']);

/**
 * The hits that leave a hole in her side.
 *
 * The same list with the overpenetration added, because a shell that went
 * clean through her without bursting did nothing to the ship and a great deal
 * to her plating: two holes, one each side, and if they are under water she is
 * flooding through both of them. It counts for nothing in her damage book and
 * everything to the sea.
 */
export const HOLING = new Set([...PENETRATING, 'overpen']);

export const SECTIONS = [
  { k: 'bow', name: 'Bow', from: 0.60, to: 1.01, share: 0.12 },
  { k: 'fwd', name: 'Forward magazine', from: 0.20, to: 0.60, share: 0.21 },
  { k: 'mid', name: 'Machinery', from: -0.20, to: 0.20, share: 0.27 },
  { k: 'aft', name: 'After magazine', from: -0.62, to: -0.20, share: 0.21 },
  { k: 'stern', name: 'Steering', from: -1.01, to: -0.62, share: 0.11 },
  { k: 'works', name: 'Superstructure', from: null, to: null, share: 0.08 },
];

/** Which section a hit at this station belongs to. */
export function sectionAt(rel, part) {
  if (part === 'superstructure') return 'works';
  for (const s of SECTIONS) {
    if (s.from !== null && rel >= s.from && rel < s.to) return s.k;
  }
  return rel > 0 ? 'bow' : 'stern';
}

/** A fresh set of compartments, all sound. */
export function freshSections(maxHp) {
  const out = {};
  for (const s of SECTIONS) {
    out[s.k] = {
      hp: maxHp * s.share, max: maxHp * s.share, pens: 0,
      // The sea's way in, and the sea once it is in.
      //
      // `holeP` and `holeS` are the open area in her plating below the
      // waterline on each side, in square metres. `wP` and `wS` are the water
      // that has come through them, in cubic metres. Kept per side because
      // that is the whole of why a ship lies over: the weight of the water is
      // out to one side of her centreline and it stays there.
      holeP: 0, holeS: 0, water: 0, wP: 0, wS: 0,
      // Which side of her this compartment was opened on. Once the sea is in,
      // it is on that side of her and it stays there: it does not run back
      // across the ship because the hole it came through has been shored up.
      side: 0,
      // How hard this compartment is burning, 0 to 1. Fire is a thing that
      // lives in a compartment, spreads to the ones next to it, and is put out
      // by the water coming in -- rather than a number of fires on a ship.
      fire: 0,
      // What the sea is doing here this second, in cubic metres: positive
      // coming in through her plating, negative going out through her pumps.
      // Not state -- it is worked out from the holes and the head every tick
      // -- but a damage control officer wants to see where the water is
      // running as much as where it has got to, so it is kept and sent.
      inflow: 0,
    };
  }
  return out;
}

/**
 * How much water each compartment will hold, in cubic metres.
 *
 * Her underwater volume shared out by the same fractions the damage is, which
 * is close enough: what matters is that a battleship's machinery space holds a
 * great deal more water than a destroyer's, and that the ends hold less than
 * the middle.
 */
export function sectionVolume(cls, k) {
  const s = SECTIONS.find((q) => q.k === k);
  if (!s || s.from === null) return 0;
  const box = cls.hull.length * cls.hull.beam * cls.hull.draft * 0.62;
  return box * s.share;
}

/**
 * What her pumps can take out of her, in cubic metres a second.
 *
 * A warship's salvage pumping is not a great deal beside the sea. A few cubic
 * metres a second in a big ship and less than half of that in a destroyer --
 * enough to hold a shell hole, nothing like enough to hold a torpedo. That is
 * the whole reason a torpedo sinks ships and a shell usually does not, so it
 * is the one number this wants to get right.
 */
export function pumpRate(cls) {
  return 0.4 + cls.hull.length * 0.012;
}

/**
 * How much of her stands out of the water when she is whole, in metres.
 *
 * Not in the class data, and it is wanted in three places, so it is worked out
 * from her draft the way a warship's freeboard really runs: roughly her own
 * draft again above the water, proportionally less in a big ship because she
 * is so much deeper.
 */
export function freeboardOf(cls) {
  return Math.max(2.6, cls.hull.draft * (cls.hull.draft > 9 ? 0.95 : 1.15));
}

/** Every cubic metre of water she has taken, and how it is spread. */
export function floodWater(ship) {
  let total = 0;
  let port = 0;
  let stbd = 0;
  let moment = 0;
  for (const s of SECTIONS) {
    if (s.from === null) continue;
    const c = ship.sections[s.k];
    const w = c.wP + c.wS;
    total += w;
    port += c.wP;
    stbd += c.wS;
    // Where along her it is, for the trim: positive is forward.
    moment += w * ((s.from + s.to) / 2);
  }
  return { total, port, stbd, moment };
}

/**
 * How she is floating: how much deeper, how far over, and how far down by the
 * head or the stern.
 *
 * She has a certain volume of buoyancy in reserve above the waterline, and
 * every cubic metre of sea that gets inside her uses some of it up. When it is
 * gone she is not floating any more. The heel is the water's weight out to one
 * side against the righting moment her beam gives her; the trim is the same
 * sum along her length. Nothing here is a canned animation -- put the water in
 * a different place and she goes down differently.
 */
export function buoyancy(ship) {
  const cls = shipClass(ship);
  const h = cls.hull;
  const w = floodWater(ship);
  const fb = freeboardOf(cls);
  // What she weighs, near enough: her block coefficient is about a half in a
  // destroyer and a little more in anything fatter, and a cubic metre of sea
  // is a tonne.
  const disp = h.length * h.beam * h.draft * 0.55;
  // How much deeper the water aboard has put her: tonnes over the area of her
  // waterplane.
  const sink = w.total / Math.max(1, h.length * h.beam * 0.72);

  // Her metacentric height -- how stiff she is. A warship of this size carries
  // a metre or two of it, and every compartment with water slopping about in
  // it takes some away, because water that can move is weight that moves to
  // the low side as she rolls. That is free surface, and it is what actually
  // capsizes ships: they go over long before they are full.
  const gm0 = Math.max(0.8, h.beam * 0.075);
  let freeSurface = 0;
  for (const s of SECTIONS) {
    if (s.from === null) continue;
    const c = ship.sections[s.k];
    const vol = sectionVolume(cls, s.k);
    if (!vol) continue;
    const f = (c.wP + c.wS) / vol;
    // The loss of metacentric height from a free surface is the second moment
    // of that surface over the volume she displaces -- length times breadth
    // cubed over twelve, and the cube is why subdivision matters so much. A
    // compartment split down the centreline has a quarter the free-surface
    // effect of an open one, which is the entire reason warships are built
    // that way; taking the full beam here capsized a destroyer the moment one
    // compartment was half full.
    const len = h.length * s.share;
    const bEff = h.beam * 0.62;
    const i = (len * bEff * bEff * bEff) / 12;
    // Worst when a compartment is part full; none at all when it is empty or
    // pressed right up, which is why counter-flooding a ship works.
    freeSurface += 4 * f * (1 - f) * (i / Math.max(1, disp));
  }
  const gm = gm0 - freeSurface;

  // How far over she lies: the water's weight out to one side against what is
  // left of her stability. sin(heel) = moment / (displacement x GM).
  const off = w.stbd - w.port;
  const arm = h.beam * 0.26;
  let heel = Math.asin(clamp(
    (off * arm) / Math.max(1, disp * Math.max(0.10, gm)), -0.999, 0.999));
  // And the loll.
  //
  // A ship whose metacentric height has gone is not upright and she is not on
  // her beam ends either: she lolls, and finds a new place to sit at some
  // angle off the vertical. The worse her stability, the further over that is,
  // and past a point there is no coming back from it. It develops as the
  // free surface eats her stiffness rather than arriving all at once -- she
  // used to snap to eighty degrees the instant GM crossed zero, which is a
  // switch, not a ship.
  if (gm < 0.15) {
    const loll = Math.min(1.45, (0.15 - gm) * 2.2);
    heel = Math.sign(heel || off || 1) * Math.min(1.5, Math.abs(heel) + loll);
  }

  // And how far down by the head or the stern: the same sum taken along her,
  // against her longitudinal stability, which is enormous by comparison --
  // which is why a ship heels many degrees and trims few.
  const gml = h.length * 1.1;
  const trim = Math.asin(clamp(
    (w.moment * h.length * 0.5) / Math.max(1, disp * gml), -0.999, 0.999));

  // When the sea comes over the deck edge she is finished, and that is a
  // matter of how she is lying as much as how much water is in her: a ship
  // heeled thirty degrees puts her gunwale under with half the water an
  // upright one needs. This is why the way she is hit decides how long she
  // lasts, and it is the whole of the sinking condition.
  const edge = sink + Math.abs(Math.sin(heel)) * h.beam * 0.5
    + Math.abs(Math.sin(trim)) * h.length * 0.5;
  return {
    water: w.total, sink, heel, trim, gm, edge, freeboard: fb,
    reserve: Math.max(0, 1 - edge / fb),
    free: h.length * h.beam * fb * 0.55,
  };
}


/** What is left of her, added up out of her compartments. */
export function hullIntegrity(ship) {
  let hp = 0;
  for (const s of SECTIONS) hp += ship.sections[s.k].hp;
  return hp;
}

export function damageShip(state, ship, source, amount, kind, where = null) {
  if (!ship.alive || amount <= 0) return;
  const before = ship.hp;
  // Into the compartment that took it. Fire, flooding, ramming and the ground
  // are not a hit in one place, so they are shared out over what is left of
  // her -- a fire eats the ship, not a frame of it.
  const hit = where && ship.sections[where] ? [where] : SECTIONS.map((s) => s.k);
  if (hit.length === 1) {
    const sec = ship.sections[hit[0]];
    const took = Math.min(sec.hp, amount);
    sec.hp -= took;
    // Anything the compartment could not absorb goes into the rest of her:
    // a shell through a wrecked bow still opens frames behind it.
    let rest = amount - took;
    if (rest > 0) spread(ship, rest);
  } else {
    spread(ship, amount);
  }
  ship.hp = hullIntegrity(ship);
  if (source && source.id !== ship.id) source.damageDealt += Math.min(amount, before);

  // Nothing is broken here. Her machinery stops when something gets into her
  // machinery space and wrecks it, and her steering jams when something gets
  // into the steering gear -- see wreckContents, which is called from the hit
  // that did it and from nowhere else. A compartment's hit points reaching
  // zero used to stop her engines on its own, which meant a ship burned out
  // amidships by fires she never took a shell in came to a stand, and meant
  // every ship in the game broke down at exactly the same point in her life.
  if (ship.hp <= 0) {
    ship.hp = 0;
    ship.alive = false;
    ship.speed = 0;
    if (source && source.team !== ship.team) source.kills++;
    state.events.push({ e: 'sink', ship: ship.id, x: ship.x, z: ship.z, by: source ? source.id : 0, kind });
  }
}

/** Share damage over whatever is still holding, worst-first being wrong here. */
function spread(ship, amount) {
  let left = amount;
  for (let pass = 0; pass < 3 && left > 1e-6; pass++) {
    const live = SECTIONS.map((s) => ship.sections[s.k]).filter((c) => c.hp > 0);
    if (!live.length) break;
    const total = live.reduce((a, c) => a + c.hp, 0);
    const chunk = left;
    left = 0;
    for (const c of live) {
      const want = chunk * (c.hp / total);
      const took = Math.min(c.hp, want);
      c.hp -= took;
      left += want - took;
    }
  }
}

/**
 * Call away the damage control party.
 *
 * A ship's damage control is not a button that undoes what has happened to
 * her, and it is emphatically not a pump that runs the moment somebody asks
 * for one. It goes in two stages, because that is the order the work is
 * actually done in.
 *
 * The first call-away gets the party to it: the fires are fought, the
 * bulkheads are shored, and a box is built over what can be reached of the
 * holes. That slows the sea down. It does not stop it -- shoring works loose,
 * and the sea keeps at it -- so the first call-away buys her time and nothing
 * more. Nothing is pumped: every cubic metre already inside her stays inside
 * her, and so does the list it has put on her.
 *
 * The second gets the pumps going, and from then on they run. They are slow.
 * They will hold a compartment holed by a shell and they will not come near
 * holding one opened by a torpedo, which is exactly the distinction that ought
 * to decide whether she lives.
 */
/** Damage control putting her structure back, into what is worst hurt first. */
function mend(ship, amount) {
  let left = amount;
  for (let pass = 0; pass < 3 && left > 1e-6; pass++) {
    const hurt = SECTIONS.map((s) => ship.sections[s.k]).filter((c) => c.hp < c.max);
    if (!hurt.length) break;
    const total = hurt.reduce((a, c) => a + (c.max - c.hp), 0);
    const chunk = left;
    left = 0;
    for (const c of hurt) {
      const want = chunk * ((c.max - c.hp) / total);
      const put = Math.min(c.max - c.hp, want);
      c.hp += put;
      left += want - put;
    }
  }
}

export function useRepair(state, ship) {
  if (!ship.alive || ship.repairCd > 0) return false;
  const cls = shipClass(ship);
  ship.repairCd = cls.repairCooldown;
  ship.repairActive = 12;
  ship.dcStage = (ship.dcStage || 0) + 1;
  // Fresh shoring on everything that is open. Full effect now; it works loose
  // from here -- see stepDamageOverTime.
  ship.shored = 1;
  for (const sec of SECTIONS) ship.sections[sec.k].fire = 0;
  ship.fires = 0;
  if (ship.dcStage >= 2) ship.pumping = 1;
  ship.sink = buoyancy(ship).sink;
  ship.flooding = floodedCount(ship);
  ship.engineDamage = 0; ship.steeringDamage = 0;
  state.events.push({ e: 'repair', ship: ship.id, stage: ship.dcStage });
  return true;
}

export function useSmoke(state, ship) {
  if (!ship.alive || ship.smoke <= 0 || ship.smokeActive > 0) return false;
  ship.smoke--;
  ship.smokeActive = 22;
  state.events.push({ e: 'smoke', ship: ship.id, x: ship.x, z: ship.z });
  return true;
}

function stepDamageOverTime(state, ship, dt) {
  const cls = shipClass(ship);
  stepFires(state, ship, dt);
  stepFlooding(state, ship, dt);
  if (ship.repairActive > 0) {
    ship.repairActive -= dt;
    // Into her compartments, where the damage actually is: plating over what
    // can be got at, propping the bulkheads, shoring the deck. Putting it on
    // her hit point total alone mended nothing whatever -- the total is added
    // up out of her compartments, so the next shell to hit her recomputed it
    // and the whole of the party's work went with it.
    mend(ship, ship.maxHp * (cls.repairHeal / 12) * dt);
    ship.hp = Math.min(ship.maxHp, hullIntegrity(ship));
  }
  if (ship.repairCd > 0) ship.repairCd -= dt;
  // The shoring working loose. A minute and a quarter and the sea is coming in
  // through it as fast as it ever was, which is why damage control delays
  // flooding and does not cure it.
  if (ship.shored > 0) ship.shored = Math.max(0, ship.shored - dt / 75);
  if (ship.smokeActive > 0) ship.smokeActive -= dt;
  if (ship.engineDamage > 0) ship.engineDamage -= dt;
  if (ship.steeringDamage > 0) ship.steeringDamage -= dt;
  for (const m of ship.torpMounts) if (m.cooldown > 0) m.cooldown -= dt;
  for (const s of ship.squadrons) if (s.cooldown > 0) s.cooldown -= dt;
  if (ship.deckBusy > 0) ship.deckBusy -= dt;
  if (ship.launching) stepLaunch(state, ship, dt);
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function stepDetection(state) {
  for (const s of state.ships) s.spottedBy = [false, false];
  for (const target of state.ships) {
    if (!target.alive) continue;
    const tc = getClass(target.classId);
    let conceal = tc.concealment;
    if (state.t - target.lastFiredAt < 12) conceal += tc.fireDetectPenalty;
    // Weather shortens the range a lookout can pick her up at. Radar below is
    // left alone, which is the whole point of radar: in a rain squall a set is
    // worth more than every pair of eyes on the ship.
    conceal *= getWeather(state.world?.weather).sight;
    if (target.smokeActive > 0) conceal *= 0.22;
    if (target.fires > 0) conceal *= 1.25;

    for (const observer of state.ships) {
      if (!observer.alive || observer.team === target.team) continue;
      const oc = getClass(observer.classId);
      const d = dist(observer.x, observer.z, target.x, target.z);
      const radar = d < oc.radarRange * 0.55 && target.smokeActive <= 0;
      if (d > conceal && !radar) continue;
      if (d > 900 && blockedByLand(state.world, observer.x, observer.z, target.x, target.z)) continue;
      target.spottedBy[observer.team] = true;
    }
  }
  // Aircraft spot for their own side.
  for (const p of state.planes) {
    for (const target of state.ships) {
      if (!target.alive || target.team === p.team) continue;
      if (dist(p.x, p.z, target.x, target.z) < 3200) target.spottedBy[p.team] = true;
    }
  }
}

export function torpedoVisible(state, tp, team) {
  if (tp.team === team) return true;
  for (const s of state.ships) {
    if (!s.alive || s.team !== team) continue;
    if (dist(s.x, s.z, tp.x, tp.z) < tp.detection) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// How a battle ends
// ---------------------------------------------------------------------------
//
// One way, and it is the only way: when one side has nothing left afloat.
//
// She used to be able to end on points -- a running score off three circles on
// the chart, with a clock counting down to whoever was ahead when it stopped.
// Which meant a battle could be won by steaming round an empty patch of sea
// while the enemy was still afloat and shooting, and lost with half a division
// in action because the clock ran out. It is a fleet action: it ends when one
// fleet is on the bottom.

function checkElimination(state) {
  const aliveByTeam = [0, 0];
  for (const s of state.ships) if (s.alive) aliveByTeam[s.team]++;
  if (aliveByTeam[0] === 0 && aliveByTeam[1] === 0) finish(state, -1, 'mutual');
  else if (aliveByTeam[0] === 0) finish(state, 1, 'elimination');
  else if (aliveByTeam[1] === 0) finish(state, 0, 'elimination');
}

function finish(state, winner, reason) {
  if (state.over) return;
  state.over = true;
  state.winner = winner;
  state.reason = reason;
  state.events.push({ e: 'over', winner, reason });
}

// ---------------------------------------------------------------------------
// Main step
// ---------------------------------------------------------------------------

export function step(state, dt = DT) {
  state.t += dt;
  state.tick++;
  for (const ship of state.ships) {
    if (!ship.alive) continue;
    stepMovement(state, ship, dt);
    stepTurrets(state, ship, dt);
    stepTorpMounts(state, ship, dt);
    stepSecondary(state, ship, dt);
    stepDamageOverTime(state, ship, dt);
  }
  stepCollisions(state, dt);
  stepBatteries(state, dt);
  stepShells(state, dt);
  stepTorpedoes(state, dt);
  stepPlanes(state, dt);
  if (state.tick % 3 === 0) stepDetection(state);
  if (!state.over) checkElimination(state);
  const ev = state.events;
  state.events = [];
  return ev;
}

/** Client-side prediction: advance only the local hull, no weapons or damage. */
export function predictShip(state, ship, dt) {
  if (!ship.alive) return;
  stepMovement(state, ship, dt);
  stepTurrets(state, ship, dt);
}
