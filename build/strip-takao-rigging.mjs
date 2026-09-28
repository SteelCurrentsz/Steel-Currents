// Take the rigging off the Takao's reference sculpt, before it is decimated.
//
//   node build/strip-takao-rigging.mjs <sculpt.glb> <out-dir>
//
// The owner's sculpt of her (a single welded mesh of about a million
// triangles, not committed: it is 24 MB) carries every wire she was rigged
// with -- stays from her stem and her stern to both mastheads, the aerials
// strung between the masts, and the lead-ins hanging off them -- as tubes as
// thick as a man, fused into the masts and the deck. The owner asked for her
// without them. This writes two meshes into <out-dir>:
//
//   takao-stripped.glb      the whole of her, wires and all loose ends off
//   takao-turret-source.glb the lengths of her with her five turrets on
//                           them, from the same mesh
//
// which are then decimated -- the ship to the budget the fleet renders at,
// her turrets much less, because they are what a captain looks at down the
// barrel when he is laying one:
//
//   npx @gltf-transform/cli simplify <out>/takao-stripped.glb \
//       assets/models/takao-hull.glb --ratio 0.055 --error 0.0012
//   npx @gltf-transform/cli simplify <out>/takao-turret-source.glb \
//       assets/models/takao-turrets.glb --ratio 0.12 --error 0.0006
//
// and build/prepare-takao-hull.mjs goes on from there. Coordinates here are
// the sculpt's own: length along X with her bow at -X, Y up, beam along Z,
// about 1.9 units stem to stern.
//
// How a wire is told from a mast: every wire on her is a straight line. So
// each point is asked what shape the surface round it has (the spread of its
// neighbours, twelve thousandths across: all of it along one axis is a thin
// tube), and which way that tube runs. A tube running fore and aft or on a
// diagonal is a wire; one standing vertical is a mast or a staff, and one
// running athwartships is a yard -- except between the funnels, where the
// aerials' lead-ins hang straight down off wires. Lines are grown from those
// points, carried on along themselves for as long as there is wire there (a
// wire running close beside its twin stops looking like a line to the local
// shape, but it is still on the line), and every triangle inside a narrow
// tube round a line goes. Three passes, because taking one of a pair of wires
// away is what makes the other look like a line. What is then left hanging
// in the air on its own goes too, and the few ends no line reached are taken
// off by hand, below.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { readGlb } from './sculpt.mjs';

const [SRC, OUT] = process.argv.slice(2);
if (!SRC || !OUT) {
  console.error('usage: node build/strip-takao-rigging.mjs <sculpt.glb> <out-dir>');
  process.exit(1);
}

const R = 0.012;          // neighbourhood for the local shape
const LIN = 0.2;          // lambda2 / lambda1 under this is a line
const TUBE = 0.0042;      // what goes round a found wire
const FIT = 0.0035;       // how close a point is to be part of a line
// Between the funnels the aerials' lead-ins hang straight down.
const LEADIN = { x0: -0.10, x1: 0.28, y0: 0.025 };

const raw = readGlb(SRC);
const P = raw.pos, N = raw.nrm, I = raw.idx;
const nv = P.length / 3, nt = I.length / 3;
console.log('sculpt', nv, 'vertices', nt, 'triangles');

const inv = 1 / R;
const ck = (a, b, c) => ((a + 1024) * 2048 + (b + 1024)) * 2048 + (c + 1024);
const cells = new Map();
for (let i = 0; i < nv; i++) {
  const k = ck(Math.floor(P[i * 3] * inv), Math.floor(P[i * 3 + 1] * inv), Math.floor(P[i * 3 + 2] * inv));
  let c = cells.get(k);
  if (!c) cells.set(k, (c = []));
  c.push(i);
}

