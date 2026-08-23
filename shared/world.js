// Battlefield generation. Both ends build the identical map from a seed: the
// server for collision and line of sight, the client for the visible islands.

import { makeRng, dist } from './math.js';
import { coastFor } from './coast.js';

// Default half-width of the battlefield, in metres from centre to border. A
// custom battle sets its own from the sea room where the pin was dropped; this
// is what everything else gets.
export const MAP_HALF = 7000;
// Seventy thousand yards on a side is the largest battlefield the game will
// lay out, which is 32,004 m from the centre to the border.
export const MAP_HALF_MAX = 32004;   // 70,000 yd
export const MAP_HALF_MIN = 3000;
export const SEA_LEVEL = 0;

export const MAP_PRESETS = [
  { id: 'north_atlantic', name: 'North Atlantic', islands: 5, time: 'dusk', sea: 3 },
  { id: 'solomon_narrows', name: 'Solomon Narrows', islands: 11, time: 'night', sea: 1 },
  { id: 'coral_shelf', name: 'Coral Shelf', islands: 8, time: 'day', sea: 2 },
  { id: 'open_ocean', name: 'Open Ocean', islands: 2, time: 'day', sea: 4 },
];

export function getPreset(id) {
  return MAP_PRESETS.find((m) => m.id === id) || MAP_PRESETS[0];
}

/**
 * Deterministic island field. Islands are circles (with a jagged silhouette the
 * renderer derives from the same seed) that block hulls, shells and spotting.
 */
export const TIMES = ['dawn', 'day', 'dusk', 'night'];

export function generateWorld(seed, presetId, time = null, half = MAP_HALF, place = null) {
  const preset = getPreset(presetId);
  const rng = makeRng(seed);
  const HALF = Math.max(MAP_HALF_MIN, Math.min(MAP_HALF_MAX, half));

  // A custom battle knows where on the earth it is being fought, and when it
  // does, the land is the land: the coastline off the chart, projected into
  // the battlefield and cut to its borders. Invented islands are for a battle
  // that has no position — dropping them into the Bay of Biscay as well would
  // put shoals where the chart says there is deep water.
  const land = place && Number.isFinite(place.lon) && Number.isFinite(place.lat)
    ? coastFor(place.lon, place.lat, HALF, { seed })
    : [];

  // Islands are scattered at a density rather than a count, so opening the
  // battlefield out to seventy thousand yards does not leave it empty.
  const wanted = land.length
    ? 0
    : Math.max(2, Math.round(preset.islands * (HALF / MAP_HALF) ** 1.6));
  const islands = [];
  let guard = 0;
  while (islands.length < wanted && guard++ < 1600) {
    const r = 260 + rng() * 620;
    const x = (rng() * 2 - 1) * (HALF - 1400);
    const z = (rng() * 2 - 1) * (HALF - 1400);
    // Keep the centre lane and both spawn corridors clear.
    if (dist(x, z, 0, 0) < r + 900) continue;
    if (Math.abs(z) > HALF - 2600 && Math.abs(x) < 2200) continue;
    if (islands.some((i) => dist(i.x, i.z, x, z) < i.r + r + 500)) continue;
    islands.push({
      x, z, r,
      height: 90 + rng() * 220,
      shape: Math.floor(rng() * 100000),
    });
  }

  // The capture zones sit a fixed fraction out from the centre, so they spread
  // with the battlefield instead of huddling in the middle of a big one.
  const k = HALF / MAP_HALF;
  const caps = [
    { id: 'A', x: 0, z: 0, r: 950 * Math.min(1.6, k) },
    { id: 'B', x: -2600 * k, z: 1900 * k, r: 800 * Math.min(1.6, k) },
    { id: 'C', x: 2600 * k, z: -1900 * k, r: 800 * Math.min(1.6, k) },
  ].filter((c) => !islands.some((i) => dist(i.x, i.z, c.x, c.z) < i.r + c.r * 0.4));

  const world = {
    seed, preset: preset.id, sea: preset.sea, islands, land, caps, half: HALF,
    time: TIMES.includes(time) ? time : preset.time,
  };
  // A zone the fleets cannot reach is not a zone. Anything that has come down
  // on a headland is moved to the nearest water, and dropped if there is none.
  world.caps = caps
    .map((c) => afloat(world, c, c.r * 0.5))
    .filter(Boolean);
  return world;
}

/**
 * Nudge a point until it is clear of the land, searching outward in rings.
 * Returns a copy of `at` moved to water, or null if there is none within the
 * search. Used for the capture zones and for the spawn line: a fleet that
 * forms up inside a peninsula is not a fleet.
 */
