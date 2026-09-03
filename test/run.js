// Headless checks for the simulation: ballistics, armour, torpedoes, bots.
import assert from 'node:assert/strict';
import {
  generateWorld, landAt, landMask, blockedByLand, islandAt, groundHeight,
  spawnPoint, islandRadius, islandHeight, shoreDistance,
} from '../shared/world.js';
import {
  createState, addShip, addBattery, step, fireGuns, fireTorpedoes, solveBallistic,
  useRepair, DT, damageShip, shipClearance, BATTERY_FOOTPRINT, batteryRise,
} from '../shared/sim.js';
import {
  BATTERIES, batteryGun, batteryArc, batteryReach, BATTERY_REACH,
} from '../shared/batteries.js';
import { SHIP_CLASSES } from '../shared/ships.js';
import {
  normaliseAirGroup, defaultAirGroup, launchStrike, steerToWaypoint, steerToward,
  SECTIONS, PENETRATING, hullIntegrity, sectionAt, freshSections, pickAirTarget,
  DECK_RUN, aaBattery, aaBarrels, aaBearing, mountBears,
} from '../shared/sim.js';
import { arsenal } from '../client/js/hud.js';
import { shellLength } from '../client/js/render/ordnance.js';
import { angleDelta } from '../shared/math.js';
import { batteryParts } from '../client/js/render/battery.js';
import { Ocean, AMP_SCALE } from '../client/js/render/ocean.js';
import { Wake } from '../client/js/render/wake.js';
import { ShipView } from '../client/js/render/scene.js';
import { Seakeeping, rollPeriod, rollHeed, pitchPeriod, pitchHeed, heaveHeed }
  from '../client/js/render/seakeeping.js';
import {
  enterpriseParts, buildEnterprise, stepLifts, stepDeck, LIFT_HW, liftZs, FD, HANGAR,
  __aircraft, deckPhases,
} from '../client/js/render/enterprise.js';
import { fletcherParts, buildFletcher, deckAt as fletcherDeckAt }
  from '../client/js/render/fletcher.js';
import {
  clevelandParts, buildCleveland, deckAt as clevelandDeckAt,
  halfDeck as clevelandHalfDeck,
} from '../client/js/render/cleveland.js';
import * as THREE from '../vendor/three.module.js';
import { createBotBrain, stepBot } from '../server/bots.js';
import { Room } from '../server/room.js';
import { crewBattle } from '../server/setup.js';
import { buildSnapshot } from '../shared/protocol.js';

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (err) { failures++; console.log(`  FAIL ${name}\n       ${err.message}`); }
}

/**
 * Run a body with the dice loaded, and put the real ones back afterwards.
 *
 * Gunnery scatter, torpedo timers and which way a brain kites are all drawn
 * from `Math.random`, so a check that measures how much damage a ship does in
 * a fixed number of ticks passes and fails by luck. Pinning the sequence makes
 * the answer the same every run, which is the only kind of answer a test can
 * act on.
 */
function pinned(fn) {
  const real = Math.random;
  let seed = 0x2545f491;
  Math.random = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return ((seed >>> 0) % 1e6) / 1e6;
  };
  try { return fn(); } finally { Math.random = real; }
}

function duel(aClass, bClass, gap = 9000, opts = {}) {
  const world = generateWorld(4242, 'open_ocean');
  world.islands = [];
  const state = createState(world, { mode: 'deathmatch' });
  const a = addShip(state, { name: 'A', classId: aClass, team: 0, index: 0 });
  const b = addShip(state, { name: 'B', classId: bClass, team: 1, index: 0 });
  // Straddle the centre of the map so neither hull is shoved off the border.
  a.x = 0; a.z = -gap / 2; a.heading = Math.PI / 2;
  b.x = 0; b.z = gap / 2; b.heading = Math.PI / 2;
  a.notch = opts.underway ? 4 : 1;
  b.notch = opts.underway ? 4 : 1;
  return { state, a, b };
}

console.log('\nSteel Currents simulation tests\n');

check('ballistic solution stays inside gun range', () => {
  for (const id of Object.keys(SHIP_CLASSES)) {
    const gun = SHIP_CLASSES[id].gun;
    const near = solveBallistic(gun, 5000);
    const far = solveBallistic(gun, gun.range * 0.98);
    assert.ok(near.tof > 1 && near.tof < 20, `${id} near tof ${near.tof}`);
    assert.ok(far.tof > near.tof, `${id} tof should grow with range`);
    assert.ok(far.elev < Math.PI / 4 + 0.01, `${id} elevation ${far.elev}`);
  }
});

check('shells fired at a stationary target land on it', () => {
  const { state, a, b } = duel('cleveland', 'hipper', 9000);
  let hits = 0, salvos = 0;
  for (let i = 0; i < 60 * 30; i++) {
    a.aimX = b.x; a.aimZ = b.z;
    // Wait for the turrets to train round before pulling the trigger.
    if (i > 60 && salvos < 8 && fireGuns(state, a) > 0) salvos++;
    for (const ev of step(state, DT)) if (ev.e === 'hit' && ev.victim === b.id) hits++;
  }
  assert.ok(salvos >= 6, `expected salvos, got ${salvos}`);
  assert.ok(hits > salvos * 2, `expected hits from ${salvos} salvos, got ${hits}`);
  assert.ok(b.hp < b.maxHp, 'target should have taken damage');
});

check('battleship AP citadels a cruiser but light AP bounces off a battleship', () => {
  const { state, a, b } = duel('iowa', 'cleveland', 8000);
  a.shellType = 'ap';
  let cits = 0;
  for (let i = 0; i < 240 * 30 && cits === 0; i++) {
    a.aimX = b.x; a.aimZ = b.z;
    if (i > 60) fireGuns(state, a);
    for (const ev of step(state, DT)) if (ev.kind === 'citadel') cits++;
  }
  assert.ok(cits > 0, '406 mm AP should citadel a light cruiser broadside');

  const light = duel('cleveland', 'iowa', 8000);
  light.a.shellType = 'ap';
  let pens = 0, bounces = 0;
  for (let i = 0; i < 90 * 30; i++) {
    light.a.aimX = light.b.x; light.a.aimZ = light.b.z;
    if (i > 60) fireGuns(light.state, light.a);
    for (const ev of step(light.state, DT)) {
      if (ev.e === 'hit' && ev.kind === 'citadel') pens++;
      if (ev.e === 'hit' && (ev.kind === 'shatter' || ev.kind === 'ricochet')) bounces++;
    }
  }
  assert.equal(pens, 0, '152 mm AP must not citadel an Iowa belt');
  assert.ok(bounces > 0, 'expected bounces off the belt');
});

check('torpedoes run out to range and detonate on contact', () => {
  const { state, a, b } = duel('fletcher', 'iowa', 1600);
  a.aimX = b.x; a.aimZ = b.z;
  const launched = fireTorpedoes(state, a);
  assert.ok(launched > 0, 'destroyer should launch torpedoes');
  let hits = 0;
  for (let i = 0; i < 150 * 30; i++) {
    for (const ev of step(state, DT)) if (ev.e === 'torpHit') hits++;
  }
  assert.ok(hits > 0, 'torpedo spread should hit a stationary battleship');
  assert.ok(b.hp < b.maxHp, 'torpedo damage should apply');
});

check('fires and flooding burn a ship down and repair clears them', () => {
  const { state, a } = duel('fletcher', 'iowa');
  a.fireTimers = [30, 30]; a.fires = 2;
  a.floodTimers = [40]; a.flooding = 1;
  const before = a.hp;
  for (let i = 0; i < 30 * 5; i++) step(state, DT);
  assert.ok(a.hp < before, 'damage over time should tick');
  useRepair(state, a);
  assert.equal(a.fires, 0);
  assert.equal(a.flooding, 0);
});

check('concealment: a destroyer is invisible before it opens fire', () => {
  const { state, a, b } = duel('fletcher', 'iowa', 8000);
  a.aimX = b.x; a.aimZ = b.z;
  for (let i = 0; i < 10; i++) step(state, DT);
  assert.equal(a.spottedBy[1], false, 'DD inside 8 km should still be dark to a BB');
  // Train the guns round, then open fire.
  for (let i = 0; i < 120; i++) step(state, DT);
  assert.ok(fireGuns(state, a) > 0, 'destroyer should get a salvo away');
  for (let i = 0; i < 10; i++) step(state, DT);
  assert.equal(a.spottedBy[1], true, 'firing should light the destroyer up');
});

check('a hull answers the helm and loses speed in the turn', () => {
  const { state, a } = duel('iowa', 'iowa', 9000, { underway: true });
  a.notch = 5;
  for (let i = 0; i < 30 * 70; i++) step(state, DT);   // work up to a steady full ahead
  const cruise = a.speed;
  assert.ok(cruise > 10, `expected way on, got ${cruise}`);
  const h0 = a.heading;
  a.rudderCmd = 1;
  for (let i = 0; i < 30 * 30; i++) step(state, DT);
  assert.notEqual(a.heading.toFixed(2), h0.toFixed(2));
  assert.ok(a.speed < cruise, 'speed should bleed in a hard turn');
});

check('bots find each other and fight to a decision', () => {
  const world = generateWorld(77, 'coral_shelf');
  const state = createState(world, { mode: 'deathmatch', timeLimit: 600 });
  const brains = new Map();
  for (let i = 0; i < 3; i++) {
    for (const team of [0, 1]) {
      const cls = ['fletcher', 'cleveland', 'iowa'][i];
      const s = addShip(state, { name: `bot${team}${i}`, classId: cls, team, index: i, isBot: true });
      brains.set(s.id, createBotBrain('veteran'));
    }
  }
  let sinks = 0;
  for (let i = 0; i < 30 * 420 && !state.over; i++) {
    for (const s of state.ships) if (s.alive) stepBot(state, s, brains.get(s.id), DT);
    for (const ev of step(state, DT)) if (ev.e === 'sink') sinks++;
  }
  const totalDamage = state.ships.reduce((n, s) => n + s.damageDealt, 0);
  assert.ok(totalDamage > 20000, `expected real damage, got ${Math.round(totalDamage)}`);
  assert.ok(sinks > 0, 'six veteran bots should sink something inside seven minutes');
});

check('snapshots hide unspotted enemies', () => {
  const { state, a, b } = duel('fletcher', 'iowa', 12000);
  for (let i = 0; i < 10; i++) step(state, DT);
  const enemyView = buildSnapshot(state, 1, b.id);
  assert.ok(!enemyView.ships.some((s) => s.i === a.id), 'unspotted DD must not appear in the enemy snapshot');
  const ownView = buildSnapshot(state, 0, a.id);
  assert.ok(ownView.ships.some((s) => s.i === a.id), 'you always see your own ship');
  assert.ok(ownView.ships.find((s) => s.i === a.id).cd, 'own ship snapshot carries reload timers');
});

check('a sinking is credited to the shooter', () => {
  const { state, a, b } = duel('iowa', 'fletcher');
  damageShip(state, b, a, b.maxHp + 1, 'test');
  assert.equal(b.alive, false);
  assert.equal(a.kills, 1);
  assert.ok(a.damageDealt > 0);
});

// ------------------------------------------------------- the real coastline --

/** The Strait of Gibraltar: Spain to the north, Morocco to the south, and
 *  eight miles of water between them. A good box to test land in, because
 *  every answer can be checked against an atlas. */
function strait() {
  return generateWorld(20260822, 'coral_shelf', 'day', 16000, { lon: -5.5, lat: 35.97 });
}

check('the chart\'s coastline is raised into the battlefield', () => {
  const w = strait();
  assert.ok(w.land.length > 0, 'expected coastline in the Strait of Gibraltar');
  const pts = w.land.reduce((a, r) => a + r.length, 0);
  assert.ok(pts > 100, `expected a surveyed shore, got ${pts} points`);
  assert.equal(w.islands.length, 0, 'real land should displace the invented islands');
  // North and south are ashore; the strait between them is not.
  assert.ok(landAt(w, 0, 14000), 'Spain should be ashore');
  assert.ok(landAt(w, 0, -14000), 'Morocco should be ashore');
  assert.ok(!landAt(w, 0, 0), 'the strait should be open water');
  // Open ocean has no land at all.
  const deep = generateWorld(1, 'open_ocean', 'day', 16000, { lon: -30, lat: 45 });
  assert.equal(deep.land.length, 0, 'the mid-Atlantic has no coast in it');
});

check('the mask the sim collides on matches the coastline it was cut from', () => {
  const w = strait();
  const m = landMask(w);
  // Point in polygon over the rings themselves, even-odd, which is what the
  // scanline fill is meant to reproduce.
  const inPolys = (x, z) => {
    let n = 0;
    for (const r of w.land) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, zi] = r[i];
        const [xj, zj] = r[j];
        if ((zi > z) === (zj > z)) continue;
        if (xi + ((z - zi) / (zj - zi)) * (xj - xi) > x) n++;
      }
    }
    return n % 2 === 1;
  };
  let checked = 0;
  let agree = 0;
  for (let i = 0; i < 4000; i++) {
    const x = ((i * 37) % 1000) / 1000 * 30000 - 15000;
    const z = ((i * 71) % 997) / 997 * 30000 - 15000;
    // Skip anything within a cell of the shore: the mask is sampled at cell
    // centres and cannot be expected to agree finer than that.
    if (Math.abs(groundHeight(w, x, z)) < 60) continue;
    checked++;
    if (landAt(w, x, z) === inPolys(x, z)) agree++;
  }
  assert.ok(checked > 500, `expected a decent sample, got ${checked}`);
  assert.equal(agree, checked, `${checked - agree} of ${checked} points disagreed`);
});

check('a ship driven at the coast runs aground on it', () => {
  const w = strait();
  const state = createState(w, { mode: 'deathmatch' });
  const ship = addShip(state, { name: 'A', classId: 'fletcher', team: 0, index: 0 });
  ship.x = 0; ship.z = 6000; ship.heading = 0;   // north, at Spain
  ship.notch = 4;
  const hp0 = ship.hp;
  let grounded = false;
  for (let i = 0; i < 60 * 60 * 4; i++) {
    for (const ev of step(state, DT)) if (ev.e === 'ground') grounded = true;
    if (grounded) break;
  }
  assert.ok(grounded, 'she should have gone aground on the Spanish shore');
  assert.ok(ship.hp < hp0, 'grounding should hurt');
  assert.ok(!landAt(w, ship.x, ship.z), 'she should be left floating, not inland');
  assert.ok(Math.abs(ship.speed) < 4, `she should be stopped, making ${ship.speed}`);
});

check('the coast breaks a sight line and stops a shell', () => {
  const w = strait();
  // Straight through Spain.
  assert.ok(blockedByLand(w, -6000, 15000, 6000, 15000) || landAt(w, 0, 15000),
    'a sight line through Spain should be blocked');
  // Down the middle of the strait, which is open water the whole way.
  assert.ok(!blockedByLand(w, -14000, 0, 14000, 0), 'the strait itself is clear');
  // A shell arriving ashore finds land under it.
  assert.ok(islandAt(w, 0, 14000, 0), 'a shell on the beach should find land');
  assert.equal(islandAt(w, 0, 0, 0), null, 'a shell in the strait should not');
});

check('fleets form up on water, not on a headland', () => {
  const w = strait();
  for (const team of [0, 1]) {
    for (let i = 0; i < 8; i++) {
      const p = spawnPoint(w, team, i);
      assert.ok(!landAt(w, p.x, p.z, 200),
        `team ${team} ship ${i} spawned ashore at ${Math.round(p.x)},${Math.round(p.z)}`);
    }
  }
  for (const c of w.caps) {
    assert.ok(!landAt(w, c.x, c.z), `capture zone ${c.id} is ashore`);
  }
});

check('a hull starts where her captain berthed her, unless she cannot float there', () => {
  const w = strait();
  const state = createState(w, { mode: 'deathmatch' });

  // The middle of the strait: deep water, and nowhere near the spawn line.
  const put = addShip(state, {
    name: 'Placed', classId: 'fletcher', team: 0, index: 0,
    at: { x: 1200, z: -600, h: 1.25 },
  });
  assert.equal(put.x, 1200, 'a berth on open water should be honoured');
  assert.equal(put.z, -600);
  assert.ok(Math.abs(put.heading - 1.25) < 1e-6, 'and so should the heading she was given');
  // Her guns look where she is pointed rather than back at the spawn line.
  assert.ok(put.aimZ > put.z, 'aim point should lead the bow she was turned to');

  // Spain, which no destroyer floats on. She is walked off it to the nearest
  // water rather than sent back to the corner: a captain's plan is not undone
  // silently just because one hull was laid a little too far in.
  const line = spawnPoint(w, 0, 1);
  const aground = addShip(state, {
    name: 'Aground', classId: 'fletcher', team: 0, index: 1,
    at: { x: 0, z: 14000, h: 0 },
  });
  assert.ok(!islandAt(w, aground.x, aground.z, shipClearance(SHIP_CLASSES.fletcher)),
    'a berth ashore should end up afloat');
  const swum = Math.hypot(aground.x - 0, aground.z - 14000);
  const toLine = Math.hypot(aground.x - line.x, aground.z - line.z);
  assert.ok(swum <= 1600 || toLine < 1,
    `she should be moved just clear of the shore, not ${Math.round(swum)}m away`);

  // And so does a berth outside the battlefield, or one that is not a number.
  const far = addShip(state, {
    name: 'Far', classId: 'fletcher', team: 1, index: 0, at: { x: 9e9, z: 9e9 },
  });
  assert.ok(Math.abs(far.x) <= w.half && Math.abs(far.z) <= w.half,
    'a berth off the chart should be brought back onto it');
  const none = addShip(state, {
    name: 'None', classId: 'fletcher', team: 1, index: 1, at: { x: NaN, z: 0 },
  });
  const line2 = spawnPoint(w, 1, 1);
  assert.equal(none.x, line2.x, 'nonsense should fall back to the spawn line');
});

