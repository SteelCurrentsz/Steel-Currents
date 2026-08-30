// The coast guns, built out of primitives at their real size.
//
// There is no concrete here: what is on the screen is the gun and the mounting
// it stands on, and nothing else. That puts every piece of it under the eye at
// ten metres, so the mountings are built the way they were made — a racer with
// teeth on it, trunnions in bearings with caps over them, a cradle the barrel
// recoils through, recoil cylinders bolted to that cradle, elevating arcs with
// a pinion housing against them, handwheels the layers actually turned, seats
// for the layers to sit on, a loading tray behind the breech and a ladder up to
// the platform it stands on.
//
// Two rules held throughout. Nothing floats: every part is carried by the part
// under it, and anything that reaches the ground reaches y = 0 exactly. And
// nothing is a hollow shell — an open-ended lathe or a single-sided plate has
// no thickness, shows the inside of its own far wall, and reads as a fin, so
// where a curve is wanted it is faceted out of plates that do have thickness.
//
// Metres throughout. The gun points down +Z, and the ground is y = 0.

import * as THREE from '../../../vendor/three.module.js';
import { BATTERIES } from '../../../shared/batteries.js';
import { mergeStatic } from './merge.js';

// ------------------------------------------------------------- materials --

const MAT = {
  gun: new THREE.MeshLambertMaterial({ color: 0x4a5057 }),
  gunDark: new THREE.MeshLambertMaterial({ color: 0x343a40 }),
  steel: new THREE.MeshLambertMaterial({ color: 0x5b6169 }),
  bright: new THREE.MeshLambertMaterial({ color: 0x8d949b }),
  dark: new THREE.MeshLambertMaterial({ color: 0x24282d }),
  brass: new THREE.MeshLambertMaterial({ color: 0x8f7638 }),
  rust: new THREE.MeshLambertMaterial({ color: 0x6a4326 }),
  // Wehrmacht dunkelgelb, and the olive drab the Coast Artillery painted with.
  camo: new THREE.MeshLambertMaterial({ color: 0x6d6242 }),
  camoDark: new THREE.MeshLambertMaterial({ color: 0x52492f }),
  olive: new THREE.MeshLambertMaterial({ color: 0x5b6150 }),
  oliveDark: new THREE.MeshLambertMaterial({ color: 0x40453a }),
  rubber: new THREE.MeshLambertMaterial({ color: 0x1d1f20 }),
  timber: new THREE.MeshLambertMaterial({ color: 0x5a4630 }),
  timberPale: new THREE.MeshLambertMaterial({ color: 0x6d5740 }),
  // Hessian, filled and stacked. Two tones so a wall of them is a wall of bags
  // rather than a slab: every other course takes the darker one.
  bag: new THREE.MeshLambertMaterial({ color: 0x9a8c66 }),
  bagDark: new THREE.MeshLambertMaterial({ color: 0x817353 }),
  // The mounting's own bedplate: what a gun this heavy is bolted down to, and
  // near enough flush with the ground to read as part of the mounting.
  bed: new THREE.MeshLambertMaterial({ color: 0x6b6d68 }),
  bore: new THREE.MeshLambertMaterial({ color: 0x131313 }),
};

// ------------------------------------------------------------ primitives --

function box(g, mat, w, h, d, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  g.add(m);
  return m;
}

/** A cylinder on its end. */
function cyl(g, mat, rTop, rBot, h, x, y, z, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/** A cylinder lying along +Z, its near end at z. */
function tube(g, mat, rFront, rBack, len, x, y, z, seg = 18) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rFront, rBack, len, seg), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z + len / 2);
  g.add(m);
  return m;
}

/** A cylinder lying along X, centred on x — a shaft, an axle, a trunnion. */
function shaft(g, mat, r, len, x, y, z, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/** A ring lying flat: a roller path, a race, a bolt circle. */
function ring(g, mat, r, t, x, y, z, seg = 30) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, seg), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

// ------------------------------------------------------------------- kit --

/** A training rack: the ring of teeth the traversing pinion walks round. */
function racer(g, mat, r, y, teeth = 44, size = 1) {
  ring(g, mat, r, 0.055 * size, 0, y, 0, Math.min(52, teeth));
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    box(g, mat, 0.1 * size, 0.13 * size, 0.2 * size,
      Math.sin(a) * r, y, Math.cos(a) * r, a);
  }
}

/** A toothed elevating arc standing on edge, its centre at the trunnion. */
function elevArc(g, mat, r, x, y, z, from = -0.4, to = 0.35, teeth = 14, w = 0.22) {
  for (let i = 0; i <= teeth; i++) {
    const a = from + (to - from) * (i / teeth);
    const m = box(g, mat, w, 0.28, 0.24, x, y - Math.cos(a) * r, z - Math.sin(a) * r);
    m.rotation.x = a;
  }
  // The web behind the teeth, so it reads as an arc and not a row of blocks.
  for (let i = 0; i < teeth; i++) {
    const a = from + (to - from) * ((i + 0.5) / teeth);
    const m = box(g, mat, w * 0.72, 0.6, 0.28,
      x, y - Math.cos(a) * (r - 0.38), z - Math.sin(a) * (r - 0.38));
    m.rotation.x = a;
  }
}

/** A handwheel on its shaft. `ax` is 'x' for one turned facing along the gun,
 *  'z' for one turned side-on to it. */
function handwheel(g, mat, r, x, y, z, ax = 'x') {
  const t = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.13, 6, 18), mat);
  if (ax === 'x') t.rotation.y = Math.PI / 2;
  t.position.set(x, y, z);
  g.add(t);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    const s = box(g, mat, ax === 'x' ? 0.045 : r * 2, r * 2, ax === 'x' ? r * 2 : 0.045, x, y, z);
    if (ax === 'x') s.rotation.x = a; else s.rotation.z = a;
    s.scale.set(1, 1, 1);
    // Keep the spoke inside the rim.
    if (ax === 'x') s.scale.z = 0.94; else s.scale.x = 0.94;
    s.scale.y = 0.06;
  }
  if (ax === 'x') shaft(g, mat, r * 0.17, r * 0.9, x, y, z, 10);
  else tube(g, mat, r * 0.17, r * 0.17, r * 0.9, x, y, z - r * 0.45, 10);
  box(g, MAT.dark, 0.055, 0.055, 0.15, x + (ax === 'x' ? 0.05 : 0), y + r * 0.86, z);
}

/** A layer's seat: pan, back, and the stalk carrying them off the carriage. */
function seat(g, mat, x, y, z, ry = 0) {
  cyl(g, mat, 0.05, 0.06, y * 0.9, x, y * 0.55, z, 10);
  const p = box(g, mat, 0.4, 0.06, 0.34, x, y, z, ry);
  p.rotation.x = 0.09;
  const b = box(g, mat, 0.38, 0.28, 0.055, x, y + 0.16, z - 0.15, ry);
  b.rotation.x = -0.2;
}

/** A run of railing along Z: two rails and the stanchions under them. */
function railing(g, mat, len, x, y, z, ry = 0, h = 1.05) {
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.rotation.y = ry;
  g.add(grp);
  const n = Math.max(2, Math.round(len / 1.3));
  for (let i = 0; i <= n; i++) {
    box(grp, mat, 0.05, h, 0.05, 0, h / 2, -len / 2 + (len * i) / n);
  }
  box(grp, mat, 0.05, 0.05, len, 0, h, 0);
  box(grp, mat, 0.04, 0.04, len, 0, h * 0.52, 0);
}

/** A ladder, from wherever it starts down to whatever it reaches. */
function ladder(g, mat, h, x, y, z, ry = 0, w = 0.46) {
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.rotation.y = ry;
  g.add(grp);
  for (const s of [-1, 1]) box(grp, mat, 0.055, h, 0.055, (s * w) / 2, h / 2, 0);
  const n = Math.max(2, Math.round(h / 0.32));
  for (let i = 1; i <= n; i++) box(grp, mat, w, 0.04, 0.04, 0, (h * i) / (n + 1), 0);
}

/** A flight of steps up to a platform, standing on the ground. */
function steps(g, mat, h, run, x, y, z, ry = 0, w = 0.9) {
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.rotation.y = ry;
  g.add(grp);
  const n = Math.max(3, Math.round(h / 0.24));
  for (let i = 1; i <= n; i++) {
    box(grp, mat, w, 0.05, run / n, 0, (h * i) / n, -run / 2 + (run * (i - 0.5)) / n);
  }
  for (const s of [-1, 1]) {
    const st = box(grp, mat, 0.06, 0.14, Math.hypot(run, h), (s * w) / 2, h / 2, 0);
    st.rotation.x = -Math.atan2(h, run);
    // A handrail over the stringer.
    const hr = box(grp, mat, 0.05, 0.05, Math.hypot(run, h), (s * w) / 2, h / 2 + 0.85, 0);
    hr.rotation.x = -Math.atan2(h, run);
    for (let i = 0; i <= 2; i++) {
      box(grp, mat, 0.045, 0.85, 0.045, (s * w) / 2,
        (h * i) / 2 + 0.42, -run / 2 + (run * i) / 2);
    }
  }
}