function afloat(world, at, pad = 0) {
  if (!landAt(world, at.x, at.z, pad)) return at;
  for (let step = 1; step <= 24; step++) {
    const r = step * Math.max(400, pad);
    for (let a = 0; a < 12; a++) {
      const th = (a / 12) * Math.PI * 2 + step * 0.37;
      const x = at.x + Math.cos(th) * r;
      const z = at.z + Math.sin(th) * r;
      if (Math.abs(x) > world.half || Math.abs(z) > world.half) continue;
      if (!landAt(world, x, z, pad)) return { ...at, x, z };
    }
  }
  return null;
}

// ------------------------------------------------------------ the land ----

/**
 * The land, rasterised.
 *
 * A coastline off the chart is a few hundred points a shape, and asking "is
 * this point ashore" of every one of them for every hull and every shell in
 * flight, twenty times a second, is not something the sim can afford. It is
 * scan-converted once into a grid instead — even-odd fill down each row, which
 * costs one pass over the edges per row and nothing after that — and every
 * question is then a lookup.
 *
 * The mask is the truth about where the land is. The renderer builds its
 * terrain from the same grid, so what is drawn and what a hull runs aground on
 * are the same thing rather than two things that agree most of the time.
 *
 * Held against the world object rather than on it: the world is serialised to
 * every client that joins, and a hundred and eighty kilobytes of mask has no
 * business going over the wire when both ends can raise it from the same
 * coastline in a millisecond.
 */
const MASKS = new WeakMap();
export const MASK_CELL = 150;      // metres

export function landMask(world) {
  let m = MASKS.get(world);
  if (m) return m;
  const half = world.half || MAP_HALF;
  const n = Math.ceil((half * 2) / MASK_CELL) + 1;
  const grid = new Uint8Array(n * n);
  const rings = world.land || [];

  if (rings.length) {
    // One scanline per row, through the middle of the row's cells.
    const xs = [];
    for (let j = 0; j < n; j++) {
      const z = -half + (j + 0.5) * MASK_CELL;
      xs.length = 0;
      for (const r of rings) {
        for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
          const az = r[k][1];
          const bz = r[i][1];
          if ((az > z) === (bz > z)) continue;
          xs.push(r[k][0] + ((z - az) / (bz - az)) * (r[i][0] - r[k][0]));
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for (let p = 0; p + 1 < xs.length; p += 2) {
        let i0 = Math.ceil((xs[p] + half) / MASK_CELL - 0.5);
        let i1 = Math.floor((xs[p + 1] + half) / MASK_CELL - 0.5);
        if (i1 < 0 || i0 > n - 1) continue;
        if (i0 < 0) i0 = 0;
        if (i1 > n - 1) i1 = n - 1;
        grid.fill(1, j * n + i0, j * n + i1 + 1);
      }
    }
  }

  m = { n, cell: MASK_CELL, half, grid, any: rings.length > 0 };
  m.dist = signedDistance(grid, n, MASK_CELL);
  MASKS.set(world, m);
  return m;
}

/**
 * Signed distance to the shore for every cell: metres inland where it is
 * positive, metres offshore where it is negative.
 *
 * A two-pass chamfer transform, which is the whole field for the price of two
 * sweeps over the grid. Growing a search ring out of each cell instead is
 * about a thousand lookups a time, and the renderer wants the distance at
 * every corner of a hundred and eighty thousand of them.
 */
function signedDistance(grid, n, cell) {
  const BIG = 1e9;
  const D = 1.41421356 * cell;
  const inside = new Float32Array(n * n);
  const outside = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) {
    inside[k] = grid[k] ? BIG : 0;
    outside[k] = grid[k] ? 0 : BIG;
  }
  const sweep = (f) => {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        let v = f[k];
        if (i > 0) v = Math.min(v, f[k - 1] + cell);
        if (j > 0) v = Math.min(v, f[k - n] + cell);
        if (i > 0 && j > 0) v = Math.min(v, f[k - n - 1] + D);
        if (i < n - 1 && j > 0) v = Math.min(v, f[k - n + 1] + D);
        f[k] = v;
      }
    }
    for (let j = n - 1; j >= 0; j--) {
      for (let i = n - 1; i >= 0; i--) {
        const k = j * n + i;
        let v = f[k];
        if (i < n - 1) v = Math.min(v, f[k + 1] + cell);
        if (j < n - 1) v = Math.min(v, f[k + n] + cell);
        if (i < n - 1 && j < n - 1) v = Math.min(v, f[k + n + 1] + D);
        if (i > 0 && j < n - 1) v = Math.min(v, f[k + n - 1] + D);
        f[k] = v;
      }
    }
  };
  sweep(inside);
  sweep(outside);
  const out = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) out[k] = grid[k] ? inside[k] : -outside[k];
  return out;
}

/** True where the mask says there is land. Outside the box counts as water. */
function maskAt(m, x, z) {
  const i = Math.floor((x + m.half) / m.cell);
  const j = Math.floor((z + m.half) / m.cell);
  if (i < 0 || j < 0 || i >= m.n || j >= m.n) return false;
  return m.grid[j * m.n + i] === 1;
}

