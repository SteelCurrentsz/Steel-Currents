// The director's script, written on the order-of-battle chart.
//
// A staged battle is laid out on the same chart as any other -- every hull put
// where she starts -- and then scripted on it. A scrubber runs the chart
// through the scene: every ship moves to where the script will have her at
// that moment, so the director writes "at 2:10 the Yamato's magazine goes up"
// looking at where the Yamato is at 2:10 and who is in range of her. A ship is
// picked off the chart and given her orders; the camera is given its shots
// the same way.
//
// The script itself is described in shared/stage.js and carried out by
// server/stage.js. Nothing here talks to a room: it hands the script to the
// briefing's request when the director calls Action.

import {
  CUES, SHOTS, VIEWS, unitKey, cleanScript, clockOf, previewAt, STAGE_MAX_T,
} from '../../shared/stage.js';
import { audio } from './audio.js';

const STORE = 'steel-currents.stage-script';
const NOTCHES = ['Astern', 'Stop', 'Slow', 'Half', '¾', 'Full'];
const PREFIX = { ship: 's', gun: 'g', air: 'b' };
const TEAM_LINE = ['rgba(140, 194, 255, 0.85)', 'rgba(255, 169, 162, 0.85)'];

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The script a director wrote last, kept on this device between visits. */
function loadScript() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    return raw && Array.isArray(raw.cues) ? raw : null;
  } catch { return null; }
}

export class ScriptEditor {
  constructor(layout) {
    this.layout = layout;
    this.panel = document.getElementById('script-panel');
    this.screen = document.getElementById('screen-lay');
    this.active = false;
    this.enabled = false;
    const saved = loadScript();
    this.script = { cues: saved?.cues || [], shots: saved?.shots || [] };
    this.script.cues.sort((a, b) => a.t - b.t);
    this.script.shots.sort((a, b) => a.t - b.t);
    this.length = Math.max(300, saved?.length || 300);
    this.t = 0;
    this.tab = 'orders';
    this.sel = null;          // the unit key picked off the chart
    this.mode = null;         // { kind: 'path'|'target'|'place'|'aim', ... }
    this.view = 'quarter';
    this.glide = 0;
    this.spin = 0;
    this.camY = 40;
    this.cache = null;
    layout.director = this;
  }

  // ---------------------------------------------------------- on and off --

  /** Offered on a staged battle's chart and nowhere else. */
  enable(on) {
    this.enabled = !!on;
    if (!on) this.setActive(false);
    const key = document.getElementById('lay-mode');
    if (key) key.hidden = !on;
    const go = document.getElementById('lay-go');
    if (go) go.textContent = on ? 'Action!' : 'Sortie';
  }

  setActive(on) {
    this.active = !!on && this.enabled;
    this.mode = null;
    this.screen?.classList.toggle('scripting', this.active);
    if (this.panel) this.panel.hidden = !this.active;
    const key = document.getElementById('lay-mode');
    if (key) key.textContent = this.active ? 'Positions' : 'Script';
    const auto = document.getElementById('lay-auto');
    if (auto) auto.hidden = this.active;
    this.cache = null;
    this.render();
    // The chart has just changed size to make room for the panel, or been
    // given the screen back: the fleets are framed in what it has now.
    this.layout._size = null;
    this.layout.frameAll();
    this.layout.dirty = true;
  }

  // ------------------------------------------------------------- the cast --

  /** Every unit on the chart, under the name the script calls it by. */
  units() {
    return this.layout.tokens.map((t) => ({
      key: unitKey(PREFIX[t.kind] || 's', t.team, t.index),
      tok: t,
      kind: t.kind,
      classId: t.classId,
      team: t.team,
      x: t.x, z: t.z, heading: t.heading,
    }));
  }

  unit(key) { return this.units().find((u) => u.key === key) || null; }

  nameOf(key) {
    const u = this.unit(key);
    if (!u) return 'nothing';
    return `${u.tok.name}${u.team === 0 ? '' : ' (enemy)'}`;
  }

  /** Where the script has every ship at the moment the scrubber is on. */
  preview() {
    const sig = `${this.t}|${this.version || 0}|${this.layout.tokens.map((t) => `${t.x},${t.z},${t.heading}`).join(';')}`;
    if (this.cache && this.cache.sig === sig) return this.cache.at;
    const ships = this.units().filter((u) => u.kind === 'ship');
    const at = previewAt(ships, this.script, this.t);
    this.cache = { sig, at };
    return at;
  }

