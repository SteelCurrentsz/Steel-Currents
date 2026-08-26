// The order of battle: where everything stands when the guns open.
//
// One chart of the battlefield a captain has chosen, with a token on it for
// every hull and every battery on both sides. Drag a token to move it, drag the
// handle off its bow to turn it. Ships go on water and guns go on land, and
// neither will sortie until every one of them is somewhere it can be.
//
// The chart is raised from the same world the battle will be fought in — the
// same seed, the same position, the same coastline — so what is drawn here is
// what is there when the fleets arrive, rather than a picture of it.

import {
  generateWorld, islandAt, shoreDistance, MAP_HALF,
} from '../../shared/world.js';
import { SHIP_CLASSES } from '../../shared/ships.js';
import { BATTERIES } from '../../shared/batteries.js';

// How much of the token is the body and how much is the handle you turn it by,
// in screen pixels. Generous, because this has to work under a thumb.
const BODY_R = 17;
const HANDLE_R = 13;
const HANDLE_OUT = 40;

const TEAM = [
  { fill: '#2c5da8', line: '#8cc2ff', dim: 'rgba(44, 93, 168, 0.5)' },
  { fill: '#9c332e', line: '#ffa9a2', dim: 'rgba(156, 51, 46, 0.5)' },
];
const BAD = '#e2564f';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * A chart of one battlefield with everybody's starting position on it.
 *
 * `onGo` is handed the layout when the captain is satisfied with it; `onBack`
 * takes them back to the briefing with nothing sent.
 */
export class LayoutMap {
  constructor({ onBack, onGo } = {}) {
    this.onBack = onBack;
    this.onGo = onGo;
    this.canvas = document.getElementById('lay-canvas');
    this.readout = document.getElementById('lay-readout');
    this.hint = document.getElementById('lay-hint');
    this.goBtn = document.getElementById('lay-go');
    this.autoBtn = document.getElementById('lay-auto');
    this.backBtn = document.getElementById('lay-back');
    if (!this.canvas) return;

    this.world = null;
    this.tokens = [];
    this.drag = null;
    this.dirty = false;
    this._size = null;
    this.bind();
  }

  // ------------------------------------------------------------- opening --

  /**
   * Raise the battlefield and lay everybody out in it.
   *
   * `req` is the battle request as the briefing built it, so the world here and
   * the world the server builds come out of the same four numbers.
   */
  show(req) {
    // What was already laid out, kept by what it is rather than by where it sat
    // in the list, so backing out to the briefing and coming forward again does
    // not throw the plan away just because one more destroyer joined.
    const kept = new Map();
    for (const t of this.tokens) kept.set(`${t.kind}:${t.classId}:${t.team}:${t.index}`, t);

    this.req = req;
    this.world = generateWorld(req.seed, req.mapId, req.time, req.half,
      Number.isFinite(req.lon) && Number.isFinite(req.lat)
        ? { lon: req.lon, lat: req.lat } : null,
      req.weather);
    this.half = this.world.half;

    // Team 0 is the captain's side and starts to the south, which is how the
    // simulation lays its own spawn lines out.
    this.tokens = [];
    const own = [req.classId, ...(req.allyClasses || [])];
    own.forEach((id, i) => this.tokens.push(this.shipToken(id, 0, i, i === 0)));
    (req.enemyClasses || []).forEach((id, i) => this.tokens.push(this.shipToken(id, 1, i, false)));
    (req.allyGuns || []).forEach((id, i) => this.tokens.push(this.gunToken(id, 0, i)));
    (req.enemyGuns || []).forEach((id, i) => this.tokens.push(this.gunToken(id, 1, i)));

    this.auto();

    // Only over the same battlefield: a different berth raises a different
    // coastline, and the old positions would be somewhere else entirely.
    const sig = `${req.mapId}|${req.seed}|${this.half}`;
    if (this.worldSig === sig) {
      for (const t of this.tokens) {
        const was = kept.get(`${t.kind}:${t.classId}:${t.team}:${t.index}`);
        if (!was) continue;
        t.x = was.x;
        t.z = was.z;
        t.heading = was.heading;
        this.check(t);
      }
    }
    this.worldSig = sig;

    this._size = null;
    this.dirty = true;
    this.paint();
  }

