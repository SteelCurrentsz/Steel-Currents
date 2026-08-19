// Steel Currents server: static file host for the client plus the WebSocket
// battle service (lobby, matchmaking and one Room per battle).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';
import { MAP_PRESETS } from '../shared/world.js';
import { SHIP_CLASSES, SHIP_ORDER } from '../shared/ships.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// `client/` is the web root; `vendor/` and `shared/` are mounted alongside it so
// the browser and the server can import exactly the same simulation modules.
const MOUNTS = ['vendor', 'shared'];

function safeResolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  let rel = clean === '/' ? 'client/index.html' : clean.replace(/^\/+/, '');
  const top = rel.split('/')[0];
  if (!MOUNTS.includes(top) && !rel.startsWith('client/')) rel = `client/${rel}`;
  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(ROOT + path.sep)) return null;
  const dir = path.relative(ROOT, full).split(path.sep)[0];
  if (!['client', ...MOUNTS].includes(dir)) return null;
  return full;
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/status')) {
    return json(res, 200, {
      name: 'Steel Currents',
      version: '1.25',
      rooms: [...rooms.values()].filter((r) => !r.private).map((r) => r.summary()),
      maps: MAP_PRESETS,
      ships: SHIP_ORDER.map((id) => {
        const c = SHIP_CLASSES[id];
        return { id, name: c.name, type: c.type, typeName: c.typeName, blurb: c.blurb };
      }),
    });
  }
  const file = safeResolve(req.url);
  if (!file) return notFound(res);
  fs.readFile(file, (err, data) => {
    if (err) return notFound(res);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

function notFound(res) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); }
function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map();
let playerSeq = 1;

function removeRoom(room) {
  rooms.delete(room.id);
  broadcastLobby();
}

function createRoom(opts) {
  const room = new Room({ ...opts, onEmpty: removeRoom });
  rooms.set(room.id, room);
  return room;
}

/** Quick match: a public lobby if one is forming, otherwise a battle already
 *  under way that still has room, otherwise a fresh one. */
function findPublicRoom() {
  for (const room of rooms.values()) {
    if (room.private || room.phase !== 'lobby') continue;
    if (room.playerCount < room.maxPlayers) return room;
  }
  for (const room of rooms.values()) {
    if (room.private || room.phase !== 'battle') continue;
    if (room.playerCount < room.maxPlayers && room.state.t < 420) return room;
  }
  const room = createRoom({ name: 'Open Battle', mode: 'domination', maxPlayers: 12, autoStart: true });
  // A public room keeps a light bot screen so a lone captain still gets a fight.
  room.addBots(4, 'regular');
  return room;
}

function broadcastLobby() {
  const list = [...rooms.values()].filter((r) => !r.private).map((r) => r.summary());
  for (const p of players.values()) {
    if (!p.room) p.send({ t: 'lobby', rooms: list });
  }
}

const players = new Map();

wss.on('connection', (ws, req) => {
  const player = {
    id: playerSeq++,
    ws,
    name: 'Captain',
    team: 0,
    shipId: 0,
    room: null,
    alive: true,
    send(msg) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(JSON.stringify(msg)); } catch { /* socket closing */ }
      }
    },
  };
  players.set(player.id, player);
  player.send({ t: 'hello', id: player.id, version: '1.25', rooms: [...rooms.values()].filter((r) => !r.private).map((r) => r.summary()) });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    handle(player, msg);
  });

  ws.on('close', () => {
    if (player.room) player.room.leave(player.id);
    players.delete(player.id);
    broadcastLobby();
  });

  ws.on('error', () => { /* client vanished; close handler cleans up */ });
});

function handle(player, msg) {
  switch (msg.t) {
    case 'ping':
      player.send({ t: 'pong', c: msg.c });
      break;

    case 'quickmatch': {
      if (player.room) player.room.leave(player.id);
      const room = findPublicRoom();
      joinRoom(player, room, msg);
      break;
    }

    case 'custom': {
      if (player.room) player.room.leave(player.id);
      const room = createRoom({
        name: msg.roomName || 'Custom Battle',
        mode: msg.mode === 'deathmatch' ? 'deathmatch' : 'domination',
        mapId: msg.mapId,
        maxPlayers: 12,
        private: msg.private !== false,
        autoStart: false,
        botSkill: msg.botSkill || 'regular',
      });
      joinRoom(player, room, msg);
      const allies = Math.max(0, Math.min(7, msg.allies ?? 3));
      const enemies = Math.max(1, Math.min(8, msg.enemies ?? 4));
      for (let i = 0; i < allies; i++) room.addBotOnTeam(player.team, msg.botSkill);
      for (let i = 0; i < enemies; i++) room.addBotOnTeam(1 - player.team, msg.botSkill);
      room.start();
      break;
    }

    case 'joinRoom': {
      const room = rooms.get(msg.room);
      if (!room) { player.send({ t: 'error', msg: 'That battle has already sailed.' }); break; }
      if (player.room) player.room.leave(player.id);
      joinRoom(player, room, msg);
      break;
    }

    case 'leave':
      if (player.room) player.room.leave(player.id);
      player.room = null;
      player.send({ t: 'left' });
      broadcastLobby();
      break;

    case 'chat': {
      if (!player.room) break;
      const text = String(msg.msg || '').slice(0, 140);
      player.room.broadcast({ t: 'chat', from: player.name, team: player.team, msg: text });
      break;
    }

    default:
      if (player.room) player.room.command(player, msg);
  }
}

function joinRoom(player, room, msg) {
  player.name = String(msg.name || 'Captain').slice(0, 18);
  const res = room.join(player, { name: player.name, classId: msg.classId, team: msg.team });
  if (res.error) { player.send({ t: 'error', msg: res.error }); return; }
  player.send({
    t: 'joined',
    room: room.summary(),
    world: room.world,
    shipId: player.shipId,
    team: player.team,
    mode: room.mode,
    phase: room.phase,
    roster: room.state.ships.map((s) => ({ id: s.id, name: s.name, team: s.team, cls: s.classId, bot: s.isBot })),
  });
  broadcastLobby();
}

server.listen(PORT, HOST, () => {
  console.log(`\n  STEEL CURRENTS v1.25`);
  console.log(`  Battle service listening on http://localhost:${PORT}\n`);
});

export { server, wss, rooms };
