// The trenches keels cut in the ground.
//
// The land is a mesh a hundred-odd metres between vertices, and a ship's
// bottom is fifteen across: a trench lofted into that mesh would be one dent
// a hundred metres wide, or nothing at all. So each scar is drawn on its own
// strip, at three or four metres a vertex, lofted through the ground as it is
// drawn plus the trench's own shape -- so its edge meets the land exactly --
// and the land has a hole cut in it under the trench (see cutLand), because
// otherwise the bottom of the trench is under the hill it was dug in and
// nobody would ever see it.
//
// Strips are kept per scar and only the scars that changed are lofted again:
// a ship ploughing up a beach lengthens one or two of them a few times a
// second, and the rest have not moved.

import * as THREE from '../../../vendor/three.module.js';
import { drawnGround, gougeShift, GOUGE_BERM } from '../../../shared/world.js';

/** How many scars the land can have a hole cut for at once. */
export const SCAR_CUTS = 48;
/** The hole is cut a little inside the trench's edge, where it is still below the land. */
const CUT_IN = 0.9;
/** Where across a trench the strip has its vertices, as a multiple of its half-width. */
const ACROSS = [0, 0.2, 0.4, 0.55, 0.7, 0.82, 0.92, 1, 1.15, 1.35, 1.55, GOUGE_BERM];

// Churned sand and earth, darker and wetter the deeper the cut.
const TURNED = [0.36, 0.31, 0.24];
const WET = [0.22, 0.20, 0.17];

/** The ground a scar's strip covers, as [minX, minZ, maxX, maxZ]. */
function boxOf(g) {
  const r = g.w * GOUGE_BERM;
  return [Math.min(g.x0, g.x1) - r, Math.min(g.z0, g.z1) - r, Math.max(g.x0, g.x1) + r, Math.max(g.z0, g.z1) + r];
}

