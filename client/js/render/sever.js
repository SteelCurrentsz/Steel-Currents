// A ship cut in two.
//
// The simulation says where she parted and which side of it is still her (see
// cutHer in sim.js). What is drawn is the same ship twice: her own model,
// with everything on the far side of the tear not drawn, and a copy of it with
// everything on the near side not drawn -- which is the piece that went. The
// copy is let go into the sea where she was, with the way she had on her, and
// it settles and goes down on its own while she carries on without it.
//
// Not cut along a plane. Steel does not part along a line somebody ruled: the
// tear wanders a few metres either way of where the stem went in, round the
// frames and along the seams, so each fragment of her is kept or dropped by a
// noise laid over her section -- and the copy keeps exactly what she drops, so
// the two pieces fit one another tooth for tooth until they drift apart.
//
// She is a closed shell with her insides built into her (see interior.js),
// so a hull cut open shows her decks, her bulkheads and her machinery in
// section. The inside face of her plating is drawn too, dark -- it is the
// unpainted, unlit inside of a steel box -- and the metal along the tear is
// burnt and torn, which is what makes it read as a break and not a cutaway.

import * as THREE from '../../../vendor/three.module.js';

const TMP = new THREE.Vector3();

const VERT_HEAD = /* glsl */`
uniform mat4 uCutInv;
varying vec3 vCutP;
`;

// Her own frame, whatever this piece of her is parented to: the tear is laid
// on the ship, not on the mounting a fragment happens to belong to.
const VERT_BODY = /* glsl */`
{
  vec4 cutP = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    cutP = instanceMatrix * cutP;
  #endif
  vCutP = ( uCutInv * modelMatrix * cutP ).xyz;
}
`;

const FRAG_HEAD = /* glsl */`
uniform float uCutZ;
uniform float uCutSide;
uniform float uCutJag;
varying vec3 vCutP;
float cutTear;
float cutHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
// Value noise, blended linearly rather than smoothly: torn steel has corners.
float cutNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  float a = cutHash( i );
  float b = cutHash( i + vec2( 1.0, 0.0 ) );
  float c = cutHash( i + vec2( 0.0, 1.0 ) );
  float d = cutHash( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}
// Where along her the tear is, at this point of her section: a long wander
// round the frames, and short teeth on top of it.
float cutLine( vec3 p ) {
  vec2 q = vec2( p.x + p.y * 0.31, p.y - p.x * 0.17 );
  float n = cutNoise( q * 0.32 ) * 0.62 + cutNoise( q * 1.35 + 7.1 ) * 0.38;
  return uCutZ + uCutJag * ( n * 2.0 - 1.0 );
}
`;

const FRAG_CLIP = /* glsl */`
  cutTear = vCutP.z - cutLine( vCutP );
  if ( uCutSide * cutTear < 0.0 ) discard;
`;

const FRAG_TINT = /* glsl */`
  // The inside of her plating: bare, unlit steel.
  if ( !gl_FrontFacing ) diffuseColor.rgb *= vec3( 0.34, 0.31, 0.29 );
  // And the metal along the tear, burnt and rusted where it parted.
  {
    float edge = 1.0 - smoothstep( 0.0, 1.8, abs( cutTear ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.36, 0.25, 0.18 ), edge * 0.85 );
  }
`;

/** The uniforms one piece of her shares across every material it is drawn with. */
function cutUniforms(z, side, jag) {
  return {
    uCutInv: { value: new THREE.Matrix4() },
    uCutZ: { value: z },
    uCutSide: { value: side },
    uCutJag: { value: jag },
  };
}

/**
 * A copy of `src` that draws only the piece of her on its side of the tear.
 * Returns null for a material the tear cannot be put into -- a hand-written
 * shader -- and the caller keeps or drops the whole object instead.
 */
