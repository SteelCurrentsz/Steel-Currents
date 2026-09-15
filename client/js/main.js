// Boot, screen flow and the single render loop shared by the title scene and
// the battle.

import * as THREE from '../../vendor/three.module.js';
import { TitleScene } from './menu.js';
import { ShipyardScene, hullSheet, armsSheet } from './shipyard.js';
import { BatteryScene, mountingSheet, ordnanceSheet } from './battery.js';
import { BomberScene } from './bomberyard.js';
import { BATTERIES, BATTERY_ORDER } from '../../shared/batteries.js';
import { BOMBERS, BOMBER_ORDER, airframeSheet, payloadSheet } from '../../shared/bombers.js';
import { Battle } from './game.js';
import { Net } from './net.js';
import { LocalNet } from './localnet.js';
import { Input } from './input.js';
import { TouchControls, isTouchDevice } from './touch.js';
import * as fullscreen from './fullscreen.js';
import { Briefing, FLEET_MAX, BOMBER_MAX } from './briefing.js';
import { LayoutMap } from './layout.js';
import { DeployMap } from './deploy.js';
import { audio } from './audio.js';
import * as account from './account.js';
import { getSettings, setSettings, QUALITY } from './settings.js';
import { SHIP_CLASSES, SHIP_ORDER } from '../../shared/ships.js';
import { MAP_PRESETS } from '../../shared/world.js';
import { normaliseAirGroup } from '../../shared/sim.js';

/**
 * The loading screen.
 *
 * It is in the markup and up from the moment the page is parsed, so it is on
 * the screen before any of this module has run. Everything that takes visible
 * time -- building the harbour at start-up, building a fleet on sortie --
 * reports through here, and the bar moves because the game has reached a
 * stage rather than because a timer said so.
 *
 * `hold` is the part that matters and the part that is easy to get wrong: a
 * browser will not repaint between a style change and the blocking work that
 * follows it on the same task, so showing this and then building a fleet in
 * the next statement shows nothing at all. Two frames are waited for -- one to
 * get the change into a paint, one to be sure that paint happened -- and only
 * then is the work done.
 */
const boot = {
  el: document.getElementById('boot'),
  fill: document.getElementById('boot-fill'),
  line: document.getElementById('boot-say'),
  say(text, at) {
    if (this.line) this.line.textContent = text;
    if (this.fill && at != null) this.fill.style.width = `${Math.round(at * 100)}%`;
  },
  show(text) {
    if (!this.el) return;
    this.el.classList.remove('gone', 'done', 'stuck');
    this.say(text, 0.06);
  },
  done() {
    if (!this.el) return;
    this.say('Ready', 1);
    this.el.classList.add('gone');
    setTimeout(() => this.el.classList.add('done'), 500);
  },
  /** Paint, then do the work, then take the screen down. */
  hold(text, work) {
    this.show(text);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { work(); } finally { this.done(); }
    }));
  },
};

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
const touchControls = input.touch ? new TouchControls(input) : null;
// The harbour is built after the first paint rather than on this line, so the
// loading screen is actually on the glass while it is being built. It is the
// heaviest scene in the game -- a burning port, a sea and a ship -- and on a
// phone it is most of the wait.
let title = null;
let battle = null;
let yard = null;
let guns = null;
let bombers = null;
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
  title?.resize(w, h);
  if (battle) battle.resize(w, h);
  if (yard) yard.resize(w, h);
  if (guns) guns.resize(w, h);
  if (bombers) bombers.resize(w, h);
}
window.addEventListener('resize', resize);

// The graphics card letting go of the page, which is the other way a battle
// goes wrong and the likeliest one on a phone: the browser takes the WebGL
// context back under memory pressure or when the tab has been in the
// background, every draw call after that throws, and what the captain sees is
// a frozen picture or the browser's own crash notice. Both events are caught:
// the loss is stopped from becoming the browser's default "page is dead", and
// the restore puts the picture back.
canvas.addEventListener('webglcontextlost', (e) => {
  // Without this the context is never restored and the game is finished.
  e.preventDefault();
  toast('The graphics card dropped the picture — putting it back.');
}, false);
canvas.addEventListener('webglcontextrestored', () => {
  applyQuality();
  toast('Picture restored.');
}, false);

// --------------------------------------------------------------- screens --

