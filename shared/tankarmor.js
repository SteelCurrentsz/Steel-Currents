// A tank's armour and what is behind it.
//
// A ship is a set of zones, each one a stack of plates (see armor.js). A tank
// is small enough to be taken as it really is: a hull with a front, two sides,
// a back, a roof and a belly, each plate its own thickness and laid at its own
// angle, and a turret on top of it that turns. A round is traced as the line
// it flew along, into whichever face of the hull or turret it reaches first,
// and that face is met at the angle the line makes with it -- with the hull
// pitched and rolled on the ground it is standing on -- so a tank nosed up a
// bank shows its belly, one cresting a rise shows its roof, and one sitting
// with its hull behind a fold in the ground shows only the turret.
//
// What gets through the plate is then traced on inside: the shell itself,
// the spall it knocks off the inside of the plate, and the burst of its
// filling once the fuse has run. Each finds what is in its way -- five men,
// the engine, the transmission, the fuel, the ammunition in the sponsons,
// the breech of the gun, the turret ring -- and whatever it finds is what
// breaks. A tank is not worn down: it is stopped because a shell found its
// engine, silenced because one found its gunner, or gone because one found
// its ammunition.
//
// Frames: the hull's own. x across (+x the left side), y up off the ground
// under it, z along (+z the front), in metres. Its turret turns about a pivot
// on the centreline, and what is in the turret turns with it.

import { clamp } from './math.js';

const D = Math.PI / 180;

/**
 * The M4A2's layout. Thicknesses in millimetres; `lay` how far a plate is
 * laid back from the vertical, in radians. Heights off the ground.
 */
export const SHERMAN_ARMOUR = {
  hull: {
    // The box the hull and its running gear fill.
    x: 1.31, y0: 0.3, y1: 1.88, z: 2.96,
    // The glacis (upper front) and the transmission cover under it.
    glacisFrom: 1.05,
    glacis: { t: 51, lay: 56 * D },
    nose: { t: 64, lay: 28 * D },
    side: { t: 38, lay: 0 },
    // Below the sponsons the hull side is behind the tracks and the bogies:
    // the running gear is the first thing a round meets there.
    trackTo: 1.0, track: { t: 20, lay: 0 },
    rear: { t: 38, lay: 10 * D },
    roof: { t: 19, lay: 90 * D },
    deck: { t: 13, lay: 90 * D }, // the engine deck, its grilles
    belly: { t: 13, lay: 90 * D },
  },
  turret: {
    // A cast turret: taken as an upright cylinder, which is near enough the
    // shape that a round into its front is met on a curve.
    pz: 0.25, r: 0.95, y0: 1.88, y1: 2.74,
    mantlet: { t: 89, lay: 0, half: 14 * D },
    front: { t: 76, lay: 30 * D, half: 42 * D },
    side: { t: 51, lay: 5 * D },
    rear: { t: 51, lay: 0, from: 140 * D },
    roof: { t: 25, lay: 90 * D },
  },
  // What is inside, as boxes: centre [x, y, z] and half-size [x, y, z];
  // `tough` how much more than a man it takes to wreck.
  // `t` marks what turns with the turret (in the turret's frame, about its
  // pivot). Men are `crew`; everything else is a part.
  inside: [
    { k: 'driver', crew: true, c: [0.55, 1.25, 1.75], h: [0.28, 0.4, 0.32] },
    { k: 'codriver', crew: true, c: [-0.55, 1.25, 1.75], h: [0.28, 0.4, 0.32] },
    { k: 'gunner', crew: true, t: true, c: [-0.45, 1.95, 0.45], h: [0.26, 0.42, 0.3] },
    { k: 'commander', crew: true, t: true, c: [-0.35, 2.3, -0.25], h: [0.26, 0.42, 0.3] },
    { k: 'loader', crew: true, t: true, c: [0.5, 1.95, 0.0], h: [0.26, 0.42, 0.3] },
    { k: 'engine', c: [0, 1.05, -1.95], h: [0.85, 0.5, 0.75], solid: true, tough: 1.6 },
    { k: 'transmission', c: [0, 0.8, 2.35], h: [0.8, 0.35, 0.45], solid: true, tough: 1.6 },
    { k: 'fuelL', c: [1.0, 1.2, -1.35], h: [0.25, 0.45, 0.85] },
    { k: 'fuelR', c: [-1.0, 1.2, -1.35], h: [0.25, 0.45, 0.85] },
    // The ammunition, most of it in the sponsons either side over the tracks.
    { k: 'ammoL', c: [1.0, 1.55, 0.35], h: [0.28, 0.25, 0.75] },
    { k: 'ammoR', c: [-1.0, 1.55, 0.6], h: [0.28, 0.25, 0.5] },
    { k: 'breech', t: true, c: [0, 2.15, 0.55], h: [0.22, 0.2, 0.45], solid: true, tough: 2 },
    // The ring is a hoop of heavy steel round the edge of that: it takes a
    // hit right on it to jam it.
    { k: 'ring', c: [0, 1.86, 0.25], h: [0.9, 0.08, 0.9], tough: 3 },
    { k: 'trackL', c: [1.12, 0.5, 0], h: [0.2, 0.5, 2.9], outside: true },
    { k: 'trackR', c: [-1.12, 0.5, 0], h: [0.2, 0.5, 2.9], outside: true },
  ],
};

