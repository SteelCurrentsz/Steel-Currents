// Baking a group of primitives down to one mesh per material.
//
// A model built out of boxes and cylinders is easy to write and expensive to
// draw: the battleship is about three hundred and fifty separate meshes, and at
// the range the title screen puts her that is three hundred and fifty draw
// calls for a hundred and eighty pixels of ship. Nothing on her moves except
// the turrets, so everything else can be welded into one buffer per colour.
//
// Anything that does have to move is marked `userData.dynamic` and left alone,
// along with its children.

import * as THREE from '../../../vendor/three.module.js';

/**
 * Weld every static mesh under `group` into one mesh per material, in place.
 * Returns the number of draw calls saved, which is what this is for.
 */
export function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();

  const found = [];
  const walk = (node) => {
    for (const child of node.children) {
      if (child.userData.dynamic) continue;
      // An instanced mesh is already one draw call for all of its copies, and
      // welding it would keep exactly one of them. Points carry their own
      // attributes and are not geometry in this sense either.
      if (child.isInstancedMesh || child.isPoints) continue;
      if (child.isMesh && child.geometry.attributes.position) found.push(child);
      else if (child.isGroup || child.isObject3D) walk(child);
    }
  };
  walk(group);
  if (found.length < 2) return 0;

  const byMat = new Map();
  const m = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();

  for (const mesh of found) {
    // Indexing is kept: throwing it away to concatenate would turn a box from
    // eight vertices into thirty-six, and vertex work is not free just because
    // the draw call went away.
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    m.multiplyMatrices(inv, mesh.matrixWorld);
    nm.getNormalMatrix(m);

    let bucket = byMat.get(mesh.material);
    if (!bucket) byMat.set(mesh.material, (bucket = { pos: [], nor: [], idx: [] }));
    const base = bucket.pos.length / 3;

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      bucket.pos.push(v.x, v.y, v.z);
      if (nor) {
        v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
        bucket.nor.push(v.x, v.y, v.z);
      }
    }
    if (geo.index) {
      const ix = geo.index;
      for (let i = 0; i < ix.count; i++) bucket.idx.push(base + ix.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) bucket.idx.push(base + i);
    }
    geo.dispose();
    mesh.removeFromParent();
  }

  for (const [material, bucket] of byMat) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bucket.pos, 3));
    if (bucket.nor.length === bucket.pos.length) {
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.nor, 3));
    }
    const n = bucket.pos.length / 3;
    geo.setIndex(n > 65535
      ? new THREE.Uint32BufferAttribute(bucket.idx, 1)
      : new THREE.Uint16BufferAttribute(bucket.idx, 1));
    if (bucket.nor.length !== bucket.pos.length) geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, material));
  }
  return found.length - byMat.size;
}