const screens = ['gate', 'account', 'title', 'pvp', 'custom', 'options', 'fleet',
  'yard', 'guns', 'bombers', 'map', 'lay', 'battle', 'result'];

function show(name) {
  current = name;
  for (const s of screens) {
    document.getElementById(`screen-${s}`).classList.toggle('active', s === name);
  }
  // The rotate prompt and the on-screen bridge only belong in a battle.
  document.body.classList.toggle('in-battle', name === 'battle');
  // Panel screens put their own buttons in the corners; the fullscreen toggle
  // stands down rather than sitting on top of them.
  document.body.classList.toggle('on-panel',
    name !== 'title' && name !== 'battle' && name !== 'gate');
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
      case 'account': openAccount(); break;
      default: break;
    }
  });
});

// ---------------------------------------------------------- the account --
//
// The game asks once, on the first run, and never again: whoever is at the
// wheel is written to this device and read back at every later start.

/** The three hulls on the gate, and the way in each of them is. */
for (const btn of document.querySelectorAll('.gate-ship')) {
  btn.addEventListener('click', async () => {
    audio.resume();
    audio.click();
    const which = btn.dataset.provider;
    // Every hull is held while one of them is being pressed: a second tap on
    // another of them mid-sign-in would make two accounts and keep the last.
    for (const b of document.querySelectorAll('.gate-ship')) b.disabled = true;
    const note = document.getElementById('gate-note');
    if (note) note.textContent = 'Signing in…';
    try {
      await account.signIn(which);
    } finally {
      for (const b of document.querySelectorAll('.gate-ship')) b.disabled = false;
    }
    gateNote();
    show('title');
  });
}

/**
 * What the gate says under the ships.
 *
 * It says what is actually true of this device rather than what a sign-in
 * screen usually claims. A browser that will not keep anything -- a private
 * window, site data refused -- cannot remember an account at all, and a player
 * is better told that before he signs in than after he loses his fleet.
 */
function gateNote() {
  const note = document.getElementById('gate-note');
  if (!note) return;
  note.textContent = account.persists()
    ? 'Apple and Google Play sign-in need a developer account and a server to '
      + 'verify the token they hand back; until those are wired in, all three '
      + 'buttons make an account on this device. It is kept, and you will not '
      + 'be asked again.'
    : 'This browser is refusing to keep site data, so an account cannot be '
      + 'remembered here — you will be asked again next time. A normal window, '
      + 'or allowing site data for this page, fixes it.';
}

/** The account screen, off the title menu. */
function openAccount() {
  const acc = account.current();
  const provider = acc ? (account.PROVIDERS[acc.provider]?.label || acc.provider) : '—';
  document.getElementById('acc-provider').textContent = provider;
  document.getElementById('acc-since').textContent = acc?.since
    ? new Date(acc.since).toLocaleDateString() : '—';
  document.getElementById('acc-id').textContent = acc?.id || '—';
  const nameEl = document.getElementById('acc-name');
  nameEl.value = acc?.name || getSettings().name || 'Captain';
  nameEl.oninput = () => {
    const nm = nameEl.value || 'Captain';
    setSettings({ name: nm });
    const cur = account.current();
    if (cur) account.remember({ ...cur, name: nm });
  };
  const note = document.getElementById('acc-note');
  if (!acc) {
    note.textContent = 'Nobody is signed in on this device.';
  } else if (acc.local) {
    note.textContent = acc.provider === 'guest'
      ? 'A guest account lives on this device and nowhere else. Clear this '
        + 'page\u2019s site data and it is gone; there is nothing to restore it from.'
      : `${provider} sign-in is not wired up in this build \u2014 it needs a `
        + 'developer account and a server to verify the token. This account was '
        + 'made locally instead, so it is kept on this device but cannot be '
        + 'carried to another one.';
  } else {
    note.textContent = `Signed in with ${provider}. Signing in again on another `
      + 'device, or after a reinstall, finds this same account.';
  }
  document.getElementById('acc-signout').onclick = () => {
    audio.click();
    account.signOut();
    gateNote();
    show('gate');
  };
  show('account');
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
  onOpenGuns: (side) => openGuns(side),
  onOpenBombers: (side) => openBombers(side),
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
const yardUi = { side: 'ally', index: 0, ag: null };

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
  closeAirGroup();
  yard?.detach();
  show('custom');
}

