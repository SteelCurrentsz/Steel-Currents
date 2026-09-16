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

// ---------------------------------------------------------------------------
// The skin of an aeroplane
// ---------------------------------------------------------------------------
//
// A warship's side is butt-jointed plate with a weld every few metres, and it
// is drawn that way in textures.js. An aeroplane is not that. She is flush
// -riveted stressed alloy: the panels are small -- half a metre, not four --
// the joints are lines of rivets rather than welds, and the whole of it is
// under a coat of paint that goes chalky in the sun and streaks with oil and
// exhaust behind every opening on her.
//
// Which is why the ships' plating map cannot be borrowed for them. A sixteen
// -metre tile on an eleven-metre aeroplane puts one weld seam across the whole
// span and nothing else, so she reads as a flat shape with a line on it.
//
// Drawn rather than loaded, the same as everything else here: the game is one
// file that has to work offline.

/** How many metres of aeroplane one tile covers. */
const SKIN_TILE = 2.6;
const SKIN_SIZE = 512;

function skinTile() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = SKIN_SIZE;
  c.height = SKIN_SIZE;
  return c;
}

/**
 * Flush-riveted alloy under a coat of paint.
 *
 * A luminance map averaging one, so it multiplies the machine's own paint
 * rather than replacing it: every scheme in SCHEMES keeps its own colour and
 * gains the surface.
 */
function drawSkin(c) {
  const g = c.getContext('2d');
  const N = SKIN_SIZE;
  g.fillStyle = '#b4b4b4';
  g.fillRect(0, 0, N, N);

  // The panel joints. Half a metre of aeroplane, so five to a tile, and they
  // are a shade either side rather than a black line: a flush joint catches
  // the light on one lip and shades on the other, which is the whole of why
  // you can see them at all.
  const step = N / 5;
  for (let i = 0; i < 5; i++) {
    const at = Math.round(i * step);
    // Drawn wide enough to survive being looked at from a hundred metres.
    // A real flush joint is a millimetre and at that width it averages away in
    // the mip chain and the aeroplane is a flat tint again -- which is what
    // happened the first time this was drawn.
    for (const [dx, w, col] of [[0, 2.5, 'rgba(64,64,64,0.55)'],
      [2.5, 1.5, 'rgba(232,232,232,0.42)']]) {
      g.fillStyle = col;
      g.fillRect(at + dx, 0, w, N);
      g.fillRect(0, at + dx, N, w);
    }
  }
  // And a few panels that are a shade off the rest. No two panels off an
  // aeroplane are quite the same colour -- they are sprayed at different times
  // and they weather at different rates -- and it is the single thing that
  // stops a painted surface reading as one flat sheet.
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      // The single thing that reads at range: no two panels off an aeroplane
      // are quite the same shade, and the eye picks that up long after the
      // joints themselves have gone.
      const v = 178 + Math.round((Math.random() - 0.5) * 26);
      g.fillStyle = `rgba(${v},${v},${v},0.5)`;
      g.fillRect(i * step + 1.5, j * step + 1.5, step - 3, step - 3);
    }
  }

  // Rivet lines down every joint. Flush rivets, so a dot a shade dark with a
  // highlight on the sunward side of it -- not a bump.
  const pitch = 7;
  const rivet = (x, y) => {
    g.fillStyle = 'rgba(88,88,88,0.46)';
    g.fillRect(x, y, 2, 2);
    g.fillStyle = 'rgba(230,230,230,0.30)';
    g.fillRect(x, y - 1, 1.8, 1);
  };
  for (let i = 0; i < 5; i++) {
    const at = i * step;
    for (let k = 0; k < N; k += pitch) { rivet(at - 2.2, k); rivet(k, at - 2.2); }
  }
  // A couple of inspection panels a tile, with fasteners round them.
  for (let k = 0; k < 3; k++) {
    const x = Math.random() * (N - 70) + 10;
    const y = Math.random() * (N - 50) + 10;
    const w = 34 + Math.random() * 30;
    const h = 22 + Math.random() * 18;
    g.strokeStyle = 'rgba(74,74,74,0.42)';
    g.lineWidth = 1;
    g.strokeRect(x, y, w, h);
    g.fillStyle = 'rgba(186,186,186,0.30)';
    g.fillRect(x + 1, y + 1, w - 2, h - 2);
    for (let f = 4; f < w - 2; f += 11) { rivet(x + f, y + 1.5); rivet(x + f, y + h - 2.5); }
  }

  // Paint. Chalky in patches and streaked fore and aft where the airflow
  // carries oil and exhaust back over her.
  for (let k = 0; k < 26; k++) {
    const x = Math.random() * N;
    const y = Math.random() * N;
    const r = 16 + Math.random() * 52;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const up = Math.random() < 0.5;
    grad.addColorStop(0, up ? 'rgba(232,232,232,0.16)' : 'rgba(84,84,84,0.15)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  for (let k = 0; k < 10; k++) {
    const y = Math.random() * N;
    const h = 1 + Math.random() * 2.5;
    g.fillStyle = `rgba(72,72,72,${0.05 + Math.random() * 0.07})`;
    g.fillRect(0, y, N, h);
  }

  // A little grain over the lot, and then normalised so the map multiplies to
  // unity: the machine keeps her own paint and gains the surface.
  const img = g.getImageData(0, 0, N, N);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 9;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  gainToOne(g, N, 232, 0.42);
  return c;
}

/**
 * Pull a drawn map's average up to `target` without clipping the bright end.
 *
 * A multiply map that averages far below white darkens everything it is put
 * on, which is how a fleet of grey ships came to be painted half their own
 * colour. Everything below the knee is scaled; everything above it is eased
 * into white, so the highlights stay highlights.
 */
function gainToOne(g, n, target = 232, knee = 0.42) {
  const img = g.getImageData(0, 0, n, n);
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i];
  const mean = sum / (d.length / 4);
  if (mean <= 1) return;
  const k = target / mean;
  const cut = 255 * knee;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = d[i + c];
      const s = v * k;
      d[i + c] = s <= cut ? s : cut + (255 - cut) * (1 - Math.exp(-(s - cut) / (255 - cut)));
    }
  }
  g.putImageData(img, 0, 0);
}

let skin = null;
/** The alloy map, drawn once and shared by every machine in the game. */
function skinMap() {
  if (skin === undefined) return null;
  if (!skin) {
    const c = skinTile();
    if (!c) { skin = undefined; return null; }
    const t = new THREE.CanvasTexture(drawSkin(c));
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / SKIN_TILE, 1 / SKIN_TILE);
    t.anisotropy = 4;
    skin = t;
  }
  return skin;
}

/**
 * Which of her materials are painted skin, and which are something else.
 *
 * Everything on an aeroplane that is dope or alloy under paint gets the
 * surface. Her glass, her propeller, her tyres, her gun barrels and her
 * markings do not: a rivet line across a national insignia or down a
 * propeller blade is worse than no surface at all.
 */
const BARE = new Set([
  0x24282c,   // the propeller
  0x1b2229,   // glass
  0x171c21,   // the dark inside an opening
  0x232a31,   // wire and aerials
  0xd9dde2,   // the star
  0x1d3866,   // and the disc it is on
  0xa8241f,   // the hinomaru
  0xd4d8dc,   // white
  0x1d2126,   // black -- tyres, walkways, anti-glare
]);

/**
 * Give a built aeroplane her skin.
 *
 * Called once per material rather than once per mesh, and the results are
 * shared, so nine machines cost nine schemes' worth of materials and not nine
 * aeroplanes' worth. Runs after the model is built and before it is welded.
 */
const DRESSED = new Map();
export function dressPlane(root) {
  const map = skinMap();
  if (!map) return root;                    // no canvas: flat colours, as before
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = [].concat(o.material);
    const out = mats.map((m) => {
      if (!m || !m.color || m.transparent || m.map) return m;
      const hex = m.color.getHex();
      if (BARE.has(hex)) return m;
      let made = DRESSED.get(hex);
      if (made) return made;
      made = new THREE.MeshPhongMaterial({
        color: hex,
        map,
        // Painted alloy is a rough dielectric with a coat on it: a broad weak
        // lobe, and more of one than a ship has, because an aeroplane is
        // washed and waxed and a ship is a fortnight of salt.
        specular: 0x3a4046,
        shininess: 34,
        specularMap: map,
        flatShading: m.flatShading === true,
        side: m.side,
      });
      DRESSED.set(hex, made);
      return made;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
  return root;
}

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
 * Mark a mesh as the breech of a gun that fires forward.
 *
 * A fighter's guns are in her wings, and a tracer that leaves the middle of
 * her nose is not a fighter's tracer -- it is a cannon in a fuselage nobody
 * ever built. So the models say where their own muzzles are: whichever piece
 * of the aeroplane is the gun gets tagged as it is placed, `ahead` is how far
 * forward of that piece's centre the muzzle stands, and `muzzlesOf` reads them
 * back out afterwards in the aeroplane's own frame. Nothing has to be kept in
 * step by hand: move the wing and the guns go with it.
 */
function arm(mesh, ahead = 0.2) {
  mesh.userData.muzzle = ahead;
  return mesh;
}

/**
 * Every forward-firing muzzle on a built aeroplane, in her own frame.
 *
 * x to starboard, y up, z forward, metres from her datum -- which is what the
 * game needs to draw the tracer leaving the actual gun. Sorted port to
 * starboard, so a pair alternates left, right, left, right and reads as two
 * wings firing rather than one.
 *
 * Wings that are folded away are skipped: a model carries both sets and shows
 * one, and the guns in the set that is not being shown are not there.
 */
export function muzzlesOf(g) {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const out = [];
  const shown = (o) => {
    for (let n = o; n && n !== g.parent; n = n.parent) if (n.visible === false) return false;
    return true;
  };
  g.traverse((o) => {
    const ahead = o.userData && o.userData.muzzle;
    if (ahead === undefined || !shown(o)) return;
    const at = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(inv);
    // Fixed guns are bore-sighted along her thrust line, whatever angle the
    // panel they are buried in happens to sit at.
    at.z += ahead;
    out.push([at.x, at.y, at.z]);
  });
  out.sort((a, b) => a[0] - b[0]);
  return out;
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
  // Imperial Japanese Navy, late war: D2 dark green above, a pale grey-green
  // below, and the yellow leading-edge identification bands at the wing roots.
  jpnTop: new THREE.MeshLambertMaterial({ color: 0x2f3b2c }),
  jpnTop2: new THREE.MeshLambertMaterial({ color: 0x3a4736 }),
  jpnBottom: new THREE.MeshLambertMaterial({ color: 0x9aa08f }),
  // And the hinomaru, which is a plain disc of red with a white surround on
  // the late-war machines.
  hinomaru: new THREE.MeshLambertMaterial({ color: 0xa8241f }),
  // Aeronavale, 1940: the pale blue-grey a French shipboard aeroplane wore
  // above, with the undersides in a light grey that is nearly silver. The
  // Besson was a small wood-and-canvas machine and she was painted the colour
  // of the sea from above rather than the colour of the sky from below.
  fraTop: new THREE.MeshLambertMaterial({ color: 0x74879a }),
  fraBottom: new THREE.MeshLambertMaterial({ color: 0xa8b0b6 }),
  // The cockade: three rings, blue at the centre and red outside, with the
  // white between them. It is the oldest national marking in the air and it
  // is the one thing that says this aeroplane came off a French submarine.
  cockadeBlue: new THREE.MeshLambertMaterial({ color: 0x1f3f7a }),
  cockadeRed: new THREE.MeshLambertMaterial({ color: 0xaa2b28 }),
  // What she carries. A torpedo is a polished steel case with a dull grey
  // warhead on the end of it; a bomb is olive drab with a bright band round
  // the nose that says it is filled.
  steel: new THREE.MeshLambertMaterial({ color: 0x6e757c }),
  warhead: new THREE.MeshLambertMaterial({ color: 0x4a5058 }),
  bombBody: new THREE.MeshLambertMaterial({ color: 0x3d4438 }),
  bombBand: new THREE.MeshLambertMaterial({ color: 0xb0a253 }),
  // Bomber Command, 1943: dark green and dark earth above, and the matt black
  // underneath that is the whole point of a night bomber. It is the darkest
  // paint in the game and it has to stay readable against a burning city, so
  // the black is a very dark blue-grey rather than nought.
  rafTop: new THREE.MeshLambertMaterial({ color: 0x3c4636 }),
  rafEarth: new THREE.MeshLambertMaterial({ color: 0x544531 }),
  night: new THREE.MeshLambertMaterial({ color: 0x191c21 }),
  // And the Eighth Air Force by 1944: no paint at all. A B-17G came off the
  // line in bare alloy, because the weight of the dope was worth more than the
  // concealment on a daylight raid.
  alloy: new THREE.MeshLambertMaterial({ color: 0xa4acb4 }),
  alloyLo: new THREE.MeshLambertMaterial({ color: 0x939ba3 }),
  // The roundel: three rings, and the only marking on this list that is three.
  rafBlue: new THREE.MeshLambertMaterial({ color: 0x1d3a6d }),
  rafRed: new THREE.MeshLambertMaterial({ color: 0xa8322c }),
  // A bomber's nose is four square metres of glass, and painted the shade a
  // fighter's sliding hood is painted -- which is right, because a hood is a
  // hand's breadth of glass with a dark cockpit behind it -- the whole nose of
  // her comes out as a black cone stuck on the front. Lighter, so it reads as
  // glazing catching the sky rather than as a hole.
  glazing: new THREE.MeshLambertMaterial({ color: 0x3f5060 }),
  // Inside her. A wartime bomber was painted grey-green from the bomb aimer's
  // window to the tail turret door, over bare alloy frames, with black boxes
  // bolted to both -- and the only bright things aboard were the dials, the
  // brass of a shell case and a man's Mae West.
  inner: new THREE.MeshLambertMaterial({ color: 0x46503f }),
  innerLo: new THREE.MeshLambertMaterial({ color: 0x323a2f }),
  frame: new THREE.MeshLambertMaterial({ color: 0x6d757b }),
  panelBlack: new THREE.MeshLambertMaterial({ color: 0x191c1e }),
  dial: new THREE.MeshLambertMaterial({ color: 0x8b969d }),
  seat: new THREE.MeshLambertMaterial({ color: 0x33291f }),
  webbing: new THREE.MeshLambertMaterial({ color: 0x6b6350 }),
  brass: new THREE.MeshLambertMaterial({ color: 0x8c7139 }),
  // And the men. Sheepskin over a flying suit, a leather helmet, and the
  // yellow life jacket every one of them wore over the North Sea.
  suit: new THREE.MeshLambertMaterial({ color: 0x4a3f33 }),
  helmet: new THREE.MeshLambertMaterial({ color: 0x2d2620 }),
  maewest: new THREE.MeshLambertMaterial({ color: 0xb59234 }),
};

// The names the tools know these by. `planeTop` and `planeBottom` are the two
// that change from navy to navy, and `paint` is what changes them.
const M = {
  planeTop: P.top, planeBottom: P.bottom, prop: P.prop, gunDark: P.gunDark,
  bright: P.bright, glass: P.glass, cave: P.cave, wire: P.wire,
  star: P.star, insignia: P.insignia,
  // `steelDark` was written at four call sites and never defined, so the
  // Avenger flew with a torpedo drawn in Three's default white.
  steelDark: P.steel,
};

const SCHEMES = {
  // US Navy 1942: blue-grey over light grey.
  usn: [P.top, P.bottom],
  // Kriegsmarine shipboard: Luftwaffe splinter green over pale blue.
  luftwaffe: [P.gerTop, P.gerBottom],
  // What an OS2U was still wearing when the war started: grey all over.
  grey: [P.grey, P.greyDark],
  // IJN carrier aircraft, 1944: dark green over grey-green.
  ijn: [P.jpnTop, P.jpnBottom],
  // Aeronavale: blue-grey over light grey.
  france: [P.fraTop, P.fraBottom],
  // Bomber Command: camouflage above, night black below.
  raf: [P.rafTop, P.night],
  // The Eighth Air Force: bare metal, top and bottom, with the underside a
  // shade down on the upper so she still reads as having two sides to her.
  usaaf: [P.alloy, P.alloyLo],
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
/** A body of revolution: a profile turned about the vertical, for a dome. */
function lathe(p, m, pts, x, y, z, seg = 18) {
  const g = new THREE.LatheGeometry(
    pts.map(([r, h]) => new THREE.Vector2(Math.max(0.001, r), h)), seg);
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  p.add(o);
  return o;
}

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
function balkenkreuz(p, x, y, z, r, up = true, fit = null) {
  // Laid on the skin the same way the star and the hinomaru are -- see decal.
  const m = new THREE.Group();
  const pose = skinPose(p, x, y, z, faceDir(up, x), fit);
  if (pose) {
    m.position.copy(pose.pt);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pose.n);
  } else {
    m.position.set(x, y, z);
    if (!up) m.rotation.z = Math.PI / 2;
  }
  p.add(m);
  m.userData.sag = pose ? skinSag(m, r, fit || p) : [0, 0];
  m.userData.radius = r;
  // The white ground and the black cross on it, both laid over her curve.
  conformPoly(m, P.white, squarePts(r), 0.006, m.userData.sag, r);
  conformPoly(m, P.black, crossPts(r * 1.02, 0.32), 0.011, m.userData.sag, r);
  return m;
}

/**
 * A piece of an aeroplane that moves.
 *
 * The squadrons in the air are drawn as one instanced batch per type: the
 * whole machine is welded into a single geometry and stamped out sixty times,
 * which is the only way to have ninety aeroplanes up without the frame falling
 * over. Nothing welded can move, so anything that has to -- a bomb bay door, a
 * displacing trapeze, the weapon itself leaving the rack -- is registered here
 * instead, and `flightModels` pulls it out of the body and gives it a batch of
 * its own. See `Flights.add`.
 *
 * `node` is a group at the hinge. `axis` and `open` say how far it swings when
 * the bay is open; `fall` says it is a weapon, which drops away when released.
 */
function animPart(p, name, node, o = {}) {
  const list = p.userData.parts || (p.userData.parts = []);
  list.push({
    name, node, axis: o.axis || 'z', open: o.open || 0,
    fall: !!o.fall, spin: !!o.spin,
  });
  return node;
}

/** An aerial torpedo on its rack: case, warhead, tail cone, fins and screws. */
function torpedo(p, len = 4.2, r = 0.26) {
  const g = new THREE.Group();
  p.add(g);
  // The case, in three lengths the way a real one is built: warhead, air
  // flask, afterbody.
  airframe(g, P.warhead, [
    { z: len * 0.30, w: r * 2, h: r * 2, y: 0 },
    { z: len * 0.42, w: r * 2, h: r * 2, y: 0 },
    { z: len * 0.48, w: r * 1.5, h: r * 1.5, y: 0 },
    { z: len * 0.50, w: r * 0.5, h: r * 0.5, y: 0 },
  ], { flat: 0, e: 1, capF: false, mBot: P.warhead, seg: 14 });
  cyl(g, P.steel, r, r, len * 0.60, 0, 0, 0, 14).rotation.x = Math.PI / 2;
  airframe(g, P.steel, [
    { z: -len * 0.50, w: r * 0.9, h: r * 0.9, y: 0 },
    { z: -len * 0.38, w: r * 1.8, h: r * 1.8, y: 0 },
    { z: -len * 0.30, w: r * 2, h: r * 2, y: 0 },
  ], { flat: 0, e: 1, capA: false, mBot: P.steel, seg: 14 });
  // Contra-rotating screws on the tail, and the four fins round them.
  for (const at of [-len * 0.47, -len * 0.52]) {
    for (let i = 0; i < 4; i++) {
      const b = box(g, P.steel, 0.05, r * 0.9, 0.12, 0, 0, at);
      b.rotation.z = (i / 4) * Math.PI * 2;
      b.position.set(Math.sin(b.rotation.z) * r * 0.45,
        Math.cos(b.rotation.z) * r * 0.45, at);
      b.rotation.y = 0.4;
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const f = box(g, P.steel, 0.035, r * 1.0, 0.7, 0, 0, -len * 0.42);
    f.position.set(Math.sin(a) * r * 1.3, Math.cos(a) * r * 1.3, -len * 0.42);
    f.rotation.z = a;
  }
  // The wooden air tail the Japanese and the Americans both fitted for the
  // drop, which is what stops a torpedo diving when it hits the water: four
  // boards in a box round the fins, shed on entry.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const f = box(g, M.planeBottom, r * 2.7, 0.03, 0.5, 0, 0, -len * 0.56);
    f.position.set(Math.sin(a) * r * 1.65, Math.cos(a) * r * 1.65, -len * 0.56);
    f.rotation.z = a;
  }
  return g;
}

/** A general-purpose bomb on its crutch: ogive nose, body, cone and box tail. */
function bomb(p, len = 1.9, r = 0.23) {
  const g = new THREE.Group();
  p.add(g);
  airframe(g, P.bombBody, [
    { z: -len * 0.50, w: r * 0.7, h: r * 0.7, y: 0 },
    { z: -len * 0.34, w: r * 1.5, h: r * 1.5, y: 0 },
    { z: -len * 0.18, w: r * 2, h: r * 2, y: 0 },
    { z: len * 0.16, w: r * 2, h: r * 2, y: 0 },
    { z: len * 0.34, w: r * 1.7, h: r * 1.7, y: 0 },
    { z: len * 0.46, w: r * 1.1, h: r * 1.1, y: 0 },
    { z: len * 0.50, w: r * 0.45, h: r * 0.45, y: 0 },
  ], { flat: 0, e: 1, mBot: P.bombBody, seg: 12 });
  // The yellow band round the nose that says she is filled, and the fuse in
  // the end of her.
  cyl(g, P.bombBand, r * 1.02, r * 1.02, 0.09, 0, 0, len * 0.26, 14)
    .rotation.x = Math.PI / 2;
  cyl(g, P.bright, r * 0.2, r * 0.2, 0.14, 0, 0, len * 0.53, 8)
    .rotation.x = Math.PI / 2;
  // The box tail: four fins in a square shroud, the way a general-purpose
  // bomb of the war was finned.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const f = box(g, P.bombBody, 0.03, r * 0.9, len * 0.3, 0, 0, -len * 0.36);
    f.position.set(Math.sin(a) * r * 0.95, Math.cos(a) * r * 0.95, -len * 0.36);
    f.rotation.z = a;
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const f = box(g, P.bombBody, r * 2.0, 0.025, len * 0.2, 0, 0, -len * 0.40);
    f.position.set(Math.sin(a) * r * 1.35, Math.cos(a) * r * 1.35, -len * 0.40);
    f.rotation.z = a;
  }
  // The suspension lugs on her back.
  for (const z of [-len * 0.12, len * 0.12]) {
    box(g, M.gunDark, 0.1, 0.09, 0.07, 0, r * 1.02, z);
  }
  return g;
}

/**
 * A bomb bay: a well up inside the belly with a door either side of it.
 *
 * `y` is the belly line the doors lie in, `z` the middle of the bay, and the
 * well runs `len` fore and aft, `wide` across and `deep` up into her. The
 * doors are registered as moving parts, so the batch that draws the squadron
 * can open them on the run in and shut them again afterwards.
 */
function bombBay(p, o) {
  const { y, z, len, wide, deep } = o;
  // The well itself: a roof and four walls, open at the bottom. Built as one
  // solid block the doors opened on a flat dark panel with the weapon sealed
  // inside it, because a box has a floor and a bomb bay has not.
  box(p, M.cave, wide, 0.06, len, 0, y + deep, z);
  box(p, M.cave, wide, deep, 0.06, 0, y + deep / 2, z - len / 2);
  box(p, M.cave, wide, deep, 0.06, 0, y + deep / 2, z + len / 2);
  // The frames across the roof of it, which is what you see looking up in.
  for (let i = 0; i <= 4; i++) {
    box(p, M.gunDark, wide - 0.04, 0.07, 0.07, 0,
      y + deep - 0.07, z - len / 2 + (i / 4) * len);
  }
  for (const s of [-1, 1]) {
    box(p, M.cave, 0.06, deep, len, s * (wide / 2), y + deep / 2, z);
    box(p, M.gunDark, 0.05, 0.07, len, s * (wide / 2 - 0.05), y + deep * 0.5, z);
    const h = new THREE.Group();
    h.position.set(s * wide / 2, y, z);
    p.add(h);
    // The door, in the hinge's own frame: it reaches inboard to the centreline
    // and lies flush in the belly when it is shut.
    box(h, M.planeBottom, wide / 2, 0.055, len, -s * wide / 4, 0, 0);
    box(h, M.gunDark, wide / 2 - 0.06, 0.05, 0.07, -s * wide / 4, 0.05, 0);
    for (const zz of [-len * 0.3, 0, len * 0.3]) {
      box(h, M.gunDark, wide / 2 - 0.08, 0.05, 0.06, -s * wide / 4, 0.05, zz);
    }
    animPart(p, s < 0 ? 'bayPort' : 'bayStbd', h, { axis: 'z', open: s * 1.55 });
  }
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
  // Texture coordinates in metres, the same as everything else: round the
  // section for one and along her length for the other. Without them the skin
  // map samples one texel for the whole fuselage and a lofted body is a flat
  // tint -- which is what every aeroplane in this game was.
  const uv = [];
  for (const st of stations) {
    const girth = Math.PI * (st.w + st.h) * 0.5;
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const x = (st.w / 2) * Math.sign(c) * Math.pow(Math.abs(c), e);
      let y = (st.h / 2) * Math.sign(s) * Math.pow(Math.abs(s), e);
      if (y < 0) y *= 1 - flat;
      pos.push(x, st.y + y, st.z);
      uv.push((j / seg) * girth, st.z);
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
    uv.push(0, st.z);
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
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
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
  // And the texture coordinates that go with them, in metres: how far out the
  // span and how far back the chord. The skin map is laid on in metres (see
  // SKIN_TILE), so a panel joint is the same size on a wing as it is on a
  // fuselage and the rivets do not stretch on the surfaces that taper.
  const uvUp = [];
  const uvDn = [];
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
      uvUp.push(o.span * f, u * c);
      uvDn.push(o.span * f, u * c);
    }
  }
  const skin = (arr, uv, mat, flip) => {
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
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    p.add(new THREE.Mesh(g, mat));
  };
  skin(up, uvUp, mTop, side < 0);
  skin(dn, uvDn, mBot, side > 0);
  // Tip and root, closed between the two skins.
  const shut = (k, mat, flip) => {
    const pos = [];
    const uv = [];
    for (let i = 0; i <= C; i++) {
      const a = (k * (C + 1) + i) * 3;
      pos.push(up[a], up[a + 1], up[a + 2], dn[a], dn[a + 1], dn[a + 2]);
      const cu = uvUp[(k * (C + 1) + i) * 2 + 1];
      uv.push(cu, up[a + 1], cu, dn[a + 1]);
    }
    const idx = [];
    for (let i = 0; i < C; i++) {
      const a = i * 2;
      if (flip) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    p.add(new THREE.Mesh(g, mat));
  };
  shut(S, mTop, side < 0);
  if (o.rootCap !== false) shut(0, mBot, side > 0);
  // And a sampler, so anything that has to sit on this panel can ask where the
  // skin is instead of being given a number. `f` is the fraction of the span
  // out from the root, `u` the fraction of the chord back from the leading
  // edge; `top` picks the surface. See `leBand` and `wingGun`.
  const at = (f, u, top) => {
    const tipR = round ? Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (f - 0.88) / 0.12), 2))) : 1;
    const c = rootC + (tipC - rootC) * f;
    const ht = foil(u, t) * c * tipR;
    const yc = camber * 4 * u * (1 - u) * c;
    const lift = (o.twist || 0) * f * (u - 0.25) * c;
    return [
      o.x + side * o.span * f,
      o.y + Math.sin(o.dihedral || 0) * o.span * f + yc + (top ? ht : -ht) + lift,
      o.z - (o.sweep || 0) * f - u * c,
    ];
  };
  return { at, o, side };
}

