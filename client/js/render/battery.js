// The coast batteries, built out of primitives at their real size.
//
// Every one of these is a portrait rather than a battlefield model: it is
// looked at from ten metres on a screen that has nothing else on it, so the
// embrasure is a hole through a wall rather than a dark rectangle painted on
// one, the barrel has its breech ring and its muzzle swell, and the concrete
// has the pilasters, the drip course and the earth banked against it that a
// casemate actually has.
//
// Metres throughout, and the ground the emplacement stands on is y = 0. The
// gun points down +Z, which is seaward; the scene turns the whole group to
// face whichever way the camera wants it.

import * as THREE from '../../../vendor/three.module.js';
import { BATTERIES } from '../../../shared/batteries.js';
import { mergeStatic } from './merge.js';

// ---------------------------------------------------------------- stuff --

const MAT = {
  // Bunker concrete: poured in 1942, weathered since. Two tones, because a
  // casemate that is one flat colour reads as a block rather than as concrete.
  concrete: new THREE.MeshLambertMaterial({ color: 0x8a8578 }),
  concreteDim: new THREE.MeshLambertMaterial({ color: 0x6e6a5f }),
  // What is behind the embrasure. Not black: a hole that is pure black reads
  // as a missing face rather than as a chamber with a gun in it.
  cave: new THREE.MeshLambertMaterial({ color: 0x1e1c19 }),
  // The chamber itself, which has to be a box turned outside in. A solid one
  // fills the room and hides the gun standing in it; this one is only ever
  // seen from the inside, so what shows through the embrasure is its far wall
  // with the breech in front of it.
  chamber: new THREE.MeshLambertMaterial({ color: 0x272420, side: THREE.BackSide }),
  steel: new THREE.MeshLambertMaterial({ color: 0x4b5157 }),
  gun: new THREE.MeshLambertMaterial({ color: 0x3b4146 }),
  darkSteel: new THREE.MeshLambertMaterial({ color: 0x2b3035 }),
  brass: new THREE.MeshLambertMaterial({ color: 0x8a7238 }),
  rust: new THREE.MeshLambertMaterial({ color: 0x5b3b25 }),
  earth: new THREE.MeshLambertMaterial({ color: 0x6f6248 }),
  turf: new THREE.MeshLambertMaterial({ color: 0x4d5c36 }),
  sandbag: new THREE.MeshLambertMaterial({ color: 0x8d8461 }),
  rock: new THREE.MeshLambertMaterial({ color: 0x585449 }),
  timber: new THREE.MeshLambertMaterial({ color: 0x4a3a28 }),
  // Wehrmacht dunkelgelb, and the olive the Coast Artillery painted with.
  camo: new THREE.MeshLambertMaterial({ color: 0x6d6242 }),
  olive: new THREE.MeshLambertMaterial({ color: 0x4a4f3a }),
};

// Each primitive gets its own geometry rather than a shared unit box scaled to
// fit. Sharing would save allocations for the few milliseconds between building
// an emplacement and welding it down — and mergeStatic disposes every source
// geometry it consumes, which would take the shared one with it and leave the
// next battery holding a freed buffer.

/** A box of a given size, put where it goes. */
function box(g, mat, w, h, d, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  g.add(m);
  return m;
}

/** A cylinder standing on its end unless it is turned. */
function cyl(g, mat, rTop, rBot, h, x, y, z, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/** A cylinder lying along +Z, which is how a gun barrel lies. */
function tube(g, mat, rFront, rBack, len, x, y, z, seg = 18) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rFront, rBack, len, seg), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z + len / 2);
  g.add(m);
  return m;
}

/**
 * A bank of earth: wide at the bottom, narrow at the top, sloped on its outer
 * face and square against whatever it is heaped against.
 *
 * `axis` is which way the slope runs — 'x' for a bank down one flank, 'z' for
 * one across the back — and `sign` is which side of it the outer face is on.
 * `pull` is how much narrower the top is than the base, which is what sets the
 * angle of the slope.
 *
 * It is capped with turf, cut to the top face rather than to the base, because
 * a slab of grass the width of the bottom of the bank hangs in the air over the
 * slope and is the first thing anybody notices.
 */
function bank(g, w, h, d, x, y, z, pull, axis = 'x', sign = 1) {
  const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) <= 0) continue;
    if (axis === 'x') { if (p.getX(i) * sign > 0) p.setX(i, p.getX(i) - sign * pull); }
    else if (p.getZ(i) * sign > 0) p.setZ(i, p.getZ(i) - sign * pull);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, MAT.earth);
  m.position.set(x, y, z);
  g.add(m);
  // The grass on top, exactly as wide as the top of the bank is.
  if (axis === 'x') box(g, MAT.turf, w - pull, 0.3, d, x - sign * pull / 2, y + h / 2, z);
  else box(g, MAT.turf, w, 0.3, d - pull, x, y + h / 2, z - sign * pull / 2);
  return m;
}

// -------------------------------------------------------------- barrels --

/**
 * A gun barrel, from the breech ring to the muzzle.
 *
 * Built to the real shape rather than as one tube: the powder chamber is the
 * thickest part and the chase tapers away from it, which is why a naval gun
 * looks like a cone with a lump at the back and a ring at the front. `bore` is
 * in metres and `calibers` is the length in bores, so an L/50 is fifty of them.
 *
 * The group's origin is the trunnion, and the barrel runs down +Z from it, so
 * the caller elevates by turning the group about x.
 */
