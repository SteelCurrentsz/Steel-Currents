// The battle's side of the infantry: drawing the soldiers off the snapshot,
// what their events look and sound like, watching one, and taking one.
//
// A soldier is picked off the plot like anything else and watched from just
// behind him -- or, with the swap, through his own eyes. One of your own side
// can be taken, the same way a tank is: the stick in the lower left walks him
// (or WASD), a drag turns him and lays his rifle where the crosshair is, and
// the keys on the right fire, crouch, sprint, jump and reload. The simulation
// still has him -- he is shot at, he runs out of rounds -- and the moment he
// is handed back he is his own man again.
//
// Put onto the Battle class by installTroops, so game.js only has to call
// into it at the points where a soldier is a thing it has to know about.

import * as THREE from '../../vendor/three.module.js';
import { InfantryView } from './render/infantry.js';
import { audio } from './audio.js';
import { wrapAngle, angleDelta, clamp } from '../../shared/math.js';
import { GARAND } from '../../shared/infantry.js';
import { SHIP_CLASSES } from '../../shared/ships.js';
import { BATTERIES } from '../../shared/batteries.js';

const lerp = (a, b, t) => a + (b - a) * t;

/** A soldier row off the wire (see soldierWire) as something to draw. */
function row(s) {
  return {
    i: s[0], tm: s[1], x: s[2], z: s[3], y: s[4], h: s[5], yaw: s[6], pitch: s[7], f: s[8],
    sp: s[9], hp: s[10], pc: s[11], clip: s[12], clips: s[13], sq: s[14],
  };
}

/** Room each man takes standing in a landing craft's well, in metres. */
const WELL_PITCH = 0.62;
const wellSpots = new Map();

/**
 * Where the men stand in a landing craft's well, in her own frame: rows
 * across the open floor of it, those nearest the ramp first -- the first
 * out -- and none where one of her tanks is standing.
 */
export function wellPlaces(cls, tanks) {
  const key = `${cls.id}:${tanks.join(',')}`;
  if (wellSpots.has(key)) return wellSpots.get(key);
  const well = cls.cargo.well;
  const slots = cls.cargo.vehicles?.slots || [];
  // Packed in closer, shoulder to shoulder, if that is what it takes to get
  // all she carries in.
  let out = [];
  for (let pitch = WELL_PITCH; pitch >= 0.42; pitch -= 0.03) {
    out = placeAt(well, slots, tanks, pitch);
    if (out.length >= cls.cargo.troops) break;
  }
  out.sort((a, b) => b.z - a.z);
  wellSpots.set(key, out);
  return out;
}

function placeAt(well, slots, tanks, pitch) {
  const out = [];
  for (const [x0, x1, z0, z1] of well.areas) {
    const nx = Math.max(1, Math.floor((x1 - x0) / pitch));
    const nz = Math.max(1, Math.floor((z1 - z0) / pitch));
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        // A little out of line, as men stand.
        const x = x0 + (i + 0.5) * (x1 - x0) / nx + (((i * 7 + j * 13) % 5) - 2) * 0.03;
        const z = z0 + (j + 0.5) * (z1 - z0) / nz + (((i * 11 + j * 5) % 5) - 2) * 0.03;
        // Clear of a tank's hull by a hand's breadth.
        const inTank = tanks.some((k) => {
          const sl = slots[k];
          return sl && Math.abs(x - sl[0]) < 1.55 && Math.abs(z - sl[1]) < 3.2;
        });
        if (!inTank) out.push({ x, z });
      }
    }
  }
  return out;
}

const ORDER_NAME = {
  advance: 'advancing', assault: 'assaulting', hold: 'holding', dig_in: 'dug in',
  flank_left: 'flanking left', flank_right: 'flanking right', follow_tank: 'with the armour', fall_back: 'falling back',
};
const ORDER_LIST = Object.keys(ORDER_NAME);