/** The tanks' layouts, by tank id. */
export const TANK_ARMOUR = { sherman: SHERMAN_ARMOUR };

/** What each part is called on the screen. */
export const PART_NAMES = {
  driver: 'Driver', codriver: 'Co-driver', gunner: 'Gunner', commander: 'Commander', loader: 'Loader',
  engine: 'Engine', transmission: 'Transmission', fuelL: 'Fuel tank', fuelR: 'Fuel tank',
  ammoL: 'Ammunition', ammoR: 'Ammunition', breech: 'Gun', ring: 'Turret ring',
  trackL: 'Left track', trackR: 'Right track',
};

export const CREW = ['driver', 'codriver', 'gunner', 'commander', 'loader'];

/** How much it takes to wreck each part, against a man's one. */
export function partTough(A, k) {
  return A.inside.find((q) => q.k === k)?.tough || 1;
}

/** A tank's own state of repair, fresh from the factory. */
export function freshTankDamage(tankId) {
  const A = TANK_ARMOUR[tankId] || SHERMAN_ARMOUR;
  const parts = {};
  for (const q of A.inside) parts[q.k] = 0;
  return { parts, fire: null, cook: -1, repair: 0, swap: 0, roles: null };
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

/**
 * The hull's axes in its yaw frame (x across, y up, z along), pitched nose
 * up by `pitch` and rolled left side up by `roll`.
 */
function hullAxes(pitch, roll) {
  const f = [0, Math.sin(pitch), Math.cos(pitch)];
  let l = [Math.cos(roll), Math.sin(roll), 0];
  const d = l[0] * f[0] + l[1] * f[1] + l[2] * f[2];
  l = [l[0] - d * f[0], l[1] - d * f[1], l[2] - d * f[2]];
  const n = Math.hypot(l[0], l[1], l[2]) || 1;
  l = [l[0] / n, l[1] / n, l[2] / n];
  const u = [f[1] * l[2] - f[2] * l[1], f[2] * l[0] - f[0] * l[2], f[0] * l[1] - f[1] * l[0]];
  return { l, u, f };
}

/** A world vector (dx, dy, dz) into the hull's frame. */
function toHull(bat, dx, dy, dz, ax) {
  const s = Math.sin(bat.heading);
  const c = Math.cos(bat.heading);
  const x = dx * c - dz * s;
  const z = dx * s + dz * c;
  const v = [x, dy, z];
  const dot = (a) => a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
  return [dot(ax.l), dot(ax.u), dot(ax.f)];
}

/** From the hull's frame into the turret's, which is turned `a` off the hull's centreline about its pivot. */
function toTurret(p, a, pz) {
  const s = Math.sin(a);
  const c = Math.cos(a);
  const x = p[0];
  const z = p[2] - pz;
  // Turned toward +x by a positive angle (see stepBatteries): its own
  // forward is (sin a, cos a) in the hull's frame.
  return [x * c - z * s, p[1], x * s + z * c];
}

function dirToTurret(d, a) {
  const s = Math.sin(a);
  const c = Math.cos(a);
  return [d[0] * c - d[2] * s, d[1], d[0] * s + d[2] * c];
}

/** Where a box is first entered along p + d·t, for t in [0, len]: { t, axis, sign } or null. */
function boxEntry(p, d, lo, hi, len) {
  let t0 = 0;
  let t1 = len;
  let axis = -1;
  let sign = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (p[i] < lo[i] || p[i] > hi[i]) return null;
      continue;
    }
    let a = (lo[i] - p[i]) / d[i];
    let b = (hi[i] - p[i]) / d[i];
    let s = -1;
    if (a > b) { const q = a; a = b; b = q; s = 1; }
    if (a > t0) { t0 = a; axis = i; sign = s; }
    if (b < t1) t1 = b;
    if (t0 > t1) return null;
  }
  return { t: t0, out: t1, axis, sign };
}

