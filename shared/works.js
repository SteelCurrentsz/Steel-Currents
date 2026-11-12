// The works of man ashore: towns, on the coast or inland, and the sea walls
// along the shore.
//
// Both are asked for on the plotting board and raised from a seed, the same
// way the islands are -- so the server that fights over them and every client
// that draws them build the identical town out of the same few numbers, and
// nothing but the damage done to it ever has to cross the wire.
//
// A town is a period one: the place a fleet of the nineteen-twenties to the
// fifties would have found at the head of a bay. A street grid with a
// boulevard down the middle of it to the sea, a square with the town hall and
// the church on it, a few blocks of stone and Art Deco offices round the
// square, brick flats and shops past those, terraces and detached houses with
// gardens on the outskirts, a park, and warehouses along the waterfront.
// Kerbs and pavements, lamp-posts, street trees, benches, telephone kiosks
// and motor cars parked at the kerb. A town of any size has its railway
// station at the head of the boulevard, a school, a hospital, a fire station
// and a covered market, a football ground, and out on its inland edge the
// works: factories with their chimney stacks, a gasholder or a water tower,
// and lorries in the yards. How big it is the board decides, by dragging its
// corners out, from a village of a few streets to a city.
//
// It stands on the ground the simulation stands everything else on. The site
// is levelled -- cut into the hill behind and made up where it falls away, as
// every harbour town is -- and the levelling is in the height field itself
// (see worksGround), so the terrain mesh, the shells, the guns and a man
// walking about it all find the same flat ground, and nothing in the town is
// left standing on a slope or hanging in the air.
//
// A sea wall is a wide concrete rampart along the shore: wide enough to put a
// battery on its walkway. It too is in the height field. When it is breached
// the section goes down to a heap of broken concrete, and whatever was
// standing on it goes down with it.

import { makeRng, clamp, TAU } from './math.js';
import {
  islandRadius, islandAt, landMask, shoreDistance, drawnGround, coastGrid, coastSplit, rawGround, groundHeight,
  landCeiling,
} from './world.js';

// ---------------------------------------------------------------------------
// What can be asked for
// ---------------------------------------------------------------------------

/** How wide a sea wall's walkway is, in metres: room for a gun and its crew. */
export const WALL_WIDTH = 34;
/** How far apart the points of a wall's line are laid. */
const WALL_STEP = 12;
/** A wall is fought in sections of this many of its steps. */
const WALL_SECTION = 2;
// How many wall steps a run is carried across where the ground under it
// drops away, before it is ended there instead.
const BRIDGE = 4;
/** The parapet along a wall's sea edge. */
export const PARAPET = 1.15;
/** How many towns, and how many stretches of wall, a battle can ask for. */
export const MAX_CITIES = 8;
export const MAX_WALLS = 12;
/** How many airfields, and how many harbours, a battle can ask for. */
export const MAX_AIRBASES = 4;
export const MAX_HARBORS = 6;
/**
 * The sizes a town can be dragged out to on the board, in metres: from a
 * village of a few streets to a city of fifteen hundred buildings.
 */
export const TOWN_MIN_W = 220;
export const TOWN_MAX_W = 1800;
export const TOWN_MIN_D = 170;
export const TOWN_MAX_D = 1100;
/**
 * A building's id is its town's number times this, plus its own number in
 * the town: one list of ruins, and one stream of events, for every town.
 */
const CITY_IDS = 100000;

/** One town or one stretch of wall as asked for: `{ seed, x, z, n }`, the spot and the order optional. */
function cleanOne(a) {
  if (!a || typeof a !== 'object' || !Number.isFinite(a.seed)) return null;
  return {
    seed: a.seed >>> 0,
    ...(Number.isFinite(a.x) && Number.isFinite(a.z) ? { x: Math.round(a.x), z: Math.round(a.z) } : {}),
    // In what order the board put them down, towns and walls counted together.
    ...(Number.isFinite(a.n) ? { n: Math.max(0, Math.round(a.n)) } : {}),
    // Whose an airfield is, off the board: 1 the enemy's, otherwise the
    // captain's own side.
    ...(a.t === 1 ? { t: 1 } : {}),
    // How big a town was asked for, across its front and back from it, when
    // its corners were dragged out on the board. Left to itself a town is
    // as big as the ground it stands on makes it.
    ...(Number.isFinite(a.w) && Number.isFinite(a.d)
      ? { w: Math.round(clamp(a.w, TOWN_MIN_W, TOWN_MAX_W)), d: Math.round(clamp(a.d, TOWN_MIN_D, TOWN_MAX_D)) } : {}),
  };
}

/**
 * What the board sends for the works, cleaned up: `{ cities, walls }`, each a
 * list of `{ seed, x, z }` -- the position is optional, and when it is missing
 * the town, or the wall, finds its own site. A lone `city` or `walls` object,
 * as the board sent them when there could be only one of each, is read as a
 * list of one.
 */
export function cleanAsk(ask) {
  if (!ask || typeof ask !== 'object') return null;
  const list = (v, max) => (Array.isArray(v) ? v : v ? [v] : [])
    .map(cleanOne).filter(Boolean).slice(0, max);
  const cities = list(ask.cities ?? ask.city, MAX_CITIES);
  const walls = list(ask.walls, MAX_WALLS);
  const airbases = list(ask.airbases, MAX_AIRBASES);
  const harbors = list(ask.harbors, MAX_HARBORS);
  return cities.length || walls.length || airbases.length || harbors.length
    ? { cities, walls, airbases, harbors } : null;
}

/**
 * Raise the works a battle asked for on a world that has just been generated.
 *
 * The order matters. The towns are sited and levelled first, one after
 * another, because the levelling changes the ground; the walls are then run
 * along the shore of that ground; and each town's own streets and buildings
 * are laid out last (lazily, see cityPlan) inside what the walls leave of its
 * site.
 */
export function raiseWorks(world, ask) {
  const a = cleanAsk(ask);
  world.works = null;
  world.ruin = { b: {}, w: {} };
  world._ceiling = undefined;
  if (!a || !world || world.preset === 'open_ocean') return null;
  if (!(world.islands || []).length && !(world.land || []).length) return null;
  const works = { ask: a, cities: [], walls: [] };
  world.works = works;
  a.cities.forEach((ca, k) => {
    const c = siteCity(world, ca, works.cities);
    if (!c) return;
    // Which of the towns asked for this is, and which of the towns built.
    c.ask = k;
    c.index = works.cities.length;
    c.base = c.index * CITY_IDS;
    works.cities.push(c);
  });
  // The airfields and the harbours: sites of the same shape as a town's,
  // levelled the same way and drawn up by their own plans (see drawAirbase
  // and drawHarbor), so the shells, the fires and the men ashore find them
  // exactly as they find a town.
  const addSite = (c, kind, k, ak) => {
    if (!c) return;
    c.kind = kind;
    c.ask = k;
    c.n = ak.n ?? -1;
    c.side = ak.t === 1 ? 1 : 0;
    c.index = works.cities.length;
    c.base = c.index * CITY_IDS;
    works.cities.push(c);
  };
  a.airbases.forEach((ak, k) => addSite(siteAirbase(world, ak, works.cities), 'airbase', k, ak));
  a.harbors.forEach((ak, k) => addSite(siteHarbor(world, ak, works.cities), 'harbor', k, ak));
  const runs = [];
  a.walls.forEach((wa, k) => runWalls(world, wa, k, runs));
  // Each harbour's quay: a straight run of wall along its front, built out
  // over whatever is there, with its berth dredged in front of it.
  for (const c of works.cities) if (c.kind === 'harbor') runs.push(quayOf(c));
  works.walls = runs;
  if (!works.cities.length && !works.walls.length) world.works = null;
  world._ceiling = undefined;
  // Drawn up now rather than on the first shell that lands in one, which
  // would be a hitch in the middle of the battle.
  cityPlans(world);
  return world.works;
}

// ---------------------------------------------------------------------------
// Siting the town
// ---------------------------------------------------------------------------

/**
 * Where the town stands, how big it is, which way it faces and what height
 * its streets are levelled to.
 *
 * Asked for at a spot on dry land, it stands there, wherever that is -- a
 * market town ten miles inland as readily as a harbour. It still faces the
 * nearest sea, its local +v out towards the water, and if the sea is close
 * enough its front row is a waterfront.
 *
 * Asked for anywhere else, or nowhere, it is a harbour town: its front row is
 * laid right down to the shore. On an island it goes on the side the bearing
 * from the island's middle points at -- towards the spot the board asked for,
 * or, left to itself, towards the middle of the battlefield. `others` are the
 * towns already standing, which one left to find its own site keeps clear of.
 */
function siteCity(world, ask, others = []) {
  const rng = makeRng(ask.seed ^ 0x51ab1e);
  const isles = world.islands || [];
  const half = world.half || 7000;
  const clash = (x, z, W, D) => others.some((o) => Math.hypot(o.x - x, o.z - z) < (Math.max(o.W, o.D) + Math.max(W, D)) / 2);
  let site = null;
  if (Number.isFinite(ask.x) && rawGround(world, ask.x, ask.z) > 0.3) {
    site = siteAt(world, ask);
  } else if (isles.length) {
    // The island asked for, or the nearest big one to it, or the biggest.
    const want = Number.isFinite(ask.x) ? ask : null;
    let best = null;
    for (const i of isles) {
      if (i.r < 230) continue;
      const score = want
        ? Math.hypot(want.x - i.x, want.z - i.z) - (islandAt(world, want.x, want.z, 0) === i ? 1e6 : 0)
        : -i.r + Math.hypot(i.x, i.z) * 0.05 + (others.some((o) => o.isle === isles.indexOf(i)) ? 1e5 : 0);
      if (!best || score < best.score) best = { i, score };
    }
    if (!best) {
      for (const i of isles) if (!best || i.r > best.i.r) best = { i, score: 0 };
    }
    const i = best.i;
    const b = want && Math.hypot(want.x - i.x, want.z - i.z) > 1
      ? Math.atan2(want.x - i.x, want.z - i.z)
      : Math.atan2(-i.x, -i.z);
    const Rb = islandRadius(i, b);
    // As big as the island makes room for, or as big as the board dragged
    // it out to.
    const W = ask.w ?? clamp(i.r * 1.25, 200, 760);
    const D = ask.d ?? clamp(i.r * 0.8, 150, 460);
    const out = Rb - D / 2 + 12;
    site = {
      x: i.x + Math.sin(b) * out, z: i.z + Math.cos(b) * out, rot: b, W, D,
      // A mesh cell on an island is never more than about sixty metres; the
      // flat runs on past the town by more than that, so every triangle the
      // town stands on is level. See worksGround.
      flat: 80, blend: 130, isle: isles.indexOf(i),
    };
  } else {
    const m = landMask(world);
    if (!m.any) return null;
    // On a real coast: candidate stretches of shore near the spot asked for
    // (or near the middle of the battle), each faced out to sea and scored on
    // how much of the town's site would be dry land. A town is built where
    // there is room for one, not across the mouth of an estuary.
    const W = ask.w ?? 760;
    const D = ask.d ?? 480;
    const target = Number.isFinite(ask.x) ? { x: ask.x, z: ask.z } : { x: 0, z: 0 };
    const face = (px, pz) => {
      const g = 300;
      const gx = shoreDistance(world, px + g, pz) - shoreDistance(world, px - g, pz);
      const gz = shoreDistance(world, px, pz + g) - shoreDistance(world, px, pz - g);
      return Math.hypot(gx, gz) > 1 ? Math.atan2(-gx, -gz) : Math.atan2(-px, -pz);
    };
    const frame = (px, pz) => {
      const b = face(px, pz);
      const s = Math.max(0, shoreDistance(world, px, pz));
      const out = s - D / 2 + 30;
      return { x: px + Math.sin(b) * out, z: pz + Math.cos(b) * out, b };
    };
    const dry = (f) => {
      let ok = 0;
      let n = 0;
      for (let a = -0.45; a <= 0.451; a += 0.15) {
        for (let v = -0.45; v <= 0.3; v += 0.15) {
          n++;
          const u = a * W;
          const vv = v * D;
          const x = f.x + Math.cos(f.b) * u + Math.sin(f.b) * vv;
          const z = f.z - Math.sin(f.b) * u + Math.cos(f.b) * vv;
          if (rawGround(world, x, z) > 0.3) ok++;
        }
      }
      return ok / n;
    };
    const cands = [];
    const step = Math.max(150, half / 40);
    for (let z = -half + 900; z < half - 900; z += step) {
      for (let x = -half + 900; x < half - 900; x += step) {
        const s = shoreDistance(world, x, z);
        if (s < 150 || s > 500) continue;
        cands.push({ x, z, d: Math.hypot(target.x - x, target.z - z) });
      }
    }
    if (Number.isFinite(ask.x) && shoreDistance(world, ask.x, ask.z) > 0) cands.push({ x: ask.x, z: ask.z, d: 0 });
    cands.sort((p, q) => p.d - q.d);
    let best = null;
    for (const cnd of cands.slice(0, 40)) {
      const f = frame(cnd.x, cnd.z);
      const score = dry(f) * 3000 - cnd.d * (Number.isFinite(ask.x) ? 1.2 : 0.25)
        - (clash(f.x, f.z, W, D) ? 5000 : 0);
      if (!best || score > best.score) best = { f, score };
    }
    if (!best) return null;
    const p = best.f;
    const b = p.b;
    const out = 0;
    site = {
      x: p.x + Math.sin(b) * out, z: p.z + Math.cos(b) * out, rot: b, W, D,
      // The coast's mesh is lofted on the mask's cells: the level has to
      // run on past the town by more than the diagonal of a few of them.
      flat: 460, blend: 600, isle: -1,
    };
  }
  // Inside the borders, with room to spare.
  const lim = half - Math.max(site.W, site.D) / 2 - 300;
  site.x = clamp(site.x, -lim, lim);
  site.z = clamp(site.z, -lim, lim);
  // Clear of every town already standing. One laid over another was levelled
  // to its own height across the other's streets, and took most of that
  // town's buildings off the ground they had been drawn up on.
  site = keepClear(world, site, others);
  if (!site) return null;
  // The level the streets are cut to: what the ground is in the front half of
  // the site, where the harbour is -- a town is built at the water, and the
  // hill behind it is cut back to it. A town inland is built at the height
  // of the ground it stands on, over the whole of it.
  const hs = [];
  for (let k = 0; k < 60; k++) {
    const u = (rng() - 0.5) * site.W;
    const v = site.inland ? (rng() - 0.5) * site.D : rng() * site.D * 0.45;
    const x = site.x + Math.cos(site.rot) * u + Math.sin(site.rot) * v;
    const z = site.z - Math.sin(site.rot) * u + Math.cos(site.rot) * v;
    const h = rawGround(world, x, z);
    if (h > 0.3) hs.push(h);
  }
  hs.sort((a, b) => a - b);
  const med = hs.length ? hs[Math.floor(hs.length * (site.inland ? 0.5 : 0.3))] : 4;
  const top = site.inland ? (site.isle >= 0 ? Math.max(16, isles[site.isle].height * 0.8) : 420)
    : site.isle >= 0 ? 16 : 18;
  site.level = Math.round(clamp(med, 3.5, top) * 10) / 10;
  // A neighbour close enough that the levelling of either reaches the other's
  // streets: the two are one town on one level, or one of them is cut down
  // or made up under the other's houses.
  const near = others.find((o) => reaches(site, o));
  if (near) site.level = near.level;
  site.seed = ask.seed;
  return site;
}

/** How far apart two towns' streets are kept: a field or two between them. */
const TOWN_GAP = 30;
/**
 * And how far an airfield or a harbour is kept off any other site: room for
 * the ground to run from the one's level to the other's.
 */
const SITE_GAP = 40;

/**
 * Whether two towns' sites overlap, each widened by its pad: the separating
 * axis test on the two rectangles, which can be turned any way to each other.
 */
function sitesOverlap(a, b, padA = 0, padB = 0) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const half = (c, pad, ax, az) => (c.W / 2 + pad) * Math.abs(Math.cos(c.rot) * ax - Math.sin(c.rot) * az)
    + (c.D / 2 + pad) * Math.abs(Math.sin(c.rot) * ax + Math.cos(c.rot) * az);
  for (const th of [a.rot, b.rot]) {
    for (const [ax, az] of [[Math.cos(th), -Math.sin(th)], [Math.sin(th), Math.cos(th)]]) {
      if (Math.abs(dx * ax + dz * az) > half(a, padA, ax, az) + half(b, padB, ax, az)) return false;
    }
  }
  return true;
}

/**
 * Whether the levelling of either of two towns reaches the other's streets.
 * Two towns that close are built on the one level. An airfield or a harbour
 * keeps its own whatever is near it, and the ground between is blended from
 * the one level to the other (see worksGround).
 */
function reaches(a, b) {
  return sitesOverlap(a, b, a.flat + a.blend, b.flat) || sitesOverlap(a, b, a.flat, b.flat + b.blend);
}

/** Whether the water comes up to the front of a site: under its front row, or just past it. */
function wetFront(world, site) {
  return [-0.3, 0, 0.3].some((f) => [0.42, 0.5, 0.6].some((t) => {
    const p = cityToWorld(site, f * site.W, t * site.D);
    return rawGround(world, p.x, p.z) <= 0.3;
  }));
}

/**
 * The site, or the nearest one like it that is clear of every town in
 * `others`: moved off them, or made smaller, whichever moves it less from
 * where it was asked for. A harbour town made smaller keeps its front on the
 * water. Null if there is no room anywhere near.
 */
function keepClear(world, site, others) {
  // On a town's streets, or in reach of two that stand at different levels:
  // it can be put on the level of one of them, not of both.
  const clash = (s) => {
    let level = null;
    for (const o of others) {
      if (sitesOverlap(s, o, TOWN_GAP / 2, TOWN_GAP / 2)) return true;
      if (!reaches(s, o)) continue;
      if (level !== null && o.level !== level) return true;
      level = o.level;
    }
    return false;
  };
  if (!clash(site)) return site;
  const half = world.half || 7000;
  let best = null;
  for (const k of [1, 0.85, 0.7, 0.55, 0.42]) {
    const W = Math.round(site.W * k);
    const D = Math.round(site.D * k);
    const back = site.inland ? 0 : (site.D - D) / 2;
    const ox = site.x - Math.sin(site.rot) * back;
    const oz = site.z - Math.cos(site.rot) * back;
    const lim = half - Math.max(W, D) / 2 - 300;
    for (let r = 0; r <= 1800; r += 40) {
      const cost = r + (1 - k) * 900;
      if (best && cost >= best.cost) break;
      const n = r ? Math.max(8, Math.round((TAU * r) / 60)) : 1;
      for (let a = 0; a < n; a++) {
        const th = (a / n) * TAU;
        const x = ox + Math.sin(th) * r;
        const z = oz + Math.cos(th) * r;
        if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
        const s = { ...site, x, z, W, D };
        if (rawGround(world, x, z) <= 0.3 || clash(s)) continue;
        best = { s, cost };
        break;
      }
    }
  }
  if (!best) return null;
  const s = best.s;
  if (s.x !== site.x || s.z !== site.z || s.W !== site.W) s.inland = !wetFront(world, s);
  return s;
}

