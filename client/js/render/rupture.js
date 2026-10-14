// A ship blown apart by her own magazine.
//
// Not her plating peeled off a length of her with her insides left standing
// in the gap: a magazine does not take the skin off a ship, it takes the ship
// apart. What is drawn is three pieces of her, each the whole model torn at
// one or both ends along the same wandering tear (see sever.js), so they fit
// tooth for tooth at the moment she goes and then do not:
//
//   the length over the magazine, torn out at both ends and heaved up -- a
//   few feet off a destroyer's handful of five-inch rounds, several metres
//   off a battleship's main magazine -- and falling back, broken, into the
//   sea: a thousand tons of hull does not fly;
//
//   the turrets and mountings that stood on it, not thrown whole like toys
//   but wrecked: the gunhouse crumpled and dented and lifted only a little
//   before it drops back, the barrels bent and the fittings torn off it and
//   thrown higher, tumbling -- and anything small gone altogether, into the
//   shower of scrap that debris.js throws;
//
//   and what is left of her either side, parting, their broken ends dropping
//   into the sea and their far ends coming up, while the battle settles what
//   is left of her the way it already was.
//
// How hard is not a number made up for the effect. It is how much ammunition
// was stowed in that magazine (`tons`, off the wire; see detonate in sim.js),
// and the same tonnage sizes the fireball, the column and the splash.

import * as THREE from '../../../vendor/three.module.js';
import { cutUniforms, cutTree, copyOf, disposeCut, cloneMaterial } from './sever.js';

const G = 9.81;
const TMP = new THREE.Vector3();
const TMPQ = new THREE.Quaternion();

/** How hard a magazine of `tons` goes: about 0.3 for a destroyer's, 1 for a battleship's. */
export function blastPower(tons) {
  return THREE.MathUtils.clamp(Math.cbrt(Math.max(1, tons || 0)) / 10, 0.18, 1.4);
}

/**
 * The same shape with every triangle its own three corners, straight off the
 * arrays (three's own does it a component at a time).
 */
function unshared(geo) {
  if (!geo.index) {
    const out = geo.clone();
    out.deleteAttribute('normal');
    return out;
  }
  const idx = geo.index.array;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.attributes[name];
    // Its normals are worked out again once it is bent, so they are not carried.
    if (name === 'normal' || a.isInterleavedBufferAttribute || !a.array) continue;
    const k = a.itemSize, src = a.array;
    const arr = new src.constructor(idx.length * k);
    for (let i = 0; i < idx.length; i++) {
      const s0 = idx[i] * k;
      for (let q = 0; q < k; q++) arr[i * k + q] = src[s0 + q];
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, k, a.normalized));
  }
  return out;
}

/**
 * A coarser copy of a very fine piece: every corner snapped to a grid a
 * twentieth of its size, and whatever triangles that collapses dropped. A
 * scrap of armour tumbling into the sea does not need the forty thousand
 * triangles its gunhouse was sculpted with, and tearing that many up in one
 * frame was a hitch of its own.
 */
const FINE = 1200;
function coarsen(g) {
  const A = g.attributes.position.array;
  const n = A.length / 9;
  if (n <= FINE) return g;
  const b = boxOf(A);
  const cell = Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 20 || 1;
  const keep = new Uint8Array(n);
  let kept = 0;
  const inv = 1 / cell;
  const x0 = b[0], y0 = b[1], z0 = b[2];
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const ax = Math.round((A[o] - x0) * inv), ay = Math.round((A[o + 1] - y0) * inv), az = Math.round((A[o + 2] - z0) * inv);
    const bx = Math.round((A[o + 3] - x0) * inv), by = Math.round((A[o + 4] - y0) * inv), bz = Math.round((A[o + 5] - z0) * inv);
    const cx = Math.round((A[o + 6] - x0) * inv), cy = Math.round((A[o + 7] - y0) * inv), cz = Math.round((A[o + 8] - z0) * inv);
    A[o] = ax * cell + x0; A[o + 1] = ay * cell + y0; A[o + 2] = az * cell + z0;
    A[o + 3] = bx * cell + x0; A[o + 4] = by * cell + y0; A[o + 5] = bz * cell + z0;
    A[o + 6] = cx * cell + x0; A[o + 7] = cy * cell + y0; A[o + 8] = cz * cell + z0;
    const ab = ax === bx && ay === by && az === bz;
    const bc = bx === cx && by === cy && bz === cz;
    const ac = ax === cx && ay === cy && az === cz;
    if (!ab && !bc && !ac) { keep[t] = 1; kept++; }
  }
  if (kept < 8) return g;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name];
    const w = a.itemSize * 3, src = a.array;
    const arr = new src.constructor(kept * w);
    let j = 0;
    for (let t = 0; t < n; t++) {
      if (!keep[t]) continue;
      const o = t * w;
      for (let q = 0; q < w; q++) arr[j++] = src[o + q];
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
  }
  g.dispose();
  return out;
}

