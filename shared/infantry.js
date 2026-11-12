// The infantry: riflemen ashore.
//
// A soldier is the smallest thing on the battlefield and there are a great
// many of them -- fifty out of every barracks put on the plotting board, and
// as many as a landing craft carries when her ramp goes down on a beach.
// Each one is a real body in the simulation: he stands, crouches, runs,
// sprints and jumps over the ground the guns are knocking holes in, carries
// an M1 Garand with its eight-round clip, and is hit or missed by the line
// the round actually takes. A hill, a house, a tank between him and the man
// shooting at him stops it, which is the whole of what cover is.
//
// What he does is his own: a small brain that looks round for the enemy,
// weighs whether to go forward, get down behind something, get in behind a
// tank of his own side, work round a flank, keep heads down or fall back --
// and learns, from what happens to him and to the men round him, which of
// those has been paying off. Over him is his squad's order. That comes from
// a commander working off the whole of his side's picture -- this module's
// own, or, on a server given an API key, Claude Opus 5.5 itself (see
// server/opus.js), which is handed the same picture as a brief and sends
// back an order for every squad.
//
// A player can take any soldier of his own side, as he can a tank: the
// stick in the lower left walks him, the view is where he looks and aims,
// and the keys crouch, sprint, jump, fire and reload.
//
// Blood. A man hit bleeds where he was hit, and a man killed by a shell or
// run over by a tank comes apart. The simulation decides where and how
// badly; what that looks like is the client's (render/infantry.js).

import { clamp, wrapAngle, angleDelta, headingTo, localToWorld, gauss, TAU } from './math.js';
import { nukeScale } from './nuke.js';
import { groundHeight, drawnGround, sightOf } from './world.js';
import { worksImpact, buildingAt } from './works.js';
import { BATTERIES } from './batteries.js';
import { getClass } from './ships.js';

// ---------------------------------------------------------------------------
// The man and his rifle
// ---------------------------------------------------------------------------

/** How tall he is standing and crouched, and where his eye is, in metres. */
export const BODY = { stand: 1.78, crouch: 1.18, eyeStand: 1.62, eyeCrouch: 1.04, radius: 0.27 };

/** How fast he goes, in metres a second. */
export const PACE = { crouch: 1.3, walk: 1.7, run: 3.6, sprint: 6.0, wade: 1.1 };

/**
 * The M1 Garand: .30-06, eight rounds in an en-bloc clip that goes out with
 * a ping when the last one is fired. A man carried a belt of ten clips.
 */
export const GARAND = {
  clip: 8, clips: 10, reload: 2.3,
  // As fast as a man can work the trigger and stay on the target.
  cycle: 0.28,
  range: 800, effective: 460,
  damage: 62,
};

/** How many come out of each barracks, and how they are split. */
export const BARRACKS_MEN = 50;
export const SQUAD_SIZE = 10;

/** Most barracks one battle will raise. */
export const MAX_BARRACKS = 12;

/** Most soldiers there will ever be on the field at once. */
export const MAX_SOLDIERS = 900;

/** How long a man killed is kept by the simulation, for the rounds on him, in seconds. */
const DEAD_KEEP = 90;

/** What the brain can choose between. */
export const TACTICS = ['advance', 'cover', 'tank', 'flank', 'suppress', 'fallback'];
const T_ADVANCE = 0, T_COVER = 1, T_TANK = 2, T_FLANK = 3, T_SUPPRESS = 4, T_FALLBACK = 5;

/** What a squad can be ordered to do. */
export const ORDERS = ['advance', 'assault', 'hold', 'dig_in', 'flank_left', 'flank_right', 'follow_tank', 'fall_back'];

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------
// Where he can stand
// ---------------------------------------------------------------------------

/**
 * The surface under a man's boots: the land as it is drawn, or the bottom
 * where he is wading.
 *
 * The ground is worked out from the islands' and the coast's own shapes,
 * which is a good deal of arithmetic, and a few hundred men looking round and
 * walking about ask for it tens of thousands of times a second. So it is
 * read once a metre, kept, and filled in between: a man does not need the
 * ground to the centimetre. The memory is thrown away whenever the ground
 * changes -- a crater, a house down -- and filled again as it is asked for.
 */
export function footing(world, x, z) {
  let c = world._infH;
  if (!c || c.rev !== (world.groundRev || 0) || c.map.size > 600000) {
    c = world._infH = { rev: world.groundRev || 0, map: new Map() };
  }
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const at = (i, k) => {
    const key = (i + 40000) * 80000 + (k + 40000);
    let v = c.map.get(key);
    if (v === undefined) {
      // The ground as it is drawn, which is what he is seen to stand on.
      // The true field can be metres above the coarse mesh on a hillside,
      // and a man stood on that is a man in the air.
      v = drawnGround(world, i, k);
      if (!Number.isFinite(v)) v = groundHeight(world, i, k);
      c.map.set(key, v);
    }
    return v;
  };
  const a = at(ix, iz), b = at(ix + 1, iz), d = at(ix, iz + 1), e = at(ix + 1, iz + 1);
  return (a * (1 - fx) + b * fx) * (1 - fz) + (d * (1 - fx) + e * fx) * fz;
}

/**
 * The first point on the line from a to b that goes into the ground or a
 * house, as a fraction of the way along it, or null. Read off the same kept
 * ground the men stand on, every couple of metres.
 */
function groundOnLine(world, ax, ay, az, bx, by, bz) {
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.ceil(L / 2.2));
  let hit = null;
  for (let k = 1; k <= n; k++) {
    const f = k / n;
    const y = ay + (by - ay) * f;
    // Above anything on this field: no need to look.
    if (y > 900) continue;
    if (footing(world, ax + (bx - ax) * f, az + (bz - az) * f) > y) { hit = f; break; }
  }
  if (world.works?.cities?.length) {
    const end = hit ?? 1;
    const w = worksImpact(world, ax, ay, az, ax + (bx - ax) * end, ay + (by - ay) * end, az + (bz - az) * end);
    if (w) return w.f * end;
  }
  return hit;
}

/** Deepest water he will wade, in metres. Deeper is not his. */
const WADE = 1.25;

/** Can he stand at this point at all: on land or in water he can wade, and not inside a house. */
export function standable(world, x, z) {
  const half = (world.half || 10000) - 40;
  if (Math.abs(x) > half || Math.abs(z) > half) return false;
  if (footing(world, x, z) < -WADE) return false;
  if (world.works?.cities?.length && buildingAt(world, x, z, 0.3)) return false;
  return true;
}

