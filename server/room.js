// A room is one battle: its own world, simulation and player list.

import {
  createState, addShip, addBattery, addBomber, applyInput, step, fireGuns, fireTorpedoes,
  manGun, layGun, shootGun, assignMount, setMountOff,
  steerToWaypoint,
  launchStrike, useRepair, useSmoke, setParty, DT, TICK_RATE, flyPlane, dropOrdnance,
  releasePlane, strafe, flyBomber, dropStick, gunTurret, gunRear,
  dropCharges, setChargeDepth, orderPending, ORDER_WINDUP, siteBattery,
} from '../shared/sim.js';
import { BATTERIES } from '../shared/batteries.js';
import { generateWorld, MAP_PRESETS } from '../shared/world.js';
import { buildSnapshot, scoreboard } from '../shared/protocol.js';
import { getClass, SHIP_ORDER } from '../shared/ships.js';
import { setLamp } from '../shared/searchlights.js';
import { createBotBrain, stepBot, BOT_NAMES } from './bots.js';
import { createStaff, stepStaff } from './command.js';
import { createStage, stepStage, unitsOf, unitIds } from './stage.js';

// How hard a side fights, as a number. The same three words the briefing
// offers, and the staff is as good as its captains are.
const SKILL_OF = { rookie: 0.45, regular: 0.7, veteran: 0.9 };

