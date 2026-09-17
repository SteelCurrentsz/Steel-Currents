// Photograph a ship off the turntable page with the Chrome that is installed,
// driven over its own debugging protocol -- no Playwright, no npm install.
//
//   node build/shipshot.mjs takao out.png [views] [zoom] [look] [w] [h]
//
// Wants a static server on the repo root at :8765, which is
//   python3 -m http.server 8765 --bind 127.0.0.1
// `views` is a JSON list of camera directions, as build/shot.html takes it.

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [ship, out = 'shot.png', views, zoom, look, w = '520', h = '520'] = process.argv.slice(2);
if (!ship) { console.error('usage: shipshot <shipId|planekit fn> out.png [views] [zoom] [look]'); process.exit(2); }
const CHROME = process.env.CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333 + Math.floor(Math.random() * 500);
const what = ship.includes(':') ? ship : `ship:${ship}`;
const q = new URLSearchParams({ what, w, h });
if (views) q.set('views', views);
if (zoom) q.set('zoom', zoom);
if (look) q.set('look', look);
const nViews = views ? JSON.parse(views).length : 3;
const url = `http://127.0.0.1:8765/build/shot.html?${q}`;

const chrome = spawn(CHROME, [
  '--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${PORT}`, `--window-size=${Number(w) * nViews},${h}`,
  '--user-data-dir=/tmp/sc-chrome-profile-' + PORT, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(250);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    target = list.find((t) => t.type === 'page');
  } catch { /* not up yet */ }
}
if (!target) { chrome.kill(); throw new Error('chrome never came up'); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const waiting = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
};
const send = (method, params = {}) => new Promise((r) => {
  const n = ++id;
  waiting.set(n, r);
  ws.send(JSON.stringify({ id: n, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',
  { width: Number(w) * nViews, height: Number(h), deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
let done = false;
let err = null;
for (let i = 0; i < 240 && !done; i++) {
  await sleep(250);
  const r = await send('Runtime.evaluate',
    { expression: 'JSON.stringify({d: !!window.__done, e: window.__err})', returnByValue: true });
  const v = r.result && r.result.result && r.result.result.value;
  if (v) { const o = JSON.parse(v); done = o.d; err = o.e; }
}
if (!done) console.error('page never finished');
if (err) console.error('PAGE ERROR:', err);
// One frame for the canvas to be presented.
await sleep(400);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(`${out}${err ? ' (with error)' : ''}`);
ws.close();
chrome.kill();
process.exit(err ? 1 : 0);