/** Symmetric 3x3 eigen-decomposition by Jacobi, largest first. */
function eig3(a) {
  const m = [[a[0], a[1], a[2]], [a[1], a[3], a[4]], [a[2], a[4], a[5]]];
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 12; sweep++) {
    if (Math.abs(m[0][1]) + Math.abs(m[0][2]) + Math.abs(m[1][2]) < 1e-18) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(m[p][q]) < 1e-20) continue;
      const th = (m[q][q] - m[p][p]) / (2 * m[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const a1 = m[k][p], b1 = m[k][q]; m[k][p] = c * a1 - s * b1; m[k][q] = s * a1 + c * b1; }
      for (let k = 0; k < 3; k++) { const a1 = m[p][k], b1 = m[q][k]; m[p][k] = c * a1 - s * b1; m[q][k] = s * a1 + c * b1; }
      for (let k = 0; k < 3; k++) { const a1 = v[k][p], b1 = v[k][q]; v[k][p] = c * a1 - s * b1; v[k][q] = s * a1 + c * b1; }
    }
  }
  const vals = [m[0][0], m[1][1], m[2][2]];
  const o = [0, 1, 2].sort((x, y) => vals[y] - vals[x]);
  return { vals: o.map((k) => vals[k]), vecs: o.map((k) => [v[0][k], v[1][k], v[2][k]]) };
}

/** Distance of vertex j from a line, and how far along it. */
const distToLine = (j, p, d) => {
  const dx = P[j * 3] - p[0], dy = P[j * 3 + 1] - p[1], dz = P[j * 3 + 2] - p[2];
  const t = dx * d[0] + dy * d[1] + dz * d[2];
  return [Math.hypot(dx - t * d[0], dy - t * d[1], dz - t * d[2]), t];
};

/**
 * One pass: find the wires among the vertices still `alive`, and mark every
 * vertex inside a tube round one in `inTube`. Returns how many were found.
 */
