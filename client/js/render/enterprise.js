// USS Enterprise, CV-6, as she looked in the middle of the Pacific war.
//
// The Big E: second of the three Yorktowns, laid down at Newport News in 1934,
// at Midway, the Eastern Solomons, Santa Cruz and Guadalcanal, and by the end
// of 1942 the only American carrier still in the fight. This is her in that
// fit -- the 1942 refit, with the 1.1-inch quads gone for 40 mm Bofors and
// Oerlikon galleries down both deck edges.
//
// Metres throughout, bow to +Z, starboard to +X, waterline at y = 0. Her real
// figures, which everything below is measured off:
//
//   length overall        251.4 m      flight deck        244 x 26 m
//   waterline beam         25.4 m      extreme beam        34.8 m
//   draft                   7.9 m      freeboard, hangar   ~14 m
//   three centreline elevators, nine arresting wires, three barriers
//   eight 5"/38 in four sponsons, four quad 40 mm, thirty 20 mm
//   air group: 27 fighters, 38 dive bombers, 15 torpedo bombers
//
// Nothing here is a texture. Every plate, gallery, tub, boat, wire and aerial
// is geometry, because the ship is looked at from a masthead at fifty metres in
// the spectator view and a painted-on detail is a smear at that range.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic } from './merge.js';

// ------------------------------------------------------------- materials --

const M = {
  // Measure 21, navy blue: what she wore from mid-1942.
  hull: new THREE.MeshLambertMaterial({ color: 0x515d6b }),
  hullDark: new THREE.MeshLambertMaterial({ color: 0x424d59 }),
  boot: new THREE.MeshLambertMaterial({ color: 0x1a1e23 }),
  antifoul: new THREE.MeshLambertMaterial({ color: 0x6d2b23 }),
  // Douglas fir over the steel deck, weathered grey-brown.
  deck: new THREE.MeshLambertMaterial({ color: 0x7d7362 }),
  deckDark: new THREE.MeshLambertMaterial({ color: 0x6d6455 }),
  steel: new THREE.MeshLambertMaterial({ color: 0x5d6874 }),
  steelDark: new THREE.MeshLambertMaterial({ color: 0x46505b }),
  bright: new THREE.MeshLambertMaterial({ color: 0x7f8993 }),
  mark: new THREE.MeshLambertMaterial({ color: 0xd6d2c4 }),
  gun: new THREE.MeshLambertMaterial({ color: 0x525d68 }),
  gunDark: new THREE.MeshLambertMaterial({ color: 0x2b323a }),
  glass: new THREE.MeshLambertMaterial({ color: 0x1b2229 }),
  canvas: new THREE.MeshLambertMaterial({ color: 0x6e6a5c }),
  raft: new THREE.MeshLambertMaterial({ color: 0x2a2f34 }),
  wire: new THREE.MeshLambertMaterial({ color: 0x232a31 }),
  // Blue-grey over light grey: the 1942 scheme her aircraft wore.
  planeTop: new THREE.MeshLambertMaterial({ color: 0x33475e }),
  planeBottom: new THREE.MeshLambertMaterial({ color: 0x9aa4ad }),
  prop: new THREE.MeshLambertMaterial({ color: 0x24282c }),
  star: new THREE.MeshLambertMaterial({ color: 0xd9dde2 }),
};

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

/** A horizontal tube: a boom, a rail, a wire, a gun barrel lying fore and aft. */
function tubeZ(g, m, r, len, x, y, z, seg = 8) {
  const o = cyl(g, m, r, r, len, x, y, z, seg);
  o.rotation.x = Math.PI / 2;
  return o;
}

function tubeX(g, m, r, len, x, y, z, seg = 8) {
  const o = cyl(g, m, r, r, len, x, y, z, seg);
  o.rotation.z = Math.PI / 2;
  return o;
}

/**
 * A railing: stanchions and three courses of wire, which is what the deck edge
 * of a carrier is made of for most of its length.
 */
function railing(g, pts, h = 1.1, courses = 3) {
  for (let i = 0; i < pts.length; i++) {
    const [x, y, z] = pts[i];
    box(g, M.steel, 0.06, h, 0.06, x, y + h / 2, z);
    if (i === 0) continue;
    const [px, py, pz] = pts[i - 1];
    const dx = x - px; const dz = z - pz; const dy = y - py;
    const len = Math.hypot(dx, dz, dy);
    for (let c = 1; c <= courses; c++) {
      const ry = (h * c) / courses;
      const rail = box(g, M.steel, 0.04, 0.04, len,
        (x + px) / 2, (y + py) / 2 + ry, (z + pz) / 2);
      rail.rotation.y = Math.atan2(dx, dz);
      rail.rotation.x = -Math.asin(dy / Math.max(0.001, len));
    }
  }
}

/** A gun tub: a ring of plating with a deck in it, hung off the ship's side. */
function tub(g, r, depth, x, y, z, seg = 14) {
  cyl(g, M.steel, r, r * 0.92, 0.12, x, y, z, seg);
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const w = (2 * Math.PI * r) / seg + 0.1;
    box(g, M.steel, w, depth, 0.14, x + Math.sin(a) * r, y + depth / 2, z + Math.cos(a) * r, a);
  }
}

// ------------------------------------------------------------------ hull --

