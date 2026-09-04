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
  const pos = [];
  const idx = [];
  let n = 0;
  let prev = null;
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const z = hull.zAt ? hull.zAt(t, y) : (t * hull.loa) / 2;
    // Held off the shell by a fraction of the breadth rather than a fixed
    // margin, so a deck reads as a deck at any scale -- and so that looking in
    // through a hole in her side you can see the layers of her rather than one
    // solid slab with the edges of the plates flush to the plating.
    const w = hull.shellAt(t, y);
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
  const pos = [];
  const idx = [];
  let prev = null;
  let n = 0;
  for (let i = 0; i <= steps; i++) {
    const y = keel + ((yTop - keel) * i) / steps;
    const half = Math.max(0, hull.shellAt(t, y) - 0.2);
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

/** Where amidships is at a station, in metres, for placing things by eye. */
function zOf(hull, t) {
  return hull.zAt ? hull.zAt(t, 0) : (t * hull.loa) / 2;
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
  const beam = hull.shellAt(0.05, sole + 1) * 2;
  const head = Math.max(2.2, top - sole);
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
    const tail = Math.abs(zOf(hull, -0.80) - (ez0 + L + 2.2));
    tubeZ(g, M.frame, Math.max(0.16, beam * 0.022), tail,
      x, sole + 0.55, ez0 + L + 2.2 - tail / 2, 8);
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
  const half = hull.shellAt(tc, sole + 1.5);
  const head = Math.max(2, top - sole);
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
  const t = -0.86;
  const z = zOf(hull, t);
  const half = Math.max(1, hull.shellAt(t, sole + 1.5));
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
  platform(g, M.deck, hull, sole + 0.05, -1, -0.66, 0.2, 8);
}

/** Chain lockers: the cable flaked down in the eyes of her. */
function cableLockers(g, hull, sole) {
  const t = 0.80;
  const z = zOf(hull, t);
  const half = Math.max(0.6, hull.shellAt(t, sole + 2));
  for (const s of [-1, 1]) {
    const x = s * half * 0.45;
    box(g, M.frame, half * 0.5, 0.2, 3.2, x, sole + 0.3, z);
    for (let i = 0; i < 5; i++) {
      cyl(g, M.cable, half * 0.22, half * 0.22, 0.34, x, sole + 0.5 + i * 0.36, z, 8)
        .rotation.x = Math.PI / 2;
    }
  }
}

/**
 * Build the whole of the inside of a hull.
 *
 * `hull` wants `loa`, `shellAt(t, y)`, `keelY(t)`, `sheer(t)`, and optionally
 * `zAt(t, y)` if her stem and counter are raked -- which is the same interface
 * every hull in the yard already has for building her plating.
 */
export function buildInterior(g, hull) {
  const inside = new THREE.Group();
  inside.userData.inside = true;
  g.add(inside);

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
    for (let z = -hull.loa * 0.46; z <= hull.loa * 0.46; z += step) {
      const t = z / (hull.loa / 2);
      // Not through the machinery: that space is one space from the tank top
      // to the deck over it, which is why it is the one that sinks her.
      if (li === 0 && t > -0.22 && t < 0.22) continue;
      const half = hull.shellAt(t, (y0 + y1) / 2) * 0.86;
      if (half < 0.6) continue;
      box(inside, M.bulkhead, half * 2, hgt * 0.94, 0.16, 0, (y0 + y1) / 2, z);
      // A door through it, so it reads as a bulkhead and not a wall.
      box(inside, M.frame, half * 0.28, hgt * 0.6, 0.2, half * 0.4, y0 + hgt * 0.3, z);
    }
    // The centreline bulkhead, fore and aft, that the flats are either side of.
    for (const [ta, tb] of [[-0.92, -0.24], [0.24, 0.92]]) {
      const za = zOf(hull, ta);
      const zb = zOf(hull, tb);
      box(inside, M.bulkhead, 0.16, hgt * 0.94, zb - za, 0, (y0 + y1) / 2, (za + zb) / 2);
    }
    // And a ladder down to the deck below, abaft the machinery.
    const zl = zOf(hull, -0.34);
    const hl = hull.shellAt(-0.34, (y0 + y1) / 2) * 0.5;
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
    const y0 = hull.keelY(t);
    const y1 = hull.sheer(t);
    const z = zOf(hull, t);
    for (let j = 0; j < 5; j++) {
      const y = y0 + ((y1 - y0) * (j + 0.5)) / 5;
      const half = hull.shellAt(t, y);
      if (half < 0.3) continue;
      for (const s of [-1, 1]) {
        box(inside, M.frame, 0.14, (y1 - y0) / 5, 0.3, s * (half - 0.14), y, z);
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
