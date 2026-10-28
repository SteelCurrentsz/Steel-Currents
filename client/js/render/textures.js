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
/**
 * Bring a drawn tile to unit gain.
 *
 * These are multiply maps: three.js takes `map` times `color`, with no gain of
 * its own, so whatever the tile's mean brightness is, that is the factor every
 * ship's paint is multiplied by. Drawing plate at mid-grey and seams under it
 * therefore does not give a grey hull with dark seams -- it gives a hull
 * painted half as dark as her palette says, which at Kure grey is very nearly
 * black.
 *
 * So the tile is drawn at whatever tones are convenient to draw it in, and
 * then rescaled here about its own mean: the average pixel comes out at
 * `target`, everything darker keeps its ratio to it, and everything brighter
 * is pulled in over a soft knee so a weld bead lifts without blowing out. The
 * scale is taken from luminance and applied to all three channels, so the warm
 * cast of a rust streak survives it.
 */
function unitGain(g, N, target = 232, knee = 0.42) {
  const img = g.getImageData(0, 0, N, N);
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  const mean = sum / (d.length / 4) || 1;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const ratio = lum / mean;
    const out = ratio <= 1 ? target * ratio : target * (1 + (ratio - 1) * knee);
    const k = lum > 0.5 ? out / lum : out;
    for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, d[i + c] * k));
  }
  g.putImageData(img, 0, 0);
}

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
  unitGain(g, N, 234, 0.40);
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
    // Laid from whatever came off the pile: some planks are a shade darker
    // and some have bleached, and the spread is wide enough to read from the
    // bridge as a deck rather than as a beige sheet.
    const v = 112 + ((p * 7) % 5) * 7 + Math.random() * 14;
    g.fillStyle = `rgb(${v + 3},${v},${v - 4})`;
    g.fillRect(p * w, 0, w, SIZE);
    // Grain along the plank: long wandering lines that run the whole length
    // of it, the dark latewood between pale bands.
    const lines = 7 + Math.floor(Math.random() * 4);
    for (let l = 0; l < lines; l++) {
      let gx = p * w + 2 + Math.random() * (w - 4);
      const dark = Math.random() < 0.6;
      g.strokeStyle = dark
        ? `rgba(70,62,52,${0.10 + Math.random() * 0.12})`
        : `rgba(190,182,168,${0.06 + Math.random() * 0.08})`;
      g.lineWidth = 0.6 + Math.random() * 1.1;
      g.beginPath();
      g.moveTo(gx, 0);
      const phase = Math.random() * 6.28;
      for (let py = 8; py <= SIZE; py += 8) {
        gx += Math.sin(py * 0.02 + phase) * 0.25;
        gx = Math.max(p * w + 2, Math.min((p + 1) * w - 2, gx));
        g.lineTo(gx, py);
      }
      g.stroke();
    }
    // Short flecks of figure between the lines.
    for (let i = 0; i < 26; i++) {
      const px = p * w + 2 + Math.random() * (w - 3);
      const py = Math.random() * SIZE;
      g.fillStyle = `rgba(${90 + Math.random() * 60},${88},${80},${0.05 + Math.random() * 0.08})`;
      g.fillRect(px, py, 1, 12 + Math.random() * 60);
    }
    // A knot now and then, with the grain swept round it.
    if (Math.random() < 0.45) {
      const kx = p * w + w * (0.3 + Math.random() * 0.4);
      const ky = Math.random() * SIZE;
      const kr = 1.6 + Math.random() * 2.2;
      g.strokeStyle = 'rgba(80,70,58,0.22)';
      g.lineWidth = 0.8;
      for (let r = kr + 1.5; r < kr + 6; r += 1.6) {
        g.beginPath(); g.ellipse(kx, ky, r * 0.7, r * 1.8, 0, 0, Math.PI * 2); g.stroke();
      }
      g.fillStyle = 'rgba(58,48,38,0.55)';
      g.beginPath(); g.ellipse(kx, ky, kr * 0.8, kr * 1.3, 0, 0, Math.PI * 2); g.fill();
    }
    // Butt joints, staggered so no two fall together, the end grain either
    // side of each a little darker where it has drunk the water.
    for (let b = 0; b < 3; b++) {
      const py = ((p * 97 + b * 171) % SIZE);
      g.fillStyle = 'rgba(80,72,62,0.16)';
      g.fillRect(p * w, py - 5, w, 10);
      g.fillStyle = 'rgba(46,42,38,0.7)';
      g.fillRect(p * w, py, w, 1.6);
      // The two bungs over the fastenings at each end of a plank.
      g.fillStyle = 'rgba(160,150,132,0.35)';
      g.beginPath(); g.arc(p * w + w * 0.3, py + 4.5, 1.3, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(p * w + w * 0.7, py + 4.5, 1.3, 0, Math.PI * 2); g.fill();
    }
  }
  // The caulked seams last, over everything: pitch, dark, and the reason a
  // deck reads as planked. Wide enough to survive the mipmap from the bridge.
  for (let p = 0; p < planks; p++) {
    g.fillStyle = 'rgba(34,32,30,0.85)';
    g.fillRect(p * w - 0.4, 0, 2.2, SIZE);
    // The plank edge beside it, worn round and catching the light.
    g.fillStyle = 'rgba(200,192,176,0.18)';
    g.fillRect(p * w + 1.8, 0, 1.2, SIZE);
  }
  // Holystone and weather: broad soft patches where the crew walk and where
  // the spray dries, across the planks rather than along them.
  for (let i = 0; i < 26; i++) {
    const px = Math.random() * SIZE, py = Math.random() * SIZE;
    const r = 20 + Math.random() * 60;
    const v = Math.random() < 0.5 ? 210 : 80;
    const grad = g.createRadialGradient(px, py, 0, px, py, r);
    grad.addColorStop(0, `rgba(${v},${v},${v},0.07)`);
    grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = grad;
    g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
  }
  const img = g.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  unitGain(g, SIZE, 238, 0.45);
  return x;
}

