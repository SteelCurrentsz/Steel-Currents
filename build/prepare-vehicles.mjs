// Turn the owner's models of the M4A2 Sherman and of the Landing Craft Mechanized
// into what client/js/render/vehicles.js draws: each one a few meshes painted
// a colour a point in the model's own paint, cut down to a size a battlefield
// with a dozen of them on it can afford, and put at its real size.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   SCULPT_TOOLS=<that node_modules> node build/prepare-vehicles.mjs
//
// Reads, as the owner uploaded them:
//   assets/models/m4a2_sherman-maximum-compressed.glb -- "M4A2 Sherman"
//     (https://skfb.ly/oAXAL) by barking_dogo, under Creative Commons
//     Attribution 4.0;
//   assets/models/LandingCraftTank.glb -- "US Marine Landing Craft Utility"
//     (https://skfb.ly/owIX6) by LM3D, under Creative Commons Attribution
//     4.0, drawn in the game as the Landing Craft Mechanized.
// Both credited on the game's Credits screen.
//
// The Sherman is cut in two: her hull and running gear, and her turret with
// its gun and the .50 on its roof, which trains about its own ring.
//
// Writes client/js/render/vehicles.data.js, which is committed, so a fresh
// clone runs without this script.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(process.env.SCULPT_TOOLS ? path.join(process.env.SCULPT_TOOLS, 'index.js') : import.meta.url);
const sharp = require('sharp');
const { MeshoptDecoder, MeshoptSimplifier } = require('meshoptimizer');
const OUT = path.join(ROOT, 'client/js/render/vehicles.data.js');

const mul = (a, b) => {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
};
function compose(n) {
  if (n.matrix) return Float64Array.from(n.matrix);
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  return Float64Array.from([
    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]);
}

