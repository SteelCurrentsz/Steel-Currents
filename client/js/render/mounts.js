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
 * And it is laid the way a layer lays it: it does not chase every hundredth
 * of a degree the solution wanders by. A gun on its bearing stays there until
 * the bearing has really moved; then it is got moving, runs, and is eased in
 * onto the new one -- never jerked from stopped to full rate and back to
 * stopped from one frame to the next. See `glide`.
 *
 * `want` is a bearing in the ship's own frame and `elev` an angle above the
 * horizontal; pass null for either to send that axis back to its rest.
 * `trainRate` and `elevRate` are the most each may move this frame, and `dt`
 * the frame (taken as a sixtieth if not given).
 */
export function layMount(mount, want, elev, trainRate, elevRate, dt = 1 / 60) {
  const rest = mount.userData.rest || 0;
  const st = mount.userData.lay || (mount.userData.lay = { tv: 0, ev: 0, tm: false, em: false });
  let d = (want !== null && want !== undefined ? want - rest : 0) - mount.rotation.y;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (trainRate > 0) mount.rotation.y += glide(st, 't', d, trainRate, dt, 0.006);
  const node = mount.userData.gunNode;
  if (!node || node === mount) return;
  // Elevation is a rotation about the trunnion, and the barrels run out along
  // +Z, so raising the muzzle is a negative rotation about X.
  const restEl = mount.userData.elevRest || 0;
  const wantEl = elev === null || elev === undefined ? restEl : -elev;
  if (elevRate > 0) node.rotation.x += glide(st, 'e', wantEl - node.rotation.x, elevRate, dt, 0.004);
}

/**
 * How far to move one axis of a mounting this frame, toward `err` away.
 *
 * Held still inside a small band about where it is laid (`band` radians),
 * so a solution that wanders a little leaves the gun where it is; set going
 * once it is outside it, worked up to its rate and eased down again as it
 * closes, onto the new bearing without passing it. `step` is the most it
 * may move in this frame of `dt` seconds.
 *
 * `st` keeps the axis's way and whether it is moving, under keys `k + 'v'`
 * and `k + 'm'`.
 */
export function glide(st, k, err, step, dt, band = 0.006) {
  const kv = k + 'v', km = k + 'm';
  dt = Math.max(1e-4, dt);
  const vmax = step / dt;
  const ae = Math.abs(err);
  if (!st[km]) {
    // On its bearing: it stays there until there is a real change.
    if (ae < band) { st[kv] = 0; return 0; }
    st[km] = true;
  }
  // Got going over about a third of a second and brought to rest the same,
  // whatever its rate: a heavy turret and a light mounting both start and
  // stop, they never jump.
  const acc = Math.max(vmax * 3, 0.05);
  const want = Math.sign(err) * Math.min(vmax, Math.sqrt(2 * acc * ae) * 0.9);
  let v = st[kv] || 0;
  v += Math.max(-acc * dt, Math.min(acc * dt, want - v));
  let mv = v * dt;
  if ((mv > 0 && mv > err) || (mv < 0 && mv < err)) { mv = err; v = 0; }
  st[kv] = v;
  // Arrived: settled until the next real change.
  if (Math.abs(err - mv) < band * 0.15 && Math.abs(v) < vmax * 0.2) { st[km] = false; st[kv] = 0; }
  return mv;
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