/** A road wheel with tyre, rim, hub and spokes, standing on the ground. */
function roadWheel(g, r, wd, x, y, z, spokes = 6) {
  const t = new THREE.Mesh(new THREE.TorusGeometry(r - wd * 0.35, wd * 0.35, 6, 20), MAT.rubber);
  t.rotation.y = Math.PI / 2;
  t.position.set(x, y, z);
  g.add(t);
  shaft(g, MAT.camoDark, r * 0.58, wd * 0.42, x, y, z, 18);
  shaft(g, MAT.dark, r * 0.2, wd * 1.15, x, y, z, 12);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI;
    const s = box(g, MAT.camoDark, wd * 0.3, r * 1.72, 0.05, x, y, z);
    s.rotation.x = a;
  }
}

/** A levelling jack: screw, footplate on the ground, and the pad it carries. */
function jack(g, mat, x, y, z) {
  cyl(g, MAT.dark, 0.2, 0.24, 0.1, x, 0.05, z, 12);
  cyl(g, MAT.bright, 0.06, 0.06, y - 0.1, x, (y - 0.1) / 2 + 0.1, z, 10);
  box(g, mat, 0.26, 0.1, 0.26, x, y, z);
}

/** A shell standing on its base, the way ready rounds were stood by the gun. */
function round_(g, bore, x, y, z, matBody = MAT.gunDark) {
  const L = bore * 4.2;
  cyl(g, MAT.brass, bore * 0.5, bore * 0.5, L * 0.4, x, y + L * 0.2, z, 14);
  cyl(g, matBody, bore * 0.48, bore * 0.5, L * 0.34, x, y + L * 0.57, z, 14);
  cyl(g, matBody, bore * 0.1, bore * 0.48, L * 0.26, x, y + L * 0.87, z, 14);
}

// -------------------------------------------------------------- sandbags --

// A filled bag is about half a metre long and a hand deep. These are laid in a
// bond — every other course offset by half a bag — with each bag turned a
// degree or two off true and settled a centimetre or so, because a revetment
// built of bags all square to one another reads as brickwork. The wobble is
// taken off the bag's own index rather than a random number, so a battery
// looks the same every time it is drawn.

const BAG_W = 0.46;
const BAG_H = 0.2;
const BAG_D = 0.3;

function sandbag(g, x, y, z, ry, i) {
  const m = box(g, i % 2 ? MAT.bag : MAT.bagDark,
    BAG_W * (0.94 + 0.09 * Math.sin(i * 2.1)),
    BAG_H * (0.9 + 0.14 * Math.sin(i * 1.3)),
    BAG_D * (0.92 + 0.12 * Math.cos(i * 0.7)),
    x, y - 0.012 * Math.sin(i * 3.1), z, ry + 0.05 * Math.sin(i * 1.7));
  m.rotation.z = 0.035 * Math.cos(i * 2.3);
  return m;
}

/**
 * The boards a gun crew stands on.
 *
 * A gun pit floors out in mud within a day of being dug, so it is decked --
 * planks on bearers, laid in a ring round the mounting with the pedestal in the
 * middle of it. It is also what stops the ready racks, the crates and the
 * revetment reading as three separate things somebody left on a hillside: they
 * all stand on the same floor, and the floor runs up to the bags.
 */
function duckboards(g, o = {}) {
  const {
    inner = 1.6, outer = 4.2, from = -1.9, to = 1.9, y = 0.035,
  } = o;
  const span = to - from;
  // Short boards laid across the run, in courses out from the mounting -- which
  // is how duckboarding is actually made and, more to the point, how it reads.
  // Laid the other way, as long planks running out from the middle, the deck
  // came out as a fan of wedges: they had to splay to cover the outer edge, and
  // a floor whose boards get wider the further out you go is not a floor.
  const step = Math.max(0.32, (outer - inner) / 11);
  let c = 0;
  for (let r = inner + step * 0.5; r < outer; r += step, c++) {
    const m = Math.max(4, Math.round((span * r) / 0.6));
    const bearer = c % 3 === 0;
    for (let i = 0; i < m; i++) {
      // Every other course offset by half a board, so the joints break.
      const a = from + (span * (i + (c % 2 ? 0.5 : 0.02))) / m;
      if (a > to || a < from) continue;
      const board = box(g, (i + c) % 3 === 1 ? MAT.timber : MAT.timberPale,
        Math.min(0.62, r * span * 0.9 / m), 0.05, step * 0.86,
        Math.sin(a) * r, y, Math.cos(a) * r, a);
      board.rotation.x = 0.008 * Math.sin(i * 1.9 + c);
    }
    // A bearer under every third course, showing at the edge of the boards.
    if (bearer) {
      const n = Math.max(3, Math.round((span * r) / 1.1));
      for (let i = 0; i < n; i++) {
        const a = from + (span * (i + 0.5)) / n;
        box(g, MAT.timber, 0.16, 0.06, step * 1.02,
          Math.sin(a) * r, y - 0.05, Math.cos(a) * r, a);
      }
    }
  }
}

/**
 * Spent cases, thrown clear of the breech and left where they rolled.
 *
 * Fired brass is the one thing that says a gun position has been in action, and
 * at ten metres it is the difference between a model of a gun and a place where
 * men are working one.
 */
function spentCases(g, bore, n, x, z, spread = 1.6) {
  const L = bore * 1.7;
  for (let i = 0; i < n; i++) {
    const a = i * 2.399;
    const rr = spread * Math.sqrt((i + 0.5) / n);
    const c = cyl(g, MAT.brass, bore * 0.5, bore * 0.52, L,
      x + Math.sin(a) * rr, bore * 0.5, z + Math.cos(a) * rr, 10);
    c.rotation.z = Math.PI / 2;
    c.rotation.y = a * 1.7;
  }
}

/**
 * A revetment curved round the front of a mounting: courses of bags on a
 * shrinking radius, so the wall leans back into itself the way a real one does.
 */
function sandbagArc(g, o) {
  const {
    r = 4.0, from = -1.2, to = 1.2, courses = 5, y0 = 0, setback = 0.075,
    z = 0, x = 0, taper = 1,
  } = o;
  let k = 0;
  for (let c = 0; c < courses; c++) {
    const rc = r - c * setback;
    // Each course a bag shorter at each end than the one under it, so the wall
    // walks down to the ground where it finishes. Built with every course the
    // same length it ended in a sheer stack of bags standing in the open with
    // nothing either side of it -- which is what made a revetment read as a
    // piece of wall somebody had dropped rather than as part of the pit.
    const cut = (c * BAG_W * 0.92 * taper) / rc;
    const a0 = from + cut;
    const a1 = to - cut;
    if (a1 - a0 < BAG_W / rc) break;
    const n = Math.max(2, Math.round(((a1 - a0) * rc) / BAG_W));
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * (i + (c % 2 ? 0.5 : 0))) / n;
      if (a > a1 + 0.001 || a < a0 - 0.001) continue;
      sandbag(g, x + Math.sin(a) * rc, y0 + BAG_H / 2 + c * (BAG_H - 0.018),
        z + Math.cos(a) * rc, a, k++);
    }
  }
}

/** A straight run of revetment, lying across the front of a gun. */
function sandbagWall(g, o) {
  const { len = 5, courses = 5, x = 0, y0 = 0, z = 0, ry = 0, setback = 0.07 } = o;
  const grp = new THREE.Group();
  grp.position.set(x, y0, z);
  grp.rotation.y = ry;
  g.add(grp);
  let k = 0;
  for (let c = 0; c < courses; c++) {
    // Stepped in at both ends, course by course, the same way the arc is.
    const lc = len - c * BAG_W * 1.84;
    if (lc < BAG_W) break;
    const n = Math.max(1, Math.round(lc / BAG_W));
    for (let i = 0; i <= n; i++) {
      const t = ((i + (c % 2 ? 0.5 : 0)) / n) * lc - lc / 2;
      if (Math.abs(t) > lc / 2 + 0.01) continue;
      sandbag(grp, t, BAG_H / 2 + c * (BAG_H - 0.018), -c * setback, 0, k++);
    }
  }
  return grp;
}

// ---------------------------------------------------------------- barrel --

/**
 * A built-up gun barrel: chamber, jacket, chase and muzzle.
 *
 * Real heavy guns are hoops shrunk over a liner, so the tube steps down in
 * diameter two or three times between the breech and the muzzle rather than
 * tapering smoothly, and every step shows as a shoulder. That is most of what
 * makes a barrel read as a gun rather than as a pipe.
 *
 * The group's origin is the trunnion axis and the tube runs down +Z, so the
 * caller elevates by turning the group about x.
 */
function gunBarrel(bore, calibers, opts = {}) {
  const { mat = MAT.gun, brake = false } = opts;
  const g = new THREE.Group();
  const L = bore * calibers;
  const rChamber = bore * 1.2;
  const rJacket = bore * 1.0;
  const rChase = bore * 0.79;
  const rMuzzle = bore * 0.63;

  tube(g, mat, rJacket, rChamber, L * 0.2, 0, 0, 0);
  tube(g, mat, rChase, rJacket, L * 0.26, 0, 0, L * 0.2);
  tube(g, mat, rMuzzle * 1.06, rChase, L * 0.48, 0, 0, L * 0.46);
  tube(g, mat, rMuzzle, rMuzzle * 1.06, L * 0.06, 0, 0, L * 0.94);
  // The shoulders where one shrunk course laps over the next.
  tube(g, mat, rChamber * 1.04, rChamber * 1.04, bore * 0.3, 0, 0, L * 0.2 - bore * 0.3);
  tube(g, mat, rJacket * 1.05, rJacket * 1.05, bore * 0.26, 0, 0, L * 0.46 - bore * 0.26);
  tube(g, mat, rMuzzle * 1.17, rMuzzle * 1.17, bore * 0.5, 0, 0, L - bore * 0.5);

  let end = L;
  if (brake) {
    tube(g, MAT.gunDark, bore * 1.12, bore * 1.12, bore * 4.4, 0, 0, L - bore * 0.2);
    for (let i = 0; i < 2; i++) {
      box(g, MAT.bore, bore * 2.5, bore * 0.42, bore * 0.85,
        0, 0, L + bore * (0.9 + i * 1.7));
    }
    end = L + bore * 4.2;
  }
  tube(g, MAT.bore, bore * 0.5, bore * 0.5, bore * 1.6, 0, 0, end - bore * 1.5);
  g.userData.length = L;
  return g;
}

