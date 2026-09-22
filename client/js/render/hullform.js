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
 * The round-up of a weather deck, on the centreline, in metres.
 *
 * `deckAt` is the crown and `deckAtX` is the deck anywhere else, so a fitting
 * out at the deck edge is set to the round of her rather than standing that
 * much clear of her planking.
 */
const CAMBER = 0.28;

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
  loa, half, keel, sheer, flare, tumble = null,
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
  // Tumblehome: how far the deck edge is pulled inboard of her waterline beam.
  // Most of these ships have none worth drawing and get none. A ship that does
  // -- a Yamato, whose maximum beam is at the water and whose upper deck is a
  // couple of metres narrower than it -- is a completely different thing in
  // section from one whose side is vertical, and looks it from any angle
  // forward of the beam: without it she is a slab with a deck on top.
  const tumbleAt = tumble ? (t) => fairTable(tumble, t) : () => 0;

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
      // The flare comes in as the square of the height, because a flared bow
      // section is a curve that starts vertical at the water and opens as it
      // rises; the tumblehome comes in straight, because a tumbled side is a
      // straight slope from the water to the deck edge.
      hb += flareAt(t) * h * h - tumbleAt(t) * h;
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
  const deckAt = (z) => sheerY(tOf(z)) + CAMBER;
  /** Her deck at a station and a distance off the centreline. */
  const deckAtX = (x, z) => {
    const t = tOf(z);
    const y = sheerY(t);
    const w = Math.max(0.3, shellAt(t, y));
    const u = Math.min(1, Math.abs(x) / w);
    return y + (1 - u * u) * CAMBER;
  };
  /** And how far outboard the deck edge is there. */
  const halfDeck = (z) => shellAt(tOf(z), sheerY(tOf(z)));

  return {
    loa, stations,
    halfBeam, keelY, sheer: sheerY, flare: flareAt,
    shellAt, zAt, deckAt, deckAtX, halfDeck,
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

/**
 * The flat that closes her in at one end, cut to her own section there.
 *
 * Cut with the same two points a strake has -- its lower edge and its upper --
 * and nothing between, because the strake is one straight sheet between those
 * and the cap has to share its edge exactly. Followed through the section in
 * finer steps it bows inboard of the sheet through the middle heights by a
 * hand's breadth, and that is a slot down the stem a ray from ahead goes
 * through.
 */
export function cap(g, f, strakes, t, facing) {
  // Subdivided across the breadth but not up it: the strake beside it is one
  // straight sheet between its two heights and the cap has to share that edge
  // exactly, while the deck that closes on top of it is cambered and the cap
  // has to follow that too. Left flat across, the top strake's cap ran a
  // quarter of a metre under the deck the whole way over, and from right
  // astern you looked straight through the slot into the ship.
  const NX = 8;
  for (const [lo, hi, m] of strakes(t)) {
    if (hi - lo < 0.02) continue;
    const pos = [];
    const idx = [];
    const N = 1;
    const crowned = Math.abs(hi - f.sheer(t)) < 1e-6;
    for (let i = 0; i <= N; i++) {
      const y = lo + ((hi - lo) * i) / N;
      const w = f.shellAt(t, y);
      const z = f.zAt(t, y);
      for (let j = 0; j <= NX; j++) {
        const u = -1 + (2 * j) / NX;
        const crown = crowned && i === N ? (1 - u * u) * CAMBER : 0;
        pos.push(u * w, y + crown, z);
      }
    }
    const per = NX + 1;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < NX; j++) {
        const a = i * per + j;
        const b = (i + 1) * per + j;
        if (facing > 0) idx.push(a, a + 1, b + 1, a, b + 1, b);
        else idx.push(a, b + 1, a + 1, a, b, b + 1);
      }
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
export function plateHull(g, f, M, {
  bootLo = -2.2, bootHi = 0.55, bands = 1, upper = 1,
} = {}) {
  // How many strakes the bottom is plated in, between the keel and the boot
  // topping. One is a single band from the keel to the waterline, and a single
  // band is a flat sheet: however round the offsets say the bilge is, the
  // plating between those two heights is a straight line in section, so her
  // whole bottom comes out as a V and everything fitted inside the turn of the
  // bilge -- armour, tanks, the shaft tunnels -- stands outside the plating
  // that is actually drawn. More strakes follow the curve, at the cost of one
  // band each, which is how a bottom is plated in any case.
  //
  // The strake heights are taken as fractions of the keel depth rather than as
  // absolute heights, so they stay parallel to the bottom as it rises at both
  // ends instead of running out through it.
  const cuts = [];
  for (let i = bands - 1; i >= 1; i--) cuts.push(i / bands);
  // And how many she is plated in above the boot topping.
  //
  // The same argument the second time, and it matters more, because above the
  // water is the part anybody looks at. A hull's section between the waterline
  // and the deck edge is a curve -- the flare opens as it rises forward, the
  // tumblehome leans in amidships -- and drawn as one band it is a straight
  // line between those two heights. Fifteen metres of freeboard as a single
  // straight sheet is what makes a lofted bow read as a slab with a point on
  // it: all the curve that is in the offsets is thrown away between the boot
  // topping and the sheer.
  //
  // The cuts are taken as fractions of the freeboard at each station rather
  // than as heights, so every seam runs parallel to the sheer the whole length
  // of her instead of climbing out through the deck edge forward.
  const ups = [];
  for (let i = 1; i < upper; i++) ups.push(i / upper);
  const upAt = (t, frac) => bootHi + (f.sheer(t) - bootHi) * frac;
  const strakes = (t) => {
    const kb = f.keelY(t);
    const out = [];
    let lo = kb;
    for (const frac of cuts) {
      const hi = Math.max(lo, Math.min(bootLo, kb * frac));
      out.push([lo, hi, M.antifoul]);
      lo = hi;
    }
    out.push([lo, Math.max(lo, bootLo), M.antifoul]);
    out.push([Math.max(kb, bootLo), Math.max(kb, bootHi), M.boot]);
    let up = Math.max(kb, bootHi);
    for (const frac of ups) {
      const hi = Math.max(up, upAt(t, frac));
      out.push([up, hi, M.hull]);
      up = hi;
    }
    out.push([up, Math.max(up, f.sheer(t)), M.hull]);
    return out;
  };
  let lo = (t) => f.keelY(t) - 0.02;
  for (const frac of cuts) {
    const hi = (t) => Math.min(bootLo, f.keelY(t) * frac);
    loftBand(g, M.antifoul, f, lo, hi);
    lo = hi;
  }
  loftBand(g, M.antifoul, f, lo, bootLo);
  loftBand(g, M.boot, f, bootLo, bootHi);
  let up = (t) => Math.max(f.keelY(t), bootHi);
  for (const frac of ups) {
    const hi = (t) => upAt(t, frac);
    loftBand(g, M.hull, f, up, hi);
    up = hi;
  }
  loftBand(g, M.hull, f, up, (t) => f.sheer(t));
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
  // Cambered, across the beam as well as along her.
  //
  // It was two vertices wide and dead flat, and `deckAt` -- which is what
  // every fitting on every one of these ships is placed by -- has always
  // returned the crown of it. So a flat deck put a quarter of a metre of air
  // under every capstan, bollard, ventilator and gun on the weather deck of
  // four ships. It is also what a deck looks like: without the round-up every
  // highlight on it runs in one unbroken line from her stem to her transom.
  const CAM = 5;
  const across = CAM * 2 + 1;
  for (let i = 0; i <= N; i++) {
    const t = -1 + (2 * i) / N;
    const y = f.sheer(t);
    const w = f.shellAt(t, y);
    const z = f.zAt(t, y);
    for (let j = 0; j < across; j++) {
      const u = (j - CAM) / CAM;
      pos.push(u * w, y + (1 - u * u) * CAMBER, z);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < across - 1; j++) {
      const a = i * across + j;
      const b = (i + 1) * across + j;
      idx.push(a, b + 1, a + 1, a, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.deck));
  if (!margin) return;
  // The margin plate runs along the deck edge, not square to the keel.
  //
  // A waterway curves in plan and both ends of it curve hard. A plate set
  // square to the centreline follows the edge amidships, hangs out over her
  // side where the edge turns in, and at the stem -- where the deck is a
  // hand's breadth across -- stands out on both sides of a hull narrower than
  // the plate is wide. So it is laid along the edge, and left off where she
  // has no waterway to drain.
  for (let i = 0; i < N; i++) {
    const t = -1 + (2 * i) / N;
    const t2 = -1 + (2 * (i + 1)) / N;
    const y = f.sheer(t);
    const y2 = f.sheer(t2);
    const w = f.shellAt(t, y);
    const w2 = f.shellAt(t2, y2);
    if (Math.min(w, w2) < 1.3) continue;
    const z = f.zAt(t, y);
    const z2 = f.zAt(t2, y2);
    for (const sgn of [-1, 1]) {
      const x0 = sgn * (w - 0.3);
      const x1 = sgn * (w2 - 0.3);
      const dx = x1 - x0;
      const dz = z2 - z;
      const len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      box(g, M.deckSteel, 0.55, 0.10, len + 0.06, (x0 + x1) / 2,
        (y + y2) / 2 + 0.05, (z + z2) / 2, Math.atan2(dx, dz));
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
  //
  // Each plate is laid along the deck edge and long enough to lap the next.
  // Set square to the centreline and cut to the station spacing they leave a
  // wedge of daylight at every seam where her plan curves -- which forward,
  // where the bulwark is and where she curves hardest, is every seam there is.
  const STEP = 1.4;
  for (let z = bulwarkFrom; z < to; z += STEP) {
    const t = z / (f.loa / 2);
    const t2 = Math.min(1, (z + STEP) / (f.loa / 2));
    const y = f.sheer(t);
    const y2 = f.sheer(t2);
    const w = f.shellAt(t, y);
    const w2 = f.shellAt(t2, y2);
    if (Math.min(w, w2) < 0.5) continue;
    for (const sgn of [-1, 1]) {
      const x0 = sgn * w;
      const x1 = sgn * w2;
      const dx = x1 - x0;
      const dz = (z + STEP) - z;
      const len = Math.hypot(dx, dz);
      box(g, M.hull, 0.16, 1.25, len + 0.12, (x0 + x1) / 2,
        (y + y2) / 2 + 0.62, z + STEP / 2, Math.atan2(dx, dz));
    }
  }
}
