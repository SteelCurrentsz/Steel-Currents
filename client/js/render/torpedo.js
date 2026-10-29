// The torpedo.
//
// A torpedo used to be one grey shape for every navy, running with its back
// awash and riding every wave like a cork, with a rope of white water laid out
// behind it. None of that is what a torpedo was. Each navy's was its own
// weapon -- a Fletcher's Mk 15 and a Kagero's Type 93 are a metre and a half
// and nearly a ton apart, and the Mk 13 an Avenger dropped looks like neither
// -- and every one of them ran at the depth it was set to, under the sea and
// not on it.
//
// So each is drawn as itself here, to its own drawings: its own length and
// diameter, the shape of its head, the joints between warhead, air flask and
// afterbody, its guide stud and its starting lever, its tail cone, fins and
// rudders, and its own pair of contra-rotating screws. And it runs at its
// depth: a fixed distance under the deepest trough the sea is making, so no
// wave ever uncovers it and none ever lifts it.

import * as THREE from '../../../vendor/three.module.js';

/**
 * The torpedoes, each to its own drawings. Length and radius in metres.
 *
 * `nose` is the shape of the head: `round` a hemisphere, `ogive` a long
 * pointed head, `blunt` a flat face with a rounded edge. `fin` is how far the
 * fins stand out from the axis as a share of the radius -- a fish fired from a
 * tube carries them inside its own diameter, one dropped from an aeroplane
 * does not have to -- and `ring` puts the shroud round them that the American
 * aerial fish carried. `blades` is the screws, front and back. `stud` is the
 * guide stud a tube-launched fish rides its tube on.
 */