function overlaps(a, b) {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

/**
 * The uniforms the land's materials read their holes from. One set, shared by
 * every land material in the scene.
 */
export function scarUniforms() {
  const seg = [];
  for (let i = 0; i < SCAR_CUTS; i++) seg.push(new THREE.Vector4());
  return {
    uScarSeg: { value: seg },
    uScarW: { value: new Float32Array(SCAR_CUTS) },
    uScarN: { value: 0 },
  };
}

/**
 * Teach a land material to leave a hole where a trench is.
 *
 * The test is the same distance-to-a-segment the height field does, so the
 * hole is exactly the shape of the trench floor the strip draws.
 */
export function cutLand(mat, uniforms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vScarP;')
      .replace('#include <project_vertex>',
        '#include <project_vertex>\nvScarP = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vScarP;
uniform vec4 uScarSeg[${SCAR_CUTS}];
uniform float uScarW[${SCAR_CUTS}];
uniform int uScarN;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
for (int i = 0; i < ${SCAR_CUTS}; i++) {
  if (i >= uScarN) break;
  vec4 s = uScarSeg[i];
  vec2 e = s.zw - s.xy;
  float t = clamp(dot(vScarP - s.xy, e) / max(dot(e, e), 1e-4), 0.0, 1.0);
  if (length(vScarP - s.xy - e * t) < uScarW[i]) discard;
}`);
  };
  mat.customProgramCacheKey = () => 'scarcut';
  return mat;
}

/**
 * The scars on a battlefield, as drawn.
 *
 * `tint(x, z)` is the colour the land is drawn in at a point, so a strip's edge
 * is the colour of the ground it fades into.
 */
export class Scars {
  constructor(scene, world, tint, uniforms) {
    this.scene = scene;
    this.world = world;
    this.tint = tint;
    this.uniforms = uniforms;
    this.rev = -1;
    this.wait = 0;
    // Scar id -> { key, pos, col, idx, seen }.
    this.strips = new Map();
    this.mesh = null;
    this.mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, metalness: 0,
      // Wins the tie with the land along its edge, where the two are the same
      // surface.
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
  }

  /** Loft every strip again: the land under them has been redrawn. */
  invalidate() {
    this.strips.clear();
    this.rev = -1;
  }

  /** Redraw what has changed. Held off a moment, like the land itself. */
  sync(dt) {
    const rev = this.world.scarRev || 0;
    if (rev === this.rev) return false;
    this.wait -= dt;
    if (this.wait > 0) return false;
    this.wait = 0.2;
    this.rev = rev;
    const list = this.world.gouges || [];
    const live = new Set();
    const moved = [];
    const keyOf = (g) => `${g.x0},${g.z0},${g.x1},${g.z1},${g.w},${g.d0},${g.d1}`;
    for (const g of list) {
      live.add(g.id);
      const had = this.strips.get(g.id);
      if (had && had.key === keyOf(g)) continue;
      if (had) moved.push(had.box);
      moved.push(boxOf(g));
    }
    for (const [id, st] of [...this.strips]) {
      if (!live.has(id)) { moved.push(st.box); this.strips.delete(id); }
    }
    // A trench cut since a neighbour was lofted has changed the neighbour's
    // ground as well, where they overlap: so everything that touches anything
    // that changed is lofted again, or the older strip shows the older ground
    // standing over the new trench.
    for (const g of list) {
      const had = this.strips.get(g.id);
      if (had && had.key === keyOf(g) && !moved.some((b) => overlaps(b, had.box))) continue;
      this.strips.set(g.id, { key: keyOf(g), box: boxOf(g), ...this.loft(g) });
    }
    this.build();
    this.holes();
    return true;
  }

  /** One scar's strip. */
  loft(g) {
    const ex = g.x1 - g.x0;
    const ez = g.z1 - g.z0;
    const L = Math.hypot(ex, ez);
    // Along it and square to it.
    const ax = L > 1e-3 ? ex / L : 1;
    const az = L > 1e-3 ? ez / L : 0;
    const nx = az;
    const nz = -ax;
    const reach = g.w * GOUGE_BERM;
    const start = -reach;
    const span = L + reach * 2;
    const steps = Math.max(2, Math.min(48, Math.ceil(span / 3.5)));
    const across = [...ACROSS.slice(1).map((u) => -u).reverse(), ...ACROSS];
    const cols = across.length;
    const pos = [];
    const col = [];
    const idx = [];
    // The land's colour, at either end and the middle: it changes slowly and
    // asking for it is the expensive part.
    const t0 = this.tint(g.x0, g.z0);
    const t1 = this.tint(g.x1, g.z1);
    for (let i = 0; i <= steps; i++) {
      const s = start + (span * i) / steps;
      const f = Math.min(1, Math.max(0, s / Math.max(L, 1e-3)));
      const land = [t0[0] + (t1[0] - t0[0]) * f, t0[1] + (t1[1] - t0[1]) * f, t0[2] + (t1[2] - t0[2]) * f];
      for (let j = 0; j < cols; j++) {
        const u = across[j];
        const x = g.x0 + ax * s + nx * u * g.w;
        const z = g.z0 + az * s + nz * u * g.w;
        const base = drawnGround(this.world, x, z);
        const shift = gougeShift(this.world, x, z);
        const y = base + shift;
        pos.push(x, y, z);
        // How turned over the ground is here: all of it in the trench, some on
        // the spoil, none at the edge of the strip.
        const deep = shift < 0 ? Math.min(1, -shift / Math.max(0.5, g.d1) + 0.35) : Math.min(0.5, shift * 0.6);
        const wet = y < 0.4 ? 1 : y < 2 ? (2 - y) / 1.6 : 0;
        const dug = [
          TURNED[0] + (WET[0] - TURNED[0]) * wet,
          TURNED[1] + (WET[1] - TURNED[1]) * wet,
          TURNED[2] + (WET[2] - TURNED[2]) * wet,
        ];
        // Furrows along the cut, where the plates and the bilge keels dragged.
        const grain = 1 + 0.07 * Math.sin(u * g.w * 1.9);
        for (let c = 0; c < 3; c++) col.push(Math.min(1, (land[c] + (dug[c] - land[c]) * deep) * grain));
      }
    }
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        // Wound so the ground faces the sky.
        idx.push(a, c, b, b, c, d);
      }
    }
    return { pos, col, idx };
  }

  build() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (!this.strips.size) return;
    const pos = [];
    const col = [];
    const idx = [];
    for (const st of this.strips.values()) {
      const base = pos.length / 3;
      for (const v of st.pos) pos.push(v);
      for (const v of st.col) col.push(v);
      for (const k of st.idx) idx.push(base + k);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = -1;
    this.scene.add(this.mesh);
  }

  /**
   * Which trenches the land has a hole cut for: the newest, as many as there
   * is room for, and only where the floor is above the sea -- a trench the
   * sea is over needs no hole, nobody can see into it.
   */
  holes() {
    const u = this.uniforms;
    let n = 0;
    const list = this.world.gouges || [];
    for (let i = list.length - 1; i >= 0 && n < SCAR_CUTS; i--) {
      const g = list[i];
      const top = Math.max(drawnGround(this.world, g.x0, g.z0), drawnGround(this.world, g.x1, g.z1));
      if (top < -1.5) continue;
      u.uScarSeg.value[n].set(g.x0, g.z0, g.x1, g.z1);
      u.uScarW.value[n] = g.w * CUT_IN;
      n++;
    }
    u.uScarN.value = n;
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    this.mat.dispose();
  }
}
