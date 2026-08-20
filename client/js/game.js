// The battle client: prediction for your own hull, interpolation for everyone
// else, camera rig, effects and the loop that ties them together.

import * as THREE from '../../vendor/three.module.js';
import { BattleScene } from './render/scene.js';
import { Hud } from './hud.js';
import { audio } from './audio.js';
import { getSettings } from './settings.js';
import { SHIP_CLASSES, getClass } from '../../shared/ships.js';
import {
  createState, addShip, applyInput, predictShip, MIN_NOTCH, MAX_NOTCH, solveBallistic,
} from '../../shared/sim.js';
import { clamp, lerp, wrapAngle, angleDelta, dist, MPS_TO_KNOTS } from '../../shared/math.js';

const INTERP_DELAY = 0.12;     // seconds behind the server, to smooth jitter
const INPUT_HZ = 20;

const CAMERAS = ['chase', 'bridge', 'tactical'];

export class Battle {
  constructor({ renderer, net, input, world, shipId, team, classId, roster, mode, onExit }) {
    this.renderer = renderer;
    this.net = net;
    this.input = input;
    this.world = world;
    this.shipId = shipId;
    this.team = team;
    this.classId = classId;
    this.cls = getClass(classId);
    // Which objective is being fought: the server decides, the client reports it.
    this.mode = mode || 'domination';
    this.onExit = onExit;
    this.roster = roster || [];
    this.names = new Map(this.roster.map((r) => [r.id, r.name]));

    this.scene = new BattleScene(renderer, world, getSettings().quality);
    this.hud = new Hud({ team, world, onLeave: () => this.leave() });
    this.hud.buildFor(classId);
    this.hud.onShellSelect((t) => { this.shellType = t; this.hud.setShellType(t); });

    // Local mirror of our own hull, stepped with the shared simulation.
    this.local = createState(world, {});
    this.localShip = addShip(this.local, { id: shipId, name: 'You', classId, team, index: 0 });
    this.localShip.notch = 1;

    this.entities = new Map();
    this.snapshots = [];
    this.snapTime = 0;
    this.serverTime = 0;
    this.shellTrails = new Map();

    this.camMode = 'chase';
    this.yaw = 0;
    this.pitch = 0.22;
    this.camDistance = this.cls.hull.length * 1.5;
    this.scoped = false;
    this.fov = 58;
    this.shake = 0;
    this.aimPoint = new THREE.Vector3();
    this.shellType = 'ap';
    this.hud.setShellType('ap');
    this.sunk = false;
    this.mapBig = false;
    this.showScores = false;
    this.lastInputSent = 0;
    this.result = null;

    this.raycaster = new THREE.Raycaster();
    this.seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.bindNet();
    this.bindInput();
    audio.startAmbience();
  }

  // ---------------------------------------------------------------- net ----

  bindNet() {
    this.off = [
      this.net.on('snap', (s) => this.onSnapshot(s)),
      this.net.on('ev', (m) => this.onEvents(m.ev)),
      this.net.on('roster', (m) => { this.roster = m.roster; m.roster.forEach((r) => this.names.set(r.id, r.name)); }),
      this.net.on('result', (m) => this.onResult(m)),
    ];
  }

  onSnapshot(snap) {
    this.snapshots.push({ ...snap, at: performance.now() / 1000 });
    while (this.snapshots.length > 12) this.snapshots.shift();
    this.serverTime = snap.time;

    const own = snap.ships.find((s) => s.i === this.shipId);
    if (own) {
      const ls = this.localShip;
      // Soft reconciliation: authority wins, but over a few frames.
      this.reconcile = { x: own.x, z: own.z, h: own.h, v: own.v };
      ls.hp = own.hp;
      ls.alive = !!own.a;
      ls.fires = own.f; ls.flooding = own.fl;
      if (own.cd) own.cd.forEach((cd, i) => { if (ls.turrets[i]) ls.turrets[i].cooldown = cd; });
      if (own.dis) own.dis.forEach((d, i) => { if (ls.turrets[i]) ls.turrets[i].disabled = d ? 1 : 0; });
      if (own.tp) own.tp.forEach((cd, i) => { if (ls.torpMounts[i]) ls.torpMounts[i].cooldown = cd; });
      own.maxHp = this.cls.hp;
      if (!own.a && !this.sunk) this.onOwnSunk();
      this.ownSnap = own;
    }
  }

