// Every aeroplane in the game, and the tools they are built with.
//
// These used to live inside the Enterprise, which is where the first three were
// written. It meant the two cruiser float planes -- the Hipper's Arado and the
// Iowa's Kingfisher -- could not have any of it: they were built out of boxes
// and lofted rings in their own ships' files, with no wing section on them, no
// lofted body and no gear, and once they were in the air they were not even
// drawn as themselves. A scout was drawn as a Dauntless, because a Dauntless
// was the only thing in the air the code knew how to draw.
//
// So the toolkit is here now and all five machines are built with it:
//
//   airframe   a monocoque body lofted through its own stations
//   wing       a tapered panel with a real aerofoil section on it, painted
//              top and bottom so you can see which way up she is
//   radial     an air-cooled radial in its cowling, with the blades on it
//   greenhouse a framed hood over the cockpit
//   empennage  fin, rudder, tailplane and elevators
//   float      a seaplane float, lofted with a step in the planing bottom
//
// Metres throughout. In each machine the origin is where the tyres -- or the
// floats -- touch, and the nose points along +Z.
//
//   F4F-4 Wildcat    8.8 m long   11.6 m span, 4.4 folded   2.8 m high
//   SBD-3 Dauntless 10.1 m long   12.7 m span               4.1 m high
//   TBF-1 Avenger   12.2 m long   16.5 m span, 5.6 folded   4.7 m high
//   Ar 196A-3       11.0 m long   12.4 m span               4.4 m high
//   OS2U-3           dt10.3 m long   10.9 m span               4.6 m high

import * as THREE from '../../../vendor/three.module.js';

// ------------------------------------------------------------ primitives --

function box(g, m, w, h, d, x, y, z, ry = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.rotation.y = ry;
  g.add(o);
  return o;
}

function cyl(g, m, rt, rb, h, x, y, z, seg = 10) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  o.position.set(x, y, z);
  g.add(o);
  return o;
}

/**
 * The paint.
 *
 * Three schemes, because there are three navies flying here and they did not
 * look remotely alike: the 1942 US blue-grey over light grey, the Luftwaffe's
 * splinter greens over pale blue that the Kriegsmarine's shipboard Arados
 * wore, and the pre-war US neutrality grey the Kingfishers were still in.
 */
export const P = {
  // US Navy, 1942: blue-grey over light grey, and the line between them along
  // the widest part of the section, which is where the painters put it.
  top: new THREE.MeshLambertMaterial({ color: 0x33475e }),
  bottom: new THREE.MeshLambertMaterial({ color: 0x9aa4ad }),
  // Luftwaffe 72/73 over 65: two greens above, pale blue below.
  gerTop: new THREE.MeshLambertMaterial({ color: 0x3f4a3a }),
  gerTop2: new THREE.MeshLambertMaterial({ color: 0x4e5a44 }),
  gerBottom: new THREE.MeshLambertMaterial({ color: 0x8fa2b3 }),
  black: new THREE.MeshLambertMaterial({ color: 0x1d2126 }),
  white: new THREE.MeshLambertMaterial({ color: 0xd4d8dc }),
  // US neutrality grey: one colour all over, which is what an OS2U wore.
  grey: new THREE.MeshLambertMaterial({ color: 0x8a929b }),
  greyDark: new THREE.MeshLambertMaterial({ color: 0x767e87 }),
  yellow: new THREE.MeshLambertMaterial({ color: 0xc8a63c }),
  prop: new THREE.MeshLambertMaterial({ color: 0x24282c }),
  gunDark: new THREE.MeshLambertMaterial({ color: 0x2b323a }),
  bright: new THREE.MeshLambertMaterial({ color: 0x7f8993 }),
  glass: new THREE.MeshLambertMaterial({ color: 0x1b2229 }),
  cave: new THREE.MeshLambertMaterial({ color: 0x171c21 }),
  wire: new THREE.MeshLambertMaterial({ color: 0x232a31 }),
  star: new THREE.MeshLambertMaterial({ color: 0xd9dde2 }),
  insignia: new THREE.MeshLambertMaterial({ color: 0x1d3866 }),
  red: new THREE.MeshLambertMaterial({ color: 0xa33a30 }),
};

// The names the tools know these by. `planeTop` and `planeBottom` are the two
// that change from navy to navy, and `paint` is what changes them.
const M = {
  planeTop: P.top, planeBottom: P.bottom, prop: P.prop, gunDark: P.gunDark,
  bright: P.bright, glass: P.glass, cave: P.cave, wire: P.wire,
  star: P.star, insignia: P.insignia,
};

const SCHEMES = {
  // US Navy 1942: blue-grey over light grey.
  usn: [P.top, P.bottom],
  // Kriegsmarine shipboard: Luftwaffe splinter green over pale blue.
  luftwaffe: [P.gerTop, P.gerBottom],
  // What an OS2U was still wearing when the war started: grey all over.
  grey: [P.grey, P.greyDark],
};

/**
 * Whose paint the tools use.
 *
 * `radial`, `greenhouse` and `empennage` build a good part of an aeroplane
 * between them, and they cannot each take a palette without turning every call
 * into a paragraph. So the scheme is set once, at the top of the machine being
 * built, and the tools read it off here.
 */
function paint(scheme) {
  const [top, bottom] = SCHEMES[scheme] || SCHEMES.usn;
  M.planeTop = top;
  M.planeBottom = bottom;
  return [top, bottom];
}

/**
 * A strut between two points.
 *
 * Everything on a float plane is held on by these -- the floats to the wing,
 * the wing to the body, the tailplane to the fin -- and a strut drawn as a box
 * at a guessed angle is the thing that makes a model look like a toy. Given
 * both ends it works out its own length and lies along the line between them.
 */
function strut(p, m, a, b, r = 0.05, seg = 6) {
  const v = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = v.length();
  if (len < 0.01) return null;
  const o = cyl(p, m, r, r, len, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, seg);
  // Lay the cylinder's own +Y along the line.
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
  return o;
}

/**
 * A seaplane float.
 *
 * A float is a boat and it is built like one: a fine entrance, a hard chine
 * carrying the beam, a flat planing bottom, and -- the one thing that makes it
 * a float rather than a canoe -- a step, where the bottom breaks about
 * amidships so the water lets go of her and she can unstick. Without the step
 * a float plane sticks to the water and never gets off it, which is why every
 * one of them has one and why it is the first thing you see from alongside.
 *
 * Stations run aft to forward, each `[z, halfBeam, keel, chine, deck, crown]`:
 * the height of the keel, the height and half-breadth of the chine, the height
 * of the deck edge and how much the turtle deck stands above it.
 */
function seaFloat(p, mTop, mBot, stations) {
  const pos = [];
  const up = [];
  const low = [];
  const ring = (st) => {
    const [, hw, keel, chine, deck, crown] = st;
    const mid = (keel + chine) / 2 - (chine - keel) * 0.18;
    return [
      [0, keel], [-hw * 0.58, mid], [-hw, chine], [-hw * 0.93, deck],
      [0, deck + crown], [hw * 0.93, deck], [hw, chine], [hw * 0.58, mid],
    ];
  };
  const N = 8;
  for (const st of stations) {
    for (const [x, y] of ring(st)) pos.push(x, y, st[0]);
  }
  // Above the chine she is painted like the aeroplane; below it she is bottom
  // colour, because that is the half that lives in the water.
  const bin = (j) => (j === 2 || j === 3 || j === 4 || j === 5 ? up : low);
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N;
      const a = i * N + j;
      const d = i * N + j1;
      const b = (i + 1) * N + j;
      const c = (i + 1) * N + j1;
      bin(j).push(a, c, b, a, d, c);
    }
  }
  const cap = (i, out, list) => {
    const hub = pos.length / 3;
    const st = stations[i];
    pos.push(0, (st[2] + st[4]) / 2, st[0]);
    for (let j = 0; j < N; j++) {
      const a = i * N + j;
      const b = i * N + ((j + 1) % N);
      if (out > 0) list.push(hub, a, b); else list.push(hub, b, a);
    }
  };
  cap(0, -1, low);
  cap(stations.length - 1, 1, low);
  const skin = (list, m) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(list);
    g.computeVertexNormals();
    const o = new THREE.Mesh(g, m);
    p.add(o);
    return o;
  };
  skin(up, mTop);
  skin(low, mBot);
  // The keel strip along her bottom, which is what she is beached on.
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    strut(p, mBot, [0, a[2] - 0.02, a[0]], [0, b[2] - 0.02, b[0]], 0.045, 4);
  }
}