  /** The tokens as the chart draws them while scripting: where they will be. */
  shown() {
    if (!this.active) return null;
    const at = this.preview();
    return this.units().map((u) => {
      const p = at.get(u.key);
      return {
        ...u.tok,
        key: u.key,
        x: p ? p.x : u.tok.x,
        z: p ? p.z : u.tok.z,
        heading: p ? p.heading : u.tok.heading,
        ok: true,
        gone: !!(p && p.gone),
        picked: u.key === this.sel,
        noHandle: true,
      };
    });
  }

  // ------------------------------------------------------------ the chart --

  /** A token tapped. Returns whether the tap was the editor's. */
  pick(tok) {
    if (!this.active) return false;
    const key = tok.key;
    const m = this.mode;
    if (m && m.kind === 'target') {
      if (key === m.cue.u) return true;
      this.add({ ...m.cue, at: key });
      this.mode = null;
      this.render();
      return true;
    }
    if (m && m.kind === 'aim') {
      m.shot.look = key;
      this.addShot(m.shot);
      this.mode = null;
      this.render();
      return true;
    }
    if (m && m.kind === 'path') {
      // Steering for a ship is steering for where she is now.
      m.pts.push({ x: Math.round(tok.x), z: Math.round(tok.z) });
      this.dirty();
      return true;
    }
    if (m && m.kind === 'place') {
      // A camera put down on a ship stands where she is at this moment.
      this.tapSea({ x: tok.x, z: tok.z });
      return true;
    }
    this.sel = key;
    audio.click();
    this.render();
    this.dirty();
    return true;
  }

  /** The sea tapped, at a point on the battlefield. */
  tapSea(w) {
    if (!this.active) return;
    const m = this.mode;
    const H = this.layout.half;
    const x = Math.round(Math.max(-H, Math.min(H, w.x)));
    const z = Math.round(Math.max(-H, Math.min(H, w.z)));
    if (m && m.kind === 'path') {
      if (m.pts.length < 24) m.pts.push({ x, z });
      this.render();
      this.dirty();
    } else if (m && m.kind === 'place') {
      this.mode = { kind: 'aim', shot: { t: this.t, k: 'fixed', x, z, y: this.camY, glide: this.glide, fov: 50 } };
      this.render();
      this.dirty();
    } else if (m && m.kind === 'aim') {
      m.shot.lx = x;
      m.shot.lz = z;
      this.addShot(m.shot);
      this.mode = null;
      this.render();
    } else if (this.sel) {
      this.sel = null;
      this.render();
      this.dirty();
    }
  }

  hint() {
    const m = this.mode;
    if (m?.kind === 'path') return `Tap the chart to lay ${this.nameOf(m.cue.u)}'s course — ${m.pts.length} point${m.pts.length === 1 ? '' : 's'}. Done when she has it.`;
    if (m?.kind === 'target') return `Tap the ship ${this.nameOf(m.cue.u)} is to ${CUES[m.cue.a].label.toLowerCase()}.`;
    if (m?.kind === 'place') return 'Tap the chart where the camera stands.';
    if (m?.kind === 'aim') return 'Tap a ship for the camera to watch, or a point of sea to look at.';
    if (this.tab === 'camera') return 'Scrub to a moment, then add a shot. Drag the water to pan.';
    return this.sel ? `Orders for ${this.nameOf(this.sel)} at ${clockOf(this.t)}.` : 'Tap a ship to give her orders. Drag the scrubber to run the scene.';
  }

  dirty() {
    this.layout.dirty = true;
  }

