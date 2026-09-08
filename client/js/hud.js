// Bridge instruments: the conn keys and their panels, damage state, the plot
// and the feeds. Her guns are fought by her own officers and have no controls
// here; what a captain works is her speed, her aircraft and her damage control,
// and he lays her course off on the plot.

import { SHIP_CLASSES } from '../../shared/ships.js';
import { MAP_HALF, islandRing } from '../../shared/world.js';
import { BATTERIES } from '../../shared/batteries.js';
import { MPS_TO_KNOTS, clamp, wrapAngle, angleDelta, dist } from '../../shared/math.js';
import { SECTIONS, torpedoClear } from '../../shared/sim.js';
import { getSettings } from './settings.js';

const $ = (id) => document.getElementById(id);

// The engine-room telegraph, bottom to top: astern, stop, and up through her
// speeds. The order is the lever's order, not an array's.
const NOTCHES = ['ASTERN', 'STOP', 'SLOW', 'HALF', 'FULL', 'FLANK'];

/**
 * What the next call-away will do, on the chip and on the button.
 *
 * Damage control goes in two stages and the difference matters a great deal:
 * the first gets the party to the bulkheads and shores what it can reach,
 * which slows the sea and does not stop it, and only the second gets the pumps
 * going. A captain has to be able to see which of the two he is about to
 * order, so the button says so.
 */
const DC_NEXT = ['SHORE', 'PUMPS', 'READY'];
const DC_ORDER = ['Shore up', 'Start pumps', 'Damage control'];

const PANEL_TITLES = {
  helm: 'ENGINE', dmg: 'DAMAGE', arms: 'ARSENAL', air: 'AIR GROUP',
  ship: 'DAMAGE CONTROL',
};

const M_TO_YARDS = 1.09361;

/** What a mounting is allowed to engage, in the words a gunnery officer uses. */
const ROLE_LABEL = {
  surface: 'Surface', aa: 'Air', dp: 'Dual purpose', sub: 'Submarine',
};

/**
 * Everything she carries, in the order a gunnery officer would list it:
 * the main battery, the secondary, the light battery, and then whatever else
 * is aboard that goes off.
 *
 * Each entry is what the arsenal panel shows -- the mounting's name, its bore,
 * how long it takes to load, how far it reaches and what it may be laid on.
 */
export function arsenal(cls) {
  const rows = [];
  const barrels = (mounts) => mounts.reduce((n, m) => n + (m.guns || 1), 0);
  // What the gun will go through, in millimetres of belt armour at a fighting
  // range. The armour-piercing round where there is one, because that is the
  // round the figure is about: high explosive is fused to burst on the plate
  // and its "penetration" is a sixth of the bore whatever the gun.
  const pierce = (battery) => {
    if (!battery || !battery.shells) return null;
    const ap = battery.shells.ap || battery.shells.he;
    return ap ? ap.pen : null;
  };
  if (cls.gun) {
    rows.push({
      name: cls.gun.name || `${cls.gun.caliber} mm`,
      caliber: cls.gun.caliber,
      barrels: barrels(cls.turrets),
      mounts: cls.turrets.length,
      reload: cls.gun.reload,
      range: cls.gun.range,
      role: cls.gun.role || 'surface',
      pen: pierce(cls.gun),
      band: 'Main battery',
      specs: cls.turrets,
      // Which array on the wire says what condition each of these mountings
      // is in. Her main and secondary batteries are laid and fired mounting by
      // mounting and the simulation keeps state for each; her close-range guns
      // are not, so their condition is worked out from the piece of ship they
      // stand on.
      cond: 'gc',
    });
  }
  if (cls.secondary) {
    rows.push({
      name: cls.secondary.name,
      caliber: cls.secondary.caliber,
      barrels: barrels(cls.secondary.mounts),
      mounts: cls.secondary.mounts.length,
      reload: cls.secondary.reload,
      range: cls.secondary.range,
      role: cls.secondary.role || 'dp',
      pen: pierce(cls.secondary),
      band: 'Secondary battery',
      specs: cls.secondary.mounts,
      cond: 'sc',
    });
  }
  // Where each light gun's mountings start in the flat close-range battery.
  // The arsenal lists them gun type by gun type; the model builds them in the
  // same order and the simulation names them in the same order, and this is
  // what ties a row's third mounting to the ship's third mounting of that gun.
  let lightAt = 0;
  for (const g of (cls.aa && cls.aa.guns) || []) {
    rows.push({
      lightAt,
      name: g.name,
      caliber: g.caliber,
      barrels: barrels(g.mounts),
      mounts: g.mounts.length,
      reload: g.reload,
      range: g.range,
      role: g.role || 'aa',
      // An automatic gun has no shell table of its own: what a 40 mm will go
      // through is what any shell of that bore fused to burst on the plate
      // will, which is about a sixth of it.
      pen: Math.round(g.caliber / 6),
      band: 'Light battery',
      specs: g.mounts,
    });
    lightAt += g.mounts.length;
  }
  if (cls.torpedoes) {
    const T = cls.torpedoes;
    rows.push({
      name: T.name || 'Torpedo',
      caliber: T.caliber || 533,
      barrels: T.mounts.reduce((n, m) => n + m.tubes, 0),
      mounts: T.mounts.length,
      reload: T.reload,
      range: T.range,
      role: T.role || 'surface',
      // A torpedo does not go through armour. It goes off against her side
      // under the belt and opens thirty square metres of her to the sea, so
      // there is no penetration figure to give.
      pen: null,
      band: 'Torpedo tubes',
      specs: T.mounts.map((m) => ({ ...m, guns: m.tubes })),
      // Tubes have a second thing in their way besides their own training
      // gear: the ship they are bolted to. See torpedoClear.
      hull: cls,
    });
  }
  if (cls.depthCharges) {
    const D = cls.depthCharges;
    rows.push({
      name: D.name,
      caliber: null,
      barrels: D.racks + D.throwers,
      mounts: D.racks + D.throwers,
      reload: null,
      range: null,
      role: D.role || 'sub',
      // A depth charge does not pierce anything. It goes off under a boat and
      // crushes her, which is a different question entirely.
      pen: null,
      band: 'Depth charges',
      note: `${D.racks} racks, ${D.throwers} throwers, ${D.carried} carried`,
    });
  }
  return rows;
}

