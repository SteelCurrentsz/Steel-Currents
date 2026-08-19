// On-screen controls for touch devices.
//
// Everything here feeds the same Input object the keyboard and mouse drive, so
// the bridge downstream — camera, gunnery, prediction — never learns which one
// a captain is using. The engine telegraph emits the same KeyW/KeyS the
// keyboard does, right down to the detent click; the helm drives the wheel
// directly, because a wheel that holds its angle is what the ship actually has.

const ACTIONS = [
  { code: 'Digit3', label: 'TORP', title: 'Launch torpedoes' },
  { code: 'Digit4', label: 'AIR', title: 'Call an air strike' },
  { code: 'KeyR', label: 'RPR', title: 'Damage control' },
  { code: 'KeyT', label: 'SMK', title: 'Make smoke' },
  { code: 'KeyC', label: 'CAM', title: 'Change camera' },
  { code: 'KeyM', label: 'MAP', title: 'Enlarge the map' },
];

const NOTCH_LABELS = ['ASTERN', 'STOP', 'SLOW', 'HALF', 'FULL', 'FLANK'];

export class TouchControls {
  constructor(input, { minNotch = 0, maxNotch = 5 } = {}) {
    this.input = input;
    this.minNotch = minNotch;
    this.maxNotch = maxNotch;
    this.notch = 1;              // mirrors the ship's telegraph, starting at stop
    this.root = document.getElementById('touch-controls');
    if (!this.root) return;
    this.build();
    this.visible = false;
  }

  build() {
    this.root.innerHTML = `
      <div class="tc-look" id="tc-look"></div>

      <div class="tc-engine" id="tc-engine">
        <div class="tc-cap">ENGINE</div>
        <div class="tc-lever" id="tc-lever">
          <div class="tc-detents" id="tc-detents"></div>
          <div class="tc-knob" id="tc-knob"></div>
        </div>
        <div class="tc-read" id="tc-notch-read">STOP</div>
      </div>

      <div class="tc-helm" id="tc-helm">
        <div class="tc-cap">HELM</div>
        <div class="tc-wheel" id="tc-wheel">
          <div class="tc-wheel-mid"></div>
          <div class="tc-wheel-grip" id="tc-wheel-grip"></div>
        </div>
        <button class="tc-mid-btn" id="tc-amidships" type="button">AMIDSHIPS</button>
      </div>

      <div class="tc-right">
        <div class="tc-ammo">
          <button class="tc-ammo-btn on" data-code="Digit1" type="button">AP</button>
          <button class="tc-ammo-btn" data-code="Digit2" type="button">HE</button>
        </div>
        <div class="tc-actions">
          ${ACTIONS.map((a) => `<button class="tc-btn" data-code="${a.code}" title="${a.title}" type="button">${a.label}</button>`).join('')}
        </div>
        <div class="tc-guns">
          <button class="tc-scope" id="tc-scope" type="button">SCOPE</button>
          <button class="tc-fire" id="tc-fire" type="button"><span>FIRE</span></button>
        </div>
      </div>

      <button class="tc-scores" id="tc-scores" type="button">SCORES</button>
    `;

    const detents = this.root.querySelector('#tc-detents');
    for (let i = this.maxNotch; i >= this.minNotch; i--) {
      const d = document.createElement('i');
      if (i === 0) d.className = 'astern';
      detents.appendChild(d);
    }

    this.knob = this.root.querySelector('#tc-knob');
    this.notchRead = this.root.querySelector('#tc-notch-read');
    this.grip = this.root.querySelector('#tc-wheel-grip');

    this.bindLook(this.root.querySelector('#tc-look'));
    this.bindLever(this.root.querySelector('#tc-lever'));
    this.bindWheel(this.root.querySelector('#tc-wheel'));
    this.bindFire(this.root.querySelector('#tc-fire'));

    this.tap(this.root.querySelector('#tc-amidships'), () => {
      this.input.axis.rudder = 0;
      this.setGrip(0);
    });

    for (const btn of this.root.querySelectorAll('.tc-btn')) {
      this.tap(btn, () => this.input.emit('key', btn.dataset.code));
    }
    for (const btn of this.root.querySelectorAll('.tc-ammo-btn')) {
      this.tap(btn, () => {
        for (const o of this.root.querySelectorAll('.tc-ammo-btn')) o.classList.toggle('on', o === btn);
        this.input.emit('key', btn.dataset.code);
      });
    }
    this.tap(this.root.querySelector('#tc-scores'), () => this.input.emit('key', 'Tab'));

    const scope = this.root.querySelector('#tc-scope');
    this.tap(scope, () => {
      const on = !scope.classList.contains('on');
      scope.classList.toggle('on', on);
      this.input.emit('scope', on);
    });

    // Adopt the HUD's live readouts rather than duplicating them: the speed and
    // heading elements keep being updated by the HUD wherever they sit.
    const speed = document.getElementById('speed-readout');
    if (speed) this.root.querySelector('#tc-engine').appendChild(speed);
    const heading = document.getElementById('heading-readout');
    if (heading) this.root.querySelector('#tc-helm').appendChild(heading);

    this.setNotch(1);
  }