function gunBarrel(bore, calibers, opts = {}) {
  const {
    mat = MAT.gun, breechMat = MAT.darkSteel,
    back = 0.9,          // how far the breech reaches behind the trunnion, in bores
    muzzleSwell = true,  // a thickened ring at the muzzle
    jacket = true,       // the thickened breech end of a built-up gun
  } = opts;
  const g = new THREE.Group();
  const L = bore * calibers;
  // A gun is about two and a bit bores across at the breech and a little over
  // one at the muzzle.
  const rB = bore * 1.15;
  const rM = bore * 0.66;

  // The breech: block, ring, and the mushroom head of the obturator.
  const bl = bore * back;
  box(g, breechMat, rB * 2.05, rB * 2.05, bl, 0, 0, -bl / 2);
  tube(g, breechMat, rB * 1.18, rB * 1.18, bore * 0.3, 0, 0, -bl - bore * 0.3);
  if (jacket) {
    // The jacket, shrunk over the back third of the tube.
    tube(g, mat, rB * 0.92, rB, L * 0.3, 0, 0, 0);
    tube(g, mat, rM * 1.32, rB * 0.9, L * 0.55, 0, 0, L * 0.3);
    tube(g, mat, rM, rM * 1.3, L * 0.15, 0, 0, L * 0.85);
  } else {
    tube(g, mat, rM, rB, L, 0, 0, 0);
  }
  if (muzzleSwell) {
    tube(g, mat, rM * 1.16, rM * 1.16, bore * 0.45, 0, 0, L - bore * 0.45);
  }
  // The bore itself, so the muzzle is a hole rather than a disc.
  tube(g, MAT.cave, bore * 0.5, bore * 0.5, bore * 1.4, 0, 0, L - bore * 1.35);
  g.userData.length = L;
  return g;
}

/** The recuperator and recoil cylinders that ride over and under a barrel. */
function recoilGear(g, bore, len, opts = {}) {
  const { above = true, below = true, side = 0 } = opts;
  const r = bore * 0.42;
  if (above) tube(g, MAT.steel, r, r, len, 0, bore * 1.5, -bore * 0.4);
  if (below) {
    tube(g, MAT.steel, r * 0.85, r * 0.85, len * 0.8, 0, -bore * 1.45, -bore * 0.4);
  }
  if (side) {
    for (const s of [-1, 1]) {
      tube(g, MAT.steel, r * 0.8, r * 0.8, len * 0.85, s * bore * 1.5, 0, -bore * 0.4);
    }
  }
}

// ------------------------------------------------------------ casemates --

/**
 * A concrete casemate: the box the gun lives in, with a hole through the front
 * for it to shoot out of.
 *
 * The front is built as four walls round the opening rather than as one wall
 * with a dark patch, so the embrasure is a real hole with a chamber behind it
 * and the wall has thickness where the light catches its edge. The cheeks flare
 * outward, which is what gives the gun its traverse and what makes a casemate
 * recognisable from seaward.
 */
function casemate(g, o) {
  const {
    w = 15, d = 13, h = 5,           // outside, above ground
    wall = 2.0,                       // how thick
    roof = 2.0,
    embW = 3.4, embH = 2.2,           // the opening, at its narrowest
    flare = 1.9,                      // how much wider it is at the front face
    sill = 1.5,                       // how far up the opening starts
    wings = 4.0,                      // blast walls forward of the front face
    wingH = 0.86,                     // and how far up the wall they reach
    berm = true,
    apron = true,
    mat = MAT.concrete, dim = MAT.concreteDim,
  } = o;

  const zF = d / 2;                   // the front face
  const hw = w / 2;

  // Floor slab, and the chamber behind the opening.
  box(g, dim, w, 0.5, d, 0, 0.25, 0);
  box(g, MAT.chamber, w - wall * 2, h - 0.6, d - wall, 0, (h - 0.6) / 2 + 0.5, -wall / 2);

  // Side walls and the back, with a doorway through it.
  for (const s of [-1, 1]) box(g, mat, wall, h, d, s * (hw - wall / 2), h / 2, 0);
  const dr = 1.5;
  box(g, mat, (w - dr) / 2, h, wall, -(w + dr) / 4, h / 2, -zF + wall / 2);
  box(g, mat, (w - dr) / 2, h, wall, (w + dr) / 4, h / 2, -zF + wall / 2);
  box(g, mat, dr, h - 2.3, wall, 0, h - (h - 2.3) / 2, -zF + wall / 2);
  box(g, MAT.cave, dr, 2.3, 0.3, 0, 1.15, -zF + wall * 0.5);

  // The front. Two cheeks flaring outward, a lintel over the opening and a
  // sill under it: four pieces round a hole, not a wall with a stripe on it.
  const inner = embW / 2;
  const outer = embW / 2 + flare;
  for (const s of [-1, 1]) {
    const geo = new THREE.BufferGeometry();
    const x0 = s * inner, x1 = s * outer, x2 = s * hw;
    // A wedge: narrow at the back of the wall, wide at the front face.
    const v = [
      x0, sill, zF - wall, x2, sill, zF - wall, x2, sill + embH, zF - wall,
      x0, sill + embH, zF - wall,
      x1, sill, zF, x2, sill, zF, x2, sill + embH, zF, x1, sill + embH, zF,
    ];
    const idx = s > 0
      ? [0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2, 4, 7, 6, 4, 6, 5]
      : [0, 5, 4, 0, 1, 5, 3, 6, 2, 3, 7, 6, 0, 7, 3, 0, 4, 7, 1, 6, 5, 1, 2, 6, 4, 6, 7, 4, 5, 6];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, mat));
  }
  // Lintel above, sill below, both the full width of the front.
  box(g, mat, w, h - sill - embH, wall, 0, sill + embH + (h - sill - embH) / 2, zF - wall / 2);
  box(g, mat, w, sill, wall, 0, sill / 2, zF - wall / 2);

  // Roof slab, oversailing the walls, with a drip course on the front edge.
  box(g, mat, w + 0.7, roof, d + 0.5, 0, h + roof / 2, 0);
  box(g, dim, w + 0.9, 0.35, 0.5, 0, h + 0.2, zF + 0.3);

  // Pilasters down the sides: shuttering marks and the buttresses between them.
  for (const s of [-1, 1]) {
    for (let i = -1; i <= 1; i++) {
      box(g, dim, 0.35, h - 0.6, 0.9, s * (hw + 0.14), (h - 0.6) / 2 + 0.3, i * d * 0.28);
    }
  }

  // Blast wings running forward from the front face, splayed out.
  if (wings > 0) {
    for (const s of [-1, 1]) {
      const m = box(g, mat, 1.0, h * wingH, wings, s * (hw - 0.3), h * wingH / 2,
        zF + wings / 2);
      m.rotation.y = -s * 0.22;
      m.position.x = s * (hw - 0.3 + Math.sin(0.22) * wings * 0.5);
    }
  }

  // Concrete apron in front, so the gun is not standing on grass.
  if (apron) box(g, dim, w + 2, 0.35, wings + 2.5, 0, 0.17, zF + (wings + 2.5) / 2 - 0.5);

  // Earth banked up the sides and over the back, and turf over the roof, which
  // is what actually hid these things: from seaward the concrete is a rise in
  // the ground with a hole in it.
  if (berm) {
    // Banked partway up the wall rather than over it: the photographs show
    // earth heaped against the flanks with the concrete still standing clear
    // above, and a bank as tall and as broad as the bunker itself would be all
    // anyone could see of the emplacement.
    const bw = h * 0.85;            // how far out the foot of the bank reaches
    const bh = h * 0.74;
    for (const s of [-1, 1]) {
      bank(g, bw, bh, d * 0.94, s * (hw + bw / 2 - 0.2), bh / 2, -d * 0.03,
        bw * 0.62, 'x', s);
    }
    bank(g, w + bw * 1.6, h * 0.86, bw * 1.3, 0, h * 0.43, -zF - bw * 0.62 + 0.2,
      bw * 0.8, 'z', -1);
    box(g, MAT.turf, w + 0.7, 0.3, d + 0.5, 0, h + roof, 0);
  }
}

