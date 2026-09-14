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
  // What she carries. A torpedo is a polished steel case with a dull grey
  // warhead on the end of it; a bomb is olive drab with a bright band round
  // the nose that says it is filled.
  steel: new THREE.MeshLambertMaterial({ color: 0x6e757c }),
  warhead: new THREE.MeshLambertMaterial({ color: 0x4a5058 }),
  bombBody: new THREE.MeshLambertMaterial({ color: 0x3d4438 }),
  bombBand: new THREE.MeshLambertMaterial({ color: 0xb0a253 }),
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
  box(m, P.white, r * 2, 0.03, r * 2, 0, 0, 0);
  box(m, P.black, r * 2.02, 0.036, r * 0.72, 0, 0.004, 0);
  box(m, P.black, r * 0.72, 0.036, r * 2.02, 0, 0.004, 0);
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
  list.push({ name, node, axis: o.axis || 'z', open: o.open || 0, fall: !!o.fall });
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
    const bl = new THREE.Group();
    bl.position.set(0, spin ? 0 : y, spin ? 0 : z + 1.02);
    bl.rotation.z = (i / blades) * Math.PI * 2 + 0.4;
    disc.add(bl);
    propBlade(bl, M.prop, span / 2, 0.30, 0.17, 0.62, 0.16);
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
  layers.forEach(([r, mat], i) => {
    // Half in, half out: the buried half is inside the skin where nothing can
    // see it, and what shows is a disc of paint a few millimetres proud.
    cyl(m, mat, r, r, 0.022 + i * 0.004, 0, i * 0.002, 0, 16);
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
  const dir = faceDir(up, x);
  const m = decal(p, x, y, z, dir, [[r, M.insignia]], fit);
  // The star is built out of five arms rather than drawn as a five-sided disc:
  // a pentagon at this range is a blob, and the shape is the only thing on the
  // aeroplane that says whose it is. It stands on the blue, not in it.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.2;
    box(m, M.star, r * 0.36, 0.042, r * 0.95,
      Math.sin(a) * r * 0.42, 0.019, Math.cos(a) * r * 0.42, a);
  }
  cyl(m, M.star, r * 0.32, r * 0.32, 0.042, 0, 0.019, 0, 10);
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
  for (let i = 0; i < blades; i++) {
    const b = new THREE.Group();
    b.rotation.z = (i / blades) * Math.PI * 2;
    disc.add(b);
    propBlade(b, M.prop, span * 0.5, 0.26, 0.15, 0.60, 0.14);
  }
  if (spin) p.userData.prop = disc;
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
  empennage(p, 1.5, 1.32, 3.9, 1.02, cl(-4.3) + 0.4, -4.0);
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
    balkenkreuz(w, s * 3.30, 0.13, -0.62, 0.52);
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
  empennage(p, 1.16, 1.02, 3.30, 0.80, cl(-3.5) + 0.30, -3.2);
  if (opts.gear !== false) {
    for (const s of [-1, 1]) mainGear(p, s, s * 1.30, 0.0, 0.96, 0.30, 0.06);
    tailGear(p, -3.95, 0.15, 0.9, 0.30);
  }
  box(p, M.planeTop, 0.06, 0.52, 0.06, 0, cl(0.2) + 1.06, 0.2);
  const wire = box(p, M.wire, 0.03, 0.03, 3.5, 0, cl(-1.5) + 1.02, -1.5);
  wire.rotation.x = -0.2;
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
  empennage(p, 1.14, 1.00, 3.40, 0.82, cl(-4.1) + 0.28, -3.8);
  if (opts.gear !== false) {
    for (const s of [-1, 1]) mainGear(p, s, s * 1.35, -0.22, 1.00, 0.30, 0.05);
    tailGear(p, -4.55, 0.15, 0.95, 0.30);
  }
  // The rear gunner's 7.7 mm on its ring, which folds down into the decking.
  const mg = cyl(p, M.gunDark, 0.035, 0.035, 0.7, 0, cl(-1.5) + 0.72, -1.75, 6);
  mg.rotation.x = -0.5;
  box(p, M.planeTop, 0.05, 0.46, 0.05, 0, cl(0.0) + 1.04, 0.0);
  const wire = box(p, M.wire, 0.03, 0.03, 4.0, 0, cl(-2.0) + 1.0, -2.0);
  wire.rotation.x = -0.18;
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
  empennage(p, 1.42, 1.20, 3.90, 0.98, cl(-4.5) + 0.34, -4.2);
  if (opts.gear !== false) {
    for (const s of [-1, 1]) mainGear(p, s, s * 1.55, 0.31, 1.30, 0.36, 0.05);
    tailGear(p, -5.00, 0.18, 1.1, 0.34);
  }
  // The rear gunner's 7.92 mm, and the tunnel gun under the sternpost.
  const mg = cyl(p, M.gunDark, 0.04, 0.04, 0.8, 0, cl(-2.1) + 0.94, -2.4, 6);
  mg.rotation.x = -0.45;
  cyl(p, M.gunDark, 0.035, 0.035, 0.6, 0, cl(-3.4) - 0.18, -3.6, 6)
    .rotation.x = 0.4;
  box(p, M.planeTop, 0.07, 0.58, 0.07, 0, cl(0.2) + 1.32, 0.2);
  const wire = box(p, M.wire, 0.03, 0.03, 4.4, 0, cl(-2.2) + 1.26, -2.2);
  wire.rotation.x = -0.18;
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
  empennage(p, 1.24, 1.06, 3.50, 0.86, cl() + 0.30, -4.0);
  const mg = cyl(p, M.gunDark, 0.035, 0.035, 0.7, 0, cl() + 0.80, -2.6, 6);
  mg.rotation.x = -0.45;
  box(p, M.planeTop, 0.06, 0.50, 0.06, 0, cl() + 1.06, 0.3);
  const wire = box(p, M.wire, 0.03, 0.03, 4.2, 0, cl() + 1.0, -1.9);
  wire.rotation.x = -0.16;
  return p;
}

// The nine machines, so they can be looked at and measured without a ship
// round them.
export { wildcat, dauntless, avenger, arado, kingfisher };
export { zero, suisei, tenzan, jake };
export { airframe, wing, radial, inline, greenhouse, empennage, insignia,
  hinomaru, seaFloat };
