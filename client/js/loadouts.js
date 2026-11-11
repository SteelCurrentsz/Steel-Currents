// Load outs: a battle kept, to be fought again.
//
// A load out is everything a captain set up for a custom battle -- both
// fleets hull by hull with what each embarks, both sides' batteries, tanks and
// bomber squadrons, where it is fought, the hour, the weather and the fog --
// and, when it was saved from the plotting board or after a visit to it,
// where every hull, gun, tank and squadron starts and which way it faces, the
// town and the sea walls, and the barracks and whose they are. Loading one
// puts all of that back and opens the plotting board with it laid out, so
// Sortie fights the same battle again.
//
// Five slots, kept on this device.

import { SHIP_CLASSES } from '../../shared/ships.js';

/** How many load outs a captain can keep. */
export const LOADOUT_SLOTS = 5;

const KEY = 'steel-currents:loadouts';

/** The five slots, each a load out or null. */
export function listLoadouts() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { raw = null; }
  const out = [];
  for (let i = 0; i < LOADOUT_SLOTS; i++) {
    const s = Array.isArray(raw) ? raw[i] : null;
    out.push(s && s.v === 1 && s.briefing ? s : null);
  }
  return out;
}

function store(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Keep a load out in a slot, over whatever was there. False if it could not be kept. */
export function saveLoadout(slot, briefing, plan = null, name = '') {
  if (!(slot >= 0 && slot < LOADOUT_SLOTS)) return false;
  const list = listLoadouts();
  list[slot] = {
    v: 1,
    name: String(name || briefing.deploy?.name || `Load out ${slot + 1}`).slice(0, 40),
    savedAt: Date.now(),
    briefing: JSON.parse(JSON.stringify(briefing)),
    plan: plan ? JSON.parse(JSON.stringify(plan)) : null,
  };
  return store(list);
}

/** Empty a slot. */
export function deleteLoadout(slot) {
  const list = listLoadouts();
  if (!list[slot]) return false;
  list[slot] = null;
  return store(list);
}

/** One line saying what is in a load out. */
export function describeLoadout(s) {
  const b = s.briefing;
  const n = (a) => (Array.isArray(a) ? a.length : 0);
  const flag = SHIP_CLASSES[b.allyFleet?.[0]]?.name;
  const parts = [`${n(b.allyFleet)} v ${n(b.enemyFleet)} ships`];
  const guns = n(b.allyGuns) + n(b.enemyGuns);
  if (guns) parts.push(`${guns} ${guns === 1 ? 'gun or tank' : 'guns & tanks'}`);
  const air = n(b.allyBombers) + n(b.enemyBombers);
  if (air) parts.push(`${air} squadron${air === 1 ? '' : 's'}`);
  const huts = n(s.plan?.barracks);
  if (huts) parts.push(`${huts} barracks`);
  if (!s.plan) parts.push('not laid out');
  return `${flag ? `${flag} · ` : ''}${parts.join(' · ')}`;
}

/**
 * The load out picker: five slots, each saved over, loaded or emptied.
 * `getBriefing` and `getPlan` say what saving would keep right now (the plan
 * may be null); `onLoad(loadout)` is handed the one chosen.
 */
export class LoadoutPanel {
  constructor({ getBriefing, getPlan, onLoad, toast, click } = {}) {
    this.getBriefing = getBriefing;
    this.getPlan = getPlan;
    this.onLoad = onLoad;
    this.toast = toast || (() => {});
    this.click = click || (() => {});
    this.el = document.getElementById('loadout-pick');
    this.list = document.getElementById('loadout-list');
    this.sub = document.getElementById('loadout-sub');
    if (!this.el) return;
    document.getElementById('loadout-cancel')?.addEventListener('click', () => { this.click(); this.close(); });
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    this.list.addEventListener('click', (e) => this.act(e));
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.el.hidden) this.close(); });
    // A save or a delete over something already there asks twice: which slot
    // is waiting on the second press, and what for.
    this.armed = null;
  }

  open(from = 'briefing') {
    if (!this.el) return;
    this.from = from;
    this.armed = null;
    this.sub.textContent = from === 'lay'
      ? 'Save this battle, positions and all, or load one you kept.'
      : 'Save this battle, or load one you kept and fight it again.';
    this.render();
    this.el.hidden = false;
  }

  close() {
    if (this.el) this.el.hidden = true;
    this.armed = null;
  }

  render() {
    const slots = listLoadouts();
    const can = !!this.getBriefing?.()?.allyFleet?.length || !!this.getBriefing?.()?.enemyFleet?.length;
    this.list.innerHTML = slots.map((s, i) => {
      const armed = this.armed && this.armed.slot === i ? this.armed.what : null;
      const when = s ? new Date(s.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
      return `<li class="lo-slot${s ? '' : ' empty'}">
        <div class="lo-info">
          <b>${i + 1}. ${s ? esc(s.name) : 'Empty'}</b>
          <span>${s ? `${esc(describeLoadout(s))} · ${esc(when)}` : 'Nothing saved here'}</span>
        </div>
        <div class="lo-acts">
          <button class="btn ghost${armed === 'save' ? ' on' : ''}" type="button" data-save="${i}"${can ? '' : ' disabled'}>${armed === 'save' ? 'Overwrite?' : 'Save'}</button>
          <button class="btn" type="button" data-load="${i}"${s ? '' : ' disabled'}>Load</button>
          <button class="btn ghost lo-del${armed === 'del' ? ' on' : ''}" type="button" data-del="${i}"${s ? '' : ' disabled'} aria-label="Delete load out ${i + 1}">${armed === 'del' ? 'Delete?' : '&times;'}</button>
        </div>
      </li>`;
    }).join('');
  }

  act(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    this.click();
    const slots = listLoadouts();
    if (b.dataset.save != null) {
      const i = Number(b.dataset.save);
      if (slots[i] && !(this.armed && this.armed.slot === i && this.armed.what === 'save')) {
        this.armed = { slot: i, what: 'save' };
        this.render();
        return;
      }
      const brief = this.getBriefing();
      const ok = saveLoadout(i, brief, this.getPlan?.() || null);
      this.armed = null;
      this.render();
      this.toast(ok ? `Saved to load out ${i + 1}.` : 'This device would not keep it.');
      return;
    }
    if (b.dataset.del != null) {
      const i = Number(b.dataset.del);
      if (!(this.armed && this.armed.slot === i && this.armed.what === 'del')) {
        this.armed = { slot: i, what: 'del' };
        this.render();
        return;
      }
      deleteLoadout(i);
      this.armed = null;
      this.render();
      return;
    }
    if (b.dataset.load != null) {
      const s = slots[Number(b.dataset.load)];
      if (!s) return;
      this.close();
      this.onLoad?.(s);
    }
  }
}

function esc(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