/**
 * The identification band round a leading edge.
 *
 * Every Japanese naval aircraft after 1942 carried a yellow band along the
 * leading edge of the wing from the root out to about mid-span, and it is the
 * one marking that says at a glance whose side an aeroplane is on.
 *
 * It is built off the panel's own surface rather than as a plank laid near it:
 * a strip of the wing's own skin, wrapped round the leading edge from a little
 * way back on top to a little way back underneath, and stood a centimetre
 * proud so it reads as paint. Drawn as a box it floated in front of a wing
 * that is a knife edge at the leading edge and has no thickness to hold it.
 */
function leBand(p, mat, surf, f0, f1, uMax = 0.105, lift = 0.005) {
  const U = 7;
  const S = 4;
  const pos = [];
  const uvs = [];
  const idx = [];
  // How far round the section each point is, in metres, for the skin map.
  const runs = [];
  const ring = (f) => {
    const pts = [];
    for (let i = U; i >= 1; i--) pts.push(surf.at(f, (i / U) * uMax, true));
    pts.push(surf.at(f, 0, true));
    for (let i = 1; i <= U; i++) pts.push(surf.at(f, (i / U) * uMax, false));
    // Outward, in the section plane: perpendicular to the way the outline runs.
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const ty = b[1] - a[1];
      const tz = b[2] - a[2];
      const L = Math.hypot(ty, tz) || 1;
      out.push([pts[i][0], pts[i][1] + (tz / L) * lift, pts[i][2] - (ty / L) * lift]);
    }
    return { pts, out };
  };
  const N = U * 2 + 1;
  const rows = [];
  for (let k = 0; k <= S; k++) rows.push(ring(f0 + (f1 - f0) * (k / S)));
  for (const r of rows) {
    let run = 0;
    runs.push([0]);
    for (let i = 1; i < N; i++) {
      run += Math.hypot(r.pts[i][1] - r.pts[i - 1][1], r.pts[i][2] - r.pts[i - 1][2]);
      runs[runs.length - 1].push(run);
    }
  }
  // Two shells: the paint itself, and the lip at either end of the band where
  // it steps down onto the skin.
  for (const [k, r] of rows.entries()) {
    for (const [i, v] of r.out.entries()) { pos.push(v[0], v[1], v[2]); uvs.push(v[0], runs[k][i]); }
  }
  for (const [k, r] of rows.entries()) {
    for (const [i, v] of r.pts.entries()) { pos.push(v[0], v[1], v[2]); uvs.push(v[0], runs[k][i]); }
  }
  // Wound so the paint faces out of the wing. Taken the same way round as the
  // panel's own upper skin it came out inside out, and the band showed only
  // where it wrapped under the leading edge.
  const flip = surf.side > 0;
  for (let k = 0; k < S; k++) {
    for (let i = 0; i < N - 1; i++) {
      const a = k * N + i;
      const b = (k + 1) * N + i;
      if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1);
      else idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const base = rows.length * N;
  for (const [k, f2] of [[0, !flip], [S, flip]]) {
    for (let i = 0; i < N - 1; i++) {
      const a = k * N + i;
      const c = base + k * N + i;
      if (f2) idx.push(a, a + 1, c, c, a + 1, c + 1);
      else idx.push(a, c, a + 1, c, c + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat);
  p.add(mesh);
  return mesh;
}

/**
 * A patch of a panel's own skin, lifted a few millimetres off it.
 *
 * What a flap or a dive brake is: not a plank laid across a wing, which is
 * what they were, but a piece of the wing that moves. Built off the sampler,
 * it has the panel's own curve, taper, twist and dihedral in it, and closed it
 * shows as a joint line rather than as a shelf.
 */
function surfPatch(p, mat, surf, f0, f1, u0, u1, top, lift = 0.006, S = 5, C = 4) {
  const pos = [];
  const uvs = [];
  const idx = [];
  for (let k = 0; k <= S; k++) {
    const f = f0 + (f1 - f0) * (k / S);
    for (let i = 0; i <= C; i++) {
      const u = u0 + (u1 - u0) * (i / C);
      const a = surf.at(f, u, top);
      pos.push(a[0], a[1] + (top ? lift : -lift), a[2]);
      uvs.push(surf.o.span * f, u * surf.o.rootC);
    }
  }
  const flip = top ? surf.side < 0 : surf.side > 0;
  for (let k = 0; k < S; k++) {
    for (let i = 0; i < C; i++) {
      const a = k * (C + 1) + i;
      const b = (k + 1) * (C + 1) + i;
      if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1);
      else idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat);
  p.add(mesh);
  return mesh;
}

/**
 * The fairing where a wing meets a body.
 *
 * A wing does not join a fuselage at a step: there is a fillet there, long and
 * shallow, that carries the air round the corner. Drawn as a box -- which is
 * what every one of these was -- it stands at the root as a slab with square
 * corners, and on the Wildcat it was three quarters of a metre deep and read
 * as a crate bolted to the wing root.
 *
 * `len` is how far it runs fore and aft, `w` and `h` how wide and deep it is
 * at its fullest.
 */
function rootFillet(p, m, x, y, z, len, w, h) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  p.add(g);
  airframe(g, m, [
    { z: -len * 0.50, w: w * 0.16, h: h * 0.26, y: 0 },
    { z: -len * 0.26, w: w * 0.80, h: h * 0.84, y: 0 },
    { z: len * 0.04, w, h, y: 0 },
    { z: len * 0.32, w: w * 0.78, h: h * 0.84, y: 0 },
    { z: len * 0.50, w: w * 0.14, h: h * 0.24, y: 0 },
  ], { flat: 0.15, e: 0.9, mBot: m });
  return g;
}

/**
 * A control surface built out of the panel it hinges on.
 *
 * An aileron, a flap, a slot: the aft fifth of the wing between two stations,
 * standing a few millimetres proud so the hinge line and the gap either side
 * of it read. Drawn as a box laid across the panel -- which is what they all
 * were -- they float behind the trailing edge of any wing whose outer panel
 * does not have its chord datum at zero, and on the Dauntless the aileron
 * stood clear of the wing altogether.
 */
function ctrlSurface(p, mat, surf, f0, f1, u0 = 0.72, u1 = 0.995, lift = 0.007) {
  // Painted the way the panel round it is painted: blue-grey over light grey,
  // green over grey-green. Given one material for both faces, the underside of
  // every flap and aileron in the game came out in the upper-surface colour
  // and read from below as a black stripe down the trailing edge.
  surfPatch(p, mat, surf, f0, f1, u0, u1, true, lift, 5, 3);
  surfPatch(p, M.planeBottom, surf, f0, f1, u0, u1, false, lift, 5, 3);
  // The step where the surface stands off the panel is the hinge line, and it
  // is all of it that should show: a bar laid across the gap at either end
  // stood out behind the trailing edge as a black tab.
}

/**
 * A gun in a wing: the barrel standing out of the leading edge with its breech
 * inside the panel where a breech belongs.
 *
 * The station is asked for on the panel's own surface, so the barrel comes out
 * of the leading edge at that station rather than out of a point in the air
 * level with the root -- which on a swept wing is a foot in front of her.
 */
function wingGun(p, surf, f, r, out, len, m = M.gunDark) {
  const le = surf.at(f, 0.06, true);
  const lo = surf.at(f, 0.06, false);
  const y = (le[1] + lo[1]) / 2;
  const z = surf.at(f, 0, true)[2];
  // The blister the barrel comes out of. A leading edge is a knife edge, so a
  // barrel laid on the chord line at that station shows half its diameter
  // above it and half below and reads as a rod hung under the wing. On the
  // aeroplane there is a fairing there, moulded round the gun and faired back
  // into the panel, and that is what makes it part of the wing.
  const fr = cyl(p, M.planeTop, r * 1.5, r * 2.2, 0.52, le[0], y, z - 0.19, 10);
  fr.rotation.x = Math.PI / 2;
  const b = cyl(p, m, r, r, len, le[0], y, z + out - len / 2, 8);
  b.rotation.x = Math.PI / 2;
  arm(b, len / 2);
  return b;
}

/**
 * One blade of an airscrew.
 *
 * A propeller blade is a wing: an aerofoil section that starts nearly square
 * to the disc at the root, where the air comes at it slowly, and washes out to
 * a fine angle at the tip where the blade is doing four hundred miles an hour
 * through it. It is also the piece of an aeroplane that catches the light from
 * the most angles, so it is the last thing that should be a plank.
 *
 * Built in its own frame: the blade runs out along +y, the chord lies along z,
 * and the section is turned about the radial axis by the twist at that radius.
 */
function propBlade(p, m, len, rootC, tipC, rootA, tipA, thick = 0.13) {
  const S = 8;
  const C = 8;
  const N = C * 2;
  const pos = [];
  const idx = [];
  // `rootA` and `tipA` are how much of the chord lies in the plane of the
  // disc, as an angle: nought is a blade feathered edge-on to the airflow and
  // a right angle is one lying flat in the disc. A real blade is coarse at the
  // root and fine at the tip, and fine means *more* of it in the disc plane,
  // not less -- written the other way round the tips came out all but
  // feathered, and what every propeller in the game looked like head-on was
  // three black spears.
  for (let k = 0; k <= S; k++) {
    const f = k / S;
    // Narrow at the shank, widest a little outboard of half radius, and eased
    // off to a rounded tip.
    const shape = Math.sin(Math.PI * Math.min(1, 0.22 + f * 0.78)) ** 0.55;
    const c = (rootC + (tipC - rootC) * f) * (0.62 + 0.38 * shape)
      * (f > 0.93 ? Math.sqrt(Math.max(0, 1 - ((f - 0.93) / 0.07) ** 2)) : 1);
    const a = rootA + (tipA - rootA) * f;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const y = 0.06 + (len - 0.06) * f;
    for (let i = 0; i < N; i++) {
      const top = i <= C;
      const u = top ? i / C : (N - i) / C;
      const ht = foil(u, thick) * c * (top ? 1 : -1);
      // A little camber, the way a blade has a face and a back.
      const z0 = (0.28 - u) * c;
      const x0 = ht + 0.018 * c * 4 * u * (1 - u);
      pos.push(x0 * ca - z0 * sa, y, x0 * sa + z0 * ca);
    }
  }
  for (let k = 0; k < S; k++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a = k * N + i;
      const b = k * N + j;
      const c2 = (k + 1) * N + i;
      const d = (k + 1) * N + j;
      idx.push(a, c2, b, b, c2, d);
    }
  }
  // Closed at the root and at the tip, so there is nothing to look up.
  for (const [k, flip] of [[0, true], [S, false]]) {
    for (let i = 1; i < N - 1; i++) {
      const a = k * N;
      const b = k * N + i;
      const c2 = k * N + i + 1;
      if (flip) idx.push(a, c2, b); else idx.push(a, b, c2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, m);
  p.add(mesh);
  return mesh;
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
  // The inner lip of the cowl, rolled back into the mouth, and the front of
  // the engine behind it.
  //
  // A NACA cowl is a ring aerofoil: seen head on there is a lip that turns
  // inward, the crankcase filling the middle of the opening, and the spinner
  // on the end of the shaft. Without them the mouth was a plain dark hole with
  // a propeller apparently growing out of nothing in the middle of it.
  airframe(p, M.planeTop, [
    { z: z + 0.60, w: r * 1.52, h: r * 1.52, y },
    { z: z + 0.44, w: r * 1.28, h: r * 1.28, y },
    { z: z + 0.16, w: r * 1.20, h: r * 1.20, y },
  ], { seg: SEG, e: 1, capF: false, capA: false, mBot: M.planeTop });
  cyl(p, M.gunDark, r * 0.40, r * 0.70, 0.52, 0, y, z + 0.33, SEG)
    .rotation.x = Math.PI / 2;
  // Spinner, hub and blades. On an aeroplane that is going to run her engine
  // the blades go in a group of their own so the welder leaves them.
  const spinner = cyl(p, M.prop, 0.05, r * 0.44, 0.80, 0, y, z + 0.92, 16);
  spinner.rotation.x = Math.PI / 2;
  // The airscrew turns, on the deck and in the air, and it is registered as a
  // moving part so that a squadron drawn as one welded geometry can still turn
  // hers -- see animPart, and Flights.trimParts, which winds it on at a rate
  // her own airspeed decides.
  const disc = new THREE.Group();
  disc.position.set(0, y, z + 1.02);
  disc.userData.dynamic = true;
  p.add(disc);
  p.userData.prop = disc;
  // Marked on the disc itself, so a copy of this model can find its own
  // propeller rather than the one still aboard. See startFlyoff.
  disc.userData.isProp = true;
  animPart(p, 'prop', disc, { axis: 'z', spin: true });
  for (let i = 0; i < blades; i++) {
    const bl = new THREE.Group();
    bl.rotation.z = (i / blades) * Math.PI * 2 + 0.4;
    disc.add(bl);
    propBlade(bl, M.prop, span / 2, 0.30, 0.19, 0.60, 1.26);
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
  // Where the head of the fin is, for the aerial to be run to. Nothing else
  // knows: the fin is a wing panel stood on edge and swept, so its tip is not
  // over its root.
  return { finTop: [0, y + finH - 0.05, z + finC * 0.12] };
}

/**
 * The aerial: a mast on her spine and the wire aft to the head of the fin.
 *
 * Both ends measured rather than typed. The wire was a box of a guessed length
 * at a guessed rake, and on every machine in the game it stopped short of the
 * mast at one end and short of the fin at the other -- a stick of wire lying
 * in the air a foot above her back, attached to nothing.
 */
function aerial(p, x, y, z, h, finTop, m = M.planeTop) {
  box(p, m, 0.06, h, 0.06, x, y + h / 2, z);
  strut(p, M.wire, [x, y + h, z], finTop, 0.016, 4);
}

/**
 * Where the skin actually is, and which way it faces, at a marking's station.
 *
 * A marking is paint: it lies on the surface, follows its curve, and is the
 * same size whatever the surface is doing underneath it. Drawn at a typed-in
 * height it does neither -- on a fuselage that tapers, half of a roundel sank
 * inside and came out as a half-moon; on a wing with dihedral and a section,
 * the whole disc stood clear of the skin like a dinner plate resting on it.
 *
 * So the marking asks. A ray fired in along its own axis from well outside her
 * gives the point on the skin and the way that piece of skin is facing, and
 * both come back in the frame of whatever the marking is being added to.
 */
const NRM_M = new THREE.Matrix3();
function skinPose(p, x, y, z, dir, fit = null) {
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const hit = castLocal(p, [x - d.x * 6, y - d.y * 6, z - d.z * 6],
    [d.x, d.y, d.z], fit);
  if (!hit) return null;
  d.transformDirection(p.matrixWorld).normalize();
  const n = hit.face
    ? hit.face.normal.clone().applyNormalMatrix(NRM_M.getNormalMatrix(hit.object.matrixWorld)).normalize()
    : d.clone().negate();
  // Facing out of her, not into her: a loft can be wound either way and a
  // marking on the inside of the skin is no marking at all.
  if (n.dot(d) > 0) n.negate();
  const pt = p.worldToLocal(hit.point.clone());
  const nl = n.clone().transformDirection(
    new THREE.Matrix4().copy(p.matrixWorld).invert()).normalize();
  return { pt, n: nl };
}

/**
 * A marking laid on the skin: a stack of thin discs, sunk in half their depth
 * and turned to face the way the skin faces.
 *
 * `layers` is outward-first radius and material, and each one stands a
 * fraction of a millimetre further out than the last so the red of a hinomaru
 * never fights with the white round it.
 */
/**
 * How far the skin falls away from the tangent plane at a marking.
 *
 * A national marking is nearly as wide as the body it is painted on -- a
 * hinomaru a metre across on a fuselage a metre and a bit round -- so a flat
 * disc laid on the tangent plane has its centre on the skin and its rim
 * standing a hand's breadth clear of it. Two rays either side of the marking
 * give the sag at its own radius, which to second order is all the curvature
 * there is, and every point of the marking is then dropped onto the body by
 * the paraboloid those two numbers describe.
 *
 * Returned in the marking's own frame: how far down at `+r` along its X, and
 * how far down at `+r` along its Z.
 */
function skinSag(m, r, fit) {
  const at = (u, v) => {
    const hit = castLocal(m, [u, 3, v], [0, -1, 0], fit);
    return hit ? m.worldToLocal(hit.point.clone()).y : null;
  };
  const one = (u, v) => {
    const a = at(u, v);
    const b = at(-u, -v);
    // Both sides, so a marking a little off the crown of a body still comes
    // out symmetric about itself rather than sliding round it.
    const vals = [a, b].filter((q) => q !== null);
    if (!vals.length) return 0;
    const sag = vals.reduce((t, q) => t + q, 0) / vals.length;
    // Only ever a fall away from the plane, and never more than the marking's
    // own radius: a ray that found something else entirely must not bend the
    // marking round it.
    return Math.max(-r * 0.9, Math.min(0, sag));
  };
  return [one(r, 0), one(0, r)];
}

/**
 * A shape painted on the skin: a polygon in the marking's own plane, laid over
 * the body's curve.
 *
 * `pts` are [across, along] in metres about the marking's centre, in order
 * round the outline. They are triangulated as a fan from the middle, which is
 * all that is wanted: every marking here is convex or a star, and a star fans
 * correctly from its own centre.
 */
function conformPoly(m, mat, pts, lift, sag, r) {
  const pos = [];
  const uvs = [];
  const idx = [];
  const drop = (u, v) => sag[0] * (u / r) ** 2 + sag[1] * (v / r) ** 2;
  pos.push(0, lift, 0);
  uvs.push(0, 0);
  for (const [u, v] of pts) {
    pos.push(u, lift + drop(u, v), v);
    uvs.push(u, v);
  }
  for (let i = 0; i < pts.length; i++) {
    idx.push(0, 1 + ((i + 1) % pts.length), 1 + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat);
  m.add(mesh);
  return mesh;
}

/** The outline of a circle, as a polygon. */
function ringPts(r, seg = 20) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/** The outline of a five-pointed star, point up. */
function starPts(r, inner = 0.382) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return pts;
}

/**
 * The outline of a straight-armed cross, as one polygon.
 *
 * Wound the same way round as `ringPts` and `starPts`: a polygon taken the
 * other way comes out facing into the aeroplane, and what showed of the
 * balkenkreuz was the white ground with nothing on it.
 */
function crossPts(r, arm = 0.34) {
  const a = r * arm;
  return [
    [a, a], [a, r], [-a, r], [-a, a], [-r, a], [-r, -a], [-a, -a],
    [-a, -r], [a, -r], [a, -a], [r, -a], [r, a],
  ];
}

/** The outline of a square, corner-on rather than edge-on. */
function squarePts(r) {
  return [[r, r], [-r, r], [-r, -r], [r, -r]];
}

function decal(p, x, y, z, dir, layers, fit = null) {
  const m = new THREE.Group();
  const pose = skinPose(p, x, y, z, dir, fit);
  if (pose) {
    m.position.copy(pose.pt);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pose.n);
  } else {
    // Nothing under it -- keep the old behaviour rather than losing the
    // marking altogether.
    m.position.set(x, y, z);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(-dir[0], -dir[1], -dir[2]).normalize());
  }
  p.add(m);
  const big = layers.reduce((t, [r]) => Math.max(t, r), 0.1);
  m.userData.sag = pose ? skinSag(m, big, fit || p) : [0, 0];
  m.userData.radius = big;
  // Lifted more than it was. The drop is a paraboloid fitted to the fall at the
  // marking's own radius, and a real surface -- a wing near its leading edge,
  // a fuselage where it starts to close -- falls away faster than that. At six
  // millimetres the forward quarter of a roundel sank into the panel and what
  // showed was a crescent with a bite out of it.
  layers.forEach(([r, mat], i) => {
    conformPoly(m, mat, ringPts(r), 0.013 + i * 0.006, m.userData.sag, big);
  });
  return m;
}

/** Which way a marking is looking at her: down at a deck, up at an underside,
 * or in at a side. `true` is the upper surface, `'down'` the lower, `false`
 * the fuselage side on whichever beam the marking is on. */
function faceDir(up, x) {
  if (up === 'down') return [0, 1, 0];
  if (up) return [0, -1, 0];
  return [x >= 0 ? -1 : 1, 0, 0];
}

function insignia(p, x, y, z, r, up = true, fit = null) {
  const m = decal(p, x, y, z, faceDir(up, x), [[r, M.insignia]], fit);
  // The star, as one five-pointed outline laid over the same curve the disc
  // is laid over. It was five boxes standing on the blue: on a fuselage, where
  // the marking is nearly as wide as the body is round, the tips of those
  // boxes stood a hand's breadth clear of the skin.
  conformPoly(m, M.star, starPts(r * 0.92), 0.026, m.userData.sag, m.userData.radius);
  return m;
}

/**
 * The hinomaru: the Japanese national marking.
 *
 * A plain disc of red -- no star, no bars -- with the white surround the
 * late-war machines carried.
 */
function hinomaru(p, x, y, z, r, up = true, surround = true, fit = null) {
  const dir = faceDir(up, x);
  const layers = surround ? [[r * 1.18, M.star], [r, P.hinomaru]] : [[r, P.hinomaru]];
  return decal(p, x, y, z, dir, layers, fit);
}

/**
 * The cockade: the French national marking.
 *
 * Three concentric rings and no device inside them -- blue at the centre,
 * white round it, red outside -- which is why it is three layers where the
 * American star is a disc with an outline laid on it. The rings go on
 * outermost first, because each layer stands a shade prouder than the one
 * before and the eye has to see the red under the white under the blue.
 */
function cockade(p, x, y, z, r, up = true, fit = null) {
  return decal(p, x, y, z, faceDir(up, x), [
    [r, P.cockadeRed], [r * 0.66, M.star], [r * 0.33, P.cockadeBlue],
  ], fit);
}

/**
 * The rudder stripes, which every French aeroplane of 1940 carried.
 *
 * Three vertical bands across the rudder, blue at the leading edge and red at
 * the trailing one. Drawn as three thin slabs standing on the fin rather than
 * as paint, because the fin is a lofted foil and there is nothing to paint on.
 */
function rudderStripes(p, y, z, h, c, t = 0.05) {
  const w = c / 3;
  const bands = [P.cockadeBlue, M.star, P.cockadeRed];
  for (let i = 0; i < 3; i++) {
    box(p, bands[i], t, h, w * 0.96, 0, y, z - (i - 1) * w);
  }
}

function inline(p, r, y, z, span, blades = 3, spin = false) {
  airframe(p, M.planeTop, [
    { z: z - 1.95, w: r * 1.55, h: r * 1.70, y },
    { z: z - 1.20, w: r * 1.62, h: r * 1.78, y: y + 0.02 },
    { z: z - 0.50, w: r * 1.52, h: r * 1.66, y: y + 0.02 },
    { z: z + 0.10, w: r * 1.22, h: r * 1.34, y },
    { z: z + 0.44, w: r * 0.82, h: r * 0.90, y },
  ], { flat: 0.05, e: 0.92, capF: false, capA: false, mBot: M.planeTop });
  // The radiator bath under the nose, which is where a liquid-cooled engine
  // puts its drag.
  airframe(p, M.planeTop, [
    { z: z - 1.10, w: r * 0.70, h: r * 0.40, y: y - r * 0.86 },
    { z: z - 0.30, w: r * 0.86, h: r * 0.52, y: y - r * 0.92 },
    { z: z + 0.40, w: r * 0.80, h: r * 0.48, y: y - r * 0.90 },
  ], { flat: 0.2, e: 0.9, mBot: M.planeBottom });
  cyl(p, M.cave, r * 0.32, r * 0.32, 0.06, 0, y - r * 0.90, z + 0.44, 10)
    .rotation.x = Math.PI / 2;
  // The exhaust stacks down both sides, six a side.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      cyl(p, M.gunDark, 0.055, 0.055, 0.2, s * r * 0.80, y + r * 0.16,
        z - 1.5 + i * 0.24, 6).rotation.z = Math.PI / 2;
    }
  }
  // The spinner and the airscrew.
  const hub = new THREE.Group();
  hub.position.set(0, y, z + 0.52);
  p.add(hub);
  airframe(hub, M.planeTop, [
    { z: -0.10, w: r * 0.78, h: r * 0.78, y: 0 },
    { z: 0.24, w: r * 0.70, h: r * 0.70, y: 0 },
    { z: 0.58, w: r * 0.40, h: r * 0.40, y: 0 },
    { z: 0.76, w: r * 0.10, h: r * 0.10, y: 0 },
  ], { flat: 0, e: 1, capA: false, mBot: M.planeTop });
  const disc = new THREE.Group();
  disc.position.set(0, 0, 0.12);
  hub.add(disc);
  disc.userData.isProp = true;
  for (let i = 0; i < blades; i++) {
    const b = new THREE.Group();
    b.rotation.z = (i / blades) * Math.PI * 2;
    disc.add(b);
    propBlade(b, M.prop, span * 0.5, 0.26, 0.17, 0.58, 1.24);
  }
  p.userData.prop = disc;
  animPart(p, 'prop', disc, { axis: 'z', spin: true });
  return disc;
}

