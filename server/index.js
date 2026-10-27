// Steel Currents server: static file host for the client plus the WebSocket
// battle service (lobby, matchmaking and one Room per battle).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';
import { scoreboard } from '../shared/protocol.js';
import { MAP_PRESETS } from '../shared/world.js';
import { SHIP_CLASSES, SHIP_ORDER } from '../shared/ships.js';
import { crewBattle } from './setup.js';

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

// `client/` is the web root; `vendor/`, `shared/` and `server/` are mounted
// alongside it so the browser and the server can import exactly the same
// simulation modules. `server/` is there because the offline build hosts a Room
// inside the tab -- localnet.js imports it, main.js imports localnet, so
// without the mount the client will not boot at all over HTTP.
const MOUNTS = ['vendor', 'shared', 'server'];

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
  // Hosting platforms poll this to decide whether the instance is live.
  if (req.url.startsWith('/healthz')) {
    return json(res, 200, { ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) });
  }
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
  if (req.url.split('?')[0] === '/sw.js') return serveWorker(req, res);
  const file = safeResolve(req.url);
  if (!file) return notFound(res);
  serveFile(req, res, file);
});

// Every module the game imports before its first frame, as the page names it.
//
// The client is served as the modules it is written in, a hundred and more of
// them, and a browser finds out what a module imports only once it has that
// module: main.js, then what main.js imports, then what those import, seven
// deep. Every level is another round trip, and on a phone's connection the
// loading screen sat on "Casting off" for all of them. Named in the page, the
// whole tree is asked for at once, alongside main.js itself.
const IMPORT = /^\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;
function bootModules() {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file) || !fs.existsSync(file)) return;
    seen.add(file);
    for (const m of fs.readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const spec = m[1] || m[2];
      if (spec.startsWith('.')) walk(path.resolve(path.dirname(file), spec));
    }
  };
  walk(path.join(ROOT, 'client/js/main.js'));
  return [...seen];
}
const INDEX = path.join(ROOT, 'client/index.html');
const BOOT = bootModules();
const PRELOAD = BOOT.slice(1).map((f) => {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  return rel.startsWith('client/') ? rel.slice('client/'.length) : rel;
});
const STARTED = Date.now().toString(36);

// Every file the game can ask for, as the page names it: what it imports
// before its first frame, and what it fetches later -- each hull, the
// aircraft, the voices -- through `import()`. The service worker (client/sw.js)
// puts all of it away on the device, so a battle can be joined with no
// connection at all once the game has been opened online.
const DYNAMIC = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
function everyModule() {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file) || !fs.existsSync(file)) return;
    seen.add(file);
    const src = fs.readFileSync(file, 'utf8');
    for (const m of [...src.matchAll(IMPORT), ...src.matchAll(DYNAMIC)]) {
      const spec = m[1] || m[2];
      if (spec.startsWith('.')) walk(path.resolve(path.dirname(file), spec));
    }
  };
  walk(path.join(ROOT, 'client/js/main.js'));
  return [...seen];
}
function pageName(f) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  return `/${rel.startsWith('client/') ? rel.slice('client/'.length) : rel}`;
}
const OFFLINE_FILES = [path.join(ROOT, 'client/css/style.css'), ...everyModule()];

function serveWorker(req, res) {
  let tags;
  let body;
  try {
    tags = [INDEX, ...OFFLINE_FILES].map((f) => tagOf(f, fs.statSync(f))).join('');
    body = fs.readFileSync(path.join(ROOT, 'client/sw.js'), 'utf8');
  } catch {
    return notFound(res);
  }
  const version = crypto.createHash('sha1').update(tags).digest('hex').slice(0, 12);
  const offline = { version, files: ['/', ...OFFLINE_FILES.map(pageName)] };
  const data = Buffer.from(`const OFFLINE = ${JSON.stringify(offline)};\n${body}`);
  send(req, res, {
    'Content-Type': MIME['.js'],
    'Cache-Control': 'no-cache',
    Vary: 'Accept-Encoding',
  }, { data, gz: zlib.gzipSync(data, { level: 6 }) });
}

function withPreloads(html) {
  const links = PRELOAD.map((href) => `<link rel="modulepreload" href="${href}" />`).join('\n');
  return html.replace('<script type="module" src="js/main.js"></script>',
    (tag) => `${links}\n${tag}`);
}

