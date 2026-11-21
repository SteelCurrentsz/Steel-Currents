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
//     it strikes, a burst of ten kilotons: a little smaller than the B-29's
//     sixteen. Two and a half minutes before she can do it again.
//
//   * Her tail, swung up out of the sea and across whatever is beside or
//     behind her.
//
//   * Her hands: a ship within arm's length in front of her is taken hold
//     of. A transport (anything in the yard's Transport tab), a destroyer,
//     a destroyer escort or a submarine she
//     lifts out of the water, crushes, bites and throws; anything bigger --
//     a cruiser, a battleship, a carrier -- is too much for her to lift, and
//     she holds it where it lies, crushes it and bites it, and lets it go.
//
//   * Her jaws: a ship in front of her, or the one in her hands, bitten.
//
//   * She is hard to kill -- nothing in her burns or floods, and shells do
//     her half of what they would do a ship -- and she heals, slowly, when
//     she is left alone long enough. But she can be killed.
import { clamp, dist, headingTo, angleDelta } from './math.js';
import { getClass, CIVIL_SHIPS } from './ships.js';

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
    // Ten kilotons: a little under the B-29's sixteen.
    kt: 10,
  },
  tail: {
    // The swing: up and away, across, and back (see the rig's 'tail').
    time: 2.6,
    // The moment it comes across, and what it reaches from her middle: the
    // length of her tail, and not a metre more.
    hitAt: 1.15,
    reach: 145,
    cooldown: 7,
  },
  grab: {
    // Reaching for her and getting a hold.
    reach: 2.0,
    takeAt: 1.0,
    // Out of the deep, how much longer it takes her to come up under one.
    breach: 1.2,
    // Where her hands come down to the water when she leans for a ship --
    // measured off her rig: bent forward at the waist, her arms out, her
    // palms at deck height this far ahead of her middle -- and how far from
    // that point the nearest of a hull can be and still be in her hands.
    // Nothing further than arm's length is taken.
    hands: 38,
    arm: 16,
    // Off the surface or out of the deep she rears up and lunges forward as
    // she reaches: anything from under her hands out to her snout is within
    // that lunge, and she comes forward until her hands are on it.
    snout: 70,
    // While her hands are on their way down a ship can steam a little out
    // from under them: this much more, and she has missed.
    slip: 8,
    // A ship she has lifted, held out at arm's length in front of her chest
    // (clear of her head, which is drawn back over it), and where her hands
    // let go of her at the top of the throw, ahead and up -- both measured
    // off her rig (ARMS.hold and ARMS.release in client/js/render/monster.js).
    carry: 35,
    release: { at: 0.68, ahead: 34, up: 36 },
    // The longest she holds on before she throws, or lets go of a ship she
    // could not lift, and how far she throws.
    hold: 10,
    throwTime: 1.4,
    // Three seconds in the air, as high again as she is tall at the top of
    // it: slow enough to be seen going, and coming down like something that
    // weighs two thousand tons.
    flight: 3.0,
    arc: 55,
    toss: 450,
    cooldown: 6,
    // The ships she can lift: every ship in the yard's Transport tab
    // (CIVIL_SHIPS: the cargo ships and the landing craft), destroyers and
    // destroyer escorts (both DD on the plot), and submarines. Anything else
    // she can only hold where it is.
    liftable: ['AK', 'LC', 'DD', 'SS'],
    // A thrown ship coming down: how long she takes to come back up out of
    // the water she has gone into, where she went in.
    splash: 2.6,
    // Every ship she gets hold of is lifted out of the water; one heavier
    // than this is thrown less far and less high, by the square root of how
    // much heavier.
    lift: 26000,
    // The least of a full throw a heavy ship still gets.
    heavyToss: 0.4,
  },
  // Her hands closed hard on the ship she holds: the hull buckled in them.
  // Her claws go in at `hitAt`; the steel cracks between them and the piece
  // breaks off a second and a half later (see client/js/render/clawtear.js),
  // and she eases back to holding it by `time`.
  crush: { time: 2.5, hitAt: 0.7, share: 0.22, flat: 9000, cooldown: 4 },
  // Her jaws: on the ship in her hands, or on one in front of her.
  // Her jaws are where her head is: standing, a little ahead of her chest,
  // and lunging down to the water; swimming, out at the front of her. A hull
  // has to be within `reach` of them.
  bite: { time: 1.3, hitAt: 0.55, head: { stand: 34, swim: 66 }, reach: 14, share: 0.14, flat: 7000, cooldown: 5,
    // Her head can be turned while her jaws are on a ship (see `aim`): this
    // far either side of straight ahead, metres, at the end of its swing.
    swing: 30,
    // Her teeth still in it, a swing of her head this far across tears a
    // second mouthful out where they have been dragged to -- `drag` of a full
    // bite's harm -- and as many as `drags` of those to a bite.
    tug: 0.45, drag: 0.5, drags: 2,
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
  speed: { deep: 36, swim: 30, stand: 11 },
  // How long a change of posture takes before she can act out of it.
  settle: 1.6,
  // Ground higher than this under her (metres, the sea bed below nought) is
  // too shallow to swim or dive in: she stands, and walks.
  wade: -30,
};

