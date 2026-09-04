// Battlefield generation. Both ends build the identical map from a seed: the
// server for collision and line of sight, the client for the visible islands.

import { makeRng, dist, TAU } from './math.js';
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

// ---------------------------------------------------------------------------
// From a place on the chart to a battlefield
// ---------------------------------------------------------------------------
//
// Three numbers turn a spot a captain picked into the battlefield he will fight
// over: which theatre it is, what seed lays the islands out, and how far the
// borders are from the middle. They live here rather than in whichever screen
// happened to need them first, because *every* screen has to agree — the chart
// he chooses on, the plan he lays his fleet out on, and the sea he arrives in.
// A different answer on any of them is a different map.

/** How many metres across the largest battlefield the game will lay out. */
export const BATTLE_MAX_M = MAP_HALF_MAX * 2;

/**
 * Which theatre a stretch of sea is fought as.
 *
 * By sea room rather than by the size of the box the captain drew: a small
 * action in the middle of the Atlantic is still fought in open water.
 */
export function theatreFor({ lat = 0, room, km = 0 } = {}) {
  if (Math.abs(lat) > 48) return 'north_atlantic';
  const m = (room ?? km) * 1000;
  if (m < BATTLE_MAX_M * 0.45) return 'solomon_narrows';
  if (m < BATTLE_MAX_M * 0.85) return 'coral_shelf';
  return 'open_ocean';
}

/** The same berth lays out the same island field every time, so the seed is
 *  the position rather than the clock. */
export function battlefieldSeed(lon, lat) {
  return (Math.round((lon + 180) * 4096) * 131071
    + Math.round((lat + 90) * 4096)) >>> 0;
}

/** Half the width of the battlefield a box of `km` across is fought over. */
export function battlefieldHalf(km) {
  return Math.max(MAP_HALF_MIN, Math.min(MAP_HALF_MAX, ((km || 0) * 1000) / 2));
}

// ---------------------------------------------------------------------------
// Islands
// ---------------------------------------------------------------------------
//
// An island is a shape, not a circle. Its outline is a rim of radii taken at
// even bearings round its middle, and everything that has to know where the
// island is -- the hull that runs aground on it, the shell that lands on it,
// the sight line it breaks, the ground a coast battery is built on, the mesh
// the renderer raises and the outline the chart draws -- reads that one rim.
// So they cannot disagree with each other, which is what a circle for the
// simulation and a jagged silhouette for the renderer used to do.

/** How many bearings the rim is sampled at. */
const RIM_N = 24;

/**
 * A rim of `RIM_N` radii around a mean of `r`.
 *
 * Three harmonics laid over one another: one long axis, one that puts a
 * headland and a bay opposite each other, and a short one for the detail. The
 * radius never falls below two-thirds of the mean, so the outline stays
 * star-shaped about the middle -- which is what lets every query below be a
 * lookup at one bearing instead of a walk round a polygon.
 */
function makeRim(rng, r) {
  const a1 = 0.12 + rng() * 0.15;
  const a2 = 0.07 + rng() * 0.11;
  const a3 = 0.05 + rng() * 0.07;
  const a4 = 0.03 + rng() * 0.05;
  const p1 = rng() * TAU;
  const p2 = rng() * TAU;
  const p3 = rng() * TAU;
  const p4 = rng() * TAU;
  const rim = [];
  for (let i = 0; i < RIM_N; i++) {
    const a = (i / RIM_N) * TAU;
    // Four harmonics: the long axis, a headland against a bay, the points
    // between them, and enough of a seventh to keep the coast from reading as
    // an ellipse from the bridge of a ship standing off it.
    const k = 1 + a1 * Math.sin(2 * a + p1)
      + a2 * Math.sin(3 * a + p2)
      + a3 * Math.sin(5 * a + p3)
      + a4 * Math.sin(7 * a + p4);
    rim.push(r * Math.max(0.66, k));
  }
  return rim;
}

/**
 * The furthest the rim reaches from the middle.
 *
 * Every test below rejects on this before it interpolates, so it has to be the
 * real maximum and not a guess at one: a headland that reached past a guessed
 * radius would be ground a hull sailed straight through.
 */
function rimMax(rim, r) {
  let m = r;
  for (const v of rim) if (v > m) m = v;
  // The rim is sampled at two dozen bearings and read back interpolated, so
  // nothing between two samples can be higher than the higher of them.
  return m;
}

