// The inside of a warship.
//
// Every hull in the game was a shell with nothing behind the plating: open her
// up -- and now that compartments can be blown out of her, you can -- and you
// were looking through her at the sea on the far side. A ship is not a shape,
// she is a box divided into a hundred smaller boxes, and what is in them is
// the reason the shape is that shape: the machinery amidships is why she is
// widest there, the magazines are under the turrets because that is the
// shortest way for a shell to travel, and the steering gear is right aft
// because that is where the rudder is.
//
// This builds that inside for any hull, out of the hull's own lines. It is
// given the three functions every ship in the yard already has -- her
// half-breadth at a station and a height, her keel and her sheer -- and it
// fits her decks, her bulkheads and her machinery to them. So a Fletcher gets
// a destroyer's two boiler rooms and a Hipper gets a cruiser's three, at the
// heights and breadths those ships actually have, without any of it being
// typed out twice.
//
// It is all inside the plating, so none of it is visible until something takes
// the plating off. That is what it is for.

import * as THREE from '../../../vendor/three.module.js';
import { SECTIONS, sectionAt } from '../../../shared/sim.js';
import { box, cyl, tubeZ, tubeX } from './shipkit.js';

// The yard's own colours: painted bulkheads, dark deck plating, machinery in
// oiled steel, and the red lead they primed everything with.
const P = {
  deck: 0x4a4f55,          // deck plating, worn
  bulkhead: 0x9aa19f,      // painted white-grey, as every mess deck was
  frame: 0x6b7178,         // frames and beams
  machine: 0x35393e,       // turbines, gearing, condensers
  boiler: 0x25282c,        // boiler casings
  pipe: 0x7d746a,          // steam pipes, lagged
  shell: 0x7a6a3e,         // brass-cased ammunition
  cordite: 0x5c5344,       // charge cases
  cable: 0x2f3338,         // anchor cable
  oil: 0x1a1d20,           // tank tops and bilges
  red: 0x6d3a2c,           // red lead below the waterline
};
const MATS = {};
const mat = (c) => {
  if (!MATS[c]) MATS[c] = new THREE.MeshLambertMaterial({ color: c });
  return MATS[c];
};
const M = new Proxy({}, { get: (_, k) => mat(P[k]) });

/**
 * A plate cut to the shape of the hull at one height.
 *
 * A deck is not a rectangle: it is the waterplane at that height, and forward
 * it comes to a point. Built as a strip of quads down the centreline out to
 * the shell on each side, so it fills the hull exactly however fine her ends
 * are.
 */
function platform(g, m, hull, y, t0, t1, inset = 0.10, steps = 26) {
  // Clipped to where the hull actually reaches this height. Her keel rises at
  // both ends, so a deck laid at one height from stem to stern runs out under
  // the counter and out through the forefoot -- which is a plate hanging in
  // the water below an undamaged ship.
  const has = (t) => y > hull.keelY(t) + 0.25 && y < hull.sheer(t);
  let ta = t0;
  let tb = t1;
  const step = (t1 - t0) / 400;
  while (ta < t1 && !has(ta)) ta += step;
  while (tb > ta && !has(tb)) tb -= step;
  if (tb - ta < Math.abs(t1 - t0) * 0.02) return null;
  const pos = [];
  const idx = [];
  let n = 0;
  let prev = null;
  const span = (tb - ta) / steps;
  for (let i = 0; i <= steps; i++) {
    const t = ta + ((tb - ta) * i) / steps;
    const z = hull.zAt ? hull.zAt(t, y) : (t * hull.loa) / 2;
    // Held off the shell by a fraction of the breadth rather than a fixed
    // margin, so a deck reads as a deck at any scale -- and so that looking in
    // through a hole in her side you can see the layers of her rather than one
    // solid slab with the edges of the plates flush to the plating.
    //
    // And cut to the narrowest the hull gets between this vertex and the next
    // rather than to the width at the vertex itself. The edge of the plate is
    // a straight line from one vertex to the next, and her waterline aft is
    // hollow: a straight line between two points on a hollow curve lies
    // outside it, which puts the corner of the deck through her quarter.
    const w = narrowBetween(hull, t, y, span);
    const half = Math.max(0, w * (1 - inset));
    const a = n;
    pos.push(-half, y, z, half, y, z);
    n += 2;
    if (prev !== null) idx.push(prev, prev + 1, a, prev + 1, a + 1, a);
    prev = a;
  }
  if (n < 4) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const o = new THREE.Mesh(geo, m);
  o.material = m;
  // Seen from above and from below: you are looking down into her through a
  // hole in the side, and a single-sided deck is a deck that is not there.
  o.material.side = THREE.DoubleSide;
  g.add(o);
  return o;
}

/**
 * A transverse bulkhead: the ship's section at one station, filled in.
 *
 * These are the divisions the whole damage model is written in terms of -- a
 * compartment is the space between two of them -- so they are put exactly
 * where the simulation's compartment boundaries are rather than wherever looks
 * right. Open her up and the bulkhead you are looking at is the one the
 * flooding stopped at.
 */