/**
 * What the bridge you are standing on has its guns laid on.
 *
 * `shown` is the ship the camera is on -- your own, or whoever you have picked
 * off the plot and are watching. She picks her own target: her gunnery officer
 * does, whoever has the con, and she carries who it is in her snapshot. All
 * this does is find that ship on the plot and read her off it.
 *
 * The range is from `own` -- your own hull -- rather than from the bridge the
 * camera happens to be standing on. The plot in the corner is your chart table
 * and the mark in the middle of it is you; this is that same range written
 * out. Her speed is only there when your side has actually sighted her: a ship
 * that is a mark on the plot has a position and a heading and no more, and
 * guessing at her speed off those would be inventing it.
 *
 * Null when she is not shooting at anything, or when what she picked has since
 * gone down.
 */
export function readTarget(shown, snap, own) {
  if (!shown || !snap || !own || !shown.tg) return null;
  const her = snap.ships.find((s) => s.i === shown.tg)
    || (snap.contacts || []).find((s) => s.i === shown.tg);
  if (!her) return null;
  return {
    name: her.n || 'Contact',
    range: dist(own.x, own.z, her.x, her.z),
    speed: her.v === undefined ? null : Math.abs(her.v) * MPS_TO_KNOTS,
  };
}

export class Hud {
  constructor({ team, world, onLeave }) {
    this.team = team;
    this.world = world;
    this.el = {
      ownName: $('own-name'), condRow: $('cond-row'),
      status: $('status-row'),
      targetPlate: $('target-plate'), targetName: $('target-name'),
      shellCam: $('shell-cam'),
      targetLine: $('target-line'),
      connKeys: $('conn-keys'), connPanel: $('conn-panel'),
      connTitle: $('conn-panel-title'), connSub: $('conn-panel-sub'),
      flyTake: $('fly-take'), cockpit: $('cockpit'), hudLeft: $('hud-left'),
      flySpeed: $('fly-speed'), flyAlt: $('fly-alt'), flyG: $('fly-g'),
      flyThr: $('fly-thr'), flyStall: $('fly-stall'),
      flyThrottle: $('fly-throttle'), flyThrottleFill: $('fly-throttle-fill'),
      flySwipe: $('fly-swipe'), flyHint: $('fly-hint'),
      flyReticle: $('fly-reticle'),
      flyGuns: $('fly-guns'), flyDrop: $('fly-drop'), flyLeave: $('fly-leave'),
      connBody: $('conn-panel-body'),
      timer: $('battle-timer'),
      killfeed: $('killfeed'),
      ribbons: $('ribbons'), alerts: $('alerts'), scoreboard: $('scoreboard'),
      scoreTable: $('scoreboard-table'), minimap: $('minimap'), minimapWrap: $('minimap-wrap'),
      hudRight: $('hud-right'), hudTop: $('hud-top'),
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
    // The way home once the action is over. Hidden until there is one.
    this.el.port = $('btn-port');
    if (this.el.port) this.el.port.onclick = onLeave;
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
    if (!watch) return;
    // Riding a round is neither being aboard something nor standing off it,
    // and there is no bridge on a shell to swap to, so the swap goes away.
    const shell = watch.kind === 'shell';
    this.el.watchWhat.textContent = shell
      ? `Riding ${watch.name}'s salvo`
      : `${pov ? 'Aboard' : 'Watching'} ${watch.name}`;
    const swap = document.getElementById('watch-swap');
    if (swap) swap.hidden = shell;
  }

  buildFor(classId) {
    const cls = SHIP_CLASSES[classId];
    this.cls = cls;
    // Whose ship the plate at the bottom is reading. Your own until you pick
    // somebody else off the chart; see setShown.
    this.shown = cls;

    // What a captain still does himself. Three keys, and each raises one panel.
    this.keys = {};
    for (const el of this.el.connKeys.querySelectorAll('.conn-key')) {
      this.keys[el.dataset.panel] = el;
      el.onclick = () => this.togglePanel(el.dataset.panel);
    }
    this.panel = null;
    this.acts = {};

    this.built = true;
    this.showKeys(cls);
  }

  /**
   * The keys a ship actually has. No aircraft aboard, no air key -- hidden
   * rather than taken away, because the next ship read out on this plate may
   * be a carrier.
   */
  showKeys(cls) {
    if (this.keys && this.keys.air) this.keys.air.hidden = !cls.planes;
  }

  /**
   * Read out somebody else's ship.
   *
   * Everything on the plate -- her name and class, her compartments, her
   * telegraph, her arsenal -- is her own. It used to be yours whoever you were
   * watching, so a captain standing on a destroyer's bridge was shown a
   * battleship's condition and a battleship's guns.
   *
   * Panels are built against a class, so whatever is up comes down and is
   * built again for her the next time it is raised.
   */
  setShown(classId) {
    const cls = SHIP_CLASSES[classId];
    if (!this.built || !cls || cls === this.shown) return;
    this.shown = cls;
    this.showKeys(cls);
    if (this.panel) {
      const was = this.panel;
      this.togglePanel(was);
      // 'air' on a ship that has none has no key to raise it; anything else
      // comes straight back up, built for her.
      if (was !== 'air' || cls.planes) this.togglePanel(was);
    }
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
   * Her condition on the ship plate, in a line of plain English.
   *
   * There used to be a row of six little meters here, one per compartment,
   * each with the name of a magazine or a boiler room on it. That is an
   * inventory rather than a damage report, and it is the second one on the
   * screen: the damage board above draws the same six compartments on a
   * drawing of the ship, where a hole is in a place instead of being a number
   * beside a label. So the plate says what a bridge messenger would say --
   * how many holes are in her and what the worst of it is -- and anybody who
   * wants to know which compartment opens the board.
   */
  paintCondition(sec) {
    if (!this.condCount) {
      this.el.condRow.innerHTML = '';
      this.condCount = document.createElement('span');
      this.el.condRow.appendChild(this.condCount);
    }
    let holes = 0;
    let gone = 0;
    SECTIONS.forEach((s, i) => {
      const c = (sec && sec[i]) || [100, 0];
      holes += c[1];
      if (c[0] <= 0) gone++;
    });
    const worst = Math.min(...SECTIONS.map((s, i) => ((sec && sec[i]) ? sec[i][0] : 100)));
    const bits = [];
    if (holes) bits.push(`${holes} hole${holes === 1 ? '' : 's'}`);
    if (gone) bits.push(`${gone} compartment${gone === 1 ? '' : 's'} open`);
    if (!bits.length) bits.push(worst >= 99 ? 'sound' : `${worst}%`);
    this.condCount.textContent = bits.join(' · ');
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
      // No meters. Her condition is read off the ship herself, on the board
      // above: a row of six bars labelled "forward magazine" and "after
      // boiler room" is an inventory, not a damage report. What a damage
      // control officer wants is to see where she is open and where the water
      // has got to, on a drawing of the ship -- so that is all there is, and
      // the line under it is the summary a messenger would give.
      let holes = 0;
      SECTIONS.forEach((s, i) => {
        holes += ((own.sec && own.sec[i]) || [100, 0])[1];
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
    if (this.panel === 'arms') { this.paintArsenal(own); return; }
    // What the next call-away will do, not what the last one did: the first
    // shores the holes and buys her time, and it takes a second to get the
    // pumps going. A captain has to be able to see which one he is about to
    // order.
    const stage = Math.min(2, own.dc || 0);
    set('repair', own.rc > 0 ? `${Math.ceil(own.rc)}s` : DC_NEXT[stage],
      own.rc <= 0 ? 'ready' : 'spent');
    const rep = this.acts.repair && this.acts.repair.querySelector('span');
    if (rep) rep.textContent = DC_ORDER[stage];
    set('smoke', `×${own.smk ?? 0}`,
      own.sm === 1 ? 'active' : (own.smk ?? 0) > 0 ? 'ready' : 'spent');
    const hurt = (own.f || 0) + (own.fl || 0);
    this.el.connSub.textContent = stage >= 2 && (own.fl || 0)
      ? `pumping, ${own.fl} flooded`
      : hurt ? `${hurt} to fight` : 'sound';
  }

  /**
   * What to do when something on a conn panel is pressed.
   *
   * One handler for the lot: 'notch' with a number for the telegraph, and a
   * name for everything else -- 'air', 'plane', 'repair', 'smoke'.
   */
  onConn(fn) { this.connFn = fn; }

  /**
   * Put the way home in the corner, or take it away.
   *
   * Nothing else changes when it appears: the sea, the wrecks and the smoke go
   * on being drawn, the plot still works and the camera still walks. It is a
   * key, not a curtain.
   */
  showPortKey(on) {
    if (this.el.port) this.el.port.hidden = !on;
  }

  /** Raise a panel, or lower the one that is up. */
  togglePanel(which) {
    this.panel = this.panel === which ? null : which;
    for (const [k, el] of Object.entries(this.keys || {})) {
      el.classList.toggle('on', k === this.panel);
    }
    this.el.connPanel.hidden = !this.panel;
    this.el.connPanel.classList.toggle('wide', this.panel === 'dmg');
    this.el.connPanel.classList.toggle('tall', this.panel === 'arms');
    if (!this.panel) return;
    this.el.connTitle.textContent = PANEL_TITLES[this.panel] || '';
    this.el.connBody.innerHTML = '';
    this.acts = {};
    if (this.panel === 'helm') this.buildHelmPanel();
    else if (this.panel === 'dmg') this.buildDamagePanel();
    else if (this.panel === 'arms') this.buildArsenalPanel();
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
    // No list of meters underneath. The board is the ship, and everything
    // that used to be in the rows -- what is left of each compartment, how
    // many holes are in it, how much water is in it -- is drawn on her.
    this.boardRows = null;
    const note = document.createElement('p');
    note.className = 'conn-note';
    note.textContent = 'Drag to turn her · pinch or scroll to come in';
    this.el.connBody.appendChild(note);
    this.onBoard?.(cv);
  }

  /**
   * The cockpit: the whole screen is the stick, and the sight does not move.
   *
   * There used to be a joystick drawn in the bottom left corner, and a stick
   * drawn on the glass is the worst of both worlds -- it covers a fifth of the
   * picture, it has to be found before it can be used, and a thumb that slides
   * off the edge of it stops flying the aeroplane without saying so. So there
   * is no stick. A white ring sits in the middle of the screen where the guns
   * point, and a swipe started anywhere that is not a button flies her: where
   * the thumb went down is the middle, and how far it has moved from there is
   * how hard she is being hauled round. Lift it and she rolls level on her own.
   *
   * Everything is pointer events rather than touch events, so it works the
   * same under a finger and under a mouse.
   */
  bindCockpit(fns) {
    this.fly = { pitch: 0, roll: 0, throttle: 1, firing: false };
    this.flyFns = fns || {};
    const el = this.el;
    if (!el.flySwipe) return;

    // ---- the swipe -------------------------------------------------------
    // How far the thumb has to travel for full deflection. A share of the
    // smaller screen dimension rather than a number of pixels, so the same
    // gesture flies her the same way on a phone and on a desktop.
    const reach = () => Math.max(70, Math.min(window.innerWidth, window.innerHeight) * 0.20);
    let swipeId = null;
    let ox = 0;
    let oy = 0;
    const swipeAt = (ev) => {
      const rad = reach();
      let dx = (ev.clientX - ox) / rad;
      let dy = (ev.clientY - oy) / rad;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      this.fly.roll = dx;
      // Screen down is nose up, which is what a stick does.
      this.fly.pitch = -dy;
    };
    const swipeOff = () => {
      swipeId = null;
      this.fly.roll = 0;
      this.fly.pitch = 0;
      el.flySwipe.classList.remove('held');
    };
    el.flySwipe.addEventListener('pointerdown', (ev) => {
      swipeId = ev.pointerId;
      ox = ev.clientX;
      oy = ev.clientY;
      el.flySwipe.setPointerCapture(ev.pointerId);
      el.flySwipe.classList.add('held');
      // Said once, then out of the way.
      if (el.flyHint) el.flyHint.classList.add('gone');
      ev.preventDefault();
    });
    el.flySwipe.addEventListener('pointermove', (ev) => {
      if (ev.pointerId === swipeId) swipeAt(ev);
    });
    for (const k of ['pointerup', 'pointercancel', 'pointerleave']) {
      el.flySwipe.addEventListener(k, (ev) => {
        if (ev.pointerId === swipeId) swipeOff();
      });
    }

    // ---- the throttle ----------------------------------------------------
    let thrId = null;
    const thrAt = (ev) => {
      const r = el.flyThrottle.getBoundingClientRect();
      const t = clamp(1 - (ev.clientY - r.top) / r.height, 0, 1);
      this.fly.throttle = t;
      el.flyThrottleFill.style.height = `${t * 100}%`;
    };
    el.flyThrottle.addEventListener('pointerdown', (ev) => {
      thrId = ev.pointerId;
      el.flyThrottle.setPointerCapture(ev.pointerId);
      thrAt(ev);
      ev.preventDefault();
    });
    el.flyThrottle.addEventListener('pointermove', (ev) => {
      if (ev.pointerId === thrId) thrAt(ev);
    });
    for (const k of ['pointerup', 'pointercancel']) {
      el.flyThrottle.addEventListener(k, (ev) => { if (ev.pointerId === thrId) thrId = null; });
    }

    // ---- the triggers ----------------------------------------------------
    const hold = (btn, on, off) => {
      btn.addEventListener('pointerdown', (ev) => {
        btn.setPointerCapture(ev.pointerId);
        on();
        ev.preventDefault();
      });
      for (const k of ['pointerup', 'pointercancel', 'pointerleave']) {
        btn.addEventListener(k, () => off());
      }
    };
    hold(el.flyGuns,
      () => { this.fly.firing = true; el.flyGuns.classList.add('on'); },
      () => { this.fly.firing = false; el.flyGuns.classList.remove('on'); });
    el.flyDrop.onclick = () => this.flyFns.drop?.();
    el.flyLeave.onclick = () => this.flyFns.leave?.();
    el.flyTake.onclick = () => this.flyFns.take?.();
  }

  /** Raise or lower the "take this aeroplane" button. */
  setFlyOffer(on) {
    if (this.el.flyTake) this.el.flyTake.hidden = !on;
  }

  /**
   * What this aeroplane fights with, on the buttons.
   *
   * A fighter has no bomb and no torpedo, and a DROP key that does nothing at
   * all when it is pressed is worse than no key: it says she is carrying
   * something. So the key carries the name of what is actually on the rack,
   * and a fighter does not get one.
   */
  setArmament(what) {
    const el = this.el;
    if (!el.flyDrop) return;
    if (!what) { el.flyDrop.hidden = true; return; }
    el.flyDrop.hidden = false;
    el.flyDrop.textContent = what;
  }

  /** The sight goes red when there is something under it. */
  setSightHot(on) {
    if (this.el.flyReticle) this.el.flyReticle.classList.toggle('hot', !!on);
  }

  /** In the cockpit, or back on the bridge. */
  setCockpit(on) {
    if (this.el.cockpit) this.el.cockpit.hidden = !on;
    if (this.el.connKeys) this.el.connKeys.style.display = on ? 'none' : '';
    // Her condition is a thing for her bridge, and it is not the pilot's.
    if (this.el.hudLeft) this.el.hudLeft.style.display = on ? 'none' : '';
    // Nor is the plot, nor the clock. They are the fleet's instruments, and up
    // there they take the top right corner of the sky and swallow every swipe
    // that starts in it -- which, now that a swipe anywhere is the stick, is a
    // corner of the screen the aeroplane cannot be flown from.
    if (this.el.hudRight) this.el.hudRight.style.display = on ? 'none' : '';
    if (this.el.hudTop) this.el.hudTop.style.display = on ? 'none' : '';
    if (on) {
      this.panel = null;
      if (this.el.connPanel) this.el.connPanel.hidden = true;
      for (const k of Object.values(this.keys || {})) k.classList.remove('on');
      this.setFlyOffer(false);
      // Full throttle on the way in: nobody takes an aeroplane to idle it.
      this.fly.throttle = 1;
      if (this.el.flyThrottleFill) this.el.flyThrottleFill.style.height = '100%';
      // And she starts with the stick central, whatever was left over from
      // the last time somebody flew.
      this.fly.pitch = 0;
      this.fly.roll = 0;
      this.fly.firing = false;
      if (this.el.flySwipe) this.el.flySwipe.classList.remove('held');
      if (this.el.flyHint) this.el.flyHint.classList.remove('gone');
      this.setSightHot(false);
    }
  }

  /** What the pilot reads: speed, height, what the wing is carrying. */
  paintCockpit(p) {
    const el = this.el;
    if (!el.flySpeed || !p) return;
    el.flySpeed.textContent = Math.round(p.v * 1.94384);
    el.flyAlt.textContent = Math.round(p.y * 3.28084);
    el.flyG.textContent = p.g.toFixed(1);
    el.flyThr.textContent = Math.round(this.fly.throttle * 100);
    el.flyStall.hidden = p.stall < 0.25;
    el.flyDrop.classList.toggle('spent', !p.armed);
  }

  /** Say who builds the hologram, so the HUD need not import a renderer. */
  onDamageBoard(fn) { this.onBoard = fn; }

  /**
   * The arsenal: every gun, tube and charge aboard, and what each may engage.
   *
   * Read off the class rather than off the snapshot, because it is her
   * armament and not her state: what she carries does not change during an
   * action. Ranges are in yards, which is what a gunnery officer would have
   * been given them in.
   */
  buildArsenalPanel() {
    this.armsRows = [];
    const list = document.createElement('div');
    list.className = 'arms-list';
    let band = null;
    for (const w of arsenal(this.shown)) {
      if (w.band !== band) {
        band = w.band;
        const h = document.createElement('div');
        h.className = 'arms-band';
        h.textContent = band;
        list.appendChild(h);
      }
      const row = document.createElement('div');
      row.className = 'arms-row';
      const mounts = w.mounts > 1 && w.barrels !== w.mounts
        ? `${w.barrels} barrels in ${w.mounts} mounts`
        : `${w.barrels} ${w.barrels === 1 ? 'mount' : 'mounts'}`;
      const stats = [];
      if (w.caliber) stats.push(['Calibre', `${w.caliber} mm`]);
      if (w.reload != null) {
        stats.push(['Reload', w.reload >= 1 ? `${w.reload.toFixed(1)} s` : `${Math.round(60 / w.reload)} rpm`]);
      }
      if (w.range != null) {
        stats.push(['Range', `${Math.round(w.range * M_TO_YARDS).toLocaleString()} yd`]);
      }
      if (w.pen != null) stats.push(['Penetration', `${w.pen} mm`]);
      stats.push(['Target', ROLE_LABEL[w.role] || w.role]);
      row.innerHTML = `<div class="arms-name">${w.name}</div>`
        + `<div class="arms-sub">${w.note || mounts}</div>`
        + `<dl class="arms-stats">${stats
          .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`
        + (w.specs ? '<div class="arms-bear"></div>' : '');
      list.appendChild(row);
      const entry = { w, el: row.querySelector('.arms-bear'), row };
      this.armsRows.push(entry);
      // Press it and she appears underneath with that battery lit up on her.
      //
      // A list of guns tells you what she carries and not where any of it is,
      // and "eight 5 inch in four sponsons" means nothing until you have seen
      // which four lumps of the ship they are. Press it again and she goes
      // away, because the list is what the panel is for.
      if (w.specs) {
        row.classList.add('clickable');
        row.tabIndex = 0;
        const show = () => this.showArsenalShip(entry);
        row.addEventListener('click', show);
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); }
        });
      }
    }
    this.el.connBody.appendChild(list);
    this.armsList = list;
  }

