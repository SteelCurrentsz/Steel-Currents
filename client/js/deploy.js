// The deployment chart: pick where the battle is fought.
//
// A full-screen chart of the world with four pins on it. They are the corners
// of the battlefield: drag any one and the box changes shape, and the water
// inside the four of them is what the fleets will fight over. A corner may
// stand in open water or on a thousand yards of shore — a beach, a spit, a
// harbour mole — and nowhere further inland than that. The test is run against
// the same coastline polygons the chart draws, so it can never disagree with
// what is on the screen.

import { drawWorld, nearWater, waterSquareKm } from './worldmap.js';
import { waterName } from './waters.js';

// The battlefield is at most seventy thousand yards on a side, which is a
// shade under sixty-four kilometres. It cannot be made smaller than a gunnery
// range across, or there would be nothing to manoeuvre in.
export const BATTLE_YARDS = 70000;
export const BATTLE_KM = (BATTLE_YARDS * 0.9144) / 1000;
const MIN_YARDS = 8000;
const MIN_KM = (MIN_YARDS * 0.9144) / 1000;

// How far inland a corner may be laid: a thousand yards of shore, no more.
const SHORE_YARDS = 1000;
const SHORE_KM = (SHORE_YARDS * 0.9144) / 1000;

const MIN_ZOOM = 1;
const MAX_ZOOM = 220;

const KM_PER_DEG = 111.32;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** Degrees of longitude per kilometre at a latitude. */
const lonKm = (lat) => 1 / (KM_PER_DEG * Math.max(0.08, Math.cos((lat * Math.PI) / 180)));

export class DeployMap {
  /**
   * @param onPick called with {lon, lat, name, km, room, pins} whenever a
   *        corner settles.
   */
  constructor({ onPick, onClose } = {}) {
    this.onPick = onPick;
    this.onClose = onClose;
    this.canvas = document.getElementById('deploy-canvas');
    this.readout = document.getElementById('deploy-readout');
    this.hint = document.getElementById('deploy-hint');
    if (!this.canvas) return;

    // Somewhere with sea room to start. The four corners come up as a square
    // of half the largest field, which leaves room to drag them out.
    this.view = { lon: 0, lat: 10, zoom: 1 };
    this.setBox(-30, 45, BATTLE_KM * 0.5);
    this.held = -1;               // which corner is under the finger
    this.badTap = false;          // the last tap was into the middle of a continent
    this.dragging = null;         // 'pin' | 'pan' | null
    this.pointers = new Map();
    this.pinch = 0;
    this.dirty = true;

    this.bind();
  }

  // ------------------------------------------------------------------ box --

  /** Lay the four corners out as a square of `km` a side, centred on a point. */
  setBox(lon, lat, km) {
    const dLat = km / 2 / KM_PER_DEG;
    const dLon = (km / 2) * lonKm(lat);
    // Clockwise from the north-west, so the outline draws without crossing.
    this.pins = [
      { lon: lon - dLon, lat: lat + dLat },
      { lon: lon + dLon, lat: lat + dLat },
      { lon: lon + dLon, lat: lat - dLat },
      { lon: lon - dLon, lat: lat - dLat },
    ];
    this.checkPins();
  }

  /** The centre of the four corners. */
  get centre() {
    const n = this.pins.length;
    let lon = 0;
    let lat = 0;
    for (const p of this.pins) { lon += p.lon; lat += p.lat; }
    return { lon: lon / n, lat: lat / n };
  }

  /**
   * How far the box reaches, in kilometres east-west and north-south. The
   * battlefield the game lays out is square, so the longer of the two is what
   * it has to cover.
   */
  extent() {
    const lats = this.pins.map((p) => p.lat);
    const lons = this.pins.map((p) => p.lon);
    const c = this.centre;
    const dLat = Math.max(...lats) - Math.min(...lats);
    const dLon = Math.max(...lons) - Math.min(...lons);
    return {
      w: dLon / lonKm(c.lat),
      h: dLat * KM_PER_DEG,
    };
  }

  /** Every corner has to stand in water or on a thousand yards of shore. */
  checkPins() {
    this.bad = this.pins.map((p) => !nearWater(p.lon, p.lat, SHORE_KM));
    this.valid = !this.bad.some(Boolean);
    return this.valid;
  }

  // --------------------------------------------------------------- geometry --

  get size() {
    return {
      w: this.canvas.clientWidth || 1200,
      h: this.canvas.clientHeight || 800,
    };
  }

