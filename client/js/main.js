// Boot, screen flow and the single render loop shared by the title scene and
// the battle.

import { letGoBoards } from './render/boardgl.js';
import { GPU, setGpuLevel } from './render/gpusafe.js';
import * as THREE from '../../vendor/three.module.js';
import { TitleScene } from './menu.js';
import { ShipyardScene, hullSheet, armsSheet } from './shipyard.js';
import { loadShips, shipReady, fleetReady, preloadShips } from './render/ships.js';
import { BatteryScene, mountingSheet, ordnanceSheet } from './battery.js';
import { BomberScene } from './bomberyard.js';
import { BATTERIES, BATTERY_ORDER } from '../../shared/batteries.js';
import { BOMBERS, BOMBER_ORDER, airframeSheet, payloadSheet } from '../../shared/bombers.js';
import { Battle } from './game.js';
import { LocalNet } from './localnet.js';
import { ReplayNet } from './replaynet.js';
import { Input } from './input.js';
import { TouchControls, isTouchDevice } from './touch.js';
import * as fullscreen from './fullscreen.js';
import { Briefing, FLEET_MAX, BOMBER_MAX } from './briefing.js';
import { LayoutMap } from './layout.js';
import { ScriptEditor } from './scripteditor.js';
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

// A context the browser has already taken back answers every question about
// itself with null, and three.js's first question -- how precise its shaders
// can be -- then threw on the way in: "null is not an object", and the game
// never started. Safari does this on a page opened while it is short of
// graphics memory, or in a frame that has just let another one go. Asked of a
// lost context, the answer is now the ordinary one, so the renderer can be
// built and the context given back when the browser restores it.
for (const C of [globalThis.WebGL2RenderingContext, globalThis.WebGLRenderingContext]) {
  const ask = C && C.prototype.getShaderPrecisionFormat;
  if (!ask || ask.patched) continue;
  const safe = function (...args) {
    return ask.apply(this, args) || { precision: 23, rangeMin: 127, rangeMax: 127 };
  };
  safe.patched = true;
  C.prototype.getShaderPrecisionFormat = safe;
}

// Lighter graphics on a device whose graphics card has already let the game
// go: a level for every time it has happened (see gpusafe.js for what each
// leaves out), kept for a week from the last time, so the next battle on the
// same iPad does not go the same way -- and then tried again at full quality.
// A new name: what earlier builds stored was put there by a crash that the
// shader it came from no longer has in it, and it left a device drawing at
// half its resolution with no antialiasing -- a pixelated game -- for a week.
const SAFE_KEY = 'steel-currents:gpu-safe-2';
try { localStorage.removeItem('steel-currents:gpu-safe'); } catch { /* private mode */ }
function safeState() {
  try {
    const raw = localStorage.getItem(SAFE_KEY);
    if (!raw) return { t: 0, level: 0 };
    const v = JSON.parse(raw);
    if (!(Date.now() - v.t < 7 * 864e5)) return { t: 0, level: 0 };
    return { t: v.t, level: Math.max(0, Math.min(3, v.level | 0)) };
  } catch { return { t: 0, level: 0 }; }
}
function safeGraphics() { return GPU.level >= 2; }
let steppedAt = 0;
/** One level lighter -- not twice for the one loss -- and remembered. */
function goSafe() {
  const now = Date.now();
  if (now - steppedAt < 10000) return;
  steppedAt = now;
  const level = Math.min(3, GPU.level + 1);
  setGpuLevel(level);
  try { localStorage.setItem(SAFE_KEY, JSON.stringify({ t: now, level })); } catch { /* private mode */ }
  if (level >= 3 && getSettings().quality !== 'low') setSettings({ quality: 'low' });
}
setGpuLevel(safeState().level);

/**
 * A renderer, on a context that is actually there. A canvas whose context
 * has been lost keeps that lost context, so each further try is on a fresh
 * canvas in its place, asking for less each time.
 */