  /**
   * Show the ship under the weapon that was pressed, with it lit up on her.
   *
   * One hologram, moved from row to row rather than one per battery: it
   * carries a renderer and a whole ship model, and there is no reason to have
   * five of them when only one can be looked at.
   */
  showArsenalShip(entry) {
    const open = this.armsShown === entry;
    if (this.armsWrap && this.armsWrap.parentNode) {
      this.armsWrap.parentNode.removeChild(this.armsWrap);
    }
    for (const r of this.armsRows) r.row.classList.toggle('on', false);
    this.armsShown = open ? null : entry;
    if (open) return;
    entry.row.classList.add('on');
    if (!this.armsWrap) {
      this.armsWrap = document.createElement('div');
      this.armsWrap.className = 'board-wrap arms-board';
      const cv = document.createElement('canvas');
      cv.className = 'board-canvas';
      this.armsWrap.appendChild(cv);
      this.armsCanvas = cv;
      // A hologram of a gun is worth looking at; a hologram you can press to
      // go and stand at that gun is worth knowing about.
      const hint = document.createElement('p');
      hint.className = 'arms-hint';
      hint.textContent = 'Press a mounting to man it';
      this.armsWrap.appendChild(hint);
    }
    entry.row.insertAdjacentElement('afterend', this.armsWrap);
    this.onArms?.(this.armsCanvas, entry.w.specs, entry.w);
  }