function bulkhead(g, m, hull, t, yTop, steps = 14) {
  const z = hull.zAt ? hull.zAt(t, 0) : (t * hull.loa) / 2;
  const keel = hull.keelY(t);
  // A transverse bulkhead is a flat plane at one distance along her, but a
  // station is not: her stem and her counter are raked, so the station that
  // stands at this z near the keel is not the one that stands here at the
  // waterline. Each row of the bulkhead is measured at the station its own
  // height belongs to, or the bottom of a bulkhead well aft is cut to the
  // breadth of a part of the ship several metres further forward -- which is
  // wider, and shows through her quarter.
  const stationFor = hull.zAt
    ? (y) => stationAt(hull, z, y)
    : () => t;
  const pos = [];
  const idx = [];
  let prev = null;
  let n = 0;
  const rise = (yTop - keel) / steps;
  const ys = [];
  const halves = [];
  for (let i = 0; i <= steps; i++) {
    const y = keel + ((yTop - keel) * i) / steps;
    // The narrowest she gets between this row of the bulkhead and the next,
    // for the same reason a deck is cut to the narrowest along it: the edge
    // between two rows is a straight line, and her section is not.
    let w = Infinity;
    for (let k = -1; k <= 1; k++) {
      const q = y + (rise * k) / 2;
      w = Math.min(w, hull.shellAt(stationFor(q), q));
    }
    ys.push(y);
    halves.push(Math.max(0, w - 0.2));
  }
  // Below the waterline a hull only widens as it goes up -- that is what a
  // keel is -- so no row down there may be wider than the one above it. It is
  // a last check on the measurement rather than on the ship: right down in the
  // skeg there is so little plating that a ray can miss it altogether, and a
  // guess made where nothing was measured has no business being wider than the
  // place just above where something was.
  for (let i = halves.length - 2; i >= 0; i--) {
    if (ys[i] < 0) halves[i] = Math.min(halves[i], halves[i + 1]);
  }
  for (let i = 0; i < halves.length; i++) {
    const y = ys[i];
    const half = halves[i];
    const a = n;
    pos.push(-half, y, z, half, y, z);
    n += 2;
    if (prev !== null) idx.push(prev, prev + 1, a, prev + 1, a + 1, a);
    prev = a;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const o = new THREE.Mesh(geo, m);
  o.material.side = THREE.DoubleSide;
  g.add(o);
  return o;
}

/**
 * The narrowest the hull gets within half a step either side of a station.
 *
 * Anything drawn as a strip of quads has straight edges between its vertices,
 * and a straight line between two points on a hollow curve -- which is what
 * her run aft is -- lies outside the curve. Cutting each vertex to the
 * narrowest section it is responsible for keeps the whole edge inside her.
 */
function narrowBetween(hull, t, y, span) {
  let w = Infinity;
  for (let k = -2; k <= 2; k++) {
    const q = Math.max(-1, Math.min(1, t + (span * k) / 4));
    w = Math.min(w, hull.shellAt(q, y));
  }
  return Math.max(0, w);
}

/** Where amidships is at a station, in metres, for placing things by eye. */
function zOf(hull, t) {
  return hull.zAt ? hull.zAt(t, 0) : (t * hull.loa) / 2;
}

/**
 * Which station a point belongs to, given how far along her it is and how high.
 *
 * Her stem and her counter are raked, so a point three metres up at the bow is
 * a good deal further forward than a point on the waterline at the same
 * station. Everything inside her that is placed by a fore-and-aft distance has
 * to be turned back into a station at its own height, or it is placed against
 * the wrong part of the hull -- which at the ends means outside it.
 */
function stationAt(hull, z, y) {
  if (!hull.zAt) return Math.max(-1, Math.min(1, z / (hull.loa / 2)));
  let lo = -1.02;
  let hi = 1.02;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    if (hull.zAt(mid, y) < z) lo = mid; else hi = mid;
  }
  return Math.max(-1, Math.min(1, (lo + hi) / 2));
}

/**
 * The widest a box of this height and length can be at this point in her, or
 * zero if it does not fit there at all.
 *
 * Checked at every corner, at the station each corner really belongs to.
 */
function roomAt(hull, z, dz, y0, y1) {
  let w = Infinity;
  // Seven heights rather than three. A frame three metres tall checked at its
  // top, middle and bottom clears the plating at all three and still comes out
  // through the turn of the bilge in between, because that is where the hull
  // stops being a straight line.
  for (let i = 0; i <= 6; i++) {
    const y = y0 + ((y1 - y0) * i) / 6;
    for (const dd of [-dz, 0, dz]) {
      const t = stationAt(hull, z + dd, y);
      if (y < hull.keelY(t) + 0.2 || y > hull.sheer(t) - 0.2) return 0;
      w = Math.min(w, hull.shellAt(t, y));
    }
  }
  return Math.max(0, w);
}