  scale() { return (this.size.w / 360) * this.view.zoom; }

  toScreen(lon, lat) {
    const { w, h } = this.size;
    const s = this.scale();
    // Longitude wraps: draw the pin on whichever copy of the world is in view.
    let dl = lon - this.view.lon;
    while (dl > 180) dl -= 360;
    while (dl < -180) dl += 360;
    return { x: w / 2 + dl * s, y: h / 2 - (lat - this.view.lat) * s };
  }

  toWorld(x, y) {
    const { w, h } = this.size;
    const s = this.scale();
    let lon = this.view.lon + (x - w / 2) / s;
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    return { lon, lat: clamp(this.view.lat - (y - h / 2) / s, -89.5, 89.5) };
  }

  // ---------------------------------------------------------------- controls --

  bind() {
    const el = this.canvas;

    const local = (e) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    this.onDown = (e) => {
      const p = local(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2) {
        this.pinch = this.spread();
        this.dragging = null;
        return;
      }
      // The nearest corner, if the finger is anywhere near one. A generous
      // grab radius: the pins are the point of this screen, and on a phone a
      // twelve-pixel target is not one.
      this.held = this.nearestPin(p, 40);
      this.dragging = this.held >= 0 ? 'pin' : 'pan';
      this.downAt = p;
      try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    };

    this.onMove = (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      this.pointers.set(e.pointerId, p);

      if (this.pointers.size === 2 && this.pinch > 0) {
        const now = this.spread();
        this.zoomAt(this.midpoint(), now / Math.max(1, this.pinch));
        this.pinch = now;
        return;
      }
      const s = this.scale();
      if (this.dragging === 'pan') {
        this.view.lon -= (p.x - prev.x) / s;
        this.view.lat += (p.y - prev.y) / s;
        this.normalise();
        this.dirty = true;
      } else if (this.dragging === 'pin') {
        this.movePin(this.held, this.toWorld(p.x, p.y + 14));
      }
    };

    this.onUp = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = 0;
      // A tap on open water carries the whole box there, shape and all.
      // Hunting for a forty-pixel grab circle is no way to work a chart on a
      // phone, and a tap is a pan that went nowhere, so the two never collide.
      if (this.dragging === 'pan' && this.downAt) {
        const p = local(e);
        if (Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) < 6) {
          const to = this.toWorld(p.x, p.y);
          // A tap into the middle of a continent is a slip, not an order.
          if (!nearWater(to.lon, to.lat, SHORE_KM)) {
            this.badTap = true;
            this.dirty = true;
            this.dragging = null;
            this.held = -1;
            try { el.releasePointerCapture(e.pointerId); } catch { /* gone */ }
            return;
          }
          this.badTap = false;
          this.moveBox(to);
          // Bring the chart with it. The corners are the whole of this screen,
          // and a box carried to a spot off to one side and then zoomed away
          // from is a box the captain has to go hunting for.
          this.view.lon = this.centre.lon;
          this.view.lat = this.centre.lat;
          this.normalise();
          this.settle();
        }
      }
      if (this.dragging === 'pin') this.settle();
      this.dragging = null;
      this.held = -1;
      try { el.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    };