/**
 * The hull: a cruiser bow, a long parallel body, and a transom.
 *
 * Built as a ladder of stations rather than a box, because everything hung on
 * her -- sponsons, galleries, boat davits, the deck-edge catwalks -- is placed
 * off the shell at that station, and a box would put them all in a straight
 * line down a flat side.
 */
const LOA = 251.4;
const WLB = 25.4;              // waterline beam
const FDW = 26.0;              // flight deck width
const FDL = 244.0;             // flight deck length
const DRAFT = 7.9;
// A Yorktown floats a good deal lower than her flight deck suggests: the shell
// plating stops at the hangar deck, about seven metres up, and the flight deck
// stands another nine and a half above that on the gallery-deck structure. All
// the daylight between the two is the open hangar side.
const HANGAR = 7.4;            // hangar deck above the waterline
const FD = 17.0;               // flight deck above the waterline

/** Half-beam of the shell at station t, -1 at the transom to +1 at the stem. */
function halfBeam(t) {
  const b = WLB / 2;
  if (t > 0.52) {
    // The entry: fine, and hollow where the flare starts.
    const k = (t - 0.52) / 0.48;
    return b * Math.max(0.05, 1 - Math.pow(k, 1.75));
  }
  if (t < -0.72) {
    // The run aft into a transom that is about two-fifths of the beam.
    const k = (-t - 0.72) / 0.28;
    return b * (1 - 0.58 * Math.pow(k, 1.25));
  }
  return b * (1 - 0.05 * Math.abs(t));
}

/** How high the sheer stands above the waterline at station t. */
function sheer(t) {
  if (t > 0.55) return HANGAR + (t - 0.55) * 7.5;
  if (t < -0.8) return HANGAR + (-t - 0.8) * 3.0;
  return HANGAR;
}