/**
 * The Balkenkreuz: the black cross on white that a Kriegsmarine aeroplane wore
 * on her wings and her sides. Built as five plates -- four white flanks and the
 * black cross over them -- because at any range you see one of these from it is
 * the shape and nothing else.
 */
function balkenkreuz(p, x, y, z, r, up = true) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  if (!up) m.rotation.z = Math.PI / 2;
  p.add(m);
  box(m, P.white, r * 2, 0.05, r * 2, 0, 0, 0);
  box(m, P.black, r * 2.02, 0.075, r * 0.72, 0, 0, 0);
  box(m, P.black, r * 0.72, 0.075, r * 2.02, 0, 0, 0);
}

// ------------------------------------------------------------ her aircraft --
//
// Three types, and each is built round the one thing that identifies it: a
// Wildcat's wings swing back and lie flat along its sides on the Grumman
// sto-wing; a Dauntless has the perforated split flaps above and below its
// trailing edge; an Avenger has the ball turret amidships. Everything else --
// the cowl and its gills, the exhaust stubs, the framing of the greenhouse,
// the arrestor hook, the star on its blue disc -- they share, so it is built
// once and each type says what size it wants it.
//
// Their real dimensions, because they are looked at from a metre away on a
// lift and from the hangar side openings:
//
//   F4F-4 Wildcat    8.8 m long   11.6 m span, 4.4 folded   2.8 m high
//   SBD-3 Dauntless 10.0 m long   12.7 m span, no fold      4.1 m high
//   TBF-1 Avenger   12.2 m long   16.5 m span, 5.6 folded   4.7 m high
//
// In each of these the origin is where the tyres touch the deck, and the nose
// points along +z.

/**
 * A lofted body: a rounded section carried along a set of stations.
 *
 * An aeroplane fuselage is not a brick, and built out of boxes it reads as one.
 * The player now rides one of these off the deck from two metres away, so the
 * body is lofted through its own sections the same way the ship's shell is: a
 * superelliptic ring at each station, stitched between stations, capped at both
 * ends so there is no looking straight up the inside of her.
 *
 * `stations` run from the sternpost forward, each `{ z, w, h, y }` -- the full
 * width and depth of the section there and the height of its centre.
 */
function airframe(p, m, stations, opt = {}) {
  const seg = opt.seg || 20;
  // An aeroplane is very nearly a body of revolution. She was being drawn at
  // 0.78, which is a rounded box, and it made every one of them look like a van
  // with wings; a monocoque fuselage is much closer to an ellipse than that.
  const e = opt.e === undefined ? 0.94 : opt.e;   // 1 is an ellipse, less is boxier
  const flat = opt.flat || 0;                     // flatten the underside by this much
  const pos = [];
  const idx = [];
  for (const st of stations) {
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const x = (st.w / 2) * Math.sign(c) * Math.pow(Math.abs(c), e);
      let y = (st.h / 2) * Math.sign(s) * Math.pow(Math.abs(s), e);
      if (y < 0) y *= 1 - flat;
      pos.push(x, st.y + y, st.z);
    }
  }
  // Blue-grey over light grey, and the line between them runs along the widest
  // point of the section -- which is where the painters put it. The two skins
  // share their vertices and differ only in which faces go to which material.
  const low = [];
  const half = Math.floor(seg / 2);
  const bin = (j) => (j < half ? idx : low);
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      const a = i * seg + j;
      const d = i * seg + j1;
      const b = (i + 1) * seg + j;
      const c = (i + 1) * seg + j1;
      bin(j).push(a, c, b, a, d, c);
    }
  }
  const cap = (i, out) => {
    const st = stations[i];
    const hub = pos.length / 3;
    pos.push(0, st.y, st.z + out * st.w * 0.14);
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      const a = i * seg + j;
      const b = i * seg + j1;
      if (out > 0) bin(j).push(hub, a, b);
      else bin(j).push(hub, b, a);
    }
  };
  if (opt.capA !== false) cap(0, -1);
  if (opt.capF !== false) cap(stations.length - 1, 1);
  const skin = (list, mat) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(list);
    g.computeVertexNormals();
    const o = new THREE.Mesh(g, mat);
    p.add(o);
    return o;
  };
  const top = skin(idx, m);
  skin(low, opt.mBot || m);
  return top;
}

/** Half-thickness of a symmetric section, as a fraction of the chord. */
function foil(u, t) {
  return 5 * t * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u
    + 0.2843 * u * u * u - 0.1015 * u * u * u * u);
}

/**
 * One lifting surface: a tapered panel with a real section, built as an upper
 * skin and a lower skin so the two can be painted apart -- which is the point,
 * because a 1942 aeroplane is blue-grey above and light grey below, and that is
 * what tells you which way up she is against the sea.
 *
 * `x, y, z` is the leading edge at the root; the panel is carried `span` out to
 * `side`, tapering from `rootC` to `tipC`, and the tip is rounded off.
 */
function wing(p, mTop, mBot, o) {
  const S = o.stations || 7;
  const C = o.chordwise || 14;
  const side = o.side;
  const rootC = o.rootC;
  const tipC = o.tipC === undefined ? rootC * 0.6 : o.tipC;
  const t = o.thick === undefined ? 0.115 : o.thick;
  const camber = o.camber === undefined ? 0.022 : o.camber;
  const round = o.round !== false;
  const up = [];
  const dn = [];
  for (let k = 0; k <= S; k++) {
    const f = k / S;
    // Ease the last station in so the tip is rounded off, not sheared square.
    const tipR = round ? Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (f - 0.88) / 0.12), 2))) : 1;
    const c = rootC + (tipC - rootC) * f;
    const x = o.x + side * o.span * f;
    const y = o.y + Math.sin(o.dihedral || 0) * o.span * f;
    const zle = o.z - (o.sweep || 0) * f;
    const tw = (o.twist || 0) * f;
    for (let i = 0; i <= C; i++) {
      const u = i / C;
      const ht = foil(u, t) * c * tipR;
      const yc = camber * 4 * u * (1 - u) * c;
      const lift = tw * (u - 0.25) * c;
      const z = zle - u * c;
      up.push(x, y + yc + ht + lift, z);
      dn.push(x, y + yc - ht + lift, z);
    }
  }
  const skin = (arr, mat, flip) => {
    const idx = [];
    for (let k = 0; k < S; k++) {
      for (let i = 0; i < C; i++) {
        const a = k * (C + 1) + i;
        const b = (k + 1) * (C + 1) + i;
        if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1);
        else idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    p.add(new THREE.Mesh(g, mat));
  };
  skin(up, mTop, side < 0);
  skin(dn, mBot, side > 0);
  // Tip and root, closed between the two skins.
  const shut = (k, mat, flip) => {
    const pos = [];
    for (let i = 0; i <= C; i++) {
      const a = (k * (C + 1) + i) * 3;
      pos.push(up[a], up[a + 1], up[a + 2], dn[a], dn[a + 1], dn[a + 2]);
    }
    const idx = [];
    for (let i = 0; i < C; i++) {
      const a = i * 2;
      if (flip) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    p.add(new THREE.Mesh(g, mat));
  };
  shut(S, mTop, side < 0);
  if (o.rootCap !== false) shut(0, mBot, side > 0);
}

/** A radial in its cowling: gills, cowl ring, spinner, blades, exhaust stubs. */
function radial(p, r, y, z, span, blades = 3, spin = false) {
  const SEG = 20;
  // The engine itself, seen down the throat of the cowl.
  cyl(p, M.gunDark, r * 0.84, r * 0.84, 1.0, 0, y, z - 0.2, SEG).rotation.x = Math.PI / 2;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    cyl(p, M.gunDark, 0.12, 0.12, 0.46, Math.sin(a) * r * 0.6, y + Math.cos(a) * r * 0.6,
      z + 0.08, 6).rotation.x = Math.PI / 2;
  }
  // The cowling: a ring that swells to its widest a third of the way back and
  // then fairs into the fuselage behind it, rather than the drum it was -- a
  // NACA cowl is a wing section wrapped round an engine, not a bucket.
  airframe(p, M.planeTop, [
    { z: z - 1.30, w: r * 2.04, h: r * 2.04, y },
    { z: z - 0.62, w: r * 2.10, h: r * 2.10, y },
    { z: z - 0.10, w: r * 2.06, h: r * 2.06, y },
    { z: z + 0.34, w: r * 1.86, h: r * 1.86, y },
    { z: z + 0.60, w: r * 1.52, h: r * 1.52, y },
  ], { seg: SEG, e: 1, capF: false, capA: false, mBot: M.planeTop });
  // The cowl flaps round its after lip: a short ring flared out a little from
  // the cowl, with the shadow of the gap under it. They were sixteen pale
  // cubes scattered round the circumference on a rotation that did not line
  // them up with anything, and what that looked like was a handful of gravel
  // stuck to her nose.
  airframe(p, M.planeTop, [
    { z: z - 1.42, w: r * 2.16, h: r * 2.16, y },
    { z: z - 1.24, w: r * 2.12, h: r * 2.12, y },
    { z: z - 1.16, w: r * 2.02, h: r * 2.02, y },
  ], { seg: SEG, e: 1, capF: false, capA: false, mBot: M.planeTop });
  cyl(p, M.cave, r * 1.03, r * 1.03, 0.1, 0, y, z - 1.46, SEG).rotation.x = Math.PI / 2;
  // Spinner, hub and blades. On an aeroplane that is going to run her engine
  // the blades go in a group of their own so the welder leaves them.
  const spinner = cyl(p, M.prop, 0.06, 0.30, 0.74, 0, y, z + 0.86, 14);
  spinner.rotation.x = Math.PI / 2;
  let disc = p;
  if (spin) {
    disc = new THREE.Group();
    disc.position.set(0, y, z + 1.02);
    disc.userData.dynamic = true;
    p.add(disc);
    p.userData.prop = disc;
    // Marked on the disc itself, so a copy of this model can find its own
    // propeller rather than the one still aboard. See startFlyoff.
    disc.userData.isProp = true;
  }
  for (let i = 0; i < blades; i++) {
    // A blade is not a plank: wide at the root, narrow and twisted at the tip,
    // and it is the twist that catches the light going round.
    const bl = new THREE.Group();
    bl.position.set(0, spin ? 0 : y, spin ? 0 : z + 1.02);
    bl.rotation.z = (i / blades) * Math.PI * 2 + 0.4;
    disc.add(bl);
    const N = 5;
    const L = span / 2;
    for (let k = 0; k < N; k++) {
      const f = (k + 0.5) / N;
      const seg2 = box(bl, M.prop, 0.30 - 0.19 * f, L * 0.9 / N + 0.02, 0.07,
        0, L * (0.10 + 0.9 * f), 0);
      seg2.rotation.y = 0.56 - 0.42 * f;
    }
  }
  // Exhaust stubs out of the cowl's lower flanks.
  for (const sgn of [-1, 1]) {
    cyl(p, M.gunDark, 0.09, 0.09, 0.5, sgn * r * 0.68, y - r * 0.6, z - 1.45, 6)
      .rotation.x = Math.PI / 2;
  }
}

