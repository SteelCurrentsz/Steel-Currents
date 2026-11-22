// Turn the town models made with Meshy for the game (assets/models/meshy-town/)
// into what client/js/render/works.js draws in place of its own box-built
// ones: the motor traffic of a British town of the late thirties and the
// forties -- a saloon, a double-decker, a lorry, an ambulance and a fire
// engine -- four of its landmark buildings, the parish church, the town
// hall, the cinema and the railway station, and the everyday ones: the
// semi-detached houses, the terraces, the blocks of flats and the
// warehouses; its street trees; the harbour's dock cranes; the airfield's
// hangars and watch office; and the Nissen huts the barracks are.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   SCULPT_TOOLS=<that node_modules> node build/prepare-town.mjs
//
// Each is painted at every corner off the model's own texture and cut down
// to what a town of hundreds of them can afford. The vehicles are put at
// their real size, standing on y = 0 with their bonnets to +Z, as propModel()
// had them. The buildings are put with their fronts to +Z, centred, standing
// on y = 0 and scaled so the larger side of their footprint is one: the town
// stretches each onto the footprint its plan gives it.
//
// The buildings carry a texture of their own, `tex` pixels square, baked off
// the full model onto the cut-down one (see build/townbake.mjs), with smooth
// normals: painted a colour at each corner instead, a facade cut to a couple
// of thousand faces had no corners left to hold its windows, and came out
// blotched. The traffic, the tree and the crane are painted at their corners
// as before: small, and the traffic tinted car by car.
//
// Writes client/js/render/townModels.data.js, which is committed, so a fresh
// clone runs without this script.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flatten, bounds, part, pack } from './glbkit.mjs';
import { bake } from './townbake.mjs';

const require = createRequire(process.env.SCULPT_TOOLS ? path.join(process.env.SCULPT_TOOLS, 'index.js') : import.meta.url);
const sharp = require('sharp');
const { MeshoptSimplifier } = require('meshoptimizer');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets/models/meshy-town');
const OUT = path.join(ROOT, 'client/js/render/townModels.data.js');
const DEBUG = process.env.TOWN_DEBUG || null;
// TOWN_ONLY=house,office: just those, to try a change on (the file written is then partial).
const ONLY = process.env.TOWN_ONLY?.split(',') || null;

// `turn`: quarter turns about the vertical that bring the model's front to +Z.
// A vehicle's `size` is its beam, height and length overall in metres, each
// axis fitted on its own: Meshy's are near enough in shape and not in
// proportion, and the town's streets and kerbs are laid out for the boxes
// propModel() drew. `faces`: what it is cut to -- the cars go about the town
// in hundreds.
const MODELS = {
  car: { turn: 1, size: [1.7, 1.65, 4.3], faces: 900 },
  bus: { turn: 1, size: [2.5, 4.3, 8.4], faces: 1400 },
  lorry: { turn: 1, size: [2.3, 2.7, 7.4], faces: 1200 },
  ambulance: { turn: 1, size: [2.1, 2.6, 5.4], faces: 1100 },
  engine: { turn: 1, size: [2.25, 2.7, 7.0], faces: 1400 },
  // The church's tower is at its street end, as the town's own has it.
  church: { turn: 3, tex: 1024, faces: 7000 },
  hall: { turn: 0, tex: 1024, faces: 7000 },
  cinema: { turn: 0, tex: 1024, faces: 7000 },
  station: { turn: 0, tex: 1024, faces: 7000 },
  // The everyday town, built in its hundreds, so cut harder.
  house: { turn: 0, tex: 512, faces: 1400 },
  terrace: { turn: 0, tex: 512, faces: 1800 },
  flats: { turn: 0, tex: 512, faces: 2200 },
  warehouse: { turn: 0, tex: 512, faces: 2200 },
  // The airfield's hangars and its watch office.
  hangar: { turn: 0, tex: 512, faces: 3000 },
  control: { turn: 0, tex: 512, faces: 3000 },
  // A street tree, seven and a half metres; the parks' big ones are it grown on.
  tree: { turn: 0, size: [4.6, 7.4, 4.6], faces: 700 },
  // A Nissen hut, the barracks: sixteen metres long, its door to +Z.
  barracks: { turn: 0, size: [8.6, 4.4, 16], faces: 1500 },
  // A dock crane, thirty metres to its machinery house's roof, its portal
  // over the origin and its jib out over the quay to +Z.
  crane: { turn: 1, height: 30, portal: true, faces: 4000 },
  // The rest of the town: the offices (most of its middle) and the towers,
  // the works, and the one-offs -- school, hospital, fire station, market,
  // the football ground's stand and the water tower.
  office: { turn: 0, tex: 512, faces: 2200 },
  tower: { turn: 0, tex: 1024, faces: 3000 },
  factory: { turn: 0, tex: 512, faces: 3000 },
  school: { turn: 0, tex: 1024, faces: 4000 },
  hospital: { turn: 0, tex: 1024, faces: 4000 },
  fire: { turn: 0, tex: 1024, faces: 4000 },
  market: { turn: 0, tex: 1024, faces: 4000 },
  stand: { turn: 0, tex: 512, faces: 4000 },
  watertower: { turn: 0, tex: 512, faces: 3000 },
};
for (const [k, v] of Object.entries(MODELS)) {
  const e = process.env[`TURN_${k.toUpperCase()}`];
  if (e !== undefined) v.turn = +e;
}