function cutMaterial(src, U) {
  if (!src || src.isShaderMaterial || src.isRawShaderMaterial) return null;
  const m = src.clone();
  const prev = src.onBeforeCompile;
  const prevKey = src.customProgramCacheKey ? src.customProgramCacheKey() : '';
  m.side = THREE.DoubleSide;
  m.onBeforeCompile = (shader, renderer) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(m, shader, renderer);
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace(/void main\(\) \{/, `void main() {\n${FRAG_CLIP}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_TINT}`);
  };
  m.customProgramCacheKey = () => `sever|${prevKey}`;
  m.userData = { ...(src.userData || {}), cutFrom: src };
  return m;
}

/**
 * Put every material under `root` behind the tear. Anything that cannot be
 * cut is kept whole if it stands on this side of the tear and hidden if it
 * does not -- a searchlight's beam, mostly.
 */
function cutTree(root, U, side, z, skip) {
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const at = new THREE.Vector3();
  root.traverse((o) => {
    if (skip && skip(o)) return;
    if (!o.material) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const cut = list.map((q) => cutMaterial(q, U));
    if (cut.every(Boolean) && (o.isMesh || o.isInstancedMesh)) {
      // A burnt-out turret has its own copy already; it is not shared, so it
      // can go, and the cut one keeps the burn.
      o.material = Array.isArray(o.material) ? cut : cut[0];
      o.userData.ownMat = true;
      o.userData.cutMat = true;
      return;
    }
    for (const q of cut) q && q.dispose();
    o.updateWorldMatrix(true, false);
    at.setFromMatrixPosition(o.matrixWorld).applyMatrix4(inv);
    if (side * (at.z - z) < 0) o.visible = false;
  });
}

/**
 * A copy of her, object for object, sharing her geometry and her materials.
 *
 * Not three's own clone: that copies every object's notes on itself through
 * JSON, and a mounting's notes point at its own gun cradle, which points back
 * at the mounting. The copy's notes are the original's, shared -- nothing
 * reads them off the piece that went.
 */
function cloneTree(o) {
  const ud = o.userData;
  o.userData = {};
  let c;
  try { c = o.clone(false); } finally { o.userData = ud; }
  c.userData = { ...ud };
  for (const ch of o.children) c.add(cloneTree(ch));
  return c;
}

/** Every material under `root` that this file made. */
function disposeCut(root) {
  root.traverse((o) => {
    if (!o.userData.cutMat || !o.material) return;
    for (const q of Array.isArray(o.material) ? o.material : [o.material]) q.dispose();
  });
}

/**
 * One cut: her own model torn at `z` (metres along her, her frame), keeping
 * the `keep` side (+1 forward of it, -1 abaft it), and the piece that went
 * adrift, if it is still to be seen.
 *
 * `motion` is how she was moving when it happened -- { v, h } -- or null when
 * the cut is being put on a ship that parted before we were watching, in
 * which case the piece is long gone and only she is drawn.
 */
/** A box in plan: centre, the way it points, and its half length and half beam. */
function box(x, z, h, hl, hb) {
  const ux = Math.sin(h), uz = Math.cos(h);
  return { x, z, ux, uz, vx: uz, vz: -ux, hl, hb };
}

/**
 * Whether two boxes in plan overlap, and if so the least way to part them:
 * `nx`, `nz` points from A toward B and `depth` is how far A has to go back
 * along it. Separating axes.
 */
function overlap(A, B) {
  const dx = B.x - A.x, dz = B.z - A.z;
  let best = Infinity, nx = 0, nz = 0;
  for (const [lx, lz] of [[A.ux, A.uz], [A.vx, A.vz], [B.ux, B.uz], [B.vx, B.vz]]) {
    const ra = A.hl * Math.abs(A.ux * lx + A.uz * lz) + A.hb * Math.abs(A.vx * lx + A.vz * lz);
    const rb = B.hl * Math.abs(B.ux * lx + B.uz * lz) + B.hb * Math.abs(B.vx * lx + B.vz * lz);
    const d = dx * lx + dz * lz;
    const over = ra + rb - Math.abs(d);
    if (over <= 0) return null;
    if (over < best) { best = over; const sg = d >= 0 ? 1 : -1; nx = lx * sg; nz = lz * sg; }
  }
  return { depth: best, nx, nz };
}