  /**
   * Everything the captain needs to read off the chart: what is on it, and
   * whether it can sail. Written on every repaint, because every repaint
   * follows something moving.
   */
  status() {
    const ships = this.tokens.filter((t) => t.kind === 'ship');
    const guns = this.tokens.filter((t) => t.kind === 'gun');
    const why = this.blocker();
    if (this.readout) {
      const mine = ships.filter((t) => t.team === 0).length;
      const theirs = ships.length - mine;
      const myGuns = guns.filter((t) => t.team === 0).length;
      this.readout.innerHTML =
        `<b>${this.req?.place || 'Open sea'}</b>`
        + `<span>${mine} of yours against ${theirs}`
        + `${guns.length ? ` &middot; ${myGuns} of ${guns.length} batteries yours` : ''}</span>`
        + `<span>${Math.round((this.half * 2) / 0.9144 / 1000)}k yards across</span>`;
    }
    if (this.hint) {
      this.hint.textContent = why
        || 'Drag to move, drag the peg off the bow to turn. Ships on the water, guns ashore.';
      this.hint.classList.toggle('bad', !!why);
    }
    if (this.goBtn) this.goBtn.disabled = !!why;
  }

  shipToken(classId, team, index, mine) {
    const cls = SHIP_CLASSES[classId] || SHIP_CLASSES.fletcher;
    return {
      kind: 'ship', classId, team, mine, index,
      name: cls.name, type: cls.type,
      length: cls.hull.length,
      x: 0, z: 0, heading: team === 0 ? 0 : Math.PI, ok: true,
    };
  }

  gunToken(batteryId, team, index) {
    const b = BATTERIES[batteryId] || BATTERIES.longues;
    return {
      kind: 'gun', classId: batteryId, team, mine: team === 0, index,
      name: b.name, type: b.bore,
      traverse: b.traverse ?? 120,
      x: 0, z: 0, heading: team === 0 ? 0 : Math.PI, ok: true,
    };
  }

  // ------------------------------------------------------------- laying --

  /** Put everything somewhere it can legally be. */
  auto() {
    const ships = this.tokens.filter((t) => t.kind === 'ship');
    // The same two lines the simulation forms its fleets up on, opened out to
    // suit the battlefield: four hundred yards between hulls is right at sea
    // and unreadable on a plan of forty thousand, and a captain cannot drag a
    // ship he cannot pick out of the huddle.
    const spacing = clamp(this.half / 8, 420, 2600);
    const back = Math.min(this.half, MAP_HALF) - 900;
    for (const t of ships) {
      const sign = t.team === 0 ? -1 : 1;
      const wantX = ((t.index % 8) - 3.5) * spacing;
      const wantZ = sign * back - sign * Math.floor(t.index / 8) * Math.max(500, spacing * 0.6);
      const berth = this.float(wantX, wantZ, Math.max(120, t.length * 0.6));
      t.x = berth.x;
      t.z = berth.z;
      t.heading = t.team === 0 ? 0 : Math.PI;
    }
    // The guns want ground, and the best ground is the highest they can find on
    // their own side of the field: a battery is sited for the sight line.
    const guns = this.tokens.filter((t) => t.kind === 'gun');
    if (guns.length) {
      const spots = this.landSpots(guns.length * 2 + 4);
      for (const t of guns) {
        const side = t.team === 0 ? -1 : 1;
        const wanted = spots
          .filter((s) => !s.taken)
          .sort((a, bb) => (bb.score + (Math.sign(bb.z) === side ? 900 : 0))
            - (a.score + (Math.sign(a.z) === side ? 900 : 0)))[0];
        if (wanted) {
          wanted.taken = true;
          t.x = wanted.x;
          t.z = wanted.z;
        } else {
          t.x = 0;
          t.z = side * this.half * 0.5;
        }
        // Laid across the battlefield, which is where the ships will be.
        t.heading = Math.atan2(-t.x, -t.z);
      }
    }
    for (const t of this.tokens) this.check(t);
  }

