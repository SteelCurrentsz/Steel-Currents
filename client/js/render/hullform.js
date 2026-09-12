// A hull, built out of a table of offsets.
//
// Every ship in this game that is worth looking at is lofted rather than
// generated: her half-breadth, her keel, her sheer and her flare are written
// down station by station off her own drawing, and the plating is pulled
// through those offsets. That gets a forebody as fine as a battleship's and a
// counter that actually overhangs, neither of which any parametric curve will
// give you.
//
// Graf Spee was the first ship here built that way and every line of the
// machinery to do it lived in her file. This is that machinery, taken out and
// made to take the offsets as an argument, so a new ship is her own table of
// numbers and nothing else. What it gives back:
//
//   shellAt(t, y)   her half-breadth at a station and a height
//   zAt(t, y)       where that station actually is, once the rake of the stem
//                   and the overhang of the counter are in it
//   deckAt(z)       the height of her deck edge
//   halfDeck(z)     and how far outboard it is
//
// and four builders that use them: the shell plating in strakes, the flats
// that close her in at both ends, the weather deck, and the guardrail.
//
// Local frame, as everywhere else in the renderer: +Z is the bow, +Y is up,
// starboard is -X, and y = 0 is the waterline.

import * as THREE from '../../../vendor/three.module.js';
import { fairTable, smooth, box, cyl } from './shipkit.js';

/**
 * Make a hull form out of a set of tables.
 *
 * `half`, `keel`, `sheer` and `flare` are arrays of [station, metres] pairs,
 * station running -1 at the transom to +1 at the stem. `stem` and `counter`
 * are how far the stem rakes forward and the counter overhangs aft over the
 * whole freeboard. `deck` is how many decks of freeboard she has where the
 * forecastle is raised, if she has one at all.
 */
export function hullForm({
  loa, half, keel, sheer, flare,
  stem = 3.0, stemLo = -7.0, stemUp = 15.0, stemPow = 1.16,
  counter = 3.0, counterLo = -1.4, counterUp = 6.7, counterPow = 1.45,
  // How hard the bilge turns: the exponent the half-breadth is taken to as it
  // comes up off the keel. Lower is a rounder, fuller bilge -- a battleship;
  // higher is the hard chine of a destroyer.
  bilge = 0.34,
  stations = 112,
}) {
  const halfBeam = (t) => fairTable(half, t);
  const keelY = (t) => fairTable(keel, t);
  const sheerY = (t) => fairTable(sheer, t);
  const flareAt = (t) => fairTable(flare, t);

  /** Her half-breadth at this station and this height. */
  function shellAt(t, y) {
    const w = halfBeam(t);
    const k = keelY(t);
    const sh = sheerY(t);
    if (y <= k) return 0;
    const up = Math.min(1, Math.max(0, (y - k) / Math.max(0.6, -k + 0.5)));
    const belly = Math.pow(up, bilge);
    let hb = w * belly;
    if (y > 0) {
      const h = Math.min(1, y / Math.max(1, sh));
      hb += flareAt(t) * h * h;
    }
    return Math.max(0.03, hb);
  }

  const stemAt = (y) =>
    stem * Math.pow(Math.min(1, Math.max(0, y - stemLo) / stemUp), stemPow);
  const counterAt = (y) =>
    counter * Math.pow(Math.min(1, Math.max(0, y - counterLo) / counterUp), counterPow);

  function zAt(t, y) {
    let z = (t * loa) / 2;
    if (t > 0.46) z += smooth((t - 0.46) / 0.54) * (stemAt(y) - stem);
    else if (t < -0.80) z -= smooth((-t - 0.80) / 0.20) * (counterAt(y) - counter);
    return z;
  }

  const tOf = (z) => Math.max(-1, Math.min(1, z / (loa / 2)));
  /** Her deck edge at a station, in metres above the water. */
  const deckAt = (z) => sheerY(tOf(z)) + 0.28;
  /** And how far outboard the deck edge is there. */
  const halfDeck = (z) => shellAt(tOf(z), sheerY(tOf(z)));

  return {
    loa, stations,
    halfBeam, keelY, sheer: sheerY, flare: flareAt,
    shellAt, zAt, deckAt, halfDeck,
  };
}

/**
 * One band of shell plating, lofted between two heights the whole way round.
 *
 * Either height may be a number or a function of the station. Every band runs
 * the full length and shares its edges with its neighbours, which is what
 * keeps her watertight: a hull built as separate pieces has a seam you can see
 * daylight through wherever two of them disagree by a millimetre.
 */
export function loftBand(g, m, f, lo, hi) {
  const loAt = typeof lo === 'function' ? lo : () => lo;
  const hiAt = typeof hi === 'function' ? hi : () => hi;
  const N = f.stations;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const t = -1 + (2 * i) / N;
    const kb = f.keelY(t);
    const a = Math.max(loAt(t), kb);
    const b = Math.max(hiAt(t), kb);
    for (const [y, w] of [[a, f.shellAt(t, a)], [b, f.shellAt(t, b)]]) {
      pos.push(-w, y, f.zAt(t, y), w, y, f.zAt(t, y));
    }
  }
  for (let i = 0; i < N; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    idx.push(a, b, a + 2, a + 2, b, b + 2);
    idx.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, m));
}