check('a turret trains no further than its arc allows', () => {
  const w = generateWorld(4242, 'open_ocean');
  w.islands = [];
  w.land = [];
  const state = createState(w, { mode: 'deathmatch' });
  // Two hulls: the Fletcher's mounts train right round, the Essex's do not.
  for (const [classId, dead] of [['fletcher', false], ['enterprise', true]]) {
    const cls = SHIP_CLASSES[classId];
    const ship = addShip(state, { name: classId, classId, team: 0, index: 0 });
    ship.x = 0; ship.z = 0; ship.heading = 0;
    // Dead astern, which is the worst bearing any of them has.
    ship.aimX = 0; ship.aimZ = -8000;
    for (let i = 0; i < 900; i++) step(state, DT);
    const off = ship.turrets.map((t, k) =>
      Math.abs(((t.angle - cls.turrets[k].angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
    const trained = off.some((o, k) => o <= cls.turrets[k].arc + 1e-3);
    assert.ok(trained, `${classId} turrets should settle inside their arcs`);
    for (const [k, t] of ship.turrets.entries()) {
      const local = ((t.angle - cls.turrets[k].angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      assert.ok(Math.abs(local) <= cls.turrets[k].arc + 1e-3,
        `${classId} turret ${k} trained ${Math.round((local * 180) / Math.PI)} deg,`
        + ` past its ${Math.round((cls.turrets[k].arc * 180) / Math.PI)} deg stop`);
    }
    if (dead) {
      assert.ok(cls.turrets.every((t) => t.arc < Math.PI - 0.01),
        'a carrier should not have a mount that trains right round');
    }
    state.ships.length = 0;
  }
});

// --------------------------------------------------------- coast artillery --

/** A battery on the shore and one ship out in front of it. */
function shoot(batteryId, gap, half = 32004, classId = 'cleveland') {
  // The largest battlefield there is, so a gun that reaches fifty-five
  // thousand metres has somewhere to reach to and nothing is being shoved back
  // off the border mid-test. `half` can be opened out past that when a check
  // needs a target further off than any real battlefield allows.
  const world = generateWorld(4242, 'open_ocean', 'day', 32004);
  world.half = half;
  world.islands = [];
  world.land = [];
  const state = createState(world, { mode: 'deathmatch' });
  // Laid due north, which is where the ship is put.
  const bat = addBattery(state, { batteryId, team: 0, x: 0, z: -gap / 2, heading: 0 });
  const ship = addShip(state, { name: 'Target', classId, team: 1, index: 0 });
  // Notch 1 is stop; notch 0 is full astern.
  ship.x = 0; ship.z = gap / 2; ship.heading = Math.PI / 2; ship.notch = 1;
  return { state, bat, ship };
}

check('a battery opens fire inside its reach and stays quiet outside it', () => {
  const b = BATTERIES.merville;
  const reach = batteryReach(b);

  const near = shoot('merville', 40000);
  let salvos = 0;
  for (let i = 0; i < 30 * 120; i++) {
    for (const ev of step(near.state, DT)) if (ev.e === 'muzzle' && ev.battery) salvos++;
  }
  assert.ok(salvos >= 4, `expected the battery to fire, got ${salvos} salvos`);
  assert.ok(near.ship.hp < near.ship.maxHp, 'and to hit something with them');

  // The far half cannot be set up on a real battlefield: every gun on the list
  // now reaches further than any battlefield is wide, which is the point of the
  // multiplier. So this one is fought over an impossibly large sea, purely to
  // get the target out past the reach without the border shoving her back in.
  const beyond = reach * 1.4;
  const out = shoot('merville', beyond * 2, beyond * 4);
  let fired = 0;
  for (let i = 0; i < 30 * 120; i++) {
    for (const ev of step(out.state, DT)) if (ev.e === 'muzzle' && ev.battery) fired++;
  }
  assert.equal(fired, 0, 'a ship beyond the battery\'s reach must not be engaged');
  assert.equal(out.ship.hp, out.ship.maxHp, 'and must take no damage');
});

check('a battery trains inside its stops, and is re-laid to reach past them', () => {
  // Todt has 120 degrees of traverse: 60 either side of where it was laid.
  const { state, bat, ship } = shoot('todt', 20000);
  const arc = batteryArc(BATTERIES.todt);
  assert.ok(Math.abs(arc - Math.PI / 3) < 1e-6, 'sixty degrees either side');
  const laid = bat.heading;

  // Dead astern of the emplacement, which the mounting cannot bear on from
  // where it stands.
  ship.x = 0; ship.z = bat.z - 12000; ship.notch = 1;
  let fired = 0;
  let firstShot = -1;
  let worstAngle = 0;
  for (let i = 0; i < 30 * 240; i++) {
    for (const ev of step(state, DT)) {
      if (ev.e === 'muzzle' && ev.battery) { fired++; if (firstShot < 0) firstShot = i; }
    }
    worstAngle = Math.max(worstAngle, Math.abs(bat.angle));
  }
  // The gun never leaves its stops: what came round was the mounting under it.
  assert.ok(worstAngle <= arc + 1e-6, 'the gun must stay inside its stops');
  // Nothing in the first half-minute: a hundred and eighty degrees of training
  // gear is a job of work, and the crew has to do it before anybody fires.
  assert.ok(firstShot < 0 || firstShot > 30 * 25,
    `the battery opened fire after ${(firstShot / 30).toFixed(1)}s, before it could be round`);
  // But it does get there in the end, which is the point of a coast battery.
  assert.ok(fired > 0, 'a battery that can see a ship should eventually engage her');
  assert.ok(Math.abs(angleDelta(bat.heading, laid)) > 1,
    'and it should have been re-laid a long way off its original bearing');
});

check('a casemate is not re-laid the way a pedestal is', () => {
  // Merville is a field howitzer in a casemate with sixty degrees of traverse;
  // the 88 is a cruciform platform that already points anywhere. One of them
  // has to be shifted to reach past its arc and the other never does.
  const narrow = shoot('merville', 6000);
  narrow.ship.x = 0; narrow.ship.z = narrow.bat.z - 5000;
  const laid = narrow.bat.heading;
  for (let i = 0; i < 30 * 60; i++) step(narrow.state, DT);
  const swung = Math.abs(angleDelta(narrow.bat.heading, laid));

  const all = shoot('flak88', 6000);
  all.ship.x = 0; all.ship.z = all.bat.z - 5000;
  const laid2 = all.bat.heading;
  for (let i = 0; i < 30 * 60; i++) step(all.state, DT);
  assert.ok(Math.abs(angleDelta(all.bat.heading, laid2)) < 1e-6,
    'a mounting that already trains through 360 is never re-laid');
  assert.ok(swung > 0.2, 'a narrow mounting is shifted onto what it cannot otherwise reach');
  assert.ok(swung < Math.PI, 'but by hand, and slowly');
});

check('a battery can be silenced, and its armour decides how fast', () => {
  // A destroyer's 5-inch against Fort Drum's turret face is a nuisance; the
  // same shells against a field howitzer in the open are not.
  const hard = shoot('drum', 6000);
  const soft = shoot('merville', 6000);
  for (const s of [hard, soft]) {
    s.ship.classId = 'fletcher';
    s.ship.hp = 1e9;
    s.ship.maxHp = 1e9;
  }
  const pound = ({ state, bat, ship }) => {
    const before = bat.hp;
    for (let i = 0; i < 30 * 200 && bat.alive; i++) {
      ship.aimX = bat.x; ship.aimZ = bat.z;
      if (i > 60) fireGuns(state, ship);
      step(state, DT);
    }
    return { took: before - bat.hp, alive: bat.alive, of: before };
  };
  const h = pound(hard);
  const sft = pound(soft);
  assert.ok(sft.took > 0, 'a howitzer in the open should be taking damage');
  assert.equal(sft.alive, false, 'and should end up silenced');
  assert.ok(h.took / h.of < sft.took / sft.of,
    'a 457 mm turret face should shrug off what kills an open carriage');
});

check('the gun a battery fires is built from its own datasheet', () => {
  assert.ok(BATTERY_REACH > 1, 'a coast gun reaches further here than it did in life');
  for (const id of Object.keys(BATTERIES)) {
    const b = BATTERIES[id];
    const g = batteryGun(id);
    // The sheet keeps the real figure; the shells obey the reach. One is a
    // fixed multiple of the other, so the sheet still says which of these
    // outranges which and by how much.
    assert.equal(g.range, b.range * BATTERY_REACH,
      `${id} should shoot to its reach, not to its historical range`);
    assert.equal(g.reload, b.reload, `${id} should load as fast as it says it does`);
    assert.equal(g.caliber, b.caliber);
    // Every gun on the list outreaches the battlefield now, so the shot that
    // matters is the longest one anybody can actually take: corner to corner
    // on the largest battlefield there is. The solution has to be a real one
    // and the shell has to live long enough to arrive — the cull in stepShells
    // is a net under the arithmetic, not a range limit in disguise.
    const corner = 32004 * 2 * Math.SQRT2;
    assert.ok(g.range > corner, `${id} should outreach the largest battlefield`);
    const c = solveBallistic(g, corner, 200);
    assert.ok(c.tof > 1 && c.tof < 200, `${id} corner-to-corner time of flight ${c.tof}`);
    assert.ok(c.elev < Math.PI / 4 + 0.01, `${id} elevation ${c.elev}`);
  }
  // Bore decides weight of shell: the eight-hundred throws more than the
  // eighty-eight by rather a lot.
  assert.ok(batteryGun('gustav').shells.ap.damage
    > batteryGun('flak88').shells.ap.damage * 25, 'an 800 mm shell is not an 88');
});

check('islands are shapes, and everything agrees on which shape', () => {
  const w = generateWorld(9911, 'solomon_narrows');
  assert.ok(w.islands.length > 2, 'expected an island field');
  for (const i of w.islands) {
    assert.equal(i.rim.length, 24, 'every island carries a rim');
    const min = Math.min(...i.rim);
    const max = Math.max(...i.rim);
    assert.ok(max - min > i.r * 0.1, 'and the rim is not a circle');
    assert.ok(max <= i.rmax, 'and never reaches past the cheap reject radius');

    // The point test, the ring the chart draws and the height the renderer
    // raises all have to agree about where the water's edge is.
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const r = islandRadius(i, a);
      const inX = i.x + Math.sin(a) * r * 0.9;
      const inZ = i.z + Math.cos(a) * r * 0.9;
      const outX = i.x + Math.sin(a) * r * 1.1;
      const outZ = i.z + Math.cos(a) * r * 1.1;
      assert.ok(islandAt(w, inX, inZ, 0), 'inside the rim is ashore');
      assert.equal(islandAt(w, outX, outZ, 0), null, 'outside it is water');
      assert.ok(islandHeight(i, inX, inZ) > 0, 'and has ground above water on it');
      assert.equal(islandHeight(i, outX, outZ), 0, 'and none beyond it');
    }
    // The summit is the highest thing on it, which is where a battery goes.
    assert.ok(islandHeight(i, i.x, i.z) > islandHeight(i, i.x + i.r * 0.6, i.z));
    // And the mask the fleets are laid out against knows the island is there.
    assert.ok(landAt(w, i.x, i.z), 'an island is land to the spawn code too');
    assert.ok(shoreDistance(w, i.x, i.z) > 0, 'and inland of its own shore');
  }
  for (const p of [spawnPoint(w, 0, 0), spawnPoint(w, 1, 0)]) {
    assert.ok(!islandAt(w, p.x, p.z, 200), 'and no fleet forms up on one');
  }
});

check('a battery reaches past its historical range, and the sheet still says what it was', () => {
  const b = BATTERIES.merville;
  // The howitzer's real range is under ten thousand metres. Put a ship four
  // times that far out: in life it would have been perfectly safe.
  const gap = b.range * 4;
  assert.ok(gap > b.range && gap < batteryReach(b), 'past the real range, inside the reach');
  const { state, ship } = shoot('merville', gap);
  let salvos = 0;
  for (let i = 0; i < 30 * 120; i++) {
    for (const ev of step(state, DT)) if (ev.e === 'muzzle' && ev.battery) salvos++;
  }
  assert.ok(salvos >= 3, `expected the battery to reach her, got ${salvos} salvos`);
  assert.ok(ship.hp < ship.maxHp, 'and to hurt her at twice its historical range');

  // And the figure the gun park reads off is untouched: the datasheet is the
  // history, the reach is the game. (The screen itself is checked in the
  // browser; here it is enough that the number it reads has not moved.)
  assert.equal(BATTERIES.merville.range, 9970, 'the real range stays on the datasheet');
  assert.equal(BATTERIES.todt.range, 55700);
  assert.equal(BATTERIES.gustav.range, 47000);
});

check('a hull can be berthed right in under the shore', () => {
  const w = generateWorld(9911, 'solomon_narrows');
  const isle = [...w.islands].sort((a, b) => b.r - a.r)[0];
  const state = createState(w, { mode: 'deathmatch' });

  // A cable's length off the beach, due east of the island's middle.
  const R = islandRadius(isle, Math.PI / 2);
  for (const [id, name] of [['fletcher', 'a destroyer'], ['iowa', 'a battleship']]) {
    const cls = SHIP_CLASSES[id];
    const off = shipClearance(cls) + 12;
    assert.ok(off < 60, `${name} should need only a few tens of metres, not ${off}`);
    const x = isle.x + R + off;
    const z = isle.z;
    assert.ok(!islandAt(w, x, z, shipClearance(cls)), `${name} is afloat there`);
    const ship = addShip(state, {
      name, classId: id, team: 0, index: 0, at: { x, z, h: 0 },
    });
    assert.equal(ship.x, x, `${name} should be left where she was berthed`);
    assert.equal(ship.z, z);
    // Which is genuinely close in: nearer than the old clearance would allow.
    assert.ok(Math.hypot(ship.x - isle.x, ship.z - isle.z) - R < 70,
      `${name} should be right in under the shore`);
    state.ships.length = 0;
  }

  // A berth on the island itself is still refused -- but she is put in the
  // water off it, alongside the plan she belongs to, not back on the spawn
  // line five miles away.
  const line = spawnPoint(w, 0, 0);
  const beached = addShip(state, {
    name: 'Beached', classId: 'iowa', team: 0, index: 0,
    at: { x: isle.x, z: isle.z, h: 0 },
  });
  assert.ok(!islandAt(w, beached.x, beached.z, shipClearance(SHIP_CLASSES.iowa)),
    'a berth on the island should end up afloat');
  assert.ok(Math.hypot(beached.x - isle.x, beached.z - isle.z) < isle.rmax + 1600,
    'and just off that island, not back on the spawn line');
  assert.ok(Math.hypot(beached.x - line.x, beached.z - line.z) > 1,
    'she should not have been sent back to the line');
});

check('a battery mixes its arcs, so some shells come down on the deck', () => {
  // Twenty thousand metres, which is a real coast-gunnery range, against a ship
  // lying still so that where the shells land is about the arc and nothing else.
  // Longues loads in ten seconds, so a long test gets a real sample of arcs.
  const { state, ship } = shoot('longues', 20000, 32004, 'iowa');
  ship.hp = 1e12;
  ship.maxHp = 1e12;
  const parts = {};
  for (let i = 0; i < 30 * 1200; i++) {
    for (const ev of step(state, DT)) {
      if (ev.e === 'hit' && ev.victim === ship.id) parts[ev.part] = (parts[ev.part] || 0) + 1;
    }
  }
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  assert.ok(total > 25, `expected the battery to be hitting her, got ${total} hits`);
  assert.ok(parts.deck > 0, `expected plunging fire onto the deck, got ${JSON.stringify(parts)}`);
  assert.ok((parts.belt || 0) + (parts.superstructure || 0) > 0,
    `expected flat fire as well, got ${JSON.stringify(parts)}`);
  // Neither arc should be the only one it ever uses.
  assert.ok(parts.deck < total, 'and it should not be lobbing every salvo');
});

// The order-of-battle chart is portable JS with no DOM in it above the
// constructor, so the rule it sites batteries by can be checked here rather
// than only in a browser.
const { LayoutMap } = await import('../client/js/layout.js');

check('a battery is sited on the middle of its ground, not on the beach', () => {
  for (const [seed, preset, half] of [
    [3221164032, 'open_ocean', 16000],
    [9911, 'solomon_narrows', 12000],
    [777, 'coral_shelf', 24000],
  ]) {
    const w = generateWorld(seed, preset, 'day', half, { lon: -30, lat: 45 });
    const lay = Object.create(LayoutMap.prototype);
    lay.world = w;
    lay.half = w.half;
    const spots = lay.landSpots(8);
    assert.ok(spots.length >= 4, `${preset}: expected somewhere to put the guns`);
    for (const s of spots) {
      assert.ok(islandAt(w, s.x, s.z, 0), `${preset}: a gun position must be ashore`);
      // Not on the rim: at least a couple of hundred metres of ground round it,
      // and no further than three-quarters of the way out from the middle of
      // whatever it is standing on.
      const d = lay.landDepth(s.x, s.z);
      assert.ok(d > 200, `${preset}: sited ${Math.round(d)} m from the water, which is the beach`);
      const isle = w.islands.find((i) => Math.hypot(i.x - s.x, i.z - s.z) < (i.rmax || i.r));
      if (isle) {
        const out = Math.hypot(isle.x - s.x, isle.z - s.z)
          / islandRadius(isle, Math.atan2(s.x - isle.x, s.z - isle.z));
        assert.ok(out < 0.75, `${preset}: sited ${(out * 100).toFixed(0)}% of the way to the rim`);
      }
    }
    // And the ones actually handed out are not jammed into a corner of the
    // battlefield, where a token is half under the chart's furniture.
    const lay2 = Object.create(LayoutMap.prototype);
    lay2.world = w;
    lay2.half = w.half;
    lay2.tokens = [];
    for (const team of [0, 1]) {
      for (let k = 0; k < 2; k++) {
        lay2.tokens.push(lay2.gunToken('longues', team, k));
      }
    }
    lay2.tokens.push(lay2.shipToken('fletcher', 0, 0, true));
    lay2.tokens.push(lay2.shipToken('fletcher', 1, 0, false));
    lay2.auto();
    for (const t of lay2.tokens) {
      if (t.kind !== 'gun') continue;
      assert.ok(t.ok, `${preset}: an auto-sited battery must be ashore`);
      const edge = w.half - Math.max(Math.abs(t.x), Math.abs(t.z));
      assert.ok(edge > w.half * 0.08,
        `${preset}: sited ${Math.round(edge)} m from the border, which is the corner`);
    }
  }
});

check('the walk inland finds the middle from anywhere on an island', () => {
  const w = generateWorld(9911, 'solomon_narrows', 'day', 12000);
  const lay = Object.create(LayoutMap.prototype);
  lay.world = w;
  lay.half = w.half;
  const isle = [...w.islands].sort((a, b) => b.r - a.r)[0];
  // Started right on the beach, on every bearing.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const R = islandRadius(isle, a);
    const from = { x: isle.x + Math.sin(a) * R * 0.94, z: isle.z + Math.cos(a) * R * 0.94 };
    assert.ok(lay.landDepth(from.x, from.z) < R * 0.1, 'started on the beach');
    const mid = lay.inland(from.x, from.z);
    assert.ok(mid.d > R * 0.5,
      `walked to ${Math.round(mid.d)} m of ground on an island of ${Math.round(R)} m`);
  }
});

check('a sortie is crewed the same way with a socket and without one', () => {
  // The standalone build hosts its own battle in the tab, and used to do it
  // with a second copy of this that had never heard of the order-of-battle
  // chart: every hull went to the spawn line and no gun went ashore at all.
  // Both builds go through crewBattle now, so this is the contract they share.
  const layout = {
    allies: [{ x: -1200, z: 2000, h: 0.4 }, { x: 900, z: 2600, h: 0 }],
    enemies: [{ x: -2600, z: -2900, h: 3.1 }],
    allyGuns: [{ x: 4000, z: 1500, h: 1 }],
    enemyGuns: [{ x: -4200, z: -1800, h: -1 }],
  };
  const req = {
    layout, botSkill: 'regular',
    allyClasses: ['fletcher'], enemyClasses: ['fletcher'],
    allyGuns: ['flak88'], enemyGuns: ['flak88'],
  };
  // A room stood up without the tick timer, since nothing here needs to run.
  const room = new Room({ name: 't', mode: 'deathmatch', mapId: 'open_ocean',
    seed: 4242, half: 12000, private: true, autoStart: false });
  clearInterval(room.timer);
  const player = { id: 'p', name: 'Captain', team: 0, send() {} };
  crewBattle(room, req, (at) => {
    const res = room.join(player, { name: 'Captain', classId: 'fletcher', team: 0, at });
    return res.error ? { error: res.error } : { team: player.team };
  }, { allies: 7, enemies: 8, guns: 12 });

  const mine = room.state.ships.filter((s) => s.team === 0);
  const theirs = room.state.ships.filter((s) => s.team === 1);
  assert.equal(mine.length, 2, 'the captain and one consort');
  assert.equal(theirs.length, 1);
  // The first ally berth is the captain's own hull.
  assert.equal(mine[0].x, -1200, 'the captain berthed where he said');
  assert.equal(mine[0].z, 2000);
  assert.ok(Math.abs(mine[0].heading - 0.4) < 1e-6, 'on the heading he gave her');
  assert.equal(mine[1].x, 900, 'and so is his consort');
  assert.equal(mine[1].z, 2600);
  assert.equal(theirs[0].x, -2600, 'and so is the enemy');
  assert.equal(theirs[0].z, -2900);

  assert.equal(room.state.batteries.length, 2, 'both sides got their guns ashore');
  const ally = room.state.batteries.find((b) => b.team === 0);
  const foe = room.state.batteries.find((b) => b.team === 1);
  assert.equal(ally.x, 4000, 'the gun is where it was sited');
  assert.equal(ally.z, 1500);
  assert.equal(foe.x, -4200);
  assert.equal(foe.z, -1800);
  clearInterval(room.timer);
});

check('the plot knows about a ship the lookouts have not sighted', () => {
  // Fog of war decides what a captain can see and shoot at; it does not decide
  // what is on his plot. A fleet action is fought off a plot with everybody's
  // position on it, so an enemy over the horizon comes down the wire as a
  // contact -- position and heading, nothing else -- and nowhere near the
  // renderer or the gunnery.
  const w = generateWorld(2024, 'open_ocean', 'day', 16000);
  const state = createState(w, { mode: 'deathmatch' });
  const mine = addShip(state, { name: 'Mine', classId: 'fletcher', team: 0, index: 0,
    at: { x: -14000, z: -14000, h: 0 } });
  const far = addShip(state, { name: 'Far', classId: 'fletcher', team: 1, index: 0,
    at: { x: 14000, z: 14000, h: 0 } });
  far.spottedBy = [false, false];

  const snap = buildSnapshot(state, 0, mine.id);
  assert.ok(!snap.ships.some((s) => s.i === far.id),
    'an unsighted enemy is not a target');
  const mark = snap.contacts.find((c) => c.i === far.id);
  assert.ok(mark, 'but she is on the plot');
  assert.equal(mark.x, 14000, 'where she actually is');
  assert.equal(mark.z, 14000);
  assert.equal(mark.tm, 1, 'and on the side she is actually on');
  assert.equal(mark.hp, undefined, 'without telling her enemy how she is doing');

  // Once she is sighted she moves the other way, and is not counted twice.
  far.spottedBy = [true, false];
  const seen = buildSnapshot(state, 0, mine.id);
  assert.ok(seen.ships.some((s) => s.i === far.id), 'a sighted enemy is a target');
  assert.ok(!seen.contacts.some((c) => c.i === far.id), 'and only on the plot once');
});

check('a gun stands on its ground, never inside it', () => {
  // A pad cut at the height of the middle of the position leaves the uphill
  // half of it buried: the hill goes on climbing past where anybody looked and
  // comes up through the revetment. The pad is measured over everything the
  // emplacement covers, so no ground under it is higher than it is.
  const w = generateWorld(9911, 'solomon_narrows', 'day', 14000);
  const state = createState(w, { mode: 'deathmatch' });
  const isles = [...w.islands].sort((a, b) => b.r - a.r).slice(0, 4);
  let tested = 0;
  for (const isle of isles) {
    const R = isle.rmax || isle.r;
    // Not the summit -- the slopes, which are where a pad gets buried.
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const x = isle.x + Math.sin(a) * R * 0.45;
      const z = isle.z + Math.cos(a) * R * 0.45;
      if (!islandAt(w, x, z, 0)) continue;
      const bat = addBattery(state, { batteryId: 'longues', team: 0, x, z, heading: a });
      const span = BATTERIES.longues.span;
      for (const ring of BATTERY_FOOTPRINT) {
        for (let j = 0; j < 12; j++) {
          const th = (j / 12) * Math.PI * 2;
          const g = groundHeight(w, x + Math.cos(th) * span * ring, z + Math.sin(th) * span * ring);
          assert.ok(g <= bat.y + 0.001,
            `ground ${g.toFixed(1)}m under a pad cut at ${bat.y.toFixed(1)}m`);
        }
      }
      // And it stands proud of that ground: an earthwork, not a slice off the
      // top of the hill flush with it.
      const under = groundHeight(w, x, z);
      assert.ok(bat.y >= under + batteryRise(span) - 0.001,
        `a pad at ${bat.y.toFixed(1)}m over ground at ${under.toFixed(1)}m is not an earthwork`);
      tested++;
      state.batteries.length = 0;
    }
  }
  assert.ok(tested >= 6, `only ${tested} emplacements were on land to test`);
});

check('no piece of a gun stands in mid-air', () => {
  // Every part of an emplacement has to be carried by something, and everything
  // that carries it has to reach the ground. Built out of a few hundred boxes
  // apiece, that is not a thing anybody is going to keep true by looking at the
  // screen -- so it is asked here: group the pieces into what touches what, and
  // every group must have something in it resting on the ground.
  const EPS = 0.07;
  const GROUND = 0.15;
  const hits = (a, b) => {
    for (let i = 0; i < 3; i++) {
      if (a.min[i] - EPS > b.max[i] || b.min[i] - EPS > a.max[i]) return false;
    }
    return true;
  };
  for (const id of Object.keys(BATTERIES)) {
    const parts = batteryParts(id);
    assert.ok(parts.length > 40, `${id} should be built of more than ${parts.length} pieces`);
    const n = parts.length;
    const up = [...Array(n).keys()];
    const find = (k) => (up[k] === k ? k : (up[k] = find(up[k])));
    for (let a = 0; a < n; a++) {
      for (let b2 = a + 1; b2 < n; b2++) if (hits(parts[a], parts[b2])) up[find(a)] = find(b2);
    }
    const grounded = new Set();
    for (let a = 0; a < n; a++) if (parts[a].min[1] <= GROUND) grounded.add(find(a));
    const floating = [];
    for (let a = 0; a < n; a++) {
      if (!grounded.has(find(a))) floating.push(parts[a].min.map((v) => Math.round(v * 10) / 10));
    }
    assert.equal(floating.length, 0,
      `${id}: ${floating.length} pieces in mid-air, first at ${JSON.stringify(floating[0])}`);
  }
});

check('the carrier is one connected ship, with nothing left in mid-air', () => {
  // Two thousand pieces, and moving any one deck can leave whatever stood on it
  // hanging. Weld them by overlap and there must be exactly one body: if the
  // radar aerial or a bridge wing lamp comes away, it shows up here as a second.
  const EPS = 0.1;
  const hits = (a, b) => {
    for (let i = 0; i < 3; i++) {
      if (a.min[i] - EPS > b.max[i] || b.min[i] - EPS > a.max[i]) return false;
    }
    return true;
  };
  const parts = enterpriseParts();
  assert.ok(parts.length > 1500, `she should be built of more than ${parts.length} pieces`);
  const n = parts.length;
  const up = [...Array(n).keys()];
  const find = (k) => (up[k] === k ? k : (up[k] = find(up[k])));
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) if (hits(parts[a], parts[b])) up[find(a)] = find(b);
  }
  const bodies = new Map();
  for (let a = 0; a < n; a++) {
    const r = find(a);
    if (!bodies.has(r)) bodies.set(r, []);
    bodies.get(r).push(a);
  }
  let adrift = null;
  if (bodies.size > 1) {
    let main = null;
    for (const [r, m] of bodies) if (!main || m.length > bodies.get(main).length) main = r;
    for (const [r, m] of bodies) {
      if (r !== main) { adrift = parts[m[0]].min.map((v) => Math.round(v * 10) / 10); break; }
    }
  }
  assert.equal(bodies.size, 1, `${bodies.size - 1} piece(s) adrift, one at ${JSON.stringify(adrift)}`);
  // Touching is not the same as being attached. A funnel resting a four-
  // centimetre corner against a mast leg passes the weld above and still hangs
  // in the air to look at, so every piece must also share a real face with
  // something: their boxes must meet in all three axes and overlap by more than
  // half the smaller piece in at least two of them. A stick -- a barrel, a
  // yardarm, a wire -- is a projection by nature and needs only one, judged on
  // its own size rather than the fat box a tilted stick casts on the axes.
  const span = (q, i) => q.max[i] - q.min[i];
  const stick = (q) => {
    const d = [...q.size].sort((x, y) => y - x);
    return d[0] > 3.5 * d[1];
  };
  const faces = (q, r) => {
    let solid = 0;
    for (let i = 0; i < 3; i++) {
      const o = Math.min(q.max[i], r.max[i]) - Math.max(q.min[i], r.min[i]);
      if (o < -EPS) return 0;
      if (o >= 0.5 * Math.min(span(q, i), span(r, i)) - EPS) solid++;
    }
    return solid;
  };
  const loose = [];
  for (const q of parts) {
    const want = stick(q) ? 1 : 2;
    if (!parts.some((r) => r !== q && faces(q, r) >= want)) loose.push(q);
  }
  assert.equal(loose.length, 0, `${loose.length} piece(s) hanging in the air, `
    + `first at ${JSON.stringify(loose[0] && loose[0].min.map((v) => Math.round(v * 10) / 10))}`);
  // And she must be the right way round: the island goes to starboard, which
  // with the bow at +z and up at +y is negative x.
  let islandX = 0;
  let top = -Infinity;
  for (const q of parts) {
    if (q.max[1] > top) { top = q.max[1]; islandX = (q.min[0] + q.max[0]) / 2; }
  }
  assert.ok(islandX < -5, `the island should stand to starboard, not at x ${islandX.toFixed(1)}`);
});

check('both sides of her hull face outboard', () => {
  // The shell is lofted as a ring: up the port side and back down the starboard.
  // Wind it the wrong way and every face on both sides looks inboard, gets
  // culled, and what you see of the ship is the inside of her far side showing
  // through the near one -- a hull with only one side to it. Fire rays at her
  // from all round and every one must land on a face looking back.
  const built = buildEnterprise();
  built.group.updateMatrixWorld(true);
  const meshes = [];
  built.group.traverse((o) => {
    if (!o.isMesh) return;
    // The raycaster culls back faces exactly the way the renderer does, so on an
    // inside-out hull it would skip the near side and report the far side's
    // inner face pointing helpfully back at us. This throwaway copy is made
    // double-sided so the ray reports the first surface it actually meets.
    o.material = o.material.clone();
    o.material.side = THREE.DoubleSide;
    meshes.push(o);
  });
  const ray = new THREE.Raycaster();
  const normal = new THREE.Matrix3();
  let hits = 0;
  let ends = 0;
  const backs = [];
  // Athwartships at every height there is ship at: the underwater body, the
  // topsides, the hangar and the gallery deck. Then straight down, which is how
  // a deck wound the wrong way up shows itself.
  const shots = [];
  for (const side of [-1, 1]) {
    for (let zi = -8; zi <= 8; zi++) {
      for (const y of [-5, -2, 0, 3, 6, 9, 11, 15]) {
        shots.push([[side * 70, y, (zi / 10) * 112], [-side, 0, 0]]);
      }
    }
  }
  for (let zi = -8; zi <= 8; zi++) {
    for (const x of [-9, -3, 3, 9]) shots.push([[x, 60, (zi / 10) * 112], [0, -1, 0]]);
  }
  // And straight down the centreline at both ends. The shell is lofted as a
  // ring per station, so the first and last rings are open edges: without a cap
  // there is a slot up the stem and the transom is a hole. A ray fired at
  // either end must find plating, and it must be plating facing the ray.
  for (const y of [-2, 0, 2, 5, 8]) {
    shots.push([[0, y, 190], [0, 0, -1]]);
    shots.push([[0, y, -190], [0, 0, 1]]);
    shots.push([[1.2, y, 190], [0, 0, -1]]);
    shots.push([[-1.2, y, -190], [0, 0, 1]]);
  }
  for (const [from, d] of shots) {
    const dir = new THREE.Vector3(d[0], d[1], d[2]);
    ray.set(new THREE.Vector3(from[0], from[1], from[2]), dir);
    const got = ray.intersectObjects(meshes, false);
    const atEnd = Math.abs(from[2]) === 190;
    if (!got.length || !got[0].face) continue;
    if (atEnd) ends++;
    hits++;
    const n = got[0].face.normal.clone()
      .applyMatrix3(normal.getNormalMatrix(got[0].object.matrixWorld)).normalize();
    if (n.dot(dir) > 0) backs.push(from.map((v) => Math.round(v)));
  }
  assert.ok(hits > 100, `only ${hits} rays found her at all`);
  assert.ok(ends === 20, `${20 - ends} ray(s) down the centreline found no plating at her ends`);
  assert.equal(backs.length, 0,
    `${backs.length} of ${hits} rays landed on an inside-out face, first from ${JSON.stringify(backs[0])}`);
});

check('the carrier\'s guns stand where her datasheet says they do', () => {
  // The model lays her sponsons off her own length and the simulation lays her
  // guns off the datasheet. Change one -- her length, the sponson spacing, the
  // deck's taper -- and they part company silently: the shells come out of a
  // point in mid-air beside her. So they are checked against each other.
  const built = buildEnterprise();
  const sheet = SHIP_CLASSES.enterprise;
  assert.equal(built.turrets.length, sheet.turrets.length,
    `${built.turrets.length} mounts built against ${sheet.turrets.length} on the sheet`);
  assert.equal(built.length, sheet.hull.length,
    `the model is ${built.length} m long and the sheet says ${sheet.hull.length}`);
  built.turrets.forEach((m, i) => {
    const t = sheet.turrets[i];
    assert.ok(Math.abs(m.position.x - t.x) < 0.15 && Math.abs(m.position.z - t.z) < 0.15,
      `${t.name} is modelled at ${m.position.x.toFixed(1)}, ${m.position.z.toFixed(1)} `
      + `and laid at ${t.x}, ${t.z}`);
    // And on the side its name claims: starboard is negative x.
    assert.ok(t.name.startsWith('S') === (t.x < 0),
      `${t.name} is on the wrong side at x ${t.x}`);
  });
});

check('the destroyer is the size the real Fletcher was', () => {
  // 376 ft 6 in on 39 ft 8 in, drawing 17 ft 9 in: the numbers that make her a
  // Fletcher rather than a generic destroyer. Nothing bolted to her -- a gun
  // tub, a raft, a K-gun -- may hang over the side either, because the beam is
  // measured over everything and a tub cantilevered off the deck edge reads as
  // a fatter ship both to the eye and to anyone measuring her.
  const parts = fletcherParts();
  let z0 = Infinity;
  let z1 = -Infinity;
  let half = 0;
  let keel = Infinity;
  let wide = null;
  for (const q of parts) {
    z0 = Math.min(z0, q.min[2]); z1 = Math.max(z1, q.max[2]);
    keel = Math.min(keel, q.min[1]);
    const x = Math.max(Math.abs(q.min[0]), Math.abs(q.max[0]));
    if (x > half) { half = x; wide = q; }
  }
  const sheet = SHIP_CLASSES.fletcher;
  assert.ok(Math.abs((z1 - z0) - 114.7) < 1.5,
    `she is ${(z1 - z0).toFixed(1)} m over all and a Fletcher is 114.7`);
  assert.ok(half * 2 < 12.4,
    `she measures ${(half * 2).toFixed(2)} m over her extreme beam of 12.1, `
    + `widest at z ${((wide.min[2] + wide.max[2]) / 2).toFixed(1)} y `
    + `${((wide.min[1] + wide.max[1]) / 2).toFixed(1)}`);
  assert.ok(half * 2 > 11.6, `she is only ${(half * 2).toFixed(2)} m in the beam`);
  assert.ok(Math.abs(-keel - sheet.hull.draft) < 0.6,
    `she draws ${(-keel).toFixed(2)} m and the sheet says ${sheet.hull.draft}`);
});

check('the destroyer is one connected ship, with nothing left in mid-air', () => {
  // The same weld the carrier gets. She is a small ship carrying a great deal
  // of gear, and moving one deckhouse a metre leaves whatever stood on it --
  // a mount, a tub, a raft in its rack -- hanging over the deck.
  const EPS = 0.1;
  const parts = fletcherParts();
  assert.ok(parts.length > 900, `she should be built of more than ${parts.length} pieces`);
  const n = parts.length;
  const hits = (a, b) => {
    for (let i = 0; i < 3; i++) {
      if (a.min[i] - EPS > b.max[i] || b.min[i] - EPS > a.max[i]) return false;
    }
    return true;
  };
  const up = [...Array(n).keys()];
  const find = (k) => (up[k] === k ? k : (up[k] = find(up[k])));
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) if (hits(parts[a], parts[b])) up[find(a)] = find(b);
  }
  const bodies = new Map();
  for (let a = 0; a < n; a++) {
    const r = find(a);
    if (!bodies.has(r)) bodies.set(r, []);
    bodies.get(r).push(a);
  }
  let adrift = null;
  if (bodies.size > 1) {
    let main = null;
    for (const [r, m] of bodies) if (!main || m.length > bodies.get(main).length) main = r;
    for (const [r, m] of bodies) {
      if (r !== main) { adrift = `${parts[m[0]].from} at ${JSON.stringify(parts[m[0]].min.map((v) => Math.round(v * 10) / 10))}`; break; }
    }
  }
  assert.equal(bodies.size, 1, `${bodies.size - 1} piece(s) adrift, one is ${adrift}`);
  // Touching is not being attached. A raft resting a corner against a rail
  // passes the weld above and still hangs in the air to look at, so every piece
  // must share a real face with something: their boxes must meet in all three
  // axes and overlap by more than half the smaller piece in at least two. A
  // stick -- a barrel, a stanchion, an aerial wire -- is a projection by nature
  // and needs only one, judged on its own size rather than the fat box a tilted
  // stick casts on the axes.
  const span = (q, i) => q.max[i] - q.min[i];
  const stick = (q) => {
    const d = [...q.size].sort((x, y) => y - x);
    return d[0] > 3.5 * d[1];
  };
  const faces = (q, r) => {
    let solid = 0;
    for (let i = 0; i < 3; i++) {
      const o = Math.min(q.max[i], r.max[i]) - Math.max(q.min[i], r.min[i]);
      if (o < -EPS) return 0;
      if (o >= 0.5 * Math.min(span(q, i), span(r, i)) - EPS) solid++;
    }
    return solid;
  };
  const loose = [];
  for (const q of parts) {
    const want = stick(q) ? 1 : 2;
    if (!parts.some((r) => r !== q && faces(q, r) >= want)) loose.push(q);
  }
  assert.equal(loose.length, 0, `${loose.length} piece(s) hanging in the air, first `
    + `${loose[0] && loose[0].from} at `
    + `${JSON.stringify(loose[0] && loose[0].min.map((v) => Math.round(v * 10) / 10))}`);
});