export class Severance {
  constructor(view, z, keep, motion = null) {
    this.view = view;
    this.z = z;
    this.keep = keep;
    const cls = view.cls;
    this.len = cls.hull.length;
    // How far either way of the line the tear wanders: a few metres on a
    // destroyer, ten on a battleship.
    this.jag = Math.min(9, 1.5 + cls.hull.beam * 0.16);
    const group = view.group;
    group.updateMatrixWorld(true);
    this.U = cutUniforms(z, keep, this.jag);
    this.U.uCutInv.value.copy(group.matrixWorld).invert();
    // The piece that went, while it is still worth drawing.
    this.piece = null;
    if (motion && group.parent) {
      const piece = cloneTree(group);
      // Nothing on it that belongs to her: her marker ring, her lights.
      const mi = group.children.indexOf(view.marker);
      if (mi >= 0 && piece.children[mi]) piece.remove(piece.children[mi]);
      const drop = [];
      piece.traverse((o) => {
        if (o.isLight) drop.push(o);
        else if (o.material && (o.material.isShaderMaterial
          || o.material.blending === THREE.AdditiveBlending)) drop.push(o);
      });
      for (const o of drop) if (o.parent) o.parent.remove(o);
      group.parent.add(piece);
      piece.position.copy(group.position);
      piece.quaternion.copy(group.quaternion);
      piece.updateMatrixWorld(true);
      this.PU = cutUniforms(z, -keep, this.jag);
      this.PU.uCutInv.value.copy(piece.matrixWorld).invert();
      cutTree(piece, this.PU, -keep, z, null);
      // Which end of it is the broken one, in its own frame: the end that
      // was joined to her.
      const far = keep > 0 ? -this.len / 2 : this.len / 2;
      const mid = (far + z) / 2;
      // It turns about its own middle, not about hers: a bow pitched about a
      // point a hundred metres abaft it would be thrown into the air.
      const pivot = new THREE.Vector3(0, 0, mid);
      piece.localToWorld(pivot);
      // How big a piece of her it is, which decides how long it floats.
      const share = Math.abs(far - z) / this.len;
      this.drift = {
        t: 0,
        // Her way, carried on and lost to the water; and the push of the two
        // pieces parting, along her length.
        vx: Math.sin(motion.h) * motion.v * 0.6,
        vz: Math.cos(motion.h) * motion.v * 0.6,
        apart: -keep * (1.5 + this.len * 0.006),
        yaw: (Math.random() - 0.5) * 0.05,
        // Down by its broken end, which is open to the sea (a positive trim
        // puts her +z down); and over to one side.
        trimTo: Math.sign(z - mid) * (0.06 + 0.16 * (1 - share)),
        rollTo: (Math.random() < 0.5 ? -1 : 1) * (0.06 + Math.random() * 0.22),
        // Seconds to go under: a bow takes a minute or two, half a battleship
        // takes four or five.
        T: 50 + 260 * share * Math.min(1.4, this.len / 200),
        depth: 30 + this.len * 0.25,
        mid,
        pivot,
        y0: pivot.y,
        pitch0: piece.rotation.x,
        roll0: piece.rotation.z,
      };
      this.piece = piece;
    }
    // And her, from now on only her side of the tear.
    cutTree(group, this.U, keep, z, (o) => o === view.marker);
  }

