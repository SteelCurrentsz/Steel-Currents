// Headless checks for the simulation: ballistics, armour, torpedoes, bots.
import assert from 'node:assert/strict';
import {
  generateWorld, landAt, landMask, blockedByLand, islandAt, groundHeight,
  spawnPoint, islandRadius, islandHeight, shoreDistance,
} from '../shared/world.js';
import {
  createState, addShip, addBattery, step, fireGuns, fireTorpedoes, solveBallistic,
  useRepair, DT, damageShip, shipClearance,
} from '../shared/sim.js';
import {
  BATTERIES, batteryGun, batteryArc, batteryReach, BATTERY_REACH,
} from '../shared/batteries.js';
import { SHIP_CLASSES } from '../shared/ships.js';
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
  for (const [classId, dead] of [['fletcher', false], ['essex', true]]) {
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

check('a battery trains no further than its mounting allows', () => {
  // Todt has 120 degrees of traverse: 60 either side of where it was laid.
  const { state, bat, ship } = shoot('todt', 20000);
  const arc = batteryArc(BATTERIES.todt);
  assert.ok(Math.abs(arc - Math.PI / 3) < 1e-6, 'sixty degrees either side');

  // Dead astern of the emplacement, which it can never bear on.
  ship.x = 0; ship.z = bat.z - 12000; ship.notch = 1;
  let fired = 0;
  for (let i = 0; i < 30 * 120; i++) {
    for (const ev of step(state, DT)) if (ev.e === 'muzzle' && ev.battery) fired++;
  }
  assert.equal(fired, 0, 'a target behind the battery must not be engaged');
  assert.ok(Math.abs(bat.angle) <= arc + 1e-6, 'and the gun must stay inside its stops');
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

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