/**
 * The narrowest the hull gets between two heights at a station.
 *
 * Anything drawn as a box has to fit inside her over the whole of its own
 * height, not just at the middle of it. Sized off the middle -- which is what
 * this is here to stop -- a bulkhead the full breadth of the ship at its waist
 * has its bottom corners out through the plating, because the hull is tucking
 * in towards the keel down there. That is what the pale ticks showing under
 * an undamaged hull were.
 */
function narrowest(hull, t, y0, y1) {
  let w = Infinity;
  for (let i = 0; i <= 6; i++) {
    w = Math.min(w, hull.shellAt(t, y0 + ((y1 - y0) * i) / 6));
  }
  return Math.max(0, w);
}

/**
 * How far aft, and how far forward, she still has this much depth.
 *
 * A shaft, a floor plate or a length of pipe run out to a fixed station goes
 * through the bottom of her at the ends, where the keel is rising towards the
 * counter and the forefoot. Everything long asks this instead.
 */
function reachAt(hull, y, dir, needHalf = 0) {
  let t = 0;
  for (let i = 0; i <= 200; i++) {
    const q = dir * (i / 200);
    if (hull.keelY(q) > y - 0.35) break;
    // And enough breadth for whatever is being run out there. A shaft has
    // depth under it a long way aft and no room beside it, so the keel alone
    // is not the question.
    if (needHalf && hull.shellAt(q, y) < needHalf + 0.4) break;
    t = q;
  }
  return t;
}

/** The same, over a length of her as well as a height: for anything long. */
function fits(hull, t0, t1, y0, y1) {
  let w = Infinity;
  for (let i = 0; i <= 6; i++) {
    w = Math.min(w, narrowest(hull, t0 + ((t1 - t0) * i) / 6, y0, y1));
  }
  return Math.max(0, w);
}

/**
 * Her machinery: boilers forward of the turbines, on the centreline, with the
 * uptakes going up to wherever her funnels are.
 *
 * The arrangement is the one every steam warship of the period had. Boilers
 * make the steam; the uptakes take the smoke up; the turbines take the steam
 * and turn the shafts; the shafts run aft through the after compartments to
 * the screws. It is laid out to the machinery space the hull actually has, so
 * a destroyer gets two boilers to a battleship's eight.
 */
function machinery(g, hull, sole, top) {
  const t0 = -0.20;
  const t1 = 0.20;
  const z0 = zOf(hull, t0);
  const z1 = zOf(hull, t1);
  const len = z1 - z0;
  // Boilers forward, engines aft: two thirds of the space is boiler rooms in
  // anything smaller than a battleship, which is why the funnels are forward
  // of the mainmast.
  const bz1 = z0 + len * 0.62;
  const head = Math.max(2.2, top - sole);
  // The breadth she has to work in is the narrowest the hull gets anywhere in
  // the machinery space, over the whole of its height -- not the widest.
  const beam = fits(hull, t0, t1, sole, top) * 2;
  const nBoilers = Math.max(2, Math.min(8, Math.round(hull.loa / 34)));
  const rows = Math.max(1, Math.round(nBoilers / 2));
  const pitch = (bz1 - z0) / rows;
  // She has to fit under the deck over her, and two abreast have to fit across
  // her: a boiler drawn taller than the space it stands in comes up through the
  // platform deck, which is how the first attempt at this looked.
  const rBoiler = Math.min(head * 0.34, pitch * 0.36, beam * 0.15);
  const abreast = nBoilers > rows ? 2 : 1;
  const drum = abreast === 1 ? beam * 0.52 : beam * 0.38;

  for (let i = 0; i < rows; i++) {
    const z = z0 + pitch * (i + 0.5);
    for (let s = 0; s < abreast; s++) {
      const x = abreast === 1 ? 0 : (s ? 1 : -1) * beam * 0.24;
      const yc = sole + rBoiler + 0.35;
      // The boiler itself: a drum lying athwartships on its saddles, with the
      // front plate and the row of furnace doors a stoker looks at.
      tubeX(g, M.boiler, rBoiler, drum, x, yc, z, 12);
      for (const e of [-1, 1]) {
        cyl(g, M.frame, rBoiler * 1.04, rBoiler * 1.04, 0.22,
          x + e * drum * 0.5, yc, z, 12).rotation.z = Math.PI / 2;
      }
      box(g, M.frame, drum * 1.02, 0.3, rBoiler * 1.9, x, sole + 0.2, z);
      for (let d = -1; d <= 1; d++) {
        box(g, M.machine, drum * 0.2, rBoiler * 0.42, 0.16,
          x + d * drum * 0.28, sole + rBoiler * 0.7, z - rBoiler * 1.02);
      }
      // The uptake off the top of it, up through the deck to the funnel.
      const up = Math.max(0.6, top - (yc + rBoiler));
      cyl(g, M.pipe, rBoiler * 0.5, rBoiler * 0.62, up, x, yc + rBoiler + up / 2, z, 8);
      // Steam pipe forward along the top of the drum to the engine room.
      tubeZ(g, M.pipe, rBoiler * 0.13, pitch * 0.9, x, yc + rBoiler * 0.9, z + pitch * 0.4, 6);
    }
    // The stokehold between the rows: floor plates and a ladder up.
    if (abreast === 2) {
      box(g, M.deck, beam * 0.16, 0.14, pitch * 0.8, 0, sole + 0.1, z);
    }
  }

  // The engine room: turbine casings either side of the centreline, the
  // condensers under them, and the shafts running aft.
  const ez0 = bz1 + 1.2;
  const shafts = hull.loa > 190 ? 2 : 1;
  const L = Math.max(3, (z1 - ez0) * 0.62);
  for (let i = 0; i < shafts; i++) {
    const x = shafts === 1 ? 0 : (i ? 1 : -1) * beam * 0.22;
    // Turbine casing, low and long, with the gearcase abaft it.
    box(g, M.machine, beam * 0.24, head * 0.34, L, x, sole + head * 0.22, ez0 + L * 0.5);
    tubeZ(g, M.machine, beam * 0.085, L * 0.8, x, sole + head * 0.44, ez0 + L * 0.5, 10);
    box(g, M.machine, beam * 0.2, head * 0.42, 2.2, x, sole + head * 0.24, ez0 + L + 1.1);
    // Condenser underneath, and the shaft aft out through the bulkhead.
    tubeZ(g, M.frame, beam * 0.06, L * 0.7, x, sole + 0.5, ez0 + L * 0.5, 8);
    // Aft as far as she still has the depth for a shaft, which is short of the
    // sternpost: the keel is coming up to meet the counter back there.
    const shaftY = sole + 0.55;
    const rad = Math.max(0.16, beam * 0.022);
    const zEnd = zOf(hull, reachAt(hull, shaftY, -1, Math.abs(x) + rad * 1.2));
    const tail = Math.max(2, (ez0 + L + 2.2) - zEnd);
    tubeZ(g, M.frame, rad, tail, x, shaftY, ez0 + L + 2.2 - tail / 2, 8);
  }
  // Floor plates over the bilge, which is what you stand on down there, and
  // the gratings above them.
  platform(g, M.deck, hull, sole + 0.05, t0, t1, 0.22, 10);
}