/** The flat that closes her in at one end, cut to her own section there. */
export function cap(g, f, strakes, t, facing) {
  for (const [lo, hi, m] of strakes(t)) {
    if (hi - lo < 0.02) continue;
    const pos = [];
    const idx = [];
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const y = lo + ((hi - lo) * i) / N;
      const w = f.shellAt(t, y);
      pos.push(-w, y, f.zAt(t, y), w, y, f.zAt(t, y));
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      const b = (i + 1) * 2;
      if (facing > 0) idx.push(a, a + 1, b + 1, a, b + 1, b);
      else idx.push(a, b + 1, a + 1, a, b, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, m));
  }
}

/**
 * Her whole shell, in three strakes: antifouling below the waterline, the boot
 * topping at it, and painted freeboard above -- closed at both ends.
 */
export function plateHull(g, f, M, { bootLo = -2.2, bootHi = 0.55 } = {}) {
  const strakes = (t) => {
    const kb = f.keelY(t);
    return [
      [kb, Math.max(kb, bootLo), M.antifoul],
      [Math.max(kb, bootLo), Math.max(kb, bootHi), M.boot],
      [Math.max(kb, bootHi), f.sheer(t), M.hull],
    ];
  };
  loftBand(g, M.antifoul, f, (t) => f.keelY(t) - 0.02, bootLo);
  loftBand(g, M.boot, f, bootLo, bootHi);
  loftBand(g, M.hull, f, bootHi, (t) => f.sheer(t));
  cap(g, f, strakes, -1, -1);
  cap(g, f, strakes, 1, 1);
}

/**
 * The weather deck, one sheet from the stem to the transom, with the steel
 * margin plate at its edge that a rail stands on.
 *
 * Wound so her deck faces the sky. Taken the other way round it is a perfectly
 * good deck seen from underneath: it draws correctly from any camera outside
 * her, and a ray dropped on it from above goes straight through -- so nothing
 * standing on her has anything under it, and every shell that lands on her
 * deck lands in her machinery instead.
 */
export function weatherDeck(g, f, M, { margin = true } = {}) {
  const N = f.stations;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const t = -1 + (2 * i) / N;
    const y = f.sheer(t);
    const w = f.shellAt(t, y);
    const z = f.zAt(t, y);
    pos.push(-w, y, z, w, y, z);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    const b = (i + 1) * 2;
    idx.push(a, b + 1, a + 1, a, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.deck));
  if (!margin) return;
  for (let i = 0; i < N; i++) {
    const t = -1 + (2 * i) / N;
    const y = f.sheer(t);
    const w = f.shellAt(t, y);
    const z = f.zAt(t, y);
    const t2 = -1 + (2 * (i + 1)) / N;
    const z2 = f.zAt(t2, f.sheer(t2));
    const d = Math.abs(z2 - z);
    if (d < 0.05) continue;
    for (const sgn of [-1, 1]) {
      box(g, M.deckSteel, 0.55, 0.10, d, sgn * (w - 0.3), y + 0.05, (z + z2) / 2);
    }
  }
}

/**
 * The guardrail round her weather deck: three wires on stanchions, with a
 * plated bulwark forward where she needs one.
 */
export function guardRail(g, f, M, { from, to, bulwarkFrom = null, step = 2.6 } = {}) {
  const wireY = [0.42, 0.78, 1.14];
  for (let z = from; z < to; z += step) {
    const t = z / (f.loa / 2);
    const y = f.sheer(t);
    const w = f.shellAt(t, y);
    for (const sgn of [-1, 1]) {
      if (bulwarkFrom !== null && z >= bulwarkFrom) continue;
      cyl(g, M.steelDark, 0.05, 0.05, 1.2, sgn * (w - 0.18), y + 0.6, z, 5);
    }
  }
  // The wires, run as one length a side rather than stanchion to stanchion.
  const N = Math.max(4, Math.round((to - from) / 2.0));
  for (const h of wireY) {
    for (const sgn of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const z = from + ((to - from) * i) / N;
        if (bulwarkFrom !== null && z >= bulwarkFrom) continue;
        const t = z / (f.loa / 2);
        const y = f.sheer(t);
        pts.push(new THREE.Vector3(sgn * (f.shellAt(t, y) - 0.18), y + h, z));
      }
      if (pts.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, pts.length * 2, 0.035, 4, false);
      g.add(new THREE.Mesh(geo, M.steelDark));
    }
  }
  if (bulwarkFrom === null) return;
  // And the plated bulwark forward, which is what keeps the sea off a
  // forecastle rather than a wire.
  for (let z = bulwarkFrom; z < to; z += 1.4) {
    const t = z / (f.loa / 2);
    const y = f.sheer(t);
    const w = f.shellAt(t, y);
    const t2 = (z + 1.4) / (f.loa / 2);
    const w2 = f.shellAt(t2, f.sheer(t2));
    for (const sgn of [-1, 1]) {
      box(g, M.hull, 0.16, 1.25, 1.5, sgn * (w + w2) / 2, y + 0.62, z + 0.7);
    }
  }
}