function buildHull(g) {
  const N = 60;
  const pos = [];
  const idx = [];
  const push = (x, y, z) => { pos.push(x, y, z); return pos.length / 3 - 1; };

  // Three strakes: antifouling, boot topping, and the freeboard above it.
  const bands = [
    [-DRAFT, -1.2, M.antifoul],
    [-1.2, 0.6, M.boot],
    [0.6, null, M.hull],
  ];
  for (const [y0, y1, m] of bands) {
    const sub = new THREE.Group();
    const p = [];
    const ix = [];
    const put = (x, y, z) => { p.push(x, y, z); return p.length / 3 - 1; };
    for (let i = 0; i <= N; i++) {
      const t = -1 + (2 * i) / N;
      const z = (t * LOA) / 2;
      // The underwater body narrows towards the keel.
      const taper = y0 < -1.2 ? 0.5 : 1;
      const hb = halfBeam(t);
      const top = y1 === null ? sheer(t) : y1;
      for (const s of [-1, 1]) {
        put(s * hb * taper, y0, z);
        put(s * hb, top, z);
      }
    }
    const row = 4;
    for (let i = 0; i < N; i++) {
      const a = i * row;
      const b = (i + 1) * row;
      // Port shell, starboard shell.
      ix.push(a, a + 1, b + 1, a, b + 1, b);
      ix.push(a + 2, b + 2, b + 3, a + 2, b + 3, a + 3);
      if (y1 === null) {
        // The weather deck between the two sheer lines.
        ix.push(a + 1, a + 3, b + 3, a + 1, b + 3, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geo.setIndex(ix);
    geo.computeVertexNormals();
    sub.add(new THREE.Mesh(geo, m));
    g.add(sub);
  }

  // Transom and stem, so the hull is closed at both ends.
  const tb = halfBeam(-1);
  box(g, M.hull, tb * 2, HANGAR + DRAFT, 0.5, 0, (HANGAR - DRAFT) / 2, -LOA / 2 + 0.2);
  box(g, M.antifoul, tb * 1.9, 1.2, 0.4, 0, -DRAFT + 0.6, -LOA / 2 + 0.35);

  // Bilge keels, and the shaft bossings and struts under the counter.
  for (const s of [-1, 1]) {
    const bk = box(g, M.antifoul, 0.35, 1.1, LOA * 0.34, s * (WLB * 0.44), -DRAFT * 0.62, -LOA * 0.02);
    bk.rotation.z = s * 0.5;
    for (const o of [0.42, 0.86]) {
      const shaft = tubeZ(g, M.antifoul, 0.55, 22, s * WLB * o * 0.5, -DRAFT * 0.68, -LOA * 0.36, 10);
      shaft.rotation.x = Math.PI / 2 + 0.05;
      // Screw and A-bracket.
      const scr = cyl(g, M.hullDark, 0.35, 0.35, 0.6, s * WLB * o * 0.5, -DRAFT * 0.72, -LOA * 0.43, 8);
      scr.rotation.x = Math.PI / 2;
      for (let k = 0; k < 4; k++) {
        const bl = box(g, M.hullDark, 0.25, 2.6, 0.12,
          s * WLB * o * 0.5, -DRAFT * 0.72, -LOA * 0.43);
        bl.rotation.z = (k / 4) * Math.PI * 2;
      }
      box(g, M.antifoul, 0.3, 2.4, 0.9, s * WLB * o * 0.5, -DRAFT * 0.5, -LOA * 0.41, 0);
    }
  }
  // Twin rudders, which is what let her turn as hard as she did.
  for (const s of [-1, 1]) {
    box(g, M.antifoul, 0.4, 4.2, 3.4, s * 3.2, -DRAFT * 0.55, -LOA * 0.455);
  }

  // Anchors, hawse pipes and the anchor chain on the forecastle.
  for (const s of [-1, 1]) {
    cyl(g, M.steelDark, 0.55, 0.55, 1.4, s * (halfBeam(0.86) - 0.3), HANGAR - 2.2, LOA * 0.43, 10)
      .rotation.z = Math.PI / 2;
    const anc = box(g, M.steelDark, 0.35, 2.2, 1.5, s * (halfBeam(0.86) + 0.1), HANGAR - 2.6, LOA * 0.43);
    anc.rotation.z = s * 0.1;
  }
}

// --------------------------------------------------------- the flight deck --

/**
 * The flight deck: planked, marked out, and standing on the gallery deck.
 *
 * A Yorktown's flight deck is not part of the hull -- it is a structure built
 * on top of it, open at the sides, with the hangar underneath and daylight
 * between the two. That is why the deck edge has catwalks slung under it and
 * why the bow is open: it is the one thing that makes an American carrier of
 * this generation look like what it is.
 */
function flightDeck(g) {
  const HW = FDW / 2;
  // The deck itself, planked fore and aft in Douglas fir.
  const planks = 42;
  for (let i = 0; i < planks; i++) {
    const x = -HW + (FDW * (i + 0.5)) / planks;
    box(g, i % 3 === 1 ? M.deckDark : M.deck, FDW / planks - 0.04, 0.34, FDL, x, FD, LOA * 0.012);
  }
  // Deck edge coaming, and the round-down aft that stopped a burble over the
  // ramp: the deck falls away over the last few metres.
  for (const s of [-1, 1]) {
    box(g, M.steelDark, 0.3, 0.5, FDL, s * HW, FD + 0.1, LOA * 0.012);
  }
  const ramp = box(g, M.deck, FDW, 0.34, 9, 0, FD - 0.5, -FDL / 2 + LOA * 0.012 - 4);
  ramp.rotation.x = 0.13;

  // The supporting structure under it: transverse frames and stanchions down to
  // the hangar roof, which is what the daylight between the decks shows.
  for (let i = -13; i <= 13; i++) {
    const z = (i / 13) * (FDL / 2 - 6) + LOA * 0.012;
    const w = Math.min(FDW, halfBeam(z / (LOA / 2)) * 2 + 4);
    box(g, M.steelDark, w, 0.8, 0.5, 0, FD - 0.6, z);
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.6);
      box(g, M.steelDark, 0.4, FD - HANGAR - 1.2, 0.4, x, (FD + HANGAR) / 2 - 0.5, z);
    }
  }

  // Markings: the centreline, the landing area's dashed edges, the elevator
  // outlines and the ship's number at both ends.
  box(g, M.mark, 0.5, 0.06, FDL * 0.86, 0, FD + 0.2, LOA * 0.012);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 26; i++) {
      box(g, M.mark, 0.34, 0.06, 2.6, s * (HW - 2.2), FD + 0.2,
        -FDL / 2 + 8 + i * 4.4 + LOA * 0.012);
    }
  }

  // Three centreline elevators: outline, platform, and the gap round it.
  const LIFTS = [FDL * 0.34, FDL * 0.0, -FDL * 0.3];
  for (const lz of LIFTS) {
    const z = lz + LOA * 0.012;
    for (const s of [-1, 1]) {
      box(g, M.steelDark, 0.24, 0.4, 14.6, s * 7.3, FD + 0.16, z);
      box(g, M.steelDark, 14.8, 0.4, 0.24, 0, FD + 0.16, z + s * 7.3);
    }
    // The platform, a shade proud of the deck, with its own planking.
    for (let i = 0; i < 12; i++) {
      box(g, i % 3 === 1 ? M.deckDark : M.deck, 14.2 / 12 - 0.05, 0.3, 14.2,
        -7.1 + (14.2 * (i + 0.5)) / 12, FD + 0.02, z);
    }
  }

  // Arresting gear: nine wires across the after third, raised on their fairleads.
  for (let i = 0; i < 9; i++) {
    const z = -FDL / 2 + 14 + i * 5.4 + LOA * 0.012;
    tubeX(g, M.wire, 0.075, FDW - 3, 0, FD + 0.42, z, 6);
    for (const s of [-1, 1]) {
      box(g, M.steelDark, 0.5, 0.3, 0.5, s * (HW - 1.4), FD + 0.3, z);
    }
  }
  // Three crash barriers, forward of the wires: stanchions and their cables.
  for (let i = 0; i < 3; i++) {
    const z = -FDL * 0.06 + i * 6.5 + LOA * 0.012;
    for (const s of [-1, 1]) {
      box(g, M.steelDark, 0.34, 1.5, 0.34, s * (HW - 1.0), FD + 0.9, z);
    }
    tubeX(g, M.wire, 0.09, FDW - 2, 0, FD + 1.5, z, 6);
    tubeX(g, M.wire, 0.09, FDW - 2, 0, FD + 0.9, z, 6);
  }

  // Palisades: the folding wind screens forward of the parking area.
  for (let i = 0; i < 7; i++) {
    const x = -HW + 2 + i * ((FDW - 4) / 6);
    const p = box(g, M.canvas, (FDW - 4) / 6 - 0.4, 2.2, 0.16, x, FD + 1.3, FDL * 0.31 + LOA * 0.012);
    p.rotation.x = -0.08;
  }
}