  /** Under the tokens: where every ship has been, and where she is going. */
  under(ctx) {
    if (!this.active) return;
    const L = this.layout;
    const at = this.preview();
    ctx.save();
    ctx.lineWidth = 1.5;
    for (const u of this.units()) {
      const p = at.get(u.key);
      if (!p) continue;
      const mine = u.key === this.sel;
      ctx.strokeStyle = TEAM_LINE[u.team];
      ctx.globalAlpha = mine ? 0.9 : 0.35;
      ctx.beginPath();
      p.track.forEach((q, i) => {
        const s = L.toScreen(q.x, q.z);
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();
      // Every course she will be given, dashed: the selected ship's bright.
      ctx.setLineDash([6, 5]);
      for (const c of this.script.cues) {
        if (c.u !== u.key || c.a !== 'path') continue;
        ctx.globalAlpha = mine ? 0.85 : 0.22;
        ctx.beginPath();
        c.pts.forEach((q, i) => {
          const s = L.toScreen(q.x, q.z);
          if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
        });
        ctx.stroke();
        if (mine) {
          for (const q of c.pts) {
            const s = L.toScreen(q.x, q.z);
            ctx.beginPath();
            ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.setLineDash([]);
    }
    // Who is shooting at whom at this moment.
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#ff7a5c';
    ctx.setLineDash([3, 4]);
    for (const [key, foe] of this.firing()) {
      const a = at.get(key), b = at.get(foe);
      if (!a || !b || a.gone) continue;
      const s0 = L.toScreen(a.x, a.z), s1 = L.toScreen(b.x, b.z);
      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y);
      ctx.lineTo(s1.x, s1.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // The course being laid now.
    const m = this.mode;
    if (m && m.kind === 'path') {
      const from = at.get(m.cue.u);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#e6cf9c';
      ctx.fillStyle = '#e6cf9c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (from) { const s = L.toScreen(from.x, from.z); ctx.moveTo(s.x, s.y); }
      for (const q of m.pts) { const s = L.toScreen(q.x, q.z); ctx.lineTo(s.x, s.y); }
      ctx.stroke();
      for (const q of m.pts) {
        const s = L.toScreen(q.x, q.z);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Over the tokens: the cameras. */
  over(ctx) {
    if (!this.active) return;
    const L = this.layout;
    const at = this.preview();
    ctx.save();
    const live = this.shotAt(this.t);
    const pending = this.mode && this.mode.kind === 'aim' ? [this.mode.shot] : [];
    for (const sh of [...this.script.shots, ...pending]) {
      if (sh.k !== 'fixed') continue;
      const s = L.toScreen(sh.x, sh.z);
      const on = sh === live || pending.includes(sh);
      ctx.globalAlpha = on ? 1 : 0.45;
      let look = null;
      if (sh.look) { const p = at.get(sh.look); if (p) look = L.toScreen(p.x, p.z); }
      else if (Number.isFinite(sh.lx)) look = L.toScreen(sh.lx, sh.lz);
      if (look) {
        ctx.strokeStyle = '#e6cf9c';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(look.x, look.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // A camera, from above: a box and a lens.
      ctx.fillStyle = on ? '#e6cf9c' : 'rgba(230, 207, 156, 0.8)';
      ctx.strokeStyle = '#0a1b2b';
      ctx.lineWidth = 1.5;
      ctx.fillRect(s.x - 7, s.y - 5, 14, 10);
      ctx.strokeRect(s.x - 7, s.y - 5, 14, 10);
      ctx.beginPath();
      ctx.moveTo(s.x + 7, s.y);
      ctx.lineTo(s.x + 12, s.y - 4);
      ctx.lineTo(s.x + 12, s.y + 4);
      ctx.closePath();
      ctx.fill();
    }
    // The ship the camera is following at this moment, ringed.
    if (live && live.k === 'follow') {
      const p = at.get(live.u);
      const u = p ? null : this.unit(live.u);
      const q = p || (u ? { x: u.x, z: u.z } : null);
      if (q) {
        const s = L.toScreen(q.x, q.z);
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#e6cf9c';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // The picked ship, ringed solid.
    if (this.sel) {
      const p = at.get(this.sel);
      const u = this.unit(this.sel);
      const q = p || u;
      if (q) {
        const s = L.toScreen(q.x, q.z);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 22, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Each ship's target at the scrubber's moment, off her fire and cease-fire cues. */
  firing() {
    const out = new Map();
    for (const c of this.script.cues) {
      if (c.t > this.t) break;
      if (c.a === 'fire') out.set(c.u, c.at);
      else if (c.a === 'hold' || c.a === 'free') out.delete(c.u);
    }
    return out;
  }

  shotAt(t) {
    let live = null;
    for (const s of this.script.shots) if (s.t <= t) live = s;
    return live;
  }

  // ------------------------------------------------------------ the script --

  changed() {
    this.script.cues.sort((a, b) => a.t - b.t);
    this.script.shots.sort((a, b) => a.t - b.t);
    const last = Math.max(0, ...this.script.cues.map((c) => c.t), ...this.script.shots.map((s) => s.t));
    if (last + 30 > this.length) this.length = Math.min(STAGE_MAX_T, Math.ceil((last + 60) / 60) * 60);
    this.version = (this.version || 0) + 1;
    this.cache = null;
    try {
      localStorage.setItem(STORE, JSON.stringify({ ...this.script, length: this.length }));
    } catch { /* kept for this visit only */ }
    this.render();
    this.dirty();
  }

  add(cue) {
    this.script.cues.push({ ...cue, t: Math.round(cue.t * 10) / 10 });
    audio.click();
    this.changed();
  }

  addShot(shot) {
    this.script.shots.push({ ...shot, t: Math.round(shot.t * 10) / 10 });
    audio.click();
    this.changed();
  }

  /** A cue button pressed for the picked ship. */
  order(a) {
    if (!this.sel) return;
    const spec = CUES[a];
    const cue = { t: this.t, u: this.sel, a };
    if (spec.pts) { this.mode = { kind: 'path', cue, pts: [] }; this.render(); this.dirty(); return; }
    if (spec.at) { this.mode = { kind: 'target', cue }; this.render(); this.dirty(); return; }
    if (a === 'speed') { this.mode = { kind: 'speed', cue }; this.render(); return; }
    this.add(cue);
  }

  /** What the battle is handed: the script, checked as the room will check it. */
  result() {
    return cleanScript(this.script, this.layout.half);
  }

  setTime(t) {
    this.t = Math.max(0, Math.min(this.length, Math.round(t * 10) / 10));
    this.cache = null;
    const clock = document.getElementById('sp-clock');
    if (clock) clock.textContent = clockOf(this.t);
    const scrub = document.getElementById('sp-scrub');
    if (scrub && Number(scrub.value) !== this.t) scrub.value = String(this.t);
    this.paintAddAt();
    this.dirty();
  }

  /** Run the scrubber through the scene, the way the battle will run it. */
  togglePlay() {
    if (this.playing) {
      cancelAnimationFrame(this.playing);
      this.playing = 0;
      this.render();
      return;
    }
    let last = performance.now();
    const go = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // Ten seconds of scene a second: a five-minute scene runs in half a minute.
      this.setTime(this.t + dt * 10);
      if (this.t >= this.length || !this.active) { this.playing = 0; this.render(); return; }
      this.playing = requestAnimationFrame(go);
    };
    this.playing = requestAnimationFrame(go);
    this.render();
  }

  // -------------------------------------------------------------- the panel --

  paintAddAt() {
    this.panel?.querySelectorAll('.sp-at').forEach((el) => { el.textContent = clockOf(this.t); });
  }

  render() {
    const P = this.panel;
    if (!P || !this.active) return;
    const m = this.mode;
    const sel = this.sel ? this.unit(this.sel) : null;
    const isShip = sel && sel.kind === 'ship';
    const cueRows = (list) => list.map((c) => {
      const i = this.script.cues.indexOf(c);
      const what = c.a === 'path' ? `${CUES.path.label} · ${c.pts.length} pt`
        : c.a === 'speed' ? `${CUES.speed.label} · ${NOTCHES[c.n] || c.n}`
          : CUES[c.a].at ? `${CUES[c.a].label} ${esc(this.nameOf(c.at))}` : CUES[c.a].label;
      return `<li class="sp-row${CUES[c.a].outcome ? ' outcome' : ''}">
        <button type="button" class="sp-t" data-goto="${c.t}">${clockOf(c.t)}</button>
        <span>${what}</span>
        <button type="button" class="sp-x" data-now-cue="${i}" title="Move to ${clockOf(this.t)}">⏱</button>
        <button type="button" class="sp-x" data-del-cue="${i}" aria-label="Delete">×</button></li>`;
    }).join('');
    const shotRows = this.script.shots.map((s, i) => {
      const what = s.k === 'follow' ? `Follow ${esc(this.nameOf(s.u))} · ${VIEWS[s.view]?.label || ''}`
        : s.k === 'fixed' ? `Fixed camera · ${s.look ? `on ${esc(this.nameOf(s.look))}` : 'on the sea'} · ${s.y} m`
          : 'Free camera';
      return `<li class="sp-row">
        <button type="button" class="sp-t" data-goto="${s.t}">${clockOf(s.t)}</button>
        <span>${what}${s.glide ? ` · glide ${s.glide}s` : ''}</span>
        <button type="button" class="sp-x" data-now-shot="${i}" title="Move to ${clockOf(this.t)}">⏱</button>
        <button type="button" class="sp-x" data-del-shot="${i}" aria-label="Delete">×</button></li>`;
    }).join('');

    let body = '';
    if (m && (m.kind === 'path' || m.kind === 'target' || m.kind === 'place' || m.kind === 'aim')) {
      body = `<div class="sp-mode"><p>${esc(this.hint())}</p>
        ${m.kind === 'path' ? `<div class="sp-notch">${NOTCHES.slice(1).map((n, j) => `<button type="button" class="sp-chip${(m.cue.n ?? 4) === j + 1 ? ' on' : ''}" data-pathn="${j + 1}">${n}</button>`).join('')}</div>` : ''}
        <div class="sp-acts">
          ${m.kind === 'path' ? `<button type="button" class="btn" id="sp-done" ${m.pts.length ? '' : 'disabled'}>Done</button>` : ''}
          ${m.kind === 'path' && m.pts.length ? '<button type="button" class="btn ghost" id="sp-undo">Undo point</button>' : ''}
          <button type="button" class="btn ghost" id="sp-cancel">Cancel</button>
        </div></div>`;
    } else if (m && m.kind === 'speed') {
      body = `<div class="sp-mode"><p>Ring up ${esc(this.nameOf(m.cue.u))}'s telegraph at ${clockOf(m.cue.t)}:</p>
        <div class="sp-notch">${NOTCHES.map((n, j) => `<button type="button" class="sp-chip" data-notch="${j}">${n}</button>`).join('')}</div>
        <div class="sp-acts"><button type="button" class="btn ghost" id="sp-cancel">Cancel</button></div></div>`;
    } else if (this.tab === 'orders') {
      const mine = sel ? this.script.cues.filter((c) => c.u === sel.key) : [];
      body = sel ? `
        <h4 class="sp-who t${sel.team}">${esc(sel.tok.name)} <small>${esc(sel.tok.type || '')} · ${sel.team === 0 ? 'your side' : 'enemy'}</small></h4>
        ${isShip ? `<p class="sp-sub">At <b class="sp-at">${clockOf(this.t)}</b>:</p>
        <div class="sp-cues">${Object.entries(CUES).map(([k, c]) => `<button type="button" class="sp-cue${c.outcome ? ' outcome' : ''}" data-cue="${k}" title="${esc(c.help)}">${c.label}</button>`).join('')}</div>`
    : '<p class="sp-sub">Guns ashore and squadrons fight on their own. The camera can follow them.</p>'}
        <ul class="sp-list">${cueRows(mine) || '<li class="sp-none">No orders yet.</li>'}</ul>`
        : `<p class="sp-sub">Tap a ship on the chart to give her orders.</p>
        <ul class="sp-list">${cueRows(this.script.cues) || '<li class="sp-none">The script is empty.</li>'}</ul>`;
    } else {
      body = `
        <p class="sp-sub">A shot at <b class="sp-at">${clockOf(this.t)}</b>:</p>
        <div class="sp-field"><span>View</span><div class="sp-notch">${Object.entries(VIEWS).map(([k, v]) => `<button type="button" class="sp-chip${this.view === k ? ' on' : ''}" data-view="${k}">${v.label}</button>`).join('')}</div></div>
        <div class="sp-field"><span>Glide in</span><div class="sp-notch">${[0, 1, 2, 4, 8].map((g) => `<button type="button" class="sp-chip${this.glide === g ? ' on' : ''}" data-glide="${g}">${g ? `${g}s` : 'Cut'}</button>`).join('')}</div></div>
        <div class="sp-field"><span>Orbit</span><div class="sp-notch">${[-12, -4, 0, 4, 12].map((g) => `<button type="button" class="sp-chip${this.spin === g ? ' on' : ''}" data-spin="${g}">${g ? `${g > 0 ? '↻' : '↺'} ${Math.abs(g)}°/s` : 'Still'}</button>`).join('')}</div></div>
        <div class="sp-field"><span>Camera height</span><div class="sp-notch">${[6, 15, 40, 120, 400].map((g) => `<button type="button" class="sp-chip${this.camY === g ? ' on' : ''}" data-camy="${g}">${g} m</button>`).join('')}</div></div>
        <div class="sp-cues">
          <button type="button" class="sp-cue" id="sp-follow" ${sel ? '' : 'disabled'}>${SHOTS.follow.label} ${sel ? esc(sel.tok.name) : '(pick a unit)'}</button>
          <button type="button" class="sp-cue" id="sp-fixed">${SHOTS.fixed.label}</button>
          <button type="button" class="sp-cue" id="sp-freecam">${SHOTS.free.label}</button>
        </div>
        <ul class="sp-list">${shotRows || '<li class="sp-none">No shots: the camera is yours throughout.</li>'}</ul>`;
    }

    P.innerHTML = `
      <div class="sp-time">
        <button type="button" class="sp-play" id="sp-play" aria-label="${this.playing ? 'Stop' : 'Run the scene'}">${this.playing ? '❚❚' : '▶'}</button>
        <span class="sp-clock" id="sp-clock">${clockOf(this.t)}</span>
        <input type="range" id="sp-scrub" min="0" max="${this.length}" step="0.5" value="${this.t}" aria-label="Moment in the scene">
        <span class="sp-len">${clockOf(this.length)}</span>
      </div>
      <div class="sp-nudge">
        <button type="button" data-nudge="-10">−10s</button><button type="button" data-nudge="-1">−1s</button>
        <button type="button" data-nudge="1">+1s</button><button type="button" data-nudge="10">+10s</button>
        <button type="button" data-len="60">+1 min</button>
      </div>
      <div class="sp-tabs">
        <button type="button" data-tab="orders" class="${this.tab === 'orders' ? 'on' : ''}">Orders · ${this.script.cues.length}</button>
        <button type="button" data-tab="camera" class="${this.tab === 'camera' ? 'on' : ''}">Camera · ${this.script.shots.length}</button>
      </div>
      <div class="sp-body">${body}</div>
      <div class="sp-foot"><button type="button" class="sp-clear" id="sp-clear">Clear script</button></div>`;
    this.bindPanel();
    this.layout.status();
  }

  bindPanel() {
    const P = this.panel;
    const on = (sel, fn) => P.querySelectorAll(sel).forEach((el) => {
      el.onclick = (e) => { e.stopPropagation(); fn(el); };
    });
    const scrub = P.querySelector('#sp-scrub');
    if (scrub) scrub.oninput = () => this.setTime(Number(scrub.value));
    on('#sp-play', () => this.togglePlay());
    on('[data-nudge]', (el) => this.setTime(this.t + Number(el.dataset.nudge)));
    on('[data-len]', () => { this.length = Math.min(STAGE_MAX_T, this.length + 60); this.render(); });
    on('[data-tab]', (el) => { this.tab = el.dataset.tab; this.mode = null; audio.click(); this.render(); this.dirty(); });
    on('[data-goto]', (el) => this.setTime(Number(el.dataset.goto)));
    on('[data-del-cue]', (el) => { this.script.cues.splice(Number(el.dataset.delCue), 1); this.changed(); });
    on('[data-del-shot]', (el) => { this.script.shots.splice(Number(el.dataset.delShot), 1); this.changed(); });
    on('[data-now-cue]', (el) => { this.script.cues[Number(el.dataset.nowCue)].t = this.t; this.changed(); });
    on('[data-now-shot]', (el) => { this.script.shots[Number(el.dataset.nowShot)].t = this.t; this.changed(); });
    on('[data-cue]', (el) => this.order(el.dataset.cue));
    on('[data-notch]', (el) => {
      this.add({ ...this.mode.cue, n: Number(el.dataset.notch) });
      this.mode = null;
      this.render();
    });
    on('[data-pathn]', (el) => { this.mode.cue.n = Number(el.dataset.pathn); this.render(); });
    on('#sp-done', () => {
      const m = this.mode;
      if (m && m.pts.length) this.add({ ...m.cue, pts: m.pts, n: m.cue.n ?? 4 });
      this.mode = null;
      this.render();
    });
    on('#sp-undo', () => { this.mode?.pts?.pop(); this.render(); this.dirty(); });
    on('#sp-cancel', () => { this.mode = null; this.render(); this.dirty(); });
    on('[data-view]', (el) => { this.view = el.dataset.view; this.render(); });
    on('[data-glide]', (el) => { this.glide = Number(el.dataset.glide); this.render(); });
    on('[data-spin]', (el) => { this.spin = Number(el.dataset.spin); this.render(); });
    on('[data-camy]', (el) => { this.camY = Number(el.dataset.camy); this.render(); });
    on('#sp-follow', () => {
      if (!this.sel) return;
      this.addShot({ t: this.t, k: 'follow', u: this.sel, view: this.view, glide: this.glide, spin: this.spin });
    });
    on('#sp-fixed', () => { this.mode = { kind: 'place' }; this.render(); this.dirty(); });
    on('#sp-freecam', () => this.addShot({ t: this.t, k: 'free', glide: 0 }));
    on('#sp-clear', () => {
      if (!this.script.cues.length && !this.script.shots.length) return;
      if (!window.confirm('Clear every order and every shot from the script?')) return;
      this.script = { cues: [], shots: [] };
      this.changed();
    });
  }
}

