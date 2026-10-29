// Water on the glass.
//
// The camera in this game is somebody standing on a ship: on her bridge wing,
// or a boat's length astern of her looking along her. Anybody who has stood
// there in a blow knows what is between them and the fight -- spray off the
// bow, rain driving across, and when a heavy shell lands close aboard, a
// sheet of the sea coming down over everything. A view that stays bone dry
// while a sixteen-inch column collapses fifty metres away reads as a model
// on a table.
//
// So the view has glass in front of it, and water on the glass. Drops are
// put on it by whatever throws water at the eye -- a splash close aboard, the
// rain, coming up out of the sea -- and each one sits, beads, and runs: a big
// drop slides down and leaves a trail of small ones behind it, a small one
// just dries. Nothing is put on it while the chart is up or the eye is under
// water.
//
// It is a 2D canvas over the picture rather than a pass in the renderer:
// it costs nothing at all while the glass is dry, a few hundred arcs while it
// is wet, and it cannot get in the way of anything the scene draws.

/** At most this many drops on the glass, however hard it is raining. */
const MAX_DROPS = 260;
/** Drawn at this fraction of the screen's resolution: they are soft anyway. */
const SCALE = 0.5;

export class Lens {
  /** `parent` is the battle screen; the glass goes under its HUD. */
  constructor(parent) {
    this.drops = [];
    this.rainRate = 0;
    this.rainAcc = 0;
    this.wet = false;
    this.last = 0;
    this.el = null;
    if (typeof document === 'undefined' || !parent) return;
    const c = document.createElement('canvas');
    c.className = 'lens';
    c.setAttribute('aria-hidden', 'true');
    parent.insertBefore(c, parent.firstChild);
    this.el = c;
    this.g = c.getContext('2d');
    this.resize();
  }

  resize() {
    if (!this.el) return;
    const w = Math.max(1, Math.round(this.el.clientWidth * SCALE)) || Math.round(innerWidth * SCALE);
    const h = Math.max(1, Math.round(this.el.clientHeight * SCALE)) || Math.round(innerHeight * SCALE);
    if (this.el.width !== w || this.el.height !== h) { this.el.width = w; this.el.height = h; }
  }

  /** One drop, at a place on the glass in 0..1 of its width and height. */
  drop(u, v, size = 1) {
    if (!this.el) return;
    if (this.drops.length >= MAX_DROPS) this.drops.shift();
    const H = this.el.height;
    this.drops.push({
      x: u * this.el.width,
      y: v * H,
      // Radius in pixels of the glass, scaled to its height so a phone and a
      // monitor wear the same water.
      r: (0.005 + Math.random() * Math.random() * 0.018) * H * size,
      age: 0,
      life: 2.2 + Math.random() * 3.5,
      vy: 0,
      wob: Math.random() * 6.28,
      trail: 0,
    });
  }

  /**
   * Water thrown at the glass: `amount` from nothing to one is how much of the
   * glass it reaches, `from` the side it came from (-1 left, 1 right, 0 all
   * over), so a splash on the beam wets that side of the view first.
   */
  spray(amount, from = 0) {
    if (!this.el || amount <= 0.02) return;
    const n = Math.round(8 + amount * 90);
    for (let i = 0; i < n; i++) {
      let u = Math.random();
      if (from) u = from > 0 ? 1 - Math.pow(Math.random(), 1.6) * (0.4 + amount * 0.6)
        : Math.pow(Math.random(), 1.6) * (0.4 + amount * 0.6);
      // A heavy sheet throws bigger water.
      this.drop(u, Math.random() * 0.95, 0.7 + amount * 0.9 * Math.random());
    }
  }

  /** Coming up out of the sea: the whole glass streaming. */
  sheet() {
    if (!this.el) return;
    for (let i = 0; i < 140; i++) this.drop(Math.random(), Math.random(), 0.8 + Math.random() * 0.9);
  }

  /** Drops a second landing on the glass from the weather. */
  setRain(rate) { this.rainRate = Math.max(0, rate || 0); }

