// An aircraft carrier off one of the owner's whole-ship models, as
// build/kriss-hull.mjs cuts it with its `carrier` option: her hull, island and
// galleries one painted mesh with her flight deck taken up and its outline
// kept, and her guns in the frame of their own mountings. What the Hornet's
// module (hornet.js) does for her, done here for any of them -- the Essex and
// the Lexington -- off a description of each:
//
//   * her runway laid afresh over the outline of her flight deck, with her
//     lift wells cut through it -- on the centreline, or out at her deck edge,
//     where a lift runs on the outside of her hull (`x` off the centreline);
//   * her lifts, which run: idle each on its own slow round, and at a launch
//     the after one brings the aeroplane up out of her hangar;
//   * her hangar under her flight deck, and her air group struck below in it;
//   * her guns, each the model's own mounting nearest where her datasheet
//     stands one;
//   * her deck evolution: the aeroplane up the after lift, taxied to the spot,
//     run up against the brakes and flown off over the bow, off the integrated
//     launch of her own type (see deckplane.js); and coming home, a wire over
//     her round-down and the after lift taking her below;
//   * her armour and her insides, fitted to her own lines.
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, y = 0 is the
// waterline.
import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip, steelMap, woodMap, finish } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { arm } from './mounts.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { DECK_RUN, lightMounts } from '../../../shared/sim.js';
import { box, cyl, strip, sheet } from './shipkit.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { hellcat, sbd, tbd, tbf, wildcat } from './planekit.js';
import { HELLCAT } from './hellcatModel.js';
import { DAUNTLESS } from './dauntlessModel.js';
import { DEVASTATOR } from './devastatorModel.js';
import { AVENGER } from './avengerModel.js';
import { engineStart } from './deckengine.js';
import { propBlur, propRate, deckClock, deckProfiles, rowSpeed, recoveryAt } from './deckplane.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = (k) => { const c = clamp(k, 0, 1); return c * c * (3 - 2 * c); };

/**
 * Each type she can fly, as it is built: half its span spread and folded,
 * whether it folds, and where its exhaust is (off its own model, once the
 * aircraft are loaded).
 */
const TYPES = {
  hellcat: { spread: 6.53, folded: 2.95, build: (g, x, y, z, ry, f, o) => hellcat(g, x, y, z, ry, f, o), exhaust: () => HELLCAT && HELLCAT.exhaust },
  wildcat: { spread: 5.8, folded: 5.8, build: (g, x, y, z, ry, f, o) => wildcat(g, x, y, z, ry, false, o), exhaust: () => HELLCAT && HELLCAT.exhaust },
  dauntless: { spread: 6.33, folded: 6.33, build: (g, x, y, z, ry, f, o) => sbd(g, x, y, z, ry, false, o), exhaust: () => DAUNTLESS && DAUNTLESS.exhaust },
  devastator: { spread: 7.62, folded: 4.1, build: (g, x, y, z, ry, f, o) => tbd(g, x, y, z, ry, f, false, o), exhaust: () => DEVASTATOR && DEVASTATOR.exhaust },
  avenger: { spread: 8.3, folded: 2.9, build: (g, x, y, z, ry, f, o) => tbf(g, x, y, z, ry, f, false, o), exhaust: () => AVENGER && AVENGER.exhaust },
};

/**
 * A carrier. `id` her class; `data` her hull data module; `lifts` her lifts,
 * `{ z, x?, hw, hd, ch }`, the after one last; `hangar` `{ y, z: [z0, z1],
 * hw }`; `citadel` `{ z: [z0, z1], deck, top, foot }`; `paints` for what is
 * built here.
 */
