// Where a fire aboard a ship actually burns.
//
// The simulation says which compartment is alight and how hard; it does not
// know what the ship looks like. A fire used to be stood on her centreline at
// a height picked for every ship at once -- nine metres for a compartment,
// twenty for her superstructure -- which put it in the air over a destroyer's
// deck and inside a battleship's hull, and left it there however she heeled.
//
// So the seats of each fire are found on her model: a ray is let down onto her
// at a few places over the burning compartment, spread along it and across
// her, and the fire stands on what it meets -- her deck over a compartment
// below, her decks and platforms for her superstructure. They are kept in her
// own frame, so the fire goes with her as she rolls, settles and steams.

import * as THREE from '../../../vendor/three.module.js';

const ray = new THREE.Raycaster();
const ORIGIN = new THREE.Vector3();
const DOWN = new THREE.Vector3();
const INV = new THREE.Matrix4();

/** Whether this mesh is part of her, and solid: not a marker, a lamp's beam or an effect. */
function solid(o, root) {
  if (!o.isMesh) return false;
  const m = o.material;
  if (!m || m.transparent || m.isShaderMaterial || m.visible === false) return false;
  for (let p = o; p && p !== root; p = p.parent) {
    if (!p.visible) return false;
    if (p.userData && (p.userData.lamp !== undefined || p.userData.marker)) return false;
  }
  return true;
}

/** Every height of her under (x, z) in her own frame, highest first. */
function heightsAt(view, meshes, x, z) {
  const g = view.group;
  INV.copy(g.matrixWorld).invert();
  ORIGIN.set(x, 200, z).applyMatrix4(g.matrixWorld);
  DOWN.set(0, -1, 0).transformDirection(g.matrixWorld);
  ray.set(ORIGIN, DOWN);
  ray.far = 400;
  const out = [];
  for (const h of ray.intersectObjects(meshes, false)) {
    out.push(h.point.clone().applyMatrix4(INV).y);
  }
  return out.sort((a, b) => b - a);
}

/**
 * The seats of a fire in compartment `sec` of her (see SECTIONS in sim.js):
 * a few points in her own frame, each with how much of her it covers.
 * `fb` is her freeboard -- where her weather deck is, near enough.
 */
export function fireSeats(view, cls, sec, fb) {
  const g = view.group;
  g.updateMatrixWorld(true);
  const meshes = [];
  g.traverse((o) => { if (o !== view.marker && solid(o, g)) meshes.push(o); });
  const L = cls.hull.length / 2;
  const B = cls.hull.beam;
  const seats = [];
  const works = sec.from === null;
  // Along the compartment and across her: three seats, staggered, so the
  // fire runs the length of it and is not one column on her centreline.
  const zs = works ? [-0.06, 0.05, 0.16] : [0.22, 0.5, 0.78].map((f) => sec.from + (sec.to - sec.from) * f);
  const narrow = !works && (sec.k === 'bow' || sec.k === 'stern');
  const across = works ? [B * 0.24, 0, -B * 0.24] : [-B * (narrow ? 0.1 : 0.2), 0, B * (narrow ? 0.1 : 0.2)];
  const span = works ? Math.max(6, B * 0.5) : Math.max(6, (sec.to - sec.from) * L * 0.55);
  for (let i = 0; i < zs.length; i++) {
    // Clear of the end of her: a bow compartment runs out to her stem.
    const z = THREE.MathUtils.clamp(zs[i], -0.94, 0.94) * L;
    const x = across[i];
    const hs = heightsAt(view, meshes, x, z);
    if (!hs.length) continue;
    let y;
    if (works) {
      // On her superstructure: the highest deck or platform of it that a
      // fire can stand on, not the top of her mast.
      y = hs.find((h) => h > fb + 1.5 && h < fb + 16);
      if (y === undefined) y = hs.find((h) => h <= fb + 16);
    } else {
      // On the deck over the compartment: the first thing under her
      // weather deck's height, which is the deck or a turret roof on it.
      y = hs.find((h) => h <= fb + 4);
    }
    if (y === undefined) y = hs[hs.length - 1];
    seats.push({ x, y: y - 0.3, z, span });
  }
  return seats;
}
