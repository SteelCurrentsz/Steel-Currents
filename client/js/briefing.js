// The custom battle briefing: a full-bleed chart table rather than a dialog.
//
// Every control here sets something the battle actually uses — the hull you
// take, the hull that leads the other side, how many escorts each side sails
// with, the hour, and which sea. Nothing on this screen is decorative.

import { SHIP_CLASSES } from '../../shared/ships.js';
import { BATTERIES } from '../../shared/batteries.js';
import {
  TIMES, WEATHERS, WEATHER, theatreFor, battlefieldSeed, battlefieldHalf,
} from '../../shared/world.js';
import { silhouette, turret } from './silhouette.js';
import { getSettings } from './settings.js';
import { drawWorld } from './worldmap.js';

const TIME_NAMES = { dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night' };

// How many hulls one side may sail with. Both fleets start empty — a captain
// says what he is taking to sea rather than being handed a squadron — and
// neither may grow past this.
export const FLEET_MAX = 25;

const cycle = (arr, cur, step = 1) => {
  const i = arr.indexOf(cur);
  return arr[(i + step + arr.length) % arr.length];
};

export class Briefing {
  constructor({ onStart, getName, getSkill, onShipChange, onOpenPicker, onClosePicker,
    onOpenYard, onOpenChart, onOpenGuns }) {
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
    this.onOpenGuns = onOpenGuns;
    this.state = {
      // Both sides start with nothing. Your fleet's first hull is the one you
      // take the bridge of; the rest sail under AI captains, and the enemy
      // fleet is theirs entirely — but every one of them is commissioned by
      // hand, so a battle is the one a captain asked for rather than the one
      // the screen came up with.
      allyFleet: [],
      enemyFleet: [],
      // The coast batteries each side has emplaced. They are chosen the same
      // way the hulls are, off the turret button under each fleet.
      allyGuns: [],
      enemyGuns: [],
      time: 'dawn',
      weather: 'sunny',
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
      allyList: document.getElementById('ally-fleet-list'),
      enemyList: document.getElementById('enemy-fleet-list'),
      allyGunList: document.getElementById('ally-gun-list'),
      enemyGunList: document.getElementById('enemy-gun-list'),
      time: document.getElementById('time-val'),
      weather: document.getElementById('weather-val'),
      theatre: document.getElementById('theatre-name'),
      start: document.getElementById('custom-start'),
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
    // A window resize is not the only thing that changes the chart's box: the
    // screen going up, a phone's address bar sliding away, the safe-area
    // insets turning over on a rotation. Watch the canvas itself, and the
    // chart is repainted for all of them rather than for one of them.
    if (typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(this.onResize);
      this.observer.observe(this.el.canvas);
    }
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

    // The battery under each fleet opens the gun park, the way the hull icon
    // over it opens the shipyard.
    on('ally-turret', () => this.onOpenGuns?.('ally'));
    on('enemy-turret', () => this.onOpenGuns?.('enemy'));

    on('time-next', () => { s.time = cycle(TIMES, s.time, 1); this.render(); });
    on('weather-next', () => { s.weather = cycle(WEATHERS, s.weather, 1); this.render(); });
    on('theatre-btn', () => this.onOpenChart?.(this.state.deploy));
  }

  /**
   * A fleet, listed hull by hull: her type on the left and her name beside it.
   * The first of your own is the one you take the bridge of, so it carries the
   * flag — with four destroyers in company that is the only way to tell which
   * of them is yours.
   */
  fleetList(side) {
    const fleet = side === 'ally' ? this.state.allyFleet : this.state.enemyFleet;
    return fleet.map((id, i) => {
      const cls = SHIP_CLASSES[id];
      const code = cls?.type || '??';
      const name = cls?.name || id;
      const flag = side === 'ally' && i === 0 ? ' flag' : '';
      return `<li class="fleet-ship${flag}">`
        + `<b class="hull-code">${code}</b>`
        + `<span class="hull-name">${name}</span></li>`;
    }).join('');
  }

  /**
   * The batteries one side has ashore, listed under its fleet.
   *
   * The name and nothing else: there is no type code on a coast gun because
   * there is nothing to abbreviate — one is known by the place it stands, and
   * "Longues-sur-Mer" is the whole of what a captain needs to read.
   */
  gunList(side) {
    return this.guns(side).map((id) => {
      const b = BATTERIES[id];
      const name = b ? b.name : id;
      // The long ones are cut with an ellipsis in the bar, so the whole name is
      // put where a pointer can still find it.
      return `<li class="gun-emp" title="${name}">${name}</li>`;
    }).join('');
  }

  /** One of the two battery buttons: the turret, and how many are ashore. */
  turretCell(side, flip) {
    return `${turret({ flip })}<b class="count">${this.guns(side).length}</b>`;
  }

  /**
   * One of the four hull buttons.
   *
   * The drawing is a battleship rather than whichever hull happens to lead the
   * fleet: these are controls, not portraits, and a fleet that starts empty
   * has no lead hull to draw. What is in the fleet is on the roster down the
   * edge of the screen, hull by hull, which is a better answer than one
   * silhouette could be.
   */
  fleetCell(side, mode) {
    const fleet = side === 'ally' ? this.state.allyFleet : this.state.enemyFleet;
    const flip = side === 'enemy';
    return `${silhouette('yamato', { flip, badge: mode === 'add' ? 'arrow' : 'x' })}
      <b class="count">${fleet.length}</b>`;
  }

  /** The batteries one side has ashore. */
  guns(side) {
    return side === 'ally' ? this.state.allyGuns : this.state.enemyGuns;
  }

  /** Put a battery ashore for one side. The gun park calls this once a captain
   *  has looked it over. False if that side already has its full allowance. */
  emplace(side, batteryId) {
    const guns = this.guns(side);
    if (guns.length >= FLEET_MAX) return false;
    guns.push(batteryId);
    this.render();
    return true;
  }

  /** Commission a hull into one of the fleets. The shipyard calls this once a
   *  captain has looked her over. False if that fleet is already full. */
  commission(side, classId) {
    const fleet = side === 'ally' ? this.state.allyFleet : this.state.enemyFleet;
    if (fleet.length >= FLEET_MAX) return false;
    fleet.push(classId);
    if (side === 'ally') this.onShipChange?.(this.state.allyFleet[0]);
    this.render();
    return true;
  }

  /** The paying-off screen: the ships already in that fleet, so a captain picks
   *  which one leaves rather than losing whichever happened to be last. */
  openPicker(side, mode = 'remove') {
    this.picker = { side, mode };
    const fleet = side === 'ally' ? this.state.allyFleet : this.state.enemyFleet;
    const guns = this.guns(side);
    const yours = side === 'ally';
    document.getElementById('fleet-title').textContent = 'Stand something down';
    document.getElementById('fleet-sub').textContent =
      `Pick a ship or a battery to take out of ${yours ? 'your' : 'the enemy'} order of battle.`;

    const list = document.getElementById('fleet-list');
    list.innerHTML = '';
    this.onOpenPicker?.();

    if (!fleet.length && !guns.length) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'There is nothing on this side yet.';
      list.appendChild(p);
    }

    const card = (type, name, blurb, take) => {
      const el = document.createElement('button');
      el.className = 'ship-card';
      el.type = 'button';
      el.innerHTML = `<div class="type">${type}</div>
        <div class="nm">${name}</div>
        <div class="bl">${blurb}</div>`;
      el.onclick = () => {
        take();
        this.render();
        this.onClosePicker?.();
      };
      list.appendChild(el);
    };

    fleet.forEach((id, index) => {
      const c = SHIP_CLASSES[id];
      const flagship = index === 0 && yours;
      card(`${c.type} · ${c.typeName}`, c.name, flagship ? 'Your bridge' : c.blurb, () => {
        fleet.splice(index, 1);
        if (side === 'ally') this.onShipChange?.(this.state.allyFleet[0]);
      });
    });
    // The batteries come off the same list. There is one control for standing
    // something down and it takes anything: a captain who wants a gun off the
    // headland should not have to work out that it is a different button.
    guns.forEach((id, index) => {
      const b = BATTERIES[id];
      if (!b) return;
      card(`Coast battery · ${b.bore}`, b.name, b.place, () => { guns.splice(index, 1); });
    });
  }

  render() {
    const s = this.state;
    this.el.allyAdd.innerHTML = this.fleetCell('ally', 'add');
    this.el.enemyAdd.innerHTML = this.fleetCell('enemy', 'add');
    this.el.allyDel.innerHTML = this.fleetCell('ally', 'remove');
    this.el.enemyDel.innerHTML = this.fleetCell('enemy', 'remove');
    // Each side's guns face the other, the way the hull silhouettes do.
    // Each battery trains outboard, away from the middle of the screen: ours on
    // the left points left, theirs on the right points right. The count under
    // each is how many batteries that side has ashore, and it reads the same
    // way the hull counts above and below it do.
    if (this.el.allyTurret) this.el.allyTurret.innerHTML = this.turretCell('ally', true);
    if (this.el.enemyTurret) this.el.enemyTurret.innerHTML = this.turretCell('enemy', false);
    if (this.el.allyList) this.el.allyList.innerHTML = this.fleetList('ally');
    if (this.el.enemyList) this.el.enemyList.innerHTML = this.fleetList('enemy');
    if (this.el.allyGunList) this.el.allyGunList.innerHTML = this.gunList('ally');
    if (this.el.enemyGunList) this.el.enemyGunList.innerHTML = this.gunList('enemy');
    this.el.time.textContent = TIME_NAMES[s.time] || s.time;
    if (this.el.weather) this.el.weather.textContent = WEATHER[s.weather]?.name || s.weather;
    this.el.theatre.textContent = s.deploy.name;

    // Nothing sails until both sides have something to sail. The button says
    // so by being unavailable, and the note beside it says why.
    const why = this.blocker();
    if (this.el.start) this.el.start.disabled = !!why;
    const note = document.getElementById('sortie-note');
    if (note) note.textContent = why || '';
  }

  /** Why this battle cannot be fought yet, or '' if it can. */
  blocker() {
    const a = this.state.allyFleet.length;
    const e = this.state.enemyFleet.length;
    if (!a && !e) return 'Commission a ship for each side.';
    if (!a) return 'Your fleet is empty.';
    if (!e) return 'The enemy fleet is empty.';
    return '';
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
    // While this screen is down the canvas has no box, and a chart painted
    // into no box is stretched to whatever box it turns out to have -- which
    // is what used to squash the world every time the deployment chart handed
    // a position back. drawWorld draws nothing rather than guess a size, and
    // the observer on the canvas takes the repaint when it has one.
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
  request() {
    const s = this.state;
    const d = s.deploy;
    // Theatre, seed and size all come out of shared/world.js, which is what the
    // deployment chart draws its preview from and what the server raises the
    // battlefield from. One answer, three screens.
    const seed = battlefieldSeed(d.lon, d.lat);
    return {
      t: 'custom',
      name: this.getName(),
      roomName: `${this.getName()}'s battle`,
      classId: s.allyFleet[0],
      allyClasses: s.allyFleet.slice(1),
      enemyClasses: s.enemyFleet,
      // The batteries go with the request so the order-of-battle chart can put
      // a token on the ground for each of them.
      allyGuns: s.allyGuns.slice(),
      enemyGuns: s.enemyGuns.slice(),
      // How her carriers are stored: fighters, dive bombers and torpedo
      // bombers, as the captain balanced them in the yard.
      airGroup: getSettings().airGroup,
      mapId: theatreFor(d),
      time: s.time,
      weather: s.weather,
      allies: s.allyFleet.length - 1,
      enemies: s.enemyFleet.length,
      botSkill: this.getSkill(),
      seed,
      half: battlefieldHalf(d.km),
      place: d.name,
      // The position is what puts the real coastline into the battlefield:
      // both ends raise the same land from it.
      lon: d.lon,
      lat: d.lat,
      private: true,
    };
  }
}