export const POSES = ['deep', 'swim', 'stand'];
// (New ones go on the end: the wire carries the index.)
export const ACTS = ['', 'tail', 'reach', 'hold', 'throw', 'charge', 'fire', 'roar', 'die', 'bite', 'crush'];

const KNOT = 0.514444;

/** Whether this is her. */
export function isMonster(ship) { return !!shipClass(ship).monster; }

/** Whether she can lift this ship out of the water, or only hold it down. */
export function liftable(t) {
  return CIVIL_SHIPS.has(shipClass(t).id) || MONSTER.grab.liftable.includes(shipClass(t).type);
}

/**
 * How far a point is from the nearest of a hull: her length laid along her
 * heading, less half her beam. Nothing is in her hands, or her jaws, or under
 * her tail, that is not right there.
 */
export function hullGap(px, pz, s) {
  const c = shipClass(s).hull;
  const hx = Math.sin(s.heading), hz = Math.cos(s.heading);
  const dx = px - s.x, dz = pz - s.z;
  const along = clamp(dx * hx + dz * hz, -c.length / 2, c.length / 2);
  return Math.max(0, Math.hypot(dx - hx * along, dz - hz * along) - c.beam / 2);
}

/**
 * How much of her is in the water to run into, fore and aft of her middle,
 * in metres: swimming, all of her from her snout to the tip of her tail;
 * standing, her body from her chest back, with her tail out behind her --
 * which leaves the water under her hands clear for a ship to be in.
 */
export function monsterBody(ship) {
  const m = ship.mo;
  const standing = m && m.pose === 'stand' && ship.depth < 0.6;
  return standing ? { front: 16, back: -130 } : { front: 72, back: -98 };
}

/** Where her hands come down to the water, leaning for a ship. */
function handsAt(ship, ahead = MONSTER.grab.hands) {
  return { x: ship.x + Math.sin(ship.heading) * ahead, z: ship.z + Math.cos(ship.heading) * ahead };
}

/**
 * How far a ship is from her hands, and how far she has to lunge forward to
 * get them on her. Standing and settled she does not lunge: the ship has to
 * be at arm's length. Rearing up out of the water she can come forward as
 * far as her snout was.
 */
function reachFor(ship, s) {
  const G = MONSTER.grab;
  const best = { gap: hullGap(...xz(handsAt(ship)), s), lunge: 0 };
  if (settled(ship, 'stand')) return best;
  for (let a = G.hands + 4; a <= G.snout; a += 4) {
    const gap = hullGap(...xz(handsAt(ship, a)), s);
    if (gap < best.gap - 0.5) { best.gap = gap; best.lunge = a - G.hands; }
  }
  return best;
}
const xz = (p) => [p.x, p.z];

/** Where her jaws are: ahead of her chest standing, out in front swimming. */
function jawsAt(ship) {
  const m = monsterOf(ship);
  const k = m.pose === 'stand' ? MONSTER.bite.head.stand : MONSTER.bite.head.swim;
  return { x: ship.x + Math.sin(ship.heading) * k, z: ship.z + Math.cos(ship.heading) * k };
}

