// A gun put on a ship in place of the one her model draws, where her model
// draws its guns too coarsely to be shown close to: the mounting cut off her
// by build/kriss-hull.mjs keeps its place, its height and the way it is
// trained at rest, and its piece is swapped for the same kind of gun as
// another ship's model draws it.
//
//   await borrowGuns('client/js/render/<ship>Hull.data.js', { kind: ['<donor>', '<donor kind>'] })
//
// The donor is any ship whose hull data module carries its guns as pieces
// (`GUNS` or `<NAME>_GUNS`) in the frame of their own mountings -- pivot at
// the origin, foot at y = 0, bore along +Z -- which every one of them does.
// The borrowed piece's reach (how far its muzzles stand out from its pivot)
// and the height of its trunnions over her are written into every mounting
// of that kind on her; and a mounting at her side the model has trained in
// over her deck at rest -- a gun drawn pointing up, its barrels read the
// wrong way -- is trained out over her own side.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './kriss-hull.mjs';

export async function borrowGuns(out, swaps) {
  const file = path.isAbsolute(out) ? out : path.join(ROOT, out);
  let src = readFileSync(file, 'utf8');
  const line = (name) => {
    const m = src.match(new RegExp(`^export const ${name} = (.*);$`, 'm'));
    if (!m) throw new Error(`${out} has no ${name}`);
    return JSON.parse(m[1]);
  };
  const GUNS = line('GUNS'), MOUNTS = line('MOUNTS');
  for (const [kind, [donor, dk]] of Object.entries(swaps)) {
    const D = await import(pathToFileURL(path.join(ROOT, `client/js/render/${donor}Hull.data.js`)).href);
    const G = D.GUNS || D[`${donor.toUpperCase()}_GUNS`];
    const M = D.MOUNTS || D[`${donor.toUpperCase()}_MOUNTS`];
    if (!G || !G[dk]) throw new Error(`the ${donor} has no ${dk}`);
    const { each, ...piece } = G[dk];
    GUNS[kind] = piece;
    const reach = M && M[dk] && M[dk][0] ? M[dk][0].reach : Math.max(...piece.muzzles.map((m) => Math.hypot(m[0], m[2])));
    for (const m of MOUNTS[kind] || []) {
      m.reach = reach;
      m.my = +(m.y + piece.trunnion[1]).toFixed(2);
      if (Math.abs(m.x) > 4 && Math.sign(Math.sin(m.rest)) === Math.sign(m.x) * -1) m.rest = +(Math.sign(m.x) * Math.PI / 2).toFixed(4);
    }
    console.log(`${kind}: the ${donor}'s ${dk}, reach ${reach}`);
  }
  src = src.replace(/^export const GUNS = .*;$/m, () => `export const GUNS = ${JSON.stringify(GUNS)};`)
    .replace(/^export const MOUNTS = .*;$/m, () => `export const MOUNTS = ${JSON.stringify(MOUNTS)};`);
  writeFileSync(file, src);
}

/**
 * Turn a kind's barrels afresh on a lathe, where the model draws them as a
 * few flat-sided boxes: one round, tapered barrel along each of its bores, in
 * the frame of its cradle -- from `from` metres ahead of the trunnions out to
 * the model's own muzzle -- `r0` round at the breech end and `r1` at the
 * muzzle, with the swell of a muzzle at the end of it, painted `rgb` (a
 * colour as the hull's palette stores it, in light, 0-255).
 */
export async function turnBarrels(out, kind, { r0, r1, from = 0.2, rgb, sides = 20 }) {
  const { packPieceCompact } = await import('./sculpt.mjs');
  const file = path.isAbsolute(out) ? out : path.join(ROOT, out);
  let src = readFileSync(file, 'utf8');
  const GUNS = JSON.parse(src.match(/^export const GUNS = (.*);$/m)[1]);
  const g = GUNS[kind];
  const P = [], N = [], T = [];
  // The barrel's profile, breech to muzzle: [z along it from 0 to 1, radius].
  const prof = [[0, r0 * 1.12], [0.04, r0 * 1.12], [0.05, r0], [0.35, r0 * 0.93], [0.93, r1], [0.965, r1 * 1.16], [1, r1 * 1.12]];
  for (const m of g.muzzles) {
    const [mx, my, mz] = m;
    const len = mz - from;
    const ring0 = P.length / 3;
    for (const [f, r] of prof) {
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        P.push(mx + Math.cos(a) * r, my + Math.sin(a) * r, from + f * len);
        N.push(Math.cos(a), Math.sin(a), 0);
      }
    }
    for (let k = 0; k + 1 < prof.length; k++) {
      for (let s = 0; s < sides; s++) {
        const a = ring0 + k * sides + s, b = ring0 + k * sides + ((s + 1) % sides);
        const c = a + sides, d = b + sides;
        T.push(a, b, d, a, d, c);
      }
    }
    // Her bore: the muzzle's face, dark inside a ring.
    const face = P.length / 3;
    const end = from + len;
    P.push(mx, my, end); N.push(0, 0, 1);
    const last = ring0 + (prof.length - 1) * sides;
    for (let s = 0; s < sides; s++) T.push(face, last + s, last + ((s + 1) % sides));
  }
  g.guns = packPieceCompact({ P, N, T }, () => rgb).toString('base64');
  src = src.replace(/^export const GUNS = .*;$/m, () => `export const GUNS = ${JSON.stringify(GUNS)};`);
  writeFileSync(file, src);
  console.log(`${kind}: ${g.muzzles.length} barrels turned, ${T.length / 3} triangles`);
}
