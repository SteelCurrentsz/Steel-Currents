// Being there: what a battle feels like from inside a tank or behind a rifle,
// rather than from a ship's bridge two miles off.
//
// A shell landing forty metres away does not make a noise on the screen, it
// shoves the camera and stuns the ear and throws dirt across the view. A
// round cracking past a man's head makes him flinch whether it hits him or
// not. A tank's gun going off rocks the whole hull back on its suspension and
// fills the turret with the slam of it; its engine is a beat under
// everything, rising with the revs and falling at each change of gear; and
// its tracks throw up dust behind it. None of that is the simulation -- the
// battle is the same battle -- but all of it is the difference between
// watching a war and being in one.
//
// Put onto the Battle class by installImmersion, like troops.js.

import * as THREE from '../../vendor/three.module.js';
import { audio } from './audio.js';
import { wrapAngle, angleDelta, clamp } from '../../shared/math.js';
import { drawnGround } from '../../shared/world.js';

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * What blows up, and how big it is felt next to a 120 mm shell. A ship's
 * gun going off close by is a blow in the chest too.
 */
const BLAST = {
  hit: 1, landhit: 1, blast: 1.4, bomb: 2, gren: 0.55, crater: 1.3, mslHit: 1.6, torpHit: 1.1,
  batteryFell: 1.5, tankBrewUp: 1.5, airburst: 0.7, detonate: 1.5, magFire: 2.2, bldghit: 0.8,
  flakOut: 0.4, samBurst: 0.5, muzzle: 0.45, heavyGun: 0.7, splash: 0.7, planeCrash: 1.3,
  dcBurst: 0.6, collapse: 0.9, ruin: 0.9, nukeWave: 4,
};

/** Smooth noise in -1..1 off a sum of sines: the camera shakes, it does not jitter. */
function wob(t, seed) {
  return (Math.sin(t * 17.3 + seed) * 0.5 + Math.sin(t * 29.1 + seed * 2.1) * 0.3 + Math.sin(t * 47.7 + seed * 3.7) * 0.2);
}