/** Its box, off the raw positions: [minx, miny, minz, maxx, maxy, maxz]. */
function boxOf(A) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < A.length; i += 3) {
    const x = A[i], y = A[i + 1], z = A[i + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  return [x0, y0, z0, x1, y1, z1];
}

/**
 * Flat normals, a facet at a time -- torn steel catches the light plane by
 * plane -- and its bounding sphere, both straight off the arrays.
 */
function finishShape(g) {
  const A = g.attributes.position.array;
  const N = new Float32Array(A.length);
  for (let o = 0; o + 8 < A.length; o += 9) {
    const ax = A[o + 3] - A[o], ay = A[o + 4] - A[o + 1], az = A[o + 5] - A[o + 2];
    const bx = A[o + 6] - A[o], by = A[o + 7] - A[o + 1], bz = A[o + 8] - A[o + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (let k = 0; k < 9; k += 3) { N[o + k] = nx; N[o + k + 1] = ny; N[o + k + 2] = nz; }
  }
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  const b = boxOf(A);
  const c = new THREE.Vector3((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
  let r2 = 0;
  for (let i = 0; i < A.length; i += 3) {
    const dx = A[i] - c.x, dy = A[i + 1] - c.y, dz = A[i + 2] - c.z;
    const q = dx * dx + dy * dy + dz * dz;
    if (q > r2) r2 = q;
  }
  g.boundingSphere = new THREE.Sphere(c, Math.sqrt(r2));
  g.boundingBox = new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5]));
}

/**
 * A wrecked copy of a piece's shape. A long piece -- a barrel, a mast, a
 * boom -- is bent somewhere along it; anything else is crumpled: dented in
 * hard at one or two places and rippled all over, the way plate looks after
 * a blast has been through it.
 */
export function mangle(geo, rnd) {
  // In place: every caller hands over a geometry of its own.
  const g = geo;
  const pos = g.attributes.position;
  if (!pos) return g;
  const A = pos.array;
  const nv = pos.count;
  const B = boxOf(A);
  const bb = { min: { x: B[0], y: B[1], z: B[2] }, max: { x: B[3], y: B[4], z: B[5] } };
  const sx = B[3] - B[0], sy = B[4] - B[1], sz = B[5] - B[2];
  const mx = (B[3] + B[0]) / 2, my = (B[4] + B[1]) / 2, mz = (B[5] + B[2]) / 2;
  const ax = [sx, sy, sz];
  const order = [0, 1, 2].sort((a, b) => ax[b] - ax[a]);
  const L = Math.max(1e-3, ax[order[0]]);
  if (L > 4 * Math.max(1e-3, ax[order[1]])) {
    // Bent: from somewhere along it, the rest of it goes off to one side.
    const long = order[0], side = order[1 + Math.floor(rnd() * 2)];
    const at = 0.25 + rnd() * 0.5;
    const by = (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * 0.6) * L * 0.9;
    const lo = [bb.min.x, bb.min.y, bb.min.z][long];
    for (let i = 0; i < nv; i++) {
      const u = (A[i * 3 + long] - lo) / L - at;
      if (u > 0) A[i * 3 + side] += by * u * u;
    }
  } else {
    // Crumpled: one or two hard dents, and a ripple through all of it.
    const dents = [];
    for (let k = 0; k < 1 + Math.floor(rnd() * 2); k++) {
      const r = L * (0.18 + rnd() * 0.25);
      dents.push([bb.min.x + rnd() * sx, bb.min.y + rnd() * sy, bb.min.z + rnd() * sz,
        1 / (r * r), 6.25 * r * r, L * (0.06 + rnd() * 0.1)]);
    }
    const f0 = rnd() * 6, f1 = rnd() * 6, f2 = rnd() * 6;
    const w = (2 + rnd() * 3) / L;
    const amp = L * 0.025;
    for (let i = 0; i < nv; i++) {
      const o = i * 3;
      let x = A[o], y = A[o + 1], z = A[o + 2];
      for (const d of dents) {
        const qx = x - d[0], qy = y - d[1], qz = z - d[2];
        const q2 = qx * qx + qy * qy + qz * qz;
        if (q2 < d[4]) {
          let ux = x - mx, uy = y - my, uz = z - mz;
          const ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
          const k = d[5] * Math.exp(-q2 * d[3]) / ul;
          x -= ux * k; y -= uy * k; z -= uz * k;
        }
      }
      A[o] = x + amp * Math.sin(y * w * 6.3 + f0) * Math.cos(z * w * 4.1 + f1);
      A[o + 1] = y + amp * Math.sin(z * w * 5.7 + f2) * Math.cos(x * w * 3.3 + f0);
      A[o + 2] = z + amp * Math.sin(x * w * 4.9 + f1) * Math.cos(y * w * 6.1 + f2);
    }
  }
  pos.needsUpdate = true;
  finishShape(g);
  return g;
}

/**
 * A piece torn in two along a plane through it -- and the halves torn again,
 * `depth` times -- so what comes down is fragments of a mounting and not a
 * mounting. Each fragment is a geometry of its own, centred on itself (so it
 * tumbles about its own middle), with where its middle was.
 */
export function tear(geo, rnd, depth) {
  let parts = [coarsen(unshared(geo))];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const g of parts) {
      const pos = g.attributes.position;
      const n = pos.count / 3;
      if (n < 8) { next.push(g); continue; }
      const B = boxOf(pos.array);
      const c = new THREE.Vector3((B[0] + B[3]) / 2, (B[1] + B[4]) / 2, (B[2] + B[5]) / 2);
      const nrm = new THREE.Vector3(rnd() - 0.5, (rnd() - 0.5) * 0.6, rnd() - 0.5).normalize();
      const off = (rnd() - 0.5) * 0.3 * Math.hypot(B[3] - B[0], B[4] - B[1], B[5] - B[2]);
      // Which side of the plane each triangle's middle is on, straight off
      // the arrays: a sculpted gunhouse is tens of thousands of triangles.
      const P = pos.array;
      const side = new Uint8Array(n);
      let ones = 0;
      for (let t = 0; t < n; t++) {
        const o = t * 9;
        const x = (P[o] + P[o + 3] + P[o + 6]) / 3 - c.x;
        const y = (P[o + 1] + P[o + 4] + P[o + 7]) / 3 - c.y;
        const z = (P[o + 2] + P[o + 5] + P[o + 8]) / 3 - c.z;
        if (x * nrm.x + y * nrm.y + z * nrm.z > off) { side[t] = 1; ones++; }
      }
      if (ones < 4 || n - ones < 4) { next.push(g); continue; }
      for (const which of [0, 1]) {
        const count = which ? ones : n - ones;
        const out = new THREE.BufferGeometry();
        for (const name of Object.keys(g.attributes)) {
          const a = g.attributes[name];
          if (a.isInterleavedBufferAttribute || !a.array) continue;
          const w = a.itemSize * 3;
          const src = a.array;
          const arr = new src.constructor(count * w);
          let j = 0;
          for (let t = 0; t < n; t++) {
            if (side[t] !== which) continue;
            const o = t * w;
            for (let q = 0; q < w; q++) arr[j++] = src[o + q];
          }
          out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
        }
        next.push(out);
      }
      if (g !== geo) g.dispose();
    }
    parts = next;
  }
  return parts.map((g) => {
    const A = g.attributes.position.array;
    const B = boxOf(A);
    const at = new THREE.Vector3((B[0] + B[3]) / 2, (B[1] + B[4]) / 2, (B[2] + B[5]) / 2);
    for (let i = 0; i < A.length; i += 3) { A[i] -= at.x; A[i + 1] -= at.y; A[i + 2] -= at.z; }
    // The old normals go: they are worked out afresh, flat, once it is bent.
    g.deleteAttribute('normal');
    return { geo: g, at };
  });
}

