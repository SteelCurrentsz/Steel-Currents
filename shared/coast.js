// The world's real coastline, in a form both ends of the game can use.
//
// The chart behind the briefing screens draws Natural Earth 1:50m; this is the
// same survey data, decoded once and handed to whoever asks. Two things need
// it. The deployment chart asks whether a point is water, so a captain cannot
// lay a corner of the battlefield in the middle of a continent. And the
// battlefield itself asks for the land inside a box, in metres, so that when
// the fleets sortie into the western approaches Brittany is there — the shape
// it really is, with shells stopping on it and hulls going aground on it.
//
// It lives in shared/ rather than in the client because the server is the
// authority on where the land is: both ends have to build the identical
// coastline from the same position or they will disagree about what is
// afloat.
//
// Coordinates are [longitude, latitude] until they reach the battlefield, and
// [x, z] in metres from its centre after that.

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
 *  that is a straight line clear across the chart. Carrying the offset instead
 *  lets the ring run past 180 and stay in one piece; the copies drawn at plus
 *  and minus 360 put it back on the far side. */
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
export function landRings() {
  if (RINGS) return RINGS;
  RINGS = LAND_TOPOLOGY.polygons.map((poly) => poly.map(ring));
  return RINGS;
}

/**
 * Land polygons with their bounding boxes, so a point can be tested against
 * the handful of shapes that could possibly contain it rather than all 1,419.
 */
let BOXED = null;
export function boxedLand() {
  if (BOXED) return BOXED;
  BOXED = landRings().map((poly) => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [lon, lat] of poly[0]) {
      if (lon < x0) x0 = lon;
      if (lon > x1) x1 = lon;
      if (lat < y0) y0 = lat;
      if (lat > y1) y1 = lat;
    }
    return { poly, x0, x1, y0, y1 };
  });
  return BOXED;
}

/** Crossing count of a ray east from the point over one ring. */
export function crossings(ring_, lon, lat) {
  let n = 0;
  for (let i = 0, j = ring_.length - 1; i < ring_.length; j = i++) {
    const [xi, yi] = ring_[i];
    const [xj, yj] = ring_[j];
    if ((yi > lat) === (yj > lat)) continue;
    const x = xi + ((lat - yi) / (yj - yi)) * (xj - xi);
    if (x > lon) n++;
  }
  return n;
}

/** True where there is sea. Holes count as water, so lakes are water. */
export function isWater(lon, lat) {
  if (lat > 90 || lat < -90) return false;
  for (const b of boxedLand()) {
    for (const shift of [-360, 0, 360]) {
      const l = lon + shift;
      if (l < b.x0 || l > b.x1 || lat < b.y0 || lat > b.y1) continue;
      let n = 0;
      for (const r of b.poly) n += crossings(r, l, lat);
      if (n % 2 === 1) return false;
    }
  }
  return true;
}

// -------------------------------------------------------- the battlefield --

const KM_PER_DEG = 111.32;

/**
 * The land inside a battlefield, in metres from its centre.
 *
 * The box is `half` metres from the centre to each border. Rings are projected
 * on a local equirectangular grid — over seventy thousand yards the error
 * against a proper projection is a few metres, which is less than the survey
 * data's own resolution — then clipped to a margin round the box and thinned
 * to a tolerance, because a coastline drawn to 1:50m carries points every few
 * hundred metres and the sim has no use for detail finer than a hull.
 *
 * Returns an array of rings, each an array of [x, z]. Holes come back as rings
 * of their own: a lake reads as land at this scale and there is nothing in the
 * game that can be floated on one, so the outer shape is what matters and the
 * hole is dropped.
 */
export function coastFor(lon, lat, half, { tolerance = 25, detail = 700, seed = 1 } = {}) {
  const mPerLat = KM_PER_DEG * 1000;
  const mPerLon = mPerLat * Math.max(0.02, Math.cos((lat * Math.PI) / 180));
  // A margin, so a shape that only clips the corner of the box still arrives
  // whole and is cut down by the clipper rather than dropped by the filter.
  const pad = half * 0.35;
  const dLat = (half + pad) / mPerLat;
  const dLon = (half + pad) / mPerLon;
  const lo = { lon: lon - dLon, lat: lat - dLat };
  const hi = { lon: lon + dLon, lat: lat + dLat };
  const lim = half + pad;

  const out = [];
  for (const b of boxedLand()) {
    for (const shift of [-360, 0, 360]) {
      if (b.x1 + shift < lo.lon || b.x0 + shift > hi.lon) continue;
      if (b.y1 < lo.lat || b.y0 > hi.lat) continue;
      // Every ring, holes included. A hole is water — the Seto Inland Sea, the
      // Caspian, the Great Lakes all arrive as one — and the chart lets a
      // captain lay a battlefield on them, so the battlefield has to have
      // water there too. They are filled even-odd downstream, so the outline
      // and the holes in it can go into the same flat list.
      for (const r of b.poly) {
        const pts = [];
        for (let i = 0; i < r.length; i++) {
          pts.push([
            (r[i][0] + shift - lon) * mPerLon,
            (r[i][1] - lat) * mPerLat,
          ]);
        }
        for (const piece of clipRing(pts, lim)) {
          const thin = simplify(piece, tolerance);
          if (thin.length >= 3 && Math.abs(area(thin)) > tolerance * tolerance * 4) {
            out.push(detail ? refine(thin, seed, detail) : thin);
          }
        }
      }
    }
  }
  return out;
}

