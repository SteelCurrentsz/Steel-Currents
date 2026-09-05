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
import { shipSnapshot } from '../shared/protocol.js';
import {
  normaliseAirGroup, defaultAirGroup, launchStrike, steerToWaypoint, steerToward,
  SECTIONS, PENETRATING, hullIntegrity, sectionAt, freshSections, pickAirTarget,
  DECK_RUN, DECK_RUN_OUT, aaBattery, aaBarrels, aaBearing, mountBears, torpedoClear,
  flightDeckOut, resolveShellHit, buoyancy, launchOffset,
  flyPlane, releasePlane, dropOrdnance, strafe,
} from '../shared/sim.js';
import { Pilot, AERO } from '../client/js/render/aero.js';
// A strike is up to three flights and they go one at a time, each down the
// whole length of the deck, so the last of them is airborne three deck runs
// after the button was pressed.
const STRIKE_RUN = DECK_RUN * 3 + 1;
const AERO_WILDCAT = AERO.wildcat;
const AERO_AVENGER = AERO.avenger;
import { arsenal } from '../client/js/hud.js';
import { shellLength, bombGeometry, bombAim, bombStep } from '../client/js/render/ordnance.js';
import { weld, flightModels } from '../client/js/render/planes.js';
import { meshSection } from '../client/js/render/interior.js';
import { Plating, holeRadius } from '../client/js/render/plating.js';
import { Debris } from '../client/js/render/debris.js';
import { buildShip } from '../client/js/render/ships.js';

/**
 * How far off the centreline a ship's plating is, at a height and a station.
 *
 * A ray out along the beam through every triangle she is drawn with, and the
 * farthest one it goes through. The only instrument that answers the question
 * without assuming anything about how she was drawn -- reading her corners
 * misses everything between two station rows, and reading her lines is reading
 * a curve she was lofted through rather than the ship that came out.
 *
 * `-1` where she has no plating on that line at all, which is past her stem,
 * under her keel, or on the centreline itself.
 */
function shellRuler(group) {
  const SLAB = 1.0;
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const tris = [];
  const walk = (node) => {
    for (const ch of node.children) {
      const geo = ch.isMesh ? ch.geometry : null;
      // Her insides are what is being checked; everything else is plating.
      if (geo?.attributes?.position && ch.userData.mergeKey !== 'in') {
        const pos = geo.attributes.position;
        const idx = geo.index;
        m.multiplyMatrices(inv, ch.matrixWorld);
        const n = idx ? idx.count : pos.count;
        for (let i = 0; i + 2 < n; i += 3) {
          for (let k = 0; k < 3; k++) {
            v.fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(m);
            tris.push(v.x, v.y, v.z);
          }
        }
      }
      if (ch.children.length) walk(ch);
    }
  };
  walk(group);
  const bucket = new Map();
  for (let i = 0; i < tris.length; i += 9) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < 3; k++) {
      const z = tris[i + k * 3 + 2];
      if (z < lo) lo = z;
      if (z > hi) hi = z;
    }
    for (let b = Math.floor(lo / SLAB); b <= Math.floor(hi / SLAB); b++) {
      let l = bucket.get(b);
      if (!l) bucket.set(b, l = []);
      l.push(i);
    }
  }
  // Where the ray crosses one triangle, as a distance off the centreline: a
  // two-dimensional question in the plane the ray is normal to.
  const rayX = (i, y, z) => {
    const ay = tris[i + 1], az = tris[i + 2];
    const by = tris[i + 4], bz = tris[i + 5];
    const cy = tris[i + 7], cz = tris[i + 8];
    const d = (bz - cz) * (ay - cy) + (cy - by) * (az - cz);
    if (d < 1e-9 && d > -1e-9) return -1;
    const l1 = ((bz - cz) * (y - cy) + (cy - by) * (z - cz)) / d;
    if (l1 < 0 || l1 > 1) return -1;
    const l2 = ((cz - az) * (y - cy) + (ay - cy) * (z - cz)) / d;
    if (l2 < 0 || l1 + l2 > 1) return -1;
    return Math.abs(tris[i] * l1 + tris[i + 3] * l2 + tris[i + 6] * (1 - l1 - l2));
  };
  return (y, z) => {
    const l = bucket.get(Math.floor(z / SLAB));
    if (!l) return -1;
    let best = -1;
    for (let n = 0; n < l.length; n++) {
      const h = rayX(l[n], y, z);
      if (h > best) best = h;
    }
    return best;
  };
}
import { angleDelta, dist } from '../shared/math.js';
import { batteryParts } from '../client/js/render/battery.js';
import { Ocean, AMP_SCALE } from '../client/js/render/ocean.js';
import { Wake } from '../client/js/render/wake.js';
import { ShipView } from '../client/js/render/scene.js';
import { torpedoGeometry } from '../client/js/render/torpedo.js';
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
import {
  buildHipper, hipperParts, LOA as HIPPER_LOA,
  deckAt as hipperDeckAt, halfDeck as hipperHalfDeck,
  sheer as hipperSheer, shellAt as hipperShellAt, zAt as hipperZAt,
  sdeck as hipperSDeck, sHalf as hipperSHalf,
} from '../client/js/render/hipper.js';
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
  // The bank has to come round first: fifteen tons of tubes on a training
  // ring do not swing onto a beam bearing the instant the button is pressed.
  assert.equal(fireTorpedoes(state, a), 0, 'she fired before her tubes had trained');
  for (let i = 0; i < 30 * 10; i++) step(state, DT);
  const launched = fireTorpedoes(state, a);
  assert.ok(launched > 0, 'destroyer should launch torpedoes');
  let hits = 0;
  for (let i = 0; i < 150 * 30; i++) {
    for (const ev of step(state, DT)) if (ev.e === 'torpHit') hits++;
  }
  assert.ok(hits > 0, 'torpedo spread should hit a stationary battleship');
  assert.ok(b.hp < b.maxHp, 'torpedo damage should apply');
});

check('the tubes train onto the bearing, and the fish go where they point', () => {
  const state = createState(generateWorld(2020, 'open_ocean'), { mode: 'deathmatch' });
  const dd = addShip(state, { name: 'DD', classId: 'fletcher', team: 0, index: 0 });
  dd.x = 0; dd.z = 0; dd.heading = 0;
  // Right abeam to starboard, which is ninety degrees off her rest bearing.
  dd.aimX = 4000; dd.aimZ = 0;
  assert.ok(dd.torpMounts.every((m) => Math.abs(m.angle) < 0.01),
    'her tubes do not start fore and aft');
  assert.equal(fireTorpedoes(state, dd), 0, 'she fired before training');
  for (let i = 0; i < 30 * 10; i++) step(state, DT);
  for (const m of dd.torpMounts) {
    assert.ok(Math.abs(m.angle - Math.PI / 2) < 0.05,
      `a bank stopped at ${m.angle.toFixed(2)} rad instead of coming abeam`);
  }
  assert.ok(fireTorpedoes(state, dd) > 0, 'she would not fire once trained');
  // And they run down the line of the tubes, not the line of the aim point:
  // the spread is laid off the bank's own bearing.
  for (const tp of state.torps) {
    assert.ok(Math.abs(tp.heading - Math.PI / 2) < 0.25,
      `a fish left on ${tp.heading.toFixed(2)} rad`);
  }
});

check('a bank that cannot come round on the target does not fire at all', () => {
  const state = createState(generateWorld(2021, 'open_ocean'), { mode: 'deathmatch' });
  const ca = addShip(state, { name: 'CA', classId: 'hipper', team: 0, index: 0 });
  ca.x = 0; ca.z = 0; ca.heading = 0;
  // Dead ahead. A Hipper's tubes are beam mountings and neither can be laid
  // over her bow.
  ca.aimX = 0; ca.aimZ = 6000;
  for (let i = 0; i < 30 * 15; i++) step(state, DT);
  assert.equal(fireTorpedoes(state, ca), 0, 'she fired her beam tubes over her own bow');
  // Put the target on her beam and she can.
  ca.aimX = 6000; ca.aimZ = 0;
  for (let i = 0; i < 30 * 15; i++) step(state, DT);
  assert.ok(fireTorpedoes(state, ca) > 0, 'she would not fire on her own beam');
});

check('the guns and the tubes on the models actually train', () => {
  // Sim-side training is only half of it: a mounting that swings in the
  // simulation and sits still on screen is a gun that fires out of its side.
  const built = buildFletcher();
  assert.equal(built.torpMounts.length, SHIP_CLASSES.fletcher.torpedoes.mounts.length,
    'her modelled banks do not match the tubes on her datasheet');
  assert.ok(built.aaMounts.length > 0, 'none of her light battery trains');
  for (const m of [...built.torpMounts, ...built.aaMounts]) {
    assert.ok(m.userData.dynamic, 'a mounting was welded into the hull');
    assert.ok(Number.isFinite(m.userData.rest), 'a mounting does not know its rest bearing');
  }
  const cl = buildCleveland();
  assert.equal(cl.secMounts.length, SHIP_CLASSES.cleveland.secondary.mounts.length,
    'her modelled secondary does not match her datasheet');
  for (const m of cl.secMounts) assert.ok(m.userData.dynamic, 'a secondary mount is welded down');

  // And laying one puts it where it was asked to go, in the ship's own frame.
  const view = new ShipView({ add() {}, remove() {} }, 'fletcher', 0, false);
  const want = Math.PI / 2;
  for (let i = 0; i < 200; i++) view.layMounts(null, [want, want], [], 1 / 30);
  for (const m of view.torpMounts) {
    const laid = m.rotation.y + (m.userData.rest || 0);
    assert.ok(Math.abs(angleDelta(laid, want)) < 0.02,
      `a bank was laid on ${laid.toFixed(2)} rad instead of ${want.toFixed(2)}`);
  }
  // With nothing in the air the light battery comes back to its rest bearing.
  for (let i = 0; i < 400; i++) view.layMounts(null, null, [], 1 / 30);
  for (const m of view.aaMounts) {
    assert.ok(Math.abs(m.rotation.y) < 0.02, 'a gun did not come back to its rest bearing');
  }
});

check('a torpedo is a torpedo, and it leaves a track behind it', () => {
  // The fish: seven metres long and half a metre across, which is what a
  // Mk 15 is. It used to be a box.
  const geo = torpedoGeometry();
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const len = bb.max.z - bb.min.z;
  const across = bb.max.x - bb.min.x;
  assert.ok(len > 6.5 && len < 7.6, `she is ${len.toFixed(2)} m long`);
  assert.ok(across > 0.5 && across < 1.4, `she is ${across.toFixed(2)} m across`);
  assert.ok(len / across > 5, 'she is not slender enough to be a torpedo');
});