function sheet(el, heading, rows) {
  // A row with a third entry is one a captain can press: it names the action.
  el.innerHTML = `<h3>${heading}</h3>` + rows.map(([k, v, act]) =>
    `<div class="yard-row${act ? ' act' : ''}"${act ? ` data-act="${act}"` : ''}>`
    + `<span class="k">${k}</span><span class="v">${v}</span></div>`).join('');
  for (const row of el.querySelectorAll('.yard-row.act')) {
    row.onclick = () => { audio.click(); if (row.dataset.act === 'airgroup') openAirGroup(); };
  }
}

// ------------------------------------------------------------- air group --

/**
 * What the carrier embarks, and the panel that sets it.
 *
 * Twelve aircraft in the hangar, split between fighters, dive bombers and
 * torpedo bombers however the captain likes, inside the limits her datasheet
 * carries. The choice is kept in settings and rides the sortie request, so the
 * hulls on her side sail with it and the simulation flies what was actually
 * embarked: torpedo bombers put fish in the water, dive bombers put bombs on
 * the deck, fighters keep the flak off the strike.
 */
const AG_KINDS = ['fighters', 'dive', 'torpedo'];

function airGroupSpec() {
  const id = SHIP_ORDER[(yardUi.index + SHIP_ORDER.length) % SHIP_ORDER.length];
  return SHIP_CLASSES[id]?.planes?.group || null;
}

/** The group as chosen, landed on something legal for this class. */
function currentAirGroup(cls) {
  if (!cls?.planes) return null;
  return normaliseAirGroup(cls, getSettings().airGroup);
}

function openAirGroup() {
  const spec = airGroupSpec();
  if (!spec) return;
  const id = SHIP_ORDER[(yardUi.index + SHIP_ORDER.length) % SHIP_ORDER.length];
  yardUi.ag = { ...currentAirGroup(SHIP_CLASSES[id]) };
  document.getElementById('airgroup').hidden = false;
  renderAirGroup();
}

function closeAirGroup() {
  document.getElementById('airgroup').hidden = true;
  yardUi.ag = null;
}

function renderAirGroup() {
  const spec = airGroupSpec();
  const g = yardUi.ag;
  if (!spec || !g) return;
  const total = AG_KINDS.reduce((n, k) => n + g[k], 0);
  const strike = g.dive + g.torpedo;
  document.getElementById('ag-sub').textContent =
    `${spec.total} aircraft in the hangar. Balance them as you like.`;
  for (const k of AG_KINDS) document.getElementById(`ag-n-${k}`).textContent = g[k];
  document.getElementById('ag-total-n').textContent = `${total} / ${spec.total}`;
  document.getElementById('ag-total').classList.toggle('full', total === spec.total);
  // Every stepper says for itself whether it can be pressed, so a captain is
  // never left wondering which limit stopped him.
  for (const btn of document.querySelectorAll('.ag-step')) {
    const k = btn.dataset.kind;
    const d = Number(btn.dataset.step);
    const n = g[k] + d;
    let ok = n >= spec.min[k] && n <= spec.max[k];
    if (ok && d > 0) ok = total < spec.total;
    if (ok && d < 0 && k !== 'fighters') ok = strike - 1 >= spec.minStrike;
    btn.disabled = !ok;
  }
  const note = document.getElementById('ag-note');
  if (total > spec.total) note.textContent = 'More than she has hangar for.';
  else if (strike < spec.minStrike) note.textContent = 'She needs strike aircraft to be worth sending.';
  else if (total < spec.total) note.textContent = `${spec.total - total} spaces empty in the hangar.`;
  else note.textContent = '';
}

function stepAirGroup(kind, d) {
  const spec = airGroupSpec();
  const g = yardUi.ag;
  if (!spec || !g) return;
  const n = g[kind] + d;
  if (n < spec.min[kind] || n > spec.max[kind]) return;
  const total = AG_KINDS.reduce((a, k) => a + g[k], 0);
  if (d > 0 && total >= spec.total) return;
  if (d < 0 && kind !== 'fighters' && g.dive + g.torpedo - 1 < spec.minStrike) return;
  g[kind] = n;
  renderAirGroup();
}

