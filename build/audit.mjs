// Walk round a ship and look for the two faults a captain sees first: daylight
// where there should be plate, and things standing in the air.
//
//   node build/audit.mjs                # every ship in the yard
//   node build/audit.mjs takao yamato   # just these
//   VERBOSE=1 node build/audit.mjs iowa # every flagged point, not a summary
//
// Two sweeps, both over the model exactly as the renderer draws it -- welded,
// single-sided, insides included only where the plating lets them be seen.
//
// SEE-THROUGH. Parallel rays from all six directions, half a metre apart.
// For each one the nearest surface of any kind is compared with the nearest
// surface the renderer would actually draw (a front face, or any face of a
// double-sided material). Where those disagree by more than a hand's breadth
// the eye looks through something: a house lofted inside out, a deck seen
// from below with no underside, a shell band with a station missing from it,
// a hole where two pieces were meant to meet and do not.
//
// MID-AIR. Every piece she was welded out of -- the register mergeStatic
// leaves on the buffer -- and every mounting that still moves, as a box.
// A piece is held up if something else stands under a fifth of its footprint
// from below, hangs over it from above (a bracket under a sponson), or if a
// ray fired up from just under its own foot, at its centre or just outside
// its edges, meets a surface at foot height -- which is what standing on a
// deck looks like. Spars are let off: a yard, a barrel, a boom lies across the
// air on purpose.

import * as THREE from '../vendor/three.module.js';
import { buildShip } from '../client/js/render/ships.js';
import { SHIP_ORDER, SHIP_CLASSES } from '../shared/ships.js';

const VERBOSE = !!process.env.VERBOSE;
const PITCH = Number(process.env.PITCH || 0.5);
const GAP = 0.35;             // how far apart "there" and "drawn" may be

// ------------------------------------------------------------ triangles --

function soup(group) {
  group.updateMatrixWorld(true);
  const tris = [];          // flat: ax ay az bx by bz cx cy cz, per triangle
  const twoSided = [];      // per triangle
  const owner = [];         // per triangle: piece index or -1
  const pieces = [];        // { name, min, max, moving }
  const v = new THREE.Vector3();
  const meshes = [];
  // Which welded assemblies were aeroplanes: planekit marks the group it
  // builds into, and the weld leaves the group behind with its pieceId on it.
  const isPlane = (o) => {
    for (let p = o; p; p = p.parent) {
      if (p.userData && (p.userData.plane || p.userData.kind || p.userData.parts)) return true;
    }
    return false;
  };
  const planeIds = new Set();
  group.traverse((o) => {
    if (o.userData && o.userData.pieceId && isPlane(o)) planeIds.add(o.userData.pieceId);
  });
  group.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry) return;
    for (let p = o; p; p = p.parent) if (p.visible === false) return;
    if (o.userData.mergeKey === 'in') return;
    for (let p = o; p; p = p.parent) if (p.userData && p.userData.inside) return;
    meshes.push(o);
  });
  for (const mesh of meshes) {
    const mats = [].concat(mesh.material);
    if (mats.every((m) => m && m.transparent)) continue;
    const ds = mats.some((m) => m && m.side === THREE.DoubleSide);
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    if (!pos) continue;
    const m = mesh.matrixWorld;
    const world = new Float64Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      world[i * 3] = v.x; world[i * 3 + 1] = v.y; world[i * 3 + 2] = v.z;
    }
    // Which piece each vertex is.
    const pieceOfVertex = new Int32Array(pos.count).fill(-1);
    let moving = false;
    for (let p = mesh; p; p = p.parent) if (p.userData && p.userData.dynamic) { moving = true; break; }
    if (mesh.userData.pieces) {
      for (const pc of mesh.userData.pieces) {
        const idx = pieces.length;
        pieces.push({ name: pc.name || '', min: [Infinity, Infinity, Infinity],
          max: [-Infinity, -Infinity, -Infinity], moving,
          from: planeIds.has(pc.owner) ? 'aircraft' : 'ship' });
        for (let i = pc.v0; i < pc.v0 + pc.vn; i++) pieceOfVertex[i] = idx;
      }
    } else {
      const idx = pieces.length;
      pieces.push({ name: mesh.name || '', min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity], moving, from: isPlane(mesh) ? 'aircraft' : 'ship' });
      pieceOfVertex.fill(idx);
    }
    for (let i = 0; i < pos.count; i++) {
      const pc = pieces[pieceOfVertex[i]];
      if (!pc) continue;
      for (let k = 0; k < 3; k++) {
        const c = world[i * 3 + k];
        if (c < pc.min[k]) pc.min[k] = c;
        if (c > pc.max[k]) pc.max[k] = c;
      }
    }
    const push = (a, b, c) => {
      tris.push(world[a * 3], world[a * 3 + 1], world[a * 3 + 2],
        world[b * 3], world[b * 3 + 1], world[b * 3 + 2],
        world[c * 3], world[c * 3 + 1], world[c * 3 + 2]);
      twoSided.push(ds);
      owner.push(pieceOfVertex[a]);
    };
    if (geo.index) {
      const ix = geo.index;
      for (let i = 0; i + 2 < ix.count; i += 3) push(ix.getX(i), ix.getX(i + 1), ix.getX(i + 2));
    } else {
      for (let i = 0; i + 2 < pos.count; i += 3) push(i, i + 1, i + 2);
    }
  }
  return { tris, twoSided, owner, pieces, n: twoSided.length };
}

