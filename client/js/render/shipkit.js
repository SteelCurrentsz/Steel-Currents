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

export { box, cyl, tubeZ, tubeX, sphere, smooth, lerpTable, loftRings, ladder };