  /**
   * The nearest water with sea room for a hull of this size, starting from
   * where we wanted to put her. Walked outward in rings, the way the
   * simulation walks its own spawn line off a headland.
   */
  float(x, z, pad) {
    const edge = this.half - 200;
    const cx = clamp(x, -edge, edge);
    const cz = clamp(z, -edge, edge);
    if (!islandAt(this.world, cx, cz, pad)) return { x: cx, z: cz };
    for (let r = pad; r <= this.half; r += pad) {
      for (let a = 0; a < 16; a++) {
        const th = (a / 16) * Math.PI * 2;
        const nx = clamp(cx + Math.cos(th) * r, -edge, edge);
        const nz = clamp(cz + Math.sin(th) * r, -edge, edge);
        if (!islandAt(this.world, nx, nz, pad)) return { x: nx, z: nz };
      }
    }
    return { x: cx, z: cz };
  }

  /**
   * Ground worth putting a gun on.
   *
   * Two kinds of land answer here and they are found in different ways. A real
   * coastline is one piece and the question is where on it to build, so it is
   * walked on a grid and scored by how far inland each cell is. Invented
   * islands are small and far apart -- a grid coarse enough to cross the
   * battlefield steps clean over them -- so each one offers its own middle.
   */
  landSpots(want) {
    const out = [];
    for (const i of this.world.islands || []) {
      if (i.r < 110) continue;                     // a rock, not a gun position
      out.push({ x: i.x, z: i.z, score: Math.min(i.r, 1800), taken: false });
    }
    if (this.world.land?.length) {
      const step = Math.max(240, this.half / 26);
      for (let z = -this.half + step; z < this.half; z += step) {
        for (let x = -this.half + step; x < this.half; x += step) {
          const d = shoreDistance(this.world, x, z);
          if (d < 90) continue;                    // at sea, or on the beach
          out.push({ x, z, score: Math.min(d, 1800), taken: false });
        }
      }
    }
    out.sort((a, b) => b.score - a.score);
    // Thinned, so the batteries are spread over the battlefield rather than
    // stacked in the middle of the largest island. If that leaves too few, the
    // rest are taken as they come: crowded is better than in the sea.
    const kept = [];
    const apart = this.half / 12;
    for (const s of out) {
      if (kept.length >= want) break;
      if (kept.some((k) => Math.hypot(k.x - s.x, k.z - s.z) < apart)) continue;
      kept.push(s);
    }
    for (const s of out) {
      if (kept.length >= want) break;
      if (!kept.includes(s)) kept.push(s);
    }
    return kept;
  }

  /** Is this token somewhere it is allowed to be? */
  check(t) {
    const inside = Math.abs(t.x) < this.half - 200 && Math.abs(t.z) < this.half - 200;
    if (t.kind === 'ship') {
      // Sea room for her own length, so she is not sitting on a shoal. Islands
      // and the real shore are both land here -- a hull does not care which
      // kind of ground she is on when she is on it.
      t.ok = inside && !islandAt(this.world, t.x, t.z, Math.max(120, t.length * 0.6));
    } else {
      t.ok = inside && !!islandAt(this.world, t.x, t.z, 0);
    }
    return t.ok;
  }

  /** What is stopping the sortie, or '' when nothing is. */
  blocker() {
    const bad = this.tokens.filter((t) => !t.ok);
    if (!bad.length) return '';
    const ship = bad.find((t) => t.kind === 'ship');
    if (ship) return `${ship.name} is aground. Ships go on the water.`;
    return `${bad[0].name} has no ground under it. Batteries go ashore.`;
  }

  // ---------------------------------------------------------- projection --

  get size() {
    if (!this._size) {
      this._size = {
        w: this.canvas.clientWidth || 1200,
        h: this.canvas.clientHeight || 800,
      };
    }
    return this._size;
  }