check('nothing on the destroyer stands inside a gun barrel', () => {
  // Her after mounts stow trained aft, and a 5"/38 is nearly seven metres of
  // gun on the centreline. Mount 55's barrel ran straight through the Bofors
  // tub on the fantail and mount 53's through the one on the deckhouse: at
  // rest, with nothing training, the guns were inside the anti-aircraft
  // battery. Nothing she carries may sit inside a mount as it is stowed.
  const parts = fletcherParts();
  const by = (name) => parts.filter((q) => q.from === name);
  const guns = by('mainBattery');
  const clash = (a, b) => [0, 1, 2].every((i) =>
    Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]) > 0.05);
  for (const other of ['lightAA', 'depthCharges', 'torpedoes', 'boats', 'railings']) {
    const hits = [];
    for (const a of guns) for (const b of by(other)) if (clash(a, b)) hits.push([a, b]);
    assert.equal(hits.length, 0, `a gun is inside the ${other}: `
      + `${hits.length} pieces, first at `
      + `${JSON.stringify(hits[0] && hits[0][0].min.map((v) => Math.round(v * 10) / 10))}`);
  }
});

check('the destroyer\'s guns and tubes stand where her datasheet says', () => {
  // Her model is laid out on her own stations and the simulation fires from the
  // datasheet's. Let them drift apart and the shells and the fish come out of
  // points in the air beside her.
  const built = buildFletcher();
  const sheet = SHIP_CLASSES.fletcher;
  assert.equal(built.turrets.length, sheet.turrets.length,
    `${built.turrets.length} mounts built against ${sheet.turrets.length} on the sheet`);
  built.turrets.forEach((m, i) => {
    const t = sheet.turrets[i];
    assert.ok(Math.abs(m.position.x - t.x) < 0.15 && Math.abs(m.position.z - t.z) < 0.15,
      `${t.name} is modelled at ${m.position.x.toFixed(1)}, ${m.position.z.toFixed(1)} `
      + `and laid at ${t.x}, ${t.z}`);
  });
  // The mounts aft superfire: 54 stands above 55, and both above the water.
  const y = (i) => built.turrets[i].position.y;
  assert.ok(y(1) > y(0) + 1.5, 'mount 52 does not superfire over 51');
  assert.ok(y(3) > y(4) + 1.5, 'mount 54 does not superfire over 55');
  // And the tubes are on the centreline, in the two gaps in the waist, with
  // nothing of the funnels standing in either of them.
  const banks = sheet.torpedoes.mounts;
  assert.equal(banks.length, 2, `${banks.length} torpedo mounts on the sheet`);
  const tubes = fletcherParts().filter((q) => q.from === 'torpedoes');
  for (const b of banks) {
    assert.equal(b.x, 0, `a bank is laid off the centreline at x ${b.x}`);
    assert.ok(tubes.some((q) => q.min[2] < b.z && q.max[2] > b.z),
      `nothing is modelled at the bank the sheet puts at z ${b.z}`);
  }
  const funnels = fletcherParts().filter((q) => q.from === 'funnels');
  for (const q of tubes) {
    for (const f of funnels) {
      const clash = [0, 1, 2].every((i) => q.min[i] < f.max[i] - 0.05 && q.max[i] > f.min[i] + 0.05);
      assert.ok(!clash, `a torpedo tube is inside the funnel casing at z ${q.min[2].toFixed(1)}`);
    }
  }
});