export const TORPEDO_KINDS = {
  // The Fletcher's. Steam-driven, 21 inches across, and her warhead painted
  // dark against a bright steel body.
  mk15: {
    len: 7.32, r: 0.267, nose: 'round', head: 0.27, flask: 0.36, cone: 4.2, fin: 0.98,
    blades: [4, 4], stud: true,
    paint: { head: 0x34393f, flask: 0x8c949b, after: 0x7c848b, tail: 0x8a6c42, joint: 0x2a2e33, screw: 0xb48e55 },
  },
  // The Long Lance: 61 cm, nine metres, and black from end to end -- a long
  // pointed head and slight fins on a very long body.
  type93: {
    len: 9.0, r: 0.305, nose: 'ogive', head: 0.2, flask: 0.42, cone: 4.6, fin: 0.9,
    blades: [4, 4], stud: true,
    paint: { head: 0x26282b, flask: 0x1d1f22, after: 0x202326, tail: 0x2a2c2f, joint: 0x6d2a24, screw: 0xc39a52 },
  },
  // The German G7a: a blunt head, a short tail and a dull green warhead.
  g7a: {
    len: 7.18, r: 0.267, nose: 'blunt', head: 0.24, flask: 0.33, cone: 3.6, fin: 0.98,
    blades: [4, 4], stud: true, pistol: true,
    paint: { head: 0x47503f, flask: 0x9aa0a4, after: 0x8a9094, tail: 0x6f7478, joint: 0x2f3234, screw: 0xa98653 },
  },
  // The G7e: the same tube and the same length, but a battery in place of the
  // air flask -- a rounder head and a smooth, light steel body.
  g7e: {
    len: 7.16, r: 0.267, nose: 'round', head: 0.24, flask: 0.42, cone: 3.4, fin: 0.98,
    blades: [3, 3], stud: true, pistol: true,
    paint: { head: 0x5a3330, flask: 0xb3b8bb, after: 0xa7acaf, tail: 0x8e9397, joint: 0x3a3d40, screw: 0x9aa1a6 },
  },
  // Rodney's 24.5-inch: the biggest torpedo any battleship carried, and
  // enriched with oxygen to reach.
  mk1: {
    len: 8.15, r: 0.311, nose: 'ogive', head: 0.24, flask: 0.38, cone: 4.0, fin: 0.96,
    blades: [4, 4], stud: true,
    paint: { head: 0x2f3337, flask: 0x6f7378, after: 0x656a6f, tail: 0x5b5f63, joint: 0x8a6b3a, screw: 0xb38b4f },
  },
  // The Surcouf's 55 cm 1924V: long, a round head and an olive warhead.
  l3: {
    len: 8.28, r: 0.275, nose: 'round', head: 0.25, flask: 0.38, cone: 4.0, fin: 0.98,
    blades: [4, 4], stud: true,
    paint: { head: 0x4a4f3c, flask: 0x8b8f86, after: 0x7e827a, tail: 0x6b6f68, joint: 0x2c2e29, screw: 0xae8a54 },
  },
  // The Surcouf's 40 cm 1926, out of the outer tubes of her triples: short
  // and thin beside the 55 cm on the centre of the mount.
  mle26: {
    len: 5.15, r: 0.2, nose: 'round', head: 0.26, flask: 0.36, cone: 4.0, fin: 0.98,
    blades: [3, 3], stud: true,
    paint: { head: 0x3f4536, flask: 0x969a90, after: 0x898d84, tail: 0x74786f, joint: 0x2c2e29, screw: 0xae8a54 },
  },
  // The Avenger's Mk 13: short and fat, and a ring round its tail that held
  // it straight through the water once its wooden drop gear had gone.
  mk13: {
    aerial: true,
    len: 4.09, r: 0.285, nose: 'blunt', head: 0.33, flask: 0.3, cone: 3.0, fin: 1.32, ring: true,
    blades: [4, 4], pistol: true,
    paint: { head: 0x2d3135, flask: 0x7a8187, after: 0x6f767c, tail: 0x5f666c, joint: 0x9a7a3c, screw: 0xb48e55, ring: 0x6a7076 },
  },
  // The Type 91: slender, 45 cm, with big fins and a stabiliser on each to
  // hold it level after the long drop. Its wooden air tail is shed on entry.
  type91: {
    aerial: true,
    len: 5.27, r: 0.225, nose: 'round', head: 0.27, flask: 0.33, cone: 4.2, fin: 1.7, plates: true,
    blades: [4, 4],
    paint: { head: 0x35352f, flask: 0x2a2d2f, after: 0x2e3133, tail: 0x34373a, joint: 0x7a6a3a, screw: 0xbe9750 },
  },
  // The Luftwaffe's F5b: 45 cm too, but light grey with a pointed head.
  f5b: {
    aerial: true,
    len: 5.46, r: 0.225, nose: 'ogive', head: 0.25, flask: 0.34, cone: 3.8, fin: 1.45,
    blades: [4, 4],
    paint: { head: 0x4c5257, flask: 0xa8adb1, after: 0x9ca1a5, tail: 0x8d9296, joint: 0x2f3235, screw: 0xa5824f },
  },
  // The Swordfish's 18-inch Mk XII.
  mk12: {
    aerial: true,
    len: 4.95, r: 0.229, nose: 'round', head: 0.28, flask: 0.34, cone: 3.8, fin: 1.4,
    blades: [4, 4],
    paint: { head: 0x3a3f36, flask: 0x8f9592, after: 0x848a87, tail: 0x767c79, joint: 0x2b2e2a, screw: 0xb08b52 },
  },
};

const DEFAULT_KIND = 'mk15';
const kindOf = (k) => (TORPEDO_KINDS[k] ? k : DEFAULT_KIND);

// How deep a fish runs below the bottom of the deepest trough the sea is
// making, and the least it runs at in a calm. A torpedo set shallow for a
// destroyer ran at three or four metres.
const RUN_DEPTH = 3.2;
const UNDER_TROUGH = 1.4;
// From the splash to its set depth: a fish goes in, dives, and levels off.
const DIVE_TIME = 1.8;
const ENTRY_DEPTH = 0.7;
// How long a fish newly in the water waits for its own to leave the tube.
const HOLD = 0.8;