// ------------------------------------------------------------- the shore --

/** A hash in [0,1) from three numbers. Both ends run it, so both ends get the
 *  same coastline out of the same battlefield. */
function hash3(a, b, c) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
        ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Put the shore back on a surveyed outline.
 *
 * The chart data is 1:50m: a vertex every kilometre or two, which is the right
 * amount of information for a chart and far too little for something a
 * destroyer is going to run aground on — Guadalcanal arrives as seven corners.
 * Every edge longer than `step` is broken up and the new points are pushed off
 * the line by a hash of where they are, so a headland gets bays and spits at
 * the scale a ship sees them while the island stays the shape the survey says
 * it is. The displacement is a hash of the position and the battle's seed,
 * which is what lets the server and the client agree on where the rocks are.
 */
function refine(pts, seed, step) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    out.push(a);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < step * 1.5) continue;
    const cuts = Math.min(24, Math.round(len / step));
    // Along the edge, and square to it.
    const ux = dx / len;
    const uy = dy / len;
    // A modest amplitude: enough for a bay, not enough to tie the ring in a
    // knot where two edges of the same island run close together.
    const amp = Math.min(len * 0.11, 320);
    // Keyed on the ends of the edge rather than on its index, so the two rings
    // that share a coastline are displaced the same way along it.
    const key = Math.round(a[0] + b[0]) ^ Math.round(a[1] + b[1]);
    for (let k = 1; k < cuts; k++) {
      const t = k / cuts;
      // Two octaves, and nothing at the ends: the surveyed corners stay put.
      const w = Math.sin(Math.PI * t);
      const h1 = hash3(key, k, seed) - 0.5;
      const h2 = hash3(key, k * 7 + 3, seed ^ 0x5bf03635) - 0.5;
      const d = (h1 + h2 * 0.5) * amp * w * 1.4;
      out.push([a[0] + dx * t - uy * d, a[1] + dy * t + ux * d]);
    }
  }
  return out;
}

/** Twice the signed area of a ring, which is all the sign and scale we need. */
function area(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return a / 2;
}

/**
 * Cut a ring down to the square of side 2*lim about the origin.
 *
 * Sutherland–Hodgman against the four edges. A concave shape can come back
 * with slivers running along the border where two separate lobes were joined
 * up, which is harmless: they are outside the playing area and hidden under
 * the border wall.
 */
function clipRing(pts, lim) {
  let poly = pts;
  const edges = [
    [(p) => p[0] >= -lim, (a, b) => cut(a, b, 0, -lim)],
    [(p) => p[0] <= lim, (a, b) => cut(a, b, 0, lim)],
    [(p) => p[1] >= -lim, (a, b) => cut(a, b, 1, -lim)],
    [(p) => p[1] <= lim, (a, b) => cut(a, b, 1, lim)],
  ];
  for (const [inside, meet] of edges) {
    const next = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j];
      const b = poly[i];
      const ain = inside(a);
      const bin = inside(b);
      if (bin) {
        if (!ain) next.push(meet(a, b));
        next.push(b);
      } else if (ain) {
        next.push(meet(a, b));
      }
    }
    poly = next;
    if (!poly.length) return [];
  }
  return [poly];
}

/** Where the segment a->b crosses axis `k` at `v`. */
function cut(a, b, k, v) {
  const t = (v - a[k]) / (b[k] - a[k]);
  return k === 0
    ? [v, a[1] + (b[1] - a[1]) * t]
    : [a[0] + (b[0] - a[0]) * t, v];
}

/**
 * Ramer–Douglas–Peucker on a closed ring.
 *
 * A ring's first and last points are the same one, so run straight down it and
 * the chord is a point and every vertex measures zero from it — the whole
 * island collapses to a line. It is split at the vertex furthest from the
 * first and the two halves are run separately.
 */
function simplify(pts, eps) {
  if (pts.length < 8) return pts;
  let far = 1;
  let fd = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > fd) { fd = d; far = i; }
  }
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[far] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, far], [far, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    if (i1 <= i0 + 1) continue;
    const [x0, y0] = pts[i0];
    const [x1, y1] = pts[i1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    let idx = -1;
    let best = eps;
    for (let i = i0 + 1; i < i1; i++) {
      const d = Math.abs((pts[i][0] - x0) * dy - (pts[i][1] - y0) * dx) / len;
      if (d > best) { best = d; idx = i; }
    }
    if (idx > 0) {
      keep[idx] = 1;
      stack.push([i0, idx], [idx, i1]);
    }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}
