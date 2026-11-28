// The catapult seaplanes and the Wildcat, off models made with Meshy for the
// game, each painted here rather than in the paint Meshy would have given it.
//
// What Meshy made is shape only: one bare welded skin each, nose along -x,
// span along z, up y. build/naval-air-source.mjs cuts it into her pieces --
// her airscrew, and the Wildcat's legs -- and paints her a texture of her own
// (`atlas`): every face laid flat on the side of her it looks at, and each
// texel of it painted off where on her it is. That is what these kinds are
// written in: a paint scheme as a function of a point on her, in the model's
// own frame.
//
//   arado       Ar 196A-3, the Bismarck's, the Tirpitz's and the Scheer's
//   kingfisher  OS2U-3, the American battleships' and cruisers'
//   besson      MB.411, the Surcouf's
//   loire       Loire 130, the Richelieu's
//   walrus      Supermarine Walrus, the King George V's
//   kor1        Beriev KOR-1, the Sovetsky Soyuz's
//   ro43        IMAM Ro.43, the Morosini's
//   jake        Aichi E13A, the Kongo's and the Fuso's
//   wildcat     Grumman F4F-4, the American carriers' fighter
//
// The models are in assets/models/meshy-aircraft/. Six were made from a
// description of the type; the Loire, the Walrus and the Kingfisher from
// pictures of the game's own drawings of them, which had them the right
// shape where a description did not (a flying boat's hull, a single float).
// The KOR-1 and the Ro.43 are the one model, a biplane on two floats, given
// the single float and the wingtip floats both types had (`rework`).

const hyp = Math.hypot;
/** sRGB paint to the light a corner colour is given in. */
const lin = (c) => c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
/** A hub in the model's frame, to the frame `spins` are written in: nose along +z. */
const hubOf = ([x, y, z = 0]) => [z, y, -x];

// ---- markings --------------------------------------------------------------
// Each is a function of where the point is from the marking's middle -- `dx`
// across it, `dy` up it (forward, on a wing) -- and its radius, and gives the
// colour there, or null off it.
const WHITE = [0.86, 0.86, 0.84];
const BLACK = [0.07, 0.07, 0.07];
const STAR = Array.from({ length: 10 }, (_, i) => {
  const a = (i * Math.PI) / 5;
  const r = i % 2 ? 0.382 : 1;
  return [r * Math.sin(a), r * Math.cos(a)];
});
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** The American star in its blue disc, 1942. */
const usStar = (dx, dy, r) => {
  if (hyp(dx, dy) > r) return null;
  return inPoly(dx / r, dy / r, STAR) ? WHITE : [0.12, 0.16, 0.33];
};
/** Rings, outermost first: [fraction of the radius, colour]. */
const rings = (list) => (dx, dy, r) => {
  const d = hyp(dx, dy) / r;
  let c = null;
  for (const [f, col] of list) if (d <= f) c = col;
  return c;
};
const RN_RED = [0.62, 0.13, 0.12], RN_BLUE = [0.14, 0.19, 0.4], RN_YELLOW = [0.85, 0.72, 0.2];
const roundelA1 = rings([[1, RN_YELLOW], [0.86, RN_BLUE], [0.6, WHITE], [0.3, RN_RED]]);
const roundelA = rings([[1, RN_BLUE], [0.66, WHITE], [0.33, RN_RED]]);
const roundelB = rings([[1, RN_BLUE], [0.5, RN_RED]]);
const FR_BLUE = [0.12, 0.2, 0.45], FR_RED = [0.7, 0.12, 0.12];
const cocarde = rings([[1, FR_BLUE], [0.66, WHITE], [0.33, FR_RED]]);
const HINO = [0.66, 0.09, 0.09];
const hinomaru = rings([[1, HINO]]);
const hinomaruRinged = rings([[1, WHITE], [0.84, HINO]]);
/** The Balkenkreuz: a black cross, edged white. */
const balken = (dx, dy, r) => {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if ((ax < 0.17 * r && ay < 0.8 * r) || (ay < 0.17 * r && ax < 0.8 * r)) return BLACK;
  if ((ax < 0.3 * r && ay < r) || (ay < 0.3 * r && ax < r)) return WHITE;
  return null;
};
/** The red star, edged white. */
const SOV_RED = [0.7, 0.12, 0.1];
const redStar = (dx, dy, r) => {
  if (inPoly(dx / r, dy / r, STAR)) return SOV_RED;
  if (inPoly(dx / (r * 1.14), (dy + 0.02 * r) / (r * 1.14), STAR)) return WHITE;
  return null;
};
/** The Regia Aeronautica's fasci: three black fasces in a white disc, ringed black. */
const fasci = (dx, dy, r) => {
  const d = hyp(dx, dy);
  if (d > r) return null;
  if (d > 0.86 * r) return BLACK;
  const ax = Math.abs(dx) / r;
  if (Math.abs(dy) < 0.56 * r && (ax < 0.07 || (ax > 0.25 && ax < 0.39))) return BLACK;
  return WHITE;
};