/**
 * The island's radius on a bearing, in metres.
 *
 * Bearings run the way the game's headings do: clockwise from +Z, so
 * `Math.atan2(x - isle.x, z - isle.z)`. Between rim samples the radius is
 * interpolated, so the outline is smooth rather than a two-dozen-sided nut.
 */
export function islandRadius(isle, bearing) {
  const rim = isle.rim;
  if (!rim || !rim.length) return isle.r;
  const t = ((((bearing / TAU) % 1) + 1) % 1) * rim.length;
  const i = Math.floor(t);
  const f = t - i;
  return rim[i] * (1 - f) + rim[(i + 1) % rim.length] * f;
}

/** The outline as a closed ring of [x, z], built once and kept on the island. */
export function islandRing(isle, steps = RIM_N * 3) {
  if (isle._ring && isle._ring.length === steps) return isle._ring;
  const ring = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU;
    const r = islandRadius(isle, a);
    ring.push([isle.x + Math.sin(a) * r, isle.z + Math.cos(a) * r]);
  }
  isle._ring = ring;
  return ring;
}

/**
 * The relief an island's flanks carry: spurs, gullies and roughness.
 *
 * Numbers rather than a noise field, because both ends of the wire have to
 * raise the same ground out of the same island and a table of eleven
 * coefficients travels where a noise implementation does not. Four terms: two
 * that run down the flanks as ridges and the valleys between them, and two
 * that vary with height as well so the slopes are not smooth sheets.
 */
function makeRelief(rng) {
  return {
    n1: 3 + Math.floor(rng() * 4),        // 3-6 spurs off the summit
    p1: rng() * TAU,
    a1: 0.20 + rng() * 0.12,
    n2: 7 + Math.floor(rng() * 5),        // the gullies between them
    p2: rng() * TAU,
    a2: 0.07 + rng() * 0.07,
    f1: 5 + rng() * 4,                    // benches and steps up the slope
    q1: rng() * TAU,
    n3: 2 + Math.floor(rng() * 3),
    q2: rng() * TAU,
    a3: 0.05 + rng() * 0.04,
  };
}

/**
 * How high the ground stands at a point on an island, in metres. Zero at the
 * water's edge and outside it.
 *
 * A beach for the outer sixth, then the climb, then a summit that flattens
 * off -- which is the shape of the ground a coast battery was actually built
 * on, and the reason a gun placed inland is not standing on a slope.
 *
 * Over that, relief. The renderer used to add its own ridges to the mesh after
 * the fact, which meant the hill on the screen and the hill the simulation was
 * working from were two different hills: a gun pit cut to one of them stood in
 * the air or in the ground of the other. The relief lives here now, so there is
 * one hill, and the shells, the sight lines, the gun platforms and the mesh all
 * read it.
 *
 * It is faded out at both ends -- to nothing at the waterline, so the beach
 * meets the sea exactly where the outline says it does, and to nothing at the
 * summit, so there is level ground up there to build on.
 */
export function islandHeight(isle, x, z) {
  const dx = x - isle.x;
  const dz = z - isle.z;
  const d = Math.hypot(dx, dz);
  const R = islandRadius(isle, Math.atan2(dx, dz));
  if (d >= R) return 0;
  const u = 1 - d / R;
  // A strand, then the climb, then a summit that flattens off. The strand is a
  // strand and not a desert: it used to be an ninth of the island's radius, so
  // a kilometre-wide island came with a hundred-metre beach all the way round
  // and read as a sandbank with a lawn in the middle.
  const BEACH = 0.045;
  let h;
  if (u < BEACH) h = isle.height * 0.03 * (u / BEACH);
  else {
    // Steeply off the back of the beach and easing into the top: land that
    // came out of the sea stands up out of it, and the gentle dome the
    // smoothstep gave was the shape of a slag heap rather than an island.
    const v = (u - BEACH) / (1 - BEACH);
    const t = Math.min(1, v / 0.82);
    const steep = Math.pow(t, 0.6);
    const eased = t * t * (3 - 2 * t);
    h = isle.height * (0.03 + 0.97 * (steep * 0.66 + eased * 0.34));
  }
  const rel = isle.relief;
  if (!rel) return h;
  const a = Math.atan2(dx, dz);
  // Nothing at the water, nothing on the summit, everything on the flanks.
  const flank = Math.sin(Math.PI * Math.min(1, u / 0.9));
  const k = flank * flank * (1.6 - flank * 0.6);
  const wave = rel.a1 * Math.cos(rel.n1 * a + rel.p1)
    + rel.a2 * Math.cos(rel.n2 * a + rel.p2)
    + rel.a3 * Math.sin(u * rel.f1 + rel.n3 * a + rel.q1)
    + rel.a3 * 0.7 * Math.sin(u * rel.f1 * 1.9 - a + rel.q2);
  // Biased downward, so what the relief mostly does is cut valleys rather than
  // raise peaks. Erosion takes ground away; and it keeps the summit the highest
  // thing on the island, which is what the gun-siting walk inland relies on.
  // Scaled by the height the profile has already reached, so a gully on a low
  // flank is a shallow one.
  const relief = h * k * (wave * 0.85 - 0.24);
  // Two floors and a ceiling. A gully never cuts more than three-quarters of
  // the way down, so the middle of an island cannot open into a hole at sea
  // level; and nothing the relief raises ever stands above the summit, so the
  // walk inland that sites a gun always ends on the top of the island.
  return Math.min(isle.height, Math.max(h * 0.25, h + relief));
}

