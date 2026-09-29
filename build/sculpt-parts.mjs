// The parts of making a ship out of a sculpt that are the same for every ship
// made that way (the Rodney's and the Baltimore's; see build/prepare-*-hull.mjs):
// dropping what a cut leaves loose, turning the faces a decimated knife edge
// leaves facing in, telling a spar from a deck, lifting a turret out of her
// with its barrels turned true, and measuring her lines.
import {
  closeHoles, boxCut, recomputeNormals, weld, hardEdges, faceNormal, components,
} from './sculpt.mjs';

// ---- what a cut leaves ------------------------------------------------------------
/**
 * What the cuts left standing free of her: a sliver of cap on the face of a box
 * where the thing it closed went with the box, the stumps of her shaft
 * brackets where her screws came off. Nothing of hers is that small and apart,
 * so any piece but the main one with less than `maxArea` square metres of
 * surface and no more than `maxDiag` metres corner to corner is dropped.
 */
export function dropLoose(m, { maxArea = 8, maxDiag = 6 } = {}) {
  const parts = components(m);
  const drop = new Uint8Array(m.T.length / 3);
  for (const c of parts.slice(1)) {
    let area = 0;
    for (const t of c.tris) {
      const [x, y, z] = faceNormal(m, m.T[t * 3], m.T[t * 3 + 1], m.T[t * 3 + 2]);
      area += Math.hypot(x, y, z) / 2;
    }
    const d = Math.hypot(c.hi[0] - c.lo[0], c.hi[1] - c.lo[1], c.hi[2] - c.lo[2]);
    if (area > maxArea || d > maxDiag) continue;
    for (const t of c.tris) drop[t] = 1;
    console.log(`loose piece dropped: ${c.tris.length} triangles, ${area.toFixed(1)} m2 at`,
      c.lo.map((v) => v.toFixed(1)).join(','), '..', c.hi.map((v) => v.toFixed(1)).join(','));
  }
  const T = [], C = m.C ? [] : null;
  for (let t = 0; t < m.T.length / 3; t++) {
    if (drop[t]) continue;
    T.push(m.T[t * 3], m.T[t * 3 + 1], m.T[t * 3 + 2]);
    if (C) C.push(m.C[t]);
  }
  m.T = T;
  if (C) m.C = C;
}

/**
 * The faces that face in. A face is turned the way its corners' normals say
 * (fixWinding), and on a
 * knife edge -- the trailing edge of her rudder, the foot of her skeg -- the
 * normals of its two sides cancel and say nothing, so a few there face into
 * her: from astern you look through them into her. A face whose neighbours
 * all run their shared edges the other way from it is the wrong way round.
 */
export function turnInward(m) {
  const { T } = m;
  const nf = T.length / 3;
  const canon = weld(m);
  let turned = 0;
  for (let pass = 0; pass < 4; pass++) {
    const edges = new Map();
    for (let t = 0; t < nf; t++) {
      for (let j = 0; j < 3; j++) {
        const a = canon[T[t * 3 + j]], b = canon[T[t * 3 + (j + 1) % 3]];
        const k = a < b ? `${a},${b}` : `${b},${a}`;
        if (!edges.has(k)) edges.set(k, []);
        edges.get(k).push([t, a < b]);
      }
    }
    const flip = [];
    for (let t = 0; t < nf; t++) {
      let same = 0, other = 0;
      for (let j = 0; j < 3; j++) {
        const a = canon[T[t * 3 + j]], b = canon[T[t * 3 + (j + 1) % 3]];
        const e = edges.get(a < b ? `${a},${b}` : `${b},${a}`);
        if (e.length !== 2) continue;
        const [u, dir] = e[0][0] === t ? e[1] : e[0];
        if (u === t) continue;
        if (dir === (a < b)) same++; else other++;
      }
      if (same >= 2 && other === 0) flip.push(t);
    }
    for (const t of flip) {
      const b = T[t * 3 + 1];
      T[t * 3 + 1] = T[t * 3 + 2];
      T[t * 3 + 2] = b;
    }
    turned += flip.length;
    if (!flip.length) break;
  }
  return turned;
}

