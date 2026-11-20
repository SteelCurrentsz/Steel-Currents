// What a gun looks like when it has been hit.
//
// A mounting is in one of five states, and each is drawn as itself:
//
//   0  sound     as built.
//   1  damaged   splinter-scarred and smoke-stained; still in action. Its
//                guns sit a degree or two off true -- the cradle is knocked.
//   2  bad       stained darker, the gunhouse dented in where it was hit, a
//                barrel drooping in the cradle; barely in action.
//   3  disabled  finished: the crew are gone, the lights are out, the guns
//                have run down onto their stops and splayed in the cradle,
//                the gunhouse is stove in and burnt. It is still sitting
//                square on its roller path -- the base does not move.
//   4  wrecked   the deck under it gone or the gunhouse blown open: only now
//                is it knocked off its bearings and canted, one edge of its
//                base lifted off the deck, the barrels bent.
//
// The base of a mounting does not come up off the deck because the gun is out
// of action. It took a thousand-ton turret's roller path being broken, or the
// deck beneath it being shot away, to cant one -- so only the wrecked state
// does it.
//
// Every look can be replaced. A model that wants its own -- a twin 40 mm with
// a shield that peels back, a turret whose rangefinder hood comes away --
// sets `userData.lookFn` on the mounting: `(m, level, ctx) => void`, where
// `ctx.def(level)` draws the default look if it wants that as well. Or a
// whole class, or a kind of mounting, registers one with `gunLook`.

import * as THREE from '../../../vendor/three.module.js';

export const LOOK = { SOUND: 0, DAMAGED: 1, BAD: 2, DISABLED: 3, WRECKED: 4 };

/** Custom looks by key: `${classId}:${kind}`, `${classId}` or `${kind}`. */
const CUSTOM = new Map();

/**
 * Register a look for every mounting of a kind ('main', 'sec', 'aa'), every
 * mounting on a class, or one kind on one class (`'iowa:main'`).
 */
export function gunLook(key, fn) {
  if (fn) CUSTOM.set(key, fn); else CUSTOM.delete(key);
}

/** How far toward soot each state stains it. Smoke, not paint: never black. */
const SOOT = [0, 0.1, 0.2, 0.32, 0.42];
const SOOT_COLOR = new THREE.Color(0x2b2622);

/** A number from 0 to 1 that is the same on every screen for this mounting. */
function seedOf(m) {
  const p = m.userData.fairPos || m.position;
  return Math.abs(Math.sin(p.x * 12.9898 + p.z * 78.233 + p.y * 3.7) * 43758.5453) % 1;
}

function rng(seed) {
  let s = Math.floor(seed * 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Is `o` inside the elevating cradle of `m`? */
function inCradle(m, o) {
  const node = m.userData.gunNode;
  if (!node || node === m) return false;
  for (let p = o; p && p !== m; p = p.parent) if (p === node) return true;
  return false;
}

/** Its own copy of every material, once, with the colours it was built in. */
function ownMaterials(m) {
  m.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (!o.userData.ownMat) {
      o.material = Array.isArray(o.material)
        ? o.material.map((q) => q.clone()) : o.material.clone();
      o.userData.ownMat = true;
    }
    for (const q of Array.isArray(o.material) ? o.material : [o.material]) {
      q.userData = q.userData || {};
      if (q.color && !q.userData.built) q.userData.built = q.color.clone();
      if (q.emissive && q.userData.lit === undefined) q.userData.lit = q.emissive.getHex();
    }
  });
}

function stain(m, level) {
  const k = SOOT[level] || 0;
  m.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    for (const q of Array.isArray(o.material) ? o.material : [o.material]) {
      if (q.color && q.userData && q.userData.built) q.color.copy(q.userData.built).lerp(SOOT_COLOR, k);
      // Out, from disabled on: nobody is working the gun.
      if (q.emissive && q.userData && q.userData.lit !== undefined) {
        q.emissive.setHex(level >= LOOK.DISABLED ? 0x000000 : q.userData.lit);
      }
    }
  });
}

/**
 * The biggest pieces of the gunhouse (not the guns), with the shape each was
 * built in kept aside so a dent can always be taken back out.
 */
function shellsOf(m) {
  if (m.userData.shells) return m.userData.shells;
  const list = [];
  m.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry?.attributes?.position) return;
    if (inCradle(m, o)) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    list.push({ o, r: o.geometry.boundingSphere.radius, built: o.geometry, own: null });
  });
  list.sort((a, b) => b.r - a.r);
  m.userData.shells = list.slice(0, 2);
  return m.userData.shells;
}

