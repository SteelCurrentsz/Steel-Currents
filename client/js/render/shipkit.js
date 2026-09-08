// The pieces every ship in the yard is built out of.
//
// Boxes and cylinders placed by hand, a superelliptic loft for anything with a
// rounded corner, and the ladders that are on every deck of every ship there
// has ever been. They live here rather than in each hull's own file because
// three copies of a loft are three chances to wind one of them inside out --
// which is exactly what happened to a bridge and five gunhouses.

import * as THREE from '../../../vendor/three.module.js';

// ------------------------------------------------------------ primitives --

function box(g, m, w, h, d, x, y, z, ry = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.rotation.y = ry;
  g.add(o);
  return o;
}

function cyl(g, m, rt, rb, h, x, y, z, seg = 12) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  o.position.set(x, y, z);
  g.add(o);
  return o;
}

/** A tube lying fore and aft: a boom, a rail, a gun barrel, a torpedo. */
function tubeZ(g, m, r, len, x, y, z, seg = 10) {
  const o = cyl(g, m, r, r, len, x, y, z, seg);
  o.rotation.x = Math.PI / 2;
  return o;
}

/** A tube lying athwartships: an axle, a depth charge on its rack. */
function tubeX(g, m, r, len, x, y, z, seg = 10) {
  const o = cyl(g, m, r, r, len, x, y, z, seg);
  o.rotation.z = Math.PI / 2;
  return o;
}

function sphere(g, m, r, x, y, z, seg = 10) {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg / 2)), m);
  o.position.set(x, y, z);
  g.add(o);
  return o;
}

/** Smoothstep, for anything that has to start and stop rather than snap. */
function smooth(k) { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); }

/** Read a table of [t, value] at t, with a smooth blend between entries. */
function lerpTable(table, t) {
  if (t <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const [t1, v1] = table[i];
    if (t > t1) continue;
    const [t0, v0] = table[i - 1];
    return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0));
  }
  return last[1];
}

/**
 * A stack of superelliptic rings, lofted into a closed shell with a flat top.
 *
 * Every deckhouse on her and every gunhouse is one of these: a rounded-corner
 * box, which is what naval structures actually are. Rings run bottom to top as
 * `[halfWidth, halfDepth, zCentre, y]`.
 *
 * The winding is the whole reason this is one function and not three copies.
 * Wound the wrong way, a deckhouse's faces all look inward, the single-sided
 * materials cull them, and you see straight through the ship -- which is what
 * the bridge and all five gunhouses were doing.
 */
function loftRings(g, m, rings, opts = {}) {
  const N = opts.n || 18;
  const px = opts.px === undefined ? 0.5 : opts.px;
  const pz = opts.pz === undefined ? 0.55 : opts.pz;
  const pos = [];
  const idx = [];
  for (const [hw, hd, zc, y] of rings) {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const c = Math.cos(a);
      const s2 = Math.sin(a);
      pos.push(hw * Math.sign(s2) * Math.pow(Math.abs(s2), px), y,
        zc + hd * Math.sign(c) * Math.pow(Math.abs(c), pz));
    }
  }
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a = r * N + i;
      const b = r * N + j;
      const c = (r + 1) * N + i;
      const d = (r + 1) * N + j;
      // Outboard. The rings run +z round to +x, so the top vertex has to come
      // second for the cross product to point away from the centreline.
      idx.push(a, d, c, a, b, d);
    }
  }
  if (opts.cap !== false) {
    const top = (rings.length - 1) * N;
    const [, , zc, y] = rings[rings.length - 1];
    const hub = pos.length / 3;
    pos.push(0, y, zc);
    for (let i = 0; i < N; i++) idx.push(hub, top + i, top + ((i + 1) % N));
  }
  if (opts.floor) {
    const [, , zc, y] = rings[0];
    const hub = pos.length / 3;
    pos.push(0, y, zc);
    for (let i = 0; i < N; i++) idx.push(hub, ((i + 1) % N), i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, m);
  g.add(mesh);
  return mesh;
}

/**
 * A closed plan outline, extruded through a stack of heights.
 *
 * `loftRings` can only make a rounded-corner box, which is why every bridge
 * built out of it comes out as blocks stacked on blocks. A real bridge front
 * is a bullnose: a rounded face carried round on to straight sides and closed
 * by a square back. This takes that outline directly.
 *
 * Layers run bottom to top as `{ pts, y }`, all with the same number of
 * points, so a level can be drawn in above its own foot to overhang or set
 * back. The outline is wound to face outboard whichever way it was handed in.
 */
function loftShape(g, m, layers, opts = {}) {
  const N = layers[0].pts.length;
  let pts = layers.map((l) => l.pts);
  let area = 0;
  for (let i = 0; i < N; i++) {
    const [x0, z0] = pts[0][i];
    const [x1, z1] = pts[0][(i + 1) % N];
    area += x0 * z1 - x1 * z0;
  }
  // Outboard faces want the outline running front -> starboard -> back, which
  // is the negative direction in the (x, z) plane.
  if (area > 0) pts = pts.map((p) => p.slice().reverse());
  const pos = [];
  const idx = [];
  for (let r = 0; r < layers.length; r++) {
    for (const [x, z] of pts[r]) pos.push(x, layers[r].y, z);
  }
  for (let r = 0; r < layers.length - 1; r++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a = r * N + i;
      const b = r * N + j;
      const c = (r + 1) * N + i;
      const d = (r + 1) * N + j;
      idx.push(a, d, c, a, b, d);
    }
  }
  const hubOf = (r) => {
    let sx = 0;
    let sz = 0;
    for (const [x, z] of pts[r]) { sx += x; sz += z; }
    return [sx / N, sz / N];
  };
  if (opts.cap !== false) {
    const r = layers.length - 1;
    const top = r * N;
    const [hx, hz] = hubOf(r);
    const hub = pos.length / 3;
    pos.push(hx, layers[r].y, hz);
    for (let i = 0; i < N; i++) idx.push(hub, top + i, top + ((i + 1) % N));
  }
  if (opts.floor) {
    const [hx, hz] = hubOf(0);
    const hub = pos.length / 3;
    pos.push(hx, layers[0].y, hz);
    for (let i = 0; i < N; i++) idx.push(hub, ((i + 1) % N), i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, m);
  g.add(mesh);
  return mesh;
}

