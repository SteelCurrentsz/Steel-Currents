// Boot, screen flow and the single render loop shared by the title scene and
// the battle.

import * as THREE from '../../vendor/three.module.js';
import { TitleScene } from './menu.js';
import { ShipyardScene, hullSheet, armsSheet } from './shipyard.js';
import { Battle } from './game.js';
import { Net } from './net.js';
import { LocalNet } from './localnet.js';
import { Input } from './input.js';
import { TouchControls, isTouchDevice } from './touch.js';
import * as fullscreen from './fullscreen.js';
import { Briefing, FLEET_MAX } from './briefing.js';
import { DeployMap } from './deploy.js';
import { audio } from './audio.js';
import { getSettings, setSettings, QUALITY } from './settings.js';
import { SHIP_CLASSES, SHIP_ORDER } from '../../shared/ships.js';
import { MAP_PRESETS } from '../../shared/world.js';
import { MIN_NOTCH, MAX_NOTCH } from '../../shared/sim.js';

const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x050c16);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

// A standalone build (no battle service to reach) hosts its own Room in-tab.
const net = globalThis.STEEL_CURRENTS_OFFLINE ? new LocalNet() : new Net();
const input = new Input(canvas);
input.touch = isTouchDevice();
if (input.touch) document.getElementById('touch-help')?.removeAttribute('hidden');
const touchControls = input.touch
  ? new TouchControls(input, { minNotch: MIN_NOTCH, maxNotch: MAX_NOTCH })
  : null;
let title = new TitleScene(renderer);
let battle = null;
let yard = null;
let current = 'title';

// ------------------------------------------------------------------ view --

function applyQuality() {
  const q = QUALITY[getSettings().quality] || QUALITY.medium;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
  resize();
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  title.resize(w, h);
  if (battle) battle.resize(w, h);
  if (yard) yard.resize(w, h);
}
window.addEventListener('resize', resize);

// --------------------------------------------------------------- screens --

const screens = ['title', 'pvp', 'custom', 'options', 'fleet', 'yard', 'map', 'battle', 'result'];

function show(name) {
  current = name;
  for (const s of screens) {
    document.getElementById(`screen-${s}`).classList.toggle('active', s === name);
  }
  // The rotate prompt and the on-screen bridge only belong in a battle.
  document.body.classList.toggle('in-battle', name === 'battle');
  // Panel screens put their own buttons in the corners; the fullscreen toggle
  // stands down rather than sitting on top of them.
  document.body.classList.toggle('on-panel', name !== 'title' && name !== 'battle');
  if (name === 'battle') touchControls?.show();
  else touchControls?.hide();
  if (name !== 'battle') input.enabled = false;
}

