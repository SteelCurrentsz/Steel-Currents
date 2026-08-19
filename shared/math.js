// Small 2D math helpers shared by the server simulation and the client renderer.
// The world is a flat sea: X/Z are the horizontal plane, Y is up (visual only).

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function lerp(a, b, t) { return a + (b - a) * t; }

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Shortest signed delta from angle a to angle b. */
export function angleDelta(a, b) { return wrapAngle(b - a); }

/** Move `a` toward `b` by at most `maxStep` radians. */
export function approachAngle(a, b, maxStep) {
  const d = angleDelta(a, b);
  if (Math.abs(d) <= maxStep) return wrapAngle(b);
  return wrapAngle(a + Math.sign(d) * maxStep);
}

export function approach(a, b, maxStep) {
  const d = b - a;
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

export function dist2(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  return dx * dx + dz * dz;
}

export function dist(ax, az, bx, bz) { return Math.sqrt(dist2(ax, az, bx, bz)); }

/** Heading in radians, 0 = +Z (north), increasing clockwise toward +X (east). */
export function headingTo(ax, az, bx, bz) { return Math.atan2(bx - ax, bz - az); }

export function headingToVec(h) { return { x: Math.sin(h), z: Math.cos(h) }; }

/** Rotate a world offset into a ship's local frame (heading h). */
export function worldToLocal(dx, dz, h) {
  const s = Math.sin(h), c = Math.cos(h);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

/** Rotate a ship-local offset into world space (heading h). */
export function localToWorld(lx, lz, h) {
  const s = Math.sin(h), c = Math.cos(h);
  return { x: lx * c + lz * s, z: -lx * s + lz * c };
}

/** Point-in-oriented-box test used for shell / torpedo hits. */
export function pointInBox(px, pz, cx, cz, h, halfLen, halfBeam) {
  const l = worldToLocal(px - cx, pz - cz, h);
  return Math.abs(l.x) <= halfBeam && Math.abs(l.z) <= halfLen;
}

/** Distance from a point to a segment (used for torpedo & LOS sweeps). */
export function pointSegmentDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = clamp(t, 0, 1);
  return dist(px, pz, ax + dx * t, az + dz * t);
}

/** Deterministic-ish PRNG so a seed reproduces the same battlefield. */
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function gauss(rng) {
  // Box-Muller, one sample per call is plenty for shell dispersion.
  const u = Math.max(1e-6, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

export const KNOTS = 0.514444; // knots -> m/s
export const MPS_TO_KNOTS = 1 / KNOTS;