  /**
   * Once a frame, after she has been posed: the tear follows her, and the
   * piece that went goes on drifting and settling.
   *
   * Returns the piece's broken end in the world, when there is one to make
   * water and smoke at, or null.
   */
  step(dt, others = null) {
    const group = this.view.group;
    group.updateMatrixWorld(true);
    this.U.uCutInv.value.copy(group.matrixWorld).invert();
    const p = this.piece;
    if (!p) return null;
    const D = this.drift;
    D.t += dt;
    const u = Math.min(1, D.t / D.T);
    // Her way comes off it, and it parts from her and keeps parting.
    const keepWay = Math.exp(-dt / 9);
    D.vx *= keepWay;
    D.vz *= keepWay;
    const h = p.rotation.y;
    const apart = D.apart * Math.exp(-D.t / 14);
    D.pivot.x += (D.vx + Math.sin(h) * apart) * dt;
    D.pivot.z += (D.vz + Math.cos(h) * apart) * dt;
    // And it is a solid thing: it is shoved aside by any hull it drifts into,
    // or that comes on into it, rather than passing through her.
    if (others) this.fend(others, h);
    // Settling: slowly while the air is in it, and then all at once.
    const ease = (x) => x * x * (3 - 2 * x);
    const lean = ease(Math.min(1, D.t / 40));
    D.pivot.y = D.y0 - D.depth * (u * 0.35 + u * u * u * 0.65) - lean * 1.5;
    p.rotation.order = 'YXZ';
    p.rotation.y += D.yaw * dt;
    // And at the end it stands on its broken end and goes.
    const plunge = u * u * 3.2;
    p.rotation.x = D.pitch0 + D.trimTo * (lean + plunge);
    p.rotation.z = D.roll0 + D.rollTo * lean * (1 + u);
    // Put back so that its middle is where the pivot is.
    const off = TMP.set(0, 0, D.mid).applyEuler(p.rotation);
    p.position.copy(D.pivot).sub(off);
    p.updateMatrixWorld(true);
    this.PU.uCutInv.value.copy(p.matrixWorld).invert();
    if (u >= 1) {
      this.dropPiece();
      return null;
    }
    return { piece: p, z: this.z, u };
  }

  /**
   * Keep the piece out of every hull afloat, her own included: each is a box
   * in plan, length by beam, and the piece is pushed out of any it overlaps
   * along the way it overlaps least, losing its way into her.
   */
  fend(others, h) {
    const D = this.drift;
    const half = Math.abs((this.keep > 0 ? -this.len / 2 : this.len / 2) - this.z) / 2;
    const P = box(D.pivot.x, D.pivot.z, h, half, this.view.cls.hull.beam * 0.45);
    for (const v of others) {
      if (!v || !v.group || !v.group.visible || !v.cls || v.going) continue;
      const g = v.group;
      const L = v.cls.hull.length / 2;
      // Only what is left of her, if she has lost a piece herself.
      let lo = -L, hi = L;
      if (v.severed) { if (v.severed.keep > 0) lo = v.severed.z; else hi = v.severed.z; }
      const mid = (lo + hi) / 2;
      const hv = g.rotation.y;
      const Q = box(g.position.x + Math.sin(hv) * mid, g.position.z + Math.cos(hv) * mid, hv,
        (hi - lo) / 2, v.cls.hull.beam * 0.45);
      const hit = overlap(P, Q);
      if (!hit) continue;
      // Out of her, all of the way: it is wreckage and she is a ship.
      D.pivot.x -= hit.nx * hit.depth;
      D.pivot.z -= hit.nz * hit.depth;
      P.x -= hit.nx * hit.depth;
      P.z -= hit.nz * hit.depth;
      const into = D.vx * hit.nx + D.vz * hit.nz;
      if (into > 0) { D.vx -= hit.nx * into * 1.3; D.vz -= hit.nz * into * 1.3; }
      // And it stops parting along its length into her.
      D.apart *= 0.9;
    }
  }

  /** The piece is under. Nothing of it is left to draw. */
  dropPiece() {
    if (!this.piece) return;
    if (this.piece.parent) this.piece.parent.remove(this.piece);
    disposeCut(this.piece);
    this.piece = null;
  }

  dispose() {
    this.dropPiece();
  }
}