// --------------------------------------------------------------- building --

const tmpColor = new THREE.Color();

/** A geometry as flat triangles in one colour, ready to be put with others. */
function painted(geo, color, matrix = null) {
  if (matrix) geo.applyMatrix4(matrix);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const flat = geo.index ? geo.toNonIndexed() : geo;
  if (flat !== geo) geo.dispose();
  tmpColor.setHex(color);
  const n = flat.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = tmpColor.r;
    col[i * 3 + 1] = tmpColor.g;
    col[i * 3 + 2] = tmpColor.b;
  }
  return { pos: flat.attributes.position.array, nrm: flat.attributes.normal.array, col };
}

/** Put painted parts together into one geometry. */
function merged(parts) {
  const total = parts.reduce((a, p) => a + p.pos.length, 0);
  const pos = new Float32Array(total);
  const nrm = new Float32Array(total);
  const col = new Float32Array(total);
  let at = 0;
  for (const p of parts) {
    pos.set(p.pos, at);
    nrm.set(p.nrm, at);
    col.set(p.col, at);
    at += p.pos.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

/**
 * Turn a profile -- `[radius, z]` pairs, tail first -- about the fish's axis.
 * A lathe turns about Y; laid down, its +Y is the fish's +Z, nose first.
 */
function lathe(profile, seg = 24) {
  const g = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(Math.max(r, 1e-4), z)), seg);
  g.rotateX(Math.PI / 2);
  return g;
}

/** The radius of the case `d` metres aft of the tip of the nose. */
function radiusAt(S, d) {
  const R = S.r;
  const L = caseLen(S);
  const nose = noseLength(S);
  const coneLen = R * S.cone;
  if (d <= 0) return 0;
  if (d < nose) {
    const u = d / nose;
    if (S.nose === 'ogive') {
      // A tangent ogive: pointed, and meeting the body without a step.
      const rho = (R * R + nose * nose) / (2 * R);
      const x = nose - d;
      return Math.sqrt(Math.max(0, rho * rho - x * x)) - (rho - R);
    }
    if (S.nose === 'blunt') {
      // A flat face a little over half the diameter, rounded off to the body.
      const face = 0.55;
      return R * (face + (1 - face) * Math.sqrt(1 - (1 - u) * (1 - u)));
    }
    return R * Math.sqrt(1 - (1 - u) * (1 - u));
  }
  const fromTail = L - d;
  if (fromTail < coneLen) {
    const u = 1 - fromTail / coneLen;
    return R - (R - R * 0.3) * Math.pow(u, 1.7);
  }
  return R;
}

// The case alone: `len` is the torpedo overall, pistol to the cap past her
// after screw, as the drawings give it.
function caseLen(S) { return S.len - 0.5; }

function noseLength(S) {
  if (S.nose === 'ogive') return S.r * 2.8;
  if (S.nose === 'blunt') return S.r * 0.5;
  return S.r;
}

/** A profile of the case from `d0` to `d1` metres aft of the nose, tail first. */
function caseProfile(S, d0, d1, lift = 0) {
  const nose = noseLength(S);
  const coneAt = caseLen(S) - S.r * S.cone;
  const ds = new Set([d0, d1]);
  // Fine where the case curves, two points where it does not.
  for (let i = 0; i <= 18; i++) ds.add(nose * (i / 18));
  for (let i = 0; i <= 14; i++) ds.add(coneAt + (caseLen(S) - coneAt) * (i / 14));
  const list = [...ds].filter((d) => d >= d0 - 1e-6 && d <= d1 + 1e-6).sort((a, b) => b - a);
  const tip = caseLen(S) / 2;
  return list.map((d) => [radiusAt(S, d) + lift, tip - d]);
}

