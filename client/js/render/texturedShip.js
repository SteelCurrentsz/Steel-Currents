// One renderer for the ships drawn off the owner's whole-ship models by
// 全斗焕 (see build/textured-hull.mjs): her hull, painted and textured, as
// length-wise slices; every one of her mountings as the model drew it, on its
// seat, its barrels on a cradle that elevates; her banks of tubes on their
// turntables; her screws, which turn; and, inside her, her armour and her
// interior, fitted to her own lines. Each ship says which data module is hers
// and how she is armoured: see borgia.js.
//
// She is drawn in three surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate, her decks in planking, and the plates
// the model drew as single sheets from both sides, all over her own colours.
// Local frame, as everywhere else: +Z is the bow, +Y is up, y = 0 is the
// waterline.
import * as THREE from '../../../vendor/three.module.js';
import { arm } from './mounts.js';
import { fitTubes } from './tubes.js';
import { mergeStatic } from './merge.js';
import { dressShip, steelMap, woodMap, finish } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { lightMounts } from '../../../shared/sim.js';
import { cyl, strip, sheet } from './shipkit.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';

/**
 * A geometry's texture coordinates box-projected face by face, in metres: each
 * face takes the projection of the way it itself mostly looks -- down on a
 * deck, athwartships on her side, fore and aft on a bulkhead -- and a point
 * shared by faces that look different ways is drawn once for each. Projected
 * point by point instead, off each point's own normal, the faces of anything
 * round -- her barbettes, her bridge, her funnels, a gunhouse's cheeks -- have
 * corners either side of the line between two projections, and the plating
 * drawn over them smears into a sawtooth of light and dark faces.
 */
export function faceProjected(g) {
  const pos = g.attributes.position.array, nrm = g.attributes.normal.array;
  const col = g.attributes.color ? g.attributes.color.array : null;
  const idx = g.index.array;
  const nv = pos.length / 3;
  const P = Array.from(pos), N = Array.from(nrm), C = col ? Array.from(col) : null;
  const axis = new Int8Array(nv).fill(-1);
  const twin = new Map();
  const I = new Array(idx.length);
  const A = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nx = Math.abs(uy * vz - uz * vy), ny = Math.abs(uz * vx - ux * vz), nz = Math.abs(ux * vy - uy * vx);
    // As the fleet's projection reads it: up first, then athwartships.
    const ax = ny >= nx && ny >= nz ? 1 : nx >= nz ? 0 : 2;
    for (let k = 0; k < 3; k++) {
      const v = idx[t + k];
      if (axis[v] < 0) { axis[v] = ax; A[v] = ax; I[t + k] = v; continue; }
      if (axis[v] === ax) { I[t + k] = v; continue; }
      const key = v * 3 + ax;
      let w = twin.get(key);
      if (w === undefined) {
        w = P.length / 3;
        twin.set(key, w);
        P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        N.push(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]);
        if (C) C.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]);
        A[w] = ax;
      }
      I[t + k] = w;
    }
  }
  const n = P.length / 3;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const ax = A[i] ?? 1;
    if (ax === 1) { uv[i * 2] = x; uv[i * 2 + 1] = z; } else if (ax === 0) { uv[i * 2] = z; uv[i * 2 + 1] = y; } else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(P), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(N), 3));
  if (C) out.setAttribute('color', new THREE.BufferAttribute(Uint8Array.from(C), 3, true));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(n > 65535 ? Uint32Array.from(I) : Uint16Array.from(I), 1));
  out.userData = { ...g.userData, faceUv: true };
  g.dispose();
  return out;
}