/** A damped spring on one number, as in fps.js. */
class Spring {
  constructor(k, c) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  kick(v) { this.v += v; }
  step(dt) {
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (-this.k * this.x - this.c * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

const Immersion = {
  /** Set up once, from the constructor. */
  bindImmersion() {
    this.cc = {
      trauma: 0, clock: 0, supp: 0, dirt: 0, hurt: 0, beatAt: 0,
      lastHp: 100, on: false,
    };
    this.tankFeel = null;
  },

  /** Is the camera down among it: a soldier or a tank in hand. */
  closeIn() {
    return !!(this.troop || (this.commandBat && this.commandBat.tank));
  },

  /** Where the one in hand is, in the world: his head, or the tank's turret. */
  closePoint() {
    if (this.troop) {
      const d = this.troop.held && this.troop.held.drawn;
      if (d) return { x: d.x, y: d.y + 1.5, z: d.z };
      const p = this.troopsNow?.find((q) => q.i === this.troop.id);
      return p ? { x: p.x, y: p.y + 1.5, z: p.z } : null;
    }
    const c = this.commandBat;
    if (c && c.tank) {
      const v = this.scene.batteryViews?.get(c.id);
      if (v) return { x: v.group.position.x, y: v.group.position.y + 2.2, z: v.group.position.z };
    }
    return null;
  },

  /**
   * Every event, before it is shown: a burst close to the man or the tank in
   * hand is felt -- the camera thrown, the ear stunned, dirt over the view.
   */
  feelEvent(ev) {
    if (!this.cc || !this.closeIn()) return;
    const base = BLAST[ev.e];
    if (ev.e === 'rf') { this.feelRound(ev); return; }
    if (!base || !Number.isFinite(ev.x) || !Number.isFinite(ev.z)) return;
    // Our own tank's gun is felt as its own thing: see tankFired.
    if (ev.e === 'muzzle' && this.commandBat && ev.battery === this.commandBat.id) return;
    const p = this.closePoint();
    if (!p) return;
    const cal = Number(ev.cal) || 0;
    const s = base * (cal ? clamp(cal / 120, 0.25, 3.5) : 1);
    const R = 14 + 34 * s;
    const d = Math.hypot(ev.x - p.x, (Number.isFinite(ev.y) ? ev.y : p.y) - p.y, ev.z - p.z);
    if (d > R * 2.2) return;
    // Far out it is only a rumble in the camera; close in it is everything.
    const k = Math.pow(Math.max(0, 1 - d / (R * 2.2)), 1.6);
    const inside = d < R ? Math.pow(1 - d / R, 1.3) : 0;
    const gun = ev.e === 'muzzle' || ev.e === 'heavyGun';
    this.cc.trauma = Math.min(1.2, this.cc.trauma + k * (gun ? 0.35 : 0.9));
    if (inside > 0.15) audio.deafen(Math.min(1, inside * (gun ? 0.6 : 1.1)));
    if (this.feel && inside > 0.05) this.feel.jolt(inside * 1.4);
    if (!gun && inside > 0.35 && ev.e !== 'splash' && ev.e !== 'airburst' && ev.e !== 'flakOut' && ev.e !== 'samBurst') {
      this.cc.dirt = Math.min(1, this.cc.dirt + inside);
    }
    if (this.tankFeel && inside > 0.1) this.tankFeel.jolt(inside);
  },

  /**
   * A rifle or machine-gun round off the snapshot: one that went close past
   * the man in hand is a crack at his ear and keeps his head down, whoever it
   * was meant for. His own are not.
   */
  feelRound(ev) {
    if (!this.troop || ev.s === this.troop.id) return;
    const p = this.closePoint();
    if (!p || !Number.isFinite(ev.tx)) return;
    const ax = ev.x, ay = ev.y, az = ev.z;
    const dx = ev.tx - ax, dy = ev.ty - ay, dz = ev.tz - az;
    const L2 = dx * dx + dy * dy + dz * dz;
    if (L2 < 1) return;
    const u = clamp(((p.x - ax) * dx + (p.y - ay) * dy + (p.z - az) * dz) / L2, 0, 1);
    const cx = ax + dx * u - p.x, cy = ay + dy * u - p.y, cz = az + dz * u - p.z;
    const off = Math.hypot(cx, cy, cz);
    // Struck right beside him: the round into the dirt.
    const ex = ev.tx - p.x, ez = ev.tz - p.z;
    const landed = Math.hypot(ex, ev.ty - p.y, ez);
    if (landed < 3 && u > 0.98) audio.impactNear({ x: ev.tx, y: ev.ty, z: ev.tz }, false);
    if (off > 4.5 || u < 0.02 || (u > 0.995 && landed > 4.5)) return;
    const near = clamp(1 - off / 4.5, 0, 1);
    // Which side of his head it went by.
    const c = this.troop;
    const rx = -Math.cos(c.yaw), rz = Math.sin(c.yaw);
    const side = clamp((cx * rx + cz * rz) / Math.max(0.5, off), -1, 1);
    audio.crack(near, side);
    this.cc.supp = Math.min(1, this.cc.supp + 0.18 + near * 0.35);
    this.cc.trauma = Math.min(1, this.cc.trauma + near * 0.18);
    if (this.feel && near > 0.6) this.feel.flinch(0.35 * near);
  },

  /** The man in hand hurt: thrown off his aim, and told which way it came from. */
  feelWound(ev) {
    if (this.feel) this.feel.flinch(1);
    this.cc.trauma = Math.min(1.2, this.cc.trauma + 0.5);
    audio.deafen(0.35);
    audio.thump(90, 40, 0.18, 0.35);
    if (Number.isFinite(ev.dx) && Number.isFinite(ev.dz) && (ev.dx || ev.dz)) {
      // From where it came, not where it was going.
      this.damageFrom(Math.atan2(-ev.dx, -ev.dz));
    }
  },

  /** A red arc round the middle of the screen, pointing at where the shot came from. */
  damageFrom(bearing) {
    const host = document.getElementById('cc-dmg');
    if (!host) return;
    const yaw = this.troop ? this.troop.yaw : (this.batYaw ?? 0);
    // Clockwise on the screen is to the right, which is a falling yaw here.
    const rel = -angleDelta(yaw, bearing);
    const el = document.createElement('i');
    el.style.transform = `rotate(${(rel * 180) / Math.PI}deg)`;
    host.appendChild(el);
    setTimeout(() => el.remove(), 1600);
    while (host.children.length > 5) host.firstChild.remove();
  },

  /** A word over the crosshair when one of his goes down: CoD's "+100", without the arithmetic. */
  killPop(head) {
    const el = document.getElementById('cc-pop');
    if (!el) return;
    el.innerHTML = head ? '<b>HEADSHOT</b><span>Enemy killed</span>' : '<b>ENEMY KILLED</b>';
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  },

  /**
   * Every frame with a soldier or a tank in hand: the overlays -- the dark
   * at the edges, the blur and grey of being shot at, the dirt thrown over
   * the view, the red of a bad wound -- and his heart.
   */
  closeFrame(dt) {
    const cc = this.cc;
    if (!cc) return;
    const on = this.closeIn() && !this.mapBig;
    if (on !== cc.on) {
      cc.on = on;
      document.body.classList.toggle('cc-on', on);
      document.body.classList.toggle('cc-tank', on && !!(this.commandBat && this.commandBat.tank));
      if (!on) {
        cc.supp = 0; cc.dirt = 0; cc.trauma = 0;
        document.body.style.removeProperty('--cc-hurt');
      }
    }
    if (!on) return;
    cc.clock += dt;
    cc.supp = Math.max(0, cc.supp - dt * 0.4);
    cc.dirt = Math.max(0, cc.dirt - dt * 0.35);
    cc.trauma = Math.max(0, cc.trauma - dt * 1.1);
    const root = document.body.style;
    root.setProperty('--cc-supp', cc.supp.toFixed(3));
    root.setProperty('--cc-dirt', cc.dirt.toFixed(3));
    // How badly he is hurt, off his health: the screen greys and reddens,
    // and his heart is heard under everything.
    let hurt = 0;
    if (this.troop) {
      const p = this.troopRow?.(this.troop.id);
      const hp = p ? p.hp : 100;
      hurt = clamp((55 - hp) / 45, 0, 1);
      if (hurt > 0 && cc.clock > cc.beatAt) {
        cc.beatAt = cc.clock + lerp(1.05, 0.55, hurt);
        audio.heartbeat(0.4 + hurt * 0.6);
      }
    }
    cc.hurt = lerp(cc.hurt, hurt, 1 - Math.exp(-3 * dt));
    root.setProperty('--cc-hurt', cc.hurt.toFixed(3));
  },

  /**
   * The shake off everything felt this frame, laid over the camera once it
   * has been put where it belongs. Turned, not moved, for the most part: a
   * view that is shoved sideways a metre looks like a bad camera, and one
   * tipped a couple of degrees looks like a blow.
   */
  closeShake(cam, extra = 0) {
    const cc = this.cc;
    if (!cc) return;
    const s = Math.min(1.4, cc.trauma + extra);
    if (s <= 0.001) return;
    const a = s * s;
    const t = cc.clock;
    cam.rotateX(wob(t, 1.3) * 0.045 * a);
    cam.rotateY(wob(t, 4.1) * 0.045 * a);
    cam.rotateZ(wob(t, 7.7) * 0.06 * a);
    cam.position.y += wob(t, 9.2) * 0.12 * a;
    cam.updateMatrixWorld(true);
  },

  // --------------------------------------------------------------- tanks ----

  /** A tank taken: its own camera, its engine started, its sight ready. */
  tankTaken(b) {
    const T = b.tank || {};
    this.tankFeel = {
      T,
      big: clamp(((T.tons || 30) - 25) / 30, 0, 1),
      cal: b.caliber || 75,
      reload: b.reload || 6,
      pos: null, look: null,
      rock: new Spring(70, 7),
      side: new Spring(70, 7),
      kick: new Spring(240, 18),
      roll: new Spring(120, 10),
      lastTurret: null, traverse: 0,
      lastPitch: 0, bump: 0,
      loadedSaid: true, sight: false,
      jolt(k) { this.roll.kick((Math.random() - 0.5) * 1.8 * k); this.kick.kick(-1.2 * k); },
      dustAt: 0, exhaustAt: 0,
    };
    this.input.captureLook = !this.input.touch;
    const optic = document.getElementById('tank-optic');
    if (optic) optic.dataset.kind = (T.tons || 30) > 45 ? 'tzf' : 'm70';
    const hud = document.getElementById('tank-hud');
    if (hud) hud.hidden = false;
  },

  /** And handed back: the engine off, the mouse let go. */
  tankLeft() {
    if (!this.tankFeel) return;
    if (this.tankFeel.grp) this.tankFeel.grp.visible = true;
    this.tankFeel = null;
    audio.tankEngineOff();
    this.input.captureLook = false;
    this.input.releaseLock();
    const optic = document.getElementById('tank-optic');
    if (optic) optic.hidden = true;
    const hud = document.getElementById('tank-hud');
    if (hud) hud.hidden = true;
    document.body.classList.remove('cc-sight');
  },

  /** Our tank's gun has gone off: the hull rocks, the camera is slammed, the dust jumps. */
  tankFired(ev) {
    const f = this.tankFeel;
    if (!f) return;
    // The hull back on its suspension, about the line across the gun.
    f.rock.kick(0.55 + 0.35 * f.big);
    f.kick.kick(4.5);
    f.roll.kick((Math.random() - 0.5) * 0.6);
    this.cc.trauma = Math.min(1.2, this.cc.trauma + 0.55);
    f.loadedSaid = false;
    audio.tankGunOwn(f.cal);
    audio.deafen(f.sight ? 0.45 : 0.3);
    // The blast off the muzzle brake throws the dust up off the ground
    // under and in front of the gun.
    const v = this.scene.batteryViews?.get(this.commandBat?.id);
    const fx = this.scene.effects;
    if (v && fx) {
      const p = v.group.position;
      const b = Number.isFinite(ev.b) ? ev.b : this.batYaw;
      for (let i = 0; i < 5; i++) {
        const r = 3 + i * 1.6;
        const sp = (i - 2) * 0.35;
        fx.dust(p.x + Math.sin(b + sp) * r, p.y + 0.3, p.z + Math.cos(b + sp) * r, 0.55 + 0.25 * f.big);
      }
      fx.flash?.(p.x + Math.sin(b) * 5, p.y + 2.4, p.z + Math.cos(b) * 5, 0.5);
    }
  },

  /** A round on our own tank: the clang through the plate and the spall, felt. */
  tankStruck(ev, pen) {
    const f = this.tankFeel;
    audio.tankStruck(pen);
    this.cc.trauma = Math.min(1.4, this.cc.trauma + (pen ? 1 : 0.6));
    if (f) {
      f.roll.kick((Math.random() - 0.5) * 3);
      f.kick.kick(-3);
    }
    if (Number.isFinite(ev.x) && Number.isFinite(ev.z)) {
      const p = this.closePoint();
      if (p) {
        // Which side it struck, as the arcs show the man on foot.
        const host = document.getElementById('cc-dmg');
        if (host) this.damageFrom(Math.atan2(ev.x - p.x, ev.z - p.z));
      }
    }
    this.cc.dirt = Math.min(1, this.cc.dirt + (pen ? 0.5 : 0.2));
  },

  /**
   * The camera with a tank in hand: behind and above its turret, laid on
   * the way the gun is to go -- or through the gunner's sight, the right
   * button or V, looking down the bore. Either way the camera rides the
   * hull: it lags the tank as it moves off and runs on as it stops, it
   * pitches and rolls with the ground under the tracks (less than the hull
   * does: a man's head is not bolted to it), and the engine is in it as a
   * shudder and the gun as a slam.
   */
  tankCamera(cam, watch, m, dt) {
    const c = this.commandBat;
    const f = this.tankFeel;
    dt = clamp(dt, 0, 0.05);
    if (this.hud.stickMouse) { m.x = 0; m.y = 0; }
    this.driveFromStick(c);
    if (m.x || m.y) c.held = false;
    const sight = !!this.scoped || !!f.sight;
    // The glass: the wheel works it in the sight, and stands the camera off
    // the tank or brings it in outside.
    const glass = clamp((this.batFov || 30) * 0.5, 3, 30);
    const want = sight ? glass : 70;
    this.batFovNow = lerp(this.batFovNow || want, want, 1 - Math.pow(0.0005, dt));
    const sens = sight ? this.batFovNow / 70 : 1;
    this.batYaw = wrapAngle(this.batYaw + (this.input.locked ? -m.x : m.x) * sens);
    this.batPitch = clamp(this.batPitch + m.y * sens, -0.35, sight ? 0.25 : 0.55);
    const v = this.scene.batteryViews?.get(c.id);
    const grp = v ? v.group : null;
    const T = f.T || {};
    const at = grp ? grp.position : new THREE.Vector3(watch.x, watch.y, watch.z);
    // The hull's own up and its pitch and roll, off the drawn model.
    const up = new THREE.Vector3(0, 1, 0);
    if (grp) up.applyQuaternion(grp.quaternion);
    // The pivot, over the turret roof, eased after the tank so the camera
    // lags it moving off and runs on stopping.
    const H = (T.height || 2.7);
    const pivot = at.clone().addScaledVector(up, H + 0.5);
    if (!f.pos || f.pos.distanceToSquared(pivot) > 400) f.pos = pivot.clone();
    const ease = 1 - Math.exp(-(sight ? 30 : 9) * dt);
    f.pos.lerp(pivot, ease);
    // A bump in the ground under the tracks, off how fast the hull is pitching.
    const hullPitch = grp ? Math.asin(clamp(new THREE.Vector3(0, 0, 1).applyQuaternion(grp.quaternion).y, -1, 1)) : 0;
    const dp = (hullPitch - f.lastPitch) / Math.max(dt, 1e-3);
    f.lastPitch = hullPitch;
    if (Math.abs(dp) > 0.5) f.kick.kick(clamp(dp * 0.05, -1.5, 1.5));
    const cp = Math.cos(this.batPitch);
    const dir = new THREE.Vector3(Math.sin(this.batYaw) * cp, -Math.sin(this.batPitch), Math.cos(this.batYaw) * cp);
    const right = new THREE.Vector3(-Math.cos(this.batYaw), 0, Math.sin(this.batYaw));
    const kick = f.kick.step(dt);
    const roll = f.roll.step(dt);
    let eye;
    if (sight) {
      // The gunner's sight: in the turret face beside the gun, a metre and
      // a half forward of the pivot and down off the roof. It is fixed to
      // the turret, which is fixed to the hull: every rock of the hull is in it.
      const fwd = new THREE.Vector3(Math.sin(this.batYaw), 0, Math.cos(this.batYaw));
      eye = f.pos.clone().addScaledVector(fwd, 1.4).addScaledVector(up, -0.75).addScaledVector(right, 0.3);
    } else {
      // Behind and above, a little to the right of the gun so the turret
      // is not in the middle of the picture.
      const dist = clamp((this.batFov || 30) / 30 * 10, 5, 22);
      eye = f.pos.clone().addScaledVector(dir, -dist).addScaledVector(right, -0.0);
      eye.y += 1.2 + dist * 0.08;
      eye.addScaledVector(dir, kick * 0.35);
      const w = this.scene.world;
      const g = w ? drawnGround(w, eye.x, eye.z) : -1e9;
      if (eye.y < g + 0.8) eye.y = g + 0.8;
    }
    cam.up.set(0, 1, 0);
    cam.position.copy(eye);
    const look = eye.clone().addScaledVector(dir, 1000);
    cam.lookAt(look);
    // The hull's roll and pitch in the view: all of it through the sight,
    // which is bolted to the turret, and a third of it from outside.
    const hullRoll = grp ? Math.asin(clamp(new THREE.Vector3(1, 0, 0).applyQuaternion(grp.quaternion).y, -1, 1)) : 0;
    const share = sight ? 0.9 : 0.3;
    // Seen along the gun: how much of the hull's pitch and roll is about the line of sight.
    const hh = grp ? new THREE.Euler().setFromQuaternion(grp.quaternion, 'YXZ').y : this.batYaw;
    const rel = angleDelta(hh, this.batYaw);
    const tilt = hullRoll * Math.cos(rel) - hullPitch * Math.sin(rel);
    cam.rotateZ(-tilt * share + roll * 0.02);
    cam.rotateX(-kick * (sight ? 0.012 : 0.006));
    // The engine, in the frame: a shudder that grows with the revs.
    const body = c.held && c.held.body;
    const speed = body ? Math.abs(body.speed || 0) : Math.abs(watch.sp || 0);
    const thr = Math.abs(c.drive?.th || 0);
    const t = this.cc.clock;
    const buzz = (0.0007 + 0.0012 * thr + 0.0011 * Math.min(1, speed / 6)) * (sight ? 2.2 : 1);
    cam.rotateX(Math.sin(t * 61) * buzz);
    cam.rotateY(Math.sin(t * 47 + 1.3) * buzz * 0.6);
    cam.updateMatrixWorld(true);
    this.closeShake(cam);
    cam.fov = this.batFovNow;
    // The rock of the hull itself, drawn on the model (see placeTank).
    f.rockNow = f.rock.step(dt);
    // What the crosshair is on, off the line of the camera.
    const p = this.batAimPoint({ x: eye.x, y: eye.y, z: eye.z });
    this.batAim = p;
    if (!c.held) this.layFromSight(p);
    const el = document.getElementById('bat-sight');
    if (el) {
      el.classList.toggle('masked', !!p.out);
      el.classList.toggle('tank-sight', sight);
    }
    const optic = document.getElementById('tank-optic');
    if (optic) optic.hidden = !sight || !!this.mapBig;
    // Through the sight the tank's own gun and mantlet are behind the glass,
    // not in front of it.
    if (grp) grp.visible = !sight;
    f.grp = grp;
    document.body.classList.toggle('cc-sight', sight && !this.mapBig);
    const tag = document.getElementById('bat-aim');
    if (tag) {
      const m2 = Math.round(p.dist / 25) * 25;
      const txt = `${p.name ? `${p.name} · ` : ''}${m2.toLocaleString('en-US')} m${p.out ? ' · out of range' : ''}`;
      if (tag.textContent !== txt) tag.textContent = txt;
    }
    const rng = document.getElementById('tank-optic-range');
    if (rng) {
      const txt = `${Math.round(p.dist / 50) * 50}`;
      if (rng.textContent !== txt) rng.textContent = txt;
    }
    this.tankFrame(c, body, speed, thr, dt, f);
  },

  /** The tank's engine, its dust and its instruments, every frame it is in hand. */
  tankFrame(c, body, speed, thr, dt, f) {
    const snap = this.snapshots[this.snapshots.length - 1];
    const g = snap && (snap.batteries || []).find((q) => q.i === c.id);
    // How fast the turret is coming round, off the bearing it is on.
    const turret = g ? wrapAngle(g.h + g.a) : 0;
    if (f.lastTurret !== null) {
      const rate = Math.abs(angleDelta(f.lastTurret, turret)) / Math.max(dt, 1e-3);
      f.traverse = lerp(f.traverse, clamp(rate / 0.4, 0, 1), 1 - Math.exp(-10 * dt));
    }
    f.lastTurret = turret;
    const dead = g && g.td && ((g.td[0] & 15) || g.td[1] === 0);
    if (g && g.al && !dead) {
      audio.tankEngine({ speed, throttle: thr, turn: c.drive?.st || 0, traverse: f.traverse, big: f.big });
    } else audio.tankEngineOff();
    // The gun loaded again: the breech closing on a fresh round.
    if (g && !(g.cd > 0) && !f.loadedSaid) {
      f.loadedSaid = true;
      audio.tankLoaded();
    }
    // The instruments: speed, gear, which way the hull is under the turret,
    // and the loader's progress.
    const hud = document.getElementById('tank-hud');
    if (hud && g) {
      const kmh = Math.round(Math.abs((body ? body.speed : g.sp) || 0) * 3.6);
      const sp = document.getElementById('tank-speed');
      if (sp && sp.textContent !== String(kmh)) sp.textContent = String(kmh);
      const gearEl = document.getElementById('tank-gear');
      const sv = (body ? body.speed : g.sp) || 0;
      const gear = sv < -0.2 ? 'R' : Math.abs(sv) < 0.2 ? (thr ? '1' : 'N') : String(1 + Math.min(4, Math.floor(Math.abs(sv) / 2.6)));
      if (gearEl && gearEl.textContent !== gear) gearEl.textContent = gear;
      // The hull drawn turned under a turret that always points up the screen.
      const hull = document.getElementById('tank-hull');
      const hh = body ? body.h : g.h;
      if (hull) hull.setAttribute('transform', `rotate(${(-angleDelta(this.batYaw, hh) * 180 / Math.PI).toFixed(1)} 50 50)`);
      const tur = document.getElementById('tank-turret');
      if (tur) tur.setAttribute('transform', `rotate(${(-angleDelta(this.batYaw, turret) * 180 / Math.PI).toFixed(1)} 50 50)`);
      const bar = document.getElementById('tank-load');
      if (bar) {
        const k = g.cd > 0 ? 1 - g.cd / Math.max(0.1, f.reload) : 1;
        bar.style.width = `${Math.round(clamp(k, 0, 1) * 100)}%`;
        bar.classList.toggle('ready', !(g.cd > 0));
      }
      const lab = document.getElementById('tank-load-lab');
      if (lab) {
        const txt = g.cd > 0 ? `Loading ${Math.ceil(g.cd)}s` : 'Ready';
        if (lab.textContent !== txt) lab.textContent = txt;
      }
    }
  },

  /**
   * The dust off a tank's tracks and the smoke off its exhausts, for every
   * tank moving on dry land: more the faster it goes, behind it where the
   * tracks leave the ground.
   */
  tankDust(view, g, T) {
    const fx = this.scene.effects;
    if (!fx || g.ab || !g.al) return;
    const sp = Math.abs(g.sp || 0);
    const p = view.group.position;
    if (p.y < 0.4) return;
    const now = performance.now();
    const mine = this.commandBat && this.commandBat.id === g.i;
    const sh = Math.sin(g.h), ch = Math.cos(g.h);
    const L = (T.length || 6) * 0.5, W = (T.width || 2.6) * 0.42;
    if (sp > 1.2) {
      const every = clamp(420 - sp * 30, 110, 420) * (mine ? 0.7 : 1.4);
      if (!view.dustAt || now - view.dustAt > every) {
        view.dustAt = now;
        const size = clamp(0.18 + sp * 0.04, 0.2, 0.6);
        for (const s of [-1, 1]) {
          fx.dust(p.x - sh * L - ch * W * s, p.y + 0.2, p.z - ch * L + sh * W * s, size);
        }
      }
    }
    // The exhausts, black when the driver puts his foot down.
    if (mine) {
      const thr = Math.abs(this.commandBat.drive?.th || 0);
      const every = thr > 0.3 ? 140 : 600;
      if (!view.exhaustAt || now - view.exhaustAt > every) {
        view.exhaustAt = now;
        fx.smokeOver?.(p.x - sh * L * 0.9, p.y + (T.height || 2.7) * 0.75, p.z - ch * L * 0.9, 0.12 + thr * 0.12,
          { dark: thr > 0.3 ? 0.28 : 0.12, count: 1, life: 2.5 });
      }
    }
  },
};

/** Put the feel of it onto the battle. */
export function installImmersion(Battle) {
  for (const [k, fn] of Object.entries(Immersion)) Battle.prototype[k] = fn;
}
