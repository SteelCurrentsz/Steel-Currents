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
import { normaliseAirGroup, defaultAirGroup, launchStrike } from '../shared/sim.js';
import { angleDelta } from '../shared/math.js';
import { batteryParts } from '../client/js/render/battery.js';
import { Ocean } from '../client/js/render/ocean.js';
import { ShipView, rollPeriod, rollHeed } from '../client/js/render/scene.js';
import {
  enterpriseParts, buildEnterprise, stepLifts, stepDeck, LIFT_HW, liftZs, FD, HANGAR,
  __aircraft,
} from '../client/js/render/enterprise.js';
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
  const pkg = state.planes[state.planes.length - 1];
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
  // lift takes her down to the hangar, brings her up, she taxis aft to the
  // spot, and goes down the deck and off over the bow. Each of those has to
  // happen, in that order, or it is an aeroplane teleporting off a ship.
  const built = buildEnterprise();
  const plane = built.deckPlane;
  const aft = built.lifts[built.lifts.length - 1].group;
  built.group.userData.step(0);
  built.group.userData.launch(0);

  const track = [];
  for (let t = 0; t <= 12.4; t += 0.05) {
    built.group.userData.step(t);
    track.push({ t, y: plane.position.y, z: plane.position.z, lift: aft.position.y });
  }
  const at = (a, b) => track.filter((s) => s.t >= a && s.t < b);

  // Down to the hangar, and the aeroplane goes with the lift.
  const low = Math.min(...track.map((s) => s.lift));
  assert.ok(low < HANGAR + 1.5, `the lift only went down to ${low.toFixed(1)}`);
  const bottom = track.find((s) => s.lift === low);
  assert.ok(Math.abs(bottom.y - bottom.lift) < 1.2, 'she did not ride the lift down');
  assert.ok(bottom.t < 2.0, `the lift reached the hangar at ${bottom.t.toFixed(1)} s`);

  // Back up to the flight deck before she goes anywhere.
  const upAgain = track.find((s) => s.t > 2 && s.lift > FD - 0.2);
  assert.ok(upAgain && upAgain.t < 5, 'the lift never came back up');

  // Aft to the spot, which is abaft where the lift is.
  const aftMost = track.reduce((a, b) => (b.z < a.z ? b : a));
  assert.ok(aftMost.z < aft.position.z - 20,
    `she only taxied to ${aftMost.z.toFixed(0)}, and the lift is at ${aft.position.z.toFixed(0)}`);
  assert.ok(aftMost.t > 5 && aftMost.t < 9.5, `she was at the spot at ${aftMost.t.toFixed(1)} s`);

  // Then forward, off the bow, and climbing.
  const last = track[track.length - 1];
  assert.ok(last.z > 120, `she left the deck at z ${last.z.toFixed(0)}`);
  assert.ok(last.y > FD + 8, `she was still at ${last.y.toFixed(1)} m going over the bow`);
  // And she runs forward the whole way rather than jumping about.
  const rolling = at(9, 12.4);
  for (let i = 1; i < rolling.length; i++) {
    assert.ok(rolling[i].z >= rolling[i - 1].z - 0.01, 'she went backwards on her run');
  }

  // Afterwards she is airborne and stays airborne: she does not vanish and she
  // does not reappear on the lift behind her. The scene flies her from there.
  const wasAt = { y: plane.position.y, z: plane.position.z };
  built.group.userData.step(40);
  assert.equal(plane.position.y, wasAt.y, 'the deck put her back after she had gone');
  assert.equal(plane.position.z, wasAt.z, 'the deck put her back after she had gone');
  // And when whatever was flying her is done, she comes home to the lift.
  built.group.userData.recover();
  built.group.userData.step(41);
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
  const seen = [];
  for (let t = 0; t <= 12.4; t += 0.05) {
    built.group.userData.step(t);
    seen.push({ t, out: wings.spread.visible, in: wings.stowed.visible });
  }
  assert.ok(seen.every((s) => s.out !== s.in), 'both sets of wings were showing at once');
  // Folded while she is below, spread by the time she starts to move aft.
  assert.ok(seen.filter((s) => s.t < 2.5).every((s) => !s.out),
    'she spread her wings in the hangar');
  assert.ok(seen.filter((s) => s.t > 4.4).every((s) => s.out),
    'she taxied or ran with her wings folded');

  // And struck below again when the squadron is home.
  built.group.userData.recover();
  assert.ok(wings.stowed.visible && !wings.spread.visible,
    'she was struck below with her wings still spread');
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
  built.group.userData.step(6.0);
  const taxi = drop();
  let onDeck = 0;
  for (let t = 4.5; t <= 7.2; t += 0.1) {
    built.group.userData.step(t);
    onDeck = Math.max(onDeck, Math.abs(drop() - taxi));
  }
  assert.ok(onDeck < 0.05, `her wheels moved by ${onDeck.toFixed(2)} m while taxiing`);

  built.group.userData.step(12.4);
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