/**
 * The breech: ring, block, operating gear and the tray a round goes in on.
 * Added to the elevating group, behind the trunnion.
 */
function breech(g, bore, opts = {}) {
  const { mat = MAT.gunDark, screw = true, len = 1.0, tray = true } = opts;
  const bl = bore * len * 3.0;
  const r = bore * 1.32;

  tube(g, mat, r, r * 1.05, bl * 0.6, 0, 0, -bl * 0.6);
  box(g, mat, r * 1.95, r * 1.95, bl * 0.5, 0, 0, -bl * 0.82);
  if (screw) {
    // Interrupted screw, closed, with its hinge arm and operating lever.
    cyl(g, MAT.bright, r * 0.84, r * 0.84, bore * 0.32, 0, 0, -bl * 1.08, 16)
      .rotation.x = Math.PI / 2;
    cyl(g, mat, r * 0.6, r * 0.7, bore * 0.46, 0, 0, -bl * 1.28, 16)
      .rotation.x = Math.PI / 2;
    box(g, mat, r * 0.42, r * 0.9, bore * 0.66, r * 1.15, 0, -bl * 1.08);
    const lv = box(g, MAT.dark, 0.065, 0.065, r * 2.1, r * 1.3, -r * 0.25, -bl * 1.1);
    lv.rotation.x = 0.55;
  } else {
    // Vertical sliding block, dropped clear for loading.
    box(g, MAT.bright, r * 1.45, r * 2.1, bore * 0.4, 0, -r * 0.55, -bl * 1.04);
    box(g, MAT.dark, 0.055, 0.46, 0.055, r * 0.9, -r * 0.3, -bl * 1.14);
  }
  if (tray) {
    box(g, MAT.steel, bore * 1.9, 0.05, bore * 4.4, 0, -r * 0.8, -bl * 1.9);
    for (const s of [-1, 1]) {
      box(g, MAT.steel, 0.05, bore * 0.46, bore * 4.4, s * bore * 0.9, -r * 0.56, -bl * 1.9);
    }
    box(g, MAT.steel, bore * 1.9, bore * 0.7, 0.07, 0, -r * 0.48, -bl * 1.9 - bore * 2.2);
  }
}

/**
 * The barrel and its breech together, in a group that slides back through the
 * cradle when the gun fires.
 *
 * Marked dynamic, so the welder that bakes the rest of the mounting into one
 * mesh per material leaves this alone — it is the one part of a coast gun that
 * moves. The caller records it on the group's gun list, and the scene drives it.
 */
function recoiling(arm, bore, calibers, opts = {}) {
  const rec = new THREE.Group();
  rec.userData.dynamic = true;
  arm.add(rec);
  rec.add(gunBarrel(bore, calibers, opts.barrel));
  breech(rec, bore, opts.breech);
  return {
    node: rec,
    // Where the flash comes out, measured from the trunnion down the bore.
    muzzleZ: bore * calibers + (opts.barrel && opts.barrel.brake ? bore * 4.2 : 0),
    bore,
    // How far the gun runs back. A hydro-spring recoil system is designed for
    // about three bores of stroke, and the heaviest are capped by the length of
    // the slide rather than by the arithmetic.
    stroke: Math.min(1.35, bore * 3.1),
  };
}

/**
 * The cradle: the trough the barrel recoils through, with its guide rails, the
 * trunnion bosses either side and the recoil cylinders bolted along it.
 */
function cradle(g, bore, len, opts = {}) {
  const { mat = MAT.gun, cylsAbove = 1, cylsBelow = 1, cylsSide = 0, front = 0.32 } = opts;
  const r = bore * 1.58;
  tube(g, mat, r, r * 1.05, len, 0, 0, -len * front);
  for (const s of [-1, 1]) {
    box(g, mat, bore * 0.4, bore * 0.34, len, s * r * 0.8, r * 0.7, -len * front + len / 2);
  }
  // Trunnion bosses, and the trunnions running out of them into the bearings.
  for (const s of [-1, 1]) {
    cyl(g, mat, r * 0.92, r, bore * 0.6, s * (r + bore * 0.28), 0, 0, 16)
      .rotation.z = Math.PI / 2;
    shaft(g, MAT.bright, bore * 0.5, bore * 1.6, s * (r + bore * 1.05), 0, 0, 14);
  }
  const cr = bore * 0.42;
  for (let i = 0; i < cylsAbove; i++) {
    const x = cylsAbove === 1 ? 0 : (i - 0.5) * bore * 2.3;
    tube(g, MAT.steel, cr, cr, len * 0.84, x, r + cr * 0.95, -len * front + len * 0.06);
    tube(g, MAT.bright, cr * 0.42, cr * 0.42, len * 0.36, x, r + cr * 0.95,
      -len * front + len * 0.88);
  }
  for (let i = 0; i < cylsBelow; i++) {
    const x = cylsBelow === 1 ? 0 : (i - 0.5) * bore * 2.3;
    tube(g, MAT.steel, cr * 0.92, cr * 0.92, len * 0.78, x, -r - cr * 0.95,
      -len * front + len * 0.06);
  }
  for (let i = 0; i < cylsSide; i++) {
    const s = i % 2 ? 1 : -1;
    tube(g, MAT.steel, cr * 0.9, cr * 0.9, len * 0.8, s * (r + cr * 1.15), -r * 0.3,
      -len * front + len * 0.06);
  }
  return r;
}

/** A telescopic sight on its bracket. */
function sight(g, x, y, z) {
  box(g, MAT.gunDark, 0.1, 0.24, 0.1, x, y - 0.14, z);
  tube(g, MAT.dark, 0.05, 0.065, 0.58, x, y, z - 0.18, 12);
  cyl(g, MAT.bright, 0.042, 0.042, 0.05, x, y, z - 0.21, 10).rotation.x = Math.PI / 2;
}

// -------------------------------------------------------------- the guns --