check('both sides of the destroyer\'s hull face outboard', () => {
  // The same ring-lofted shell as the carrier's, and the same way to get it
  // wrong. Fire at her from all round: every ray must land on a face looking
  // back, and the rays down her centreline must find plating at stem and
  // transom rather than falling through an open ring.
  const built = buildFletcher();
  built.group.updateMatrixWorld(true);
  const meshes = [];
  built.group.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.side = THREE.DoubleSide;
    meshes.push(o);
  });
  const ray = new THREE.Raycaster();
  const normal = new THREE.Matrix3();
  const shots = [];
  // Athwartships at every height there is ship at -- and that has to include
  // everything standing on the deck, not just the shell. Her bridge and all
  // five gunhouses were once lofted inside out, and a sweep that stopped at the
  // deck edge saw none of it: from outside she had a hole where her
  // superstructure should be and you looked through her at the sea.
  for (const side of [-1, 1]) {
    for (let zi = -11; zi <= 11; zi++) {
      for (const y of [-4, -2, 0, 2, 4, 5.5, 7, 8.5, 10, 12, 14]) {
        shots.push([[side * 40, y, (zi / 10) * 51], [-side, 0, 0]]);
      }
    }
  }
  // Straight down, which is how a deck wound the wrong way up shows itself,
  // and straight up, which is how a missing bottom does.
  for (let zi = -10; zi <= 10; zi++) {
    for (const x of [-4, -1.5, 1.5, 4]) {
      shots.push([[x, 40, (zi / 10) * 52], [0, -1, 0]]);
      shots.push([[x, -40, (zi / 10) * 52], [0, 1, 0]]);
    }
  }
  const ENDS = [];
  for (const y of [0, 2, 4]) {
    ENDS.push([[0, y, 120], [0, 0, -1]], [[0, y, -120], [0, 0, 1]]);
  }
  shots.push(...ENDS);
  let hits = 0;
  let ends = 0;
  const backs = [];
  for (const [from, d] of shots) {
    const dir = new THREE.Vector3(d[0], d[1], d[2]);
    ray.set(new THREE.Vector3(from[0], from[1], from[2]), dir);
    const got = ray.intersectObjects(meshes, false);
    if (!got.length || !got[0].face) continue;
    if (Math.abs(from[2]) === 120) ends++;
    hits++;
    const n = got[0].face.normal.clone()
      .applyMatrix3(normal.getNormalMatrix(got[0].object.matrixWorld)).normalize();
    if (n.dot(dir) > 0) backs.push(from.map((v) => Math.round(v)));
  }
  assert.ok(hits > 100, `only ${hits} rays found her at all`);
  assert.equal(ends, ENDS.length,
    `${ENDS.length - ends} ray(s) down the centreline found no plating at her ends`);
  assert.equal(backs.length, 0,
    `${backs.length} of ${hits} rays landed on an inside-out face, first from ${JSON.stringify(backs[0])}`);
});

check('the destroyer has the sheer of a flush-decker', () => {
  // One unbroken deck from stem to transom, rising hard forward: that is what
  // makes her recognisable and it is what a lofting bug takes away first. Loft
  // her topsides to a constant instead of to the sheer and she comes out a
  // slab-sided barge with eight metres of freeboard amidships.
  const fwd = fletcherDeckAt(48);
  const mid = fletcherDeckAt(0);
  const aft = fletcherDeckAt(-50);
  assert.ok(mid > 4.2 && mid < 5.6, `${mid.toFixed(2)} m of freeboard amidships`);
  assert.ok(fwd > mid + 2.0, `her deck rises only ${(fwd - mid).toFixed(2)} m forward`);
  assert.ok(aft < mid && aft > mid - 1.2,
    `her deck edge aft is at ${aft.toFixed(2)} against ${mid.toFixed(2)} amidships`);
});

check('the cruiser is the size the real Cleveland was', () => {
  // 610 ft 1 in on 66 ft 4 in, drawing 24 ft 6 in. Her hull may not be wider
  // than that; her aircraft may, because on the real ship a Seahawk on the
  // catapult has its wingtip out over the side, and so does the accommodation
  // ladder when it is rigged.
  const parts = clevelandParts();
  let z0 = Infinity;
  let z1 = -Infinity;
  let keel = Infinity;
  let half = 0;
  let wide = null;
  for (const q of parts) {
    z0 = Math.min(z0, q.min[2]); z1 = Math.max(z1, q.max[2]);
    keel = Math.min(keel, q.min[1]);
    if (q.from === 'aviation' || q.from === 'fittings') continue;
    const x = Math.max(Math.abs(q.min[0]), Math.abs(q.max[0]));
    if (x > half) { half = x; wide = q; }
  }
  const sheet = SHIP_CLASSES.cleveland;
  assert.ok(Math.abs((z1 - z0) - 185.9) < 2.5,
    `she is ${(z1 - z0).toFixed(1)} m over all and a Cleveland is 185.9`);
  assert.ok(half * 2 < 20.6,
    `she measures ${(half * 2).toFixed(2)} m over her extreme beam of 20.2, `
    + `widest is ${wide.from} at z ${((wide.min[2] + wide.max[2]) / 2).toFixed(1)}`);
  assert.ok(half * 2 > 19.4, `she is only ${(half * 2).toFixed(2)} m in the beam`);
  assert.ok(Math.abs(-keel - sheet.hull.draft) < 0.6,
    `she draws ${(-keel).toFixed(2)} m and the sheet says ${sheet.hull.draft}`);
});

check('the cruiser runs one deck at one height, with no step in it', () => {
  // Her weather deck is flush: it rises forward and does nothing else. It used
  // to break down a whole deck aft, which is what the real ship does and what
  // read on screen as a dent in her quarterdeck.
  let last = clevelandDeckAt(-91);
  let worst = 0;
  let at = 0;
  for (let z = -90; z <= 91; z += 1) {
    const d = clevelandDeckAt(z);
    if (Math.abs(d - last) > worst) { worst = Math.abs(d - last); at = z; }
    last = d;
  }
  assert.ok(worst < 0.25, `her deck steps ${worst.toFixed(2)} m in one metre at z ${at}`);
  const fwd = clevelandDeckAt(60);
  const mid = clevelandDeckAt(0);
  const aft = clevelandDeckAt(-80);
  assert.ok(mid > 7.5 && mid < 10.0, `${mid.toFixed(2)} m of freeboard amidships`);
  assert.ok(fwd > mid + 0.8, `her deck rises only ${(fwd - mid).toFixed(2)} m forward`);
  assert.ok(mid - aft < 1.2 && mid - aft > 0,
    `her deck falls ${(mid - aft).toFixed(2)} m aft, which is a step and not a sheer`);
});