/**
 * A greenhouse: a faired hood over the cockpit, framed, with the dark of the
 * cockpit behind the glass.
 *
 * It used to be a row of flat panes standing square on the spine like a train
 * of carriage windows, and it was the single thing that made all three of
 * these look like a box with a wing bolted on. A hood is a half-body: round
 * over the pilot's head, flat at the sill, and it dies away aft into the
 * turtledeck rather than stopping at a bulkhead.
 *
 * `w` and `h` are the width and height over the pilot, `y` the sill, and the
 * hood runs from `z0` aft to `z1` at the windscreen. `bays` is how many frames
 * are laid across it, which is what tells a Wildcat from an Avenger at a
 * glance.
 */
function greenhouse(p, w, h, y, z0, z1, bays) {
  const len = z1 - z0;
  // The hood itself. `flat: 1` squashes the underside away, so what is built
  // is the half-shell above the sill and nothing below it -- and the dark of
  // the cockpit is the same shell again, a little smaller, inside the glass.
  // It used to be a square box in there, and the corners of it stood right out
  // through the glazing: half of what read as "a box on top" was the box.
  const N = 12;
  const shell = (k) => {
    const rings = [];
    for (let i = 0; i <= N; i++) {
      const f = i / N;                               // 0 right aft, 1 at the screen
      const z = z0 + len * f;
      // Standing full height over the pilot, fairing away into the spine over
      // the last third aft and rounding down at the screen.
      const rise = Math.min(1, 0.30 + f * 1.9);
      const nose = 1 - 0.30 * Math.pow(Math.max(0, (f - 0.82) / 0.18), 2);
      rings.push({ z, w: w * rise * nose * k, h: h * 2 * rise * nose * k, y });
    }
    return rings;
  };
  airframe(p, M.cave, shell(0.9), {
    seg: 14, e: 0.86, flat: 1, capA: false, capF: false, mBot: M.cave,
  });
  airframe(p, M.glass, shell(1), {
    seg: 16, e: 0.86, flat: 1, capA: false, capF: false, mBot: M.glass,
  });
  // The frames across it: thin hoops standing a hair proud of the glass they
  // hold, built the same way the hood is so they follow its shape instead of
  // being a chain of little cubes laid over it.
  for (let i = 1; i < bays; i++) {
    const f = i / bays;
    const z = z0 + len * f;
    const rise = Math.min(1, 0.30 + f * 1.9);
    const nose = 1 - 0.30 * Math.pow(Math.max(0, (f - 0.82) / 0.18), 2);
    const bw = w * rise * nose * 1.03;
    const bh = h * 2 * rise * nose * 1.03;
    airframe(p, M.planeTop, [
      { z: z - 0.03, w: bw, h: bh, y },
      { z: z + 0.03, w: bw, h: bh, y },
    ], { seg: 16, e: 0.86, flat: 1, capA: false, capF: false, mBot: M.planeTop });
  }
  // The windscreen, raked back over the instrument panel, and its arch.
  const scr = box(p, M.glass, w * 0.9, h * 0.9, 0.09, 0, y + h * 0.48, z1 + 0.14);
  scr.rotation.x = -0.42;
  const arch = box(p, M.planeTop, w * 0.94, h * 0.95, 0.08, 0, y + h * 0.48, z1 + 0.21);
  arch.rotation.x = -0.42;
  // The rails she slides on, and the coaming round the sill.
  for (const s of [-1, 1]) box(p, M.planeTop, 0.07, 0.09, len, s * w * 0.5, y, z0 + len / 2);
  box(p, M.planeTop, w * 0.7, 0.1, 0.09, 0, y + h * 0.24, z0 + 0.05);
}

/** Fin, rudder, tailplane and elevators, lofted like the wings they are. */
function empennage(p, finH, finC, span, chord, y, z) {
  // Fin and rudder: one panel stood on edge, so the section is a real one.
  const fin = new THREE.Group();
  fin.position.set(0, y, z);
  fin.rotation.z = Math.PI / 2;
  p.add(fin);
  wing(fin, M.planeTop, M.planeTop, {
    side: 1, x: 0, y: 0, z: finC * 0.55, span: finH, rootC: finC, tipC: finC * 0.5,
    sweep: finC * 0.42, thick: 0.088, camber: 0, stations: 5, chordwise: 9,
  });
  // The rudder hinged on its trailing edge, and the tab on that.
  box(p, M.planeTop, 0.055, finH * 0.76, 0.06, 0, y + finH * 0.44, z - finC * 0.1);
  box(p, M.planeBottom, 0.13, 0.11, finC * 0.34, 0, y + finH * 0.03, z - finC * 0.44);
  for (const s of [-1, 1]) {
    wing(p, M.planeTop, M.planeBottom, {
      side: s, x: 0, y, z: z + chord * 0.5, span: span / 2, rootC: chord,
      tipC: chord * 0.62, sweep: chord * 0.22, thick: 0.095, camber: 0,
      stations: 5, chordwise: 9, rootCap: false,
    });
    // The elevator hinge line, laid into the surface it hinges on.
    box(p, M.planeTop, span / 2 - 0.16, 0.05, 0.06, s * span / 4, y + 0.055,
      z - chord * 0.18);
  }
}

/**
 * The star on its blue disc: upper surfaces of the wings and both sides of the
 * fuselage, which is where the 1942 marking went.
 *
 * The star is built out of five arms rather than drawn as a five-sided disc: a
 * pentagon at this range is a blob, and the shape is the only thing on the
 * aeroplane that says whose it is.
 */
function insignia(p, x, y, z, r, up = true) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  if (!up) m.rotation.z = Math.PI / 2;    // stand it on the fuselage side
  p.add(m);
  // Through the skin, not laid on top of it. Laid on, the star showed on one
  // face and the other face was a plain blue disc -- which on a fuselage, where
  // the marking is seen from both sides, meant every aeroplane in the game had
  // a star to port and a blue plate to starboard.
  cyl(m, M.insignia, r, r, 0.05, 0, 0, 0, 16);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.2;
    box(m, M.star, r * 0.36, 0.075, r * 0.95,
      Math.sin(a) * r * 0.42, 0, Math.cos(a) * r * 0.42, a);
  }
  cyl(m, M.star, r * 0.32, r * 0.32, 0.075, 0, 0, 0, 10);
}

