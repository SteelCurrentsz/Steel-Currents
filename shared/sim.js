// Authoritative battle simulation. The server owns an instance of this and
// broadcasts snapshots; the client runs the same code to predict its own hull
// between snapshots, so steering feels immediate without desyncing.

import {
  clamp, lerp, wrapAngle, angleDelta, approachAngle, approach, dist, dist2,
  headingTo, localToWorld, worldToLocal, pointInBox, makeRng, gauss, TAU,
} from './math.js';
import { getClass } from './ships.js';
import {
  BATTERIES, batteryGun, batteryArc, batteryHp, batteryAa,
} from './batteries.js';
import {
  MAP_HALF, blockedByLand, islandAt, landAt, spawnPoint, getWeather, groundHeight,
} from './world.js';

export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

const THROTTLE_NOTCHES = [-1, 0, 0.25, 0.5, 0.75, 1]; // index 0 is astern
export const MIN_NOTCH = 0;
export const MAX_NOTCH = THROTTLE_NOTCHES.length - 1;

export const CAP_TO_WIN = 1000;

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
    score: [0, 0],
    caps: world.caps.map((c) => ({ id: c.id, x: c.x, z: c.z, r: c.r, owner: -1, progress: 0, contest: -1 })),
    mode: opts.mode || 'domination',
    timeLimit: opts.timeLimit || 900,
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
    hp: cls.hp,
    maxHp: cls.hp,
    alive: true,
    fires: 0,
    fireTimers: [],
    flooding: 0,
    floodTimers: [],
    repairCd: 0,
    repairActive: 0,
    smoke: cls.smokeCharges,
    smokeActive: 0,
    engineDamage: 0,
    steeringDamage: 0,
    shellType: 'ap',
    aimX: sp.x + Math.sin(sp.heading) * 6000,
    aimZ: sp.z + Math.cos(sp.heading) * 6000,
    turrets: cls.turrets.map((t) => ({ id: t.id, angle: t.angle, cooldown: 0, disabled: 0 })),
    torpMounts: cls.torpedoes ? cls.torpedoes.mounts.map((m) => ({ id: m.id, angle: m.angle, cooldown: 0 })) : [],
    squadrons: cls.planes
      ? Array.from({ length: cls.planes.squadrons }, (_, i) => ({ id: i, state: 'deck', cooldown: 0 }))
      : [],
    airGroup: cls.planes ? normaliseAirGroup(cls, airGroup) : null,
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

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

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
  const ordered = THROTTLE_NOTCHES[ship.notch] * (ship.notch === 0 ? cls.reverseSpeed : cls.maxSpeed) * engine;
  const target = ordered * bleed;
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
  for (const t of ship.turrets) {
    if (t.disabled > 0) { t.disabled -= dt; continue; }
    const want = turretDesired(ship, cls, t);
    t.angle = approachAngle(t.angle, want.angle, cls.gun.traverse * dt);
    if (t.cooldown > 0) t.cooldown -= dt;
  }
}

export function canFire(ship) {
  if (!ship.alive) return false;
  return ship.turrets.some((t) => t.cooldown <= 0 && t.disabled <= 0);
}