function pass(alive, inTube) {
  // Local shape: which points are on a thin line, and which way it runs.
  const axis = new Float32Array(nv * 3);
  const cand = new Uint8Array(nv);
  const r2 = R * R;
  for (let i = 0; i < nv; i++) {
    if (!alive[i]) continue;
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const cx = Math.floor(x * inv), cy = Math.floor(y * inv), cz = Math.floor(z * inv);
    let n = 0, mx = 0, my = 0, mz = 0;
    const pts = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const list = cells.get(ck(cx + a, cy + b, cz + c));
      if (!list) continue;
      for (const j of list) {
        if (!alive[j]) continue;
        const dx = P[j * 3] - x, dy = P[j * 3 + 1] - y, dz = P[j * 3 + 2] - z;
        if (dx * dx + dy * dy + dz * dz > r2) continue;
        pts.push(dx, dy, dz); mx += dx; my += dy; mz += dz; n++;
      }
    }
    if (n < 8) continue;
    mx /= n; my /= n; mz /= n;
    let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
    for (let k = 0; k < pts.length; k += 3) {
      const dx = pts[k] - mx, dy = pts[k + 1] - my, dz = pts[k + 2] - mz;
      xx += dx * dx; xy += dx * dy; xz += dx * dz; yy += dy * dy; yz += dy * dz; zz += dz * dz;
    }
    const e = eig3([xx / n, xy / n, xz / n, yy / n, yz / n, zz / n]);
    if (!(e.vals[0] > 0) || e.vals[1] / e.vals[0] >= LIN || e.vals[0] <= r2 / 12) continue;
    const [ax, ay, az] = e.vecs[0];
    axis[i * 3] = ax; axis[i * 3 + 1] = ay; axis[i * 3 + 2] = az;
    const leadin = x > LEADIN.x0 && x < LEADIN.x1 && y > LEADIN.y0 && Math.abs(ay) >= 0.9;
    if ((Math.abs(ay) < 0.9 && Math.abs(az) < 0.7) || leadin) cand[i] = 1;
  }
  const pool = [];
  for (let i = 0; i < nv; i++) if (cand[i]) pool.push(i);

  // Grow lines out of the candidates, from the highest first: the aerials and
  // the stays' upper ends are the cleanest lines she has.
  const owner = new Int32Array(nv).fill(-1);
  const tried = new Uint8Array(nv);
  const lines = [];
  pool.sort((a, b) => P[b * 3 + 1] - P[a * 3 + 1]);
  for (const s of pool) {
    if (owner[s] >= 0 || tried[s]) continue;
    tried[s] = 1;
    let p = [P[s * 3], P[s * 3 + 1], P[s * 3 + 2]];
    let d = [axis[s * 3], axis[s * 3 + 1], axis[s * 3 + 2]];
    let members = [];
    for (let it = 0; it < 4; it++) {
      members = [];
      for (const j of pool) {
        if (owner[j] >= 0) continue;
        const [dist] = distToLine(j, p, d);
        if (dist > FIT) continue;
        const al = Math.abs(axis[j * 3] * d[0] + axis[j * 3 + 1] * d[1] + axis[j * 3 + 2] * d[2]);
        if (al < 0.95) continue;
        members.push(j);
      }
      if (members.length < 30) break;
      let mx = 0, my = 0, mz = 0;
      for (const j of members) { mx += P[j * 3]; my += P[j * 3 + 1]; mz += P[j * 3 + 2]; }
      mx /= members.length; my /= members.length; mz /= members.length;
      let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
      for (const j of members) {
        const dx = P[j * 3] - mx, dy = P[j * 3 + 1] - my, dz = P[j * 3 + 2] - mz;
        xx += dx * dx; xy += dx * dy; xz += dx * dz; yy += dy * dy; yz += dy * dz; zz += dz * dz;
      }
      const e = eig3([xx, xy, xz, yy, yz, zz]);
      p = [mx, my, mz]; d = e.vecs[0];
    }
    if (members.length < 30) continue;
    // Split the run where it has a gap in it: two wires that happen to be in
    // line are two wires.
    const ts = members.map((j) => distToLine(j, p, d)[1]).sort((a, b) => a - b);
    let start = 0;
    const segs = [];
    for (let k = 1; k <= ts.length; k++) {
      if (k === ts.length || ts[k] - ts[k - 1] > 0.04) {
        if (k - start >= 20 && ts[k - 1] - ts[start] > 0.03) segs.push([ts[start], ts[k - 1]]);
        start = k;
      }
    }
    if (!segs.length) continue;
    // A wire goes up to a masthead or an aerial; a line along her deck edge,
    // a bilge keel or her keel does not.
    let top = -Infinity;
    for (const [t0, t1] of segs) top = Math.max(top, p[1] + d[1] * t0, p[1] + d[1] * t1);
    if (top < 0.0) continue;
    const id = lines.length;
    lines.push({ p, d, segs });
    for (const j of members) owner[j] = id;
  }

  // Each segment is carried on along its line for as long as there is wire
  // there. It stops at a gap, or where something solid closes round the line
  // -- a masthead, the deck, a funnel.
  const near = (x, y, z, rad) => {
    const out = [];
    const cx = Math.floor(x * inv), cy = Math.floor(y * inv), cz = Math.floor(z * inv);
    for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) for (let w = -1; w <= 1; w++) {
      const list = cells.get(ck(cx + u, cy + v, cz + w));
      if (!list) continue;
      for (const j of list) {
        if (!alive[j]) continue;
        const dx = P[j * 3] - x, dy = P[j * 3 + 1] - y, dz = P[j * 3 + 2] - z;
        if (dx * dx + dy * dy + dz * dz <= rad * rad) out.push(j);
      }
    }
    return out;
  };
  for (const L of lines) {
    for (const seg of L.segs) {
      for (const dir of [-1, 1]) {
        let t = dir < 0 ? seg[0] : seg[1];
        let gap = 0;
        for (let k = 0; k < 200; k++) {
          const tn = t + dir * 0.004;
          const x = L.p[0] + L.d[0] * tn, y = L.p[1] + L.d[1] * tn, z = L.p[2] + L.d[2] * tn;
          let onLine = 0, ring = 0;
          for (const j of near(x, y, z, 0.016)) {
            const [dist, tj] = distToLine(j, L.p, L.d);
            if (Math.abs(tj - tn) > 0.004) continue;
            if (dist < FIT) onLine++;
            else if (dist < 0.014 && owner[j] < 0) ring++;
          }
          if (ring > 6) break;
          if (onLine === 0) { if (++gap > 3) break; } else gap = 0;
          t = tn;
        }
        if (dir < 0) seg[0] = t; else seg[1] = t;
      }
    }
  }

  // Everything inside a tube round a segment goes.
  for (const L of lines) {
    for (const [t0, t1] of L.segs) {
      const a = t0 - 0.006, b = t1 + 0.006;
      const steps = Math.ceil((b - a) / (R * 0.5)) + 1;
      const seen = new Set();
      for (let k = 0; k <= steps; k++) {
        const t = a + ((b - a) * k) / steps;
        const x = L.p[0] + L.d[0] * t, y = L.p[1] + L.d[1] * t, z = L.p[2] + L.d[2] * t;
        const cx = Math.floor(x * inv), cy = Math.floor(y * inv), cz = Math.floor(z * inv);
        for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) for (let w = -1; w <= 1; w++) {
          const key = ck(cx + u, cy + v, cz + w);
          if (seen.has(key)) continue;
          seen.add(key);
          const list = cells.get(key);
          if (!list) continue;
          for (const j of list) {
            const [dist, tj] = distToLine(j, L.p, L.d);
            if (dist < TUBE && tj >= a && tj <= b) inTube[j] = 1;
          }
        }
      }
    }
  }
  return lines.length;
}