function renderYard() {
  const id = SHIP_ORDER[(yardUi.index + SHIP_ORDER.length) % SHIP_ORDER.length];
  const cls = SHIP_CLASSES[id];
  yard.setShip(id);
  // Her full name and pennant where there is room for it; the short one is what
  // the rosters and the plot use.
  document.getElementById('yard-name').textContent = cls.fullName || cls.name;
  // A ship whose class is not her own name says so: the Big E is a Yorktown,
  // and a datasheet that called her an Enterprise-class carrier would be wrong.
  document.getElementById('yard-class').textContent =
    `${cls.className || cls.name} Class ${cls.typeName}`;
  // The arrows say which ship they go to, so the list can be walked without
  // pressing a chevron nine times to find out what is on the other side of it.
  const at = (d) => SHIP_CLASSES[
    SHIP_ORDER[(yardUi.index + d + SHIP_ORDER.length * 2) % SHIP_ORDER.length]].name;
  const prevName = document.getElementById('yard-prev-name');
  const nextName = document.getElementById('yard-next-name');
  if (prevName) prevName.textContent = at(-1);
  if (nextName) nextName.textContent = at(1);
  const group = currentAirGroup(cls);
  sheet(document.getElementById('yard-hull'), 'Hull', hullSheet(cls, group));
  sheet(document.getElementById('yard-arms'), 'Armament', armsSheet(cls, group));
}

function stepYard(dir) {
  yardUi.index = (yardUi.index + dir + SHIP_ORDER.length) % SHIP_ORDER.length;
  closeAirGroup();
  renderYard();
}

for (const btn of document.querySelectorAll('.ag-step')) {
  btn.onclick = () => { audio.click(); stepAirGroup(btn.dataset.kind, Number(btn.dataset.step)); };
}
document.getElementById('ag-reset').onclick = () => {
  audio.click();
  const spec = airGroupSpec();
  if (spec) { yardUi.ag = { ...spec.default }; renderAirGroup(); }
};
document.getElementById('ag-done').onclick = () => {
  audio.click();
  if (yardUi.ag) setSettings({ airGroup: { ...yardUi.ag } });
  closeAirGroup();
  renderYard();
};

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

// --------------------------------------------------------------- gun park --
// The shipyard's opposite number, and built the same way: one scene, made the
// first time it is asked for, with plain DOM panels over it.

const gunsUi = { side: 'ally', index: 0 };

function openGuns(side) {
  gunsUi.side = side;
  if (!guns) {
    guns = new BatteryScene(renderer);
    guns.resize(window.innerWidth, window.innerHeight);
  }
  guns.attach(document.getElementById('battery-grab'));
  show('guns');
  renderGuns();
}

function closeGuns() {
  guns?.detach();
  show('custom');
}

function renderGuns() {
  const id = BATTERY_ORDER[(gunsUi.index + BATTERY_ORDER.length) % BATTERY_ORDER.length];
  const b = BATTERIES[id];
  guns.setBattery(id);
  document.getElementById('battery-name').textContent = b.name;
  document.getElementById('battery-piece').textContent = b.piece;
  document.getElementById('battery-place').textContent = b.place;
  sheet(document.getElementById('battery-works'), 'Mounting', mountingSheet(b));
  sheet(document.getElementById('battery-guns'), 'Ordnance', ordnanceSheet(b));
}

function stepGuns(dir) {
  gunsUi.index = (gunsUi.index + dir + BATTERY_ORDER.length) % BATTERY_ORDER.length;
  renderGuns();
}

document.getElementById('battery-prev').onclick = () => { audio.click(); stepGuns(-1); };
document.getElementById('battery-next').onclick = () => { audio.click(); stepGuns(1); };
document.getElementById('battery-back').onclick = () => { audio.click(); closeGuns(); };
document.getElementById('battery-emplace').onclick = () => {
  audio.click();
  const id = BATTERY_ORDER[gunsUi.index % BATTERY_ORDER.length];
  const whose = gunsUi.side === 'ally' ? 'your' : 'the enemy';
  if (!briefing.emplace(gunsUi.side, id)) {
    toast(`${FLEET_MAX} batteries is all ${whose} coast will take.`);
    return;
  }
  toast(`${BATTERIES[id].name} goes in on ${whose} shore.`);
  closeGuns();
};

// ------------------------------------------------------------ bomber yard --
// The third of the same screen, and built the same way: one scene, made the
// first time it is asked for, with plain DOM panels over it. What is behind
// them is a heavy over a burning city with her bay open and the flak up --
// which is the only place anybody ever saw one of these from.

