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

import { normaliseAirGroup } from '../shared/sim.js';
import { getClass } from '../shared/ships.js';

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
    ? { x: b.x, z: b.z, h: b.h }
    : null));
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
  const { allies: maxA = 24, enemies: maxE = 25, guns: maxG = 12 } = limits;
  const layout = req.layout || {};
  const allyAt = berthsFrom(layout.allies, maxA + 1);
  const enemyAt = berthsFrom(layout.enemies, maxE);

  const res = seat(allyAt?.[0] ?? null) || {};
  if (res.error) return res;
  const team = res.team ?? 0;

  // The air group the captain chose in the yard, for her side only. It has to
  // be bound after the seating, because that is when her team is known -- so
  // her own hull, which was seated a moment ago, is given it here and every
  // ship added below picks it up from the room.
  if (req.airGroup) {
    room.airGroup = { team, group: req.airGroup };
    for (const sh of room.state.ships) {
      if (sh.team !== team || !sh.squadrons || !sh.squadrons.length) continue;
      sh.airGroup = normaliseAirGroup(getClass(sh.classId), req.airGroup);
    }
  }

  const allyClasses = Array.isArray(req.allyClasses) ? req.allyClasses.slice(0, maxA) : null;
  const enemyClasses = Array.isArray(req.enemyClasses) ? req.enemyClasses.slice(0, maxE) : null;
  const allies = allyClasses?.length ?? Math.max(0, Math.min(maxA, req.allies ?? 3));
  const enemies = enemyClasses?.length ?? Math.max(1, Math.min(maxE, req.enemies ?? 4));

  for (let i = 0; i < allies; i++) {
    room.addBotOnTeam(team, req.botSkill, allyClasses?.[i] ?? null, allyAt?.[i + 1] ?? null);
  }
  for (let i = 0; i < enemies; i++) {
    room.addBotOnTeam(1 - team, req.botSkill, enemyClasses?.[i] ?? null, enemyAt?.[i] ?? null);
  }

  const allyGunAt = berthsFrom(layout.allyGuns, maxG);
  const enemyGunAt = berthsFrom(layout.enemyGuns, maxG);
  gunsFrom(req.allyGuns, maxG).forEach((id, i) => {
    room.addBatteryOnTeam(team, id, allyGunAt?.[i] ?? null);
  });
  gunsFrom(req.enemyGuns, maxG).forEach((id, i) => {
    room.addBatteryOnTeam(1 - team, id, enemyGunAt?.[i] ?? null);
  });
  return res;
}