// ---------------------------------------------------------------------------
// Where a round strikes
// ---------------------------------------------------------------------------

/**
 * The first face of the tank the line from p0 to p1 (world points) strikes,
 * or null. `y` is the height of the ground the tank stands on; `pitch` and
 * `roll` how it is lying on it.
 *
 * Returns the point struck and the line's direction in the hull's frame, the
 * plate or plates met there outside in, and the cosine each is met at.
 */
export function tankStrike(bat, A, p0, p1) {
  const ax = hullAxes(bat.pitch || 0, bat.roll || 0);
  const a = toHull(bat, p0.x - bat.x, p0.y - bat.y, p0.z - bat.z, ax);
  const b = toHull(bat, p1.x - bat.x, p1.y - bat.y, p1.z - bat.z, ax);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  if (!(len > 1e-6)) return null;
  const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len, (b[2] - a[2]) / len];
  const H = A.hull;
  const T = A.turret;
  let best = null;

  // The hull.
  const hb = boxEntry(a, d, [-H.x, H.y0, -H.z], [H.x, H.y1, H.z], len);
  if (hb && hb.axis >= 0) {
    const p = [a[0] + d[0] * hb.t, a[1] + d[1] * hb.t, a[2] + d[2] * hb.t];
    let plates;
    let n;
    // `sign` 1: in through the face at the top of that axis (the front, the
    // left side, the roof); -1: through the one at the bottom of it.
    if (hb.axis === 2 && hb.sign > 0) {
      // The front: the glacis over the transmission cover, both laid back.
      const P = p[1] >= H.glacisFrom ? H.glacis : H.nose;
      n = [0, Math.sin(P.lay), Math.cos(P.lay)];
      plates = [{ k: p[1] >= H.glacisFrom ? 'glacis' : 'nose', ...P }];
    } else if (hb.axis === 2) {
      n = [0, Math.sin(H.rear.lay), -Math.cos(H.rear.lay)];
      plates = [{ k: 'rear', ...H.rear }];
    } else if (hb.axis === 0) {
      const sx = hb.sign > 0 ? 1 : -1;
      n = [sx, 0, 0];
      plates = p[1] < H.trackTo
        ? [{ k: sx > 0 ? 'trackL' : 'trackR', ...H.track }, { k: 'side', ...H.side }]
        : [{ k: 'side', ...H.side }];
    } else if (hb.sign > 0) {
      n = [0, 1, 0];
      plates = [p[2] < -0.9 ? { k: 'deck', ...H.deck } : { k: 'roof', ...H.roof }];
    } else {
      n = [0, -1, 0];
      plates = [{ k: 'belly', ...H.belly }];
    }
    best = { t: hb.t, p, n, plates, part: 'hull' };
  }

  // The turret, as an upright cylinder about its pivot.
  const tp = toTurret(a, bat.angle || 0, T.pz);
  const td = dirToTurret(d, bat.angle || 0);
  const hit = cylEntry(tp, td, T.r, T.y0, T.y1, len);
  if (hit && (!best || hit.t < best.t)) {
    const q = [tp[0] + td[0] * hit.t, tp[1] + td[1] * hit.t, tp[2] + td[2] * hit.t];
    let n;
    let plates;
    if (hit.roof) {
      n = [0, 1, 0];
      plates = [{ k: 'troof', ...T.roof }];
    } else {
      // Its bearing off the turret's own front.
      const phi = Math.atan2(q[0], q[2]);
      const ax0 = Math.abs(phi);
      const rx = q[0] / T.r;
      const rz = q[2] / T.r;
      const P = ax0 < T.mantlet.half ? { k: 'mantlet', ...T.mantlet }
        : ax0 < T.front.half ? { k: 'tfront', ...T.front }
          : ax0 >= T.rear.from ? { k: 'trear', ...T.rear } : { k: 'tside', ...T.side };
      n = [rx * Math.cos(P.lay), Math.sin(P.lay), rz * Math.cos(P.lay)];
      plates = [P];
    }
    best = { t: hit.t, p: q, n, plates, part: 'turret', d: td };
  }
  if (!best) return null;
  const dir = best.d || d;
  const cos = clamp(-(dir[0] * best.n[0] + dir[1] * best.n[1] + dir[2] * best.n[2]), 0, 1);
  // Back into the hull's frame for what comes after: the inside of the tank
  // is laid out there.
  let at = best.p;
  if (best.part === 'turret') at = fromTurret(best.p, bat.angle || 0, T.pz);
  return { f: best.t / len, at, dir: d, cos, plates: best.plates, part: best.part };
}

