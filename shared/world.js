// Battlefield generation. Both ends build the identical map from a seed: the
// server for collision and line of sight, the client for the visible islands.

import { makeRng, dist } from './math.js';

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

export function generateWorld(seed, presetId, time = null, half = MAP_HALF) {
  const preset = getPreset(presetId);
  const rng = makeRng(seed);
  const HALF = Math.max(MAP_HALF_MIN, Math.min(MAP_HALF_MAX, half));
  // Islands are scattered at a density rather than a count, so opening the
  // battlefield out to fifty thousand yards does not leave it empty.
  const wanted = Math.max(2, Math.round(preset.islands * (HALF / MAP_HALF) ** 1.6));
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

  return {
    seed, preset: preset.id, sea: preset.sea, islands, caps, half: HALF,
    time: TIMES.includes(time) ? time : preset.time,
  };
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
  return { x, z, heading: team === 0 ? 0 : Math.PI };
}

/** True when the segment a->b is broken by land. */
export function blockedByLand(world, ax, az, bx, bz) {
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
  return null;
}
