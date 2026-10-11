// The penetration camera.
//
// When one of your rounds strikes a ship the view cuts, for a couple of
// seconds, to her section at the place it struck: her hull cut across like a
// builder's drawing, with her side and her decks and her bottom, the rooms
// inside her, and every plate of her armour where it really is (see
// shared/armor.js). The shell comes in along its own line of flight and meets
// the plates the simulation walked it through, in order. If it beat them it
// goes on into whatever they were protecting and bursts there into pieces;
// if it did not, it breaks up against the plate that stopped it, or glances
// off it and goes away.
//
// Drawn in two dimensions on purpose. What a gunnery officer wants to see is
// the section -- how much steel stood between his shell and her magazine, and
// which plate won -- and that is a drawing, not a view.

import { armourScheme, LAYER_NAMES } from '../../../shared/armor.js';
import { freeboardOf } from '../../../shared/sim.js';
import { getClass } from '../../../shared/ships.js';
import { sectionAt, extents, halfAt } from './section.js';

const RESULT = {
  citadel: 'CITADEL', pen: 'PENETRATION', overpen: 'OVERPENETRATION', he: 'HIT',
  splash: 'NO PENETRATION', shatter: 'SHATTERED', ricochet: 'RICOCHET',
};

/** The rooms of her at a station, as fractions of her half-length; see damageboard.js. */
const ROOMS = [
  { name: 'Forward magazine', t0: 0.26, t1: 0.5, lo: 0, hi: 0.34 },
  { name: 'Shell room', t0: 0.26, t1: 0.5, lo: 0.34, hi: 0.58 },
  { name: 'Boiler room', t0: 0.02, t1: 0.26, lo: 0, hi: 0.62 },
  { name: 'Engine room', t0: -0.26, t1: 0.02, lo: 0, hi: 0.58 },
  { name: 'After magazine', t0: -0.52, t1: -0.26, lo: 0, hi: 0.34 },
  { name: 'Shell room', t0: -0.52, t1: -0.26, lo: 0.34, hi: 0.58 },
  { name: 'Steering gear', t0: -0.9, t1: -0.72, lo: 0, hi: 0.42 },
];

// How long each part of it runs, in seconds.
const APPROACH = 0.45;
const THROUGH_SPEED = 26;      // metres of the drawing a second, inside her
const AFTER = 1.6;
/** How long after one has been shown before another ship's hit is shown, in seconds. */
const QUIET = 6;

const rnd = (a, b) => a + Math.random() * (b - a);

export class PenCam {
  /** `viewOf(id)` hands over the ship's view, whose model the section is cut from. */
  constructor(host, viewOf = null) {
    this.host = host;
    this.viewOf = viewOf;
    this.el = document.createElement('div');
    this.el.className = 'pen-cam';
    this.el.hidden = true;
    this.canvas = document.createElement('canvas');
    this.el.appendChild(this.canvas);
    this.el.addEventListener('pointerdown', () => this.stop());
    host.appendChild(this.el);
    this.ctx = this.canvas.getContext('2d');
    this.shot = null;
    this.pending = null;
  }

  get busy() { return !!this.shot; }

  /**
   * A hit to be shown. Rounds of one salvo land within a fraction of a second
   * of one another, so they are gathered for a moment and the one that did
   * the most is the one drawn.
   */
  offer(ev, ours = true) {
    if (this.shot || !ev || !ev.pl) return;
    // Somebody else's round, only when nothing has been shown for a while:
    // a fleet action puts a hit somewhere every second, and cutting away to
    // every one of them is no battle at all.
    if (!ours && (this.quietFor || 0) < QUIET) return;
    const rank = (e) => ({ citadel: 5, pen: 4, overpen: 3, he: 2, shatter: 1, ricochet: 1, splash: 0 }[e.kind] || 0) * 1e6 + (e.dmg || 0);
    if (!this.pending) this.pending = { ev, wait: 0.15 };
    else if (rank(ev) > rank(this.pending.ev)) this.pending.ev = ev;
  }

  stop() {
    this.shot = null;
    this.el.hidden = true;
    this.quietFor = 0;
  }

  update(dt) {
    if (!this.shot) this.quietFor = (this.quietFor ?? QUIET) + dt;
    if (this.pending) {
      this.pending.wait -= dt;
      if (this.pending.wait <= 0) {
        const ev = this.pending.ev;
        this.pending = null;
        this.start(ev);
      }
    }
    if (!this.shot) return;
    this.shot.t += dt;
    this.stepBits(dt);
    this.draw();
    if (this.shot.t > this.shot.end) this.stop();
  }