// --------------------------------------------------------------- grids --

// Axis-aligned rays only, so each axis gets a 2-D grid over the other two.
const AX = { x: [1, 2], y: [0, 2], z: [0, 1] };
const CELL = 1.0;

function makeGrid(S, axis) {
  const [u, w] = AX[axis];
  const T = S.tris;
  let umin = Infinity, umax = -Infinity, wmin = Infinity, wmax = -Infinity;
  for (let i = 0; i < S.n; i++) {
    for (let k = 0; k < 3; k++) {
      const pu = T[i * 9 + k * 3 + u], pw = T[i * 9 + k * 3 + w];
      if (pu < umin) umin = pu; if (pu > umax) umax = pu;
      if (pw < wmin) wmin = pw; if (pw > wmax) wmax = pw;
    }
  }
  const nu = Math.max(1, Math.ceil((umax - umin) / CELL) + 1);
  const nw = Math.max(1, Math.ceil((wmax - wmin) / CELL) + 1);
  const cells = new Array(nu * nw);
  for (let i = 0; i < S.n; i++) {
    let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      const pu = T[i * 9 + k * 3 + u], pw = T[i * 9 + k * 3 + w];
      if (pu < u0) u0 = pu; if (pu > u1) u1 = pu;
      if (pw < w0) w0 = pw; if (pw > w1) w1 = pw;
    }
    const iu0 = Math.floor((u0 - umin) / CELL), iu1 = Math.floor((u1 - umin) / CELL);
    const iw0 = Math.floor((w0 - wmin) / CELL), iw1 = Math.floor((w1 - wmin) / CELL);
    for (let a = iu0; a <= iu1; a++) {
      for (let b = iw0; b <= iw1; b++) {
        const c = a * nw + b;
        (cells[c] || (cells[c] = [])).push(i);
      }
    }
  }
  return { u, w, umin, wmin, nu, nw, cells };
}

/**
 * Every crossing of the ray along `axis` (direction `dir` = +1/-1) at (pu, pw):
 * [{ t, front, tri }], sorted by t, where t is the coordinate along the axis.
 */
