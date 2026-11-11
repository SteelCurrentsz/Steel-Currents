// Turn the owner's model of an AK-630 (assets/models/AK-630.glb) into what
// client/js/render/ak630.data.js ships: the turret alone -- the rounded
// gunhouse and its six-barrelled gun -- off the conical pedestal it was
// modelled on, the rail round that and the clutter at its foot (the ship has
// her own pedestal for it), cut in two: the gunhouse, which only trains, and
// the barrel cluster, which elevates out of the slot in its face.
//
//   npm i --no-save meshoptimizer@0.22
//   node build/prepare-ak630.mjs
//
// The model stands Y up, its barrels along +Z, in one welded skin. The
// gunhouse sits on a lip at the top of the pedestal's cone, and that lip is
// where it is cut off. It is brought to a gunhouse 1.7 m across, and painted
// the Sovremenny's colours: her AK-630s' grey, the barrels their dark (read off
// sovremennyHull.data.js). Writes client/js/render/ak630.data.js, which is
// committed, so a fresh clone runs without this script.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, readCompressed, simplifier, decimate } from './sculpt-source.mjs';
import { packPieceCompact } from './sculpt.mjs';
import { subMesh } from './sculpt-parts.mjs';

const SRC = process.argv[2] || path.join(ROOT, 'assets/models/AK-630.glb');
const OUT = path.join(ROOT, 'client/js/render/ak630.data.js');

// ---- where things are in the model, in its own units ------------------------
/** The axis it trains about: the middle of the gunhouse's ring. */
const AXIS = { x: 0.132, z: -0.189 };
/** The lip the gunhouse sits on: the cone of the pedestal is under it. */
const FOOT = 0.088;
/** Nothing of the gunhouse stands further out from its axis than this. */
const RIM = 0.56;
/** The barrel cluster's axis, across and up, and where it comes out of the gunhouse's face. */
const BORE = { x: 0.084, y: 0.32, r: 0.11, face: 0.31 };
/** Metres a unit: the gunhouse, 1.04 units across, 1.7 m. */
const UNIT = 1.7 / 1.04;

const raw = await readCompressed(SRC);
console.log(`${path.basename(SRC)}: ${raw.T.length / 3} triangles`);
const centre = (m, t) => {
  let x = 0, y = 0, z = 0;
  for (let k = 0; k < 3; k++) {
    const v = m.T[t * 3 + k];
    x += m.P[v * 3] / 3; y += m.P[v * 3 + 1] / 3; z += m.P[v * 3 + 2] / 3;
  }
  return [x, y, z];
};
const isGun = (x, y, z) => z > BORE.face && Math.hypot(x - BORE.x, y - BORE.y) < BORE.r;
// The turret: over the lip, inside its rim, or the barrels out in front of it.
const turret = subMesh(raw, (t) => {
  const [x, y, z] = centre(raw, t);
  return y > FOOT && (Math.hypot(x - AXIS.x, z - AXIS.z) < RIM || isGun(x, y, z));
});
// In metres, the train axis at the origin, the foot of the gunhouse at y = 0.
const toM = (m) => ({
  ...m,
  P: m.P.map((v, i) => (i % 3 === 0 ? (v - AXIS.x) * UNIT : i % 3 === 1 ? (v - FOOT) * UNIT : (v - AXIS.z) * UNIT)),
});
const S = await simplifier();
let house = toM(subMesh(turret, (t) => !isGun(...centre(turret, t))));
let gun = toM(subMesh(turret, (t) => isGun(...centre(turret, t))));
// What elevates, about its trunnion: inside the gunhouse, on the bore's line.
const trunnion = [0, +((BORE.y - FOOT) * UNIT).toFixed(3), +((BORE.face - 0.12 - AXIS.z) * UNIT).toFixed(3)];
gun = { ...gun, P: gun.P.map((v, i) => (i % 3 === 1 ? v - trunnion[1] : i % 3 === 2 ? v - trunnion[2] : v)) };
house = decimate(S, house, +(process.env.HOUSE_RATIO || 0.045), 0.0015);
gun = decimate(S, gun, +(process.env.GUN_RATIO || 0.08), 0.002);

// ---- its paint: the Sovremenny's AK-630s' ------------------------------------
const { SOV_GUNS } = await import('../client/js/render/sovremennyHull.data.js');
const { decodePiece } = await import('../client/js/render/sculpt.js');
const sov = decodePiece(SOV_GUNS.ciws.house);
const P0 = sov.attributes.position.array, C0 = sov.attributes.color.array, I0 = sov.index.array;
const cover = new Map();
for (let t = 0; t < I0.length; t += 3) {
  const [a, b, c] = [I0[t], I0[t + 1], I0[t + 2]];
  const ux = P0[b * 3] - P0[a * 3], uy = P0[b * 3 + 1] - P0[a * 3 + 1], uz = P0[b * 3 + 2] - P0[a * 3 + 2];
  const vx = P0[c * 3] - P0[a * 3], vy = P0[c * 3 + 1] - P0[a * 3 + 1], vz = P0[c * 3 + 2] - P0[a * 3 + 2];
  const key = `${C0[a * 3]},${C0[a * 3 + 1]},${C0[a * 3 + 2]}`;
  cover.set(key, (cover.get(key) || 0) + Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2);
}
const paints = [...cover].sort((p, q) => q[1] - p[1]).map(([k]) => k.split(',').map(Number));
const lum = (c) => c[0] + c[1] + c[2];
// Her grey, the paint most of it is; and the darkest of her paints that covers
// much of it at all, for the barrels.
const GREY = paints[0];
const DARK = paints.slice(0, 4).reduce((d, c) => (lum(c) < lum(d) ? c : d));
console.log(`paint: grey ${GREY}, barrels ${DARK} (linear)`);

// The muzzle: the end of the barrels.
let tip = -Infinity;
for (let i = 2; i < gun.P.length; i += 3) tip = Math.max(tip, gun.P[i]);
let mx = 0, my = 0, n = 0;
for (let i = 0; i < gun.P.length; i += 3) if (gun.P[i + 2] > tip - 0.05) { mx += gun.P[i]; my += gun.P[i + 1]; n++; }
const muzzle = [+(mx / n).toFixed(3), +(my / n).toFixed(3), +tip.toFixed(3)];
let roof = 0;
for (let i = 1; i < house.P.length; i += 3) roof = Math.max(roof, house.P[i]);
console.log(`gunhouse ${house.T.length / 3} triangles, gun ${gun.T.length / 3}; trunnion ${trunnion}, muzzle ${muzzle}, roof ${roof.toFixed(2)}`);

const out = {
  house: packPieceCompact(house, () => GREY).toString('base64'),
  guns: packPieceCompact(gun, () => DARK).toString('base64'),
  trunnion, muzzles: [muzzle], pitch: 0, roof: +roof.toFixed(3),
};
writeFileSync(OUT, '// Written by build/prepare-ak630.mjs from assets/models/AK-630.glb: the AK-630 turret\n'
  + '// off its pedestal, in metres, the train axis at the origin, the foot of the gunhouse at\n'
  + '// y = 0, the bore along +Z. `house` trains; `guns` elevates about `trunnion`.\n'
  + `export const AK630 = ${JSON.stringify(out)};\n`);
console.log(`wrote ${path.relative(ROOT, OUT)}`);
