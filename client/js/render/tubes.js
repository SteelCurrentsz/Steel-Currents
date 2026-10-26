// A bank of torpedo tubes, firing: the fish blown out of the tubes one after
// another and dropping into the sea over her side -- or, from a tube in her
// hull, pushed out under the water -- drawn in her own frame until each is in
// the sea and the simulation's torpedo takes over.
//
// Every ship with tubes fires through this: a destroyer's quintuple bank, a
// cruiser's triples, a battleship's quadruples on her upper deck, the
// Rodney's bow tubes and a U-boat's.

import * as THREE from '../../../vendor/three.module.js';
import { fishGeometry, torpedoMaterial } from './torpedo.js';

// Gravity, as the simulation has it, for a fish dropping into the sea.
const G = 9.80665;

// A fish as it comes out of a tube, `len` long and `r` round: unless the class
// says otherwise (`launch.fish`) a G7a, 53.3 cm across and, here, six metres
// long, so that it lies wholly in the Tirpitz's tubes until it is fired. It is
// the same torpedo the sea draws once it is running (see torpedo.js), screws,
// fins and paint, fitted to the tubes her sculpt has.
const G7A = { len: 6.0, r: 0.262, kind: 'g7a' };

/** The launch a bank fires by: its own, or its class's. */
function launchOf(T, i) {
  const spec = T && T.mounts ? T.mounts[i] : null;
  return (spec && spec.launch) || (T && T.launch) || null;
}

/** The fish that goes out of tube `k` of a launch. */
function fishOf(L, k) {
  const f = Array.isArray(L.fish) ? L.fish[k % L.fish.length] : L.fish;
  return f || G7A;
}

const inv = new THREE.Matrix4();
const rel = new THREE.Matrix4();
const pos = new THREE.Vector3();
const scl = new THREE.Vector3();

/**
 * Her tubes, firing: `fireTubes(i, t)` throws the fish out of bank `i`, one
 * tube after another, as the simulation launches them (see fireTorpedoes and
 * the bank's `launch`) -- out of the tubes whose lanes `launch.lanes` names,
 * which for the Tirpitz is all four and for a ship that fires three out of a
 * bank of four is three. The tubes are the model's own: the muzzles its
 * mounting was armed with, wherever on her it stands and however it is built.
 *
 * Each fish is blown out along its own tube, and once its middle is past the
 * muzzle it drops -- going on at the speed it left at and tipping nose down as
 * it falls -- until it is in the sea. A tube in her hull (`wet`) is under the
 * water already: the fish is pushed out along it until it is clear of her. In
 * the sea it is put on `userData.dropped` for a splash and for the torpedo the
 * simulation launched, which went in at the same place, to take over. All of
 * it in her own frame, from where the bank was trained when it fired.
 *
 * `T` is the class's torpedoes; a bare launch is taken as one for every bank.
 */
export function fitTubes(g, banks, T) {
  if (T && T.lanes) T = { launch: T };
  const flying = [];
  const mat = torpedoMaterial();
  g.userData.dropped = [];
  g.userData.fireTubes = (i, t) => {
    const bank = banks[i];
    const L = launchOf(T, i);
    if (!bank || !L) return;
    g.updateMatrixWorld(true);
    // The bank in her frame, as it is trained now.
    inv.copy(g.matrixWorld).invert();
    const frame = new THREE.Matrix4().multiplyMatrices(inv, bank.matrixWorld);
    const turn = new THREE.Quaternion();
    frame.decompose(pos, turn, scl);
    // Its muzzles in its own frame, off whatever node they were armed on.
    const gun = bank.userData.gunNode || bank;
    rel.copy(bank.matrixWorld).invert().multiply(gun.matrixWorld);
    let muzzles = (bank.userData.muzzles || []).map((v) => v.clone().applyMatrix4(rel));
    if (!muzzles.length) {
      muzzles = (bank.userData.bores || []).map(([x, y, , z]) => new THREE.Vector3(x, y, z));
    }
    if (!muzzles.length) return;
    // Each lane the one muzzle nearest it that no other lane has taken. A tube
    // that fires astern has its lanes the other way about.
    const free = muzzles.slice();
    const bores = L.lanes.map((l) => {
      const pool = free.length ? free : muzzles;
      let best = pool[0];
      for (const m of pool) {
        const side = Math.sign(m.z) || 1;
        if (Math.abs(m.x * side - l) < Math.abs(best.x * (Math.sign(best.z) || 1) - l)) best = m;
      }
      const at = free.indexOf(best);
      if (at >= 0) free.splice(at, 1);
      return best;
    });
    if (!bank.userData.fish) {
      bank.userData.fish = bores.map((_, k) => {
        const fish = fishOf(L, k);
        const f = new THREE.Mesh(fishGeometry(fish.kind || 'g7a', fish.len, fish.r), mat);
        f.visible = false;
        f.userData.dynamic = true;
        g.add(f);
        return f;
      });
    }
    bank.userData.fish.forEach((mesh, k) => {
      const prev = flying.indexOf(mesh.userData.flight);
      if (prev >= 0) flying.splice(prev, 1);
      const b = bores[k];
      const dir = Math.sign(b.z) || 1;
      // Pointing out of the muzzle: down the bank, or up it for a tube that
      // fires astern.
      const aim = turn.clone();
      if (dir < 0) aim.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
      mesh.userData.flight = {
        mesh, t0: t + k * L.stagger, x: b.x, y: b.y, dir, L,
        frame, aim,
      };
      flying.push(mesh.userData.flight);
    });
  };
  const p = new THREE.Vector3();
  const tip = new THREE.Quaternion();
  const ax = new THREE.Vector3(1, 0, 0);
  return (t) => {
    for (let k = flying.length - 1; k >= 0; k--) {
      const f = flying[k];
      const L = f.L;
      const tau = t - f.t0;
      if (tau < 0) { f.mesh.visible = false; continue; }
      const out = (L.muzzle - L.lie) / L.eject;
      const s = L.lie + L.eject * tau;
      let y = f.y;
      let pitch = 0;
      if (L.wet) {
        // Pushed out under the water until the whole of her is clear.
        if (tau > out + (L.clear || 0) / L.eject) {
          p.set(f.x, y, f.dir * s).applyMatrix4(f.frame);
          f.mesh.visible = false;
          flying.splice(k, 1);
          const at = p.clone();
          at.wet = true;
          g.userData.dropped.push(at);
          continue;
        }
      } else if (tau > out) {
        const fall = tau - out;
        y -= 0.5 * G * fall * fall;
        pitch = Math.atan2(G * fall, L.eject);
      }
      p.set(f.x, y, f.dir * s).applyMatrix4(f.frame);
      if (!L.wet && p.y <= 0) {
        // In the sea.
        f.mesh.visible = false;
        flying.splice(k, 1);
        g.userData.dropped.push(new THREE.Vector3(p.x, 0, p.z));
        continue;
      }
      f.mesh.position.copy(p);
      f.mesh.quaternion.copy(f.aim).multiply(tip.setFromAxisAngle(ax, pitch));
      f.mesh.visible = true;
    }
  };
}