/**
 * A flat plate -- a fin, a rudder, a stabiliser -- standing out from the axis
 * at angle `a`: a trapezoid in (along the fish, out from it), `t` thick.
 * `hinge` and `swing` turn it about its own leading edge, for a rudder laid
 * over a few degrees.
 */
function plate(a, [z0, z1, zt0, zt1], rIn, rOut, t, swing = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(z0, rIn);
  shape.lineTo(z1, rIn);
  shape.lineTo(zt1, rOut);
  shape.lineTo(zt0, rOut);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  if (swing) {
    const hinge = Math.max(z0, zt0);
    g.translate(-hinge, 0, 0);
    g.rotateY(swing);
    g.translate(hinge, 0, 0);
  }
  // Shape x is along the fish, y out from it, z across the plate.
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(Math.cos(a), Math.sin(a), 0),
    new THREE.Vector3(-Math.sin(a), Math.cos(a), 0),
  );
  g.applyMatrix4(m);
  return g;
}

/** A small block, centred at (x, y, z). */
function block(w, h, l, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, l);
  g.translate(x, y, z);
  return g;
}

/**
 * The case of one torpedo, with everything on it that does not turn: warhead,
 * air flask, afterbody and tail cone, the joints between them, the pistol, the
 * guide stud and the starting lever, the fins and rudders, and the ring.
 * Pointing down +Z, centred on its own middle.
 */
export function torpedoGeometry(kind = DEFAULT_KIND) {
  const S = TORPEDO_KINDS[kindOf(kind)];
  const P = S.paint;
  const L = caseLen(S);
  const R = S.r;
  const tip = L / 2;
  const coneAt = L - R * S.cone;
  const head = L * S.head;
  const flask = head + L * S.flask;
  const parts = [];

  // The case, in its four lengths and their own paint.
  parts.push(painted(lathe(caseProfile(S, 0, head)), P.head));
  parts.push(painted(lathe(caseProfile(S, head, flask)), P.flask));
  parts.push(painted(lathe(caseProfile(S, flask, coneAt)), P.after));
  parts.push(painted(lathe(caseProfile(S, coneAt, L)), P.tail));
  // The joints: a band proud of the case where each length is bolted to the
  // next.
  for (const d of [head, flask, coneAt]) {
    const r = radiusAt(S, d) + 0.006;
    parts.push(painted(lathe([[r * 0.98, tip - d - 0.03], [r, tip - d - 0.02], [r, tip - d + 0.02], [r * 0.98, tip - d + 0.03]]), P.joint));
  }
  // The exercise band a third of the way down the flask: the colour each navy
  // marked its fish with.
  {
    const d = head + (flask - head) * 0.12;
    parts.push(painted(lathe([[R + 0.002, tip - d - 0.06], [R + 0.002, tip - d + 0.06]]), P.joint));
  }

  // The pistol in the nose, where the warhead is struck.
  if (S.pistol || S.nose !== 'ogive') {
    const r = S.nose === 'blunt' ? R * 0.2 : R * 0.12;
    parts.push(painted(lathe([[r, tip - 0.01], [r * 0.9, tip + 0.06], [r * 0.4, tip + 0.08], [0, tip + 0.085]], 14), P.joint));
  }
  // Inspection plates and filling plugs along the flask.
  for (const f of [0.3, 0.55, 0.8]) {
    const z = tip - (head + (flask - head) * f);
    parts.push(painted(block(0.12, 0.012, 0.18, 0, R + 0.002, z), P.joint));
  }

  // The guide stud a tube fish rides its tube on, and the starting lever that
  // the tube trips as she goes -- both on her back.
  if (S.stud) {
    const z = tip - (head + (flask - head) * 0.5);
    parts.push(painted(block(0.05, 0.05, 0.3, 0, R + 0.022, z), P.joint));
    parts.push(painted(block(0.07, 0.015, 0.36, 0, R + 0.05, z), P.joint));
    const zs = tip - (flask + (coneAt - flask) * 0.35);
    parts.push(painted(block(0.04, 0.09, 0.05, 0, R + 0.04, zs), P.joint));
  }

  // The fins: a cross, upright and level, along the tail cone. A tube fish's
  // stay within its own diameter; an aerial fish's stand out.
  const zEnd = -tip;
  const finOut = R * S.fin;
  const finLen = R * S.cone * 0.62;
  const finZ0 = zEnd + 0.12;
  const finZ1 = finZ0 + finLen;
  // The root on the case where it is thinnest, at the after end of the fin;
  // forward of that it is buried in the cone.
  const finIn = radiusAt(S, L - 0.12) * 0.9;
  const finT = R * 0.07;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    // Fixed fin, swept at the leading edge.
    parts.push(painted(plate(a, [finZ0 + finLen * 0.28, finZ1, finZ0 + finLen * 0.28, finZ0 + finLen * 0.55], finIn, finOut, finT), P.tail));
    // The rudder or the elevator behind it, laid over a few degrees.
    const swing = i % 2 === 0 ? 0.06 : -0.1;
    parts.push(painted(plate(a, [finZ0, finZ0 + finLen * 0.28, finZ0, finZ0 + finLen * 0.28], finIn, finOut * 0.96, finT * 0.8, swing), P.after));
    // The Type 91's stabiliser plates, across the tips of its big fins.
    if (S.plates) {
      const g = block(finOut * 0.42, finT * 0.8, finLen * 0.5, 0, 0, finZ0 + finLen * 0.6);
      g.translate(0, finOut * 0.98, 0);
      g.rotateZ(a - Math.PI / 2);
      parts.push(painted(g, P.tail));
    }
  }
  // The Mk 13's ring, round the tips of the fins.
  if (S.ring) {
    const r0 = finOut * 0.97;
    const r1 = finOut * 1.03;
    const z0 = finZ0 + finLen * 0.05;
    const z1 = finZ0 + finLen * 0.62;
    parts.push(painted(lathe([[r0, z0], [r1, z0 + 0.02], [r1, z1 - 0.03], [r0, z1], [r0 * 0.995, z0]], 28), P.ring));
  }

  // The screw shafts: a cone out of the tail to the after screw and a cap past
  // it.
  const hub = R * 0.3;
  parts.push(painted(lathe([[0.001, zEnd - 0.42], [hub * 0.35, zEnd - 0.4], [hub * 0.55, zEnd - 0.3], [hub * 0.7, zEnd - 0.12], [hub, zEnd]], 14), P.joint));

  return merged(parts);
}