// ---- spars and wires ---------------------------------------------------------------
/**
 * Which faces of a mesh are part of something thin -- a spar, a yard, a
 * wireless aerial, a rail, a bulwark: a face with another facing roughly the
 * other way within `r` of it. Denoising a thing like that averages the faces
 * round it into one another until it is flat, and a mast goes into the water
 * as a stack of blades; it is left as the sculpt drew it.
 */
export function thinFaces(mesh, r) {
  const { P, T } = mesh;
  const nf = T.length / 3;
  const c = new Float64Array(nf * 3), n = new Float64Array(nf * 3);
  const grid = new Map();
  const key = (x, y, z) => `${Math.floor(x / r)},${Math.floor(y / r)},${Math.floor(z / r)}`;
  for (let t = 0; t < nf; t++) {
    const [x, y, z] = faceNormal(mesh, T[t * 3], T[t * 3 + 1], T[t * 3 + 2]);
    const l = Math.hypot(x, y, z) || 1;
    n[t * 3] = x / l; n[t * 3 + 1] = y / l; n[t * 3 + 2] = z / l;
    for (let k = 0; k < 3; k++) c[t * 3 + k] = (P[T[t * 3] * 3 + k] + P[T[t * 3 + 1] * 3 + k] + P[T[t * 3 + 2] * 3 + k]) / 3;
    const kk = key(c[t * 3], c[t * 3 + 1], c[t * 3 + 2]);
    if (!grid.has(kk)) grid.set(kk, []);
    grid.get(kk).push(t);
  }
  const thin = new Uint8Array(nf);
  for (let t = 0; t < nf; t++) {
    const gx = Math.floor(c[t * 3] / r), gy = Math.floor(c[t * 3 + 1] / r), gz = Math.floor(c[t * 3 + 2] / r);
    search: for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) {
      for (const u of grid.get(`${gx + a},${gy + b},${gz + d}`) || []) {
        if (n[t * 3] * n[u * 3] + n[t * 3 + 1] * n[u * 3 + 1] + n[t * 3 + 2] * n[u * 3 + 2] > -0.5) continue;
        if (Math.hypot(c[t * 3] - c[u * 3], c[t * 3 + 1] - c[u * 3 + 1], c[t * 3 + 2] - c[u * 3 + 2]) > r) continue;
        thin[t] = 1;
        break search;
      }
    }
  }
  return thin;
}


// ---- a turret, lifted out of her --------------------------------------------------
/** The triangles of `mesh` selected by `pick(t)`, as a mesh of their own, paint and all. */
export function subMesh(mesh, pick) {
  const map = new Map();
  const P = [], N = [], T = [], C = [];
  for (let t = 0; t < mesh.T.length / 3; t++) {
    if (!pick(t)) continue;
    for (let j = 0; j < 3; j++) {
      const v = mesh.T[t * 3 + j];
      let w = map.get(v);
      if (w === undefined) {
        w = P.length / 3;
        map.set(v, w);
        P.push(mesh.P[v * 3], mesh.P[v * 3 + 1], mesh.P[v * 3 + 2]);
        N.push(mesh.N[v * 3] || 0, mesh.N[v * 3 + 1] || 0, mesh.N[v * 3 + 2] || 0);
      }
      T.push(w);
    }
    if (mesh.C) C.push(mesh.C[t]);
  }
  return mesh.C ? { P, N, T, C } : { P, N, T };
}
export const clone = (mesh) => ({ P: mesh.P.slice(), N: mesh.N.slice(), T: mesh.T.slice(), ...(mesh.C ? { C: mesh.C.slice() } : {}) });
/** Only the points a mesh uses. */
export const compact = (mesh) => subMesh(mesh, () => true);

/** Normals split at creases (and paints), for a piece with no side plating. */
export function creased(mesh, deg) {
  recomputeNormals(mesh);
  const flat = { zBin: () => 0, halfB: [Infinity], edgeY: [-Infinity] };
  hardEdges(mesh, weld(mesh), flat, { crease: deg * Math.PI / 180, plateTilt: 0, foot: 0 });
  return mesh;
}

