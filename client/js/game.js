// The battle client: prediction for your own hull, interpolation for everyone
// else, camera rig, effects and the loop that ties them together.

import * as THREE from '../../vendor/three.module.js';
import { BattleScene } from './render/scene.js';
import { Hud } from './hud.js';
import { DamageBoard } from './render/damageboard.js';
import { audio } from './audio.js';
import { getSettings } from './settings.js';
import { SHIP_CLASSES, getClass } from '../../shared/ships.js';
import {
  createState, addShip, applyInput, predictShip, MIN_NOTCH, MAX_NOTCH, solveBallistic,
  steerToWaypoint, PENETRATING,
} from '../../shared/sim.js';
import {
  clamp, lerp, wrapAngle, angleDelta, dist, worldToLocal, MPS_TO_KNOTS,
} from '../../shared/math.js';
import { groundHeight } from '../../shared/world.js';

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
    this.hud.setSelected(shipId);
    // The damage board builds its own little renderer the first time the
    // wrench is pressed, and is fed her compartments every frame after.
    this.hud.onDamageBoard?.((canvas) => {
      this.board = new DamageBoard(canvas, classId);
      for (const h of this.holes) this.board.hole(h[0], h[1], h[2]);
    });
    // Where she has been holed, in her own frame, kept so the board can show
    // the same holes after it has been put away and raised again.
    this.holes = [];
    // The three conn keys, and what each of their panels does.
    this.hud.onConn?.((k, v) => {
      if (k === 'notch') this.setNotch(v);
      else if (k === 'air') this.net.send({ t: 'strike' });
      else if (k === 'plane') this.togglePilotView();
      else if (k === 'repair') this.net.send({ t: 'repair' });
      else if (k === 'smoke') this.net.send({ t: 'smoke' });
      audio.click();
    });

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
    // What the camera is looking at, when it is not looking at your own hull:
    // {kind:'ship'|'battery', id, name}, set by tapping a contact on the plot.
    // You still have the con while you are watching — the helm and the
    // telegraph answer, the guns hold whatever bearing they were left on.
    this.watching = null;
    // Which of our own the plot is conning. Your own hull until you say
    // otherwise, so the first course you lay off goes to her.
    this.selected = shipId;
    // An aeroplane on the approach, coming back aboard after her sortie.
    this.landing = null;
    this.watchYaw = 0;
    this.watchPitch = 0.06;
    // Aboard her, or standing off her. A captain who taps a contact wants to
    // see what she can see; a captain watching a strike go in wants to see the
    // ship it is going into. C swaps between the two.
    this.watchPov = true;
    // The spectator's own glass and his own legs: how far out the orbit stands
    // and how high above her it is, and what field of view he is looking
    // through when he is aboard. All three are worked by the wheel or a pinch.
    this.watchDist = 3.2;      // multiples of her length
    this.watchEl = 0.30;       // orbit elevation, radians above the horizontal
    this.watchFov = 52;
    // What the camera is actually on this frame, chasing the numbers above, so
    // a notch of the wheel is a glass being wound rather than a cut.
    this.watchFovNow = 52;
    this.watchDistNow = 3.2;
    this.yaw = 0;
    this.pitch = 0.22;
    this.camDistance = this.cls.hull.length * 1.5;
    this.scoped = false;
    this.fov = 58;
    this.shake = 0;
    this.aimPoint = new THREE.Vector3();
    this.sunk = false;
    this.mapBig = false;
    this.showScores = false;
    this.lastInputSent = 0;
    this.result = null;

    // Tapping a hull or a gun on the plot puts the camera on it; tapping it
    // again, or tapping open water, brings the view back to your own bridge.
    this.hud.onPick = (hit, at) => this.workPlot(hit, at);
    this.hud.onToggleMap = () => this.toggleMap();
    document.getElementById('watch-back')?.addEventListener('click', () => this.lookAt(null));
    document.getElementById('watch-swap')?.addEventListener('click', () => {
      if (!this.watching) return;
      this.watchPov = !this.watchPov;
      this.hud.setWatchBanner(this.watching, this.watchPov);
      audio.click();
    });

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
          // A coast gun's muzzle is where its own ground is, which for a
          // battery on a headland is a long way above a ship's.
          fx.muzzle(ev.x, ev.y ?? 18, ev.z, ev.b, ev.cal);
          audio.gun(ev.cal, d);
          if (ev.ship === this.shipId && getSettings().shake) this.shake = Math.min(1, ev.cal / 320);
          break;
        case 'splash': fx.splash(ev.x, ev.z, ev.cal); if (d < 0.75) audio.splash(d); break;
        case 'landhit': fx.hit(ev.x, 12, ev.z, 'he', ev.cal); break;
        case 'batterySilenced':
          fx.explosion(ev.x, (ev.y || 0) + 6, ev.z, 1.6);
          if (d < 1) audio.explosion(1.6, d);
          break;
        case 'hit': {
          fx.hit(ev.x, ev.y ?? 8, ev.z, ev.kind, ev.cal);
          if (ev.owner === this.shipId) {
            const label = { citadel: 'CITADEL', pen: 'PENETRATION', overpen: 'OVERPENETRATION', he: 'HIT', splash: 'SPLASH', shatter: 'SHATTER', ricochet: 'RICOCHET' }[ev.kind] || 'HIT';
            this.hud.ribbon(`${label}${ev.dmg ? `  ${ev.dmg}` : ''}`, ev.kind === 'citadel' ? 'cit' : (ev.kind === 'shatter' || ev.kind === 'ricochet') ? 'miss' : '');
            audio.hit(ev.kind);
          } else if (ev.victim === this.shipId) {
            this.shake = Math.max(this.shake, 0.5);
            audio.hit(ev.kind);
            // A hole in our own hull goes on the damage board, at the place on
            // her the shell actually went in.
            if (PENETRATING.has(ev.kind)) this.markHole(ev.x, ev.y, ev.z);
          }
          break;
        }
        case 'torpLaunch': if (ev.ship === this.shipId) audio.torpedo(); break;
        case 'torpHit':
          fx.explosion(ev.x, 4, ev.z, 1.6);
          // A torpedo goes off under the water, so what is seen from a bridge
          // is not the fireball but the column it throws up alongside -- taller
          // than anything a gun makes, which is why one hit ends an argument.
          fx.splash(ev.x, ev.z, 620);
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
        case 'airDrop': {
          // The fish going into the sea: a short row of splashes across the
          // squadron's line, small ones, because a torpedo enters nose first.
          for (let i = 0; i < 3; i++) {
            fx.splash(ev.x + (i - 1) * 26 + (Math.random() - 0.5) * 14,
              ev.z + (Math.random() - 0.5) * 26, 150);
          }
          if (d < 0.8) audio.splash(d);
          break;
        }
        case 'launch': {
          // Run the whole evolution on the ship that launched: down the lift,
          // up again, aft to the spot and off over the bow. It is her own
          // animation -- the carrier knows how, and this only tells her when.
          const v = this.scene.shipViews.get(ev.ship);
          v?.group.userData.launch?.(this.time);
          break;
        }
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
    this.input.on('scope', (on) => { this.scoped = on; });
    this.input.on('wheel', (dir) => {
      // While the camera is off watching somebody else the wheel works that
      // camera, not this one: standing further off her when you are outside,
      // and putting a glass to your eye when you are aboard.
      if (this.watching) {
        if (this.watchPov) this.watchFov = clamp(this.watchFov * (dir > 0 ? 1.12 : 0.89), 7, 68);
        else this.watchDist = clamp(this.watchDist * (dir > 0 ? 1.18 : 0.85), 0.5, 26);
        return;
      }
      this.camDistance = clamp(this.camDistance * (dir > 0 ? 1.15 : 0.87), this.cls.hull.length * 0.7, this.cls.hull.length * 6);
    });
  }

  onKey(code) {
    const ls = this.localShip;
    switch (code) {
      case 'KeyW': this.setNotch(ls.notch + 1); audio.click(); break;
      case 'KeyS': this.setNotch(ls.notch - 1); audio.click(); break;
      // Her guns and her torpedoes are fought by her own officers. What is
      // left to her captain is where she goes, when her aircraft go, and
      // getting her fires out.
      case 'KeyQ': this.setCourse(null); break;
      case 'Digit4': this.net.send({ t: 'strike' }); break;
      case 'KeyP': this.togglePilotView(); break;
      case 'KeyR': this.net.send({ t: 'repair' }); break;
      case 'KeyT': this.net.send({ t: 'smoke' }); break;
      case 'KeyC': {
        if (this.watching) {
          this.watchPov = !this.watchPov;
          this.hud.setWatchBanner(this.watching, this.watchPov);
          audio.click();
          break;
        }
        const i = CAMERAS.indexOf(this.camMode);
        this.camMode = CAMERAS[(i + 1) % CAMERAS.length];
        break;
      }
      // The plot is a control as well as a picture, and a pointer locked to the
      // sea has no cursor to put on it. Opening the plot gives the mouse back;
      // the next click on the water takes it again.
      case 'KeyM': this.toggleMap(); break;
      case 'Tab': this.showScores = !this.showScores; this.hud.showScoreboard(this.roster, this.shipId, this.showScores); break;
      // Out of somebody else's view first, out of the battle second.
      case 'Escape':
        if (this.watching) this.lookAt(null); else this.leave();
        break;
      default: break;
    }
  }

  /**
   * Put the camera on a contact from the plot, or bring it home.
   *
   * Tapping what is already being watched is how you get back, which means the
   * same tap both goes and returns and there is nothing else to learn.
   */
  /**
   * Put the chart table up, or take it down.
   *
   * The plot is a control as well as a picture, and a pointer locked to the sea
   * has no cursor to put on it; raising the table gives the mouse back and the
   * next click on the water takes it again.
   */
  toggleMap(want = !this.mapBig) {
    this.mapBig = want;
    this.hud.toggleMap(this.mapBig);
    if (this.mapBig) this.input.releaseLock();
    audio.click();
  }

  /**
   * A tap on the plot.
   *
   * The plot is the command table: your own side is conned from it, and
   * everything else on it is something to look at. So a friendly hull is taken
   * under orders, open water is where the ship under orders is sent, and an
   * enemy or a gun ashore puts the camera on it as it always did.
   */
  workPlot(hit, at) {
    if (hit && hit.kind === 'ship' && hit.team === this.team) {
      this.selected = this.selected === hit.id ? null : hit.id;
      this.hud.setSelected(this.selected);
      audio.click();
      return;
    }
    if (!hit && at) {
      const id = this.selected ?? this.shipId;
      this.setCourse(at, id);
      return;
    }
    this.lookAt(hit);
  }

  /**
   * Lay a course off for a ship: hers to steer, and the plot draws the leg.
   *
   * Her own hull is steered here as well so the prediction agrees with the
   * server; the rest of the division are somebody else's hulls and the order
   * goes up the wire alone.
   */
  setCourse(at, id = this.selected ?? this.shipId) {
    if (!at) {
      this.wayX = null; this.wayZ = null;
      if (id === this.shipId) this.net.send({ t: 'goto', x: null, z: null });
      return;
    }
    if (id === this.shipId) { this.wayX = at.x; this.wayZ = at.z; }
    this.net.send({ t: 'goto', ship: id, x: Math.round(at.x), z: Math.round(at.z) });
    audio.click();
  }

  lookAt(hit) {
    const same = hit && this.watching
      && this.watching.kind === hit.kind && this.watching.id === hit.id;
    if (!hit || same || (hit.kind === 'ship' && hit.id === this.shipId)) {
      this.watching = null;
    } else {
      this.watching = hit;
      // Start looking the way she is going, if we know which way that is: a
      // captain stepping onto somebody's bridge is facing over her bow, not
      // over her quarter. Failing that, keep the bearing the camera is on.
      const facing = this.headingOf(hit);
      this.watchYaw = facing === null ? this.yaw : facing;
      this.watchPitch = 0.06;
      this.watchEl = 0.30;
      this.watchDist = 3.2;
      this.watchDistNow = 3.2;
      this.watchFov = 52;
      this.watchFovNow = 52;
    }
    this.hud.setWatching(this.watching);
    this.hud.setWatchBanner(this.watching, this.watchPov);
    // The table has done its job the moment a contact is picked off it: what
    // the captain wanted was the view, and the view is behind the table.
    if (this.mapBig && this.watching) this.toggleMap(false);
    audio.click();
  }

  /** Which way the thing being watched is pointed, or null if we cannot tell. */
  headingOf(hit) {
    const snap = this.snapshots[this.snapshots.length - 1];
    if (!snap || !hit) return null;
    const from = hit.kind === 'battery' ? snap.batteries
      : hit.kind === 'plane' ? snap.planes
        : [...snap.ships, ...(snap.contacts || [])];
    const e = (from || []).find((x) => x.i === hit.id);
    if (!e) return null;
    // A battery is laid on a bearing and then trained off it.
    return hit.kind === 'battery' ? wrapAngle(e.h + e.a) : e.h;
  }

  /** Where whatever the camera is watching is now, or null if it has gone. */
  watchPoint() {
    if (!this.watching) return null;
    const snap = this.snapshots[this.snapshots.length - 1];
    if (!snap) return null;
    // `eye` is where somebody standing watch on the thing would have his head:
    // above the gun pit on a battery, in the cockpit of an aircraft, up on the
    // bridge of a ship. It is what the point-of-view camera sits at.
    if (this.watching.kind === 'battery') {
      const b = (snap.batteries || []).find((x) => x.i === this.watching.id);
      return b ? { x: b.x, y: b.y, z: b.z, span: 60, eye: 12 } : null;
    }
    if (this.watching.kind === 'plane') {
      // Riding one of your own. She is the carrier's own model for the whole
      // of it -- waiting in the hangar, riding the lift, down the deck, out to
      // the target and back down the glide -- so the camera asks the model
      // where it is and never anything else. Two sources for one aeroplane is
      // what made this jump: the model was interpolated and the camera was
      // reading raw snapshots, so they disagreed ten times a second.
      if (this.watching.carrier != null) {
        const v = this.scene.shipViews.get(this.watching.carrier);
        const g = v && v.group.userData.deckPlane;
        if (g) {
          const w = new THREE.Vector3();
          g.getWorldPosition(w);
          return { x: w.x, y: w.y, z: w.z, span: 14, eye: 2.4, close: true };
        }
        return null;
      }
      // Somebody else's squadron, watched off the plot: there is no model for
      // that one, so it is flown off the interpolated plot position.
      const pl = (this.planesNow || []).find((x) => x.i === this.watching.id);
      if (pl) {
        return { x: pl.x, y: this.planeHeight(pl), z: pl.z, span: 14, eye: 2.2, close: true };
      }
      return null;
    }
    // Sighted or only reported: the camera goes to either, because the plot
    // shows either and a mark you can tap has to be a mark you can watch.
    const s = snap.ships.find((x) => x.i === this.watching.id)
      || (snap.contacts || []).find((x) => x.i === this.watching.id);
    if (!s) return null;
    const cls = getClass(s.c);
    return {
      x: s.x, y: this.scene.ocean.heightAt(s.x, s.z) * 0.5, z: s.z,
      span: cls.hull.length,
      eye: 14 + cls.hull.superstructure * 12,
    };
  }

  /**
   * Ride with the aeroplane.
   *
   * Puts the camera on the ready aircraft where she stands -- on the after lift,
   * in the hangar if the lift is down -- and keeps it on her through the whole
   * launch and out to the target. Press it again to come back to your ship.
   */
  togglePilotView() {
    if (this.watching && this.watching.kind === 'plane' && this.watching.carrier != null) {
      this.watching = null;
      this.hud.setWatching(null);
      this.hud.setWatchBanner(null);
      return;
    }
    const v = this.scene.shipViews.get(this.shipId);
    if (!v || !v.group.userData.deckPlane) {
      this.hud.alert('No aircraft to ride');
      return;
    }
    this.watching = { kind: 'plane', carrier: this.shipId, id: null,
      name: 'the ready aircraft — drag to look round her' };
    this.watchPov = false;
    this.watchYaw = 2.5;              // over her port quarter, looking forward
    this.watchEl = 0.24;              // a little above her, not edge-on
    // Multiples of her length. Ten metres put the camera inside the wing: an
    // aeroplane needs standing off far enough that she reads as an aeroplane.
    this.watchDist = 1.55;
    this.watchDistNow = 1.55;
    this.hud.setWatching?.(this.watching);
    this.hud.setWatchBanner?.(this.watching, false);
  }

  /**
   * Ring up a speed.
   *
   * The telegraph is the one thing about her own movement a captain still works
   * directly, so it is set here and sent, rather than being wound toward.
   */
  setNotch(n) {
    const want = clamp(Math.round(n), MIN_NOTCH, MAX_NOTCH);
    if (this.localShip.notch === want) return;
    this.localShip.notch = want;
    this.net.send({ t: 'input', notch: want });
  }

  leave() {
    this.net.send({ t: 'leave' });
    this.onExit(this.result);
  }

  // --------------------------------------------------------------- loop ----

  update(dt) {
    const ls = this.localShip;
    const settings = getSettings();
    // A clock for whatever on a ship moves of its own accord: the carrier's
    // lifts and her launch cycle run off this. It is wall time, not a sum of
    // frame steps -- a launch takes twelve seconds because that is how long it
    // takes, and accumulating dt made it take twelve seconds of frames, which
    // on a slow machine is a minute and a half.
    this.time = performance.now() / 1000;

    // The helm answers the chart, not a wheel. Steered here as well as on the
    // server, and by the same shared code, so the hull the player is watching
    // is going where the authority is taking her instead of arguing with it
    // every tick.
    if (!this.sunk) {
      ls.wayX = this.wayX ?? null;
      ls.wayZ = this.wayZ ?? null;
      if (!steerToWaypoint(this.local, ls)) ls.rudderCmd = 0;
      if (ls.wayX === null) { this.wayX = null; this.wayZ = null; }
    }

    // Look. While the camera is off watching somebody else the drag walks that
    // orbit instead, and the guns hold the bearing they were left laid on —
    // swinging the whole main battery every time a captain glances at another
    // ship is not what glancing at another ship should do.
    if (!this.watching) {
      const m = this.input.takeMouse();
      const zoom = this.scoped ? 0.35 : 1;
      this.yaw = wrapAngle(this.yaw + m.x * zoom);
      this.pitch = clamp(this.pitch + m.y * zoom, -0.35, 0.55);
      this.updateAimPoint();
    }

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
      // Only the telegraph goes up the wire now. Her helm follows the course
      // her captain laid off, and her guns are her own gunnery officer's.
      this.net.send({ t: 'input', notch: ls.notch });
    }

    this.syncEntities(dt);
    this.updateCamera(dt);
    this.scene.update(dt);

    audio.setEngineLoad(clamp(Math.abs(ls.speed) / this.cls.maxSpeed, 0, 1));

    const ownForHud = this.ownSnap
      ? { ...this.ownSnap, v: ls.speed, h: ls.heading, notch: ls.notch, rud: ls.rudderCmd, maxHp: this.cls.hp }
      : null;
    const snap = this.snapshots[this.snapshots.length - 1];
    this.hud.update(ownForHud, snap);
    // The board only turns while it is being looked at.
    if (this.board && this.hud.panel === 'dmg') this.board.update(ownForHud?.sec, dt);
    if (snap) this.hud.drawMinimap(ownForHud && { ...ownForHud, i: this.shipId, x: ls.x, z: ls.z }, this.visibleShips(), snap);
    if (this.showScores) this.hud.showScoreboard(this.roster, this.shipId, true);
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

    if (this.selected !== this.shipId
      && !a.ships.some((s) => s.i === this.selected && s.a)) {
      this.selected = this.shipId;
      this.hud.setSelected(this.selected);
    }
    const seen = new Set();
    for (const s of a.ships) {
      seen.add(s.i);
      const prev = b ? b.ships.find((x) => x.i === s.i) : null;
      const view = this.scene.getShipView(s.i, s.c, s.tm, s.i === this.shipId);
      const isSelf = s.i === this.shipId;
      const x = isSelf ? this.localShip.x : prev ? lerp(s.x, prev.x, t) : s.x;
      const z = isSelf ? this.localShip.z : prev ? lerp(s.z, prev.z, t) : s.z;
      const h = isSelf ? this.localShip.heading : prev ? s.h + angleDelta(s.h, prev.h) * t : s.h;

      // She takes the attitude the water under her puts on: the sea is sampled
      // at her bow, her stern and both beams, so a hull two hundred metres long
      // rides the swell rather than following every wave in it.
      const cls = getClass(s.c);
      const att = this.scene.ocean.attitude(x, z, h, cls.hull.length, cls.hull.beam);
      const speed = isSelf ? this.localShip.speed : s.v;
      view.group.position.set(x, 0, z);       // her height is the seakeeping's
      view.group.rotation.set(0, 0, 0);
      view.group.rotation.order = 'YXZ';
      view.group.rotation.y = h;
      // Neither her pitch nor her roll is the angle of the water: both are her
      // own, swung on her own periods against what the sea and her rudder are
      // doing to her. How much she moves is a matter of how big she is.
      const sea = view.sea.step(att, dt, isSelf ? -this.localShip.rudder * 0.05 : 0);
      view.group.position.y = sea.heave - 1.0;
      view.group.rotation.x = sea.pitch;
      view.group.rotation.z = sea.roll;

      // Every ship's guns are laid by her own gunnery officer now, ours
      // included, so the bearings all come off the wire.
      const turrets = s.tu;
      if (turrets) turrets.forEach((ang, i) => { if (view.turrets[i]) view.turrets[i].rotation.y = ang; });

      // Anything on her that works itself -- a carrier's lifts, so far.
      view.group.userData.step?.(this.time);

      view.wake.update(dt, x, z, h, speed, this.scene.ocean);
      const load = clamp(Math.abs(speed) / cls.maxSpeed, 0, 1);
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

    // The guns ashore. They do not move, so there is nothing to interpolate
    // but the training -- which is the only thing about them that changes.
    const gunsSeen = new Set();
    for (const g of a.batteries || []) {
      gunsSeen.add(g.i);
      const view = this.scene.getBatteryView(g.i, g.b, g.tm, { x: g.x, y: g.y, z: g.z });
      const prev = b ? (b.batteries || []).find((x) => x.i === g.i) : null;
      const ang = prev ? g.a + angleDelta(g.a, prev.a) * t : g.a;
      view.group.position.set(g.x, g.y, g.z);
      // The emplacement stands still; the mounting inside it trains. A model
      // with two mountings -- Townsley has a gun at each end -- turns both.
      if (g.al) for (const m of view.spin) m.rotation.y = g.h + ang;
      view.marker.visible = this.camMode === 'tactical';
      // Silenced, and burning where it stands.
      if (!g.al) {
        view.smokeTimer -= dt;
        if (view.smokeTimer <= 0) {
          view.smokeTimer = 0.4 + Math.random() * 0.5;
          const off = (Math.random() - 0.5) * view.span * 0.6;
          this.scene.effects.fire(g.x + off, g.y + 4, g.z + (Math.random() - 0.5) * view.span * 0.6);
        }
      }
    }
    for (const [id] of this.scene.batteryViews) {
      if (!gunsSeen.has(id)) this.scene.removeBatteryView(id);
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

    // Squadrons are interpolated between snapshots like everything else. They
    // used not to be, and the aeroplane the camera rides was the one thing on
    // screen stepping ten times a second instead of running: that is what made
    // riding her look broken.
    const planes = (a.planes || []).map((pl) => {
      const nx = b ? (b.planes || []).find((q) => q.i === pl.i) : null;
      if (!nx) return pl;
      return {
        ...pl,
        x: lerp(pl.x, nx.x, t),
        z: lerp(pl.z, nx.z, t),
        h: pl.h + angleDelta(pl.h, nx.h) * t,
        a: lerp(pl.a, nx.a, t),
      };
    });
    this.planesNow = planes;

    let p = 0;
    for (const pl of planes) {
      if (p >= this.scene.planeMesh.count) break;
      // The one aeroplane a carrier put in the air is drawn as an aeroplane,
      // not as a marker: it is the model that came up the lift and went down
      // the deck, so it is left off the instanced flight here.
      if (this.flying && this.flying.id === pl.i) continue;
      dummy.position.set(pl.x, this.planeHeight(pl), pl.z);
      dummy.rotation.set(0, pl.h, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.scene.planeMesh.setMatrixAt(p++, dummy.matrix);
    }
    this.hideRest(this.scene.planeMesh, p);
    this.scene.planeMesh.instanceMatrix.needsUpdate = true;
    this.flyLaunched(planes);
  }

  /**
   * How high a squadron is: off the deck at first, then climbing to cruise.
   *
   * She starts at the height she leaves the round-down at, so the aeroplane the
   * player has just watched go down the deck carries straight on climbing when
   * the scene takes her over instead of dropping through twenty metres of air.
   */
  planeHeight(pl) {
    const CRUISE = 220;
    const OFF_DECK = 42;
    const k = Math.min(1, Math.max(0, ((pl.a ?? 99) - 6) / 30));
    return OFF_DECK + (CRUISE - OFF_DECK) * (k * k * (3 - 2 * k));
  }

  /**
   * Fly the aeroplane that left the deck.
   *
   * She is the carrier's own model, so once she is off the bow she is taken
   * out of the ship's group and put in the world, and from then on she is
   * flown on her squadron's position -- out to the target and back -- rather
   * than being deleted the moment she runs out of deck. When the squadron is
   * recovered or shot down she goes back aboard and waits on the after lift.
   */
  flyLaunched(planes) {
    // Which of the carriers on the plot has just put her ready aircraft up, and
    // which squadron on the plot is the one she flew off.
    let up = null;
    for (const [id, v] of this.scene.shipViews) {
      const deck = v.group.userData.deck;
      if (!deck || !deck.airborne) continue;
      const pl = planes.find((q) => q.o === id);
      if (pl) { up = { id, v, deck, pl }; break; }
      // Off the deck, but her squadron is no longer on the plot: recovered, or
      // shot down. Stand her back on the lift rather than leaving the model
      // hanging in the air off the bow.
      if (!this.flying || this.flying.ownerView !== v) v.group.userData.recover?.();
    }

    if (!up) {
      // Her squadron is home. She is not: she is three hundred metres astern of
      // the ship, where the simulation released her, and snapping her onto the
      // lift from there is the thing that reads as an aeroplane vanishing. So
      // she flies the approach instead -- round onto the centreline, down the
      // glide, over the round-down and onto the deck.
      if (this.flying) {
        this.landing = {
          t0: this.time, view: this.flying.ownerView, group: this.flying.group,
          from: this.flying.group.position.clone(),
          fromY: this.flying.group.rotation.y,
        };
        this.flying = null;
      }
      this.flyApproach();
      return;
    }
    // Coming aboard and ordered up again: the deck is hers, so she goes.
    this.landing = null;

    const { v, deck, pl } = up;
    if (!this.flying || this.flying.id !== pl.i) {
      // Hand her over: the same object, kept where she is in the world. She is
      // off the bow and her squadron is wherever the simulation has flown it
      // to, which is not the same place -- so she joins it rather than being
      // put there. That jump is what the camera riding her used to take.
      this.scene.scene.attach(v.group.userData.deckPlane);
      this.flying = {
        id: pl.i, ownerView: v, group: v.group.userData.deckPlane,
        heading: pl.h, bank: 0, joined: this.time,
        from: v.group.userData.deckPlane.position.clone(),
        // How long the join takes is how far there is to go: an aeroplane that
        // covered three hundred metres in the same second and a half she takes
        // to cover fifty would be doing four hundred knots to do it.
        join: clamp(dist(v.group.userData.deckPlane.position.x,
          v.group.userData.deckPlane.position.z, pl.x, pl.z) / 105, 1.2, 4.5),
      };
    }
    const g = this.flying.group;
    const y = this.planeHeight(pl);
    // Nose up while she is climbing, and bank into the turn: both come out of
    // where she was last frame, so they have to be read before she is moved.
    const rise = y - g.position.y;
    let turn = pl.h - this.flying.heading;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    this.flying.heading = pl.h;
    this.flying.bank += (Math.max(-0.5, Math.min(0.5, turn * 6)) - this.flying.bank) * 0.12;
    // Joining up: eased out to her squadron over a climbing turn's worth of
    // flying, taken at a speed an aeroplane could actually make good.
    const j = Math.min(1, (this.time - this.flying.joined) / this.flying.join);
    if (j < 1) {
      const e = j * j * (3 - 2 * j);
      g.position.set(
        lerp(this.flying.from.x, pl.x, e),
        lerp(this.flying.from.y, y, e),
        lerp(this.flying.from.z, pl.z, e),
      );
    } else {
      g.position.set(pl.x, y, pl.z);
    }
    g.rotation.set(Math.max(-0.26, Math.min(0.10, -rise * 0.05)), pl.h, this.flying.bank);
    g.visible = true;
    const prop = deck.plane && deck.plane.prop;
    if (prop) prop.rotation.z += 1.6;
  }

  /**
   * Remember a hole, in her own frame rather than the world's.
   *
   * The event says where the shell struck in the world; she has moved and
   * turned since, so it is put into her own coordinates at the moment it
   * happens and stays there.
   */
  markHole(wx, wy, wz) {
    const ls = this.localShip;
    const l = worldToLocal(wx - ls.x, wz - ls.z, ls.heading);
    const h = [l.x, (wy ?? 8) - 6, l.z];
    this.holes.push(h);
    if (this.holes.length > 90) this.holes.shift();
    this.board?.hole(h[0], h[1], h[2]);
  }

  /**
   * The approach: she comes up the wake, over the round-down and onto the deck.
   *
   * Flown in the world, because that is where she is -- the carrier is moving
   * under her, so the point she is aiming at moves too and is worked out fresh
   * every frame from where the ship is now.
   */
  flyApproach() {
    const L = this.landing;
    if (!L) return;
    const APPROACH = 7.5;
    const k = Math.min(1, (this.time - L.t0) / APPROACH);
    const v = L.view;
    const g = L.group;
    if (!v.group.parent) { this.landing = null; return; }
    // Where she is going: the after end of the flight deck, in world terms.
    const deck = v.group.userData.flightDeckY ?? 17;
    const spot = new THREE.Vector3(0, deck + 0.4, -(v.cls.hull.length * 0.42));
    v.group.updateMatrixWorld(true);
    spot.applyMatrix4(v.group.matrixWorld);
    // Eased in, and dropping onto the deck late rather than sinking the whole
    // way down: she flies level up the wake and then settles.
    const e = k * k * (3 - 2 * k);
    g.position.lerpVectors(L.from, spot, e);
    g.position.y = L.from.y + (spot.y - L.from.y) * (e * e);
    const want = v.group.rotation.y;
    let d = want - L.fromY;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    g.rotation.set(0.06 * (1 - e), L.fromY + d * e, 0);
    g.visible = true;
    const prop = v.group.userData.deck?.plane?.prop;
    if (prop) prop.rotation.z += 1.1 * (1 - e * 0.7);
    if (k < 1) return;
    // Down, and struck below: the model goes back into the ship's own group and
    // stands on the after lift where she started.
    v.group.attach(g);
    v.group.userData.recover?.();
    this.landing = null;
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

    // Watching something else. Either you are on her bridge looking out of her
    // windows, or you are standing off her watching her work; the drag turns
    // your head in the first and walks the orbit in the second.
    const watch = this.watchPoint();
    // Tell the pointer to stay free while the camera is off watching: a drag
    // turns the view and every control on the screen stays clickable.
    this.input.orbiting = !!watch;
    if (watch) {
      const m = this.input.takeMouse();
      const ease = 1 - Math.pow(0.0009, dt);
      this.watchFovNow = lerp(this.watchFovNow, this.watchFov, ease);
      this.watchDistNow = lerp(this.watchDistNow, this.watchDist, ease);
      this.watchYaw = wrapAngle(this.watchYaw + m.x);
      this.watchPitch = clamp(this.watchPitch + m.y, -0.42, 0.55);
      if (this.watchPov) {
        // Where a lookout on her would actually be standing, and a little
        // forward of her middle so her own upperworks are not in the way.
        const eye = watch.y + watch.eye;
        cam.position.set(
          watch.x + Math.sin(this.watchYaw) * watch.span * 0.06,
          eye,
          watch.z + Math.cos(this.watchYaw) * watch.span * 0.06,
        );
        const dir = new THREE.Vector3(
          Math.sin(this.watchYaw) * Math.cos(this.watchPitch),
          -Math.sin(this.watchPitch),
          Math.cos(this.watchYaw) * Math.cos(this.watchPitch),
        );
        cam.lookAt(cam.position.clone().add(dir.multiplyScalar(2000)));
        cam.fov = this.watchFovNow;
      } else {
        // The drag walks the orbit round her and up and down it; the wheel
        // stands it off her or brings it in. Close enough to read the damage
        // on her plating, far enough to see the whole action she is in.
        this.watchEl = clamp(this.watchEl - m.y, -0.16, 1.28);
        const near = !!watch.close;
        const d = Math.max(near ? 7 : 40, watch.span * this.watchDistNow);
        const rise = near ? watch.span * 0.05 + 1.2 : watch.span * 0.25 + 6;
        const aim = watch.y + watch.span * (near ? 0.03 : 0.2);
        const flat = Math.cos(this.watchEl);
        cam.position.set(
          watch.x - Math.sin(this.watchYaw) * d * flat,
          watch.y + rise + d * Math.sin(this.watchEl),
          watch.z - Math.cos(this.watchYaw) * d * flat,
        );
        cam.lookAt(watch.x, aim, watch.z);
        cam.fov = 52;
        // Above the hill she stands on, and still looking at her. Walking the
        // orbit round a gun on a headland used to bury the camera in the slope.
        const floor = groundHeight(this.scene.world, cam.position.x, cam.position.z);
        if (cam.position.y < floor + 7) {
          cam.position.y = floor + 7;
          cam.lookAt(watch.x, watch.y + watch.span * 0.2, watch.z);
        }
      }
      cam.updateProjectionMatrix();
      return;
    }
    // The thing being watched has sunk or been silenced: come home.
    if (this.watching) { this.watching = null; this.hud.setWatching(null); this.hud.setWatchBanner(null); }

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

    // Nothing puts the camera inside the ground.
    //
    // Orbiting a battery on a headland used to walk the camera straight into
    // the hillside: the view went to mud, and a captain who could not see
    // anything and could not get out of it concluded the camera would not move
    // at all. It is lifted to stand clear of whatever is under it, ashore or
    // afloat, wherever it has been asked to go.
    const floor = groundHeight(this.scene.world, cam.position.x, cam.position.z);
    cam.position.y = Math.max(cam.position.y, floor + 7, 2.5);

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