/** 8.8 cm Flak 36 on its cruciform platform. */
function buildFlak88(g, b) {
  const bore = b.caliber / 1000;

  // The platform: centre casting, four outriggers, a jack under each end.
  box(g, MAT.camo, 1.5, 0.3, 1.5, 0, 0.5, 0);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    box(g, MAT.camo, dx ? 3.0 : 0.62, 0.22, dz ? 3.0 : 0.62, dx * 2.1, 0.5, dz * 2.1);
    box(g, MAT.camoDark, dx ? 3.0 : 0.16, 0.12, dz ? 3.0 : 0.16, dx * 2.1, 0.62, dz * 2.1);
    cyl(g, MAT.dark, 0.09, 0.09, 0.34, dx * 0.76, 0.5, dz * 0.76, 10);
    jack(g, MAT.camoDark, dx * 3.5, 0.5, dz * 3.5);
  }

  // Pedestal and the racer the mounting trains on.
  cyl(g, MAT.camo, 0.6, 0.78, 0.62, 0, 0.96, 0, 18);
  racer(g, MAT.camoDark, 0.66, 1.26, 30, 0.9);

  const turn = new THREE.Group();
  turn.position.y = 1.3;
  turn.rotation.y = 0.34;
  g.add(turn);
  cyl(turn, MAT.camo, 0.72, 0.78, 0.28, 0, 0.14, 0, 20);
  box(turn, MAT.camo, 1.5, 0.2, 1.0, 0, 0.34, -0.1);
  for (const s of [-1, 1]) {
    box(turn, MAT.camo, 0.24, 1.0, 1.15, s * 0.62, 0.72, 0.05);
    cyl(turn, MAT.camo, 0.28, 0.28, 0.3, s * 0.62, 1.05, 0.05, 14).rotation.z = Math.PI / 2;
    box(turn, MAT.camoDark, 0.32, 0.16, 0.34, s * 0.62, 1.05, 0.05);
    // Layer's stand, handwheel and seat, one either side.
    box(turn, MAT.camo, 0.44, 0.5, 0.5, s * 1.02, 0.5, -0.35);
    handwheel(turn, MAT.camoDark, 0.23, s * 1.3, 0.62, -0.35, 'x');
    seat(turn, MAT.camoDark, s * 1.05, 0.72, -0.95);
    box(turn, MAT.camoDark, 0.62, 0.05, 0.42, s * 1.05, 0.28, -0.75);
  }
  box(turn, MAT.camo, 0.3, 0.36, 0.34, -0.42, 0.52, -0.16);
  sight(turn, -1.0, 1.0, 0.2);

  // Shield: main plate with the top panel folded back, side wings, and a square
  // hole for the gun made of four plates rather than a dark patch on one.
  const sh = new THREE.Group();
  sh.position.set(0, 0.2, 0.74);
  sh.rotation.x = -0.13;
  turn.add(sh);
  // The slot is tall, because the gun has to be able to elevate through it.
  const HW = 1.3, AP = 0.34;
  for (const s of [-1, 1]) box(sh, MAT.camo, HW - AP, 1.5, 0.05, (s * (HW + AP)) / 2, 0.85, 0);
  box(sh, MAT.camo, AP * 2, 0.3, 0.05, 0, 1.45, 0);
  box(sh, MAT.camo, AP * 2, 0.55, 0.05, 0, 0.375, 0);
  for (const s of [-1, 1]) {
    const wing = box(sh, MAT.camo, 0.5, 1.5, 0.05, s * (HW + 0.22), 0.85, -0.05);
    wing.rotation.y = s * 0.42;
  }
  const top = box(sh, MAT.camo, HW * 2, 0.55, 0.05, 0, 1.71, -0.09);
  top.rotation.x = 0.5;
  box(sh, MAT.camoDark, HW * 2, 0.08, 0.08, 0, 0.13, -0.03);
  for (const s of [-1, 1]) box(sh, MAT.camoDark, 0.07, 1.5, 0.07, s * (HW - 0.04), 0.85, -0.03);

  // The gun.
  const arm = new THREE.Group();
  arm.position.set(0, 1.05, 0.05);
  arm.rotation.x = -0.45;
  turn.add(arm);
  cradle(arm, bore, 1.6, { mat: MAT.camo, cylsAbove: 1, cylsBelow: 0, front: 0.3 });
  // The elevating arc rides on the cradle and the pinion on the carriage, so
  // the arc goes in the elevating group: hung off the carriage it would swing
  // away from its own gun.
  elevArc(arm, MAT.camoDark, 0.6, -0.42, 0, 0, -0.3, 0.6, 10, 0.16);
  g.userData.guns.push(recoiling(arm, bore, b.calibers, {
    barrel: { mat: MAT.camo, brake: true },
    breech: { mat: MAT.camoDark, screw: false, len: 0.85 },
  }));
  // Fuze setter and spent-case guide, both hung off the cradle.
  box(arm, MAT.camoDark, 0.32, 0.3, 0.5, -0.42, -0.15, -0.6);
  handwheel(arm, MAT.dark, 0.13, -0.62, -0.15, -0.6, 'x');
  const chute = box(arm, MAT.steel, 0.3, 0.05, 0.66, 0, -0.3, -1.02);
  chute.rotation.x = 0.3;

  // Ready rounds in their rack, and crates, all of it standing on the ground.
  box(g, MAT.olive, 1.6, 0.1, 0.46, -2.2, 0.05, 2.5, 0.3);
  for (let i = 0; i < 5; i++) {
    round_(g, bore, -2.9 + i * 0.35, 0.1, 2.28 + i * 0.11);
  }
  for (let i = 0; i < 3; i++) {
    box(g, MAT.olive, 0.86, 0.3, 0.4, 2.4 + (i % 2) * 0.12,
      0.15 + Math.floor(i / 2) * 0.3, -1.5 - (i % 2) * 0.5, 0.2 - i * 0.15);
  }
  // The pit floor, the bags round it, and the brass on the boards. The
  // decking is what ties the ready rack, the crates and the revetment to the
  // gun: they all stand on one floor instead of on bare ground beside it.
  duckboards(g, { inner: 1.5, outer: 4.3, from: -1.95, to: 1.95 });
  sandbagArc(g, { r: 4.35, from: -1.85, to: 1.85, courses: 5 });
  spentCases(g, bore, 9, -1.5, -1.9, 1.5);
}

/** 10 cm leFH 14/19(t) on its split-trail carriage. */
function buildMerville(g, b) {
  const bore = b.caliber / 1000;
  const R = 0.62;                          // wheel radius, which sets the height

  shaft(g, MAT.camoDark, 0.09, 2.0, 0, R, 0, 12);
  for (const s of [-1, 1]) roadWheel(g, R, 0.2, s * 1.04, R, 0);

  // The trails, splayed and dropped onto their spades.
  for (const s of [-1, 1]) {
    const t = new THREE.Group();
    t.position.set(s * 0.3, R * 0.74, -0.15);
    t.rotation.y = -s * 0.17;
    // Drooping enough that the trail end is on the ground and the spade is in
    // it, which is where a gun in action has them.
    t.rotation.x = -0.105;
    g.add(t);
    box(t, MAT.camo, 0.24, 0.26, 3.1, 0, 0, -1.55);
    box(t, MAT.camoDark, 0.3, 0.08, 3.1, 0, 0.16, -1.55);
    box(t, MAT.dark, 0.3, 0.44, 0.16, 0, -0.24, -3.05);
    box(t, MAT.timber, 0.065, 0.065, 0.9, 0.16, 0.2, -2.85);
    // The trail-end handle the crew lifted it by.
    box(t, MAT.camoDark, 0.34, 0.06, 0.06, 0, 0.2, -3.05);
  }
  box(g, MAT.camo, 0.72, 0.22, 0.5, 0, R * 0.8, -0.6);

  // Top carriage, elevating gear, seat.
  box(g, MAT.camo, 0.9, 0.5, 0.8, 0, R + 0.24, -0.06);
  for (const s of [-1, 1]) box(g, MAT.camo, 0.16, 0.72, 0.6, s * 0.42, R + 0.62, 0);
  box(g, MAT.camo, 0.3, 0.34, 0.32, -0.5, R + 0.18, -0.42);
  handwheel(g, MAT.camoDark, 0.19, -0.7, R + 0.18, -0.42, 'x');
  handwheel(g, MAT.camoDark, 0.17, 0.62, R + 0.14, -0.6, 'x');
  seat(g, MAT.camoDark, -0.92, R + 0.1, -1.0);

  // Shield.
  const sh = new THREE.Group();
  sh.position.set(0, R - 0.1, 0.5);
  sh.rotation.x = -0.1;
  g.add(sh);
  const HW = 0.95, AP = 0.3;
  for (const s of [-1, 1]) box(sh, MAT.camo, HW - AP, 1.2, 0.04, (s * (HW + AP)) / 2, 0.68, 0);
  box(sh, MAT.camo, AP * 2, 0.42, 0.04, 0, 1.07, 0);
  box(sh, MAT.camo, AP * 2, 0.46, 0.04, 0, 0.31, 0);
  const tp = box(sh, MAT.camo, HW * 2, 0.4, 0.04, 0, 1.35, -0.07);
  tp.rotation.x = 0.55;
  box(sh, MAT.camoDark, HW * 2, 0.07, 0.07, 0, 0.1, -0.02);

  // The howitzer: short, thick, laid high.
  const arm = new THREE.Group();
  arm.position.set(0, R + 0.55, -0.02);
  arm.rotation.x = -0.34;
  g.add(arm);
  cradle(arm, bore, 1.15, { mat: MAT.camo, cylsAbove: 1, cylsBelow: 1, front: 0.28 });
  elevArc(arm, MAT.camoDark, 0.45, -0.48, 0, 0, -0.2, 0.6, 9, 0.14);
  g.userData.guns.push(recoiling(arm, bore, b.calibers, {
    barrel: { mat: MAT.camo },
    breech: { mat: MAT.camoDark, screw: false, len: 0.7, tray: false },
  }));
  sight(arm, -0.4, 0.24, -0.08);

  // The position round it: boards to stand the trail and the wheels on, the
  // revetment carried round both flanks rather than laid across the front, and
  // the ammunition on the decking with the rest of it. The gun used to sit on
  // bare grass with a crate and a length of wall beside it, three things in a
  // field; a floor is what makes them one position.
  duckboards(g, { inner: 1.05, outer: 2.95, from: -2.2, to: 2.2, y: 0.03 });
  for (let i = 0; i < 4; i++) {
    round_(g, bore, 1.7 + (i % 2) * 0.3, 0.06, -1.5 - Math.floor(i / 2) * 0.36);
  }
  box(g, MAT.timber, 0.9, 0.34, 0.44, -1.8, 0.23, -1.7, -0.25);
  box(g, MAT.olive, 0.8, 0.3, 0.42, -1.95, 0.21, 1.15, 0.18);
  sandbagArc(g, { r: 3.5, from: -1.55, to: 1.55, courses: 5 });
  spentCases(g, bore, 5, -1.0, -1.4, 1.1);
}