// ------------------------------------------------------- the eight guns --

/** 8.8 cm Flak 36 in an open ringstand. */
function buildFlak88(g, b) {
  const bore = b.caliber / 1000;

  // The ringstand: a concrete parapet with the pit floor inside it.
  // Closed at the bottom as well as the top: a lathe is an open shell, and an
  // unclosed one shows the inside of its own far wall as a curved black fin
  // hanging off the emplacement.
  const prof = [[3.1, 0], [3.1, 1.25], [3.45, 1.45], [3.75, 1.25], [3.75, 0], [3.1, 0]];
  const lathe = new THREE.LatheGeometry(
    prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  g.add(new THREE.Mesh(lathe, MAT.concrete));
  // The floor runs right out under the parapet: a lathe is an open shell, and
  // a disc that stops at the inner face leaves a ring of daylight under it.
  cyl(g, MAT.concreteDim, 3.8, 3.8, 0.45, 0, -0.15, 0, 28);
  // Ammunition niches let into the inner face of the parapet.
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45;
    box(g, MAT.cave, 0.62, 0.5, 0.3, Math.sin(a) * 2.94, 0.7, Math.cos(a) * 2.94, a);
  }
  // Sandbags round the rim, laid a little unevenly because they were.
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2;
    const r = 3.42 + (i % 3) * 0.02;
    box(g, MAT.sandbag, 0.62, 0.24, 0.34,
      Math.sin(a) * r, 1.55 + (i % 2) * 0.24, Math.cos(a) * r, a + (i % 5) * 0.05);
  }

  // The cruciform platform: the Sonderanhänger outriggers, jacked down level.
  const p = new THREE.Group();
  box(p, MAT.camo, 1.5, 0.3, 1.5, 0, 0.35, 0);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const m = box(p, MAT.camo, dx ? 3.2 : 0.6, 0.22, dz ? 3.2 : 0.6,
      dx * 2.0, 0.35, dz * 2.0);
    m.rotation.y = 0;
    box(p, MAT.darkSteel, 0.4, 0.5, 0.4, dx * 3.4, 0.2, dz * 3.4);
  }
  g.add(p);

  // Pedestal, turntable and the mount itself.
  cyl(g, MAT.camo, 0.62, 0.78, 0.7, 0, 0.85, 0, 16);
  const turn = new THREE.Group();
  turn.position.y = 1.2;
  turn.rotation.y = 0.4;
  g.add(turn);
  cyl(turn, MAT.camo, 0.75, 0.75, 0.36, 0, 0.18, 0, 20);
  // The layers' seats and their handwheels, one either side.
  for (const s of [-1, 1]) {
    box(turn, MAT.camo, 0.5, 0.7, 0.5, s * 0.95, 0.6, -0.15);
    cyl(turn, MAT.darkSteel, 0.28, 0.28, 0.07, s * 1.3, 0.85, 0.2, 14)
      .rotation.z = Math.PI / 2;
    box(turn, MAT.olive, 0.42, 0.12, 0.42, s * 0.95, 1.0, -0.15);
  }
  // The shield: two plates with a fold, which is how the Flak 36's was made.
  const sh = box(turn, MAT.camo, 2.5, 1.35, 0.06, 0, 1.05, 0.62);
  sh.rotation.x = -0.12;
  box(turn, MAT.camo, 2.5, 0.55, 0.05, 0, 1.9, 0.5).rotation.x = 0.42;

  // Trunnions and the barrel, up at the angle an eighty-eight sat at.
  box(turn, MAT.camo, 1.5, 0.5, 0.8, 0, 1.15, 0);
  const arm = new THREE.Group();
  arm.position.set(0, 1.25, 0);
  arm.rotation.x = -0.62;
  turn.add(arm);
  const bar = gunBarrel(bore, b.calibers, { mat: MAT.camo, breechMat: MAT.darkSteel, back: 3.2 });
  arm.add(bar);
  recoilGear(arm, bore, bore * 20, { above: true, below: false });
  // The cradle sleeve the barrel recoils through.
  tube(arm, MAT.camo, bore * 1.5, bore * 1.6, 1.5, 0, 0, 0.1);
  // Muzzle brake — the 36 had one, and it is the first thing anybody draws.
  tube(arm, MAT.darkSteel, bore * 1.15, bore * 1.15, 0.42, 0, 0, bore * b.calibers - 0.1);

  // Ammunition and the crew's clutter.
  for (let i = 0; i < 4; i++) {
    box(g, MAT.olive, 0.85, 0.3, 0.38, -1.5 - (i % 2) * 0.5,
      0.25 + Math.floor(i / 2) * 0.32, 1.6 + Math.floor(i / 2) * 0.45, 0.25);
  }
  box(g, MAT.olive, 0.55, 0.5, 0.9, 1.9, 0.4, -1.4, -0.3);
}

