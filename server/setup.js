// Crewing a custom battle: the fleets, the guns ashore, and the berths the
// captain gave them.
//
// This lives on its own because it has two callers that must not drift apart.
// `server/index.js` runs it when a request arrives over a socket; the
// standalone build runs it inside the browser tab, where there is no socket and
// `client/js/localnet.js` plays the part of the server. When the two had a copy
// each, the socket one grew the order of battle and the standalone one did not
// -- so a captain who laid his fleet out and pressed Sortie got his squadron
// back on the spawn line and no artillery at all. One copy, and that cannot
// happen again.

import {
  setAirGroup, setVlsLoad, troopsFor, embarkTank, dockShip, baseBomber, setFieldSides,
} from '../shared/sim.js';
import { isTank } from '../shared/batteries.js';
import { getClass } from '../shared/ships.js';
import { isOpenSea } from '../shared/world.js';
import { BOMBER_MAX } from '../shared/bombers.js';
import { MAX_BARRACKS } from '../shared/infantry.js';

/**
 * The berths off the order-of-battle chart, sanitised.
 *
 * Only the shape is checked here: whether a berth is any good is the
 * simulation's business, and `addShip` checks it against the coastline it
 * actually raises.
 */
export function berthsFrom(v, cap) {
  if (!Array.isArray(v)) return null;
  return v.slice(0, cap).map((b) => (b && Number.isFinite(b.x) && Number.isFinite(b.z)
    ? {
      x: b.x, z: b.z, h: b.h,
      // A tank loaded into a landing craft on the chart: which hull of its
      // own side's fleet, in the chart's order, and which slot in her well.
      ...(Number.isInteger(b.c) && b.c >= 0 && Number.isInteger(b.s) && b.s >= 0 ? { c: b.c, s: b.s } : {}),
      // A ship laid alongside a harbour's quay (`d`, the harbour's number
      // among the works), or a squadron put in an air base's hangars (`b`,
      // the air base's, and `k` which hangar).
      ...(Number.isInteger(b.d) && b.d >= 0 ? { d: b.d } : {}),
      ...(Number.isInteger(b.b) && b.b >= 0 ? { b: b.b, k: Number.isInteger(b.k) ? b.k : -1 } : {}),
    }
    : null));
}

/**
 * One hull's air group off the request, if it is the shape of one: three
 * counts. What the counts may be is the class's business -- `addShip` lands
 * them on something she can embark -- so only the shape is checked here.
 */
export function wingOf(v) {
  if (!v || typeof v !== 'object') return null;
  // A landing craft's record is only how many soldiers she carries.
  if (v.troops != null && Number.isFinite(Number(v.troops))) return { troops: Number(v.troops) };
  const ok = ['fighters', 'dive', 'torpedo'].every((k) => Number.isFinite(Number(v[k])));
  if (!ok) return null;
  const w = { fighters: Number(v.fighters), dive: Number(v.dive), torpedo: Number(v.torpedo) };
  // And a deckload ranged over her flight deck, for the one carrier that has
  // one -- the Hornet's B-25s.
  if (v.deckload != null && Number.isFinite(Number(v.deckload))) w.deckload = Number(v.deckload);
  return w;
}

/** The battery ids off the gun park, sanitised the same way. */
export function gunsFrom(v, cap) {
  return Array.isArray(v) ? v.slice(0, cap).filter((id) => typeof id === 'string') : [];
}

/**
 * Put both fleets and both sides' guns into a room.
 *
 * `seat(at)` puts the human on the water, because that is the one step that
 * differs between a socket and a tab; it is handed the first ally berth and
 * returns `{ error }` if she could not be seated, or `{ team }` if she was.
 * Everything after it is identical, which is the point.
 *
 * The first ally berth is the captain's own hull, because that is the order the
 * chart draws them in and the order the fleet is built in below.
 */