/**
 * The catwalks: a gallery slung under the deck edge for the whole length of
 * her, with the light guns in tubs off it and the life rafts on its rails.
 *
 * This is the detail that reads at any range. A carrier without them is a
 * plank on a hull; with them the deck edge has depth and the ship has a scale.
 */
function catwalks(g) {
  const HW = FDW / 2;
  const y = FD - 1.9;
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 30; i++) {
      const t = -1 + (2 * i) / 30;
      const z = t * (FDL / 2 - 4) + LOA * 0.012;
      const x = s * (HW + 0.9);
      // Grating, and the brackets carrying it off the deck edge.
      box(g, M.steelDark, 2.0, 0.14, (FDL - 8) / 30 + 0.2, x, y, z);
      if (i % 2 === 0) {
        const br = box(g, M.steelDark, 2.4, 0.22, 0.2, s * (HW + 0.2), y + 0.55, z);
        br.rotation.z = s * 0.5;
      }
      pts.push([x + s * 0.9, y + 0.07, z]);
      // Life rafts stowed against the outboard rail.
      if (i % 3 === 1) {
        const r = cyl(g, M.raft, 0.32, 0.32, 1.9, x + s * 0.75, y + 1.0, z, 8);
        r.rotation.x = Math.PI / 2;
      }
    }
    railing(g, pts, 1.05, 2);
  }
}

// ------------------------------------------------------------- the island --

/**
 * The island: small, on the starboard side, with the funnel built into it.
 *
 * A Yorktown's island is about a tenth of the deck's length and hangs over the
 * side, so the flight deck loses almost nothing to it. Pilot house, navigating
 * bridge, flag bridge, air plot, the funnel aft of them all, and a tripod mast
 * carrying the air-search aerial.
 */
function island(g) {
  const X = FDW / 2 - 2.2;        // its inboard face, just off the deck edge
  const Z = LOA * 0.06;
  const W = 5.6;
  const cx = X + W / 2;

  // The base structure, standing on the flight deck and overhanging the side.
  box(g, M.hull, W, 4.2, 26, cx, FD + 2.3, Z);
  box(g, M.hull, W + 1.4, 3.4, 22, cx + 0.4, FD + 5.9, Z + 1);
  // Bridge levels, each stepped in, with their windows.
  const decks = [
    [FD + 7.9, 5.0, 15.0, 2.6],   // navigating bridge
    [FD + 10.6, 4.6, 12.0, 2.4],  // flag bridge
    [FD + 13.0, 4.0, 8.6, 2.2],   // air plot
    [FD + 15.2, 3.4, 6.0, 2.0],   // sky control
  ];
  for (const [y, w, d, h] of decks) {
    box(g, M.hull, w, h, d, cx, y + h / 2, Z + 2);
    // The window band, and the wing bridges either side of it.
    box(g, M.glass, w + 0.12, h * 0.34, d * 0.92, cx, y + h * 0.62, Z + 2);
    for (const s of [-1, 1]) {
      box(g, M.steelDark, 1.6, 0.12, d * 0.7, cx + s * (w / 2 + 0.7), y + 0.06, Z + 2);
      const pts = [];
      for (let i = 0; i <= 4; i++) {
        pts.push([cx + s * (w / 2 + 1.4), y + 0.1, Z + 2 - d * 0.35 + (i * d * 0.7) / 4]);
      }
      railing(g, pts, 1.0, 2);
    }
  }

  // The funnel: rectangular, faired into the island's after end, with its cap
  // and the steam pipes up the back of it.
  box(g, M.hull, W + 0.8, 13.5, 8.4, cx, FD + 9.5, Z - 8.2);
  box(g, M.steelDark, W + 1.2, 0.9, 8.8, cx, FD + 16.4, Z - 8.2);
  for (const s of [-1, 1]) {
    cyl(g, M.steelDark, 0.34, 0.34, 5.0, cx + s * 1.7, FD + 18.6, Z - 8.2, 8);
  }
  // The uptake casing forward of the funnel, and the searchlight platform on it.
  box(g, M.hull, W - 0.6, 2.6, 4.0, cx, FD + 17.9, Z - 4.6);
  for (const s of [-1, 1]) {
    cyl(g, M.bright, 0.75, 0.75, 1.1, cx + s * 1.6, FD + 19.8, Z - 4.6, 12)
      .rotation.x = Math.PI / 2;
  }

  // The tripod mast, its yards, and the air-search aerial on top: an SC bedstead
  // and, on the yard below it, the SG surface-search dish in its housing.
  const mastY = FD + 17.0;
  for (const [dx, dz] of [[0, 1.6], [-1.5, -1.1], [1.5, -1.1]]) {
    const leg = cyl(g, M.steel, 0.22, 0.3, 15.5, cx + dx, mastY + 7.7, Z + 3 + dz, 8);
    leg.rotation.x = -dz * 0.02;
    leg.rotation.z = dx * 0.02;
  }
  for (const y of [mastY + 4, mastY + 9, mastY + 13]) {
    box(g, M.steel, 3.4, 0.12, 0.12, cx, y, Z + 3);
    box(g, M.steel, 0.12, 0.12, 3.0, cx, y, Z + 3);
  }
  // Signal yard with its halyards.
  box(g, M.steel, 11.0, 0.16, 0.16, cx, mastY + 11.5, Z + 3);
  for (const s of [-1, 1]) {
    for (let i = 1; i <= 3; i++) {
      const wr = box(g, M.wire, 0.05, 6.0, 0.05, cx + s * i * 1.7, mastY + 8.5, Z + 3);
      wr.rotation.z = -s * 0.14 * i;
    }
  }
  // SC air-search: a flat bedstead array of dipoles.
  const sc = new THREE.Group();
  sc.position.set(cx, mastY + 16.4, Z + 3);
  g.add(sc);
  box(sc, M.steel, 4.6, 0.14, 0.3, 0, 0, 0);
  box(sc, M.steel, 4.6, 0.14, 0.3, 0, 1.5, 0);
  for (let i = 0; i < 9; i++) {
    box(sc, M.steel, 0.1, 1.6, 0.1, -2.1 + i * 0.525, 0.75, 0);
    box(sc, M.steel, 0.08, 0.08, 0.9, -2.1 + i * 0.525, 0.75, 0.35);
  }
  // SG surface-search in its cheese housing, on the starboard yardarm.
  const sg = cyl(g, M.steel, 0.9, 0.9, 0.5, cx + 2.2, mastY + 13.9, Z + 3, 14);
  sg.rotation.x = Math.PI / 2;
  box(g, M.steel, 0.3, 1.9, 0.2, cx + 2.2, mastY + 13.9, Z + 2.7);

  // Mk 37 director with its Mk 4 antenna, forward and aft of the island.
  for (const dz of [10.5, -13.5]) {
    const d = new THREE.Group();
    d.position.set(cx, FD + (dz > 0 ? 12.0 : 17.4), Z + dz);
    g.add(d);
    cyl(d, M.gun, 1.5, 1.7, 1.0, 0, 0, 0, 14);
    box(d, M.gun, 3.0, 1.8, 3.4, 0, 1.4, 0);
    box(d, M.gunDark, 3.1, 0.5, 0.2, 0, 1.9, 1.7);
    // The Mk 4 mattress on its trunnions.
    box(d, M.steel, 2.6, 1.9, 0.16, 0, 3.0, 0.2);
    for (let i = 0; i < 5; i++) box(d, M.steel, 0.08, 0.08, 0.5, -1.0 + i * 0.5, 3.0, 0.45);
    for (const s of [-1, 1]) cyl(d, M.gun, 0.2, 0.2, 0.5, s * 1.4, 2.4, 0.2, 8).rotation.z = Math.PI / 2;
  }

  // Ensign staff, and the two 24-inch signal lamps on the bridge wings.
  box(g, M.steel, 0.12, 3.2, 0.12, cx, FD + 20.2, Z + 11);
  for (const s of [-1, 1]) {
    cyl(g, M.bright, 0.42, 0.42, 0.6, cx + s * 3.6, FD + 9.4, Z + 8, 12)
      .rotation.x = Math.PI / 2;
  }
}