const Troops = {
  /** Set up once, from the constructor. */
  bindTroops(mine) {
    this.troop = null;
    this.troopsNow = [];
    const on = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn, mine);
    on('sol-leave', 'click', () => this.leaveSoldier());
    on('sol-fire', 'pointerdown', (e) => { e.preventDefault(); this.troopFire(); });
    on('sol-jump', 'pointerdown', (e) => { e.preventDefault(); if (this.troop) this.troop.jp++; });
    on('sol-crouch', 'pointerdown', (e) => { e.preventDefault(); if (this.troop) { this.troop.cr = !this.troop.cr; this.troopButtons(); } });
    on('sol-sprint', 'pointerdown', (e) => { e.preventDefault(); if (this.troop) { this.troop.spLock = !this.troop.spLock; this.troopButtons(); } });
    on('sol-reload', 'pointerdown', (e) => { e.preventDefault(); this.troopReload(); });
  },

  /** The men off the snapshot pair, interpolated, and drawn. */
  syncTroops(a, b, t, dt) {
    const rows = a.sd;
    const afloat = (a.ships || []).some((s) => s.tr > 0);
    if (!rows && !afloat && !this.infantry) return;
    if (!this.infantry) this.infantry = new InfantryView(this.scene.scene, this.scene.world || this.world);
    const next = new Map();
    for (const s of (b && b.sd) || []) next.set(s[0], s);
    const list = [];
    for (const s of rows || []) {
      const p = row(s);
      const q = next.get(s[0]);
      if (q) {
        p.x = lerp(p.x, q[2], t); p.z = lerp(p.z, q[3], t); p.y = lerp(p.y, q[4], t);
        p.h = wrapAngle(p.h + angleDelta(p.h, q[5]) * t);
        p.yaw = wrapAngle(p.yaw + angleDelta(p.yaw, q[6]) * t);
        p.pitch = lerp(p.pitch, q[7], t);
      }
      // The man in hand looks where the player is looking, not where the
      // server last heard he was.
      if (this.troop && p.i === this.troop.id) { p.yaw = this.troop.yaw; p.pitch = this.troop.pitch; p.f |= 128; }
      list.push(p);
    }
    this.troopsNow = list;
    this.infantry.barracks(a.bk, this.team);
    const fp = !!(this.troop && this.troop.fp);
    // And the men still in the landing craft, standing in her well and
    // going in with her: drawn, not yet anybody's to pick or to take.
    const drawn = afloat ? list.concat(this.wellMen(a)) : list;
    this.infantry.sync(drawn, dt, this.scene.camera, this.team, this.troop ? this.troop.id : 0, fp);
  },

  /** The soldiers embarked in each landing craft, as rows to draw where they stand in her well. */
  wellMen(a) {
    const out = [];
    const v = new THREE.Vector3();
    for (const s of a.ships || []) {
      if (!(s.tr > 0)) continue;
      const view = this.scene.shipViews.get(s.i);
      const cls = SHIP_CLASSES[view?.group?.userData?.classId || s.c || ''] || null;
      const well = cls?.cargo?.well;
      if (!view || !well) continue;
      const tanks = [];
      for (const g of a.batteries || []) {
        if (g.ab === s.i && BATTERIES[g.b]?.tank) tanks.push(g.sl || 0);
      }
      tanks.sort();
      const spots = wellPlaces(cls, tanks);
      const n = Math.min(s.tr, spots.length);
      view.group.updateMatrixWorld(true);
      const e = view.group.matrixWorld.elements;
      const h = Math.atan2(e[8], e[10]);
      // Those nearest the ramp go out first, so the ones left are the ones furthest aft.
      const most = this.wellMost || (this.wellMost = new Map());
      const had = Math.min(spots.length, Math.max(most.get(s.i) || 0, s.tr));
      most.set(s.i, had);
      const skip = Math.max(0, had - n);
      for (let k = 0; k < n; k++) {
        const p = spots[Math.min(spots.length - 1, k + skip)];
        v.set(p.x, well.deck, p.z).applyMatrix4(view.group.matrixWorld);
        // Some crouched down behind the side, the most of them standing.
        const crouch = (k * 37) % 9 === 0 ? 1 : 0;
        out.push({ i: -(s.i * 1000 + k + 1), tm: s.tm, x: v.x, y: v.y, z: v.z, h, yaw: h, pitch: 0, f: crouch, sp: 0 });
      }
    }
    return out;
  },

  /** A soldier's event: a shot, a wound, a death, and the rest. */
  troopEvent(ev) {
    const inf = this.infantry;
    switch (ev.e) {
      case 'rf': {
        if (inf) inf.shot(ev);
        audio.rifle({ x: ev.x, y: ev.y, z: ev.z }, !!ev.g);
        if (ev.k === 1) audio.flesh({ x: ev.tx, y: ev.ty, z: ev.tz });
        break;
      }
      case 'wd':
        if (inf) inf.wound(ev);
        if (this.troop && ev.i === this.troop.id) {
          this.hud.alert('Hit!');
          this.flashBlood(0.5);
        }
        break;
      case 'kia':
        if (inf) inf.kill(ev, this.team);
        if (this.troop && ev.i === this.troop.id) {
          this.flashBlood(1);
          this.hud.alert('Killed in action');
          this.leaveSoldier(true, false);
        }
        if (this.watching && this.watching.kind === 'soldier' && this.watching.id === ev.i && !this.troop) {
          this.hud.alert('He is down');
        }
        break;
      case 'ping':
        audio.ping({ x: ev.x, y: ev.y, z: ev.z });
        break;
      case 'gren':
        if (inf) inf.grenade(ev);
        this.scene.effects.explosion(ev.x, ev.y, ev.z, 0.25);
        audio.explosion(0.3, { x: ev.x, y: ev.y, z: ev.z });
        break;
      case 'barracksDown':
        this.scene.effects.explosion(ev.x, 3, ev.z, 1.2);
        if (ev.tm === this.team) this.hud.alert('A barracks has been destroyed');
        break;
      case 'troopsAshore':
        if (this.hud && this.ownUnit('ship', ev.ship)) this.hud.ribbon('TROOPS ASHORE', 'hit');
        break;
      case 'squadOrders':
        if (ev.tm === this.team && ev.by === 'opus' && ev.said && this.hud) this.hud.alert(`Opus: ${ev.said}`);
        break;
      default: break;
    }
  },

  /** A red edge to the screen when the man in hand is hit. */
  flashBlood(k) {
    const el = document.getElementById('sol-blood');
    if (!el) return;
    el.style.opacity = String(Math.min(1, (Number(el.style.opacity) || 0) + 0.55 * k));
  },

  /** A soldier off the snapshot, by id. */
  troopRow(id) {
    const snap = this.snapshots[this.snapshots.length - 1];
    const s = snap && (snap.sd || []).find((q) => q[0] === id);
    return s ? row(s) : null;
  },

  /** Where the watched soldier (or barracks) is, for the camera. */
  troopWatchPoint(w) {
    if (w.kind === 'barracks') {
      const snap = this.snapshots[this.snapshots.length - 1];
      const b = snap && (snap.bk || []).find((q) => q[0] === w.id);
      if (!b) return null;
      return { x: b[2], y: this.groundAt ? this.groundAt(b[2], b[3]) : 0, z: b[3], span: 30, eye: 6, still: true };
    }
    const p = this.troopsNow.find((q) => q.i === w.id);
    if (!p) return null;
    // Centred on his chest, so the orbit looks at him and not at his boots;
    // his eye is above that.
    const crouch = p.f & 1;
    return { x: p.x, y: p.y + 1.1, z: p.z, span: 3.2, eye: crouch ? -0.05 : 0.52, soldier: true, close: true, h: p.yaw };
  },

  /** Can the one being watched be taken: one of ours, alive, and nobody else's. */
  canTakeSoldier(w) {
    if (this.director || (this.troop && this.troop.id === w.id)) return false;
    const p = this.troopRow(w.id);
    return !!p && p.tm === this.team && (!p.pc || p.pc === this.shipId);
  },

  /** Take the soldier being watched. */
  takeSoldier() {
    const p = this.troopRow(this.watching.id);
    if (!p) return;
    if (this.commandBat) this.leaveBattery(true);
    this.troop = {
      id: p.i, yaw: p.yaw, pitch: 0, cr: !!(p.f & 1), spLock: false, jp: 0,
      // Through his own eyes to begin with; V puts the camera over his shoulder.
      sent: null, sentAt: 0, since: performance.now(), lastShot: 0, fp: true,
    };
    this.hud.commandSol = p.i;
    this.net.send({ t: 'tsol', i: p.i });
    this.hud.setFlyOffer(false);
    this.hud.setTankStick(true);
    const el = document.getElementById('sol-sight');
    if (el) el.hidden = !!this.mapBig;
    this.troopButtons();
    this.hud.alert('Stick or WASD to move · drag to aim · F or FIRE to shoot · C crouch · Shift sprint · Space jump · R reload · V over the shoulder');
    audio.click();
  },

  /** Hand him back to himself. */
  leaveSoldier(quiet = false, tell = true) {
    const c = this.troop;
    if (!c) return;
    this.troop = null;
    this.hud.commandSol = null;
    this.hud.setTankStick(false);
    if (tell) {
      this.net.send({ t: 'sdrive', i: c.id, mx: 0, mz: 0, yaw: c.yaw, pitch: 0, sp: false, cr: c.cr, jp: c.jp });
      this.net.send({ t: 'lsol', i: c.id });
    }
    const el = document.getElementById('sol-sight');
    if (el) el.hidden = true;
    if (!quiet) {
      this.hud.setFlyOffer(this.canTake());
      audio.click();
    }
  },

  troopButtons() {
    const c = this.troop;
    if (!c) return;
    document.getElementById('sol-crouch')?.classList.toggle('on', !!c.cr);
    document.getElementById('sol-sprint')?.classList.toggle('on', !!c.spLock);
  },

  /** His trigger: one round down the line the crosshair is on. */
  troopFire() {
    const c = this.troop;
    if (!c) return;
    const now = performance.now();
    if (now - c.lastShot < GARAND.cycle * 1000) return;
    c.lastShot = now;
    this.net.send({ t: 'sfire', i: c.id, yaw: Math.round(c.aimYaw * 1000) / 1000, pitch: Math.round(c.aimPitch * 1000) / 1000 });
    this.scoped = this.scoped || false;
    // The kick of it, in the view.
    c.kick = Math.min(0.05, (c.kick || 0) + 0.025);
  },

  troopReload() {
    const c = this.troop;
    if (!c) return;
    this.net.send({ t: 'sreload', i: c.id });
    audio.click();
  },

  /** The keys, while he is in hand. True if the key was his. */
  troopKey(code) {
    const c = this.troop;
    if (!c) return false;
    if (code === 'KeyF' || code === 'Enter') { this.troopFire(); return true; }
    if (code === 'Space') { c.jp++; return true; }
    if (code === 'KeyC' || code === 'ControlLeft') { c.cr = !c.cr; this.troopButtons(); return true; }
    if (code === 'KeyR') { this.troopReload(); return true; }
    if (code === 'KeyV') { c.fp = !c.fp; return true; }
    if (code === 'Escape') { this.leaveSoldier(); return true; }
    return ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(code);
  },

  /**
   * The camera on the man in hand: over his right shoulder, or through his
   * eyes, turned by the drag; the stick and the keys walk him, and what he
   * is doing goes to the battle service when it changes.
   */
  soldierCamera(cam, watch, m, dt) {
    const c = this.troop;
    // A mouse working the stick is not turning his head.
    if (this.hud.stickMouse) { m.x = 0; m.y = 0; }
    c.yaw = wrapAngle(c.yaw + m.x);
    c.pitch = clamp(c.pitch - m.y, -1.1, 1.0);
    c.kick = Math.max(0, (c.kick || 0) - dt * 0.25);
    const pitch = c.pitch + c.kick;
    const cp = Math.cos(pitch);
    const dir = new THREE.Vector3(Math.sin(c.yaw) * cp, Math.sin(pitch), Math.cos(c.yaw) * cp);
    const eye = new THREE.Vector3(watch.x, watch.y + watch.eye, watch.z);
    if (c.fp) {
      cam.position.copy(eye).addScaledVector(dir, 0.12);
    } else {
      // Over his right shoulder: back, up and out to the right of him.
      const right = new THREE.Vector3(-Math.cos(c.yaw), 0, Math.sin(c.yaw));
      cam.position.copy(eye).addScaledVector(dir, -2.6).addScaledVector(right, 0.55);
      cam.position.y += 0.25;
      const g = this.groundAt ? this.groundAt(cam.position.x, cam.position.z) : -1e9;
      if (cam.position.y < g + 0.4) cam.position.y = g + 0.4;
    }
    cam.up.set(0, 1, 0);
    const far = cam.position.clone().addScaledVector(dir, 1000);
    cam.lookAt(far);
    const fov = this.scoped ? 26 : 62;
    cam.fov = lerp(cam.fov || fov, fov, 1 - Math.pow(0.001, dt));
    // Where the crosshair is in the world, and the line from his rifle to it:
    // that is what he is aiming along.
    const hit = this.troopAimPoint(cam.position, dir);
    const mx = watch.x + Math.sin(c.yaw) * 0.5, my = watch.y + watch.eye - 0.08, mz = watch.z + Math.cos(c.yaw) * 0.5;
    c.aimYaw = Math.atan2(hit.x - mx, hit.z - mz);
    c.aimPitch = Math.atan2(hit.y - my, Math.hypot(hit.x - mx, hit.z - mz));
    this.driveTroop(c);
    const blood = document.getElementById('sol-blood');
    if (blood && Number(blood.style.opacity) > 0) blood.style.opacity = String(Math.max(0, Number(blood.style.opacity) - dt * 0.5));
  },

  /** The first thing along the line of sight: a man, the ground, or 600 m of nothing. */
  troopAimPoint(from, dir) {
    let best = 600;
    for (const p of this.troopsNow) {
      if (this.troop && p.i === this.troop.id) continue;
      const cx = p.x - from.x, cy = p.y + 1.1 - from.y, cz = p.z - from.z;
      const u = cx * dir.x + cy * dir.y + cz * dir.z;
      if (u < 1 || u > best) continue;
      const off = Math.hypot(cx - dir.x * u, cy - dir.y * u, cz - dir.z * u);
      if (off < 0.6) best = u;
    }
    const w = this.scene.world || this.world;
    if (w && this.groundAt) {
      for (let u = 2; u < best; u += Math.max(1, u * 0.02)) {
        const x = from.x + dir.x * u, y = from.y + dir.y * u, z = from.z + dir.z * u;
        if (y < this.groundAt(x, z)) { best = u; break; }
      }
    }
    return { x: from.x + dir.x * best, y: from.y + dir.y * best, z: from.z + dir.z * best };
  },

  /** The stick, the keys and where he is looking, to the battle service when they change. */
  driveTroop(c) {
    const st = this.hud.stick || { x: 0, y: 0 };
    const k = this.input;
    const key = (...codes) => (codes.some((x) => k.down(x)) ? 1 : 0);
    const mz = clamp(st.y + key('KeyW', 'ArrowUp') - key('KeyS', 'ArrowDown'), -1, 1);
    const mx = clamp(st.x + key('KeyD', 'ArrowRight') - key('KeyA', 'ArrowLeft'), -1, 1);
    // Strafing right is toward -X in his frame: his right is the world's -X
    // when he faces +Z.
    const sp = !!(key('ShiftLeft', 'ShiftRight') || c.spLock || Math.hypot(st.x, st.y) > 0.97);
    const q = (v) => Math.round(v * 20) / 20;
    const msg = { mx: -q(mx), mz: q(mz), sp, cr: !!c.cr, jp: c.jp };
    const now = performance.now();
    const yaw = Math.round(c.aimYaw * 100) / 100;
    const pitch = Math.round(c.aimPitch * 100) / 100;
    const was = c.sent;
    const same = was && was.mx === msg.mx && was.mz === msg.mz && was.sp === msg.sp && was.cr === msg.cr && was.jp === msg.jp;
    const turned = !was || Math.abs(angleDelta(was.yaw, yaw)) > 0.02 || Math.abs(was.pitch - pitch) > 0.02;
    if (same && !turned && now - c.sentAt < 1500) return;
    if (now - c.sentAt < 60 && same) return;
    c.sent = { ...msg, yaw, pitch };
    c.sentAt = now;
    this.net.send({ t: 'sdrive', i: c.id, ...msg, yaw, pitch });
  },

  /** What the man in hand is doing, off the snapshot, and whether he is still ours. */
  stepTroopCommand() {
    const c = this.troop;
    const p = this.troopRow(c.id);
    const late = performance.now() - c.since > 1500;
    if (!p || (late && p.pc !== this.shipId)) {
      this.leaveSoldier(true, !!p);
      return;
    }
    const read = document.getElementById('sol-read');
    if (read) {
      const txt = `${p.f & 16 ? 'Reloading' : `${p.clip}/${GARAND.clip}`} · ${p.clips} clips · ${p.hp}%`
        + `${p.f & 2 ? ' · sprinting' : p.f & 1 ? ' · crouched' : ''}`;
      if (read.textContent !== txt) read.textContent = txt;
    }
    const name = document.getElementById('sol-name');
    if (name) {
      const snap = this.snapshots[this.snapshots.length - 1];
      const o = snap && snap.sq && (snap.sq.sq || []).find((q) => q[0] === p.sq);
      const txt = `Rifleman, squad ${p.sq}${o ? ` · ${ORDER_NAME[ORDER_LIST[o[1]]] || ''}${o[4] ? ' (Opus)' : ''}` : ''}`;
      if (name.textContent !== txt) name.textContent = txt;
    }
  },

  /** The banner's name for a soldier being watched. */
  troopName(id) {
    const p = this.troopRow(id);
    if (!p) return 'Rifleman';
    return `${p.tm === this.team ? '' : 'Enemy '}Rifleman · squad ${p.sq}`;
  },
};

/** Put the infantry's methods onto the battle. */
export function installTroops(Battle) {
  for (const [k, fn] of Object.entries(Troops)) Battle.prototype[k] = fn;
}