/** 10 cm leFH 14/19(t) in a Type H611 casemate. */
function buildMerville(g, b) {
  const bore = b.caliber / 1000;
  casemate(g, {
    w: 12.5, d: 13, h: 4.2, wall: 2.0, roof: 2.0,
    embW: 2.8, embH: 1.9, flare: 1.7, sill: 1.4, wings: 3.0,
  });
  // The howitzer, wheels and all: it went into the casemate as it came out of
  // the park, split trail and rubber tyres.
  const gun = new THREE.Group();
  gun.position.set(0, 0.5, 3.6);
  gun.rotation.y = 0.06;
  g.add(gun);
  // Split trail, spades down.
  for (const s of [-1, 1]) {
    const t = box(gun, MAT.camo, 0.28, 0.26, 3.4, s * 0.5, 0.35, -1.8);
    t.rotation.y = -s * 0.16;
    box(gun, MAT.darkSteel, 0.34, 0.5, 0.24, s * 1.05, 0.22, -3.4);
  }
  box(gun, MAT.camo, 1.3, 0.45, 1.4, 0, 0.6, -0.3);
  // Wheels.
  for (const s of [-1, 1]) {
    const wl = cyl(gun, MAT.darkSteel, 0.62, 0.62, 0.24, s * 1.15, 0.62, 0, 20);
    wl.rotation.z = Math.PI / 2;
    cyl(gun, MAT.camo, 0.34, 0.34, 0.26, s * 1.15, 0.62, 0, 14).rotation.z = Math.PI / 2;
  }
  // Shield: the leFH's was a flat plate with the top panel folded down.
  box(gun, MAT.camo, 2.0, 1.15, 0.05, 0, 1.15, 0.5).rotation.x = -0.1;
  // Cradle, trunnions, and a short fat howitzer barrel at howitzer elevation.
  box(gun, MAT.camo, 0.9, 0.5, 0.7, 0, 0.95, 0.1);
  const arm = new THREE.Group();
  arm.position.set(0, 1.0, 0.1);
  arm.rotation.x = -0.26;
  gun.add(arm);
  arm.add(gunBarrel(bore, b.calibers, { mat: MAT.camo, back: 2.6, muzzleSwell: false }));
  recoilGear(arm, bore, bore * 12, { above: true, below: true });
  tube(arm, MAT.camo, bore * 1.7, bore * 1.8, 1.1, 0, 0, 0);
  // Ready rounds stacked against the chamber wall.
  for (let i = 0; i < 6; i++) {
    cyl(g, MAT.brass, 0.05, 0.05, 0.5, -3.6 + (i % 3) * 0.16, 0.75, -1.4 - Math.floor(i / 3) * 0.2, 10);
  }
}

/** 15 cm Tbts KC/36 in a Type H612 casemate — the Longues emplacement. */
function buildLongues(g, b) {
  const bore = b.caliber / 1000;
  casemate(g, {
    w: 15.5, d: 13.5, h: 5.0, wall: 2.0, roof: 2.0,
    embW: 3.6, embH: 2.4, flare: 2.2, sill: 1.7, wings: 4.2,
  });
  // The gun stands on its own concrete pivot block, back inside the chamber.
  cyl(g, MAT.concreteDim, 1.5, 1.7, 0.9, 0, 0.5, 1.6, 20);
  const mount = new THREE.Group();
  mount.position.set(0, 0.95, 1.6);
  mount.rotation.y = 0.05;
  g.add(mount);
  cyl(mount, MAT.steel, 1.25, 1.35, 0.5, 0, 0.25, 0, 20);
  // The pedestal and the training gear round it.
  cyl(mount, MAT.gun, 0.8, 0.95, 0.9, 0, 0.85, 0, 18);
  for (const s of [-1, 1]) {
    box(mount, MAT.gun, 0.55, 0.75, 0.6, s * 1.0, 0.85, -0.4);
    cyl(mount, MAT.darkSteel, 0.3, 0.3, 0.08, s * 1.35, 1.0, -0.1, 14)
      .rotation.z = Math.PI / 2;
  }
  // Naval shield: a curved face with a flat roof, the shape the Tbts mounting
  // carried. Built from a lathe segment so the front is actually round.
  const shield = new THREE.Group();
  shield.position.set(0, 1.3, 0);
  mount.add(shield);
  const arc = new THREE.CylinderGeometry(1.55, 1.55, 1.9, 20, 1, true,
    -Math.PI * 0.42, Math.PI * 0.84);
  const sm = new THREE.Mesh(arc, MAT.steel);
  sm.material = MAT.steel;
  sm.position.y = 0.95;
  shield.add(sm);
  cyl(shield, MAT.steel, 1.6, 1.6, 0.09, 0, 1.94, 0, 20);
  for (const s of [-1, 1]) box(shield, MAT.steel, 0.09, 1.9, 1.5, s * 1.5, 0.95, -0.75);
  // Trunnions, cradle and the barrel out through the embrasure.
  box(mount, MAT.gun, 1.1, 0.55, 0.8, 0, 1.85, 0.2);
  const arm = new THREE.Group();
  arm.position.set(0, 1.95, 0.2);
  arm.rotation.x = -0.09;
  mount.add(arm);
  arm.add(gunBarrel(bore, b.calibers, { back: 1.5 }));
  recoilGear(arm, bore, bore * 16, { above: true, below: true });
  tube(arm, MAT.gun, bore * 1.55, bore * 1.7, 2.2, 0, 0, -0.2);
  // Shell hoist housing and a rack of ready rounds along the back wall.
  box(g, MAT.concreteDim, 1.6, 2.4, 1.2, -4.6, 1.2, -4.6);
  for (let i = 0; i < 8; i++) {
    cyl(g, MAT.brass, 0.08, 0.08, 0.68, 4.2 - (i % 4) * 0.26, 0.84,
      -4.4 - Math.floor(i / 4) * 0.3, 10);
  }
  // An observation slit in the roof lip, which the H612 had over the gun.
  box(g, MAT.cave, 1.6, 0.3, 0.2, 0, 5.6, 6.85);
}

