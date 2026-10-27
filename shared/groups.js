// Fleets and squadrons: units a captain has told to work together.
//
// A side already fights as a side -- the staff in server/command.js sees to
// that -- but the player had no way to say "these three go together". Now he
// can pick his own ships off the plot and form them into a fleet, or pick his
// own flights and form them into a squadron, and an order given to one of
// them is an order given to all of them.
//
// A fleet steams as a body: a course laid off for any ship of it is a course
// for every ship of it, each keeping the station she held on the ship that
// was given the order, turned onto the new course. A squadron flies as one
// formation on its leader, goes where it is sent as one, and its strike
// aircraft go for the ship its leader has gone for.
//
// Both are no more than a number on each unit -- `fleet` on a ship, `wing` on
// a flight -- shared by every member, and nought for none.

import { dist, headingTo, wrapAngle } from './math.js';

/** How close a squadron has to get to where it was sent before it hunts again. */
export const VECTOR_REACHED = 1500;

/** The most units one group may hold. A plot with twenty in a fleet is a mess. */
export const GROUP_MAX = 8;

function nextGroup(state) {
  state.groupSeq = (state.groupSeq || 0) + 1;
  return state.groupSeq;
}

/** The units a group could be made of: alive, and of the side giving the order. */
function eligible(state, team, kind, ids) {
  const seen = new Set();
  const out = [];
  for (const id of ids || []) {
    if (!Number.isInteger(id) || seen.has(id)) continue;
    seen.add(id);
    const u = kind === 'ship'
      ? state.ships.find((s) => s.id === id && s.alive && s.team === team)
      : state.planes.find((p) => p.id === id && !p.dead && p.team === team);
    if (u) out.push(u);
    if (out.length >= GROUP_MAX) break;
  }
  return out;
}

/** Every unit of a group, alive. */
export function membersOf(state, kind, gid) {
  if (!gid) return [];
  return kind === 'ship'
    ? state.ships.filter((s) => s.alive && s.fleet === gid)
    : state.planes.filter((p) => !p.dead && p.wing === gid);
}

/**
 * Who leads a squadron: the first of it off a deck that is still flying. Every
 * flight works it out the same way, so they agree on her without being told.
 */
export function wingLeader(state, p) {
  if (!p || !p.wing) return null;
  let best = null;
  for (const q of state.planes) {
    if (q.dead || q.wing !== p.wing) continue;
    if (!best || q.id < best.id) best = q;
  }
  return best;
}

/** Take units out of whatever group they were in, and dissolve what is left if it is one. */
function leave(state, kind, units) {
  const key = kind === 'ship' ? 'fleet' : 'wing';
  const touched = new Set();
  for (const u of units) {
    if (!u[key]) continue;
    touched.add(u[key]);
    u[key] = 0;
    if (kind === 'ship') u.fleetWay = false;
    else { u.vec = null; u.lead = u.id; }
  }
  for (const gid of touched) {
    const rest = membersOf(state, kind, gid);
    // A group of one is not a group.
    if (rest.length < 2) leave(state, kind, rest);
    else if (kind === 'plane') formWing(state, rest, gid);
  }
}

/** Put a squadron in formation on its leader. */
function formWing(state, flights, gid) {
  const sorted = [...flights].sort((a, b) => a.id - b.id);
  const lead = sorted[0];
  sorted.forEach((p, i) => {
    p.wing = gid;
    if (p === lead) { p.lead = p.id; return; }
    p.lead = lead.id;
    // Her place in the formation: behind the strike she came off the deck
    // with, so two carriers' flights do not try to sit on the same station.
    p.slot = i + 2;
    // A flight still circling her own ship joins a leader who has gone.
    if (p.phase === 'formup' && lead.phase === 'outbound') p.phase = 'outbound';
    if (lead.vec) p.vec = { ...lead.vec };
  });
}

