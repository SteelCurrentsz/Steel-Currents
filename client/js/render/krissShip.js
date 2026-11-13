// A ship off one of the owner's whole-ship models, as build/kriss-hull.mjs
// cuts it: her hull, bridge, funnels, masts and deckhouses one painted mesh,
// and every mounting of hers the model draws -- turrets, gunhouses, banks of
// tubes, light guns -- in the frame of its own mounting, so that it trains and
// its barrels elevate; and, built here, whatever her datasheet carries that
// the model does not draw, her depth charge gear, her armour and her insides.
//
// Each such ship is a few lines (shimakaze.js, fubuki.js and the rest) that
// hand this her data module and what about her is her own: which of the
// model's mountings are her main battery, which her tubes, where her citadel
// runs. What is built here is the same for all of them:
//
//   * her main battery, each turret of her datasheet on the model's own
//     mounting nearest where the datasheet stands it;
//   * her secondaries and her light guns, each either the model's own (a
//     battery with `piece`, naming the kind it was cut as) or, where the model
//     has none, the fleet's own mounting of it (`build`, naming one of the
//     builders below), stood on her deck;
//   * her banks of tubes, the model's, firing on the simulation's clock;
//   * her depth charge rails and throwers where her datasheet stands them;
//   * her screws, the model's, which turn;
//   * her armour and her interior, fitted to her own lines.
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, y = 0 is the
// waterline.
import * as THREE from '../../../vendor/three.module.js';
import { arm } from './mounts.js';
import { mergeStatic, mergeMoving } from './merge.js';
import { dressShip, steelMap, woodMap, finish } from './textures.js';
import { buildInterior, bySection } from './interior.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { lightMounts } from '../../../shared/sim.js';
import { box, cyl, strip, sheet } from './shipkit.js';
import { decodeSlices, decodePiece, surfaceOf } from './sculpt.js';
import { fiveInch38, fiveInch25, quadBofors, twinBofors, oerlikon, twinOerlikon } from './usnguns.js';
import { triple25, twin25, single25 } from './ijnguns.js';
import { threeSeven, twoCm } from './kmguns.js';
import { fitTubes } from './tubes.js';

/** The fleet's own mountings, for a gun the model does not draw: (g, M, x, y, z, ry) => mounting. */
const BUILDERS = {
  fiveInch38, fiveInch25, quadBofors, twinBofors, oerlikon, twinOerlikon,
  triple25: (g, M, x, y, z, ry) => triple25(g, M, x, y + 0.3, z, ry),
  twin25: (g, M, x, y, z, ry) => twin25(g, M, x, y + 0.26, z, ry),
  single25: (g, M, x, y, z, ry) => single25(g, M, x, y, z, ry),
  threeSeven, twoCm,
  twoCmSingle: (g, M, x, y, z, ry) => twoCm(g, M, x, y, z, ry, false),
};

/**
 * Everything about one ship. `id` is her class; `data` her hull data module
 * (`import * as D from './<ship>Hull.data.js'`); `paints` the colours of what
 * is built here (her guns, her gear); `main`, `tubes` the kinds her model's
 * turrets and banks were cut as; `armour` where her citadel runs:
 * `{ citadel: [z0, z1], deck, foot, inset, barbette }`.
 */