const fsBtn = document.getElementById('btn-fullscreen');
if (fullscreen.supported()) {
  fsBtn.onclick = () => { audio.click(); fullscreen.toggle(document.documentElement); };
  fullscreen.onChange((on) => {
    fsBtn.classList.toggle('on', on);
    fsBtn.querySelector('.fs-label').textContent = on ? 'EXIT FULL' : 'FULLSCREEN';
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF' && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) {
      fullscreen.toggle(document.documentElement);
    }
  });
} else {
  // iPhone Safari has no element fullscreen; offering a dead control is worse
  // than offering none.
  fsBtn.remove();
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ------------------------------------------------------------------ menu --

document.querySelectorAll('[data-action]').forEach((btn) => {
  btn.addEventListener('click', () => {
    audio.resume();
    audio.click();
    switch (btn.dataset.action) {
      case 'pvp': show('pvp'); refreshRooms(); break;
      case 'custom': show('custom'); briefing.show(); break;
      case 'options': show('options'); break;
      case 'back': show('title'); break;
      case 'quit': quit(); break;
      default: break;
    }
  });
});

function quit() {
  // A browser cannot close a tab it did not open, so say goodbye instead.
  document.body.innerHTML =
    '<div style="display:grid;place-items:center;height:100%;font-family:var(--ui);color:#e6cf9c;letter-spacing:.2em;text-transform:uppercase">Signal ends — fair winds, captain.</div>';
  document.body.style.background = '#04090f';
  try { renderer.dispose(); } catch { /* nothing to dispose */ }
}

// ------------------------------------------------------------ ship picker --

function buildShipPicker(container, selectedId, onPick) {
  container.innerHTML = '';
  for (const id of SHIP_ORDER) {
    const c = SHIP_CLASSES[id];
    const el = document.createElement('button');
    el.className = 'ship-card' + (id === selectedId ? ' selected' : '');
    el.innerHTML = `<div class="type">${c.type} · ${c.typeName}</div>
      <div class="nm">${c.name}</div><div class="bl">${c.blurb}</div>`;
    el.onclick = () => {
      [...container.children].forEach((x) => x.classList.remove('selected'));
      el.classList.add('selected');
      audio.click();
      onPick(id);
    };
    container.appendChild(el);
  }
}

const settings = getSettings();
buildShipPicker(document.getElementById('pvp-ships'), settings.ship, (id) => setSettings({ ship: id }));
document.getElementById('pvp-name').value = settings.name;
document.getElementById('pvp-name').oninput = (e) => setSettings({ name: e.target.value || 'Captain' });

const briefing = new Briefing({
  getName: () => getSettings().name,
  getSkill: () => getSettings().botSkill,
  // Only when there is a flagship to remember. An empty fleet has no lead
  // hull, and writing that away would lose the last one a captain chose.
  onShipChange: (id) => { if (id) setSettings({ ship: id }); },
  // The hull icons open the picker; choosing or cancelling returns to the chart.
  onOpenPicker: () => show('fleet'),
  onClosePicker: () => show('custom'),
  onOpenYard: (side) => openYard(side),
  onOpenChart: (at) => openChart(at),
});
document.getElementById('fleet-back').onclick = () => { audio.click(); show('custom'); };

// ------------------------------------------------------- deployment chart --

const deploy = new DeployMap({
  onPick: (at) => briefing.setDeploy(at),
});

function openChart(at) {
  show('map');
  // The canvas has no size until the screen is up, so the first paint waits for
  // the layout rather than drawing into a nought-by-nought chart.
  requestAnimationFrame(() => deploy.show(at));
}
document.getElementById('deploy-close').onclick = () => { audio.click(); show('custom'); };

// --------------------------------------------------------------- shipyard --

// Which fleet the hull on the water would join, and where in the catalogue we
// are. The scene itself is built the first time it is asked for: the title
// screen has enough to do at boot without a second sea and a second hull.
const yardUi = { side: 'ally', index: 0 };

function openYard(side) {
  yardUi.side = side;
  if (!yard) {
    yard = new ShipyardScene(renderer);
    yard.resize(window.innerWidth, window.innerHeight);
  }
  yard.attach(document.getElementById('yard-grab'));
  show('yard');
  renderYard();
}

function closeYard() {
  yard?.detach();
  show('custom');
}

function sheet(el, heading, rows) {
  el.innerHTML = `<h3>${heading}</h3>` + rows.map(([k, v]) =>
    `<div class="yard-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');
}

function renderYard() {
  const id = SHIP_ORDER[(yardUi.index + SHIP_ORDER.length) % SHIP_ORDER.length];
  const cls = SHIP_CLASSES[id];
  yard.setShip(id);
  document.getElementById('yard-name').textContent = cls.name;
  document.getElementById('yard-class').textContent = `${cls.name} Class ${cls.typeName}`;
  sheet(document.getElementById('yard-hull'), 'Hull', hullSheet(cls));
  sheet(document.getElementById('yard-arms'), 'Armament', armsSheet(cls));
}

function stepYard(dir) {
  yardUi.index = (yardUi.index + dir + SHIP_ORDER.length) % SHIP_ORDER.length;
  renderYard();
}

document.getElementById('yard-prev').onclick = () => { audio.click(); stepYard(-1); };
document.getElementById('yard-next').onclick = () => { audio.click(); stepYard(1); };
document.getElementById('yard-back').onclick = () => { audio.click(); closeYard(); };
document.getElementById('yard-commission').onclick = () => {
  audio.click();
  const id = SHIP_ORDER[yardUi.index % SHIP_ORDER.length];
  const whose = yardUi.side === 'ally' ? 'your' : 'the enemy';
  if (!briefing.commission(yardUi.side, id)) {
    toast(`${FLEET_MAX} ships is all ${whose} fleet will take.`);
    return;
  }
  toast(`${SHIP_CLASSES[id].name} joins ${whose} fleet.`);
  closeYard();
};

document.getElementById('custom-start').onclick = () => {
  audio.resume();
  const why = briefing.blocker();
  if (why) { toast(why); return; }
  fullscreen.enterBattleView(document.documentElement);
  if (!net.connected) { toast('Not connected to the battle service.'); return; }
  net.send(briefing.request());
  toast('Sortieing…');
};

document.getElementById('pvp-quick').onclick = () => {
  audio.resume();
  fullscreen.enterBattleView(document.documentElement);
  if (!net.connected) { toast('Not connected to the battle service.'); return; }
  net.send({ t: 'quickmatch', name: getSettings().name, classId: getSettings().ship });
  toast('Finding a battle…');
};

// ---------------------------------------------------------------- options --

const optName = document.getElementById('opt-name');
const optVol = document.getElementById('opt-volume');
const optSens = document.getElementById('opt-sens');
const optSkill = document.getElementById('opt-skill');
const optQuality = document.getElementById('opt-quality');
const optShadows = document.getElementById('opt-shadows');
const optShake = document.getElementById('opt-shake');
const optMetric = document.getElementById('opt-metric');

optName.value = settings.name;
optVol.value = settings.volume;
optSens.value = Math.round(settings.sensitivity * 100);
optSkill.value = settings.botSkill;
optQuality.value = settings.quality;
optShadows.checked = settings.shadows;
optShake.checked = settings.shake;
optMetric.checked = settings.metric;
document.getElementById('vol-val').textContent = settings.volume;
document.getElementById('sens-val').textContent = settings.sensitivity.toFixed(1);

optName.oninput = () => { setSettings({ name: optName.value || 'Captain' }); document.getElementById('pvp-name').value = optName.value; };
optVol.oninput = () => {
  setSettings({ volume: Number(optVol.value) });
  document.getElementById('vol-val').textContent = optVol.value;
  audio.setVolume(Number(optVol.value));
};
optSens.oninput = () => {
  const s = Number(optSens.value) / 100;
  setSettings({ sensitivity: s });
  document.getElementById('sens-val').textContent = s.toFixed(1);
};
optSkill.onchange = () => setSettings({ botSkill: optSkill.value });
optQuality.onchange = () => { setSettings({ quality: optQuality.value }); applyQuality(); toast('Quality applies to the next battle.'); };
optShadows.onchange = () => setSettings({ shadows: optShadows.checked });
optShake.onchange = () => setSettings({ shake: optShake.checked });
optMetric.onchange = () => setSettings({ metric: optMetric.checked });

// ------------------------------------------------------------------- net --

const netState = document.getElementById('net-state');
// A standalone build hosts its own battle, so there is no link whose state
// could be worth reporting. The networked build still says where it stands.
if (globalThis.STEEL_CURRENTS_OFFLINE) netState.remove();

net.on('open', () => {
  if (!netState.isConnected) return;
  netState.textContent = 'battle service online';
  netState.className = 'net-state online';
});
net.on('close', () => {
  if (!netState.isConnected) return;
  netState.textContent = 'reconnecting…';
  netState.className = 'net-state offline';
});
net.on('hello', (m) => renderRooms(m.rooms));
net.on('lobby', (m) => renderRooms(m.rooms));
net.on('error', (m) => toast(m.msg || 'The signal was refused.'));

net.on('joined', (m) => {
  if (battle) { battle.dispose(); battle = null; }
  battle = new Battle({
    renderer, net, input,
    world: m.world,
    shipId: m.shipId,
    team: m.team,
    classId: getSettings().ship,
    roster: m.roster,
    mode: m.mode,
    onExit: (result) => endBattle(result),
  });
  window.__battle = battle;   // handy handle for debugging in the console
  show('battle');
  input.enabled = true;
  resize();
  audio.resume();
  toast('Battle stations');
});

net.on('start', () => toast('Enemy fleet sighted'));
net.on('countdown', (m) => { if (m.s > 0 && m.s <= 10) toast(`Battle begins in ${m.s}…`); });

function endBattle(result) {
  if (battle) { battle.dispose(); battle = null; }
  if (result && result.roster) {
    document.getElementById('result-title').textContent =
      result.winner < 0 ? 'Draw' : result.winner === result.yourTeam ? 'Victory' : 'Battle over';
    renderResult(result);
    show('result');
  } else {
    show('title');
  }
}

function renderResult(result) {
  document.getElementById('result-sub').textContent =
    ({ points: 'Decided on points.', elimination: 'One fleet was wiped from the sea.', timeout: 'Time expired.', mutual: 'Both fleets went down.' })[result.reason] || '';
  const rows = result.roster
    .slice()
    .sort((a, b) => b.dmg - a.dmg)
    .map((r) => `<tr class="t${r.team}"><td>${r.type}</td><td>${r.name}</td>
      <td>${SHIP_CLASSES[r.cls].name}</td><td>${r.kills} kills</td>
      <td>${r.dmg.toLocaleString()} damage</td><td>${r.hits} hits</td><td>${r.cits} citadels</td></tr>`)
    .join('');
  document.getElementById('result-table').innerHTML =
    `<tr><th></th><th>Captain</th><th>Ship</th><th></th><th></th><th></th><th></th></tr>${rows}`;
}

function renderRooms(rooms) {
  const list = document.getElementById('room-list');
  if (!rooms || !rooms.length) {
    list.innerHTML = '<p class="muted">No open battles — start one with Quick Match.</p>';
    return;
  }
  list.innerHTML = '';
  for (const r of rooms) {
    const row = document.createElement('div');
    row.className = 'room-row';
    row.innerHTML = `<div><div class="rn">${r.name}</div>
      <div class="rm">${r.map.replace(/_/g, ' ')} · ${r.mode} · ${r.players}/${r.max} captains${r.bots ? ` · ${r.bots} AI` : ''}</div></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = r.phase === 'lobby' ? 'Join' : 'Join in progress';
    btn.onclick = () => net.send({ t: 'joinRoom', room: r.id, name: getSettings().name, classId: getSettings().ship });
    row.appendChild(btn);
    list.appendChild(row);
  }
}

async function refreshRooms() {
  // A standalone build hosts its own battle; there is no lobby to poll.
  if (globalThis.STEEL_CURRENTS_OFFLINE) return;
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    renderRooms(data.rooms);
  } catch { /* the socket will deliver the lobby anyway */ }
}

