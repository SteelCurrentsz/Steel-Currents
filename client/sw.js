// The offline keeper. Every file the game can ask for -- the page, its
// modules, and the forty megabytes of hulls, aircraft and voices it fetches
// only when a battle wants them -- is put away on this device, and handed back
// from here whenever the line is down or too weak to answer.
//
// The server writes `OFFLINE` (the version, the shell and the file list) above
// this script as it serves /sw.js; a new list is a new worker. It takes over
// as soon as it has the shell -- the page, its boot modules and the aircraft,
// a few megabytes -- rather than once it has all forty: a worker that waited
// for everything on a weak line never took over, and so never kept anything.
// The rest is kept afterwards, when the page asks for it (`fill`), a few at a
// time behind the game.
//
// With the line up, the network is asked first so a captain is always on the
// current build; a request it has not answered in a few seconds, or cannot
// answer at all, is answered from the store instead.

/* global OFFLINE */
const CACHE = 'steel-currents';
const PATIENCE = 4000;
// How long one file may take to come down while it is being put away. A
// trickle that never finishes would otherwise hold the queue for good.
const STALL = 90000;
// Where the store notes the version it has every file of.
const FILLED = '/__filled';

async function keep(cache, f) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), STALL);
  try {
    const res = await fetch(f, { cache: 'no-cache', signal: ctl.signal });
    if (!res.ok) return false;
    await cache.put(f, res);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function keepAll(files, lanes) {
  const cache = await caches.open(CACHE);
  const queue = [...files];
  let all = true;
  const lane = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      if (!(await keep(cache, f))) all = false;
    }
  };
  await Promise.all(Array.from({ length: lanes }, lane));
  return all;
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    // Whatever of the shell does not come down is fetched again the first
    // time the game asks for it; the worker takes over regardless.
    await keepAll(OFFLINE.shell || ['/'], 4);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

// Everything else, once per version. Two at a time: the hulls are megabytes
// each, and the battle the captain is waiting for shares the same line.
let filling = null;
self.addEventListener('message', (e) => {
  if (!e.data || e.data.t !== 'fill') return;
  filling ||= (async () => {
    const cache = await caches.open(CACHE);
    const done = await cache.match(FILLED);
    if (done && (await done.text()) === OFFLINE.version) return;
    // What the store has none of first, then the rest brought up to date.
    const missing = [];
    const have = [];
    for (const f of OFFLINE.files) ((await cache.match(f)) ? have : missing).push(f);
    const all = await keepAll([...missing, ...have], 2);
    if (all) await cache.put(FILLED, new Response(OFFLINE.version));
  })().finally(() => { filling = null; });
  e.waitUntil(filling);
});

function keyOf(req) {
  const url = new URL(req.url);
  if (req.mode === 'navigate' || url.pathname === '/index.html') return '/';
  return url.pathname;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (/^\/(ws|api|healthz|sw\.js|__filled)/.test(url.pathname)) return;
  e.respondWith(answer(req, keyOf(req)));
});

async function answer(req, key) {
  const cache = await caches.open(CACHE);
  const stored = () => cache.match(key);
  // With no line at all there is nothing to wait for.
  if (self.navigator && self.navigator.onLine === false) {
    const hit = await stored();
    if (hit) return hit;
  }
  const net = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') cache.put(key, res.clone()).catch(() => {});
    return res;
  });
  let timer;
  const slow = new Promise((resolve) => { timer = setTimeout(resolve, PATIENCE); })
    .then(stored).then((hit) => hit || net);
  try {
    return await Promise.race([net, slow]);
  } catch {
    const hit = await stored();
    if (hit) return hit;
    return Response.error();
  } finally {
    clearTimeout(timer);
  }
}