/**
 * Linoleum, the way a Japanese cruiser's weather decks were covered: sheets
 * laid fore and aft and held down by brass strips across the ship every
 * metre and a bit, which is the pattern you see on her deck from the air --
 * transverse lines of bright metal on a dark brown ground. The U axis runs
 * across her and the V axis along her, as her plan does.
 */
export const LINO_TILE = 4.8;
function drawLinoleum(x) {
  const g = x.getContext('2d');
  const N = SIZE;
  g.fillStyle = '#7a7a7a';
  g.fillRect(0, 0, N, N);
  // Three sheets across the tile, each its own shade: a sheet is cut off one
  // roll and the next off another.
  const sheets = 3;
  const sw = N / sheets;
  for (let s = 0; s < sheets; s++) {
    const v = 118 + s * 5 + Math.random() * 6;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(s * sw, 0, sw, N);
    // The butt seam between two sheets: fine and dark.
    g.fillStyle = 'rgba(60,60,60,0.55)';
    g.fillRect(s * sw, 0, 1.4, N);
  }
  // Mottle: linoleum is cork and linseed and it is never one flat colour.
  for (let i = 0; i < 900; i++) {
    const px = Math.random() * N, py = Math.random() * N;
    const r = 2 + Math.random() * 10;
    const v = Math.random() < 0.5 ? 90 : 170;
    g.fillStyle = `rgba(${v},${v},${v},${0.03 + Math.random() * 0.05})`;
    g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
  }
  // Wear: paler where the crew walk, along the middle of each sheet.
  for (let s = 0; s < sheets; s++) {
    const grad = g.createLinearGradient(s * sw, 0, (s + 1) * sw, 0);
    grad.addColorStop(0, 'rgba(200,200,200,0)');
    grad.addColorStop(0.5, 'rgba(200,200,200,0.06)');
    grad.addColorStop(1, 'rgba(200,200,200,0)');
    g.fillStyle = grad;
    g.fillRect(s * sw, 0, sw, N);
  }
  // The brass strips across the ship, four to a tile: a bright line with a
  // dark edge either side, where the strip stands a hair proud of the sheet.
  const strips = 4;
  for (let k = 0; k < strips; k++) {
    const py = ((k + 0.5) * N) / strips;
    g.fillStyle = 'rgba(52,52,52,0.45)';
    g.fillRect(0, py - 2.2, N, 1.2);
    g.fillRect(0, py + 1.6, N, 1.2);
    g.fillStyle = 'rgba(236,222,170,0.55)';
    g.fillRect(0, py - 1.0, N, 2.6);
  }
  const img = g.getImageData(0, 0, N, N);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 9;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  unitGain(g, N, 236, 0.5);
  return x;
}

