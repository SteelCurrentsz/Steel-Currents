// A bank of torpedo tubes, firing: the fish blown out of the tubes one after
// another and dropping into the sea over her side, drawn in her own frame
// until each is in the water and the simulation's torpedo takes over.
//
// The Tirpitz's and the Scharnhorst's quadruple banks of 53.3 cm and the
// Matsu's of 61 cm all fire through this.

import * as THREE from '../../../vendor/three.module.js';

// The dark grey a fish is painted.
const GUN_DARK = 0x3e4349;

// Gravity, as the simulation has it, for a fish dropping into the sea.
const G = 9.80665;

// A fish as it comes out of a tube, `len` long and `R` round: unless the class
// says otherwise (`launch.fish`) a G7a, 53.3 cm across and, here, six metres
// long, so that it lies wholly in the Tirpitz's tubes until it is fired; its
// fins inside its own diameter, as a tube-launched torpedo's are.
const G7A = { len: 6.0, r: 0.262 };
const fishGeo = new Map();
function fishGeometry({ len, r: R } = G7A) {
  const key = `${len}/${R}`;
  if (fishGeo.has(key)) return fishGeo.get(key);
  const h = len / 2;
  const k = R / G7A.r;
  const prof = [
    [0, h], [0.12 * k, h - 0.06 * k], [0.2 * k, h - 0.2 * k], [0.25 * k, h - 0.45 * k], [R, h - 0.8 * k],
    [R, -h + 1.3 * k], [0.2 * k, -h + 0.55 * k], [0.12 * k, -h + 0.18 * k], [0, -h],
  ].map(([r, z]) => new THREE.Vector2(r, z));
  // A lathe turns about Y, tail to nose; laid down along +Z, nose first.
  const geo = new THREE.LatheGeometry(prof.reverse(), 14);
  geo.rotateX(Math.PI / 2);
  fishGeo.set(key, geo);
  return geo;
}

/**
 * Her tubes, firing: `fireTubes(i, t)` throws the fish out of bank `i`, one
 * tube after another, as the simulation launches them (see fireTorpedoes and
 * the class's `launch`) -- out of the tubes whose lanes `launch.lanes` names,
 * which for the Tirpitz is all four and for a ship that fires three out of a
 * bank of four is three. Each is blown out along its own tube, and once
 * its middle is past the muzzle it drops -- going on at the speed it left at
 * and tipping nose down as it falls -- until it is in the sea, where it is put
 * on `userData.dropped` for a splash and the simulation's torpedo, which went
 * in at the same place, takes over. All of it in her own frame, from where the
 * bank was trained when it fired.
 */
export function fitTubes(g, banks, launch) {
  const flying = [];
  const mat = new THREE.MeshLambertMaterial({ color: GUN_DARK, side: THREE.DoubleSide });
  const out = (launch.muzzle - launch.lie) / launch.eject;
  g.userData.dropped = [];
  g.userData.fireTubes = (i, t) => {
    const bank = banks[i];
    if (!bank) return;
    // The bores the class fires from, each the one nearest its lane.
    const bores = launch.lanes.map((l) => bank.userData.bores.reduce((a, b) => (Math.abs(b[0] - l) < Math.abs(a[0] - l) ? b : a)));
    if (!bank.userData.fish) {
      bank.userData.fish = bores.map(() => {
        const f = new THREE.Mesh(fishGeometry(launch.fish), mat);
        f.visible = false;
        f.rotation.order = 'YXZ';
        f.userData.dynamic = true;
        g.add(f);
        return f;
      });
    }
    bank.updateMatrix();
    bank.userData.fish.forEach((mesh, k) => {
      const prev = flying.indexOf(mesh.userData.flight);
      if (prev >= 0) flying.splice(prev, 1);
      const [x, y] = bores[k];
      mesh.userData.flight = {
        mesh, t0: t + k * launch.stagger, x, y,
        frame: bank.matrix.clone(), yaw: bank.rotation.y,
      };
      flying.push(mesh.userData.flight);
    });
  };
  const p = new THREE.Vector3();
  return (t) => {
    for (let k = flying.length - 1; k >= 0; k--) {
      const f = flying[k];
      const tau = t - f.t0;
      if (tau < 0) { f.mesh.visible = false; continue; }
      const z = launch.lie + launch.eject * tau;
      let y = f.y;
      let pitch = 0;
      if (tau > out) {
        const fall = tau - out;
        y -= 0.5 * G * fall * fall;
        pitch = Math.atan2(G * fall, launch.eject);
      }
      p.set(f.x, y, z).applyMatrix4(f.frame);
      if (p.y <= 0) {
        // In the sea.
        f.mesh.visible = false;
        flying.splice(k, 1);
        g.userData.dropped.push(new THREE.Vector3(p.x, 0, p.z));
        continue;
      }
      f.mesh.position.copy(p);
      f.mesh.rotation.set(pitch, f.yaw, 0);
      f.mesh.visible = true;
    }
  };
}