/**
 * One of the two screws, as blades round a boss at the axis. The two turn
 * opposite ways -- that is what keeps the fish from rolling -- and the after
 * one is pitched the other way to match.
 */
export function screwGeometry(kind = DEFAULT_KIND, which = 0) {
  const S = TORPEDO_KINDS[kindOf(kind)];
  const R = S.r;
  const n = S.blades[which];
  const z = -caseLen(S) / 2 - (which === 0 ? 0.1 : 0.3);
  const span = R * (which === 0 ? 0.88 : 0.8);
  const chord = R * 0.42;
  const parts = [];
  for (let b = 0; b < n; b++) {
    const a = (b / n) * Math.PI * 2 + (which ? Math.PI / n : 0);
    const g = new THREE.BoxGeometry(chord, span - R * 0.12, 0.014, 2, 3, 1);
    // Twisted: steep at the root and flatter at the tip, as a screw is.
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const u = (y + (span - R * 0.12) / 2) / (span - R * 0.12);
      const pitch = (which ? -1 : 1) * (0.95 - u * 0.45);
      const x = p.getX(i) * (1 - u * 0.25);
      const zz = p.getZ(i);
      p.setXYZ(i, x * Math.cos(pitch) - zz * Math.sin(pitch), y, x * Math.sin(pitch) + zz * Math.cos(pitch));
    }
    g.computeVertexNormals();
    g.translate(0, R * 0.12 + (span - R * 0.12) / 2, 0);
    // Laid round the boss, the chord across the shaft and pitched along it.
    g.rotateZ(a);
    g.translate(0, 0, z);
    parts.push(painted(g, S.paint.screw));
  }
  const boss = new THREE.CylinderGeometry(R * 0.14, R * 0.16, 0.12, 12);
  boss.rotateX(Math.PI / 2);
  boss.translate(0, 0, z);
  parts.push(painted(boss, S.paint.screw));
  return merged(parts);
}