// ---------------------------------------------------------------- weapons --

/**
 * A 5"/38 single mount, open-backed with its shield.
 *
 * Marked dynamic and recorded, because these are the guns the simulation lays:
 * eight of them, and each one trains on its own pintle. Being dynamic also
 * keeps the welder off them, which is what lets them turn at all.
 */
function fiveInch(g, root, x, y, z, ry) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.dynamic = true;
  (root.userData.turrets || (root.userData.turrets = [])).push(m);
  g.add(m);
  cyl(m, M.gunDark, 1.25, 1.35, 0.5, 0, 0.25, 0, 16);
  // The shield: front plate, two sides, open at the back.
  box(m, M.gun, 2.5, 2.1, 0.18, 0, 1.55, 1.15);
  for (const s of [-1, 1]) box(m, M.gun, 0.18, 2.1, 2.3, s * 1.25, 1.55, 0);
  box(m, M.gun, 2.6, 0.18, 2.4, 0, 2.6, 0);
  // Trunnions, cradle and the barrel through the shield.
  for (const s of [-1, 1]) cyl(m, M.gunDark, 0.22, 0.22, 0.4, s * 0.6, 1.5, 0.2, 10).rotation.z = Math.PI / 2;
  const arm = new THREE.Group();
  arm.position.set(0, 1.5, 0.2);
  arm.rotation.x = -0.22;
  m.add(arm);
  box(arm, M.gunDark, 0.75, 0.7, 1.6, 0, 0, -0.4);
  tubeZ(arm, M.gun, 0.135, 4.6, 0, 0, 2.4, 12);
  tubeZ(arm, M.gunDark, 0.19, 0.5, 0, 0, 0.75, 12);
  // Loader's platform and the ready-service racks round the base.
  cyl(m, M.steelDark, 2.1, 2.1, 0.1, 0, 0.05, -0.6, 16);
  for (let i = 0; i < 8; i++) {
    const a = -1.9 + i * 0.5;
    box(m, M.steelDark, 0.3, 0.9, 0.3, Math.sin(a) * 1.9, 0.5, Math.cos(a) * 1.9 - 0.6);
  }
  return m;
}

