// USS Iowa, built out of primitives.
//
// This is a portrait rather than the battle's view-model: the fast hull that
// `ships.js` puts on the water is right for forty of them at once, and wrong
// for one ship the eye is meant to rest on. Everything here is to scale off the
// real vessel — 270 m over all, 33 m beam, 11 m draft, nine 16"/50 in three
// triples, twenty 5"/38 in ten twins, twenty quad Bofors and the Oerlikons
// along the deck edges — so the proportions hold whether she is a mile off at
// a dock or filling the bottom of the frame.
//
// Local frame matches the rest of the renderer: +Z is the bow, +X is starboard,
// y = 0 is the waterline.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic } from './merge.js';
import { buildInterior, bySection } from './interior.js';

export const LOA = 270;
export const BEAM = 33;
export const DRAFT = 11;
// Main deck height amidships. She has a good deal of sheer forward.
const DECK = 9.6;
// Where the bow section parts from the rest when the magazines go.
const SPLIT_Z = 44;

const P = {
  hull: 0x5b6875,        // measure 22: navy blue up to the sheer strake
  hullUpper: 0x79838d,   // haze grey above it
  deck: 0x3f4753,        // deck blue
  wood: 0x6d6350,        // the teak that is left
  boot: 0x181b1f,
  antifoul: 0x6d2b21,
  gun: 0x6b747d,
  gunDark: 0x474e56,
  canvas: 0x8b8b80,
  glass: 0x2c3a46,
  rail: 0x555c64,
  radar: 0x8e9299,
  plane: 0x33506f,
  brass: 0x8a7340,
};

const MATS = {};
const mat = (color, opts) => {
  const key = color + JSON.stringify(opts || '');
  if (!MATS[key]) MATS[key] = new THREE.MeshLambertMaterial({ color, ...opts });
  return MATS[key];
};

const box = (w, h, d, color, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  return m;
};

const cyl = (rt, rb, h, color, seg = 12) =>
  new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));

/** A horizontal tube — a gun barrel, a boom, a yard. */
const tube = (r, len, color, seg = 8) => {
  const m = cyl(r, r, len, color, seg);
  m.rotation.x = Math.PI / 2;
  return m;
};

// ---------------------------------------------------------------- the hull --

/**
 * Half-beam at a station. t runs -1 at the transom to +1 at the stem.
 *
 * An Iowa is a very fine hull: the forward third narrows to almost nothing to
 * carry 33 knots, and the stern is cut off square above the screws. Getting
 * that fineness right is most of what makes the shape read as her and not as a
 * generic battleship.
 */
function halfBeam(t) {
  const b = BEAM / 2;
  if (t > 0.30) {
    // Forebody: a long, hollow entry running out to the stem.
    const u = (t - 0.30) / 0.70;
    return b * Math.pow(1 - u, 0.72) * (1 - u * 0.10);
  }
  if (t > -0.42) return b;                                  // parallel midbody
  const u = (-0.42 - t) / 0.58;                             // run aft
  return b * (1 - Math.pow(u, 1.6) * 0.52);
}

/** Depth of the keel below the waterline at a station. */
function keelAt(t) {
  if (t > 0.55) return -DRAFT * (1 - Math.pow((t - 0.55) / 0.45, 1.7) * 0.55);
  if (t < -0.72) return -DRAFT * (1 - Math.pow((-0.72 - t) / 0.28, 1.5) * 0.45);
  return -DRAFT;
}

/** Height of the main deck at a station: sheer rising toward the bow. */
function sheerAt(t) {
  return DECK + Math.pow(Math.max(0, t), 2.2) * 4.2 + Math.pow(Math.max(0, -t), 3) * 0.6;
}

/** Flare: how much wider she is at deck level than at the waterline. */
function flareAt(t) {
  return 1 + Math.pow(Math.max(0, t), 2.4) * 0.85;
}

/**
 * The hull, in two pieces: everything abaft the forward barbettes, and the bow
 * section forward of them. She is drawn that way so that when her forward
 * magazines go the bow can be heaved up out of the water as a unit, the way it
 * happens to a ship that loses them.
 */
