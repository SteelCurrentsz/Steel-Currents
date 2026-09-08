// Where a gun's muzzle actually is.
//
// A mounting is a thing that trains, a cradle inside it that elevates, and one
// or more barrels in the cradle. Until now the game knew only the first of
// those: a mounting was a group with a rest bearing, and when it fired, the
// flash was put at the mounting's own origin -- the centre of the barbette, at
// deck level, on the axis she trains about. So the smoke came out of the roof
// of the turret rather than the muzzles, tracer left the middle of the ship,
// and a triple turret firing a salvo made one flash instead of three.
//
// The model is the only thing that knows where a muzzle is, because the model
// is what put the barrel there. So the model says. Every mounting publishes,
// on itself:
//
//   userData.gunNode  the group that elevates -- the cradle the barrels are in
//   userData.muzzles  the muzzle of each barrel, in that group's own frame
//   userData.rest     the bearing she sits at when there is nothing to shoot
//   userData.elevRest the elevation she sits at, likewise
//
// and everything downstream -- the flash, the smoke, the tracer, the shell
// leaving the ship -- reads it off there. One number per barrel, written where
// the barrel was built, so the two cannot drift apart.

import * as THREE from '../../../vendor/three.module.js';

const V = new THREE.Vector3();

/**
 * Arm a mounting: say what elevates on it and where its muzzles are.
 *
 * `muzzles` are given in the elevating group's own frame, which is the frame
 * the barrels were built in -- so the number written here is the same number
 * that put the tube there, read off the same line of the model.
 *
 * @param mount    the group that trains
 * @param gunNode  the group that elevates (may be the mount itself)
 * @param muzzles  [[x, y, z], ...], one per barrel, in gunNode's frame
 */
export function arm(mount, gunNode, muzzles) {
  mount.userData.gunNode = gunNode;
  // The cradle moves, so it is marked as moving. Nothing used to say so --
  // only the mounting that trains carried the mark -- and that was fine while
  // nothing welded inside a mounting. It is not fine now: the weld bakes every
  // static child into one buffer in its parent's frame, and a cradle baked
  // into the barbette is a turret whose guns no longer elevate. See
  // mergeMoving.
  if (gunNode && gunNode !== mount) gunNode.userData.dynamic = true;
  // And the mounting itself, which trains. Most models set this already; two
  // did not, and got away with it only because they happen to be built after
  // the hull is welded. A mounting the welder has not been told about is a
  // mounting that gets baked into the ship the first time anybody reorders a
  // builder, and a turret welded to the deck is a hard thing to notice --
  // she looks perfectly correct until somebody watches her fail to train.
  mount.userData.dynamic = true;
  mount.userData.muzzles = muzzles.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  // Whatever elevation the model was built at is the mounting's rest: a gun
  // stowed at a few degrees above the horizontal goes back to a few degrees
  // above the horizontal, not to level.
  mount.userData.elevRest = gunNode === mount ? 0 : gunNode.rotation.x;
  return mount;
}

/**
 * Where barrel `i` of this mounting is pointing from, in the world.
 *
 * Straight off the scene graph, so it accounts for everything between the
 * muzzle and the sea: how far the mounting has trained, how far it has
 * elevated, where on the ship it stands, and how the ship herself is lying --
 * her heel, her trim, and how deep the water in her has put her.
 */
export function muzzleWorld(mount, i, out = new THREE.Vector3()) {
  const list = mount.userData.muzzles;
  if (!list || !list.length) return out.setFromMatrixPosition(mount.matrixWorld);
  const node = mount.userData.gunNode || mount;
  node.updateWorldMatrix(true, false);
  return out.copy(list[i % list.length]).applyMatrix4(node.matrixWorld);
}

/** Which way that barrel is looking, as a unit vector in the world. */
export function muzzleAim(mount, out = new THREE.Vector3()) {
  const node = mount.userData.gunNode || mount;
  node.updateWorldMatrix(true, false);
  // The barrels are built running out along +Z of the cradle, so that is the
  // bore line, rotated by everything above it.
  return out.set(0, 0, 1).transformDirection(node.matrixWorld).normalize();
}

/** How many barrels this mounting has to fire. */
export function barrelCount(mount) {
  const list = mount.userData.muzzles;
  return list ? list.length : 1;
}

/**
 * Point a mounting at something, at a rate.
 *
 * Bearing and elevation are both taken the short way round and both rate
 * limited, so a mounting swings and lifts rather than snapping -- and each one
 * does it at its own speed, which is most of what tells a quadruple 2 cm from
 * a twin 8 inch when you watch them follow the same aeroplane.
 *
 * `want` is a bearing in the ship's own frame and `elev` an angle above the
 * horizontal; pass null for either to send that axis back to its rest.
 */
export function layMount(mount, want, elev, trainRate, elevRate) {
  const rest = mount.userData.rest || 0;
  if (want !== null && want !== undefined) {
    let d = want - rest - mount.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    mount.rotation.y += Math.max(-trainRate, Math.min(trainRate, d));
  } else {
    let d = -mount.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    mount.rotation.y += Math.max(-trainRate, Math.min(trainRate, d));
  }
  const node = mount.userData.gunNode;
  if (!node || node === mount) return;
  // Elevation is a rotation about the trunnion, and the barrels run out along
  // +Z, so raising the muzzle is a negative rotation about X.
  const restEl = mount.userData.elevRest || 0;
  const wantEl = elev === null || elev === undefined ? restEl : -elev;
  const de = wantEl - node.rotation.x;
  node.rotation.x += Math.max(-elevRate, Math.min(elevRate, de));
}

/**
 * The elevation a gun needs to reach a target, near enough to look right.
 *
 * Not the ballistic solution the simulation fires on -- that is the
 * simulation's business and it does it properly. This is what the layer's
 * elevating gear is doing while he does it, and what it has to get right is
 * the shape: flat at close range, climbing steeply as the target opens out,
 * and up at forty-five degrees for something directly overhead.
 */
export function layElevation(range, drop, muzzleVelocity = 800) {
  const d = Math.max(1, range);
  const v = Math.max(80, muzzleVelocity);
  // The low solution of the flat-earth trajectory, capped where the gun is.
  const s = (9.81 * d) / (v * v);
  const flat = s >= 1 ? Math.PI / 4 : 0.5 * Math.asin(s);
  // Plus however much she has to look up or down to see it at all.
  return flat + Math.atan2(drop || 0, d);
}