  onOwnSunk() {
    this.sunk = true;
    this.hud.setSunk(true);
    this.hud.alert('Abandon ship');
    audio.explosion(2, 0);
    this.input.releaseLock();
    this.camMode = 'tactical';
  }

  onEvents(events) {
    const fx = this.scene.effects;
    for (const ev of events) {
      const d = this.distanceFade(ev.x, ev.z);
      switch (ev.e) {
        case 'muzzle':
          fx.muzzle(ev.x, 18, ev.z, ev.b, ev.cal);
          audio.gun(ev.cal, d);
          if (ev.ship === this.shipId && getSettings().shake) this.shake = Math.min(1, ev.cal / 320);
          break;
        case 'splash': fx.splash(ev.x, ev.z, ev.cal); if (d < 0.75) audio.splash(d); break;
        case 'landhit': fx.hit(ev.x, 12, ev.z, 'he', ev.cal); break;
        case 'hit': {
          fx.hit(ev.x, ev.y ?? 8, ev.z, ev.kind, ev.cal);
          if (ev.owner === this.shipId) {
            const label = { citadel: 'CITADEL', pen: 'PENETRATION', overpen: 'OVERPENETRATION', he: 'HIT', splash: 'SPLASH', shatter: 'SHATTER', ricochet: 'RICOCHET' }[ev.kind] || 'HIT';
            this.hud.ribbon(`${label}${ev.dmg ? `  ${ev.dmg}` : ''}`, ev.kind === 'citadel' ? 'cit' : (ev.kind === 'shatter' || ev.kind === 'ricochet') ? 'miss' : '');
            audio.hit(ev.kind);
          } else if (ev.victim === this.shipId) {
            this.shake = Math.max(this.shake, 0.5);
            audio.hit(ev.kind);
          }
          break;
        }
        case 'torpLaunch': if (ev.ship === this.shipId) audio.torpedo(); break;
        case 'torpHit':
          fx.explosion(ev.x, 4, ev.z, 1.6);
          audio.explosion(1.5, d);
          if (ev.owner === this.shipId) this.hud.ribbon('TORPEDO HIT', 'cit');
          if (ev.victim === this.shipId) this.hud.alert('Torpedo hit');
          break;
        case 'fire': if (ev.ship === this.shipId) this.hud.alert('Fire on deck'); break;
        case 'flood': if (ev.ship === this.shipId) { this.hud.alert('Flooding'); audio.alarm(); } break;
        case 'smoke': fx.smokeScreen(ev.x, ev.z); break;
        case 'repair': if (ev.ship === this.shipId) this.hud.ribbon('DAMAGE CONTROL'); break;
        case 'sink': {
          fx.explosion(ev.x, 6, ev.z, 3);
          const victim = this.names.get(ev.ship) || 'A ship';
          const killer = this.names.get(ev.by) || 'Someone';
          const vTeam = this.entities.get(ev.ship)?.team ?? 1;
          this.hud.kill(killer, ev.by === this.shipId ? this.team : 1 - this.team, victim, vTeam);
          if (ev.by === this.shipId) this.hud.ribbon('SHIP DESTROYED', 'cit');
          break;
        }
        case 'capture':
          this.hud.alert(ev.team === this.team ? `Point ${ev.cap} captured` : `Point ${ev.cap} lost`);
          break;
        case 'ram': fx.explosion(ev.x, 4, ev.z, 1.2); break;
        case 'planesLost': if (ev.team === this.team) this.hud.alert('Squadron lost'); break;
        default: break;
      }
    }
  }

  distanceFade(x, z) {
    const c = this.scene.camera.position;
    return clamp(dist(c.x, c.z, x, z) / 9000, 0, 1);
  }

  onResult(msg) {
    this.result = msg;
    this.hud.alert(msg.winner === this.team ? 'Victory' : msg.winner < 0 ? 'Draw' : 'Defeat');
    setTimeout(() => this.onExit(msg), 3200);
  }

  // -------------------------------------------------------------- input ----

  bindInput() {
    this.input.enabled = true;
    this.input.on('key', (code) => this.onKey(code));
    this.input.on('fire', () => this.fire());
    this.input.on('scope', (on) => { this.scoped = on; });
    this.input.on('wheel', (dir) => {
      this.camDistance = clamp(this.camDistance * (dir > 0 ? 1.15 : 0.87), this.cls.hull.length * 0.7, this.cls.hull.length * 6);
    });
  }