/**
 * Form a fleet or a squadron out of the units named, or -- `split` -- take
 * them out of the ones they are in.
 *
 * Returns the group's number, or nought when nothing was formed.
 */
export function setGroup(state, team, kind, ids, split = false) {
  if (kind !== 'ship' && kind !== 'plane') return 0;
  const units = eligible(state, team, kind, ids);
  if (split) { leave(state, kind, units); return 0; }
  if (units.length < 2) return 0;
  leave(state, kind, units);
  const gid = nextGroup(state);
  if (kind === 'ship') for (const s of units) s.fleet = gid;
  else formWing(state, units, gid);
  return gid;
}

/**
 * A course laid off for a ship of a fleet: where each of them is to steer.
 *
 * Every other ship keeps the bearing and distance she has from the one the
 * order was given to, turned through however far the new course is from the
 * course that ship is on now. A line ahead stays a line ahead; a line abreast
 * stays abreast of the new course rather than of the old one.
 */
export function fleetCourse(state, lead, x, z) {
  const out = [{ ship: lead, x, z }];
  if (!lead.fleet) return out;
  const turn = wrapAngle(headingTo(lead.x, lead.z, x, z) - lead.heading);
  const sn = Math.sin(turn);
  const cs = Math.cos(turn);
  const half = state.world?.half;
  for (const s of membersOf(state, 'ship', lead.fleet)) {
    if (s === lead) continue;
    const dx = s.x - lead.x;
    const dz = s.z - lead.z;
    // Headings run clockwise from +z, so a turn of `turn` is this rotation.
    let tx = x + dx * cs + dz * sn;
    let tz = z - dx * sn + dz * cs;
    if (half) {
      tx = Math.max(-half * 0.97, Math.min(half * 0.97, tx));
      tz = Math.max(-half * 0.97, Math.min(half * 0.97, tz));
    }
    out.push({ ship: s, x: tx, z: tz });
  }
  return out;
}

/**
 * Send a flight, and the squadron she is in, to a point on the chart.
 *
 * Only a flight with something left to do: one going home on her last pint
 * of fuel, or in the circuit to land, is not turned round by a tap on a map.
 * They stop hunting until they are there, and then take up whatever they
 * find. Returns how many were sent.
 */
export function vectorFlight(state, team, id, x, z) {
  const p = state.planes.find((q) => q.id === id && !q.dead && q.team === team);
  if (!p || !Number.isFinite(x) || !Number.isFinite(z)) return 0;
  const flights = p.wing ? membersOf(state, 'plane', p.wing) : [p];
  let n = 0;
  for (const q of flights) {
    if (q.phase !== 'outbound' && q.phase !== 'formup') continue;
    q.phase = 'outbound';
    q.vec = { x, z };
    q.targetId = 0; q.targetAir = 0; q.targetHeavy = 0; q.targetBat = 0;
    q.shieldFor = 0;
    q.tx = x; q.tz = z;
    n++;
  }
  return n;
}

/**
 * A flight under a vector flies to it and hunts nothing on the way. Called
 * every tick for each flight; true while she is still on her way.
 */
export function stepVector(p) {
  if (!p.vec) return false;
  if (p.phase !== 'outbound' || dist(p.x, p.z, p.vec.x, p.vec.z) < VECTOR_REACHED) {
    p.vec = null;
    p.hunt = 0;
    return false;
  }
  p.tx = p.vec.x;
  p.tz = p.vec.z;
  return true;
}

/**
 * The ship a squadron's strike aircraft should go for: whatever its leader has
 * gone for, if she is a strike aircraft herself and has gone for a ship.
 * Fighters keep their own business, which is the air.
 */
export function wingTarget(state, p) {
  if (!p.wing || p.role === 'fighter' || p.dropped) return null;
  const lead = wingLeader(state, p);
  if (!lead || lead === p || lead.role === 'fighter' || !lead.targetId) return null;
  return state.ships.find((s) => s.id === lead.targetId && s.alive && s.team !== p.team) || null;
}
