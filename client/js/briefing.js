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
  constructor({ onStart, getName, onShipChange, initialShip = 'cleveland' }) {
    this.onStart = onStart;
    this.getName = getName;
    this.onShipChange = onShipChange;
    this.state = {
      allyShip: initialShip,
      axisShip: 'hipper',
      allyEscorts: 3,
      axisEscorts: 4,
      time: 'dawn',
      theatre: MAP_PRESETS[0].id,
      skill: 'regular',
    };

    this.el = {
      canvas: document.getElementById('custom-map-canvas'),
      allyShip: document.getElementById('ally-ship-cell'),
      axisShip: document.getElementById('axis-ship-cell'),
      allyEscort: document.getElementById('ally-escort-cell'),
      axisEscort: document.getElementById('axis-escort-cell'),
      time: document.getElementById('time-val'),
      theatre: document.getElementById('theatre-name'),
      axisSide: document.querySelector('.bh-side.axis'),
    };
    if (!this.el.canvas) return;

    this.bind();
    this.render();
    // The chart is sized by CSS, so it has to be repainted when that changes.
    this.onResize = () => this.paintMap();
    window.addEventListener('resize', this.onResize);
  }

  bind() {
    const on = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
    const s = this.state;

    on('ally-ship-prev', () => { s.allyShip = cycle(SHIP_ORDER, s.allyShip, -1); this.onShipChange?.(s.allyShip); this.render(); });
    on('axis-ship-next', () => { s.axisShip = cycle(SHIP_ORDER, s.axisShip, 1); this.render(); });
    this.el.allyShip.addEventListener('click', () => { s.allyShip = cycle(SHIP_ORDER, s.allyShip, 1); this.onShipChange?.(s.allyShip); this.render(); });
    this.el.axisShip.addEventListener('click', () => { s.axisShip = cycle(SHIP_ORDER, s.axisShip, -1); this.render(); });

    // Escorts wrap through their own range: an ally screen may be empty, the
    // other side always sails with at least one.
    const stepAlly = (d) => { s.allyEscorts = (s.allyEscorts + d + 8) % 8; this.render(); };
    const stepAxis = (d) => { s.axisEscorts = ((s.axisEscorts - 1 + d + 8) % 8) + 1; this.render(); };
    on('ally-escort-prev', () => stepAlly(-1));
    on('axis-escort-next', () => stepAxis(1));
    this.el.allyEscort.addEventListener('click', () => stepAlly(1));
    this.el.axisEscort.addEventListener('click', () => stepAxis(-1));

    on('time-next', () => { s.time = cycle(TIMES, s.time, 1); this.render(); });
    on('time-prev', () => { s.time = cycle(TIMES, s.time, -1); this.render(); });
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

  shipCell(classId, { flip, count = null }) {
    const c = SHIP_CLASSES[classId];
    const n = count === null ? '' : `<b class="count">&times;${count}</b>`;
    return `${silhouette(classId, { flip })}${n}
      <span class="cell-name">${c.name}</span>
      <span class="cell-type">${c.type} &middot; ${c.typeName}</span>`;
  }

  escortCell(count, flip) {
    // An escort screen is destroyers; the count is what a captain is choosing.
    return `${silhouette('fletcher', { flip })}<b class="count">&times;${count}</b>
      <span class="cell-name">${count === 0 ? 'No escort' : 'Escorts'}</span>
      <span class="cell-type">DD &middot; screen</span>`;
  }

  render() {
    const s = this.state;
    this.el.allyShip.innerHTML = this.shipCell(s.allyShip, { flip: false });
    this.el.axisShip.innerHTML = this.shipCell(s.axisShip, { flip: true });
    this.el.allyEscort.innerHTML = this.escortCell(s.allyEscorts, false);
    this.el.axisEscort.innerHTML = this.escortCell(s.axisEscorts, true);
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
      classId: s.allyShip,
      axisClass: s.axisShip,
      mapId: s.theatre,
      time: s.time,
      allies: s.allyEscorts,
      enemies: s.axisEscorts,
      botSkill: s.skill,
      private: true,
    };
  }
}
