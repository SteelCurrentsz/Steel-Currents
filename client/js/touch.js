// On-screen controls for touch devices.
//
// There is one, now: the layer a finger drags on to look around. The engine
// telegraph and the helm that used to live down here are gone -- a captain
// rings up his speed on the conn panel and lays his course off on the chart,
// and both of those are ordinary buttons that work under a thumb already. What
// is left is the thing a mouse gets for free and a touchscreen does not, which
// is somewhere to put a finger that means "turn my head".

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.root = document.getElementById('touch-controls');
    if (!this.root) return;
    this.build();
    this.visible = false;
  }

  build() {
    this.root.innerHTML = '<div class="tc-look" id="tc-look"></div>';
    this.bindLook(this.root.querySelector('#tc-look'));
  }

  bindLook(zone) {
    const active = new Map();
    // Two fingers on the look pad pinch, which is the gesture everybody
    // already has for near and far. It sends the same 'wheel' the mouse does,
    // so nothing downstream has to know a finger did it -- but in fractions of
    // a notch rather than whole ones, so spreading your fingers is a dial you
    // turn and not a ratchet you click. A mouse still sends whole notches and
    // gets exactly what it always did.
    let pinch = 0;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { zone.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (active.size === 2) {
        const [a, b] = [...active.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    zone.addEventListener('pointermove', (e) => {
      const p = active.get(e.pointerId);
      if (!p) return;
      e.preventDefault();
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (active.size >= 2) {
        const [a, b] = [...active.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        // How far apart the fingers are, as notches of a wheel: doubling the
        // spread is about five notches in, which is the rate a mouse gives for
        // the same amount of work.
        if (pinch > 8 && d > 8 && Math.abs(d - pinch) > 1.5) {
          this.input.emit('wheel', Math.log(pinch / d) / Math.log(1.15));
          pinch = d;
        }
        return;
      }
      this.input.addLook(dx, dy);
    });
    const end = (e) => {
      active.delete(e.pointerId);
      if (active.size < 2) pinch = 0;
      try { zone.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    // A pointerup that never arrives -- a finger that leaves the glass during a
    // system gesture, a tab that loses focus mid-drag -- would otherwise leave
    // the pad convinced two fingers are still down, and every drag after it
    // would be read as a pinch that never moves.
    zone.addEventListener('lostpointercapture', end);
    window.addEventListener('blur', () => { active.clear(); pinch = 0; });
  }

  // -- engine telegraph -----------------------------------------------------

  // -- lifecycle ------------------------------------------------------------

  show() {
    if (!this.root) return;
    this.root.hidden = false;
    this.visible = true;
  }

  hide() {
    if (!this.root) return;
    this.root.hidden = true;
    this.visible = false;
  }
}

/** Coarse pointer and no hover is the honest test for "this is a touchscreen". */
export function isTouchDevice() {
  return window.matchMedia?.('(pointer: coarse)').matches
    && navigator.maxTouchPoints > 0;
}