function makeRenderer(at = document.getElementById('stage')) {
  const asks = safeGraphics()
    ? [{ antialias: false }, { antialias: false, powerPreference: 'low-power' }]
    : [
      { antialias: true, powerPreference: 'high-performance' },
      { antialias: false },
      { antialias: false, powerPreference: 'low-power' },
    ];
  let made = null;
  for (let i = 0; i < asks.length; i++) {
    try {
      made = new THREE.WebGLRenderer({ canvas: at, ...asks[i] });
      const gl = made.getContext();
      if (gl && !gl.isContextLost()) return made;
    } catch (e) {
      console.error('Steel Currents: renderer', e);
    }
    if (i === asks.length - 1) break;
    try { made && made.dispose(); } catch {}
    at = freshCanvas(at);
  }
  // Nothing better on offer: the last one, which three.js restores when the
  // browser gives the context back.
  if (made) return made;
  try { return new THREE.WebGLRenderer({ canvas: at, antialias: false }); } catch { return null; }
}

/** A new canvas in the old one's place, with its id and its classes. */
function freshCanvas(old) {
  const fresh = old.cloneNode(false);
  old.replaceWith(fresh);
  return fresh;
}

// The renderer every screen is handed is this, and not the WebGL renderer
// itself: a stand-in that passes everything on to whichever renderer is
// current. When the graphics card takes the battle's context back and the
// browser does not give it back -- an iPad, often, and then the battle is a
// black screen under the HUD for good -- a new renderer is built on a new
// canvas and put behind the stand-in, and every screen goes on drawing
// through the same object it always had. Everything it draws is sent to the
// new context again the first time it is drawn there.
/**
 * Whether the browser will give this page a graphics context that works.
 *
 * An iPad whose graphics went down a moment ago -- in this page or another --
 * hands out contexts that are already lost for a while afterwards, and every
 * question asked of one is answered with null. The renderer cannot be built
 * on that: it is the "null is not an object" that stopped the game on the
 * start screen. So it is asked first, on a canvas of its own that is given
 * straight back.
 */
function graphicsUp() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const up = !!gl && !gl.isContextLost();
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return up;
  } catch { return false; }
}

/**
 * Wait for the graphics to come back, saying so, and start again when they do.
 * Not a reload loop: after a few tries in a couple of minutes it stops and
 * says what will help.
 */
function waitForGraphics() {
  globalThis.__waitingForGraphics = true;
  const say = (msg) => {
    const el = document.getElementById('boot');
    el?.classList.remove('gone', 'done');
    el?.classList.add('stuck');
    const t = document.getElementById('boot-say');
    if (t) t.textContent = msg;
  };
  let tries = [];
  try { tries = JSON.parse(sessionStorage.getItem('steel-currents:gpu-wait') || '[]'); } catch { /* none */ }
  tries = tries.filter((t) => Date.now() - t < 120000);
  if (tries.length >= 4) {
    say('The graphics have not come back. Close the browser completely (swipe it away in the app '
      + 'switcher) and open it again, then reopen the game.');
    return;
  }
  say('Waiting for the graphics to recover\u2026');
  // A browser that has had its graphics go down under a page more than once
  // stops giving that page working graphics at all until it is closed and
  // opened again -- Safari does, and so does every browser on an iPad, which
  // is Safari underneath. Waiting will not bring them back, so after a little
  // while the captain is told what will.
  const began = Date.now();
  const poll = setInterval(() => {
    if (Date.now() - began > 15000) {
      say('The browser has switched off 3D graphics for this page. Close the browser completely '
        + '(swipe it away in the app switcher) and open it again, then reopen the game.');
    }
    if (!graphicsUp()) return;
    clearInterval(poll);
    tries.push(Date.now());
    try { sessionStorage.setItem('steel-currents:gpu-wait', JSON.stringify(tries)); } catch { /* private */ }
    location.reload();
  }, 1000);
}

if (!graphicsUp()) {
  waitForGraphics();
  // Nothing below can run without a context. (The boot screen's own error
  // handler knows this one and says nothing over the message above.)
  throw new Error('Steel Currents: waiting for the graphics to recover');
}