// What has been read off the disk, and its gzip, kept until the file changes.
// The game is forty-odd megabytes of script, most of it ship hulls, and every
// visit used to fetch all of it again uncompressed: `no-cache` with nothing to
// revalidate against means "download it again". Now a browser that has the
// file asks with its tag and gets a 304, and one that has not gets it zipped.
const served = new Map();
const ZIPPABLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg']);

// The page carries the list of modules worked out when this process started,
// so its tag changes with the process as well as with the file.
function tagOf(file, st) {
  const tag = `${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}`;
  return `"${tag}${file === INDEX ? `-${STARTED}` : ''}"`;
}

function serveFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(res);
    const etag = tagOf(file, st);
    const head = {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      ETag: etag,
      Vary: 'Accept-Encoding',
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, head);
      return res.end();
    }
    const hit = served.get(file);
    if (hit && hit.etag === etag) return send(req, res, head, hit);
    fs.readFile(file, (err2, read) => {
      if (err2) return notFound(res);
      const data = file === INDEX ? Buffer.from(withPreloads(read.toString('utf8'))) : read;
      const entry = { etag, data, gz: null };
      if (ZIPPABLE.has(path.extname(file)) && data.length > 1024) {
        entry.gz = zlib.gzipSync(data, { level: 6 });
      }
      served.set(file, entry);
      send(req, res, head, entry);
    });
  });
}

function send(req, res, head, entry) {
  const zip = entry.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const body = zip ? entry.gz : entry.data;
  res.writeHead(200, {
    ...head,
    ...(zip ? { 'Content-Encoding': 'gzip' } : {}),
    'Content-Length': body.length,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

// The page and its modules zipped as the server comes up, off the request
// path, so the first captain after a deploy is not kept waiting while three
// megabytes are compressed one file at a time in front of him.
for (const file of [INDEX, ...BOOT]) {
  fs.stat(file, (err, st) => {
    if (err || served.has(file)) return;
    fs.readFile(file, (err2, read) => {
      if (err2) return;
      const data = file === INDEX ? Buffer.from(withPreloads(read.toString('utf8'))) : read;
      zlib.gzip(data, { level: 6 }, (err3, gz) => {
        if (err3 || served.has(file)) return;
        served.set(file, { etag: tagOf(file, st), data, gz });
      });
    });
  });
}

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
        name: msg.roomName || (msg.arcade ? 'Arcade Battle' : 'Custom Battle'),
        arcade: !!msg.arcade,
        mode: msg.mode === 'deathmatch' ? 'deathmatch' : 'domination',
        mapId: msg.mapId,
        maxPlayers: 12,
        private: msg.private !== false,
        autoStart: false,
        botSkill: msg.botSkill || 'regular',
        time: msg.time,
        weather: msg.weather,
        fog: !!msg.fog,
        friendlyFire: !!msg.ff,
        // Where the corners were laid: the seed makes the same berth lay out
        // the same field every time, `half` is how much of it there is, and
        // the position is what puts the real coastline in the battlefield.
        seed: Number.isFinite(msg.seed) ? (msg.seed >>> 0) : undefined,
        half: Number.isFinite(msg.half) ? msg.half : undefined,
        place: (Number.isFinite(msg.lon) && Number.isFinite(msg.lat))
          ? { lon: msg.lon, lat: msg.lat } : undefined,
      });
      // The fleets, the guns ashore and the berths the captain gave them, all
      // out of setup.js -- the same code the standalone build runs, so a
      // sortie means the same thing whether or not there is a socket in it.
      crewBattle(room, msg, (at) => {
        const res = joinRoom(player, room, msg, at);
        return res?.error ? { error: res.error } : { team: player.team };
      });
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

function joinRoom(player, room, msg, at = null) {
  player.name = String(msg.name || 'Captain').slice(0, 18);
  const res = room.join(player, {
    name: player.name, classId: msg.classId, team: msg.team, at,
  });
  if (res.error) { player.send({ t: 'error', msg: res.error }); return res; }
  player.send({
    t: 'joined',
    room: room.summary(),
    world: room.world,
    shipId: player.shipId,
    team: player.team,
    mode: room.mode,
    phase: room.phase,
    // Same shape as the 'roster' message: the client keeps whichever arrived
    // last, so a thinner one here would strip the scoreboard's stats.
    roster: scoreboard(room.state),
  });
  broadcastLobby();
  return res;
}

server.listen(PORT, HOST, () => {
  console.log(`\n  STEEL CURRENTS v1.25`);
  console.log(`  Battle service listening on http://localhost:${PORT}\n`);
});

export { server, wss, rooms };
