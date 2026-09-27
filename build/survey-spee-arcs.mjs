// How far round each of the Graf Spee's mountings can be trained before its
// guns would be laid into her own structure -- measured on the model she is
// drawn with, not guessed.
//
//   node build/survey-spee-arcs.mjs [--json]
//
// (RAW=1 prints every mounting's 360 bearings as clear or masked, too.)
//
// For every mounting and every bearing a degree apart, a ray is sent out along
// each barrel's line at the height of its trunnions (and a third of a metre
// either side of it, for the thickness of the barrel), against everything else
// of hers that is drawn: hull, superstructure, catapult and the gunhouse,
// shield or pedestal of every other mounting. Not their barrels: those train
// too, and a gun is not masked by its neighbour's barrel lying across its line
// when the neighbour is stowed, because in action the neighbour is not. The
// flak is surveyed laid five degrees up -- a torpedo bomber low on the water,
// the lowest it will ever be laid -- so its arc is one it can be laid anywhere
// in at any elevation without being drawn shooting through her; the one on her
// centreline, over Bruno, at fifteen. A bearing any of those rays meets steel
// on inside 150 m is masked.
//
// Each mounting's arc is the widest unmasked span round the bearing it is
// meant to face, two degrees in from the steel at each end, and its stowed
// bearing -- for those stowed fore and aft -- the end of that span nearest
// fore and aft. Printed as the numbers shared/ships.js carries.
//
// Last, every mounting is checked stowed as the model draws it: its barrels,
// from trunnion to muzzle, must not run into anything of hers, the other
// mountings' barrels included.

import * as THREE from '../vendor/three.module.js';
import { buildSpee } from '../client/js/render/spee.js';
import { SHIP_CLASSES } from '../shared/ships.js';
import { lightMounts, torpedoClear } from '../shared/sim.js';

const cls = SHIP_CLASSES.spee;
const built = buildSpee();
const g = built.group;
g.updateMatrixWorld(true);

const mounts = [
  ...built.turrets.map((m, i) => ({ kind: 'turret', i, m, spec: cls.turrets[i], up: 0 })),
  ...built.secMounts.map((m, i) => ({ kind: 'sec', i, m, spec: cls.secondary.mounts[i], up: 0 })),
  ...built.torpMounts.map((m, i) => ({ kind: 'torp', i, m, spec: cls.torpedoes.mounts[i], up: 0 })),
  // A flak mounting on her centreline stands over the turret beside it and
  // fires over his roof, which it can only do laid up a little.
  ...built.aaMounts.map((m, i) => ({ kind: 'aa', i, m, spec: lightMounts(cls)[i],
    up: (Math.abs(lightMounts(cls)[i].x) < 0.01 ? 15 : 5) * Math.PI / 180 })),
];

const allMeshes = [];
g.traverse((o) => { if (o.isMesh && o.userData.mergeKey !== 'in') allMeshes.push(o); });
const owner = new Map();
for (const e of mounts) e.m.traverse((o) => { if (o.isMesh) owner.set(o, e.m); });
// The parts of each mounting that elevate: its barrels and their cradle.
const barrel = new Set();
for (const e of mounts) {
  const node = e.m.userData.gunNode;
  if (node && node !== e.m) node.traverse((o) => { if (o.isMesh) barrel.add(o); });
}

const rc = new THREE.Raycaster();
const DEG = Math.PI / 180;
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
// A mounting stowed fore and aft is stowed ahead if it is stowed forward of
// the beam now, and astern if abaft it.
const foreAndAft = (rest) => (Math.abs(wrap(rest)) < Math.PI / 2 ? 0 : Math.PI);

/** Which of the 360 bearings, a degree apart, this mounting can be laid on. */
function survey(e) {
  const { m, up } = e;
  const targets = allMeshes.filter((o) => owner.get(o) !== m && !barrel.has(o));
  const node = m.userData.gunNode || m;
  const p = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
  // Along the bore: the height of the muzzles as the mounting is built, not
  // the origin of the group that elevates -- a tube bank is laid at deck level
  // and its tubes stand a metre over it.
  let bore = 0;
  for (const v of m.userData.muzzles) bore += v.clone().applyMatrix4(node.matrixWorld).y;
  bore /= m.userData.muzzles.length;
  // The lateral offset of each barrel in the mounting's own frame.
  const offs = [...new Set((m.userData.muzzles || [{ x: 0 }]).map((v) => Math.round(v.x * 100) / 100))];
  const clear = [];
  for (let d = 0; d < 360; d++) {
    const b = d * DEG;
    const dir = new THREE.Vector3(Math.sin(b) * Math.cos(up), Math.sin(up), Math.cos(b) * Math.cos(up));
    const across = new THREE.Vector3(Math.cos(b), 0, -Math.sin(b));
    let ok = true;
    for (const ox of offs) {
      for (const dy of [-0.35, 0, 0.35]) {
        const o = p.clone().addScaledVector(across, ox);
        o.y = bore + dy;
        if (o.y < p.y + 0.25) continue;
        rc.set(o, dir);
        rc.far = 150;
        if (rc.intersectObjects(targets, false).length) { ok = false; break; }
      }
      if (!ok) break;
    }
    // A bank of tubes also has to put its fish in the water clear of her: the
    // simulation will not fire one across her own stern, and neither is a
    // bearing it cannot fire on part of its arc.
    if (ok && e.kind === 'torp') ok = torpedoClear(cls, e.spec, b > Math.PI ? b - 2 * Math.PI : b);
    clear.push(ok);
  }
  // Muzzle height, at the elevation it is built at.
  let my = 0;
  for (const v of m.userData.muzzles) my += v.clone().applyMatrix4(node.matrixWorld).y / m.userData.muzzles.length;
  return { clear, my, seat: p.y };
}