function fromTurret(q, a, pz) {
  const s = Math.sin(a);
  const c = Math.cos(a);
  return [q[0] * c + q[2] * s, q[1], -q[0] * s + q[2] * c + pz];
}

/** Where a line first enters an upright cylinder of radius r between heights y0 and y1, or null. */
function cylEntry(p, d, r, y0, y1, len) {
  let best = null;
  // Its roof.
  if (d[1] < -1e-9) {
    const t = (y1 - p[1]) / d[1];
    if (t >= 0 && t <= len) {
      const x = p[0] + d[0] * t;
      const z = p[2] + d[2] * t;
      if (x * x + z * z <= r * r) best = { t, roof: true };
    }
  }
  // Its wall.
  const A = d[0] * d[0] + d[2] * d[2];
  if (A > 1e-12) {
    const B = 2 * (p[0] * d[0] + p[2] * d[2]);
    const C = p[0] * p[0] + p[2] * p[2] - r * r;
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const t = (-B - Math.sqrt(disc)) / (2 * A);
      if (t >= 0 && t <= len) {
        const y = p[1] + d[1] * t;
        if (y >= y0 && y <= y1 && (!best || t < best.t)) best = { t, roof: false };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Behind the plate
// ---------------------------------------------------------------------------

/** A part's box in the hull's frame, turned with the turret if it is in it. */
function partBox(q, a, pz) {
  if (!q.t) return { c: q.c, h: q.h };
  const c = fromTurret(q.c, a, pz);
  // Turned, its footprint is the box round the turned one.
  const s = Math.abs(Math.sin(a));
  const k = Math.abs(Math.cos(a));
  return { c, h: [q.h[0] * k + q.h[2] * s, q.h[1], q.h[0] * s + q.h[2] * k] };
}

/** The parts along a line from p in direction d, as far as `len`, nearest first: [{ q, t }]. */
function along(A, angle, p, d, len, inside = true) {
  const out = [];
  for (const q of A.inside) {
    if (inside && q.outside) continue;
    const B = partBox(q, angle, A.turret.pz);
    const e = boxEntry(p, d, [B.c[0] - B.h[0], B.c[1] - B.h[1], B.c[2] - B.h[2]],
      [B.c[0] + B.h[0], B.c[1] + B.h[1], B.c[2] + B.h[2]], len);
    if (e) out.push({ q, t: e.t });
  }
  return out.sort((x, y) => x.t - y.t);
}

/** The parts within `r` of a point, with how close: [{ q, f }] where f is 1 at the point and 0 at r. */
function around(A, angle, p, r) {
  const out = [];
  for (const q of A.inside) {
    if (q.outside) continue;
    const B = partBox(q, angle, A.turret.pz);
    let s = 0;
    for (let i = 0; i < 3; i++) {
      const o = Math.max(0, Math.abs(p[i] - B.c[i]) - B.h[i]);
      s += o * o;
    }
    const dd = Math.sqrt(s);
    if (dd < r) out.push({ q, f: 1 - dd / r });
  }
  return out;
}

/** A direction within `half` radians of d, at random. */
function cone(d, half, rng) {
  const u = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let a = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  const na = Math.hypot(a[0], a[1], a[2]);
  a = [a[0] / na, a[1] / na, a[2] / na];
  const b = [d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0]];
  const th = Math.sqrt(rng()) * half;
  const ph = rng() * Math.PI * 2;
  const s = Math.sin(th);
  const c = Math.cos(th);
  return [0, 1, 2].map((i) => d[i] * c + (a[i] * Math.cos(ph) + b[i] * Math.sin(ph)) * s);
}

/**
 * What a round that got through does inside: a map of part → harm, 0 to 1
 * and more, where 1 is a part wrecked or a man killed.
 *
 * `core` whether the shell itself came in (an armour-piercing round through
 * the plate; not a high-explosive one that blew its way in); `burst` the
 * radius of the burst of its filling, if it went off inside, and how far in;
 * `spall` how many pieces of the plate came off its inside face.
 */
export function insideHarm(A, angle, at, dir, { core, coreLen = 4.5, burst = 0, burstAt = 0, spall = 0, rng }) {
  const harm = {};
  const add = (k, v) => { harm[k] = (harm[k] || 0) + v; };
  // In from the plate a little, so it is clear of the plate itself.
  const p = [at[0] + dir[0] * 0.05, at[1] + dir[1] * 0.05, at[2] + dir[2] * 0.05];
  let stopAt = coreLen;
  if (core) {
    // The shell goes on until it meets something that stops it -- the
    // engine, the transmission, the breech -- wrecking whatever it goes
    // through on the way.
    for (const { q, t } of along(A, angle, p, dir, coreLen)) {
      add(q.k, q.solid ? 0.8 : 1.1);
      if (q.solid) { stopAt = t; break; }
    }
  }
  if (burst > 0) {
    const t = Math.min(burstAt, stopAt);
    const b = [p[0] + dir[0] * t, p[1] + dir[1] * t, p[2] + dir[2] * t];
    for (const { q, f } of around(A, angle, b, burst)) add(q.k, 1.3 * f + 0.15);
  }
  for (let i = 0; i < spall; i++) {
    const v = cone(dir, 0.45, rng);
    const first = along(A, angle, p, v, 2.6)[0];
    if (first) add(first.q.k, 0.3 + rng() * 0.45);
  }
  return harm;
}

/** The parts a burst on the outside of the tank, at hull-frame point `at`, reaches: the running gear, mostly. */
export function outsideHarm(A, angle, at, r) {
  const harm = {};
  for (const q of A.inside) {
    if (!q.outside) continue;
    const B = partBox(q, angle, A.turret.pz);
    let s = 0;
    for (let i = 0; i < 3; i++) {
      const o = Math.max(0, Math.abs(at[i] - B.c[i]) - B.h[i]);
      s += o * o;
    }
    const dd = Math.sqrt(s);
    if (dd < r) harm[q.k] = (harm[q.k] || 0) + 1.1 * (1 - dd / r);
  }
  return harm;
}

/**
 * Who is doing which job, out of whoever is left: a man in the gunner's seat
 * first, then a driver, a loader, and last a commander. A tank down to two
 * men can still be driven and fought, slowly; down to one it can do one or
 * the other.
 */
export function crewRoles(parts) {
  const alive = CREW.filter((k) => (parts[k] || 0) < 1);
  const has = (k) => alive.includes(k);
  const roles = { gunner: null, driver: null, loader: null, commander: null };
  const take = (role, pref) => {
    for (const k of pref) {
      if (has(k) && !Object.values(roles).includes(k)) { roles[role] = k; return; }
    }
  };
  take('gunner', ['gunner', 'commander', 'loader', 'codriver', 'driver']);
  take('driver', ['driver', 'codriver', 'loader', 'commander']);
  take('loader', ['loader', 'commander', 'codriver']);
  take('commander', ['commander', 'loader', 'codriver']);
  return { roles, alive: alive.length };
}
