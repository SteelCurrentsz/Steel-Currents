// Carrying out a staged battle's script against the simulation.
//
// The script is the director's (see shared/stage.js): a list of cues, each
// one an order to one unit at one moment of the battle. The room steps this
// once a tick, after its captains and before the world moves, so a cue due
// this tick is acted on this tick.
//
// What a cue does is what a captain could have done -- lay a course, ring up a
// speed, put every gun on one ship -- except the outcomes, which no captain
// gets to order: a ship told to sink sinks, whoever is shooting at her. That
// is the point of a staged battle. The guns are still the simulation's own, so
// the shells that "sank" her still fly and still land; it is only the answer
// that has been written in advance.

import {
  ASSIGN_KINDS, assignMount, setMountOff, fireTorpedoes, launchStrike, useSmoke, layMine,
  startFire, startSinking, breakHer, detonate, openHull, applyInput,
} from '../shared/sim.js';
import { getClass } from '../shared/ships.js';
import { cleanScript } from '../shared/stage.js';

/** How long an order that has to wait on the ship -- torpedoes, a strike -- is kept trying. */
const PATIENCE = 45;

/** Every mounting she has of each kind an order can be given to. */
function mountsOf(cls) {
  let dp = 0;
  for (const g of (cls.aa && cls.aa.guns) || []) dp += g.mounts.length;
  return {
    main: (cls.turrets || []).length,
    sec: cls.secondary ? cls.secondary.mounts.length : 0,
    dp,
    torp: cls.torpedoes ? cls.torpedoes.mounts.length : 0,
  };
}

/**
 * Bind a script to a room. `units` is the order of battle as the room built
 * it: a Map of unit key -> the ship, battery or squadron that key names.
 */
export function createStage(room, raw, units) {
  const script = cleanScript(raw, room.world.half);
  return {
    cues: script.cues,
    shots: script.shots,
    next: 0,
    units,
    // Orders still being worked at: torpedoes waiting for her banks to bear,
    // a strike waiting for the deck.
    pending: [],
  };
}

/** The ship a key names, if she is still afloat. */
function shipOf(stage, key) {
  const u = stage.units.get(key);
  return u && u.kind === 's' && u.ref.alive ? u.ref : null;
}

/** Put every gun of hers that can be put on a ship onto this one, or hand them all back. */
function allOn(state, ship, foeId, kinds = ['main', 'sec', 'dp']) {
  const n = mountsOf(getClass(ship.classId));
  for (const k of kinds) {
    for (let i = 0; i < n[k]; i++) assignMount(state, ship, k, i, foeId);
  }
}

/** Switch every one of her mountings off, or all of them back on. */
function allOff(ship, off) {
  const n = mountsOf(getClass(ship.classId));
  for (const k of ASSIGN_KINDS) {
    for (let i = 0; i < n[k]; i++) setMountOff(ship, k, i, off);
  }
}