let real = makeRenderer();
if (!real || real.getContext().isContextLost()) {
  waitForGraphics();
  throw new Error('Steel Currents: waiting for the graphics to recover');
}
const bound = new Map();
const renderer = new Proxy({}, {
  get(_, k) {
    const v = real[k];
    if (typeof v !== 'function') return v;
    let f = bound.get(k);
    if (!f || f.of !== real) { f = v.bind(real); f.of = real; bound.set(k, f); }
    return f;
  },
  set(_, k, v) { real[k] = v; return true; },
  has(_, k) { return k in real; },
});
let canvas = real.domElement;
renderer.setClearColor(0x050c16);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

// Every battle is hosted here, in the tab: the simulation, the bot captains
// and the room they fight in all run on this device, so the game plays with
// no connection at all -- in an aeroplane, at sea, with the wifi off. The
// battle service is for other human captains, and the one mode that will need
// it is Multiplayer Battle, which is not in the game yet; when it is, it gets
// a socket of its own (net.js) for that mode alone.
const net = new LocalNet();

/**
 * The classes a battle about to be joined can have in it. A custom battle
 * names every hull on both sides, so only those are waited for -- not the
 * forty megabytes of every ship in the game. A battle that fills itself with
 * bots of no particular class could have any of them.
 */
function fleetOf(m) {
  if (m.t === 'custom') {
    const allies = Array.isArray(m.allyClasses) ? m.allyClasses : null;
    const enemies = Array.isArray(m.enemyClasses) ? m.enemyClasses : null;
    const named = allies && enemies
      && (m.allies == null || m.allies <= allies.length)
      && (m.enemies == null || m.enemies <= enemies.length);
    if (named) return [...new Set([m.classId, ...allies, ...enemies].filter(Boolean))];
  }
  return SHIP_ORDER;
}
// Every battle a captain starts carries his friendly fire setting with it.
// And none is joined until every ship that could be in it has been fetched
// (see loadShips): the room starts the moment it is joined, and a fleet that
// cannot be drawn yet would leave the captain watching a battle he is not in.
{
  const send = net.send.bind(net);
  net.send = (m) => {
    if (!(m && (m.t === 'quickmatch' || m.t === 'custom' || m.t === 'joinRoom'))) return send(m);
    const go = () => send({ ...m, ff: getSettings().friendlyFire === true });
    const need = fleetOf(m);
    if (fleetReady(need)) return go();
    boot.show('Bringing up the fleet');
    loadShips(need, (n, of) => boot.say('Bringing up the fleet', 0.06 + 0.84 * (n / of)))
      .then(go, (e) => {
        console.error('Steel Currents: the fleet would not load', e);
        boot.done();
        toast('The fleet could not be fetched. Check the connection and try again.');
      });
  };
}
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
  governor.base = Math.min(window.devicePixelRatio || 1, q.pixelRatio, GPU.level >= 3 ? 1 : Infinity);
  governor.scale = 1;
  renderer.setPixelRatio(governor.base);
  resize();
}