/** Every triangle of a model where it stands, with the colour under each of its corners. */
async function flatten(file) {
  const buf = readFileSync(file);
  const jl = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + jl).toString());
  const bin = buf.subarray(20 + jl + 8);
  await MeshoptDecoder.ready;
  await MeshoptSimplifier.ready;
  const views = j.bufferViews.map((v) => {
    const e = v.extensions && v.extensions.EXT_meshopt_compression;
    if (!e) return bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    const out = new Uint8Array(e.count * e.byteStride);
    MeshoptDecoder.decodeGltfBuffer(out, e.count, e.byteStride,
      bin.subarray(e.byteOffset || 0, (e.byteOffset || 0) + e.byteLength), e.mode, e.filter);
    return Buffer.from(out.buffer);
  });
  const KIND = {
    5120: ['getInt8', 1, 127], 5121: ['getUint8', 1, 255], 5122: ['getInt16', 2, 32767],
    5123: ['getUint16', 2, 65535], 5125: ['getUint32', 4, 1], 5126: ['getFloat32', 4, 1],
  };
  const acc = (i) => {
    const a = j.accessors[i];
    const v = j.bufferViews[a.bufferView];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const [get, size, max] = KIND[a.componentType];
    const b = views[a.bufferView];
    const e = v.extensions && v.extensions.EXT_meshopt_compression;
    const stride = v.byteStride || (e && e.byteStride) || n * size;
    const dv = new DataView(b.buffer, b.byteOffset + (a.byteOffset || 0));
    const out = new Float64Array(a.count * n);
    for (let k = 0; k < a.count; k++) {
      for (let c = 0; c < n; c++) {
        const x = dv[get](k * stride + c * size, true);
        out[k * n + c] = a.normalized ? Math.max(-1, x / max) : x;
      }
    }
    return { out, n };
  };
  // The textures, decoded once each, to be read under every corner.
  const tex = new Map();
  const texture = async (ti) => {
    if (tex.has(ti)) return tex.get(ti);
    const img = j.images[j.textures[ti].source];
    const { data, info } = await sharp(Buffer.from(views[img.bufferView])).removeAlpha().raw()
      .toBuffer({ resolveWithObject: true });
    const t = { data, w: info.width, h: info.height };
    tex.set(ti, t);
    return t;
  };
  const paint = [];
  for (const m of j.materials || []) {
    const pbr = m.pbrMetallicRoughness || {};
    const f = pbr.baseColorFactor || [1, 1, 1, 1];
    paint.push({ name: m.name, f, tex: pbr.baseColorTexture ? await texture(pbr.baseColorTexture.index) : null });
  }
  const colourAt = (mi, u, v) => {
    const p = paint[mi] || { f: [0.6, 0.6, 0.6, 1] };
    let r = 1, g = 1, b = 1;
    if (p.tex) {
      const t = p.tex;
      const x = Math.min(t.w - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * t.w)));
      const y = Math.min(t.h - 1, Math.max(0, Math.floor((((v % 1) + 1) % 1) * t.h)));
      const o = (y * t.w + x) * 3;
      // sRGB in the file, linear for the factor, sRGB again out.
      const lin = (c) => (c / 255) ** 2.2;
      r = lin(t.data[o]); g = lin(t.data[o + 1]); b = lin(t.data[o + 2]);
    }
    const s = (c) => Math.min(1, Math.max(0, c)) ** (1 / 2.2);
    return [s(r * p.f[0]), s(g * p.f[1]), s(b * p.f[2])];
  };

  const P = [], C = [], T = [], TM = [], TC = [];
  const walk = (ni, parent) => {
    const n = j.nodes[ni];
    const w = mul(parent, compose(n));
    if (n.mesh !== undefined) {
      const a = [w[0], w[1], w[2], w[4], w[5], w[6], w[8], w[9], w[10]];
      const det = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[3] * (a[1] * a[8] - a[2] * a[7]) + a[6] * (a[1] * a[5] - a[2] * a[4]);
      for (const prim of j.meshes[n.mesh].primitives) {
        if (prim.mode !== undefined && prim.mode !== 4) continue;
        const pos = acc(prim.attributes.POSITION);
        const uv = prim.attributes.TEXCOORD_0 !== undefined ? acc(prim.attributes.TEXCOORD_0) : null;
        const mi = prim.material ?? -1;
        const base = P.length / 3;
        const nv = pos.out.length / pos.n;
        for (let k = 0; k < nv; k++) {
          const x = pos.out[k * pos.n], y = pos.out[k * pos.n + 1], z = pos.out[k * pos.n + 2];
          P.push(w[0] * x + w[4] * y + w[8] * z + w[12], w[1] * x + w[5] * y + w[9] * z + w[13], w[2] * x + w[6] * y + w[10] * z + w[14]);
          C.push(...colourAt(mi, uv ? uv.out[k * 2] : 0, uv ? uv.out[k * 2 + 1] : 0));
        }
        const idx = prim.indices !== undefined ? acc(prim.indices).out : Float64Array.from({ length: nv }, (_, i) => i);
        for (let t = 0; t < idx.length; t += 3) {
          // The face's own colour: the paint under its middle and half way
          // out to each corner, so a big flat plate is the colour of the
          // plate rather than of whatever is under its four corners.
          if (uv) {
            const us = [0, 1, 2].map((k) => uv.out[idx[t + k] * 2]);
            const vs = [0, 1, 2].map((k) => uv.out[idx[t + k] * 2 + 1]);
            const cu = (us[0] + us[1] + us[2]) / 3, cv = (vs[0] + vs[1] + vs[2]) / 3;
            const acc3 = [0, 0, 0];
            const add = (u, v) => { const c = colourAt(mi, u, v); acc3[0] += c[0]; acc3[1] += c[1]; acc3[2] += c[2]; };
            add(cu, cv);
            for (let k = 0; k < 3; k++) add((cu + us[k]) / 2, (cv + vs[k]) / 2);
            TC.push(acc3[0] / 4, acc3[1] / 4, acc3[2] / 4);
          } else TC.push(...colourAt(mi, 0, 0));
          if (det < 0) T.push(base + idx[t], base + idx[t + 2], base + idx[t + 1]);
          else T.push(base + idx[t], base + idx[t + 1], base + idx[t + 2]);
          TM.push(mi);
        }
      }
    }
    for (const c of n.children || []) walk(c, w);
  };
  const I = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  for (const r of j.scenes[j.scene || 0].nodes) walk(r, I);
  return { P, C, T, TM, TC, mats: (j.materials || []).map((m) => m.name) };
}

function bounds(P, T) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const v of T) for (let c = 0; c < 3; c++) {
    lo[c] = Math.min(lo[c], P[v * 3 + c]); hi[c] = Math.max(hi[c], P[v * 3 + c]);
  }
  return { lo, hi };
}

/**
 * One part of a model as a mesh the game can carry: its corners welded where
 * they meet (their colours averaged), then cut down to about `want` faces.
 */