/**
 * A model with a texture: its corners where `xf` puts them, cut down to about
 * `cfg.faces` faces, its texture baked onto the cut-down faces afresh, and
 * packed -- corners, their places in the texture, their normals and the faces
 * -- with the texture as a JPEG `cfg.tex` pixels square. Meshy's are one mesh
 * of one primitive under one untransformed node, which is all this reads.
 */
async function textured(file, cfg, xf, turn) {
  const buf = readFileSync(file);
  const jl = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + jl).toString());
  const bin = buf.subarray(20 + jl + 8);
  const prim = j.meshes[0].primitives[0];
  if (j.meshes.length !== 1 || j.meshes[0].primitives.length !== 1) throw new Error(`${file}: more than one primitive`);
  const view = (v) => bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  const acc = (i) => {
    const a = j.accessors[i];
    const v = j.bufferViews[a.bufferView];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
    if (v.byteStride && v.byteStride !== n * (a.componentType === 5126 || a.componentType === 5125 ? 4 : 2)) throw new Error('strided');
    const raw = new Uint8Array(view(v).subarray(a.byteOffset || 0)).buffer;
    if (a.componentType === 5126) return new Float32Array(raw, 0, a.count * n);
    if (a.componentType === 5125) return new Uint32Array(raw, 0, a.count);
    if (a.componentType === 5123) return Uint32Array.from(new Uint16Array(raw, 0, a.count));
    throw new Error(`component type ${a.componentType}`);
  };
  const pos = acc(prim.attributes.POSITION);
  const uv = acc(prim.attributes.TEXCOORD_0);
  const nrm = acc(prim.attributes.NORMAL);
  const idx = acc(prim.indices);
  const n = pos.length / 3;
  const P = new Float32Array(n * 3);
  const N = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    P.set(xf(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]), i * 3);
    const [a, c] = turn(nrm[i * 3], nrm[i * 3 + 2]);
    N.set([a, nrm[i * 3 + 1], c], i * 3);
  }
  // Cut down with its corners welded wherever they meet, whatever the
  // texture does there: Meshy's textures come in hundreds of small pieces,
  // and a simplifier that keeps every edge between them keeps nearly every
  // face.
  const weld = new Map();
  const wOf = new Uint32Array(n);
  const reps = [];
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(P[i * 3] * 1e5)},${Math.round(P[i * 3 + 1] * 1e5)},${Math.round(P[i * 3 + 2] * 1e5)}`;
    let w = weld.get(key);
    if (w === undefined) { w = reps.length; weld.set(key, w); reps.push([]); }
    wOf[i] = w;
    reps[w].push(i);
  }
  const WP = new Float32Array(reps.length * 3);
  reps.forEach((r, w) => WP.set(P.subarray(r[0] * 3, r[0] * 3 + 3), w * 3));
  const WI = Uint32Array.from(idx, (v) => wOf[v]);
  let S = WI;
  for (let err = 0.002, k = 0; k < 8 && S.length / 3 > cfg.faces * 1.1; k++, err *= 2) {
    [S] = MeshoptSimplifier.simplify(WI, WP, 3, cfg.faces * 3, err, []);
  }
  // The cut-down model: its corners, its faces, and at each corner the
  // normals of the model's corners standing there, averaged.
  const used = new Map();
  const CP = [], CN = [], CI = [];
  for (const w of S) {
    let o = used.get(w);
    if (o === undefined) {
      o = CP.length / 3;
      used.set(w, o);
      CP.push(WP[w * 3], WP[w * 3 + 1], WP[w * 3 + 2]);
      const s = [0, 0, 0];
      for (const v of reps[w]) for (let c = 0; c < 3; c++) s[c] += N[v * 3 + c];
      const l = Math.hypot(...s) || 1;
      CN.push(s[0] / l, s[1] / l, s[2] / l);
    }
    CI.push(o);
  }
  // Its texture baked onto it afresh, off the full model's (see townbake.mjs).
  const img = view(j.bufferViews[j.images[j.textures[j.materials[prim.material].pbrMetallicRoughness.baseColorTexture.index].source].bufferView]);
  const { data, info } = await sharp(Buffer.from(img)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = bake({ P, UV: uv, I: idx, img: { data, w: info.width, h: info.height } }, { P: CP, I: CI, N: CN }, cfg.tex);
  const m = b.P.length / 3;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m; i++) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], b.P[i * 3 + c]); hi[c] = Math.max(hi[c], b.P[i * 3 + c]); }
  const head = new Float32Array([m, b.I.length, ...lo, ...hi, 0, 0, 1, 1]);
  const q = new Uint16Array(m * 3);
  const qu = new Uint16Array(m * 2);
  const qn = new Int8Array(m * 3);
  for (let i = 0; i < m; i++) {
    for (let c = 0; c < 3; c++) q[i * 3 + c] = Math.round(((b.P[i * 3 + c] - lo[c]) / (hi[c] - lo[c] || 1)) * 65535);
    for (let c = 0; c < 2; c++) qu[i * 2 + c] = Math.round(Math.min(1, Math.max(0, b.UV[i * 2 + c])) * 65535);
    for (let c = 0; c < 3; c++) qn[i * 3 + c] = Math.round(b.N[i * 3 + c] * 127);
  }
  const parts = [head, q, qu, qn].map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  const off = parts.reduce((s, x) => s + x.length, 0);
  parts.push(Buffer.alloc((4 - (off % 4)) % 4));
  parts.push(Buffer.from((m > 65535 ? Uint32Array.from(b.I) : Uint16Array.from(b.I)).buffer));
  const jpg = await sharp(b.rgb, { raw: { width: cfg.tex, height: cfg.tex, channels: 3 } }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  if (DEBUG) writeFileSync(path.join(DEBUG, `${path.basename(file, '.glb')}.jpg`), jpg);
  console.log(`  ${m} points, ${b.I.length / 3} faces, ${b.charts} charts, texture ${(jpg.length / 1024).toFixed(0)} KB`);
  return { mesh: Buffer.concat(parts).toString('base64'), tex: jpg.toString('base64') };
}

const out = [
  '// Generated by build/prepare-town.mjs from the Meshy town models.',
  '// Do not hand-edit -- regenerate from assets/models/meshy-town/ instead.',
];
const entries = [];
for (const [name, cfg] of Object.entries(MODELS)) {
  const file = path.join(SRC, `${name}.glb`);
  if (ONLY && !ONLY.includes(name)) continue;
  if (!existsSync(file)) { console.log(`${name}: no model yet`); continue; }
  const m = await flatten(file);
  const all = Array.from({ length: m.T.length / 3 }, (_, i) => i);
  const { lo, hi } = bounds(m.P, m.T);
  let cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2;
  if (cfg.portal) {
    // Centred on its legs -- what of it stands in the lowest fifth -- not on
    // its box, which its jib drags out over the water.
    const leg = m.T.filter((v) => m.P[v * 3 + 1] < lo[1] + (hi[1] - lo[1]) * 0.2);
    const lb = bounds(m.P, leg);
    cx = (lb.lo[0] + lb.hi[0]) / 2; cz = (lb.lo[2] + lb.hi[2]) / 2;
  }
  // Turned so its front is +Z: (x, z) -> (z, -x) for each quarter turn.
  const turn = (x, z) => {
    for (let k = 0; k < ((cfg.turn % 4) + 4) % 4; k++) [x, z] = [z, -x];
    return [x, z];
  };
  const ext = turn(hi[0] - lo[0], hi[2] - lo[2]).map(Math.abs);
  const one = 1 / Math.max(ext[0], ext[1]);
  const tall = cfg.height ? cfg.height / (hi[1] - lo[1]) : 0;
  const [sx, sy, sz] = cfg.size
    ? [cfg.size[0] / ext[0], cfg.size[1] / (hi[1] - lo[1]), cfg.size[2] / ext[1]]
    : tall ? [tall, tall, tall] : [one, one, one];
  const xf = (x, y, z) => {
    const [a, c] = turn(x - cx, z - cz);
    return [a * sx, (y - lo[1]) * sy, c * sz];
  };
  if (cfg.tex) {
    console.log(`${name}: ${m.T.length / 3} faces in; ${(ext[0] * sx).toFixed(2)} x ${((hi[1] - lo[1]) * sy).toFixed(2)} x ${(ext[1] * sz).toFixed(2)}`);
    const t = await textured(file, cfg, xf, (x, z) => turn(x, z));
    entries.push(`  ${name}: { mesh: "${t.mesh}", tex: "${t.tex}" },`);
    continue;
  }
  const p = part(m, all, cfg.faces, xf);
  console.log(`${name}: ${m.T.length / 3} faces in; ${(ext[0] * sx).toFixed(2)} x ${((hi[1] - lo[1]) * sy).toFixed(2)} x ${(ext[1] * sz).toFixed(2)}`);
  if (DEBUG) writeFileSync(path.join(DEBUG, `${name}.json`), JSON.stringify(p));
  entries.push(`  ${name}: "${pack(p)}",`);
}
out.push('export const TOWN_MODELS = {', ...entries, '};', '');
writeFileSync(OUT, out.join('\n'));
console.log(`wrote ${path.relative(ROOT, OUT)}`);