/** 15 cm Tbts KC/36 on a naval pedestal. */
function buildLongues(g, b) {
  const bore = b.caliber / 1000;

  cyl(g, MAT.bed, 1.85, 1.95, 0.22, 0, 0.11, 0, 26);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    cyl(g, MAT.dark, 0.06, 0.06, 0.12, Math.sin(a) * 1.72, 0.26, Math.cos(a) * 1.72, 8);
  }
  cyl(g, MAT.gun, 1.15, 1.32, 0.92, 0, 0.66, 0, 22);
  racer(g, MAT.gunDark, 1.02, 1.14, 40, 1.0);

  const mount = new THREE.Group();
  mount.position.y = 1.2;
  mount.rotation.y = 0.16;
  g.add(mount);
  cyl(mount, MAT.gun, 1.05, 1.1, 0.3, 0, 0.15, 0, 22);
  box(mount, MAT.gun, 2.1, 0.14, 1.9, 0, 0.34, -0.15);
  for (const s of [-1, 1]) {
    box(mount, MAT.gun, 0.2, 0.95, 1.1, s * 0.76, 0.85, 0.1);
    cyl(mount, MAT.gun, 0.27, 0.3, 0.26, s * 0.76, 1.28, 0.1, 14).rotation.z = Math.PI / 2;
    box(mount, MAT.gunDark, 0.3, 0.16, 0.34, s * 0.76, 1.3, 0.1);
    seat(mount, MAT.gunDark, s * 0.74, 0.62, -1.0);
    handwheel(mount, MAT.gunDark, 0.24, s * 0.86, 0.78, -0.5, 'z');
  }
  box(mount, MAT.gun, 0.34, 0.44, 0.4, 0.6, 0.5, -0.1);
  sight(mount, -0.78, 1.14, 0.4);

  // The shield: an arc of plates that have thickness, a roof over them, side
  // plates back to the open rear, and an aperture the gun comes through.
  const sh = new THREE.Group();
  sh.position.y = 0.3;
  mount.add(sh);
  const RS = 1.5;
  for (let i = 0; i < 7; i++) {
    const a = (-0.44 + (0.88 * i) / 6) * Math.PI;
    if (Math.abs(a) < 0.2) continue;       // where the barrel comes out
    const p = box(sh, MAT.steel, RS * 0.46, 1.8, 0.09,
      Math.sin(a) * RS, 0.9, Math.cos(a) * RS);
    p.rotation.y = a;
  }
  box(sh, MAT.steel, 0.62, 0.52, 0.09, 0, 1.54, RS);
  box(sh, MAT.steel, 0.62, 0.6, 0.09, 0, 0.3, RS);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(RS + 0.06, RS + 0.06, 0.09, 22, 1,
    false, -Math.PI * 0.47, Math.PI * 0.94), MAT.steel);
  roof.position.y = 1.84;
  sh.add(roof);
  // The side plates run forward far enough to meet the outermost plate of the
   // arc, so the shield closes rather than showing a slot down each shoulder.
  for (const s of [-1, 1]) {
    box(sh, MAT.steel, 0.09, 1.8, 1.9, s * 1.44, 0.9, -0.62);
    box(sh, MAT.gunDark, 0.1, 0.13, 1.9, s * 1.44, 1.83, -0.62);
  }
  box(sh, MAT.steel, 2.88, 0.09, 1.6, 0, 1.84, -0.77);

  const arm = new THREE.Group();
  arm.position.set(0, 1.28, 0.1);
  arm.rotation.x = -0.1;
  mount.add(arm);
  cradle(arm, bore, 2.3, { cylsAbove: 0, cylsBelow: 2, cylsSide: 2, front: 0.32 });
  elevArc(arm, MAT.gunDark, 0.78, 0.6, 0, 0, -0.28, 0.55, 12, 0.18);
  g.userData.guns.push(recoiling(arm, bore, b.calibers, {
    breech: { screw: true, len: 1.0 },
  }));

  // Ready rounds on a rack that stands on the ground, not in the air over it.
  box(g, MAT.steel, 1.35, 0.06, 0.95, -0.66, 0.62, -1.75);
  for (const [rx, rz] of [[-1.26, -1.34], [-0.06, -1.34], [-1.26, -2.16], [-0.06, -2.16]]) {
    box(g, MAT.steel, 0.07, 0.62, 0.07, rx, 0.31, rz);
  }
  for (let i = 0; i < 6; i++) {
    round_(g, bore, -1.16 + (i % 3) * 0.46, 0.65, -1.5 - Math.floor(i / 3) * 0.42);
  }
  // The rammer, laid across the bedplate where the loading number left it.
  box(g, MAT.timber, 0.08, 0.08, 2.5, 1.42, 0.26, -0.35, 0.12);
  cyl(g, MAT.timber, 0.1, 0.1, 0.34, 1.28, 0.26, -1.5, 10).rotation.x = Math.PI / 2;
  duckboards(g, { inner: 1.4, outer: 3.45, from: -1.95, to: 1.95 });
  sandbagArc(g, { r: 3.5, from: -1.85, to: 1.85, courses: 6 });
  spentCases(g, bore, 7, -1.3, -1.7, 1.3);
}

/** 28 cm Krupp L/40 on a barbette pivot mount. */
function buildOscarsborg(g, b) {
  const bore = b.caliber / 1000;

  cyl(g, MAT.bed, 3.3, 3.5, 0.3, 0, 0.15, 0, 30);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    cyl(g, MAT.dark, 0.09, 0.09, 0.16, Math.sin(a) * 3.1, 0.36, Math.cos(a) * 3.1, 8);
  }
  cyl(g, MAT.gun, 2.3, 2.6, 0.55, 0, 0.57, 0, 26);
  racer(g, MAT.gunDark, 2.1, 0.9, 56, 1.3);

  const mount = new THREE.Group();
  mount.position.y = 0.95;
  mount.rotation.y = 0.2;
  g.add(mount);
  cyl(mount, MAT.gun, 2.2, 2.3, 0.34, 0, 0.17, 0, 26);
  box(mount, MAT.gun, 3.5, 0.2, 4.2, 0, 0.42, -0.5);

  for (const s of [-1, 1]) {
    box(mount, MAT.gun, 0.44, 2.3, 3.4, s * 1.5, 1.6, -0.2);
    box(mount, MAT.gunDark, 0.5, 0.3, 3.4, s * 1.5, 2.72, -0.2);
    cyl(mount, MAT.gun, 0.52, 0.56, 0.5, s * 1.5, 2.55, 0.35, 16).rotation.z = Math.PI / 2;
    box(mount, MAT.gunDark, 0.56, 0.3, 0.62, s * 1.5, 2.58, 0.35);
    for (let i = 0; i < 3; i++) {
      cyl(mount, MAT.gunDark, 0.26, 0.26, 0.48, s * 1.5, 1.3, -1.3 + i * 1.1, 14)
        .rotation.z = Math.PI / 2;
    }
    // Layer's footplate, railed, with a ladder down to the bedplate.
    box(mount, MAT.steel, 1.15, 0.08, 2.4, s * 2.42, 1.1, -0.6);
    for (const t of [-1, 1]) {
      box(mount, MAT.steel, 0.09, 1.1, 0.09, s * 2.42, 0.55, -0.6 + t * 1.08);
    }
    railing(mount, MAT.steel, 2.4, s * 2.95, 1.14, -0.6, 0, 0.95);
    // Down to the bedplate, which is what it has to reach to be a ladder.
    ladder(mount, MAT.steel, 1.75, s * 2.42, -0.65, -1.88, 0);
    handwheel(mount, MAT.gunDark, 0.32, s * 1.98, 1.62, -0.55, 'x');
  }
  box(mount, MAT.gun, 3.5, 0.35, 0.8, 0, 2.72, -1.8);
  box(mount, MAT.gun, 0.66, 0.95, 0.76, 1.14, 0.85, 0.15);
  sight(mount, -1.9, 2.2, 0.5);

  // The loading platform behind the breech.
  box(mount, MAT.steel, 2.6, 0.1, 1.8, 0, 1.9, -3.0);
  for (const t of [-1, 1]) box(mount, MAT.steel, 0.1, 1.9, 0.1, t * 1.15, 0.95, -3.7);
  railing(mount, MAT.steel, 1.8, 1.32, 1.95, -3.0, 0, 0.95);
  railing(mount, MAT.steel, 1.8, -1.32, 1.95, -3.0, 0, 0.95);
  // The back rail stops either side of the steps rather than across them.
  for (const t of [-1, 1]) railing(mount, MAT.steel, 0.7, t * 0.95, 1.95, -3.85, Math.PI / 2, 0.95);
  round_(mount, bore, 0.72, 1.95, -3.2);
  box(mount, MAT.timber, 0.12, 0.12, 2.6, -0.7, 2.02, -3.2);
  // Rising to meet the back edge of the platform, at the height of it.
  steps(g, MAT.steel, 2.9, 2.0, 0, 0, -5.8, 0, 1.0);

  // The mantlet, turning and elevating with the gun.
  const arm = new THREE.Group();
  arm.position.set(0, 2.55, 0.35);
  arm.rotation.x = -0.14;
  mount.add(arm);
  box(arm, MAT.steel, 3.5, 2.6, 0.2, 0, 0.1, 1.2);
  for (const s of [-1, 1]) {
    const cheek = box(arm, MAT.steel, 0.18, 2.4, 1.7, s * 1.74, 0.1, 0.4);
    cheek.rotation.y = -s * 0.08;
  }
  box(arm, MAT.steel, 3.4, 0.18, 1.7, 0, 1.35, 0.4);
  box(arm, MAT.steel, 3.4, 0.18, 1.1, 0, -1.15, 0.65);
  cradle(arm, bore, 3.4, { cylsAbove: 0, cylsBelow: 1, cylsSide: 2, front: 0.34 });
  elevArc(arm, MAT.gunDark, 1.45, 1.14, 0, 0, -0.28, 0.5, 14, 0.3);
  g.userData.guns.push(recoiling(arm, bore, b.calibers, {
    breech: { screw: true, len: 1.05 },
  }));

  duckboards(g, { inner: 2.4, outer: 5.25, from: -1.85, to: 1.85 });
  sandbagArc(g, { r: 5.3, from: -1.75, to: 1.75, courses: 6 });
}