const bomberUi = { side: 'ally', index: 0 };

function openBombers(side) {
  bomberUi.side = side;
  if (!bombers) {
    bombers = new BomberScene(renderer);
    bombers.resize(window.innerWidth, window.innerHeight);
  }
  bombers.attach(document.getElementById('bomber-grab'));
  show('bombers');
  renderBombers();
}

function closeBombers() {
  bombers?.detach();
  show('custom');
}

const bomberAt = (i) => BOMBER_ORDER[(i + BOMBER_ORDER.length * 2) % BOMBER_ORDER.length];

function renderBombers() {
  const id = bomberAt(bomberUi.index);
  const b = BOMBERS[id];
  bombers.setBomber(id);
  document.getElementById('bomber-name').textContent = b.name;
  document.getElementById('bomber-mark').textContent = b.fullName;
  document.getElementById('bomber-role').textContent = b.role;
  // Which machine each arrow goes to, said on the arrow, the way the
  // shipyard's arrows say which hull is behind them.
  const peek = (d) => BOMBERS[bomberAt(bomberUi.index + d)].name;
  const prevName = document.getElementById('bomber-prev-name');
  const nextName = document.getElementById('bomber-next-name');
  if (prevName) prevName.textContent = peek(-1);
  if (nextName) nextName.textContent = peek(1);
  sheet(document.getElementById('bomber-airframe'), 'Airframe', airframeSheet(b));
  sheet(document.getElementById('bomber-payload'), 'Payload', payloadSheet(b));
}

function stepBombers(dir) {
  bomberUi.index = (bomberUi.index + dir + BOMBER_ORDER.length) % BOMBER_ORDER.length;
  renderBombers();
}

document.getElementById('bomber-prev').onclick = () => { audio.click(); stepBombers(-1); };
document.getElementById('bomber-next').onclick = () => { audio.click(); stepBombers(1); };
document.getElementById('bomber-back').onclick = () => { audio.click(); closeBombers(); };
document.getElementById('bomber-commission').onclick = () => {
  audio.click();
  const id = bomberAt(bomberUi.index);
  const whose = bomberUi.side === 'ally' ? 'your' : 'the enemy';
  if (!briefing.commissionBomber(bomberUi.side, id)) {
    toast(`${BOMBER_MAX} squadrons is all ${whose} command will find crews for.`);
    return;
  }
  toast(`A squadron of ${BOMBERS[id].name} comes on call for ${whose} side.`);
  closeBombers();
};

// ---------------------------------------------------- the order of battle --

// Sortie no longer sends the fleets straight to sea: it opens a plan of the
// battlefield with a token on it for every hull and every battery, and the
// captain says where each of them starts and which way it faces. The request
// is built once, here, so the chart and the server raise the same world from
// the same numbers.
const layout = new LayoutMap({
  onBack: () => { audio.click(); show('custom'); },
  onGo: (plan) => {
    audio.click();
    fullscreen.enterBattleView(document.documentElement);
    if (!net.connected) { toast('Not connected to the battle service.'); return; }
    net.send({ ...layoutReq, layout: plan });
    toast('Sortieing…');
  },
});
let layoutReq = null;

document.getElementById('custom-start').onclick = () => {
  audio.resume();
  const why = briefing.blocker();
  if (why) { toast(why); return; }
  layoutReq = briefing.request();
  show('lay');
  // The canvas has no box until the screen is up, so the chart is raised on the
  // next frame rather than drawn into a nought-by-nought canvas.
  requestAnimationFrame(() => layout.show(layoutReq));
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

optName.value = settings.name;
optVol.value = settings.volume;
optSens.value = Math.round(settings.sensitivity * 100);
optSkill.value = settings.botSkill;
optQuality.value = settings.quality;
optShadows.checked = settings.shadows;
optShake.checked = settings.shake;
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
  // Building a fleet is the other place the game stops dead for a second or
  // two: every hull in the battle is lofted, plated, welded and dressed here.
  // It goes up behind the loading screen for the same reason the harbour does.
  boot.hold('Building the fleet', () => joinBattle(m));
});