/**
 * A town on the spot asked for, on dry land: an island's or the coast's. It
 * is turned to face the nearest sea, and is a harbour town after all only if
 * the water comes up to its front.
 */
function siteAt(world, ask) {
  const isles = world.islands || [];
  const i = isles.length ? islandAt(world, ask.x, ask.z, 0) : null;
  let site;
  if (i) {
    const off = Math.hypot(ask.x - i.x, ask.z - i.z);
    const b = off > 1 ? Math.atan2(ask.x - i.x, ask.z - i.z) : Math.atan2(-i.x, -i.z);
    site = {
      x: ask.x, z: ask.z, rot: b,
      W: ask.w ?? clamp(i.r * 1.25, 200, 760), D: ask.d ?? clamp(i.r * 0.8, 150, 460),
      flat: 80, blend: 130, isle: isles.indexOf(i),
    };
  } else {
    // Down the slope of the distance to the shore is the way to the sea.
    const g = 300;
    const gx = shoreDistance(world, ask.x + g, ask.z) - shoreDistance(world, ask.x - g, ask.z);
    const gz = shoreDistance(world, ask.x, ask.z + g) - shoreDistance(world, ask.x, ask.z - g);
    const b = Math.hypot(gx, gz) > 1 ? Math.atan2(-gx, -gz) : Math.atan2(-ask.x, -ask.z);
    site = { x: ask.x, z: ask.z, rot: b, W: ask.w ?? 760, D: ask.d ?? 480, flat: 460, blend: 600, isle: -1 };
  }
  // A waterfront if the sea is at the front of it.
  site.inland = !wetFront(world, site);
  return site;
}

// ---------------------------------------------------------------------------
// Airfields and harbours
// ---------------------------------------------------------------------------

/** A runway's width, and where its middle line runs across the airfield's site. */
export const RUNWAY_W = 46;
const RUNWAY_V = 62;
/** How deep an airfield's site is, across the runway. */
const FIELD_D = 300;
/** The runway lengths an airfield is tried at, longest first. */
const FIELD_RUNS = [1500, 1250, 1000, 820];
/** A harbour's site: its quay's length and how far its apron runs back. */
const HARBOR_W = 560;
const HARBOR_D = 190;
/** How high a harbour's apron and its quay stand over the water. */
const QUAY_TOP = 4.5;

/** What share of a site's footprint is dry land. */
function dryShare(world, site, nu = 9, nv = 5) {
  let ok = 0;
  let n = 0;
  for (let a = 0; a < nu; a++) {
    for (let b = 0; b < nv; b++) {
      n++;
      const p = cityToWorld(site, (a / (nu - 1) - 0.5) * site.W * 0.98, (b / (nv - 1) - 0.5) * site.D * 0.96);
      if (rawGround(world, p.x, p.z) > 0.6) ok++;
    }
  }
  return ok / n;
}

/** The level a site's ground is cut to: the middle of the ground under it, kept off the sea and off the peaks. */
function siteLevel(world, site, rng, lo = 3.5) {
  const isles = world.islands || [];
  const hs = [];
  for (let k = 0; k < 60; k++) {
    const p = cityToWorld(site, (rng() - 0.5) * site.W, (rng() - 0.5) * site.D);
    const h = rawGround(world, p.x, p.z);
    if (h > 0.3) hs.push(h);
  }
  hs.sort((a, b) => a - b);
  const med = hs.length ? hs[Math.floor(hs.length * 0.5)] : 4;
  const top = site.isle >= 0 ? Math.max(16, (isles[site.isle]?.height || 20) * 0.8) : 420;
  return Math.round(clamp(med, lo, top) * 10) / 10;
}

/**
 * An airfield: a runway and the field round it, its taxiway and apron and
 * the hangars along the apron, on dry land as near the spot asked for as
 * there is room -- a runway is long, and it is laid the way the ground
 * will take it. Its local u runs along the runway. Null if there is no
 * ground anywhere near with room for even the shortest.
 */
function siteAirbase(world, ask, others = []) {
  const rng = makeRng(ask.seed ^ 0xa1fb5e);
  const isles = world.islands || [];
  const half = world.half || 7000;
  const spot = Number.isFinite(ask.x) ? { x: ask.x, z: ask.z } : { x: 0, z: 0 };
  const cands = [];
  if (Number.isFinite(ask.x) && rawGround(world, ask.x, ask.z) > 0.6) cands.push({ x: ask.x, z: ask.z, d: 0 });
  const step = Math.max(140, half / 45);
  const reach = Number.isFinite(ask.x) ? 3200 : half;
  for (let z = spot.z - reach; z <= spot.z + reach; z += step) {
    for (let x = spot.x - reach; x <= spot.x + reach; x += step) {
      if (Math.abs(x) > half - 700 || Math.abs(z) > half - 700) continue;
      if (rawGround(world, x, z) <= 1) continue;
      cands.push({ x, z, d: Math.hypot(x - spot.x, z - spot.z) });
    }
  }
  cands.sort((p, q) => p.d - q.d);
  const top = cands.slice(0, 36);
  const clash = (s) => others.some((o) => sitesOverlap(s, o, TOWN_GAP, TOWN_GAP));
  let best = null;
  for (const run of FIELD_RUNS) {
    const W = run + 100;
    for (const cnd of top) {
      for (let r = 0; r < 12; r++) {
        const rot = (r / 12) * Math.PI;
        const s = { x: cnd.x, z: cnd.z, rot, W, D: FIELD_D };
        const lim = half - W / 2 - 300;
        if (Math.abs(s.x) > lim || Math.abs(s.z) > lim) continue;
        const share = dryShare(world, s, 11, 5);
        if (share < 0.96 || clash(s)) continue;
        const score = -cnd.d - r * 0.01;
        if (!best || score > best.score) best = { s, score };
      }
    }
    if (best) break;
  }
  if (!best) return null;
  const s = best.s;
  const i = isles.length ? islandAt(world, s.x, s.z, 0) : null;
  const site = {
    ...s, inland: true, isle: i ? isles.indexOf(i) : -1,
    flat: i ? 60 : 460, blend: i ? 120 : 600,
  };
  // Its own level, off its own ground: a town or a harbour along the way
  // does not bring a runway on a hill down to the sea.
  site.level = siteLevel(world, site, rng);
  site.seed = ask.seed;
  return site;
}

/**
 * The shore nearest a point, and the way out to sea from it there:
 * `{ x, z, nx, nz }`, or null with no shore in reach. Found by walking from
 * the point the way the ground falls, to where it meets the water.
 */
function shoreNear(world, x, z) {
  const isles = world.islands || [];
  let bx;
  let bz;
  if (isles.length) {
    let best = null;
    for (const i of isles) {
      if (i.r < 140) continue;
      const a = Math.atan2(x - i.x, z - i.z);
      const d = Math.abs(Math.hypot(x - i.x, z - i.z) - islandRadius(i, a));
      if (!best || d < best.d) best = { i, d, a };
    }
    if (!best) return null;
    bx = Math.sin(best.a);
    bz = Math.cos(best.a);
  } else {
    const m = landMask(world);
    if (!m.any) return null;
    const g = 300;
    const gx = shoreDistance(world, x + g, z) - shoreDistance(world, x - g, z);
    const gz = shoreDistance(world, x, z + g) - shoreDistance(world, x, z - g);
    const L = Math.hypot(gx, gz);
    if (L < 1) return null;
    bx = -gx / L;
    bz = -gz / L;
  }
  // Along that line to where the ground crosses the water.
  const cross = (px, pz, dx, dz) => {
    const wet0 = rawGround(world, px, pz) <= 0.3;
    for (let t = 0; t <= 4000; t += 6) {
      const qx = px + dx * t * (wet0 ? -1 : 1);
      const qz = pz + dz * t * (wet0 ? -1 : 1);
      if ((rawGround(world, qx, qz) <= 0.3) !== wet0) return { x: qx, z: qz };
    }
    return null;
  };
  const p = cross(x, z, bx, bz);
  if (!p) return null;
  // The line of the shore there, from the crossings either side of it.
  const tx = bz;
  const tz = -bx;
  const a = cross(p.x + tx * 160 - bx * 40, p.z + tz * 160 - bz * 40, bx, bz);
  const b = cross(p.x - tx * 160 - bx * 40, p.z - tz * 160 - bz * 40, bx, bz);
  let nx = bx;
  let nz = bz;
  if (a && b) {
    const sx = a.x - b.x;
    const sz = a.z - b.z;
    const L = Math.hypot(sx, sz) || 1;
    nx = sz / L;
    nz = -sx / L;
    if (nx * bx + nz * bz < 0) { nx = -nx; nz = -nz; }
    // Not so far off the way the land falls that it faces along the shore.
    if (nx * bx + nz * bz < 0.5) { nx = bx; nz = bz; }
  }
  return { x: p.x, z: p.z, nx, nz };
}

/**
 * A harbour: a straight quay along the shore nearest the spot asked for,
 * the apron behind it made up to the quay's height, and its sheds and
 * cranes. Its local +v is out to sea, and its front edge is the quay's face,
 * a little out from the shore so there is water alongside. Null with no
 * shore near enough.
 */
function siteHarbor(world, ask, others = []) {
  const isles = world.islands || [];
  const half = world.half || 7000;
  const from = Number.isFinite(ask.x) ? { x: ask.x, z: ask.z } : { x: 0, z: 0 };
  const sh = shoreNear(world, from.x, from.z);
  if (!sh) return null;
  if (Number.isFinite(ask.x) && Math.hypot(sh.x - from.x, sh.z - from.z) > 2500) return null;
  const rot = Math.atan2(sh.nx, sh.nz);
  const W = HARBOR_W;
  const D = HARBOR_D;
  const out = 26;
  // Clear of every site standing, with a gap between: the ground between a
  // harbour's apron and an airfield up the hill behind it is blended from
  // the one level to the other (see worksGround), so a harbour is only kept
  // off the other sites' own ground, not off the whole of their levelling.
  const flatOf = (isle) => (isle ? { flat: 30, blend: 120 } : { flat: 300, blend: 450 });
  const clash = (s2) => others.some((o) => sitesOverlap(s2, o, SITE_GAP, SITE_GAP));
  let site = {
    x: sh.x - sh.nx * (D / 2 - out), z: sh.z - sh.nz * (D / 2 - out), rot, W, D,
    ...flatOf(isles.length > 0), inland: false,
  };
  const lim = half - W / 2 - 300;
  if (Math.abs(site.x) > lim || Math.abs(site.z) > lim) return null;
  if (clash(site)) {
    // Along the shore either way until it is clear of what is there.
    let moved = null;
    for (let k = 1; k <= 14 && !moved; k++) {
      for (const sgn of [1, -1]) {
        const p = cityToWorld(site, sgn * k * 160, D / 2 - out);
        const s2 = shoreNear(world, p.x, p.z);
        if (!s2) continue;
        const r2 = Math.atan2(s2.nx, s2.nz);
        const c2 = { ...site, x: s2.x - s2.nx * (D / 2 - out), z: s2.z - s2.nz * (D / 2 - out), rot: r2 };
        if (!clash(c2)) { moved = c2; break; }
      }
    }
    if (!moved) return null;
    site = moved;
  }
  // Something to stand on: a harbour built out entirely over open water is
  // a breakwater, not a harbour.
  if (dryShare(world, site, 7, 4) < 0.2) return null;
  const i = isles.length ? islandAt(world, site.x - Math.sin(site.rot) * 40, site.z - Math.cos(site.rot) * 40, 30) : null;
  site.isle = i ? isles.indexOf(i) : -1;
  site.level = QUAY_TOP;
  site.seed = ask.seed;
  return site;
}

/** A harbour's quay: a run of wall along the front of its apron, face to the sea. */
function quayOf(c) {
  const pts = [];
  const v = c.D / 2 - WALL_WIDTH / 2;
  const n = Math.max(4, Math.round((c.W - 8) / WALL_STEP));
  const nx = Math.sin(c.rot);
  const nz = Math.cos(c.rot);
  for (let k = 0; k <= n; k++) {
    const u = -c.W / 2 + 4 + ((c.W - 8) * k) / n;
    const p = cityToWorld(c, u, v);
    pts.push([p.x, p.z, nx, nz].map((q) => Math.round(q * 1000) / 1000));
  }
  return { pts, top: c.level, width: WALL_WIDTH, set: -1, harbor: c.index, quay: true };
}

/** What a site is called on the plot: a town, an airfield or a harbour. */
export function worksName(c) {
  return c?.kind === 'airbase' ? 'Airfield' : c?.kind === 'harbor' ? 'Harbour' : 'Town';
}

/** Every airfield on the battlefield, as its site. */
export function airbasesOf(world) {
  return (world?.works?.cities || []).filter((c) => c.kind === 'airbase');
}

/** Every harbour on the battlefield, as its site. */
export function harborsOf(world) {
  return (world?.works?.cities || []).filter((c) => c.kind === 'harbor');
}

/**
 * An airfield's runway in the world: its two ends, the bearing from the
 * first to the second, its length and its height.
 */
export function runwayOf(c) {
  const L = c.W - 100;
  const a = cityToWorld(c, -L / 2, RUNWAY_V);
  const b = cityToWorld(c, L / 2, RUNWAY_V);
  return {
    x0: a.x, z0: a.z, x1: b.x, z1: b.z, len: L, y: c.level,
    heading: Math.atan2(b.x - a.x, b.z - a.z),
  };
}

/**
 * Where a ship of `len` by `beam` lies alongside a harbour's quay, with her
 * middle as near `u` along it as there is quay for: `{ x, z, heading, u }`.
 * She lies with her side to the face and a fender's breadth off it, heading
 * whichever way along it `heading` is nearer.
 */
export function berthAlong(c, len, beam, u = 0, heading = 0) {
  const room = Math.max(0, c.W / 2 - len / 2 - 4);
  const uu = clamp(u, -room, room);
  const p = cityToWorld(c, uu, c.D / 2 + beam / 2 + 3);
  const along = Math.atan2(Math.cos(c.rot), -Math.sin(c.rot));
  const d = Math.atan2(Math.sin(heading - along), Math.cos(heading - along));
  const h = Math.abs(d) <= Math.PI / 2 ? along : along + Math.PI;
  return { x: p.x, z: p.z, heading: Math.atan2(Math.sin(h), Math.cos(h)), u: uu };
}

/** A point in the town's frame -- u across the front, v out to sea -- in the world. */
export function cityToWorld(c, u, v) {
  const s = Math.sin(c.rot);
  const k = Math.cos(c.rot);
  return { x: c.x + k * u + s * v, z: c.z - s * u + k * v };
}

/** And back. */
export function worldToCity(c, x, z) {
  const dx = x - c.x;
  const dz = z - c.z;
  const s = Math.sin(c.rot);
  const k = Math.cos(c.rot);
  return { u: k * dx - s * dz, v: s * dx + k * dz };
}

// ---------------------------------------------------------------------------
// The ground
// ---------------------------------------------------------------------------

/**
 * While this is set the works are read as they were built: walls intact and
 * no craters anywhere on the paving. The town's layout is drawn up against
 * the ground in that state, so it comes out the same however much of the
 * battle has been fought by the time a client joins it.
 */
let PRISTINE = false;
export function pristine() { return PRISTINE; }

// How sharply two sites' levellings give way to each other between them: the
// say each has goes as its distance to the power of this, so each keeps its
// own level until well over towards the other.
const BLEND_POW = 16;

/**
 * The ground with the works on it, given the ground without them.
 *
 * The town's site is levelled: inside it and for a margin round it the ground
 * is the town's level wherever there was land to level, and past that it is
 * blended back into the hill. The sea is left where it is -- the levelling
 * stops at the shore and makes a quay of it. Over that, the sea walls: their
 * walkway is the ground along their whole width, or the heap of broken
 * concrete a breach left.
 */
export function worksGround(world, x, z, base) {
  const w = world.works;
  if (!w) return base;
  let h = base;
  // Every site's own footprint is on its level exactly. Round it, its
  // levelling runs out over its margin and is blended back into the hill;
  // where the margins of two sites at different heights meet, each has the
  // more say the nearer the point is to it, so the ground runs from the one
  // level to the other across the gap between them rather than one site
  // having to be put on the other's level, or kept a mile off it.
  let num = 0;
  let den = 0;
  // How much of the ground is left as it was, after every site's levelling
  // has had its pull on it.
  let left = 1;
  for (const c of w.cities) {
    const { u, v } = worldToCity(c, x, z);
    const out = Math.max(Math.abs(u) - c.W / 2, Math.abs(v) - c.D / 2);
    // A harbour's apron is made ground: filled out over the shallows to the
    // line of its quay, whatever was there.
    if (out <= 0 && (c.kind === 'harbor' || base > 0.3)) { num = c.level; den = 1; left = 0; h = null; break; }
    if (base <= 0.3) continue;
    const far = out - c.flat;
    if (far >= c.blend) continue;
    const t = far <= 0 ? 1 : 1 - far / c.blend;
    const e = t * t * (3 - 2 * t);
    const wt = e / Math.max(0.5, out) ** BLEND_POW;
    num += wt * c.level;
    den += wt;
    left *= 1 - e;
  }
  if (h === null) h = num;
  else if (den > 0) h = Math.max(0.35, base + (num / den - base) * (1 - left));
  else h = base;
  if (w.walls.length) {
    // The berth along the face: dredged out, the way the water alongside a
    // sea wall always is -- a wall is built where there is deep water to
    // keep the sea off, and a quay is no use to a ship that grounds a
    // hundred metres short of it. Only where there is sea already; the
    // coast stays where it is.
    if (h < 0) h = Math.min(h, berthFloor(world, x, z, h));
    const at = wallAt(world, x, z);
    if (at) h = wallTop(world, at, h);
  }
  return h;
}

/** How far out from a wall's face its berth is dredged, and how deep. */
const BERTH = 110;
const BERTH_FULL = 35;
const BERTH_DEEP = 14;
const BERTH_INDEX = new WeakMap();