/** Least-squares line through points: across and y as linear in along. */
export function fitLine(pts) {
  const n = pts.length;
  let sa = 0, sc = 0, sy = 0, saa = 0, sac = 0, say = 0;
  for (const [a, c, y] of pts) { sa += a; sc += c; sy += y; saa += a * a; sac += a * c; say += a * y; }
  const den = n * saa - sa * sa;
  const kc = (n * sac - sa * sc) / den, kyv = (n * say - sa * sy) / den;
  return { c0: (sc - kc * sa) / n, kc, y0: (sy - kyv * sa) / n, ky: kyv };
}

/**
 * A mounting's barrels, off points of it in its own frame (along +z, across x,
 * up y): `n` of them, told apart by how far across each is. Where each runs,
 * the elevation they are stowed at, how far out the muzzles are, and the
 * radius along them -- the same for all of them.
 */
export function barrelsOf(pts, n, face, tipMax, { rMin, rMax, bin }) {
  // Split across into n lanes, by where the points bunch.
  const xs = pts.map(([, x]) => x).sort((a, b) => a - b);
  const lo = xs[Math.floor(xs.length * 0.02)], hi = xs[Math.floor(xs.length * 0.98)];
  const lane = (x) => Math.max(0, Math.min(n - 1, Math.floor(((x - lo) / (hi - lo)) * n)));
  const sides = Array.from({ length: n }, () => []);
  for (const [z, x, y] of pts) sides[lane(x)].push([z, x, y]);
  const lines = sides.map((side) => {
    let f = fitLine(side);
    for (let it = 0; it < 3; it++) {
      const d = side.map(([a, c, y]) => Math.hypot(c - (f.c0 + f.kc * a), y - (f.y0 + f.ky * a)));
      const med = d.slice().sort((p, q) => p - q)[d.length >> 1];
      f = fitLine(side.filter((_, k) => d[k] < med * 1.6 + 0.05));
    }
    let tip = -Infinity;
    for (const [a, c, y] of side) if (Math.hypot(c - (f.c0 + f.kc * a), y - (f.y0 + f.ky * a)) < rMax * 1.4) tip = Math.max(tip, a);
    return { f, tip: Math.min(tip, tipMax), side };
  });
  const tipAlong = lines.reduce((s, l) => s + l.tip, 0) / n;
  const mid = (face + tipAlong) / 2;
  const across = lines.map((l) => l.f.c0 + l.f.kc * mid).sort((a, b) => a - b);
  // Evenly spaced about their own middle, as a mounting's barrels are.
  const centre = across.reduce((s, v) => s + v, 0) / n;
  const pitchAcross = n > 1 ? (across[n - 1] - across[0]) / (n - 1) : 0;
  const xsOut = Array.from({ length: n }, (_, k) => centre + (k - (n - 1) / 2) * pitchAcross);
  const ky = lines.reduce((s, l) => s + l.f.ky, 0) / n;
  const yMid = lines.reduce((s, l) => s + l.f.y0 + l.f.ky * mid, 0) / n;
  const yAt = (a) => yMid + ky * (a - mid);
  const bins = [];
  for (const { f, side } of lines) {
    for (const [a, c, y] of side) {
      const r = Math.hypot(c - (f.c0 + f.kc * a), y - (f.y0 + f.ky * a));
      if (r > rMax * 1.4) continue;
      const k = Math.floor((a - face) / bin);
      (bins[k] ||= []).push(r);
    }
  }
  const raw = bins.map((b) => (b && b.length >= 3 ? b.sort((p, q) => p - q)[Math.floor(b.length * 0.7)] : null));
  const fill = raw.map((_, k) => {
    let s2 = 0, w = 0;
    for (let d = -1; d <= 1; d++) { const v = raw[k + d]; if (v != null) { const ww = d === 0 ? 2 : 1; s2 += v * ww; w += ww; } }
    return w ? s2 / w : null;
  });
  // Made monotone from the jacket to the chase -- a barrel does not swell and
  // pinch along its length -- bar the swell at the muzzle.
  const prof = [];
  let last = Infinity;
  fill.forEach((r, k) => {
    if (r == null) return;
    const a = face + (k + 0.5) * bin;
    if (a > tipAlong - bin) return;
    last = Math.min(last, r);
    prof.push([a, Math.max(rMin, Math.min(rMax, last))]);
  });
  const pitch = Math.atan(ky);
  const reachFrom = (z0) => (tipAlong - z0) / Math.cos(pitch);
  return { xs: xsOut, yAt, ky, pitch, face, tipAlong, profile: prof, reachFrom };
}

