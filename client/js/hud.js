// Bridge instruments: the conn keys and their panels, damage state, the plot
// and the feeds. Her guns are fought by her own officers and have no controls
// here; what a captain works is her speed, her aircraft and her damage control,
// and he lays her course off on the plot.

import { SHIP_CLASSES } from '../../shared/ships.js';
import { MAP_HALF, islandRing } from '../../shared/world.js';
import { BATTERIES } from '../../shared/batteries.js';
import { MPS_TO_KNOTS, clamp, wrapAngle } from '../../shared/math.js';
import { SECTIONS } from '../../shared/sim.js';
import { getSettings } from './settings.js';

const $ = (id) => document.getElementById(id);

// The engine-room telegraph, bottom to top: astern, stop, and up through her
// speeds. The order is the lever's order, not an array's.
const NOTCHES = ['ASTERN', 'STOP', 'SLOW', 'HALF', 'FULL', 'FLANK'];

const PANEL_TITLES = {
  helm: 'ENGINE', dmg: 'DAMAGE', air: 'AIR GROUP', ship: 'DAMAGE CONTROL',
};

export class Hud {
  constructor({ team, world, onLeave }) {
    this.team = team;
    this.world = world;
    this.el = {
      ownName: $('own-name'), condRow: $('cond-row'),
      status: $('status-row'),
      connKeys: $('conn-keys'), connPanel: $('conn-panel'),
      connTitle: $('conn-panel-title'), connSub: $('conn-panel-sub'),
      connBody: $('conn-panel-body'),
      timer: $('battle-timer'),
      killfeed: $('killfeed'),
      ribbons: $('ribbons'), alerts: $('alerts'), scoreboard: $('scoreboard'),
      scoreTable: $('scoreboard-table'), minimap: $('minimap'), minimapWrap: $('minimap-wrap'),
      bigPlot: $('minimap-big'), plotTable: $('plot-table'),
      sink: $('sink-overlay'), reticle: $('reticle'),
      watchBanner: $('watch-banner'), watchWhat: $('watch-what'),
    };
    this.built = false;
    this.lastRibbon = 0;
    this.onPick = null;
    this.onToggleMap = null;
    this.watching = null;
    // The two plots: the one in the corner and the chart table in the middle.
    // Both are drawn from the same call, and each remembers what it drew -- in
    // its own box's pixels -- so a tap on either can be turned back into the
    // hull or the gun that was tapped.
    // Each carries its own view: how far in it is zoomed and what it is
    // centred on, in metres. The corner plot is always the whole battlefield;
    // the table is the one a captain works in close on.
    this.plots = [
      { cv: this.el.minimap, ctx: this.el.minimap.getContext('2d'), marks: [], view: { x: 0, z: 0, zoom: 1 } },
      { cv: this.el.bigPlot, ctx: this.el.bigPlot.getContext('2d'), marks: [], view: { x: 0, z: 0, zoom: 1 } },
    ];
    // The corner plot is the command table now, not a button that opens one:
    // it has the whole corner to itself and a ship on it is big enough to put a
    // finger on. Tap one of your own to take her under orders, tap open water
    // to send her there. The big table is still there, on M.
    this.bindPick(this.el.minimap, 0);
    // And the magnifier in its corner, which is the way to the big chart now
    // that the plot itself is a control.
    document.getElementById('plot-open')?.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.onToggleMap?.();
    });
    this.bindTable();
    // Anywhere off the table puts it away, which is what a captain expects of
    // something laid over his bridge windows.
    this.el.plotTable.addEventListener('pointerdown', (e) => {
      if (e.target === this.el.plotTable) { e.preventDefault(); this.onToggleMap?.(); }
    });
    $('btn-leave').onclick = onLeave;
  }

  /**
   * Make a plot pickable: a tap on it is a pick, a drag on it is not.
   *
   * The chart table has its own handling because it pans and zooms as well; the
   * corner plot does neither, so it only has to tell a tap from a smudge.
   */
  bindPick(cv, which) {
    let from = null;
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      from = { x: e.clientX, y: e.clientY };
    });
    const up = (e) => {
      if (!from) return;
      const moved = Math.hypot(e.clientX - from.x, e.clientY - from.y);
      from = null;
      if (moved < 8) this.onPick?.(this.hitPlot(e, which), this.plotPoint(e, which));
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', () => { from = null; });
  }

  /** Is the chart table up? */
  get mapBig() { return !this.el.plotTable.hidden; }

  /**
   * Working the chart table: drag it about, zoom into it, tap a contact on it.
   *
   * A drag and a tap arrive the same way, so they are told apart by how far the
   * finger went: under a few pixels is a tap on a contact, anything more was a
   * captain moving the chart under his hand and must not also send the camera
   * somewhere. Two fingers pinch, which is the only gesture on a chart that
   * everybody already knows.
   */
  bindTable() {
    const cv = this.el.bigPlot;
    const view = this.plots[1].view;
    const pointers = new Map();
    let moved = 0;
    let pinch = 0;

    const at = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, box: r.width || 1 };
    };
    // Metres per pixel at this zoom, which is what turns a drag into a course
    // over the ground.
    const perPx = (box) => ((this.world?.half || MAP_HALF) * 2) / (box * view.zoom);

    const clampView = (box) => {
      const H = this.world?.half || MAP_HALF;
      const half = (H * 2) / view.zoom / 2;
      const slack = Math.max(0, H - half);
      view.x = clamp(view.x, -slack, slack);
      view.z = clamp(view.z, -slack, slack);
      return box;
    };

    const zoomAt = (p, factor) => {
      const m = perPx(p.box);
      // What is under the finger before, and after: the difference is the pan
      // that keeps it under the finger.
      const bx = view.x + (p.x - p.box / 2) * m;
      const bz = view.z - (p.y - p.box / 2) * m;
      view.zoom = clamp(view.zoom * factor, 1, 12);
      const m2 = perPx(p.box);
      view.x = bx - (p.x - p.box / 2) * m2;
      view.z = bz + (p.y - p.box / 2) * m2;
      clampView(p.box);
    };

    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      cv.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, at(e));
      if (pointers.size === 1) { moved = 0; cv.classList.add('panning'); }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });

    cv.addEventListener('pointermove', (e) => {
      const was = pointers.get(e.pointerId);
      if (!was) return;
      const now = at(e);
      pointers.set(e.pointerId, now);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 4 && d > 4) {
          zoomAt({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, box: now.box }, d / pinch);
          moved += Math.abs(d - pinch);
        }
        pinch = d;
        return;
      }
      const m = perPx(now.box);
      view.x -= (now.x - was.x) * m;
      view.z += (now.y - was.y) * m;
      moved += Math.hypot(now.x - was.x, now.y - was.y);
      clampView(now.box);
    });

    const up = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        cv.classList.remove('panning');
        if (moved < 6) this.onPick?.(this.hitPlot(e, 1), this.plotPoint(e, 1));
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);

    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomAt(at(e), Math.exp(-e.deltaY * 0.0016));
    }, { passive: false });

    const key = (id, fn) => document.getElementById(id)?.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); fn();
    });
    const middle = () => ({ x: cv.clientWidth / 2, y: cv.clientWidth / 2, box: cv.clientWidth || 1 });
    key('plot-in', () => zoomAt(middle(), 1.5));
    key('plot-out', () => zoomAt(middle(), 1 / 1.5));
    key('plot-fit', () => { view.x = 0; view.z = 0; view.zoom = 1; });
  }

  /**
   * What was under a tap on the plot, or null for open water.
   *
   * The plot is small and a finger is not, so the pick radius is generous and
   * the nearest mark inside it wins. Batteries are tested first: they do not
   * move, so a captain who wants one has aimed at it.
   */
  hitPlot(e, which = 0) {
    const plot = this.plots[which];
    const el = plot.cv;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    // Marks are plotted in the box's own pixels, so a tap needs no conversion.
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const reach = Math.max(18, r.width * 0.055);
    // A division in line abreast is a few pixels wide on this plot and your own
    // hull is in the middle of it, so a straight nearest-mark pick keeps
    // landing on yourself — which is the one answer that does nothing. Ranked
    // instead: a gun ashore, then somebody else's hull, then your own, and the
    // nearest inside each rank.
    const rank = (m) => (m.kind === 'battery' || m.kind === 'plane' ? 0
      : m.id === this.selfId ? 2 : 1);
    let best = null;
    for (const mark of plot.marks) {
      const d = Math.hypot(mark.x - px, mark.y - py);
      if (d > reach) continue;
      if (!best || rank(mark) < rank(best) || (rank(mark) === rank(best) && d < best.d)) {
        best = { ...mark, d };
      }
    }
    return best
      ? { kind: best.kind, id: best.id, name: best.name, team: best.team }
      : null;
  }

  /** Where on the battlefield a tap on a plot landed, in metres. */
  plotPoint(e, which = 0) {
    const plot = this.plots[which];
    const r = plot.cv.getBoundingClientRect();
    if (!r.width) return null;
    const size = plot.cv.clientWidth || 240;
    const H = this.world?.half || MAP_HALF;
    const scale = (size / (H * 2)) * plot.view.zoom;
    return {
      x: plot.view.x + ((e.clientX - r.left) - size / 2) / scale,
      z: plot.view.z - ((e.clientY - r.top) - size / 2) / scale,
    };
  }

  /** Which ship the chart is conning, so she can be ringed. */
  setSelected(id) { this.selected = id ?? null; }

  /** Which contact the camera is watching, so the plot can ring it. */
  setWatching(watch) { this.watching = watch; }

  /**
   * The banner that names what the camera has gone to look at, and says which
   * way you are looking at it from -- aboard her, or standing off her.
   */
  setWatchBanner(watch, pov = true) {
    const el = this.el.watchBanner;
    if (!el) return;
    el.hidden = !watch;
    if (watch) {
      this.el.watchWhat.textContent = `${pov ? 'Aboard' : 'Watching'} ${watch.name}`;
    }
  }

  buildFor(classId) {
    const cls = SHIP_CLASSES[classId];
    this.cls = cls;

    // What a captain still does himself. Three keys, and each raises one panel.
    this.keys = {};
    for (const el of this.el.connKeys.querySelectorAll('.conn-key')) {
      this.keys[el.dataset.panel] = el;
      el.onclick = () => this.togglePanel(el.dataset.panel);
    }
    // No aircraft aboard, no air panel: the key goes rather than sitting there
    // dead, and the other two close up.
    if (!cls.planes) {
      this.keys.air?.remove();
      delete this.keys.air;
    }
    this.panel = null;
    this.acts = {};

    this.built = true;
  }

  /**
   * The keys themselves: her speed on the helm key, and a mark on the others
   * when there is something waiting to be done.
   */
  paintKeys(own) {
    const kn = Math.abs(own.v * MPS_TO_KNOTS);
    if (this.keys.helm) {
      this.keys.helm.querySelector('span').textContent = `${kn.toFixed(0)} KN`;
    }
    if (this.keys.air) {
      const ready = (own.sq || []).filter((q) => q === 0).length;
      this.keys.air.classList.toggle('due', ready > 0);
      this.keys.air.classList.toggle('spent', ready === 0);
    }
    if (this.keys.ship) {
      const hurt = (own.f || 0) + (own.fl || 0) > 0;
      this.keys.ship.classList.toggle('due', hurt && own.rc <= 0);
    }
  }

  /**
   * Her condition on the ship plate: one pip per compartment, in the order they
   * run from her stem to her transom, and the total number of holes in her.
   */
  paintCondition(sec) {
    if (!this.condPips) {
      this.el.condRow.innerHTML = '';
      this.condPips = SECTIONS.map((s) => {
        const el = document.createElement('i');
        el.title = s.name;
        this.el.condRow.appendChild(el);
        return el;
      });
      this.condCount = document.createElement('span');
      this.el.condRow.appendChild(this.condCount);
    }
    let holes = 0;
    SECTIONS.forEach((s, i) => {
      const c = (sec && sec[i]) || [100, 0];
      holes += c[1];
      const f = clamp(c[0] / 100, 0, 1);
      this.condPips[i].style.setProperty('--fill', `${f * 100}%`);
      this.condPips[i].classList.toggle('hurt', f <= 0.6 && f > 0);
      this.condPips[i].classList.toggle('gone', f <= 0);
    });
    const worst = Math.min(...SECTIONS.map((s, i) => ((sec && sec[i]) ? sec[i][0] : 100)));
    this.condCount.textContent = holes
      ? `${holes} hole${holes === 1 ? '' : 's'}`
      : worst >= 99 ? 'sound' : `${worst}%`;
  }

  /** Whatever panel is up, showing the state it is a control for. */
  paintPanel(own) {
    if (this.panel === 'helm') {
      const kn = Math.abs(own.v * MPS_TO_KNOTS);
      const deg = ((wrapAngle(own.h) * 180) / Math.PI + 360) % 360;
      this.el.connSub.textContent =
        `${kn.toFixed(1)} kn · ${String(Math.round(deg)).padStart(3, '0')}°`;
      (this.teleRows || []).forEach((r, i) => {
        r.classList.toggle('on', own.notch === 0 ? i === 0 : i > 0 && i <= own.notch);
      });
      return;
    }
    if (this.panel === 'dmg') {
      let holes = 0;
      SECTIONS.forEach((s, i) => {
        const row = this.boardRows && this.boardRows[i];
        const c = (own.sec && own.sec[i]) || [100, 0];
        holes += c[1];
        if (!row) return;
        const f = clamp(c[0] / 100, 0, 1);
        row.querySelector('i').style.setProperty('--fill', `${f * 100}%`);
        row.querySelector('b').textContent = c[1] ? `${c[1]}` : '—';
        row.classList.toggle('hurt', f <= 0.6 && f > 0);
        row.classList.toggle('gone', f <= 0);
      });
      // Holes if she has any; failing that, the worst compartment aboard. She
      // can be badly knocked about by splinters and near misses without one
      // shell having got inside her, and saying "sound" to that is a lie.
      const worst = Math.min(...SECTIONS.map((s, i) => (own.sec && own.sec[i] ? own.sec[i][0] : 100)));
      this.el.connSub.textContent = holes
        ? `${holes} penetration${holes === 1 ? '' : 's'}`
        : worst >= 99 ? 'sound' : `${worst}% worst`;
      return;
    }
    const set = (k, text, cls) => {
      const el = this.acts[k];
      if (!el) return;
      el.querySelector('b').textContent = text;
      el.classList.toggle('ready', cls === 'ready');
      el.classList.toggle('active', cls === 'active');
      el.classList.toggle('spent', cls === 'spent');
    };
    if (this.panel === 'air') {
      const ready = (own.sq || []).filter((q) => q === 0).length;
      const soon = (own.sq || []).filter((q) => q > 0);
      set('air', ready > 0 ? `×${ready}` : soon.length ? `${Math.ceil(Math.min(...soon))}s` : '—',
        ready > 0 ? 'ready' : 'spent');
      set('plane', 'PL', 'ready');
      this.el.connSub.textContent = `${ready} ready`;
      return;
    }
    set('repair', own.rc > 0 ? `${Math.ceil(own.rc)}s` : 'READY', own.rc <= 0 ? 'ready' : 'spent');
    set('smoke', `×${own.smk ?? 0}`,
      own.sm === 1 ? 'active' : (own.smk ?? 0) > 0 ? 'ready' : 'spent');
    const hurt = (own.f || 0) + (own.fl || 0);
    this.el.connSub.textContent = hurt ? `${hurt} to fight` : 'sound';
  }

  /**
   * What to do when something on a conn panel is pressed.
   *
   * One handler for the lot: 'notch' with a number for the telegraph, and a
   * name for everything else -- 'air', 'plane', 'repair', 'smoke'.
   */
  onConn(fn) { this.connFn = fn; }

  /** Raise a panel, or lower the one that is up. */
  togglePanel(which) {
    this.panel = this.panel === which ? null : which;
    for (const [k, el] of Object.entries(this.keys || {})) {
      el.classList.toggle('on', k === this.panel);
    }
    this.el.connPanel.hidden = !this.panel;
    this.el.connPanel.classList.toggle('wide', this.panel === 'dmg');
    if (!this.panel) return;
    this.el.connTitle.textContent = PANEL_TITLES[this.panel] || '';
    this.el.connBody.innerHTML = '';
    this.acts = {};
    if (this.panel === 'helm') this.buildHelmPanel();
    else if (this.panel === 'dmg') this.buildDamagePanel();
    else this.buildActionPanel(this.panel);
    if (this.lastOwn) this.paintPanel(this.lastOwn);
  }

  /** The telegraph, as the lever it is: astern at the bottom, flank at the top. */
  buildHelmPanel() {
    const rows = document.createElement('div');
    rows.className = 'tele-rows';
    this.teleRows = NOTCHES.map((label, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tele-row' + (i === 0 ? ' astern' : '');
      b.innerHTML = `<span>${label}</span><i></i>`;
      b.onclick = () => this.connFn?.('notch', i);
      rows.appendChild(b);
      return b;
    });
    this.el.connBody.appendChild(rows);
    const note = document.createElement('p');
    note.className = 'conn-note';
    note.textContent = 'Course is laid off on the plot';
    this.el.connBody.appendChild(note);
  }

  /**
   * The damage board: her own hull stood in the air, and what is open in her.
   *
   * Built the first time it is asked for -- it carries a renderer of its own,
   * and a captain who never presses the wrench should never pay for one.
   */
  buildDamagePanel() {
    const wrap = document.createElement('div');
    wrap.className = 'board-wrap';
    const cv = document.createElement('canvas');
    cv.className = 'board-canvas';
    wrap.appendChild(cv);
    this.el.connBody.appendChild(wrap);
    const list = document.createElement('div');
    list.className = 'board-list';
    this.el.connBody.appendChild(list);
    this.boardRows = SECTIONS.map((sec) => {
      const row = document.createElement('div');
      row.className = 'board-row';
      row.innerHTML = `<span>${sec.name}</span><i></i><b></b>`;
      list.appendChild(row);
      return row;
    });
    this.onBoard?.(cv);
  }

  /** Say who builds the hologram, so the HUD need not import a renderer. */
  onDamageBoard(fn) { this.onBoard = fn; }

  /** The air group, or the damage control parties. */
  buildActionPanel(which) {
    const cls = this.cls;
    // A carrier sends a strike; a cruiser shoots a scout off a catapult, and
    // calling that a strike oversells four Kingfishers considerably.
    const air = cls.planes && cls.planes.group ? 'Launch strike' : 'Launch scout';
    const list = which === 'air'
      ? [{ k: 'air', label: air }, { k: 'plane', label: 'Pilot view' }]
      : [{ k: 'repair', label: 'Damage control' },
        ...(cls.smokeCharges ? [{ k: 'smoke', label: 'Make smoke' }] : [])];
    for (const a of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'conn-act';
      b.innerHTML = `<span>${a.label}</span><b></b>`;
      b.onclick = () => this.connFn?.(a.k);
      this.el.connBody.appendChild(b);
      this.acts[a.k] = b;
    }
  }

  formatRange(m) {
    return getSettings().metric ? `${(m / 1000).toFixed(1)} km` : `${(m / 1852).toFixed(1)} nm`;
  }

  update(own, snap) {
    if (!this.built || !own) return;
    const cls = this.cls;

    this.el.ownName.textContent = `${own.n || ''} · ${cls.name} (${cls.type})`;
    // Her condition, compartment by compartment: one pip each, and the number
    // of holes in her. There is no bar, because a ship does not have one.
    this.paintCondition(own.sec);

    const chips = [];
    if (own.f) chips.push(`<span class="status-chip fire">FIRE ×${own.f}</span>`);
    if (own.fl) chips.push(`<span class="status-chip flood">FLOODING ×${own.fl}</span>`);
    if (own.eng) chips.push('<span class="status-chip engine">ENGINE</span>');
    if (own.str) chips.push('<span class="status-chip steering">STEERING</span>');
    this.el.status.innerHTML = chips.join('');

    this.lastOwn = own;
    this.paintKeys(own);
    if (this.panel) this.paintPanel(own);

    if (snap) {
      const left = Math.max(0, 900 - snap.time);
      this.el.timer.textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    }
  }

  ribbon(text, cls = '') {
    const el = document.createElement('div');
    el.className = `ribbon ${cls}`;
    el.textContent = text;
    this.el.ribbons.appendChild(el);
    setTimeout(() => el.remove(), 2400);
    while (this.el.ribbons.children.length > 7) this.el.ribbons.firstChild.remove();
  }

  alert(text) {
    const el = document.createElement('div');
    el.className = 'alert';
    el.textContent = text;
    this.el.alerts.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  kill(killerName, killerTeam, victimName, victimTeam) {
    const el = document.createElement('div');
    el.className = 'kill-row';
    el.innerHTML = `<span class="k${killerTeam === this.team ? 0 : 1}">${killerName}</span>
      <span class="muted"> sank </span>
      <span class="k${victimTeam === this.team ? 0 : 1}">${victimName}</span>`;
    this.el.killfeed.appendChild(el);
    setTimeout(() => el.remove(), 9000);
    while (this.el.killfeed.children.length > 6) this.el.killfeed.firstChild.remove();
  }

  showScoreboard(roster, ownId, show) {
    this.el.scoreboard.classList.toggle('show', show);
    if (!show || !roster) return;
    const rows = roster
      .slice()
      .sort((a, b) => a.team - b.team || b.dmg - a.dmg)
      .map((r) => `<tr class="t${r.team === this.team ? 0 : 1}${r.alive ? '' : ' dead'}${r.id === ownId ? ' you' : ''}">
        <td>${r.type}</td><td>${r.name}${r.bot ? ' <span class="muted">AI</span>' : ''}</td>
        <td>${SHIP_CLASSES[r.cls].name}</td><td>${r.kills} kills</td>
        <td>${r.dmg.toLocaleString()} dmg</td><td>${r.hits} hits</td><td>${r.cits} cit</td></tr>`)
      .join('');
    this.el.scoreTable.innerHTML =
      `<tr><th></th><th>Captain</th><th>Ship</th><th></th><th></th><th></th><th></th></tr>${rows}`;
  }

  setSunk(sunk) { this.el.sink.classList.toggle('show', sunk); }

  toggleMap(big) { this.el.plotTable.hidden = !big; }

  /**
   * The plot: own ship, contacts, torpedo tracks, capture zones, islands.
   *
   * Drawn into every plot that is on screen -- the corner one always, the chart
   * table when it is up -- from the one call, so the two can never disagree.
   */
  drawMinimap(own, ships, snap) {
    for (const plot of this.plots) {
      if (plot.cv.offsetParent === null && plot.cv !== this.el.minimap) { plot.marks = []; continue; }
      this.paintPlot(plot, own, ships, snap);
    }
  }

  paintPlot(plot, own, ships, snap) {
    const ctx = plot.ctx;
    // The plot is drawn in the pixels it is actually shown at.
    //
    // It used to be a fixed three-hundred-and-twenty-pixel canvas squeezed into
    // whatever box the stylesheet gave it, which on a phone is about a hundred:
    // a destroyer's counter came out at two pixels across and a gun ashore at
    // two and a half, which is to say invisible. Sizing the backing store to
    // the box -- times the screen's own pixel ratio, so it stays sharp -- means
    // a mark drawn six pixels wide is six pixels wide on the glass.
    const cv = plot.cv;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const size = Math.max(64, Math.round(cv.clientWidth || 240));
    const store = Math.round(size * dpr);
    if (cv.width !== store || cv.height !== store) { cv.width = store; cv.height = store; }
    ctx.setTransform(store / size, 0, 0, store / size, 0, 0);
    // And the marks come down a little on a small plot, so a division in line
    // abreast is still four counters rather than one blob.
    const k = clamp(size / 240, 0.7, 1.15);
    const H = this.world?.half || MAP_HALF;
    const view = plot.view;
    const scale = (size / (H * 2)) * view.zoom;
    const toX = (x) => size / 2 + (x - view.x) * scale;
    const toY = (z) => size / 2 - (z - view.z) * scale;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(8,24,42,0.75)';
    ctx.fillRect(0, 0, size, size);

    // The grid is laid on the battlefield, not on the canvas, so it stays put
    // under the chart when it is panned and gives a captain something to judge
    // a range by when he has zoomed in.
    ctx.strokeStyle = 'rgba(154,166,178,0.14)';
    ctx.lineWidth = 1;
    const step = (H * 2) / 8;
    for (let i = -8; i <= 8; i++) {
      const w = i * step;
      const px = toX(w); const py = toY(w);
      if (px >= 0 && px <= size) { ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, size); ctx.stroke(); }
      if (py >= 0 && py <= size) { ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(size, py); ctx.stroke(); }
    }
    // The border of the battlefield: past it there is nothing to fight over,
    // and when the chart is zoomed in it is the only thing that says so.
    ctx.strokeStyle = 'rgba(154,166,178,0.4)';
    ctx.strokeRect(toX(-H), toY(H), H * 2 * scale, H * 2 * scale);

    // The islands, in the shape the hulls run aground on rather than as the
    // circles they used to be plotted as.
    ctx.fillStyle = 'rgba(56,64,47,0.9)';
    for (const isle of this.world.islands) {
      const ring = islandRing(isle);
      ctx.beginPath();
      ring.forEach(([x, z], i) => {
        if (i === 0) ctx.moveTo(toX(x), toY(z)); else ctx.lineTo(toX(x), toY(z));
      });
      ctx.closePath();
      ctx.fill();
    }
    // The real coastline, the shape the chart drew it: a captain looking at
    // the plot has to see the same headland the lookouts do. Filled even-odd
    // in one path, so a lake or an inland sea comes out as the water it is.
    const land = this.world.land || [];
    if (land.length) {
      ctx.beginPath();
      for (const ring of land) {
        if (ring.length < 3) continue;
        ctx.moveTo(toX(ring[0][0]), toY(ring[0][1]));
        for (let i = 1; i < ring.length; i++) ctx.lineTo(toX(ring[i][0]), toY(ring[i][1]));
        ctx.closePath();
      }
      ctx.fill('evenodd');
    }

    if (snap) {
      ctx.strokeStyle = 'rgba(226,233,242,0.8)';
      ctx.lineWidth = 1.4;
      for (const tp of snap.torps) {
        ctx.beginPath();
        ctx.moveTo(toX(tp.x), toY(tp.z));
        ctx.lineTo(toX(tp.x + Math.sin(tp.h) * 380), toY(tp.z + Math.cos(tp.h) * 380));
        ctx.stroke();
      }
    }

    const marks = [];
    plot.marks = marks;
    this.selfId = own ? own.i : 0;

    // The guns ashore, plotted as the fixed marks they are: a square, because
    // nothing on this plot that moves is drawn as one.
    for (const g of (snap && snap.batteries) || []) {
      const x = toX(g.x), y = toY(g.z);
      const r = 4.6 * k;
      ctx.fillStyle = !g.al ? 'rgba(120,120,120,0.7)'
        : g.tm === this.team ? '#6fd3a0' : '#e2564f';
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      // A hollow surround, so a battery reads as a battery at a glance and is
      // a big enough thing to put a finger on.
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - r * 1.9, y - r * 1.9, r * 3.8, r * 3.8);
      if (g.al) {
        // Which way it is laid, so a captain can see what he must not cross.
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.sin(g.h + g.a) * 14 * k, y - Math.cos(g.h + g.a) * 14 * k);
        ctx.stroke();
      }
      marks.push({ kind: 'battery', id: g.i, x, y, name: BATTERIES[g.b]?.name || 'Battery' });
    }

    // Everything afloat, wherever it is. A hull the lookouts have sighted is a
    // filled counter; one the plot knows about but nobody has eyes on is drawn
    // hollow, so a captain can still tell a report from a sighting -- but both
    // are on the plot, at any range, which is what a plot is for.
    const afloat = [
      ...ships.map((s) => ({ s, seen: true })),
      ...((snap && snap.contacts) || []).map((s) => ({ s, seen: false })),
    ];
    for (const { s, seen } of afloat) {
      const self = own && s.i === own.i;
      const tint = self ? '#e6cf9c' : s.tm === this.team ? '#6fd3a0' : '#e2564f';
      const x = toX(s.x), y = toY(s.z);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-s.h);
      ctx.beginPath();
      ctx.moveTo(0, -7 * k); ctx.lineTo(4 * k, 5.6 * k); ctx.lineTo(-4 * k, 5.6 * k);
      ctx.closePath();
      if (seen) {
        ctx.fillStyle = tint;
        ctx.fill();
        // An outline in the sea's own colour, so two hulls in company still
        // read as two: a solid counter loses its neighbour on a plot this small.
        ctx.strokeStyle = 'rgba(8,24,42,0.85)';
        ctx.lineWidth = 1;
      } else {
        ctx.strokeStyle = tint;
        ctx.lineWidth = 1.5;
      }
      ctx.stroke();
      ctx.restore();
      if (self) {
        // Firing arc of the main battery, so you can see what will bear.
        ctx.strokeStyle = 'rgba(230,207,156,0.35)';
        ctx.beginPath();
        ctx.arc(x, y, this.cls.gun.range * scale, 0, Math.PI * 2);
        ctx.stroke();
      }
      // The course she has been given, drawn from her to the point on the
      // chart it was laid off at. An order you cannot see is an order you
      // cannot tell you have given.
      if (s.wx !== undefined && s.wz !== undefined) {
        const wx = toX(s.wx), wy = toY(s.wz);
        const chosen = s.i === this.selected;
        ctx.save();
        ctx.strokeStyle = chosen ? 'rgba(230,207,156,0.9)' : 'rgba(111,211,160,0.45)';
        ctx.lineWidth = chosen ? 1.8 : 1.2;
        ctx.setLineDash([5 * k, 4 * k]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(wx, wy);
        ctx.stroke();
        // The head, laid on the bearing of the leg it ends.
        ctx.setLineDash([]);
        const a = Math.atan2(wy - y, wx - x);
        const h = 7 * k;
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx - Math.cos(a - 0.42) * h, wy - Math.sin(a - 0.42) * h);
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx - Math.cos(a + 0.42) * h, wy - Math.sin(a + 0.42) * h);
        ctx.stroke();
        ctx.restore();
      }
      // And a ring round the ship the chart is currently conning.
      if (s.i === this.selected) {
        ctx.strokeStyle = '#e6cf9c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 11 * k, 0, Math.PI * 2);
        ctx.stroke();
      }
      marks.push({ kind: 'ship', id: s.i, x, y, name: s.n || 'Contact', team: s.tm });
    }

    // Aircraft, both sides. A squadron is over the map for a minute or two and
    // decides an action while it is there, so it belongs on the plot as much as
    // anything that floats -- and it can be watched, which is the only way to
    // see a strike go in from anywhere but underneath it.
    for (const pl of (snap && snap.planes) || []) {
      const x = toX(pl.x), y = toY(pl.z);
      ctx.strokeStyle = pl.tm === this.team ? '#6fd3a0' : '#e2564f';
      ctx.lineWidth = 1.6;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-pl.h);
      // A swept pair of wings: unmistakably not a hull, at four pixels.
      ctx.beginPath();
      ctx.moveTo(-6.5 * k, 3.8 * k); ctx.lineTo(0, -5 * k); ctx.lineTo(6.5 * k, 3.8 * k);
      ctx.stroke();
      ctx.restore();
      marks.push({
        kind: 'plane', id: pl.i, x, y,
        name: `${pl.n} aircraft`,
      });
    }

    // A ring round whatever the camera is looking at, so it is obvious where
    // the view has gone and what to tap to get out of it.
    if (this.watching) {
      const mark = marks.find((m) => m.kind === this.watching.kind && m.id === this.watching.id);
      if (mark) {
        ctx.strokeStyle = '#e6cf9c';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(mark.x, mark.y, 13 * k, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}
