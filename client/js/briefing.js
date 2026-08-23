// The custom battle briefing: a full-bleed chart table rather than a dialog.
//
// Every control here sets something the battle actually uses — the hull you
// take, the hull that leads the other side, how many escorts each side sails
// with, the hour, and which sea. Nothing on this screen is decorative.

import { SHIP_CLASSES } from '../../shared/ships.js';
import { TIMES, MAP_HALF_MIN } from '../../shared/world.js';
import { silhouette, turret } from './silhouette.js';
import { drawWorld } from './worldmap.js';

const TIME_NAMES = { dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night' };

// Seventy thousand yards, in metres, which is the most sea room the game will
// lay a battlefield out over.
const BATTLE_MAX_M = 64008;

const cycle = (arr, cur, step = 1) => {
  const i = arr.indexOf(cur);
  return arr[(i + step + arr.length) % arr.length];
};

export class Briefing {
  constructor({ onStart, getName, getSkill, onShipChange, onOpenPicker, onClosePicker,
    onOpenYard, onOpenChart, initialShip = 'cleveland' }) {
    this.onStart = onStart;
    this.getName = getName;
    // How hard the other side fights is a preference rather than a property of
    // this battle, so it is set in Options and read from there.
    this.getSkill = getSkill || (() => 'regular');
    this.onShipChange = onShipChange;
    this.onOpenPicker = onOpenPicker;
    this.onClosePicker = onClosePicker;
    this.onOpenYard = onOpenYard;
    this.onOpenChart = onOpenChart;
    this.state = {
      // Your fleet's first hull is the one you take the bridge of; the rest
      // sail under AI captains. The enemy fleet is theirs entirely.
      allyFleet: [initialShip, 'fletcher', 'fletcher', 'fletcher'],
      enemyFleet: ['hipper', 'fletcher', 'fletcher', 'fletcher', 'fletcher'],
      time: 'dawn',
      // Where the battle is fought. The chart sets this — four corners and the
      // water between them; until it has been opened, a stretch of the North
      // Atlantic with plenty of sea room.
      deploy: {
        lon: -30, lat: 45, name: 'North Atlantic Ocean',
        km: 32.0, w: 32.0, h: 32.0, room: 64.0, pins: null,
      },
    };

    this.el = {
      canvas: document.getElementById('custom-map-canvas'),
      allyAdd: document.getElementById('ally-add-cell'),
      enemyAdd: document.getElementById('enemy-add-cell'),
      allyDel: document.getElementById('ally-del-cell'),
      enemyDel: document.getElementById('enemy-del-cell'),
      allyTurret: document.getElementById('ally-turret'),
      enemyTurret: document.getElementById('enemy-turret'),
      time: document.getElementById('time-val'),
      theatre: document.getElementById('theatre-name'),
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
    // An arrow opens the shipyard, where a hull is inspected before it is
    // commissioned; a cross opens the list of ships already in that fleet.
    press(this.el.allyAdd, () => this.onOpenYard?.('ally'));
    press(this.el.enemyAdd, () => this.onOpenYard?.('enemy'));
    press(this.el.allyDel, () => this.openPicker('ally', 'remove'));
    press(this.el.enemyDel, () => this.openPicker('enemy', 'remove'));

    on('time-next', () => { s.time = cycle(TIMES, s.time, 1); this.render(); });
    on('theatre-btn', () => this.onOpenChart?.(this.state.deploy));
  }

  /** One of the four hull buttons. */
  fleetCell(side, mode) {
    const fleet = side === 'ally' ? this.state.allyFleet : this.state.enemyFleet;
    const flip = side === 'enemy';
    const lead = fleet[0] || 'fletcher';
    return `${silhouette(lead, { flip, badge: mode === 'add' ? 'arrow' : 'x' })}
      <b class="count">${fleet.length}</b>`;
  }

  /** Commission a hull into one of the fleets. The shipyard calls this once a
   *  captain has looked her over. */
  commission(side, classId) {
    const fleet = side === 'ally' ? this.state.allyFleet : this.state.enemyFleet;
    fleet.push(classId);
    if (side === 'ally') this.onShipChange?.(this.state.allyFleet[0]);
    this.render();
  }

  /** The paying-off screen: the ships already in that fleet, so a captain picks
   *  which one leaves rather than losing whichever happened to be last. */
  openPicker(side, mode = 'remove') {
    this.picker = { side, mode };
    const fleet = side === 'ally' ? this.state.allyFleet : this.state.enemyFleet;
    const yours = side === 'ally';
    document.getElementById('fleet-title').textContent = 'Remove a ship';
    document.getElementById('fleet-sub').textContent =
      `Pick a ship to take out of ${yours ? 'your' : 'the enemy'} fleet.`;

    const list = document.getElementById('fleet-list');
    list.innerHTML = '';
    this.onOpenPicker?.();

    if (fleet.length <= 1) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'A fleet cannot put to sea empty. Add another ship first.';
      list.appendChild(p);
    }

    fleet.forEach((id, index) => {
      const c = SHIP_CLASSES[id];
      const el = document.createElement('button');
      el.className = 'ship-card';
      el.type = 'button';
      const flagship = index === 0 && yours;
      el.innerHTML = `<div class="type">${c.type} · ${c.typeName}</div>
        <div class="nm">${c.name}</div>
        <div class="bl">${flagship ? 'Your bridge' : c.blurb}</div>`;
      if (fleet.length <= 1) el.disabled = true;
      el.onclick = () => {
        fleet.splice(index, 1);
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
    // Each side's guns face the other, the way the hull silhouettes do.
    if (this.el.allyTurret) this.el.allyTurret.innerHTML = turret();
    if (this.el.enemyTurret) this.el.enemyTurret.innerHTML = turret({ flip: true });
    this.el.time.textContent = TIME_NAMES[s.time] || s.time;
    this.el.theatre.textContent = s.deploy.name;
  }

  /** Take a location back from the deployment chart. */
  setDeploy(at) {
    this.state.deploy = at;
    this.render();
    this.paintMap();
  }

  paintMap() {
    if (!this.el.canvas) return;
    const d = this.state.deploy;
    // Zoom 1 fits all 360 degrees across the width. Filling the height instead
    // would crop the east and west edges — and losing the Pacific from a world
    // map to avoid a band of empty ocean is the wrong trade.
    const c = this.el.canvas;
    drawWorld(c, {
      focus: [0, 8], zoom: 1,
      marker: [d.lon, d.lat],
      markerName: d.name,
    });
  }

  /** Called when the screen becomes visible: the canvas has no size until then. */
  show() {
    this.render();
    this.paintMap();
  }

  /**
   * The theatre the pin implies. Confined water means an island field to fight
   * through; open ocean means open ocean; and high latitudes get the North
   * Atlantic's weather whatever the sea room.
   */
  theatreFor(d) {
    if (Math.abs(d.lat) > 48) return 'north_atlantic';
    // Sea room, not the size of the box the captain drew: a small action in
    // the middle of the Atlantic is still fought in open water.
    const m = (d.room ?? d.km) * 1000;
    if (m < BATTLE_MAX_M * 0.45) return 'solomon_narrows';
    if (m < BATTLE_MAX_M * 0.85) return 'coral_shelf';
    return 'open_ocean';
  }

  request() {
    const s = this.state;
    const d = s.deploy;
    // The same berth lays out the same island field every time, so the seed is
    // the position rather than the clock.
    const seed = (Math.round((d.lon + 180) * 4096) * 131071
      + Math.round((d.lat + 90) * 4096)) >>> 0;
    return {
      t: 'custom',
      name: this.getName(),
      roomName: `${this.getName()}'s battle`,
      classId: s.allyFleet[0],
      allyClasses: s.allyFleet.slice(1),
      enemyClasses: s.enemyFleet,
      mapId: this.theatreFor(d),
      time: s.time,
      allies: s.allyFleet.length - 1,
      enemies: s.enemyFleet.length,
      botSkill: this.getSkill(),
      seed,
      half: Math.max(MAP_HALF_MIN, (d.km * 1000) / 2),
      place: d.name,
      // The position is what puts the real coastline into the battlefield:
      // both ends raise the same land from it.
      lon: d.lon,
      lat: d.lat,
      private: true,
    };
  }
}