let mats = null;
/** The three surfaces every one of these ships is drawn in, shared. */
export function texturedMaterials() {
  if (mats) return mats;
  const plate = steelMap();
  const planks = woodMap();
  mats = {
    plating: new THREE.MeshPhongMaterial({
      vertexColors: true, map: plate, specularMap: plate,
      specular: 0x3a4148, shininess: 30,
    }),
    deck: new THREE.MeshPhongMaterial({
      vertexColors: true, map: planks, specularMap: planks,
      specular: 0x16181c, shininess: 5,
    }),
    // What the model drew as single sheets, seen from both sides; and every
    // one of her guns, whose shields are the same.
    sheet: new THREE.MeshPhongMaterial({
      vertexColors: true, map: plate, specularMap: plate,
      specular: 0x3a4148, shininess: 30, side: THREE.DoubleSide,
    }),
  };
  finish(mats.plating);
  finish(mats.sheet);
  finish(mats.deck, 'wood');
  return mats;
}

const ARMOUR = new THREE.MeshLambertMaterial({ color: 0x4a5158 });

/** Box-projected texture coordinates, point by point in `root`'s frame, for whatever has none of its own. */
function projectRest(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3();
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.geometry.userData.faceUv) return;
    const geo = o.geometry, pos = geo.attributes.position, nor = geo.attributes.normal;
    if (!nor) return;
    m.multiplyMatrices(inv, o.matrixWorld);
    nm.getNormalMatrix(m);
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(m);
      n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      if (ay >= ax && ay >= az) { uv[i * 2] = p.x; uv[i * 2 + 1] = p.z; } else if (ax >= az) { uv[i * 2] = p.z; uv[i * 2 + 1] = p.y; } else { uv[i * 2] = p.x; uv[i * 2 + 1] = p.y; }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  });
}

/** mergeMoving, keeping each piece's own texture coordinates. */
function weldMoving(group) {
  const walk = (node) => {
    for (const child of node.children) {
      const gun = child.userData && child.userData.gunNode;
      if (gun) {
        if (gun !== child) mergeStatic(gun, null, { keepUv: true });
        mergeStatic(child, null, { keepUv: true });
        continue;
      }
      walk(child);
    }
  };
  walk(group);
}

/**
 * A ship off her data module `data` -- { HULL_B64, SURFACE, GUNS, MOUNTS,
 * LINES, SCREWS } as build/textured-hull.mjs writes them -- and her class
 * `id`. `armour`: { citadel: [z0, z1], deck, foot, barbette } -- her belt
 * from `foot` up to her armour deck at `deck` between the two ends of her
 * citadel, and a barbette of radius `barbette` under each turret. `sec` is
 * the piece her secondary mounts are drawn with where they do not say.
 */
