// A room is one battle: its own world, simulation and player list.

import {
  createState, addShip, addBattery, applyInput, step, fireGuns, fireTorpedoes,
  steerToWaypoint,
  launchStrike, useRepair, useSmoke, DT, TICK_RATE, flyPlane, dropOrdnance,
  releasePlane, strafe,
} from '../shared/sim.js';
import { generateWorld, MAP_PRESETS } from '../shared/world.js';
import { buildSnapshot, scoreboard } from '../shared/protocol.js';
import { getClass, SHIP_ORDER } from '../shared/ships.js';
import { createBotBrain, stepBot, BOT_NAMES } from './bots.js';

const SNAPSHOT_EVERY = 2;       // ticks -> 15 snapshots per second
const LOBBY_COUNTDOWN = 12;     // seconds a public lobby holds open for others

let roomSeq = 1;

export class Room {
  constructor(opts = {}) {
    this.id = opts.id || `room-${roomSeq++}`;
    this.name = opts.name || `Battle ${this.id}`;
    this.mode = opts.mode || 'domination';
    this.mapId = opts.mapId || MAP_PRESETS[Math.floor(Math.random() * MAP_PRESETS.length)].id;
    this.maxPlayers = opts.maxPlayers || 12;
    this.botCount = opts.botCount ?? 0;
    this.botSkill = opts.botSkill || 'regular';
    this.private = !!opts.private;
    this.autoStart = opts.autoStart !== false;
    this.seed = opts.seed || ((Math.random() * 0xffffffff) >>> 0);
    this.world = generateWorld(this.seed, this.mapId, opts.time, opts.half, opts.place,
      opts.weather);
    this.state = createState(this.world, { mode: this.mode, timeLimit: opts.timeLimit || 900 });
    this.players = new Map();     // playerId -> player
    this.brains = new Map();      // shipId -> bot brain
    this.phase = 'lobby';         // lobby | battle | ended
    this.countdown = LOBBY_COUNTDOWN;
    this.teamIndex = [0, 0];
    this.timer = setInterval(() => this.tick(), 1000 / TICK_RATE);
    this.lastTick = Date.now();
    this.endedAt = 0;
    this.onEmpty = opts.onEmpty || (() => {});
  }

  get playerCount() { return this.players.size; }

  summary() {
    return {
      id: this.id, name: this.name, mode: this.mode, map: this.mapId,
      players: this.playerCount, max: this.maxPlayers, bots: this.botCount,
      phase: this.phase, private: this.private,
    };
  }

  // -- membership ----------------------------------------------------------

  pickTeam(requested) {
    if (requested === 0 || requested === 1) return requested;
    const counts = [0, 0];
    for (const p of this.players.values()) counts[p.team]++;
    for (const s of this.state.ships) if (s.isBot) counts[s.team] += 0.5;
    return counts[0] <= counts[1] ? 0 : 1;
  }

  /**
   * The air group the captain who set the battle up chose, for the side she
   * set it up for. Her carriers embark it; the other side's sail with what the
   * datasheet says, because nobody asked them.
   */
  airGroupFor(team) {
    return this.airGroup && this.airGroup.team === team ? this.airGroup.group : null;
  }

  join(player, { name, classId, team, at = null }) {
    if (this.players.size >= this.maxPlayers) return { error: 'Room is full' };
    if (this.phase === 'ended') return { error: 'That battle is over' };
    const cls = SHIP_ORDER.includes(classId) ? classId : 'fletcher';
    const t = this.pickTeam(team);
    const ship = addShip(this.state, {
      name: (name || 'Captain').slice(0, 18),
      classId: cls, team: t, index: this.teamIndex[t]++, playerId: player.id, at,
      airGroup: this.airGroupFor(t),
    });
    // A player's ship gets a brain too. She fights herself -- gunnery,
    // torpedoes, damage control -- and her captain keeps the helm and the
    // aircraft, which is the whole of what he does.
    this.brains.set(ship.id, createBotBrain('veteran'));
    player.team = t;
    player.shipId = ship.id;
    player.room = this;
    this.players.set(player.id, player);
    this.broadcastRoster();
    if (this.phase === 'lobby' && this.autoStart) this.maybeStart();
    return { ship };
  }

  leave(playerId) {
    const p = this.players.get(playerId);
    if (!p) return;
    const ship = this.state.ships.find((s) => s.id === p.shipId);
    if (ship) {
      // A captain who leaves mid-battle hands the bridge to a bot.
      if (this.phase === 'battle' && ship.alive) {
        ship.isBot = true;
        ship.name = `${ship.name} (AI)`;
        this.brains.set(ship.id, createBotBrain(this.botSkill));
      } else {
        this.state.ships = this.state.ships.filter((s) => s.id !== ship.id);
      }
    }
    this.players.delete(playerId);
    this.broadcastRoster();
    if (this.players.size === 0) this.close();
  }