// ---- what is measured off her ------------------------------------------------
/**
 * The run of her fuselage: the middle of her (between her belly and her
 * back) at each station along her, how deep and how wide she is there, and
 * where her wings are. Everything is found by casting lines through her skin:
 * its triangles are big where it is smooth and small where it is busy, so
 * what lies on a line has to be found by crossing it, not by looking for
 * faces near it.
 */
function survey(model, P0, fus) {
  const T = model.T, nt = T.length / 3;
  const STEP = 0.02;
  const V = (t, k) => T[t * 3 + k] * 3;
  // Every height (along axis h) at which the line (axis a = u, axis b = v) crosses her.
  const cross = (u, v, A, B, H, lo, hi) => {
    const out = [];
    for (let t = 0; t < nt; t++) {
      const a = V(t, 0), b = V(t, 1), c = V(t, 2);
      const ax = P0[a + A], ay = P0[a + B], bx = P0[b + A], by = P0[b + B], cx = P0[c + A], cy = P0[c + B];
      if ((u < ax && u < bx && u < cx) || (u > ax && u > bx && u > cx) || (v < ay && v < by && v < cy) || (v > ay && v > by && v > cy)) continue;
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(d) < 1e-14) continue;
      const l1 = ((by - cy) * (u - cx) + (cx - bx) * (v - cy)) / d;
      const l2 = ((cy - ay) * (u - cx) + (ax - cx) * (v - cy)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      const h = l1 * P0[a + H] + l2 * P0[b + H] + l3 * P0[c + H];
      if (h >= lo && h <= hi) out.push(h);
    }
    return out;
  };
  // Her length, off her bounding box.
  let xmin = Infinity, xmax = -Infinity;
  for (let i = 0; i < P0.length; i += 3) {
    if (P0[i + 1] < fus.ylo || P0[i + 1] > fus.yhi || Math.abs(P0[i + 2]) > 0.03) continue;
    xmin = Math.min(xmin, P0[i]); xmax = Math.max(xmax, P0[i]);
  }
  // Straight up her, a hair off her centreline where no fin or seam lies;
  // then in from abeam at her middle height.
  const bins = new Map();
  for (let k = Math.floor(xmin / STEP); k <= Math.floor(xmax / STEP); k++) {
    const x = (k + 0.5) * STEP;
    const hits = cross(x, 0.004, 0, 2, 1, fus.ylo, fus.yhi);
    if (hits.length < 2) continue;
    const lo = Math.min(...hits), hi = Math.max(...hits);
    const m = (lo + hi) / 2;
    const side = cross(x, m, 0, 1, 2, -0.3, 0.3).map(Math.abs).filter((z) => z > 0.004);
    bins.set(k, { lo, hi, w: side.length ? Math.min(...side) : 0.05 });
  }
  // The middle of her, and a smooth curve through it (least squares, a cubic
  // over her length): where her colours change has no business following
  // every bump in her skin.
  const pts = [...bins.entries()].map(([k, b]) => [(k + 0.5) * STEP, (b.lo + b.hi) / 2]);
  const fit = (() => {
    const N = 4, A = Array.from({ length: N }, () => new Array(N + 1).fill(0));
    for (const [x, y] of pts) {
      const p = [1, x, x * x, x * x * x];
      for (let i = 0; i < N; i++) { for (let j = 0; j < N; j++) A[i][j] += p[i] * p[j]; A[i][N] += p[i] * y; }
    }
    for (let i = 0; i < N; i++) {
      let m = i; for (let r = i + 1; r < N; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
      [A[i], A[m]] = [A[m], A[i]];
      for (let r = 0; r < N; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c <= N; c++) A[r][c] -= f * A[i][c]; }
    }
    return A.map((row, i) => row[N] / row[i]);
  })();
  const xs = pts.map((p) => p[0]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const mid = (x) => { const u = Math.min(x1, Math.max(x0, x)); return fit[0] + fit[1] * u + fit[2] * u * u + fit[3] * u * u * u; };
  const near = (x) => {
    const k0 = Math.floor(x / STEP);
    for (let d = 0; d < 20; d++) for (const k of [k0 - d, k0 + d]) if (bins.has(k)) return bins.get(k);
    return null;
  };
  const half = (x) => { const b = near(x); return b ? (b.hi - b.lo) / 2 : 0.05; };
  const width = (x) => { const b = near(x); return b ? b.w : 0.06; };
  /** Her wing where it crosses `z` out from her centreline, between `ylo` and `yhi`. */
  const wingAt = (zAt, ylo = -1, yhi = 1) => {
    let lo = Infinity, hi = -Infinity, ys = 0, n = 0;
    for (let x = -1; x <= 1; x += 0.005) {
      const h = cross(x, zAt, 0, 2, 1, ylo, yhi);
      if (!h.length) continue;
      lo = Math.min(lo, x); hi = Math.max(hi, x);
      ys += h.reduce((a, b) => a + b, 0) / h.length; n++;
    }
    return n ? { x: (lo + hi) / 2, le: lo, chord: hi - lo, y: ys / n } : null;
  };
  // Her leading edge, station by station out along her wing (`leBand`: the
  // heights her wing is between).
  const LE = new Map();
  const le = (zAt) => {
    const k = Math.round(zAt / 0.02);
    if (!LE.has(k)) LE.set(k, fus.leBand ? wingAt(k * 0.02, ...fus.leBand) : null);
    return LE.get(k);
  };
  return { yc: mid, half, width, wingAt, le, xmax };
}

// ---- her paint --------------------------------------------------------------
/**
 * A texture painted off a function of where on her a point is. Each tile is
 * split by how far along the way it looks a face stands (`W`), so that two
 * surfaces one over the other -- a biplane's two wings, a wing and the float
 * under it -- are painted each in its own place, and the painter is told
 * where that is.
 */
function atlasOf(paint, W = 0.03) {
  return {
    size: 2048, pieces: ['body', 'spin0'],
    layer: ({ o, axis }) => String(Math.floor(o[axis] / W)),
    paint: ({ piece, axis, sign, layer, a, b }) => {
      const d = (Number(layer) + 0.5) * W;
      const [x, y, z] = axis === 0 ? [d, b, a] : axis === 1 ? [a, d, b] : [a, b, d];
      return paint({ piece, axis, sign, x, y, z });
    },
  };
}

/**
 * A scheme, painted. `s` is:
 *   upper, under   her colours, each a colour or a function of the point
 *   split          how far over (+) or under (-) the middle of her fuselage
 *                  her sides change from the one to the other
 *   prop           { hub: [y, z], blade, tip, tipFrom, spinner, spinnerR }
 *   cowl           { x, colour }: forward of x and within her nose
 *   glass          [{ x0, x1, y0, y1, z, frame }]
 *   marks          [{ on: 'top'|'bottom'|'side'|'fin', at, r, draw, wing }]
 *   extra          (point) -> colour or null, for what is her own
 */
function scheme(s, F) {
  const pick = (c, q) => (typeof c === 'function' ? c(q) : c);
  const GLASS = [0.2, 0.26, 0.3];
  return (q) => {
    const { piece, axis, sign, x, y, z } = q;
    if (piece === 'spin0') {
      const p = s.prop;
      const r = hyp(y - p.hub[0], z - (p.hub[1] || 0));
      if (r < (p.spinnerR || 0)) return p.spinner || p.blade;
      return r > p.tipFrom ? p.tip : p.blade;
    }
    for (const g of s.glass || []) {
      if (x > g.x0 && x < g.x1 && y > g.y0 && y < (g.y1 ?? 9) && Math.abs(z) < g.z) {
        if (g.frame && ((x - g.x0) % g.frame) < 0.008) return pick(s.frameColour || s.upper, q);
        return GLASS;
      }
    }
    for (const m of F.marks) {
      let c = null;
      if (m.on === 'top' || m.on === 'bottom') {
        if (axis !== 1 || (m.on === 'top') !== (sign > 0) || Math.abs(y - m.y) > 0.045) continue;
        const zz = m.side ? z * m.side : Math.abs(z);
        if (zz < 0) continue;
        // Up the marking is forward, along her -x.
        c = m.draw(zz - m.z, -(x - m.x), m.r);
      } else if (m.on === 'side') {
        if (axis !== 2 || Math.abs(z) > F.width(m.x) + 0.02) continue;
        c = m.draw(x - m.x, y - m.y, m.r);
      } else if (m.on === 'fin') {
        if (axis !== 2 || Math.abs(z) > 0.04) continue;
        c = m.draw(x - m.x, y - m.y, m.r);
      }
      if (c) return c;
    }
    if (s.extra) { const c = s.extra(q, F); if (c) return c; }
    if (s.cowl && x < s.cowl.x && hyp(y - s.prop.hub[0], z) < (s.cowl.r || 0.2)) return s.cowl.colour;
    // What hangs under her fuselage -- her floats and their struts -- is in
    // her under colour all over: told by which way each face looks, a float's
    // rounded back would come out ragged along its length.
    if (!s.splitY && y < F.yc(x) - F.half(x) - 0.015) return pick(s.under, q);
    const up = axis === 1 ? sign > 0 : y > (s.splitY ?? F.yc(x) + (s.split || 0));
    return pick(up ? s.upper : s.under, q);
  };
}

/**
 * Splinter camouflage: two colours in straight-edged patches. A handful of
 * straight lines are drawn across her, and which side of each a point is on,
 * taken together, says which colour it is: the patches are the polygons
 * between them, sharp-cornered and no two the same, as the pattern was
 * masked out with straight edges on the real thing. On her top she is seen
 * from above (x, z); on her sides from abeam (x, y), with the lines carried
 * down over her from the top.
 */
function splinter(a, b, n = 9, seed = 7) {
  let r = seed;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const lines = Array.from({ length: n }, () => {
    const th = rnd() * Math.PI;
    return { nx: Math.cos(th), nz: Math.sin(th), c: (rnd() - 0.5) * 1.4 };
  });
  return ({ x, y, z, axis }) => {
    // From abeam the lines are laid over her as if folded down her sides.
    const w = axis === 1 ? z : (z >= 0 ? 1 : -1) * (0.12 + Math.max(0, 0.25 - y) * 0.8);
    let p = 0;
    for (const l of lines) if (l.nx * x + l.nz * w > l.c) p++;
    return p % 2 ? a : b;
  };
}

/**
 * One kind. `o` is: src, length, spanTo, keep, fus ({ ylo, yhi }: where her
 * fuselage is told from her floats and her wings by height), piece, hub, the
 * scheme, and the marks, which are placed on her once she is measured:
 *   wing marks  { on, wing: [z, ylo, yhi], rf, draw, side }: on her wing
 *               where it crosses z, at the middle of its chord, rf of the
 *               chord across
 *   side marks  { on: 'side', x, rf, draw }: on her fuselage at x, rf of her
 *               depth there across
 */
function kind(o) {
  let F = null;
  const K = {
    src: `meshy-aircraft/${o.src}`, length: o.length, spanTo: o.spanTo, keep: o.keep ?? 0.24, nose: '-x',
    rework: o.rework,
    prep: ({ model, P0 }) => {
      F = survey(model, P0, o.fus);
      F.marks = [];
      for (const m of o.marks || []) {
        if (m.wing) {
          const w = F.wingAt(...m.wing);
          if (!w) throw new Error(`${o.src}: no wing at z ${m.wing[0]}`);
          F.marks.push({ ...m, x: w.x, y: w.y, z: m.wing[0], r: m.r ?? w.chord * (m.rf ?? 0.36) });
        } else if (m.on === 'side') {
          const y = m.y ?? F.yc(m.x);
          F.marks.push({ ...m, y, r: m.r ?? F.half(m.x) * (m.rf ?? 0.8) });
        } else F.marks.push(m);
      }
      F.paint = scheme(o.scheme, F);
      if (process.env.MARKS) console.log('survey', [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6].map((x) => `${x}: mid ${F.yc(x).toFixed(3)} half ${F.half(x).toFixed(3)} w ${F.width(x).toFixed(3)}`).join(' | '));
      if (process.env.MARKS) console.log(JSON.stringify(F.marks.map(({ on, x, y, z, r }) => ({ on, x, y, z, r })), (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
    },
    piece: ({ o: [x, y, z] }) => o.piece(x, y, z),
    spins: [{ name: 'prop', hub: hubOf(o.hub), axis: 'z' }],
    // Corner colours, which the texture is drawn over; and the Wildcat's
    // legs, which are not on it.
    paint: ({ piece }) => lin(piece === 'gear' ? (o.gear || [0.3, 0.3, 0.3]) : piece === 'spin0' ? o.scheme.prop.blade : pickUnder(o.scheme)),
    atlas: atlasOf((q) => F.paint(q)),
  };
  if (o.guns) K.guns = o.guns;
  return K;
}
const pickUnder = (s) => (typeof s.under === 'function' ? [0.6, 0.6, 0.6] : s.under);

// ---- a float put where her type had it ----------------------------------------
/**
 * The KOR-1 and the Ro.43 each sat on one big float on her centreline, with a
 * little one under each lower wingtip to keep her level. The model has her
 * on two: they are cut away with their struts, and one of them is put back on
 * her centreline a little broader, two more at a third of its size under her
 * wingtips, and each is strutted up to her.
 */
function singleFloat(model) {
  const { P, T, UV, M, L, NY } = model;
  const nt = T.length / 3;
  const cen = (t) => [0, 1, 2].map((k) => (P[T[t * 3] * 3 + k] + P[T[t * 3 + 1] * 3 + k] + P[T[t * 3 + 2] * 3 + k]) / 3);
  const keep = [], float = [];
  for (let t = 0; t < nt; t++) {
    const [x, y, z] = cen(t);
    if (y < -0.17 && z > 0.1 && z < 0.4) float.push(t);
    // The two floats, their struts and the spreader between them; the tail
    // wheel, which no floatplane has; and the skids under her wingtips.
    const drop = (y < -0.078 && x < 0.4 && Math.abs(z) < 0.5)
      || (x > 0.55 && y < -0.04 && Math.abs(z) < 0.05)
      || (Math.abs(z) > 0.5 && y < -0.075);
    if (!drop) keep.push(t);
  }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const t of float) for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) {
    const v = P[T[t * 3 + k] * 3 + c]; lo[c] = Math.min(lo[c], v); hi[c] = Math.max(hi[c], v);
  }
  const [xc, zc] = [(lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2];
  const T2 = [], M2 = [], L2 = [];
  for (const t of keep) { T2.push(T[t * 3], T[t * 3 + 1], T[t * 3 + 2]); M2.push(M[t]); L2.push(L[t]); }
  const m0 = M[float[0]], l0 = L[float[0]];
  const copy = (f) => {
    const map = new Map();
    for (const t of float) {
      for (let k = 0; k < 3; k++) {
        const v = T[t * 3 + k];
        let n = map.get(v);
        if (n === undefined) {
          n = P.length / 3;
          P.push(...f(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]));
          UV.push(UV[v * 2] || 0, UV[v * 2 + 1] || 0);
          NY.push(0);
          map.set(v, n);
        }
        T2.push(n);
      }
      M2.push(m0); L2.push(l0);
    }
  };
  // On her centreline, half as broad again, at the height they were.
  copy((x, y, z) => [x, y, (z - zc) * 1.5]);
  // Under her lower wingtips, a third of the size.
  const TIP = { x: -0.29, z: 0.76, top: -0.112, s: 0.32 };
  for (const s of [-1, 1]) copy((x, y, z) => [(x - xc) * TIP.s + TIP.x, (y - hi[1]) * TIP.s + TIP.top, (z - zc) * TIP.s + s * TIP.z]);
  // And the struts: a round section, smooth, its ends buried in what it joins.
  const strut = (a, b, r = 0.0065, seg = 12) => {
    const d = b.map((v, i) => v - a[i]);
    const len = hyp(...d);
    const n = d.map((v) => v / len);
    const ref = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = [n[1] * ref[2] - n[2] * ref[1], n[2] * ref[0] - n[0] * ref[2], n[0] * ref[1] - n[1] * ref[0]];
    const ul = hyp(...u); u = u.map((v) => v / ul);
    const w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const base = P.length / 3;
    for (const e of [a, b]) {
      for (let i = 0; i < seg; i++) {
        const th = (i / seg) * Math.PI * 2;
        P.push(...[0, 1, 2].map((c) => e[c] + r * (u[c] * Math.cos(th) + w[c] * Math.sin(th))));
        UV.push(0, 0); NY.push(0);
      }
    }
    for (let i = 0; i < seg; i++) {
      const i1 = (i + 1) % seg;
      T2.push(base + i, base + i1, base + seg + i, base + i1, base + seg + i1, base + seg + i);
      M2.push(m0, m0); L2.push(l0, l0);
    }
  };
  for (const x of [-0.47, -0.2]) for (const s of [-1, 1]) strut([x, -0.19, s * 0.012], [x, -0.05, s * 0.045]);
  for (const s of [-1, 1]) strut([-0.47, -0.19, s * 0.01], [-0.2, -0.055, s * 0.04]);
  for (const s of [-1, 1]) {
    for (const x of [-0.34, -0.24]) strut([x, -0.125, s * TIP.z], [x, -0.05, s * (TIP.z - 0.02)], 0.005);
  }
  T.length = 0; M.length = 0; L.length = 0;
  for (let i = 0; i < T2.length; i++) T.push(T2[i]);
  for (let i = 0; i < M2.length; i++) { M.push(M2[i]); L.push(L2[i]); }
}

// ---- the kinds ------------------------------------------------------------------
const USN_BLUE = [0.33, 0.4, 0.47], USN_GREY = [0.72, 0.73, 0.72];
const usProp = (hubY, R) => ({ hub: [hubY], blade: [0.08, 0.08, 0.08], tip: [0.85, 0.7, 0.12], tipFrom: R * 0.88 });
const RLM72 = [0.29, 0.33, 0.27], RLM73 = [0.21, 0.25, 0.21], RLM65 = [0.55, 0.65, 0.7];
const D1 = [0.18, 0.24, 0.17], J3 = [0.64, 0.63, 0.53];
const EDSG = [0.27, 0.3, 0.32], DSG = [0.25, 0.3, 0.26], SKY = [0.62, 0.67, 0.56];
const METAL = [0.6, 0.6, 0.58];

/** Rudder stripes, fore to aft, over the after `w` of her fin, above `y0`. */
const stripes = (cols, w, y0) => ({ x, y, z, axis }, F) => {
  if (axis !== 2 || Math.abs(z) > 0.04 || x < F.xmax - w || y < y0) return null;
  return cols[Math.min(cols.length - 1, Math.floor(((x - (F.xmax - w)) / w) * cols.length))];
};

const KOR1_FUS = { ylo: -0.075, yhi: 0.2 };
const KOR1_PIECE = (x, y, z) => ((x < -0.632 || (x < -0.618 && hyp(y - 0.09, z) > 0.14)) && hyp(y - 0.09, z) < 0.22 ? 'spin0' : 'body');

export const MESHY_KINDS = {
  arado: kind({
    src: 'arado.glb', length: 11.0, spanTo: 12.44, hub: [-0.61, 0.04],
    fus: { ylo: -0.12, yhi: 0.2 },
    piece: (x, y, z) => (x < -0.584 && hyp(y - 0.04, z) < 0.21 ? 'spin0' : 'body'),
    scheme: {
      upper: splinter(RLM72, RLM73, 9, 11), under: RLM65, split: 0.03,
      prop: { hub: [0.04], blade: [0.17, 0.2, 0.16], tip: [0.17, 0.2, 0.16], tipFrom: 1 },
      glass: [{ x0: -0.3, x1: 0.035, y0: 0.06, z: 0.065, frame: 0.055 }],
    },
    marks: [
      { on: 'top', wing: [0.66, -0.1, 0.12], rf: 0.3, draw: balken },
      { on: 'bottom', wing: [0.66, -0.1, 0.12], rf: 0.3, draw: balken },
      { on: 'side', x: 0.3, rf: 0.75, draw: balken },
    ],
    // Her two 20 mm in her wings and her MG 17 over her cowling.
    guns: [[-2.2, 1.65, 2.3], [2.2, 1.65, 2.3], [0.22, 2.6, 3.8]],
  }),
  kingfisher: kind({
    src: 'kingfisher.glb', length: 10.31, spanTo: 10.95, hub: [-0.78, 0.086],
    fus: { ylo: -0.05, yhi: 0.29 },
    piece: (x, y, z) => (x < -0.764 && hyp(y - 0.086, z) < 0.26 ? 'spin0' : 'body'),
    scheme: {
      upper: USN_BLUE, under: USN_GREY,
      prop: usProp(0.086, 0.24),
      glass: [{ x0: -0.36, x1: 0.25, y0: 0.19, y1: 0.29, z: 0.09, frame: 0.07 }],
    },
    marks: [
      { on: 'top', wing: [0.6, -0.1, 0.25], rf: 0.36, draw: usStar, side: 1 },
      { on: 'bottom', wing: [0.6, -0.1, 0.25], rf: 0.36, draw: usStar, side: -1 },
      { on: 'side', x: 0.38, rf: 0.8, draw: usStar },
    ],
  }),
  besson: kind({
    src: 'besson.glb', length: 8.37, spanTo: 12.19, hub: [-0.78, 0.121],
    fus: { ylo: -0.08, yhi: 0.24 },
    piece: (x, y, z) => (x < -0.758 && hyp(y - 0.121, z) < 0.29 ? 'spin0' : 'body'),
    scheme: {
      upper: [0.66, 0.68, 0.68], under: [0.62, 0.64, 0.65],
      prop: { hub: [0.121], blade: METAL, tip: METAL, tipFrom: 1 },
      glass: [{ x0: -0.567, x1: -0.143, y0: 0.095, y1: 0.215, z: 0.11 }],
      extra: stripes([FR_BLUE, WHITE, FR_RED], 0.12, 0.12),
    },
    marks: [
      { on: 'top', wing: [0.7, 0.2, 0.32], rf: 0.36, draw: cocarde },
      { on: 'bottom', wing: [0.7, 0.2, 0.32], rf: 0.36, draw: cocarde },
    ],
  }),
  loire: kind({
    src: 'loire.glb', length: 11.3, spanTo: 16.0, hub: [0.228, 0.112], keep: 0.28,
    fus: { ylo: -0.35, yhi: -0.03 },
    piece: (x, y, z) => (x > 0.212 && x < 0.32 && hyp(y - 0.112, z) < 0.205 && !(x > 0.245 && y < 0.095) ? 'spin0' : 'body'),
    scheme: {
      upper: [0.62, 0.65, 0.66], under: [0.56, 0.59, 0.6], split: -0.06,
      prop: { hub: [0.112], blade: METAL, tip: METAL, tipFrom: 1, spinner: METAL },
      glass: [{ x0: -0.335, x1: -0.16, y0: -0.075, y1: -0.035, z: 0.08 }],
      extra: stripes([FR_BLUE, WHITE, FR_RED], 0.1, -0.02),
    },
    marks: [
      { on: 'top', wing: [0.72, -0.06, 0.08], rf: 0.36, draw: cocarde },
      { on: 'bottom', wing: [0.72, -0.06, 0.08], rf: 0.36, draw: cocarde },
      { on: 'side', x: 0.3, rf: 0.55, draw: cocarde },
    ],
  }),
  walrus: kind({
    src: 'walrus.glb', length: 11.45, spanTo: 14.0, hub: [0.22, 0.107], keep: 0.28,
    fus: { ylo: -0.35, yhi: 0.05 },
    piece: (x, y, z) => (x > 0.198 && x < 0.27 && hyp(y - 0.107, z) < 0.185 && !(x > 0.238 && y > 0.17) ? 'spin0' : 'body'),
    scheme: {
      upper: splinter(EDSG, DSG, 7, 5), under: SKY, splitY: -0.2,
      prop: { hub: [0.107], blade: [0.1, 0.1, 0.1], tip: RN_YELLOW, tipFrom: 0.16, spinner: [0.1, 0.1, 0.1] },
      glass: [{ x0: -0.44, x1: -0.2, y0: -0.03, z: 0.07, frame: 0.06 }],
      extra: stripes([RN_RED, WHITE, RN_BLUE], 0.12, 0.02),
    },
    marks: [
      { on: 'top', wing: [0.75, 0.15, 0.3], rf: 0.4, draw: roundelB },
      { on: 'bottom', wing: [0.75, -0.15, -0.04], rf: 0.4, draw: roundelA },
      { on: 'side', x: 0.25, rf: 0.6, draw: roundelA1 },
    ],
  }),
  kor1: kind({
    src: 'kor1.glb', length: 8.67, spanTo: 11.0, hub: [-0.645, 0.09], rework: singleFloat,
    fus: KOR1_FUS, piece: KOR1_PIECE,
    scheme: {
      upper: [0.26, 0.33, 0.2], under: [0.53, 0.62, 0.68],
      prop: { hub: [0.09], blade: [0.2, 0.18, 0.15], tip: [0.2, 0.18, 0.15], tipFrom: 1 },
    },
    marks: [
      { on: 'top', wing: [0.75, 0.2, 0.33], rf: 0.4, draw: redStar },
      { on: 'bottom', wing: [0.75, -0.1, 0.0], rf: 0.4, draw: redStar },
      { on: 'fin', x: 0.68, y: 0.19, r: 0.055, draw: redStar },
    ],
  }),
  // The Ro.43 on the KOR-1's airframe, at her own size: the two were the one
  // kind of aeroplane, a two-seat biplane scout on one float with a radial
  // in her nose, built for the same work off the same kind of catapult.
  ro43: kind({
    src: 'kor1.glb', length: 9.71, spanTo: 11.57, hub: [-0.645, 0.09], rework: singleFloat,
    fus: KOR1_FUS, piece: KOR1_PIECE,
    scheme: {
      upper: [0.33, 0.37, 0.42], under: [0.6, 0.65, 0.68],
      prop: { hub: [0.09], blade: METAL, tip: METAL, tipFrom: 1 },
      // The white band round her fuselage, and the white cross on her rudder.
      extra: ({ x, y, z, axis }, F) => {
        if (x > 0.33 && x < 0.37 && Math.abs(z) < F.width(x) + 0.01 && Math.abs(y - F.yc(x)) < F.half(x) + 0.01) return WHITE;
        if (axis === 2 && Math.abs(z) < 0.04 && x > 0.6 && y > 0.06 && (Math.abs(x - 0.72) < 0.014 || Math.abs(y - 0.18) < 0.014)) return WHITE;
        return null;
      },
    },
    marks: [
      { on: 'top', wing: [0.75, 0.2, 0.33], rf: 0.42, draw: fasci },
      { on: 'bottom', wing: [0.75, -0.1, 0.0], rf: 0.42, draw: fasci },
    ],
  }),
  jake: kind({
    src: 'jake.glb', length: 10.0, spanTo: 14.5, hub: [-0.54, 0.119],
    fus: { ylo: -0.1, yhi: 0.3, leBand: [-0.08, 0.1] },
    piece: (x, y, z) => (x < -0.524 && hyp(y - 0.119, z) < 0.23 ? 'spin0' : 'body'),
    scheme: {
      upper: D1, under: J3, split: 0.01,
      prop: { hub: [0.119], blade: METAL, tip: HINO, tipFrom: 0.17, spinner: METAL, spinnerR: 0.03 },
      cowl: { x: -0.415, r: 0.135, colour: [0.1, 0.1, 0.11] },
      glass: [{ x0: -0.25, x1: 0.02, y0: 0.135, z: 0.07, frame: 0.05 }],
      // Yellow along her wings' leading edges, inboard.
      extra: ({ x, y, z, axis, sign }, F) => {
        if (axis !== 1 || sign < 0 || Math.abs(z) < 0.14 || Math.abs(z) > 0.45) return null;
        const w = F.le(Math.abs(z));
        return w && Math.abs(y - w.y) < 0.04 && x < w.le + 0.035 ? [0.85, 0.6, 0.1] : null;
      },
    },
    marks: [
      { on: 'top', wing: [0.62, -0.08, 0.1], rf: 0.36, draw: hinomaruRinged },
      { on: 'bottom', wing: [0.62, -0.08, 0.1], rf: 0.36, draw: hinomaru },
      { on: 'side', x: 0.3, rf: 0.8, draw: hinomaruRinged },
    ],
  }),
  wildcat: kind({
    src: 'wildcat.glb', length: 8.76, spanTo: 11.58, hub: [-0.75, 0.098],
    fus: { ylo: -0.19, yhi: 0.25 },
    // Her airscrew; her main legs and wheels, which fold up into her belly;
    // and her tailwheel.
    piece: (x, y, z) => {
      if (x < -0.692 && hyp(y - 0.098, z) < 0.3) return 'spin0';
      if (Math.abs(z) > 0.095 && Math.abs(z) < 0.2 && y < -0.1 && x > -0.62 && x < -0.3) return 'gear';
      if (x > 0.5 && y < -0.13 && Math.abs(z) < 0.05) return 'gear';
      return 'body';
    },
    gear: [0.2, 0.2, 0.21],
    scheme: {
      upper: USN_BLUE, under: USN_GREY,
      prop: usProp(0.098, 0.28),
      glass: [{ x0: -0.243, x1: 0.03, y0: 0.16, z: 0.07, frame: 0.06 }],
    },
    marks: [
      { on: 'top', wing: [0.62, -0.1, 0.1], rf: 0.36, draw: usStar, side: 1 },
      { on: 'bottom', wing: [0.62, -0.1, 0.1], rf: 0.36, draw: usStar, side: -1 },
      { on: 'side', x: 0.3, rf: 0.85, draw: usStar },
    ],
    // Her .50s, two in each outer wing, as the game has always armed her.
    guns: [[-3.4, 1.45, 1.5], [-3.0, 1.45, 1.6], [3.0, 1.45, 1.6], [3.4, 1.45, 1.5]],
  }),
};