check('fires burn her down, the sea comes in, and repair fights both', () => {
  const { state, a } = duel('fletcher', 'iowa');
  // A fire in her machinery and a hole in her side abreast of it, four metres
  // down. Both of them are things in a particular compartment now, not
  // counters on the ship.
  a.sections.mid.fire = 0.5;
  a.sections.fwd.holeS = 0.4;
  a.sections.fwd.holeY = 4;
  const before = a.hp;
  for (let i = 0; i < 30 * 5; i++) step(state, DT);
  assert.ok(a.hp < before, 'damage over time should tick');
  assert.ok(a.sections.fwd.wS > 1, 'no water came in through the hole');
  assert.ok(a.sections.fwd.wP === 0, 'water came in on the side that is not open');
  assert.ok(a.fires >= 1, 'the fire went out on its own');
  assert.ok(a.sink > 0, 'she is no deeper for all that water');
  useRepair(state, a);
  assert.equal(a.fires, 0, 'the fire is still burning after damage control');
  assert.equal(a.sections.fwd.holeS, 0, 'the hole was not shored up');
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

check('a ship you are watching comes through in full, however far off she is', () => {
  // The plot shows the whole order of battle, and a mark you can tap has to be
  // a mark you can watch. Watching an enemy nobody aboard had sighted used to
  // put the camera over an empty patch of sea: she was a contact -- a position
  // and a heading and nothing else -- so there was no hull in the snapshot to
  // draw and no condition to read out. Named as the one being watched, she
  // comes through the same way your own division does.
  const { state, a, b } = duel('fletcher', 'iowa', 12000);
  for (let i = 0; i < 10; i++) step(state, DT);
  const blind = buildSnapshot(state, 1, b.id);
  assert.ok(!blind.ships.some((s) => s.i === a.id), 'she was sighted after all');
  assert.ok(blind.contacts.some((s) => s.i === a.id), 'she is not even on the plot');

  const watched = buildSnapshot(state, 1, b.id, a.id);
  const her = watched.ships.find((s) => s.i === a.id);
  assert.ok(her, 'the ship being watched is still not in the snapshot');
  assert.ok(!watched.contacts.some((s) => s.i === a.id),
    'she is a contact and a ship at once');
  // And in full: her compartments and her reload timers, which is what the
  // plate at the bottom of the screen reads.
  assert.ok(her.sec && her.sec.length, 'she came through without her compartments');
  assert.ok(her.cd, 'she came through without her reload timers');
  // Nobody else is given away by it.
  const others = state.ships.filter((s) => s.team === 0 && s.id !== a.id);
  for (const o of others) {
    assert.ok(!watched.ships.some((s) => s.i === o.id), 'watching one ship uncovered another');
  }
});

check('a ship picked off the plot is conned from it, whichever side she is on', () => {
  // The plot is a director's table. A captain who has picked a ship off it and
  // is standing on her bridge rings up her engine room and lays off her course
  // -- and that goes for the enemy's line as well as his own division, which
  // is not how a battle works and is exactly what was asked for.
  const room = new Room({ name: 'Test', mode: 'deathmatch', autoStart: false, seed: 7 });
  const sent = [];
  const player = { id: 'p1', name: 'You', send: (m) => sent.push(m) };
  room.join(player, { name: 'You', classId: 'fletcher', team: 0 });
  const mine = room.state.ships.find((s) => s.id === player.shipId);
  const friend = addShip(room.state, { name: 'Mate', classId: 'cleveland', team: 0, index: 1 });
  const foe = addShip(room.state, { name: 'Foe', classId: 'iowa', team: 1, index: 0 });

  for (const target of [friend, foe]) {
    room.command(player, { t: 'goto', ship: target.id, x: 4321, z: -1234 });
    assert.equal(target.wayX, 4321, `${target.name} did not take the course`);
    assert.equal(target.wayZ, -1234, `${target.name} did not take the course`);
    room.command(player, { t: 'notch', ship: target.id, notch: 3 });
    assert.equal(target.notch, 3, `${target.name} did not answer the telegraph`);
  }
  // Your own hull is untouched by an order given to somebody else.
  assert.equal(mine.wayX, null, 'the order went to your own ship as well');

  // Damage control is hers too: pressed while watching another ship, it is her
  // parties that turn out, not yours two miles away.
  friend.fires = 2;
  mine.fires = 2;
  room.command(player, { t: 'repair', ship: friend.id });
  assert.equal(friend.fires, 0, 'her fires were not put out');
  assert.equal(mine.fires, 2, 'your own parties turned out instead of hers');

  // A ship that has gone down takes no orders at all.
  foe.alive = false;
  room.command(player, { t: 'notch', ship: foe.id, notch: 1 });
  assert.equal(foe.notch, 3, 'a sunk ship answered her telegraph');
  room.command(player, { t: 'goto', ship: foe.id, x: 10, z: 10 });
  assert.equal(foe.wayX, 4321, 'a sunk ship took a course');

  // And the camera: a player says which ship he is watching, and it is that
  // ship the snapshot is built to show him.
  room.command(player, { t: 'watch', ship: foe.id });
  assert.equal(player.watching, foe.id, 'the room did not note who he is watching');
  room.command(player, { t: 'watch', ship: 0 });
  assert.equal(player.watching, 0, 'he could not stop watching');
  room.close();
});

check('a battle is fought out to the last ship', () => {
  // It used to be able to end three other ways: on points, off a running
  // score from three circles on the chart; on a clock, with whoever was ahead
  // when it stopped; and, from the captain's side of it, the moment his own
  // ship went down, because a curtain came over the screen with a button on
  // it to go back to port. A fleet action ends when one fleet is on the
  // bottom, and nothing else ends it.
  const st = createState(generateWorld(19, 'open_ocean'), { mode: 'domination' });
  const a1 = addShip(st, { name: 'Flag', classId: 'iowa', team: 0, index: 0 });
  const a2 = addShip(st, { name: 'Mate', classId: 'cleveland', team: 0, index: 1 });
  const b1 = addShip(st, { name: 'Foe', classId: 'hipper', team: 1, index: 0 });
  // Well apart, so nothing is shooting at anything and the only thing that can
  // end this is the arithmetic under test.
  a1.x = 0; a1.z = 0; a2.x = 800; a2.z = 0; b1.x = 0; b1.z = 30000;
  assert.ok(!('caps' in st), 'she still has capture zones');
  assert.ok(!('score' in st), 'she still keeps a score');

  // Half an hour of it: twice what the old clock allowed.
  for (let i = 0; i < 30 * 1800 && !st.over; i++) step(st, DT);
  assert.equal(st.over, false, `the battle ended on its own: ${st.reason}`);

  // The flagship goes down and the battle goes on, because her division has
  // not.
  damageShip(st, a1, b1, a1.maxHp + 1, 'test');
  step(st, DT);
  assert.equal(a1.alive, false, 'the flagship did not sink');
  assert.equal(st.over, false, 'the battle ended with the flagship');

  // The last of her side goes and it is over.
  damageShip(st, a2, b1, a2.maxHp + 1, 'test');
  const evs = step(st, DT);
  assert.equal(st.over, true, 'a side was wiped out and the battle went on');
  assert.equal(st.winner, 1, 'the wrong side won');
  assert.equal(st.reason, 'elimination', `she ended on ${st.reason}`);
  assert.ok(evs.some((e) => e.e === 'over'), 'nobody was told it was over');

  // And nothing anywhere still reports points.
  const snap = buildSnapshot(st, 0, a2.id);
  assert.ok(!('caps' in snap) && !('score' in snap),
    'the wire still carries the points system');
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

check("the Hipper's shell has no holes in it", () => {
  // The one thing a hull has to be is closed. Every station of her plating is
  // fired at from abeam at the height and the fore-and-aft position her own
  // lines put it at -- her stem is raked eight metres and her counter
  // overhangs, so where the shell is depends on how high up you look -- and
  // there has to be steel there. And a ray dropped anywhere on her deck has to
  // land on something.
  const built = buildHipper();
  built.group.updateMatrixWorld(true);
  const meshes = [];
  built.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const ray = new THREE.Raycaster();
  const inward = new THREE.Vector3(1, 0, 0);
  const down = new THREE.Vector3(0, -1, 0);

  let tested = 0;
  const holes = [];
  for (let t = -0.97; t <= 0.97; t += 0.045) {
    const top = hipperSheer(t);
    for (let y = -7; y <= top - 0.4; y += 1.4) {
      const half = hipperShellAt(t, y);
      if (half < 0.35) continue;
      tested++;
      ray.set(new THREE.Vector3(-40, y, hipperZAt(t, y)), inward);
      if (!ray.intersectObjects(meshes, false).length) {
        holes.push(`t ${t.toFixed(2)} y ${y.toFixed(1)}`);
      }
    }
  }
  assert.ok(tested > 300, `only ${tested} stations of plating were tested`);
  assert.equal(holes.length, 0, `${holes.length} hole(s) in her shell: ${holes[0]}`);

  // And a deck over the whole of her, from the stem to the transom.
  const bare = [];
  for (let z = -HIPPER_LOA / 2 + 3; z <= HIPPER_LOA / 2 - 3; z += 2.5) {
    for (const u of [0, 0.4, 0.75, -0.4, -0.75]) {
      const x = u * hipperHalfDeck(z) * 0.92;
      ray.set(new THREE.Vector3(x, 70, z), down);
      if (!ray.intersectObjects(meshes, false).length) bare.push(`${x.toFixed(0)}, ${z.toFixed(0)}`);
    }
  }
  assert.equal(bare.length, 0, `${bare.length} hole(s) in her deck: ${bare[0]}`);
});

check('nothing on the Hipper is standing in mid-air', () => {
  // A sponson under every beam mounting, a boat deck under every boat, a
  // platform under every searchlight. Anything with its feet above the deck
  // and nothing underneath it is a thing floating in the air.
  const parts = hipperParts();
  const floating = [];
  for (const p of parts) {
    if (p.size[0] * p.size[1] * p.size[2] < 0.4) continue;   // rails, rigging, rungs
    // An aeroplane's wings overhang whatever she is standing on -- that is what
    // a wing is -- so she is checked below instead, by her floats and her
    // trolley rather than by her wingtips.
    if (p.from === 'aircraft') continue;
    // Nor is a spar: a yard, a gun barrel, a davit and a boat boom are all
    // thin sticks lying across the air on purpose, held at one end. A mast is
    // not one of these -- it stands up, and it does have to stand on something.
    const thin = [p.size[0], p.size[1], p.size[2]].filter((v) => v < 0.7).length >= 2;
    if (thin && p.max[1] - p.min[1] < 1.0) continue;
    const cx = (p.min[0] + p.max[0]) / 2;
    const cz = (p.min[2] + p.max[2]) / 2;
    if (Math.abs(cz) > HIPPER_LOA / 2 - 2) continue;
    const foot = p.min[1];
    if (foot < hipperDeckAt(cz) + 0.4) continue;             // on or below the weather deck
    // Or standing on the superstructure deck, inside its edge. Both decks run
    // the length of her as one mesh apiece, so their boxes say nothing about
    // whether a particular thing is over them -- they have to be asked.
    if (foot < hipperSDeck(cz) + 0.4 && Math.abs(cx) <= hipperSHalf(cz) + 0.35) continue;
    // Standing on it, or run through it: a mast is stepped through a deck. And
    // it has to be under most of her, not touching one corner -- a mounting
    // hanging a metre and a half outboard of the deck it is bolted to has the
    // deck edge within a whisker of it and is still in the air.
    // Something has to be genuinely under her footprint -- a deck, a sponson, a
    // stanchion, a house she is bolted to the side of. Not merely near it: a
    // mounting hanging a metre outboard of the deck edge has the deck within a
    // whisker and is still standing in the air.
    // Something has to be under a fifth of her, and it has to come from below:
    // a thing that starts above her foot is not holding her up, and two poles
    // cannot hold each other up. A fifth rather than a touch, because a
    // mounting hanging outboard of the deck edge has the deck's own coaming
    // within a few centimetres of it and is still standing in the air.
    const span = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    const area = Math.max(0.05, (p.max[0] - p.min[0]) * (p.max[2] - p.min[2]));
    let under = 0;
    for (const q of parts) {
      if (q === p) continue;
      // Anything that runs the length of her -- the shell bands, the weather
      // deck, the knuckle -- has a box the size of the ship and would "hold
      // up" a mounting hanging over the side. Those two decks are asked
      // directly above instead.
      if (q.size[2] > 40) continue;
      const over = span(p.min[0], p.max[0], q.min[0], q.max[0])
        * span(p.min[2], p.max[2], q.min[2], q.max[2]);
      if (over <= 0) continue;
      // Standing on it: it comes up from below her feet.
      const stands = q.min[1] < foot + 0.1
        && q.max[1] > foot - 0.7 && q.min[1] < p.max[1] - 0.1;
      // Or hanging from it: a bracket under a sponson is welded to the
      // platform it carries, and there is nothing under a bracket by design.
      const hangs = q.min[1] <= p.max[1] + 0.2 && q.max[1] > p.max[1];
      if (!stands && !hangs) continue;
      under += over;
      if (under > area * 0.2) break;
    }
    const held = under > area * 0.2;
    if (!held) floating.push(`${p.from} at ${cx.toFixed(1)}, ${foot.toFixed(1)}, ${cz.toFixed(1)}`);
  }
  assert.equal(floating.length, 0,
    `${floating.length} thing(s) in the air: ${floating.slice(0, 6).join('; ')}`);

  // And her aircraft: the one on the catapult is on a trolley on a girder on a
  // training ring standing on the deck, and the one struck down beside the
  // hangar is on the deck.
  const air = parts.filter((p) => p.from === 'aircraft');
  assert.ok(air.length > 40, 'she has no aircraft aboard at all');
  const floats = air.filter((p) => p.min[1] < 15 && p.size[2] > 6 && p.size[0] < 2);
  // One of them is struck down on the boat deck rather than up on the
  // catapult, which is where the spare aeroplane lives.
  assert.ok(air.some((p) => p.min[1] < hipperSDeck(-2) + 1.2),
    'nothing of hers is anywhere near the deck');
  // The catapult girder reaches across her, which is the whole point of an
  // athwartships catapult.
  const girder = air.reduce((a, p) => (p.max[0] - p.min[0] > (a ? a.max[0] - a.min[0] : 0) ? p : a), null);
  assert.ok(girder && girder.max[0] - girder.min[0] > 18,
    'her catapult does not reach across her');
  assert.ok(floats.length >= 2, 'her Arados are not standing on floats');
});

check("the Hipper's bridge is a tower and her funnel is a boiler room's", () => {
  // The two things you look at on a German heavy cruiser. The bridge is a
  // tower built in levels -- block, admiral's bridge, navigating bridge,
  // trunk, foretop -- and each of them has a deck of its own; the foretop
  // carries the seven-metre rangefinder that is the reason the tower is that
  // tall. The funnel is the top of three boiler rooms: uptakes inside a
  // casing, the fire rooms' air cowls outside it, and the flat cap on struts
  // over the mouth that tells her from Prinz Eugen.
  const parts = hipperParts();
  const bridge = parts.filter((p) => p.from === 'bridge');
  assert.ok(bridge.length > 90, `her bridge is only ${bridge.length} pieces`);

  // Levels: flat plates, wide, at rising heights up the tower.
  const decks = bridge
    .filter((p) => p.size[1] < 0.4 && p.max[0] - p.min[0] > 4 && p.max[2] - p.min[2] > 4)
    .map((p) => p.min[1])
    .sort((a, b) => a - b);
  const levels = [];
  for (const y of decks) if (!levels.length || y - levels[levels.length - 1] > 1.5) levels.push(y);
  assert.ok(levels.length >= 4,
    `her bridge is ${levels.length} level(s), not a tower`);
  assert.ok(levels[levels.length - 1] - levels[0] > 12,
    'her tower is not tall enough to be a tower');

  // The rangefinder across the top of it: seven metres of base.
  const wide = bridge.reduce((a, p) => ((p.max[0] - p.min[0]) > (a ? a.max[0] - a.min[0] : 0)
    && p.min[1] > levels[levels.length - 1] - 1 ? p : a), null);
  assert.ok(wide && wide.max[0] - wide.min[0] > 6.5,
    'there is no rangefinder across her foretop');

  // The funnel: a cap standing clear over the mouth on struts.
  const fun = parts.filter((p) => p.from === 'funnel');
  assert.ok(fun.length > 70, `her funnel and casing are only ${fun.length} pieces`);
  const top = fun.reduce((a, p) => (p.max[1] > (a ? a.max[1] : 0) ? p : a), null);
  const capY = top.max[1];
  // Something wide right at the top -- the cap -- and a gap under it.
  const cap = fun.filter((p) => p.max[1] > capY - 0.8 && p.max[0] - p.min[0] > 6);
  assert.ok(cap.length, 'her funnel has no cap on it');
  const mouth = fun.filter((p) => p.max[1] < capY - 1.0 && p.max[1] > capY - 3.5
    && p.max[0] - p.min[0] > 4);
  assert.ok(mouth.length, 'the cap is sitting straight on the funnel');

  // And the fire rooms breathe: big cowls outboard of the casing, two a side.
  const cowls = fun.filter((p) => Math.abs((p.min[0] + p.max[0]) / 2) > 4
    && p.max[0] - p.min[0] > 1.4 && p.size[1] > 0.9 && p.size[1] < 1.6);
  assert.ok(cowls.length >= 4, `she has ${cowls.length} boiler-room cowls, not four`);
});

check('the Hipper mounts what her datasheet says she mounts', () => {
  // The model and the simulation have to agree about where her guns are, or
  // the arcs the arsenal panel draws are for a different ship.
  const cls = SHIP_CLASSES.hipper;
  const built = buildHipper();
  assert.equal(built.turrets.length, 4, 'she has four twin eight-inch turrets');
  assert.equal(built.secMounts.length, cls.secondary.mounts.length);
  assert.equal(built.torpMounts.length, cls.torpedoes.mounts.length);
  const aaWanted = cls.aa.guns.reduce((n, g) => n + g.mounts.length, 0);
  assert.equal(built.aaMounts.length, aaWanted, 'her light battery is the wrong size');

  const at = (o) => { const v = new THREE.Vector3(); o.getWorldPosition(v); return v; };
  cls.turrets.forEach((spec, i) => {
    const p = at(built.turrets[i]);
    assert.ok(Math.abs(p.z - spec.z) < 1.5,
      `turret ${spec.name} is drawn at ${p.z.toFixed(1)} and fought at ${spec.z}`);
  });
  cls.secondary.mounts.forEach((spec, i) => {
    const p = at(built.secMounts[i]);
    assert.ok(Math.abs(p.x - spec.x) < 1 && Math.abs(p.z - spec.z) < 1.5,
      `a ten-point-five is drawn away from where she is fought`);
  });
  cls.torpedoes.mounts.forEach((spec, i) => {
    const p = at(built.torpMounts[i]);
    assert.ok(Math.abs(p.x - spec.x) < 1 && Math.abs(p.z - spec.z) < 1.5,
      'a bank of tubes is drawn away from where it is fought');
  });
  // Superfiring: Bruno stands above Anton, and Cäsar above Dora.
  assert.ok(at(built.turrets[1]).y > at(built.turrets[0]).y + 2,
    'Bruno does not superfire over Anton');
  assert.ok(at(built.turrets[2]).y > at(built.turrets[3]).y + 2,
    'C\u00e4sar does not superfire over Dora');
  // And she floats at her own draft rather than on top of the sea.
  built.group.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(built.group);
  assert.ok(Math.abs(-bb.min.y - cls.hull.draft) < 1.2,
    `she draws ${(-bb.min.y).toFixed(1)} m where her datasheet says ${cls.hull.draft}`);
  assert.ok(Math.abs(bb.max.z - bb.min.z - cls.hull.length) < 3,
    'she is not the length she is fought at');
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
  for (let i = 0; i < Math.ceil(STRIKE_RUN / DT); i++) step(state, DT);
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
  const END = DECK_RUN;

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

  // Ranged AFT off the lift to the round-down: a deck launch starts at the
  // after end of the flight deck and uses the whole of it. She used to line up
  // twenty metres forward of the after lift and be off the planking again by
  // the time she was over the bridge, which is a fifth of the deck.
  const ph = deckPhases(built.group.userData.deck);
  const onLift = track.find((s) => s.t > ph.up + 0.1).z;
  const lined = track.find((s) => s.t > ph.taxied + 0.1);
  assert.ok(lined.z < onLift - 30,
    `she ranged from ${onLift.toFixed(0)} to ${lined.z.toFixed(0)}, which is not aft`);
  // And she starts at the round-down, not somewhere up the middle of the ship.
  const aftEnd = -124.6;
  assert.ok(lined.z < aftEnd + 12,
    `she lined up at ${lined.z.toFixed(0)}, which is ${(lined.z - aftEnd).toFixed(0)} m up the deck`);
  // The run itself never goes backwards, and it takes most of the deck: her
  // wheels leave the planking around amidships, not over the after lift.
  const off = track.find((s) => s.t > ph.roll && s.y > FD + 0.6);
  assert.ok(off && off.z > -30 && off.z < 60,
    `she unstuck at ${off ? off.z.toFixed(0) : 'never'}, which is not most of a deck run`);
  const runOnly = track.filter((s) => s.t >= ph.roll);
  for (let i = 1; i < runOnly.length; i++) {
    assert.ok(runOnly[i].z >= runOnly[i - 1].z - 0.01,
      `she went backwards at ${runOnly[i].t.toFixed(1)} s`);
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


check('an aeroplane in the air is flying on her wings', () => {
  // Two things put aeroplanes in the sky with no wings on them, and one of
  // them put a second pair on the ones that had any.
  //
  // The Wildcat was built folded and only folded -- there was no spread state
  // in her at all -- so every fighter the Enterprise flew off was a fuselage.
  // And the welder that flattens a model into one geometry for instancing
  // walked the whole tree rather than what is actually showing, so an Avenger
  // came out of it carrying both her spread wings and her stowed ones.
  const span = (build) => {
    const g = new THREE.Group();
    build(g);
    const { geo } = weld(g);
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    return { span: b.max.x - b.min.x, verts: geo.attributes.position.count };
  };
  const spread = span((g) => __aircraft.wildcat(g, 0, 0, 0, 0, false, { gear: false }));
  assert.ok(Math.abs(spread.span - 11.58) < 1.5,
    `a Wildcat in flight trim spans ${spread.span.toFixed(1)} m, not 11.6`);

  // And welding takes only the state that is showing: an aeroplane with her
  // wings out has fewer vertices in her than one carrying both pairs would.
  const folded = span((g) => __aircraft.avenger(g, 0, 0, 0, 0, true, false, { gear: false }));
  const out = span((g) => __aircraft.avenger(g, 0, 0, 0, 0, false, false, { gear: false }));
  const both = (() => {
    const g = new THREE.Group();
    const p = __aircraft.avenger(g, 0, 0, 0, 0, false, false, { gear: false });
    p.userData.wings.stowed.visible = true;
    const { geo } = weld(g);
    return geo.attributes.position.count;
  })();
  assert.ok(out.verts < both,
    'an Avenger in flight trim is welded with her folded wings still on her');
  assert.ok(Math.abs(out.span - 16.5) < 1.5,
    `an Avenger in flight trim spans ${out.span.toFixed(1)} m, not 16.5`);
  assert.ok(folded.span < out.span, 'folding her wings did not make her narrower');

  // The three models the scene actually flies, built the way the scene builds
  // them: every one of them has a wing on her.
  const models = flightModels();
  for (const [key, { geo }] of Object.entries(models)) {
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    const s = b.max.x - b.min.x;
    const len = b.max.z - b.min.z;
    assert.ok(s > len * 0.9, `the ${key} in the air is ${s.toFixed(1)} m across and ${len.toFixed(1)} m long`);
  }
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

check('the whole flight deck is flush while she is launching', () => {
  // A lift down the well is a hole in the flight deck the width of the deck,
  // and an aeroplane taking off across one is an aeroplane in the hangar. The
  // after lift is the evolution -- she rides it down and up again -- but the
  // other two have to be at the deck for the whole of it, and they were on
  // their own idle cycle, a third of which is spent below.
  const built = buildEnterprise();
  const lifts = built.lifts;
  const aft = lifts[lifts.length - 1];
  const others = lifts.filter((l) => l !== aft);
  assert.ok(others.length >= 2, 'she has fewer lifts than she is supposed to');

  // Idle her until one of the other lifts is down at the hangar deck.
  let downAt = null;
  for (let t = 0; t <= 60 && downAt === null; t += 1 / 30) {
    built.group.userData.step(t);
    if (others.some((l) => l.group.position.y < HANGAR + 1.2)) downAt = t;
  }
  assert.ok(downAt !== null, 'the lifts never went below at all');

  // Now call away a strike from exactly that moment.
  built.group.userData.launch(downAt);
  let worst = 0;
  let ranAt = null;
  for (let u = 0; u <= DECK_RUN; u += 1 / 60) {
    built.group.userData.step(downAt + u);
    if (u >= 2) {
      for (const l of others) worst = Math.max(worst, FD - l.group.position.y);
    }
    if (ranAt === null && built.deckPlane.position.z > aft.group.position.z + 4) {
      ranAt = u;
    }
  }
  assert.ok(worst < 0.05,
    `a lift was ${worst.toFixed(2)} m below the deck while she was launching`);
  assert.ok(ranAt !== null && ranAt >= 2,
    'she started to move before the deck could have been made flush');

  // And they go back to working once she has gone.
  let dropped = false;
  for (let u = DECK_RUN; u <= DECK_RUN + 40 && !dropped; u += 1 / 30) {
    built.group.userData.step(downAt + u);
    dropped = others.some((l) => l.group.position.y < FD - 1);
  }
  assert.ok(dropped, 'the lifts never worked again after a launch');
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

  // And struck below again when the squadron is home. Coming home is an
  // evolution of its own now -- up the deck, onto the lift, down the well --
  // so it is flown rather than snapped, and what has to be true is that she is
  // folded by the time she is below.
  const home = ph.launch + 4;
  built.group.userData.step(home);
  built.group.userData.recover(home);
  for (let t = home; t <= home + 12; t += 0.05) built.group.userData.step(t);
  assert.ok(wings.stowed.visible && !wings.spread.visible,
    'she was struck below with her wings still spread');
});

check('a second squadron gets a deck to take off from', () => {
  // A carrier has one aeroplane she draws in full, and a captain can order a
  // second squadron up while the first is still out. Her model is in the world
  // by then -- taken out of the ship's group so it could fly -- and the deck
  // evolution positions her in the ship's own frame. Run it on her there and
  // she is put at ship coordinates in world space, which is a long way from
  // the ship and generally under the sea: the take-off where nothing appears.
  const built = buildEnterprise();
  const p = built.deckPlane;
  const home = p.parent;

  // Flying: somebody has taken her into the world.
  const world = new THREE.Group();
  world.add(p);
  p.position.set(1234, 300, -5678);
  const before = p.position.clone();
  built.group.userData.launch(0);
  for (let t = 0; t <= DECK_RUN + 1; t += 1 / 60) built.group.userData.step(t);
  assert.ok(p.position.equals(before),
    'the deck put an aeroplane that is not aboard back on the planking');

  // Given back, the deck works: she comes up the lift and goes.
  home.add(p);
  built.group.userData.stow();
  const deck = built.group.userData.deck;
  built.group.userData.launch(30);
  let up = false;
  for (let t = 30; t <= 30 + DECK_RUN + 0.6; t += 1 / 60) {
    built.group.userData.step(t);
    if (p.position.y > FD - 1) up = true;
  }
  assert.ok(up, 'nothing came up the lift for the second squadron');
  assert.ok(deck.airborne, 'the second squadron never left the deck');
});

check('she lands back aboard and is struck below on the lift', () => {
  // What happens to an aeroplane that has dropped what she was carrying. She
  // used to be snapped onto the after lift at flight-deck level and left
  // standing there between sorties, riding its idle cycle up and down in plain
  // view. An aircraft carrier strikes her aircraft below: she picks up a wire
  // at the round-down, rolls up the deck to the lift, folds, and goes down the
  // well into the hangar the next launch fetches her out of.
  const built = buildEnterprise();
  const deck = built.group.userData.deck;
  const aft = built.lifts[built.lifts.length - 1];
  const p = built.deckPlane;

  // Between sorties she is below, not on the flight deck.
  built.group.userData.step(0);
  assert.ok(deck.stowed, 'she is not struck below to begin with');
  assert.ok(p.position.y < HANGAR + 2,
    `she is standing at ${p.position.y.toFixed(1)} m, which is the flight deck`);
  // And the lift is free to work: it does not sit under her.
  let moved = false;
  for (let t = 0; t <= 40; t += 0.1) {
    built.group.userData.step(t);
    if (aft.group.position.y > HANGAR + 3 && p.position.y < HANGAR + 2) moved = true;
  }
  assert.ok(moved, 'the after lift never worked while she was below');

  // Now fly the whole sortie: the lift fetches her up, she goes, she comes
  // home, and she ends where she started.
  built.group.userData.launch(50);
  let onDeck = false;
  for (let t = 50; t <= 50 + DECK_RUN + 0.6; t += 1 / 60) {
    built.group.userData.step(t);
    if (p.position.y > FD - 1) onDeck = true;
  }
  assert.ok(onDeck, 'she never came up out of the hangar');
  assert.ok(deck.airborne, 'she never left the deck');
  assert.ok(!deck.stowed, 'she is somehow below and airborne at once');

  // Home: she touches down at the round-down and rolls up the deck.
  const t0 = 50 + DECK_RUN + 1;
  built.group.userData.step(t0);
  built.group.userData.recover(t0);
  const track = [];
  for (let t = t0; t <= t0 + 10; t += 1 / 60) {
    built.group.userData.step(t);
    track.push({ t: t - t0, z: p.position.z, y: p.position.y,
      lift: aft.group.position.y, stowed: deck.stowed });
  }
  const first = track[2];
  const last = track[track.length - 1];
  assert.ok(first.z < aft.group.position.z - 20,
    `she landed at ${first.z.toFixed(0)}, which is not the round-down`);
  assert.ok(first.y > FD - 1, 'she landed somewhere other than the flight deck');
  assert.ok(last.y < HANGAR + 2,
    `she finished at ${last.y.toFixed(1)} m, which is not the hangar deck`);
  assert.ok(Math.abs(last.z - (aft.group.position.z - 0.45)) < 1.5,
    'she did not end up on the after lift');
  assert.ok(deck.stowed, 'she is not struck below at the end of it');
  // She rolled up the deck rather than sliding sideways down the well: there
  // is a stretch where she is moving forward at flight-deck level.
  const rolled = track.filter((r) => r.y > FD - 1);
  assert.ok(rolled.length > 60 && rolled[rolled.length - 1].z > rolled[0].z + 20,
    'she went below without ever rolling up the deck');
  // And the lift went down with her, rather than her sinking through it. Only
  // while she is on the way down: once she is below, the lift goes back to its
  // own cycle and leaves her there, which is the whole point of striking her
  // below.
  const sank = track.filter((r) => r.y < FD - 2 && !r.stowed);
  assert.ok(sank.every((r) => Math.abs(r.lift - r.y) < 1.0),
    'she went down the well without the lift under her');

  // The next launch fetches her out again.
  const t1 = t0 + 14;
  built.group.userData.launch(t1);
  let up = false;
  for (let t = t1; t <= t1 + DECK_RUN + 0.6; t += 1 / 60) {
    built.group.userData.step(t);
    if (p.position.y > FD - 1) up = true;
  }
  assert.ok(up, 'she never came up for the second sortie');
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
  // whatever flies her next has to pick her up. Measured over the frames she is
  // actually drawn in -- once she is away she is struck below, which is a jump
  // nobody sees and the whole point of doing it.
  built.group.userData.launch(0);
  let prev = null;
  let worst = 0;
  for (let t = 0; t <= DECK_RUN + 0.5; t += 1 / 60) {
    built.group.userData.step(t);
    if (!built.deckPlane.visible) { prev = null; continue; }
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
  // Measured with her held level. She is nose-up when she comes off the deck,
  // and a nose-up aeroplane's tail is lower than a level one's -- which reads
  // as the wheels having come only halfway up when they are fully retracted.
  // The question is where the wheels are on the aeroplane, not what attitude
  // the aeroplane is in.
  const gap = () => {
    const was = plane.rotation.x;
    plane.rotation.x = 0;
    plane.updateMatrixWorld(true);
    const d = drop();
    plane.rotation.x = was;
    plane.updateMatrixWorld(true);
    return d;
  };
  built.group.userData.step(0);
  const stood = gap();

  // Measured while she is taxiing: wings already out, and she is not yet
  // rocking against the brakes, so the only thing that can move is the gear.
  built.group.userData.launch(0);
  const ph = deckPhases(deck);
  const END = DECK_RUN;
  built.group.userData.step((ph.up + ph.taxied) / 2);
  const taxi = gap();
  let onDeck = 0;
  for (let t = ph.up + 0.4; t <= ph.roll - 0.2; t += 0.1) {
    built.group.userData.step(t);
    onDeck = Math.max(onDeck, Math.abs(gap() - taxi));
  }
  assert.ok(onDeck < 0.05, `her wheels moved by ${onDeck.toFixed(2)} m while taxiing`);

  // Just before the hand-over: she is off the planking and climbing, wheels
  // up, and still being drawn. On the tick after this the flight takes over
  // and the model is put out of sight -- see the check below.
  built.group.userData.step(END - 0.4);
  const flying = gap();
  built.group.userData.step(END);
  assert.ok(taxi - flying > 0.65,
    `her wheels only came up ${(taxi - flying).toFixed(2)} m`);
  assert.ok(deck.airborne, 'she never got airborne');

  built.group.userData.recover();
  built.group.userData.step(40);
  assert.ok(Math.abs(gap() - stood) < 0.05, 'her wheels stayed up when she came home');
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

check('a torpedo is never fired down her own deck', () => {
  // A torpedo does not leave a barrel: it goes over the side, into the water,
  // and runs. A bank on the centreline of a destroyer, trained anywhere near
  // fore and aft, is pointed down a hundred and fourteen metres of her own
  // forecastle -- and she used to fire there quite happily, five fish into her
  // own bow.
  const cls = SHIP_CLASSES.fletcher;
  const spec = cls.torpedoes.mounts[0];
  const clear = (deg) => torpedoClear(cls, spec, (deg * Math.PI) / 180);
  assert.ok(!clear(0), 'she fires a torpedo straight over her own bow');
  assert.ok(!clear(180), 'she fires a torpedo through her own stern');
  assert.ok(!clear(15) && !clear(-15), 'she fires a torpedo down her forecastle');
  assert.ok(clear(90) && clear(-90), 'she cannot fire on the beam, which is the whole point');
  assert.ok(clear(45) && clear(135), 'her arc is narrower than a destroyer\'s really is');
  // The blind sector either side of the bow is about thirty degrees, which is
  // what a Fletcher's quintuple mount really had.
  let shut = 0;
  for (let d = 0; d < 90; d++) if (!clear(d)) shut = d;
  assert.ok(Math.abs(shut - 29) <= 6, `she is blind ${shut}\u00b0 either side of the bow, not about 30`);
  // A mount on the beam shoots over its own side and not across the ship.
  const hip = SHIP_CLASSES.hipper;
  const stbd = hip.torpedoes.mounts.find((m) => m.x > 0);
  assert.ok(torpedoClear(hip, stbd, Math.PI / 2), 'her starboard tubes cannot fire to starboard');
  assert.ok(!torpedoClear(hip, stbd, -Math.PI / 2),
    'her starboard tubes fire a torpedo across her own deck');

  // And in the simulation: laid on a target dead ahead, the tubes train to the
  // edge of what they can shoot on and the order to fire is refused.
  const state = createState(generateWorld(31, 'open_ocean'), { mode: 'deathmatch' });
  const dd = addShip(state, { name: 'DD', classId: 'fletcher', team: 0, index: 0 });
  const foe = addShip(state, { name: 'Foe', classId: 'iowa', team: 1, index: 0 });
  dd.x = 0; dd.z = 0; dd.heading = 0;
  foe.x = 0; foe.z = 4000;
  foe.spottedBy[0] = 3;
  dd.aimX = foe.x; dd.aimZ = foe.z;
  for (let i = 0; i < 30 * 20; i++) step(state, DT);
  for (const m of dd.torpMounts) {
    const off = (Math.abs(m.angle) * 180) / Math.PI;
    assert.ok(off > 20, `a bank trained to ${off.toFixed(0)}\u00b0 off the bow, which is her own forecastle`);
  }
  const before = state.torps.length;
  fireTorpedoes(state, dd);
  assert.equal(state.torps.length, before, 'she fired into her own bow after all');
  // Put the target on the beam and she fires.
  foe.x = 4000; foe.z = 0;
  dd.aimX = foe.x; dd.aimZ = foe.z;
  for (let i = 0; i < 30 * 20; i++) step(state, DT);
  fireTorpedoes(state, dd);
  assert.ok(state.torps.length > before, 'she will not fire on the beam either');
  // And what she did fire is running clear of her, not along her.
  for (const tp of state.torps) {
    const off = Math.abs(angleDelta(dd.heading, tp.heading));
    assert.ok(off > 0.4 && off < Math.PI - 0.4,
      `a fish is running ${((off * 180) / Math.PI).toFixed(0)}\u00b0 off her own head`);
  }
});

check('nothing bolted to her deck stands in the way of her tubes', () => {
  // The other half of it, and the half you can see: a bank of tubes sweeps a
  // disc of deck as it trains, and anything standing in that disc is something
  // fifteen tons of tubes swings straight through. A ventilator cowl stood
  // inside the forward bank's arc and a boat davit inside the after one.
  const built = buildFletcher();
  built.group.updateMatrixWorld(true);
  const parts = fletcherParts().filter((p) => !p.moving);
  for (const [i, m] of built.torpMounts.entries()) {
    const box = new THREE.Box3().setFromObject(m);
    const c = new THREE.Vector3();
    m.getWorldPosition(c);
    // How far the tubes reach from the training ring, and the band of height
    // they sweep through.
    const reach = Math.max(box.max.z - c.z, c.z - box.min.z, box.max.x - c.x, c.x - box.min.x);
    assert.ok(reach > 3, `bank ${i} is only ${reach.toFixed(1)} m of tubes`);
    const fouls = [];
    for (const p of parts) {
      // Only what is at the height the tubes swing at.
      if (p.max[1] < box.min.y + 0.15 || p.min[1] > box.max.y - 0.15) continue;
      // The hull itself is one box the whole length of her, which every
      // mounting aboard is inside; it says nothing about what is on deck.
      if (p.size[2] > 40) continue;
      const nx = Math.max(p.min[0], Math.min(c.x, p.max[0]));
      const nz = Math.max(p.min[2], Math.min(c.z, p.max[2]));
      const d = Math.hypot(nx - c.x, nz - c.z);
      if (d < reach - 0.1) fouls.push(`${p.from} at ${d.toFixed(1)} m`);
    }
    assert.equal(fouls.length, 0,
      `bank ${i} sweeps through ${fouls.length} thing(s): ${fouls[0]}`);
  }
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

check('a pilot flies her flight, and nobody else can', () => {
  const state = createState(generateWorld(7373, 'open_ocean'), { mode: 'deathmatch' });
  const cv = addShip(state, { name: 'CV', classId: 'enterprise', team: 0, index: 0 });
  const foe = addShip(state, { name: 'CV2', classId: 'enterprise', team: 1, index: 0 });
  cv.x = 0; cv.z = 0; foe.x = 0; foe.z = 8000;
  cv.aimX = foe.x; cv.aimZ = foe.z;
  launchStrike(state, cv);
  for (let i = 0; i < 30 * (DECK_RUN + 4); i++) {
    for (const s of state.ships) s.spottedBy = [true, true];
    step(state, DT);
  }
  const p = state.planes.find((q) => q.owner === cv.id);
  assert.ok(p, 'nothing got up to fly');
  // The enemy cannot fly her, and neither can a message with nonsense in it.
  assert.equal(flyPlane(state, foe, { i: p.id, x: p.x, z: p.z, h: 0 }), false,
    'the other side flew her aeroplane');
  assert.equal(flyPlane(state, cv, { i: p.id, x: NaN, z: 0, h: 0 }), false,
    'she accepted a position that is not a number');
  // Nor can her own side teleport her: only as far as she could have flown.
  assert.equal(flyPlane(state, cv, { i: p.id, x: p.x + 9000, z: p.z, h: 0 }), false,
    'she was moved nine kilometres in one message');

  // Flown properly, she goes where the pilot puts her and the autopilot lets
  // go of her.
  let x = p.x;
  let z = p.z;
  let h = p.heading;
  for (let i = 0; i < 30 * 6; i++) {
    for (const s of state.ships) s.spottedBy = [true, true];
    h += 0.3 * DT;
    x += Math.sin(h) * 100 * DT;
    z += Math.cos(h) * 100 * DT;
    if (i % 3 === 0) {
      assert.ok(flyPlane(state, cv, { i: p.id, x, z, h }), 'she refused a legal position');
    }
    step(state, DT);
  }
  assert.ok(p.flown, 'she is not marked as being flown');
  assert.ok(Math.hypot(p.x - x, p.z - z) < 40,
    `the flight is ${Math.round(Math.hypot(p.x - x, p.z - z))} m from where the pilot put her`);

  // Let go of her and the autopilot has her again within a second and a half.
  releasePlane(state, p.id);
  const wasX = p.x;
  for (let i = 0; i < 30 * 3; i++) {
    for (const s of state.ships) s.spottedBy = [true, true];
    step(state, DT);
  }
  assert.ok(!p.flown, 'she is still marked as flown after being let go');
  assert.ok(Math.abs(p.x - wasX) > 1 || Math.abs(p.z - z) > 1, 'nobody is flying her at all');
});

check('an aeroplane flies on her wing, not on a cursor', () => {
  // Hands off she holds what she is given; hauled round she pays for it in
  // speed and height, and hauled round hard enough she stalls. That is the
  // whole difference between a flight model and a waypoint.
  const level = new Pilot(AERO_WILDCAT, { y: 900, speed: 110 });
  for (let i = 0; i < 60 * 10; i++) level.step(1 / 60);
  assert.ok(Math.abs(level.bank) < 0.02, 'hands off, she will not fly level');
  assert.ok(Math.abs(level.y - 900) < 25, `hands off she wandered to ${level.y.toFixed(0)} m`);

  const turn = new Pilot(AERO_WILDCAT, { y: 900, speed: 130 });
  turn.stickRoll = -1;
  turn.stickPitch = 0.6;
  const v0 = turn.v;
  for (let i = 0; i < 60 * 8; i++) turn.step(1 / 60);
  assert.ok(Math.abs(turn.bank) > 1.0, `she only reached ${turn.bank.toFixed(2)} rad of bank`);
  assert.ok(turn.v < v0 - 20, `a hard turn cost her only ${(v0 - turn.v).toFixed(0)} m/s`);
  assert.ok(Math.abs(turn.heading) > 0.6, 'hauling her round did not turn her');

  // And a bomber yanked about at low speed departs rather than obeying.
  const slow = new Pilot(AERO_AVENGER, { y: 900, speed: 46 });
  slow.stickPitch = 1;
  for (let i = 0; i < 60 * 4; i++) slow.step(1 / 60);
  assert.ok(slow.stall > 0.4, `she was asked for more than her wing had and gave ${slow.stall.toFixed(2)}`);
  assert.ok(slow.pitch < 0.25, 'she went on climbing through a stall');
});

check('a squadron always comes back, however her flights end', () => {
  // The bug this is here for: whether a squadron was released was worked out
  // per flight, at the moment each one left, against an array that had not
  // been rebuilt yet -- so a flight that had already gone still counted as
  // airborne. Two flights of one squadron ending on the same tick each saw the
  // other as still out, neither released the squadron, and the carrier could
  // never rearm it. Her aircraft never came back.
  const state = createState(generateWorld(9090, 'open_ocean'), { mode: 'deathmatch' });
  const cv = addShip(state, { name: 'CV', classId: 'enterprise', team: 0, index: 0 });
  const foe = addShip(state, { name: 'CL', classId: 'cleveland', team: 1, index: 0 });
  cv.x = 0; cv.z = 0; foe.x = 0; foe.z = 7000;
  cv.aimX = foe.x; cv.aimZ = foe.z;
  let launched = 0;
  let stuckFor = 0;
  const came = new Set();
  for (let i = 0; i < 30 * 60 * 8; i++) {
    for (const s of state.ships) s.spottedBy = [true, true];
    if (i % (30 * 8) === 0 && launchStrike(state, cv)) launched++;
    step(state, DT);
    // Any squadron marked flying with nothing of it in the air, and not on the
    // deck run, is one that will never come home.
    const bad = cv.squadrons.filter((q) => q.state === 'flying'
      && !(cv.launching && cv.launching.sqId === q.id)
      && !state.planes.some((p) => p.owner === cv.id && p.sqId === q.id));
    for (const q of cv.squadrons) if (q.state === 'deck') came.add(q.id);
    stuckFor = bad.length ? stuckFor + 1 : 0;
    assert.ok(stuckFor < 30 * 3,
      `squadron ${bad[0] && bad[0].id} has been flying with nothing in the air for 3s`);
  }
  assert.ok(launched >= 4, `she only got ${launched} strikes away in eight minutes`);
  // Four strikes off three squadrons is only possible if squadrons came back
  // and went again -- and every one of them has to have been struck below at
  // some point, not just the lucky one.
  for (const q of cv.squadrons) {
    assert.ok(came.has(q.id), `squadron ${q.id} never once came home`);
  }
});

check('a flight shot down is reported once, not twice', () => {
  // A flight killed by another flight is marked dead and left in the array so
  // whatever killed it can still find it. Before, the loop then reached it and
  // reported it lost all over again -- two "squadron lost" messages, and two
  // attempts to bring the same squadron home.
  const state = createState(generateWorld(9091, 'open_ocean'), { mode: 'deathmatch' });
  const cv = addShip(state, { name: 'CV', classId: 'enterprise', team: 0, index: 0 });
  const cv2 = addShip(state, { name: 'CV2', classId: 'enterprise', team: 1, index: 0 });
  // Well apart, so the dogfight below happens out of reach of either ship's
  // anti-aircraft fire and the only thing that can kill a flight is another
  // flight -- which is the path under test.
  cv.x = 0; cv.z = 0; cv2.x = 0; cv2.z = 12000;
  cv.aimX = cv2.x; cv.aimZ = cv2.z;
  cv2.aimX = cv.x; cv2.aimZ = cv.z;
  assert.ok(launchStrike(state, cv) && launchStrike(state, cv2), 'both would not launch');
  // Wait for the flights to get off the deck -- one at a time, so the whole
  // strike takes three deck runs -- then put the two forces on top of one
  // another so the fighters are certain to meet.
  // Long enough for both strikes to be up AND to have formed up and set off:
  // a flight still circling its own carrier waiting for the rest of the strike
  // is not hunting anything, so putting two of them nose to nose proves
  // nothing.
  for (let i = 0; i < 30 * (STRIKE_RUN + 30); i++) {
    for (const s of state.ships) s.spottedBy = [true, true];
    step(state, DT);
  }
  assert.ok(state.planes.length >= 6, `only ${state.planes.length} flights got up`);
  assert.ok(state.planes.every((p) => p.phase !== 'formup'),
    'the strikes never left their form-up circles');
  for (const p of state.planes) { p.x = 11000 + (p.team ? 60 : 0); p.z = 6000; }
  const seen = [];
  let killedByFighters = 0;
  // A fighter engagement is not settled in a pass: they wear each other down.
  // One Wildcat flight against another at twenty-six rounds a second takes
  // over a minute of contact, and they are turning about each other the whole
  // time -- so the window has to be long enough for one of them to lose.
  for (let i = 0; i < 30 * 150; i++) {
    for (const s of state.ships) s.spottedBy = [true, true];
    for (const e of step(state, DT)) {
      if (e.e !== 'planesLost') continue;
      seen.push(e.i);
      if (e.why === 'fighters') killedByFighters++;
    }
  }
  assert.ok(killedByFighters > 0, 'the fighters never got into it, so nothing was tested');
  assert.equal(new Set(seen).size, seen.length,
    `${seen.length - new Set(seen).size} flight(s) were reported lost twice`);
});

check('a strike gets through and drops what it is carrying', () => {
  // The point of having aircraft at all. Anti-aircraft fire used to be at full
  // effect out to the edge of its envelope, so a strike crossing a battleship's
  // five and a half thousand metres of it was under something close to
  // point-blank fire for a minute and a quarter each way -- and the arithmetic
  // of that was that nothing ever arrived. Every squadron the Enterprise flew
  // off was shot into the sea three thousand metres short of the ship it was
  // sent to attack, and no bomb was ever dropped and no torpedo ever entered
  // the water.
  //
  // A strike is meant to get through and to lose part of itself doing it.
  const st = createState(generateWorld(5, 'open_ocean'), { mode: 'deathmatch' });
  const cv = addShip(st, { name: 'Big E', classId: 'enterprise', team: 0, index: 0 });
  const foe = addShip(st, { name: 'Foe', classId: 'iowa', team: 1, index: 0 });
  cv.x = 0; cv.z = 0;
  foe.x = 0; foe.z = 9000;

  let bombs = 0;
  let hits = 0;
  let dropped = 0;
  let lost = 0;
  let closest = 1e9;
  let bomb = null;
  for (let i = 0; i < 30 * 420; i++) {
    foe.spottedBy[0] = 3;
    cv.aimX = foe.x; cv.aimZ = foe.z;
    if (i % 300 === 0) launchStrike(st, cv);
    for (const ev of step(st, DT)) {
      if (ev.e === 'bomb') { bombs++; if (ev.hit) hits++; bomb = bomb || ev; }
      if (ev.e === 'airDrop') dropped++;
      if (ev.e === 'planesLost') lost++;
    }
    for (const p of st.planes) closest = Math.min(closest, dist(p.x, p.z, foe.x, foe.z));
  }
  assert.ok(closest < 900, `the strike never got closer than ${Math.round(closest)} m`);
  assert.ok(bombs > 0, 'not one bomb was dropped in seven minutes');
  assert.ok(hits > 0, `${bombs} bombs were dropped in seven minutes and every one missed`);
  assert.ok(dropped > 0, 'not one torpedo went into the water');
  assert.ok(foe.hp < foe.maxHp * 0.95, 'the strike did her no harm worth counting');
  // And the flak is not decorative either: a strike against a battleship pays
  // for what it does.
  assert.ok(lost > 0, 'she flew through a battleship\'s light battery untouched');

  // A bomb's own arithmetic: where it is going is sent with it, so the client
  // can fly the body down, and a miss goes into the water near her rather than
  // nowhere at all.
  assert.ok(bomb, 'no bomb was reported at all');
  assert.ok(Number.isFinite(bomb.tx) && Number.isFinite(bomb.tz),
    'a bomb was dropped without saying where it was going');
  assert.ok(dist(bomb.tx, bomb.tz, bomb.x, bomb.z) < 500,
    'a bomb was let go half a mile from what it was aimed at, which is not dive bombing');
});

check('a bomb is aimed the way a bombsight aims one', () => {
  // Released at the speed she is going, and falling under gravity against the
  // air: there is one angle that puts the bomb and the ship in the same place
  // and it is found by shooting the problem, not by drawing a curve between
  // two points and calling it an arc.
  //
  // A dive bomber lets go a few hundred metres out from two hundred up, so the
  // answer has to be nose-down. If it comes out nose-up she is lobbing.
  const dive = bombAim(260, 220, 108);
  assert.ok(dive.theta < -0.3,
    `she lets go at ${((dive.theta * 180) / Math.PI).toFixed(0)}\u00b0, which is not a dive`);
  assert.ok(dive.fall > 1.5 && dive.fall < 6,
    `the bomb is in the air ${dive.fall.toFixed(1)} s, which is not a fall of 220 m`);
  // Closer in is steeper, further out is shallower, and both are monotonic:
  // that is what makes the bisection above sound.
  assert.ok(bombAim(120, 220, 108).theta < dive.theta, 'closer in is not steeper');
  assert.ok(bombAim(420, 220, 108).theta > dive.theta, 'further out is not shallower');
  // And a longer fall from higher up, which is the other half of the sum.
  assert.ok(bombAim(260, 420, 108).fall > dive.fall, 'twice the height is not a longer fall');
  // And the air is really in it: dropped from rest a bomb does not go on
  // accelerating for ever, she settles at her terminal velocity, and a
  // thousand-pounder's is about three hundred metres a second.
  const b = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  for (let t = 0; t < 120; t += 1 / 60) bombStep(b, 1 / 60);
  const vT = -b.vy;
  assert.ok(vT > 250 && vT < 340,
    `a bomb falls at ${vT.toFixed(0)} m/s after two minutes, which is a vacuum`);
});

check('an aeroplane leaves the deck where the deck run leaves her', () => {
  // She used to be born at the ship -- three or four hundred metres from the
  // aeroplane you had just watched run the length of the flight deck and go
  // off the bow -- and the client, finding the model it was drawing that far
  // from the flight it belonged to, dragged one onto the other at half the
  // remaining distance every frame. That is the take-off where she teleports.
  const st = createState(generateWorld(77, 'open_ocean'), { mode: 'deathmatch' });
  const cv = addShip(st, {
    name: 'Big E', classId: 'enterprise', team: 0, index: 0,
    airGroup: { fighters: 4, dive: 0, torpedo: 0 },
  });
  cv.x = 0; cv.z = 0; cv.heading = 0; cv.notch = 0; cv.speed = 0;
  // Laid on a target on her beam, so that leaving the deck on her own head and
  // turning onto the strike are visibly two different things.
  cv.aimX = 6000; cv.aimZ = 0;
  assert.ok(launchStrike(st, cv), 'she would not launch');
  let p = null;
  for (let i = 0; i < Math.ceil((DECK_RUN + 1) / DT) && !p; i++) {
    step(st, DT);
    p = st.planes[0] || null;
  }
  assert.ok(p, 'nothing left the deck at all');
  // Off the bow on her own head -- she is heading due north here -- about
  // where five hundred feet of deck run and a climb-out leave an aeroplane.
  const ahead = p.z - cv.z;
  const abeam = Math.abs(p.x - cv.x);
  assert.ok(abeam < 30, `she left the deck ${abeam.toFixed(0)} m off the beam`);
  assert.ok(ahead > 120 && ahead < 340,
    `she appeared ${ahead.toFixed(0)} m from the ship, not off the bow`);
  assert.ok(Math.abs(angleDelta(cv.heading, p.heading)) < 0.2,
    'she left the deck pointing somewhere other than down it');
  // And she turns onto the strike from there rather than starting on it: the
  // deck run is down her centreline, whatever she has been laid on.
  for (let i = 0; i < 30 * 12; i++) step(st, DT);
  assert.ok(Math.abs(angleDelta(cv.heading, st.planes[0].heading)) > 0.05,
    'she never came round onto her target');
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
  // One at a time down the deck: after the first deck run there is exactly one
  // aeroplane in the air, not the whole strike.
  for (let i = 0; i < Math.ceil((DECK_RUN + 0.5) / DT); i++) step(st, DT);
  assert.equal(st.planes.length, 1,
    `${st.planes.length} flights left the deck abreast on the first run`);
  for (let i = 0; i < Math.ceil((STRIKE_RUN - DECK_RUN) / DT); i++) step(st, DT);
  const roles = st.planes.map((p) => p.role).sort();
  assert.deepEqual(roles, ['dive', 'fighter', 'torpedo'],
    `she sent up ${JSON.stringify(roles)}`);
  // And they went one after another: each has been in the air a deck run
  // longer than the one behind her.
  const lives = st.planes.map((p) => p.life).sort((a, b) => b - a);
  for (let i = 1; i < lives.length; i++) {
    const gap = lives[i - 1] - lives[i];
    assert.ok(Math.abs(gap - DECK_RUN) < 1,
      `two flights left the deck ${gap.toFixed(1)} s apart, not ${DECK_RUN}`);
  }
  assert.ok(st.planes.every((p) => p.sqId === st.planes[0].sqId), 'they came off different squadrons');
  // One flight home does not put the squadron back on the board while the
  // other two are still over the enemy.
  const sq = cv.squadrons.find((q) => q.state === 'flying');
  assert.ok(sq, 'nothing is marked flying');
  st.planes = st.planes.slice(1);
  assert.equal(cv.squadrons.find((q) => q.id === sq.id).state, 'flying',
    'the squadron came back on the board with two flights still up');
});

check('a strike forms up over the ship and goes out in company', () => {
  // Three flights leaving one at a time used to set off one at a time as well,
  // and since they all cruise at the same speed the last of them could never
  // close the mile and a half the first had on her. What arrived over the
  // enemy was a queue. It forms up now: the leader flies a circle over the
  // ship until the rest of the strike is on her, and then they go together.
  const st = createState(generateWorld(4242, 'open_ocean'), { mode: 'deathmatch' });
  const cv = addShip(st, { name: 'CV', classId: 'enterprise', team: 0, index: 0 });
  const foe = addShip(st, { name: 'BB', classId: 'iowa', team: 1, index: 0 });
  cv.x = 0; cv.z = 0; foe.x = 0; foe.z = 9000;
  cv.aimX = foe.x; cv.aimZ = foe.z;
  assert.ok(launchStrike(st, cv), 'she would not launch');

  // Every flight, every tick, for the whole sortie: nothing may ever move
  // further in one tick than an aeroplane can fly in one. This is the check
  // that says there is no teleport left anywhere in the flight path.
  const last = new Map();
  let worst = 0;
  let together = 0;
  let departed = 0;
  const spans = [];
  for (let i = 0; i < 30 * 260; i++) {
    for (const s of st.ships) s.spottedBy = [true, true];
    step(st, DT);
    for (const p of st.planes) {
      const was = last.get(p.id);
      if (was) worst = Math.max(worst, Math.hypot(p.x - was.x, p.z - was.z));
      last.set(p.id, { x: p.x, z: p.z });
    }
    if (!departed && st.planes.length >= 3 && st.planes.every((p) => p.phase === 'outbound')) {
      departed = st.t;
    }
    // How spread out the strike is on passage: after it has set off, and
    // before it is in to attack. Over the target it is meant to come apart --
    // the torpedo bombers go down to the water and out to the beam while the
    // dive bombers climb over the top -- so that is not the question here.
    const far = st.planes.length ? Math.min(...st.ships
      .filter((q) => q.alive && q.team !== st.planes[0].team)
      .map((q) => dist(st.planes[0].x, st.planes[0].z, q.x, q.z))) : 0;
    if (departed && st.t > departed + 25 && far > 4000 && st.planes.length >= 3
      && st.planes.every((p) => p.phase === 'outbound')) {
      let span = 0;
      for (const a of st.planes) {
        for (const b of st.planes) span = Math.max(span, Math.hypot(a.x - b.x, a.z - b.z));
      }
      spans.push(span);
      if (span < 900) together++;
    }
  }
  // A flight cruises at seventy-eight metres a second, which is 2.6 m a tick.
  assert.ok(worst < 8, `a flight moved ${worst.toFixed(0)} m in one tick`);
  assert.ok(departed > 0, 'the strike never set off');
  assert.ok(spans.length > 100, 'the strike was never all outbound together');
  assert.ok(departed < 140, `the strike took ${departed.toFixed(0)} s to set off`);
  const widest = Math.max(...spans);
  assert.ok(widest < 1500,
    `the strike was strung out over ${widest.toFixed(0)} m`);
  assert.ok(together > spans.length * 0.8,
    `the strike was only in company for ${together} of ${spans.length} ticks`);
});

check('the deck says which flight the aeroplane that just left it became', () => {
  // The client draws one aeroplane in full -- the one it watched go down the
  // deck -- and it has to know which marker on the plot she is. It used to
  // guess "whichever flight is youngest", and the answer changed under it
  // every time another aeroplane went: the one already up was let go of and
  // snapped onto the new one's formation. The simulation names her instead.
  const st = createState(generateWorld(515, 'open_ocean'), { mode: 'deathmatch' });
  const cv = addShip(st, { name: 'CV', classId: 'enterprise', team: 0, index: 0 });
  const foe = addShip(st, { name: 'BB', classId: 'iowa', team: 1, index: 0 });
  cv.x = 0; cv.z = 0; foe.x = 0; foe.z = 6000;
  cv.aimX = foe.x; cv.aimZ = foe.z;
  launchStrike(st, cv);
  const named = [];
  for (let i = 0; i < 30 * (DECK_RUN * 3 + 4); i++) {
    for (const e of step(st, DT)) if (e.e === 'airborne') named.push(e);
  }
  assert.equal(named.length, 3, `${named.length} aeroplanes were named off the deck, not 3`);
  for (const e of named) assert.equal(e.ship, cv.id, 'the wrong ship was named');
  // Each name is a different flight, and between them they are the whole
  // strike -- nobody is named twice and nobody is left out.
  const ids = new Set(named.map((e) => e.i));
  assert.equal(ids.size, 3, 'the same flight was named twice');
  for (const p of st.planes) {
    assert.ok(ids.has(p.id), `flight ${p.id} got up without being named`);
  }
});

check('every ship has an inside, and it is inside her', () => {
  // A hull used to be a shell with nothing behind the plating. Open her up --
  // and a compartment blown out of her does open her up -- and you were
  // looking through the ship at the sea on the far side. She has decks,
  // bulkheads, machinery and magazines now, fitted to her own lines.
  //
  // Fitted to her own lines is the thing that has to be checked: an interior
  // built to the wrong beam sticks out through the plating, and what you get
  // is a boiler hanging in the air alongside an undamaged ship.
  for (const id of ['fletcher', 'cleveland', 'hipper', 'iowa', 'enterprise']) {
    const built = buildShip(id);
    const cls = SHIP_CLASSES[id];
    const inside = built.group.children.filter((c) => c.isMesh
      && c.userData.mergeKey === 'in');
    assert.equal(inside.length > 0, true, `${id} has nothing inside her`);

    // Everything inside her is inside her: no wider than her beam, no deeper
    // than her keel, and no higher than her deck.
    let tris = 0;
    const bb = new THREE.Box3();
    for (const m of inside) {
      m.geometry.computeBoundingBox();
      bb.union(m.geometry.boundingBox);
      const ix = m.geometry.getIndex();
      tris += (ix ? ix.count : m.geometry.attributes.position.count) / 3;
    }
    const beam = cls.hull.beam / 2;
    assert.ok(bb.max.x <= beam + 0.6 && bb.min.x >= -beam - 0.6,
      `${id}'s insides stick out to ${bb.max.x.toFixed(1)} on a ${beam.toFixed(1)} m half-beam`);
    assert.ok(bb.min.y >= -cls.hull.draft - 1.5,
      `${id}'s insides go down to ${bb.min.y.toFixed(1)} below a ${cls.hull.draft} m draft`);
    assert.ok(bb.max.z <= cls.hull.length / 2 + 1 && bb.min.z >= -cls.hull.length / 2 - 1,
      `${id}'s insides run past her own ends`);

    // And not a point of it outside her plating -- tested against the plating
    // she is actually drawn with, by shooting a ray out from her centreline at
    // the point's own height and station and asking where her side really is.
    //
    // It used to be tested against her lines: the curve her plating was lofted
    // through. That is not the same thing and it never was. A warship is her
    // lines plus everything the yard did on top of them, and where the two
    // disagree -- a bottom that tucks in faster than the curve, a counter that
    // narrows to the sternpost, a hard chine four metres down -- the lines are
    // generous. On the Hipper they are generous by six metres. So an interior
    // built to them passed this check with hundreds of points of bulkhead,
    // frame and boiler standing outside her, which is exactly what you could
    // see from alongside, and worst under the waterline because that is where
    // the difference is worst.
    const L = built.group.userData.lines;
    assert.ok(L, `${id} does not carry the lines she was built to`);
    const outboard = shellRuler(built.group);
    let proud = 0;
    let sunkenProud = 0;
    let worst = 0;
    let mark = null;
    const halfLen = cls.hull.length / 2;
    for (const m of inside) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const px = Math.abs(pos.getX(i));
        const py = pos.getY(i);
        const pz = pos.getZ(i);
        if (Math.abs(pz) > halfLen) continue;
        const side = outboard(py, pz);
        if (side < 0) continue;              // no plating at all on that line
        const over = px - side;
        if (over > 0.15) { proud++; if (py < 0) sunkenProud++; }
        if (over > worst) { worst = over; mark = [px, py, pz]; }
      }
    }
    assert.equal(proud, 0,
      `${id} has ${proud} points of her insides outside her plating `
      + `(${sunkenProud} of them under the waterline), worst ${worst.toFixed(2)} m at `
      + `${mark && mark.map((v) => v.toFixed(0)).join(',')}`);

    // And there is enough of it to be worth looking at: decks, bulkheads,
    // boilers, turbines, magazines and the steering gear.
    assert.ok(tris > 900, `${id} has only ${tris | 0} triangles inside her`);

    // Specifically, there is machinery in the machinery space. Decks and
    // bulkheads alone are a set of empty shelves: what makes an engine room
    // read as an engine room is the boilers and the turbines in it, and they
    // have to be down in the bottom of her amidships where they belong.
    const half = cls.hull.length / 2;
    const deep = -cls.hull.draft * 0.55;
    let low = 0;
    for (const m of inside) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const z = pos.getZ(i);
        if (y < deep && Math.abs(z) < half * 0.22) low++;
      }
    }
    assert.ok(low > 250,
      `${id} has only ${low} points of machinery in the bottom of her amidships`);
  }
});

check('a compartment blown out of her opens the ship up', () => {
  // Her plating is welded one buffer per compartment, so the compartment that
  // has gone can have its plating taken off -- and what is behind it is the
  // inside of the ship. Everything standing on that piece of deck goes with
  // it; everything on the rest of her stays.
  for (const id of ['fletcher', 'hipper', 'iowa']) {
    const view = { group: buildShip(id).group };
    const half = SHIP_CLASSES[id].hull.length / 2;
    const plating = new Map();
    for (const c of view.group.children) {
      if (!c.isMesh) continue;
      const k = meshSection(c);
      if (!k) continue;
      plating.set(k, (plating.get(k) || 0) + 1);
    }
    // Every compartment along her has plating of its own.
    for (const sec of SECTIONS) {
      if (sec.from === null) continue;
      assert.ok(plating.get(sec.k) > 0,
        `${id} has no plating welded for her ${sec.name}`);
    }
    // Taking one off leaves the rest of her, and leaves her insides.
    const before = view.group.children.filter((c) => c.isMesh && c.visible).length;
    let hid = 0;
    for (const c of view.group.children) {
      if (c.isMesh && meshSection(c) === 'mid') { c.visible = false; hid++; }
    }
    assert.ok(hid > 0, `${id} lost no plating when her machinery went`);
    const after = view.group.children.filter((c) => c.isMesh && c.visible).length;
    assert.equal(after, before - hid, `${id} lost the wrong things`);
    const stillInside = view.group.children.some((c) => c.isMesh && c.visible
      && c.userData.mergeKey === 'in');
    assert.ok(stillInside, `${id} has nothing left to see through the hole`);
  }
});

check('nothing takes off over a hole in the flight deck', () => {
  const st = createState(generateWorld(818, 'open_ocean'), { mode: 'deathmatch' });
  const cv = addShip(st, { name: 'CV', classId: 'enterprise', team: 0, index: 0 });
  const foe = addShip(st, { name: 'BB', classId: 'iowa', team: 1, index: 0 });
  cv.x = 0; cv.z = 0; foe.x = 0; foe.z = 6000;
  cv.aimX = foe.x; cv.aimZ = foe.z;
  assert.equal(flightDeckOut(cv), false, 'her deck is out before anything has hit her');
  assert.ok(launchStrike(st, cv), 'she would not launch with a sound deck');

  // Now blow the machinery out from under the flight deck while an aeroplane
  // is on the run down it. She has nowhere to go.
  for (let i = 0; i < 30 * 5; i++) step(st, DT);
  assert.ok(cv.launching, 'nothing was on the deck run');
  cv.sections.mid.hp = 0;
  cv.hp = hullIntegrity(cv);
  assert.equal(flightDeckOut(cv), true, 'her deck is not out with her machinery gone');
  let crashed = false;
  for (let i = 0; i < 30 * 3 && !crashed; i++) {
    for (const e of step(st, DT)) if (e.e === 'deckCrash') crashed = true;
  }
  assert.ok(crashed, 'she ran off the end of a wrecked deck without crashing');
  assert.equal(cv.launching, null, 'the launch carried on over the hole');

  // And nothing else goes until the deck is fit to use.
  cv.deckBusy = 0;
  for (const q of cv.squadrons) q.cooldown = 0;
  assert.equal(launchStrike(st, cv), false, 'she launched off a wrecked deck');
  // Mended, and she can fly again.
  cv.sections.mid.hp = cv.sections.mid.max;
  cv.hp = hullIntegrity(cv);
  assert.equal(flightDeckOut(cv), false, 'her deck is still out after repairs');
  assert.ok(launchStrike(st, cv), 'she would not launch after her deck was made good');
});

check('a flight with no deck to come home to goes in the water', () => {
  const st = createState(generateWorld(919, 'open_ocean'), { mode: 'deathmatch' });
  const cv = addShip(st, { name: 'CV', classId: 'enterprise', team: 0, index: 0 });
  const foe = addShip(st, { name: 'BB', classId: 'iowa', team: 1, index: 0 });
  cv.x = 0; cv.z = 0; foe.x = 0; foe.z = 6000;
  cv.aimX = foe.x; cv.aimZ = foe.z;
  launchStrike(st, cv);
  for (let i = 0; i < 30 * (DECK_RUN + 3); i++) step(st, DT);
  const p = st.planes[0];
  assert.ok(p, 'nothing got up');
  // Her ship's machinery goes while she is out. She comes home to a hole.
  cv.sections.mid.hp = 0;
  cv.hp = hullIntegrity(cv);
  p.phase = 'return';
  p.lead = p.id;
  p.x = cv.x + 40; p.z = cv.z + 40;
  let ditched = null;
  for (let i = 0; i < 30 * 6 && !ditched; i++) {
    for (const e of step(st, DT)) if (e.e === 'planesLost' && e.i === p.id) ditched = e;
  }
  assert.ok(ditched, 'she landed on a flight deck that is not there');
  assert.equal(ditched.why, 'nodeck', `she was lost to ${ditched && ditched.why}`);
});

check('the deck hands her over where and how she left it', () => {
  // The aeroplane the player watches go down the deck and the aeroplane the
  // formation draws a moment later have to be the same aeroplane in the same
  // place at the same attitude, or the hand-over is a flick.
  const built = buildEnterprise();
  const deck = built.group.userData.deck;
  const plane = built.deckPlane;
  built.group.userData.step(0);
  built.group.userData.launch(0);
  // The last frame she is actually drawn in, which is the pose whatever takes
  // her over has to pick her up at.
  let last = null;
  for (let t = 0; t <= DECK_RUN + 0.5; t += 1 / 60) {
    built.group.userData.step(t);
    if (plane.visible) last = { z: plane.position.z, y: plane.position.y, p: plane.rotation.x };
  }

  // Where the evolution actually leaves her, and where the deck says it does.
  assert.ok(deck.endPose, 'the deck does not say where the run leaves her');
  assert.ok(last, 'she was never drawn at all');
  assert.ok(Math.abs(last.z - deck.endPose.z) < 3.5
    && Math.abs(last.y - deck.endPose.y) < 1.2,
    `the deck says ${deck.endPose.z.toFixed(1)} but leaves her at ${last.z.toFixed(1)}`);
  assert.ok(Math.abs(last.p - deck.endPose.pitch) < 0.05,
    'the deck says a different attitude from the one she is in');

  // And she is nose UP, because she is climbing away off the bow. Drawn nose
  // down here and nose up by the formation, the hand-over flicked her through
  // seventeen degrees.
  assert.ok(last.p > 0.05,
    `she leaves the deck at ${last.p.toFixed(3)}, which is nose down`);

  // And once she is away, the model is not left standing where the run
  // finished. That is a hundred and fifty metres off the bow and forty metres
  // up, and everything that ever showed her again -- the next evolution, a
  // recovery, changing ships -- showed her hanging there. She is struck below,
  // inside the ship, which is where a carrier's aircraft live.
  assert.ok(deck.airborne, 'she never left the deck');
  assert.ok(!plane.visible, 'the aeroplane that has gone is still being drawn');
  assert.ok(plane.position.y < FD && Math.abs(plane.position.z) < built.length * 0.5,
    `she is parked at ${plane.position.z.toFixed(0)} m, ${plane.position.y.toFixed(0)} m up`);

  // The simulation puts her flight up at the same place, so the formation
  // draws her where she already is.
  assert.ok(Math.abs(DECK_RUN_OUT - deck.endPose.z) < 12,
    `the deck leaves her at ${deck.endPose.z.toFixed(0)} and her flight is born at ${DECK_RUN_OUT}`);
});

check('a shell that gets through opens her plating, and the sea comes in', () => {
  // A penetration used to be an entry in a book: a number off the hit points
  // and a counter incremented. It is a hole now, of a size, at a depth, on a
  // side -- and below the waterline the sea comes through it.
  const { state, a, b } = duel('iowa', 'cleveland', 9000);
  a.aimX = b.x; a.aimZ = b.z;
  const before = JSON.stringify(b.sections.mid);
  // A sixteen-inch shell into her machinery, two metres under water.
  const sh = {
    id: 1, owner: a.id, team: a.team, caliber: 406,
    spec: { type: 'ap', pen: 700, damage: 5000, fireChance: 0, shells: { ap: { velocity: 762 } } },
    x: b.x, y: -2, z: b.z, vx: 0, vy: -40, vz: 400, life: 2,
  };
  resolveShellHit(state, sh, b, b.x, b.z, -2);
  assert.notEqual(JSON.stringify(b.sections.mid), before, 'nothing happened to her at all');
  const holed = SECTIONS.some((k) => {
    const c = b.sections[k.k];
    return c.holeP + c.holeS > 0;
  });
  assert.ok(holed, 'a sixteen-inch shell through her side left her watertight');
  // And that hole lets water in, which nothing else in the model does.
  const wet = () => SECTIONS.reduce((n, k) => n + b.sections[k.k].water, 0);
  const w0 = wet();
  for (let i = 0; i < 30 * 20; i++) step(state, DT);
  assert.ok(wet() > w0 + 1, 'the hole is below her waterline and let nothing in');
  assert.ok(b.sink > 0, 'all that water has not put her any deeper');
});

check('the sea decides how she sinks, and it is never the same twice', () => {
  // No canned animation: how long she lasts, how far over she goes and which
  // way she is down by all come out of where the water is. Three ships, three
  // different endings, from the same code.
  const put = (cls, holes) => {
    const world = generateWorld(3, 'open_ocean');
    const st = createState(world, { mode: 'deathmatch' });
    const s = addShip(st, { name: 'A', classId: cls, team: 0, index: 0 });
    const foe = addShip(st, { name: 'B', classId: 'fletcher', team: 1, index: 0 });
    foe.x = s.x + 60000; foe.z = s.z + 60000;      // hull down, out of it
    for (const [k, side, area] of holes) {
      s.sections[k][side] = area;
      s.sections[k].holeY = 4;
      // A torpedo does not only open her plating: it wrecks the compartment
      // it goes into, and a wrecked compartment's bulkheads do not hold the
      // water back. That is why one hit floods more than one space.
      s.sections[k].hp = 0;
    }
    s.hp = hullIntegrity(s);
    let t = 0;
    let peakHeel = 0;
    for (let i = 0; i < 30 * 900; i++) {
      step(st, DT);
      // She is being tested for flooding, not for pilotage.
      s.x = Math.max(-4000, Math.min(4000, s.x));
      s.z = Math.max(-4000, Math.min(4000, s.z));
      t += DT;
      peakHeel = Math.max(peakHeel, Math.abs(s.heel));
      if (!s.alive) break;
    }
    return { ship: s, t, peakHeel, alive: s.alive };
  };

  // One torpedo in a destroyer's forward magazine: she lists to the side it
  // went in, is slowed right down, and goes.
  const one = put('fletcher', [['fwd', 'holeS', 26]]);
  assert.equal(one.alive, false, 'a torpedo forward did not sink a destroyer at all');
  assert.ok(one.ship.heel > 0.08,
    `she went down with a list of ${(one.ship.heel * 57.3).toFixed(0)} degrees to starboard`);
  assert.ok(one.t > 20 && one.t < 400,
    `she took ${one.t.toFixed(0)} s, which is either instant or for ever`);

  // Two on the same side: over much further, and much faster.
  const same = put('fletcher', [['fwd', 'holeS', 26], ['mid', 'holeS', 24]]);
  assert.equal(same.alive, false, 'two torpedoes did not sink a destroyer');
  assert.ok(same.t < one.t, 'two torpedoes took longer than one');
  assert.ok(same.peakHeel > one.peakHeel,
    'two torpedoes in the same side did not lay her over further than one');

  // And two on opposite sides -- which is counter-flooding. The water is on
  // both sides of her instead of one, so she stays much more upright, and she
  // stays afloat much longer, even though she has taken just as much sea
  // aboard. That is the whole reason ships were counter-flooded.
  const both = put('fletcher', [['fwd', 'holeS', 26], ['aft', 'holeP', 24]]);
  assert.ok(both.peakHeel < same.peakHeel * 0.5,
    `counter-flooded she still lay over ${(both.peakHeel * 57.3).toFixed(0)} degrees `
    + `against ${(same.peakHeel * 57.3).toFixed(0)} for the same water on one side`);
  assert.ok(both.ship.sink > 0.3, 'she took two torpedoes and did not settle at all');
  assert.ok(both.t > same.t * 1.5,
    `counter-flooded she lasted ${both.t.toFixed(0)} s against ${same.t.toFixed(0)}`);
});

check('water in her costs her speed, and the list costs her more', () => {
  const world = generateWorld(11, 'open_ocean');
  const mk = () => {
    const st = createState(world, { mode: 'deathmatch' });
    const s = addShip(st, { name: 'A', classId: 'cleveland', team: 0, index: 0 });
    s.notch = 5;
    return { st, s };
  };
  const run = (s, st, secs) => {
    for (let i = 0; i < 30 * secs; i++) {
      step(st, DT);
      s.x = Math.max(-4000, Math.min(4000, s.x));
      s.z = Math.max(-4000, Math.min(4000, s.z));
    }
    return s.speed;
  };
  const dry = mk();
  const fast = run(dry.s, dry.st, 90);
  const wet = mk();
  wet.s.sections.fwd.holeS = 8;
  wet.s.sections.fwd.holeY = 4;
  const slow = run(wet.s, wet.st, 90);
  assert.ok(fast > 12, `she never worked up: ${fast.toFixed(1)} m/s`);
  assert.ok(slow < fast * 0.85,
    `holed and listing she still made ${slow.toFixed(1)} against ${fast.toFixed(1)}`);
  assert.ok(wet.s.heel > 0.05, 'the water is all on one side and she is upright');
});

check('a fire spreads from the compartment it started in', () => {
  const { state, a } = duel('cleveland', 'iowa', 40000);
  a.sections.mid.fire = 0.9;
  const lit = () => SECTIONS.filter((k) => a.sections[k.k].fire > 0.05).map((k) => k.k);
  assert.deepEqual(lit(), ['mid'], 'it did not start where it was put');
  // A steel bulkhead holds a fire back until the structure round it has been
  // opened up, so it takes a couple of minutes to get next door -- which is
  // about what it took.
  for (let i = 0; i < 30 * 150; i++) step(state, DT);
  const now = lit();
  assert.ok(now.length > 1, 'a fire burned for two and a half minutes and went nowhere');
  assert.ok(now.includes('fwd') || now.includes('aft'),
    'it did not get through a bulkhead into the compartment next door');
  assert.ok(a.alive, 'a single fire burned a cruiser out on its own');
  // And the sea puts it out, which is the one good thing about the sea.
  a.sections.mid.holeS = 20;
  a.sections.mid.holeY = 4;
  for (let i = 0; i < 30 * 120; i++) step(state, DT);
  assert.ok(a.sections.mid.fire < 0.05,
    'the compartment flooded and the fire in it went on burning under water');
});

check('the aeroplane that has taken off is not left hanging in the air', () => {
  // The model on the deck and the flight on the plot are the same aeroplane.
  // Once the run is over the flight is being drawn out where the run left her,
  // so the model has to go: left where it was, it hangs a hundred and fifty
  // metres off the bow and forty metres up for the rest of the sortie -- an
  // aeroplane that takes off and then stops, levitating. The catapult ships
  // had exactly the same thing over the quarterdeck.
  const cv = buildEnterprise();
  cv.group.userData.step(0);
  cv.group.userData.launch(0);
  assert.equal(cv.deckPlane.visible, true, 'she is invisible on the lift');
  cv.group.userData.step(DECK_RUN * 0.6);
  assert.equal(cv.deckPlane.visible, true, 'she vanished in the middle of her run');
  for (const t of [DECK_RUN + 0.1, DECK_RUN + 5, DECK_RUN + 30]) {
    cv.group.userData.step(t);
    assert.equal(cv.deckPlane.visible, false,
      `the carrier's aeroplane is still being drawn ${(t - DECK_RUN).toFixed(1)} s after she left the deck`);
  }
  // And she comes back when the next one is ranged.
  cv.group.userData.stow();
  cv.group.userData.step(DECK_RUN + 31);
  assert.equal(cv.deckPlane.visible, true, 'nothing came up the lift for the next launch');

  const cl = buildCleveland();
  const deck = cl.group.userData.deck;
  cl.group.userData.step(0);
  cl.group.userData.launch(0);
  const scout = cl.group.userData.deckPlane;
  assert.equal(scout.visible, true, 'her scout is invisible on the cradle');
  const shot = deck.run;
  cl.group.userData.step(shot * 0.5);
  assert.equal(scout.visible, true, 'her scout vanished halfway down the track');
  for (const t of [shot + 0.5, shot + 10, shot + 40]) {
    cl.group.userData.step(t);
    assert.equal(scout.visible, false,
      `the cruiser's scout is still being drawn ${(t - shot).toFixed(1)} s after the shot`);
  }
  cl.group.userData.recover();
  cl.group.userData.step(shot + 41);
  assert.equal(scout.visible, true, 'nothing was craned back onto the cradle');
});

check('an aeroplane has a height, and gravity has her', () => {
  // A flight used to have no height at all: the client drew her at one worked
  // out from how long she had been up, so every aeroplane in the game climbed
  // at the same rate to the same altitude whatever she was and whatever she
  // was doing, and a dive bomber dived by changing a number nothing else could
  // see. She flies the vertical now, on her own rate of climb, against her own
  // weight.
  const st = createState(generateWorld(515, 'open_ocean'), { mode: 'deathmatch' });
  const cv = addShip(st, { name: 'CV', classId: 'enterprise', team: 0, index: 0 });
  const foe = addShip(st, { name: 'BB', classId: 'iowa', team: 1, index: 0 });
  cv.x = 0; cv.z = 0; foe.x = 0; foe.z = 9000;
  cv.aimX = foe.x; cv.aimZ = foe.z;
  launchStrike(st, cv);

  const seen = new Map();
  const low = new Map();
  const high = new Map();
  let worstRate = 0;
  // A dive bomber is the one thing here that is supposed to come down fast.
  let steepest = 0;
  let worstDive = 0;
  const was = new Map();
  for (let i = 0; i < 30 * 240; i++) {
    for (const s of st.ships) s.spottedBy = [true, true];
    step(st, DT);
    for (const p of st.planes) {
      if (!seen.has(p.id)) seen.set(p.id, { role: p.role, born: p.y });
      // On the way out. Everybody lets down onto the deck coming home, so
      // that is not what tells one kind from another.
      if (p.phase === 'outbound' && p.life > 40) {
        low.set(p.role, Math.min(low.get(p.role) ?? 1e9, p.y));
        high.set(p.role, Math.max(high.get(p.role) ?? -1e9, p.y));
      }
      const b = was.get(p.id);
      if (b !== undefined) {
        const rate = (p.y - b) / DT;
        if (p.role === 'dive') {
          steepest = Math.min(steepest, rate);
          worstDive = Math.max(worstDive, Math.abs(rate));
        } else {
          worstRate = Math.max(worstRate, Math.abs(rate));
        }
      }
      was.set(p.id, p.y);
    }
  }
  assert.ok(seen.size >= 3, 'nothing got up');
  // She is born at the height the launch leaves her at, not at cruise.
  for (const [, v] of seen) {
    assert.ok(v.born > 10 && v.born < 60,
      `she came off the deck at ${v.born.toFixed(0)} m`);
  }
  // Nothing changes height faster than an aeroplane can. Her best rate of
  // climb is about eleven metres a second and the airframe will stand a
  // forty-odd metre dive; anything past that is a marker being dragged.
  assert.ok(worstRate < 60,
    `something changed height at ${worstRate.toFixed(0)} m/s`);
  // A dive bomber does come down fast, because that is what she is: a real
  // dive, not a bomb dropped out of the window on the way past. She used to
  // fly flat at nine hundred metres and let go from there, and the bomb had to
  // be thrown thirty degrees above the horizontal to reach the ship at all.
  assert.ok(steepest < -55,
    `the dive bombers never came down faster than ${(-steepest).toFixed(0)} m/s`);
  // And she does not come down faster than the airframe will stand either.
  assert.ok(worstDive < 150,
    `a dive bomber changed height at ${worstDive.toFixed(0)} m/s`);
  // And the three kinds do different things in the vertical, because they are
  // doing different jobs: the torpedo bombers come right down on the water to
  // drop, and the dive bombers go up over the top to push down on her.
  assert.ok(low.get('torpedo') < 80,
    `the torpedo bombers never got below ${(low.get('torpedo') || 0).toFixed(0)} m`);
  assert.ok(high.get('dive') > high.get('torpedo') + 150,
    `the dive bombers topped out at ${(high.get('dive') || 0).toFixed(0)} m `
    + `against the torpedo bombers' ${(high.get('torpedo') || 0).toFixed(0)}`);
  assert.ok(low.get('dive') > low.get('torpedo'),
    'the dive bombers went as low as the torpedo bombers');
});

check("the Admiral Hipper flies her Arados off her catapult", () => {
  // She had a catapult, a hangar, a crane and three aeroplanes on her
  // datasheet, and no way whatever to use any of it.
  const cls = SHIP_CLASSES.hipper;
  assert.ok(cls.planes, 'she still has no air group');
  assert.ok(cls.planes.catapult, 'she is not a catapult ship');

  const st = createState(generateWorld(606, 'open_ocean'), { mode: 'deathmatch' });
  const ca = addShip(st, { name: 'Hipper', classId: 'hipper', team: 0, index: 0 });
  const foe = addShip(st, { name: 'Foe', classId: 'fletcher', team: 1, index: 0 });
  foe.x = ca.x + 5000; foe.z = ca.z;
  ca.aimX = foe.x; ca.aimZ = foe.z;
  assert.ok(launchStrike(st, ca), 'she would not launch');
  for (let i = 0; i < 30 * 40; i++) {
    for (const s of st.ships) s.spottedBy = [true, true];
    step(st, DT);
  }
  assert.ok(st.planes.length > 0, 'nothing came off her catapult');

  // Her catapult goes off the beam, not off the bow: the girder lies across
  // her. So her scout appears out on her side, and putting her a hundred and
  // fifty metres dead ahead instead would be a scout appearing a long way from
  // where you watched her go.
  const off = launchOffset(cls, 1);
  assert.ok(Math.abs(off.bearing) > 1.0,
    `her catapult shoots ${(off.bearing * 57.3).toFixed(0)} degrees off her head`);
  assert.ok(off.out > 60 && off.out < 200, `her shot ends ${off.out} m out`);

  // And the model works: the ring trains, the trolley runs out, and the
  // aeroplane is away and out of sight by the time the flight is on the plot.
  const built = buildHipper();
  const deck = built.group.userData.deck;
  assert.ok(deck, 'her model has no catapult to work');
  assert.equal(deck.run, cls.planes.deckRun,
    'her catapult is paced to something other than her own launch');
  built.group.userData.step(0);
  built.group.userData.launch(0);
  const car = () => deck.cat.car.position.z;
  const at0 = car();
  built.group.userData.step(deck.run * 0.75);
  assert.ok(car() > at0 + 8, 'her trolley never left the breech');
  built.group.userData.step(deck.run + 0.5);
  assert.equal(deck.cat.plane.visible, false, 'her scout is still on the girder');
});

check('a shell takes the plating it went through, and only that', () => {
  // The destruction model used to be six pieces of ship. Each compartment was
  // one welded buffer and it was switched off when the simulation said the
  // compartment had gone: forty metres of hull, deck, guardrails and boats
  // stopped existing between two frames, and nothing else could ever be
  // damaged at all. Every ship is now every triangle she is drawn out of, and
  // any of them can be taken out on its own -- so what goes is what the shell
  // arrived at, wherever that was.
  const built = buildShip('cleveland');
  const plating = new Plating(built.group);
  assert.ok(plating.total > 4000,
    `she is made of ${plating.total} pieces, which is not many`);
  assert.equal(plating.torn, 0, 'she starts the battle already holed');

  // A six-inch shell into her side, abreast the bridge, four metres up.
  const beam = SHIP_CLASSES.cleveland.hull.beam;
  const went = plating.punch(beam * 0.5, 4, 10, 2.0, 0);
  assert.ok(went > 0, 'a shell into her side took nothing off her');
  // And it is local. The stern is a hundred and eighty feet away and is not
  // anybody's business.
  const half = SHIP_CLASSES.cleveland.hull.length / 2;
  let far = 0;
  for (const part of plating.parts) {
    for (let t = 0; t < part.count; t++) {
      if (!part.dead[t]) continue;
      const cz = part.cent[t * 3 + 2];
      if (Math.abs(cz - 10) > 6) far++;
    }
  }
  assert.equal(far, 0, `${far} pieces went from somewhere the shell was not`);
  assert.ok(plating.torn / plating.total < 0.02,
    'one six-inch shell opened up a fiftieth of the ship');

  // Below the waterline it works the same way, which is what makes a hole you
  // can see from under her.
  // She tucks in below the waterline and narrows aft, so a shell arriving on
  // that bearing meets her side a couple of metres inboard of her extreme
  // beam. The burst reaches it either way.
  const before = plating.torn;
  plating.punch(beam * 0.5, -3, -30, 3.2, 0);
  assert.ok(plating.torn > before, 'a hit under her waterline took nothing off her');

  // A whole compartment, when one is blown out: torn out a slice at a time,
  // still as triangles, so it can be watched going rather than switched off.
  const gone = plating.strip(half * 0.2, half * 0.6);
  assert.ok(gone > 200, `a compartment blown out of her took ${gone} pieces`);
});

check('only a round that got through takes any of her with it', () => {
  // The rule the guns were designed round, and the one the simulation already
  // works to: a shell that bounced off the belt, shattered on the plate or went
  // clean through without bursting leaves a scar and a great deal of noise, and
  // the ship is the same shape afterwards.
  for (const kind of ['ricochet', 'shatter', 'splash']) {
    assert.equal(holeRadius(kind, 406), 0, `a ${kind} opened her plating`);
    assert.ok(!PENETRATING.has(kind), `${kind} counts as a penetration`);
  }
  // And one that did get through takes a piece of her about its own bore
  // across, or several times that where the burst blew the side in.
  for (const kind of ['pen', 'he', 'citadel', 'bomb', 'torpedo']) {
    assert.ok(holeRadius(kind, 406) > 0, `a ${kind} left her watertight`);
    assert.ok(PENETRATING.has(kind), `${kind} is not counted as a penetration`);
  }
  assert.ok(holeRadius('citadel', 406) > holeRadius('pen', 406),
    'a magazine hit opens no more of her than a clean penetration');
  assert.ok(holeRadius('pen', 406) > holeRadius('pen', 127),
    'a sixteen-inch shell makes the same hole as a five-inch');
  // The tear in the plating and the orifice the sea comes through are not the
  // same number -- the edges fold in -- but they have to be proportional, or
  // the hole a captain can see and the hole he is flooding through are
  // different holes. Roughly two to one on the radius.
  for (const kind of ['pen', 'citadel', 'he']) {
    const blown = { citadel: 9, he: 3.5, pen: 2.2 }[kind];
    const orifice = Math.sqrt((Math.PI * (0.406 * blown * 0.5) ** 2) / Math.PI);
    const ratio = holeRadius(kind, 406) / orifice;
    assert.ok(ratio > 1.7 && ratio < 2.3,
      `a ${kind} tears ${ratio.toFixed(1)} times the hole it floods through`);
  }
});

check('a big explosion throws the ship into the air', () => {
  // A magazine or a torpedo used to produce a flash, a cloud of sprites and a
  // number in the damage panel. What it produces is several tons of the ship:
  // plating, deck beams and ready-use rounds thrown up and out, tumbling, and
  // falling back into the sea.
  const sea = { heightAt: () => 0 };
  const debris = new Debris({ add() {} }, sea, 400);
  debris.burst(0, 20, 0, 6, 1);
  assert.ok(debris.items.length > 40,
    `a magazine threw ${debris.items.length} pieces out of her`);
  // Up first, and out.
  assert.ok(debris.items.some((d) => d.vy > 20), 'nothing was thrown upward');
  assert.ok(debris.items.some((d) => Math.hypot(d.vx, d.vz) > 15),
    'nothing was thrown outward');
  // Then gravity has it, and it goes into the sea.
  let splashes = 0;
  debris.onSplash = () => { splashes++; };
  let highest = 0;
  for (let i = 0; i < 60 * 20; i++) {
    debris.update(1 / 60);
    for (const d of debris.items) highest = Math.max(highest, d.y);
  }
  assert.ok(highest > 30, `the wreckage never got above ${highest.toFixed(0)} m`);
  assert.ok(splashes > 0, 'none of it went into the water');
  assert.equal(debris.items.length, 0, 'the wreckage is still in the air');
  assert.equal(debris.mesh.count, 0, 'and it is still being drawn');

  // A shell bursting inside her throws a great deal less than a magazine does.
  const small = new Debris({ add() {} }, sea, 400);
  small.burst(0, 8, 0, 1, 1);
  const big = new Debris({ add() {} }, sea, 400);
  big.burst(0, 8, 0, 9, 1);
  assert.ok(big.items.length > small.items.length * 2,
    'a magazine and a shell throw out the same wreckage');
});

check('a dive bomber climbs to the perch and dives on her target', () => {
  // She used to fly flat at nine hundred metres and let the bomb go from
  // there. The bomb had to be thrown thirty degrees above the horizontal to
  // reach the ship at all, and nothing about it looked like an attack. A dive
  // bomber climbs on the way in, comes over the top of her target and goes
  // down a straight line at fifty-odd degrees until she is close enough to be
  // sure of her aim.
  const st = createState(generateWorld(707, 'open_ocean'), { mode: 'deathmatch' });
  const cv = addShip(st, { name: 'CV', classId: 'enterprise', team: 0, index: 0 });
  const foe = addShip(st, { name: 'BB', classId: 'iowa', team: 1, index: 0 });
  cv.x = 0; cv.z = 0; foe.x = 0; foe.z = 11000;
  foe.speed = 0; foe.throttle = 0;
  cv.aimX = foe.x; cv.aimZ = foe.z;
  launchStrike(st, cv);

  // Her whole run in, sampled: how high she is and how far off the ship.
  const run = [];
  let dropped = null;
  for (let i = 0; i < 30 * 300 && dropped === null; i++) {
    for (const s of st.ships) s.spottedBy = [true, true];
    for (const ev of step(st, DT)) {
      if (ev.e === 'airDrop' && ev.r === 'dive') dropped = run[run.length - 1];
    }
    const p = st.planes.find((q) => q.role === 'dive' && !q.dead
      && q.phase === 'outbound');
    if (p) run.push({ d: dist(p.x, p.z, foe.x, foe.z), y: p.y, vy: p.vy || 0 });
  }
  assert.ok(run.length > 60, 'no dive bomber ever ran in');

  // The perch: she is higher over the target than she was on passage.
  const perch = Math.max(...run.filter((r) => r.d < 5000 && r.d > 850).map((r) => r.y));
  const far = Math.max(...run.filter((r) => r.d > 6000).map((r) => r.y), 0);
  assert.ok(perch > far + 300,
    `she cruised at ${far.toFixed(0)} m and pushed over from ${perch.toFixed(0)}`);

  // The dive itself, measured as an angle: how much height she gives up
  // against how much ground she covers between the pushover and the release.
  const inside = run.filter((r) => r.d < 850 && r.d > 300);
  assert.ok(inside.length > 3, 'she was never inside the pushover');
  const top = inside[0];
  const bottom = inside[inside.length - 1];
  const angle = Math.atan2(top.y - bottom.y, Math.max(1, top.d - bottom.d)) * 57.3;
  assert.ok(angle > 35,
    `she came down at ${angle.toFixed(0)} degrees, which is not a dive`);

  // And she lets go low, out of the dive, rather than lobbing it from height.
  assert.ok(dropped, 'she never dropped anything');
  assert.ok(dropped.y < 700,
    `she let the bomb go from ${dropped.y.toFixed(0)} m`);
  assert.ok(dropped.vy < -25,
    `she was going down at ${(-dropped.vy).toFixed(0)} m/s when she let go`);
});

check('the wire says how many compartments are flooding and how she is floating', () => {
  // Two different things, and they used to be sent under the same name. The
  // count of her flooded compartments was written first and the triple that
  // says how she is floating -- deeper, over, down by the head -- was written
  // second in the same object, so the count never left the ship at all. What
  // a captain read on the ship plate was "FLOODING x0,0,0".
  const st = createState(generateWorld(31, 'open_ocean'), { mode: 'deathmatch' });
  const sh = addShip(st, { name: 'A', classId: 'cleveland', team: 0, index: 0 });
  sh.flooding = 3;
  sh.sink = 1.4; sh.heel = 0.21; sh.trim = -0.05;
  const s = shipSnapshot(sh, true);
  assert.equal(s.fl, 3, `the wire says ${JSON.stringify(s.fl)} compartments are flooding`);
  assert.ok(Array.isArray(s.fo) && s.fo.length === 3, 'how she is floating is not on the wire');
  assert.ok(Math.abs(s.fo[0] - 1.4) < 0.1 && Math.abs(s.fo[1] - 0.21) < 0.01,
    `she is floating at ${JSON.stringify(s.fo)}`);
  // And the water in each compartment, which is what the hologram draws.
  assert.ok(Array.isArray(s.wt) && s.wt.length === SECTIONS.length,
    'the wire does not say where the water is');
});

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