// The resolution governor.
//
// Everything that makes a frame -- the hulls, their fittings, the sea, the
// weather, the smoke -- is drawn at the detail the quality setting asks for,
// always. What gives, when a frame is taking too long, is how many pixels it
// is drawn into: a phone's GPU is bound by how many it has to fill, and a few
// fewer of them on a small, dense screen is the one saving nobody can see.
// It comes back up as soon as there is time for it.
const governor = {
  base: 1, scale: 1, ema: 1 / 60, wait: 0, calm: 0,
  // Never fewer than three drawn pixels for every four on the screen.
  floor: 0.75,
};
function govern(interval) {
  const g = governor;
  if (current !== 'battle') {
    if (g.scale !== 1) setRenderScale(1);
    g.ema = 1 / 60;
    return;
  }
  // A frame that took a quarter of a second was a stall -- a tab switch, a
  // garbage collection -- not the steady cost of drawing.
  g.ema += (Math.min(interval, 0.1) - g.ema) * 0.06;
  if (g.wait > 0) { g.wait -= interval; return; }
  const least = Math.min(1, g.floor / Math.max(0.01, g.base));
  if (g.ema > 1 / 48 && g.scale > least + 1e-3) {
    setRenderScale(Math.max(least, g.scale * 0.9));
    g.wait = 1.0;
    g.calm = 0;
  } else if (g.ema < 1 / 57 && g.scale < 1) {
    g.calm += interval;
    if (g.calm > 3) {
      setRenderScale(Math.min(1, g.scale * 1.06));
      g.wait = 1.5;
      g.calm = 0;
    }
  } else {
    g.calm = 0;
  }
}
function setRenderScale(k) {
  governor.scale = k;
  renderer.setPixelRatio(governor.base * k);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
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
let rebuildTimer = 0;
function watchContext(c) {
  c.addEventListener('webglcontextlost', (e) => {
    // Without this the context is never restored.
    e.preventDefault();
    letGoBoards();
    goSafe();
    toast('The graphics card dropped the picture — putting it back.');
    // Given back by the browser, three.js picks it up again by itself (see
    // below). Not given back in a moment, it is built again from nothing.
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(rebuild, 1500);
  }, false);
  c.addEventListener('webglcontextrestored', () => {
    clearTimeout(rebuildTimer);
    applyQuality();
    toast('Picture restored.');
  }, false);
}
watchContext(canvas);

/** A new renderer on a new canvas, set up as the old one was, behind the stand-in. */
function rebuild() {
  const old = real;
  if (!old.getContext().isContextLost()) return;
  const size = old.getSize(new THREE.Vector2());
  const clear = old.getClearColor(new THREE.Color());
  const alpha = old.getClearAlpha();
  const keep = {
    outputColorSpace: old.outputColorSpace, toneMapping: old.toneMapping,
    toneMappingExposure: old.toneMappingExposure, autoClear: old.autoClear,
    autoClearColor: old.autoClearColor, autoClearDepth: old.autoClearDepth,
    autoClearStencil: old.autoClearStencil, sortObjects: old.sortObjects,
    localClippingEnabled: old.localClippingEnabled,
  };
  const fresh = makeRenderer(freshCanvas(old.domElement));
  if (!fresh || fresh.getContext().isContextLost()) {
    // Still nothing: try again shortly rather than give up on the battle.
    rebuildTimer = setTimeout(rebuild, 3000);
    try { fresh && fresh.dispose(); } catch { /* gone */ }
    return;
  }
  try { old.dispose(); } catch { /* gone */ }
  Object.assign(fresh, keep);
  fresh.setClearColor(clear, alpha);
  real = fresh;
  bound.clear();
  canvas = fresh.domElement;
  input.canvas = canvas;
  watchContext(canvas);
  // Lighter from here on: see safeGraphics.
  applyQuality();
  resize();
  if (battle && battle.scene && battle.scene.cutWarm) battle.scene.cutWarm = null;
  toast(`Picture rebuilt — graphics lightened to keep it (level ${GPU.level} of 3).`);
}

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
      // The custom briefing under the staged battle's name: see Briefing.setMode.
      case 'pvp': briefing.setMode('staged'); show('custom'); briefing.show(); break;
      // Other human captains, which is the one thing that needs a connection
      // and the one mode not in the game yet. Everything else plays offline.
      case 'multiplayer':
        toast('Multiplayer Battle is coming soon, and will need a connection. Every other battle plays offline.');
        break;
      // The custom briefing, under arcade rules: see Briefing.setMode.
      case 'arcade': briefing.setMode('arcade'); show('custom'); briefing.show(); break;
      case 'custom': briefing.setMode('custom'); show('custom'); briefing.show(); break;
      case 'options': show('options'); break;
      case 'premium': toast('Premium Equipment — coming soon'); break;
      case 'back': show('title'); break;
      case 'account': openAccount(); break;
      default: break;
    }
  });
});

