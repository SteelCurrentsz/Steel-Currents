// The world chart behind the briefing screens.
//
// The coastlines are Natural Earth 1:50m — real survey data, not an
// approximation drawn from memory. It ships as TopoJSON (see worlddata.js) and
// is decoded here: arcs are shared between neighbouring rings and stored as
// deltas on a quantisation grid, which is why a whole world of coastline costs
// about half a megabyte instead of several.
//
// Coordinates throughout are [longitude, latitude].

import { LAND_TOPOLOGY } from './worlddata.js';

/** Decode the delta-encoded arcs into absolute lon/lat once, then cache. */
let ARCS = null;
function arcs() {
  if (ARCS) return ARCS;
  const { scale, translate } = LAND_TOPOLOGY.transform;
  ARCS = LAND_TOPOLOGY.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    const out = new Array(arc.length);
    for (let i = 0; i < arc.length; i++) {
      x += arc[i][0];
      y += arc[i][1];
      out[i] = [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    }
    return out;
  });
  return ARCS;
}

/** Stitch a ring's arc indices into one run of points. A negative index means
 *  that arc traversed backwards, which is how TopoJSON shares a coastline
 *  between the two shapes that meet along it. */
function ring(indices) {
  const all = arcs();
  const pts = [];
  for (const idx of indices) {
    const arc = idx < 0 ? all[~idx].slice().reverse() : all[idx];
    // The joining point is shared, so drop the duplicate.
    for (let i = pts.length ? 1 : 0; i < arc.length; i++) pts.push(arc[i]);
  }
  return unwrap(pts);
}

/** Keep a ring's longitudes continuous.
 *
 *  Shapes that straddle the antimeridian — Fiji, Wrangel, Chukotka, Antarctica
 *  — step from +179 to -179 between two neighbouring points. Drawn literally
 *  that is a straight line clear across the chart, which is what those stray
 *  horizontal streaks were. Carrying the offset instead lets the ring run past
 *  180 and stay in one piece; the copies drawn at plus and minus 360 put it
 *  back on the far side. */
function unwrap(pts) {
  if (pts.length < 2) return pts;
  const out = [pts[0]];
  let prev = pts[0][0];
  for (let i = 1; i < pts.length; i++) {
    let lon = pts[i][0];
    while (lon - prev > 180) lon -= 360;
    while (prev - lon > 180) lon += 360;
    out.push([lon, pts[i][1]]);
    prev = lon;
  }
  return out;
}

let RINGS = null;
/** Every land polygon as [exteriorRing, ...holes]. Lakes arrive as holes, so
 *  the Caspian and the Great Lakes come out of the data rather than being
 *  patched back in afterwards. */
function landRings() {
  if (RINGS) return RINGS;
  RINGS = LAND_TOPOLOGY.polygons.map((poly) => poly.map(ring));
  return RINGS;
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
 * Paint the chart. `focus` is [lon, lat] at the centre and `zoom` scales the
 * projection — 1 fits all 360 degrees of longitude across the canvas width.
 */
export function drawWorld(canvas, opts = {}) {
  const {
    focus = [0, 8], zoom = 1,
    sea = '#0a1826', land = '#2e4860', coast = '#628aa3',
    shelf = 'rgba(90, 140, 175, 0.5)',
    capital = '#e6cf9c', base = '#c98b8b', showPlaces = true,
    marker = null, markerName = '',
  } = opts;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 1200;
  const h = canvas.clientHeight || 800;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const scale = (w / 360) * zoom;
  const px = (lon) => w / 2 + (lon - focus[0]) * scale;
  const py = (lat) => h / 2 - (lat - focus[1]) * scale;

  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, w, h);

  // Only trace what can be seen: at 1419 polygons, culling off-screen shapes is
  // the difference between a smooth repaint and a visible stall.
  const lonLo = focus[0] - (w / 2) / scale - 2;
  const lonHi = focus[0] + (w / 2) / scale + 2;
  const latLo = focus[1] - (h / 2) / scale - 2;
  const latHi = focus[1] + (h / 2) / scale + 2;

  const tracePoly = (poly, shift) => {
    ctx.beginPath();
    for (const r of poly) {
      for (let i = 0; i < r.length; i++) {
        const x = px(r[i][0] + shift);
        const y = py(r[i][1]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
  };

  const visible = (poly, shift) => {
    const outer = poly[0];
    let minLon = Infinity; let maxLon = -Infinity;
    let minLat = Infinity; let maxLat = -Infinity;
    for (const [lon, lat] of outer) {
      const l = lon + shift;
      if (l < minLon) minLon = l;
      if (l > maxLon) maxLon = l;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    return maxLon >= lonLo && minLon <= lonHi && maxLat >= latLo && minLat <= latHi;
  };

  // Drawn three times across so the chart wraps at the dateline rather than
  // ending in open sea. Holes come from the data, so a single evenodd fill
  // leaves the lakes as water.
  const polys = landRings();
  for (const shift of [-360, 0, 360]) {
    const shown = polys.filter((p) => visible(p, shift));
    if (!shown.length) continue;

    // A soft shelf under each coast, the way a chart shades shallow water.
    ctx.save();
    ctx.shadowColor = shelf;
    ctx.shadowBlur = 16;
    ctx.fillStyle = land;
    for (const poly of shown) { tracePoly(poly, shift); ctx.fill('evenodd'); }
    ctx.restore();

    ctx.strokeStyle = coast;
    ctx.lineWidth = 0.8;
    for (const poly of shown) { tracePoly(poly, shift); ctx.stroke(); }
  }

  // The theatre this briefing is set in, ringed on the chart.
  if (marker) {
    const mx = px(marker[0]);
    const my = py(marker[1]);
    ctx.strokeStyle = '#e6cf9c';
    ctx.lineWidth = 1.5;
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
      ctx.font = '600 13px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.fillStyle = '#e6cf9c';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(markerName.toUpperCase(), mx, my + 32);
      ctx.textAlign = 'start';
    }
  }

  if (!showPlaces) return;

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

  const spots = [];
  for (const [list, kind] of [[CAPITALS, 'capital'], [BASES, 'base']]) {
    for (const [name, lon, lat] of list) {
      for (const shift of [-360, 0, 360]) {
        const x = px(lon + shift);
        const y = py(lat);
        if (x < -80 || x > w + 80 || y < -20 || y > h + 20) continue;
        spots.push({ name, x, y, kind });
      }
    }
  }

  for (const s of spots) {
    const isCapital = s.kind === 'capital';
    ctx.fillStyle = isCapital ? capital : base;
    if (isCapital) {
      // A capital gets a ringed square; a base a plain dot.
      ctx.fillRect(s.x - 2.5, s.y - 2.5, 5, 5);
      ctx.strokeStyle = capital;
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
    ctx.fillStyle = isCapital ? capital : base;
    ctx.fillText(s.name, spot[0], spot[1]);
  }
}