/** A main leg: oleo, scissors, wheel and the door on its side. */
/**
 * Where a leg or a strut meets the aeroplane, by looking rather than guessing.
 *
 * A ray fired straight up from under her at that point: the first thing it
 * meets is the underside of whatever is there -- wing, fuselage, fairing --
 * and that is where the leg has to start. Guessing it was how six of the nine
 * machines came to have undercarriages hanging in the air under them with
 * nothing joining them to the aeroplane at all.
 *
 * Null if there is nothing overhead, which means the caller is putting a leg
 * somewhere there is no aeroplane.
 */
const RAY_UP = new THREE.Raycaster();
const RAY_O = new THREE.Vector3();
const RAY_D = new THREE.Vector3();

/**
 * Fire a ray through the model in the model's own frame.
 *
 * The frame matters. These machines are built twice: once at the origin, for
 * the squadrons in the air, and once in place -- on a flight deck, on a
 * catapult on a battleship's quarterdeck, which is thirty metres from the
 * origin and drawn at the ship's own scale. A ray set up in world coordinates
 * from numbers that are the aeroplane's own left the aeroplane entirely and
 * struck the ship she was standing on, and whatever asked for it then put its
 * piece a hundred metres away.
 */
function castLocal(p, from, dir, only = null) {
  // Her own matrices, and her ancestors', brought up to date first.
  //
  // `updateMatrixWorld` walks down, not up: called on a wing panel it composes
  // that panel with whatever its parent's world matrix happened to be left at,
  // and until something updates the aeroplane herself that is the identity.
  // So the first ray fired on a machine built in place on a ship ran in one
  // frame and the ones after it ran in another, and the marking it placed
  // ended up thirty metres from the aeroplane. Walk the chain up, then the
  // subtree down, and every ray runs in the frame the model is actually in.
  const chain = [];
  for (let n = p; n; n = n.parent) chain.push(n);
  for (let i = chain.length - 1; i >= 0; i--) {
    const n = chain[i];
    if (n.matrixAutoUpdate) n.updateMatrix();
    if (n.parent) n.matrixWorld.multiplyMatrices(n.parent.matrixWorld, n.matrix);
    else n.matrixWorld.copy(n.matrix);
  }
  p.updateMatrixWorld(true);
  RAY_O.set(from[0], from[1], from[2]).applyMatrix4(p.matrixWorld);
  RAY_D.set(dir[0], dir[1], dir[2]).transformDirection(p.matrixWorld).normalize();
  RAY_UP.set(RAY_O, RAY_D);
  const targets = [];
  (only || p).traverse((o) => { if (o.isMesh && o.geometry) targets.push(o); });
  return RAY_UP.intersectObjects(targets, false)[0] || null;
}

function underside(p, x, z, from = -3) {
  const hit = castLocal(p, [x, from, z], [0, 1, 0]);
  return hit ? p.worldToLocal(hit.point.clone()).y : null;
}

/**
 * Where a ray fired through the model first meets it.
 *
 * The general form of `underside`, for the struts on a float plane: they have
 * to land on the deck of a float at one end and on the side of a fuselage at
 * the other, and neither of those is a number anybody should be typing in.
 */
function hitPoint(p, from, dir, only = null) {
  const hit = castLocal(p, from, dir, only);
  if (!hit) return null;
  const v = p.worldToLocal(hit.point.clone());
  return [v.x, v.y, v.z];
}

/**
 * A strut that finds both of its own ends.
 *
 * Given roughly where it runs, it fires a ray each way and lands on whatever
 * is actually there. A float plane drawn with struts at typed-in heights has
 * struts that reach neither the float nor the fuselage -- which is how the
 * Jake came to have her whole undercarriage, both floats and all eight struts,
 * floating under her joined to nothing.
 */
function bridgeStrut(p, from, to, r, onlyA = null, onlyB = null) {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const a = hitPoint(p, to, [-d[0], -d[1], -d[2]], onlyA) || from;
  const b = hitPoint(p, from, d, onlyB) || to;
  return strut(p, M.planeTop, a, b, r);
}

/**
 * A fairing from a leg's top up to the aeroplane over it.
 *
 * Short and tapered: on a real machine it is the oleo housing standing out of
 * the wheel well, and it is the piece that was missing.
 */
function legRoot(p, x, z, topOfLeg, m = M.planeBottom, w = 0.26) {
  // Fired from just above the top of the leg, not from under the aeroplane:
  // started underneath, the first thing the ray meets is the tyre the leg is
  // standing on, and the answer comes back below where it started.
  const y = underside(p, x, z, topOfLeg + 0.03);
  if (y === null || y <= topOfLeg + 0.02) return null;
  return box(p, m, w, y - topOfLeg + 0.06, w * 1.5, x, (y + topOfLeg) / 2, z);
}

function mainGear(p, s, x, z, len, r, rake = 0.12) {
  // Where the wing's underside is, asked before the leg exists: fired from the
  // top of the leg it found the panel's *upper* skin instead on every machine
  // whose leg is long enough to reach up inside the wing, and the wheel well
  // came out as a black box standing on top of her mainplane.
  const skin = underside(p, x, z, 0.02);
  const leg = new THREE.Group();
  leg.position.set(x, len, z);
  leg.rotation.z = -s * rake;
  // What the leg found over it, for the check that every undercarriage on
  // every machine is bolted to an aeroplane rather than hanging under one.
  leg.userData.legFoot = { x, z, top: len, skin };
  p.add(leg);
  cyl(leg, M.planeBottom, 0.12, 0.14, len * 0.62, 0, -len * 0.3, 0, 8);
  cyl(leg, M.bright, 0.085, 0.085, len * 0.44, 0, -len * 0.72, 0, 8);
  box(leg, M.planeBottom, 0.05, len * 0.3, 0.16, s * 0.12, -len * 0.5, 0.1);
  const tyre = cyl(leg, M.prop, r, r, 0.28, s * 0.16, -len * 0.93, 0, 14);
  tyre.rotation.z = Math.PI / 2;
  cyl(leg, M.bright, r * 0.42, r * 0.42, 0.3, s * 0.16, -len * 0.93, 0, 10)
    .rotation.z = Math.PI / 2;
  // The wheel well, in the underside of the wing where a wheel well is -- not
  // down by the tyre, which is where it used to be drawn.
  if (skin !== null) box(p, M.cave, 0.5, 0.14, 0.66, x - s * 0.1, skin - 0.07, z);
  // And the oleo housing joining the leg to her.
  legRoot(p, x, z, len - 0.02);
  return leg;
}

/** Tailwheel and the hook stowed up under the sternpost. */
function tailGear(p, z, r, hookLen, len = 0.42) {
  // The wheel and its leg in a group of their own, so they can be swung up
  // into the sternpost; the hook stays where it is, because a hook that goes
  // up with the wheel is a hook that cannot catch a wire.
  const leg = new THREE.Group();
  leg.position.set(0, r + len, z);
  leg.userData.legFoot = { x: 0, z, top: r + len, skin: underside(p, 0, z, 0.02) };
  p.add(leg);
  cyl(leg, M.planeBottom, 0.09, 0.11, len, 0, -len * 0.52, 0, 8);
  cyl(leg, M.prop, r, r, 0.16, 0, -len, 0, 10).rotation.z = Math.PI / 2;
  const HOOK_RAKE = -0.34;
  const hookY = r + 0.75;
  const hookZ = z - hookLen * 0.42;
  const hook = box(p, M.gunDark, 0.09, 0.09, hookLen, 0, hookY, hookZ);
  hook.rotation.x = HOOK_RAKE;
  // The head, on the end of the arm rather than at a guessed height under it.
  // A hook drawn at a rake and a head placed flat leave a gap between the two,
  // and the head is then an object hanging under the aeroplane on nothing.
  const half = hookLen * 0.5;
  box(p, M.gunDark, 0.2, 0.16, 0.3,
    0, hookY - Math.sin(-HOOK_RAKE) * half, hookZ - Math.cos(HOOK_RAKE) * half);
  // The sternpost the leg retracts into, from the wheel up to the tail itself.
  // Without it the whole tail unit -- wheel, leg and hook -- hung under her
  // with a hand's breadth of air between it and the aeroplane.
  legRoot(p, 0, z, r + len - 0.02, M.planeBottom, 0.2);
  // And the hook's own root, for the same reason.
  legRoot(p, 0, z - hookLen * 0.42, r + 0.75, M.gunDark, 0.12);
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
    const sw = wing(w, M.planeTop, M.planeBottom, {
      side: s, x: 0, y: 0, z: 0, span: 4.98, rootC: 1.80, tipC: 1.26,
      sweep: 0.30, thick: 0.112, camber: 0.022, twist: -0.02, rootCap: false,
    });
    ctrlSurface(w, M.planeTop, sw, 0.57, 0.92);                      // aileron
    ctrlSurface(w, M.planeTop, sw, 0.12, 0.48, 0.70);                // flap
    // Her fifties: the muzzles standing out of the leading edge at the station
    // they are in, with the breech inside the panel. Placed by hand they were
    // a pair of cubes hung two thirds of a metre ahead of the wing, in the air
    // on their own; asked of the panel, they come out of it.
    for (const gf of [1.3 / 4.98, 2.3 / 4.98]) {
      wingGun(w, sw, gf, 0.05, 0.30, 0.66);
      // The ammunition-bay access panel over the breech, lying in the skin.
      surfPatch(w, M.planeTop, sw, gf - 0.045, gf + 0.045, 0.14, 0.40, true, 0.006, 2, 2);
    }
    insignia(w, s * 2.7, 0.14, -0.42, 0.56);
    // The root fillet: the wing does not meet the body at a step.
    rootFillet(w, M.planeTop, s * 0.16, 0.02, -0.70, 2.3, 0.48, 0.30);
  }
  stowed.visible = !!folded;
  spread.visible = !folded;
  p.userData.wings = { stowed, spread };
  // The stub the panels fold off, which is there whichever way they are set,
  // and the hinge fairing, which is only a thing to look at when they are
  // folded back along her: spread, it stood out at the root as a pale slab
  // half a metre thick on top of a wing.
  for (const s of [-1, 1]) {
    rootFillet(p, M.planeTop, s * 0.66, cl(1.05) - 0.24, 1.15, 2.7, 0.66, 0.62);
    const hinge = box(stowed, M.planeBottom, 0.86, 0.34, 1.0,
      s * 0.98, cl(1.1) - 0.12, 1.3);
    hinge.rotation.z = s * 0.22;
  }
  insignia(p, 0.40, cl(-1.5) + 0.08, -1.5, 0.38, false);
  insignia(p, -0.40, cl(-1.5) + 0.08, -1.5, 0.38, false);
  const tail = empennage(p, 1.34, 1.16, 3.75, 0.92, cl(-3.5) + 0.34, -3.3);
  // Her narrow-track gear cranks up into the fuselage sides, so it stands close
  // in under her and the wheels are half buried when it is down.
  if (opts.gear !== false) {
    for (const s of [-1, 1]) mainGear(p, s, s * 0.72, 1.5, 1.02, 0.34, 0.02);
    tailGear(p, -3.85, 0.17, 1.0, 0.3);
  }
  // Aerial mast and the wire back to the fin.
  aerial(p, 0, cl(0.5) + 1.01, 0.5, 0.62, tail.finTop);
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
  // Her two fifties, in troughs through the top of the cowling and firing
  // through the propeller disc. They are the guns she attacks with, and she
  // had no others forward: the pair in the back are the gunner's.
  for (const s of [-1, 1]) {
    box(p, M.cave, 0.16, 0.10, 1.30, s * 0.20, cl(3.3) + 0.60, 3.20);
    arm(cyl(p, M.gunDark, 0.048, 0.048, 0.60, s * 0.20, cl(3.7) + 0.60, 3.90, 6), 0.30)
      .rotation.x = Math.PI / 2;
  }
  // The greenhouse: pilot forward, gunner aft under a long open hood.
  greenhouse(p, 0.92, 0.70, cl(0.9) + 0.76, -1.0, 2.05, 4);
  // The gunner's cockpit: the well he sits in cut into the turtledeck, the
  // coaming round the opening, his seat and his back armour, and the ring the
  // twin thirties swing on. It was a plain dark box standing on her spine,
  // which from any angle read as a crate strapped to the aeroplane.
  const GZ = -1.75;
  const spine = (hitPoint(p, [0, 6, GZ], [0, -1, 0]) || [0, cl(GZ) + 0.92, GZ])[1];
  box(p, M.cave, 0.74, 0.40, 1.55, 0, spine - 0.16, GZ);
  for (const s of [-1, 1]) {
    box(p, M.planeTop, 0.07, 0.13, 1.58, s * 0.40, spine + 0.03, GZ);
  }
  box(p, M.planeTop, 0.86, 0.13, 0.08, 0, spine + 0.03, GZ + 0.79);
  box(p, M.planeTop, 0.86, 0.13, 0.08, 0, spine + 0.03, GZ - 0.79);
  box(p, M.gunDark, 0.44, 0.06, 0.40, 0, spine - 0.22, GZ - 0.05);   // his seat
  box(p, M.gunDark, 0.46, 0.44, 0.06, 0, spine - 0.02, GZ - 0.42);   // back armour
  // His twin thirties on their ring, stowed forward over the coaming.
  cyl(p, M.planeTop, 0.44, 0.46, 0.1, 0, spine + 0.06, GZ - 0.25, 16);
  for (const s of [-1, 1]) {
    const gun = cyl(p, M.gunDark, 0.05, 0.05, 1.4, s * 0.15, spine + 0.34, GZ - 0.1, 6);
    gun.rotation.x = -0.42;
  }
  box(p, M.gunDark, 0.46, 0.1, 0.34, 0, spine + 0.18, GZ + 0.05);
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
    const sw = wing(w, M.planeTop, M.planeBottom, {
      side: s, x: 0, y: 0, z: 1.84, span: 4.35, rootC: 2.20, tipC: 1.18,
      sweep: 0.62, thick: 0.112, camber: 0.024, twist: -0.03, rootCap: false,
    });
    ctrlSurface(w, M.planeTop, sw, 0.61, 0.97);                        // aileron
    leBand(w, M.gunDark, sw, 0.62, 0.97, 0.05, 0.006);                 // slot
    // The split flaps, closed: the aft fifth of her own skin above and below,
    // perforated, which is the whole reason an SBD can put a bomb where she
    // puts one. They were a pair of planks lying across the panel; built off
    // the panel's own surface they have its curve and taper and closed they
    // show as a joint line, which is all they should.
    for (const top of [true, false]) {
      surfPatch(w, top ? M.planeTop : M.planeBottom, sw,
        0.03, 0.92, 0.80, 0.995, top, 0.007, 8, 3);
      // The holes: the perforation that killed the buffeting and made her the
      // one dive bomber that could be held in a dive.
      for (let i = 0; i < 10; i++) {
        const f = 0.07 + (i / 9) * 0.82;
        const a = sw.at(f, 0.89, top);
        cyl(w, M.cave, 0.05, 0.05, 0.05, a[0], a[1] + (top ? 0.008 : -0.008), a[2], 6);
      }
    }
    insignia(w, s * 2.5, 0.16, 0.55, 0.62);
    // The landing light in the port leading edge and the pitot under it. Her
    // guns are not here: an SBD's forward armament is the pair of fifties in
    // the cowling, which is where they are.
    box(w, M.gunDark, 0.18, 0.18, 0.2, s * 0.5, -0.1, 1.82);
  }
  insignia(p, 0.35, cl(-2.3) + 0.11, -2.3, 0.34, false);
  insignia(p, -0.35, cl(-2.3) + 0.11, -2.3, 0.34, false);
  const tail = empennage(p, 1.5, 1.32, 3.9, 1.02, cl(-4.3) + 0.4, -4.0);
  // The displacing trapeze, and the thousand-pounder on it.
  //
  // A dive bomber has no bomb bay. A bomb released from the belly of a machine
  // standing on her nose goes through her own airscrew, so the SBD carries
  // hers on a yoke that swings down and forward on the release and throws her
  // clear of the disc before she is let go. The yoke is a moving part -- see
  // animPart -- and so is the bomb, hung on the same pivot so the two swing
  // together and the bomb alone falls away at the bottom of the stroke.
  const belly = underside(p, 0, 1.3, -4) ?? (cl(1.3) - 1.05);
  const PIV = [0, belly + 0.04, 1.15];
  // The fittings the yoke hangs on, which stay put.
  for (const s of [-1, 1]) {
    box(p, M.gunDark, 0.1, 0.22, 0.5, s * 0.24, belly - 0.06, 1.15);
  }
  const yoke = new THREE.Group();
  yoke.position.set(PIV[0], PIV[1], PIV[2]);
  p.add(yoke);
  for (const s of [-1, 1]) {
    // The two arms, reaching down and a little forward to the bomb's band.
    strut(yoke, M.gunDark, [s * 0.22, -0.04, 0], [s * 0.13, -0.62, 0.30], 0.055);
    strut(yoke, M.gunDark, [s * 0.22, -0.04, 0], [s * 0.13, -0.62, -0.26], 0.045);
  }
  box(yoke, M.gunDark, 0.34, 0.07, 0.9, 0, -0.64, 0.02);
  animPart(p, 'trapeze', yoke, { axis: 'x', open: -0.92 });
  const store = new THREE.Group();
  store.position.set(PIV[0], PIV[1], PIV[2]);
  p.add(store);
  const shell = new THREE.Group();
  shell.position.set(0, -0.82, 0.02);
  store.add(shell);
  bomb(shell, 2.2, 0.24);
  animPart(p, 'store', store, { axis: 'x', open: -0.92, fall: true });
  if (opts.gear !== false) {
    for (const s of [-1, 1]) mainGear(p, s, s * 1.5, 1.7, 1.06, 0.4);
    tailGear(p, -4.45, 0.19, 1.2, 0.34);
  }
  aerial(p, 0, cl(0.6) + 1.05, 0.6, 0.7, tail.finTop);
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
  // Her bomb bay, and the Mark 13 in it. An Avenger is built round this: she
  // is the only carrier aeroplane in the game that carries her weapon inside
  // her, and the bay door either side is a third of her belly. The belly line
  // is asked of the model rather than typed in, so the doors lie in the skin
  // instead of a hand's breadth under it.
  const belly = underside(p, 0, 1.2, -4) ?? (cl(1.2) - 1.04);
  bombBay(p, { y: belly + 0.01, z: 1.2, len: 4.6, wide: 0.98, deep: 0.56 });
  const fish = new THREE.Group();
  fish.position.set(0, belly + 0.33, 1.15);
  p.add(fish);
  torpedo(fish, 4.3, 0.24);
  animPart(p, 'store', fish, { fall: true });
  greenhouse(p, 1.14, 0.80, cl(2.3) + 1.0, 1.05, 3.55, 4);
  // The turret: a glazed ball on its ring with the fifty out of the side, and
  // the one thing that names a TBF at any range. It was a drum with a dozen
  // heavy bars round it; a ball turret is a dome, so it is turned as one.
  const TY = cl(-0.5) + 0.86;
  lathe(p, M.planeTop, [[0.74, 0], [0.76, 0.1], [0.74, 0.2]], 0, TY, -0.5, 18);
  lathe(p, M.glass, [
    [0.70, 0.18], [0.72, 0.36], [0.70, 0.62], [0.62, 0.86],
    [0.48, 1.04], [0.28, 1.16], [0, 1.20],
  ], 0, TY, -0.5, 18);
  // Four frames over the dome and a hoop round its waist -- what you actually
  // see of a turret, and no more of them than there were.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const f = box(p, M.planeTop, 0.05, 1.06, 0.05,
      Math.sin(a) * 0.66, TY + 0.66, -0.5 + Math.cos(a) * 0.66);
    f.rotation.x = Math.cos(a) * 0.36;
    f.rotation.z = -Math.sin(a) * 0.36;
  }
  lathe(p, M.planeTop, [[0.71, 0.60], [0.735, 0.64], [0.71, 0.68]], 0, TY, -0.5, 18);
  lathe(p, M.planeTop, [[0.2, 1.17], [0.16, 1.24], [0, 1.26]], 0, TY, -0.5, 14);
  const fifty = cyl(p, M.gunDark, 0.055, 0.055, 1.5, 0.34, TY + 0.66, 0.1, 6);
  fifty.rotation.x = -0.32;
  // The slot it traverses in, and the collar round the breech.
  box(p, M.cave, 0.16, 0.5, 0.34, 0.62, TY + 0.62, -0.42);
  cyl(p, M.planeTop, 0.13, 0.13, 0.26, 0.34, TY + 0.56, -0.20, 10)
    .rotation.x = -0.32;
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
    const sw = wing(w, M.planeTop, M.planeBottom, {
      side: s, x: 0, y: 0, z: 0, span: 7.25, rootC: 2.9, tipC: 1.5,
      sweep: 0.85, thick: 0.112, camber: 0.024, twist: -0.03, rootCap: false,
    });
    ctrlSurface(w, M.planeTop, sw, 0.57, 0.88);                      // aileron
    ctrlSurface(w, M.planeTop, sw, 0.06, 0.47, 0.70);                // flap
    wingGun(w, sw, 1.5 / 7.25, 0.05, 0.28, 0.70);                    // wing fifty
    insignia(w, s * 4.0, 0.16, -0.6, 0.72);
  }
  stowed.visible = folded;
  spread.visible = !folded;
  p.userData.wings = { stowed, spread };
  insignia(p, 0.48, cl(-2.6) + 0.10, -2.6, 0.46, false);
  insignia(p, -0.48, cl(-2.6) + 0.10, -2.6, 0.46, false);
  const tail = empennage(p, 2.05, 1.7, 5.8, 1.3, cl(-5.2) + 0.46, -4.8);
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
  aerial(p, 0, cl(1.4) + 1.50, 1.4, 0.8, tail.finTop);
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
  // The MG 17 over her cowling, offset to starboard of the centreline where
  // it was, firing through the disc.
  arm(cyl(p, P.gunDark, 0.042, 0.042, 0.56, 0.22, cl(3.4) + 0.62, 3.80, 6), 0.28)
    .rotation.x = Math.PI / 2;
  box(p, P.gunDark, 0.14, 0.10, 0.90, 0.22, cl(3.0) + 0.60, 3.10);
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
    const sw = wing(w, TOP, BOT, {
      side: s, x: 0, y: 0, z: 0, span: 5.70, rootC: 2.30, tipC: 1.30,
      sweep: 0.34, thick: 0.125, camber: 0.024, twist: -0.025, rootCap: false,
    });
    ctrlSurface(w, TOP, sw, 0.57, 0.93);                       // aileron
    ctrlSurface(w, TOP, sw, 0.12, 0.50, 0.70);                 // flap
    // Her 20 mm in the leading edge, and the blister over the drum behind it.
    arm(cyl(w, P.gunDark, 0.055, 0.055, 0.62, s * 2.05, 0.03, 0.16, 6), 0.32)
      .rotation.x = Math.PI / 2;
    box(w, TOP, 0.36, 0.16, 0.72, s * 2.05, 0.02, -0.28);
    // The bomb rack under her, and the fifty kilos on it.
    box(w, P.gunDark, 0.24, 0.16, 0.50, s * 2.60, -0.14, -0.20);
    cyl(w, P.gunDark, 0.16, 0.16, 0.90, s * 2.60, -0.32, -0.20, 10)
      .rotation.x = Math.PI / 2;
    balkenkreuz(w, s * 3.30, 0.13, -0.50, 0.38);
    // The root fillet, so the wing does not meet the body at a step.
    rootFillet(w, TOP, s * 0.14, 0.01, -0.90, 2.5, 0.42, 0.30);
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
  const tail = empennage(p, 1.42, 1.26, 4.00, 1.00, cl(-4.6) + 0.30, -4.30);
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
      // Struts up to the body and out to the wing: an N each side, braced
      // fore and aft. Both ends of each are found by looking -- the forward
      // pair used to start at a height on the float's deck that the deck is
      // not at, so they stood in the air with the float under them and the
      // aeroplane over them and touched neither.
      // Both feet on the float's own deck, and the brace between them running
      // foot to foot. It used to run between two points a hand's breadth off
      // both of them, so the forward pair of struts were joined to nothing at
      // either end and stood in the air between the float and the aeroplane.
      const fwd = [s * 1.66, 0.84, 1.55];
      const aft = [s * 1.66, 0.84, -0.60];
      const top = (zz) => [s * 0.36, cl(zz) - 0.58, zz];
      const wingAt = (zz) => [s * 1.72, ROOT[1] - 0.10, zz];
      strut(p, TOP, fwd, top(1.30), 0.065);
      strut(p, TOP, aft, top(-0.90), 0.065);
      strut(p, TOP, fwd, wingAt(1.20), 0.055);
      strut(p, TOP, aft, wingAt(-0.50), 0.055);
      strut(p, TOP, fwd, aft, 0.04);
      // The catapult spool under her, which is what the trolley picks her up
      // by and the one fitting that says she is a shipboard aeroplane.
      cyl(fl, P.gunDark, 0.08, 0.08, 0.26, 0, 0.10, 0.40, 8)
        .rotation.z = Math.PI / 2;
    }
    // The spreader between the two floats, under the body.
    strut(p, TOP, [-1.66, 0.90, 0.60], [1.66, 0.90, 0.60], 0.05);
  }
  // The aerial mast and the wire aft to the fin.
  aerial(p, 0, cl(1.4) + 1.10, 1.40, 0.52, tail.finTop, TOP);
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
  // Her one fixed thirty, in a trough along the top of the cowling to
  // starboard. A Kingfisher is a spotter and this is the whole of what she
  // could shoot back with, but it is what she shot with, so it is here.
  box(p, P.cave, 0.13, 0.09, 1.00, 0.18, cl(2.8) + 0.56, 2.70);
  arm(cyl(p, P.gunDark, 0.036, 0.036, 0.50, 0.18, cl(3.2) + 0.56, 3.24, 6), 0.26)
    .rotation.x = Math.PI / 2;
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
    const sw = wing(w, TOP, BOT, {
      side: s, x: 0, y: 0, z: 0, span: 5.02, rootC: 2.05, tipC: 1.32,
      sweep: 0.10, thick: 0.135, camber: 0.030, twist: -0.03, rootCap: false,
    });
    ctrlSurface(w, TOP, sw, 0.58, 0.92);                        // aileron
    ctrlSurface(w, TOP, sw, 0.12, 0.48, 0.70);                  // flap
    // The full-span leading-edge slot, which is the one thing on her that a
    // carrier aeroplane has not got.
    box(w, TOP, 4.40, 0.07, 0.16, s * 2.60, 0.07, 0.03);
    insignia(w, s * 2.90, 0.13, -0.44, 0.50);
    rootFillet(w, TOP, s * 0.14, 0.00, -0.78, 2.3, 0.40, 0.28);  // root fillet
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
  const tail = empennage(p, 1.36, 1.20, 3.66, 0.94, cl(-4.3) + 0.28, -4.05);

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
  aerial(p, 0, cl(1.0) + 1.04, 1.00, 0.48, tail.finTop, TOP);
  return p;
}