  onKey(code) {
    const ls = this.localShip;
    switch (code) {
      case 'KeyW': ls.notch = clamp(ls.notch + 1, MIN_NOTCH, MAX_NOTCH); audio.click(); break;
      case 'KeyS': ls.notch = clamp(ls.notch - 1, MIN_NOTCH, MAX_NOTCH); audio.click(); break;
      case 'KeyQ': ls.rudderCmd = 0; break;
      case 'Digit1': this.shellType = 'ap'; this.hud.setShellType('ap'); break;
      case 'Digit2': this.shellType = 'he'; this.hud.setShellType('he'); break;
      case 'Digit3': this.net.send({ t: 'torp' }); break;
      case 'Digit4': this.net.send({ t: 'strike' }); break;
      case 'KeyR': this.net.send({ t: 'repair' }); break;
      case 'KeyT': this.net.send({ t: 'smoke' }); break;
      case 'KeyC': {
        const i = CAMERAS.indexOf(this.camMode);
        this.camMode = CAMERAS[(i + 1) % CAMERAS.length];
        break;
      }
      case 'KeyM': this.mapBig = !this.mapBig; this.hud.toggleMap(this.mapBig); break;
      case 'Tab': this.showScores = !this.showScores; this.hud.showScoreboard(this.roster, this.shipId, this.showScores); break;
      case 'Escape': this.leave(); break;
      default: break;
    }
  }

  fire() {
    if (this.sunk) return;
    this.net.send({ t: 'fire' });
  }

  leave() {
    this.net.send({ t: 'leave' });
    this.onExit(this.result);
  }

  // --------------------------------------------------------------- loop ----

  update(dt) {
    const ls = this.localShip;
    const settings = getSettings();

    // Helm and telegraph.
    if (!this.sunk) {
      // The on-screen helm is a wheel: it sets an angle outright. The keyboard
      // has to wind toward one.
      if (this.input.axis.rudder !== null) {
        ls.rudderCmd = clamp(this.input.axis.rudder, -1, 1);
      } else {
        const turn = (this.input.down('KeyD') ? 1 : 0) - (this.input.down('KeyA') ? 1 : 0);
        if (turn !== 0) ls.rudderCmd = clamp(ls.rudderCmd + turn * dt * 1.8, -1, 1);
      }
    }

    // Look.
    const m = this.input.takeMouse();
    const zoom = this.scoped ? 0.35 : 1;
    this.yaw = wrapAngle(this.yaw + m.x * zoom);
    this.pitch = clamp(this.pitch + m.y * zoom, -0.35, 0.55);

    this.updateAimPoint();
    ls.aimX = this.aimPoint.x;
    ls.aimZ = this.aimPoint.z;
    ls.shellType = this.shellType;

    // Predict our own hull, then ease toward the server's version of it.
    predictShip(this.local, ls, dt);
    if (this.reconcile) {
      const k = 1 - Math.pow(0.001, dt);
      ls.x = lerp(ls.x, this.reconcile.x, k);
      ls.z = lerp(ls.z, this.reconcile.z, k);
      ls.heading = wrapAngle(ls.heading + angleDelta(ls.heading, this.reconcile.h) * k);
      ls.speed = lerp(ls.speed, this.reconcile.v, k);
    }

    const now = performance.now() / 1000;
    if (now - this.lastInputSent > 1 / INPUT_HZ) {
      this.lastInputSent = now;
      this.net.send({
        t: 'input', notch: ls.notch, rudder: ls.rudderCmd,
        aimX: Math.round(ls.aimX), aimZ: Math.round(ls.aimZ), shellType: this.shellType,
      });
    }
    if (this.input.firing) this.autoFire(dt);

    this.syncEntities(dt);
    this.updateCamera(dt);
    this.scene.update(dt);

    audio.setEngineLoad(clamp(Math.abs(ls.speed) / this.cls.maxSpeed, 0, 1));

    const ownForHud = this.ownSnap
      ? { ...this.ownSnap, v: ls.speed, h: ls.heading, notch: ls.notch, rud: ls.rudderCmd, maxHp: this.cls.hp }
      : null;
    const snap = this.snapshots[this.snapshots.length - 1];
    this.hud.update(ownForHud, snap);
    if (snap) this.hud.drawMinimap(ownForHud && { ...ownForHud, i: this.shipId, x: ls.x, z: ls.z }, this.visibleShips(), snap);
    if (this.showScores) this.hud.showScoreboard(this.roster, this.shipId, true);
  }