export function carrier({ id, data: D, lifts: LIFTS, hangar: H, citadel: CIT, paints = {} }) {
  const CLS = SHIP_CLASSES[id];
  const LOA = CLS.hull.length;
  const BEAM = CLS.hull.beam;
  const KINDS = CLS.planes.types;
  const P = {
    steel: 0x323f56, steelDark: 0x2a3343, deckSteel: 0x474e56, gunDark: 0x2a3138, cave: 0x14181c,
    armour: 0x4a5158, stripe: 0xd4d0c2, wire: 0x2a2d30, hangar: 0x8a9096, canvas: 0x6b6759, ...paints,
  };
  const MATS = {};
  const M = new Proxy({}, { get: (_, k) => { if (!MATS[k]) MATS[k] = new THREE.MeshLambertMaterial({ color: P[k] ?? P.steel }); return MATS[k]; } });

  const surface = surfaceOf(D.SURFACE);
  let mats = null;
  function materials() {
    if (mats) return mats;
    const plate = steelMap();
    const planks = woodMap();
    mats = {
      plating: new THREE.MeshPhongMaterial({ vertexColors: true, map: plate, specularMap: plate, specular: 0x3a4148, shininess: 30, side: THREE.DoubleSide }),
      planked: new THREE.MeshPhongMaterial({ vertexColors: true, map: planks, specularMap: planks, specular: 0x16181c, shininess: 5, side: THREE.DoubleSide }),
      sheet: new THREE.MeshPhongMaterial({ vertexColors: true, map: plate, specularMap: plate, specular: 0x3a4148, shininess: 30, side: THREE.DoubleSide }),
      deck: new THREE.MeshPhongMaterial({ color: 0x3e4856, map: planks, specularMap: planks, specular: 0x16181c, shininess: 5 }),
    };
    finish(mats.plating); finish(mats.sheet); finish(mats.planked, 'wood'); finish(mats.deck, 'wood');
    return mats;
  }
  let slicesCache = null;
  function hullModel(g) {
    if (!slicesCache) slicesCache = decodeSlices(D.HULL_B64);
    const m = materials();
    for (const geo of slicesCache) g.add(new THREE.Mesh(geo, [m.plating, m.planked, m.sheet][geo.userData.surface] || m.plating));
  }
  const guns = new Map();
  function gunPiece(kind, ix = -1) {
    // Each mounting as her model draws it, where it has its own piece.
    const own = ix >= 0 && D.GUNS[kind] && D.GUNS[kind].each && D.GUNS[kind].each[ix];
    const key = own ? `${kind}#${ix}` : kind;
    if (!guns.has(key)) {
      const p = own || D.GUNS[kind];
      guns.set(key, { house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null, trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof });
    }
    return guns.get(key);
  }

  // ------------------------------------------------------- her lines ----
  const L = D.LINES;
  const along = (z) => Math.max(0, Math.min(L.nz - 1.0001, (z - L.z0) / L.dz));
  const zAt = (t) => (t * LOA) / 2;
  function keelY(t) {
    const f = along(zAt(t));
    const i = Math.floor(f);
    const a = L.keel[i] > 50 ? L.keel[Math.min(L.nz - 1, i + 1)] : L.keel[i];
    const b = L.keel[Math.min(L.nz - 1, i + 1)] > 50 ? a : L.keel[Math.min(L.nz - 1, i + 1)];
    return Math.max(a, b);
  }
  function shellAt(t, y) {
    const f = along(zAt(t));
    const gg = Math.max(0, Math.min(L.ny - 1.0001, (y - L.y0) / L.dy));
    const i = Math.floor(f), j = Math.floor(gg), u = f - i, v = gg - j;
    const at = (a, b) => L.half[Math.min(L.nz - 1, a) * L.ny + Math.min(L.ny - 1, b)];
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
  }
  function platingAt(z, y) {
    const I = L.inner;
    const k = Math.round((z - I.z0) / I.dz), j = Math.round((y - I.y0) / I.dy);
    if (k < 0 || k >= I.nz || j < 0 || j >= I.ny) return 0;
    return I.w[k * I.ny + j];
  }

  // ------------------------------------------------------- her decks ----
  const FD = D.DECK.y;
  const HANGAR = H.y;
  const HANGAR_TOP = FD - 2.6;
  const HANGAR_Z = H.z;
  const HANGAR_HW = H.hw;
  function planAt(side, z) {
    const f = (z - D.DECK.z0) / D.DECK.dz;
    const i = Math.floor(f);
    if (i < 0 || i >= D.DECK.nz - 1) return 0;
    const u = f - i;
    return D.DECK[side][i] * (1 - u) + D.DECK[side][i + 1] * u;
  }
  const FD_FWD = D.DECK.flat.fwd;
  const FD_AFT = D.DECK.flat.aft;
  // Her round-downs, drawn here: a metre at her after end, a hand forward.
  const FLAT = { aft: FD_AFT + 9, fwd: FD_FWD - 4 };
  const DROP = { aft: 1.0, fwd: 0.25 };
  const rounded = (d, len, drop) => (d <= 0 ? 0 : drop * Math.min(1, d / len) ** 2);
  function fdY(z) {
    if (z < FLAT.aft) return FD - rounded(FLAT.aft - z, FLAT.aft - FD_AFT, DROP.aft);
    if (z > FLAT.fwd) return FD - rounded(z - FLAT.fwd, Math.max(0.5, FD_FWD - FLAT.fwd), DROP.fwd);
    return FD;
  }
  const liftX = (l) => l.x || 0;
  function liftOutline(hw, hd, ch) {
    return [[-hw + ch, -hd], [hw - ch, -hd], [hw, -hd + ch], [hw, hd - ch], [hw - ch, hd], [-hw + ch, hd], [-hw, hd - ch], [-hw, -hd + ch]];
  }
  function wellHalf(l, dz) {
    const a = Math.abs(dz);
    if (a > l.hd) return 0;
    if (a <= l.hd - l.ch) return l.hw;
    return l.hw - (a - (l.hd - l.ch));
  }
  const inWell = (z, margin = 0) => LIFTS.some((l) => !l.x && Math.abs(z - l.z) < l.hd + margin);

  /** Her runway over the outline of her flight deck, her lift wells cut out of it. */
  function runway(g) {
    const zs = [];
    for (let z = FD_AFT; z <= FD_FWD + 1e-6; z += 0.5) zs.push(z);
    for (const l of LIFTS) for (const dz of [-l.hd, -l.hd + l.ch, l.hd - l.ch, l.hd]) zs.push(l.z + dz);
    zs.sort((a, b) => a - b);
    const pos = [], uv = [], idx = [];
    const quad = (xa0, xa1, za, xb0, xb1, zb) => {
      if (xa1 - xa0 < 0.01 && xb1 - xb0 < 0.01) return;
      const n = pos.length / 3;
      const ya = fdY(za) + 0.02, yb = fdY(zb) + 0.02;
      pos.push(xa0, ya, za, xa1, ya, za, xb1, yb, zb, xb0, yb, zb);
      uv.push(xa0, za, xa1, za, xb1, zb, xb0, zb);
      idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
    };
    for (let i = 0; i < zs.length - 1; i++) {
      const za = zs[i], zb = zs[i + 1];
      if (zb - za < 1e-4) continue;
      const la = -planAt('stbd', za), ra = planAt('port', za);
      const lb = -planAt('stbd', zb), rb = planAt('port', zb);
      if (ra - la < 0.5 && rb - lb < 0.5) continue;
      const mid = (za + zb) / 2;
      const lift = LIFTS.find((l) => mid > l.z - l.hd && mid < l.z + l.hd);
      if (!lift) { quad(la, ra, za, lb, rb, zb); continue; }
      const x = liftX(lift);
      const ea = wellHalf(lift, za - lift.z), eb = wellHalf(lift, zb - lift.z);
      quad(la, Math.max(la, Math.min(ra, x - ea)), za, lb, Math.max(lb, Math.min(rb, x - eb)), zb);
      quad(Math.min(ra, Math.max(la, x + ea)), ra, za, Math.min(rb, Math.max(lb, x + eb)), rb, zb);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const deck = new THREE.Mesh(geo, materials().deck);
    deck.userData.deck = true;
    g.add(deck);
    return deck;
  }
  /** A broken white centreline, and her arrester wires across her after end. */
  function deckMarks(g) {
    for (let z = FD_AFT + 12; z < FD_FWD - 6; z += 8) {
      if (inWell(z, 3.5)) continue;
      box(g, M.stripe, 0.45, 0.03, 4.5, 0, fdY(z) + 0.035, z);
    }
    for (let z = FD_AFT + 14; z <= FD_AFT + 50; z += 4.5) {
      if (inWell(z, 1)) continue;
      const half = Math.min(planAt('stbd', z), planAt('port', z)) - 1.2;
      if (half < 2) continue;
      const w = cyl(g, M.wire, 0.05, 0.05, half * 2, 0, fdY(z) + 0.12, z, 6);
      w.rotation.z = Math.PI / 2;
      for (const s of [-1, 1]) cyl(g, M.gunDark, 0.18, 0.2, 0.22, s * half, fdY(z) + 0.11, z, 10);
    }
  }
  /** The wells through her flight deck: coamings and trunks down to her hangar. */
  function liftWells(g) {
    for (const l of LIFTS) {
      if (l.x) continue;
      const pts = liftOutline(l.hw + 0.05, l.hd + 0.05, l.ch);
      for (let i = 0; i < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
        const len = Math.hypot(bx - ax, bz - az) + 0.2;
        const ry = Math.atan2(bx - ax, bz - az);
        box(g, M.steelDark, 0.3, 0.16, len, (ax + bx) / 2, FD + 0.06, l.z + (az + bz) / 2, ry);
        box(g, M.steelDark, 0.24, FD - HANGAR_TOP, len, (ax + bx) / 2, (FD + HANGAR_TOP) / 2, l.z + (az + bz) / 2, ry).userData.inside = true;
      }
      for (const sgn of [-1, 1]) {
        for (const dz of [-l.hd + 1.6, l.hd - 1.6]) {
          box(g, M.gunDark, 0.3, FD - HANGAR, 0.3, sgn * (l.hw + 0.12), (FD + HANGAR) / 2, l.z + dz).userData.inside = true;
        }
      }
    }
  }
  /** Her lifts, each a planked platform on its grillage, each its own group. */
  function elevators(g) {
    return LIFTS.map((l, i) => {
      const lift = new THREE.Group();
      lift.position.set(liftX(l), FD, l.z);
      lift.userData.dynamic = true;
      g.add(lift);
      const pts = liftOutline(l.hw - 0.06, l.hd - 0.06, l.ch - 0.025);
      const pos = [], uv = [], idx = [];
      const n = pts.length;
      for (const [px, pz] of pts) { pos.push(px, 0.02, pz); uv.push(px, pz + l.z); }
      for (const [px, pz] of pts) { pos.push(px, -0.25, pz); uv.push(px, pz + l.z); }
      pos.push(0, 0.02, 0); uv.push(0, l.z);
      pos.push(0, -0.25, 0); uv.push(0, l.z);
      const hubTop = 2 * n, hubBot = 2 * n + 1;
      for (let k = 0; k < n; k++) {
        const j = (k + 1) % n;
        idx.push(hubTop, j, k, hubBot, n + k, n + j, k, n + j, n + k, k, j, n + j);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      lift.add(new THREE.Mesh(geo, materials().deck));
      for (let k = -3; k <= 3; k++) box(lift, M.steelDark, 0.26, 0.16, 2 * l.hd - 2.4, k * (l.hw / 4), -0.33, 0);
      box(lift, M.steelDark, 2 * l.hw - 1.2, 0.16, 0.5, 0, -0.33, 0);
      // A deck-edge lift runs on rails up the outside of her hull.
      if (l.x) for (const dz of [-l.hd + 1.0, l.hd - 1.0]) box(lift, M.steel, 0.5, 0.5, 0.5, -Math.sign(l.x) * (l.hw - 0.3), -0.3, dz);
      mergeStatic(lift);
      return { group: lift, phase: i / LIFTS.length, edge: !!l.x };
    });
  }
  function hangarHalf(z, y0, y1) {
    let plating = Infinity;
    for (let dz = -3; dz <= 3; dz++) {
      for (let y = y0; y <= y1 + 1e-6; y += 0.5) {
        const w = platingAt(z + dz, y);
        if (w > 0) plating = Math.min(plating, w);
      }
    }
    return Math.max(0.5, Math.min(HANGAR_HW, plating - 1.2));
  }
  function hangar(g) {
    const [z0, z1] = HANGAR_Z, y0 = HANGAR, y1 = HANGAR_TOP;
    const half = (z) => hangarHalf(z, y0 + 0.5, y1);
    const N = 60;
    sheet(g, M.deckSteel, z0, z1, half, () => y0, N).userData.inside = true;
    sheet(g, M.steelDark, z0, z1, half, () => y1, N, false).userData.inside = true;
    for (const out of [1, -1]) {
      const w = strip();
      for (let i = 0; i < N; i++) {
        const za = z0 + ((z1 - z0) * i) / N, zb = z0 + ((z1 - z0) * (i + 1)) / N;
        for (const sgn of [-1, 1]) w.quad([sgn * half(za), y0, za], [sgn * half(za), y1, za], [sgn * half(zb), y1, zb], [sgn * half(zb), y0, zb], [sgn * out, 0, 0]);
      }
      const m = w.mesh(g, out > 0 ? M.steel : M.hangar);
      if (m) m.userData.inside = true;
    }
    for (const [z, out] of [[z0, -1], [z1, 1]]) {
      for (const face of [1, -1]) {
        const e = strip();
        const w = half(z);
        e.quad([-w, y0, z], [w, y0, z], [w, y1, z], [-w, y1, z], [0, 0, out * face]);
        const m = e.mesh(g, face > 0 ? M.steel : M.hangar);
        if (m) m.userData.inside = true;
      }
    }
    for (let z = z0 + 4; z < z1 - 2; z += 4.2) {
      const w = half(z);
      for (const sgn of [-1, 1]) box(g, M.steelDark, 0.28, y1 - y0, 0.38, sgn * (w - 0.16), (y0 + y1) / 2, z).userData.inside = true;
      if (inWell(z, 0.4)) continue;
      box(g, M.steelDark, w * 2 - 0.4, 0.32, 0.28, 0, y1 - 0.2, z).userData.inside = true;
    }
    // The bulkheads of her gallery deck over it, up to her flight deck.
    const gh = (z) => hangarHalf(z, HANGAR + 0.5, FD - 0.2);
    const w = strip();
    for (let i = 0; i < N; i++) {
      const za = z0 + ((z1 - z0) * i) / N, zb = z0 + ((z1 - z0) * (i + 1)) / N;
      for (const sgn of [-1, 1]) w.quad([sgn * gh(za), y1, za], [sgn * gh(za), FD - 0.2, za], [sgn * gh(zb), FD - 0.2, zb], [sgn * gh(zb), y1, zb], [sgn, 0, 0]);
    }
    const m = w.mesh(g, M.steelDark);
    if (m) m.userData.inside = true;
  }
  const WHEELS = 0.04;
  function machine(g, role, x, y, z, yaw, folded, opts = { lod: true }) {
    const T = TYPES[KINDS[role]] || TYPES.avenger;
    return T.build(g, x, y, z, yaw, folded, opts);
  }
  /** Where her air group is struck below: folded down both sides, a spread one down the middle. */
  function hangarSpots() {
    const spots = [];
    const [z0, z1] = HANGAR_Z;
    let side = 0;
    for (let z = z1 - 7; z > z0 + 6; z -= 13) {
      const w = hangarHalf(z, HANGAR + 0.5, HANGAR_TOP);
      const role = side++ % 2 ? 'fighter' : 'torpedo';
      const T = TYPES[KINDS[role]] || TYPES.avenger;
      if (w >= 2 * T.folded + 1.0 && !inWell(z, 6.5)) {
        const x = w - T.folded - 0.4;
        spots.push({ x: -x, y: HANGAR, z, role, folded: true });
        spots.push({ x, y: HANGAR, z, role, folded: true });
      }
      const zm = z - 6.5;
      const D2 = TYPES[KINDS.dive] || TYPES.dauntless;
      if (zm > z0 + 5 && hangarHalf(zm, HANGAR + 0.5, HANGAR_TOP) >= D2.spread + 0.5 && !inWell(zm, 5)) {
        spots.push({ x: 0, y: HANGAR, z: zm, role: 'dive', folded: false });
      }
    }
    return spots;
  }
  function airGroup(g) {
    for (const s of hangarSpots()) {
      const a = machine(g, s.role, s.x, s.y + WHEELS, s.z, s.x < 0 ? 0.04 : s.x > 0 ? -0.04 : 0, s.folded);
      a.traverse((o) => { o.userData.inside = true; });
    }
  }

  // -------------------------------------------------------- her guns ----
  const stowed = (m) => (m.rest === undefined ? m.angle : m.rest);
  function sculpted(g, kind, x, y, z, rest, trainRate, name, ix = -1) {
    const piece = gunPiece(kind, ix);
    const m = new THREE.Group();
    m.position.set(x, y, z);
    m.rotation.y = rest;
    m.userData.rest = 0;
    m.userData.dynamic = true;
    m.userData.mounting = true;
    m.userData.trainRate = trainRate;
    if (name) m.userData.name = name;
    m.add(new THREE.Mesh(piece.house, materials().sheet));
    const cradle = new THREE.Group();
    cradle.position.set(...piece.trunnion);
    cradle.rotation.x = -piece.pitch;
    if (piece.guns) cradle.add(new THREE.Mesh(piece.guns, materials().sheet));
    m.add(cradle);
    arm(m, cradle, piece.muzzles);
    g.add(m);
    return m;
  }
  function seatFor(kind, x, z, what) {
    let best = null, bd = Infinity;
    for (const s of D.MOUNTS[kind] || []) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best || bd > 0.8) throw new Error(`the ${CLS.name} has a ${what} at ${x}, ${z} her model does not`);
    return { ...best, ix: (D.MOUNTS[kind] || []).indexOf(best) };
  }
  function mainBattery(g) {
    const turrets = CLS.turrets.map((t) => {
      const s = seatFor(t.piece || 'dp', t.x, t.z, 'dual-purpose gun');
      const m = sculpted(g, t.piece || 'dp', s.x, s.y, s.z, stowed(t), CLS.gun.traverse, t.name, s.ix);
      m.userData.rest = undefined;
      return m;
    });
    g.userData.turrets = turrets;
    return turrets;
  }
  function mountings(g) {
    const aa = [];
    for (const gun of CLS.aa.guns) {
      for (const spec of gun.mounts) {
        const s = seatFor(gun.piece, spec.x, spec.z, `${gun.caliber} mm`);
        const a = sculpted(g, gun.piece, s.x, s.y, s.z, stowed(spec), gun.caliber < 25 ? 0.8 : 0.6, undefined, s.ix);
        a.userData.rest = 0;
        a.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
        a.userData.stops = gun.elev || null;
        a.userData.lift = spec.lift || null;
        aa.push(a);
      }
    }
    if (aa.length !== lightMounts(CLS).length) throw new Error(`the ${CLS.name} built a light battery her datasheet does not list`);
    g.userData.aaMounts = aa;
    return { aa };
  }

  // ------------------------------------------------------ her armour ----
  function armour(g) {
    const inside = (o) => { if (o) o.userData.inside = true; return o; };
    const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
    const N = 56;
    const [z0, z1] = CIT.z;
    const belt = strip();
    for (let i = 0; i < N; i++) {
      const za = z0 + ((z1 - z0) * i) / N, zb = z0 + ((z1 - z0) * (i + 1)) / N;
      for (const sgn of [-1, 1]) {
        belt.quad([sgn * at(za, CIT.top, 0.8), CIT.top, za], [sgn * at(za, CIT.foot, 0.8), CIT.foot, za],
          [sgn * at(zb, CIT.foot, 0.8), CIT.foot, zb], [sgn * at(zb, CIT.top, 0.8), CIT.top, zb], [-sgn, 0, 0]);
      }
    }
    inside(belt.mesh(g, M.armour));
    for (const up of [true, false]) inside(sheet(g, M.armour, z0, z1, (z) => at(z, CIT.deck, 1.0), () => CIT.deck + (up ? 0.06 : -0.06), 48, up));
  }
  let screwGeo = null;
  function screws(g) {
    if (!screwGeo) screwGeo = D.SCREWS.map((s) => decodePiece(s.piece));
    D.SCREWS.forEach((s, i) => {
      const hub = new THREE.Group();
      hub.position.set(s.x, s.y, s.z);
      hub.userData.dynamic = true;
      hub.userData.screw = { hand: s.x < 0 ? -1 : 1 };
      hub.add(new THREE.Mesh(screwGeo[i], materials().sheet));
      g.add(hub);
    });
  }

  // --------------------------------------------------------- deck cycle ----
  const LIFT_DROP = FD - HANGAR;
  const UP = 3.6, TAXIED = 7.4, ROLL = 9.0;
  // Where her aeroplanes start their run, and where one coming home picks up a wire.
  const SPOT = FD_AFT + 24;
  const landZ = () => FD_AFT + 20;
  function deckAircraft(g) {
    const plane = new THREE.Group();
    plane.userData.dynamic = true;
    g.add(plane);
    const kinds = {};
    for (const role of ['torpedo', 'fighter', 'dive']) {
      const T = TYPES[KINDS[role]] || TYPES.avenger;
      const body = T.build(plane, 0, 0, 0, 0, role === 'torpedo', {});
      const prop = body.userData.prop || null;
      kinds[role] = {
        body, prop, props: body.userData.props || (prop ? [prop] : []), wings: null,
        fold: body.userData.fold || null, gear: body.userData.gear || null, blur: propBlur(prop), exhaust: T.exhaust() || [],
      };
    }
    const out = { group: plane, kinds, role: 'torpedo' };
    out.pick = (role) => {
      const r = kinds[role] ? role : 'torpedo';
      for (const [k, v] of Object.entries(kinds)) v.body.visible = k === r;
      const k = kinds[r];
      out.role = r;
      out.prop = k.prop; out.props = k.props; out.wings = k.wings; out.fold = k.fold; out.gear = k.gear;
      out.blur = k.blur; out.exhaust = k.exhaust;
    };
    out.pick('torpedo');
    return out;
  }
  const ON = 0.04;
  // The lift that works her aeroplanes: the after one on her centreline.
  const workLift = (lifts) => { for (let i = lifts.length - 1; i >= 0; i--) if (!lifts[i].edge) return lifts[i]; return lifts[lifts.length - 1]; };
  function below(deck, p, aft) {
    if (deck.owner && p.parent !== deck.owner) return;
    p.position.set(aft.group.position.x, FD - LIFT_DROP + ON, aft.group.position.z - 0.4);
    p.rotation.set(0, 0.08, 0);
  }
  /**
   * Her deck cycle, as the Hornet's (see hornet.js stepDeck): her lifts on
   * their idle rounds, and a launch -- up the after lift, taxi to the spot,
   * run up and fly off -- or a recovery when one is called for.
   */
  function stepDeck(deck, t) {
    if (!deck) return;
    const { lifts, plane } = deck;
    const aft = workLift(lifts);
    const pr = deck.profile;
    const FLOWN = pr ? pr.rows.length * pr.dt : 12;
    const LAUNCH = ROLL + FLOWN;
    const clock = deckClock(ROLL, FLOWN, deck.dur ?? DECK_RUN);
    const pace = clock.pace;
    const run = deck.launchAt === null || deck.launchAt === undefined ? -1 : clock.at(t - deck.launchAt);
    const dt = Math.max(0, Math.min(0.5, t - (deck.lastT ?? t)));
    deck.lastT = t;
    const ranging = run >= 0 && run < LAUNCH + 2;
    const FLUSH = 1.4;
    deck.flush = clamp((deck.flush ?? 0) + (ranging ? dt / FLUSH : -dt / FLUSH), 0, 1);
    const PERIOD = 42;
    const working = (run >= 0 && run < LAUNCH) || deck.landAt != null;
    for (const l of lifts) {
      if (l === aft && working) continue;
      let u = ((t / PERIOD) + l.phase) % 1;
      if (u < 0) u += 1;
      let k = 0;
      if (u < 0.36) k = 0;
      else if (u < 0.48) k = (u - 0.36) / 0.12;
      else if (u < 0.86) k = 1;
      else k = 1 - (u - 0.86) / 0.14;
      const idle = FD - LIFT_DROP * ease(k);
      l.group.position.y = idle + (FD - idle) * ease(deck.flush);
    }
    if (!plane) return;
    const p = plane.group;
    if (deck.owner && p.parent !== deck.owner) return;
    const AFT_Z = aft.group.position.z;
    const wings = (out) => {
      const u = clamp(+out, 0, 1);
      if (plane.fold) { plane.fold(1 - u); return; }
      if (!plane.wings) return;
      plane.wings.spread.visible = u >= 0.5;
      plane.wings.stowed.visible = u < 0.5;
    };
    const turnProps = (rate) => { for (const h of plane.props || []) h.rotation.z += rate * dt; };
    if (deck.landAt != null) {
      const at = recoveryAt(t - deck.landAt, landZ(), AFT_Z - 0.4);
      if (!at.done) {
        p.visible = true;
        wings(at.wings);
        const ly = FD - LIFT_DROP * at.lift;
        aft.group.position.y = ly;
        p.position.set(0, ly + ON, at.z);
        p.rotation.set(0, 0, 0);
        turnProps(at.turning);
        return;
      }
      deck.landAt = null;
      deck.stowed = true;
      p.visible = false;
      below(deck, p, aft);
      return;
    }
    if (run < 0 || deck.airborne) {
      if (deck.stowed || deck.airborne) { p.visible = false; below(deck, p, aft); }
      return;
    }
    if (run >= LAUNCH) {
      if (!deck.airborne) deck.airborneAt = t;
      deck.airborne = true;
      p.visible = false;
      if (plane.gear) plane.gear(1);
      below(deck, p, aft);
      return;
    }
    p.visible = true;
    let power = 0, speed = 0;
    if (run < UP) {
      if (plane.gear) plane.gear(0);
      const u = ease(run / UP);
      aft.group.position.y = FD - LIFT_DROP * (1 - u);
      wings(clamp((u - 0.3) / 0.6, 0, 1));
      p.position.set(0, aft.group.position.y + ON, AFT_Z - 0.4);
      p.rotation.set(0, 0.08 * (1 - u), 0);
    } else if (run < ROLL) {
      aft.group.position.y = FD;
      wings(true);
      if (plane.gear) plane.gear(0);
      if (run < TAXIED) {
        const u = ease((run - UP) / (TAXIED - UP));
        p.position.set(0, FD + ON, AFT_Z - 0.4 + (SPOT - (AFT_Z - 0.4)) * u);
        p.rotation.set(0, 0, 0.006 * Math.sin(run * 9));
        power = 0.22;
      } else {
        power = 0.3 + 0.7 * Math.min(1, (run - TAXIED) / (ROLL - TAXIED));
        p.position.set(0, FD + ON, SPOT);
        p.rotation.set(-0.012 * Math.sin((run - TAXIED) * 22) * power, 0, 0);
      }
    } else {
      aft.group.position.y = FD;
      wings(true);
      power = 1;
      const i = Math.min(pr.rows.length - 1, Math.max(0, Math.round((run - ROLL) / pr.dt)));
      const [s2, h, th, up] = pr.rows[i];
      speed = rowSpeed(pr, i);
      p.position.set(0, FD + ON + h, SPOT + s2);
      p.rotation.set(-th, 0, 0);
      const off = pr.bow >= 0 ? (run - ROLL) - pr.bow : -1;
      if (plane.gear) plane.gear(up && off > 0 ? Math.min(1, off / 2.6) : 0);
    }
    const START = 1.2;
    const el = t - deck.launchAt;
    const rate = propRate(engineStart(deck.engine || (deck.engine = {}), run >= START, el - START / pace, power, dt, deck.fx, p, plane.exhaust), speed, pr ? pr.vr : 30);
    turnProps(rate);
    if (plane.blur) plane.blur(rate);
  }

  // ------------------------------------------------------------- build ----
  const STATIC = [
    ['hullModel', hullModel], ['runway', runway], ['deckMarks', deckMarks], ['liftWells', liftWells],
    ['hangar', hangar], ['armour', armour], ['airGroup', airGroup], ['screws', screws],
  ];
  function build() {
    const g = new THREE.Group();
    for (const [, b] of STATIC) b(g);
    buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + 0.15, sheer: () => HANGAR, zAt, hollow: true });
    const lifts = elevators(g);
    const plane = deckAircraft(g);
    mergeStatic(g, bySection(LOA));
    const turrets = mainBattery(g);
    mountings(g);
    mergeMoving(g);
    g.userData.classId = id;
    const deck = { lifts, plane, launchAt: null, landAt: null, stowed: true, owner: g, flush: 0, lastT: 0, airborne: false, pending: [], flightId: 0 };
    deck.profiles = deckProfiles(KINDS, FD_FWD - SPOT);
    deck.endPoses = {};
    for (const [role, pr] of Object.entries(deck.profiles)) {
      const end = pr.rows[pr.rows.length - 1];
      deck.endPoses[role] = { x: 0, y: FD + end[1] + ON, z: SPOT + end[0], pitch: end[2] };
    }
    deck.profile = deck.profiles.torpedo;
    deck.endPose = deck.endPoses.torpedo;
    g.userData.deck = deck;
    g.userData.deckPlane = plane.group;
    g.userData.landingSpot = [0, FD + ON, landZ()];
    g.userData.step = (t) => stepDeck(deck, t);
    g.userData.launch = (t, role, dur = DECK_RUN) => {
      deck.launchAt = t; deck.landAt = null; deck.stowed = false; deck.airborne = false; deck.engine = {}; deck.dur = dur;
      plane.pick(role);
      deck.profile = deck.profiles[plane.role];
      deck.endPose = deck.endPoses[plane.role];
      plane.group.visible = true;
    };
    g.userData.recover = (t = deck.lastT ?? 0, role = null) => {
      if (role) plane.pick(role);
      deck.landAt = t; deck.launchAt = null; deck.stowed = false; deck.airborne = false;
      if (plane.gear) plane.gear(0);
      plane.group.visible = true;
    };
    g.userData.stow = () => {
      deck.airborne = false; deck.launchAt = null; deck.landAt = null; deck.stowed = true;
      plane.group.visible = false;
      below(deck, plane.group, workLift(lifts));
    };
    g.userData.stow();
    dressShip(g);
    return {
      group: g, turrets, lifts, deckPlane: plane.group,
      length: LOA, beam: BEAM, deckY: HANGAR, flightDeckY: FD,
      secMounts: [], aaMounts: g.userData.aaMounts || [], torpMounts: [],
    };
  }
  function parts() {
    const out = [];
    for (const [name, b] of [...STATIC, ['mainBattery', mainBattery], ['mountings', mountings]]) {
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
        out.push({ from: name, min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z], size: [lb.max.x - lb.min.x, lb.max.y - lb.min.y, lb.max.z - lb.min.z], moving });
      });
    }
    return out;
  }
  return {
    CLS, LOA, BEAM, FD, HANGAR, FD_FWD, FD_AFT, SPOT, LIFTS, LIFT_DROP, zAt, keelY, shellAt, fdY, surfaceY: surface.surfaceY, seatY: surface.seatY,
    LINES: { loa: LOA, sheer: () => HANGAR, keelY, shellAt, zAt }, MOUNT_SEATS: D.MOUNTS, ISLAND: D.ISLAND,
    hangarSpots, stepDeck, build, parts, landZ,
  };
}