/**
 * Fort Drum's twin 14"/50 turret.
 *
 * A battleship turret bolted to an island: eighteen inches of armour on the
 * face, fourteen on the roof, and a barbette a captain could walk round. The
 * face is faceted rather than flat — five plates raked back at rising angles,
 * which is what an armoured face plate of that period looks like — and every
 * plate edge on the house carries the strap and rivet line that held it there.
 */
function buildDrum(g, b) {
  const bore = b.caliber / 1000;
  const RB = 5.5;

  // The barbette: a flared skirt at the bottom, two armour courses above it,
  // rivets along every seam, and the roller path the turret turns on.
  cyl(g, MAT.gunDark, RB, RB + 0.5, 0.55, 0, 0.275, 0, 36);
  cyl(g, MAT.gunDark, RB, RB, 1.75, 0, 1.43, 0, 36);
  for (const y of [0.62, 1.36, 2.06]) ring(g, MAT.gun, RB + 0.02, 0.055, 0, y, 0, 36);
  for (const y of [0.62, 1.36, 2.06]) {
    for (let i = 0; i < 40; i++) {
      const ang = (i / 40) * Math.PI * 2;
      box(g, MAT.gun, 0.14, 0.1, 0.1, Math.sin(ang) * (RB + 0.03), y, Math.cos(ang) * (RB + 0.03), ang);
    }
  }
  // Vertical butt straps between the plates.
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    box(g, MAT.gun, 0.24, 1.9, 0.1, Math.sin(ang) * (RB + 0.03), 1.35, Math.cos(ang) * (RB + 0.03), ang);
  }
  cyl(g, MAT.bright, RB - 0.25, RB - 0.25, 0.18, 0, 2.39, 0, 36);
  ring(g, MAT.dark, RB - 0.25, 0.09, 0, 2.42, 0, 36);

  // A grating walk round the barbette, railed, with a ladder down to the
  // ground: it is what gives the thing its scale, and the crew had to get at
  // the training rack somehow.
  const RW = RB + 1.05;
  for (let i = 0; i < 28; i++) {
    const ang = (i / 28) * Math.PI * 2;
    const pl = box(g, MAT.steel, 1.12, 0.07, (2 * Math.PI * RW) / 28 + 0.06,
      Math.sin(ang) * (RB + 0.55), 2.16, Math.cos(ang) * (RB + 0.55), ang);
    pl.rotation.y = ang;
    box(g, MAT.steel, 0.09, 1.0, 0.09, Math.sin(ang) * RW, 1.66, Math.cos(ang) * RW);
    if (i % 2 === 0) {
      box(g, MAT.steel, 0.05, 1.0, 0.05, Math.sin(ang) * RW, 2.67, Math.cos(ang) * RW);
    }
  }
  ring(g, MAT.steel, RW, 0.045, 0, 3.17, 0, 36);
  ring(g, MAT.steel, RW, 0.035, 0, 2.72, 0, 36);
  ladder(g, MAT.steel, 2.2, 1.6, 0, -RW - 0.05, 0);

  const t = new THREE.Group();
  t.position.y = 2.48;
  t.rotation.y = -0.3;
  g.add(t);
  cyl(t, MAT.gunDark, RB - 0.1, RB - 0.05, 0.42, 0, 0.21, 0, 34);

  // The gunhouse: side and rear walls as plate, and a faceted face raked back.
  const W = 8.4, H = 3.4, D = 8.6;
  const y0 = 0.42;
  for (const sgn of [-1, 1]) {
    box(t, MAT.gun, 0.42, H, D, sgn * (W / 2 - 0.21), y0 + H / 2, -0.2);
    // Butt straps and rivet lines down the side.
    for (let i = -1; i <= 1; i++) {
      box(t, MAT.gun, 0.1, H - 0.3, 0.22, sgn * (W / 2 + 0.01), y0 + H / 2, i * 2.5);
      for (let k = 0; k < 7; k++) {
        box(t, MAT.gun, 0.08, 0.1, 0.1, sgn * (W / 2 + 0.05),
          y0 + 0.35 + k * 0.44, i * 2.5);
      }
    }
  }
  box(t, MAT.gun, W, H, 0.5, 0, y0 + H / 2, -D / 2 + 0.05);
  box(t, MAT.gunDark, W - 0.84, 0.5, D - 0.5, 0, y0 + 0.25, -0.2);

  // Five face plates, each raked a little further back than the one below it.
  const FACE = [
    [0.10, 0.55, 3.62], [0.30, 1.42, 3.55], [0.52, 2.25, 3.30],
    [0.78, 2.95, 2.90], [1.02, 3.42, 2.38],
  ];
  for (const [rake, fy, fz] of FACE) {
    const pl = box(t, MAT.gun, W - 0.1 - rake * 0.5, 0.98, 0.5, 0, y0 + fy, fz);
    pl.rotation.x = -rake;
    const st = box(t, MAT.gun, W - 0.1 - rake * 0.5, 0.12, 0.12, 0, y0 + fy - 0.48, fz + 0.24);
    st.rotation.x = -rake;
  }
  // Roof: plate, hatches, vents, sighting hoods and their periscopes.
  box(t, MAT.gun, W - 0.1, 0.3, D - 0.3, 0, y0 + H + 0.15, -0.25);
  box(t, MAT.gun, W - 0.5, 0.08, D - 0.8, 0, y0 + H + 0.34, -0.25);
  for (const sgn of [-1, 1]) {
    cyl(t, MAT.gunDark, 0.6, 0.66, 0.52, sgn * 2.35, y0 + H + 0.55, -1.2, 18);
    cyl(t, MAT.gun, 0.18, 0.18, 0.5, sgn * 2.35, y0 + H + 1.0, -1.2, 12);
    box(t, MAT.bore, 0.1, 0.14, 0.12, sgn * 2.35, y0 + H + 1.12, -1.42);
    cyl(t, MAT.gun, 0.28, 0.3, 0.24, sgn * 3.2, y0 + H + 0.42, 1.6, 12);
    box(t, MAT.gun, 0.9, 0.14, 0.9, sgn * 1.2, y0 + H + 0.4, -3.1);
  }
  box(t, MAT.gunDark, 2.4, 0.8, 0.8, 0, y0 + H + 0.65, -D / 2 + 0.55);
  // Rangefinder hoods out the after corners, with their windows.
  for (const sgn of [-1, 1]) {
    box(t, MAT.gunDark, 1.7, 1.15, 1.1, sgn * (W / 2 - 0.2), y0 + 1.75, -D / 2 + 1.0);
    box(t, MAT.gun, 1.75, 0.14, 1.15, sgn * (W / 2 - 0.2), y0 + 2.36, -D / 2 + 1.0);
    box(t, MAT.bore, 0.12, 0.22, 0.42, sgn * (W / 2 + 0.66), y0 + 1.82, -D / 2 + 1.0);
  }
  // The door out the back, its handle, and the rungs beside it.
  box(t, MAT.gun, 0.95, 1.8, 0.12, 1.95, y0 + 0.95, -D / 2 - 0.2);
  box(t, MAT.dark, 0.13, 0.13, 0.12, 2.33, y0 + 0.95, -D / 2 - 0.3);
  for (let k = 0; k < 3; k++) box(t, MAT.gun, 0.4, 0.06, 0.06, 1.95, y0 + 0.2 + k * 0.3, -D / 2 - 0.3);

  // Two rifles, each through a port with a rotating mantlet round it.
  for (const sgn of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(sgn * 1.8, y0 + 1.5, 2.5);
    arm.rotation.x = -0.06;
    t.add(arm);
    // Port shield: a disc of armour that turns with the gun, and the collar
    // behind it that closes the hole in the face.
    cyl(arm, MAT.gunDark, 1.02, 1.02, 0.34, 0, 0, 0.5, 20).rotation.x = Math.PI / 2;
    cyl(arm, MAT.gun, 1.1, 1.1, 0.12, 0, 0, 0.68, 20).rotation.x = Math.PI / 2;
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      box(arm, MAT.gun, 0.1, 0.1, 0.1, Math.sin(ang) * 0.92, Math.cos(ang) * 0.92, 0.72);
    }
    cradle(arm, bore, 2.7, { cylsAbove: 0, cylsBelow: 0, cylsSide: 2, front: 0.3 });
    g.userData.guns.push(recoiling(arm, bore, b.calibers, {
      breech: { screw: true, len: 0.9, tray: false },
    }));
  }

  // A revetment of sandbags heaped round the front of the barbette.
  duckboards(g, { inner: RW * 0.6, outer: RW + 1.45, from: -1.8, to: 1.8 });
  sandbagArc(g, { r: RW + 1.5, from: -1.7, to: 1.7, courses: 8 });
  spentCases(g, bore, 5, -RW * 0.5, -RW * 0.8, 2.2);
}

