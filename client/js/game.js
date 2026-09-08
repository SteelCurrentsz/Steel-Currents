// The battle client: prediction for your own hull, interpolation for everyone
// else, camera rig, effects and the loop that ties them together.

import * as THREE from '../../vendor/three.module.js';
import { BattleScene } from './render/scene.js';
import { Hud, readTarget } from './hud.js';
import { DamageBoard } from './render/damageboard.js';
import { holeRadius } from './render/plating.js';
import { Airborne, AERO, stallSpeed, Pilot, flightAttitude, weathercock }
  from './render/aero.js';
import { ROLE_TYPE, typeOf, slotAt, gunsOf } from './render/planes.js';
import { audio } from './audio.js';
import { getSettings } from './settings.js';
import { SHIP_CLASSES, getClass } from '../../shared/ships.js';
import {
  createState, addShip, applyInput, predictShip, MIN_NOTCH, MAX_NOTCH, solveBallistic,
  steerToWaypoint, PENETRATING, HOLING, SECTIONS, sectionAt,
} from '../../shared/sim.js';
import {
  clamp, lerp, wrapAngle, angleDelta, dist, worldToLocal, localToWorld,
  MPS_TO_KNOTS,
} from '../../shared/math.js';
import { groundHeight } from '../../shared/world.js';

const INTERP_DELAY = 0.12;     // seconds behind the server, to smooth jitter

// Scratch for reading a mounting's place in the world off the scene graph.
const GUN_EYE = new THREE.Vector3();
const INPUT_HZ = 20;

const CAMERAS = ['chase', 'bridge', 'tactical'];
// How deep the camera may go. The bottom, not the surface: the orbit is allowed
// under the water, and the only thing down there it must not get inside is the
// ground.
const SEABED = -34;

/** What to call a flight on screen: the machine, not the job she is on. */
const FLIGHT_NAME = {
  wildcat: 'her fighters',
  dauntless: 'her dive bombers',
  avenger: 'her torpedo bombers',
  arado: 'her Arados',
  kingfisher: 'her Kingfishers',
};

/** What each machine's forward guns are, so the tracer is the right tracer. */
const GUN_CALIBRE = {
  wildcat: 12.7,      // four fifties in the wings
  dauntless: 12.7,    // two in the cowling
  avenger: 12.7,      // one in each wing
  arado: 20,          // two MG FF in the wings and an MG 17 over the engine
  kingfisher: 7.62,   // the one thirty she had
};

/**
 * What each kind of aeroplane attacks with, and what the key says.
 *
 * The weapon a machine actually carried, rather than one key labelled DROP on
 * everything in the air. A fighter is not on this table at all: she has
 * nothing on a rack, her guns are her weapon, and a drop key that does nothing
 * when it is pressed is worse than no drop key, because it says she is
 * carrying something.
 *
 * `near` is how close she has to be before letting go is worth anything --
 * a torpedo has to be dropped where the target cannot comb it, and a bomb has
 * to be released from the dive rather than lobbed from four thousand yards.
 */
const LOAD = {
  dive: { key: 'BOMBS', name: 'bombs', near: 1200, away: 'Bombs away' },
  scout: { key: 'BOMBS', name: 'bombs', near: 1200, away: 'Bombs away' },
  torpedo: { key: 'TORPEDO', name: 'torpedoes', near: 1600, away: 'Torpedoes away' },
};


/**
 * Which of the ship's batteries a row of the arsenal belongs to.
 *
 * The simulation keeps state for her main and secondary mountings and her
 * tubes one at a time; her close-range guns are a battery rather than a list
 * of mountings, but a man can still stand at one of them.
 */