/** Fire every turret that is loaded and on target. Returns barrels fired. */
export function fireGuns(state, ship) {
  if (!ship.alive) return 0;
  const cls = shipClass(ship);
  const gun = cls.gun;
  const spec = gun.shells[ship.shellType] || gun.shells.ap;
  const d = clamp(dist(ship.x, ship.z, ship.aimX, ship.aimZ), 400, gun.range);
  const muzzleHeight = 11 + cls.hull.superstructure * 5;
  let fired = 0;

  for (const t of ship.turrets) {
    if (t.cooldown > 0 || t.disabled > 0) continue;
    const tSpec = cls.turrets[t.id];
    const want = turretDesired(ship, cls, t);
    if (want.blocked) continue;
    if (Math.abs(angleDelta(t.angle, want.angle)) > 0.035) continue;

    const pos = turretWorldPos(ship, cls, t);
    const bearing = wrapAngle(ship.heading + t.angle);
    // Dispersion: a cone that widens with range, tightened by the gun's sigma.
    const spreadBase = (d * 0.0125) / gun.sigma;
    for (let g = 0; g < tSpec.guns; g++) {
      const lat = clamp(gauss(state.rng), -2.4, 2.4) * spreadBase * 0.35;
      const rng = clamp(gauss(state.rng), -2.4, 2.4) * spreadBase;
      const aimDist = clamp(d + rng, 300, gun.range);
      const s2 = solveBallistic(gun, aimDist, muzzleHeight);
      const b = bearing + Math.atan2(lat, Math.max(600, d));
      const vh = s2.v * Math.cos(s2.elev);
      state.shells.push({
        id: eid(),
        owner: ship.id, team: ship.team,
        x: pos.x + Math.sin(b) * 12, z: pos.z + Math.cos(b) * 12,
        y: muzzleHeight,
        vx: Math.sin(b) * vh, vz: Math.cos(b) * vh, vy: s2.v * Math.sin(s2.elev),
        g: s2.g,
        spec, caliber: gun.caliber,
        classId: cls.id,
        life: 0,
      });
      fired++;
    }
    t.cooldown = gun.reload;
    state.events.push({ e: 'muzzle', x: pos.x, z: pos.z, b: bearing, cal: gun.caliber, ship: ship.id });
  }
  if (fired > 0) ship.lastFiredAt = state.t;
  return fired;
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
        if (d < aa.range) p.hp -= aa.dps * dt * (1 - (d / aa.range) * 0.4);
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
    state.shells.push({
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
  if (rel > 0.74) return { part: lz > 0 ? 'bow' : 'stern', armor: cls.armor.bow, cit: false };
  if (y > 11 + cls.hull.superstructure * 6) return { part: 'superstructure', armor: cls.armor.superstructure, cit: false };
  if (plunging) return { part: 'deck', armor: cls.armor.deck, cit: rel < 0.58 };
  // The citadel is the machinery and magazine box amidships, below the belt's
  // upper edge - the only place a shell can break a ship's back in one hit.
  return { part: 'belt', armor: cls.armor.belt, cit: rel < 0.6 && y < 10 };
}

function resolveShellHit(state, sh, target, cx, cz, cy) {
  const cls = getClass(target.classId);
  const spec = sh.spec;
  const l = worldToLocal(cx - target.x, cz - target.z, target.heading);
  const speed = Math.hypot(sh.vx, sh.vz);
  const descent = Math.atan2(-sh.vy, Math.max(1, speed));
  const sec = hitSection(target, cls, l.x, l.z, cy, descent);

  // Impact obliquity: 0 is a square broadside hit, 1 is a shell skidding along
  // the length of the hull. A shell arriving down the ship's axis bounces.
  const impactBearing = Math.atan2(sh.vx, sh.vz);
  const relative = angleDelta(target.heading, impactBearing);
  const obliq = sec.part === 'deck' ? 0 : Math.abs(Math.cos(relative));
  const travelled = dist(0, 0, sh.vx * sh.life, sh.vz * sh.life);
  const penFall = clamp(1.12 - travelled / 30000, 0.5, 1);
  const effArmor = sec.armor / Math.max(0.35, 1 - obliq * 0.55);
  const pen = spec.pen * penFall;

  let dmg = 0, kind = 'pen';
  if (spec.type === 'ap') {
    if (sec.part !== 'deck' && obliq > 0.92 && spec.pen < sec.armor * 2.2) {
      kind = 'ricochet'; dmg = 0;
    } else if (pen < effArmor) {
      kind = 'shatter'; dmg = spec.damage * 0.04;
    } else if (pen > effArmor * 4.5 && !sec.cit) {
      kind = 'overpen'; dmg = spec.damage * 0.1;
    } else if (sec.cit && pen > effArmor * 1.05) {
      kind = 'citadel'; dmg = spec.damage;
    } else {
      kind = 'pen'; dmg = spec.damage * 0.33;
    }
  } else {
    if (spec.pen >= sec.armor) { kind = 'he'; dmg = spec.damage * 0.4; }
    else { kind = 'splash'; dmg = spec.damage * 0.1; }
    const fireRoll = state.rng();
    if (fireRoll < spec.fireChance * (target.fires >= 3 ? 0.25 : 1)) startFire(state, target);
    // HE tends to wreck what is exposed: mounts and steering.
    if (kind === 'he' && state.rng() < 0.06) {
      if (sec.part === 'stern') target.steeringDamage = 14;
      else if (sec.part === 'superstructure' && target.turrets.length) {
        target.turrets[Math.floor(state.rng() * target.turrets.length)].disabled = 12;
      }
    }
  }

  // Whoever fired it: a ship, or one of the guns ashore. A battery carries the
  // same id, team, kills and damage a hull does, so it can be credited the
  // same way without the damage code having to know which it is holding.
  const owner = shellOwner(state, sh);
  if (dmg > 0) damageShip(state, target, owner, dmg, kind);
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
    const pos = localToWorld(spec.x, spec.z, ship.heading);
    const base = wrapAngle(ship.heading + local);
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
        // Torpedo protection scales with hull size.
        const reduction = clamp((cls.hull.beam - 12) / 46, 0, 0.42);
        damageShip(state, target, owner, tp.damage * (1 - reduction), 'torpedo');
        if (state.rng() < tp.flood) startFlood(state, target);
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

export function launchStrike(state, ship) {
  const cls = shipClass(ship);
  if (!cls.planes || !ship.alive) return false;
  const sq = ship.squadrons.find((s) => s.state === 'deck' && s.cooldown <= 0);
  if (!sq) return false;
  const d = dist(ship.x, ship.z, ship.aimX, ship.aimZ);
  if (d > cls.planes.strikeRange) return false;
  sq.state = 'flying';
  // The package is a share of what she is actually carrying, not a fixed four
  // aircraft: torpedo bombers put fish in the water, dive bombers put bombs on
  // the deck, and the fighters go along to keep the flak and the CAP off them,
  // which is worth more to the strike than another bomb would be.
  const group = ship.airGroup || defaultAirGroup(cls) || { fighters: 0, dive: 0, torpedo: 4 };
  const share = (n) => Math.max(0, Math.round(n / cls.planes.squadrons));
  let torp = share(group.torpedo);
  let bomb = share(group.dive);
  // A group small enough to round away to nothing still sends what it has:
  // otherwise a captain who embarked two torpedo bombers watches a squadron
  // fly out, find the enemy and drop nothing at all.
  if (torp + bomb === 0) {
    if (group.torpedo >= group.dive && group.torpedo > 0) torp = 1;
    else if (group.dive > 0) bomb = 1;
  }
  state.planes.push({
    id: eid(), owner: ship.id, team: ship.team, sqId: sq.id,
    x: ship.x, z: ship.z, heading: headingTo(ship.x, ship.z, ship.aimX, ship.aimZ),
    tx: ship.aimX, tz: ship.aimZ,
    torp, bomb,
    count: Math.max(1, torp + bomb),
    hp: cls.planes.hp * (1 + share(group.fighters) * 0.22),
    phase: 'outbound', dropped: false, life: 0,
  });
  state.events.push({ e: 'launch', x: ship.x, z: ship.z, ship: ship.id });
  return true;
}

function stepPlanes(state, dt) {
  const out = [];
  for (const p of state.planes) {
    const carrier = state.ships.find((s) => s.id === p.owner);
    const cls = carrier ? getClass(carrier.classId) : null;
    const P = cls && cls.planes ? cls.planes : null;
    if (!P) continue;
    p.life += dt;

    // Anti-aircraft fire from every enemy in range chews the squadron down.
    for (const s of state.ships) {
      if (!s.alive || s.team === p.team || !getClass(s.classId).aa) continue;
      const aa = getClass(s.classId).aa;
      const d = dist(p.x, p.z, s.x, s.z);
      if (d < aa.range) {
        p.hp -= aa.dps * dt * (1 - d / aa.range * 0.4);
      }
    }
    if (p.hp <= 0) {
      state.events.push({ e: 'planesLost', x: p.x, z: p.z });
      releaseSquadron(state, p);
      continue;
    }

    let goalX = p.tx, goalZ = p.tz;
    if (p.phase === 'return' && carrier) { goalX = carrier.x; goalZ = carrier.z; }
    const want = headingTo(p.x, p.z, goalX, goalZ);
    p.heading = approachAngle(p.heading, want, 1.1 * dt);
    p.x += Math.sin(p.heading) * P.cruiseSpeed * dt;
    p.z += Math.cos(p.heading) * P.cruiseSpeed * dt;

    if (p.phase === 'outbound') {
      // Drop on the closest enemy inside the strike box.
      let best = null, bestD = 2200;
      for (const s of state.ships) {
        if (!s.alive || s.team === p.team) continue;
        const d = dist(p.x, p.z, s.x, s.z);
        if (d < bestD) { best = s; bestD = d; }
      }
      if (best && bestD < 1400) {
        const lead = leadPoint(p.x, p.z, best, P.torpSpeed);
        const base = headingTo(p.x, p.z, lead.x, lead.z);
        const torp = p.torp ?? p.count;
        for (let i = 0; i < torp; i++) {
          const off = (i - (torp - 1) / 2) * P.dropSpread;
          state.torps.push({
            id: eid(), owner: p.owner, team: p.team,
            x: p.x, z: p.z, heading: wrapAngle(base + off),
            speed: P.torpSpeed, range: P.torpRange, travelled: 0,
            damage: P.torpDamage, detection: 900, arming: 200, flood: P.floodChance,
          });
        }
        // The dive bombers go in over the top. A bomb either hits or it does
        // not -- there is nothing to run on and nothing to comb -- so it is
        // settled here rather than given a body to fly.
        for (let i = 0; i < (p.bomb || 0); i++) {
          if (state.rng() > (P.bombHit ?? 0.4)) continue;
          const owner = state.ships.find((s) => s.id === p.owner) || null;
          damageShip(state, best, owner, P.bombDamage ?? 4000, 'he');
          if (state.rng() < (P.bombFire ?? 0.3)) startFire(state, best);
          state.events.push({ e: 'bombHit', x: best.x, z: best.z });
        }
        state.events.push({ e: 'airDrop', x: p.x, z: p.z });
        p.phase = 'return';
      } else if (dist(p.x, p.z, p.tx, p.tz) < 200 || p.life > 180) {
        p.phase = 'return';
      }
    } else if (carrier && dist(p.x, p.z, carrier.x, carrier.z) < 300) {
      releaseSquadron(state, p);
      continue;
    } else if (!carrier || p.life > 300) {
      releaseSquadron(state, p);
      continue;
    }
    out.push(p);
  }
  state.planes = out;
}

function releaseSquadron(state, p) {
  const carrier = state.ships.find((s) => s.id === p.owner);
  if (!carrier) return;
  const sq = carrier.squadrons.find((s) => s.id === p.sqId);
  if (sq) { sq.state = 'deck'; sq.cooldown = getClass(carrier.classId).planes.rearm; }
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

function startFire(state, ship) {
  if (ship.fireTimers.length >= 4) return;
  ship.fireTimers.push(30);
  ship.fires = ship.fireTimers.length;
  state.events.push({ e: 'fire', ship: ship.id });
}

function startFlood(state, ship) {
  if (ship.floodTimers.length >= 3) return;
  ship.floodTimers.push(40);
  ship.flooding = ship.floodTimers.length;
  state.events.push({ e: 'flood', ship: ship.id });
}

export function damageShip(state, ship, source, amount, kind) {
  if (!ship.alive || amount <= 0) return;
  ship.hp -= amount;
  if (source && source.id !== ship.id) source.damageDealt += Math.min(amount, ship.hp + amount);
  if (ship.hp <= 0) {
    ship.hp = 0;
    ship.alive = false;
    ship.speed = 0;
    if (source && source.team !== ship.team) source.kills++;
    state.events.push({ e: 'sink', ship: ship.id, x: ship.x, z: ship.z, by: source ? source.id : 0, kind });
  }
}

export function useRepair(state, ship) {
  if (!ship.alive || ship.repairCd > 0) return false;
  const cls = shipClass(ship);
  ship.repairCd = cls.repairCooldown;
  ship.repairActive = 12;
  ship.fireTimers = [];
  ship.floodTimers = [];
  ship.fires = 0; ship.flooding = 0;
  ship.engineDamage = 0; ship.steeringDamage = 0;
  state.events.push({ e: 'repair', ship: ship.id });
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
  if (ship.fireTimers.length) {
    for (let i = ship.fireTimers.length - 1; i >= 0; i--) {
      ship.fireTimers[i] -= dt;
      if (ship.fireTimers[i] <= 0) ship.fireTimers.splice(i, 1);
    }
    ship.fires = ship.fireTimers.length;
    damageShip(state, ship, null, cls.hp * 0.0032 * ship.fires * dt, 'fire');
  }
  if (ship.floodTimers.length) {
    for (let i = ship.floodTimers.length - 1; i >= 0; i--) {
      ship.floodTimers[i] -= dt;
      if (ship.floodTimers[i] <= 0) ship.floodTimers.splice(i, 1);
    }
    ship.flooding = ship.floodTimers.length;
    damageShip(state, ship, null, cls.hp * 0.005 * ship.flooding * dt, 'flood');
  }
  if (ship.repairActive > 0) {
    ship.repairActive -= dt;
    ship.hp = Math.min(ship.maxHp, ship.hp + ship.maxHp * (cls.repairHeal / 12) * dt);
  }
  if (ship.repairCd > 0) ship.repairCd -= dt;
  if (ship.smokeActive > 0) ship.smokeActive -= dt;
  if (ship.engineDamage > 0) ship.engineDamage -= dt;
  if (ship.steeringDamage > 0) ship.steeringDamage -= dt;
  for (const m of ship.torpMounts) if (m.cooldown > 0) m.cooldown -= dt;
  for (const s of ship.squadrons) if (s.cooldown > 0) s.cooldown -= dt;
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
// Objectives
// ---------------------------------------------------------------------------

function stepCaps(state, dt) {
  if (state.mode !== 'domination') return;
  for (const cap of state.caps) {
    const counts = [0, 0];
    for (const s of state.ships) {
      if (!s.alive) continue;
      if (dist(s.x, s.z, cap.x, cap.z) < cap.r) counts[s.team]++;
    }
    cap.contest = counts[0] > 0 && counts[1] > 0 ? 2 : counts[0] > 0 ? 0 : counts[1] > 0 ? 1 : -1;
    if (cap.contest === 0 || cap.contest === 1) {
      const team = cap.contest;
      if (cap.owner === team) { cap.progress = 100; }
      else {
        cap.progress += dt * (9 + counts[team] * 3.5);
        if (cap.progress >= 100) {
          cap.progress = 100;
          cap.owner = team;
          state.events.push({ e: 'capture', cap: cap.id, team });
        }
      }
    } else if (cap.contest === -1 && cap.owner === -1) {
      cap.progress = Math.max(0, cap.progress - dt * 6);
    }
    if (cap.owner >= 0) state.score[cap.owner] += dt * 4.2;
  }
  for (let team = 0; team < 2; team++) {
    if (state.score[team] >= CAP_TO_WIN) finish(state, team, 'points');
  }
}

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
    stepDamageOverTime(state, ship, dt);
  }
  stepCollisions(state, dt);
  stepBatteries(state, dt);
  stepShells(state, dt);
  stepTorpedoes(state, dt);
  stepPlanes(state, dt);
  if (state.tick % 3 === 0) stepDetection(state);
  stepCaps(state, dt);
  if (!state.over) {
    checkElimination(state);
    if (state.t > state.timeLimit) {
      const w = state.score[0] === state.score[1] ? -1 : state.score[0] > state.score[1] ? 0 : 1;
      finish(state, w, 'timeout');
    }
  }
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