/**
 * A magazine: shell rooms with the shells stowed on end, the handing room over
 * them, and the hoist trunk going up to the gunhouse.
 */
function magazine(g, hull, t0, t1, sole, top, cal) {
  const tc = (t0 + t1) / 2;
  const zc = zOf(hull, tc);
  const head = Math.max(2, top - sole);
  const half = fits(hull, t0, t1, sole, top);
  const r = Math.max(0.08, cal * 0.5);
  // Shell rooms below, handing room over them, and the trunk up to the
  // gunhouse. Two tiers of racks against the wing bulkheads with the working
  // space down the middle, which is how a magazine is arranged and why a
  // magazine is the length it is.
  const tier = head * 0.42;
  for (const s of [-1, 1]) {
    for (let t = 0; t < 2; t++) {
      const y = sole + 0.2 + t * tier;
      const x = s * half * 0.58;
      const L = Math.abs(zOf(hull, t1) - zOf(hull, t0)) * 0.7;
      // The rack: a shelf with the shells standing on it, noses up.
      box(g, M.frame, r * 4.4, 0.16, L, x, y, zc);
      const n = Math.max(3, Math.floor(L / (r * 3.0)));
      for (let i = 0; i < n; i++) {
        const z = zc - L / 2 + (L * (i + 0.5)) / n;
        for (let c = -1; c <= 1; c += 2) {
          cyl(g, M.shell, r, r, r * 5.0, x + c * r * 1.4, y + 0.08 + r * 2.5, z, 7);
        }
      }
      // And the charge cases outboard of them, in their own racks.
      box(g, M.cordite, r * 1.8, r * 3.2, L * 0.9, x + s * r * 3.1, y + r * 1.7, zc);
    }
  }
  // The hoist trunk, up the middle of it to the turret above -- which is the
  // whole reason the magazine is under the turret.
  const trunk = Math.max(0.5, half * 0.22);
  cyl(g, M.frame, trunk, trunk, head, 0, sole + head / 2, zc, 10);
  cyl(g, M.machine, trunk * 0.55, trunk * 0.55, head * 0.9, 0, sole + head * 0.5, zc, 8);
  // The handing room floor over the stow.
  platform(g, M.deck, hull, sole + tier * 2 + 0.2, t0, t1, 0.16, 8);
}

/**
 * The steering gear: the rudder stock coming up through the counter into the
 * tiller flat, with the quadrant on it and the rams either side.
 *
 * This is the compartment that, opened up, leaves a ship going round in
 * circles -- which is exactly what the simulation does when her after section
 * is gone, so it is worth being able to see the thing that broke.
 */