function joinBattle(m) {
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
}

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
// How many frames have thrown, and whether the captain has been told. One bad
// frame used to be the end of the game: the loop asked for the next frame on
// its last line, so anything that threw anywhere in it stopped the loop dead
// and the picture froze with no word about why. It is asked for in a `finally`
// now, so a frame that goes wrong costs a frame.
let frameErrors = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    drawFrame(dt);
  } catch (e) {
    frameErrors++;
    // Once in the console with the whole stack, so it can be fixed; once on
    // the screen, so nobody is left wondering whether the game has hung.
    if (frameErrors === 1) {
      console.error('Steel Currents: a frame failed', e);
      toast('Something went wrong drawing that frame — carrying on.');
    }
  } finally {
    requestAnimationFrame(frame);
  }
}

function drawFrame(dt) {
  if (battle && current === 'battle') {
    battle.update(dt);
    battle.render();
  } else if (current === 'map') {
    // The chart is a 2D canvas that repaints only when something moves, so the
    // scene behind it is left alone while it is up.
    deploy.update();
  } else if (current === 'lay') {
    layout.update();
  } else if (yard && current === 'yard') {
    yard.update(dt);
    yard.render();
  } else if (guns && current === 'guns') {
    guns.update(dt);
    guns.render();
  } else if (bombers && current === 'bombers') {
    bombers.update(dt);
    bombers.render();
  } else if (current === 'custom') {
    // Nothing of the harbour shows through the briefing: its chart covers the
    // screen edge to edge and the fleets are laid over that. Rendering the sea
    // behind it buys a frame nobody can see, and that frame is the one
    // standing between a captain and the chart when he opens it -- the scene
    // is queued several frames deep, and the chart waits for all of them.
    // Nothing here is drawn at less detail; it is simply not drawn twice.
  } else if (title) {
    title.update(dt);
    title.render();
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && current === 'yard') { closeYard(); return; }
  // The gun park and the bomber yard back out to the briefing the same way the
  // shipyard does: a commander who has just looked a battery over wants the
  // order of battle back, not the title screen.
  if (e.code === 'Escape' && current === 'guns') { closeGuns(); return; }
  if (e.code === 'Escape' && current === 'bombers') { closeBombers(); return; }
  // Backing out of the plan goes to the briefing, not to the title screen: the
  // fleets are still there and the captain is one keystroke from another try.
  if (e.code === 'Escape' && current === 'lay') { show('custom'); return; }
  if (e.code === 'Escape' && current !== 'title' && current !== 'battle') show('title');
  // The arrows and the zoom work on whichever of the three yards is up.
  const step = { yard: stepYard, guns: stepGuns, bombers: stepBombers }[current];
  const scene = { yard, guns, bombers }[current];
  if (!step) return;
  if (e.code === 'ArrowLeft') step(-1);
  else if (e.code === 'ArrowRight') step(1);
  else if (e.code === 'Equal' || e.code === 'NumpadAdd') scene?.zoom(-1);
  else if (e.code === 'Minus' || e.code === 'NumpadSubtract') scene?.zoom(1);
});
window.addEventListener('pointerdown', () => audio.resume(), { once: true });

applyQuality();

// Who is at the wheel. An account already on this device goes straight to the
// menu; nobody signed in gets the gate, once, over the burning harbour.
const signedIn = account.current();
if (signedIn?.name) setSettings({ name: signedIn.name });
gateNote();
show(signedIn ? 'title' : 'gate');

net.connect();
requestAnimationFrame(frame);

// The harbour, built behind the loading screen. Two frames of waiting first,
// so the screen the player is looking at is one the browser has actually
// painted rather than one it has merely been told about.
boot.say('Raising the harbour', 0.35);
requestAnimationFrame(() => requestAnimationFrame(() => {
  try {
    title = new TitleScene(renderer);
    // A handle on the title screen, the same as `window.__battle` gives one on
    // a battle. The menu is the heaviest scene in the game and the hardest to
    // reason about from the outside; being able to reach into it from the
    // console is what found the sky.
    window.__title = title;
    resize();
    boot.say('Lighting the fires', 0.8);
    // One more frame so the harbour is drawn under the screen before it lifts,
    // rather than the player watching it appear.
    requestAnimationFrame(() => requestAnimationFrame(() => boot.done()));
  } catch (e) {
    console.error('Steel Currents: the harbour would not build', e);
    boot.el?.classList.add('stuck');
    boot.say('Could not raise the harbour — reload to try again', 1);
  }
}));