function batteryKind(row) {
  if (!row) return null;
  if (row.cond === 'gc') return 'main';
  if (row.cond === 'sc') return 'sec';
  if (row.band === 'Torpedo tubes') return 'torp';
  if (row.band === 'Light battery') return 'aa';
  return null;
}

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
    // A bomb arrives where the scene flew it to, so the scene is what says
    // when. See bombThrough.
    this.scene.bombs.onHit = (x, y, z) => this.bombThrough(x, y, z);
    this.hud = new Hud({ team, world, onLeave: () => this.leave() });
    this.hud.buildFor(classId);
    this.hud.setSelected(shipId);
    // The damage board builds its own little renderer the first time the
    // wrench is pressed, and is fed her compartments every frame after.
    this.hud.onDamageBoard?.((canvas) => {
      this.board = new DamageBoard(canvas, classId);
      for (const h of this.holes) this.board.hole(h[0], h[1], h[2], h[3]);
    });
    // And the arsenal's own hologram: the same hull with no damage on it, and
    // the battery that was pressed lit up where it stands on her.
    this.hud.onArsenalBoard?.((canvas, specs, row) => {
      if (!this.armsBoard) this.armsBoard = new DamageBoard(canvas, classId, { plain: true });
      this.armsBoard.build(this.shownShip()?.c || classId);
      this.armsRow = row;
      this.armsBoard.markMounts(specs, this.mountCondition(row));
      // Pressing one of the circles on her is asking to stand at that gun.
      // A row's mountings are numbered from that row; the ship numbers her
      // close-range mountings across the whole battery. See lightMounts.
      this.armsBoard.onPick((i) => this.manGun(batteryKind(row), i, row));
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
    // Where each of our flights was last seen, and which of them were reported
    // shot down rather than recovered. Between them they say which vanishing
    // flight is a squadron coming home -- see comingHome.
    this.lastFlights = new Map();
    // When each damaged flight last put up a puff of smoke.
    this.planeSmoke = new Map();
    this.lostFlights = new Set();
    // Where the camera is standing when it has been walked off its ship: a
    // point on the sea it orbits instead. Null means it is on whatever it is
    // following -- your own hull, or a mark picked off the chart.
    this.roam = null;
    // Whether the free camera is up. It is the one way the camera comes off a
    // ship, it has a key of its own in the corner, and picking anything on the
    // plot puts it away again. See freeCamera.
    this.freeCam = false;
    // What is left of the ones that were shot down, on their way into the sea.
    this.wrecks = [];
    this.watchYaw = 0;
    this.watchPitch = 0.06;

    // The mounting a captain has gone down to and is laying himself, and where
    // he is looking. The sight is fixed in the middle of the screen and the
    // gun comes round to it, which is the way round a gun sight works: a
    // layer's eye is quicker than the training gear and the barrels follow him
    // into the target. See manGun.
    this.gun = null;              // { kind, index, name }
    this.gunYaw = 0;
    this.gunPitch = 0.02;
    this.gunFire = false;
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
    // The shell camera. `shellCam` is whether it is switched on, `shellFrom`
    // is whose rounds it is following, and `shellWas` is where the camera was
    // before it was pressed, so turning it off puts the view back.
    this.shellCam = false;
    this.shellFrom = 0;
    this.shellWas = null;
    this.shellsNow = [];

    // Tapping a hull or a gun on the plot puts the camera on it; tapping it
    // again, or tapping open water, brings the view back to your own bridge.
    this.hud.onPick = (hit, at) => this.workPlot(hit, at);
    // The cockpit: one button to take an aeroplane, and the stick, throttle
    // and triggers once you are in her.
    this.hud.bindCockpit({
      take: () => this.takeFlight(),
      leave: () => this.leaveFlight(),
      drop: () => this.letGo(),
    });
    // The shell camera, beside the target plate: ride the rounds this ship is
    // firing.
    this.hud.bindShellCam(() => this.toggleShellCam());
    this.hud.onToggleMap = () => this.toggleMap();
    document.getElementById('watch-back')?.addEventListener('click', () => this.cameraHome());
    document.getElementById('free-cam')?.addEventListener('click', () => this.freeCamera());
    document.getElementById('gun-leave')?.addEventListener('click', () => this.manGun(null));
    const fireKey = document.getElementById('gun-fire');
    if (fireKey) {
      fireKey.addEventListener('pointerdown', (e) => { e.preventDefault(); this.pullTrigger(); });
      fireKey.addEventListener('click', (e) => e.preventDefault());
    }
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
      // The simulation refusing a drop. She is still carrying it, so the key
      // comes back live and the pilot is told why nothing happened rather than
      // being left pressing a dead button.
      this.net.on('nodrop', (m) => {
        const f = this.flight;
        if (!f || f.id !== m.i) return;
        f.asked = 0;
        this.hud.alert('She could not drop — press home');
      }),
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

  /**
   * Go down to one mounting and lay it yourself.
   *
   * Everything else aboard goes on being fought by her own fire control. This
   * one gun comes off it: it trains where you look, and -- for anything but
   * her close-range battery -- it fires when you say so and not before. An
   * automatic gun has no trigger here because it does not have one aboard
   * either: a Bofors gunner holds it down and lays, and the only decision he
   * makes is when to stop.
   *
   * Called with no battery, or with the one already being held, it hands the
   * gun back.
   */
  manGun(kind, index = 0, row = null) {
    const off = !kind || (this.gun && this.gun.kind === kind && this.gun.index === index);
    if (off) {
      if (!this.gun) return;
      this.gun = null;
      this.gunFire = false;
      this.net.send({ t: 'man', ship: this.conned(), k: null });
      this.hud.setGunSight(null);
      this.input.orbiting = false;
      this.hud.alert('Gun handed back to the director');
      audio.click();
      return;
    }
    const cls = getClass(this.shownShip()?.c || this.cls.id);
    const spec = row && row.specs ? row.specs[index] : null;
    if (!spec) return;
    // A mounting that is finished is not a mounting anybody can stand at.
    const cond = this.mountCondition(row);
    if (cond && cond[index] >= 3) {
      this.hud.alert('That mounting is out of action');
      return;
    }
    this.gun = {
      kind, index, spec,
      // What the ship calls this mounting. Her main and secondary batteries
      // and her tubes are numbered the way the arsenal lists them; her
      // close-range mountings are numbered across the whole light battery, so
      // a row's third Bofors is not the ship's third light gun.
      id: kind === 'aa' ? (row.lightAt || 0) + index : index,
      name: row.name || 'gun',
      auto: kind === 'aa',
      range: row.range || cls.gun.range,
      guns: spec.guns || 1,
    };
    // She starts laid where the mounting is already pointing, so taking a gun
    // does not swing the view.
    const own = this.shownShip();
    const head = own ? own.h : this.localShip.heading;
    this.gunYaw = wrapAngle(head + (spec.angle || 0));
    this.gunPitch = 0.02;
    this.watching = null;
    this.hud.setWatching(null);
    this.hud.setWatchBanner(null);
    this.freeCamera(false);
    // The panel goes down. Standing at a gun is a view, and a list of guns
    // over the middle of it is the one thing in the way of the one thing you
    // came for.
    if (this.hud.panel) this.hud.togglePanel(this.hud.panel);
    this.hud.setGunSight(this.gun);
    this.hud.alert(`${this.gun.name} — drag to lay, ${this.gun.auto ? 'she fires herself' : 'press FIRE'}`);
    this.net.send({ t: 'man', ship: this.conned(), k: kind, i: this.gun.id });
    audio.click();
  }

  /**
   * Where the layer is holding, in the world.
   *
   * A gun layer lays on a ship. He does not lay on a patch of water at a range
   * he worked out from how far below the horizon his eye is -- which is what
   * the sea intersection alone amounts to, and it is unusable: from ten metres
   * up, a hundredth of a radian of depression is a thousand yards and a
   * thousandth is ten thousand, so the whole useful band of the sight is
   * half a degree wide and nothing can be held on.
   *
   * So the sight looks for a hull under it first, out to the gun's own
   * maximum, and lays on her. That is what a layer does and it is what makes
   * the sight hold: put the crosshair on a ship and you are on her, and she
   * stays on her while both ships move.
   *
   * Failing that -- an empty horizon, or a close-range mounting pointed at the
   * sky -- it falls back to where the line meets the sea, and to the gun's
   * maximum when it never does.
   */
  gunAimPoint() {
    if (!this.gun) return null;
    const eye = this.gunEye();
    if (!eye) return null;
    const cp = Math.cos(this.gunPitch);
    const dir = {
      x: Math.sin(this.gunYaw) * cp,
      y: -Math.sin(this.gunPitch),
      z: Math.cos(this.gunYaw) * cp,
    };
    const reach = Math.max(600, this.gun.range || 12000);
    const mine = this.conned();
    // The nearest hull the sight is on. Generous, because a ship at fifteen
    // thousand yards is a few pixels wide and a layer has a spotting glass:
    // half a degree of tolerance, widening with range so it is a ship's
    // breadth rather than a fixed angle.
    let best = null;
    let bestD = Infinity;
    for (const sh of this.visibleShips()) {
      if (!sh || sh.i === mine || !sh.a) continue;
      const dx = sh.x - eye.x;
      const dz = sh.z - eye.z;
      const d = Math.hypot(dx, dz);
      if (d < 200 || d > reach) continue;
      const off = Math.abs(angleDelta(Math.atan2(dx, dz), this.gunYaw));
      // A hull's own half-breadth, seen from here, plus a layer's allowance.
      const wide = Math.atan2(getClass(sh.c).hull.length * 0.32, d) + 0.006;
      if (off > wide) continue;
      if (d < bestD) { bestD = d; best = sh; }
    }
    if (best) {
      return {
        x: best.x, y: 4, z: best.z, range: bestD, onSea: true,
        on: best.i, name: best.n,
      };
    }
    // Nothing under the sight: where the line meets the water, and the gun's
    // own maximum when it never does.
    let t = reach;
    if (dir.y < -1e-4) t = Math.min(reach, Math.max(400, eye.y / -dir.y));
    return {
      x: eye.x + dir.x * t,
      y: eye.y + dir.y * t,
      z: eye.z + dir.z * t,
      range: t,
      onSea: dir.y < -1e-4 && t < reach,
      on: 0,
    };
  }

  /**
   * Where the layer's eye is: on his own mounting, in the world.
   *
   * Off the scene graph rather than off the datasheet, so it carries
   * everything between the gun and the sea -- how far the mounting has
   * trained, how deep the water in her has put her, and how far over she is
   * lying. A sight that does not roll with the ship is not a sight.
   */
  gunEye() {
    const id = this.conned();
    const v = this.scene.shipViews.get(id);
    if (!v) return null;
    const list = this.gun.kind === 'main' ? v.turrets
      : this.gun.kind === 'sec' ? v.secMounts
        : this.gun.kind === 'torp' ? v.torpMounts : v.aaMounts;
    const m = list && list[this.gun.id];
    if (!m) {
      // No model for that mounting: stand where her datasheet puts it.
      const own = this.shownShip();
      if (!own) return null;
      const sp = this.gun.spec;
      const w = localToWorld(sp.x || 0, sp.z || 0, own.h);
      return { x: own.x + w.x, y: (sp.my ?? 12) + 1.6, z: own.z + w.z };
    }
    m.updateWorldMatrix(true, false);
    GUN_EYE.setFromMatrixPosition(m.matrixWorld);
    // Over the gunhouse and a little abaft the trunnions.
    //
    // A sight put at the mounting's own origin is inside the mounting: the
    // roof is over it and the barrels are across it, and what a layer got was
    // a screen full of the back of his own turret. So the eye is carried up
    // clear of the roof and stepped back along the line of sight, which is
    // where a director's eye is and what he can actually see the sea from.
    // How far the layer's eye stands off his own mounting: clear of the roof
    // and abaft the trunnions, scaled to the gun. A battleship's step back put
    // the eye at a Bofors seven metres astern of it, which on a mounting
    // bracketed out over the side is seven metres of somebody else's
    // superstructure -- so a light gun gets a light gun's allowance.
    const k = this.gun.kind;
    const up = k === 'main' ? 4.4 : k === 'sec' ? 2.4 : k === 'torp' ? 2.2 : 1.5;
    const back = k === 'main' ? 7.0 : k === 'sec' ? 3.4 : k === 'torp' ? 3.0 : 1.8;
    return {
      x: GUN_EYE.x - Math.sin(this.gunYaw) * back,
      y: GUN_EYE.y + up,
      z: GUN_EYE.z - Math.cos(this.gunYaw) * back,
    };
  }

  /** Pull the trigger on the gun being held. */
  pullTrigger() {
    if (!this.gun || this.gun.auto) return;
    this.net.send({ t: 'shoot', ship: this.conned() });
    this.gunFire = true;
    audio.click();
  }

  /**
   * What condition each mounting of one battery is in, as the wire has it.
   *
   * Her main and secondary batteries come through mounting by mounting,
   * because the simulation lays and fires each of them separately and knows
   * exactly what state each is in. Her close-range guns do not: flak is a
   * share of a whole battery and there is no state for any one 40 mm mounting
   * -- so their condition is read off the piece of the ship each one stands
   * on, which is the same thing the simulation itself does when it decides
   * whether a mounting can still put anything up.
   */
  mountCondition(row) {
    if (!row || !row.specs) return null;
    const snap = this.shownShip();
    if (!snap) return null;
    if (row.cond) return snap[row.cond] || null;
    if (!snap.wt || !snap.sk) return null;
    const cls = getClass(snap.c);
    const half = Math.max(1, cls.hull.length * 0.5);
    return row.specs.map((m) => {
      const k = sectionAt(Math.max(-1, Math.min(1, (m.z || 0) / half)));
      const i = SECTIONS.findIndex((q) => q.k === k);
      if (i < 0) return 0;
      // Half her magazine under is the hoists stopped, and the wire carries
      // the water in ninths.
      if ((snap.wt[i] || 0) >= 50) return 3;
      const hp = (snap.sk[i] || 0) / 9;
      if (hp <= 0) return 3;
      return hp < 0.3 ? 2 : hp < 0.62 ? 1 : 0;
    });
  }

  /**
   * Your own ship has gone down. The battle has not.
   *
   * It used to put a full-screen curtain over everything with a button on it
   * to go back to port -- which is the battle ending because the flagship
   * sank, with half a division still in action. A fleet action ends when one
   * fleet is on the bottom. So the notice is a notice, the screen stays yours,
   * and the camera goes to whatever is left of your side: you still have the
   * chart, you still have the con, and you fight her out with what is afloat.
   */
  onOwnSunk() {
    this.sunk = true;
    this.hud.setSunk(true);
    this.hud.alert('Abandon ship');
    audio.explosion(2, 0);
    this.input.releaseLock();
    const next = this.nextAfloat();
    if (next) {
      this.workPlot({ kind: 'ship', id: next.i, team: next.tm, name: next.n }, null);
      this.hud.alert(`Flag transferred to ${next.n}`);
    } else {
      this.camMode = 'tactical';
    }
  }

  /** The nearest of your side still afloat, for the flag to shift to. */
  nextAfloat() {
    const snap = this.snapshots[this.snapshots.length - 1];
    if (!snap) return null;
    let best = null;
    let near = Infinity;
    for (const s of snap.ships) {
      if (s.tm !== this.team || !s.a || s.i === this.shipId) continue;
      const d = dist(this.localShip.x, this.localShip.z, s.x, s.z);
      if (d < near) { near = d; best = s; }
    }
    return best;
  }

  onEvents(events) {
    const fx = this.scene.effects;
    for (const ev of events) {
      const d = this.distanceFade(ev.x, ev.z);
      switch (ev.e) {
        case 'muzzle': {
          // On the muzzles, one flash a barrel.
          //
          // The simulation says which ship fired and which mounting; where the
          // barrels of that mounting are is the model's business, and it is
          // the only thing that knows -- with the turret trained, the guns
          // elevated, and the ship herself rolling and down by the head. It
          // used to be put at the middle of the barbette at a height guessed
          // from her superstructure, so a battleship's salvo went off inside
          // her own turret roof.
          const view = this.scene.shipViews.get(ev.ship);
          let lit = false;
          if (view) {
            const kind = ev.t != null ? 'turret' : ev.s != null ? 'sec' : null;
            const which = ev.t != null ? ev.t : ev.s;
            if (kind) {
              for (const p of view.muzzles(kind, which)) {
                fx.muzzle(p.x, p.y, p.z, ev.b, ev.cal);
                lit = true;
              }
            }
          }
          // A coast gun has no ship and no model to ask; so has a mounting the
          // scene has not built. Both fall back on where the simulation says
          // the muzzle is, which is the same point, less the roll.
          if (!lit) fx.muzzle(ev.x, ev.y ?? 18, ev.z, ev.b, ev.cal);
          audio.gun(ev.cal, d);
          if (ev.ship === this.shipId && getSettings().shake) this.shake = Math.min(1, ev.cal / 320);
          break;
        }
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
          // Out of the guns that are actually pointing at her.
          //
          // The simulation counts the barrels that bear and works out what
          // they do to the squadron; the model knows which mountings those
          // are, because they are the ones it has just laid on her. So the
          // tracer leaves those muzzles -- a stream from each -- instead of
          // one stream from a point in the middle of the ship fourteen metres
          // up, which is where it used to come from and looked it.
          let fired = 0;
          if (view) {
            const bearing = Math.atan2(ev.tx - view.group.position.x,
              ev.tz - view.group.position.z);
            const mounts = view.bearingOn('aa', bearing, 0.85);
            // How much of the burst each barrel is responsible for, so a ship
            // with eighty guns bearing does not send eighty times the tracer
            // of one with four -- the simulation has already decided how much
            // fire there is, and this only decides where it comes out.
            let bores = 0;
            for (const m of mounts) bores += (m.userData.muzzles || []).length;
            const share = Math.max(3, Math.round((ev.n * 3) / Math.max(1, bores)));
            for (const m of mounts) {
              for (const p of view.muzzles('aa', view.aaMounts.indexOf(m))) {
                this.scene.flak.fire(p.x, p.y, p.z, ev.tx, ty, ev.tz,
                  ev.cal, share, fx);
                fired++;
              }
            }
          }
          const gy = view ? view.group.position.y + 14 : 16;
          if (!fired) this.scene.flak.fire(ev.x, gy, ev.z, ev.tx, ty, ev.tz, ev.cal, ev.n, fx);
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
          // And it comes out of the ship, where it went in.
          this.shellDamage(ev);
          if (ev.owner === this.shipId) {
            const label = { citadel: 'CITADEL', pen: 'PENETRATION', overpen: 'OVERPENETRATION', he: 'HIT', splash: 'SPLASH', shatter: 'SHATTER', ricochet: 'RICOCHET' }[ev.kind] || 'HIT';
            this.hud.ribbon(`${label}${ev.dmg ? `  ${ev.dmg}` : ''}`, ev.kind === 'citadel' ? 'cit' : (ev.kind === 'shatter' || ev.kind === 'ricochet') ? 'miss' : '');
            audio.hit(ev.kind);
          } else if (ev.victim === this.shipId) {
            this.shake = Math.max(this.shake, 0.5);
            audio.hit(ev.kind);
            // A hole in our own hull goes on the damage board, at the place on
            // her the shell actually went in.
            // Every round that struck her goes on the board, not only the
            // ones that got in. What her armour turned away is the other half
            // of the story -- a captain wants to see the white rings down her
            // belt as much as the red ones through it -- and only a splash
            // alongside leaves no mark, because it did not touch her.
            if (ev.kind !== 'splash') this.markHole(ev.x, ev.y, ev.z, ev.kind);
          }
          break;
        }
        case 'torpLaunch': if (ev.ship === this.shipId) audio.torpedo(); break;
        case 'torpHit':
          fx.explosion(ev.x, 4, ev.z, 1.6);
          // A torpedo opens a hole the better part of ten metres across, under
          // the waterline, and throws a good deal of the side of the ship into
          // the air with it.
          {
            const v = this.scene.shipViews.get(ev.victim);
            if (v) {
              v.punch(ev.x, (ev.y ?? -2), ev.z, holeRadius('torpedo', 1000), 0.4);
              this.scene.debris.burst(ev.x, 6, ev.z, 3.4, 0.9);
            }
          }
          // A torpedo goes off under the water, so what is seen from a bridge
          // is not the fireball but the column it throws up alongside -- taller
          // than anything a gun makes, which is why one hit ends an argument.
          fx.splash(ev.x, ev.z, 620);
          audio.explosion(1.5, d);
          if (ev.owner === this.shipId) this.hud.ribbon('TORPEDO HIT', 'cit');
          if (ev.victim === this.shipId) {
            this.hud.alert('Torpedo hit');
            // Under her belt and through it: on the board it is a red ring
            // below her waterline, with the sea running in through it.
            this.markHole(ev.x, ev.y ?? -2, ev.z, 'torpedo');
          }
          break;
        case 'fire': if (ev.ship === this.shipId) this.hud.alert('Fire on deck'); break;
        case 'flood': if (ev.ship === this.shipId) { this.hud.alert('Flooding'); audio.alarm(); } break;
        case 'smoke': fx.smokeScreen(ev.x, ev.z); break;
        case 'repair':
          if (ev.ship === this.shipId) {
            // The first call-away shores; the second gets the pumps going.
            this.hud.ribbon(ev.stage >= 2 ? 'PUMPS RUNNING' : 'SHORING UP');
          }
          break;
        case 'sink': {
          // A ship going down goes up. Her fuel, her ready-use ammunition and
          // whatever is left in her magazines all go at once as the sea gets
          // to them, and what is left over her is the same boiling column a
          // magazine leaves -- smaller, because it is the end of a ship rather
          // than the middle of one.
          fx.magazine(ev.x, 5, ev.z, 0.62);
          this.scene.debris.burst(ev.x, 10, ev.z, 7, 1);
          fx.splash(ev.x, ev.z, 700);
          audio.explosion(2.4, 0);
          const victim = this.names.get(ev.ship) || 'A ship';
          const killer = this.names.get(ev.by) || 'Someone';
          const vTeam = this.entities.get(ev.ship)?.team ?? 1;
          this.hud.kill(killer, ev.by === this.shipId ? this.team : 1 - this.team, victim, vTeam);
          if (ev.by === this.shipId) this.hud.ribbon('SHIP DESTROYED', 'cit');
          break;
        }
        case 'detonate': {
          // Her magazine has gone. The one event in the game that is heard
          // wherever you happen to be standing: a ship blowing up is not a
          // local noise, and the column over her is visible from the other
          // end of the map.
          const view = this.scene.shipViews.get(ev.ship);
          const cls = getClass(ev.cls);
          const half = cls.hull.length / 2;
          const sec = SECTIONS.find((q) => q.k === ev.at);
          const z0 = (sec && sec.from !== null ? Math.max(-1, sec.from) : -0.2) * half;
          const z1 = (sec && sec.to !== null ? Math.min(1, sec.to) : 0.2) * half;
          // Where on her it was, in the world.
          let wx = ev.x, wz = ev.z;
          if (view) {
            const at = view.blowOut(z0, z1);
            view.group.updateMatrixWorld(true);
            const p = new THREE.Vector3(0, 6, at.mid);
            view.group.localToWorld(p);
            wx = p.x; wz = p.z;
          }
          const size = 0.7 + cls.hull.length / 200;
          fx.magazine(wx, 8, wz, size);
          this.scene.debris.burst(wx, 14, wz, 9 + cls.hull.length / 26, 1);
          fx.splash(wx, wz, 900);
          this.shake = Math.max(this.shake, ev.ship === this.shipId ? 1.6 : 0.9);
          // Heard everywhere. Not faded with range like everything else --
          // that is the point of it.
          audio.explosion(3.4, 0);
          const who = this.names.get(ev.ship) || 'A ship';
          this.hud.alert(ev.ship === this.shipId
            ? 'Magazine detonation' : `${who}: magazine`);
          break;
        }
        case 'cook': {
          // A fire nobody went to has found something. Not a magazine -- the
          // ship is still there afterwards -- but it takes the deck out where
          // it happened and throws the fire about.
          const view = this.scene.shipViews.get(ev.ship);
          const cls = getClass(ev.cls);
          let wx = ev.x, wy = 10, wz = ev.z;
          if (view) {
            const sec = SECTIONS.find((q) => q.k === ev.at);
            const half = cls.hull.length / 2;
            const lz = sec && sec.from !== null
              ? ((Math.max(-1, sec.from) + Math.min(1, sec.to)) / 2) * half : 0;
            view.group.updateMatrixWorld(true);
            const q = new THREE.Vector3(0, 8, lz);
            view.group.localToWorld(q);
            wx = q.x; wy = q.y; wz = q.z;
            view.punch(wx, wy, wz, holeRadius('he', 200), 0.4, 1.4);
          }
          fx.explosion(wx, wy + 2, wz, 2.2);
          this.scene.debris.burst(wx, wy + 3, wz, 4.5, 0.8);
          audio.explosion(1.7, this.distanceFade(wx, wz));
          this.shake = Math.max(this.shake, ev.ship === this.shipId ? 0.9 : 0.35);
          if (ev.ship === this.shipId) this.hud.alert('Fire reached the ready-use');
          break;
        }
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
          //
          // It should almost never come to that now: she joins her flight a
          // few seconds after she is off the bow and is aboard again long
          // before the next one is ranged. See flyLaunched.
          this.recallDeckPlane(v);
          v.group.userData.launch?.(this.time);
          break;
        }
        case 'airborne': {
          // Which flight the aeroplane that has just gone down the deck
          // became. The simulation says so, because it is the only thing that
          // knows: the client used to work it out by taking whichever of the
          // carrier's flights was youngest, and the answer changed under it
          // every time another aeroplane went.
          const v = this.scene.shipViews.get(ev.ship);
          const deck = v && v.group.userData.deck;
          if (!deck) break;
          deck.flightId = ev.i;
          // Her wheels have left the planking. She joins the queue for a model
          // to be handed to her; flyLaunched does the handing, on whichever
          // frame the evolution's own clock says she is off. The two clocks
          // are within a frame of each other but either can be first, and the
          // order for the next aeroplane arrives in the same breath as this
          // one -- so the queue, rather than a single slot that the next order
          // overwrites before anybody has looked at it.
          if (deck.pending) deck.pending.push(ev.i);
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
        case 'deckCrash': {
          // An aeroplane at eighty knots on a flight deck with a hole in it.
          // She goes into it, and there is a fire on the deck where she went.
          const near = this.distanceFade(ev.x, ev.z);
          fx.explosion(ev.x, 20, ev.z, 1.6);
          fx.debris(ev.x, 20, ev.z, 20);
          if (near < 0.9) audio.explosion(1.2, near);
          if (ev.ship === this.shipId) this.hud.alert('Crash on deck — flight deck out');
          break;
        }
        case 'planeDown': {
          // One machine out of a formation that flies on. She goes down where
          // she was actually flying rather than at her leader's position, and
          // she goes down the way she was lost: shot to pieces, burning, out of
          // fuel, or crippled and turning back with a dead engine.
          const at = slotAt(ev.slot || 0, ev.h || 0);
          const from = (this.planesNow || []).find((q) => q.i === ev.i);
          this.oneDown({
            x: ev.x + at.x, y: (ev.y || 220) + at.y, z: ev.z + at.z,
            heading: ev.h || 0, why: ev.why,
            role: (from && from.r) || 'torpedo', kind: typeOf(from && from.k, (from && from.r) || 'torpedo'),
          });
          if (ev.team === this.team && ev.why !== 'crippled') this.hud.alert('Aircraft down');
          break;
        }
        case 'planeFire':
          if (ev.team === this.team) this.hud.alert('Aircraft on fire');
          break;
        case 'planeCrippled':
          if (ev.team === this.team) this.hud.alert('Aircraft hit — turning back');
          break;
        case 'planesLost':
          // Not a recovery: she is not coming home, so nobody is to look for
          // her on the deck. See comingHome.
          this.lostFlights.add(ev.i);
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

  /**
   * The action is over.
   *
   * It used to take the player home three seconds later whether or not he had
   * finished looking: a fleet action ends with a burning ship going down and
   * that is worth watching, and a curtain that drops on its own is the one
   * thing that cannot be waited out. So nothing happens now except that the
   * key appears in the corner, and the battle goes on being drawn -- the sea,
   * the wrecks, the smoke -- until it is pressed.
   */
  onResult(msg) {
    this.result = msg;
    this.hud.alert(msg.winner === this.team ? 'Victory' : msg.winner < 0 ? 'Draw' : 'Defeat');
    this.hud.showPortKey(true);
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
        if (this.watching || this.roam) this.cameraHome(); else this.leave();
        break;
      // Back to your own bridge from wherever the camera has been walked to.
      case 'KeyH': this.cameraHome(); break;
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
    // Picking a mark off the chart takes the camera off the salvo it was
    // riding: the two are the same camera, and the mark you just tapped is
    // what you asked for.
    if (this.shellCam) {
      this.shellCam = false;
      this.shellFrom = 0;
      this.shellHold = null;
      this.shellWas = null;
      this.hud.setShellCam(true, false);
    }
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
    // Picking a mark off the chart recentres on it: whatever the camera had
    // been walked to, it is on this now.
    // Picking anything off the plot is how you come out of the free camera.
    if (hit) this.freeCamera(false);
    if (hit) this.roam = null;
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
    if (this.watching.kind === 'shell') {
      // The round itself, wherever she has got to. Small and close, so the
      // orbit sits right on her and the sea goes past underneath.
      const sh = (this.shellsNow || []).find((x) => x.i === this.watching.id);
      // Close enough to see a sixteen-inch round for what it is, and the
      // wheel stands it off from there.
      if (sh) return { x: sh.x, y: sh.y, z: sh.z, span: 12, eye: 1.4, close: true };
      // She has gone in. Hold on the spot for a moment, which is where the
      // splash is: a camera that snaps away at the instant of the fall of shot
      // shows you everything except the thing you were watching for.
      const hold = this.shellHold;
      if (hold && hold.t > 0) {
        return { x: hold.x, y: Math.max(hold.y, 4), z: hold.z, span: 50, eye: 3, close: true };
      }
      // Nothing in the air. Wait over the ship until she fires again.
      const from = snap.ships.find((x) => x.i === this.watching.ship);
      if (!from) return null;
      const fc = getClass(from.c);
      return {
        x: from.x, y: this.scene.ocean.heightAt(from.x, from.z) * 0.5, z: from.z,
        span: fc.hull.length, eye: 14 + fc.hull.superstructure * 12,
      };
    }
    if (this.watching.kind === 'plane') {
      // Riding one of your own. She is the carrier's own model for the whole
      // of it -- waiting in the hangar, riding the lift, down the deck, out to
      // the target and back down the glide -- so the camera asks the model
      // where it is and never anything else. Two sources for one aeroplane is
      // what made this jump: the model was interpolated and the camera was
      // reading raw snapshots, so they disagreed ten times a second.
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
      // Which way she is heading, so anything standing off her knows which
      // way round she is.
      h: s.h,
    };
  }

  /**
   * Whose rounds the shell camera follows.
   *
   * The ship you are watching, if you are watching a ship; your own bridge
   * otherwise. It is settled when the key is pressed and held after that, so
   * the camera going off to ride a shell does not then decide it is following
   * the shell's own shells.
   */
  shellSource() {
    if (this.watching && this.watching.kind === 'ship') return this.watching.id;
    return this.shipId;
  }

  /** Ride the salvo, or come back off it. */
  toggleShellCam() {
    if (this.shellCam) {
      this.shellCam = false;
      this.shellFrom = 0;
      this.shellHold = null;
      // Back to whatever the camera was looking at before.
      this.watching = this.shellWas;
      this.shellWas = null;
      this.hud.setWatching(this.watching);
      this.hud.setWatchBanner(this.watching, this.watchPov);
      this.hud.setShellCam(true, false);
      audio.click();
      return;
    }
    const from = this.shellSource();
    if (!from) return;
    this.shellCam = true;
    this.shellFrom = from;
    this.shellWas = this.watching && this.watching.kind !== 'shell' ? this.watching : null;
    this.shellRiding = 0;
    this.shellHold = null;
    // Standing off the round rather than sitting in her: the whole point is
    // to watch her fly, and the drag walks the orbit round her as it does
    // round anything else the camera is sent to.
    this.watchPov = false;
    audio.click();
  }

  /**
   * Ride the rounds this ship is firing.
   *
   * She latches on to one shell and stays with it: down the whole arc, through
   * the fall of shot, and then on to the next round out of the same ship. When
   * there is nothing in the air she waits over the ship herself, so the camera
   * never jumps home between salvoes and never has to be pressed again.
   */
  stepShellCam(dt) {
    if (!this.shellCam) return;
    const snap = this.snapshots[this.snapshots.length - 1];
    const ship = snap && snap.ships.find((q) => q.i === this.shellFrom && q.a);
    if (!ship) { this.toggleShellCam(); return; }
    const mine = (this.shellsNow || []).filter((q) => q.o === this.shellFrom);
    let riding = mine.find((q) => q.i === this.shellRiding);
    if (!riding) {
      // The one she has just fired: the highest id out of this ship is the
      // newest round in the air.
      riding = mine.reduce((best, q) => (!best || q.i > best.i ? q : best), null);
      this.shellRiding = riding ? riding.i : 0;
    }
    if (riding) {
      // Where she was, so that when she goes in the camera holds on the splash
      // rather than snapping away from it.
      this.shellHold = { x: riding.x, y: riding.y, z: riding.z, t: 1.5 };
    } else if (this.shellHold) {
      this.shellHold.t -= dt;
      if (this.shellHold.t <= 0) this.shellHold = null;
    }
    const was = this.watching;
    this.watching = {
      kind: 'shell', id: this.shellRiding, ship: this.shellFrom,
      // Named for the ship, not her captain: what you are riding is the
      // Iowa's salvo, and `n` on a snapshot is the man on her bridge.
      name: getClass(ship.c).name,
    };
    this.watchPov = false;
    if (!was || was.kind !== 'shell') {
      this.hud.setWatching(this.watching);
      this.hud.setWatchBanner(this.watching, false);
    }
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
    const role = pl.r || 'torpedo';
    const kind = typeOf(pl.k, role);
    const aero = AERO[kind] || AERO.avenger;
    this.flight = {
      id: pl.i,
      role,
      // Which machine she is, so the tracer leaves the guns this type has and
      // leaves them at the right calibre.
      kind,
      calibre: GUN_CALIBRE[kind] ?? 12.7,
      // And what is on her rack, which is what the drop key is for. A fighter
      // has nothing on hers: her guns are her weapon.
      load: LOAD[role] || null,
      pilot: new Pilot(aero, {
        x: pl.x, y: this.planeHeight(pl), z: pl.z, heading: pl.h,
        speed: aero.vMax * 0.72,
      }),
      // What she is carrying, and how long since the last word to the server.
      armed: role !== 'fighter',
      // How long since the drop was asked for and not yet answered.
      asked: 0,
      sent: 0,
      guns: 0,
      tracer: 0,
    };

    this.watching = null;
    this.hud.setWatching(null);
    this.hud.setWatchBanner(null);
    this.hud.setFlyOffer(false);
    this.hud.setCockpit(true);
    this.hud.setArmament(this.flight.load && this.flight.load.key);
    if (this.mapBig) this.toggleMap(false);
    audio.click();
  }

  /**
   * Let go of what she is carrying.
   *
   * A torpedo bomber drops torpedoes and a dive bomber drops bombs, and which
   * of those happens is settled by what the flight is carrying rather than by
   * one key that means "do something". A fighter never gets here: she has no
   * rack and no key, and her guns are her weapon.
   *
   * The reasons a drop can come to nothing are said out loud. Pressing a key
   * and having the game do nothing at all, with no word about why, is the
   * thing this is here to stop.
   */
  letGo() {
    const f = this.flight;
    if (!f) return;
    if (!f.load) { this.hud.alert('No bombs or torpedoes aboard'); return; }
    if (!f.armed) { this.hud.alert(`Her ${f.load.name} are gone`); return; }
    // Near enough to be dropping at something. Worked out here rather than
    // waited for from the server, so the answer is on the screen the instant
    // the key goes down.
    const snap = this.snapshots[this.snapshots.length - 1];
    const p = f.pilot;
    let near = Infinity;
    for (const s of ((snap && snap.ships) || [])) {
      if (!s.a || s.tm === this.team) continue;
      near = Math.min(near, Math.hypot(s.x - p.x, s.z - p.z));
    }
    if (near > f.load.near) { this.hud.alert('Nothing in range — press home'); return; }
    // Asked for, not done. The key goes dead while the answer is in flight so
    // a fast thumb cannot drop twice, and what is said afterwards is what
    // actually happened: "torpedoes away" when the simulation says the fish
    // are in the water, and the reason when it says they are not. Saying it on
    // the key press told the pilot his torpedoes had gone whether or not
    // anything had left the aeroplane.
    if (f.asked > 0) return;
    f.asked = 1.2;
    this.net.send({ t: 'drop', i: f.id });
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
    // What is left on her rack, off the simulation. The moment it says she is
    // empty and she was not before, her ordnance is away and the pilot is told
    // so -- which is the one word in the cockpit that has to be true.
    if (pl.d && f.armed) {
      f.armed = false;
      f.asked = 0;
      if (f.load) this.hud.alert(f.load.away);
    }
    f.asked = Math.max(0, f.asked - dt);

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
        this.wingGuns(f, p);
      }
      if (f.guns > 0.15) {
        this.net.send({ t: 'gun', i: f.id, dt: Math.round(f.guns * 100) / 100 });
        f.guns = 0;
      }
    } else { f.guns = 0; f.tracer = 0; }

    // The sight goes red when there is something under it, which is the whole
    // use of a fixed ring: it says when the aeroplane is pointed at the thing
    // rather than near it.
    this.hud.setSightHot(this.sightOn(f, p, snap));

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
   * Is anything under the sight?
   *
   * Her own guns' cone, out to the range they reach: about nine degrees either
   * side, the same figure the simulation uses to decide whether a burst hits
   * anything. Aeroplanes first, because that is what a fighter is looking for.
   */
  sightOn(f, p, snap) {
    if (!snap) return false;
    const RANGE = 700;
    const CONE = 0.16;
    const sn = Math.sin(p.heading);
    const cs = Math.cos(p.heading);
    const under = (x, z) => {
      const dx = x - p.x;
      const dz = z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > RANGE || d < 1) return false;
      // How far off the nose she lies, as the cosine of the angle between the
      // bearing and where the aeroplane is pointed.
      return (dx * sn + dz * cs) / d > Math.cos(CONE);
    };
    for (const q of (snap.planes || [])) {
      if (q.tm === this.team || q.i === f.id) continue;
      if (under(q.x, q.z)) return true;
    }
    for (const q of snap.ships) {
      if (!q.a || q.tm === this.team) continue;
      if (under(q.x, q.z)) return true;
    }
    return false;
  }

  /**
   * A burst, out of the guns she actually has.
   *
   * A fighter's guns are in her wings -- four of them in a Wildcat, two either
   * side of the fuselage -- and until now every aeroplane in the game fired one
   * stream out of the middle of her nose, which is a weapon no naval aeroplane
   * of the war carried. The muzzles come off her own model (see `gunsOf`), so
   * a Wildcat's fire leaves four points spread six metres across her wings, a
   * Dauntless's leaves the two troughs in her cowling, and an Arado's leaves
   * her two twenty-millimetre and the MG 17 over her engine.
   *
   * They are harmonised: every barrel is laid to cross the sight line at the
   * range the armourers set them to, which is why fire from a fighter's wings
   * converges instead of running out in parallel lines.
   */
  wingGuns(f, p) {
    // Down the bore, which lies along her nose -- not along her flight path.
    // At low speed those are ten degrees apart, and a fighter hanging on her
    // propeller shoots where she is pointed.
    const aim = p.attitude;
    const bank = p.bank || 0;
    const cp = Math.cos(aim);
    const R = 620;
    // Where the guns are laid to cross: about 250 yards, which is what a
    // fighter's were harmonised at.
    const CONVERGE = 230;
    const q = this.gunQuat || (this.gunQuat = new THREE.Quaternion());
    const e = this.gunEuler || (this.gunEuler = new THREE.Euler(0, 0, 0, 'YXZ'));
    const v = this.gunVec || (this.gunVec = new THREE.Vector3());
    e.set(-aim, p.heading, -bank);
    q.setFromEuler(e);
    // The point every barrel is pointed at, and the point they are all fired
    // through at the far end.
    const nose = {
      x: p.x + Math.sin(p.heading) * cp * CONVERGE,
      y: p.y + Math.sin(aim) * CONVERGE,
      z: p.z + Math.cos(p.heading) * cp * CONVERGE,
    };
    // Through the harmonisation point and on: the line from the muzzle to
    // where the guns cross, run out to where the tracer dies.
    const k = R / CONVERGE;
    for (const m of gunsOf(f.kind)) {
      v.set(m[0], m[1], m[2]).applyQuaternion(q);
      const mx = p.x + v.x;
      const my = p.y + v.y;
      const mz = p.z + v.z;
      this.scene.flak.fire(
        mx, my, mz,
        mx + (nose.x - mx) * k, my + (nose.y - my) * k, mz + (nose.z - mz) * k,
        f.calibre, 8, this.scene.effects,
      );
    }
  }

  /**
   * Ride with the aeroplane.
   *
   * Puts the camera on the ready aircraft where she stands -- on the after lift,
   * in the hangar if the lift is down -- and keeps it on her through the whole
   * launch and out to the target. Press it again to come back to your ship.
   */
  togglePilotView() {
    if (this.watching && this.watching.kind === 'plane') {
      this.watching = null;
      this.hud.setWatching(null);
      this.hud.setWatchBanner(null);
      this.hud.setFlyOffer(false);
      return;
    }
    // Ride an aeroplane that is actually flying.
    //
    // It used to put the camera on the carrier's own deck model whatever that
    // model happened to be doing -- and between sorties she is struck below in
    // the hangar with her wings folded, so what a captain got for "pilot view"
    // was a close-up of a parked aeroplane apparently levitating in the dark.
    const snap = this.snapshots[this.snapshots.length - 1];
    const mine = ((snap && snap.planes) || []).filter((p) => p.o === this.shipId);
    if (!mine.length) {
      this.hud.alert('No aircraft in the air');
      return;
    }
    // The youngest flight she has put up: the one that has just gone.
    const pick = mine.reduce((a, q) => (a === null || q.a < a.a ? q : a), null);
    this.freeCamera(false);
    this.watching = {
      kind: 'plane', carrier: null, id: pick.i,
      // What she is, not what she has been sent to do. A cruiser's Arado has
      // the role of a dive bomber because that is the nearest job on the
      // datasheet, and calling her one on the screen is wrong twice over.
      name: `${FLIGHT_NAME[typeOf(pick.k, pick.r)] || 'her aircraft'} — drag to look round them`,
    };
    this.watchPov = false;
    this.watchYaw = 2.5;              // over her port quarter, looking forward
    this.watchEl = 0.24;              // a little above her, not edge-on
    // Multiples of her length. Ten metres put the camera inside the wing: an
    // aeroplane needs standing off far enough that she reads as an aeroplane.
    this.watchDist = 1.55;
    this.watchDistNow = 1.55;
    this.hud.setWatching?.(this.watching);
    this.hud.setWatchBanner?.(this.watching, false);
    this.hud.setFlyOffer(this.canTake());
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

  /**
   * Walk the camera over the battlefield.
   *
   * The view is not nailed to a hull. A drag with two fingers -- or shift and
   * the mouse -- takes it off whatever it was on and moves it across the sea,
   * as far as you like, and it stays where it is put. Tapping any mark on the
   * chart brings it back and recentres it on that.
   */
  /**
   * The free camera: on, off, and the only way in.
   *
   * It used to start the moment anybody shift-dragged or put two fingers on
   * the glass, which meant the camera wandered off its ship by accident and
   * there was nothing on screen to say it had. It is a thing you ask for now,
   * it shows that it is on, and picking anything off the plot puts it back.
   */
  freeCamera(on = !this.freeCam) {
    const want = !!on;
    if (want === !!this.freeCam) return;
    this.freeCam = want;
    const key = document.getElementById('free-cam');
    if (key) key.setAttribute('aria-pressed', want ? 'true' : 'false');
    if (want) {
      // She starts wherever the camera is already looking, so turning her on
      // does not move the picture.
      const here = this.focusPoint();
      this.roam = { x: here.x, z: here.z };
      if (this.watching) this.lookAt(null);
      this.hud.setWatchBanner({ name: 'the battlefield' }, false);
      this.hud.alert('Free camera — pick anything on the plot to come back');
    } else {
      this.roam = null;
      if (!this.watching) this.hud.setWatchBanner(null);
    }
    audio.click();
  }

  panCamera(dx, dy, dt) {
    // The camera walks whenever it is asked to. It used to be a mode with a
    // key of its own: the view was pinned to a hull until somebody found the
    // free-camera key, which meant a captain who wanted to look at his own
    // ship's side could not, and one who wanted to look at anything at all
    // after the guns stopped could not either.
    //
    // A two-fingered drag -- or shift and the mouse -- is a request to move
    // the view, and that is the whole of it. Except at a gun, where both hands
    // are on the training gear.
    if (this.gun || this.flight) return;
    if (!dx && !dy) return;
    const here = this.focusPoint();
    // Walking the view off a ship is how you let go of her: the camera starts
    // from where it already was, so nothing jumps, and from then on it is
    // yours rather than hers.
    if (this.watching) {
      this.roam = { x: here.x, z: here.z };
      this.lookAt(null);
    }
    if (!this.roam) this.roam = { x: here.x, z: here.z };
    // In the camera's own frame, and scaled by how far off it is standing:
    // panning a mile out has to move a mile, and panning alongside a ship has
    // to move a few metres.
    const reach = Math.max(60, this.camDistance) * 0.0022;
    const sn = Math.sin(this.yaw);
    const cs = Math.cos(this.yaw);
    // Screen right is the camera's starboard beam; screen up is away from it.
    this.roam.x += (-dx * cs - dy * sn) * reach;
    this.roam.z += (dx * sn - dy * cs) * reach;
    const H = (this.scene.world && this.scene.world.half) || 20000;
    this.roam.x = clamp(this.roam.x, -H, H);
    this.roam.z = clamp(this.roam.z, -H, H);
  }

  /** Where the camera is looking: a mark, a point it was walked to, or you. */
  focusPoint() {
    const w = this.watchPoint();
    if (w) return w;
    if (this.roam) {
      return { x: this.roam.x, y: this.scene.ocean.heightAt(this.roam.x, this.roam.z) * 0.5,
        z: this.roam.z, span: 200, eye: 12, roaming: true };
    }
    const ls = this.localShip;
    return { x: ls.x, y: this.scene.ocean.heightAt(ls.x, ls.z) * 0.5, z: ls.z,
      span: this.cls.hull.length, eye: 14 + this.cls.hull.superstructure * 12 };
  }

  /** Bring the camera home to your own bridge. */
  cameraHome() {
    this.freeCamera(false);
    this.roam = null;
    if (this.watching) this.lookAt(null);
    else this.hud.setWatchBanner(null);
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
    // Standing at a gun, the drag lays the gun; it does not also swing the
    // ship's own fire control. This block used to run first every frame and
    // take the movement before the sight could ask for it, so a captain at a
    // gun could not move the camera at all.
    if (!this.watching && !this.gun) {
      const m = this.input.takeMouse();
      const zoom = this.scoped ? 0.35 : 1;
      this.yaw = wrapAngle(this.yaw + m.x * zoom);
      // Far enough either way that the orbit can be walked from overhead to
      // under her keel. The old stop at 0.55 was about thirty degrees of
      // looking down, which is nowhere near the water.
      this.pitch = clamp(this.pitch + m.y * zoom, -0.87, 1.16);
      this.updateAimPoint();
    }

    // And the pan, which walks the whole view across the battlefield. It works
    // whether you are on your own bridge or watching somebody else -- walking
    // away from a contact is how you let go of it.
    const pan = this.input.takePan();
    this.panCamera(pan.x, pan.y, dt);
    // The arrow keys do the same for anyone who would rather not hold shift.
    const ARROW = 340 * dt;
    const kx = (this.input.down('ArrowRight') ? 1 : 0) - (this.input.down('ArrowLeft') ? 1 : 0);
    const ky = (this.input.down('ArrowDown') ? 1 : 0) - (this.input.down('ArrowUp') ? 1 : 0);
    if (kx || ky) this.panCamera(-kx * ARROW, -ky * ARROW, dt);

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
    // After the entities, because the camera rides an interpolated round and
    // syncEntities is what interpolates them.
    this.stepShellCam(dt);
    // The key is there whenever there is a ship whose guns you could follow,
    // and lit while the camera is on a round. Offered only from the bridge --
    // there is nothing to ride from inside an aeroplane.
    this.hud.setShellCam(!this.flight && !!this.shellSource(), this.shellCam);
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
    this.hud.setTarget(readTarget(shown, snap, ls));
    // The gun being laid by hand, if there is one: where the layer is holding
    // goes up the wire ten times a second, which is often enough for the
    // training gear to follow him and rare enough not to be a stream.
    if (this.gun) {
      const at = this.gunAimPoint();
      if (at) {
        this.gunTell = (this.gunTell || 0) - dt;
        if (this.gunTell <= 0) {
          this.gunTell = 0.1;
          this.net.send({
            t: 'lay', ship: this.conned(),
            x: Math.round(at.x), z: Math.round(at.z), y: Math.round(at.y),
          });
        }
        this.hud.setGunReading(this.gun, at, ownForHud);
      }
    }
    // The board only turns while it is being looked at.
    if (this.armsBoard && this.hud.panel === 'arms' && this.hud.armsShown) {
      // Live, because a gun's condition is a thing that changes while you are
      // looking at it: a turret goes out under a shell and the marker for that
      // turret and no other turns red where the captain is watching.
      this.armsBoard.setMountCondition(this.mountCondition(this.armsRow));
      this.armsBoard.update(null, dt);
    }
    if (this.board && this.hud.panel === 'dmg') {
      if (shown) this.board.build(shown.c);
      this.board.setWater(shown?.wt);
      // What is burning, and where the sea is running -- in through her
      // plating, or back out of it once the pumps are going.
      this.board.setFires(shown?.fr);
      this.board.setFlow(shown?.fw, shown?.fs);
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
      // How she is floating, on top of what the sea is doing to her: the water
      // inside her has put her deeper, laid her over to one side, and pulled
      // one end of her down. All three come off the wire and none of them is
      // an animation -- they are what her flooding works out to.
      view.setFloating(s.fo);
      view.group.position.y = sea.heave - 1.0 - view.sinkY;
      view.group.rotation.x = sea.pitch + view.trimBy;
      view.group.rotation.z = sea.roll - view.heelBy;

      // Every ship's guns are laid by her own gunnery officer now, ours
      // included, so the bearings all come off the wire.
      const turrets = s.tu;
      // A turret whose compartment has been shot out of the ship is finished:
      // it sits there canted over on its roller path, and the bearing on the
      // wire is nobody's any more.
      if (turrets) {
        turrets.forEach((ang, i) => {
          const t = view.turrets[i];
          if (t && t.userData.laid !== false) t.rotation.y = ang;
        });
      }
      // And everything else that trains: her secondary mountings and her
      // tubes off the snapshot, her light battery off the aircraft overhead.
      view.layMounts(s.se, s.sl, s.tt, this.planesNow, dt, s.te);
      // And her screws, at the rate her speed sets.
      view.spinScrews(s.v, dt);
      // Her way, so anything blown off her leaves with it rather than
      // stopping dead in the air where it was standing.
      view.speedNow = speed;

      // What is left of her, compartment by compartment. Nothing is torn out
      // of her here and there is no flash: a length of hull that has been shot
      // to pieces looks that way because every shell that did it took a piece
      // of her plating with it, one hit at a time -- see shellDamage. All this
      // does now is let go of what was standing on a compartment that no
      // longer has anything left holding it. See setCondition.
      view.setCondition(s.sk);

      // Anything on her that works itself -- a carrier's lifts, so far.
      view.group.userData.step?.(this.time);

      // A ship going down does not leave a wake. She has stopped making way
      // through the water and started settling into it, and a Kelvin pattern
      // streaming away from a hull that is standing on end is nonsense -- so
      // the moment she founders the track stops being laid and what she left
      // behind her goes out of the water.
      const foundering = !s.a || view.going;
      if (foundering) view.wake.stop(dt);
      else view.wake.update(dt, x, z, h, speed);
      const load = clamp(Math.abs(speed) / cls.maxSpeed, 0, 1);
      // A ship that has stopped floating is not simply switched off. She is
      // still there, going down the way her water and her wreckage make her
      // go, and she is drawn until she is well under.
      if (!s.a && !view.going) view.founder({ heel: view.heelBy, trim: view.trimBy, broke: s.bk });
      if (view.going) {
        view.group.visible = view.stepFounder(dt);
      } else {
        view.group.visible = !!s.a;
      }
      view.marker.visible = !isSelf && this.camMode === 'tactical';

      // Funnel smoke and burning damage.
      view.smokeTimer -= dt;
      if (view.smokeTimer <= 0 && s.a && getClass(s.c).type !== 'CV') {
        view.smokeTimer = 0.25 + Math.random() * 0.3;
        const l = getClass(s.c).hull.length;
        this.scene.effects.funnelSmoke(x + Math.sin(h) * l * 0.02, 26, z + Math.cos(h) * l * 0.02, load);
      }
      // Fires burn where they are burning. A fire is a thing in a compartment
      // now, and the wire says which compartments are alight and how hard, so
      // a hit forward puts a fire forward instead of somewhere on the ship in
      // general -- and a compartment that is well alight looks it.
      // And once she is under, nothing is burning. A fire needs a deck to
      // stand on: a wreck still on the surface burns, and the instant the last
      // of her goes down the flames go with her rather than being left alight
      // on the open sea.
      if (s.fr && (s.a || view.group.visible)) {
        view.fireTimer -= dt;
        if (view.fireTimer <= 0) {
          view.fireTimer = 0.10;
          const l = getClass(s.c).hull.length;
          for (let i = 0; i < SECTIONS.length; i++) {
            const heat = (s.fr[i] || 0) / 9;
            if (heat < 0.06) continue;
            const sec = SECTIONS[i];
            // The superstructure burns above the deck and amidships; a
            // compartment burns over its own length of her.
            const mid = sec.from === null ? 0.05 : (sec.from + sec.to) / 2;
            const spread = sec.from === null ? 0.12 : (sec.to - sec.from) * 0.42;
            const off = (mid + (Math.random() - 0.5) * spread * 2) * l * 0.5;
            const up = sec.from === null ? 20 : 9;
            this.scene.effects.fire(x + Math.sin(h) * off + (Math.random() - 0.5) * 6,
              up, z + Math.cos(h) * off + (Math.random() - 0.5) * 6, heat);
            // And the flame itself, which is geometry rather than a picture:
            // it stands on her deck over the compartment that is alight and
            // stays where it is when the camera walks round her.
            this.scene.flames.at(`${s.i}:${i}`,
              x + Math.sin(h) * ((mid) * l * 0.5), up - 1,
              z + Math.cos(h) * ((mid) * l * 0.5),
              heat, Math.max(6, spread * l));
            // And it blackens what is standing in it. Slowly, and for as long
            // as it burns, so a compartment that has been alight for two
            // minutes leaves the ship black there when it is out -- and it
            // stays black, because soot does.
            view.scorchAt(0, up - 3, off, 9 + heat * 7, heat * dt * 0.16);
          }
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
          this.scene.flames.at(`bat:${g.i}`, g.x, g.y + 2, g.z, 0.6, view.span * 0.5);
        }
      }
    }
    for (const [id] of this.scene.batteryViews) {
      if (!gunsSeen.has(id)) this.scene.removeBatteryView(id);
    }

    // Shells, torpedoes and aircraft as instanced batches.
    const dummy = this.scene.dummy;
    let n = 0;
    // Kept as well as drawn: the shell camera rides one of these, and it has
    // to ride the same interpolated round the screen is showing rather than
    // the raw snapshot position five times a second behind it.
    const shells = [];
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
      shells.push({ i: sh.i, x, y, z, c: sh.c, o: sh.o, tm: sh.tm });
    }
    this.shellsNow = shells;
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
        // Her height and how she is going through the air, blended like the
        // rest of her. They used not to be, so a squadron slid smoothly across
        // the sea and stepped down the sky five times a second.
        y: lerp(pl.y ?? 220, nx.y ?? 220, t),
        vy: lerp(pl.vy || 0, nx.vy || 0, t),
        s: lerp(pl.s || 0, nx.s || 0, t),
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
      // Which machine she is, and what her wing is: a cruiser flies float
      // planes and a carrier flies three types, and both her bank and her
      // attitude depend on which.
      const kind = typeOf(pl.k, pl.r || 'torpedo');
      const a = AERO[kind] || AERO.avenger;
      const gs = Math.max(12, pl.s || a.vMax * 0.7);
      const want = clamp(Math.atan2(gs * (pl.b || 0), 9.81), -1.15, 1.15);
      const held = this.planeTurn.get(pl.i);
      const bank = held === undefined ? want
        : held + (want - held) * (1 - Math.pow(0.02, dt));
      this.planeTurn.set(pl.i, bank);
      // Her attitude, which is not the direction she is travelling.
      //
      // The flight path is her rate of climb over her speed across the ground.
      // What you see of her is that plus the angle of attack her wing is
      // working at, which is several degrees at cruise and a good deal more
      // heavy and slow -- so a loaded torpedo bomber climbing out hangs on her
      // propeller and a dive bomber pushed over points straight down her own
      // path, as they should.
      //
      // Both of those used to be guesses: the rate of climb over a fixed
      // seventy-eight metres a second, and no angle of attack at all.
      const pitch = flightAttitude(a, gs, pl.vy || 0,
        1 / Math.max(0.35, Math.cos(bank)));
      // The one aeroplane a carrier put in the air is drawn by the deck
      // handover instead -- she is the model that went down the deck -- so her
      // slot in the formation is left empty rather than filled twice.
      // Nothing of a flight is drawn anywhere but here, so no slot is ever
      // left empty in the formation.
      const skip = -1;
      // The one the player is flying is drawn where the flight model says she
      // is, at the attitude the stick has her in -- not at the position the
      // last snapshot happened to carry.
      const mine = this.flight && this.flight.id === pl.i ? this.flight.pilot : null;
      if (mine) {
        this.scene.flights.add(pl.r || 'torpedo', mine.x, mine.y, mine.z,
          mine.heading, mine.bank, mine.attitude, Math.max(1, pl.n || 1), skip, kind);
      } else {
        this.scene.flights.add(pl.r || 'torpedo', pl.x, this.planeHeight(pl), pl.z,
          pl.h, bank, pitch, Math.max(1, pl.n || 1), skip, kind);
      }
      // The ones that have been hit and are still flying.
      //
      // A formation coming out of the flak with one of its number streaming
      // smoke is the whole of what a close-range battery looks like from the
      // ship that owns it, and there was nothing to draw before: a flight was
      // one hit-point bar, so every machine in it was in identical condition
      // by definition and none of them could be the one that had been hit.
      if (pl.sm > 0) this.smokeFlight(pl, dt);
    }
    for (const w of this.wrecks) {
      this.scene.flights.one(w.role, w.x, w.y, w.z, w.heading, w.bank, w.pitch,
        0, w.kind);
    }
    this.scene.flights.end();
    // Forget the flights that are no longer up, so the map does not grow.
    for (const id of [...this.planeTurn.keys()]) {
      if (!planes.some((q) => q.i === id)) {
        this.planeTurn.delete(id);
        this.planeSmoke.delete(id);
      }
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
        role, kind: typeOf(pl && pl.k, role), x, y: y0, z,
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
   * Smoke off the machines of a flight that have been hit.
   *
   * Off the slots they are actually flying in, so what streams is the second
   * aeroplane of the second section rather than a smudge at the leader's tail.
   */
  smokeFlight(pl, dt) {
    const at = this.planeSmoke.get(pl.i) || 0;
    const now = at - dt;
    if (now > 0) { this.planeSmoke.set(pl.i, now); return; }
    this.planeSmoke.set(pl.i, 0.09);
    const y = this.planeHeight(pl);
    const n = Math.min(pl.sm, Math.max(1, pl.n || 1));
    for (let i = 0; i < n; i++) {
      // The hurt ones are the last in the formation: a leader whose machine is
      // shot about hands the lead over.
      const s = slotAt(Math.max(0, (pl.n || 1) - 1 - i), pl.h || 0);
      this.scene.effects.wreckSmoke(pl.x + s.x, y + s.y, pl.z + s.z);
    }
  }

  /**
   * One aeroplane out of a formation, on her way down.
   *
   * The flight goes on without her. Which of the four things happened to her
   * decides what it looks like: a machine shot to pieces breaks up, one that
   * is burning goes down trailing fire, one out of fuel glides down quietly,
   * and one crippled turns away with a dead engine and smoke coming off her.
   */
  oneDown(o) {
    const fx = this.scene.effects;
    if (o.why === 'shot' && Math.random() < 0.4) {
      // Blown apart in the air. There is nothing left to fall.
      fx.explosion(o.x, o.y, o.z, 0.8);
      fx.debris(o.x, o.y, o.z, 12);
      const near = this.distanceFade(o.x, o.z);
      if (near < 0.85) audio.explosion(0.65, near);
      return;
    }
    if (this.wrecks.length > 14) this.wrecks.shift();
    // A machine that has been crippled is still flying: she turns away and
    // goes down slowly on what is left of her engine. One that has burned or
    // been shot to pieces is not flying at all.
    const limp = o.why === 'crippled' || o.why === 'dry';
    const sp = limp ? 44 + Math.random() * 14 : 60 + Math.random() * 26;
    this.wrecks.push({
      role: o.role, kind: o.kind, x: o.x, y: o.y, z: o.z,
      vx: Math.sin(o.heading) * sp, vz: Math.cos(o.heading) * sp,
      vy: limp ? -3 - Math.random() * 3 : -5 - Math.random() * 9,
      heading: o.heading, pitch: -0.12,
      bank: (Math.random() < 0.5 ? -1 : 1) * (limp ? 0.2 + Math.random() * 0.4
        : 0.5 + Math.random()),
      spin: (Math.random() - 0.5) * (limp ? 0.5 : 2.6),
      tumble: limp ? 0.1 + Math.random() * 0.3 : 0.5 + Math.random() * 1.4,
      smoke: 0,
      // How much of a trail she leaves: a burning aeroplane is seen a long way
      // off, and one gliding down on an empty tank is very nearly not seen at
      // all.
      trail: o.why === 'fire' ? 1 : o.why === 'dry' ? 0.25 : 0.6,
    });
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
      w.bank = wrapAngle(w.bank + w.tumble * dt);
      // Her nose follows where she is actually going.
      //
      // What is left of an aeroplane has no lift and a great deal of drag, so
      // she weathercocks into her own path -- and that path steepens as she
      // loses her way and keeps her fall, which is why she goes in nearly
      // vertically however level she was when she was hit. Wound down at a
      // fixed rate instead she pointed straight at the sea two seconds after
      // being hit whatever she was actually doing, which is the one thing that
      // makes a falling aeroplane read as a falling marker.
      const track = Math.hypot(w.vx, w.vz);
      w.pitch = weathercock(w.pitch, track, w.vy, dt);
      w.yaw = (w.yaw || 0) + w.spin * dt;
      w.heading = track > 2 ? wrapAngle(Math.atan2(w.vx, w.vz) + w.yaw * 0.35)
        : wrapAngle(w.heading + w.spin * dt);
      w.smoke -= dt;
      if (w.smoke <= 0) {
        // As often as she is worth looking at: a burning machine leaves a
        // column, one gliding down on an empty tank leaves almost nothing.
        w.smoke = 0.055 / Math.max(0.2, w.trail === undefined ? 1 : w.trail);
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
    // She has a height, and the simulation flies her to it. It used to be
    // worked out here from how long she had been up, which meant every
    // aeroplane in the game climbed at the same rate to the same altitude
    // whatever she was and whatever she was doing -- and a dive bomber dived
    // by changing a number nothing else could see.
    return pl.y ?? 220;
  }

  /**
   * The aircraft that have just left the deck.
   *
   * There is nothing to do. The deck run is integrated from the aeroplane's
   * own weight and wing, and the simulation puts her flight into the air at
   * exactly the point that run ends -- see DECK_RUN_OUT, which is measured off
   * the profile rather than guessed. So the aeroplane the formation starts
   * drawing is in the place, and at the attitude, of the aeroplane that just
   * went off the bow, and the hand-over is invisible without anybody flying
   * anything anywhere.
   *
   * It was not always so. There was a copy of the deck model that flew out to
   * join its flight, and every bug in this area for three revisions came from
   * it: it was handed the wrong flight, or the flight it wanted had not
   * reached the client yet and it turned round and flew back onto the deck, or
   * it never closed and hung about behind the formation for the whole sortie.
   * The two positions agree by construction now, and there is a check that
   * says so, so none of that machinery is needed.
   */
  flyLaunched(planes, dt) {
    // The deck is free again the moment her wheels are off it.
    for (const [, v] of this.scene.shipViews) {
      const deck = v.group.userData.deck;
      if (!deck || !deck.pending || !deck.pending.length) continue;
      if (!deck.airborne && !deck.endMatrix) continue;
      deck.pending.length = 0;
      deck.flightId = 0;
      deck.endMatrix = null;
      if (deck.launchAt === null) v.group.userData.stow?.();
    }
    this.comingHome(planes);
    this.flyApproach();
  }

  /**
   * A squadron gets home, and there is an aeroplane to watch land.
   *
   * A flight that reaches its carrier simply stops being on the plot -- the
   * simulation has struck it below and rearmed it. That is the right thing for
   * the simulation to do and the wrong thing to look at: a squadron you sent
   * out an hour ago comes back and nothing happens on the deck at all.
   *
   * So the last place each of our flights was seen is remembered, and one that
   * vanishes within sight of the ship she flew off is taken as a recovery: her
   * carrier's own model is put in the air where the flight was and flies the
   * approach -- round onto the centreline, down the glide, over the round-down
   * -- and the deck takes it from there, up to the lift and below.
   */
  comingHome(planes) {
    const now = new Map();
    for (const p of planes) now.set(p.i, p);
    for (const [id, was] of this.lastFlights) {
      if (now.has(id)) continue;
      // Not one that has just been taken over by a pilot, and not one that was
      // reported shot down -- those have their own endings.
      if (this.flight && this.flight.id === id) continue;
      if (this.lostFlights.has(id)) continue;
      const v = this.scene.shipViews.get(was.o);
      if (!v || !v.group.userData.deckPlane || this.landing) continue;
      const d = Math.hypot(was.x - v.group.position.x, was.z - v.group.position.z);
      if (d > 700) continue;
      // Her own model, put in the air where her flight was, flying in.
      const g = v.group.userData.deckPlane;
      this.scene.scene.attach(g);
      g.position.set(was.x, this.planeHeight(was), was.z);
      g.rotation.set(0, was.h ?? v.group.rotation.y, 0);
      g.visible = true;
      const deck = v.group.userData.deck;
      if (deck) { deck.airborne = false; deck.launchAt = null; }
      this.landing = {
        t0: this.time, view: v, group: g,
        from: g.position.clone(), fromY: g.rotation.y,
      };
    }
    this.lastFlights = now;
    if (this.lostFlights.size > 60) this.lostFlights.clear();
  }

  /**
   * What a shell does to the ship it hit.
   *
   * The rule is the one the simulation already works to and the one the guns
   * were designed round: only a round that gets through takes structure with
   * it. A shell that bounces off the belt, shatters on the plate or goes
   * clean through without bursting leaves a scar and a great deal of noise,
   * and the ship is the same shape afterwards. One that gets inside her and
   * bursts takes a piece of her away, roughly its own bore across for a clean
   * hole and several times that where the burst has blown the side in -- which
   * is exactly the area the simulation opens her to the sea by, so the hole
   * you can see and the hole she is flooding through are the same hole.
   *
   * Nothing here is a canned piece of damage. There is no list of places a
   * ship can be broken and no set of pre-built wrecked models: the geometry
   * that goes is the geometry the shell arrived at, wherever that was.
   */
  /**
   * A bomb through a deck, where it went through.
   *
   * The simulation settles whether a bomb hits at the moment it is released
   * -- there is nothing for it to run on and nothing to comb -- and the arc
   * is flown by the scene, so the place it arrives is known here and nowhere
   * else. A hit is a hole in the deck and a great deal of the deck in the
   * air.
   */
  bombThrough(x, y, z) {
    let hit = null;
    let hitId = 0;
    let best = 70;
    for (const [id, v] of this.scene.shipViews) {
      const d = Math.hypot(v.group.position.x - x, v.group.position.z - z);
      if (d < v.cls.hull.length * 0.6 && d < best + v.cls.hull.length * 0.6) {
        hit = v; hitId = id; best = d;
      }
    }
    if (!hit) return;
    // A thousand pounds of bomb through a deck does not make a shell hole in
    // it. It takes a piece of the deck away -- plating, beams, and whatever
    // was standing on it -- so the burst is worked at the size it really is
    // and carries the power to shed the fittings round it as well.
    const r = holeRadius('bomb', 454) * 1.6;
    const went = hit.punch(x, y, z, r, 0.35, 3.2);
    // What goes into the air is the deck it took, and nothing else. It used to
    // throw a burst of wreckage whether or not the bomb found anything --
    // through a part of her already blown away, or into the sea alongside --
    // so a near miss put a shower of steel into the air over open water. If
    // there was no deck there, there is nothing to throw.
    if (went <= 0) return;
    this.scene.debris.burst(x, y + 4, z, 3.2 + Math.min(5, went * 0.4), 1);
    this.scene.effects.explosion(x, y + 3, z, 1.5);
    // On our own deck it goes on the board, where the deck went.
    if (hitId === this.shipId) this.markHole(x, y, z, 'bomb');
  }

  shellDamage(ev) {
    if (!HOLING.has(ev.kind)) return;
    const v = this.scene.shipViews.get(ev.victim);
    if (!v) return;
    const r = holeRadius(ev.kind, ev.cal);
    if (!r) return;
    const went = v.punch(ev.x, ev.y ?? 8, ev.z, r, 0.45);
    // Whatever came out of her went somewhere.
    //
    // It used to be a citadel hit alone that threw anything. Every other kind
    // of hole took a piece out of the ship and put nothing into the air, which
    // is a hole that appears by magic -- and holes are most of what happens in
    // an action. A citadel hit still throws the deck; a six-inch through the
    // side throws splinters, which is the difference between them.
    if (went > 0) {
      const bore = (ev.cal || 152) / 1000;
      const heavy = ev.kind === 'citadel';
      this.scene.debris.burst(ev.x, (ev.y ?? 8) + (heavy ? 3 : 1.3), ev.z,
        (heavy ? 2.2 : 0.8) + bore * (heavy ? 3 : 1.7), heavy ? 1 : 0.4);
    }
  }

  /**
   * Remember a hole, in her own frame rather than the world's.
   *
   * The event says where the shell struck in the world; she has moved and
   * turned since, so it is put into her own coordinates at the moment it
   * happens and stays there.
   */
  markHole(wx, wy, wz, kind = 'pen') {
    const ls = this.localShip;
    const l = worldToLocal(wx - ls.x, wz - ls.z, ls.heading);
    // In her own frame, at the height it went in at: her waterline is nought,
    // her deck is eight or nine metres up and her bridge is twenty. The board
    // puts the mark on whichever of her plating is nearest that, so a hole in
    // her quarterdeck is drawn in her quarterdeck. There used to be six metres
    // taken off here to force everything down onto her side, which is where
    // the board then drew all of them.
    const h = [l.x, wy ?? 8, l.z, kind];
    this.holes.push(h);
    if (this.holes.length > 90) this.holes.shift();
    this.board?.hole(h[0], h[1], h[2], h[3]);
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
    // Her ship has gone from the scene under her -- sunk, or the view
    // disposed. There is nothing to land on and nothing owns the model any
    // more, so it goes with her rather than being left hanging in the world.
    if (!v.group.parent) {
      g.visible = false;
      v.group.attach(g);
      this.landing = null;
      return;
    }
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
    // Anything of hers still climbing out from an earlier run keeps flying:
    // those are copies, and the ship's own model is not out there with them.
    if (this.landing && this.landing.view === v) {
      v.group.attach(this.landing.group);
      this.landing = null;
    }
    const deck = v.group.userData.deck;
    if (deck) deck.flightId = 0;
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

    // Standing at a gun. The eye is on the mounting itself, the sight is fixed
    // in the middle of the screen, and the drag turns the layer's head -- the
    // gun follows him round, which is the way a gun sight works and not the
    // other way about.
    if (this.gun) {
      const eye = this.gunEye();
      if (eye) {
        const m = this.input.takeMouse();
        this.gunYaw = wrapAngle(this.gunYaw + m.x);
        // Down to the water alongside and up past the vertical for a
        // close-range mounting, which is where an aeroplane is.
        this.gunPitch = clamp(this.gunPitch + m.y, -0.30, this.gun.auto ? 1.25 : 0.42);
        this.input.orbiting = true;
        cam.position.set(eye.x, eye.y, eye.z);
        const cp = Math.cos(this.gunPitch);
        cam.lookAt(
          eye.x + Math.sin(this.gunYaw) * cp * 500,
          eye.y - Math.sin(this.gunPitch) * 500,
          eye.z + Math.cos(this.gunYaw) * cp * 500,
        );
        // A gun sight is a telescope. Narrow, so a ship at ten thousand yards
        // is something you can lay on rather than a speck.
        cam.fov = this.scoped ? 9 : 24;
        cam.updateProjectionMatrix();
        return;
      }
      // Her mounting has gone with the piece of ship it stood on.
      this.manGun(null);
    }

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

    // Where the camera is standing. Your own hull unless it has been walked
    // off her, in which case it is wherever it was left.
    const fx = this.roam ? this.roam.x : ls.x;
    const fz = this.roam ? this.roam.z : ls.z;
    const wave = this.scene.ocean.heightAt(fx, fz);
    if (this.camMode === 'tactical') {
      const h = 2200;
      cam.position.set(fx - Math.sin(this.yaw) * 300, h, fz - Math.cos(this.yaw) * 300);
      cam.lookAt(fx, 0, fz);
    } else if (this.camMode === 'bridge' && !this.roam) {
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
      const aim = wave * 0.5 + (this.roam ? 0 : this.cls.hull.superstructure * 5 + 6);
      cam.position.set(
        fx - Math.sin(this.yaw) * d * flat,
        wave * 0.5 + 6 + d * Math.sin(el),
        fz - Math.cos(this.yaw) * d * flat,
      );
      cam.lookAt(fx, aim, fz);
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