/** The barrels: the meshes in the cradle that are long fore and aft. */
function barrelsOf(m) {
  if (m.userData.barrelList) return m.userData.barrelList;
  const list = [];
  const node = m.userData.gunNode;
  if (node && node !== m) {
    node.traverse((o) => {
      if (o === node || !o.isMesh || o.isInstancedMesh || !o.geometry?.attributes?.position) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      const lz = b.max.z - b.min.z, lx = b.max.x - b.min.x, ly = b.max.y - b.min.y;
      if (lz > 2.5 * Math.max(lx, ly, 0.05)) {
        list.push({ o, built: o.geometry, rot: o.rotation.clone(), own: null });
      }
    });
  }
  m.userData.barrelList = list;
  return list;
}

/** Put a piece back to the shape it was built in. */
function unbend(p) {
  if (p.own) { p.o.geometry = p.built; p.own.dispose(); p.own = null; }
}

/**
 * Stove in: `n` dents pushed into the plate toward its middle, `depth` of its
 * size deep. Its normals are kept: a dent catches the light by its outline,
 * and a turret re-smoothed over its hard edges reads as made of clay.
 */
function dent(p, rnd, n, depth) {
  unbend(p);
  if (p.built.attributes.position.isInterleavedBufferAttribute) return;
  const g = p.built.clone();
  const A = g.attributes.position.array;
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox;
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  const L = Math.max(sx, sy, sz) || 1;
  const mx = (b.max.x + b.min.x) / 2, my = (b.max.y + b.min.y) / 2, mz = (b.max.z + b.min.z) / 2;
  for (let k = 0; k < n; k++) {
    // On the face of it, high and forward or on a side: where shells strike.
    const cx = b.min.x + sx * (rnd() < 0.5 ? 0.05 + rnd() * 0.2 : 0.75 + rnd() * 0.2);
    const cy = b.min.y + sy * (0.45 + rnd() * 0.5);
    const cz = b.min.z + sz * (0.2 + rnd() * 0.8);
    const r = L * (0.12 + rnd() * 0.12);
    const inv = 1 / (r * r);
    const amt = L * depth * (0.6 + rnd() * 0.6);
    for (let i = 0; i < A.length; i += 3) {
      const dx = A[i] - cx, dy = A[i + 1] - cy, dz = A[i + 2] - cz;
      const q = dx * dx + dy * dy + dz * dz;
      if (q > 6 * r * r) continue;
      let ux = A[i] - mx, uy = A[i + 1] - my, uz = A[i + 2] - mz;
      const ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
      const f = amt * Math.exp(-q * inv) / ul;
      A[i] -= ux * f; A[i + 1] -= uy * f; A[i + 2] -= uz * f;
    }
  }
  g.attributes.position.needsUpdate = true;
  g.computeBoundingSphere();
  p.own = g;
  p.o.geometry = g;
}

/** A barrel bent from somewhere along it, off to one side. */
function bend(p, rnd, by) {
  unbend(p);
  if (p.built.attributes.position.isInterleavedBufferAttribute) return;
  const g = p.built.clone();
  const A = g.attributes.position.array;
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox;
  const L = (b.max.z - b.min.z) || 1;
  const at = 0.3 + rnd() * 0.4;
  const sx = (rnd() - 0.5) * 2, sy = -0.4 - rnd() * 0.6;
  for (let i = 0; i < A.length; i += 3) {
    const u = (A[i + 2] - b.min.z) / L - at;
    if (u <= 0) continue;
    A[i] += sx * by * L * u * u;
    A[i + 1] += sy * by * L * u * u;
  }
  g.attributes.position.needsUpdate = true;
  g.computeBoundingSphere();
  p.own = g;
  p.o.geometry = g;
}

/**
 * The default look for a state. Each state is drawn from the mounting as
 * built, so a gun its crew have worked back into action goes back to looking
 * the way it did.
 */
