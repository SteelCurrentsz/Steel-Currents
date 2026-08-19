// Keyboard, mouse and pointer-lock handling for the bridge.

import { getSettings } from './settings.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.firing = false;
    this.scoped = false;
    this.locked = false;
    this.enabled = false;
    this.handlers = {};

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      if (e.repeat) { e.preventDefault(); return; }
      const k = e.code;
      this.keys.add(k);
      this.emit('key', k);
      if (['Tab', 'Space', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(k)) e.preventDefault();
    };
    this._onKeyUp = (e) => { this.keys.delete(e.code); this.emit('keyup', e.code); };
    this._onMove = (e) => {
      if (!this.enabled) return;
      const s = getSettings().sensitivity;
      if (this.locked) {
        this.mouseDX += e.movementX * 0.0016 * s;
        this.mouseDY += e.movementY * 0.0016 * s;
      } else if (e.buttons & 1 || e.buttons & 2) {
        this.mouseDX += e.movementX * 0.0016 * s;
        this.mouseDY += e.movementY * 0.0016 * s;
      }
    };
    this._onDown = (e) => {
      if (!this.enabled) return;
      if (e.button === 0) { this.firing = true; this.emit('fire'); }
      if (e.button === 2) { this.scoped = true; this.emit('scope', true); }
      if (!this.locked && e.button === 0) this.requestLock();
    };
    this._onUp = (e) => {
      if (e.button === 0) this.firing = false;
      if (e.button === 2) { this.scoped = false; this.emit('scope', false); }
    };
    this._onWheel = (e) => { if (this.enabled) this.emit('wheel', Math.sign(e.deltaY)); };
    this._onContext = (e) => { if (this.enabled) e.preventDefault(); };
    this._onLockChange = () => { this.locked = document.pointerLockElement === this.canvas; };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMove);
    window.addEventListener('mousedown', this._onDown);
    window.addEventListener('mouseup', this._onUp);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    window.addEventListener('contextmenu', this._onContext);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  requestLock() {
    if (this.canvas.requestPointerLock) {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { /* user gesture required; retry on next click */ });
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  on(type, fn) { (this.handlers[type] ||= []).push(fn); }
  emit(type, arg) { (this.handlers[type] || []).forEach((f) => f(arg)); }

  down(code) { return this.keys.has(code); }

  /** Consume accumulated mouse movement for this frame. */
  takeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0; this.mouseDY = 0;
    return d;
  }

  reset() { this.keys.clear(); this.mouseDX = this.mouseDY = 0; this.firing = false; this.scoped = false; }
}