/** The walls' segments filed for their berths, which reach further than the walls do. */
function berthIndex(world) {
  const w = world.works;
  let idx = BERTH_INDEX.get(w);
  if (idx) return idx;
  idx = new Map();
  const reach = WALL_WIDTH / 2 + BERTH;
  w.walls.forEach((run, ri) => {
    for (let k = 0; k < run.pts.length - 1; k++) {
      const [ax, az] = run.pts[k];
      const [bx, bz] = run.pts[k + 1];
      const x0 = Math.floor((Math.min(ax, bx) - reach) / WCELL);
      const x1 = Math.floor((Math.max(ax, bx) + reach) / WCELL);
      const z0 = Math.floor((Math.min(az, bz) - reach) / WCELL);
      const z1 = Math.floor((Math.max(az, bz) + reach) / WCELL);
      for (let gx = x0; gx <= x1; gx++) {
        for (let gz = z0; gz <= z1; gz++) {
          const kk = gx * 100003 + gz;
          if (!idx.has(kk)) idx.set(kk, []);
          idx.get(kk).push(ri, k);
        }
      }
    }
  });
  BERTH_INDEX.set(w, idx);
  return idx;
}

/**
 * The bottom of a wall's berth under a point out in front of it, given the
 * bottom there as it was: the full depth along the face, shoaling back to
 * the natural bottom over the next seventy-odd metres. The natural bottom if
 * the point is not in front of any wall.
 */