/**
 * A whole fish, screws and all, stretched to `len` by `r` -- for a bank of
 * tubes on a ship's model, which has to fit the tubes her sculpt has.
 */
const fitted = new Map();
export function fishGeometry(kind, len = null, r = null) {
  const k = kindOf(kind);
  const key = `${k}/${len}/${r}`;
  if (fitted.has(key)) return fitted.get(key);
  const S = TORPEDO_KINDS[k];
  const parts = [torpedoGeometry(k), screwGeometry(k, 0), screwGeometry(k, 1)];
  const all = merged(parts.map((g) => ({
    pos: g.attributes.position.array, nrm: g.attributes.normal.array, col: g.attributes.color.array,
  })));
  parts.forEach((g) => g.dispose());
  if (len && r) {
    const kr = r / S.r;
    all.scale(kr, kr, len / S.len);
  }
  fitted.set(key, all);
  return all;
}

/** The paint a torpedo is drawn in: its own colours, a little sheen of wet steel. */
export function torpedoMaterial() {
  return new THREE.MeshPhongMaterial({
    vertexColors: true, shininess: 48, specular: 0x444a50,
  });
}

// ----------------------------------------------------------------- the fish --

/**
 * Every torpedo in the water.
 *
 * One batch for each kind of fish that is running -- the case, and the two
 * screws, each turning its own way -- built the first time one of that kind
 * goes in, so a battle with nothing but Mk 15s in it pays for Mk 15s.
 */
export class Torpedoes {
  constructor(scene, ocean = null, max = 48) {
    this.scene = scene;
    this.ocean = ocean;
    this.max = max;
    this.kinds = new Map();   // kind -> { body, fore, aft, n }
    this.runs = new Map();    // id -> { born, y0, y }
    // Where fish have just left her tubes, for the running torpedo to be
    // picked up from: see seed.
    this.seeds = [];
    this.clock = 0;
    this.mat = torpedoMaterial();
    this.dummy = new THREE.Object3D();
    this.dummy.rotation.order = 'YXZ';
  }