let steel = null;
let wood = null;
let lino = null;

/** The linoleum map, drawn once. */
export function linoleumMap() {
  if (lino === undefined) return null;
  if (!lino) {
    const c = tile();
    if (!c) { lino = undefined; return null; }
    lino = wrap(drawLinoleum(c), LINO_TILE);
  }
  return lino;
}

/**
 * Relief, read off a drawn tile.
 *
 * The colour maps are luminance, and luminance on these tiles is very nearly
 * height already: a seam is a dark groove, a weld bead is a light ridge, a
 * rivet head is a light dot with a dark ring round it, and a caulked deck
 * seam is the darkest thing on the deck. So the relief is taken from the tile
 * itself -- softened first, so the speckle that keeps a flat plate from
 * reading as one colour does not become a field of glittering pits -- and
 * turned into a tangent-space normal map by the slope across each pixel.
 *
 * That is the difference between a seam that is painted on and one that is
 * there: with the sun low on her beam every lap catches a line of light along
 * its upper edge and throws a line of shadow under it, the frames stand proud
 * of the panting between them, and the deck shows its planks by the light
 * running across them rather than by a darker line.
 */
function reliefOf(src, strength, blur = 1) {
  const N = src.width;
  const d = src.getContext('2d').getImageData(0, 0, N, N).data;
  let h = new Float32Array(N * N);
  for (let i = 0, k = 0; k < h.length; i += 4, k++) {
    h[k] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
  }
  // A box blur, wrapped, once each way per pass: the tile repeats, so its
  // slope has to as well or every tile edge is a ridge.
  const at = (x, y) => ((y + N) % N) * N + ((x + N) % N);
  for (let p = 0; p < blur; p++) {
    const t = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      t[y * N + x] = (h[at(x - 1, y)] + h[y * N + x] + h[at(x + 1, y)]) / 3;
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      h[y * N + x] = (t[at(x, y - 1)] + t[y * N + x] + t[at(x, y + 1)]) / 3;
    }
  }
  const out = tile(N);
  const g = out.getContext('2d');
  const img = g.createImageData(N, N);
  const o = img.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // The canvas is uploaded flipped, so a row further down the canvas is
    // further down the texture's V: the slope in V is the other way about.
    const dx = (h[at(x + 1, y)] - h[at(x - 1, y)]) * strength;
    const dy = (h[at(x, y - 1)] - h[at(x, y + 1)]) * strength;
    const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
    const i = (y * N + x) * 4;
    o[i] = (-dx * inv * 0.5 + 0.5) * 255;
    o[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
    o[i + 2] = (inv * 0.5 + 0.5) * 255;
    o[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return out;
}

const RELIEF = new Map();
/** The relief to go with one of the maps above, made once. */
function reliefFor(map, strength, blur) {
  if (!map) return null;
  let n = RELIEF.get(map);
  if (!n) {
    const c = reliefOf(map.image, strength, blur);
    n = new THREE.CanvasTexture(c);
    n.wrapS = n.wrapT = THREE.RepeatWrapping;
    n.repeat.copy(map.repeat);
    n.anisotropy = map.anisotropy;
    RELIEF.set(map, n);
  }
  return n;
}

/** The plating's relief: laps, butts, frames and rivet heads. */
export function steelRelief() { return reliefFor(steelMap(), 6.0, 1); }
/** The planking's relief: the caulked seams and the grain. */
export function woodRelief() { return reliefFor(woodMap(), 7.0, 1); }
/** The linoleum's relief: the brass strips standing proud of the sheet. */
export function linoleumRelief() { return reliefFor(linoleumMap(), 5.0, 1); }

/**
 * Put the relief on a material, and with it the sheen of painted steel.
 *
 * Every ship's hull is made somewhere of its own, and each of them already
 * takes its colour and its specular from the maps above; this is the one
 * place that adds the rest, so a sculpted hull and a box-built one end up in
 * the same steel. `surface` is 'steel', 'wood' or 'lino'. Returns the
 * material, so it can wrap a constructor.
 */
export function finish(m, surface = 'steel') {
  if (!m || !m.isMeshPhongMaterial) return m;
  const n = surface === 'wood' ? woodRelief() : surface === 'lino' ? linoleumRelief() : steelRelief();
  if (!n) return m;
  m.normalMap = n;
  // Plate is stiff and its relief is shallow; a deck seam is a real groove.
  const k = surface === 'steel' ? 0.75 : 0.9;
  m.normalScale = new THREE.Vector2(k, k);
  m.needsUpdate = true;
  return m;
}

/**
 * The sky in her paint.
 *
 * Painted steel is a dielectric, and a dielectric seen at a grazing angle is a
 * mirror: the side of a ship looking down her length shows the sky along it,
 * pale over the upper strakes and the colour of the sea low down, and that
 * broad wash of reflected light is what makes a grey hull read as metal and
 * not as grey card. Phong has no such term, and an environment map would have
 * to be redrawn for every sky the game has.
 *
 * But the sky is already in the scene as the hemisphere light every battle
 * is lit by -- its colour, its sea colour and how bright it is, dawn, noon,
 * dusk, typhoon or night -- so the reflection is read from that: the
 * reflected ray's height picks a point between the two, and Schlick's term
 * says how much of it a surface at that angle gives back. It goes dark when
 * the battle does, with nothing to keep in step.
 *
 * Patched into the Phong shader itself rather than put on one material,
 * because a ship's materials are copied -- for her paint to be marked, for her
 * holes to be cut -- and a copy keeps its maps but not a compile hook. Only a
 * surface with both a relief and a specular map takes it, which is a ship's
 * steel and planking and nothing else in the game; how much it gives back is
 * read off the material's own specular colour and map, so a deck at a tenth
 * of the steel's specular takes a tenth of the sheen, and a seam none.
 */
if (THREE.ShaderLib && THREE.ShaderLib.phong && !THREE.ShaderLib.phong.sheen) {
  THREE.ShaderLib.phong.sheen = true;
  THREE.ShaderLib.phong.fragmentShader = THREE.ShaderLib.phong.fragmentShader.replace(
    '#include <opaque_fragment>',
    `#if defined( USE_NORMALMAP ) && defined( USE_SPECULARMAP ) && ( NUM_HEMI_LIGHTS > 0 )
{
  vec3 sheenV = normalize( vViewPosition );
  vec3 sheenR = reflect( - sheenV, normal );
  float sheenF = pow( 1.0 - saturate( dot( normal, sheenV ) ), 5.0 );
  float sheenUp = dot( sheenR, hemisphereLights[ 0 ].direction );
  // The horizon is the brightest part of a sea sky, and a sharp one: the
  // reflection steps from sky to sea across it rather than fading.
  vec3 sheenSky = mix( hemisphereLights[ 0 ].groundColor, hemisphereLights[ 0 ].skyColor,
    smoothstep( - 0.08, 0.12, sheenUp ) );
  sheenSky += hemisphereLights[ 0 ].skyColor * 0.35 * exp( - abs( sheenUp ) * 9.0 );
  float sheenK = dot( specular, vec3( 0.333 ) ) * 3.2;
  outgoingLight += sheenSky * sheenK * specularStrength * ( 0.05 + 0.95 * sheenF ) * 0.55;
}
#endif
#include <opaque_fragment>`,
  );
}

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
  0x968c72,   // Yamato         teak forward
  0x6e6450,   // Yamato         linoleum abaft the bridge
  0x8a6c48,   // Takao          linoleum
  0x9a9179,   // Shinano        flight deck
  0x7d7461,   // Shinano        the darker planks in the lift platforms
  0x4c4d48,   // U-48           the wooden grating on her casing
  0x8b8272,   // Surcouf        the planked casing deck, salt-bleached
  0x736b5d,   // Surcouf        her king plank and the gratings in it
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
      // A model that paints herself in her own shader (see zeroModel.js).
      if (m.userData && m.userData.painted) return m;
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
  finish(out, planked ? 'wood' : 'steel');
  SURFACES.set(key, out);
  return out;
}