/** A main leg: oleo, scissors, wheel and the door on its side. */
function mainGear(p, s, x, z, len, r, rake = 0.12) {
  const leg = new THREE.Group();
  leg.position.set(x, len, z);
  leg.rotation.z = -s * rake;
  p.add(leg);
  cyl(leg, M.planeBottom, 0.12, 0.14, len * 0.62, 0, -len * 0.3, 0, 8);
  cyl(leg, M.bright, 0.085, 0.085, len * 0.44, 0, -len * 0.72, 0, 8);
  box(leg, M.planeBottom, 0.05, len * 0.3, 0.16, s * 0.12, -len * 0.5, 0.1);
  const tyre = cyl(leg, M.prop, r, r, 0.28, s * 0.16, -len * 0.93, 0, 14);
  tyre.rotation.z = Math.PI / 2;
  cyl(leg, M.bright, r * 0.42, r * 0.42, 0.3, s * 0.16, -len * 0.93, 0, 10)
    .rotation.z = Math.PI / 2;
  box(p, M.cave, 0.5, 0.16, 0.66, x - s * 0.1, len * 0.1, z);
  return leg;
}

/** Tailwheel and the hook stowed up under the sternpost. */
function tailGear(p, z, r, hookLen, len = 0.42) {
  // The wheel and its leg in a group of their own, so they can be swung up
  // into the sternpost; the hook stays where it is, because a hook that goes
  // up with the wheel is a hook that cannot catch a wire.
  const leg = new THREE.Group();
  leg.position.set(0, r + len, z);
  p.add(leg);
  cyl(leg, M.planeBottom, 0.09, 0.11, len, 0, -len * 0.52, 0, 8);
  cyl(leg, M.prop, r, r, 0.16, 0, -len, 0, 10).rotation.z = Math.PI / 2;
  const hook = box(p, M.gunDark, 0.09, 0.09, hookLen, 0, r + 0.75, z - hookLen * 0.42);
  hook.rotation.x = -0.34;
  box(p, M.gunDark, 0.2, 0.16, 0.3, 0, r + 0.4, z - hookLen * 0.86);
  return leg;
}

/**
 * A panel folded on the Grumman sto-wing.
 *
 * The hinge is skewed, so the panel does two things at once: it stands up on
 * edge with its leading edge down, and it swings aft until it lies fore and aft
 * alongside the fuselage. Both come out of the same pair of right angles -- the
 * span turned aft, the chord turned up -- with a little skew on top so the tips
 * ride up as they go back, which is what it looks like on a deck.
 */
function foldWing(p, s, o) {
  const hinge = new THREE.Group();
  hinge.position.set(o.at[0], o.at[1], o.at[2]);
  hinge.rotation.x = o.skew || 0;          // tips carried up as they go aft
  hinge.rotation.z = s * (o.lean || 0);
  p.add(hinge);
  const w = new THREE.Group();
  w.rotation.order = 'ZYX';
  w.rotation.y = s * Math.PI / 2;          // the span swung aft
  w.rotation.z = -s * Math.PI / 2;         // the chord stood on end, LE down
  hinge.add(w);
  wing(w, M.planeTop, M.planeBottom, {
    side: s, x: 0, y: 0, z: 0, span: o.span, rootC: o.rootC, tipC: o.tipC,
    sweep: o.sweep, thick: o.thick, camber: 0.02, twist: -0.02,
  });
  // The guns in the leading edge, which folded is the bottom edge.
  for (const [gx, gy] of o.guns || []) {
    box(w, M.gunDark, 0.22, 0.22, 0.24, s * gx, gy, -0.16);
  }
  // The star, on what is now the outboard face of her.
  insignia(w, s * o.span * 0.54, 0.16, -o.rootC * 0.5, o.star);
  return w;
}

// A carrier aeroplane stands on her tail: nose up, so the wing is at an angle
// of attack while she is still on the deck and she flies herself off it. That
// is done here by carrying the centreline up as it goes forward -- the frames
// stay upright, which is what they are, and the gear stays where it belongs:
// a long main leg forward and a stub wheel under the sternpost.
const sitline = (f, k) => (z) => f + k * z;

/**
 * An F4F-4 Wildcat. Folded by default, because that is how she is struck below.
 *
 * The signature matches the other two: `folded` says which set of wings is
 * showing, and `opts` carries the rest of her trim.
 */
function wildcat(g, x, y, z, ry, folded = true, opts = {}) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  const cl = sitline(1.36, 0.15);
  // The barrel body: deepest at the wing, tapering hard to a slender sternpost.
  airframe(p, M.planeTop, [
    { z: -4.05, w: 0.18, h: 0.58, y: cl(-4.05) + 0.35 },
    { z: -3.50, w: 0.42, h: 0.86, y: cl(-3.50) + 0.27 },
    { z: -2.80, w: 0.66, h: 1.12, y: cl(-2.80) + 0.18 },
    { z: -2.00, w: 0.86, h: 1.36, y: cl(-2.00) + 0.11 },
    { z: -1.10, w: 1.04, h: 1.56, y: cl(-1.10) + 0.05 },
    { z: -0.20, w: 1.18, h: 1.72, y: cl(-0.20) + 0.01 },
    { z: 0.60, w: 1.24, h: 1.80, y: cl(0.60) },
    { z: 1.40, w: 1.24, h: 1.80, y: cl(1.40) },
    { z: 2.20, w: 1.18, h: 1.70, y: cl(2.20) + 0.02 },
    { z: 2.90, w: 1.08, h: 1.52, y: cl(2.90) + 0.05 },
    { z: 3.55, w: 0.94, h: 1.30, y: cl(3.55) + 0.08 },
  ], { flat: 0.10, e: 0.95, mBot: M.planeBottom });
  radial(p, 0.8, cl(3.9) + 0.08, 3.85, 3.0);
  greenhouse(p, 0.96, 0.64, cl(1.0) + 0.86, 0.05, 1.65, 3);
  // The turtledeck aft of the hood, running down to the fin.
  airframe(p, M.planeTop, [
    { z: -3.60, w: 0.30, h: 0.30, y: cl(-3.60) + 0.42 },
    { z: -2.20, w: 0.62, h: 0.52, y: cl(-2.20) + 0.52 },
    { z: -0.90, w: 0.82, h: 0.66, y: cl(-0.90) + 0.62 },
    { z: 0.00, w: 0.90, h: 0.70, y: cl(0.00) + 0.66 },
  ], { flat: 0.3, e: 0.96, capF: false, mBot: M.planeTop });
  // The sto-wing: the panels pivot on a skewed hinge at the root, stand up on
  // edge with the leading edge down, and swing aft to lie fore and aft along
  // her sides. It is why twice as many of them fitted below as of anything
  // else, and the aeroplane ends up no wider than her own tailplane.
  //
  // Both sets are built and one of them is shown, the same way the Avenger
  // does it. She used to be built folded and only folded, which is why every
  // Wildcat in the air had no wings on her.
  const stowed = new THREE.Group();
  const spread = new THREE.Group();
  p.add(stowed);
  p.add(spread);
  for (const s of [-1, 1]) {
    foldWing(stowed, s, {
      at: [s * 0.62, cl(1.05) - 0.74, 1.6], skew: 0.10, lean: 0.05,
      span: 4.15, rootC: 1.80, tipC: 1.26, sweep: 0.30, thick: 0.112,
      star: 0.56, guns: [[0.9, 0.14], [2.0, 0.11]],
    });
    // Spread: the same panel, straight out off the same hinge, with a little
    // dihedral on it.
    const w = new THREE.Group();
    w.position.set(s * 0.66, cl(1.05) - 0.30, 1.45);
    w.rotation.z = -s * 0.05;
    spread.add(w);
    wing(w, M.planeTop, M.planeBottom, {
      side: s, x: 0, y: 0, z: 0, span: 4.98, rootC: 1.80, tipC: 1.26,
      sweep: 0.30, thick: 0.112, camber: 0.022, twist: -0.02, rootCap: false,
    });
    box(w, M.planeTop, 1.5, 0.10, 0.44, s * 3.6, 0.05, -0.72);       // aileron
    box(w, M.planeTop, 1.7, 0.11, 0.56, s * 1.5, 0.02, -0.86);       // flap
    // Her fifties: the muzzles standing out of the leading edge, and the
    // blister over each breech. They used to be a pair of cubes hung two
    // thirds of a metre ahead of the wing, in the air on their own.
    for (const gx of [1.3, 2.3]) {
      cyl(w, M.gunDark, 0.05, 0.05, 0.42, s * gx, 0.035, 0.12, 6)
        .rotation.x = Math.PI / 2;
      box(w, M.planeTop, 0.34, 0.13, 0.62, s * gx, 0.03, -0.24);
    }
    insignia(w, s * 2.7, 0.14, -0.42, 0.56);
    // The root fillet: the wing does not meet the body at a step.
    box(w, M.planeTop, 0.5, 0.30, 1.55, s * 0.16, 0.05, -0.72);
  }
  stowed.visible = !!folded;
  spread.visible = !folded;
  p.userData.wings = { stowed, spread };
  // The stub the panels fold off, which is there whichever way they are set,
  // and the hinge fairing, which is only a thing to look at when they are
  // folded back along her: spread, it stood out at the root as a pale slab
  // half a metre thick on top of a wing.
  for (const s of [-1, 1]) {
    box(p, M.planeTop, 0.56, 0.78, 1.5, s * 0.68, cl(1.1) - 0.14, 1.25);
    const hinge = box(stowed, M.planeBottom, 0.86, 0.34, 1.0,
      s * 0.98, cl(1.1) - 0.12, 1.3);
    hinge.rotation.z = s * 0.22;
  }
  insignia(p, 0.40, cl(-1.5) + 0.08, -1.5, 0.38, false);
  insignia(p, -0.40, cl(-1.5) + 0.08, -1.5, 0.38, false);
  empennage(p, 1.34, 1.16, 3.75, 0.92, cl(-3.5) + 0.34, -3.3);
  // Her narrow-track gear cranks up into the fuselage sides, so it stands close
  // in under her and the wheels are half buried when it is down.
  if (opts.gear !== false) {
    for (const s of [-1, 1]) mainGear(p, s, s * 0.72, 1.5, 1.02, 0.34, 0.02);
    tailGear(p, -3.85, 0.17, 1.0, 0.3);
  }
  // Aerial mast and the wire back to the fin.
  box(p, M.planeTop, 0.07, 0.62, 0.07, 0, cl(0.5) + 1.32, 0.5);
  const wire = box(p, M.wire, 0.03, 0.03, 3.9, 0, cl(-1.4) + 1.28, -1.4);
  wire.rotation.x = -0.2;
  return p;
}