function part(model, tris, want, xf) {
  const key = new Map();
  const pos = [], col = [], cnt = [];
  const idx = [];
  for (const t of tris) {
    // Weighted by its area, so a sliver does not colour a whole plate.
    const pa = [0, 1, 2].map((k) => model.T[t * 3 + k]);
    const e1 = [0, 1, 2].map((c) => model.P[pa[1] * 3 + c] - model.P[pa[0] * 3 + c]);
    const e2 = [0, 1, 2].map((c) => model.P[pa[2] * 3 + c] - model.P[pa[0] * 3 + c]);
    const area = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) + 1e-9;
    for (let k = 0; k < 3; k++) {
      const v = model.T[t * 3 + k];
      const p = xf(model.P[v * 3], model.P[v * 3 + 1], model.P[v * 3 + 2]);
      const kk = `${Math.round(p[0] * 400)},${Math.round(p[1] * 400)},${Math.round(p[2] * 400)}`;
      let i = key.get(kk);
      if (i === undefined) {
        i = pos.length / 3;
        key.set(kk, i);
        pos.push(...p);
        col.push(0, 0, 0);
        cnt.push(0);
      }
      col[i * 3] += model.TC[t * 3] * area; col[i * 3 + 1] += model.TC[t * 3 + 1] * area; col[i * 3 + 2] += model.TC[t * 3 + 2] * area;
      cnt[i] += area;
      idx.push(i);
    }
  }
  for (let i = 0; i < cnt.length; i++) for (let c = 0; c < 3; c++) col[i * 3 + c] /= cnt[i];
  // Faces collapsed to a line by the weld are dropped.
  const clean = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (a !== b && b !== c && a !== c) clean.push(a, b, c);
  }
  const P32 = new Float32Array(pos);
  let I = new Uint32Array(clean);
  if (I.length / 3 > want) {
    // Her small fittings are each a closed run of faces of their own, so
    // nothing is locked at its edges: a bolt head may go to nothing.
    let err = 0.004;
    for (let k = 0; k < 6 && I.length / 3 > want * 1.15; k++, err *= 2.2) {
      [I] = MeshoptSimplifier.simplify(I, P32, 3, want * 3, err, []);
    }
  }
  // Only the corners still used.
  const remap = new Map();
  const P2 = [], C2 = [], I2 = [];
  for (const v of I) {
    let n = remap.get(v);
    if (n === undefined) {
      n = P2.length / 3;
      remap.set(v, n);
      P2.push(P32[v * 3], P32[v * 3 + 1], P32[v * 3 + 2]);
      C2.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]);
    }
    I2.push(n);
  }
  return { P: P2, C: C2, I: I2 };
}

/** A part packed: corners at a millimetre-ish over its own box, bytes of colour, and its faces. */
function pack(p) {
  const { lo, hi } = bounds(p.P, Array.from({ length: p.P.length / 3 }, (_, i) => i));
  const n = p.P.length / 3;
  const head = new Float32Array([n, p.I.length, ...lo, ...hi]);
  const q = new Uint16Array(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
    const s = hi[c] - lo[c] || 1;
    q[i * 3 + c] = Math.round(((p.P[i * 3 + c] - lo[c]) / s) * 65535);
  }
  const col = Uint8Array.from(p.C, (c) => Math.round(Math.min(1, Math.max(0, c)) * 255));
  const big = n > 65535;
  const ix = big ? Uint32Array.from(p.I) : Uint16Array.from(p.I);
  const parts = [Buffer.from(head.buffer), Buffer.from(q.buffer), Buffer.from(col)];
  // Pad the colour bytes so the faces start on their own boundary.
  const pad = (4 - ((head.byteLength + q.byteLength + col.byteLength) % 4)) % 4;
  parts.push(Buffer.alloc(pad), Buffer.from(ix.buffer));
  console.log(`  ${n} points, ${p.I.length / 3} faces`);
  return Buffer.concat(parts).toString('base64');
}

const out = [
  '// Generated by build/prepare-vehicles.mjs from the owner\'s models.',
  '// Do not hand-edit -- regenerate from the source assets instead.',
];