/**
 * The lobby. It is the staged battle: a side each, the bots crewing every
 * other hull, hosted on this device -- so it never lists anybody else's
 * battles, because there is no service it asks. See index.html for its copy.
 */
function pvpScreen() {}

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
  onEditWing: (side, i) => openRefit(side, i),
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
// `refit` is set while the yard is open on one hull already in a fleet --
// which side, and which of its hulls -- to change her air group and nothing
// else; null while it is open to commission something new.
const yardUi = { side: 'ally', index: 0, ag: null, refit: null };

function openYard(side) {
  yardUi.side = side;
  if (!yard) {
    yard = new ShipyardScene(renderer);
    yard.resize(window.innerWidth, window.innerHeight);
    // A handle for the console, the same as `window.__battle` gives one on a
    // battle: the yard is where a hull is looked at, and looking at one from a
    // bearing you have chosen is most of what anybody does here.
    window.__yard = yard;
  }
  yard.attach(document.getElementById('yard-grab'));
  show('yard');
  renderYard();
}

function closeYard() {
  closeAirGroup();
  yardUi.refit = null;
  yard?.detach();
  show('custom');
}

/**
 * One carrier already in a fleet, back in the yard to have her air group
 * changed: hers alone, so a second hull of the same class keeps her own.
 */