/** Is this dry ground, the kind a barracks can be put on. */
export function dryLand(world, x, z) {
  return footing(world, x, z) > 0.4 && standable(world, x, z);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** The infantry's half of the battle's state, made the first time it is wanted. */
export function infantryOf(state) {
  if (!state.inf) {
    state.inf = {
      next: 1,
      squads: [],
      barracks: [],
      // What each side has learned about what works: see the brain below.
      doctrine: [freshDoctrine(), freshDoctrine()],
      // When each side's commander last looked the field over.
      cmdAt: [0, 0],
      // Who is giving each side its orders: 'staff' (this module) or 'opus'.
      by: ['staff', 'staff'],
      // The last thing each side's commander said, for the plot to show.
      said: ['', ''],
    };
  }
  if (!state.soldiers) state.soldiers = [];
  return state.inf;
}

// ---------------------------------------------------------------------------
// Learning
// ---------------------------------------------------------------------------
//
// Each side keeps a table of how well each tactic has gone in each kind of
// moment: how heavily he is under fire (none, some, a lot), whether he is in
// cover, and whether there is a tank of his own close by. Every soldier, each
// time he decides, picks the tactic the table rates best for the moment he is
// in -- now and then trying another, so a side does not stop learning -- and
// when he next decides, what happened to him in between is written back into
// the table: the damage he did and the men he killed, against the damage he
// took, and whether he is still alive. That is a running average, so a side
// that keeps losing men running across open ground stops running across open
// ground, and one that keeps killing them from behind its tanks keeps doing
// that. The table outlives the battle where the host keeps it (see
// doctrineOut / doctrineIn).

const CONTEXTS = 3 * 2 * 2;

/** Each context's starting opinion of each tactic: a sensible soldier before he has seen anything. */
function prior(ctx, a) {
  const threat = Math.floor(ctx / 4);
  const cover = (ctx >> 1) & 1;
  const tank = ctx & 1;
  const P = [0, 0, 0, 0, 0, 0];
  if (threat === 0) { P[T_ADVANCE] = 0.6; P[T_FLANK] = 0.25; P[T_COVER] = 0.05; P[T_TANK] = tank ? 0.35 : -1; P[T_SUPPRESS] = 0; P[T_FALLBACK] = -0.3; }
  if (threat === 1) { P[T_ADVANCE] = 0.25; P[T_COVER] = cover ? 0.2 : 0.4; P[T_TANK] = tank ? 0.45 : -1; P[T_FLANK] = 0.3; P[T_SUPPRESS] = cover ? 0.45 : 0.15; P[T_FALLBACK] = -0.1; }
  if (threat === 2) { P[T_ADVANCE] = -0.1; P[T_COVER] = cover ? 0.25 : 0.6; P[T_TANK] = tank ? 0.55 : -1; P[T_FLANK] = 0.1; P[T_SUPPRESS] = cover ? 0.4 : 0.05; P[T_FALLBACK] = 0.15; }
  return P[a];
}

export function freshDoctrine() {
  const q = [];
  const n = [];
  for (let c = 0; c < CONTEXTS; c++) {
    q.push(TACTICS.map((_, a) => prior(c, a)));
    n.push(TACTICS.map(() => 0));
  }
  return { q, n, lessons: 0 };
}

/** What a side has learned, to keep. */
export function doctrineOut(state, team) {
  const d = infantryOf(state).doctrine[team];
  return { v: 1, q: d.q.map((row) => row.map(r2)), n: d.n.map((row) => row.slice()), lessons: d.lessons };
}

/** Start a side off with what it learned before. Anything malformed is ignored. */
export function doctrineIn(state, team, saved) {
  if (!saved || saved.v !== 1 || !Array.isArray(saved.q) || saved.q.length !== CONTEXTS) return false;
  const d = infantryOf(state).doctrine[team];
  for (let c = 0; c < CONTEXTS; c++) {
    const row = saved.q[c];
    if (!Array.isArray(row) || row.length !== TACTICS.length) return false;
    for (let a = 0; a < TACTICS.length; a++) {
      const v = Number(row[a]);
      if (Number.isFinite(v)) d.q[c][a] = clamp(v, -3, 3);
      const k = Number(saved.n?.[c]?.[a]);
      if (Number.isFinite(k)) d.n[c][a] = clamp(Math.round(k), 0, 1e7);
    }
  }
  d.lessons = Number(saved.lessons) || 0;
  return true;
}

/** Merge two sides' tables into one, weighted by how much each has seen: what a host keeps between battles. */
export function poolDoctrine(a, b) {
  const out = freshDoctrine();
  for (let c = 0; c < CONTEXTS; c++) {
    for (let k = 0; k < TACTICS.length; k++) {
      const na = a?.n?.[c]?.[k] || 0;
      const nb = b?.n?.[c]?.[k] || 0;
      const qa = a?.q?.[c]?.[k] ?? out.q[c][k];
      const qb = b?.q?.[c]?.[k] ?? out.q[c][k];
      out.n[c][k] = na + nb;
      out.q[c][k] = na + nb > 0 ? r2((qa * na + qb * nb) / (na + nb)) : out.q[c][k];
    }
  }
  out.lessons = (a?.lessons || 0) + (b?.lessons || 0);
  return { v: 1, ...out };
}

/** The moment a man is in, as a row of the table. */
function contextOf(s) {
  const threat = s.supp > 0.55 || s.brain.seen >= 4 ? 2 : (s.brain.seen > 0 || s.supp > 0.12 ? 1 : 0);
  return threat * 4 + (s.brain.covered ? 2 : 0) + (s.brain.tankNear ? 1 : 0);
}

function learn(state, s) {
  const b = s.brain;
  if (b.ctx < 0 || b.tac < 0) return;
  const d = infantryOf(state).doctrine[s.team];
  // What came of it: what he did to them, against what they did to him.
  const reward = clamp(b.dealt / 100 + b.killed * 1.2 - b.took / 100 * 1.3 - (s.alive ? 0 : 2.5)
    + b.gained / 30 * 0.3, -4, 4);
  const n = ++d.n[b.ctx][b.tac];
  const rate = Math.max(0.04, 1 / Math.sqrt(n + 4));
  d.q[b.ctx][b.tac] += rate * (reward - d.q[b.ctx][b.tac]);
  d.lessons++;
  b.dealt = 0; b.killed = 0; b.took = 0; b.gained = 0;
}

// ---------------------------------------------------------------------------
// Raising them
// ---------------------------------------------------------------------------

function newSquad(inf, team, x, z) {
  const sq = {
    id: inf.squads.length + 1,
    team,
    men: [],
    raised: 0,
    order: { k: 'hold', x, z, from: 'staff', until: 0, tank: 0, why: '' },
    // Which half of the squad is moving while the other covers it.
    bound: 0, boundAt: 0,
    side: inf.squads.length % 2 ? 1 : -1,
    posture: 'steady',
  };
  inf.squads.push(sq);
  return sq;
}

/** One soldier, at a point, facing a heading, in a squad. */
export function addSoldier(state, { team, x, z, h = 0, squad = null }) {
  const inf = infantryOf(state);
  if (state.soldiers.filter((s) => s.alive).length >= MAX_SOLDIERS) return null;
  const sq = squad || newSquad(inf, team, x, z);
  const s = {
    id: inf.next++,
    team,
    sq: sq.id,
    slot: sq.men.length,
    x, z, y: footing(state.world, x, z),
    vy: 0, air: false,
    h, yaw: h, pitch: 0,
    speed: 0,
    hp: 100,
    alive: true,
    crouch: false, sprint: false,
    clip: GARAND.clip, clips: GARAND.clips - 1, reload: 0, cool: 0,
    supp: 0,
    shotAt: -10,
    kills: 0,
    // A player who has taken him, by the id of the ship that player is.
    ctl: 0,
    drive: { mx: 0, mz: 0, sp: false, cr: false, jp: 0 },
    // His own mind. See think.
    brain: {
      next: state.t + 0.5 + ((state.rng() * 1000) | 0) / 1000,
      tac: -1, ctx: -1, goal: null, mode: 'walk', target: 0, aimT: 0,
      seen: 0, foes: [], covered: false, tankNear: 0, coverAt: 0, threat: null,
      dealt: 0, killed: 0, took: 0, gained: 0, objD: null, stuck: 0, grenade: 0,
    },
  };
  sq.men.push(s.id);
  sq.raised++;
  state.soldiers.push(s);
  return s;
}

/**
 * A barracks put down on the plotting board, and the fifty men who fall in
 * outside it: five squads of ten in ranks in front of its door.
 */
export function addBarracks(state, { team, x, z, h = 0, men = BARRACKS_MEN }) {
  const inf = infantryOf(state);
  const world = state.world;
  // On dry land: walked in toward the middle of the field until it is.
  let bx = x, bz = z;
  for (let k = 0; k < 40 && !dryLand(world, bx, bz); k++) { bx *= 0.97; bz *= 0.97; }
  const b = { id: inf.barracks.length + 1, team, x: r1(bx), z: r1(bz), h, hp: 1200, alive: true, y: footing(world, bx, bz) };
  inf.barracks.push(b);
  let made = 0;
  const squads = Math.ceil(men / SQUAD_SIZE);
  for (let q = 0; q < squads; q++) {
    const sq = newSquad(inf, team, bx, bz);
    for (let k = 0; k < SQUAD_SIZE && made < men; k++, made++) {
      // Ranks across the front of the hut: a squad to a rank, two deep.
      const lx = (k % 5 - 2) * 2.2 + (q - (squads - 1) / 2) * 12;
      const lz = 14 + Math.floor(k / 5) * 2.4;
      const w = localToWorld(lx, lz, h);
      let sx = bx + w.x, sz = bz + w.z;
      if (!standable(world, sx, sz)) { sx = bx + w.x * 0.3; sz = bz + w.z * 0.3; }
      addSoldier(state, { team, x: sx, z: sz, h, squad: sq });
    }
  }
  state.events.push({ e: 'barracks', i: b.id, tm: team, x: b.x, z: b.z, n: made });
  return b;
}

// ---------------------------------------------------------------------------
// Lines of sight and of fire
// ---------------------------------------------------------------------------

/** The tanks on the field that can stop a round or hide a man: ashore and in one piece. */
function hullsAshore(state) {
  const out = state._infHulls || (state._infHulls = []);
  if (state._infHullsAt === state.tick) return out;
  state._infHullsAt = state.tick;
  out.length = 0;
  for (const b of state.batteries) {
    if (!b.tank || b.aboard) continue;
    const T = BATTERIES[b.batteryId]?.tank;
    if (!T) continue;
    out.push({ b, x: b.x, y: b.y, z: b.z, h: b.heading, hl: T.length / 2, hw: T.width / 2, ht: T.height, team: b.team, alive: b.alive });
  }
  return out;
}

/**
 * Where along the segment a→b it first goes into a tank's hull, as a fraction
 * of the way, or Infinity. A burnt-out hull stops a round as well as a live one.
 */
function hullOnLine(hulls, ax, ay, az, bx, by, bz, skip = null) {
  let best = Infinity;
  for (const t of hulls) {
    if (t.b === skip) continue;
    // Into the tank's own frame: x across her, z along her.
    const c = Math.cos(t.h), s = Math.sin(t.h);
    const lx0 = (ax - t.x) * c - (az - t.z) * s;
    const lz0 = (ax - t.x) * s + (az - t.z) * c;
    const lx1 = (bx - t.x) * c - (bz - t.z) * s;
    const lz1 = (bx - t.x) * s + (bz - t.z) * c;
    const ly0 = ay - t.y, ly1 = by - t.y;
    let t0 = 0, t1 = 1;
    const slab = (p0, p1, lo, hi) => {
      const d = p1 - p0;
      if (Math.abs(d) < 1e-9) return p0 >= lo && p0 <= hi;
      let u0 = (lo - p0) / d, u1 = (hi - p0) / d;
      if (u0 > u1) { const k = u0; u0 = u1; u1 = k; }
      t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
      return t0 <= t1;
    };
    if (!slab(lx0, lx1, -t.hw, t.hw)) continue;
    if (!slab(lz0, lz1, -t.hl, t.hl)) continue;
    if (!slab(ly0, ly1, 0, t.ht)) continue;
    if (t0 < best) best = t0;
  }
  return best;
}

/** Is the line from one point to another clear of the land, the houses and the tanks? */
export function clearLine(state, ax, ay, az, bx, by, bz, skip = null) {
  if (hullOnLine(hullsAshore(state), ax, ay, az, bx, by, bz, skip) <= 1) return false;
  return groundOnLine(state.world, ax, ay, az, bx, by, bz) === null;
}

const eyeOf = (s) => s.y + (s.crouch ? BODY.eyeCrouch : BODY.eyeStand);
const chestOf = (s) => s.y + (s.crouch ? 0.85 : 1.3);

// ---------------------------------------------------------------------------
// The round
// ---------------------------------------------------------------------------

/**
 * A round fired from a point along a line, out to `range`: what it hits --
 * the ground, a house, a tank, or a man -- and what that does. `by` is the
 * soldier who fired it, or null for a tank's machine gun (`gun` its hull).
 */
function fireRound(state, from, dx, dy, dz, range, damage, by, gun = null) {
  const ax = from.x, ay = from.y, az = from.z;
  let bx = ax + dx * range, by_ = ay + dy * range, bz = az + dz * range;
  let f = 1;
  let what = 0;
  // The ground or a house first: nothing past it is in danger.
  const land = groundOnLine(state.world, ax, ay, az, bx, by_, bz);
  if (land !== null) { f = land; what = 2; }
  const steel = hullOnLine(hullsAshore(state), ax, ay, az, bx, by_, bz, gun);
  if (steel < f) { f = steel; what = 3; }
  // Then the men along it, the nearest first.
  const team = by ? by.team : gun ? gun.team : -1;
  let hit = null;
  let hitF = f;
  let hitY = 0;
  const L = range;
  for (const s of state.soldiers) {
    if (!s.alive || s === by) continue;
    if (s.team === team && !state.friendlyFire) continue;
    // Along the line, how far to the point nearest him, in the flat.
    const px = s.x - ax, pz = s.z - az;
    const flat = Math.max(1e-6, dx * dx + dz * dz);
    const u = (px * dx + pz * dz) / flat;
    if (u < 0 || u / L > hitF) continue;
    const cx = ax + dx * u, cz = az + dz * u;
    const off = Math.hypot(s.x - cx, s.z - cz);
    // Near misses keep heads down whether or not they hit.
    if (off < 4 && s.team !== team) s.supp = Math.min(1, s.supp + (off < 1.5 ? 0.18 : 0.08));
    if (off > BODY.radius) continue;
    const y = ay + dy * u;
    const top = s.y + (s.crouch ? BODY.crouch : BODY.stand);
    if (y < s.y + 0.05 || y > top) continue;
    hit = s; hitF = u / L; hitY = (y - s.y) / (top - s.y);
  }
  if (hit) { f = hitF; what = 1; }
  const ex = ax + dx * range * f, ey = ay + dy * range * f, ez = az + dz * range * f;
  state.events.push({
    e: 'rf', s: by ? by.id : 0, g: gun ? gun.id : undefined, tm: team,
    x: r1(ax), y: r1(ay), z: r1(az), tx: r1(ex), ty: r1(ey), tz: r1(ez), k: what,
  });
  if (hit) {
    // Where on him: the head, the chest and belly, an arm, the legs.
    const part = hitY > 0.86 ? 0 : hitY > 0.5 ? 1 : hitY > 0.4 ? 2 : 3;
    const mult = part === 0 ? 2.6 : part === 1 ? 1 : part === 2 ? 0.55 : 0.6;
    const dmg = damage * mult * (0.85 + state.rng() * 0.3);
    woundSoldier(state, hit, dmg, { x: ex, y: ey, z: ez, dx, dy, dz, part, by, gib: false });
  }
  return hit;
}

/** A man hurt: how badly, where, by whom, and whether that was the end of him. */
export function woundSoldier(state, s, dmg, { x, y, z, dx = 0, dy = 0, dz = 0, part = 1, by = null, gib = false } = {}) {
  if (!s.alive) return;
  s.hp -= dmg;
  s.brain.took += Math.min(dmg, s.hp + dmg);
  s.supp = Math.min(1, s.supp + 0.5);
  // Hurt, he thinks again now rather than finishing whatever he was doing.
  s.brain.next = Math.min(s.brain.next, state.t + 0.15);
  if (by && by.brain) by.brain.dealt += Math.min(dmg, s.hp + dmg);
  const hx = x ?? s.x, hy = y ?? chestOf(s), hz = z ?? s.z;
  if (s.hp > 0) {
    state.events.push({ e: 'wd', i: s.id, x: r1(hx), y: r1(hy), z: r1(hz), dx: r2(dx), dy: r2(dy), dz: r2(dz), p: part, n: r1(dmg) });
    return;
  }
  s.hp = 0;
  s.alive = false;
  s.died = state.t;
  if (by) {
    by.kills++;
    if (by.brain) by.brain.killed++;
  }
  learn(state, s);
  state.events.push({
    e: 'kia', i: s.id, tm: s.team, x: r1(s.x), y: r1(s.y), z: r1(s.z), h: r2(s.h),
    hx: r1(hx), hy: r1(hy), hz: r1(hz), dx: r2(dx), dy: r2(dy), dz: r2(dz),
    p: part, g: gib ? 1 : 0, c: s.crouch ? 1 : 0, by: by ? by.id : 0, pc: s.ctl || 0,
  });
}

/**
 * A burst on the ground -- a shell, a bomb, a grenade -- and what it does to
 * the men round it. `bore` is the calibre in metres, the same number the
 * crater is dug off. Close in, a man is killed and taken apart; further out
 * he is wounded by what is flung; behind a fold of ground or a tank he is
 * spared most of it, and down on his knees a little.
 */
export function blastInfantry(state, x, z, bore, kind = 'shell', by = null) {
  if (!state.inf) return;
  const big = kind === 'bomb' ? 1.8 : kind === 'grenade' ? 1 : kind === 'crash' ? 1.2 : 1;
  const R = kind === 'grenade' ? 4.5 : (3 + bore * 55) * big;
  const W = R * 2.3;
  const y0 = footing(state.world, x, z) + 0.6;
  for (const s of state.soldiers || []) {
    if (!s.alive) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d > W) continue;
    const shield = clearLine(state, x, y0, z, s.x, chestOf(s), s.z) ? 1 : 0.28;
    const low = s.crouch ? 0.75 : 1;
    const k = d < R ? 1 : 1 - (d - R) / (W - R);
    const dmg = (d < R * 0.55 ? 260 : 40 + 160 * k) * k * shield * low;
    if (dmg < 4) { s.supp = Math.min(1, s.supp + 0.4); continue; }
    const len = Math.max(0.5, d);
    const dir = { dx: (s.x - x) / len, dy: 0.5, dz: (s.z - z) / len };
    woundSoldier(state, s, dmg, { x: s.x, y: chestOf(s), z: s.z, ...dir, part: 1, by, gib: d < R * 0.75 && shield > 0.5 });
  }
  for (const b of state.inf?.barracks || []) {
    if (!b.alive) continue;
    const d = Math.hypot(b.x - x, b.z - z);
    if (d > R + 12) continue;
    b.hp -= (kind === 'grenade' ? 20 : 120 + bore * 1800 * big) * (1 - d / (R + 12));
    if (b.hp <= 0) {
      b.alive = false;
      state.events.push({ e: 'barracksDown', i: b.id, tm: b.team, x: b.x, z: b.z });
    }
  }
}