const inTube = new Uint8Array(nv);
const alive = new Uint8Array(nv).fill(1);
for (let k = 0; k < 3; k++) {
  const found = pass(alive, inTube);
  let dead = 0;
  for (let i = 0; i < nv; i++) if (inTube[i] && alive[i]) { alive[i] = 0; dead++; }
  console.log(`pass ${k + 1}: ${found} wires, ${dead} vertices`);
  if (!found) break;
}
const gone = new Uint8Array(nt);
let ng = 0;
for (let t = 0; t < nt; t++) {
  if (inTube[I[t * 3]] && inTube[I[t * 3 + 1]] && inTube[I[t * 3 + 2]]) { gone[t] = 1; ng++; }
}
console.log('wire triangles removed', ng);

// The last few ends the lines did not reach, read off the sculpt: the lead-ins
// where they came down either side of the after funnel, the spar the
// backstays come down to at her stern and the posts under it, the pole on
// No.2's roof the forestay's lead hung from, and the halyard off the
// foremast's after yard. A triangle goes if its middle is inside.
const ENDS = [
  { x0: 0.042, x1: 0.065, y0: 0.0, y1: 0.08, z0: -0.038, z1: -0.020 },
  { x0: 0.075, x1: 0.100, y0: 0.012, y1: 0.08, z0: 0.006, z1: 0.034 },
  { x0: 0.860, x1: 0.938, y0: -0.0885, y1: -0.045, z0: -0.006, z1: 0.006 },
  { x0: -0.498, x1: -0.470, y0: -0.029, y1: 0.03, z0: -0.012, z1: 0.012 },
  { x0: -0.128, x1: -0.113, y0: 0.062, y1: 0.101, z0: -0.007, z1: 0.007 },
];
// And the aerial leads that came down to the mainmast in a bundle, taken as a
// slab round their line in her side elevation, between two breadths. The
// derrick under them is a spar and stays.
const RUNS = [
  { a: [0.198, 0.033], b: [0.362, 0.127], r: 0.0075, z0: -0.013, z1: 0.015 },
  { a: [0.332, 0.095], b: [0.362, 0.121], r: 0.006, z0: -0.013, z1: 0.015 },
];
{
  let n = 0;
  for (let t = 0; t < nt; t++) {
    if (gone[t]) continue;
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]; cx += P[v * 3] / 3; cy += P[v * 3 + 1] / 3; cz += P[v * 3 + 2] / 3; }
    let hit = ENDS.some((b) => cx > b.x0 && cx < b.x1 && cy > b.y0 && cy < b.y1 && cz > b.z0 && cz < b.z1);
    if (!hit) {
      hit = RUNS.some((L) => {
        if (cz < L.z0 || cz > L.z1) return false;
        const ux = L.b[0] - L.a[0], uy = L.b[1] - L.a[1];
        const k = Math.max(0, Math.min(1, ((cx - L.a[0]) * ux + (cy - L.a[1]) * uy) / (ux * ux + uy * uy)));
        return Math.hypot(cx - (L.a[0] + ux * k), cy - (L.a[1] + uy * k)) < L.r;
      });
    }
    if (hit) { gone[t] = 1; n++; }
  }
  console.log('loose ends taken off', n);
}

