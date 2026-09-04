// Wire format. Snapshots are fog-of-war filtered per team: you only ever
// receive the enemies your side can actually see.

import { getClass } from './ships.js';
import { torpedoVisible, SECTIONS } from './sim.js';

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
  // Where her secondary battery and her torpedo tubes are trained. Everyone
  // sees these, friend or enemy: a destroyer swinging her tubes onto your beam
  // is the most important thing on the horizon, and it is visible through a
  // pair of binoculars.
  if (ship.secMounts.length) s.se = ship.secMounts.map((m) => r3(m.angle));
  if (ship.torpMounts.length) s.tt = ship.torpMounts.map((m) => r3(m.angle));
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
    // The course laid off for her on the chart, if she has one. Only her own
    // side is told: it is an intention, and intentions are not visible to the
    // enemy through a pair of binoculars.
    // Her compartments: what is left of each, and how many holes are in it.
    // This is what a captain reads her condition off now -- there is no bar.
    s.sec = SECTIONS.map((k) => {
      const c = ship.sections[k.k];
      return [Math.round((c.hp / c.max) * 100), c.pens];
    });
    if (ship.wayX !== null && ship.wayZ !== null) {
      s.wx = Math.round(ship.wayX);
      s.wz = Math.round(ship.wayZ);
    }
  }
  return s;
}

export function buildSnapshot(state, team, viewerShipId, watchId = 0) {
  const ships = [];
  // What a captain can see out of the bridge windows, and what the plot knows.
  //
  // The two are not the same thing. `ships` is what his lookouts have actually
  // sighted -- it is what the renderer draws and what his guns can be laid on.
  // `contacts` is the rest of the order of battle, position and heading only,
  // and it goes nowhere but the plot: a fleet action is fought off a plot that
  // has everybody's last known position on it, and a captain who cannot see
  // where the enemy line is cannot manoeuvre against it.
  //
  // With one exception, and it is the whole of spectating: the ship the viewer
  // has picked off the plot and is watching comes through in full, spotted or
  // not. Watching a contact used to put the camera over an empty patch of sea
  // -- there was no hull in the snapshot to draw, because nobody had sighted
  // her -- and a captain looking at a ship through his own periscope of a
  // camera is entitled to see her.
  const contacts = [];
  for (const s of state.ships) {
    const friendly = s.team === team;
    const watched = s.id === watchId;
    if (!s.alive && !friendly && !watched) continue;
    if (!friendly && !watched && !s.spottedBy[team]) {
      contacts.push({
        i: s.id, x: Math.round(s.x), z: Math.round(s.z), h: r3(s.heading),
        tm: s.team, c: s.classId, n: s.name,
      });
      continue;
    }
    ships.push(shipSnapshot(s, friendly || s.id === viewerShipId || watched));
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
    // `o` is the carrier she flew off and `a` is how long she has been up:
    // between them the client can put the aeroplane it watched leave the deck
    // on the squadron the simulation is flying, and climb her out rather than
    // having her appear at cruising height the instant the button is pressed.
    .map((p) => ({
      i: p.id, x: r1(p.x), z: r1(p.z), h: r3(p.heading), n: p.count, tm: p.team,
      o: p.owner, a: r1(p.life),
      // How hard she is turning, so the client can bank her properly instead
      // of differencing two headings five times a second.
      b: r3(p.turn || 0),
      // What she is: it decides what she is drawn as and what she is after.
      r: p.role || 'torpedo',
      // Whether she still has anything to drop, so a pilot's release button
      // can go dead once she has let go of it.
      d: p.dropped ? 1 : 0,
    }));

  // The guns ashore. Both sides put them on the chart before the battle, so
  // neither is being told anything it did not already know -- what changes is
  // where each one is trained and whether it is still in action.
  const batteries = state.batteries.map((b) => ({
    i: b.id, b: b.batteryId, tm: b.team,
    x: Math.round(b.x), z: Math.round(b.z), y: r1(b.y),
    h: r3(b.heading), a: r3(b.angle),
    hp: Math.round(b.hp), mx: b.maxHp,
    al: b.alive ? 1 : 0,
  }));

  return {
    t: 'snap',
    tick: state.tick,
    time: r1(state.t),
    ships, contacts, shells, torps, planes, batteries,
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