// ---------------------------------------------------------------------------
// Firing his rifle
// ---------------------------------------------------------------------------

/** Can he fire now: alive, loaded, not mid-reload or mid-sprint, the bolt back. */
function canShoot(s) {
  return s.alive && s.clip > 0 && s.reload <= 0 && s.cool <= 0 && !s.sprint && !s.air;
}

/**
 * One round from his rifle along `yaw` and `pitch`, give or take how steady
 * he is: braced on his knee and still, or standing, or on the move, or with
 * rounds cracking past his ears.
 */
export function shootRifle(state, s, yaw, pitch, skill = 1) {
  if (!canShoot(s)) return false;
  const moving = Math.abs(s.speed) > 0.6;
  let sigma = (s.crouch ? 0.0028 : 0.0045) + (moving ? 0.014 : 0) + s.supp * 0.012;
  sigma /= Math.max(0.4, skill);
  const y = yaw + gauss(state.rng) * sigma;
  const p = pitch + gauss(state.rng) * sigma * 0.8;
  const c = Math.cos(p);
  const dx = Math.sin(y) * c, dy = Math.sin(p), dz = Math.cos(y) * c;
  const from = { x: s.x + Math.sin(yaw) * 0.55, y: eyeOf(s) - 0.08, z: s.z + Math.cos(yaw) * 0.55 };
  s.yaw = yaw;
  s.pitch = pitch;
  s.clip--;
  s.cool = GARAND.cycle;
  s.shotAt = state.t;
  fireRound(state, from, dx, dy, dz, GARAND.range, GARAND.damage, s);
  // The clip flies out with the last round.
  if (s.clip === 0) {
    state.events.push({ e: 'ping', i: s.id, x: r1(s.x), y: r1(eyeOf(s)), z: r1(s.z) });
    if (s.clips > 0) { s.clips--; s.reload = GARAND.reload; }
  }
  return true;
}

