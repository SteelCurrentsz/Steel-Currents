// Monster One: what she can do, what can be done to her, and how she thinks.
//
// She is in the battle as a ship is -- a hull on the plot, a helm and a
// telegraph, detected, shot at, sunk -- because that is what everything else
// in the battle knows how to see and to fight. Everything that makes her not
// a ship is here.
//
//   * She goes about in three ways: down in the deep, where nothing on the
//     surface can see her or reach her with a shell; on the surface, swimming,
//     her plates out of the water; and standing up in it to her waist, to
//     fight. Deep she is the boat's dive (see stepDive); the other two are
//     hers.
//
//   * Her atomic breath. A long windup -- her plates light up crystal blue
//     from the tip of her tail to the back of her head, and then her throat --
//     and then a beam out of her mouth to wherever she is looking, and where
//     it strikes, a burst of a megaton. Two and a half minutes before she can
//     do it again.
//
//   * Her tail, swung up out of the sea and across whatever is beside or
//     behind her.
//
//   * Her hands: a ship close enough in front of her is taken hold of, lifted
//     out of the water if she is small enough and held down in it if she is
//     not, crushed, and thrown.
//
//   * She is hard to kill -- nothing in her burns or floods, and shells do
//     her half of what they would do a ship -- and she heals, slowly, when
//     she is left alone long enough. But she can be killed.
import { clamp, dist, headingTo, angleDelta } from './math.js';
import { getClass } from './ships.js';

const shipClass = (ship) => getClass(ship.classId);

/** Everything about her that is a number. */
export const MONSTER = {
  breath: {
    // From the order to the beam: the glow climbing her, then her throat.
    climb: 6.5,
    throat: 1.5,
    // The beam itself, and how fast it runs out to where it strikes.
    fire: 3.8,
    speed: 14000,
    // Two and a half minutes.
    cooldown: 150,
    // How far it reaches, and how close is too close to be worth it.
    range: 12000,
    min: 450,
    // A megaton.
    kt: 1000,
  },
  tail: {
    // The swing: up and away, across, and back (see the rig's 'tail').
    time: 2.6,
    // The moment it comes across, and what it reaches from her middle.
    hitAt: 1.15,
    reach: 215,
    cooldown: 7,
  },
  grab: {
    // Reaching for her and getting a hold.
    reach: 2.0,
    takeAt: 1.0,
    // Out of the deep, how much longer it takes her to come up under one.
    breach: 1.2,
    // How far out in front of her a ship can be and be taken: her hands are
    // a long way forward of her middle when she leans for one.
    range: 190,
    arc: 1.0,
    // The longest she holds on before she throws, the crush meanwhile, and
    // how far she throws.
    hold: 10,
    throwTime: 1.4,
    flight: 2.2,
    toss: 650,
    cooldown: 6,
    // A ship heavier than this is held down where she is, not lifted.
    lift: 26000,
  },
  // How long, after the last thing that hurt her, before she starts to heal,
  // and how fast she does: a share of her whole life a second.
  heal: { after: 25, rate: 0.0016 },
  // What each kind of harm is worth against her, against a ship.
  hurt: {
    nuke: 0.25, ram: 0.15, wave: 0, flood: 0, fire: 0, grounding: 0,
    torpedo: 0.6, depthCharge: 0.6, bomb: 0.55, mine: 0.5, missile: 0.55, rocket: 0.5,
    magazine: 0, other: 0.5,
  },
  // Her three ways of going about: how deep the dive puts her, and her best
  // speed in each, in knots.
  deep: 60,
  speed: { deep: 32, swim: 26, stand: 6 },
  // How long a change of posture takes before she can act out of it.
  settle: 1.6,
};

export const POSES = ['deep', 'swim', 'stand'];
export const ACTS = ['', 'tail', 'reach', 'hold', 'throw', 'charge', 'fire', 'roar', 'die'];

const KNOT = 0.514444;

/** Whether this is her. */
export function isMonster(ship) { return !!shipClass(ship).monster; }

/** Her own state, made the first time it is asked for. */
export function monsterOf(ship) {
  if (!ship.mo) {
    ship.mo = {
      pose: 'swim', poseT: 10,
      act: '', actT: 0, side: 1,
      // The breath: where it is going, how far up her the glow has got, and
      // how long before she can do it again.
      aim: null, aimId: 0, charge: 0, cool: 0, glow: 0,
      tailCool: 0, grabCool: 0,
      // A ship in her hands.
      holdId: 0,
      // When she was last hurt, for her healing.
      hurtAt: -1e9,
      // Something she was told to do that has to wait for her to be in the
      // right posture for it.
      queued: null,
      // What the beam is doing: where it struck and whether it has.
      beam: null,
      roarT: 0,
    };
  }
  return ship.mo;
}

/** Her best speed now, metres a second: it is her posture that decides it. */
export function monsterTopSpeed(ship) {
  const m = ship.mo;
  // Her posture as ordered, not her depth: a captain who has sent her down
  // gets her deep speed as she goes, and so does the prediction of her on
  // his own screen, which knows her posture off the wire and not her depth.
  const pose = m ? m.pose : 'swim';
  // Standing and doing something, she is not going anywhere much.
  const busy = m && (m.act === 'charge' || m.act === 'fire' || m.act === 'reach' || m.act === 'hold') ? 0.6 : 1;
  return MONSTER.speed[pose] * KNOT * busy;
}

