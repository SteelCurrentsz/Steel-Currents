// The custom battle briefing: a full-bleed chart table rather than a dialog.
//
// Every control here sets something the battle actually uses — the hull you
// take, the hull that leads the other side, how many escorts each side sails
// with, the hour, and which sea. Nothing on this screen is decorative.

import { SHIP_CLASSES, SHIP_ORDER } from '../../shared/ships.js';
import { MAP_PRESETS, TIMES } from '../../shared/world.js';
import { silhouette } from './silhouette.js';
import { drawWorld } from './worldmap.js';

const SKILLS = [
  { id: 'rookie', name: 'Green' },
  { id: 'regular', name: 'Regular' },
  { id: 'veteran', name: 'Veteran' },
];
const TIME_NAMES = { dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night' };

// Where each theatre sits, so the globe button moves the ring on the chart.
// The chart itself always shows the whole world.
const THEATRE_POS = {
  north_atlantic: [-35, 47],
  solomon_narrows: [158, -8],
  coral_shelf: [150, -18],
  open_ocean: [-25, 5],
};

const cycle = (arr, cur, step = 1) => {
  const i = arr.indexOf(cur);
  return arr[(i + step + arr.length) % arr.length];
};

export class Briefing {
  constructor({ onStart, getName, onShipChange, onOpenPicker, onClosePicker,
    initialShip = 'cleveland' }) {
    this.onStart = onStart;
    this.getName = getName;
    this.onShipChange = onShipChange;
    this.onOpenPicker = onOpenPicker;
    this.onClosePicker = onClosePicker;
    this.state = {
      // Your fleet's first hull is the one you take the bridge of; the rest
      // sail under AI captains. The enemy fleet is theirs entirely.
      allyFleet: [initialShip, 'fletcher', 'fletcher', 'fletcher'],
      enemyFleet: ['hipper', 'fletcher', 'fletcher', 'fletcher', 'fletcher'],
      time: 'dawn',
      theatre: MAP_PRESETS[0].id,
      skill: 'regular',
    };

    this.el = {
      canvas: document.getElementById('custom-map-canvas'),
      allyAdd: document.getElementById('ally-add-cell'),
      enemyAdd: document.getElementById('enemy-add-cell'),
      allyDel: document.getElementById('ally-del-cell'),
      enemyDel: document.getElementById('enemy-del-cell'),
      time: document.getElementById('time-val'),
      theatre: document.getElementById('theatre-name'),
      axisSide: document.querySelector('.bh-side.axis'),
    };
    if (!this.el.canvas) return;

    this.bind();
    this.render();
    // The chart is sized by CSS, so it has to be repainted when that changes.
    // A full repaint costs about 20ms, and a drag-resize fires far faster than
    // that, so coalesce them onto the next frame instead of painting per event.
    let pending = 0;
    this.onResize = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => this.paintMap());
    };
    window.addEventListener('resize', this.onResize);
  }

  bind() {
    const on = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
    const s = this.state;

    // The four hull icons: an arrow adds to a fleet, a cross removes from it.
    const press = (el, fn) => {
      if (!el) return;
      el.addEventListener('click', fn);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
      });
    };
    press(this.el.allyAdd, () => this.openPicker('ally', 'add'));
    press(this.el.enemyAdd, () => this.openPicker('enemy', 'add'));
    press(this.el.allyDel, () => this.openPicker('ally', 'remove'));
    press(this.el.enemyDel, () => this.openPicker('enemy', 'remove'));

    on('time-next', () => { s.time = cycle(TIMES, s.time, 1); this.render(); });
    on('theatre-btn', () => {
      s.theatre = cycle(MAP_PRESETS.map((m) => m.id), s.theatre, 1);
      this.render();
      this.paintMap();
    });
    this.el.axisSide?.addEventListener('click', () => {
      s.skill = cycle(SKILLS.map((k) => k.id), s.skill, 1);
      this.render();
    });
  }

  /** One of the four hull buttons. */
  fleetCell(side, mode) {
    const fleet = side === 'ally' ? this.state.allyFleet : this.state.enemyFleet;
    const flip = side === 'enemy';
    const lead = fleet[0] || 'fletcher';
    return `${silhouette(lead, { flip, badge: mode === 'add' ? 'arrow' : 'x' })}
      <b class="count">${fleet.length}</b>`;
  }

  /** The add / remove screen. In add mode it lists the hulls that can join; in
   *  remove mode the ships already in that fleet, so a captain picks which one
   *  leaves rather than losing whichever happened to be last. */
  openPicker(side, mode) {
    this.picker = { side, mode };
    const fleet = side === 'ally' ? this.state.allyFleet : this.state.enemyFleet;
    const yours = side === 'ally';
    document.getElementById('fleet-title').textContent =
      mode === 'add' ? 'Add a ship' : 'Remove a ship';
    document.getElementById('fleet-sub').textContent = mode === 'add'
      ? `Pick a hull to join ${yours ? 'your' : 'the enemy'} fleet.`
      : `Pick a ship to take out of ${yours ? 'your' : 'the enemy'} fleet.`;

    const list = document.getElementById('fleet-list');
    list.innerHTML = '';
    this.onOpenPicker?.();

    if (mode === 'remove' && fleet.length <= 1) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'A fleet cannot put to sea empty. Add another ship first.';
      list.appendChild(p);
    }

    const entries = mode === 'add'
      ? SHIP_ORDER.map((id) => ({ id, index: -1 }))
      : fleet.map((id, index) => ({ id, index }));

    entries.forEach(({ id, index }) => {
      const c = SHIP_CLASSES[id];
      const el = document.createElement('button');
      el.className = 'ship-card';
      el.type = 'button';
      const flagship = mode === 'remove' && index === 0 && yours;
      el.innerHTML = `<div class="type">${c.type} · ${c.typeName}</div>
        <div class="nm">${c.name}</div>
        <div class="bl">${flagship ? 'Your bridge' : c.blurb}</div>`;
      if (mode === 'remove' && fleet.length <= 1) el.disabled = true;
      el.onclick = () => {
        if (mode === 'add') fleet.push(id);
        else fleet.splice(index, 1);
        if (side === 'ally') this.onShipChange?.(this.state.allyFleet[0]);
        this.render();
        this.onClosePicker?.();
      };
      list.appendChild(el);
    });
  }

  render() {
    const s = this.state;
    this.el.allyAdd.innerHTML = this.fleetCell('ally', 'add');
    this.el.enemyAdd.innerHTML = this.fleetCell('enemy', 'add');
    this.el.allyDel.innerHTML = this.fleetCell('ally', 'remove');
    this.el.enemyDel.innerHTML = this.fleetCell('enemy', 'remove');
    this.el.time.textContent = TIME_NAMES[s.time] || s.time;
    this.el.theatre.textContent = MAP_PRESETS.find((m) => m.id === s.theatre).name;
    if (this.el.axisSide) {
      this.el.axisSide.textContent = `Enemy Forces · ${SKILLS.find((k) => k.id === s.skill).name}`;
    }
  }

  paintMap() {
    if (!this.el.canvas) return;
    const theatre = MAP_PRESETS.find((m) => m.id === this.state.theatre);
    // Zoom 1 fits all 360 degrees across the width. Filling the height instead
    // would crop the east and west edges — and losing the Pacific from a world
    // map to avoid a band of empty ocean is the wrong trade.
    const c = this.el.canvas;
    drawWorld(c, {
      focus: [0, 8], zoom: 1,
      marker: THEATRE_POS[this.state.theatre] || THEATRE_POS.open_ocean,
      markerName: theatre?.name || '',
    });
  }

  /** Called when the screen becomes visible: the canvas has no size until then. */
  show() {
    this.render();
    this.paintMap();
  }

  request() {
    const s = this.state;
    return {
      t: 'custom',
      name: this.getName(),
      roomName: `${this.getName()}'s battle`,
      classId: s.allyFleet[0],
      allyClasses: s.allyFleet.slice(1),
      enemyClasses: s.enemyFleet,
      mapId: s.theatre,
      time: s.time,
      allies: s.allyFleet.length - 1,
      enemies: s.enemyFleet.length,
      botSkill: s.skill,
      private: true,
    };
  }
}