/**
 * A Besson MB.411: the aeroplane the Surcouf carried, and the only one there
 * has ever been much point building for a single ship.
 *
 * Nine were made and two of them were hers, because she is the only thing they
 * fit: everything about this machine is shaped by a cylindrical hangar a metre
 * and three quarters across in the back of a submarine's tower. She is small
 * -- twelve metres of span and eight and a quarter of length, a hundred and
 * seventy-five horsepower, two men -- her wings come off at the root and fold
 * alongside, her float unships, and the whole of her goes into the tube in
 * pieces. Four minutes to put her together alongside, twenty at sea, and the
 * boat lies on the surface with a hole in her the whole time.
 *
 * Wood and metal under canvas, which is why she looks softer than the metal
 * aeroplanes she flies among: a low wing with a thick root, a single big float
 * under her belly, a little one under each tip, and a Salmson nine-cylinder in
 * a narrow-chord cowl that leaves the cylinder heads out in the air.
 */
function besson(g, x, y, z, ry, opts = {}) {
  const [TOP, BOT] = paint('france');
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  // Her centreline, rising a little toward the nose the way a float plane's
  // does: she sits nose-up on the water so the airscrew stays out of it.
  const cl = (zz) => 1.78 + 0.034 * zz;

  // The body. Eight and a quarter metres of her, slab-sided forward where the
  // two cockpits are and drawn out to nothing at the sternpost.
  airframe(p, TOP, [
    { z: -4.15, w: 0.13, h: 0.40, y: cl(-4.15) + 0.24 },
    { z: -3.58, w: 0.31, h: 0.60, y: cl(-3.58) + 0.19 },
    { z: -2.85, w: 0.48, h: 0.78, y: cl(-2.85) + 0.13 },
    { z: -2.05, w: 0.62, h: 0.92, y: cl(-2.05) + 0.07 },
    { z: -1.00, w: 0.72, h: 1.02, y: cl(-1.00) + 0.02 },
    { z: 0.10, w: 0.76, h: 1.06, y: cl(0.10) },
    { z: 1.10, w: 0.76, h: 1.06, y: cl(1.10) },
    { z: 2.05, w: 0.72, h: 1.00, y: cl(2.05) + 0.02 },
    { z: 2.80, w: 0.62, h: 0.90, y: cl(2.80) + 0.04 },
  ], { flat: 0.09, e: 0.93, mBot: BOT });
  // The Salmson 9Nd: a hundred and seventy-five horsepower, which is less than
  // a third of what any other aeroplane in this game has, on a two-bladed
  // airscrew two and a third metres across.
  radial(p, 0.50, cl(2.92) + 0.03, 2.88, 2.34, 2, !!opts.spin);
  // Her exhaust collector ring, outside the cowl, which is what a Salmson
  // wears and what makes her read as French from ahead.
  cyl(p, M.gunDark, 0.52, 0.52, 0.10, 0, cl(2.92) + 0.03, 2.50, 18)
    .rotation.x = Math.PI / 2;

  // Two men in tandem under one long hood: the pilot over the wing and the
  // observer behind him, which is the arrangement of every naval observation
  // aeroplane of the period and the reason she is worth carrying at all.
  greenhouse(p, 0.66, 0.46, cl(0.0) + 0.52, -2.35, 1.70, 5);
  // The observer's ring and his Darne. She went to sea unarmed as often as
  // not -- she is a pair of eyes and nothing else -- but the ring was fitted
  // and this is what went on it when anything did.
  const ringY = cl(-1.75) + 0.98;
  cyl(p, M.gunDark, 0.31, 0.31, 0.05, 0, ringY, -1.85, 14);
  const mg = cyl(p, M.gunDark, 0.034, 0.034, 0.78, 0.07, ringY + 0.18, -2.12, 6);
  mg.rotation.x = -1.16;
  // The turtle deck aft of the hood.
  airframe(p, TOP, [
    { z: -3.76, w: 0.18, h: 0.20, y: cl(-3.76) + 0.28 },
    { z: -2.85, w: 0.40, h: 0.33, y: cl(-2.85) + 0.35 },
    { z: -2.45, w: 0.50, h: 0.40, y: cl(-2.45) + 0.38 },
  ], { flat: 0.3, e: 0.94, capF: false, mBot: TOP });

  // The wing: low-set, thick at the root, and it comes off there -- the two
  // panels unpin and fold back alongside her to go into the hangar, which is
  // the whole design of the aeroplane in one joint.
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.40, cl(0.4) - 0.40, 0.55);
    // Tips up, not down. A low wing on a float plane is given dihedral to get
    // the tip floats out of the water when she rolls, and three degrees of it
    // is what her drawings show.
    w.rotation.z = s * 0.055;
    p.add(w);
    const sw = wing(w, TOP, BOT, {
      side: s, x: 0, y: 0, z: 0, span: 5.58, rootC: 2.25, tipC: 1.36,
      sweep: 0.08, thick: 0.145, camber: 0.032, twist: -0.03, rootCap: false,
    });
    ctrlSurface(w, TOP, sw, 0.60, 0.94);                        // aileron
    ctrlSurface(w, TOP, sw, 0.10, 0.50, 0.72);                  // flap
    // The root joint: a band of fittings where the panel pins to the centre
    // section, which on this aeroplane is a thing you can see.
    box(w, M.bright, 0.10, 0.20, 2.05, s * 0.10, 0.04, 0.02);
    cockade(w, s * 3.30, 0.13, -0.40, 0.52);
    cockade(w, s * 3.30, -0.13, -0.40, 0.52, 'down');
    rootFillet(w, TOP, s * 0.12, 0.02, -0.66, 2.1, 0.36, 0.26);
    // The wingtip float, on a short pylon under the tip with a brace forward
    // and aft of it. They are what keep her upright on the water and they are
    // a third the size of the one she floats on.
    const ft = new THREE.Group();
    ft.position.set(s * 5.52, -0.62, -0.06);
    w.add(ft);
    seaFloat(ft, TOP, BOT, [
      [-0.62, 0.05, 0.24, 0.28, 0.36, 0.02],
      [-0.30, 0.13, 0.12, 0.19, 0.34, 0.03],
      [0.26, 0.15, 0.05, 0.15, 0.34, 0.03],
      [0.70, 0.11, 0.12, 0.20, 0.36, 0.03],
      [0.96, 0.03, 0.24, 0.29, 0.38, 0.02],
    ]);
    strut(w, TOP, [s * 5.52, -0.32, 0.10], [s * 5.20, 0.00, 0.14], 0.035);
    strut(w, TOP, [s * 5.52, -0.32, -0.28], [s * 5.20, 0.00, -0.36], 0.035);
  }
  cockade(p, 0.42, cl(-2.6) + 0.05, -2.60, 0.38, false);
  cockade(p, -0.42, cl(-2.6) + 0.05, -2.60, 0.38, false);
  const tail = empennage(p, 1.06, 1.00, 3.10, 0.82, cl(-3.58) + 0.24, -3.38);
  // And the rudder in blue, white and red, which is where a French aeroplane
  // carries her colours.
  rudderStripes(p, cl(-3.58) + 0.86, -3.74, 0.92, 0.78);

  // The main float: one, big, straight under her on a pair of faired pylons.
  // She is a little aeroplane carrying a lot of float, which is most of why
  // she does a hundred and eighteen miles an hour and no more.
  if (opts.floats !== false) {
    const fl = new THREE.Group();
    fl.position.set(0, 0, 0.25);
    p.add(fl);
    seaFloat(fl, TOP, BOT, [
      [-3.30, 0.14, 0.16, 0.62, 0.78, 0.03],
      [-2.30, 0.33, 0.34, 0.50, 0.76, 0.04],
      [-1.20, 0.45, 0.20, 0.38, 0.74, 0.05],
      [-0.28, 0.48, 0.15, 0.34, 0.74, 0.06],
      [-0.26, 0.48, 0.00, 0.31, 0.74, 0.06],
      [0.82, 0.48, 0.02, 0.31, 0.76, 0.06],
      [1.90, 0.42, 0.13, 0.36, 0.78, 0.05],
      [2.75, 0.27, 0.31, 0.50, 0.80, 0.04],
      [3.35, 0.07, 0.56, 0.64, 0.82, 0.03],
    ]);
    // The mooring bollard forward and the water rudder aft, which is how she
    // is handled alongside a submarine with no boat in the water.
    cyl(fl, P.gunDark, 0.045, 0.05, 0.14, 0, 0.90, 2.40, 8);
    const rud = box(fl, BOT, 0.045, 0.30, 0.34, 0, 0.46, -3.16);
    rud.rotation.x = 0.12;
    // The two pylons: faired, because they are in the airstream and because
    // the whole weight of her hangs on them when the derrick picks her up.
    for (let i = 0; i < 5; i++) {
      const u = i / 4;
      const yy = cl(0.4) - 0.52 - u * 0.44;
      const c = 1.40 - u * 0.24;
      box(p, TOP, 0.26 - u * 0.05, 0.14, c, 0, yy, 0.70 + u * 0.08);
    }
    for (const s of [-1, 1]) {
      strut(p, TOP, [0, 0.86, 1.90], [s * 0.36, cl(1.7) - 0.52, 1.66], 0.045);
      strut(p, TOP, [0, 0.86, -0.85], [s * 0.36, cl(-1.0) - 0.50, -0.95], 0.045);
    }
    // The lifting eye on her centre section: the derrick's hook goes here and
    // nowhere else, and it is the fitting that makes her a submarine's
    // aeroplane rather than a seaplane that happens to be small.
    cyl(p, M.bright, 0.07, 0.07, 0.16, 0, cl(0.4) + 0.62, 0.55, 8);
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.028, 6, 12), M.bright);
    eye.position.set(0, cl(0.4) + 0.78, 0.55);
    eye.rotation.y = Math.PI / 2;
    p.add(eye);
  }
  aerial(p, 0, cl(0.9) + 0.82, 0.90, 0.40, tail.finTop, TOP);
  return p;
}

// ----------------------------------------------------- the Japanese ones --

/**
 * An A6M5 Zero: the fighter.
 *
 * Everything about her is the same decision taken over and over -- take the
 * weight out. No armour, no self-sealing tanks, a wing built in one piece with
 * the fuselage centre section, and flush rivets everywhere. What you get is an
 * aeroplane that climbs and turns like nothing else and comes apart when
 * anybody hits her. The Model 52 has the shorter square-tipped wing, which is
 * the version that was still flying in 1944.
 */
function zero(g, x, y, z, ry, folded = false, opts = {}) {
  paint('ijn');
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  const cl = sitline(1.18, 0.13);
  // A very slim body: the Zero's fuselage is barely wider than the engine.
  airframe(p, M.planeTop, [
    { z: -4.30, w: 0.16, h: 0.46, y: cl(-4.30) + 0.30 },
    { z: -3.70, w: 0.34, h: 0.68, y: cl(-3.70) + 0.22 },
    { z: -2.90, w: 0.54, h: 0.90, y: cl(-2.90) + 0.14 },
    { z: -2.00, w: 0.72, h: 1.08, y: cl(-2.00) + 0.08 },
    { z: -1.00, w: 0.88, h: 1.24, y: cl(-1.00) + 0.03 },
    { z: 0.00, w: 0.96, h: 1.32, y: cl(0.00) },
    { z: 0.90, w: 0.98, h: 1.34, y: cl(0.90) },
    { z: 1.80, w: 0.94, h: 1.30, y: cl(1.80) + 0.01 },
    { z: 2.60, w: 0.86, h: 1.20, y: cl(2.60) + 0.03 },
    { z: 3.30, w: 0.76, h: 1.06, y: cl(3.30) + 0.05 },
  ], { flat: 0.08, e: 0.96, mBot: M.planeBottom });
  radial(p, 0.62, cl(3.6) + 0.06, 3.55, 3.0, 3, opts.spin);
  // The long greenhouse, which on a Zero runs most of the way to the fin.
  greenhouse(p, 0.80, 0.56, cl(0.4) + 0.66, -0.55, 1.45, 4);
  airframe(p, M.planeTop, [
    { z: -3.80, w: 0.26, h: 0.26, y: cl(-3.80) + 0.34 },
    { z: -2.40, w: 0.52, h: 0.42, y: cl(-2.40) + 0.42 },
    { z: -1.10, w: 0.68, h: 0.52, y: cl(-1.10) + 0.50 },
    { z: -0.55, w: 0.74, h: 0.55, y: cl(-0.55) + 0.53 },
  ], { flat: 0.3, e: 0.96, capF: false, mBot: M.planeTop });

  // Her wing. The Model 52's tips are square-cut rather than folding -- only
  // the outer half-metre came up, which is not enough to be worth drawing --
  // so she is built spread and the folded set is the same panel with the tips
  // turned up.
  const stowed = new THREE.Group();
  const spread = new THREE.Group();
  p.add(stowed);
  p.add(spread);
  for (const s of [-1, 1]) {
    for (const [holder, tipUp] of [[spread, false], [stowed, true]]) {
      const w = new THREE.Group();
      w.position.set(s * 0.48, cl(0.7) - 0.34, 0.55);
      w.rotation.z = -s * 0.055;
      holder.add(w);
      const sw = wing(w, M.planeTop, M.planeBottom, {
        side: s, x: 0, y: 0, z: 0, span: 5.5, rootC: 2.30, tipC: 1.20,
        sweep: 0.52, thick: 0.105, camber: 0.024, twist: -0.03, rootCap: false,
      });
      ctrlSurface(w, M.planeTop, sw, 0.63, 0.92);                    // aileron
      ctrlSurface(w, M.planeTop, sw, 0.14, 0.48, 0.70);              // flap
      // Her 20 mm cannon in the leading edge, and the 13 mm beside it.
      wingGun(w, sw, 2.1 / 5.5, 0.055, 0.34, 0.92);
      wingGun(w, sw, 2.9 / 5.5, 0.038, 0.19, 0.58);
      leBand(w, P.yellow, sw, 0.12, 0.48);
      hinomaru(w, s * 3.4, 0.10, -0.55, 0.52);
      hinomaru(w, s * 3.4, -0.10, -0.55, 0.52, 'down');
      if (tipUp) w.rotation.z = -s * 1.42;      // see below
      // The root fillet.
      rootFillet(w, M.planeTop, s * 0.14, 0.02, -0.60, 2.6, 0.44, 0.27);
    }
  }
  // Folded, the whole panel comes up on the root hinge and stands on edge
  // alongside her, which is what gets a fighter down a lift well: spread she
  // is eleven metres across and a hangar is not.
  stowed.visible = !!folded;
  spread.visible = !folded;
  p.userData.wings = { stowed, spread };

  hinomaru(p, 0.36, cl(-1.6) + 0.06, -1.6, 0.40, false);
  hinomaru(p, -0.36, cl(-1.6) + 0.06, -1.6, 0.40, false);
  const tail = empennage(p, 1.16, 1.02, 3.30, 0.80, cl(-3.5) + 0.30, -3.2);
  if (opts.gear !== false) {
    for (const s of [-1, 1]) mainGear(p, s, s * 1.30, 0.0, 0.96, 0.30, 0.06);
    tailGear(p, -3.95, 0.15, 0.9, 0.30);
  }
  aerial(p, 0, cl(0.2) + 0.80, 0.2, 0.52, tail.finTop);
  return p;
}