function openRefit(side, i) {
  const id = briefing.state[side === 'ally' ? 'allyFleet' : 'enemyFleet'][i];
  const at = SHIP_ORDER.indexOf(id);
  if (at < 0 || !SHIP_CLASSES[id]?.planes?.group) return;
  audio.click();
  yardUi.index = at;
  openYard(side);
  yardUi.refit = { side, i, id };
  renderYard();
  openAirGroup();
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
 * Her whole hangar, split between fighters, dive bombers and torpedo
 * bombers however the captain likes: all of one type, none of another, or
 * anything between. The choice is kept in settings and rides the sortie request, so the
 * hulls on her side sail with it and the simulation flies what was actually
 * embarked: torpedo bombers put fish in the water, dive bombers put bombs on
 * the deck, fighters keep the flak off the strike.
 */
const AG_KINDS = ['fighters', 'dive', 'torpedo'];

function airGroupSpec() {
  const id = SHIP_ORDER[(yardUi.index + SHIP_ORDER.length) % SHIP_ORDER.length];
  return SHIP_CLASSES[id]?.planes?.group || null;
}

/**
 * The group as chosen, landed on something legal for this class: the hull's
 * own while one is being refitted, and otherwise whatever the next carrier
 * commissioned will embark.
 */
function currentAirGroup(cls) {
  if (!cls?.planes) return null;
  const r = yardUi.refit;
  if (r && SHIP_CLASSES[r.id] === cls) {
    return normaliseAirGroup(cls, briefing.wingOf(r.side, r.i) || getSettings().airGroup);
  }
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
    `${spec.total} aircraft in the hangar. Any mix you like, all of one kind or none of another.`;
  // What she actually flies in each role: a Shinano's fighters are Zeros.
  const id = SHIP_ORDER[(yardUi.index + SHIP_ORDER.length) % SHIP_ORDER.length];
  const types = SHIP_CLASSES[id]?.planes?.types || {};
  const NAMES = {
    zero: 'Zero', suisei: 'Suisei', b5n: 'B5N',
    wildcat: 'Wildcat', dauntless: 'Dauntless', avenger: 'Avenger',
  };
  const ROLES = { fighters: ['fighter', 'Wildcat', 'escort'], dive: ['dive', 'Dauntless', 'bombs'],
    torpedo: ['torpedo', 'Avenger', 'torpedoes'] };
  for (const k of AG_KINDS) {
    const [role, fallback, job] = ROLES[k];
    const em = document.querySelector(`.ag-row[data-kind="${k}"] em`);
    if (em) em.textContent = `${NAMES[types[role]] || fallback} \u2014 ${job}`;
  }
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
  // A hull still coming down the wire: the one on the water stays there until
  // she is in, unless the captain has walked on past her by then.
  if (shipReady(id)) yard.setShip(id);
  else {
    loadShips([id]).then(() => {
      if (yard && SHIP_ORDER[(yardUi.index + SHIP_ORDER.length) % SHIP_ORDER.length] === id) yard.setShip(id);
    }, () => toast('That ship could not be fetched. Check the connection and try again.'));
  }
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
  // Walking on to another class is not refitting the one she came in for.
  yardUi.refit = null;
  yardUi.index = (yardUi.index + dir + SHIP_ORDER.length) % SHIP_ORDER.length;
  closeAirGroup();
  renderYard();
}

// Eighty aircraft is a lot of presses one at a time, so a stepper held down
// keeps stepping, and quicker the longer it is held.
for (const btn of document.querySelectorAll('.ag-step')) {
  let timer = null;
  let held = 0;
  const step = () => stepAirGroup(btn.dataset.kind, Number(btn.dataset.step));
  const stop = () => { clearTimeout(timer); timer = null; };
  const repeat = () => {
    held++;
    step();
    if (btn.disabled) { stop(); return; }
    timer = setTimeout(repeat, held < 6 ? 140 : 50);
  };
  btn.onpointerdown = (e) => {
    if (btn.disabled) return;
    e.preventDefault();
    audio.click();
    held = 0;
    step();
    stop();
    timer = setTimeout(repeat, 380);
  };
  btn.onpointerup = stop;
  btn.onpointerleave = stop;
  btn.onpointercancel = stop;
  // The keyboard still gets one step a press.
  btn.onclick = (e) => { if (e.detail === 0) { audio.click(); step(); } };
}
document.getElementById('ag-reset').onclick = () => {
  audio.click();
  const spec = airGroupSpec();
  if (spec) { yardUi.ag = { ...spec.default }; renderAirGroup(); }
};
document.getElementById('ag-done').onclick = () => {
  audio.click();
  // A refit is that one hull's and nobody else's: it goes on her, and the
  // captain goes back to the chart he came from.
  const r = yardUi.refit;
  if (r) {
    if (yardUi.ag) briefing.setWing(r.side, r.i, yardUi.ag);
    const name = SHIP_CLASSES[r.id]?.name || 'She';
    closeYard();
    toast(`${name}'s air group is changed.`);
    return;
  }
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
  // A carrier goes with the air group the yard has her balanced at, and keeps
  // it: the next one commissioned can be given a different one.
  if (yardUi.refit) { yardUi.refit = null; }
  const wing = SHIP_CLASSES[id]?.planes?.group ? currentAirGroup(SHIP_CLASSES[id]) : null;
  if (!briefing.commission(yardUi.side, id, wing)) {
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
  // A handle on the scene, the same as the bomber yard's.
  window.__guns = guns;
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
  // A handle on the scene, so the run can be looked at from outside while it
  // is going on -- which is the only way to check that the doors are open
  // before a bomb moves.
  window.__bomberScene = bombers;
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
  // A new machine is a new model, so her skin goes back on: the key says what
  // is actually on the glass rather than what the last one was showing.
  const cut = document.getElementById('bomber-cutaway');
  cut.setAttribute('aria-pressed', 'false');
  bombers.setCutaway(false);
}

function stepBombers(dir) {
  bomberUi.index = (bomberUi.index + dir + BOMBER_ORDER.length) % BOMBER_ORDER.length;
  renderBombers();
}

document.getElementById('bomber-prev').onclick = () => { audio.click(); stepBombers(-1); };
document.getElementById('bomber-next').onclick = () => { audio.click(); stepBombers(1); };
document.getElementById('bomber-back').onclick = () => { audio.click(); closeBombers(); };
document.getElementById('bomber-cutaway').onclick = (e) => {
  audio.click();
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', on ? 'true' : 'false');
  bombers?.setCutaway(on);
};
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
    // A staged battle takes its script with it.
    const script = layoutReq.staged ? scriptEditor.result() : undefined;
    net.send({ ...layoutReq, layout: plan, script });
    toast(layoutReq.staged ? 'Places, everyone…' : 'Sortieing…');
  },
});
let layoutReq = null;
const scriptEditor = new ScriptEditor(layout);
window.__script = scriptEditor;   // a handle for the console, like __battle
document.getElementById('lay-mode')?.addEventListener('click', () => {
  audio.click();
  scriptEditor.setActive(!scriptEditor.active);
});