/**
 * The barrels turned true, in the frame of the cradle: its origin on the
 * trunnions, the bore along +z, level -- the cradle is what is laid at the
 * elevation the sculpt stows them at. From a metre behind the face, out of
 * sight inside the gunhouse however far they elevate, to the muzzle: the
 * jacket where they come out of the face, the chase, and a swell at the
 * muzzle round a bore you can see down.
 */
export function turnedBarrels(bar, trunnion, reach, SEG = 20) {
  const cp = Math.cos(bar.pitch);
  const alongToS = (a) => (a - trunnion[2]) / cp;
  const L = reach;
  const rJacket = bar.profile.length ? bar.profile[0][1] : 0.6;
  const rChase = bar.profile.length ? bar.profile[bar.profile.length - 1][1] : 0.48;
  const ring = [[-0.4, rJacket]];
  for (const [a, r] of bar.profile) if (alongToS(a) < L - 0.6) ring.push([alongToS(a), r]);
  const rSwell = Math.min(rJacket, rChase * 1.1);
  ring.push([L - 0.55, rChase], [L - 0.4, rSwell], [L - 0.06, rSwell], [L, rSwell * 0.9]);
  ring.sort((p, q) => p[0] - q[0]);
  const P = [], N = [], T = [];
  for (const x0 of bar.xs) {
    const base = P.length / 3;
    for (let k = 0; k < ring.length; k++) {
      const [sz, r] = ring[k];
      const prev = ring[Math.max(0, k - 1)], next = ring[Math.min(ring.length - 1, k + 1)];
      const dr = (next[1] - prev[1]) / Math.max(1e-6, next[0] - prev[0]);
      const nl = Math.hypot(1, dr);
      for (let j = 0; j < SEG; j++) {
        const a = (j / SEG) * Math.PI * 2;
        const cx = Math.cos(a), cy = Math.sin(a);
        P.push(x0 + cx * r, cy * r, sz);
        N.push(cx / nl, cy / nl, -dr / nl);
      }
    }
    for (let k = 0; k < ring.length - 1; k++) {
      for (let j = 0; j < SEG; j++) {
        const a = base + k * SEG + j, b = base + k * SEG + ((j + 1) % SEG);
        const c = a + SEG, d = b + SEG;
        T.push(a, b, d, a, d, c);
      }
    }
    {
      const [sz, r] = ring[0];
      const c = P.length / 3;
      P.push(x0, 0, sz); N.push(0, 0, -1);
      const b0 = P.length / 3;
      for (let j = 0; j < SEG; j++) { const a = (j / SEG) * Math.PI * 2; P.push(x0 + Math.cos(a) * r, Math.sin(a) * r, sz); N.push(0, 0, -1); }
      for (let j = 0; j < SEG; j++) T.push(c, b0 + ((j + 1) % SEG), b0 + j);
    }
    {
      const [sz, r] = ring[ring.length - 1];
      const rb = r * 0.42;
      const o = P.length / 3;
      for (let j = 0; j < SEG; j++) { const a = (j / SEG) * Math.PI * 2; P.push(x0 + Math.cos(a) * r, Math.sin(a) * r, sz); N.push(0, 0, 1); }
      for (let j = 0; j < SEG; j++) { const a = (j / SEG) * Math.PI * 2; P.push(x0 + Math.cos(a) * rb, Math.sin(a) * rb, sz); N.push(0, 0, 1); }
      for (let j = 0; j < SEG; j++) {
        const a = o + j, b = o + ((j + 1) % SEG), c = o + SEG + j, d = o + SEG + ((j + 1) % SEG);
        T.push(a, b, d, a, d, c);
      }
      const o2 = P.length / 3;
      for (const dz of [0, -0.9]) {
        for (let j = 0; j < SEG; j++) { const a = (j / SEG) * Math.PI * 2; P.push(x0 + Math.cos(a) * rb, Math.sin(a) * rb, sz + dz); N.push(-Math.cos(a), -Math.sin(a), 0); }
      }
      for (let j = 0; j < SEG; j++) {
        const a = o2 + j, b = o2 + ((j + 1) % SEG), c = o2 + SEG + j, d = o2 + SEG + ((j + 1) % SEG);
        T.push(a, c, d, a, d, b);
      }
      const c = P.length / 3;
      P.push(x0, 0, sz - 0.9); N.push(0, 0, 1);
      for (let j = 0; j < SEG; j++) T.push(c, o2 + SEG + j, o2 + SEG + ((j + 1) % SEG));
    }
  }
  return { P, N, T };
}