  /** A button that fires on press, without waiting for the 300ms click. */
  tap(el, fn) {
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('down');
      fn();
    });
    const clear = () => el.classList.remove('down');
    el.addEventListener('pointerup', clear);
    el.addEventListener('pointercancel', clear);
    el.addEventListener('pointerleave', clear);
  }

  // -- aiming ---------------------------------------------------------------

  bindLook(zone) {
    const active = new Map();
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { zone.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    zone.addEventListener('pointermove', (e) => {
      const p = active.get(e.pointerId);
      if (!p) return;
      e.preventDefault();
      this.input.addLook(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX; p.y = e.clientY;
    });
    const end = (e) => active.delete(e.pointerId);
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  // -- engine telegraph -----------------------------------------------------

  setNotch(n) {
    this.notch = Math.max(this.minNotch, Math.min(this.maxNotch, n));
    const span = this.maxNotch - this.minNotch;
    const frac = (this.notch - this.minNotch) / span;
    this.knob.style.bottom = `calc(${frac * 100}% - ${frac * 26}px)`;
    this.knob.classList.toggle('astern', this.notch === 0);
    this.notchRead.textContent = NOTCH_LABELS[this.notch] || `${this.notch}`;
  }

  bindLever(lever) {
    let dragging = false;
    const notchAt = (clientY) => {
      const r = lever.getBoundingClientRect();
      const frac = 1 - (clientY - r.top) / r.height;
      return Math.round(this.minNotch + frac * (this.maxNotch - this.minNotch));
    };
    // Step through the detents rather than jumping, so the ship's telegraph and
    // this lever cannot drift apart and every step gets its click.
    const goTo = (target) => {
      const want = Math.max(this.minNotch, Math.min(this.maxNotch, target));
      while (this.notch < want) { this.input.emit('key', 'KeyW'); this.setNotch(this.notch + 1); }
      while (this.notch > want) { this.input.emit('key', 'KeyS'); this.setNotch(this.notch - 1); }
    };
    lever.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      dragging = true;
      try { lever.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      goTo(notchAt(e.clientY));
    });
    lever.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      e.preventDefault(); e.stopPropagation();
      goTo(notchAt(e.clientY));
    });
    const end = () => { dragging = false; };
    lever.addEventListener('pointerup', end);
    lever.addEventListener('pointercancel', end);
  }

  // -- helm -----------------------------------------------------------------

  setGrip(v) {
    this.grip.style.left = `${50 + v * 42}%`;
    this.grip.classList.toggle('hard', Math.abs(v) > 0.92);
  }

  bindWheel(wheel) {
    let dragging = false;
    const at = (clientX) => {
      const r = wheel.getBoundingClientRect();
      const v = ((clientX - r.left) / r.width) * 2 - 1;
      return Math.max(-1, Math.min(1, v));
    };
    const set = (clientX) => {
      const v = at(clientX);
      this.input.axis.rudder = v;
      this.setGrip(v);
    };
    wheel.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      dragging = true;
      try { wheel.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      set(e.clientX);
    });
    wheel.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      e.preventDefault(); e.stopPropagation();
      set(e.clientX);
    });
    const end = () => { dragging = false; };
    wheel.addEventListener('pointerup', end);
    wheel.addEventListener('pointercancel', end);
  }

  // -- gunnery --------------------------------------------------------------

  bindFire(btn) {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { btn.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      btn.classList.add('down');
      this.input.firing = true;
      this.input.emit('fire');
    });
    const end = () => {
      btn.classList.remove('down');
      this.input.firing = false;
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
  }

  // -- lifecycle ------------------------------------------------------------

  show() {
    if (!this.root) return;
    this.root.hidden = false;
    this.visible = true;
    this.setNotch(1);
    this.setGrip(0);
    this.input.axis.rudder = 0;
  }

  hide() {
    if (!this.root) return;
    this.root.hidden = true;
    this.visible = false;
    this.input.firing = false;
    this.input.axis.rudder = null;
  }
}

/** Coarse pointer and no hover is the honest test for "this is a touchscreen". */
export function isTouchDevice() {
  return window.matchMedia?.('(pointer: coarse)').matches
    && navigator.maxTouchPoints > 0;
}