/** 28 cm Krupp L/40 in an open barbette pit. */
function buildOscarsborg(g, b) {
  const bore = b.caliber / 1000;
  // The pit: rock cut away and lined with concrete, with a parapet round it.
  const prof = [[6.4, 0], [6.4, 2.2], [6.9, 2.5], [8.4, 2.2], [8.4, 0], [6.4, 0]];
  g.add(new THREE.Mesh(new THREE.LatheGeometry(
    prof.map(([r, y]) => new THREE.Vector2(r, y)), 30), MAT.concrete));
  cyl(g, MAT.concreteDim, 6.42, 6.42, 0.5, 0, -0.25, 0, 30);
  // The mound the pit is sunk into, turned as one piece: a ring of boxes round
  // a gun pit reads as a ring of boxes however they are shuffled.
  const moundProf = [[8.3, 0], [8.3, 1.4], [8.75, 1.45], [11.5, 0.75], [16, 0]];
  g.add(new THREE.Mesh(new THREE.LatheGeometry(
    moundProf.map(([r, y]) => new THREE.Vector2(r, y)), 32), MAT.earth));
  // And the rock the mound is heaped against, breaking out of it landward.
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * 0.66 + (i / 5) * Math.PI * 0.68;
    const r = 10.6 + (i % 3) * 0.8;
    box(g, MAT.rock, 3.6 + (i % 3) * 1.1, 1.5 + (i % 4) * 0.5, 3.0,
      Math.sin(a) * r, 0.4 + (i % 3) * 0.2, Math.cos(a) * r, a + (i % 4) * 0.11);
  }
  // Ammunition niches and the shell rail round the inside of the parapet.
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * 0.62 + (i / 5) * Math.PI * 0.76;
    box(g, MAT.cave, 1.0, 1.1, 0.4, Math.sin(a) * 6.28, 0.8, Math.cos(a) * 6.28, a);
  }

  // The mounting: a big pivot, a heavy carriage and the barrel over it.
  cyl(g, MAT.concreteDim, 2.6, 3.0, 0.7, 0, 0.35, 0, 24);
  const mount = new THREE.Group();
  mount.position.set(0, 0.7, 0);
  mount.rotation.y = 0.12;
  g.add(mount);
  cyl(mount, MAT.steel, 2.35, 2.5, 0.55, 0, 0.28, 0, 24);
  // Racer and the two side frames the trunnions sit in.
  for (const s of [-1, 1]) {
    const f = box(mount, MAT.gun, 0.5, 2.4, 4.0, s * 1.55, 1.5, -0.3);
    f.rotation.x = 0.0;
    box(mount, MAT.gun, 0.6, 0.9, 1.1, s * 1.55, 2.9, 0.1);
    cyl(mount, MAT.darkSteel, 0.55, 0.55, 0.14, s * 1.9, 1.1, -1.6, 16)
      .rotation.z = Math.PI / 2;
  }
  box(mount, MAT.gun, 3.1, 0.7, 3.6, 0, 0.75, -0.3);
  // Shield: the old Krupp guns carried a heavy curved mantlet rather than a
  // full house, so the barrel comes out of a shield that turns with it.
  const arm = new THREE.Group();
  arm.position.set(0, 2.55, 0.1);
  arm.rotation.x = -0.16;
  mount.add(arm);
  // The mantlet: a plate house across the front of the trunnions that turns
  // and elevates with the gun. Solid plate rather than a curved sheet — an
  // open-ended arc has no thickness and reads as a fin from behind.
  box(arm, MAT.steel, 4.4, 2.9, 0.22, 0, 0.35, 1.35);
  for (const t of [-1, 1]) {
    const cheek = box(arm, MAT.steel, 0.2, 2.7, 2.2, t * 2.1, 0.35, 0.3);
    cheek.rotation.y = -t * 0.10;
  }
  box(arm, MAT.steel, 4.3, 0.2, 2.2, 0, 1.75, 0.35);
  box(arm, MAT.steel, 4.3, 0.2, 1.4, 0, -1.05, 0.75);
  arm.add(gunBarrel(bore, b.calibers, { back: 1.6 }));
  recoilGear(arm, bore, bore * 9, { above: false, below: true, side: 1 });
  tube(arm, MAT.gun, bore * 1.45, bore * 1.6, 3.2, 0, 0, 0.2);
  // The layers' platforms either side, and the loading tray behind.
  for (const s of [-1, 1]) {
    box(mount, MAT.steel, 1.3, 0.1, 2.2, s * 2.6, 1.35, -0.6);
    for (let i = 0; i < 3; i++) box(mount, MAT.steel, 0.06, 1.0, 0.06, s * (2.1 + i * 0.5), 1.85, 0.4);
  }
  box(mount, MAT.gun, 1.4, 0.35, 2.6, 0, 2.1, -2.6);
  // A rangefinder post on the parapet, where the sound-and-flash men stood.
  cyl(g, MAT.concrete, 0.5, 0.6, 2.4, -7.2, 1.2, -3.4, 14);
  box(g, MAT.steel, 2.2, 0.35, 0.35, -7.2, 2.5, -3.4);
}