function cross(S, G, axis, pu, pw) {
  const a = Math.floor((pu - G.umin) / CELL);
  const b = Math.floor((pw - G.wmin) / CELL);
  if (a < 0 || b < 0 || a >= G.nu || b >= G.nw) return [];
  const list = G.cells[a * G.nw + b];
  if (!list) return [];
  const [u, w] = AX[axis];
  const ax = 'xyz'.indexOf(axis);
  const T = S.tris;
  const out = [];
  for (const i of list) {
    const o = i * 9;
    const x0 = T[o + u], y0 = T[o + w], x1 = T[o + 3 + u], y1 = T[o + 3 + w], x2 = T[o + 6 + u], y2 = T[o + 6 + w];
    // Point-in-triangle in the (u, w) plane, with the winding as a sign.
    const d = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(d) < 1e-12) continue;
    // Barycentric weights of the three corners at (pu, pw).
    const w0 = ((x1 - pu) * (y2 - pw) - (x2 - pu) * (y1 - pw)) / d;
    const w1 = ((x2 - pu) * (y0 - pw) - (x0 - pu) * (y2 - pw)) / d;
    const w2 = 1 - w0 - w1;
    if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) continue;
    const t = w0 * T[o + ax] + w1 * T[o + 3 + ax] + w2 * T[o + 6 + ax];
    // The normal's component along the axis, from the winding. For an axis
    // ordered (u, w) as (x,z) for y: the cross product sign flips by axis.
    let na = d;
    if (axis === 'y') na = -d;          // (x, z) is a left-handed pair about y
    out.push({ t, na, i, two: S.twoSided[i] });
  }
  return out;
}

// --------------------------------------------------------- see-through --

function seeThrough(S, grids, box) {
  const flags = [];
  for (const [axis, dir] of [['x', -1], ['x', 1], ['y', -1], ['y', 1], ['z', -1], ['z', 1]]) {
    const G = grids[axis];
    const [u, w] = AX[axis];
    const umin = box.min.getComponent(u), umax = box.max.getComponent(u);
    const wmin = box.min.getComponent(w), wmax = box.max.getComponent(w);
    let n = 0;
    for (let pu = umin + PITCH / 2; pu < umax; pu += PITCH) {
      for (let pw = wmin + PITCH / 2; pw < wmax; pw += PITCH) {
        const hits = cross(S, grids[axis], axis, pu, pw);
        if (!hits.length) continue;
        // Travelling along -dir means the far end in that coordinate comes
        // first: the ray comes from +infinity when dir = -1.
        hits.sort((p, q) => (dir < 0 ? p.t - q.t : q.t - p.t));
        const first = hits[0];
        // Drawn: a front face (normal against the ray) or a two-sided one.
        // Ray direction along the axis is -dir... define: camera at dir side.
        let seen = null;
        for (const h of hits) {
          // Normal along axis ~ h.na (sign). Facing the camera at side `dir`
          // means the normal points towards +dir.
          if (h.two || Math.sign(h.na) === dir) { seen = h; break; }
        }
        const gap = seen ? Math.abs(seen.t - first.t) : Infinity;
        if (gap > GAP) {
          const p = [0, 0, 0];
          p[u] = pu; p[w] = pw; p['xyz'.indexOf(axis)] = first.t;
          const pc = S.pieces[S.owner[first.i]];
          flags.push({ from: `${dir > 0 ? '+' : '-'}${axis}`, at: p, gap, piece: S.owner[first.i],
            of: pc ? pc.from : 'ship' });
          n++;
        }
      }
    }
  }
  return flags;
}

// -------------------------------------------------------------- mid-air --