  /** Say who builds the arsenal hologram, so the HUD need not import one. */
  onArsenalBoard(fn) { this.onArms = fn; }

  /**
   * Put the gun sight up, or take it down.
   *
   * `gun` is the mounting being held. Her close-range battery gets no trigger,
   * because it does not have one: an automatic gun fires for as long as it is
   * laid, and the only decision its layer makes is when to stop.
   */
  setGunSight(gun) {
    const el = this.el.gunSight || (this.el.gunSight = document.getElementById('gun-sight'));
    const fire = this.el.gunFire || (this.el.gunFire = document.getElementById('gun-fire'));
    if (!el) return;
    el.hidden = !gun;
    if (fire) fire.hidden = !gun || !!gun.auto;
    if (!gun && this.el.gunRead) this.el.gunRead.textContent = '';
  }

  /**
   * What the sight says: the range she is laid at and whether she can get
   * there at all.
   *
   * Yards, like every other range in the game, because a gunnery officer works
   * in yards. A mounting laid outside its own arc says so and the sight goes
   * red -- a gun on the stops is still a gun, and the man on it has to be able
   * to see that it is on them.
   */
  setGunReading(gun, at, own) {
    const el = this.el.gunSight || (this.el.gunSight = document.getElementById('gun-sight'));
    const read = this.el.gunRead || (this.el.gunRead = document.getElementById('gun-read'));
    if (!el || !gun || !at) return;
    const yards = Math.round((at.range || 0) * 1.0936);
    const beyond = at.range > (gun.range || 0);
    // Whether her own structure is in the way, which the ship works out and
    // the wire reports as the mounting not being laid.
    const masked = beyond || !at.onSea && !gun.auto;
    el.classList.toggle('masked', !!masked);
    const bits = [`${yards.toLocaleString()} yd`];
    // Who she is laid on, when the sight is on a hull rather than on water.
    if (at.name) bits.unshift(at.name.toUpperCase());
    if (gun.auto) bits.push('AUTO');
    else if (own && own.cd && gun.kind === 'main') {
      const cd = own.cd[gun.id ?? gun.index];
      bits.push(cd > 0 ? `RELOAD ${cd.toFixed(1)}` : 'READY');
    } else if (own && own.sd && gun.kind === 'sec') {
      const cd = own.sd[gun.id ?? gun.index];
      bits.push(cd > 0 ? `RELOAD ${cd.toFixed(1)}` : 'READY');
    } else if (own && own.tp && gun.kind === 'torp') {
      const cd = own.tp[gun.id ?? gun.index];
      bits.push(cd > 0 ? `RELOAD ${Math.round(cd)}` : 'READY');
    }
    if (beyond) bits.push('OUT OF RANGE');
    read.textContent = bits.join('   ');
    const fire = this.el.gunFire || (this.el.gunFire = document.getElementById('gun-fire'));
    if (fire && !gun.auto) {
      const i = gun.id ?? gun.index;
      const cd = gun.kind === 'main' ? own?.cd?.[i]
        : gun.kind === 'sec' ? own?.sd?.[i] : own?.tp?.[i];
      fire.classList.toggle('spent', !!(cd > 0) || beyond);
    }
  }

