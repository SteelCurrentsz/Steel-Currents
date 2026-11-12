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
/**
 * Weld inside the parts that move.
 *
 * mergeStatic stops at anything marked `dynamic` and at everything under it,
 * which is right -- a turret has to be able to train -- but it left every
 * mounting on the ship drawn exactly as it was modelled. A twin 10.5 cm on the
 * Hipper is a hundred and nineteen separate boxes and cylinders: a shield, a
 * cradle, two barrels, a rangefinder, ready-use lockers, handrails and a
 * ladder. Thirty-three mountings on that ship came to eighteen hundred and
 * fifty draw calls carrying forty-five thousand triangles between them -- five
 * and twenty triangles a call, which is the worst possible shape for a frame.
 *
 * A mounting moves as a unit, so everything in it that does not move
 * separately can be one buffer: a turret's barbette and shield become one
 * mesh, its cradle and barrels another, and the two go on training and
 * elevating against each other exactly as before. Nothing is dropped, nothing
 * is simplified, and no pixel changes.
 *
 * Gun mountings and nothing else, which is where the whole of the win is --
 * thirty-three mountings against a handful of everything else. It matters that
 * it is nothing else: her screws, her rudder, her lifts, her catapult and the
 * aeroplane sitting on it are all moving parts too, and every one of them is a
 * thing the game reaches into and addresses a piece of. An aeroplane welded
 * into the trolley she is chocked on is an aeroplane that cannot be shot off
 * it. A mounting is safe because a mounting is exactly two things that move --
 * the part that trains and the part that elevates -- and `arm` has already
 * said which is which.
 */
export function mergeMoving(group, keyOf = null) {
  let saved = 0;
  const weld = (node) => {
    if (!node) return;
    saved += mergeStatic(node, keyOf);
  };
  const walk = (node) => {
    for (const child of node.children) {
      const gun = child.userData && child.userData.gunNode;
      if (gun) {
        // The cradle first, in its own frame, then the mounting round it --
        // welding the mounting first would find the cradle already marked as
        // moving and leave it alone, which is what is wanted, but doing the
        // cradle first means its own buffer is in place before the mounting is
        // walked and there is nothing to go back for.
        if (gun !== child) weld(gun);
        weld(child);
        continue;
      }
      walk(child);
    }
  };
  walk(group);
  return saved;
}

/**
 * Weld whatever was put on a finished ship after her weld.
 *
 * A model is welded part-way through being built, and a good deal goes on her
 * afterward: every light mounting's tub with its splinter shield, its rails
 * and its ladder (the gun is lifted out of it and laid by the scene; the tub
 * stays where it was put), and the ready-use lockers round it. On a
 * battleship that was some five hundred meshes drawn one at a time, every
 * frame, for every one of them on the sea -- most of a frame's draw calls.
 *
 * Only what can be shown to be inert goes in: a visible, opaque mesh with
 * nothing on it the game could find it by (no userData of its own, no
 * children), not inside anything that moves or that the model handed the
 * scene to work (`skip`), and not already a weld. A weld is never welded
 * again -- that would fold the compartments a hull is split into back
 * together. Nothing changes on screen: the same triangles in the same
 * materials, in fewer buffers.
 */
export function weldLoose(group, skip = new Set()) {
  const welded = (o) => !!(o.userData && (o.userData.pieces || o.userData.mergeKey !== undefined));
  const plain = (o) => {
    if (o.name) return false;
    const ud = o.userData || {};
    for (const k in ud) if (k !== 'pieceId') return false;
    return true;
  };
  // A part that moves, that the model handed over, or that has a name the game
  // could look it up by, is a unit: nothing in it is welded into anything
  // outside it, and nothing outside it into it.
  // So is any group something has written a note on: a landing-gear leg that
  // knows where its foot is is a leg that swings up into her wing.
  const unit = (n) => n !== group && (n.userData.dynamic || skip.has(n)
    || (!n.isMesh && (!!n.name || !plain(n))));
  const opts = {
    stop: (node) => unit(node) || (!node.isMesh && node.visible === false),
    take: (mesh) => !welded(mesh) && plain(mesh) && !mesh.children.length
      && !skip.has(mesh) && !Array.isArray(mesh.material) && !!mesh.material
      && !mesh.material.transparent && !mesh.isSkinnedMesh
      // A mirrored piece is drawn with its winding turned round; baked into a
      // buffer that is not mirrored, it would be drawn inside out.
      && mesh.matrixWorld.determinant() > 0,
    // Its own texture coordinates, so a plate on a locker is the plate it was.
    keepUv: true,
    // And never a painted piece in with an unpainted one, nor one that has
    // texture coordinates with one that has none.
    split: (mesh) => `${mesh.geometry.attributes.color ? 'c' : '-'}${mesh.geometry.attributes.uv ? 'u' : '-'}`,
  };
  // Every unit on her, found before anything is welded, and then each one
  // welded in its own frame -- so a catapult car's girders are one buffer that
  // still runs down the track, and the aeroplane on it another that is still
  // thrown off it.
  const units = [];
  group.traverse((n) => { if (unit(n) && !n.isMesh) units.push(n); });
  group.updateMatrixWorld(true);
  let saved = mergeStatic(group, null, opts);
  for (const u of units) saved += mergeStatic(u, null, opts);
  return saved;
}