check('the cruiser is one connected ship, with nothing left in mid-air', () => {
  const EPS = 0.12;
  const parts = clevelandParts();
  assert.ok(parts.length > 1800, `she should be built of more than ${parts.length} pieces`);
  const n = parts.length;
  const hits = (a, b) => {
    for (let i = 0; i < 3; i++) {
      if (a.min[i] - EPS > b.max[i] || b.min[i] - EPS > a.max[i]) return false;
    }
    return true;
  };
  const up = [...Array(n).keys()];
  const find = (k) => (up[k] === k ? k : (up[k] = find(up[k])));
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) if (hits(parts[a], parts[b])) up[find(a)] = find(b);
  }
  const bodies = new Map();
  for (let a = 0; a < n; a++) {
    const r = find(a);
    if (!bodies.has(r)) bodies.set(r, []);
    bodies.get(r).push(a);
  }
  let adrift = null;
  if (bodies.size > 1) {
    let main = null;
    for (const [r, m] of bodies) if (!main || m.length > bodies.get(main).length) main = r;
    for (const [r, m] of bodies) {
      if (r !== main) {
        adrift = `${parts[m[0]].from} at `
          + `${JSON.stringify(parts[m[0]].min.map((v) => Math.round(v * 10) / 10))}`;
        break;
      }
    }
  }
  assert.equal(bodies.size, 1, `${bodies.size - 1} piece(s) adrift, one is ${adrift}`);
});

check('nothing on the cruiser stands inside a gun barrel', () => {
  // Her turrets stow trained fore and aft and a 6"/47 is eleven metres of gun
  // from the trunnion, so the centreline ahead of turret 1 and abaft turret 4
  // belongs to them.
  const parts = clevelandParts();
  const by = (name) => parts.filter((q) => q.from === name);
  const guns = by('mainBattery');
  const clash = (a, b) => [0, 1, 2].every((i) =>
    Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]) > 0.05);
  for (const other of ['lightAA', 'secondary', 'aviation', 'boats', 'railings']) {
    const hits = [];
    for (const a of guns) for (const b of by(other)) if (clash(a, b)) hits.push([a, b]);
    assert.equal(hits.length, 0, `a gun is inside the ${other}: ${hits.length} pieces, `
      + `first at ${JSON.stringify(hits[0] && hits[0][0].min.map((v) => Math.round(v * 10) / 10))}`);
  }
});

check('nothing on the cruiser is buried inside anything else', () => {
  // Her mounts have to stand on her, not in her. The forward twin 5" was
  // inside the navigating bridge, both waist mounts were inside the boats and
  // the ventilators and the Bofors tubs, and the after one was inside the
  // second tier of the after superstructure. A mount sinks its barbette skirt
  // into the deck it stands on and no further.
  const DEEP = 0.35;
  const parts = clevelandParts();
  // A wire or a barrel is a stick: tilt one and the axis-aligned box it casts
  // is far larger than the stick, so judging it by that box judges a shadow.
  const stick = (q) => {
    const d = [...q.size].sort((x, y) => y - x);
    return d[0] > 3.5 * d[1];
  };
  const solid = parts.filter((q) => !stick(q));
  const ov = (a, b, i) => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]);
  const worst = [];
  for (const a of solid) {
    // A turret's barbette goes down through the deck to the shell room, so the
    // hull is the one thing the main battery is allowed to be inside.
    if (a.from !== 'secondary' && a.from !== 'lightAA') continue;
    for (const b of solid) {
      if (b.from === a.from) continue;
      const deep = Math.min(ov(a, b, 0), ov(a, b, 1), ov(a, b, 2));
      if (deep > DEEP) {
        worst.push(`${a.from} at `
          + `(${((a.min[0] + a.max[0]) / 2).toFixed(0)}, ${((a.min[2] + a.max[2]) / 2).toFixed(0)})`
          + ` is ${deep.toFixed(2)} m inside ${b.from}`);
      }
    }
  }
  assert.equal(worst.length, 0, `${worst.length} buried piece(s): ${worst[0]}`);
});

check('the cruiser\'s superstructure sits down on her deck, with no daylight under it', () => {
  // Her deck has sheer, so a deckhouse lofted from one constant height is
  // buried at one end of itself and standing clear of the planking at the
  // other -- which is exactly what she was doing: a hand's breadth of open air
  // running the whole length of her superstructure, aft.
  const house = clevelandParts()
    .filter((p) => p.from === 'bridge')
    .sort((a, b) => (b.max[2] - b.min[2]) - (a.max[2] - a.min[2]))[0];
  assert.ok(house && house.max[2] - house.min[2] > 60,
    'could not find the long deckhouse in her bridge');
  for (let z = house.min[2]; z <= house.max[2]; z += 2) {
    const deck = clevelandDeckAt(z);
    assert.ok(house.min[1] <= deck,
      `the deckhouse foot is at ${house.min[1].toFixed(2)} and the deck under it `
      + `at ${deck.toFixed(2)}, at z ${z.toFixed(0)}`);
  }
});

check('nothing on the cruiser is rigged over her side below her deck', () => {
  // An accommodation ladder down her side is a harbour rig and she is at sea;
  // more to the point, anything hanging outboard of the shell and below the
  // deck line reads as a piece of her that has come adrift.
  const bad = [];
  for (const p of clevelandParts()) {
    if (p.from === 'hull') continue;
    const z = (p.min[2] + p.max[2]) / 2;
    const out = Math.max(Math.abs(p.min[0]), Math.abs(p.max[0]));
    if (out <= clevelandHalfDeck(z)) continue;
    if (p.min[1] >= clevelandDeckAt(z) - 0.5) continue;
    bad.push(`${p.from} at x ${out.toFixed(1)} z ${z.toFixed(0)} `
      + `hanging to y ${p.min[1].toFixed(1)}`);
  }
  assert.equal(bad.length, 0, `over her side: ${bad[0]}`);
});

check('the cruiser trains her catapults out and shoots on the simulation\'s clock', () => {
  const built = buildCleveland();
  const deck = built.group.userData.deck;
  const cats = deck.cats;
  assert.equal(cats.length, 2, `she has ${cats.length} catapults`);
  const trained = () => cats.map((c) => Math.abs(c.group.rotation.y));
  built.group.userData.step(0);
  assert.ok(trained().every((a) => a < 0.2), 'she stows her catapults trained out');

  // The order: both train out, and the aeroplane leaves the track at exactly
  // the moment the simulation puts her flight on the plot -- otherwise there
  // is an aeroplane in the sky with one still sitting on the cradle.
  built.group.userData.launch(0);
  let away = null;
  let widest = 0;
  for (let t = 0; t <= 20; t += 1 / 60) {
    built.group.userData.step(t);
    widest = Math.max(widest, Math.min(...trained()));
    if (deck.airborne && away === null) away = t;
  }
  assert.ok(widest > 1.0, `her catapults only trained to ${widest.toFixed(2)} rad`);
  // And they come back in on their own, once the aeroplane is away: nothing
  // has to tell her the evolution is over.
  assert.ok(trained().every((a) => a < 0.2),
    `her catapults were still trained out to ${Math.min(...trained()).toFixed(2)} rad `
    + 'long after the shot');
  const want = SHIP_CLASSES.cleveland.planes.deckRun;
  assert.ok(away !== null && Math.abs(away - want) < 0.2,
    `she was off the track at ${away === null ? 'never' : away.toFixed(2)}s `
    + `against ${want}s on the plot`);

  // And afterwards she is found as she started: catapults in, car home, the
  // aeroplane back on her cradle.
  built.group.userData.recover();
  built.group.userData.step(30);
  assert.ok(trained().every((a) => a < 0.2), 'her catapults stayed trained out');
  for (const c of cats) {
    assert.ok(!c.gone && c.plane.visible, 'she never got her aeroplane back');
  }
});

check('the cruiser launches her scouts, and nothing flies before she has shot it off', () => {
  const state = createState(generateWorld(7717, 'open_ocean'), { mode: 'deathmatch' });
  const ship = addShip(state, {
    name: 'Cleveland', classId: 'cleveland', team: 0, index: 0,
  });
  ship.aimX = ship.x + 4000;
  ship.aimZ = ship.z + 4000;
  assert.ok(launchStrike(state, ship), 'she would not launch at all');
  assert.equal(state.planes.length, 0, 'an aeroplane appeared before the shot');
  const run = SHIP_CLASSES.cleveland.planes.deckRun;
  for (let i = 0; i < Math.ceil((run - 0.5) / DT); i++) step(state, DT);
  assert.equal(state.planes.length, 0, 'she flew one off early');
  for (let i = 0; i < Math.ceil(1.0 / DT); i++) step(state, DT);
  assert.ok(state.planes.length > 0, 'nothing left the catapult at all');
  // A cruiser puts up scouts, not a torpedo strike: she has no fish aboard.
  assert.ok(state.planes.every((p) => p.torp === 0),
    'her floatplanes went off carrying torpedoes');
});

check('the cruiser\'s turrets stand where her datasheet says', () => {
  const built = buildCleveland();
  const sheet = SHIP_CLASSES.cleveland;
  assert.equal(built.turrets.length, sheet.turrets.length,
    `${built.turrets.length} turrets built against ${sheet.turrets.length} on the sheet`);
  built.turrets.forEach((m, i) => {
    const t = sheet.turrets[i];
    assert.ok(Math.abs(m.position.x - t.x) < 0.2 && Math.abs(m.position.z - t.z) < 0.2,
      `${t.name} is modelled at ${m.position.x.toFixed(1)}, ${m.position.z.toFixed(1)} `
      + `and laid at ${t.x}, ${t.z}`);
  });
  // Fore and aft, the inner turret superfires over the outer one.
  const y = (i) => built.turrets[i].position.y;
  assert.ok(y(1) > y(0) + 2.0, 'turret 2 does not superfire over turret 1');
  assert.ok(y(2) > y(3) + 2.0, 'turret 3 does not superfire over turret 4');
});

check('both sides of the cruiser\'s hull face outboard', () => {
  const built = buildCleveland();
  built.group.updateMatrixWorld(true);
  const meshes = [];
  built.group.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.side = THREE.DoubleSide;
    meshes.push(o);
  });
  const ray = new THREE.Raycaster();
  const normal = new THREE.Matrix3();
  const shots = [];
  for (const side of [-1, 1]) {
    for (let zi = -11; zi <= 11; zi++) {
      for (const y of [-6, -3, 0, 3, 6, 8, 10, 13, 16, 20]) {
        shots.push([[side * 60, y, (zi / 10) * 84], [-side, 0, 0]]);
      }
    }
  }
  for (let zi = -10; zi <= 10; zi++) {
    for (const x of [-7, -2.5, 2.5, 7]) {
      shots.push([[x, 70, (zi / 10) * 86], [0, -1, 0]]);
      shots.push([[x, -60, (zi / 10) * 86], [0, 1, 0]]);
    }
  }
  const ENDS = [];
  for (const y of [0, 3, 6]) {
    ENDS.push([[0, y, 200], [0, 0, -1]], [[0, y, -200], [0, 0, 1]]);
  }
  shots.push(...ENDS);
  let hits = 0;
  let ends = 0;
  const backs = [];
  for (const [from, d] of shots) {
    const dir = new THREE.Vector3(d[0], d[1], d[2]);
    ray.set(new THREE.Vector3(from[0], from[1], from[2]), dir);
    const got = ray.intersectObjects(meshes, false);
    if (!got.length || !got[0].face) continue;
    if (Math.abs(from[2]) === 200) ends++;
    hits++;
    const n = got[0].face.normal.clone()
      .applyMatrix3(normal.getNormalMatrix(got[0].object.matrixWorld)).normalize();
    if (n.dot(dir) > 0) backs.push(from.map((v) => Math.round(v)));
  }
  assert.ok(hits > 150, `only ${hits} rays found her at all`);
  assert.equal(ends, ENDS.length,
    `${ENDS.length - ends} ray(s) down the centreline found no plating at her ends`);
  assert.equal(backs.length, 0,
    `${backs.length} of ${hits} rays landed on an inside-out face, `
    + `first from ${JSON.stringify(backs[0])}`);
});

check('her lifts run the whole way between the two decks', () => {
  // Three of them, and each must actually reach both ends: a lift that stops
  // short leaves a hole in the flight deck with a platform hanging in it, and
  // one that overruns puts an aircraft through the hangar deck.
  const built = buildEnterprise();
  assert.equal(built.lifts.length, 3, `${built.lifts.length} lifts built`);
  const top = built.flightDeckY;
  const bottom = built.deckY;
  const seen = built.lifts.map(() => ({ hi: -Infinity, lo: Infinity }));
  for (let t = 0; t < 120; t += 0.25) {
    stepLifts(built.lifts, t);
    built.lifts.forEach((l, i) => {
      const y = l.group.position.y;
      assert.ok(y <= top + 0.01 && y >= bottom - 0.01,
        `lift ${i} ran to ${y.toFixed(2)}, outside ${bottom} to ${top}`);
      seen[i].hi = Math.max(seen[i].hi, y);
      seen[i].lo = Math.min(seen[i].lo, y);
    });
  }
  seen.forEach((r, i) => {
    assert.ok(Math.abs(r.hi - top) < 0.05, `lift ${i} never came up level with the deck`);
    assert.ok(r.hi - r.lo > (top - bottom) * 0.85, `lift ${i} only travelled ${(r.hi - r.lo).toFixed(1)} m`);
  });
  // And they are staggered: never all three at the same height.
  stepLifts(built.lifts, 0);
  const ys = built.lifts.map((l) => +l.group.position.y.toFixed(2));
  assert.ok(new Set(ys).size > 1, `all three lifts sit at ${ys[0]} together`);
});

check('nothing is left hanging over an open lift well', () => {
  // A lift well is a hole through the flight deck, and everything painted or
  // rigged on that deck has to be cut round it -- the centreline stripe, the
  // arresting wires, the barriers. Miss one and it stays stretched across the
  // opening in mid-air the moment the platform goes down, which is exactly
  // what it looks like. Anything riding the platform itself is allowed.
  const wells = liftZs();
  const over = [];
  for (const q of enterpriseParts()) {
    if (q.moving) continue;
    if (q.min[1] < FD - 0.1 || q.min[1] > FD + 3) continue;
    for (const lz of wells) {
      const ox = Math.min(LIFT_HW, q.max[0]) - Math.max(-LIFT_HW, q.min[0]);
      const oz = Math.min(lz + LIFT_HW, q.max[2]) - Math.max(lz - LIFT_HW, q.min[2]);
      if (ox > 0.3 && oz > 0.3) {
        over.push([q.min[0], q.min[1], q.min[2]].map((v) => Math.round(v * 10) / 10));
        break;
      }
    }
  }
  assert.equal(over.length, 0,
    `${over.length} piece(s) span an open well, first at ${JSON.stringify(over[0])}`);
});

check('an air group is landed on something she can actually embark', () => {
  const cls = SHIP_CLASSES.enterprise;
  const spec = cls.planes.group;
  const sum = (g) => g.fighters + g.dive + g.torpedo;

  // Nothing asked for: her datasheet's own loadout.
  assert.deepEqual(normaliseAirGroup(cls, null), defaultAirGroup(cls));
  assert.equal(sum(defaultAirGroup(cls)), spec.total);

  // More than she has hangar for is trimmed to the hangar.
  const big = normaliseAirGroup(cls, { fighters: 8, dive: 8, torpedo: 8 });
  assert.ok(sum(big) <= spec.total, `trimmed to ${sum(big)}, over ${spec.total}`);
  assert.ok(big.dive + big.torpedo >= spec.minStrike, 'trimmed away her strike aircraft');

  // A group with nothing that can hit a ship gets strike aircraft back.
  const allFighters = normaliseAirGroup(cls, { fighters: 12, dive: 0, torpedo: 0 });
  assert.ok(allFighters.dive + allFighters.torpedo >= spec.minStrike,
    'sailed with no strike aircraft at all');
  assert.ok(sum(allFighters) <= spec.total);

  // Rubbish, negative and out-of-range numbers all land somewhere legal.
  for (const junk of [{}, { fighters: -5, dive: 99, torpedo: NaN },
    { fighters: '3', dive: 2.7, torpedo: null }]) {
    const g = normaliseAirGroup(cls, junk);
    for (const k of ['fighters', 'dive', 'torpedo']) {
      assert.ok(Number.isInteger(g[k]) && g[k] >= spec.min[k] && g[k] <= spec.max[k],
        `${k} came out ${g[k]} from ${JSON.stringify(junk)}`);
    }
    assert.ok(sum(g) <= spec.total && g.dive + g.torpedo >= spec.minStrike);
  }

  // And a ship carries what she was given, not what the class says.
  const state = createState(generateWorld(4242, 'open_ocean'), { mode: 'deathmatch' });
  const ship = addShip(state, {
    name: 'Big E', classId: 'enterprise', team: 0, index: 0,
    airGroup: { fighters: 0, dive: 2, torpedo: 8 },
  });
  assert.deepEqual(ship.airGroup, { fighters: 0, dive: 2, torpedo: 8 });
  // A strike off her flies what she is carrying: fish, not a fixed four.
  ship.aimX = ship.x + 4000; ship.aimZ = ship.z + 4000;
  assert.ok(launchStrike(state, ship), 'she would not launch');
  // Nothing is in the air yet: she has to get down the deck first.
  assert.equal(state.planes.length, 0, 'an aeroplane appeared before she had moved');
  for (let i = 0; i < Math.ceil((DECK_RUN + 0.5) / DT); i++) step(state, DT);
  const pkg = state.planes.find((p) => p.role === 'torpedo');
  assert.ok(pkg, 'she flew off no torpedo bombers at all');
  assert.ok(pkg.torp > pkg.bomb, `flew ${pkg.torp} torpedo to ${pkg.bomb} bomb`);
});