/** Thumb a fresh clip in, if he has one and the one in is not full. */
export function reloadRifle(state, s) {
  if (!s.alive || s.reload > 0 || s.clip === GARAND.clip || s.clips <= 0) return false;
  // A part-spent clip comes out with the ping as well.
  if (s.clip > 0) state.events.push({ e: 'ping', i: s.id, x: r1(s.x), y: r1(eyeOf(s)), z: r1(s.z) });
  s.clip = 0;
  s.clips--;
  s.reload = GARAND.reload;
  return true;
}

// ---------------------------------------------------------------------------
// Moving him
// ---------------------------------------------------------------------------

/**
 * One tick of his legs: toward `want` (a heading and a speed), over what is
 * in the way -- round a house or a bank too steep to climb, over a lip low
 * enough to jump -- and settled onto the ground or into his jump.
 */
function stepLegs(state, s, wantH, wantSpeed, dt, jump = false) {
  const world = state.world;
  // Wounded, he goes slower; wading, slower still.
  const g0 = footing(world, s.x, s.z);
  const wet = g0 < -0.3;
  let top = wantSpeed * (s.hp < 40 ? 0.65 : 1);
  if (wet) top = Math.min(top, PACE.wade);
  s.speed += clamp(top - s.speed, -12 * dt, 7 * dt);
  if (s.speed < 0.02 && top === 0) s.speed = 0;
  if (jump && !s.air && !wet) {
    s.air = true;
    s.vy = 3.9;
    state.events.push({ e: 'jump', i: s.id });
  }
  if (s.speed > 0.01) {
    // Feel ahead for a way through: straight on, then a little either side,
    // then a lot.
    const look = Math.max(0.9, s.speed * 0.5);
    let go = null;
    let goOff = 0;
    for (const off of [0, 0.45, -0.45, 0.95, -0.95, 1.5, -1.5]) {
      const h = wrapAngle(wantH + off * (s.brain.side || 1));
      const nx = s.x + Math.sin(h) * look, nz = s.z + Math.cos(h) * look;
      if (!standable(world, nx, nz)) continue;
      const rise = footing(world, nx, nz) - g0;
      // A lip he can get over: up it in a jump, if he is in one.
      if (rise > 0.55 * look && !(s.air && s.y + 0.1 > footing(world, nx, nz))) {
        if (rise < 1.3 && off === 0 && !s.air && !wet) {
          s.air = true; s.vy = 4.2;
          state.events.push({ e: 'jump', i: s.id });
        }
        if (rise > 1.4 * look) continue;
        if (!s.air) continue;
      }
      go = h;
      goOff = off;
      break;
    }
    if (go === null) {
      s.speed = 0;
      s.brain.stuck += dt;
    } else {
      s.brain.stuck = Math.max(0, s.brain.stuck - dt);
      s.h = wrapAngle(s.h + clamp(angleDelta(s.h, go), -8 * dt, 8 * dt));
      // He goes the way he found clear, not the way he happens to be facing
      // while he turns to it: stepping along his facing walked him straight
      // back into the wall he was feeling his way along, and he stuck there.
      // A man in a player's hands slides along it at what of his pace is
      // still going where he was pushed, as anyone does along a wall.
      const along = s.ctl ? Math.max(0, Math.cos(goOff)) : 1;
      const step = s.speed * dt * along;
      let nx = s.x + Math.sin(go) * step, nz = s.z + Math.cos(go) * step;
      if (!standable(world, nx, nz)) {
        // The corner of a house the feel ahead missed: along either side of it.
        const ax = Math.sin(wantH) * step, az = Math.cos(wantH) * step;
        if (standable(world, s.x + ax, s.z)) { nx = s.x + ax; nz = s.z; } else if (standable(world, s.x, s.z + az)) { nx = s.x; nz = s.z + az; } else { nx = null; }
      }
      if (nx !== null) { s.x = nx; s.z = nz; } else s.speed *= 0.3;
    }
  }
  const g = footing(world, s.x, s.z);
  // In the water he stands on the bottom with his head out of it.
  const floor = g;
  if (s.air) {
    s.vy -= 9.8 * dt;
    s.y += s.vy * dt;
    if (s.y <= floor) { s.y = floor; s.air = false; s.vy = 0; }
  } else s.y = floor;
}

// ---------------------------------------------------------------------------
// His brain
// ---------------------------------------------------------------------------

/** The enemy he can see from where he is, nearest first, a few at a time. */
function lookRound(state, s, foes) {
  const b = s.brain;
  const sight = Math.min(900, sightOf(state.world) * 0.35 + 250);
  const eye = eyeOf(s);
  const near = [];
  for (const o of foes) {
    if (!o.alive) continue;
    const d = Math.hypot(o.x - s.x, o.z - s.z);
    if (d > sight) continue;
    near.push({ o, d });
  }
  near.sort((p, q) => p.d - q.d);
  const seen = [];
  for (let k = 0; k < near.length && seen.length < 6 && k < 14; k++) {
    const { o, d } = near[k];
    // A man standing is seen over a fold a man crouched is not. And a man
    // who has just fired has given himself away.
    const loud = state.t - o.shotAt < 1.5 && d < 500;
    const top = o.y + (o.crouch ? BODY.crouch - 0.1 : BODY.stand - 0.1);
    if (loud || clearLine(state, s.x, eye, s.z, o.x, top, o.z)) seen.push({ o, d });
  }
  b.foes = seen;
  b.seen = seen.length;
  for (const f of seen) f.o.seenAt = state.t;
  // Where the danger is: the middle of what he can see, weighted to the near.
  if (seen.length) {
    let wx = 0, wz = 0, w = 0;
    for (const f of seen) { const k = 1 / Math.max(30, f.d); wx += f.o.x * k; wz += f.o.z * k; w += k; }
    b.threat = { x: wx / w, z: wz / w };
  } else if (b.threat && state.t - (b.threatAt || 0) > 20) b.threat = null;
  if (seen.length) b.threatAt = state.t;
}