/** An SBD Dauntless: the perforated dive flaps are the whole point of her. */
function dauntless(g, x, y, z, ry, folded = false, opts = {}) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  const cl = sitline(1.44, 0.13);
  airframe(p, M.planeTop, [
    { z: -4.85, w: 0.18, h: 0.56, y: cl(-4.85) + 0.37 },
    { z: -4.20, w: 0.38, h: 0.82, y: cl(-4.20) + 0.29 },
    { z: -3.40, w: 0.58, h: 1.04, y: cl(-3.40) + 0.20 },
    { z: -2.40, w: 0.76, h: 1.22, y: cl(-2.40) + 0.13 },
    { z: -1.30, w: 0.92, h: 1.40, y: cl(-1.30) + 0.06 },
    { z: -0.20, w: 1.02, h: 1.52, y: cl(-0.20) + 0.01 },
    { z: 0.90, w: 1.08, h: 1.58, y: cl(0.90) },
    { z: 2.00, w: 1.06, h: 1.54, y: cl(2.00) + 0.01 },
    { z: 3.00, w: 0.98, h: 1.40, y: cl(3.00) + 0.04 },
    { z: 3.80, w: 0.88, h: 1.24, y: cl(3.80) + 0.07 },
  ], { flat: 0.08, e: 0.95, mBot: M.planeBottom });
  radial(p, 0.72, cl(4.0) + 0.06, 3.95, 3.2);
  // The greenhouse: pilot forward, gunner aft under a long open hood.
  greenhouse(p, 0.92, 0.70, cl(0.9) + 0.76, -1.0, 2.05, 4);
  box(p, M.cave, 0.84, 0.5, 1.4, 0, cl(-1.6) + 0.92, -1.7);
  // His twin thirties on their ring, and the ring itself.
  cyl(p, M.planeTop, 0.46, 0.48, 0.14, 0, cl(-2.0) + 0.98, -2.0, 14);
  for (const s of [-1, 1]) {
    const gun = cyl(p, M.gunDark, 0.055, 0.055, 1.5, s * 0.16, cl(-2.1) + 1.22, -2.1, 6);
    gun.rotation.x = -0.5;
  }
  box(p, M.gunDark, 0.5, 0.12, 0.4, 0, cl(-1.9) + 1.04, -1.9);
  // Wings: a flat centre section with dihedral outboard of it, the ailerons,
  // and the split flaps -- perforated above and below -- that are her mark.
  const WY = cl(0.9) - 0.52;
  for (const s of [-1, 1]) {
    wing(p, M.planeTop, M.planeBottom, {
      side: s, x: 0, y: WY, z: 1.9, span: 1.9, rootC: 2.35, tipC: 2.20,
      sweep: 0.06, thick: 0.118, camber: 0.024, stations: 3, round: false,
      rootCap: false,
    });
    const w = new THREE.Group();
    w.position.set(s * 1.9, WY, 0);
    w.rotation.z = -s * 0.175;
    p.add(w);
    wing(w, M.planeTop, M.planeBottom, {
      side: s, x: 0, y: 0, z: 1.84, span: 4.35, rootC: 2.20, tipC: 1.18,
      sweep: 0.62, thick: 0.112, camber: 0.024, twist: -0.03, rootCap: false,
    });
    box(w, M.planeTop, 1.66, 0.11, 0.5, s * 3.5, 0.06, -0.28);         // aileron
    box(w, M.gunDark, 1.5, 0.09, 0.14, s * 3.5, 0.02, 1.66);           // leading-edge slot
    // The split flaps, closed: two thin perforated panels lying along the
    // trailing edge, upper and lower, not the pair of shelves standing off it
    // they were. Open, they are the whole reason an SBD can put a bomb where
    // she puts one; closed, they should hardly show.
    for (const dy of [0.075, -0.075]) {
      box(w, M.gunDark, 4.0, 0.05, 0.42, s * 2.1, dy, -0.34);
      for (let i = 0; i < 9; i++) {
        cyl(w, M.cave, 0.055, 0.055, 0.07, s * (0.45 + i * 0.4), dy, -0.34, 6);
      }
    }
    insignia(w, s * 2.5, 0.16, 0.55, 0.62);
    // Her two thirties in the wing roots, and the pitot under the port panel.
    box(w, M.gunDark, 0.18, 0.18, 0.2, s * 0.5, -0.1, 1.82);
  }
  insignia(p, 0.35, cl(-2.3) + 0.11, -2.3, 0.34, false);
  insignia(p, -0.35, cl(-2.3) + 0.11, -2.3, 0.34, false);
  empennage(p, 1.5, 1.32, 3.9, 1.02, cl(-4.3) + 0.4, -4.0);
  // The crutch that swung her bomb clear of the propeller, and the bomb on it.
  const cr = box(p, M.gunDark, 0.14, 0.55, 1.5, 0, cl(1.2) - 1.05, 1.3);
  cr.rotation.x = 0.1;
  cyl(p, M.gunDark, 0.17, 0.17, 1.7, 0, cl(1.0) - 1.35, 1.2, 10).rotation.x = Math.PI / 2;
  cyl(p, M.gunDark, 0.17, 0.02, 0.5, 0, cl(1.9) - 1.35, 2.2, 10).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    box(p, M.gunDark, 0.02, 0.3, 0.3, s * 0.1, cl(0.3) - 1.35, 0.45);
  }
  if (opts.gear !== false) {
    for (const s of [-1, 1]) mainGear(p, s, s * 1.5, 1.7, 1.06, 0.4);
    tailGear(p, -4.45, 0.19, 1.2, 0.34);
  }
  box(p, M.planeTop, 0.07, 0.7, 0.07, 0, cl(0.6) + 1.4, 0.6);
  const wire = box(p, M.wire, 0.03, 0.03, 4.6, 0, cl(-1.8) + 1.4, -1.8);
  wire.rotation.x = -0.16;
  if (folded) p.scale.set(0.995, 1, 1);
  return p;
}

