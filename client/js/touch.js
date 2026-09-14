// On-screen controls for touch devices.
//
// There is one, now: the layer a finger drags on to look around. The engine
// telegraph and the helm that used to live down here are gone -- a captain
// rings up his speed on the conn panel and lays his course off on the chart,
// and both of those are ordinary buttons that work under a thumb already. What
// is left is the thing a mouse gets for free and a touchscreen does not, which
// is somewhere to put a finger that means "turn my head".

/**
 * What a two-fingered gesture is: a zoom, a walk, or not yet enough to say.
 *
 * Pulled out where it can be looked at on its own, because getting it wrong is
 * not a cosmetic matter. It used to be decided fresh on every pointer event
 * from the spread of that one event -- and a pinch is not a smooth spread.
 * There are frames at the start of it, at the turn, and whenever one finger
 * pauses, where the gap between the fingers barely changes. Every one of those
 * came out as a walk. So zooming while watching somebody else's ship walked
 * the camera off her a few pixels at a time and dropped the viewer into the
 * free camera, without anybody having asked for anything but a closer look.
 *
 * `was` is what the gesture has already been decided to be, and it wins: once
 * two fingers are pinching they go on pinching until they come off the glass.
 */
export function twoFingerGesture(was, spread, travel) {
  if (was) return was;
  if (Math.abs(spread) > 2.5) return 'zoom';
  if (travel > 2.5) return 'walk';
  return null;
}

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
    // What this two-fingered gesture turned out to be, once it had moved far
    // enough to tell: 'zoom' or 'walk'. Decided once and held for the life of
    // the gesture -- see below for why deciding it fresh on every move event
    // is not good enough.
    let twoUp = null;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { zone.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (active.size === 2) {
        const [a, b] = [...active.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
        twoUp = null;
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
        // Two fingers do two things and they are told apart by what the
        // fingers are doing to each other. Spreading or closing is a pinch and
        // works the zoom; moving together, with the gap between them holding
        // steady, walks the camera over the sea.
        //
        // Decided ONCE, and then held. It used to be decided afresh on every
        // move event, and a pinch is not a smooth spread: there are frames at
        // the start of it, at the turn, and whenever one finger pauses, where
        // the gap barely changes. Every one of those was read as a walk -- so
        // zooming while watching somebody else's ship walked the camera off
        // her and dropped the viewer into the free camera, a few pixels at a
        // time, without anybody having asked for it.
        const spread = d - pinch;
        twoUp = twoFingerGesture(twoUp, spread, Math.hypot(dx, dy));
        if (twoUp === 'zoom') {
          if (pinch > 8 && d > 8 && Math.abs(spread) > 0.5) {
            this.input.emit('wheel', Math.log(pinch / d) / Math.log(1.15));
            pinch = d;
          }
        } else if (twoUp === 'walk') {
          // Halved, because both fingers report the same movement and this is
          // called once for each of them.
          this.input.addPan(dx * 0.5, dy * 0.5);
        }
        return;
      }
      this.input.addLook(dx, dy);
    });
    const end = (e) => {
      active.delete(e.pointerId);
      if (active.size < 2) { pinch = 0; twoUp = null; }
      try { zone.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    // A pointerup that never arrives -- a finger that leaves the glass during a
    // system gesture, a tab that loses focus mid-drag -- would otherwise leave
    // the pad convinced two fingers are still down, and every drag after it
    // would be read as a pinch that never moves.
    zone.addEventListener('lostpointercapture', end);
    window.addEventListener('blur', () => { active.clear(); pinch = 0; twoUp = null; });
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