/**
 * A D4Y Suisei: the dive bomber.
 *
 * The one Japanese carrier aircraft with an inline engine, and it shows -- she
 * has the nose of a fighter and she was faster than most of them. Built round
 * an internal bomb bay, which nothing else in the Pacific had, with the dive
 * brakes under the wing rather than on the trailing edge.
 */
function suisei(g, x, y, z, ry, folded = false, opts = {}) {
  paint('ijn');
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  const cl = sitline(1.30, 0.11);
  airframe(p, M.planeTop, [
    { z: -4.90, w: 0.16, h: 0.44, y: cl(-4.90) + 0.30 },
    { z: -4.20, w: 0.32, h: 0.66, y: cl(-4.20) + 0.22 },
    { z: -3.30, w: 0.52, h: 0.88, y: cl(-3.30) + 0.14 },
    { z: -2.30, w: 0.70, h: 1.06, y: cl(-2.30) + 0.08 },
    { z: -1.20, w: 0.84, h: 1.20, y: cl(-1.20) + 0.03 },
    { z: -0.10, w: 0.92, h: 1.28, y: cl(-0.10) },
    { z: 1.00, w: 0.92, h: 1.28, y: cl(1.00) },
    { z: 2.00, w: 0.86, h: 1.18, y: cl(2.00) + 0.02 },
    { z: 2.85, w: 0.76, h: 1.02, y: cl(2.85) + 0.04 },
  ], { flat: 0.08, e: 0.96, mBot: M.planeBottom });
  inline(p, 0.58, cl(3.5) + 0.05, 3.30, 3.2, 3, opts.spin);
  // Two 7.7 mm in the cowl, firing through the airscrew: all the fixed
  // armament she has, and close in on the thrust line where a cowl gun is.
  for (const s of [-1, 1]) {
    arm(cyl(p, M.gunDark, 0.035, 0.035, 0.30, s * 0.22, cl(3.0) + 0.44, 3.10, 6), 0.16)
      .rotation.x = Math.PI / 2;
  }
  // Pilot and observer under one very long hood.
  greenhouse(p, 0.78, 0.54, cl(0.4) + 0.64, -1.30, 1.70, 5);
  airframe(p, M.planeTop, [
    { z: -4.30, w: 0.24, h: 0.24, y: cl(-4.30) + 0.32 },
    { z: -3.00, w: 0.48, h: 0.40, y: cl(-3.00) + 0.40 },
    { z: -1.80, w: 0.64, h: 0.50, y: cl(-1.80) + 0.48 },
    { z: -1.30, w: 0.70, h: 0.53, y: cl(-1.30) + 0.51 },
  ], { flat: 0.3, e: 0.96, capF: false, mBot: M.planeTop });
  // The bomb bay she was designed round. The Suisei is the one dive bomber of
  // the four that has one: everything else in the Pacific swung its bomb out
  // on a crutch to clear the airscrew, and she carried hers inside.
  const belly = underside(p, 0, 0.2, -4) ?? (cl(0.2) - 0.66);
  bombBay(p, { y: belly + 0.01, z: 0.2, len: 2.5, wide: 0.66, deep: 0.44 });
  const store = new THREE.Group();
  store.position.set(0, belly + 0.27, 0.2);
  p.add(store);
  bomb(store, 2.1, 0.21);
  animPart(p, 'store', store, { fall: true });

  const stowed = new THREE.Group();
  const spread = new THREE.Group();
  p.add(stowed);
  p.add(spread);
  for (const s of [-1, 1]) {
    for (const [holder, up] of [[spread, false], [stowed, true]]) {
      const w = new THREE.Group();
      w.position.set(s * 0.46, cl(0.5) - 0.30, 0.35);
      w.rotation.z = -s * 0.05;
      holder.add(w);
      const sw = wing(w, M.planeTop, M.planeBottom, {
        side: s, x: 0, y: 0, z: 0, span: 5.9, rootC: 2.40, tipC: 1.10,
        sweep: 0.60, thick: 0.100, camber: 0.022, twist: -0.03, rootCap: false,
      });
      ctrlSurface(w, M.planeTop, sw, 0.63, 0.92);                    // aileron
      ctrlSurface(w, M.planeTop, sw, 0.14, 0.47, 0.70);              // flap
      // The dive brakes: a slatted panel under the wing, which is the
      // aeroplane's whole trade and nothing else in the Pacific has one.
      // Stowed they lie in her own skin -- so they are a piece of it -- with
      // the slats and the arms that swing them showing under the panel.
      surfPatch(w, M.gunDark, sw, 0.20, 0.62, 0.42, 0.74, false, 0.008, 5, 3);
      for (let i = 0; i < 5; i++) {
        const f = 0.22 + (i / 4) * 0.38;
        const a = sw.at(f, 0.58, false);
        box(w, M.gunDark, 0.05, 0.06, 0.55, a[0], a[1] - 0.016, a[2]);
      }
      for (const f of [0.21, 0.61]) {
        const a = sw.at(f, 0.44, false);
        const b = sw.at(f, 0.72, false);
        strut(w, M.gunDark, [a[0], a[1] - 0.02, a[2]], [b[0], b[1] - 0.03, b[2]], 0.03);
      }
      leBand(w, P.yellow, sw, 0.12, 0.46);
      hinomaru(w, s * 3.6, 0.10, -0.60, 0.54);
      hinomaru(w, s * 3.6, -0.10, -0.60, 0.54, 'down');
      if (up) w.rotation.z = -s * 1.44;
      rootFillet(w, M.planeTop, s * 0.14, 0.02, -0.66, 2.7, 0.42, 0.25);
    }
  }
  stowed.visible = !!folded;
  spread.visible = !folded;
  p.userData.wings = { stowed, spread };

  hinomaru(p, 0.34, cl(-2.2) + 0.06, -2.2, 0.40, false);
  hinomaru(p, -0.34, cl(-2.2) + 0.06, -2.2, 0.40, false);
  const tail = empennage(p, 1.14, 1.00, 3.40, 0.82, cl(-4.1) + 0.28, -3.8);
  if (opts.gear !== false) {
    for (const s of [-1, 1]) mainGear(p, s, s * 1.35, -0.22, 1.00, 0.30, 0.05);
    tailGear(p, -4.55, 0.15, 0.95, 0.30);
  }
  // The rear gunner's 7.7 mm on its ring, which folds down into the decking.
  const mg = cyl(p, M.gunDark, 0.035, 0.035, 0.7, 0, cl(-1.5) + 0.72, -1.75, 6);
  mg.rotation.x = -0.5;
  aerial(p, 0, cl(0.0) + 0.81, 0.0, 0.46, tail.finTop);
  return p;
}

/**
 * A B6N Tenzan: the torpedo bomber.
 *
 * Bigger than an Avenger and built round the same job -- a long-range machine
 * carrying one eighteen-inch torpedo slung under her belly at an angle, which
 * is the detail that gives her away: the Tenzan's fish hangs nose-down and
 * offset to starboard, not in a bay. She has a forward-swept fin, which
 * nothing else does, because the tail had to fold for the lift.
 */
function tenzan(g, x, y, z, ry, folded = true, spin = false, opts = {}) {
  paint('ijn');
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  const cl = sitline(1.62, 0.12);
  airframe(p, M.planeTop, [
    { z: -5.30, w: 0.20, h: 0.56, y: cl(-5.30) + 0.36 },
    { z: -4.50, w: 0.42, h: 0.84, y: cl(-4.50) + 0.27 },
    { z: -3.50, w: 0.68, h: 1.12, y: cl(-3.50) + 0.18 },
    { z: -2.40, w: 0.92, h: 1.40, y: cl(-2.40) + 0.10 },
    { z: -1.20, w: 1.10, h: 1.62, y: cl(-1.20) + 0.04 },
    { z: 0.00, w: 1.20, h: 1.74, y: cl(0.00) },
    { z: 1.20, w: 1.20, h: 1.74, y: cl(1.20) },
    { z: 2.30, w: 1.12, h: 1.62, y: cl(2.30) + 0.02 },
    { z: 3.20, w: 1.00, h: 1.42, y: cl(3.20) + 0.05 },
  ], { flat: 0.10, e: 0.95, mBot: M.planeBottom });
  radial(p, 0.78, cl(3.6) + 0.08, 3.55, 3.4, 4, spin);
  // Three crew under one hood that runs nearly to the fin.
  greenhouse(p, 1.00, 0.66, cl(0.4) + 0.88, -1.90, 1.90, 6);
  airframe(p, M.planeTop, [
    { z: -4.70, w: 0.28, h: 0.30, y: cl(-4.70) + 0.40 },
    { z: -3.30, w: 0.60, h: 0.50, y: cl(-3.30) + 0.52 },
    { z: -2.30, w: 0.80, h: 0.62, y: cl(-2.30) + 0.62 },
    { z: -1.90, w: 0.88, h: 0.66, y: cl(-1.90) + 0.66 },
  ], { flat: 0.3, e: 0.96, capF: false, mBot: M.planeTop });

  const stowed = new THREE.Group();
  const spread = new THREE.Group();
  p.add(stowed);
  p.add(spread);
  for (const s of [-1, 1]) {
    foldWing(stowed, s, {
      at: [s * 0.70, cl(0.9) - 0.80, 1.1], skew: 0.12, lean: 0.06,
      span: 5.6, rootC: 2.70, tipC: 1.30, sweep: 0.70, thick: 0.112,
      star: 0.60, guns: [],
    });
    // The centre section: the piece of wing between the fuselage sides and
    // the root of the panel, level and untapered, the way the Avenger's is.
    // Without it both panels hung a hand's breadth off her sides.
    wing(p, M.planeTop, M.planeBottom, {
      side: s, x: 0, y: cl(0.9) - 0.34, z: 0.95, span: 0.80, rootC: 2.70,
      tipC: 2.70, sweep: 0, thick: 0.112, camber: 0.024, stations: 2,
      round: false, rootCap: false,
    });
    const w = new THREE.Group();
    w.position.set(s * 0.74, cl(0.9) - 0.34, 0.95);
    w.rotation.z = -s * 0.06;
    spread.add(w);
    const sw = wing(w, M.planeTop, M.planeBottom, {
      side: s, x: 0, y: 0, z: 0, span: 6.7, rootC: 2.70, tipC: 1.30,
      sweep: 0.70, thick: 0.112, camber: 0.024, twist: -0.03, rootCap: false,
    });
    ctrlSurface(w, M.planeTop, sw, 0.63, 0.91);                      // aileron
    ctrlSurface(w, M.planeTop, sw, 0.13, 0.46, 0.70);                // flap
    leBand(w, P.yellow, sw, 0.11, 0.44);
    hinomaru(w, s * 4.0, 0.12, -0.70, 0.62);
    hinomaru(w, s * 4.0, -0.12, -0.70, 0.62, 'down');
    rootFillet(w, M.planeTop, s * 0.16, 0.02, -0.76, 3.0, 0.50, 0.29);
  }
  stowed.visible = !!folded;
  spread.visible = !folded;
  p.userData.wings = { stowed, spread };

  // The torpedo, slung nose-down under her belly and offset to starboard,
  // which is the way a Tenzan carried one.
  if (opts.fish !== false) {
    // The crutch and its sway braces, on the belly where the fish hangs: a
    // torpedo carried outside is carried on something, and hers used to hang
    // in the air under her with nothing joining the two.
    const belly = underside(p, -0.30, 0.30, -4) ?? (cl(0.3) - 0.86);
    for (const zz of [-0.85, 0.85]) {
      box(p, M.gunDark, 0.34, 0.22, 0.16, -0.30, belly - 0.08, 0.30 + zz);
      for (const sx of [-1, 1]) {
        strut(p, M.gunDark, [-0.30 + sx * 0.02, belly - 0.02, 0.30 + zz],
          [-0.30 + sx * 0.30, belly - 0.20, 0.30 + zz], 0.03);
      }
    }
    const fish = new THREE.Group();
    fish.position.set(-0.30, belly - 0.33, 0.30);
    fish.rotation.x = 0.13;
    p.add(fish);
    torpedo(fish, 5.1, 0.23);
    animPart(p, 'store', fish, { fall: true });
  }

  hinomaru(p, 0.42, cl(-2.7) + 0.06, -2.7, 0.44, false);
  hinomaru(p, -0.42, cl(-2.7) + 0.06, -2.7, 0.44, false);
  // The forward-swept fin, which is the Tenzan's other signature: it is that
  // shape so the tail could fold clear for the lift.
  const tail = empennage(p, 1.42, 1.20, 3.90, 0.98, cl(-4.5) + 0.34, -4.2);
  if (opts.gear !== false) {
    for (const s of [-1, 1]) mainGear(p, s, s * 1.55, 0.31, 1.30, 0.36, 0.05);
    tailGear(p, -5.00, 0.18, 1.1, 0.34);
  }
  // The rear gunner's 7.92 mm, and the tunnel gun under the sternpost.
  const mg = cyl(p, M.gunDark, 0.04, 0.04, 0.8, 0, cl(-2.1) + 0.94, -2.4, 6);
  mg.rotation.x = -0.45;
  cyl(p, M.gunDark, 0.035, 0.035, 0.6, 0, cl(-3.4) - 0.18, -3.6, 6)
    .rotation.x = 0.4;
  aerial(p, 0, cl(0.2) + 1.03, 0.2, 0.58, tail.finTop);
  return p;
}

/**
 * An E13A Jake: the battleship's and the cruiser's scout.
 *
 * A big three-seat float plane on two floats, shot off a catapult and picked
 * out of the water again by crane. She is the Japanese equivalent of the
 * Kingfisher and the Arado and a good deal larger than either -- fifteen hours
 * of endurance, which is what an ocean-going scout actually needs.
 */
function jake(g, x, y, z, ry, folded = false, opts = {}) {
  paint('ijn');
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  const cl = (() => { const f = 2.30; return () => f; })();
  airframe(p, M.planeTop, [
    { z: -5.10, w: 0.16, h: 0.46, y: cl() + 0.26 },
    { z: -4.40, w: 0.34, h: 0.70, y: cl() + 0.18 },
    { z: -3.40, w: 0.56, h: 0.94, y: cl() + 0.10 },
    { z: -2.20, w: 0.76, h: 1.14, y: cl() + 0.04 },
    { z: -0.90, w: 0.90, h: 1.28, y: cl() },
    { z: 0.40, w: 0.96, h: 1.34, y: cl() },
    { z: 1.70, w: 0.92, h: 1.28, y: cl() + 0.02 },
    { z: 2.70, w: 0.82, h: 1.12, y: cl() + 0.05 },
  ], { flat: 0.08, e: 0.95, mBot: M.planeBottom });
  radial(p, 0.66, cl() + 0.06, 3.20, 3.0, 3, opts.spin);
  // A very long greenhouse: pilot, observer and wireless operator.
  greenhouse(p, 0.82, 0.58, cl() + 0.70, -2.20, 1.60, 6);
  airframe(p, M.planeTop, [
    { z: -4.50, w: 0.24, h: 0.26, y: cl() + 0.30 },
    { z: -3.20, w: 0.50, h: 0.44, y: cl() + 0.40 },
    { z: -2.40, w: 0.66, h: 0.54, y: cl() + 0.50 },
    { z: -2.20, w: 0.72, h: 0.56, y: cl() + 0.53 },
  ], { flat: 0.3, e: 0.96, capF: false, mBot: M.planeTop });

  // Her wing: a low monoplane, and the panels fold straight back along her
  // sides for the hangar.
  const stowed = new THREE.Group();
  const spread = new THREE.Group();
  p.add(stowed);
  p.add(spread);
  for (const s of [-1, 1]) {
    foldWing(stowed, s, {
      at: [s * 0.56, cl() - 0.52, 0.5], skew: 0.06, lean: 0.04,
      span: 6.0, rootC: 2.30, tipC: 1.20, sweep: 0.30, thick: 0.108,
      star: 0.56, guns: [],
    });
    wing(p, M.planeTop, M.planeBottom, {
      side: s, x: 0, y: cl() - 0.52, z: 0.45, span: 0.64, rootC: 2.30,
      tipC: 2.30, sweep: 0, thick: 0.108, camber: 0.022, stations: 2,
      round: false, rootCap: false,
    });
    const w = new THREE.Group();
    w.position.set(s * 0.58, cl() - 0.52, 0.45);
    w.rotation.z = -s * 0.04;
    spread.add(w);
    const sw = wing(w, M.planeTop, M.planeBottom, {
      side: s, x: 0, y: 0, z: 0, span: 7.0, rootC: 2.30, tipC: 1.20,
      sweep: 0.30, thick: 0.108, camber: 0.022, twist: -0.02, rootCap: false,
    });
    ctrlSurface(w, M.planeTop, sw, 0.63, 0.92);                      // aileron
    ctrlSurface(w, M.planeTop, sw, 0.13, 0.47, 0.70);                // flap
    hinomaru(w, s * 4.2, 0.10, -0.56, 0.58);
    hinomaru(w, s * 4.2, -0.10, -0.56, 0.58, 'down');
  }
  stowed.visible = !!folded;
  spread.visible = !folded;
  p.userData.wings = { stowed, spread };

  // Two floats on their struts, which is what she stands on.
  //
  // Each is its own group standing where the float stands, and the stations
  // are the float's own section aft to forward -- keel, chine, deck edge and
  // the crown of the turtle deck -- with the step at about her middle, which
  // is the one thing that makes a float a float rather than a canoe.
  for (const s of [-1, 1]) {
    const fl = new THREE.Group();
    fl.position.set(s * 1.72, 0, 0.30);
    p.add(fl);
    seaFloat(fl, M.planeTop, M.planeBottom, [
      [-3.60, 0.13, 0.62, 0.72, 0.92, 0.03],
      [-2.90, 0.33, 0.44, 0.58, 0.90, 0.04],
      [-1.40, 0.49, 0.20, 0.42, 0.88, 0.05],
      [0.20, 0.51, 0.10, 0.36, 0.88, 0.05],
      [1.00, 0.49, 0.42, 0.52, 0.90, 0.05],
      [2.30, 0.39, 0.52, 0.62, 0.94, 0.04],
      [3.30, 0.11, 0.70, 0.78, 1.00, 0.03],
    ]);
    // The mooring bollard on her deck, and the water rudder on her sternpost:
    // a float plane has to be steered on the water as well as in the air.
    cyl(fl, P.gunDark, 0.05, 0.06, 0.14, 0, 0.98, 2.40, 8);
    const rud = box(fl, M.planeBottom, 0.05, 0.30, 0.34, 0, 0.48, -3.05);
    rud.rotation.x = 0.12;
    // Four struts a float: two to the body and two out to the wing. Each of
    // them finds its own two ends -- the deck of the float below and the skin
    // of the aeroplane above -- rather than being drawn between two guessed
    // heights, which left every one of them touching nothing at either end.
    for (const [fz, tx, ty, tz, r] of [
      [1.90, 0.40, -0.34, 1.20, 0.065], [-0.50, 0.40, -0.34, -0.40, 0.065],
      [1.90, 1.60, -0.30, 1.00, 0.055], [-0.50, 1.60, -0.30, -0.30, 0.055],
    ]) {
      // The foot on the deck of the float itself, found by looking down on it,
      // and the head on the skin of the aeroplane. Typed-in heights left every
      // strut short at both ends and the whole undercarriage joined to nothing.
      const deck = hitPoint(p, [s * 1.72, 3.2, fz], [0, -1, 0], fl)
        || [s * 1.72, 1.0, fz];
      deck[1] -= 0.05;
      strut(p, M.planeTop, deck, [s * tx, cl() + ty, tz], r);
    }
  }

  hinomaru(p, 0.36, cl() - 0.10, -2.9, 0.42, false);
  hinomaru(p, -0.36, cl() - 0.10, -2.9, 0.42, false);
  const tail = empennage(p, 1.24, 1.06, 3.50, 0.86, cl() + 0.30, -4.0);
  const mg = cyl(p, M.gunDark, 0.035, 0.035, 0.7, 0, cl() + 0.80, -2.6, 6);
  mg.rotation.x = -0.45;
  aerial(p, 0, cl() + 0.81, 0.3, 0.5, tail.finTop);
  return p;
}

// ------------------------------------------------------ the heavy squadrons --
//
// The bombers: the aircraft nobody flies off a deck.
//
// They are ten times the aeroplane a Wildcat is and they are built out of the
// same toolkit, because the parts are the same parts -- a lofted monocoque, a
// wing with a real section on it, a nacelle round an engine, a turret that is
// a glazed dome on a ring. What is different is that there are four engines
// instead of one, that the bomb bay is most of the length of her, and that
// what identifies a heavy at any range is the planform and the tail: two fins
// on booms off the tailplane tips is an Avro and nothing else, and one fin the
// size of a barn door is a Boeing.
//
// Their real dimensions, since these are the ones the datasheets quote:
//
//   Avro Lancaster B.I   21.18 m long   31.09 m span   4 × Merlin XX
//   B-17G Fortress       22.66 m long   31.62 m span   4 × Cyclone radials
//   He 111 H-6           16.40 m long   22.60 m span   2 × Jumo 211F
//   Ju 88 A-4            14.36 m long   20.08 m span   2 × Jumo 211J
//   G4M1 Betty           20.00 m long   24.89 m span   2 × Kasei radials
//
// As with every other machine in this file the origin is on the ground under
// her, the nose points along +z, and every piece is measured off her own skin
// rather than placed at a guessed height.

/**
 * A fuselage, generated rather than typed station by station.
 *
 * A bomber's body is a long parallel middle with a cone at each end, and
 * writing fifteen stations by hand for five of them would be fifteen chances
 * to put a kink in one. So the shape is described instead: where the parallel
 * body starts and stops, how far the section is closed down at the sternpost
 * and at the nose, and how sharply each cone runs in. The loft comes out of
 * that, and a body built this way cannot have a step in it.
 */
function bodyLoft(o) {
  const N = o.n || 16;
  const st = [];
  for (let i = 0; i <= N; i++) {
    const f = i / N;                        // 0 at the sternpost, 1 at the nose
    const z = o.z0 + (o.z1 - o.z0) * f;
    let kw;
    let kh;
    let y = o.y;
    if (f < o.full0) {
      // The tail cone. Eased, so it leaves the parallel body tangentially
      // rather than at a corner.
      const t = f / o.full0;
      const e = 1 - (1 - t) ** (o.tailP || 1.9);
      kw = o.tailW + (1 - o.tailW) * e;
      kh = o.tailH + (1 - o.tailH) * e;
      // A tail cone rises as it closes: the underside sweeps up to the
      // sternpost and the spine stays where it is.
      y += (1 - e) * (o.tailUp || 0);
    } else if (f <= o.full1) {
      kw = 1;
      kh = 1;
    } else {
      const t = (f - o.full1) / (1 - o.full1);
      const e = t ** (o.noseP || 1.9);
      kw = 1 - (1 - o.noseW) * e;
      kh = 1 - (1 - o.noseH) * e;
      y += e * (o.noseDrop || 0);
    }
    st.push({ z, w: o.w * kw, h: o.h * kh, y });
  }
  return st;
}

/** The RAF roundel: blue, white and red, laid on the skin like any other. */
function roundel(p, x, y, z, r, up = true, fit = null) {
  return decal(p, x, y, z, faceDir(up, x),
    [[r, P.rafBlue], [r * 0.60, P.star], [r * 0.28, P.rafRed]], fit);
}