/** Scorched: the paint burnt off it, nothing glowing on it. */
function scorched(mat, k) {
  const one = (q) => {
    const c = cloneMaterial(q);
    if (c.color) c.color.multiplyScalar(k);
    if (c.emissive) c.emissive.setHex(0x000000);
    if (c.specular) c.specular.multiplyScalar(0.3);
    return c;
  };
  return Array.isArray(mat) ? mat.map(one) : one(mat);
}

/** The two tears are seeded apart so they never run parallel. */
const SEED_AFT = 3.7;
const SEED_FORE = 19.3;

/** A mounting that stands on her and has to be cut whole or not at all. */
function isMount(o) {
  return !!(o.userData && (o.userData.mounting || o.userData.dynamic));
}

export class Rupture {
  /**
   * `zc` is the middle of the magazine, metres along her in her own frame;
   * `tons` what was in it; `motion` { v, h } the way she had on her.
   */
  constructor(view, zc, tons, motion = { v: 0, h: 0 }) {
    this.view = view;
    const cls = view.cls;
    const len = cls.hull.length;
    const beam = cls.hull.beam;
    this.len = len;
    this.power = blastPower(tons);
    const P = this.power;
    this.jag = Math.min(9, 1.5 + beam * 0.16);
    // The length of her that goes: about a beam of her off a destroyer's
    // magazine, two off a battleship's. Never so short the two tears cross,
    // and never up to her ends.
    const hw = THREE.MathUtils.clamp(beam * (0.35 + 0.6 * P), this.jag * 1.3, len * 0.16);
    const lim = len / 2 - this.jag - 4;
    zc = THREE.MathUtils.clamp(zc, -lim + hw, lim - hw);
    this.zc = zc;
    this.z0 = zc - hw;
    this.z1 = zc + hw;
    const z0 = this.z0;
    const z1 = this.z1;

    const group = view.group;
    group.updateMatrixWorld(true);
    const world = group.parent;
    // Her own model is not drawn from here on: the three pieces are. It is
    // still posed by the battle, and the two pieces left afloat ride on it.
    this.hidden = group.children.filter((c) => c !== view.marker && c.visible);
    const inBand = (z) => z >= z0 && z <= z1;
    const make = (U, inside, throwMounts) => {
      const piece = copyOf(view);
      piece.position.set(0, 0, 0);
      piece.quaternion.identity();
      piece.scale.set(1, 1, 1);
      // Her mountings are cut whole: a turret is not torn in half by a tear
      // that wanders through its barbette. The ones over the magazine are
      // the chunk's, or are thrown; on the other pieces they are not there.
      const mounts = piece.children.filter(isMount);
      const keep = [];
      const thrown = [];
      for (const m of mounts) {
        piece.remove(m);
        const z = m.position.z;
        if (throwMounts === null) { if (!inBand(z)) keep.push(m); continue; }
        if (inBand(z)) (throwMounts ? thrown : keep).push(m);
      }
      cutTree(piece, U, inside, null);
      for (const m of keep) piece.add(m);
      group.add(piece);
      return { piece, U, thrown };
    };
    const opts = (o) => ({ seed: SEED_AFT, seed2: SEED_FORE, ...o });
    // Her two ends. The fore piece keeps what is forward of the forward tear,
    // the after piece what is abaft the after one.
    this.fore = make(cutUniforms(z1, 1, this.jag, { seed: SEED_FORE }),
      (z) => z >= z1, null);
    this.aft = make(cutUniforms(z0, -1, this.jag, { seed: SEED_AFT }),
      (z) => z <= z0, null);
    // And the length between them.
    const chunk = make(cutUniforms(z0, 0, this.jag, opts({ z2: z1, band: true })),
      inBand, true);
    this.chunk = chunk;
    for (const c of this.hidden) c.visible = false;

    // The way she had on her, in the world.
    const vx = Math.sin(motion.h || 0) * (motion.v || 0);
    const vz = Math.cos(motion.h || 0) * (motion.v || 0);
    // Her beam, in the world: what is thrown goes mostly up and a little
    // out to one side or the other.
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(
      group.getWorldQuaternion(TMPQ)).setY(0).normalize();

    // The chunk is thrown in the world, not on her: it turns about its own
    // middle, at the height of her deck.
    const pivot = new THREE.Object3D();
    group.localToWorld(pivot.position.set(0, cls.hull.draft * 0.2, zc));
    group.getWorldQuaternion(pivot.quaternion);
    world.add(pivot);
    pivot.updateMatrixWorld(true);
    pivot.attach(chunk.piece);
    // How hard it goes up: heaved a metre or two by a small magazine and
    // several by a big one. A thousand tons of hull is not light: it lifts,
    // breaks its back and drops into the sea, it does not fly.
    const up = 1.5 + 7 * Math.pow(P, 1.2);
    const out = (Math.random() - 0.5) * 2 * P;
    this.flyers = [{
      obj: pivot, piece: chunk.piece, U: chunk.U, hull: true,
      vx: vx * 0.5 + side.x * out, vy: up, vz: vz * 0.5 + side.z * out,
      // Turning end over end about her beam, mostly, and a little about her
      // length.
      axis: new THREE.Vector3(1, 0, (Math.random() - 0.5) * 0.6)
        .applyQuaternion(pivot.quaternion).normalize(),
      spin: (Math.random() < 0.5 ? -1 : 1) * (0.03 + 0.12 * P * (0.5 + Math.random())),
      size: hw * 2,
      wet: false,
    }];
    // What stood over it, wrecked: every piece of every mounting on that
    // length of her torn off it, mangled, scorched and thrown -- the heavy
    // gunhouse lifted only a little and dropping straight back, the barrels
    // and fittings higher and tumbling. Anything smaller than an arm's length
    // is gone into the scrap that debris.js throws.
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(pivot.quaternion);
    const seed = { s: Math.floor(Math.random() * 1e9) + 1 };
    const rnd = () => ((seed.s = (seed.s * 16807) % 2147483647) / 2147483647);
    const wpos = new THREE.Vector3(), wq = new THREE.Quaternion(), wsc = new THREE.Vector3();
    const inv = new THREE.Matrix4().copy(world.matrixWorld).invert();
    // Torn up a few at a time over the next frames, inside the fireball:
    // done all at once it was most of a second of one frame.
    this.wreck = { rnd, P, vx, vz, side, fwd, world, todo: [] };
    for (const m of chunk.thrown) {
      // Where it stood: it was taken off the copy before the copy was put on
      // her, so it is placed on her own frame.
      m.updateMatrix();
      m.matrix.premultiply(group.matrixWorld);
      m.matrix.decompose(m.position, m.quaternion, m.scale);
      m.updateMatrixWorld(true);
      m.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || !o.geometry || !o.visible) return;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        o.matrixWorld.decompose(wpos, wq, wsc);
        const r = o.geometry.boundingSphere.radius * Math.max(wsc.x, wsc.y, wsc.z);
        if (r < 0.45) return;
        this.wreck.todo.push({ o, r, local: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
      });
    }
    this.t = 0;
    // How far her two ends go over and how fast they part: a battleship
    // broken by her main magazine stands both ends up out of the sea.
    this.lean = 0.12 + 0.3 * Math.min(1, P);
    this.apart = 1.2 + 6 * P;
  }

  /**
   * Tear up what is waiting, until `budget` milliseconds have gone (or
   * `atMost` pieces): each mounting part torn into fragments, mangled,
   * scorched and thrown -- the heavy part of a mounting (a gunhouse, a
   * shield) torn in two and barely lifted, what was fixed to it torn smaller
   * and thrown higher, spinning.
   */
  tearSome(budget, atMost = Infinity) {
    const W = this.wreck;
    if (!W || !W.todo.length) return;
    const t0 = performance.now();
    const { rnd, P, vx, vz, side, fwd, world } = W;
    let n = 0;
    while (W.todo.length && n < atMost && performance.now() - t0 < budget) {
      const { o, r, local } = W.todo.shift();
      n++;
      const heavy = r > 2.5;
      for (const fr of tear(o.geometry, rnd, heavy ? 1 : r > 1.2 ? 2 : 1)) {
        const geo = mangle(fr.geo, rnd);
        const piece = new THREE.Mesh(geo, scorched(o.material, 0.22 + rnd() * 0.15));
        piece.userData.cutMat = true;
        piece.userData.ownGeo = true;
        local.decompose(piece.position, piece.quaternion, piece.scale);
        // Placed where its own middle was.
        piece.position.add(fr.at.clone().multiply(piece.scale).applyQuaternion(piece.quaternion));
        world.add(piece);
        const tup = heavy ? 2 + (4 + 8 * P) * rnd() : 6 + (8 + 20 * P) * rnd();
        const tout = (rnd() - 0.5) * (heavy ? 3 + 4 * P : 8 + 20 * P);
        const along = (rnd() - 0.5) * (heavy ? 2 : 4 + 10 * P);
        this.flyers.push({
          obj: piece, hull: false,
          vx: vx * 0.5 + side.x * tout + fwd.x * along,
          vy: tup,
          vz: vz * 0.5 + side.z * tout + fwd.z * along,
          axis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
          spin: heavy ? 0.3 + rnd() * 0.9 : 1.5 + rnd() * 4,
          size: Math.min(12, 1.5 + r),
          wet: false,
        });
      }
    }
  }

  /**
   * Once a frame, after she is posed. Returns the splashes made this frame,
   * in the world -- { x, z, size, hull } -- for the battle to make water of.
   */
  step(dt) {
    this.t += dt;
    this.tearSome(6);
    const t = this.t;
    const splashes = [];
    // Her two ends, hinged at their broken ends: the broken end goes down
    // into the sea and the far end comes up, and the two of them part.
    const ease = (x) => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); };
    const lean = this.lean * ease(t / 9) + Math.min(0.25, t * 0.004);
    const gap = this.apart * (1 - Math.exp(-t / 3)) + t * 0.15;
    for (const [part, end, at] of [[this.fore, 1, this.z1], [this.aft, -1, this.z0]]) {
      if (!part) continue;
      const p = part.piece;
      // Rotation about her beam at the broken end: positive puts +z down, so
      // the fore piece turns the other way to lift its stem.
      const a = -end * lean;
      p.rotation.set(a, 0, end * 0.04 * ease(t / 12));
      // Put back so the broken end stays where it was, parting from the other.
      TMP.set(0, 0, at).applyEuler(p.rotation);
      p.position.set(0, -ease(t / 6) * 1.5, at + end * gap - TMP.z);
      p.position.y -= TMP.y;
      p.updateMatrixWorld(true);
      part.U.uCutInv.value.copy(p.matrixWorld).invert();
    }
    // What was thrown.
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      const o = f.obj;
      if (!f.wet) {
        f.vy -= G * dt;
        // Air does not slow a turret much, but it slows the scraps round it.
        f.vx *= Math.exp(-dt * 0.08);
        f.vz *= Math.exp(-dt * 0.08);
      } else {
        // In the water: stopped dead, and going down.
        const k = Math.exp(-dt * 2.5);
        f.vx *= k; f.vz *= k;
        f.vy = f.vy * k + (-2.5 - (f.hull ? 1.5 : 3)) * (1 - k);
        f.spin *= Math.exp(-dt * 1.2);
      }
      o.position.x += f.vx * dt;
      o.position.y += f.vy * dt;
      o.position.z += f.vz * dt;
      o.quaternion.premultiply(TMPQ.setFromAxisAngle(f.axis, f.spin * dt));
      if (!f.wet && f.vy < 0 && o.position.y < 1) {
        f.wet = true;
        splashes.push({ x: o.position.x, z: o.position.z, size: f.size, hull: f.hull, fall: -f.vy });
      }
      o.updateMatrixWorld(true);
      if (f.U) f.U.uCutInv.value.copy(f.piece.matrixWorld).invert();
      if (f.wet && o.position.y < -(f.hull ? 40 + this.len * 0.1 : 30)) {
        this.drop(f);
        this.flyers.splice(i, 1);
      }
    }
    return splashes;
  }

  drop(f) {
    if (f.obj.parent) f.obj.parent.remove(f.obj);
    disposeCut(f.obj);
    // A wrecked piece has its own mangled shape to give back.
    if (f.obj.userData.ownGeo && f.obj.geometry) f.obj.geometry.dispose();
  }

  dispose() {
    for (const f of this.flyers) this.drop(f);
    this.flyers.length = 0;
    for (const part of [this.fore, this.aft]) {
      if (!part) continue;
      if (part.piece.parent) part.piece.parent.remove(part.piece);
      disposeCut(part.piece);
    }
    this.fore = this.aft = null;
  }
}