/** A tank of his own side close enough to get in behind, and alive. */
function friendlyTank(state, s, reach = 70) {
  let best = null, bd = reach;
  for (const t of hullsAshore(state)) {
    if (t.team !== s.team || !t.alive) continue;
    const d = Math.hypot(t.x - s.x, t.z - s.z);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

/**
 * Somewhere near him to get down behind: a point where, crouched, the
 * enemy he knows of cannot see his chest -- and, if it can be had as well,
 * one he can stand up at and shoot from. Looked for round him, behind the
 * houses and behind the tanks of his own side, and scored on how much it
 * hides him, whether he can fight from it, how far it is, and whether it
 * takes him toward where he is meant to be going.
 */
function findCover(state, s, toward) {
  const b = s.brain;
  const threats = b.foes.slice(0, 3).map((f) => f.o);
  if (!threats.length && b.threat) threats.push({ x: b.threat.x, z: b.threat.z, y: footing(state.world, b.threat.x, b.threat.z), crouch: false });
  if (!threats.length) return null;
  const world = state.world;
  const cands = [];
  const tx = b.threat ? b.threat.x : threats[0].x;
  const tz = b.threat ? b.threat.z : threats[0].z;
  const away = headingTo(tx, tz, s.x, s.z);
  // Round him, more of them on the side away from the enemy.
  for (const r of [6, 14, 24]) {
    for (let k = 0; k < 6; k++) {
      const a = away + (k - 2.5) * 0.7 + (state.rng() - 0.5) * 0.4;
      cands.push({ x: s.x + Math.sin(a) * r, z: s.z + Math.cos(a) * r, why: 'ground' });
    }
  }
  // In the lee of a tank of his own: the side of her away from the enemy.
  for (const t of hullsAshore(state)) {
    if (!t.alive || t.team !== s.team) continue;
    if (Math.hypot(t.x - s.x, t.z - s.z) > 80) continue;
    const a = headingTo(tx, tz, t.x, t.z);
    for (const off of [0, 0.5, -0.5]) {
      const d = t.hw + 1.4 + Math.abs(off) * 1.6;
      cands.push({ x: t.x + Math.sin(a + off) * d, z: t.z + Math.cos(a + off) * d, why: 'tank', tank: t });
    }
  }
  // And a burnt-out hull, which is as good as a live one to hide behind.
  let best = null;
  let bestScore = -Infinity;
  const ord = toward || null;
  for (const c of cands) {
    if (!standable(world, c.x, c.z)) continue;
    const g = footing(world, c.x, c.z);
    if (g < -0.6) continue;
    let hidden = 0;
    let shoot = 0;
    for (const o of threats) {
      const oy = (o.y ?? 0) + (o.crouch ? BODY.eyeCrouch : BODY.eyeStand);
      if (!clearLine(state, o.x, oy, o.z, c.x, g + 0.9, c.z)) hidden++;
      if (clearLine(state, c.x, g + BODY.eyeStand, c.z, o.x, oy, o.z)) shoot = 1;
    }
    const dist = Math.hypot(c.x - s.x, c.z - s.z);
    const prog = ord ? (Math.hypot(ord.x - s.x, ord.z - s.z) - Math.hypot(ord.x - c.x, ord.z - c.z)) / 25 : 0;
    const score = (hidden / threats.length) * 2.2 + shoot * 0.8 - dist / 18 + clamp(prog, -1, 1) * 0.5
      + (c.why === 'tank' ? 0.4 : 0);
    if (score > bestScore) { bestScore = score; best = { ...c, hidden: hidden / threats.length, shoot, score }; }
  }
  return best && best.hidden > 0 ? best : null;
}

/** Is he covered where he stands from the enemy he knows of? */
function coveredHere(state, s) {
  const b = s.brain;
  const threats = b.foes.slice(0, 3).map((f) => f.o);
  if (!threats.length) return false;
  let hidden = 0;
  for (const o of threats) {
    const oy = o.y + (o.crouch ? BODY.eyeCrouch : BODY.eyeStand);
    if (!clearLine(state, o.x, oy, o.z, s.x, s.y + 0.9, s.z)) hidden++;
  }
  return hidden / threats.length >= 0.66;
}

/** Where his squad is meant to be going, with his own place in it. */
function squadGoal(state, s, sq) {
  const o = sq.order;
  let gx = o.x, gz = o.z;
  if (o.k === 'follow_tank' && o.tank) {
    const t = state.batteries.find((q) => q.id === o.tank && q.alive);
    if (t) { gx = t.x - Math.sin(t.heading) * 8; gz = t.z - Math.cos(t.heading) * 8; }
  }
  const head = headingTo(s.x, s.z, gx, gz);
  // A wedge, two men a rank, opened out as the ground allows.
  const k = s.slot;
  const rank = Math.floor((k + 1) / 2);
  const side = k === 0 ? 0 : (k % 2 ? 1 : -1);
  const w = localToWorld(side * rank * 4.5, -rank * 3.5, head);
  let x = gx + w.x, z = gz + w.z;
  if (o.k === 'flank_left' || o.k === 'flank_right') {
    const dir = o.k === 'flank_left' ? -1 : 1;
    const d = Math.hypot(gx - s.x, gz - s.z);
    if (d > 120) {
      const p = localToWorld(dir * Math.min(140, d * 0.6), 0, head);
      x += p.x; z += p.z;
    }
  }
  return { x, z };
}

/**
 * A soldier left to himself: look round, decide, and set his goal, his pace
 * and his posture. Done every second or two, and at once when he is hit.
 */
function think(state, s, sq, foes) {
  const b = s.brain;
  // How much ground toward the squad's objective the last decision won him,
  // and what else came of it, into the table before the next.
  const o0 = sq.order;
  const toObj = Math.hypot(o0.x - s.x, o0.z - s.z);
  b.gained = o0.k === 'hold' || o0.k === 'dig_in' || o0.k === 'fall_back' || b.objD == null
    ? 0 : clamp(b.objD - toObj, -40, 40);
  b.objD = toObj;
  learn(state, s);
  lookRound(state, s, foes);
  const tank = friendlyTank(state, s);
  b.tankNear = tank ? 1 : 0;
  b.covered = coveredHere(state, s);
  const ctx = contextOf(s);
  const d = infantryOf(state).doctrine[s.team];
  // The table's opinion, nudged by what the squad has been ordered to do.
  const bias = [0, 0, 0, 0, 0, 0];
  const o = sq.order.k;
  if (o === 'advance') bias[T_ADVANCE] += 0.3;
  if (o === 'assault') { bias[T_ADVANCE] += 0.55; bias[T_FALLBACK] -= 0.4; }
  if (o === 'hold') { bias[T_COVER] += 0.25; bias[T_SUPPRESS] += 0.25; bias[T_ADVANCE] -= 0.3; }
  if (o === 'dig_in') { bias[T_COVER] += 0.5; bias[T_ADVANCE] -= 0.5; }
  if (o === 'flank_left' || o === 'flank_right') bias[T_FLANK] += 0.5;
  if (o === 'follow_tank') bias[T_TANK] += 0.6;
  if (o === 'fall_back') bias[T_FALLBACK] += 0.7;
  if (sq.posture === 'aggressive') { bias[T_ADVANCE] += 0.2; bias[T_FLANK] += 0.1; }
  if (sq.posture === 'cautious') { bias[T_COVER] += 0.2; bias[T_TANK] += 0.1; }
  // Bounding: half the squad moves while the other half covers it.
  const holding = b.seen > 0 && (s.slot % 2) === sq.bound;
  if (holding) { bias[T_SUPPRESS] += 0.3; bias[T_ADVANCE] -= 0.2; }
  if (s.hp < 40) { bias[T_FALLBACK] += 0.3; bias[T_COVER] += 0.2; }
  if (s.clip === 0 && s.clips === 0) { bias[T_FALLBACK] += 0.6; bias[T_SUPPRESS] -= 1; }
  let tac = -1, best = -Infinity;
  const explore = state.rng() < 0.08;
  const options = [];
  for (let a = 0; a < TACTICS.length; a++) {
    if (a === T_TANK && !tank) continue;
    if (a === T_SUPPRESS && !b.seen) continue;
    options.push(a);
    const v = d.q[ctx][a] + bias[a];
    if (v > best) { best = v; tac = a; }
  }
  if (explore && options.length) tac = options[(state.rng() * options.length) | 0];
  b.ctx = ctx;
  b.tac = tac;
  const goal = squadGoal(state, s, sq);
  b.mode = 'walk';
  b.goal = null;
  b.aimT = b.seen ? state.t + 0.25 + state.rng() * 0.5 : 0;
  switch (tac) {
    case T_ADVANCE:
      b.goal = goal;
      b.mode = b.seen ? (b.covered ? 'sprint' : 'run') : (o === 'assault' ? 'run' : 'walk');
      break;
    case T_FLANK: {
      b.goal = goal;
      // Wide of the danger, not into it.
      if (b.threat) {
        const a = headingTo(s.x, s.z, b.threat.x, b.threat.z) + (sq.side || 1) * 1.2;
        b.goal = { x: s.x + Math.sin(a) * 40, z: s.z + Math.cos(a) * 40 };
      }
      b.mode = 'run';
      break;
    }
    case T_COVER: {
      const c = b.covered ? null : findCover(state, s, goal);
      if (c) { b.goal = { x: c.x, z: c.z }; b.mode = 'sprint'; b.coverAt = state.t; }
      break;
    }
    case T_TANK: {
      if (tank) {
        const tx = b.threat ? b.threat.x : goal.x;
        const tz = b.threat ? b.threat.z : goal.z;
        const a = headingTo(tx, tz, tank.x, tank.z);
        const off = ((s.slot % 3) - 1) * 0.55;
        const dd = tank.hw + 1.3 + (s.slot % 2) * 1.3;
        b.goal = { x: tank.x + Math.sin(a + off) * dd, z: tank.z + Math.cos(a + off) * dd };
        b.mode = Math.hypot(b.goal.x - s.x, b.goal.z - s.z) > 10 ? 'sprint' : 'walk';
      }
      break;
    }
    case T_SUPPRESS:
      b.goal = null;
      break;
    case T_FALLBACK: {
      const home = nearestHome(state, s);
      if (home) b.goal = home;
      else if (b.threat) {
        const a = headingTo(b.threat.x, b.threat.z, s.x, s.z);
        b.goal = { x: s.x + Math.sin(a) * 60, z: s.z + Math.cos(a) * 60 };
      }
      b.mode = b.seen ? 'sprint' : 'run';
      break;
    }
    default: break;
  }
  // Pick the enemy to shoot at: the nearest he can see, a man who has just
  // fired at him before anybody else.
  b.target = 0;
  if (b.foes.length) {
    let pick = b.foes[0];
    for (const f of b.foes) if (state.t - f.o.shotAt < 2 && f.d < pick.d * 1.6) { pick = f; break; }
    b.target = pick.o.id;
  }
  // Gets down when there is anything to get down for, and stands to move.
  s.crouch = b.mode !== 'sprint' && b.mode !== 'run' && (b.seen > 0 || s.supp > 0.2 || b.covered);
  b.next = state.t + (b.seen ? 0.9 : 1.8) + state.rng() * 0.9;
  if (s.clip < 3 && s.clips > 0 && (b.covered || !b.seen)) reloadRifle(state, s);
}

/** His own side's barracks, or failing that a tank of his side, to fall back on. */
function nearestHome(state, s) {
  let best = null, bd = Infinity;
  for (const b of state.inf?.barracks || []) {
    if (b.team !== s.team || !b.alive) continue;
    const d = Math.hypot(b.x - s.x, b.z - s.z);
    if (d < bd) { bd = d; best = { x: b.x + ((s.slot % 5) - 2) * 3, z: b.z + 10 }; }
  }
  if (best) return best;
  const t = friendlyTank(state, s, 400);
  return t ? { x: t.x - Math.sin(t.h) * 6, z: t.z - Math.cos(t.h) * 6 } : null;
}

/** One tick of a man left to his own devices: go where he decided and fight. */
function stepBrain(state, s, sq, foes, dt) {
  const b = s.brain;
  if (state.t >= b.next) think(state, s, sq, foes);
  // Going somewhere.
  let wantH = s.h, want = 0;
  if (b.goal) {
    const d = Math.hypot(b.goal.x - s.x, b.goal.z - s.z);
    if (d > 1.2) {
      wantH = headingTo(s.x, s.z, b.goal.x, b.goal.z);
      want = b.mode === 'sprint' ? PACE.sprint : b.mode === 'run' ? PACE.run : PACE.walk;
      if (d < 4) want = Math.min(want, PACE.walk);
      // Keep off the next man: a squad that bunches is one shell's work.
      for (const id of sq.men) {
        if (id === s.id) continue;
        const o = state.soldiers.find((q) => q.id === id);
        if (!o || !o.alive) continue;
        const od = Math.hypot(o.x - s.x, o.z - s.z);
        if (od < 2.2 && od > 0.01) wantH = wrapAngle(wantH + clamp(angleDelta(headingTo(o.x, o.z, s.x, s.z), wantH) * -0.3, -0.5, 0.5));
      }
    } else {
      b.goal = null;
      if (b.seen || s.supp > 0.2) s.crouch = true;
    }
    // Stuck against something: give it up and think again.
    if (b.stuck > 1.5) { b.goal = null; b.stuck = 0; b.next = state.t; }
  }
  s.sprint = want >= PACE.sprint;
  if (s.crouch && want > PACE.crouch && b.mode !== 'walk') s.crouch = false;
  if (s.crouch) want = Math.min(want, PACE.crouch);
  stepLegs(state, s, wantH, want, dt);
  // And fighting: the man he picked, if he is still alive and still in sight.
  const tgt = b.target ? state.soldiers.find((q) => q.id === b.target) : null;
  if (tgt && tgt.alive && !s.sprint) {
    const aimY = (tgt.crouch ? 0.8 : 1.25) + tgt.y;
    const eye = eyeOf(s);
    const dist = Math.hypot(tgt.x - s.x, tgt.z - s.z);
    const yaw = headingTo(s.x, s.z, tgt.x, tgt.z);
    const pitch = Math.atan2(aimY - eye, dist);
    s.yaw = wrapAngle(s.yaw + clamp(angleDelta(s.yaw, yaw), -6 * dt, 6 * dt));
    s.pitch = pitch;
    // Standing still to shoot is steadier, and in cover he stands up out of
    // it to fire and drops again between rounds.
    const settled = state.t > b.aimT && Math.abs(angleDelta(s.yaw, yaw)) < 0.05;
    const gap = b.tac === T_SUPPRESS ? 0.55 : 1.0 + dist / 400;
    if (settled && canShoot(s) && state.t - s.shotAt > gap * (0.8 + state.rng() * 0.6) && dist < GARAND.range * 0.9) {
      // From crouch behind something tall, he has to stand to see over it.
      if (s.crouch && !clearLine(state, s.x, s.y + BODY.eyeCrouch, s.z, tgt.x, aimY, tgt.z)) s.crouch = false;
      // Rifle on him, skill falling off with range.
      const skill = clamp(1.25 - dist / 900, 0.5, 1.2);
      shootRifle(state, s, yaw, pitch, skill);
      b.aimT = state.t + 0.15;
    }
  } else if (b.target && (!tgt || !tgt.alive)) {
    b.target = 0;
    b.next = Math.min(b.next, state.t + 0.3);
  }
  // Face where he is going when he is not shooting.
  if (!tgt && s.speed > 0.4) s.yaw = s.h;
  // A grenade into an enemy tank or gun he has got close to.
  b.grenade = Math.max(0, b.grenade - dt);
  if (b.grenade <= 0) {
    for (const g of state.batteries) {
      if (!g.alive || g.team === s.team || g.aboard) continue;
      const d = Math.hypot(g.x - s.x, g.z - s.z);
      if (d < (g.tank ? 14 : 26)) {
        b.grenade = 7 + state.rng() * 4;
        state.events.push({ e: 'gren', i: s.id, x: r1(g.x), y: r1(g.y + 1), z: r1(g.z) });
        state._infHurtBattery?.(state, g, (g.maxHp || 1000) * (g.tank ? 0.05 : 0.07));
        blastInfantry(state, g.x + (s.x - g.x) * 0.1, g.z + (s.z - g.z) * 0.1, 0, 'grenade', s);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// In a player's hands
// ---------------------------------------------------------------------------

/** Take a soldier, or hand him back with `by` 0. */
export function commandSoldier(state, s, by) {
  if (!s || !s.alive) return false;
  if (by && s.ctl && s.ctl !== by) return false;
  // One at a time: whatever else he had goes back to its own wits.
  if (by) for (const o of state.soldiers) if (o !== s && o.ctl === by) o.ctl = 0;
  s.ctl = by || 0;
  s.drive = { mx: 0, mz: 0, sp: false, cr: s.crouch, jp: 0 };
  s.brain.goal = null;
  s.brain.next = state.t + 0.5;
  return true;
}

/**
 * What the player in charge of him is doing: `mx` and `mz` the stick, across
 * and ahead in the frame of where he is looking, `yaw` and `pitch` where he
 * is looking, `sp` sprinting, `cr` crouched, `jp` a counter that jumps him
 * each time it goes up.
 */
export function driveSoldier(state, s, msg) {
  if (!s || !s.alive || !s.ctl) return false;
  const d = s.drive;
  d.mx = clamp(Number(msg.mx) || 0, -1, 1);
  d.mz = clamp(Number(msg.mz) || 0, -1, 1);
  if (Number.isFinite(Number(msg.yaw))) s.yaw = wrapAngle(Number(msg.yaw));
  if (Number.isFinite(Number(msg.pitch))) s.pitch = clamp(Number(msg.pitch), -1.2, 1.2);
  d.sp = !!msg.sp;
  d.cr = !!msg.cr;
  const jp = Number(msg.jp) || 0;
  if (jp !== d.jp) { d.jumpNow = true; d.jp = jp; }
  return true;
}

/**
 * The man a player has in hand, walked one step on this player's own screen
 * ahead of the snapshots, by the same legs the battle walks him with (see
 * predict.js on the client). `s` carries `x, z, y, h, yaw, speed, air, vy,
 * hp` and his `drive`; nothing else is touched.
 */
export function predictSoldier(world, s, dt) {
  if (!s.brain) s.brain = { side: 1, stuck: 0 };
  stepDriven({ world, events: [], predict: true }, s, dt);
}

function stepDriven(state, s, dt) {
  const d = s.drive;
  s.crouch = d.cr && !d.sp;
  const mag = Math.min(1, Math.hypot(d.mx, d.mz));
  s.sprint = d.sp && mag > 0.3 && d.mz > 0.2;
  let want = 0;
  let wantH = s.h;
  if (mag > 0.08) {
    wantH = wrapAngle(s.yaw + Math.atan2(d.mx, d.mz));
    want = mag * (s.sprint ? PACE.sprint : s.crouch ? PACE.crouch : mag > 0.85 ? PACE.run : PACE.walk);
  }
  const jump = !!d.jumpNow;
  d.jumpNow = false;
  if (jump) s.crouch = false;
  stepLegs(state, s, wantH, want, dt, jump);
  // Walking, he faces the way he is going only when it is ahead of him:
  // backing or side-stepping he keeps facing where he is looking.
  if (want > 0) s.h = wantH;
}

// ---------------------------------------------------------------------------
// The commander
// ---------------------------------------------------------------------------
//
// Every few seconds each side's squads are looked over and given an order:
// at the nearest enemy there is, two squads on one objective working round
// either side of it, one in behind each tank of its own side if there is a
// tank to go with, and a squad that has been cut to pieces sent back to its
// barracks. An order from Opus (see orderSquads) stands for as long as it
// was given for; this fills in round it.

function squadMen(state, sq) {
  const out = [];
  for (const id of sq.men) {
    const s = state.soldiers.find((q) => q.id === id);
    if (s && s.alive) out.push(s);
  }
  return out;
}

function middleOf(men) {
  let x = 0, z = 0;
  for (const s of men) { x += s.x; z += s.z; }
  return { x: x / men.length, z: z / men.length };
}

/** Whatever of the enemy's this side knows to go for. */
function objectives(state, team) {
  const out = [];
  const inf = infantryOf(state);
  for (const sq of inf.squads) {
    if (sq.team === team) continue;
    const men = squadMen(state, sq);
    if (!men.length) continue;
    const m = middleOf(men);
    out.push({ kind: 'squad', id: sq.id, x: m.x, z: m.z, n: men.length });
  }
  for (const g of state.batteries) {
    if (!g.alive || g.team === team || g.aboard) continue;
    out.push({ kind: g.tank ? 'tank' : 'gun', id: g.id, x: g.x, z: g.z, n: 1 });
  }
  for (const b of inf.barracks) {
    if (!b.alive || b.team === team) continue;
    out.push({ kind: 'barracks', id: b.id, x: b.x, z: b.z + (team === 0 ? -14 : 14), n: 1 });
  }
  return out;
}

function staffOrders(state, team) {
  const inf = infantryOf(state);
  const mine = inf.squads.filter((q) => q.team === team);
  const targets = objectives(state, team);
  const onTarget = new Map();
  const tanksTaken = new Set();
  for (const sq of mine) {
    const men = squadMen(state, sq);
    if (!men.length) continue;
    if (sq.order.from === 'opus' && sq.order.until > state.t) continue;
    const m = middleOf(men);
    sq.at = m;
    let order = null;
    const strength = men.length / Math.max(1, sq.raised);
    if (strength < 0.3 && sq.raised >= 4) {
      const home = inf.barracks.find((b) => b.alive && b.team === team);
      if (home) order = { k: 'fall_back', x: home.x, z: home.z + 10, why: 'cut to pieces' };
    }
    if (!order) {
      let best = null, bd = Infinity;
      for (const t of targets) {
        const d = Math.hypot(t.x - m.x, t.z - m.z) * (t.kind === 'squad' ? 1 : 1.3);
        if (d < bd) { bd = d; best = t; }
      }
      // A tank of our own side nearby with nobody behind it: get in behind it.
      let tank = null;
      for (const t of hullsAshore(state)) {
        // Only one that is going somewhere: a tank parked on its own start
        // line is no use to a squad that wants to get forward.
        if (!t.alive || t.team !== team || tanksTaken.has(t.b.id) || Math.abs(t.b.speed || 0) < 0.4) continue;
        if (Math.hypot(t.x - m.x, t.z - m.z) < 180) { tank = t; break; }
      }
      if (tank && best) {
        tanksTaken.add(tank.b.id);
        order = { k: 'follow_tank', x: tank.x, z: tank.z, tank: tank.b.id, why: 'with the armour' };
      } else if (best) {
        const key = `${best.kind}:${best.id}`;
        const k = onTarget.get(key) || 0;
        onTarget.set(key, k + 1);
        const close = bd < 450;
        const kind = k === 0 ? (close && best.kind !== 'squad' ? 'assault' : 'advance')
          : k % 2 ? 'flank_left' : 'flank_right';
        order = { k: kind, x: best.x, z: best.z, why: `on the enemy ${best.kind}` };
      } else {
        order = { k: 'hold', x: m.x, z: m.z, why: 'no enemy known' };
      }
    }
    sq.order = { ...sq.order, ...order, tank: order.tank || 0, from: 'staff', until: 0 };
  }
}

/**
 * Orders for a side's squads from outside -- Opus, through server/opus.js --
 * each `{ squad, order, x, z, posture, reason }`. Anything that does not
 * name a squad of that side or an order there is is passed over. They stand
 * for `hold` seconds, then the side's own staff takes over again.
 */
export function orderSquads(state, team, orders, from = 'opus', hold = 50, said = '') {
  const inf = infantryOf(state);
  let n = 0;
  for (const o of Array.isArray(orders) ? orders : []) {
    const sq = inf.squads.find((q) => q.id === Number(o?.squad) && q.team === team);
    if (!sq || !ORDERS.includes(o.order)) continue;
    const men = squadMen(state, sq);
    if (!men.length) continue;
    const m = middleOf(men);
    let x = Number(o.x), z = Number(o.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) { x = m.x; z = m.z; }
    const half = (state.world.half || 10000) - 60;
    x = clamp(x, -half, half); z = clamp(z, -half, half);
    let tank = 0;
    if (o.order === 'follow_tank') {
      const t = hullsAshore(state).filter((q) => q.alive && q.team === team)
        .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
      if (t) { tank = t.b.id; x = t.x; z = t.z; }
    }
    sq.order = { k: o.order, x, z, tank, from, until: state.t + hold, why: String(o.reason || '').slice(0, 120) };
    if (['aggressive', 'steady', 'cautious'].includes(o.posture)) sq.posture = o.posture;
    for (const s of men) s.brain.next = Math.min(s.brain.next, state.t + 0.2 + (s.slot % 4) * 0.1);
    n++;
  }
  if (n) {
    inf.by[team] = from;
    if (said) inf.said[team] = String(said).slice(0, 200);
    state.events.push({ e: 'squadOrders', tm: team, n, by: from, said: inf.said[team] });
  }
  return n;
}

/**
 * The picture of the ground battle one side's commander is given: its own
 * squads, what it has seen of the enemy's, the armour and the guns on both
 * sides, and what its men have learned works. Plain numbers and words, so it
 * can go to Opus as it is.
 */
export function infantryBrief(state, team) {
  const inf = infantryOf(state);
  const squads = [];
  for (const sq of inf.squads) {
    if (sq.team !== team) continue;
    const men = squadMen(state, sq);
    if (!men.length) continue;
    const m = middleOf(men);
    const hp = men.reduce((a, s) => a + s.hp, 0) / men.length;
    const ammo = men.reduce((a, s) => a + s.clip + s.clips * GARAND.clip, 0);
    const contact = men.filter((s) => s.brain.seen > 0).length;
    const fire = men.reduce((a, s) => a + s.supp, 0) / men.length;
    const cover = men.filter((s) => s.brain.covered).length;
    squads.push({
      squad: sq.id, men: men.length, of: sq.raised, x: Math.round(m.x), z: Math.round(m.z),
      ground_m: Math.round(footing(state.world, m.x, m.z)),
      health: Math.round(hp), rounds: ammo, in_contact: contact, under_fire: r2(fire), in_cover: cover,
      order: sq.order.k, posture: sq.posture,
    });
  }
  const enemy = [];
  for (const sq of inf.squads) {
    if (sq.team === team) continue;
    const seen = squadMen(state, sq).filter((s) => state.t - (s.seenAt ?? -99) < 15);
    if (!seen.length) continue;
    const m = middleOf(seen);
    enemy.push({ x: Math.round(m.x), z: Math.round(m.z), men_seen: seen.length });
  }
  const armour = (mine) => hullsAshore(state).filter((t) => t.alive && (t.team === team) === mine)
    .map((t) => ({ x: Math.round(t.x), z: Math.round(t.z) }));
  const guns = state.batteries.filter((g) => g.alive && !g.tank && g.team !== team)
    .map((g) => ({ x: Math.round(g.x), z: Math.round(g.z), name: BATTERIES[g.batteryId]?.name }));
  const barracks = inf.barracks.filter((b) => b.alive)
    .map((b) => ({ side: b.team === team ? 'ours' : 'enemy', x: Math.round(b.x), z: Math.round(b.z) }));
  const craft = state.ships.filter((s) => s.alive && s.team === team && s.landed)
    .map((s) => ({ x: Math.round(s.x), z: Math.round(s.z), troops_aboard: s.troops || 0 }));
  // What the side's own men have found pays, moment by moment.
  const d = inf.doctrine[team];
  const lessons = [];
  const names = ['quiet', 'under some fire', 'under heavy fire'];
  for (let c = 0; c < CONTEXTS; c++) {
    const total = d.n[c].reduce((a, b) => a + b, 0);
    if (total < 10) continue;
    let best = 0;
    for (let a = 1; a < TACTICS.length; a++) if (d.q[c][a] > d.q[c][best]) best = a;
    lessons.push(`${names[Math.floor(c / 4)]}${(c >> 1) & 1 ? ', in cover' : ', in the open'}${c & 1 ? ', tank near' : ''}: ${TACTICS[best]} (${r2(d.q[c][best])})`);
  }
  return {
    time_s: Math.round(state.t),
    battlefield_half_width_m: Math.round(state.world.half || 10000),
    axes: 'x east-west, z north-south, metres; your side started at ' + (team === 0 ? 'negative z (south)' : 'positive z (north)'),
    my_squads: squads,
    enemy_squads_seen: enemy,
    my_tanks: armour(true),
    enemy_tanks: armour(false),
    enemy_guns: guns,
    barracks,
    my_landing_craft_beached: craft,
    lessons_learned: lessons,
  };
}

// ---------------------------------------------------------------------------
// The tank's machine guns, and its tracks
// ---------------------------------------------------------------------------

function stepTankGuns(state, dt) {
  const hulls = hullsAshore(state);
  for (const t of hulls) {
    const g = t.b;
    if (!g.alive) continue;
    // Its tracks: a man under them is a man no longer.
    if (Math.abs(g.speed || 0) > 0.6) {
      for (const s of state.soldiers) {
        if (!s.alive) continue;
        const dx = s.x - t.x, dz = s.z - t.z;
        if (dx * dx + dz * dz > 16) continue;
        const c = Math.cos(t.h), sn = Math.sin(t.h);
        const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
        const front = Math.sign(g.speed) * lz;
        if (Math.abs(lx) < t.hw + 0.2 && Math.abs(lz) < t.hl + 0.2 && front > -t.hl * 0.2) {
          woundSoldier(state, s, 999, { x: s.x, y: s.y + 0.3, z: s.z, dx: Math.sin(t.h), dy: -0.5, dz: Math.cos(t.h), part: 1, gib: true });
        }
      }
    }
    // The coaxial and the bow .30s, on any enemy soldier in sight -- unless
    // a player has it and is driving it himself.
    if (g.ctl) continue;
    g.mg = g.mg || { cool: 0, burst: 0, target: 0, look: 0 };
    const mg = g.mg;
    mg.cool -= dt;
    mg.look -= dt;
    if (mg.look <= 0) {
      mg.look = 0.6;
      mg.target = 0;
      let bd = 420;
      for (const s of state.soldiers) {
        if (!s.alive || s.team === g.team) continue;
        const d = Math.hypot(s.x - t.x, s.z - t.z);
        if (d > bd) continue;
        if (!clearLine(state, t.x, t.y + 1.9, t.z, s.x, chestOf(s), s.z, g)) continue;
        bd = d;
        mg.target = s.id;
      }
    }
    if (!mg.target || mg.cool > 0) continue;
    const s = state.soldiers.find((q) => q.id === mg.target);
    if (!s || !s.alive) { mg.target = 0; continue; }
    if (mg.burst <= 0) { mg.burst = 8 + ((state.rng() * 8) | 0); }
    mg.burst--;
    mg.cool = mg.burst > 0 ? 0.11 : 1.6 + state.rng();
    const from = { x: t.x + Math.sin(t.h) * (t.hl - 0.4), y: t.y + 1.6, z: t.z + Math.cos(t.h) * (t.hl - 0.4) };
    const d = Math.hypot(s.x - from.x, s.z - from.z);
    const yaw = headingTo(from.x, from.z, s.x, s.z) + gauss(state.rng) * 0.012;
    const pitch = Math.atan2(chestOf(s) - from.y, d) + gauss(state.rng) * 0.008;
    const c = Math.cos(pitch);
    fireRound(state, from, Math.sin(yaw) * c, Math.sin(pitch), Math.cos(yaw) * c, 700, 48, null, g);
  }
}

// ---------------------------------------------------------------------------
// Landing craft
// ---------------------------------------------------------------------------

/** Her soldiers out over her ramp once it is down, a man every few tenths of a second. */
function stepLanding(state, dt) {
  const inf = infantryOf(state);
  for (const ship of state.ships) {
    if (!ship.alive || !ship.rampDown || !(ship.troops > 0)) continue;
    const cls = getClass(ship.classId);
    ship.unloadT = (ship.unloadT || 0) - dt;
    if (ship.unloadT > 0) continue;
    ship.unloadT = 0.32;
    const half = cls.hull.length * 0.5;
    const beam = cls.hull.beam || 3;
    const k = ship.landedMen || 0;
    const lx = ((k % 3) - 1) * Math.min(1.1, beam * 0.25);
    let spot = null;
    for (const past of [2, 5, 9, 14]) {
      const w = localToWorld(lx, half + past, ship.heading);
      const x = ship.x + w.x, z = ship.z + w.z;
      if (standable(state.world, x, z)) { spot = { x, z }; break; }
    }
    if (!spot) continue;
    // Each boat's men are a squad of their own, a new one every dozen.
    if (!ship.landSquad || k % 12 === 0) {
      const sq = newSquad(inf, ship.team, spot.x, spot.z);
      // Straight off the beach, inland.
      const a = ship.heading;
      sq.order = { k: 'advance', x: spot.x + Math.sin(a) * 120, z: spot.z + Math.cos(a) * 120, tank: 0, from: 'staff', until: state.t + 20, why: 'off the beach' };
      ship.landSquad = sq.id;
    }
    const sq = inf.squads.find((q) => q.id === ship.landSquad);
    const s = addSoldier(state, { team: ship.team, x: spot.x, z: spot.z, h: ship.heading, squad: sq });
    if (!s) continue;
    s.speed = PACE.run;
    s.brain.goal = { x: spot.x + Math.sin(ship.heading) * (25 + (k % 5) * 4), z: spot.z + Math.cos(ship.heading) * (25 + (k % 5) * 4) };
    s.brain.mode = 'run';
    ship.troops--;
    ship.landedMen = k + 1;
    if (ship.landedMen === 1) state.events.push({ e: 'troopsAshore', ship: ship.id, x: r1(spot.x), z: r1(spot.z) });
  }
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

/**
 * Everything on two legs, for one tick. `hooks.hurtBattery` is the
 * simulation's own, for a grenade into a tank or a gun pit.
 */
export function stepInfantry(state, dt, hooks = {}) {
  if (!state.inf && !state.ships.some((s) => s.troops > 0 && s.rampDown)) return;
  const inf = infantryOf(state);
  state._infHurtBattery = hooks.hurtBattery;
  stepLanding(state, dt);
  // The things that went off this tick that the burst code does not route
  // through the ground: an atomic bomb takes everything for miles.
  for (const ev of state.events) {
    if (ev.e === 'nuke') {
      for (const s of state.soldiers) {
        if (s.alive && Math.hypot(s.x - ev.x, s.z - ev.z) < 2600 * nukeScale(ev.kt)) {
          woundSoldier(state, s, 999, { dx: 0, dy: 1, dz: 0, gib: true });
        }
      }
    }
  }
  if (!state.soldiers.length) return;
  // The commander's look round, every few seconds, each side in turn.
  for (let team = 0; team < 2; team++) {
    if (state.t - inf.cmdAt[team] > 5 + team * 0.5) {
      inf.cmdAt[team] = state.t;
      staffOrders(state, team);
    }
  }
  for (const sq of inf.squads) {
    if (state.t - sq.boundAt > 7) { sq.boundAt = state.t; sq.bound = 1 - sq.bound; }
  }
  const foes = [[], []];
  for (const s of state.soldiers) if (s.alive) foes[1 - s.team].push(s);
  const sqById = new Map(inf.squads.map((q) => [q.id, q]));
  for (const s of state.soldiers) {
    if (!s.alive) continue;
    s.cool = Math.max(0, s.cool - dt);
    s.supp = Math.max(0, s.supp - dt * 0.12);
    if (s.reload > 0) {
      s.reload -= dt;
      if (s.reload <= 0) { s.reload = 0; s.clip = GARAND.clip; }
    }
    if (s.ctl) stepDriven(state, s, dt);
    else stepBrain(state, s, sqById.get(s.sq), foes[s.team], dt);
    // Out of rounds: what the dead about him were carrying.
    if (s.clip === 0 && s.clips === 0 && s.reload <= 0 && state.tick % 30 === s.id % 30) {
      for (const o of state.soldiers) {
        if (o.alive || o.team !== s.team || o.looted || Math.hypot(o.x - s.x, o.z - s.z) > 4) continue;
        o.looted = true;
        s.clips += 3;
        reloadRifle(state, s);
        break;
      }
      for (const b of inf.barracks) {
        if (b.alive && b.team === s.team && Math.hypot(b.x - s.x, b.z - s.z) < 25) { s.clips = GARAND.clips - 1; reloadRifle(state, s); }
      }
    }
    // Drowned, or off the edge of the world.
    if (footing(state.world, s.x, s.z) < -WADE - 0.6) woundSoldier(state, s, 999, { part: 1 });
  }
  stepTankGuns(state, dt);
  // The dead are kept a while for what they carried (see above); the client
  // keeps its own bodies.
  if (state.tick % 30 === 0 && state.soldiers.length > 200) {
    state.soldiers = state.soldiers.filter((s) => s.alive || state.t - s.died < DEAD_KEEP);
  }
}

/**
 * The soldiers in a snapshot, as rows of numbers: `[id, team, x, z, y,
 * heading, yaw, pitch, flags, speed]`, and for a man of the viewer's own
 * side (or everyone, for `all`) `hp, controller, clip, clips, squad` after
 * that. There can be hundreds of them fifteen times a second, so the enemy's
 * men are sent with only what it takes to draw them.
 */
export function soldierWire(state, team = -1, all = false) {
  const out = [];
  for (const s of state.soldiers || []) {
    if (!s.alive) continue;
    const flags = (s.crouch ? 1 : 0) | (s.sprint ? 2 : 0) | (s.air ? 4 : 0) | (s.speed > 0.3 ? 8 : 0)
      | (s.reload > 0 ? 16 : 0) | (state.t - s.shotAt < 0.4 ? 32 : 0) | (s.hp < 40 ? 64 : 0)
      | (s.brain.target || s.ctl ? 128 : 0);
    // To the centimetre: a man walks a tenth of a metre between snapshots,
    // and rounded to that he went in jerks.
    const row = [s.id, s.team, r2(s.x), r2(s.z), r2(s.y), r2(s.h), r2(s.yaw), r2(s.pitch), flags, r1(s.speed)];
    if (all || s.team === team) row.push(Math.round(s.hp), s.ctl || 0, s.clip, s.clips, s.sq);
    out.push(row);
  }
  return out;
}

/** The barracks in a snapshot. */
export function barracksWire(state) {
  return (state.inf?.barracks || []).map((b) => [b.id, b.team, b.x, b.z, r2(b.h), b.alive ? 1 : 0]);
}

/** The squads' orders, for the side's own plot. */
export function squadWire(state, team) {
  const inf = state.inf;
  if (!inf) return undefined;
  const out = [];
  for (const sq of inf.squads) {
    if (sq.team !== team) continue;
    out.push([sq.id, ORDERS.indexOf(sq.order.k), Math.round(sq.order.x), Math.round(sq.order.z), sq.order.from === 'opus' ? 1 : 0]);
  }
  return { sq: out, by: inf.by[team], said: inf.said[team] };
}

export { TAU };
