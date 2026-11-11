// Nothing smaller than a pixel is drawn.
//
// A ship is built out of a great many pieces -- every mounting, rail, vent and
// boat on her -- and at the ranges a battle is fought over most of them come
// out far smaller than one pixel on the screen. Each was still a draw call and
// all of its triangles, sent to the GPU to produce at most a dot nobody could
// see: in a fleet action more than half of the draw calls and of the triangles
// in a frame went on that. So the renderer's own frustum test is given one
// more question: is the whole of this thing, all of its bounding sphere,
// inside half a pixel? If it is, it is not drawn. Come in close and every
// piece of her is there again, because then it covers pixels.
//
// Only solid, ordinary surfaces are judged. Anything blended or glowing -- a
// muzzle flash on the horizon, a tracer, a fire, smoke -- can light a pixel
// it is smaller than, and a shader that sizes its geometry itself does not
// have a bounding sphere that means anything; those are always drawn.

import * as THREE from '../../../vendor/three.module.js';

const state = { on: false, x: 0, y: 0, z: 0, k: 0, min: 0.5 };
const sphere = new THREE.Sphere();
const buffer = new THREE.Vector2();
const base = THREE.Frustum.prototype.intersectsObject;

function judged(object) {
  if (!object.isMesh || object.isInstancedMesh || object.isSkinnedMesh) return false;
  if (object.userData && object.userData.alwaysDraw) return false;
  const m = object.material;
  if (!m || Array.isArray(m)) return false;
  if (m.transparent || m.isShaderMaterial || m.isRawShaderMaterial || m.blending !== THREE.NormalBlending) return false;
  return true;
}

THREE.Frustum.prototype.intersectsObject = function intersectsObject(object) {
  const g = object.geometry;
  if (!state.on || !g || object.boundingSphere !== undefined || !judged(object)) return base.call(this, object);
  // The same sphere the frustum test puts into the world, put there once for
  // both questions rather than once for each -- there are thousands of these a
  // frame in a fleet action -- and the cheaper question asked first, since at
  // the ranges a battle is fought over most of what is in view is under a
  // pixel. What is drawn is what was drawn: it has to pass both.
  if (g.boundingSphere === null) g.computeBoundingSphere();
  sphere.copy(g.boundingSphere).applyMatrix4(object.matrixWorld);
  const dx = sphere.center.x - state.x, dy = sphere.center.y - state.y, dz = sphere.center.z - state.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - sphere.radius;
  // Its radius on the screen, in pixels of the drawing buffer.
  if (d > 0 && sphere.radius * state.k < state.min * d) return false;
  return this.intersectsSphere(sphere);
};

/**
 * Draw `scene` through `camera` with pieces under half a pixel left out. Only
 * this one draw is judged; every other render (the wake map, the targeting
 * panel's picture, a shadow map) sees the frustum test as it always was.
 */
export function renderCulled(renderer, scene, camera) {
  const h = renderer.getDrawingBufferSize ? renderer.getDrawingBufferSize(buffer).y : 0;
  if (!camera.isPerspectiveCamera || !(h > 0)) { renderer.render(scene, camera); return; }
  camera.updateMatrixWorld();
  const p = camera.matrixWorld.elements;
  state.x = p[12]; state.y = p[13]; state.z = p[14];
  state.k = (h / 2) / Math.tan((camera.fov * Math.PI) / 360) * (camera.zoom || 1);
  state.on = true;
  try { renderer.render(scene, camera); } finally { state.on = false; }
}

/** For the tests: how a mesh at this distance is judged. */
export function pixelRadius(radius, distance, bufferHeight, fovDeg) {
  return radius * (bufferHeight / 2) / Math.tan((fovDeg * Math.PI) / 360) / Math.max(1e-6, distance);
}
