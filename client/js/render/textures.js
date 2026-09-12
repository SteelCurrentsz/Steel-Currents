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
export const STEEL_TILE = 16.0;
export const WOOD_TILE = 3.2;

const SIZE = 512;
/** The plating map is drawn larger: it is the one you stand next to. */
const STEEL_SIZE = 1024;

/** A canvas to draw a tile on, or null where there is no DOM to draw it in. */
function tile(size = SIZE) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
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
  const N = STEEL_SIZE;
  const g = x.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, N, N);

  // Eight courses of plate two metres deep, two plates of eight metres to a
  // course: a strake of rolled plate, near enough, at the tile size above.
  const courses = 8;
  const plates = 2;
  const h = N / courses;
  const w = N / plates;

  // Plate-to-plate tone: no two plates take the light quite alike, and the
  // difference is small -- a plate that stands out is a repair, not a hull.
  for (let r = 0; r < courses; r++) {
    // Butts staggered half a plate on alternate courses, as they are laid.
    const shift = (r % 2) * (w / 2);
    for (let c = -1; c <= plates; c++) {
      const v = 126 + Math.round(Math.random() * 8);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(c * w + shift, r * h, w, h);
    }
  }

  // Panting and set-up between the frames.
  //
  // The thing that gives a real hull away at any distance is that the plating
  // is not flat: it is pulled in a little between every frame and stands
  // slightly proud over each one, so a ship's side in low sun is a washboard
  // of very soft vertical bands. Frame spacing on a warship is about a metre,
  // which at this tile is sixteen bands across.
  for (let i = 0; i < 16; i++) {
    const px = (i * N) / 16;
    const grad = g.createLinearGradient(px, 0, px + N / 16, 0);
    grad.addColorStop(0, 'rgba(70,70,70,0.13)');
    grad.addColorStop(0.5, 'rgba(215,215,215,0.10)');
    grad.addColorStop(1, 'rgba(70,70,70,0.13)');
    g.fillStyle = grad;
    g.fillRect(px, 0, N / 16, N);
    // And the frame itself, which shows through as a hard line.
    g.fillStyle = 'rgba(96,96,96,0.16)';
    g.fillRect(px, 0, 1.4, N);
  }

  // The seams. Two pixels of shadow with a pixel of light under it: a lap
  // joint reads as a step, and a hairline is the first thing a mipmap eats.
  const seam = (x0, y0, x1, y1) => {
    g.strokeStyle = 'rgba(52,52,52,0.62)';
    g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = 'rgba(218,218,218,0.32)';
    g.lineWidth = 1.3;
    const n = y0 === y1 ? [0, 2.2] : [2.2, 0];
    g.beginPath(); g.moveTo(x0 + n[0], y0 + n[1]); g.lineTo(x1 + n[0], y1 + n[1]); g.stroke();
  };
  for (let r = 0; r <= courses; r++) {
    const y = r * h;
    seam(0, y, N, y);
    // The weld bead along the seam: a wandering raised line, brighter than
    // the plate, which is what a butt weld actually looks like once it has
    // been ground back and painted over.
    g.strokeStyle = 'rgba(200,200,200,0.22)';
    g.lineWidth = 2.0;
    g.beginPath();
    g.moveTo(0, y + 1);
    for (let px = 0; px <= N; px += 16) g.lineTo(px, y + 1 + (Math.random() - 0.5) * 1.6);
    g.stroke();
    // Rivets down the lap, where she is riveted rather than welded.
    g.fillStyle = 'rgba(64,64,64,0.50)';
    for (let px = 6; px < N; px += 15) g.fillRect(px, y + 5, 2.6, 2.6);
    g.fillStyle = 'rgba(206,206,206,0.26)';
    for (let px = 6; px < N; px += 15) g.fillRect(px, y + 4.2, 2.2, 1.2);
  }
  for (let r = 0; r < courses; r++) {
    const shift = (r % 2) * (w / 2);
    for (let c = 0; c <= plates; c++) {
      const px = c * w + shift;
      seam(px, r * h, px, (r + 1) * h);
    }
  }

  // Weathering.
  //
  // Three things, and between them they are most of what makes painted steel
  // at sea look like painted steel at sea: run-down streaks from every seam
  // and every scupper, rust breaking out at the seams themselves, and the
  // salt bloom that dries on a windward side.
  for (let i = 0; i < 420; i++) {
    const px = Math.random() * N;
    const py = Math.floor(Math.random() * courses) * h;
    const len = 10 + Math.random() * 90;
    g.fillStyle = `rgba(86,86,86,${0.03 + Math.random() * 0.06})`;
    g.fillRect(px, py, 1 + Math.random() * 2.4, len);
  }
  for (let i = 0; i < 90; i++) {
    const px = Math.random() * N;
    const py = Math.floor(Math.random() * (courses + 1)) * h;
    const len = 6 + Math.random() * 34;
    // Rust is warmer as well as darker, and the map is a luminance map -- so
    // it goes in as a light brown that pulls the ship's own grey toward it.
    g.fillStyle = `rgba(150,112,86,${0.06 + Math.random() * 0.10})`;
    g.fillRect(px, py - 1, 1.4 + Math.random() * 2.6, len);
  }
  for (let i = 0; i < 40; i++) {
    const px = Math.random() * N;
    const py = Math.random() * N;
    const r = 8 + Math.random() * 34;
    const grad = g.createRadialGradient(px, py, 0, px, py, r);
    grad.addColorStop(0, 'rgba(225,225,225,0.10)');
    grad.addColorStop(1, 'rgba(225,225,225,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
  }

  const img = g.getImageData(0, 0, N, N);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 12;
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
    const c = tile(STEEL_SIZE);
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
  0x6c6350,   // Yamato         teak forward
  0x5a5244,   // Yamato         linoleum abaft the bridge
  0x59503f,   // Takao          linoleum
  0x4e4638,   // Shinano        flight deck
  0x413a2e,   // Shinano        the darker planks in the lift platforms
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
    if (!o.isMesh) return;
    const mats = [].concat(o.material);
    const out = mats.map((m) => {
      if (!m || m.isLineBasicMaterial || m.transparent) return m;
      // Anything see-through is glass, a propeller disc or a wake: leave it.
      if (m.map) return m;
      const planked = PLANKED.has(m.color ? m.color.getHex() : -1);
      return surface(m, planked);
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
}

/**
 * The material a painted steel surface actually wants.
 *
 * Every ship in the game is built out of Lambert materials, and Lambert has no
 * specular term at all -- so a hull lit by the sun is exactly as bright facing
 * it as facing away from it, which is the single reason a grey ship reads as a
 * grey shape rather than as painted metal. What tells you a thing is metal is
 * the highlight: a broad soft one on painted steel, almost none on a wooden
 * deck, and it moves as you move.
 *
 * So each colour is swapped once for a Phong material of the same colour with
 * the right surface on it. Phong costs a fraction more per pixel than Lambert
 * and gives that term; it is not a full physical model and does not need to be,
 * because ship's-side paint is a rough dielectric and a rough dielectric is
 * exactly what Blinn-Phong was written for.
 *
 * One material per colour per surface, shared across every ship that uses it,
 * so a fleet of nine costs nine colours' worth rather than nine ships' worth.
 */
const SURFACES = new Map();
function surface(m, planked) {
  const hex = m.color ? m.color.getHex() : 0x808080;
  const key = `${hex}:${planked ? 'w' : 's'}`;
  let out = SURFACES.get(key);
  if (out) return out;
  out = new THREE.MeshPhongMaterial({
    color: hex,
    map: planked ? woodMap() : steelMap(),
    // Painted steel at sea is not polished: it is a rough coat with a fortnight
    // of salt on it, so the lobe is broad and weak. Teak holystoned white is
    // matter still -- a deck has almost no sheen at all and should not, or
    // every carrier in the game looks wet.
    specular: planked ? 0x1a1814 : 0x2f3439,
    shininess: planked ? 4 : 26,
    // The map is the surface as well as the colour: where the plating is dark
    // at a seam the highlight goes with it, which is what makes a weld read as
    // a step rather than as a painted line.
    specularMap: planked ? woodMap() : steelMap(),
    flatShading: m.flatShading === true,
    side: m.side,
  });
  SURFACES.set(key, out);
  return out;
}