/**
 * A powered turret: the ring it turns on, the glazed dome over it, the frames
 * that hold the glass, and the guns out of the front of it.
 *
 * Built as a mounting rather than as a shape. The cupola, the frames and the
 * guns all hang off a ring that turns in azimuth, and the guns hang off a
 * cradle inside that which moves in elevation -- which is what a turret is,
 * and what lets one be laid instead of merely drawn.
 *
 * Every one of them has its own arcs, and they are not decoration: a mid-upper
 * could swing all the way round but not depress below her own fuselage, a
 * nose turret had ninety-five degrees either side and no more, and a Cheyenne
 * tail turret had a cone so tight that the gunner traversed the whole
 * aeroplane to bring it to bear. `arc` is the half-angle either side of the
 * way the mounting faces, `up` and `down` the elevation limits, all in
 * radians. See `layTurret`.
 */
function turretDome(p, o) {
  const { x = 0, y, z, r, guns = 2, cal = 0.05 } = o;
  const len = o.len || r * 2.6;
  const spread = o.spread === undefined ? r * 0.48 : o.spread;
  const open = !!o.open;
  // The ring the turret stands on. This piece does not turn: it is let into
  // her skin, and without it the cupola is a bubble resting on her back.
  lathe(p, M.planeTop, [
    [r * 1.10, -0.10], [r * 1.14, -0.02], [r * 1.10, 0.06],
  ], x, y, z, 18);

  // Everything above the ring turns with the gunner. A rear turret is the same
  // mounting facing the other way, so it is turned round here once rather than
  // having every piece in it carry a sign.
  const ring = new THREE.Group();
  ring.position.set(x, y, z);
  ring.rotation.y = o.back ? Math.PI : 0;
  p.add(ring);

  if (!open) {
    // The dark of the inside of it, then the glass over that. Same shell
    // twice, the way the greenhouses are done, so the gunner's turret is not
    // a bubble with daylight through it.
    const shell = (k) => [
      [r * 0.99 * k, 0.02], [r * 1.00 * k, r * 0.34], [r * 0.93 * k, r * 0.70],
      [r * 0.79 * k, r * 1.00], [r * 0.57 * k, r * 1.22], [r * 0.30 * k, r * 1.34],
      [0, r * 1.38],
    ];
    lathe(ring, M.cave, shell(0.86), 0, 0, 0, 16);
    lathe(ring, P.glazing, shell(1), 0, 0, 0, 18);
    // Four frames over the dome, the way a Frazer-Nash was framed, built as
    // hoops that follow it rather than as cubes laid on it.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const f = box(ring, M.planeTop, 0.045, r * 2.5, 0.045,
        Math.sin(a) * r * 0.62, r * 0.66, Math.cos(a) * r * 0.62);
      f.rotation.x = Math.cos(a) * 0.40;
      f.rotation.z = -Math.sin(a) * 0.40;
    }
    // The hoop round its waist and the cap on top.
    lathe(ring, M.planeTop, [[r * 0.95, r * 0.66], [r * 0.98, r * 0.72], [r * 0.95, r * 0.78]],
      0, 0, 0, 18);
    lathe(ring, M.planeTop, [[r * 0.30, r * 1.33], [r * 0.24, r * 1.40], [0, r * 1.42]],
      0, 0, 0, 14);
  } else {
    // An open mounting: a hand-held gun on a ring behind a windscreen, which
    // is what the Germans put in a cupola and what the beam hatches carried.
    // No cupola over it, so the gunner and his gun are the whole of it.
    lathe(ring, M.planeTop, [
      [r * 0.92, r * 0.10], [r * 0.96, r * 0.42], [r * 0.90, r * 0.70],
    ], 0, 0, 0, 16);
    const scr = box(ring, P.glazing, r * 1.5, r * 0.9, 0.04, 0, r * 0.95, r * 0.55);
    scr.rotation.x = -0.5;
  }

  // The cradle: the guns and the mask they come through, moving in elevation
  // inside the turret that moves in azimuth.
  const cradle = new THREE.Group();
  cradle.position.set(0, r * 0.62, 0);
  ring.add(cradle);
  for (let i = 0; i < guns; i++) {
    const gx = (i - (guns - 1) / 2) * spread;
    cyl(cradle, M.gunDark, cal, cal, len, gx, 0, r * 0.5 + len * 0.42, 6)
      .rotation.x = Math.PI / 2;
    // The jacket over the breech, and the flash eliminator on the muzzle.
    cyl(cradle, M.planeTop, cal * 2.4, cal * 2.4, r * 0.5, gx, 0, r * 0.55, 8)
      .rotation.x = Math.PI / 2;
    cyl(cradle, M.gunDark, cal * 1.5, cal * 1.5, cal * 3, gx, 0,
      r * 0.5 + len * 0.86, 6).rotation.x = Math.PI / 2;
  }
  // The mask the guns come through, which is the piece that says a turret has
  // a slot in it rather than a hole.
  box(cradle, M.cave, spread * Math.max(1, guns - 1) + cal * 8, r * 0.52, r * 0.3,
    0, 0, r * 0.86);
  // The ammunition boxes either side of the gunner, and the belts off them.
  if (!open) {
    for (const sd of [-1, 1]) {
      box(ring, M.gunDark, r * 0.3, r * 0.5, r * 0.44, sd * r * 0.62, r * 0.4, -r * 0.3);
    }
  }

  const t = {
    name: o.name || 'turret',
    ring,
    cradle,
    home: ring.rotation.y,
    // Written down in radians because that is what a rotation is in; the
    // degrees they were quoted in are in the catalogue, for the datasheet.
    arc: ((o.arc === undefined ? 180 : o.arc) * Math.PI) / 180,
    up: ((o.up === undefined ? 60 : o.up) * Math.PI) / 180,
    down: ((o.down === undefined ? 30 : o.down) * Math.PI) / 180,
    at: [x, y + r * 0.62, z],
    r,
    guns,
  };
  (p.userData.turrets = p.userData.turrets || []).push(t);
  return t;
}

/**
 * A ball turret: a sphere hung under the belly with two guns out of the
 * bottom of it, which is the one thing that names a Fortress from below.
 *
 * The gunner is inside the ball and the ball is the mounting: it swings all
 * the way round in azimuth and from the horizon down to straight beneath her,
 * and it cannot look up at all -- there is aeroplane in the way.
 */
function ballTurret(p, o) {
  const { x = 0, y, z, r } = o;
  lathe(p, M.planeBottom, [[r * 1.08, 0.12], [r * 1.12, 0.02], [r * 1.06, -0.06]],
    x, y, z, 16);
  const ring = new THREE.Group();
  ring.position.set(x, y, z);
  p.add(ring);
  // The whole ball rolls: the gunner goes round with his guns, which is why a
  // ball turret gunner could not wear a parachute.
  const cradle = new THREE.Group();
  cradle.position.set(0, -r * 0.82, 0);
  ring.add(cradle);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), M.planeBottom);
  cradle.add(ball);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.52, 12, 10), P.glazing);
  eye.position.set(0, -r * 0.28, r * 0.62);
  cradle.add(eye);
  // The armoured band round her middle, and the two fifties out of the bottom.
  lathe(cradle, M.gunDark, [[r * 1.01, -r * 0.1], [r * 1.03, 0], [r * 1.01, r * 0.1]],
    0, 0, 0, 16);
  for (const sd of [-1, 1]) {
    cyl(cradle, M.gunDark, 0.045, 0.045, r * 3.4, sd * r * 0.36, -r * 0.48, r * 0.68, 6)
      .rotation.x = Math.PI / 2;
    cyl(cradle, M.planeBottom, 0.09, 0.09, r * 0.6, sd * r * 0.36, -r * 0.48, r * 0.1, 8)
      .rotation.x = Math.PI / 2;
  }
  const t = {
    name: o.name || 'ball',
    ring,
    cradle,
    home: 0,
    arc: Math.PI,
    up: ((o.up === undefined ? 0 : o.up) * Math.PI) / 180,
    down: ((o.down === undefined ? 90 : o.down) * Math.PI) / 180,
    at: [x, y - r * 0.82, z],
    r,
    guns: 2,
  };
  (p.userData.turrets = p.userData.turrets || []).push(t);
  return t;
}

/** An angle brought into the half-turn either side of nought. */
function wrapPi(a) {
  let v = a;
  while (v > Math.PI) v -= Math.PI * 2;
  while (v < -Math.PI) v += Math.PI * 2;
  return v;
}

/**
 * Lay a turret on a bearing and an elevation, inside its own arcs.
 *
 * `az` is measured from her nose and positive to starboard, `el` up from the
 * horizontal, both in radians and both in the aeroplane's frame. What comes
 * back is how far short of the ask the mounting had to stop -- nought when it
 * bore, and how many radians out when the target was behind the tail, or
 * under the belly, or anywhere else that turret could not reach. Nothing
 * trains through its own fin.
 */
function layTurret(t, az, el) {
  const want = wrapPi(az - t.home);
  const got = Math.max(-t.arc, Math.min(t.arc, want));
  t.ring.rotation.y = t.home + got;
  const wantEl = Math.max(-t.down, Math.min(t.up, el));
  t.cradle.rotation.x = wantEl;
  return Math.abs(want - got) + Math.abs(el - wantEl);
}

/**
 * An engine on a wing: the nacelle fairing, the engine in the front of it and
 * the airscrew on the end of that.
 *
 * Built into a group of its own so the cowl the toolkit draws -- which is
 * drawn about x = 0, because a fighter has one engine and it is on her
 * centreline -- can be put out on a wing four times over. The fairing aft
 * picks up the cowl's own after lip so there is no step between the two, and
 * runs back past the trailing edge the way a Lancaster's nacelles do.
 */
function nacelle(nac, o) {
  const r = o.r;
  const kind = o.kind || 'radial';
  const back = o.back || r * 5.2;
  // The cowl, and where its after lip is: a NACA cowl closes on r * 2.02 and a
  // faired inline one on r * 1.55 by r * 1.70, and the fairing starts there.
  let lipW;
  let lipH;
  let lipZ;
  if (kind === 'radial') {
    radial(nac, r, 0, 0, o.prop, o.blades || 3, false);
    lipW = r * 2.02; lipH = r * 2.02; lipZ = -1.16;
  } else {
    inline(nac, r, 0, 0, o.prop, o.blades || 3, false);
    lipW = r * 1.55; lipH = r * 1.70; lipZ = -1.95;
  }
  // The fairing aft of the engine, closing to a fine tail behind the wing.
  airframe(nac, M.planeTop, [
    { z: lipZ - back, w: lipW * 0.24, h: lipH * 0.30, y: o.tailUp || 0 },
    { z: lipZ - back * 0.72, w: lipW * 0.62, h: lipH * 0.66, y: (o.tailUp || 0) * 0.5 },
    { z: lipZ - back * 0.40, w: lipW * 0.92, h: lipH * 0.94, y: 0 },
    { z: lipZ - back * 0.14, w: lipW * 1.00, h: lipH * 1.00, y: 0 },
    { z: lipZ + 0.02, w: lipW, h: lipH, y: 0 },
  ], { seg: 18, e: 0.95, capF: false, mBot: M.planeBottom });
  // The exhaust down the flank of it, and the intake on top.
  for (const sd of [-1, 1]) {
    cyl(nac, M.gunDark, r * 0.14, r * 0.14, r * 1.1,
      sd * lipW * 0.46, lipH * 0.10, lipZ - back * 0.16, 6).rotation.x = Math.PI / 2;
  }
  if (kind === 'inline') {
    box(nac, M.gunDark, r * 0.44, r * 0.26, r * 0.8, 0, lipH * 0.56, lipZ - back * 0.10);
  }
  return nac.userData.prop || null;
}

/**
 * A man, and the one thing he is doing.
 *
 * Seven of these are the difference between a fuselage with furniture in it
 * and an aeroplane with a crew aboard. They are built at the scale a man is:
 * about 1.75 m standing, 1.30 m from the seat pan to the top of the helmet
 * sitting down. `ry` turns him, `pose` is what he is at.
 */
function crewman(p, o) {
  const g = new THREE.Group();
  g.position.set(o.x, o.y, o.z);
  g.rotation.y = o.ry || 0;
  p.add(g);
  const pose = o.pose || 'seated';
  const S = o.scale || 1;
  const suit = P.suit;
  // Torso, and the Mae West over it. A box with the corners eased off rather
  // than a box: at this size an unrounded chest reads as a crate in a chair.
  const torso = (lean) => {
    const t = new THREE.Group();
    t.rotation.x = lean;
    g.add(t);
    airframe(t, suit, [
      { z: -0.16 * S, w: 0.44 * S, h: 0.30 * S, y: 0 },
      { z: 0.10 * S, w: 0.48 * S, h: 0.34 * S, y: 0.02 * S },
      { z: 0.34 * S, w: 0.46 * S, h: 0.32 * S, y: 0.02 * S },
      { z: 0.52 * S, w: 0.36 * S, h: 0.26 * S, y: 0 },
    ], { seg: 10, e: 0.86, mBot: suit });
    // The life jacket, over his chest and round his neck.
    airframe(t, P.maewest, [
      { z: 0.26 * S, w: 0.40 * S, h: 0.30 * S, y: 0.02 * S },
      { z: 0.44 * S, w: 0.38 * S, h: 0.28 * S, y: 0.02 * S },
      { z: 0.52 * S, w: 0.30 * S, h: 0.22 * S, y: 0 },
    ], { seg: 10, e: 0.86, capF: false, capA: false, mBot: P.maewest });
    return t;
  };
  const head = (t, at) => {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.115 * S, 10, 8), P.helmet);
    h.position.set(0, at[0], at[1]);
    h.scale.set(1, 1.1, 1.18);
    t.add(h);
    // The oxygen mask, which is what you actually see of a bomber crew's face.
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.062 * S, 8, 6), P.panelBlack);
    m.position.set(0, at[0] - 0.03 * S, at[1] + 0.09 * S);
    t.add(m);
    return h;
  };
  const limb = (t, x, y, z, len, rx, r = 0.055) => {
    const a = cyl(t, suit, r * S, r * 0.92 * S, len * S, x * S, y * S, z * S, 7);
    a.rotation.x = rx;
    return a;
  };
  if (pose === 'prone') {
    // The bomb aimer, flat on his front over the sight with his head up.
    const t = torso(Math.PI / 2);
    t.position.y = 0.16 * S;
    head(t, [0.10 * S, 0.60 * S]);
    for (const sd of [-1, 1]) {
      limb(t, sd * 0.22, -0.02 * S, -0.34 * S, 0.5, 0.1, 0.06);   // legs aft
      limb(t, sd * 0.24, -0.06 * S, 0.38 * S, 0.42, 0.5, 0.05);   // arms forward
    }
  } else if (pose === 'standing') {
    const t = torso(0);
    t.position.y = 0.92 * S;
    t.rotation.x = -Math.PI / 2;
    head(t, [0.02 * S, 0.60 * S]);
    for (const sd of [-1, 1]) {
      const l = cyl(g, suit, 0.075 * S, 0.065 * S, 0.88 * S, sd * 0.11 * S, 0.46 * S, 0, 7);
      l.rotation.x = 0;
      limb(t, sd * 0.27, 0, 0.18 * S, 0.5, 0.2, 0.055);
    }
  } else {
    // Seated: hips at the origin, thighs forward, back against the seat.
    const t = torso(-Math.PI / 2 + (o.lean || 0.12));
    t.position.y = 0.06 * S;
    head(t, [0.02 * S, 0.62 * S]);
    for (const sd of [-1, 1]) {
      const th = cyl(g, suit, 0.085 * S, 0.075 * S, 0.44 * S,
        sd * 0.12 * S, 0.02 * S, 0.22 * S, 7);
      th.rotation.x = Math.PI / 2;
      const sh = cyl(g, suit, 0.068 * S, 0.06 * S, 0.44 * S,
        sd * 0.12 * S, -0.20 * S, 0.40 * S, 7);
      sh.rotation.x = 0.12;
      // Boots on the floor.
      box(g, P.helmet, 0.11 * S, 0.09 * S, 0.24 * S,
        sd * 0.12 * S, -0.40 * S, 0.46 * S);
      // Arms forward to whatever he is holding.
      limb(t, sd * 0.26, 0.02 * S, 0.30 * S, 0.46, 0.55, 0.055);
    }
  }
  return g;
}

/** A seat: pan, back, side frames and the straps over it. */
function crewSeat(p, o) {
  const g = new THREE.Group();
  g.position.set(o.x, o.y, o.z);
  g.rotation.y = o.ry || 0;
  p.add(g);
  const w = o.w || 0.46;
  const back = o.back === undefined ? 0.56 : o.back;
  box(g, P.seat, w, 0.07, 0.46, 0, 0, 0.08);
  if (back > 0) {
    const b = box(g, P.seat, w, back, 0.07, 0, back * 0.46, -0.18);
    b.rotation.x = 0.13;
    // The armour behind a pilot's back, which is the only armour aboard.
    if (o.armour) box(g, P.frame, w * 0.96, back * 0.9, 0.035, 0, back * 0.46, -0.25);
  }
  // The frame it stands on, down to the floor.
  for (const sd of [-1, 1]) {
    box(g, P.frame, 0.045, o.legs || 0.34, 0.045, sd * (w / 2 - 0.04), -(o.legs || 0.34) / 2, 0.20);
    box(g, P.frame, 0.045, o.legs || 0.34, 0.045, sd * (w / 2 - 0.04), -(o.legs || 0.34) / 2, -0.10);
  }
  box(g, P.frame, w, 0.04, 0.42, 0, -(o.legs || 0.34), 0.06);
  // Sutton harness: two straps over the back of it.
  if (back > 0) {
    for (const sd of [-1, 1]) {
      const st = box(g, P.webbing, 0.07, back * 0.8, 0.02, sd * 0.13, back * 0.48, -0.13);
      st.rotation.x = 0.13;
    }
  }
  return g;
}

/**
 * The inside of a heavy bomber.
 *
 * Everything a crew touched, from the bomb aimer's window to the tail turret
 * door: the frames and stringers her skin is stretched over, the floor they
 * walked on, the two spars they climbed over, the flight deck, the four crew
 * stations, the bay with its carriers, the ammunition tracks running aft, and
 * seven men at their places.
 *
 * It is all built inside the skin, so nothing of it shows unless the skin is
 * taken off her -- see the cutaway on the bomber yard. Which is the point:
 * this is what a cutaway drawing of one of these is a drawing of.
 */