/** 38 cm SK C/34 on its Bettungsschiessgerüst. */
function buildTodt(g, b) {
  const bore = b.caliber / 1000;

  cyl(g, MAT.bed, 5.2, 5.5, 0.4, 0, 0.2, 0, 34);
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    cyl(g, MAT.dark, 0.12, 0.12, 0.2, Math.sin(a) * 5.0, 0.5, Math.cos(a) * 5.0, 8);
  }
  cyl(g, MAT.gun, 4.0, 4.4, 0.7, 0, 0.75, 0, 30);
  racer(g, MAT.gunDark, 3.6, 1.15, 72, 1.6);

  const mount = new THREE.Group();
  mount.position.y = 1.2;
  mount.rotation.y = -0.14;
  g.add(mount);
  cyl(mount, MAT.gun, 3.8, 3.95, 0.5, 0, 0.25, 0, 30);
  box(mount, MAT.gun, 6.4, 0.26, 7.6, 0, 0.62, -1.0);

  for (const s of [-1, 1]) {
    box(mount, MAT.gun, 0.62, 3.6, 4.4, s * 2.3, 2.55, -0.2);
    box(mount, MAT.gunDark, 0.72, 0.36, 4.4, s * 2.3, 4.4, -0.2);
    cyl(mount, MAT.gun, 0.74, 0.8, 0.7, s * 2.3, 4.1, 0.5, 18).rotation.z = Math.PI / 2;
    box(mount, MAT.gunDark, 0.8, 0.42, 0.9, s * 2.3, 4.15, 0.5);
    for (let i = 0; i < 3; i++) {
      cyl(mount, MAT.gunDark, 0.38, 0.38, 0.66, s * 2.3, 2.1, -1.7 + i * 1.5, 14)
        .rotation.z = Math.PI / 2;
    }
    // Sighting cabin outboard of each frame, with a ladder up to it.
    box(mount, MAT.gun, 0.9, 1.2, 1.4, s * 2.98, 3.4, 0.6);
    box(mount, MAT.bore, 0.1, 0.24, 0.5, s * 3.44, 3.6, 0.6);
    box(mount, MAT.steel, 1.0, 0.08, 1.6, s * 3.0, 2.76, 0.6);
    ladder(mount, MAT.steel, 2.14, s * 3.0, 0.62, -0.25, 0);
    handwheel(mount, MAT.gunDark, 0.38, s * 2.86, 2.5, -0.6, 'x');
  }
  box(mount, MAT.gun, 5.2, 0.4, 1.1, 0, 4.4, -2.1);
  box(mount, MAT.gun, 5.2, 0.36, 0.9, 0, 1.5, 1.4);
  box(mount, MAT.gun, 0.96, 1.42, 1.06, 1.6, 1.32, 0.35);

  // Working platform round the breech, railed, reached by steps.
  box(mount, MAT.steel, 6.6, 0.12, 3.0, 0, 2.0, -3.9);
  for (let i = -2; i <= 2; i++) box(mount, MAT.steel, 0.12, 2.0, 0.12, i * 1.5, 1.0, -4.9);
  railing(mount, MAT.steel, 3.0, 3.24, 2.06, -3.9, 0, 1.05);
  railing(mount, MAT.steel, 3.0, -3.24, 2.06, -3.9, 0, 1.05);
  for (const t of [-1, 1]) {
    railing(mount, MAT.steel, 2.5, t * 2.05, 2.06, -5.34, Math.PI / 2, 1.05);
  }
  box(mount, MAT.gun, 0.3, 2.9, 0.3, 1.5, 3.51, -5.1);
  box(mount, MAT.gun, 0.3, 2.9, 0.3, -1.5, 3.51, -5.1);
  box(mount, MAT.gun, 3.3, 0.3, 0.34, 0, 5.11, -5.1);
  box(mount, MAT.dark, 0.11, 1.1, 0.11, 0, 4.41, -5.1);
  round_(mount, bore, 0, 2.06, -4.4);
  round_(mount, bore, 1.9, 2.06, -4.4);
  steps(g, MAT.steel, 3.26, 2.2, 0, 0, -6.6, 0, 1.2);

  const arm = new THREE.Group();
  arm.position.set(0, 4.1, 0.5);
  arm.rotation.x = -0.1;
  mount.add(arm);
  cradle(arm, bore, 5.2, { cylsAbove: 2, cylsBelow: 1, cylsSide: 2, front: 0.34 });
  elevArc(arm, MAT.gunDark, 2.2, 1.6, 0, 0, -0.28, 0.45, 18, 0.42);
  g.userData.guns.push(recoiling(arm, bore, b.calibers, {
    breech: { screw: true, len: 1.05 },
  }));

  duckboards(g, { inner: 3.4, outer: 7.35, from: -1.72, to: 1.72 });
  sandbagArc(g, { r: 7.4, from: -1.62, to: 1.62, courses: 8 });
  spentCases(g, bore, 6, -3.0, -3.6, 2.4);
}

/** Two 16"/50 M1919 on barbette carriages. */
function buildTownsley(g, b) {
  const bore = b.caliber / 1000;
  for (const s of [-1, 1]) {
    const gun = new THREE.Group();
    gun.position.set(s * 9.0, 0, 0);
    g.add(gun);

    cyl(gun, MAT.bed, 3.6, 3.8, 0.34, 0, 0.17, 0, 30);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      cyl(gun, MAT.dark, 0.1, 0.1, 0.18, Math.sin(a) * 3.4, 0.43, Math.cos(a) * 3.4, 8);
    }
    cyl(gun, MAT.olive, 2.7, 3.0, 0.6, 0, 0.62, 0, 28);
    racer(gun, MAT.oliveDark, 2.5, 1.0, 60, 1.4);

    const mount = new THREE.Group();
    mount.position.y = 1.05;
    mount.rotation.y = -s * 0.03;
    gun.add(mount);
    cyl(mount, MAT.olive, 2.6, 2.7, 0.4, 0, 0.2, 0, 28);
    box(mount, MAT.olive, 4.6, 0.22, 6.0, 0, 0.5, -0.8);
    for (const t of [-1, 1]) {
      box(mount, MAT.olive, 0.5, 2.6, 5.2, t * 1.7, 1.85, -0.4);
      box(mount, MAT.oliveDark, 0.6, 0.3, 5.2, t * 1.7, 3.2, -0.4);
      cyl(mount, MAT.olive, 0.6, 0.64, 0.56, t * 1.7, 3.0, 0.9, 16).rotation.z = Math.PI / 2;
      box(mount, MAT.oliveDark, 0.66, 0.34, 0.72, t * 1.7, 3.04, 0.9);
      for (let i = 0; i < 3; i++) {
        cyl(mount, MAT.oliveDark, 0.3, 0.3, 0.54, t * 1.7, 1.6, -2.0 + i * 1.6, 14)
          .rotation.z = Math.PI / 2;
      }
      handwheel(mount, MAT.oliveDark, 0.32, t * 2.22, 1.9, -0.6, 'x');
      box(mount, MAT.olive, 0.6, 0.6, 0.7, t * 1.78, 1.9, -0.6);
    }
    box(mount, MAT.olive, 3.9, 0.34, 0.9, 0, 3.2, -2.6);
    box(mount, MAT.olive, 0.8, 1.0, 0.9, 1.2, 0.9, 0.75);
    sight(mount, -2.05, 2.5, 1.15);

    box(mount, MAT.steel, 4.8, 0.1, 2.6, 0, 1.6, -4.4);
    for (let i = -1; i <= 1; i++) box(mount, MAT.steel, 0.1, 1.6, 0.1, i * 1.8, 0.8, -5.3);
    railing(mount, MAT.steel, 2.6, 2.35, 1.65, -4.4, 0, 1.0);
    railing(mount, MAT.steel, 2.6, -2.35, 1.65, -4.4, 0, 1.0);
    for (const t of [-1, 1]) {
      railing(mount, MAT.steel, 1.7, t * 1.55, 1.65, -5.65, Math.PI / 2, 1.0);
    }
    box(mount, MAT.olive, 0.5, 0.5, 3.0, 0, 1.9, -4.6);
    round_(mount, bore, 1.5, 1.65, -4.1);
    round_(mount, bore, -1.5, 1.65, -4.1);
    steps(gun, MAT.steel, 2.7, 2.0, 0, 0, -6.75, 0, 1.1);

    const arm = new THREE.Group();
    arm.position.set(0, 3.0, 0.9);
    arm.rotation.x = -0.05;
    mount.add(arm);
    cradle(arm, bore, 4.4, {
      mat: MAT.olive, cylsAbove: 0, cylsBelow: 1, cylsSide: 2, front: 0.32,
    });
    elevArc(arm, MAT.oliveDark, 1.75, 1.2, 0, 0, -0.26, 0.42, 15, 0.34);
    g.userData.guns.push(recoiling(arm, bore, b.calibers, {
      barrel: { mat: MAT.olive },
      breech: { mat: MAT.oliveDark, screw: true, len: 1.05 },
    }));

    // The working floor round the barbette, and a revetment behind it that is
    // a wall rather than a pavement: eight courses over nine metres, stepped in
    // at both ends, came out as a low ramp of brickwork lying on the grass.
    duckboards(gun, { inner: 4.1, outer: 6.6, from: -1.85, to: 1.85 });
    sandbagWall(gun, { len: 6.2, z: 6.9, courses: 7 });
    for (const t of [-1, 1]) {
      sandbagWall(gun, { len: 3.6, x: t * 4.6, z: 4.9, ry: t * 1.0, courses: 6 });
    }
    spentCases(gun, bore, 5, -2.6, -3.4, 2.0);
  }
}