/**
 * The arc a mounting is given out of the bearings it can be laid on: the
 * widest clear span round the bearing it is there to cover -- her beam on its
 * own side, or for one on her centreline the way it faces -- two degrees in
 * from the steel at each end.
 */
function arcOf(e, clear) {
  const { spec } = e;
  const homeB = spec.x > 0.01 ? Math.PI / 2 : spec.x < -0.01 ? -Math.PI / 2 : spec.angle;
  const home = ((Math.round(homeB / DEG) % 360) + 360) % 360;
  if (!clear[home]) return { blockedHome: true };
  let lo = 0, hi = 0;
  while (lo < 359 && clear[(home - lo - 1 + 360) % 360]) lo++;
  while (hi < 359 && clear[(home + hi + 1) % 360]) hi++;
  if (lo + hi >= 358) { lo = 182; hi = 182; }
  const loB = wrap(homeB - (lo - 2) * DEG);
  const hiB = wrap(homeB + (hi - 2) * DEG);
  const angle = wrap(homeB + ((hi - lo) / 2) * DEG);
  const arc = Math.min(Math.PI, ((lo + hi - 4) / 2) * DEG);
  // Her fifteens and her tubes are stowed as near fore and aft as the span
  // allows. The flak is stowed where her datasheet says.
  let rest = null;
  if (spec.rest !== undefined && (e.kind === 'sec' || e.kind === 'torp')) {
    const want = foreAndAft(spec.rest);
    rest = Math.abs(wrap(want - angle)) <= arc ? want
      : (Math.abs(wrap(want - loB)) < Math.abs(wrap(want - hiB)) ? loB : hiB);
  }
  return { angle, arc, loB, hiB, rest };
}

const r2 = (v) => (v === null ? null : Math.round(v * 100) / 100);
const raw = mounts.map((e) => ({ e, s: survey(e) }));
// A pair of mountings either side of her is given the same arc, mirrored: a
// bearing is clear for either only if its mirror is clear for the other. The
// sculpt is not quite symmetrical, and a gun that can be laid three degrees
// further round to port than its twin can to starboard is a ship that fights
// better on one side than the other.
const mirror = (d) => (360 - d) % 360;
for (const a of raw) {
  if (a.e.spec.x <= 0.01) continue;
  const b = raw.find((q) => q.e.kind === a.e.kind && Math.abs(q.e.spec.x + a.e.spec.x) < 0.01
    && Math.abs(q.e.spec.z - a.e.spec.z) < 0.01);
  if (!b) continue;
  const both = a.s.clear.map((ok, d) => ok && b.s.clear[mirror(d)]);
  a.s.clear = both;
  b.s.clear = both.map((_, d) => both[mirror(d)]);
}
for (const q of raw) Object.assign(q.s, arcOf(q.e, q.s.clear));
if (process.env.RAW) {
  for (const { e, s } of raw) {
    console.log('raw', e.kind, e.i, s.clear.map((ok) => (ok ? '.' : '#')).join(''));
  }
}
for (const q of raw) delete q.s.clear;
const out = [];
for (const { e, s } of raw) {
  out.push({ kind: e.kind, i: e.i, x: e.spec.x, z: e.spec.z, ...Object.fromEntries(
    Object.entries(s).map(([k, v]) => [k, typeof v === 'number' ? r2(v) : v])) });
}
for (const o of out) {
  const deg = (v) => (v === null || v === undefined ? '' : (v / DEG).toFixed(0).padStart(5));
  console.log(`${o.kind.padEnd(6)} ${String(o.i).padStart(2)} (${String(o.x).padStart(6)},${String(o.z).padStart(7)})`
    + (o.blockedHome ? '  MASKED ON ITS OWN BEARING'
      : `  angle ${deg(o.angle)}  arc +-${deg(o.arc)}  span ${deg(o.loB)}..${deg(o.hiB)}`
      + `  rest ${deg(o.rest)}  my ${o.my}  seat ${o.seat}`));
}
if (process.argv.includes('--json')) console.log(JSON.stringify(out));

// Stowed as drawn, does any barrel run into anything?
let fouled = 0;
for (const e of mounts) {
  const { m } = e;
  const node = m.userData.gunNode || m;
  const targets = allMeshes.filter((o) => owner.get(o) !== m);
  for (const v of m.userData.muzzles) {
    const muzzle = v.clone().applyMatrix4(node.matrixWorld);
    // Down the bore, from the trunnion to the muzzle.
    const from = new THREE.Vector3(v.x, v.y, 0).applyMatrix4(node.matrixWorld);
    const d = muzzle.clone().sub(from);
    const len = d.length();
    if (len < 0.5) continue;
    rc.set(from, d.normalize());
    rc.far = len;
    const hit = rc.intersectObjects(targets, false)[0];
    if (hit) {
      fouled++;
      const who = owner.get(hit.object);
      const name = who ? mounts.find((q) => q.m === who) : null;
      console.log(`FOUL ${e.kind} ${e.i}: stowed barrel meets ${name ? `${name.kind} ${name.i}` : 'her structure'} `
        + `${hit.distance.toFixed(1)} m out`);
    }
  }
}
console.log(fouled ? `${fouled} stowed barrels foul something` : 'every stowed barrel is clear');