/** Fort Drum's twin 14"/50 turret, without the concrete ship under it. */
function buildDrum(g, b) {
  const bore = b.caliber / 1000;
  // A low ring of concrete for it to stand on, and no more than that.
  cyl(g, MAT.concreteDim, 7.6, 8.2, 1.1, 0, 0.55, 0, 32);
  cyl(g, MAT.concrete, 7.0, 7.0, 0.3, 0, 1.2, 0, 32);

  const t = new THREE.Group();
  t.position.y = 1.35;
  t.rotation.y = -0.34;
  g.add(t);
  // The armoured barbette drum the turret trains in.
  cyl(t, MAT.darkSteel, 6.1, 6.2, 1.5, 0, 0.75, 0, 30);
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    box(t, MAT.steel, 0.5, 0.16, 0.16, Math.sin(a) * 6.2, 1.42, Math.cos(a) * 6.2, a);
  }

  // The gunhouse: sloped face, flat roof, overhanging rear. Built as a box
  // whose front face is raked back, which is what an armoured face plate is.
  const gh = new THREE.Group();
  gh.position.y = 1.5;
  t.add(gh);
  const W = 8.6, H = 3.4, D = 8.8;
  const geo = new THREE.BoxGeometry(W, H, D).toNonIndexed();
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // Rake the front face back at the top and pull the sides in a little, so
    // the house tapers the way a turret does.
    if (pos.getZ(i) > 0 && pos.getY(i) > 0) pos.setZ(i, D * 0.34);
    if (pos.getZ(i) > 0) pos.setX(i, pos.getX(i) * 0.88);
  }
  geo.computeVertexNormals();
  const house = new THREE.Mesh(geo, MAT.steel);
  house.position.y = H / 2;
  gh.add(house);
  // Roof plate, sighting hoods and the rangefinder ears out the back corners.
  box(gh, MAT.darkSteel, W * 0.95, 0.22, D * 0.86, 0, H + 0.05, -D * 0.06);
  for (const s of [-1, 1]) {
    cyl(gh, MAT.steel, 0.62, 0.68, 0.55, s * 2.4, H + 0.35, -1.2, 16);
    cyl(gh, MAT.darkSteel, 0.2, 0.2, 0.5, s * 2.4, H + 0.8, -1.2, 12);
    box(gh, MAT.steel, 1.5, 1.1, 1.0, s * (W / 2 - 0.1), 1.9, -D / 2 + 0.9);
  }
  box(gh, MAT.steel, 2.4, 0.8, 0.7, 0, H + 0.45, -D / 2 + 0.5);
  // Two 14-inch rifles, side by side, in their own embrasures.
  for (const s of [-1, 1]) {
    box(gh, MAT.darkSteel, 2.0, 1.7, 0.5, s * 1.85, 1.75, D * 0.30);
    box(gh, MAT.cave, 1.3, 1.1, 0.3, s * 1.85, 1.75, D * 0.33);
    const arm = new THREE.Group();
    arm.position.set(s * 1.85, 1.75, D * 0.20);
    arm.rotation.x = -0.07;
    gh.add(arm);
    arm.add(gunBarrel(bore, b.calibers, { back: 1.1 }));
    // The sleeve the rifle runs out through.
    tube(arm, MAT.gun, bore * 1.4, bore * 1.5, 2.0, 0, 0, 0.1);
  }
}

/** 38 cm SK C/34 in the Cap Gris-Nez casemate. */
function buildTodt(g, b) {
  const bore = b.caliber / 1000;
  casemate(g, {
    w: 30, d: 32, h: 15, wall: 3.5, roof: 3.5,
    embW: 7.5, embH: 5.6, flare: 5.0, sill: 4.2, wings: 5.5, wingH: 0.42,
    berm: false, apron: true,
  });
  // The Todt casemates were stepped rather than slab-sided: the front is a
  // wedge of concrete rising back to the roof, which is what made them so hard
  // to hit from seaward.
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    // Rising back from the embrasure, each course a little taller and a little
    // narrower than the one in front of it.
    box(g, MAT.concrete, 30 - t * 2.5, 1.5 + t * 3.4, 9,
      0, 18.5 + (1.5 + t * 3.4) / 2, 11.5 - i * 8.6);
  }
  // ...with a skirt of concrete down each flank, stepping down toward the sea.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      box(g, MAT.concreteDim, 3.6, 15.5 - i * 3.0, 8.4, s * 16.6,
        (15.5 - i * 3.0) / 2, -12 + i * 8.4);
    }
  }
  bank(g, 46, 17, 22, 0, 8.5, -27, 16, 'z', -1);
  // A Tobruk observation cupola on the shoulder of the roof.
  cyl(g, MAT.concrete, 1.5, 1.8, 1.6, -11.5, 19.3, 10, 18);
  cyl(g, MAT.cave, 1.15, 1.15, 0.4, -11.5, 20.2, 10, 18);

  // The gun: a naval mounting on its Bettung, high up in the chamber.
  cyl(g, MAT.concreteDim, 4.6, 5.2, 2.4, 0, 1.2, 4, 26);
  const mount = new THREE.Group();
  mount.position.set(0, 2.4, 4);
  mount.rotation.y = -0.04;
  g.add(mount);
  cyl(mount, MAT.steel, 4.2, 4.4, 1.1, 0, 0.55, 0, 26);
  for (const s of [-1, 1]) {
    box(mount, MAT.gun, 1.1, 4.2, 6.4, s * 2.9, 2.9, -0.6);
    box(mount, MAT.gun, 1.3, 1.6, 2.0, s * 2.9, 5.4, 0.4);
  }
  box(mount, MAT.gun, 5.6, 1.3, 5.8, 0, 1.5, -0.8);
  const arm = new THREE.Group();
  arm.position.set(0, 4.7, 0.6);
  arm.rotation.x = -0.11;
  mount.add(arm);
  arm.add(gunBarrel(bore, b.calibers, { back: 1.3 }));
  recoilGear(arm, bore, bore * 10, { above: true, below: true, side: 1 });
  tube(arm, MAT.gun, bore * 1.5, bore * 1.7, 5.0, 0, 0, -0.4);
  // Shell and charge handling behind the mounting.
  box(g, MAT.steel, 3.0, 0.5, 9.0, 0, 3.6, -9);
  for (let i = 0; i < 5; i++) {
    cyl(g, MAT.gun, 0.19, 0.19, 1.7, -1.0 + i * 0.5, 4.5, -6 - (i % 2) * 0.8, 12)
      .rotation.x = Math.PI / 2;
  }
  box(g, MAT.concreteDim, 4.0, 6.0, 3.0, -11, 3.0, -12);
}