// What is left of a wire the lines did not quite follow is now hanging in the
// air on its own, cut off at both ends: any piece of her that is not joined to
// the rest of her, and small, goes with it. Her floatplane, which the sculpt
// has sitting loose on the aircraft deck, is not small, and stays for
// build/prepare-takao-hull.mjs to deal with.
{
  const parent = new Int32Array(nv).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let t = 0; t < nt; t++) {
    if (gone[t]) continue;
    const a = find(I[t * 3]), b = find(I[t * 3 + 1]), c = find(I[t * 3 + 2]);
    parent[a] = b; parent[find(c)] = find(b);
  }
  const size = new Map();
  for (let t = 0; t < nt; t++) {
    if (gone[t]) continue;
    const r = find(I[t * 3]);
    size.set(r, (size.get(r) || 0) + 1);
  }
  let biggest = 0, root = -1;
  for (const [r, n] of size) if (n > biggest) { biggest = n; root = r; }
  let loose = 0;
  for (let t = 0; t < nt; t++) {
    if (gone[t]) continue;
    const r = find(I[t * 3]);
    if (r === root || size.get(r) > 5000) continue;
    gone[t] = 1; loose++;
  }
  console.log('loose pieces taken off with', loose, 'triangles; her body is', biggest);
}

function writeGlb(file, keepFn) {
  const idx = [];
  for (let t = 0; t < nt; t++) if (keepFn(t)) idx.push(I[t * 3], I[t * 3 + 1], I[t * 3 + 2]);
  const I2 = Uint32Array.from(idx);
  const pos = Buffer.from(P.buffer, P.byteOffset, P.byteLength);
  const nrm = Buffer.from(N.buffer, N.byteOffset, N.byteLength);
  const ib = Buffer.from(I2.buffer);
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i * 3 + k]); mx[k] = Math.max(mx[k], P[i * 3 + k]); }
  const j = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] }],
    buffers: [{ byteLength: pos.length + nrm.length + ib.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.length, target: 34962 },
      { buffer: 0, byteOffset: pos.length, byteLength: nrm.length, target: 34962 },
      { buffer: 0, byteOffset: pos.length + nrm.length, byteLength: ib.length, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: nv, type: 'VEC3', min: mn, max: mx },
      { bufferView: 1, componentType: 5126, count: nv, type: 'VEC3' },
      { bufferView: 2, componentType: 5125, count: I2.length, type: 'SCALAR' },
    ],
  };
  let js = Buffer.from(JSON.stringify(j));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const body = Buffer.concat([pos, nrm, ib]);
  const pad = Buffer.concat([body, Buffer.alloc((4 - (body.length % 4)) % 4)]);
  const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + js.length + 8 + pad.length, 8);
  const c1 = Buffer.alloc(8); c1.writeUInt32LE(js.length, 0); c1.writeUInt32LE(0x4e4f534a, 4);
  const c2 = Buffer.alloc(8); c2.writeUInt32LE(pad.length, 0); c2.writeUInt32LE(0x004e4942, 4);
  writeFileSync(file, Buffer.concat([head, c1, js, c2, pad]));
  console.log('wrote', file, I2.length / 3, 'triangles');
}

mkdirSync(OUT, { recursive: true });
writeGlb(path.join(OUT, 'takao-stripped.glb'), (t) => !gone[t]);
// Her turrets' lengths of her: No.1 to No.3 forward, No.4 and No.5 aft, from
// her deck up, within six metres of her centreline -- more of her than the
// turrets, which is what lets them be cut out of it cleanly.
const SLABS = [[-0.67, -0.28], [0.38, 0.65]];
writeGlb(path.join(OUT, 'takao-turret-source.glb'), (t) => {
  if (gone[t]) return false;
  let cx = 0, cy = 0, cz = 0;
  for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]; cx += P[v * 3] / 3; cy += P[v * 3 + 1] / 3; cz += P[v * 3 + 2] / 3; }
  return cy > -0.085 && Math.abs(cz) < 0.056 && SLABS.some(([a, b]) => cx > a && cx < b);
});