export function berthFloor(world, x, z, h) {
  const list = berthIndex(world).get(Math.floor(x / WCELL) * 100003 + Math.floor(z / WCELL));
  if (!list) return h;
  let best = Infinity;
  const runs = world.works.walls;
  for (let q = 0; q < list.length; q += 2) {
    const run = runs[list[q]];
    const k = list[q + 1];
    const [ax, az, anx, anz] = run.pts[k];
    const [bx, bz, bnx, bnz] = run.pts[k + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const L2 = dx * dx + dz * dz || 1;
    const t0 = ((x - ax) * dx + (z - az) * dz) / L2;
    // Square at the two ends of the run, rounded between its segments: on
    // the outside of a bend a point past the end of one segment and short of
    // the next is still in front of the wall (see wallAt).
    if ((t0 < 0 && k === 0) || (t0 > 1 && k === run.pts.length - 2)) continue;
    const t = clamp(t0, 0, 1);
    const nx = anx + (bnx - anx) * t;
    const nz = anz + (bnz - anz) * t;
    const ox = x - ax - dx * t;
    const oz = z - az - dz * t;
    // Out in front of it, not behind it.
    if (ox * nx + oz * nz <= 0) continue;
    const out = Math.hypot(ox, oz) - run.width / 2;
    if (out < -1 || out > BERTH) continue;
    best = Math.min(best, Math.max(0, out));
  }
  if (best === Infinity) return h;
  const f = clamp((best - BERTH_FULL) / (BERTH - BERTH_FULL), 0, 1);
  const e = f * f * (3 - 2 * f);
  return -BERTH_DEEP + (h + BERTH_DEEP) * e;
}

/** Whether a point is paved -- on the town's level or on a wall -- so a shell digs no crater there. */
export function worksHard(world, x, z) {
  const w = world.works;
  if (!w) return false;
  for (const c of w.cities) {
    const { u, v } = worldToCity(c, x, z);
    if (Math.abs(u) < c.W / 2 + c.flat && Math.abs(v) < c.D / 2 + c.flat) return true;
  }
  return !!(w.walls.length && wallAt(world, x, z));
}

/** The highest anything built stands, for the cheap test of whether a shell can have hit it. */
export function worksCeiling(world) {
  const w = world.works;
  if (!w) return 0;
  let top = 0;
  for (const r of w.walls) top = Math.max(top, r.top + PARAPET);
  for (const c of w.cities) top = Math.max(top, c.level + 100);
  return top;
}

// ---------------------------------------------------------------------------
// Sea walls
// ---------------------------------------------------------------------------

/**
 * Lay one stretch of walls along the shore, onto `runs`.
 *
 * On invented islands each wall follows the island's own rim, a metre and a
 * half inside it. On a real coast it follows the shore as the coast is drawn:
 * the contour of the terrain mesh itself, traced triangle by triangle, so the
 * wall's face is where the sea meets the land on the screen and not a hundred
 * metres either side of it.
 *
 * Asked for at a spot, the wall is built along the shore nearest it: round
 * the side of the nearest island that faces the spot, or along the stretch of
 * coast closest to it. Left to itself, the k-th stretch walls the k-th town's
 * waterfront, or the islands and the shore in front of the battle. Nothing is
 * built over a wall that is already there.
 */
function runWalls(world, ask, k, runs) {
  const rng = makeRng(ask.seed ^ 0x5eaa11);
  const isles = world.islands || [];
  const cities = world.works?.cities || [];
  const spot = Number.isFinite(ask.x) ? { x: ask.x, z: ask.z } : null;
  const city = spot ? null : cities[k % Math.max(1, cities.length)] || null;
  // When the board put this one down: a wall it put down at a spot, before
  // a town was put down there, is kept whole. One left to find its own
  // shore keeps out of every town's streets.
  const order = spot && Number.isFinite(ask.n) ? ask.n : Infinity;
  const taken = runs.slice();
  const from = runs.length;
  if (isles.length && spot) {
    // The island whose shore is nearest the spot, walled round the side of
    // it the spot is on.
    let best = null;
    for (const i of isles) {
      if (i.r < 120) continue;
      const a = Math.atan2(spot.x - i.x, spot.z - i.z);
      const d = Math.abs(Math.hypot(spot.x - i.x, spot.z - i.z) - islandRadius(i, a));
      if (!best || d < best.d) best = { i, d, a };
    }
    if (best) {
      const { i, a } = best;
      const off = Math.hypot(spot.x - i.x, spot.z - i.z);
      const mid = off > 1 ? a : Math.atan2(-i.x, -i.z);
      const span = clamp(1800 / i.r, 0.5, 1.6) * (0.85 + rng() * 0.3);
      pushRun(world, runs, rimLine(i, mid, span), taken, order);
    }
  } else if (isles.length) {
    // The islands nearest the middle of the battle, biggest first among equals.
    const near = isles
      .filter((i) => i.r >= 200)
      .map((i) => ({ i, d: Math.hypot(i.x, i.z) - i.r * 0.8 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 6);
    if (city && city.isle >= 0 && !near.some((n) => n.i === isles[city.isle])) {
      near.unshift({ i: isles[city.isle], d: 0 });
    }
    for (const { i } of near) {
      const onCity = city && isles[city.isle] === i && !city.inland;
      // Facing the battle, or the town's waterfront.
      const mid = onCity ? city.rot : Math.atan2(-i.x, -i.z) + (rng() - 0.5) * 0.8;
      const span = onCity
        ? Math.max(1.0, (city.W / i.r) * 0.85 + 0.5)
        : 0.9 + rng() * 0.9;
      pushRun(world, runs, rimLine(i, mid, span), taken);
    }
  } else {
    const target = spot || (city ? cityToWorld(city, 0, city.D / 2) : { x: 0, z: 0 });
    for (const line of coastLines(world, rng, target, !!spot, !!spot)) pushRun(world, runs, line, taken, order);
  }
  // Which of the stretches asked for each run was built for.
  for (let r = from; r < runs.length; r++) runs[r].set = k;
}

/**
 * An island's rim from bearing `mid - span / 2` to `mid + span / 2`, finely,
 * with its true outward normal at each point -- not the bearing from the
 * island's middle, which is skewed to the shore wherever the island bulges --
 * and the wall's middle line set in from the rim along it.
 */
function rimLine(i, mid, span) {
  const a0 = mid - span / 2;
  const steps = Math.max(4, Math.round((span * i.r) / WALL_STEP));
  const rim = (a) => {
    const R = islandRadius(i, a);
    return [i.x + Math.sin(a) * R, i.z + Math.cos(a) * R];
  };
  const pts = [];
  const da = span / steps;
  for (let k = 0; k <= steps; k++) {
    const a = a0 + da * k;
    const [x, z] = rim(a);
    const [px, pz] = rim(a - da * 0.5);
    const [qx, qz] = rim(a + da * 0.5);
    let nx = qz - pz;
    let nz = -(qx - px);
    const L = Math.hypot(nx, nz) || 1;
    nx /= L; nz /= L;
    if (nx * Math.sin(a) + nz * Math.cos(a) < 0) { nx = -nx; nz = -nz; }
    const back = 1.5 + WALL_WIDTH / 2;
    pts.push([x - nx * back, z - nz * back, nx, nz]);
  }
  return pts;
}

const BOXES = new WeakMap();

/** Whether a point is within a wall's width of one of the runs already laid. */
function onTaken(taken, x, z) {
  const R = WALL_WIDTH * 1.1;
  for (const run of taken) {
    let b = BOXES.get(run);
    if (!b) BOXES.set(run, b = boxOf(run.pts, R));
    if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue;
    for (const p of run.pts) if (Math.abs(p[0] - x) < R && Math.abs(p[1] - z) < R && Math.hypot(p[0] - x, p[1] - z) < R) return true;
  }
  return false;
}

/**
 * Whether a wall here would be run through a town's streets. Along a harbour
 * town's waterfront it is welcome -- that is what a sea wall is for -- but a
 * shore that winds in behind the front row would take the wall through the
 * houses, and the town is drawn up round whatever wall there is.
 */
function inTown(world, x, z, before = Infinity) {
  const asked = world.works?.ask?.cities || [];
  for (const c of world.works?.cities || []) {
    const { u, v } = worldToCity(c, x, z);
    const pad = WALL_WIDTH / 2;
    // Nobody's wall is run across an airfield or a harbour: a harbour has its
    // own quay (see quayOf).
    if (c.kind) {
      if (Math.abs(u) <= c.W / 2 + pad && Math.abs(v) <= c.D / 2 + pad) return true;
      continue;
    }
    // A town put down after the wall was is built round the wall, and does
    // not take it away: the houses are kept off its walkway (see drawUp).
    if ((asked[c.ask]?.n ?? -1) > before) continue;
    if (Math.abs(u) > c.W / 2 + pad || Math.abs(v) > c.D / 2 + pad) continue;
    if (c.inland || v < c.D / 2 - FRONT_STRIP) return true;
  }
  return false;
}
/** How deep a harbour town's waterfront is, which a wall may be run along. */
const FRONT_STRIP = 150;

function boxOf(pts, pad) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  return [x0 - pad, x1 + pad, z0 - pad, z1 + pad];
}

/**
 * Cut a line of [x, z, nx, nz] (n pointing out to sea) into runs where the
 * ground will carry a wall and no wall stands already, and give each run its
 * height.
 *
 * `before` is when the board put the wall down, in the order it put the
 * works down: a town put down after it does not take any of it away.
 */
function pushRun(world, runs, pts, taken = [], before = Infinity) {
  let cur = [];
  const flush = () => {
    if (cur.length >= 4) {
      // As high as the ground at the back of it, and never lower than a sea
      // wall is: eight metres over the water.
      const backs = cur.map(([x, z, nx, nz]) => groundHeight(world, x - nx * (WALL_WIDTH / 2 + 2), z - nz * (WALL_WIDTH / 2 + 2)))
        .sort((a, b) => a - b);
      const back = backs[Math.floor(backs.length * 0.7)];
      const top = Math.round(clamp(Math.max(8, back + 1), 8, 22) * 10) / 10;
      runs.push({ pts: cur.map((p) => p.map((q) => Math.round(q * 1000) / 1000)), top, width: WALL_WIDTH });
    }
    cur = [];
  };
  // Points that failed only on the ground under them, held in case the wall
  // picks up again just past them: a wall is carried across a gully or a
  // little inlet a few steps wide rather than broken off either side of it,
  // which left a gap a man could see the sea through.
  let held = [];
  for (const p of pts) {
    const [x, z, nx, nz] = p;
    const free = Math.abs(x) < world.half - 300 && Math.abs(z) < world.half - 300
      && !onTaken(taken, x, z) && !inTown(world, x, z, before);
    // Ground under the back edge and the middle of it, and the sea not far
    // past the front.
    const ground = rawGround(world, x, z) > 0.2
      && rawGround(world, x - nx * (WALL_WIDTH / 2), z - nz * (WALL_WIDTH / 2)) > 0.3;
    if (free && ground) {
      if (held.length) cur.push(...held);
      held = [];
      cur.push(p);
    } else if (free && cur.length && held.length < BRIDGE) {
      held.push(p);
    } else {
      held = [];
      flush();
    }
  }
  flush();
}

/**
 * The shore of a real coast as it is drawn, traced off the terrain mesh, and
 * cut into the lines worth walling: those nearest `target` -- only the one
 * nearest, when `single`. Each point carries the way out to sea.
 *
 * `natural` traces the shore as it was before any town was levelled into it.
 * A wall the board put down at a spot is traced so: it was laid along that
 * shore before the town came, and an inland town's levelling, run down to the
 * water, would otherwise move the shore out from under it and take it away.
 */
function coastLines(world, rng, target, single = false, natural = false) {
  const g = coastGrid(world);
  if (!g.m.any) return [];
  const { cell, n, o } = g;
  const H = new Float32Array((n + 1) * (n + 1));
  const at = natural ? rawGround : groundHeight;
  for (let j = 0; j <= n; j++) {
    // The ground as it is drawn, the town's levelling and all: the walls
    // are run before there are any, so this is the shore the sea meets.
    for (let i = 0; i <= n; i++) H[j * (n + 1) + i] = at(world, o + i * cell, o + j * cell);
  }
  const LV = 1;
  const segs = [];
  const P = (i, j) => [o + i * cell, o + j * cell, H[j * (n + 1) + i]];
  const cut = (a, b) => {
    const t = (LV - a[2]) / (b[2] - a[2]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const tri = (a, b, c) => {
    const s = [a, b, c].map((p) => p[2] > LV);
    const k = s.filter(Boolean).length;
    if (k === 0 || k === 3) return;
    const out = [];
    for (const [p, q] of [[a, b], [b, c], [c, a]]) if ((p[2] > LV) !== (q[2] > LV)) out.push(cut(p, q));
    if (out.length === 2) segs.push(out);
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      // Split the way the renderer splits it.
      if (coastSplit(a[2], b[2], c[2], d[2])) { tri(a, b, c); tri(a, c, d); } else { tri(a, b, d); tri(b, c, d); }
    }
  }
  // Chained into lines by shared end points.
  const key = (p) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
  const ends = new Map();
  segs.forEach((s, k) => {
    for (const e of [0, 1]) {
      const kk = key(s[e]);
      if (!ends.has(kk)) ends.set(kk, []);
      ends.get(kk).push(k);
    }
  });
  const used = new Uint8Array(segs.length);
  const lines = [];
  for (let k = 0; k < segs.length; k++) {
    if (used[k]) continue;
    used[k] = 1;
    const line = [segs[k][0], segs[k][1]];
    for (const dir of [1, 0]) {
      for (;;) {
        const tip = dir ? line[line.length - 1] : line[0];
        const next = (ends.get(key(tip)) || []).find((q) => !used[q]);
        if (next === undefined) break;
        used[next] = 1;
        const s = segs[next];
        const far = key(s[0]) === key(tip) ? s[1] : s[0];
        if (dir) line.push(far); else line.unshift(far);
      }
    }
    lines.push(line);
  }
  // Which part of the shore to wall: a window of shore about three
  // kilometres long round the point of each line nearest the target.
  const scored = lines.map((l) => {
    let best = Infinity;
    let at = 0;
    l.forEach((p, k) => { const d = Math.hypot(p[0] - target.x, p[1] - target.z); if (d < best) { best = d; at = k; } });
    return { l, best, at };
  }).filter((s) => s.l.length > 3).sort((a, b) => a.best - b.best).slice(0, single ? 1 : 3);
  const out = [];
  scored.forEach((s, rank) => {
    const reach = rank === 0 ? 1600 : 900 + rng() * 500;
    // Resampled at the wall's own step, inside the window.
    const res = [];
    let acc = 0;
    let from = s.at;
    while (from > 0 && acc < reach) { acc += Math.hypot(s.l[from][0] - s.l[from - 1][0], s.l[from][1] - s.l[from - 1][1]); from--; }
    acc = 0;
    let to = s.at;
    while (to < s.l.length - 1 && acc < reach) { acc += Math.hypot(s.l[to + 1][0] - s.l[to][0], s.l[to + 1][1] - s.l[to][1]); to++; }
    let carry = 0;
    for (let k = from; k < to; k++) {
      const [ax, az] = s.l[k];
      const [bx, bz] = s.l[k + 1];
      const L = Math.hypot(bx - ax, bz - az);
      for (let d = carry; d < L; d += WALL_STEP) res.push([ax + ((bx - ax) * d) / L, az + ((bz - az) * d) / L]);
      carry = (carry - L) % WALL_STEP;
      if (carry < 0) carry += WALL_STEP;
    }
    if (res.length < 5) return;
    // Smoothed a little -- a contour off triangles is a line of short
    // straight pieces -- and moved in off the shore to the wall's middle.
    const sm = res.map((p, k) => {
      const a = res[Math.max(0, k - 2)];
      const b = res[Math.min(res.length - 1, k + 2)];
      return [(a[0] + p[0] * 2 + b[0]) / 4, (a[1] + p[1] * 2 + b[1]) / 4];
    });
    const line = sm.map((p, k) => {
      const a = sm[Math.max(0, k - 1)];
      const b = sm[Math.min(sm.length - 1, k + 1)];
      let tx = b[0] - a[0];
      let tz = b[1] - a[1];
      const L = Math.hypot(tx, tz) || 1;
      tx /= L; tz /= L;
      // Of the two normals, the one the ground falls away along.
      let nx = tz, nz = -tx;
      const up = rawGround(world, p[0] + nx * 40, p[1] + nz * 40) - rawGround(world, p[0] - nx * 40, p[1] - nz * 40);
      if (up > 0) { nx = -nx; nz = -nz; }
      const back = WALL_WIDTH / 2 + 3;
      return [p[0] - nx * back, p[1] - nz * back, nx, nz];
    });
    // Run so the sea is on its left, the way an island's rim runs: a contour
    // traced off the mesh goes whichever way the trace happened to find it.
    let turn = 0;
    for (let k = 0; k < line.length - 1; k++) {
      turn += line[k][3] * (line[k + 1][0] - line[k][0]) - line[k][2] * (line[k + 1][1] - line[k][1]);
    }
    if (turn < 0) line.reverse();
    out.push(line);
  });
  return out;
}

const WALL_INDEX = new WeakMap();
const WCELL = 48;

/** The walls' segments filed on a grid, so a point is tested against the few near it. */
function wallIndex(world) {
  const w = world.works;
  let idx = WALL_INDEX.get(w);
  if (idx) return idx;
  idx = new Map();
  const reach = WALL_WIDTH / 2 + 2;
  w.walls.forEach((run, ri) => {
    for (let k = 0; k < run.pts.length - 1; k++) {
      const [ax, az] = run.pts[k];
      const [bx, bz] = run.pts[k + 1];
      const x0 = Math.floor((Math.min(ax, bx) - reach) / WCELL);
      const x1 = Math.floor((Math.max(ax, bx) + reach) / WCELL);
      const z0 = Math.floor((Math.min(az, bz) - reach) / WCELL);
      const z1 = Math.floor((Math.max(az, bz) + reach) / WCELL);
      for (let gx = x0; gx <= x1; gx++) {
        for (let gz = z0; gz <= z1; gz++) {
          const kk = gx * 100003 + gz;
          if (!idx.has(kk)) idx.set(kk, []);
          idx.get(kk).push(ri, k);
        }
      }
    }
  });
  WALL_INDEX.set(w, idx);
  return idx;
}

/**
 * Where on a wall a point is: `{ run, seg, t, across, sec }`, with `across`
 * the distance from the wall's middle line out towards the sea (negative
 * inland), or null off every wall. `pad` widens the test.
 */
export function wallAt(world, x, z, pad = 0) {
  const w = world.works;
  if (!w || !w.walls.length) return null;
  const list = wallIndex(world).get(Math.floor(x / WCELL) * 100003 + Math.floor(z / WCELL));
  if (!list) return null;
  let best = null;
  for (let q = 0; q < list.length; q += 2) {
    const run = w.walls[list[q]];
    const k = list[q + 1];
    const [ax, az, anx, anz] = run.pts[k];
    const [bx, bz, bnx, bnz] = run.pts[k + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const L2 = dx * dx + dz * dz || 1;
    const t = ((x - ax) * dx + (z - az) * dz) / L2;
    // Cut off square only at the two ends of the run. Between two of its
    // segments the corner is rounded off: on the outside of a bend a point
    // past the end of one segment and short of the start of the next is still
    // on the wall, and leaving it out holed the wall at every bend.
    if ((t < -0.02 && k === 0) || (t > 1.02 && k === run.pts.length - 2)) continue;
    const tc = clamp(t, 0, 1);
    const px = ax + dx * tc;
    const pz = az + dz * tc;
    const nx = anx + (bnx - anx) * tc;
    const nz = anz + (bnz - anz) * tc;
    const across = (x - px) * nx + (z - pz) * nz;
    const d = Math.hypot(x - px, z - pz);
    if (d > run.width / 2 + pad) continue;
    if (!best || d < best.d) {
      best = { run: list[q], seg: k, t: tc, across, d, sec: Math.floor(k / WALL_SECTION) };
    }
  }
  return best;
}

/** The id a wall section is known by on the wire. */
export function wallId(runIndex, sec) { return runIndex * 1000 + sec; }

/** How many sections a run of wall is fought in. */
export function wallSections(run) { return Math.max(1, Math.ceil((run.pts.length - 1) / WALL_SECTION)); }

/** The two ends of one section, as indices into the run's points. */
export function sectionSpan(run, sec) {
  return [sec * WALL_SECTION, Math.min(run.pts.length - 1, (sec + 1) * WALL_SECTION)];
}

/** How much of a section is gone, 0 to 1. */
export function wallDamage(world, runIndex, sec) {
  return world.ruin?.w?.[wallId(runIndex, sec)]?.d || 0;
}

/**
 * The height of a wall's walkway under a point on it, given the ground there
 * without it. A breached section is a heap of broken concrete: a third of its
 * height, and lower still the more it has been knocked about.
 */
function wallTop(world, at, ground) {
  const run = world.works.walls[at.run];
  const d = PRISTINE ? 0 : wallDamage(world, at.run, at.sec);
  if (d < 1) return Math.max(ground, run.top);
  return Math.max(ground, run.top * 0.38);
}

/** The structural strength of one section of wall, in the units a shell's damage comes in. */
export function wallHp(run) {
  // Mass concrete, its own width deep and its own height high, twenty-four
  // metres of it: three or four sixteen-inch shells on the walkway to breach,
  // two or three heavy bombs, or thirty-odd rounds of destroyer fire. A taller
  // wall is more of it, but not in proportion: what brings a section down is
  // its crown and its face going, not the whole of it being pulverised.
  return 45 + 2.5 * run.top;
}

/**
 * What a burst is worth against the works: the bore in decimetres squared,
 * times how much of a burst the round is.
 *
 * Not the cube of the bore, which is what the charge goes as and what digs a
 * crater in open ground. Against masonry and concrete what counts is the
 * area a burst shatters, and that goes nearer the square: a five-inch round
 * is a tenth of a sixteen-inch one against a wall, not a thirtieth -- which
 * is the difference between a destroyer's guns doing something to a town and
 * a destroyer's guns being scenery.
 */
export function worksPower(charge, filler) {
  const bore = Math.cbrt(Math.max(0, charge));
  return bore * bore * filler;
}

/** How many of its hits a section of wall remembers, to be drawn. */
export const WALL_SCARS = 12;

// ---------------------------------------------------------------------------
// Laying the town out
// ---------------------------------------------------------------------------

/** What a cell of the town's surface is. */
export const SURF = {
  none: 0, road: 1, walk: 2, lawn: 3, plaza: 4, yard: 5, path: 6, median: 7,
  // An airfield's: the runway's concrete, and the white paint on it.
  runway: 8, mark: 9,
};
/** How far above the town's level each kind of surface stands. */
export const SURF_RISE = [0, 0, 0.15, 0.12, 0.15, 0.05, 0.1, 0.18, 0, 0];
/** How big a cell of the town's surface is. */
export const SURF_CELL = 2.5;

const ROAD = 10;          // a street's carriageway
const BOULEVARD = 30;     // two carriageways and a planted strip
const MEDIAN = 7;
const WALK = 3.5;         // the pavement round every block

/**
 * The material a building is made of, and what that is worth against a shell
 * and a fire. `hp` is per hundred cubic metres.
 */
export const BUILT = {
  wood: { hp: 0.45, burn: 0.65, rate: 0.022 },
  brick: { hp: 1.0, burn: 0.28, rate: 0.012 },
  stone: { hp: 1.45, burn: 0.14, rate: 0.008 },
  concrete: { hp: 2.1, burn: 0.07, rate: 0.006 },
};

const PLANS = new WeakMap();

/**
 * A whole town -- the `i`-th -- drawn up once from its site and kept: its
 * streets, its blocks, every building and every piece of street furniture.
 * Every number in it comes off the site's seed and the ground, so both ends of
 * the wire draw up the same one.
 *
 * Coordinates in the plan are the town's own, u across the front and v out to
 * sea, with the world's own copies on everything that stands anywhere.
 */
export function cityPlan(world, i = 0) {
  const c = world.works?.cities?.[i];
  if (!c) return null;
  const had = PLANS.get(c);
  if (had) return had;
  const was = PRISTINE;
  PRISTINE = true;
  let plan;
  try { plan = drawUp(world, c); } finally { PRISTINE = was; }
  PLANS.set(c, plan);
  return plan;
}

const NO_PLANS = [];

/** Every town's plan, in the order the towns were asked for. */
export function cityPlans(world) {
  const cs = world.works?.cities;
  if (!cs?.length) return NO_PLANS;
  return cs.map((_, i) => cityPlan(world, i));
}

/** A building in any of the towns, by its id. */
export function buildingById(world, id) {
  return cityPlan(world, Math.floor(id / CITY_IDS))?.byId.get(id) || null;
}

/** The town whose site a point is on, padded by `pad`, or null. */
function planAt(world, x, z, pad = 0) {
  for (const plan of cityPlans(world)) {
    const { u, v } = worldToCity(plan.city, x, z);
    if (Math.abs(u) <= plan.W / 2 + pad && Math.abs(v) <= plan.D / 2 + pad) return plan;
  }
  return null;
}

/**
 * Which cells of a site's surface are on its level: the drawn ground at the
 * site's height at all four corners, on dry ground, and off every wall.
 */
function levelCells(world, c) {
  const W = c.W;
  const D = c.D;
  const L = c.level;
  // A harbour's apron is made ground: what counts as dry there is the ground
  // with the works on it, not the shore it was built out from.
  const dryAt = c.kind === 'harbor'
    ? (x, z) => groundHeight(world, x, z) > 0.3
    : (x, z) => rawGround(world, x, z) > 0.3;
  const nu = Math.ceil(W / SURF_CELL);
  const nv = Math.ceil(D / SURF_CELL);
  const surf = new Uint8Array(nu * nv);
  // A cell is ground the town can be built on when the drawn terrain is at
  // the town's level at all four of its corners and none of it is a wall.
  const level = new Uint8Array((nu + 1) * (nv + 1));
  // Asking the drawn mesh is the expensive part, and it is only worth asking
  // near the water: a point with dry land all round it for further than an
  // island's mesh cell is on the level by construction (see worksGround).
  // So a coarse map of how far each point is from the sea comes first.
  const CC = 10;
  // Not where another town's levelling reaches into this one's: there the
  // ground is at the other town's level, however far it is from the sea.
  const crowded = (world.works?.cities || []).some((o) => o !== c
    && Math.hypot(o.x - c.x, o.z - c.z) < Math.hypot(o.W, o.D) / 2 + o.flat + o.blend + Math.hypot(W, D) / 2);
  const SAFE = c.isle >= 0 && !crowded ? 70 : Infinity;
  const cu = Math.ceil((W + 2 * SAFE) / CC) + 1 || 0;
  const cv = Math.ceil((D + 2 * SAFE) / CC) + 1 || 0;
  let far = null;
  if (Number.isFinite(SAFE)) {
    far = new Float32Array(cu * cv).fill(1e9);
    for (let j = 0; j < cv; j++) {
      for (let i = 0; i < cu; i++) {
        const p = cityToWorld(c, -W / 2 - SAFE + i * CC, -D / 2 - SAFE + j * CC);
        if (!dryAt(p.x, p.z)) far[j * cu + i] = 0;
      }
    }
    // Two chamfer passes: distance to the nearest wet cell, in metres.
    for (let j = 0; j < cv; j++) {
      for (let i = 0; i < cu; i++) {
        const k = j * cu + i;
        if (i > 0) far[k] = Math.min(far[k], far[k - 1] + CC);
        if (j > 0) far[k] = Math.min(far[k], far[k - cu] + CC);
        if (i > 0 && j > 0) far[k] = Math.min(far[k], far[k - cu - 1] + CC * 1.42);
        if (i < cu - 1 && j > 0) far[k] = Math.min(far[k], far[k - cu + 1] + CC * 1.42);
      }
    }
    for (let j = cv - 1; j >= 0; j--) {
      for (let i = cu - 1; i >= 0; i--) {
        const k = j * cu + i;
        if (i < cu - 1) far[k] = Math.min(far[k], far[k + 1] + CC);
        if (j < cv - 1) far[k] = Math.min(far[k], far[k + cu] + CC);
        if (i < cu - 1 && j < cv - 1) far[k] = Math.min(far[k], far[k + cu + 1] + CC * 1.42);
        if (i > 0 && j < cv - 1) far[k] = Math.min(far[k], far[k + cu - 1] + CC * 1.42);
      }
    }
  }
  const dryFor = (u, v) => {
    if (!far) return 0;
    const i = Math.round((u + W / 2 + SAFE) / CC);
    const j = Math.round((v + D / 2 + SAFE) / CC);
    if (i < 0 || j < 0 || i >= cu || j >= cv) return 0;
    return far[j * cu + i] - CC;
  };
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = -W / 2 + i * SURF_CELL;
      const v = -D / 2 + j * SURF_CELL;
      const p = cityToWorld(c, u, v);
      const ok = (dryFor(u, v) > SAFE || Math.abs(drawnGround(world, p.x, p.z) - L) < 0.06)
        && dryAt(p.x, p.z) && !wallAt(world, p.x, p.z, c.kind === 'harbor' ? 0.5 : 4);
      level[j * (nu + 1) + i] = ok ? 1 : 0;
    }
  }
  const lv = (i, j) => level[j * (nu + 1) + i];
  const cellOk = (i, j) => lv(i, j) && lv(i + 1, j) && lv(i, j + 1) && lv(i + 1, j + 1);
  return { nu, nv, surf, cellOk };
}

function drawUp(world, c) {
  if (c.kind === 'airbase') return drawAirbase(world, c);
  if (c.kind === 'harbor') return drawHarbor(world, c);
  const rng = makeRng(c.seed ^ 0x7c17e5);
  const W = c.W;
  const D = c.D;
  const L = c.level;

  // ---- the street grid
  // Streets running inland from the sea (constant u), with the boulevard in
  // the middle, and streets along the front (constant v).
  const across = [{ at: 0, w: BOULEVARD, kind: 'boulevard' }];
  for (const side of [-1, 1]) {
    let u = BOULEVARD / 2;
    for (;;) {
      const centre = Math.abs(u) < W * 0.22;
      u += (centre ? 78 : 92) + rng() * (centre ? 34 : 46);
      if (u > W / 2 - 30) break;
      across.push({ at: side * u, w: ROAD, kind: 'street' });
    }
  }
  across.sort((a, b) => a.at - b.at);
  // Along the front: the waterfront road, then the cross streets inland.
  const along = [];
  let v = D / 2 - 52;
  along.push({ at: v, w: ROAD + 4, kind: 'front' });
  for (;;) {
    v -= 62 + rng() * 34;
    if (v < -D / 2 + 30) break;
    along.push({ at: v, w: Math.abs(v) < D * 0.12 ? ROAD + 4 : ROAD, kind: 'street' });
  }
  along.sort((a, b) => a.at - b.at);

  // ---- blocks: what lies between them
  const uCuts = [-W / 2 - 1e3, ...across.map((s) => s), W / 2 + 1e3];
  const vCuts = [-D / 2 - 1e3, ...along.map((s) => s), D / 2 + 1e3];
  const blocks = [];
  for (let j = 0; j < vCuts.length - 1; j++) {
    for (let i = 0; i < uCuts.length - 1; i++) {
      const a = uCuts[i];
      const b = uCuts[i + 1];
      const p = vCuts[j];
      const q = vCuts[j + 1];
      const u0 = Math.max(-W / 2, typeof a === 'number' ? a : a.at + a.w / 2);
      const u1 = Math.min(W / 2, typeof b === 'number' ? b : b.at - b.w / 2);
      const v0 = Math.max(-D / 2, typeof p === 'number' ? p : p.at + p.w / 2);
      const v1 = Math.min(D / 2, typeof q === 'number' ? q : q.at - q.w / 2);
      if (u1 - u0 < 30 || v1 - v0 < 26) continue;
      blocks.push({
        id: blocks.length, u0, u1, v0, v1, kind: 'res',
        // The waterfront, if the town has one.
        front: j === vCuts.length - 2 && !c.inland,
      });
    }
  }

  // ---- the surface
  const { nu, nv, surf, cellOk } = levelCells(world, c);

  // Districts, out from the square: the block nearest the middle of the
  // front half on the boulevard is the square.
  const hub = { u: 0, v: D * 0.08 };
  const landShare = (b) => {
    let n = 0;
    let ok = 0;
    for (let v2 = b.v0 + 4; v2 < b.v1 - 3; v2 += 8) {
      for (let u2 = b.u0 + 4; u2 < b.u1 - 3; u2 += 8) {
        n++;
        const i = Math.floor((u2 + W / 2) / SURF_CELL);
        const j = Math.floor((v2 + D / 2) / SURF_CELL);
        if (i >= 0 && j >= 0 && i < nu && j < nv && cellOk(i, j)) ok++;
      }
    }
    return n ? ok / n : 0;
  };
  for (const b of blocks) {
    b.land = landShare(b);
    b.cu = (b.u0 + b.u1) / 2;
    b.cv = (b.v0 + b.v1) / 2;
    b.r = Math.hypot((b.cu - hub.u) / W, (b.cv - hub.v) / D);
  }
  const live = blocks.filter((b) => b.land > 0.25);
  const byHub = live.filter((b) => !b.front).sort((a, b) => a.r - b.r);
  if (byHub[0]) byHub[0].kind = 'square';
  // A city has more of a middle than a market town does.
  let centre = 0;
  const centres = Math.max(7, Math.round(live.length * 0.08));
  for (const b of byHub.slice(1)) {
    if (b.r < 0.27 && centre < centres) { b.kind = 'centre'; centre++; } else if (b.r < 0.42) b.kind = 'mid';
  }
  for (const b of live) if (b.front) b.kind = 'port';
  // A park or two in the ring between the middle of the town and its edge.
  const ring = live.filter((b) => (b.kind === 'mid' || b.kind === 'res') && !b.front);
  for (let k = 0; k < Math.min(Math.max(2, Math.round(live.length / 30)), Math.floor(ring.length / 5) + 1) && ring.length; k++) {
    const pick = ring.splice(Math.floor(rng() * ring.length), 1)[0];
    pick.kind = 'park';
  }
  // The railway station: at the inland end of the boulevard, where the line
  // comes into a town of any size, facing down it to the sea.
  const onBoulevard = (b) => Math.min(Math.abs(b.u0 - BOULEVARD / 2), Math.abs(b.u1 + BOULEVARD / 2)) < 2;
  if (live.length >= 12) {
    const st = live.filter((b) => !b.front && onBoulevard(b) && b.kind !== 'square' && b.cv < -D * 0.15
      && b.u1 - b.u0 > 50 && b.v1 - b.v0 > 40)
      .sort((a, b) => a.cv - b.cv)[0];
    if (st) st.kind = 'station';
  }
  // The works: the gasworks, a factory or two and their yards, out on the
  // edge of a town big enough to have them, away from the sea and the square.
  const outer = live.filter((b) => (b.kind === 'res' || b.kind === 'mid') && !b.front && b.cv < 0)
    .sort((a, b) => b.r - a.r);
  const nWorks = live.length >= 40 ? 3 : live.length >= 22 ? 2 : live.length >= 12 ? 1 : 0;
  for (const b of outer.slice(0, nWorks)) b.kind = 'works';
  // A sports ground, with its stand, in a town that can spare a block that
  // big for one.
  const pitch = live.filter((b) => b.kind === 'res' && !b.front && b.u1 - b.u0 > 80 && b.v1 - b.v0 > 52)
    .sort((a, b) => b.r - a.r)[0];
  if (pitch && live.length >= 18) pitch.kind = 'pitch';

  // Paint the surface: road everywhere the town is, then each block on top.
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) if (cellOk(i, j)) surf[j * nu + i] = SURF.road;
  }
  const paint = (u0, u1, v0, v1, kind, only = null) => {
    const i0 = Math.max(0, Math.floor((u0 + W / 2) / SURF_CELL));
    const i1 = Math.min(nu - 1, Math.ceil((u1 + W / 2) / SURF_CELL) - 1);
    const j0 = Math.max(0, Math.floor((v0 + D / 2) / SURF_CELL));
    const j1 = Math.min(nv - 1, Math.ceil((v1 + D / 2) / SURF_CELL) - 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * nu + i;
        if (!surf[k]) continue;
        if (only !== null && surf[k] !== only) continue;
        surf[k] = kind;
      }
    }
  };
  // The boulevard's planted middle.
  paint(-MEDIAN / 2, MEDIAN / 2, -D / 2 + 20, D / 2 - 60, SURF.median);
  for (const b of blocks) {
    if (b.land <= 0.25) continue;
    paint(b.u0, b.u1, b.v0, b.v1, SURF.walk);
    const inner = { u0: b.u0 + WALK, u1: b.u1 - WALK, v0: b.v0 + WALK, v1: b.v1 - WALK };
    b.inner = inner;
    const fill = b.kind === 'park' || b.kind === 'pitch' ? SURF.lawn : b.kind === 'square' ? SURF.plaza
      : b.kind === 'port' || b.kind === 'works' ? SURF.yard : b.kind === 'res' ? SURF.lawn
        : b.kind === 'mid' ? SURF.lawn : b.kind === 'station' ? SURF.plaza : SURF.walk;
    paint(inner.u0, inner.u1, inner.v0, inner.v1, fill);
    if (b.kind === 'park') {
      // Paths: across it both ways, and round it.
      const pw = 2.2;
      paint(b.cu - pw, b.cu + pw, inner.v0, inner.v1, SURF.path, SURF.lawn);
      paint(inner.u0, inner.u1, b.cv - pw, b.cv + pw, SURF.path, SURF.lawn);
      paint(inner.u0 + 5, inner.u1 - 5, inner.v0 + 5, inner.v0 + 7.5, SURF.path, SURF.lawn);
      paint(inner.u0 + 5, inner.u1 - 5, inner.v1 - 7.5, inner.v1 - 5, SURF.path, SURF.lawn);
    }
  }

  const at = (u, v) => {
    const i = Math.floor((u + W / 2) / SURF_CELL);
    const j = Math.floor((v + D / 2) / SURF_CELL);
    if (i < 0 || j < 0 || i >= nu || j >= nv) return SURF.none;
    return surf[j * nu + i];
  };

  // ---- buildings
  const buildings = [];
  const props = [];
  // A footprint is good if every cell under it, and a metre round it, is in
  // the town and is not the street.
  const fits = (cu, cv, rot, w, d) => {
    const s = Math.sin(rot);
    const k = Math.cos(rot);
    for (let a = -w / 2 - 0.5; a <= w / 2 + 0.6; a += Math.min(2.4, w / 2)) {
      for (let b = -d / 2 - 0.5; b <= d / 2 + 0.6; b += Math.min(2.4, d / 2)) {
        const u = cu + k * a + s * b;
        const v2 = cv - s * a + k * b;
        const t = at(u, v2);
        if (t === SURF.none || t === SURF.road || t === SURF.median) return false;
      }
    }
    return true;
  };
  const place = (b, slot, spec) => {
    // Drawn whether it is built or not, so one building that does not fit
    // does not change every one laid out after it.
    const seed = Math.floor(rng() * 1e9);
    if (!fits(spec.u, spec.v, spec.r, spec.w, spec.d)) return null;
    // And the drawn ground itself at its corners, which is the last word on
    // whether it is standing on anything.
    {
      const s = Math.sin(spec.r);
      const k = Math.cos(spec.r);
      for (const [a, e] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const u = spec.u + k * a * (spec.w / 2 + 0.3) + s * e * (spec.d / 2 + 0.3);
        const v2 = spec.v - s * a * (spec.w / 2 + 0.3) + k * e * (spec.d / 2 + 0.3);
        const q = cityToWorld(c, u, v2);
        if (Math.abs(drawnGround(world, q.x, q.z) - L) > 0.06) return null;
      }
    }
    const p = cityToWorld(c, spec.u, spec.v);
    const mat = spec.mat;
    const roofH = spec.roof === 'flat' ? 0 : spec.roof === 'saw' ? 2.4
      : Math.min(spec.w, spec.d) * (spec.pitch || 0.32);
    const bld = {
      id: c.base + b.id * 64 + slot,
      city: c.index,
      level: L,
      kind: spec.kind,
      x: Math.round(p.x * 100) / 100,
      z: Math.round(p.z * 100) / 100,
      u: spec.u, v: spec.v,
      // The building's own yaw in the world: its local +z is its front.
      rot: c.rot + spec.r,
      w: spec.w, d: spec.d, h: spec.h, floors: spec.floors,
      roof: spec.roof, roofH,
      mat,
      wall: spec.wall, trim: spec.trim ?? 0, roofCol: spec.roofCol ?? 0,
      tiers: spec.tiers || null,
      extra: spec.extra || {},
      seed,
    };
    bld.top = L + bld.h + roofH + (bld.extra.spire || 0) + (bld.extra.clock || 0) + (bld.extra.bigtank ? 8 : 0);
    const vol = bld.w * bld.d * (bld.h + roofH * 0.4);
    // Not in proportion to the volume: a block of offices five times the size
    // of a terrace does not take five times the shells to bring down, because
    // a shell bursting in it wrecks the floors round it, not one fifth as much
    // of a bigger building. Linear, a concrete tower took a hundred and seventy
    // destroyer rounds and three battleship ones and still stood.
    bld.hp = Math.max(2, 3 * ((vol * BUILT[mat].hp) / 100) ** 0.62);
    buildings.push(bld);
    return bld;
  };

  const WALLS = { brick: [0, 1, 2, 3], stucco: [4, 5, 6], stone: [7, 8], deco: [9, 10, 11], wood: [12, 13, 14] };
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const count = (kind) => buildings.reduce((n, q) => n + (q.kind === kind ? 1 : 0), 0);
  // The public buildings a town has one of each of, put up in the ring round
  // its middle as blocks with room for them come up.
  const civic = ['school', 'hospital', 'fire', 'market'];
  // Whatever the blocks are left with that is not a building, to dress them with.
  const lawnProps = (b, every = 160) => {
    const I = b.inner;
    const n = Math.round(((I.u1 - I.u0) * (I.v1 - I.v0)) / every);
    for (let k = 0; k < n; k++) {
      const u = I.u0 + 4 + rng() * (I.u1 - I.u0 - 8);
      const v2 = I.v0 + 4 + rng() * (I.v1 - I.v0 - 8);
      props.push({ t: 'tree', u, v: v2, r: rng() * TAU, big: rng() < 0.4 ? 1 : 0, soft: 1 });
    }
  };

  for (const b of blocks) {
    if (b.land <= 0.25 || !b.inner) continue;
    const I = b.inner;
    const iw = I.u1 - I.u0;
    const id = I.v1 - I.v0;
    let slot = 0;
    // Rows of lots along the two faces that look up and down the town
    // (towards the sea and away from it), as the period's streets were built.
    const rows = (depth, minW, maxW, make, gap = 0, setback = 0) => {
      for (const face of [1, -1]) {
        let u = I.u0;
        while (u < I.u1 - minW) {
          const lw = Math.min(I.u1 - u, minW + rng() * (maxW - minW));
          if (I.u1 - u - lw < minW * 0.7) {
            // The last lot takes what is left rather than leaving a slit.
            const all = I.u1 - u;
            const s = make(all, depth, face);
            if (s) place(b, slot++, { ...s, u: u + all / 2, v: face > 0 ? I.v1 - setback - s.d / 2 : I.v0 + setback + s.d / 2, r: face > 0 ? 0 : Math.PI });
            break;
          }
          const s = make(lw - gap, depth, face);
          if (s) place(b, slot++, { ...s, u: u + lw / 2, v: face > 0 ? I.v1 - setback - s.d / 2 : I.v0 + setback + s.d / 2, r: face > 0 ? 0 : Math.PI });
          u += lw;
        }
      }
    };

    if (b.kind === 'square') {
      // The square: paved, with a fountain and a monument in it, and the
      // town hall on its inland side.
      const hall = {
        kind: 'hall', w: Math.min(iw * 0.7, 64), d: Math.min(id * 0.36, 26), h: 14, floors: 3,
        roof: 'hip', pitch: 0.18, mat: 'stone', wall: pick(WALLS.stone), roofCol: 3,
        extra: { portico: 1, clock: 16, flag: 1 },
      };
      place(b, slot++, { ...hall, u: b.cu, v: I.v0 + hall.d / 2 + 1, r: 0 });
      props.push({ t: 'fountain', u: b.cu, v: b.cv + id * 0.12, r: 0 });
      props.push({ t: 'statue', u: b.cu, v: I.v1 - 8, r: 0 });
      // Market day: a row of stalls down each side of the square.
      for (const sgn of [-1, 1]) {
        for (let k = 0; k < 3; k++) props.push({ t: 'stall', u: b.cu + sgn * (iw / 2 - 16), v: I.v0 + id * 0.42 + k * 7, r: sgn > 0 ? -Math.PI / 2 : Math.PI / 2, c: Math.floor(rng() * 4) });
      }
      for (const s of [-1, 1]) {
        props.push({ t: 'kiosk', u: b.cu + s * (iw / 2 - 8), v: I.v1 - 7, r: Math.PI });
        for (let k = 0; k < 3; k++) props.push({ t: 'bench', u: b.cu + s * (10 + k * 7), v: b.cv + id * 0.12 + s * 9, r: s > 0 ? Math.PI : 0 });
        for (let k = 0; k < 4; k++) props.push({ t: 'tree', u: b.cu + s * (iw / 2 - 4), v: I.v0 + id * 0.45 + k * (id * 0.13), r: 0, big: 1 });
      }
      continue;
    }
    if (b.kind === 'park') {
      props.push({ t: rng() < 0.5 ? 'bandstand' : 'fountain', u: b.cu, v: b.cv, r: 0 });
      const n = Math.round((iw * id) / 260);
      for (let k = 0; k < n; k++) {
        const u = I.u0 + 4 + rng() * (iw - 8);
        const v2 = I.v0 + 4 + rng() * (id - 8);
        if (at(u, v2) !== SURF.lawn) continue;
        props.push({ t: 'tree', u, v: v2, r: rng() * TAU, big: rng() < 0.4 ? 1 : 0 });
      }
      for (let k = 0; k < 8; k++) {
        const along = (k % 4) / 4 - 0.38;
        const vert = k < 4;
        props.push({
          t: 'bench',
          u: vert ? b.cu + 4 : I.u0 + iw * (0.5 + along),
          v: vert ? I.v0 + id * (0.5 + along) : b.cv + 4,
          r: vert ? -Math.PI / 2 : Math.PI,
        });
      }
      continue;
    }
    if (b.kind === 'station') {
      // The station: a long stone building with its clock and the booking
      // hall in the middle, a canopy over the forecourt, cabs and a bus
      // waiting on the rank in front of it.
      const w = Math.min(iw - 6, 74);
      const d = Math.min(id * 0.42, 22);
      // Set back from its forecourt, in the middle of the block rather than
      // on the edge of the town, where the ground runs off its level.
      const sv = I.v1 - 16 - d / 2;
      place(b, slot++, {
        kind: 'station', w, d, h: 11, floors: 2, roof: 'hip', pitch: 0.2, mat: 'stone',
        wall: pick(WALLS.stone), roofCol: 1, extra: { clock: 12, canopy: 1, flag: 1 },
        u: b.cu, v: sv, r: 0,
      });
      // The goods shed behind it, along the line.
      const gd = Math.min(id * 0.25, 14);
      if (sv - d / 2 - gd - 6 > I.v0 + 8) {
        place(b, slot++, {
          kind: 'warehouse', w: Math.min(iw - 8, 60), d: gd, h: 7, floors: 1, roof: 'gable',
          pitch: 0.2, mat: 'brick', wall: pick(WALLS.brick), roofCol: 1, u: b.cu, v: sv - d / 2 - gd / 2 - 6, r: 0,
        });
      }
      props.push({ t: 'bus', u: b.cu - w * 0.3, v: I.v1 - 5, r: Math.PI / 2 });
      for (let k = 0; k < 3; k++) props.push({ t: 'car', u: b.cu + 6 + k * 6.5, v: I.v1 - 5, r: Math.PI / 2, c: Math.floor(rng() * 6) });
      props.push({ t: 'clock', u: b.cu, v: I.v1 - 12, r: 0 });
      for (const sgn of [-1, 1]) props.push({ t: 'bench', u: b.cu + sgn * 14, v: I.v1 - 12, r: Math.PI });
      continue;
    }
    if (b.kind === 'works') {
      // A factory along the back of the block, its north lights to the sky
      // and its chimney stack beside it; the gasworks' holder or a water
      // tower; and a yard with lorries and stacked goods.
      const fw = Math.min(iw - 6, 84);
      const fd = Math.min(id * 0.5, 34);
      place(b, slot++, {
        kind: 'factory', w: fw, d: fd, h: 9 + Math.floor(rng() * 2) * 3, floors: 2, roof: 'saw', pitch: 0.2,
        mat: 'brick', wall: pick(WALLS.brick), roofCol: pick([1, 4]),
        extra: { stack: 26 + Math.floor(rng() * 14) },
        u: b.cu, v: I.v0 + fd / 2 + 1, r: 0,
      });
      const room = id - fd - 6;
      if (room > 22) {
        const R = Math.min(room - 4, iw * 0.35, 30);
        const gas = rng() < 0.6;
        place(b, slot++, gas ? {
          kind: 'gasholder', w: R, d: R, h: Math.min(R * 0.75, 18), floors: 1, roof: 'drum', mat: 'concrete',
          wall: 7, roofCol: 2, u: I.u1 - R / 2 - 3, v: I.v1 - R / 2 - 2, r: 0,
        } : {
          kind: 'watertower', w: 9, d: 9, h: 20, floors: 1, roof: 'flat', mat: 'concrete',
          wall: 9, extra: { bigtank: 1 }, u: I.u1 - 8, v: I.v1 - 8, r: 0,
        });
        for (let k = 0; k < 2; k++) {
          props.push({ t: 'lorry', u: I.u0 + 8 + k * 9, v: I.v1 - 7, r: 0, c: Math.floor(rng() * 6) });
        }
        // Stacked goods in the yard, clear of the holder or the tower.
        const yard = I.u1 - (gas ? R : 16) - 8 - (I.u0 + 30);
        for (let k = 0; k < 5 && yard > 3; k++) {
          props.push({ t: 'crates', u: I.u0 + 30 + rng() * yard, v: I.v1 - 4 - rng() * Math.max(2, room * 0.4), r: rng() * TAU });
        }
      }
      continue;
    }
    if (b.kind === 'pitch') {
      // A football ground: the pitch, a goal at each end, a covered stand
      // down one side and a scoreboard.
      const pw = Math.min(iw - 16, 100);
      const pd = Math.min(id - 20, 64);
      for (const sgn of [-1, 1]) props.push({ t: 'goal', u: b.cu + sgn * (pw / 2 - 1), v: b.cv + 3, r: sgn > 0 ? -Math.PI / 2 : Math.PI / 2 });
      for (let k = 0; k < 4; k++) props.push({ t: 'flag', u: b.cu + (k % 2 ? 1 : -1) * pw / 2, v: b.cv + 3 + (k < 2 ? 1 : -1) * pd / 2, r: 0 });
      place(b, slot++, {
        kind: 'stand', w: Math.min(pw * 0.6, 50), d: 9, h: 7, floors: 1, roof: 'flat', mat: 'wood',
        wall: pick(WALLS.wood), extra: { stand: 1 }, u: b.cu, v: I.v0 + 6, r: 0,
      });
      continue;
    }
    if (b.kind === 'mid' && civic.length && iw > 50 && id > 40 && rng() < 0.45) {
      const what = civic.shift();
      if (what === 'school') {
        place(b, slot++, {
          kind: 'school', w: Math.min(iw - 10, 62), d: Math.min(id * 0.45, 20), h: 9.4, floors: 2, roof: 'hip', pitch: 0.28,
          mat: 'brick', wall: pick(WALLS.brick), roofCol: 1, extra: { cupola: 1, chimneys: 1 },
          u: b.cu, v: I.v0 + Math.min(id * 0.45, 20) / 2 + 2, r: 0,
        });
        // Its playground, with a tree or two at the railings.
        for (let k = 0; k < 4; k++) props.push({ t: 'tree', u: I.u0 + 5 + k * (iw - 10) / 3, v: I.v1 - 3, r: 0, big: 0 });
      } else if (what === 'hospital') {
        const d = Math.min(id * 0.5, 24);
        place(b, slot++, {
          kind: 'hospital', w: Math.min(iw - 8, 72), d, h: 13.5, floors: 4, roof: 'flat', mat: 'concrete',
          wall: pick(WALLS.stucco), trim: 0, extra: { cross: 1, flag: 1 },
          u: b.cu, v: I.v0 + d / 2 + 2, r: 0,
        });
        props.push({ t: 'ambulance', u: b.cu + 10, v: I.v1 - 5, r: Math.PI / 2 });
        lawnProps({ inner: { u0: I.u0, u1: I.u1, v0: I.v0 + d + 6, v1: I.v1 - 8 } }, 220);
      } else if (what === 'fire') {
        place(b, slot++, {
          kind: 'fire', w: Math.min(iw * 0.45, 26), d: 16, h: 8.5, floors: 2, roof: 'flat', mat: 'brick',
          wall: pick(WALLS.brick), trim: 0, extra: { bays: 3, hose: 1 },
          u: I.u0 + Math.min(iw * 0.45, 26) / 2 + 1, v: I.v1 - 9, r: 0,
        });
        props.push({ t: 'engine', u: I.u0 + 8, v: I.v1 + 1.4, r: Math.PI / 2 });
        const deep = Math.min(22, id / 2 - 3);
        place(b, slot++, {
          kind: 'flats', w: Math.min(iw * 0.45, 30), d: deep, h: 3 * 3.2 + 0.8, floors: 3, roof: 'flat',
          mat: 'brick', wall: pick(WALLS.brick), roofCol: 0, extra: { shops: 1 },
          u: I.u1 - Math.min(iw * 0.45, 30) / 2 - 1, v: I.v1 - deep / 2, r: 0,
        });
      } else {
        // The covered market: a long iron-and-glass hall, and stalls out in
        // front of it.
        const d = Math.min(id * 0.5, 26);
        place(b, slot++, {
          kind: 'market', w: Math.min(iw - 8, 56), d, h: 8, floors: 1, roof: 'arch', pitch: 0.3, mat: 'brick',
          wall: pick(WALLS.brick), roofCol: 3, extra: {},
          u: b.cu, v: I.v0 + d / 2 + 2, r: Math.PI,
        });
        for (let k = 0; k < Math.floor((iw - 12) / 7); k++) {
          props.push({ t: 'stall', u: I.u0 + 6 + k * 7, v: I.v1 - 5, r: 0, c: Math.floor(rng() * 4) });
        }
      }
      continue;
    }
    if (b.kind === 'port') {
      // Warehouses along the waterfront, gable-end to the quay.
      rows(Math.min(26, id * 0.42), 28, 46, (w, d) => ({
        kind: 'warehouse', w: w - 4, d, h: 9 + Math.floor(rng() * 3) * 3, floors: 3,
        roof: rng() < 0.35 ? 'saw' : 'gable', pitch: 0.22, mat: 'brick',
        wall: pick(WALLS.brick), roofCol: pick([2, 4]),
      }), 0, 2);
      continue;
    }
    if (b.kind === 'centre') {
      // The middle of the town: lots built out to the pavement with no gap,
      // five to ten storeys of limestone and Art Deco, and one tower.
      const deep = Math.min(30, id / 2 - 2);
      rows(deep, 18, 34, (w, d) => {
        const r = rng();
        if (r < 0.09 && count('tower') < 1 + Math.floor(live.length / 50) && w > 24) {
          const h = 48 + Math.floor(rng() * 4) * 4;
          return {
            kind: 'tower', w, d, h, floors: Math.round(h / 3.6), roof: 'flat', mat: 'concrete',
            wall: pick(WALLS.deco), trim: 1,
            tiers: [{ k: 0.78, h: h + 7 }, { k: 0.55, h: h + 13 }, { k: 0.3, h: h + 20 }],
            extra: { mast: 9 },
          };
        }
        if (r < 0.16 && count('cinema') < 1 + Math.floor(live.length / 60)) {
          return {
            kind: 'cinema', w, d, h: 14, floors: 3, roof: 'flat', mat: 'concrete',
            wall: pick(WALLS.deco), trim: 2, extra: { marquee: 1, sign: 1 },
          };
        }
        const floors = 5 + Math.floor(rng() * 6);
        const deco = rng() < 0.55;
        return {
          kind: 'office', w, d, h: floors * 3.6 + 1, floors, roof: 'flat',
          mat: deco ? 'concrete' : 'stone',
          wall: deco ? pick(WALLS.deco) : pick(WALLS.stone), trim: deco ? 1 : 0,
          tiers: deco && floors >= 8 ? [{ k: 0.8, h: floors * 3.6 + 5 }] : null,
          extra: { shops: rng() < 0.7 ? 1 : 0, awning: rng() < 0.4 ? 1 : 0 },
        };
      });
      continue;
    }
    if (b.kind === 'mid') {
      // Brick and stucco flats over shops, and a church somewhere about.
      if (count('church') < 1 + Math.floor(live.length / 45) && iw > 44 && id > 40 && (!count('church') || rng() < 0.3)) {
        place(b, slot++, {
          kind: 'church', w: 16, d: Math.min(38, id - 10), h: 13, floors: 1, roof: 'gable', pitch: 0.62,
          mat: 'stone', wall: pick(WALLS.stone), roofCol: 2, extra: { spire: 26 },
          u: b.cu, v: b.cv, r: rng() < 0.5 ? 0 : Math.PI,
        });
        continue;
      }
      const deep = Math.min(22, id / 2 - 3);
      // The back gardens between the two rows: a strip of green with its
      // trees, and a wash-house or two at the bottom of the yards.
      if (id - deep * 2 > 8) {
        const n = Math.round(iw / 16);
        for (let k = 0; k < n; k++) {
          props.push({ t: 'tree', u: I.u0 + 5 + rng() * (iw - 10), v: b.cv + (rng() - 0.5) * (id - deep * 2 - 4), r: rng() * TAU, big: rng() < 0.35 ? 1 : 0 });
        }
      }
      rows(deep, 14, 24, (w, d) => {
        const floors = 3 + Math.floor(rng() * 3);
        const brick = rng() < 0.62;
        return {
          kind: 'flats', w, d, h: floors * 3.2 + 0.8, floors, roof: rng() < 0.7 ? 'flat' : 'hip', pitch: 0.2,
          mat: 'brick', wall: brick ? pick(WALLS.brick) : pick(WALLS.stucco), roofCol: pick([0, 2, 3]),
          extra: { shops: rng() < 0.75 ? 1 : 0, awning: rng() < 0.5 ? 1 : 0, tank: rng() < 0.3 ? 1 : 0 },
        };
      });
      continue;
    }
    // The outskirts: houses with gardens, set back from the street, and the
    // odd terrace.
    const terrace = rng() < 0.3;
    if (terrace) {
      rows(Math.min(11, id / 2 - 6), 18, 30, (w) => ({
        kind: 'terrace', w, d: 10, h: 6.6, floors: 2, roof: 'gable', pitch: 0.38,
        mat: 'brick', wall: pick(WALLS.brick), roofCol: pick([0, 1, 2]), extra: { chimneys: 1 },
      }), 0, 3);
    } else {
      rows(Math.min(13, id / 2 - 8), 14, 21, (w) => {
        const floors = rng() < 0.65 ? 2 : 1;
        const wood = rng() < 0.45;
        return {
          kind: 'house', w: Math.max(7, w - 4 - rng() * 3), d: 8 + rng() * 3, h: floors * 3 + 0.4, floors,
          roof: rng() < 0.6 ? 'gable' : 'hip', pitch: 0.36 + rng() * 0.12,
          mat: wood ? 'wood' : 'brick', wall: wood ? pick(WALLS.wood) : pick([...WALLS.brick, ...WALLS.stucco]),
          roofCol: pick([0, 1, 2, 3]), extra: { chimney: 1, porch: rng() < 0.6 ? 1 : 0, dormer: rng() < 0.3 ? 1 : 0 },
        };
      }, 0, 5);
      // Front hedges along the pavement, a gap left for each gate, and a
      // garden tree here and there behind the houses.
      for (const face of [1, -1]) {
        const v2 = face > 0 ? I.v1 - 0.8 : I.v0 + 0.8;
        for (let u = I.u0 + 2; u < I.u1 - 2; u += 3.2) {
          if (((u - I.u0) % 17) < 3.2) continue;
          props.push({ t: 'hedge', u, v: v2, r: 0 });
        }
      }
      if (id > 34) {
        for (let k = 0; k < Math.round(iw / 22); k++) {
          props.push({ t: 'tree', u: I.u0 + 6 + rng() * (iw - 12), v: b.cv + (rng() - 0.5) * 4, r: rng() * TAU, big: rng() < 0.3 ? 1 : 0, soft: 1 });
        }
      }
    }
  }

  // ---- street furniture, along the pavements
  const onWalk = (u, v2) => at(u, v2) === SURF.walk;
  // Every building's footprint, so nothing is put down inside one.
  const inside = (u, v2, pad = 0.6) => buildings.some((q) => {
    const dr = q.rot - c.rot;
    const s = Math.sin(dr);
    const k = Math.cos(dr);
    const du = u - q.u;
    const dv = v2 - q.v;
    const a = k * du - s * dv;
    const b = s * du + k * dv;
    return Math.abs(a) < q.w / 2 + pad && Math.abs(b) < q.d / 2 + pad;
  });
  for (const b of blocks) {
    if (b.land <= 0.25) continue;
    // Lamp-posts at the kerb every thirty metres, staggered across the
    // street; street trees between them on the residential streets; parked
    // cars at the kerb; and a telephone kiosk, a pillar box and a hydrant on
    // the corners.
    const edges = [
      { u0: b.u0, u1: b.u1, v: b.v1 - 0.7, r: 0, along: 'u' },
      { u0: b.u0, u1: b.u1, v: b.v0 + 0.7, r: Math.PI, along: 'u' },
      { v0: b.v0, v1: b.v1, u: b.u1 - 0.7, r: Math.PI / 2, along: 'v' },
      { v0: b.v0, v1: b.v1, u: b.u0 + 0.7, r: -Math.PI / 2, along: 'v' },
    ];
    const leafy = b.kind === 'res' || b.kind === 'park';
    edges.forEach((e, ei) => {
      const len = e.along === 'u' ? e.u1 - e.u0 : e.v1 - e.v0;
      const off = ei % 2 ? 15 : 3;
      for (let s = off + 4; s < len - 4; s += 30) {
        const u = e.along === 'u' ? e.u0 + s : e.u;
        const v2 = e.along === 'u' ? e.v : e.v0 + s;
        if (onWalk(u, v2) && !inside(u, v2)) props.push({ t: 'lamp', u, v: v2, r: e.r });
      }
      if (leafy) {
        for (let s = off + 19; s < len - 6; s += 30) {
          const u = e.along === 'u' ? e.u0 + s : e.u + (e.u > b.cu ? -0.6 : 0.6);
          const v2 = e.along === 'u' ? e.v + (e.v > b.cv ? -0.6 : 0.6) : e.v0 + s;
          if (onWalk(u, v2) && !inside(u, v2, 1.5)) props.push({ t: 'tree', u, v: v2, r: rng() * TAU, big: 0 });
        }
      }
      // Cars at the kerb, on the road side of it, nose to tail now and then.
      for (let s = 8; s < len - 8; s += 6.5) {
        if (rng() > (b.kind === 'centre' || b.kind === 'mid' ? 0.28 : 0.12)) continue;
        const out = 1.9;
        const u = e.along === 'u' ? e.u0 + s : e.u + (e.u > b.cu ? out : -out);
        const v2 = e.along === 'u' ? e.v + (e.v > b.cv ? out : -out) : e.v0 + s;
        if (at(u, v2) !== SURF.road) continue;
        // Now and then a delivery lorry or a van rather than a motor car.
        const big = rng() < (b.kind === 'works' || b.kind === 'port' ? 0.5 : 0.08);
        if (big) s += 4;
        props.push({ t: big ? 'lorry' : 'car', u, v: v2, r: e.along === 'u' ? Math.PI / 2 * (rng() < 0.5 ? 1 : -1) : (rng() < 0.5 ? 0 : Math.PI), c: Math.floor(rng() * 6) });
      }
    });
    // A bus stop on the main streets, and a hoarding on a gable end now and then.
    if ((b.kind === 'centre' || b.kind === 'mid') && rng() < 0.35) {
      const e = edges[Math.floor(rng() * 2)];
      const u = (e.u0 + e.u1) / 2 + (rng() - 0.5) * 20;
      const v2 = e.v + (e.v > b.cv ? 0.6 : -0.6);
      if (onWalk(u, v2) && !inside(u, v2, 1.5)) props.push({ t: 'busstop', u, v: v2, r: e.r });
    }
    if ((b.kind === 'mid' || b.kind === 'works' || b.kind === 'res') && rng() < 0.25) {
      const e = edges[2 + Math.floor(rng() * 2)];
      const v2 = (e.v0 + e.v1) / 2;
      const u = e.u + (e.u > b.cu ? -1.2 : 1.2);
      if (onWalk(u, v2) && !inside(u, v2, 2.2)) props.push({ t: 'hoarding', u, v: v2, r: e.r, c: Math.floor(rng() * 4) });
    }
    if (b.kind !== 'park' && b.kind !== 'port' && b.kind !== 'pitch') {
      const corners = [[b.u0 + 1.6, b.v1 - 1.6], [b.u1 - 1.6, b.v0 + 1.6]];
      const [cu, cv] = corners[Math.floor(rng() * 2)];
      if (onWalk(cu, cv) && !inside(cu, cv)) props.push({ t: rng() < 0.5 ? 'phone' : 'pillar', u: cu, v: cv, r: 0 });
      const [hu, hv] = cu === corners[0][0] ? corners[1] : corners[0];
      if (onWalk(hu, hv) && !inside(hu, hv)) props.push({ t: 'hydrant', u: hu, v: hv, r: 0 });
    }
  }
  // The boulevard's planted middle, with a double row of planes down it.
  for (let v2 = -D / 2 + 26; v2 < D / 2 - 64; v2 += 12) {
    if (at(0, v2) === SURF.median) props.push({ t: 'tree', u: 0, v: v2, r: rng() * TAU, big: 1 });
  }
  // Bollards along the waterfront.
  for (const b of blocks) {
    if (!b.front || b.land <= 0.25 || !b.inner) continue;
    for (let u = b.inner.u0 + 3; u < b.inner.u1 - 3; u += 14) {
      const v2 = b.inner.v1 - 1.2;
      if (at(u, v2) === SURF.yard && !inside(u, v2)) props.push({ t: 'bollard', u, v: v2, r: 0 });
    }
  }
  return finishPlan(c, { L, W, D, nu, nv, surf, blocks, buildings, props, across, along, at });
}

