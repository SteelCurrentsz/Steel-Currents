// Wire format. Snapshots are fog-of-war filtered per team: you only ever
// receive the enemies your side can actually see.

import { getClass } from './ships.js';
import { torpedoVisible } from './sim.js';

const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

export function shipSnapshot(ship, full) {
  const s = {
    i: ship.id, x: r1(ship.x), z: r1(ship.z), h: r3(ship.heading),
    v: r1(ship.speed), hp: Math.round(ship.hp), a: ship.alive ? 1 : 0,
    c: ship.classId, n: ship.name, tm: ship.team,
    f: ship.fires, fl: ship.flooding,
    tu: ship.turrets.map((t) => r3(t.angle)),
    sm: ship.smokeActive > 0 ? 1 : 0,
  };
  if (full) {
    s.notch = ship.notch;
    s.rud = r3(ship.rudder);
    s.cd = ship.turrets.map((t) => Math.max(0, Math.round(t.cooldown * 10) / 10));
    s.dis = ship.turrets.map((t) => (t.disabled > 0 ? 1 : 0));
    s.tp = ship.torpMounts.map((m) => Math.max(0, Math.round(m.cooldown * 10) / 10));
    s.sq = ship.squadrons.map((q) => (q.state === 'deck' ? Math.max(0, Math.round(q.cooldown)) : -1));
    s.rc = Math.max(0, Math.round(ship.repairCd * 10) / 10);
    s.smk = ship.smoke;
    s.st = ship.shellType;
    s.ax = Math.round(ship.aimX); s.az = Math.round(ship.aimZ);
    s.eng = ship.engineDamage > 0 ? 1 : 0;
    s.str = ship.steeringDamage > 0 ? 1 : 0;
    s.kills = ship.kills;
    s.dmg = Math.round(ship.damageDealt);
  }
  return s;
}

export function buildSnapshot(state, team, viewerShipId) {
  const ships = [];
  for (const s of state.ships) {
    const friendly = s.team === team;
    if (!friendly && !s.spottedBy[team]) continue;
    if (!s.alive && !friendly) continue;
    ships.push(shipSnapshot(s, friendly || s.id === viewerShipId));
  }
  const visibleOwners = new Set(ships.map((s) => s.i));
  const shells = [];
  for (const sh of state.shells) {
    if (sh.team !== team && !visibleOwners.has(sh.owner)) continue;
    shells.push({ i: sh.id, x: r1(sh.x), y: r1(sh.y), z: r1(sh.z), c: sh.caliber, tm: sh.team });
  }
  const torps = [];
  for (const tp of state.torps) {
    if (!torpedoVisible(state, tp, team)) continue;
    torps.push({ i: tp.id, x: r1(tp.x), z: r1(tp.z), h: r3(tp.heading), tm: tp.team });
  }
  const planes = state.planes
    .filter((p) => p.team === team || state.ships.some((s) => s.team === team && s.alive))
    .map((p) => ({ i: p.id, x: r1(p.x), z: r1(p.z), h: r3(p.heading), n: p.count, tm: p.team }));

  return {
    t: 'snap',
    tick: state.tick,
    time: r1(state.t),
    ships, shells, torps, planes,
    caps: state.caps.map((c) => ({ id: c.id, o: c.owner, p: Math.round(c.progress), k: c.contest })),
    score: [Math.round(state.score[0]), Math.round(state.score[1])],
    over: state.over ? { winner: state.winner, reason: state.reason } : null,
  };
}

export function scoreboard(state) {
  return state.ships.map((s) => ({
    id: s.id, name: s.name, team: s.team, cls: s.classId, bot: !!s.isBot,
    alive: s.alive, hp: Math.round(s.hp), maxHp: s.maxHp,
    kills: s.kills, dmg: Math.round(s.damageDealt),
    hits: s.ribbons.hits, cits: s.ribbons.cits, torps: s.ribbons.torps,
    type: getClass(s.classId).type,
  }));
}
