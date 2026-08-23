// A room is one battle: its own world, simulation and player list.

import {
  createState, addShip, applyInput, step, fireGuns, fireTorpedoes,
  launchStrike, useRepair, useSmoke, DT, TICK_RATE,
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
    this.world = generateWorld(this.seed, this.mapId, opts.time, opts.half, opts.place);
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

  join(player, { name, classId, team }) {
    if (this.players.size >= this.maxPlayers) return { error: 'Room is full' };
    if (this.phase === 'ended') return { error: 'That battle is over' };
    const cls = SHIP_ORDER.includes(classId) ? classId : 'fletcher';
    const t = this.pickTeam(team);
    const ship = addShip(this.state, {
      name: (name || 'Captain').slice(0, 18),
      classId: cls, team: t, index: this.teamIndex[t]++, playerId: player.id,
    });
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
      });
      this.brains.set(ship.id, createBotBrain(skill));
    }
    this.broadcastRoster();
  }

  addBotOnTeam(team, skill = this.botSkill, classId = null) {
    const cls = classId || SHIP_ORDER[Math.floor(Math.random() * SHIP_ORDER.length)];
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const ship = addShip(this.state, {
      name, classId: cls, team, index: this.teamIndex[team]++, isBot: true,
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
        if (ship.isBot && ship.alive) {
          const brain = this.brains.get(ship.id);
          if (brain) stepBot(this.state, ship, brain, DT);
        }
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
      p.send(buildSnapshot(this.state, p.team, p.shipId));
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

  command(player, msg) {
    const ship = this.shipOf(player);
    if (!ship || !ship.alive) return;
    switch (msg.t) {
      case 'input': applyInput(ship, msg); break;
      case 'fire': fireGuns(this.state, ship); break;
      case 'torp': fireTorpedoes(this.state, ship); break;
      case 'repair': useRepair(this.state, ship); break;
      case 'smoke': useSmoke(this.state, ship); break;
      case 'strike': launchStrike(this.state, ship); break;
      default: break;
    }
  }
}