function buildHull() {
  const g = new THREE.Group();
  const fwd = new THREE.Group();
  g.add(fwd);
  const N = 60;
  const rings = [];
  for (let i = 0; i <= N; i++) {
    const t = -1 + (2 * i) / N;
    rings.push({
      t,
      z: (t * LOA) / 2,
      w: halfBeam(t),
      wDeck: halfBeam(t) * flareAt(t),
      deckY: sheerAt(t),
      keelY: keelAt(t),
    });
  }

  // A band of the hull between two heights, taking its width from either the
  // waterline beam or the flared deck beam, over a range of stations.
  const band = (yTop, yBot, wTop, wBot, color, i0, i1) => {
    const pos = [];
    for (let i = i0; i < i1; i++) {
      const a = rings[i], b = rings[i + 1];
      for (const s of [1, -1]) {
        const at = wTop(a) * s, bt = wTop(b) * s;
        const ab = wBot(a) * s, bb = wBot(b) * s;
        const ay = yTop(a), by = yTop(b), ay2 = yBot(a), by2 = yBot(b);
        if (s === 1) {
          pos.push(at, ay, a.z, ab, ay2, a.z, bb, by2, b.z);
          pos.push(at, ay, a.z, bb, by2, b.z, bt, by, b.z);
        } else {
          pos.push(at, ay, a.z, bb, by2, b.z, ab, ay2, a.z);
          pos.push(at, ay, a.z, bt, by, b.z, bb, by2, b.z);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat(color));
  };

  const W = (r) => r.w, WD = (r) => r.wDeck;
  // The station the bow section breaks at: just forward of the barbettes.
  const split = rings.findIndex((r) => r.z >= SPLIT_Z);

  const bands = (into, i0, i1) => {
    into.add(band((r) => r.deckY, () => 5.4, WD, W, P.hullUpper, i0, i1));
    into.add(band(() => 5.4, () => 1.1, W, W, P.hull, i0, i1));
    into.add(band(() => 1.1, () => -1.1, W, W, P.boot, i0, i1));
    into.add(band(() => -1.1, (r) => r.keelY, W, (r) => Math.max(0.6, r.w * 0.18),
      P.antifoul, i0, i1));

    const deck = [];
    for (let i = i0; i < i1; i++) {
      const a = rings[i], b = rings[i + 1];
      deck.push(-a.wDeck, a.deckY, a.z, a.wDeck, a.deckY, a.z, b.wDeck, b.deckY, b.z);
      deck.push(-a.wDeck, a.deckY, a.z, b.wDeck, b.deckY, b.z, -b.wDeck, b.deckY, b.z);
    }
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute('position', new THREE.Float32BufferAttribute(deck, 3));
    dGeo.computeVertexNormals();
    into.add(new THREE.Mesh(dGeo, mat(P.deck)));
  };
  bands(g, 0, split);
  bands(fwd, split, N);

  // The bulkhead the break leaves standing: torn plating where she parted. Cut
  // to the station's own section rather than boxed, or its corners stand out
  // through her sides as a fin while she is still in one piece.
  const b = rings[split];
  const kw = Math.max(0.6, b.w * 0.18);
  const sect = [
    -b.w, b.deckY, b.z, b.w, b.deckY, b.z, kw, b.keelY, b.z,
    -b.w, b.deckY, b.z, kw, b.keelY, b.z, -kw, b.keelY, b.z,
  ];
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.Float32BufferAttribute(sect, 3));
  sGeo.computeVertexNormals();
  g.add(new THREE.Mesh(sGeo, mat(P.gunDark)));

  // Transom: she is cut off square aft, which is the one flat face on her.
  const st = rings[0];
  const transom = box(st.wDeck * 2, st.deckY + DRAFT, 0.6, P.hull, 0,
    (st.deckY - DRAFT) / 2, st.z - 0.3);
  g.add(transom);

  // Teak laid over the steel forward and aft of the superstructure. The
  // forecastle patch goes on the bow section, or it stays hanging in the air
  // when the bow goes.
  for (const [z, len, w] of [[86, 60, 13], [-46, 64, 15]]) {
    const planks = box(w * 2, 0.25, len, P.wood, 0, DECK + 2.0, z);
    planks.position.y = sheerAt(z / (LOA / 2)) + 0.14;
    (z >= SPLIT_Z ? fwd : g).add(planks);
  }

  return { group: g, forward: fwd, rings };
}

// ------------------------------------------------------------- the batteries --

/** One 16"/50 triple: barbette, house, blast bags and three rifles. */
function turret16() {
  const g = new THREE.Group();

  // Barbette: 11.6 m across, standing proud of the deck.
  const barbette = cyl(5.8, 5.9, 3.0, P.hull, 20);
  barbette.position.y = 1.5;
  g.add(barbette);

  // Gunhouse: sloped face, flat roof, overhanging rear.
  const house = box(12.4, 4.4, 10.4, P.gun, 0, 5.2, -0.6);
  g.add(house);
  const face = new THREE.Mesh(new THREE.BoxGeometry(12.4, 4.4, 3.6), mat(P.gun));
  face.position.set(0, 5.0, 5.4);
  face.rotation.x = -0.30;
  g.add(face);
  g.add(box(11.6, 0.35, 10.0, P.gunDark, 0, 7.5, -0.8));
  // Rangefinder ears out either side of the house.
  for (const s of [-1, 1]) g.add(box(1.5, 1.1, 3.4, P.gunDark, s * 6.6, 6.4, -3.4));
  // The sighting hoods and the roof-mounted 20 mm tub.
  g.add(box(1.6, 0.9, 1.6, P.gunDark, 0, 7.9, 2.2));

  // Three rifles: 20.7 m of barrel outside the house, tapering to the muzzle.
  for (const off of [-3.9, 0, 3.9]) {
    const bag = cyl(1.35, 1.6, 2.6, P.canvas, 10);
    bag.rotation.x = Math.PI / 2;
    bag.position.set(off, 5.0, 6.6);
    g.add(bag);

    const chase = cyl(0.42, 0.62, 20.7, P.gunDark, 10);
    chase.rotation.x = Math.PI / 2;
    chase.position.set(off, 5.0, 17.6);
    g.add(chase);
    // Muzzle swell.
    const muzzle = cyl(0.5, 0.45, 1.4, P.gunDark, 10);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(off, 5.0, 28.4);
    g.add(muzzle);
  }
  return g;
}

/** A twin 5"/38 in its Mk28 enclosed mount. */
function mount5() {
  const g = new THREE.Group();
  const ring = cyl(2.2, 2.3, 1.2, P.gun, 14);
  ring.position.y = 0.6;
  g.add(ring);
  const house = box(4.4, 2.6, 5.0, P.gun, 0, 2.5, -0.2);
  g.add(house);
  const face = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.4, 1.6), mat(P.gun));
  face.position.set(0, 2.4, 2.5);
  face.rotation.x = -0.35;
  g.add(face);
  for (const off of [-1.0, 1.0]) {
    const bag = cyl(0.55, 0.65, 1.1, P.canvas, 8);
    bag.rotation.x = Math.PI / 2;
    bag.position.set(off, 2.4, 3.2);
    g.add(bag);
    const brl = cyl(0.16, 0.22, 5.6, P.gunDark, 8);
    brl.rotation.x = Math.PI / 2;
    brl.position.set(off, 2.4, 6.2);
    g.add(brl);
  }
  return g;
}