function setPose(ship, pose) {
  const m = monsterOf(ship);
  if (m.pose === pose) return;
  m.pose = pose;
  m.poseT = 0;
  // Deep is the dive; up is the surface.
  ship.depthCmd = pose === 'deep' ? MONSTER.deep : 0;
}

/** Whether she is in this posture and has been long enough to act out of it. */
function settled(ship, pose) {
  const m = monsterOf(ship);
  return m.pose === pose && m.poseT >= MONSTER.settle && ship.depth < 0.6;
}

function startAct(m, act) {
  m.act = act;
  m.actT = 0;
}

// --------------------------------------------------------------- orders --

/**
 * An order to her, from her own captain or from her own brain (see
 * stepMonsterBot), as `{ a, ... }`:
 *
 *   { a: 'breath', x, z, target }   the atomic breath, at a point or a ship
 *   { a: 'tail', side }             her tail, to her left (+1) or right (-1)
 *   { a: 'grab', target }           take hold of a ship in front of her
 *   { a: 'throw', x, z }            throw the ship she has, toward a point
 *   { a: 'pose', pose }             'deep', 'swim' or 'stand'
 *   { a: 'roar' }
 *   { a: 'cancel' }                 stop gathering the breath
 *
 * Returns why not, or '' when it is under way.
 */
export function monsterOrder(state, ship, o, hooks) {
  if (!ship.alive || !isMonster(ship) || !o) return 'dead';
  const m = monsterOf(ship);
  const busy = m.act && m.act !== 'roar';
  switch (o.a) {
    case 'pose': {
      if (!POSES.includes(o.pose)) return 'bad';
      if (m.act === 'charge' || m.act === 'fire') return 'busy';
      // Going down with a ship in her hands, she lets go of her.
      if (o.pose === 'deep' && m.holdId) letGo(state, ship, hooks);
      if (m.act === 'reach' || m.act === 'hold' || m.act === 'throw') { if (o.pose === 'deep') m.act = ''; else return 'busy'; }
      setPose(ship, o.pose);
      m.queued = null;
      return '';
    }
    case 'breath': {
      if (m.cool > 0) return 'cooling';
      if (m.act === 'charge' || m.act === 'fire') return 'busy';
      let aim = null, aimId = 0;
      const t = o.target ? state.ships.find((s) => s.id === o.target && s.alive) : null;
      if (t) { aim = { x: t.x, z: t.z }; aimId = t.id; }
      else if (Number.isFinite(o.x) && Number.isFinite(o.z)) aim = { x: o.x, z: o.z };
      if (!aim) return 'bad';
      const d = dist(ship.x, ship.z, aim.x, aim.z);
      if (d > MONSTER.breath.range) {
        // Out of reach: she breathes as far as it reaches, along the line.
        const k = MONSTER.breath.range / d;
        aim = { x: ship.x + (aim.x - ship.x) * k, z: ship.z + (aim.z - ship.z) * k };
        aimId = 0;
      }
      if (d < MONSTER.breath.min) return 'close';
      // Whatever is in her hands goes first.
      if (m.holdId) letGo(state, ship, hooks);
      if (busy) m.act = '';
      m.aim = aim; m.aimId = aimId;
      setPose(ship, 'stand');
      startAct(m, 'charge');
      m.charge = 0;
      m.queued = null;
      state.events.push({ e: 'moCharge', ship: ship.id, tm: ship.team, x: Math.round(aim.x), z: Math.round(aim.z) });
      return '';
    }
    case 'cancel': {
      if (m.act !== 'charge') return 'bad';
      m.act = '';
      m.charge = 0;
      return '';
    }
    case 'tail': {
      if (m.tailCool > 0) return 'cooling';
      if (busy) return 'busy';
      const side = o.side === -1 || o.side === 1 ? o.side : tailSide(state, ship);
      // From the surface: standing, her tail is too deep to swing out of the
      // sea, and she drops forward onto the water first.
      if (!settled(ship, 'swim')) { setPose(ship, 'swim'); m.queued = { a: 'tail', side }; return ''; }
      m.side = side;
      startAct(m, 'tail');
      m.tailHit = false;
      m.tailCool = MONSTER.tail.cooldown;
      return '';
    }
    case 'grab': {
      if (m.holdId) return monsterOrder(state, ship, { a: 'throw', x: o.x, z: o.z }, hooks);
      if (m.grabCool > 0) return 'cooling';
      if (busy) return 'busy';
      const t = o.target ? state.ships.find((s) => s.id === o.target && s.alive) : grabbable(state, ship);
      if (!t) return 'none';
      // Off the surface she lunges, rising out of the water as she reaches;
      // out of the deep she bursts up out of the sea under the ship, which
      // takes a second longer.
      m.fromDeep = ship.depth > 0.6 || m.pose === 'deep';
      setPose(ship, 'stand');
      m.grabId = t.id;
      startAct(m, 'reach');
      m.grabCool = MONSTER.grab.cooldown;
      return '';
    }
    case 'throw': {
      if (!m.holdId) return 'none';
      m.throwAt = Number.isFinite(o.x) && Number.isFinite(o.z) ? { x: o.x, z: o.z } : null;
      startAct(m, 'throw');
      m.thrown = false;
      return '';
    }
    case 'roar': {
      if (busy) return 'busy';
      startAct(m, 'roar');
      state.events.push({ e: 'moRoar', ship: ship.id, x: Math.round(ship.x), z: Math.round(ship.z) });
      return '';
    }
    default: return 'bad';
  }
}