function steering(g, hull, sole) {
  // As far aft as the tiller flat can be and still be inside her.
  const t = Math.max(-0.92, reachAt(hull, sole + 0.4, -1) + 0.05);
  const z = zOf(hull, t);
  const half = Math.max(1, fits(hull, t - 0.06, t + 0.06, sole, sole + 3.2));
  // The rudder stock coming up through the counter into the tiller flat, the
  // quadrant keyed to it, and the two rams that swing it.
  cyl(g, M.machine, half * 0.13, half * 0.13, 3.4, 0, sole + 1.7, z, 12);
  cyl(g, M.machine, half * 0.62, half * 0.62, 0.5, 0, sole + 2.6, z, 14);
  box(g, M.machine, half * 1.2, 0.42, 0.7, 0, sole + 2.6, z + half * 0.25);
  for (const s of [-1, 1]) {
    tubeX(g, M.pipe, 0.22, half * 0.7, s * half * 0.55, sole + 2.6, z + half * 0.5, 8);
    box(g, M.machine, half * 0.3, 0.9, 1.2, s * half * 0.72, sole + 1.2, z + half * 0.9);
    // The steering engine and its telemotor pipes, up the side.
    tubeZ(g, M.pipe, 0.12, 6, s * half * 0.8, sole + 2.2, z + 4, 6);
  }
  platform(g, M.deck, hull, sole + 0.05, t - 0.1, -0.60, 0.2, 8);
}

/** Chain lockers: the cable flaked down in the eyes of her. */
function cableLockers(g, hull, sole) {
  // The lockers are three metres long, so the station they are centred on has
  // to be far enough back that their forward end is still inside her. Put at
  // the last station that has depth under it -- which is what the reach is --
  // the front six feet of the locker hangs out through her stem, because her
  // forefoot rises that fast. And they are sized over the whole of their own
  // length rather than at their middle, for the same reason.
  const reach = Math.min(0.86, reachAt(hull, sole + 0.4, 1) - 0.05);
  const z = zOf(hull, reach) - 1.9;
  const t = stationAt(hull, z, sole + 0.4);
  const half = Math.max(0.35, fits(hull, stationAt(hull, z - 1.7, sole),
    stationAt(hull, z + 1.7, sole), sole, sole + 2.4));
  for (const s of [-1, 1]) {
    const x = s * half * 0.45;
    box(g, M.frame, half * 0.5, 0.2, 3.2, x, sole + 0.3, z);
    for (let i = 0; i < 5; i++) {
      cyl(g, M.cable, half * 0.22, half * 0.22, 0.34, x, sole + 0.5 + i * 0.36, z, 8)
        .rotation.x = Math.PI / 2;
    }
  }
}

// How finely the drawn plating is measured, in metres. Fine enough that the
// tuck under the bilge is followed rather than averaged over, coarse enough
// that most cells have a vertex in them.
const ENV_DZ = 0.6;
const ENV_DY = 0.15;
// And how far inboard of the plating her insides are held. A bulkhead exactly
// flush with the shell shows through it wherever the two disagree by a
// millimetre, which -- with the plating and the frame drawn as separate
// surfaces at the same place -- is everywhere.
const ENV_MARGIN = 0.55;

/**
 * Measure the plating that is actually drawn, and hold the lines to it.
 *
 * Returns the same lines interface with `shellAt` clamped to how wide the real
 * plating is at that point. Everything inside her -- platforms, bulkheads,
 * machinery, the reach of a shaft, the frames -- goes through `shellAt`, so
 * clamping it once fits the whole interior to the real ship.
 *
 * Measured by shooting a ray out from the centreline at each point of a grid
 * and taking the outermost plating it goes through. That is the only
 * instrument that answers the question being asked -- how far out is her side
 * here -- without assuming anything about how she was drawn. Reading the
 * corners of the plating does not: a hull is lofted through station rows many
 * metres apart, and between two rows there is no corner at all, so the corners
 * say the ship does not exist exactly where her shape is changing fastest.
 * Nor does sampling the faces into cells: a cell holds the widest thing that
 * crossed it, and a mast or a rail crossing an empty cell makes the ship look
 * a metre wide there.
 */