  batch(kind) {
    let b = this.kinds.get(kind);
    if (b) return b;
    const make = (geo) => {
      const m = new THREE.InstancedMesh(geo, this.mat, this.max);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    b = {
      body: make(torpedoGeometry(kind)),
      fore: make(screwGeometry(kind, 0)),
      aft: make(screwGeometry(kind, 1)),
      n: 0,
    };
    this.kinds.set(kind, b);
    return b;
  }

  /**
   * How deep a fish runs, for the sea as it is: a fixed depth, under the
   * bottom of the deepest trough this sea can make. It does not follow the
   * waves -- a torpedo's depth engine holds it to its setting whatever the
   * surface is doing -- and none of them ever uncovers it.
   */
  runDepth() {
    const deep = this.ocean && this.ocean.deepest ? this.ocean.deepest() : 0;
    return Math.max(RUN_DEPTH, deep + UNDER_TROUGH);
  }

  /**
   * A fish has just gone into the sea at (x, y, z) off a ship's tubes: the
   * torpedo the simulation is running from there starts at that depth -- the
   * surface, for one dropped over her side, or her tube's depth for one pushed
   * out under the water -- and goes to its own.
   */
  seed(x, y, z) {
    this.seeds.push({ x, y: Math.min(y, -0.3), z, t: this.clock });
  }

  /** Where torpedo `id` is running, as a height: for the camera that rides one. */
  depthOf(id) {
    const run = this.runs.get(id);
    return run ? run.y : -this.runDepth();
  }

  /**
   * Take this frame's torpedoes: `[{ i, x, z, h, k }]` in world coordinates.
   */
  update(dt, list) {
    this.clock += dt;
    for (const b of this.kinds.values()) b.n = 0;
    const depth = this.runDepth();
    const live = new Set();
    const d = this.dummy;
    for (const tp of list) {
      // Not in the water yet: her model is drawing it leaving the tube, or the
      // aeroplane's is drawing it falling.
      if (tp.a) continue;
      live.add(tp.i);
      const kind = kindOf(tp.k);
      let run = this.runs.get(tp.i);
      if (!run) {
        run = { born: this.clock, y0: -ENTRY_DEPTH, y: -ENTRY_DEPTH, seeded: false };
        this.runs.set(tp.i, run);
      }
      if (!run.seeded) {
        // Picked up from where it left her tube. The simulation and her model
        // do not hand over on exactly the same frame, so a fish is held back
        // for a moment for its own to come out of the tube, rather than drawn
        // twice -- once in the tube, once in the sea.
        let best = -1;
        let bestD = 30;
        this.seeds.forEach((sd, k) => {
          const d = Math.hypot(sd.x - tp.x, sd.z - tp.z);
          if (d < bestD) { bestD = d; best = k; }
        });
        if (best >= 0) {
          run.y0 = run.y = this.seeds[best].y;
          run.born = this.clock;
          run.seeded = true;
          this.seeds.splice(best, 1);
        } else if (!TORPEDO_KINDS[kind].aerial && this.clock - run.born < HOLD) {
          // (An aeroplane's fish has no tube: it is in the sea the moment it
          // stops falling.)
          continue;
        } else {
          run.seeded = true;
          run.born = this.clock;
        }
      }
      const b = this.batch(kind);
      if (b.n >= this.max) continue;
      // From where she went in to her set depth, and level there; once she
      // has it she holds it.
      const u = Math.min(1, (this.clock - run.born) / DIVE_TIME);
      const ease = u * u * (3 - 2 * u);
      run.y = run.y0 + (-depth - run.y0) * ease;
      const pitch = u < 1 ? Math.sin(u * Math.PI) * 0.12 * Math.sign(run.y0 + depth) : 0;
      d.position.set(tp.x, run.y, tp.z);
      d.scale.setScalar(1);
      d.rotation.set(pitch, tp.h, 0);
      d.updateMatrix();
      b.body.setMatrixAt(b.n, d.matrix);
      // The screws, contra-rotating. At several hundred revolutions a minute
      // nobody can see a blade, so they turn slowly enough to read.
      d.rotation.set(pitch, tp.h, this.clock * 11);
      d.updateMatrix();
      b.fore.setMatrixAt(b.n, d.matrix);
      d.rotation.set(pitch, tp.h, -this.clock * 11);
      d.updateMatrix();
      b.aft.setMatrixAt(b.n, d.matrix);
      b.n++;
    }
    for (const id of this.runs.keys()) if (!live.has(id)) this.runs.delete(id);
    // A seed nobody picked up -- a fish this client is not being shown -- is
    // forgotten after a few seconds.
    this.seeds = this.seeds.filter((s) => this.clock - s.t < 4);
    for (const b of this.kinds.values()) {
      for (const m of [b.body, b.fore, b.aft]) {
        m.count = b.n;
        m.visible = b.n > 0;
        if (b.n > 0) m.instanceMatrix.needsUpdate = true;
      }
    }
  }

  dispose() {
    for (const b of this.kinds.values()) {
      for (const m of [b.body, b.fore, b.aft]) {
        this.scene.remove(m);
        m.geometry.dispose();
      }
    }
    this.kinds.clear();
    this.mat.dispose();
  }
}