export function crewBattle(room, req, seat, limits = {}) {
  const { allies: maxA = 24, enemies: maxE = 25, guns: maxG = 12, bombers: maxB = BOMBER_MAX } = limits;
  const layout = req.layout || {};
  const allyAt = berthsFrom(layout.allies, maxA + 1);
  const enemyAt = berthsFrom(layout.enemies, maxE);

  const before = new Set(room.state.ships.map((q) => q.id));
  const res = seat(allyAt?.[0] ?? null) || {};
  if (res.error) return res;
  const team = res.team ?? 0;
  // Each side's hulls in the order the chart lists them -- her own first --
  // so a tank loaded into the third of them on the chart goes into the third
  // of them here.
  const fleets = { ally: room.state.ships.filter((q) => !before.has(q.id) && q.team === team), enemy: [] };

  // The air group the captain chose in the yard, for her side only. It has to
  // be bound after the seating, because that is when her team is known -- so
  // her own hull, which was seated a moment ago, is given it here and every
  // ship added below picks it up from the room.
  if (req.airGroup) {
    room.airGroup = { team, group: req.airGroup };
    for (const sh of room.state.ships) {
      if (sh.team !== team || !sh.squadrons || !sh.squadrons.length) continue;
      setAirGroup(sh, getClass(sh.classId), req.airGroup);
    }
  }
  // And how she loaded her side's vertical launchers, the same way.
  if (req.vls && typeof req.vls === 'object') {
    room.vlsLoad = { team, load: req.vls };
    for (const sh of room.state.ships) {
      if (sh.team === team) setVlsLoad(sh, getClass(sh.classId), req.vls);
    }
  }
  // And her own, if the briefing gave her hull one: every carrier in a fleet
  // has her own air group, and the captain's is the one he balanced for her.
  if (wingOf(req.wing)) {
    for (const sh of room.state.ships) {
      if (sh.team !== team || sh.isBot || !sh.squadrons || !sh.squadrons.length) continue;
      setAirGroup(sh, getClass(sh.classId), req.wing);
    }
  }
  // And the soldiers in her own landing craft, if that is what she is.
  if (wingOf(req.wing)?.troops != null) {
    for (const sh of room.state.ships) {
      if (sh.team !== team || sh.isBot) continue;
      sh.troops = troopsFor(getClass(sh.classId), req.wing.troops);
    }
  }
  const allyWings = Array.isArray(req.allyWings) ? req.allyWings : [];
  const enemyWings = Array.isArray(req.enemyWings) ? req.enemyWings : [];

  const allyClasses = Array.isArray(req.allyClasses) ? req.allyClasses.slice(0, maxA) : null;
  const enemyClasses = Array.isArray(req.enemyClasses) ? req.enemyClasses.slice(0, maxE) : null;
  const allies = allyClasses?.length ?? Math.max(0, Math.min(maxA, req.allies ?? 3));
  const enemies = enemyClasses?.length ?? Math.max(1, Math.min(maxE, req.enemies ?? 4));

  for (let i = 0; i < allies; i++) {
    fleets.ally.push(room.addBotOnTeam(team, req.botSkill, allyClasses?.[i] ?? null, allyAt?.[i + 1] ?? null,
      wingOf(allyWings[i])));
  }
  for (let i = 0; i < enemies; i++) {
    fleets.enemy.push(room.addBotOnTeam(1 - team, req.botSkill, enemyClasses?.[i] ?? null, enemyAt?.[i] ?? null,
      wingOf(enemyWings[i])));
  }

  const allyGunAt = berthsFrom(layout.allyGuns, maxG);
  const enemyGunAt = berthsFrom(layout.enemyGuns, maxG);
  // Out of sight of land there is no ground to site a gun on: the batteries a
  // briefing ordered stay ashore, and the plotting board does not show them.
  const ashore = !isOpenSea(room.world);
  // A tank loaded into a landing craft goes to sea in her, whether or not
  // there is land in sight; one put on the chart ashore needs land like a gun.
  const emplace = (side, tm, id, at) => {
    const craft = at && Number.isInteger(at.c) ? fleets[side][at.c] : null;
    if (isTank(id) && craft) {
      const bat = room.addBatteryOnTeam(tm, id, { x: craft.x, z: craft.z, h: craft.heading }, true);
      // One tank, or her soldiers: a tank in her well leaves no room for them.
      if (bat && embarkTank(room.state, bat, craft, at.s)) { craft.troops = 0; return; }
      if (bat) room.state.batteries.splice(room.state.batteries.indexOf(bat), 1);
      if (!ashore) return;
    }
    if (ashore) room.addBatteryOnTeam(tm, id, at);
  };
  gunsFrom(req.allyGuns, maxG).forEach((id, i) => emplace('ally', team, id, allyGunAt?.[i] ?? null));
  gunsFrom(req.enemyGuns, maxG).forEach((id, i) => emplace('enemy', 1 - team, id, enemyGunAt?.[i] ?? null));

  // And the heavies, on the courses their commanders gave them. They are
  // ordered by type in the bomber yard and laid out on the chart the same way
  // a hull or a gun is, so the one thing that arrives here is a list of types
  // and a list of berths -- the same shape as everything else.
  const allyAir = berthsFrom(layout.allyBombers, maxB);
  const enemyAir = berthsFrom(layout.enemyBombers, maxB);
  // The air bases are the captain's side's or the other's, as the chart had
  // them; a squadron the chart put in one of their hangars starts there.
  setFieldSides(room.state, team);
  const based = (bm, at) => { if (bm && at && Number.isInteger(at.b)) baseBomber(room.state, bm, at.b, at.k ?? -1); };
  gunsFrom(req.allyBombers, maxB).forEach((id, i) => {
    based(room.addBomberOnTeam(team, id, allyAir?.[i] ?? null), allyAir?.[i]);
  });
  gunsFrom(req.enemyBombers, maxB).forEach((id, i) => {
    based(room.addBomberOnTeam(1 - team, id, enemyAir?.[i] ?? null), enemyAir?.[i]);
  });
  // And the ships the chart laid alongside a harbour's quay start the
  // battle made fast there.
  for (const [list, at] of [[fleets.ally, allyAt], [fleets.enemy, enemyAt]]) {
    list.forEach((sh, k) => { if (sh && Number.isInteger(at?.[k]?.d)) dockShip(room.state, sh, at[k].d, true); });
  }
  // The barracks off the chart, and the soldiers that fall in outside each
  // one. Its side is the chart's: `a` is the captain's own (allied), anything
  // else the enemy's. Out of sight of land there is nowhere to put one.
  if (ashore && Array.isArray(layout.barracks)) {
    for (const b of layout.barracks.slice(0, MAX_BARRACKS)) {
      if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.z)) continue;
      room.addBarracksOnTeam(b.side === 'enemy' ? 1 - team : team, { x: b.x, z: b.z, h: b.h });
    }
  }
  // And what soldiers have learned in battles before this one.
  if (limits.doctrine) room.teachInfantry(limits.doctrine);
  return res;
}