/**
 * Paint and building tools for an airfield's or a harbour's plan, which are
 * laid out by hand rather than in blocks: a surface painted over the level
 * cells, and buildings put down on it where they fit.
 */
function siteKit(world, c, rng) {
  const W = c.W;
  const D = c.D;
  const L = c.level;
  const { nu, nv, surf, cellOk } = levelCells(world, c);
  const at = (u, v) => {
    const i = Math.floor((u + W / 2) / SURF_CELL);
    const j = Math.floor((v + D / 2) / SURF_CELL);
    if (i < 0 || j < 0 || i >= nu || j >= nv) return SURF.none;
    return surf[j * nu + i];
  };
  const paint = (u0, u1, v0, v1, kind) => {
    const i0 = Math.max(0, Math.floor((u0 + W / 2) / SURF_CELL));
    const i1 = Math.min(nu - 1, Math.ceil((u1 + W / 2) / SURF_CELL) - 1);
    const j0 = Math.max(0, Math.floor((v0 + D / 2) / SURF_CELL));
    const j1 = Math.min(nv - 1, Math.ceil((v1 + D / 2) / SURF_CELL) - 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) if (surf[j * nu + i]) surf[j * nu + i] = kind;
    }
  };
  const fill = (kind) => {
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) if (cellOk(i, j)) surf[j * nu + i] = kind;
  };
  const buildings = [];
  const place = (slot, spec) => {
    const s = Math.sin(spec.r);
    const k = Math.cos(spec.r);
    // On the site's paving or grass, every metre of it, and on its level.
    for (let a = -spec.w / 2; a <= spec.w / 2 + 0.01; a += Math.min(2.4, spec.w / 2)) {
      for (let b = -spec.d / 2; b <= spec.d / 2 + 0.01; b += Math.min(2.4, spec.d / 2)) {
        const t = at(spec.u + k * a + s * b, spec.v - s * a + k * b);
        if (t === SURF.none || t === SURF.runway || t === SURF.mark) return null;
      }
    }
    for (const [a, e] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const q = cityToWorld(c, spec.u + k * a * (spec.w / 2 + 0.3) + s * e * (spec.d / 2 + 0.3),
        spec.v - s * a * (spec.w / 2 + 0.3) + k * e * (spec.d / 2 + 0.3));
      if (Math.abs(drawnGround(world, q.x, q.z) - L) > 0.06) return null;
    }
    const p = cityToWorld(c, spec.u, spec.v);
    const roofH = spec.roof === 'flat' ? 0 : spec.roof === 'saw' ? 2.4
      : Math.min(spec.w, spec.d) * (spec.pitch || 0.32);
    const bld = {
      id: c.base + slot, city: c.index, level: L, kind: spec.kind,
      x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100,
      u: spec.u, v: spec.v, rot: c.rot + spec.r,
      w: spec.w, d: spec.d, h: spec.h, floors: spec.floors,
      roof: spec.roof, roofH, mat: spec.mat,
      wall: spec.wall, trim: spec.trim ?? 0, roofCol: spec.roofCol ?? 0,
      tiers: spec.tiers || null, extra: spec.extra || {},
      seed: Math.floor(rng() * 1e9),
    };
    bld.top = L + bld.h + roofH + (bld.extra.mast || 0);
    const vol = bld.w * bld.d * (bld.h + roofH * 0.4);
    bld.hp = Math.max(2, 3 * ((vol * BUILT[bld.mat].hp) / 100) ** 0.62);
    buildings.push(bld);
    return bld;
  };
  return { W, D, L, nu, nv, surf, at, paint, fill, place, buildings, props: [] };
}