  /** Metres to pixels. The whole battlefield is always in the frame — this is
   *  a plan of it, not a view of part of it.
   *
   *  The battlefield is square, so the chart is the largest square that fits
   *  between the margins and clear of the row of buttons along the foot. That
   *  is the width on a phone held upright and the height on one turned on its
   *  side, and neither case has to be special-cased to come out right. */
  get scale() {
    const { w, h } = this.size;
    const side = Math.max(160, Math.min(w - 40, h - 140));
    return side / (this.half * 2);
  }

  toScreen(x, z) {
    const { w, h } = this.size;
    const s = this.scale;
    return { x: w / 2 + x * s, y: h / 2 - z * s };
  }

  fromScreen(px, py) {
    const { w, h } = this.size;
    const s = this.scale;
    return { x: (px - w / 2) / s, z: (h / 2 - py) / s };
  }

  // ------------------------------------------------------------ pointers --

  bind() {
    const el = this.canvas;
    const at = (e) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const down = (e) => {
      const p = at(e);
      let best = null;
      let bestD = Infinity;
      for (const t of this.tokens) {
        const s = this.toScreen(t.x, t.z);
        const hx = s.x + Math.sin(t.heading) * HANDLE_OUT;
        const hy = s.y - Math.cos(t.heading) * HANDLE_OUT;
        const dh = Math.hypot(p.x - hx, p.y - hy);
        if (dh < HANDLE_R + 8 && dh < bestD) { best = { t, mode: 'turn' }; bestD = dh; }
        const db = Math.hypot(p.x - s.x, p.y - s.y);
        if (db < BODY_R + 6 && db < bestD) { best = { t, mode: 'move' }; bestD = db; }
      }
      if (!best) return;
      this.drag = best;
      // The one being moved is drawn last, so it is on top of whatever it is
      // being dragged over.
      this.tokens.splice(this.tokens.indexOf(best.t), 1);
      this.tokens.push(best.t);
      try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      this.dirty = true;
      e.preventDefault();
    };

    const move = (e) => {
      if (!this.drag) return;
      const p = at(e);
      const t = this.drag.t;
      if (this.drag.mode === 'move') {
        const w = this.fromScreen(p.x, p.y);
        t.x = clamp(w.x, -this.half + 150, this.half - 150);
        t.z = clamp(w.z, -this.half + 150, this.half - 150);
      } else {
        const s = this.toScreen(t.x, t.z);
        t.heading = Math.atan2(p.x - s.x, s.y - p.y);
      }
      this.check(t);
      this.dirty = true;
      e.preventDefault();
    };

    const up = (e) => {
      if (!this.drag) return;
      this.drag = null;
      try { el.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
      this.dirty = true;
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);

    if (this.backBtn) this.backBtn.onclick = () => this.onBack?.();
    if (this.autoBtn) {
      this.autoBtn.onclick = () => { this.auto(); this.dirty = true; this.paint(); };
    }
    if (this.goBtn) {
      this.goBtn.onclick = () => { if (!this.blocker()) this.onGo?.(this.result()); };
    }
    this.onResize = () => { this._size = null; this.dirty = true; };
    window.addEventListener('resize', this.onResize);
  }

  // -------------------------------------------------------------- paint --

  update() {
    if (this.dirty) this.paint();
  }

  paint() {
    if (!this.canvas || !this.world) return;
    this.dirty = false;
    this._size = null;
    const { w, h } = this.size;
    if (!(w > 0) || !(h > 0)) { this.dirty = true; return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const s = this.scale;
    const half = this.half * s;
    const cx = w / 2;
    const cy = h / 2;

    // The sea, and the borders of the battlefield.
    ctx.fillStyle = '#0a1b2b';
    ctx.fillRect(cx - half, cy - half, half * 2, half * 2);

    // The land, exactly as the simulation will raise it.
    ctx.fillStyle = '#3f5a3a';
    ctx.strokeStyle = '#9fb69a';
    ctx.lineWidth = 1;
    if (this.world.land?.length) {
      const path = new Path2D();
      for (const ring of this.world.land) {
        ring.forEach(([x, z], i) => {
          const p = this.toScreen(x, z);
          if (i === 0) path.moveTo(p.x, p.y); else path.lineTo(p.x, p.y);
        });
        path.closePath();
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - half, cy - half, half * 2, half * 2);
      ctx.clip();
      ctx.fill(path, 'evenodd');
      ctx.stroke(path);
      ctx.restore();
    }
    for (const i of this.world.islands || []) {
      const p = this.toScreen(i.x, i.z);
      ctx.beginPath();
      ctx.arc(p.x, p.y, i.r * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // A grid at a round number of yards, and the border over it.
    const gridM = this.half > 20000 ? 10000 : this.half > 9000 ? 5000 : 2000;
    ctx.strokeStyle = 'rgba(120, 168, 200, 0.14)';
    ctx.beginPath();
    for (let g = -this.half; g <= this.half + 1; g += gridM) {
      ctx.moveTo(cx + g * s, cy - half); ctx.lineTo(cx + g * s, cy + half);
      ctx.moveTo(cx - half, cy - g * s); ctx.lineTo(cx + half, cy - g * s);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(230, 207, 156, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - half, cy - half, half * 2, half * 2);

    // Whose end of the field is whose, so a captain knows which way is theirs.
    // Down the right-hand edge, clear of the hint line that runs across the
    // foot of the screen and clear of the scale bar in the other corner.
    ctx.font = '600 12px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.letterSpacing = '0.2em';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(140, 194, 255, 0.6)';
    ctx.fillText('YOUR END', cx + half - 12, cy + half - 14);
    ctx.fillStyle = 'rgba(255, 169, 162, 0.6)';
    ctx.fillText('ENEMY END', cx + half - 12, cy - half + 22);
    ctx.letterSpacing = '0px';

    for (const t of this.tokens) this.drawToken(ctx, t);
    this.drawNames(ctx);

    // The scale bar, because a plan without one says nothing about range. It
    // sits inside the border: below it is the row of buttons.
    const barM = gridM;
    const bx = cx - half + 14;
    const by = cy + half - 18;
    ctx.strokeStyle = 'rgba(230, 207, 156, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, by); ctx.lineTo(bx + barM * s, by);
    ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by + 4);
    ctx.moveTo(bx + barM * s, by - 4); ctx.lineTo(bx + barM * s, by + 4);
    ctx.stroke();
    ctx.fillStyle = 'rgba(230, 207, 156, 0.8)';
    ctx.textAlign = 'left';
    ctx.font = '11px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText(`${Math.round(barM / 0.9144 / 100) * 100} yd`, bx + barM * s + 8, by + 4);

    this.status();
  }

  drawToken(ctx, t) {
    const p = this.toScreen(t.x, t.z);
    const col = TEAM[t.team];
    const sin = Math.sin(t.heading);
    const cos = Math.cos(t.heading);

    // A gun's field of fire, so what it is pointed at means something.
    if (t.kind === 'gun') {
      const half = ((t.traverse >= 360 ? 360 : t.traverse) / 2) * (Math.PI / 180);
      const reach = 54;
      ctx.beginPath();
      if (t.traverse >= 360) {
        ctx.arc(p.x, p.y, reach, 0, Math.PI * 2);
      } else {
        ctx.moveTo(p.x, p.y);
        // Canvas angles run from +x and clockwise on a y-down canvas, and the
        // heading runs from +z and clockwise on the chart, so the two differ by
        // a quarter turn.
        const a0 = t.heading - half - Math.PI / 2;
        const a1 = t.heading + half - Math.PI / 2;
        ctx.arc(p.x, p.y, reach, a0, a1);
        ctx.closePath();
      }
      ctx.fillStyle = t.ok ? col.dim : 'rgba(226, 86, 79, 0.32)';
      ctx.globalAlpha = 0.35;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // The handle it is turned by, and the shaft joining it to the body.
    const hx = p.x + sin * HANDLE_OUT;
    const hy = p.y - cos * HANDLE_OUT;
    ctx.strokeStyle = 'rgba(230, 207, 156, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x + sin * BODY_R, p.y - cos * BODY_R);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx, hy, HANDLE_R * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = '#e6cf9c';
    ctx.fill();

    // The body.
    ctx.save();
    ctx.translate(p.x, p.y);
    // Screen y runs down while z runs up, so the chart is a mirror of the world
    // in y -- and a heading measured clockwise from +z comes out as the same
    // rotation clockwise on the canvas rather than its opposite.
    ctx.rotate(t.heading);
    ctx.beginPath();
    if (t.kind === 'ship') {
      // A hull: pointed at the bow, square at the transom.
      ctx.moveTo(0, -BODY_R);
      ctx.lineTo(BODY_R * 0.6, -BODY_R * 0.25);
      ctx.lineTo(BODY_R * 0.55, BODY_R * 0.85);
      ctx.lineTo(-BODY_R * 0.55, BODY_R * 0.85);
      ctx.lineTo(-BODY_R * 0.6, -BODY_R * 0.25);
      ctx.closePath();
    } else {
      // A gun: a drum with a barrel out of it.
      ctx.arc(0, 0, BODY_R * 0.72, 0, Math.PI * 2);
    }
    ctx.fillStyle = t.ok ? col.fill : BAD;
    ctx.fill();
    ctx.lineWidth = t.mine ? 2.4 : 1.4;
    ctx.strokeStyle = t.ok ? col.line : '#ffd9d6';
    ctx.stroke();
    if (t.kind === 'gun') {
      ctx.beginPath();
      ctx.moveTo(0, -BODY_R * 0.5);
      ctx.lineTo(0, -BODY_R * 1.25);
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * The names, in a pass of their own so that a label can be dropped when it
   * would land on one already written. A squadron in line abreast puts three
   * hulls inside a centimetre of chart, and three names on top of each other
   * say less than one name does.
   *
   * Walked from the top of the pile down, so whatever was last picked up keeps
   * its name whoever else it has been dragged over.
   */
  drawNames(ctx) {
    ctx.font = '600 10px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    const taken = [];
    const clear = (x, y) => !taken.some((s) => Math.abs(s.x - x) < 52 && Math.abs(s.y - y) < 11);
    for (let i = this.tokens.length - 1; i >= 0; i--) {
      const t = this.tokens[i];
      const p = this.toScreen(t.x, t.z);
      // Under the token, unless the token is pointed that way -- a hull steering
      // down the chart has her peg where her name would go, so the name goes
      // over her head instead.
      const over = Math.cos(t.heading) < 0;
      const base = over ? p.y - BODY_R - 9 : p.y + BODY_R + 13;
      const away = over ? -11 : 11;
      // A line further off, then two, before the name is given up: a division
      // in line abreast then reads as a stepped column rather than one blot.
      let y = base;
      let room = clear(p.x, y);
      for (let step = 1; !room && step <= 2; step++) {
        y = base + step * away;
        room = clear(p.x, y);
      }
      if (!room) continue;
      taken.push({ x: p.x, y });
      ctx.fillStyle = t.ok ? 'rgba(240, 232, 214, 0.9)' : '#ffd9d6';
      ctx.fillText(t.name.length > 20 ? `${t.name.slice(0, 19)}…` : t.name, p.x, y);
    }
  }

  /**
   * The layout, in the shape the battle request carries it.
   *
   * The ship berths are read by the server and the fleets start on them. The
   * battery berths go with them, but nothing on the other end reads those yet:
   * the simulation has no shore-battery entity, so a coast gun is chosen,
   * counted and sited here and takes no part in the fighting.
   */
  result() {
    const pick = (kind, team) => this.tokens
      .filter((t) => t.kind === kind && t.team === team)
      .sort((a, b) => a.index - b.index)
      .map((t) => ({
        x: Math.round(t.x), z: Math.round(t.z),
        h: Math.round(t.heading * 1000) / 1000,
      }));
    return {
      allies: pick('ship', 0),
      enemies: pick('ship', 1),
      allyGuns: pick('gun', 0),
      enemyGuns: pick('gun', 1),
    };
  }
}