/**
 * Deterministic island field. Islands are shapes (see above) that block hulls,
 * shells and spotting.
 */
export const TIMES = ['dawn', 'day', 'dusk', 'night'];

/**
 * The weather over the battle.
 *
 * Both ends read this: the server so that a rough sea is rough for everybody's
 * gunnery, the client so that it looks like the sea the server is running. Sea
 * state is added to the theatre's own, so the Solomons in a thunderstorm are
 * still calmer water than the North Atlantic in one.
 *
 *   sea      how much this adds to the sea state.
 *   light    how much of the sun gets through.
 *   fog      how much thicker the air is than a clear day's.
 *   sight    how far a lookout can see, as a fraction. Rain closes a battle
 *            right down, which is a tactical fact and not a filter over it.
 *   fall     what is coming down, if anything.
 *   lightning average seconds between strikes, or 0.
 */
export const WEATHERS = ['sunny', 'cloudy', 'rain', 'thunder', 'snow'];

export const WEATHER = {
  sunny:   { name: 'Sunny',        sea: 0,   light: 1.00, fog: 1.0, sight: 1.00, fall: null,   drop: 0,    lightning: 0 },
  cloudy:  { name: 'Cloudy',       sea: 0.6, light: 0.70, fog: 1.5, sight: 0.90, fall: null,   drop: 0,    lightning: 0 },
  rain:    { name: 'Rain',         sea: 1.2, light: 0.48, fog: 3.0, sight: 0.62, fall: 'rain', drop: 1.0,  lightning: 0 },
  thunder: { name: 'Thunderstorm', sea: 2.2, light: 0.34, fog: 4.2, sight: 0.48, fall: 'rain', drop: 1.6,  lightning: 9 },
  snow:    { name: 'Snow',         sea: 0.8, light: 0.55, fog: 3.4, sight: 0.55, fall: 'snow', drop: 1.0,  lightning: 0 },
};

export function getWeather(id) {
  return WEATHER[id] || WEATHER.sunny;
}

export function generateWorld(seed, presetId, time = null, half = MAP_HALF, place = null,
  weather = null) {
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
      // `r` stays the mean radius: it is what the spacing above is judged on
      // and what a cheap reject test uses. The rim is the actual shape.
      x, z, r,
      ...(() => { const rim = makeRim(rng, r); return { rim, rmax: rimMax(rim, r) }; })(),
      // Height in proportion to size, so an island is the same shape of thing
      // whether it is a rock or a headland: a flat-topped mesa a kilometre
      // across and a hundred metres high is a mine spoil heap, not an island.
      height: r * (0.20 + rng() * 0.22),
      relief: makeRelief(rng),
      shape: Math.floor(rng() * 100000),
    });
  }

  const wx = WEATHERS.includes(weather) ? weather : 'sunny';
  const world = {
    seed, preset: preset.id, islands, land, half: HALF,
    time: TIMES.includes(time) ? time : preset.time,
    weather: wx,
    // The theatre's own sea, plus whatever the weather is adding to it.
    sea: Math.max(0, Math.min(6, preset.sea + WEATHER[wx].sea)),
  };
  return world;
}

