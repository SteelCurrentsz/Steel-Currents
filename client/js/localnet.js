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
        this.startBattle(msg, { allies: 3, enemies: 4, botSkill: 'regular' });
        break;

      case 'custom':
        this.startBattle(msg, {
          allies: Math.max(0, Math.min(7, msg.allies ?? 3)),
          enemies: Math.max(1, Math.min(8, msg.enemies ?? 4)),
          botSkill: msg.botSkill || 'regular',
          mode: msg.mode === 'deathmatch' ? 'deathmatch' : 'domination',
          mapId: msg.mapId,
          roomName: msg.roomName,
          time: msg.time,
          axisClass: msg.axisClass,
        });
        break;

      case 'joinRoom':
        // Rooms are never shared in a standalone build, so this is a new battle.
        this.startBattle(msg, { allies: 3, enemies: 4, botSkill: 'regular' });
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
      onEmpty: () => { this.room = null; },
    });
    this.room = room;

    this.player.name = String(msg.name || 'Captain').slice(0, 18);
    const res = room.join(this.player, {
      name: this.player.name, classId: msg.classId, team: msg.team,
    });
    if (res.error) { this.deliver({ t: 'error', msg: res.error }); return; }

    for (let i = 0; i < opts.allies; i++) room.addBotOnTeam(this.player.team, opts.botSkill);
    // The chosen Axis hull leads their line; the rest of the screen is mixed.
    for (let i = 0; i < opts.enemies; i++) {
      room.addBotOnTeam(1 - this.player.team, opts.botSkill, i === 0 ? opts.axisClass : null);
    }

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
