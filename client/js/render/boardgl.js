// One graphics context for every little board in the battle.
//
// The damage board, the arsenal's board, the targeting panel's picture of her
// and an aeroplane's damage board each used to carry a WebGL renderer of its
// own: four contexts beside the battle's, each with its own antialiased
// drawing buffer at the screen's full pixel density. A phone or a tablet
// allows a page only so much of that, and past it the browser takes contexts
// back -- the oldest first, which is the battle's own. On an iPad that was a
// battle gone black under the HUD in the middle of an action, with the boards
// left as flat magenta squares.
//
// So there is one renderer for all of them, on a canvas nobody sees. Each
// board draws its scene into a corner of it and the picture is copied straight
// out onto the board's own canvas, which is a plain 2D canvas. To the boards
// it looks like the renderer they had: the same few calls, the same canvas
// sizes. The shared context is let go when the last board is.

import * as THREE from '../../../vendor/three.module.js';

let shared = null;
let users = 0;

function context() {
  if (shared && !shared.getContext().isContextLost()) return shared;
  if (shared) { try { shared.dispose(); } catch { /* gone */ } }
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!canvas) return null;
  try {
    shared = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    shared.setPixelRatio(1);
    shared.outputColorSpace = THREE.SRGBColorSpace;
    shared.autoClear = true;
  } catch {
    shared = null;
  }
  return shared;
}

const SIZE = new THREE.Vector2();
const CLEAR = new THREE.Color();

export class BoardRenderer {
  constructor(canvas) {
    this.domElement = canvas;
    this.ctx = canvas.getContext('2d');
    this.ratio = 1;
    this.clearColor = new THREE.Color(0x000000);
    this.clearAlpha = 0;
    this.outputColorSpace = THREE.SRGBColorSpace;
    this.gone = false;
    users++;
  }

  setClearColor(color, alpha = 1) { this.clearColor.set(color); this.clearAlpha = alpha; }

  setPixelRatio(r) { this.ratio = r || 1; }

  getPixelRatio() { return this.ratio; }

  setSize(w, h, style = true) {
    const c = this.domElement;
    c.width = Math.max(1, Math.round(w * this.ratio));
    c.height = Math.max(1, Math.round(h * this.ratio));
    if (style) { c.style.width = `${w}px`; c.style.height = `${h}px`; }
  }

  render(scene, camera) {
    if (this.gone || !this.ctx) return;
    const r = context();
    if (!r) return;
    const W = this.domElement.width, H = this.domElement.height;
    if (!W || !H) return;
    // Grown to the biggest board there is, never shrunk: a canvas resized
    // every frame, between two boards of different sizes, is a fresh
    // drawing buffer every frame.
    r.getSize(SIZE);
    if (SIZE.x < W || SIZE.y < H) r.setSize(Math.max(W, SIZE.x), Math.max(H, SIZE.y), false);
    r.getSize(SIZE);
    // Into its top-left corner (the GL viewport counts up from the bottom),
    // which is where a 2D copy counts from.
    const y = SIZE.y - H;
    r.outputColorSpace = this.outputColorSpace;
    r.setViewport(0, y, W, H);
    r.setScissor(0, y, W, H);
    r.setScissorTest(true);
    CLEAR.copy(this.clearColor);
    r.setClearColor(CLEAR, this.clearAlpha);
    r.render(scene, camera);
    r.setScissorTest(false);
    // Copied out in the same task it was drawn in, while the drawing buffer
    // is still there to be read.
    this.ctx.clearRect(0, 0, W, H);
    this.ctx.drawImage(r.domElement, 0, 0, W, H, 0, 0, W, H);
  }

  dispose() {
    if (this.gone) return;
    this.gone = true;
    users = Math.max(0, users - 1);
    if (users === 0 && shared) {
      try { shared.dispose(); shared.forceContextLoss(); } catch { /* gone */ }
      shared = null;
    }
  }

  /** There is no context of its own to give back; see dispose. */
  forceContextLoss() {}
}

/**
 * Let the shared context go now, whatever is using it: the battle's own has
 * just been taken back, and the browser wants memory before it will give it
 * back. The boards take a fresh one the next time they draw.
 */
export function letGoBoards() {
  if (!shared) return;
  try { shared.dispose(); shared.forceContextLoss(); } catch { /* gone */ }
  shared = null;
}