/** A quadruple 40 mm Bofors on its power mount. */
function bofors(g, x, y, z, ry) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  g.add(m);
  cyl(m, M.gunDark, 1.0, 1.15, 0.45, 0, 0.22, 0, 14);
  box(m, M.gun, 2.0, 0.9, 1.7, 0, 0.85, -0.3);
  for (const s of [-1, 1]) box(m, M.gun, 0.5, 1.1, 1.0, s * 1.1, 1.0, -0.2);
  const arm = new THREE.Group();
  arm.position.set(0, 1.25, 0.2);
  arm.rotation.x = -0.5;
  m.add(arm);
  box(arm, M.gunDark, 1.5, 0.55, 1.2, 0, 0, -0.3);
  for (const dx of [-0.45, -0.15, 0.15, 0.45]) {
    tubeZ(arm, M.gun, 0.055, 2.5, dx, 0.12, 1.3, 8);
    box(arm, M.gunDark, 0.16, 0.16, 0.5, dx, 0.12, -0.5);
  }
  // The two loaders' seats and the sight between them.
  for (const s of [-1, 1]) box(m, M.gunDark, 0.4, 0.1, 0.4, s * 0.85, 1.35, -1.0);
  box(m, M.gun, 0.3, 0.5, 0.3, 0, 1.6, -0.5);
  return m;
}

/** A single 20 mm Oerlikon on its pedestal, with its shoulder rests. */
function oerlikon(g, x, y, z, ry) {
  const m = new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  g.add(m);
  cyl(m, M.gunDark, 0.24, 0.34, 1.15, 0, 0.57, 0, 10);
  const arm = new THREE.Group();
  arm.position.set(0, 1.15, 0);
  arm.rotation.x = -0.55;
  m.add(arm);
  tubeZ(arm, M.gun, 0.05, 1.9, 0, 0, 0.75, 8);
  box(arm, M.gunDark, 0.3, 0.34, 0.7, 0, 0, -0.2);
  cyl(arm, M.gunDark, 0.24, 0.24, 0.18, 0, 0.3, -0.05, 12);
  for (const s of [-1, 1]) box(arm, M.gunDark, 0.1, 0.42, 0.1, s * 0.22, -0.3, -0.5);
  // The splinter shield round the pedestal.
  for (let i = 0; i < 9; i++) {
    const a = -1.6 + (i / 8) * 3.2;
    box(m, M.steel, 0.42, 1.0, 0.1, Math.sin(a) * 0.85, 0.5, Math.cos(a) * 0.85, a);
  }
  return m;
}

/**
 * Where her guns actually were: eight 5-inch in four sponsons at the corners of
 * the flight deck, four quad Bofors, and Oerlikons the whole length of both
 * catwalks. The five-inch could not fire across the deck, which is why they are
 * where they are and why she was always short of them forward.
 */
function armament(g) {
  const HW = FDW / 2;
  const gy = FD - 3.6;                       // the gallery deck
  const sponsons = [
    [1, LOA * 0.30], [1, -LOA * 0.24],       // starboard, forward and aft
    [-1, LOA * 0.26], [-1, -LOA * 0.28],     // port
  ];
  for (const [s, z] of sponsons) {
    const x = s * (HW + 1.2);
    // The sponson: a platform on brackets off the ship's side.
    box(g, M.steel, 7.0, 0.3, 13.0, x + s * 1.2, gy, z);
    for (const dz of [-4.5, 0, 4.5]) {
      const br = box(g, M.steelDark, 6.6, 0.4, 0.4, x + s * 1.0, gy - 1.4, z + dz);
      br.rotation.z = -s * 0.35;
    }
    const pts = [];
    for (let i = 0; i <= 6; i++) pts.push([x + s * 4.4, gy + 0.15, z - 6 + i * 2]);
    railing(g, pts, 1.0, 2);
    fiveInch(g, g, x + s * 1.2, gy + 0.15, z + 3.4, s > 0 ? 1.2 : -1.2);
    fiveInch(g, g, x + s * 1.2, gy + 0.15, z - 3.4, s > 0 ? 1.5 : -1.5);
    // Ready-service lockers and the ammunition hoist between the two guns.
    box(g, M.steelDark, 1.6, 1.4, 2.2, x + s * 3.2, gy + 0.85, z);
  }

  // Four quad Bofors in tubs: two forward on the bow gallery, two aft.
  const forty = [[1, LOA * 0.42], [-1, LOA * 0.42], [1, -LOA * 0.41], [-1, -LOA * 0.40]];
  for (const [s, z] of forty) {
    const x = s * (halfBeam(z / (LOA / 2)) + 2.6);
    tub(g, 3.0, 1.2, x, gy + 0.6, z, 14);
    box(g, M.steelDark, 5.6, 0.3, 5.6, x, gy + 0.6, z);
    bofors(g, x, gy + 0.72, z, z > 0 ? 0 : Math.PI);
  }

  // Oerlikons down both catwalks, in their own shields.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 15; i++) {
      const t = -1 + (2 * i) / 14;
      const z = t * (FDL / 2 - 12) + LOA * 0.012;
      // Not where the five-inch sponsons already are.
      if (sponsons.some(([ss, sz]) => ss === s && Math.abs(sz - z) < 8)) continue;
      oerlikon(g, s * (FDW / 2 + 1.4), FD - 1.83, z, s > 0 ? 1.5 : -1.5);
    }
  }
}

// ------------------------------------------------------- boats and cranes --