  /**
   * How much of each battery can be laid on where she is aiming.
   *
   * This is the firing arcs made visible. A ship steering straight at her
   * target has half her guns masked by her own bow and the panel says so; put
   * the wheel over and watch the count come up. It is the single most useful
   * thing a gunnery officer knows and there was no way to see it.
   */
  paintArsenal(own) {
    if (!this.armsRows || !this.armsRows.length) return;
    const world = Math.atan2((own.ax ?? own.x) - own.x, (own.az ?? own.z) - own.z);
    const local = wrapAngle(world - own.h);
    let onMain = 0;
    let ofMain = 0;
    for (const { w, el } of this.armsRows) {
      if (!el || !w.specs) continue;
      let on = 0;
      for (const m of w.specs) {
        if (Math.abs(angleDelta(m.angle, local)) > m.arc) continue;
        // A bank of tubes trained down her own forecastle bears on nothing.
        if (w.hull && !torpedoClear(w.hull, m, local)) continue;
        on += m.guns || 1;
      }
      if (w.band === 'Main battery') { onMain = on; ofMain = w.barrels; }
      el.textContent = on === w.barrels
        ? 'All bearing'
        : on === 0 ? 'Masked — cannot bear' : `${on} of ${w.barrels} bearing`;
      el.classList.toggle('masked', on === 0);
      el.classList.toggle('part', on > 0 && on < w.barrels);
    }
    this.el.connSub.textContent = ofMain
      ? `${onMain} of ${ofMain} bearing` : '';
  }

