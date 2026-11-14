// The world chart behind the briefing screens.
//
// The coastlines are Natural Earth 1:50m — real survey data, not an
// approximation drawn from memory. It ships as TopoJSON (see
// shared/worlddata.js), which stores arcs as deltas on a quantisation grid and
// shares them between neighbouring shapes; that is why a whole world of
// coastline costs about half a megabyte instead of several.
//
// Coordinates throughout are [longitude, latitude].

// The coastline itself — decoding, the shapes, and the water test — is shared
// with the simulation rather than kept here. The chart and the battlefield have
// to be raised from exactly the same polygons: a coast the chart draws in one
// place and the sim collides on in another is worse than no coast at all.
import { boxedLand, isWater } from '../../shared/coast.js';
import { seaLabels, oceanLabels } from './waters.js';

export { isWater };

/**
 * Is there open water within `km` of this point?
 *
 * A captain is allowed to lay a corner of the battlefield a little way inland
 * — a beach, a spit, a harbour mole — so a point is acceptable if it is water
 * or if water is close enough to it. Sixteen samples on the circle and eight
 * halfway in: a strip of shore a thousand yards wide is a few hundred metres
 * on the chart, and nothing finer than that survives the coastline data
 * anyway.
 */
export function nearWater(lon, lat, km) {
  if (isWater(lon, lat)) return true;
  const dLat = km / 111.32;
  const dLon = dLat / Math.max(0.08, Math.cos((lat * Math.PI) / 180));
  for (const f of [1, 0.5]) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (isWater(lon + Math.cos(a) * dLon * f, lat + Math.sin(a) * dLat * f)) return true;
    }
  }
  return false;
}