function boatsAndCranes(g) {
  const HW = FDW / 2;
  // The aircraft crane, on the starboard side abaft the island: a boom on a
  // king post, which is how they got a floatplane or a wrecked aircraft over
  // the side.
  const kx = HW - 1.0;
  const kz = -LOA * 0.10;
  cyl(g, M.steel, 0.5, 0.6, 9.0, kx, HANGAR + 4.5, kz, 10);
  const boom = cyl(g, M.steel, 0.3, 0.42, 15.0, kx + 4.5, HANGAR + 8.6, kz + 1.0, 10);
  boom.rotation.z = -1.05;
  boom.rotation.y = 0.25;
  tubeZ(g, M.wire, 0.05, 8.0, kx + 8.6, HANGAR + 6.4, kz + 2.2, 6).rotation.x = 0.1;
  box(g, M.steelDark, 0.6, 0.8, 0.6, kx + 8.6, HANGAR + 2.6, kz + 2.2);

  // Boats in their davits under the flight deck overhang, both sides: two motor
  // whaleboats and a pair of forty-foot utility boats.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const z = -LOA * 0.04 - i * 13;
      const x = s * (halfBeam(z / (LOA / 2)) + 1.6);
      // Hull: a shallow wedge, with a canopy over the after half.
      const hull = box(g, M.bright, 2.4, 1.5, 9.0, x, HANGAR + 1.9, z);
      hull.rotation.z = s * 0.06;
      box(g, M.steelDark, 2.0, 0.25, 8.4, x, HANGAR + 2.3, z);
      box(g, M.canvas, 1.9, 0.9, 3.2, x, HANGAR + 2.8, z - 2.0);
      // Davits, and the falls hanging from them.
      for (const dz of [-4, 4]) {
        const dav = cyl(g, M.steel, 0.16, 0.2, 5.4, x - s * 0.4, HANGAR + 4.4, z + dz, 8);
        dav.rotation.z = s * 0.32;
        box(g, M.wire, 0.06, 2.6, 0.06, x, HANGAR + 3.2, z + dz);
      }
    }
  }

  // The hangar deck side openings: roller curtains between the frames, which is
  // where the daylight under the flight deck comes from.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 11; i++) {
      const z = -LOA * 0.30 + i * (LOA * 0.055);
      const x = s * (halfBeam(z / (LOA / 2)) + 0.05);
      box(g, M.steelDark, 0.2, 5.2, LOA * 0.04, x, HANGAR + 3.0, z);
      box(g, M.hullDark, 0.14, 4.4, LOA * 0.035, x + s * 0.08, HANGAR + 3.0, z);
    }
  }
}

// ------------------------------------------------------------- the air group --

/** An SBD Dauntless, folded or spread, in the 1942 blue-grey over light grey. */
function dauntless(g, x, y, z, ry, folded = false) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  // Fuselage: a tapered body with the cockpit glazing along the top.
  box(p, M.planeTop, 1.15, 1.35, 6.6, 0, 0.95, 0);
  box(p, M.planeBottom, 1.05, 0.5, 6.2, 0, 0.35, 0);
  box(p, M.glass, 0.9, 0.55, 2.6, 0, 1.75, 0.3);
  // Engine, cowl and propeller.
  cyl(p, M.gunDark, 0.72, 0.78, 1.1, 0, 1.0, 3.6, 14).rotation.x = Math.PI / 2;
  cyl(p, M.prop, 0.16, 0.16, 0.4, 0, 1.0, 4.2, 10).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const bl = box(p, M.prop, 0.28, 3.1, 0.1, 0, 1.0, 4.35);
    bl.rotation.z = (i / 3) * Math.PI * 2;
  }
  // Wings: the Dauntless did not fold, so they are always out.
  for (const s of [-1, 1]) {
    const w = box(p, M.planeTop, 5.6, 0.22, 1.85, s * 3.1, 0.75, 0.4);
    w.rotation.z = s * 0.045;
    box(p, M.planeBottom, 5.6, 0.1, 1.7, s * 3.1, 0.63, 0.4);
    // The perforated dive flaps along the trailing edge.
    box(p, M.gunDark, 5.4, 0.08, 0.4, s * 3.1, 0.72, -0.6);
  }
  box(p, M.star, 1.3, 0.04, 1.3, -3.4, 0.88, 0.4);
  // Tail: fin, rudder and tailplane.
  box(p, M.planeTop, 0.16, 1.7, 1.5, 0, 2.0, -3.0);
  for (const s of [-1, 1]) box(p, M.planeTop, 1.8, 0.14, 1.0, s * 1.0, 1.05, -3.1);
  // Undercarriage: fixed spatted legs and a tailwheel.
  for (const s of [-1, 1]) {
    box(p, M.planeTop, 0.3, 0.9, 0.5, s * 1.5, 0.35, 1.2);
    cyl(p, M.prop, 0.35, 0.35, 0.24, s * 1.5, 0.32, 1.2, 10).rotation.z = Math.PI / 2;
  }
  cyl(p, M.prop, 0.16, 0.16, 0.14, 0, 0.2, -3.2, 8).rotation.z = Math.PI / 2;
  if (folded) p.scale.set(0.98, 1, 1);
  return p;
}