const SNAPSHOT_EVERY = 2;       // ticks -> 15 snapshots per second
const LOBBY_COUNTDOWN = 12;     // seconds a public lobby holds open for others
// How much faster than life a battle may be run. A battle with one captain in
// it is his to hurry along; one with two is nobody's, so it runs at one.
export const MAX_TIME_SCALE = 5;
// And how much slower: a director filming a staged battle may run it at a
// quarter of life, or stop it dead, to line a shot up.
export const SLOW_TIME_SCALES = [0, 0.25, 0.5];

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
    // One command net per side. Everything that fights reports to it and takes
    // its orders from it, and none of what it thinks ever leaves this process
    // -- see command.js.
    this.staff = [createStaff(0, SKILL_OF[this.botSkill] ?? 0.7),
      createStaff(1, SKILL_OF[this.botSkill] ?? 0.7)];
    this.private = !!opts.private;
    this.autoStart = opts.autoStart !== false;
    this.seed = opts.seed || ((Math.random() * 0xffffffff) >>> 0);
    this.world = generateWorld(this.seed, this.mapId, opts.time, opts.half, opts.place,
      opts.weather, !!opts.fog);
    // Arcade rules ride on the world, which both the simulation and every
    // client are handed: see stepDetection.
    if (opts.arcade) this.world.arcade = true;
    // A staged battle is fought under the same rule: every ship can see every
    // other, so nothing the script asks for waits on a lookout. See stage.js.
    this.staged = !!opts.staged;
    if (this.staged) this.world.arcade = true;
    this.state = createState(this.world, {
      mode: this.mode, timeLimit: opts.timeLimit || (this.staged ? 1800 : 900),
      friendlyFire: !!opts.friendlyFire,
    });
    // Every weapon opens on an officer's word, a beat before it fires (see
    // orderGiven) -- and what a captain asked for himself is carried out
    // when the beat is up.
    this.state.orders = true;
    this.later = [];
    // How many seconds of battle go by in each second of the clock on the
    // wall. See the 'warp' command.
    this.timeScale = 1;
    this.players = new Map();     // playerId -> player
    this.brains = new Map();      // shipId -> bot brain
    this.phase = 'lobby';         // lobby | battle | ended
    this.countdown = LOBBY_COUNTDOWN;
    this.teamIndex = [0, 0];
    // One tick that throws used to take the whole battle service down with it
    // -- an uncaught exception inside a bare interval callback ends the Node
    // process, so a single bad frame in one battle disconnected every player
    // in every battle on the server. A tick that goes wrong now costs that
    // tick and says so.
    this.tickErrors = 0;
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (e) {
        this.tickErrors++;
        if (this.tickErrors <= 3) {
          console.error(`room ${this.id}: tick failed (${this.tickErrors})`, e);
        }
        // A room that cannot get through a tick at all is not a battle any
        // more, and holding it open serves nobody: it is closed, and everybody
        // in it is told rather than left watching a frozen sea.
        if (this.tickErrors >= 30) {
          console.error(`room ${this.id}: closing after repeated tick failures`);
          this.broadcast({ t: 'error', msg: 'The battle service lost this action.' });
          this.close();
        }
      }
    }, 1000 / TICK_RATE);
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
    // A second captain aboard: the battle is nobody's to hurry any more.
    if (this.players.size > 1 && this.timeScale !== 1) {
      this.timeScale = 1;
      this.broadcast({ t: 'warp', s: 1 });
    }
    this.broadcastRoster();
    if (this.phase === 'lobby' && this.autoStart) this.maybeStart();
    return { ship };
  }

  /**
   * A director: in the room, shown all of it, and in command of none of it.
   * He has no ship -- `shipId` names nothing -- so every order he could send
   * is turned away by `command`, except where to look and how fast to run.
   */
  seatDirector(player) {
    player.team = 0;
    player.shipId = -1;
    player.director = true;
    player.room = this;
    this.players.set(player.id, player);
    this.broadcastRoster();
    return { team: 0 };
  }

  /**
   * Bind the director's script to the order of battle, once everything in it
   * has been added. Returns the names the client will need to put to ids.
   */
  stageScript(script) {
    const units = unitsOf(this.state);
    this.stage = createStage(this, script, units);
    return { units: unitIds(units), shots: this.stage.shots };
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
    const gone = this.players.get(playerId);
    if (gone) this.release(gone);
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
    const x = at && Number.isFinite(at.x) ? at.x : 0;
    const z = at && Number.isFinite(at.z) ? at.z : (team === 0 ? -1 : 1) * (this.state.world.half - 1200);
    // On ground it can be built on: dry, back from the water and level enough
    // to cut a pad into, at or as near as it can be to where it was put.
    const site = siteBattery(this.state.world, x, z, BATTERIES[batteryId]?.span);
    return addBattery(this.state, {
      batteryId, team,
      x: site.x,
      z: site.z,
      heading: at && Number.isFinite(at.h) ? at.h : (team === 0 ? 0 : Math.PI),
    });
  }

  /**
   * A squadron of heavies on to the battlefield, on the course her commander
   * gave her on the order-of-battle chart.
   */
  addBomberOnTeam(team, bomberId, at = null) {
    const half = this.state.world.half;
    const x = at && Number.isFinite(at.x) ? at.x : 0;
    const z = at && Number.isFinite(at.z) ? at.z : (team === 0 ? -half : half) * 0.92;
    const h = at && Number.isFinite(at.h) ? at.h : (team === 0 ? 0 : Math.PI);
    return addBomber(this.state, { bomberId, team, x, z, heading: h });
  }

  // `airGroup` is her own, when the briefing balanced one for this hull; a
  // hull without one sails with her side's, or her datasheet's.
  addBotOnTeam(team, skill = this.botSkill, classId = null, at = null, airGroup = null) {
    const cls = classId || SHIP_ORDER[Math.floor(Math.random() * SHIP_ORDER.length)];
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const ship = addShip(this.state, {
      name, classId: cls, team, index: this.teamIndex[team]++, isBot: true, at,
      airGroup: airGroup || this.airGroupFor(team),
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

  /**
   * Carry out something a captain asked for. If it has to wait on the word
   * (see orderGiven), it is done again when the beat is up rather than
   * forgotten: a key pressed once is an order given once.
   */
  onWord(ship, kind, fn) {
    const r = fn();
    if (!r && orderPending(this.state, ship, kind)) {
      this.later.push({ at: this.state.t + ORDER_WINDUP + 0.05, fn });
    }
    return r;
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
    // The battle goes on being drawn after it is over.
    //
    // It used to stop dead: the world stopped stepping the moment the last
    // ship of a side went, so the wrecks stopped burning, the smoke froze
    // where it was, and twenty-five seconds later the room closed under the
    // player whether he had finished looking or not. An action ends with
    // ships on fire and going down and that is worth watching, so the sea
    // keeps running -- only the guns are finished, and they are finished
    // because there is nobody left to fire them.
    if (this.phase !== 'battle' && this.phase !== 'ended') return;

    // Run fast, the whole of it is run fast: every step is the same step, there
    // are simply more of them to the second.
    // Nought is a director's stopped battle, and means nought.
    const scale = Number.isFinite(this.timeScale) ? this.timeScale : 1;
    let steps = 0;
    this.accum = (this.accum || 0) + elapsed * scale;
    while (this.accum >= DT && steps < Math.ceil(6 * scale)) {
      this.accum -= DT;
      steps++;
      // Both staffs first: the orders a captain acts on this tick are written
      // off the reports of the last one, which is what a signal is.
      for (const st of this.staff) stepStaff(this.state, st, DT);
      // The script, before any captain acts: a cue due this tick is an order
      // he is given this tick.
      if (this.stage) stepStage(this, this.stage);
      for (const ship of this.state.ships) {
        if (!ship.alive) continue;
        // Everything afloat fights itself. A ship with a captain aboard is
        // conned by him -- her helm and her aircraft are his -- and fights
        // herself round that.
        // So is a ship somebody has taken the con of off the plot: her own
        // captain keeps her guns, and her helm and telegraph are his.
        const brain = this.brains.get(ship.id);
        // In a staged battle every helm is the script's.
        const conned = !ship.isBot || !!ship.heldBy || this.staged;
        if (brain) stepBot(this.state, ship, brain, DT, conned, this.staff[ship.team]);
        // And a course laid off on the chart is steered to, whoever gave it.
        if (conned) steerToWaypoint(this.state, ship);
      }
      if (this.later.length) {
        const due = this.later.filter((q) => q.at <= this.state.t);
        this.later = this.later.filter((q) => q.at > this.state.t);
        for (const q of due) { try { q.fn(); } catch { /* she is gone */ } }
      }
      const events = step(this.state, DT);
      if (events.length) this.dispatchEvents(events);
    }
    // Every other tick -- counted from the last one sent, not off the tick
    // number: a catch-up of an odd number of steps used to skip a snapshot
    // and leave a gap in every ship's track.
    if (this.state.tick - (this.sentAt ?? -Infinity) >= SNAPSHOT_EVERY) {
      this.sentAt = this.state.tick;
      this.sendSnapshots();
    }

    if (this.state.over && this.phase === 'battle') {
      this.phase = 'ended';
      this.endedAt = now;
      this.broadcast({
        t: 'result',
        winner: this.state.winner,
        reason: this.state.reason,
        roster: scoreboard(this.state),
      });
    }
    // And it closes when the last player has left it rather than on a timer.
    // The way home is a key in the corner now, and a room that shuts itself
    // takes the ship out from under somebody still watching her burn. The long
    // stop is there so an abandoned room is not kept for ever.
    if (this.phase === 'ended'
      && (this.players.size === 0 || now - this.endedAt > 1800000)) this.close();
  }

  dispatchEvents(events) {
    // A sinking and the end of the battle go to everyone; the rest are effects
    // filtered by team.
    const global = [];
    const perTeam = [[], []];
    for (const ev of events) {
      // A sinking, the end of the battle, and a magazine going up. The last of
      // those is heard and seen from anywhere on the map whether or not the
      // ship it happened to was in sight -- that is the whole of what makes a
      // detonation different from every other explosion in the game.
      if (ev.e === 'sink' || ev.e === 'over' || ev.e === 'detonate') global.push(ev);
      else {
        for (let team = 0; team < 2; team++) {
          if (this.eventVisible(ev, team)) perTeam[team].push(ev);
        }
      }
    }
    for (const p of this.players.values()) {
      // A director is shown everything that happens, on both sides.
      const list = p.director ? events : global.concat(perTeam[p.team]);
      if (list.length) p.send({ t: 'ev', ev: list });
    }
    if (this.recorder) this.recorder({ t: 'ev', ev: events });
  }

  eventVisible(ev, team) {
    // Two ships meeting is seen by anyone who can see either of them -- and
    // by nobody else, or a collision between two ships out of sight would put
    // them both on the chart.
    if (ev.e === 'collide') {
      return [ev.a, ev.b].some((id) => {
        const s = this.state.ships.find((x) => x.id === id);
        return s && (s.team === team || s.spottedBy[team]);
      });
    }
    const shipId = ev.ship || ev.victim;
    if (shipId) {
      const s = this.state.ships.find((x) => x.id === shipId);
      if (s) return s.team === team || s.spottedBy[team];
    }
    return true;
  }

  sendSnapshots() {
    let whole = null;
    for (const p of this.players.values()) {
      const snap = buildSnapshot(this.state, p.team, p.shipId, p.watching || 0, !!p.director);
      if (p.director) whole = snap;
      p.send(snap);
    }
    // The replay is the whole battle, whoever was watching it: every ship on
    // both sides, as a director would have seen her.
    if (this.recorder) this.recorder(whole || buildSnapshot(this.state, 0, -1, 0, true));
  }

  broadcastRoster() {
    this.broadcast({ t: 'roster', roster: scoreboard(this.state), room: this.summary() });
  }

  broadcast(msg) {
    for (const p of this.players.values()) p.send(msg);
    if (this.recorder) this.recorder(msg);
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
    if (typeof msg.ship !== 'number' || msg.ship === ship.id) return ship.alive ? ship : null;
    const target = this.state.ships.find((s) => s.id === msg.ship);
    return target && target.alive ? target : ship.alive ? ship : null;
  }

  /**
   * A player has given an order to a ship that is not his own: from now on
   * she answers him and not her own captain, until he looks away from her.
   */
  hold(player, target) {
    if (!target || target.id === player.shipId) return;
    if (player.holds && player.holds !== target.id) this.release(player);
    if (target.heldBy !== player.shipId && target.wayX == null) target.rudderCmd = 0;
    player.holds = target.id;
    target.heldBy = player.shipId;
  }

  /** Hand the ship a player has been conning back to her own captain. */
  release(player) {
    const id = player.holds;
    player.holds = 0;
    if (!id) return;
    const ship = this.state.ships.find((s) => s.id === id);
    if (!ship || ship.heldBy !== player.shipId) return;
    ship.heldBy = 0;
    // Her own captain steers her his own way, not to the mark left on the
    // chart for her.
    if (ship.isBot) { ship.wayX = null; ship.wayZ = null; }
  }

  command(player, msg) {
    // Which ship the camera is on. It is answered before anything else,
    // because a captain whose own ship has gone down is exactly the man who
    // wants to watch somebody else's -- and the guard below would have turned
    // him away.
    if (msg.t === 'watch') {
      player.watching = typeof msg.ship === 'number' ? msg.ship : 0;
      // Looking at another ship takes him off the one he had the con of.
      // Watching his own wreck go down does not: his flag is still flying in
      // the ship he shifted it to.
      const own = this.shipOf(player);
      if (player.holds && player.watching !== player.holds
        && !(player.watching === player.shipId && own && !own.alive)) this.release(player);
      return;
    }
    // How fast the battle runs. Only a captain alone in it may change that --
    // with two aboard, one cannot hurry the other's battle along.
    if (msg.t === 'warp') {
      const asked = Number(msg.s);
      // Below one is a director's, for slow motion and for stopping the action
      // while a shot is lined up; anyone else is offered whole multiples.
      const slow = player.director && SLOW_TIME_SCALES.includes(asked);
      const want = slow ? asked : Math.round(asked);
      const s = this.players.size <= 1 && Number.isFinite(want)
        ? (slow ? want : Math.max(1, Math.min(MAX_TIME_SCALE, want))) : 1;
      this.timeScale = s;
      // Stopped is stopped: whatever time was owed to the battle when the
      // word was given is forgiven, or it would run on for a second or two
      // working it off.
      if (s === 0) this.accum = 0;
      this.broadcast({ t: 'warp', s });
      return;
    }
    const ship = this.shipOf(player);
    if (!ship) return;
    // A captain whose ship has gone down still has the con of whatever he has
    // picked off the plot: orders that name another ship go to her.
    const other = typeof msg.ship === 'number' && msg.ship !== ship.id;
    if (!ship.alive && !other) return;
    // And she answers him from now on rather than her own captain.
    if (other) {
      const target = this.state.ships.find((s) => s.id === msg.ship);
      if (target && target.alive) this.hold(player, target);
    }
    switch (msg.t) {
      case 'input': { const to = this.conned(ship, msg); if (to) applyInput(to, msg); break; }
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
      case 'fire': { const to = this.conned(ship, msg); if (to) this.onWord(to, 'main', () => fireGuns(this.state, to)); break; }
      case 'torp': { const to = this.conned(ship, msg); if (to) this.onWord(to, 'torp', () => fireTorpedoes(this.state, to)); break; }
      // The depth charge gear. `dc` puts a pattern in the water -- one
      // mounting when `i` names one, the whole battery otherwise -- `dcset`
      // winds the pistols, and `dcauto` says whether her own anti-submarine
      // officer may attack a contact without being asked.
      case 'dc': {
        const from = this.conned(ship, msg);
        if (!from) break;
        const only = Number.isInteger(msg.i) ? msg.i : null;
        if (!this.onWord(from, 'dc', () => dropCharges(this.state, from, only))
          && !orderPending(this.state, from, 'dc')) player.send({ t: 'nodc' });
        break;
      }
      case 'dcset': { const to = this.conned(ship, msg); if (to) setChargeDepth(to, msg.d); break; }
      case 'dcauto': {
        const from = this.conned(ship, msg);
        if (!from) break;
        from.dcAuto = msg.on ? 1 : 0;
        break;
      }
      // A captain gone down to one mounting to lay it himself. `man` takes it
      // or hands it back, `lay` says where he is holding, and `shoot` is the
      // trigger -- which her close-range battery does not need, because an
      // automatic gun fires itself for as long as it is laid.
      case 'man': { const to = this.conned(ship, msg); if (to) manGun(to, msg); break; }
      // A searchlight: switched on or off, or trained. On her own ship only --
      // a lamp is worked from where it stands.
      case 'lamp': {
        const to = this.conned(ship, msg);
        if (to) setLamp(to, getClass(to.classId), msg);
        break;
      }
      case 'lay': { const to = this.conned(ship, msg); if (to) layGun(to, msg); break; }
      // One of her guns or banks put on an enemy ship by name off the
      // targeting panel, or given back to her gunnery officer.
      case 'assign': {
        const to = this.conned(ship, msg);
        if (to) assignMount(this.state, to, msg.k, msg.i, typeof msg.target === 'number' ? msg.target : 0);
        break;
      }
      // One of them switched off, or back on, off the same panel.
      case 'gunoff': {
        const to = this.conned(ship, msg);
        if (to) setMountOff(to, msg.k, msg.i, !!msg.off);
        break;
      }
      case 'shoot': { const to = this.conned(ship, msg); if (to) shootGun(this.state, to); break; }
      // Damage control and smoke are given to whichever ship is being conned,
      // the same way a course is. A captain watching another ship from her own
      // bridge is on her bridge.
      case 'repair': { const to = this.conned(ship, msg); if (to) useRepair(this.state, to); break; }
      case 'smoke': { const to = this.conned(ship, msg); if (to) useSmoke(this.state, to); break; }
      // One of her damage control parties sent to a job, or stood down.
      case 'party': {
        const to = this.conned(ship, msg);
        if (to) setParty(to, msg.i, typeof msg.job === 'string' ? msg.job : null);
        break;
      }
      // A player flying one of her flights by hand. `fly` is where the
      // aeroplane is now, `drop` lets go of what she is carrying, and `land`
      // hands her back to the autopilot.
      case 'fly': flyPlane(this.state, ship, msg); break;
      case 'drop':
        // And say whether she actually got rid of it. The client cannot
        // settle this on its own -- the simulation holds the aeroplane's real
        // position and what is left on her rack -- and a pilot who presses the
        // key and is told "torpedoes away" when nothing left the aeroplane has
        // been lied to about the one thing he came for.
        if (!dropOrdnance(this.state, ship, msg.i)) player.send({ t: 'nodrop', i: msg.i });
        break;
      case 'land': releasePlane(this.state, msg.i, ship); break;
      // And the same three for a heavy squadron, which is flown by hand the
      // same way a flight is: where she is, let the stick go, and hand her
      // back to her own navigator.
      case 'flyb': flyBomber(this.state, ship, msg); break;
      case 'dropb':
        if (!dropStick(this.state, ship, msg.i)) player.send({ t: 'nodrop', i: msg.i });
        break;
      // One of her turrets, laid and fired by the man in it.
      case 'gunb':
        gunTurret(this.state, ship, msg.i, Number(msg.y) || 0,
          Math.min(Math.PI, Math.max(0, Number(msg.a) || Math.PI)),
          Math.min(0.3, Math.max(0, msg.dt || 0)),
          typeof msg.n === 'string' ? msg.n.slice(0, 16) : '');
        break;
      // A carrier bomber's back-seat gun, laid and fired by the man in it.
      case 'gunr':
        gunRear(this.state, ship, msg.i, Number(msg.y), Number(msg.p) || 0,
          Math.min(0.3, Math.max(0, Number(msg.dt) || 0)));
        break;
      case 'landb': {
        const bm = (this.state.bombers || []).find((q) => q.id === msg.i);
        if (bm && bm.team === ship.team && bm.pilot === ship.id) {
          bm.flown = false;
          bm.pilot = 0;
        }
        break;
      }
      // Her guns, held down. `dt` is how long the trigger has been down since
      // the last word, clamped so a client cannot claim a minute of it.
      case 'gun': strafe(this.state, ship, msg.i, Math.min(0.3, Math.max(0, msg.dt || 0))); break;
      // Her air officer told to fly the strikes off himself, as each is
      // ranged and there is something in reach to send it at -- or told to
      // wait for the captain's word again.
      case 'autolaunch': {
        const to = this.conned(ship, msg);
        if (to && getClass(to.classId).planes) to.autoLaunch = !!msg.on;
        break;
      }
      case 'strike': {
        // Her aircraft go for whatever her fire control is on. The guns and the
        // squadron fight the same ship, which is what a captain ordering a
        // strike means by it -- he does not lay off a separate bearing.
        const from = this.conned(ship, msg);
        if (!from) break;
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