  /**
   * A frame. `on` is false while the glass should be dry and out of the way:
   * the chart, the eye under water, a man's own eyes.
   */
  update(on) {
    if (!this.el) return;
    const now = performance.now() / 1000;
    const dt = this.last ? Math.min(0.1, now - this.last) : 0;
    this.last = now;
    if (!on) {
      if (this.wet) { this.drops.length = 0; this.g.clearRect(0, 0, this.el.width, this.el.height); this.wet = false; }
      this.el.style.visibility = 'hidden';
      return;
    }
    this.el.style.visibility = '';
    if (this.rainRate > 0) {
      this.rainAcc += this.rainRate * dt;
      while (this.rainAcc >= 1) {
        this.rainAcc -= 1;
        this.drop(Math.random(), Math.random(), 0.45 + Math.random() * 0.6);
      }
    }
    if (!this.drops.length) {
      if (this.wet) { this.g.clearRect(0, 0, this.el.width, this.el.height); this.wet = false; }
      return;
    }
    this.wet = true;
    this.step(dt);
    this.draw();
  }

  step(dt) {
    const H = this.el.height;
    const big = 0.011 * H;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      if (d.age >= d.life || d.y - d.r > H) { this.drops.splice(i, 1); continue; }
      // A drop heavy enough to overcome the glass runs, faster as it goes,
      // wandering a little side to side as it finds its way down.
      if (d.r > big) {
        d.vy = Math.min(H * 0.6, d.vy + H * 0.5 * dt);
        d.y += d.vy * dt;
        d.wob += dt * 3;
        d.x += Math.sin(d.wob) * d.r * 0.6 * dt;
        // And sheds a bead behind it every so far, losing a little of itself.
        d.trail += d.vy * dt;
        if (d.trail > d.r * 2.2 && this.drops.length < MAX_DROPS) {
          d.trail = 0;
          d.r *= 0.97;
          this.drops.push({
            x: d.x + (Math.random() - 0.5) * d.r * 0.5, y: d.y - d.r * 1.4,
            r: d.r * (0.22 + Math.random() * 0.2), age: 0,
            life: 0.8 + Math.random() * 1.6, vy: 0, wob: 0, trail: 0,
          });
        }
      }
    }
  }

  draw() {
    const g = this.g;
    g.clearRect(0, 0, this.el.width, this.el.height);
    for (const d of this.drops) {
      // In, sit, dry: a drop arrives at once and goes slowly.
      const k = Math.min(1, d.age * 12) * Math.min(1, (d.life - d.age) / 1.2);
      if (k <= 0) continue;
      const r = d.r;
      // A drop on glass is a little lens of its own: it turns the world over,
      // so the sky in it is at the bottom and the sea at the top. Bright below,
      // a dark rim where the edge bends the light away, and the hard glint of
      // the sky on its upper shoulder.
      const body = g.createRadialGradient(d.x, d.y + r * 0.35, r * 0.1, d.x, d.y, r);
      body.addColorStop(0, `rgba(225,235,242,${0.20 * k})`);
      body.addColorStop(0.65, `rgba(170,185,195,${0.10 * k})`);
      body.addColorStop(0.9, `rgba(20,26,32,${0.30 * k})`);
      body.addColorStop(1, 'rgba(20,26,32,0)');
      g.fillStyle = body;
      g.beginPath();
      // Running drops are drawn longer than they are wide.
      const stretch = d.vy > 0 ? 1 + Math.min(0.6, d.vy / (this.el.height * 0.8)) : 1;
      g.ellipse(d.x, d.y, r, r * stretch, 0, 0, Math.PI * 2);
      g.fill();
      if (r > 1.6) {
        g.fillStyle = `rgba(255,255,255,${0.55 * k})`;
        g.beginPath();
        g.ellipse(d.x - r * 0.32, d.y - r * 0.38, r * 0.22, r * 0.14, -0.6, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  dispose() {
    this.el?.remove();
    this.el = null;
    this.drops.length = 0;
  }
}