  addBots(count, skill = this.botSkill) {
    for (let i = 0; i < count; i++) {
      const team = this.pickTeam(undefined);
      const classId = SHIP_ORDER[Math.floor(Math.random() * SHIP_ORDER.length)];
      const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
      const ship = addShip(this.state, {
        name, classId, team, index: this.teamIndex[team]++, isBot: true,
        airGroup: this.airGroupFor(team),
      });
      this.brains.set(ship.id, createBotBrain(skill));
    }
    this.broadcastRoster();
  }

  /**
   * Emplace a coast battery. It has no captain and no brain: the simulation
   * fights it off its own datasheet.
   */
  addBatteryOnTeam(team, batteryId, at = null) {
    return addBattery(this.state, {
      batteryId, team,
      x: at && Number.isFinite(at.x) ? at.x : 0,
      z: at && Number.isFinite(at.z) ? at.z : (team === 0 ? -1 : 1) * (this.state.world.half - 1200),
      heading: at && Number.isFinite(at.h) ? at.h : (team === 0 ? 0 : Math.PI),
    });
  }

  addBotOnTeam(team, skill = this.botSkill, classId = null, at = null) {
    const cls = classId || SHIP_ORDER[Math.floor(Math.random() * SHIP_ORDER.length)];
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const ship = addShip(this.state, {
      name, classId: cls, team, index: this.teamIndex[team]++, isBot: true, at,
      airGroup: this.airGroupFor(team),
    });
    this.brains.set(ship.id, createBotBrain(skill));
    return ship;
  }

  // -- lifecycle -----------------------------------------------------------

  /** Both sides crewed? Then run the lobby clock down rather than starting flat
   *  out, so a second captain can still get into the same battle. */
  maybeStart() {
    const teams = [0, 0];
    for (const s of this.state.ships) teams[s.team]++;
    if (teams[0] > 0 && teams[1] > 0 && this.countdown > LOBBY_COUNTDOWN) {
      this.countdown = LOBBY_COUNTDOWN;
    }
  }

  start() {
    if (this.phase === 'battle') return;
    this.phase = 'battle';
    this.state.t = 0;
    this.broadcast({ t: 'start', world: this.world, mode: this.mode, roster: scoreboard(this.state) });
  }