/** A casemated 16-inch barbette pair — Townsley and Davis. */
function buildTownsley(g, b) {
  const bore = b.caliber / 1000;
  const W = 36, D = 26, H = 9;
  // The casemate proper: one block, two guns, an embrasure apiece.
  box(g, MAT.concreteDim, W, 0.6, D, 0, 0.3, 0);
  box(g, MAT.concrete, 3.0, H, D, 0, H / 2, 0);                       // centre pier
  for (const s of [-1, 1]) box(g, MAT.concrete, 3.0, H, D, s * (W / 2 - 1.5), H / 2, 0);
  box(g, MAT.concrete, W, H, 3.0, 0, H / 2, -D / 2 + 1.5);
  box(g, MAT.concrete, W + 1.2, 3.0, D + 1.0, 0, H + 1.5, 0);          // roof slab
  for (const s of [-1, 1]) {
    // Each gun room, its opening and the chamber behind it.
    box(g, MAT.chamber, 12.5, H - 0.6, D - 4, s * 9.5, (H - 0.6) / 2 + 0.6, -1.5);
    box(g, MAT.concrete, 12.5, H - 5.2, 3.0, s * 9.5, H - (H - 5.2) / 2, D / 2 - 1.5);
    box(g, MAT.concrete, 12.5, 2.2, 3.0, s * 9.5, 1.1, D / 2 - 1.5);
    for (const t of [-1, 1]) {
      box(g, MAT.concrete, 2.6, 3.0, 3.0, s * 9.5 + t * 4.5, 3.3, D / 2 - 1.5);
    }
  }
  // Twenty feet of concrete under a hill of earth: from seaward it is a rise
  // in the ground with two square holes in it.
  for (const s of [-1, 1]) {
    bank(g, 13, H + 3, D * 0.9, s * (W / 2 + 6.0), (H + 3) / 2, -1.5, 9, 'x', s);
  }
  bank(g, W + 24, H + 3, 18, 0, (H + 3) / 2, -D / 2 - 8, 13, 'z', -1);
  box(g, MAT.turf, W + 1.2, 0.3, D + 1.0, 0, H + 3.05, 0);
  // Concrete apron and the splinter wall along the front.
  box(g, MAT.concreteDim, W + 6, 0.4, 8, 0, 0.2, D / 2 + 3.6);
  for (const s of [-1, 1]) box(g, MAT.concrete, 1.2, 4.0, 7.0, s * (W / 2 + 1.4), 2.0, D / 2 + 3);

  // Two 16-inch guns on barbette carriages, run out through the openings.
  for (const s of [-1, 1]) {
    cyl(g, MAT.concreteDim, 2.6, 3.0, 1.4, s * 9.5, 0.7, 1.5, 22);
    const mount = new THREE.Group();
    mount.position.set(s * 9.5, 1.4, 1.5);
    mount.rotation.y = -s * 0.02;
    g.add(mount);
    cyl(mount, MAT.olive, 2.3, 2.45, 0.7, 0, 0.35, 0, 22);
    for (const t of [-1, 1]) {
      box(mount, MAT.olive, 0.7, 2.6, 4.6, t * 1.8, 2.0, -0.4);
      box(mount, MAT.olive, 0.9, 1.0, 1.4, t * 1.8, 3.6, 0.3);
    }
    box(mount, MAT.olive, 3.6, 0.9, 4.2, 0, 1.1, -0.5);
    const arm = new THREE.Group();
    arm.position.set(0, 3.0, 0.3);
    arm.rotation.x = -0.05;
    mount.add(arm);
    arm.add(gunBarrel(bore, b.calibers, { mat: MAT.olive, back: 1.2 }));
    recoilGear(arm, bore, bore * 9, { above: false, below: true, side: 1 });
    tube(arm, MAT.olive, bore * 1.5, bore * 1.65, 3.4, 0, 0, -0.3);
    // The loading platform and the rammer behind the breech.
    box(mount, MAT.steel, 4.4, 0.12, 3.0, 0, 1.9, -3.2);
    box(mount, MAT.olive, 0.7, 0.7, 3.4, 0, 2.8, -3.6);
  }
}