/** A TBF-1 Avenger: the ball turret is what names her at any range. */
function avenger(g, x, y, z, ry, folded = true, spin = false, opts = {}) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  const cl = sitline(1.74, 0.12);
  // A deep body with the bomb bay in the belly of it -- she is a big aeroplane,
  // and the whole middle of her is the space a torpedo goes in.
  airframe(p, M.planeTop, [
    { z: -5.90, w: 0.20, h: 0.66, y: cl(-5.90) + 0.44 },
    { z: -5.20, w: 0.40, h: 0.92, y: cl(-5.20) + 0.36 },
    { z: -4.40, w: 0.64, h: 1.18, y: cl(-4.40) + 0.27 },
    { z: -3.40, w: 0.92, h: 1.50, y: cl(-3.40) + 0.17 },
    { z: -2.40, w: 1.12, h: 1.72, y: cl(-2.40) + 0.10 },
    { z: -1.20, w: 1.28, h: 1.92, y: cl(-1.20) + 0.05 },
    { z: 0.10, w: 1.38, h: 2.06, y: cl(0.10) },
    { z: 1.40, w: 1.40, h: 2.10, y: cl(1.40) },
    { z: 2.60, w: 1.36, h: 2.02, y: cl(2.60) + 0.02 },
    { z: 3.60, w: 1.26, h: 1.86, y: cl(3.60) + 0.05 },
    { z: 4.40, w: 1.14, h: 1.66, y: cl(4.40) + 0.08 },
    { z: 4.95, w: 1.02, h: 1.48, y: cl(4.95) + 0.11 },
  ], { flat: 0.06, e: 0.95, mBot: M.planeBottom });
  radial(p, 0.95, cl(5.2) + 0.1, 5.1, 3.9, 3, spin);
  // The bay, its doors, and the fish inside them.
  for (const s of [-1, 1]) {
    box(p, M.planeBottom, 0.1, 0.34, 4.3, s * 0.5, cl(1.2) - 1.02, 1.2);
  }
  box(p, M.cave, 0.86, 0.16, 4.1, 0, cl(1.2) - 1.1, 1.2);
  // The fish itself, up in the bay where she carries it.
  cyl(p, M.steelDark, 0.26, 0.26, 4.0, 0, cl(1.1) - 0.96, 1.1, 12).rotation.x = Math.PI / 2;
  cyl(p, M.steelDark, 0.26, 0.06, 0.8, 0, cl(3.2) - 0.96, 3.3, 12).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    box(p, M.steelDark, 0.03, 0.46, 0.46, s * 0.15, cl(-0.9) - 0.96, -0.9);
    box(p, M.steelDark, 0.46, 0.03, 0.46, 0, cl(-0.9) - 0.96 + s * 0.23, -0.9);
  }
  greenhouse(p, 1.14, 0.80, cl(2.3) + 1.0, 1.05, 3.55, 4);
  // The turret: a glazed ball on its ring with the fifty out of the side.
  cyl(p, M.planeTop, 0.72, 0.74, 0.3, 0, cl(-0.5) + 0.96, -0.5, 14);
  cyl(p, M.glass, 0.66, 0.68, 0.9, 0, cl(-0.5) + 1.5, -0.5, 14);
  cyl(p, M.planeTop, 0.62, 0.42, 0.34, 0, cl(-0.5) + 2.02, -0.5, 14);
  // The frames of it, which are what you actually see of a turret at range.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    box(p, M.planeTop, 0.07, 0.94, 0.07, Math.sin(a) * 0.66, cl(-0.5) + 1.5,
      -0.5 + Math.cos(a) * 0.66, a);
    box(p, M.planeTop, 0.07, 0.94, 0.07, -Math.sin(a) * 0.66, cl(-0.5) + 1.5,
      -0.5 - Math.cos(a) * 0.66, a);
  }
  cyl(p, M.planeTop, 0.68, 0.68, 0.07, 0, cl(-0.5) + 1.94, -0.5, 14);
  const fifty = cyl(p, M.gunDark, 0.06, 0.06, 1.5, 0.3, cl(-0.4) + 1.6, 0.1, 6);
  fifty.rotation.x = -0.35;
  // The spine aft of her, and the tunnel gun under the tail.
  airframe(p, M.planeTop, [
    { z: -4.60, w: 0.30, h: 0.30, y: cl(-4.60) + 0.5 },
    { z: -3.20, w: 0.60, h: 0.52, y: cl(-3.20) + 0.62 },
    { z: -1.60, w: 0.76, h: 0.66, y: cl(-1.60) + 0.72 },
    { z: -0.90, w: 0.80, h: 0.70, y: cl(-0.90) + 0.74 },
  ], { flat: 0.3, e: 0.96, capF: false, mBot: M.planeTop });
  box(p, M.cave, 0.4, 0.1, 0.7, 0, cl(-3.0) - 0.68, -3.0);
  const tunnel = cyl(p, M.gunDark, 0.05, 0.05, 0.9, 0, cl(-3.0) - 0.6, -3.05, 6);
  tunnel.rotation.x = 0.5;
  // The same sto-wing as the Wildcat's, on a wing half as big again -- and
  // both states of it are built, because an aeroplane spreads her wings before
  // she runs and folds them again when she is struck below. Which pair is
  // showing is a matter of which group is visible, so the evolution can spread
  // them at the right moment instead of her taking off folded.
  const WY = cl(1.5) - 0.82;
  const stowed = new THREE.Group();
  const spread = new THREE.Group();
  p.add(stowed);
  p.add(spread);
  for (const s of [-1, 1]) {
    // The centre section stays put whether she is folded or spread.
    wing(p, M.planeTop, M.planeBottom, {
      side: s, x: 0, y: WY, z: 2.9, span: 0.95, rootC: 3.0, tipC: 2.9,
      sweep: 0.04, thick: 0.118, stations: 2, round: false, rootCap: false,
    });
    foldWing(stowed, s, {
      at: [s * 0.92, WY - 0.72, 2.8], skew: 0.09, lean: 0.05,
      span: 6.0, rootC: 2.9, tipC: 1.5, sweep: 0.85, thick: 0.112, star: 0.72,
      guns: [[2.0, 0.12]],
    });
    const w = new THREE.Group();
    w.position.set(s * 0.95, WY, 2.9);
    w.rotation.z = -s * 0.06;
    spread.add(w);
    wing(w, M.planeTop, M.planeBottom, {
      side: s, x: 0, y: 0, z: 0, span: 7.25, rootC: 2.9, tipC: 1.5,
      sweep: 0.85, thick: 0.112, camber: 0.024, twist: -0.03, rootCap: false,
    });
    box(w, M.planeTop, 2.1, 0.11, 0.62, s * 5.2, 0.06, -1.9);        // aileron
    box(w, M.planeTop, 2.9, 0.12, 0.8, s * 1.9, 0.02, -2.3);         // flap
    box(w, M.gunDark, 0.22, 0.22, 0.24, s * 1.5, 0.1, 0.04);         // wing fifty
    insignia(w, s * 4.0, 0.16, -0.6, 0.72);
  }
  stowed.visible = folded;
  spread.visible = !folded;
  p.userData.wings = { stowed, spread };
  insignia(p, 0.48, cl(-2.6) + 0.10, -2.6, 0.46, false);
  insignia(p, -0.48, cl(-2.6) + 0.10, -2.6, 0.46, false);
  empennage(p, 2.05, 1.7, 5.8, 1.3, cl(-5.2) + 0.46, -4.8);
  const legs = opts.gear === false ? []
    : [-1, 1].map((s) => ({ s, g: mainGear(p, s, s * 1.55, 2.3, 1.3, 0.46) }));
  const tailLeg = opts.gear === false ? null : tailGear(p, -5.5, 0.21, 1.1, 0.36);
  const down = legs.map((l) => l.g.rotation.z);
  // 0 is down and locked, 1 is up and the doors shut behind her.
  p.userData.gear = (u) => {
    const k = Math.max(0, Math.min(1, u));
    const e = k * k * (3 - 2 * k);
    legs.forEach((l, i) => { l.g.rotation.z = down[i] + l.s * 1.5 * e; });
    tailLeg.rotation.x = 1.6 * e;
  };
  box(p, M.planeTop, 0.08, 0.8, 0.08, 0, cl(1.4) + 1.9, 1.4);
  const wire = box(p, M.wire, 0.03, 0.03, 5.4, 0, cl(-1.6) + 1.86, -1.6);
  wire.rotation.x = -0.14;
  return p;
}
/**
 * An Arado 196 A-3: the Kriegsmarine's shipboard scout, and the one the
 * Hipper shot off her catapult.
 *
 * A low-wing all-metal monoplane on two big floats, with a BMW 132 radial in
 * front of a greenhouse long enough for two men in tandem. She was much the
 * best of the shipboard float planes -- fast enough to be worth having and
 * armed well enough that a pair of them took a submarine's surrender -- and
 * the shape of her is the two floats and the long hood.
 *
 * `folded` swings the wings back along her sides, which is how she is struck
 * into a hangar; `opts.floats: false` leaves them off.
 */