/**
 * An airfield, drawn up: grass, the runway with its paint, a taxiway
 * along it and three links on to it, the apron, and the hangars along the
 * apron with their doors on the taxiway -- each of them big enough for a
 * flight of heavies -- the control tower, and the stores.
 */
function drawAirbase(world, c) {
  const rng = makeRng(c.seed ^ 0x41f1e1d);
  const K = siteKit(world, c, rng);
  const { W, D, paint } = K;
  const RL = W - 100;
  const rv0 = RUNWAY_V - RUNWAY_W / 2;
  const rv1 = RUNWAY_V + RUNWAY_W / 2;
  K.fill(SURF.lawn);
  paint(-RL / 2, RL / 2, rv0, rv1, SURF.runway);
  // The paint: the edge lines, the centre line in dashes, and the piano
  // keys at each threshold.
  paint(-RL / 2, RL / 2, rv0 + 1, rv0 + 3.5, SURF.mark);
  paint(-RL / 2, RL / 2, rv1 - 3.5, rv1 - 1, SURF.mark);
  for (let u = -RL / 2 + 70; u < RL / 2 - 70; u += 60) paint(u, u + 30, RUNWAY_V - 1.25, RUNWAY_V + 1.25, SURF.mark);
  for (const end of [-1, 1]) {
    const a = end * (RL / 2 - 10);
    const b = end * (RL / 2 - 40);
    for (let k = 0; k < 8; k++) {
      const v = rv0 + 6 + k * 4.6 + (k >= 4 ? 2.4 : 0);
      paint(Math.min(a, b), Math.max(a, b), v, v + 2.5, SURF.mark);
    }
  }
  // The taxiway and its links.
  const TV = 2;
  const TU = RL / 2 - 40;
  paint(-TU - 9, TU + 9, TV - 9, TV + 9, SURF.road);
  for (const u of [-TU, 0, TU]) paint(u - 9, u + 9, TV, rv0, SURF.road);
  // The hangars, along the apron.
  const n = RL >= 1100 ? 5 : RL >= 900 ? 4 : 3;
  const HW = 50;
  const HD = 58;
  const gap = 18;
  const row = n * HW + (n - 1) * gap;
  const hv = -D / 2 + 12 + HD / 2;
  paint(-row / 2 - 14, row / 2 + 14, hv + HD / 2, TV - 9, SURF.walk);
  let slot = 0;
  for (let k = 0; k < n; k++) {
    const u = -row / 2 + HW / 2 + k * (HW + gap);
    paint(u - HW / 2 - 4, u + HW / 2 + 4, hv - HD / 2 - 4, hv + HD / 2, SURF.walk);
    K.place(slot++, {
      kind: 'hangar', u, v: hv, r: 0, w: HW, d: HD, h: 12, floors: 1,
      roof: 'arch', pitch: 0.24, mat: 'concrete', wall: 7, roofCol: 4,
      extra: { door: 1 },
    });
  }
  // The control tower at one end of the apron, and the stores at the other.
  const cu = row / 2 + 46;
  paint(cu - 14, cu + 14, hv - 10, TV - 9, SURF.walk);
  K.place(slot++, {
    kind: 'control', u: cu, v: hv + 6, r: 0, w: 14, d: 14, h: 13, floors: 3,
    roof: 'flat', mat: 'concrete', wall: 9, trim: 1, extra: { glass: 1, mast: 7 },
  });
  for (const k of [0, 1]) {
    const su = -row / 2 - 38 - k * 34;
    paint(su - 14, su + 14, hv - 18, TV - 9, SURF.walk);
    K.place(slot++, {
      kind: 'warehouse', u: su, v: hv, r: 0, w: 22, d: 30, h: 7, floors: 1,
      roof: 'gable', pitch: 0.2, mat: 'brick', wall: 1, roofCol: 2,
    });
  }
  // Lamps along the front of the apron.
  for (let u = -row / 2; u <= row / 2; u += 36) K.props.push({ t: 'lamp', u, v: TV - 10.5, r: 0 });
  const blocks = [
    { id: 0, kind: 'field', u0: -W / 2, u1: W / 2, v0: -D / 2, v1: D / 2, land: 1, cu: 0, cv: 0 },
    { id: 1, kind: 'runway', u0: -RL / 2, u1: RL / 2, v0: rv0, v1: rv1, land: 1, cu: 0, cv: RUNWAY_V },
    { id: 2, kind: 'apron', u0: -row / 2 - 14, u1: row / 2 + 14, v0: hv - HD / 2, v1: TV + 9, land: 1, cu: 0, cv: hv },
  ];
  const plan = finishPlan(c, {
    L: K.L, W, D, nu: K.nu, nv: K.nv, surf: K.surf, blocks, buildings: K.buildings, props: K.props,
    across: [], along: [], at: K.at,
  });
  plan.hangars = plan.buildings.filter((b) => b.kind === 'hangar');
  return plan;
}