  autoFire(dt) {
    this.autoTimer = (this.autoTimer || 0) - dt;
    if (this.autoTimer <= 0) {
      this.autoTimer = 0.25;
      this.net.send({ t: 'fire' });
    }
  }

  /** Where the guns are laid: the sea point under the crosshair. */
  updateAimPoint() {
    const cam = this.scene.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const maxRange = this.cls.gun.range;
    const origin = cam.position;
    if (dir.y < -0.001) {
      const t = -origin.y / dir.y;
      const p = origin.clone().addScaledVector(dir, t);
      const d = dist(this.localShip.x, this.localShip.z, p.x, p.z);
      if (d <= maxRange) { this.aimPoint.copy(p); return; }
    }
    // Above the horizon or beyond the guns: aim at maximum range on this bearing.
    const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    this.aimPoint.set(
      this.localShip.x + flat.x * maxRange,
      0,
      this.localShip.z + flat.z * maxRange,
    );
  }

  visibleShips() {
    const snap = this.snapshots[this.snapshots.length - 1];
    return snap ? snap.ships : [];
  }

  /** Interpolate every remote entity and drive its view model. */
  syncEntities(dt) {
    const renderTime = (performance.now() / 1000) - INTERP_DELAY;
    let a = null, b = null;
    for (let i = this.snapshots.length - 1; i >= 0; i--) {
      if (this.snapshots[i].at <= renderTime) { a = this.snapshots[i]; b = this.snapshots[i + 1] || null; break; }
    }
    if (!a) a = this.snapshots[0];
    if (!a) return;
    const t = b ? clamp((renderTime - a.at) / Math.max(0.0001, b.at - a.at), 0, 1) : 0;

    const seen = new Set();
    for (const s of a.ships) {
      seen.add(s.i);
      const prev = b ? b.ships.find((x) => x.i === s.i) : null;
      const view = this.scene.getShipView(s.i, s.c, s.tm, s.i === this.shipId);
      const isSelf = s.i === this.shipId;
      const x = isSelf ? this.localShip.x : prev ? lerp(s.x, prev.x, t) : s.x;
      const z = isSelf ? this.localShip.z : prev ? lerp(s.z, prev.z, t) : s.z;
      const h = isSelf ? this.localShip.heading : prev ? s.h + angleDelta(s.h, prev.h) * t : s.h;

      const wave = this.scene.ocean.heightAt(x, z);
      view.group.position.set(x, wave * 0.5 - 1.0, z);
      view.group.rotation.y = h;
      const speed = isSelf ? this.localShip.speed : s.v;
      view.group.rotation.z = Math.sin(performance.now() * 0.0006 + s.i) * 0.012 - (isSelf ? this.localShip.rudder * 0.05 : 0);
      view.group.rotation.x = Math.sin(performance.now() * 0.0004 + s.i * 2) * 0.008;

      const turrets = isSelf ? this.localShip.turrets.map((tt) => tt.angle) : s.tu;
      if (turrets) turrets.forEach((ang, i) => { if (view.turrets[i]) view.turrets[i].rotation.y = ang; });

      const load = clamp(Math.abs(speed) / getClass(s.c).maxSpeed, 0, 1);
      view.wake.material.opacity = load * 0.85;
      view.group.visible = !!s.a;
      view.marker.visible = !isSelf && this.camMode === 'tactical';

      // Funnel smoke and burning damage.
      view.smokeTimer -= dt;
      if (view.smokeTimer <= 0 && s.a && getClass(s.c).type !== 'CV') {
        view.smokeTimer = 0.25 + Math.random() * 0.3;
        const l = getClass(s.c).hull.length;
        this.scene.effects.funnelSmoke(x + Math.sin(h) * l * 0.02, 26, z + Math.cos(h) * l * 0.02, load);
      }
      if (s.f > 0) {
        view.fireTimer -= dt;
        if (view.fireTimer <= 0) {
          view.fireTimer = 0.12;
          const l = getClass(s.c).hull.length;
          const off = (Math.random() - 0.5) * l * 0.7;
          this.scene.effects.fire(x + Math.sin(h) * off, 10, z + Math.cos(h) * off);
        }
      }
    }

    for (const [id] of this.scene.shipViews) {
      if (!seen.has(id)) this.scene.removeShipView(id);
    }

    // Shells, torpedoes and aircraft as instanced batches.
    const dummy = this.scene.dummy;
    let n = 0;
    for (const sh of a.shells) {
      if (n >= this.scene.tracers.count) break;
      const prev = b ? b.shells.find((x) => x.i === sh.i) : null;
      dummy.position.set(
        prev ? lerp(sh.x, prev.x, t) : sh.x,
        prev ? lerp(sh.y, prev.y, t) : sh.y,
        prev ? lerp(sh.z, prev.z, t) : sh.z,
      );
      dummy.scale.setScalar(0.6 + sh.c / 260);
      dummy.updateMatrix();
      this.scene.tracers.setMatrixAt(n++, dummy.matrix);
    }
    this.hideRest(this.scene.tracers, n);
    this.scene.tracers.count = this.scene.tracers.count; // keep allocation
    this.scene.tracers.instanceMatrix.needsUpdate = true;

    let m = 0;
    for (const tp of a.torps) {
      if (m >= this.scene.torpedoes.count) break;
      const prev = b ? b.torps.find((x) => x.i === tp.i) : null;
      dummy.position.set(prev ? lerp(tp.x, prev.x, t) : tp.x, 1.5, prev ? lerp(tp.z, prev.z, t) : tp.z);
      dummy.rotation.set(0, tp.h, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.scene.torpedoes.setMatrixAt(m++, dummy.matrix);
    }
    this.hideRest(this.scene.torpedoes, m);
    this.scene.torpedoes.instanceMatrix.needsUpdate = true;

    let p = 0;
    for (const pl of a.planes) {
      if (p >= this.scene.planeMesh.count) break;
      dummy.position.set(pl.x, 220, pl.z);
      dummy.rotation.set(0, pl.h, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.scene.planeMesh.setMatrixAt(p++, dummy.matrix);
    }
    this.hideRest(this.scene.planeMesh, p);
    this.scene.planeMesh.instanceMatrix.needsUpdate = true;
  }

  hideRest(mesh, from) {
    const dummy = this.scene.dummy;
    dummy.position.set(0, -10000, 0);
    dummy.scale.setScalar(0.001);
    dummy.updateMatrix();
    for (let i = from; i < mesh.count; i++) mesh.setMatrixAt(i, dummy.matrix);
  }

  updateCamera(dt) {
    const cam = this.scene.camera;
    const ls = this.localShip;
    const targetFov = this.scoped ? 16 : 58;
    this.fov = lerp(this.fov, targetFov, 1 - Math.pow(0.002, dt));
    cam.fov = this.fov;

    const wave = this.scene.ocean.heightAt(ls.x, ls.z);
    if (this.camMode === 'tactical') {
      const h = 2200;
      cam.position.set(ls.x - Math.sin(this.yaw) * 300, h, ls.z - Math.cos(this.yaw) * 300);
      cam.lookAt(ls.x, 0, ls.z);
    } else if (this.camMode === 'bridge') {
      const fwd = this.cls.hull.length * 0.16;
      const eye = 14 + this.cls.hull.superstructure * 12;
      cam.position.set(
        ls.x + Math.sin(ls.heading) * fwd,
        wave * 0.5 + eye,
        ls.z + Math.cos(ls.heading) * fwd,
      );
      const dir = new THREE.Vector3(
        Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch),
      );
      cam.lookAt(cam.position.clone().add(dir.multiplyScalar(1000)));
    } else {
      const d = this.scoped ? this.camDistance * 0.55 : this.camDistance;
      const height = d * 0.42 + 18;
      cam.position.set(
        ls.x - Math.sin(this.yaw) * d,
        wave * 0.5 + height,
        ls.z - Math.cos(this.yaw) * d,
      );
      const look = new THREE.Vector3(
        ls.x + Math.sin(this.yaw) * 400,
        wave * 0.5 + 10 - this.pitch * 700,
        ls.z + Math.cos(this.yaw) * 400,
      );
      cam.lookAt(look);
    }

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.8);
      const s = this.shake * 3.2;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
    }
    cam.updateProjectionMatrix();
  }

  render() { this.scene.render(); }

  resize(w, h) { this.scene.resize(w, h); }

  dispose() {
    this.off.forEach((f) => f());
    this.input.enabled = false;
    this.input.reset();
    this.input.releaseLock();
    audio.stopAmbience();
    this.hud.setSunk(false);
    this.hud.showScoreboard(null, 0, false);
  }
}