function arado(g, x, y, z, ry, folded = false, opts = {}) {
  const [TOP, BOT] = paint('luftwaffe');
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  // The thrust line, carried a little up as it goes forward: she sits nose-up
  // on her floats the way a tail-sitter does on her wheels.
  const cl = (zz) => 2.24 + 0.055 * zz;

  // -- the body -------------------------------------------------------------
  // Slab-sided and slim: an Arado is a long fine fuselage with the whole of
  // her middle glazed over.
  airframe(p, TOP, [
    { z: -5.30, w: 0.16, h: 0.52, y: cl(-5.30) + 0.30 },
    { z: -4.60, w: 0.40, h: 0.80, y: cl(-4.60) + 0.24 },
    { z: -3.70, w: 0.62, h: 1.02, y: cl(-3.70) + 0.16 },
    { z: -2.60, w: 0.82, h: 1.22, y: cl(-2.60) + 0.09 },
    { z: -1.40, w: 0.96, h: 1.34, y: cl(-1.40) + 0.03 },
    { z: -0.20, w: 1.04, h: 1.40, y: cl(-0.20) },
    { z: 1.00, w: 1.06, h: 1.42, y: cl(1.00) },
    { z: 2.10, w: 1.04, h: 1.40, y: cl(2.10) + 0.01 },
    { z: 3.00, w: 0.98, h: 1.34, y: cl(3.00) + 0.03 },
    { z: 3.70, w: 0.90, h: 1.24, y: cl(3.70) + 0.05 },
  ], { flat: 0.12, e: 0.92, mBot: BOT });
  radial(p, 0.74, cl(4.05) + 0.05, 4.00, 3.30, 3, !!opts.spin);
  // The exhaust collector ring and its stubs down her port side, which is the
  // one thing that breaks a clean cowling.
  for (let i = 0; i < 5; i++) {
    const st = box(p, P.gunDark, 0.10, 0.10, 0.34, -0.62, cl(3.5) + 0.10 - i * 0.05,
      3.45 - i * 0.16);
    st.rotation.y = -0.22;
  }
  // The hood: two men in tandem under a long framed greenhouse that runs from
  // the wing right back to the fin fairing.
  greenhouse(p, 0.92, 0.60, cl(0.6) + 0.70, -2.30, 2.30, 5);
  // The rear gun on its ring, which is what the observer had.
  const ringY = cl(-1.6) + 1.32;
  cyl(p, P.gunDark, 0.44, 0.44, 0.07, 0, ringY, -1.70, 14);
  const mg = cyl(p, P.gunDark, 0.045, 0.045, 1.10, 0.10, ringY + 0.26, -2.05, 6);
  mg.rotation.x = -1.25;
  box(p, P.gunDark, 0.10, 0.22, 0.24, 0.10, ringY + 0.20, -1.62);
  // The turtledeck behind the hood, running down into the fin.
  airframe(p, TOP, [
    { z: -4.80, w: 0.24, h: 0.26, y: cl(-4.80) + 0.36 },
    { z: -3.40, w: 0.52, h: 0.44, y: cl(-3.40) + 0.46 },
    { z: -2.40, w: 0.68, h: 0.54, y: cl(-2.40) + 0.52 },
  ], { flat: 0.3, e: 0.94, capF: false, mBot: TOP });

  // -- the wings ------------------------------------------------------------
  // She folds them back along her sides to go into a hangar, so both sets are
  // built and one of them is shown.
  const stowed = new THREE.Group();
  const spread = new THREE.Group();
  p.add(stowed);
  p.add(spread);
  const ROOT = [0.52, cl(0.4) - 0.52, 0.85];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * ROOT[0], ROOT[1], ROOT[2]);
    w.rotation.z = -s * 0.055;                       // a little dihedral
    spread.add(w);
    wing(w, TOP, BOT, {
      side: s, x: 0, y: 0, z: 0, span: 5.70, rootC: 2.30, tipC: 1.30,
      sweep: 0.34, thick: 0.125, camber: 0.024, twist: -0.025, rootCap: false,
    });
    box(w, TOP, 1.90, 0.10, 0.46, s * 4.10, 0.03, -0.92);      // aileron
    box(w, TOP, 2.00, 0.11, 0.60, s * 1.70, 0.00, -1.06);      // flap
    // Her 20 mm in the leading edge, and the blister over the drum behind it.
    cyl(w, P.gunDark, 0.055, 0.055, 0.62, s * 2.05, 0.03, 0.16, 6)
      .rotation.x = Math.PI / 2;
    box(w, TOP, 0.36, 0.16, 0.72, s * 2.05, 0.02, -0.28);
    // The bomb rack under her, and the fifty kilos on it.
    box(w, P.gunDark, 0.24, 0.16, 0.50, s * 2.60, -0.14, -0.20);
    cyl(w, P.gunDark, 0.16, 0.16, 0.90, s * 2.60, -0.32, -0.20, 10)
      .rotation.x = Math.PI / 2;
    balkenkreuz(w, s * 3.30, 0.13, -0.62, 0.52);
    // The root fillet, so the wing does not meet the body at a step.
    box(w, TOP, 0.42, 0.30, 1.90, s * 0.14, 0.03, -0.90);
    // Folded: the same panel swung aft about the root, lying along her side.
    const f = new THREE.Group();
    f.position.set(s * ROOT[0], ROOT[1] + 0.28, ROOT[2]);
    f.rotation.y = s * 1.46;
    f.rotation.z = -s * 0.08;
    stowed.add(f);
    wing(f, TOP, BOT, {
      side: s, x: 0, y: 0, z: 0, span: 5.70, rootC: 2.30, tipC: 1.30,
      sweep: 0.34, thick: 0.125, camber: 0.024, twist: -0.025, rootCap: false,
    });
  }
  stowed.visible = !!folded;
  spread.visible = !folded;
  p.userData.wings = { stowed, spread };
  balkenkreuz(p, 0.52, cl(-2.7) + 0.06, -2.70, 0.30, false);
  balkenkreuz(p, -0.52, cl(-2.7) + 0.06, -2.70, 0.30, false);
  empennage(p, 1.42, 1.26, 4.00, 1.00, cl(-4.6) + 0.30, -4.30);
  // The tailplane struts, which she has and a carrier fighter does not.
  for (const s of [-1, 1]) {
    strut(p, TOP, [s * 0.22, cl(-4.4) - 0.10, -4.10],
      [s * 1.30, cl(-4.6) + 0.28, -4.30], 0.045);
  }

  // -- the floats -----------------------------------------------------------
  if (opts.floats !== false) {
    const STATIONS = [
      [-3.45, 0.14, 0.70, 0.78, 0.92, 0.03],
      [-2.40, 0.36, 0.44, 0.58, 0.88, 0.05],
      [-1.20, 0.46, 0.26, 0.44, 0.86, 0.06],
      [-0.22, 0.49, 0.20, 0.40, 0.86, 0.06],
      [-0.20, 0.49, 0.00, 0.36, 0.86, 0.06],
      [0.90, 0.49, 0.02, 0.36, 0.88, 0.06],
      [2.00, 0.43, 0.14, 0.42, 0.90, 0.06],
      [2.90, 0.28, 0.34, 0.56, 0.92, 0.05],
      [3.55, 0.07, 0.62, 0.72, 0.94, 0.03],
    ];
    for (const s of [-1, 1]) {
      const fl = new THREE.Group();
      fl.position.set(s * 1.66, 0, 0.30);
      p.add(fl);
      seaFloat(fl, TOP, BOT, STATIONS);
      // The mooring bollard and the step on her deck.
      cyl(fl, P.gunDark, 0.05, 0.06, 0.16, 0, 1.02, 2.55, 8);
      box(fl, P.gunDark, 0.30, 0.04, 0.22, 0, 0.96, -1.60);
      // The rudder on her sternpost: a float plane steers on the water.
      const rud = box(fl, BOT, 0.05, 0.34, 0.40, 0, 0.52, -3.30);
      rud.rotation.x = 0.12;
      // Struts up to the body and out to the wing: an N each side, braced
      // fore and aft, which is the whole of how a float is hung on.
      const top = (zz) => [s * 0.42, cl(zz) - 0.62, zz];
      const wingAt = (zz) => [s * 1.75, ROOT[1] - 0.05, zz];
      strut(p, TOP, [s * 1.66, 0.86, 1.60], top(1.30), 0.065);
      strut(p, TOP, [s * 1.66, 0.86, -0.60], top(-0.90), 0.065);
      strut(p, TOP, [s * 1.66, 0.86, 1.60], wingAt(1.15), 0.055);
      strut(p, TOP, [s * 1.66, 0.86, -0.60], wingAt(-0.55), 0.055);
      // And the cross-brace between them, which is what stops the pair
      // walking fore and aft.
      strut(p, TOP, [s * 1.66, 0.90, 1.40], [s * 1.66, 1.34, -0.40], 0.04);
      // The catapult spool under her, which is what the trolley picks her up
      // by and the one fitting that says she is a shipboard aeroplane.
      cyl(fl, P.gunDark, 0.08, 0.08, 0.26, 0, 0.10, 0.40, 8)
        .rotation.z = Math.PI / 2;
    }
    // The spreader between the two floats, under the body.
    strut(p, TOP, [-1.66, 0.90, 0.60], [1.66, 0.90, 0.60], 0.05);
  }
  // The aerial mast and the wire aft to the fin.
  box(p, TOP, 0.06, 0.52, 0.06, 0, cl(1.4) + 1.36, 1.40);
  const wire = box(p, P.wire, 0.03, 0.03, 5.6, 0, cl(-1.5) + 1.42, -1.50);
  wire.rotation.x = -0.16;
  return p;
}

