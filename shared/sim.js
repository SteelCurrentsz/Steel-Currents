// Authoritative battle simulation. The server owns an instance of this and
// broadcasts snapshots; the client runs the same code to predict its own hull
// between snapshots, so steering feels immediate without desyncing.

import {
  clamp, lerp, wrapAngle, angleDelta, approachAngle, approach, dist, dist2,
  headingTo, localToWorld, worldToLocal, pointInBox, makeRng, gauss, TAU,
} from './math.js';
import { getClass } from './ships.js';
import { BOMBERS } from './bombers.js';
import {
  freshAirframe, hitAirframe, stepAirframe, airframeState, flightState,
  airframeHp, PARTS as AIR_PARTS,
} from './airframe.js';
import {
  BATTERIES, batteryGun, batteryArc, batteryHp, batteryAa,
} from './batteries.js';
import {
  MAP_HALF, blockedByLand, islandAt, islandRadius, landAt, spawnPoint, getWeather,
  groundHeight, soilAt, addCrater, craterWire, landCeiling,
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
    // Rounds from aircraft guns, in flight. Small, short-lived and real:
    // see stepBullets.
    bullets: [],
    planes: [],
    // The heavy squadrons, which belong to nobody's deck.
    bombers: [],
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
    // How long she has been burning in four places at once. See stepFires.
    blaze: 0,
    // The mounting her captain has gone down to and is laying himself, and
    // where he is holding it. Everything else aboard goes on being fought by
    // her own fire control; this one gun answers a pair of hands. See manGun.
    manned: null,
    manX: 0, manZ: 0, manY: 0,
    // Seconds of trigger held since the last tick, which is how a gun that
    // fires as fast as its layer can work it is told about.
    manFire: 0,
    // Where the sea is in her, how far over she is lying, and how far down.
    // All three come out of the water in her compartments; see buoyancy.
    sink: 0, heel: 0, trim: 0,
    // A submarine, and only a submarine, has these.
    //
    // `depth` is metres of water over her, `depthCmd` where her captain has
    // ordered her to, and `oxygen` how many seconds of air are left in her
    // with the hatches shut. A surface ship carries them all at nought and
    // nothing ever touches them. See stepDive.
    depth: 0, depthCmd: 0, oxygen: cls.dive ? cls.dive.oxygen : 0,
    // The tubes, for the picture: how long the bow caps have been open. The
    // simulation does not need it -- a torpedo leaves the tube the moment the
    // order is obeyed -- but the boat on screen has doors that swing, and they
    // swing because the wire says a tube fired.
    tubeOpen: 0,
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
    // `hurt` is what state the mounting is in and it lasts: 0 sound, 1
    // damaged, 2 badly damaged, 3 gone. `disabled` is a countdown in seconds
    // -- knocked out for a moment by a near miss or a shock. The two are
    // different things and a gunnery officer needs both.
    turrets: cls.turrets.map((t) => ({
      id: t.id, angle: t.angle, elev: 0, cooldown: 0, disabled: 0, hurt: 0,
    })),
    torpMounts: cls.torpedoes ? cls.torpedoes.mounts.map((m) => ({ id: m.id, angle: m.angle, cooldown: 0 })) : [],
    // The secondary battery, mount by mount. It is not laid by her captain --
    // a secondary mounting is in local control, and the gun captain shoots at
    // whatever he can see and bear on -- so each one carries its own target,
    // its own training and its own loading.
    secMounts: cls.secondary
      ? cls.secondary.mounts.map((m, i) => ({
        id: i, angle: m.angle, elev: 0, cooldown: 0, disabled: 0, target: 0, hurt: 0,
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
  // Where her captain has ordered her to. Refused outright by anything that
  // cannot dive, so a stray key on a battleship does not sink her.
  if (typeof input.depth === 'number' && shipClass(ship).dive) {
    ship.depthCmd = clamp(input.depth, 0, shipClass(ship).dive.max);
  }
}

/** Whether she is under enough of the sea to matter. */
export function submerged(ship) { return ship.depth > 0.6; }

/**
 * Deep enough that everything on her casing is under water.
 *
 * The line is drawn at the top of the tower rather than at the waterline: a
 * boat trimmed down with her deck awash can still fight the gun on her
 * conning tower, and did. Once the tower is under, nothing outside the
 * pressure hull is any use to anybody.
 */
export function gunsDrowned(ship) {
  const cls = shipClass(ship);
  return !!cls.dive && ship.depth > 1.2;
}

/**
 * Diving, surfacing, and the air.
 *
 * She goes down at her flooding rate and comes up faster than that, because
 * blowing the tanks with compressed air is quicker than letting the sea into
 * them. Under, the air goes; on the surface it comes back, faster than it
 * went, because the diesels are running and the hatch is open.
 *
 * When it is gone she surfaces whether her captain likes it or not. That is
 * not a game rule invented to be kind -- it is what the boat does, because at
 * that point the alternative is the crew, and every commander who ever held a
 * boat down past that point came up anyway.
 */
function stepDive(state, ship, dt) {
  const cls = shipClass(ship);
  if (!cls.dive) return;
  const D = cls.dive;
  if (!ship.alive) { ship.depthCmd = 0; }
  // Out of air: the order to stay down is overruled.
  if (ship.oxygen <= 0) ship.depthCmd = 0;
  const rate = ship.depthCmd > ship.depth ? D.rate : D.blow;
  ship.depth = approach(ship.depth, ship.depthCmd, rate * dt);
  if (submerged(ship)) {
    ship.oxygen = Math.max(0, ship.oxygen - dt);
    // A boat that has run herself out of air is in real trouble even once she
    // is up: the men are done. She comes up slower than she went down.
    if (ship.oxygen <= 0) ship.depth = approach(ship.depth, 0, D.blow * 0.55 * dt);
  } else {
    ship.oxygen = Math.min(D.oxygen, ship.oxygen + (D.oxygen / D.recharge) * dt);
  }
  // A torpedo tube's outer door, once a fish has gone through it, takes a few
  // seconds to shut again.
  if (ship.tubeOpen > 0) ship.tubeOpen -= dt;
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

function stepMovement(state, ship, dt) {
  const cls = shipClass(ship);
  const engine = ship.engineDamage > 0 ? 0.45 : 1;
  // A submarine under water is on her motors and her battery, and a Type VII
  // makes eight knots on them against eighteen on the diesels. The diesels
  // cannot be run under -- they need air the boat has not got.
  const maxSpeed = submerged(ship) && cls.dive
    ? Math.min(cls.maxSpeed, cls.dive.speed) : cls.maxSpeed;
  // Rudder swings toward its commanded angle at the hull's rudder-shift rate.
  const shift = (ship.steeringDamage > 0 ? 2.4 : 1) * cls.rudderShift;
  ship.rudder = approach(ship.rudder, ship.rudderCmd, (2 / shift) * dt);

  const speedFrac = clamp(Math.abs(ship.speed) / maxSpeed, 0, 1);
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
  const ordered = THROTTLE_NOTCHES[ship.notch] * (ship.notch === 0 ? cls.reverseSpeed : maxSpeed) * engine;
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

// ---------------------------------------------------------------------------
// A gun somebody is laying by hand
// ---------------------------------------------------------------------------
//
// Every gun aboard is laid by her own fire control, which is what a gunnery
// officer and a director are for and what makes a ship a ship rather than a
// row of guns. But a captain may go down to any one mounting and lay it
// himself, and while he has it, that mounting takes his bearing and nobody
// else's.
//
// Three rules, and they are the difference between the batteries:
//
//   Her main battery, her secondaries and her tubes are laid AND fired by
//   hand. Nothing goes off until the trigger is pulled, because a heavy gun
//   fires a salvo and a salvo is a decision.
//
//   Her close-range battery is laid by hand and fires itself. A Bofors gunner
//   holds the trigger down and walks the tracer onto the aeroplane; there is
//   no moment at which he decides to fire, only the moment he stops.
//
//   Everything else on the ship carries on. Manning A turret does not stop B
//   turret shooting, and it does not stop her steering.

/** Which batteries a mounting can be taken from. */
const MANNED = new Set(['main', 'sec', 'aa', 'torp']);

/**
 * Her close-range mountings, flattened in the order everything else uses.
 *
 * `aaBattery` is a different list and always has been: it is what she can put
 * up against an aeroplane, so it starts with her dual-purpose turrets and
 * secondaries and only then gets to the light guns. That is right for working
 * out flak and wrong for naming one mounting, and the two were being used
 * interchangeably -- so a captain pressing the third Bofors on the hologram
 * was handed a five-inch mounting on the other side of the ship, and the
 * camera was put wherever that happened to be.
 *
 * This is the light battery alone, gun type by gun type and mounting by
 * mounting, which is exactly the order the arsenal lists them in and exactly
 * the order the model builds them in. One index, one mounting, everywhere.
 */
export function lightMounts(cls) {
  const out = [];
  for (const g of (cls.aa && cls.aa.guns) || []) {
    for (const m of g.mounts) out.push(m);
  }
  return out;
}

/**
 * Pull the trigger on the gun somebody is standing at.
 *
 * Her main battery, her secondaries and her tubes fire on this and on nothing
 * else while they are manned -- a heavy gun fires a salvo, and a salvo is a
 * decision. Her close-range battery is not here at all: it fires itself for as
 * long as it is laid, which is what an automatic gun does.
 *
 * Returns what went: barrels for a gun, fish for a bank of tubes.
 */
export function shootGun(state, ship) {
  if (!ship || !ship.alive || !ship.manned) return 0;
  const { k, i } = ship.manned;
  if (k === 'main') return fireGuns(state, ship, i);
  if (k === 'sec') return fireSecondary(state, ship, i);
  if (k === 'torp') return fireTorpedoes(state, ship, i);
  return 0;
}

/**
 * Take a mounting, or give it back.
 *
 * `k` is which battery and `i` which mounting of it; a null battery hands it
 * back to her own fire control, which picks it up on the next tick as if
 * nothing had happened.
 */
export function manGun(ship, msg) {
  if (!ship) return;
  const k = msg && msg.k;
  if (!k || !MANNED.has(k)) { ship.manned = null; ship.manFire = 0; return; }
  const cls = shipClass(ship);
  const list = k === 'main' ? ship.turrets
    : k === 'sec' ? ship.secMounts
      : k === 'torp' ? ship.torpMounts
        : lightMounts(cls);
  const i = Math.round(msg.i || 0);
  if (!list || i < 0 || i >= list.length) { ship.manned = null; return; }
  ship.manned = { k, i };
  ship.manFire = 0;
  // She starts laid where she is pointing, so taking a gun does not swing it.
  const at = mannedRest(ship, cls);
  ship.manX = at.x; ship.manZ = at.z; ship.manY = at.y;
}

/** Where a mounting just taken over is already pointing, in the world. */
function mannedRest(ship, cls) {
  const range = 6000;
  const b = ship.heading;
  return {
    x: ship.x + Math.sin(b) * range,
    z: ship.z + Math.cos(b) * range,
    y: 0,
  };
}

/**
 * Where the layer is holding his crosshair.
 *
 * A point in the world, because that is what a sight is: the gun is laid on a
 * place, not on a pair of angles, and the ship rolling under it does not move
 * the place. `y` is how high he is holding, which only a close-range mounting
 * has any use for.
 */
export function layGun(ship, msg) {
  if (!ship || !ship.manned) return;
  if (!Number.isFinite(msg.x) || !Number.isFinite(msg.z)) return;
  ship.manX = msg.x;
  ship.manZ = msg.z;
  ship.manY = Number.isFinite(msg.y) ? msg.y : 0;
}

/** Is this mounting the one being laid by hand? */
function isManned(ship, k, i) {
  return !!(ship.manned && ship.manned.k === k && ship.manned.i === i);
}

/**
 * The bearing a manned mounting wants, from where its layer is holding.
 *
 * Clamped into the mounting's own arc like any other: a pair of hands on the
 * training gear does not move the stops, and a gun laid past them is a gun
 * that cannot fire.
 */
function mannedDesired(ship, spec) {
  const world = headingTo(ship.x, ship.z, ship.manX, ship.manZ);
  const local = wrapAngle(world - ship.heading);
  const off = angleDelta(spec.angle, local);
  const limited = Math.abs(off) > spec.arc;
  return {
    angle: limited ? wrapAngle(spec.angle + Math.sign(off) * spec.arc) : local,
    blocked: limited,
  };
}

// ---------------------------------------------------------------------------
// What state a gun is in
// ---------------------------------------------------------------------------
//
// A mounting is not a switch. It is knocked about by splinters, its training
// gear jams, its hoists stop, its crew are killed and replaced -- and all of
// that is degrees rather than on and off. Four of them:
//
//   0  sound      -- fires as designed
//   1  damaged    -- two seconds more on the reload
//   2  bad        -- ten seconds between rounds; barely in action
//   3  disabled   -- finished, and it does not come back
//
// The first three mend themselves. Nobody has to be sent to a gun: the
// mounting's own crew clear it, and they get on with it while the ship fights.
// The fourth does not mend, because there is nothing left to mend.
//
// And a gun with the sea in its magazine is disabled whatever state the gun
// itself is in, for as long as the sea is there. There is nothing to fire.

/** How much of her magazine has to be under for the hoists to stop. */
const MAG_DROWNED = 0.5;

/** How fast a mounting's own crew put it right, in condition per second. */
const GUN_MEND = 1 / 70;

/**
 * Which of her compartments holds this mounting's magazine.
 *
 * Under the gun, which is where it was: the magazines are below the turrets
 * because the hoists run straight up, and that is the whole reason a turret
 * is where it is.
 */
export function magazineOf(cls, spec) {
  return sectionAt(clamp((spec.z || 0) / (cls.hull.length * 0.5), -1, 1));
}

/** Is this mounting's magazine under water? */
export function magazineDrowned(ship, cls, spec) {
  const c = ship.sections[magazineOf(cls, spec)];
  if (!c) return false;
  const vol = sectionVolume(cls, magazineOf(cls, spec));
  return vol > 0 && (c.wP + c.wS) / vol >= MAG_DROWNED;
}

/**
 * What state a mounting is in: 0 sound, 1 damaged, 2 bad, 3 disabled.
 */
export function gunState(ship, cls, spec, m) {
  if (!m) return 3;
  if (m.hurt >= 3) return 3;
  if (spec && magazineDrowned(ship, cls, spec)) return 3;
  // Rounded up, not down. `hurt` is continuous because the mounting's crew
  // work it back down continuously, and taking the floor of it meant a turret
  // knocked into the damaged state read as sound again one tick later -- the
  // first second of mending took it from 1.0 to 0.98 and the floor of that is
  // nought. A mounting stays in the state it is in until its crew have worked
  // it the whole way out of it.
  return Math.max(0, Math.min(2, Math.ceil(m.hurt)));
}

/**
 * The condition of a mounting the simulation keeps no state for.
 *
 * Her close-range battery is dozens of small guns and there is no reload, no
 * training gear and no crew modelled for any one of them -- flak is worked out
 * as a share of a whole battery. But a 40 mm mounting is still bolted to a
 * particular piece of the ship with a particular locker under it, and when
 * that piece of the ship is gone or that locker is under water, that mounting
 * is out of it whatever the rest of the battery is doing.
 */
export function lightGunState(ship, cls, spec) {
  // aaBearing is asked this question by the arsenal panel and by the tests
  // with a bare hull -- a position, a heading and nothing else. A ship with no
  // compartments has no flooded ones.
  if (!ship || !ship.sections) return 0;
  const c = ship.sections[magazineOf(cls, spec)];
  if (!c) return 0;
  if (c.hp <= 0) return 3;
  if (magazineDrowned(ship, cls, spec)) return 3;
  const f = c.hp / c.max;
  return f < 0.3 ? 2 : f < 0.62 ? 1 : 0;
}

/** The seconds this state adds to a reload. */
export function gunPenalty(state) {
  return state === 1 ? 2 : state === 2 ? 10 : 0;
}

/**
 * Hurt a mounting, by however much the burst was worth.
 *
 * A big enough burst finishes it outright; anything less puts it a step or two
 * down and it works its way back up. Nothing here is a countdown: the mounting
 * is in the state it is in until its crew have had time to do something about
 * it.
 */
function hurtMount(state, m, amount) {
  if (!m || m.hurt >= 3) return;
  m.hurt = Math.min(3, (m.hurt || 0) + amount);
}

/**
 * The mounting's own crew, getting on with it.
 *
 * There is nothing to call away and nothing to spend: a gun's crew clear their
 * own mounting while the ship is fighting, and they do it whether the bridge
 * knows about it or not. What they cannot do is put back a mounting that is
 * gone -- three is where it stops.
 */
function mendMount(m, dt) {
  if (!m || !m.hurt || m.hurt >= 3) return;
  m.hurt = Math.max(0, m.hurt - GUN_MEND * dt);
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
    // Her own turret crew putting it right, and they do it while she fights.
    // Nobody is sent to a gun and no repair is called away: the mounting's
    // people clear the jam, get the casualties out and go on.
    mendMount(t, dt);
    const cond = gunState(ship, cls, cls.turrets[t.id], t);
    // Finished, or her magazine is under. Either way the mounting is done and
    // it does not train, elevate or reload.
    if (cond >= 3) { t.laid = false; continue; }
    if (t.disabled > 0) { t.disabled -= dt; continue; }
    // A turret somebody has gone down to takes his bearing and nobody else's.
    // Every other turret aboard goes on being laid by her fire control, which
    // is the whole point: manning A turret does not stop B turret shooting.
    const held = isManned(ship, 'main', t.id);
    const want = held ? mannedDesired(ship, cls.turrets[t.id])
      : turretDesired(ship, cls, t);
    t.angle = approachAngle(t.angle, want.angle, cls.gun.traverse * dt);
    // A gun that cannot bear comes down to the loading angle rather than
    // standing there pointing at the sky over her own bridge -- and one that
    // can never goes past its own stops.
    // How far up, on the range the layer is holding rather than the range her
    // fire control is working -- a man at a gun is shooting at what is in his
    // sight, not at the plot's solution.
    const sol = held
      ? solveBallistic(cls.gun,
        clamp(dist(ship.x, ship.z, ship.manX, ship.manZ), 400, cls.gun.range), 12).elev
      : elev;
    const aim = want.blocked ? 0.03 : clamp(sol, stops.min, stops.max);
    t.elev += clamp(aim - t.elev, -0.5 * dt, 0.5 * dt);
    t.elev = clamp(t.elev, stops.min, stops.max);
    // Off the target as well as off the arc: a solution her guns cannot reach
    // is a solution she has not got, and she checks fire rather than shooting
    // at the stop and missing by a mile every time.
    t.laid = !want.blocked && sol <= stops.max && sol >= stops.min;
    if (t.cooldown > 0) t.cooldown -= dt;
  }
}

export function canFire(ship) {
  if (!ship.alive) return false;
  // Everything on a submarine's casing is outside the pressure hull and full
  // of water the moment she is down. Only the tubes work under.
  if (gunsDrowned(ship)) return false;
  const cls = shipClass(ship);
  return ship.turrets.some((t) => t.cooldown <= 0 && t.disabled <= 0
    && t.laid !== false && gunState(ship, cls, cls.turrets[t.id], t) < 3);
}

/**
 * Fire every turret that is loaded and on target. Returns barrels fired.
 *
 * `only` fires one mounting and no others, which is what a trigger under a
 * captain's hand does. Without it her fire control fires the battery and
 * leaves out whichever mounting somebody has gone down to -- a manned gun
 * fires when its layer says so and not when the plot says so.
 */
export function fireGuns(state, ship, only = null) {
  if (!ship.alive) return 0;
  if (gunsDrowned(ship)) return 0;
  const cls = shipClass(ship);
  const gun = cls.gun;
  const spec = gun.shells[ship.shellType] || gun.shells.ap;
  const held = only === null && ship.manned && ship.manned.k === 'main'
    ? ship.manned.i : -1;
  // A gun laid by hand shoots at the range its layer is holding.
  const aimAt = only !== null && ship.manned && ship.manned.k === 'main'
    ? { x: ship.manX, z: ship.manZ } : { x: ship.aimX, z: ship.aimZ };
  const d = clamp(dist(ship.x, ship.z, aimAt.x, aimAt.z), 400, gun.range);
  let fired = 0;

  const stops = gunLimits(gun);
  const solution = solveBallistic(gun, d, 12).elev;
  for (const t of ship.turrets) {
    if (only !== null && t.id !== only) continue;
    if (t.id === held) continue;
    if (t.cooldown > 0 || t.disabled > 0) continue;
    const tSpec = cls.turrets[t.id];
    const cond = gunState(ship, cls, tSpec, t);
    if (cond >= 3) continue;
    const want = only !== null && ship.manned && ship.manned.k === 'main'
      ? mannedDesired(ship, tSpec) : turretDesired(ship, cls, t);
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
    // A knocked-about mounting is slower between rounds: two seconds on a
    // damaged one, ten on one barely in action.
    t.cooldown = gun.reload + gunPenalty(cond);
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
 * Whether this ship may fly that flight.
 *
 * Anything on her own side. A squadron in the air belongs to the fleet, not to
 * the deck it came off: a destroyer captain with no aircraft of his own can
 * take one of the carrier's, which is the whole point of having a carrier in
 * company. What she may not do is take one somebody else is already flying --
 * a flight has one pilot -- and a claim lapses a few seconds after the last
 * word from him, so a pilot who drops out does not hold her for the rest of
 * the action.
 */
export const PILOT_HOLD = 4;
export function mayFly(state, ship, p) {
  if (!ship || !ship.alive || !p || p.dead) return false;
  if (p.team !== ship.team) return false;
  if (!p.pilot || p.pilot === ship.id) return true;
  return (state.t - (p.flownAt ?? -1e9)) > PILOT_HOLD;
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
  if (!mayFly(state, ship, p)) return false;
  if (!Number.isFinite(msg.x) || !Number.isFinite(msg.z) || !Number.isFinite(msg.h)) return false;
  // No further than she could have flown since the last word from her, with a
  // good margin for a slow connection. A flight doing three hundred knots
  // covers a hundred and fifty metres a second. Off the aeroplane's own ship,
  // not the one flying her: a destroyer's captain flying a carrier's Avenger
  // was held to a destroyer's cruising speed, which is eighty knots slower
  // than the aeroplane, so every correction he made was thrown away.
  const owner = state.ships.find((q) => q.id === p.owner);
  const cls = shipClass(owner || ship);
  const top = (cls.planes ? cls.planes.cruiseSpeed : 90) * 3.2;
  const since = Math.max(0.05, Math.min(2, state.t - (p.flownAt ?? state.t)));
  const reach = top * since + 80;
  if (dist(p.x, p.z, msg.x, msg.z) > reach) return false;
  p.x = msg.x;
  p.z = msg.z;
  p.heading = wrapAngle(msg.h);
  // And how high she is, which matters now that flying into things is a thing
  // an aeroplane can do. Held to what an airframe could actually have done
  // since the last word from her, the same way her position is: nobody drops a
  // flight from cruising height into somebody's boat deck in one message.
  if (Number.isFinite(msg.p)) p.pitch = clamp(msg.p, -1.5, 1.5);
  if (Number.isFinite(msg.y)) {
    const climb = 140 * since + 60;
    p.y = clamp(msg.y, Math.max(-4, (p.y ?? 220) - climb), Math.min(9000, (p.y ?? 220) + climb));
  }
  p.flown = true;
  p.flownAt = state.t;
  p.pilot = ship.id;
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
// ---------------------------------------------------------------------------
// Aircraft guns that actually fire somewhere
// ---------------------------------------------------------------------------
//
// A flight's guns used to be a cone and a die roll: anything inside nine
// degrees of the nose and inside seven hundred metres took damage, and nothing
// ever left the aeroplane. So the sight was a decoration -- putting the ring
// exactly on a ship and putting it nearly on a ship were the same thing, and
// there was no such thing as a miss.
//
// Now the rounds are real. They leave the muzzle down the line the sight is
// on, they take a little under a second to get out to where they are going,
// and they hit whatever is on that line when they get there. Which means the
// sight is a sight: aiming off misses, leading a crossing target is something
// a pilot has to do, and firing at a ship at extreme range puts the burst in
// the sea short of her.
//
// One tracer stands for the stream rather than one round for each round: a
// fighter's six guns are better than seventy rounds a second between them and
// nobody needs seventy objects a second to see a burst. Each one carries the
// damage of the rounds it stands for, so the arithmetic is the same and the
// arrays are not.

/** Bursts a second. Each one is a tracer and the rounds that go with it. */
const BURST_RATE = 11;
/** Muzzle velocity of a rifle-calibre aircraft gun, near enough. */
const BULLET_V = 810;
/** And how long the rounds are worth anything: about nine hundred metres. */
const BULLET_LIFE = 1.15;
/**
 * How tight the pattern is, in radians.
 *
 * Fixed guns harmonised on a point a few hundred yards ahead put their rounds
 * inside a couple of milliradians. The rest of the spread here is the
 * formation: four machines in loose line abreast are not all pointed at
 * precisely the same piece of sky, so a flight's pattern opens with its
 * strength rather than being one aeroplane's.
 */
function burstSpread(p) {
  return 0.0035 + 0.0022 * Math.max(0, (p.count || 1) - 1);
}

/**
 * The pilot's guns.
 *
 * Called while the trigger is down. Fires on the guns' own rhythm rather than
 * every tick, and puts the rounds down the bore -- her heading and her pitch,
 * which is what the client is sending now precisely so this can be done.
 *
 * Returns true while she is shooting, which is what the caller shows on the
 * cockpit glass.
 */
export function strafe(state, ship, id, dt) {
  const p = state.planes.find((q) => q.id === id);
  if (!p || p.dead || !ship) return false;
  if (p.owner !== ship.id && p.pilot !== ship.id) return false;
  // Her own ship's aircraft, whichever ship is flying her.
  const owner = state.ships.find((q) => q.id === p.owner);
  const cls = shipClass(owner || ship);
  const P = cls.planes;
  if (!P) return false;
  if (!p.count) return false;

  p.gunAt = (p.gunAt ?? 0) + dt;
  if (p.gunAt < 1 / BURST_RATE) return true;
  const rounds = Math.min(4, Math.floor(p.gunAt * BURST_RATE));
  p.gunAt = 0;

  // What the flight's guns are worth for the time this burst stands for, and
  // it is two different numbers. Rifle calibre into another aeroplane is
  // lethal; the same rounds into a warship's plating are nothing, and what
  // they are actually for is the people standing in the open on her.
  const air = (P.fighterGuns ?? FIGHTER_GUNS) * (p.count || 1) / BURST_RATE;
  const ship2 = (P.strafeDamage ?? 260) * (p.count || 1) / BURST_RATE;
  const spread = burstSpread(p);
  for (let i = 0; i < rounds; i++) {
    fireBullet(state, p, air, ship2, spread);
  }
  return true;
}

/** One tracer and the rounds it stands for, down the bore and off she goes. */
function fireBullet(state, p, dmg, hurt, spread) {
  const pitch = p.pitch || 0;
  // Gaussian-ish, from two uniforms: a pattern with a dense middle and a few
  // wide ones, which is what a burst looks like on a butt.
  const sx = (state.rng() + state.rng() - 1) * spread;
  const sy = (state.rng() + state.rng() - 1) * spread;
  const h = wrapAngle(p.heading + sx);
  const el = pitch + sy;
  const cp = Math.cos(el);
  const b = {
    id: eid(),
    team: p.team, owner: p.owner, plane: p.id,
    x: p.x, y: (p.y ?? 220) - 1.2, z: p.z,
    vx: Math.sin(h) * cp * BULLET_V,
    vy: Math.sin(el) * BULLET_V,
    vz: Math.cos(h) * cp * BULLET_V,
    life: 0, dmg, hurt,
  };
  state.bullets.push(b);
  // The tracer. One message for the burst rather than one for every round,
  // and it carries where the rounds are actually going rather than what they
  // are going to hit -- because they may well hit nothing.
  if (state.t - (p.tracerAt ?? -9) >= 0.1) {
    p.tracerAt = state.t;
    const reach = BULLET_V * BULLET_LIFE;
    state.events.push({
      e: 'airGuns', i: p.id, team: p.team,
      x: r(b.x), y: r(b.y), z: r(b.z),
      tx: r(b.x + b.vx * BULLET_LIFE), ty: r(b.y + b.vy * BULLET_LIFE),
      tz: r(b.z + b.vz * BULLET_LIFE),
      air: 0, reach: Math.round(reach),
    });
  }
}

/**
 * The rounds, in flight.
 *
 * Gravity is in here because at nine hundred metres a rifle-calibre round has
 * dropped a couple of metres, which is the difference between the waterline
 * and the boot topping. Everything is tested along the segment the round
 * covered this tick rather than at the point it ended at: a round doing eight
 * hundred metres a second moves twenty-seven metres in a tick, and an
 * aeroplane is nine metres long.
 */
function stepBullets(state, dt) {
  if (!state.bullets.length) return;
  const out = [];
  for (const b of state.bullets) {
    const px = b.x, py = b.y, pz = b.z;
    b.vy -= G * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.life += dt;
    if (b.life > BULLET_LIFE) continue;

    let done = false;
    // Aeroplanes first: that is what a fighter's guns are for, and a flight is
    // a small target that a coarse test walks straight past.
    for (const q of state.planes) {
      if (q.dead || q.team === b.team || q.id === b.plane) continue;
      if (!segNear(px, py, pz, b.x, b.y, b.z, q.x, q.y ?? 220, q.z, 26)) continue;
      hurtFlight(state, q, b.dmg, 'fighters');
      state.events.push({
        e: 'airHit', x: r(b.x), y: r(b.y), z: r(b.z), air: 1, i: q.id,
      });
      done = true;
      break;
    }
    if (done) continue;

    // Ships. Her box and her air draft, in four steps along the segment.
    for (const s of state.ships) {
      if (!s.alive || s.team === b.team) continue;
      const cls = getClass(s.classId);
      if (dist2(b.x, b.z, s.x, s.z) > 4e6) continue;
      const halfLen = cls.hull.length * 0.5;
      const halfBeam = cls.hull.beam * 0.5;
      const top = 16 + cls.hull.superstructure * 14;
      for (let i = 1; i <= 4 && !done; i++) {
        const f = i / 4;
        const cx = lerp(px, b.x, f), cy = lerp(py, b.y, f), cz = lerp(pz, b.z, f);
        if (cy > top || cy < -1) continue;
        if (!pointInBox(cx, cz, s.x, s.z, s.heading, halfLen, halfBeam)) continue;
        bulletIntoShip(state, b, s, cls, cx, cy, cz);
        done = true;
      }
      if (done) break;
    }
    if (done) continue;

    // The guns ashore, which are a low wide target.
    for (const bat of state.batteries) {
      if (!bat.alive || bat.team === b.team) continue;
      const spec = BATTERIES[bat.batteryId];
      const reach = spec.span * 0.5 + 4;
      if (dist2(b.x, b.z, bat.x, bat.z) > (reach + 60) * (reach + 60)) continue;
      if (b.y > bat.y + 12 || b.y < bat.y - 2) continue;
      if (dist2(b.x, b.z, bat.x, bat.z) > reach * reach) continue;
      // Rifle calibre against a gun in an emplacement does very little, and
      // that is right: it is what strafing a coast battery was actually like.
      hurtBattery(state, bat, b.hurt * 0.25);
      state.events.push({ e: 'airHit', x: r(b.x), y: r(b.y), z: r(b.z), air: 0 });
      done = true;
      break;
    }
    if (done) continue;

    // The sea, or the ground -- and the ground only asked about when she is
    // low enough to have met any.
    const g = b.y <= landCeiling(state.world) ? groundHeight(state.world, b.x, b.z) : 0;
    if (b.y <= Math.max(0, g)) {
      state.events.push({
        e: 'airHit', x: r(b.x), y: r(Math.max(0, g)), z: r(b.z), air: 0,
        land: g > 0.5 ? 1 : 0,
      });
      continue;
    }
    out.push(b);
  }
  state.bullets = out;
}

/** How near a point a segment passes, cheaply. */
function segNear(ax, ay, az, bx, by, bz, px, py, pz, rad) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / len2 : 0;
  t = clamp(t, 0, 1);
  const qx = ax + dx * t - px;
  const qy = ay + dy * t - py;
  const qz = az + dz * t - pz;
  return qx * qx + qy * qy + qz * qz <= rad * rad;
}

/**
 * A burst into a ship.
 *
 * Rifle calibre does not hurt a warship and is not meant to: it does not get
 * through anything, and against her plating it is noise. What it does do --
 * and what strafing was for -- is kill the people standing in the open, which
 * means her close-range battery. An open 20 mm or 40 mm mounting caught by a
 * fighter's guns stops firing, and it stops firing because its crew are down
 * rather than because the gun is broken, which is why it comes back.
 */
function bulletIntoShip(state, b, s, cls, cx, cy, cz) {
  const owner = state.ships.find((q) => q.id === b.owner) || null;
  const l = worldToLocal(cx - s.x, cz - s.z, s.heading);
  const where = sectionAt(l.z / (cls.hull.length * 0.5),
    cy > 12 ? 'superstructure' : 'belt');
  damageShip(state, s, owner, b.hurt, 'he', where);
  hurtFlak(state, s, cls, { x: l.x, y: cy, z: l.z }, b.hurt);
  state.events.push({
    e: 'airHit', x: r(cx), y: r(cy), z: r(cz), air: 0, ship: s.id,
  });
}

// ---------------------------------------------------------------------------
// Her close-range battery, mounting by mounting
// ---------------------------------------------------------------------------
//
// Flak used to be one number for the whole ship, worked out as a share of her
// battery and reduced only by compartments being shot away or flooded. So the
// one thing a fighter could not do to a ship was the one thing fighters
// actually did: go along her boat deck and empty the close-range mountings.
//
// Every mounting in `aaBattery` now has a state of its own. It is knocked out
// by a burst near it and it comes back when its crew have sorted it out --
// unless the burst was big enough to wreck the mounting rather than the men.

/** Seconds a mounting is out of it after being raked. */
const FLAK_OUT = 26;

/** Her flak's condition, made on demand so nothing has to build it up front. */
function flakState(ship, cls) {
  const n = aaBattery(cls).length;
  if (!ship.flak || ship.flak.length !== n) {
    ship.flak = Array.from({ length: n }, () => ({ out: 0, dead: false }));
  }
  return ship.flak;
}

/** Is that mounting in action? */
export function flakUp(ship, i) {
  const f = ship && ship.flak && ship.flak[i];
  return !f || (!f.dead && f.out <= 0);
}

/**
 * Rake the nearest close-range mounting to a burst.
 *
 * The nearest one and only if the burst actually reached it: a fighter's
 * rounds along the starboard waist do not empty the port quarter's guns.
 */
export function hurtFlak(state, ship, cls, at, power) {
  const battery = aaBattery(cls);
  const flak = flakState(ship, cls);
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < battery.length; i++) {
    const m = battery[i];
    const d = Math.hypot((m.x || 0) - at.x, (m.my ?? 12) - at.y, m.z - at.z);
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0 || bd > 14) return false;
  const f = flak[best];
  if (f.dead) return false;
  f.out = Math.max(f.out, FLAK_OUT * clamp(power / 220, 0.35, 1.6));
  // Enough of it and the mounting itself is finished, not just its crew.
  if (power > 900 && state.rng() < 0.35) f.dead = true;
  state.events.push({ e: 'flakOut', ship: ship.id, m: best, dead: f.dead ? 1 : 0 });
  return true;
}

/** The crews getting their mountings back into action. */
function stepFlak(state, ship, dt) {
  if (!ship.flak) return;
  for (const f of ship.flak) if (f.out > 0) f.out -= dt;
}
/**
 * Let go of a flight: the pilot has left her, or been shot out of her.
 *
 * She goes back on the autopilot where she is, heading for whatever she was
 * sent after -- not back to the beginning of her sortie.
 */
export function releasePlane(state, id, ship = null) {
  const p = state.planes.find((q) => q.id === id);
  if (!p) return;
  // Hers to give back: the man flying her, or the ship she came off. Now that
  // a flight can be flown from another ship's bridge, anybody could otherwise
  // take a squadron off a consort's pilot in the middle of his run.
  if (ship && p.pilot && p.pilot !== ship.id && p.owner !== ship.id) return;
  p.flown = false;
  p.hunt = 0;
  // And she is nobody's now, so the next man who wants her can have her.
  p.pilot = 0;
}

/**
 * Drop what she is carrying, now, because the pilot said so.
 *
 * The same weapons the autopilot would have dropped, on the same terms -- she
 * still has to be near enough to something to be dropping at it.
 */
export function dropOrdnance(state, ship, id) {
  const p = state.planes.find((q) => q.id === id);
  if (!p || p.dead || !ship) return false;
  if (p.owner !== ship.id && p.pilot !== ship.id) return false;
  if (p.dropped) return false;
  const owner = state.ships.find((q) => q.id === p.owner);
  const cls = shipClass(owner || ship);
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
  for (let mi = 0; mi < battery.length; mi++) {
    const m = battery[mi];
    all += m.guns;
    if (d > m.range) continue;
    if (!mountBears(ship, m, bearing)) continue;
    if (up !== null && (up > m.up.max || up < m.up.min)) continue;
    // A close-range mounting has a ready-use locker under it like everything
    // else aboard, and when that is under water the mounting has nothing to
    // fire. So does a mounting standing on a compartment that has been shot
    // out of her.
    if (lightGunState(ship, cls, m) >= 3) continue;
    // And a mounting a fighter has been along: its crew are down or its gun
    // is wrecked, and either way it is not shooting at anybody.
    if (!flakUp(ship, mi)) continue;
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
  if (gunsDrowned(ship)) return;
  const spec0 = S.shells[ship.shellType] || S.shells.he || S.shells.ap;
  for (const m of ship.secMounts) {
    mendMount(m, dt);
    const spec = S.mounts[m.id];
    const cond = gunState(ship, cls, spec, m);
    if (cond >= 3) continue;
    if (m.disabled > 0) { m.disabled -= dt; continue; }
    if (m.cooldown > 0) m.cooldown -= dt;
    // A mounting somebody has gone down to comes off local control: it trains
    // where he is holding, elevates on his range, and waits for his trigger.
    if (isManned(ship, 'sec', m.id)) {
      const want = mannedDesired(ship, spec);
      m.angle = approachAngle(m.angle, want.angle, S.traverse * dt);
      const stops = gunLimits(S);
      const aim = solveBallistic(S,
        clamp(dist(ship.x, ship.z, ship.manX, ship.manZ), 400, S.range), 10);
      const up = want.blocked ? 0 : clamp(aim.elev, stops.min, stops.max);
      m.elev += clamp(up - m.elev, -0.9 * dt, 0.9 * dt);
      m.elev = clamp(m.elev, stops.min, stops.max);
      m.target = 0;
      continue;
    }
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

    secondarySalvo(state, ship, m, spec, spec0, lx, lz, cond);
  }
}

/**
 * One secondary mounting's salvo, at a point in the world.
 *
 * Its own function because two things fire a secondary mounting now: her gun
 * captain in local control, who has picked his own target and led it, and a
 * captain standing at the mounting with his hand on the trigger. What comes
 * out of the muzzle is the same either way.
 */
function secondarySalvo(state, ship, m, spec, spec0, lx, lz, cond) {
  const cls = shipClass(ship);
  const S = cls.secondary;
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
  m.cooldown = S.reload + gunPenalty(cond);
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

/**
 * Fire one secondary mounting, on the order of the man standing at it.
 *
 * Everything the mounting itself would check still applies: it has to be
 * loaded, it has to be sound, it has to have trained to where he is holding,
 * and the bearing has to be inside its own arc. A gun laid on her own bridge
 * does not go off because somebody pressed a button.
 */
export function fireSecondary(state, ship, id) {
  if (gunsDrowned(ship)) return 0;
  const cls = shipClass(ship);
  const S = cls.secondary;
  if (!S || !ship.alive) return 0;
  const m = ship.secMounts.find((q) => q.id === id);
  if (!m || m.cooldown > 0 || m.disabled > 0) return 0;
  const spec = S.mounts[m.id];
  const cond = gunState(ship, cls, spec, m);
  if (cond >= 3) return 0;
  const want = mannedDesired(ship, spec);
  if (want.blocked) return 0;
  if (Math.abs(angleDelta(m.angle, want.angle)) > 0.05) return 0;
  const stops = gunLimits(S);
  const aim = solveBallistic(S,
    clamp(dist(ship.x, ship.z, ship.manX, ship.manZ), 400, S.range), 10);
  if (aim.elev > stops.max || aim.elev < stops.min) return 0;
  const spec0 = S.shells[ship.shellType] || S.shells.he || S.shells.ap;
  secondarySalvo(state, ship, m, spec, spec0, ship.manX, ship.manZ, cond);
  return spec.guns;
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
  // What the battery has been told to engage, if anything. A coast defence
  // commander is part of a command, not a man shooting at whatever goes past:
  // when the staff has named a ship, that ship is his, and he only chooses for
  // himself when nobody has chosen for him or when the one he was given has
  // gone out of his arcs. The order itself lives on the server and is never
  // sent anywhere -- see command.js.
  const wanted = bat.orderTarget
    ? state.ships.find((q) => q.id === bat.orderTarget && q.alive
      && q.team !== bat.team) : null;
  for (const ship of (wanted ? [wanted, ...state.ships] : state.ships)) {
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
    // The ship the staff named is taken the moment she proves reachable: she
    // is first in the list, and nothing after her is allowed to displace her.
    if (wanted && ship.id === wanted.id) break;
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
  // A bomb has no gun behind it and so no gun's datasheet: what it beats and
  // what it does come off the body itself. A casemate's overhead cover is the
  // armour it has to get through, and a thousand-pounder that does is the end
  // of the position -- which is the whole reason a heavy squadron is sent
  // against one rather than a cruiser's secondaries.
  const spec = sh.bomb
    ? { pen: sh.bomb.bombPen, damage: sh.bomb.bombDamage }
    : sh.spec;
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

// ---------------------------------------------------------------------------
// Ground under fire
// ---------------------------------------------------------------------------
//
// Land was scenery. A sixteen-inch shell into a hillside raised a puff of dust
// and the hillside was exactly as it had been, which is the one place in this
// game where something was hit and nothing happened.
//
// Now it is not. Every round that falls ashore digs a crater, the crater is in
// the height field everything else reads, and ground that has taken more than
// it can stand gives way -- which takes whatever was standing on it down with
// it. Soft ground -- a beach, the flat behind it, spoil -- goes quickly; the
// rock a headland is made of barely marks. That is also the answer to why
// coast batteries are always on the high ground.

/** How much punishment a patch of ground stands before it lets go, by softness. */
function groundStrength(soft) {
  // Sand goes in a handful of heavy rounds. Rock takes a bombardment and is
  // still rock. The figures are in metres of crater depth accumulated, which
  // is what a shell contributes, so they scale with the gun that is firing
  // without anything having to know what gun it was.
  return 16 + 210 * (1 - soft) * (1 - soft);
}

/**
 * A round, a bomb or an aeroplane into the ground.
 *
 * `bore` is the calibre in metres -- the same number the burst code uses --
 * because what a shell throws out of a hillside goes as its bursting charge
 * and the charge goes as the cube of the bore. Returns the crater it made, or
 * null if whatever it was fell in the sea.
 */
export function landStrike(state, x, z, bore, kind = 'shell') {
  const world = state.world;
  if (!world) return null;
  if (groundHeight(world, x, z) <= 0.5) return null;     // that was the sea
  const soft = soilAt(world, x, z);
  // A 15-inch shell digs a hole about eight metres across in firm ground and
  // half as much again in sand; a thousand-pound bomb rather more than that.
  const heave = kind === 'bomb' ? 1.7 : kind === 'crash' ? 1.25 : 1;
  const r = clamp((5 + bore * 46) * heave * (0.72 + soft * 0.55), 3, 46);
  const depth = r * (0.13 + soft * 0.20);
  // And never more than half the hill: a battlefield where the guns can dig
  // an island down to sea level is a battlefield where the coastline is a
  // suggestion, and nothing else here knows that.
  const c = addCrater(world, x, z, r, depth, Math.max(2, groundHeight(world, x, z) * 0.55));
  if (!c) return null;
  state.events.push({ e: 'crater', c: craterWire(c), soft: Math.round(soft * 100) / 100 });
  // What the ground has taken here, and whether that is more than it will
  // stand. Held on the crater itself, so the patch that is giving way is the
  // patch that has been hit rather than a grid square near it.
  if (c.wear > groundStrength(soft) && !c.gone) collapseGround(state, c, soft);
  return c;
}

/**
 * Ground giving way.
 *
 * Not another crater: a subsidence. The lip of the old hole falls into it and
 * takes a slice of the hillside with it, and what comes out is a much wider,
 * much deeper hollow than anything a single shell digs. It happens once per
 * patch -- ground that has already gone cannot go again, it is a hole -- and
 * it is the only thing in the game that moves a gun that is not on a ship.
 */
function collapseGround(state, c, soft) {
  c.gone = true;
  const before = groundHeight(state.world, c.x, c.z);
  // Widened and deepened together. A slip is shallow for its width -- it is
  // ground running downhill, not a shaft -- so the radius goes up harder than
  // the depth does.
  c.r = Math.min(c.r * 2.0, 90);
  c.depth = Math.min(c.depth * 1.35 + 2.5 + soft * 4, before * 0.40 + 5);
  state.world.groundRev = (state.world.groundRev || 0) + 1;
  const after = groundHeight(state.world, c.x, c.z);
  const drop = Math.max(0, before - after);
  state.events.push({
    e: 'collapse', c: craterWire(c), x: r(c.x), z: r(c.z),
    r: r(c.r), drop: r(drop),
  });

  // And anything standing on it goes down with it.
  //
  // A gun in an emplacement is not bolted to the world: it is a platform dug
  // into the ground, and when the ground under it goes the platform goes. It
  // is re-seated on what is left -- which may be a long way down -- and it
  // takes the fall as damage, because a gun that has dropped four metres on
  // one side is a gun off its roller path and out of the action.
  for (const bat of state.batteries) {
    if (!bat.alive) continue;
    if (dist(bat.x, bat.z, c.x, c.z) > c.r) continue;
    const b = BATTERIES[bat.batteryId];
    const was = bat.y;
    bat.y = batteryPad(state.world, bat.x, bat.z, b.span);
    const fell = Math.max(0, was - bat.y);
    if (fell < 0.4) continue;
    state.events.push({
      e: 'batteryFell', id: bat.id, x: r(bat.x), y: r(bat.y), z: r(bat.z), fell: r(fell),
    });
    // Half her strength for every two metres she has dropped. Four metres and
    // the mounting is finished whatever her plating was worth: nothing is
    // proof against the ground going out from under it.
    hurtBattery(state, bat, bat.maxHp * clamp(fell / 4, 0.12, 1));
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
        if (sh.bomb) {
          // A bomb has no belt to beat. It arrives on her deck, and what it
          // reaches is settled there -- see bombHit, which is what a dive
          // bomber's weapon goes through as well.
          const lb = worldToLocal(cx - target.x, cz - target.z, target.heading);
          const cell = sectionAt(clamp(lb.z / halfLen, -1, 1), 'deck');
          const owner = state.bombers
            ? state.bombers.find((q) => q.id === sh.bomber) || null : null;
          bombHit(state, target, null, cell, lb.x >= 0 ? 1 : -1, sh.bomb,
            { x: lb.x, y: freeboardOf(cls), z: lb.z });
          state.events.push({ e: 'bombhit', x: cx, z: cz, cal: sh.caliber });
          void owner;
        } else {
          resolveShellHit(state, sh, target, cx, cz, cy);
        }
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

    // Down. Either in the sea, or into the ground -- and into the ground it
    // takes a piece of the ground with it.
    // Above the highest land on the battlefield she cannot have hit any of
    // it, and that is the usual case: asking the height field about every
    // shell on every tick is the expensive way to find out she is still four
    // thousand feet over open water.
    if (sh.y <= 0 || sh.y <= landCeiling(state.world)) {
      const g = groundHeight(state.world, sh.x, sh.z);
      if (sh.y <= Math.max(0, g)) {
        const ashore = g > 0.5;
        state.events.push({
          e: ashore ? 'landhit' : 'splash', x: sh.x, z: sh.z, cal: sh.caliber,
          bomb: sh.bomb ? 1 : 0,
        });
        if (ashore) {
          landStrike(state, sh.x, sh.z, sh.caliber / 1000, sh.bomb ? 'bomb' : 'shell');
          // A stick laid across a gun position does for the crew as well as
          // the ground: a battery under it is the target, not scenery.
          if (sh.bomb) {
            for (const bat of state.batteries) {
              if (!bat.alive || bat.team === sh.team) continue;
              const spec = BATTERIES[bat.batteryId];
              // How far from a gun position a bomb has to land to matter.
              //
              // A direct hit on an emplacement was never what silenced one:
              // what silenced one was a thousand-pounder in the earth thirty
              // yards away, which throws the gun off its mounting, buries the
              // ready ammunition and kills the detachment standing in the
              // open. So the radius is the works themselves plus a blast
              // radius that grows with the size of the bomb, and the effect
              // falls off across it rather than stopping at a line.
              const reach = (spec ? spec.span : 20) * 0.5 + 30
                + (sh.bomb.bombBore || 0.3) * 110;
              const d = dist(sh.x, sh.z, bat.x, bat.z);
              if (d > reach) continue;
              const bite = Math.pow(1 - d / reach, 1.4);
              hurtBattery(state, bat, (sh.bomb.bombDamage || 3000) * 0.55 * bite);
            }
          }
        }
        continue;
      }
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
  for (const t of ship.turrets) {
    t.disabled = Math.max(t.disabled, 26 + state.rng() * 20);
    hurtMount(state, t, 1.4 + state.rng() * 1.9);
  }
  for (const m of ship.secMounts) {
    m.disabled = Math.max(m.disabled || 0, 20 + state.rng() * 16);
    hurtMount(state, m, 1.1 + state.rng() * 2.1);
  }
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
    hurt.m.disabled = Math.max(hurt.m.disabled || 0, 3 + state.rng() * 5);
    // And it leaves the mounting in whatever state it leaves it in. A heavy
    // shell into a turret finishes it; a splinter on the mounting jams the
    // training gear and slows it down, and the gun's crew work at it.
    hurtMount(state, hurt.m, (BURST_M[kind] ?? 4) / 9 + state.rng() * 1.4);
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
  // A tube built into the hull is the other problem entirely. A submarine's
  // fish does not go over the side: it is blown out of a door in the stem or
  // the stern and it is already in the water, so what has to be clear is the
  // end of the boat rather than the beam. Pointed anywhere but out of its own
  // end it is shooting down the length of her, which is exactly what the
  // side-launched test is there to stop -- so the geometry is the same test
  // with the two walls swapped.
  if (cls.torpedoes && cls.torpedoes.inHull) {
    if (Math.abs(dz) < 1e-6) return false;
    const wallZ = dz > 0 ? hz : -hz;
    const along = wallZ - spec.z;
    if (Math.sign(dz) !== Math.sign(along)) return false;
    const out = along / dz;
    const beam = Math.abs(dx) < 1e-6 ? Infinity : ((dx > 0 ? hx : -hx) - spec.x) / dx;
    return out <= beam;
  }
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
  // Where a bank being trained by hand is wanted, which is not where the plot
  // wants the rest of them.
  const manWorld = headingTo(ship.x, ship.z, ship.manX, ship.manZ);
  const manLocal = wrapAngle(manWorld - ship.heading);
  for (const m of ship.torpMounts) {
    const want = isManned(ship, 'torp', m.id) ? manLocal : local;
    m.angle = approachAngle(m.angle, torpDesired(ship, T.mounts[m.id], want, cls), rate);
  }
}

export function fireTorpedoes(state, ship, only = null) {
  const cls = shipClass(ship);
  if (!cls.torpedoes || !ship.alive) return 0;
  const T = cls.torpedoes;
  // A bank somebody is standing at fires on his order and on nobody else's:
  // her own fire control leaves it alone, and pressing the ship's torpedo key
  // does not empty it over the side.
  const held = only === null && ship.manned && ship.manned.k === 'torp'
    ? ship.manned.i : -1;
  const manned = only !== null && ship.manned && ship.manned.k === 'torp';
  let launched = 0;
  for (const m of ship.torpMounts) {
    if (only !== null && m.id !== only) continue;
    if (m.id === held) continue;
    if (m.cooldown > 0) continue;
    const spec = T.mounts[m.id];
    const world = manned
      ? headingTo(ship.x, ship.z, ship.manX, ship.manZ)
      : headingTo(ship.x, ship.z, ship.aimX, ship.aimZ);
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
    // The outer doors are open now, and stay open for a few seconds while the
    // tube is blown through and shut again.
    ship.tubeOpen = 4.5;
    state.events.push({
      e: 'torpLaunch', x: ship.x + pos.x, z: ship.z + pos.z, ship: ship.id,
      // Which bank went, so the boat on screen opens the right doors.
      mount: m.id,
    });
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
      // A carrier that flies her own nation's machines says so per role:
      // `types` maps fighter, dive and torpedo to what she actually embarks,
      // so a Japanese carrier's fighters are Zeros and an American carrier's
      // are Wildcats without the renderer having to know whose deck it is.
      type: (cls.planes.types && cls.planes.types[f.role]) || cls.planes.type || null,
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
      targetId: 0, targetAir: 0, targetHeavy: 0, targetBat: 0, turn: 0,
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

/**
 * Where the strike this fighter is escorting actually is.
 *
 * The mean of every loaded flight of her side that is going for the ship the
 * staff named. A fighter escorting a strike is not hunting: she is staying
 * between the strike and whatever comes at it, and the only way to do that is
 * to know where the strike is. Null when there is no strike left to escort --
 * they have all attacked, or all been shot down -- and she is her own master
 * again.
 */
function strikeMark(state, p) {
  let x = 0;
  let z = 0;
  let n = 0;
  for (const q of state.planes) {
    if (q.dead || q.team !== p.team || q.role === 'fighter') continue;
    if (q.phase === 'return' || q.phase === 'landing') continue;
    if (p.orderEscort && q.orderTarget && q.orderTarget !== p.orderEscort) continue;
    x += q.x; z += q.z; n += 1;
  }
  return n ? { x: x / n, z: z / n, n } : null;
}

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
    // And a flight that has been given a formation of heavies to go after
    // breaks now, whatever the rest of the strike is doing. An interception is
    // a climb, and a climb is the one thing that cannot be flown in cruise
    // formation: she was holding her leader's height the whole way and
    // arriving six hundred metres under the bombers she had been sent to
    // attack.
    if (p.targetHeavy) { p.lead = p.id; return null; }
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
  //
  // `ceiling` is her service ceiling, and it is now roughly the real one --
  // thirty-odd thousand feet for a fighter, twenty-two for a loaded torpedo
  // bomber. It used to be three thousand metres or so for everybody, which was
  // harmless while the whole battle was flown at two and a half thousand feet
  // and became the reason a fighter could not intercept anything: the climb
  // rate is scaled by how much of her ceiling she has left, so an aeroplane
  // whose ceiling is barely above the height she is trying to reach spends the
  // last thousand metres of the climb crawling and never arrives.
  fighter: { climb: 12.5, ceiling: 9800, dive: 34, g: 1.3 },
  dive: { climb: 9.0, ceiling: 7600, dive: 118, g: 2.7 },
  scout: { climb: 5.5, ceiling: 5500, dive: 26, g: 0.4 },
  torpedo: { climb: 6.0, ceiling: 6800, dive: 30, g: 0.55 },
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
  // Going in. The one profile with no pull-out in it: she is aimed at the
  // ship's own upperworks and the height she wants is the height of the thing
  // she is going to hit.
  if (p.phase === 'ram') {
    const mark = state.ships.find((q) => q.id === p.targetId && q.alive);
    if (mark) {
      const d = dist(p.x, p.z, mark.x, mark.z);
      // Held up until she is close, then down the last of it in a dive, so
      // she comes in out of the sky rather than skimming the sea for a mile.
      return d > 2400 ? 320 : Math.max(8, 8 + (d - 200) * 0.14);
    }
  }
  // Going up after a bomber stream comes before everything else, including
  // keeping station: the whole of an interception is getting to their height,
  // and a flight that holds her leader's instead arrives underneath them.
  if (p.phase === 'outbound' && p.targetHeavy) {
    const heavy = (state.bombers || []).find((q) => q.id === p.targetHeavy && q.alive);
    if (heavy) {
      const f = AIRFRAME[p.role] || AIRFRAME.fighter;
      // As high as her own airframe will take her, which for a loaded torpedo
      // bomber is a good deal less than for a fighter -- and is what decides
      // whether she can make the interception at all.
      return Math.max(60, Math.min(heavy.y, f.ceiling));
    }
  }
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
  // What she is going in on, which may be a hull or may be a gun position:
  // the profile is the same either way -- a dive bomber goes over the top of a
  // battery and a torpedo bomber cannot do anything with one, so the only
  // thing that changes is what is underneath her.
  const mark = p.targetBat
    ? state.batteries.find((q) => q.id === p.targetBat && q.alive)
    : state.ships.find((q) => q.id === p.targetId && q.alive);
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
    return (mark.y || 0) + DIVE_DROP + (p.perch - DIVE_DROP) * k;
  }
  const at = RUN_IN_ALT[p.role] ?? 260;
  const by = RUN_IN_BY[p.role] ?? 700;
  // Eased into over the run-in, so she is at her attack height before she gets
  // there rather than diving for it at the last moment.
  const k = clamp((d - by) / Math.max(1, from - by), 0, 1);
  return (mark.y || 0) + at + (CRUISE_ALT - at) * k;
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
    // A fighter told off to escort hunts from the strike rather than from
    // herself. That one change is the whole difference between an escort and a
    // fighter sweep that happens to have taken off at the same time: she will
    // go a long way to head off something coming at the strike and no distance
    // at all after something going the other way, because the thing she is
    // defending has not moved.
    const guard = p.orderEscort ? strikeMark(state, p) : null;
    const from = guard || p;
    let air = null;
    let airD = guard ? 4600 : 5200;
    for (const q of state.planes) {
      if (q.team === p.team || q.id === p.id) continue;
      const d = dist(from.x, from.z, q.x, q.z);
      if (d < airD) { air = q; airD = d; }
    }
    if (air) return { air };
    // Nothing of theirs in the air near her, and a formation of heavies is
    // worth a very long chase: a fighter squadron that breaks up a bomber
    // stream has done more than one that shoots down a scout. An escort will
    // not chase one halfway across the battlefield, because that is what the
    // heavies are there to make her do.
    let bm = null;
    let bmD = guard ? 5200 : 11000;
    for (const q of (state.bombers || [])) {
      if (!q.alive || q.team === p.team) continue;
      const d = dist(from.x, from.z, q.x, q.z);
      if (d < bmD) { bm = q; bmD = d; }
    }
    if (bm) return { heavy: bm };
    // Nothing to fight. She goes back and sits over the strike, weaving above
    // and behind it -- which is where an escort spends nearly all of its time.
    if (guard) return { escort: guard };
  }
  // The ship her side's staff wants down. Her own eyes still have to find her
  // -- an order does not put a ship inside a flight's reach -- but when the
  // strike has been given a target, every flight in it goes for the same one.
  // That is the difference between a strike and a hundred sorties.
  if (p.orderTarget) {
    const want = state.ships.find((q) => q.id === p.orderTarget && q.alive
      && q.team !== p.team);
    if (want && dist(p.x, p.z, want.x, want.z) < REACH * 1.6) return { ship: want };
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
  if (best) return { ship: best };

  // Nothing afloat within reach. The guns ashore are a target too.
  //
  // A battery is a hard one -- concrete, dug in, and a bomb has to be close --
  // but it is the one target that cannot steam out of the way, and a squadron
  // with nothing else to do is better employed working one over than flying
  // home with its bombs. A torpedo bomber cannot do much about one, so she
  // ranks it below everything; a fighter strafes it, which is worth very
  // little and is still worth more than nothing.
  let bat = null;
  // Further than she will go for a ship. A gun position is on the chart before
  // the battle starts -- both sides emplaced theirs in front of each other --
  // so there is no finding involved: she knows where it is and flies there.
  let batD = REACH * 1.4;
  for (const b of state.batteries) {
    if (!b.alive || b.team === p.team) continue;
    const d = dist(p.x, p.z, b.x, b.z);
    if (d < batD) { bat = b; batD = d; }
  }
  if (bat && p.role !== 'torpedo') return { battery: bat };

  // And nothing ashore either: up after the heavies.
  //
  // Every kind goes, not just the fighters. A dive bomber with her bomb still
  // on the rack has guns, and a formation of bombers crossing overhead with
  // nothing else left on the board is what she has got -- which is how a
  // strike that found an empty sea ended up in the middle of somebody else's
  // bomber stream more than once.
  let heavy = null;
  let heavyD = 14000;
  for (const q of (state.bombers || [])) {
    if (!q.alive || q.team === p.team) continue;
    const d = dist(p.x, p.z, q.x, q.z);
    if (d < heavyD) { heavy = q; heavyD = d; }
  }
  if (heavy) return { heavy };
  // A torpedo bomber with nothing left but a gun position is the one flight
  // that comes home with its fish still on. She carries one weapon and it does
  // not work on concrete, and sending her in to strafe an emplacement with two
  // rifle-calibre guns is a way of losing a torpedo bomber for nothing.
  return null;
}

/**
 * A gun position taking damage from the air, and going quiet when it has had
 * enough.
 *
 * The same two lines were written out in four places -- a strafing burst, a
 * shell, a bomb in the ground beside it, a bomb on top of it -- and every one
 * of them had to remember to raise the event that tells the battle a battery
 * has stopped firing.
 */
function hurtBattery(state, bat, damage) {
  if (!bat.alive) return;
  bat.hp -= damage;
  if (bat.hp > 0) return;
  bat.hp = 0;
  bat.alive = false;
  state.events.push({ e: 'batterySilenced', x: bat.x, y: bat.y, z: bat.z, id: bat.id });
}

// ---------------------------------------------------------------------------
// Flying an aeroplane into a ship
// ---------------------------------------------------------------------------
//
// A loaded strike aircraft is four or five tons doing a hundred and thirty
// metres a second, and what that does to a ship is not nothing: it is roughly
// a very large shell that arrives sideways, spreads its fuel over whatever it
// lands on and sets fire to it. If she still has her bomb or her fish on the
// rack, that goes off with her.
//
// So the rule is simply that an aeroplane in the same piece of air as a ship
// has hit her. There is no special key for it and there does not need to be:
// the pilot flies into the ship, and the reason it was not possible before is
// that nothing ever asked the question.

/** What the airframe alone is worth, by what sort of aeroplane it is. */
const RAM_MASS = { fighter: 2600, dive: 3900, torpedo: 4600, scout: 3000 };

/**
 * Is this flight inside that ship?
 *
 * Her box, and her air draft -- from a little under the waterline, so a machine
 * that goes in at wave height hits her side rather than passing under her, up
 * to the top of her upperworks.
 */
function planeInShip(p, s, cls) {
  const halfLen = cls.hull.length * 0.5;
  const halfBeam = cls.hull.beam * 0.5;
  if (!pointInBox(p.x, p.z, s.x, s.z, s.heading, halfLen + 6, halfBeam + 5)) return false;
  const top = 16 + cls.hull.superstructure * 14;
  return (p.y ?? 220) <= top && (p.y ?? 220) >= -3;
}

/**
 * One machine of a flight into a ship.
 *
 * What she does is decided by three things and they are all physical: how much
 * aeroplane arrived and how fast, whether she was still carrying anything, and
 * where on the ship she hit. High on the upperworks is a fire and a wrecked
 * mounting; low on the side at the waterline is a hole in her and the sea
 * coming in.
 */
function ramShip(state, p, s, cls) {
  const owner = state.ships.find((q) => q.id === p.owner) || null;
  // Where she hit, in the ship's own frame.
  const l = worldToLocal(p.x - s.x, p.z - s.z, s.heading);
  const where = sectionAt(l.z / (cls.hull.length * 0.5),
    (p.y ?? 0) > 12 ? 'superstructure' : 'belt');
  const side = l.x >= 0 ? 1 : -1;
  const speed = Math.max(40, p.speed || 110);

  // The airframe. Energy goes as the square of the speed, and this is scaled
  // so that a torpedo bomber at cruise is worth about a heavy shell.
  const mass = RAM_MASS[p.role] || RAM_MASS.scout;
  let dmg = mass * (speed / 110) * (speed / 110);
  let kind = 'ram';

  // And what she still had on the rack. A machine that has dropped is an
  // empty airframe and a fire; one that has not is a bomb with a pilot.
  const P = shipClass(owner || s).planes;
  const armed = !p.dropped && ((p.bomb ?? 0) > 0 || (p.torp ?? 0) > 0);
  if (armed && P) {
    if ((p.torp ?? 0) > 0) {
      dmg += (P.torpDamage ?? 9000) * 0.8;
      kind = 'ramTorp';
    } else {
      dmg += (P.bombDamage ?? 4000) * 0.9;
      kind = 'ramBomb';
    }
  }

  damageShip(state, s, owner, dmg, armed ? 'bomb' : 'he', where);
  s.sections[where].pens++;
  // Everything standing about where she came in. A burst this size on a boat
  // deck takes the mountings with it.
  wreckContents(state, s, (p.y ?? 0) > 12 ? 'works' : where,
    armed ? 0.42 : 0.26, armed ? 'bomb' : 'he',
    { x: l.x, y: p.y ?? 0, z: l.z });

  // The sea. A strike at or below her waterline opens her, and an armed one
  // opens her a long way down -- which is the difference between a fire to put
  // out and a compartment to counterflood.
  const y = p.y ?? 0;
  if (y < 9) {
    const area = (armed ? 9 : 3) + state.rng() * (armed ? 9 : 5);
    const deep = y < 1
      ? cls.hull.draft * (0.35 + state.rng() * 0.45)
      : Math.max(0.5, cls.hull.draft * 0.2 * state.rng());
    openHull(state, s, where, area, side, deep);
  }
  // And the fuel. There is always a fire: that is what an aeroplane is mostly
  // made of once the tanks go.
  startFire(state, s, where, armed ? 0.9 : 0.6);

  state.events.push({
    e: 'ram', ship: s.id, team: p.team, i: p.id,
    x: r(p.x), y: r(y), z: r(p.z), h: r(p.heading),
    armed: armed ? 1 : 0, dmg: Math.round(dmg),
  });

  // The machine that did it. One aeroplane, not the flight -- the rest of the
  // formation flies on, which is what happened.
  const live = (p.machines || []).filter((a) => a.alive && !a.left);
  if (live.length) losePlane(state, p, live[0], 'rammed');
  if (!live.length || live.length === 1) {
    p.hp = 0;
    killFlight(state, p, 'rammed');
  } else {
    // She was carrying it and she is gone: what is left of the flight has
    // nothing to drop either, because the one that hit is the one that had it.
    p.dropped = p.dropped || armed;
    const fs = flightState(p.machines);
    p.wear = fs;
    p.count = fs.count;
  }
  return true;
}

/**
 * Is this flight finished?
 *
 * The last machine of her, and that machine going down: burning through,
 * structure open, or an engine and a wing both gone. Not merely hurt -- a
 * flight with two machines left has somebody to get home, and a crippled
 * aeroplane very often does get home.
 */
function dyingFlight(p) {
  const live = (p.machines || []).filter((a) => a.alive && !a.left);
  if (live.length !== 1) return false;
  return airframeState(live[0]).doomed;
}

/** The nearest enemy hull, for a pilot with one decision left to make. */
function nearestEnemyShip(state, p) {
  let best = null;
  let bestD = 14000;
  for (const s of state.ships) {
    if (!s.alive || s.team === p.team) continue;
    const d = dist(p.x, p.z, s.x, s.z);
    if (d < bestD) { best = s; bestD = d; }
  }
  return best;
}

/**
 * Anything flown into anything, this tick.
 *
 * Only a flight that is actually low enough to be inside a hull, and only
 * against the other side -- a pilot cannot ram his own fleet, which is the one
 * piece of protection this needs. Ships first, then the ground: an aeroplane
 * flown into a hillside is a hole in the hillside.
 */
function stepRam(state, p) {
  if (p.dead) return false;
  for (const s of state.ships) {
    if (!s.alive || s.team === p.team) continue;
    const cls = getClass(s.classId);
    if (!planeInShip(p, s, cls)) continue;
    return ramShip(state, p, s, cls);
  }
  // Into the ground, or into the sea. A flight flown into a hillside digs a
  // crater in it the same way a bomb does.
  const y = p.y ?? 220;
  const g = y <= landCeiling(state.world) ? groundHeight(state.world, p.x, p.z) : 0;
  if (y <= Math.max(0, g)) {
    if (g > 0.5) landStrike(state, p.x, p.z, (p.dropped ? 0.26 : 0.42), 'crash');
    state.events.push({
      e: 'planeCrash', i: p.id, team: p.team, x: r(p.x), z: r(p.z), y: r(Math.max(0, g)),
    });
    const live = (p.machines || []).filter((a) => a.alive && !a.left);
    if (live.length) losePlane(state, p, live[0], 'crashed');
    if (live.length <= 1) { p.hp = 0; killFlight(state, p, 'crashed'); } else {
      const fs = flightState(p.machines);
      p.wear = fs;
      p.count = fs.count;
    }
    return true;
  }
  return false;
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
      // A boat that is down has her flak under water with everything else, and
      // an aeroplane overhead has nothing whatever to fear from her.
      if (gunsDrowned(s)) continue;
      const scls = getClass(s.classId);
      if (!scls.aa) continue;
      const d = dist(p.x, p.z, s.x, s.z);
      if (d >= scls.aa.range) continue;
      const bear = aaBearing(scls, s, p.x, p.z, p.y);
      if (bear.barrels === 0) continue;
      hurtFlight(state, p, scls.aa.dps * bear.share * dt * aaBite(d, scls.aa.range));
      // And what a pair of hands on one mounting is worth.
      //
      // A close-range mounting fires itself: there is no moment at which a
      // Bofors gunner decides to shoot, only the moment he stops. What he does
      // is lay it -- and a gunner walking his own tracer onto an aeroplane
      // hits it far more often than a director firing a barrage does, which is
      // exactly why they were hand-worked to the end of the war. So a mounting
      // somebody has gone down to is worth this much again, and only against
      // whatever he is actually holding it on.
      if (s.manned && s.manned.k === 'aa') {
        const off = Math.abs(angleDelta(
          headingTo(s.x, s.z, p.x, p.z), headingTo(s.x, s.z, s.manX, s.manZ)));
        // Within a few degrees of his line, and inside the range of the
        // mounting he is standing at.
        if (off < 0.10) {
          hurtFlight(state, p,
            scls.aa.dps * MANNED_AA * dt * aaBite(d, scls.aa.range), 'flak');
          s.aaFire = Math.min(s.aaFire, 0.02);
        }
      }
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

    // The last thing a pilot who is not getting home does with his aeroplane.
    //
    // Empty, shot to pieces and going down anyway: there is nothing left to
    // fly her back for and the airframe is still four tons at two hundred
    // knots. She picks the nearest enemy hull and goes into it.
    //
    // The other half of the same decision is the one that happens far more
    // often, and it was always here: empty and whole, she turns for her deck
    // to be struck below and rearmed. What was missing is that a machine with
    // nothing left to drop and no future used to fly home to a carrier she was
    // never going to reach, and go in the sea halfway.
    //
    // Before she is steered rather than after, because the phase is what
    // decides where she is pointed and how high she wants to be.
    if (!p.flown && p.phase !== 'ram' && p.dropped && dyingFlight(p)) {
      const mark = nearestEnemyShip(state, p);
      if (mark) {
        p.phase = 'ram';
        p.targetId = mark.id;
        p.targetAir = 0; p.targetHeavy = 0; p.targetBat = 0;
        state.events.push({
          e: 'goingIn', i: p.id, team: p.team, ship: mark.id,
          x: r(p.x), z: r(p.z),
        });
      }
    }
    if (p.phase === 'ram') {
      const mark = state.ships.find((q) => q.id === p.targetId && q.alive);
      // She went down before the aeroplane got there. Nothing else to do with
      // what is left but look for another.
      if (!mark) { p.targetId = 0; p.phase = 'return'; } else {
        // Straight at her, and she flies herself: she is not keeping station,
        // not forming up and not going home.
        p.tx = mark.x; p.tz = mark.z;
        p.lead = p.id;
      }
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
      if (want && want.battery) {
        p.targetBat = want.battery.id;
        p.targetAir = 0; p.targetId = 0; p.targetHeavy = 0;
        p.tx = want.battery.x; p.tz = want.battery.z;
      } else if (want && want.escort) {
        // Her station on the strike: up-sun and astern of it, weaving, so she
        // has the height to come down on anything that comes at it.
        p.targetAir = 0; p.targetId = 0; p.targetHeavy = 0; p.targetBat = 0;
        const w = Math.sin(p.life * 0.11) * 900;
        p.tx = want.escort.x + w;
        p.tz = want.escort.z + Math.cos(p.life * 0.11) * 900;
      } else if (want && want.air) {
        p.targetAir = want.air.id; p.targetId = 0; p.targetHeavy = 0; p.targetBat = 0;
        p.tx = want.air.x; p.tz = want.air.z;
      } else if (want && want.heavy) {
        p.targetHeavy = want.heavy.id; p.targetAir = 0; p.targetId = 0; p.targetBat = 0;
        p.tx = want.heavy.x; p.tz = want.heavy.z;
      } else if (want && want.ship) {
        p.targetId = want.ship.id; p.targetAir = 0; p.targetHeavy = 0; p.targetBat = 0;
        p.tx = want.ship.x; p.tz = want.ship.z;
      }
    }
    // And she follows it: a ship under way is not where she was two seconds ago.
    if (p.phase === 'outbound') {
      const mark = p.targetAir
        ? state.planes.find((q) => q.id === p.targetAir)
        : p.targetHeavy
          ? (state.bombers || []).find((q) => q.id === p.targetHeavy && q.alive)
          : p.targetBat
            ? state.batteries.find((q) => q.id === p.targetBat && q.alive)
            : state.ships.find((q) => q.id === p.targetId && q.alive);
      if (mark) { p.tx = mark.x; p.tz = mark.z; }
      else if (p.targetAir || p.targetId || p.targetHeavy || p.targetBat) {
        p.targetAir = 0; p.targetId = 0; p.targetHeavy = 0; p.targetBat = 0;
        p.hunt = 0;
      }
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

    // And whether she has flown into anything. This is after the movement and
    // before everything else she might do this tick, because an aeroplane
    // inside a ship has finished doing things.
    if (stepRam(state, p)) { if (!p.dead) out.push(p); continue; }

    if (p.flown) { out.push(p); continue; }

    // Going in on a formation of heavies. Any kind does this, not the fighters
    // alone: it is a firing pass with whatever guns she has, and a dive bomber
    // with her bomb still on the rack has guns. Her own side's staff sends the
    // fighters after a bomber stream first, but a strike that found an empty
    // sea and went up after one instead is a thing that happened.
    if (p.phase === 'outbound' && p.targetHeavy) {
      const heavy = (state.bombers || []).find((q) => q.id === p.targetHeavy && q.alive);
      // Gun range is gun range, and it is measured along the line of sight.
      // It used to be five hundred metres across the water and seven hundred
      // up and down, which let a fighter still two thousand feet below the
      // stream open fire on it -- and, worse, let thirteen turrets answer her
      // from a range at which she could not have hit a barn. She now has to
      // climb into the stream before either of them can do anything, which is
      // the whole reason she was sent up.
      const slant = heavy ? Math.hypot(
        dist(p.x, p.z, heavy.x, heavy.z), (p.y ?? 0) - heavy.y,
      ) : Infinity;
      if (heavy && slant < 520) {
        // What her guns are worth against an aeroplane, and what a fighter's
        // are worth is a good deal more than a torpedo bomber's two.
        const bite = (P.fighterGuns ?? FIGHTER_GUNS)
          * (p.role === 'fighter' ? 0.9 : 0.35);
        hurtBomber(state, heavy, bite * p.count * dt, 'fighters');
        // And the formation shoots back, turret by turret. A Lancaster's eight
        // guns and a Fortress's thirteen are the reason a bomber stream was
        // attacked and not simply shot down.
        const b = BOMBERS[heavy.bomberId] || BOMBERS.lancaster;
        hurtFlight(state, p, b.guns * heavy.count * 3.4 * dt, 'gunners');
        gunsSeen(state, p, heavy.x, heavy.z, true);
        out.push(p);
        continue;
      }
    }

    // A gun position, worked over from the air.
    //
    // A battery cannot steam out of the way, which is the one thing that makes
    // it worth a squadron's time -- and it is dug in behind concrete, which is
    // why it takes a bomb to do anything to it and a burst of rifle calibre
    // does very nearly nothing. A torpedo bomber has nothing useful at all to
    // put on one and never picks one; if she ends up over one anyway she
    // strafes it like everybody else.
    if (p.phase === 'outbound' && p.targetBat) {
      const bat = state.batteries.find((q) => q.id === p.targetBat && q.alive);
      if (bat && dist(p.x, p.z, bat.x, bat.z) < 300) {
        if (p.bomb > 0) {
          // Her bombs, in the earth around the emplacement. Whether each one
          // is near enough to matter is the same die roll a bomb on a ship
          // goes through, and the damage is what a bomb does to works rather
          // than what it does to a deck.
          const each = (P.bombDamage ?? 3000) * 0.5;
          for (let i = 0; i < p.bomb; i++) {
            if (state.rng() > (P.bombHit ?? 0.4) * ((p.wear && p.wear.aim) ?? 1)) continue;
            hurtBattery(state, bat, each);
          }
          state.events.push({
            e: 'bomb', team: p.team, i: p.id, x: p.x, z: p.z,
            tx: bat.x, tz: bat.z, hit: 1,
          });
        } else {
          hurtBattery(state, bat, (P.strafeDamage ?? 260) * p.count * 0.25);
        }
        state.events.push({ e: 'airDrop', x: p.x, z: p.z, r: p.role });
        gunsSeen(state, p, bat.x, bat.z, false);
        p.phase = 'return';
        out.push(p);
        continue;
      }
    }

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
      } else if (p.life > (p.orderEscort && strikeMark(state, p)
        ? 420 : p.targetHeavy ? 480 : 260)) {
        // Out of patrol endurance. It used to be a hundred and fifty seconds,
        // which was most of a sortie once a strike started spending a minute
        // forming up over the ship: the escort turned for home about the time
        // it found anything to fight. An escort with a strike still out stays
        // with it longer again -- the one thing an escort must not do is turn
        // for home while the thing it is escorting is still over the target.
        //
        // And a fighter climbing to a bomber stream is given longer still,
        // because that climb is most of the sortie: ten thousand feet from the
        // deck is four or five minutes of it, and on patrol endurance she
        // turned for home at two thousand metres having never got within reach
        // of the thing she was sent up for.
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
export function hurtFlight(state, p, damage, why = 'flak') {
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
    // A flight that has already decided to go into a ship is not turned for
    // home here. This runs every tick, so without the second test it put her
    // back on `return` a hundred times a second and she flew a sawtooth
    // between the enemy and a deck she was not going to reach.
    if (p.phase !== 'return' && p.phase !== 'ram') {
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

// ---------------------------------------------------------------------------
// The heavy squadrons
// ---------------------------------------------------------------------------
//
// A bomber formation is not a carrier's flight and is not modelled as one. She
// does not come off anybody's deck, she does not come back to it, she flies at
// a height nothing else in the battle flies at, and what she does over the
// target is the one thing a carrier aeroplane never does: she flies straight
// and level through everything the defence has, because the whole of level
// bombing is holding the course while the sight runs.
//
// So she is her own entity with her own step. What she shares with everything
// else is the shell pipeline: a bomb let go from fifteen thousand feet is a
// body under gravity with a forward throw, and `state.shells` already flies
// one of those, samples it against hulls and gun pits so it cannot tunnel
// through them, and puts it in the sea or in the ground at the end. A bomb is
// a shell with `bomb` written on it.

/**
 * The height a heavy squadron works at: five thousand feet, for everybody.
 *
 * This is a long way below where they really bombed from -- fifteen to
 * twenty-five thousand, and chosen for the one reason that mattered at the
 * time, to be above the flak. Five thousand is under it.
 *
 * Which is the point. At this height everything can reach her: a ship's whole
 * close-range battery bears, not just the heavy mountings, and a fleet's
 * fighters are at her altitude within a minute of taking off instead of
 * spending the whole sortie climbing. She is in the battle rather than over
 * it, and her bombing is better for being lower -- the aimer's error grows
 * with height, so a stick from five thousand feet is worth twice one from ten.
 *
 * She pays for all of it in the one currency a bomber has, which is losses.
 */
export function bombAlt() {
  return 5000 * 0.3048;
}

/** The same height as a number, for the yard scene and anything measuring. */
export const BOMB_ALT = 1524;

/** What one machine of a heavy formation can absorb before she goes down. */
const HEAVY_HP = 420;

/** How many aeroplanes fly in one formation -- a vic, which is what they flew. */
export const HEAVY_VIC = 3;

/**
 * Where a stick has to be let go to arrive on the aim point.
 *
 * A bomb released at height keeps the aeroplane's speed, so it travels
 * forward while it falls. From four thousand feet at two hundred miles an hour
 * that is the better part of a mile, and it is the whole reason a bombing run
 * is flown at the target from a long way out rather than over it.
 */
export function bombThrow(alt, speed) {
  return Math.sqrt(Math.max(0, 2 * alt) / 9.81) * speed;
}

/**
 * A squadron of heavies, on the course her commander gave her.
 *
 * `at` is where she comes on to the battlefield and which way she is heading,
 * off the order-of-battle chart. Everything after that she decides for herself
 * or is told by her side's staff, and neither of those goes on the wire.
 */
export function addBomber(state, { id, bomberId, team, x = 0, z = 0, heading = 0,
  count = HEAVY_VIC }) {
  const b = BOMBERS[bomberId] || BOMBERS.lancaster;
  const n = Math.max(1, Math.min(9, Math.round(count)));
  const bm = {
    id: id ?? eid(),
    bomberId,
    team,
    name: b.name,
    x, y: bombAlt(b), z,
    heading,
    turn: 0,
    // Her cruising speed, off her own datasheet. Miles an hour is how a bomber
    // was quoted and metres a second is how the world is measured.
    speed: b.cruise * 0.44704,
    count: n,
    hp: n * HEAVY_HP,
    maxHp: n * HEAVY_HP,
    // How many times she can lay a stick. Two runs and she is out of bombs and
    // goes home, which is what an aeroplane with a finite bomb bay does.
    loads: 2,
    stick: 0,
    stickT: 0,
    // The aeroplanes themselves, each with her own engine, tanks, wings, tail,
    // crew and body -- the same airframe model a carrier flight is built out
    // of, so a formation is not a hit-point bar with a number written on it
    // and a captain flying one gets the same damage board a pilot gets. See
    // airframe.js.
    perHp: HEAVY_HP,
    machines: Array.from({ length: n }, () => freshAirframe(HEAVY_HP)),
    wear: { speed: 1, turn: 1, aim: 1, count: n },
    // Set while somebody is flying her by hand; see flyBomber.
    flown: false, flownAt: 0, pilot: 0,
    phase: 'inbound',
    // Her orders. The staff writes these and nothing else reads them: they are
    // never put in a snapshot, because a plan the enemy can read is not a plan.
    aimX: 0, aimZ: 0, targetId: 0, hold: 0,
    alive: true,
    life: 0,
    spottedBy: [false, false],
  };
  state.bombers.push(bm);
  return bm;
}

/** What her bombs do, off her own datasheet rather than off a carrier's. */
function heavyLoad(bm) {
  const b = BOMBERS[bm.bomberId] || BOMBERS.lancaster;
  // Pounds of bombs, spread over the stick she lays. A Lancaster's fourteen
  // thousand goes down as a cookie and a dozen incendiary containers; what
  // matters here is that each body that arrives is worth what a bomb of that
  // weight was worth.
  const each = b.payload / 8;
  return {
    n: 8,
    bombDamage: 700 + each * 3.4,
    bombPen: 30 + each * 0.035,
    bombBore: 0.20 + each * 0.00012,
    bombFire: 0.34,
    caliber: Math.round(180 + each * 0.10),
  };
}

/**
 * Her own judgement, when nobody has given her a target.
 *
 * A heavy bomber's business is the biggest thing on the other side that cannot
 * get out of the way: a carrier first, then whatever is heaviest, and a coast
 * battery if there is nothing afloat worth the trip.
 */
function heavyPicksTarget(state, bm) {
  let best = null;
  let score = -Infinity;
  for (const s of state.ships) {
    if (!s.alive || s.team === bm.team) continue;
    const cls = getClass(s.classId);
    const v = (cls.type === 'CV' ? 260 : cls.hull.length)
      - dist(bm.x, bm.z, s.x, s.z) * 0.004;
    if (v > score) { score = v; best = { x: s.x, z: s.z, id: s.id }; }
  }
  if (best) return best;
  for (const b of state.batteries) {
    if (!b.alive || b.team === bm.team) continue;
    const v = -dist(bm.x, bm.z, b.x, b.z);
    if (v > score) { score = v; best = { x: b.x, z: b.z, id: 0 }; }
  }
  return best;
}

/**
 * How far out the bomb aimer is, for this run.
 *
 * Level bombing from four thousand feet at a warship under helm was very
 * nearly useless, and that is not a limitation to hide -- it is the reason
 * heavies were sent against harbours, factories and gun positions and carrier
 * aeroplanes were sent against ships. The error is set once for the whole
 * stick, because it is one man's sighting and it is wrong in one direction;
 * what makes a stick a stick is that it is long enough to straddle in spite of
 * him. A target that is moving is very much harder than one that is not, and
 * there is nothing the aimer can do about that at all.
 */
function aimError(state, bm) {
  const t = bm.targetId ? state.ships.find((q) => q.id === bm.targetId) : null;
  const moving = t ? t.speed : 0;
  // A height error and a tracking error, added. The second one is the one that
  // matters and the one a ship's captain earns by keeping his speed on.
  const sd = 55 + bm.y * 0.028 + moving * 18;
  return { x: gauss(state.rng) * sd, z: gauss(state.rng) * sd };
}

/** Let one bomb of the stick go, as a body under gravity with her speed on it. */
function dropBomb(state, bm, L) {
  const sn = Math.sin(bm.heading);
  const cs = Math.cos(bm.heading);
  // A stick is laid along the run, not dropped in a heap: each one leaves a
  // fraction of a second after the last and lands that much further on.
  // The aimer's error for this run, and a little dispersion on each body --
  // no two bombs of a stick fall in the same place.
  const e = bm.err || { x: 0, z: 0 };
  const sx = gauss(state.rng) * 26;
  const sz = gauss(state.rng) * 26;
  fireShell(state, {
    id: eid(), owner: 0, bomber: bm.id, team: bm.team,
    x: bm.x + e.x + sx, y: bm.y, z: bm.z + e.z + sz,
    vx: sn * bm.speed, vy: 0, vz: cs * bm.speed,
    g: 9.81,
    caliber: L.caliber,
    // What tells the shell pipeline this is a bomb rather than a round of
    // gunfire: it beats a deck rather than a belt, and it digs a bomb's hole
    // in the ground rather than a shell's.
    bomb: { bombDamage: L.bombDamage, bombPen: L.bombPen, bombBore: L.bombBore,
      bombFire: L.bombFire },
    life: 0, type: 'he',
  });
}

/**
 * What the defence is doing to her.
 *
 * Heavy anti-aircraft fire and nothing else: at four thousand feet she is out
 * of reach of everything light, which is exactly why she is up there. A ship's
 * close-range battery cannot touch her and her own guns cannot touch the ship;
 * the long-range mountings and the coast guns laid for aircraft can, and the
 * higher she is the worse their answer is.
 */
/**
 * How much of a ship's anti-aircraft fire can reach a formation up here.
 *
 * At ten thousand feet the close-range battery is out of it entirely. A Bofors
 * reaches three and a half thousand metres and an Oerlikon under two, and
 * those are the guns that make up nearly all of a ship's barrels and nearly
 * all of the one `dps` figure that used to stand for the whole of her flak --
 * so multiplying that figure by a height factor had a hundred and fifty
 * twenty-millimetre barrels shooting at something none of them could see the
 * point of. What is left up there is the dual-purpose battery: an Iowa's
 * five-inch, a Yamato's twelve-seven, firing time-fused shell at a formation
 * flying straight and level.
 *
 * The share is worked out in barrels, off each gun's own reach against the
 * slant range, so it falls away on its own as the formation moves off the
 * beam and is nothing at all for a destroyer with no heavy mountings aboard.
 */
export function highBattery(cls, slant) {
  const count = (mounts) => (mounts || []).reduce((n, m) => n + (m.guns || 1), 0);
  let reach = 0;
  let all = 0;
  for (const g of (cls.aa && cls.aa.guns) || []) {
    const n = count(g.mounts);
    all += n;
    if (g.range >= slant) reach += n;
  }
  // Her secondary, when it is a dual-purpose battery. It is not in the
  // close-range guns at all and on most of these ships it is the only thing
  // aboard that can be laid this high.
  const sec = cls.secondary;
  if (sec && (sec.role === 'dp' || sec.role === 'aa')) {
    const n = count(sec.mounts);
    all += n;
    if (sec.range >= slant) reach += n;
  }
  return all > 0 ? reach / all : 0;
}

function heavyFlak(state, bm, dt) {
  let taken = 0;
  for (const s of state.ships) {
    if (!s.alive || s.team === bm.team) continue;
    const cls = getClass(s.classId);
    if (!cls.aa) continue;
    const d = dist(bm.x, bm.z, s.x, s.z);
    // Slant range, and only the long-range mountings reach this high.
    const slant = Math.hypot(d, bm.y);
    if (slant > cls.aa.range) continue;
    // And how much of her battery that actually is.
    const share = highBattery(cls, slant);
    if (share <= 0) continue;
    // What is left of her fire once the guns that cannot reach are taken out
    // of it, and then a good deal off that again: this is fire against a
    // formation holding course through it, which historically took thousands
    // of rounds for every aeroplane it brought down.
    //
    // The constant is what makes five thousand feet a place a squadron can
    // work from at all. Up at ten only the heavy mountings could reach and the
    // share did most of the work; down here the whole close-range battery
    // bears, the share is very nearly one, and a third of a battleship's `dps`
    // put a vic of three into the sea before it could open its doors. A
    // fifteenth of it is a squadron that gets its bombs away over a single
    // ship and expects to lose one of its three doing it, and is cut to pieces
    // over a fleet -- which is exactly the arithmetic that made everybody bomb
    // from twenty thousand instead.
    taken += cls.aa.dps * share * 0.065 * aaBite(slant, cls.aa.range) * dt;
    // And a pair of hands on one mounting, laid on the formation. The same
    // thing a gunner is worth against a torpedo bomber coming in low: a man
    // walking his own tracer onto something hits it far more often than a
    // director firing a barrage does, and a formation holding straight and
    // level through a run is the easiest thing he will ever be given.
    if (s.manned && s.manned.k === 'aa' && !gunsDrowned(s)) {
      const off = Math.abs(angleDelta(
        headingTo(s.x, s.z, bm.x, bm.z), headingTo(s.x, s.z, s.manX, s.manZ)));
      if (off < 0.10) {
        taken += cls.aa.dps * MANNED_AA * share * 0.065
          * aaBite(slant, cls.aa.range) * dt;
        s.aaFire = Math.min(s.aaFire, 0.02);
      }
    }
    // The tracer going up, on the gun's own rhythm rather than every tick.
    s.aaFire -= dt;
    if (s.aaFire <= 0) {
      // A rough count of what is up: the share of the battery that reaches,
      // over the whole of it. Far enough out that it is the heavy dual-purpose
      // mountings doing the shooting, never the automatic guns.
      s.aaFire = 0.30;
      state.events.push({
        e: 'aa', ship: s.id, x: r(s.x), z: r(s.z),
        tx: r(bm.x), tz: r(bm.z), n: Math.max(1, Math.round(share * 12)),
        cal: 127,
      });
    }
    s.spottedBy[bm.team] = true;
  }
  for (const bat of state.batteries) {
    if (!bat.alive || bat.team === bm.team) continue;
    const spec = BATTERIES[bat.batteryId];
    if (!spec || (spec.targets !== 'aircraft' && spec.targets !== 'dual')) continue;
    if (!spec.ceiling || bm.y > spec.ceiling) continue;
    const d = dist(bm.x, bm.z, bat.x, bat.z);
    if (d > spec.range * 0.55) continue;
    // A heavy flak battery is the thing that actually brings these down: one
    // eighty-eight firing ten rounds a minute into a formation flying straight
    // and level is a different proposition from a ship's close-range guns.
    //
    // It is still not quick. A battery firing into a stream for an hour got a
    // handful, and the rate here is set so that a vic that presses one run all
    // the way home through a battery's envelope expects to lose one of its
    // three -- which is a bad night for a squadron and nothing like the
    // certain destruction a tenth of a second's arithmetic used to give it.
    taken += (2400 / Math.max(1, spec.reload)) * 0.014 * aaBite(d, spec.range * 0.55) * dt;
    bat.firingAt = state.t;
  }
  if (taken > 0) hurtBomber(state, bm, taken, 'flak');
}

/**
 * What the last second did to a formation: fires burning through, tanks
 * running out, and the machines that can no longer keep station falling out.
 *
 * The same pass a flight gets, and for the same reason: most of what brings a
 * bomber down happens after the burst that did it. What is different is what
 * a cripple does. A carrier aeroplane turns for her deck; a heavy has no deck
 * within reach, so she falls out of the formation and goes home on her own,
 * and the formation flies on without her -- which is exactly the picture of a
 * bomber stream that anybody who watched one remembers.
 */
function heavyDamage(state, bm, dt) {
  if (!bm.machines || !bm.machines.length) return;
  for (const a of bm.machines) {
    if (!a.alive || a.left) continue;
    const end = stepAirframe(a, dt, state.rng());
    if (end) {
      a.alive = false;
      a.gone = true;
      state.events.push({
        e: 'bomberDown', i: bm.id, tm: bm.team, x: r(bm.x), y: r(bm.y), z: r(bm.z), why: end,
      });
    }
  }
  for (;;) {
    const live = bm.machines.filter((a) => a.alive && !a.left);
    const bad = live.find((a) => airframeState(a).crippled);
    if (!bad) break;
    // The last of her cannot fall out of a formation of one: she turns for
    // home with whatever she has left, and can still be shot at all the way.
    // She is not reported as lost, because she has not been lost -- and
    // reporting her used to happen on every tick from here to the edge of the
    // battlefield, because she was found crippled again the instant she was
    // put back in the formation. One squadron of three sent a hundred and ten
    // machines down.
    if (live.length === 1) {
      if (bm.phase !== 'home') { bm.phase = 'home'; bm.loads = 0; }
      break;
    }
    bad.left = true;
    state.events.push({
      e: 'bomberDown', i: bm.id, tm: bm.team, x: r(bm.x), y: r(bm.y), z: r(bm.z),
      why: 'crippled',
    });
  }
  const fs = flightState(bm.machines);
  bm.wear = fs;
  bm.count = fs.count;
  let hp = 0;
  for (const a of bm.machines) if (a.alive && !a.left) hp += airframeHp(a) * HEAVY_HP;
  bm.hp = hp;
  if (bm.count <= 0) {
    bm.alive = false;
    bm.hp = 0;
    state.events.push({ e: 'bomberOut', i: bm.id, tm: bm.team, x: r(bm.x), z: r(bm.z) });
  }
}

/**
 * A formation somebody is flying by hand.
 *
 * The same bargain a flight's pilot gets, for the same reason: nobody flies an
 * aeroplane through fifteen snapshots a second of somebody else's autopilot.
 * The client that has taken her says where she is and the simulation stops
 * steering her -- and goes on doing everything else to her, because the flak,
 * the fighters, her fires and her fuel are none of the pilot's business.
 *
 * The checks are the point. Her own side only, only while she is up, and only
 * from somewhere she could actually have got to since the last word.
 */
export function flyBomber(state, ship, msg) {
  if (!ship || !ship.alive) return false;
  const bm = (state.bombers || []).find((q) => q.id === msg.i && q.alive);
  if (!bm) return false;
  if (bm.team !== ship.team) return false;
  if (bm.pilot && bm.pilot !== ship.id
    && state.t - (bm.flownAt ?? -1e9) <= PILOT_HOLD) return false;
  if (!Number.isFinite(msg.x) || !Number.isFinite(msg.z) || !Number.isFinite(msg.h)) return false;
  const since = Math.max(0.05, Math.min(2, state.t - (bm.flownAt ?? state.t)));
  // A heavy at her best speed in a dive, with room for a slow line.
  const reach = bm.speed * 2.4 * since + 80;
  if (dist(bm.x, bm.z, msg.x, msg.z) > reach) return false;
  bm.x = msg.x;
  bm.z = msg.z;
  bm.heading = wrapAngle(msg.h);
  if (Number.isFinite(msg.tn)) bm.turn = clamp(msg.tn, -1, 1);
  if (Number.isFinite(msg.y)) {
    const climb = 120 * since + 60;
    bm.y = clamp(msg.y, Math.max(20, bm.y - climb), Math.min(12000, bm.y + climb));
  }
  bm.flown = true;
  bm.flownAt = state.t;
  bm.pilot = ship.id;
  // Under a hand on the stick she is not running her own bombing problem.
  bm.targetId = 0;
  return true;
}

/**
 * Let the stick go, because the man in the nose said so.
 *
 * The aimer's error is the same error the squadron would have had: a captain
 * who flies her over the target himself gets a better run than a staff order
 * because he can see what he is doing, not because the bombsight got better.
 * Returns false, with a reason, when there was nothing to drop.
 */
export function dropStick(state, ship, id) {
  const bm = (state.bombers || []).find((q) => q.id === id && q.alive);
  if (!bm || !ship || bm.team !== ship.team) return false;
  if (bm.loads <= 0) return false;
  if (bm.phase === 'run' || bm.stick > 0) return false;
  const L = heavyLoad(bm);
  bm.phase = 'run';
  bm.stick = L.n;
  bm.stickT = 0;
  bm.err = aimError(state, bm);
  return true;
}

/**
 * A turret on a heavy, fired by the man sitting in it.
 *
 * Her defensive fire is otherwise worked out in the aggregate -- so many guns
 * times so many machines, poured into whatever fighter is pressing the attack
 * -- and that is the right answer for a formation nobody is in. A gunner who
 * has gone to a mounting himself is laying one turret at one flight, so this
 * is one turret's worth of fire, in the direction he is actually pointing, and
 * it only reaches what his mounting could actually have borne on.
 *
 * `yaw` is where he is looking relative to her nose and `arc` is his cone, so
 * a tail gunner firing forward through his own fins does nothing at all --
 * which is the point of giving a turret an arc in the first place.
 */
export function gunTurret(state, ship, id, yaw, arc, dt) {
  const bm = (state.bombers || []).find((q) => q.id === id && q.alive);
  if (!bm || !ship || bm.team !== ship.team) return false;
  const b = BOMBERS[bm.bomberId] || BOMBERS.lancaster;
  // Her own accumulator, not `gunAt` -- that one is a timestamp `gunsSeen`
  // uses to space the tracer out, and sharing it makes each of them eat the
  // other's state.
  bm.turretAt = (bm.turretAt ?? 0) + dt;
  if (bm.turretAt < 0.25) return true;
  const burst = bm.turretAt;
  bm.turretAt = 0;
  // What one mounting of hers is worth: her whole battery over the number of
  // turrets she carries, for one aeroplane rather than the formation.
  const perTurret = (b.guns || 8) / Math.max(1, b.turrets || 3);
  let best = null;
  let bestD = 900;
  for (const q of state.planes) {
    if (q.dead || q.team === bm.team) continue;
    const d = dist(bm.x, bm.z, q.x, q.z);
    if (d > bestD) continue;
    if (Math.abs((q.y ?? 0) - bm.y) > 500) continue;
    // Inside his cone, and inside it off her nose rather than off the world.
    const bear = wrapAngle(headingTo(bm.x, bm.z, q.x, q.z) - bm.heading);
    if (Math.abs(wrapAngle(bear - yaw)) > 0.35) continue;
    if (Math.abs(wrapAngle(bear - (yaw < -1.5 || yaw > 1.5 ? Math.PI : 0))) > arc) continue;
    best = q;
    bestD = d;
  }
  if (!best) return true;
  hurtFlight(state, best, perTurret * 3.4 * burst, 'gunners');
  if (best.hp <= 0) killFlight(state, best, 'gunners');
  gunsSeen(state, bm, best.x, best.z, true);
  return true;
}

/** A formation losing aeroplanes, one at a time, as it is shot about. */
export function hurtBomber(state, bm, damage, why = 'flak') {
  if (!bm.alive) return;
  // Into one machine of the formation rather than into the formation, so that
  // what a burst of flak does is break an engine or start a fire on one
  // bomber, and the rest fly on. The same routine a flight's damage goes
  // through; the only difference is that a heavy has more of everything and
  // takes longer to kill.
  const live = (bm.machines || []).filter((a) => a.alive && !a.left);
  if (live.length) {
    let a = live.includes(bm.aimed) ? bm.aimed : null;
    if (!a) a = live[Math.min(live.length - 1, Math.floor(state.rng() * live.length))];
    bm.aimed = a;
    const hit = hitAirframe(a, damage, state.rng(), state.rng());
    if (hit.lit) {
      state.events.push({ e: 'planeFire', i: bm.id, x: r(bm.x), z: r(bm.z), team: bm.team });
    }
    if (hit.down) { a.alive = false; a.gone = true; bm.aimed = null; }
    let hp = 0;
    for (const m of bm.machines) if (m.alive && !m.left) hp += airframeHp(m) * HEAVY_HP;
    bm.hp = hp;
  } else {
    bm.hp -= damage;
  }
  const left = (bm.machines || []).length
    ? bm.machines.filter((a) => a.alive && !a.left).length
    : Math.max(0, Math.ceil(bm.hp / HEAVY_HP));
  if (left < bm.count) {
    // One of them has gone. It is worth an event: a heavy going down out of a
    // formation is the most visible thing that happens over a fleet.
    for (let i = left; i < bm.count; i++) {
      state.events.push({ e: 'bomberDown', i: bm.id, tm: bm.team, x: bm.x, y: bm.y, z: bm.z, why });
    }
    bm.count = left;
  }
  if (bm.count <= 0 || bm.hp <= 0) {
    bm.alive = false;
    bm.count = 0;
  }
}

/**
 * The squadron's turn of thought, and the run.
 *
 * Four states, and they are the four a bombing run has: on passage to the
 * release point, on the run itself -- straight and level, no evasion, the one
 * time she is worth shooting at -- laying the stick, and away. She comes round
 * for a second run if she has bombs left, and goes home when she has not.
 */
/**
 * Who can see her.
 *
 * A formation of heavies at ten thousand feet is visible a very long way,
 * which is the one advantage the defence has against level bombing.
 */
function heavySeen(state, bm) {
  for (let team = 0; team < 2; team++) {
    if (team === bm.team) { bm.spottedBy[team] = true; continue; }
    let seen = false;
    for (const s of state.ships) {
      if (!s.alive || s.team !== team) continue;
      if (dist(bm.x, bm.z, s.x, s.z) < 26000) { seen = true; break; }
    }
    if (!seen) {
      for (const b of state.batteries) {
        if (!b.alive || b.team !== team) continue;
        if (dist(bm.x, bm.z, b.x, b.z) < 26000) { seen = true; break; }
      }
    }
    bm.spottedBy[team] = seen;
  }
}

function stepBombers(state, dt) {
  const out = [];
  for (const bm of state.bombers) {
    if (!bm.alive) continue;
    bm.life += dt;
    if (bm.hold > 0) bm.hold -= dt;

    const L = heavyLoad(bm);
    // Somebody is flying her.
    //
    // Then she is not running her own bombing problem: where she goes and when
    // the doors open are his, and the only thing left here is the stick going
    // down once he has called for it. If the word from his client stops coming
    // she is picked up again on the next tick and carries on to wherever the
    // staff had sent her -- the same handover a carrier flight gets.
    if (bm.flown && state.t - (bm.flownAt ?? 0) > 1.5) { bm.flown = false; bm.pilot = 0; }
    if (bm.flown) {
      if (bm.stick > 0) {
        if (bm.stickT <= 0) {
          dropBomb(state, bm, L);
          bm.stick -= 1;
          bm.stickT = 0.28;
          if (bm.stick === 0) {
            bm.loads -= 1;
            bm.phase = 'inbound';
            state.events.push({ e: 'sticksAway', i: bm.id, tm: bm.team });
          }
        }
        bm.stickT -= dt;
      }
      heavyFlak(state, bm, dt);
      heavyDamage(state, bm, dt);
      if (!bm.alive) continue;
      heavySeen(state, bm);
      out.push(bm);
      continue;
    }
    // Where she is going. Her orders if she has any, her own judgement if not.
    if (!bm.aimX && !bm.aimZ) {
      const pick = heavyPicksTarget(state, bm);
      if (pick) { bm.aimX = pick.x; bm.aimZ = pick.z; bm.targetId = pick.id; }
    }
    // A target that moves is followed: the aim point is where she is now, not
    // where she was when the staff wrote the order.
    if (bm.targetId) {
      const t = state.ships.find((s) => s.id === bm.targetId);
      if (t && t.alive) { bm.aimX = t.x; bm.aimZ = t.z; }
      else bm.targetId = 0;
    }

    const toAim = dist(bm.x, bm.z, bm.aimX, bm.aimZ);
    const throwFwd = bombThrow(bm.y, bm.speed);
    let want = bm.heading;

    if (bm.phase === 'inbound') {
      // The release point: back along the run-in bearing by the forward throw.
      want = headingTo(bm.x, bm.z, bm.aimX, bm.aimZ);
      if (toAim <= throwFwd + 140 && bm.loads > 0) {
        bm.phase = 'run';
        bm.stick = L.n;
        bm.stickT = 0;
        bm.err = aimError(state, bm);
      }
    } else if (bm.phase === 'run') {
      // Straight and level. Nothing is allowed to move her off this course --
      // this is the bombing run, and a run that jinks is a run wasted.
      if (bm.stickT <= 0 && bm.stick > 0) {
        dropBomb(state, bm, L);
        bm.stick -= 1;
        bm.stickT = 0.28;
        if (bm.stick === 0) {
          bm.loads -= 1;
          bm.phase = 'away';
          bm.aimX = 0; bm.aimZ = 0; bm.targetId = 0;
          bm.hold = 26;
          state.events.push({ e: 'sticksAway', i: bm.id, tm: bm.team });
        }
      }
      bm.stickT -= dt;
    } else {
      // Away. Hard over off the target, and out of the flak; then round again
      // if she has anything left to drop, and home if she has not.
      if (!bm.awayTo) bm.awayTo = wrapAngle(bm.heading + (state.rng() < 0.5 ? 1 : -1) * 2.3);
      want = bm.awayTo;
      if (bm.hold <= 0) {
        bm.awayTo = 0;
        if (bm.loads > 0) bm.phase = 'inbound';
        else {
          // Home. Off the edge of the battlefield, and gone.
          bm.phase = 'home';
        }
      }
    }
    if (bm.phase === 'home') {
      want = bm.heading;
      const edge = state.world.half + 3000;
      if (Math.abs(bm.x) > edge || Math.abs(bm.z) > edge) { bm.alive = false; continue; }
    }

    // Her turn, at the rate a loaded heavy can hold one: about six degrees a
    // second, which is why a formation takes a mile and a half to come round.
    const RATE = bm.phase === 'run' ? 0.02 : 0.11;
    const delta = clamp(angleDelta(bm.heading, want), -RATE * dt * 6, RATE * dt * 6);
    bm.heading = wrapAngle(bm.heading + delta);
    bm.turn = clamp(delta / Math.max(1e-6, dt) * 2.4, -1, 1);
    bm.x += Math.sin(bm.heading) * bm.speed * dt;
    bm.z += Math.cos(bm.heading) * bm.speed * dt;

    heavyFlak(state, bm, dt);
    heavyDamage(state, bm, dt);
    if (!bm.alive) continue;

    heavySeen(state, bm);

    if (bm.alive) out.push(bm);
  }
  state.bombers = out;
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

/**
 * How long a fire has to be left before it gets into something, in seconds.
 */
const COOK_OFF = 180;

/** How many compartments alight at once is a ship that is burning. */
const FIRE_STORM = 4;

/**
 * A fire that has been left alone for three minutes finds something.
 *
 * Not a magazine -- that is a shell among the charges and it ends the ship
 * (see detonate). This is the ready-use racks beside a mounting, a paint
 * store, a torpedo warhead in its tube: enough to blow a hole in her, wreck
 * whatever was standing over it and knock the fire down for a moment by
 * blowing it out, and not enough to sink her by itself. It is what a fire
 * costs when nobody goes to it.
 */
function cookOff(state, ship, where) {
  const cls = shipClass(ship);
  const c = ship.sections[where];
  if (!c) return;
  // The clock goes back, but not to nothing: a compartment that has already
  // cooked off once has less left in it to go off again.
  c.burnt = COOK_OFF * 0.45;
  damageShip(state, ship, null, cls.hp * 0.05, 'cook', where);
  if (!ship.alive) return;
  // A hole, above the waterline where the fire was rather than below it.
  openHull(state, ship, where, 3 + state.rng() * 5,
    state.rng() < 0.5 ? 1 : -1, -cls.hull.draft * 0.2);
  // And whatever was standing over it. The burst is small, so it reaches
  // about as far as a six-inch shell does.
  const at = SECTIONS.find((q) => q.k === where);
  const half = cls.hull.length / 2;
  const z = at && at.from !== null
    ? ((Math.max(-1, at.from) + Math.min(1, at.to)) / 2) * half : 0;
  const hurt = nearestMount(ship, cls, { x: 0, y: freeboardOf(cls), z });
  if (hurt && hurt.d <= burstReach('he', 0.2)) {
    hurt.m.disabled = Math.max(hurt.m.disabled || 0, 4 + state.rng() * 6);
    hurtMount(state, hurt.m, 0.6 + state.rng() * 1.5);
  }
  // The blast knocks the fire down where it happened and throws it about
  // everywhere else, which is what a burst in a burning compartment does.
  c.fire = Math.max(0, c.fire - 0.35);
  startFire(state, ship, 'works', 0.2);
  ship.fires = burningCount(ship);
  state.events.push({
    e: 'cook', ship: ship.id, at: where,
    x: r(ship.x), z: r(ship.z), cls: ship.classId,
  });
}

/**
 * What one hand-laid close-range mounting adds, as a share of her whole
 * battery's output. A fifth: enough that a gunner who lays well is worth
 * having, not so much that one man outshoots the ship.
 */
const MANNED_AA = 0.2;

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
      if (depth > 0.02) {
        c.fire = Math.max(0, c.fire - dt * 1.1 * depth);
        // Under water it is out, and the clock on it goes back to nought.
        if (c.fire <= 0) c.burnt = 0;
      }
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
  // A ship with four compartments alight at once is not four fires. It is a
  // ship that is burning, and her damage control is beaten: there are not
  // enough parties to go round and the ones there are get driven back by the
  // ones next door. Give that three minutes and something aboard goes off.
  //
  // It is the same three minutes as a single fire's, but it is one clock for
  // the whole ship rather than one for each compartment, so four fires that
  // caught a minute apart still bring it on -- which is exactly the case the
  // per-compartment clocks let through.
  //
  // Four of them is the three minutes. More than four is less than three
  // minutes, and it goes as the number alight: a ship burning in six places
  // has twice as many ways for a fire to reach something that will go off as
  // one burning in four, and she has not got the parties to be anywhere. It
  // matters that it comes down, because a ship that far gone is being killed
  // by the fires themselves inside three minutes and a rule that never has
  // time to run is not a rule.
  const alight = burningCount(ship);
  if (alight >= FIRE_STORM) ship.blaze = (ship.blaze || 0) + dt * (alight - FIRE_STORM + 1);
  else ship.blaze = Math.max(0, (ship.blaze || 0) - dt * 0.5);
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
    // And how long it has been left to burn.
    //
    // A fire aboard a warship is not a slow leak of hit points. It is in a
    // compartment with ready-use ammunition in it, or paint, or a fuel line,
    // and if nobody puts it out then sooner or later it gets into one of them.
    // Three minutes is the figure: long enough that a damage control party
    // sent to it in time deals with it, short enough that ignoring a fire is
    // a decision with a bill attached.
    c.burnt += dt * clamp(c.fire * 1.4, 0, 1);
    if (c.burnt >= COOK_OFF && c.fire > 0.25 && ship.alive) cookOff(state, ship, k);
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
  // And the ship-wide clock, if it has run out. It goes off in whichever
  // compartment is burning hardest, because that is where the fire has had
  // most to get into.
  if (ship.alive && (ship.blaze || 0) >= COOK_OFF) {
    let worst = null;
    for (const k of SECTIONS) {
      const c = ship.sections[k.k];
      if (c.fire > 0 && (!worst || c.fire > ship.sections[worst].fire)) worst = k.k;
    }
    ship.blaze = COOK_OFF * 0.4;
    if (worst) cookOff(state, ship, worst);
  }
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
      // And how long it has been burning, in seconds. A fire left alone does
      // not simply go on burning: it gets into something that goes off. See
      // stepFires.
      burnt: 0,
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
    // A boat that is down is a periscope feather at best, and below periscope
    // depth she is nothing at all until somebody runs over her. Radar does not
    // help either: there is nothing above the water to return an echo.
    if (tc.dive && submerged(target)) conceal = tc.dive.concealment;
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
      const radar = d < oc.radarRange * 0.55 && target.smokeActive <= 0
        && !(tc.dive && submerged(target));
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
  // And so do the heavies, a great deal further -- which is the one thing a
  // level bomber is unambiguously good at. A formation at fifteen thousand
  // feet in daylight sees a fleet under way from the far side of the
  // battlefield: the wakes give it away long before the hulls do. A squadron
  // that never drops a bomb on a moving ship can still be the reason her own
  // side's line knows where that ship is, which is what reconnaissance was
  // worth and why it was flown at all.
  for (const bm of (state.bombers || [])) {
    if (!bm.alive) continue;
    // Off her height, and shortened by the weather like everything else.
    const reach = (9000 + bm.y * 2.6) * getWeather(state.world?.weather).sight;
    for (const target of state.ships) {
      if (!target.alive || target.team === bm.team) continue;
      if (target.smokeActive > 0) continue;
      const tc = getClass(target.classId);
      if (tc.dive && submerged(target)) continue;
      if (dist(bm.x, bm.z, target.x, target.z) < reach) {
        target.spottedBy[bm.team] = true;
      }
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
    stepDive(state, ship, dt);
    stepMovement(state, ship, dt);
    stepTurrets(state, ship, dt);
    stepTorpMounts(state, ship, dt);
    stepSecondary(state, ship, dt);
    stepDamageOverTime(state, ship, dt);
    stepFlak(state, ship, dt);
  }
  stepCollisions(state, dt);
  stepBatteries(state, dt);
  stepShells(state, dt);
  stepBullets(state, dt);
  stepTorpedoes(state, dt);
  stepPlanes(state, dt);
  stepBombers(state, dt);
  if (state.tick % 3 === 0) stepDetection(state);
  if (!state.over) checkElimination(state);
  const ev = state.events;
  state.events = [];
  return ev;
}

/** Client-side prediction: advance only the local hull, no weapons or damage. */
export function predictShip(state, ship, dt) {
  if (!ship.alive) return;
  // The dive is predicted too. A boat's depth is the one thing about her that
  // answers a key and takes half a minute to happen, and a captain who has to
  // wait for a snapshot to see the needle move has no idea whether the order
  // was heard.
  stepDive(state, ship, dt);
  stepMovement(state, ship, dt);
  stepTurrets(state, ship, dt);
}