check('a carrier is found with a clear deck and her aircraft on the lifts', () => {
  // A flight deck with a deck park on it is a flight deck she cannot land on
  // and cannot work her lifts through, and it is not how a carrier is found
  // lying in her berth. Nothing with aircraft paint on it may sit above the
  // flight deck unless it is riding a platform.
  const built = buildEnterprise();
  // Work the deck first: unstepped, the ready aircraft is still at the origin
  // and the check would pass without ever looking at where she really stands.
  built.group.userData.step(3);
  built.group.updateMatrixWorld(true);
  const PAINT = new Set(['33475e', '9aa4ad', '24282c', 'd9dde2']);
  const lifts = built.lifts.map((l) => l.group).concat(built.deckPlane);
  let onDeck = 0;
  let riding = 0;
  let below = 0;
  built.group.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.color) return;
    if (!PAINT.has(o.material.color.getHexString())) return;
    o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    let rides = false;
    for (let n = o; n; n = n.parent) if (lifts.includes(n)) rides = true;
    if (rides) riding++;
    else if (b.min.y > built.flightDeckY - 0.5) onDeck++;
    else below++;
  });
  assert.equal(onDeck, 0, `${onDeck} aircraft mesh(es) ranged on the flight deck`);
  assert.ok(riding > 0, 'no aircraft on her lifts at all');
  // The ready aircraft stands on the after lift, not on the deck beside it.
  const ready = new THREE.Box3().setFromObject(built.deckPlane);
  const aft = built.lifts[built.lifts.length - 1].group;
  assert.ok(Math.abs(ready.min.y - aft.position.y) < 1.2,
    `the ready aircraft sits ${(ready.min.y - aft.position.y).toFixed(1)} m off the lift`);
  assert.ok(below > 0, 'nothing struck below in her hangar');
  // And what is on a lift must fit the platform rather than hang over the well.
  built.lifts.forEach((l, i) => {
    const b = new THREE.Box3().setFromObject(l.group);
    const halfX = Math.max(Math.abs(b.min.x), Math.abs(b.max.x));
    const halfZ = Math.max(Math.abs(b.min.z - l.group.position.z),
      Math.abs(b.max.z - l.group.position.z));
    assert.ok(halfX <= LIFT_HW + 0.2 && halfZ <= LIFT_HW + 0.2,
      `lift ${i} is loaded ${halfX.toFixed(1)} x ${halfZ.toFixed(1)} over a ${LIFT_HW} platform`);
  });
});

check('a launch runs the whole evolution, hangar to bow', () => {
  // Pressing the strike button should show what a launch actually is: the after
  // lift takes her down to the hangar and brings her up, she taxis forward off
  // it under her own power and lines up, she is held on the brakes while the
  // engine is run up, and then she rolls. Each of those has to happen, in that
  // order, or it is an aeroplane teleporting off a ship.
  const built = buildEnterprise();
  const plane = built.deckPlane;
  const aft = built.lifts[built.lifts.length - 1].group;
  built.group.userData.step(0);
  built.group.userData.launch(0);
  const pr = built.group.userData.deck.profile;
  const END = 7.6 + pr.rows.length * pr.dt;

  const track = [];
  for (let t = 0; t <= END; t += 0.05) {
    built.group.userData.step(t);
    track.push({ t, y: plane.position.y, z: plane.position.z, lift: aft.position.y });
  }

  // Down to the hangar, and the aeroplane goes with the lift.
  const low = Math.min(...track.map((s) => s.lift));
  assert.ok(low < HANGAR + 1.5, `the lift only went down to ${low.toFixed(1)}`);
  const bottom = track.find((s) => s.lift === low);
  assert.ok(Math.abs(bottom.y - bottom.lift) < 1.2, 'she did not ride the lift down');
  assert.ok(bottom.t < 2.0, `the lift reached the hangar at ${bottom.t.toFixed(1)} s`);

  // Back up to the flight deck before she goes anywhere.
  const upAgain = track.find((s) => s.t > 2 && s.lift > FD - 0.2);
  assert.ok(upAgain && upAgain.t < 5, 'the lift never came back up');

  // Taxied FORWARD off the lift, not dragged aft: she is a fifteen-thousand
  // pound aeroplane under her own power, and she never goes backwards.
  const onLift = track.find((s) => s.t > 3.6).z;
  const lined = track.find((s) => s.t > 6.4);
  assert.ok(lined.z > onLift + 12,
    `she taxied from ${onLift.toFixed(0)} to ${lined.z.toFixed(0)}, which is not forward`);
  for (let i = 1; i < track.length; i++) {
    assert.ok(track[i].z >= track[i - 1].z - 0.01,
      `she went backwards at ${track[i].t.toFixed(1)} s`);
  }

  // Then the run, and it is a run: she accelerates, so the ground she covers in
  // the last second of it is well over what she covered in the first.
  const gained = (t0, t1) => {
    const a2 = track.find((s) => s.t >= t0);
    const b2 = track.find((s) => s.t >= t1);
    return b2.z - a2.z;
  };
  const early = gained(8.0, 9.0);
  const late = gained(13.5, 14.5);
  assert.ok(late > early * 2.5,
    `she made ${early.toFixed(1)} m in her first second and ${late.toFixed(1)} in her last`);

  // And off the bow, climbing.
  const last = track[track.length - 1];
  assert.ok(last.z > 140, `she left the deck at z ${last.z.toFixed(0)}`);
  assert.ok(last.y > FD + 8, `she was still at ${last.y.toFixed(1)} m going over the bow`);

  // Afterwards she is airborne and stays airborne: she does not vanish and she
  // does not reappear on the lift behind her. The scene flies her from there.
  built.group.userData.step(END + 4);
  const wasAt = { y: plane.position.y, z: plane.position.z };
  built.group.userData.step(END + 40);
  assert.equal(plane.position.y, wasAt.y, 'the deck put her back after she had gone');
  assert.equal(plane.position.z, wasAt.z, 'the deck put her back after she had gone');
  // And when whatever was flying her is done, she comes home to the lift.
  built.group.userData.recover();
  built.group.userData.step(END + 41);
  assert.ok(Math.abs(plane.position.y - (aft.position.y + 0.34)) < 0.6,
    'she did not come back to the lift when she was recovered');
});


check('her aircraft are the size the real ones were', () => {
  // These are looked at from a couple of metres away on a lift and ridden off
  // the deck, so they are built to their own dimensions rather than to whatever
  // looked right. Folded spans are what decides how many strike below.
  const THREE_ = THREE;
  const measure = (type, folded) => {
    const g = new THREE_.Group();
    __aircraft[type](g, 0, 0, 0, 0, folded);
    g.updateMatrixWorld(true);
    // Only the state she is actually in: both sets of wings are built.
    g.traverse((o) => {
      if (!o.isMesh) return;
      for (let n = o; n; n = n.parent) if (!n.visible) { o.userData.hidden = true; return; }
    });
    const b = new THREE_.Box3();
    g.traverse((o) => {
      if (o.isMesh && !o.userData.hidden) b.expandByObject(o);
    });
    return { len: b.max.z - b.min.z, span: b.max.x - b.min.x, high: b.max.y - b.min.y };
  };
  // Length, span and height as built, against the aeroplane herself. A metre
  // and a half either way is the tolerance -- the spinner and the hook are
  // included here and are not in every published figure.
  const want = {
    wildcat: { len: 8.8, span: 4.4, high: 3.6, folded: true },
    dauntless: { len: 10.1, span: 12.7, high: 4.1, folded: false },
    avenger: { len: 12.2, span: 16.5, high: 4.7, folded: false },
  };
  for (const [type, w] of Object.entries(want)) {
    const m = measure(type, w.folded);
    for (const k of ['len', 'span', 'high']) {
      assert.ok(Math.abs(m[k] - w[k]) < 1.5,
        `${type} ${k} is ${m[k].toFixed(1)} m where she should be ${w[k]}`);
    }
  }
  // And folded, the Avenger goes down the well she has to fit: 5.6 m across a
  // 14.8 m lift, which is the whole reason the sto-wing exists.
  const stowed = measure('avenger', true);
  assert.ok(Math.abs(stowed.span - 5.64) < 1.0,
    `an Avenger folds to ${stowed.span.toFixed(1)} m, not 5.6`);
  assert.ok(stowed.span < LIFT_HW * 2, 'she does not fit on her own lift folded');
});

check('she does not take off with her wings folded', () => {
  // A carrier aeroplane is struck below folded and cannot fly that way. She
  // spreads on the lift, on her way up, and she is spread for the whole of the
  // taxi, the run-up and the deck run -- or the wing she is flying on is lying
  // along her own fuselage.
  const built = buildEnterprise();
  const wings = built.deckPlane.children
    .map((c) => c.userData && c.userData.wings).find(Boolean)
    || (built.group.userData.deck.plane || {}).wings;
  assert.ok(wings && wings.stowed && wings.spread, 'she has only one set of wings');

  built.group.userData.step(0);
  assert.ok(wings.stowed.visible && !wings.spread.visible,
    'she is standing on the lift with her wings spread');

  built.group.userData.launch(0);
  // The evolution is paced to end when the simulation puts her squadron up, so
  // the phases are asked for rather than counted in seconds.
  const ph = deckPhases(built.group.userData.deck);
  const seen = [];
  for (let t = 0; t <= ph.launch; t += 0.05) {
    built.group.userData.step(t);
    seen.push({ t, out: wings.spread.visible, in: wings.stowed.visible });
  }
  assert.ok(seen.every((s) => s.out !== s.in), 'both sets of wings were showing at once');
  // Folded while she is below, spread by the time she starts to move aft.
  assert.ok(seen.filter((s) => s.t < ph.down * 1.6).every((s) => !s.out),
    'she spread her wings in the hangar');
  assert.ok(seen.filter((s) => s.t > ph.taxied).every((s) => s.out),
    'she taxied or ran with her wings folded');

  // And struck below again when the squadron is home.
  built.group.userData.recover();
  assert.ok(wings.stowed.visible && !wings.spread.visible,
    'she was struck below with her wings still spread');
});

check('her squadron goes up the moment she leaves the deck', () => {
  // The evolution on screen and the tick that puts her flights in the air have
  // to be the same moment. They were four seconds apart: for those four seconds
  // three squadron markers flew off the bow while the aeroplane you were
  // watching was still on the planking -- and the aeroplane, handed over before
  // her squadron existed, was stood back on the lift, which is an aircraft that
  // takes off and teleports home.
  const built = buildEnterprise();
  const deck = built.group.userData.deck;
  built.group.userData.launch(0);
  let airborneAt = null;
  for (let t = 0; t <= 40; t += 1 / 60) {
    built.group.userData.step(t);
    if (deck.airborne) { airborneAt = t; break; }
  }
  assert.ok(airborneAt !== null, 'she never left the deck at all');
  assert.ok(Math.abs(airborneAt - DECK_RUN) < 0.25,
    `she leaves the deck at ${airborneAt.toFixed(2)} s and her squadron goes up at ${DECK_RUN}`);
  assert.equal(deckPhases(deck).launch, DECK_RUN, 'the evolution is not paced to the deck run');
  // And she must not jump at the handover: where the deck run left her is where
  // whatever flies her next has to pick her up.
  built.group.userData.launch(0);
  let prev = null;
  let worst = 0;
  for (let t = 0; t <= DECK_RUN + 0.5; t += 1 / 60) {
    built.group.userData.step(t);
    const p2 = built.deckPlane.position.clone();
    if (prev) worst = Math.max(worst, p2.distanceTo(prev));
    prev = p2;
  }
  assert.ok(worst < 3.0, `she jumped ${worst.toFixed(1)} m in one frame of her own launch`);
});

check('her wheels come up once she is off the deck', () => {
  // An aeroplane that carries her undercarriage out to the target is an
  // aeroplane nobody would fly. It goes up as she unsticks and comes down
  // again when she is struck below.
  const built = buildEnterprise();
  const deck = built.group.userData.deck;
  const plane = built.deckPlane;
  // The propeller is turning throughout, and a blade pointing down is lower
  // than a wheel: stop it before measuring anything, or what gets measured is
  // the propeller.
  if (deck.plane.prop) deck.plane.prop.visible = false;
  // How far the lowest thing on her hangs below her own datum, which is where
  // her tyres touch the deck.
  const drop = () => {
    // Level her first: she rotates nose-up as she goes, and a tail swung down
    // by the climb attitude measures as an undercarriage that never came up.
    // Then look at the tyres and nothing else -- the wells they come up into
    // are part of the airframe and stay where they are.
    plane.rotation.set(0, 0, 0);
    plane.updateMatrixWorld(true);
    let lowest = Infinity;
    plane.traverse((o) => {
      if (!o.isMesh || !o.material.color || o.material.color.getHexString() !== '24282c') return;
      for (let n = o; n; n = n.parent) if (!n.visible) return;
      lowest = Math.min(lowest, new THREE.Box3().setFromObject(o).min.y);
    });
    assert.ok(Number.isFinite(lowest), 'she has no wheels at all');
    return plane.position.y - lowest;
  };
  built.group.userData.step(0);
  const stood = drop();

  // Measured while she is taxiing: wings already out, and she is not yet
  // rocking against the brakes, so the only thing that can move is the gear.
  built.group.userData.launch(0);
  const pr = deck.profile;
  const END = 7.6 + pr.rows.length * pr.dt;
  built.group.userData.step(6.0);
  const taxi = drop();
  let onDeck = 0;
  for (let t = 4.5; t <= 7.4; t += 0.1) {
    built.group.userData.step(t);
    onDeck = Math.max(onDeck, Math.abs(drop() - taxi));
  }
  assert.ok(onDeck < 0.05, `her wheels moved by ${onDeck.toFixed(2)} m while taxiing`);

  built.group.userData.step(END);
  const flying = drop();
  assert.ok(taxi - flying > 0.65,
    `her wheels only came up ${(taxi - flying).toFixed(2)} m`);
  assert.ok(deck.airborne, 'she never got airborne');

  built.group.userData.recover();
  built.group.userData.step(40);
  assert.ok(Math.abs(drop() - stood) < 0.05, 'her wheels stayed up when she came home');
});

check('only one aircraft uses the deck at a time', () => {
  // The lift has to fetch her, she has to taxi aft and run up: the deck is
  // busy for the whole of that, and a second squadron cannot go until it is
  // clear. Otherwise two aeroplanes occupy the same strip of planking.
  const state = createState(generateWorld(4242, 'open_ocean'), { mode: 'deathmatch' });
  const ship = addShip(state, { name: 'Big E', classId: 'enterprise', team: 0, index: 0 });
  ship.aimX = ship.x + 5000; ship.aimZ = ship.z + 5000;
  assert.ok(launchStrike(state, ship), 'she would not launch at all');
  assert.ok(!launchStrike(state, ship), 'a second squadron went while the deck was busy');
  // Wind the clock past the evolution and the next one can go.
  ship.deckBusy = 0;
  assert.ok(launchStrike(state, ship), 'she would not launch once the deck was clear');
  assert.ok(ship.deckBusy > 10, 'the deck was not marked busy for the launch');
});

check('a strike is not flown at a target under her own bows', () => {
  // A squadron aimed on top of the ship reaches its target on the tick it is
  // launched and is recovered on the next one -- the aeroplane the player just
  // watched leave the deck vanishes under him. There is a minimum range for a
  // strike, and inside it she does not launch at all.
  const state = createState(generateWorld(4242, 'open_ocean'), { mode: 'deathmatch' });
  const ship = addShip(state, { name: 'Big E', classId: 'enterprise', team: 0, index: 0 });
  ship.aimX = ship.x + 300; ship.aimZ = ship.z;
  assert.ok(!launchStrike(state, ship), 'she flew a strike at a target alongside');
  assert.equal(ship.deckBusy, 0, 'the deck was fouled by a strike that never went');
  // And she is not sulking: give the target sea room and she goes.
  ship.aimX = ship.x + 5000; ship.aimZ = ship.z;
  assert.ok(launchStrike(state, ship), 'she would not launch at a proper range');
});