/**
 * A gunhouse with the sculpt's own barrels taken off it: everything more than
 * `ahead` of the face, and the skin of each old barrel between the face and
 * that cut, out to `axisR` from its axis. What is left is closed; the new
 * barrels come out of the holes.
 */
export function strippedHouse(house0, bar, face, y0, { ahead = 0.35, axisR = 0.8 } = {}) {
  const trimmed = clone(house0);
  boxCut(trimmed, { x0: -12, x1: 12, y0, y1: 40, z0: -20, z1: face + ahead }, { keep: 'inside' });
  const tip = face + ahead;
  const nearAxis = (x, y, z) => z >= face - 0.3 && bar.xs.some((bx) => Math.hypot(x - bx, y - bar.yAt(z)) < axisR);
  let house = subMesh(trimmed, (tri) => {
    const vs = [0, 1, 2].map((j) => trimmed.T[tri * 3 + j]);
    for (const v of vs) if (!nearAxis(trimmed.P[v * 3], trimmed.P[v * 3 + 1], trimmed.P[v * 3 + 2])) return true;
    if (vs.every((v) => Math.abs(trimmed.P[v * 3 + 2] - tip) < 1e-3)) return false;
    const [nx, ny, nz] = faceNormal(trimmed, vs[0], vs[1], vs[2]);
    const nl = Math.hypot(nx, ny, nz) || 1;
    const along = Math.abs((ny * bar.ky + nz) / (nl * Math.hypot(bar.ky, 1)));
    return along >= 0.6;
  });
  // Only the gunhouse and what is part of it: not a scrap the box left
  // standing on its own.
  const parts = components(house);
  const big = new Set();
  for (const c of parts) if (c.tris.length >= parts[0].tris.length * 0.08) for (const q of c.tris) big.add(q);
  house = subMesh(house, (tri) => big.has(tri));
  const s1 = closeHoles(house, new Uint8Array(house.T.length / 3).fill(1), () => null, { open: true });
  return { house, holes: s1.loops };
}

// ---- her lines ----------------------------------------------------------------------
/**
 * Her lines, as the sculpt has them: what her interior and her armour are
 * fitted under and what the fleet's
 * structural checks feel her over: a metre at a time along her, the bottom of
 * her keel, the deck over her insides -- the lowest deck anywhere across her
 * with open air over it -- and how far out her side is at every half metre of
 * height.
 *
 * `grid` is `{ z0, dz, nz, y0, dy, ny }`, `st` her stations (see stations),
 * and `deckFallback` the deck height where a station finds none.
 */