/**
 * A harbour, drawn up: its apron behind the quay, the road along the back
 * of it and the road along the quay, the transit sheds between them, the
 * harbourmaster's office, and the travelling cranes at the quay's edge.
 */
function drawHarbor(world, c) {
  const rng = makeRng(c.seed ^ 0x4a4b0e);
  const K = siteKit(world, c, rng);
  const { W, D, paint } = K;
  K.fill(SURF.yard);
  const front = D / 2 - WALL_WIDTH;
  paint(-W / 2, W / 2, front - 16, front - 4, SURF.road);
  paint(-W / 2, W / 2, -D / 2 + 6, -D / 2 + 18, SURF.road);
  let slot = 0;
  const SW = 74;
  const SD = 34;
  const n = Math.max(1, Math.floor((W - 90) / (SW + 16)));
  const row = n * SW + (n - 1) * 16;
  const sv = (front - 16 + (-D / 2 + 18)) / 2;
  for (let k = 0; k < n; k++) {
    const u = -row / 2 + SW / 2 + k * (SW + 16);
    K.place(slot++, {
      kind: 'warehouse', u, v: sv, r: 0, w: SW, d: SD, h: 9 + Math.floor(rng() * 2) * 3, floors: 2,
      roof: rng() < 0.4 ? 'saw' : 'gable', pitch: 0.2, mat: 'brick', wall: Math.floor(rng() * 4), roofCol: 4,
    });
  }
  K.place(slot++, {
    kind: 'office', u: W / 2 - 22, v: sv, r: 0, w: 18, d: 16, h: 11, floors: 3,
    roof: 'hip', pitch: 0.2, mat: 'stone', wall: 7, roofCol: 3, extra: { flag: 1 },
  });
  // The cranes, on their rails along the quay.
  for (let u = -W / 2 + 60; u < W / 2 - 40; u += 95) K.props.push({ t: 'crane', u, v: front - 7, r: 0 });
  for (let u = -W / 2 + 20; u < W / 2 - 10; u += 40) K.props.push({ t: 'lamp', u, v: front - 17, r: 0 });
  const blocks = [
    { id: 0, kind: 'port', u0: -W / 2, u1: W / 2, v0: -D / 2, v1: front, land: 1, cu: 0, cv: 0 },
  ];
  return finishPlan(c, {
    L: K.L, W, D, nu: K.nu, nv: K.nv, surf: K.surf, blocks, buildings: K.buildings, props: K.props,
    across: [], along: [], at: K.at,
  });
}

/**
 * A site's plan, finished: its props put into the world and numbered, and
 * its buildings filed for the lookups and for the fire to spread by.
 */
function finishPlan(c, { L, W, D, nu, nv, surf, blocks, buildings, props, across, along, at }) {
  // Into the world, every one of them numbered -- but only those on the
  // town's own paving: where another town has cut into this one, the
  // fountain the square was to have had is not there to have.
  const kept = props.filter((p) => at(p.u, p.v) !== SURF.none);
  props.length = 0;
  props.push(...kept);
  props.forEach((p, k) => {
    const w = cityToWorld(c, p.u, p.v);
    p.x = w.x;
    p.z = w.z;
    p.yaw = c.rot + p.r;
    p.id = k;
  });

  // ---- what is near what, for the fire and for the lookups
  const grid = new Map();
  const G = 30;
  const file = (u, v2, id) => {
    const k = Math.floor(u / G) * 4099 + Math.floor(v2 / G);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(id);
  };
  const byId = new Map();
  for (const q of buildings) {
    byId.set(q.id, q);
    const R = Math.hypot(q.w, q.d) / 2 + 1;
    for (let a = Math.floor((q.u - R) / G); a <= Math.floor((q.u + R) / G); a++) {
      for (let b = Math.floor((q.v - R) / G); b <= Math.floor((q.v + R) / G); b++) file(a * G + 1, b * G + 1, q.id);
    }
  }
  for (const k of grid.keys()) grid.set(k, [...new Set(grid.get(k))]);
  // Only the ones filed near it are looked at: a city dragged out to its
  // full size has thousands of buildings, and every one against every other
  // is millions of tests for the same few neighbours.
  let biggest = 0;
  for (const q of buildings) biggest = Math.max(biggest, Math.hypot(q.w, q.d));
  for (const q of buildings) {
    q.near = [];
    const R = (Math.hypot(q.w, q.d) + biggest) / 2 * 0.72 + 6;
    const seen = new Set();
    for (let a = Math.floor((q.u - R) / G); a <= Math.floor((q.u + R) / G); a++) {
      for (let b = Math.floor((q.v - R) / G); b <= Math.floor((q.v + R) / G); b++) {
        for (const id of grid.get(a * 4099 + b) || []) {
          if (id === q.id || seen.has(id)) continue;
          seen.add(id);
          const o = byId.get(id);
          const gap = Math.hypot(o.u - q.u, o.v - q.v) - (Math.hypot(o.w, o.d) + Math.hypot(q.w, q.d)) / 2 * 0.72;
          if (gap < 6) q.near.push(o.id);
        }
      }
    }
    q.near.sort((x, y) => x - y);
  }

  return {
    city: c, level: L, W, D, nu, nv, surf, blocks, buildings, props, byId, grid, G,
    across, along, surfAt: at,
  };
}

/** What a point in the world is on, as far as the towns' surface goes. */
export function surfaceAt(world, x, z) {
  for (const plan of cityPlans(world)) {
    const { u, v } = worldToCity(plan.city, x, z);
    const t = plan.surfAt(u, v);
    if (t !== SURF.none) return t;
  }
  return SURF.none;
}

/** The buildings filed near a point in the world. */
function buildingsNear(plan, x, z) {
  const { u, v } = worldToCity(plan.city, x, z);
  return plan.grid.get(Math.floor(u / plan.G) * 4099 + Math.floor(v / plan.G)) || [];
}

/** Is (x, z) inside this building's footprint, padded by `pad`? */
export function inFootprint(b, x, z, pad = 0) {
  const dx = x - b.x;
  const dz = z - b.z;
  const s = Math.sin(b.rot);
  const k = Math.cos(b.rot);
  const a = k * dx - s * dz;
  const c = s * dx + k * dz;
  return Math.abs(a) <= b.w / 2 + pad && Math.abs(c) <= b.d / 2 + pad;
}

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------
//
// A building is worth so much -- its volume times what it is made of -- and a
// shell takes so much out of it: its bursting charge, which goes as the cube
// of the bore, falling away with distance. Armour-piercing rounds were built
// to go through a ship's belt before they burst and carry a fifth of the
// filling a common shell does: into a house they go in one wall and out the
// other. Fire is the rest of it, as it always was in a town under the guns:
// a building knocked about can catch, a burning one burns down, and a
// timber house next door to it is the next thing that goes.
//
// What has been done to the town is kept on the world, as `ruin`, so a client
// that joins late is handed the town as it is now; and every change of stage
// goes out as an event, so the ones already watching see it happen.

/** The stages a building goes through, by the share of it that is gone. */
export const STAGE = { whole: 0, hit: 1, gutted: 2, falling: 3, rubble: 4, cleared: 5 };

export function stageOf(d, cleared = false) {
  if (cleared) return STAGE.cleared;
  if (d >= 1) return STAGE.rubble;
  if (d >= 0.78) return STAGE.falling;
  if (d >= 0.5) return STAGE.gutted;
  if (d >= 0.22) return STAGE.hit;
  return STAGE.whole;
}

/** What has been done to one building: { d, f, c } or nothing. */
export function ruinOf(world, id) { return world.ruin?.b?.[id] || null; }

/**
 * How high a building stands now, over the town's level: all of it, its roof
 * burned off, its upper floors down, or a heap of what it was.
 */
export function standingHeight(b, r) {
  const st = stageOf(r?.d || 0, !!r?.c);
  if (st === STAGE.cleared) return 0;
  if (st === STAGE.rubble) return Math.max(1.2, Math.min(5, b.h * 0.18));
  if (st === STAGE.falling) return b.h * 0.55;
  if (st === STAGE.gutted) return b.h;
  const tower = b.tiers ? Math.max(...b.tiers.map((t) => t.h)) : b.h;
  return Math.max(tower, b.h + b.roofH);
}

/** The building standing at a point, if there is one, and how high it stands. */
export function buildingAt(world, x, z, pad = 0) {
  for (const plan of cityPlans(world)) {
    for (const id of buildingsNear(plan, x, z)) {
      const b = plan.byId.get(id);
      if (inFootprint(b, x, z, pad)) return b;
    }
  }
  return null;
}

/**
 * The first building a shell's path from a to b runs into, with the point it
 * struck: `{ b, x, y, z }` or null.
 */
export function worksImpact(world, ax, ay, az, bx, by, bz) {
  let first = null;
  for (const plan of cityPlans(world)) {
    const hit = impactIn(world, plan, ax, ay, az, bx, by, bz);
    if (hit && (!first || hit.f < first.f)) first = hit;
  }
  return first && { b: first.b, x: first.x, y: first.y, z: first.z, f: first.f };
}

function impactIn(world, plan, ax, ay, az, bx, by, bz) {
  const L = plan.level;
  // Nowhere near the town: the usual case, and the cheap one.
  const pa = worldToCity(plan.city, ax, az);
  const pb = worldToCity(plan.city, bx, bz);
  const mu = plan.W / 2 + 10;
  const mv = plan.D / 2 + 10;
  if ((pa.u > mu && pb.u > mu) || (pa.u < -mu && pb.u < -mu)
    || (pa.v > mv && pb.v > mv) || (pa.v < -mv && pb.v < -mv)) return null;
  // Only the part of the path over the town is walked: a gun sight's line is
  // twenty kilometres long and crosses a town in a few hundred metres of it.
  let f0 = 0;
  let f1 = 1;
  for (const [p0, p1, m] of [[pa.u, pb.u, mu], [pa.v, pb.v, mv]]) {
    const d = p1 - p0;
    if (Math.abs(d) < 1e-9) continue;
    const t0 = (-m - p0) / d;
    const t1 = (m - p0) / d;
    f0 = Math.max(f0, Math.min(t0, t1));
    f1 = Math.min(f1, Math.max(t0, t1));
  }
  if (f0 > f1) return null;
  // Steps of four metres along the ground, and of two up and down, so a
  // machine diving straight down onto a roof finds it too.
  const span = f1 - f0;
  const steps = Math.max(2, Math.ceil(Math.max(Math.hypot(bx - ax, bz - az) / 4, Math.abs(by - ay) / 2) * span));
  for (let i = 0; i <= steps; i++) {
    const f = f0 + (span * i) / steps;
    if (f <= 0 && (ax !== bx || ay !== by || az !== bz)) continue;
    const x = ax + (bx - ax) * f;
    const y = ay + (by - ay) * f;
    const z = az + (bz - az) * f;
    if (y > L + 75) continue;
    for (const id of buildingsNear(plan, x, z)) {
      const b = plan.byId.get(id);
      const top = L + standingHeight(b, ruinOf(world, id));
      if (y > top || !inFootprint(b, x, z)) continue;
      return { b, x, y, z, f };
    }
  }
  return null;
}

/**
 * What a burst at (x, y, z) does to the works round it.
 *
 * `charge` is the bursting charge as the cube of the bore in decimetres --
 * about 2 for a five-inch round, 67 for a sixteen-inch one -- and `filler`
 * how much of a burst the round is: 1 for common or high explosive, a fifth
 * for armour-piercing, a good deal more for a bomb. `direct` is the building
 * it went off inside, if it did. Returns true when the point is paved or on a
 * wall, so the caller knows not to dig a crater there.
 */
export function blastWorks(world, x, y, z, charge, filler, events, rng, direct = null) {
  const w = world.works;
  if (!w) return false;
  // An armour-piercing round bursts inside what it hits after all, a little
  // late: against a house that is worth rather more than its filling.
  const hit = worksPower(charge, filler < 0.6 ? Math.max(0.35, filler) : filler);
  // How far a burst is felt by a building, in metres: a few for a destroyer's
  // round, getting on for forty for a battleship's.
  const reach = 4 + 6.5 * Math.cbrt(charge * filler);
  for (const plan of cityPlans(world)) {
    // Nowhere near this town: on to the next.
    const { u, v } = worldToCity(plan.city, x, z);
    if (Math.abs(u) > plan.W / 2 + reach + 40 || Math.abs(v) > plan.D / 2 + reach + 40) continue;
    const seen = new Set();
    for (let gx = -1; gx <= 1; gx++) {
      for (let gz = -1; gz <= 1; gz++) {
        for (const id of buildingsNear(plan, x + gx * reach * 0.7, z + gz * reach * 0.7)) seen.add(id);
      }
    }
    for (const id of seen) {
      const b = plan.byId.get(id);
      const r0 = ruinOf(world, id);
      if (r0?.c || (r0?.d || 0) >= 1) continue;
      let dmg;
      if (direct && direct.id === id) dmg = hit * 3.8;
      else {
        // Distance to the building's nearest wall, not its middle.
        const dx = x - b.x;
        const dz = z - b.z;
        const s = Math.sin(b.rot);
        const k = Math.cos(b.rot);
        const a = Math.max(0, Math.abs(k * dx - s * dz) - b.w / 2);
        const c = Math.max(0, Math.abs(s * dx + k * dz) - b.d / 2);
        const d = Math.hypot(a, c);
        if (d > reach) continue;
        dmg = (hit * 2.4) / (1 + (d / (reach * 0.3)) ** 2);
      }
      hurtBuilding(world, b, dmg, events, rng, { x, z, he: filler >= 0.6 });
    }
  }
  let hard = false;
  if (w.walls.length) {
    const on = wallAt(world, x, z, 6);
    if (on) {
      hard = on.d <= WALL_WIDTH / 2;
      // Concrete takes an armour-piercing round better than a house does,
      // but the round gets into it and bursts there rather than passing
      // through: the filling is worth more against a wall than a house. And a
      // bomb's filling is worth all of what it is -- it used to be cut down to
      // a shell's, so a thousand-pounder chipped the walkway.
      const f = filler < 0.6 ? 0.6 : filler;
      const run = w.walls[on.run];
      // On the walkway the burst is tamped by the concrete under it; against
      // the face, or in the water at its foot, a good deal of it goes into
      // the sea -- the more of it the further down the face it went off.
      const low = hard ? 1 : clamp(((y || 0) + 4) / Math.max(4, run.top + 4), 0, 1);
      const dmg = worksPower(charge, f) * (hard ? 1.6 : 0.45 + 0.35 * low);
      // How big a hole it leaves, in metres across the crown.
      const scar = clamp(0.8 + Math.sqrt(dmg) * 0.75, 0.8, 9);
      hurtWall(world, on.run, on.sec, dmg / wallHp(run), events, { x, y, z }, scar);
      // A heavy round on the joint between two sections shakes both.
      const n = wallSections(run);
      const frac = ((on.seg % WALL_SECTION) + on.t) / WALL_SECTION;
      if (frac < 0.25 && on.sec > 0) hurtWall(world, on.run, on.sec - 1, (dmg * 0.4) / wallHp(run), events, { x, y, z });
      if (frac > 0.75 && on.sec < n - 1) hurtWall(world, on.run, on.sec + 1, (dmg * 0.4) / wallHp(run), events, { x, y, z });
    }
  }
  return hard || worksHard(world, x, z);
}

/** Take `dmg` out of a building, and see what that does to it. */
export function hurtBuilding(world, b, dmg, events, rng, at = null) {
  const ruin = world.ruin || (world.ruin = { b: {}, w: {} });
  const r = ruin.b[b.id] || (ruin.b[b.id] = { d: 0, f: 0 });
  if (r.c) return;
  const was = stageOf(r.d);
  const wasF = r.f;
  r.d = Math.min(1, Math.round((r.d + dmg / b.hp) * 1000) / 1000);
  // A burst inside a building it has knocked about is how most of the fires
  // started: what is in a house burns, whatever the house is built of.
  if (!r.f && r.d < 0.95 && r.d > 0.15 && at?.he && rng() < BUILT[b.mat].burn * Math.min(1, dmg / b.hp + 0.25)) r.f = 1;
  if (r.d >= 1) r.f = 0;
  // An atomic shock close in does not knock a building down, it takes it
  // away: walls, floors and the heap they would have made, blown off the
  // footprint and strewn downwind. `at.nk` is how hard the blast is pushing,
  // nought to one; at full strength nothing is left standing on the ground.
  if (at?.nk >= 0.99 && r.d >= 1) r.c = 1;
  const now = stageOf(r.d, !!r.c);
  if (now !== was || r.f !== wasF) ruinEvent(events, b, r, at);
}