/** Her own state, made the first time it is asked for. */
export function monsterOf(ship) {
  if (!ship.mo) {
    ship.mo = {
      pose: 'swim', poseT: 10,
      act: '', actT: 0, side: 1,
      // The breath: where it is going, how far up her the glow has got, and
      // how long before she can do it again.
      aim: null, aimId: 0, charge: 0, cool: 0, glow: 0,
      tailCool: 0, grabCool: 0, biteCool: 0, crushCool: 0,
      // Where her head is turned when she bites: x across her, -1 her left
      // to 1 her right; y -1 down at the waterline and below it, 1 up at
      // the upperworks. Her jaws close where it points.
      head: { x: 0, y: 0 },
      // A ship in her hands.
      holdId: 0, pin: false,
      // When she was last hurt, for her healing.
      hurtAt: -1e9,
      // Something she was told to do that has to wait for her to be in the
      // right posture for it.
      queued: null,
      // What the beam is doing: where it struck and whether it has.
      beam: null,
      roarT: 0,
      // Ships her captain has marked for her breath (the Attack key): each
      // gets the next one as soon as it is ready, in the order marked.
      marks: [],
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
  const busy = m && (m.act === 'charge' || m.act === 'fire' || m.act === 'reach' || m.act === 'hold' || m.act === 'crush') ? 0.75 : 1;
  // Holding down a ship she could not lift, she stays where she is.
  if (m && m.holdId && m.pin) return 0;
  return MONSTER.speed[pose] * KNOT * busy;
}

function setPose(ship, pose) {
  const m = monsterOf(ship);
  // Ashore, or in water too shallow to swim in, she can only stand: she
  // walks on her own legs until there is sea deep enough to go down in.
  if (m.ashore && pose !== 'stand') pose = 'stand';
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
 *   { a: 'crush' }                  crush the ship she has in her hands
 *   { a: 'bite', target }           bite the ship in her hands, or in front of her
 *   { a: 'head', hx, hy }           turn her head: where her jaws go in (see m.head)
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
      if (m.ashore && o.pose !== 'stand') return 'ashore';
      if (m.act === 'charge' || m.act === 'fire') return 'busy';
      // Going down with a ship in her hands, she lets go of her.
      if (o.pose === 'deep' && m.holdId) letGo(state, ship, hooks);
      if (['reach', 'hold', 'throw', 'crush', 'bite'].includes(m.act)) { if (o.pose === 'deep') m.act = ''; else return 'busy'; }
      setPose(ship, o.pose);
      m.queued = null;
      return '';
    }
    case 'breath': {
      if (m.cool > 0) return 'cooling';
      if (m.act === 'charge' || m.act === 'fire') return 'busy';
      // A ship asked for by name that is beyond the reach of the beam is
      // refused, not breathed at the empty sea short of her.
      if (o.target) {
        const t = state.ships.find((s) => s.id === o.target && s.alive);
        if (t && dist(ship.x, ship.z, t.x, t.z) > MONSTER.breath.range) return 'far';
      }
      const { aim, aimId } = breathAim(state, ship, o);
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
    case 'mark': {
      // Mark a ship for her breath, or with no target clear the marks.
      if (!o.target) { m.marks = []; return ''; }
      const t = state.ships.find((q) => q.id === o.target && q.alive && q.team !== ship.team && !shipClass(q).monster);
      if (!t) return 'none';
      if (!m.marks) m.marks = [];
      if (!o.add) m.marks = [];
      if (!m.marks.includes(t.id)) m.marks.push(t.id);
      if (m.marks.length > 6) m.marks.shift();
      // Ready now: at the first of them, at once.
      breatheAtMark(state, ship, m, hooks);
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
      // Ashore her tail is out of the water behind her, and she swings it
      // standing.
      if (!m.ashore && !settled(ship, 'swim')) { setPose(ship, 'swim'); m.queued = { a: 'tail', side }; return ''; }
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
      // Only what is within arm's length of her: a ship further off has to
      // be closed with first.
      const want = o.target ? state.ships.find((s) => s.id === o.target && s.alive) : null;
      const t = want ? grabbable(state, ship, ship.team, want) : grabbable(state, ship);
      if (!t) return 'none';
      // Off the surface she lunges, rising out of the water as she reaches;
      // out of the deep she bursts up out of the sea under the ship, which
      // takes a second longer.
      m.fromDeep = ship.depth > 0.6 || m.pose === 'deep';
      // How far she lunges forward to get her hands on her (none, standing).
      m.lunge = { d: reachFor(ship, t).lunge, done: 0 };
      setPose(ship, 'stand');
      m.grabId = t.id;
      startAct(m, 'reach');
      m.grabCool = MONSTER.grab.cooldown;
      return '';
    }
    case 'crush': {
      if (!m.holdId) return 'none';
      if (m.crushCool > 0) return 'cooling';
      if (m.act === 'throw' || m.act === 'crush' || m.act === 'bite') return 'busy';
      startAct(m, 'crush');
      m.crushHit = false;
      m.crushCool = MONSTER.crush.cooldown;
      return '';
    }
    case 'bite': {
      if (m.biteCool > 0) return 'cooling';
      if (m.act === 'throw' || m.act === 'crush' || m.act === 'bite' || m.act === 'charge' || m.act === 'fire') return 'busy';
      if (m.act && m.act !== 'roar' && m.act !== 'hold') return 'busy';
      // The ship in her hands, if she has one; if not, one in front of her
      // jaws, which she lunges for off the surface.
      let at = m.holdId;
      if (!at) {
        const t = o.target ? state.ships.find((s) => s.id === o.target && s.alive) : null;
        const b = t && biteable(state, ship, t) ? t : biteable(state, ship);
        if (!b) return 'none';
        at = b.id;
        if (m.pose === 'deep') setPose(ship, 'swim');
      }
      m.biteId = at;
      startAct(m, 'bite');
      m.biteHit = false;
      m.biteCool = MONSTER.bite.cooldown;
      return '';
    }
    case 'throw': {
      if (!m.holdId) return 'none';
      if (m.act === 'throw') return 'busy';
      // One she could not lift she cannot throw either: she lets go of her.
      if (m.pin) { letGo(state, ship, hooks); m.act = ''; return ''; }
      m.throwAt = Number.isFinite(o.x) && Number.isFinite(o.z) ? { x: o.x, z: o.z } : null;
      startAct(m, 'throw');
      m.thrown = false;
      return '';
    }
    case 'head': {
      const hx = Number(o.hx), hy = Number(o.hy);
      if (!Number.isFinite(hx) || !Number.isFinite(hy)) return 'bad';
      const h = m.head || (m.head = { x: 0, y: 0 });
      h.x = clamp(hx, -1, 1);
      h.y = clamp(hy, -1, 1);
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

/**
 * Her breath at the first ship marked for it that is still afloat, if it is
 * ready and she is free to: not with a ship in her hands or her breath
 * already gathering. A mark too far off waits until she has closed it.
 */
function breatheAtMark(state, ship, m, hooks) {
  if (!m.marks || !m.marks.length) return false;
  m.marks = m.marks.filter((id) => state.ships.some((q) => q.id === id && q.alive));
  if (!m.marks.length || m.cool > 0 || m.holdId) return false;
  if (m.act && m.act !== 'roar' && m.act !== '') return false;
  const B = MONSTER.breath;
  for (const id of m.marks) {
    const t = state.ships.find((q) => q.id === id);
    const d = dist(ship.x, ship.z, t.x, t.z);
    if (d > B.range) continue;
    if (monsterOrder(state, ship, { a: 'breath', target: id }, hooks) === '') {
      m.marks = m.marks.filter((q) => q !== id);
      return true;
    }
  }
  return false;
}

/** The first ship marked for her breath that is still afloat, for her to close. */
export function markedFoe(state, ship) {
  const m = monsterOf(ship);
  for (const id of m.marks || []) {
    const t = state.ships.find((q) => q.id === id && q.alive);
    if (t) return t;
  }
  return null;
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

/**
 * The ship nearest her hands, if there is one within arm's length of where
 * they come down -- or `t`, if it is she that is.
 */
export function grabbable(state, ship, team = ship.team, t = null) {
  const ok = (s) => s.alive && s.id !== ship.id && s.team !== team && !s.gripBy && !s.flung && !s.splash
    && !shipClass(s).monster && reachFor(ship, s).gap <= MONSTER.grab.arm;
  if (t) return ok(t) ? t : null;
  let best = null, bd = Infinity;
  for (const s of state.ships) {
    if (!ok(s)) continue;
    const d = reachFor(ship, s).gap;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

/**
 * A ship in front of her jaws: the nearest enemy within a bite of her head,
 * or `t` if she is that one. Her head is well forward of her middle.
 */
function biteable(state, ship, t = null) {
  const B = MONSTER.bite;
  const ok = (s) => {
    if (!s.alive || s.id === ship.id || s.team === ship.team || s.flung || shipClass(s).monster) return false;
    if (s.gripBy && s.gripBy !== ship.id) return false;
    if (s.depth > 8) return false;
    return hullGap(at.x, at.z, s) <= B.reach;
  };
  const at = jawsAt(ship);
  if (t) return ok(t) ? t : null;
  let best = null, bd = Infinity;
  for (const s of state.ships) {
    if (!ok(s)) continue;
    const d = hullGap(at.x, at.z, s);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

/**
 * Where her breath goes, off whatever she was given: a ship, a point, or
 * nothing at all. It never refuses: a point too close for the beam is carried
 * out along the same line to where it is not (and a point right under her, as
 * the sea under a button at the foot of the screen is, out ahead of her); one
 * too far is brought in to the end of its reach; one close beside an enemy
 * ship is that ship; and nothing at all is the best enemy in front of her,
 * or the sea ahead.
 */
function breathAim(state, ship, o) {
  const B = MONSTER.breath;
  let aim = null, aimId = 0;
  const t = o.target ? state.ships.find((s) => s.id === o.target && s.alive && s.team !== ship.team) : null;
  if (t) { aim = { x: t.x, z: t.z }; aimId = t.id; }
  else if (Number.isFinite(o.x) && Number.isFinite(o.z)) aim = { x: o.x, z: o.z };
  if (aim && !aimId) {
    // Near an enemy ship: at her.
    let best = null, bd = 1200;
    for (const s of state.ships) {
      if (!s.alive || s.team === ship.team || shipClass(s).monster) continue;
      const d = dist(aim.x, aim.z, s.x, s.z);
      if (d < bd) { bd = d; best = s; }
    }
    if (best && dist(ship.x, ship.z, best.x, best.z) >= B.min) { aim = { x: best.x, z: best.z }; aimId = best.id; }
  }
  if (!aim) {
    // Nothing given: the nearest enemy within forty-five degrees of where
    // she faces, and in reach; or straight ahead.
    let best = null, bd = Infinity;
    for (const s of state.ships) {
      if (!s.alive || s.team === ship.team || shipClass(s).monster) continue;
      const d = dist(ship.x, ship.z, s.x, s.z);
      if (d < B.min || d > B.range) continue;
      if (Math.abs(angleDelta(ship.heading, headingTo(ship.x, ship.z, s.x, s.z))) > 0.8) continue;
      if (d < bd) { bd = d; best = s; }
    }
    if (best) { aim = { x: best.x, z: best.z }; aimId = best.id; }
    else aim = { x: ship.x + Math.sin(ship.heading) * B.range * 0.4, z: ship.z + Math.cos(ship.heading) * B.range * 0.4 };
  }
  let d = dist(ship.x, ship.z, aim.x, aim.z);
  if (d > B.range) {
    const k = B.range / d;
    aim = { x: ship.x + (aim.x - ship.x) * k, z: ship.z + (aim.z - ship.z) * k };
    aimId = 0;
  } else if (d < B.min) {
    // Too close: out along the same line, or ahead of her if it is under her.
    const h = d > 20 ? headingTo(ship.x, ship.z, aim.x, aim.z) : ship.heading;
    const far = B.min + 250;
    aim = { x: ship.x + Math.sin(h) * far, z: ship.z + Math.cos(h) * far };
    aimId = 0;
  }
  return { aim, aimId };
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
  if (m.biteCool > 0) m.biteCool = Math.max(0, m.biteCool - dt);
  if (m.crushCool > 0) m.crushCool = Math.max(0, m.crushCool - dt);
  // A creature has no engine room, no steering gear and no magazine, and
  // nothing a ship's damage does to those is anything to her.
  ship.engineDamage = 0;
  ship.steeringDamage = 0;
  ship.fires = 0;
  ship.flooding = 0;
  ship.sink = 0; ship.heel = 0; ship.trim = 0;
  // She does not run out of air: she comes up when she chooses.
  ship.oxygen = cls.dive.oxygen;
  // What is under her feet: the sea bed, or the land she has walked up
  // onto. Too shallow to swim in -- a beach, a shoal, an island -- and she is
  // up on her legs, walking, whatever she was doing in the water.
  const ground = hooks.ground ? hooks.ground(state, ship.x, ship.z) : -1e3;
  m.ground = ground;
  m.ashore = ground > MONSTER.wade;
  if (m.ashore && m.pose !== 'stand') {
    if (m.act === 'tail' && m.pose === 'swim') { /* finishes where it is */ } else setPose(ship, 'stand');
  }
  // Deep is the dive, and the dive is hers to order: the dive's own
  // order is kept in step with her posture.
  ship.depthCmd = m.pose === 'deep' ? MONSTER.deep : 0;
  if (m.ashore) ship.depth = Math.min(ship.depth, 0.5);

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

  // A ship marked for her breath gets it the moment it is ready.
  if (m.marks && m.marks.length && !m.act && m.cool <= 0) breatheAtMark(state, ship, m, hooks);

  // The glow dies away when she is not gathering the breath.
  if (m.act !== 'charge' && m.act !== 'fire') m.glow = Math.max(0, m.glow - dt / 3);

  switch (m.act) {
    case 'charge': stepCharge(state, ship, m, dt, hooks); break;
    case 'fire': stepFire(state, ship, m, dt, hooks); break;
    case 'tail': stepTail(state, ship, m, hooks); break;
    case 'reach': stepReach(state, ship, m, hooks); break;
    case 'hold': stepHold(state, ship, m, dt, hooks); break;
    case 'throw': stepThrow(state, ship, m, hooks); break;
    case 'crush': stepCrush(state, ship, m, hooks); break;
    case 'bite': stepBite(state, ship, m, hooks); break;
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
    // Where it strikes: ten kilotons.
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
      if (!s.alive || s.id === ship.id || s.gripBy === ship.id) continue;
      if (!hooks.mayHurt(state, ship.team, s)) continue;
      if (s.depth > 4) continue;
      const sc = shipClass(s);
      if (hullGap(ship.x, ship.z, s) > T.reach) continue;
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
  // Her lunge: forward as she rears up and her hands come down, so they come
  // down on the ship and not short of her.
  if (m.lunge && m.lunge.d > 0) {
    const want = m.lunge.d * smooth01((m.actT - lead * 0.5) / (G.takeAt + lead * 0.5));
    const go = want - m.lunge.done;
    if (go > 0) {
      ship.x += Math.sin(ship.heading) * go;
      ship.z += Math.cos(ship.heading) * go;
      m.lunge.done = want;
    }
  }
  if (m.actT >= G.takeAt + lead && !m.holdId) {
    const t = state.ships.find((s) => s.id === m.grabId);
    const at = handsAt(ship);
    // Her hands have to come down on her: a ship that has got out from under
    // them while they were on their way is missed.
    if (t && t.alive && !t.gripBy && !t.flung && hullGap(at.x, at.z, t) <= G.arm + G.slip) {
      m.holdId = t.id;
      t.gripBy = ship.id;
      // A small ship comes up out of the water in her hands; a big one is
      // held down where she lies.
      const lifted = liftable(t);
      m.pin = !lifted;
      t.held = { t: 0, lifted, heavy: heaviness(t), x0: t.x, z0: t.z, h0: t.heading };
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
  if (m.actT >= MONSTER.grab.hold) {
    if (m.pin) { letGo(state, ship, hooks); m.act = ''; return; }
    m.throwAt = null; startAct(m, 'throw'); m.thrown = false;
  }
}

function stepThrow(state, ship, m, hooks) {
  const G = MONSTER.grab;
  if (!m.thrown && m.actT >= G.release.at) {
    m.thrown = true;
    const t = state.ships.find((s) => s.id === m.holdId);
    if (t && t.alive && m.pin) {
      letGo(state, ship, hooks);
    } else if (t && t.alive) {
      // Toward where she was told, or out ahead of her.
      let to = m.throwAt;
      // A heavy ship goes less far and less high.
      const heavy = t.held?.heavy ?? heaviness(t);
      const reach = G.toss * heavy;
      if (!to) to = { x: ship.x + Math.sin(ship.heading) * reach, z: ship.z + Math.cos(ship.heading) * reach };
      const d = dist(ship.x, ship.z, to.x, to.z);
      if (d > reach) { const k = reach / d; to = { x: ship.x + (to.x - ship.x) * k, z: ship.z + (to.z - ship.z) * k }; }
      // Out of her hands where they open, at the top of her swing: ahead of
      // her and well up, so the flight starts where the hull is drawn.
      const R = G.release;
      const x0 = ship.x + Math.sin(ship.heading) * R.ahead, z0 = ship.z + Math.cos(ship.heading) * R.ahead;
      // Tumbling over to one side or the other as she goes, and level again
      // by the time she comes down.
      const roll = ((t.id * 7 + ship.id) % 2) ? 1 : -1;
      t.flung = { t: 0, T: G.flight * (0.75 + 0.25 * heavy), x0, z0, x1: to.x, z1: to.z, y0: R.up, h: Math.max(30, G.arc * heavy), by: ship.id, roll };
      t.x = x0; t.z = z0;
      t.gripBy = 0;
      t.held = null;
    }
    m.holdId = 0;
    m.pin = false;
  }
  if (m.actT >= G.throwTime) m.act = '';
}

/** How far a ship goes when she is thrown, against a destroyer's: 1 down to MONSTER.grab.heavyToss. */
function heaviness(t) {
  const G = MONSTER.grab;
  const disp = shipClass(t).datasheet?.displacement || 10000;
  return clamp(Math.sqrt(G.lift / Math.max(G.lift, disp)), G.heavyToss, 1);
}

/** Her hands closed hard on the ship she holds; back to holding her after. */
function stepCrush(state, ship, m, hooks) {
  const C = MONSTER.crush;
  const t = state.ships.find((s) => s.id === m.holdId);
  if (!t || !t.alive) { letGo(state, ship, hooks); m.act = ''; return; }
  if (!m.crushHit && m.actT >= C.hitAt) {
    m.crushHit = true;
    hooks.damageShip(state, t, ship, t.maxHp * C.share + C.flat, 'ram');
    // What her fingers tore out of the hull, and any gun they closed on.
    const torn = hooks.tear ? hooks.tear(state, t, ship, 'claw') : null;
    const tr = torn ? { lx: torn.lx, ly: torn.ly, lz: torn.lz, r: torn.r, sd: torn.sd } : null;
    state.events.push({ e: 'moCrush', ship: ship.id, at: t.id, x: Math.round(t.x), z: Math.round(t.z), ...(tr ? { tr } : {}) });
    if (!t.alive) { letGo(state, ship, hooks); m.act = ''; return; }
  }
  if (m.actT >= C.time) startAct(m, 'hold');
}

/**
 * Her jaws: on the ship in her hands, or lunging for one in front of her.
 *
 * They go in where her head is turned (m.head) and nowhere else: what they
 * tear out, and all the harm the bite does, is in the one compartment they
 * closed on -- the bow, the machinery, the upperworks -- and none of it is
 * shared out over the rest of the ship. Her head swung across while her
 * teeth are still set in the steel drags them through it, and tears out
 * another mouthful where they have got to.
 */
function stepBite(state, ship, m, hooks) {
  const B = MONSTER.bite;
  const head = m.head || (m.head = { x: 0, y: 0 });
  if (!m.biteHit && m.actT >= B.hitAt) {
    m.biteHit = true;
    const t = state.ships.find((s) => s.id === m.biteId);
    // In her hands she cannot miss; in the water it has to be in front of her still.
    const lands = t && t.alive && (t.gripBy === ship.id || biteable(state, ship, t));
    if (lands) {
      if (t.gripBy !== ship.id) t.rockRate = (t.rockRate || 0) + 0.15;
      biteInto(state, ship, t, hooks, 1);
      m.biteAt = { x: head.x, y: head.y };
      m.biteDrags = 0;
      m.biteIn = t.id;
    } else {
      m.biteIn = 0;
      state.events.push({ e: 'moBite', ship: ship.id, at: 0, x: Math.round(ship.x + Math.sin(ship.heading) * 120), z: Math.round(ship.z + Math.cos(ship.heading) * 120) });
    }
    if (m.holdId) {
      const h = state.ships.find((s) => s.id === m.holdId);
      if (!h || !h.alive) letGo(state, ship, hooks);
    }
  } else if (m.biteHit && m.biteIn && m.biteAt && m.actT < B.time - 0.1 && (m.biteDrags || 0) < B.drags) {
    // Her teeth still in her: dragged through her plating as her head turns.
    if (Math.hypot(head.x - m.biteAt.x, head.y - m.biteAt.y) >= B.tug) {
      const t = state.ships.find((s) => s.id === m.biteIn);
      if (t && t.alive) {
        biteInto(state, ship, t, hooks, B.drag);
        m.biteAt = { x: head.x, y: head.y };
        m.biteDrags = (m.biteDrags || 0) + 1;
      } else m.biteIn = 0;
    }
  }
  if (m.actT >= B.time) {
    m.biteIn = 0;
    if (m.holdId) startAct(m, 'hold');
    else m.act = '';
  }
}

/** One mouthful out of `t`, where her head is turned, `k` of a full bite's harm. */
function biteInto(state, ship, t, hooks, k) {
  const B = MONSTER.bite;
  // What comes away in her teeth, and where on her that is.
  const torn = hooks.tear ? hooks.tear(state, t, ship, 'bite') : null;
  const where = torn && torn.where;
  // All of it into the compartment her jaws closed on, and none of it
  // passed on to the rest of her.
  hooks.damageShip(state, t, ship, (t.maxHp * B.share + B.flat) * k, 'ram', where || null, !!where);
  const tr = torn ? { lx: torn.lx, ly: torn.ly, lz: torn.lz, r: torn.r, sd: torn.sd } : null;
  state.events.push({ e: 'moBite', ship: ship.id, at: t.id, x: Math.round(t.x), z: Math.round(t.z), ...(tr ? { tr } : {}) });
}

/** Let go of whatever is in her hands, where it is. */
function letGo(state, ship, hooks) {
  const m = monsterOf(ship);
  const t = m.holdId ? state.ships.find((s) => s.id === m.holdId) : null;
  if (t) {
    // Dropped from her hands into the sea, from as high as they had her.
    if (t.held?.lifted && t.alive) {
      const up = clamp(t.held.t / 1.0, 0, 1) * MONSTER.grab.release.up * 0.8;
      t.flung = { t: 0, T: 0.6 + up / 40, x0: t.x, z0: t.z, x1: t.x, z1: t.z, y0: up, h: 2, by: ship.id, roll: 0, drop: true };
    }
    // One she was holding down is simply let go of, where she lies.
    t.gripBy = 0;
    t.held = null;
  }
  m.holdId = 0;
  m.pin = false;
}

/**
 * After every ship has moved: the ship in her hands is where her hands are,
 * and a ship she has thrown is where it has got to in the air. Done last so
 * nothing the ship herself does that tick moves her out of them.
 */
export function stepHeld(state, dt, hooks) {
  const G = MONSTER.grab;
  for (const s of state.ships) {
    if (s.gripBy) {
      const mo = state.ships.find((q) => q.id === s.gripBy);
      if (!mo || !mo.alive || !mo.mo || mo.mo.holdId !== s.id || !s.held) { s.gripBy = 0; s.held = null; continue; }
      const H = s.held;
      H.t += dt;
      s.speed = 0; s.driftX = 0; s.driftZ = 0; s.yawRate = 0;
      if (H.lifted) {
        // Brought up out of the water and in to her chest, turned across
        // her as it comes: eased from where her hands closed on her, so she
        // does not jump into them.
        const u = smooth01((H.t - 0.1) / 0.9);
        const tx = mo.x + Math.sin(mo.heading) * G.carry, tz = mo.z + Math.cos(mo.heading) * G.carry;
        s.x = H.x0 + (tx - H.x0) * u;
        s.z = H.z0 + (tz - H.z0) * u;
        s.heading = H.h0 + angleDelta(H.h0, mo.heading + Math.PI / 2) * u;
        // Once she is up, she goes where the hands go.
        if (u >= 1) { H.x0 = s.x; H.z0 = s.z; H.h0 = s.heading; }
      } else {
        // Too big to lift: held down where she lay, going nowhere -- and if
        // her hands have come off her, let go.
        s.x = H.x0; s.z = H.z0; s.heading = H.h0;
        const at = handsAt(mo);
        if (hullGap(at.x, at.z, s) > G.arm + G.slip * 2) { letGo(state, mo, hooks); if (mo.mo.act === 'hold' || mo.mo.act === 'crush') mo.mo.act = ''; }
      }
    }
    if (s.flung) {
      const f = s.flung;
      f.t += dt;
      const u = clamp(f.t / f.T, 0, 1);
      s.x = f.x0 + (f.x1 - f.x0) * u;
      s.z = f.z0 + (f.z1 - f.z0) * u;
      s.speed = 0; s.driftX = 0; s.driftZ = 0; s.yawRate = 0;
      // Out of her hands, up and over, and down to the water.
      s.liftY = flightY(f, u);
      if (u >= 1) {
        s.flung = null;
        s.liftY = 0;
        const by = state.ships.find((q) => q.id === f.by);
        const big = !f.drop;
        if (s.alive) hooks.damageShip(state, s, by || null, s.maxHp * (big ? 0.3 : 0.08) + 4000, 'ram');
        state.events.push({ e: 'moSlam', ship: s.id, x: Math.round(s.x), z: Math.round(s.z), big: big ? 1 : 0 });
        // Into the water where she hit it, and back up out of it in the
        // same place: as deep as the height she fell from drives her.
        const c = shipClass(s).hull;
        const fall = (f.y0 || 0) * (f.drop ? 1 : 0.5) + (f.drop ? 0 : f.h);
        s.splash = { t: 0, T: f.drop ? G.splash * 0.7 : G.splash, d: clamp(2 + fall * 0.06 + c.draft * 0.4, 2, 12), x: s.x, z: s.z, roll: f.roll || 0 };
        // And anything it comes down on.
        if (!f.drop) {
          for (const q of state.ships) {
            if (q === s || !q.alive || shipClass(q).monster) continue;
            if (dist(q.x, q.z, s.x, s.z) > (shipClass(q).hull.length + c.length) * 0.4) continue;
            hooks.damageShip(state, q, by || null, q.maxHp * 0.2 + 3000, 'ram');
          }
        }
      }
    } else if (s.splash) {
      const p = s.splash;
      p.t += dt;
      s.x = p.x; s.z = p.z;
      s.speed = 0; s.driftX = 0; s.driftZ = 0; s.yawRate = 0;
      s.liftY = splashY(p, clamp(p.t / p.T, 0, 1));
      if (p.t >= p.T) { s.splash = null; s.liftY = 0; }
    }
  }
}

function smooth01(x) { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); }

/**
 * How high a thrown ship is, a fraction `u` of the way through her flight:
 * from the height of the hands that let her go, up over the top, and down
 * to the water at the end. A quadratic in `u` with her going across at a
 * steady rate: the arc of something thrown, falling fastest as she lands.
 */
export function flightY(f, u) {
  return (f.y0 || 0) * (1 - u) + 4 * f.h * u * (1 - u);
}

/**
 * A thrown ship in the water she has come down into, `u` of the way back
 * up: driven under quickly by the fall, and then rising again, slowing as
 * she comes, to float where she went in. Never below `-d`, never above the
 * waterline.
 */
export function splashY(p, u) {
  const dip = 0.16;
  if (u < dip) return -p.d * Math.sin((u / dip) * Math.PI / 2);
  const v = (u - dip) / (1 - dip);
  return -p.d * (1 - v) * (1 - v) * (1 + 2 * v);
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
    Math.ceil(m.biteCool),
    Math.ceil(m.crushCool),
    // The ship in her hands is one she is holding down, not lifting.
    m.holdId && m.pin ? 1 : 0,
    // On her feet ashore, or in water too shallow to swim.
    m.ashore ? 1 : 0,
    // The ships marked for her breath, in order.
    (m.marks || []).slice(0, 6),
    // Where her head is turned, for her jaws: hundredths, across and up.
    [Math.round((m.head?.x || 0) * 100), Math.round((m.head?.y || 0) * 100)],
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
    biteCool: w[13] || 0,
    crushCool: w[14] || 0,
    pin: !!w[15],
    ashore: !!w[16],
    marks: Array.isArray(w[17]) ? w[17] : [],
    aim: Array.isArray(w[18]) ? { x: (w[18][0] || 0) / 100, y: (w[18][1] || 0) / 100 } : { x: 0, y: 0 },
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
 *     ship she can see as a place to put it, what her breath there would do to
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
    if (P.order.a === 'bite') botHead(state, m);
    const why = monsterOrder(state, ship, P.order, hooks);
    if (!why || why === 'cooling' || why === 'none' || why === 'close') P.order = null;
  }
  // While she has a ship in her hands she crushes her, bites her, and then
  // looks for somewhere to put her.
  if (m.act === 'hold' && m.actT > 0.8 && m.crushCool <= 0 && !m.botCrushed) {
    m.botCrushed = true;
    monsterOrder(state, ship, { a: 'crush' }, hooks);
  } else if (m.act === 'hold' && m.actT > 0.8 && m.biteCool <= 0 && !m.botBitten) {
    m.botBitten = true;
    botHead(state, m);
    monsterOrder(state, ship, { a: 'bite' }, hooks);
  } else if (m.act === 'hold' && m.pin && m.actT > 2.5 && m.botCrushed && m.botBitten) {
    // One too big to throw: crushed and bitten, and let go of.
    monsterOrder(state, ship, { a: 'throw' }, hooks);
  } else if (m.act === 'hold' && !m.pin && m.actT > 1.5) {
    const into = nearestOther(ship, seen, m.holdId);
    if (into && dist(ship.x, ship.z, into.x, into.z) < MONSTER.grab.toss * 1.1) {
      monsterOrder(state, ship, { a: 'throw', x: into.x, z: into.z }, hooks);
    } else if (m.actT > 5) {
      monsterOrder(state, ship, { a: 'throw' }, hooks);
    }
  }
  if (!m.holdId) { m.botCrushed = false; m.botBitten = false; }
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

/** Her own mind's choice of where on a ship to put her jaws: anywhere along her, mostly about her deck. */
function botHead(state, m) {
  m.head = { x: state.rng() * 2 - 1, y: state.rng() * 1.3 - 0.5 };
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

  // A ship her side has marked for her breath: closed to within reach of it.
  const mark = markedFoe(state, ship);
  if (mark && dist(ship.x, ship.z, mark.x, mark.z) > MONSTER.breath.range * 0.9) {
    return { go: lead(ship, mark), pose: 'swim', notch: 5 };
  }

  // The breath, where it pays.
  if (m.cool <= 0 && !m.holdId && seen.length && !mark) {
    const best = breathTarget(state, ship, seen, friends, hooks);
    if (best) return { order: { a: 'breath', target: best.id }, go: null, pose: 'stand', notch: 1 };
  }

  if (torp) return { go: anyFoe ? { x: anyFoe.x, z: anyFoe.z } : null, pose: 'deep', notch: 4 };

  // Hands first, from wherever she is: a ship within reach in front of her
  // is taken -- off the surface with a lunge, out of the deep by coming up
  // under her.
  const ahead = grabbable(state, ship);
  if (ahead && m.grabCool <= 0 && !m.act) return { order: { a: 'grab', target: ahead.id }, go: { x: ahead.x, z: ahead.z }, pose: null, notch: 3 };
  // Her hands not ready: her jaws.
  const jaws = ship.depth < 0.6 && m.biteCool <= 0 && !m.act ? biteable(state, ship) : null;
  if (jaws) return { order: { a: 'bite', target: jaws.id }, go: { x: jaws.x, z: jaws.z }, pose: null, notch: 3 };
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
  // Close by, she wades in until the nearest of them is under her hands,
  // slowing as she comes so she does not run past her.
  if (near && dNear < 320 && ship.depth < 0.6 && !m.holdId) {
    const at = handsAt(ship);
    const gap = hullGap(at.x, at.z, near);
    return { go: { x: near.x, z: near.z }, pose: null, notch: gap < 40 ? 1 : gap < 120 ? 2 : 3 };
  }
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
 * place to put her breath by what it would do to all of them, less three times
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

