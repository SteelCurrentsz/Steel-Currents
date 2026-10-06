// How far round each of a ship's mountings can be trained, how high it has to
// be laid on each bearing to clear her, and on which bearings its fire would
// go into her -- measured on the model she is drawn with, not guessed.
//
//   node build/survey-arcs.mjs takao [--json]
//
// ONLY=turret|sec|aa|torp limits it to one battery and IDX=4-7 to some of its
// mountings; SAVE=file.json keeps what was measured and FROM=a.json,b.json
// works the arcs out from earlier runs instead of measuring -- so a ship can
// be surveyed a battery at a time, in parallel. RAW=1 prints each mounting's
// 360 bearings: '#' past its stops, '.' clear at any elevation it is laid at,
// a digit the tens of degrees it has to be laid above to clear her, 'x' it can
// be trained there but never fire.
//
// For every mounting, a degree apart all the way round:
//
//   * How low can it be laid there? Its barrels, trunnion to muzzle, and a
//     barrel's thickness either side and above and below, must not run into
//     anything of hers -- hull, superstructure, the gunhouse or shield of any
//     other mounting. The lowest elevation, from its depression stop up, at
//     which they do not is the least it can be laid at on that bearing. A
//     bearing it would have to be laid higher than a few degrees to clear is
//     past its stops: a turret is not trained over her bridge with its guns at
//     forty-five degrees. The training arc is the widest run of bearings it
//     can be laid on that holds the bearing it is stowed at, a degree in from
//     the steel at each end.
//
//   * How low can it fire there? Out of each muzzle along the bore, a ray and
//     one either side of it must not meet anything of hers inside 150 m (two
//     of the three: a jackstaff does not mask a turret). The lowest elevation
//     at which none of its muzzles is masked is the least it can fire at on
//     that bearing -- a turret shooting over the stem at a ship near enough to
//     need its guns flat is shooting into its own forecastle -- and a bearing
//     where no elevation clears is dead -- and so, for a turret, is one where
//     it would have to be laid up past BLAST to clear her, because that is
//     firing over her own bridge from a few metres off it. A bank of tubes is
//     laid level; its fish have to leave the tube clear of her and go into
//     the water clear of her side (torpedoClear).
//
// A mounting nothing stops going all the way round still has stops, over the
// bearings where its fire is worst obstructed (stopRun).
//
// Other mountings' barrels are not in the way of either: they train too, and in
// action they are not lying across anybody's line of fire. Nor are the planes
// on the catapults, which are the one thing that goes before a gun is fired.
//
// A pair either side of her is given the same numbers, mirrored.
//
// What comes out is what the datasheet carries (shared/ships.js): each
// mounting's `angle` and `arc`, and two lists of sectors of bearing in its own
// ship's frame --
//
//   lift: [[from, to, el], ...]  the barrels have to be laid at least `el` to
//                                clear her there (the simulation lays them so);
//   mask: [[from, to, el], ...]  it cannot fire there below `el`, and with no
//                                `el` it cannot fire there at all.
//
// -- read by layFloor in shared/sim.js.

import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import { buildShip } from '../client/js/render/ships.js';
import { SHIP_CLASSES } from '../shared/ships.js';
import { lightMounts, torpedoClear, gunLimits } from '../shared/sim.js';

const id = process.argv[2] || 'takao';
const cls = SHIP_CLASSES[id];
const DEG = Math.PI / 180;
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Elevations to try, low to high: fine where it matters, coarse up high. */
function ladder(min, max, steps) {
  const out = [];
  let e = min;
  for (const [upTo, step] of steps) {
    while (e <= Math.min(upTo, max) + 1e-9) { out.push(e); e += step; }
  }
  if (out[out.length - 1] < max - 1e-6) out.push(max);
  return out;
}

const KINDS = {
  // half: how far out from its bore a barrel is, with a hair to spare. beside:
  // the rays either side of the line of fire. ceiling: the most it will be
  // laid at to be trained past something.
  turret: { half: 0.3, beside: 0.6, far: 150, ceiling: 10 * DEG,
    steps: [[12 * DEG, 0.5 * DEG], [20 * DEG, DEG], [90 * DEG, 2.5 * DEG]] },
  sec: { half: 0.14, beside: 0.3, far: 150, ceiling: 10 * DEG,
    steps: [[12 * DEG, 0.5 * DEG], [20 * DEG, DEG], [45 * DEG, 2.5 * DEG], [90 * DEG, 5 * DEG]] },
  aa: { half: 0.06, beside: 0.15, far: 150, ceiling: 25 * DEG,
    steps: [[10 * DEG, DEG], [30 * DEG, 2.5 * DEG], [90 * DEG, 5 * DEG]] },
  // Tubes are laid level, and a fish is in the water a few metres out.
  torp: { half: 0.25, beside: 0.3, far: 14, ceiling: 0, steps: [] },
};

