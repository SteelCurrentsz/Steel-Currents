// The battle client: prediction for your own hull, interpolation for everyone
// else, camera rig, effects and the loop that ties them together.

import * as THREE from '../../vendor/three.module.js';
import { BattleScene } from './render/scene.js';
import { Hud } from './hud.js';
import { DamageBoard } from './render/damageboard.js';
import { Airborne, AERO, stallSpeed, Pilot } from './render/aero.js';
import { ROLE_TYPE } from './render/planes.js';
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
// How deep the camera may go. The bottom, not the surface: the orbit is allowed
// under the water, and the only thing down there it must not get inside is the
// ground.
const SEABED = -34;

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
    // Every one of these is given to whichever ship is being conned -- your
    // own, or whoever you have picked off the plot and are watching.
    this.hud.onConn?.((k, v) => {
      const ship = this.conned();
      if (k === 'notch') this.setNotch(v);
      else if (k === 'air') this.net.send({ t: 'strike', ship });
      else if (k === 'plane') this.togglePilotView();
      else if (k === 'repair') this.net.send({ t: 'repair', ship });
      else if (k === 'smoke') this.net.send({ t: 'smoke', ship });
      audio.click();
    });

    // Local mirror of our own hull, stepped with the shared simulation.
    this.local = createState(world, {});
    this.localShip = addShip(this.local, { id: shipId, name: 'You', classId, team, index: 0 });
    this.localShip.notch = 1;

    this.entities = new Map();
    this.snapshots = [];
    // Last heading seen for each flight, so a turn can be read off as bank.
    this.planeTurn = new Map();
    this.snapTime = 0;
    this.serverTime = 0;
    this.shellTrails = new Map();

    this.camMode = 'chase';
    // The aeroplane the player has taken, if any: see takeFlight.
    this.flight = null;
    // What the camera is looking at, when it is not looking at your own hull:
    // {kind:'ship'|'battery', id, name}, set by tapping a contact on the plot.
    // You still have the con while you are watching — the helm and the
    // telegraph answer, the guns hold whatever bearing they were left on.
    this.watching = null;
    // Which ship the server has been told the camera is on, so the word only
    // goes up the wire when it changes.
    this.watchSent = 0;
    // Which of our own the plot is conning. Your own hull until you say
    // otherwise, so the first course you lay off goes to her.
    this.selected = shipId;
    // An aeroplane on the approach, coming back aboard after her sortie.
    this.landing = null;
    // What is left of the ones that were shot down, on their way into the sea.
    this.wrecks = [];
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
    // The cockpit: one button to take an aeroplane, and the stick, throttle
    // and triggers once you are in her.
    this.hud.bindCockpit({
      take: () => this.takeFlight(),
      leave: () => this.leaveFlight(),
      drop: () => {
        if (!this.flight || !this.flight.armed) return;
        this.net.send({ t: 'drop', i: this.flight.id });
        audio.click();
      },
    });
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
        case 'aa': {
          // The light battery opening up: tracer reaching out to the squadron
          // and, from the heavy mountings, the black puffs bursting round it.
          // Where the squadron is in the sky is the client's business -- the
          // simulation flies a squadron on the water plane -- so the height
          // comes off the aeroplane the scene is already drawing.
          const pl = (this.planesNow || []).find((q) =>
            Math.abs(q.x - ev.tx) < 260 && Math.abs(q.z - ev.tz) < 260);
          const ty = pl ? this.planeHeight(pl) : 220;
          const view = this.scene.shipViews.get(ev.ship);
          const gy = view ? view.group.position.y + 14 : 16;
          this.scene.flak.fire(ev.x, gy, ev.z, ev.tx, ty, ev.tz, ev.cal, ev.n, fx);
          if (d < 0.6) audio.gun(Math.min(75, ev.cal), Math.max(d, 0.35));
          break;
        }
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
          if (!v) break;
          // A carrier has one aeroplane she draws in full, and a captain can
          // order a second squadron up while the first is still out. Her model
          // was in the world by then -- taken out of the ship's group so she
          // could fly -- and running the deck evolution on her put her at ship
          // coordinates in world space, which is to say nowhere near the ship.
          // That is the take-off where nothing appears. She is brought home
          // first; the squadron she was leading carries on without her, drawn
          // by the formation the same as the rest of it.
          this.recallDeckPlane(v);
          v.group.userData.launch?.(this.time);
          break;
        }
        case 'bomb': {
          // One bomb away, and where she is going. The arc is flown by the
          // scene; whether she hits was settled the moment the pilot let go.
          const from = (this.planesNow || []).find((q) => q.i === ev.i);
          const y = from ? this.planeHeight(from) : 220;
          this.scene.bombs.drop(ev.x, y, ev.z, ev.tx, ev.tz, !!ev.hit, fx);
          break;
        }
        case 'airGuns': {
          // Her guns: tracer reaching out from her to whatever she is on. The
          // aeroplane the player is flying draws her own, off the stick,
          // without waiting for the wire to tell her she fired.
          if (this.flight && this.flight.id === ev.i) break;
          const from = (this.planesNow || []).find((q) => q.i === ev.i);
          const y = from ? this.planeHeight(from) : 200;
          const ty = ev.air ? y - 8 : 22;
          this.scene.flak.fire(ev.x, y - 1, ev.z, ev.tx, ty, ev.tz, 12.7, 10, fx);
          break;
        }
        case 'planesLost':
          this.shootDown(ev);
          if (ev.team === this.team) this.hud.alert('Squadron lost');
          break;
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
        if (this.watchPov) this.watchFov = clamp(this.watchFov * Math.pow(1.12, dir), 7, 68);
        // Right in, close enough to read the plating, and right out to see
        // the whole action. The old floor of half her length stood a carrier
        // off at a hundred and thirty metres however hard you pulled.
        else this.watchDist = clamp(this.watchDist * Math.pow(1.18, dir), 0.06, 26);
        return;
      }
      // `dir` is notches of wheel, and a pinch sends fractions of one, so the
      // same line serves a mouse and two fingers. In as close as her plating
      // and out far enough to see the whole action.
      this.camDistance = clamp(this.camDistance * Math.pow(1.15, dir),
        this.cls.hull.length * 0.05, this.cls.hull.length * 6);
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
    // Any ship picked off the plot is the ship you are watching and the ship
    // you are conning, whichever side she is on. The two used to be different
    // things -- tapping your own division selected her for orders and tapping
    // the enemy moved the camera -- and the result was that half the marks on
    // the chart did one thing and half did the other.
    if (hit && hit.kind === 'ship') {
      this.lookAt(hit);
      this.selected = this.watching && this.watching.kind === 'ship'
        ? this.watching.id : this.shipId;
      this.hud.setSelected(this.selected);
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
    // And the server is told, because it decides what this client is shown:
    // a ship nobody aboard has sighted is not in the snapshot at all, and
    // watching her put the camera over an empty patch of sea. Named, she
    // comes through in full.
    const eyes = this.watching && this.watching.kind === 'ship' ? this.watching.id : 0;
    if (eyes !== this.watchSent) {
      this.watchSent = eyes;
      this.net.send({ t: 'watch', ship: eyes });
    }
    this.hud.setWatching(this.watching);
    this.hud.setWatchBanner(this.watching, this.watchPov);
    // Picked one of your own flights off the plot: offer to take her. This is
    // the only way into the cockpit, and it is one tap from the chart.
    this.hud.setFlyOffer(this.canTake());
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

  /** Is the thing being watched a flight of ours that could be flown? */
  canTake() {
    const w = this.watching;
    if (!w || w.kind !== 'plane' || w.id == null || this.flight) return false;
    const snap = this.snapshots[this.snapshots.length - 1];
    const pl = snap && (snap.planes || []).find((q) => q.i === w.id);
    return !!pl && pl.tm === this.team && pl.o === this.shipId;
  }

  /**
   * Take an aeroplane.
   *
   * The flight stays the simulation's -- it is still shot at, it still counts
   * against her squadron, and it still has to get home -- but from here on it
   * is flown from the cockpit rather than by the autopilot, and where it is
   * goes back over the wire the same way the ship's own aim does.
   */
  takeFlight() {
    if (!this.canTake()) return;
    const snap = this.snapshots[this.snapshots.length - 1];
    const pl = (snap.planes || []).find((q) => q.i === this.watching.id);
    if (!pl) return;
    const aero = AERO[ROLE_TYPE[pl.r || 'torpedo']] || AERO.avenger;
    this.flight = {
      id: pl.i,
      role: pl.r || 'torpedo',
      pilot: new Pilot(aero, {
        x: pl.x, y: this.planeHeight(pl), z: pl.z, heading: pl.h,
        speed: aero.vMax * 0.72,
      }),
      // What she is carrying, and how long since the last word to the server.
      armed: (pl.r || 'torpedo') !== 'fighter',
      sent: 0,
      guns: 0,
      tracer: 0,
    };
    // If the flight taken is the one the carrier's own deck model is flying --
    // the aeroplane that came up the lift and went down the deck -- she is put
    // back aboard. There is one aeroplane, and the pilot has her; two of the
    // same flight in the air is the duplicate this whole thing is meant to
    // avoid.
    if (this.flying && this.flying.id === pl.i) {
      const v = this.flying.ownerView;
      if (v) this.recallDeckPlane(v);
    }
    this.watching = null;
    this.hud.setWatching(null);
    this.hud.setWatchBanner(null);
    this.hud.setFlyOffer(false);
    this.hud.setCockpit(true);
    if (this.mapBig) this.toggleMap(false);
    audio.click();
  }

  /** Hand her back to the autopilot and go back to the bridge. */
  leaveFlight(lost = false) {
    if (!this.flight) return;
    this.net.send({ t: 'land', i: this.flight.id });
    this.flight = null;
    this.hud.setCockpit(false);
    if (lost) this.hud.alert('Aircraft down');
  }

  /**
   * Fly her for one frame.
   *
   * The stick and the throttle come off the cockpit; the aeroplane comes off
   * the flight model in aero.js, which is a wing and an engine rather than a
   * cursor. Where she ends up is sent to the simulation a few times a second
   * -- often enough that the flight the plot shows is the one under the
   * player, sparing enough that it is not a message a frame.
   */
  stepFlight(dt) {
    const f = this.flight;
    if (!f) return;
    const snap = this.snapshots[this.snapshots.length - 1];
    const pl = snap && (snap.planes || []).find((q) => q.i === f.id);
    // She is gone: shot down, or her squadron was released under her.
    if (!pl) { this.leaveFlight(true); return; }
    f.armed = !pl.d;

    const stick = this.hud.fly || { pitch: 0, roll: 0, throttle: 1 };
    const p = f.pilot;
    p.stickPitch = stick.pitch;
    p.stickRoll = stick.roll;
    p.throttle = stick.throttle;
    const sea = this.scene.ocean.heightAt(p.x, p.z);
    p.step(dt, sea);
    if (!p.alive) { this.leaveFlight(true); return; }

    // The guns: held down, reported in bursts rather than per frame. The
    // tracer is drawn here rather than off the wire coming back, because a
    // pilot pressing the trigger has to see it leave the wing now.
    if (stick.firing) {
      f.guns += dt;
      f.tracer -= dt;
      if (f.tracer <= 0) {
        f.tracer = 0.1;
        const cp = Math.cos(p.pitch);
        const R = 620;
        this.scene.flak.fire(
          p.x, p.y - 0.6, p.z,
          p.x + Math.sin(p.heading) * cp * R,
          p.y + Math.sin(p.pitch) * R,
          p.z + Math.cos(p.heading) * cp * R,
          12.7, 8, this.scene.effects,
        );
      }
      if (f.guns > 0.15) {
        this.net.send({ t: 'gun', i: f.id, dt: Math.round(f.guns * 100) / 100 });
        f.guns = 0;
      }
    } else { f.guns = 0; f.tracer = 0; }

    f.sent -= dt;
    if (f.sent <= 0) {
      f.sent = 0.1;
      this.net.send({
        t: 'fly', i: f.id,
        x: Math.round(p.x), z: Math.round(p.z), h: Math.round(p.heading * 1000) / 1000,
      });
    }
    this.hud.paintCockpit({ v: p.v, y: p.y, g: p.g, stall: p.stall, armed: f.armed });
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
    // Watching somebody else, the telegraph is hers: a captain who has picked
    // a ship off the plot and is standing on her bridge rings up her engine
    // room, not his own two miles away.
    const conned = this.conned();
    if (conned !== this.shipId) {
      this.net.send({ t: 'notch', ship: conned, notch: want });
      return;
    }
    if (this.localShip.notch === want) return;
    this.localShip.notch = want;
    this.net.send({ t: 'input', notch: want });
  }

  /** Whose bridge the controls answer: the ship being watched, else your own. */
  conned() {
    return this.watching && this.watching.kind === 'ship'
      ? this.watching.id : this.shipId;
  }

  /** The snapshot of whoever is being read out at the bottom of the screen. */
  shownShip() {
    const id = this.conned();
    if (id === this.shipId) return this.ownSnap;
    const snap = this.snapshots[this.snapshots.length - 1];
    return snap ? snap.ships.find((s) => s.i === id) || null : null;
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
      // Far enough either way that the orbit can be walked from overhead to
      // under her keel. The old stop at 0.55 was about thirty degrees of
      // looking down, which is nowhere near the water.
      this.pitch = clamp(this.pitch + m.y * zoom, -0.87, 1.16);
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

    this.stepFlight(dt);
    this.syncEntities(dt);
    this.updateCamera(dt);
    this.scene.update(dt);

    audio.setEngineLoad(clamp(Math.abs(ls.speed) / this.cls.maxSpeed, 0, 1));

    const ownForHud = this.ownSnap
      ? { ...this.ownSnap, v: ls.speed, h: ls.heading, notch: ls.notch, rud: ls.rudderCmd, maxHp: this.cls.hp }
      : null;
    const snap = this.snapshots[this.snapshots.length - 1];
    // The plate at the bottom reads whichever bridge you are standing on. Your
    // own hull comes off the local prediction so the telegraph and the heading
    // answer the instant they are worked; anybody else's comes off the wire.
    const other = this.conned() === this.shipId ? null : this.shownShip();
    const shown = other
      ? { ...other, maxHp: getClass(other.c).hp }
      : ownForHud;
    if (shown) this.hud.setShown(shown.c);
    this.hud.update(shown, snap);
    // The board only turns while it is being looked at.
    if (this.board && this.hud.panel === 'dmg') {
      if (shown) this.board.build(shown.c);
      this.board.update(shown?.sec, dt);
    }
    // The plot is always drawn round your own hull, whoever the camera is on:
    // it is your chart table, and the mark in the middle of it is you.
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

    // A ship conned off the chart holds the con until she sinks or drops off
    // the plot altogether. She used to have to be in `ships` -- which an
    // enemy the lookouts have lost is not -- and the con snapped back to your
    // own bridge a tick after you gave it away.
    if (this.selected !== this.shipId) {
      const still = a.ships.some((s) => s.i === this.selected && s.a)
        || (a.contacts || []).some((s) => s.i === this.selected);
      if (!still) {
        this.selected = this.shipId;
        this.hud.setSelected(this.selected);
        if (this.watching && this.watching.kind === 'ship') this.lookAt(null);
      }
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
      // And everything else that trains: her secondary mountings and her
      // tubes off the snapshot, her light battery off the aircraft overhead.
      view.layMounts(s.se, s.tt, this.planesNow, dt);

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
    // A shell is drawn nose-first along the line it is actually flying, so the
    // line between the last snapshot's position and this one is what points
    // her. That is her velocity to within a tick, which is near enough: a
    // shell does not change direction quickly.
    for (const sh of a.shells) {
      const prev = b ? b.shells.find((x) => x.i === sh.i) : null;
      const x = prev ? lerp(sh.x, prev.x, t) : sh.x;
      const y = prev ? lerp(sh.y, prev.y, t) : sh.y;
      const z = prev ? lerp(sh.z, prev.z, t) : sh.z;
      const dx = prev ? prev.x - sh.x : Math.sin(sh.b || 0);
      const dy = prev ? prev.y - sh.y : 0.2;
      const dz = prev ? prev.z - sh.z : Math.cos(sh.b || 0);
      n = this.scene.shells.set(n, x, y, z, dx, dy, dz, sh.c);
    }
    this.scene.shells.hideFrom(n);
    this.scene.shells.flush();

    // The torpedoes, interpolated like everything else, and handed to the
    // module that draws the fish and lays her track. It wants world positions
    // and a course, and it works out the rest.
    this.torpsNow = a.torps.map((tp) => {
      const prev = b ? b.torps.find((x) => x.i === tp.i) : null;
      return {
        i: tp.i,
        x: prev ? lerp(tp.x, prev.x, t) : tp.x,
        z: prev ? lerp(tp.z, prev.z, t) : tp.z,
        h: prev ? tp.h + angleDelta(tp.h, prev.h) * t : tp.h,
      };
    });
    this.scene.torpsNow = this.torpsNow;

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
        b: lerp(pl.b || 0, nx.b || 0, t),
      };
    });
    this.planesNow = planes;

    // Every flight in the air, as the aircraft she actually is and as many of
    // them as she actually has.
    this.scene.flights.begin();
    for (const pl of planes) {
      // How hard she is banked.
      //
      // It used to be worked out by differencing her heading between two
      // snapshots, which arrive five times a second: the answer jumped between
      // hard over and level from frame to frame and the formation flickered.
      // The simulation knows her turn rate now and sends it, and a banked turn
      // is a coordinated one -- tan(bank) = v.omega / g -- so the angle is the
      // angle she would really be at. Eased so a rate quantised on the wire
      // still rolls rather than steps.
      const want = clamp(Math.atan2(60 * (pl.b || 0), 9.81), -1.15, 1.15);
      const held = this.planeTurn.get(pl.i);
      const bank = held === undefined ? want
        : held + (want - held) * (1 - Math.pow(0.02, dt));
      this.planeTurn.set(pl.i, bank);
      const climb = clamp(((pl.a ?? 99) - 6) / 30, 0, 1);
      const pitch = (1 - climb) * 0.14;
      // The one aeroplane a carrier put in the air is drawn by the deck
      // handover instead -- she is the model that went down the deck -- so her
      // slot in the formation is left empty rather than filled twice.
      const skip = this.flying && this.flying.id === pl.i ? 0 : -1;
      // The one the player is flying is drawn where the flight model says she
      // is, at the attitude the stick has her in -- not at the position the
      // last snapshot happened to carry.
      const mine = this.flight && this.flight.id === pl.i ? this.flight.pilot : null;
      if (mine) {
        this.scene.flights.add(pl.r || 'torpedo', mine.x, mine.y, mine.z,
          mine.heading, mine.bank, mine.pitch, Math.max(1, pl.n || 1), skip);
      } else {
        this.scene.flights.add(pl.r || 'torpedo', pl.x, this.planeHeight(pl), pl.z,
          pl.h, bank, pitch, Math.max(1, pl.n || 1), skip);
      }
    }
    for (const w of this.wrecks) {
      this.scene.flights.one(w.role, w.x, w.y, w.z, w.heading, w.bank, w.pitch);
    }
    this.scene.flights.end();
    // Forget the flights that are no longer up, so the map does not grow.
    for (const id of [...this.planeTurn.keys()]) {
      if (!planes.some((q) => q.i === id)) this.planeTurn.delete(id);
    }
    // The ones that are not flying any more: the wrecks on their way down.
    this.stepWrecks(dt);
    this.flyLaunched(planes, dt);
  }

  /**
   * A flight is shot down, and it is worth watching.
   *
   * There was no such thing before: the marker was removed from the plot and
   * that was the whole of it -- a squadron of aeroplanes simply stopped
   * existing in mid-air. What happens to an aeroplane hit by a shell is one of
   * two things, and both of them are worth the frame they cost. Either she
   * blows up where she is, and there is nothing left but pieces going
   * outwards, or she is set on fire and goes down: nose over, trailing smoke,
   * turning as she falls, into the sea.
   */
  shootDown(ev) {
    const pl = (this.planesNow || []).find((q) => q.i === ev.i);
    const role = (pl && pl.r) || 'torpedo';
    const heading = pl ? pl.h : 0;
    const y = pl ? this.planeHeight(pl) : 200;
    // A flight is several aeroplanes; losing it is several of them going down.
    const n = Math.min(3, Math.max(1, pl ? (pl.n || 1) : 1));
    const fx = this.scene.effects;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 26;
      const x = ev.x + Math.cos(heading) * off;
      const z = ev.z - Math.sin(heading) * off;
      const y0 = y + (Math.random() - 0.5) * 18;
      // Out of fuel is not being shot at: she ditches, she does not explode.
      const burst = ev.why !== 'fuel' && Math.random() < 0.4;
      if (burst) {
        fx.explosion(x, y0, z, 0.85);
        fx.debris(x, y0, z, 12);
        const near = this.distanceFade(x, z);
        if (near < 0.85) audio.explosion(0.7, near);
        continue;
      }
      if (this.wrecks.length > 14) this.wrecks.shift();
      const sp = 62 + Math.random() * 28;
      this.wrecks.push({
        role, x, y: y0, z,
        vx: Math.sin(heading) * sp, vy: -4 - Math.random() * 8, vz: Math.cos(heading) * sp,
        heading, pitch: -0.15, bank: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random()),
        // How fast she is going round as she falls. A wing off one side is a
        // spin; a hit in the engine is a long flat glide with the smoke
        // streaming off her.
        spin: (Math.random() - 0.5) * 2.6,
        tumble: 0.5 + Math.random() * 1.4,
        smoke: 0,
      });
    }
  }

  /**
   * Fly the wrecks down.
   *
   * Nothing clever: what is left of her has a lot of drag and no lift, so she
   * goes over on her back or into a spin and falls, and the trail of smoke
   * off her is what anybody watching actually sees. She finishes in the water.
   */
  stepWrecks(dt) {
    const fx = this.scene.effects;
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      const drag = Math.pow(0.72, dt);
      w.vx *= drag; w.vz *= drag;
      w.vy = w.vy * drag - 9.81 * dt;
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      w.z += w.vz * dt;
      w.heading = wrapAngle(w.heading + w.spin * dt);
      w.bank = wrapAngle(w.bank + w.tumble * dt);
      w.pitch = clamp(w.pitch - 0.55 * dt, -1.3, 0.4);
      w.smoke -= dt;
      if (w.smoke <= 0) {
        w.smoke = 0.055;
        fx.wreckSmoke(w.x, w.y, w.z);
      }
      const sea = this.scene.ocean.heightAt(w.x, w.z);
      if (w.y <= sea + 1) {
        // In. A hundred-knot aeroplane going into the sea throws a good deal
        // of water up, and then there is nothing there at all.
        fx.splash(w.x, w.z, 260);
        fx.explosion(w.x, sea + 3, w.z, 0.6);
        this.wrecks.splice(i, 1);
      }
    }
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
  flyLaunched(planes, dt) {
    // Which of the carriers on the plot has just put her ready aircraft up, and
    // which squadron on the plot is the one she flew off.
    let up = null;
    for (const [id, v] of this.scene.shipViews) {
      const deck = v.group.userData.deck;
      if (!deck || !deck.airborne) continue;
      // Which of this carrier's flights the model on the deck has become.
      //
      // The one she is already flying if it is still up; failing that, the
      // youngest, which is the one that has just left the planking. Taking
      // whichever came first in the list meant that the second squadron off
      // the deck was handed the first squadron's marker -- three miles away
      // and outbound -- and the aeroplane was dragged after it.
      const mine = planes.filter((q) => q.o === id
        && !(this.flight && this.flight.id === q.i));
      const pl = (this.flying && mine.find((q) => q.i === this.flying.id))
        || mine.reduce((a, q) => (a === null || q.a < a.a ? q : a), null);
      if (pl) { deck.lostAt = 0; up = { id, v, deck, pl }; break; }
      // Off the deck, but her squadron is not on the plot. That is usually
      // because she was recovered or shot down -- but for the first moments
      // after she leaves the planking it is only that the tick putting her
      // flights up has not landed yet, and standing her back on the lift for
      // that is an aeroplane snapping home the instant after it took off. So
      // she is given a moment before anyone concludes she is gone.
      deck.lostAt = (deck.lostAt || 0) + dt;
      if (deck.lostAt < 3.0) continue;
      if (!this.flying || this.flying.ownerView !== v) v.group.userData.stow?.();
    }

    if (!up) {
      // Her squadron is home. She is not: she is three hundred metres astern of
      // the ship, where the simulation released her, and snapping her onto the
      // lift from there is the thing that reads as an aeroplane vanishing. So
      // she flies the approach instead -- round onto the centreline, down the
      // glide, over the round-down and onto the deck.
      if (this.flying) {
        const v = this.flying.ownerView;
        const g = this.flying.group;
        const far = v.group.position.distanceTo(g.position);
        this.flying = null;
        if (far > 1500) {
          // She did not come home: she was shot down, or struck below out
          // where her squadron was. Flying an approach from four miles out
          // means sliding her across the sea at six hundred knots, which is
          // the aeroplane that appears to teleport back to the ship. Put her
          // below instead, which is where she is.
          v.group.attach(g);
          v.group.userData.stow?.();
        } else {
          this.landing = {
            t0: this.time, view: v, group: g,
            from: g.position.clone(), fromY: g.rotation.y,
          };
        }
      }
      this.flyApproach();
      return;
    }
    // Coming aboard and ordered up again: the deck is hers, so she goes.
    this.landing = null;

    const { v, deck, pl } = up;
    if (!this.flying || this.flying.id !== pl.i) {
      // Hand her over: the same object, kept where she is in the world, and
      // flying from here on. She leaves the deck at the speed the deck run left
      // her at, and everything after that is her wing and her engine against
      // her weight -- so she flies out to her squadron rather than being put on
      // top of it, which is the jump the camera riding her used to take.
      this.scene.scene.attach(v.group.userData.deckPlane);
      const g0 = v.group.userData.deckPlane;
      const w0 = new THREE.Vector3();
      g0.getWorldPosition(w0);
      // On her own type's wing: a Kingfisher off a cruiser's catapult is not
      // an Avenger off a carrier's deck, and each ship says which she flew.
      const a = AERO[deck.aero || 'avenger'] || AERO.avenger;
      this.flying = {
        id: pl.i, ownerView: v, group: g0,
        air: new Airborne(a, w0.x, w0.y, w0.z,
          v.group.rotation.y, stallSpeed(a) * 1.18),
      };
    }
    const g = this.flying.group;
    const air = this.flying.air;
    // She flies to where her squadron is, on her own wing: banking into the
    // turn, and climbing at the rate the power left over from drag allows. She
    // is not put there -- if she were, she would fly like a cursor.
    air.step(dt, pl.x, this.planeHeight(pl), pl.z);
    // The squadron is the authority on where she really is, so if her own
    // flying has let her drift a long way from it she is eased back on.
    //
    // Eased. It used to move her half the remaining distance every frame once
    // she was four hundred metres out, which at sixty frames a second is not a
    // correction, it is a teleport -- and it fired every time, because she was
    // born at the ship and the squadron three hundred metres off the bow. She
    // leaves the deck where her flight already is now, so this should almost
    // never bite; when it does, it takes a second and a half rather than a
    // frame, and it is here so a long stall in the tab cannot leave the
    // aeroplane a mile from the squadron she is supposed to be.
    const off = dist(air.x, air.z, pl.x, pl.z);
    if (off > 250) {
      const k = (1 - Math.pow(0.35, Math.min(0.1, dt)))
        * Math.min(1, (off - 250) / 600);
      air.x = lerp(air.x, pl.x, k);
      air.z = lerp(air.z, pl.z, k);
      air.y = lerp(air.y, this.planeHeight(pl), k);
    }
    g.position.set(air.x, air.y, air.z);
    g.rotation.set(air.pitch, air.heading, -air.bank);
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
    // Where she is going. A carrier's aeroplane comes home to the after end of
    // the flight deck; a cruiser's alights alongside and is craned back on to
    // the catapult she was shot off, so the ship says where if she has one.
    const home = v.group.userData.landingSpot;
    const deck = v.group.userData.flightDeckY ?? 17;
    const spot = home
      ? new THREE.Vector3(home[0], home[1], home[2])
      : new THREE.Vector3(0, deck + 0.4, -(v.cls.hull.length * 0.42));
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
    // Down: the model goes back into the ship's own group, and the recovery
    // takes it from there -- up the deck to the after lift, wings folding, and
    // the lift down into the hangar she came out of.
    v.group.attach(g);
    v.group.userData.recover?.(this.time);
    this.landing = null;
  }

  /**
   * Bring a carrier's own aeroplane back into her group, wherever she is.
   *
   * The model belongs to the ship; while she is flying she is parented to the
   * world instead, and anything that wants to run the deck evolution has to
   * have her back in the ship's frame first or it will be positioning a
   * world-space object with ship-space numbers.
   */
  recallDeckPlane(v) {
    if (this.flying && this.flying.ownerView === v) {
      v.group.attach(this.flying.group);
      this.flying = null;
    }
    if (this.landing && this.landing.view === v) {
      v.group.attach(this.landing.group);
      this.landing = null;
    }
    v.group.userData.stow?.();
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
    // In the cockpit, the camera belongs to the aeroplane and to nothing else:
    // over her shoulder, banking with her, looking where her nose is looking.
    if (this.flight) {
      const p = this.flight.pilot;
      cam.fov = 62;
      cam.updateProjectionMatrix();
      // The camera trails her; it is not bolted to her.
      //
      // It used to take her attitude exactly, which sounds right and is what
      // made it unusable: roll the aeroplane and the whole world turned over
      // round a picture of an aeroplane that never moved, and every touch of
      // the stick threw the horizon about. What a chase camera does is lag --
      // it swings round after her in its own time, and it keeps the horizon
      // very nearly where the horizon is, so what you see rolling is the
      // aeroplane. The rig below is her heading and pitch eased toward hers
      // over about a third of a second, and a quarter of her bank.
      const r = this.flight.rig || (this.flight.rig = {
        heading: p.heading, pitch: p.pitch, bank: 0,
      });
      const k = 1 - Math.pow(0.0008, Math.min(0.1, dt));
      r.heading = wrapAngle(r.heading + angleDelta(r.heading, p.heading) * k);
      r.pitch = lerp(r.pitch, clamp(p.pitch, -0.7, 0.7), k);
      r.bank = lerp(r.bank, clamp(p.bank * 0.26, -0.34, 0.34), k);
      // Far enough back and high enough that she is in the frame with the sea
      // under her: a chase camera that cannot see its own aeroplane is a
      // camera pointed at nothing.
      const back = 34;
      const up = 9;
      const cp = Math.cos(r.pitch);
      const bx = -Math.sin(r.heading) * cp * back - Math.sin(r.bank) * Math.cos(r.heading) * up;
      const bz = -Math.cos(r.heading) * cp * back + Math.sin(r.bank) * Math.sin(r.heading) * up;
      const by = -Math.sin(r.pitch) * back + Math.cos(r.bank) * up;
      cam.position.set(p.x + bx, Math.max(p.y + by, 3), p.z + bz);
      cam.up.set(-Math.sin(r.bank) * Math.cos(r.heading), Math.cos(r.bank),
        Math.sin(r.bank) * Math.sin(r.heading));
      // Looking down the rig's nose rather than hers, so a hard pull does not
      // whip the view -- but through a point on the aeroplane, so however far
      // the rig is lagging she stays in the middle of the picture.
      const look = 70;
      cam.lookAt(
        p.x + Math.sin(r.heading) * cp * look,
        p.y + Math.sin(r.pitch) * look + 2,
        p.z + Math.cos(r.heading) * cp * look,
      );
      this.input.orbiting = false;
      return;
    }
    cam.up.set(0, 1, 0);
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
        // Down past the horizontal and under her: the orbit is allowed below
        // the water now, so you can come up under a hull and look at her
        // screws, or watch a torpedo run in from where it is running.
        this.watchEl = clamp(this.watchEl - m.y, -1.15, 1.28);
        const near = !!watch.close;
        const d = Math.max(near ? 3 : 8, watch.span * this.watchDistNow);
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
        // Out of the ground, but not out of the water: the only floor down
        // here is the bottom.
        const floor = groundHeight(this.scene.world, cam.position.x, cam.position.z);
        const bed = Math.max(floor + 7, SEABED);
        if (cam.position.y < bed) {
          cam.position.y = bed;
          cam.lookAt(watch.x, aim, watch.z);
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
      // A real orbit round her, and the drag walks it up and down.
      //
      // It used to stand at a fixed height above the water and only tilt what
      // it looked at, so there was no way to get the camera under the surface
      // from your own bridge at all -- you could look down at the sea and that
      // was the end of it. The elevation is the drag now, and it is allowed
      // below the waterline: drop it under her and you are looking up at her
      // bottom and her screws with the sea over your head.
      const d = this.scoped ? this.camDistance * 0.55 : this.camDistance;
      const el = clamp(0.38 - this.pitch, -0.78, 1.25);
      const flat = Math.cos(el);
      const aim = wave * 0.5 + this.cls.hull.superstructure * 5 + 6;
      cam.position.set(
        ls.x - Math.sin(this.yaw) * d * flat,
        wave * 0.5 + 6 + d * Math.sin(el),
        ls.z - Math.cos(this.yaw) * d * flat,
      );
      cam.lookAt(ls.x, aim, ls.z);
    }

    // Nothing puts the camera inside the ground.
    //
    // Orbiting a battery on a headland used to walk the camera straight into
    // the hillside: the view went to mud, and a captain who could not see
    // anything and could not get out of it concluded the camera would not move
    // at all. It is lifted to stand clear of whatever is under it, ashore or
    // afloat, wherever it has been asked to go.
    const floor = groundHeight(this.scene.world, cam.position.x, cam.position.z);
    cam.position.y = Math.max(cam.position.y, floor + 7, SEABED);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.8);
      const s = this.shake * 3.2;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
    }
    cam.updateProjectionMatrix();
  }

  render() {
    // Whether the eye is in the water, decided fresh each frame from where the
    // camera actually ended up and what the sea is doing under it.
    const cam = this.scene.camera;
    const sea = this.scene.ocean.heightAt(cam.position.x, cam.position.z);
    this.scene.setUnderwater(cam.position.y < sea - 0.2);
    this.scene.render();
  }

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