function heldToPlating(g, hull) {
  const tris = platingTriangles(g);
  if (!tris.length) return hull;

  // Bucketed along her, so a ray only has to try the plating near it.
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < tris.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      const z = tris[i + k * 3 + 2];
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / ENV_DZ) + 1);
  const bucket = new Array(nz);
  for (let i = 0; i < tris.length; i += 9) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < 3; k++) {
      const z = tris[i + k * 3 + 2];
      if (z < lo) lo = z;
      if (z > hi) hi = z;
    }
    const b0 = Math.max(0, Math.floor((lo - minZ) / ENV_DZ));
    const b1 = Math.min(nz - 1, Math.floor((hi - minZ) / ENV_DZ));
    for (let b = b0; b <= b1; b++) (bucket[b] || (bucket[b] = [])).push(i);
  }

  // The grid: how far out her plating is, at every station and height she has.
  const keelLow = Math.min(hull.keelY(-0.98), hull.keelY(0), hull.keelY(0.98)) - 1;
  const deckHigh = Math.max(hull.sheer(-0.98), hull.sheer(0), hull.sheer(0.98)) + 1;
  const y0 = Math.floor(keelLow / ENV_DY);
  const ny = Math.max(1, Math.ceil((deckHigh - keelLow) / ENV_DY) + 1);
  const grid = new Float32Array(nz * ny).fill(-1);
  for (let zi = 0; zi < nz; zi++) {
    const list = bucket[zi];
    if (!list) continue;
    const z = minZ + zi * ENV_DZ;
    for (let yi = 0; yi < ny; yi++) {
      grid[zi * ny + yi] = beamAt(tris, list, (y0 + yi) * ENV_DY, z);
    }
  }

  const zOfT = hull.zAt ? (t, y) => hull.zAt(t, y) : (t) => (t * hull.loa) / 2;
  const at = (z, y) => {
    // The narrowest of the four rays around the point.
    //
    // Not an interpolation between them. Her sections are not all curves: a
    // Cleveland's bottom leaves her topsides at a hard chine, a destroyer's
    // skeg tapers to nothing in a couple of feet, and reading between two rays
    // either side of a step says she is wider there than she is -- which is a
    // frame standing out through her bilge. Taking the narrowest costs a few
    // inches of clearance inside her, which nobody can see.
    const zi = Math.floor((z - minZ) / ENV_DZ);
    const yi = Math.floor(y / ENV_DY - y0);
    if (zi < 0 || zi + 1 >= nz || yi < 0 || yi + 1 >= ny) return -1;
    let best = -1;
    for (let dz = 0; dz <= 1; dz++) {
      for (let dy = 0; dy <= 1; dy++) {
        const v = grid[(zi + dz) * ny + (yi + dy)];
        if (v >= 0 && (best < 0 || v < best)) best = v;
      }
    }
    if (best >= 0) return best;
    // Nothing there at all -- past her stem, under her keel, or in the gap
    // between her counter and her rudder. Nothing of hers belongs there, so
    // she is held to the narrowest plating anywhere near rather than letting
    // the lines have their way.
    for (let r = 1; r <= 3; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dy = -r; dy <= r; dy++) {
          const az = zi + dz;
          const ay = yi + dy;
          if (az < 0 || az >= nz || ay < 0 || ay >= ny) continue;
          const v = grid[az * ny + ay];
          if (v >= 0 && (best < 0 || v < best)) best = v;
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  };
  return {
    ...hull,
    shellAt: (t, y) => {
      const said = hull.shellAt(t, y);
      const drawn = at(zOfT(t, y), y);
      if (drawn < 0) return said;
      return Math.max(0, Math.min(said, drawn - ENV_MARGIN));
    },
  };
}

/**
 * How far out her plating is at one point, either side, in metres.
 *
 * A ray out from the centreline at that height and station, and the farthest
 * thing it goes through. Both sides, because she is not always symmetrical and
 * the wider of the two is the one an interior fitted to her has to clear.
 */
function beamAt(tris, list, y, z) {
  let best = -1;
  for (let n = 0; n < list.length; n++) {
    const i = list[n];
    const hit = rayX(tris, i, y, z);
    if (hit > best) best = hit;
  }
  return best;
}

/**
 * Where a ray along the beam, at (y, z), crosses one triangle -- as a distance
 * off the centreline, either side, or -1 if it misses.
 *
 * The ray runs in x, so the crossing is a two-dimensional question in the
 * (y, z) plane: is the point inside the triangle's shadow there, and if it is,
 * what is x on the triangle's plane above it.
 */
function rayX(tris, i, y, z) {
  const ay = tris[i + 1], az = tris[i + 2];
  const by = tris[i + 4], bz = tris[i + 5];
  const cy = tris[i + 7], cz = tris[i + 8];
  // Barycentric in the (y, z) plane.
  const d = (bz - cz) * (ay - cy) + (cy - by) * (az - cz);
  if (d === 0 || (d < 1e-9 && d > -1e-9)) return -1;
  const l1 = ((bz - cz) * (y - cy) + (cy - by) * (z - cz)) / d;
  if (l1 < 0 || l1 > 1) return -1;
  const l2 = ((cz - az) * (y - cy) + (ay - cy) * (z - cz)) / d;
  if (l2 < 0 || l1 + l2 > 1) return -1;
  const l3 = 1 - l1 - l2;
  return Math.abs(tris[i] * l1 + tris[i + 3] * l2 + tris[i + 6] * l3);
}

/**
 * Every triangle of plating in the group, in her own frame, as a flat array of
 * nine numbers apiece.
 *
 * Everything already built is plating: this runs before her insides exist and
 * before her guns go on, so what is in the group is her hull, her decks and
 * her upperworks and nothing else.
 */