check('a hull swings on her own period rather than lying on the water', () => {
  // The sea does not set a ship's angle, it pushes her towards one. Knock her
  // over in flat water and let go: she should roll back through upright, past
  // it, and go on swinging -- at her own period, and dying away, not snapping
  // back like a needle.
  const she = Object.create(ShipView.prototype);
  she.cls = SHIP_CLASSES.fletcher;
  she.roll = 0.14;                       // eight degrees down, and released
  she.rollV = 0;
  const dt = 1 / 60;
  const zeros = [];
  let was = she.roll;
  let over = 0;                          // how far past upright she swings
  for (let t = 0; t < 90; t += dt) {
    const r = she.heelTo(0, dt);
    if ((was > 0) !== (r > 0)) zeros.push(t);
    over = Math.min(over, r);
    was = r;
  }
  assert.ok(zeros.length >= 6, `she crossed upright only ${zeros.length} times`);
  assert.ok(over < -0.05,
    `she only swung ${(-over).toFixed(3)} rad past upright before stopping`);
  // Half a swing between crossings, and the period is the one her beam gives.
  const half = (zeros[zeros.length - 1] - zeros[0]) / (zeros.length - 1);
  const want = rollPeriod(SHIP_CLASSES.fletcher.hull.beam);
  assert.ok(Math.abs(half * 2 - want) < want * 0.15,
    `she rolls in ${(half * 2).toFixed(1)} s where her beam says ${want.toFixed(1)} s`);
  // And she settles: a ship that rolls for ever has no damping at all.
  assert.ok(Math.abs(she.roll) < 0.02, `she was still at ${(she.roll).toFixed(3)} rad`);
});

check('a destroyer rolls in a sea a battleship walks through', () => {
  // Every hull used to take the exact angle of the water under her, so a
  // Fletcher and an Iowa rolled the same three and a half degrees. Size has to
  // tell: a short ship lies along the swell and takes all of it, a long one
  // spans several waves whose slopes cancel under her.
  const sea = Object.create(Ocean.prototype);
  sea.material = { uniforms: { uAmp: { value: 2.9 }, uSteep: { value: 1 }, uTime: { value: 0 } } };
  const DEG = 180 / Math.PI;
  const dt = 1 / 60;
  const peak = {};
  for (const [id, cls] of Object.entries(SHIP_CLASSES)) {
    const v = Object.create(ShipView.prototype);
    v.cls = cls; v.roll = 0; v.rollV = 0;
    let most = 0;
    for (let t = 0; t < 300; t += dt) {
      const att = sea.attitude(1200, -800, 0.7, cls.hull.length, cls.hull.beam, t);
      const r = v.heelTo(att.roll, dt);
      if (t > 40) most = Math.max(most, Math.abs(r) * DEG);   // let her settle first
    }
    peak[id] = most;
  }
  // In order of size, every one rolls less than the one before her.
  const order = ['fletcher', 'cleveland', 'hipper', 'enterprise', 'iowa'];
  for (let i = 1; i < order.length; i++) {
    assert.ok(peak[order[i]] < peak[order[i - 1]],
      `${order[i]} rolls ${peak[order[i]].toFixed(2)}deg against `
      + `${order[i - 1]}'s ${peak[order[i - 1]].toFixed(2)}deg`);
  }
  // A destroyer is lively and the capital ships are not.
  assert.ok(peak.fletcher > 4 && peak.fletcher < 9,
    `a Fletcher rolls ${peak.fletcher.toFixed(1)}deg`);
  assert.ok(peak.iowa < 2.6, `an Iowa rolls ${peak.iowa.toFixed(1)}deg`);
  assert.ok(peak.enterprise < 3.0, `Enterprise rolls ${peak.enterprise.toFixed(1)}deg`);
  assert.ok(peak.fletcher > peak.iowa * 2,
    'a destroyer should roll at least twice what a battleship does');
  // And the big ones swing slower, which is the other half of looking heavy.
  assert.ok(rollPeriod(SHIP_CLASSES.iowa.hull.beam)
    > rollPeriod(SHIP_CLASSES.fletcher.hull.beam) * 1.4, 'an Iowa should roll slowly');
  assert.ok(rollHeed(114) > rollHeed(270) * 2, 'a short hull should take more of the sea');
});

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
