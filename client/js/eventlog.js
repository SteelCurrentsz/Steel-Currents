// The event log: a small box in the top left corner (under the missile radar,
// on a ship that has one) that says, a line at a time, what has just happened
// out there -- who is sinking, whose rounds went into whom and where, and
// which carrier's aircraft got a bomb or a fish into somebody.
//
// Pressing its title brings it up large in the middle of the screen with the
// whole battle's worth in it; the button in that one puts it back.
//
// It is written to the page at most a few times a second, not on every event:
// a battleship's salvo is nine hits in under a second, and a strafing flight
// is dozens, and each one written as it came would be a layout of the page
// for every one of them.

import { SHIP_CLASSES } from '../../shared/ships.js';
import { SECTIONS, sectionAt } from '../../shared/sim.js';

const KEEP = 150;          // lines held for the large view
const SMALL = 4;           // lines shown in the corner
const FLUSH = 0.25;        // seconds between writes to the page
const MERGE = 2.5;         // the same line again inside this is counted, not repeated

const PART = { belt: 'Belt', deck: 'Deck', superstructure: 'Superstructure', bow: 'Bow', stern: 'Stern' };
const AIR_WEAPON = { bomb: 'Bomb', rocket: 'Rocket', gun: 'Gunfire', torpedo: 'Torpedo' };

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inches = (mm) => `${(mm / 25.4).toFixed(1)} in`;