check('nothing but the launching aircraft is ever on the runway', () => {
  // A lift at the top is part of the flight deck, so an aeroplane parked on one
  // is an aeroplane on the runway. Only the after lift carries one, and it is
  // the one that goes.
  const built = buildEnterprise();
  const PAINT = new Set(['33475e', '9aa4ad', '24282c', 'd9dde2']);
  const carried = built.lifts.map((l) => {
    let n = 0;
    l.group.traverse((o) => {
      if (o.isMesh && o.material && o.material.color
        && PAINT.has(o.material.color.getHexString())) n++;
    });
    return n;
  });
  assert.deepEqual(carried, [0, 0, 0],
    `the lifts have aircraft welded into them: ${JSON.stringify(carried)}`);
});

check('a ship that is placed does not rule a line across the sea', () => {
  // The wake is laid in the world: each piece of it stays where she made it.
  // That is right while she is sailing and wrong the moment she is put
  // somewhere -- at the start of a battle, or when a view of her is built
  // fresh. Joining the piece she laid before to where she now is drew a dead
  // straight ribbon across the map, and a ribbon four kilometres long and
  // eighty metres wide comes out as a hard bright line ruled over the water.
  const scene = new THREE.Scene();
  const wake = new Wake(scene, { length: 262, beam: 26, ocean: null });
  const spread = () => {
    const p = wake.pts;
    let most = 0;
    for (let i = 1; i < p.length; i++) {
      most = Math.max(most, Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z));
    }
    return most;
  };
  // Steaming north at a fair clip, laying a proper trail.
  let z = 0;
  for (let i = 0; i < 400; i++) { z += 15 * (1 / 30); wake.update(1 / 30, 0, z, 0, 15, null); }
  assert.ok(wake.pts.length > 4, 'she laid no trail at all');
  const sailed = spread();
  assert.ok(sailed < 40, `sailing, her trail steps ${sailed.toFixed(0)} m at a time`);

  // Now put her four kilometres away, the way a battle start does.
  wake.update(1 / 30, 4000, 4000, 0, 15, null);
  const after = spread();
  assert.ok(after < 40,
    `placed, her trail spans ${after.toFixed(0)} m between two pieces -- that is the line`);
  // And she picks up laying a normal trail again from where she was put.
  for (let i = 0; i < 200; i++) { z += 15 * (1 / 30); wake.update(1 / 30, 4000, 4000 + z, 0, 15, null); }
  assert.ok(wake.pts.length > 4, 'she never started a new trail');
  assert.ok(spread() < 40, 'her new trail is broken too');
});

check('the sea never leaves the hull', () => {
  // The complaint this exists for: a carrier dipping in and out of the water
  // far enough to put her propellers in the air. Damping her heave caused it --
  // the sea went on moving eleven metres while she moved two, so the water left
  // her. What she rides now is the mean level under her whole waterplane, which
  // is a real water level, and it can never get further from her than the sea
  // itself is rough.
  const sea = Object.create(Ocean.prototype);
  const amp = 3.2 * (0.4 + 3 * 0.28) * AMP_SCALE;
  sea.material = { uniforms: { uAmp: { value: amp }, uSteep: { value: 1 }, uTime: { value: 0 } } };
  const dt = 1 / 30;
  for (const [id, cls] of Object.entries(SHIP_CLASSES)) {
    const v = new Seakeeping(cls.hull);
    let worst = 0;
    for (let t = 0; t < 200; t += dt) {
      const att = sea.attitude(1200, -800, 0.7, cls.hull.length, cls.hull.beam, t);
      v.step(att, dt);
      if (t < 30) continue;
      // How far the water at her middle gets from where her waterline sits.
      worst = Math.max(worst, Math.abs(sea.heightAt(1200, -800, t) - v.heave));
    }
    // She must keep a good half of her draft in the water at the worst of it,
    // or there is daylight under her and her screws are turning in air.
    assert.ok(worst < cls.hull.draft * 0.55,
      `${id} draws ${cls.hull.draft} m and the sea gets ${worst.toFixed(1)} m from her waterline`);
  }
});

check('a hull swings on her own period rather than lying on the water', () => {
  // The sea does not set a ship's angle, it pushes her towards one. Knock her
  // over in flat water and let go: she should roll back through upright, past
  // it, and go on swinging -- at her own period, and dying away, not snapping
  // back like a needle.
  const she = new Seakeeping(SHIP_CLASSES.fletcher.hull);
  she.roll = 0.14;                       // eight degrees down, and released
  const flat = { roll: 0, pitch: 0 };
  const dt = 1 / 60;
  const zeros = [];
  let was = she.roll;
  let over = 0;                          // how far past upright she swings
  for (let t = 0; t < 90; t += dt) {
    const r = she.step(flat, dt).roll;
    if ((was > 0) !== (r > 0)) zeros.push(t);
    over = Math.min(over, r);
    was = r;
  }
  assert.ok(zeros.length >= 6, `she crossed upright only ${zeros.length} times`);
  assert.ok(over < -0.05,
    `she only swung ${(-over).toFixed(3)} rad past upright before stopping`);
  const half = (zeros[zeros.length - 1] - zeros[0]) / (zeros.length - 1);
  const want = rollPeriod(SHIP_CLASSES.fletcher.hull.beam);
  assert.ok(Math.abs(half * 2 - want) < want * 0.15,
    `she rolls in ${(half * 2).toFixed(1)} s where her beam says ${want.toFixed(1)} s`);
  assert.ok(Math.abs(she.roll) < 0.02, `she was still at ${she.roll.toFixed(3)} rad`);

  // Pitch is the other way about: she comes up into the wave and stops there.
  // A hull that went on nodding fore and aft would look like a bath toy.
  const nod = new Seakeeping(SHIP_CLASSES.fletcher.hull);
  nod.pitch = 0.10;
  let crossings = 0;
  let last = nod.pitch;
  for (let t = 0; t < 60; t += dt) {
    const q = nod.step(flat, dt).pitch;
    if ((last > 0) !== (q > 0)) crossings++;
    last = q;
  }
  assert.ok(crossings <= 2, `she nodded through level ${crossings} times`);
  assert.ok(Math.abs(nod.pitch) < 0.005, 'she never settled fore and aft');
});

check('a destroyer works in a sea her betters walk through', () => {
  // Every hull used to take the exact angle of the water under her, so a
  // Fletcher and an Iowa rolled the same 3.6 degrees and pitched the same 2.8.
  // Size has to tell, in both -- and it tells harder in pitch, because a ship
  // only pitches to a wave of about her own length.
  // The sea the battle actually runs on: the roughest weather preset at the
  // sea state a sortie uses, scaled the way the ocean scales it. Taking the
  // number from the ocean means this check cannot drift away from the game.
  const sea = Object.create(Ocean.prototype);
  const amp = 3.2 * (0.4 + 3 * 0.28) * AMP_SCALE;
  sea.material = { uniforms: { uAmp: { value: amp }, uSteep: { value: 1 }, uTime: { value: 0 } } };
  const DEG = 180 / Math.PI;
  const dt = 1 / 60;
  const roll = {};
  const pitch = {};
  const heave = {};
  for (const [id, cls] of Object.entries(SHIP_CLASSES)) {
    const v = new Seakeeping(cls.hull);
    let r = 0; let q = 0; let lo = Infinity; let hi = -Infinity;
    for (let t = 0; t < 300; t += dt) {
      const att = sea.attitude(1200, -800, 0.7, cls.hull.length, cls.hull.beam, t);
      v.step(att, dt);
      if (t > 40) {                          // let her settle first
        r = Math.max(r, Math.abs(v.roll) * DEG);
        q = Math.max(q, Math.abs(v.pitch) * DEG);
        lo = Math.min(lo, v.heave); hi = Math.max(hi, v.heave);
      }
    }
    roll[id] = r; pitch[id] = q; heave[id] = hi - lo;
  }
  // In order of size, every one of them works less than the one before her.
  const order = ['fletcher', 'cleveland', 'hipper', 'enterprise', 'iowa'];
  for (let i = 1; i < order.length; i++) {
    assert.ok(roll[order[i]] < roll[order[i - 1]],
      `${order[i]} rolls ${roll[order[i]].toFixed(2)}deg against `
      + `${order[i - 1]}'s ${roll[order[i - 1]].toFixed(2)}deg`);
    assert.ok(pitch[order[i]] < pitch[order[i - 1]] + 0.05,
      `${order[i]} pitches ${pitch[order[i]].toFixed(2)}deg against `
      + `${order[i - 1]}'s ${pitch[order[i - 1]].toFixed(2)}deg`);
  }
  // She used to take the whole angle of the water and roll five degrees, which
  // was tiring to watch and hard to aim from. Steadier now, but she must still
  // be a destroyer and not a pier.
  assert.ok(roll.fletcher > 2 && roll.fletcher < 6, `a Fletcher rolls ${roll.fletcher.toFixed(1)}deg`);
  assert.ok(pitch.fletcher > 0.4 && pitch.fletcher < 1.2,
    `a Fletcher pitches ${pitch.fletcher.toFixed(2)}deg`);
  assert.ok(roll.iowa < 1.6, `an Iowa rolls ${roll.iowa.toFixed(1)}deg`);
  assert.ok(roll.fletcher > roll.iowa * 2,
    'a destroyer should roll at least twice what a battleship does');
  // The carrier is the one that was complained about: she must be nearly flat
  // fore and aft, and well under a destroyer.
  assert.ok(pitch.enterprise < 0.4,
    `Enterprise still pitches ${pitch.enterprise.toFixed(2)}deg`);
  assert.ok(pitch.iowa < 0.4, `an Iowa still pitches ${pitch.iowa.toFixed(2)}deg`);
  assert.ok(pitch.fletcher > pitch.enterprise * 3,
    `a Fletcher pitches ${pitch.fletcher.toFixed(2)}deg to Enterprise's `
    + `${pitch.enterprise.toFixed(2)}deg -- not enough of a difference`);
  // And the big ones work slowly, which is the other half of looking heavy.
  assert.ok(rollPeriod(SHIP_CLASSES.iowa.hull.beam)
    > rollPeriod(SHIP_CLASSES.fletcher.hull.beam) * 1.4, 'an Iowa should roll slowly');
  assert.ok(pitchPeriod(270) > pitchPeriod(114) * 1.3, 'and pitch slowly');
  assert.ok(rollHeed(114) > rollHeed(270) * 2, 'a short hull should take more of the sea');
  assert.ok(pitchHeed(114) > pitchHeed(262) * 4,
    'and far more of it fore and aft than a long one');

  // And she must not go up and down bodily either. This is the one that made a
  // carrier look like she was plunging: an eighth of a degree of pitch, and
  // eight metres of heave, because the sea's own rise was handed to her whole.
  // The water she is in rises and falls about eleven metres.
  for (let i = 1; i < order.length; i++) {
    assert.ok(heave[order[i]] < heave[order[i - 1]] + 0.2,
      `${order[i]} heaves ${heave[order[i]].toFixed(1)} m against `
      + `${order[i - 1]}'s ${heave[order[i - 1]].toFixed(1)} m`);
  }
  assert.ok(heave.enterprise < 2.6, `Enterprise still rises ${heave.enterprise.toFixed(1)} m`);
  assert.ok(heave.iowa < 2.6, `an Iowa still rises ${heave.iowa.toFixed(1)} m`);
  assert.ok(heave.fletcher > heave.enterprise * 1.7,
    'a destroyer should ride a sea a carrier goes through');
  assert.ok(heave.fletcher < 6, `a Fletcher is thrown ${heave.fletcher.toFixed(1)} m`);
  // Heave is no longer scaled down per ship at all: it is a water level, and
  // the filtering by length happens where the sea is measured.
  assert.equal(heaveHeed(114), 1);
});

check('every gun on every ship is blocked by her own structure somewhere', () => {
  // A mounting that trains right round fires through the ship it is bolted to.
  // Nothing aboard may do that: every arc is a half-angle either side of the
  // rest bearing, and a full circle is PI.
  const bad = [];
  const look = (cls, what, mounts) => {
    for (const m of mounts || []) {
      if (!(m.arc < Math.PI - 0.01)) {
        bad.push(`${cls.id} ${what} at z ${m.z} trains ${(m.arc * 2 * 180 / Math.PI).toFixed(0)}deg`);
      }
    }
  };
  for (const cls of Object.values(SHIP_CLASSES)) {
    look(cls, 'main battery', cls.turrets);
    if (cls.secondary) look(cls, 'secondary', cls.secondary.mounts);
    for (const g of (cls.aa && cls.aa.guns) || []) look(cls, g.name, g.mounts);
    if (cls.torpedoes) look(cls, 'tubes', cls.torpedoes.mounts);
  }
  assert.equal(bad.length, 0, `unlimited training: ${bad[0]}`);
});

check('a ship brings less to bear ahead than she does on the beam', () => {
  // The whole point of the arcs. A ship steering at her target has her after
  // guns masked by her own superstructure; put the wheel over and they come
  // into action. If that is not true the arcs are decorative.
  for (const cls of Object.values(SHIP_CLASSES)) {
    const ship = { x: 0, z: 0, heading: 0 };
    const R = cls.aa.range * 0.4;
    const ahead = aaBearing(cls, ship, 0, R);
    const beam = aaBearing(cls, ship, R, 0);
    assert.ok(ahead.share < 1 && beam.share < 1,
      `${cls.id} brings her whole light battery to bear on one bearing`);
    assert.ok(ahead.barrels > 0 && beam.barrels > 0,
      `${cls.id} cannot shoot at an aeroplane at all`);
    assert.ok(aaBarrels(cls) === aaBattery(cls).reduce((n, m) => n + m.guns, 0));
  }
  // And a ship end-on to an aeroplane is worse off than one beam-on. The
  // Enterprise is the exception and she is allowed to be: her galleries are
  // packed forward and aft round the flight deck, not amidships.
  const cl = SHIP_CLASSES.cleveland;
  const ship = { x: 0, z: 0, heading: 0 };
  const R = cl.aa.range * 0.4;
  assert.ok(aaBearing(cl, ship, R, 0).share > aaBearing(cl, ship, 0, R).share,
    'the cruiser fights an aeroplane no better on the beam than over the bow');
});

check('a mounting only fires on a bearing it can train to', () => {
  const cls = SHIP_CLASSES.iowa;
  const ship = { x: 0, z: 0, heading: 0 };
  // A waist five-inch mount on the starboard side: it may fire to starboard
  // and it may not fire across her.
  const stbd = cls.secondary.mounts.find((m) => m.x > 0 && Math.abs(m.z) < 10);
  assert.ok(mountBears(ship, stbd, Math.PI / 2), 'she cannot fire on her own beam');
  assert.ok(!mountBears(ship, stbd, -Math.PI / 2), 'she fires straight through her own hull');
  assert.ok(!mountBears(ship, stbd, 0), 'she fires through her own bow');
  // And the arc travels with the ship: put the helm over and the same mounting
  // covers a different piece of the horizon.
  const turned = { x: 0, z: 0, heading: Math.PI / 2 };
  assert.ok(mountBears(turned, stbd, Math.PI), 'her arcs do not turn with her');
});

check('the secondary battery fights on its own, and only where it bears', () => {
  const state = createState(generateWorld(5150, 'open_ocean'), { mode: 'deathmatch' });
  const own = addShip(state, { name: 'CL', classId: 'cleveland', team: 0, index: 0 });
  const foe = addShip(state, { name: 'DD', classId: 'fletcher', team: 1, index: 0 });
  own.x = 0; own.z = 0; own.heading = 0;
  // Right abeam to starboard, well inside the secondary battery's range.
  foe.x = 3000; foe.z = 0; foe.heading = Math.PI;
  own.spottedBy = [true, true];
  foe.spottedBy = [true, true];
  // Her captain is laying the main battery somewhere else entirely: the
  // secondary is in local control and does not care.
  own.aimX = 0; own.aimZ = 30000;
  const cal = SHIP_CLASSES.cleveland.secondary.caliber;
  let salvos = 0;
  for (let i = 0; i < 400; i++) {
    foe.spottedBy = [true, true];
    salvos += step(state, DT).filter((e) => e.e === 'muzzle' && e.ship === own.id
      && e.cal === cal).length;
  }
  assert.ok(salvos > 0, 'her secondary battery never opened fire');
  // Only the mounts that bear. Beam on, that is the engaged side and the two
  // centreline mounts -- never the disengaged waist.
  const S = SHIP_CLASSES.cleveland.secondary;
  const bearing = S.mounts.filter((m) => mountBears(own, m, Math.PI / 2)).length;
  assert.ok(bearing > 0 && bearing < S.mounts.length,
    `${bearing} of ${S.mounts.length} mounts bear on the beam`);
  // And the shells she fired are her secondary's, not her main battery's.
  const sec = state.shells.filter((sh) => sh.caliber === cal);
  assert.ok(sec.length > 0, 'no five-inch shells in the air');
});