/** Schwerer Gustav: eighty centimetres of bore on four rails. */
function buildGustav(g, b) {
  const bore = b.caliber / 1000;
  const TRACK = 62;

  // Ballast, sleepers and four rails, all at ground level.
  box(g, MAT.timber, 21, 0.2, TRACK, 0, 0.1, 0);
  for (let i = -20; i <= 20; i++) box(g, MAT.timber, 19, 0.2, 1.1, 0, 0.3, i * 1.5);
  for (const x of [-7.4, -5.9, 5.9, 7.4]) {
    box(g, MAT.rust, 0.16, 0.24, TRACK, x, 0.52, 0);
    box(g, MAT.rust, 0.36, 0.1, TRACK, x, 0.69, 0);
  }

  // Two bogie trains, four trucks apiece, riding on those rails.
  for (const s of [-1, 1]) {
    const bx = s * 6.65;
    for (let t = -1.5; t <= 1.5; t++) {
      const z = t * 8.0;
      box(g, MAT.gunDark, 2.5, 1.1, 7.2, bx, 1.85, z);
      box(g, MAT.gun, 2.7, 0.22, 7.2, bx, 2.5, z);
      for (let w = 0; w < 5; w++) {
        const wz = z - 2.8 + w * 1.4;
        for (const r of [-0.75, 0.75]) shaft(g, MAT.rust, 0.51, 0.2, bx + r, 1.25, wz, 14);
        shaft(g, MAT.dark, 0.13, 1.7, bx, 1.25, wz, 10);
        box(g, MAT.gunDark, 2.6, 0.24, 0.3, bx, 1.62, wz);
        box(g, MAT.gun, 2.2, 0.13, 0.22, bx, 1.79, wz);
      }
    }
    box(g, MAT.gun, 2.9, 2.0, 40, bx, 3.62, 0);
    for (let i = -9; i <= 9; i++) box(g, MAT.gunDark, 3.04, 1.5, 0.34, bx, 3.62, i * 2.1);
    box(g, MAT.gunDark, 3.1, 0.3, 40, bx, 4.6, 0);
  }
  box(g, MAT.gun, 16.2, 0.9, 26, 0, 5.2, 0);
  for (let i = -5; i <= 5; i++) box(g, MAT.gunDark, 15.4, 0.4, 0.5, 0, 5.72, i * 2.3);
  for (const s of [-1, 1]) {
    box(g, MAT.steel, 1.5, 0.12, 26, s * 8.85, 5.71, 0);
    railing(g, MAT.steel, 26, s * 9.5, 5.77, 0, 0, 1.05);
    ladder(g, MAT.steel, 5.71, s * 9.4, 0, -12.4, 0);
  }

  cyl(g, MAT.gun, 4.4, 4.8, 1.0, 0, 6.15, 1.0, 28);
  racer(g, MAT.gunDark, 4.2, 6.64, 68, 1.6);
  const mount = new THREE.Group();
  mount.position.set(0, 6.7, 1.0);
  g.add(mount);
  cyl(mount, MAT.gun, 4.2, 4.3, 0.5, 0, 0.25, 0, 28);
  box(mount, MAT.gun, 8.2, 0.5, 8.4, 0, 0.6, -1.2);
  for (const s of [-1, 1]) {
    box(mount, MAT.gun, 1.5, 4.6, 6.2, s * 3.1, 3.1, -0.8);
    box(mount, MAT.gunDark, 1.62, 0.4, 6.2, s * 3.1, 5.5, -0.8);
    cyl(mount, MAT.gun, 1.1, 1.2, 1.2, s * 3.1, 4.9, 0.6, 20).rotation.z = Math.PI / 2;
    box(mount, MAT.gunDark, 1.25, 0.6, 1.5, s * 3.1, 4.95, 0.6);
    for (let i = 0; i < 3; i++) {
      cyl(mount, MAT.gunDark, 0.55, 0.55, 1.56, s * 3.1, 2.6, -2.6 + i * 2.0, 14)
        .rotation.z = Math.PI / 2;
    }
    ladder(mount, MAT.steel, 4.6, s * 3.95, 0.85, -3.9, 0);
  }
  box(mount, MAT.gun, 7.5, 0.5, 1.4, 0, 5.5, -3.4);
  box(mount, MAT.gun, 1.36, 1.75, 1.5, 2.05, 1.2, 0.45);

  const arm = new THREE.Group();
  arm.position.set(0, 4.9, 0.6);
  arm.rotation.x = -0.2;
  mount.add(arm);
  cradle(arm, bore, 11.5, { cylsAbove: 2, cylsBelow: 1, cylsSide: 2, front: 0.3 });
  elevArc(arm, MAT.gunDark, 3.3, 2.05, 0, 0, -0.24, 0.46, 20, 0.7);
  g.userData.guns.push(recoiling(arm, bore, b.calibers, {
    breech: { screw: true, len: 1.1 },
  }));

  // The loading gantry, standing on the deck, and a round on its trolley under
  // it: seven tonnes of shell, and the one thing on the model that gives the
  // barrel its scale.
  for (const s of [-1, 1]) {
    box(g, MAT.gun, 0.9, 7.4, 0.9, s * 5.2, 9.35, -11.0);
    box(g, MAT.gunDark, 1.05, 0.4, 1.05, s * 5.2, 5.85, -11.0);
  }
  box(g, MAT.gun, 11.3, 0.9, 1.1, 0, 13.5, -11.0);
  box(g, MAT.gunDark, 0.32, 2.6, 0.32, 0, 11.8, -11.0);
  box(g, MAT.gun, 1.6, 0.5, 2.4, 0, 10.3, -11.0);
  box(g, MAT.steel, 2.2, 0.34, 3.0, 0, 5.82, -11.0);
  for (const r of [-0.9, 0.9]) shaft(g, MAT.dark, 0.16, 2.0, 0, 5.79, -11.0 + r, 12);
  round_(g, bore, 0, 5.99, -11.0);
}

const BUILDERS = {
  flak88: buildFlak88,
  merville: buildMerville,
  longues: buildLongues,
  oscarsborg: buildOscarsborg,
  drum: buildDrum,
  todt: buildTodt,
  townsley: buildTownsley,
  gustav: buildGustav,
};

/**
 * Build one gun, ready to be stood on the ground at y = 0.
 *
 * @returns {{group: THREE.Group, span: number, focusY: number}}
 */
/**
 * Every piece of a gun, unwelded, with its box in the gun's own frame.
 *
 * `buildBattery` welds the whole thing down to one mesh per material, which is
 * what you want on a battlefield and useless for asking whether any single
 * piece of it is standing in mid-air. This builds the same gun and hands back
 * the parts, so that question can be asked -- and answered in a check that runs
 * every time, rather than by somebody noticing a floating sandbag.
 */
export function batteryParts(id) {
  const b = BATTERIES[id] || BATTERIES.longues;
  const group = new THREE.Group();
  group.userData.guns = [];
  (BUILDERS[id] || buildLongues)(group, b);
  group.updateMatrixWorld(true);
  const parts = [];
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    parts.push({
      min: [bb.min.x, bb.min.y, bb.min.z],
      max: [bb.max.x, bb.max.y, bb.max.z],
    });
  });
  return parts;
}

export function buildBattery(id) {
  const b = BATTERIES[id] || BATTERIES.longues;
  const group = new THREE.Group();
  group.userData.guns = [];
  (BUILDERS[id] || buildLongues)(group, b);
  // Nothing on these moves once it is built, so the whole gun welds down to one
  // mesh per material — several hundred pieces becoming a dozen draw calls.
  mergeStatic(group);
  group.updateMatrixWorld(true);
  let bb = new THREE.Box3().setFromObject(group);
  // Shift the whole gun so its middle is over the origin. The camera orbits
  // that origin, and a gun whose muzzle reaches twelve metres one way and five
  // the other is framed off-centre otherwise — which is how a barrel ends up
  // running off the side of the screen.
  const cx = (bb.min.x + bb.max.x) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  for (const child of group.children) { child.position.x -= cx; child.position.z -= cz; }
  group.updateMatrixWorld(true);
  bb = new THREE.Box3().setFromObject(group);
  // What the gun stands on, in metres from its middle: the furthest anything
  // low enough to be resting on the ground reaches out. The barrel is left out
  // of it -- a twenty-metre muzzle is in the air, and the platform under the
  // gun has no business being twenty metres wide because of it.
  let foot = 0;
  const low = Math.max(2.5, (bb.max.y - bb.min.y) * 0.45);
  for (const child of group.children) {
    const a = child.geometry?.attributes?.position;
    if (!a) continue;
    for (let i = 0; i < a.count; i++) {
      if (a.getY(i) > low) continue;
      const d = Math.hypot(a.getX(i) + child.position.x, a.getZ(i) + child.position.z);
      if (d > foot) foot = d;
    }
  }
  return {
    group,
    foot,
    // The recoiling masses, for the scene to fire and to run back.
    guns: group.userData.guns,
    // The gun's real extent now that there is no concrete round it to inflate
    // the box: whichever of the declared span and the measured one is larger,
    // so a barrel that runs out further than expected is still in the frame.
    span: Math.max(b.span, bb.max.x - bb.min.x, bb.max.z - bb.min.z),
    // Looked at a little above the middle of it, which for most of these is the
    // trunnions and for the railway gun is its deck.
    focusY: bb.min.y + (bb.max.y - bb.min.y) * 0.45,
  };
}
