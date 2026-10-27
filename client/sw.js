// The offline keeper. Every file the game can ask for -- the page, its
// modules, and the forty megabytes of hulls, aircraft and voices it fetches
// only when a battle wants them -- is put away on this device the first time
// the game is opened, and handed back from here whenever the line is down.
//
// The server writes `OFFLINE` (the version and the file list) above this
// script as it serves /sw.js; a new list is a new worker, which fetches it all
// again. With the line up, the network is asked first so a captain is always
// on the current build; a request it has not answered in a few seconds, or
// cannot answer at all, is answered from the store instead.

/* global OFFLINE */
const CACHE = 'steel-currents';
const PATIENCE = 4000;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const queue = [...OFFLINE.files];
    // Four at a time: the hulls are megabytes each, and all of them at once
    // would hold up the battle the captain is actually waiting for.
    const worker = async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        try {
          const res = await fetch(f, { cache: 'no-cache' });
          if (res.ok) await cache.put(f, res);
        } catch { /* fetched again when the game asks for it */ }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
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
  if (/^\/(ws|api|healthz|sw\.js)/.test(url.pathname)) return;
  e.respondWith(answer(req, keyOf(req)));
});

async function answer(req, key) {
  const cache = await caches.open(CACHE);
  const net = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') cache.put(key, res.clone()).catch(() => {});
    return res;
  });
  const stored = () => cache.match(key);
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
