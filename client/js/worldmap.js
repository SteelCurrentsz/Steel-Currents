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
  return pts;
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

const PORTS = [
  ['SCAPA FLOW', -3, 59], ['GIBRALTAR', -5, 36], ['HALIFAX', -63, 45],
  ['NEW YORK', -74, 41], ['DAKAR', -17, 15], ['FREETOWN', -13, 8],
  ['PEARL HARBOR', -158, 21], ['MIDWAY', -177, 28], ['RABAUL', 152, -4],
  ['SINGAPORE', 104, 1], ['TOKYO', 140, 36], ['MURMANSK', 33, 69],
];

/**
 * Paint the chart. `focus` is [lon, lat] at the centre and `zoom` scales the
 * projection — 1 fits all 360 degrees of longitude across the canvas width.
 */
export function drawWorld(canvas, opts = {}) {
  const {
    focus = [0, 8], zoom = 1,
    sea = '#0a1826', land = '#2e4860', coast = '#628aa3',
    grid = 'rgba(130, 165, 190, 0.12)', label = 'rgba(165, 190, 210, 0.55)',
    equator = 'rgba(150, 185, 210, 0.22)', tropic = 'rgba(140, 175, 200, 0.14)',
    shelf = 'rgba(90, 140, 175, 0.5)',
    dot = '#9c4747', showPorts = true,
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

  // Graticule every 15 degrees, with the equator, the prime meridian and the
  // tropics picked out — the lines a navigator would actually reference.
  const meridian = (lon) => { const x = px(lon); ctx.moveTo(x, 0); ctx.lineTo(x, h); };
  const parallel = (lat) => { const y = py(lat); ctx.moveTo(0, y); ctx.lineTo(w, y); };

  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let lon = -180; lon <= 180; lon += 15) if (lon !== 0) meridian(lon);
  for (let lat = -75; lat <= 75; lat += 15) if (lat !== 0) parallel(lat);
  ctx.stroke();

  ctx.strokeStyle = tropic;
  ctx.setLineDash([5, 5]);
  ctx.beginPath(); parallel(23.44); parallel(-23.44); ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = equator;
  ctx.beginPath(); parallel(0); meridian(0); ctx.stroke();

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

  if (!showPorts) return;
  ctx.font = '11px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.textBaseline = 'middle';
  for (const [name, lon, lat] of PORTS) {
    for (const shift of [-360, 0, 360]) {
      const x = px(lon + shift);
      const y = py(lat);
      if (x < -60 || x > w + 60 || y < -20 || y > h + 20) continue;
      ctx.fillStyle = dot;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = label;
      ctx.fillText(name, x + 6, y);
    }
  }
}