export function waterSquareKm(lon, lat, maxKm) {
  const clear = (km) => {
    const dLat = km / 2 / 111.32;
    const dLon = dLat / Math.max(0.08, Math.cos((lat * Math.PI) / 180));
    for (let i = 0; i <= 6; i++) {
      for (let j = 0; j <= 6; j++) {
        // Only the perimeter needs testing: if the edge is clear and the centre
        // is clear, an island wholly inside would have to be smaller than the
        // sample spacing, which at this scale is under a kilometre.
        if (i > 0 && i < 6 && j > 0 && j < 6) continue;
        if (!isWater(lon + (i / 3 - 1) * dLon, lat + (j / 3 - 1) * dLat)) return false;
      }
    }
    return true;
  };
  if (!isWater(lon, lat)) return 0;
  if (clear(maxKm)) return maxKm;
  let lo = 0;
  let hi = maxKm;
  for (let k = 0; k < 12; k++) {
    const mid = (lo + hi) / 2;
    if (clear(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

// Wartime capitals of the major belligerents. China's is Chongqing, where the
// Nationalist government sat from 1938; France's is Paris, before the fall.
const CAPITALS = [
  ['LONDON', -0.13, 51.51], ['PARIS', 2.35, 48.86], ['BERLIN', 13.40, 52.52],
  ['ROME', 12.50, 41.90], ['WARSAW', 21.01, 52.23], ['MOSCOW', 37.62, 55.75],
  ['WASHINGTON', -77.04, 38.91], ['OTTAWA', -75.70, 45.42],
  ['TOKYO', 139.69, 35.69], ['CHONGQING', 106.55, 29.56],
  ['NEW DELHI', 77.21, 28.61], ['CANBERRA', 149.13, -35.28],
  ['WELLINGTON', 174.78, -41.29], ['PRETORIA', 28.19, -25.75],
];

// Fleet bases and anchorages, which is what this chart is really for.
const BASES = [
  ['SCAPA FLOW', -3.30, 58.90], ['GIBRALTAR', -5.35, 36.14],
  ['PEARL HARBOR', -157.95, 21.35], ['MIDWAY', -177.37, 28.21],
  ['SINGAPORE', 103.85, 1.29], ['RABAUL', 152.16, -4.20],
  ['MURMANSK', 33.08, 68.97], ['ALEXANDRIA', 29.92, 31.20],
  ['TRUK', 151.85, 7.45], ['DAKAR', -17.45, 14.72],
];

/**
 * The last chart painted on each canvas, without its marker, names or frame:
 * see drawWorld. One per canvas, so panning the deployment chart never throws
 * away the briefing's.
 */
const KEPT = new WeakMap();

function keepBase(canvas, key) {
  let kept = KEPT.get(canvas);
  if (!kept) {
    kept = { key: null, image: document.createElement('canvas') };
    KEPT.set(canvas, kept);
  }
  const { image } = kept;
  if (image.width !== canvas.width || image.height !== canvas.height) {
    image.width = canvas.width;
    image.height = canvas.height;
  }
  const c = image.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, image.width, image.height);
  c.drawImage(canvas, 0, 0);
  kept.key = key;
}

// ---- the chart's look ---------------------------------------------------------
// One palette for every chart in the game -- the deployment chart, the
// briefing's -- so they read as sheets off the same plotting table.
export const CHART = {
  sea: '#4d6a70',
  land: '#cbb68a',
  strand: '#a88f60',
  snow: '#ece3cc',
  coast: '#2e2214',
  shelf: 'rgba(30, 46, 52, 0.55)',
  lining: '30, 44, 50',
  grid: 'rgba(38, 28, 16, 0.30)',
  equator: 'rgba(132, 30, 20, 0.55)',
  margin: '#2b2218',
  ink: 'rgba(36, 26, 14, 0.92)',
  capital: '#23170b',
  base: '#8c1d12',
  pencil: '#8f1d14',
  waterName: 'rgba(18, 30, 36, 0.62)',
  seaName: 'rgba(18, 30, 36, 0.72)',
  halo: 'rgba(236, 224, 196, 0.78)',
};
const SNOW_RGB = '236, 227, 204';

/** Text in ink, with a breath of paper round it so it reads over a coast or a rule. */
function inked(ctx, text, x, y, colour) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = CHART.halo;
  ctx.lineWidth = 3;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** A small seeded generator, so the stains on the sheet are the same stains every time. */
function seeded(n) {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let GRAIN = null;
/** The paper's grain: a tile of speckle and fibre, made once. */
function grainTile() {
  if (GRAIN || typeof document === 'undefined') return GRAIN;
  const n = 256;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  const r = seeded(1942);
  for (let i = 0; i < n * n; i++) {
    // Mostly paper; a fleck of darker pulp here and there.
    const v = 200 + r() * 55 - (r() < 0.035 ? 70 * r() : 0);
    img.data[i * 4] = v; img.data[i * 4 + 1] = v * 0.96; img.data[i * 4 + 2] = v * 0.88;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // Fibres: short pale and dark hairs laid every which way.
  for (let i = 0; i < 260; i++) {
    const x = r() * n, y = r() * n, a = r() * Math.PI, l = 3 + r() * 9;
    g.strokeStyle = r() < 0.5 ? 'rgba(120, 96, 60, 0.35)' : 'rgba(255, 248, 230, 0.4)';
    g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  GRAIN = c;
  return GRAIN;
}

/**
 * The paper's grain over a part of a chart drawn elsewhere -- the order of
 * battle's sheet, the plotting table's -- softly, so whatever is printed on it
 * keeps its own colours.
 */
export function chartGrain(ctx, x, y, w, h, alpha = 0.32) {
  const tile = grainTile();
  if (!tile) return;
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = ctx.createPattern(tile, 'repeat');
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/**
 * Age the sheet: multiply its grain over the whole chart, lay a few stains on
 * it, darken it towards the edges, and crease it where it was folded -- in
 * four across and three down, the way a chart went into a case.
 */
function paperOver(ctx, w, h) {
  const tile = grainTile();
  ctx.save();
  if (tile) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = ctx.createPattern(tile, 'repeat');
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
  // Stains: a ring or two from a mug, and broad tide marks of foxing.
  ctx.globalCompositeOperation = 'multiply';
  const r = seeded(Math.round(w) * 7 + Math.round(h));
  for (let i = 0; i < 7; i++) {
    const x = r() * w, y = r() * h, rad = (0.06 + r() * 0.16) * Math.max(w, h);
    const g = ctx.createRadialGradient(x, y, rad * 0.2, x, y, rad);
    g.addColorStop(0, 'rgba(150, 110, 60, 0.10)');
    g.addColorStop(0.85, 'rgba(140, 100, 50, 0.16)');
    g.addColorStop(1, 'rgba(140, 100, 50, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 2; i++) {
    const x = (0.15 + r() * 0.7) * w, y = (0.15 + r() * 0.7) * h, rad = 26 + r() * 22;
    ctx.strokeStyle = 'rgba(110, 72, 34, 0.22)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, rad, r() * 2, r() * 2 + Math.PI * 1.6); ctx.stroke();
  }
  // Darker towards the edges, the way a sheet handled for years browns.
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
  v.addColorStop(0, 'rgba(120, 90, 50, 0)');
  v.addColorStop(1, 'rgba(90, 60, 28, 0.42)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  // The folds: a shadow down one side of each crease and a highlight up the other.
  for (const [n, across] of [[4, true], [3, false]]) {
    for (let k = 1; k < n; k++) {
      const at = (across ? w : h) * k / n;
      const g = across
        ? ctx.createLinearGradient(at - 6, 0, at + 6, 0)
        : ctx.createLinearGradient(0, at - 6, 0, at + 6);
      g.addColorStop(0, 'rgba(40, 26, 10, 0)');
      g.addColorStop(0.45, 'rgba(40, 26, 10, 0.20)');
      g.addColorStop(0.55, 'rgba(255, 246, 220, 0.16)');
      g.addColorStop(1, 'rgba(255, 246, 220, 0)');
      ctx.fillStyle = g;
      if (across) ctx.fillRect(at - 6, 0, 12, h); else ctx.fillRect(0, at - 6, w, 12);
    }
  }
  ctx.restore();
}

/** A compass rose in the chart's open sea, low on its left: thirty-two points and a ring of degrees. */
function compassRose(ctx, w, h) {
  const R = Math.max(26, Math.min(66, Math.min(w, h) * 0.075));
  const cx = Math.max(R + 22, w * 0.075), cy = Math.min(h - R - 30, h * 0.70);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = 0.82;
  ctx.strokeStyle = CHART.ink;
  ctx.fillStyle = CHART.ink;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, R * 0.86, 0, Math.PI * 2); ctx.stroke();
  for (let d = 0; d < 360; d += 5) {
    const a = (d * Math.PI) / 180, l = d % 45 === 0 ? 0.78 : d % 15 === 0 ? 0.82 : 0.84;
    ctx.beginPath(); ctx.moveTo(Math.sin(a) * R * l, -Math.cos(a) * R * l);
    ctx.lineTo(Math.sin(a) * R * 0.86, -Math.cos(a) * R * 0.86); ctx.stroke();
  }
  // The points: the cardinals long, the half-cardinals shorter, each in two
  // halves, one inked and one left as paper.
  for (const [n, len, wid] of [[8, 0.5, 0.07], [4, 0.78, 0.12]]) {
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2;
      const tip = [Math.sin(ang) * R * len, -Math.cos(ang) * R * len];
      const l = [Math.sin(ang - Math.PI / 2) * R * wid, -Math.cos(ang - Math.PI / 2) * R * wid];
      ctx.fillStyle = CHART.ink;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(...tip); ctx.lineTo(l[0], l[1]); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(236, 224, 196, 0.9)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(...tip); ctx.lineTo(-l[0], -l[1]); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(...tip); ctx.lineTo(-l[0], -l[1]); ctx.closePath(); ctx.stroke();
    }
  }
  ctx.fillStyle = CHART.pencil;
  ctx.font = `700 ${Math.round(R * 0.3)}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('N', 0, -R - 3);
  ctx.restore();
}

/**
 * Paint the chart. `focus` is [lon, lat] at the centre and `zoom` scales the
 * projection — 1 fits all 360 degrees of longitude across the canvas width.
 *
 * Returns false, having drawn nothing, if the canvas has no box on the page
 * yet; see below.
 */
export function drawWorld(canvas, opts = {}) {
  const {
    focus = [0, 8], zoom = 1,
    // A chart off a 1940s plotting table: the sea a worn slate blue, the land
    // the buff of the paper it was printed on, the coasts inked in, and the
    // whole sheet aged -- grained, stained, creased where it was folded into
    // a navigator's case. See paperOver().
    sea = CHART.sea,
    land = CHART.land, sand = CHART.strand, snow = CHART.snow,
    coast = CHART.coast,
    shelf = CHART.shelf,
    capital = CHART.capital, base = CHART.base, showPlaces = true,
    marker = null, markerName = '',
    graticule = false, showWaters = false, frame = true, rose = true,
    paper = true, lining = true,
  } = opts;

  // A canvas on a screen that is not up yet has no box to paint into. Painting
  // a made-up one is worse than not painting at all: the chart is drawn at one
  // shape and then stretched to whatever shape the screen turns out to be, and
  // the world comes back squashed. Say nothing was drawn and let the caller
  // ask again once it has a size.
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!(w > 0) || !(h > 0)) return false;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const scale = (w / 360) * zoom;
  const px = (lon) => w / 2 + (lon - focus[0]) * scale;
  const py = (lat) => h / 2 - (lat - focus[1]) * scale;

  // The sea, the land and the ice are the same picture every time the chart is
  // painted at the same view, and they are nearly all of the cost of painting
  // it: every coastline in the world stroked over and over for the strand.
  // What changes from one paint to the next at the same view -- the theatre
  // ring, the names, the frame -- is laid over a copy of them kept from the
  // last time. So the briefing's chart takes a new position back from the
  // deployment chart at once, rather than tracing the world again for the
  // sake of moving a ring across it.
  const key = [canvas.width, canvas.height, focus[0], focus[1], zoom,
    sea, land, sand, snow, coast, shelf, graticule, paper, lining].join('|');
  const kept = KEPT.get(canvas);
  const hit = !!kept && kept.key === key;
  if (hit) {
    ctx.drawImage(kept.image, 0, 0, w, h);
  } else {
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, w, h);
  }

  if (graticule && !hit) {
    // Meridians and parallels at a spacing that stays legible as the chart is
    // opened out: ten degrees across the world, down to one degree close in.
    const step = zoom > 24 ? 1 : zoom > 8 ? 5 : zoom > 3 ? 10 : 15;
    ctx.strokeStyle = CHART.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const lon0 = Math.ceil((focus[0] - (w / 2) / scale) / step) * step;
    const gTop = Math.max(0, py(90));
    const gBot = Math.min(h, py(-90));
    for (let lon = lon0; lon <= focus[0] + (w / 2) / scale; lon += step) {
      ctx.moveTo(px(lon), gTop); ctx.lineTo(px(lon), gBot);
    }
    const lat0 = Math.ceil((focus[1] - (h / 2) / scale) / step) * step;
    for (let lat = lat0; lat <= focus[1] + (h / 2) / scale; lat += step) {
      if (lat > 90 || lat < -90) continue;
      ctx.moveTo(0, py(lat)); ctx.lineTo(w, py(lat));
    }
    ctx.stroke();
    // The equator carries a little more weight than the rest.
    if (Math.abs(focus[1]) < (h / 2) / scale) {
      ctx.strokeStyle = CHART.equator;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, py(0)); ctx.lineTo(w, py(0)); ctx.stroke();
    }
  }

  // Ranges that are white for their height rather than their latitude. There is
  // no elevation in the coastline data, so these are named: longitude, latitude,
  // how far the snow reaches in degrees, and how solidly it lies.
  const HIGHLANDS = [
    [86, 33, 13, 0.95],    // the Himalaya and the Tibetan plateau
    [72, 39, 8, 0.70],     // the Pamirs and the Hindu Kush
    [-70.5, -19, 4.5, 0.65],  // the central Andes
    [-71.5, -42, 5.0, 0.60],  // the Patagonian ice fields
    [10.5, 46.5, 3.2, 0.75],  // the Alps
    [44, 42.8, 3.0, 0.65],    // the Caucasus
    [-116, 51, 7.0, 0.55],    // the Canadian Rockies
    [-149, 62, 7.5, 0.75],    // the Alaska Range
    [14, 66.5, 5.5, 0.60],    // the Scandes
    [60, 65, 4.5, 0.45],      // the Urals
    [95, 52, 6.0, 0.40],      // the Sayan and Altai
  ];

  /**
   * Snow, over whatever land is already clipped to. Two ice caps off the
   * latitude and a handful of ranges off the list above, all as gradients so
   * the white comes on gradually rather than along a line of latitude drawn
   * across Canada.
   */
  const paintSnow = (shift) => {
    const cap = (fromLat, toLat) => {
      const y0 = py(fromLat);
      const y1 = py(toLat);
      if ((y0 < 0 && y1 < 0) || (y0 > h && y1 > h)) return;
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, `rgba(${SNOW_RGB}, 0)`);
      g.addColorStop(0.55, `rgba(${SNOW_RGB}, 0.55)`);
      g.addColorStop(1, snow);
      ctx.fillStyle = g;
      ctx.fillRect(0, Math.min(y0, y1) - 2, w, Math.abs(y1 - y0) + 4);
      // Solid beyond the far end of the ramp: the pole is not a gradient.
      if (toLat > 0) { if (y1 > 0) { ctx.fillStyle = snow; ctx.fillRect(0, 0, w, y1); } }
      else if (y1 < h) { ctx.fillStyle = snow; ctx.fillRect(0, y1, w, h - y1); }
    };
    // Where the ice actually is, rather than where a line of latitude drawn
    // across southern Canada would put it.
    cap(58, 72);
    cap(-56, -70);

    for (const [lon, lat, deg, strength] of HIGHLANDS) {
      const cx = px(lon + shift);
      const cy = py(lat);
      const r = deg * scale;
      if (r < 1.5 || cx + r < 0 || cx - r > w || cy + r < 0 || cy - r > h) continue;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${SNOW_RGB}, ${strength})`);
      g.addColorStop(0.5, `rgba(${SNOW_RGB}, ${strength * 0.55})`);
      g.addColorStop(1, `rgba(${SNOW_RGB}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  };

  // Only trace what can be seen: at 1419 polygons, culling off-screen shapes is
  // the difference between a smooth repaint and a visible stall.
  const lonLo = focus[0] - (w / 2) / scale - 2;
  const lonHi = focus[0] + (w / 2) / scale + 2;
  const latLo = focus[1] - (h / 2) / scale - 2;
  const latHi = focus[1] + (h / 2) / scale + 2;

  // Projected once into a Path2D and then reused. The strand is built by
  // stroking every coastline a dozen times over at falling widths, and
  // re-projecting a continent's worth of vertices for each of those passes is
  // the difference between a repaint you notice and one you do not.
  const addPoly = (path, poly, shift) => {
    for (const r of poly) {
      let lx = 0;
      let ly = 0;
      let n = 0;
      const last = r.length - 1;
      for (let i = 0; i <= last; i++) {
        const x = px(r[i][0] + shift);
        const y = py(r[i][1]);
        // Detail finer than a pixel costs exactly as much to stroke as detail
        // that can be seen, and shows none of it. At world scale that is most
        // of a 1:50m coastline. Dropped once, here, rather than at every one
        // of the strand's passes -- which is the difference between a chart
        // that repaints in a frame and one that takes a second.
        if (n > 0 && i < last && Math.abs(x - lx) < 0.6 && Math.abs(y - ly) < 0.6) continue;
        if (n === 0) path.moveTo(x, y); else path.lineTo(x, y);
        lx = x; ly = y; n++;
      }
      // An island smaller than a pixel decimates to a single point and would
      // vanish. It is still an island: give it a pixel.
      if (n < 3) path.rect(lx - 0.5, ly - 0.5, 1, 1);
      path.closePath();
    }
  };

  // The bounding boxes come from the shared coastline, which works them out
  // once and keeps them. Walking a continent's vertices to find its corners
  // again on every repaint costs more than drawing the ones that are on
  // screen, and at a close zoom nearly all of it is spent proving that shapes
  // on the other side of the world are still on the other side of the world.
  const visible = (b, shift) =>
    b.x1 + shift >= lonLo && b.x0 + shift <= lonHi && b.y1 >= latLo && b.y0 <= latHi;

  // Drawn three times across so the chart wraps at the dateline rather than
  // ending in open sea. Holes come from the data, so a single evenodd fill
  // leaves the lakes as water.
  const polys = hit ? [] : boxedLand();
  for (const shift of [-360, 0, 360]) {
    const shown = polys.filter((p) => visible(p, shift));
    if (!shown.length) continue;
    const paths = [];
    const all = new Path2D();
    for (const { poly } of shown) {
      const path = new Path2D();
      addPoly(path, poly, shift);
      paths.push(path);
      all.addPath(path);
    }

    // Water-lining: the rings a draughtsman ruled off every coast, closer and
    // closer in to the shore, the way the charts of the day showed the sea
    // meeting the land. Each is a wide stroke in ink with a narrower one in
    // sea over it, which leaves a hairline at half the width out from the coast.
    if (lining) {
    ctx.save();
    ctx.lineJoin = 'round';
    for (const [wide, alpha] of [[26, 0.16], [17, 0.24], [9, 0.34]]) {
      ctx.strokeStyle = `rgba(${CHART.lining}, ${alpha})`;
      ctx.lineWidth = wide;
      ctx.stroke(all);
      ctx.strokeStyle = sea;
      ctx.lineWidth = wide - 1.3;
      ctx.stroke(all);
    }
    ctx.restore();
    }

    // A soft shelf under each coast, the way a chart shades shallow water. The
    // shape under it is filled sand, so the shelf reads as shallows running up
    // onto a beach rather than as a halo round a green blot.
    ctx.save();
    ctx.shadowColor = shelf;
    ctx.shadowBlur = 16;
    ctx.fillStyle = sand;
    ctx.fill(all, 'evenodd');
    ctx.restore();

    // Everything from here is inside the coastline.
    ctx.save();
    ctx.clip(all, 'evenodd');

    // The green of the interior, laid over the whole landmass...
    ctx.fillStyle = land;
    ctx.fillRect(0, 0, w, h);

    // ...and then the strand brought back along every coast. A wide soft
    // stroke on the coastline, clipped to the land, leaves its outer half in
    // the sea and its inner half on the shore: run it several times from broad
    // and faint to narrow and solid and the two colours meet in a gradient
    // rather than on a line. How far the sand reaches inland is a fixed
    // distance on the ground, so opening the chart out widens the beach the
    // way zooming into a photograph would, instead of keeping it a fixed
    // number of pixels and turning every continent to sand at world scale.
    // ...with a floor, because at world scale the true width of a beach is a
    // fraction of a pixel and a chart that draws it honestly draws nothing. A
    // few pixels of strand round every continent is what every atlas ever
    // printed does, and it is what makes a coastline read as a coastline.
    const strandPx = Math.max(5.0, Math.min(46, scale * 0.62));
    ctx.strokeStyle = sand;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // As many passes as the band is wide enough to show. A five-pixel strand
    // is smooth in three; forty pixels needs a dozen, and by then there is a
    // coastline or two on the screen rather than the whole world's worth.
    const PASSES = Math.max(3, Math.min(14, Math.round(strandPx * 0.55)));
    for (let i = 0; i < PASSES; i++) {
      const t = i / (PASSES - 1);
      ctx.globalAlpha = 0.05 + t * t * 0.42;
      ctx.lineWidth = strandPx * 2 * (1 - t * 0.94);
      for (const path of paths) ctx.stroke(path);
    }
    ctx.globalAlpha = 1;

    // Snow. There is no elevation in this data, so the ice caps come off the
    // latitude -- which is where nearly all of it is anyway -- and the ranges
    // that are white for their height rather than their latitude are named
    // below and laid on as their own soft patches.
    paintSnow(shift);

    ctx.restore();

    ctx.strokeStyle = coast;
    ctx.lineWidth = 1.1;
    for (const path of paths) ctx.stroke(path);
  }

  // Beyond the poles there is no chart. On a tall frame at world scale a good
  // part of the canvas is off the map altogether, and leaving it painted as sea
  // with the meridians running on through it reads as a fault.
  const yTop = py(90);
  const yBot = py(-90);
  if (!hit && (yTop > 0 || yBot < h)) {
    ctx.fillStyle = CHART.margin;
    if (yTop > 0) ctx.fillRect(0, 0, w, yTop);
    if (yBot < h) ctx.fillRect(0, yBot, w, h - yBot);
    ctx.strokeStyle = CHART.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (yTop > 0) { ctx.moveTo(0, yTop); ctx.lineTo(w, yTop); }
    if (yBot < h) { ctx.moveTo(0, yBot); ctx.lineTo(w, yBot); }
    ctx.stroke();
  }

  // The sheet itself, over everything printed on it: its grain, the stains
  // of a war's worth of coffee and salt, and the creases it was folded on.
  if (!hit && paper) paperOver(ctx, w, h);

  if (!hit) keepBase(canvas, key);

  // The theatre this briefing is set in, ringed on the chart.
  if (marker) {
    const mx = px(marker[0]);
    const my = py(marker[1]);
    ctx.strokeStyle = CHART.pencil;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx, my, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.arc(mx, my, 27, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(mx - 24, my); ctx.lineTo(mx - 8, my);
    ctx.moveTo(mx + 8, my); ctx.lineTo(mx + 24, my);
    ctx.moveTo(mx, my - 24); ctx.lineTo(mx, my - 8);
    ctx.moveTo(mx, my + 8); ctx.lineTo(mx, my + 24);
    ctx.stroke();
    if (markerName) {
      ctx.font = '700 14px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      inked(ctx, markerName.toUpperCase(), mx, my + 32, CHART.pencil);
      ctx.textAlign = 'start';
    }
  }

  if (showWaters) {
    // A body is worth naming when it is neither a speck nor larger than the
    // chart: oceans at world scale, seas as it is opened out, straits close in.
    const marks = [];
    for (const kind of ['ocean', 'sea']) {
      for (const wb of kind === 'ocean' ? oceanLabels() : seaLabels()) {
        const rpx = (wb.r / 111.32) * scale;
        const min = kind === 'ocean' ? 150 : 26;
        const max = kind === 'ocean' ? 4000 : 900;
        if (rpx < min || rpx > max) continue;
        let best = null;
        for (const shift of [-360, 0, 360]) {
          const x = px(wb.lon + shift);
          const y = py(wb.lat);
          if (x < -100 || x > w + 100 || y < -20 || y > h + 20) continue;
          if (!best || Math.abs(x - w / 2) < Math.abs(best.x - w / 2)) best = { x, y };
        }
        if (best) marks.push({ ...wb, x: best.x, y: best.y, kind, rpx });
      }
    }
    // Biggest first, so an ocean's name is placed before the seas inside it.
    marks.sort((a, b) => b.rpx - a.rpx);
    const used = [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const m of marks) {
      const size = m.kind === 'ocean'
        ? Math.min(26, Math.max(13, m.rpx / 22))
        : Math.min(17, Math.max(10, m.rpx / 9));
      // Water is named in italic, as every hydrographer's chart names it.
      ctx.font = `italic ${m.kind === 'ocean' ? 600 : 500} ${size}px Georgia, "Times New Roman", serif`;
      const label = m.kind === 'ocean' ? m.name.toUpperCase() : m.name;
      const bw = ctx.measureText(label).width + 10;
      const bh = size + 4;
      const box = { x: m.x - bw / 2, y: m.y - bh / 2, w: bw, h: bh };
      if (used.some((r) => box.x < r.x + r.w && box.x + box.w > r.x
        && box.y < r.y + r.h && box.y + box.h > r.y)) continue;
      used.push(box);
      ctx.fillStyle = m.kind === 'ocean' ? CHART.waterName : CHART.seaName;
      if (m.kind === 'ocean') ctx.letterSpacing = '0.24em';
      ctx.fillText(label, m.x, m.y);
      ctx.letterSpacing = '0px';
    }
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  // ---- the neatline -------------------------------------------------------
  // A chart has a border. Two rules with a hair of sea between them, ticked at
  // the corners the way a survey sheet is, and the whole thing inside the
  // canvas rather than on its edge so it reads as a frame round the map and
  // not as the window it happens to be drawn in.
  const drawFrame = () => {
    ctx.save();
    ctx.lineJoin = 'miter';
    // A breath of shadow inside the border, so the chart sits in the frame.
    const vig = ctx.createLinearGradient(0, 0, 0, 22);
    vig.addColorStop(0, 'rgba(40, 26, 12, 0.45)');
    vig.addColorStop(1, 'rgba(40, 26, 12, 0)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, 22);

    // The degree border a survey sheet is printed with: a band between the
    // two rules, chequered black and paper every ten degrees of the chart's
    // own longitude and latitude, so the frame is a scale as well as a frame.
    const b0 = 4, b1 = 10;
    ctx.fillStyle = 'rgba(236, 224, 196, 0.92)';
    ctx.fillRect(b0, b0, w - 2 * b0, b1 - b0);
    ctx.fillRect(b0, h - b1, w - 2 * b0, b1 - b0);
    ctx.fillRect(b0, b0, b1 - b0, h - 2 * b0);
    ctx.fillRect(w - b1, b0, b1 - b0, h - 2 * b0);
    const deg = zoom > 24 ? 1 : zoom > 8 ? 2 : zoom > 3 ? 5 : 10;
    ctx.fillStyle = CHART.ink;
    const lonA = Math.floor((focus[0] - (w / 2) / scale) / deg) * deg;
    for (let lon = lonA; px(lon) < w; lon += deg) {
      if (Math.round(lon / deg) % 2) continue;
      const xa = Math.max(b1, px(lon)), xb = Math.min(w - b1, px(lon + deg));
      if (xb <= xa) continue;
      ctx.fillRect(xa, b0, xb - xa, b1 - b0);
      ctx.fillRect(xa, h - b1, xb - xa, b1 - b0);
    }
    const latA = Math.floor((focus[1] - (h / 2) / scale) / deg) * deg;
    for (let lat = latA; py(lat) > 0; lat += deg) {
      if (Math.round(lat / deg) % 2) continue;
      const ya = Math.max(b1, py(lat + deg)), yb = Math.min(h - b1, py(lat));
      if (yb <= ya) continue;
      ctx.fillRect(b0, ya, b1 - b0, yb - ya);
      ctx.fillRect(w - b1, ya, b1 - b0, yb - ya);
    }

    ctx.strokeStyle = CHART.ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(b0, b0, w - 2 * b0, h - 2 * b0);
    ctx.lineWidth = 1;
    ctx.strokeRect(b1 + 0.5, b1 + 0.5, w - 2 * b1 - 1, h - 2 * b1 - 1);

    // Corner ticks, in from each corner along both edges.
    ctx.strokeStyle = CHART.ink;
    ctx.lineWidth = 2;
    const t = 18;
    ctx.beginPath();
    for (const [cx, cy, sx, sy] of [[4, 4, 1, 1], [w - 4, 4, -1, 1],
      [4, h - 4, 1, -1], [w - 4, h - 4, -1, -1]]) {
      ctx.moveTo(cx, cy + sy * t); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * t, cy);
    }
    ctx.stroke();
    ctx.restore();
  };

  if (rose) compassRose(ctx, w, h);

  if (!showPlaces) { if (frame) drawFrame(); return true; }

  // Markers first, labels second. At world scale the European capitals sit
  // almost on top of one another, so every marker is reserved before any label
  // is placed — otherwise London's name runs into Berlin's marker. Each label
  // is then tried in four positions and dropped if it still collides, and
  // capitals go first so a base yields to a capital rather than the reverse.
  const taken = [];
  const clear = (x, y, bw, bh) => {
    if (x < 2 || y < 2 || x + bw > w - 2 || y + bh > h - 2) return false;
    return !taken.some((r) => x < r.x + r.w && x + bw > r.x && y < r.y + r.h && y + bh > r.y);
  };

  // A chart that wraps can show the same place twice, once at each seam. Only
  // the copy nearest the middle is kept, or Canberra appears at both edges.
  const spots = [];
  for (const [list, kind] of [[CAPITALS, 'capital'], [BASES, 'base']]) {
    for (const [name, lon, lat] of list) {
      let best = null;
      for (const shift of [-360, 0, 360]) {
        const x = px(lon + shift);
        const y = py(lat);
        if (x < -80 || x > w + 80 || y < -20 || y > h + 20) continue;
        if (!best || Math.abs(x - w / 2) < Math.abs(best.x - w / 2)) best = { name, x, y, kind };
      }
      if (best) spots.push(best);
    }
  }

  for (const s of spots) {
    const isCapital = s.kind === 'capital';
    ctx.fillStyle = isCapital ? capital : base;
    if (isCapital) {
      // A capital gets a ringed square; a base a plain dot.
      ctx.fillRect(s.x - 2.5, s.y - 2.5, 5, 5);
      ctx.strokeStyle = capital;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.strokeRect(s.x - 5, s.y - 5, 10, 10);
      ctx.globalAlpha = 1;
      taken.push({ x: s.x - 6, y: s.y - 6, w: 12, h: 12 });
    } else {
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      taken.push({ x: s.x - 4, y: s.y - 4, w: 8, h: 8 });
    }
  }

  // The theatre ring owns its patch of chart; keep names out of it.
  if (marker) {
    const mx = px(marker[0]);
    const my = py(marker[1]);
    taken.push({ x: mx - 62, y: my - 32, w: 124, h: 80 });
  }

  ctx.textBaseline = 'top';
  for (const s of spots) {
    const isCapital = s.kind === 'capital';
    ctx.font = isCapital
      ? '600 12px "Barlow Condensed", "Arial Narrow", sans-serif'
      : '11px "Barlow Condensed", "Arial Narrow", sans-serif';
    const tw = ctx.measureText(s.name).width;
    const th = 12;
    const pad = isCapital ? 9 : 7;
    const spot = [
      [s.x + pad, s.y - th / 2], [s.x - pad - tw, s.y - th / 2],
      [s.x - tw / 2, s.y - pad - th], [s.x - tw / 2, s.y + pad],
    ].find(([lx, ly]) => clear(lx, ly, tw, th));
    if (!spot) continue;
    taken.push({ x: spot[0] - 2, y: spot[1], w: tw + 4, h: th });
    inked(ctx, s.name, spot[0], spot[1], isCapital ? capital : base);
  }

  if (frame) drawFrame();
  return true;
}

/**
 * Lay the chart into the title's wordmark: the North Atlantic and Europe off
 * the same plotting sheet as the deployment chart, drawn once into a canvas
 * the size of the mark and handed to the pattern its letters are filled with
 * (see #mark-chart in index.html). Until it is drawn -- or if there is no
 * canvas -- the letters keep the plain ruled chart the pattern starts with.
 */
export function paintTitleChart() {
  const img = typeof document !== 'undefined' && document.getElementById('mark-chart-img');
  if (!img) return false;
  const c = document.createElement('canvas');
  // Laid out off the screen: drawWorld wants a box to paint into.
  c.style.cssText = 'position:fixed;left:-4000px;top:0;width:1050px;height:362px;visibility:hidden;';
  document.body.appendChild(c);
  // Kept in memory rather than on the graphics card: reading a picture back
  // off the card is a stall of seconds on a slow one, and this is read once.
  c.getContext('2d', { willReadFrequently: true });
  const drawn = drawWorld(c, {
    focus: [12, 47], zoom: 5.2,
    graticule: true, showPlaces: false, showWaters: false, rose: false, frame: false,
    // Drawn on the processor, where the ruled water-lines, the blurred shelf
    // and the aged paper are seconds of work; at the size of a letter none of
    // them is seen, and the mark lays its own grain over the chart.
    lining: false, paper: false, shelf: 'rgba(0, 0, 0, 0)',
  });
  c.remove();
  if (!drawn) return false;
  // Encoded off the main thread, and handed to the mark when it is ready.
  c.toBlob((blob) => {
    if (blob) img.setAttribute('href', URL.createObjectURL(blob));
  }, 'image/jpeg', 0.86);
  return true;
}
