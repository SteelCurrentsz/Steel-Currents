// The battle service, running inside the browser tab instead of across a socket.
//
// A Room is plain simulation code with no server in it, so a standalone build
// can host one directly and hand it the same messages the WebSocket client
// sends. That keeps one codebase: `Net` and `LocalNet` present the same surface
// to `main.js`, and everything downstream — the HUD, the renderer, prediction —
// cannot tell which one it is talking to.
//
// There is no second human here, so both fleets are crewed by bot captains.

import { Room } from '../../server/room.js';
import { crewBattle } from '../../server/setup.js';
import { scoreboard } from '../../shared/protocol.js';

export class LocalNet extends EventTarget {
  constructor() {
    super();
    this.connected = false;
    this.ping = 0;
    this.room = null;
    this.player = {
      id: 1,
      name: 'Captain',
      team: 0,
      shipId: 0,
      room: null,
      alive: true,
      // The Room writes to the player the same way it writes to a socket; here
      // that lands straight in the client's event bus.
      send: (msg) => this.deliver(msg),
    };
  }

  connect() {
    this.connected = true;
    this.emit('open');
    this.deliver({ t: 'hello', id: this.player.id, version: '1.25', rooms: [], offline: true });
  }

  deliver(msg) {
    if (msg.t === 'pong') { this.ping = Date.now() - msg.c; return; }
    this.emit(msg.t, msg);
    this.emit('*', msg);
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  on(type, fn) {
    const h = (e) => fn(e.detail);
    this.addEventListener(type, h);
    return () => this.removeEventListener(type, h);
  }

  // -- the server's dispatch, minus the socket -------------------------------

  send(msg) {
    switch (msg.t) {
      case 'ping':
        this.deliver({ t: 'pong', c: msg.c });
        break;

      case 'quickmatch':
        // No one else is out there to wait for, so skip the lobby clock and
        // put a full bot fleet on each side.
        this.startBattle({ ...msg, allies: 3, enemies: 4 }, { botSkill: 'regular' });
        break;

      case 'custom':
        // Straight through, order of battle and all. What the briefing asked
        // for is what gets built -- the counts are clamped inside crewBattle,
        // which is the same clamp the socket build applies.
        this.startBattle(msg, {
          botSkill: msg.botSkill || 'regular',
          mode: msg.mode === 'deathmatch' ? 'deathmatch' : 'domination',
          mapId: msg.mapId,
          roomName: msg.roomName,
          time: msg.time,
          weather: msg.weather,
          seed: msg.seed,
          half: msg.half,
          lon: msg.lon,
          lat: msg.lat,
        });
        break;

      case 'joinRoom':
        // Rooms are never shared in a standalone build, so this is a new battle.
        this.startBattle({ ...msg, allies: 3, enemies: 4 }, { botSkill: 'regular' });
        break;

      case 'leave':
        this.closeRoom();
        this.deliver({ t: 'left' });
        break;

      case 'chat':
        break;

      default:
        if (this.room) this.room.command(this.player, msg);
    }
  }

  closeRoom() {
    if (!this.room) return;
    this.room.onEmpty = () => {};
    this.room.close();
    this.room = null;
    this.player.room = null;
  }

  startBattle(msg, opts) {
    this.closeRoom();
    const room = new Room({
      name: opts.roomName || 'Skirmish',
      mode: opts.mode || 'domination',
      mapId: opts.mapId,
      maxPlayers: 12,
      private: true,
      autoStart: false,
      botSkill: opts.botSkill,
      time: opts.time,
      weather: opts.weather,
      seed: Number.isFinite(opts.seed) ? (opts.seed >>> 0) : undefined,
      half: Number.isFinite(opts.half) ? opts.half : undefined,
      // Where on the earth this is being fought, which is what puts the real
      // coastline into the battlefield.
      place: (Number.isFinite(opts.lon) && Number.isFinite(opts.lat))
        ? { lon: opts.lon, lat: opts.lat } : undefined,
      onEmpty: () => { this.room = null; },
    });
    this.room = room;

    this.player.name = String(msg.name || 'Captain').slice(0, 18);
    // The fleets, the guns ashore and the berths off the order-of-battle
    // chart, out of the same setup.js the socket build runs. This used to be a
    // second copy that had never learned about the chart, so a captain who laid
    // his squadron out and pressed Sortie found it back on the spawn line with
    // no artillery on the coast at all.
    const out = crewBattle(room, { ...msg, botSkill: opts.botSkill }, (at) => {
      const res = room.join(this.player, {
        name: this.player.name, classId: msg.classId, team: msg.team, at,
      });
      return res.error ? { error: res.error } : { team: this.player.team };
    }, { allies: 7, enemies: 8, guns: 12 });
    if (out && out.error) { this.deliver({ t: 'error', msg: out.error }); return; }

    this.deliver({
      t: 'joined',
      room: room.summary(),
      world: room.world,
      shipId: this.player.shipId,
      team: this.player.team,
      mode: room.mode,
      phase: room.phase,
      roster: scoreboard(room.state),
    });
    room.start();
  }
}