/** An F4F Wildcat, wings folded back along the fuselage as they were on deck. */
function wildcat(g, x, y, z, ry) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  box(p, M.planeTop, 1.25, 1.5, 5.4, 0, 1.15, 0);
  box(p, M.planeBottom, 1.15, 0.55, 5.0, 0, 0.45, 0);
  box(p, M.glass, 0.95, 0.6, 1.8, 0, 2.0, 0.2);
  cyl(p, M.gunDark, 0.78, 0.82, 1.2, 0, 1.2, 2.9, 14).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const bl = box(p, M.prop, 0.3, 3.0, 0.11, 0, 1.2, 3.6);
    bl.rotation.z = (i / 3) * Math.PI * 2 + 0.4;
  }
  // Folded wings: swung back and up along the sides, which is the Wildcat's
  // own trick and the reason so many of them fitted on a deck.
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.7, 1.5, 0.3);
    w.rotation.z = s * 1.35;
    w.rotation.x = 0.12;
    p.add(w);
    box(w, M.planeTop, 0.24, 4.4, 1.7, s * 0.1, -2.0, -0.6);
    box(w, M.planeBottom, 0.12, 4.2, 1.5, s * 0.22, -2.0, -0.6);
  }
  box(p, M.planeTop, 0.16, 1.6, 1.3, 0, 2.1, -2.4);
  for (const s of [-1, 1]) box(p, M.planeTop, 1.5, 0.13, 0.9, s * 0.85, 1.2, -2.5);
  for (const s of [-1, 1]) {
    box(p, M.planeTop, 0.22, 0.7, 0.3, s * 0.6, 0.5, 0.9);
    cyl(p, M.prop, 0.3, 0.3, 0.2, s * 0.6, 0.3, 0.9, 10).rotation.z = Math.PI / 2;
  }
  return p;
}

/** A TBF Avenger, wings folded alongside: the biggest thing on her deck. */
function avenger(g, x, y, z, ry) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  box(p, M.planeTop, 1.5, 1.9, 8.2, 0, 1.35, 0);
  box(p, M.planeBottom, 1.4, 0.6, 7.8, 0, 0.5, 0);
  box(p, M.glass, 1.1, 0.7, 2.4, 0, 2.4, 1.2);
  // The ball turret, which is what says Avenger at any distance.
  cyl(p, M.glass, 0.62, 0.62, 0.8, 0, 2.5, -1.3, 12);
  cyl(p, M.gunDark, 0.9, 0.95, 1.4, 0, 1.4, 4.4, 14).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const bl = box(p, M.prop, 0.34, 3.9, 0.12, 0, 1.4, 5.2);
    bl.rotation.z = (i / 3) * Math.PI * 2 + 0.9;
  }
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.85, 1.7, 0.9);
    w.rotation.z = s * 1.42;
    w.rotation.x = 0.16;
    p.add(w);
    box(w, M.planeTop, 0.3, 6.2, 2.1, s * 0.12, -2.9, -0.9);
    box(w, M.planeBottom, 0.16, 6.0, 1.9, s * 0.26, -2.9, -0.9);
  }
  box(p, M.planeTop, 0.2, 2.2, 1.9, 0, 2.6, -3.6);
  for (const s of [-1, 1]) box(p, M.planeTop, 2.2, 0.16, 1.2, s * 1.2, 1.35, -3.7);
  for (const s of [-1, 1]) {
    box(p, M.planeTop, 0.26, 0.95, 0.36, s * 1.1, 0.6, 1.5);
    cyl(p, M.prop, 0.38, 0.38, 0.26, s * 1.1, 0.38, 1.5, 10).rotation.z = Math.PI / 2;
  }
  return p;
}

/**
 * A deckload spot: the air group ranged aft the way it was before a strike,
 * fighters first because they take off in the shortest run.
 */
function airGroup(g) {
  const y = FD + 0.35;
  const z0 = -FDL * 0.44;
  let z = z0;
  // Six Wildcats in two ranks.
  for (let i = 0; i < 6; i++) {
    const s = i % 2 ? 1 : -1;
    wildcat(g, s * 5.2 + (i % 2 ? 1.4 : -1.4), y, z + Math.floor(i / 2) * 7.4, s * 0.13);
  }
  z += 24;
  // Nine Dauntlesses, wings out, staggered across the deck.
  for (let i = 0; i < 9; i++) {
    const col = i % 3;
    dauntless(g, (col - 1) * 8.2, y, z + Math.floor(i / 3) * 8.6, (col - 1) * 0.08);
  }
  z += 28;
  // Four Avengers at the after end, where there is width for their span.
  for (let i = 0; i < 4; i++) {
    const s = i % 2 ? 1 : -1;
    avenger(g, s * 6.0, y, z + Math.floor(i / 2) * 10.2, s * 0.1);
  }
}

// ------------------------------------------------------------------ build --

/**
 * The whole ship, welded down to one mesh per material.
 *
 * @returns {{group: THREE.Group, length: number, beam: number, deckY: number}}
 */
export function buildEnterprise() {
  const g = new THREE.Group();
  buildHull(g);
  flightDeck(g);
  catwalks(g);
  island(g);
  armament(g);
  boatsAndCranes(g);
  airGroup(g);
  mergeStatic(g);
  return {
    group: g,
    // In the order the sponsons were built, which is the order the datasheet
    // lists them: starboard forward pair, starboard after pair, then port.
    turrets: g.userData.turrets || [],
    length: LOA, beam: FDW, deckY: HANGAR, flightDeckY: FD,
  };
}

export { LOA, FDW, FDL, HANGAR, FD };
