// What happens when a coast gun goes off.
//
// Three things, and they happen on three different clocks. The flash is over in
// a fifth of a second and is the only part that lights anything. The gun runs
// back through its cradle in about a fifth of a second and is walked home by
// the recuperator over the next second or two, which is why a heavy gun looks
// like it is being punched rather than pushed. And the smoke stands where the
// muzzle was for ten or twenty seconds afterwards, going nowhere much.
//
// The flash and the smoke are the same as a ship's -- see muzzleblast.js. A gun
// on a headland and a gun in a turret burn the same propellant into the same
// air, and drawing them two different ways was only ever going to make one of
// them look wrong.

import * as THREE from '../../../vendor/three.module.js';
import { MuzzleBlasts } from './muzzleblast.js';

// ------------------------------------------------------------ the recoil --

/**
 * How far back the gun is at `t` seconds after firing, as a fraction of its
 * stroke.
 *
 * Out is quick and decelerating — the recoil brake is taking energy out of it
 * the whole way, so it covers most of the stroke in the first third of the
 * time. Home is slow and eased at both ends, because the recuperator is a
 * spring pushing several tonnes of gun and it neither starts nor stops sharply.
 */
export function recoilAt(t, out, back) {
  if (t < 0) return 0;
  if (t < out) {
    const u = t / out;
    return 1 - (1 - u) * (1 - u);
  }
  if (t < out + back) {
    const u = (t - out) / back;
    return 1 - u * u * (3 - 2 * u);
  }
  return 0;
}

// ------------------------------------------------------------- the guns --

// The ground under a heavy gun, torn up by its own blast.
const DUST_TINT = [0.74, 0.67, 0.54];

// How long the flash lights the scene for, in seconds.
const FLASH = 0.16;

/**
 * Fires the guns of whatever battery is on the screen, on their own reload,
 * and runs the recoil, the flash, the smoke and the dust.
 */
export class GunFire {
  constructor(scene) {
    this.scene = scene;
    this.blasts = new MuzzleBlasts(scene);
    // How hard the last flash is burning, 0 to 1. The scene reads it and lifts
    // its own two lights for as long as it lasts.
    //
    // A point light at the muzzle would be the obvious way to do this, and it
    // is the wrong one: a third light in the scene makes every material shade
    // an extra source on every fragment of every frame, firing or not, and that
    // is a tenth of the frame given up for a tenth of a second of flash.
    this.flashLevel = 0;
    this.guns = [];
    this.time = 0;
    this._p = new THREE.Vector3();
    this._d = new THREE.Vector3();
  }

  /**
   * Take a new battery's guns.
   *
   * `period` is worked out from the real reload but on a compressed clock: a
   * gun that takes three minutes to load would otherwise be a screen with
   * nothing happening on it. The order is kept, so the eighty-eight still fires
   * three times for every one round out of Gustav.
   */
  setBattery(battery, reload, groundY = 0) {
    this.groundY = groundY;
    const period = Math.min(18, 2.5 + Math.sqrt(Math.max(0.5, reload)) * 1.5);
    this.guns = (battery ? battery.guns : []).map((gun, i) => {
      return {
        ...gun,
        period,
        // Guns of a battery are laid together but not fired together: half a
        // second apart is what a salvo sounds like.
        next: 1.4 + i * 0.55,
        t: -1,
        // Out fast, home slow. Both scale with the stroke, which scales with
        // the bore, so a fourteen-inch gun takes about a second and a half to
        // come home and an eighty-eight is back before the case is clear.
        out: 0.07 + gun.stroke * 0.1,
        back: 0.55 + gun.stroke * 1.05,
      };
    });
  }

  /** `camera` is what the smoke is sorted against, back to front. */
  update(dt, wind, camera) {
    this.time += dt;
    // The sea's wind is given as a direction; the smoke wants metres a second.
    if (wind) { this.blasts.wind.x = wind.x * 3; this.blasts.wind.z = wind.y * 3; }

    let lit = 0;
    for (const gun of this.guns) {
      gun.next -= dt;
      if (gun.next <= 0) {
        gun.next = gun.period;
        gun.t = 0;
        this.fire(gun);
      }
      if (gun.t >= 0) {
        gun.t += dt;
        gun.node.position.z = -gun.stroke * recoilAt(gun.t, gun.out, gun.back);
        // The flash: bloom, then gone, and the light it throws with it.
        if (gun.t < FLASH) lit = Math.max(lit, Math.pow(1 - gun.t / FLASH, 1.15));
        if (gun.t > gun.out + gun.back) { gun.t = -1; gun.node.position.z = 0; }
      }
    }
    this.flashLevel = lit;
    this.blasts.update(dt, camera);
  }

  /** One round away. */
  fire(gun) {
    gun.node.updateMatrixWorld(true);
    const p = this._p.set(0, 0, gun.muzzleZ).applyMatrix4(gun.node.matrixWorld);
    const d = this._d.set(0, 0, 1).transformDirection(gun.node.matrixWorld).normalize();
    const bore = gun.bore;
    this.blasts.fire(p.x, p.y, p.z, d, bore * 1000);

    // And the dust the blast tears off the ground under the muzzle. It comes
    // off the ground, which is the whole point of it: spawned at the height of
    // the gun it is a brown cloud hanging in mid-air with nothing under it.
    if (bore >= 0.14) {
      const gy = this.groundY || 0;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        this.blasts.puff(
          p.x + d.x * bore * 5 + Math.sin(a) * bore * 4, gy + bore * 4,
          p.z + d.z * bore * 5 + Math.cos(a) * bore * 4,
          Math.sin(a) * bore * 30, bore * 8, Math.cos(a) * bore * 30,
          bore * 9, 5 + bore * 6, DUST_TINT, 0.5,
        );
      }
    }
  }

  dispose() {
    this.blasts.dispose();
  }
}