/** Measure every mounting asked for, off the model. */
function surveyAll() {
  const built = buildShip(id);
  const g = built.group;
  g.updateMatrixWorld(true);
  const light = lightMounts(cls);
  const lightStops = [];
  for (const gun of (cls.aa && cls.aa.guns) || []) for (const m of gun.mounts) lightStops.push(gunLimits(gun));
  const only = process.env.ONLY;
  const [i0, i1] = process.env.IDX ? process.env.IDX.split('-').map(Number) : [0, Infinity];
  const mounts = [
    ...built.turrets.map((m, i) => ({ kind: 'turret', i, m, spec: cls.turrets[i], stops: gunLimits(cls.gun) })),
    ...built.secMounts.map((m, i) => ({ kind: 'sec', i, m, spec: cls.secondary.mounts[i], stops: gunLimits(cls.secondary) })),
    ...built.torpMounts.map((m, i) => ({ kind: 'torp', i, m, spec: cls.torpedoes.mounts[i], stops: { min: 0, max: 0 } })),
    ...built.aaMounts.map((m, i) => ({ kind: 'aa', i, m, spec: light[i], stops: lightStops[i] })),
  ].filter((e) => e.m && (!only || e.kind === only) && e.i >= i0 && e.i <= (i1 ?? i0));

  const every = [...built.turrets, ...built.secMounts, ...built.torpMounts, ...built.aaMounts].filter(Boolean);
  const allMeshes = [];
  g.traverse((o) => { if (o.isMesh && o.userData.mergeKey !== 'in' && o.visible !== false) allMeshes.push(o); });
  const owner = new Map();
  for (const m of every) m.traverse((o) => { if (o.isMesh) owner.set(o, m); });
  const barrel = new Set();
  for (const m of every) {
    const node = m.userData.gunNode;
    if (node && node !== m) node.traverse((o) => { if (o.isMesh) barrel.add(o); });
  }
  // And a gun that is part of another mounting -- a quad Bofors on a turret
  // roof -- whose barrels go round with it.
  g.traverse((o) => {
    const node = o.userData && o.userData.gunNode;
    if (node && node !== o && !every.includes(o)) node.traverse((c) => { if (c.isMesh) barrel.add(c); });
  });
  const planes = new Set();
  g.traverse((o) => { if (o.userData && (o.userData.wings || o.userData.aero)) o.traverse((c) => { if (c.isMesh) planes.add(c); }); });
  // Whatever stands on a catapult, too: a floatplane whose wings do not fold
  // carries no `wings`, and is no more in the way of a gun for that.
  for (const c of g.userData.catapults || []) {
    if (c.plane) c.plane.traverse((o) => { if (o.isMesh) planes.add(o); });
  }
  const sphereOf = new Map();
  for (const o of allMeshes) {
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    sphereOf.set(o, o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld));
  }

  const rc = new THREE.Raycaster();
  const hits = [];
  /** Does a ray from `o` along `dir` meet any of `list` inside `far`? */
  function strikes(list, o, dir, far) {
    rc.set(o, dir);
    rc.far = far;
    for (const t of list) {
      hits.length = 0;
      t.raycast(rc, hits);
      if (hits.length) return true;
    }
    return false;
  }

  function survey(e) {
    const K = KINDS[e.kind];
    const { m } = e;
    const node = m.userData.gunNode || m;
    const rest = m.rotation.y;
    const restEl = node === m ? 0 : -node.rotation.x;
    const muzzles = m.userData.muzzles || [V(0, 0, 1)];
    const reach = Math.max(...muzzles.map((q) => q.length())) + 2;
    const at = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
    const targets = allMeshes.filter((o) => owner.get(o) !== m && !barrel.has(o) && !planes.has(o));
    const near = targets.filter((o) => {
      const s = sphereOf.get(o);
      return s.center.distanceTo(at) < s.radius + reach + 1;
    });
    const E = e.kind === 'torp' ? [0] : ladder(e.stops.min, e.stops.max, K.steps);
    const lay = (b, el) => {
      m.rotation.y = b;
      if (node !== m) node.rotation.x = -el;
      m.updateMatrixWorld(true);
    };
    // Its barrels, laid at `el` on bearing `b`, clear of her.
    const tip = V(0, 0, 0);
    const from = V(0, 0, 0);
    const dir = V(0, 0, 0);
    function clearAt(b, el) {
      lay(b, el);
      for (const mz of muzzles) {
        if (mz.z < 0.3) continue;
        for (const [ox, oy] of [[0, 0], [K.half, 0], [-K.half, 0], [0, K.half], [0, -K.half]]) {
          tip.set(mz.x + ox, mz.y + oy, mz.z).applyMatrix4(node.matrixWorld);
          from.set(mz.x + ox, mz.y + oy, 0).applyMatrix4(node.matrixWorld);
          dir.copy(tip).sub(from);
          const len = dir.length();
          dir.normalize();
          if (strikes(near, from, dir, len)) return false;
        }
      }
      return true;
    }
    // Its fire, laid at `el` on bearing `b`, clear of her.
    const side = V(0, 0, 0);
    const o = V(0, 0, 0);
    function firesAt(b, el) {
      lay(b, el);
      dir.set(Math.sin(b) * Math.cos(el), Math.sin(el), Math.cos(b) * Math.cos(el));
      side.set(Math.cos(b), 0, -Math.sin(b));
      for (const mz of muzzles) {
        tip.copy(mz).applyMatrix4(node.matrixWorld);
        let n = 0;
        for (const s of [0, K.beside, -K.beside]) {
          o.copy(tip).addScaledVector(side, s);
          if (strikes(targets, o, dir, K.far) && ++n >= 2) return false;
        }
      }
      return true;
    }
    // The least it can be laid at on each bearing, up to the most it would
    // be laid at to be trained past something.
    const low = new Array(360).fill(Infinity);
    for (let d = 0; d < 360; d++) {
      const b = wrap(d * DEG);
      for (const el of E) {
        if (el > Math.max(K.ceiling, e.stops.min) + 1e-9) break;
        if (clearAt(b, el)) { low[d] = el; break; }
      }
    }
    const home = ((Math.round(rest / DEG) % 360) + 360) % 360;
    if (low[home] === Infinity) {
      // The model stows it there, so it goes there: whatever we think is in
      // the way of it is a hair's breadth too close, not a gun built into her.
      console.warn(`${e.kind} ${e.i}: stowed bearing reads fouled; taking it as clear at its stowed elevation`);
      low[home] = Math.max(e.stops.min, Math.min(restEl, e.stops.max));
    }
    // And the least it can fire at, on every bearing it can be laid on.
    const fire = new Array(360).fill(Infinity);
    for (let d = 0; d < 360; d++) {
      if (low[d] === Infinity) continue;
      const b = wrap(d * DEG);
      for (const el of E) {
        if (el < low[d] - 1e-9) continue;
        if (!(e.kind === 'torp' || clearAt(b, el))) continue;
        if (!firesAt(b, el)) continue;
        if (e.kind === 'torp' && !torpedoClear(cls, e.spec, b)) break;
        fire[d] = el;
        break;
      }
    }
    lay(rest, restEl);
    let my = 0;
    for (const mz of muzzles) my += mz.clone().applyMatrix4(node.matrixWorld).y / muzzles.length;
    return { low, fire, rest, home, my };
  }

  const t0 = Date.now();
  return mounts.map((e) => {
    const s = survey(e);
    if (process.env.VERBOSE) console.error(`${e.kind} ${e.i} surveyed, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    return { e: { kind: e.kind, i: e.i, spec: { x: e.spec.x || 0, z: e.spec.z }, stops: e.stops }, s };
  });
}

// The elevations a sector is written at, in degrees: each bearing's value is
// taken up to the next of these, so a sector never says lower than the model.
const LEVELS = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20,
  25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90].map((d) => d * DEG);
const levelOf = (v) => (v === Infinity ? Infinity : LEVELS.find((l) => l >= v - 1e-9) ?? Infinity);

/**
 * Runs of bearings, as sectors. Each bearing's value is taken up to the next
 * level, and then to the highest within `pad` degrees of it either side --
 * which widens every sector by that much, for the bearing the mounting is on
 * a tick later, and swallows the one-degree gaps between the webs of a
 * girder -- and consecutive bearings at the same level are one sector.
 * Values at or below `base` do not matter: the mounting is never laid that
 * low.
 */
function sectors(values, from, to, home, base, pad) {
  const q = [];
  for (let k = from - pad; k <= to + pad; k++) {
    // Past the ends of its arc it is never laid at all.
    const v = k < from || k > to ? -Infinity : values[(home + k + 360) % 360];
    q.push(v > base + 0.1 * DEG ? levelOf(v) : -Infinity);
  }
  const out = [];
  let run = null;
  for (let k = from; k <= to; k++) {
    let v = -Infinity;
    for (let j = k - pad; j <= k + pad; j++) v = Math.max(v, q[j - (from - pad)]);
    if (run && v === run.el) { run.b = k; continue; }
    if (run) out.push(run);
    run = v === -Infinity ? null : { a: k, b: k, el: v };
  }
  if (run) out.push(run);
  return out;
}

const BLAST = 25 * DEG;
// The elevations, highest first, a free mounting's stops are looked for at.
const STOP_AT = [60, 45, 30, 20, 10].map((d) => d * DEG);

/**
 * Where a mounting that could be trained all the way round has its stops.
 *
 * Nothing aboard trains right round: its cables would wind up, and there is
 * always a bearing where it is laid across her. So the stops go where they
 * cost least -- over the widest run of bearings where its fire has to go
 * highest to clear her, or cannot clear her at all: her bridge, for a turret
 * in front of it; her superstructure, for a light gun on the deck beside it.
 * Never over the bearing it is stowed on. Returns the run, as its first
 * bearing and its width in degrees.
 */
function stopRun(fire, home) {
  for (const T of STOP_AT) {
    let best = null;
    for (let a = 0; a < 360; a++) {
      if (fire[a] < T || fire[(a + 359) % 360] >= T) continue;
      let w = 0;
      while (w < 360 && fire[(a + w) % 360] >= T) w++;
      if ((home - a + 360) % 360 < w) continue;
      if (!best || w > best.w) best = { a, w };
    }
    if (best) return best;
  }
  // Clear all the way round: the one bearing that is worst.
  let a = (home + 180) % 360;
  for (let d = 0; d < 360; d++) if (d !== home && fire[d] > fire[a]) a = d;
  return { a, w: 1 };
}

function arcsOf(e, s) {
  const { home } = s;
  // A heavy gun that has to be laid up past BLAST to clear her is firing
  // over her own upperworks from a few metres off them, and the blast of an
  // eight-inch gun takes a bridge apart as thoroughly as a shell: her
  // training stops kept it from ever being fired there. Her light guns fire
  // over her at an aeroplane all the time, and are left as measured.
  const fire = e.kind === 'turret' ? s.fire.map((v) => (v > BLAST ? Infinity : v)) : s.fire;
  let lo = 0;
  let hi = 0;
  while (lo < 359 && s.low[(home - lo - 1 + 360) % 360] !== Infinity) lo++;
  while (hi < 359 && s.low[(home + hi + 1) % 360] !== Infinity) hi++;
  if (lo + hi >= 358) {
    const run = stopRun(fire, home);
    hi = ((run.a - home + 360) % 360) - 1;
    lo = ((home - (run.a + run.w - 1) + 360) % 360) - 1;
  }
  // A degree in from the steel, both ends.
  const loIn = lo - 1;
  const hiIn = hi - 1;
  const angle = wrap(s.rest + ((hiIn - loIn) / 2) * DEG);
  const arc = Math.min(Math.PI, ((loIn + hiIn) / 2) * DEG);
  const toB = (k) => wrap((home + k) * DEG);
  // The lowest it is ever laid at: a surface gun at a ship four hundred
  // metres off is a degree and a half down, and a light gun on an aeroplane
  // at mast height a few degrees.
  const base = e.kind === 'torp' ? 0 : Math.max(e.stops.min, (e.kind === 'aa' ? -3 : -1.5) * DEG);
  const lift = e.kind === 'torp' ? []
    : sectors(s.low, -loIn, hiIn, home, base, 2).map((r) => [toB(r.a - 0.5), toB(r.b + 0.5), r.el]);
  const mask = sectors(fire, -loIn, hiIn, home, base, 1)
    .map((r) => (r.el === Infinity ? [toB(r.a - 0.5), toB(r.b + 0.5)] : [toB(r.a - 0.5), toB(r.b + 0.5), r.el]));
  let firing = 0;
  for (let k = -loIn; k <= hiIn; k++) if (fire[(home + k + 360) % 360] !== Infinity) firing++;
  return { angle, arc, lift, mask, firing, span: loIn + hiIn };
}

// JSON has no Infinity: a bearing nothing clears is written as null.
const freeze = (q) => ({ e: q.e, s: { ...q.s, low: q.s.low.map((v) => (v === Infinity ? null : v)),
  fire: q.s.fire.map((v) => (v === Infinity ? null : v)) } });
const thaw = (q) => ({ e: q.e, s: { ...q.s, low: q.s.low.map((v) => (v === null ? Infinity : v)),
  fire: q.s.fire.map((v) => (v === null ? Infinity : v)) } });

const t0 = Date.now();
const raw = process.env.FROM
  ? process.env.FROM.split(',').flatMap((f) => JSON.parse(readFileSync(f, 'utf8'))).map(thaw)
  : surveyAll();
if (process.env.SAVE) writeFileSync(process.env.SAVE, JSON.stringify(raw.map(freeze)));

// Pairs either side of her get the same numbers, mirrored.
const mirror = (d) => (360 - d) % 360;
for (const a of raw) {
  const x = a.e.spec.x || 0;
  if (x <= 0.01) continue;
  const b = raw.find((q) => q.e.kind === a.e.kind && Math.abs((q.e.spec.x || 0) + x) < 0.05
    && Math.abs(q.e.spec.z - a.e.spec.z) < 0.05);
  if (!b) continue;
  for (const key of ['low', 'fire']) {
    const both = a.s[key].map((v, d) => Math.max(v, b.s[key][mirror(d)]));
    a.s[key] = both;
    b.s[key] = both.map((_, d) => both[mirror(d)]);
  }
}

const r2 = (v) => Math.round(v * 100) / 100;
const down = (v) => Math.floor(v * 100) / 100;
const up = (v) => Math.ceil(v * 100) / 100;
const up3 = (v) => Math.ceil(v * 1000) / 1000;
/** A sector as the datasheet writes it: outward to the hundredth of a radian. */
const fmt = (sec) => sec.map(([a, b, el]) => (el === undefined ? [down(a), up(b)] : [down(a), up(b), up3(el)]));
const deg = (v) => (v / DEG).toFixed(0);
const out = [];
for (const q of raw) {
  const r = arcsOf(q.e, q.s);
  if (process.env.RAW) {
    const line = q.s.low.map((v, d) => {
      if (v === Infinity) return '#';
      const f = q.s.fire[d];
      if (f === Infinity) return 'x';
      const need = Math.max(v, f) - q.e.stops.min;
      return need <= 0.25 * DEG ? '.' : String(Math.max(0, Math.min(9, Math.floor(Math.max(v, f) / (10 * DEG)))));
    }).join('');
    console.log(`raw ${q.e.kind} ${q.e.i} ${line}`);
  }
  const rec = {
    kind: q.e.kind, i: q.e.i, x: q.e.spec.x || 0, z: q.e.spec.z, my: r2(q.s.my),
    angle: r2(r.angle), arc: down(r.arc), lift: fmt(r.lift), mask: fmt(r.mask),
  };
  out.push(rec);
  const sec = (list) => list.map(([a, b, el]) => `${deg(a)}..${deg(b)}${el === undefined ? ' dead' : ` >${(el / DEG).toFixed(1)}`}`).join(', ');
  console.log(`${rec.kind.padEnd(6)} ${String(rec.i).padStart(2)} (${String(rec.x).padStart(6)},${String(rec.z).padStart(7)})`
    + `  angle ${deg(r.angle).padStart(5)}  arc +-${deg(r.arc).padStart(3)}  fires on ${r.firing}/${r.span + 1} deg  my ${rec.my}`
    + (r.lift.length ? `\n         lift ${sec(r.lift)}` : '')
    + (r.mask.length ? `\n         mask ${sec(r.mask)}` : ''));
}
console.error(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (process.argv.includes('--json')) console.log(JSON.stringify(out));
