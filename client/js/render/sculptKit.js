// What the sculpted aeroplanes' model modules share: turning the pieces
// build/plane-sculpt.mjs packs back into geometries, welding two of them into
// one, the Luftwaffe paint the Messerschmitt and the Stuka wear and the US
// Navy's the Hellcat and the Dauntless wear.
//
// The B5N's, the Suisei's and the Zero's modules each carry their own copy of
// the decoding; these two are written against one.
import * as THREE from '../../../vendor/three.module.js';

function viewOf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new DataView(bytes.buffer);
}

/** One packed piece back into a geometry, the tag in the red of a byte colour. */
export function decodePiece(b64) {
  const dv = viewOf(b64);
  const nv = dv.getUint32(0, true);
  const nt = dv.getUint32(4, true);
  let p = 8;
  const pos = new Float32Array(nv * 3);
  for (let k = 0; k < nv * 3; k++, p += 2) pos[k] = dv.getInt16(p, true) / 1000;
  const nrm = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++, p += 3) {
    const x = dv.getInt8(p) / 127, y = dv.getInt8(p + 1) / 127, z = dv.getInt8(p + 2) / 127;
    const l = Math.hypot(x, y, z) || 1;
    nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l;
  }
  const col = new Uint8Array(nv * 3);
  for (let i = 0; i < nv; i++, p++) col[i * 3] = dv.getUint8(p);
  if (p % 2) p++;
  const idx = new Uint16Array(nt * 3);
  for (let k = 0; k < nt * 3; k++, p += 2) idx[k] = dv.getUint16(p, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

/** Decoded pieces welded into one, as if they had been packed together. */
export function weldPieces(...geos) {
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Uint8Array(nv * 3);
  const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
  let v = 0, i = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, v * 3);
    nrm.set(g.attributes.normal.array, v * 3);
    col.set(g.attributes.color.array, v * 3);
    const src = g.index.array;
    for (let k = 0; k < src.length; k++) idx[i + k] = src[k] + v;
    v += g.attributes.position.count;
    i += src.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

const hex = (h) => {
  const c = new THREE.Color(h);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
};

/**
 * The Kriegsmarine's shipboard Luftwaffe finish, as GLSL: RLM 72 and 73
 * greens in a splinter pattern over RLM 65 blue, and the Balkenkreuz -- the
 * black cross with its white borders. Trägergruppe 186 was painted in it.
 *
 * `lwSplinter(a, b)` is the two greens laid in hard-edged angular patches
 * across the plane of (a, b); `lwCross(u, v, r)` is 0 off a cross of half
 * size `r` centred at (0, 0), 1 on its white and 2 on its black.
 */
export const LUFTWAFFE = /* glsl */`
vec3 lwSplinter(float a, float b) {
  float i = floor((a * 0.82 + b * 0.57) / 2.3 + 0.3);
  float j = floor((-a * 0.47 + b * 0.88) / 3.1 + 0.6);
  return mod(i + j, 2.0) < 0.5 ? ${hex(0x3f4a3a)} : ${hex(0x56604a)};
}
float lwCross(float u, float v, float r) {
  float au = abs(u), av = abs(v);
  if (au > r || av > r) return 0.0;
  float w = r * 0.34, k = r * 0.17, e = r * 0.86;
  if ((au < k && av < e) || (av < k && au < e)) return 2.0;
  if (au < w || av < w) return 1.0;
  return 0.0;
}
`;
export const LW = {
  BLUE: hex(0x93a6b6), WHITE: hex(0xe6e6e0), BLACK: hex(0x161616), BLACKGREEN: hex(0x262c24),
  GLASS: hex(0x3a4d5a), TYRE: hex(0x1b1b1b), METAL: hex(0x34363a), CAVE: hex(0x4a4c42),
  BOMB: hex(0x646b5a), BAND: hex(0xc9a227), FISH: hex(0x8b9192), HEAD: hex(0x3a3f42),
  ENGINE: hex(0x3c3d3f), LEG: hex(0x7d827c), YELLOW: hex(0xd8b326), MOTTLE: hex(0x5d6650),
};

/**
 * The US Navy's 1943 finish, as GLSL: non-specular sea blue over everything
 * that faces up, intermediate blue down her sides and on her fin, and insignia
 * white underneath -- what the carrier squadrons flew from the spring of that
 * year -- and the star-and-bar with its blue surround.
 *
 * `usnStar(p, r)` is 0 off a national insignia of disc radius `r` centred at
 * (0, 0), its star pointing along +y and its bars along x; 1 on its white
 * and 2 on its blue.
 */
export const USNAVY = /* glsl */`
float usnStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-0.809016994375, -0.587785252292);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
float usnStar(vec2 p, float r) {
  float d = length(p);
  float o = r * 0.125;
  bool bar = abs(p.x) < r * 2.0 && abs(p.y) < r * 0.25;
  bool rim = (abs(p.x) < r * 2.0 + o && abs(p.y) < r * 0.25 + o) || d < r + o;
  if (d < r) return usnStar5(p, r * 0.98, 0.38) < 0.0 ? 1.0 : 2.0;
  if (bar) return 1.0;
  if (rim) return 2.0;
  return 0.0;
}
`;
export const USN = {
  SEA: hex(0x2c3a4f), MID: hex(0x4f6880), WHITE: hex(0xdcdfdc), STAR: hex(0xe8e8e2),
  BLUE: hex(0x1f3563), GLASS: hex(0x3a4d5a), TYRE: hex(0x1b1b1b), METAL: hex(0x35383c),
  ENGINE: hex(0x3a3b3d), BLADE: hex(0x1e1f21), TIP: hex(0xd8b326), CAVE: hex(0x2e3a2c),
  BOMB: hex(0x4d5440), BAND: hex(0xc9a227), FISH: hex(0x7e8588), HEAD: hex(0x3a3f42),
  CHROMATE: hex(0x8a9a52),
};

/**
 * A material that paints each piece of a sculpt in the shader off the tag in
 * its colour and the point in her own frame: `paint` is GLSL defining
 * `vec3 <fn>(float tag, vec3 q, vec3 n)`. Double-sided, so a piece shot off
 * shows the inside of her skin at the break, drawn dark.
 */
export function paintedMaterial(key, fn, paint, shine) {
  const mat = new THREE.MeshPhongMaterial({
    color: 0xffffff, specular: 0x3a4046, shininess: 34, side: THREE.DoubleSide,
  });
  mat.userData.painted = true;
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
#ifndef USE_COLOR
attribute vec3 color;
#endif
varying float vSTag;
varying vec3 vSPos;
varying vec3 vSNrm;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSTag = floor(color.r * 255.0 + 0.5);
vSPos = position;
vSNrm = normal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vSTag;
varying vec3 vSPos;
varying vec3 vSNrm;
${LUFTWAFFE}
${USNAVY}
${paint}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = ${fn}(vSTag, vSPos, normalize(vSNrm));
if (!gl_FrontFacing) diffuseColor.rgb *= 0.12;`)
      .replace('#include <specularmap_fragment>', `#include <specularmap_fragment>
specularStrength = ${shine};`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}