/** A quad 40 mm Bofors in its tub, with the director alongside. */
function bofors() {
  const g = new THREE.Group();
  const tub = cyl(2.6, 2.6, 1.5, P.gun, 14);
  tub.position.y = 0.75;
  g.add(tub);
  g.add(box(2.4, 1.1, 2.6, P.gunDark, 0, 1.9, -0.3));
  for (const s of [-0.55, 0.55]) {
    for (const t of [-0.35, 0.35]) {
      const brl = cyl(0.11, 0.13, 3.6, P.gunDark, 6);
      brl.rotation.x = Math.PI / 2;
      brl.position.set(s, 2.4 + t * 0.25, 2.2);
      g.add(brl);
    }
  }
  return g;
}

/** A single 20 mm Oerlikon behind its splinter shield. */
function oerlikon() {
  const g = new THREE.Group();
  const shield = cyl(0.95, 0.95, 1.2, P.gun, 10);
  shield.position.y = 0.6;
  g.add(shield);
  const brl = cyl(0.07, 0.09, 2.1, P.gunDark, 6);
  brl.rotation.x = Math.PI / 2 - 0.5;
  brl.position.set(0, 1.7, 0.9);
  g.add(brl);
  return g;
}

// ------------------------------------------------------- fire control & masts --

/** Mk37 secondary director, with its Mk12/22 radar aerials on the roof. */
function mk37() {
  const g = new THREE.Group();
  g.add(box(3.4, 2.4, 4.2, P.gun, 0, 1.2, 0));
  for (const s of [-1, 1]) g.add(box(0.8, 0.8, 1.6, P.gunDark, s * 1.9, 1.6, -0.6));
  // The rectangular Mk12 antenna and the orange-peel Mk22 beside it.
  const mk12 = box(2.6, 1.4, 0.25, P.radar, 0, 3.0, 0.4);
  g.add(mk12);
  const mk22 = cyl(0.7, 0.7, 0.2, P.radar, 12);
  mk22.rotation.x = Math.PI / 2;
  mk22.position.set(1.6, 3.1, 0.4);
  mk22.scale.set(0.5, 1, 1);
  g.add(mk22);
  return g;
}