  start(ev) {
    const cls = getClass(ev.sc);
    if (!cls) return;
    let S = armourScheme(cls, freeboardOf(cls));
    const half = cls.hull.length / 2;
    const rel = Math.min(1, Math.abs(ev.lz || 0) / half);
    // Her half-breadth at this station: full amidships, fining to her ends.
    const fine = rel < 0.5 ? 1 : Math.sqrt(Math.max(0.04, 1 - ((rel - 0.5) / 0.5) ** 2));
    let hb = S.B2 * fine;
    let works = { half: S.B2 * 0.42 * fine, top: S.fb + 6 + 7 * (cls.hull.superstructure || 1) };
    // Her own model cut across at the station it struck, when there is one:
    // her real lines, her upperworks and whatever guns stand there.
    let segs = null, ext = null;
    const view = this.viewOf?.(ev.victim);
    if (view) {
      try { segs = sectionAt(view, ev.lz || 0); ext = segs && segs.length > 6 ? extents(segs) : null; } catch { ext = null; }
    }
    if (ext) {
      // Her deck at this station, off the model: the top of the widest part
      // of her below her upperworks. The armour heights are fitted to it.
      let wide = 0;
      for (let y = -S.draft; y < S.fb * 1.6; y += 0.25) wide = Math.max(wide, halfAt(ext, y) || 0);
      let deckY = 0;
      for (let y = 0; y < S.fb * 2.2; y += 0.25) {
        const h = halfAt(ext, y);
        if (h >= wide * 0.8) deckY = y;
        else if (y > 1.5) break;
      }
      if (deckY > 1) {
        const k = deckY / S.fb;
        S = { ...S, fb: deckY, beltTop: S.beltTop * k, mainDeck: S.mainDeck * k, splinterDeck: S.splinterDeck * k };
      }
      hb = Math.max(1, halfAt(ext, Math.min(S.fb - 0.5, 1)) || hb);
      works = { half: hb * 0.5, top: ext.y1 };
    }
    const side = (ev.lx || 0) >= 0 ? 1 : -1;
    const y0 = Math.max(-S.draft + 0.5, Math.min(ev.y ?? 4, works.top - 1));
    // Where it struck, in the section.
    let ix, iy;
    const at = (y) => (ext ? (halfAt(ext, y) || hb) : hb);
    if (ev.part === 'deck') { ix = Math.max(-hb * 0.9, Math.min(hb * 0.9, ev.lx || 0)); iy = S.fb; }
    else if (ev.part === 'superstructure') {
      iy = Math.max(S.fb + 1, y0);
      ix = side * (ext ? (halfAt(ext, iy) || works.half) : works.half);
    } else { iy = Math.min(y0, S.fb - 0.3); ix = side * at(iy); }
    // Its line of flight across her: the athwartships part of its velocity
    // and the vertical. A round coming down her length is drawn coming in a
    // little off square, or it would arrive edge-on to the drawing.
    let dx = ev.lv?.[0] ?? -side * 600;
    let dy = ev.lv?.[1] ?? -40;
    // Into her, whichever way it was drawn: a round that struck her side was
    // going inboard.
    if (ev.part !== 'deck' && Math.sign(dx) === side) dx = -dx;
    if (ev.part !== 'deck' && Math.abs(dx) < Math.abs(dy) * 0.3) dx = -side * Math.abs(dy) * 0.3;
    if (ev.part === 'deck' && dy > -1) dy = -Math.max(30, Math.abs(dx) * 0.6);
    if (Math.hypot(dx, dy) < 1) { dx = ev.part === 'deck' ? 0 : -side * 100; dy = -20; }
    const dl = Math.hypot(dx, dy) || 1;
    const d = { x: dx / dl, y: dy / dl };

    // Where it meets each plate, as a distance along that line from the
    // first one.
    const plates = (ev.pl || []).map(([k, t, eff], i) => {
      let s = 0;
      if (i > 0) {
        if (k === 'k') s = Math.abs((S.B2 * 0.32) / (d.x || 1e-3));
        else if (k === 'd') s = Math.abs((iy - S.mainDeck) / (d.y || -1e-3));
        else if (k === 's') s = Math.abs((iy - S.splinterDeck) / (d.y || -1e-3));
        else s = 2 * i;
      }
      return { k, t, eff, s: Math.min(s, hb * 3) };
    });
    const stop = ev.ps ?? -1;
    const kind = ev.kind;
    const last = plates.length ? plates[plates.length - 1].s : 0;
    // How far it goes before it bursts, or until it is out of her.
    let burstAt;
    if (kind === 'ricochet' || kind === 'shatter' || kind === 'splash') burstAt = 0;
    else if (stop >= 0) burstAt = plates[Math.min(stop, plates.length - 1)].s;
    else if (kind === 'overpen') burstAt = hb * 2.6;
    else if (kind === 'citadel') burstAt = last + Math.min(hb * 0.7, 7);
    else burstAt = last + 3.2;
    const rooms = ROOMS.filter((r) => {
      const t = (ev.lz || 0) / half;
      return t >= Math.min(r.t0, r.t1) && t <= Math.max(r.t0, r.t1);
    });
    this.shot = {
      ev, cls, S, hb, works, rel, ix, iy, d, plates, stop, kind, burstAt, rooms, segs, ext,
      t: 0,
      inside: burstAt / THROUGH_SPEED,
      end: APPROACH + burstAt / THROUGH_SPEED + AFTER,
      bits: [], burst: false, sparked: new Set(),
    };
    this.el.hidden = false;
    this.resize();
  }