/** One cue, carried out now. */
function act(room, stage, cue) {
  const state = room.state;
  const ship = shipOf(stage, cue.u);
  if (!ship) return;
  const brain = room.brains.get(ship.id);
  const foe = cue.at ? shipOf(stage, cue.at) : null;
  switch (cue.a) {
    case 'path':
      ship.path = cue.pts.slice();
      ship.wayX = ship.path[0].x;
      ship.wayZ = ship.path[0].z;
      if (cue.n != null) applyInput(ship, { notch: cue.n });
      else if (ship.notch <= 1) applyInput(ship, { notch: 4 });
      break;
    case 'speed':
      applyInput(ship, { notch: cue.n });
      break;
    case 'fire':
      if (!foe) break;
      allOff(ship, false);
      allOn(state, ship, foe.id);
      if (brain) { brain.forced = foe.id; brain.hold = false; }
      break;
    case 'hold':
      allOn(state, ship, 0, ASSIGN_KINDS);
      allOff(ship, true);
      if (brain) { brain.forced = 0; brain.hold = true; }
      break;
    case 'free':
      allOn(state, ship, 0, ASSIGN_KINDS);
      allOff(ship, false);
      if (brain) { brain.forced = 0; brain.hold = false; }
      break;
    case 'torp':
      if (!foe) break;
      setMountsOn(ship, 'torp');
      allOn(state, ship, foe.id, ['torp']);
      stage.pending.push({ until: state.t + PATIENCE, kind: 'torp', ship, foe });
      break;
    case 'strike':
      if (!foe) break;
      stage.pending.push({ until: state.t + PATIENCE, kind: 'strike', ship, foe });
      break;
    case 'smoke':
      useSmoke(state, ship);
      break;
    case 'mines':
      // Her whole load, one after another as fast as the party can run them
      // aft. A ship with no rails has nothing to do.
      if (getClass(ship.classId).mines) {
        stage.pending.push({ until: state.t + 120, kind: 'mines', ship, foe: null });
      }
      break;
    case 'burn':
      startFire(state, ship, 'works', 0.8);
      startFire(state, ship, 'mid', 0.6);
      break;
    case 'sink': {
      // Holed low down amidships on both sides, so she settles the way a ship
      // with the sea in her machinery spaces does, rather than simply being
      // told she is going.
      const cls = getClass(ship.classId);
      const area = cls.hull.beam * cls.hull.draft * 0.25;
      openHull(state, ship, 'mid', area, 1, cls.hull.draft * 0.8);
      openHull(state, ship, 'mid', area, -1, cls.hull.draft * 0.8);
      startFire(state, ship, 'works', 0.6);
      startSinking(state, ship, 'shattered');
      break;
    }
    case 'break':
      breakHer(state, ship, 0, 'shattered');
      startFire(state, ship, 'mid', 0.9);
      break;
    case 'blow': {
      // Whichever magazine she has the more of. A ship with none worth the
      // name still has the forward one.
      const where = ship.sections.aft && ship.sections.fwd
        && ship.sections.aft.hp > ship.sections.fwd.hp ? 'aft' : 'fwd';
      detonate(state, ship, where, null);
      break;
    }
    default: break;
  }
}

function setMountsOn(ship, kind) {
  const n = mountsOf(getClass(ship.classId));
  for (let i = 0; i < n[kind]; i++) setMountOff(ship, kind, i, false);
}

/**
 * One tick of the script: everything due is done, every course is followed
 * from point to point, and the orders still waiting on a ship are tried again.
 */
export function stepStage(room, stage) {
  const state = room.state;
  while (stage.next < stage.cues.length && stage.cues[stage.next].t <= state.t) {
    act(room, stage, stage.cues[stage.next++]);
  }
  for (const u of stage.units.values()) {
    const ship = u.kind === 's' ? u.ref : null;
    if (!ship || !ship.alive || !ship.path) continue;
    // At the point she was steering for -- steerToWaypoint lets go of it when
    // she gets there -- on to the next. At the last, she holds the course she
    // arrived on.
    if (ship.wayX == null) {
      ship.path.shift();
      if (ship.path.length) {
        ship.wayX = ship.path[0].x;
        ship.wayZ = ship.path[0].z;
      } else ship.path = null;
    }
  }
  if (!stage.pending.length) return;
  stage.pending = stage.pending.filter((p) => {
    if (p.kind === 'mines') {
      if (!p.ship.alive || state.t > p.until || p.ship.mnLeft <= 0) return false;
      layMine(state, p.ship);
      return p.ship.mnLeft > 0;
    }
    if (!p.ship.alive || !p.foe.alive || state.t > p.until) return false;
    if (p.kind === 'torp') return !(fireTorpedoes(state, p.ship, null, { assignedOnly: true }) > 0);
    // A strike goes where her fire control is: the target, wherever she is now.
    p.ship.aimX = p.foe.x;
    p.ship.aimZ = p.foe.z;
    return !launchStrike(state, p.ship);
  });
}

/**
 * The order of battle by name: every ship, gun and squadron the room holds,
 * keyed the way a script names them. Each side's units are numbered in the
 * order they were added, which is the order the chart lists them in.
 */
export function unitsOf(state) {
  const units = new Map();
  const count = { s: [0, 0], g: [0, 0], b: [0, 0] };
  const add = (kind, ref) => {
    const t = ref.team === 1 ? 1 : 0;
    units.set(`${kind}:${t}:${count[kind][t]++}`, { kind, ref });
  };
  for (const s of state.ships) add('s', s);
  for (const b of state.batteries || []) add('g', b);
  for (const b of state.bombers || []) add('b', b);
  return units;
}

/** What the client needs to put names to ids: unit key -> sim id. */
export function unitIds(units) {
  const out = {};
  for (const [k, u] of units) out[k] = u.ref.id;
  return out;
}