/**
 * An OS2U-3 Kingfisher: the battleship's spotting plane, catapulted off the
 * Iowa's quarterdeck and craned back aboard out of her own slick.
 *
 * One big float under her belly and a little one under each wingtip, a
 * four-hundred-and-fifty horsepower Wasp Junior that makes her slow, and a
 * greenhouse the length of the fuselage for the pilot and the observer who
 * does the actual work. She is a mid-wing monoplane with a deep centre
 * section, and the shape that gives her is unmistakable from abeam.
 */
function kingfisher(g, x, y, z, ry, opts = {}) {
  const [TOP, BOT] = paint('usn');
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  const cl = (zz) => 2.30 + 0.040 * zz;

  airframe(p, TOP, [
    { z: -5.00, w: 0.16, h: 0.50, y: cl(-5.00) + 0.28 },
    { z: -4.30, w: 0.38, h: 0.76, y: cl(-4.30) + 0.22 },
    { z: -3.40, w: 0.58, h: 0.96, y: cl(-3.40) + 0.15 },
    { z: -2.30, w: 0.76, h: 1.14, y: cl(-2.30) + 0.08 },
    { z: -1.10, w: 0.90, h: 1.26, y: cl(-1.10) + 0.03 },
    { z: 0.10, w: 0.96, h: 1.32, y: cl(0.10) },
    { z: 1.20, w: 0.96, h: 1.32, y: cl(1.20) },
    { z: 2.20, w: 0.92, h: 1.26, y: cl(2.20) + 0.02 },
    { z: 3.00, w: 0.84, h: 1.16, y: cl(3.00) + 0.04 },
  ], { flat: 0.10, e: 0.93, mBot: BOT });
  radial(p, 0.62, cl(3.35) + 0.04, 3.30, 2.74, 2, !!opts.spin);
  greenhouse(p, 0.84, 0.56, cl(0.2) + 0.64, -2.60, 1.90, 5);
  // The observer's ring and his thirty calibre, aft in the hood.
  const ringY = cl(-1.9) + 1.22;
  cyl(p, P.gunDark, 0.38, 0.38, 0.06, 0, ringY, -2.00, 14);
  const mg = cyl(p, P.gunDark, 0.04, 0.04, 0.94, 0.08, ringY + 0.22, -2.30, 6);
  mg.rotation.x = -1.20;
  airframe(p, TOP, [
    { z: -4.50, w: 0.22, h: 0.24, y: cl(-4.50) + 0.34 },
    { z: -3.30, w: 0.48, h: 0.40, y: cl(-3.30) + 0.42 },
    { z: -2.70, w: 0.60, h: 0.48, y: cl(-2.70) + 0.46 },
  ], { flat: 0.3, e: 0.94, capF: false, mBot: TOP });

  // The wing: mid-set on a deep centre section, with the leading-edge slots
  // and the big flaps that let her come off the water at all.
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.46, cl(0.3) + 0.10, 0.70);
    w.rotation.z = -s * 0.045;
    p.add(w);
    wing(w, TOP, BOT, {
      side: s, x: 0, y: 0, z: 0, span: 5.02, rootC: 2.05, tipC: 1.32,
      sweep: 0.10, thick: 0.135, camber: 0.030, twist: -0.03, rootCap: false,
    });
    box(w, TOP, 1.62, 0.09, 0.42, s * 3.70, 0.02, -0.82);       // aileron
    box(w, TOP, 1.80, 0.10, 0.56, s * 1.50, -0.01, -0.96);      // flap
    // The full-span leading-edge slot, which is the one thing on her that a
    // carrier aeroplane has not got.
    box(w, TOP, 4.40, 0.07, 0.16, s * 2.60, 0.07, 0.03);
    insignia(w, s * 2.90, 0.13, -0.44, 0.50);
    box(w, TOP, 0.40, 0.28, 1.70, s * 0.14, 0.02, -0.78);       // root fillet
    // The wingtip float on its little pylon and its brace.
    const ft = new THREE.Group();
    ft.position.set(s * 5.05, -0.86, -0.10);
    w.add(ft);
    seaFloat(ft, TOP, BOT, [
      [-0.72, 0.06, 0.28, 0.33, 0.42, 0.02],
      [-0.35, 0.16, 0.14, 0.22, 0.40, 0.03],
      [0.30, 0.18, 0.06, 0.18, 0.40, 0.03],
      [0.80, 0.13, 0.14, 0.24, 0.42, 0.03],
      [1.10, 0.04, 0.28, 0.34, 0.44, 0.02],
    ]);
    strut(w, TOP, [s * 5.05, -0.50, 0.10], [s * 4.72, -0.02, 0.16], 0.04);
    strut(w, TOP, [s * 5.05, -0.50, -0.34], [s * 4.72, -0.02, -0.42], 0.04);
  }
  insignia(p, 0.50, cl(-3.0) + 0.06, -3.00, 0.36, false);
  insignia(p, -0.50, cl(-3.0) + 0.06, -3.00, 0.36, false);
  empennage(p, 1.36, 1.20, 3.66, 0.94, cl(-4.3) + 0.28, -4.05);

  // The main float: hung under her on a single heavy pylon with a pair of
  // struts either side, which is how an OS2U carries hers.
  if (opts.floats !== false) {
    const fl = new THREE.Group();
    fl.position.set(0, 0, 0.30);
    p.add(fl);
    seaFloat(fl, TOP, BOT, [
      [-3.90, 0.16, 0.72, 0.82, 1.00, 0.03],
      [-2.70, 0.40, 0.46, 0.62, 0.96, 0.05],
      [-1.40, 0.54, 0.26, 0.48, 0.94, 0.06],
      [-0.32, 0.58, 0.20, 0.44, 0.94, 0.07],
      [-0.30, 0.58, 0.00, 0.40, 0.94, 0.07],
      [0.95, 0.58, 0.02, 0.40, 0.96, 0.07],
      [2.20, 0.50, 0.16, 0.46, 0.98, 0.06],
      [3.20, 0.32, 0.38, 0.62, 1.00, 0.05],
      [3.90, 0.08, 0.68, 0.78, 1.02, 0.03],
    ]);
    cyl(fl, P.gunDark, 0.05, 0.06, 0.16, 0, 1.10, 2.80, 8);
    const rud = box(fl, BOT, 0.05, 0.36, 0.42, 0, 0.56, -3.72);
    rud.rotation.x = 0.12;
    // The pylon: a faired strut, not a slab. It carries the whole weight of
    // her on the water and it is the deepest thing on the aeroplane, so its
    // section is a wing's rather than a plank's.
    for (let i = 0; i < 5; i++) {
      const u = i / 4;
      const yy = cl(0.5) - 0.66 - u * 0.72;
      const c = 1.70 - u * 0.30;
      box(p, TOP, 0.30 - u * 0.06, 0.20, c, 0, yy, 0.85 + u * 0.10);
    }
    for (const s of [-1, 1]) {
      strut(p, TOP, [0, 1.02, 2.20], [s * 0.44, cl(1.9) - 0.66, 1.90], 0.055);
      strut(p, TOP, [0, 1.02, -1.00], [s * 0.44, cl(-1.1) - 0.62, -1.10], 0.055);
    }
  }
  box(p, TOP, 0.06, 0.48, 0.06, 0, cl(1.0) + 1.28, 1.00);
  const wire = box(p, P.wire, 0.03, 0.03, 5.0, 0, cl(-1.6) + 1.34, -1.60);
  wire.rotation.x = -0.15;
  return p;
}


// The five machines, so they can be looked at and measured without a ship
// round them.
export { wildcat, dauntless, avenger, arado, kingfisher };
export { airframe, wing, radial, greenhouse, empennage, insignia, seaFloat };