function midAir(S, grids, loa) {
  const P = S.pieces;
  const span = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  const out = [];
  const G = grids.y;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    if (!Number.isFinite(p.min[0])) continue;
    const sz = [p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]];
    if (sz[0] * sz[1] * sz[2] < 0.4) continue;
    if (sz[2] > 40 || sz[0] > 40) continue;            // shell bands, decks, deck-length rails
    const thin = sz.filter((v) => v < 0.7).length >= 2;
    if (thin && sz[1] < 1.0) continue;                 // a spar
    const cx = (p.min[0] + p.max[0]) / 2, cz = (p.min[2] + p.max[2]) / 2;
    if (Math.abs(cz) > loa / 2 - 1) continue;
    // Under water nothing stands on anything: screws hang off their shafts,
    // bilge keels and rudders off the plating.
    if (p.max[1] < 0.3) continue;
    const foot = p.min[1];
    const area = Math.max(0.05, sz[0] * sz[2]);
    let under = 0;
    let held = false;
    for (let j = 0; j < P.length && !held; j++) {
      if (j === i) continue;
      const q = P[j];
      if (!Number.isFinite(q.min[0])) continue;
      const qs = [q.max[0] - q.min[0], q.max[1] - q.min[1], q.max[2] - q.min[2]];
      if (qs[2] > 40 || qs[0] > 40) continue;
      const over = span(p.min[0], p.max[0], q.min[0], q.max[0]) * span(p.min[2], p.max[2], q.min[2], q.max[2]);
      if (over <= 0) continue;
      const stands = q.min[1] < foot + 0.1 && q.max[1] > foot - 0.7 && q.min[1] < p.max[1] - 0.1;
      const hangs = q.min[1] <= p.max[1] + 0.2 && q.max[1] > p.max[1];
      if (!stands && !hangs) continue;
      under += over;
      if (under > area * 0.2) held = true;
    }
    if (!held) {
      // Ask the geometry itself: a surface at foot height under her middle,
      // or just outside each of her edges (a deck she stands on runs out
      // past her), or anything solid within 0.7 m below her.
      // A handful of points inside her footprint and just outside each edge.
      // Several, because a planked deck has a seam every plank and one ray
      // down a seam sees nothing.
      const probes = [
        [p.min[0] - 0.15, cz], [p.max[0] + 0.15, cz], [cx, p.min[2] - 0.15], [cx, p.max[2] + 0.15],
      ];
      for (const fx of [0.15, 0.5, 0.85]) {
        for (const fz of [0.15, 0.5, 0.85]) {
          probes.push([p.min[0] + sz[0] * fx, p.min[2] + sz[2] * fz]);
        }
      }
      // And a little off each, so a seam between two planks is not the answer.
      for (const [px, pz] of probes.slice()) probes.push([px + 0.11, pz + 0.07]);
      const top = p.max[1];
      for (const [px, pz] of probes) {
        const hits = cross(S, G, 'y', px, pz);
        for (const h of hits) {
          if (S.owner[h.i] === i) continue;
          if (h.t <= foot + 0.12 && h.t >= foot - 0.7) { held = true; break; }
          // Or hanging from something wide -- a flight deck, a boat deck --
          // that the box sweep above left out for being the length of her.
          if (h.t >= top - 0.12 && h.t <= top + 0.12) { held = true; break; }
        }
        if (held) break;
      }
    }
    if (!held) out.push({ name: p.name, at: [cx, foot, cz], size: sz, moving: p.moving, of: p.from });
  }
  return out;
}

// ---------------------------------------------------------------- run ----

/** Audit one built ship. Returns what was found, for a test or the CLI. */
export function auditBuilt(group, loa) {
  const S = soup(group);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < S.n; i++) {
    for (let k = 0; k < 3; k++) box.expandByPoint(v.set(S.tris[i * 9 + k * 3], S.tris[i * 9 + k * 3 + 1], S.tris[i * 9 + k * 3 + 2]));
  }
  const grids = { x: makeGrid(S, 'x'), y: makeGrid(S, 'y'), z: makeGrid(S, 'z') };
  const through = seeThrough(S, grids, box);
  const air = midAir(S, grids, loa);
  const clusters = [];
  for (const f of through) {
    let c = clusters.find((k) => k.from === f.from && k.of === f.of && Math.hypot(k.at[0] - f.at[0], k.at[1] - f.at[1], k.at[2] - f.at[2]) < 3.0);
    if (!c) { c = { from: f.from, of: f.of, at: f.at.slice(), n: 0, gap: 0 }; clusters.push(c); }
    c.n++; c.gap = Math.max(c.gap, f.gap);
  }
  clusters.sort((a, b) => b.n - a.n);
  const shipThrough = through.filter((f) => f.of !== 'aircraft');
  const shipAir = air.filter((a) => a.of !== 'aircraft');
  return { S, grids, through, clusters, air, shipThrough, shipAir, triangles: S.n, pieces: S.pieces.length };
}