/** Which side of her the nearest enemy ship is, for her tail. */
function tailSide(state, ship) {
  let best = null, bd = Infinity;
  for (const s of state.ships) {
    if (!s.alive || s.team === ship.team || s.id === ship.id) continue;
    const d = dist(ship.x, ship.z, s.x, s.z);
    if (d < bd) { bd = d; best = s; }
  }
  if (!best) return 1;
  // + is her left: a bearing that has turned from her heading toward +x.
  return angleDelta(ship.heading, headingTo(ship.x, ship.z, best.x, best.z)) >= 0 ? 1 : -1;
}

/** The ship nearest her hands, if there is one in reach. */
export function grabbable(state, ship, team = ship.team) {
  let best = null, bd = Infinity;
  for (const s of state.ships) {
    if (!s.alive || s.id === ship.id || s.team === team || s.heldBy || s.flung) continue;
    if (shipClass(s).monster) continue;
    const d = dist(ship.x, ship.z, s.x, s.z) - shipClass(s).hull.beam * 0.5;
    const off = Math.abs(angleDelta(ship.heading, headingTo(ship.x, ship.z, s.x, s.z)));
    if (d > MONSTER.grab.range || off > MONSTER.grab.arc) continue;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// ------------------------------------------------------------------ step --

/**
 * One tick of her. `hooks` is what she needs of the simulation that the
 * simulation owns: { damageShip, nukeBlast, mayHurt, steerToward }.
 */
export function stepMonster(state, ship, dt, hooks) {
  const m = monsterOf(ship);
  const cls = shipClass(ship);
  m.poseT += dt;
  m.actT += dt;
  if (m.cool > 0) m.cool = Math.max(0, m.cool - dt);
  if (m.tailCool > 0) m.tailCool = Math.max(0, m.tailCool - dt);
  if (m.grabCool > 0) m.grabCool = Math.max(0, m.grabCool - dt);
  // A creature has no engine room, no steering gear and no magazine, and
  // nothing a ship's damage does to those is anything to her.
  ship.engineDamage = 0;
  ship.steeringDamage = 0;
  ship.fires = 0;
  ship.flooding = 0;
  ship.sink = 0; ship.heel = 0; ship.trim = 0;
  // She does not run out of air: she comes up when she chooses.
  ship.oxygen = cls.dive.oxygen;
  // Deep is the dive, and the dive is hers to order: the dive's own
  // order is kept in step with her posture.
  ship.depthCmd = m.pose === 'deep' ? MONSTER.deep : 0;

  // Healing, when she has been let alone.
  if (state.t - m.hurtAt > MONSTER.heal.after && ship.hp < ship.maxHp) {
    const add = ship.maxHp * MONSTER.heal.rate * dt * (m.pose === 'deep' ? 2 : 1);
    healSections(ship, add);
  }

  // What she was told to do, once she is in the posture for it.
  if (m.queued && !m.act) {
    const q = m.queued;
    if ((q.a === 'tail' && settled(ship, 'swim')) || (q.a === 'grab' && ship.depth < 0.6)) {
      m.queued = null;
      monsterOrder(state, ship, q, hooks);
    } else if (m.poseT > 6) {
      m.queued = null;
    }
  }

  // The glow dies away when she is not gathering the breath.
  if (m.act !== 'charge' && m.act !== 'fire') m.glow = Math.max(0, m.glow - dt / 3);

  switch (m.act) {
    case 'charge': stepCharge(state, ship, m, dt, hooks); break;
    case 'fire': stepFire(state, ship, m, dt, hooks); break;
    case 'tail': stepTail(state, ship, m, hooks); break;
    case 'reach': stepReach(state, ship, m, hooks); break;
    case 'hold': stepHold(state, ship, m, dt, hooks); break;
    case 'throw': stepThrow(state, ship, m, hooks); break;
    case 'roar': if (m.actT > 3) m.act = ''; break;
    default: break;
  }
}

function stepCharge(state, ship, m, dt, hooks) {
  const B = MONSTER.breath;
  // Gone down, or the target gone: it is let go.
  if (m.pose !== 'stand') { m.act = ''; m.charge = 0; return; }
  // A ship she is breathing at is followed until the beam leaves her.
  if (m.aimId) {
    const t = state.ships.find((s) => s.id === m.aimId);
    if (t && t.alive) m.aim = { x: t.x, z: t.z };
  }
  m.charge = clamp(m.actT / B.climb, 0, 1);
  m.glow = 1;
  // She turns to face it: the beam goes where her head points, and her head
  // only turns so far on her neck.
  faceToward(state, ship, m.aim, hooks);
  if (m.actT >= B.climb + B.throat) {
    // Where it will strike: a ship she is breathing at is led by how long
    // the beam takes to get to her.
    let aim = m.aim;
    const t = m.aimId ? state.ships.find((s) => s.id === m.aimId) : null;
    const d = dist(ship.x, ship.z, aim.x, aim.z);
    if (t && t.alive) {
      const lead = 0.15 + d / B.speed;
      aim = { x: t.x + Math.sin(t.heading) * t.speed * lead, z: t.z + Math.cos(t.heading) * t.speed * lead };
    }
    m.beam = { x: aim.x, z: aim.z, hitT: 0.15 + dist(ship.x, ship.z, aim.x, aim.z) / B.speed, hit: false };
    startAct(m, 'fire');
    m.cool = B.cooldown;
    state.events.push({ e: 'moFire', ship: ship.id, tm: ship.team, x: Math.round(aim.x), z: Math.round(aim.z) });
  }
}

function stepFire(state, ship, m, dt, hooks) {
  const B = MONSTER.breath;
  m.charge = 1;
  m.glow = 1;
  if (m.beam && !m.beam.hit && m.actT >= m.beam.hitT) {
    m.beam.hit = true;
    // Where it strikes: a megaton.
    hooks.nukeBlast(state, m.beam.x, 0, m.beam.z, { team: ship.team, bomber: 0, monster: ship.id }, B.kt);
  }
  if (m.actT >= B.fire) {
    m.act = '';
    m.beam = null;
    m.charge = 0;
  }
}

function stepTail(state, ship, m, hooks) {
  const T = MONSTER.tail;
  if (!m.tailHit && m.actT >= T.hitAt) {
    m.tailHit = true;
    // Everything on the side it comes across and astern of her, within its
    // reach of her middle.
    const hit = [];
    for (const s of state.ships) {
      if (!s.alive || s.id === ship.id || s.heldBy === ship.id) continue;
      if (!hooks.mayHurt(state, ship.team, s)) continue;
      if (s.depth > 4) continue;
      const sc = shipClass(s);
      const d = dist(ship.x, ship.z, s.x, s.z) - sc.hull.length * 0.35;
      if (d > T.reach) continue;
      const rel = angleDelta(ship.heading, headingTo(ship.x, ship.z, s.x, s.z));
      // Abaft her beam on the side it swings to, or right astern.
      const onSide = Math.sign(rel) === m.side && Math.abs(rel) > 0.9;
      const astern = Math.abs(rel) > 2.5;
      if (!onSide && !astern) continue;
      hit.push(s);
    }
    for (const s of hit) {
      const sc = shipClass(s);
      hooks.damageShip(state, s, ship, s.maxHp * 0.36 + 12000, 'ram');
      // Knocked bodily away from her, and rolled.
      const a = headingTo(ship.x, ship.z, s.x, s.z);
      const k = 6 * clamp(30000 / Math.max(2000, sc.datasheet?.displacement || 10000), 0.4, 3);
      s.driftX = (s.driftX || 0) + Math.sin(a) * k;
      s.driftZ = (s.driftZ || 0) + Math.cos(a) * k;
      s.rockRate = (s.rockRate || 0) + 0.25 * m.side;
      state.events.push({ e: 'moTail', ship: ship.id, at: s.id, x: Math.round(s.x), z: Math.round(s.z) });
    }
    if (!hit.length) state.events.push({ e: 'moTail', ship: ship.id, at: 0, x: Math.round(ship.x - Math.sin(ship.heading) * 120), z: Math.round(ship.z - Math.cos(ship.heading) * 120) });
  }
  if (m.actT >= T.time) m.act = '';
}

function stepReach(state, ship, m, hooks) {
  const G = MONSTER.grab;
  const lead = m.fromDeep ? G.breach : 0;
  if (m.actT >= G.takeAt + lead && !m.holdId) {
    const t = state.ships.find((s) => s.id === m.grabId);
    const d = t ? dist(ship.x, ship.z, t.x, t.z) - shipClass(t).hull.beam * 0.5 : Infinity;
    const off = t ? Math.abs(angleDelta(ship.heading, headingTo(ship.x, ship.z, t.x, t.z))) : Infinity;
    // She lunges: a ship a little further than she could reach standing
    // still is taken all the same.
    if (t && t.alive && !t.heldBy && d <= G.range * 1.3 && off <= G.arc * 1.25) {
      m.holdId = t.id;
      t.heldBy = ship.id;
      t.held = { t: 0, lifted: (shipClass(t).datasheet?.displacement || 10000) <= G.lift };
      t.speed = 0;
      state.events.push({ e: 'moGrab', ship: ship.id, at: t.id, x: Math.round(t.x), z: Math.round(t.z) });
    } else {
      // Missed her.
      m.act = '';
      return;
    }
  }
  if (m.actT >= G.reach + lead) startAct(m, 'hold');
}

function stepHold(state, ship, m, dt, hooks) {
  const t = state.ships.find((s) => s.id === m.holdId);
  if (!t || !t.alive) { letGo(state, ship, hooks); m.act = ''; return; }
  // Crushed in her hands.
  hooks.damageShip(state, t, ship, (t.maxHp * 0.025 + 1200) * dt, 'ram');
  if (!t.alive) { letGo(state, ship, hooks); m.act = ''; return; }
  if (m.actT >= MONSTER.grab.hold) { m.throwAt = null; startAct(m, 'throw'); m.thrown = false; }
}

function stepThrow(state, ship, m, hooks) {
  const G = MONSTER.grab;
  if (!m.thrown && m.actT >= 0.55) {
    m.thrown = true;
    const t = state.ships.find((s) => s.id === m.holdId);
    if (t && t.alive) {
      // Toward where she was told, or out ahead of her.
      let to = m.throwAt;
      const reach = t.held?.lifted ? G.toss : G.toss * 0.25;
      if (!to) to = { x: ship.x + Math.sin(ship.heading) * reach, z: ship.z + Math.cos(ship.heading) * reach };
      const d = dist(ship.x, ship.z, to.x, to.z);
      if (d > reach) { const k = reach / d; to = { x: ship.x + (to.x - ship.x) * k, z: ship.z + (to.z - ship.z) * k }; }
      t.flung = { t: 0, T: G.flight, x0: t.x, z0: t.z, x1: to.x, z1: to.z, h: t.held?.lifted ? 140 : 20, by: ship.id };
      t.heldBy = 0;
      t.held = null;
    }
    m.holdId = 0;
  }
  if (m.actT >= G.throwTime) m.act = '';
}

/** Let go of whatever is in her hands, where it is. */
function letGo(state, ship, hooks) {
  const m = monsterOf(ship);
  const t = m.holdId ? state.ships.find((s) => s.id === m.holdId) : null;
  if (t) {
    // Dropped from her hands into the sea.
    if (t.held?.lifted && t.alive) {
      t.flung = { t: 0, T: 1.1, x0: t.x, z0: t.z, x1: t.x, z1: t.z, h: 6, by: ship.id };
    }
    t.heldBy = 0;
    t.held = null;
  }
  m.holdId = 0;
}

/**
 * After every ship has moved: the ship in her hands is where her hands are,
 * and a ship she has thrown is where it has got to in the air. Done last so
 * nothing the ship herself does that tick moves her out of them.
 */
export function stepHeld(state, dt, hooks) {
  for (const s of state.ships) {
    if (s.heldBy) {
      const mo = state.ships.find((q) => q.id === s.heldBy);
      if (!mo || !mo.alive || !mo.mo || mo.mo.holdId !== s.id) { s.heldBy = 0; s.held = null; continue; }
      s.held.t += dt;
      // In front of her, across her.
      const reach = s.held.lifted ? 34 : 70;
      s.x = mo.x + Math.sin(mo.heading) * reach;
      s.z = mo.z + Math.cos(mo.heading) * reach;
      s.heading = mo.heading + Math.PI / 2;
      s.speed = 0; s.driftX = 0; s.driftZ = 0; s.yawRate = 0;
    }
    if (s.flung) {
      const f = s.flung;
      f.t += dt;
      const u = clamp(f.t / f.T, 0, 1);
      s.x = f.x0 + (f.x1 - f.x0) * u;
      s.z = f.z0 + (f.z1 - f.z0) * u;
      s.speed = 0; s.driftX = 0; s.driftZ = 0;
      // Up and over, and down.
      s.liftY = 4 * f.h * u * (1 - u);
      if (u >= 1) {
        s.flung = null;
        s.liftY = 0;
        const by = state.ships.find((q) => q.id === f.by);
        if (s.alive) hooks.damageShip(state, s, by || null, s.maxHp * (f.h > 50 ? 0.3 : 0.08) + 4000, 'ram');
        state.events.push({ e: 'moSlam', ship: s.id, x: Math.round(s.x), z: Math.round(s.z), big: f.h > 50 ? 1 : 0 });
        // And anything it comes down on.
        for (const q of state.ships) {
          if (q === s || !q.alive || shipClass(q).monster) continue;
          if (dist(q.x, q.z, s.x, s.z) > (shipClass(q).hull.length + shipClass(s).hull.length) * 0.4) continue;
          hooks.damageShip(state, q, by || null, q.maxHp * 0.2 + 3000, 'ram');
        }
      }
    }
  }
}

/** Turn her toward a point, pivoting where she stands if she has to. */
function faceToward(state, ship, aim, hooks) {
  if (!aim) return;
  const want = headingTo(ship.x, ship.z, aim.x, aim.z);
  const off = angleDelta(ship.heading, want);
  // Within what her neck turns to, her helm is left alone.
  ship.rudderCmd = Math.abs(off) < 0.12 ? 0 : clamp(off * 2.5, -1, 1);
}

// ----------------------------------------------------------------- harm --

/**
 * What she takes, in place of what a ship would: no fire, no flooding, no
 * magazine, nothing a ship's compartments do; shells and torpedoes for a good
 * deal less; her own breath not at all. Returns true if she is dead of it.
 */
export function monsterHurt(state, ship, source, amount, kind, hooks) {
  if (!ship.alive || !(amount > 0)) return false;
  const m = monsterOf(ship);
  const k = MONSTER.hurt[kind] ?? MONSTER.hurt.other;
  amount *= k;
  if (!(amount > 0)) return false;
  m.hurtAt = state.t;
  const before = ship.hp;
  // Shared evenly over her: there is no compartment in her to be shot out.
  hurtSections(ship, amount);
  if (source && source.id !== ship.id) source.damageDealt = (source.damageDealt || 0) + Math.min(amount, before);
  if (ship.hp <= 0) {
    ship.hp = 0;
    die(state, ship, source, hooks);
    return true;
  }
  // A hard knock while she is gathering her breath does not stop her; it is
  // what she is gathering it for.
  return false;
}

function hurtSections(ship, amount) {
  const secs = Object.values(ship.sections);
  let left = amount;
  for (let pass = 0; pass < 3 && left > 1e-6; pass++) {
    const live = secs.filter((c) => c.hp > 0);
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
  ship.hp = Math.max(0, secs.reduce((a, c) => a + c.hp, 0));
}

function healSections(ship, amount) {
  const secs = Object.values(ship.sections);
  for (const c of secs) {
    const room = c.max - c.hp;
    if (room <= 0) continue;
    c.hp += Math.min(room, amount / secs.length);
  }
  ship.hp = Math.min(ship.maxHp, secs.reduce((a, c) => a + c.hp, 0));
}

/** She is dead: out of the battle, and going down. */
function die(state, ship, source, hooks) {
  const m = monsterOf(ship);
  if (m.holdId) letGo(state, ship, hooks);
  m.act = 'die';
  m.actT = 0;
  m.charge = 0;
  m.beam = null;
  m.queued = null;
  ship.sinking = { t: 0, T: 40, kind: 'monster', by: source ? source.id : 0, depth: 160, down: 0, trim: 0, heel: 0, monster: true };
  state.events.push({ e: 'moDie', ship: ship.id, x: Math.round(ship.x), z: Math.round(ship.z), by: source ? source.id : 0 });
  hooks.founder(state, ship, 'monster');
}

/** Her going down, once she is dead. */
export function stepMonsterDead(state, ship, dt) {
  const S = ship.sinking;
  const m = monsterOf(ship);
  m.actT += dt;
  m.glow = Math.max(0, m.glow - dt / 3);
  ship.speed = 0; ship.driftX = 0; ship.driftZ = 0; ship.yawRate = 0;
  if (!S || S.gone) return;
  S.t += dt;
  S.down = S.depth * clamp((S.t - 4) / (S.T - 4), 0, 1);
  if (!S.under && S.t >= S.T) {
    S.under = true;
    state.events.push({ e: 'under', ship: ship.id, x: Math.round(ship.x), z: Math.round(ship.z) });
  }
  if (S.t >= S.T + 30) S.gone = true;
}

// ----------------------------------------------------------------- wire --

/**
 * Her state on the wire, for everybody who can see her: posture, what she is
 * doing and how far into it, which way her tail goes, how far up her the
 * glow has climbed and how bright it burns, the ship in her hands, where the
 * beam strikes, and -- hers alone, but harmless to anyone -- how long until
 * she can breathe again.
 */
export function monsterWire(ship) {
  const m = monsterOf(ship);
  const pose = !ship.alive ? 1 : ship.depth > 0.6 || m.pose === 'deep' ? 0 : POSES.indexOf(m.pose);
  return [
    pose,
    Math.max(0, ACTS.indexOf(m.act)),
    Math.round(Math.max(0, m.actT - (m.act === 'reach' && m.fromDeep ? MONSTER.grab.breach : 0)) * 10) / 10,
    m.side,
    Math.round(m.charge * 100) / 100,
    Math.ceil(m.cool),
    Math.round(m.glow * 100) / 100,
    m.holdId || 0,
    m.beam ? Math.round(m.beam.x) : m.aim && m.act === 'charge' ? Math.round(m.aim.x) : 0,
    m.beam ? Math.round(m.beam.z) : m.aim && m.act === 'charge' ? Math.round(m.aim.z) : 0,
    m.beam ? 1 : m.act === 'charge' ? 2 : 0,
    Math.ceil(m.tailCool),
    Math.ceil(m.grabCool),
  ];
}

/** The same, read back: what the rig and the HUD want of it. */
export function readMonsterWire(w) {
  if (!Array.isArray(w)) return null;
  return {
    pose: POSES[w[0]] || 'swim',
    act: ACTS[w[1]] || '',
    actT: w[2] || 0,
    side: w[3] || 1,
    charge: w[4] || 0,
    cool: w[5] || 0,
    glow: w[6] || 0,
    holdId: w[7] || 0,
    beam: w[10] ? { x: w[8], z: w[9], live: w[10] === 1 } : null,
    tailCool: w[11] || 0,
    grabCool: w[12] || 0,
  };
}

// ------------------------------------------------------------------ mind --

/**
 * Her own mind, when nobody has her con.
 *
 * She is not a ship and does not fight like one. What she weighs:
 *
 *   * The breath first, because it is worth more than everything else she
 *     does together -- but only where it pays: she reckons, for every enemy
 *     ship she can see as a place to put it, what a megaton there would do to
 *     every ship of theirs and of her own side round it, by the same falloff
 *     the battle uses, and she does not breathe where her own side would pay
 *     for it. She breathes at a ship where the ships are thickest.
 *
 *   * Closing in under the water. Down deep no shell reaches her and almost
 *     nothing can see her, so with the breath not ready she goes down and
 *     swims in under the enemy, and comes up among them.
 *
 *   * Hands and tail, close in: a ship in front of her is taken and crushed
 *     and thrown at another; ships beside and behind her get the tail.
 *
 *   * Getting out of it. Badly hurt and still being hurt, she goes down and
 *     away from where the fire is coming from until she has healed.
 *
 *   * A torpedo running at her is gone under.
 *
 * `hooks` is { steerToward, bite(d) }.
 */
export function stepMonsterBot(state, ship, brain, dt, conned, hooks) {
  const m = monsterOf(ship);
  const B = brain.mo || (brain.mo = { think: 0, mode: 'hunt', hpWas: ship.hp, hurtRate: 0, sinceRate: 0, evadeUntil: 0, plan: null, throwAt: null });
  // How fast she is being hurt, smoothed over ten seconds or so.
  B.sinceRate += dt;
  if (B.sinceRate >= 1) {
    const lost = Math.max(0, B.hpWas - ship.hp) / B.sinceRate;
    B.hurtRate += (lost - B.hurtRate) * 0.15;
    B.hpWas = ship.hp;
    B.sinceRate = 0;
  }
  if (conned) return;
  B.think -= dt;
  const team = ship.team;
  const foes = state.ships.filter((s) => s.alive && s.team !== team && !shipClass(s).monster && !s.flung);
  const seen = foes.filter((s) => s.spottedBy?.[team]);
  const friends = state.ships.filter((s) => s.alive && s.team === team && s.id !== ship.id);
  const hpFrac = ship.hp / ship.maxHp;
  // What matters most first, every so often; between, she carries on.
  if (B.think <= 0) {
    B.think = 0.5;
    B.plan = plan(state, ship, m, B, foes, seen, friends, hpFrac, hooks);
  }
  const P = B.plan || { go: null, pose: 'swim', notch: 2 };
  // Her orders, issued once.
  if (P.order && !m.act) {
    const why = monsterOrder(state, ship, P.order, hooks);
    if (!why || why === 'cooling' || why === 'none' || why === 'close') P.order = null;
  }
  // While she has a ship in her hands, she looks for somewhere to put her.
  if (m.act === 'hold' && m.actT > 2.5) {
    const into = nearestOther(ship, seen, m.holdId);
    if (into && dist(ship.x, ship.z, into.x, into.z) < MONSTER.grab.toss * 1.1) {
      monsterOrder(state, ship, { a: 'throw', x: into.x, z: into.z }, hooks);
    } else if (m.actT > 5) {
      monsterOrder(state, ship, { a: 'throw' }, hooks);
    }
  }
  // Her posture, when she is not in the middle of something that set it.
  if (!m.act && !m.queued && P.pose && m.pose !== P.pose) setPose(ship, P.pose);
  // Her helm and her telegraph, unless the breath has her turning to aim.
  if (m.act !== 'charge' && m.act !== 'fire') {
    if (P.go) hooks.steerToward(state, ship, headingTo(ship.x, ship.z, P.go.x, P.go.z));
    else ship.rudderCmd = 0;
    ship.notch = P.notch ?? 2;
  } else {
    ship.notch = 1;
  }
}

function nearestOther(ship, list, not) {
  let best = null, bd = Infinity;
  for (const s of list) {
    if (s.id === not) continue;
    const d = dist(ship.x, ship.z, s.x, s.z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

/** What she means to do for the next half second. */
function plan(state, ship, m, B, foes, seen, friends, hpFrac, hooks) {
  const near = nearestOther(ship, seen, 0);
  const dNear = near ? dist(ship.x, ship.z, near.x, near.z) : Infinity;
  const anyFoe = near || nearestOther(ship, foes, 0);

  // A torpedo coming for her: under it.
  const torp = (state.torpedoes || []).some((t) => t.team !== ship.team && !t.dead
    && dist(t.x, t.z, ship.x, ship.z) < 900
    && Math.abs(angleDelta(t.heading ?? t.h ?? 0, headingTo(t.x, t.z, ship.x, ship.z))) < 0.35);

  // Badly hurt and still being hurt: down and away, until she has healed.
  if (state.t < B.evadeUntil || (hpFrac < 0.3 && B.hurtRate > ship.maxHp * 0.002)) {
    if (state.t >= B.evadeUntil) B.evadeUntil = state.t + 60;
    if (hpFrac > 0.65) B.evadeUntil = 0;
    const from = centroid(seen.length ? seen : foes);
    const away = from ? { x: ship.x + (ship.x - from.x), z: ship.z + (ship.z - from.z) } : null;
    return { go: away, pose: 'deep', notch: 5 };
  }

  // The breath, where it pays.
  if (m.cool <= 0 && !m.holdId && seen.length) {
    const best = breathTarget(state, ship, seen, friends, hooks);
    if (best) return { order: { a: 'breath', target: best.id }, go: null, pose: 'stand', notch: 1 };
  }

  if (torp) return { go: anyFoe ? { x: anyFoe.x, z: anyFoe.z } : null, pose: 'deep', notch: 4 };

  // Hands first, from wherever she is: a ship within reach in front of her
  // is taken -- off the surface with a lunge, out of the deep by coming up
  // under her.
  const ahead = grabbable(state, ship);
  if (ahead && m.grabCool <= 0 && !m.act) return { order: { a: 'grab', target: ahead.id }, go: { x: ahead.x, z: ahead.z }, pose: null, notch: 3 };
  // Up on the surface with ships beside or behind her: the tail.
  if (ship.depth < 0.6 && m.tailCool <= 0 && !m.act) {
    const flank = seen.find((s) => {
      const d = dist(ship.x, ship.z, s.x, s.z) - shipClass(s).hull.length * 0.35;
      const rel = Math.abs(angleDelta(ship.heading, headingTo(ship.x, ship.z, s.x, s.z)));
      return d < MONSTER.tail.reach * 0.95 && rel > 0.95;
    });
    if (flank) {
      const side = angleDelta(ship.heading, headingTo(ship.x, ship.z, flank.x, flank.z)) >= 0 ? 1 : -1;
      return { order: { a: 'tail', side }, go: null, pose: 'swim', notch: 2 };
    }
  }
  // Within the enemy's guns, she stalks deep, where no shell reaches her and
  // she is faster than on the surface, and comes up only to strike. Out of
  // their reach, or with nobody near, she swims on the surface.
  if (near) {
    const threatened = seen.some((s) => dist(ship.x, ship.z, s.x, s.z) < (shipClass(s).gun?.range || 15000) * 1.05);
    return { go: lead(ship, near), pose: threatened ? 'deep' : 'swim', notch: 5 };
  }
  if (anyFoe) {
    const goal = clusterCentre(foes) || anyFoe;
    return { go: { x: goal.x, z: goal.z }, pose: 'swim', notch: 5 };
  }
  return { go: { x: 0, z: 0 }, pose: 'swim', notch: 3 };
}

/** Where to steer to meet a ship, allowing for where she is going. */
function lead(ship, t) {
  const d = dist(ship.x, ship.z, t.x, t.z);
  const mine = Math.max(6, Math.abs(ship.speed) || 10);
  // Close in, almost straight at her; further out, cutting the corner.
  const k = Math.min(d < 600 ? 6 : 25, d / mine);
  return { x: t.x + Math.sin(t.heading) * t.speed * k, z: t.z + Math.cos(t.heading) * t.speed * k };
}

/**
 * Where the breath does most, of the ships she can see: each one weighed as a
 * place to put a megaton by what it would do to all of them, less three times
 * what it would do to her own side. Null when nothing is worth it.
 */
function breathTarget(state, ship, seen, friends, hooks) {
  const B = MONSTER.breath;
  let best = null, bestScore = 0;
  for (const s of seen) {
    const d = dist(ship.x, ship.z, s.x, s.z);
    // She is not hurt by her own: only too close for the beam to be worth
    // drawing stops her.
    if (d < B.min + 150 || d > B.range) continue;
    let score = 0;
    for (const q of seen) {
      const b = Math.min(1.2, hooks.bite(dist(q.x, q.z, s.x, s.z)));
      score += b * worth(q);
    }
    for (const q of friends) {
      const b = Math.min(1.2, hooks.bite(dist(q.x, q.z, s.x, s.z)));
      score -= 3 * b * worth(q);
    }
    if (score > bestScore) { bestScore = score; best = s; }
  }
  // At least one good ship's worth.
  return bestScore >= 1.0 ? best : null;
}

function worth(s) {
  const t = shipClass(s).type;
  return { CV: 2, BB: 1.8, CB: 1.5, CA: 1.2, CL: 1, DD: 0.8, SS: 0.6, AK: 0.5, LC: 0.3 }[t] ?? 1;
}

function centroid(list) {
  if (!list.length) return null;
  let x = 0, z = 0;
  for (const s of list) { x += s.x; z += s.z; }
  return { x: x / list.length, z: z / list.length };
}

/** The middle of the thickest knot of them: each weighed by its neighbours. */
function clusterCentre(list) {
  if (!list.length) return null;
  let best = list[0], bn = -1;
  for (const s of list) {
    let n = 0;
    for (const q of list) if (dist(s.x, s.z, q.x, q.z) < 3000) n++;
    if (n > bn) { bn = n; best = s; }
  }
  return { x: best.x, z: best.z };
}

