// The two surfaces every ship in the game is made of.
//
// A warship is steel plate and teak planking, and at any range closer than a
// mile the difference between them is most of what you are looking at: the
// side of a hull is a grid of butt-jointed plates with a weld seam every few
// metres, and a deck is two hundred parallel planks with a caulked seam
// between each pair. Flat colour gets neither, and a hull painted one flat
// grey reads as a shape rather than as a thing that was built.
//
// Both are drawn here rather than loaded, for the same reason everything else
// in this renderer is: the whole game is one file that has to work offline,
// and a pair of 512-pixel canvases costs a few milliseconds at start-up and
// nothing thereafter.
//
// They are luminance maps, averaging one, so they multiply a ship's own colour
// rather than replacing it. Every ship keeps her own paint -- the Hipper stays
// Baltic grey, the Iowa stays Measure 22 -- and gains the surface.

import * as THREE from '../../../vendor/three.module.js';

/** How many metres of ship one tile of each texture covers. */
export const STEEL_TILE = 12.0;
export const WOOD_TILE = 3.2;

const SIZE = 512;

/** A canvas to draw a tile on, or null where there is no DOM to draw it in. */
function tile() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  return c;
}

/**
 * A repeatable texture from a drawn tile.
 *
 * The weld gives every ship UVs in metres, so the repeat is one tile over
 * `metres` of ship and the same texture sits at the same size on a destroyer
 * and on a battleship.
 */
function wrap(canvas, metres) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / metres, 1 / metres);
  t.anisotropy = 4;
  return t;
}

/**
 * Steel plating.
 *
 * Rolled plate came in strakes about two metres deep and six long, so that is
 * the grid: courses two metres deep, butts staggered course by course the way
 * plating is actually laid, a line of rivets down each lap, and enough noise
 * over the whole of it that a flat-lit slab of hull does not read as a single
 * colour.
 */
function drawSteel(x) {
  const g = x.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, SIZE, SIZE);

  // Six courses of plate two metres deep, two plates of six metres to a
  // course: a strake of rolled plate, near enough, at the tile size above.
  const courses = 6;
  const plates = 2;
  const h = SIZE / courses;
  const w = SIZE / plates;

  // Plate-to-plate tone: no two plates take the light quite alike, and the
  // difference is small -- a plate that stands out is a repair, not a hull.
  for (let r = 0; r < courses; r++) {
    // Butts staggered half a plate on alternate courses, as they are laid.
    const shift = (r % 2) * (w / 2);
    for (let c = -1; c <= plates; c++) {
      const v = 126 + Math.round(Math.random() * 7);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(c * w + shift, r * h, w, h);
    }
  }

  // The seams. Two pixels of shadow with a pixel of light under it: a lap
  // joint reads as a step, and a hairline is the first thing a mipmap eats.
  const seam = (x0, y0, x1, y1) => {
    g.strokeStyle = 'rgba(52,52,52,0.65)';
    g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = 'rgba(215,215,215,0.30)';
    g.lineWidth = 1.2;
    const n = y0 === y1 ? [0, 2] : [2, 0];
    g.beginPath(); g.moveTo(x0 + n[0], y0 + n[1]); g.lineTo(x1 + n[0], y1 + n[1]); g.stroke();
  };
  for (let r = 0; r <= courses; r++) {
    const y = r * h;
    seam(0, y, SIZE, y);
    // Rivets down the lap.
    g.fillStyle = 'rgba(64,64,64,0.55)';
    for (let px = 5; px < SIZE; px += 13) g.fillRect(px, y + 4, 2.4, 2.4);
  }
  for (let r = 0; r < courses; r++) {
    const shift = (r % 2) * (w / 2);
    for (let c = 0; c <= plates; c++) {
      const px = c * w + shift;
      seam(px, r * h, px, (r + 1) * h);
    }
  }

  // Weathering: streaks running down from the seams, the way a wet steel side
  // stains, and a fine grain over everything.
  for (let i = 0; i < 240; i++) {
    const px = Math.random() * SIZE;
    const py = Math.floor(Math.random() * courses) * h;
    const len = 8 + Math.random() * 46;
    g.fillStyle = `rgba(90,90,90,${0.03 + Math.random() * 0.05})`;
    g.fillRect(px, py, 1 + Math.random() * 2, len);
  }
  const img = g.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return x;
}