  /** The air group, or the damage control parties. */
  buildActionPanel(which) {
    const cls = this.shown;
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

  /**
   * A range, in yards.
   *
   * Every distance in the game is in yards, because that is the unit the guns
   * are laid in, the unit the rangefinders read in and the unit written on the
   * chart scale -- and a readout that says 11.5 km beside a plot whose bar says
   * 2,200 yd is two different ships in the same battle.
   *
   * Rounded the way a range is called: to the nearest ten close in, and to the
   * nearest fifty once it is a gunnery range, because nobody calls a range to
   * the yard at twelve thousand.
   */
  formatRange(m) {
    const yd = m * M_TO_YARDS;
    const step = yd < 1000 ? 10 : 50;
    return `${(Math.round(yd / step) * step).toLocaleString('en-US')} yd`;
  }

  /**
   * What the bridge you are standing on is shooting at.
   *
   * Her name, and under it how far she is from your own hull and how fast she
   * is going. The range is yours rather than the spectated ship's on purpose:
   * the plot in the corner is your chart table and the mark in the middle of
   * it is you, and this is that same range written out.
   *
   * Her speed is only there when your side can actually see her. A ship
   * nobody has sighted is a mark on the plot with a position and a heading,
   * and guessing at her speed off two of those would be inventing it.
   */
  /**
   * The shell camera key, beside the target plate.
   *
   * Shown only when the ship being watched has something in the air to
   * follow: a key that does nothing when it is pressed is worse than no key.
   * `on` lights it while the camera is riding a round.
   */
  setShellCam(available, on) {
    const el = this.el.shellCam;
    if (!el) return;
    el.hidden = !available;
    el.classList.toggle('on', !!on);
  }

  /** What the shell key does when it is pressed. */
  bindShellCam(fn) {
    if (this.el.shellCam) this.el.shellCam.onclick = () => fn();
  }

  setTarget(t) {
    const el = this.el.targetPlate;
    if (!el) return;
    el.classList.toggle('idle', !t);
    this.el.targetName.textContent = t ? t.name : 'NO TARGET';
    if (!t) { this.el.targetLine.textContent = ''; return; }
    const kn = t.speed === null ? null : `${t.speed.toFixed(0)} KN`;
    this.el.targetLine.textContent = kn
      ? `${this.formatRange(t.range)} · ${kn}`
      : this.formatRange(t.range);
  }

  update(own, snap) {
    if (!this.built || !own) return;
    const cls = this.shown;

    this.el.ownName.textContent = `${own.n || ''} · ${cls.name} (${cls.type})`;
    // Her condition, in a line: how many holes are in her and how much of her
    // is open. Where they are is on the board, drawn on the ship.
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
      // Time in action, counting up. It used to count down to a hooter that
      // ended the battle on points; there is no hooter and there are no
      // points, so what a clock is for now is telling you how long you have
      // been at it.
      const t = Math.max(0, snap.time);
      this.el.timer.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
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