/** Mk38 main battery director: the tower top with the Mk8 "bedspring". */
function mk38() {
  const g = new THREE.Group();
  g.add(box(4.6, 3.0, 5.0, P.gun, 0, 1.5, 0));
  for (const s of [-1, 1]) g.add(box(1.2, 1.0, 2.2, P.gunDark, s * 2.6, 1.9, -0.4));
  // Mk8 fire-control radar: a flat rectangular array.
  const array = box(4.6, 1.8, 0.3, P.radar, 0, 4.0, 0.6);
  g.add(array);
  for (let i = -2; i <= 2; i++) g.add(box(0.12, 1.6, 0.5, P.gunDark, i * 0.9, 4.0, 0.8));
  return g;
}

/** The tower foremast, its platforms and the air-search aerials. */
function foremast() {
  const g = new THREE.Group();
  const leg = cyl(0.9, 1.3, 26, P.gun, 8);
  leg.position.y = 13;
  g.add(leg);
  for (const [y, r] of [[8, 3.2], [15, 2.6], [21, 2.0]]) {
    const plat = cyl(r, r, 0.3, P.gunDark, 14);
    plat.position.y = y;
    g.add(plat);
  }
  // SK air-search: the big flat mattress that identifies her at a distance.
  const sk = box(5.4, 5.4, 0.3, P.radar, 0, 27.5, 0);
  sk.rotation.x = -0.25;
  g.add(sk);
  for (let i = -2; i <= 2; i++) g.add(box(0.1, 5.0, 0.4, P.gunDark, i * 1.1, 27.5, 0.3));
  // Yardarms with their signal halyards.
  const yard = tube(0.14, 13, P.rail, 6);
  yard.rotation.z = Math.PI / 2;
  yard.rotation.x = 0;
  yard.position.y = 22.5;
  g.add(yard);
  const topmast = cyl(0.18, 0.32, 8, P.rail, 6);
  topmast.position.y = 32;
  g.add(topmast);
  return g;
}

// ------------------------------------------------------------ the aeroplanes --

/** An OS2U Kingfisher on the quarterdeck catapult. */
function kingfisher() {
  const g = new THREE.Group();
  const body = cyl(0.55, 0.35, 10.2, P.plane, 8);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  g.add(box(11.0, 0.25, 1.9, P.plane, 0, 0.3, 0.6));
  g.add(box(3.6, 0.2, 1.1, P.plane, 0, 0.9, -4.2));
  g.add(box(0.2, 1.8, 1.3, P.plane, 0, 1.5, -4.4));
  // The great central float and the wingtip floats that go with it.
  const float = cyl(0.5, 0.35, 8.4, P.plane, 8);
  float.rotation.x = Math.PI / 2;
  float.position.set(0, -1.5, 0.4);
  g.add(float);
  for (const s of [-1, 1]) {
    const wf = cyl(0.2, 0.16, 2.0, P.plane, 6);
    wf.rotation.x = Math.PI / 2;
    wf.position.set(s * 4.8, -0.7, 0.6);
    g.add(wf);
  }
  const prop = new THREE.Mesh(new THREE.CircleGeometry(1.6, 10),
    new THREE.MeshBasicMaterial({ color: 0x9aa6b2, transparent: true, opacity: 0.2, side: THREE.DoubleSide }));
  prop.position.z = 5.3;
  g.add(prop);
  return g;
}