export function mergeStatic(group, keyOf = null, opts = null) {
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
      if (opts && opts.stop && opts.stop(child)) continue;
      // What is switched off stays off.
      //
      // An aeroplane carries both sets of wings and hides one of them: an
      // aircraft struck below in the hangar is built with her folded panels
      // shown and her spread ones hidden, and the whole reason she fits in a
      // hangar twenty-four metres wide is that the spread pair is not there.
      // Welded regardless of that switch, every one of them came out of the
      // weld with both pairs on and sixteen metres of wing through the ship's
      // own side -- which from alongside is a squadron hanging out of her
      // hangar openings over the sea.
      //
      // Nothing is lost by leaving them: a mesh that goes into the weld can
      // never be shown or hidden again on its own account anyway, so anything
      // still meant to be switched has to be marked dynamic and is skipped
      // above.
      if (child.visible === false) continue;
      // An instanced mesh is already one draw call for all of its copies, and
      // welding it would keep exactly one of them. Points carry their own
      // attributes and are not geometry in this sense either.
      if (child.isInstancedMesh || child.isPoints) continue;
      if (child.isMesh && opts && opts.take && !opts.take(child)) continue;
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
  // One mesh has nothing to be welded to -- unless she is to be split by
  // compartment, which a hull drawn as one mesh (the LCM's) still has to be,
  // or a battle has no plating of hers to cut up.
  if (found.length < (keyOf ? 1 : 2)) return 0;

  const byMat = new Map();
  const nm = new THREE.Matrix3();

  // Two passes. The first sorts every mesh into its bucket and counts what
  // each bucket will hold; the second writes it straight into typed arrays of
  // that size. Pushed a number at a time through a vector apiece, as it was,
  // this was the largest single cost of building a ship -- and every number
  // that comes out is worked exactly as Vector3 works it, so the weld is the
  // same to the bit.
  const jobs = [];
  for (const mesh of found) {
    // Indexing is kept: throwing it away to concatenate would turn a box from
    // eight vertices into thirty-six, and vertex work is not free just because
    // the draw call went away.
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const m = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);

    // Normals do the projecting, so a face that has none needs them worked out
    // before it can be welded.
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const nor = geo.attributes.normal;
    const col = geo.attributes.color;

    let key = null;
    if (keyOf) {
      // Where the piece is in her, in the ship's own frame, so the splitter
      // can say which compartment it belongs to.
      if (!geo.boundingBox) geo.computeBoundingBox();
      const c = geo.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(m);
      key = keyOf(mesh, c.x, c.y, c.z);
    }
    const split = opts && opts.split ? opts.split(mesh) : null;
    const slot = key === null && split === null ? mesh.material
      : `${key}\u0000${split}\u0000${mesh.material.uuid}`;
    let bucket = byMat.get(slot);
    if (!bucket) {
      byMat.set(slot, (bucket = {
        nv: 0, ni: 0, pieces: [], key, material: mesh.material,
        // A vertex-painted hull carries a colour attribute the weld has to
        // carry too, or every welded mesh a material reads vertexColors from
        // comes out of it multiplying by the zero the missing attribute
        // defaults to -- painted black regardless of what colour it was
        // actually given. A mesh with no paint of its own contributes white,
        // which multiplies as no paint at all if it shares a bucket with one
        // that has some. A bucket whose first mesh has none carries none.
        painted: !!col,
        // Normals (and the projected texture coordinates that go with them)
        // only if every mesh in it has them.
        lit: true,
      }));
    }
    if (!nor) bucket.lit = false;
    const base = bucket.nv;
    const idxFrom = bucket.ni;
    const ic = geo.index ? geo.index.count : pos.count;
    bucket.nv += pos.count;
    bucket.ni += ic;
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
      i0: idxFrom, ic,
      cx: c.x, cy: c.y, cz: c.z,
      r: Math.hypot(sx, sy, sz),
    });
    jobs.push({ mesh, bucket, m, base, idxFrom });
  }

  for (const bucket of byMat.values()) {
    const n = bucket.nv;
    bucket.pos = new Float32Array(n * 3);
    if (bucket.lit) {
      bucket.nor = new Float32Array(n * 3);
      bucket.uv = new Float32Array(n * 2);
    }
    if (bucket.painted) bucket.col = new Uint8Array(n * 3);
    bucket.idx = n > 65535 ? new Uint32Array(bucket.ni) : new Uint16Array(bucket.ni);
  }

  const keepUv = !!(opts && opts.keepUv);
  for (const { mesh, bucket, m, base, idxFrom } of jobs) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const col = geo.attributes.color;
    const ownUv = keepUv ? geo.attributes.uv || null : null;
    const e = m.elements;
    nm.getNormalMatrix(m);
    const f = nm.elements;
    const P = bucket.pos, N = bucket.nor, U = bucket.uv, C = bucket.col;
    const lit = bucket.lit && nor;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
      const px = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
      const py = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
      const pz = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
      const o = (base + i) * 3;
      P[o] = px; P[o + 1] = py; P[o + 2] = pz;
      if (lit) {
        const a = nor.getX(i), b = nor.getY(i), d = nor.getZ(i);
        let nx = f[0] * a + f[3] * b + f[6] * d;
        let ny = f[1] * a + f[4] * b + f[7] * d;
        let nz = f[2] * a + f[5] * b + f[8] * d;
        const k = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
        nx *= k; ny *= k; nz *= k;
        N[o] = nx; N[o + 1] = ny; N[o + 2] = nz;
        // Box projection off whichever way the face mostly looks: flat up for
        // a deck, athwartships for a ship's side, fore and aft for a bulkhead.
        const t = (base + i) * 2;
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        if (keepUv) { U[t] = ownUv ? ownUv.getX(i) : 0; U[t + 1] = ownUv ? ownUv.getY(i) : 0; }
        else if (ay >= ax && ay >= az) { U[t] = px; U[t + 1] = pz; }
        else if (ax >= az) { U[t] = pz; U[t + 1] = py; }
        else { U[t] = px; U[t + 1] = py; }
      }
      // Bytes, normalised: the same form pieces.js gives a buffer it paints,
      // because Plating.scorch and the fittings write soot into it a byte at a
      // time, and a float colour takes every one of those writes as a no-op.
      if (C) {
        if (col) {
          C[o] = Math.round(col.getX(i) * 255);
          C[o + 1] = Math.round(col.getY(i) * 255);
          C[o + 2] = Math.round(col.getZ(i) * 255);
        } else {
          C[o] = 255; C[o + 1] = 255; C[o + 2] = 255;
        }
      }
    }
    const I = bucket.idx;
    if (geo.index) {
      const ix = geo.index;
      for (let i = 0; i < ix.count; i++) I[idxFrom + i] = base + ix.getX(i);
    } else {
      for (let i = 0; i < pos.count; i++) I[idxFrom + i] = base + i;
    }
    geo.dispose();
    mesh.removeFromParent();
  }

  for (const bucket of byMat.values()) {
    const material = bucket.material;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(bucket.pos, 3));
    if (bucket.lit) {
      geo.setAttribute('normal', new THREE.BufferAttribute(bucket.nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(bucket.uv, 2));
    }
    if (bucket.painted) geo.setAttribute('color', new THREE.BufferAttribute(bucket.col, 3, true));
    geo.setIndex(new THREE.BufferAttribute(bucket.idx, 1));
    if (!bucket.lit) geo.computeVertexNormals();
    const welded = new THREE.Mesh(geo, material);
    if (bucket.key !== null) welded.userData.mergeKey = bucket.key;
    welded.userData.pieces = bucket.pieces;
    group.add(welded);
  }
  return found.length - byMat.size;
}