function platingTriangles(g) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const out = [];
  const walk = (node) => {
    for (const child of node.children) {
      const geo = child.isMesh ? child.geometry : null;
      if (geo?.attributes?.position) {
        const pos = geo.attributes.position;
        const idx = geo.index;
        m.multiplyMatrices(inv, child.matrixWorld);
        const n = idx ? idx.count : pos.count;
        for (let i = 0; i + 2 < n; i += 3) {
          for (let k = 0; k < 3; k++) {
            v.fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(m);
            out.push(v.x, v.y, v.z);
          }
        }
      }
      if (child.children.length) walk(child);
    }
  };
  walk(g);
  return out;
}

/**
 * Build the whole of the inside of a hull.
 *
 * `hull` wants `loa`, `shellAt(t, y)`, `keelY(t)`, `sheer(t)`, and optionally
 * `zAt(t, y)` if her stem and counter are raked -- which is the same interface
 * every hull in the yard already has for building her plating.
 */
export function buildInterior(g, hull) {
  // Fitted to the plating she is actually drawn with, not to the lines alone.
  //
  // Every hull carries a set of lines -- shellAt, keelY, sheer -- and the
  // plating is lofted through them. But a warship is not her lines: she is
  // built out of the lines plus everything the yard did on top of them, and
  // the two do not agree everywhere. A hull that tucks in under the waterline
  // faster than shellAt says, a counter that narrows towards the sternpost, a
  // forefoot that is finer than the curve it was drawn from -- the lines are
  // generous there by a metre in a cruiser and by six in the Hipper, and an
  // interior built to the generous number stands outside the plating.
  //
  // That is the bulkhead you can see from alongside, and it is worst below the
  // waterline because that is where the difference is worst.
  //
  // So the plating already in the group is measured -- it is all built before
  // this runs -- and the lines are held to it: never wider than the ship
  // actually is at that point, less a hand's breadth so nothing is flush with
  // the shell.
  hull = heldToPlating(g, hull);

  const inside = new THREE.Group();
  inside.userData.inside = true;
  g.add(inside);
  // The lines she was built to, kept on her. Anything that wants to know where
  // her plating is -- the check that nothing inside her sticks out through it,
  // the flooding, the way she settles -- asks her rather than working it out
  // again from a copy of the numbers.
  g.userData.lines = hull;

  if (globalThis.__INSIDE_TRACE) globalThis.__INSIDE_TRACE(inside, hull);

  const keel = hull.keelY(0);
  const deck = hull.sheer(0);
  const depth = deck - keel;

  // The double bottom, and the tank top you walk on above it. Every warship of
  // the period had one: it is the difference between grounding and sinking.
  platform(inside, M.red, hull, keel + Math.max(0.5, depth * 0.06), -0.94, 0.94, 0.15, 30);
  const sole = keel + Math.max(0.7, depth * 0.10);
  platform(inside, M.oil, hull, sole, -0.94, 0.94, 0.3, 30);

  // Platform deck, lower deck, and the underside of the main deck: three of
  // them in anything cruiser-sized, two in a destroyer.
  const levels = [];
  const n = hull.loa > 150 ? 3 : 2;
  for (let i = 1; i <= n; i++) {
    const y = sole + ((deck - sole) * i) / (n + 1);
    levels.push(y);
    platform(inside, M.deck, hull, y, -0.96, 0.96, 0.25, 30);
  }
  const machTop = levels[0];

  // Her bulkheads, at the divisions the damage model is written in.
  for (const s of SECTIONS) {
    if (s.from === null) continue;
    for (const t of [s.from, s.to]) {
      if (t <= -0.99 || t >= 0.99) continue;
      bulkhead(inside, M.bulkhead, hull, t, hull.sheer(t));
    }
  }
  // And the collision bulkhead, which is the one right forward that a ship is
  // meant to be able to steam home behind.
  bulkhead(inside, M.bulkhead, hull, 0.78, hull.sheer(0.78));

  // What is between her decks everywhere else: the minor bulkheads that make
  // mess decks, stores and passageways out of one long space, and the ladders
  // between one deck and the next. Without them a ship opened up is a hollow
  // box with a boiler in it.
  for (let li = 0; li < levels.length; li++) {
    const y0 = li === 0 ? sole : levels[li - 1];
    const y1 = levels[li];
    const hgt = y1 - y0;
    if (hgt < 1.2) continue;
    const step = Math.max(8, hull.loa / 16);
    const lo = Math.max(-0.94, reachAt(hull, y0, -1)) * (hull.loa / 2);
    const hi = Math.min(0.94, reachAt(hull, y0, 1)) * (hull.loa / 2);
    for (let z = lo; z <= hi; z += step) {
      const t = stationAt(hull, z, (y0 + y1) / 2);
      // Not through the machinery: that space is one space from the tank top
      // to the deck over it, which is why it is the one that sinks her.
      if (li === 0 && t > -0.22 && t < 0.22) continue;
      const half = roomAt(hull, z, 0.12, y0 + 0.1, y1 - 0.1) * 0.94;
      if (half < 0.6) continue;
      box(inside, M.bulkhead, half * 2, hgt * 0.94, 0.16, 0, (y0 + y1) / 2, z);
      // A door through it, so it reads as a bulkhead and not a wall.
      box(inside, M.frame, half * 0.28, hgt * 0.6, 0.2, half * 0.4, y0 + hgt * 0.3, z);
    }
    // The centreline bulkhead, fore and aft, that the flats are either side of.
    // Stopped short of where her keel comes up to meet the counter and the
    // forefoot: run out to a fixed station it hangs below the bottom of her.
    const aft = Math.max(-0.92, reachAt(hull, y0, -1));
    const fwd = Math.min(0.92, reachAt(hull, y0, 1));
    for (const [ca, cb] of [[aft, -0.24], [0.24, fwd]]) {
      if (cb - ca < 0.08) continue;
      const za = zOf(hull, ca);
      const zb = zOf(hull, cb);
      box(inside, M.bulkhead, 0.16, hgt * 0.94, zb - za, 0, (y0 + y1) / 2, (za + zb) / 2);
    }
    // And a ladder down to the deck below, abaft the machinery.
    const zl = zOf(hull, -0.34);
    const hl = narrowest(hull, -0.34, y0, y1) * 0.5;
    const lad = new THREE.Mesh(new THREE.BoxGeometry(1.0, hgt, 0.14), M.frame);
    lad.position.set(hl, (y0 + y1) / 2, zl);
    lad.rotation.x = 0.45;
    inside.add(lad);
  }

  machinery(inside, hull, sole, machTop);
  // Magazines under where the turrets are: forward between the collision
  // bulkhead and the machinery, aft between the machinery and the steering.
  const cal = Math.min(0.42, Math.max(0.13, hull.loa / 800));
  magazine(inside, hull, 0.26, 0.54, sole, levels[0], cal);
  magazine(inside, hull, -0.56, -0.28, sole, levels[0], cal);
  steering(inside, hull, sole);
  cableLockers(inside, hull, sole);

  // Frames: the ribs she is built on, showing between the decks where the
  // plating has come off.
  const rib = Math.max(2, Math.round(hull.loa / 26));
  for (let i = 0; i <= rib; i++) {
    const t = -0.96 + (1.92 * i) / rib;
    const y0 = hull.keelY(t) + 0.25;
    const y1 = hull.sheer(t) - 0.25;
    if (y1 - y0 < 1) continue;
    for (let j = 0; j < 5; j++) {
      const ya = y0 + ((y1 - y0) * j) / 5;
      const yb = y0 + ((y1 - y0) * (j + 1)) / 5;
      // Each length of rib is drawn at the station its own height belongs to,
      // and sized to fit at every corner of itself. A frame is a plate with
      // thickness and height, so it stands at several stations at once, and
      // one fitted to the station at its middle has its corners through the
      // plating anywhere the hull is curving -- which at the ends is
      // everywhere.
      const z = hull.zAt ? hull.zAt(t, (ya + yb) / 2) : zOf(hull, t);
      const half = roomAt(hull, z, 0.16, ya, yb);
      if (half < 0.5) continue;
      for (const s of [-1, 1]) {
        // Set in far enough that the frame is behind the plating rather than
        // flush with it. Flush, the two surfaces are at the same place and
        // which one is drawn is down to the last decimal place of the depth
        // buffer -- so the frame shows through her side in patches.
        box(inside, M.frame, 0.14, yb - ya, 0.3, s * (half - 0.4), (ya + yb) / 2, z);
      }
    }
  }
  return inside;
}

/**
 * A splitter for `mergeStatic`, so a hull is welded one mesh per compartment
 * per material instead of one per material.
 *
 * It costs a handful of extra draw calls and it buys the whole of this: a
 * compartment blown out of her can have its plating taken away, and what is
 * behind the plating is the inside of the ship.
 */
export function bySection(loa) {
  const half = loa / 2;
  return (mesh, cx, cy, cz) => {
    for (let o = mesh; o; o = o.parent) {
      // Her insides are never taken away -- they are what you are meant to be
      // looking at -- so they all go in one buffer whatever compartment they
      // are in, and the split costs nothing there.
      if (o.userData && o.userData.inside) return 'in';
    }
    return `out:${sectionAt(cz / half)}`;
  };
}

/**
 * Which compartment's plating a welded mesh is, or null if it is not plating.
 *
 * This is the whole interface the renderer needs to open a ship up: hide the
 * plating of a compartment that is gone and what is behind it -- her decks,
 * her frames, her machinery -- is already there to be seen.
 */
export function meshSection(mesh) {
  const key = mesh.userData.mergeKey;
  if (!key || !key.startsWith('out:')) return null;
  return key.slice(4);
}