export function measureLines(m, st, grid, deckFallback) {
  const LINES = { ...grid };
  const { P, T } = m;
  const sectionAt = (z) => {
    const segs = [];
    for (let t = 0; t < T.length; t += 3) {
      const v = [T[t], T[t + 1], T[t + 2]];
      const pts = [];
      for (let j = 0; j < 3; j++) {
        const a = v[j], b = v[(j + 1) % 3];
        const za = P[a * 3 + 2], zb = P[b * 3 + 2];
        if ((za - z) * (zb - z) > 0 || za === zb) continue;
        const s2 = (z - za) / (zb - za);
        pts.push([P[a * 3] + (P[b * 3] - P[a * 3]) * s2, P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * s2, t / 3]);
      }
      if (pts.length === 2) segs.push(pts);
    }
    return segs;
  };
  const faceUp = (tri) => {
    const [x, y, z] = faceNormal(m, T[tri * 3], T[tri * 3 + 1], T[tri * 3 + 2]);
    return y / (Math.hypot(x, y, z) || 1);
  };
  const keel = [], deck = [], half = [];
  for (let k = 0; k < LINES.nz; k++) {
    const z = LINES.z0 + k * LINES.dz;
    const segs = sectionAt(z);
    let kl = Infinity;
    for (const [[xa, ya], [xb, yb]] of segs) {
      if (xa * xb > 0 || xa === xb) continue;
      kl = Math.min(kl, ya + (yb - ya) * (-xa / (xb - xa)));
    }
    if (!Number.isFinite(kl)) {
      for (const [[xa, ya], [xb, yb]] of segs) {
        if (Math.abs(xa) < 1.5) kl = Math.min(kl, ya);
        if (Math.abs(xb) < 1.5) kl = Math.min(kl, yb);
      }
    }
    let foot = Infinity, body = Infinity;
    for (let j = 0; j < LINES.ny; j++) {
      const y = LINES.y0 + j * LINES.dy;
      let w = 0;
      for (const [[xa, ya], [xb, yb]] of segs) {
        if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
        w = Math.max(w, Math.abs(xa + (xb - xa) * ((y - ya) / (yb - ya))));
      }
      half.push(w);
      if (w > 0 && foot === Infinity) foot = y;
      if (w >= 0.7 && body === Infinity) body = y;
    }
    // Her keel is the bottom of her body, not of her skeg or her rudder: aft,
    // where her run lifts to her screws, the lowest thing on her centreline is
    // the foot of a plate standing metres down under her, and her insides are
    // not fitted down into that. A plate is what stays under a metre and a
    // half across for a metre and a half up. (Her stem is a plate too, and
    // nothing is fitted into it either way.)
    if (z < 0 && Number.isFinite(kl) && Number.isFinite(body) && body - foot >= 1.5) kl = Math.max(kl, body - 0.25);
    keel.push(Number.isFinite(kl) ? kl : 99);
    const hw = st.halfB[st.zBin(z)];
    let lowest = Infinity;
    for (let x = -hw * 0.8; x <= hw * 0.8 + 1e-6; x += 0.5) {
      const hits = [];
      for (const [[xa, ya, ta], [xb, yb]] of segs) {
        if ((xa - x) * (xb - x) > 0 || xa === xb) continue;
        hits.push([ya + (yb - ya) * ((x - xa) / (xb - xa)), faceUp(ta)]);
      }
      hits.sort((p, q) => p[0] - q[0]);
      for (let h = 0; h < hits.length; h++) {
        const [y, up] = hits[h];
        if (y < 2.0 || up < 0.5) continue;
        const next = hits[h + 1];
        if (!next || next[1] < -0.3 || next[0] - y > 1.2) { lowest = Math.min(lowest, y); break; }
      }
    }
    deck.push(Number.isFinite(lowest) ? lowest : NaN);
  }
  // A station that finds none takes the nearest one that does: at her stem,
  // where the forecastle closes to a knife, that is a run of them.
  const nearest = (k) => {
    for (let d = 1; d < deck.length; d++) {
      for (const q of [deck[k - d], deck[k + d]]) if (q !== undefined && !Number.isNaN(q)) return q;
    }
    return deckFallback;
  };
  const filled = deck.map((v, k) => (Number.isNaN(v) ? nearest(k) : v));
  LINES.deck = filled.map((_, k) => {
    let v = Infinity;
    for (let d = -6; d <= 6; d++) { const q = filled[k + d]; if (q !== undefined) v = Math.min(v, q); }
    return +v.toFixed(2);
  });
  LINES.keel = keel.map((v) => +v.toFixed(2));
  LINES.half = half.map((v) => +v.toFixed(2));
  const at = (z) => LINES.deck[Math.round((z - LINES.z0) / LINES.dz)];
  console.log('the deck over her insides:', [-100, -80, -60, -40, -20, 0, 20, 40, 60, 80, 100].map((z) => `${z}:${at(z)}`).join(' '));
  return LINES;
}
