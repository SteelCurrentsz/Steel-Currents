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

// A number for each assembly, so two pieces welded into different buffers --
// a funnel's steel and its black cap are different materials -- can still be
// recognised as the same funnel.
let PIECE_ID = 0;

// The biggest a group may be and still count as one piece of a ship, in
// metres. A funnel, a boat, a director, a mast: all under this. A deckhouse,
// a hull band, or the wrapper the whole model happens to be built inside: not.
const ASSEMBLY_MAX = 16;
const nm2 = new THREE.Matrix3();
const TMP_E = new THREE.Vector3();

/**
 * Weld every static mesh under `group` into one mesh per material, in place.
 * Returns the number of draw calls saved, which is what this is for.
 *
 * `keyOf(mesh, cx, cy, cz)` optionally splits the weld further: meshes with
 * different keys go into different buffers even when they share a material,
 * and each welded mesh carries its key in `userData.mergeKey`. A hull uses it
 * to weld one buffer per compartment, which is what lets a compartment's
 * plating be taken off her when it is blown out -- see interior.js. The cost
 * is a handful of extra draw calls per ship.
 *
 * The weld also lays down texture coordinates, because a ship built out of
 * primitives and lofted bands has no coherent set of its own -- a box knows
 * how to wrap a texture round itself and a hull band does not, and the two
 * end up in the same buffer. They are box-projected in metres off the face's
 * own normal, so plating runs along a ship's side and planking runs fore and
 * aft on her deck whatever the surface underneath was built out of, and a
 * plate is the same size on a destroyer as on a battleship.
 *
 * Welding does not throw the ship's parts away, it only stops drawing them
 * separately. Every mesh that goes in leaves a note behind saying which
 * vertices and which triangles of the welded buffer used to be it, and which
 * assembly it belonged to -- so a funnel is still a funnel and a searchlight
 * is still a searchlight after they have been baked into the same buffer as
 * the rest of her. That register (`userData.pieces`) is what lets a piece of
 * her be dented, scorched, or torn off and thrown into the sea on its own.
 * See pieces.js.
 */
export function mergeStatic(group, keyOf = null) {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();

  // Which assembly each mesh belongs to.
  //
  // A modeller writes a funnel as a group of a dozen bands and a davit as one
  // box. The group is the natural piece: taken off her, a funnel should go
  // over the side as a funnel rather than as twelve separate rings, and a box
  // that nobody grouped is a piece in its own right.
  //
  // So an assembly is the outermost group that is still small enough to be a
  // fitting. The size test is the whole of it: without it, a model built
  // inside one scaled wrapper -- which is how the Iowa is drawn -- makes the
  // entire battleship a single assembly, and she comes apart in three pieces
  // instead of sixteen hundred. Anything bigger than a fitting is not one, so
  // the search goes on down and the boxes inside it become pieces on their
  // own account.
  const found = [];
  const owners = new Map();
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const walk = (node, owner) => {
    for (const child of node.children) {
      if (child.userData.dynamic) continue;
      // An instanced mesh is already one draw call for all of its copies, and
      // welding it would keep exactly one of them. Points carry their own
      // attributes and are not geometry in this sense either.
      if (child.isInstancedMesh || child.isPoints) continue;
      if (child.isMesh && child.geometry.attributes.position) {
        found.push(child);
        owners.set(child, owner || child);
      } else if (child.isGroup || child.isObject3D) {
        let take = owner;
        if (!take) {
          box.setFromObject(child);
          if (!box.isEmpty()) {
            box.getSize(size);
            if (Math.max(size.x, size.y, size.z) <= ASSEMBLY_MAX) take = child;
          }
        }
        walk(child, take);
      }
    }
  };
  walk(group, null);
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
    let nor = geo.attributes.normal;
    m.multiplyMatrices(inv, mesh.matrixWorld);
    nm.getNormalMatrix(m);

    // Normals do the projecting, so a face that has none needs them worked out
    // before it can be welded.
    if (!nor) { geo.computeVertexNormals(); nor = geo.attributes.normal; }

    let key = null;
    if (keyOf) {
      // Where the piece is in her, in the ship's own frame, so the splitter
      // can say which compartment it belongs to.
      if (!geo.boundingBox) geo.computeBoundingBox();
      const c = geo.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(m);
      key = keyOf(mesh, c.x, c.y, c.z);
    }
    const slot = key === null ? mesh.material : `${key}\u0000${mesh.material.uuid}`;
    let bucket = byMat.get(slot);
    if (!bucket) {
      byMat.set(slot, (bucket = {
        pos: [], nor: [], uv: [], idx: [], pieces: [], key, material: mesh.material,
      }));
    }
    const base = bucket.pos.length / 3;
    const idxFrom = bucket.idx.length;

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      const px = v.x, py = v.y, pz = v.z;
      bucket.pos.push(px, py, pz);
      if (nor) {
        v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
        bucket.nor.push(v.x, v.y, v.z);
        // Box projection off whichever way the face mostly looks: flat up for
        // a deck, athwartships for a ship's side, fore and aft for a bulkhead.
        const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
        if (ay >= ax && ay >= az) bucket.uv.push(px, pz);
        else if (ax >= az) bucket.uv.push(pz, py);
        else bucket.uv.push(px, py);
      }
    }
    if (geo.index) {
      const ix = geo.index;
      for (let i = 0; i < ix.count; i++) bucket.idx.push(base + ix.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) bucket.idx.push(base + i);
    }
    // What this mesh became, so it can be found again after the weld: which
    // vertices are its, which triangles are its, where it sits and how big it
    // is. The bounding sphere is in the ship's own frame, which is the frame
    // every hit on her arrives in.
    const owner = owners.get(mesh) || mesh;
    if (!owner.userData.pieceId) owner.userData.pieceId = ++PIECE_ID;
    const bb = geo.boundingBox || (geo.computeBoundingBox(), geo.boundingBox);
    const c = bb.getCenter(new THREE.Vector3()).applyMatrix4(m);
    const e = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    // Rotated into her frame, so a long thin thing lying fore and aft has the
    // radius of a long thin thing however it was modelled.
    nm2.setFromMatrix4(m);
    const sx = TMP_E.set(e.x, 0, 0).applyMatrix3(nm2).length();
    const sy = TMP_E.set(0, e.y, 0).applyMatrix3(nm2).length();
    const sz = TMP_E.set(0, 0, e.z).applyMatrix3(nm2).length();
    bucket.pieces.push({
      owner: owner.userData.pieceId,
      name: owner.name || mesh.name || '',
      v0: base, vn: pos.count,
      i0: idxFrom, ic: bucket.idx.length - idxFrom,
      cx: c.x, cy: c.y, cz: c.z,
      r: Math.hypot(sx, sy, sz),
    });
    geo.dispose();
    mesh.removeFromParent();
  }

  for (const bucket of byMat.values()) {
    const material = bucket.material;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bucket.pos, 3));
    if (bucket.nor.length === bucket.pos.length) {
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uv, 2));
    }
    const n = bucket.pos.length / 3;
    geo.setIndex(n > 65535
      ? new THREE.Uint32BufferAttribute(bucket.idx, 1)
      : new THREE.Uint16BufferAttribute(bucket.idx, 1));
    if (bucket.nor.length !== bucket.pos.length) geo.computeVertexNormals();
    const welded = new THREE.Mesh(geo, material);
    if (bucket.key !== null) welded.userData.mergeKey = bucket.key;
    welded.userData.pieces = bucket.pieces;
    group.add(welded);
  }
  return found.length - byMat.size;
}