document.getElementById('custom-start').onclick = () => {
  audio.resume();
  const why = briefing.blocker();
  if (why) { toast(why); return; }
  layoutReq = briefing.request();
  scriptEditor.enable(!!layoutReq.staged);
  show('lay');
  // The canvas has no box until the screen is up, so the chart is raised on the
  // next frame rather than drawn into a nought-by-nought canvas.
  requestAnimationFrame(() => layout.show(layoutReq));
};

document.getElementById('pvp-quick').onclick = () => {
  audio.resume();
  fullscreen.enterBattleView(document.documentElement);
  net.send({ t: 'quickmatch', name: getSettings().name, classId: getSettings().ship });
  toast('Putting to sea…');
};

// ---------------------------------------------------------------- options --

const optName = document.getElementById('opt-name');
const optVol = document.getElementById('opt-volume');
const optSens = document.getElementById('opt-sens');
const optSkill = document.getElementById('opt-skill');
const optQuality = document.getElementById('opt-quality');
const optShadows = document.getElementById('opt-shadows');
const optRecoil = document.getElementById('opt-recoil');
const optPenCam = document.getElementById('opt-pencam');
const optFF = document.getElementById('opt-ff');
const optAlerts = document.getElementById('opt-alerts');
const optVoices = document.getElementById('opt-voices');

optName.value = settings.name;
optVol.value = settings.volume;
optSens.value = Math.round(settings.sensitivity * 100);
optSkill.value = settings.botSkill;
optQuality.value = settings.quality;
optShadows.checked = settings.shadows;
optRecoil.checked = settings.recoil;
if (optPenCam) optPenCam.checked = settings.penCam !== false;
if (optFF) optFF.checked = settings.friendlyFire === true;
if (optAlerts) optAlerts.checked = settings.alerts !== false;
if (optVoices) optVoices.checked = settings.voices !== false;
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
optRecoil.onchange = () => setSettings({ recoil: optRecoil.checked });
if (optVoices) optVoices.onchange = () => setSettings({ voices: optVoices.checked });
if (optPenCam) optPenCam.onchange = () => setSettings({ penCam: optPenCam.checked });
if (optAlerts) optAlerts.onchange = () => {
  setSettings({ alerts: optAlerts.checked });
  if (!optAlerts.checked) document.getElementById('alerts')?.replaceChildren();
};
if (optFF) optFF.onchange = () => { setSettings({ friendlyFire: optFF.checked }); toast(optFF.checked ? 'Friendly fire on from the next battle.' : 'Friendly fire off from the next battle.'); };

// ------------------------------------------------------------------- net --

// Every battle is hosted on this device, so there is no link whose state could
// be worth reporting: the line that used to say whether the battle service was
// up is taken off the title screen.
document.getElementById('net-state')?.remove();

net.on('error', (m) => toast(m.msg || 'The signal was refused.'));

net.on('joined', (m) => {
  // Building a fleet is the other place the game stops dead for a second or
  // two: every hull in the battle is lofted, plated, welded and dressed here.
  // It goes up behind the loading screen for the same reason the harbour does.
  boot.hold('Building the fleet', () => joinBattle(m));
});