export function texturedShip({ id, name, data: D, armour: A, sec: SEC = 'dp' }) {
  const CLS = SHIP_CLASSES[id];
  const LOA = CLS.hull.length;
  const BEAM = CLS.hull.beam;
  const SCULPT_LINES = D.LINES;
  const MOUNT_SEATS = D.MOUNTS;
  const surface = surfaceOf(D.SURFACE);
  let cached = null;
  const slices = () => (cached || (cached = decodeSlices(D.HULL_B64).map(faceProjected)));
  const guns = new Map();
  /** One of her guns as the model drew it, decoded once, in the frame of its mounting. */
  function gunPiece(kind) {
    if (!guns.has(kind)) {
      const p = D.GUNS[kind];
      guns.set(kind, {
        house: faceProjected(decodePiece(p.house)), guns: p.guns ? faceProjected(decodePiece(p.guns)) : null,
        trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof, bores: p.bores || null,
      });
    }
    return guns.get(kind);
  }
  function buildHull(g) {
    const m = texturedMaterials();
    for (const geo of slices()) g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }

  const L = SCULPT_LINES;
  const along = (z) => Math.max(0, Math.min(L.nz - 1.0001, (z - L.z0) / L.dz));
  const lerp = (arr, f) => {
    const i = Math.floor(f);
    const u = f - i;
    return arr[i] * (1 - u) + arr[Math.min(arr.length - 1, i + 1)] * u;
  };
  /** Her station at fraction t of her length, bow +1, as a z. */
  const zAt = (t) => (t * LOA) / 2;
  /** The bottom of her keel at station t. */
  function keelY(t) {
    const f = along(zAt(t));
    const i = Math.floor(f);
    const a = L.keel[i] > 50 ? L.keel[Math.min(L.nz - 1, i + 1)] : L.keel[i];
    const b = L.keel[Math.min(L.nz - 1, i + 1)] > 50 ? a : L.keel[Math.min(L.nz - 1, i + 1)];
    const u = f - i;
    return a * (1 - u) + b * u;
  }
  /** The deck over her insides at station t. */
  function deckOver(t) {
    return lerp(L.deck, along(zAt(t)));
  }
  /** How far out from her centreline her side is, at station t and height y. */
  function shellAt(t, y) {
    const f = along(zAt(t));
    const g = Math.max(0, Math.min(L.ny - 1.0001, (y - L.y0) / L.dy));
    const i = Math.floor(f);
    const j = Math.floor(g);
    const u = f - i;
    const v = g - j;
    const at = (a, b) => L.half[Math.min(L.nz - 1, a) * L.ny + Math.min(L.ny - 1, b)];
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v)
      + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
  }
  /** Her lines, for the interior and the tests. */
  const LINES = { loa: LOA, sheer: deckOver, keelY, shellAt, zAt };
  const INNER_BOTTOM = 0.15;
  const deckAt = (z) => surface.surfaceY(0, z);

  function sculpted(g, kind, x, y, z, rest, trainRate, label) {
    const piece = gunPiece(kind);
    const m = new THREE.Group();
    m.position.set(x, y, z);
    m.rotation.y = rest;
    m.userData.rest = 0;
    m.userData.dynamic = true;
    m.userData.mounting = true;
    m.userData.trainRate = trainRate;
    if (label) m.userData.name = label;
    // Drawn from both sides: a shield is a sheet seen from behind as often as
    // in front.
    m.add(new THREE.Mesh(piece.house, texturedMaterials().sheet));
    const cradle = new THREE.Group();
    cradle.position.set(...piece.trunnion);
    cradle.rotation.x = -piece.pitch;
    if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, texturedMaterials().sheet));
    m.add(cradle);
    arm(m, cradle, piece.muzzles);
    g.add(m);
    return m;
  }

  /** The seat the build measured for a mounting of her datasheet, by where it is. */
  function seatFor(list, x, z, what) {
    let best = null, bd = Infinity;
    for (const s of list || []) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best || bd > 0.6) throw new Error(`the ${name} has a ${what} at ${x}, ${z} her model does not`);
    return best;
  }

  function mainBattery(g) {
    const turrets = CLS.turrets.map((t) => {
      const s = seatFor(MOUNT_SEATS[t.piece || 'main'], t.x, t.z, 'turret');
      return sculpted(g, t.piece || 'main', s.x, s.y, s.z, t.angle, CLS.gun.traverse, t.name);
    });
    g.userData.turrets = turrets;
    return turrets;
  }

  const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);

  function mountings(g) {
    const sec = (CLS.secondary ? CLS.secondary.mounts : []).map((spec) => {
      const kind = spec.piece || SEC;
      const s = seatFor(MOUNT_SEATS[kind], spec.x, spec.z, `${CLS.secondary.caliber} mm`);
      const m = sculpted(g, kind, s.x, s.y, s.z, stowed(spec), CLS.secondary.traverse);
      m.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
      return m;
    });
    const aa = [];
    const lights = lightMounts(CLS);
    for (const gun of CLS.aa.guns) {
      const kind = gun.piece || (gun.role === 'dp' ? 'dp' : 'aa');
      for (const spec of gun.mounts) {
        const s = seatFor(MOUNT_SEATS[kind], spec.x, spec.z, `${gun.caliber} mm`);
        const a = sculpted(g, kind, s.x, s.y, s.z, stowed(spec), 0.8);
        a.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
        a.userData.stops = gun.elev || null;
        a.userData.lift = spec.lift || null;
        aa.push(a);
      }
    }
    if (aa.length !== lights.length) throw new Error(`the ${name} built a light battery her datasheet does not list`);
    const torp = CLS.torpedoes ? CLS.torpedoes.mounts.map((spec) => torpedoBank(g, spec, CLS.torpedoes.traverse)) : [];
    g.userData.secMounts = sec;
    g.userData.aaMounts = aa;
    g.userData.torpMounts = torp;
    return { sec, aa, torp };
  }

  /**
   * One of her banks of tubes, as the model drew it (see gunPiece): it trains
   * about its turntable, its tubes level, its muzzles the forward ends of its
   * tubes. Each bank is its own piece.
   */
  function torpedoBank(g, spec, trainRate) {
    if (spec.port) return torpedoPort(g, spec, trainRate);
    const i = MOUNT_SEATS.tubes.indexOf(seatFor(MOUNT_SEATS.tubes, spec.x, spec.z, 'bank of tubes'));
    const s = MOUNT_SEATS.tubes[i];
    const piece = gunPiece(`tubes${i}`);
    const m = new THREE.Group();
    m.position.set(s.x, s.y, s.z);
    m.rotation.y = stowed(spec);
    m.userData.rest = 0;
    m.userData.dynamic = true;
    m.userData.mounting = true;
    m.userData.name = `${spec.x > 0 ? 'port' : 'starboard'} tubes`;
    m.userData.trainRate = trainRate;
    m.add(new THREE.Mesh(piece.house, texturedMaterials().sheet));
    // Nothing elevates: the cradle is where the tubes' axes are, so that the
    // muzzles are read off the line the fish leave along.
    const cradle = new THREE.Group();
    cradle.position.set(...piece.trunnion);
    m.add(cradle);
    arm(m, cradle, piece.bores.map(([x, y, , zm]) => [x, y - piece.trunnion[1], zm]));
    m.userData.bores = piece.bores;
    g.add(m);
    return m;
  }

  /**
   * A bank the model draws shut in a torpedo room under her upper deck, its
   * fish going out through a door in her side (`spec.port`): the bank stays
   * in her hull where the model put it, and what trains and fires is the
   * launcher behind the door -- nothing to be seen of it but the fish, each
   * lying wholly inside her until it is fired and pushed out through her side.
   */
  function torpedoPort(g, spec, trainRate) {
    const L = spec.launch || CLS.torpedoes.launch;
    const m = new THREE.Group();
    m.position.set(spec.x, spec.my - (L.lift || 0), spec.z);
    m.rotation.y = stowed(spec);
    m.userData.rest = 0;
    m.userData.dynamic = true;
    m.userData.mounting = true;
    m.userData.name = `${spec.x > 0 ? 'port' : 'starboard'} tubes`;
    m.userData.trainRate = trainRate;
    const cradle = new THREE.Group();
    m.add(cradle);
    arm(m, cradle, L.lanes.map((x) => [x, 0, L.muzzle]));
    m.userData.bores = L.lanes.map((x) => [x, 0, 0, L.muzzle]);
    g.add(m);
    return m;
  }

  /**
   * Her armour, as structure inside the ship: none of it to be seen while her
   * plating is whole, all of it when a shell has opened her up -- her belt
   * from its foot up to her armour deck along her citadel, the armour deck at
   * its top, the bulkheads that close it at both ends, and the barbettes of
   * her turrets down to the armour deck.
   */
  function armour(g) {
    const inside = (o) => { o.userData.inside = true; return o; };
    const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
    const N = 64;
    const [z0, z1] = A.citadel;
    const belt = strip();
    for (let i = 0; i < N; i++) {
      const za = z0 + ((z1 - z0) * i) / N;
      const zb = z0 + ((z1 - z0) * (i + 1)) / N;
      for (const sgn of [-1, 1]) {
        belt.quad([sgn * at(za, A.deck, 1.0), A.deck, za], [sgn * at(za, A.foot, 1.0), A.foot, za],
          [sgn * at(zb, A.foot, 1.0), A.foot, zb], [sgn * at(zb, A.deck, 1.0), A.deck, zb],
          [-sgn, 0, 0]);
      }
    }
    inside(belt.mesh(g, ARMOUR));
    for (const up of [true, false]) {
      inside(sheet(g, ARMOUR, z0, z1, (z) => at(z, A.deck, 1.0), () => A.deck + (up ? 0.1 : -0.1), 48, up));
    }
    for (const z of [z0, z1]) {
      const bh = strip();
      const ys = [];
      for (let y = A.foot; y < A.deck; y += 1.0) ys.push(y);
      ys.push(A.deck);
      for (let i = 0; i < ys.length - 1; i++) {
        const wa = at(z, ys[i], 1.3), wb = at(z, ys[i + 1], 1.3);
        for (const face of [1, -1]) {
          bh.quad([-wa, ys[i], z], [wa, ys[i], z], [wb, ys[i + 1], z], [-wb, ys[i + 1], z], [0, 0, face]);
        }
      }
      inside(bh.mesh(g, ARMOUR));
    }
    for (const t of [...MOUNT_SEATS.main, ...(MOUNT_SEATS.main2 || [])]) {
      const top = deckOver((2 * t.z) / LOA) - 0.3;
      inside(cyl(g, ARMOUR, A.barbette, A.barbette, top - A.deck, t.x, (top + A.deck) / 2, t.z, 32));
    }
  }

  // Her screws, each as the model drew it, on the end of its shaft.
  let screwGeo = null;
  function screws(g) {
    if (!screwGeo) screwGeo = D.SCREWS.map((s) => faceProjected(decodePiece(s.piece)));
    D.SCREWS.forEach((s, i) => {
      const hub = new THREE.Group();
      hub.position.set(s.x, s.y, s.z);
      hub.userData.dynamic = true;
      hub.userData.screw = { hand: s.x < 0 ? -1 : 1 };
      hub.add(new THREE.Mesh(screwGeo[i], texturedMaterials().sheet));
      g.add(hub);
    });
  }

  const STATIC = [['hullModel', buildHull], ['armour', armour], ['screws', screws]];

  function build() {
    const g = new THREE.Group();
    for (const [, b] of STATIC) b(g);
    buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + INNER_BOTTOM, sheer: deckOver, zAt });
    projectRest(g);
    mergeStatic(g, bySection(LOA), { keepUv: true });
    const turrets = mainBattery(g);
    mountings(g);
    weldMoving(g);
    g.userData.classId = id;
    if (CLS.torpedoes) g.userData.step = fitTubes(g, g.userData.torpMounts, CLS.torpedoes);
    dressShip(g);
    return {
      group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
      secMounts: g.userData.secMounts || [],
      aaMounts: g.userData.aaMounts || [],
      torpMounts: g.userData.torpMounts || [],
    };
  }

  /** Every piece of her and where it sits, for the tests. */
  function parts() {
    const out = [];
    const builders = [...STATIC, ['mainBattery', mainBattery], ['mountings', mountings]];
    for (const [nm, b] of builders) {
      const g = new THREE.Group();
      b(g);
      g.updateMatrixWorld(true);
      g.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        let moving = false;
        for (let n = o; n; n = n.parent) if (n.userData && n.userData.dynamic) { moving = true; break; }
        o.geometry.computeBoundingBox();
        const lb = o.geometry.boundingBox;
        const bb = lb.clone().applyMatrix4(o.matrixWorld);
        out.push({
          from: nm, min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z],
          size: [lb.max.x - lb.min.x, lb.max.y - lb.min.y, lb.max.z - lb.min.z], moving,
        });
      });
    }
    return out;
  }

  return {
    LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS, SCULPT_LINES,
    surfaceY: surface.surfaceY, seatY: surface.seatY, gunPiece, buildHull, build, parts,
  };
}