// ---- the Sherman -------------------------------------------------------------------
{
  const m = await flatten(path.join(ROOT, 'assets/models/m4a2_sherman-maximum-compressed.glb'));
  console.log('sherman:', m.T.length / 3, 'faces; materials', m.mats.join(', '));
  const all = Array.from({ length: m.T.length / 3 }, (_, i) => i);
  const { lo, hi } = bounds(m.P, m.T);
  console.log('  box', lo.map((v) => v.toFixed(2)), hi.map((v) => v.toFixed(2)));
  // Her long axis is her length: the hull alone, without the gun out over
  // her bow, is 5.92 m, and the gun is what the turret faces down.
  const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const along = ext[0] > ext[2] ? 0 : 2;
  const across = along === 0 ? 2 : 0;
  // Her hull: everything that is not turret.
  // Her turret is its own casting and its own material; the .50 on its roof
  // and the rounds by it go with it, but not the .30 in her bow, which is
  // hers and lower down.
  const tower = new Set(m.mats.map((n, i) => (/Tower/.test(n) ? i : -1)).filter((i) => i >= 0));
  const loose = new Set(m.mats.map((n, i) => (/MG_|Bullet/.test(n) ? i : -1)).filter((i) => i >= 0));
  const towerTris = all.filter((t) => tower.has(m.TM[t]));
  const towerLo = bounds(m.P, towerTris.flatMap((t) => [m.T[t * 3], m.T[t * 3 + 1], m.T[t * 3 + 2]])).lo[1];
  const high = (t) => (m.P[m.T[t * 3] * 3 + 1] + m.P[m.T[t * 3 + 1] * 3 + 1] + m.P[m.T[t * 3 + 2] * 3 + 1]) / 3 > towerLo;
  const isTurret = (t) => tower.has(m.TM[t]) || (loose.has(m.TM[t]) && high(t));
  const hullTris = all.filter((t) => !isTurret(t));
  const turTris = all.filter(isTurret);
  const hb = bounds(m.P, hullTris.flatMap((t) => [m.T[t * 3], m.T[t * 3 + 1], m.T[t * 3 + 2]]));
  const scale = 2.62 / (hb.hi[across] - hb.lo[across]);
  const tb = bounds(m.P, turTris.flatMap((t) => [m.T[t * 3], m.T[t * 3 + 1], m.T[t * 3 + 2]]));
  // Which way is her bow: the gun reaches out past the hull that way.
  const gunFwd = (tb.hi[along] - hb.hi[along]) > (hb.lo[along] - tb.lo[along]) ? 1 : -1;
  const xc = (hb.lo[across] + hb.hi[across]) / 2;
  const zc = (hb.lo[along] + hb.hi[along]) / 2;
  const y0 = hb.lo[1];
  // The turret ring: the middle of the turret casting, which is the turret's
  // own box without the gun reaching forward of it.
  const castTris = turTris.filter((t) => {
    for (let k = 0; k < 3; k++) {
      const v = m.T[t * 3 + k];
      const a = m.P[v * 3 + along];
      if (gunFwd > 0 ? a > tb.lo[along] + (tb.hi[along] - tb.lo[along]) * 0.62 : a < tb.hi[along] - (tb.hi[along] - tb.lo[along]) * 0.62) return false;
    }
    return true;
  });
  const cb = bounds(m.P, castTris.flatMap((t) => [m.T[t * 3], m.T[t * 3 + 1], m.T[t * 3 + 2]]));
  const ringX = (cb.lo[across] + cb.hi[across]) / 2;
  const ringZ = (cb.lo[along] + cb.hi[along]) / 2;
  const ringY = tb.lo[1];
  // +X to starboard, +Y up, +Z to her bow.
  const frame = (ox, oy, oz) => (x, y, z) => {
    const p = [x, y, z];
    const sx = across === 0 ? 1 : -1;
    return [
      (p[across] - ox) * scale * gunFwd * sx * (along === 2 ? 1 : -1),
      (p[1] - oy) * scale,
      (p[along] - oz) * scale * gunFwd,
    ];
  };
  const hullPart = part(m, hullTris, 9000, frame(xc, y0, zc));
  const turPart = part(m, turTris, 4500, frame(ringX, ringY, ringZ));
  const ring = frame(xc, y0, zc)(...(along === 2 ? [ringX, ringY, ringZ] : [ringZ, ringY, ringX]).map((v, i) => v));
  const ringAt = (() => {
    const p = [0, 0, 0];
    p[across] = ringX; p[1] = ringY; p[along] = ringZ;
    return frame(xc, y0, zc)(...p);
  })();
  console.log('  scale', scale.toFixed(4), 'length', ((hb.hi[along] - hb.lo[along]) * scale).toFixed(2),
    'height', ((Math.max(hb.hi[1], tb.hi[1]) - y0) * scale).toFixed(2), 'ring', ringAt.map((v) => v.toFixed(2)), ring && '');
  // The muzzle: the far end of the turret, in the turret's own frame.
  const tp = turPart.P;
  let mz = -Infinity;
  for (let i = 2; i < tp.length; i += 3) mz = Math.max(mz, tp[i]);
  console.log('  hull'); const H = pack(hullPart);
  console.log('  turret'); const Tt = pack(turPart);
  out.push(`export const SHERMAN_HULL = "${H}";`);
  out.push(`export const SHERMAN_TURRET = "${Tt}";`);
  out.push(`export const SHERMAN_RING = [${ringAt.map((v) => +v.toFixed(3)).join(', ')}];`);
  out.push(`export const SHERMAN_MUZZLE = ${+mz.toFixed(3)};`);
}