// ------------------------------------------------------------------ loop --

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (battle && current === 'battle') {
    battle.update(dt);
    battle.render();
  } else if (current === 'map') {
    // The chart is a 2D canvas that repaints only when something moves, so the
    // scene behind it is left alone while it is up.
    deploy.update();
  } else if (yard && current === 'yard') {
    yard.update(dt);
    yard.render();
  } else if (current === 'custom') {
    // Nothing of the harbour shows through the briefing: its chart covers the
    // screen edge to edge and the fleets are laid over that. Rendering the sea
    // behind it buys a frame nobody can see, and that frame is the one
    // standing between a captain and the chart when he opens it -- the scene
    // is queued several frames deep, and the chart waits for all of them.
    // Nothing here is drawn at less detail; it is simply not drawn twice.
  } else {
    title.update(dt);
    title.render();
  }
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && current === 'yard') { closeYard(); return; }
  if (e.code === 'Escape' && current !== 'title' && current !== 'battle') show('title');
  if (current !== 'yard') return;
  if (e.code === 'ArrowLeft') stepYard(-1);
  else if (e.code === 'ArrowRight') stepYard(1);
  else if (e.code === 'Equal' || e.code === 'NumpadAdd') yard.zoom(-1);
  else if (e.code === 'Minus' || e.code === 'NumpadSubtract') yard.zoom(1);
});
window.addEventListener('pointerdown', () => audio.resume(), { once: true });

applyQuality();
show('title');
net.connect();
requestAnimationFrame(frame);