/**
 * The plan of a deckhouse: an elliptical bullnose forward, straight sides, and
 * a back that is either square or rounded the same way.
 *
 * `arc` is how many points go into each rounded end, so two plans built with
 * the same `arc` can be lofted between.
 */
function planHouse(o) {
  const arc = o.arc || 9;
  const hw = o.hw;
  const nose = o.nose === undefined ? hw : o.nose;
  const tail = o.tail || 0;
  const zn = o.zFront - nose;
  const zt = o.zBack + tail;
  const pts = [];
  // The starboard half of the bullnose, from right ahead round to the side.
  for (let i = 0; i <= arc; i++) {
    const th = (i / arc) * (Math.PI / 2);
    pts.push([hw * Math.sin(th), zn + nose * Math.cos(th)]);
  }
  // Down the starboard side, across the back and up to the port side.
  for (let i = 0; i <= 2 * arc; i++) {
    const ph = (i / (2 * arc)) * Math.PI;
    pts.push([hw * Math.cos(ph), zt - tail * Math.sin(ph)]);
  }
  // And the port half of the bullnose, stopping short of right ahead.
  for (let i = 0; i < arc; i++) {
    const th = (i / arc) * (Math.PI / 2);
    pts.push([-hw * Math.cos(th), zn + nose * Math.sin(th)]);
  }
  return pts;
}

/**
 * An inclined ladder: two stringers, a run of treads and a handrail each side.
 *
 * A ship is covered in these and they are the first thing that gives away a
 * flat-shaded box as a model rather than a ship. Drawn as one tilted plank,
 * which is what this was, it reads as a plank.
 */
function ladder(g, m, x, y0, y1, z0, z1) {
  const rise = y1 - y0;
  const run = z1 - z0;
  const len = Math.hypot(rise, run);
  const ang = Math.atan2(rise, run);
  const mid = [x, (y0 + y1) / 2, (z0 + z1) / 2];
  for (const off of [-0.34, 0.34]) {
    const st = box(g, m, 0.09, 0.16, len, x + off, mid[1], mid[2]);
    st.rotation.x = -ang;
    const rail = box(g, m, 0.06, 0.06, len, x + off * 1.05, mid[1] + 0.85, mid[2]);
    rail.rotation.x = -ang;
    for (let i = 0; i <= 3; i++) {
      const f = i / 3;
      cyl(g, m, 0.05, 0.05, 0.9, x + off * 1.03, y0 + rise * f + 0.42, z0 + run * f, 6);
    }
  }
  const steps = Math.max(4, Math.round(len / 0.3));
  for (let i = 1; i < steps; i++) {
    const f = i / steps;
    box(g, m, 0.72, 0.05, 0.2, x, y0 + rise * f, z0 + run * f);
  }
}


// ------------------------------------------------------- fairing a table --
//
// Reading a table of offsets as a fair line.
//
// A smoothstep between two entries is flat at both ends of every span, which
// on a deckhouse nobody can see and on a hull is the difference between a line
// and a flight of steps: the curve stops dead at every station and then
// hurries to the next one, so a deck edge comes out scalloped -- a bulge at
// each offset with a flat between. A shipwright would call that an unfair line
// and send it back to the loft floor.
//
// This is the monotone cubic through the same offsets: it passes through every
// one of them, takes its slope at each from the two spans either side, and is
// held back where that would make it overshoot -- so a table that only narrows
// gives a line that only narrows, and there is no hollow between stations that
// was never drawn.
const FAIR_SLOPES = new Map();
function fairSlopes(tab) {
  let m = FAIR_SLOPES.get(tab);
  if (m) return m;
  const n = tab.length;
  const d = [];
  for (let i = 0; i < n - 1; i++) {
    d.push((tab[i + 1][1] - tab[i][1]) / (tab[i + 1][0] - tab[i][0]));
  }
  m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (d[i - 1] + d[i]) / 2;
  // Fritsch-Carlson: pull the slopes in wherever the cubic would otherwise
  // bulge past the offsets it is drawn through.
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    if (a < 0) m[i] = 0;
    if (b < 0) m[i + 1] = 0;
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      m[i] = k * a * d[i];
      m[i + 1] = k * b * d[i];
    }
  }
  FAIR_SLOPES.set(tab, m);
  return m;
}

/** Read a table of offsets at `t`, as a fair curve through them. */
function fairTable(tab, t) {
  const n = tab.length;
  if (t <= tab[0][0]) return tab[0][1];
  if (t >= tab[n - 1][0]) return tab[n - 1][1];
  const m = fairSlopes(tab);
  let i = 0;
  while (i < n - 2 && t > tab[i + 1][0]) i++;
  const h = tab[i + 1][0] - tab[i][0];
  const u = (t - tab[i][0]) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * tab[i][1]
    + (u3 - 2 * u2 + u) * h * m[i]
    + (-2 * u3 + 3 * u2) * tab[i + 1][1]
    + (u3 - u2) * h * m[i + 1];
}

export {
  box, cyl, tubeZ, tubeX, sphere, smooth, lerpTable, loftRings, loftShape,
  planHouse, ladder, fairTable,
};