function defaultLook(m, level) {
  ownMaterials(m);
  stain(m, level);
  const rnd = rng(seedOf(m));
  const node = m.userData.gunNode;
  const ud = m.userData;

  // The gunhouse: dented from bad on, stove in when disabled, crumpled
  // when wrecked.
  const shells = shellsOf(m);
  for (let i = 0; i < shells.length; i++) {
    const p = shells[i];
    if (level >= LOOK.BAD && (i === 0 || level >= LOOK.DISABLED)) {
      const n = level >= LOOK.WRECKED ? 4 : level >= LOOK.DISABLED ? 2 : 1;
      const d = level >= LOOK.WRECKED ? 0.09 : level >= LOOK.DISABLED ? 0.05 : 0.025;
      dent(p, rnd, n, d);
    } else unbend(p);
  }

  // The barrels: knocked off true when damaged, drooping when bad, splayed
  // on their stops when disabled, bent when wrecked.
  const barrels = barrelsOf(m);
  for (let i = 0; i < barrels.length; i++) {
    const p = barrels[i];
    p.o.rotation.copy(p.rot);
    unbend(p);
    const w = rnd();
    if (level === LOOK.DAMAGED && i === 0) {
      p.o.rotation.y += (w - 0.5) * 0.04;
    } else if (level === LOOK.BAD) {
      if (i === barrels.length - 1) p.o.rotation.x += 0.05 + w * 0.05;
      else p.o.rotation.y += (w - 0.5) * 0.04;
    } else if (level === LOOK.DISABLED) {
      p.o.rotation.x += 0.03 + w * 0.12;
      p.o.rotation.y += (w - 0.5) * 0.12;
    } else if (level >= LOOK.WRECKED) {
      p.o.rotation.x += 0.05 + w * 0.15;
      p.o.rotation.y += (w - 0.5) * 0.2;
      if (w < 0.7) bend(p, rnd, 0.15 + w * 0.25);
    }
  }

  // How far its cradle sits off what it is laid at, while it still lays.
  ud.gunSag = level === LOOK.DAMAGED ? 0.015 : level === LOOK.BAD ? 0.045 : 0;

  // Out of action: it stops where it stands, and the cradle runs down onto
  // its stops. Its base stays square on its roller path.
  if (ud.fair) {
    m.rotation.x = ud.fair.x;
    m.rotation.z = ud.fair.z;
    m.position.y = ud.fair.y;
  }
  if (level >= LOOK.DISABLED) {
    ud.laid = false;
    if (node && node !== m) node.rotation.x = 0.1 + seedOf(m) * 0.12 + (level >= LOOK.WRECKED ? 0.06 : 0);
  } else {
    ud.laid = ud.laidBuilt !== false;
    if (node && node !== m && ud.lookWas >= LOOK.DISABLED) node.rotation.x = ud.elevRest || 0;
  }

  // Only a wrecked one is knocked off its bearings. Canted about the edge of
  // its base, so that edge stays on the deck and the far one comes up.
  if (level >= LOOK.WRECKED) {
    const wob = seedOf(m);
    const way = wob < 0.5 ? 1 : -1;
    const tx = way * (0.06 + wob * 0.08);
    const tz = -way * (0.07 + wob * 0.1);
    m.rotation.x += tx;
    m.rotation.z += tz;
    const foot = ud.footR || 2;
    m.position.y += foot * Math.max(Math.abs(Math.sin(tx)), Math.abs(Math.sin(tz))) * 0.5;
  }
}

/**
 * Draw mounting `m` in state `level`. `kind` is 'main', 'sec' or 'aa' and
 * `classId` the class she is, for a registered look.
 */
export function applyGunLook(m, level, kind = '', classId = '') {
  const ud = m.userData;
  if (ud.look === level) return;
  if (!ud.fair) {
    ud.fair = { x: m.rotation.x, z: m.rotation.z, y: m.position.y };
    ud.fairPos = m.position.clone();
    ud.laidBuilt = ud.laid !== false;
    if (ud.footR === undefined) {
      const b = new THREE.Box3().setFromObject(m);
      const s = b.isEmpty() ? null : b.getSize(new THREE.Vector3());
      const sc = m.parent ? m.parent.getWorldScale(new THREE.Vector3()).x || 1 : 1;
      ud.footR = s ? Math.max(0.5, Math.min(s.x, s.z) / 2 / sc) : 2;
    }
  }
  ud.lookWas = ud.look ?? 0;
  const def = (lv) => defaultLook(m, lv);
  const fn = ud.lookFn || CUSTOM.get(`${classId}:${kind}`) || CUSTOM.get(classId) || CUSTOM.get(kind);
  if (typeof fn === 'function') fn(m, level, { kind, classId, def, was: ud.lookWas });
  else def(level);
  ud.look = level;
}
