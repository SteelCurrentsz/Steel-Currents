// Headless checks for the simulation: ballistics, armour, torpedoes, bots.
import assert from 'node:assert/strict';
import {
  generateWorld, landAt, landMask, blockedByLand, islandAt, groundHeight,
  spawnPoint,
} from '../shared/world.js';
import {
  createState, addShip, step, fireGuns, fireTorpedoes, solveBallistic,
  useRepair, DT, damageShip,
} from '../shared/sim.js';
import { SHIP_CLASSES } from '../shared/ships.js';
import { createBotBrain, stepBot } from '../server/bots.js';
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

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
