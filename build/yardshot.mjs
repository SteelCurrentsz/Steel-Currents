// Photograph a ship off the yard page with the Chrome that is installed,
// driven over its own debugging protocol -- no Playwright, no npm install.
//
//   node build/yardshot.mjs out/ '[{"name":"bow","q":{"ship":"enterprise",
//     "x":"40","y":"14","z":"190","tx":"0","ty":"8","tz":"118","fov":"30"}}]'
//
// Wants a static server on the repo root at :8765, which is
//   python3 -m http.server 8765 --bind 127.0.0.1
//
// Each view is a name and the query build/yard.html takes: where the camera
// stands, what it is aimed at, and the field it sees. Several in one call
// because starting Chrome costs more than taking the photograph does.
//
// W and H in the environment set the frame; anything the page logs as an error
// comes back at the end, because a ship that fails to build renders as an empty
// sea and says nothing about it otherwise.

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const out = process.argv[2];
const views = JSON.parse(process.argv[3] || '[]');
if (!out || !views.length) {
  console.error('usage: yardshot <outDir> \'[{"name":..., "q":{...}}, ...]\'');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const CHROME = process.env.CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9800 + Math.floor(Math.random() * 400);
const W = Number(process.env.W || 1200);
const H = Number(process.env.H || 760);

const chrome = spawn(CHROME, [
  '--headless=new', '--hide-scrollbars', '--no-sandbox', '--disable-gpu-sandbox',
  '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`,
  '--user-data-dir=/tmp/sc-yard-' + PORT, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 80 && !target; i++) {
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
const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    logs.push('EXC: ' + (d.exception?.description || d.text));
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    logs.push('ERR: ' + (m.params.args || []).map((a) => a.value ?? a.description).join(' '));
  }
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
  { width: W, height: H, deviceScaleFactor: 1, mobile: false });

for (const v of views) {
  const q = new URLSearchParams({ w: String(W), h: String(H), ...v.q }).toString();
  await send('Page.navigate', { url: `http://127.0.0.1:8765/build/yard.html?${q}` });
  // The page says when the ship is built and the frame is drawn.
  for (let i = 0; i < 120; i++) {
    await sleep(150);
    const r = await send('Runtime.evaluate',
      { expression: 'window.__ready===true', returnByValue: true });
    if (r.result?.result?.value) break;
  }
  await sleep(250);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${v.name}.png`, Buffer.from(shot.result.data, 'base64'));
}

ws.close();
chrome.kill();
console.log(logs.length ? logs.slice(0, 8).join('\n') : 'no console errors');