/** Schwerer Gustav: 80 cm of bore on two double tracks. */
function buildGustav(g, b) {
  const bore = b.caliber / 1000;
  const L = bore * b.calibers;

  // The track: four rails on a bed of sleepers, in a shallow cutting.
  box(g, MAT.rock, 26, 0.5, 90, 0, -0.25, 0);
  for (let i = -22; i <= 22; i++) {
    box(g, MAT.timber, 22, 0.24, 1.1, 0, 0.12, i * 2.0);
  }
  for (const x of [-7.4, -5.9, 5.9, 7.4]) {
    box(g, MAT.rust, 0.16, 0.34, 88, x, 0.4, 0);
    box(g, MAT.rust, 0.34, 0.1, 88, x, 0.57, 0);
  }
  // The cutting walls either side, so it reads as dug in rather than parked.
  for (const s of [-1, 1]) {
    // The cutting walls slope away from the track, not toward it.
    bank(g, 14, 4.5, 90, s * 20, 2.25, 0, 7, 'x', -s);
  }

  // Two bogie trains, one under each pair of rails, four trucks to a side.
  for (const s of [-1, 1]) {
    const bx = s * 6.65;
    for (let t = -1.5; t <= 1.5; t++) {
      const z = t * 9.5;
      box(g, MAT.darkSteel, 2.4, 1.5, 8.4, bx, 1.35, z);
      for (let wI = 0; wI < 5; wI++) {
        const wz = z - 3.4 + wI * 1.7;
        const wl = cyl(g, MAT.rust, 0.5, 0.5, 0.26, bx, 0.62, wz, 14);
        wl.rotation.z = Math.PI / 2;
        box(g, MAT.darkSteel, 2.6, 0.34, 0.3, bx, 0.62, wz);
      }
    }
    // The longitudinal girder each train carries.
    box(g, MAT.gun, 3.0, 2.2, 42, bx, 3.2, 0);
    for (let i = -4; i <= 4; i++) box(g, MAT.darkSteel, 3.2, 1.6, 0.4, bx, 3.2, i * 4.6);
  }
  // The cross-braced deck that ties the two trains together.
  box(g, MAT.gun, 16.5, 1.1, 30, 0, 4.7, 0);
  for (let i = -3; i <= 3; i++) box(g, MAT.darkSteel, 15, 0.5, 0.5, 0, 5.3, i * 4.4);
  // Stairs and railed walkways down both sides — the crew of two hundred and
  // fifty had to get about it somehow.
  for (const s of [-1, 1]) {
    box(g, MAT.steel, 1.6, 0.12, 30, s * 9.0, 5.35, 0);
    for (let i = -6; i <= 6; i++) {
      box(g, MAT.steel, 0.08, 1.0, 0.08, s * 9.7, 5.9, i * 2.4);
    }
    box(g, MAT.steel, 1.7, 0.08, 30, s * 9.7, 6.4, 0);
    for (let i = 0; i < 8; i++) box(g, MAT.steel, 1.2, 0.1, 0.4, s * 10.6, 0.7 + i * 0.62, -12 + i * 0.5);
  }

  // The turntable the whole mounting elevates from.
  cyl(g, MAT.gun, 4.6, 5.0, 1.2, 0, 5.85, 1.5, 26);
  const mount = new THREE.Group();
  mount.position.set(0, 6.4, 1.5);
  g.add(mount);
  // The trunnion frames, which on Gustav were as tall as a house.
  for (const s of [-1, 1]) {
    box(mount, MAT.gun, 1.6, 5.2, 7.0, s * 3.4, 2.6, -1.0);
    box(mount, MAT.darkSteel, 1.9, 2.0, 2.6, s * 3.4, 4.6, 0.6);
    // Elevating arcs.
    const arc = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.5, 22, 1, true,
      Math.PI * 0.05, Math.PI * 0.55), MAT.darkSteel);
    arc.rotation.z = Math.PI / 2;
    arc.position.set(s * 2.4, 4.6, 0.6);
    mount.add(arc);
  }
  box(mount, MAT.gun, 8.6, 1.6, 8.0, 0, 0.8, -1.0);

  const arm = new THREE.Group();
  arm.position.set(0, 4.6, 0.6);
  arm.rotation.x = -0.22;
  mount.add(arm);
  // The cradle: a box girder the barrel recoils through, most of its length.
  box(arm, MAT.gun, 3.2, 3.0, 12, 0, 0, 5.0);
  for (let i = 0; i < 6; i++) box(arm, MAT.darkSteel, 3.4, 0.4, 0.5, 0, 0, 1.0 + i * 2.0);
  arm.add(gunBarrel(bore, b.calibers, { back: 2.2 }));
  recoilGear(arm, bore, 9, { above: true, below: false, side: 1 });
  // The breech end: on this gun it was a wagon in its own right.
  box(arm, MAT.darkSteel, 3.4, 3.4, 3.0, 0, 0, -3.2);
  cyl(arm, MAT.gun, 1.5, 1.5, 0.6, 0, 0, -4.9, 20).rotation.x = Math.PI / 2;

  // The loading crane and a shell on its trolley, which is the only way the
  // scale of the thing reads: the round is seven tonnes and taller than a man.
  box(g, MAT.gun, 1.0, 9.0, 1.0, -6.0, 10.4, -13);
  box(g, MAT.gun, 1.0, 9.0, 1.0, 6.0, 10.4, -13);
  box(g, MAT.gun, 13.5, 1.0, 1.2, 0, 14.6, -13);
  box(g, MAT.darkSteel, 0.3, 3.4, 0.3, 0, 12.6, -13);
  const sh = new THREE.Group();
  sh.position.set(0, 7.2, -13);
  sh.rotation.x = Math.PI / 2;
  g.add(sh);
  cyl(sh, MAT.rust, 0.4, 0.4, 2.6, 0, 0, 0, 18);
  cyl(sh, MAT.rust, 0.06, 0.4, 1.5, 0, 2.0, 0, 18);
  box(g, MAT.darkSteel, 2.0, 0.6, 3.0, 0, 5.7, -13);
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
 * Build one emplacement, ready to be stood on the ground at y = 0.
 *
 * @returns {{group: THREE.Group, span: number, focusY: number}}
 */
export function buildBattery(id) {
  const b = BATTERIES[id] || BATTERIES.longues;
  const group = new THREE.Group();
  (BUILDERS[id] || buildLongues)(group, b);
  // Nothing on these moves, so the whole emplacement welds down to one mesh
  // per material — a couple of hundred boxes becoming a dozen draw calls.
  mergeStatic(group);
  group.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(group);
  return {
    group,
    // The declared size of the emplacement, not the bounding box: the earth
    // banked round a casemate and the cutting Gustav stands in are ground
    // rather than gun, and framing on them puts the gun in the distance.
    span: b.span,
    // Looked at a little above the middle of it, which for a casemate is the
    // embrasure and for a railway gun is the trunnions.
    focusY: bb.min.y + (bb.max.y - bb.min.y) * 0.42,
  };
}