export class EventLog {
  /**
   * `who(id)` is { captain, ship, team, cls } for a ship in the battle, or
   * null; `team` is the side the player is on.
   */
  constructor({ who, team, clock }) {
    this.who = who;
    this.team = team;
    this.clock = clock || (() => performance.now() / 1000);
    this.lines = [];
    this.dirty = false;
    this.due = 0;
    this.sunk = new Set();
    this.big = false;
    const $ = (id) => (typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null);
    this.el = {
      box: $('event-log'),
      title: $('ev-title'),
      count: $('ev-count'),
      list: $('ev-list'),
      shrink: $('ev-shrink'),
      radar: $('msl-radar'),
    };
    const { box, title, shrink, radar } = this.el;
    if (!box || typeof window === 'undefined') { this.el.box = null; return; }
    box.hidden = false;
    box.classList.remove('big');
    if (this.el.list) this.el.list.innerHTML = '';
    if (this.el.count) this.el.count.textContent = '';
    this.onTitle = (e) => { e.stopPropagation(); this.setBig(!this.big); };
    this.onShrink = (e) => { e.stopPropagation(); this.setBig(false); };
    this.onKey = (e) => { if (this.big && e.code === 'Escape') { e.stopPropagation(); this.setBig(false); } };
    title?.addEventListener('click', this.onTitle);
    shrink?.addEventListener('click', this.onShrink);
    window.addEventListener('keydown', this.onKey, true);
    this.onResize = () => this.place();
    window.addEventListener('resize', this.onResize);
    // Under the missile radar whenever it is up, wherever its height ends.
    if (radar && typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => this.place());
      this.ro.observe(radar);
    }
    this.place();
  }

  /** Down the corner, below the missile radar if she has one up. */
  place() {
    const { box, radar } = this.el;
    if (!box) return;
    const r = radar && !radar.hidden ? radar.getBoundingClientRect() : null;
    box.style.top = '';
    box.style.left = '';
    if (!r || !(r.height > 0)) return;
    // Under it where there is room for it; on a short screen, where the radar
    // runs most of the way down, alongside it at the top instead.
    const h = box.offsetHeight || 90;
    if (r.bottom + 6 + h <= window.innerHeight - 80) {
      box.style.top = `${Math.round(r.bottom + 6)}px`;
    } else {
      box.style.top = `${Math.round(r.top)}px`;
      box.style.left = `${Math.round(r.right + 6)}px`;
    }
  }

  setBig(on) {
    this.big = on;
    const { box, shrink } = this.el;
    if (!box) return;
    box.classList.toggle('big', on);
    if (shrink) shrink.hidden = !on;
    this.el.title?.setAttribute('aria-expanded', on ? 'true' : 'false');
    this.render();
  }

  // ---------------------------------------------------------- entries ----

  name(id) {
    const w = this.who(id);
    return w ? { text: w.ship, team: w.team } : null;
  }

  tag(n) {
    if (!n) return '<b>Unknown</b>';
    const side = n.team == null ? '' : n.team === this.team ? ' class="al"' : ' class="en"';
    return `<b${side}>${esc(n.text)}</b>`;
  }

  push(html, key) {
    const now = this.clock();
    const last = this.lines[this.lines.length - 1];
    if (last && last.key === key && now - last.t < MERGE) {
      last.n++;
      last.t = now;
    } else {
      this.lines.push({ html, key, n: 1, t: now });
      if (this.lines.length > KEEP) this.lines.shift();
    }
    this.dirty = true;
  }

  /** She is going down: "Captain, Ship is Sinking". Once a ship. */
  sinking(id) {
    if (this.sunk.has(id)) return;
    this.sunk.add(id);
    const w = this.who(id);
    const ship = this.tag(w && { text: w.ship, team: w.team });
    const captain = esc(w?.captain || 'Unknown captain');
    this.push(`<span class="ev-sink">${captain}, ${ship} is Sinking</span>`, `sink${id}`);
  }

  /**
   * A round that struck a ship. From an aeroplane it is put down to her
   * carrier instead (see air); from a ship or a battery it reads
   * "Iowa 406 mm has impacted Yamato · Belt, Machinery (16.1 in)".
   */
  impact(ev, shooterName) {
    if (!ev || ev.kind === 'splash' || ev.tank) return;
    const victim = this.who(ev.victim);
    if (!victim) return;
    if (ev.air) { this.air(ev.owner, ev.air, ev.victim, ev); return; }
    const from = this.name(ev.owner) || (shooterName ? { text: shooterName, team: null } : null);
    const cal = Number.isFinite(ev.cal) ? ` ${Math.round(ev.cal)} mm` : '';
    const where = this.place_(ev, victim);
    const armour = this.armour(ev, victim);
    this.push(
      `${this.tag(from)}${cal} has impacted ${this.tag({ text: victim.ship, team: victim.team })} · ${where}${armour ? ` (${armour})` : ''}`,
      `hit${ev.owner}|${ev.victim}|${ev.cal}|${where}`,
    );
  }

  /** "Essex aircraft · Bomb on Yamato". */
  air(ownerId, weapon, victimId, ev = null) {
    const victim = this.who(victimId);
    if (!victim) return;
    const carrier = this.name(ownerId);
    const by = carrier ? `${this.tag(carrier)} aircraft` : '<b>Land-based aircraft</b>';
    const what = AIR_WEAPON[weapon] || 'Hit';
    const where = ev && ev.part ? ` · ${this.place_(ev, victim)}` : '';
    this.push(
      `${by} · ${what} on ${this.tag({ text: victim.ship, team: victim.team })}${where}`,
      `air${ownerId}|${victimId}|${weapon}${where}`,
    );
  }

  /** Where on her: the plate it struck, and the part of her behind it. */
  place_(ev, victim) {
    const part = PART[ev.part] || 'Hull';
    if (ev.part === 'bow' || ev.part === 'stern' || ev.part === 'superstructure' || !victim.cls) return part;
    const half = (SHIP_CLASSES[victim.cls]?.hull?.length || 200) / 2;
    const rel = Number.isFinite(ev.lz) ? ev.lz / half : 0;
    const k = sectionAt(Math.max(-1, Math.min(1, rel)), ev.part);
    const sec = SECTIONS.find((s) => s.k === k);
    return sec ? `${part}, ${sec.name}` : part;
  }

  /** The armour at the place it struck, in inches: the heaviest plate it met. */
  armour(ev, victim) {
    let mm = 0;
    if (Array.isArray(ev.pl)) for (const L of ev.pl) if (Array.isArray(L) && L[1] > mm) mm = L[1];
    if (!mm && victim.cls) {
      const A = SHIP_CLASSES[victim.cls]?.armor || {};
      mm = A[ev.part === 'superstructure' ? 'superstructure' : ev.part] || 0;
    }
    return mm > 0 ? inches(mm) : '';
  }

  // ------------------------------------------------------------ paint ----

  update(dt) {
    if (!this.dirty) return;
    this.due -= dt;
    if (this.due > 0) return;
    this.due = FLUSH;
    this.dirty = false;
    this.render();
  }

  render() {
    const { list, count, box } = this.el;
    if (!list || !box) return;
    const shown = this.big ? this.lines.slice().reverse() : this.lines.slice(-SMALL).reverse();
    list.innerHTML = shown.map((l) => `<li>${l.html}${l.n > 1 ? ` <i>×${l.n}</i>` : ''}</li>`).join('')
      || '<li class="ev-none">Nothing to report yet</li>';
    if (count) count.textContent = this.lines.length ? String(this.lines.length) : '';
  }

  dispose() {
    const { box, title, shrink } = this.el;
    title?.removeEventListener('click', this.onTitle);
    shrink?.removeEventListener('click', this.onShrink);
    if (this.onKey) {
      window.removeEventListener('keydown', this.onKey, true);
      window.removeEventListener('resize', this.onResize);
    }
    this.ro?.disconnect();
    if (box) { box.hidden = true; box.classList.remove('big'); box.style.top = ''; box.style.left = ''; }
    if (this.el.list) this.el.list.innerHTML = '';
  }
}