/**
 * Nudge a point until it is clear of the land, searching outward in rings.
 * Returns a copy of `at` moved to water, or null if there is none within the
 * search. Used for the spawn line: a fleet that forms up inside a peninsula is
 * not a fleet.
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
  // Kept against how much land the world has as well as against the world
  // itself. A battlefield never changes its coastline in play, but a caller
  // that builds one and then takes the islands out of it -- a test setting up
  // open water, a tool -- would otherwise go on colliding with the islands it
  // had removed, because the mask was raised before they went.
  const stamp = (world.land?.length || 0) * 1e6 + (world.islands?.length || 0);
  let m = MASKS.get(world);
  if (m && m.stamp === stamp) return m;
  const half = world.half || MAP_HALF;
  const n = Math.ceil((half * 2) / MASK_CELL) + 1;
  const grid = new Uint8Array(n * n);
  // Both kinds of land go through the same scanline. An island is ground like
  // any other: a fleet should not form up on one, and a battery sited on one
  // wants the same distance-from-the-water the real coast gives.
  const rings = [
    ...(world.land || []),
    ...(world.islands || []).map((i) => islandRing(i)),
  ];

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

  m = { n, cell: MASK_CELL, half, grid, stamp, any: rings.length > 0 };
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
  // An island's own relief, which is a shape rather than a distance field: a
  // three-hundred-metre island is four mask cells across, and a chamfer over
  // four cells is a pyramid, not a hill.
  let top = 0;
  let near = 0;
  for (const i of world.islands) {
    if (Math.abs(x - i.x) > i.r * 2.2 || Math.abs(z - i.z) > i.r * 2.2) continue;
    const h = islandHeight(i, x, z);
    if (h > top) top = h;
    // The shelf an island stands on: the seabed comes up to meet it rather
    // than the island rising out of deep water like a post.
    const d = Math.hypot(x - i.x, z - i.z);
    const R = islandRadius(i, Math.atan2(x - i.x, z - i.z));
    if (d > R && d < R * 1.9) near = Math.max(near, 1 - (d - R) / (R * 0.9));
  }
  if (top > 0) return top;
  if (near > 0) return -40 + 34 * near * near;

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

/**
 * True when the segment a->b is broken by land.
 *
 * `ignore` takes one island out of the test. A gun standing on a hill is not
 * blocked by the hill it is standing on — that is the whole reason it was put
 * there — and a flat test run from a point inside an island would otherwise
 * say every bearing from it was closed.
 */
export function blockedByLand(world, ax, az, bx, bz, ignore = null) {
  if (landBlocks(world, ax, az, bx, bz)) return true;
  for (const i of world.islands) {
    if (i === ignore) continue;
    // Closest approach of the segment to the island centre, tested against the
    // rim on that bearing rather than against a circle: a sight line down a bay
    // is open and one over a headland is not, and a circle cannot tell them
    // apart.
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((i.x - ax) * dx + (i.z - az) * dz) / len2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = ax + dx * t, cz = az + dz * t;
    if (dist(cx, cz, i.x, i.z) < islandRadius(i, Math.atan2(cx - i.x, cz - i.z))) return true;
  }
  return false;
}

export function islandAt(world, x, z, pad = 0) {
  for (const i of world.islands) {
    const dx = x - i.x;
    const dz = z - i.z;
    const d = Math.hypot(dx, dz);
    // Cheap reject first, against the island's own longest reach.
    if (d > (i.rmax || i.r) + pad) continue;
    if (d < islandRadius(i, Math.atan2(dx, dz)) + pad) return i;
  }
  // Real coastline. Nothing above needs to know which shape it hit, only that
  // it is aground, so the whole shore answers as one piece of land.
  //
  // Only asked when there is a coastline to ask about. The mask carries the
  // islands as well now, and its cells are a hundred and fifty metres across —
  // so a shell a few metres off a small island's beach would come back ashore
  // from the mask after the exact test above had already said it was in the
  // water. The rim is the answer for an island; the mask is the answer for a
  // coast; a battlefield never has both.
  if (world.land?.length && landAt(world, x, z, pad)) return SHORE;
  return null;
}

/** What islandAt hands back for the real coastline. */
const SHORE = { x: 0, z: 0, r: 0, shore: true, height: 120 };