function ruinEvent(events, b, r, at) {
  events.push({
    e: 'ruin', k: 'b', id: b.id, d: r.d, f: r.f, c: r.c ? 1 : 0,
    s: stageOf(r.d, !!r.c),
    x: Math.round(b.x), z: Math.round(b.z),
    ...(at ? { bx: Math.round(at.x), bz: Math.round(at.z) } : {}),
    ...(at?.nk ? { nk: Math.round(at.nk * 100) / 100 } : {}),
  });
}

/**
 * Take a share of a wall section away. Returns true if that breached it.
 *
 * `scar` is how big a hole the hit left, in metres: a shell or a bomb leaves
 * one, where it went off, and the section keeps the last few of them so they
 * can be drawn on it. Every hit that leaves a scar goes out; the chipping of
 * machine-gun fire goes out only every fifth of the way, as it adds up.
 *
 * A section that goes takes the ends of the two beside it with it: they were
 * keyed into it, and the end of a sound section standing over a breach has
 * nothing holding it on that side.
 */
export function hurtWall(world, run, sec, share, events, at = null, scar = 0) {
  const ruin = world.ruin || (world.ruin = { b: {}, w: {} });
  const id = wallId(run, sec);
  const r = ruin.w[id] || (ruin.w[id] = { d: 0 });
  if (r.d >= 1) return false;
  const before = r.d;
  r.d = Math.min(1, Math.round((r.d + share) * 1000) / 1000);
  if (scar > 0 && at) {
    const h = r.h || (r.h = []);
    h.push([Math.round(at.x * 10) / 10, Math.round(at.z * 10) / 10, Math.round(scar * 10) / 10]);
    if (h.length > WALL_SCARS) h.shift();
  } else if (Math.floor(before * 5) === Math.floor(r.d * 5) && r.d < 1) return false;
  const breached = r.d >= 1;
  if (breached) world.groundRev = (world.groundRev || 0) + 1;
  events.push({
    e: 'ruin', k: 'w', id, run, sec, d: r.d,
    ...(r.h ? { h: r.h.map((q) => q.slice()) } : {}),
    ...(at ? { x: Math.round(at.x), y: Math.round(at.y || 0), z: Math.round(at.z) } : {}),
  });
  if (breached) {
    const W = world.works?.walls?.[run];
    const n = W ? wallSections(W) : 0;
    for (const s of [sec - 1, sec + 1]) {
      if (s < 0 || s >= n) continue;
      hurtWall(world, run, s, 0.16, events, null);
    }
  }
  return breached;
}

/**
 * The sea at a wall that has been knocked about.
 *
 * Sound concrete stands the surf for a century. A section with its face
 * cracked open and its crown broken up does not: every wave that comes in
 * works at what is loose, and the more of it is loose the faster it goes.
 * Slowly -- minutes, not seconds -- but a section left three-quarters gone
 * falls in on its own before the battle is over.
 */
function erodeWalls(world, dt, events) {
  const w = world.ruin?.w;
  if (!w) return;
  for (const key in w) {
    const r = w[key];
    if (!(r.d >= 0.5) || r.d >= 1) continue;
    // Held until it is worth a step of the thousandths the damage is kept
    // in, or a tick's worth of it would be rounded away every tick.
    r.e = (r.e || 0) + (r.d - 0.45) * 0.0016 * dt;
    if (r.e < 0.002) continue;
    const id = Number(key);
    const e = r.e;
    r.e = 0;
    hurtWall(world, Math.floor(id / 1000), id % 1000, e, events);
  }
}

/**
 * The town burning, for one tick.
 *
 * A building on fire loses itself at the rate its material burns, until what
 * is left is a shell and the fire goes out; and every few seconds it may set
 * light to whatever stands within a few metres of it, timber first.
 */
export function stepWorks(world, dt, events, rng) {
  if (!world.ruin) return;
  if (world.works?.walls?.length) erodeWalls(world, dt, events);
  if (!world.works?.cities?.length) return;
  world._fireClock = (world._fireClock || 0) + dt;
  const spread = world._fireClock >= 2;
  if (spread) world._fireClock = 0;
  for (const key in world.ruin.b) {
    const r = world.ruin.b[key];
    if (!r.f) continue;
    const b = buildingById(world, Number(key));
    if (!b) continue;
    const was = stageOf(r.d);
    r.d = Math.min(1, r.d + BUILT[b.mat].rate * dt);
    // Burned out: the roof and the floors gone, the walls standing.
    if (r.d >= 0.86) { r.d = 0.86; r.f = 0; }
    r.d = Math.round(r.d * 1000) / 1000;
    if (stageOf(r.d) !== was || !r.f) ruinEvent(events, b, r);
    if (spread && r.f) {
      for (const nid of b.near) {
        const o = buildingById(world, nid);
        const ro = world.ruin.b[nid];
        if (ro && (ro.f || ro.c || ro.d >= 0.86)) continue;
        // A fire spreads by what is burning as much as by what is next to
        // it: a timber house going up sets light to brick next door.
        if (rng() < (BUILT[b.mat].burn + BUILT[o.mat].burn) * 0.16) {
          const nr = ro || (world.ruin.b[nid] = { d: 0, f: 0 });
          nr.f = 1;
          ruinEvent(events, o, nr);
        }
      }
    }
  }
}

/**
 * Clear the ground for a gun position: whatever buildings stood on it are
 * pulled down before the battle, and the guns go in where they were.
 */
export function clearForBattery(world, x, z, radius, events) {
  let n = 0;
  for (const b of cityPlans(world).flatMap((plan) => plan.buildings)) {
    if (Math.hypot(b.x - x, b.z - z) > radius + Math.hypot(b.w, b.d) / 2) continue;
    // Any part of it inside the circle.
    const dx = x - b.x;
    const dz = z - b.z;
    const s = Math.sin(b.rot);
    const k = Math.cos(b.rot);
    const a = Math.max(0, Math.abs(k * dx - s * dz) - b.w / 2);
    const c = Math.max(0, Math.abs(s * dx + k * dz) - b.d / 2);
    if (Math.hypot(a, c) > radius) continue;
    const ruin = world.ruin || (world.ruin = { b: {}, w: {} });
    if (ruin.b[b.id]?.c) continue;
    ruin.b[b.id] = { d: 1, f: 0, c: 1 };
    ruinEvent(events, b, ruin.b[b.id]);
    n++;
  }
  return n;
}

/**
 * Put a change the server announced onto a world -- the client's copy, or in
 * a standalone build the very world the simulation is changing, which is why
 * it sets the state rather than adding to it.
 */
export function applyRuin(world, ev) {
  const ruin = world.ruin || (world.ruin = { b: {}, w: {} });
  if (ev.k === 'b') {
    ruin.b[ev.id] = { d: ev.d, f: ev.f || 0, ...(ev.c ? { c: 1 } : {}) };
  } else if (ev.k === 'w') {
    const was = ruin.w[ev.id]?.d || 0;
    ruin.w[ev.id] = { d: ev.d, ...(ev.h ? { h: ev.h.map((q) => q.slice()) } : {}) };
    if (ev.d >= 1 && was < 1) world.groundRev = (world.groundRev || 0) + 1;
  }
}

/**
 * Whether the point is on a section of sea wall that has been breached. A gun
 * there has nothing under it but the heap: it is not levelled on the sound
 * sections either side of it, which is what its pad would otherwise find.
 */
export function breachedAt(world, x, z) {
  const at = wallAt(world, x, z);
  return !!at && wallDamage(world, at.run, at.sec) >= 1;
}

// ---------------------------------------------------------------------------
// Siting a gun on the works
// ---------------------------------------------------------------------------

/**
 * Whether a battery of this span can be put down at (x, z) on the works as it
 * is, and where exactly: on a wall's walkway, pulled in to its middle if it
 * was asked for too near an edge; or anywhere on the town's level where its
 * whole emplacement is on the town. Null if not.
 */
export function siteOnWorks(world, x, z, span) {
  const w = world.works;
  if (!w) return null;
  const need = Math.max(5, span * 0.62);
  const on = wallAt(world, x, z, 8);
  if (on) {
    const run = w.walls[on.run];
    if (need > run.width / 2 - 1) return null;
    const [ax, az, anx, anz] = run.pts[on.seg];
    const [bx, bz, bnx, bnz] = run.pts[on.seg + 1];
    const px = ax + (bx - ax) * on.t;
    const pz = az + (bz - az) * on.t;
    const nx = anx + (bnx - anx) * on.t;
    const nz = anz + (bnz - anz) * on.t;
    const room = run.width / 2 - need - 0.5;
    const off = clamp(on.across, -room, room);
    return { x: px + nx * off, z: pz + nz * off, wall: true };
  }
  const plan = planAt(world, x, z);
  if (!plan) return null;
  const { u, v } = worldToCity(plan.city, x, z);
  for (let a = 0; a < 16; a++) {
    const th = (a / 16) * TAU;
    for (const k of [0.5, 1]) {
      const t = plan.surfAt(u + Math.cos(th) * need * k, v + Math.sin(th) * need * k);
      if (t === SURF.none) return null;
    }
  }
  return { x, z, wall: false };
}

/** The extra a man stands on over the ground at a point in a town -- a kerb, a lawn, a heap of rubble -- and whether a wall is in his way. */
export function worksFloor(world, x, z) {
  const plan = planAt(world, x, z, 2);
  if (!plan) return { rise: 0, blocked: false };
  const { u, v } = worldToCity(plan.city, x, z);
  let rise = SURF_RISE[plan.surfAt(u, v)] || 0;
  for (const id of buildingsNear(plan, x, z)) {
    const b = plan.byId.get(id);
    if (!inFootprint(b, x, z, 0.15)) continue;
    const r = ruinOf(world, id);
    const st = stageOf(r?.d || 0, !!r?.c);
    if (st === STAGE.cleared) continue;
    if (st === STAGE.rubble) {
      // A heap: highest in the middle, down to nothing at its edges.
      const dx = x - b.x;
      const dz = z - b.z;
      const s = Math.sin(b.rot);
      const k = Math.cos(b.rot);
      const a = Math.abs(k * dx - s * dz) / (b.w / 2 + 2);
      const c = Math.abs(s * dx + k * dz) / (b.d / 2 + 2);
      const e = Math.max(0, 1 - Math.max(a, c));
      rise = Math.max(rise, standingHeight(b, r) * Math.min(1, e * 1.6));
      continue;
    }
    return { rise, blocked: true };
  }
  // And the larger furniture: nobody walks through a fountain's basin or a
  // telephone kiosk.
  for (const p of plan.props) {
    const r = SOLID[p.t];
    if (!r || Math.abs(p.u - u) > r || Math.abs(p.v - v) > r) continue;
    if (Math.hypot(p.u - u, p.v - v) < r) return { rise, blocked: true };
  }
  return { rise, blocked: false };
}

/** How far round each solid piece of street furniture a man is kept off it. */
const SOLID = { fountain: 5.6, statue: 1.9, bandstand: 5.1, kiosk: 1.7, phone: 0.75, pillar: 0.45 };

// ---------------------------------------------------------------------------
// What is solid
// ---------------------------------------------------------------------------
//
// Everything that moves through the air -- an aeroplane flown into a hill, a
// shell, a strafing burst, the line a gun layer looks down -- meets the same
// two things ashore: the ground, as it is drawn and not only as the height
// field has it between the mesh's points, and whatever building is standing
// on it.

/** The height of the land a body in the air meets at a point: the ground or the terrain as drawn, whichever stands higher. */
export function solidGround(world, x, z) {
  return Math.max(groundHeight(world, x, z), drawnGround(world, x, z));
}

/**
 * Whether a point in the air is inside the land or a standing building:
 * `{ x, y, z, b }`, with `b` the building or null for the ground, or null.
 * Not the sea: that is everybody's own business.
 */
export function solidAt(world, x, y, z) {
  if (y > landCeiling(world)) return null;
  const g = solidGround(world, x, z);
  if (g > 0 && y <= g) return { x, y, z, b: null };
  if (!world.works?.cities?.length) return null;
  const hit = worksImpact(world, x, y + 0.5, z, x, y, z);
  return hit ? { x, y, z, b: hit.b } : null;
}

/**
 * The first point on the line from a to b inside the land or a building:
 * `{ x, y, z, b, f }`, with `f` how far along the line it is, or null.
 *
 * The ground is walked in steps no longer than `step` near it and longer the
 * higher over it the line is, and the crossing found to a few centimetres;
 * the buildings are walked by worksImpact. Land under the sea does not count.
 *
 * `drawn` false takes the height field alone, without the mesh: what a round
 * meets, since the pit a gun is dug into and the craters are in the field and
 * finer than the mesh is drawn on.
 */
export function solidHit(world, ax, ay, az, bx, by, bz, step = 4, drawn = true) {
  const top = landCeiling(world);
  if (ay > top && by > top) return null;
  const L = Math.hypot(bx - ax, by - ay, bz - az);
  const at = (f) => [ax + (bx - ax) * f, ay + (by - ay) * f, az + (bz - az) * f];
  const under = (f) => {
    const [x, y, z] = at(f);
    if (y > top) return { in: false, gap: y - top + step };
    const g = drawn ? solidGround(world, x, z) : groundHeight(world, x, z);
    return { in: g > 0 && y <= g, gap: y - Math.max(0, g) };
  };
  let ground = null;
  if (L < 1e-6) {
    if (under(0).in) ground = 0;
  } else {
    let f = 0;
    let was = under(0);
    if (was.in) ground = 0;
    while (ground === null && f < 1) {
      // As far as a slope of one in one could have come up to meet the line.
      const next = Math.min(1, f + Math.max(step, Math.min(80, was.gap * 0.7)) / L);
      const now = under(next);
      if (now.in) {
        let lo = f;
        let hi = next;
        for (let k = 0; k < 12; k++) {
          const mid = (lo + hi) / 2;
          if (under(mid).in) hi = mid; else lo = mid;
        }
        ground = hi;
        break;
      }
      f = next;
      was = now;
    }
  }
  // A building short of the ground the line went into.
  if (world.works?.cities?.length) {
    const end = ground === null ? 1 : ground;
    const [ex, ey, ez] = at(end);
    const hit = worksImpact(world, ax, ay, az, ex, ey, ez);
    if (hit) return { x: hit.x, y: hit.y, z: hit.z, b: hit.b, f: hit.f * end };
  }
  if (ground === null) return null;
  const [x, y, z] = at(ground);
  return { x, y, z, b: null, f: ground };
}

// ---------------------------------------------------------------------------
// The works as something to shoot at
// ---------------------------------------------------------------------------
//
// A ship's guns and a coast battery are laid on a ship by her id. A town and
// a stretch of sea wall are laid on the same way, so they have ids of their
// own: negative, so they can never be mistaken for anything afloat or ashore
// that the battle numbers as it goes. What a gun is laid on is a point -- the
// standing building nearest the middle of the town, or the section of the wall
// that is furthest gone and still standing, which is where a gunnery officer
// sent to knock a breach in it would go on putting his rounds -- and it is
// worked out again as the town and the wall come down.

/** The id a town is laid on by: -1001 for the first, -1002 for the next. */
export const townTargetId = (i) => -1001 - i;
/** And a run of sea wall. */
export const wallTargetId = (k) => -3001 - k;
/** Whether an id is one of these. */
export const isWorksTarget = (id) => Number.isInteger(id) && id <= -1001 && id >= -3001 - MAX_WALLS * 40;

/** How long a worked-out aim point stands before it is worked out again, in seconds of battle. */
const AIM_HOLD = 1.5;
const TARGETS = new WeakMap();

/**
 * Every town and every run of wall on the battlefield as a target:
 * `{ id, kind, i, name, x, z, y, alive, left }`, with `left` the share of it
 * still standing. `t` is the battle's clock, which is all the cache is keyed on.
 */
export function worksTargets(world, t = 0) {
  if (!world?.works) return [];
  const had = TARGETS.get(world);
  if (had && Math.abs(t - had.t) < AIM_HOLD && had.ruin === world.ruin) return had.list;
  const list = [];
  const plans = cityPlans(world);
  const count = {};
  for (const p of plans) count[p.city.kind || 'town'] = (count[p.city.kind || 'town'] || 0) + 1;
  const seen = {};
  plans.forEach((plan, i) => {
    const c = plan.city;
    const kk = c.kind || 'town';
    seen[kk] = (seen[kk] || 0) + 1;
    const word = worksName(c);
    let best = null;
    let bd = Infinity;
    let left = 0;
    let all = 0;
    for (const b of plan.buildings) {
      const r = ruinOf(world, b.id);
      const st = stageOf(r?.d || 0, !!r?.c);
      all += b.hp;
      if (st >= STAGE.rubble) continue;
      left += b.hp * (1 - (r?.d || 0));
      const d = Math.hypot(b.x - c.x, b.z - c.z);
      if (d < bd) { bd = d; best = b; }
    }
    const at = best || c;
    list.push({
      id: townTargetId(i), kind: 'town', i, name: count[kk] > 1 ? `${word} ${seen[kk]}` : word,
      x: at.x, z: at.z, y: plan.level + (best ? Math.min(6, best.h / 2) : 0),
      alive: !!best, left: all > 0 ? left / all : 0,
      heading: 0, speed: 0, team: -1,
    });
  });
  const runs = world.works.walls || [];
  runs.forEach((run, k) => {
    const n = wallSections(run);
    let pick = -1;
    let pd = -1;
    let gone = 0;
    for (let s = 0; s < n; s++) {
      const d = wallDamage(world, k, s);
      gone += d;
      if (d >= 1) continue;
      // The furthest gone; between equals the one nearest the middle.
      const v = d - Math.abs(s - (n - 1) / 2) * 1e-4;
      if (v > pd) { pd = v; pick = s; }
    }
    const sec = Math.max(0, pick);
    const [k0, k1] = sectionSpan(run, sec);
    const a = run.pts[k0];
    const b = run.pts[k1];
    list.push({
      id: wallTargetId(k), kind: 'wall', i: k, sec,
      name: runs.length > 1 ? `Sea wall ${k + 1}` : 'Sea wall',
      x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, y: run.top,
      alive: pick >= 0, left: 1 - gone / n,
      heading: 0, speed: 0, team: -1,
    });
  });
  TARGETS.set(world, { t, ruin: world.ruin, list });
  return list;
}

/** One of them by its id, or null. */
export function worksTarget(world, id, t = 0) {
  if (!isWorksTarget(id)) return null;
  return worksTargets(world, t).find((q) => q.id === id) || null;
}

/** The middle of a run of wall, for a camera to stand off. */
export function wallMiddle(world, k) {
  const run = world?.works?.walls?.[k];
  if (!run) return null;
  const p = run.pts[Math.floor(run.pts.length / 2)];
  return { x: p[0], z: p[1], y: run.top, span: Math.min(900, run.pts.length * WALL_STEP) };
}
