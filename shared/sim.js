// Authoritative battle simulation. The server owns an instance of this and
// broadcasts snapshots; the client runs the same code to predict its own hull
// between snapshots, so steering feels immediate without desyncing.

import {
  clamp, lerp, wrapAngle, angleDelta, approachAngle, approach, dist, dist2,
  headingTo, localToWorld, worldToLocal, pointInBox, makeRng, gauss, TAU,
} from './math.js';
import { getClass, SHIP_CLASSES } from './ships.js';
import { freshLamps } from './searchlights.js';
import { armourScheme, layersFor, walkLayers, mountRoof } from './armor.js';
import { BOMBERS } from './bombers.js';
import { slotAt, vicAt } from './formation.js';
import {
  airframeOf, sustainBank, turnFor, rollRate, rollTau, HEAVY_AERO,
} from './aero.js';
import {
  enterDogfight, leaveDogfight, stepDogfight, pickFoe, threatOn, velocityOf as airVelocity, gunned,
  ENGAGE, DISENGAGE,
} from './dogfight.js';
import {
  freshAirframe, hitAirframe, stepAirframe, airframeState, flightState,
  airframeHp, PARTS as AIR_PARTS,
} from './airframe.js';
import {
  BATTERIES, batteryGun, batteryArc, batteryHp, batteryAa,
} from './batteries.js';
import {
  MAP_HALF, blockedByLand, islandAt, islandRadius, landAt, spawnPoint, getWeather,
  groundHeight, keelGround, addGouge, gougeWire, soilAt, addCrater, craterWire, landCeiling, sightOf, drawnGround, shoreDistance,
} from './world.js';
import {
  seaOf, waveTerms, seaHeight, seaAttitude, rollHeed, pitchHeed, windAt, rideOf,
} from './sea.js';

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
    // Whether a side's own fire, torpedoes, charges, aircraft and stems hurt
    // its own ships. Off unless the battle was set up with it on.
    friendlyFire: !!opts.friendlyFire,
    t: 0,
    tick: 0,
    ships: [],
    // The guns that were bolted to the ground before the fleets arrived.
    batteries: [],
    shells: [],
    torps: [],
    // The depth charges in the water, sinking. See stepCharges.
    charges: [],
    // Rounds from aircraft guns, in flight. Small, short-lived and real:
    // see stepBullets.
    bullets: [],
    planes: [],
    // The heavy squadrons, which belong to nobody's deck.
    bombers: [],
    // What is left of an aeroplane on its way down: a real body that falls,
    // and hits whatever it falls on. See stepFallers.
    fallers: [],
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
  if (afloatAt(world, cls, x, z, heading)) return { x, z, heading };
  const off = nearestWater(world, x, z, clear, half, 1500, cls, heading);
  return off ? { x: off.x, z: off.z, heading } : line;
}

/**
 * Whether a hull of this class lying here on this heading is afloat: clear of
 * the shore by her own beam, and with water under the whole of her keel. A
 * berth on an island's shelf that a destroyer floats on puts a battleship on
 * the bottom before the battle has begun.
 */
export function afloatAt(world, cls, x, z, heading = 0) {
  if (islandAt(world, x, z, shipClearance(cls))) return false;
  return keelContact(world, { depth: 0 }, cls, x, z, heading).pen <= 0;
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
function nearestWater(world, x, z, clear, half, reach = 1500, cls = null, heading = 0) {
  const step = Math.max(30, clear * 0.9);
  for (let r = step; r <= reach; r += step) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const px = clamp(x + Math.sin(a) * r, -half, half);
      const pz = clamp(z + Math.cos(a) * r, -half, half);
      if (cls ? afloatAt(world, cls, px, pz, heading) : !islandAt(world, px, pz, clear)) {
        return { x: px, z: pz };
      }
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
    // Her searchlights, dark. See shared/searchlights.js.
    lamps: freshLamps(cls),
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
    // Rolling to a wave off a splash, and set sideways by it. See waterBlow.
    rock: 0, rockRate: 0, driftX: 0, driftZ: 0,
    // How fast she is swinging, in radians a second, and how far over the
    // swing has laid her (see stepMovement). Her lean is in the same sense as
    // her heel: positive puts her +X side down.
    yawRate: 0, lean: 0,
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
    // The piece of her that has been cut off, if one has: the station she
    // parted at and which side of it she still is. See cutHer.
    cut: null,
    // The ship she is fouled on, if she is, and for how long. See
    // stepCollisions.
    fouled: 0, foulT: 0,
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
    // What her secondary battery is loaded with, or null while it follows the
    // main battery's. And whether her captain has given either order himself:
    // her gunnery officer picks the round for every salvo until he has, and
    // from then on leaves it alone.
    secShell: null,
    shellSet: false,
    // Which ship her main battery is laid on, or 0. Her gunnery officer picks
    // it (see stepBot) whoever has the con, and it is the one thing about a
    // ship's fire that the bridge you are standing on cannot work out from
    // looking: an aim point is a patch of sea ahead of a ship making twenty
    // knots, not the ship.
    targetId: 0,
    // Which enemy ship each of her guns and tubes has been given by name off
    // the targeting panel, as 'main:0', 'sec:3', 'dp:5', 'torp:1' to a ship
    // id. A mounting in here is laid on that ship and no other, and does
    // nothing while she is out of its reach or out of sight; one not in here
    // is her gunnery officer's, as always. See assignMount.
    assign: {},
    // Which of those same mountings her captain has switched off, by the same
    // keys: a gun in here neither trains nor fires until it is switched back
    // on, whoever would have laid it. See setMountOff.
    off: {},
    // The cooldown of each dual-purpose mounting of her light battery that has
    // been put on a ship, by its index in her light battery.
    dpCd: {},
    aimX: sp.x + Math.sin(sp.heading) * 6000,
    aimZ: sp.z + Math.cos(sp.heading) * 6000,
    // `hurt` is what state the mounting is in and it lasts: 0 sound, 1
    // damaged, 2 badly damaged, 3 gone. `disabled` is a countdown in seconds
    // -- knocked out for a moment by a near miss or a shock. The two are
    // different things and a gunnery officer needs both.
    turrets: cls.turrets.map((t) => ({
      id: t.id, angle: t.angle, elev: Math.max(0, layFloor(t.lift, t.angle)), cooldown: 0, disabled: 0, hurt: 0,
    })),
    torpMounts: cls.torpedoes ? cls.torpedoes.mounts.map((m) => ({ id: m.id, angle: m.angle, cooldown: 0 })) : [],
    // The depth charge gear. `dcLeft` is how many charges are still in the
    // stowage, `dcMounts` is a reload clock per rack and per thrower, `dcSet`
    // is what the pistols are wound to, and `dcAuto` is whether her own
    // anti-submarine officer is allowed to attack without being asked. See the
    // depth charge section.
    dcLeft: cls.depthCharges ? cls.depthCharges.carried : 0,
    dcMounts: chargeMounts(cls).map((_, i) => ({ id: i, cooldown: 0 })),
    dcSet: cls.depthCharges ? cls.depthCharges.set : 0,
    dcAuto: 1,
    dcHold: 0,
    // How wrong her plot of the contact is, rolled once per attack, and the
    // plot itself -- carried forward after the set loses her in the baffles,
    // which is how every attack in the war was actually fired. See
    // stepDepthAttack.
    dcErr: null,
    dcTrack: null,
    // The secondary battery, mount by mount. It is not laid by her captain --
    // a secondary mounting is in local control, and the gun captain shoots at
    // whatever he can see and bear on -- so each one carries its own target,
    // its own training and its own loading.
    secMounts: cls.secondary
      ? cls.secondary.mounts.map((m, i) => ({
        // Trained where she stows it, which is not always the middle of its
        // arc: a wing mounting rests fore and aft along her side.
        // Stowed clear of her: where its lift says the barrels have to be up
        // on that bearing, they are up.
        id: i, angle: m.rest === undefined ? m.angle : m.rest,
        elev: Math.max(0, layFloor(m.lift, m.rest === undefined ? m.angle : m.rest)),
        cooldown: 0, disabled: 0, target: 0, hurt: 0,
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
    // Her damage control parties, each with its job and what it is doing about
    // it. A bot's captain has them sent wherever they are wanted; a player's
    // stand by until they are told. See stepParties.
    parties: Array.from({ length: partyCount(cls) }, () => ({ job: isBot ? 'auto' : null, on: null })),
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
 * How high above the sea the thing at a point stands, for laying a gun on it.
 *
 * Every solution used to be worked out to the sea: right for a ship, and for a
 * gun on a headland two hundred metres up it put the shell into the face of
 * the hill short of it, every time. A battery near the point is aimed at as
 * its own platform; anywhere else ashore, at the ground.
 */
export function aimHeight(state, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
  for (const bat of state.batteries || []) {
    if (!bat.alive) continue;
    const span = BATTERIES[bat.batteryId]?.span || 20;
    if (dist2(x, z, bat.x, bat.z) < (span * 1.5 + 40) ** 2) return bat.y + 2;
  }
  if (landCeiling(state.world) <= 0) return 0;
  return Math.max(0, groundHeight(state.world, x, z));
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
      // Off the island, but round it on the hand she wanted to go rather than
      // straight back the way she came: a ship that met a headland on her way
      // into the action used to turn tail on it.
      const off = headingTo(i.x, i.z, ship.x, ship.z);
      const d = angleDelta(off, desiredHeading);
      target = wrapAngle(off + clamp(d, -1.0, 1.0));
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
  if (input.shellType === 'ap' || input.shellType === 'he') {
    ship.shellType = input.shellType;
    ship.shellSet = true;
  }
  if (input.secShell === 'ap' || input.secShell === 'he') ship.secShell = input.secShell;
  // Where her captain has ordered her to. Refused outright by anything that
  // cannot dive, so a stray key on a battleship does not sink her.
  if (typeof input.depth === 'number' && shipClass(ship).dive) {
    ship.depthCmd = clamp(input.depth, 0, shipClass(ship).dive.max);
  }
}

/**
 * Whether something of `team`'s may hurt this ship, battery or aeroplane: an
 * enemy's always, and a friend's only with friendly fire on.
 */
export function mayHurt(state, team, target) {
  return !target || target.team !== team || !!state.friendlyFire;
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

/** How long she takes to answer her rudder, and to lose a swing: seconds. */
export function yawLag(cls) {
  return cls.yawLag ?? 2.5 + cls.hull.length / 50;
}
/** How long she takes to roll into a turn's lean. */
export const LEAN_LAG = 2.4;
/** The most a turn will lay any ship over: she leans, she does not capsize. */
export const MAX_LEAN = 0.21;
/**
 * How far over a turn lays her, in radians, in the sense of her heel.
 *
 * The force on her in a turn is her speed times her rate of swing, outward;
 * the arm it acts on is how high her weight is over the water holding her
 * keel, against her stability -- which a tall, narrow destroyer has less of
 * than a battleship. `heelArm` says how tender she is; a ship's datasheet may
 * carry her own.
 */
export function leanFor(cls, speed, yawRate) {
  const arm = cls.heelArm ?? (cls.type === 'DD' ? 2.0 : cls.type === 'BB' ? 1.4 : cls.type === 'SS' ? 1.0 : 1.6);
  // A swing to port is a positive rate, and lays her down on her -X side --
  // her starboard side: a negative lean.
  const a = (speed * yawRate) / 9.81;
  return clamp(-Math.atan(a * arm), -MAX_LEAN, MAX_LEAN);
}

/**
 * How far a gun's deck has her laid over on the bearing it is trained on, in
 * her own frame: what a gun's elevation is lifted by in the world, for the
 * same elevation off her deck. Her list and her lean together, both of which
 * put her +X side down when positive: a gun trained out over the low side is
 * pointing lower than its layer has it, and one over the high side higher.
 */
export function deckTilt(ship, local) {
  return -((ship.heel || 0) + (ship.lean || 0) + (ship.rock || 0)) * Math.sin(local);
}

/**
 * What her layers put on a gun's elevation while she is rolling.
 *
 * A steady lean is laid off: the director's stable vertical knows where the
 * horizon is, and the guns are elevated off it. What it cannot do is follow a
 * ship rolling into a turn or out of one -- the gun is laid for where her deck
 * was a moment ago, and the round goes high or low by what she has rolled
 * since, on the bearing it is trained out over. Radians, to add to a round's
 * elevation in the world.
 */
export const LAY_LAG = 0.8;
export function layError(state, ship, local) {
  const r = ((ship.leanRate || 0) + (ship.rockRate || 0)) * Math.sin(local);
  if (!r) return 0;
  return clamp(gauss(state.rng), -2.4, 2.4) * Math.abs(r) * LAY_LAG;
}

// ---------------------------------------------------------- what a splash does

/**
 * How fast the wave a splash throws runs out across the sea, in metres a second.
 *
 * A deep-water wave runs at a speed set by its length; the ring off a heavy
 * shell is a few tens of metres from crest to crest, which is about this.
 */
export const SURGE_SPEED = 11;
// How long the set a wave gives a hull takes to come off her, in seconds.
const SURGE_DECAY = 3.2;
// What a unit of wave does to a destroyer's roll, in radians a second, and to
// her way through the water, in metres a second. Fitted so an eighteen-inch
// shell falling thirty metres off a Fletcher's beam rolls her four degrees and
// sets her a few metres over, and the same shell does next to nothing to a
// battleship.
const ROLL_KICK = 0.0057;
const PUSH_KICK = 0.16;
// A destroyer's worth of hull -- length by beam by draught -- which is what the
// kick above is fitted against.
const DD_BULK = 114 * 12 * 5.5;
// The most a wave can be rolling her at, and setting her, however close it was.
const MAX_ROCK_RATE = 0.3;
const MAX_DRIFT = 4;

/** How far out the wave off a splash of `size` (a bore, in millimetres) is still felt. */
export function surgeReach(size) {
  return 75 * Math.pow(Math.max(0.35, size / 127), 1.02);
}

/**
 * Something big has gone into the sea at (x, z): a shell, a bomb, a torpedo, a
 * depth charge going off under it. `size` is the bore that throws the same
 * splash (see splashSize in the renderer, which is driven off the same number).
 *
 * The ring of water it throws runs out at SURGE_SPEED, and every hull it
 * reaches is rolled by it and set over by it -- how much is how big the splash
 * was, how close, and how much ship there is to move. A destroyer beside an
 * eighteen-inch near miss rolls and is pushed bodily sideways; a battleship
 * hardly notices. The wave gets there when it gets there, not when the shell
 * lands. `delay` is for a weapon that lands a while after it is accounted for:
 * a bomb is settled the moment it leaves the rack.
 */
export function waterBlow(state, x, z, size, delay = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !(size > 0)) return;
  const reach = surgeReach(size);
  const push = Math.pow(Math.max(0.35, size / 127), 2.2);
  for (const s of state.ships) {
    if (!s.alive) continue;
    // A boat well down is under the wave, not on it.
    if ((s.depth || 0) > 8) continue;
    const h = shipClass(s).hull;
    // To her side, not to her middle: a long hull is reached by a wave off
    // her beam well before it gets to her keel.
    const near = Math.max(0, Math.hypot(s.x - x, s.z - z) - h.beam * 0.5);
    if (near > reach) continue;
    const f = (1 - near / reach) ** 2;
    const j = (push * f) / Math.max(0.05, (h.length * h.beam * h.draft) / DD_BULK);
    if (j < 1e-4) continue;
    (state.surges || (state.surges = [])).push({
      at: state.t + delay + near / SURGE_SPEED, id: s.id, x, z, j,
    });
  }
}

/** The waves that have reached somebody this tick. See waterBlow. */
function stepSurges(state) {
  const q = state.surges;
  if (!q || !q.length) return;
  for (let i = q.length - 1; i >= 0; i--) {
    const w = q[i];
    if (w.at > state.t) continue;
    q.splice(i, 1);
    const s = state.ships.find((o) => o.id === w.id);
    if (!s || !s.alive) continue;
    const dx = s.x - w.x;
    const dz = s.z - w.z;
    const d = Math.hypot(dx, dz) || 1;
    // Which side it came from, in her own frame, and how square on: a wave on
    // her beam rolls her, one under her bow mostly lifts it.
    const lx = worldToLocal(w.x - s.x, w.z - s.z, s.heading).x;
    const square = Math.abs(lx) / d;
    // The side the wave arrives on is lifted, so she lies over away from it.
    // (Heel and roll are positive with her +x side down.)
    s.rockRate = clamp((s.rockRate || 0) - Math.sign(lx || 1) * ROLL_KICK * w.j * (0.3 + 0.7 * square),
      -MAX_ROCK_RATE, MAX_ROCK_RATE);
    // And she is set bodily away from where it came from.
    s.driftX = (s.driftX || 0) + (dx / d) * PUSH_KICK * w.j;
    s.driftZ = (s.driftZ || 0) + (dz / d) * PUSH_KICK * w.j;
    const v = Math.hypot(s.driftX, s.driftZ);
    if (v > MAX_DRIFT) { s.driftX *= MAX_DRIFT / v; s.driftZ *= MAX_DRIFT / v; }
  }
}

/** The period she rolls on, in seconds: longer the beamier she is. */
export function rollPeriod(cls) {
  return cls.rollPeriod ?? 2.0 * Math.sqrt(cls.hull.beam);
}
const ROLL_DAMPING = 0.12;

function stepMovement(state, ship, dt) {
  const cls = shipClass(ship);
  // Her magazine has gone up under her. There is no engine room, no rudder
  // and no bridge to ring down for either: she stops where it happened, dead
  // in the water, and goes down there.
  if (ship.blown) {
    ship.speed = 0; ship.yawRate = 0; ship.driftX = 0; ship.driftZ = 0;
    ship.rudder = 0; ship.rudderCmd = 0; ship.lean = 0; ship.leanRate = 0;
    return;
  }
  // And a piece of her cut off takes what was in it: her machinery, her
  // screws, or the stem she was cutting the water with. See cutDrive.
  const engine = (ship.engineDamage > 0 ? 0.45 : 1) * cutDrive(ship);
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
  // No rudder at all once her stern has gone.
  const rudderGone = ship.cut && ship.sections.stern.lost ? 0 : 1;
  const rate = cls.turnRate * ship.rudder * helm * Math.sign(ship.speed || 1) * rudderGone;
  // She does not turn the moment the rudder bites. Thirty thousand tonnes has
  // to be got swinging, and once it is swinging it goes on swinging: the rate
  // the rudder is asking for is worked up to over a few seconds -- longer the
  // longer she is -- and when the wheel comes back amidships she carries on
  // round until the water has taken the swing off her. A course altered hard
  // over runs past the new course before she is steadied on it.
  const lag = yawLag(cls);
  // Aground, she swings only as far as the ground lets her: see the keel
  // test below, which puts the heading back if the swing drove her further on.
  const h0 = ship.heading;
  ship.yawRate = (ship.yawRate || 0) + (rate - (ship.yawRate || 0)) * (1 - Math.exp(-dt / lag));
  ship.heading = wrapAngle(ship.heading + ship.yawRate * dt);
  // And she lies over while she swings: the water holds her keel into the turn
  // and everything over it goes on outward, so turning to port lays her down
  // to starboard and turning to starboard lays her down to port. How far is
  // how hard she is being turned -- speed times rate of swing, against the
  // gravity that is holding her up -- and she rolls into it, and out of it, at
  // her own pace. It is a lean, not a list: no water moves in her, and when
  // the swing comes off her she comes back upright.
  const want = leanFor(cls, ship.speed, ship.yawRate);
  const was = ship.lean || 0;
  ship.lean = was + (want - was) * (1 - Math.exp(-dt / LEAN_LAG));
  // How fast she is rolling into it or out of it, which is what her layers
  // cannot keep up with (see layError).
  ship.leanRate = dt > 0 ? (ship.lean - was) / dt : 0;

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
  // And going down she loses her way: the sea is in her machinery spaces.
  const going = ship.sinking ? Math.max(0, 1 - 1.3 * (ship.sinking.t / ship.sinking.T)) : 1;
  // Her screws clear of the water, or buried in the sand under her stern,
  // drive nothing: whatever the telegraph says, she is not going anywhere.
  const screws = ship.stranded ? 0 : 1;
  const ordered = THROTTLE_NOTCHES[ship.notch] * (ship.notch === 0 ? cls.reverseSpeed : maxSpeed)
    * engine * going * screws;
  const target = ordered * bleed * flood;
  // Way comes off her whether she has an engine or not: a ship stopped by
  // the loss of her machinery carries her way and loses it to the water.
  const accel = cls.accel * (target < ship.speed ? 1.6 : 1) * (engine > 0 ? engine : 0.6);
  ship.speed = approach(ship.speed, target, accel * dt);
  const v = ship.speed;
  // A roll a wave has given her works itself out on her own period, damped by
  // the water round her bilges.
  if (ship.rock || ship.rockRate) {
    const w = (Math.PI * 2) / rollPeriod(cls);
    ship.rockRate += (-w * w * ship.rock - 2 * ROLL_DAMPING * w * ship.rockRate) * dt;
    ship.rock = clamp(ship.rock + ship.rockRate * dt, -0.35, 0.35);
    if (Math.abs(ship.rock) < 1e-5 && Math.abs(ship.rockRate) < 1e-5) { ship.rock = 0; ship.rockRate = 0; }
  }
  // And a set a wave has given her comes off her as the water takes it back.
  const sx = ship.driftX || 0;
  const sz = ship.driftZ || 0;
  if (sx || sz) {
    const keep = Math.exp(-dt / SURGE_DECAY);
    ship.driftX = Math.abs(sx * keep) < 1e-3 ? 0 : sx * keep;
    ship.driftZ = Math.abs(sz * keep) < 1e-3 ? 0 : sz * keep;
  }
  const nx = ship.x + (Math.sin(ship.heading) * v + sx) * dt;
  const nz = ship.z + (Math.cos(ship.heading) * v + sz) * dt;

  // The shock of taking the ground, dying away.
  if (ship.groundJolt) {
    ship.groundJolt *= Math.exp(-dt / 0.45);
    if (Math.abs(ship.groundJolt) < 1e-4) ship.groundJolt = 0;
  }
  // The bottom. She draws so many metres and the sea is so deep here; where
  // the ground comes up higher than her keel she is on it.
  if (!touchBottom(state, ship, cls, h0, nx, nz, dt)) { ship.x = nx; ship.z = nz; }

  // Map border acts like a shoal: you slow and take damage rather than leave.
  const edge = (state.world.half || MAP_HALF) - 120;
  if (Math.abs(ship.x) > edge || Math.abs(ship.z) > edge) {
    ship.x = clamp(ship.x, -edge, edge);
    ship.z = clamp(ship.z, -edge, edge);
    ship.speed *= 0.9;
    damageShip(state, ship, null, 220 * dt, 'border');
  }
}

// ---------------------------------------------------------------------------
// Running aground
// ---------------------------------------------------------------------------
//
// A ship that met land used to be picked up and put back in the water a beam's
// width off it, with a bill for the damage. Now she goes onto it. Her keel is
// sampled from stem to stern against the depth of water under each part of it,
// and where the bottom comes up higher than she draws she is aground there:
// driven on, she rides up it, ploughing her bottom open and losing her way
// until it holds her; driven the other way -- astern off a bow that is on the
// beach, ahead off a stern that is -- she comes off it. What she cannot do is
// drive herself off with her screws out of the water, which is what happens
// to a ship that has gone up a beach far enough or backed her stern onto it:
// she stays where she is.

/** Where along her keel the bottom is asked about, as a fraction of her half-length. */
const KEEL = [-0.92, -0.62, -0.32, 0, 0.32, 0.62, 0.92];
/** Where her screws are, as the same fraction. */
const SCREWS_AT = -0.8;

/**
 * The bottom a keel is on: the ground exactly as it is drawn, without the
 * trenches keels have cut in it (she lies in her own). The true height field
 * and the mesh on the screen are a metre or two apart between the mesh's
 * vertices, and up a steep beach several -- which is a bow sunk five metres
 * into a hillside the captain can see, or stopped short of a beach she has
 * not touched yet. Tested against the picture, she touches when she is seen
 * to touch.
 */
function bedAt(world, x, z) {
  return drawnGround(world, x, z);
}

/** How deep she goes: her draft, and for a boat under water her depth as well. */
function keelDepth(ship, cls) {
  return cls.hull.draft + Math.max(0, ship.depth || 0);
}

/**
 * How much further she can settle before her keel is on the bottom: the
 * least water under her anywhere along her length, less what she draws, and a
 * metre for the mud she beds into. Infinity in open water.
 *
 * The seabed is solid. A ship going down in twelve fathoms off a beach used to
 * go on down through it for as long as she would have in the open sea, and
 * finish forty metres under an island; she settles on it instead, upright or
 * on her side the way she was going, with her upperworks out of the water --
 * which is how most of the ships ever lost inshore were left.
 */
export function seabedRoom(world, ship, cls) {
  if (!world || (landCeiling(world) <= 0 && !world.land?.length)) return Infinity;
  const half = cls.hull.length * 0.5;
  if (keelGround(world, ship.x, ship.z) < -half - 60 && !islandAt(world, ship.x, ship.z, half + 60)) return Infinity;
  const sn = Math.sin(ship.heading);
  const cs = Math.cos(ship.heading);
  let room = Infinity;
  for (const k of KEEL) {
    const g = bedAt(world, ship.x + sn * half * k, ship.z + cs * half * k);
    room = Math.min(room, -g - cls.hull.draft * (Math.abs(k) > 0.85 ? 0.85 : 1) + 1);
  }
  return Math.max(0, room);
}

/**
 * How hard she is on the bottom at a position and heading: the sum over her
 * keel of how far the ground stands above it, the worst single place and where
 * it is, and how much water her screws have.
 */
export function keelContact(world, ship, cls, x, z, heading) {
  const T = keelDepth(ship, cls);
  const half = cls.hull.length * 0.5;
  const sn = Math.sin(heading);
  const cs = Math.cos(heading);
  const out = { pen: 0, max: 0, at: 0, screws: T };
  // Far from any land there is nothing to ask about.
  if (landCeiling(world) <= 0 && !world.land?.length) return out;
  if (groundHeight(world, x, z) < -T - 30 && !islandAt(world, x, z, half + 40)) return out;
  for (const k of KEEL) {
    // The ends draw a little less than her midships, and her bilges as wide
    // as she is amidships: a ship laid alongside a shoal touches with her side.
    const draw = T * (Math.abs(k) > 0.85 ? 0.85 : 1);
    const lat = Math.abs(k) < 0.5 ? [-0.5, 0, 0.5] : [0];
    for (const w of lat) {
      const px = x + sn * half * k + cs * cls.hull.beam * w;
      const pz = z + cs * half * k - sn * cls.hull.beam * w;
      const c = bedAt(world, px, pz) + draw;
      if (c <= 0) continue;
      out.pen += c;
      if (c > out.max) { out.max = c; out.at = k; }
    }
  }
  // Her screws: the water there, less what she has been lifted by riding up.
  const sx = x + sn * half * SCREWS_AT;
  const sz = z + cs * half * SCREWS_AT;
  const lift = out.max * (out.at > 0 ? 0.25 : 0.7);
  out.screws = Math.min(T, -bedAt(world, sx, sz)) - lift;
  // And her stern itself driven hard into the bottom: the screws and the
  // rudder are under it, and they are in the sand with it, however deep the
  // water is a few metres further forward.
  if (out.at <= -0.6 && out.max >= T * 0.45) out.screws = Math.min(out.screws, 0);
  return out;
}

/** How far into the ground her bottom is pressed at the worst place, for a given contact. */
function groundDig(c, T) {
  return Math.min(c.max, T * 0.6, c.max * 0.4 + 0.3);
}

/**
 * How she sits on the bottom, for the picture.
 *
 * She hinges about the end that is still afloat: that end lies at her own
 * draft, and the end on the ground is lifted until her bottom is pressed into
 * it by `groundDig` and no further. It used to be half of how far on she was,
 * lifted bodily, and trimmed on top of that -- which put a bow on a beach in
 * the air over the sand and her keel through it a hundred feet further aft.
 * `raise(k)` is how far she is lifted at a point along her keel, as a
 * fraction of her half-length, which is what the keel's trench is cut to.
 */
function groundPose(ship, cls, c) {
  if (!c || c.pen <= 0) { ship.groundLift = 0; ship.groundTrim = 0; return; }
  const half = cls.hull.length * 0.5;
  const T = keelDepth(ship, cls);
  // Never more than most of her draft: a ship lifted clear of the sea along
  // her whole length is not aground, she is in the air, and whatever ground
  // would say so is a step in it rather than a beach.
  const rise = Math.min(T * 0.8, Math.max(0, c.max - groundDig(c, T)));
  if (Math.abs(c.at) < 0.25) {
    // On it amidships: lifted level.
    ship.groundLift = rise;
    ship.groundTrim = 0;
    return;
  }
  const e = c.at > 0 ? -1 : 1;              // the end still afloat
  // Rotation about her beam: positive puts her bow down, so a bow lifted
  // onto a beach is a negative trim -- the sign her collision trim takes.
  const trim = clamp(-rise / ((c.at - e) * half), -0.12, 0.12);
  ship.groundTrim = trim;
  ship.groundLift = clamp(rise + trim * c.at * half, 0, T * 0.8);
}

/** How far she is lifted by the ground at a point along her keel. */
function groundRaise(ship, cls, k) {
  return (ship.groundLift || 0) - (ship.groundTrim || 0) * k * cls.hull.length * 0.5;
}

/** Where along her keel the trench she cuts is taken from: as KEEL, and her stem and sternpost. */
const SCORE = [-1, -0.92, -0.62, -0.32, 0, 0.32, 0.62, 0.92, 1];

/**
 * Her bottom cutting into the ground under her.
 *
 * Each part of her keel that is lower than the ground it is over has pushed
 * that ground aside, and leaves the trench behind it as it goes: wherever she
 * is driven on, off, or along a shoal, there is a scar where she went. Only
 * the part of it near enough the surface to be seen is kept -- a furrow ten
 * metres down under a sea that is not glass is a furrow nobody will ever see,
 * and the battlefield only has room for so many.
 */
function scoreGround(state, ship, cls) {
  const T = keelDepth(ship, cls);
  const half = cls.hull.length * 0.5;
  const sn = Math.sin(ship.heading);
  const cs = Math.cos(ship.heading);
  const marks = ship.scars || (ship.scars = []);
  for (let n = 0; n < SCORE.length; n++) {
    const k = SCORE[n];
    const px = ship.x + sn * half * k;
    const pz = ship.z + cs * half * k;
    const ground = bedAt(state.world, px, pz);
    const draw = T * (Math.abs(k) > 0.85 ? 0.85 : 1);
    // How far the ground stands above her bottom here, as she lies.
    const cut = ground + draw - groundRaise(ship, cls, k);
    const last = marks[n];
    if (cut < -0.4 || ground < -4) { marks[n] = null; continue; }
    if (!last) { marks[n] = { x: px, z: pz, g: null }; continue; }
    if (Math.hypot(px - last.x, pz - last.z) < 3) continue;
    // Her bilges are as wide as she is amidships; her ends run to a point.
    const w = cls.hull.beam * (Math.abs(k) > 0.97 ? 0.08 : Math.abs(k) > 0.85 ? 0.16 : Math.abs(k) > 0.5 ? 0.3 : 0.42);
    const depth = clamp(Math.max(0.35, cut), 0.35, T);
    const g = addGouge(state.world, last.x, last.z, px, pz, w, depth, last.g);
    marks[n] = { x: px, z: pz, g };
    if (g) {
      state.events.push({
        e: 'gouge', g: gougeWire(g), i: ship.id, x: r(px), z: r(pz),
        y: r(ground), v: r(Math.abs(ship.speed)), w: r(w),
      });
    }
  }
}

/**
 * Her keel against the bottom for the step she is about to take. Returns true
 * when it has dealt with her position itself -- held her where she was -- and
 * false when she is free to go where she was going.
 */
function touchBottom(state, ship, cls, h0, nx, nz, dt) {
  const was = keelContact(state.world, ship, cls, ship.x, ship.z, h0);
  const now = keelContact(state.world, ship, cls, nx, nz, ship.heading);
  const T = keelDepth(ship, cls);
  const v = Math.abs(ship.speed);
  const where = (k) => sectionAt(k, 'belt');

  if (now.pen <= 0) {
    groundPose(ship, cls, null);
    ship.scars = null;
    if (ship.aground) {
      ship.aground = 0;
      ship.groundAt = 0;
      state.events.push({ e: 'refloat', i: ship.id, x: r(ship.x), z: r(ship.z) });
    }
    return false;
  }

  // Her screws, where she actually ends up. Too little water over them and
  // she has nothing to drive with, ahead or astern: she is stranded, and she
  // stays stranded.
  const strand = (c) => {
    if (ship.stranded || c.pen <= 0 || c.screws >= T * 0.3) return;
    ship.stranded = true;
    state.events.push({ e: 'stranded', i: ship.id, team: ship.team, x: r(ship.x), z: r(ship.z) });
  };

  const deeper = now.pen - was.pen;
  if (deeper <= 1e-7) {
    // Coming off it, or sliding along it no further on: she goes, with the
    // bottom dragging at her.
    ship.aground = Math.min(1, now.max / T);
    ship.groundAt = now.at;
    groundPose(ship, cls, now);
    strand(now);
    ship.speed *= Math.exp(-dt * 0.8 * Math.min(1, now.max / T));
    scoreGround(state, ship, cls);
    return false;
  }

  // Further on. The first touch is the one that does the damage: her bottom
  // plating meeting rock or sand at whatever speed she was making.
  if (was.pen <= 0) {
    const hard = clamp(v / 12, 0, 1);
    if (v > 1) {
      damageShip(state, ship, null, ship.maxHp * 0.07 * hard, 'grounding', where(now.at));
      if (v > 2.5) {
        openHull(state, ship, where(now.at), (v - 2.5) * 0.12, now.at >= 0 ? 1 : -1, T * 0.95);
      }
    }
    // Where she struck, for the spray and the sand it throws.
    const strike = cls.hull.length * 0.5 * now.at;
    state.events.push({
      e: 'ground', i: ship.id, team: ship.team, x: r(ship.x), z: r(ship.z),
      v: r(v), at: r(now.at),
      px: r(nx + Math.sin(ship.heading) * strike), pz: r(nz + Math.cos(ship.heading) * strike),
    });
    // What she hit it with, which decides how far up it she goes.
    ship.groundV = v;
    // And the blow itself, which is felt at once and seen at once: the end
    // that struck is thrown up and she shudders back down onto it, and the
    // way comes off her in the first second rather than over a minute.
    ship.groundJolt = -Math.sign(now.at || 1) * clamp(v / 12, 0.15, 1) * 0.04;
    ship.speed *= 1 - 0.32 * clamp(v / 8, 0.3, 1);
  }
  ship.aground = Math.min(1, now.max / T);
  ship.groundAt = now.at;

  // How far she can be driven up before it holds her: about half her draft at
  // the worst place, and further the harder she hit it -- a ship that takes
  // the ground at twenty-five knots does not stop where she touched, she
  // ploughs on up the beach until it has taken all of that out of her. Short
  // of that she rides on, losing her way. The first touch always goes
  // through, however steep the bottom: she is on it, not held a hand's
  // breadth off it.
  const reach = T * Math.min(1.5, 0.55 + 0.07 * (ship.groundV || 0));
  if (was.pen > 0 && now.max > reach) {
    groundPose(ship, cls, was);
    // Held where she is: as hard on as she is going to get.
    ship.aground = Math.min(1, was.max / T);
    ship.groundAt = was.at;
    strand(was);
    ship.speed = 0;
    ship.yawRate = 0;
    ship.heading = h0;
    ship.driftX = 0; ship.driftZ = 0;
    return true;
  }
  groundPose(ship, cls, now);
  strand(now);
  // Ploughing on up it: every metre further is more of her bottom torn, and
  // the sand she is shoving aside takes her way off her the harder the
  // further on she is.
  if (was.pen > 0) {
    damageShip(state, ship, null, ship.maxHp * 0.0045 * (deeper / T), 'grounding', where(now.at));
    const brake = dt * (0.45 + 1.7 * now.max / T);
    ship.speed = Math.sign(ship.speed) * Math.max(0, Math.abs(ship.speed) * Math.exp(-deeper / (T * 2.2)) - brake);
    // Way all but gone and still being pushed on: the ground has her. She
    // does not creep up a beach a centimetre a second on her screws.
    if (Math.abs(ship.speed) < 0.25) {
      groundPose(ship, cls, was);
      ship.aground = Math.min(1, was.max / T);
      ship.groundAt = was.at;
      ship.speed = 0;
      ship.yawRate = 0;
      ship.heading = h0;
      ship.driftX = 0; ship.driftZ = 0;
      return true;
    }
  }
  scoreGround(state, ship, cls);
  return false;
}

// ---------------------------------------------------------------------------
// Collision and ramming
// ---------------------------------------------------------------------------
//
// Two hulls that meet do not bounce off each other. They foul: the stem of one
// is in the side of the other, or the two are ground together along their
// length, and from then on neither of them is going anywhere until one backs
// out of it or goes down. What happens in the instant they meet is a question
// of what each of them hit the other with -- a stem is a knife, a belt is a
// wall -- and how hard.
//
// Each hull is the box she is fought on, length by beam, with whatever of her
// has been cut off her taken out of it. Where the two boxes overlap is where
// they are touching, and which part of each that is -- her stem, her side, her
// counter -- decides what kind of collision it was.

/** A hole smaller across than this, in metres, is a scratch and not a hole. */
const SCRATCH_R = 0.9;
/** How far apart two hulls can be and still count as fouled, in metres. */
const FOUL_GAP = 1.5;
/** How fast a fouled ship's way comes off her, per second. */
const FOUL_DRAG = 0.9;
/** How fast a stem pressed into another hull is stopped, per second. */
const FOUL_STOP = 3.2;
/** The slowest closing speed that is a collision rather than a nudge, m/s. */
const RAM_MIN = 0.9;
/** How long two hulls have to be clear before they can strike again, seconds. */
const RAM_REARM = 2.5;
/** How hard a weaker stem has to be driven into a stronger hull to lose it, m/s. */
const CHOP_V = 5.6;

/** What she displaces, near enough, in tonnes. */
function tonnage(cls) {
  return cls.hull.length * cls.hull.beam * cls.hull.draft * 0.55;
}

/**
 * What her stem is worth as a ram.
 *
 * The plating on her bow, and the frames and the collision bulkhead behind it
 * -- which in a warship are built to the same scale as the rest of her
 * protection. A battleship's stem has fifty millimetres of plate on it and a
 * hull behind it built to carry four hundred on her belt, and it will go
 * through a cruiser's side; a destroyer's has thirteen and a hull built to
 * carry nothing at all.
 */
export function stemStrength(cls) {
  return cls.armor.bow + 0.4 * cls.armor.belt;
}

/** What her side is worth against a stem at this station (-1 stern .. 1 stem). */
export function sideStrength(cls, station) {
  return Math.abs(station) < 0.6 ? cls.armor.belt : cls.armor.bow;
}

/**
 * Where her bridge is, as a station along her (-1 stern .. 1 stem).
 *
 * Her bridge and her main superstructure are what she is fought from. A ship
 * cut in two is the half that still has them; the other half is wreckage,
 * however many guns are standing on it. Not in the yard's data, so it is read
 * off where her guns are: a warship's bridge stands just abaft her forward
 * turrets, because that is where the guns can be seen from and fired over.
 */
export function bridgeStation(cls) {
  if (cls.bridge != null) return cls.bridge;
  if (cls.type === 'SS') return 0;
  if (cls.type === 'CV') return 0.05;
  const half = cls.hull.length / 2;
  const fwd = (cls.turrets || []).filter((t) => (t.z || 0) > 0);
  const st = fwd.length ? Math.min(...fwd.map((t) => t.z)) / half - 0.08 : 0.3;
  return clamp(st, -0.1, 0.45);
}

/**
 * The length of her that is still her, as stations (-1 stern .. 1 stem).
 * All of her, unless a piece has been cut off.
 */
export function hullSpan(ship) {
  const c = ship.cut;
  if (!c) return { lo: -1, hi: 1 };
  return c.keep > 0 ? { lo: c.at, hi: 1 } : { lo: -1, hi: c.at };
}

/**
 * Is a point at this distance along her (metres, her own frame) on the piece
 * that has been cut off her? A shell that arrives there has hit wreckage
 * drifting away from her, not her.
 */
export function severed(ship, cls, lz) {
  const c = ship && ship.cut;
  if (!c) return false;
  const st = lz / (cls.hull.length * 0.5);
  return c.keep > 0 ? st < c.at : st > c.at;
}

/**
 * Whether a wreck the sea has closed over amidships still has a piece of her
 * standing up out of it: broken in two with her halves on end, or down so
 * hard by one end that the other is in the air. A wreck lying level is under
 * everybody's keel once she is under; one of these is not until she is gone.
 */
function standsUp(ship) {
  return ship.broke != null || Math.abs(ship.trim || 0) > 0.25;
}

/** Her hull as the box the collision is worked on: centre, axes and half-sizes. */
function hullBox(ship, cls) {
  const half = cls.hull.length / 2;
  const sp = hullSpan(ship);
  const off = ((sp.lo + sp.hi) / 2) * half;
  const ux = Math.sin(ship.heading);
  const uz = Math.cos(ship.heading);
  return {
    x: ship.x + ux * off, z: ship.z + uz * off,
    ux, uz, vx: uz, vz: -ux,
    hl: ((sp.hi - sp.lo) / 2) * half,
    // A little inside her full beam: her ends are fine and her box is not.
    hb: cls.hull.beam * 0.45,
  };
}

/**
 * Whether two hulls overlap, and if so by how much and which way to part
 * them. Separating axes on the two boxes: the axis they overlap least on is
 * the one they are pushed apart along.
 */
function hullsMeet(A, B, gap = 0) {
  const dx = B.x - A.x;
  const dz = B.z - A.z;
  let best = Infinity;
  let nx = 0;
  let nz = 0;
  for (const [lx, lz] of [[A.ux, A.uz], [A.vx, A.vz], [B.ux, B.uz], [B.vx, B.vz]]) {
    const ra = A.hl * Math.abs(A.ux * lx + A.uz * lz) + A.hb * Math.abs(A.vx * lx + A.vz * lz);
    const rb = B.hl * Math.abs(B.ux * lx + B.uz * lz) + B.hb * Math.abs(B.vx * lx + B.vz * lz);
    const d = dx * lx + dz * lz;
    const over = ra + rb + gap - Math.abs(d);
    if (over < 0) return null;
    if (over < best) {
      best = over;
      const s = d >= 0 ? 1 : -1;
      nx = lx * s;
      nz = lz * s;
    }
  }
  return { depth: best - gap, nx, nz };
}

function inBox(B, px, pz, pad = 0) {
  const dx = px - B.x;
  const dz = pz - B.z;
  return Math.abs(dx * B.ux + dz * B.uz) <= B.hl + pad
    && Math.abs(dx * B.vx + dz * B.vz) <= B.hb + pad;
}

/**
 * Where two hulls are touching: the points of each -- her stem, her counter,
 * her corners and the middle of her sides -- that are inside the other,
 * averaged. A stem in a ship's side gives the stem; two ships ground together
 * along their length give somewhere along the overlap.
 */
function contactPoint(A, B) {
  let sx = 0;
  let sz = 0;
  let n = 0;
  const probe = (P, Q) => {
    for (const [a, b] of [[1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [0, -1], [0.5, 1], [0.5, -1], [-0.5, 1], [-0.5, -1]]) {
      const px = P.x + P.ux * P.hl * a + P.vx * P.hb * b;
      const pz = P.z + P.uz * P.hl * a + P.vz * P.hb * b;
      if (inBox(Q, px, pz, FOUL_GAP)) { sx += px; sz += pz; n++; }
    }
  };
  probe(A, B);
  probe(B, A);
  if (n) return { x: sx / n, z: sz / n };
  return { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 };
}

/** Her velocity over the ground, as a vector. */
function velocityOf(ship) {
  return {
    x: Math.sin(ship.heading) * ship.speed + (ship.driftX || 0),
    z: Math.cos(ship.heading) * ship.speed + (ship.driftZ || 0),
  };
}

/** What part of her a point in the world is on: stem, counter or side. */
function partAt(ship, cls, px, pz) {
  const l = worldToLocal(px - ship.x, pz - ship.z, ship.heading);
  const station = clamp(l.z / (cls.hull.length / 2), -1, 1);
  const sp = hullSpan(ship);
  // Her stem is whatever is foremost of her now, and her counter whatever is
  // aftermost -- a ship that has lost her bow strikes with the broken end.
  const part = station > sp.hi - 0.4 ? 'bow' : station < sp.lo + 0.38 ? 'stern' : 'side';
  return { station, part, lx: l.x, lz: l.z, side: l.x >= 0 ? 1 : -1 };
}

/**
 * Two hulls touching, every tick.
 *
 * They are kept out of each other -- shared out by how heavy each is, so a
 * destroyer is shoved aside by a battleship rather than the battleship by her
 * -- and while they are touching neither of them is making way. A ship
 * pressing into the other is stopped, a ship dragging the other along is
 * slowed, and the only way out of it is to back away: a ship going astern
 * away from the other is let go. The first instant of it is the collision
 * itself, and that is worked out on its own (see ramImpact).
 */
function stepCollisions(state, dt) {
  const alive = state.ships.filter((s) => s.alive);
  // And every wreck still on the surface. A ship out of the fight is still
  // thousands of tons of steel going down where she stopped, and a ship that
  // runs into her is hurt exactly as if she were still fighting. She is only
  // out of everybody's way once the last of her is gone -- a bow or a broken
  // half standing up out of the sea is still there after the deck has gone
  // under (see stepWreckDown) -- and before that, how far she has settled
  // decides whose keel still reaches her (see bodySpan).
  const hulls = state.ships.filter((s) => s.alive || (s.sinking && !s.sinking.under)
    || (s.sinking && !s.sinking.gone && standsUp(s)));
  for (const s of hulls) {
    // Nothing moves a wreck but what runs into her: her engines are stopped
    // and the way she had is long off her.
    if (!s.alive) { s.speed = 0; s.driftX = 0; s.driftZ = 0; s.yawRate = 0; }
  }
  const rams = state.rams || (state.rams = {});
  for (const s of alive) s.fouled = 0;
  // A ship a boat has come up under settles back onto the sea.
  for (const s of state.ships) {
    if (!s.lift) continue;
    const k = Math.exp(-dt / LIFT_TAU);
    s.lift *= k; s.liftHeel = (s.liftHeel || 0) * k; s.liftTrim = (s.liftTrim || 0) * k;
    if (s.lift < 0.01) { s.lift = 0; s.liftHeel = 0; s.liftTrim = 0; }
  }
  for (let i = 0; i < hulls.length; i++) {
    for (let j = i + 1; j < hulls.length; j++) {
      const a = hulls[i], b = hulls[j];
      // Two wrecks drifting into each other is nobody's business.
      if (!a.alive && !b.alive) continue;
      const ca = shipClass(a), cb = shipClass(b);
      const reach = (ca.hull.length + cb.hull.length) * 0.5 + FOUL_GAP;
      if (dist2(a.x, a.z, b.x, b.z) > reach * reach) continue;
      // Up and down as well as across. A boat that is properly down is under
      // everybody's keel and cannot be run into; at periscope depth her tower
      // is still up there, and ships did ram boats at periscope depth.
      const sa = bodySpan(a, ca), sb = bodySpan(b, cb);
      // One of them a boat with all of her hull under the other's keel: the
      // other runs over her, or she comes up under the other. See underKeel.
      const under = cb.dive && sb.deck <= sa.keel + 0.3 ? [a, b, ca, cb, sa, sb]
        : ca.dive && sa.deck <= sb.keel + 0.3 ? [b, a, cb, ca, sb, sa] : null;
      if (under) { underKeel(state, ...under, rams, dt); continue; }
      if (sa.keel >= sb.top || sb.keel >= sa.top) continue;
      const A = hullBox(a, ca);
      const B = hullBox(b, cb);
      const hit = hullsMeet(A, B, FOUL_GAP);
      const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
      if (!hit) continue;
      const fresh = !(rams[key] >= state.t - RAM_REARM);
      rams[key] = state.t;
      const { nx, nz } = hit;
      // Kept out of each other, the lighter one moved the further.
      if (hit.depth > 0) {
        const ma = tonnage(ca), mb = tonnage(cb);
        const fa = mb / (ma + mb);
        const push = hit.depth + 0.02;
        a.x -= nx * push * fa; a.z -= nz * push * fa;
        b.x += nx * push * (1 - fa); b.z += nz * push * (1 - fa);
      }
      const at = contactPoint(A, B);
      if (fresh) ramImpact(state, a, b, ca, cb, at, nx, nz);
      // Whichever of them is still a ship is fouled on the other, wreck or
      // not, and has to back off her to get clear.
      if (a.alive) {
        a.fouled = b.id;
        a.foulT = fresh ? 0 : (a.foulT || 0) + dt;
        holdFast(a, nx, nz, dt);
      }
      if (b.alive) {
        b.fouled = a.id;
        b.foulT = fresh ? 0 : (b.foulT || 0) + dt;
        holdFast(b, -nx, -nz, dt);
      }
    }
  }
  // Where every boat's tower top is now, to tell next tick whether she was
  // coming up.
  for (const s of alive) {
    const c = shipClass(s);
    if (c.dive) s.topWas = bodySpan(s, c).top;
  }
  // Forget the pairs that have been clear long enough to strike again.
  for (const k in rams) if (rams[k] < state.t - RAM_REARM * 2) delete rams[k];
}

/**
 * A ship fouled on another: `nx`, `nz` is the way to the other hull.
 *
 * Way into the other ship comes off her fast -- there is a hull in the way --
 * and way along it comes off her more slowly, because she is dragging the
 * other ship with her or grinding along her side. Way that is taking her
 * clear is left alone, and that is how she gets out of it.
 */
function holdFast(ship, nx, nz, dt) {
  const along = Math.sin(ship.heading) * nx + Math.cos(ship.heading) * nz;
  const into = ship.speed * along;
  if (into < -0.05 && Math.abs(along) > 0.25) return;
  const stop = into > 0 ? FOUL_STOP * Math.abs(along) : 0;
  ship.speed *= Math.exp(-(FOUL_DRAG + stop) * dt);
  if (Math.abs(ship.speed) < 0.02) ship.speed = 0;
  // And the swing she had on her. Her stem is in the other ship's side.
  ship.yawRate = (ship.yawRate || 0) * Math.exp(-2 * dt);
}

/** How high a boat's casing stands over her keel, beyond her draft, in metres. */
const BOAT_FREEBOARD = 1.5;
/** How long a ship a boat has lifted takes to settle back, seconds. */
const LIFT_TAU = 2.2;
/** A ship lighter than this is one a boat coming up under her lifts rather than breaks on, tonnes. */
const LIGHT_TONS = 8000;
/** How hard a boat has to come up under a heavy ship to break her back on it. */
const SPLIT_RISE = 7;

/**
 * Where a hull is up and down, in metres from the surface: her keel, her deck,
 * and the top of what stands on her. A ship is where her draft and her
 * freeboard put her, a little higher while a boat has her lifted; a boat is
 * wherever her depth has taken her, her tower awash at periscope depth.
 */
export function bodySpan(ship, cls) {
  const lift = ship.lift || 0;
  if (!cls.dive) {
    const fb = freeboardOf(cls);
    // Settled deeper by the water in her, or going down: all of her is that
    // much lower, keel and upperworks together.
    const y = lift - Math.max(0, ship.sink || 0);
    let top = fb * 3 + y;
    // Going down by one end, the other end is up in the air: her top is
    // that, not her deck settled level.
    // Only a real one: a degree or two of settling by the head is still a
    // ship lying level under the sea.
    if (ship.sinking && Math.abs(ship.trim || 0) > 0.25) {
      top = Math.max(top, fb + y + Math.abs(Math.sin(ship.trim)) * cls.hull.length * 0.5);
    }
    // And broken in two, her halves go up on end, each with her broken end
    // down (see stepHalves in scene.js): the far end of each is up in the air
    // long after her deck has gone under.
    if (ship.sinking && ship.broke != null) top = Math.max(top, fb + y + cls.hull.length * 0.4);
    return { keel: -cls.hull.draft + y, deck: fb + y, top };
  }
  const d = ship.depth || 0;
  const deck = -d + BOAT_FREEBOARD + lift;
  return { keel: deck - BOAT_FREEBOARD - cls.hull.draft, deck, top: -d + cls.dive.periscope * 0.6 + lift };
}

/** The depth that puts the top of her tower just under this. */
function depthUnder(cls, y) {
  return Math.max(0, cls.dive.periscope * 0.6 - y + 0.1);
}

/** Holed along her bottom: the sea comes in at the full depth she draws. */
function openBottom(state, ship, cls, where, area) {
  openHull(state, ship, where, area / 2, 1, cls.hull.draft * 0.95);
  openHull(state, ship, where, area / 2, -1, cls.hull.draft * 0.95);
}

/**
 * A boat with her hull under another's keel: `U` the one above, `L` the boat.
 *
 * If her tower or her casing reaches up past that keel, the two have met --
 * and how depends on who was moving which way. Coming up under her is the
 * boat's own doing (see surfaceUnder); anything else is the other running
 * over her (see keelStrike). Either way the boat is then held down under that
 * keel until she is clear of it: there is a ship in the way.
 */
function underKeel(state, U, L, cu, cl, su, sl, rams, dt) {
  const prevTop = L.topWas ?? sl.top;
  if (sl.top <= su.keel) return;
  const A = hullBox(U, cu);
  const B = hullBox(L, cl);
  if (!hullsMeet(A, B, 0)) return;
  const key = `k${Math.min(U.id, L.id)}:${Math.max(U.id, L.id)}`;
  const fresh = !(rams[key] >= state.t - RAM_REARM);
  rams[key] = state.t;
  if (fresh) {
    const at = contactPoint(A, B);
    const rise = Math.max(0, sl.top - prevTop) / Math.max(dt, 1e-3);
    if (rise > 0.4 && prevTop <= su.keel + 0.05) surfaceUnder(state, U, L, cu, cl, at, rise);
    else {
      const va = velocityOf(U), vb = velocityOf(L);
      keelStrike(state, U, L, cu, cl, at, Math.hypot(va.x - vb.x, va.z - vb.z));
    }
  }
  // Held under the keel she hit, wherever her captain wants her.
  if (L.alive) {
    L.depth = Math.max(L.depth, depthUnder(cl, su.keel - (L.lift || 0)));
  }
}

/**
 * A ship running over a boat that is not deep enough: her keel into the
 * boat's tower and casing. The boat is driven under and crushed -- a destroyer
 * at speed was the end of any boat she caught like that -- and the ship comes
 * out of it with her bottom plating torn open along the boat's back.
 */
function keelStrike(state, U, L, cu, cl, at, v) {
  if (v < RAM_MIN * 0.5 || !mayHurt(state, U.team, L)) return;
  const pu = partAt(U, cu, at.x, at.z);
  const pl = partAt(L, cl, at.x, at.z);
  const mu = tonnage(cu), ml = tonnage(cl);
  const k = Math.min(1, v / 10);
  const out = [];
  // Her bottom, opened along the boat's back.
  const whereU = sectionAt(pu.station);
  damageShip(state, U, L, cu.hp * (0.01 + 0.05 * k) * Math.min(1.5, Math.sqrt(ml / mu) * 2), 'ram', whereU);
  if (v > 1.5) openBottom(state, U, cu, whereU, 1 + 8 * k);
  struck(out, U, pu, 'keel', 0.6 + cl.hull.beam * 0.2 * k);
  // And the boat, run down.
  const whereL = sectionAt(pl.station);
  const heavy = Math.min(2, Math.sqrt(mu / ml));
  if (k > 0.55 && mu > ml * 2.5 && cl.hull.length > 40 && !L.cut && L.broke == null) {
    damageShip(state, L, U, cl.hp * 0.4, 'ram', whereL);
    cutHer(state, L, clamp(pl.station, -0.5, 0.5), U.id, 'ram');
    struck(out, L, pl, 'split', cl.hull.beam);
  } else {
    damageShip(state, L, U, cl.hp * (0.12 + 0.45 * k) * heavy, 'ram', whereL);
    openHull(state, L, whereL, 2 + 14 * k, pl.side, cl.hull.draft * 0.5);
    struck(out, L, pl, 'crush', 1 + cl.hull.beam * 0.3 * k);
  }
  state.events.push({ e: 'collide', a: U.id, b: L.id, x: r(at.x), z: r(at.z), v: r(v), kind: 'keel', out });
}

/**
 * A boat blowing her tanks with a ship over her. She comes up into the ship's
 * bottom with the whole of her buoyancy behind her.
 *
 * Under a light ship -- a destroyer -- the ship gives: the boat heaves her up
 * and over to one side, and both of them come out of it stove in but whole.
 * Under a heavy one there is nothing to give but the boat. Hard enough and she
 * breaks her back on the keel and goes down in two halves; gently, or a big
 * boat under a cruiser, she still lifts her, if not much.
 */
function surfaceUnder(state, U, L, cu, cl, at, rise) {
  if (!mayHurt(state, U.team, L)) return;
  const pu = partAt(U, cu, at.x, at.z);
  const pl = partAt(L, cl, at.x, at.z);
  const mu = tonnage(cu), ml = tonnage(cl);
  const light = mu < LIGHT_TONS;
  const score = rise * Math.sqrt(mu / ml);
  const k = Math.min(1, rise / 3.5);
  const out = [];
  const whereU = sectionAt(pu.station);
  const whereL = sectionAt(pl.station);
  let kind = 'lift';
  if (!light && score >= SPLIT_RISE && cl.hull.length > 40 && !L.cut && L.broke == null) {
    kind = 'split';
    damageShip(state, L, U, cl.hp * 0.5, 'ram', whereL);
    cutHer(state, L, clamp(pl.station, -0.5, 0.5), U.id, 'ram');
    struck(out, L, pl, 'split', cl.hull.beam);
    damageShip(state, U, L, cu.hp * 0.01, 'ram', whereU);
    openBottom(state, U, cu, whereU, 2);
    struck(out, U, pu, 'keel', 0.6 + cl.hull.beam * 0.1);
  } else {
    // She is lifted, the more the lighter she is against the boat.
    const lift = clamp(rise * Math.sqrt(ml / mu) * 1.6, 0.2, 3);
    U.lift = Math.max(U.lift || 0, lift);
    // Over to the side away from the boat, and up by whichever end she is
    // under: on her beam a ship heels many degrees for a few of trim.
    const half = cu.hull.length / 2;
    U.liftHeel = -pu.side * clamp(Math.abs(pu.lx) / Math.max(1, cu.hull.beam) + 0.2, 0.2, 0.7)
      * clamp(lift / cu.hull.beam * 2.2, 0.03, 0.32);
    U.liftTrim = -clamp(pu.lz / half, -1, 1) * clamp(lift / half * 2, 0.005, 0.06);
    damageShip(state, U, L, cu.hp * (0.015 + 0.04 * k) * (light ? 1.4 : 1), 'ram', whereU);
    openBottom(state, U, cu, whereU, 1 + 6 * k);
    struck(out, U, pu, 'keel', 0.6 + cl.hull.beam * 0.2 * k);
    damageShip(state, L, U, cl.hp * (0.06 + 0.12 * k) * (light ? 1 : 1.6), 'ram', whereL);
    openHull(state, L, whereL, 1 + 6 * k, pl.side, cl.hull.draft * 0.4);
    struck(out, L, pl, 'crush', 1 + cl.hull.beam * 0.25 * k);
  }
  state.events.push({ e: 'collide', a: U.id, b: L.id, x: r(at.x), z: r(at.z), v: r(rise), kind: 'rise', lift: kind, out });
}

/**
 * The instant two hulls meet.
/**
 * The instant two hulls meet.
 *
 * What happens is a question of what hit what. A stem into a ship's side is a
 * ram: if the stem is the stronger -- a heavier ship's bow into a lighter
 * one's belt -- it goes through her, and driven hard enough it goes right
 * through and cuts her in two; if the side is the stronger the stem is what
 * gives, crumpled back on itself or, hard enough, torn off her altogether.
 * Two stems meeting is a head-on collision, and the weaker bow is the one
 * that is smashed. Two ships ground along each other's sides open each other
 * up and no more. Both always pay something.
 */
function ramImpact(state, a, b, ca, cb, at, nx, nz) {
  // Ships of one side, with friendly fire off: they bump, they foul, and
  // nobody is hurt.
  if (!mayHurt(state, a.team, b)) {
    state.events.push({ e: 'collide', a: a.id, b: b.id, x: r(at.x), z: r(at.z), v: 0, kind: 'bump', out: [] });
    return;
  }
  const va = velocityOf(a);
  const vb = velocityOf(b);
  // How fast they were closing, along the line they met on.
  const vc = (va.x - vb.x) * nx + (va.z - vb.z) * nz;
  const vrel = Math.hypot(va.x - vb.x, va.z - vb.z);
  if (vc < RAM_MIN && vrel < RAM_MIN * 2) return;
  const pa = partAt(a, ca, at.x, at.z);
  const pb = partAt(b, cb, at.x, at.z);
  // Driving her stem into the other: her bow is at the contact and she is
  // making way toward the other ship.
  const drives = (s, p, sx, sz) => p.part === 'bow'
    && s.speed * (Math.sin(s.heading) * sx + Math.cos(s.heading) * sz) > RAM_MIN * 0.5;
  const aRams = drives(a, pa, nx, nz);
  const bRams = drives(b, pb, -nx, -nz);
  const out = [];
  const v = Math.max(vc, 0);
  if (aRams && bRams) {
    headOn(state, a, b, ca, cb, pa, pb, v, out);
  } else if (aRams && pb.part !== 'bow') {
    ram(state, a, b, ca, cb, pa, pb, v, out);
  } else if (bRams && pa.part !== 'bow') {
    ram(state, b, a, cb, ca, pb, pa, v, out);
  } else if (aRams || bRams) {
    // Stem against stem, but only one of them driving it.
    headOn(state, a, b, ca, cb, pa, pb, v, out);
  } else {
    scrape(state, a, b, ca, cb, pa, pb, vrel, out);
  }
  // A ship that runs into a boat rides up over her: a boat's hull is mostly
  // under water, and the ship's forefoot and bottom go over and onto it.
  if (!ca.dive !== !cb.dive && Math.max(v, vrel) > 2) {
    const [S, cs, ps] = ca.dive ? [b, cb, pb] : [a, ca, pa];
    const k = Math.min(1, Math.max(v, vrel) / 12);
    const where = sectionAt(ps.station);
    damageShip(state, S, S === a ? b : a, cs.hp * 0.01 * k, 'ram', where);
    openBottom(state, S, cs, where, 1 + 5 * k);
    struck(out, S, ps, 'keel', 0.5 + cs.hull.beam * 0.1 * k);
  }
  state.events.push({
    e: 'collide', a: a.id, b: b.id, x: r(at.x), z: r(at.z), v: r(Math.max(v, vrel * 0.5)),
    kind: aRams && bRams ? 'head' : aRams || bRams ? 'ram' : 'scrape',
    out,
  });
}

/**
 * How wide her stem is where it does its work, in metres: a fraction of her
 * beam, because a stem is a knife edge flaring out behind it, and only so much
 * of even the biggest ship's bow is ever driven into anything.
 */
function stemWidth(cls) {
  return Math.min(cls.hull.beam, 40) * 0.22;
}

/** One ship's share of a collision, for the event: what it did to her and where. */
function struck(out, ship, p, what, size) {
  // Too small to open her: the paint and a dent in the plating, no more.
  if (size < SCRATCH_R && !['cut', 'chop', 'split', 'keel', 'crush'].includes(what)) what = 'scratch';
  out.push({ ship: ship.id, what, lx: r(p.lx), lz: r(p.lz), r: r(size) });
}

/**
 * How hard a stem has to be driven to go right through her, in metres a
 * second: more the beamier she is, because that is how much ship there is to
 * cut. A destroyer is cut in two by anything heavier driven into her at fifteen
 * knots; a cruiser wants twenty.
 */
function cutNeed(cls) {
  return 5 + 0.25 * cls.hull.beam;
}

/** How hard a stem is driven, for a ship of this weight into one of that. */
function driveOf(mr, mt, v) {
  return v * Math.min(1.35, Math.sqrt((2 * mr) / (mr + mt)));
}

/**
 * Her stem into another ship's side.
 */
function ram(state, R, T, cr, ct, pr, pt, v, out) {
  const margin = stemStrength(cr) / Math.max(1, sideStrength(ct, pt.station));
  const drive = driveOf(tonnage(cr), tonnage(ct), v);
  // What it takes to go right through her: more the beamier she is, because
  // that is how much ship there is to cut.
  const need = cutNeed(ct);
  const whereT = sectionAt(pt.station);
  if (margin >= 1) {
    // The stem is the stronger. It goes into her.
    const score = drive * Math.min(1.6, Math.sqrt(margin));
    const f = score / need;
    if (f >= 1 && ct.hull.length > 40 && !T.cut && T.broke == null) {
      damageShip(state, T, R, ct.hp * 0.06, 'ram', whereT);
      cutHer(state, T, pt.station, R.id, 'ram');
      struck(out, T, pt, 'cut', ct.hull.beam);
    } else {
      // A gash in her side, as deep as the stem got.
      // As wide as her stem drove it and no wider than her stem is: a much
      // stronger stem opens more of her, a stem barely the stronger a slit.
      const k = Math.min(1, f);
      const edge = Math.min(2.2, Math.sqrt(margin));
      damageShip(state, T, R, ct.hp * (0.02 + 0.1 * k * k) * Math.min(1.2, edge), 'ram', whereT);
      openHull(state, T, whereT, 2 + 20 * k * k * edge, pt.side, ct.hull.draft * 0.55);
      struck(out, T, pt, 'gash', Math.min(stemWidth(cr) * 1.2, 0.5 + Math.min(ct.hull.beam, 40) * 0.12 * k * edge + 1.2 * k));
    }
    // And her own bow pays for it: crumpled plating and a sprung forefoot.
    const bowR = sectionAt(pr.station);
    const k = Math.min(1, v / need);
    damageShip(state, R, T, cr.hp * (0.015 + 0.04 * k), 'ram', bowR);
    if (v > 2) openHull(state, R, bowR, 1 + 4 * k, pr.side, cr.hull.draft * 0.3);
    struck(out, R, pr, 'dent', 0.5 + stemWidth(cr) * 0.35 * k);
  } else {
    // The side is the stronger, and her stem is what goes.
    crushBow(state, R, T, cr, pr, v * (1 - margin * 0.8), out);
    // The ship she hit is opened too, if not as badly -- by as much as the
    // stem was worth against that side, the weight behind it and how fast it
    // was driven. A destroyer into a battleship's belt scratches her paint.
    const mass = clamp(Math.sqrt(tonnage(cr) / tonnage(ct)), 0.08, 1);
    const k = Math.min(1, (drive / need) * (0.12 + margin) * mass * 1.6);
    damageShip(state, T, R, ct.hp * (0.002 + 0.05 * k) * (0.3 + 0.7 * mass), 'ram', whereT);
    if (k > 0.2) openHull(state, T, whereT, 1 + 10 * k * k, pt.side, ct.hull.draft * 0.5);
    struck(out, T, pt, 'gash', 0.3 + stemWidth(cr) * 0.55 * k);
  }
}

/**
 * Stem to stem. The weaker bow is smashed in, and driven hard enough is torn
 * off her; the stronger is crumpled, but stays.
 */
function headOn(state, a, b, ca, cb, pa, pb, v, out) {
  const sa = stemStrength(ca) * Math.sqrt(tonnage(ca));
  const sb = stemStrength(cb) * Math.sqrt(tonnage(cb));
  const [W, S, cw, cs, pw, ps] = sa <= sb ? [a, b, ca, cb, pa, pb] : [b, a, cb, ca, pb, pa];
  const ratio = Math.min(sa, sb) / Math.max(sa, sb);
  if (ratio > 0.85) {
    // Stems as good as each other: both of them go, and neither ship comes
    // out of it the better.
    crushBow(state, W, S, cw, pw, v * 0.36, out);
    crushBow(state, S, W, cs, ps, v * 0.36, out);
    return;
  }
  crushBow(state, W, S, cw, pw, v * (1 - ratio * 0.6), out);
  // The stronger stem, crumpled by what it went through.
  const need = cutNeed(cs);
  const k = Math.min(1, (v / need) * (0.3 + ratio));
  const where = sectionAt(ps.station);
  damageShip(state, S, W, cs.hp * (0.01 + 0.06 * k) * clamp(Math.sqrt(tonnage(cw) / tonnage(cs)), 0.15, 1), 'ram', where);
  if (k > 0.25) {
    openHull(state, S, where, 1 + 8 * k, 1, cs.hull.draft * 0.35);
    openHull(state, S, where, 1 + 8 * k, -1, cs.hull.draft * 0.35);
  }
  struck(out, S, ps, 'dent', 0.3 + stemWidth(cw) * 0.6 * k);
}

/**
 * Her stem gives. `crush` is how hard it was driven into something it could
 * not go through, in metres a second.
 */
function crushBow(state, R, T, cr, pr, crush, out) {
  const where = sectionAt(pr.station);
  if (crush >= CHOP_V && cr.hull.length > 40 && !R.cut && R.broke == null) {
    // Torn off her. Where depends on how hard: the forefoot at the least, back
    // to her collision bulkhead and beyond if it was hard enough.
    const sp = hullSpan(R);
    const back = clamp(0.24 + 0.05 * (crush - CHOP_V), 0.24, 0.42);
    const at = pr.station > 0 ? sp.hi - back : sp.lo + back;
    damageShip(state, R, T, cr.hp * 0.05, 'ram', where);
    cutHer(state, R, at, T.id, 'ram');
    struck(out, R, pr, 'chop', cr.hull.beam);
    return;
  }
  // Smashed in: her bow crumpled back on itself and open to the sea.
  const k = Math.min(1, crush / CHOP_V);
  damageShip(state, R, T, cr.hp * (0.03 + 0.11 * k), 'ram', where);
  const open = 2 + 18 * k;
  openHull(state, R, where, open, 1, cr.hull.draft * 0.45);
  openHull(state, R, where, open, -1, cr.hull.draft * 0.45);
  struck(out, R, pr, 'smash', 0.8 + stemWidth(cr) * 0.8 * k);
}

/** Two sides ground together. Plating opened along both, and nothing worse. */
function scrape(state, a, b, ca, cb, pa, pb, vrel, out) {
  const k = Math.min(1, vrel / 12);
  for (const [s, o, c, p] of [[a, b, ca, pa], [b, a, cb, pb]]) {
    const where = sectionAt(p.station);
    damageShip(state, s, o, c.hp * 0.03 * k * Math.sqrt(tonnage(shipClass(o)) / tonnage(c)), 'ram', where);
    if (vrel > 3) openHull(state, s, where, 1 + 6 * k, p.side, c.hull.draft * 0.3);
    struck(out, s, p, 'scrape', 0.4 + 1.6 * k * Math.min(1, Math.sqrt(tonnage(shipClass(o)) / tonnage(c))));
  }
}

/**
 * A piece of her is cut off.
 *
 * `at` is the station she parts at (-1 stern .. 1 stem). She is the piece that
 * still has her bridge on it; the rest is wreckage, gone from her. Everything
 * standing on it is gone with it -- turrets, mountings, tubes, searchlights --
 * and so is whatever was in the compartments it carried away: a ship that has
 * lost her stern has lost her screws and her rudder, and one cut through her
 * machinery spaces has no machinery. The compartment the cut runs through, or
 * the first sound one behind it, is open to the sea across the whole of her
 * section, and she floods through it.
 */
export function cutHer(state, ship, at, by = 0, why = 'ram') {
  if (!ship.alive || ship.cut || ship.broke != null) return false;
  const cls = shipClass(ship);
  at = Math.round(clamp(at, -0.82, 0.82) * 1000) / 1000;
  const keep = bridgeStation(cls) >= at ? 1 : -1;
  ship.cut = { at, keep };
  // The compartments it took, and the one it left open.
  let open = null;
  let openGap = Infinity;
  const lose = cutLoses(at, keep);
  for (const s of SECTIONS) {
    if (s.from === null) continue;
    const c = ship.sections[s.k];
    if (lose.includes(s.k)) {
      c.lost = true;
      c.hp = 0;
      c.water = 0; c.wP = 0; c.wS = 0;
      c.holeP = 0; c.holeS = 0; c.inflow = 0; c.holes = []; c.posArea = 0; c.rent0 = 0;
      c.fire = 0; c.burnt = 0;
      continue;
    }
    // The nearest of what is left to the cut is the one that is open.
    const gap = keep > 0 ? Math.max(0, s.from - at) : Math.max(0, at - s.to);
    if (gap < openGap) { openGap = gap; open = s.k; }
  }
  if (open) {
    const c = ship.sections[open];
    // Wrecked where she parted -- but the bulkhead at the far end of it is
    // still a bulkhead, and it is what the rest of her floats on.
    c.hp = Math.min(c.hp, c.max * 0.28);
    const area = cls.hull.beam * cls.hull.draft * 0.55;
    openHull(state, ship, open, area, 1, cls.hull.draft * 0.85);
    openHull(state, ship, open, area, -1, cls.hull.draft * 0.85);
    c.side = 0;
  }
  ship.hp = hullIntegrity(ship);
  // Everything that was standing on the piece that went.
  const gone = (spec) => spec && severed(ship, cls, spec.z || 0);
  ship.turrets.forEach((t) => { if (gone(cls.turrets[t.id])) t.hurt = 3; });
  ship.secMounts.forEach((m, i) => { if (gone(cls.secondary?.mounts?.[m.id ?? i])) m.hurt = 3; });
  ship.torpMounts.forEach((m) => { if (gone(cls.torpedoes?.mounts?.[m.id])) m.lost = true; });
  if (ship.manned && ship.manned.k === 'torp' && ship.torpMounts[ship.manned.i]?.lost) ship.manned = null;
  ship.flooding = floodedCount(ship);
  ship.fires = burningCount(ship);
  state.events.push({
    e: 'cut', ship: ship.id, at: r(at), keep, by, why,
    x: r(ship.x), z: r(ship.z), h: r(ship.heading), v: r(ship.speed),
  });
  // Nobody steers a ship from the half without the bridge, and nothing drives
  // one from the half without the machinery or the screws.
  if (ship.sections.mid.lost || ship.sections.stern.lost) ship.speed *= 0.5;
  if (ship.hp <= 0) startSinking(state, ship, 'shattered', by);
  return true;
}

/**
 * Which of her compartments a cut at `at` takes with it, keeping the `keep`
 * side (+1 forward of the cut, -1 abaft it): every one that has less than a
 * third of itself left on her side of it.
 */
export function cutLoses(at, keep) {
  const out = [];
  for (const s of SECTIONS) {
    if (s.from === null) continue;
    const len = s.to - s.from;
    const kept = keep > 0
      ? clamp(s.to - Math.max(s.from, at), 0, len) / len
      : clamp(Math.min(s.to, at) - s.from, 0, len) / len;
    if (kept < 0.35) out.push(s.k);
  }
  return out;
}

/**
 * What she can still make, as a fraction of her speed, once a piece of her has
 * gone: nothing without her machinery or her screws, and not much with her
 * bow gone, because she is pushing a flat wall of torn steel through the
 * water and every knot of it is forcing the sea into her.
 */
export function cutDrive(ship) {
  if (!ship.cut) return 1;
  const S = ship.sections;
  if (S.mid.lost || S.stern.lost) return 0;
  return ship.cut.keep < 0 ? 0.45 : 0.8;
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

// ---------------------------------------------------------------------------
// Guns given a target by name
// ---------------------------------------------------------------------------

/** The kinds of mounting the targeting panel can put on a ship. */
export const ASSIGN_KINDS = ['main', 'sec', 'dp', 'torp'];

/** The dual-purpose mountings of her light battery, by index in it, with their gun. */
export function dpMounts(cls) {
  const out = [];
  let at = 0;
  for (const g of (cls.aa && cls.aa.guns) || []) {
    g.mounts.forEach((m, j) => { if (g.role === 'dp') out.push({ i: at + j, spec: m, gun: g }); });
    at += g.mounts.length;
  }
  return out;
}

/** Whether she has mounting `i` of this kind at all. */
function hasMount(cls, kind, i) {
  if (!Number.isInteger(i) || i < 0) return false;
  if (kind === 'main') return i < (cls.turrets || []).length;
  if (kind === 'sec') return !!cls.secondary && i < cls.secondary.mounts.length;
  if (kind === 'torp') return !!cls.torpedoes && i < cls.torpedoes.mounts.length;
  if (kind === 'dp') return dpMounts(cls).some((d) => d.i === i);
  return false;
}

/**
 * Put one of her mountings on an enemy ship by name, or -- with no target --
 * give it back to her gunnery officer. Returns whether anything was done.
 */
export function assignMount(state, ship, kind, i, targetId) {
  if (!ship || !ASSIGN_KINDS.includes(kind)) return false;
  const cls = shipClass(ship);
  if (!hasMount(cls, kind, i)) return false;
  ship.assign = ship.assign || {};
  const key = `${kind}:${i}`;
  if (!targetId) { delete ship.assign[key]; return true; }
  // A ship, or a gun ashore -- which a torpedo cannot be sent at.
  const foe = state.ships.find((s) => s.id === targetId)
    || (kind !== 'torp' ? (state.batteries || []).find((b) => b.id === targetId) : null);
  if (!foe || !foe.alive || foe.id === ship.id || !mayHurt(state, ship.team, foe)) return false;
  ship.assign[key] = foe.id;
  return true;
}

/**
 * Switch one of her mountings off, or back on. A mounting that is off holds
 * its fire whoever has it -- her gunnery officer, a ship given it by name, or
 * a captain standing at it. Returns whether anything was done.
 */
export function setMountOff(ship, kind, i, off) {
  if (!ship || !ASSIGN_KINDS.includes(kind)) return false;
  if (!hasMount(shipClass(ship), kind, i)) return false;
  ship.off = ship.off || {};
  if (off) ship.off[`${kind}:${i}`] = true;
  else delete ship.off[`${kind}:${i}`];
  return true;
}

/** Whether her captain has switched that mounting off. */
export function mountOff(ship, kind, i) {
  return !!(ship.off && ship.off[`${kind}:${i}`]);
}

/**
 * The ship a mounting has been put on, while she is there to be shot at; a
 * mounting whose ship has gone down is given back to her gunnery officer.
 */
function assignedFoe(state, ship, kind, i) {
  const id = ship.assign && ship.assign[`${kind}:${i}`];
  if (!id) return null;
  const foe = state.ships.find((s) => s.id === id)
    || (state.batteries || []).find((b) => b.id === id);
  if (!foe || !foe.alive) { delete ship.assign[`${kind}:${i}`]; return null; }
  return foe;
}

/** Whether her side can see it. A gun ashore has been plotted from the chart. */
const inSight = (foe, team) => (foe.spottedBy ? !!foe.spottedBy[team] : true);

/**
 * Where a mounting that has been given a ship is to lay, or null when it has
 * not been given one. `idle` when she is beyond `range` or nobody on her side
 * can see her: a gun on a ship it cannot reach does not fire at the horizon,
 * it waits. Led by `speed` metres a second of projectile, or by the gun's own
 * flight time when `battery` is given.
 */
export function assignedAim(state, ship, kind, i, range, battery = null, speed = 0) {
  const foe = assignedFoe(state, ship, kind, i);
  if (!foe) return null;
  const d = dist(ship.x, ship.z, foe.x, foe.z);
  if (d > range || !inSight(foe, ship.team)) return { foe, idle: true, d, x: foe.x, z: foe.z };
  let x = foe.x, z = foe.z;
  if (!foe.speed) {
    // Standing still, which a gun ashore always is: nothing to lead.
  } else if (battery) {
    const tof = solveBallistic(battery, clamp(d, 400, range), 10).tof;
    x = foe.x + Math.sin(foe.heading) * foe.speed * tof;
    z = foe.z + Math.cos(foe.heading) * foe.speed * tof;
  } else if (speed > 0) {
    const lp = leadPoint(ship.x, ship.z, foe, speed);
    x = lp.x; z = lp.z;
  }
  return { foe, idle: false, d: dist(ship.x, ship.z, x, z), x, z };
}

/** Whether any of her mountings of this kind has been given a ship it can shoot at now. */
export function assignedReady(state, ship, kind) {
  const cls = shipClass(ship);
  const n = kind === 'main' ? ship.turrets.length : kind === 'torp' ? ship.torpMounts.length : 0;
  const range = kind === 'main' ? cls.gun.range : kind === 'torp' && cls.torpedoes ? cls.torpedoes.range : 0;
  for (let k = 0; k < n; k++) {
    const id = kind === 'main' ? ship.turrets[k].id : ship.torpMounts[k].id;
    const a = assignedAim(state, ship, kind, id, range);
    if (a && !a.idle) return true;
  }
  return false;
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
 * Train a mounting from bearing `a` toward bearing `b`, by at most `maxStep`,
 * without ever passing through its stops.
 *
 * The short way round is the way to go only for a mounting that trains all
 * round. Anything else has a dead arc -- her own bridge, her funnel, the
 * turret behind it -- and a turret laid at a hundred and thirty degrees to
 * port that is ordered to a hundred and thirty to starboard goes back round
 * through her bow, the long way, because the short way is through the bridge.
 * Both bearings are read as offsets from the middle of its arc, which is the
 * frame its stops are fixed in, and it moves from one to the other without
 * wrapping.
 */
export function trainWithin(a, b, maxStep, spec) {
  if (!spec || !(spec.arc < Math.PI)) return approachAngle(a, b, maxStep);
  const from = angleDelta(spec.angle, a);
  const to = angleDelta(spec.angle, b);
  const d = to - from;
  if (Math.abs(d) <= maxStep) return wrapAngle(spec.angle + to);
  return wrapAngle(spec.angle + from + Math.sign(d) * maxStep);
}

/**
 * The least a mounting can be laid at on a bearing in her own frame, off one
 * of the lists of sectors its datasheet may carry:
 *
 *   lift  how high its barrels have to be to clear her there -- a bulwark
 *         under the guns of a low turret trained on the beam, a boat, the
 *         rail of the next tub -- so it is laid no lower;
 *   mask  how high its fire has to go to clear her there -- over her stem,
 *         over the turret in front -- so it does not fire any lower. A sector
 *         with no elevation in it is one it cannot fire on at all.
 *
 * Each sector is [from, to, el], running from `from` round to `to` the
 * positive way. They are measured off the model she is drawn with, by
 * build/survey-arcs.mjs. -Infinity where the list says nothing, and for a
 * mounting that has none -- which is every mounting on a ship nobody has
 * surveyed.
 */
export function layFloor(list, local) {
  let low = -Infinity;
  if (!list) return low;
  const TAU = Math.PI * 2;
  for (const s of list) {
    const span = (((s[1] - s[0]) % TAU) + TAU) % TAU;
    const at = (((local - s[0]) % TAU) + TAU) % TAU;
    if (at > span) continue;
    const el = s.length > 2 ? s[2] : Infinity;
    if (el > low) low = el;
  }
  return low;
}

/**
 * Train a mounting a tick toward a bearing and lay it a tick toward an
 * elevation: never through its stops, and never through her. Where its `lift`
 * says its barrels have to be up to clear something of hers, they are laid
 * that high whatever the solution wants, and they come up before it trains on
 * -- a layer lifts his guns over the bulwark and then swings them, not the
 * other way round.
 */
function layMounting(m, spec, bearing, elev, trainStep, elevStep, stops) {
  const next = trainWithin(m.angle, bearing, trainStep, spec);
  if (m.elev >= layFloor(spec.lift, next) - 0.005) m.angle = next;
  const floor = Math.max(layFloor(spec.lift, m.angle), layFloor(spec.lift, next));
  const up = clamp(Math.max(elev, floor), stops.min, stops.max);
  m.elev += clamp(up - m.elev, -elevStep, elevStep);
  m.elev = clamp(m.elev, stops.min, stops.max);
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
export function gunState(ship, cls, spec, m, lasting = false) {
  if (!m) return 3;
  if (m.hurt >= 3) return 3;
  // Standing on a piece of her that has been cut off.
  if (spec && ship.cut && severed(ship, cls, spec.z || 0)) return 3;
  // Green water over it: out of action until the sea has run off and her
  // crew are back on their feet. Not for long, and not damage -- a ship is
  // not out of the fight because a sea has come over her forecastle, so the
  // question of whether she can still fight does not count it (`lasting`).
  if (!lasting && m.swamp > 0) return 3;
  if (spec && magazineDrowned(ship, cls, spec)) return 3;
  // Under the sea: it does not fire, from the moment it is under.
  if (spec && (ship.sinking || !cls.dive) && mountDrowned(ship, spec)) return 3;
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
  if (c.hp <= 0 || c.lost) return 3;
  // Gone down through a hole in the deck it stood on (see undercut), or
  // wrecked by a bomb that came down on it (see bombOnMount).
  if ((ship.fell || ship.ko) && mountFell(ship, 'aa', lightMounts(cls).indexOf(spec))) return 3;
  if (ship.cut && severed(ship, cls, spec.z || 0)) return 3;
  if (magazineDrowned(ship, cls, spec)) return 3;
  if ((ship.sinking || !cls.dive) && mountDrowned(ship, spec)) return 3;
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
function turretDesired(ship, cls, t, aim = null) {
  const spec = cls.turrets[t.id];
  const world = aim ? headingTo(ship.x, ship.z, aim.x, aim.z) : headingTo(ship.x, ship.z, ship.aimX, ship.aimZ);
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
  const elev = solveBallistic(cls.gun, d, 12 - aimHeight(state, ship.aimX, ship.aimZ)).elev;
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
    // Switched off: it stands where it is and goes on loading.
    if (mountOff(ship, 'main', t.id)) { t.laid = false; if (t.cooldown > 0) t.cooldown -= dt; continue; }
    // A turret somebody has gone down to takes his bearing and nobody else's.
    // Every other turret aboard goes on being laid by her fire control, which
    // is the whole point: manning A turret does not stop B turret shooting.
    const held = isManned(ship, 'main', t.id);
    const spec = cls.turrets[t.id];
    // Given a ship by name: laid on her and nothing else, and while she is
    // out of reach or out of sight it stands where it is and does not fire.
    const given = held ? null : assignedAim(state, ship, 'main', t.id, cls.gun.range, cls.gun);
    if (given && given.idle) { t.laid = false; if (t.cooldown > 0) t.cooldown -= dt; continue; }
    const want = held ? mannedDesired(ship, spec) : turretDesired(ship, cls, t, given);
    // A gun that cannot bear comes down to the loading angle rather than
    // standing there pointing at the sky over her own bridge -- and one that
    // can never goes past its own stops.
    // How far up, on the range the layer is holding rather than the range her
    // fire control is working -- a man at a gun is shooting at what is in his
    // sight, not at the plot's solution.
    const sol = held
      ? solveBallistic(cls.gun,
        clamp(dist(ship.x, ship.z, ship.manX, ship.manZ), 400, cls.gun.range),
        12 - aimHeight(state, ship.manX, ship.manZ)).elev
      : given ? solveBallistic(cls.gun, clamp(given.d, 400, cls.gun.range),
        12 - aimHeight(state, given.x, given.z)).elev : elev;
    // Off her deck: her stops are on the mounting, and a turret trained out
    // over the side she is lying down to has to come up further to put its
    // shells where the solution says, and one over the high side less.
    const deck = sol - deckTilt(ship, want.angle);
    const aim = want.blocked ? 0.03 : clamp(deck, stops.min, stops.max);
    layMounting(t, spec, want.angle, aim, cls.gun.traverse * dt, 0.5 * dt, stops);
    // Off the target as well as off the arc: a solution her guns cannot reach
    // is a solution she has not got, and she checks fire rather than shooting
    // at the stop and missing by a mile every time. Nor one that would put
    // her own shells into her: laid on a ship close aboard over her own stem,
    // she holds fire until the range opens or the bearing does.
    t.laid = !want.blocked && deck <= stops.max && deck >= stops.min
      && deck >= layFloor(spec.mask, want.angle);
    if (t.cooldown > 0) t.cooldown -= dt;
  }
}

/**
 * The order before the action.
 *
 * Nothing on a warship opens fire because it happens to be loaded: an
 * officer gives the word and the guns go a beat after it. So the first round
 * of anything -- the main battery, the secondaries, the tubes, the close-range
 * guns, the charges -- waits on an order: the word is given (an `order` event,
 * which the bridge shouts) and the weapon goes ORDER_WINDUP seconds later if
 * it still bears. Every salvo is ordered, not only the first of an action:
 * the guns of one salvo that come on a moment apart go on the one word, and
 * the next salvo waits on the next. The close-range battery, which fires
 * continuously while it has something to fire at, is ordered each time it
 * takes up a target after a pause.
 *
 * Only a battle that asks for orders has them (state.orders, which a Room
 * sets); a gun a captain has gone down to and is laying himself fires when he
 * says, and does not come through here.
 */
export const ORDER_WINDUP = 1;
const ORDER_QUIET = { main: 2, sec: 2, aa: 8, torp: 2, dc: 2 };
/** How long a word holds if the weapon could not take it up -- lost her, say. */
const ORDER_LAPSE = 6;

/**
 * True when `kind` may fire this tick. False while the word is being given,
 * and the first time it is asked for after a quiet spell -- which is when the
 * word is given. `quiet` overrides how long a quiet spell is; `many` says
 * whether it is a spread of fish or more than one aeroplane.
 */
export function orderGiven(state, ship, kind, { quiet = ORDER_QUIET[kind] ?? 20, many = false } = {}) {
  if (!state.orders) return true;
  const o = ship.orders || (ship.orders = {});
  const g = o[kind] || (o[kind] = { at: -1e9, last: -1e9 });
  const t = state.t;
  // Still at it: the word given for this engagement still stands.
  if (t - g.last <= quiet) { g.last = t; return true; }
  if (g.at > g.last) {
    // Given, and the beat not yet up.
    if (t < g.at + ORDER_WINDUP) return false;
    // Given, and now is when it goes.
    if (t <= g.at + ORDER_WINDUP + ORDER_LAPSE) { g.last = t; return true; }
  }
  g.at = t;
  state.events.push({ e: 'order', ship: ship.id, k: kind, many: many ? 1 : 0 });
  return false;
}

/** Whether the word for `kind` has been given and is waiting on its beat. */
export function orderPending(state, ship, kind) {
  const g = ship.orders && ship.orders[kind];
  return !!(state.orders && g && g.at > g.last && state.t < g.at + ORDER_WINDUP + ORDER_LAPSE);
}

export function canFire(ship) {
  if (!ship.alive) return false;
  // Everything on a submarine's casing is outside the pressure hull and full
  // of water the moment she is down. Only the tubes work under.
  if (gunsDrowned(ship)) return false;
  const cls = shipClass(ship);
  return ship.turrets.some((t) => t.cooldown <= 0 && t.disabled <= 0
    && t.laid !== false && !mountOff(ship, 'main', t.id) && gunState(ship, cls, cls.turrets[t.id], t) < 3);
}

/**
 * Fire every turret that is loaded and on target. Returns barrels fired.
 *
 * `only` fires one mounting and no others, which is what a trigger under a
 * captain's hand does. Without it her fire control fires the battery and
 * leaves out whichever mounting somebody has gone down to -- a manned gun
 * fires when its layer says so and not when the plot says so.
 */
export function fireGuns(state, ship, only = null, { assignedOnly = false } = {}) {
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
  const d0 = clamp(dist(ship.x, ship.z, aimAt.x, aimAt.z), 400, gun.range);
  // And how high the thing is: a gun on a hill is not on the sea.
  const up0 = aimHeight(state, aimAt.x, aimAt.z);
  let fired = 0;

  const stops = gunLimits(gun);
  const solution0 = solveBallistic(gun, d0, 12 - up0).elev;
  for (const t of ship.turrets) {
    if (only !== null && t.id !== only) continue;
    if (t.id === held) continue;
    if (t.cooldown > 0 || t.disabled > 0) continue;
    if (mountOff(ship, 'main', t.id)) continue;
    const tSpec = cls.turrets[t.id];
    const cond = gunState(ship, cls, tSpec, t);
    if (cond >= 3) continue;
    const manning = only !== null && ship.manned && ship.manned.k === 'main';
    // A turret given a ship fires at her, on her own range, and not at all
    // while she is out of reach; the rest fire on the plot's solution.
    const given = manning ? null : assignedAim(state, ship, 'main', t.id, gun.range, gun);
    if (given && given.idle) continue;
    if (!given && assignedOnly) continue;
    const d = given ? clamp(given.d, 400, gun.range) : d0;
    const up = given ? aimHeight(state, given.x, given.z) : up0;
    const solution = given ? solveBallistic(gun, d, 12 - up).elev : solution0;
    const want = manning ? mannedDesired(ship, tSpec) : turretDesired(ship, cls, t, given);
    if (want.blocked) continue;
    // Nor past her stops, which are on her deck: a gun that will not come
    // down that far does not shoot at something alongside her, and one that
    // will not go up that far does not reach -- and lying over, the side she
    // is down to reaches less far and the side she is up to cannot come down
    // on something close.
    const deck = solution - deckTilt(ship, want.angle);
    if (deck > stops.max || deck < stops.min) continue;
    // Nor through her. A turret laid over her stem, her bridge or the turret
    // in front of it only fires once the solution has its shells clear.
    if (deck < layFloor(tSpec.mask, want.angle)) continue;
    if (Math.abs(angleDelta(t.angle, want.angle)) > 0.035) continue;
    // Laid, loaded and bearing: the word first, unless a man at the gun is
    // the one firing it.
    if (!manning && !orderGiven(state, ship, 'main')) continue;

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
      const s2 = solveBallistic(gun, aimDist, mz.y - up);
      const b = bearing + Math.atan2(lat, Math.max(600, d));
      // High or low by what she rolled while it was being laid.
      const el = s2.elev + layError(state, ship, t.angle);
      const vh = s2.v * Math.cos(el);
      fireShell(state, {
        id: eid(),
        owner: ship.id, team: ship.team,
        x: mz.x, z: mz.z, y: mz.y,
        vx: Math.sin(b) * vh, vz: Math.cos(b) * vh, vy: s2.v * Math.sin(el),
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
    if (!hit) {
      // Into the sea beside her, a couple of seconds after it left the rack,
      // which is how long it takes to get there (see the drop in ordnance.js).
      waterBlow(state, best.x + Math.sin(ang) * off, best.z + Math.cos(ang) * off, 320, 2.2);
      continue;
    }
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
  // The mounting it came down on, if it came down on one -- settled by that
  // mounting's own roof, and not a second time by the burst below.
  const onMount = bombOnMount(state, ship, owner, P, at);
  wreckContents(state, ship, through >= 1 ? cell : 'works', bore, 'bomb', onMount ? null : at);
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
  const was = { x: p.x, y: p.y ?? 220, z: p.z };
  p.x = msg.x;
  p.z = msg.z;
  p.heading = wrapAngle(msg.h);
  // And how high she is, which matters now that flying into things is a thing
  // an aeroplane can do. Held to what an airframe could actually have done
  // since the last word from her, the same way her position is: nobody drops a
  // flight from cruising height into somebody's boat deck in one message.
  if (Number.isFinite(msg.p)) p.pitch = clamp(msg.p, -1.5, 1.5);
  // And her bank, which is all the way round now that she can be rolled.
  if (Number.isFinite(msg.bk)) p.bank = wrapAngle(msg.bk);
  // Where her guns are laid, which is her nose and not her flight path, and
  // what she is doing through the air: the rounds go down the one at their
  // muzzle velocity plus the other.
  p.gunPitch = Number.isFinite(msg.gp) ? clamp(msg.gp, -1.57, 1.57) : undefined;
  if (Number.isFinite(msg.v)) p.speed = clamp(msg.v, 0, 260);
  if (Number.isFinite(msg.y)) {
    const climb = 140 * since + 60;
    p.y = clamp(msg.y, Math.max(-4, (p.y ?? 220) - climb), Math.min(9000, (p.y ?? 220) + climb));
  }
  // A pilot diving on a ship covers fifteen or twenty metres between one word
  // from him and the next, and a destroyer is ten metres across: the line she
  // flew is walked, not just the point she got to, so she cannot pass through
  // a hull between two messages. The first point of it inside an enemy is
  // where she stops, and the tick puts her into that ship.
  sweepIntoShip(state, p, was);
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
/**
 * And how long the rounds are worth anything: two and a half seconds, which
 * at muzzle velocity plus her own speed is the better part of three
 * kilometres -- far enough that a ship on the horizon of the sight is a ship
 * in reach of it.
 */
const BULLET_LIFE = 2.5;
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
  // A quarter of a milliradian: half a metre at two kilometres. The pilot's
  // guns go where the ring is, near or far, and the formation round him is
  // flying on him rather than adding its own spread to his.
  return 0.00025 + 0.00005 * Math.max(0, (p.count || 1) - 1);
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
  burst(state, p, P, dt);
  return true;
}

/**
 * The guns going, for as long as `dt` stands for: on their own rhythm rather
 * than every tick. The pilot's trigger and the simulation's own fighter pilots
 * (see dogfight.js) both come through here, so a bot's burst is the same
 * rounds down the same bore as a player's.
 */
function burst(state, p, P, dt, scale = 1) {
  p.gunAt = (p.gunAt ?? 0) + dt;
  if (p.gunAt < 1 / BURST_RATE) return;
  const rounds = Math.min(4, Math.floor(p.gunAt * BURST_RATE));
  p.gunAt = 0;

  // What the flight's guns are worth for the time this burst stands for, and
  // it is two different numbers. Rifle calibre into another aeroplane is
  // lethal; the same rounds into a warship's plating are nothing, and what
  // they are actually for is the people standing in the open on her.
  const air = (P.fighterGuns ?? FIGHTER_GUNS) * (p.count || 1) * scale / BURST_RATE;
  const ship2 = (P.strafeDamage ?? 260) * (p.count || 1) * scale / BURST_RATE;
  const spread = burstSpread(p);
  for (let i = 0; i < rounds; i++) {
    fireBullet(state, p, air, ship2, spread);
  }
}

/** One tracer and the rounds it stands for, down the bore and off she goes. */
function fireBullet(state, p, dmg, hurt, spread) {
  const pitch = p.gunPitch ?? p.pitch ?? 0;
  // Gaussian-ish, from two uniforms: a pattern with a dense middle and a few
  // wide ones, which is what a burst looks like on a butt.
  const sx = (state.rng() + state.rng() - 1) * spread;
  const sy = (state.rng() + state.rng() - 1) * spread;
  const h = wrapAngle(p.heading + sx);
  const el = pitch + sy;
  const cp = Math.cos(el);
  // Out of a moving aeroplane, so they leave at the muzzle velocity on top of
  // her own speed -- which is why the rounds out of a fighter go straight down
  // the line of her sight rather than falling back behind her.
  const vb = BULLET_V + clamp(p.speed || 0, 0, 260);
  const b = {
    id: eid(),
    team: p.team, owner: p.owner, plane: p.id,
    x: p.x, y: (p.y ?? 220) - 1.2, z: p.z,
    vx: Math.sin(h) * cp * vb,
    vy: Math.sin(el) * vb,
    vz: Math.cos(h) * cp * vb,
    life: 0, dmg, hurt,
  };
  state.bullets.push(b);
  // The tracer. One message for the burst rather than one for every round,
  // and it carries where the rounds are actually going rather than what they
  // are going to hit -- because they may well hit nothing.
  if (state.t - (p.tracerAt ?? -9) >= 0.1) {
    p.tracerAt = state.t;
    const reach = vb * BULLET_LIFE;
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
 * They fly flat: the pilot's sight is the line they go down, out to the end
 * of their reach, with no drop to hold off for. Everything is tested along the segment the round
 * covered this tick rather than at the point it ended at: a round doing eight
 * hundred metres a second moves twenty-seven metres in a tick, and an
 * aeroplane is nine metres long.
 */
function stepBullets(state, dt) {
  if (!state.bullets.length) return;
  const out = [];
  for (const b of state.bullets) {
    const px = b.x, py = b.y, pz = b.z;
    // No drop: the pilot's rounds go straight down the line of the sight, so
    // what is under the ring at two kilometres is what they hit.
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.life += dt;
    if (b.life > BULLET_LIFE) continue;

    let done = false;
    // Aeroplanes first: that is what a fighter's guns are for, and a flight is
    // a small target that a coarse test walks straight past.
    for (const q of state.planes) {
      if (q.dead || !mayHurt(state, b.team, q) || q.id === b.plane) continue;
      if (!segNear(px, py, pz, b.x, b.y, b.z, q.x, q.y ?? 220, q.z, 26)) continue;
      hurtFlight(state, q, b.dmg, 'fighters');
      state.events.push({
        e: 'airHit', x: r(b.x), y: r(b.y), z: r(b.z), air: 1, i: q.id,
      });
      done = true;
      break;
    }
    if (done) continue;

    // The heavies, machine by machine: a vic of them is two hundred metres
    // across and mostly air, so it is each bomber's own place that is tested,
    // not the leader's. The same rounds a flight takes, into a great deal more
    // aeroplane.
    for (const bm of state.bombers || []) {
      if (!bm.alive || !mayHurt(state, b.team, bm)) continue;
      if (Math.abs(bm.y - b.y) > 300 || dist2(bm.x, bm.z, b.x, b.z) > 400 * 400) continue;
      const m = flyingMachines(bm, true).find((n) => segNear(
        px, py, pz, b.x, b.y, b.z, n.x, n.y, n.z, TOUCH_HEAVY + 4,
      ));
      if (!m) continue;
      bm.aimed = m.a;
      // Where on her it went in: the point of the round's path nearest the
      // middle of the machine it hit, which is what decides whether it was a
      // turret it hit.
      const sx = b.x - px, sy = b.y - py, sz = b.z - pz;
      const L2 = sx * sx + sy * sy + sz * sz || 1;
      const u = clamp(((m.x - px) * sx + (m.y - py) * sy + (m.z - pz) * sz) / L2, 0, 1);
      hurtBomber(state, bm, b.dmg, 'fighters', {
        dx: px + sx * u - m.x, dy: py + sy * u - m.y, dz: pz + sz * u - m.z,
      });
      state.events.push({
        e: 'airHit', x: r(b.x), y: r(b.y), z: r(b.z), air: 1, i: bm.id,
      });
      done = true;
      break;
    }
    if (done) continue;

    // Ships. Her box and her air draft, in four steps along the segment.
    for (const s of state.ships) {
      if (!s.alive || !mayHurt(state, b.team, s)) continue;
      const cls = getClass(s.classId);
      if (dist2(b.x, b.z, s.x, s.z) > 9e6) continue;
      const halfLen = cls.hull.length * 0.5;
      const halfBeam = cls.hull.beam * 0.5;
      const top = 16 + cls.hull.superstructure * 14;
      for (let i = 1; i <= 4 && !done; i++) {
        const f = i / 4;
        const cx = lerp(px, b.x, f), cy = lerp(py, b.y, f), cz = lerp(pz, b.z, f);
        if (cy > top || cy < -1) continue;
        if (!pointInBox(cx, cz, s.x, s.z, s.heading, halfLen, halfBeam)) continue;
        if (severed(s, cls, worldToLocal(cx - s.x, cz - s.z, s.heading).z)) continue;
        bulletIntoShip(state, b, s, cls, cx, cy, cz);
        done = true;
      }
      if (done) break;
    }
    if (done) continue;

    // The guns ashore, which are a low wide target.
    for (const bat of state.batteries) {
      if (!bat.alive || !mayHurt(state, b.team, bat)) continue;
      const spec = BATTERIES[bat.batteryId];
      const reach = spec.span * 0.5 + 4;
      if (dist2(b.x, b.z, bat.x, bat.z) > (reach + 60) * (reach + 60)) continue;
      // Along the stretch the round covered this tick, not where it ended:
      // a round going down at a gun pit in a strafing dive covers more
      // height in a tick than the pit is deep.
      let inPit = false;
      for (let k = 1; k <= 4 && !inPit; k++) {
        const f = k / 4;
        const cx = lerp(px, b.x, f), cy = lerp(py, b.y, f), cz = lerp(pz, b.z, f);
        inPit = cy <= bat.y + 12 && cy >= bat.y - 2 && dist2(cx, cz, bat.x, bat.z) <= reach * reach;
      }
      if (!inPit) continue;
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
        // Into the sea, which throws a spout -- and how big a round it was.
        ...(g > 0.5 ? {} : { sea: 1, c: b.cal || 0 }),
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

/**
 * Whether the mounting at this place in her flak battery (see aaBattery) has
 * been switched off from the targeting panel: a dual-purpose main or secondary
 * mounting by its own key, a dual-purpose gun of her light battery by its
 * place in that battery, and the light anti-aircraft guns never -- the panel
 * has no key for them.
 */
function flakOff(ship, cls, mi) {
  if (!ship.off) return false;
  let at = mi;
  if (cls.gun && cls.gun.role === 'dp') {
    if (at < cls.turrets.length) return mountOff(ship, 'main', at);
    at -= cls.turrets.length;
  }
  if (cls.secondary && cls.secondary.role === 'dp') {
    if (at < cls.secondary.mounts.length) return mountOff(ship, 'sec', at);
    at -= cls.secondary.mounts.length;
  }
  return mountOff(ship, 'dp', at);
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

/** Seconds a mounting has to be under before the sea has finished it. */
const DROWN_HOLD = 2;

/**
 * Mountings the sea has closed over, finished for good.
 *
 * A gun that has been right under is not a gun when she comes back up: its
 * training gear, its hoists, its sights and its ready-use ammunition are full
 * of salt water and its crew are gone. So once a mounting has been under for
 * a moment -- not a sea breaking over it, which is green water and passes (see
 * stepSwamp), but her settling, her list or her trim putting it there -- it
 * is wrecked, and it never fires again whatever she does afterwards. A boat's
 * deck gun goes under every time she dives, and comes up again; she is left
 * out of it.
 */
export function stepDrowning(state, ship, dt) {
  const cls = shipClass(ship);
  if (cls.dive) return;
  if (!ship.sink && !ship.heel && !ship.trim) return;
  const wet = ship.wet || (ship.wet = { t: [], s: [], p: [], a: [] });
  const soak = (list, i, spec, finish) => {
    if (!spec || list[i] === -1) return;
    if (!mountDrowned(ship, spec)) { list[i] = 0; return; }
    list[i] = (list[i] || 0) + dt;
    if (list[i] >= DROWN_HOLD) { list[i] = -1; finish(); }
  };
  (cls.turrets || []).forEach((spec, i) => soak(wet.t, i, spec, () => hurtMount(state, ship.turrets[i], 3)));
  (cls.secondary?.mounts || []).forEach((spec, i) => soak(wet.s, i, spec, () => hurtMount(state, ship.secMounts[i], 3)));
  (cls.torpedoes?.mounts || []).forEach((spec, i) => soak(wet.p, i, spec, () => hurtMount(state, ship.torpMounts?.[i], 3)));
  const battery = aaBattery(cls);
  if (battery.length) {
    const flak = flakState(ship, cls);
    battery.forEach((spec, i) => soak(wet.a, i, spec, () => { flak[i].dead = true; }));
  }
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
/**
 * A flight's bombs into the earth round a gun position.
 *
 * Whether each one is near enough to matter is the same die roll a bomb on a
 * ship goes through, and the damage is what a bomb does to works rather than
 * what it does to a deck. The autopilot's attack run and a pilot's own
 * release both come here, so a captain flying his own dive bomber onto a
 * battery does to it exactly what the strike would have.
 */
function bombBattery(state, p, bat, P) {
  const each = (P.bombDamage ?? 3000) * 0.5;
  let hit = 0;
  for (let i = 0; i < (p.bomb || 1); i++) {
    if (state.rng() > (P.bombHit ?? 0.4) * ((p.wear && p.wear.aim) ?? 1)) continue;
    hurtBattery(state, bat, each);
    hit++;
  }
  state.events.push({
    e: 'bomb', team: p.team, i: p.id, x: p.x, z: p.z,
    tx: bat.x, tz: bat.z, hit: hit ? 1 : 0,
  });
  // And into the ground round it, which takes its craters like any other.
  landStrike(state, bat.x + (state.rng() - 0.5) * 30, bat.z + (state.rng() - 0.5) * 30,
    0.3, 'bomb');
}

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
    if (!s.alive || !mayHurt(state, p.team, s)) continue;
    // With friendly fire on, a pilot's drop goes into whatever is under it --
    // except the carrier she flew off, which she is not dropping on.
    if (s.team === p.team && s.id === p.owner) continue;
    const d = dist(p.x, p.z, s.x, s.z);
    if (d < bestD) { best = s; bestD = d; }
  }
  // Or a gun ashore, for a bomb: nearer than any ship and under her.
  if (bomb > 0) {
    for (const bat of state.batteries || []) {
      if (!bat.alive || !mayHurt(state, p.team, bat)) continue;
      const d = dist(p.x, p.z, bat.x, bat.z);
      if (d < (best ? bestD : 1200) && d < 700) {
        p.dropped = true;
        bombBattery(state, p, bat, P);
        p.phase = 'return';
        return true;
      }
    }
  }
  if (!best) return false;
  p.dropped = true;
  deliverOrdnance(state, p, best, P);
  // The fish going into the sea, which everybody within sight can see. The
  // autopilot's drop has always raised this; a drop the pilot made himself
  // raised nothing at all, so a player who let his torpedoes go watched an
  // empty patch of water and had no way of knowing anything had happened.
  if (torp > 0) {
    state.events.push({ e: 'airDrop', x: p.x, z: p.z, r: p.role });
    // A ton of torpedo going into the sea off a low run.
    waterBlow(state, p.x, p.z, 200);
  }
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
    x: m.x, z: m.z, my: m.my, angle: m.angle, arc: m.arc, guns: m.guns || 1,
    // How far up and how far down that mounting will go, off the battery it
    // belongs to. A quadruple 1.1" and a 5"/38 are both anti-aircraft guns and
    // they do not have the same stops.
    up: gunLimits(battery),
    // And how high it has to be laid, bearing by bearing, to fire clear of
    // her own funnels and bridge, where that has been measured.
    mask: m.mask,
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

/**
 * Is the light mounting somebody has gone down to laid on this aeroplane?
 *
 * Near enough on his line -- and on a bearing and at a height that mounting
 * can reach and fire at clear of her. A man at a 25 mm on her starboard side
 * is not shooting at something over her port quarter because he is looking
 * at it.
 */
function mannedLightOn(ship, cls, px, pz, py) {
  const b = headingTo(ship.x, ship.z, px, pz);
  if (Math.abs(angleDelta(b, headingTo(ship.x, ship.z, ship.manX, ship.manZ))) >= 0.10) return false;
  const battery = aaBattery(cls);
  const n = lightMounts(cls).length;
  const m = battery[battery.length - n + ship.manned.i];
  if (!m) return false;
  if (!mountBears(ship, m, b)) return false;
  if (py == null) return true;
  const up = Math.atan2(py - (ship.y || 0), Math.max(1, Math.hypot(px - ship.x, pz - ship.z)));
  if (up > m.up.max || up < m.up.min) return false;
  return !(m.mask && up < layFloor(m.mask, wrapAngle(b - ship.heading)));
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
    // An aeroplane low down behind her own funnel is not one that mounting
    // can shoot at, however well it bears.
    if (up !== null && m.mask && up < layFloor(m.mask, wrapAngle(bearing - ship.heading))) continue;
    // A close-range mounting has a ready-use locker under it like everything
    // else aboard, and when that is under water the mounting has nothing to
    // fire. So does a mounting standing on a compartment that has been shot
    // out of her.
    if (lightGunState(ship, cls, m) >= 3) continue;
    // Or with a sea over it this moment.
    if (ship.aaWet && ship.aaWet[mi] > 0) continue;
    // And a mounting a fighter has been along: its crew are down or its gun
    // is wrecked, and either way it is not shooting at anybody.
    if (!flakUp(ship, mi)) continue;
    // Or one her captain has switched off.
    if (flakOff(ship, cls, mi)) continue;
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
function secondaryTarget(state, ship, spec, S, m = null) {
  // Given a ship by name, the gun captain shoots at her or at nothing.
  if (m && ship.assign && ship.assign[`sec:${m.id}`]) {
    const foe = assignedFoe(state, ship, 'sec', m.id);
    if (foe) {
      const d = dist(ship.x, ship.z, foe.x, foe.z);
      if (!inSight(foe, ship.team) || d > S.range) return null;
      const b = headingTo(ship.x, ship.z, foe.x, foe.z);
      if (!mountBears(ship, spec, b)) return null;
      return foe;
    }
  }
  let best = null;
  let bestD = Infinity;
  for (const foe of state.ships) {
    if (!foe.alive || foe.team === ship.team) continue;
    if (!foe.spottedBy[ship.team]) continue;
    const d = dist(ship.x, ship.z, foe.x, foe.z);
    if (d > S.range || d >= bestD) continue;
    const b = headingTo(ship.x, ship.z, foe.x, foe.z);
    if (!mountBears(ship, spec, b)) continue;
    // Nor one it would have to shoot through her to hit: her gun captain
    // picks something he can fire at.
    if (spec.mask && solveBallistic(S, clamp(d, 400, S.range), 10).elev
      < layFloor(spec.mask, wrapAngle(b - ship.heading))) continue;
    best = foe;
    bestD = d;
  }
  if (best) return best;
  // Nothing afloat in reach: a gun ashore that is, which is what a cruiser's
  // secondaries were for on the day of a landing.
  for (const bat of state.batteries || []) {
    if (!bat.alive || bat.team === ship.team || !mayHurt(state, ship.team, bat)) continue;
    const d = dist(ship.x, ship.z, bat.x, bat.z);
    if (d > S.range || d >= bestD) continue;
    const b = headingTo(ship.x, ship.z, bat.x, bat.z);
    if (!mountBears(ship, spec, b)) continue;
    best = bat;
    bestD = d;
  }
  return best;
}

/** What her secondary battery is firing: its own order, or the main battery's. */
export function secondaryShell(ship) {
  return ship.secShell || ship.shellType;
}

/**
 * The battery a dual-purpose mounting of her light battery fires at a ship
 * with: its own calibre, range and stops, and a common high-explosive round,
 * because her datasheet gives that battery its anti-aircraft figures only.
 */
const DP_BATTERY = new Map();
function dpBattery(g) {
  let b = DP_BATTERY.get(g);
  if (!b) {
    const v = 700 + g.caliber * 0.8;
    const he = { type: 'he', caliber: g.caliber, damage: Math.round(g.caliber * g.caliber * 0.1),
      pen: Math.round(g.caliber / 6), velocity: v, fuseArm: 0, fireChance: 0.08, drag: 0.0028 };
    b = { name: g.name, caliber: g.caliber, range: g.range, reload: g.reload || 5, sigma: 1.25, reach: 4,
      elev: g.elev, role: 'dp', shells: { ap: { ...he, type: 'ap' }, he } };
    DP_BATTERY.set(g, b);
  }
  return b;
}

/**
 * Her dual-purpose mountings that have been put on a ship by name. They go on
 * shooting at aircraft in the flak (see stepFlak); this is the other half of
 * what makes them dual-purpose, and only for the ship they were given.
 */
function stepDpSurface(state, ship, dt) {
  if (!ship.assign || gunsDrowned(ship)) return;
  const cls = shipClass(ship);
  ship.dpCd = ship.dpCd || {};
  for (const { i, spec, gun } of dpMounts(cls)) {
    if (ship.dpCd[i] > 0) ship.dpCd[i] -= dt;
    if (!ship.assign[`dp:${i}`] || mountOff(ship, 'dp', i)) continue;
    const B = dpBattery(gun);
    const given = assignedAim(state, ship, 'dp', i, B.range, B);
    if (!given || given.idle || ship.dpCd[i] > 0) continue;
    if (lightGunState(ship, cls, spec) >= 3) continue;
    if (ship.aaWet && ship.aaWet[i] > 0) continue;
    const b = headingTo(ship.x, ship.z, given.x, given.z);
    if (!mountBears(ship, spec, b)) continue;
    if (!orderGiven(state, ship, 'sec')) continue;
    const aimD = clamp(given.d, 400, B.range);
    const spread = (aimD * 0.0125) / B.sigma;
    for (let gi = 0; gi < (spec.guns || 1); gi++) {
      const lat = clamp(gauss(state.rng), -2.4, 2.4) * spread * 0.35;
      const rr = clamp(gauss(state.rng), -2.4, 2.4) * spread;
      const mz = muzzlePos(ship, cls, spec, B, b, gi, spec.guns || 1);
      const s2 = solveBallistic(B, clamp(aimD + rr, 300, B.range), mz.y - aimHeight(state, given.x, given.z));
      const bb = b + Math.atan2(lat, Math.max(600, aimD));
      const vh = s2.v * Math.cos(s2.elev);
      fireShell(state, {
        id: eid(), owner: ship.id, team: ship.team,
        x: mz.x, z: mz.z, y: mz.y,
        vx: Math.sin(bb) * vh, vz: Math.cos(bb) * vh, vy: s2.v * Math.sin(s2.elev),
        g: s2.g, spec: B.shells.he, caliber: B.caliber, classId: cls.id, life: 0,
      });
    }
    ship.dpCd[i] = B.reload;
    const mz0 = muzzlePos(ship, cls, spec, B, b);
    state.events.push({ e: 'muzzle', x: mz0.x, z: mz0.z, y: mz0.y, b, cal: B.caliber, ship: ship.id, dp: i });
    ship.lastFiredAt = state.t;
  }
}

function stepSecondary(state, ship, dt) {
  const cls = shipClass(ship);
  const S = cls.secondary;
  if (!S || !ship.secMounts.length) return;
  if (gunsDrowned(ship)) return;
  const spec0 = S.shells[secondaryShell(ship)] || S.shells.he || S.shells.ap;
  for (const m of ship.secMounts) {
    mendMount(m, dt);
    const spec = S.mounts[m.id];
    const cond = gunState(ship, cls, spec, m);
    if (cond >= 3) continue;
    if (m.disabled > 0) { m.disabled -= dt; continue; }
    if (m.cooldown > 0) m.cooldown -= dt;
    if (mountOff(ship, 'sec', m.id)) { m.target = 0; continue; }
    // A mounting somebody has gone down to comes off local control: it trains
    // where he is holding, elevates on his range, and waits for his trigger.
    const stops = gunLimits(S);
    if (isManned(ship, 'sec', m.id)) {
      const want = mannedDesired(ship, spec);
      const aim = solveBallistic(S,
        clamp(dist(ship.x, ship.z, ship.manX, ship.manZ), 400, S.range), 10);
      const up = want.blocked ? 0 : clamp(aim.elev - deckTilt(ship, want.angle), stops.min, stops.max);
      layMounting(m, spec, want.angle, up, S.traverse * dt, 0.9 * dt, stops);
      m.target = 0;
      continue;
    }
    const foe = secondaryTarget(state, ship, spec, S, m);
    if (!foe) {
      // Nothing on her side: back to the bearing she rests on, which is
      // where she is stowed rather than the middle of her arc.
      layMounting(m, spec, spec.rest === undefined ? spec.angle : spec.rest, 0,
        S.traverse * dt, 0.9 * dt, stops);
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
    const aim = solveBallistic(S, clamp(d, 400, S.range), 10 - aimHeight(state, foe.x, foe.z));
    const flight = aim.tof;
    const lx = foe.x + Math.sin(foe.heading) * (foe.speed || 0) * flight;
    const lz = foe.z + Math.cos(foe.heading) * (foe.speed || 0) * flight;
    const world = headingTo(ship.x, ship.z, lx, lz);
    const local = wrapAngle(world - ship.heading);
    const off = angleDelta(spec.angle, local);
    const want = Math.abs(off) > spec.arc
      ? wrapAngle(spec.angle + Math.sign(off) * spec.arc)
      : local;
    // And how far up the gun captain has his guns, on the same solution and
    // off her deck as she is lying -- never past the stops on the mounting.
    const deck = aim.elev - deckTilt(ship, want);
    layMounting(m, spec, want, clamp(deck, stops.min, stops.max),
      S.traverse * dt, 0.9 * dt, stops);
    if (m.cooldown > 0) continue;
    if (Math.abs(angleDelta(m.angle, want)) > 0.05) continue;
    if (Math.abs(off) > spec.arc) continue;
    if (deck > stops.max || deck < stops.min) continue;
    // Nor through her own funnel.
    if (deck < layFloor(spec.mask, want)) continue;
    if (!orderGiven(state, ship, 'sec')) continue;

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
  const up = aimHeight(state, lx, lz);
  const spreadBase = (aimD * 0.0125) / S.sigma;
  for (let g = 0; g < spec.guns; g++) {
    const lat = clamp(gauss(state.rng), -2.4, 2.4) * spreadBase * 0.35;
    const rng = clamp(gauss(state.rng), -2.4, 2.4) * spreadBase;
    const shotD = clamp(aimD + rng, 300, S.range);
    const mz = muzzlePos(ship, cls, spec, S, bearing, g, spec.guns);
    const s2 = solveBallistic(S, shotD, mz.y - up);
    const b = bearing + Math.atan2(lat, Math.max(600, aimD));
    const el = s2.elev + layError(state, ship, m.angle);
    const vh = s2.v * Math.cos(el);
    fireShell(state, {
      id: eid(),
      owner: ship.id, team: ship.team,
      x: mz.x, z: mz.z, y: mz.y,
      vx: Math.sin(b) * vh, vz: Math.cos(b) * vh, vy: s2.v * Math.sin(el),
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
  if (mountOff(ship, 'sec', m.id)) return 0;
  const spec = S.mounts[m.id];
  const cond = gunState(ship, cls, spec, m);
  if (cond >= 3) return 0;
  const want = mannedDesired(ship, spec);
  if (want.blocked) return 0;
  if (Math.abs(angleDelta(m.angle, want.angle)) > 0.05) return 0;
  const stops = gunLimits(S);
  const aim = solveBallistic(S,
    clamp(dist(ship.x, ship.z, ship.manX, ship.manZ), 400, S.range), 10);
  const deck = aim.elev - deckTilt(ship, want.angle);
  if (deck > stops.max || deck < stops.min) return 0;
  if (deck < layFloor(spec.mask, want.angle)) return 0;
  const spec0 = S.shells[secondaryShell(ship)] || S.shells.he || S.shells.ap;
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
  // A rocket launcher fires its whole load as one ripple and is loaded again by
  // hand: how many rockets are on the rails, and the ripple it is in, if any.
  if (b.rocket) {
    bat.rails = b.barrels;
    bat.salvo = null;
    // It comes into action loaded, so it waits only to be laid.
    bat.cooldown = b.salvo * 0.5;
  }
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
  return Math.max(4, padTop(world, x, z, span, 32).top + batteryRise(span));
}

/**
 * The highest and lowest ground under an emplacement's footprint.
 *
 * Both the true ground and the ground as it is drawn, because the two are not
 * the same between the terrain mesh's vertices: a pad cut to the true height
 * alone came up through the drawn hill on one side and stood metres clear of
 * it on the other. Taking the higher of the two everywhere means nothing on
 * the screen or in the simulation comes up through the platform.
 */
function padTop(world, x, z, span, round = 32) {
  let top = Math.max(groundHeight(world, x, z), drawnGround(world, x, z));
  let low = top;
  for (const k of BATTERY_FOOTPRINT) {
    const r = Math.max(6, span * k);
    for (let a = 0; a < round; a++) {
      const th = (a / round) * TAU;
      const px = x + Math.cos(th) * r;
      const pz = z + Math.sin(th) * r;
      const h = Math.max(groundHeight(world, px, pz), drawnGround(world, px, pz));
      if (h > top) top = h;
      if (h < low) low = h;
    }
  }
  return { top, low };
}

/** How far a gun's earthwork stands above the ground it is dug out of. */
export function batteryRise(span = 20) {
  // Enough to clear the ground it is measured over and no more. It was a tenth
  // of the span, which stood the railway gun on a six-metre plinth.
  return Math.max(1.2, span * 0.045);
}

/**
 * The rings the pad is sampled on, as multiples of the battery's span.
 *
 * The last of them is the outer edge of the apron, so nothing the emplacement
 * is drawn with stands on ground that was never measured.
 */
export const BATTERY_FOOTPRINT = [0.25, 0.5, 0.75, 1.0, 1.18, 1.35];

/**
 * Where a battery can actually be built, as near as possible to where it was
 * asked for.
 *
 * The chart only asks that a gun is put down on land, and land includes a
 * beach a few metres wide, the lip of a cliff and the side of a ravine. A gun
 * sited on any of those came out standing in the surf, perched on a mound
 * twenty metres high on its downhill side, or buried in the hill on its uphill
 * one. So the site is checked before the gun goes in: its whole footprint on
 * dry ground well back from the water, and the ground under it level enough
 * that the pad does not have to be built up into a tower to sit flat. If the
 * spot asked for is not that, the nearest one that is.
 *
 * Returns `{ x, z }`, or the point it was given when there is no land to build
 * on anywhere -- which the briefing does not allow, and a test may.
 */
export function siteBattery(world, x, z, span = 20) {
  const isles = world.islands || [];
  const coast = !!world.land?.length;
  if (!isles.length && !coast) return { x, z };
  // How far from the water the edge of the footprint has to be, and how much
  // the ground may fall across it before the pad becomes a plinth.
  const edge = span * 1.35 + 12;
  const level = Math.max(3, span * 0.16);
  const fits = (px, pz) => {
    for (let a = 0; a < 12; a++) {
      const th = (a / 12) * TAU;
      const qx = px + Math.cos(th) * edge;
      const qz = pz + Math.sin(th) * edge;
      if (!islandAt(world, qx, qz, 0)) return null;
      if (Math.min(groundHeight(world, qx, qz), drawnGround(world, qx, qz)) < 1.5) return null;
    }
    const { top, low } = padTop(world, px, pz, span, 12);
    return top - low;
  };
  const here = fits(x, z);
  if (here !== null && here <= level) return { x, z };

  // Walked outward from the spot in rings, keeping the levellest site that
  // fits, with a small premium on staying close.
  let best = null;
  const consider = (px, pz) => {
    const fall = fits(px, pz);
    if (fall === null) return;
    const score = Math.max(0, fall - level) * 40 + fall + Math.hypot(px - x, pz - z) * 0.02;
    if (!best || score < best.score) best = { x: px, z: pz, score, fall };
  };
  const reach = Math.max(500, span * 12);
  for (let r = 20; r <= reach; r += Math.max(20, r * 0.18)) {
    const n = Math.max(10, Math.round((TAU * r) / 45));
    for (let a = 0; a < n; a++) {
      const th = (a / n) * TAU;
      consider(x + Math.cos(th) * r, z + Math.sin(th) * r);
    }
    // Close and level is good enough; there is no sense in looking further.
    if (best && best.fall <= level) return { x: best.x, z: best.z };
  }
  if (best) return { x: best.x, z: best.z };

  // Nothing near it. Then the nearest summit, or the nearest ground well
  // inland on a coast: the tops of islands are flat, which is where guns go.
  const far = [];
  for (const i of isles) far.push({ x: i.x, z: i.z });
  if (coast) {
    const half = world.half || 7000;
    const step = Math.max(300, half / 24);
    for (let gz = -half + step; gz < half; gz += step) {
      for (let gx = -half + step; gx < half; gx += step) {
        if (shoreDistance(world, gx, gz) > edge + 150) far.push({ x: gx, z: gz });
      }
    }
  }
  far.sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z));
  for (const p of far.slice(0, 12)) {
    const fall = fits(p.x, p.z);
    if (fall === null) continue;
    const score = fall + Math.hypot(p.x - x, p.z - z) * 0.002;
    if (!best || score < best.score) best = { x: p.x, z: p.z, score, fall };
  }
  return best ? { x: best.x, z: best.z } : { x, z };
}

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
  if (b.relay) return b.relay;
  if ((b.traverse ?? 120) >= 360) return 0;
  return 0.02 + (b.traverse ?? 120) / 120 * 0.03;
}

function stepBatteries(state, dt) {
  for (const bat of state.batteries) {
    if (!bat.alive) continue;
    const b = BATTERIES[bat.batteryId];
    const gun = batteryGun(bat.batteryId);
    if (bat.cooldown > 0) bat.cooldown -= dt;
    if (gun.rocket) reloadRails(bat, b, gun);

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
    // A ripple once begun goes on to its last rocket: the firing circuit is
    // already closed, and what changes is only where the rails are pointing.
    if (bat.salvo) {
      stepRipple(state, bat, b, gun, target, dt);
      continue;
    }
    if (!target) { bat.targetId = 0; continue; }
    bat.relayTo = null;
    if (bat.cooldown > 0) continue;
    // Laid on, or still coming round.
    if (Math.abs(angleDelta(bat.angle, want)) > 0.02) continue;
    if (gun.rocket) {
      startRipple(state, bat, gun, target);
      continue;
    }
    fireBattery(state, bat, b, gun, target);
  }
}

// ---------------------------------------------------------------------------
// The rocket launcher
// ---------------------------------------------------------------------------
//
// A gun fires and is loaded again. A Katyusha is loaded once, laid once, and
// then empties itself in eight seconds: the rails come up off their rest to
// the elevation, the crew get clear of the lorry and the cab shutters come
// down, and then the firing handle is wound and the rockets go top and bottom
// of each rail in turn. Then it is three minutes of men lifting forty-two kilo
// rockets onto the rails one at a time.

/** Seconds from the order to the first rocket: rails up, crew clear, handle wound. */
export const RIPPLE_WINDUP = 3.5;

/** Begin a ripple at `target`. Nothing leaves the rails until the wind-up is done. */
function startRipple(state, bat, gun, target) {
  if (!bat.rails) return;
  // One elevation for the whole ripple, because the rails are laid together.
  // Rockets were fired high -- the M-13 got its range at forty-five degrees --
  // so this is always the lofted side of the choice a gun makes.
  const theta = 0.3 + state.rng() * 0.16;
  bat.salvo = {
    wind: RIPPLE_WINDUP,
    next: 0,
    fired: 0,
    load: bat.rails,
    theta,
    targetId: target.id,
  };
  state.events.push({
    e: 'rippleWindup', x: bat.x, y: bat.y, z: bat.z, battery: bat.id,
  });
}

/** One tick of a ripple in progress: the wind-up, then a rocket every so often. */
function stepRipple(state, bat, b, gun, target, dt) {
  const s = bat.salvo;
  if (s.wind > 0) {
    s.wind -= dt;
    if (s.wind > 0) return;
    s.next = 0;
  }
  // The one it was laid on, while she is still there; whatever else it can
  // see if she is gone. If there is nothing, the rest go down the last bearing
  // anyway -- once the handle is turning the rockets are going.
  const aim = target
    || state.ships.find((q) => q.id === s.targetId && q.alive) || null;
  const gap = gun.salvo / Math.max(1, s.load - 1);
  s.next -= dt;
  while (s.next <= 0 && s.fired < s.load) {
    fireRocket(state, bat, gun, aim, s);
    s.fired++;
    bat.rails = Math.max(0, bat.rails - 1);
    s.next += gap;
  }
  if (s.fired >= s.load) {
    bat.salvo = null;
    bat.cooldown = gun.reload;
  }
}

/**
 * Load the rails again, a rocket at a time, over the reload.
 *
 * A crew lifts the rockets on by hand, so a launcher that has been firing is
 * not empty and then full: it fills. That is what the rails on the model show.
 */
function reloadRails(bat, b, gun) {
  if (bat.salvo || bat.rails >= b.barrels) return;
  const done = 1 - Math.max(0, bat.cooldown) / gun.reload;
  bat.rails = Math.max(bat.rails, Math.min(b.barrels, Math.floor(done * b.barrels)));
}

/** One rocket off the rails. */
function fireRocket(state, bat, gun, target, s) {
  const spec = gun.shells.he;
  const bearing = wrapAngle(bat.heading + bat.angle);
  // Where it is going: the target, led by the flight time; or with no target,
  // as far down the bearing as the last one went.
  let aimD, aimB;
  if (target) {
    const d = clamp(dist(bat.x, bat.z, target.x, target.z), 400, gun.range);
    const arc0 = { ...gun, range: Math.max(d / Math.max(0.08, Math.sin(2 * s.theta)), d * 1.02) };
    const lead = Math.min(solveBallistic(arc0, d, bat.y).tof, 60);
    const ax = target.x + Math.sin(target.heading) * target.speed * lead;
    const az = target.z + Math.cos(target.heading) * target.speed * lead;
    aimD = clamp(dist(bat.x, bat.z, ax, az), 400, gun.range);
    aimB = headingTo(bat.x, bat.z, ax, az);
    s.lastD = aimD;
    s.lastB = aimB;
  } else {
    aimD = s.lastD || gun.range * 0.1;
    aimB = s.lastB ?? bearing;
  }
  // Every rocket on its own: a fin-stabilised body leaves the rail a fraction
  // off true and goes on being off. Most of it is in range -- a rocket's motor
  // never burns quite the same twice -- and a good deal is across the line too,
  // more than a gun's.
  const spreadBase = (aimD * 0.0125) / gun.sigma;
  const wild = state.rng() < gun.wild ? 3.2 : 1;
  const lat = clamp(gauss(state.rng), -2.6, 2.6) * spreadBase * 0.45 * wild;
  const rng = clamp(gauss(state.rng), -2.6, 2.6) * spreadBase * wild;
  const shotD = clamp(aimD + rng, 300, gun.range);
  const arc = { ...gun, range: Math.max(shotD / Math.max(0.08, Math.sin(2 * s.theta)), shotD * 1.02) };
  const sol = solveBallistic(arc, shotD, bat.y);
  const bb = aimB + Math.atan2(lat, Math.max(600, aimD));
  const vh = sol.v * Math.cos(sol.elev);
  // Off the front of the rails, which stand three metres up over the cab.
  const id = eid();
  fireShell(state, {
    id,
    owner: bat.id, team: bat.team, fromBattery: true, rocket: true,
    x: bat.x + Math.sin(bb) * 4, z: bat.z + Math.cos(bb) * 4,
    y: bat.y + 3.5,
    vx: Math.sin(bb) * vh, vz: Math.cos(bb) * vh, vy: sol.v * Math.sin(sol.elev),
    g: sol.g,
    spec, caliber: gun.caliber,
    classId: null,
    life: 0,
  });
  bat.lastFiredAt = state.t;
  state.events.push({
    e: 'rocket', x: bat.x, z: bat.z, y: bat.y + 2, b: bearing,
    cal: gun.caliber, battery: bat.id, n: s.fired, el: Math.round(sol.elev * 1000) / 1000,
  });
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
/** A shell landing close to a battery: blast and splinters, falling off with distance. */
function nearMiss(state, sh) {
  for (const bat of state.batteries) {
    if (!bat.alive || !mayHurt(state, sh.team, bat)) continue;
    if (sh.fromBattery && bat.id === sh.owner) continue;
    const b = BATTERIES[bat.batteryId];
    // The works themselves, and a blast radius that goes with the bore.
    const reach = b.span * 0.5 + 6 + sh.caliber * 0.07;
    const d = dist(sh.x, sh.z, bat.x, bat.z);
    if (d > reach) continue;
    const bite = Math.pow(1 - d / reach, 1.5);
    // High explosive is what does this; armour-piercing buries itself first.
    const k = sh.spec.type === 'he' ? 0.4 : 0.15;
    // Behind armour the shell cannot beat, splinters and blast do next to
    // nothing: a near miss on a battleship turret is noise. A thin shield
    // keeps some of it off the crew.
    const cover = b.armour >= sh.spec.pen ? 0.05 : b.armour > 0 ? 0.85 : 1;
    const dmg = sh.spec.damage * k * bite * cover;
    if (dmg < 1) continue;
    bat.hp -= dmg;
    const shooter = shellOwner(state, sh);
    if (shooter) shooter.damageDealt += dmg;
    if (bat.hp <= 0) {
      bat.alive = false;
      bat.hp = 0;
      if (shooter) shooter.kills++;
      state.events.push({ e: 'batterySilenced', x: bat.x, y: bat.y, z: bat.z, id: bat.id });
    }
  }
}

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
  // Short of getting through, what it does goes by how far short: a shell
  // that nearly beats a shield still wrecks what is behind it, and a five-inch
  // round on fourteen inches of turret face does nothing but chip paint.
  const dmg = spec.damage * (through ? 0.5 : 0.12 * clamp((spec.pen / Math.max(1, b.armour)) * 2, 0.1, 1));
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

/**
 * How hard a gale pushes a shell sideways, per metre a second of wind.
 *
 * Nothing short of a typhoon is worth working out: a shell is in the air for
 * half a minute at the most and a breeze moves it a few metres in that. In a
 * typhoon it moves it a ship's length, and a light shell -- which has less
 * weight to carry its way through the air -- further than a heavy one. The
 * fire-control tables of the day had a wind correction, but nothing corrects
 * for a gust that arrives while the shell is in flight.
 */
export const WIND_PUSH = 0.006;
function windPush(state, bore = 152) {
  const w = state.wind;
  if (!w || !w.blow) return 0;
  return WIND_PUSH * w.blow * Math.sqrt(406 / Math.max(20, bore || 152));
}

/**
 * What a gale does to an aeroplane: it carries her downwind, and it throws
 * her about. A pilot crabs into it and gets some of the drift back, which is
 * why only half the wind is put on her track; the gusts he can do nothing
 * about, and a low torpedo bomber in a super typhoon spends the whole of her
 * run fighting to keep her wings out of the sea.
 */
export function buffet(state, p, dt) {
  const w = state.wind;
  if (!w || !w.blow) return;
  p.x += w.x * 0.5 * w.blow * dt;
  p.z += w.z * 0.5 * w.blow * dt;
  const rough = w.blow * (w.speed / 36);
  const t = state.t + (p.id || 0) * 1.7;
  p.y = Math.max(14, p.y + rough * (2.4 * Math.sin(t * 1.13) + 1.3 * Math.sin(t * 3.7 + 0.8)) * dt);
  p.bank = clamp((p.bank ?? 0) + rough * 0.3 * Math.sin(t * 2.3 + 0.4) * dt, -1.5, 1.5);
}

// ---------------------------------------------------------------------------
// The sea coming aboard
// ---------------------------------------------------------------------------
//
// In a typhoon the sea is higher than her deck, and a gun under a breaking sea
// is a gun nobody can work: the crew are hanging on, the sights are full of
// water and the training gear is under a ton of it. It is out of action for as
// long as the sea is over it and for a few seconds after, while the water runs
// off and the crew get back to it.
//
// The server works this out off the same sea the screen is drawing (shared/
// sea.js), on the same clock, with the same response of the hull to it -- so
// the forward turret goes out at the moment the player sees the green water
// come over it, and comes back when the sea has run off.

const SWAMP_EVERY = 0.2;
/** How long a mounting is out after the sea has left it, in seconds. */
export const SWAMP_HOLD = 2.5;

/** The waves of a storm big enough to come aboard, or null in any other sea. */
export function stormSea(state) {
  if (state.seaTerms !== undefined) return state.seaTerms;
  const wx = getWeather(state.world?.weather);
  if (!((wx.swell || 1) > 1)) { state.seaTerms = null; return null; }
  const S = seaOf(state.world);
  state.seaTerms = waveTerms(S.amp, S.steep, S.short);
  return state.seaTerms;
}

/**
 * Her motion in the seaway, as the renderer has it (see seakeeping.js): a
 * damped spring each in roll, pitch and heave, pushed by the water under her.
 */
export function stepSeaway(state, ship, W, h) {
  const cls = shipClass(ship);
  const L = cls.hull.length, B = cls.hull.beam;
  const att = seaAttitude(W, ship.x, ship.z, ship.heading, L, B, state.t, 5);
  const ride = rideOf(state.world);
  const k = ship.seaway || (ship.seaway = { r: 0, rv: 0, p: 0, pv: 0, h: att.heave * ride.heave, hv: 0 });
  const rw = (Math.PI * 2) / (2.7 * Math.sqrt(B));
  const pp = 0.44 * Math.sqrt(L) * 1.02;
  const pw = (Math.PI * 2) / pp;
  const hw = (Math.PI * 2) / (pp * 1.25);
  const rTo = att.roll * rollHeed(L) * ride.tilt;
  const pTo = att.pitch * pitchHeed(L) * ride.tilt;
  const hTo = att.heave * ride.heave;
  const n = Math.max(1, Math.ceil(h / 0.04));
  const s = h / n;
  for (let i = 0; i < n; i++) {
    k.rv += (rw * rw * (rTo - k.r) - 2 * 0.13 * rw * k.rv) * s; k.r += k.rv * s;
    k.pv += (pw * pw * (pTo - k.p) - 2 * 1.25 * pw * k.pv) * s; k.p += k.pv * s;
    k.hv += (hw * hw * (hTo - k.h) - 2 * 1.1 * hw * k.hv) * s; k.h += k.hv * s;
  }
  return k;
}

/**
 * How far the sea stands over a point on her, in metres; negative is dry.
 * `x, y, z` are in her own frame, y off her waterline.
 */
export function seaOver(state, ship, W, x, y, z) {
  const k = ship.seaway || { r: 0, p: 0, h: 0 };
  // Her own frame laid over by the sea and by what is in her, the way the
  // renderer draws her: rolled about her keel, then pitched about her beam.
  const r = k.r - (ship.heel || 0);
  const p = k.p + (ship.trim || 0);
  const yw = k.h - 1 - (ship.sink || 0)
    + (x * Math.sin(r) + y * Math.cos(r)) * Math.cos(p) - z * Math.sin(p);
  const w = localToWorld(x, z, ship.heading);
  return seaHeight(W, ship.x + w.x, ship.z + w.z, state.t) - yw;
}

function stepSwamp(state, ship, dt) {
  const W = stormSea(state);
  if (!W) return;
  ship.seaAcc = (ship.seaAcc || 0) + dt;
  if (ship.seaAcc < SWAMP_EVERY) return;
  const h = ship.seaAcc;
  ship.seaAcc = 0;
  stepSeaway(state, ship, W, h);
  // A boat under the water is not being swamped: she is a boat.
  if (submerged(ship)) return;
  const cls = shipClass(ship);
  const deck = freeboardOf(cls);
  const wet = (m, spec, kind = null, i = 0) => {
    if (!m || !spec) return;
    if (m.swamp > 0) m.swamp = Math.max(0, m.swamp - h);
    // Over the gun house, not just round its foot.
    if (seaOver(state, ship, W, spec.x || 0, (spec.my ?? deck + 2) + 0.4, spec.z || 0) > 0) {
      // Her bridge is told when a turret goes under. The light guns go under
      // by the dozen and nobody reports each one.
      if (kind && !(m.swamp > 0)) state.events.push({ e: 'swamp', ship: ship.id, k: kind, i });
      m.swamp = SWAMP_HOLD + state.rng() * 1.5;
    }
  };
  (ship.turrets || []).forEach((t, i) => wet(t, cls.turrets?.[t.id], 'main', i));
  (ship.secMounts || []).forEach((m, i) => wet(m, cls.secondary?.mounts?.[m.id], 'sec', i));
  const aa = aaBattery(cls);
  const aw = ship.aaWet || (ship.aaWet = new Array(aa.length).fill(0));
  for (let i = 0; i < aa.length; i++) {
    const box = { swamp: aw[i] };
    wet(box, aa[i]);
    aw[i] = box.swamp;
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
    // A gale carries a shell off its line. See windPush.
    const wp = windPush(state, sh.caliber);
    if (wp) {
      sh.vx += state.wind.x * wp * dt;
      sh.vz += state.wind.z * wp * dt;
    }

    let consumed = false;
    // Ship intersection: sample the segment so fast shells cannot tunnel.
    for (const target of state.ships) {
      if (!target.alive || !mayHurt(state, sh.team, target)) continue;
      // Never the ship that fired it: it leaves her muzzles inside her own box.
      if (target.id === sh.owner && !sh.fromBattery && !sh.bomb) continue;
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
        // The piece of her that has been cut off is not her any more: a shell
        // into it is a shell into wreckage, and it goes on to the sea.
        if (severed(target, cls, worldToLocal(cx - target.x, cz - target.z, target.heading).z)) continue;
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
      if (!bat.alive || !mayHurt(state, sh.team, bat)) continue;
      if (sh.fromBattery && bat.id === sh.owner) continue;
      const b = BATTERIES[bat.batteryId];
      const reach = b.span * 0.6 + 6;
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
        if (!ashore) waterBlow(state, sh.x, sh.z, sh.caliber);
        if (ashore) {
          landStrike(state, sh.x, sh.z, sh.caliber / 1000, sh.bomb ? 'bomb' : 'shell');
          // A shell into the ground beside a gun pit is not a miss. What it
          // throws out of the earth -- splinters, the parapet, the ready
          // ammunition -- does for the detachment and knocks the gun about,
          // and the heavier the shell the further that reaches. A gun on a
          // hill is hit by the near ones far more often than by the one that
          // lands in the pit.
          if (!sh.bomb && sh.spec) nearMiss(state, sh);
          // A stick laid across a gun position does for the crew as well as
          // the ground: a battery under it is the target, not scenery.
          if (sh.bomb) {
            for (const bat of state.batteries) {
              if (!bat.alive || !mayHurt(state, sh.team, bat)) continue;
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
/**
 * How much ammunition, in tons, was stowed in one of her magazines.
 *
 * Every mounting is fed from the compartment under it (see magazineOf), so a
 * magazine holds the outfit of the guns over it: shell and charge for each
 * round, as many rounds a gun as she carried for that bore, and the warheads
 * of any torpedoes in the same length of her. A round goes as the cube of the
 * bore -- a sixteen-inch shell and its bags are a ton and a half, a five-inch
 * round forty kilograms -- and a big gun carried a hundred rounds against a
 * five-inch's three hundred. How full she still was is anybody's guess, so it
 * is one.
 */
export function magazineTons(state, ship, cls, where) {
  let tons = 0;
  const battery = (spec, list, per) => {
    if (!spec || !list) return;
    const bore = (spec.caliber || 127) / 1000;
    const round = 21 * bore * bore * bore;
    const rounds = Math.min(400, 40 / bore);
    for (const m of list) {
      if (magazineOf(cls, m) !== where) continue;
      tons += (m.guns || per) * rounds * round;
    }
  };
  battery(cls.gun, cls.turrets, 1);
  battery(cls.secondary, cls.secondary?.mounts, 1);
  for (const m of cls.torpedoes?.mounts || []) {
    if (magazineOf(cls, m) === where) tons += (m.tubes || 1) * 0.35;
  }
  // A ship has some ammunition everywhere; never nothing.
  tons = Math.max(tons, cls.hull.length * 0.08);
  return tons * (0.55 + state.rng() * 0.45);
}

export function detonate(state, ship, where, owner) {
  const cls = shipClass(ship);
  const c = ship.sections[where];
  if (!c) return;
  // What was in it, which is how hard it goes. The client sizes everything
  // it draws off this: the fireball, the column, and how far her hull and her
  // turrets are thrown.
  const tons = Math.round(magazineTons(state, ship, cls, where));
  // And she is stopped dead by it (see stepMovement).
  ship.blown = true;
  ship.speed = 0; ship.yawRate = 0; ship.driftX = 0; ship.driftZ = 0;
  // The compartment itself, and a great deal of what is either side of it.
  const gone = c.hp;
  c.hp = 0;
  ship.hp = hullIntegrity(ship);
  damageShip(state, ship, owner, gone + cls.hp * 0.34, 'magazine', where);
  // A magazine going up is the one thing that breaks her outright, there and
  // then, at the magazine.
  const sec = SECTIONS.find((q) => q.k === where);
  if (sec && sec.from !== null && cls.hull.length > 60) {
    breakHer(state, ship, clamp((sec.from + sec.to) / 2, -0.6, 0.6), 'magazine');
    if (ship.sinking && owner) ship.sinking.by = owner.id;
  }
  if (!ship.alive) {
    state.events.push({
      e: 'detonate', ship: ship.id, at: where,
      x: r(ship.x), z: r(ship.z), cls: ship.classId, t: tons,
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
  // And she is finished as a fighting ship. Her back is broken, her
  // mountings are lifted off their roller paths and her fire control is gone:
  // nothing aboard her lays a gun again, and she goes down where she lies.
  for (const t of ship.turrets) { t.disabled = Math.max(t.disabled, 60); hurtMount(state, t, 3); }
  for (const m of ship.secMounts) { m.disabled = Math.max(m.disabled || 0, 60); hurtMount(state, m, 3); }
  for (const m of ship.torpMounts || []) hurtMount(state, m, 3);
  ship.engineDamage = Math.max(ship.engineDamage, 18 + state.rng() * 20);
  ship.steeringDamage = Math.max(ship.steeringDamage, 18 + state.rng() * 20);
  ship.flooding = floodedCount(ship);
  state.events.push({
    e: 'detonate', ship: ship.id, at: where,
    x: r(ship.x), z: r(ship.z), cls: ship.classId, t: tons,
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

// ---------------------------------------------------------------------------
// What stands on a hole
// ---------------------------------------------------------------------------

/**
 * How much of a mounting's footing has to be shot away before it goes down
 * through it. Not all of it: a turret is a thousand tons on a roller path,
 * and a third of the deck under that path gone is a third of what is holding
 * it up gone. It sags, the rollers come off the track, and it drops.
 */
const FOOTING = 0.3;

/**
 * How wide a mounting stands on her deck, in metres, off the bore of its
 * guns: a sixteen-inch gunhouse is a dozen metres across, a twin five-inch
 * five, a quad Bofors two and a half.
 */
function footOf(bore) {
  return 0.7 + bore * 13;
}

/** How much of one disc lies over another: two radii and the gap between their middles. */
function lens(r0, r1, d) {
  if (d >= r0 + r1) return 0;
  const lo = Math.min(r0, r1);
  if (d <= Math.abs(r0 - r1)) return Math.PI * lo * lo;
  const a = r0 * r0 * Math.acos(clamp((d * d + r0 * r0 - r1 * r1) / (2 * d * r0), -1, 1));
  const b = r1 * r1 * Math.acos(clamp((d * d + r1 * r1 - r0 * r0) / (2 * d * r1), -1, 1));
  const c = 0.5 * Math.sqrt(Math.max(0, (-d + r0 + r1) * (d + r0 - r1) * (d - r0 + r1) * (d + r0 + r1)));
  return a + b - c;
}

/**
 * Every mounting she carries, with where it stands and how big a gun it is:
 * her turrets, her secondaries and her close-range battery, keyed the way the
 * wire keys them.
 */
function standing(ship, cls) {
  const out = [];
  (cls.turrets || []).forEach((s, i) => {
    out.push({ k: 'main', i, s, m: ship.turrets[i], bore: (cls.gun?.caliber || 150) / 1000 });
  });
  (cls.secondary?.mounts || []).forEach((s, i) => {
    out.push({ k: 'sec', i, s, m: ship.secMounts[i], bore: (cls.secondary.caliber || 100) / 1000 });
  });
  let i = 0;
  for (const g of (cls.aa && cls.aa.guns) || []) {
    for (const s of g.mounts) out.push({ k: 'aa', i: i++, s, m: null, bore: (g.caliber || 25) / 1000 });
  }
  return out;
}

/** Whether a mounting has gone down through her deck. */
export function mountFell(ship, kind, i) {
  const key = `${kind}:${i}`;
  return !!(ship && ((ship.fell && ship.fell[key]) || (ship.ko && ship.ko[key])));
}

/**
 * A bomb that came down on a mounting rather than on the deck beside it.
 *
 * What happens is the bomb against the roof of the thing: through it and it
 * bursts in the gunhouse, among the crew, the breeches and the charges in the
 * hoist, and the mounting is finished for the rest of the action. Stopped by
 * it and it bursts on top -- the crew are shaken, the sights and the training
 * gear are knocked about, and the gun is damaged for as long as it takes them
 * to put it right, which is longer the less roof there was to stop it.
 */
function bombOnMount(state, ship, owner, P, at) {
  if (!ship.alive || !at) return false;
  const cls = shipClass(ship);
  let g = null;
  let bd = Infinity;
  for (const q of standing(ship, cls)) {
    if (mountFell(ship, q.k, q.i)) continue;
    if (q.m && q.m.hurt >= 3) continue;
    const d = Math.hypot((q.s.x || 0) - at.x, q.s.z - at.z);
    if (d <= footOf(q.bore) * 0.9 && d < bd) { bd = d; g = q; }
  }
  if (!g) return false;
  const roof = mountRoof(cls, g.k);
  const through = (P.bombPen ?? 60) / Math.max(1, roof);
  const key = `${g.k}:${g.i}`;
  const w = localToWorld(g.s.x || 0, g.s.z, ship.heading);
  const ev = {
    e: 'bombMount', ship: ship.id, k: g.k, i: g.i, pen: through >= 1 ? 1 : 0, roof,
    x: r(ship.x + w.x), y: r(g.s.my ?? freeboardOf(cls) + 1), z: r(ship.z + w.z),
  };
  if (through >= 1) {
    // Through the roof: the mounting is gone for good.
    (ship.ko || (ship.ko = {}))[key] = 1;
    if (g.m) { g.m.hurt = 3; g.m.laid = false; }
    damageShip(state, ship, owner, cls.hp * clamp(0.006 + g.bore * 0.03, 0.006, 0.02), 'bomb',
      sectionAt(clamp(g.s.z / (cls.hull.length / 2), -1, 1), 'deck'));
    state.events.push(ev);
    if (!ship.alive) return true;
    // The charges in the gunhouse and the hoist under it.
    if (!(ship.blew && ship.blew[key]) && state.rng() < 0.45) readyUse(state, ship, cls, g, owner, 0);
    // And down the hoist into the handling room: a turret is stood on its
    // magazine, and a flash down the trunk is how a turret hit loses a ship.
    if (g.k === 'main' && ship.alive) {
      const where = sectionAt(g.s.z / (cls.hull.length / 2), 'deck');
      if ((where === 'fwd' || where === 'aft') && state.rng() < 0.06) detonate(state, ship, where, owner);
    }
    return true;
  }
  // Burst on the roof.
  if (g.m) {
    g.m.disabled = Math.max(g.m.disabled || 0, 6 + state.rng() * 10 + 20 * through);
    hurtMount(state, g.m, clamp(0.3 + 2.4 * through, 0.3, 2.4) + state.rng() * 0.4);
  }
  state.events.push(ev);
  return true;
}

/**
 * A hole in her deck or her upperworks, and what was standing on it.
 *
 * `at` is where it is in her own frame -- the height off her waterline the
 * shells are reckoned from -- and `r` how far across the middle it is, the
 * same hole the picture cuts in her plating. A mounting with that much of
 * the deck under it gone has nothing holding it up, and it goes down through
 * the hole: out of action for good, and drawn falling (see ShipView.dropMount).
 *
 * And a hole under a gun is a hole in its ready-use racks: the charges and the
 * fused rounds stowed round the mounting for the first minutes of an action.
 * Those can go off -- the burst that made the hole, or the mounting coming
 * down on them -- and when they do it is an explosion of its own, which makes
 * a hole of its own, under whatever is standing next to it.
 */
export function undercut(state, ship, at, r, owner, depth = 0) {
  if (!ship.alive || !at || !(r > 0)) return;
  const cls = shipClass(ship);
  const deckY = freeboardOf(cls);
  const fell = [];
  const blew = [];
  for (const g of standing(ship, cls)) {
    const key = `${g.k}:${g.i}`;
    if (ship.fell && ship.fell[key]) continue;
    const foot = footOf(g.bore);
    const d = Math.hypot((g.s.x || 0) - at.x, g.s.z - at.z);
    if (d >= foot + r) continue;
    // Under it, not over it or a deck below it: no higher than its guns, and
    // no further down than its own trunk goes. The close-range battery does
    // not say how high it stands, so it is taken to be on the deck the hole
    // is in.
    const top = g.s.my ?? (at.y + 1);
    if (at.y > top + 0.5 || at.y < Math.min(top, deckY) - foot - 5) continue;
    const cover = lens(foot, r, d);
    if (cover <= 0) continue;
    const area = Math.PI * foot * foot;
    const book = ship.footing || (ship.footing = {});
    book[key] = (book[key] || 0) + cover;
    // The ready-use racks round it, opened by the burst.
    if (!(ship.blew && ship.blew[key]) && state.rng() < clamp(cover / area, 0, 1) * 0.35) {
      blew.push(g);
    }
    if (book[key] >= area * FOOTING) fell.push(g);
  }
  for (const g of fell) dropMount(state, ship, cls, g, owner, blew, depth);
  for (const g of blew) readyUse(state, ship, cls, g, owner, depth);
}

/** A mounting going down through the deck under it. */
function dropMount(state, ship, cls, g, owner, blew, depth) {
  const key = `${g.k}:${g.i}`;
  (ship.fell || (ship.fell = {}))[key] = 1;
  if (g.m) {
    g.m.hurt = 3;
    g.m.laid = false;
  }
  const half = cls.hull.length / 2;
  const top = g.s.my ?? freeboardOf(cls) + 1;
  const w = localToWorld(g.s.x || 0, g.s.z, ship.heading);
  state.events.push({
    e: 'fall', ship: ship.id, k: g.k, i: g.i,
    x: r(ship.x + w.x), y: r(top), z: r(ship.z + w.z),
  });
  // A thousand tons dropping a deck onto its own handling room: the charges
  // in the hoists and the racks round it can go up as it lands.
  if (!(ship.blew && ship.blew[key]) && !blew.includes(g)
    && state.rng() < (g.k === 'main' ? 0.35 : g.k === 'sec' ? 0.25 : 0.15)) {
    blew.push(g);
  }
  // And a main turret is stood on its magazine. Coming down through the deck
  // on top of it, it can take the magazine with it -- not often.
  if (g.k === 'main' && depth === 0) {
    const where = sectionAt(g.s.z / half, 'deck');
    if ((where === 'fwd' || where === 'aft') && state.rng() < 0.08) {
      detonate(state, ship, where, owner);
    }
  }
}

/**
 * A mounting's ready-use ammunition going off.
 *
 * Not her magazine: what was stowed up top for the first minutes of an
 * action. It wrecks what is round it, starts a fire, and blows a hole in the
 * deck it was on -- and that hole is under whatever else is standing there.
 */
function readyUse(state, ship, cls, g, owner, depth) {
  if (!ship.alive) return;
  const key = `${g.k}:${g.i}`;
  (ship.blew || (ship.blew = {}))[key] = 1;
  const deckY = freeboardOf(cls);
  const half = cls.hull.length / 2;
  const y = Math.min(g.s.my ?? deckY + 1, deckY + 1);
  const at = { x: g.s.x || 0, y, z: g.s.z };
  const where = sectionAt(clamp(at.z / half, -1, 1), (g.s.my ?? deckY) > deckY + 3 ? 'superstructure' : 'deck');
  damageShip(state, ship, owner, cls.hp * clamp(0.01 + g.bore * 0.08, 0.012, 0.045), 'cook', where);
  if (!ship.alive) return;
  startFire(state, ship, where, 0.3);
  ship.fires = burningCount(ship);
  // Everything else within reach of it.
  const reach = 3 + g.bore * 14;
  const hurt = (live, specs) => {
    for (let i = 0; live && specs && i < live.length && i < specs.length; i++) {
      const s = specs[i];
      if (live[i] === g.m) continue;
      if (Math.hypot((s.x || 0) - at.x, s.z - at.z) > reach) continue;
      live[i].disabled = Math.max(live[i].disabled || 0, 3 + state.rng() * 5);
      hurtMount(state, live[i], 0.5 + state.rng());
    }
  };
  hurt(ship.turrets, cls.turrets);
  hurt(ship.secMounts, cls.secondary ? cls.secondary.mounts : null);
  const hole = 1 + g.bore * 4;
  const w = localToWorld(at.x, at.z, ship.heading);
  state.events.push({
    e: 'blast', ship: ship.id, k: g.k, i: g.i,
    x: r(ship.x + w.x), y: r(at.y), z: r(ship.z + w.z), rad: r(hole), cal: Math.round(g.bore * 1000),
  });
  // And the hole it made, under whatever was next to it. Two steps of that
  // and no more: a battleship's light battery going up rack by rack down the
  // length of her is a thing that happened, but not every time.
  if (depth < 2) undercut(state, ship, at, hole, owner, depth + 1);
}

/**
 * How far across the middle the hole a round leaves in her deck is, metres --
 * the same one the picture cuts (see ShipView.hitMark), so what falls through
 * it is what is seen standing over it.
 */
function deckHole(kind, bore) {
  if (kind === 'overpen') return Math.max(0.7, bore * 1.6);
  if (kind === 'he') return bore >= 0.2 ? Math.max(1, bore * 3.5 * 0.55) : 0;
  if (kind === 'pen') return Math.max(1, bore * 2.2 * 1.3);
  if (kind === 'citadel') return Math.max(2.2, bore * 9 * 0.6);
  return 0;
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
  // What it keeps is what its striking velocity keeps, and that falls off
  // smoothly with the distance flown: about four-fifths of the muzzle figure
  // at ten kilometres, two-thirds at twenty, half at thirty -- the curve the
  // navy tables give for every heavy shell of the period (an Iowa's 16-inch
  // goes 829, 697, 509 mm at nought, nine and eighteen kilometres). It used
  // to fall away in a straight line and was down to half by nineteen
  // kilometres, which left an 18-inch shell at the range battleships fought
  // at unable to get through a 14-inch belt it would in fact have gone
  // through with room to spare.
  const penFall = clamp(Math.exp(-travelled / 42000), 0.35, 1);
  const effArmor = sec.armor / Math.max(0.18, cosT);
  const pen = spec.pen * penFall;

  // Her armour, as the plates it is made of, and the shell walked through
  // them in the order it meets them. See shared/armor.js.
  const layers = layersFor(armourScheme(cls, freeboardOf(cls)), sec.part);
  const cosOf = (face) => (face === 'deck' ? strikeCos(sh, target, 'deck')
    : face === 'end' ? strikeCos(sh, target, sec.part) : cosT);
  const walk = walkLayers(layers, pen, cosOf, spec.fuseArm || 0);
  void effArmor;

  let dmg = 0, kind = 'pen';
  if (ricochets(state, theta, spec, sec.armor)) {
    kind = 'ricochet'; dmg = 0;
    walk.stop = 0;
  } else if (spec.type === 'ap') {
    if (walk.stop === 0) {
      // It broke up on the face of the first plate. Some of the energy still
      // gets in; the shell does not.
      kind = 'shatter'; dmg = spec.damage * 0.04;
    } else if (walk.stop > 0) {
      // Through the outer plate and stopped by the one behind it: it bursts
      // between them -- in her side protection, or between her decks -- and
      // never reaches what they were there to keep it out of.
      kind = 'pen'; dmg = spec.damage * 0.33;
    } else if (sec.cit && walk.rem > walk.first * 0.05) {
      // Into the box: her machinery and her magazines. It got there by going
      // through every plate in the way, which is quite enough to start the
      // fuse, and there is nothing left to stop the burst.
      // The worst thing a shell can do to her, short of her magazine: the
      // whole of the shell's damage and the structure round the burst with it.
      kind = 'citadel'; dmg = spec.damage * 1.25;
    } else if (!walk.armed && pen > walk.total * 3) {
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
    // An armour-piercing shell carries a small bursting charge, and one that
    // goes off inside her can still set something alight -- only far less
    // often than a shell that is all charge and bursts on whatever it meets.
    // One that broke up on the plate or went straight through never burst
    // where there was anything to burn.
    // A citadel hit is the bursting charge going off among her machinery or
    // her handling rooms -- oil, cordite, lagging, everything that burns --
    // so it starts a fire far more often than a shell that burst in her side
    // protection, and a hotter one.
    const cit = kind === 'citadel';
    if ((kind === 'pen' || cit)
      && state.rng() < Math.min(0.9, cit ? Math.max(0.4, (spec.fireChance || 0) * 3) : Math.max(0.08, (spec.fireChance || 0) * 1.3)) * (target.fires >= 4 ? 0.3 : 1)) {
      startFire(state, target,
        sectionAt(l.z / (cls.hull.length * 0.5), sec.part), cit ? 0.65 : 0.3);
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
    if (spec.pen >= sec.armor) { kind = 'he'; dmg = spec.damage * 0.4; walk.stop = Math.min(1, layers.length - 1); }
    else { kind = 'splash'; dmg = spec.damage * 0.1; walk.stop = 0; }
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
    // Where on her, so the sea can be asked about it there (see holeHead): on
    // her side at the point it went in, its height off her waterline.
    const half = cls.hull.beam / 2;
    // seaOver measures her from a datum a metre under the line the shells
    // are reckoned from (the same one the renderer floats her on), so the
    // hole goes in at its height off that: in a flat calm it floods at
    // exactly the depth it always did.
    const at = { x: side * half, y: cy - 0.6 + 1, z: l.z };
    openHull(state, target, where, area, side, depth, at);
    // A shell that went clean through her came out the other side, and the
    // hole it came out by is as much use to the sea as the one it went in by.
    // That is the whole of what an overpenetration is worth, and against a
    // ship with no armour worth beating it is worth a good deal.
    if (kind === 'overpen') openHull(state, target, where, area, -side, depth, { x: -at.x, y: at.y, z: at.z });
  }
  // A hole in her deck or her upperworks is under something, as often as
  // not, and that does not stay where it was. See undercut.
  if (HOLING.has(kind) && (sec.part === 'deck' || sec.part === 'superstructure') && target.alive) {
    undercut(state, target, { x: l.x, y: cy, z: l.z }, deckHole(kind, sh.caliber / 1000), owner);
  }
  // A battery keeps no ribbon book: there is nobody aboard it to give one to.
  if (owner && owner.ribbons) {
    owner.ribbons.hits++;
    if (kind === 'citadel') owner.ribbons.cits++;
  }
  // And the walk itself, for the penetration camera: each plate it met and
  // what that plate was worth at the angle it met it, where it stopped, and
  // the strike in her own frame -- where on her and which way it was going.
  const lv = worldToLocal(sh.vx, sh.vz, target.heading);
  state.events.push({
    e: 'hit', kind, part: sec.part,
    x: cx, y: cy, z: cz, cal: sh.caliber,
    victim: target.id, owner: sh.owner, dmg: Math.round(dmg),
    pl: layers.map((L, i) => [L.k, Math.round(L.t), walk.met[i] ?? Math.round(L.t)]),
    ps: walk.stop,
    lx: Math.round(l.x * 10) / 10, lz: Math.round(l.z * 10) / 10,
    lv: [Math.round(lv.x), Math.round(sh.vy), Math.round(lv.z)],
    sc: target.classId, ap: spec.type === 'ap' ? 1 : 0,
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
  // Which kind of mounting this is. A boat's tubes are normally all of one
  // kind and the battery says so; the Surcouf is the exception and has to be,
  // because she carries both -- four inside the pressure hull firing out of
  // the stem, and two trainable triples standing on the casing that go over
  // the side like a destroyer's. A mounting may say for itself.
  const inHull = spec.inHull === undefined
    ? !!(cls.torpedoes && cls.torpedoes.inHull)
    : !!spec.inHull;
  if (inHull) {
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
  if (!cls) return want;
  // Clear of her hull, and not on a bearing its survey says the fish would
  // go into her from (see layFloor).
  const clear = (b) => torpedoClear(cls, spec, b) && !(layFloor(spec.mask, b) > 0);
  if (clear(want)) return want;
  // Blocked. Walk out to either side of the wanted bearing and take the
  // nearest one that is both inside the arc and clear of her own hull.
  for (let step = 0.04; step <= Math.PI; step += 0.04) {
    for (const sgn of [1, -1]) {
      const t = wrapAngle(want + sgn * step);
      if (Math.abs(angleDelta(spec.angle, t)) > spec.arc) continue;
      if (clear(t)) return t;
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
    const manned = isManned(ship, 'torp', m.id);
    const given = manned ? null : assignedAim(state, ship, 'torp', m.id, T.range, null, T.speed);
    // Given a ship out of reach: the bank stands where it is.
    if (given && given.idle) continue;
    const want = manned ? manLocal
      : given ? wrapAngle(headingTo(ship.x, ship.z, given.x, given.z) - ship.heading) : local;
    m.angle = trainWithin(m.angle, torpDesired(ship, T.mounts[m.id], want, cls), rate, T.mounts[m.id]);
  }
}

export function fireTorpedoes(state, ship, only = null, { assignedOnly = false } = {}) {
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
    if (m.cooldown > 0 || m.lost) continue;
    if (mountOff(ship, 'torp', m.id)) continue;
    const spec = T.mounts[m.id];
    const given = manned ? null : assignedAim(state, ship, 'torp', m.id, T.range, null, T.speed);
    if (given && given.idle) continue;
    if (!given && assignedOnly) continue;
    const world = manned
      ? headingTo(ship.x, ship.z, ship.manX, ship.manZ)
      : given ? headingTo(ship.x, ship.z, given.x, given.z)
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
    if (layFloor(spec.mask, local) > 0 || layFloor(spec.mask, m.angle) > 0) continue;
    // And she has to have come round. Fired before the bank has trained, the
    // fish go where the tubes were pointing, which is over her own bow.
    if (Math.abs(angleDelta(m.angle, torpDesired(ship, spec, local, cls))) > 0.05) continue;
    if (!manned && !orderGiven(state, ship, 'torp', { many: spec.tubes > 1 })) continue;
    const pos = localToWorld(spec.x, spec.z, ship.heading);
    // Down the line of the tubes, which is where a torpedo goes.
    const base = wrapAngle(ship.heading + m.angle);
    for (let i = 0; i < spec.tubes; i++) {
      const off = (i - (spec.tubes - 1) / 2) * (T.spread / Math.max(1, spec.tubes - 1)) * 2;
      const tp = {
        id: eid(), owner: ship.id, team: ship.team,
        x: ship.x + pos.x, z: ship.z + pos.z,
        heading: wrapAngle(base + off),
        speed: T.speed, range: T.range, travelled: 0,
        damage: T.damage, detection: T.detection, arming: T.arming,
        flood: T.floodChance,
      };
      if (T.launch) {
        // A bank standing high on a battleship's deck does not put its fish
        // in the water where it stands: each one is blown out of its own tube
        // in turn and goes over her side, and runs from where it falls in.
        // Until then it is aboard her, in her own frame -- see stepTorpedoes.
        const L = T.launch;
        const lane = L.lanes[i % L.lanes.length];
        const c = Math.cos(m.angle);
        const sn = Math.sin(m.angle);
        tp.aboard = {
          x: spec.x + lane * c + L.lie * sn, z: spec.z - lane * sn + L.lie * c,
          dx: sn, dz: c, v: L.eject,
          hold: i * L.stagger,
          run: (L.muzzle - L.lie) / L.eject + Math.sqrt((2 * L.height) / G),
        };
        const at = localToWorld(tp.aboard.x, tp.aboard.z, ship.heading);
        tp.x = ship.x + at.x;
        tp.z = ship.z + at.z;
      }
      state.torps.push(tp);
      launched++;
    }
    m.cooldown = T.reload;
    // The outer doors are open now, and stay open for a few seconds while the
    // tube is blown through and shut again.
    ship.tubeOpen = 4.5;
    state.events.push({
      e: 'torpLaunch', x: ship.x + pos.x, z: ship.z + pos.z, ship: ship.id,
      // Which bank went, so the boat on screen opens the right doors; and
      // how many fish, so the bridge knows whether to say one or a spread.
      mount: m.id, n: launched,
    });
  }
  return launched;
}

/**
 * Seconds from launch before a torpedo's pistol is armed. A fish that strikes
 * sooner than this still strikes -- it is half a ton of steel at forty knots
 * and it stops against her side -- but it does not go off.
 */
export const TORP_ARM_TIME = 5;

function stepTorpedoes(state, dt) {
  const out = [];
  for (const tp of state.torps) {
    // How long since it was launched. A fish put in the water by hand comes
    // in with only how far it has run, which is how long it has been running.
    tp.age = (tp.age ?? (tp.travelled || 0) / Math.max(1, tp.speed)) + dt;
    if (tp.aboard) {
      // Still in her tube, or in the air between it and the sea: carried
      // along with her, in her own frame, and harmless. It waits its turn in
      // the tube, is blown out along it, and drops into the water clear of her
      // side -- where it is a torpedo, running on the course it was set to.
      const a = tp.aboard;
      let t = dt;
      const wait = Math.min(a.hold, t);
      a.hold -= wait;
      t -= wait;
      if (t > 0) {
        const run = Math.min(a.run, t);
        a.x += a.dx * a.v * run;
        a.z += a.dz * a.v * run;
        a.run -= run;
      }
      const ship = state.ships.find((s) => s.id === tp.owner);
      if (ship) {
        const at = localToWorld(a.x, a.z, ship.heading);
        tp.x = ship.x + at.x;
        tp.z = ship.z + at.z;
      }
      if (a.hold <= 0 && a.run <= 1e-9) tp.aboard = null;
      out.push(tp);
      continue;
    }
    const nx = tp.x + Math.sin(tp.heading) * tp.speed * dt;
    const nz = tp.z + Math.cos(tp.heading) * tp.speed * dt;
    tp.travelled += tp.speed * dt;
    tp.x = nx; tp.z = nz;
    const bound = state.world.half || MAP_HALF;
    if (tp.travelled > tp.range || Math.abs(tp.x) > bound || Math.abs(tp.z) > bound) continue;
    if (islandAt(state.world, tp.x, tp.z, 0)) { state.events.push({ e: 'splash', x: tp.x, z: tp.z, cal: 200 }); continue; }

    let hit = false;
    {
      for (const target of state.ships) {
        if (!target.alive || !mayHurt(state, tp.team, target)) continue;
        // Not the ship that fired it while it is still getting clear of her.
        if (target.id === tp.owner && tp.age < 10) continue;
        const cls = getClass(target.classId);
        // Swept along the run it made this tick, not only where it ended up,
        // so a fish fired into a ship from close aboard cannot step over her.
        const px = tp.x - Math.sin(tp.heading) * tp.speed * dt;
        const pz = tp.z - Math.cos(tp.heading) * tp.speed * dt;
        let at = null;
        for (let k = 1; k <= 4 && !at; k++) {
          const qx = px + (tp.x - px) * (k / 4), qz = pz + (tp.z - pz) * (k / 4);
          if (pointInBox(qx, qz, target.x, target.z, target.heading, cls.hull.length * 0.5, cls.hull.beam * 0.5 + 3)) at = { x: qx, z: qz };
        }
        if (!at) continue;
        if (severed(target, cls, worldToLocal(at.x - target.x, at.z - target.z, target.heading).z)) continue;
        tp.x = at.x; tp.z = at.z;
        if (tp.age <= TORP_ARM_TIME) {
          // A dud: it hits her and that is all. Her plating is dented, the
          // fish breaks up against her side, and nobody is any the worse.
          state.events.push({ e: 'torpDud', x: tp.x, z: tp.z, victim: target.id, owner: tp.owner });
          hit = true;
          break;
        }
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
        // And the column of water it throws up her side, which is a wave like
        // any other to whatever is lying alongside.
        waterBlow(state, tp.x, tp.z, 620);
        hit = true;
        break;
      }
    }
    if (!hit) out.push(tp);
  }
  state.torps = out;
}

// ---------------------------------------------------------------------------
// Depth charges
// ---------------------------------------------------------------------------
//
// The other thing a destroyer is for, and the only weapon in the game that is
// not aimed at anything.
//
// Everything else she carries is laid: a gun is put on a bearing, a torpedo is
// run out on a course, and the answer arrives in seconds. A depth charge is
// none of that. The boat is somewhere under the sea and cannot be seen at all;
// what the ship has is a sonar bearing and a range that go quiet the moment
// she is close enough to attack, because the beam looks ahead and down and the
// boat is by then under her forefoot. So the pattern is put into the water
// over where she was, and then everybody waits the eleven seconds it takes
// three hundred pounds of TNT to sink thirty metres.
//
// Which means the whole of the weapon is in four numbers -- how fast a charge
// sinks, how deep its pistol is set, how close it has to be, and how long the
// racks take to reload -- and all four are on the datasheet.

/**
 * Every depth charge mounting she carries: the stern racks first, then the
 * throwers.
 *
 * One flat list, numbered once, because that is what the arsenal shows, what
 * the model builds, and what an order to drop names. Racks first because that
 * is the order a captain thinks of them in -- the racks are the attack and the
 * throwers widen it.
 */
export function chargeMounts(cls) {
  const D = cls && cls.depthCharges;
  if (!D) return [];
  return [
    ...(D.racks || []).map((m) => ({ ...m, rack: true })),
    ...(D.throwers || []).map((m) => ({ ...m, rack: false })),
  ];
}

/**
 * Set the pistols.
 *
 * `set` is metres, and it is held to what the racks can actually be wound to:
 * a Mk 6 pistol is a hydrostat with detents, not a dial.
 */
export function setChargeDepth(ship, set) {
  const D = shipClass(ship).depthCharges;
  if (!D) return 0;
  const want = Number(set);
  if (!Number.isFinite(want)) return ship.dcSet;
  let best = D.settings[0];
  for (const s of D.settings) if (Math.abs(s - want) < Math.abs(best - want)) best = s;
  ship.dcSet = best;
  return best;
}

/**
 * The nearest submerged enemy her sonar has hold of, or null.
 *
 * A QC set is a searchlight: it looks forward and down through an arc of about
 * a hundred and fifty degrees, it is deaf in the cone astern where her own
 * screws are making all the noise in the ocean, and it hears nothing at all
 * that is not under water -- a boat on the surface is a lookout's problem.
 *
 * Returns the boat, the range and the bearing relative to the ship's head,
 * because those three are the whole of what a sonar operator has to report.
 */
export function sonarContact(state, ship) {
  const D = shipClass(ship).depthCharges;
  if (!D || !D.sonar || !ship.alive) return null;
  // Her own flow noise. A hull-mounted set is a microphone bolted to the
  // outside of a ship: above about twenty-four knots it hears nothing but the
  // water going past it, which is why an escort holding contact goes slowly
  // and why the run-in is the dangerous part.
  if (D.sonarSpeed && Math.abs(ship.speed) > D.sonarSpeed) return null;
  let best = null;
  for (const boat of state.ships) {
    if (!boat.alive || boat.team === ship.team) continue;
    if (!getClass(boat.classId).dive || !submerged(boat)) continue;
    const range = dist(ship.x, ship.z, boat.x, boat.z);
    if (range > D.sonar) continue;
    // And the near limit: the beam will not depress far enough to follow her
    // under the forefoot. This is not a detail -- it is the reason every
    // attack in the war ended blind, fired on a plot carried forward from the
    // last good bearing.
    if (range < (D.sonarMin || 0)) continue;
    const bearing = wrapAngle(headingTo(ship.x, ship.z, boat.x, boat.z) - ship.heading);
    // The baffles: her own wake and her own screws, and nothing is heard
    // through them.
    if (Math.abs(bearing) > 2.62) continue;
    if (!best || range < best.range) best = { ship: boat, range, bearing };
  }
  return best;
}

/**
 * Put a pattern in the water.
 *
 * `only` is one mounting by its number in `chargeMounts`, or null for
 * everything that is loaded -- which is what a captain ordering a pattern
 * means: both racks and all six throwers, eight charges across the boat's
 * track at once.
 *
 * Returns how many charges went, which is what the caller wants to know:
 * nothing goes if the racks are empty or still being reloaded, and a ship that
 * pressed the key and got nothing has to be told so.
 */
export function dropCharges(state, ship, only = null) {
  const cls = shipClass(ship);
  const D = cls.depthCharges;
  if (!D || !ship.alive || ship.dcLeft <= 0) return 0;
  const mounts = chargeMounts(cls);
  let dropped = 0;
  for (const m of ship.dcMounts) {
    if (only !== null && m.id !== only) continue;
    if (m.cooldown > 0) continue;
    if (ship.dcLeft <= 0) break;
    const spec = mounts[m.id];
    if (!spec) continue;
    if (!orderGiven(state, ship, 'dc')) break;
    // Where it enters the water. A rack rolls its charge off the stern and it
    // goes in where the stern is; a K-gun throws its arbor out on the beam, so
    // the charge enters the sea the better part of sixty metres from the side
    // of the ship. That difference is the whole reason for the throwers: a
    // pattern from the racks alone is a line down her own wake, and a boat
    // fifty yards off it never hears anything but the noise.
    const out = spec.rack ? 0 : (spec.x < 0 ? -1 : 1) * (spec.throw || D.throw || 55);
    const at = localToWorld(spec.x + out, spec.z, ship.heading);
    state.charges.push({
      id: eid(), owner: ship.id, team: ship.team,
      x: ship.x + at.x, z: ship.z + at.z,
      // It goes in at the surface and sinks from there.
      y: 0,
      set: ship.dcSet || D.set,
      sink: D.sink, arming: D.arming,
      damage: D.damage, lethal: D.lethal, hurt: D.hurt,
      // How long it has been in the water, so a charge whose hydrostat never
      // fires is not in the sea for the rest of the battle.
      age: 0,
    });
    m.cooldown = D.reload;
    ship.dcLeft--;
    dropped++;
  }
  if (dropped) {
    state.events.push({
      e: 'dcDrop', ship: ship.id, x: ship.x, z: ship.z, n: dropped,
    });
  }
  return dropped;
}

/**
 * Her own fire control, working the racks.
 *
 * A depth charge attack is not something a captain has to press a key for any
 * more than he lays the secondary battery himself: the sonar has the boat, the
 * ship runs in over her, and the racks go at the moment the plot says she is
 * under the quarterdeck. What the key is for is doing it earlier, or doing it
 * when the operator has lost her and somebody has a better idea.
 *
 * So the attack goes in by itself unless it has been switched off, and the
 * condition is exactly the one the real attack ran on: the contact is close,
 * it is ahead, and it has gone quiet under the bow.
 */
function stepDepthAttack(state, ship, dt) {
  const cls = shipClass(ship);
  const D = cls.depthCharges;
  if (!D) return;
  for (const m of ship.dcMounts) if (m.cooldown > 0) m.cooldown -= dt;
  if (ship.dcHold > 0) ship.dcHold -= dt;
  // The plot, whether or not the set still has her.
  //
  // This is the whole of why an attack is hard, and it has to be modelled or
  // the racks never miss. A QC set looks ahead and down; the last thing that
  // happens on every attack in the war is that the contact walks into the
  // baffles under the bow and is not heard again until the sea has stopped
  // boiling. So the ship is always firing blind at the end of the run, on a
  // position her plot has been carrying forward since the last good bearing --
  // and the pattern goes where the plot says, not where the boat is.
  const got = sonarContact(state, ship);
  if (got) {
    // The error in that bearing and range, rolled once per attack: it is a
    // plot and not a dice throw, so the whole run shares one error, and it
    // shrinks as she closes -- which is why an escort held contact and went in
    // rather than dropping at the first ping.
    if (!ship.dcErr) {
      const a = state.rng() * TAU;
      ship.dcErr = { a, r: Math.sqrt(state.rng()) };
    }
    const spread = 4 + got.range * 0.05;
    const boat = got.ship;
    const was = ship.dcTrack;
    // How fast the plot says she is swinging. A recorder followed a target
    // round a turn perfectly well, so a boat that simply holds her helm over
    // is still being plotted; what breaks the plot is changing what she is
    // doing after the set has lost her, which is exactly what a boat under
    // attack was trying to do.
    let turn = 0;
    if (was && dt > 0) turn = clamp(wrapAngle(boat.heading - was.h) / dt, -0.2, 0.2);
    ship.dcTrack = {
      x: boat.x + Math.sin(ship.dcErr.a) * ship.dcErr.r * spread,
      z: boat.z + Math.cos(ship.dcErr.a) * ship.dcErr.r * spread,
      h: boat.heading,
      v: boat.speed,
      turn: was ? was.turn * 0.9 + turn * 0.1 : 0,
      age: 0,
    };
  } else if (ship.dcTrack) {
    // Carried forward round the last course and the last rate of turn, and
    // thrown away when it is too old to be worth anything.
    ship.dcTrack.h = wrapAngle(ship.dcTrack.h + ship.dcTrack.turn * dt);
    ship.dcTrack.x += Math.sin(ship.dcTrack.h) * ship.dcTrack.v * dt;
    ship.dcTrack.z += Math.cos(ship.dcTrack.h) * ship.dcTrack.v * dt;
    ship.dcTrack.age += dt;
    // Ninety seconds is a long time to be carrying a guess forward, and it is
    // what the recorder actually did: a plot is dropped when it has become
    // useless, not when it has become uncertain.
    if (ship.dcTrack.age > 90) { ship.dcTrack = null; ship.dcErr = null; }
  }
  if (!ship.dcAuto || ship.dcLeft <= 0 || ship.dcHold > 0 || !ship.dcTrack) return;
  // How long a charge takes to reach the depth the pistols are wound to, and
  // where the plot says she will have got to by then.
  const fall = (ship.dcSet || D.set) / D.sink;
  // Run the plot forward over the fall, round the turn it is carrying.
  let bx = ship.dcTrack.x;
  let bz = ship.dcTrack.z;
  let bh = ship.dcTrack.h;
  const STEPS = 6;
  for (let i = 0; i < STEPS; i++) {
    bh = wrapAngle(bh + ship.dcTrack.turn * (fall / STEPS));
    bx += Math.sin(bh) * ship.dcTrack.v * (fall / STEPS);
    bz += Math.cos(bh) * ship.dcTrack.v * (fall / STEPS);
  }
  // And the moment: the aim point has come abaft the stern, which is where a
  // rack is, and it is inside the width the throwers can cover. That is
  // exactly how an attack was fired -- the recorder ran the estimated position
  // down the ship's own track and the word was given as it passed under the
  // quarterdeck -- and it is why the pattern goes where the plot is rather
  // than where the boat is.
  const aim = worldToLocal(bx - ship.x, bz - ship.z, ship.heading);
  const stern = cls.hull.length * 0.46;
  if (aim.z > -stern || aim.z < -stern * 3) return;
  if (Math.abs(aim.x) > (D.throw || 55) * 0.7) return;
  if (dropCharges(state, ship)) {
    // Long enough for the pattern to go down, for the sea to stop boiling and
    // for her to run out, turn and come back: nobody attacks the same contact
    // twice inside twenty seconds, and the set is deaf in her own disturbance
    // anyway.
    ship.dcHold = 22;
    ship.dcErr = null;
    ship.dcTrack = null;
    state.events.push({ e: 'dcAttack', ship: ship.id, x: ship.x, z: ship.z });
  }
}

/**
 * The charges in the water, sinking.
 *
 * Nothing is laid and nothing is guided: they go straight down at the rate the
 * drum was ballasted for, and the pistol fires at the depth the rack was set
 * to on the way out. Everything interesting happens in the instant it does.
 */
function stepCharges(state, dt) {
  if (!state.charges.length) return;
  const out = [];
  for (const c of state.charges) {
    c.age += dt;
    c.y -= c.sink * dt;
    // The sea has a bottom, and a charge that reaches it goes off against it.
    const floor = -Math.max(30, c.set + 25);
    if (-c.y < c.set && c.y > floor && c.age < 90) { out.push(c); continue; }
    burstCharge(state, c);
  }
  state.charges = out;
}

/**
 * One charge going off.
 *
 * Three hundred pounds of TNT in water, which is a very different thing from
 * the same charge in air: water does not compress, so the shock goes out as a
 * wall rather than a puff, and what it does to a pressure hull is not a hole
 * but a crush. Inside the lethal radius a boat is opened; out to `hurt` she is
 * sprung, her lights go, her gauges break and she starts leaking at every
 * gland -- which is most of what depth charging actually achieved, and is why
 * it worked: a boat does not have to be sunk, only made to come up.
 */
function burstCharge(state, c) {
  state.events.push({ e: 'dcBurst', x: c.x, y: c.y, z: c.z, owner: c.owner });
  // The wave off it, which falls away far faster with depth than the dome
  // does: a charge going off at a hundred feet heaves the sea up white over
  // it and sends almost nothing out across the surface.
  const deep = Math.max(0, -(c.y || 0));
  waterBlow(state, c.x, c.z, 780 * Math.pow(Math.max(0.12, 1 - deep / 45), 1.5));
  const owner = state.ships.find((s) => s.id === c.owner);
  // A pistol that has not armed is a drum of wet TNT and does nothing at all.
  if (-c.y < c.arming) return;
  for (const target of state.ships) {
    if (!target.alive) continue;
    // Her own charges can always get her -- a pattern dropped from a ship not
    // making way goes off under her own quarterdeck -- but another ship of
    // her side only with friendly fire on.
    if (target.id !== c.owner && !mayHurt(state, c.team ?? (owner && owner.team), target)) continue;
    const cls = getClass(target.classId);
    // How far it is from the burst to the nearest piece of her. Her hull is a
    // box: her length and beam in plan, and in the vertical from her keel to
    // her deck -- which for a boat that is down is the whole of her, thirty
    // metres under the surface.
    const l = worldToLocal(c.x - target.x, c.z - target.z, target.heading);
    const dx = Math.max(0, Math.abs(l.x) - cls.hull.beam * 0.5);
    const dz = Math.max(0, Math.abs(l.z) - cls.hull.length * 0.5);
    const top = -target.depth;
    const keel = top - cls.hull.draft;
    const dy = c.y > top ? c.y - top : (c.y < keel ? keel - c.y : 0);
    const d = Math.hypot(dx, dz, dy);
    if (d > c.hurt) continue;
    // A submarine is a pressure hull and takes the shock as a pressure hull
    // does. A surface ship takes it on her bottom plating, with the whole of
    // her reserve buoyancy above it, and is shaken rather than crushed -- but
    // she is not immune, which is why the pistols are set deep and why a ship
    // attacking wants way on her.
    const boat = !!cls.dive;
    const near = clamp((c.hurt - d) / Math.max(0.5, c.hurt - c.lethal), 0, 1);
    const share = boat ? near * near : near * near * 0.22;
    if (share < 0.02) continue;
    const where = sectionAt(clamp(l.z / (cls.hull.length * 0.5), -1, 1), 'belt');
    damageShip(state, target, owner, c.damage * share, 'depthCharge', where);
    if (target.sections[where]) target.sections[where].pens++;
    // Inside the lethal radius her plating is opened and the sea comes in,
    // which for a boat that is already under is the end of the argument.
    if (d < c.lethal) {
      const side = l.x >= 0 ? 1 : -1;
      openHull(state, target, where, (14 + state.rng() * 20) * (boat ? 1 : 0.4),
        side, Math.max(1, cls.hull.draft * 0.8));
      wreckContents(state, target, where, 0.53, 'depthCharge',
        { x: l.x, y: -cls.hull.draft * 0.6, z: l.z });
    }
    if (owner && owner.team !== target.team && boat) owner.ribbons.torps++;
    state.events.push({
      e: 'dcHit', x: c.x, y: c.y, z: c.z, victim: target.id, owner: c.owner,
    });
  }
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
 * Her hangar is under the same three: the after magazine, the machinery and
 * the forward magazine are what a hangar deck is built over.
 */
const DECK_OVER = ['aft', 'mid', 'fwd'];

/** Her flight deck, round-down to bow, as the compartments under it. */
const RUNWAY = ['stern', 'aft', 'mid', 'fwd', 'bow'];

/**
 * How much of her length a loaded aircraft needs to get off a level deck, with
 * the ship's own way giving her wind over it. A ship can say otherwise.
 */
export const TAKEOFF_ROLL = 0.45;

/** How full her hangar compartments have to be before nothing comes up the lift. */
export const HANGAR_FLOODED = 0.5;

/** A compartment burning this hard is planking nobody can taxi across. */
const DECK_ABLAZE = 0.25;

/**
 * How much clear deck she has to fly off, in metres: the unbroken run of it
 * that ends at her bow, because that is where an aeroplane leaves. A hole aft
 * of the island shortens the run; a hole forward of it ends it.
 */
export function runwayLength(ship, cls = shipClass(ship)) {
  const L = cls.hull.length;
  if (!ship.sections) return L;
  let run = 0;
  for (let i = RUNWAY.length - 1; i >= 0; i--) {
    const c = ship.sections[RUNWAY[i]];
    if (!c || c.lost || c.hp <= 0) break;
    const s = SECTIONS.find((q) => q.k === RUNWAY[i]);
    run += (Math.min(1, s.to) - Math.max(-1, s.from)) * 0.5 * L;
  }
  return run;
}

/** How much deck she needs for the aeroplane to fly off it. */
export function takeoffRoll(ship, cls = shipClass(ship)) {
  return (cls.planes?.roll ?? TAKEOFF_ROLL) * cls.hull.length;
}

/** Whether the sea is in her hangar: nothing below can be brought up to fly. */
export function hangarFlooded(ship, cls = shipClass(ship)) {
  if (!ship.sections) return false;
  let water = 0;
  let room = 0;
  for (const k of DECK_OVER) {
    const c = ship.sections[k];
    if (!c) continue;
    water += c.water || 0;
    room += sectionVolume(cls, k);
  }
  return room > 0 && water / room >= HANGAR_FLOODED;
}

/** Whether the whole of her runway is alight. Part of it burning is not enough. */
export function runwayAblaze(ship) {
  if (!ship.sections) return false;
  return RUNWAY.every((k) => !ship.sections[k] || (ship.sections[k].fire || 0) >= DECK_ABLAZE);
}

/**
 * Is her flight deck out?
 *
 * Not damaged -- out. A carrier fought with her deck full of holes all through
 * the war and patched them between strikes, and she flew off a deck with a
 * fire on it. What stops her is not enough unbroken planking left to the bow
 * to get an aeroplane off, the sea in the hangar the aircraft come up from, or
 * every foot of the deck burning at once.
 *
 * A gun ship's catapults stand over her after compartments rather than on a
 * flight deck, and go with any of them.
 */
export function flightDeckOut(ship) {
  if (!ship.sections) return false;
  const cls = shipClass(ship);
  if (cls.type !== 'CV') return DECK_OVER.some((k) => ship.sections[k] && ship.sections[k].hp <= 0);
  return runwayLength(ship, cls) < takeoffRoll(ship, cls)
    || hangarFlooded(ship, cls) || runwayAblaze(ship);
}

/** What a tyre holds sideways on wet planking, as a fraction of the weight on it. */
export const DECK_GRIP = 0.12;
/** How hard a loaded aeroplane at full power gathers way down a level deck, in m/s². */
export const TAKEOFF_ACCEL = 4.5;

/**
 * Whether the deck run gets her off, and if not, how she was lost.
 *
 * Nothing holds an aeroplane to a flight deck but her own weight on her
 * wheels. Listed, the deck is a slope across her, and for the seconds she is
 * running down it she is sliding toward the low side at whatever gravity has
 * left over once her tyres have taken their share: past a few degrees she goes
 * over the edge before she has flying speed. Trimmed by the stern, the run is
 * uphill and she needs more deck than she would on the level, and with the
 * forward end shot away she may not have it -- in which case she goes off the
 * bow without flying speed and into the sea ahead of the ship.
 *
 * Returns null when she flies, else `side` or `bow`.
 */
export function deckRunFate(ship, cls = shipClass(ship)) {
  const G = 9.81;
  const heel = (ship.heel || 0) + (ship.lean || 0) + (ship.rock || 0);
  // Positive trim is down by the head: downhill, and it helps her.
  const a = TAKEOFF_ACCEL + G * Math.sin(ship.trim || 0);
  const runway = runwayLength(ship, cls);
  const need = a > 0.3 ? takeoffRoll(ship, cls) * TAKEOFF_ACCEL / a : Infinity;
  const run = Math.min(need, runway);
  const T = Math.sqrt(2 * run / Math.max(0.3, a));
  const slide = G * (Math.abs(Math.sin(heel)) - DECK_GRIP * Math.cos(heel));
  const drift = slide > 0 ? 0.5 * slide * T * T : 0;
  // From the centreline to the deck edge: her flight deck overhangs her hull.
  if (drift > (cls.planes?.deckBeam ?? cls.hull.beam * 1.3) * 0.5) return 'side';
  if (need > runway) return 'bow';
  return null;
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
  // What is still below of each type: a squadron is a third of the group, but
  // what she embarked is all she has, so the last squadron takes whatever the
  // first two left rather than a rounded third of a number that is not there.
  const n = cls.planes.squadrons;
  const share = (k) => {
    const all = Math.max(0, group[k] | 0);
    const base = Math.floor(all / n);
    // The odd ones go with the first squadrons off the deck.
    return base + (sq.id < all - base * n ? 1 : 0);
  };
  let fighters = share('fighters');
  let bomb = share('dive');
  let torp = share('torpedo');
  // A group small enough to round away to nothing still sends what it has:
  // otherwise a captain who embarked two torpedo bombers watches a squadron
  // fly out, find the enemy and drop nothing at all.
  if (fighters + bomb + torp === 0) {
    if (group.torpedo > 0) torp = 1;
    else if (group.dive > 0) bomb = 1;
    else if (group.fighters > 0) fighters = 1;
    else torp = 1;
  }
  // One aeroplane at a time. A squadron does not leave a deck as a flight of
  // three appearing together round the one machine you watched take off: each
  // of them comes up the lift, runs down the deck and goes, and is her own
  // aeroplane in the air from the moment her wheels leave it.
  //
  // And they go in turn: a fighter, a dive bomber, a torpedo bomber, and round
  // again, for as long as there are any of each left below. Sending every
  // fighter first had the escort circling over the ship for the whole of the
  // launch while the bombers were still coming up the lift one by one; ranged
  // in turn, the strike forms up as a strike from its first three aeroplanes.
  const queue = launchOrder(fighters, bomb, torp);
  ship.launching = {
    sqId: sq.id, left: cls.planes.deckRun ?? DECK_RUN,
    tx: ship.aimX, tz: ship.aimZ,
    // The first aeroplane off the deck leads the strike; the rest form on her.
    // Filled in when she is actually airborne, because until then there is no
    // aeroplane to be the leader.
    lead: 0, slot: 0,
    // Which side a catapult ship is shooting off this time. She has two and
    // uses them turn and turn about.
    side: (ship.catSide = -(ship.catSide || 1)),
    flights: queue,
    escort: fighters,
  };
  // Which job is going off first, so the deck can range the right machine.
  // And how long the deck has to do it in, so the evolution drawn on her is
  // played to the same clock.
  state.events.push({
    e: 'launch', x: ship.x, z: ship.z, ship: ship.id,
    r: ship.launching.flights[0] ? ship.launching.flights[0].role : undefined,
    d: ship.launching.left,
  });
  return true;
}

/**
 * The order a strike goes off the deck in: one of each type in turn --
 * fighter, dive bomber, torpedo bomber -- and round again, skipping a type
 * once there are none of it left.
 */
export function launchOrder(fighters, bomb, torp) {
  const left = { fighter: fighters, dive: bomb, torpedo: torp };
  const queue = [];
  while (left.fighter + left.dive + left.torpedo > 0) {
    for (const role of ['fighter', 'dive', 'torpedo']) {
      if (left[role] <= 0) continue;
      left[role]--;
      queue.push({
        role, count: 1, torp: role === 'torpedo' ? 1 : 0, bomb: role === 'dive' ? 1 : 0,
      });
    }
  }
  return queue;
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
 * And for each one after the first of a strike: the lift brings her up while
 * the one ahead of her is still running, she taxis to the spot, and goes. The
 * deck evolution on the client plays its handling at whatever pace fits this
 * and flies the run itself at the speed the aeroplane actually runs at.
 */
export const DECK_NEXT = 22;

/** Her speed as the deck run hands her over, in metres a second. */
export const LAUNCH_SPEED = 44;
/** And how quickly she works up from there to cruise, in metres a second a second. */
const CLIMB_OUT_ACCEL = 1.6;

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
export function launchOffset(cls, side = 1, role = null) {
  const P = cls.planes || {};
  // A carrier's three types do not leave her deck in the same place: a Zero is
  // off and climbing a long way short of where a Tenzan with a fish under her
  // is still hanging over the water. So a deck says where each of them goes.
  const out = byRole(P.runOut, role) ?? DECK_RUN_OUT;
  // A ship with a pair of catapults works them turn and turn about, so hers go
  // off alternate sides. A ship with one derrick has one side to work it over,
  // and says which: the Surcouf's boom tops over her port quarter, and a scout
  // that appeared to starboard every other launch would be coming out of the
  // sea on the side nothing had happened on.
  const s = P.runSide ?? side;
  const bearing = (P.runBearing ?? 0) * (P.runBearing ? s : 1);
  // Which way her nose points as she leaves, which is down the girder. On a
  // catapult trained out over the quarter that is not the bearing she ends up
  // on: she was thrown off at one angle and has flown on from there, and
  // putting her on the plot heading along the bearing instead turned her
  // fifty degrees in the instant she was handed over.
  const heading = P.runHeading != null ? P.runHeading * s : bearing;
  return { out, bearing, heading };
}

/** A number a ship's data may give once for all her aircraft, or per role. */
function byRole(v, role) {
  if (v && typeof v === 'object') return v[role] ?? v.torpedo ?? Object.values(v)[0];
  return v;
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
  // Her run down the deck, with the deck the way it is now. A carrier's; a
  // catapult throws its aeroplane off whatever the ship is doing.
  const fate = f && cls.type === 'CV' ? deckRunFate(ship, cls) : null;
  if (fate) {
    // Lost off the deck. She is not in the air and never will be; the deck
    // officer stops the launch, and whatever of the strike is already up goes
    // on without the rest of it. The squadron is struck below again until the
    // deck is fit to fly off.
    const fwd = fate === 'bow' ? runwayLength(ship, cls) - cls.hull.length * 0.5 + 12
      : cls.hull.length * 0.1;
    const low = wrapAngle(ship.heading + Math.sign(
      (ship.heel || 0) + (ship.lean || 0) + (ship.rock || 0) || 1) * Math.PI / 2);
    const out = fate === 'side' ? (cls.planes?.deckBeam ?? cls.hull.beam * 1.3) * 0.5 : 0;
    ship.launching = null;
    ship.deckBusy = Math.max(ship.deckBusy, 10);
    sq.state = 'deck';
    sq.cooldown = Math.max(sq.cooldown, 30);
    releaseStrike(state, ship, L.sqId);
    state.events.push({
      e: 'deckLoss', ship: ship.id, how: fate, r: f.role,
      x: r(ship.x + Math.sin(ship.heading) * fwd + Math.sin(low) * out),
      z: r(ship.z + Math.cos(ship.heading) * fwd + Math.cos(low) * out),
      h: Math.round((fate === 'side' ? low : ship.heading) * 1000) / 1000,
    });
    return;
  }
  if (f) {
    // Off the bow on the ship's own head, climbing, and turning toward the
    // target from there: the deck run is down her centreline, not toward
    // whatever she has been laid on.
    // Where this ship's launch actually leaves her: off the bow down a flight
    // deck, off the beam off a catapult.
    const off = launchOffset(cls, L.side || 1, f.role);
    const away = wrapAngle(ship.heading + off.bearing);
    const nose = wrapAngle(ship.heading + off.heading);
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
      heading: nose,
      tx: L.tx, tz: L.tz,
      torp: f.torp, bomb: f.bomb,
      count: f.count,
      // Fighters are harder to catch than a loaded bomber, and they are what
      // keeps the flak and the enemy's CAP off the ones carrying the weapons.
      // Where the launch actually leaves her, off the ground: the end of the
      // integrated deck run or catapult shot, not a number chosen to look
      // right. She climbs away from there under her own power.
      y: byRole(cls.planes.runHeight, f.role) ?? 41,
      vy: 4,
      // Not at cruise: at what she left the deck at, a few knots over the
      // stall with her flaps still down, and she works up to cruise from
      // there. Born at cruise she was drawn leaping forward at the hand-over,
      // twice as fast as the aeroplane that had just gone off the bow.
      launchV: cls.planes.launchSpeed ?? LAUNCH_SPEED,
      hp: planeHp(cls, f, L),
      // The aeroplanes themselves. A flight is not a hit-point bar with a
      // number of aircraft written on it: it is that many machines, each with
      // her own engine, tanks, wings, tail and crew, and each of them able to
      // be hit, set on fire, crippled or shot down on her own. See
      // airframe.js.
      perHp: planeHp(cls, f, L) / Math.max(1, f.count),
      machines: Array.from({ length: f.count },
        () => freshAirframe(planeHp(cls, f, L) / Math.max(1, f.count))),
      // She goes for the enemy the moment her wheels are up. A deckload
      // goes off one aeroplane at a time, twenty-odd seconds apart, and
      // holding the first of them over the ship until the last was off had
      // a strike circling its own carrier for ten minutes with the enemy in
      // sight -- so each one is her own leader and heads straight out.
      phase: 'outbound', dropped: false, life: 0, hunt: 0,
      lead: 0, slot: L.slot++,
      // Set while somebody is flying her by hand; see flyPlane.
      flown: false, flownAt: 0, dead: false,
      targetId: 0, targetAir: 0, targetHeavy: 0, targetBat: 0, turn: 0, bank: 0, roll: 0,
    };
    if (!L.lead) L.lead = p.id;
    p.lead = p.id;
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
  // The next one is ranged and goes down the deck after her. She is already
  // in the hangar with her engine warm, so it is the lift and the taxi and her
  // own run and no more: quicker than the first one, which had the whole
  // evolution to go through. The deck stays busy for the whole of it, so
  // nothing else can use it meanwhile.
  L.left = cls.planes.deckNext ?? DECK_NEXT;
  ship.deckBusy = Math.max(ship.deckBusy, L.left + (cls.planes.deckCycle ?? DECK_CYCLE) * 0.35);
  state.events.push({
    e: 'launch', x: ship.x, z: ship.z, ship: ship.id,
    r: L.flights[0] ? L.flights[0].role : undefined,
    d: L.left,
  });
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
 * Where one aeroplane of a strike flies on her leader, now that each of them
 * is her own aeroplane rather than a flight of several drawn round one point.
 *
 * Vics of three -- a section leader with a wingman stepped back on each side
 * -- and the vics in echelon behind the leader's, three abreast. A strike of
 * thirty comes out as ten vics in three columns, which is what a deckload
 * strike looked like going out, and nobody is in anybody else's slot.
 */
function stationOf(slot) {
  const s = Math.max(0, slot | 0);
  const vic = Math.floor(s / 3);
  const inVic = s % 3;
  const wing = [[0, 0], [38, -30], [-38, -30]][inVic];
  const row = Math.floor(vic / 3);
  const col = vic % 3;
  const cx = [0, 190, -190][col];
  const cz = -row * 170 - (col ? 95 : 0);
  return [cx + wing[0], cz + wing[1]];
}

/** How near the enemy the strike breaks formation and each flight goes in. */
const BREAK_RANGE = 4000;

/** How far ahead of the flight she is covering a meat shield flies. */
const SHIELD_AHEAD = 450;

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
    // Flown at a radius she can actually hold, worked out of her own wing.
    //
    // It used to be a fixed fifteen hundred metres at a fixed six hundredths
    // of a radian a second, and the comment said the point went round it a
    // shade slower than she flies. It does not: that is ninety metres a second
    // and she cruises at seventy-eight, so the point she was chasing outran
    // her for the whole form-up and she never once got onto it. The circle is
    // hers now -- her speed over the rate her wing will give her, opened out
    // to twice that so she is turning gently rather than hanging on the edge
    // of a sustained turn for two minutes.
    const frm = airframeOf(p.type, p.role);
    const v = Math.max(30, p.speed || frm.vMax * 0.7);
    const rate = Math.max(0.02, turnFor(v, sustainBank(frm, v)));
    const R = clamp((2 * v) / rate, 400, 2200);
    const a = p.life * (v / R);
    return { x: carrier.x + Math.sin(a) * R, z: carrier.z + Math.cos(a) * R };
  }
  // She has gone after something in the air: out of the formation and after
  // it. On passage that is for good; over her own ship she comes back to the
  // circle when it is over.
  if (p.targetAir || p.df) {
    if (p.phase !== 'formup') p.lead = p.id;
    return null;
  }
  const lead = state.planes.find((q) => q.id === p.lead && !q.dead);
  // Her leader has been shot down, or has already gone in. She is her own
  // leader from here.
  if (!lead) { p.lead = p.id; return null; }
  if (lead.phase === 'return') { p.lead = p.id; return null; }
  // Her leader is a fighter and has gone off after something in the air. The
  // strike does not follow him into a dogfight: the next of it takes over.
  if (lead.role === 'fighter' && (lead.df || lead.targetAir || lead.targetHeavy)) {
    const next = freshLead(state, p, lead);
    p.lead = next ? next.id : p.id;
    return formationGoal(state, p, carrier);
  }
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
  const [sx, sz] = stationOf(p.slot || 0);
  const sn = Math.sin(lead.heading);
  const cs = Math.cos(lead.heading);
  return { x: lead.x + sn * sz + cs * sx, z: lead.z + cs * sz - sn * sx };
}

/**
 * Who leads a strike once its leader has gone off to fight: the first of the
 * rest of it, by the order they came off the deck, that is not off fighting
 * too. Every flight in the strike works it out the same way, so they all
 * agree on her without having to be told.
 */
function freshLead(state, p, old) {
  let best = null;
  for (const q of state.planes) {
    if (q.dead || q === old || q.owner !== p.owner || q.sqId !== p.sqId) continue;
    if (q.phase !== p.phase || q.targetAir || q.df || q.targetHeavy) continue;
    if (!best || q.id < best.id) best = q;
  }
  return best;
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
  dive: { climb: 9.0, ceiling: 7600, dive: 132, g: 2.7 },
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
const DIVE_PERCH = 1500;       // the height she pushes over from
const DIVE_PUSH = 700;         // and the ground range she does it at
const DIVE_DROP = 450;         // her height when the bomb leaves her
const DIVE_AT = 170;           // and the range -- just inside the release
/**
 * How she gets from the perch into the dive: not by pushing the stick
 * forward, which puts her crew on the canopy and her engine out of fuel, but
 * over on her back. She lifts her nose for a moment, rolls inverted, pulls the
 * nose down through the horizon onto her target and rolls upright again
 * with her brakes out, pointing at it -- a couple of seconds from level flight
 * to seventy degrees, and the one thing everybody who ever saw a dive bombing
 * attack remembers.
 */
const DIVE_ROLL = 2.1;         // seconds, from the zoom to upright in the dive
/**
 * And how hard she pulls in each part of it, in gravities: the roll-in is a
 * hard pull with her on her back, and the pull-out at the bottom is the
 * hardest thing she does -- the bomb is gone, she is four hundred metres up
 * at two hundred and sixty knots and pointing at the sea.
 */
const DIVE_PULL_IN = 4.2;
const DIVE_PULL_OUT = 5.2;
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
const DIVE_SPEED = 140;
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
const RUN_IN_FROM = { torpedo: 5200, dive: 12000, fighter: 3000, scout: 3200 };
const RUN_IN_BY = { torpedo: 1400, dive: 900, fighter: 600, scout: 800 };

/**
 * Where a dive bomber is in her attack, and what it asks of her vertical.
 *
 * `p.dv` is the stage: nothing on passage and on the climb to the perch;
 * `roll` from the moment she is over her push-over point until she is upright
 * in the dive; `dive` down the line to the release; `pull` from the release
 * until she is climbing again, after which the climb back up to cruising
 * height is the ordinary business of coming home. `p.show` is her bank while
 * she is rolling, which is more than the autopilot's own bank can ever be --
 * she goes right over on her back -- and is what the client draws.
 *
 * Returns what the stage wants of her vertical speed and how hard she may
 * pull to get it, or null when it is her ordinary profile that decides.
 */
function diveStage(state, p, dt) {
  if (p.dv === 'pull') {
    // Out of it: as hard as she will stand until the nose is above the
    // horizon, and then the climb home.
    if ((p.vy || 0) > 2) { p.dv = undefined; return null; }
    return { vy: 30, g: DIVE_PULL_OUT };
  }
  if (p.phase !== 'outbound' || !(p.bomb > 0) || p.dropped) {
    p.dv = undefined; p.show = undefined;
    return null;
  }
  const mark = p.targetBat
    ? state.batteries.find((q) => q.id === p.targetBat && q.alive)
    : state.ships.find((q) => q.id === p.targetId && q.alive);
  if (!mark) return null;
  const d = dist(p.x, p.z, mark.x, mark.z);
  if (!p.dv) {
    // Whatever height she has got up to is what she dives from, so long as
    // there is a dive in it: a strike sent at a ship a few miles off is still
    // climbing when it arrives over her, and a dive bomber that waited for
    // the full perch would never go down at all -- she lobbed it from level
    // flight instead, which is not what she is for.
    // She rolls in where the height she has will make a steep dive of it: a
    // fifty-five degree line from the roll-out to the release, and the couple
    // of hundred metres the roll itself carries her on.
    //
    // And whatever height that is. One that arrives over her target before
    // she has climbed to her perch does not go round it climbing for more:
    // she is there, the flak is on her, and she pushes over from where she is
    // and lets go lower down the dive instead -- see dropHeight.
    const over = Math.max(0, (p.y ?? 0) - (mark.y || 0) - dropHeight(p, mark));
    if (d > DIVE_AT + over / 1.45 + 220) return null;
    // Over the top. Which way she rolls is the way her target is turning out
    // from under her, so she comes out of it already pointing at it.
    p.dv = 'roll';
    p.dvT = 0;
    // Where the bomb leaves her, fixed for this dive at the height she has
    // to start it from.
    p.dropY = releaseFor((p.y ?? 0) - (mark.y || 0));
    p.perch = Math.max((mark.y || 0) + p.dropY + 60, p.y);
    const off = angleDelta(p.heading, headingTo(p.x, p.z, mark.x, mark.z));
    p.dvSide = off >= 0 ? 1 : -1;
  }
  if (p.dv === 'roll') {
    p.dvT += dt;
    const t = p.dvT;
    const k = (u) => u * u * (3 - 2 * u);
    // Her bank: up and over onto her back, held there while she pulls the
    // nose down through the horizon, and back upright with the target under
    // her nose.
    let bank;
    if (t < 0.45) bank = 0.9 * k(t / 0.45);
    else if (t < 1.25) bank = 0.9 + (2.75 - 0.9) * k((t - 0.45) / 0.8);
    else bank = 2.75 * (1 - k(Math.min(1, (t - 1.25) / (DIVE_ROLL - 1.25))));
    p.show = p.dvSide * bank;
    if (t >= DIVE_ROLL) {
      p.dv = 'dive';
      p.show = undefined;
      // The line she dives down starts where she is now, at the height she
      // has now: the zoom and the roll have used some of both.
      p.diveFrom = Math.max(DIVE_AT + 120, d);
      p.perch = Math.max((mark.y || 0) + dropHeight(p, mark) + 60, p.y);
      return null;
    }
    // The zoom first, nose up for the half second she is rolling into it,
    // and then everything she has downward.
    if (t < 0.45) return { vy: 12, g: 1.6 };
    return { vy: -132, g: DIVE_PULL_IN };
  }
  return null;
}

/**
 * The height above her target a dive bomber lets go at, for a dive started
 * this high.
 *
 * Four hundred and fifty metres from a proper perch. One that rolled in short
 * of her perch has less dive to give, so she lets go lower -- a little under
 * half of whatever she started from, and never under a hundred and twenty,
 * which is as low as anybody pulled out of a dive and lived.
 */
function releaseFor(above) {
  return clamp(above * 0.42, 120, DIVE_DROP);
}

/** Her release height on this dive, or a full one when she has not begun it. */
function dropHeight(p, mark) {
  if (p.dropY !== undefined && p.dv) return p.dropY;
  return releaseFor((p.y ?? 0) - (mark.y || 0));
}

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
    const mark = ramMark(state, p);
    if (mark) {
      const d = dist(p.x, p.z, mark.x, mark.z);
      // A gun on a hill is that much higher to come down on.
      const base = p.ramBat ? (mark.y || 0) : 0;
      if (p.ramOut) return base + 220;
      // Held up until she is close, then down the last of it in a dive, so
      // she comes in out of the sky rather than skimming the sea for a mile.
      return base + (d > 3000 ? 260 : Math.max(p.ramBat ? 1 : 6, 6 + (d - 150) * 0.085));
    }
  }
  // A meat shield flies at the height of the flight she is in front of: a
  // shield over the top of a torpedo bomber's run is no shield at all.
  if (p.phase === 'outbound' && p.shieldFor && !inCompany) {
    const cov = state.planes.find((q) => q.id === p.shieldFor && !q.dead);
    // Not while she is leading it, though: then it is keeping station on her,
    // and the two of them would climb each other up the sky.
    if (cov && cov.lead !== p.id) return Math.max(30, (cov.y ?? CRUISE_ALT) + 15);
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
    // In the dive itself: straight down the line from wherever she came out
    // of her roll to the release, which is what makes it one angle all the
    // way down. See diveStage.
    if (p.dv === 'dive' && p.diveFrom) {
      const k = clamp((d - DIVE_AT) / Math.max(1, p.diveFrom - DIVE_AT), 0, 1);
      const drop = dropHeight(p, mark);
      return (mark.y || 0) + drop + (p.perch - drop) * k;
    }
    // Still climbing to the perch, and holding what she has until she is far
    // enough in to roll over onto it: she wants to be over the top of her
    // target with height in hand, not arriving at it level, and not easing
    // down toward it before she has rolled in. See diveStage.
    //
    // Short of her perch she goes on climbing on the way in, but only on the
    // way in: once she is over her target she dives from what she has. See
    // diveStage.
    if (d > DIVE_PUSH || !p.dv) {
      const k = clamp((d - DIVE_PUSH) / Math.max(1, from - DIVE_PUSH), 0, 1);
      return DIVE_PERCH + (CRUISE_ALT - DIVE_PERCH) * k;
    }
    // Over the top and down. She pushes over from the height she actually
    // reached, which is not always the perch: a strike is still climbing out
    // when the target is only a few miles away, and a dive flown down to a
    // line she never got up to is a climb followed by a dive. Whatever she has
    // when she arrives on top of her target is what she gives up.
    const drop = dropHeight(p, mark);
    if (p.perch === undefined) p.perch = Math.max(drop + 260, p.y);
    // Straight in the ground range, which is what makes it a constant angle
    // all the way to the release.
    const k = clamp((d - DIVE_AT) / (DIVE_PUSH - DIVE_AT), 0, 1);
    return (mark.y || 0) + drop + (p.perch - drop) * k;
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
 * A strike flight of her own side to go in in front of, and the ship it is
 * going for: the nearest loaded bomber or torpedo bomber still on its way in.
 */
function shieldTarget(state, p) {
  let best = null;
  let bestD = 9000;
  for (const q of state.planes) {
    if (q.dead || q.team !== p.team || q.role === 'fighter') continue;
    if (q.phase !== 'outbound' && q.phase !== 'formup') continue;
    if (q.dropped || !q.targetId) continue;
    const d = dist(p.x, p.z, q.x, q.z);
    if (d < bestD) { best = q; bestD = d; }
  }
  if (!best) return null;
  const ship = state.ships.find((s) => s.id === best.targetId && s.alive);
  return ship ? { shield: best, ship } : null;
}

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
    let airD = guard ? 6000 : 7000;
    for (const q of state.planes) {
      if (q.dead || q.team === p.team || q.id === p.id || !mayHurt(state, p.team, q)) continue;
      // The machines carrying the bombs and the fish before their escort:
      // stopping those is what she is up there for.
      const d = dist(from.x, from.z, q.x, q.z) - (q.role === 'fighter' ? 0 : 900);
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
    // Nothing to fight in the air. She does not go home, and she does not sit
    // over the strike waiting for something that is not coming: she goes in
    // ahead of the bombers as a shield, flying between them and the ship they
    // are going for so the flak is laid on her, and at the end she goes into
    // that ship herself. With no strike out to cover she simply goes in.
    // With no strike out to cover she simply goes in, on the same ship she
    // would have picked anyway (below): the smallest, where an aeroplane
    // arriving at three hundred knots hurts most.
    const cover = shieldTarget(state, p);
    if (cover) return cover;
    // Nothing afloat within reach either. She goes back and sits over the
    // strike, weaving above and behind it.
    if (guard && !state.ships.some((s) => s.alive && s.team !== p.team
      && dist(p.x, p.z, s.x, s.z) < REACH * 1.6)) return { escort: guard };
  }
  // The ship her side's staff wants down. Her own eyes still have to find her
  // -- an order does not put a ship inside a flight's reach -- but when the
  // strike has been given a target, every flight in it goes for the same one.
  // That is the difference between a strike and a hundred sorties.
  if (p.orderTarget) {
    const want = state.ships.find((q) => q.id === p.orderTarget && q.alive
      && q.team !== p.team);
    if (want && (dist(p.x, p.z, want.x, want.z) < REACH * 1.6
      || (want.spottedBy && want.spottedBy[p.team]))) return { ship: want };
  }
  // Anything her side has spotted is hers to go for, however far: she does
  // not wait to stumble on it inside her own sight. Something nobody has
  // reported still counts once she is close enough to see it herself.
  let best = null;
  let bestD = Infinity;
  let score = Infinity;
  for (const s2 of state.ships) {
    if (!s2.alive || s2.team === p.team) continue;
    const d = dist(p.x, p.z, s2.x, s2.z);
    if (d > REACH && !(s2.spottedBy && s2.spottedBy[p.team])) continue;
    let v;
    if (p.role === 'fighter') v = bulk(s2) * 2.2 + d * 0.02;          // the smallest
    else if (p.role === 'torpedo') v = -bulk(s2) * 6 + d * 0.02;      // the biggest
    else v = d * 0.02;                                               // the nearest
    if (v < score) { best = s2; score = v; bestD = d; }
  }
  // A dive bomber's bomb is as good on a gun position as on a deck, and a
  // battery shooting at her ships is as much her business as a ship is: she
  // takes whichever of the two is nearer, rather than leaving the guns ashore
  // until there is nothing left afloat.
  const takesWorks = p.role !== 'fighter' && p.role !== 'torpedo';
  let works = null;
  let worksD = REACH * 1.4;
  if (takesWorks) {
    for (const b of state.batteries) {
      if (!b.alive || b.team === p.team) continue;
      const d = dist(p.x, p.z, b.x, b.z);
      if (d < worksD) { works = b; worksD = d; }
    }
  }
  if (works && (!best || worksD < bestD)) return { battery: works };
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

  // Nothing on the surface left for her at all. Only now does a strike
  // aircraft go after the other side's aeroplanes: she was sent with a bomb or
  // a fish for a ship, and a flight that wanders off into a dogfight with her
  // load still on the rack has thrown away the sortie.
  if (p.role !== 'fighter') {
    const foe = nearestAir(state, p, 6000);
    if (foe) return { air: foe };
  }

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

/** The nearest of the other side's flights in the air, inside `reach`, or null. */
function nearestAir(state, p, reach) {
  let best = null;
  let bestD = reach;
  for (const q of state.planes) {
    if (q.dead || q.team === p.team || q.id === p.id || !mayHurt(state, p.team, q)) continue;
    const d = dist(p.x, p.z, q.x, q.z);
    if (d < bestD) { best = q; bestD = d; }
  }
  return best;
}

/** How near something in the air has to be to stop a fighter going in. */
const RAM_BREAK = 6000;

/**
 * A fighter that was about to go into a ship, and has something in the air to
 * fight instead.
 *
 * Going in is the last thing a fighter does, not the first: it is what a
 * fighter with nothing left to shoot at does with her aeroplane. While there
 * is an enemy aeroplane or a bomber stream within reach she goes after that,
 * and puts her aeroplane into a ship only once the sky is clear. Returns true
 * when she has been turned onto one.
 */
function turnOnAir(state, p) {
  if (p.role !== 'fighter' || p.flown || dyingFlight(p)) return false;
  const air = nearestAir(state, p, RAM_BREAK);
  let heavy = null;
  if (!air) {
    let hd = RAM_BREAK;
    for (const q of (state.bombers || [])) {
      if (!q.alive || q.team === p.team) continue;
      const d = dist(p.x, p.z, q.x, q.z);
      if (d < hd) { heavy = q; hd = d; }
    }
  }
  if (!air && !heavy) return false;
  p.phase = 'outbound';
  p.ramOut = false;
  p.shieldFor = 0;
  p.targetId = 0; p.targetBat = 0;
  p.targetAir = air ? air.id : 0;
  p.targetHeavy = heavy ? heavy.id : 0;
  const m = air || heavy;
  p.tx = m.x; p.tz = m.z;
  p.hunt = 0.6;
  return true;
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

/** Walk the line a piloted flight just flew; leave her where it first meets an enemy hull. */
function sweepIntoShip(state, p, was) {
  const to = { x: p.x, y: p.y ?? 220, z: p.z };
  const len = Math.hypot(to.x - was.x, to.y - was.y, to.z - was.z);
  if (len < 1) return false;
  const n = Math.min(80, Math.ceil(len / 3));
  for (const s of state.ships) {
    if (!s.alive || !mayHurt(state, p.team, s)) continue;
    const cls = getClass(s.classId);
    if (dist2(to.x, to.z, s.x, s.z) > (cls.hull.length + len) ** 2) continue;
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      const q = { x: lerp(was.x, to.x, f), y: lerp(was.y, to.y, f), z: lerp(was.z, to.z, f) };
      if (!planeInShip(q, s, cls)) continue;
      p.x = q.x; p.y = q.y; p.z = q.z;
      return true;
    }
  }
  return false;
}

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
    armed: armed ? 1 : 0, dmg: Math.round(dmg), tk: state.tick,
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
 * An aeroplane into a gun position.
 *
 * The same arithmetic as a ship (see ramShip): the airframe at the speed it
 * arrived, and whatever was still on the rack. What it meets is different.
 * There is no hull to hole and no sea to let in -- there is a gun in a pit with
 * its crew and its ready ammunition round it, and most of what an aeroplane
 * brings goes straight into all three. A casemate or a turret roof takes some
 * of it; an open pit takes all of it.
 */
function ramBattery(state, p, bat) {
  const spec = BATTERIES[bat.batteryId];
  const owner = state.ships.find((q) => q.id === p.owner) || null;
  const speed = Math.max(40, p.speed || 110);
  const mass = RAM_MASS[p.role] || RAM_MASS.scout;
  let dmg = mass * (speed / 110) * (speed / 110);
  const P = owner ? shipClass(owner).planes : null;
  const armed = !p.dropped && ((p.bomb ?? 0) > 0 || (p.torp ?? 0) > 0);
  if (armed && P) {
    dmg += (p.torp ?? 0) > 0 ? (P.torpDamage ?? 9000) * 0.8 : (P.bombDamage ?? 4000) * 0.9;
  }
  // Overhead cover: a few centimetres of shield is nothing, a battleship
  // turret roof is most of the answer.
  dmg *= spec.armour > 150 ? 0.35 : spec.armour > 40 ? 0.6 : 1;
  const was = bat.alive;
  hurtBattery(state, bat, dmg);
  if (owner) {
    owner.damageDealt = (owner.damageDealt || 0) + dmg;
    if (was && !bat.alive) owner.kills = (owner.kills || 0) + 1;
  }
  landStrike(state, p.x, p.z, armed ? 0.42 : 0.26, 'crash');
  state.events.push({
    e: 'ram', bat: bat.id, team: p.team, i: p.id,
    x: r(p.x), y: r(bat.y + 2), z: r(p.z), h: r(p.heading),
    armed: armed ? 1 : 0, dmg: Math.round(dmg), tk: state.tick,
  });
  const live = (p.machines || []).filter((a) => a.alive && !a.left);
  if (live.length) losePlane(state, p, live[0], 'rammed');
  if (!live.length || live.length === 1) {
    p.hp = 0;
    killFlight(state, p, 'rammed');
  } else {
    p.dropped = p.dropped || armed;
    const fs = flightState(p.machines);
    p.wear = fs;
    p.count = fs.count;
  }
  return true;
}

/**
 * What is left of an aeroplane, into a ship.
 *
 * The same physics a machine flown in on purpose gets (see ramShip), with the
 * difference that nobody aimed her: she arrives at whatever speed the fall
 * has given her, on whatever she happens to come down on. A heavy is several
 * carrier aircraft's weight, and one that still had her bombs aboard brings
 * them with her.
 */
function wreckIntoShip(state, f, s, cls) {
  const owner = f.owner ? state.ships.find((q) => q.id === f.owner) || null : null;
  const l = worldToLocal(f.x - s.x, f.z - s.z, s.heading);
  const y = f.y;
  const where = sectionAt(l.z / (cls.hull.length * 0.5), y > 12 ? 'superstructure' : 'belt');
  const side = l.x >= 0 ? 1 : -1;
  const speed = Math.max(30, Math.hypot(f.vx, f.vy, f.vz));
  const armed = f.load > 0;
  const dmg = f.mass * (speed / 110) * (speed / 110) * 0.7 + f.load;
  damageShip(state, s, owner, dmg, armed ? 'bomb' : 'he', where);
  s.sections[where].pens++;
  wreckContents(state, s, y > 12 ? 'works' : where,
    (armed ? 0.36 : 0.2) + (f.heavy ? 0.14 : 0), armed ? 'bomb' : 'he',
    { x: l.x, y, z: l.z });
  if (y < 9) {
    const area = (f.heavy ? 6 : 2) + state.rng() * (armed ? 8 : 4);
    openHull(state, s, where, area, side, Math.max(0.5, cls.hull.draft * 0.25 * state.rng()));
  }
  startFire(state, s, where, f.heavy || armed ? 0.85 : 0.5);
  state.events.push({
    e: 'wreckHit', ship: s.id, f: f.id, i: f.from, team: f.team, heavy: f.heavy ? 1 : 0,
    x: r(f.x), y: r(y), z: r(f.z), armed: armed ? 1 : 0, dmg: Math.round(dmg), tk: state.tick,
  });
}

/** How close two aeroplanes have to come to touch: half a span each, near enough. */
const TOUCH = 7;
const TOUCH_HEAVY = 15;

/**
 * Every machine of a formation that is still flying, where she is now and
 * where she was a tick ago -- for walking a line through rather than testing a
 * point, because two aeroplanes closing at four hundred knots are seven metres
 * nearer each other every tick.
 */
function flyingMachines(p, heavy) {
  const out = [];
  if (!(p.machines || []).length) return out;
  const at = { x: 0, y: 0, z: 0 };
  const was = { x: 0, y: 0, z: 0 };
  const py = p.y ?? 220;
  const px0 = p.px ?? p.x, py0 = p.py ?? py, pz0 = p.pz ?? p.z;
  for (const a of p.machines) {
    if (!a.alive || a.left) continue;
    const k = machineSlot(p, a);
    (heavy ? vicAt : slotAt)(k, p.heading || 0, at);
    (heavy ? vicAt : slotAt)(k, p.ph ?? p.heading ?? 0, was);
    out.push({
      a, x: p.x + at.x, y: py + at.y, z: p.z + at.z,
      x0: px0 + was.x, y0: py0 + was.y, z0: pz0 + was.z,
    });
  }
  return out;
}

/**
 * Do two lines through the air, walked over the same tick, come within `rad`
 * of each other? The second one's motion is taken off the first, so it is one
 * segment against a fixed point.
 */
function passNear(m, n, rad) {
  return segNear(
    m.x0 - n.x0, m.y0 - n.y0, m.z0 - n.z0,
    m.x - n.x, m.y - n.y, m.z - n.z,
    0, 0, 0, rad,
  );
}

/** Lose one machine of a carrier flight or of a heavy squadron, whichever she is. */
function loseMachine(state, q, a, heavy, why) {
  if (heavy) {
    loseHeavy(state, q, a, why);
    const fs = flightState(q.machines);
    q.wear = fs;
    q.count = fs.count;
    if (q.count <= 0) heavyGone(state, q, why);
    return;
  }
  losePlane(state, q, a, why);
  const fs = flightState(q.machines);
  q.wear = fs;
  q.count = fs.count;
  if (q.torp) q.torp = Math.min(q.torp, fs.count);
  if (q.bomb) q.bomb = Math.min(q.bomb, fs.count);
  if (!fs.count) { q.hp = 0; killFlight(state, q, why); }
}

/** Everything in the air that a body can fly into: the flights and the heavies. */
function airborne(state) {
  const out = [];
  for (const p of state.planes) if (!p.dead) out.push({ q: p, heavy: false });
  for (const b of state.bombers || []) if (b.alive) out.push({ q: b, heavy: true });
  return out;
}

/**
 * Aeroplanes flown into each other.
 *
 * Two of the other side's machines that pass close enough to touch, touch: a
 * player pressing his attack on a bomber until the last instant, or putting
 * his aeroplane into somebody else's on purpose. Both go, and both fall.
 *
 * Not her own side's. A formation is flown on a leader, a few metres apart,
 * and the pilots flying it are the ones keeping it from happening; it is not
 * a thing that happens to a squadron in the ordinary way of flying.
 */
function stepMidAir(state) {
  const air = airborne(state);
  for (let i = 0; i < air.length; i++) {
    const A = air[i];
    for (let j = i + 1; j < air.length; j++) {
      const B = air[j];
      if (A.q.team === B.q.team) continue;
      if (A.q.dead || B.q.dead || A.q.alive === false || B.q.alive === false) continue;
      // Not near enough for any of either to reach the other, this tick.
      const reach = 260 + (A.heavy || B.heavy ? 200 : 0);
      if (Math.abs((A.q.y ?? 220) - (B.q.y ?? 220)) > reach) continue;
      if (dist2(A.q.x, A.q.z, B.q.x, B.q.z) > reach * reach) continue;
      // Somebody has to be flying one of them. Two the simulation is flying
      // are flown by pilots who can see each other: they meet on passage a
      // mile apart, and in a fight the one going in head on breaks away before
      // he arrives -- which the simulation's pilots, who fly straight at
      // whatever they are after, would otherwise never do.
      if (!A.q.flown && !B.q.flown) continue;
      const rad = A.heavy || B.heavy ? TOUCH_HEAVY : TOUCH;
      let hit = null;
      for (const m of flyingMachines(A.q, A.heavy)) {
        for (const n of flyingMachines(B.q, B.heavy)) {
          if (passNear(m, n, rad)) { hit = [m, n]; break; }
        }
        if (hit) break;
      }
      if (!hit) continue;
      const [m, n] = hit;
      state.events.push({
        e: 'midAir', a: A.q.id, b: B.q.id, team: A.q.team,
        x: r((m.x + n.x) / 2), y: r((m.y + n.y) / 2), z: r((m.z + n.z) / 2),
        heavy: A.heavy || B.heavy ? 1 : 0, tk: state.tick,
      });
      loseMachine(state, A.q, m.a, A.heavy, 'collided');
      loseMachine(state, B.q, n.a, B.heavy, 'collided');
    }
  }
  // Where everybody was, for the next tick's lines.
  for (const { q } of air) {
    q.px = q.x; q.py = q.y ?? 220; q.pz = q.z; q.ph = q.heading;
  }
}

/** Wreckage falling out of the formation it came from does not hit that formation. */
const OWN_CLEAR = 2.5;

/**
 * The wreckage, falling.
 *
 * What is left of an aeroplane has a great deal of drag and no lift, so she
 * loses her way and keeps her fall -- the same two lines the screen flies her
 * down on, so that the one falling there is the one falling here. On the way
 * down she can come down on a ship or through another formation, and either
 * is hit by her.
 */
function stepFallers(state, dt) {
  const list = state.fallers;
  if (!list || !list.length) return;
  const out = [];
  const drag = Math.pow(0.72, dt);
  const air = airborne(state);
  for (let fi = 0; fi < list.length; fi++) {
    const f = list[fi];
    const x0 = f.x, y0 = f.y, z0 = f.z;
    f.vx *= drag;
    f.vz *= drag;
    f.vy = f.vy * drag - 9.81 * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.z += f.vz * dt;
    f.age += dt;
    if (fallInto(state, f, x0, y0, z0, air)) continue;
    if (f.age > 300) continue;
    out.push(f);
  }
  state.fallers = out;
}

/** Whatever a falling wreck has come down on this tick, and what it did. */
function fallInto(state, f, x0, y0, z0, air) {
  // A ship.
  for (const s of state.ships) {
    if (!s.alive || !mayHurt(state, f.team, s)) continue;
    const cls = getClass(s.classId);
    if (dist2(f.x, f.z, s.x, s.z) > (cls.hull.length * 0.6 + 30) ** 2) continue;
    for (let i = 1; i <= 4; i++) {
      const k = i / 4;
      const q = { x: lerp(x0, f.x, k), y: lerp(y0, f.y, k), z: lerp(z0, f.z, k) };
      if (!planeInShip(q, s, cls)) continue;
      f.x = q.x; f.y = q.y; f.z = q.z;
      wreckIntoShip(state, f, s, cls);
      return true;
    }
  }
  // Another aeroplane: anybody's, because nobody is flying this one.
  const rad = f.heavy ? TOUCH_HEAVY : TOUCH + 2;
  for (const { q, heavy } of air) {
    if (q.dead || q.alive === false) continue;
    if (q.id === f.from && f.age < OWN_CLEAR) continue;
    if (Math.abs((q.y ?? 220) - f.y) > 260) continue;
    if (dist2(q.x, q.z, f.x, f.z) > 260 * 260) continue;
    for (const m of flyingMachines(q, heavy)) {
      if (!passNear({ x0, y0, z0, x: f.x, y: f.y, z: f.z }, m,
        rad + (heavy ? TOUCH_HEAVY - TOUCH : 0))) continue;
      state.events.push({
        e: 'wreckHit', f: f.id, i: f.from, team: f.team, air: q.id, heavy: f.heavy ? 1 : 0,
        x: r(m.x), y: r(m.y), z: r(m.z), tk: state.tick,
      });
      loseMachine(state, q, m.a, heavy, 'collided');
      return true;
    }
  }
  // The ground, or the sea.
  const g = f.y <= landCeiling(state.world) ? groundHeight(state.world, f.x, f.z) : 0;
  if (f.y <= Math.max(0, g)) {
    if (g > 0.5) landStrike(state, f.x, f.z, f.heavy ? 0.4 : 0.2, 'crash');
    state.events.push({
      e: 'wreckIn', f: f.id, i: f.from, team: f.team, heavy: f.heavy ? 1 : 0,
      x: r(f.x), y: r(Math.max(0, g)), z: r(f.z), land: g > 0.5 ? 1 : 0, tk: state.tick,
    });
    return true;
  }
  return false;
}

/**
 * A heavy squadron flown into a ship, or into the ground.
 *
 * Not something the staff ever sends her to do, and four thousand feet up she
 * never will; but she can be flown by hand, and a captain who puts thirty
 * tonnes of bomber into somebody's upperworks gets what that is worth. One
 * machine at a time, the leader first, the same way a flight goes in.
 */
function stepHeavyRam(state, bm) {
  if (!bm.alive) return;
  const live = (bm.machines || []).filter((a) => a.alive && !a.left);
  const lead = live.find((a) => machineSlot(bm, a) === 0) || live[0];
  if (!lead) return;
  for (const s of state.ships) {
    if (!s.alive || !mayHurt(state, bm.team, s)) continue;
    const cls = getClass(s.classId);
    if (!planeInShip(bm, s, cls)) continue;
    const L = heavyLoad(bm);
    const sp = Math.max(40, bm.speed || 80);
    wreckIntoShip(state, {
      id: 0, from: bm.id, team: bm.team, owner: 0, heavy: true,
      x: bm.x, y: bm.y, z: bm.z,
      vx: Math.sin(bm.heading) * sp, vy: 0, vz: Math.cos(bm.heading) * sp,
      mass: HEAVY_RAM, load: bm.loads > 0 ? L.bombDamage * 2.5 : 0,
    }, s, cls);
    loseMachine(state, bm, lead, true, 'rammed');
    return;
  }
  const g = bm.y <= landCeiling(state.world) ? groundHeight(state.world, bm.x, bm.z) : 0;
  if (bm.y <= Math.max(0, g) + 4) {
    if (g > 0.5) landStrike(state, bm.x, bm.z, 0.5, 'crash');
    state.events.push({
      e: 'planeCrash', i: bm.id, team: bm.team, heavy: 1,
      x: r(bm.x), z: r(bm.z), y: r(Math.max(0, g)), tk: state.tick,
    });
    loseMachine(state, bm, lead, true, 'crashed');
  }
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

/**
 * Does this ship's air group go out for good?
 *
 * A float plane off a catapult, or a seaplane put over the side on a derrick,
 * has no deck to come home to. In this battle there is no stopping to hoist
 * her back aboard either -- a cruiser in action does not heave to for a crane
 * -- so once she is off she is off, and when her work is done she does the
 * only other thing there is to do with her.
 */
export function oneWay(P) {
  return !!(P && (P.catapult || P.launcher === 'derrick'));
}

/** Put her into a ship: the last thing a pilot does with his aeroplane. */
function goIn(state, p, mark) {
  p.phase = 'ram';
  p.targetId = mark.id;
  // A gun ashore is gone into the same way a ship is: see ramMark.
  p.ramBat = mark.batteryId ? 1 : 0;
  p.targetAir = 0; p.targetHeavy = 0; p.targetBat = 0;
  p.shieldFor = 0;
  p.lead = p.id;
  state.events.push({
    e: 'goingIn', i: p.id, team: p.team, ship: p.ramBat ? 0 : mark.id,
    bat: p.ramBat ? mark.id : 0, x: r(p.x), z: r(p.z),
  });
}

/** What a flight going in is going into: a ship, or a gun ashore. */
function ramMark(state, p) {
  return p.ramBat
    ? (state.batteries || []).find((q) => q.id === p.targetId && q.alive) || null
    : state.ships.find((q) => q.id === p.targetId && q.alive) || null;
}

/**
 * The nearest thing of theirs worth going into: a hull, or a gun position
 * when there is one nearer. A machine that is finished does not choose; it
 * goes into whatever of the enemy's it can reach.
 */
function nearestEnemyMark(state, p, reach = 14000) {
  let best = nearestEnemyShip(state, p, reach);
  let bestD = best ? dist(p.x, p.z, best.x, best.z) : reach;
  for (const b of state.batteries || []) {
    if (!b.alive || b.team === p.team) continue;
    const d = dist(p.x, p.z, b.x, b.z);
    if (d < bestD) { best = b; bestD = d; }
  }
  return best;
}

/**
 * The flight that is soaking up a ship's flak in front of this one, if there
 * is one.
 *
 * A fighter with nothing in the air to fight goes in ahead of the bombers --
 * between them and the ship they are going for -- so the guns that would be
 * laid on the torpedo bombers are laid on her. Any fighter on that business,
 * or already going in, nearer the ship than this flight and near enough to her
 * to be in the same piece of the gunners' sky, is the one taking it.
 */
function screenFor(state, p, s) {
  if (p.role === 'fighter') return null;
  const d = dist(p.x, p.z, s.x, s.z);
  let best = null;
  let bestD = 900;
  for (const q of state.planes) {
    if (q.dead || q === p || q.team !== p.team || q.role !== 'fighter') continue;
    if (!q.shieldFor && q.phase !== 'ram') continue;
    if (dist(q.x, q.z, s.x, s.z) > d - 60) continue;
    const near = dist(q.x, q.z, p.x, p.z);
    if (near < bestD) { best = q; bestD = near; }
  }
  return best;
}

/** How much of a ship's flak a meat shield in front takes off the flight behind. */
const SCREEN_SHARE = 0.55;

/** The nearest enemy hull, for a pilot with one decision left to make. */
function nearestEnemyShip(state, p, reach = 14000) {
  let best = null;
  let bestD = reach;
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
    if (!s.alive || !mayHurt(state, p.team, s)) continue;
    const cls = getClass(s.classId);
    if (!planeInShip(p, s, cls)) continue;
    return ramShip(state, p, s, cls);
  }
  // Into a gun position. Anything low enough to be in the pit and over it has
  // flown into it, on purpose or not.
  for (const bat of state.batteries || []) {
    if (!bat.alive || !mayHurt(state, p.team, bat)) continue;
    const spec = BATTERIES[bat.batteryId];
    const reach = spec.span * 0.6 + 10;
    if ((p.y ?? 220) > bat.y + 10) continue;
    if (dist2(p.x, p.z, bat.x, bat.z) > reach * reach) continue;
    return ramBattery(state, p, bat);
  }
  // Into the ground, or into the sea. A flight flown into a hillside digs a
  // crater in it the same way a bomb does.
  const y = p.y ?? 220;
  const g = y <= landCeiling(state.world) ? groundHeight(state.world, p.x, p.z) : 0;
  if (y <= Math.max(0, g)) {
    if (g > 0.5) landStrike(state, p.x, p.z, (p.dropped ? 0.26 : 0.42), 'crash');
    state.events.push({
      e: 'planeCrash', i: p.id, team: p.team, x: r(p.x), z: r(p.z), y: r(Math.max(0, g)),
      tk: state.tick,
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

/**
 * Whether a fighter is in a fight, and with whom.
 *
 * She goes in when the flight she is after is close enough to fight, and
 * comes out when it is gone or a long way off. In between she looks round
 * every second for whoever matters most -- the man on her tail before the one
 * in front of her -- which is what a pilot in a fight does with his head.
 */
function fightFor(state, p, dt) {
  // Going home she does not go looking for a fight, but she does not fly
  // straight and level with somebody on her tail either: she turns and deals
  // with him, and goes on home when he is gone.
  if (p.phase === 'return') {
    const t = threatOn(state, p, mayHurt);
    if (t) { p.targetAir = t.q.id; p.homeFight = 4; }
    p.homeFight = Math.max(0, (p.homeFight ?? 0) - dt);
    if (p.homeFight <= 0) return null;
  }
  if (p.df) {
    p.df.pick = (p.df.pick ?? 0) - dt;
    if (p.df.pick <= 0) {
      p.df.pick = 0.5;
      const q = pickFoe(state, p, mayHurt);
      if (q) p.targetAir = q.id;
    }
  } else if (p.role === 'fighter' && p.phase !== 'return') {
    // Her eyes, between the looks round she takes for something to go after:
    // anything of theirs that comes within reach of her she turns onto at
    // once, whatever she was doing, rather than holding on to the end of a
    // patrol leg first.
    p.reflex = (p.reflex ?? 0) - dt;
    if (p.reflex <= 0) {
      p.reflex = 0.3;
      const q = pickFoe(state, p, mayHurt);
      if (q && q.id !== p.targetAir) {
        p.targetAir = q.id;
        p.targetHeavy = 0; p.targetId = 0; p.targetBat = 0; p.shieldFor = 0;
      }
    }
  }
  const foe = p.targetAir ? state.planes.find((q) => q.id === p.targetAir && !q.dead) : null;
  // Gone, from a form-up: back to the circle. On passage the hunt finds her
  // the next thing.
  if (!foe) { if (p.phase === 'formup') p.targetAir = 0; return null; }
  const R = Math.hypot(foe.x - p.x, (foe.y ?? 220) - (p.y ?? 220), foe.z - p.z);
  if (!p.df) { p.tx = foe.x; p.tz = foe.z; }
  if (R > (p.df ? DISENGAGE : ENGAGE)) {
    if (p.phase === 'formup' && R > ENGAGE * 1.5) p.targetAir = 0;
    return null;
  }
  if (!p.df) enterDogfight(p, airframeOf(p.type, p.role));
  return foe;
}

/**
 * The man in the back seat.
 *
 * Every carrier aircraft that is not a fighter has a gunner facing aft with a
 * rifle-calibre gun on a ring -- the Suisei's Type 92, the Dauntless's twin
 * thirties, the Tenzan's and the Avenger's -- and he does not wait to be told.
 * Anything of the other side's that comes into his arc within his reach, he
 * swings onto and fires at, whatever his pilot is doing: on passage, in the
 * dive, pulling out, or with a captain flying the aeroplane by hand.
 *
 * His arc is everything abaft the wing and above the tailplane; nothing ahead
 * of her and nothing he would have to shoot through his own tail to reach.
 * What he is worth is a fraction of a fighter's battery, because it is one gun
 * on a moving ring rather than four bore-sighted ones. A fighter already
 * trading fire with this one in a turning fight is answered there -- see the
 * fighter's attack in stepPlanes -- so here he only swings and shoots, and
 * the damage is not counted twice.
 */
const REAR_REACH = 480;
const REAR_BITE = 0.11;     // of FIGHTER_GUNS, per machine with a gunner
const REAR_ROLES = new Set(['dive', 'torpedo', 'scout']);
function stepRearGunners(state, dt) {
  for (const p of state.planes) {
    if (p.dead || !REAR_ROLES.has(p.role) || !(p.count > 0)) continue;
    // Somebody of ours is sitting in his seat and laying the gun himself:
    // see gunRear.
    if (state.t - (p.rearHand ?? -9) < 0.6) continue;
    const py = p.y ?? 220;
    const v = airVelocity(p);
    const sp = Math.hypot(v.x, v.y, v.z) || 1;
    let best = null, bestR = REAR_REACH;
    for (const q of state.planes) {
      if (q.dead || q.team === p.team || !mayHurt(state, p.team, q)) continue;
      const dx = q.x - p.x, dy = (q.y ?? 220) - py, dz = q.z - p.z;
      const R = Math.hypot(dx, dy, dz);
      if (R >= bestR || R < 8) continue;
      // Abaft her wing, or above her: not out ahead, where the pilot's guns
      // are and the gunner's would go through his own airscrew.
      const fore = (dx * v.x + dy * v.y + dz * v.z) / (sp * R);
      if (fore > 0.25) continue;
      // And not down through her own tail.
      if (fore < -0.9 && dy < -R * 0.15) continue;
      best = q; bestR = R;
    }
    if (!best) { p.rear = 0; continue; }
    p.rear = best.id;
    // He fires in bursts, which is what a gunner on a pan of ninety-seven
    // rounds does: a couple of seconds on, a moment to lay off again.
    p.rearT = (p.rearT ?? 0) + dt;
    const on = (p.rearT % 2.6) < 1.7;
    if (!on) continue;
    const already = best.df && best.targetAir === p.id;
    if (!already) {
      // He hits less the further out she is and the faster she is crossing.
      const reach = 1 - bestR / REAR_REACH;
      const bite = (FIGHTER_GUNS * REAR_BITE) * (p.count || 1) * (0.35 + 0.65 * reach) * dt;
      hurtFlight(state, best, bite, 'gunners');
      if (best.hp <= 0 && !best.dead) killFlight(state, best, 'gunners');
    }
    if (state.t - (p.rearAt ?? -9) >= 0.12) {
      p.rearAt = state.t;
      state.events.push({
        e: 'rearGun', i: p.id, t: best.id, team: p.team,
        x: r(best.x), y: r(best.y ?? 220), z: r(best.z),
      });
    }
  }
}

/**
 * The back seat's gun, laid and fired by a player sitting in it.
 *
 * `yaw` is where he is looking off her nose -- pi is dead astern -- and
 * `pitch` how far below the horizon, which is how the client's turret view
 * keeps them. His rounds are real rounds, down the line he is looking along
 * and out at the muzzle velocity on top of her own speed, and they hit what
 * they hit (see stepBullets): a fighter sitting on her tail, the sea, a ship.
 * While he is in the seat the gunner the simulation keeps there stands down.
 */
const REAR_ARC = (115 * Math.PI) / 180;
const REAR_HAND = 0.22;     // of FIGHTER_GUNS a second, per machine
export function gunRear(state, ship, id, yaw, pitch, dt) {
  const p = state.planes.find((q) => q.id === id);
  if (!p || p.dead || !ship || p.team !== ship.team) return false;
  if (!REAR_ROLES.has(p.role) || !(p.count > 0)) return false;
  // Not somebody else's: an aeroplane another captain is flying has his gunner.
  if (p.pilot && p.pilot !== ship.id) return false;
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return false;
  p.rearHand = state.t;
  // He cannot fire forward through his own pilot.
  if (Math.abs(wrapAngle(yaw - Math.PI)) > REAR_ARC) return true;
  p.rearGunAt = (p.rearGunAt ?? 0) + dt;
  if (p.rearGunAt < 1 / BURST_RATE) return true;
  const rounds = Math.min(4, Math.floor(p.rearGunAt * BURST_RATE));
  p.rearGunAt = 0;
  const v = airVelocity(p);
  const air = (FIGHTER_GUNS * REAR_HAND * (p.count || 1)) / BURST_RATE;
  const hurt = (20 * (p.count || 1)) / BURST_RATE;
  const el0 = -clamp(pitch, -1.4, 1.4);
  for (let i = 0; i < rounds; i++) {
    const h = wrapAngle(p.heading + yaw + (state.rng() + state.rng() - 1) * 0.004);
    const el = el0 + (state.rng() + state.rng() - 1) * 0.004;
    const cp = Math.cos(el);
    state.bullets.push({
      id: eid(),
      team: p.team, owner: p.owner, plane: p.id,
      x: p.x, y: (p.y ?? 220) + 0.8, z: p.z,
      vx: Math.sin(h) * cp * BULLET_V + v.x,
      vy: Math.sin(el) * BULLET_V + v.y,
      vz: Math.cos(h) * cp * BULLET_V + v.z,
      life: 0, dmg: air, hurt, cal: 7.7,
    });
  }
  // Everybody else's screen swings her gunner's gun onto the line and draws
  // the tracer down it.
  if (state.t - (p.rearAt ?? -9) >= 0.12) {
    p.rearAt = state.t;
    const h = wrapAngle(p.heading + yaw);
    const cp = Math.cos(el0);
    state.events.push({
      e: 'rearGun', i: p.id, t: 0, team: p.team,
      x: r(p.x + Math.sin(h) * cp * 450), y: r((p.y ?? 220) + Math.sin(el0) * 450),
      z: r(p.z + Math.cos(h) * cp * 450),
    });
  }
  return true;
}

/**
 * A tick of a fighter in a fight: her pilot flies her, and she shoots when
 * her guns are on. Returns true if she has flown into the sea doing it.
 */
function flyFight(state, p, foe, P, dt) {
  const res = stepDogfight(state, p, foe, dt, {
    rng: state.rng,
    // The ground only asked about where it could possibly be under her.
    groundAt: (x, z) => ((p.y ?? 220) < landCeiling(state.world) + 400
      ? groundHeight(state.world, x, z) : 0),
    mayHurt,
    wear: p.wear,
  });
  const pl = p.df.pilot;
  p.x = pl.x; p.y = pl.y; p.z = pl.z;
  if (res.crashed) {
    killFlight(state, p, 'crashed');
    return true;
  }
  p.heading = pl.heading;
  p.pitch = pl.pitch;
  p.bank = pl.bank;
  p.roll = pl.roll;
  // Her speed across the ground and up or down, which is what the cruise and
  // the client both read.
  p.speed = pl.v * Math.cos(pl.pitch);
  p.vy = pl.v * Math.sin(pl.pitch);
  p.turn = (9.80665 * pl.g * Math.sin(pl.bank)) / Math.max(18, pl.v);
  // Her guns are along her nose, not her flight path.
  p.gunPitch = pl.attitude;
  if (res.fire) {
    // A strike aircraft's forward guns are a pair, not a fighter's battery.
    burst(state, p, P, dt, p.role === 'fighter' ? 1 : 0.4);
    gunsSeen(state, p, foe.x, foe.z, true);
  }
  return false;
}

/** How much of the flak laid on her a flight jinking hard gets out from under. */
const JINK_FLAK = 0.2;

/**
 * Her jinking, off the autopilot's line: how far to swing her heading off it
 * and how far to put her up or down off the height she wants.
 *
 * Nobody flies straight and level through flak or with a fighter behind him.
 * She weaves -- a few seconds one way, a few the other, up a little and down
 * a little -- so the gunners laying off for where she will be are laying off
 * for somewhere she is not going. It eases in when the shooting starts and
 * out when it stops, so it reads as a pilot and not as a switch, and it fades
 * out close to whatever she is going for: the last of a run onto a ship is
 * flown straight, because that is the part the aiming is done on.
 *
 * Not in company, where she is keeping station on her leader; not in a dive
 * bomber's dive, which is one straight line; and not on a torpedo run, which
 * has to be flown steady at the end or the fish goes wild.
 */
function jinkFor(state, p, station, gx, gz, dt) {
  const hot = state.t - (p.flakAt ?? -99) < 2.5 || state.t - (p.threatAt ?? -99) < 2.5;
  let may = hot && !station && p.phase !== 'formup' && !p.dv;
  if (may && p.torp > 0 && p.targetId) {
    const s = state.ships.find((q) => q.id === p.targetId && q.alive);
    if (s && dist(p.x, p.z, s.x, s.z) < 2600) may = false;
  }
  const want = may ? 1 : 0;
  p.jinkAmp = (p.jinkAmp ?? 0) + clamp(want - (p.jinkAmp ?? 0), -0.6 * dt, 0.8 * dt);
  if (p.jinkAmp <= 0.001) { p.jinkAmp = 0; return { heading: 0, height: 0 }; }
  // Faded out over the last of the approach to whatever she is steering for.
  const d = dist(p.x, p.z, gx, gz);
  const near = clamp((d - 350) / 1050, 0, 1);
  const k = p.jinkAmp * near * near * (3 - 2 * near);
  // Her own rhythm, so a strike does not weave in step.
  const t = p.life + (p.id || 0) * 1.73;
  const fast = p.role === 'fighter' ? 1.1 : 0.8;
  return {
    heading: k * (0.42 * Math.sin(t * fast) + 0.14 * Math.sin(t * fast * 2.7 + 0.9)),
    height: k * (p.role === 'torpedo' ? 12 : 45) * Math.sin(t * fast * 0.83 + 2.2),
  };
}

/** How far ahead she looks for one of her own side she is closing on, in seconds. */
const AVOID_LOOK = 6;
/** And how wide of him she means to pass, in metres. */
const AVOID_SEP = 45;

/**
 * Her lookout for her own side: how far to swing her heading and her height
 * off the autopilot's line to pass clear of a friendly she is closing on.
 *
 * Every machine of her side in the sky is flown by somebody watching for the
 * others, and two of them on lines that meet do not meet: each sees the other
 * coming, and each gives way -- away from him across the sky, and up or down
 * whichever way he is not. Worked on where the two of them will be at their
 * closest over the next few seconds rather than where they are now, so she
 * starts giving way while there is room to do it in a bank and not a snap.
 *
 * Both of them run this, and each turns away from the other, so they open on
 * each other rather than both dodging the same way. A machine dead ahead of
 * her, closing head on, is passed on the right; and if they are at one height
 * the lower id climbs and the other goes under.
 *
 * Her station on a leader is wider than this, so a formation keeping station
 * is left alone; it is a flight joining up too fast, two strikes crossing, a
 * fighter coming back through her own side, that it is for.
 */
function avoidFor(state, p) {
  const { x: vx, y: vy, z: vz } = airVelocity(p);
  const py = p.y ?? 220;
  let heading = 0, height = 0, worst = 0;
  for (const q of state.planes) {
    if (q === p || q.dead || q.team !== p.team) continue;
    const dx = q.x - p.x, dz = q.z - p.z, dy = (q.y ?? 220) - py;
    if (Math.abs(dy) > 160 || dx * dx + dz * dz > 700 * 700) continue;
    const w = airVelocity(q);
    const wx = w.x - vx, wy = w.y - vy, wz = w.z - vz;
    const ww = wx * wx + wy * wy + wz * wz;
    const t = ww > 1e-6 ? clamp(-(dx * wx + dy * wy + dz * wz) / ww, 0, AVOID_LOOK) : 0;
    const cx = dx + wx * t, cy = dy + wy * t, cz = dz + wz * t;
    const miss = Math.hypot(cx, cy, cz);
    if (miss >= AVOID_SEP) continue;
    // Harder the nearer the miss and the sooner it comes -- and firmly from
    // the start, because a pilot who sees he is going to hit somebody does
    // not ease off the line a degree at a time.
    const u = Math.sqrt(1 - miss / AVOID_SEP) * (1 - 0.5 * (t / AVOID_LOOK));
    if (u <= worst) continue;
    worst = u;
    // Which side of her nose he will be on, and away from it.
    const off = Math.hypot(cx, cz) > 2 ? angleDelta(p.heading, Math.atan2(cx, cz)) : 0;
    const side = Math.abs(off) > 0.06 ? -Math.sign(off) : 1;
    heading = side * u * 1.2;
    const up = Math.abs(cy) > 3 ? -Math.sign(cy) : (p.id < q.id ? 1 : -1);
    height = up * u * 60;
  }
  return { heading, height, urgent: worst };
}

/** The nearest two machines of one side are ever let come, centre to centre. */
const SEP_MIN = 2 * TOUCH + 2;

/**
 * Her own side's aeroplanes are solid to her.
 *
 * Whatever the lookout above failed to give way for -- a dogfight with three of
 * her own side on one enemy, a pilot flying his own machine through the middle
 * of a strike -- two machines of one side are not let pass through each other.
 * Where they have come closer than two half-spans they are pushed apart along
 * the line between them, each half the way, so they slide off one another
 * rather than overlapping. One under somebody's hands is his to place, and the
 * other takes all of it; two flown by hand are both somebody else's to place.
 * A heavy squadron does not give way to a single-engined machine: she does.
 */
function stepAirSpacing(state) {
  const live = state.planes.filter((p) => !p.dead);
  const push = (p, nx, ny, nz, k) => {
    p.x += nx * k; p.z += nz * k;
    p.y = Math.max(14, (p.y ?? 220) + ny * k);
  };
  for (let i = 0; i < live.length; i++) {
    const A = live[i];
    for (let j = i + 1; j < live.length; j++) {
      const B = live[j];
      if (A.team !== B.team || (A.flown && B.flown)) continue;
      let dx = B.x - A.x, dy = (B.y ?? 220) - (A.y ?? 220), dz = B.z - A.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= SEP_MIN * SEP_MIN) continue;
      let d = Math.sqrt(d2);
      // Exactly on top of each other: apart sideways off her own heading.
      if (d < 1e-3) { dx = Math.cos(A.heading); dy = 0; dz = -Math.sin(A.heading); d = 1; }
      const nx = dx / d, ny = dy / d, nz = dz / d;
      const gap = SEP_MIN - Math.min(d, SEP_MIN);
      const a = A.flown ? 0 : B.flown ? 1 : 0.5;
      push(A, nx, ny, nz, -gap * a);
      push(B, nx, ny, nz, gap * (1 - a));
    }
    if (A.flown) continue;
    for (const b of state.bombers || []) {
      if (!b.alive || b.team !== A.team) continue;
      if (Math.abs((b.y ?? 220) - (A.y ?? 220)) > 260 || dist2(A.x, A.z, b.x, b.z) > 260 * 260) continue;
      const near = TOUCH + TOUCH_HEAVY + 2;
      for (const m of flyingMachines(b, true)) {
        const dx = A.x - m.x, dy = (A.y ?? 220) - m.y, dz = A.z - m.z;
        const d = Math.hypot(dx, dy, dz);
        if (d >= near) continue;
        if (d < 1e-3) { push(A, 0, 1, 0, near); continue; }
        push(A, dx / d, dy / d, dz / d, near - d);
      }
    }
  }
}

/** How long she has been on her sortie, not counting the form-up over the ship. */
function aloft(p) {
  return p.life - (p.formT || 0);
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
    // Time spent going round over the ship waiting for the rest of the strike
    // to come off the deck, which is not time on the sortie: a deckload goes
    // off one aeroplane at a time and the first of it is up for minutes
    // before the last, and she was turning for home -- or ditching out of
    // fuel -- before the strike had even set off.
    if (p.phase === 'formup') p.formT = (p.formT || 0) + dt;

    // Anti-aircraft fire from every enemy that can bear chews the squadron
    // down. Only the barrels that can actually train onto her do anything:
    // coming in fine on the bow of a ship whose after battery is masked is a
    // different proposition from crossing her beam.
    for (const s of state.ships) {
      if (!s.alive || s.team === p.team) continue;
      // A boat that is down has her flak under water with everything else, and
      // an aeroplane overhead has nothing whatever to fear from her.
      if (gunsDrowned(s) || s.blown) continue;
      const scls = getClass(s.classId);
      if (!scls.aa) continue;
      const d = dist(p.x, p.z, s.x, s.z);
      if (d >= scls.aa.range) continue;
      const bear = aaBearing(scls, s, p.x, p.z, p.y);
      if (bear.barrels === 0) continue;
      if (!orderGiven(state, s, 'aa', { many: (p.count || 1) > 1 })) continue;
      // A fighter gone in ahead of her takes what was meant for her.
      const screen = screenFor(state, p, s);
      // An aeroplane jinking through it is harder to hit than one flying
      // straight and level: the gunners are laying off for where she would
      // have been.
      const flak = scls.aa.dps * bear.share * dt * aaBite(d, scls.aa.range)
        * (1 - JINK_FLAK * (p.jinkAmp ?? 0));
      p.flakAt = state.t;
      if (screen) {
        hurtFlight(state, screen, flak * SCREEN_SHARE);
        hurtFlight(state, p, flak * (1 - SCREEN_SHARE));
      } else {
        hurtFlight(state, p, flak);
      }
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
        // Within a few degrees of his line, and inside the range of the
        // mounting he is standing at.
        if (mannedLightOn(s, scls, p.x, p.z, p.y)) {
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
    //
    // Whatever she is and whatever she still has on her: a machine going down
    // with her bomb still slung goes in with it, which is worse for the ship.
    if (!p.flown && p.phase !== 'ram' && dyingFlight(p)) {
      const mark = nearestEnemyMark(state, p);
      if (mark) goIn(state, p, mark);
    }
    // A float plane has nowhere to go home to (see oneWay). When her work is
    // done -- her bombs gone, her patrol flown, nothing left to find -- she
    // turns for the nearest enemy hull and goes into it.
    if (!p.flown && p.phase === 'return' && oneWay(P)) {
      const mark = nearestEnemyMark(state, p, Infinity);
      if (mark) goIn(state, p, mark);
      else { p.phase = 'outbound'; p.hunt = 0; }
    }
    // A fighter going in looks up on the way, and if there is anything of
    // theirs in the air she goes after that instead.
    if (p.phase === 'ram' && p.role === 'fighter') {
      p.ramLook = (p.ramLook ?? 0) - dt;
      if (p.ramLook <= 0) { p.ramLook = 0.5; turnOnAir(state, p); }
    }
    if (p.phase === 'ram') {
      const mark = ramMark(state, p);
      // She went down before the aeroplane got there. Nothing else to do with
      // what is left but look for another.
      const next = mark ? null : nearestEnemyMark(state, p, oneWay(P) ? Infinity : 14000);
      if (!mark && next) {
        p.targetId = next.id; p.ramBat = next.batteryId ? 1 : 0; p.tx = next.x; p.tz = next.z;
      } else if (!mark) { p.targetId = 0; p.ramBat = 0; p.phase = oneWay(P) ? 'outbound' : 'return'; } else {
        // Straight at her, and she flies herself: she is not keeping station,
        // not forming up and not going home.
        //
        // Unless she has overshot. A fighter at three hundred knots cannot
        // turn inside a few hundred metres, and one that arrives over the
        // ship too high or off the line will circle her for ever, inside her
        // own turning circle, never pointed at her. So she runs out straight,
        // comes round a couple of kilometres off and makes her run again.
        const dm = dist(p.x, p.z, mark.x, mark.z);
        const offNose = Math.abs(angleDelta(p.heading, headingTo(p.x, p.z, mark.x, mark.z)));
        if (dm < 1000 && offNose > 0.9) p.ramOut = true;
        if (p.ramOut && dm > 2000) p.ramOut = false;
        if (p.ramOut) {
          p.tx = p.x + Math.sin(p.heading) * 800;
          p.tz = p.z + Math.cos(p.heading) * 800;
        } else {
          p.tx = mark.x; p.tz = mark.z;
        }
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
    if (p.phase === 'outbound' && p.hunt <= 0 && !p.df) {
      // Often: a pilot's head is never still, and whatever turns up she wants
      // to be turning onto now rather than in a couple of seconds' time.
      p.hunt = p.role === 'fighter' ? 0.6 : 1;
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
      } else if (want && want.shield) {
        // In front of a strike flight, on the line to the ship it is after.
        p.shieldFor = want.shield.id;
        p.targetId = want.ship.id; p.targetAir = 0; p.targetHeavy = 0; p.targetBat = 0;
      } else if (want && want.ship) {
        p.targetId = want.ship.id; p.targetAir = 0; p.targetHeavy = 0; p.targetBat = 0;
        p.tx = want.ship.x; p.tz = want.ship.z;
      }
      if (!(want && want.shield)) p.shieldFor = 0;
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
        p.shieldFor = 0;
        p.hunt = 0;
      }
      // A meat shield flies a few hundred metres ahead of the flight she is
      // covering, on its line to the ship -- and when that flight is into its
      // run, or has gone, she goes into the ship herself.
      if (mark && p.shieldFor && !p.flown) {
        const cov = state.planes.find((q) => q.id === p.shieldFor && !q.dead);
        const covD = cov ? dist(cov.x, cov.z, mark.x, mark.z) : 0;
        if (!cov || cov.dropped || cov.phase !== 'outbound' && cov.phase !== 'formup'
          || covD < 2400 || dist(p.x, p.z, mark.x, mark.z) < 1500) {
          if (!turnOnAir(state, p)) goIn(state, p, mark);
        } else {
          const ahead = Math.min(SHIELD_AHEAD, covD * 0.5);
          const ux = (mark.x - cov.x) / covD;
          const uz = (mark.z - cov.z) / covD;
          // Already out in front of it, or leading it: keep going in. Steering
          // for a point just ahead of a flight that is keeping station on her
          // is a dog chasing its tail.
          const along = (p.x - cov.x) * ux + (p.z - cov.z) * uz;
          if (cov.lead === p.id || along > ahead * 0.6) {
            p.tx = mark.x; p.tz = mark.z;
          } else {
            p.tx = cov.x + ux * ahead;
            p.tz = cov.z + uz * ahead;
          }
        }
      }
    }

    // Whether anybody is sitting on her tail, which is what starts her
    // jinking (see jinkFor) when she is not in a fight to do anything better
    // about him.
    if (!p.df && !p.flown) {
      p.lookT = (p.lookT ?? 0) - dt;
      if (p.lookT <= 0) {
        p.lookT = 0.4;
        if (threatOn(state, p, mayHurt)) p.threatAt = state.t;
      }
    }

    // Where she goes, unless there is somebody in her. A flight under a pilot
    // is flown by the client that took her and steered by nobody here; if the
    // word from that client stops coming she is picked up again on the next
    // tick and carries on to wherever she was sent.
    if (p.flown && state.t - (p.flownAt ?? 0) > 1.5) p.flown = false;
    // In a fight she is flown by a fighter pilot rather than an autopilot:
    // see dogfight.js.
    //
    // A fighter fights whenever there is somebody to fight, forming up over
    // her own ship included. A strike aircraft fights when she is bounced on
    // the way home, and on the way out only once there is nothing left on the
    // surface for her and she has been sent after aeroplanes instead.
    const fights = p.role === 'fighter'
      ? (p.phase === 'outbound' || p.phase === 'return' || p.phase === 'formup')
      : !p.dv && (p.phase === 'return' || (p.phase === 'outbound' && p.targetAir
        && !p.targetId && !p.targetBat));
    const fight = !p.flown && fights ? fightFor(state, p, dt) : null;
    if (!fight && p.df) leaveDogfight(p);
    if (fight) {
      if (flyFight(state, p, fight, P, dt)) continue;
    } else if (!p.flown) {
      let goalX = p.tx, goalZ = p.tz;
      if (p.phase === 'return' && carrier) { goalX = carrier.x; goalZ = carrier.z; }
      // In company: she flies her station on the leader rather than at the
      // target, and only breaks off when the strike is close enough to attack.
      else if (station) { goalX = station.x; goalZ = station.z; }
      const jink = jinkFor(state, p, station, goalX, goalZ, dt);
      // And clear of her own side: see avoidFor. Giving way comes before
      // weaving -- a pilot dodging the flak does not dodge into his own
      // wingman -- so the weave is taken out while she is giving way.
      const clear = avoidFor(state, p);
      const weave = 1 - Math.min(1, clear.urgent * 2.5);
      jink.heading *= weave;
      jink.height *= weave;
      const want = wrapAngle(headingTo(p.x, p.z, goalX, goalZ) + jink.heading + clear.heading);
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
      // She banks, and the turn falls out of the bank.
      //
      // This used to be a flat rate per role -- a fighter came round at
      // sixteen degrees a second and a torpedo bomber at ten, the same at a
      // hundred knots as at three hundred, the same empty as with a fish slung
      // under her, and the same in thin air at five thousand feet as on the
      // deck. The aeroplane under the player's hands was flown on a wing the
      // whole time; every other aeroplane in the battle was flown on a number
      // somebody had chosen.
      //
      // It is the same wing now. The bank she can hold is what her spar and
      // her wing will give at the speed she is doing, she rolls into it at her
      // own helix rate with her own roll mode damping her, and the rate she
      // comes round at is g tan(phi) over v -- which is the coordinated turn
      // the cockpit flies and the turn the client already draws her banked for.
      const frm = airframeOf(p.type, p.role);
      // The speed her wing is working at, which is not the speed she is
      // crossing the ground at: `p.speed` is over the ground and the vertical
      // is the other side of the triangle. A dive bomber going down at fifty
      // degrees is doing half as much again through the air as across it, and
      // a turn rate goes as one over that -- which is exactly why she cannot
      // be hauled about in a dive and can be at cruise.
      const tas = Math.max(18, Math.hypot(p.speed || frm.vMax * 0.7, p.vy || 0));
      // A shot-about wing will not be hauled round as far.
      const most = sustainBank(frm, tas) * clamp(wear.turn, 0.2, 1);
      // What she asks for is a rate, and the bank is what it takes to get it.
      //
      // This is the right way round and the other way round does not work. A
      // turn rate goes as the tangent of the bank, so a gain written straight
      // into the bank is a gain of about a twelfth in the rate at cruise: a
      // flight a few degrees off her station corrected five times slower than
      // she used to and the whole strike came apart on passage. A pilot does
      // not think in bank angles -- he thinks "come round onto that" and puts
      // on whatever bank it takes, and stops when the wing runs out.
      // Proportional to how far off she is, less a term for how fast she is
      // already coming round. Without that second term she overshoots and
      // hunts: the wing will now give her a good deal more rate than the flat
      // number this was written against ever did, so a gain tuned for the old
      // cap swung the whole strike from one side of its station to the other
      // and strung it out over two miles on passage.
      const err = angleDelta(p.heading, want);
      const wantTurn = err * 1.5 - (p.turn ?? 0) * 0.55;
      const askBank = clamp(Math.atan((wantTurn * tas) / G), -most, most);
      // Rolling in and out of it, the same way the cockpit does: the aileron
      // asks for a rate of roll, the roll mode damps her into it, and the bank
      // is the integral of that. One lag, not two -- rate-limiting the bank and
      // then putting an exponential on top of it is two poles in series behind
      // a proportional controller, which is how you build an oscillator.
      const mostRoll = rollRate(frm, tas);
      const wantRoll = clamp((askBank - (p.bank ?? 0)) * 3, -mostRoll, mostRoll);
      const kr = 1 - Math.exp(-dt / rollTau(frm, tas));
      p.roll = (p.roll ?? 0) + (wantRoll - (p.roll ?? 0)) * kr;
      p.bank = clamp((p.bank ?? 0) + p.roll * dt, -1.5, 1.5);
      p.turn = turnFor(tas, p.bank);
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
      const wantY = Math.max(30, wantedHeight(state, p, carrier, !!station) + jink.height
        + clear.height);
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
      let pull = G * (frame.g ?? 0.34) * dt;
      // A dive bomber holds the line she is diving down rather than easing
      // onto it: a lazy gain leaves her a couple of hundred metres above the
      // profile all the way in, which is a shallow glide and not a dive.
      // Giving way up or down is done on the stick, not by asking for a new
      // height: the height she wants is closed on at a cruise climb, which is
      // a good deal too slow to get over somebody coming the other way.
      let askVy = clamp((wantY - p.y) * (p.role === 'dive' ? 1.4 : p.phase === 'ram' ? 1.0 : 0.22)
        + Math.sign(clear.height) * clear.urgent * 14, -frame.dive, rise);
      // Over the top and down, and out at the bottom: see diveStage.
      const stage = p.role === 'dive' ? diveStage(state, p, dt) : null;
      if (stage) {
        if (stage.vy !== undefined) askVy = stage.vy;
        if (stage.g) pull = G * stage.g * dt;
      }
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

      // Fresh off the deck she has not got her cruise yet, and builds it at
      // what her engine has to spare once the flaps are up.
      if (p.launchV && p.life < 60) speed = Math.min(speed, p.launchV + p.life * CLIMB_OUT_ACCEL);

      // How fast she is crossing the ground. Kept on the flight because the
      // client draws her attitude off it: the angle her nose is at is the
      // angle of her own flight path, which is her rate of climb over this,
      // and there is no other way to know it from outside.
      p.speed = speed;
      p.x += Math.sin(p.heading) * speed * dt;
      p.z += Math.cos(p.heading) * speed * dt;
      buffet(state, p, dt);
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
        // The formation shoots back turret by turret, at whatever is in each
        // turret's arc -- see heavyGunners -- and not only at whoever is
        // attacking her: a fighter flown by hand gets the same answer.
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
          bombBattery(state, p, bat, P);
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

    // A strike aircraft in a fight is flown by her pilot until it is over, and
    // does none of the rest of this until it is.
    if (p.df && p.role !== 'fighter' && p.phase === 'outbound') {
      if (!carrier || aloft(p) > 300) { killFlight(state, p, 'fuel'); continue; }
      out.push(p);
      continue;
    }

    if (p.phase === 'outbound' && p.role === 'fighter') {
      // A fighter's attack: guns, in a turning fight or in a firing pass.
      const foe = p.targetAir ? state.planes.find((q) => q.id === p.targetAir) : null;
      if (p.df && foe && !foe.dead) {
        // In a fight. Her own guns went in flyFight, down her bore and only
        // when they would hit; what is left is his back at her. A bomber's
        // gunners only see her from astern of him, and they are not a
        // fighter's guns.
        if (!gunned(foe)) {
          const R = Math.hypot(foe.x - p.x, (foe.y ?? 220) - (p.y ?? 220), foe.z - p.z);
          const vf = airVelocity(foe);
          const sf = Math.hypot(vf.x, vf.y, vf.z) || 1;
          const astern = ((p.x - foe.x) * vf.x + ((p.y ?? 220) - (foe.y ?? 220)) * vf.y
            + (p.z - foe.z) * vf.z) / (sf * Math.max(1, R));
          if (R < 520 && astern < -0.5) {
            const bite = P.fighterGuns ?? FIGHTER_GUNS;
            hurtFlight(state, p, bite * 0.3 * (foe.count || 1) * dt, 'fighters');
            gunsSeen(state, foe, p.x, p.z, true);
          }
        }
        if (p.dead || p.hp <= 0) { if (!p.dead) killFlight(state, p, 'fighters'); continue; }
        if (foe.hp <= 0 && !foe.dead) killFlight(state, foe, 'fighters');
        out.push(p);
        continue;
      }
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
      // Nothing left in the air to fight: she goes into the ship. A shield
      // decides that for herself above, when the flight she is covering is in.
      const mark = state.ships.find((q) => q.id === p.targetId && q.alive);
      if (mark && !p.shieldFor && dist(p.x, p.z, mark.x, mark.z) < 2600) {
        if (!turnOnAir(state, p)) {
          gunsSeen(state, p, mark.x, mark.z, false);
          goIn(state, p, mark);
        }
      } else if (aloft(p) > (p.orderEscort && strikeMark(state, p)
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
      // A dive bomber lets go at the bottom of her dive, not wherever she
      // happens to be when the ship comes within a quarter of a mile: down
      // the line to her release height, or close over the top of her.
      const RELEASE = p.torp > 0 ? 900 : p.role === 'dive' ? DIVE_AT + 30 : 260;
      const low = p.role === 'dive' && p.dv === 'dive' && best
        && (p.y ?? 0) < (best.y || 0) + dropHeight(p, best) + 20 && bestD < DIVE_AT + 260;
      // And not before she is in her dive. One with the height for one that
      // has not yet rolled in holds on to it -- she is on her way over the top
      // -- and only one too low ever to dive lets go on the level.
      const holding = p.role === 'dive' && (p.dv === 'roll'
        || (p.dv !== 'dive' && (p.y ?? 0) > (best ? best.y || 0 : 0) + releaseFor(0) + 110));
      // In the dive she holds on to it until she is down to her release
      // height, and lets go then -- or over the top of her, whichever is first.
      const go = p.role === 'dive' && p.dv === 'dive' ? (low || bestD < 70) : (bestD < RELEASE || low);
      if (best && !holding && go) {
        deliverOrdnance(state, p, best, P);
        state.events.push({ e: 'airDrop', x: p.x, z: p.z, r: p.role });
        p.dropped = true;
        // And out of it. See diveStage.
        if (p.role === 'dive') { p.dv = 'pull'; p.show = undefined; }
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
      } else if (dist(p.x, p.z, p.tx, p.tz) < 200 || aloft(p) > 180) {
        p.phase = 'return';
      }
    } else if (p.phase === 'return' && carrier && !oneWay(P)
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
    } else if (p.phase === 'ram' ? aloft(p) > 600 : (!carrier || aloft(p) > 300)) {
      // Out of fuel, or her ship is gone from under her. One going in has
      // nowhere to come back to and no reserve to keep for it, so she gets
      // the whole of her tanks, and her own ship sunk is nothing to her.
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
  // An escort makes a strike harder to stop, up to the few fighters that can
  // actually stay with any one bomber; a strike with forty fighters over it is
  // not forty times as hard to shoot down.
  return cls.planes.hp * (f.role === 'fighter' ? 1.35 : 1)
    * (1 + (f.role === 'fighter' ? 0 : Math.min(3, L.escort) * 0.18)) * 2.0;
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
  // How many of her were flying, this one among them.
  const was = p.machines.filter((m) => m.alive && (!m.left || m === a)).length;
  // Somebody flying her is the leader, and stays the leader: the stick is in
  // the aeroplane at the head of the formation, so a hit on her while she has
  // wingmen is taken by one of them instead of the screen.
  if (p.flown && was > 1) keepLeader(p, a);
  a.gone = true;
  a.alive = false;
  // She falls from the slot she was flying in, and the snapshot stops drawing
  // that slot (see slotMask) -- so what goes down is the aeroplane that was
  // there, and the formation flies on with a gap in it rather than closing up
  // over her: closed up, the slot she fell out of was still drawn full and the
  // last one emptied instead, which was one aeroplane on the screen twice.
  const slot = machineSlot(p, a);
  const at = slotAt(slot, p.heading || 0);
  const x = p.x + at.x, y = (p.y ?? 220) + at.y, z = p.z + at.z;
  const ev = {
    e: 'planeDown', i: p.id, team: p.team, x: r(x), z: r(z),
    slot, h: r(p.heading), y: r(y), why, last: was <= 1 ? 1 : 0, tk: state.tick,
  };
  // What is left of her, falling. Not when she has gone into something
  // already -- that is the end of her -- and not when she has blown up in the
  // air, which leaves nothing big enough to matter.
  if (why !== 'rammed' && why !== 'crashed') {
    if (why === 'shot' && state.rng() < 0.4) ev.burst = 1;
    else {
      const f = fallFrom(state, p, x, y, z, why);
      ev.f = f.id;
      ev.vx = r(f.vx); ev.vy = r(f.vy); ev.vz = r(f.vz);
    }
  }
  state.events.push(ev);
}

/** Which station in the formation a machine flies. Hers for the whole sortie. */
export function machineSlot(p, a) {
  return a.slot ?? Math.max(0, p.machines.indexOf(a));
}

/** The stations still flying, as a bit each. */
export function slotMask(p) {
  let m = 0;
  for (const a of p.machines || []) if (a.alive && !a.left) m |= 1 << (machineSlot(p, a) % 31);
  return m;
}

/**
 * The leader's station handed to whoever is about to be lost in her place --
 * the last of the formation -- so the aeroplane a player is flying is never
 * the one that leaves it.
 */
function keepLeader(p, a) {
  if (machineSlot(p, a) !== 0) return;
  const others = p.machines.filter((m) => m !== a && m.alive && !m.left && !m.gone);
  if (!others.length) return;
  const other = others.reduce((x, y) => (machineSlot(p, y) > machineSlot(p, x) ? y : x));
  const was = machineSlot(p, other);
  other.slot = 0;
  a.slot = was;
}

/** Going down quietly rather than out of control: no engine, but a wing. */
const LIMP = new Set(['crippled', 'dry', 'fuel', 'nodeck']);

/**
 * One machine of a flight, falling: her own speed on her and nothing holding
 * her up, from where she was flying.
 */
function fallFrom(state, p, x, y, z, why) {
  const limp = LIMP.has(why);
  const sp = limp ? 44 + state.rng() * 14 : 60 + state.rng() * 26;
  const h = p.heading || 0;
  const owner = state.ships.find((q) => q.id === p.owner) || null;
  const P = owner ? shipClass(owner).planes : null;
  const armed = !p.dropped && ((p.bomb ?? 0) > 0 || (p.torp ?? 0) > 0);
  return addFaller(state, {
    team: p.team, from: p.id, owner: p.owner, role: p.role, heavy: false,
    x, y, z,
    vx: Math.sin(h) * sp, vz: Math.cos(h) * sp,
    vy: limp ? -3 - state.rng() * 3 : -5 - state.rng() * 9,
    mass: RAM_MASS[p.role] || RAM_MASS.scout,
    // A machine that still had her weapon on goes in with it.
    load: armed && P ? ((p.torp ?? 0) > 0 ? (P.torpDamage ?? 9000) * 0.5
      : (P.bombDamage ?? 4000) * 0.6) : 0,
  });
}

function addFaller(state, f) {
  f.id = eid();
  f.age = 0;
  (state.fallers ||= []).push(f);
  return f;
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
  // Whatever of her is still in the air comes down now, each machine from her
  // own slot -- reported one by one, so that what falls is what was flying
  // and nothing is made up on the screen to fill a count.
  const live = (p.machines || []).filter((a) => a.alive && !a.gone);
  for (let i = live.length - 1; i >= 0; i--) losePlane(state, p, live[i], why);
  if (!(p.machines && p.machines.length) && why !== 'rammed' && why !== 'crashed') {
    const n = Math.min(3, Math.max(1, p.count || 1));
    for (let i = n - 1; i >= 0; i--) {
      const at = slotAt(i, p.heading || 0);
      const x = p.x + at.x, y = (p.y ?? 220) + at.y, z = p.z + at.z;
      const f = fallFrom(state, p, x, y, z, why);
      state.events.push({
        e: 'planeDown', i: p.id, team: p.team, x: r(x), y: r(y), z: r(z), slot: i,
        h: r(p.heading), why, last: i === 0 ? 1 : 0, tk: state.tick,
        f: f.id, vx: r(f.vx), vy: r(f.vy), vz: r(f.vz),
      });
    }
  }
  p.dead = true;
  p.hp = -1;
  state.events.push({
    e: 'planesLost', i: p.id, x: p.x, y: r(p.y ?? 220), z: p.z, team: p.team, why, tk: state.tick,
  });
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
      // A float plane does not come back (see oneWay): her place on the
      // catapult is empty for the rest of the action.
      if (oneWay(cls.planes)) { sq.state = 'spent'; continue; }
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
 * The height a heavy squadron works at: a thousand metres, for everybody.
 *
 * This is a long way below where they really bombed from -- fifteen to
 * twenty-five thousand feet, and chosen for the one reason that mattered at
 * the time, to be above the flak. A thousand metres is well under it.
 *
 * Which is the point. At this height everything can reach her: a ship's whole
 * close-range battery bears, not just the heavy mountings, and a fleet's
 * fighters are at her altitude within a minute of taking off instead of
 * spending the whole sortie climbing. She is in the battle rather than over
 * it, the man at the bomb bay can see the ships under her, and her bombing is
 * better for being lower -- the aimer's error grows with height.
 *
 * She pays for all of it in the one currency a bomber has, which is losses.
 */
export function bombAlt() {
  return 1000;
}

/** The same height as a number, for the yard scene and anything measuring. */
export const BOMB_ALT = 1000;

/** What one machine of a heavy formation can absorb before she goes down. */
const HEAVY_HP = 420;

/**
 * Her gun positions, and how hard they are to put out of action.
 *
 * All her positions together are worth this share of the formation's hit
 * points, and a hit on her has POST_HIT of a chance of going into one of them
 * as well as into the airframe -- so a vic that has been shot about to about
 * two-thirds of itself has started losing turrets, and one that is very nearly
 * down is very nearly defenceless.
 */
const POST_SHARE = 0.12;
const POST_HIT = 0.35;
/** How near a turret a round has to go in to hit it, along her and up her. */
const POST_TOUCH = 3.2;
/** And what a round that hits one does to it, against its share of her. */
const POST_AIMED = 1.5;
/** How far her gunners reach, along the line of sight. */
const HEAVY_GUN_REACH = 520;
/** What one gun of hers is worth, a second, at close range. */
const HEAVY_GUN_BITE = 5;

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
    // Her gun positions, each fought on its own and each able to be shot out.
    // One position stands for that turret across the whole vic. See
    // heavyGunners.
    posts: (b.posts || []).map((name) => ({
      name, hp: (n * HEAVY_HP * POST_SHARE) / Math.max(1, b.posts.length),
      max: (n * HEAVY_HP * POST_SHARE) / Math.max(1, b.posts.length), on: 0, t: 0,
    })),
    wear: { speed: 1, turn: 1, aim: 1, count: n },
    // Set while somebody is flying her by hand; see flyBomber.
    flown: false, flownAt: 0, pilot: 0,
    phase: 'inbound',
    // How far over she is, and how fast she is coming round for it. A heavy
    // banks a long way less than a fighter and comes round a long way slower
    // for it; see stepBombers, where both fall out of her own wing.
    bank: 0, roll: 0, turn: 0,
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
  // matters and the one a ship's captain earns by keeping his speed on. Down at
  // a thousand metres the aimer can see what he is aiming at, so both are
  // small: a stick laid on a ship lying still mostly falls on her.
  const sd = 22 + bm.y * 0.012 + moving * 7;
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
  const sx = gauss(state.rng) * 12;
  const sz = gauss(state.rng) * 12;
  // It leaves from the formation, not from a point thirty metres off to one
  // side of it: the aimer's error and the scatter of the stick are what the
  // bomb does on the way down, so they go into how it leaves rather than
  // where. Spread over the fall they are the same miss at the bottom.
  const fall = Math.sqrt(2 * Math.max(50, bm.y) / 9.81);
  fireShell(state, {
    id: eid(), owner: 0, bomber: bm.id, team: bm.team,
    x: bm.x, y: bm.y, z: bm.z,
    vx: sn * bm.speed + (e.x + sx) / fall, vy: 0, vz: cs * bm.speed + (e.z + sz) / fall,
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
    if (!s.alive || s.team === bm.team || s.blown) continue;
    const cls = getClass(s.classId);
    if (!cls.aa) continue;
    const d = dist(bm.x, bm.z, s.x, s.z);
    // Slant range, and only the long-range mountings reach this high.
    const slant = Math.hypot(d, bm.y);
    if (slant > cls.aa.range) continue;
    // And how much of her battery that actually is.
    const share = highBattery(cls, slant);
    if (share <= 0) continue;
    if (!orderGiven(state, s, 'aa', { many: true })) continue;
    // What is left of her fire once the guns that cannot reach are taken out
    // of it, and then a good deal off that again: this is fire against a
    // formation holding course through it, which historically took thousands
    // of rounds for every aeroplane it brought down.
    //
    // The constant is what makes a thousand metres a place a squadron can
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
      if (mannedLightOn(s, cls, bm.x, bm.z, bm.y)) {
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
    if (end) loseHeavy(state, bm, a, end);
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
    loseHeavy(state, bm, bad, 'crippled');
  }
  const fs = flightState(bm.machines);
  bm.wear = fs;
  bm.count = fs.count;
  let hp = 0;
  for (const a of bm.machines) if (a.alive && !a.left) hp += airframeHp(a) * HEAVY_HP;
  bm.hp = hp;
  if (bm.count <= 0) heavyGone(state, bm);
}

/** The last of a heavy squadron, gone. */
function heavyGone(state, bm, why = 'shot') {
  if (!bm.alive) return;
  // Anything of her still up comes down with her rather than vanishing.
  const live = (bm.machines || []).filter((a) => a.alive && !a.gone);
  for (let i = live.length - 1; i >= 0; i--) loseHeavy(state, bm, live[i], why);
  bm.alive = false;
  bm.hp = 0;
  bm.count = 0;
  state.events.push({ e: 'bomberOut', i: bm.id, tm: bm.team, x: r(bm.x), z: r(bm.z), tk: state.tick });
}

/**
 * One heavy out of a formation, and what is left of her falling.
 *
 * The same bargain a carrier flight's machine gets (see losePlane): she falls
 * from her own station in the vic, which the screen stops drawing, and she
 * falls as a body -- thirty tonnes of her, and whatever she
 * had not yet dropped still in the bay.
 */
function loseHeavy(state, bm, a, why) {
  if (a.gone) return;
  const was = bm.machines.filter((m) => m.alive && (!m.left || m === a)).length;
  if (bm.flown && was > 1) keepLeader(bm, a);
  a.gone = true;
  a.alive = false;
  const slot = machineSlot(bm, a);
  const at = vicAt(slot, bm.heading || 0);
  const x = bm.x + at.x, y = bm.y + at.y, z = bm.z + at.z;
  const ev = {
    e: 'bomberDown', i: bm.id, tm: bm.team, x: r(x), y: r(y), z: r(z), h: r(bm.heading),
    slot, why, last: was <= 1 ? 1 : 0, tk: state.tick,
  };
  if (why !== 'rammed' && why !== 'crashed') {
    const limp = LIMP.has(why);
    const sp = Math.max(40, (bm.speed || 80) * (limp ? 0.7 : 0.85));
    const L = heavyLoad(bm);
    const f = addFaller(state, {
      team: bm.team, from: bm.id, owner: 0, role: 'heavy', heavy: true, type: bm.bomberId,
      x, y, z,
      vx: Math.sin(bm.heading) * sp, vz: Math.cos(bm.heading) * sp,
      vy: limp ? -4 - state.rng() * 3 : -6 - state.rng() * 8,
      mass: HEAVY_RAM,
      // Her share of a stick she never got to lay.
      load: bm.loads > 0 && !(bm.stick > 0 && bm.stick < L.n) ? L.bombDamage * 2.5 : 0,
    });
    ev.f = f.id;
    ev.vx = r(f.vx); ev.vy = r(f.vy); ev.vz = r(f.vz);
  }
  state.events.push(ev);
}

/** A four-engined bomber, as a weight arriving: several carrier aircraft's worth. */
const HEAVY_RAM = 16000;

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
export function gunTurret(state, ship, id, yaw, arc, dt, post = '') {
  const bm = (state.bombers || []).find((q) => q.id === id && q.alive);
  if (!bm || !ship || bm.team !== ship.team) return false;
  // A position that has been shot out has nothing left in it to fire.
  const g = post ? (bm.posts || []).find((q) => q.name === post) : null;
  if (g && g.hp <= 0) return false;
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
export function hurtBomber(state, bm, damage, why = 'flak', at = null) {
  if (!bm.alive) return;
  // Some of what hits her hits a gun position: the turret is shot through,
  // the gunner is hit, or the hydraulics that train it are cut. One that has
  // gone stays gone.
  //
  // A round whose way in is known (`at`, off the middle of the machine it
  // hit) is put into whichever turret it went in beside, if it went in beside
  // one -- so a fighter that holds his sight on her tail turret shoots her tail
  // turret out. Flak, and anything else that arrives everywhere at once, takes
  // its chance at one of them.
  const posts = (bm.posts || []).filter((g) => g.hp > 0);
  let g = null;
  let bite = damage;
  if (posts.length && damage > 0 && at) {
    const b = BOMBERS[bm.bomberId] || BOMBERS.lancaster;
    const fore = at.dx * Math.sin(bm.heading) + at.dz * Math.cos(bm.heading);
    let best = POST_TOUCH;
    for (const q of posts) {
      const p = (b.postAt || [])[bm.posts.indexOf(q)];
      if (!p) continue;
      const d = Math.hypot(at.dy - p[0], fore - p[1]);
      if (d < best) { best = d; g = q; }
    }
    bite = damage * POST_AIMED;
  } else if (posts.length && damage > 0 && state.rng() < POST_HIT) {
    g = posts[Math.min(posts.length - 1, Math.floor(state.rng() * posts.length))];
  }
  if (g) {
    g.hp -= bite;
    if (g.hp <= 0) {
      g.hp = 0;
      g.on = 0;
      state.events.push({ e: 'turretOut', i: bm.id, k: bm.posts.indexOf(g), tm: bm.team, why });
    }
  }
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
    if (hit.down) { loseHeavy(state, bm, a, why === 'flak' ? 'shot' : why); bm.aimed = null; }
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
    // One of them has gone. A formation with machines has said so already, one
    // at a time, in loseHeavy; one without is reported here.
    if (!(bm.machines || []).length) {
      for (let i = left; i < bm.count; i++) {
        state.events.push({
          e: 'bomberDown', i: bm.id, tm: bm.team, x: bm.x, y: bm.y, z: bm.z, why, tk: state.tick,
        });
      }
    }
    bm.count = left;
  }
  if (bm.count <= 0 || bm.hp <= 0) heavyGone(state, bm);
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

/**
 * Whether a gun position bears on something, given where it is off her nose
 * (`fore`, the cosine off her heading) and how far above or below her it is
 * (`up`, the sine of its elevation). A nose or a chin gun looks ahead, a tail
 * gun astern, a dorsal turret over her and a ball or a gondola under her.
 */
function postBears(name, fore, up) {
  switch (name) {
    case 'nose': case 'chin': return fore > -0.15 && (name !== 'chin' || up < 0.5);
    case 'tail': return fore < 0.15;
    case 'dorsal': return up > -0.2;
    case 'ball': case 'gondola': return up < 0.2;
    default: return true;
  }
}

/**
 * Her gunners, fighting the formation.
 *
 * Every gun position she still has picks the nearest enemy aeroplane in its
 * arc and in reach and fires at it in bursts -- an aeroplane flown by hand the
 * same as one flown by the simulation. What each is worth is her guns shared
 * over her positions, times the machines left in the vic; a position that has
 * been shot out fires no more. A gunner who has gone to a turret himself
 * fights it as well, on top of this: see gunTurret.
 */
function heavyGunners(state, bm, dt) {
  const posts = bm.posts || [];
  if (!posts.length || !(bm.count > 0)) return;
  const b = BOMBERS[bm.bomberId] || BOMBERS.lancaster;
  const per = (b.guns || 8) / posts.length;
  const fx = Math.sin(bm.heading), fz = Math.cos(bm.heading);
  for (let k = 0; k < posts.length; k++) {
    const g = posts[k];
    if (g.hp <= 0) { g.on = 0; continue; }
    let best = null, bestR = HEAVY_GUN_REACH;
    for (const q of state.planes) {
      if (q.dead || q.team === bm.team || !mayHurt(state, bm.team, q)) continue;
      const dx = q.x - bm.x, dy = (q.y ?? 220) - bm.y, dz = q.z - bm.z;
      const R = Math.hypot(dx, dy, dz);
      if (R >= bestR || R < 5) continue;
      if (!postBears(g.name, (dx * fx + dz * fz) / R, dy / R)) continue;
      best = q; bestR = R;
    }
    g.on = best ? best.id : 0;
    if (!best) continue;
    // In bursts: a couple of seconds on, a moment to lay off again.
    g.t = (g.t || 0) + dt;
    if ((g.t % 2.4) > 1.6) continue;
    const reach = 1 - bestR / HEAVY_GUN_REACH;
    hurtFlight(state, best, per * bm.count * HEAVY_GUN_BITE * (0.4 + 0.6 * reach) * dt, 'gunners');
    if (best.hp <= 0 && !best.dead) killFlight(state, best, 'gunners');
    if (state.t - (g.at ?? -9) >= 0.12) {
      g.at = state.t;
      state.events.push({
        e: 'heavyGun', i: bm.id, k, t: best.id, team: bm.team,
        x: r(best.x), y: r(best.y ?? 220), z: r(best.z),
      });
    }
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
      stepHeavyRam(state, bm);
      if (!bm.alive) continue;
      heavyGunners(state, bm, dt);
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

    // Her turn, flown on her own wing rather than at a number.
    //
    // A thirty-tonne bomber with fourteen thousand pounds in the bay banks a
    // long way less than a fighter does and comes round a long way slower for
    // it, and that falls out of her span, her wing area and the four g her
    // spar was stressed to -- the same two lines the fighters turn on and the
    // same two the cockpit flies. On the run she is not turning at all: a
    // bombing run that jinks is a bombing run wasted.
    const air = HEAVY_AERO[bm.bomberId] || HEAVY_AERO.lancaster;
    const tas = Math.max(40, bm.speed || air.vMax * 0.75);
    const most = bm.phase === 'run' ? 0.03
      : sustainBank(air, tas) * clamp((bm.wear && bm.wear.turn) ?? 1, 0.2, 1);
    const wantTurn = angleDelta(bm.heading, want) * 0.8 - (bm.turn ?? 0) * 0.55;
    const askBank = clamp(Math.atan((wantTurn * tas) / G), -most, most);
    // Rolled the same way a fighter is and the same way the cockpit does: the
    // aileron asks for a rate, the roll mode damps her into it, and the bank is
    // what that integrates to.
    const mostRoll = rollRate(air, tas);
    const wantRoll = clamp((askBank - (bm.bank ?? 0)) * 3, -mostRoll, mostRoll);
    const kr = 1 - Math.exp(-dt / rollTau(air, tas));
    bm.roll = (bm.roll ?? 0) + (wantRoll - (bm.roll ?? 0)) * kr;
    bm.bank = clamp((bm.bank ?? 0) + bm.roll * dt, -0.9, 0.9);
    const rate = turnFor(tas, bm.bank);
    bm.heading = wrapAngle(bm.heading + rate * dt);
    bm.turn = clamp(rate, -1, 1);
    bm.x += Math.sin(bm.heading) * bm.speed * dt;
    bm.z += Math.cos(bm.heading) * bm.speed * dt;
    // And a heavy is in the same gale as everything else.
    buffet(state, bm, dt);

    heavyFlak(state, bm, dt);
    heavyDamage(state, bm, dt);
    stepHeavyRam(state, bm);
    if (!bm.alive) continue;
    heavyGunners(state, bm, dt);

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
export function startFire(state, ship, where = 'works', strength = 0.35) {
  const c = ship.sections[where] || ship.sections.works;
  if (!c || c.lost) return;
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
/**
 * How deep the sea is over a hole in her this instant, in metres (negative:
 * dry). The sea is the one the screen draws -- calm or storm, the waves are
 * always running -- and the hole is where it is on her: in her own frame, its
 * height off her waterline, laid over by her list and trim and her motion in
 * the seaway, and let down by however far she has settled.
 */
export function holeHead(state, ship, h) {
  const W = state.allSea || (state.allSea = (() => {
    const S = seaOf(state.world);
    return waveTerms(S.amp, S.steep, S.short);
  })());
  return seaOver(state, ship, W, h.x, h.y, h.z);
}

export function openHull(state, ship, where, area, side, depth, at = null) {
  const c = ship.sections[where];
  if (!c || area <= 0) return;
  const first = c.holeP + c.holeS < 0.01;
  if (side < 0) c.holeP += area; else c.holeS += area;
  // A hole that is somewhere in particular on her -- a shell's, with the
  // point it went in -- is kept where it is, and the sea is asked about it
  // there every moment: how high the water stands over that point, with her
  // settling, her list, her trim and the waves running along her all in it.
  // So a hole a metre above her waterline takes water whenever a wave or a
  // roll puts the sea over it, and more of it the lower she gets. See
  // holeHead. A hole with no place (a collision's rent, the ground) is the old
  // kind: one depth, below which it floods.
  if (at) {
    const holes = c.holes || (c.holes = []);
    if (holes.length < 16) holes.push({ x: at.x, y: at.y, z: at.z, a: area, a0: area });
    else {
      // Full: the new hole goes into the nearest one, which is where the
      // plating between them has gone anyway.
      let best = holes[0], bd = Infinity;
      for (const h of holes) {
        const d = Math.hypot(h.x - at.x, h.y - at.y, h.z - at.z);
        if (d < bd) { bd = d; best = h; }
      }
      best.a += area;
      best.a0 = (best.a0 ?? best.a) + area;
    }
    c.posArea = (c.posArea || 0) + area;
    if (!c.side) c.side = side < 0 ? -1 : 1;
    if (first) state.events.push({ e: 'flood', ship: ship.id, at: where, dry: 1 });
    ship.flooding = floodedCount(ship);
    return;
  }
  // And which side of her the water in here is going to sit on. Remembered on
  // the compartment rather than worked out from which holes are still open --
  // a damage control party that shores the holes does not make the water that
  // is already inside her run back across to the other side, and taking the
  // side off the holes meant she snapped bolt upright the moment the repair
  // button was pressed.
  if (!c.side) c.side = side < 0 ? -1 : 1;
  // How big it was when it was made, which is what decides how far her
  // parties can close it. See closable.
  c.rent0 = (c.rent0 || 0) + area;
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
    const worse = (1 + wrecked * 1.5) * shored;
    // The holes with no place on her, at the one depth they were made at...
    const open = Math.max(0, c.holeP + c.holeS - (c.posArea || 0)) * worse;
    c.inflow = 0;
    if (vol > 0) {
      // Torricelli, with the usual coefficient for a ragged hole in plating --
      // and choked by the wreckage and the machinery the water has to get
      // past, which is what makes a flooded compartment take a minute rather
      // than five seconds.
      let rate = 0;
      if (open > 0) {
        // How much sea is standing over the hole now: what it was when it
        // was made, plus however much deeper she is sitting since.
        const head = (c.holeY ?? 1) + b.sink;
        if (head > 0.05) rate += 0.62 * open * Math.sqrt(2 * 9.81 * head) * 0.16;
      }
      // ...and every hole that is somewhere, with the sea asked about it
      // where it is: the waves, her roll and pitch, her list, her trim and
      // how far down she is, all at that point. A hole above her waterline
      // takes the sea in gulps, when a wave or a roll puts the water over it.
      if (c.holes && c.holes.length) {
        for (const h of c.holes) {
          const head = holeHead(state, ship, h);
          if (head > 0.02) rate += 0.62 * h.a * worse * Math.sqrt(2 * 9.81 * head) * 0.16;
        }
      }
      if (rate > 0) {
        const full = c.water / vol;
        const q = Math.min(vol - c.water, rate * (1 - full * 0.7) * dt);
        if (q > 0) { c.water += q; took += q; c.inflow = q / dt; }
      }
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
    // A compartment that has been cut off her is not there to flood into.
    if (ca.lost || cb.lost) continue;
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
    // Counter-flooded: her parties have let the sea into the wing on the
    // other side to match, and the weight out to one side is out to both.
    // See stepParties.
    const cf = clamp(c.cf || 0, 0, 1);
    c.wP = wp + (c.water / 2 - wp) * cf;
    c.wS = ws + (c.water / 2 - ws) * cf;
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
  //
  // Only when she is going down by the head or the stern hard enough to put
  // her back across the sea: a ship flooded level settles, she does not break.
  if (ship.alive && ship.broke == null && Math.abs(after.trim + (ship.sinking?.trim || 0)) > BREAK_TRIM * 0.6) {
    const at = breakStation(ship);
    if (at != null) breakHer(state, ship, at, 'trim');
  }
  // The sea coming in over the deck edge, or over on her beam ends. She is
  // going -- but going takes time, and until she has gone she is fighting.
  if (ship.alive && !ship.sinking && (after.reserve <= 0 || Math.abs(after.heel) > 1.25)) {
    startSinking(state, ship, Math.abs(after.heel) > 1.25 ? 'capsize' : 'flooding');
  }
}

// ------------------------------------------------------------- going down

/** The longest a ship takes to go from the sea over her deck edge to gone, in seconds. */
export const SINK_MAX = 600;
/** How far down by the head or the stern she can go before her back goes, in radians. */
export const BREAK_TRIM = 0.42;

/** How high she stands above her waterline, all told: the depth the sea has to come up. */
export function standsAbove(cls) {
  return freeboardOf(cls) + 7 + 9 * (cls.hull.superstructure || 1);
}

/**
 * She is going down.
 *
 * Not a switch: the sea has got over her deck edge, or she has been shot to
 * pieces, and from here she settles -- slowly if she is mostly sound and has
 * one bad hole in her, quickly if there is nothing left of her holding air.
 * Ten minutes at the most. All that time she is still a ship in the battle:
 * whatever guns are still above the water and still have crews go on firing,
 * and she is not out of it until she cannot fight or the sea has closed over
 * her (see stepSinking).
 */
export function startSinking(state, ship, kind, by = 0) {
  if (!ship.alive || ship.sinking) return;
  const cls = shipClass(ship);
  const wrecked = 1 - clamp(ship.hp / Math.max(1, cls.hp), 0, 1);
  const b = buoyancy(ship);
  const water = clamp(b.water / Math.max(1, b.free), 0, 1);
  let T = SINK_MAX * (1 - 0.72 * wrecked) * (1 - 0.3 * water);
  if (kind === 'shattered') T *= 0.45;
  if (kind === 'magazine') T *= 0.3;
  T = clamp(T, 45, SINK_MAX);
  const heel = ship.heel || 0;
  ship.sinking = {
    t: 0, T, kind, by,
    // The depth she has to go to be under, and how far she has gone.
    depth: standsAbove(cls), down: 0,
    // What her going adds to her trim and her list over what the water in
    // her already gives her.
    trim: 0, heel: 0,
    // Whether she is rolling over. A big enough list with the sea coming in
    // over the low side does not settle: she goes on over and floats bottom
    // up. Not every time -- a ship with the weight low enough down comes back
    // and settles on her side.
    capsize: Math.abs(heel) > 1.0 || (Math.abs(heel) > 0.45 && state.rng() < 0.4),
    // How far down by one end she already was: the trim that runs away is the
    // trim she had. Flooded evenly she settles level.
    trim0: ship.trim || 0,
    // And the list she had. Once a compartment is full right across, the
    // water in it lies level and takes nothing to either side -- but she does
    // not come upright for it: the list she started going down with is the
    // list she goes down with, and it works on further.
    heel0: heel,
    roll: 0, way: Math.sign(heel || (state.rng() < 0.5 ? -1 : 1)),
  };
  state.events.push({ e: 'sinking', ship: ship.id, x: r(ship.x), z: r(ship.z), kind, T: Math.round(T) });
}

/**
 * Her back goes. Only off a magazine, or going down so hard by one end that
 * she is a girder across the sea with nothing under the middle of it.
 */
export function breakHer(state, ship, at, why) {
  // A ship that has already had a piece cut off her has parted once, at the
  // cut: what is left of her goes down as one piece.
  if (ship.broke != null || ship.cut) return;
  ship.broke = at;
  state.events.push({ e: 'break', ship: ship.id, at: r(at), x: r(ship.x), z: r(ship.z), why });
  if (!ship.sinking) startSinking(state, ship, why === 'magazine' ? 'magazine' : 'shattered');
  else ship.sinking.T = Math.min(ship.sinking.T, ship.sinking.t + 120);
}

/**
 * One step of going down. She settles at the rate set when she started, a
 * little faster as the last of the air goes out of her; her trim runs away
 * toward whichever end is heavy, and her list toward the low side -- or right
 * over, if she is capsizing. She is out of the battle when the sea closes over
 * her, or when there is no gun aboard her left to fight with.
 */
function stepSinking(state, ship, dt) {
  const S = ship.sinking;
  if (!S || S.under) return;
  const cls = shipClass(ship);
  // Out of the fight, she is still going down -- the same way, at the same
  // rate, from exactly where she was -- until the sea has closed over her.
  // Nothing aboard her floods any more (the water in her stays where it was),
  // so her own floating is held at what it was when she left the fight and
  // her going down is added to it.
  if (!ship.alive) {
    if (!S.base) S.base = { sink: (ship.sink || 0) - S.down, heel: (ship.heel || 0) - S.heel, trim: (ship.trim || 0) - S.trim };
    ship.sink = S.base.sink;
    ship.heel = S.base.heel;
    ship.trim = S.base.trim;
  }
  // Brought back. Her own floating is what stepFlooding has just made it,
  // with nothing more of going down added on.
  if (saved(ship, S, dt)) {
    ship.sinking = null;
    const b = buoyancy(ship);
    ship.sink = b.sink; ship.heel = b.heel; ship.trim = b.trim;
    state.events.push({ e: 'saved', ship: ship.id, x: r(ship.x), z: r(ship.z) });
    return;
  }
  S.t += dt;
  const u = clamp(S.t / S.T, 0, 1);
  // So that she is under, all told, at T: the rate grows as she goes.
  S.down = S.depth * (u * 0.6 + u * u * 0.4);
  // The heavy end goes on getting heavier.
  const trimWay = Math.sign(S.trim0 || ship.trim || 0.05);
  S.trim = trimWay * u * u * Math.min(0.75, 0.1 + 6 * Math.abs(S.trim0 || 0));
  const base = ship.heel || 0;
  const held = S.heel0 ?? 0;
  if (S.capsize) {
    // Over, slowly at first and then all at once, and then she lies there
    // bottom up while the air trapped in her lets go.
    S.roll = Math.min(1, S.roll + dt / Math.min(140, S.T * 0.45));
    const e = S.roll * S.roll * (3 - 2 * S.roll);
    const from = S.rollFrom ?? held;
    S.heel = from + (S.way * Math.PI - from) * e - base;
  } else {
    // The list she had, working further on as she goes.
    const want = held + Math.sign(held || S.way) * u * 0.25;
    // The water in her may be lying her over further than that; never less.
    const total = Math.abs(base) > Math.abs(want) && Math.sign(base) === Math.sign(want) ? base : want;
    S.heel = total - base;
    // And a list that runs away from her is a capsize after all.
    if (Math.abs(total) > 1.15) { S.capsize = true; S.way = Math.sign(total); S.rollFrom = total; }
  }
  // On the bottom, if there is one under her: she settles onto it and stops.
  const floor = seabedRoom(state.world, ship, cls);
  const onBottom = (ship.sink || 0) + S.down >= floor;
  if (onBottom) S.down = Math.max(0, floor - (ship.sink || 0));
  ship.sink = (ship.sink || 0) + S.down;
  ship.trim = (ship.trim || 0) + S.trim;
  ship.heel = (ship.heel || 0) + S.heel;
  // Too far down by one end: her back goes, where the sea has got to.
  if (ship.broke == null && cls.hull.length > 90 && Math.abs(ship.trim) > BREAK_TRIM && S.down > 2) {
    breakHer(state, ship, clamp(-Math.sign(ship.trim) * 0.25, -0.6, 0.6), 'trim');
  }
  // Resting on the bottom with her decks awash counts as gone once she has
  // had as long to go as she would have had to go under: there is no more
  // going down for her to do.
  const under = S.down >= S.depth * 0.98 || (onBottom && u >= 0.6);
  if (!ship.alive) {
    // Gone, when the sea has closed over the highest part of her.
    if (under || S.t >= S.T * 1.05) {
      S.under = true;
      state.events.push({ e: 'under', ship: ship.id, x: r(ship.x), z: r(ship.z) });
    }
    return;
  }
  // Out of it: under, or with nothing left to fight.
  const upsideDown = Math.abs(ship.heel) > 2.6;
  if (under || (upsideDown && S.roll >= 1) || !canFight(ship)) {
    founder(state, ship, under ? S.kind : upsideDown ? 'capsize' : 'silenced');
    if (under) { S.under = true; state.events.push({ e: 'under', ship: ship.id, x: r(ship.x), z: r(ship.z) }); }
  }
}

/**
 * Under, as far as the battle is concerned, and still going down.
 *
 * The battle stops counting her when the sea has closed over the deck she
 * stood on -- but a ship standing on her bow, or broken in two with both
 * halves up on end, still has a hundred feet of her out of the water, and the
 * picture goes on drawing her the rest of the way down (see stepFounder in
 * scene.js). For as long as it does she is steel that a ship can run into, so
 * she is taken down here at the same rate the picture uses, and she is out of
 * everybody's way only once the highest part of her is as far under as the
 * picture lets her go.
 */
function stepWreckDown(state, ship, dt) {
  const S = ship.sinking;
  const cls = shipClass(ship);
  if (S.sunkAt == null) S.sunkAt = Math.max(0, ship.sink || 0);
  // And no further than the bottom, where there is one.
  // Null for no bottom in reach: an Infinity on her state is not a number the
  // wire can carry.
  if (S.floor === undefined) {
    const f = seabedRoom(state.world, ship, cls);
    S.floor = Number.isFinite(f) ? f : null;
  }
  S.afterT = (S.afterT || 0) + dt;
  S.after = (S.after || 0) + (S.depth / Math.max(20, S.T) * 1.2 + 0.0015 * S.afterT) * dt;
  ship.sink = Math.min(S.sunkAt + S.after, Math.max(S.sunkAt, S.floor ?? Infinity));
  if (ship.sink >= cls.hull.length * 0.5 + 20 || S.afterT > 900) S.gone = true;
}

/** Whether she has a main or secondary gun left that could fire, now or after her crews have cleared it. */
export function canFight(ship) {
  const cls = shipClass(ship);
  const any = (list, specs) => list.some((m, i) => gunState(ship, cls, specs[m.id ?? i], m, true) < 3);
  const main = ship.turrets?.length ? any(ship.turrets, cls.turrets || []) : false;
  const sec = ship.secMounts?.length ? any(ship.secMounts, cls.secondary?.mounts || []) : false;
  return main || sec || (!ship.turrets?.length && !ship.secMounts?.length);
}

/**
 * Whether the sea is over a mounting, the way she is lying now.
 *
 * Her list and her trim lift one side and one end out and put the other under,
 * and a ship settling with her deck awash has her forward turret under while
 * her after one is still dry. A gun under water does not fire, from the moment
 * it is under.
 */
export function mountDrowned(ship, spec) {
  if (!spec) return false;
  const sink = ship.sink || 0;
  const heel = ship.heel || 0;
  const trim = ship.trim || 0;
  if (!sink && !heel && !trim) return false;
  const y = spec.my ?? 6;
  const x = spec.x || 0;
  const z = spec.z || 0;
  // Her own frame rolled and pitched into the sea's: heel lays her +x side
  // down, trim her bow.
  const h = y * Math.cos(heel) * Math.cos(trim) - x * Math.sin(heel) - z * Math.sin(trim) - sink;
  return h < -1;
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
  if (ship.cut) return null;
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
  if (!ship.alive) return;
  ship.alive = false;
  ship.speed = 0;
  const S = ship.sinking;
  const by = S?.by || 0;
  const source = by ? state.ships.find((q) => q.id === by) : null;
  if (source && source.team !== ship.team) source.kills++;
  state.events.push({
    e: 'sink', ship: ship.id, x: ship.x, z: ship.z, by, kind,
    // How much of her is still to go under, and how fast: the picture carries
    // on from where the battle left her rather than starting a sinking of its
    // own.
    left: S ? r(Math.max(0, S.depth - S.down)) : null,
    rate: S ? r(S.depth / Math.max(20, S.T) * 1.2) : null,
    capsize: S?.capsize ? 1 : 0,
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
  // Taken about the middle of what is left of her. A ship that has lost her
  // stern floats on the hull she still has, and the compartment open at the
  // broken end is a long way abaft the middle of that.
  const sp = hullSpan(ship);
  const mid = (sp.lo + sp.hi) / 2;
  for (const s of SECTIONS) {
    if (s.from === null) continue;
    const c = ship.sections[s.k];
    const w = c.wP + c.wS;
    total += w;
    port += c.wP;
    stbd += c.wS;
    // Where along her it is, for the trim: positive is forward -- the part of
    // the compartment that is still on her, if it was cut through.
    const a = Math.max(s.from, sp.lo);
    const b = Math.min(s.to, sp.hi);
    moment += w * ((b > a ? (a + b) / 2 : (s.from + s.to) / 2) - mid);
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
  // How much of her length is still her. A piece cut off her takes its
  // waterplane and its displacement with it, and the same water in what is
  // left puts her deeper and trims her harder.
  const sp = hullSpan(ship);
  const kept = (sp.hi - sp.lo) / 2;
  const len = h.length * kept;
  // What she weighs, near enough: her block coefficient is about a half in a
  // destroyer and a little more in anything fatter, and a cubic metre of sea
  // is a tonne.
  const disp = len * h.beam * h.draft * 0.55;
  // How much deeper the water aboard has put her: tonnes over the area of her
  // waterplane.
  const sink = w.total / Math.max(1, len * h.beam * 0.72);

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
  const gml = len * 1.1;
  const trim = Math.asin(clamp(
    (w.moment * h.length * 0.5) / Math.max(1, disp * gml), -0.999, 0.999));

  // When the sea comes over the deck edge she is finished, and that is a
  // matter of how she is lying as much as how much water is in her: a ship
  // heeled thirty degrees puts her gunwale under with half the water an
  // upright one needs. This is why the way she is hit decides how long she
  // lasts, and it is the whole of the sinking condition.
  const edge = sink + Math.abs(Math.sin(heel)) * h.beam * 0.5
    + Math.abs(Math.sin(trim)) * len * 0.5;
  return {
    water: w.total, sink, heel, trim, gm, edge, freeboard: fb,
    reserve: Math.max(0, 1 - edge / fb),
    free: len * h.beam * fb * 0.55,
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
    // Shot to pieces. She is going, and fast -- but she goes down, she does
    // not vanish, and whatever she still has above the water fights on.
    startSinking(state, ship, kind === 'magazine' ? 'magazine' : 'shattered', source ? source.id : 0);
    if (ship.sinking && source) ship.sinking.by = source.id;
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

// ---------------------------------------------------------------------------
// Damage control parties
// ---------------------------------------------------------------------------

/** What a party can be sent to do. */
export const PARTY_JOBS = ['pump', 'repair', 'guns', 'engine'];

/**
 * How many damage control parties she carries: three in the smallest ship in
 * the game and eight in the biggest, by her length -- which is near enough by
 * her company, and her company is where the parties come from.
 */
let PARTY_SPAN = null;
export function partyCount(cls) {
  if (!PARTY_SPAN) {
    const lens = Object.values(SHIP_CLASSES).map((c) => c.hull.length);
    PARTY_SPAN = [Math.min(...lens), Math.max(...lens)];
  }
  const [lo, hi] = PARTY_SPAN;
  const f = hi > lo ? clamp((cls.hull.length - lo) / (hi - lo), 0, 1) : 0;
  return 3 + Math.round(f * 5);
}

/** Send party `i` to a job, or stand it down (`null`). */
export function setParty(ship, i, job) {
  if (!ship || !ship.parties || !Number.isInteger(i) || !ship.parties[i]) return false;
  if (job !== null && job !== 'auto' && !PARTY_JOBS.includes(job)) return false;
  ship.parties[i].job = job;
  ship.parties[i].on = null;
  return true;
}

/**
 * How much one party gets done, against a ship with five of them.
 *
 * More parties is more hands, but not more of everything in proportion: a
 * battleship's eight share the same passages, the same pumps and the same
 * damage control central, and a destroyer's three are each doing the work of
 * two. Each party's output goes as one over the square root of how many she
 * carries, so a full complement of eight does about one and a half times what
 * three do -- the bigger ship is better found, and not overwhelmingly so.
 */
function partyEffort(ship) {
  const n = (ship.parties && ship.parties.length) || 5;
  return Math.sqrt(5 / n);
}

/**
 * The work rates of one party at that effort, per second.
 *
 * Measured against the rest of the ship: a fire grows by about 0.007 a second
 * at its worst, so one party puts out a developing fire in under a minute; the
 * old call-away put back eleven per cent of her structure a minute, and a full
 * crew on repairs does a little better than that; a damaged gun is back in
 * hand in twenty seconds against the seventy its own crew takes.
 */
const PARTY = {
  pump: 0.6, // of her own pumpRate, cubic metres a second
  patch: 0.07, // square metres of hole closed a second
  fire: 0.03, // of a compartment's fire put out a second
  hull: 0.0004, // of her full structure put back a second
  gun: 0.05, // of a mounting's damage cleared a second
  rebuild: 60, // seconds to bring a wrecked mounting back to damaged
  engine: 1.5, // seconds of engine or steering damage cleared a second
  trim: 1 / 75, // of a compartment's list counter-flooded away a second
};

/** What one party pumps, in cubic metres a second: a portable pump and its hoses. */
function partyPump(cls, ship) {
  return pumpRate(cls) * PARTY.pump * partyEffort(ship);
}

/**
 * The most a hole can be closed down to, in square metres.
 *
 * A shell hole a metre or so across can be plugged: a mattress, a plank and
 * wedges, and it is shut. A torpedo's rent or a citadel hit's ragged opening
 * the size of a room cannot be closed at sea at all -- a party can shore the
 * bulkheads round it, get a collision mat over part of it and stop the worst,
 * and that is half of it at best.
 */
const PLUG_MAX = 3;
function holeFloor(a0) {
  return a0 <= PLUG_MAX ? 0 : a0 * 0.5;
}

/** How much of a compartment's open area her parties can still close. */
function closable(c) {
  let left = 0;
  for (const h of c.holes || []) left += Math.max(0, h.a - holeFloor(h.a0 ?? h.a));
  const rent = Math.max(0, c.holeP + c.holeS - (c.posArea || 0));
  left += Math.max(0, rent - holeFloor(c.rent0 || rent));
  return left;
}

/** Close `amount` square metres of what can be closed in a compartment. */
function patchHoles(c, amount) {
  let left = amount;
  let shut = 0;
  for (const h of c.holes || []) {
    if (left <= 0) break;
    const q = Math.min(left, Math.max(0, h.a - holeFloor(h.a0 ?? h.a)));
    h.a -= q;
    c.posArea = Math.max(0, (c.posArea || 0) - q);
    left -= q;
    shut += q;
  }
  if (left > 0) {
    const rent = Math.max(0, c.holeP + c.holeS - (c.posArea || 0));
    shut += Math.min(left, Math.max(0, rent - holeFloor(c.rent0 || rent)));
  }
  // Off both sides of her in proportion: the area is what floods her.
  const open = c.holeP + c.holeS;
  if (open > 0 && shut > 0) {
    const f = Math.max(0, open - shut) / open;
    c.holeP *= f;
    c.holeS *= f;
  }
}

/** Whether a mounting can be worked on at all, rather than being gone. */
function mendable(ship, cls, kind, i, m, spec) {
  if (!m || mountFell(ship, kind, i)) return false;
  if (spec && ship.cut && severed(ship, cls, spec.z || 0)) return false;
  return (m.hurt || 0) > 0 || (m.disabled || 0) > 0;
}

/**
 * Something for a party to do under a job, or null: what it is, and the work.
 * The same choice every party on that job makes, so two parties on the pumps
 * go to the same flooded compartment and pump it twice as fast.
 */
function partyWork(ship, cls, job) {
  if (job === 'pump') {
    // Lying over: the first thing is to bring her upright, by flooding the
    // wing opposite the one the sea is in. It costs her buoyancy and it puts
    // her deck edge back above the water, which is what keeps her afloat.
    if (Math.abs(ship.heel || 0) > 0.05) {
      let cf = null;
      for (const s of SECTIONS) {
        if (s.from === null) continue;
        const c = ship.sections[s.k];
        if ((c.cf || 0) >= 1 || c.water < 1) continue;
        const lop = Math.abs(c.wP - c.wS) * (1 - (c.cf || 0));
        if (lop > 1 && (!cf || lop > cf.lop)) cf = { k: s.k, lop };
      }
      if (cf) return { on: `trim:${cf.k}`, k: cf.k, what: 'trim' };
    }
    let best = null;
    for (const s of SECTIONS) {
      if (s.from === null) continue;
      const c = ship.sections[s.k];
      if (c.water > 1 && (!best || c.water > ship.sections[best].water)) best = s.k;
    }
    return best ? { on: `pump:${best}`, k: best } : null;
  }
  if (job === 'repair') {
    // Fires first: they are what spreads. Then the holes, because they are
    // what lets the sea in. Then the structure.
    let fire = null;
    let hole = null;
    let hull = null;
    for (const s of SECTIONS) {
      const c = ship.sections[s.k];
      if (c.fire > 0.02 && (!fire || c.fire > ship.sections[fire].fire)) fire = s.k;
      const open = s.from !== null ? closable(c) : 0;
      if (open > 0.05 && (!hole || open > closable(ship.sections[hole]))) hole = s.k;
      if (c.hp < c.max * 0.995 && (!hull || c.hp / c.max < ship.sections[hull].hp / ship.sections[hull].max)) hull = s.k;
    }
    if (fire) return { on: `fire:${fire}`, k: fire, what: 'fire' };
    if (hole) return { on: `hole:${hole}`, k: hole, what: 'hole' };
    if (hull) return { on: `hull:${hull}`, k: hull, what: 'hull' };
    return null;
  }
  if (job === 'guns') {
    let best = null;
    const look = (kind, live, specs) => {
      for (let i = 0; live && i < live.length; i++) {
        const m = live[i];
        if (!mendable(ship, cls, kind, i, m, specs && specs[i])) continue;
        const bad = (m.hurt || 0) * 10 + (m.disabled || 0);
        if (!best || bad > best.bad) best = { on: `gun:${kind}:${i}`, m, bad };
      }
    };
    look('main', ship.turrets, cls.turrets);
    look('sec', ship.secMounts, cls.secondary ? cls.secondary.mounts : null);
    return best;
  }
  if (job === 'engine') {
    if (ship.engineDamage > 0) return { on: 'engine', what: 'engine' };
    if (ship.steeringDamage > 0) return { on: 'steering', what: 'steering' };
    return null;
  }
  return null;
}

/** How long a party on its own takes to notice it is wanted, in seconds. */
const AUTO_LAG = 12;

/** For a party left to its own devices: the job most wanted, turn and turn about. */
function autoJob(ship, cls, i) {
  const order = ['engine', 'pump', 'repair', 'guns'];
  for (let k = 0; k < order.length; k++) {
    const job = order[(k + i) % order.length];
    if (partyWork(ship, cls, job)) return job;
  }
  return null;
}

/**
 * The parties at work. Each is on the job it was given, and within that job
 * it goes where it is most wanted; with nothing to do there it stands by.
 */
function stepParties(state, ship, dt) {
  if (!ship.parties || !ship.parties.length) return;
  const cls = shipClass(ship);
  const eff = partyEffort(ship);
  let mended = false;
  ship.parties.forEach((p, i) => {
    const job = p.job === 'auto' ? autoJob(ship, cls, i) : p.job;
    const w = job ? partyWork(ship, cls, job) : null;
    // A party left to its own devices has to find out there is something
    // wrong before it goes: the word has to reach it and it has to get there.
    // Sent by the captain, it is already on its way.
    if (p.job === 'auto') {
      if (!w) { p.lag = 0; p.on = null; return; }
      if (!p.on && (p.lag = (p.lag || 0) + dt) < AUTO_LAG) return;
    }
    p.on = w ? w.on : null;
    if (!w) return;
    if (job === 'pump' && w.what === 'trim') {
      const c = ship.sections[w.k];
      c.cf = Math.min(1, (c.cf || 0) + PARTY.trim * eff * dt);
    } else if (job === 'pump') {
      const c = ship.sections[w.k];
      const q = Math.min(c.water, partyPump(cls, ship) * dt);
      c.water -= q;
      c.inflow = (c.inflow || 0) - q / dt;
    } else if (job === 'repair') {
      const c = ship.sections[w.k];
      if (w.what === 'fire') {
        c.fire = Math.max(0, c.fire - PARTY.fire * eff * dt);
      } else if (w.what === 'hole') {
        // A patch over the worst of it: a collision mat, timber and wedges.
        patchHoles(c, PARTY.patch * eff * dt);
      } else {
        c.hp = Math.min(c.max, c.hp + ship.maxHp * PARTY.hull * eff * dt);
        mended = true;
      }
    } else if (job === 'guns') {
      const m = w.m;
      m.disabled = Math.max(0, (m.disabled || 0) - dt * eff);
      if ((m.hurt || 0) >= 3) {
        // Wrecked, not gone: cleared away, rewired and put back in hand, and
        // it is a long job.
        m.fix = (m.fix || 0) + dt * eff;
        if (m.fix >= PARTY.rebuild) { m.hurt = 2.4; m.fix = 0; }
      } else {
        m.hurt = Math.max(0, (m.hurt || 0) - PARTY.gun * eff * dt);
      }
    } else if (job === 'engine') {
      if (w.what === 'engine') ship.engineDamage = Math.max(0, ship.engineDamage - PARTY.engine * eff * dt);
      else ship.steeringDamage = Math.max(0, ship.steeringDamage - PARTY.engine * eff * dt);
    }
  });
  if (mended) ship.hp = Math.min(ship.maxHp, hullIntegrity(ship));
  ship.fires = burningCount(ship);
}

/**
 * Whether her parties have brought her back from going down.
 *
 * A ship that is sinking because the sea is over her deck edge is a ship with
 * too much water in her, and water can be pumped out: get enough of it out,
 * and the holes patched, before she has gone too far, and she comes back up
 * and steams on. A magazine, a broken back, a piece of her gone, or a ship
 * already on her beam ends is past saving.
 */
function saved(ship, S, dt) {
  if (!ship.alive || !S || S.under) return false;
  if (S.kind === 'magazine' || ship.blown || ship.broke != null || ship.cut) return false;
  if (S.t > S.T * 0.85 || (S.roll || 0) > 0.3) return false;
  if (ship.hp < ship.maxHp * 0.08) return false;
  // Saved by somebody: her parties have to be at it -- on the pumps,
  // counter-flooding, or closing her up. A ship that rights herself with
  // nobody doing anything about it has only stopped going down for a moment.
  const working = (ship.parties || []).some((p) => p.on && /^(pump|trim|hole|hull|fire):/.test(p.on));
  if (!working) { S.held = 0; return false; }
  // Held there, not touched for a moment: twenty seconds with her deck edge
  // clear and her list coming off before anybody can call her safe.
  const b = buoyancy(ship);
  const ok = b.reserve >= 0.15 && Math.abs(b.heel) < 0.5;
  S.held = ok ? (S.held || 0) + dt : 0;
  return S.held >= 20;
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
  stepParties(state, ship, dt);
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

/** How far off a lit searchlight is seen, in clear air, in metres. */
export const LAMP_SEEN = 14000;

function stepDetection(state) {
  for (const s of state.ships) {
    // A wreck stays in sight of whoever had her in sight when she went, and
    // of anybody who comes near enough to see her afterwards, until the last
    // of her is gone (see wreckSighting). Kept apart from spottedBy, which is what
    // the guns and the aircraft lay on: a wreck is to be seen, not shot at.
    if (!s.alive && !s.wreckSeen) s.wreckSeen = [!!s.spottedBy?.[0], !!s.spottedBy?.[1]];
    s.spottedBy = [false, false];
  }
  wreckSighting(state);
  // An arcade battle has no lookouts to beat: every ship afloat is on both
  // sides' plots from the first second, whatever the fog, the rain or the
  // hour, and the only thing that keeps the guns quiet is range. A boat that
  // is down is still down -- there is nothing on the surface to lay a gun on.
  if (state.world?.arcade) {
    for (const target of state.ships) {
      if (!target.alive) continue;
      const tc = getClass(target.classId);
      if (tc.dive && submerged(target)) continue;
      target.spottedBy = [true, true];
    }
    return;
  }
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
    conceal *= sightOf(state.world);
    if (target.smokeActive > 0) conceal *= 0.22;
    if (target.fires > 0) conceal *= 1.25;
    // A lit searchlight is the brightest thing on the sea, and it gives her
    // away to everybody who can see the beam: far further than her hull,
    // though a fog bank or a rain squall still swallows it.
    if (target.lamps && target.lamps.some((l) => l.on)) {
      conceal = Math.max(conceal, LAMP_SEEN * sightOf(state.world));
    }

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
    const reach = (9000 + bm.y * 2.6) * sightOf(state.world);
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

/**
 * Wrecks found after they stopped being ships.
 *
 * A hull going down is the biggest, smokiest thing on the sea, and a wreck
 * nobody on the other side had in sight when she went is still there to be
 * seen by the first ship that steams up to her. Once seen she stays seen for
 * that side: the picture of a ship going down does not flicker in and out
 * with the lookouts, and it used to -- her hull was dropped from the wire the
 * tick she stopped being a ship, and came back when the battle ended and
 * everything was shown.
 */
function wreckSighting(state) {
  for (const w of state.ships) {
    if (w.alive || !w.wreckSeen || w.sinking?.under) continue;
    if (w.wreckSeen[0] && w.wreckSeen[1]) continue;
    const reach = shipClass(w).concealment * sightOf(state.world) * 1.25;
    for (const o of state.ships) {
      if (!o.alive || o.team === w.team || w.wreckSeen[o.team]) continue;
      if (dist(o.x, o.z, w.x, w.z) < reach) w.wreckSeen[o.team] = true;
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
  state.wind = windAt(state.world, state.t);
  stepSurges(state);
  for (const ship of state.ships) {
    if (!ship.alive) {
      // A wreck still going down goes on going down.
      if (ship.sinking && !ship.sinking.under) stepSinking(state, ship, dt);
      else if (ship.sinking && !ship.sinking.gone) stepWreckDown(state, ship, dt);
      continue;
    }
    stepDive(state, ship, dt);
    stepMovement(state, ship, dt);
    stepTurrets(state, ship, dt);
    stepTorpMounts(state, ship, dt);
    stepSecondary(state, ship, dt);
    stepDpSurface(state, ship, dt);
    stepDamageOverTime(state, ship, dt);
    stepSinking(state, ship, dt);
    stepFlak(state, ship, dt);
    stepDrowning(state, ship, dt);
    stepDepthAttack(state, ship, dt);
    stepSwamp(state, ship, dt);
  }
  stepCollisions(state, dt);
  stepBatteries(state, dt);
  stepShells(state, dt);
  stepBullets(state, dt);
  stepTorpedoes(state, dt);
  stepCharges(state, dt);
  stepPlanes(state, dt);
  stepRearGunners(state, dt);
  stepBombers(state, dt);
  stepAirSpacing(state);
  stepMidAir(state);
  stepFallers(state, dt);
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