export function krissShip({ id, data, paints = {}, main = 'main', tubes = 'tubes', armour: arm0 = {}, gear = {} }) {
  const D = data;
  const CLS = SHIP_CLASSES[id];
  const LOA = CLS.hull.length;
  const BEAM = CLS.hull.beam;
  const P = {
    steel: 0x7c8086, steelDark: 0x55595e, gun: 0x7c8086, gunDark: 0x4a4e53,
    deckDark: 0x5a4a3c, canvas: 0x8c8a7c, glass: 0x25303a, armour: 0x4d555c,
    brass: 0x9c7f4a, boat: 0x8a8b86, cave: 0x1c1c1c, ...paints,
  };
  const MATS = {};
  const M = new Proxy({}, { get: (_, k) => { if (!MATS[k]) MATS[k] = new THREE.MeshLambertMaterial({ color: P[k] ?? P.steel }); return MATS[k]; } });

  // ------------------------------------------------------- her hull ----
  let cached = null;
  const slices = () => (cached || (cached = decodeSlices(D.HULL_B64)));
  const surface = surfaceOf(D.SURFACE);
  let mats = null;
  function materials() {
    if (mats) return mats;
    const plate = steelMap();
    const planks = woodMap();
    mats = {
      plating: new THREE.MeshPhongMaterial({ vertexColors: true, map: plate, specularMap: plate, specular: 0x3a4148, shininess: 30, side: THREE.DoubleSide }),
      deck: new THREE.MeshPhongMaterial({ vertexColors: true, map: planks, specularMap: planks, specular: 0x16181c, shininess: 5, side: THREE.DoubleSide }),
      sheet: new THREE.MeshPhongMaterial({ vertexColors: true, map: plate, specularMap: plate, specular: 0x3a4148, shininess: 30, side: THREE.DoubleSide }),
    };
    finish(mats.plating);
    finish(mats.sheet);
    finish(mats.deck, 'wood');
    return mats;
  }
  function hullModel(g) {
    const m = materials();
    for (const geo of slices()) g.add(new THREE.Mesh(geo, [m.plating, m.deck, m.sheet][geo.userData.surface] || m.plating));
  }
  const guns = new Map();
  function gunPiece(kind, ix = -1) {
    // Each mounting as her model draws it, where it has its own piece.
    const own = ix >= 0 && D.GUNS[kind] && D.GUNS[kind].each && D.GUNS[kind].each[ix];
    const key = own ? `${kind}#${ix}` : kind;
    if (!guns.has(key)) {
      const p = own || D.GUNS[kind];
      if (!p) throw new Error(`${id} has no ${kind} cut from her model`);
      guns.set(key, {
        house: decodePiece(p.house), guns: p.guns ? decodePiece(p.guns) : null,
        trunnion: p.trunnion, muzzles: p.muzzles, pitch: p.pitch, roof: p.roof,
      });
    }
    return guns.get(key);
  }

  // ------------------------------------------------------ her lines ----
  const L = D.LINES;
  const along = (z) => Math.max(0, Math.min(L.nz - 1.0001, (z - L.z0) / L.dz));
  const lerp = (arr, f) => {
    const i = Math.floor(f);
    const u = f - i;
    return arr[i] * (1 - u) + arr[Math.min(arr.length - 1, i + 1)] * u;
  };
  const zAt = (t) => (t * LOA) / 2;
  function keelY(t) {
    const f = along(zAt(t));
    const i = Math.floor(f);
    const a = L.keel[i] > 50 ? L.keel[Math.min(L.nz - 1, i + 1)] : L.keel[i];
    const b = L.keel[Math.min(L.nz - 1, i + 1)] > 50 ? a : L.keel[Math.min(L.nz - 1, i + 1)];
    const u = f - i;
    return a * (1 - u) + b * u;
  }
  const deckOver = (t) => lerp(L.deck, along(zAt(t)));
  function shellAt(t, y) {
    const f = along(zAt(t));
    const gg = Math.max(0, Math.min(L.ny - 1.0001, (y - L.y0) / L.dy));
    const i = Math.floor(f);
    const j = Math.floor(gg);
    const u = f - i;
    const v = gg - j;
    const at = (a, b) => L.half[Math.min(L.nz - 1, a) * L.ny + Math.min(L.ny - 1, b)];
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
  }
  const LINES = { loa: LOA, sheer: deckOver, keelY, shellAt, zAt };
  const deckAt = (z, x = 0) => surface.surfaceY(x, z);

  // ----------------------------------------------------- mountings ----
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
  /** The model's mounting of a kind nearest where her datasheet stands one. */
  function seatFor(kind, x, z, what) {
    const list = D.MOUNTS[kind] || [];
    let best = null, bd = Infinity;
    for (const s of list) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best || bd > 0.8) throw new Error(`the ${CLS.name} has a ${what} at ${x}, ${z} her model does not`);
    return { ...best, ix: (D.MOUNTS[kind] || []).indexOf(best) };
  }
  function mainBattery(g) {
    const turrets = CLS.turrets.map((t) => {
      const s = seatFor(main, t.x, t.z, 'turret');
      return sculpted(g, main, s.x, s.y, s.z, stowed(t), CLS.gun.traverse, t.name, s.ix);
    });
    g.userData.turrets = turrets;
    return turrets;
  }
  function offTheTub(g, a, ry) {
    const tub = a.parent;
    if (tub === g) return a;
    a.removeFromParent();
    a.position.set(tub.position.x, tub.position.y + a.position.y, tub.position.z);
    a.rotation.y = ry;
    g.add(a);
    return a;
  }
  /** One mounting of a battery: the model's own, or the fleet's, on her deck. */
  function lightGun(g, battery, spec, trainRate) {
    let a;
    if (battery.piece) {
      const s = seatFor(battery.piece, spec.x, spec.z, `${battery.caliber} mm`);
      a = sculpted(g, battery.piece, s.x, s.y, s.z, stowed(spec), trainRate, undefined, s.ix);
    } else {
      const make = BUILDERS[battery.build];
      if (!make) throw new Error(`no mounting ${battery.build} for the ${CLS.name}'s ${battery.name}`);
      const y = spec.y ?? surface.seatY(spec.x, spec.z, 0.6);
      a = offTheTub(g, make(g, M, spec.x, y, spec.z, stowed(spec)), stowed(spec));
      a.userData.mounting = true;
      a.userData.trainRate = a.userData.trainRate || trainRate;
    }
    a.userData.rest = 0;
    a.userData.sector = { angle: spec.angle, arc: spec.arc, stow: stowed(spec) };
    a.userData.stops = battery.elev || null;
    a.userData.lift = spec.lift || null;
    return a;
  }
  function mountings(g) {
    const sec = (CLS.secondary ? CLS.secondary.mounts : []).map((spec) => {
      const m = lightGun(g, { ...CLS.secondary, piece: spec.piece || CLS.secondary.piece, build: spec.build || CLS.secondary.build }, spec, CLS.secondary.traverse);
      m.userData.trainRate = CLS.secondary.traverse;
      return m;
    });
    const aa = [];
    for (const gun of CLS.aa.guns) for (const spec of gun.mounts) aa.push(lightGun(g, gun, spec, gun.caliber >= 40 ? 1.4 : 2.4));
    if (aa.length !== lightMounts(CLS).length) throw new Error(`the ${CLS.name} built a light battery her datasheet does not list`);
    const torp = CLS.torpedoes ? CLS.torpedoes.mounts.map((spec) => {
      const s = seatFor(tubes, spec.x, spec.z, 'bank of tubes');
      const piece = gunPiece(tubes, s.ix);
      const m = new THREE.Group();
      m.position.set(s.x, s.y, s.z);
      m.rotation.y = stowed(spec);
      m.userData.rest = 0;
      m.userData.dynamic = true;
      m.userData.mounting = true;
      m.userData.name = `tubes ${spec.id + 1}`;
      m.userData.trainRate = CLS.torpedoes.traverse;
      m.add(new THREE.Mesh(piece.house, materials().sheet));
      const cradle = new THREE.Group();
      m.add(cradle);
      arm(m, cradle, piece.muzzles);
      g.add(m);
      return m;
    }) : [];
    g.userData.secMounts = sec;
    g.userData.aaMounts = aa;
    g.userData.torpMounts = torp;
    return { sec, aa, torp };
  }

  // -------------------------------------------------- depth charges ----
  // Her rails over her stern with the charges nose to tail on them, and her
  // throwers on her quarterdeck, each where her datasheet stands it: the
  // simulation drops the charges from those stations.
  const DC = CLS.depthCharges;
  const DRUM = { r: 0.24, len: 0.66 };
  function drum(g, x, y, z, upright = false) {
    const c = cyl(g, M.gunDark, DRUM.r, DRUM.r, DRUM.len, x, y, z, 12);
    if (!upright) c.rotation.x = Math.PI / 2;
    return c;
  }
  function depthCharges(g) {
    // Her model draws her racks and her K-guns itself: nothing built over them.
    if (!DC || gear.model) return;
    const RAIL = gear.rail ?? 4.2;
    for (const r of DC.racks) {
      const n = 8;
      const z0 = r.z + RAIL, z1 = r.z - 0.6;
      for (let i = 0; i < n; i++) {
        const za = z0 + ((z1 - z0) * i) / n, zb = z0 + ((z1 - z0) * (i + 1)) / n;
        const ya = deckAt(za, r.x), yb = deckAt(zb, r.x);
        for (const rail of [-0.26, 0.26]) {
          const len = Math.hypot(zb - za, yb - ya) + 0.02;
          const b = box(g, M.steelDark, 0.08, 0.28, len, r.x + rail, (ya + yb) / 2 + 0.24, (za + zb) / 2);
          b.rotation.x = Math.atan2(yb - ya, za - zb);
        }
      }
      for (let i = 0; i < 5; i++) {
        const z = r.z + RAIL - 0.6 - i * 0.75;
        drum(g, r.x, deckAt(z, r.x) + 0.55, z);
      }
      const ry = deckAt(r.z, r.x);
      box(g, M.steelDark, 0.8, 0.5, 0.5, r.x, ry + 0.25, r.z + 0.1);
    }
    for (const t of DC.throwers) {
      const sgn = Math.sign(t.x) || 1;
      const k = new THREE.Group();
      k.position.set(t.x, deckAt(t.z, t.x), t.z);
      k.rotation.z = -sgn * 0.5;
      g.add(k);
      box(k, M.steelDark, 0.7, 0.14, 0.7, 0, 0.07, 0);
      cyl(k, M.gunDark, 0.22, 0.3, 1.2, 0, 0.7, 0, 12);
      drum(k, 0, 1.5, 0);
    }
  }

  // ------------------------------------------------------ her armour ----
  const AR = { citadel: [-LOA * 0.25, LOA * 0.25], deck: 2.0, foot: -1.5, inset: 0.4, barbette: 0, ...arm0 };
  function armour(g) {
    const inside = (o) => { o.userData.inside = true; return o; };
    const at = (z, y, in_) => Math.max(0.4, shellAt((2 * z) / LOA, y) - in_);
    const N = 30;
    const [z0, z1] = AR.citadel;
    const top = AR.deck, foot = AR.foot;
    const side = strip();
    for (let i = 0; i < N; i++) {
      const za = z0 + ((z1 - z0) * i) / N, zb = z0 + ((z1 - z0) * (i + 1)) / N;
      for (const sgn of [-1, 1]) {
        side.quad([sgn * at(za, top, AR.inset), top, za], [sgn * at(za, foot, AR.inset), foot, za],
          [sgn * at(zb, foot, AR.inset), foot, zb], [sgn * at(zb, top, AR.inset), top, zb], [-sgn, 0, 0]);
      }
    }
    inside(side.mesh(g, M.armour));
    for (const up of [true, false]) inside(sheet(g, M.armour, z0, z1, (z) => at(z, top, AR.inset), () => top + (up ? 0.05 : -0.05), 20, up));
    if (AR.barbette) {
      for (const s of D.MOUNTS[main] || []) {
        const t = s.y - 0.3;
        if (t <= top) continue;
        inside(cyl(g, M.armour, AR.barbette, AR.barbette, t - top, s.x, (t + top) / 2, s.z, 20));
      }
    }
  }

  // ------------------------------------------------------ her screws ----
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

  // --------------------------------------------------------- build ----
  const STATIC = [['hull', hullModel], ['depthCharges', depthCharges], ['armour', armour], ['screws', screws]];
  function build(extra = null) {
    const g = new THREE.Group();
    for (const [, b] of STATIC) b(g);
    if (extra) extra(g, ctx);
    // Her insides kept under her decks as the model draws them: nothing of
    // them showing through where a deck steps down.
    buildInterior(g, { loa: LOA, shellAt, keelY: (t) => keelY(t) + 0.12, sheer: deckOver, zAt, roofAt: surface.surfaceY });
    mergeStatic(g, bySection(LOA));
    const turrets = mainBattery(g);
    mountings(g);
    mergeMoving(g);
    g.userData.classId = id;
    if (g.userData.torpMounts.length) g.userData.step = fitTubes(g, g.userData.torpMounts, CLS.torpedoes);
    dressShip(g);
    return {
      group: g, turrets, length: LOA, beam: BEAM, deckY: deckOver(0),
      secMounts: g.userData.secMounts || [], aaMounts: g.userData.aaMounts || [], torpMounts: g.userData.torpMounts || [],
    };
  }
  /** Every piece of her and where it sits, for the tests. */
  function parts() {
    const out = [];
    const builders = [...STATIC, ['mainBattery', mainBattery], ['mountings', mountings]];
    for (const [name, b] of builders) {
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
  const charges = () => (DC ? [...DC.racks, ...DC.throwers].map(({ x, z }) => ({ x, z })) : []);
  const ctx = {
    CLS, LOA, BEAM, M, P, materials, gunPiece, sculpted, surfaceY: surface.surfaceY, seatY: surface.seatY, deckAt,
    zAt, keelY, deckOver, shellAt, LINES, MOUNT_SEATS: D.MOUNTS, SCREWS: D.SCREWS, MEASURED: D.MEASURED, EXTRA: D.EXTRA,
    build, parts, charges, stowed,
  };
  return ctx;
}