/**
 * Teak planking.
 *
 * Planks run fore and aft, so they run up the tile: the U axis crosses them
 * and the V axis runs along them. Sixteen to a tile, a dark caulked seam
 * between each pair, butt joints staggered down the run, and grain along each
 * plank. The tone wanders plank to plank because a deck is laid from whatever
 * came off the pile.
 */
function drawWood(x) {
  const g = x.getContext('2d');
  const planks = 16;
  const w = SIZE / planks;
  for (let p = 0; p < planks; p++) {
    const v = 122 + ((p * 5) % 4) * 6 + Math.random() * 6;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(p * w, 0, w, SIZE);
    // The caulked seam: pitch, dark, and the reason a deck reads as planked.
    g.fillStyle = 'rgba(48,48,48,0.75)';
    g.fillRect(p * w, 0, 1.6, SIZE);
    // Butt joints, staggered so no two fall together.
    g.fillStyle = 'rgba(70,70,70,0.5)';
    for (let b = 0; b < 3; b++) {
      const py = ((p * 97 + b * 171) % SIZE);
      g.fillRect(p * w, py, w, 1.4);
    }
    // Grain along the plank.
    for (let i = 0; i < 26; i++) {
      const px = p * w + 2 + Math.random() * (w - 3);
      const py = Math.random() * SIZE;
      g.fillStyle = `rgba(${90 + Math.random() * 60},${88},${80},${0.05 + Math.random() * 0.08})`;
      g.fillRect(px, py, 1, 12 + Math.random() * 60);
    }
  }
  const img = g.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return x;
}

let steel = null;
let wood = null;

/** The steel plating map, drawn once. */
export function steelMap() {
  if (steel === undefined) return null;
  if (!steel) {
    const c = tile();
    if (!c) { steel = undefined; return null; }
    steel = wrap(drawSteel(c), STEEL_TILE);
  }
  return steel;
}

/** The planking map, drawn once. */
export function woodMap() {
  if (wood === undefined) return null;
  if (!wood) {
    const c = tile();
    if (!c) { wood = undefined; return null; }
    wood = wrap(drawWood(c), WOOD_TILE);
  }
  return wood;
}

/**
 * The colours that are decks.
 *
 * Every ship's palette is written as flat colours, and each of them caches one
 * material per colour, so which surface a material is can be read straight off
 * the colour it was made with. These are the planked walking surfaces across
 * all six models -- weather decks, quarterdecks, the carrier's flight deck and
 * the Iowa's teak. Everything else on a warship is steel.
 */
const PLANKED = new Set([
  0x6f767d,   // ships.js       weather deck
  0x676d73,   // ships.js       flight deck
  0x8a7a5f,   // ships.js       planking
  0x49535f,   // Fletcher, Cleveland   deck blue over steel
  0x655f52,   // Hipper         planked weather deck
  0x7d7362,   // Enterprise     flight deck
  0x6d6350,   // Iowa           teak
]);

/**
 * Give every surface of a ship the material it is made of.
 *
 * Called after the model has been welded, so it walks a handful of meshes
 * rather than a few hundred. A material is shared between every ship that uses
 * it, so each one is only dressed once however many ships are built.
 */
export function dressShip(root) {
  const st = steelMap();
  const wd = woodMap();
  if (!st || !wd) return;                 // no canvas: flat colours, as before
  root.traverse((o) => {
    const mats = o.isMesh ? [].concat(o.material) : [];
    for (const m of mats) {
      if (!m || m.map || m.isLineBasicMaterial) continue;
      // Anything see-through is glass, a propeller disc or a wake: leave it.
      if (m.transparent) continue;
      const planked = PLANKED.has(m.color ? m.color.getHex() : -1);
      m.map = planked ? wd : st;
      m.needsUpdate = true;
    }
  });
}