function joinBattle(m, replay = null) {
  if (battle) { battle.dispose(); battle = null; }
  battle = new Battle({
    renderer, net: replay || net, input,
    world: m.world,
    shipId: m.shipId,
    team: m.team,
    classId: getSettings().ship,
    roster: m.roster,
    mode: m.mode,
    // A staged battle is watched from the director's chair, and so is every
    // replay. See director.js.
    director: !!m.director || !!replay,
    stage: m.stage || null,
    replay,
    title: replay ? `Replay · ${replay.rec.title}` : 'Staged Battle',
    onExit: (result) => (replay ? endReplay(replay) : endBattle(result)),
  });
  window.__battle = battle;   // handy handle for debugging in the console
  window.__audio = audio;
  show('battle');
  input.enabled = true;
  resize();
  // Every material in the battle compiled now, behind the first second of
  // it, rather than the first time each one comes into view -- which was a
  // hitch every time a new class of ship, or a fire, or a squadron did.
  const warm = battle;
  setTimeout(() => {
    if (battle !== warm || !warm.scene) return;
    try {
      const done = renderer.compileAsync
        ? renderer.compileAsync(warm.scene.scene, warm.scene.camera)
        : renderer.compile(warm.scene.scene, warm.scene.camera);
      done?.catch?.(() => {});
    } catch { /* a warm-up that fails costs nothing but the warm-up */ }
  }, 600);
  audio.resume();
  if (replay) replay.play();
  else toast(m.director ? 'Action' : 'Battle stations');
}

// ---------------------------------------------------------------- replay --
//
// Every battle is recorded as it is fought (see LocalNet.record), and the
// result screen offers it back: the whole action from the director's chair,
// slowed, stopped, wound back and filmed from wherever the camera is wanted.

let lastResult = null;

function startReplay() {
  const rec = net.recording;
  if (!rec || !rec.frames.length) { toast('There is nothing recorded to replay.'); return; }
  const replay = new ReplayNet(rec);
  fullscreen.enterBattleView(document.documentElement);
  boot.hold('Setting the scene', () => joinBattle(rec.joined, replay));
  if (rec.full) toast('The recording ran out of room before the end of the battle.');
}

function endReplay(replay) {
  replay.stop();
  if (battle) { battle.dispose(); battle = null; }
  if (lastResult && lastResult.roster) show('result');
  else show('title');
}

document.getElementById('result-replay')?.addEventListener('click', () => {
  audio.click();
  startReplay();
});

net.on('start', () => toast('Enemy fleet sighted'));
net.on('countdown', (m) => { if (m.s > 0 && m.s <= 10) toast(`Battle begins in ${m.s}…`); });

function endBattle(result) {
  if (battle) { battle.dispose(); battle = null; }
  lastResult = result;
  // The replay is offered whenever there is a battle on record to play,
  // whether it was fought to a finish or left half way.
  const replayKey = document.getElementById('result-replay');
  if (replayKey) replayKey.hidden = !(net.recording && net.recording.frames.length);
  if (!(result && result.roster) && net.recording && net.recording.frames.length) {
    document.getElementById('result-title').textContent = 'Battle over';
    document.getElementById('result-sub').textContent = 'Left before the end.';
    document.getElementById('result-table').innerHTML = '';
    show('result');
    return;
  }
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

// ------------------------------------------------------------------ loop --

let last = performance.now();
// How many frames have thrown, and whether the captain has been told. One bad
// frame used to be the end of the game: the loop asked for the next frame on
// its last line, so anything that threw anywhere in it stopped the loop dead
// and the picture froze with no word about why. It is asked for in a `finally`
// now, so a frame that goes wrong costs a frame.
let frameErrors = 0;
function frame(now) {
  const interval = (now - last) / 1000;
  const dt = Math.min(0.05, interval);
  last = now;
  govern(interval);
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
    requestAnimationFrame(() => requestAnimationFrame(() => {
      boot.done();
      // The sculpted ships, fetched behind the title screen so the shipyard
      // and the first battle find them already here. A failure is left for
      // whichever of those asks next, which tries again.
      setTimeout(() => preloadShips(), 300);
    }));
  } catch (e) {
    console.error('Steel Currents: the harbour would not build', e);
    boot.el?.classList.add('stuck');
    boot.say('Could not raise the harbour — reload to try again', 1);
  }
}));