export async function auditShip(id) {
  // `plane:kingfisher` audits one of planekit's aeroplanes on her own.
  if (id.startsWith('plane:')) {
    const planekit = await import('../client/js/render/planekit.js');
    const g = new THREE.Group();
    const p = planekit[id.slice(6)](g, 0, 0, 0, 0, {});
    if (p && p.isObject3D && !p.parent) g.add(p);
    g.updateMatrixWorld(true);
    // Aeroplanes are not welded, so mark every mesh as a piece of one.
    g.userData.plane = true;
    return auditBuilt(g, 1000);
  }
  const cls = SHIP_CLASSES[id];
  const built = buildShip(id);
  return auditBuilt(built.group, cls.hull.length);
}

const fmt = (p) => `(${p[0].toFixed(1)}, ${p[1].toFixed(1)}, ${p[2].toFixed(1)})`;

async function main() {
  const args = process.argv.slice(2);
  // Probe mode: every surface a ray meets, with what it belongs to.
  //   node build/audit.mjs iowa --probe y,3.2,-40   (axis, u, w)
  const pi = args.indexOf('--probe');
  if (pi >= 0) {
    const [axis, pu, pw] = args[pi + 1].split(',');
    const id = args.find((a, k) => k !== pi && k !== pi + 1);
    const r = await auditShip(id);
    const hits = cross(r.S, r.grids[axis], axis, Number(pu), Number(pw)).sort((a, b) => a.t - b.t);
    for (const h of hits) {
      const pc = r.S.pieces[r.S.owner[h.i]];
      console.log(`  ${axis} = ${h.t.toFixed(2)}  ${h.na > 0 ? 'faces +' : 'faces -'}${axis}${h.two ? ' (two-sided)' : ''}  `
        + `${pc ? (pc.name || '(unnamed)') + ' ' + pc.min.map((x) => x.toFixed(1)) + ' .. ' + pc.max.map((x) => x.toFixed(1)) : ''}`);
    }
    return 0;
  }
  const ids = args.length ? args : SHIP_ORDER;
  let bad = 0;
  for (const id of ids) {
    const cls = SHIP_CLASSES[id];
    if (!cls && !id.startsWith('plane:')) { console.log(`no such ship: ${id}`); bad++; continue; }
    const t0 = Date.now();
    const r = await auditShip(id);
    if (id.startsWith('plane:')) {
      // On her own, an aeroplane is the subject rather than the passenger.
      r.shipThrough = r.through; r.shipAir = r.air;
      for (const c of r.clusters) c.of = 'ship';
    }
    const airThrough = r.through.length - r.shipThrough.length;
    const airAir = r.air.length - r.shipAir.length;
    console.log(`\n${cls ? cls.name : id} [${id}]  ${r.triangles} triangles, ${r.pieces} pieces, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    console.log(`  see-through: ${r.shipThrough.length} ray(s) in ${r.clusters.filter((c) => c.of !== 'aircraft').length} place(s)`
      + (airThrough ? `  (+${airThrough} on her aircraft, planekit's business)` : ''));
    for (const c of r.clusters.filter((c) => c.of !== 'aircraft').slice(0, VERBOSE ? 1000 : 12)) {
      console.log(`    from ${c.from}  ${String(c.n).padStart(4)} rays  at ${fmt(c.at)}  gap ${c.gap === Infinity ? 'open' : c.gap.toFixed(1) + ' m'}`);
    }
    console.log(`  mid-air: ${r.shipAir.length} piece(s)` + (airAir ? `  (+${airAir} on her aircraft)` : ''));
    for (const a of r.shipAir.slice(0, VERBOSE ? 1000 : 12)) {
      console.log(`    ${a.name || '(unnamed)'}${a.moving ? ' [moving]' : ''} foot at ${fmt(a.at)}  size ${a.size.map((x) => x.toFixed(1)).join('x')}`);
    }
    if (r.shipThrough.length || r.shipAir.length) bad++;
  }
  return bad ? 1 : 0;
}

if (process.argv[1] && process.argv[1].endsWith('audit.mjs')) main().then((code) => process.exit(code));