// ------------------------------------------------------------------ assembly --

/**
 * The whole ship.
 * @returns {{group: THREE.Group, turrets: THREE.Group[], length: number,
 *            beam: number, deckY: number}}
 */
export function buildIowa() {
  const root = new THREE.Group();
  const { group: hull, forward } = buildHull();
  root.add(hull);

  // Anything standing forward of the break goes with the bow section, so that
  // when it lifts it takes A and B turrets and the forecastle with it.
  const place = (obj, z) => (z >= SPLIT_Z ? forward : root).add(obj);

  const turrets = [];
  // Everything else aboard that trains: the secondary mountings and the light
  // battery. Each is marked so the welder leaves it alone, and each remembers
  // the bearing it rests on so the scene can lay it in the ship's own frame.
  const secMounts = [];
  const aaMounts = [];
  const trains = (obj, rest, into) => {
    obj.userData.dynamic = true;
    obj.userData.rest = rest;
    into.push(obj);
    return obj;
  };

  // -- main battery --------------------------------------------------------
  // A and B forward, superfiring; Y aft. The barbette heights step up.
  for (const [z, lift, aft] of [[76, 0, false], [58, 4.2, false], [-70, 0, true]]) {
    const t = turret16();
    t.position.set(0, sheerAt(z / (LOA / 2)) + lift, z);
    if (aft) t.rotation.y = Math.PI;
    place(t, z);
    turrets.push(t);
    // The deckhouse the superfiring turret stands on.
    if (lift) place(box(15, lift, 15, P.hullUpper, 0, sheerAt(z / (LOA / 2)) + lift / 2, z), z);
  }

  // -- superstructure ------------------------------------------------------
  const S = DECK + 0.4;

  // 01 deck: the long deckhouse the secondary battery stands on. It stops at
  // the break, so nothing of it is left overhanging when the bow goes.
  root.add(box(26, 4.2, 96, P.hullUpper, 0, S + 2.1, -5));
  // 02 deck, narrower, carrying the funnels and the boat deck.
  root.add(box(20, 3.8, 86, P.hullUpper, 0, S + 6.1, 6));

  // Conning tower and bridge: the armoured citadel with the pilot house round it.
  const conning = cyl(4.6, 5.0, 7.0, P.gun, 16);
  conning.position.set(0, S + 11.5, 40);
  root.add(conning);
  root.add(box(15, 3.0, 12, P.hullUpper, 0, S + 9.5, 38));
  root.add(box(12.5, 2.8, 9.5, P.hullUpper, 0, S + 12.4, 37));
  root.add(box(10.0, 2.6, 8.0, P.hullUpper, 0, S + 15.1, 36));
  // Bridge wings and their windows.
  for (const s of [-1, 1]) root.add(box(3.0, 0.4, 7.0, P.gunDark, s * 7.4, S + 11.1, 38));
  root.add(box(11.4, 1.3, 0.3, P.glass, 0, S + 12.8, 41.6));
  root.add(box(9.2, 1.2, 0.3, P.glass, 0, S + 15.4, 39.8));

  // Main battery director over the bridge, and the foremast behind it.
  const fwdDir = mk38();
  fwdDir.position.set(0, S + 17.4, 35);
  root.add(fwdDir);
  const fm = foremast();
  fm.position.set(0, S + 16, 28);
  root.add(fm);

  // Secondary directors: one either side forward, one aft.
  for (const [x, y, z] of [[-8.5, S + 13.6, 30], [8.5, S + 13.6, 30], [0, S + 12.0, -44]]) {
    const d = mk37();
    d.position.set(x, y, z);
    root.add(d);
  }

  // Funnels: raked, capped, with the steam pipes up the after side.
  for (const z of [14, -16]) {
    const f = cyl(3.1, 3.6, 11.0, P.hullUpper, 14);
    f.position.set(0, S + 13.5, z);
    f.rotation.x = -0.06;
    root.add(f);
    const cap = cyl(3.5, 3.2, 0.8, P.gunDark, 14);
    cap.position.set(0, S + 19.2, z - 0.3);
    root.add(cap);
    for (const s of [-1, 1]) {
      const pipe = cyl(0.28, 0.28, 12, P.gunDark, 6);
      pipe.position.set(s * 2.4, S + 14, z - 2.9);
      root.add(pipe);
    }
    // A gallery of Oerlikons round the base of each funnel.
    for (const s of [-1, 1]) {
      const o = oerlikon();
      o.position.set(s * 5.0, S + 8.0, z);
      trains(o, 0, aaMounts);
      root.add(o);
    }
  }

  // Mainmast aft, with its own yard and the aft director on the deckhouse.
  const mm = cyl(0.55, 0.8, 20, P.rail, 8);
  mm.position.set(0, S + 16, -30);
  root.add(mm);
  const mYard = tube(0.12, 10, P.rail, 6);
  mYard.rotation.z = Math.PI / 2;
  mYard.position.set(0, S + 22, -30);
  root.add(mYard);
  const aftDir = mk38();
  aftDir.position.set(0, S + 9.9, -50);
  root.add(aftDir);

  // -- secondary battery ---------------------------------------------------
  // Five twin 5"/38 a side, standing on the 01 deck.
  for (const z of [46, 24, -2, -26, -50]) {
    for (const s of [-1, 1]) {
      const m = mount5();
      m.position.set(s * 12.2, S + 4.2, z);
      m.rotation.y = s > 0 ? 1.35 : -1.35;
      trains(m, m.rotation.y, secMounts);
      root.add(m);
    }
  }

  // -- light AA ------------------------------------------------------------
  // Twenty quad Bofors: round the turrets, along the 02 deck, and on the fantail.
  const bofPlaces = [
    [-14, DECK + 0.2, 96], [14, DECK + 0.2, 96],
    [-17, S + 4.4, 62], [17, S + 4.4, 62],
    [-13, S + 8.2, 44], [13, S + 8.2, 44],
    [-11.5, S + 10.0, 22], [11.5, S + 10.0, 22],
    [-11.5, S + 10.0, 2], [11.5, S + 10.0, 2],
    [-11.5, S + 8.2, -22], [11.5, S + 8.2, -22],
    [-15, S + 4.4, -40], [15, S + 4.4, -40],
    [-16, S + 4.4, -58], [16, S + 4.4, -58],
    [-11, DECK + 0.2, -92], [11, DECK + 0.2, -92],
    [0, DECK + 0.2, -104], [0, DECK + 4.4, 86],
  ];
  for (const [x, y, z] of bofPlaces) {
    const b = bofors();
    b.position.set(x, y, z);
    b.rotation.y = x < 0 ? -0.7 : 0.7;
    trains(b, b.rotation.y, aaMounts);
    place(b, z);
  }

  // Oerlikons down both deck edges, wherever there is room for a man to stand.
  for (let z = -110; z <= 110; z += 11) {
    if (Math.abs(z) < 20) continue;
    const t = z / (LOA / 2);
    const edge = halfBeam(t) * flareAt(t) - 1.6;
    if (edge < 4) continue;
    for (const s of [-1, 1]) {
      const o = oerlikon();
      o.position.set(s * edge, sheerAt(t), z);
      o.rotation.y = s * 0.9;
      trains(o, o.rotation.y, aaMounts);
      place(o, z);
    }
  }

  // -- quarterdeck ---------------------------------------------------------
  // Two catapults over the transom, a Kingfisher on each.
  for (const s of [-1, 1]) {
    const cat = box(2.6, 0.7, 22, P.gunDark, s * 8.5, DECK + 1.2, -114);
    cat.rotation.y = s * 0.10;
    root.add(cat);
    const p = kingfisher();
    p.position.set(s * 8.5, DECK + 3.2, -112);
    p.rotation.y = s * 0.10 + Math.PI;
    root.add(p);
  }
  // The aircraft crane between them.
  const crane = cyl(0.7, 0.9, 9, P.gun, 8);
  crane.position.set(0, DECK + 4.5, -98);
  root.add(crane);
  const jib = tube(0.35, 16, P.gun, 6);
  jib.rotation.x = 1.2;
  jib.position.set(0, DECK + 10, -103);
  root.add(jib);

  // Boats on the 02 deck under their davits.
  for (const s of [-1, 1]) {
    for (const z of [-4, -14]) {
      const boat = cyl(1.0, 0.7, 8.0, P.wood, 8);
      boat.rotation.x = Math.PI / 2;
      boat.scale.set(1, 0.5, 1);
      boat.position.set(s * 11.5, S + 8.6, z);
      root.add(boat);
      for (const dz of [-3, 3]) {
        const dav = cyl(0.16, 0.16, 3.4, P.rail, 6);
        dav.position.set(s * 11.5, S + 9.8, z + dz);
        root.add(dav);
      }
    }
  }

  // -- forecastle ----------------------------------------------------------
  // Breakwater, anchors in their hawsepipes, capstans and the jackstaff.
  const bw = box(24, 1.6, 0.5, P.hullUpper, 0, sheerAt(0.78) + 0.8, 106);
  forward.add(bw);
  for (const s of [-1, 1]) {
    forward.add(box(2.6, 2.2, 0.6, P.gunDark, s * 6.5, sheerAt(0.90) - 1.2, 122));
    const cap = cyl(1.1, 1.1, 1.0, P.gunDark, 12);
    cap.position.set(s * 5.0, sheerAt(0.80) + 0.5, 110);
    forward.add(cap);
  }
  const jack = cyl(0.12, 0.16, 7, P.rail, 6);
  jack.position.set(0, sheerAt(0.97) + 3.5, 132);
  forward.add(jack);
  const ensign = cyl(0.12, 0.16, 7, P.rail, 6);
  ensign.position.set(0, DECK + 3.5, -131);
  root.add(ensign);

  // -- railings ------------------------------------------------------------
  // Three courses of wire down each side: at this scale they are what stops the
  // deck edge from reading as a cliff. Run in two pieces, parting where the
  // hull does — one length of wire drawn over the break leaves the outline of
  // a bow standing in the air after the bow itself has gone.
  const railMat = new THREE.LineBasicMaterial({ color: P.rail });
  const rails = (z0, z1) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = -1 + (2 * i) / 40;
      const z = (t * LOA) / 2;
      if (z < z0 || z > z1) continue;
      const w = halfBeam(t) * flareAt(t) - 0.4;
      for (const h of [0.5, 1.0, 1.4]) pts.push({ z, w, y: sheerAt(t) + h });
    }
    const linePos = [];
    for (let i = 0; i < pts.length - 3; i += 3) {
      for (let k = 0; k < 3; k++) {
        const a = pts[i + k], b = pts[i + 3 + k];
        for (const s of [-1, 1]) linePos.push(s * a.w, a.y, a.z, s * b.w, b.y, b.z);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    return new THREE.LineSegments(geo, railMat);
  };
  root.add(rails(-LOA, SPLIT_Z));
  forward.add(rails(SPLIT_Z, LOA));

  // Weld her down. The turrets train and the bow section can be blown off, so
  // those are baked on their own and left as separate objects; everything else
  // becomes one mesh per colour.
  for (const t of turrets) { t.userData.dynamic = true; mergeStatic(t); }
  // The bow section stays marked dynamic throughout, so welding the rest of her
  // down leaves it a separate object that can still be blown off.
  forward.userData.dynamic = true;
  mergeStatic(forward);
  // And what is inside her, fitted to the same lines her plating was lofted
  // through, welded one buffer per compartment so a compartment blown out of
  // her shows what is behind the plating. Her bow section is already its own
  // object -- it can be blown off whole -- so it is left alone.
  buildInterior(root, {
    loa: LOA,
    sheer: sheerAt,
    keelY: keelAt,
    shellAt: (t, y) => {
      const w = halfBeam(t);
      const k = keelAt(t);
      if (y <= k) return 0;
      const up = Math.min(1, Math.max(0, (y - k) / Math.max(0.6, -k)));
      const belly = Math.pow(up, 0.40);
      return Math.max(0.05, w * belly * (y > 0 ? flareAt(t) : 1));
    },
  });
  mergeStatic(root, bySection(LOA));

  root.userData = { classId: 'iowa', length: LOA, beam: BEAM, deckY: DECK };
  return {
    group: root, turrets, forward, length: LOA, beam: BEAM, deckY: DECK,
    secMounts, aaMounts,
  };
}