/** The section of a lofted body at a station, interpolated between stations. */
function sectionAt(loft, z) {
  let a = loft[0];
  let b = loft[loft.length - 1];
  for (let i = 0; i < loft.length - 1; i++) {
    if (loft[i].z <= z && loft[i + 1].z >= z) { a = loft[i]; b = loft[i + 1]; }
  }
  const t = b.z === a.z ? 0 : (z - a.z) / (b.z - a.z);
  return {
    w: a.w + (b.w - a.w) * t,
    h: a.h + (b.h - a.h) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function bomberInside(p, s, CL, belly) {
  // What was already there is her outside; whatever this function adds is her
  // inside. Marking them here is what lets the yard take her skin off without
  // anything having to keep a list of pieces in step by hand.
  const already = new Set();
  p.traverse((o) => { if (o.isMesh) already.add(o); });
  // Her structure and her crew stations go into a group of their own. Three
  // hundred pieces of frame, floor and furniture behind an opaque skin is
  // three hundred draw calls a second nobody can see, so the group is left out
  // of the frame until the cutaway asks for it. What a captain can see through
  // her glass and her open doors -- the gunners in their turrets, the carriers
  // and the stick on them -- stays on the aeroplane and is always drawn.
  const IN = new THREE.Group();
  IN.visible = false;
  p.add(IN);
  p.userData.insideGroup = IN;
  const B = s.body;
  const I = s.inside || {};
  const FL = CL + (I.floor === undefined ? -B.h * 0.30 : I.floor);
  const CROWN = CL + B.h * 0.5;
  const z0 = I.z0 === undefined ? B.z0 * 0.86 : I.z0;
  const z1 = I.z1 === undefined ? B.z1 * 0.90 : I.z1;
  const loft = bodyLoft({ ...B, y: CL });

  // ---- frames and stringers ----------------------------------------------
  // Her skin is a stressed sheet over rings and stringers, and from inside
  // that is all there is to see of the structure. The rings are the same loft
  // the skin is, a shade under it, so they follow her rather than being a
  // stack of hoops of one size in a body that tapers.
  const pitch = I.ribs || 1.15;
  for (let z = z0; z <= z1; z += pitch) {
    // The section here, read off the loft rather than guessed.
    const sec = sectionAt(loft, z);
    const w = sec.w * 0.965;
    const h = sec.h * 0.965;
    const y = sec.y;
    if (w < 0.4) continue;
    airframe(IN, P.frame, [
      { z: z - 0.035, w, h, y },
      { z: z + 0.035, w, h, y },
    ], { seg: 18, e: 0.94, flat: s.flat || 0.03, capA: false, capF: false, mBot: P.frame });
  }
  // The longerons, over the parallel middle of her where they are straight.
  const pw = B.w * 0.965;
  const ph = B.h * 0.965;
  const fz0 = B.z0 + (B.z1 - B.z0) * B.full0;
  const fz1 = B.z0 + (B.z1 - B.z0) * B.full1;
  for (const [ax, ay] of [[0.80, 0.52], [0.96, 0.02], [0.80, -0.50], [0.36, -0.86]]) {
    for (const sd of [-1, 1]) {
      if (ax === 0 && sd > 0) continue;
      box(IN, P.frame, 0.05, 0.05, fz1 - fz0,
        sd * (pw / 2) * ax, CL + (ph / 2) * ay, (fz0 + fz1) / 2);
    }
  }

  // ---- the floor, the catwalk and the spars ------------------------------
  const bay = s.bay;
  const fw = B.w * 0.62;
  const bayF = bay.z + bay.len / 2;
  const bayA = bay.z - bay.len / 2;
  // Where the floor actually is at a station: the height it would like to be,
  // or the skin under her if the body has closed up above that. A plank laid
  // at one height from the nose to the tail comes out through her underside at
  // both ends, which is where the bomb aimer ended up as well.
  const floorAt = (z) => {
    const sec = sectionAt(loft, z);
    return Math.max(FL, sec.y - sec.h * 0.5 * (1 - (s.flat || 0.03)) + 0.06);
  };
  const floorW = (z) => Math.min(fw, sectionAt(loft, z).w * 0.80);
  // Forward of the bay and aft of it she has a floor; through it there is a
  // catwalk a foot wide over the bomb bay roof, which is the piece of a heavy
  // bomber every crewman who ever wrote a memoir remembers.
  const floorRun = (a, b) => {
    const STEP = 0.5;
    for (let z = a; z < b - 0.01; z += STEP) {
      const len = Math.min(STEP, b - z);
      const mid = z + len / 2;
      const w = floorW(mid);
      if (w < 0.25) continue;
      box(IN, P.innerLo, w, 0.05, len + 0.02, 0, floorAt(mid), mid);
    }
  };
  if (z1 > bayF) floorRun(bayF, z1);
  if (bayA > z0) floorRun(z0, bayA);
  const walk = belly + bay.deep + 0.04;
  box(IN, P.frame, I.catwalk || 0.34, 0.05, bay.len, 0, walk, bay.z);
  for (const sd of [-1, 1]) {
    box(IN, P.frame, 0.04, 0.16, bay.len, sd * (I.catwalk || 0.34) / 2, walk + 0.08, bay.z);
  }
  // The steps down onto it at each end, so the floor and the catwalk meet.
  for (const zz of [bayF, bayA]) {
    box(IN, P.innerLo, fw, Math.max(0.05, Math.abs(walk - FL)), 0.10,
      0, (walk + FL) / 2, zz);
  }
  // The spars. Two of them, right through the cabin at the height of the wing,
  // and on a Lancaster the forward one is chest high: every man aft of it who
  // had to get out went over it first.
  const WY = CL + s.wingY;
  for (const [i, sz] of (I.spars || [s.wingZ - s.rootC * 0.22, s.wingZ - s.rootC * 0.78]).entries()) {
    const sh = i === 0 ? 0.58 : 0.44;
    box(IN, P.frame, B.w * 0.92, sh, 0.12, 0, WY + sh * 0.1, sz);
    box(IN, P.frame, B.w * 0.92, 0.09, 0.30, 0, WY + sh * 0.1 + sh / 2, sz);
    box(IN, P.frame, B.w * 0.92, 0.09, 0.30, 0, WY + sh * 0.1 - sh / 2, sz);
  }

  // ---- the flight deck ----------------------------------------------------
  const deckZ = I.deckZ === undefined ? (s.hoodZ0 + s.hoodZ1) / 2 - 0.3 : I.deckZ;
  const deckY = I.deckY === undefined ? FL + 0.30 : CL + I.deckY;
  const sideways = I.pilotX || 0;
  // The pilot, on the port side with his engineer beside him on the machines
  // that carried one.
  crewSeat(IN, { x: sideways, y: deckY, z: deckZ, armour: true, legs: deckY - FL });
  crewman(IN, { x: sideways, y: deckY + 0.10, z: deckZ + 0.04, pose: 'seated' });
  // The column: a post out of the floor with the spectacle grip on top of it.
  const col = new THREE.Group();
  col.position.set(sideways, FL, deckZ + 0.62);
  col.rotation.x = -0.16;
  p.add(col);
  cyl(col, P.panelBlack, 0.05, 0.06, 0.74, 0, 0.37, 0, 8);
  box(col, P.panelBlack, 0.30, 0.05, 0.07, 0, 0.74, 0);
  for (const sd of [-1, 1]) box(col, P.panelBlack, 0.06, 0.16, 0.06, sd * 0.15, 0.80, 0);
  // Rudder pedals.
  for (const sd of [-1, 1]) {
    const pd = box(IN, P.frame, 0.10, 0.16, 0.05, sideways + sd * 0.14, FL + 0.10, deckZ + 0.96);
    pd.rotation.x = 0.5;
  }
  // The instrument panel, and the dials on it. A blind-flying panel in the
  // middle with the engine gauges round it, which is what a 1943 panel was.
  const ip = new THREE.Group();
  ip.position.set(sideways, deckY + 0.32, deckZ + 1.15);
  ip.rotation.x = 0.22;
  p.add(ip);
  box(ip, P.panelBlack, 0.86, 0.50, 0.05, 0, 0, 0);
  for (let i = 0; i < 12; i++) {
    const cx = -0.32 + (i % 4) * 0.21;
    const cy = 0.15 - Math.floor(i / 4) * 0.15;
    cyl(ip, P.dial, 0.055, 0.055, 0.035, cx, cy, 0.04, 10).rotation.x = Math.PI / 2;
  }
  // The throttle pedestal: one lever per engine, and the pitch levers behind.
  const ped = new THREE.Group();
  ped.position.set(sideways + (I.pedX || 0.34), deckY + 0.06, deckZ + 0.52);
  p.add(ped);
  box(ped, P.panelBlack, 0.26, 0.14, 0.42, 0, 0, 0);
  const engines = (s.nacelles || []).length * 2;
  for (let i = 0; i < engines; i++) {
    const lx = -0.09 + (i / Math.max(1, engines - 1)) * 0.18;
    const lv = cyl(ped, P.frame, 0.014, 0.014, 0.26, lx, 0.15, 0.06, 6);
    lv.rotation.x = -0.35;
    cyl(ped, P.brass, 0.028, 0.028, 0.05, lx, 0.27, 0.11, 8);
  }
  // The engineer, on the machines that carried one, on a folding seat facing
  // his own panel across the gangway.
  if (I.engineer) {
    crewSeat(IN, { x: -sideways + I.engineer, y: deckY - 0.06, z: deckZ - 0.22,
      ry: -0.9, back: 0.3, legs: deckY - FL - 0.06 });
    crewman(IN, { x: -sideways + I.engineer, y: deckY + 0.04, z: deckZ - 0.22,
      ry: -0.9, pose: 'seated' });
    const ep = box(IN, P.panelBlack, 0.06, 0.52, 0.56,
      -sideways + I.engineer + 0.34, deckY + 0.34, deckZ - 0.22);
    ep.rotation.y = 0.1;
    for (let i = 0; i < 6; i++) {
      cyl(IN, P.dial, 0.042, 0.042, 0.03,
        -sideways + I.engineer + 0.38, deckY + 0.5 - (i % 3) * 0.16,
        deckZ - 0.40 + Math.floor(i / 3) * 0.3, 8).rotation.z = Math.PI / 2;
    }
  }

  // ---- the bomb aimer ----------------------------------------------------
  const aimZ = I.aimerZ === undefined ? B.z1 - 1.6 : I.aimerZ;
  // On the floor of the nose, wherever that has turned out to be. He lies
  // flat on it over the sight, which on a Lancaster is the lowest and the
  // furthest forward any of the seven of them got.
  const aimY = floorAt(aimZ) + 0.05;
  box(IN, P.seat, Math.min(0.56, floorW(aimZ) * 0.9), 0.09, 1.10, 0, aimY, aimZ - 0.2);
  crewman(IN, { x: 0, y: aimY + 0.12, z: aimZ - 0.1, pose: 'prone' });
  // The sight on its mount, and the panel of selector switches beside him:
  // which station to release from, and in what order.
  const sight = new THREE.Group();
  sight.position.set(0, aimY + 0.20, aimZ + 0.72);
  p.add(sight);
  box(sight, P.panelBlack, 0.16, 0.30, 0.20, 0, 0.14, 0);
  cyl(sight, P.frame, 0.035, 0.035, 0.26, 0, 0.02, 0, 8);
  cyl(sight, P.dial, 0.05, 0.05, 0.04, 0, 0.28, 0.09, 10).rotation.x = Math.PI / 2;
  const sel = box(IN, P.panelBlack, 0.34, 0.26, 0.04, 0.32, aimY + 0.34, aimZ + 0.30);
  sel.rotation.y = -0.4;
  for (let i = 0; i < 6; i++) {
    cyl(IN, P.brass, 0.014, 0.014, 0.05,
      0.26 + (i % 3) * 0.06, aimY + 0.30 + Math.floor(i / 3) * 0.10, aimZ + 0.33, 6)
      .rotation.x = Math.PI / 2;
  }

  // ---- the navigator and the wireless operator ---------------------------
  if (I.navZ !== undefined) {
    const nz = I.navZ;
    const nx = I.navX || -0.42;
    box(IN, P.innerLo, 0.72, 0.05, 0.54, nx, FL + 0.58, nz);
    for (const zz of [-0.2, 0.2]) {
      box(IN, P.frame, 0.05, 0.58, 0.05, nx - 0.3, FL + 0.29, nz + zz);
    }
    // The chart on it, the lamp over it, and the Gee set on the shelf above.
    box(IN, P.dial, 0.5, 0.01, 0.38, nx, FL + 0.61, nz);
    const lamp = cyl(IN, P.panelBlack, 0.05, 0.03, 0.10, nx + 0.2, FL + 0.90, nz + 0.16, 8);
    lamp.rotation.x = 0.5;
    box(IN, P.panelBlack, 0.36, 0.26, 0.30, nx - 0.06, FL + 1.06, nz - 0.1);
    cyl(IN, P.dial, 0.07, 0.07, 0.03, nx - 0.06, FL + 1.06, nz + 0.06, 10)
      .rotation.x = Math.PI / 2;
    crewSeat(IN, { x: nx + 0.10, y: FL + 0.44, z: nz - 0.52, ry: Math.PI,
      back: 0.34, legs: 0.44 });
    crewman(IN, { x: nx + 0.10, y: FL + 0.54, z: nz - 0.52, ry: Math.PI, pose: 'seated' });
  }
  if (I.radioZ !== undefined) {
    const rz = I.radioZ;
    const rx = I.radioX || -0.40;
    // The transmitter and the receiver, one over the other on their rack.
    for (let i = 0; i < 2; i++) {
      box(IN, P.panelBlack, 0.34, 0.30, 0.46, rx - 0.14, FL + 0.70 + i * 0.34, rz);
      for (let k = 0; k < 2; k++) {
        cyl(IN, P.dial, 0.05, 0.05, 0.03, rx + 0.02, FL + 0.70 + i * 0.34,
          rz - 0.14 + k * 0.28, 10).rotation.z = Math.PI / 2;
      }
    }
    box(IN, P.innerLo, 0.5, 0.05, 0.44, rx + 0.28, FL + 0.56, rz);
    crewSeat(IN, { x: rx + 0.30, y: FL + 0.40, z: rz - 0.46, ry: Math.PI,
      back: 0.32, legs: 0.40 });
    crewman(IN, { x: rx + 0.30, y: FL + 0.50, z: rz - 0.46, ry: Math.PI, pose: 'seated' });
  }

  // ---- the bay: carriers, crutches and the release units -----------------
  // A bomb does not rest on the floor of a bay; it hangs from a carrier on the
  // roof of it, held against two sway braces so it cannot swing. Every station
  // gets one, whether or not there is a bomb on it at the moment.
  const roof = belly + bay.deep;
  for (let i = 0; i < bay.n; i++) {
    const stz = bay.z - bay.len * 0.42 + (bay.len * 0.84)
      * (bay.n === 1 ? 0.5 : i / (bay.n - 1));
    const stx = bay.n > 4 ? (i % 2 ? bay.wide * 0.22 : -bay.wide * 0.22) : 0;
    box(p, P.frame, 0.16, 0.12, 0.30, stx, roof - 0.07, stz);
    // The two hooks, and the sway braces either side that steady the store.
    for (const zz of [-0.11, 0.11]) {
      box(p, P.brass, 0.05, 0.10, 0.04, stx, roof - 0.16, stz + zz);
    }
    for (const sd of [-1, 1]) {
      const br = cyl(p, P.frame, 0.016, 0.016, 0.22, stx + sd * 0.11, roof - 0.19, stz, 6);
      br.rotation.z = sd * 0.5;
    }
    // The release unit, and the arming wire running off it.
    box(p, P.panelBlack, 0.09, 0.08, 0.13, stx + 0.11, roof - 0.05, stz);
  }

  // ---- the turrets, from the inside --------------------------------------
  // A seat sling in each cupola, and the ammunition tracks feeding it. On a
  // Lancaster the tail turret's belts ran the whole length of the fuselage
  // from boxes amidships, in two ducts along the floor -- and that duct is
  // most of what there is to see aft of the rear spar.
  for (const t of (p.userData.turrets || [])) {
    if (t.name === 'ball') continue;
    // A tail gunner knelt in about a yard of turret, and the smaller the
    // mounting the less of him fitted in it: the man is sized to the cupola he
    // is in rather than drawn full size in every one and hung out the back of
    // the tight ones.
    const sc = Math.max(0.58, Math.min(1, t.r / 0.62));
    box(t.ring, P.seat, t.r * 0.62, 0.06, t.r * 0.5, 0, -t.r * 0.10, -t.r * 0.18);
    box(t.ring, P.seat, t.r * 0.62, t.r * 0.5, 0.05, 0, t.r * 0.14, -t.r * 0.40);
    crewman(t.ring, { x: 0, y: -t.r * 0.04, z: -t.r * 0.16, scale: sc, lean: 0.02 });
  }
  const tail = (p.userData.turrets || []).find((t) => t.name === 'tail');
  if (tail && I.tracks !== false) {
    for (const sd of [-1, 1]) {
      const from = I.trackZ === undefined ? bay.z : I.trackZ;
      const to = tail.at[2] + 0.8;
      box(IN, P.innerLo, 0.13, 0.10, from - to, sd * B.w * 0.30, FL + 0.08, (from + to) / 2);
      box(IN, P.brass, 0.09, 0.03, from - to, sd * B.w * 0.30, FL + 0.13, (from + to) / 2);
    }
  }

  // ---- bulkheads and the doors through them ------------------------------
  for (const bz of (I.bulkheads || [])) {
    const sec = sectionAt(loft, bz);
    const w = sec.w * 0.94;
    const h = sec.h * 0.94;
    const y = sec.y;
    // A bulkhead is a plate with a doorway through it, and a crew had to get
    // through that doorway in a hurry wearing a parachute. Built as the four
    // panels round the hole rather than as a wall with a dark patch on it --
    // one of those is a bulkhead and the other is a painted door.
    const dw = Math.min(w * 0.46, 0.64);
    const dh = Math.min(h * 0.60, 1.10);
    const sill = floorAt(bz) + 0.06;
    const head = sill + dh;
    for (const sd of [-1, 1]) {
      box(IN, P.inner, (w - dw) / 2, h, 0.05, sd * (dw + (w - dw) / 2) / 2, y, bz);
    }
    box(IN, P.inner, dw, Math.max(0.05, y + h / 2 - head), 0.05,
      0, (head + y + h / 2) / 2, bz);
    box(IN, P.inner, dw, Math.max(0.05, sill - (y - h / 2)), 0.05,
      0, (sill + y - h / 2) / 2, bz);
    // The frame round the hole, which is the piece a man grabs going through.
    box(IN, P.frame, dw + 0.08, 0.05, 0.09, 0, head, bz);
    for (const sd of [-1, 1]) box(IN, P.frame, 0.05, dh, 0.09, sd * dw / 2, sill + dh / 2, bz);
  }
  void CROWN;
  p.traverse((o) => { if (o.isMesh && !already.has(o)) o.userData.inside = true; });
  // The stick and whatever hangs under her wings are not plating: they were
  // built before this ran, but a cutaway that fades the bombs out shows an
  // empty aeroplane, which is the one thing a bomb bay is not.
  for (const cr of (p.userData.rack || []).concat(p.userData.stores || [])) {
    cr.traverse((o) => { if (o.isMesh) o.userData.inside = true; });
  }
}

/**
 * A heavy bomber, from a spec.
 *
 * One function for all five, because they are one aeroplane at five sets of
 * dimensions: a body, a wing with two or four engines on it, a tail with one
 * fin or two, turrets where that machine had turrets, and a bay with a stick
 * in it. What each of them actually is lives in HEAVY, below.
 */
function heavy(g, x, y, z, ry, s) {
  const [TOP, BOT] = paint(s.paint);
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = ry;
  g.add(p);
  // What moves on her, for whatever is drawing her: the airscrews, the bay
  // doors, and the bombs on the crutches inside the bay.
  p.userData.props = [];
  p.userData.rack = [];
  p.userData.stores = [];
  p.userData.turrets = [];
  // Where her belly is at the bay, which the bay, the stick and the whole of
  // the inside of her are measured from.
  let bellyAt = null;
  const CL = s.cl;

  // ---- the body ----------------------------------------------------------
  airframe(p, TOP, bodyLoft({ ...s.body, y: CL }), {
    seg: 22, e: s.e === undefined ? 0.94 : s.e, flat: s.flat || 0.03, mBot: BOT,
  });

  // ---- the mainplane, and the engines on it ------------------------------
  const WY = CL + s.wingY;
  const semi = s.span / 2;
  for (const sd of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(0, WY, s.wingZ);
    w.rotation.z = -sd * (s.dihedral === undefined ? 0.05 : s.dihedral);
    p.add(w);
    const sw = wing(w, TOP, BOT, {
      side: sd, x: 0, y: 0, z: 0, span: semi, rootC: s.rootC, tipC: s.tipC,
      sweep: s.sweep, thick: s.thick || 0.145, camber: 0.021, twist: -0.035,
      stations: 9, chordwise: 16, rootCap: false, round: s.round !== false,
    });
    ctrlSurface(w, TOP, sw, 0.62, 0.93);                    // aileron
    ctrlSurface(w, TOP, sw, 0.10, 0.58, 0.76);              // flap
    if (s.leBand) leBand(w, P.yellow, sw, 0.04, 0.40);
    for (const nc of (s.nacelles || [])) {
      const f = nc.x / semi;
      // Where the wing actually is at that station, asked of the panel rather
      // than guessed: a nacelle hung at a typed height is the thing that ends
      // up floating under a swept, tapered, dihedral wing.
      const le = sw.at(f, 0.0, true);
      const lo = sw.at(f, 0.34, false);
      const nac = new THREE.Group();
      nac.position.set(le[0], (le[1] + lo[1]) * 0.5 + (nc.dy || 0), le[2] + (nc.fwd || 1.9));
      w.add(nac);
      const disc = nacelle(nac, { ...s.engine, ...nc });
      if (disc) p.userData.props.push(disc);
    }
    // The fairing where the panel comes out of the body, so the wing root is a
    // joint and not a slot.
    rootFillet(p, TOP, sd * s.body.w * 0.46, WY - 0.06,
      s.wingZ - s.rootC * 0.45, s.rootC * 1.1, 0.5, 0.42);
    // Outboard of the outer engine, where a marking on a four-engined wing has
    // to go: painted at mid-semi-span it lands on top of a nacelle. And on the
    // panel's own surface at that station, not at a typed-in z -- a swept,
    // tapered wing has its leading edge two metres further aft out there than
    // it has at the root, and a roundel put at the root's chord hangs in the
    // air in front of the wing it is supposed to be painted on.
    // How far out, and how far back: a marking has to be clear of the engines
    // and small enough against the chord at that station. A hinomaru with its
    // white surround is nearly a fifth wider than the disc, so the Betty's
    // goes further inboard where there is more wing under it.
    const mAt = sw.at(s.markF || 0.74, s.markU || 0.50, true);
    const [mx, my, mz] = mAt;
    if (s.mark === 'roundel') roundel(w, mx, my, mz, s.markR, true, w);
    if (s.mark === 'star') insignia(w, mx, my, mz, s.markR, true, w);
    if (s.mark === 'cross') balkenkreuz(w, mx, my, mz, s.markR, true, w);
    if (s.mark === 'hinomaru') hinomaru(w, mx, my, mz, s.markR, true, true, w);
  }

  // ---- the tail ----------------------------------------------------------
  const TY = CL + s.tpY;
  let finTop = null;
  let twinTop = null;
  if (s.fins === 2) {
    // A tailplane with a fin on each tip. The fins stand on the tips rather
    // than near them, so there is nothing between the two to be a gap.
    for (const sd of [-1, 1]) {
      wing(p, TOP, BOT, {
        side: sd, x: 0, y: TY, z: s.tpZ, span: s.tpSpan / 2, rootC: s.tpC,
        tipC: s.tpC * 0.74, sweep: s.tpC * 0.16, thick: 0.10, camber: 0,
        stations: 5, chordwise: 11, rootCap: false, round: false,
      });
      box(p, TOP, s.tpSpan / 2 - 0.2, 0.05, 0.07,
        sd * s.tpSpan / 4, TY + 0.06, s.tpZ - s.tpC * 0.72);
      const fin = new THREE.Group();
      fin.position.set(sd * (s.tpSpan / 2 - s.finC * 0.06), TY, s.tpZ);
      fin.rotation.z = Math.PI / 2;
      p.add(fin);
      // Built down as well as up, so the fin passes through the tailplane it
      // stands on instead of balancing on the skin of it.
      wing(fin, TOP, TOP, {
        side: 1, x: -s.finH * 0.16, y: 0, z: -s.finC * 0.42,
        span: s.finH * 1.16, rootC: s.finC, tipC: s.finC * 0.70,
        sweep: s.finC * 0.10, thick: 0.10, camber: 0, stations: 5, chordwise: 11,
        round: false,
      });
      box(p, TOP, 0.05, s.finH * 0.80, 0.06,
        sd * (s.tpSpan / 2 - s.finC * 0.06), TY + s.finH * 0.50, s.tpZ - s.finC * 0.60);
    }
    // Both fin heads, for the aerial: an Avro's wire is a Y off the mast to the
    // top of each fin, and one run to a point on the centreline between them
    // ends in mid air.
    finTop = [-(s.tpSpan / 2 - s.finC * 0.06), TY + s.finH * 0.94, s.tpZ - s.finC * 0.34];
    twinTop = [s.tpSpan / 2 - s.finC * 0.06, TY + s.finH * 0.94, s.tpZ - s.finC * 0.34];
  } else {
    const tail = empennage(p, s.finH, s.finC, s.tpSpan, s.tpC, TY, s.tpZ);
    finTop = tail.finTop;
    // The dorsal fillet running forward along her spine off the root of the
    // fin. On a Fortress it is two thirds of the way to the wing and it is
    // most of what you recognise her by.
    if (s.fillet) {
      airframe(p, TOP, [
        { z: s.tpZ + s.fillet, w: 0.10, h: 0.08, y: CL + s.body.h * 0.44 },
        { z: s.tpZ + s.fillet * 0.62, w: 0.20, h: 0.34, y: CL + s.body.h * 0.50 },
        { z: s.tpZ + s.fillet * 0.30, w: 0.26, h: 0.86, y: CL + s.body.h * 0.62 },
        { z: s.tpZ + s.finC * 0.30, w: 0.28, h: 1.5, y: CL + s.body.h * 0.74 },
      ], { seg: 12, e: 0.9, capF: false, capA: false, mBot: TOP });
    }
  }

  // ---- the flight deck ---------------------------------------------------
  // A machine whose flight deck is inside her glazed nose -- the two Germans --
  // has no hood of her own, and asking for one puts a fighter's sliding hood on
  // top of a nose that is already glass.
  if (s.hoodW) {
    greenhouse(p, s.hoodW, s.hoodH, CL + s.hoodY, s.hoodZ0, s.hoodZ1, s.hoodBays || 5);
  }

  // ---- the nose ----------------------------------------------------------
  // The glazed nose, built as the same loft the body's nose is built from and
  // a hair outside it, so the glass is her skin rather than a cone parked in
  // front of her.
  if (s.glazeNose) {
    const gn = bodyLoft({ ...s.body, y: CL });
    const keep = gn.filter((st) => st.z >= s.glazeNose);
    if (keep.length >= 2) {
      airframe(p, M.cave, keep.map((st) => ({ ...st, w: st.w * 0.82, h: st.h * 0.82 })),
        { seg: 20, e: 0.94, flat: s.flat || 0.03, capA: false, mBot: M.cave });
      airframe(p, P.glazing, keep.map((st) => ({ ...st, w: st.w * 1.005, h: st.h * 1.005 })),
        { seg: 20, e: 0.94, flat: s.flat || 0.03, capA: false, mBot: P.glazing });
      // The frames across it: rings of the same loft, a shade proud again.
      for (let i = 1; i < keep.length - 1; i += 2) {
        const st = keep[i];
        airframe(p, TOP, [
          { z: st.z - 0.03, w: st.w * 1.02, h: st.h * 1.02, y: st.y },
          { z: st.z + 0.03, w: st.w * 1.02, h: st.h * 1.02, y: st.y },
        ], { seg: 20, e: 0.94, flat: s.flat || 0.03, capA: false, capF: false, mBot: TOP });
      }
    }
  }
  // The bomb aimer's blister under the nose, where he lay to use the sight --
  // and on the two Germans the ventral gondola, which is the same shape doing
  // the same job with a gun in the back of it.
  for (const b of (s.blister ? [s.blister] : [])) {
    airframe(p, P.glazing, [
      { z: b.z - b.len * 0.5, w: b.w * 0.3, h: b.h * 0.4, y: CL + b.y },
      { z: b.z - b.len * 0.2, w: b.w * 0.9, h: b.h * 0.9, y: CL + b.y },
      { z: b.z + b.len * 0.2, w: b.w, h: b.h, y: CL + b.y },
      { z: b.z + b.len * 0.5, w: b.w * 0.5, h: b.h * 0.6, y: CL + b.y },
    ], { seg: 14, e: 0.9, flat: 0.1, mBot: P.glazing });
  }
  // The blisters: a beam gun's bubble, a pilot's bulged side window, a dorsal
  // cupola with no turret in it. A glass bump on the skin, and nothing more.
  for (const b of (s.bulges || [])) {
    for (const sd of (b.pair ? [-1, 1] : [0])) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(b.r, 12, 10), P.glazing);
      dome.position.set(sd * b.x + (b.pair ? 0 : b.x), CL + b.y, b.z);
      dome.scale.set(b.sx || 1, b.sy || 0.8, b.sz || 1.5);
      p.add(dome);
      lathe(p, M.planeTop, [[b.r * 1.02, -b.r * 0.1], [b.r * 1.06, 0], [b.r * 1.02, b.r * 0.1]],
        sd * b.x + (b.pair ? 0 : b.x), CL + b.y, b.z, 14);
    }
  }

  // ---- the turrets -------------------------------------------------------
  for (const t of (s.turrets || [])) {
    if (t.kind === 'ball') ballTurret(p, { ...t, y: CL + t.y });
    else turretDome(p, { ...t, y: CL + t.y });
  }

  // ---- the bay, the doors and the stick inside ---------------------------
  if (s.bay) {
    const b = s.bay;
    // The belly line asked of the body rather than typed, so the doors lie in
    // her skin instead of a hand's breadth under it.
    const belly = underside(p, 0, b.z, CL - s.body.h) ?? (CL - s.body.h * 0.5);
    bellyAt = belly;
    bombBay(p, { y: belly + 0.01, z: b.z, len: b.len, wide: b.wide, deep: b.deep });
    // The stick on the crutches: as many as she carried, spaced down the bay,
    // hung from the roof of it so the open doors show a loaded aeroplane.
    for (let i = 0; i < b.n; i++) {
      const cr = new THREE.Group();
      cr.position.set(
        b.n > 4 && i % 2 ? b.wide * 0.22 : (b.n > 4 ? -b.wide * 0.22 : 0),
        belly + b.deep * 0.52,
        b.z - b.len * 0.42 + (b.len * 0.84) * (b.n === 1 ? 0.5 : i / (b.n - 1)),
      );
      p.add(cr);
      bomb(cr, b.bombLen || 1.9, b.bombR || 0.23);
      p.userData.rack.push(cr);
    }
  }
  // What she carries under the wing instead of, or as well as, inside her.
  for (const u of (s.underwing || [])) {
    for (const sd of [-1, 1]) {
      const cr = new THREE.Group();
      cr.position.set(sd * u.x, CL + u.y, u.z);
      p.add(cr);
      // The crutch it hangs on, so nothing under a wing is in the air on its
      // own, and then the weapon on it.
      const over = underside(p, sd * u.x, u.z, CL + u.y + 0.1);
      if (over !== null) {
        box(p, BOT, 0.14, Math.max(0.08, over - (CL + u.y) - (u.r || 0.26)), 0.5,
          sd * u.x, (over + CL + u.y + (u.r || 0.26)) * 0.5, u.z);
      }
      if (u.kind === 'torpedo') torpedo(cr, u.len || 5.2, u.r || 0.28);
      else bomb(cr, u.len || 2.3, u.r || 0.27);
      p.userData.stores.push(cr);
    }
  }

  // ---- and everything inside her -----------------------------------------
  // Last, because it is measured off the skin, the floor, the bay and the
  // turrets, and every one of those has to exist before it can be asked where
  // it is. See bomberInside.
  if (s.bay && bellyAt !== null) bomberInside(p, s, CL, bellyAt);

  // ---- the markings and the aerial ---------------------------------------
  const MY = CL + s.body.h * 0.04;
  for (const sd of [-1, 1]) {
    if (s.mark === 'roundel') roundel(p, sd * s.body.w * 0.5, MY, s.markZ, s.markR, false);
    if (s.mark === 'star') insignia(p, sd * s.body.w * 0.5, MY, s.markZ, s.markR, false);
    if (s.mark === 'cross') balkenkreuz(p, sd * s.body.w * 0.5, MY, s.markZ, s.markR, false);
    if (s.mark === 'hinomaru') hinomaru(p, sd * s.body.w * 0.5, MY, s.markZ, s.markR, false);
  }
  // The mast, abaft the flight deck. Measured off the hood where there is one
  // and off her own spec where there is not -- the two Germans fly their crew
  // inside the glazed nose and have no hood at all, and `s.hoodZ0 - 0.4` on
  // one of those is a mast at NaN with the aerial run to it.
  const mastZ = s.mastZ === undefined ? s.hoodZ0 - 0.4 : s.mastZ;
  const mastY = CL + s.body.h * 0.5;
  aerial(p, 0, mastY, mastZ, s.mastH || 1.1, finTop);
  if (twinTop) {
    strut(p, M.wire, [0, mastY + (s.mastH || 1.1), mastZ], twinTop, 0.016, 4);
  }

  // No undercarriage. Every one of these is drawn in the air -- over a city in
  // the bomber yard, over the fleet on a raid -- and there is no screen in the
  // game that puts a heavy on the ground. A retracted leg is a wheel well and
  // a closed door, which is what the belly loft already is, and half an
  // undercarriage that nothing ever looks at is only somewhere for a wheel to
  // end up hanging in the air.

  // What she is, so anything holding one can ask.
  p.userData.kind = s.id;
  p.userData.span = s.span;
  p.userData.length = s.body.z1 - s.body.z0;
  return p;
}