// ---- the landing craft -------------------------------------------------------------
{
  const m = await flatten(path.join(ROOT, 'assets/models/LandingCraftTank.glb'));
  console.log('landing craft:', m.T.length / 3, 'faces');
  const all = Array.from({ length: m.T.length / 3 }, (_, i) => i);
  const { lo, hi } = bounds(m.P, m.T);
  console.log('  box', lo.map((v) => v.toFixed(2)), hi.map((v) => v.toFixed(2)));
  const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const along = ext[0] > ext[2] ? 0 : 2;
  const across = along === 0 ? 2 : 0;
  // Twenty-two metres overall, an LCM(8)'s length.
  const LOA = +(process.env.LCM_LOA || 22);
  const scale = LOA / ext[along];
  // Which end is her bow: the ramp end is the low, open one, and her
  // pilothouse stands aft. The higher half is her stern.
  let fwdY = 0, aftY = 0;
  const mid = (lo[along] + hi[along]) / 2;
  for (let v = 0; v < m.P.length / 3; v++) {
    const y = m.P[v * 3 + 1];
    if (m.P[v * 3 + along] > mid) fwdY = Math.max(fwdY, y - lo[1]); else aftY = Math.max(aftY, y - lo[1]);
  }
  const dir = (process.env.LCM_FLIP ? -1 : 1) * (fwdY < aftY ? 1 : -1);
  const xc = (lo[across] + hi[across]) / 2;
  const zc = mid;
  // Her well is her bottom plating in the model, with no double bottom under
  // it: she is floated with it at the waterline, so the sea stays out of it.
  const DRAFT = 0;
  const xf = (x, y, z) => {
    const p = [x, y, z];
    return [
      (p[across] - xc) * scale * dir * (along === 2 ? 1 : -1),
      (p[1] - lo[1]) * scale - DRAFT + 1.0,
      (p[along] - zc) * scale * dir,
    ];
  };
  console.log('  scale', scale.toFixed(4), 'beam', (ext[across] * scale).toFixed(2), 'height', (ext[1] * scale).toFixed(2), 'bow', dir);
  // Her ramp is her bow: everything forward of the hinge across the foot of
  // it, cut free so it can be let go onto the beach. It is drawn up, laid
  // back at the angle the model has it.
  const HINGE = [0, 1.0, +(process.env.LCM_HINGE || 7.45)];
  const zOf = (t) => Math.min(...[0, 1, 2].map((k) => {
    const v = m.T[t * 3 + k];
    return xf(m.P[v * 3], m.P[v * 3 + 1], m.P[v * 3 + 2])[2];
  }));
  const rampTris = all.filter((t) => zOf(t) >= HINGE[2] - 0.05);
  const hullTris = all.filter((t) => zOf(t) < HINGE[2] - 0.05);
  const P = part(m, hullTris, 12000, xf);
  const R = part(m, rampTris, 2500, (x, y, z) => {
    const p = xf(x, y, z);
    return [p[0] - HINGE[0], p[1] - HINGE[1], p[2] - HINGE[2]];
  });
  out.push(`export const LCM_HULL = "${pack(P)}";`);
  out.push(`export const LCM_RAMP = "${pack(R)}";`);
  out.push(`export const LCM_HINGE = [${HINGE.join(', ')}];`);
}

writeFileSync(OUT, out.join('\n') + '\n');
console.log('wrote', path.relative(ROOT, OUT));
