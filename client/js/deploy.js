// The deployment chart: pick where the battle is fought.
//
// A full-screen chart of the world with a pin on it. The pin can be dragged
// anywhere there is water and nowhere there is not — the test is run against
// the same coastline polygons the chart draws, so it can never disagree with
// what is on the screen. Where the pin lands names the water it is in and how
// much sea room there is, and both go back to the briefing.

import { drawWorld, isWater, waterSquareKm } from './worldmap.js';
import { waterName } from './waters.js';

// The battlefield is fifty thousand yards on a side, which is a shade under
// forty-six kilometres. Anywhere with less sea room than that fights in what
// there is.
export const BATTLE_YARDS = 50000;
export const BATTLE_KM = (BATTLE_YARDS * 0.9144) / 1000;

const MIN_ZOOM = 1;
const MAX_ZOOM = 220;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class DeployMap {
  /** @param onPick called with {lon, lat, name, km} whenever the pin settles. */
  constructor({ onPick, onClose } = {}) {
    this.onPick = onPick;
    this.onClose = onClose;
    this.canvas = document.getElementById('deploy-canvas');
    this.readout = document.getElementById('deploy-readout');
    this.hint = document.getElementById('deploy-hint');
    if (!this.canvas) return;

    // Somewhere with sea room to start, and the pin in the middle of the view.
    this.view = { lon: 0, lat: 10, zoom: 1 };
    this.pin = { lon: -30, lat: 40 };
    this.pinValid = true;
    this.dragging = null;         // 'pin' | 'pan' | null
    this.pointers = new Map();
    this.pinch = 0;
    this.dirty = true;

    this.bind();
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
      const pin = this.toScreen(this.pin.lon, this.pin.lat);
      // A generous grab radius: the pin is the point of this screen, and on a
      // phone a 12-pixel target is not one.
      this.dragging = Math.hypot(p.x - pin.x, p.y - pin.y + 14) < 40 ? 'pin' : 'pan';
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
        this.movePin(this.toWorld(p.x, p.y + 14));
      }
    };

    this.onUp = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = 0;
      // A tap on open water drops the pin there. Hunting for a forty-pixel grab
      // circle is no way to work a chart on a phone, and a tap is a pan that
      // went nowhere, so the two never collide.
      if (this.dragging === 'pan' && this.downAt) {
        const p = local(e);
        if (Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) < 6) {
          this.movePin(this.toWorld(p.x, p.y));
          if (this.pinValid) this.settle();
        }
      }
      if (this.dragging === 'pin') this.settle();
      this.dragging = null;
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

  zoom(factor) {
    const { w, h } = this.size;
    this.zoomAt({ x: w / 2, y: h / 2 }, factor);
  }

  normalise() {
    while (this.view.lon > 180) this.view.lon -= 360;
    while (this.view.lon < -180) this.view.lon += 360;
    // Do not let the chart run off the top or bottom of the world.
    const half = (this.size.h / 2) / this.scale();
    this.view.lat = clamp(this.view.lat, Math.min(0, -90 + half), Math.max(0, 90 - half));
  }

  // -------------------------------------------------------------------- pin --

  /** Move the pin, but only onto water: over land it stays where it was. */
  movePin(at) {
    this.pinValid = isWater(at.lon, at.lat);
    if (this.pinValid) {
      this.pin = at;
      this.result = null;
    }
    this.dirty = true;
  }

  /** Work out where the pin has landed. Only done on release: the sea-room
   *  search runs a few hundred point-in-polygon tests and has no business
   *  running on every pointermove. */
  settle() {
    const km = waterSquareKm(this.pin.lon, this.pin.lat, BATTLE_KM);
    this.result = {
      lon: this.pin.lon,
      lat: this.pin.lat,
      name: waterName(this.pin.lon, this.pin.lat),
      km,
    };
    this.pinValid = km > 0;
    this.onPick?.(this.result);
    this.dirty = true;
    this.paintReadout();
  }

  /** Open the chart on a location that has already been chosen. It comes up at
   *  world scale with the pin in the middle of it, and is zoomed in from there
   *  to place the pin exactly. */
  show(at) {
    if (at) this.pin = { lon: at.lon, lat: at.lat };
    this.view.lon = this.pin.lon;
    this.view.lat = this.pin.lat;
    this.view.zoom = MIN_ZOOM;
    this.normalise();
    if (!this.result) this.settle();
    this.dirty = true;
    this.paintReadout();
    this.paint();
  }

  paintReadout() {
    if (!this.readout) return;
    const r = this.result;
    if (!r) { this.readout.textContent = ''; return; }
    const yards = Math.round((r.km * 1000) / 0.9144 / 100) * 100;
    const ns = r.lat >= 0 ? 'N' : 'S';
    const ew = r.lon >= 0 ? 'E' : 'W';
    this.readout.innerHTML =
      `<b>${r.name}</b><span>${Math.abs(r.lat).toFixed(2)}&deg;${ns} `
      + `${Math.abs(r.lon).toFixed(2)}&deg;${ew}</span>`
      + `<span>${yards.toLocaleString('en-US')} &times; ${yards.toLocaleString('en-US')} yd`
      + `${r.km < BATTLE_KM - 0.05 ? ' &mdash; confined water' : ''}</span>`;
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
      land: '#2b4258',
      coast: '#6e9ab4',
      graticule: true,
      showWaters: true,
      showPlaces: this.view.zoom < 40,
    });

    const ctx = this.canvas.getContext('2d');
    const p = this.toScreen(this.pin.lon, this.pin.lat);
    const s = this.scale();

    // The battlefield: fifty thousand yards square, drawn to scale once it is
    // big enough on the chart to be worth drawing.
    const km = this.result ? this.result.km : BATTLE_KM;
    const halfLat = km / 2 / 111.32;
    const halfLon = halfLat / Math.max(0.08, Math.cos((this.pin.lat * Math.PI) / 180));
    const bw = halfLon * 2 * s;
    const bh = halfLat * 2 * s;
    if (bw > 7) {
      ctx.strokeStyle = this.pinValid ? 'rgba(230, 207, 156, 0.85)' : 'rgba(226, 86, 79, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      ctx.strokeRect(p.x - bw / 2, p.y - bh / 2, bw, bh);
      ctx.setLineDash([]);
      ctx.fillStyle = this.pinValid ? 'rgba(230, 207, 156, 0.08)' : 'rgba(226, 86, 79, 0.10)';
      ctx.fillRect(p.x - bw / 2, p.y - bh / 2, bw, bh);
    }

    // The pin itself: a teardrop standing on the point it marks.
    const col = this.pinValid ? '#e6cf9c' : '#e2564f';
    ctx.save();
    ctx.translate(p.x, p.y);
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

    // A ring on the water under it, so the exact point is not hidden by the pin.
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 7, 3, 0, 0, Math.PI * 2);
    ctx.stroke();

    if (this.hint) {
      this.hint.textContent = this.pinValid
        ? 'Drag the pin, or tap open water, to set the berth. Scroll or pinch to zoom.'
        : 'That is dry land. The pin has to stand in open water.';
      this.hint.classList.toggle('bad', !this.pinValid);
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