check('a ship with nothing on her engaged side does not fire her secondary', () => {
  const state = createState(generateWorld(5151, 'open_ocean'), { mode: 'deathmatch' });
  const own = addShip(state, { name: 'BB', classId: 'iowa', team: 0, index: 0 });
  const foe = addShip(state, { name: 'DD', classId: 'fletcher', team: 1, index: 0 });
  // Dead ahead. An Iowa's five-inch are all beam mounts and none of them can
  // be laid on her own bow.
  own.x = 0; own.z = 0; own.heading = 0;
  foe.x = 0; foe.z = 4000;
  const cal = SHIP_CLASSES.iowa.secondary.caliber;
  let salvos = 0;
  for (let i = 0; i < 300; i++) {
    own.spottedBy = [true, true];
    foe.spottedBy = [true, true];
    salvos += step(state, DT).filter((e) => e.e === 'muzzle' && e.ship === own.id
      && e.cal === cal).length;
  }
  assert.equal(salvos, 0, 'she fired her beam mountings straight over her bow');
});

check('the arsenal lists every weapon aboard, with what each may engage', () => {
  const ROLES = new Set(['surface', 'aa', 'dp', 'sub']);
  for (const cls of Object.values(SHIP_CLASSES)) {
    const rows = arsenal(cls);
    assert.ok(rows.length >= 3, `${cls.id} lists only ${rows.length} weapons`);
    for (const w of rows) {
      assert.ok(w.name && w.name.length > 2, `${cls.id} has an unnamed weapon`);
      assert.ok(ROLES.has(w.role), `${cls.id} ${w.name} may engage "${w.role}"`);
      assert.ok(w.barrels > 0, `${cls.id} ${w.name} has no barrels`);
    }
    // Her main battery, her light battery, and her tubes if she has any, all
    // reach the list -- and the barrel counts match her datasheet.
    const light = rows.filter((w) => w.role === 'aa');
    assert.ok(light.length > 0, `${cls.id} has no anti-aircraft guns listed`);
    for (const t of cls.datasheet.tertiary || []) {
      const row = rows.find((w) => w.caliber === t.caliber);
      assert.ok(row, `${cls.id} carries ${t.label} on her sheet and none in the arsenal`);
      assert.equal(row.barrels, t.barrels,
        `${cls.id} ${t.label}: ${row.barrels} mounted against ${t.barrels} on her sheet`);
    }
    assert.equal(!!rows.find((w) => w.band === 'Torpedo tubes'), !!cls.torpedoes,
      `${cls.id} torpedo tubes are listed wrongly`);
  }
  // A Fletcher's depth charges are aboard and on the list, whatever there is
  // to drop them on.
  const dc = arsenal(SHIP_CLASSES.fletcher).find((w) => w.role === 'sub');
  assert.ok(dc && dc.barrels > 0, 'her depth charge gear is not in the arsenal');
});

check('a shell is drawn to its own bore, and an anti-aircraft round is tiny', () => {
  // The complaint that started this: every shell was the same yellow ball. A
  // sixteen-inch round has to be plainly bigger than a five-inch one and both
  // plainly bigger than a Bofors round.
  const sizes = [406, 203, 152, 127, 40, 20].map(shellLength);
  for (let i = 1; i < sizes.length; i++) {
    assert.ok(sizes[i] < sizes[i - 1], 'shells do not fall in size with the bore');
  }
  assert.ok(shellLength(406) > shellLength(40) * 3.5,
    'a sixteen-inch round is not conspicuously bigger than a Bofors round');
  assert.ok(shellLength(20) > 0.5, 'a 20 mm round is drawn too small to see at all');
});

check('a ship fights herself while her captain cons her', () => pinned(() => {
  // Her guns, her torpedoes and her damage control are her own officers' now.
  // What is left to a captain is where she goes and when her aircraft go, so a
  // brain given a conned ship must fire and must not touch her helm, her
  // telegraph or her squadrons.
  const st = createState(generateWorld(7, 'open_ocean'), { mode: 'deathmatch' });
  const mine = addShip(st, { name: 'Mine', classId: 'cleveland', team: 0, index: 0 });
  const foe = addShip(st, { name: 'Foe', classId: 'hipper', team: 1, index: 0 });
  mine.x = 0; mine.z = 0; foe.x = 6000; foe.z = 0;
  // Ordered north-about, away from the enemy she is engaging, and given way on.
  mine.notch = 4;
  mine.wayX = 0; mine.wayZ = -9000;
  const brains = [createBotBrain('veteran'), createBotBrain('veteran')];
  // A brain picks which way it kites at random, and which way the enemy kites
  // decides how far our own ship gets dragged off before she settles on the
  // course she was given. Pin it, or this check passes and fails by luck.
  brains.forEach((b) => { b.kite = 1; b.wander = 0; });
  // Long enough for a six-thousand-ton cruiser to come the whole way round:
  // she has a hundred seconds, and spends more than half of them turning.
  for (let i = 0; i < 3000; i++) {
    stepBot(st, mine, brains[0], DT, true);
    stepBot(st, foe, brains[1], DT, false);
    steerToWaypoint(st, mine);
    step(st, DT);
  }
  assert.ok(mine.damageDealt > 500,
    `conned, she did ${Math.round(mine.damageDealt)} damage -- her guns are not being fought`);
  assert.equal(mine.notch, 4, 'her brain rang up a speed her captain did not order');
  // And she went where she was sent, not where the brain would have taken her.
  const away = Math.abs(angleDelta(mine.heading, Math.PI));
  assert.ok(away < 0.4,
    `she steered ${mine.heading.toFixed(2)} rad, not the course she was given`);
  assert.ok(mine.z < -120, `she made good only ${Math.round(-mine.z)} m up her course`);

  // A ship with nobody aboard still steers herself, and fights.
  const bot = addShip(st, { name: 'Bot', classId: 'cleveland', team: 0, index: 1, isBot: true });
  bot.x = 500; bot.z = 200;
  const bb = createBotBrain('veteran');
  const heading0 = bot.heading;
  for (let i = 0; i < 300; i++) { stepBot(st, bot, bb, DT, false); step(st, DT); }
  assert.ok(bot.notch > 1, 'a bot never rang up any speed at all');
  assert.notEqual(bot.heading, heading0, 'a bot never touched her own helm');
}));

check('a captain keeps his aircraft to himself', () => {
  // The one thing the AI must not do for him. A conned carrier in range of a
  // target holds her squadrons; the same carrier left to herself flies them.
  const build = (conned) => {
    const st = createState(generateWorld(11, 'open_ocean'), { mode: 'deathmatch' });
    const cv = addShip(st, { name: 'Big E', classId: 'enterprise', team: 0, index: 0 });
    const foe = addShip(st, { name: 'Foe', classId: 'iowa', team: 1, index: 0 });
    cv.x = 0; cv.z = 0; foe.x = 6000; foe.z = 0;
    foe.spottedBy[0] = 3;
    const brain = createBotBrain('veteran');
    brain.kite = 1;
    // Whether anything ever left the deck, not whether anything is still up at
    // the end: a squadron can go, be shot down by the target's own guns and be
    // struck below again inside the run, and looking only at the last tick
    // would call that "she never flew anything".
    let flew = 0;
    for (let i = 0; i < 400; i++) {
      foe.spottedBy[0] = 3;
      stepBot(st, cv, brain, DT, conned);
      step(st, DT);
      flew = Math.max(flew, cv.squadrons.filter((q) => q.state !== 'deck').length);
    }
    return flew;
  };
  assert.equal(build(true), 0, 'she flew off aircraft her captain did not order');
  assert.ok(build(false) > 0, 'left to herself she never flew anything');
});

check('she is counted in compartments and holes, not in hit points', () => {
  // A ship is not a pool that runs down. She is compartments, and what a shell
  // does is open one of them. Her condition is the sum of what is still sound.
  const st = createState(generateWorld(3, 'open_ocean'), { mode: 'deathmatch' });
  const her = addShip(st, { name: 'Her', classId: 'cleveland', team: 0, index: 0 });
  const cls = SHIP_CLASSES.cleveland;

  // Every compartment sound, and between them they are the whole of her.
  const total = SECTIONS.reduce((a, k) => a + her.sections[k.k].max, 0);
  assert.ok(Math.abs(total - cls.hp) < 1, `her compartments add to ${Math.round(total)}, not ${cls.hp}`);
  assert.equal(hullIntegrity(her), her.hp);
  assert.ok(SECTIONS.every((k) => her.sections[k.k].pens === 0), 'she started holed');

  // A shell into her machinery takes it out of her machinery and nowhere else.
  damageShip(st, her, null, 2000, 'pen', 'mid');
  assert.equal(her.sections.mid.max - her.sections.mid.hp, 2000);
  assert.equal(her.sections.bow.hp, her.sections.bow.max, 'her bow paid for a hit amidships');
  assert.equal(her.hp, hullIntegrity(her), 'her condition is not what her compartments say');

  // Wreck the machinery outright and she cannot steam; wreck her steering aft
  // and she will not answer her helm. That is what the compartments are for.
  damageShip(st, her, null, her.sections.mid.hp, 'pen', 'mid');
  assert.equal(her.sections.mid.hp, 0);
  assert.ok(her.engineDamage > 0, 'her machinery is gone and she is still steaming');
  damageShip(st, her, null, her.sections.stern.hp, 'pen', 'stern');
  assert.ok(her.steeringDamage > 0, 'her steering is gone and she still answers');
  assert.ok(her.alive, 'two compartments should not sink a cruiser');

  // Fire has no station: it eats the ship, so it is shared over what is left.
  const beforeBow = her.sections.bow.hp;
  damageShip(st, her, null, 900, 'fire');
  assert.ok(her.sections.bow.hp < beforeBow, 'a fire burned nothing at all');

  // And she goes when every compartment is gone, not a moment before.
  for (const k of SECTIONS) damageShip(st, her, null, cls.hp, 'pen', k.k);
  assert.equal(her.hp, 0);
  assert.ok(!her.alive, 'gutted, and still afloat');
});

check('gunfire holes her where it hits her', () => {
  // The station a shell strikes decides which compartment pays, and only the
  // rounds that actually got inside are counted as holes: a ricochet off the
  // belt is not a penetration, and neither is a shell that shatters on it.
  const st = createState(generateWorld(5, 'open_ocean'), { mode: 'deathmatch' });
  const me = addShip(st, { name: 'Me', classId: 'iowa', team: 0, index: 0 });
  const foe = addShip(st, { name: 'Foe', classId: 'cleveland', team: 1, index: 0 });
  me.x = 0; me.z = 0; foe.x = 0; foe.z = 11000;
  foe.heading = Math.PI / 2;              // broadside on, so there is a target
  foe.spottedBy[0] = 9;
  me.aimX = foe.x; me.aimZ = foe.z;
  for (let i = 0; i < 4000; i++) {
    foe.spottedBy[0] = 9;
    me.aimX = foe.x; me.aimZ = foe.z;
    if (i % 60 === 0) fireGuns(st, me);
    step(st, DT);
    if (!foe.alive) break;
  }
  const holes = SECTIONS.reduce((a, k) => a + foe.sections[k.k].pens, 0);
  assert.ok(holes > 0, 'a battleship fired at a cruiser for two minutes and put no holes in her');
  const hurt = SECTIONS.filter((k) => foe.sections[k.k].hp < foe.sections[k.k].max);
  assert.ok(hurt.length > 0, 'she took damage in no compartment at all');
  assert.ok(hurt.length < SECTIONS.length || !foe.alive,
    'every compartment was opened evenly, which is not how shells work');
  // Holes only where something got in.
  for (const k of SECTIONS) {
    const c = foe.sections[k.k];
    if (c.pens > 0) {
      assert.ok(c.hp < c.max, `${k.k} is holed ${c.pens} times and undamaged`);
    }
  }
});

check('each kind of aeroplane goes after its own kind of target', () => {
  // A strike is three flights and they do not want the same things. Put a
  // destroyer, a cruiser and a battleship in front of one and see where each
  // flight points itself.
  const st = createState(generateWorld(21, 'open_ocean'), { mode: 'deathmatch' });
  const cv = addShip(st, { name: 'Big E', classId: 'enterprise', team: 0, index: 0 });
  const dd = addShip(st, { name: 'Tin', classId: 'fletcher', team: 1, index: 0 });
  const cl = addShip(st, { name: 'Light', classId: 'cleveland', team: 1, index: 1 });
  const bb = addShip(st, { name: 'Big', classId: 'iowa', team: 1, index: 2 });
  cv.x = 0; cv.z = 0;
  // All three at much the same range, so it is the choice and not the distance.
  dd.x = 4000; dd.z = 300;
  cl.x = 4000; cl.z = 0;
  bb.x = 4000; bb.z = -300;

  const flight = (role) => ({
    id: 99, owner: cv.id, team: 0, sqId: 1, role,
    x: 0, z: 0, heading: 0, tx: 4000, tz: 0, torp: 0, bomb: 0, count: 4,
    hp: 100, phase: 'outbound', dropped: false, life: 0, hunt: 0,
    targetId: 0, targetAir: 0,
  });

  // The torpedo bombers want the biggest hull afloat.
  assert.equal(pickAirTarget(st, flight('torpedo')).ship.id, bb.id,
    'the torpedo bombers did not go for the battleship');
  // The fighters want the smallest.
  assert.equal(pickAirTarget(st, flight('fighter')).ship.id, dd.id,
    'the fighters did not go for the destroyer');
  // And a dive bomber takes what is nearest, which here is the cruiser dead
  // ahead of her.
  assert.equal(pickAirTarget(st, flight('dive')).ship.id, cl.id,
    'the dive bombers did not take the nearest');

  // Sink the battleship and the torpedo bombers move down to the next biggest,
  // rather than sulking or going for the destroyer.
  bb.alive = false;
  assert.equal(pickAirTarget(st, flight('torpedo')).ship.id, cl.id,
    'with the battleship gone the fish went to the wrong ship');

  // Aircraft in the air trump everything for a fighter -- that is what she is
  // for -- and nothing else in the strike is distracted by them.
  const enemyAir = {
    id: 77, owner: bb.id, team: 1, sqId: 5, role: 'dive',
    x: 800, z: 0, heading: 0, tx: 0, tz: 0, torp: 0, bomb: 4, count: 4,
    hp: 100, phase: 'outbound', dropped: false, life: 0, hunt: 0,
    targetId: 0, targetAir: 0,
  };
  st.planes.push(enemyAir);
  assert.equal(pickAirTarget(st, flight('fighter')).air.id, 77,
    'the fighters ignored an enemy formation in front of them');
  assert.ok(!pickAirTarget(st, flight('torpedo')).air,
    'the torpedo bombers went chasing aeroplanes');
  assert.ok(!pickAirTarget(st, flight('dive')).air,
    'the dive bombers went chasing aeroplanes');
});

check('a strike goes up as three flights and comes home as one squadron', () => {
  const st = createState(generateWorld(23, 'open_ocean'), { mode: 'deathmatch' });
  const cv = addShip(st, {
    name: 'Big E', classId: 'enterprise', team: 0, index: 0,
    airGroup: { fighters: 4, dive: 4, torpedo: 4 },
  });
  const foe = addShip(st, { name: 'Foe', classId: 'iowa', team: 1, index: 0 });
  cv.x = 0; cv.z = 0; foe.x = 5000; foe.z = 0;
  cv.aimX = foe.x; cv.aimZ = foe.z;
  assert.ok(launchStrike(st, cv), 'she would not launch');
  // The order rings the deck; the aeroplanes come when she is off it. Pressing
  // the button used to put a squadron in the sky on that tick, while the model
  // of her was still taxiing past the island.
  assert.equal(st.planes.length, 0, 'she launched before she had taxied');
  for (let i = 0; i < Math.ceil((DECK_RUN + 0.5) / DT); i++) step(st, DT);
  const roles = st.planes.map((p) => p.role).sort();
  assert.deepEqual(roles, ['dive', 'fighter', 'torpedo'],
    `she sent up ${JSON.stringify(roles)}`);
  assert.ok(st.planes.every((p) => p.sqId === st.planes[0].sqId), 'they came off different squadrons');
  // One flight home does not put the squadron back on the board while the
  // other two are still over the enemy.
  const sq = cv.squadrons.find((q) => q.state === 'flying');
  assert.ok(sq, 'nothing is marked flying');
  st.planes = st.planes.slice(1);
  assert.equal(cv.squadrons.find((q) => q.id === sq.id).state, 'flying',
    'the squadron came back on the board with two flights still up');
});

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
