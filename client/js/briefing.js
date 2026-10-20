// The custom battle briefing: a full-bleed chart table rather than a dialog.
//
// Every control here sets something the battle actually uses — the hull you
// take, the hull that leads the other side, how many escorts each side sails
// with, the hour, and which sea. Nothing on this screen is decorative.

import { SHIP_CLASSES } from '../../shared/ships.js';
import { BATTERIES } from '../../shared/batteries.js';
import { BOMBERS, BOMBER_MAX } from '../../shared/bombers.js';
import {
  TIMES, WEATHERS, WEATHER, theatreFor, battlefieldSeed, battlefieldHalf,
} from '../../shared/world.js';
import { silhouette, turret, bomber } from './silhouette.js';
import { getSettings } from './settings.js';
import { drawWorld } from './worldmap.js';

const TIME_NAMES = { dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night' };

// How many hulls one side may sail with. Both fleets start empty — a captain
// says what he is taking to sea rather than being handed a squadron — and
// neither may grow past this.
export const FLEET_MAX = 25;
// How many bomber squadrons a side may have on call. It lives in the bomber
// catalogue with the machines it counts; re-exported here because the briefing
// is where everything else this screen is bounded by is written down.
export { BOMBER_MAX };

const cycle = (arr, cur, step = 1) => {
  const i = arr.indexOf(cur);
  return arr[(i + step + arr.length) % arr.length];
};

export class Briefing {
  constructor({ onStart, getName, getSkill, onShipChange, onOpenPicker, onClosePicker,
    onOpenYard, onOpenChart, onOpenGuns, onOpenBombers, onEditWing }) {
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
    this.onOpenBombers = onOpenBombers;
    this.onEditWing = onEditWing;
    this.state = {
      // Both sides start with nothing. Your fleet's first hull is the one you
      // take the bridge of; the rest sail under AI captains, and the enemy
      // fleet is theirs entirely — but every one of them is commissioned by
      // hand, so a battle is the one a captain asked for rather than the one
      // the screen came up with.
      allyFleet: [],
      enemyFleet: [],
      // What each of those hulls embarks, hull for hull: a carrier's air
      // group is hers, not her class's, so two Shinanos in one fleet can sail
      // one with fifty fighters and the other with half fighters and half
      // torpedo bombers. Null for a hull that carries no air group.
      allyWings: [],
      enemyWings: [],
      // The coast batteries each side has emplaced. They are chosen the same
      // way the hulls are, off the turret button under each fleet.
      allyGuns: [],
      enemyGuns: [],
      // And the bomber squadrons each side has on call, commissioned off the
      // aeroplane under the batteries. A list rather than a number: a
      // Lancaster with fourteen thousand pounds in a thirty-three foot bay is
      // not a Betty with a torpedo, and which machine goes over the target is
      // the whole of what a commander is choosing.
      allyBombers: [],
      enemyBombers: [],
      time: 'dawn',
      weather: 'sunny',
      // A fog bank over the whole battlefield, on top of whatever the sky is
      // doing: it is not a weather of its own, because a fog at night in a
      // gale is as real a thing as a fog on a flat calm at noon.
      fog: false,
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
      allyBomber: document.getElementById('ally-bomber'),
      enemyBomber: document.getElementById('enemy-bomber'),
      allyList: document.getElementById('ally-fleet-list'),
      enemyList: document.getElementById('enemy-fleet-list'),
      allyGunList: document.getElementById('ally-gun-list'),
      enemyGunList: document.getElementById('enemy-gun-list'),
      allyBomberList: document.getElementById('ally-bomber-list'),
      enemyBomberList: document.getElementById('enemy-bomber-list'),
      time: document.getElementById('time-val'),
      weather: document.getElementById('weather-val'),
      fog: document.getElementById('fog-val'),
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

    // A carrier on either roster opens her own air group, to be rebalanced
    // for that one hull and no other.
    for (const side of ['ally', 'enemy']) {
      const list = side === 'ally' ? this.el.allyList : this.el.enemyList;
      list?.addEventListener('click', (e) => {
        const row = e.target.closest?.('.fleet-ship.wing');
        if (!row) return;
        this.onEditWing?.(side, Number(row.dataset.i));
      });
    }

    // The battery under each fleet opens the gun park, the way the hull icon
    // over it opens the shipyard.
    on('ally-turret', () => this.onOpenGuns?.('ally'));
    on('enemy-turret', () => this.onOpenGuns?.('enemy'));

    // The aeroplane under the battery opens the bomber yard, the way the
    // battery over it opens the gun park and the hull over that opens the
    // shipyard. Three controls, three screens, one idea.
    on('ally-bomber', () => this.onOpenBombers?.('ally'));
    on('enemy-bomber', () => this.onOpenBombers?.('enemy'));

    on('time-next', () => { s.time = cycle(TIMES, s.time, 1); this.render(); });
    on('fog-next', () => { s.fog = !s.fog; this.render(); });
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
    const wings = this.wings(side);
    return fleet.map((id, i) => {
      const cls = SHIP_CLASSES[id];
      const code = cls?.type || '??';
      const name = cls?.name || id;
      const flag = side === 'ally' && i === 0 ? ' flag' : '';
      // A carrier says what she has embarked, under her name, and is the
      // key to change it.
      const g = cls?.planes?.group ? (wings[i] || cls.planes.group.default) : null;
      const wing = g ? ' wing' : '';
      const air = g
        ? `<span class="hull-wing">${g.fighters}F &middot; ${g.dive}D &middot; ${g.torpedo}T</span>` : '';
      return `<li class="fleet-ship${flag}${wing}" data-i="${i}"`
        + `${g ? ' title="Change her air group"' : ''}>`
        + `<b class="hull-code">${code}</b>`
        + `<span class="hull-name">${name}</span>${air}</li>`;
    }).join('');
  }

  /** What each hull of one fleet embarks, in fleet order. */
  wings(side) {
    return side === 'ally' ? this.state.allyWings : this.state.enemyWings;
  }

  /** The air group one hull of a fleet sails with; null if she has none. */
  wingOf(side, i) {
    return this.wings(side)[i] || null;
  }

  /** Give one hull of a fleet her own air group. */
  setWing(side, i, group) {
    const fleet = side === 'ally' ? this.state.allyFleet : this.state.enemyFleet;
    if (!(i >= 0 && i < fleet.length)) return;
    this.wings(side)[i] = group ? { ...group } : null;
    this.render();
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

  /** The bomber squadrons one side has on call, in the order they were ordered. */
  bombers(side) {
    return side === 'ally' ? this.state.allyBombers : this.state.enemyBombers;
  }

  bomberCell(side, flip) {
    return `${bomber({ flip })}<b class="count">${this.bombers(side).length}</b>`;
  }

  /**
   * The squadrons one side has on call, listed under its batteries.
   *
   * Counted rather than repeated: a commander who orders three Lancasters has
   * ordered one thing three times, and three identical lines down the edge of
   * the screen say that worse than one line with a three on it does.
   */
  bomberList(side) {
    const tally = new Map();
    for (const id of this.bombers(side)) tally.set(id, (tally.get(id) || 0) + 1);
    return [...tally].map(([id, n]) => {
      const b = BOMBERS[id];
      const name = b ? b.name : id;
      return `<li class="bomber-sqn" title="${name}">`
        + `<span class="sqn-n">&times;${n}</span>${name}</li>`;
    }).join('');
  }

  /** Order a squadron onto one side's roster. The bomber yard calls this once a
   *  commander has looked her over. False if that side is already at strength. */
  commissionBomber(side, bomberId) {
    const list = this.bombers(side);
    if (list.length >= BOMBER_MAX) return false;
    list.push(bomberId);
    this.render();
    return true;
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
  commission(side, classId, wing = null) {
    const fleet = side === 'ally' ? this.state.allyFleet : this.state.enemyFleet;
    if (fleet.length >= FLEET_MAX) return false;
    fleet.push(classId);
    // Her own air group, as it stood in the yard when she was commissioned.
    this.wings(side)[fleet.length - 1] = wing ? { ...wing } : null;
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
    const air = this.bombers(side);
    const yours = side === 'ally';
    document.getElementById('fleet-title').textContent = 'Stand something down';
    document.getElementById('fleet-sub').textContent =
      `Pick a ship, a battery or a squadron to take out of `
      + `${yours ? 'your' : 'the enemy'} order of battle.`;

    const list = document.getElementById('fleet-list');
    list.innerHTML = '';
    this.onOpenPicker?.();

    if (!fleet.length && !guns.length && !air.length) {
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
        // Her air group goes with her, and every hull after her keeps its own.
        this.wings(side).splice(index, 1);
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
    // And the squadrons, off the same list again.
    air.forEach((id, index) => {
      const b = BOMBERS[id];
      if (!b) return;
      card(`Bomber squadron · ${b.payload.toLocaleString('en-US')} lb`,
        b.name, b.role, () => { air.splice(index, 1); });
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
    if (this.el.allyBomber) this.el.allyBomber.innerHTML = this.bomberCell('ally', true);
    if (this.el.enemyBomber) this.el.enemyBomber.innerHTML = this.bomberCell('enemy', false);
    if (this.el.allyList) this.el.allyList.innerHTML = this.fleetList('ally');
    if (this.el.enemyList) this.el.enemyList.innerHTML = this.fleetList('enemy');
    if (this.el.allyGunList) this.el.allyGunList.innerHTML = this.gunList('ally');
    if (this.el.enemyGunList) this.el.enemyGunList.innerHTML = this.gunList('enemy');
    if (this.el.allyBomberList) this.el.allyBomberList.innerHTML = this.bomberList('ally');
    if (this.el.enemyBomberList) this.el.enemyBomberList.innerHTML = this.bomberList('enemy');
    this.el.time.textContent = TIME_NAMES[s.time] || s.time;
    if (this.el.weather) this.el.weather.textContent = WEATHER[s.weather]?.name || s.weather;
    if (this.el.fog) this.el.fog.textContent = s.fog ? 'Fog' : 'No Fog';
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

  /**
   * The same briefing serves three battles. A staged battle is a custom
   * battle under another name. An arcade battle is a custom battle in every
   * particular -- fleets, chart, hour, weather -- except that both sides see
   * everything from the start; all that changes here is the name on the sheet
   * and the flag that goes with the order.
   */
  setMode(mode) {
    this.arcade = mode === 'arcade';
    // A staged battle is fought to a script and watched from the director's
    // chair; the briefing is the same, and the chart after it grows a script.
    this.staged = mode === 'staged';
    const h = document.querySelector('#screen-custom .bh-left h2');
    if (h) h.textContent = this.arcade ? 'Arcade Battle' : this.staged ? 'Staged Battle' : 'Custom Battle';
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
      roomName: `${this.getName()}'s ${this.arcade ? 'arcade ' : this.staged ? 'staged ' : ''}battle`,
      arcade: !!this.arcade,
      staged: !!this.staged,
      classId: s.allyFleet[0],
      allyClasses: s.allyFleet.slice(1),
      enemyClasses: s.enemyFleet,
      // And what each of them embarks, hull by hull, in the same order: her
      // own first, then her consorts', then the enemy's.
      wing: s.allyWings[0] || null,
      allyWings: s.allyFleet.slice(1).map((_, i) => s.allyWings[i + 1] || null),
      enemyWings: s.enemyFleet.map((_, i) => s.enemyWings[i] || null),
      // The batteries go with the request so the order-of-battle chart can put
      // a token on the ground for each of them.
      allyGuns: s.allyGuns.slice(),
      enemyGuns: s.enemyGuns.slice(),
      // The bombers go with it too, by type, so what was ordered on the
      // briefing screen is what the battle is handed.
      allyBombers: s.allyBombers.slice(),
      enemyBombers: s.enemyBombers.slice(),
      // How her carriers are stored: fighters, dive bombers and torpedo
      // bombers, as the captain balanced them in the yard.
      airGroup: getSettings().airGroup,
      mapId: theatreFor(d),
      time: s.time,
      weather: s.weather,
      fog: !!s.fog,
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