    this.onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      this.zoomAt({ x: e.clientX - r.left, y: e.clientY - r.top },
        e.deltaY < 0 ? 1.18 : 1 / 1.18);
    };

    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });

    document.getElementById('deploy-in')?.addEventListener('click', () => this.zoom(1.5));
    document.getElementById('deploy-out')?.addEventListener('click', () => this.zoom(1 / 1.5));

    this.onKey = (e) => {
      if (!document.getElementById('screen-map')?.classList.contains('active')) return;
      if (e.code === 'Equal' || e.code === 'NumpadAdd') this.zoom(1.5);
      else if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.zoom(1 / 1.5);
    };
    window.addEventListener('keydown', this.onKey);

    this.onResize = () => { this.dirty = true; };
    window.addEventListener('resize', this.onResize);
  }

  spread() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  midpoint() {
    const [a, b] = [...this.pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /** Zoom about a point on the canvas, so what is under the finger stays put. */
  zoomAt(p, factor) {
    const before = this.toWorld(p.x, p.y);
    this.view.zoom = clamp(this.view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const after = this.toWorld(p.x, p.y);
    this.view.lon += before.lon - after.lon;
    this.view.lat += before.lat - after.lat;
    this.normalise();
    this.dirty = true;
  }

  /**
   * The zoom buttons work about the battlefield rather than about the middle
   * of the view. Anchoring on the view centre lets the box slide out of frame
   * and then walks away from it, which is no use at all on a screen whose
   * whole purpose is four corners that have to be dragged.
   */
  zoom(factor) {
    this.zoomAt(this.toScreen(this.centre.lon, this.centre.lat), factor);
  }

  normalise() {
    while (this.view.lon > 180) this.view.lon -= 360;
    while (this.view.lon < -180) this.view.lon += 360;
    // Do not let the chart run off the top or bottom of the world.
    const half = (this.size.h / 2) / this.scale();
    this.view.lat = clamp(this.view.lat, Math.min(0, -90 + half), Math.max(0, 90 - half));
  }

  // ------------------------------------------------------------------ pins --

  /** The corner nearest a point on the canvas, or -1 if none is within reach. */
  nearestPin(p, reach) {
    let best = -1;
    let bd = reach;
    this.pins.forEach((pin, i) => {
      const q = this.toScreen(pin.lon, pin.lat);
      const d = Math.hypot(p.x - q.x, p.y - q.y + 14);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  /**
   * Put one corner somewhere. It goes alone: the other three stay where they
   * were, so the four of them can be worked into any shape a captain wants —
   * a rectangle, a diamond, a wedge running along a coast. Only the corner
   * under the finger moves.
   */
  setCorner(i, lon, lat) {
    this.pins[i] = { lon, lat: clamp(lat, -89, 89) };
  }

  /**
   * Drag one corner, held to the seventy-thousand-yard limit. The limit is on
   * how far the four of them reach between them, so a corner can be taken as
   * far as it likes in any direction until the box is as wide or as deep as
   * the game will lay out, and then no further — and the other three are not
   * dragged along to enforce it.
   */
  movePin(i, at) {
    if (i < 0) return;
    // What the other three already reach, in degrees.
    let lo = { lon: Infinity, lat: Infinity };
    let hi = { lon: -Infinity, lat: -Infinity };
    this.pins.forEach((p, k) => {
      if (k === i) return;
      lo.lon = Math.min(lo.lon, p.lon); hi.lon = Math.max(hi.lon, p.lon);
      lo.lat = Math.min(lo.lat, p.lat); hi.lat = Math.max(hi.lat, p.lat);
    });

    const c = this.centre;
    // lonKm gives degrees of longitude to the kilometre, so a distance in
    // kilometres becomes a span in degrees by multiplying, not dividing.
    const degLon = lonKm(c.lat);
    const degLat = 1 / KM_PER_DEG;
    const maxLon = BATTLE_KM * degLon;
    const maxLat = BATTLE_KM * degLat;

    // Anywhere that keeps the whole box inside the limit.
    let lon = clamp(at.lon, hi.lon - maxLon, lo.lon + maxLon);
    let lat = clamp(at.lat, hi.lat - maxLat, lo.lat + maxLat);
    // And a floor under it, so a corner dropped on top of another one does not
    // leave a battlefield with no sea room in it.
    const minLon = MIN_KM * degLon;
    const minLat = MIN_KM * degLat;
    if (hi.lon - lo.lon < minLon && lon > lo.lon - minLon && lon < hi.lon + minLon) {
      lon = lon < (lo.lon + hi.lon) / 2 ? lo.lon - minLon : hi.lon + minLon;
    }
    if (hi.lat - lo.lat < minLat && lat > lo.lat - minLat && lat < hi.lat + minLat) {
      lat = lat < (lo.lat + hi.lat) / 2 ? lo.lat - minLat : hi.lat + minLat;
    }

    this.setCorner(i, lon, lat);
    this.checkPins();
    this.result = null;
    this.dirty = true;
  }

  /**
   * Hold the box to its limits about its own centre. Needed after it is
   * carried somewhere else as well as after a corner is dragged: a box of
   * fixed degrees covers more ground the nearer the equator it is taken, so a
   * seventy-thousand-yard field moved south would otherwise quietly grow.
   */
  clampBox() {
    // A box with no width to it cannot be scaled back out — nought times
    // anything is nought — so it is laid out afresh instead. It only happens
    // if something has squashed it flat, but a battlefield with no sea room in
    // it is not something to leave lying about.
    const e0 = this.extent();
    if (e0.w < MIN_KM * 0.02 || e0.h < MIN_KM * 0.02) {
      const c0 = this.centre;
      this.setBox(c0.lon, clamp(c0.lat, -80, 80), MIN_KM * 2);
      return;
    }
    for (let pass = 0; pass < 3; pass++) {
      const e = this.extent();
      const c = this.centre;
      const f = (size) => (size > BATTLE_KM ? BATTLE_KM / size
        : (size < MIN_KM ? MIN_KM / Math.max(size, 1e-6) : 1));
      const fw = f(e.w);
      const fh = f(e.h);
      if (fw === 1 && fh === 1) break;
      this.pins = this.pins.map((p) => ({
        lon: c.lon + (p.lon - c.lon) * fw,
        lat: clamp(c.lat + (p.lat - c.lat) * fh, -89, 89),
      }));
    }
  }

  /** Carry the whole box somewhere else, keeping its shape. */
  moveBox(at) {
    const c = this.centre;
    // The whole box has to stay on the chart, so the limit is on where its
    // centre may go rather than on each corner. Clamping the corners flattens
    // the box against the pole instead of stopping it at one.
    const lats = this.pins.map((p) => p.lat);
    const up = Math.max(...lats) - c.lat;
    const down = c.lat - Math.min(...lats);
    const lat = clamp(at.lat, -89 + down, 89 - up);
    // Carried by the ground it covers, not by the degrees it spans. A box of
    // fixed longitude is a different size at every latitude, so translating in
    // degrees would have it swell on the way to the equator and pinch shut on
    // the way to the pole.
    const from = lonKm(c.lat);
    const to = lonKm(lat);
    this.pins = this.pins.map((p) => ({
      lon: at.lon + ((p.lon - c.lon) / from) * to,
      lat: p.lat + (lat - c.lat),
    }));
    this.clampBox();
    this.checkPins();
    this.result = null;
    this.dirty = true;
  }

  /**
   * Work out what the four corners have settled on. Only done on release: the
   * sea-room search runs a few hundred point-in-polygon tests and has no
   * business running on every pointermove.
   */
  settle() {
    const c = this.centre;
    const e = this.extent();
    // The game lays a square field out, so it has to reach the longer side.
    const km = clamp(Math.max(e.w, e.h), MIN_KM, BATTLE_KM);
    this.result = {
      lon: c.lon,
      lat: c.lat,
      name: waterName(c.lon, c.lat),
      km,
      w: e.w,
      h: e.h,
      // How much clear water there is round the middle, which is what decides
      // whether this is an open-ocean action or a fight through islands. It is
      // not the same question as how big a box the captain has drawn.
      room: waterSquareKm(c.lon, c.lat, BATTLE_KM),
      pins: this.pins.map((p) => ({ lon: p.lon, lat: p.lat })),
    };
    this.onPick?.(this.result);
    this.dirty = true;
    this.paintReadout();
  }

  /** Open the chart on a battlefield that has already been chosen. It comes up
   *  at world scale with the box in the middle of it, and is zoomed in from
   *  there to place the corners exactly. */
  show(at) {
    if (at?.pins?.length === 4) {
      this.pins = at.pins.map((p) => ({ lon: p.lon, lat: p.lat }));
      this.clampBox();
      this.checkPins();
      this.result = null;
    } else if (at) {
      this.setBox(at.lon, at.lat, clamp(at.km || BATTLE_KM * 0.5, MIN_KM, BATTLE_KM));
      this.result = null;
    }
    const c = this.centre;
    this.view.lon = c.lon;
    this.view.lat = c.lat;
    // Framed on the box rather than on the world. Four corners that have to be
    // dragged are no use at a scale where the whole battlefield is half a
    // pixel across; zooming out to find another sea is one gesture away.
    this.view.zoom = this.zoomForBox(0.34);
    this.normalise();
    if (!this.result) this.settle();
    this.dirty = true;
    this.paintReadout();
    this.paint();
  }

  /** The zoom that puts the box across `frac` of the shorter side of the view. */
  zoomForBox(frac) {
    const { w, h } = this.size;
    const e = this.extent();
    const deg = Math.max(
      e.h / KM_PER_DEG,
      e.w * lonKm(this.centre.lat),
      0.02,
    );
    const wanted = (frac * Math.min(w, h)) / deg;       // pixels per degree
    return clamp((wanted * 360) / w, MIN_ZOOM, MAX_ZOOM);
  }

  paintReadout() {
    if (!this.readout) return;
    const r = this.result;
    if (!r) { this.readout.textContent = ''; return; }
    const yd = (km) => Math.round((km * 1000) / 0.9144 / 100) * 100;
    const ns = r.lat >= 0 ? 'N' : 'S';
    const ew = r.lon >= 0 ? 'E' : 'W';
    const confined = r.room < r.km - 0.05;
    this.readout.innerHTML =
      `<b>${r.name}</b><span>${Math.abs(r.lat).toFixed(2)}&deg;${ns} `
      + `${Math.abs(r.lon).toFixed(2)}&deg;${ew}</span>`
      + `<span>${yd(r.w).toLocaleString('en-US')} &times; `
      + `${yd(r.h).toLocaleString('en-US')} yd`
      + `${confined ? ' &mdash; confined water' : ''}</span>`;
  }

  // ------------------------------------------------------------------ paint --

  /** Repaint if anything has changed. Called from the render loop. */
  update() {
    if (!this.dirty) return;
    this.dirty = false;
    this.paint();
  }

  paint() {
    if (!this.canvas) return;
    const { w, h } = this.size;
    drawWorld(this.canvas, {
      focus: [this.view.lon, this.view.lat],
      zoom: this.view.zoom,
      sea: '#071320',
      coast: '#93b0bf',
      graticule: true,
      showWaters: true,
      showPlaces: this.view.zoom < 40,
    });

    const ctx = this.canvas.getContext('2d');
    const pts = this.pins.map((q) => this.toScreen(q.lon, q.lat));
    const ok = this.valid;
    const line = ok ? 'rgba(230, 207, 156, 0.90)' : 'rgba(226, 86, 79, 0.90)';
    const wash = ok ? 'rgba(230, 207, 156, 0.07)' : 'rgba(226, 86, 79, 0.10)';

    // The battlefield: the water inside the four corners, hatched so it reads
    // as a claimed area rather than as an empty frame drawn on the chart.
    const area = new Path2D();
    area.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) area.lineTo(pts[i].x, pts[i].y);
    area.closePath();

    ctx.save();
    ctx.fillStyle = wash;
    ctx.fill(area);
    ctx.clip(area);
    // Slanted lines across it, drawn from the top-left corner of the canvas so
    // the hatch stays put while the box is dragged over it.
    ctx.strokeStyle = ok ? 'rgba(230, 207, 156, 0.30)' : 'rgba(226, 86, 79, 0.34)';
    ctx.lineWidth = 1;
    const step = 14;
    ctx.beginPath();
    for (let k = -h; k < w + h; k += step) {
      ctx.moveTo(k, 0);
      ctx.lineTo(k + h, h);
    }
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = line;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([7, 5]);
    ctx.stroke(area);
    ctx.setLineDash([]);

    // The square the game will actually lay out, which has to reach the longer
    // side of whatever shape the captain has drawn.
    if (this.result) {
      const c = this.toScreen(this.centre.lon, this.centre.lat);
      const s = this.scale();
      const halfLat = this.result.km / 2 / KM_PER_DEG;
      const halfLon = (this.result.km / 2) * lonKm(this.centre.lat);
      const bw = halfLon * 2 * s;
      const bh = halfLat * 2 * s;
      if (bw > 10) {
        ctx.strokeStyle = 'rgba(154, 166, 178, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.strokeRect(c.x - bw / 2, c.y - bh / 2, bw, bh);
        ctx.setLineDash([]);
      }
    }

    // The corners. Each is a teardrop standing on the point it marks, with a
    // ring on the water under it so the exact spot is not hidden by the pin.
    pts.forEach((q, i) => {
      const col = this.bad[i] ? '#e2564f' : '#e6cf9c';
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-11, -12, -13, -24, 0, -30);
      ctx.bezierCurveTo(13, -24, 11, -12, 0, 0);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.beginPath();
      ctx.arc(0, -20, 4.4, 0, Math.PI * 2);
      ctx.fillStyle = '#0b1a26';
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = col;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(q.x, q.y, 7, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    });

    if (this.hint) {
      const trouble = !ok || !!this.badTap;
      this.hint.textContent = this.badTap
        ? 'That is inland. The battlefield has to be laid on water, or on no '
          + 'more than a thousand yards of shore.'
        : (ok
          ? 'Drag the four corners to set the battlefield, or tap the chart to '
            + 'move the whole of it. Scroll or pinch to zoom.'
          : 'A corner is too far inland. Each one has to stand in open water, '
            + 'or on no more than a thousand yards of shore.');
      this.hint.classList.toggle('bad', trouble);
    }
  }

  dispose() {
    const el = this.canvas;
    if (!el) return;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointercancel', this.onUp);
    el.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
  }
}
