// Turn the owner's model of a Phalanx Mk 15 (assets/models/PhalanxCIWS.glb)
// into what client/js/render/phalanx.data.js ships: the mounting alone, off
// the square pedestal and the clutter round its foot it was modelled on (the
// ship has her own seat for it), cut in two -- the turntable and the yoke,
// which only train, and what elevates between the yoke's arms: the radome,
// the gun and its six barrels, and the drum that feeds it.
//
//   npm i --no-save meshoptimizer@0.22
//   node build/prepare-phalanx.mjs
//
// The model stands Y up, its barrels along +Z, a little under two units tall
// from the foot of its pedestal to the top of its radome; the real thing is
// 4.7 m, which sets the scale. Writes client/js/render/phalanx.data.js, which
// is committed, so a fresh clone runs without this script.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, readCompressed, simplifier, decimate } from './sculpt-source.mjs';
import { components, packPieceCompact } from './sculpt.mjs';
import { subMesh } from './sculpt-parts.mjs';

const SRC = process.argv[2] || path.join(ROOT, 'assets/models/PhalanxCIWS.glb');
const OUT = path.join(ROOT, 'client/js/render/phalanx.data.js');

// ---- where things are in the model, in its own units ------------------------
/** Metres a unit: 4.7 m over the model's full height. */
const UNIT = 4.7 / 1.902;
/** The top of the pedestal: what is under it goes. */
const FOOT = -0.43;
/** The axis it trains about, and the axis its gun elevates about. */
const AXIS = { x: 0.03, z: -0.17 };
const TRUNNION = { y: 0.0, z: -0.17 };
/** The yoke's arms stand out past this from the axis, up to its top. */
const ARM = 0.27, ARM_TOP = 0.13;

const raw = await readCompressed(SRC);
console.log(`${path.basename(SRC)}: ${raw.T.length / 3} triangles`);
const centre = (t) => {
  let x = 0, y = 0, z = 0;
  for (let k = 0; k < 3; k++) {
    const v = raw.T[t * 3 + k];
    x += raw.P[v * 3] / 3; y += raw.P[v * 3 + 1] / 3; z += raw.P[v * 3 + 2] / 3;
  }
  return [x, y, z];
};

// Off its pedestal; and the round standing loose beside it, the clutter at
// its foot and every crumb too small to be seen.
let mount = subMesh(raw, (t) => centre(t)[1] > FOOT);
const parts = components(mount);
const drop = new Uint8Array(mount.T.length / 3);
let dropped = 0;
for (const c of parts.slice(1)) {
  const cx = (c.lo[0] + c.hi[0]) / 2, cy = (c.lo[1] + c.hi[1]) / 2;
  const size = Math.max(c.hi[0] - c.lo[0], c.hi[1] - c.lo[1], c.hi[2] - c.lo[2]) * UNIT;
  const loose = (cx < -0.36 && cy < 0) || size < 0.06 || (cy < FOOT + 0.05 && Math.hypot(cx - AXIS.x, (c.lo[2] + c.hi[2]) / 2 - AXIS.z) > 0.55);
  if (!loose) continue;
  for (const t of c.tris) drop[t] = 1;
  dropped++;
}
mount = subMesh(mount, (t) => !drop[t]);
console.log(`  ${parts.length} pieces, ${dropped} loose ones dropped`);

// In metres, the train axis at the origin and the top of the pedestal at y = 0.
const P = mount.P.slice();
for (let i = 0; i < P.length; i += 3) {
  P[i] = (P[i] - AXIS.x) * UNIT;
  P[i + 1] = (P[i + 1] - FOOT) * UNIT;
  P[i + 2] = (P[i + 2] - AXIS.z) * UNIT;
}
mount = { ...mount, P };
const tri = (t) => {
  let x = 0, y = 0, z = 0;
  for (let k = 0; k < 3; k++) {
    const v = mount.T[t * 3 + k];
    x += P[v * 3] / 3; y += P[v * 3 + 1] / 3; z += P[v * 3 + 2] / 3;
  }
  return [x, y, z];
};
const armR = ARM * UNIT, armTop = (ARM_TOP - FOOT) * UNIT, ring = 0.07 * UNIT;
const trains = (t) => {
  const [x, y] = tri(t);
  return y < ring || (Math.abs(x) > armR && y < armTop);
};
const S = await simplifier();
const yoke = decimate(S, subMesh(mount, trains), +(process.env.YOKE_RATIO || 0.012), 0.004);
let gun = subMesh(mount, (t) => !trains(t));
// What elevates, about its trunnion.
const ty = (TRUNNION.y - FOOT) * UNIT, tz = (TRUNNION.z - AXIS.z) * UNIT;
gun = { ...gun, P: gun.P.map((v, i) => (i % 3 === 1 ? v - ty : i % 3 === 2 ? v - tz : v)) };
gun = decimate(S, gun, +(process.env.GUN_RATIO || 0.012), +(process.env.GUN_ERR || 0.006), 0.1);

// ---- its paint --------------------------------------------------------------
// Haze grey all over, its radome white, its barrels and their clamps dark.
const lin = (h) => [16, 8, 0].map((s) => Math.round(((((h >> s) & 255) / 255) ** 2.2) * 255));
const GREY = lin(0xa9aeb2), WHITE = lin(0xe6e6e0), DARK = lin(0x3c4146);
const barrelTip = Math.max(...gun.P.filter((_, i) => i % 3 === 2));
const gunPaint = (i) => {
  const x = gun.P[i * 3], y = gun.P[i * 3 + 1], z = gun.P[i * 3 + 2];
  if (z > 0.95 && Math.hypot(x - 0.05 * UNIT, y - 0.015 * UNIT) < 0.2) return DARK;
  if (y > (0.2 - TRUNNION.y) * UNIT) return WHITE;
  return GREY;
};
// The muzzle: the end of the barrels.
let mx = 0, my = 0, n = 0;
for (let i = 0; i < gun.P.length; i += 3) {
  if (gun.P[i + 2] > barrelTip - 0.05) { mx += gun.P[i]; my += gun.P[i + 1]; n++; }
}
const muzzle = [+(mx / n).toFixed(3), +(my / n).toFixed(3), +barrelTip.toFixed(3)];
const roof = Math.max(...yoke.P.filter((_, i) => i % 3 === 1), ...gun.P.filter((_, i) => i % 3 === 1).map((v) => v + ty));
const trunnion = [0, +ty.toFixed(3), +tz.toFixed(3)];
console.log(`yoke ${yoke.T.length / 3} triangles, gun ${gun.T.length / 3}; trunnion ${trunnion}, muzzle ${muzzle}, roof ${roof.toFixed(2)}`);

const out = {
  house: packPieceCompact(yoke, () => GREY).toString('base64'),
  guns: packPieceCompact(gun, gunPaint).toString('base64'),
  trunnion, muzzles: [muzzle], pitch: 0, roof: +roof.toFixed(3),
};
writeFileSync(OUT, '// Written by build/prepare-phalanx.mjs from assets/models/PhalanxCIWS.glb: the Phalanx\n'
  + '// mounting off its pedestal, in metres, the train axis at the origin, the foot of what\n'
  + '// trains at y = 0, the bore along +Z. `house` trains; `guns` elevates about `trunnion`.\n'
  + `export const PHALANX = ${JSON.stringify(out)};\n`);
console.log(`wrote ${path.relative(ROOT, OUT)}`);