/**
 * Is this point ashore, allowing `pad` for the beam of whatever is asking?
 * The pad is sampled as a ring rather than dilated into the mask: a hull is
 * tens of metres and the grid is a hundred and fifty, so a handful of lookups
 * round the point is both cheaper and truer than growing the whole coastline.
 */
export function landAt(world, x, z, pad = 0) {
  const m = landMask(world);
  if (!m.any) return false;
  if (maskAt(m, x, z)) return true;
  if (pad <= 0) return false;
  for (let a = 0; a < 8; a++) {
    const th = (a / 8) * Math.PI * 2;
    if (maskAt(m, x + Math.cos(th) * pad, z + Math.sin(th) * pad)) return true;
  }
  return false;
}

/** True when the segment a->b crosses land. Walked over the mask a cell at a
 *  time, so the cost is the length of the sight line and not the length of the
 *  coastline. */
export function landBlocks(world, ax, az, bx, bz) {
  const m = landMask(world);
  if (!m.any) return false;
  const dx = bx - ax;
  const dz = bz - az;
  const steps = Math.ceil(Math.hypot(dx, dz) / (m.cell * 0.75));
  if (steps <= 0) return maskAt(m, ax, az);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (maskAt(m, ax + dx * t, az + dz * t)) return true;
  }
  return false;
}

/**
 * Height of the ground at a point, in metres above the waterline. Worked out
 * from how far inside the coast it is, so the shore comes up out of the water
 * rather than standing off it as a wall, and the middle of an island is high
 * ground. Negative offshore, which is what the renderer runs the beach down.
 */
export function groundHeight(world, x, z) {
  const d = shoreDistance(world, x, z);
  // Offshore: the beach runs on under the water for a little way rather than
  // stopping at the waterline, so the shore is a shore and not a kerb.
  if (d <= 0) return Math.max(-40, d * 0.40);
  // Ashore: up quickly off the beach and then easing, which is what a coast
  // does. Four hundred and fifty metres of relief a couple of miles inland is
  // about right for the sort of water a fleet action is fought in.
  return 450 * (1 - Math.exp(-d / 2600));
}

/** Signed distance to the shore in metres: positive inland, negative at sea.
 *  Read off the field, so it agrees with the collision to within a cell. */
export function shoreDistance(world, x, z) {
  const m = landMask(world);
  if (!m.any) return -9999;
  const i = Math.min(m.n - 1, Math.max(0, Math.floor((x + m.half) / m.cell)));
  const j = Math.min(m.n - 1, Math.max(0, Math.floor((z + m.half) / m.cell)));
  return m.dist[j * m.n + i];
}

/** Spawn line for a team: team 0 starts south (-Z), team 1 north (+Z). */
export function spawnPoint(world, team, index) {
  const sign = team === 0 ? -1 : 1;
  const spacing = 420;
  // Fleets form up at gun range of one another rather than on the border. On a
  // fifty-thousand-yard battlefield the borders are forty-four kilometres
  // apart, which at thirty knots is three-quarters of an hour before anybody
  // sights anybody — the sea room is there to manoeuvre in, not to steam across.
  const half = Math.min(world?.half || MAP_HALF, MAP_HALF) - 900;
  const x = ((index % 8) - 3.5) * spacing;
  const z = sign * half - sign * Math.floor(index / 8) * 500;
  const heading = team === 0 ? 0 : Math.PI;
  if (!world) return { x, z, heading };
  // The line may fall on a headland now that the land is real. Walk it to the
  // nearest water with sea room to get under way.
  const clear = afloat(world, { x, z }, 400);
  return clear ? { x: clear.x, z: clear.z, heading } : { x, z, heading };
}

/** True when the segment a->b is broken by land. */
export function blockedByLand(world, ax, az, bx, bz) {
  if (landBlocks(world, ax, az, bx, bz)) return true;
  for (const i of world.islands) {
    // Closest approach of the segment to the island centre.
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((i.x - ax) * dx + (i.z - az) * dz) / len2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = ax + dx * t, cz = az + dz * t;
    if (dist(cx, cz, i.x, i.z) < i.r) return true;
  }
  return false;
}

export function islandAt(world, x, z, pad = 0) {
  for (const i of world.islands) {
    if (dist(x, z, i.x, i.z) < i.r + pad) return i;
  }
  // Real coastline. Nothing above needs to know which shape it hit, only that
  // it is aground, so the whole shore answers as one piece of land.
  if (landAt(world, x, z, pad)) return SHORE;
  return null;
}

/** What islandAt hands back for the real coastline. */
const SHORE = { x: 0, z: 0, r: 0, shore: true, height: 120 };