  resize() {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(w * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
    }
    this.dpr = dpr;
  }

  // The shell's place along its line, in the section: negative before it
  // reaches her, then along it at the drawing's slow-motion speed.
  shellAt(T) {
    const s = this.shot;
    const along = T < APPROACH ? -(1 - T / APPROACH) * s.hb * 2.4
      : Math.min(s.burstAt, (T - APPROACH) * THROUGH_SPEED);
    return { x: s.ix + s.d.x * along, y: s.iy + s.d.y * along, along };
  }

  spark(x, y, n, speed, hot = true, life = 0.7, dir = null) {
    for (let i = 0; i < n; i++) {
      let a = Math.random() * Math.PI * 2;
      if (dir) a = Math.atan2(dir.y, dir.x) + rnd(-0.9, 0.9);
      const v = speed * rnd(0.35, 1);
      this.shot.bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: life * rnd(0.6, 1.2), hot });
    }
  }

  stepBits(dt) {
    const s = this.shot;
    const T = s.t;
    // Each plate it gets through throws sparks off where it went through.
    s.plates.forEach((p, i) => {
      if (s.sparked.has(i)) return;
      if (T < APPROACH + p.s / THROUGH_SPEED) return;
      if (s.stop >= 0 && i > s.stop) return;
      s.sparked.add(i);
      const at = { x: s.ix + s.d.x * p.s, y: s.iy + s.d.y * p.s };
      if (i !== s.stop || s.kind === 'pen') this.spark(at.x, at.y, 14, 22, true, 0.5, { x: -s.d.x, y: -s.d.y });
    });
    if (!s.burst && T >= APPROACH + s.inside) {
      s.burst = true;
      const at = this.shellAt(T);
      if (s.kind === 'ricochet') {
        // Off the face of the plate and away, in pieces.
        const out = s.ev.part === 'deck' ? { x: s.d.x, y: -s.d.y } : { x: -s.d.x, y: s.d.y };
        this.spark(at.x, at.y, 12, 24, true, 0.6, out);
        s.away = out;
      } else if (s.kind === 'shatter' || s.kind === 'splash') {
        // Broken up on the plate: the pieces go every way but in.
        this.spark(at.x, at.y, 26, 18, true, 0.9, { x: -s.d.x, y: -s.d.y });
        this.spark(at.x, at.y, 10, 9, false, 1.1);
      } else {
        // Burst inside her: fragments every way, and the fire of it.
        const big = s.kind === 'citadel' ? 1.8 : s.kind === 'overpen' ? 0.4 : 1;
        this.spark(at.x, at.y, Math.round(70 * big), 34 * big, true, 1.1);
        this.spark(at.x, at.y, Math.round(30 * big), 16 * big, false, 1.4);
        s.fire = { x: at.x, y: at.y, r: (3 + 4 * big) * Math.min(1.6, (s.ev.cal || 152) / 280), age: 0 };
      }
    }
    if (s.fire) s.fire.age += dt;
    for (const b of s.bits) {
      b.age += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy -= 6 * dt;
      b.vx *= Math.exp(-dt * 1.4);
      b.vy *= Math.exp(-dt * 1.4);
    }
    s.bits = s.bits.filter((b) => b.age < b.life);
  }

  /**
   * What is in a room, drawn the way a builder's section draws it: boilers
   * in a boiler room, the turbine casings and the shafting in an engine room,
   * cordite in its cases in a magazine, shells standing in their racks.
   */
  contents(name, inner, y0, y1, X, Y, k) {
    const c = this.ctx;
    const w = inner * 2;
    const h = y1 - y0;
    c.save();
    c.strokeStyle = 'rgba(170, 190, 205, 0.55)';
    c.fillStyle = 'rgba(120, 140, 155, 0.28)';
    c.lineWidth = 1 * (this.dpr || 1);
    const box = (x, y, bw, bh, r = 0.4) => {
      const px = X(x), py = Y(y + bh), pw = bw * k, ph = bh * k, rr = Math.min(r * k, pw / 2, ph / 2);
      c.beginPath();
      c.moveTo(px + rr, py);
      c.arcTo(px + pw, py, px + pw, py + ph, rr);
      c.arcTo(px + pw, py + ph, px, py + ph, rr);
      c.arcTo(px, py + ph, px, py, rr);
      c.arcTo(px, py, px + pw, py, rr);
      c.closePath();
      c.fill(); c.stroke();
    };
    if (name === 'Boiler room') {
      const n = w > 18 ? 4 : w > 10 ? 3 : 2;
      const bw = (w * 0.86) / n;
      for (let i = 0; i < n; i++) box(-inner + w * 0.07 + i * bw + bw * 0.08, y0 + h * 0.08, bw * 0.84, h * 0.62, 1.2);
      // The uptakes going up out of them.
      for (let i = 0; i < n; i++) {
        const x = -inner + w * 0.07 + i * bw + bw * 0.5;
        c.beginPath(); c.moveTo(X(x), Y(y0 + h * 0.7)); c.lineTo(X(x * 0.4), Y(y1)); c.stroke();
      }
    } else if (name === 'Engine room') {
      const n = w > 18 ? 4 : 2;
      const bw = (w * 0.86) / n;
      for (let i = 0; i < n; i++) {
        const cx = -inner + w * 0.07 + i * bw + bw * 0.5;
        c.beginPath();
        c.ellipse(X(cx), Y(y0 + h * 0.36), bw * 0.4 * k, h * 0.26 * k, 0, 0, Math.PI * 2);
        c.fill(); c.stroke();
        // And the shaft it turns, end on.
        c.beginPath(); c.arc(X(cx), Y(y0 + h * 0.14), Math.max(2, 0.35 * k), 0, Math.PI * 2); c.stroke();
      }
    } else if (name.includes('magazine')) {
      const cols = Math.max(4, Math.round(w / 1.6));
      const rows = Math.max(2, Math.round(h / 1.6));
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        box(-inner + (i + 0.15) * (w / cols), y0 + (j + 0.15) * (h / rows), (w / cols) * 0.7, (h / rows) * 0.7, 0.3);
      }
    } else if (name === 'Shell room') {
      const cols = Math.max(5, Math.round(w / 1.1));
      for (let i = 0; i < cols; i++) {
        const x = -inner + (i + 0.5) * (w / cols);
        const sw = Math.max(0.25, (w / cols) * 0.42);
        c.beginPath();
        c.moveTo(X(x - sw / 2), Y(y0 + h * 0.1));
        c.lineTo(X(x - sw / 2), Y(y0 + h * 0.62));
        c.quadraticCurveTo(X(x), Y(y0 + h * 0.92), X(x + sw / 2), Y(y0 + h * 0.62));
        c.lineTo(X(x + sw / 2), Y(y0 + h * 0.1));
        c.closePath();
        c.fill(); c.stroke();
      }
    } else if (name === 'Steering gear') {
      box(-inner * 0.5, y0 + h * 0.2, inner, h * 0.4, 0.6);
    }
    c.restore();
  }

  draw() {
    this.resize();
    const s = this.shot;
    const { S, hb, works } = s;
    const c = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const dpr = this.dpr;
    const fade = Math.min(1, s.t / 0.15, (s.end - s.t) / 0.25);
    c.save();
    c.globalAlpha = Math.max(0, fade);
    c.fillStyle = 'rgba(6, 12, 20, 0.94)';
    c.fillRect(0, 0, W, H);
    // The section fitted to the screen: her beam and a margin across, her
    // keel to the top of her upperworks up and down.
    const spanX = hb * 2 * 1.3 + 4;
    const spanY = works.top + S.draft + 8;
    const k = Math.min(W * 0.9 / spanX, H * 0.74 / spanY);
    const ox = W / 2, oy = H * 0.16 + (works.top + 3) * k;
    const X = (x) => ox + x * k;
    const Y = (y) => oy - y * k;
    const mm = (t) => Math.max(1.5 * dpr, (t / 1000) * k * 7);

    // Sea and sky.
    c.fillStyle = '#0d2233';
    c.fillRect(0, Y(0), W, H - Y(0));
    c.strokeStyle = 'rgba(120, 180, 210, 0.5)';
    c.lineWidth = 1 * dpr;
    c.beginPath(); c.moveTo(0, Y(0)); c.lineTo(W, Y(0)); c.stroke();

    // Her hull, cut across: the turn of her bilge, her side, her deck.
    const hull = () => {
      c.beginPath();
      const bil = Math.min(hb * 0.45, S.draft * 0.7);
      c.moveTo(X(-hb), Y(S.fb));
      c.lineTo(X(-hb), Y(-S.draft + bil));
      c.quadraticCurveTo(X(-hb), Y(-S.draft), X(-hb + bil), Y(-S.draft));
      c.lineTo(X(hb - bil), Y(-S.draft));
      c.quadraticCurveTo(X(hb), Y(-S.draft), X(hb), Y(-S.draft + bil));
      c.lineTo(X(hb), Y(S.fb));
      c.closePath();
    };
    const ext = s.ext;
    // How wide she is at a height: her model's, or the drawing's.
    const halfY = (y) => (ext ? (halfAt(ext, y) || 0) : (y <= S.fb ? hb : works.half));
    if (ext) {
      // Her own section: filled where there is anything of her at each
      // height, so her hull and her upperworks are the shapes they are.
      c.fillStyle = '#1b252e';
      let run = null;
      const flush = () => {
        if (!run || run.length < 2) { run = null; return; }
        c.beginPath();
        run.forEach(([y, lo]) => c.lineTo(X(lo), Y(y)));
        for (let i = run.length - 1; i >= 0; i--) c.lineTo(X(run[i][2]), Y(run[i][0]));
        c.closePath();
        c.fill();
        run = null;
      };
      for (let i = 0; i < ext.lo.length; i++) {
        const y = ext.y0 + i * ext.dy;
        if (Number.isNaN(ext.lo[i])) { flush(); continue; }
        (run || (run = [])).push([y, ext.lo[i], ext.hi[i]]);
      }
      flush();
    } else {
      hull();
      c.fillStyle = '#1b252e';
      c.fill();
      // Her upperworks.
      c.fillStyle = '#212c36';
      c.fillRect(X(-works.half), Y(works.top), works.half * 2 * k, (works.top - S.fb) * k);
      c.strokeStyle = '#7d8a96';
      c.lineWidth = mm(S.works);
      c.strokeRect(X(-works.half), Y(works.top), works.half * 2 * k, (works.top - S.fb) * k);
    }

    // The rooms inside her, at this station.
    c.font = `${12 * dpr}px "Inter", system-ui, sans-serif`;
    c.textAlign = 'center';
    // Her side protection is a sixth of her beam deep, inboard of her side.
    const inner = Math.max(0.8, S.boxed
      ? (halfY((S.bottom + S.splinterDeck) / 2) || hb) - S.B2 * 0.32
      : (halfY(S.fb * 0.3) || hb) - 0.5);
    const roomTop = S.boxed ? S.splinterDeck : S.fb - 2.4;
    const depth = roomTop - S.bottom;
    for (const r of s.rooms) {
      const y0 = S.bottom + r.lo * depth;
      const y1 = S.bottom + r.hi * depth;
      c.fillStyle = r.name.includes('magazine') ? 'rgba(200, 80, 50, 0.22)' : r.name.includes('Shell') ? 'rgba(200, 150, 60, 0.18)' : 'rgba(90, 140, 170, 0.2)';
      c.fillRect(X(-inner), Y(y1), inner * 2 * k, (y1 - y0) * k);
      this.contents(r.name, inner, y0, y1, X, Y, k);
      c.fillStyle = 'rgba(210, 225, 235, 0.7)';
      c.fillText(r.name.toUpperCase(), X(0), Y((y0 + y1) / 2) + 4 * dpr);
    }
    if (!s.rooms.length) {
      c.fillStyle = 'rgba(210, 225, 235, 0.55)';
      c.fillText(s.rel > 0.74 ? 'STORES' : 'CREW SPACES', X(0), Y((S.bottom + roomTop) / 2));
    }
    // Her decks and her double bottom, as structure: thin, grey.
    c.strokeStyle = 'rgba(150, 165, 178, 0.55)';
    c.lineWidth = 1 * dpr;
    for (const y of [S.bottom, roomTop, (roomTop + S.fb) / 2]) {
      const w = Math.max(0.5, (halfY(y) || hb) - 0.3);
      c.beginPath(); c.moveTo(X(-w), Y(y)); c.lineTo(X(w), Y(y)); c.stroke();
    }
    // The armour, every plate where it is and as thick as it is (drawn
    // thicker than life so a thin plate can be seen at all).
    const hot = new Set(s.plates.map((p) => p.k));
    const stopK = s.stop >= 0 && s.plates[s.stop] ? s.plates[s.stop].k : null;
    const plate = (key, t, draw) => {
      if (!(t > 0)) return;
      c.strokeStyle = key === stopK ? '#ff5a3c' : hot.has(key) ? '#e8c46a' : '#8e9aa6';
      c.lineWidth = mm(t);
      c.beginPath(); draw(); c.stroke();
    };
    const beltKey = S.boxed ? 'b' : 'p';
    // Down her side, following her own plating.
    const sideLine = (sd, ya, yb) => {
      let first = true;
      for (let y = ya; y <= yb + 1e-6; y += 0.25) {
        const x = sd * ((halfY(y) || hb) - 0.15);
        if (first) { c.moveTo(X(x), Y(y)); first = false; } else c.lineTo(X(x), Y(y));
      }
    };
    plate(beltKey, S.belt, () => {
      for (const sd of [-1, 1]) sideLine(sd, S.beltLow, Math.min(S.beltTop, S.fb));
    });
    if (S.boxed) {
      plate('p', S.upper, () => {
        for (const sd of [-1, 1]) sideLine(sd, S.beltTop, S.fb);
      });
      plate('k', S.bulkhead, () => {
        for (const sd of [-1, 1]) { c.moveTo(X(sd * inner), Y(S.bottom)); c.lineTo(X(sd * inner), Y(S.mainDeck)); }
      });
      plate('d', S.deck, () => { const w = halfY(S.mainDeck) || hb; c.moveTo(X(-w), Y(S.mainDeck)); c.lineTo(X(w), Y(S.mainDeck)); });
      plate('s', S.splinter, () => { c.moveTo(X(-inner), Y(S.splinterDeck)); c.lineTo(X(inner), Y(S.splinterDeck)); });
    }
    plate('w', S.weather, () => { const w = halfY(S.fb - 0.1) || hb; c.moveTo(X(-w), Y(S.fb)); c.lineTo(X(w), Y(S.fb)); });
    if (s.ev.part === 'bow' || s.ev.part === 'stern') {
      plate(s.ev.part === 'bow' ? 'f' : 'a', S.bow, () => {
        if (ext) for (const sd of [-1, 1]) sideLine(sd, Math.max(ext.y0, -S.draft), S.fb);
        else hull();
      });
    }
    // Her outline over everything: her model's own lines where it cuts her,
    // her guns picked out, or the drawing's outline without one.
    if (s.segs && ext) {
      c.lineWidth = 1 * dpr;
      c.strokeStyle = 'rgba(200, 212, 222, 0.62)';
      c.beginPath();
      for (const g of s.segs) if (!g[4]) { c.moveTo(X(g[0]), Y(g[1])); c.lineTo(X(g[2]), Y(g[3])); }
      c.stroke();
      c.fillStyle = 'rgba(130, 120, 90, 0.5)';
      c.strokeStyle = 'rgba(232, 196, 106, 0.85)';
      c.lineWidth = 1.3 * dpr;
      c.beginPath();
      for (const g of s.segs) if (g[4]) { c.moveTo(X(g[0]), Y(g[1])); c.lineTo(X(g[2]), Y(g[3])); }
      c.stroke();
    } else {
      hull();
      c.strokeStyle = 'rgba(200, 212, 222, 0.6)';
      c.lineWidth = 1 * dpr;
      c.stroke();
    }

    // The round.
    const T = s.t;
    const at = this.shellAt(T);
    if (!s.burst) {
      const tail = 7;
      const g = c.createLinearGradient(X(at.x - s.d.x * tail), Y(at.y - s.d.y * tail), X(at.x), Y(at.y));
      g.addColorStop(0, 'rgba(255, 200, 120, 0)');
      g.addColorStop(1, 'rgba(255, 220, 160, 0.9)');
      c.strokeStyle = g;
      c.lineWidth = Math.max(2 * dpr, ((s.ev.cal || 152) / 1000) * k * 1.4);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(X(at.x - s.d.x * tail), Y(at.y - s.d.y * tail));
      c.lineTo(X(at.x), Y(at.y));
      c.stroke();
    } else if (s.away) {
      // What is left of a ricochet going away over her.
      const go = (T - APPROACH - s.inside) * 30;
      c.fillStyle = 'rgba(255, 220, 160, 0.8)';
      c.beginPath();
      c.arc(X(at.x + s.away.x * go), Y(at.y + s.away.y * go), 2.5 * dpr, 0, Math.PI * 2);
      c.fill();
    }
    // The burst.
    if (s.fire) {
      const f = s.fire;
      const u = Math.min(1, f.age / 1.3);
      const r = f.r * (0.4 + 1.2 * Math.sqrt(u)) * k;
      const g = c.createRadialGradient(X(f.x), Y(f.y), 0, X(f.x), Y(f.y), r);
      g.addColorStop(0, `rgba(255, 240, 200, ${0.95 * (1 - u)})`);
      g.addColorStop(0.35, `rgba(255, 150, 50, ${0.8 * (1 - u)})`);
      g.addColorStop(0.75, `rgba(120, 50, 20, ${0.55 * (1 - u * 0.7)})`);
      g.addColorStop(1, 'rgba(40, 30, 30, 0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(X(f.x), Y(f.y), r, 0, Math.PI * 2); c.fill();
    }
    // Shrapnel and sparks.
    for (const b of s.bits) {
      const a = 1 - b.age / b.life;
      c.strokeStyle = b.hot ? `rgba(255, ${170 + 60 * a}, 90, ${a})` : `rgba(170, 175, 180, ${a})`;
      c.lineWidth = (b.hot ? 1.6 : 2.2) * dpr;
      c.beginPath();
      c.moveTo(X(b.x), Y(b.y));
      c.lineTo(X(b.x - b.vx * 0.04), Y(b.y - b.vy * 0.04));
      c.stroke();
    }

    // What it met, plate by plate, and what came of it.
    c.textAlign = 'left';
    c.font = `600 ${15 * dpr}px "Inter", system-ui, sans-serif`;
    c.fillStyle = '#e6cf9c';
    const head = `${s.ev.cal || ''} mm ${s.ev.ap ? 'AP' : 'HE'} — ${s.cls.name}`;
    c.fillText(head, 24 * dpr, 34 * dpr);
    c.font = `${12 * dpr}px "Inter", system-ui, sans-serif`;
    let ly = 58 * dpr;
    s.plates.forEach((p, i) => {
      const reached = s.stop < 0 || i <= s.stop;
      c.fillStyle = i === s.stop && s.kind !== 'pen' ? '#ff6a4c' : i === s.stop ? '#ffb05a' : reached ? '#cfd8e0' : 'rgba(207, 216, 224, 0.4)';
      const what = i === s.stop ? (s.kind === 'ricochet' ? '  glanced off' : s.kind === 'pen' ? '  stopped it, burst' : '  stopped it') : reached ? '  through' : '';
      c.fillText(`${LAYER_NAMES[p.k] || p.k}  ${p.t} mm  (${p.eff} mm at that angle)${what}`, 24 * dpr, ly);
      ly += 18 * dpr;
    });
    if (T > APPROACH + s.inside) {
      c.font = `700 ${22 * dpr}px "Inter", system-ui, sans-serif`;
      c.textAlign = 'center';
      c.fillStyle = s.kind === 'citadel' ? '#ff5a3c' : (s.kind === 'pen' || s.kind === 'he' || s.kind === 'overpen') ? '#e6cf9c' : '#cfd8e0';
      c.fillText(`${RESULT[s.kind] || 'HIT'}${s.ev.dmg ? `  ${s.ev.dmg.toLocaleString()}` : ''}`, W / 2, H - 46 * dpr);
    }
    c.restore();
  }
}