/**
 * What each of the five actually is.
 *
 * Every figure here is off the real machine: span and length to the
 * centimetre, the engines where they were on the wing, the turrets where they
 * were on the body, and the bay as long as the bay was. The Lancaster's is
 * 10.05 m, which is the whole reason there was a Lancaster.
 */
const HEAVY = {
  // Twin fins on the tips of the tailplane, four Merlins in long nacelles, and
  // a bomb bay running a third of her length. Nothing else looks like her.
  lancaster: {
    id: 'lancaster', paint: 'raf', mark: 'roundel', markR: 0.62, markZ: -3.4,
    cl: 2.50, e: 0.90, flat: 0.06,
    body: {
      z0: -9.90, z1: 10.60, w: 2.00, h: 2.55, n: 18,
      full0: 0.30, full1: 0.78, tailW: 0.24, tailH: 0.34,
      noseW: 0.50, noseH: 0.46, noseP: 2.2, tailUp: 0.42, noseDrop: -0.06,
    },
    span: 31.09, wingY: -0.30, wingZ: 4.20, rootC: 6.10, tipC: 2.10,
    sweep: 3.00, dihedral: 0.055, thick: 0.160,
    engine: { kind: 'inline', r: 0.60, prop: 3.99, blades: 3, back: 3.8 },
    nacelles: [
      { x: 5.00, fwd: 2.70, dy: -0.10, leg: true },
      { x: 9.70, fwd: 2.20, dy: -0.06, back: 2.6 },
    ],
    fins: 2, finH: 2.05, finC: 2.30,
    tpY: -0.05, tpZ: -8.10, tpSpan: 10.00, tpC: 2.60,
    hoodW: 1.34, hoodH: 0.64, hoodY: 1.06, hoodZ0: 4.80, hoodZ1: 8.30, hoodBays: 5,
    blister: { z: 9.30, len: 2.60, w: 1.30, h: 0.92, y: -0.86 },
    turrets: [
      // FN5 in the nose, FN50 amidships and the FN20 in the tail. The
      // mid-upper swung the whole way round and could not depress below her
      // own spine; the other two had a ninety-five degree cone either side.
      { name: 'nose', z: 10.05, y: 0.52, r: 0.58, guns: 2, cal: 0.040, len: 1.05,
        spread: 0.26, arc: 95, up: 60, down: 45 },
      { name: 'dorsal', z: 1.20, y: 1.14, r: 0.62, guns: 2, cal: 0.040, len: 1.05,
        spread: 0.28, arc: 180, up: 80, down: 2 },
      { name: 'tail', z: -9.55, y: -0.02, r: 0.70, guns: 4, cal: 0.040, len: 1.15,
        spread: 0.22, back: true, arc: 94, up: 60, down: 45 },
    ],
    // Her inside, station by station. The flight deck is on the port side with
    // the engineer's folding seat to starboard; the navigator sits behind the
    // pilot with the wireless operator behind him; the two spars cross the
    // cabin at the wing, and the forward one is chest high.
    inside: {
      floor: -0.44, z0: -8.60, z1: 9.60, ribs: 1.15, catwalk: 0.34,
      deckZ: 6.30, pilotX: -0.30, pedX: 0.30, engineer: 0.66,
      aimerZ: 8.80, aimerY: -1.02,
      navZ: 4.40, navX: -0.44, radioZ: 2.70, radioX: -0.42,
      spars: [4.30, -0.90], trackZ: 1.20,
      bulkheads: [5.60, -4.40],
    },
    bay: { z: 1.40, len: 10.05, wide: 1.50, deep: 0.86, n: 5, bombLen: 2.20, bombR: 0.26 },
    mastH: 1.00,
  },

  // One fin like a barn door with the fillet running two thirds of the way
  // forward off it, four radials, and a turret on every face of her.
  fortress: {
    id: 'fortress', paint: 'usaaf', mark: 'star', markR: 0.70, markZ: -4.40,
    cl: 2.90, e: 0.96, flat: 0.02,
    body: {
      z0: -11.10, z1: 11.10, w: 2.28, h: 2.50, n: 18,
      full0: 0.34, full1: 0.74, tailW: 0.24, tailH: 0.38,
      noseW: 0.34, noseH: 0.36, noseP: 2.0, tailUp: 0.60,
    },
    span: 31.62, wingY: -0.22, wingZ: 3.40, rootC: 5.20, tipC: 1.80,
    sweep: 3.60, dihedral: 0.075, thick: 0.150,
    engine: { kind: 'radial', r: 0.66, prop: 3.54, blades: 3, back: 3.4 },
    nacelles: [
      { x: 4.60, fwd: 2.50, dy: -0.10, leg: true },
      { x: 8.50, fwd: 2.10, dy: -0.06, back: 2.6 },
    ],
    fins: 1, finH: 3.40, finC: 4.80, fillet: 7.20,
    tpY: 0.00, tpZ: -8.60, tpSpan: 13.00, tpC: 3.20,
    hoodW: 1.48, hoodH: 0.60, hoodY: 1.02, hoodZ0: 4.90, hoodZ1: 8.10, hoodBays: 4,
    glazeNose: 8.40,
    turrets: [
      // The Bendix chin under the bomb aimer, the Sperry upper, the Sperry
      // ball, and the Cheyenne in the tail -- which had the tightest cone of
      // any turret on this list and is why a Fortress was attacked from dead
      // astern and a little high.
      { name: 'chin', z: 9.00, y: -1.02, r: 0.44, guns: 2, cal: 0.050, len: 1.05,
        spread: 0.24, arc: 87, up: 26, down: 46 },
      { name: 'dorsal', z: 4.40, y: 1.10, r: 0.58, guns: 2, cal: 0.050, len: 1.10,
        spread: 0.26, arc: 180, up: 85, down: 2 },
      { kind: 'ball', name: 'ball', z: -0.90, y: -1.00, r: 0.62, up: 0, down: 90 },
      { name: 'tail', z: -10.70, y: -0.26, r: 0.54, guns: 2, cal: 0.050, len: 1.20,
        spread: 0.24, back: true, arc: 45, up: 30, down: 30 },
    ],
    bulges: [
      { x: 1.12, y: 0.10, z: -2.60, r: 0.30, pair: true, sy: 0.7, sz: 1.2 },
      { x: 1.10, y: 0.24, z: 7.60, r: 0.26, pair: true, sy: 0.7, sz: 1.4 },
    ],
    // A Fortress is a catwalk with an aeroplane round it: the bay is deep, the
    // walk through it is a foot wide, and the radio room is aft of that with
    // the waist beyond.
    inside: {
      floor: -0.72, z0: -9.80, z1: 9.60, ribs: 1.20, catwalk: 0.30,
      deckZ: 6.10, pilotX: -0.44, pedX: 0.44, engineer: 0.00,
      aimerZ: 8.60, aimerY: -1.20,
      navZ: 7.30, navX: -0.48, radioZ: -2.70, radioX: -0.44,
      spars: [3.60, -0.60], trackZ: -1.60,
      bulkheads: [4.90, -2.00, -6.60],
    },
    bay: { z: 1.20, len: 4.80, wide: 1.20, deep: 1.50, n: 4, bombLen: 1.90, bombR: 0.22 },
    mastH: 0.90,
  },

  // The one with no step in front of the pilots: the whole nose is glass, and
  // the gondola under it is where the ventral gunner lay.
  heinkel: {
    id: 'heinkel', paint: 'luftwaffe', mark: 'cross', markR: 0.58, markZ: -3.20,
    cl: 2.20, e: 0.94, flat: 0.04,
    body: {
      z0: -8.10, z1: 8.30, w: 1.72, h: 2.00, n: 16,
      full0: 0.32, full1: 0.70, tailW: 0.22, tailH: 0.34,
      noseW: 0.74, noseH: 0.70, noseP: 2.4, tailUp: 0.34, noseDrop: -0.10,
    },
    span: 22.60, wingY: -0.28, wingZ: 2.40, rootC: 4.60, tipC: 1.50,
    sweep: 1.40, dihedral: 0.065, thick: 0.150,
    engine: { kind: 'inline', r: 0.58, prop: 3.50, blades: 3, back: 3.0 },
    nacelles: [{ x: 3.40, fwd: 2.40, dy: -0.10, leg: true }],
    fins: 1, finH: 2.30, finC: 2.70,
    tpY: -0.05, tpZ: -6.30, tpSpan: 8.60, tpC: 2.20,
    glazeNose: 5.40,
    blister: { z: 3.00, len: 3.40, w: 1.00, h: 0.78, y: -1.10 },
    // The dorsal MG 15 on its open ring, the MG FF in the nose ball mount, and
    // the rear gun out of the back of the gondola under her.
    turrets: [
      { name: 'dorsal', z: 1.10, y: 0.98, r: 0.44, guns: 1, cal: 0.045, len: 0.95,
        arc: 100, up: 75, down: 8 },
      { name: 'nose', z: 6.90, y: 0.10, r: 0.30, guns: 1, cal: 0.055, len: 0.85,
        open: true, arc: 40, up: 35, down: 30 },
      { name: 'gondola', z: 1.80, y: -1.30, r: 0.30, guns: 1, cal: 0.045, len: 0.85,
        open: true, back: true, arc: 35, up: 8, down: 55 },
    ],
    bulges: [{ x: 0.52, y: 0.86, z: 6.10, r: 0.34, sy: 0.7, sz: 1.3 }],
    inside: {
      floor: -0.52, z0: -6.60, z1: 6.60, ribs: 1.05, catwalk: 0.30,
      deckZ: 5.10, pilotX: -0.28, pedX: 0.28,
      aimerZ: 5.90, aimerY: -0.96,
      navZ: 3.10, navX: -0.40, radioZ: 1.40, radioX: -0.38,
      spars: [2.60, -0.60], tracks: false,
      bulkheads: [-2.60],
    },
    bay: { z: 0.60, len: 3.20, wide: 0.92, deep: 0.72, n: 4, bombLen: 1.50, bombR: 0.19 },
    mastZ: 3.60, mastH: 0.95,
  },

  // The fast one: a short slender body, a beetle-eye nose and the bombs hung
  // outside on the racks, which is how she got them there in a hurry.
  junkers: {
    id: 'junkers', paint: 'luftwaffe', mark: 'cross', markR: 0.52, markZ: -2.60,
    cl: 2.10, e: 0.94, flat: 0.04,
    body: {
      z0: -7.10, z1: 7.30, w: 1.58, h: 1.90, n: 16,
      full0: 0.32, full1: 0.66, tailW: 0.22, tailH: 0.34,
      noseW: 0.80, noseH: 0.76, noseP: 2.6, tailUp: 0.28, noseDrop: -0.08,
    },
    span: 20.08, wingY: -0.26, wingZ: 2.00, rootC: 4.00, tipC: 1.40,
    sweep: 1.20, dihedral: 0.060, thick: 0.145,
    engine: { kind: 'radial', r: 0.52, prop: 3.50, blades: 3, back: 3.0 },
    nacelles: [{ x: 2.90, fwd: 2.50, dy: -0.10, leg: true }],
    fins: 1, finH: 2.10, finC: 2.40,
    tpY: -0.05, tpZ: -5.60, tpSpan: 6.70, tpC: 1.90,
    glazeNose: 4.60,
    blister: { z: 2.40, len: 2.80, w: 0.84, h: 0.64, y: -1.04 },
    bulges: [{ x: 0, y: 0.94, z: 4.30, r: 0.34, sy: 0.7, sz: 1.5 }],
    // No powered turret aboard her: an MG 81Z in the cupola over the crew and
    // another out of the back of the ventral gondola, both hand-held, both
    // with the arcs a man on a ring can reach.
    turrets: [
      { name: 'dorsal', z: 3.40, y: 0.92, r: 0.28, guns: 2, cal: 0.040, len: 0.8,
        spread: 0.10, open: true, back: true, arc: 55, up: 70, down: 5 },
      { name: 'gondola', z: 1.20, y: -1.22, r: 0.26, guns: 1, cal: 0.040, len: 0.8,
        open: true, back: true, arc: 35, up: 8, down: 55 },
    ],
    // Four men in one cabin, all of them forward of the wing and all within
    // arm's reach of each other -- which is exactly how a Ju 88 was crewed.
    inside: {
      floor: -0.48, z0: -5.90, z1: 5.80, ribs: 1.00, catwalk: 0.28,
      deckZ: 4.20, pilotX: -0.26, pedX: 0.26,
      aimerZ: 5.00, aimerY: -0.90,
      navZ: 2.60, navX: -0.38, tracks: false,
      spars: [2.20, -0.60],
      bulkheads: [-2.20],
    },
    bay: { z: 0.30, len: 2.60, wide: 0.78, deep: 0.60, n: 3, bombLen: 1.30, bombR: 0.16 },
    underwing: [{ x: 2.30, y: -0.92, z: 0.60, len: 2.20, r: 0.25 }],
    mastZ: 2.80, mastH: 0.85,
  },

  // A cigar with a wing through it: no armour, no sealing in her tanks, and
  // the legs to fly a thousand miles out and a thousand back.
  betty: {
    id: 'betty', paint: 'ijn', mark: 'hinomaru', markR: 0.58, markF: 0.62,
    markZ: -3.20, cl: 2.40, e: 1.00, flat: 0.00, leBand: true,
    body: {
      z0: -9.70, z1: 10.30, w: 2.20, h: 2.30, n: 18,
      full0: 0.28, full1: 0.72, tailW: 0.34, tailH: 0.42,
      noseW: 0.44, noseH: 0.44, noseP: 2.0, tailUp: 0.30,
    },
    span: 24.89, wingY: 0.42, wingZ: 2.60, rootC: 4.40, tipC: 1.40,
    sweep: 1.60, dihedral: 0.055, thick: 0.150,
    engine: { kind: 'radial', r: 0.72, prop: 3.40, blades: 3, back: 3.2 },
    nacelles: [{ x: 3.60, fwd: 2.50, dy: -0.34, leg: true }],
    fins: 1, finH: 2.60, finC: 3.00,
    tpY: -0.10, tpZ: -7.60, tpSpan: 9.00, tpC: 2.20,
    glazeNose: 7.80,
    hoodW: 1.30, hoodH: 0.56, hoodY: 0.98, hoodZ0: 4.40, hoodZ1: 7.40, hoodBays: 4,
    turrets: [
      // The dorsal blister swung the whole way round; the tail cannon sat in
      // a cone about as tight as the Cheyenne's.
      { name: 'dorsal', z: -1.80, y: 1.02, r: 0.54, guns: 1, cal: 0.055, len: 0.95,
        arc: 180, up: 80, down: 2 },
      { name: 'tail', z: -9.40, y: 0.06, r: 0.58, guns: 1, cal: 0.060, len: 1.10,
        back: true, arc: 30, up: 30, down: 30 },
    ],
    bulges: [{ x: 1.06, y: 0.16, z: -4.90, r: 0.40, pair: true, sy: 0.9, sz: 1.2 }],
    inside: {
      floor: -0.56, z0: -8.30, z1: 8.40, ribs: 1.10, catwalk: 0.32,
      deckZ: 5.20, pilotX: -0.30, pedX: 0.30, engineer: 0.60,
      aimerZ: 7.20, aimerY: -1.00,
      navZ: 3.20, navX: -0.42, radioZ: 1.40, radioX: -0.40,
      spars: [2.90, -0.80], trackZ: 0.60,
      bulkheads: [-4.20],
    },
    bay: { z: 1.00, len: 4.60, wide: 1.10, deep: 0.56, n: 4, bombLen: 1.60, bombR: 0.20 },
    mastH: 0.90,
  },
};

/** The kinds this file can build, in the order the bomber yard steps them. */
const HEAVY_KINDS = ['lancaster', 'fortress', 'heinkel', 'junkers', 'betty'];

/**
 * One heavy bomber, by name, in her own group with the origin under her.
 *
 * She comes in flight trim, which is the only trim there is for one of these.
 */
function heavyBomber(kind) {
  const g = new THREE.Group();
  const s = HEAVY[kind] || HEAVY.lancaster;
  const p = heavy(g, 0, 0, 0, 0, s);
  // Her skin, the same flush-riveted alloy under paint every other machine in
  // this file wears. Done here rather than by the caller because a bomber is
  // never welded into a squadron the way the carrier aircraft are: she is one
  // model, looked at on her own.
  dressPlane(g);
  // Her skin, off. A cutaway drawing is the only way anybody ever saw the
  // inside of one of these, and it is a drawing rather than a hole: the
  // structure and the crew stay solid and the plating over them goes to a
  // ghost of itself. Built after `dressPlane`, because that is what settles
  // which material each piece of her is actually wearing.
  const ghosts = new Map();
  const skin = [];
  g.traverse((o) => {
    if (!o.isMesh || o.userData.inside || Array.isArray(o.material)) return;
    const solid = o.material;
    let ghost = ghosts.get(solid);
    if (!ghost) {
      // Additive, and unlit. A ghost that works the usual way multiplies what
      // is behind it, and the eye looks through six or eight layers of her to
      // see the inside -- two sides of the fuselage, a wing, a nacelle, a
      // fin -- so the structure ends up at a third of its brightness with a
      // dark green cast over it, which is a silhouette rather than a cutaway.
      // Adding light never darkens anything: the plating reads as a pale film
      // over her and what is inside keeps its own colour.
      ghost = new THREE.MeshBasicMaterial({
        color: (solid.color ? solid.color.clone() : new THREE.Color(0x8a939b))
          .lerp(new THREE.Color(0xffffff), 0.55),
        transparent: true,
        opacity: 0.065,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      ghosts.set(solid, ghost);
    }
    skin.push({ o, solid, ghost });
  });
  g.userData.skin = skin;
  const structure = p.userData.insideGroup || null;
  g.userData.cutaway = (on) => {
    for (const q of skin) q.o.material = on ? q.ghost : q.solid;
    if (structure) structure.visible = !!on;
  };
  g.userData.plane = p;
  g.userData.props = p.userData.props;
  g.userData.rack = p.userData.rack;
  g.userData.parts = p.userData.parts || [];
  g.userData.turrets = p.userData.turrets || [];
  return g;
}

// The nine machines, so they can be looked at and measured without a ship
// round them.
export { wildcat, dauntless, avenger, arado, kingfisher, besson };
export { zero, suisei, tenzan, jake };
export { airframe, wing, radial, inline, greenhouse, empennage, insignia,
  hinomaru, seaFloat };
// And the heavy squadrons, which are not flown off anything and so are asked
// for by name rather than by role.
export { heavyBomber, HEAVY, HEAVY_KINDS, bomb, layTurret };
