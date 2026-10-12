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
  step(dt) {
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