  close() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.phase = 'ended';
    this.onEmpty(this);
  }

  tick() {
    const now = Date.now();
    // Fixed timestep, but catch up if the event loop stalled.
    let elapsed = (now - this.lastTick) / 1000;
    this.lastTick = now;
    if (elapsed > 0.5) elapsed = 0.5;

    if (this.phase === 'lobby') {
      if (this.players.size === 0) return;
      const before = Math.ceil(this.countdown);
      this.countdown -= elapsed;
      const after = Math.ceil(this.countdown);
      if (after !== before && after >= 0) this.broadcast({ t: 'countdown', s: after });
      if (this.countdown <= 0) this.start();
      return;
    }
    if (this.phase !== 'battle') return;

    let steps = 0;
    this.accum = (this.accum || 0) + elapsed;
    while (this.accum >= DT && steps < 6) {
      this.accum -= DT;
      steps++;
      for (const ship of this.state.ships) {
        if (!ship.alive) continue;
        // Everything afloat fights itself. A ship with a captain aboard is
        // conned by him -- her helm and her aircraft are his -- and fights
        // herself round that.
        const brain = this.brains.get(ship.id);
        if (brain) stepBot(this.state, ship, brain, DT, !ship.isBot);
        // And a course laid off on the chart is steered to, whoever gave it.
        if (!ship.isBot) steerToWaypoint(this.state, ship);
      }
      const events = step(this.state, DT);
      if (events.length) this.dispatchEvents(events);
    }
    if (this.state.tick % SNAPSHOT_EVERY === 0) this.sendSnapshots();

    if (this.state.over && this.phase === 'battle') {
      this.phase = 'ended';
      this.endedAt = now;
      this.broadcast({
        t: 'result',
        winner: this.state.winner,
        reason: this.state.reason,
        score: this.state.score.map((s) => Math.round(s)),
        roster: scoreboard(this.state),
      });
    }
    if (this.phase === 'ended' && now - this.endedAt > 25000) this.close();
  }

  dispatchEvents(events) {
    // Sinkings and captures go to everyone; the rest are effects filtered by team.
    const global = [];
    const perTeam = [[], []];
    for (const ev of events) {
      if (ev.e === 'sink' || ev.e === 'capture' || ev.e === 'over') global.push(ev);
      else {
        for (let team = 0; team < 2; team++) {
          if (this.eventVisible(ev, team)) perTeam[team].push(ev);
        }
      }
    }
    for (const p of this.players.values()) {
      const list = global.concat(perTeam[p.team]);
      if (list.length) p.send({ t: 'ev', ev: list });
    }
  }

  eventVisible(ev, team) {
    const shipId = ev.ship || ev.victim;
    if (shipId) {
      const s = this.state.ships.find((x) => x.id === shipId);
      if (s) return s.team === team || s.spottedBy[team];
    }
    return true;
  }

  sendSnapshots() {
    for (const p of this.players.values()) {
      p.send(buildSnapshot(this.state, p.team, p.shipId, p.watching || 0));
    }
  }

  broadcastRoster() {
    this.broadcast({ t: 'roster', roster: scoreboard(this.state), room: this.summary() });
  }

  broadcast(msg) {
    for (const p of this.players.values()) p.send(msg);
  }

  // -- player commands -----------------------------------------------------

  shipOf(player) {
    return this.state.ships.find((s) => s.id === player.shipId);
  }

  /**
   * Which ship an order is for: the one named in it, or the giver's own.
   *
   * The plot is a director's table and a ship picked off it is conned from it,
   * whichever side she is on, so there is no team check here. What there is
   * is a check that she exists and is still afloat.
   */
  conned(ship, msg) {
    if (typeof msg.ship !== 'number' || msg.ship === ship.id) return ship;
    const target = this.state.ships.find((s) => s.id === msg.ship);
    return target && target.alive ? target : ship;
  }

  command(player, msg) {
    // Which ship the camera is on. It is answered before anything else,
    // because a captain whose own ship has gone down is exactly the man who
    // wants to watch somebody else's -- and the guard below would have turned
    // him away.
    if (msg.t === 'watch') {
      player.watching = typeof msg.ship === 'number' ? msg.ship : 0;
      return;
    }
    const ship = this.shipOf(player);
    if (!ship || !ship.alive) return;
    switch (msg.t) {
      case 'input': applyInput(ship, msg); break;
      // A course order off the chart. It may be given to any ship on the
      // plot -- the giver's own division, and the enemy's line as well. That
      // is not how a battle works and it is not meant to be: the plot here is
      // a director's table, and a player who has picked a ship off it and is
      // watching her from her own bridge conns her.
      case 'goto': {
        const target = typeof msg.ship === 'number'
          ? this.state.ships.find((s) => s.id === msg.ship) : ship;
        if (!target || !target.alive) break;
        // No point given is the order cancelled: she holds what she is on.
        if (!Number.isFinite(msg.x) || !Number.isFinite(msg.z)) {
          target.wayX = null;
          target.wayZ = null;
          target.rudderCmd = 0;
          break;
        }
        target.wayX = msg.x;
        target.wayZ = msg.z;
        // Ordered somewhere and stopped: give her steerage way to get there.
        if (target.notch <= 1) target.notch = 4;
        break;
      }
      case 'notch': {
        const target = typeof msg.ship === 'number'
          ? this.state.ships.find((s) => s.id === msg.ship) : ship;
        if (!target || !target.alive) break;
        applyInput(target, { notch: msg.notch });
        break;
      }
      case 'fire': fireGuns(this.state, ship); break;
      case 'torp': fireTorpedoes(this.state, ship); break;
      // Damage control and smoke are given to whichever ship is being conned,
      // the same way a course is. A captain watching another ship from her own
      // bridge is on her bridge.
      case 'repair': useRepair(this.state, this.conned(ship, msg)); break;
      case 'smoke': useSmoke(this.state, this.conned(ship, msg)); break;
      // A player flying one of her flights by hand. `fly` is where the
      // aeroplane is now, `drop` lets go of what she is carrying, and `land`
      // hands her back to the autopilot.
      case 'fly': flyPlane(this.state, ship, msg); break;
      case 'drop': dropOrdnance(this.state, ship, msg.i); break;
      case 'land': releasePlane(this.state, msg.i); break;
      // Her guns, held down. `dt` is how long the trigger has been down since
      // the last word, clamped so a client cannot claim a minute of it.
      case 'gun': strafe(this.state, ship, msg.i, Math.min(0.3, Math.max(0, msg.dt || 0))); break;
      case 'strike': {
        // Her aircraft go for whatever her fire control is on. The guns and the
        // squadron fight the same ship, which is what a captain ordering a
        // strike means by it -- he does not lay off a separate bearing.
        const from = this.conned(ship, msg);
        const brain = this.brains.get(from.id);
        const foe = brain && this.state.ships.find(
          (s) => s.id === brain.targetId && s.alive && s.team !== from.team);
        if (foe) { from.aimX = foe.x; from.aimZ = foe.z; }
        launchStrike(this.state, from);
        break;
      }
      default: break;
    }
  }
}
