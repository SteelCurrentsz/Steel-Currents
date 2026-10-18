// The battle client: prediction for your own hull, interpolation for everyone
// else, camera rig, effects and the loop that ties them together.

import * as THREE from '../../vendor/three.module.js';
import { fireSeats } from './render/fireseats.js';
import { BattleScene } from './render/scene.js';
import { Hud, readTarget, THROTTLE_MAX } from './hud.js';
import { DamageBoard } from './render/damageboard.js';
import { TargetingView } from './render/targetview.js';
import { PlaneBoard, PART_NAME } from './render/planeboard.js';
import { holeRadius } from './render/plating.js';
import { blastPower } from './render/rupture.js';
import { Airborne, AERO, HEAVY_AERO, stallSpeed, Pilot, flightAttitude, weathercock, instruct, alphaFor }
  from './render/aero.js';
import { startManeuver, pathOf, upOf } from '../../shared/pilot.js';
import {
  ROLE_TYPE, typeOf, slotAt, gunsOf, unpackHoles, CUT, storeOf, rearGunOf,
} from './render/planes.js';
import { cutFromHoles, breakCut, piecesOf, Pieces } from './render/breakup.js';
import { HEAVY, HEAVY_KINDS } from './render/planekit.js';
import { BOMBERS } from '../../shared/bombers.js';
import { audio } from './audio.js';
import { getSettings } from './settings.js';
import { SHIP_CLASSES, getClass } from '../../shared/ships.js';
import {
  createState, addShip, applyInput, predictShip, MIN_NOTCH, MAX_NOTCH, solveBallistic,
  steerToWaypoint, PENETRATING, SECTIONS, sectionAt, gunLimits, layFloor, DT,
  freeboardOf, cutLoses, dpMounts,
} from '../../shared/sim.js';
import { windAt, rideOf } from '../../shared/sea.js';
import { freshLamps, LAMP_PITCH } from '../../shared/searchlights.js';
import { lampPlan, planImage } from './render/searchlights.js';
import { PenCam } from './render/pencam.js';
import { buildBridge } from './render/bridgeroom.js';
import {
  MAN, freshMan, stepDeck, stepWater, deckAt, onPlan, roughPlan, placeOn,
} from './walker.js';
import {
  clamp, lerp, wrapAngle, angleDelta, dist, worldToLocal, localToWorld,
  MPS_TO_KNOTS,
} from '../../shared/math.js';
import { groundHeight, applyCrater, getWeather } from '../../shared/world.js';

// How far behind the server everybody else is drawn, in the server's own
// seconds. A little over two snapshots at fifteen a second, so one of them can
// arrive late without the picture running out of road.
const INTERP_DELAY = 0.15;
// And when one is later than that, how far a ship is carried on past the last
// snapshot on her own course and speed before she is held where she is. She
// is a ship: she does not stop dead in the water because a packet did.
const EXTRAPOLATE = 0.3;
// How long our own hull takes to be eased back onto the server's track when
// the two disagree. Quick enough that she never wanders far from where the
// authority has her, slow enough that nobody sees her being put back.
const CORRECT_TAU = 0.3;
// How many seconds of snapshots the server's clock rate is measured over.
const CLOCK_WINDOW = 4;
/** Scratch for where a fire stands this frame. */
const FIRE_AT = new THREE.Vector3();
/** How long an aeroplane fresh off the deck takes to settle onto her own track, in seconds. */
const HANDOVER = 1.6;
/** A snapshot's aeroplanes by id, worked out once for each snapshot. */
function planeMap(snap) {
  if (!snap) return null;
  if (!snap.planeIds) snap.planeIds = new Map((snap.planes || []).map((q) => [q.i, q]));
  return snap.planeIds;
}
/** The fastest the battle may be run, in times as fast as life. See Room.timeScale. */
const MAX_WARP = 5;

/**
 * Where a ship is between two snapshots of her.
 *
 * `prev` is her in the later snapshot and `t` how far toward it; with no later
 * snapshot she is carried `ahead` seconds on along her own heading at her own
 * speed instead -- unless she is no longer afloat, in which case she is where
 * she was last seen.
 */
export function poseBetween(s, prev, t, ahead = 0) {
  if (prev) {
    return {
      x: lerp(s.x, prev.x, t),
      z: lerp(s.z, prev.z, t),
      h: s.h + angleDelta(s.h, prev.h) * t,
      v: lerp(s.v || 0, prev.v || 0, t),
    };
  }
  const run = s.a ? (s.v || 0) * ahead : 0;
  return {
    x: s.x + Math.sin(s.h) * run,
    z: s.z + Math.cos(s.h) * run,
    h: s.h,
    v: s.v || 0,
  };
}

/**
 * How hard your own guns kick the camera, `t` seconds after they went off: up
 * to the top of it in a few hundredths of a second and settled back inside a
 * quarter of one, with nothing after.
 *
 * `cal` is the bore in millimetres. A sixteen-inch salvo is the whole kick and
 * a five-inch barely a nudge: the secondaries go off every few seconds, and a
 * view that jumps every time they do is one nobody can lay a gun in.
 */
export function recoilKick(t, cal) {
  if (t < 0) return 0;
  const size = Math.min(1, Math.pow(Math.max(0, cal) / 406, 1.3));
  const u = t / (0.045 + 0.025 * size);
  return u > 12 ? 0 : size * u * Math.exp(1 - u);
}

// How far the view has to be walked before it lets go of the ship it is
// watching. Screen pixels, and about a fingertip's width.
const PAN_TO_LET_GO = 26;

// Scratch for reading a mounting's place in the world off the scene graph.
const GUN_EYE = new THREE.Vector3();
// Scratch for the rear gunner: see `rearGun`.
const RG_M = new THREE.Matrix4();
const RG_M2 = new THREE.Matrix4();
const RG_V = new THREE.Vector3();
const RG_V2 = new THREE.Vector3();
const RG_ONE = new THREE.Vector3(1, 1, 1);
const RG_Q = new THREE.Quaternion();
const RG_Q2 = new THREE.Quaternion();
const RG_E = new THREE.Euler();
const RG_FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const EYE_UP = new THREE.Vector3();
const EYE_TOP = new THREE.Vector3();
const EYE_BACK = new THREE.Vector3();
const EYE_RAY = new THREE.Raycaster();
const EYE_HITS = [];
const INPUT_HZ = 20;

const CAMERAS = ['chase', 'bridge', 'tactical'];

/**
 * The set pieces a pilot can throw from the keyboard: a roll either way under
 * Q and E, a barrel roll either way under Z and X, and a loop, an Immelmann
 * and a split-S under V, B and N. The glass has buttons for the same.
 */

/** Turn a vector about a unit axis, in place (Rodrigues). */
function rotate(v, ax, ang) {
  const c = Math.cos(ang), sn = Math.sin(ang);
  const d = (v.x * ax.x + v.y * ax.y + v.z * ax.z) * (1 - c);
  const cx = ax.y * v.z - ax.z * v.y, cy = ax.z * v.x - ax.x * v.z, cz = ax.x * v.y - ax.y * v.x;
  const x = v.x * c + cx * sn + ax.x * d;
  const y = v.y * c + cy * sn + ax.y * d;
  const z = v.z * c + cz * sn + ax.z * d;
  v.x = x; v.y = y; v.z = z;
  return v;
}

/** Make a vector unit length, in place. */
function norm3(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  v.x /= l; v.y /= l; v.z /= l;
  return v;
}

const ATT_Q = new THREE.Quaternion();
const ATT_M = new THREE.Matrix4();
const ATT_X = new THREE.Vector3();
const ATT_Y = new THREE.Vector3();
const ATT_Z = new THREE.Vector3();
/**
 * The whole attitude of an aeroplane under a pilot, as a quaternion: her nose
 * and the way up through her canopy, off the flight model's own frame. Drawn
 * this way she goes over the top of a loop and round a roll as one smooth
 * motion, which three angles -- folding at the vertical -- never managed.
 */
function attitudeOf(p, out = ATT_Q) {
  const b = p.body();
  ATT_Z.set(b.n.x, b.n.y, b.n.z);
  ATT_Y.set(b.u.x, b.u.y, b.u.z);
  ATT_X.crossVectors(ATT_Y, ATT_Z).normalize();
  ATT_Y.crossVectors(ATT_Z, ATT_X).normalize();
  ATT_M.makeBasis(ATT_X, ATT_Y, ATT_Z);
  return out.setFromRotationMatrix(ATT_M);
}

const PLANE_E = new THREE.Euler(0, 0, 0, 'YXZ');
const PLANE_V = new THREE.Vector3();
const PLANE_S = new THREE.Vector3(1, 1, 1);
/** An aeroplane's world matrix off her place and three angles, as she is drawn. */
function planeMatrix(x, y, z, heading, bank, pitch, out = new THREE.Matrix4()) {
  PLANE_E.set(-pitch, heading, -bank);
  ATT_Q.setFromEuler(PLANE_E);
  return out.compose(PLANE_V.set(x, y, z), ATT_Q, PLANE_S);
}
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
  besson: 'her Besson',
  loire: 'her Loires',
};

/** The order the parts come in on the wire and on the pilot's board. */
const PART_ORDER = ['engine', 'tanks', 'wings', 'tail', 'crew', 'body'];

/** What the aeroplane herself is called, for the pilot's own corner. */
const PLANE_NAME = {
  wildcat: 'F4F Wildcat', dauntless: 'SBD Dauntless', avenger: 'TBF Avenger',
  arado: 'Arado 196', kingfisher: 'OS2U Kingfisher', besson: 'Besson MB.411', loire: 'Loire 130',
  zero: 'A6M Zero',
  suisei: 'D4Y Suisei', tenzan: 'B6N Tenzan', jake: 'E13A Jake',
};

/** What she has been sent to do, as the plate in the corner says it. */
const ROLE_NAME = {
  fighter: 'Fighter', dive: 'Dive bomber', torpedo: 'Torpedo bomber', scout: 'Scout',
};

/** What each machine's forward guns are, so the tracer is the right tracer. */
const GUN_CALIBRE = {
  wildcat: 12.7,      // four fifties in the wings
  dauntless: 12.7,    // two in the cowling
  avenger: 12.7,      // one in each wing
  arado: 20,          // two MG FF in the wings and an MG 17 over the engine
  kingfisher: 7.62,   // the one thirty she had
  // The Besson has nothing forward at all. Her one gun is the observer's
  // flexible Darne aft, which is a 7.5 mm and which is not a forward gun --
  // but a machine with no entry here fires nothing and shows nothing, and she
  // does shoot back, so this is the round she shoots back with.
  besson: 7.5,
  // And the Loire 130 has none forward either: two flexible Darnes, one in
  // the bow cockpit and one aft, and it is the one in the bow that fires on
  // what is ahead of her.
  loire: 7.5,
};

/**
 * And how many of them she fires forward.
 *
 * Written down rather than counted off the model, because the arsenal panel
 * can be asked what she carries before anything of her has been built: the
 * muzzles are read out of the welded geometry (see `gunsOf`) and until that has
 * happened every aeroplane in the game answers with the one fallback muzzle at
 * her nose. What she carries is a fact about the aeroplane, not about whether
 * we have got round to drawing her.
 */
const GUN_COUNT = {
  wildcat: 4, dauntless: 2, avenger: 2, arado: 3, kingfisher: 1, besson: 1, loire: 1,
  zero: 4, suisei: 2, tenzan: 1, jake: 1,
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
/**
 * Rounds aboard for her forward guns, all of them together -- what the
 * number over the trigger counts down from. Her real loads near enough: a
 * Wildcat's four fifties at four hundred a gun, a Zero's two cannon and two
 * rifle-calibre, a scout's one gun and a few belts.
 */
const AMMO = {
  wildcat: 1600, dauntless: 720, avenger: 600, arado: 620, kingfisher: 500,
  besson: 500, loire: 500, zero: 1120, suisei: 800, tenzan: 500, jake: 500,
};
/** Rounds a minute out of one gun: about seven hundred, for all of them. */
const GUN_RPM = 720;
/**
 * Where her wing guns are laid to meet, in metres, and so where the ring is
 * drawn. A long way out, so the rounds go out in a tight bundle down the
 * line of sight instead of crossing and spreading.
 */
// Twelve hundred metres: the chase camera stands a few metres above her, and
// the further out the ring is laid the less the line from the camera through
// it parts from the line the rounds go down -- under eight metres anywhere
// out to the end of their reach, against thirty with the ring at four hundred.
const GUN_CONVERGE = 1200;
/** How far the rounds are worth anything, for the lead and the far warning. */
const GUN_REACH = 2400;
/** How fast they go, for the lead: muzzle velocity, plus her own speed. */
const GUN_V = 810;

const LOAD = {
  dive: { key: 'BOMBS', name: 'bombs', near: 1200, away: 'Bombs away' },
  scout: { key: 'BOMBS', name: 'bombs', near: 1200, away: 'Bombs away' },
  torpedo: { key: 'TORPEDO', name: 'torpedoes', near: 1600, away: 'Torpedoes away' },
};


/**
 * Everything an aeroplane carries, in the shape the arsenal panel wants.
 *
 * A carrier machine has her forward guns and nothing else to choose between,
 * so she gets one row and it is not a mounting anybody sits in -- a fighter's
 * guns are bolted to her wings and aimed by pointing the aeroplane. A heavy
 * has three or four powered turrets, each with its own cone, and those are
 * rows you can press: press one and you are in it.
 *
 * The turret figures are the model's own -- the same table that builds the
 * cupolas and clamps them when they train, so what the panel says a turret
 * will do is what the turret does.
 */
const AIR_ARMS = new Map();

export function airArsenal(kind) {
  // Worked out once per type and kept. What an aeroplane carries does not
  // change during an action -- it is her armament, not her state -- and this
  // is asked for on every frame that anything is being watched or flown.
  const had = AIR_ARMS.get(kind);
  if (had) return had;
  const rows = buildAirArsenal(kind);
  AIR_ARMS.set(kind, rows);
  return rows;
}

function buildAirArsenal(kind) {
  if (HEAVY_KINDS.includes(kind)) {
    const spec = HEAVY[kind] || HEAVY.lancaster;
    const book = BOMBERS[kind] || BOMBERS.lancaster;
    const deg = (r) => Math.round(r);
    return (spec.turrets || []).map((t) => ({
      name: `${TURRET_NAME[t.name] || t.name} turret`,
      // Her guns are quoted in metres across the bore on the model, which is
      // how everything else in the toolkit is measured; the panel wants
      // millimetres, like a ship's.
      caliber: Math.round((t.cal || 0.04) * 1000),
      barrels: t.guns || 1,
      mounts: 1,
      role: 'aa',
      band: 'Defensive armament',
      // What she will bear on, which is the whole of what a turret is: a cone
      // either side of her line, and how far up and down inside it.
      note: `${t.guns || 1} ${(t.guns || 1) === 1 ? 'gun' : 'guns'} · `
        + `${deg(t.arc ?? 180) * 2}° traverse · +${deg(t.up ?? 60)}/-${deg(t.down ?? 30)}°`,
      arcs: book.arcs,
      turret: t.name,
    }));
  }
  const n = GUN_COUNT[kind] ?? gunsOf(kind).length;
  const cal = GUN_CALIBRE[kind] ?? 12.7;
  return [{
    name: `${cal} mm forward guns`,
    caliber: cal,
    barrels: n,
    mounts: n,
    role: 'aa',
    band: 'Fixed armament',
    note: `${n} ${n === 1 ? 'gun' : 'guns'} · fired by pointing her`,
  }];
}

/** What a turret is called, rather than where the model puts it. */
const TURRET_NAME = {
  nose: 'Nose', chin: 'Chin', dorsal: 'Mid-upper', ball: 'Ball',
  tail: 'Tail', gondola: 'Ventral', beam: 'Beam', waist: 'Waist',
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
  // The depth charge gear. Nobody stands at a rack: it is worked from the
  // quarterdeck by a party with a pinch bar, and what the captain does is give
  // the word. See dropCharges.
  if (row.charges) return 'dc';
  return null;
}

/**
 * The gale an aeroplane is flying in at a moment, or null when there is none
 * worth the name. The same wind the server is blowing (see shared/sea.js).
 */
/** Another ship's lit lamps off the wire: [index, yaw, pitch] in hundredths. */
function unpackLamps(lp) {
  if (!lp || !lp.length) return null;
  const out = [];
  for (const [k, y, p] of lp) out[k] = { on: true, yaw: y / 100, pitch: p / 100 };
  return out;
}

/** The kinds of hit that got into her and burst inside. */
const PENETRATING_KINDS = new Set(['pen', 'citadel', 'overpen', 'he']);

/**
 * How big the explosion of a round that got in is drawn, off the damage it
 * did: a five-inch round that did two thousand is a modest burst, a
 * sixteen-inch citadel hit is a fireball half the height of her mast.
 */
export function blastScale(dmg = 0) {
  return Math.max(0.25, Math.min(2.4, 0.25 + 1.6 * Math.sqrt(Math.max(0, dmg) / 16000)));
}

/** How she is floating, between two snapshots: each figure in proportion. */
export function floatBetween(a, b, t) {
  if (!a) return a;
  if (!b || b.length !== a.length) return a;
  return a.map((v, i) => v + ((b[i] ?? v) - v) * t);
}

function galeOf(world, t) {
  const wx = getWeather(world?.weather);
  if (!wx.blow) return null;
  const w = windAt(world, Number.isFinite(t) ? t : 0);
  return { x: w.x, z: w.z, rough: w.blow * (w.speed / 36) };
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
      // A fresh canvas every time the panel opens: the last board's context
      // goes first, or a captain who opens it twenty times runs the page out
      // of contexts and the battle's own is the one the browser takes back.
      this.board?.dispose();
      this.board = new DamageBoard(canvas, classId);
    });
    // The targeting panel's picture of her: her own model in a fixed view. A
    // fresh canvas each time the panel is raised, so a fresh renderer on it.
    this.hud.onTargetingBoard?.((canvas) => {
      this.targetView?.dispose();
      this.targetView = new TargetingView(canvas);
    });
    this.hud.onTargetingPick?.((pick) => this.targetView?.select(pick));
    // A gun dropped on an enemy's box: put on her by name, or given back.
    this.hud.onTargetingAssign?.((t, target) => {
      this.net.send({ t: 'assign', ship: this.conned(), k: t.kind, i: t.i, target });
      audio.click();
      if (target) this.hud.alert(`${t.label} on ${this.names.get(target) || 'target'}`);
      else this.hud.alert(`${t.label} back to fire control`);
    });
    // A gun's key double-tapped: that mounting switched off, or back on.
    this.hud.onTargetingOff?.((t, off) => {
      this.net.send({ t: 'gunoff', ship: this.conned(), k: t.kind, i: t.i, off });
      audio.click();
      this.hud.alert(`${t.label} ${off ? 'switched off' : 'switched on'}`);
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
      this.armsBoard.onPick((i) => (batteryKind(row) === 'dc'
        ? this.dropCharges(i)
        : this.manGun(batteryKind(row), i, row)));
    });
    // And an aeroplane's own armament: pressing a turret puts you in it, and
    // pressing the one you are in gets you out again.
    this.hud.onAirArsenal?.((row) => this.manTurret(row));
    // The depth charge gear, which is ordered rather than laid: the word to
    // let go, what the pistols are wound to, and whether her own
    // anti-submarine officer may attack a sonar contact without being asked.
    // What a battery is loaded with. Her main battery's order and her
    // secondary's are separate, because what is worth firing at a destroyer
    // from a five-inch is not what is worth firing at a battleship from her
    // sixteen-inch.
    this.hud.onShell?.((battery, kind) => {
      const ship = this.conned();
      const order = battery === 'sec' ? { secShell: kind } : { shellType: kind };
      if (ship === this.shipId && this.localShip) applyInput(this.localShip, order);
      this.net.send({ t: 'input', ship, ...order });
      const what = kind === 'he' ? 'high explosive' : 'armour-piercing';
      this.hud.alert(`${battery === 'sec' ? 'Secondaries' : 'Main battery'} loading ${what}`);
      audio.click();
    });
    this.hud.onDepthCharges?.((msg) => {
      const ship = this.conned();
      if (msg.k === 'drop') this.dropCharges(null);
      else if (msg.k === 'set') {
        this.net.send({ t: 'dcset', ship, d: msg.d });
        this.hud.alert(`Charges set to ${msg.d} m`);
        audio.click();
      } else if (msg.k === 'auto') {
        this.net.send({ t: 'dcauto', ship, on: msg.on ? 1 : 0 });
        this.hud.alert(msg.on ? 'Racks released to the sonar' : 'Racks held');
        audio.click();
      }
    });
    // Where she has been holed, in her own frame, kept so the board can show
    // the same holes after it has been put away and raised again.
    this.holes = [];
    // Every round seen to strike each ship, where on her it went in and what
    // it did, for the targeting panel's picture of her. See TargetingView.setHits.
    this.hitsOn = new Map();
    // The three conn keys, and what each of their panels does.
    // Every one of these is given to whichever ship is being conned -- your
    // own, or whoever you have picked off the plot and are watching.
    this.hud.onConn?.((k, v) => {
      const ship = this.conned();
      if (k === 'notch') this.setNotch(v);
      else if (k === 'air') this.net.send({ t: 'strike', ship });
      else if (k === 'auto') {
        const on = !this.hud.autoOn;
        this.hud.autoWant = on;
        this.hud.autoHold = performance.now() + 900;
        this.hud.autoOn = on;
        this.net.send({ t: 'autolaunch', ship, on });
      }
      else if (k === 'plane') this.togglePilotView();
      else if (k === 'repair') this.net.send({ t: 'repair', ship });
      else if (k === 'smoke') this.net.send({ t: 'smoke', ship });
      else if (k === 'party') this.net.send({ t: 'party', ship, i: v.i, job: v.job });
      audio.click();
    });

    // The dive, which only a boat has.
    //
    // One key and three states, cycled: on the surface, at periscope depth
    // where she can still see and still shoot, and deep where she cannot do
    // either. The order goes to the server and to our own local hull at the
    // same moment, so the needle starts moving on the press rather than on the
    // next snapshot -- a dive takes the better part of half a minute and a
    // captain who cannot see it start does not know he gave the order.
    this.hud.onDiveOrder?.(() => {
      // The boat under orders: her own, or one being watched and conned.
      const id = this.conned();
      if (id !== this.shipId) {
        const s = this.shownShip();
        const cls = s && getClass(s.c);
        if (!cls || !cls.dive) return;
        const D = cls.dive;
        const at = s.d || 0;
        const next = at < 0.5 ? D.periscope : at < D.periscope + 0.5 ? D.max : 0;
        this.net.send({ t: 'input', ship: id, depth: next });
        audio.click();
        return;
      }
      const ls = this.localShip;
      const cls = getClass(ls.classId);
      if (!cls.dive) return;
      const D = cls.dive;
      const at = ls.depthCmd;
      const next = at < 0.5 ? D.periscope : at < D.periscope + 0.5 ? D.max : 0;
      applyInput(ls, { depth: next });
      this.net.send({ t: 'input', ship: this.shipId, depth: next });
      audio.click();
    });

    // Local mirror of our own hull, stepped with the shared simulation.
    this.local = createState(world, {});
    this.localShip = addShip(this.local, { id: shipId, name: 'You', classId, team, index: 0 });
    this.localShip.notch = 1;

    this.entities = new Map();
    this.snapshots = [];
    // The server's clock as we read it -- the recent snapshots, when each
    // arrived, and how fast it is running against ours -- and the moment on it
    // the picture is being drawn at. See syncClock and stepRenderClock.
    this.clockPts = [];
    this.clockRate = 1;
    this.clockOff = null;
    this.renderST = null;
    this.renderAt = 0;
    // Where our own hull was predicted to be over the last two seconds, on the
    // server's clock, so a snapshot can be compared with where we had her at
    // the same moment; the moment on that clock she has been predicted to;
    // and what is left of the last correction to be taken up. See correctOwn.
    this.ownTrack = [];
    this.ownST = null;
    this.ownAtWall = 0;
    this.fix = null;
    // Last heading seen for each flight, so a turn can be read off as bank.
    this.planeTurn = new Map();
    // And how far her nose is up, eased the same way. See syncEntities.
    this.planePitch = new Map();
    // And what each has lost -- a wing panel, a tail -- which stays lost.
    this.planeCut = new Map();
    // How far each flight's bomb bay is open and how far her weapon has
    // fallen clear of her. See `bayTrim`.
    this.planeTrim = new Map();
    // Where each flight's machines were last drawn, slot by slot, and how fast
    // they were going: what a bomb is let go from. See `releaseOf`.
    this.planeDrawn = new Map();
    // What each flight's rear gunner is on, off the wire. See `rearGun`.
    this.rearAim = new Map();
    this.snapTime = 0;
    this.serverTime = 0;
    this.shellTrails = new Map();

    this.camMode = 'chase';
    // The aeroplane the player has taken, if any: see takeFlight.
    this.flight = null;
    // And the turret on her he is sitting in, if any: see manTurret. Null is
    // the pilot's own seat, which is where everybody starts.
    this.turret = null;
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
    // Aeroplanes just off a deck, and how far the deck model was from where
    // the simulation put them. See flyLaunched.
    this.handover = new Map();
    // Where the camera is standing when it has been walked off its ship: a
    // point on the sea it orbits instead. Null means it is on whatever it is
    // following -- your own hull, or a mark picked off the chart.
    this.roam = null;
    // Which of your division the flag has shifted to, once your own ship has
    // gone. It is the ship the chart conns from then on, and it is not the
    // same thing as the ship the camera is watching -- see `conned`.
    this.flag = null;
    // Whether the free camera is up. It is the one way the camera comes off a
    // ship, it has a key of its own in the corner, and picking anything on the
    // plot puts it away again. See freeCamera.
    this.freeCam = false;
    // What is left of the ones that were shot down, on their way into the sea.
    this.wrecks = [];
    // The pieces that have come off aeroplanes, on their own way down: a wing,
    // a tail, an airscrew. See breakup.js.
    this.pieces = new Pieces();
    // Which flights have their guns going, and until when: their flashes are
    // drawn on them every frame of the burst. See airFx.
    this.airBursts = new Map();
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
    // Your own salvos, as the camera feels them. See kick().
    this.recoils = [];
    this.recoilClock = 0;
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
    // Whether what it is following is a ship's salvo or a squadron's stick:
    // a bomb has no gun and no ship behind it, so it is matched differently.
    this.shellIsBomb = false;
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
      bombCam: () => this.toggleShellCam(),
      move: (kind) => this.flyMove(kind),
    });
    // The shell camera, beside the target plate: ride the rounds this ship is
    // firing.
    this.hud.bindShellCam(() => this.toggleShellCam());
    // And the speed key beside it: how many times faster than life the battle
    // runs. The battle service says what it is running at, and the key shows
    // that rather than what was last asked for.
    this.timeScale = 1;
    this.hud.setTimeWarp?.(1);
    this.hud.bindTimeWarp?.(() => this.cycleWarp());
    this.hud.onToggleMap = () => this.toggleMap();
    // The page's own buttons outlive the battle: what is put on them here
    // comes off again in dispose, all at once.
    this.abort = new AbortController();
    const mine = { signal: this.abort.signal };
    document.getElementById('watch-back')?.addEventListener('click', () => this.cameraHome(), mine);
    document.getElementById('free-cam')?.addEventListener('click', () => this.freeCamera(), mine);
    document.getElementById('gun-leave')?.addEventListener('click', () => this.manGun(null), mine);
    // The penetration camera, over the whole battle screen.
    {
      const host = document.getElementById('screen-battle');
      this.penCam = host && typeof document !== 'undefined'
        ? new PenCam(host, (id) => this.scene.shipViews.get(id)) : null;
    }
    // Her searchlights: the plan on the panel, and the two keys behind one.
    this.hud.onLampPlan = () => this.lampPanel();
    this.hud.onLampPick = (k) => this.enterLamp(k);
    document.getElementById('lamp-switch')?.addEventListener('click', () => this.switchLamp(), mine);
    document.getElementById('lamp-leave')?.addEventListener('click', () => this.leaveLamp(), mine);
    // The human view: a pin in her plan, and you on your own two feet there.
    this.man = null;
    this.hud.onHumanPlan = () => this.humanPanel();
    this.hud.onHumanDeploy = (x, z) => this.deployMan(x, z);
    this.hud.onHumanBridge = () => this.deployBridge();
    this.hud.bindHumanStick(() => { this.jumpAsked = true; });
    document.getElementById('human-leave')?.addEventListener('click', () => this.leaveMan(), mine);
    const fireKey = document.getElementById('gun-fire');
    if (fireKey) {
      fireKey.addEventListener('pointerdown', (e) => { e.preventDefault(); this.pullTrigger(); }, mine);
      fireKey.addEventListener('click', (e) => e.preventDefault(), mine);
    }
    document.getElementById('watch-swap')?.addEventListener('click', () => {
      if (!this.watching) return;
      this.watchPov = !this.watchPov;
      this.hud.setWatchBanner(this.watching, this.watchPov);
      audio.click();
    }, mine);

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
      this.net.on('warp', (m) => this.onWarp(m.s)),
      // The simulation refusing a drop. She is still carrying it, so the key
      // comes back live and the pilot is told why nothing happened rather than
      // being left pressing a dead button.
      this.net.on('nodrop', (m) => {
        const f = this.flight;
        if (!f || f.id !== m.i) return;
        f.asked = 0;
        this.hud.alert('She could not drop — press home');
      }),
      // And the racks refusing. Either there is nothing left in the stowage or
      // the party has not finished reloading, and a captain who pressed the
      // key and saw nothing go over the stern is entitled to be told which.
      this.net.on('nodc', () => {
        const own = this.ownSnap;
        this.hud.alert(own && own.dcl <= 0 ? 'Depth charge stowage empty'
          : 'Racks still reloading');
      }),
    ];
  }

  /** Press the speed key: one, two, three, four, five times as fast, and round again. */
  cycleWarp() {
    const next = (this.timeScale || 1) >= MAX_WARP ? 1 : (this.timeScale || 1) + 1;
    this.net.send({ t: 'warp', s: next });
    audio.click();
  }

  /**
   * The battle running at a new rate. The clock the picture is drawn on is
   * told at once rather than left to find out over the next few seconds of
   * snapshots: measured, it lagged the change and the whole sea was held back
   * and then thrown forward to catch up.
   */
  onWarp(s) {
    const k = clamp(Math.round(Number(s) || 1), 1, MAX_WARP);
    if (k === this.timeScale) return;
    this.timeScale = k;
    const pts = this.clockPts;
    if (pts && pts.length) pts.splice(0, pts.length - 1);
    this.clockRate = k;
    this.hud.setTimeWarp?.(k);
  }

  onSnapshot(snap) {
    const now = performance.now() / 1000;
    // When, on the server's own clock, this is a picture of. The tick, not the
    // moment it happened to arrive: the battle service steps on a timer that
    // runs late whenever the machine is busy, catches up two or three steps at
    // a time, and sends a snapshot only on an even tick -- so snapshots arrive
    // bunched and gapped, and interpolating on arrival time ran every ship on
    // the sea fast, slow and stopped by turns, ten times a second. On the tick
    // the positions are exactly as far apart as the time between them.
    const st = Number.isFinite(snap.tick) ? snap.tick * DT : (snap.time || 0);
    const newest = this.snapshots[this.snapshots.length - 1];
    // A clock that has gone backwards is a new battle on the same screen.
    if (newest && st < newest.st - 1) {
      this.snapshots = [];
      this.clockPts = [];
      this.clockRate = 1;
      this.clockOff = null;
      this.renderST = null;
      this.ownST = null;
      this.ownTrack = [];
    }
    this.snapshots.push({ ...snap, at: now, st });
    while (this.snapshots.length > 12) this.snapshots.shift();
    this.serverTime = snap.time;
    this.syncClock(now, st);

    const own = snap.ships.find((s) => s.i === this.shipId);
    if (own) {
      const ls = this.localShip;
      // Authority wins, but by being eased into rather than snapped to.
      this.correctOwn(own, st);
      ls.hp = own.hp;
      ls.alive = !!own.a;
      ls.fires = own.f; ls.flooding = own.fl;
      // A piece of her gone: her own prediction loses what went with it --
      // her screws, her machinery, her rudder -- as the battle does.
      if (own.ct && !ls.cut) {
        ls.cut = { at: own.ct[0], keep: own.ct[1] };
        for (const k of cutLoses(own.ct[0], own.ct[1])) ls.sections[k].lost = true;
      }
      // Going down: her own prediction slows her as the battle does.
      ls.sinking = Number.isFinite(own.sn) ? { t: own.sn, T: 1 } : null;
      if (own.cd) own.cd.forEach((cd, i) => { if (ls.turrets[i]) ls.turrets[i].cooldown = cd; });
      if (own.dis) own.dis.forEach((d, i) => { if (ls.turrets[i]) ls.turrets[i].disabled = d ? 1 : 0; });
      if (own.tp) own.tp.forEach((cd, i) => { if (ls.torpMounts[i]) ls.torpMounts[i].cooldown = cd; });
      own.maxHp = this.cls.hp;
      // The sea getting into her: a compartment that was dry is making water.
      // Every time, whatever let it in -- a shell, a torpedo, a sea through a
      // hole above her waterline.
      if (own.a && (own.fl || 0) > (this.floodWas || 0)) audio.say('breach', this.cls.nation);
      this.floodWas = own.fl || 0;
      if (!own.a && !this.sunk) this.onOwnSunk();
      this.ownSnap = own;
    }
    this.lookouts(snap);
  }

  /**
   * An enemy ship coming into sight: the lookout reports her and where she
   * bears, "enemy spotted, bearing two-seven-zero". Not the ones that were in
   * sight when the battle opened -- nobody reports a ship the whole bridge has
   * been looking at -- and not a ship that is only here because we asked to
   * watch her. One that has been out of sight for a minute and comes back is
   * reported again. Several at once: the nearest is the one called.
   */
  lookouts(snap) {
    const seen = this.foesSeen || (this.foesSeen = new Map());
    const t = snap.time ?? 0;
    const seeded = this.foesSeeded;
    this.foesSeeded = true;
    const me = this.ownSnap || snap.ships.find((q) => q.i === this.shipId);
    let call = null;
    let near = Infinity;
    for (const s of snap.ships) {
      if (!s.a || s.tm === this.team || s.i === this.watchSent) continue;
      const last = seen.get(s.i);
      seen.set(s.i, t);
      if (!seeded || !me || (last != null && t - last < 60)) continue;
      const d = Math.hypot(s.x - me.x, s.z - me.z);
      if (d < near) { near = d; call = s; }
    }
    if (!call || this.sunk) return;
    const deg = ((Math.atan2(call.x - me.x, call.z - me.z) * 180) / Math.PI + 360) % 360;
    const digits = String(Math.round(deg) % 360).padStart(3, '0');
    audio.say('spotted', this.cls.nation, { digits });
  }

  /**
   * Keep track of the server's clock: where it is, and how fast it runs.
   *
   * It does not always run at one second a second. The battle a standalone
   * page hosts in its own tab steps on a timer that the drawing starves: on a
   * slow machine it gets through a second of battle in two or three seconds,
   * and it drops time outright whenever the tab stalls. The picture used to be
   * drawn on our own clock less a fixed offset, so it ran on ahead of every
   * snapshot there was, held, and was then thrown back a second at a time when
   * the offset was put right -- every ship on the sea sailing backwards -- and
   * our own hull, predicted at a second a second, was dragged back onto a
   * server that had not got that far.
   *
   * So the rate is measured, off the snapshots of the last few seconds, and
   * the server's clock is read at any moment as the best of what the recent
   * snapshots say: each one's time, carried on at that rate for as long as it
   * has been here. One that came late says less than one that did not, so the
   * best is the latest reading, the same way the earliest arrival was before.
   */
  syncClock(now, st) {
    const pts = this.clockPts || (this.clockPts = []);
    pts.push({ at: now, st });
    while (pts.length > 2 && pts[0].at < now - CLOCK_WINDOW) pts.shift();
    const first = pts[0];
    const span = now - first.at;
    if (span > 0.5) {
      const r = clamp((st - first.st) / span, 0.05, Math.max(1.5, (this.timeScale || 1) * 1.25));
      this.clockRate = (this.clockRate ?? 1) + (r - (this.clockRate ?? 1)) * 0.2;
    }
    // Still kept for anything that wants the plain offset.
    this.clockOff = now - this.serverNow(now);
  }

  /** The server's clock, at a moment on ours. See syncClock. */
  serverNow(now) {
    const pts = this.clockPts;
    if (!pts || !pts.length) return null;
    const rate = this.clockRate ?? 1;
    let best = -Infinity;
    for (const p of pts) best = Math.max(best, p.st + (now - p.at) * rate);
    // Never further past the newest snapshot than a ship is carried on past one.
    // Both in the server's seconds, so run fast they stretch with it: the
    // snapshots come no oftener, and each one is that much more battle apart.
    const k = this.timeScale || 1;
    return Math.min(best, pts[pts.length - 1].st + (EXTRAPOLATE + INTERP_DELAY) * k);
  }

  /**
   * The moment on the server's clock the picture is drawn at, this frame.
   *
   * Run at the server's rate and pulled gently toward where it ought to be,
   * rather than set from the newest snapshot: a clock that jumped every time
   * a packet came in would put the jump into every ship on the screen. And it
   * never goes back. A ship drawn a little slow for a moment is a ship; one
   * drawn sailing astern is a glitch. Only a picture more than a second behind
   * is jumped, and only forward.
   */
  stepRenderClock(now = performance.now() / 1000) {
    const est = this.serverNow(now);
    if (est === null) return this.renderST;
    const want = est - INTERP_DELAY * (this.timeScale || 1);
    // Real time, not the frame's capped step: on a slow machine the capped
    // step runs short and the picture would fall steadily behind.
    const step = Math.min(0.5, Math.max(0, now - this.renderAt));
    this.renderAt = now;
    if (this.renderST === null || want - this.renderST > (this.timeScale || 1)) {
      this.renderST = want;
    } else {
      const was = this.renderST;
      let next = was + step * (this.clockRate ?? 1);
      next += (want - next) * Math.min(1, step * 2);
      this.renderST = Math.max(was, next);
    }
    return this.renderST;
  }

  /**
   * How far, on the server's clock, our own hull is to be predicted on this
   * frame -- the same pacing as the picture, without the delay: she is drawn
   * where the server has her now. On a server running at half speed she is
   * sailed at half speed, rather than run on ahead of it and pulled back.
   */
  stepOwnClock(now, dt) {
    const est = this.serverNow(now);
    if (est === null) { this.ownAtWall = now; return dt; }
    const step = Math.min(0.5, Math.max(0, now - (this.ownAtWall || now)));
    this.ownAtWall = now;
    if (this.ownST === null || this.ownST === undefined
      || Math.abs(est - this.ownST) > (this.timeScale || 1)) {
      this.ownST = est;
      return Math.min(dt, step * (this.clockRate ?? 1));
    }
    const was = this.ownST;
    let next = was + step * (this.clockRate ?? 1);
    next += (est - next) * Math.min(1, step * 2);
    this.ownST = Math.max(was, next);
    return this.ownST - was;
  }

  /**
   * The two snapshots either side of a moment on the server's clock, how far
   * between them it falls, and -- past the newest -- how far beyond it.
   */
  snapshotPair(renderTime) {
    const snaps = this.snapshots;
    let a = null, b = null;
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i].st <= renderTime) { a = snaps[i]; b = snaps[i + 1] || null; break; }
    }
    // Older than anything held: hold at the oldest, toward the next.
    if (!a) { a = snaps[0] || null; b = snaps[1] || null; }
    if (!a) return null;
    const t = b ? clamp((renderTime - a.st) / Math.max(0.0001, b.st - a.st), 0, 1) : 0;
    // Past the newest snapshot there is nothing to interpolate toward, and a
    // ship held there until the next one lands stops dead and then jumps.
    // She is carried on along her heading at her speed instead, for a short
    // while -- which is where she will turn out to have been, near enough, so
    // when the next snapshot comes in she is already there.
    const ahead = b ? 0 : clamp(renderTime - a.st, 0, EXTRAPOLATE * (this.timeScale || 1));
    return { a, b, t, ahead };
  }

  /**
   * Take up a frame's worth of the last correction, and note where our own
   * hull has got to for the next snapshot to be held up against.
   */
  takeUpFix(dt, now) {
    const ls = this.localShip;
    const f = this.fix;
    if (f) {
      const k = 1 - Math.exp(-dt / CORRECT_TAU);
      ls.x += f.x * k;
      ls.z += f.z * k;
      ls.heading = wrapAngle(ls.heading + f.h * k);
      ls.speed += f.v * k;
      ls.yawRate = (ls.yawRate || 0) + (f.w || 0) * k;
      f.w = (f.w || 0) - (f.w || 0) * k;
      f.x -= f.x * k;
      f.z -= f.z * k;
      f.h -= f.h * k;
      f.v -= f.v * k;
    }
    // On the server's clock, so a snapshot is held up against the same moment.
    const t = this.ownST ?? now;
    const tr = this.ownTrack;
    if (tr.length && t <= tr[tr.length - 1].t) tr.pop();
    tr.push({ t, x: ls.x, z: ls.z, h: ls.heading, v: ls.speed, w: ls.yawRate || 0 });
    while (tr.length > 1 && tr[0].t < t - 2) tr.shift();
  }

  /**
   * Where we had our own hull at a moment just past, off the record of it.
   */
  ownAt(t) {
    const tr = this.ownTrack;
    const ls = this.localShip;
    if (!tr.length || t >= tr[tr.length - 1].t) {
      return { x: ls.x, z: ls.z, h: ls.heading, v: ls.speed, w: ls.yawRate || 0 };
    }
    if (t <= tr[0].t) return tr[0];
    let i = tr.length - 1;
    while (i > 0 && tr[i - 1].t > t) i--;
    const p = tr[i - 1];
    const q = tr[i];
    const k = (t - p.t) / Math.max(1e-6, q.t - p.t);
    return {
      x: lerp(p.x, q.x, k), z: lerp(p.z, q.z, k),
      h: p.h + angleDelta(p.h, q.h) * k, v: lerp(p.v, q.v, k),
      w: lerp(p.w || 0, q.w || 0, k),
    };
  }

  /**
   * Bring the hull we are predicting into line with the server's.
   *
   * She is steered here by the same code the server steers her with, so the
   * two hardly ever disagree by more than a little. She used to be pulled a
   * tenth of the way toward the last snapshot every frame -- but the last
   * snapshot is a position she has already sailed past, and goes on getting
   * staler until the next arrives, so she was dragged back a metre and let go
   * fifteen times a second: a ship that shuddered along instead of sailing.
   *
   * Now the snapshot is compared with where we had her at the moment it was
   * taken, which is like with like, and only the difference is taken up --
   * spread over a third of a second, from wherever she has got to since.
   */
  correctOwn(own, st) {
    const ls = this.localShip;
    const was = this.ownAt(st);
    const ex = own.x - was.x;
    const ez = own.z - was.z;
    // Out by more than she could ever drift: she was put somewhere. Take it.
    if (Math.hypot(ex, ez) > 60) {
      ls.x = own.x;
      ls.z = own.z;
      ls.heading = own.h;
      ls.speed = own.v;
      if (Number.isFinite(own.yr)) ls.yawRate = own.yr;
      this.ownTrack = [];
      this.fix = null;
      this.ownST = st;
      return;
    }
    this.fix = {
      x: ex, z: ez, h: angleDelta(was.h, own.h), v: own.v - was.v,
      w: Number.isFinite(own.yr) ? own.yr - (was.w || 0) : 0,
    };
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
    // The battery it belongs to, for its stops.
    const battery = kind === 'main' ? cls.gun
      : kind === 'sec' ? cls.secondary
        : kind === 'aa' ? ((cls.aa && cls.aa.guns) || []).find((g) => g.mounts === row.specs)
          : null;
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
      stops: battery ? gunLimits(battery) : null,
      // How far out a bank's muzzles are: its sight is past them.
      reach: kind === 'torp' && cls.torpedoes ? cls.torpedoes.reach : undefined,
    };
    // She starts laid where the mounting is already pointing, so taking a gun
    // does not swing the view.
    const own = this.shownShip();
    const head = own ? own.h : this.localShip.heading;
    this.gunYaw = wrapAngle(head + this.gunStartBearing());
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
   * Put a pattern in the water.
   *
   * `only` is one rack or one thrower by its number in the arsenal, or null
   * for the whole battery -- which is what a captain ordering a pattern means:
   * both racks and all six throwers at once, eight charges across the boat's
   * track.
   *
   * The order goes up the wire and nothing happens locally, because whether
   * there is anything left in the stowage and whether the racks have been
   * reloaded are the simulation's to answer. It says no by sending `nodc`.
   */
  dropCharges(only = null) {
    const cls = getClass(this.shownShip()?.c || this.cls.id);
    if (!cls.depthCharges) return;
    const msg = { t: 'dc', ship: this.conned() };
    if (Number.isInteger(only)) msg.i = only;
    this.net.send(msg);
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
    const m = this.gunMount(v);
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
    const sx = Math.sin(this.gunYaw);
    const sz = Math.cos(this.gunYaw);
    // A bank of tubes is laid off a sight at its muzzles, out through the
    // opening in her side it fires through. From abaft it, what there is to
    // see is the backs of four tubes and the deckhead of the passage they
    // stand in.
    if (this.gun.kind === 'torp') {
      const cls = getClass(v.group.userData.classId);
      const sp = this.gun.spec || {};
      const out = (this.gun.reach ?? (cls && cls.torpedoes && cls.torpedoes.reach) ?? 4) + 1.0;
      // A battleship's tube is under her waterline, and a sight at its
      // muzzle is a sight in the sea. Hers is laid from the deck over it --
      // the torpedo officer stands on her forecastle and points the ship --
      // so the eye is over the door the fish goes out of, a man's height and
      // more above her deck. (A submarine's layer is at her periscope, and
      // under water is where her tubes are meant to be looked out of.)
      const inHull = sp.inHull ?? (cls && cls.torpedoes && cls.torpedoes.inHull);
      if (inHull && cls && cls.type !== 'SS' && (sp.my ?? 0) < 0) {
        const yaw = this.gunYaw - v.group.rotation.y;
        GUN_EYE.set((sp.x || 0) + Math.sin(yaw) * out, (v.group.userData.deckY ?? 8) + 2.4,
          (sp.z || 0) + Math.cos(yaw) * out);
        v.group.localToWorld(GUN_EYE);
        return { x: GUN_EYE.x, y: GUN_EYE.y, z: GUN_EYE.z };
      }
      return { x: GUN_EYE.x + sx * out, y: GUN_EYE.y + 0.6, z: GUN_EYE.z + sz * out };
    }
    // A gun in a casemate is laid from its port. Its mounting is inside her,
    // under her deck, and an eye stood up off it and stepped back is an eye in
    // her messdeck looking at the back of her side plating: so it is carried
    // out along the line of sight to where that line goes out through her
    // side, a pace beyond, and a little over the bore -- where the layer's
    // telescope looks out through the embrasure.
    const cm = m.userData.casemate;
    if (cm) {
      const yaw = this.gunYaw - v.group.rotation.y;
      const lx = Math.sin(yaw);
      const lz = Math.cos(yaw);
      const out = lx * Math.sign(cm.x) > 0.2 ? (cm.x - m.position.x) / lx : Math.abs(cm.x - m.position.x);
      GUN_EYE.set(m.position.x + lx * (out + 0.6), cm.y + 1.1, m.position.z + lz * (out + 0.6));
      v.group.localToWorld(GUN_EYE);
      return { x: GUN_EYE.x, y: GUN_EYE.y, z: GUN_EYE.z };
    }
    const { up, back } = this.eyeOffsets(v, m);
    return { x: GUN_EYE.x - sx * back, y: GUN_EYE.y + up, z: GUN_EYE.z - sz * back };
  }

  /** The model of the mounting being held, on her view. */
  gunMount(v) {
    const k = this.gun.kind;
    const list = k === 'main' ? v.turrets
      : k === 'sec' ? v.secMounts
        : k === 'torp' ? v.torpMounts : v.aaMounts;
    return (list && list[this.gun.id]) || null;
  }

  /**
   * How far the layer's eye stands up off his mounting and back along his
   * line of sight, on the bearing he is laid on.
   *
   * Worked out once a degree of bearing and kept, because it is a handful of
   * rays through her whole model and the answer only changes as he trains.
   */
  eyeOffsets(v, m) {
    const local = wrapAngle(this.gunYaw - v.group.rotation.y);
    const key = Math.round(local / (Math.PI / 180));
    const cache = this.gun.eyes || (this.gun.eyes = new Map());
    const now = performance.now();
    const hit = cache.get(key);
    // Not for long, though: the turret in front trains too, and a sight clear
    // of its barrels a moment ago need not be now.
    if (hit && now - hit.t < 1000) return hit;
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
    let up = k === 'main' ? 4.4 : k === 'sec' ? 2.4 : 1.5;
    let back = k === 'main' ? 7.0 : k === 'sec' ? 3.4 : 1.8;
    // And never through anything of hers. A turret low at the foot of her
    // bridge, with another superfiring over it, had its layer's eye stepped
    // back into the next gunhouse. So the eye goes up off the mounting only
    // as far as whatever is over it, and back only as far as whatever is
    // behind -- a few hands short of either.
    // (Looked for from a metre up: the pivot a mounting trains about is down
    // in the ring it stands on.)
    const sx = Math.sin(this.gunYaw);
    const sz = Math.cos(this.gunYaw);
    EYE_UP.set(0, 1, 0);
    const sill = Math.min(1.0, up);
    EYE_TOP.copy(GUN_EYE).addScaledVector(EYE_UP, sill);
    const over = this.structureAlong(v.group, m, EYE_TOP, EYE_UP, up - sill + 0.4);
    if (over < up - sill + 0.4) up = Math.max(sill, sill + over - 0.4);
    EYE_TOP.copy(GUN_EYE).addScaledVector(EYE_UP, up);
    EYE_BACK.set(-sx, 0, -sz);
    const behind = this.structureAlong(v.group, m, EYE_TOP, EYE_BACK, back + 0.6);
    if (behind < back + 0.6) back = Math.max(0, behind - 0.6);
    // And he can see down his line of sight. No.1 trained round on her
    // quarter had the next turret's barrels, reaching out over her, right
    // across the sight. Where something of hers stands in the way close
    // aboard -- on the line of sight or a few degrees either side of it,
    // which is the middle of what a sight's telescope shows -- the eye goes
    // up, a metre at a time, until it sees over it. If only the line itself
    // can be cleared, that; if not even that (a turret laid in to her own
    // bridge), it stays where it was, looking at what is in the way.
    const SIGHT = 40;
    const clear = (turn) => {
      EYE_BACK.set(Math.sin(this.gunYaw + turn), 0, Math.cos(this.gunYaw + turn));
      return this.structureAlong(v.group, m, EYE_TOP, EYE_BACK, SIGHT) >= SIGHT;
    };
    // How far he has to go up, standing `aft` back along the line of sight,
    // to see down it -- and whether he can at all from there.
    const rising = (aft) => {
      EYE_TOP.copy(GUN_EYE).addScaledVector(EYE_UP, up);
      EYE_TOP.x -= sx * aft;
      EYE_TOP.z -= sz * aft;
      let lift = 0;
      let line = -1;
      for (let rise = 0; rise <= 5; rise++) {
        if (rise > 0) {
          if (this.structureAlong(v.group, m, EYE_TOP, EYE_UP, 1.4) < 1.4) break;
          EYE_TOP.y += 1;
        }
        if (!clear(0)) continue;
        if (line < 0) line = rise;
        if (clear(0.07) && clear(-0.07)) return { lift: rise, sees: true };
      }
      return line >= 0 ? { lift: line, sees: true } : { lift, sees: false };
    };
    let { lift, sees } = rising(back);
    // Stepped back under something of hers -- the overhang of the deck above
    // a mounting at the foot of her superstructure -- he cannot go up to see
    // over what is in the way. Nearer his own mounting there may be sky over
    // him, so he tries there before he settles for the view he has.
    for (const aft of [back * 0.5, 0]) {
      if (sees || back <= 0) break;
      const there = rising(aft);
      if (there.sees) { ({ lift, sees } = there); back = aft; }
    }
    const out = { up: up + lift, back, t: now };
    cache.set(key, out);
    return out;
  }

  /**
   * Where a mounting just taken is laid: where it is already pointing -- or,
   * if that is somewhere it cannot fire, the nearest bearing inside its arc
   * that it can. No.3 on the Takao is stowed facing aft into her own bridge,
   * and taking it put a telescope on the face of the bridge from a few metres
   * off.
   */
  gunStartBearing() {
    const { spec } = this.gun;
    const mid = spec.angle || 0;
    const arc = spec.arc ?? Math.PI;
    const v = this.scene.shipViews.get(this.conned());
    const m = v && this.gunMount(v);
    const b = m ? wrapAngle(m.rotation.y + (m.userData.rest || 0)) : mid;
    const fires = (x) => Math.abs(angleDelta(mid, x)) <= arc && layFloor(spec.mask, x) < 0.1;
    if (fires(b)) return b;
    for (let d = 1; d <= 180; d++) {
      for (const s of [1, -1]) {
        const x = wrapAngle(b + (s * d * Math.PI) / 180);
        if (fires(x)) return x;
      }
    }
    return b;
  }

  /**
   * How far along a line from `from` the nearest of her own structure is --
   * anything of the ship's but the mounting `own` -- out to `far`.
   */
  structureAlong(group, own, from, dir, far) {
    EYE_RAY.set(from, dir);
    EYE_RAY.far = far;
    let best = far;
    // Her meshes only, and only the ones that are there: not a line of her
    // rigging a metre off, not a sprite of smoke, not a boat that has gone.
    const walk = (o) => {
      if (o === own || o.visible === false) return;
      if (o.isMesh) {
        EYE_HITS.length = 0;
        o.raycast(EYE_RAY, EYE_HITS);
        for (const h of EYE_HITS) if (h.distance < best) best = h.distance;
      }
      for (const c of o.children) walk(c);
    };
    walk(group);
    return best;
  }

  /**
   * A world bearing, brought inside the arc the mounting being held trains
   * through. A pair of hands on the training gear does not move the stops:
   * the layer's head turns as far as the gun does and no further, and as she
   * turns under him the stops come round with her.
   */
  gunArcYaw(yaw) {
    const spec = this.gun && this.gun.spec;
    if (!spec || !(spec.arc < Math.PI)) return yaw;
    const v = this.scene.shipViews.get(this.conned());
    const own = this.shownShip();
    const head = v ? v.group.rotation.y : own ? own.h : this.localShip.heading;
    const mid = spec.angle || 0;
    const off = angleDelta(mid, wrapAngle(yaw - head));
    return wrapAngle(head + mid + clamp(off, -spec.arc, spec.arc));
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
  /** Her lamps, as her own bridge has them. */
  ownLamps() {
    if (!this.myLamps) this.myLamps = freshLamps(this.cls);
    return this.myLamps;
  }

  /** What the searchlight panel draws: her plan, and her lamps on it. */
  lampPanel() {
    if (this.sunk) return null;
    const view = this.scene.shipViews.get(this.shipId);
    if (!view || !view.lamps) return null;
    const plan = lampPlan(view, this.scene.renderer);
    const lamps = this.ownLamps();
    const half = plan.map
      ? { halfX: plan.map.halfX, halfZ: plan.map.halfZ }
      : { halfX: this.cls.hull.beam * 0.5 + 2, halfZ: this.cls.hull.length * 0.5 + 2 };
    return {
      ...half,
      image: planImage(plan),
      lamps: plan.lamps.map((p, k) => ({ x: p.x, z: p.z, side: p.side, name: p.name, on: !!lamps[k]?.on })),
    };
  }

  /** The plan a man walks her deck on: her own, or a rough one if her model gave none. */
  manPlan(view) {
    if (view.manMap) return view.manMap;
    const plan = lampPlan(view, this.scene.renderer);
    const cls = view.cls || this.cls;
    view.manMap = plan.map || roughPlan(cls.hull.length, cls.hull.beam, freeboardOf(cls) + 1);
    return view.manMap;
  }

  /** What the human view panel draws: her plan, and whether a place is on it. */
  humanPanel() {
    if (this.sunk) return null;
    const view = this.scene.shipViews.get(this.shipId);
    if (!view) return null;
    const plan = lampPlan(view, this.scene.renderer);
    const map = this.manPlan(view);
    const cls = this.cls;
    return {
      halfX: map.halfX, halfZ: map.halfZ,
      image: planImage(plan),
      onShip: (x, z) => onPlan(map, x, z),
      describe: (x, z) => placeOn(cls.hull.length, cls.hull.beam, x, z),
    };
  }

  /** Stand on her deck at (x, z) in her frame, facing her bow. */
  deployMan(x, z) {
    const view = this.scene.shipViews.get(this.shipId);
    if (this.sunk || !view) return;
    const map = this.manPlan(view);
    if (!onPlan(map, x, z)) return;
    this.standMan(view, map, x, z, false);
  }

  /** Her wheelhouse, built the first time anybody goes up to it. */
  shipBridge(view) {
    if (!view.bridge) {
      view.bridge = buildBridge(view.cls || this.cls, lampPlan(view, this.scene.renderer));
      view.group.add(view.bridge.group);
    }
    return view.bridge;
  }

  /** Up to her bridge: stood behind the helmsman, looking out over the bow. */
  deployBridge() {
    const view = this.scene.shipViews.get(this.shipId);
    if (this.sunk || !view) return;
    const br = this.shipBridge(view);
    this.standMan(view, br.walk, br.stand.x, br.stand.z, true);
  }

  /**
   * Show her wheelhouse, or put it away. While it is up, her own model is cut
   * away round it -- her bridge on the outside is a solid block, and a man
   * stood in the room would otherwise be stood inside that block.
   */
  showBridge(view, on) {
    const br = view && view.bridge;
    if (!br || br.shown === on) return;
    br.shown = on;
    br.group.visible = on;
    const r = this.scene.renderer;
    if (on) r.localClippingEnabled = true;
    if (!br.planes) {
      const b = br.clipBox;
      // Facing out of the box: what is inside all six is cut away.
      br.local = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -b.max.x),
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), b.min.x),
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -b.max.y),
        new THREE.Plane(new THREE.Vector3(0, -1, 0), b.min.y),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), -b.max.z),
        new THREE.Plane(new THREE.Vector3(0, 0, -1), b.min.z),
      ];
      br.planes = br.local.map((p) => p.clone());
    }
    const mats = new Set();
    view.group.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      for (let p = o; p; p = p.parent) if (p === br.group) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
    });
    for (const m of mats) {
      m.clippingPlanes = on ? br.planes : null;
      m.clipIntersection = on;
      m.needsUpdate = true;
    }
    if (on) this.placeBridge(view);
  }

  /** Her wheelhouse's cut, where she is this frame, and her wheel and telegraphs on her. */
  placeBridge(view) {
    const br = view.bridge;
    view.group.updateMatrixWorld(true);
    br.local.forEach((p, k) => br.planes[k].copy(p).applyMatrix4(view.group.matrixWorld));
    const ls = this.localShip;
    // Her telegraph runs astern, stop, then four speeds ahead.
    const ahead = ls.notch <= MIN_NOTCH ? -1 : (ls.notch - MIN_NOTCH - 1) / Math.max(1, MAX_NOTCH - MIN_NOTCH - 1);
    br.set({ rudder: ls.rudder || 0, throttle: ahead, heading: ls.heading || 0 });
  }

  /** Put a man on her at (x, z) on `map`, facing her bow. */
  standMan(view, map, x, z, room) {
    if (this.gun) this.manGun(null);
    if (this.lamp) this.leaveLamp(true);
    if (this.flight) this.leaveFlight();
    if (this.shellCam) this.toggleShellCam();
    this.man = freshMan(map, x, z, 0);
    this.man.map = map;
    this.man.room = room;
    this.showBridge(view, room);
    this.jumpAsked = false;
    this.watching = null;
    this.hud.setWatching(null);
    this.hud.setWatchBanner(null);
    this.freeCamera(false);
    this.roam = null;
    if (this.hud.panel) this.hud.togglePanel(this.hud.panel);
    this.hud.setHumanSight({ where: this.manWhere() });
    this.hud.alert('Stick or WASD to walk, drag to look');
    audio.click();
  }

  /** Back to the bridge from wherever you have walked or swum to. */
  leaveMan(quiet = false) {
    if (!this.man) return;
    this.showBridge(this.scene.shipViews.get(this.shipId), false);
    this.man = null;
    this.manSaid = null;
    this.hud.setHumanSight(null);
    this.input.orbiting = false;
    const cam = this.scene.camera;
    cam.near = 2;
    cam.updateProjectionMatrix();
    if (!quiet) audio.click();
  }

  /** Where the man is, in a word or two, for the line over the screen. */
  manWhere() {
    const m = this.man;
    if (!m) return '';
    if (m.aboard && m.room) {
      const view = this.scene.shipViews.get(this.shipId);
      const w = view && view.bridge ? view.bridge.where(m.x) : 'house';
      if (w === 'house') return this.cls.type === 'SS' ? 'Conning tower' : 'Bridge — wheelhouse';
      return `Bridge wing, ${w} side`;
    }
    if (m.aboard) return placeOn(this.cls.hull.length, this.cls.hull.beam, m.x, m.z);
    if (m.swimming) return 'In the water';
    if (m.grounded) return 'Ashore';
    return 'Overboard';
  }

  /** Over the side: out of her frame and into the world's, falling. */
  manOverboard(view) {
    const m = this.man;
    if (view) {
      const p = view.group.localToWorld(new THREE.Vector3(m.x, m.y, m.z));
      m.x = p.x; m.y = p.y; m.z = p.z;
      m.yaw = wrapAngle(m.yaw + view.group.rotation.y);
    }
    m.aboard = false;
    m.grounded = false;
    m.swimming = false;
    m.held = 0;
    // Out of her wheelhouse, if that is where he was: it is hers, not the sea's.
    if (m.room) {
      m.room = false;
      m.map = view ? this.manPlan(view) : m.map;
      this.showBridge(view, false);
    }
  }

  /** One frame of the man: his head off the drag, his feet off the stick and keys. */
  stepMan(dt) {
    const m = this.man;
    const look = this.input.takeMouse();
    if (!this.hud.stickMouse) {
      // Dragging right looks right; dragging up looks up.
      m.yaw = wrapAngle(m.yaw - look.x);
      m.pitch = clamp(m.pitch - look.y, -1.35, 1.35);
    }
    const k = this.input;
    const key = (...c) => (c.some((x) => k.down(x)) ? 1 : 0);
    const st = this.hud.stick || { x: 0, y: 0 };
    const move = {
      fwd: clamp(key('KeyW', 'ArrowUp') - key('KeyS', 'ArrowDown') + st.y, -1, 1),
      side: clamp(key('KeyD', 'ArrowRight') - key('KeyA', 'ArrowLeft') + st.x, -1, 1),
      run: !!key('ShiftLeft', 'ShiftRight') || Math.hypot(st.x, st.y) > 0.96,
      jump: !!this.jumpAsked,
    };
    this.jumpAsked = false;
    const view = this.scene.shipViews.get(this.shipId);
    const map = m.map;
    if (m.aboard) {
      if (!view || this.sunk) this.manOverboard(view);
      else if (stepDeck(m, move, dt, map) === 'overboard') {
        this.manOverboard(view);
        this.hud.alert('Man overboard!');
      }
    }
    if (!m.aboard) {
      const ocean = this.scene.ocean;
      const local = new THREE.Vector3();
      // Her plan under a point in the world, and how far over his feet her
      // deck is there; null where she is not.
      const her = (x, z) => {
        if (!view || this.sunk) return null;
        view.group.worldToLocal(local.set(x, m.y, z));
        const d = deckAt(map, local.x, local.z);
        return Number.isFinite(d) ? { x: local.x, z: local.z, rise: d - local.y, deck: d } : null;
      };
      const ground = (x, z) => (this.world ? groundHeight(this.world, x, z) : -100);
      const r = stepWater(m, move, dt, {
        sea: (x, z) => ocean.heightAt(x, z),
        ground,
        // Her side is a wall to a man in the water -- unless it is low enough
        // to haul himself up on, which a boat's is.
        blocked: (x, z) => { const h = her(x, z); return !!h && h.rise > MAN.climb; },
      });
      if (r === 'splash') { audio.splash(60, null); this.hud.alert('In the water — swim'); }
      const h = her(m.x, m.z);
      if (h && h.rise <= MAN.climb && (move.fwd || move.side)) {
        // Up her side and onto her deck.
        m.aboard = true;
        m.x = h.x; m.z = h.z; m.y = h.deck;
        m.yaw = wrapAngle(m.yaw - view.group.rotation.y);
        m.vy = 0; m.grounded = true; m.swimming = false;
        this.hud.alert('Back aboard');
      } else if (h && h.rise > 0) {
        // She has come down on him: he is shoved out from under her side.
        const out = Math.sign(h.x) || 1;
        let lx = h.x;
        for (let n = 0; n < 200 && onPlan(map, lx, h.z); n++) lx += out * 0.4;
        const p = view.group.localToWorld(new THREE.Vector3(lx, 0, h.z));
        m.x = p.x; m.z = p.z;
      }
    }
    const where = this.manWhere();
    if (where !== this.manSaid) {
      this.manSaid = where;
      this.hud.setHumanSight({ where });
    }
  }

  /** Where his eye is in the world and which way he is looking. */
  manEye(out = new THREE.Vector3(), dir = new THREE.Vector3()) {
    const m = this.man;
    const view = this.scene.shipViews.get(this.shipId);
    let yaw = m.yaw;
    if (m.aboard && view) {
      view.group.updateMatrixWorld(true);
      out.set(m.x, m.y + MAN.eye, m.z);
      view.group.localToWorld(out);
      yaw = m.yaw + view.group.rotation.y;
    } else out.set(m.x, m.y + MAN.eye, m.z);
    const c = Math.cos(m.pitch);
    dir.set(Math.sin(yaw) * c, Math.sin(m.pitch), Math.cos(yaw) * c);
    return { pos: out, dir };
  }

  /** Go and stand behind one of her searchlights, and switch it on. */
  enterLamp(k) {
    const view = this.scene.shipViews.get(this.shipId);
    if (this.sunk || !view || !view.lamps || !view.lamps.lamps[k]) return;
    if (this.gun) this.manGun(null);
    const l = this.ownLamps()[k];
    if (!l) return;
    this.lamp = { k, name: view.lamps.plan.lamps[k].name, sentAt: 0 };
    // Trained out on her own side to start with, which is where a lamp on
    // that wing is looking when it is not looking at anything.
    if (!l.on && Math.abs(l.yaw) < 1e-3) {
      const side = view.lamps.plan.lamps[k].side || 0;
      l.yaw = side * 0.6;
      l.pitch = -0.04;
    }
    l.on = true;
    this.sendLamp(k);
    this.watching = null;
    this.hud.setWatching(null);
    this.hud.setWatchBanner(null);
    this.freeCamera(false);
    if (this.hud.panel) this.hud.togglePanel(this.hud.panel);
    this.hud.setLampSight({ name: this.lamp.name, on: true });
    this.hud.alert(`${this.lamp.name} — drag to train`);
    audio.click();
  }

  /** Come away from the searchlight. It stays as it was left: lit, if it was. */
  leaveLamp(quiet = false) {
    if (!this.lamp) return;
    this.lamp = null;
    this.hud.setLampSight(null);
    this.input.orbiting = false;
    if (!quiet) audio.click();
  }

  /** The switch on the lamp you are behind. */
  switchLamp() {
    if (!this.lamp) return;
    const l = this.ownLamps()[this.lamp.k];
    if (!l) return;
    l.on = !l.on;
    this.sendLamp(this.lamp.k);
    this.hud.setLampSight({ name: this.lamp.name, on: l.on });
    audio.click();
  }

  /** The drag, on the lamp: round and up and down, told to the ship a few times a second. */
  trainLamp() {
    const m = this.input.takeMouse();
    const l = this.ownLamps()[this.lamp.k];
    if (!l) return;
    if (m.x || m.y) {
      // Dragging right looks right, which is to starboard: her -x, a smaller
      // yaw. Dragging up looks up.
      l.yaw = wrapAngle(l.yaw - m.x);
      l.pitch = clamp(l.pitch - m.y, LAMP_PITCH.min, LAMP_PITCH.max);
      this.lampDirty = true;
    }
    const now = performance.now();
    if (this.lampDirty && now - (this.lamp.sentAt || 0) > 120) {
      this.lamp.sentAt = now;
      this.lampDirty = false;
      this.sendLamp(this.lamp.k);
    }
  }

  sendLamp(k) {
    const l = this.ownLamps()[k];
    if (!l) return;
    this.net.send({ t: 'lamp', k, on: l.on, yaw: l.yaw, pitch: l.pitch });
    this.hud.setLampsLit(this.ownLamps());
  }

  onOwnSunk() {
    this.leaveLamp(true);
    this.sunk = true;
    this.hud.setSunk(true);
    this.hud.alert('Abandon ship');
    audio.say('abandon', this.cls.nation);
    this.input.releaseLock();
    // The camera stays with her.
    //
    // It used to be put straight onto whatever of the division was still
    // afloat, and onto the chart two thousand metres up if nothing was -- so
    // the one ship in the action a captain could not watch go down was his
    // own, and the chart view answered a drag by sliding a map about. She is
    // the thing worth watching at that moment, so the camera is put on her and
    // left there; every other mark on the plot is still one tap away.
    // And it is left exactly where it was: no cut, no zoom, no orbit put on
    // her from somewhere else. She is going down in front of you.
    // The flag shifts anyway, because the fight goes on -- but shifting the
    // flag and moving the camera are two different things and used to be one.
    // Her helm answers the chart from here; see `conned`.
    const next = this.nextAfloat();
    if (next) {
      this.flag = next.i;
      this.selected = next.i;
      this.hud.setSelected(this.selected);
      this.hud.alert(`Flag transferred to ${next.n}`);
    }
  }

  /**
   * Two ships have met.
   *
   * Steel on steel, not an explosion: a deep grinding crash, a sheet of spray
   * thrown up between them and plating going in where each of them was
   * struck. Where it went in is in each ship's own frame, so the hole is in
   * her stem or her side wherever she has moved to by the time it is drawn.
   */
  onCollide(ev, d) {
    const fx = this.scene.effects;
    const big = clamp((ev.v || 0) / 10, 0.2, 1.6);
    if (ev.kind === 'rise' || ev.kind === 'keel') {
      // Under her keel: what comes up is sea, thrown up round her by a boat's
      // buoyancy or by her bottom going over one, and the wreckage of a boat
      // that broke on her.
      fx.splash(ev.x, ev.z, 300 + big * 420, { kind: 'bow' });
      if ((ev.out || []).some((o) => o.what === 'split')) this.scene.debris.burst(ev.x, 1, ev.z, 3 + big * 4, 0.5);
    } else {
      fx.splash(ev.x, ev.z, 160 + big * 360, { kind: 'bow' });
      this.scene.debris.burst(ev.x, 5, ev.z, 3 + big * 7, 0.6);
    }
    if (ev.kind === 'rise' || ev.kind === 'keel') audio.slam({ x: ev.x, y: -2, z: ev.z }, 0.4 + big * 0.5);
    audio.crash({ x: ev.x, y: 3, z: ev.z }, ev.v || 0);
    for (const o of ev.out || []) {
      const view = this.scene.shipViews.get(o.ship);
      // A cut or a lost bow is drawn by the cut itself (see onCut).
      if (!view || o.what === 'cut' || o.what === 'chop' || o.what === 'split') continue;
      const cls = view.cls;
      const fb = freeboardOf(cls);
      // Her stem goes in at and above her waterline; a gash in her side runs
      // down below it, which is where the water comes in; a boat run over or
      // come up under her is along her bottom.
      const y = o.what === 'keel' ? -cls.hull.draft * 0.85
        : o.what === 'crush' ? 0
          : o.what === 'gash' || o.what === 'scrape' ? 0.5 : fb * 0.4;
      // The same tear on every client: shaped by where on her it was.
      const seed = Math.round(o.lx * 7 + o.lz * 13 + (ev.x || 0) * 3 + (ev.z || 0) * 5 + o.ship * 31);
      if (o.what === 'scratch') {
        // Scraped, not holed: a streak along her as long as she was moving.
        view.scrapeAt(o.lx, y, o.lz, 1.5 + (ev.v || 0) * 0.35, Math.max(0.3, o.r || 0.3), seed);
        continue;
      }
      view.stove(o.lx, y, o.lz, Math.max(0.8, o.r || 1.5), seed);
      if (o.ship === this.shipId) {
        this.markHole(...this.ownWorld(o.lx, o.lz), o.what === 'dent' ? 'he' : 'pen');
      }
    }
    // Who hit whom, for the people who were there.
    const mine = ev.a === this.shipId || ev.b === this.shipId;
    if (mine) {
      const other = ev.a === this.shipId ? ev.b : ev.a;
      const name = this.names.get(other) || 'another ship';
      const me = (ev.out || []).find((o) => o.ship === this.shipId);
      const what = me ? me.what : 'scrape';
      const rose = ev.kind === 'rise';
      this.hud.alert(what === 'scratch' ? `Collision with ${name} — plating scraped`
        : what === 'smash' ? `Collision with ${name} — our bow is stove in`
        : what === 'gash' ? `Rammed by ${name} — holed`
          : what === 'dent' ? `We have rammed ${name}`
            : what === 'split' ? (rose ? `Surfaced under ${name} — our hull has broken in two` : `Run down by ${name} — our hull has broken in two`)
              : what === 'crush' ? (rose ? `Surfaced under ${name} — tower and casing crushed` : `Run down by ${name} — tower and casing crushed`)
                : what === 'keel' ? (rose ? `${name} surfaced under us — bottom holed` : `We have run over ${name} — bottom holed`)
                  : `Collision with ${name}`);
      this.shake = Math.max(this.shake, 0.4 + big * 0.5);
      audio.alarm();
    } else {
      const ours = [ev.a, ev.b].some((i) => {
        const v = this.scene.shipViews.get(i);
        return v && v.team === this.team;
      });
      if (ours && d < 1) this.hud.ribbon('COLLISION');
    }
  }

  /** A point in our own ship's frame, put out into the world. */
  ownWorld(lx, lz) {
    const ls = this.localShip;
    const w = localToWorld(lx, lz, ls.heading);
    return [ls.x + w.x, 0.5, ls.z + w.z];
  }

  /**
   * A piece of a ship has been cut off her: another ship's stem right through
   * her, or her own bow torn away on something it could not go through.
   *
   * She is torn open where it happened (see cutHer in scene.js), and the piece
   * that went is let go into the sea beside her.
   */
  onCut(ev) {
    const view = this.scene.shipViews.get(ev.ship);
    const fx = this.scene.effects;
    if (view) {
      view.cutHer(ev.at, ev.keep, { v: ev.v || 0, h: ev.h ?? view.group.rotation.y });
      // Where she parted, in the world.
      view.group.updateMatrixWorld(true);
      const p = new THREE.Vector3(0, 2, ev.at * view.cls.hull.length / 2);
      view.group.localToWorld(p);
      const size = 0.5 + view.cls.hull.length / 320;
      const near = this.distanceFade(p.x, p.z);
      this.scene.debris.burst(p.x, 6, p.z, 6 + size * 6, 0.9);
      fx.splash(p.x, p.z, 420 + size * 300, { kind: 'bomb' });
      fx.splash(p.x + (Math.random() - 0.5) * 12, p.z + (Math.random() - 0.5) * 12, 300, { kind: 'shell' });
      // And everything in her bunkers on that length of her, onto the sea.
      this.scene.oil.spill(p.x, p.z, 40 + view.cls.hull.length * 0.6, false);
      audio.tear({ x: p.x, y: 3, z: p.z }, size);
      this.shake = Math.max(this.shake, ev.ship === this.shipId ? 1.2 : 0.4 * near);
    }
    const lost = cutLoses(ev.at, ev.keep);
    const ends = lost.length === 1 && (lost[0] === 'bow' || lost[0] === 'stern');
    const who = ev.ship === this.shipId ? 'We have' : `${this.names.get(ev.ship) || 'A ship'} has`;
    const whose = ev.ship === this.shipId ? 'our' : 'her';
    this.hud.alert(ends ? `${who} lost ${whose} ${lost[0]}` : `${who} been cut in two`);
    if (ev.by === this.shipId && ev.ship !== this.shipId) this.hud.ribbon(ends ? 'BOW TORN OFF' : 'CUT IN TWO', 'cit');
  }

  /**
   * What a ship does on the way down that the rest of the battle has to hear.
   *
   * The model works out what is happening to her -- her back going, the
   * magazine the fire finally reached, the oil coming up out of her bunkers --
   * because that follows from her damage and her attitude and nothing else
   * knows those. What it cannot do is make a noise, throw wreckage, or put
   * oil on the sea, because none of those belong to one ship. So it puts what
   * happened into a list in its own frame and this empties it.
   */
  deathThroes(view, s, x, z, h) {
    const fx = this.scene.effects;
    const near = this.distanceFade(x, z);
    view.group.updateMatrixWorld(true);
    for (const t of view.throes) {
      // Her own frame into the world: she is heeled, trimmed and half under,
      // and a thing that happened forty metres abaft her bridge happened where
      // her bridge actually is.
      const p = new THREE.Vector3(0, 2, t.z || 0);
      view.group.localToWorld(p);
      const wx = Number.isFinite(p.x) ? p.x : x;
      const wz = Number.isFinite(p.z) ? p.z : z;
      if (t.kind === 'break') {
        // Steel parting under its own weight: not an explosion, a tearing --
        // and then a great deal of the ship falling into the sea at once.
        this.scene.debris.burst(wx, 6, wz, 5 + (t.size || 0) * 5, 0.8);
        fx.splash(wx, wz, 340);
        audio.tear({ x: wx, y: 3, z: wz }, t.size || 1);
        this.shake = Math.max(this.shake, s.i === this.shipId ? 0.9 : 0.35 * near);
        const who = this.names.get(s.i) || 'A ship';
        this.hud.alert(`${who}: broken in two`);
      } else if (t.kind === 'blast') {
        // The fire got to what was left of her ammunition.
        fx.magazine(wx, 8, wz, t.size || 1);
        this.scene.magazineBurst(wx, 10, wz, t.size || 1);
        this.scene.debris.burst(wx, 14, wz, 9 + (t.size || 1) * 8, 1);
        fx.splash(wx, wz, 800);
        // Heard everywhere, like any magazine.
        audio.magazine({ x: wx, y: 8, z: wz });
        this.shake = Math.max(this.shake, s.i === this.shipId ? 1.5 : 0.8);
        const who = this.names.get(s.i) || 'A ship';
        this.hud.alert(`${who}: blown up`);
        // And her oil goes up with her.
        this.scene.oil.spill(wx, wz, 90 + (t.size || 1) * 120, true);
      } else if (t.kind === 'slam') {
        // The half that came up falling back flat into the sea: thousands of
        // tonnes of steel arriving at once, and the biggest splash of the day.
        fx.splash(wx, wz, 520 + (t.size || 1) * 380, { kind: 'bomb' });
        fx.splash(wx + (Math.random() - 0.5) * 30, wz + (Math.random() - 0.5) * 30,
          380 + (t.size || 1) * 200, { kind: 'shell' });
        audio.slam({ x: wx, y: 0, z: wz }, t.size || 1);
        this.shake = Math.max(this.shake, s.i === this.shipId ? 0.7 : 0.25 * near);
      } else if (t.kind === 'oil') {
        this.scene.oil.spill(wx, wz, t.volume || 30, !!t.burning);
      }
    }
    view.throes.length = 0;
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
    // The bridge you are standing on, and the language her officers give
    // their orders in.
    const bridge = this.conned();
    const navy = this.scene.shipViews.get(bridge)?.cls?.nation || this.cls?.nation || 'usa';
    if (navy !== this.ordersFor) { this.ordersFor = navy; audio.readyOrders(navy); }
    for (const ev of events) {
      const d = this.distanceFade(ev.x, ev.z);
      switch (ev.e) {
        case 'order':
          // The word, a second before the weapon goes: shouted on the bridge
          // you are standing on, in her own navy's language.
          if (ev.ship === bridge) audio.order(ev.k, navy, !!ev.many);
          break;
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
          let heard = null;
          if (view) {
            const kind = ev.t != null ? 'turret' : ev.s != null ? 'sec' : null;
            const which = ev.t != null ? ev.t : ev.s;
            if (kind) {
              // And which way each barrel is laid, elevation and all: the
              // blast goes out along the bore, and a gun cocked up at twenty
              // degrees for a long shot throws its smoke up into the air.
              const aims = [];
              const pts = view.muzzles(kind, which, [], aims);
              for (let i = 0; i < pts.length; i++) {
                const p = pts[i];
                fx.muzzle(p.x, p.y, p.z, ev.b, ev.cal, aims[i]);
                if (!heard) heard = { x: p.x, y: p.y, z: p.z };
                lit = true;
              }
            }
          }
          // A coast gun has no ship and no model to ask; so has a mounting the
          // scene has not built. Both fall back on where the simulation says
          // the muzzle is, which is the same point, less the roll.
          if (!lit) fx.muzzle(ev.x, ev.y ?? 18, ev.z, ev.b, ev.cal);
          audio.gun(ev.cal, heard || { x: ev.x, y: ev.y ?? 18, z: ev.z }, ev.b || 1);
          if (ev.ship === this.shipId && getSettings().recoil) this.kick(ev.cal);
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
          // Or a formation of heavies, which does carry its own height. Five
          // thousand feet of tracer looks nothing like the two hundred metres
          // a torpedo bomber gets, and drawing the one for the other put every
          // burst meant for a bomber stream into the sea alongside the ship.
          const hv = pl ? null : (this.bombersNow || []).find((q) =>
            Math.abs(q.x - ev.tx) < 400 && Math.abs(q.z - ev.tz) < 400);
          const ty = pl ? this.planeHeight(pl) : (hv ? hv.y : 220);
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
          let mounts = [];
          if (view) {
            const bearing = Math.atan2(ev.tx - view.group.position.x,
              ev.tz - view.group.position.z);
            mounts = view.bearingOn('aa', bearing, 0.85);
            // How much of the burst each barrel is responsible for, so a ship
            // with eighty guns bearing does not send eighty times the tracer
            // of one with four -- the simulation has already decided how much
            // fire there is, and this only decides where it comes out.
            let bores = 0;
            for (const m of mounts) bores += (m.userData.muzzles || []).length;
            const share = Math.max(3, Math.round((ev.n * 3) / Math.max(1, bores)));
            for (const m of mounts) {
              for (const p of view.muzzles('aa', view.aaMounts.indexOf(m))) {
                // A gun the sea has closed over fires nothing, whatever it
                // was laid on.
                if (p.y < 0.4) continue;
                this.scene.flak.fire(p.x, p.y, p.z, ev.tx, ty, ev.tz,
                  ev.cal, share, fx);
                fired++;
              }
            }
          }
          const gy = view ? view.group.position.y + 14 : 16;
          // And no tracer out of the middle of a ship that is under.
          if (!fired && (!view || (!mounts.length && gy > 1))) {
            this.scene.flak.fire(ev.x, gy, ev.z, ev.tx, ty, ev.tz, ev.cal, ev.n, fx);
          }
          if (!fired && view && mounts.length) break;
          audio.aa(ev.cal, ev.n, { x: ev.x, y: gy, z: ev.z });

          break;
        }
        case 'splash': fx.splash(ev.x, ev.z, ev.cal, { kind: ev.bomb ? 'bomb' : 'shell' }); audio.splash(ev.cal, { x: ev.x, y: 1, z: ev.z }, !!ev.bomb); break;
        case 'landhit': {
          const g = groundHeight(this.scene.world, ev.x, ev.z);
          fx.hit(ev.x, g + 4, ev.z, 'he', ev.cal);
          fx.debris(ev.x, g + 3, ev.z, Math.max(6, ev.cal / 12));
          break;
        }
        case 'crater':
          // The hole it made. By its own number, so a standalone build -- where
          // the client is handed the very world the simulation is digging into
          // -- does not dig it a second time. See applyCrater.
          applyCrater(this.scene.world, ev.c);
          break;
        case 'collapse': {
          // Ground giving way. Not a burst: a slide, with the dust of it going
          // up where the hillside was.
          applyCrater(this.scene.world, ev.c);
          const g = groundHeight(this.scene.world, ev.x, ev.z);
          fx.debris(ev.x, g + 6, ev.z, Math.min(60, ev.r));
          audio.explosion(1.1, { x: ev.x, y: g, z: ev.z });
          if (this.hud) this.hud.ribbon('GROUND GAVE WAY', 'miss');
          break;
        }
        case 'batteryFell':
          // A gun going down with the ground it was standing on. The mounting
          // itself follows the snapshot every frame and needs nothing here --
          // but the earthwork round it was cut to fit a hill that is no longer
          // that shape, so the view is thrown away and built again against the
          // ground as it is now.
          this.scene.removeBatteryView(ev.id);
          fx.debris(ev.x, ev.y + 4, ev.z, 14);
          break;
        case 'batterySilenced':
          fx.explosion(ev.x, (ev.y || 0) + 6, ev.z, 1.6);
          audio.explosion(1.6, { x: ev.x, y: (ev.y || 0) + 6, z: ev.z });
          break;
        case 'hit': {
          // A round that got into her goes off inside her: an explosion, as
          // big as the damage it did. One that did not get in is a flash and
          // a puff against her armour. Neither leaves a mark on the ship.
          if (PENETRATING_KINDS.has(ev.kind)) {
            this.scene.shipBurst(ev.x, ev.y ?? 8, ev.z, blastScale(ev.dmg));
          } else {
            fx.hit(ev.x, ev.y ?? 8, ev.z, ev.kind, ev.cal);
          }
          // And what it did to her plating, where it struck: a hole for a
          // round that got in, a gouge, a dent or a scrape for one that did
          // not. See ShipView.hitMark.
          this.scene.shipViews.get(ev.victim)?.hitMark(ev);
          if (ev.kind !== 'splash' && Number.isFinite(ev.lx) && Number.isFinite(ev.lz)) {
            const L = this.hitsOn.get(ev.victim) || [];
            L.push([ev.lx, ev.y ?? 4, ev.lz, ev.kind]);
            if (L.length > 90) L.shift();
            L.v = (L.v || 0) + 1;
            this.hitsOn.set(ev.victim, L);
          }
          // Heard from wherever it struck, whoever's it was.
          audio.hit(ev.kind, ev.cal, { x: ev.x, y: ev.y ?? 8, z: ev.z });
          // Our own round: cut to her section and watch it go in, if the
          // captain wants to.
          // Only while riding a salvo down: the rounds of the ship being
          // followed, ours or anybody's, are shown going into whatever they
          // struck -- and outside the shell camera the battle is left alone.
          if (this.penCam && getSettings().penCam !== false && this.shellCam && !this.shellIsBomb
            && ev.owner === this.shellFrom) {
            this.penCam.offer(ev, true);
          }
          if (ev.owner === this.shipId) {
            const label = { citadel: 'CITADEL', pen: 'PENETRATION', overpen: 'OVERPENETRATION', he: 'HIT', splash: 'SPLASH', shatter: 'SHATTER', ricochet: 'RICOCHET' }[ev.kind] || 'HIT';
            // Which of her guns it was. A battleship's secondaries shattering
            // on an enemy's belt read exactly like her main battery doing it,
            // and made it look as if nothing she fired would go through.
            const sec = ev.cal && this.cls?.gun?.caliber && ev.cal < this.cls.gun.caliber ? ` (${ev.cal} mm)` : '';
            this.hud.ribbon(`${label}${sec}${ev.dmg ? `  ${ev.dmg}` : ''}`, ev.kind === 'citadel' ? 'cit' : (ev.kind === 'shatter' || ev.kind === 'ricochet') ? 'miss' : '');
          } else if (ev.victim === this.shipId) {
            this.shake = Math.max(this.shake, 0.5);
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
        case 'torpLaunch':
          audio.torpedo({ x: ev.x, y: 4, z: ev.z });

          // A bank whose fish are drawn leaving it throws them out now.
          this.scene.shipViews.get(ev.ship)?.group.userData.fireTubes?.(ev.mount, this.time);
          break;
        case 'torpDud':
          // Struck her before its pistol had armed: a thump against her side
          // and a little white water, and nothing else.
          fx.splash(ev.x, ev.z, 90, { kind: 'bow' });
          if (ev.owner === this.shipId) this.hud.ribbon('TORPEDO DUD');
          if (ev.victim === this.shipId) this.hud.alert('Torpedo struck us — a dud, no damage');
          break;
        case 'torpHit':
          // Under her side, not on it: what shows is the column of water it
          // throws up, not a fireball.
          // A torpedo opens a hole the better part of ten metres across, under
          // the waterline, and throws a good deal of the side of the ship into
          // the air with it.
          {
            const v = this.scene.shipViews.get(ev.victim);
            if (v) {
              // The hole and nothing else: the column of water it throws up is
              // what is seen.
              v.punch(ev.x, (ev.y ?? -2), ev.z, holeRadius('torpedo', 1000), 0.4);
            }
          }
          // A torpedo goes off under the water, so what is seen from a bridge
          // is not the fireball but the column it throws up alongside -- taller
          // than anything a gun makes, which is why one hit ends an argument.
          fx.splash(ev.x, ev.z, 620, { kind: 'torp' });
          audio.torpHit({ x: ev.x, y: -1, z: ev.z });
          if (ev.owner === this.shipId) this.hud.ribbon('TORPEDO HIT', 'cit');
          if (ev.victim === bridge) {
            // Which side it came in on: her starboard side is her -x side.
            const v = this.scene.shipViews.get(bridge);
            if (v) {
              v.group.updateMatrixWorld(true);
              const p = v.group.worldToLocal(new THREE.Vector3(ev.x, 0, ev.z));
              audio.say(p.x < 0 ? 'torpStbd' : 'torpPort', navy);
            }
          }
          if (ev.victim === this.shipId) {
            this.hud.alert('Torpedo hit');
            // Under her belt and through it: on the board it is a red ring
            // below her waterline, with the sea running in through it.
            this.markHole(ev.x, ev.y ?? -2, ev.z, 'torpedo');
          }
          break;
        // The depth charge gear. A pattern going over is a row of splashes off
        // her quarter and the arbors of the throwers going out on either beam;
        // a charge firing is a great white dome of water standing up out of a
        // flat sea a long way astern of whoever dropped it.
        case 'dcDrop':
          if (ev.ship === this.shipId) {
            // And the one warning that matters. A charge set shallow goes off
            // ten metres under a ship that has not got out from over it, and
            // what that does to her own stern is the reason the book says
            // fifteen knots.
            const own = this.ownSnap;
            const slow = own && Math.abs(own.v || 0) < 5;
            const shallow = own && (own.dcs ?? 99) <= 20;
            this.hud.alert(slow && shallow
              ? `Pattern away — ${ev.n} charges. GET WAY ON HER`
              : `Pattern away — ${ev.n} charges`);
          }
          // The cans going over the stern and the throwers' charges into the sea.
          audio.splash(80, { x: ev.x, y: 1, z: ev.z });
          break;
        case 'swamp': {
          // A sea over one of her own mountings: out until it has run off.
          if (ev.ship !== this.shipId) break;
          const now = performance.now();
          if (now - (this.swampSaid || 0) < 4000) break;
          this.swampSaid = now;
          const row = ev.k === 'main' ? this.cls.turrets?.[ev.i] : null;
          this.hud.alert(row && row.name
            ? `${row.name} turret swamped`
            : ev.k === 'main' ? 'Turret swamped' : 'Secondary mounting swamped');
          break;
        }
        case 'saved': {
          // Her parties got enough of the sea out of her in time: she has
          // come back up and she steams on.
          const who = ev.ship === this.shipId ? 'We have' : `${this.names.get(ev.ship) || 'A ship'} has`;
          this.hud.alert(`${who} been saved -- ship stabilised`);
          break;
        }
        case 'sinking': {
          // She is going. Not gone: whatever is still above the water goes on
          // fighting, and she has as long as the sea gives her.
          const who = ev.ship === this.shipId ? 'We are' : `${this.names.get(ev.ship) || 'A ship'} is`;
          const mins = Math.max(1, Math.round((ev.T || 60) / 60));
          this.hud.alert(`${who} sinking${ev.kind === 'capsize' ? ' and capsizing' : ''} -- ${mins} min`);
          // Going, and still fighting for as long as there is a gun above
          // the water.
          if (ev.ship === this.shipId) audio.say('lastShell', this.cls.nation);
          break;
        }
        case 'break': {
          // Her back has gone: off a magazine, or going down so hard by one end
          // that the middle of her could not carry it. From where she is, not
          // from level -- see breakHer and stepHalves in scene.js.
          const view = this.scene.shipViews.get(ev.ship);
          // Off a magazine she is not broken, she is blown apart, and the
          // detonation that comes with this in the same tick does that.
          if (view && !view.halves && ev.why !== 'magazine') {
            view.breakHer(ev.at);
            view.throes.push({ kind: 'break', z: (ev.at || 0) * view.cls.hull.length / 2, size: 0.5 + view.cls.hull.length / 320 });
          }
          break;
        }
        case 'collide':
          this.onCollide(ev, d);
          break;
        case 'cut':
          this.onCut(ev);
          break;
        case 'dcAttack':
          if (ev.ship === this.shipId) this.hud.ribbon('DEPTH CHARGE ATTACK');
          break;
        case 'dcBurst': {
          // Water does not compress, so what a charge makes is not a fireball
          // but a mound: the sea goes white over an acre of itself and then
          // stands up in a column with the shock ring running out from under
          // it. Bigger the shallower it went off, because that is how much of
          // the energy reaches the surface at all.
          const deep = Math.max(0, -(ev.y || 0));
          const size = 780 * Math.max(0.28, 1 - deep / 70);
          fx.splash(ev.x, ev.z, size, { kind: 'dc' });
          audio.depthCharge({ x: ev.x, y: -deep * 0.3, z: ev.z }, deep);
          this.shake = Math.max(this.shake, 0.3 * Math.max(0, 1 - d));
          break;
        }
        case 'dcHit':
          if (ev.owner === this.shipId) this.hud.ribbon('DEPTH CHARGE HIT', 'cit');
          if (ev.victim === this.shipId) {
            this.hud.alert('Depth charge alongside');
            audio.alarm();
          }
          break;
        case 'fire': if (ev.ship === this.shipId) this.hud.alert('Fire on deck'); break;
        case 'flood': if (ev.ship === this.shipId) { this.hud.alert('Flooding'); audio.alarm(); } break;
        case 'smoke': fx.smokeScreen(ev.x, ev.z); break;
        case 'repair':
          if (ev.ship === bridge) audio.say('seal', navy);
          if (ev.ship === this.shipId) {
            // The first call-away shores; the second gets the pumps going.
            this.hud.ribbon(ev.stage >= 2 ? 'PUMPS RUNNING' : 'SHORING UP');
          }
          break;
        case 'sink': {
          // Out of the fight. She does not blow up for it -- a ship blows up
          // when her magazine goes, and that is its own event -- she goes on
          // going down from where the battle has her, and the air coming out
          // of her heaves the sea up white over her.
          this.sinkInfo = this.sinkInfo || new Map();
          this.sinkInfo.set(ev.ship, ev);
          fx.splash(ev.x, ev.z, 300, { kind: 'dc' });
          audio.founder({ x: ev.x, y: -1, z: ev.z });
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
          // Stopped dead, as the battle has her (see stepMovement): our own
          // prediction must not sail on.
          if (ev.ship === this.shipId && this.localShip) {
            const ls = this.localShip;
            ls.blown = true; ls.speed = 0; ls.yawRate = 0; ls.driftX = 0; ls.driftZ = 0;
            this.fix = null;
          }
          const cls = getClass(ev.cls);
          const half = cls.hull.length / 2;
          const sec = SECTIONS.find((q) => q.k === ev.at);
          const z0 = (sec && sec.from !== null ? Math.max(-1, sec.from) : -0.2) * half;
          const z1 = (sec && sec.to !== null ? Math.min(1, sec.to) : 0.2) * half;
          // The magazine itself is under the turrets it fed, so that is where
          // she goes from rather than the middle of the compartment.
          const fed = cls.turrets.filter((t) => sectionAt(
            Math.max(-1, Math.min(1, (t.z || 0) / half))) === ev.at);
          const zc = fed.length
            ? fed.reduce((a, t) => a + t.z, 0) / fed.length : (z0 + z1) / 2;
          // How much went up. Older servers do not say: a battleship's worth
          // on a battleship, a destroyer's on a destroyer.
          const tons = ev.t ?? cls.hull.length * cls.hull.beam * 0.12;
          const power = blastPower(tons);
          // Where on her it was, in the world.
          let wx = ev.x, wz = ev.z;
          if (view) {
            // A ship of any size is taken apart by it: her two ends left
            // afloat, the length between thrown into the air. A launch that
            // is already in pieces is opened up where it went instead.
            const apart = cls.hull.length > 60 && view.blowApart(zc, tons);
            const mid = apart ? zc : view.blowOut(z0, z1).mid;
            view.group.updateMatrixWorld(true);
            const p = new THREE.Vector3(0, 6, mid);
            view.group.localToWorld(p);
            wx = p.x; wz = p.z;
          }
          // From big to enormous, by what was in her.
          const size = 0.6 + power * 1.6;
          fx.magazine(wx, 8, wz, size);
          this.scene.magazineBurst(wx, 10, wz, size);
          this.scene.debris.burst(wx, 14, wz, 6 + 22 * power, 1 + power * 0.4);
          fx.splash(wx, wz, 500 + 700 * power);
          this.shake = Math.max(this.shake, ev.ship === this.shipId ? 1.6 : 0.9);
          // Heard everywhere: the loudest thing in the action carries the
          // whole of it, though it still comes in late and dull from far off.
          audio.magazine({ x: wx, y: 8, z: wz });
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
          }
          fx.explosion(wx, wy + 2, wz, 2.2);
          this.scene.debris.burst(wx, wy + 3, wz, 4.5, 0.8);
          audio.explosion(1.7, { x: wx, y: wy + 2, z: wz });
          this.shake = Math.max(this.shake, ev.ship === this.shipId ? 0.9 : 0.35);
          if (ev.ship === this.shipId) this.hud.alert('Fire reached the ready-use');
          break;
        }
        case 'fall': {
          // A mounting with the deck under it shot away: down through the hole.
          const view = this.scene.shipViews.get(ev.ship);
          if (view && view.dropMount(ev.k, ev.i)) {
            this.scene.debris.burst(ev.x, ev.y, ev.z, ev.k === 'main' ? 3.5 : 1.6, 0.4);
            audio.hit('pen', ev.k === 'main' ? 406 : 127, { x: ev.x, y: ev.y, z: ev.z });
          }
          if (ev.ship === this.shipId) {
            this.hud.alert(ev.k === 'main' ? 'Turret has gone through the deck'
              : ev.k === 'sec' ? 'Secondary mount through the deck' : 'AA mount through the deck');
          }
          break;
        }
        case 'bombMount': {
          // A bomb on a mounting. Through its roof it is finished; on top of
          // it, it is shaken and damaged.
          const view = this.scene.shipViews.get(ev.ship);
          if (ev.pen && view) view.setKnocked([`${ev.k}:${ev.i}`]);
          const name = ev.k === 'main' ? 'Turret' : ev.k === 'sec' ? 'Secondary mount' : 'AA mount';
          if (ev.ship === this.shipId) {
            this.hud.alert(ev.pen ? `Bomb through ${name.toLowerCase()} roof -- knocked out`
              : `Bomb on ${name.toLowerCase()} -- armour held, gun damaged`);
          }
          break;
        }
        case 'blast': {
          // Her ready-use ammunition going off round a mounting: a burst on
          // her deck, a hole where it was, and the fire it starts.
          const size = 1.2 + (ev.cal || 40) / 1000 * 3.5;
          fx.explosion(ev.x, ev.y + 1.5, ev.z, size);
          this.scene.debris.burst(ev.x, ev.y + 2, ev.z, 2 + size * 1.6, 0.6 + size * 0.15);
          audio.explosion(size, { x: ev.x, y: ev.y + 1.5, z: ev.z });
          const view = this.scene.shipViews.get(ev.ship);
          if (view && view.plating && !view.rupture) {
            const p = new THREE.Vector3(ev.x, ev.y, ev.z);
            view.group.updateMatrixWorld(true);
            view.group.worldToLocal(p);
            view.holeAt(p.x, p.y, p.z, ev.rad || 1.5);
            view.scorchAt(p.x, p.y, p.z, (ev.rad || 1.5) * 2.5, 0.8);
          }
          this.shake = Math.max(this.shake, ev.ship === this.shipId ? 0.8 : 0.3);
          if (ev.ship === this.shipId) this.hud.alert('Ready-use ammunition exploded');
          break;
        }
        case 'airDrop': {
          // The fish going into the sea: a short row of splashes across the
          // squadron's line, small ones, because a torpedo enters nose first.
          for (let i = 0; i < 3; i++) {
            fx.splash(ev.x + (i - 1) * 26 + (Math.random() - 0.5) * 14,
              ev.z + (Math.random() - 0.5) * 26, 150, { kind: 'drop' });
          }
          audio.splash(90, { x: ev.x, y: 1, z: ev.z });
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
          // The deck lays her starting smoke with the battle's own effects.
          if (v.group.userData.deck) v.group.userData.deck.fx = fx;
          // Which of her three types is going, and how long the deck has to get
          // her off: the first of a strike comes up from the hangar with the
          // whole evolution to go through, and the ones after her are quicker.
          v.group.userData.launch?.(this.time, ev.r, ev.d);
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
          // Off the rack it was hanging on, in the machine it was hanging in.
          const rel = this.releaseOf(ev.i);
          this.scene.bombs.drop(ev.x, y, ev.z, ev.tx, ev.tz, !!ev.hit, fx, 1.8, 108, rel);
          break;
        }
        case 'airGuns': {
          // Her guns: tracer reaching out from her to whatever she is on. The
          // aeroplane the player is flying draws her own, off the stick,
          // without waiting for the wire to tell her she fired.
          if (this.flight && this.flight.id === ev.i) break;
          // Where the rounds are actually going. A burst from a flight
          // somebody is flying carries its own height and its own end point,
          // because the rounds are real and they go where they were pointed;
          // one from a flight on the autopilot still comes as a flat line
          // between two ships and is drawn the old way.
          const from = (this.planesNow || []).find((q) => q.i === ev.i);
          const y = Number.isFinite(ev.y) ? ev.y : (from ? this.planeHeight(from) : 200);
          const ty = Number.isFinite(ev.ty) ? ev.ty : (ev.air ? y - 8 : 22);
          this.scene.flak.fire(ev.x, y - 1, ev.z, ev.tx, ty, ev.tz, 12.7, 10, fx);
          // The flicker at her muzzles, off her own model: a strike coming in
          // has guns going on the wings of the machines flying it.
          // Drawn on her, at each gun, for as long as the burst lasts -- see
          // airFx -- rather than left in the air where she was when it began.
          if (from) this.airBursts.set(ev.i, this.time + 0.35);
          break;
        }
        case 'rearGun': {
          // Her gunner, on something of ours or theirs astern of her. The gun
          // swings onto it in `rearGun`, frame by frame; here is the tracer.
          this.rearAim.set(ev.i, { t: ev.t, x: ev.x, y: ev.y, z: ev.z, at: this.time });
          const d = this.planeDrawn.get(ev.i);
          const g = d && rearGunOf(d.kind);
          if (!d || !g || !d.n || this.time - d.at > 1) break;
          const tgt = (this.planesNow || []).find((q) => q.i === ev.t);
          const tx = tgt ? tgt.x : ev.x, tz = tgt ? tgt.z : ev.z;
          const ty = tgt ? this.planeHeight(tgt) : ev.y;
          // From each machine whose gunner has a line on her, not out of the
          // middle of the formation.
          for (let i = 0; i < d.n; i++) {
            const mz = this.rearMuzzle(d, g, i, RG_V);
            if (!mz) continue;
            this.scene.flak.fire(mz.x, mz.y, mz.z, tx, ty, tz, 7.7, 6, fx, 7, 0);
          }
          break;
        }
        case 'deckCrash': {
          // An aeroplane at eighty knots on a flight deck with a hole in it.
          // She goes into it, and there is a fire on the deck where she went.
          fx.explosion(ev.x, 20, ev.z, 1.6);
          fx.debris(ev.x, 20, ev.z, 20);
          audio.explosion(1.2, { x: ev.x, y: 20, z: ev.z });
          if (ev.ship === this.shipId) this.hud.alert('Crash on deck — flight deck out');
          break;
        }
        case 'ram': {
          // An aeroplane into a ship. A bigger event than a bomb, because it
          // is an aeroplane and everything in her tanks arriving at once.
          const big = ev.armed ? 2.4 : 1.5;
          fx.explosion(ev.x, ev.y, ev.z, big);
          fx.debris(ev.x, ev.y, ev.z, ev.armed ? 34 : 22);
          audio.explosion(big, { x: ev.x, y: ev.y, z: ev.z });
          if (ev.ship === this.shipId) {
            this.hud.alert(ev.armed ? 'Aircraft into the ship — she was carrying'
              : 'Aircraft into the ship');
          } else if (ev.team === this.team) {
            this.hud.ribbon(`RAM  ${ev.dmg}`, 'cit');
          }
          // And if it was the aeroplane under the player, that is the end of
          // the ride: she has arrived, and there is nothing left of her to fly.
          if (this.flight && this.flight.id === ev.i) this.leaveFlight(true);
          break;
        }
        case 'goingIn':
          // One of ours has decided to go into a ship: shot to pieces with
          // nowhere to go, a float plane with no deck to come home to, or a
          // fighter with nothing left in the air to fight.
          if (ev.team === this.team && !(this.flight && this.flight.id === ev.i)) {
            this.hud.ribbon('KAMIKAZE RUN', 'cit');
          } else if (ev.ship === this.shipId) {
            this.hud.alert('Enemy aircraft diving on us');
          }
          break;
        case 'planeCrash':
          fx.explosion(ev.x, ev.y + 3, ev.z, 1.5);
          fx.debris(ev.x, ev.y + 3, ev.z, 20);
          audio.explosion(1.3, { x: ev.x, y: ev.y + 3, z: ev.z });
          break;
        case 'airHit':
          // Where a burst from an aeroplane's guns actually arrived. Small, and
          // there are a lot of them, so it is sparks and nothing else.
          fx.hit(ev.x, ev.y, ev.z, 'splash', ev.air ? 8 : 13);
          break;
        case 'flakOut':
          if (ev.ship === this.shipId) {
            this.hud.alert(ev.dead ? 'Close-range mounting wrecked'
              : 'Close-range mounting out — crew down');
          }
          break;
        case 'planeDown': {
          // One machine out of a formation that flies on. She goes down where
          // she was actually flying rather than at her leader's position, and
          // she goes down the way she was lost: shot to pieces, burning, out of
          // fuel, or crippled and turning back with a dead engine.
          const at = slotAt(ev.slot || 0, ev.h || 0);
          const from = (this.planesNow || []).find((q) => q.i === ev.i);
          const wreckKind = typeOf(from && from.k, (from && from.r) || 'torpedo');
          this.oneDown({
            x: ev.x + at.x, y: (ev.y || 220) + at.y, z: ev.z + at.z,
            heading: ev.h || 0, why: ev.why,
            role: (from && from.r) || 'torpedo', kind: wreckKind,
            // What was done to her, so she goes down with it in her. The
            // flight's last report is the nearest thing there is to this one
            // machine's, and it is what the gunner who hit her was looking at.
            holes: unpackHoles(from && from.hl),
            span: (AERO[wreckKind] || AERO.avenger).span,
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
    // Taken off again when the battle ends (see dispose). The input outlives
    // every battle, and a handler left on it kept the whole of a finished
    // battle in memory -- and answered every key pressed in the next one,
    // sending its orders into a fight it was no longer part of.
    this.off.push(this.input.on('key', (code) => this.onKey(code)));
    this.off.push(this.input.on('scope', (on) => { this.scoped = on; }));
    this.off.push(this.input.on('wheel', (dir) => {
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
    }));
  }

  onKey(code) {
    const ls = this.localShip;
    // In the cockpit the flying keys fly her (see stepFlight) and do nothing
    // to the ship she came off.
    if (this.flight && ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'KeyQ', 'KeyE', 'KeyC'].includes(code)) return;
    // Walking about her, the walking keys walk him and Space jumps.
    if (this.man) {
      if (code === 'Space') { this.jumpAsked = true; return; }
      if (code === 'Escape') { this.leaveMan(); return; }
      if (['KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(code)) return;
    }
    switch (code) {
      case 'KeyW': this.setNotch(this.connedNotch() + 1); audio.click(); break;
      case 'KeyS': this.setNotch(this.connedNotch() - 1); audio.click(); break;
      // Her guns and her torpedoes are fought by her own officers. What is
      // left to her captain is where she goes, when her aircraft go, and
      // getting her fires out.
      case 'KeyQ': this.setCourse(null); break;
      case 'Digit4': this.net.send({ t: 'strike', ship: this.conned() }); break;
      case 'KeyP': this.togglePilotView(); break;
      case 'KeyR': this.net.send({ t: 'repair', ship: this.conned() }); break;
      case 'KeyT': this.net.send({ t: 'smoke', ship: this.conned() }); break;
      // The racks. One key, because there is one order: let go.
      case 'KeyG': this.dropCharges(null); break;
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
      // Open water is where the ship under orders goes: the one being
      // watched, or whoever the flag is in.
      this.setCourse(at, this.conned());
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
  setCourse(at, id = this.conned()) {
    if (!at) {
      if (id === this.shipId) {
        this.wayX = null; this.wayZ = null;
        this.net.send({ t: 'goto', x: null, z: null });
      } else this.net.send({ t: 'goto', ship: id, x: null, z: null });
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
      this.shellIsBomb = false;
      this.shellHold = null;
      this.shellWas = null;
      this.hud.setShellCam(true, false);
    }
    const same = hit && this.watching
      && this.watching.kind === hit.kind && this.watching.id === hit.id;
    // Your own ship, picked off the chart. While you are standing on her that
    // is a request to come home -- the camera that follows her is the one you
    // already have. Once she has foundered she is a wreck like any other and
    // the orbit goes on her: it was refused outright before, which meant the
    // only hull in the action a captain could not watch was his own.
    const self = hit && hit.kind === 'ship' && hit.id === this.shipId;
    if (!hit || same || (self && !this.sunk)) {
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
      // An aeroplane close, the way her own pilot's chase camera has her: a
      // ship's three lengths off is a speck when the length is twelve metres.
      const near = hit.kind === 'plane' ? 1.4 : 3.2;
      this.watchDist = near;
      this.watchDistNow = near;
      this.watchFov = 52;
      this.watchFovNow = 52;
      // A squadron of heavies is watched from outside it, not from inside one
      // of them. The point-of-view camera stands where a lookout on the thing
      // would have his head, and a formation has no bridge to stand on: the
      // eye came out four metres inside the leader's fuselage, so a captain
      // who picked the heavies off the plot was shown the inside of a
      // mid-upper turret. The wheel still puts him in her if he wants it.
      if (hit.kind === 'bomber') {
        this.watchPov = false;
        this.watchEl = 0.18;
      }
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
        : hit.kind === 'bomber' ? snap.bombers
          : hit.kind === 'torp' ? snap.torps
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
      // Nothing in the air. Wait over whatever let it go until it lets go
      // again -- which for a stick is the squadron and not a ship: a bomb has
      // no gun and no ship behind it, so looking for one found nothing and
      // the camera came back with no answer at all.
      if (this.shellIsBomb) {
        const bm = (this.bombersNow || []).find((x) => x.i === this.watching.ship);
        return bm ? { x: bm.x, y: bm.y, z: bm.z, span: 80, eye: 4 } : null;
      }
      const from = snap.ships.find((x) => x.i === this.watching.ship);
      if (!from) return null;
      const fc = getClass(from.c);
      return {
        x: from.x, y: this.scene.ocean.heightAt(from.x, from.z) * 0.5, z: from.z,
        span: fc.hull.length, eye: 14 + fc.hull.superstructure * 12,
      };
    }
    if (this.watching.kind === 'torp') {
      // The fish, running just under the surface: the camera rides close
      // behind and above her, and the wake she leaves runs out under it.
      const tp = (this.torpsNow || []).find((x) => x.i === this.watching.id);
      if (tp) {
        this.torpLast = { x: tp.x, z: tp.z, t: 3 };
        return { x: tp.x, y: 0.5, z: tp.z, span: 10, eye: 1.2, close: true };
      }
      // She has run her course or found her ship: hold on the spot a few
      // seconds, which is where the column goes up.
      const last = this.torpLast;
      if (last && last.t > 0) return { x: last.x, y: 4, z: last.z, span: 60, eye: 3, close: true };
      return null;
    }
    if (this.watching.kind === 'bomber') {
      // A formation, watched from outside it. Her leader is the mark, but what
      // is being watched is the whole vic: two hundred metres across and as
      // much again from the leader to the last machine. So the span is the
      // formation's and not one aeroplane's, and it is not flagged `close` --
      // that is the tight orbit a shell and a single flight want, and on a
      // thirty-metre bomber it put the camera inside her fuselage, where all
      // there is to see is the inside of a mid-upper turret.
      const bm = (this.bombersNow || []).find((x) => x.i === this.watching.id);
      if (!bm) return null;
      return { x: bm.x, y: bm.y, z: bm.z, span: 80, eye: 4 };
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
        // Her own span, so the orbit is laid off the aeroplane she is: a Zero
        // is not an Avenger, and a camera set for the larger stood well back
        // from the smaller.
        const span = (AERO[typeOf(pl.k, pl.r || 'torpedo')] || AERO.avenger).span || 12;
        return { x: pl.x, y: this.planeHeight(pl), z: pl.z, span, eye: 2.2, close: true };
      }
      return null;
    }
    // Your own hull. She is drawn off the local prediction and not off the
    // snapshot -- see update -- so the camera has to read the same thing, or
    // it stands a boat's length astern of the ship it is watching and shakes
    // every time a snapshot lands.
    if (this.watching.id === this.shipId) {
      const ls = this.localShip;
      return {
        x: ls.x, y: this.scene.ocean.heightAt(ls.x, ls.z) * 0.5, z: ls.z,
        span: this.cls.hull.length,
        eye: 14 + this.cls.hull.superstructure * 12,
        h: ls.heading,
      };
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

  /**
   * The squadron whose stick the bomb camera would follow.
   *
   * The one being flown, or the one being watched. A bomb is a shell with
   * `bomb` written on it and flies down the same pipeline, so the camera that
   * rides a sixteen-inch round rides a four-thousand-pounder without knowing
   * the difference -- all it needs is to be told which formation let it go.
   */
  bombSource() {
    if (this.flight && this.flight.heavy) return this.flight.id;
    if (this.watching && this.watching.kind === 'bomber') return this.watching.id;
    return 0;
  }

  /** Ride the salvo or the stick, or come back off it. */
  toggleShellCam() {
    if (this.shellCam) {
      this.shellCam = false;
      this.shellFrom = 0;
      this.shellIsBomb = false;
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
    // A stick first, when there is one to ride. Somebody watching a squadron
    // of heavies, or flying one, wants to see where the bombs went, and that
    // is the only question the camera can usefully answer up there.
    const bomb = this.bombSource();
    const from = bomb || this.shellSource();
    if (!from) return;
    this.shellCam = true;
    this.shellIsBomb = !!bomb;
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
    // Whose rounds these are: a ship's salvo, or a squadron's stick. A bomb
    // has no gun and no ship behind it, so it is matched on the formation that
    // let it go rather than on an owner that is not there.
    const heavy = this.shellIsBomb
      ? snap && (snap.bombers || []).find((q) => q.i === this.shellFrom) : null;
    const ship = this.shellIsBomb
      ? null : snap && snap.ships.find((q) => q.i === this.shellFrom && q.a);
    if (!heavy && !ship) { this.toggleShellCam(); return; }
    const mine = (this.shellsNow || []).filter((q) => (this.shellIsBomb
      ? q.bm === this.shellFrom : q.o === this.shellFrom));
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
      // Named for the thing that fired it, not for her captain: what you are
      // riding is the Iowa's salvo or the Lancasters' stick, and `n` on a
      // snapshot is the man on the bridge.
      name: heavy
        ? `${(BOMBERS[heavy.b] || BOMBERS.lancaster).name} stick`
        : getClass(ship.c).name,
    };
    this.watchPov = false;
    if (!was || was.kind !== 'shell') {
      this.hud.setWatching(this.watching);
      this.hud.setWatchBanner(this.watching, false);
    }
  }

  /**
   * The aeroplane whose armament the arsenal panel is showing.
   *
   * The one being flown, or the one being watched off the plot -- so a captain
   * who has sent a squadron out and is watching it go in can look through the
   * same list the pilot has, and sit in a turret without taking the aeroplane.
   */
  airInHand() {
    const snap = this.snapshots[this.snapshots.length - 1];
    if (!snap) return null;
    if (this.flight) {
      return this.flight.heavy
        ? { kind: this.flight.kind, id: this.flight.id, heavy: true }
        : { kind: this.flight.kind, id: this.flight.id, heavy: false };
    }
    const w = this.watching;
    if (!w) return null;
    if (w.kind === 'bomber') {
      const bm = (snap.bombers || []).find((q) => q.i === w.id);
      return bm ? { kind: bm.b || 'lancaster', id: bm.i, heavy: true } : null;
    }
    if (w.kind === 'plane') {
      const pl = (snap.planes || []).find((q) => q.i === w.id);
      return pl ? { kind: typeOf(pl.k, pl.r || 'torpedo'), id: pl.i, heavy: false } : null;
    }
    return null;
  }

  /**
   * Go and sit in one of her turrets, or come out of it.
   *
   * The same idea as manning a gun on a ship: the camera goes to the mounting
   * itself and the drag turns the gunner's head, with the turret following him
   * round inside whatever cone it actually has. A mid-upper swings the whole
   * way round and cannot look below her own spine; a ball turret sees
   * everything under her and nothing above; a tail turret has a narrow cone
   * dead astern -- which is why a Fortress was attacked from ahead.
   */
  manTurret(row) {
    const air = this.airInHand();
    if (!air || !row || !row.turret) return;
    if (this.turret && this.turret.name === row.turret) {
      this.turret = null;
      this.hud.setAirGun(null);
      audio.click();
      return;
    }
    const spec = (HEAVY[air.kind] || HEAVY.lancaster).turrets
      .find((t) => t.name === row.turret);
    if (!spec) return;
    this.turret = {
      id: air.id,
      heavy: air.heavy,
      name: row.turret,
      spec,
      // Where the gunner is looking, in the aeroplane's own frame. He starts
      // looking down his mounting's own centreline, which for a tail turret is
      // astern and for everything else is ahead.
      yaw: spec.name === 'tail' || spec.name === 'gondola' ? Math.PI : 0,
      pitch: 0,
    };
    this.hud.setAirGun(row.turret);
    audio.click();
  }

  /**
   * Where a turret gunner's head is, and which way he may point it.
   *
   * The mounting's place on the aeroplane is the model's own -- the same three
   * numbers that put the cupola on her -- carried into the world by whatever
   * she is doing at the time. The cone is the model's too, so the view a
   * gunner has is exactly the arc his guns have and he cannot look through his
   * own tail.
   */
  turretEye() {
    const t = this.turret;
    if (!t) return null;
    let at = null;
    if (t.heavy) {
      const bm = (this.bombersNow || []).find((q) => q.i === t.id);
      if (bm) at = { x: bm.x, y: bm.y, z: bm.z, heading: bm.h, bank: bm.bank || 0, pitch: 0.05 };
      const mine = this.flight && this.flight.heavy && this.flight.id === t.id
        ? this.flight.pilot : null;
      if (mine) {
        at = { x: mine.x, y: mine.y, z: mine.z, heading: mine.heading,
          bank: mine.bank, pitch: mine.pitch };
      }
    } else {
      const pl = (this.planesNow || []).find((q) => q.i === t.id);
      if (pl) at = { x: pl.x, y: this.planeHeight(pl), z: pl.z, heading: pl.h, bank: 0, pitch: 0 };
      const mine = this.flight && !this.flight.heavy && this.flight.id === t.id
        ? this.flight.pilot : null;
      if (mine) {
        at = { x: mine.x, y: mine.y, z: mine.z, heading: mine.heading,
          bank: mine.bank, pitch: mine.pitch };
      }
    }
    if (!at) return null;
    // The mounting, in her frame and then in the world. Rolled and pitched
    // with her, because a gunner in a banked aeroplane is banked.
    const [lx, ly, lz] = t.spec ? [t.spec.x || 0, t.spec.y || 0, t.spec.z || 0] : [0, 0, 0];
    const cb = Math.cos(at.bank), sb = Math.sin(at.bank);
    const rx = lx * cb - ly * sb;
    const ry = lx * sb + ly * cb;
    const cp = Math.cos(at.pitch), sp = Math.sin(at.pitch);
    const rz = lz * cp - ry * sp;
    const y2 = lz * sp + ry * cp;
    const ch = Math.cos(at.heading), sh = Math.sin(at.heading);
    return {
      x: at.x + rx * ch + rz * sh,
      y: at.y + y2,
      z: at.z - rx * sh + rz * ch,
      heading: at.heading,
      bank: at.bank,
      pitch: at.pitch,
    };
  }

  /** Is the thing being watched a flight or a squadron of ours we could fly? */
  canTake() {
    const w = this.watching;
    if (!w || w.id == null || this.flight) return false;
    const snap = this.snapshots[this.snapshots.length - 1];
    // A heavy squadron is taken the same way and on the same terms: her own
    // side, and nobody else already at the controls.
    if (w.kind === 'bomber') {
      const bm = snap && (snap.bombers || []).find((q) => q.i === w.id);
      if (!bm || bm.tm !== this.team) return false;
      return !bm.pi || bm.pi === this.shipId;
    }
    if (w.kind !== 'plane') return false;
    const pl = snap && (snap.planes || []).find((q) => q.i === w.id);
    // Anything on her own side. A squadron in the air belongs to the fleet
    // rather than to the deck it came off: a destroyer captain with no
    // aircraft of his own can take one of the carrier's, which is most of the
    // point of having a carrier in company. What he cannot do is take one
    // somebody else is already flying.
    if (!pl || pl.tm !== this.team) return false;
    return !pl.pi || pl.pi === this.shipId;
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
    if (this.watching.kind === 'bomber') { this.takeHeavy(); return; }
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
      // Which ship she came off, for the pilot's own corner: a captain may be
      // flying one of another ship's aircraft now.
      from: pl.o,
      // How she has been knocked about, off the wire: six parts, then how hard
      // she is burning, how fast she is leaking and what fuel she has left.
      dm: pl.dm || null,
      // What she can still do, worked out from that -- see `flyWear`.
      wear: { speed: 1, turn: 1, pull: 0 },
      // What she is carrying, and how long since the last word to the server.
      armed: role !== 'fighter',
      // How long since the drop was asked for and not yet answered.
      asked: 0,
      sent: 0,
      guns: 0,
      tracer: 0,
      // Where she is being flown to: the view's own direction, which the
      // thumb moves and the instructor follows. Starts dead ahead of her.
      aimYaw: pl.h,
      aimPitch: 0,
      // The same thing as a direction and a way up: the view is free to go
      // over the top of a loop and come down the other side upside down,
      // which a yaw and a pitch cannot do -- they run out at the vertical.
      aimF: { x: Math.sin(pl.h), y: 0, z: Math.cos(pl.h) },
      aimU: { x: 0, y: 1, z: 0 },
      // What is left in her guns.
      ammo: AMMO[kind] ?? 800,
      guns_n: GUN_COUNT[kind] ?? 2,
    };

    this.watching = null;
    this.hud.setWatching(null);
    this.hud.setWatchBanner(null);
    this.hud.setFlyOffer(false);
    this.hud.setCockpit(true, this.flight.id);
    this.hud.setArmament(this.flight.load && this.flight.load.key);
    // No set pieces any more: she is flown through them by the pilot, by
    // looking where he wants her to go.
    this.hud.setMoves(false);
    // Who she is, in the bottom left corner, and her own damage board across
    // the bottom of the screen.
    const ship = (snap.ships || []).find((q) => q.i === pl.o);
    // A float plane has no deck to come back to: the pilot is told so.
    const cls = ship && SHIP_CLASSES[ship.c];
    const oneWay = !!(cls && cls.planes && (cls.planes.catapult || cls.planes.launcher === 'derrick'));
    this.flight.oneWay = oneWay;
    this.hud.setFlightIdent(PLANE_NAME[kind] || 'Aircraft',
      (ship ? `off ${ship.n || 'the fleet'}` : 'off the fleet') + (oneWay ? ' · one way' : ''));
    if (oneWay) this.hud.alert('Catapult launch: no way back aboard — go in when she is done');
    if (!this.planeBoard) {
      const cv = document.getElementById('fly-damage-board');
      if (cv) this.planeBoard = new PlaneBoard(cv);
    }
    if (this.planeBoard) this.planeBoard.build(kind);
    this.hud.paintFlightDamage(null, PART_ORDER.map((k) => PART_NAME[k]));
    if (this.mapBig) this.toggleMap(false);
    audio.click();
  }

  /**
   * Take a heavy squadron.
   *
   * The same bargain the carrier flights get, and deliberately the same
   * cockpit: the swipe is the stick, the throttle is the throttle, the damage
   * board across the bottom is hers, and the button that says BOMBS is where
   * the button that says BOMBS has always been. What is different is what is
   * under it -- thirty tonnes on a hundred and twenty square metres of wing,
   * which rolls in its own time and will not be hauled about.
   *
   * She is still the simulation's: still shot at by the flak, still hunted by
   * fighters, still burning where she was hit. All that changes is who is
   * steering.
   */
  takeHeavy() {
    const snap = this.snapshots[this.snapshots.length - 1];
    const bm = (snap.bombers || []).find((q) => q.i === this.watching.id);
    if (!bm) return;
    const kind = bm.b || 'lancaster';
    const aero = HEAVY_AERO[kind] || HEAVY_AERO.lancaster;
    const spec = BOMBERS[kind] || BOMBERS.lancaster;
    this.flight = {
      id: bm.i,
      heavy: true,
      role: 'heavy',
      kind,
      // Her own defensive guns, so the tracer off a turret is her calibre.
      calibre: /12\.7|0\.5|\.50/.test(spec.calibre || '') ? 12.7 : 7.7,
      load: {
        key: 'BOMBS', name: 'bombs', away: 'Sticks away',
        // A level bomber drops from wherever her sight says, and that is a
        // very long way from the target: the whole of level bombing is that
        // the bombs are let go miles short and thrown the rest of the way.
        near: 26000,
      },
      pilot: new Pilot(aero, {
        x: bm.x, y: bm.y, z: bm.z, heading: bm.h, speed: aero.vMax * 0.70,
        // Thirty tonnes is thirty tonnes: livelier under a player, but not a
        // fighter.
        agility: 1.15,
      }),
      from: 0,
      dm: bm.dm || null,
      wear: { speed: 1, turn: 1, pull: 0 },
      armed: (bm.ld || 0) > 0,
      loads: bm.ld || 0,
      asked: 0,
      sent: 0,
      guns: 0,
      tracer: 0,
      // How many of her are left, so the formation is drawn with its gaps.
      count: Math.max(1, bm.n || 1),
      aimYaw: bm.h,
      aimPitch: 0,
      aimF: { x: Math.sin(bm.h), y: 0, z: Math.cos(bm.h) },
      aimU: { x: 0, y: 1, z: 0 },
      // A heavy's guns are her turrets, and they are fed from boxes the
      // gunners keep full: nothing to count down.
      ammo: Infinity,
      guns_n: 0,
    };
    this.watching = null;
    this.hud.setWatching(null);
    this.hud.setWatchBanner(null);
    this.hud.setFlyOffer(false);
    this.hud.setCockpit(true, this.flight.id);
    this.hud.setArmament('BOMBS');
    // Nothing that size is rolled or looped.
    this.hud.setMoves(false);
    this.hud.setFlightIdent(spec.name || 'Heavy bomber',
      `${this.flight.count} of ${spec.crew ? 'the squadron' : 'her'}`);
    if (!this.planeBoard) {
      const cv = document.getElementById('fly-damage-board');
      if (cv) this.planeBoard = new PlaneBoard(cv);
    }
    if (this.planeBoard) this.planeBoard.build(kind);
    this.hud.paintFlightDamage(null, PART_ORDER.map((k) => PART_NAME[k]));
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
    // A heavy lets the whole stick go on the run, wherever she is: the sight
    // has already been run and the bombs are thrown two miles forward of the
    // aeroplane. There is no "press home" to be told about, and no range test
    // to pass -- what there is instead is the aimer's error, which is the
    // whole of why she misses.
    if (f.heavy) {
      if (f.asked > 0) return;
      f.asked = 1.2;
      this.net.send({ t: 'dropb', i: f.id });
      audio.click();
      return;
    }
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
  leaveFlight(lost = false, crashed = false) {
    if (!this.flight) return;
    // `land` gives her back to the autopilot and drops the claim on her, so
    // somebody else can take her afterwards. A heavy has no deck to land on
    // and is handed back to her own navigator instead, which is the same
    // thing said differently. One flown into the sea is not given back: the
    // simulation has her at the waterline and puts her in on its next tick.
    if (!(crashed && !this.flight.heavy)) {
      this.net.send({ t: this.flight.heavy ? 'landb' : 'land', i: this.flight.id });
    }
    const heavy = this.flight.heavy;
    this.flight = null;
    this.turret = null;
    this.hud.setAirGun(null);
    this.hud.setCockpit(false);
    if (lost) this.hud.alert(heavy ? 'The squadron is gone' : 'Aircraft down');
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
  stepFlight(dt, sdt = dt) {
    const f = this.flight;
    if (!f) return;
    const snap = this.snapshots[this.snapshots.length - 1];
    const pl = f.heavy
      ? snap && (snap.bombers || []).find((q) => q.i === f.id)
      : snap && (snap.planes || []).find((q) => q.i === f.id);
    // She is gone off the wire: shot down, rammed, out of fuel, or her
    // squadron was released under her.
    //
    // This is not where the pilot gets out. Being killed in the simulation and
    // arriving in the sea are two different moments, and the second one is the
    // one a pilot lives through -- so the cockpit stays where it is and the
    // aeroplane under him becomes a falling one. He rides her down and leaves
    // when she hits the water or blows up, which is the only way out of an
    // aeroplane there has ever been.
    if (!pl) {
      if (!f.orphan) {
        f.orphan = true;
        f.orphanAt = 0;
        this.hud.alert('Going down');
        // What broke when she was hit, off where the rounds were going in --
        // a wing at the root, or her tail -- thrown off her where she is.
        if (!f.heavy) {
          const had = f.cut || 0;
          f.cut = breakCut('shot', f.holes, f.id || 1, had);
          const groups = piecesOf(f.cut, had);
          if (groups.length) {
            const fp = f.pilot;
            const m = new THREE.Matrix4().compose(
              new THREE.Vector3(fp.x, fp.y, fp.z), attitudeOf(fp), new THREE.Vector3(1, 1, 1));
            const n = pathOf(fp);
            this.pieces.spawn(this.scene.flights, f.kind, groups, m,
              { x: n.x * fp.v, y: n.y * fp.v, z: n.z * fp.v }, { seed: f.id || 1 });
            this.hud.alert((f.cut & CUT.tail) ? 'Tail shot away' : 'Wing shot away');
          }
        }
      }
      f.orphanAt += dt;
      // Nothing is driving her any more. Power off, and enough nose-down bias
      // that she comes down rather than gliding to the horizon: this is a
      // machine that has been shot out of the sky, not one being ditched.
      f.pilot.throttle = 0;
      if (f.pilot.pitch > -0.22) f.pilot.pitch -= dt * 0.25;
      // A wing gone is a spin toward the side it went from, and nothing the
      // stick can do about it; a tail gone is a machine with nothing to hold
      // her nose up.
      const fc = f.cut || 0;
      if (fc & (CUT.wingInL | CUT.wingInR)) {
        f.pilot.stickRoll = (fc & CUT.wingInL) ? -1 : 1;
        f.pilot.stickPitch = 0.4;
      } else if (fc & CUT.tail) {
        f.pilot.stickPitch = -0.3;
        f.pilot.stickRoll = 0.25;
      } else {
        f.pilot.stickRoll = 0;
        f.pilot.stickPitch = 0;
      }
      f.pilot.stickYaw = 0;
      f.propTurn = ((f.propTurn || 0) + dt * 4) % (Math.PI * 2);
      // The one backstop. If she has been falling for three minutes and has
      // still not arrived, something is wrong with her and the pilot is not
      // spending the rest of the battle in her.
      if (f.orphanAt > 180) { this.leaveFlight(true); return; }
      const sea = this.scene.ocean.heightAt(f.pilot.x, f.pilot.z);
      f.pilot.gale = galeOf(this.world, this.renderST ?? this.time);
      f.pilot.step(dt, sea);
      if (!f.pilot.alive) {
        // The sea. She goes in where she went in.
        const fx = this.scene.effects;
        fx.splash(f.pilot.x, f.pilot.z, 90);
        fx.debris(f.pilot.x, Math.max(2, f.pilot.y), f.pilot.z, 10);
        this.leaveFlight(true);
      }
      return;
    }
    f.orphan = false;
    // How she has been knocked about, part by part, for her own damage board.
    if (pl.dm) f.dm = pl.dm;
    // And where she has been shot through, so an aeroplane the player rides
    // down goes down with the holes that put her there in her.
    f.holes = unpackHoles(pl.hl);
    // And the end of a wing shot off by them, which she flies on without.
    if (!f.heavy) f.cut = (f.cut || 0) | cutFromHoles(f.holes, f.dm);
    // And how many of her are left in the air beside you.
    if (f.heavy) {
      f.count = Math.max(1, pl.n || 1);
      const left = pl.ld || 0;
      if (left !== f.loads) {
        // A load has gone. The pilot is told once, and the key comes back
        // alive only if there is another run in her.
        if (left < f.loads) this.hud.alert(left > 0 ? 'Sticks away — one load left' : 'Sticks away');
        f.loads = left;
      }
      f.armed = left > 0;
    }
    // What is left on her rack, off the simulation. The moment it says she is
    // empty and she was not before, her ordnance is away and the pilot is told
    // so -- which is the one word in the cockpit that has to be true.
    // A heavy's `d` is her bay doors standing open on the run, which is the
    // start of the drop and not the end of it: what tells her pilot the stick
    // has gone is her load count coming down, above.
    if (pl.d && f.armed && !f.heavy) {
      f.armed = false;
      f.asked = 0;
      if (f.load) this.hud.alert(f.load.away);
    }
    f.asked = Math.max(0, f.asked - dt);

    const stick = this.hud.fly || { throttle: 1, aimX: 0, aimY: 0 };
    const p = f.pilot;
    const keys = this.input;
    // Every manoeuvre is the pilot's own. There are no set pieces: the view
    // goes wherever it is dragged -- up and over the top, round behind her,
    // down past the vertical -- and she is flown after it, so a loop is the
    // view dragged up and over, an Immelmann is the same rolled out at the
    // top, a split-S is the view dragged down behind her, and a break is the
    // view swung hard round.
    this.steerAim(f, stick, dt);
    this.freeLook?.(f, stick, dt);
    // The instructor works the stick, the ailerons and the rudder to put her
    // nose on the marker.
    instruct(p, this.flyAim(f, p));
    // And the ailerons under the pilot's own hand: Q and E roll her for as
    // long as they are held, which is an aileron roll, a barrel roll with the
    // view pulled up as well, or simply flying her on her back.
    const handRoll = (keys.down('KeyE') ? 1 : 0) - (keys.down('KeyQ') ? 1 : 0);
    if (handRoll) {
      p.stickRoll = handRoll;
      p.stickYaw = 0;
      p.stickPitch = Math.max(p.stickPitch, 0.08 * Math.cos(p.bank));
    }
    // What a shot-about aeroplane can still be made to do. An engine at half
    // will not hold full power, a wing panel shot through will not be hauled
    // round, and a machine with one wing worse than the other flies one wing
    // low whatever the stick is doing. The simulation has been keeping this
    // per part since the flak became real; the pilot now feels it.
    const wear = this.flyWear(f);
    p.stickPitch *= wear.turn;
    p.stickRoll = p.stickRoll * wear.turn + wear.pull;
    p.stickYaw *= wear.turn;
    // The keys, for a desk: W and S open and close her up, as they do a ship.
    if (keys.down('KeyW') || keys.down('ShiftLeft')) this.hud.setThrottle(stick.throttle + dt * 0.6);
    if (keys.down('KeyS') || keys.down('ControlLeft')) this.hud.setThrottle(stick.throttle - dt * 0.6);
    p.throttle = stick.throttle * wear.speed;
    const sea = this.scene.ocean.heightAt(p.x, p.z);
    p.gale = galeOf(this.world, this.renderST ?? this.time);
    // Flown in steps no longer than a frame at life speed, so a battle run fast
    // flies her further each frame without flying her any less carefully.
    {
      const n = Math.max(1, Math.ceil(sdt / Math.max(1e-4, dt) - 1e-6));
      for (let i = 0; i < n && p.alive; i++) p.step(sdt / n, sea);
    }
    if (!p.alive) {
      // She has gone into the sea, or into a ship at her waterline. The
      // simulation is told where, at the waterline, so it can put her into
      // whatever hull is there -- and she is not handed back to the
      // autopilot, which would fly her out of the water again.
      this.net.send({
        t: 'fly', i: f.id,
        x: Math.round(p.x), z: Math.round(p.z), h: Math.round(p.heading * 1000) / 1000,
        y: -1, p: Math.round((p.pitch || 0) * 1000) / 1000, v: Math.round(p.v),
      });
      this.leaveFlight(true, true);
      return;
    }

    // The guns: held down, reported in bursts rather than per frame. The
    // tracer is drawn here rather than off the wire coming back, because a
    // pilot pressing the trigger has to see it leave the wing now.
    // Either trigger, or the space bar or the left mouse key at a desk.
    const firing = (stick.firing || keys.down('Space')) && (f.ammo > 0 || !!this.turret);
    f.firingNow = firing && !this.turret && !f.heavy;
    if (firing) {
      if (!this.turret && Number.isFinite(f.ammo)) {
        f.ammo = Math.max(0, f.ammo - (GUN_RPM / 60) * f.guns_n * sdt);
      }
      f.guns += sdt;
      f.tracer -= sdt;
      if (f.tracer <= 0) {
        f.tracer = 0.1;
        // Out of the turret he is sitting in, when he is sitting in one, and
        // out of her wings when he is not. A heavy has no forward guns worth
        // the name: her whole armament is the turrets, and a trigger pressed
        // from the pilot's seat of one does nothing, which is correct.
        if (this.turret) this.turretGuns(f, p);
        else if (!f.heavy) this.wingGuns(f, p);
      }
      if (f.guns > 0.15) {
        if (f.heavy) {
          if (this.turret) {
            const t = this.turret;
            this.net.send({
              t: 'gunb', i: f.id,
              y: Math.round(t.yaw * 1000) / 1000,
              a: Math.round(((t.spec.arc ?? 180) * Math.PI) / 180 * 1000) / 1000,
              dt: Math.round(f.guns * 100) / 100,
            });
          }
        } else {
          this.net.send({ t: 'gun', i: f.id, dt: Math.round(f.guns * 100) / 100 });
        }
        f.guns = 0;
      }
    } else { f.guns = 0; f.tracer = 0; }

    // The sight goes red when there is something under it, which is the whole
    // use of a fixed ring: it says when the aeroplane is pointed at the thing
    // rather than near it.
    this.hud.setSightHot(this.sightOn(f, p, snap));
    this.hud.setAmmo(Number.isFinite(f.ammo) ? f.ammo : 0);

    f.sent -= dt;
    if (f.sent <= 0) {
      f.sent = 0.1;
      this.net.send(f.heavy ? {
        t: 'flyb', i: f.id,
        x: Math.round(p.x), z: Math.round(p.z), h: Math.round(p.heading * 1000) / 1000,
        y: Math.round(p.y * 10) / 10,
        // How hard she is turning, so that everybody else's screen banks the
        // formation the way the pilot has her. `tn` and not `t`, because `t`
        // is the name of the message.
        tn: Math.round(Math.sin(p.bank) * 1000) / 1000,
      } : {
        t: 'fly', i: f.id,
        x: Math.round(p.x), z: Math.round(p.z), h: Math.round(p.heading * 1000) / 1000,
        // How high she is and which way her nose is pointed in the vertical.
        // Both are the pilot's, not the autopilot's, and the simulation needs
        // them: her height decides whether she has flown into anything, and
        // her pitch is half of where her guns are pointing.
        y: Math.round(p.y * 10) / 10, p: Math.round((p.pitch || 0) * 1000) / 1000,
        // And where her guns are actually laid in the vertical, which is her
        // nose rather than her flight path -- the server sends the rounds down
        // it -- and how fast she is going, which they go out at on top of
        // their own muzzle velocity.
        gp: Math.round((p.attitude || 0) * 1000) / 1000,
        v: Math.round(p.v),
        // And her bank, all the way round, so a roll is seen to be a roll.
        bk: Math.round((p.bank || 0) * 1000) / 1000,
      });
    }
    this.hud.paintCockpit({ v: p.v, y: p.y, g: p.g, stall: p.stall, armed: f.armed });
    // Her condition, on the board along the bottom and on the line under it.
    if (this.planeBoard) this.planeBoard.update(f.dm, dt);
    this.hud.paintFlightDamage(f.dm, PART_ORDER.map((k) => PART_NAME[k]));
  }

  /**
   * Move the marker: the thumb's travel since last frame, turned into an angle.
   *
   * Left is left and up is up. A drag the height of the screen swings the
   * view about one and a half times its own field of view, which is quick
   * enough to get round onto something behind her in one sweep and fine
   * enough to lay the ring on a fighter at four hundred metres -- and since
   * it goes as the field of view, it gets finer still with the glass up.
   *
   * At a desk the arrow keys walk it about as well.
   */
  steerAim(f, stick, dt) {
    // Sitting in one of her turrets the drag is the gunner's head, and the
    // aeroplane holds whatever she was last pointed at.
    if (this.turret) { stick.aimX = 0; stick.aimY = 0; return; }
    const cam = this.scene.camera;
    const fov = ((cam && cam.fov) || 62) * Math.PI / 180;
    const k = (fov * 1.5) / Math.max(320, window.innerHeight || 720);
    const keys = this.input;
    const kx = (keys.down('ArrowRight') || keys.down('KeyD') ? 1 : 0)
      - (keys.down('ArrowLeft') || keys.down('KeyA') ? 1 : 0);
    const ky = (keys.down('ArrowUp') ? 1 : 0) - (keys.down('ArrowDown') ? 1 : 0);
    // Screen right is falling heading in this world, so a drag to the right
    // turns the view that way; up raises it -- about the view's own axes, so
    // a drag up keeps going up through the vertical and over the top.
    const yaw = -stick.aimX * k - kx * 1.2 * dt;
    const pitch = -stick.aimY * k + ky * 0.9 * dt;
    stick.aimX = 0;
    stick.aimY = 0;
    const F = f.aimF;
    const U = f.aimU;
    // A heavy is not looped: her marker stops short of the vertical.
    const lim = f.heavy ? Math.sin(0.6) : 2;
    if (pitch) {
      const c = Math.cos(pitch), sn = Math.sin(pitch);
      const nf = { x: F.x * c + U.x * sn, y: F.y * c + U.y * sn, z: F.z * c + U.z * sn };
      if (Math.abs(nf.y) <= lim || Math.abs(nf.y) < Math.abs(F.y)) {
        const nu = { x: U.x * c - F.x * sn, y: U.y * c - F.y * sn, z: U.z * c - F.z * sn };
        Object.assign(F, nf);
        Object.assign(U, nu);
      }
    }
    if (yaw) {
      // Round the world's vertical while the view is the right way up, which
      // is what a drag sideways means; round its own when it is not.
      // Blended rather than switched, so there is no step in the way the
      // view swings as it comes over the top and back down.
      const kw = Math.max(0, Math.min(1, (U.y - 0.1) / 0.5));
      const ax = { x: U.x * (1 - kw), y: U.y * (1 - kw) + kw, z: U.z * (1 - kw) };
      norm3(ax);
      rotate(F, ax, yaw);
      rotate(U, ax, yaw);
    }
    this.levelAim(f, dt);
  }

  /**
   * Bring the view's horizon back level, gently.
   *
   * Over the top of a loop the view is upside down, and that is right while
   * she is going over: the sky is under her canopy. Once she is coming down
   * the other side it rolls itself back the right way up, which is what a
   * pilot's head does -- and nothing happens near the vertical, where "level"
   * has no meaning and trying to find it is what made the old view spin.
   */
  levelAim(f, dt) {
    const F = f.aimF;
    const U = f.aimU;
    norm3(F);
    // The level up for this direction: the world's vertical, square to it.
    const lv = { x: -F.x * F.y, y: 1 - F.y * F.y, z: -F.z * F.y };
    if (Math.hypot(lv.x, lv.y, lv.z) > 0.2) {
      norm3(lv);
      const rate = (1 - Math.abs(F.y)) * 2.4 * dt;
      // Turned about her line of sight, so the direction stays put.
      const sx = F.y * U.z - F.z * U.y, sy = F.z * U.x - F.x * U.z, sz = F.x * U.y - F.y * U.x;
      const ang = Math.atan2(sx * lv.x + sy * lv.y + sz * lv.z, U.x * lv.x + U.y * lv.y + U.z * lv.z);
      rotate(U, F, Math.max(-rate, Math.min(rate, ang)));
    }
    // And square, against creeping arithmetic.
    const d = U.x * F.x + U.y * F.y + U.z * F.z;
    U.x -= F.x * d; U.y -= F.y * d; U.z -= F.z * d;
    norm3(U);
    f.aimYaw = Math.atan2(F.x, F.z);
    f.aimPitch = Math.asin(clamp(F.y, -1, 1));
  }

  /**
   * The free camera: turned round her by a second finger, the right mouse key
   * or with C held, without touching where she is being flown. Let go and it
   * swings back behind her.
   */
  freeLook(f, stick, dt) {
    const cam = this.scene.camera;
    const fov = ((cam && cam.fov) || 62) * Math.PI / 180;
    const k = (fov * 1.6) / Math.max(320, window.innerHeight || 720);
    if (this.hud.fly) this.hud.fly.lookKey = this.input.down('KeyC');
    f.lookYaw = wrapAngle((f.lookYaw || 0) - (stick.lookX || 0) * k);
    f.lookPitch = clamp((f.lookPitch || 0) + (stick.lookY || 0) * k, -1.45, 1.45);
    stick.lookX = 0;
    stick.lookY = 0;
    if (!stick.looking) {
      const e = Math.pow(0.04, dt);
      f.lookYaw *= e;
      f.lookPitch *= e;
    }
  }

  /**
   * In a set piece the view rides with her: the marker goes to her nose, and
   * the way up goes round with her as she goes over -- carried, not reset, so
   * a loop is seen from outside the loop and a roll is the world turning.
   */
  aimAtNose(f, p, dt) {
    const n = pathOf(p);
    const F = f.aimF;
    const U = f.aimU;
    const k = 1 - Math.pow(0.0004, Math.min(0.1, dt));
    F.x += (n.x - F.x) * k; F.y += (n.y - F.y) * k; F.z += (n.z - F.z) * k;
    norm3(F);
    // Through a loop she takes the view's up with her, since that is the way
    // she is pulling; in a roll it is left alone and she rolls in the frame.
    // Only once she is actually pulling round: rolling her level first, or
    // onto her back for a split-S, is a roll, and the horizon stays put.
    const pulling = p.man && p.man.stage >= 1
      && (p.man.kind === 'loop' || p.man.kind === 'immelmann' || p.man.kind === 'splitS');
    if (pulling) {
      const u = upOf(p);
      U.x += (u.x - U.x) * k; U.y += (u.y - U.y) * k; U.z += (u.z - U.z) * k;
      const d = U.x * F.x + U.y * F.y + U.z * F.z;
      U.x -= F.x * d; U.y -= F.y * d; U.z -= F.z * d;
      norm3(U);
      f.aimYaw = Math.atan2(F.x, F.z);
      f.aimPitch = Math.asin(clamp(F.y, -1, 1));
    } else {
      this.levelAim(f, dt);
    }
  }

  /**
   * Throw a set piece: a roll, a loop, a reversal. `dir` is which way it
   * rolls; with none given it goes the way the marker is off her nose, which
   * is the way a pilot would roll to look at it.
   */
  flyMove(kind, dir = 0) {
    const f = this.flight;
    if (!f || this.turret) return;
    const p = f.pilot;
    // A thirty-tonne bomber is not rolled or looped.
    if (f.heavy) { this.hud.alert('She is far too big to throw about'); return; }
    if (!dir) {
      const u = upOf(p);
      const n = pathOf(p);
      const rx = n.y * u.z - n.z * u.y, ry = n.z * u.x - n.x * u.z, rz = n.x * u.y - n.y * u.x;
      const F = f.aimF;
      dir = (F.x * rx + F.y * ry + F.z * rz) > 0 ? -1 : 1;
    }
    if (startManeuver(p, kind, dir)) {
      this.hud.flashMove?.(kind);
      audio.click();
    }
  }

  /**
   * Where the instructor is to fly her: the marker, wherever it is.
   *
   * There is no pulling her out over the water. A pilot who puts the marker
   * on the sea or on a ship's side goes into it -- which is how an aeroplane
   * is put into a ship -- and one who wants to pull out has to pull out.
   */
  flyAim(f, p) {
    // The camera stands behind and above her, so the line from her to the
    // marker is not quite the camera's: she is pointed at the point on the
    // camera's line where her guns meet, so the ring settles on the marker
    // rather than a degree under it. And it is her nose that is laid there,
    // not her flight path -- the angle her wing is working at is taken off.
    const F = f.aimF;
    const U = f.aimU;
    const rig = this.chaseRig(p);
    const tx = F.x * GUN_CONVERGE + U.x * rig.up;
    const ty = F.y * GUN_CONVERGE + U.y * rig.up;
    const tz = F.z * GUN_CONVERGE + U.z * rig.up;
    const len = Math.hypot(tx, ty, tz) || 1;
    const aoa = clamp(p.attitude - p.pitch, -0.3, 0.3);
    const a = f.aimVec || (f.aimVec = { x: 0, y: 0, z: 1 });
    // Her bore is her heading at her nose's attitude, so the angle of attack
    // comes off in the vertical.
    a.x = tx / len;
    a.y = ty / len - aoa;
    a.z = tz / len;
    norm3(a);
    return a;
  }

  /** How far behind and above her the chase camera stands. */
  chaseRig(p) {
    const span = (p.a && p.a.span) || 11;
    const zoom = this.hud.fly && this.hud.fly.zoom;
    // Close: about her own span and a half behind her, near enough that her
    // panel lines, her markings and every hole in her read, and far enough
    // that the whole of her -- wingtip to wingtip -- is in the picture.
    return { back: (5 + span * 1.05) * (zoom ? 1.25 : 1), up: 1.6 + span * 0.2 };
  }

  /**
   * The sights on the glass, put where they are in the picture.
   *
   * The marker is the view's own direction. The ring is where her guns are
   * laid -- down her nose, out to where the wing guns meet. And the lead is
   * the point the ring has to be on to hit the enemy aeroplane nearest the
   * ring: where she will be when the rounds get there, at her speed and on
   * her heading.
   */
  paintSights() {
    const f = this.flight;
    if (!f || !this.hud.placeSights) return;
    const cam = this.scene.camera;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const v = this.sightVec || (this.sightVec = new THREE.Vector3());
    const project = (x, y, z) => {
      v.set(x, y, z).project(cam);
      if (v.z > 1 || v.z < -1) return null;
      return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H };
    };
    const p = f.pilot;
    const aim = this.turret ? null : project(
      cam.position.x + f.aimF.x * 2000,
      cam.position.y + f.aimF.y * 2000,
      cam.position.z + f.aimF.z * 2000,
    );
    // A heavy's pilot has no forward guns: the ring is for a turret gunner,
    // and he has his own sight.
    const bore = p.attitude;
    const bc = Math.cos(bore);
    const ring = f.heavy || this.turret ? null : project(
      p.x + Math.sin(p.heading) * bc * GUN_CONVERGE,
      p.y + Math.sin(bore) * GUN_CONVERGE,
      p.z + Math.cos(p.heading) * bc * GUN_CONVERGE,
    );
    let lead = null;
    let far = false;
    if (ring) {
      // The enemy aeroplane nearest the ring, ahead of her, within a long
      // way of her guns.
      const fx = Math.sin(p.heading) * bc;
      const fy = Math.sin(bore);
      const fz = Math.cos(p.heading) * bc;
      let best = null;
      let bestScore = Infinity;
      const consider = (x, y, z, h, sp, vy) => {
        const dx = x - p.x, dy = y - p.y, dz = z - p.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < 30 || d > 2600) return;
        const ahead = (dx * fx + dy * fy + dz * fz) / d;
        if (ahead < 0.82) return;
        const score = (1 - ahead) * 4000 + d * 0.15;
        if (score < bestScore) { bestScore = score; best = { x, y, z, h, sp, vy, d }; }
      };
      for (const q of (this.planesNow || [])) {
        if (q.tm === this.team || q.i === f.id) continue;
        consider(q.x, this.planeHeight(q), q.z, q.h, q.s || 70, q.vy || 0);
      }
      const snap = this.snapshots[this.snapshots.length - 1];
      for (const q of ((snap && snap.bombers) || [])) {
        if (q.tm === this.team) continue;
        consider(q.x, q.y, q.z, q.h, q.s || 80, 0);
      }
      if (best) {
        // Time of flight, solved twice: the rounds go out at muzzle velocity
        // plus her own speed.
        const vb = GUN_V + p.v;
        let t = best.d / vb;
        let lx = best.x, ly = best.y, lz = best.z;
        for (let i = 0; i < 3; i++) {
          lx = best.x + Math.sin(best.h) * best.sp * t;
          // The rounds fly flat (see stepBullets), so there is no drop to add.
          ly = best.y + best.vy * t;
          lz = best.z + Math.cos(best.h) * best.sp * t;
          t = Math.hypot(lx - p.x, ly - p.y, lz - p.z) / vb;
        }
        const at = project(lx, ly, lz);
        if (at) {
          lead = { x: at.x, y: at.y, near: best.d < GUN_REACH };
          // The ring is on her but she is out of reach.
          far = best.d > GUN_REACH && Math.hypot(at.x - ring.x, at.y - ring.y) < 70;
        }
      }
    }
    this.hud.placeSights(aim, ring, lead, far);
  }

  /**
   * What a damaged aeroplane will still do, from the report off the wire.
   *
   * The same three numbers the simulation applies to a flight on the autopilot
   * (see airframeState) put where a pilot can feel them: what she will still
   * make, what she can still be hauled round at, and how hard she pulls off
   * straight with her structure shot about. A machine with her tail gone is
   * the one a pilot notices first, because she will not be aimed.
   */
  flyWear(f) {
    const w = f.wear;
    const dm = f.dm;
    if (!dm) { w.speed = 1; w.turn = 1; w.pull = 0; return w; }
    const eng = dm[0] ?? 1;
    const wing = dm[2] ?? 1;
    const tail = dm[3] ?? 1;
    const fire = dm[6] || 0;
    w.speed = 0.35 + 0.65 * eng;
    w.turn = Math.max(0.15, 0.25 + 0.45 * wing + 0.30 * tail);
    // A burning aeroplane is a going concern until she is not: the fire eats
    // her, and what the pilot feels of it is her wanting to roll off.
    w.pull = (1 - wing) * 0.22 + fire * 0.10;
    return w;
  }

  /**
   * The world matrix of one machine's rear gun as it is laid now, turned so
   * its bore is +z -- which is the way a muzzle flash is drawn -- or null.
   */
  rearMatrix(d, g, slot, out = RG_M) {
    const m = d.mats[slot];
    if (!m) return null;
    const t = this.planeTrim.get(d.id);
    RG_E.set(t && t.gunPitch !== undefined ? t.gunPitch : 0.25, t && t.gunYaw ? t.gunYaw : 0, 0, 'YXZ');
    RG_Q.copy(g.rot).multiply(RG_Q2.setFromEuler(RG_E)).multiply(RG_FLIP);
    out.compose(RG_V.fromArray(g.at), RG_Q, RG_ONE).premultiply(m);
    return out;
  }

  /** Where one machine's rear gun's muzzle is in the world. */
  rearMuzzle(d, g, slot, out) {
    const m = this.rearMatrix(d, g, slot);
    if (!m) return null;
    return out.set(-g.muzzle[0], g.muzzle[1], -g.muzzle[2]).applyMatrix4(m);
  }

  /**
   * Her gunner, swinging his gun onto whatever he is shooting at and back to
   * stowed when there is nothing, and the flash at its muzzle while he fires.
   * Laid off the aeroplane as she was last drawn, so the gun points where the
   * target is on the screen.
   */
  rearGun(pl, kind, vel, dt) {
    const g = rearGunOf(kind);
    if (!g) return;
    const t = this.planeTrim.get(pl.i);
    const d = this.planeDrawn.get(pl.i);
    if (!t || !d) return;
    d.id = pl.i;
    const aim = this.rearAim.get(pl.i);
    const live = aim && this.time - aim.at < 0.5;
    let yaw = 0, pitch = 0.25;
    if (live && d.mats[0]) {
      const q = (this.planesNow || []).find((p) => p.i === aim.t);
      RG_V.set(q ? q.x : aim.x, q ? this.planeHeight(q) : aim.y, q ? q.z : aim.z);
      // Into her frame, about the gun's pivot, and then into the frame the
      // gun is built in.
      RG_M2.copy(d.mats[0]).invert();
      RG_V.applyMatrix4(RG_M2).sub(RG_V2.fromArray(g.at));
      RG_V.applyQuaternion(RG_Q.copy(g.rot).invert()).normalize();
      // The gun is laid aft along -z: yaw about her vertical, then up.
      yaw = Math.atan2(-RG_V.x, -RG_V.z);
      pitch = Math.asin(Math.max(-1, Math.min(1, RG_V.y)));
      yaw = Math.max(-2.3, Math.min(2.3, yaw));
      pitch = Math.max(-0.35, Math.min(1.25, pitch));
    }
    // A man swinging a gun on a ring: quick, but not instant.
    const k = 1 - Math.exp(-dt * (live ? 7 : 2));
    t.gunYaw = (t.gunYaw || 0) + angleDelta(t.gunYaw || 0, yaw) * k;
    t.gunPitch = (t.gunPitch ?? 0.25) + (pitch - (t.gunPitch ?? 0.25)) * k;
    if (!live) return;
    const eye = this.scene.camera.position;
    for (let i = 0; i < d.n; i++) {
      const m = this.rearMatrix(d, g, i);
      if (!m) continue;
      const far = Math.hypot(m.elements[12] - eye.x, m.elements[13] - eye.y, m.elements[14] - eye.z);
      if (far > 1500) continue;
      this.scene.gunFlashes.fire(`${pl.i}/rear/${i}`, m, [[0, 0.06, 0.88]], vel, 7.7,
        this.scene.effects, dt, i === 0 && far < 400);
    }
  }

  /** Keep where each machine of a flight was just drawn; see `releaseOf`. */
  noteDrawn(id, kind, vx, vy, vz) {
    const f = this.scene.flights;
    let d = this.planeDrawn.get(id);
    if (!d) {
      d = { kind, mats: [], v: new THREE.Vector3(), next: 0 };
      this.planeDrawn.set(id, d);
    }
    d.kind = kind;
    d.v.set(vx, vy, vz);
    d.n = f.slotN;
    for (let i = 0; i < f.slotN; i++) {
      if (!d.mats[i]) d.mats[i] = new THREE.Matrix4();
      d.mats[i].copy(f.slotM[i]);
    }
    d.at = this.time;
  }

  /**
   * Where the next bomb out of a flight leaves from: the rack in the next of
   * her machines, as she was last drawn, with that machine's speed and the
   * bomb lying the way it lay in her. Null when she is not being drawn, and
   * the bomb goes from where the simulation says.
   */
  releaseOf(id) {
    const d = this.planeDrawn.get(id);
    if (!d || !d.n || this.time - d.at > 1) return null;
    const st = storeOf(d.kind);
    const m = d.mats[d.next % d.n];
    d.next++;
    const p = st ? new THREE.Vector3().fromArray(st.at) : new THREE.Vector3(0, 0.2, 0.4);
    p.applyMatrix4(m);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    if (st) {
      q.multiply(st.q);
      // Her own weapon, which is what falls.
      if (st.geo) {
        this.scene.bombs.shape(d.kind, st.geo.clone().translate(-st.mid.x, -st.mid.y, -st.mid.z),
          st.mats.length > 1 ? st.mats : st.mats[0]);
      }
    }
    // The trim: the bomb is the falling one now, and the one on the rack is
    // not drawn again.
    const t = this.planeTrim.get(id);
    if (t) t.handed = true;
    return {
      p, v: d.v.clone(), q,
      len: st ? st.len : 1.75, r: st ? st.r : 0.2,
      shape: st && st.geo ? d.kind : null,
    };
  }

  /**
   * How far a flight's bay is open and how far her weapon has fallen.
   *
   * The squadrons in the air are drawn as instanced batches -- one geometry
   * per type, stamped out once per aeroplane -- so nothing on a welded model
   * can move. The doors, the Dauntless's displacing trapeze and the weapon on
   * the rack are drawn as batches of their own (see `Flights.trimParts`), and
   * this is the state they are drawn at.
   *
   * The bay opens when the drop is asked for and shuts a couple of seconds
   * after the weapon has gone, which is what a bay does. For the aeroplane the
   * player is flying it opens on the key rather than on the answer coming
   * back, because a pilot who presses the drop and sees nothing happen for a
   * fifth of a second thinks the key is broken.
   */
  bayTrim(pl, dt, speed = 0) {
    let t = this.planeTrim.get(pl.i);
    if (!t) {
      t = { bay: 0, fall: null, gone: false, hold: 0, prop: Math.random() * 6.28, rate: 34 };
      // Her legs. A flight first seen low and slow has only just left the
      // deck or the water, and her wheels are still down: they come up as she
      // climbs away, which is what a pilot does the moment he has a positive
      // rate of climb. Anything first seen at height has had them up for
      // the whole sortie.
      t.gear = (pl.y ?? 220) < 70 ? 0 : 1;
      this.planeTrim.set(pl.i, t);
    }
    if (t.gear < 1 && (pl.y ?? 220) > 14) t.gear = Math.min(1, t.gear + dt / 2.8);
    // The airscrew, wound on at a rate her engine decides: her throttle when
    // somebody has his hand on it, and otherwise her airspeed. Not her real
    // revolutions -- two thousand a minute at sixty frames a second is a
    // strobe and nothing else -- but a rate that reads as turning, picks up
    // and dies away smoothly as the power goes on and off, and smears into
    // the disc at full power. An engine that is dead windmills.
    const flyer = this.flight && this.flight.id === pl.i ? this.flight : null;
    const spin = flyer
      ? (flyer.orphan ? 4 : 22 + 34 * Math.min(1.1, flyer.pilot.throttle))
      : 18 + Math.min(1, speed / 150) * 30;
    t.rate += (spin - t.rate) * (1 - Math.exp(-dt * 2.5));
    t.prop = (t.prop + dt * t.rate) % (Math.PI * 2);
    t.idle = t.rate < 12;
    if (pl.d && !t.gone) { t.gone = true; t.fall = 0; t.hold = 2.4; }
    const mine = this.flight && this.flight.id === pl.i ? this.flight : null;
    if (mine && mine.asked > 0) t.hold = Math.max(t.hold, 1.0);
    // She opens up on the way down, not at the bottom of it. A dive bomber's
    // doors are open from the moment she is over on her back and committed
    // -- the bomb has to be clear to go the instant she lets go of it -- and a
    // torpedo bomber's are open for the last of her run on the water. They
    // used to open at the instant of release, with the weapon already falling
    // out of a bay that was still shut.
    if (!t.gone && !pl.d) {
      const role = pl.r || 'torpedo';
      if (role === 'dive' && (pl.vy || 0) < -14) t.hold = Math.max(t.hold, 0.5);
      if (role === 'torpedo' && (pl.y ?? 220) < 90 && (pl.vy || 0) < 4) t.hold = Math.max(t.hold, 0.5);
    }
    t.hold = Math.max(0, t.hold - dt);
    // A bomb bay takes about a second and a half either way.
    const want = t.hold > 0 ? 1 : 0;
    const step = dt / 1.4;
    t.bay = want > t.bay ? Math.min(want, t.bay + step) : Math.max(want, t.bay - step);
    // And the weapon, once it is let go: away under gravity, and out of the
    // picture entirely by the time the simulation's own bomb has taken over.
    if (t.fall !== null && t.fall <= 4) t.fall += dt * (2.6 + t.fall * 7.5);
    return t;
  }

  /**
   * Is anything under the sight?
   *
   * Down her bore, out to the range her rounds reach. The guns put their
   * rounds inside half a metre at two kilometres, so the question is whether
   * the target is as wide as the angle it is off her nose, not whether it is
   * in a broad cone: an aeroplane is a few tens of metres of air to hit, a
   * ship a hundred. Aeroplanes first, because that is what a fighter is
   * looking for.
   */
  sightOn(f, p, snap) {
    if (!snap) return false;
    const bore = p.attitude || 0;
    const bc = Math.cos(bore);
    const fx = Math.sin(p.heading) * bc;
    const fy = Math.sin(bore);
    const fz = Math.cos(p.heading) * bc;
    const under = (x, y, z, size) => {
      const dx = x - p.x;
      const dy = y - p.y;
      const dz = z - p.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > GUN_REACH || d < 1) return false;
      const along = dx * fx + dy * fy + dz * fz;
      if (along <= 0) return false;
      // How far off the bore line she lies, in metres, at her range.
      const off = Math.sqrt(Math.max(0, d * d - along * along));
      return off < size;
    };
    for (const q of (snap.planes || [])) {
      if (q.tm === this.team || q.i === f.id) continue;
      if (under(q.x, this.planeHeight(q), q.z, 26)) return true;
    }
    for (const q of snap.ships) {
      if (!q.a || q.tm === this.team) continue;
      if (under(q.x, 8, q.z, 60)) return true;
    }
    return false;
  }

  /**
   * What one flight leaves in the air this frame, off the machines the
   * formation has just been drawn as: vapour off every tip and a contrail off
   * every engine high enough for one, and -- while her guns are going -- the
   * flash at every muzzle and the smoke streaming off it.
   *
   * `g` is how hard she is pulling, `v` her speed, `y` her height, `vel` her
   * velocity, and `firing` how many of her machines are shooting.
   */
  airFx(id, kind, g, v, y, vel, firing, dt, cut = 0) {
    const fl = this.scene.flights;
    const tp = fl.tips(kind);
    if (!tp) return;
    const eye = this.scene.camera.position;
    const guns = gunsOf(kind);
    // A Zero's two cowling guns are rifle calibre and her wing guns cannon.
    const cal = kind === 'zero' ? guns.map((m) => (Math.abs(m[0]) < 0.6 ? 7.7 : 20))
      : (GUN_CALIBRE[kind] ?? 12.7);
    for (let i = 0; i < fl.slotN; i++) {
      const m = fl.slotM[i];
      const d = Math.hypot(m.elements[12] - eye.x, m.elements[13] - eye.y, m.elements[14] - eye.z);
      // The trail comes off her wingtip, and a wing that has gone has taken
      // its tip with it: only the slot that lost it, the others are whole.
      // The engine's is laid as long as she has her airscrew.
      const c = i === 0 ? cut : 0;
      if (d < 3000) {
        this.scene.contrails.lay(`${id}/${i}`, m, tp.tips, tp.nose, g, v, y,
          [!(c & (CUT.wingOutL | CUT.wingInL)), !(c & (CUT.wingOutR | CUT.wingInR))], !(c & CUT.prop));
      }
      if (i < firing && d < 1800) {
        this.scene.gunFlashes.fire(`${id}/${i}`, m, guns, vel, cal, this.scene.effects, dt, i === 0 && d < 600);
      }
    }
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
    const R = GUN_REACH;
    // Where the guns are laid to meet. A long way out, and every tracer is
    // run on to the same point on the bore line at the end of its reach, so
    // the burst goes out as one tight bundle down the line of the ring rather
    // than crossing a couple of hundred metres out and fanning apart after.
    const CONVERGE = GUN_REACH;
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
      const ex = mx + (nose.x - mx) * k;
      const ey = my + (nose.y - my) * k;
      const ez = mz + (nose.z - mz) * k;
      this.scene.flak.fire(mx, my, mz, ex, ey, ez, f.calibre, 8, this.scene.effects);
      // The flash at the muzzle and the smoke off it are drawn on her every
      // frame the trigger is held -- see airFx -- not left in the air here.
    }
  }

  /**
   * The tracer out of the turret somebody is sitting in.
   *
   * Down the line the gunner is actually looking, from the mounting he is
   * actually in, so a burst from the tail turret leaves the tail and a burst
   * from the mid-upper leaves her spine. The wing guns are harmonised on a
   * point a couple of hundred yards out and converge there; a turret is not --
   * it is a pair of guns on a ring, pointed where the man points them.
   */
  turretGuns(f, p) {
    const eye = this.turretEye();
    if (!eye) return;
    const t = this.turret;
    const look = wrapAngle(eye.heading + t.yaw);
    const cp = Math.cos(t.pitch);
    const R = 620;
    const dx = Math.sin(look) * cp;
    const dy = -Math.sin(t.pitch);
    const dz = Math.cos(look) * cp;
    const ex = eye.x + dx * R;
    const ey = eye.y + dy * R;
    const ez = eye.z + dz * R;
    this.scene.flak.fire(eye.x, eye.y, eye.z, ex, ey, ez, f.calibre, 8,
      this.scene.effects);
    this.scene.effects.wingGun(eye.x, eye.y, eye.z, dx, dy, dz, f.calibre);
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
    // Any of the fleet's, not only her own: see canTake.
    const ours = ((snap && snap.planes) || [])
      .filter((p) => p.tm === this.team && (!p.pi || p.pi === this.shipId));
    if (!ours.length) {
      this.hud.alert('No aircraft in the air');
      return;
    }
    // Her own first if she has any up, and the youngest of those: the one
    // that has just gone. Otherwise whatever the fleet has nearest to her,
    // which is the flight a captain would be given.
    const mine = ours.filter((p) => p.o === this.shipId);
    const here = (snap && snap.ships.find((q) => q.i === this.shipId)) || { x: 0, z: 0 };
    const pick = mine.length
      ? mine.reduce((a, q) => (a === null || q.a < a.a ? q : a), null)
      : ours.reduce((a, q) => (a === null
        || Math.hypot(q.x - here.x, q.z - here.z)
         < Math.hypot(a.x - here.x, a.z - here.z) ? q : a), null);
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
    this.watchDist = 1.4;
    this.watchDistNow = 1.4;
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
    //
    // But it has to be a walk and not a twitch. Letting go on the first pixel
    // meant anything that produced a stray pan -- a pinch that wobbled, a
    // finger settling, a trackpad's inertia -- dropped whoever was being
    // watched and put the camera in free cam. So a little travel has to
    // accumulate first, and it is thrown away as soon as the hand stops.
    if (this.watching) {
      this.panSlip = (this.panSlip || 0) + Math.hypot(dx, dy);
      if (this.panSlip < PAN_TO_LET_GO) return;
      this.roam = { x: here.x, z: here.z };
      this.lookAt(null);
    }
    this.panSlip = 0;
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

  /**
   * Whose bridge the controls answer.
   *
   * The ship being watched, if it is somebody else's; the ship your flag has
   * shifted to, if your own has gone; your own otherwise. Watching your own
   * wreck is watching, not conning -- the two used to be the same field, so
   * looking at her took the con off the division still fighting.
   */
  conned() {
    if (this.watching && this.watching.kind === 'ship'
      && this.watching.id !== this.shipId) return this.watching.id;
    if (this.sunk && this.flag != null) return this.flag;
    return this.shipId;
  }

  /** Where the telegraph of the ship under orders stands. */
  connedNotch() {
    if (this.conned() === this.shipId) return this.localShip.notch;
    const s = this.shownShip();
    return s && typeof s.notch === 'number' ? s.notch : 1;
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

  /**
   * What the plate in the lower left says about what the camera is riding --
   * an aeroplane, a round or a torpedo, ours or theirs -- or null when it is
   * on a ship, whose own plate already says so.
   */
  specInfo() {
    const w = this.watching;
    if (!w) return null;
    const snap = this.snapshots[this.snapshots.length - 1];
    if (!snap) return null;
    const whose = (id) => (id ? this.names.get(id) : null);
    if (w.kind === 'plane') {
      const pl = (snap.planes || []).find((q) => q.i === w.id);
      if (!pl) return this.specWas || null;
      const type = typeOf(pl.k, pl.r || 'torpedo');
      const from = whose(pl.o);
      this.specWas = {
        what: PLANE_NAME[type] || 'Aircraft',
        sub: `${ROLE_NAME[pl.r] || 'Aircraft'}${pl.n > 1 ? ` · ${pl.n} aircraft` : ''}${from ? ` · from ${from}` : ''}`,
        team: pl.tm,
      };
      return this.specWas;
    }
    if (w.kind === 'bomber') {
      const bm = (snap.bombers || []).find((q) => q.i === w.id);
      if (!bm) return this.specWas || null;
      this.specWas = {
        what: BOMBERS[bm.b]?.name || 'Heavy bombers',
        sub: `Heavy bomber${bm.n > 1 ? ` · ${bm.n} aircraft` : ''} · flown from ashore`,
        team: bm.tm,
      };
      return this.specWas;
    }
    if (w.kind === 'shell') {
      // The round under the camera, or the last one it was on while the
      // camera holds on the splash.
      const sh = (this.shellsNow || []).find((q) => q.i === w.id);
      if (sh) this.shellCal = { c: sh.c, bomb: !!sh.bm, tm: sh.tm };
      const cal = this.shellCal;
      if (!cal || !cal.c) return null;
      const from = this.shellIsBomb ? null : whose(w.ship);
      return {
        what: cal.bomb ? `${Math.round(cal.c)} mm bomb` : `${Math.round(cal.c)} mm shell`,
        sub: from ? `Fired by ${from}` : (cal.bomb ? 'Dropped by the squadron' : ''),
        team: cal.tm,
      };
    }
    if (w.kind === 'torp') {
      const tp = (this.torpsNow || []).find((q) => q.i === w.id);
      if (tp) this.torpWho = { o: tp.o, tm: tp.tm };
      const who = this.torpWho;
      const from = who ? whose(who.o) : null;
      return { what: 'Torpedo', sub: from ? `Launched by ${from}` : 'Launched by an unknown ship', team: who?.tm };
    }
    return null;
  }

  update(dt) {
    const ls = this.localShip;
    const settings = getSettings();
    if (this.torpLast && this.torpLast.t > 0) this.torpLast.t -= dt;
    this.penCam?.update(dt);
    this.hud.setSpecPlate(this.specInfo());
    // A clock for whatever on a ship moves of its own accord: the carrier's
    // lifts and her launch cycle run off this. It is wall time, not a sum of
    // frame steps -- a launch takes twelve seconds because that is how long it
    // takes, and accumulating dt made it take twelve seconds of frames, which
    // on a slow machine is a minute and a half.
    // Wall time run at the battle's own rate: sped up, the deck is worked as
    // much faster as everything else is.
    {
      const wall = performance.now() / 1000;
      const step = this.wallAt === undefined ? 0 : clamp(wall - this.wallAt, 0, 1);
      this.wallAt = wall;
      this.time = this.time === undefined ? wall : this.time + step * (this.timeScale || 1);
    }
    // And a frame's worth of battle, for everything that moves with it -- the
    // aircraft, the wrecks, the smoke and the sea. The camera and the hand on
    // the controls stay at the speed of life.
    const sdt = dt * (this.timeScale || 1);

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
    // Behind a searchlight the drag trains the lamp, and nothing else -- until
    // the camera is wanted for something else, which takes you off it.
    if (this.lamp && (this.watching || this.flight || this.gun || this.sunk)) this.leaveLamp(true);
    if (this.lamp) this.trainLamp(dt);
    // On his own two feet, the drag turns his head and the stick and the keys
    // walk him; anything that wants the camera for something else takes him
    // back to the bridge.
    if (this.man && (this.watching || this.flight || this.gun || this.lamp)) this.leaveMan(true);
    if (this.man) this.stepMan(dt);
    if (!this.watching && !this.gun && !this.lamp && !this.man) {
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
    if (this.man) { pan.x = 0; pan.y = 0; }
    // The moment the hand stops, whatever it had walked so far is forgotten.
    // Otherwise a twitch here and a twitch a minute later eventually add up to
    // a walk and let go of a ship nobody meant to let go of.
    if (!pan.x && !pan.y) this.panSlip = 0;
    this.panCamera(pan.x, pan.y, dt);
    // The arrow keys do the same for anyone who would rather not hold shift.
    const ARROW = 340 * dt;
    const kx = (this.input.down('ArrowRight') ? 1 : 0) - (this.input.down('ArrowLeft') ? 1 : 0);
    const ky = (this.input.down('ArrowDown') ? 1 : 0) - (this.input.down('ArrowUp') ? 1 : 0);
    if ((kx || ky) && !this.man) this.panCamera(-kx * ARROW, -ky * ARROW, dt);

    // Predict our own hull, then take up whatever is left of the difference
    // between her and the server's version of her. See correctOwn.
    const now = performance.now() / 1000;
    predictShip(this.local, ls, this.stepOwnClock(now, dt));
    this.takeUpFix(dt, now);

    if (now - this.lastInputSent > 1 / INPUT_HZ) {
      this.lastInputSent = now;
      // Only the telegraph goes up the wire now. Her helm follows the course
      // her captain laid off, and her guns are her own gunnery officer's.
      this.net.send({ t: 'input', notch: ls.notch });
    }

    this.stepFlight(dt, sdt);
    this.syncEntities(sdt);
    // After the entities, because the camera rides an interpolated round and
    // syncEntities is what interpolates them.
    this.stepShellCam(dt);
    // The key is there whenever there is a ship whose guns you could follow,
    // and lit while the camera is on a round. Offered only from the bridge --
    // there is nothing to ride from inside an aeroplane.
    // Whose armament the arsenal panel is listing. An aeroplane in hand -- hers
    // if one is being flown, hers if one is being watched -- and the ship's
    // when there is neither.
    const air = this.airInHand();
    this.hud.setAirArsenal?.(air ? airArsenal(air.kind) : null);
    // A turret on an aeroplane that has gone is a turret nobody is in.
    if (this.turret && (!air || air.id !== this.turret.id)) {
      this.turret = null;
      this.hud.setAirGun(null);
    }
    // The key is offered for a salvo from the bridge, and for a stick whenever
    // a squadron is being watched or flown -- a pilot in a Lancaster has as
    // much reason to watch his own bombs down as a gunnery officer has.
    this.hud.setShellCam(
      !!this.bombSource() || (!this.flight && !!this.shellSource()),
      this.shellCam,
    );
    this.recoilClock += dt;
    this.updateCamera(dt);
    this.scene.camera.updateMatrixWorld();
    // The sights on the glass are worked out of the camera this frame has
    // just been given, so they sit on what is drawn.
    if (this.flight) this.paintSights();
    audio.listen(this.scene.camera);
    // And the ground, if anything has taken a piece out of it since the last
    // frame. Held off for a moment after the last hit rather than done on the
    // hit, because a salvo of nine lands in under a second.
    this.scene.syncGround(dt);
    this.scene.update(sdt);


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
    if (this.targetView && this.hud.panel === 'targeting') {
      // Whoever is being read out: your own ship, or the one you are watching.
      const id = this.conned();
      const c = id === this.shipId ? this.cls.id : shown?.c;
      if (c) {
        this.targetView.build(c);
        this.targetView.follow(this.scene.shipViews.get(id));
        this.targetView.setHits(id, this.hitsOn.get(id));
        this.targetView.render();
      }
      // The enemy boxes over her, four times a second.
      this.foeDue = (this.foeDue || 0) - dt;
      if (snap && shown && c && this.foeDue <= 0) {
        this.foeDue = 0.25;
        const cls = getClass(c);
        const myTeam = shown.tm ?? this.team;
        const sx = id === this.shipId ? ls.x : shown.x, sz = id === this.shipId ? ls.z : shown.z;
        const foes = (snap.ships || [])
          .filter((q) => q.a && q.tm !== myTeam)
          .map((q) => ({ i: q.i, n: q.n || 'Contact', c: q.c, d: Math.hypot(q.x - sx, q.z - sz) }))
          .sort((p, q) => p.d - q.d);
        const dp = new Map(dpMounts(cls).map((m) => [m.i, m.gun.range]));
        const reach = (t) => (t.kind === 'main' ? cls.gun?.range : t.kind === 'sec' ? cls.secondary?.range
          : t.kind === 'dp' ? dp.get(t.i) : cls.torpedoes?.range) || 0;
        this.hud.paintTargetFoes(foes, shown.as || {}, reach, shown.of || [], shown.ko || []);
      }
    }
    if (this.board && this.hud.panel === 'dmg') {
      if (shown) this.board.build(shown.c);
      // Her holes: our own as our own bridge has them, anyone else's as they
      // were seen to strike her.
      {
        const id = this.conned();
        this.board.setHits(id, id === this.shipId ? this.holes : this.hitsOn.get(id));
      }
      this.board.setWater(shown?.wt);
      // What is burning, and where the sea is running -- in through her
      // plating, or back out of it once the pumps are going.
      this.board.setFires(shown?.fr);
      this.board.setFlow(shown?.fw, shown?.fs);
      this.board.update(shown?.sec, dt);
    }
    // The plot is always drawn round your own hull, whoever the camera is on:
    // it is your chart table, and the mark in the middle of it is you.
    // Twenty times a second, which is as often as anything on it moves far
    // enough to see; painting it every frame cost more than the rest of the
    // HUD together.
    this.plotDue = (this.plotDue || 0) - dt;
    if (snap && this.plotDue <= 0) {
      this.plotDue = this.mapBig ? 1 / 30 : 1 / 20;
      this.hud.drawMinimap(ownForHud && { ...ownForHud, i: this.shipId, x: ls.x, z: ls.z }, this.visibleShips(), snap);
    }
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

  /** Whether this is a sea that breaks over ships. */
  get storm() {
    return (getWeather(this.world?.weather).swell || 1) > 1;
  }

  /**
   * A heavy sea against her: a crest coming up over her bow, and her
   * forefoot slamming back into the water after a sea has lifted it clear.
   *
   * Both are read off the hull as it is drawn -- her heave, pitch and roll --
   * against the water at her stem, so the spray goes up at the moment the
   * picture shows the sea hitting her. Only for ships close enough to see it.
   */
  seaSpray(view, cls, x, z, h, dt) {
    const cam = this.scene.camera.position;
    if ((cam.x - x) ** 2 + (cam.z - z) ** 2 > 3200 * 3200) return;
    const L = cls.hull.length;
    const zb = L * 0.44;
    const g = view.group;
    const r = g.rotation.z, p = g.rotation.x;
    const yAt = (ly, lz) => g.position.y + ly * Math.cos(r) * Math.cos(p) - lz * Math.sin(p);
    const bx = x + Math.sin(h) * zb, bz = z + Math.cos(h) * zb;
    const water = this.scene.ocean.heightAt(bx, bz);
    // Her deck at the stem stands higher than amidships: she has sheer.
    const deck = water - yAt(freeboardOf(cls) * 1.2 + 1, zb);
    const foot = water - yAt(0, zb);
    const k = view.spray || (view.spray = { deck, foot, wait: 0, clear: false, low: false });
    // Armed by the sea having been well down her stem, and her forefoot
    // having been out of it, since each last went off.
    if (foot < -0.4) k.clear = true;
    const dDeck = (deck - k.deck) / Math.max(dt, 1e-3);
    const dFoot = (foot - k.foot) / Math.max(dt, 1e-3);
    k.wait -= dt;
    if (k.wait <= 0) {
      const fx = this.scene.effects;
      const side = (s) => {
        // Out to either side of her stem and thrown aft along her.
        const lx = s * cls.hull.beam * 0.35;
        const w = localToWorld(lx, zb * 0.92, h);
        return { x: x + w.x, z: z + w.z, heading: wrapAngle(h + Math.PI - s * 0.9) };
      };
      // How near a sea has to come to her deck edge to break over her bow.
      const NEAR = 2.6;
      if (deck < -NEAR - 1.5) k.low = true;
      if (k.low && deck >= -NEAR && dDeck > 0.6) {
        k.low = false;
        // A sea come up her stem to the deck edge and over it.
        const bore = clamp(110 + dDeck * 30 + Math.max(0, deck) * 20 + L * 0.3, 120, 320);
        for (const s of [-1, 1]) {
          const at = side(s);
          fx.splash(at.x, at.z, bore * (0.8 + Math.random() * 0.3), { kind: 'bow', heading: at.heading });
        }
        k.wait = 1.2;
      } else if (k.clear && foot >= 0 && dFoot > 0.8) {
        k.clear = false;
        // Her forefoot was out of the sea and has come down on it.
        const bore = clamp(130 + dFoot * 35 + L * 0.35, 140, 360);
        for (const s of [-1, 1]) {
          const at = side(s);
          fx.splash(at.x, at.z, bore * (0.85 + Math.random() * 0.3), { kind: 'slam', heading: at.heading });
        }
        k.wait = 1.6;
      }
    }
    k.deck = deck;
    k.foot = foot;
  }

  visibleShips() {
    const snap = this.snapshots[this.snapshots.length - 1];
    return snap ? snap.ships : [];
  }

  /** Interpolate every remote entity and drive its view model. */
  syncEntities(dt) {
    if (!this.snapshots.length) return;
    // On the server's clock, not on the arrival times. See onSnapshot.
    const pair = this.snapshotPair(this.stepRenderClock());
    // The sea runs on the server's clock, so the wave that the simulation
    // says is over a turret is the wave that is drawn over it.
    if (Number.isFinite(this.renderST)) this.scene.ocean.clock = this.renderST;
    if (!pair) return;
    const { a, b, t, ahead } = pair;

    // A ship conned off the chart holds the con until she sinks or drops off
    // the plot altogether. She used to have to be in `ships` -- which an
    // enemy the lookouts have lost is not -- and the con snapped back to your
    // own bridge a tick after you gave it away.
    if (this.selected !== this.shipId) {
      const still = a.ships.some((s) => s.i === this.selected && s.a)
        || (a.contacts || []).some((s) => s.i === this.selected);
      if (!still) {
        const gone = this.selected;
        this.selected = this.shipId;
        this.hud.setSelected(this.selected);
        if (this.flag === gone) this.flag = null;
        // Only the camera that was on her comes off her. It used to drop any
        // watch at all, which took a captain who was watching his own ship go
        // down off her the moment the ship his flag had shifted to sank too.
        // And not while she is still there to watch: a ship going down is
        // the thing worth watching, and the camera stays on her, where it
        // was, until there is nothing left of her to draw.
        if (this.watching && this.watching.kind === 'ship'
          && this.watching.id === gone && !this.scene.shipViews.get(gone)?.group.visible) this.lookAt(null);
      }
    }
    const seen = new Set();
    // What each ship sounds like this frame, for the audio to pick the nearest
    // of: how hard she is steaming, and whether she is going down.
    const heard = [];
    for (const s of a.ships) {
      seen.add(s.i);
      const prev = b ? b.ships.find((x) => x.i === s.i) : null;
      const view = this.scene.getShipView(s.i, s.c, s.tm, s.i === this.shipId);
      const isSelf = s.i === this.shipId;
      const pose = poseBetween(s, prev, t, ahead);
      // Our own hull off our own prediction while she is a ship; once she has
      // stopped being one there is nothing to predict, and she is drawn where
      // the battle has her like any other wreck -- the prediction and the
      // correction pulling against each other over a dead hull is what had
      // her shuffling back and forth as she went down.
      const own = isSelf && s.a;
      const x = own ? this.localShip.x : pose.x;
      const z = own ? this.localShip.z : pose.z;
      const h = own ? this.localShip.heading : pose.h;

      // She takes the attitude the water under her puts on: the sea is sampled
      // at her bow, her stern and both beams, so a hull two hundred metres long
      // rides the swell rather than following every wave in it.
      const cls = getClass(s.c);
      const att = this.scene.ocean.attitude(x, z, h, cls.hull.length, cls.hull.beam);
      const speed = isSelf ? this.localShip.speed : pose.v;
      view.group.position.set(x, 0, z);       // her height is the seakeeping's
      view.group.rotation.set(0, 0, 0);
      view.group.rotation.order = 'YXZ';
      view.group.rotation.y = h;
      // Neither her pitch nor her roll is the angle of the water: both are her
      // own, swung on her own periods against what the sea is doing to her.
      // How much she moves is a matter of how big she is. Her lean in a turn
      // is not the sea's: the sim works it out (see leanFor) and it is added
      // below.
      view.sea.ride = this.ride || (this.ride = rideOf(this.world));
      // A ship going down has the sea in her, and a hull full of water does
      // not lift and roll to every wave the way a buoyant one does: the
      // deeper she is settled, the less of the sea's motion she takes up, so
      // a sinking ship goes down steadily instead of bobbing and swaying.
      {
        const fb = freeboardOf(cls);
        const settle = clamp((view.sinkY || 0) / Math.max(1, fb), 0, 1);
        const calm = !s.a ? 0.15 : 1 - 0.75 * settle;
        const r = this.ride;
        view.sea.ride = { heave: r.heave * calm, tilt: r.tilt * calm };
      }
      const sea = view.sea.step(att, dt, 0);
      // How she is floating, on top of what the sea is doing to her: the water
      // inside her has put her deeper, laid her over to one side, and pulled
      // one end of her down. All three come off the wire and none of them is
      // an animation -- they are what her flooding works out to.
      // Between the two snapshots, like her position, and eased: the wire
      // says how she is floating fifteen times a second, and drawn straight
      // off it a ship listing and settling goes over and down in steps.
      view.setFloating(floatBetween(s.fo, prev && prev.fo, t), dt);
      // And how deep, if she is a boat. Her own bridge predicts it locally so
      // the order answers at once; everyone else takes it off the wire.
      if (cls.dive) {
        view.setDive(isSelf ? this.localShip.depth : (s.d || 0), s.to || 0);
        view.stepDive(dt);
      }
      view.group.position.y = sea.heave - 1.0 - view.sinkY - (view.depth || 0);
      view.group.rotation.x = sea.pitch + view.trimBy;
      // Laid over by what is inside her, and leaning outward in a turn: ours
      // off her own prediction so it answers the helm at once.
      const lean = isSelf ? (this.localShip.lean || 0) : view.leanBy;
      // And rolling to the wave off a near miss, which is the server's to know:
      // nothing aboard her predicts where the next shell is going to fall.
      // Eased toward, because it comes fifteen times a second and a roll stepped
      // at that rate shudders.
      view.rockNow = (view.rockNow || 0) + ((view.rockBy || 0) - (view.rockNow || 0)) * (1 - Math.exp(-dt / 0.09));
      view.group.rotation.z = sea.roll - view.heelBy - lean - view.rockNow;
      // And what a heavy sea does against her: breaking over her bow, and
      // thrown out either side of her when she comes down on it.
      if (this.storm) this.seaSpray(view, cls, x, z, h, dt);

      // Every ship's guns are laid by her own gunnery officer now, ours
      // included, so the bearings all come off the wire.
      const turrets = s.tu;
      // Between snapshots like the hull is, or a turret training round steps
      // across the sky fifteen times a second.
      const turretsNext = prev && prev.tu;
      // A turret whose compartment has been shot out of the ship is finished:
      // it sits there canted over on its roller path, and the bearing on the
      // wire is nobody's any more.
      if (turrets) {
        turrets.forEach((ang, i) => {
          const tur = view.turrets[i];
          const to = turretsNext ? turretsNext[i] : undefined;
          const at = to === undefined ? ang : ang + angleDelta(ang, to) * t;
          if (tur && tur.userData.laid !== false) tur.rotation.y = at;
        });
      }
      // And everything else that trains: her secondary mountings and her
      // tubes off the snapshot, her light battery off the aircraft overhead.
      view.layMounts(s.se, s.sl, s.tt, this.planesNow, dt, s.te);
      // Her searchlights: ours off our own hand, so a lamp answers at once;
      // everybody else's off the wire.
      if (view.lamps) {
        const lit = !s.a ? null : isSelf ? (this.sunk ? null : this.ownLamps()) : unpackLamps(s.lp);
        view.lamps.set(lit, dt, this.scene.scene.fog);
      }
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
      // And whatever has gone down through a hole in her deck.
      if (s.dn) view.setFallen(s.dn);
      if (s.wk) view.setKnocked(s.wk);

      // Anything on her that works itself -- a carrier's lifts, so far.
      view.group.userData.step?.(this.time);
      // And anything it has dropped into the sea: a fish off her tubes going
      // in alongside, in her own frame.
      const dropped = view.group.userData.dropped;
      if (dropped && dropped.length) {
        view.group.updateMatrixWorld(true);
        for (const p of dropped.splice(0)) {
          const w = view.group.localToWorld(p.clone());
          this.scene.effects.splash(w.x, w.z, 120);
        }
      }

      // A ship going down does not leave a wake. She has stopped making way
      // through the water and started settling into it, and a Kelvin pattern
      // streaming away from a hull that is standing on end is nonsense -- so
      // the moment she founders the track stops being laid and what she left
      // behind her goes out of the water.
      // And neither does a boat that is under it. A Kelvin pattern is made by
      // a hull pushing the surface aside, and a submarine at thirty metres is
      // not touching the surface at all -- the wake she left on the way down
      // washes out behind her and there is nothing to see.
      const foundering = !s.a || view.going || (view.depth || 0) > 1.2;
      if (foundering) view.wake.stop(dt);
      else view.wake.update(dt, x, z, h, speed);
      const load = clamp(Math.abs(speed) / cls.maxSpeed, 0, 1);
      // How hard she is burning, for the founder to read. A ship that goes
      // down with fires still in her does not simply go down.
      view.burning = s.fr ? Math.max(...s.fr) / 9 : 0;
      // A ship that has stopped floating is not simply switched off. She is
      // still there, going down the way her water and her wreckage make her
      // go, and she is drawn until she is well under.
      //
      // What she is going down as comes off the same wire the damage panel
      // reads: what is left of her structure compartment by compartment, and
      // how much sea is in each of them. A hull shot to pieces goes quickly
      // and a hull with one hole in her takes her time -- see founder.
      // A wreck the battle is still sinking is drawn as the battle has her --
      // her depth, her list and her trim off the wire, the same as when she
      // was fighting -- so she goes on going down the way she was. Only once
      // the sea has closed over her does the picture take her the last of
      // the way.
      if (!s.a && !view.going && !s.go) {
        let left = 0;
        let wet = 0;
        for (let i = 0; i < SECTIONS.length; i++) {
          left += (s.sk && s.sk[i] != null ? s.sk[i] : 9) / 9;
          wet += (s.wt && s.wt[i] != null ? s.wt[i] : 0) / 100;
        }
        const gone = this.sinkInfo?.get(s.i);
        view.founder({
          heel: view.heelBy,
          trim: view.trimBy,
          broke: s.bk,
          wrecked: 1 - left / SECTIONS.length,
          water: wet / SECTIONS.length,
          rate: gone?.rate ?? null,
          capsize: !!gone?.capsize,
        });
      }
      if (view.going) {
        view.group.visible = view.stepFounder(dt);
      } else {
        view.group.visible = !!s.a || !!s.go;
        // Broken in two: the halves hinge off her pose.
        if (view.halves) view.stepHalves(dt);
      }
      // A piece of her cut off before we were watching her: she is drawn
      // without it. The tear follows her from wherever she has been posed.
      if (s.ct && !view.severed) view.cutHer(s.ct[0], s.ct[1], null);
      view.stepCut(dt, this.scene.shipViews);
      // The sea pouring into whichever of her holes it has reached.
      view.stepInrush(dt);
      // What her magazine threw into the air, coming down into the sea.
      const fell = view.stepRupture(dt);
      if (fell) {
        for (const w of fell) {
          const big = w.hull ? 1 : 0.45;
          this.scene.effects.splash(w.x, w.z, (260 + w.size * 18 + w.fall * 6) * big,
            { kind: w.hull ? 'bomb' : 'shell' });
          audio.splash(w.hull ? 900 : 300, { x: w.x, y: 1, z: w.z }, !!w.hull);
        }
      }
      if (view.throes.length) this.deathThroes(view, s, x, z, h);
      if (view.group.visible) {
        heard.push({
          id: s.i, x, z, load, len: cls.hull.length, sub: !!cls.dive,
          depth: cls.dive ? (isSelf ? this.localShip.depth : (s.d || 0)) : 0,
          alive: !!s.a,
          // Going down: settling with the sea in her, or a wreck still on
          // her way to the bottom.
          sinking: !s.a || Number.isFinite(s.sn),
        });
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
        const cls = getClass(s.c);
        // Where on her each burning compartment's fire stands, found once on
        // her own model (see fireseats.js) and carried in her own frame, so
        // the fire is on the deck or the superstructure that is alight and
        // goes with her as she heels, settles and steams.
        view.group.updateMatrix();
        for (let i = 0; i < SECTIONS.length; i++) {
          const heat = (s.fr[i] || 0) / 9;
          if (heat < 0.06) continue;
          view.fireSeats = view.fireSeats || new Map();
          let seats = view.fireSeats.get(i);
          if (!seats) {
            seats = fireSeats(view, cls, SECTIONS[i], freeboardOf(cls));
            view.fireSeats.set(i, seats);
          }
          // The whole of the compartment goes up, not one column over it:
          // the hottest seat first, the others catching as it spreads.
          for (let j = 0; j < seats.length; j++) {
            const st = seats[j];
            const catchAt = j === 1 ? 0 : 0.12 + 0.1 * j;
            if (heat < catchAt) continue;
            FIRE_AT.set(st.x, st.y, st.z).applyMatrix4(view.group.matrix);
            this.scene.flames.at(`${s.i}:${i}:${j}`, FIRE_AT.x, FIRE_AT.y, FIRE_AT.z,
              heat * (j === 1 ? 1 : 0.85), st.span);
          }
        }
      }

    }
    audio.ships(heard);

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
      if (!g.al) this.scene.flames.at(`bat:${g.i}`, g.x, g.y + 2, g.z, 0.6, view.span * 0.5);
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
    const bombsNow = [];
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
      // A heavy's bomb is a bomb, drawn as one and at her own size beside
      // the formation that let her go -- not as a gun's round of the same
      // weight, glowing like tracer and five times as long.
      if (sh.bm) {
        const lb = Math.max(250, (sh.c - 180) / 0.10);
        bombsNow.push({ x, y, z, dx, dy, dz, len: Math.min(3.2, 1.1 + lb * 0.0006), r: Math.min(0.5, 0.12 + lb * 0.00008) });
      } else n = this.scene.shells.set(n, x, y, z, dx, dy, dz, sh.c);
      shells.push({ i: sh.i, x, y, z, c: sh.c, o: sh.o, tm: sh.tm, bm: sh.bm });
    }
    this.scene.bombs.carry(bombsNow);
    this.shellsNow = shells;
    // And heard: the shriek of the rounds going over, nearest first.
    audio.shells(shells, dt);
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
        a: tp.a,
        o: tp.o,
        tm: tp.tm,
      };
    });
    this.scene.torpsNow = this.torpsNow;

    // And the depth charges, sinking. Interpolated the same way, because a
    // charge that stepped down five times a second would read as a thing
    // falling in a lift rather than a thing falling through water.
    this.scene.chargesNow = (a.charges || []).map((c) => {
      const prev = b ? (b.charges || []).find((x) => x.i === c.i) : null;
      return {
        i: c.i,
        x: prev ? lerp(c.x, prev.x, t) : c.x,
        y: prev ? lerp(c.y, prev.y, t) : c.y,
        z: prev ? lerp(c.z, prev.z, t) : c.z,
      };
    });

    // Squadrons are interpolated between snapshots like everything else. They
    // used not to be, and the aeroplane the camera rides was the one thing on
    // screen stepping ten times a second instead of running: that is what made
    // riding her look broken.
    //
    // And along a curve through them, not a straight line from one to the
    // next: joined with straight lines, her velocity changed fifteen times a
    // second, on every snapshot -- invisible on a ship, and a twitch on an
    // aeroplane the camera is sitting a few metres behind. The curve passes
    // through every snapshot and leaves each one at the speed and in the
    // direction she arrived at it, worked out off the snapshots either side.
    const snaps = this.snapshots;
    const ia = snaps.indexOf(a);
    const before = ia > 0 ? planeMap(snaps[ia - 1]) : null;
    const after = ia >= 0 && snaps[ia + 2] ? planeMap(snaps[ia + 2]) : null;
    const nextOf = b ? planeMap(b) : null;
    const planes = (a.planes || []).map((pl) => {
      const nx = nextOf ? nextOf.get(pl.i) : null;
      if (!nx) {
        // Past the newest snapshot: on along her own heading at her own speed
        // for as long as the next one is late, rather than held in the air
        // and then jumped -- which was the aeroplane that stuttered.
        if (b || !(ahead > 0)) return pl;
        const gs = pl.s || 0;
        return {
          ...pl,
          x: pl.x + Math.sin(pl.h) * gs * ahead,
          z: pl.z + Math.cos(pl.h) * gs * ahead,
          y: (pl.y ?? 220) + (pl.vy || 0) * ahead,
        };
      }
      const T = Math.max(1e-3, b.st - a.st);
      const pv = before && before.get(pl.i);
      const nn = after && after.get(pl.i);
      const tb = pv ? snaps[ia - 1].st : 0;
      const ta = nn ? snaps[ia + 2].st : 0;
      const curve = (k, fallback) => {
        const p0 = pl[k] ?? fallback, p1 = nx[k] ?? fallback;
        // Too far between two snapshots to be flying: somebody has put her
        // somewhere. Straight there.
        if (Math.abs(p1 - p0) > 400) return lerp(p0, p1, t);
        const m0 = pv && b.st - tb > 1e-3 ? ((p1 - (pv[k] ?? fallback)) / (b.st - tb)) * T : p1 - p0;
        const m1 = nn && ta - a.st > 1e-3 ? (((nn[k] ?? fallback) - p0) / (ta - a.st)) * T : p1 - p0;
        const t2 = t * t, t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0
          + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
      };
      return {
        ...pl,
        x: curve('x', 0),
        z: curve('z', 0),
        h: pl.h + angleDelta(pl.h, nx.h) * t,
        a: lerp(pl.a, nx.a, t),
        b: lerp(pl.b || 0, nx.b || 0, t),
        // Her real attitude, when somebody is flying her. Through the
        // vertical her heading and bank both swing half way round in one go
        // (the top of a loop) while her pitch turns back on itself, and
        // blending across that is a pirouette that never happened. The same
        // attitude written the other way -- heading and bank turned back half
        // a turn, and the pitch carried on past the vertical -- blends
        // straight through it, which is what she actually did.
        ...(pl.bk !== undefined && nx.bk !== undefined ? (() => {
          if (Math.abs(angleDelta(pl.h, nx.h)) > 2.2) {
            const pt2 = (nx.pt || 0) >= 0 ? Math.PI - (nx.pt || 0) : -Math.PI - (nx.pt || 0);
            const h2 = nx.h + Math.PI;
            const bk2 = nx.bk + Math.PI;
            return {
              h: pl.h + angleDelta(pl.h, h2) * t,
              bk: pl.bk + angleDelta(pl.bk, bk2) * t,
              pt: lerp(pl.pt || 0, pt2, t),
            };
          }
          return { bk: pl.bk + angleDelta(pl.bk, nx.bk) * t, pt: lerp(pl.pt, nx.pt, t) };
        })() : {}),
        // Her height and how she is going through the air, blended like the
        // rest of her. They used not to be, so a squadron slid smoothly across
        // the sea and stepped down the sky five times a second.
        y: curve('y', 220),
        vy: lerp(pl.vy || 0, nx.vy || 0, t),
        s: lerp(pl.s || 0, nx.s || 0, t),
      };
    });
    // Who has just left a deck, first: the frame an aeroplane first comes on
    // the wire is the frame she has to be drawn where the deck left her, not
    // one frame later after she has been seen where the simulation has her.
    this.flyLaunched(planes, dt);
    // An aeroplane fresh off the deck starts where the deck model left her,
    // and comes onto the place the simulation has her over the next second
    // and a half. The two are meant to agree and very nearly do; when they do
    // not -- a snapshot late, a ship turning under her -- she eases across
    // the gap rather than jumping it. See flyLaunched.
    for (let i = 0; i < planes.length; i++) {
      const h = this.handover.get(planes[i].i);
      if (!h) continue;
      const k = (this.time - h.t0) / HANDOVER;
      if (k >= 1 || k < 0) { this.handover.delete(planes[i].i); continue; }
      const w = 1 - k * k * (3 - 2 * k);
      const pl = planes[i];
      planes[i] = {
        ...pl, x: pl.x + h.dx * w, y: (pl.y ?? 220) + h.dy * w, z: pl.z + h.dz * w,
      };
    }
    this.planesNow = planes;

    // Every flight in the air, as the aircraft she actually is and as many of
    // them as she actually has.
    this.scene.flights.begin();
    this.scene.gunFlashes.begin();
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
      const flown = pl.bk !== undefined;
      const want = flown ? pl.bk : clamp(Math.atan2(gs * (pl.b || 0), 9.81), -1.15, 1.15);
      const held = this.planeTurn.get(pl.i);
      // A pilot's own bank is drawn as it comes: eased, she would never get
      // round a roll before the next one started.
      const bank = held === undefined || flown ? want
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
      // Somebody flying her sends the pitch of her flight path, which goes
      // past the vertical and over on her back as nothing worked out from a
      // rate of climb can; her nose sits above it by what her wing is doing.
      const pitchWant = flown
        ? (pl.pt || 0) + alphaFor(a, Math.hypot(gs, pl.vy || 0), 1) * Math.cos(bank)
        : flightAttitude(a, gs, pl.vy || 0, 1 / Math.max(0.35, Math.cos(bank)));
      // Eased like her bank, on the autopilot: her rate of climb comes off the
      // wire a tenth of a metre a second at a time, and her nose nodded with
      // every step of it.
      const pitchWas = this.planePitch.get(pl.i);
      const pitch = pitchWas === undefined || flown ? pitchWant
        : pitchWas + (pitchWant - pitchWas) * (1 - Math.pow(0.01, dt));
      this.planePitch.set(pl.i, pitch);
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
      const trim = this.bayTrim(pl, dt, mine ? mine.v : gs);
      // What has been shot through her, off the wire. Both sides get this:
      // a gunner walking his tracer onto a torpedo bomber has to be able to
      // see what it is doing to her.
      const holes = unpackHoles(pl.hl);
      if (mine) {
        // At her whole attitude, as a quaternion, and less whatever she has
        // lost -- see stepFlight.
        this.scene.flights.add(pl.r || 'torpedo', mine.x, mine.y, mine.z,
          mine.heading, mine.bank, mine.attitude, Math.max(1, pl.n || 1), skip,
          kind, trim, holes, a.span, this.flight.cut || 0, 0, attitudeOf(mine));
        const n = pathOf(mine);
        this.noteDrawn(pl.i, kind, n.x * mine.v, n.y * mine.v, n.z * mine.v);
        this.rearGun(pl, kind, { x: n.x * mine.v, y: n.y * mine.v, z: n.z * mine.v }, dt);
        this.airFx(pl.i, kind, mine.g, mine.v, mine.y,
          { x: n.x * mine.v, y: n.y * mine.v, z: n.z * mine.v },
          this.flight.firingNow ? 1 : 0, dt, this.flight.cut || 0);
      } else {
        // A wing panel shot away goes with the holes that took it: worked out
        // off the same list on every screen, so the machine a gunner has been
        // walking his fire along is seen to have lost the end of her wing.
        // And once gone, gone: the wing is not grown back because the holes
        // that took it have since dropped off the end of the list.
        const cut = (this.planeCut.get(pl.i) || 0) | cutFromHoles(holes, pl.dm);
        this.planeCut.set(pl.i, cut);
        this.scene.flights.add(pl.r || 'torpedo', pl.x, this.planeHeight(pl), pl.z,
          pl.h, bank, pitch, Math.max(1, pl.n || 1), skip, kind, trim, holes, a.span,
          cut, 0);
        this.noteDrawn(pl.i, kind, Math.sin(pl.h) * gs, pl.vy || 0, Math.cos(pl.h) * gs);
        this.rearGun(pl, kind, { x: Math.sin(pl.h) * gs, y: pl.vy || 0, z: Math.cos(pl.h) * gs }, dt);
        this.airFx(pl.i, kind, 1 / Math.max(0.25, Math.abs(Math.cos(bank))), gs,
          this.planeHeight(pl),
          { x: Math.sin(pl.h) * gs, y: pl.vy || 0, z: Math.cos(pl.h) * gs },
          (this.airBursts.get(pl.i) || 0) > this.time ? Math.max(1, pl.n || 1) : 0, dt, cut);
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
        0, w.kind, w.trim || null, w.holes, w.span || 12, w.cut || 0);
    }
    // And the ones that have just gone off a deck and are not on the wire yet.
    this.drawClimbOuts();
    // And the pieces that came off them.
    this.pieces.draw(this.scene.flights);
    // And the one the player is riding down after the simulation has finished
    // with her. She is off the wire, so nothing above draws her -- and a pilot
    // watching his own aeroplane vanish out from under him while he is still
    // in it is the one thing worse than being thrown out of the cockpit.
    const ride = this.flight && this.flight.orphan && !this.flight.heavy
      ? this.flight : null;
    if (ride) {
      const rp = ride.pilot;
      this.scene.flights.one(ride.role || 'torpedo', rp.x, rp.y, rp.z,
        rp.heading, rp.bank, rp.attitude, 0, ride.kind, { prop: ride.propTurn || 0 },
        ride.holes, (AERO[ride.kind] || AERO.avenger).span, ride.cut || 0, attitudeOf(rp));
    }
    this.scene.flights.end();
    this.scene.gunFlashes.end(dt);
    this.scene.contrails.update(dt, this.scene.camera);

    // The heavy squadrons, four thousand feet over the lot of them. They are
    // not anybody's carrier aircraft and they are not drawn as any: their own
    // models, their own batch, their own spacing. Interpolated between
    // snapshots the same way the flights are, because a formation stepping
    // five times a second reads as a slide show.
    this.scene.heavies.begin(dt);
    // Kept as well as drawn, for the same reason the shells are: a captain can
    // watch a squadron off the plot, and the camera has to ride the formation
    // the screen is showing rather than a snapshot position five times a
    // second behind it.
    const heavies = [];
    for (const bm of (a.bombers || [])) {
      const nx = b ? (b.bombers || []).find((q) => q.i === bm.i) : null;
      const x = nx ? lerp(bm.x, nx.x, t) : bm.x;
      const y = nx ? lerp(bm.y, nx.y, t) : bm.y;
      const z = nx ? lerp(bm.z, nx.z, t) : bm.z;
      const h = nx ? bm.h + angleDelta(bm.h, nx.h) * t : bm.h;
      // A coordinated turn, the same way a flight is banked: tan(bank) is the
      // speed times the rate of turn over g. A heavy in formation does not
      // throw herself about, so she is held to a good deal less than a
      // fighter. Three degrees nose-up is the attitude a loaded bomber cruises
      // at, and she holds it the whole way in.
      const gs = Math.max(20, bm.s || 80);
      const bank = clamp(Math.atan2(gs * (bm.tn || 0), 9.81), -0.45, 0.45);
      // The one the player is flying is drawn where his own flight model has
      // her, at the attitude the stick has her in -- not at the position the
      // last snapshot happened to carry. Two sources for one aeroplane is what
      // makes her jump: the model is interpolated and the camera reads raw
      // snapshots, and they disagree ten times a second.
      const mine = this.flight && this.flight.heavy && this.flight.id === bm.i
        ? this.flight.pilot : null;
      const holes = unpackHoles(bm.hl);
      const hspan = (HEAVY_AERO[bm.b] || HEAVY_AERO.lancaster).span;
      if (mine) {
        this.scene.heavies.add(
          bm.b || 'lancaster', mine.x, mine.y, mine.z,
          mine.heading, mine.bank, mine.attitude,
          Math.max(1, this.flight.count || bm.n || 1), holes, hspan,
        );
        heavies.push({
          ...bm, x: mine.x, y: mine.y, z: mine.z, h: mine.heading, bank: mine.bank,
        });
        continue;
      }
      this.scene.heavies.add(
        bm.b || 'lancaster', x, y, z, h, bank, 0.05,
        Math.max(1, bm.n || 1), holes, hspan,
      );
      heavies.push({ ...bm, x, y, z, h, bank });
    }
    this.bombersNow = heavies;
    this.scene.heavies.end();
    // Forget the flights that are no longer up, so the map does not grow.
    for (const id of [...this.planeTurn.keys()]) {
      if (!planes.some((q) => q.i === id)) {
        this.planeTrim.delete(id);
        this.planeTurn.delete(id);
        this.planePitch.delete(id);
        this.planeCut.delete(id);
        this.planeSmoke.delete(id);
      }
    }
    // The ones that are not flying any more: the wrecks on their way down.
    this.stepWrecks(dt);
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
      const kind = typeOf(pl && pl.k, role);
      const holes = unpackHoles(pl && pl.hl);
      if (burst) {
        fx.explosion(x, y0, z, 0.85);
        fx.debris(x, y0, z, 12);
        audio.explosion(0.7, { x, y: y0, z });
        // And the aeroplane herself in pieces, going outwards: her wings, her
        // tail, her airscrew and what is left of her middle.
        this.blowApart(kind, x, y0, z, heading, 62);
        continue;
      }
      if (this.wrecks.length > 14) this.wrecks.shift();
      const sp = 62 + Math.random() * 28;
      this.wrecks.push(this.breakWreck({
        role, kind: typeOf(pl && pl.k, role), x, y: y0, z,
        vx: Math.sin(heading) * sp, vy: -4 - Math.random() * 8, vz: Math.cos(heading) * sp,
        heading, pitch: -0.15, bank: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random()),
        // How fast she is going round as she falls. A wing off one side is a
        // spin; a hit in the engine is a long flat glide with the smoke
        // streaming off her.
        spin: (Math.random() - 0.5) * 2.6,
        tumble: 0.5 + Math.random() * 1.4,
        smoke: 0,
        // The holes that put her there, which go down with her. A machine that
        // comes out of the flak and falls out of the sky whole and unmarked is
        // the one thing a squadron never looked like.
        holes,
        span: (AERO[kind] || AERO.avenger).span,
      }, ev.why || 'shot', (ev.i || 0) * 7 + i));
    }
  }

  /**
   * What a machine going down has broken off her: worked out off how she went
   * and where the rounds were going in (see breakup.js), and the pieces put in
   * the air beside her with her speed and a twist of their own.
   */
  breakWreck(w, why, seed) {
    const had = cutFromHoles(w.holes);
    w.cut = breakCut(why, w.holes, seed, had);
    const groups = piecesOf(w.cut, had);
    if (groups.length) {
      const m = planeMatrix(w.x, w.y, w.z, w.heading, w.bank, w.pitch);
      this.pieces.spawn(this.scene.flights, w.kind, groups, m,
        { x: w.vx, y: w.vy, z: w.vz }, { seed });
      // Where it broke, a flash and a gout of smoke.
      const fx = this.scene.effects;
      fx.wreckSmoke(w.x, w.y, w.z, 1);
      fx.wreckSmoke(w.x, w.y + 1, w.z, 1);
    }
    return w;
  }

  /** A machine blown apart in the air: every piece of her, outwards. */
  blowApart(kind, x, y, z, heading, speed, pitch = 0, bank = 0) {
    const m = planeMatrix(x, y, z, heading, bank, pitch);
    const v = { x: Math.sin(heading) * speed, y: 0, z: Math.cos(heading) * speed };
    this.pieces.spawn(this.scene.flights, kind,
      [['body'], ['tail', 'gearT'], ['wingInL', 'gearL'], ['wingInR', 'gearR'],
        ['wingOutL'], ['wingOutR'], ['prop']], m, v, { burst: true });
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
      // Blown apart in the air. There is nothing left to fall but pieces.
      fx.explosion(o.x, o.y, o.z, 0.8);
      fx.debris(o.x, o.y, o.z, 12);
      audio.explosion(0.65, { x: o.x, y: o.y, z: o.z });
      this.blowApart(o.kind, o.x, o.y, o.z, o.heading, 60);
      return;
    }
    if (this.wrecks.length > 14) this.wrecks.shift();
    // A machine that has been crippled is still flying: she turns away and
    // goes down slowly on what is left of her engine. One that has burned or
    // been shot to pieces is not flying at all.
    const limp = o.why === 'crippled' || o.why === 'dry';
    const sp = limp ? 44 + Math.random() * 14 : 60 + Math.random() * 26;
    this.wrecks.push(this.breakWreck({
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
      holes: o.holes || null,
      span: o.span || 12,
    }, o.why || 'shot', Math.round(o.x * 3 + o.z * 7)));
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
    this.pieces.step(dt, fx, (x, z) => this.scene.ocean.heightAt(x, z));
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
   * Where and how an aeroplane left a deck, in the world: off the end of the
   * integrated run on a carrier, off the end of the shot on a catapult. Kept
   * for the climb-out (see drawClimbOuts) and the hand-over to the flight the
   * simulation is flying.
   */
  leftDeck(v, deck) {
    v.group.updateMatrixWorld(true);
    const at = new THREE.Vector3();
    const fwd = new THREE.Vector3(0, 0, 1);
    let pitch = 0;
    if (deck.endPose) {
      at.set(deck.endPose.x, deck.endPose.y, deck.endPose.z).applyMatrix4(v.group.matrixWorld);
      fwd.transformDirection(v.group.matrixWorld);
      pitch = deck.endPose.pitch || 0;
    } else {
      at.setFromMatrixPosition(deck.endMatrix);
      fwd.transformDirection(deck.endMatrix);
      pitch = Math.asin(clamp(fwd.y, -1, 1));
    }
    const P = v.cls && v.cls.planes ? v.cls.planes : {};
    const role = (deck.plane && deck.plane.role) || (P.group ? 'torpedo' : 'dive');
    const type = (P.types && P.types[role]) || P.type || null;
    return {
      at, t: deck.airborneAt ?? this.time,
      h: Math.atan2(fwd.x, fwd.z), pitch: clamp(pitch, -0.2, 0.35),
      v: P.launchSpeed ?? 44, role, kind: typeOf(type, role), handed: false,
    };
  }

  /**
   * Where an aeroplane is that left a deck `left` describes: on along the line
   * she left it on, working up from her take-off speed, and climbing.
   */
  climbOutAt(left) {
    const since = Math.max(0, Math.min(6, this.time - left.t));
    const run = left.v * since + 0.8 * since * since;
    const flat = Math.cos(left.pitch);
    return {
      x: left.at.x + Math.sin(left.h) * run * flat,
      y: left.at.y + Math.max(4 * since, Math.sin(left.pitch) * run * 0.5),
      z: left.at.z + Math.cos(left.h) * run * flat,
    };
  }

  /**
   * The aeroplanes that have left a deck and are not on the wire yet.
   *
   * The deck model is struck below the instant her run is over, and the
   * flight the simulation puts up is drawn a few snapshots later, when the
   * picture's clock gets to the snapshot she first appears in. Between the two
   * there was no aeroplane at all: she went off the bow, vanished, and came
   * back a moment later. She is drawn here for that moment instead, flying
   * on from where the deck left her, and the flight is handed her place when
   * it comes on (see flyLaunched).
   */
  drawClimbOuts() {
    for (const [, v] of this.scene.shipViews) {
      const deck = v.group.userData.deck;
      const left = deck && deck.left;
      if (!left || left.handed || !v.group.parent) continue;
      if (this.time - left.t > 4) continue;
      const e = this.climbOutAt(left);
      left.prop = (left.prop || 0) + 1.6;
      this.scene.flights.one(left.role, e.x, e.y, e.z, left.h, 0, left.pitch, 0,
        left.kind, { prop: left.prop, gear: 1 });
    }
  }

  /**
   * The aircraft that have just left the deck.
   *
   * The deck run is integrated from the aeroplane's own weight and wing, and
   * the simulation puts her into the air at the point that run ends -- each
   * type at her own point, off her own profile (see the carriers' `runOut`).
   * So the aeroplane the simulation flies is in the place, and at the
   * attitude, of the aeroplane that just went off the bow, very nearly.
   *
   * Very nearly is not quite. The two clocks are within a frame or two of
   * each other and either can be first; a snapshot can be late; the ship can
   * be turning under her. So the gap between where the deck model left her
   * and where the simulation has her is carried on her for a moment and eased
   * out, rather than jumped -- and nothing else about her is touched: there
   * is still only the one aeroplane, flown by the simulation.
   *
   * It used to be a flight of several machines drawn round the one that had
   * just taken off, which is the aeroplane that took off, jumped, and had
   * three more appear beside her.
   */
  flyLaunched(planes, dt) {
    for (const [, v] of this.scene.shipViews) {
      const deck = v.group.userData.deck;
      if (!deck || !deck.pending) continue;
      // Where the deck model was when she went, in the world, taken the frame
      // she goes and kept: the word that her flight is up, and the order for
      // the next one to come up the lift, arrive in the same breath, and the
      // next evolution has started on the deck by the time anybody looks.
      // Once a launch: `airborne` stays up until the next one is called, and
      // latching her again after she had been handed over drew her climbing
      // out a second time.
      if (deck.airborne && (deck.endPose || deck.endMatrix) && !deck.left
        && deck.leftOf !== deck.launchAt) {
        deck.leftOf = deck.launchAt;
        deck.left = this.leftDeck(v, deck);
      }
      if (deck.left && this.time - deck.left.t > 6) deck.left = null;
      if (!deck.pending.length) continue;
      // The difference between that and where the simulation has her is
      // carried on her for a moment and eased out, so the aeroplane that went
      // off the bow is the one that flies on. A flight not on the wire yet is
      // waited for, but not for long.
      const left = deck.left;
      if (left) {
        for (const id of deck.pending) {
          const pl = planes.find((q) => q.i === id);
          if (!pl || this.handover.has(id)) continue;
          // Where the climb-out has got her to -- the aeroplane on the screen
          // this instant, flying on from the deck at the speed she left it --
          // so she is handed over where she is drawn, not where she might be.
          const e = this.climbOutAt(left);
          this.handover.set(id, {
            t0: this.time, dx: e.x - pl.x, dy: e.y - (pl.y ?? e.y), dz: e.z - pl.z,
          });
          // And at the attitude she is drawn at, eased from there onto her own.
          this.planePitch.set(id, left.pitch);
          left.handed = true;
        }
      }
      const waiting = deck.pending.some((id) => !planes.some((q) => q.i === id));
      if ((waiting || !left) && this.time - (deck.pendingAt ?? this.time) < 2.5) {
        deck.pendingAt = deck.pendingAt ?? this.time;
        continue;
      }
      deck.pendingAt = undefined;
      deck.pending.length = 0;
      deck.left = null;
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
    // It goes off on her and in her: an explosion, and the hole it made
    // coming down through her deck -- a hole and nothing else; what was
    // standing on that piece of deck falls in with it.
    this.scene.shipBurst(x, y + 2, z, blastScale(6000));
    {
      const p = new THREE.Vector3(x, y, z);
      hit.group.updateMatrixWorld(true);
      hit.group.worldToLocal(p);
      if (hit.plating) hit.holeAt(p.x, p.y, p.z, holeRadius('bomb', 454) * 0.45);
    }
    // On our own deck it goes on the board, where the deck went.
    if (hitId === this.shipId) this.markHole(x, y, z, 'bomb');
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
    // Counted, so the board knows the list has changed when it is full and
    // one goes off the front as one comes on the back. See DamageBoard.setHits.
    this.holes.v = (this.holes.v || 0) + 1;
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
    // Riding your own bombs down.
    //
    // The camera has to leave the aeroplane for this, and both the turret and
    // the cockpit below belong to her: a pilot who presses the bomb key and
    // stays in the cockpit watching his own tailplane has been given a key
    // that does nothing. She goes on flying herself down the wire while it is
    // up -- the stick is still read and still sent, see stepFlight -- so
    // coming off the camera puts you straight back at the controls.
    const riding = this.shellCam && this.watching && this.watching.kind === 'shell';
    // On his own two feet: a man's eye, a man's field of view, and a near
    // plane close enough that the rail in front of him is not cut away.
    if (this.man) {
      // Her wheelhouse's cut goes where she is now that she has been put
      // there this frame; a frame late and her plating shows through the
      // windows at thirty knots.
      if (this.man.room) {
        const view = this.scene.shipViews.get(this.shipId);
        if (view && view.bridge) this.placeBridge(view);
      }
      const e = this.manEye();
      cam.fov = 72;
      cam.near = this.man.room ? 0.05 : 0.1;
      cam.updateProjectionMatrix();
      cam.up.set(0, 1, 0);
      cam.position.copy(e.pos);
      cam.lookAt(e.pos.x + e.dir.x * 100, e.pos.y + e.dir.y * 100, e.pos.z + e.dir.z * 100);
      this.input.orbiting = true;
      return;
    }
    // Behind one of her searchlights: the eye a little above and behind its
    // glass, looking down the beam.
    if (this.lamp && !riding) {
      const view = this.scene.shipViews.get(this.shipId);
      const e = view && view.lamps ? view.lamps.eye(this.lamp.k) : null;
      if (!e) this.leaveLamp(true);
      else {
        cam.fov = 58;
        cam.updateProjectionMatrix();
        cam.up.set(0, 1, 0);
        const flat = Math.hypot(e.dir.x, e.dir.z) || 1;
        cam.position.set(e.pos.x - (e.dir.x / flat) * 2.2, e.pos.y + 1.1, e.pos.z - (e.dir.z / flat) * 2.2);
        cam.lookAt(e.pos.x + e.dir.x * 600, e.pos.y + e.dir.y * 600 + 1.1, e.pos.z + e.dir.z * 600);
        this.input.orbiting = true;
        return;
      }
    }
    if (this.turret && !riding) {
      // In one of her turrets. The eye is on the mounting, the drag turns the
      // gunner's head, and the head does not go outside the cone the mounting
      // has -- so a tail gunner cannot look forward past his own fins and a
      // mid-upper cannot look down through his own wing. That clamp is what
      // makes a turret a turret rather than a free camera bolted to an
      // aeroplane, and it is the model's own arc, not a number chosen here.
      const eye = this.turretEye();
      if (!eye) { this.turret = null; this.hud.setAirGun(null); } else {
        const m = this.input.takeMouse();
        const t = this.turret;
        const arc = t.spec.arc === undefined ? Math.PI : (t.spec.arc * Math.PI) / 180;
        const up = ((t.spec.up === undefined ? 60 : t.spec.up) * Math.PI) / 180;
        const down = ((t.spec.down === undefined ? 30 : t.spec.down) * Math.PI) / 180;
        // Her own centreline for this mounting: a tail turret's cone is about
        // dead astern, everything else's is about dead ahead.
        const home = t.name === 'tail' || t.name === 'gondola' ? Math.PI : 0;
        t.yaw = home + clamp(wrapAngle(t.yaw + m.x - home), -arc, arc);
        t.pitch = clamp(t.pitch + m.y, -up, down);
        cam.fov = 58;
        cam.updateProjectionMatrix();
        cam.up.set(0, 1, 0);
        cam.position.set(eye.x, Math.max(eye.y, 2), eye.z);
        const look = wrapAngle(eye.heading + t.yaw);
        const cp2 = Math.cos(t.pitch);
        cam.lookAt(
          eye.x + Math.sin(look) * cp2 * 600,
          eye.y - Math.sin(t.pitch) * 600,
          eye.z + Math.cos(look) * cp2 * 600,
        );
        this.input.orbiting = true;
        return;
      }
    }
    // In the cockpit: behind her and above, looking where the marker is.
    if (this.flight && !riding) {
      // Not where she is pointed: drag the view round and she is seen rolling
      // and pulling after it, and once she is on it the ring sits on the
      // marker. The horizon stays level, so what turns is the aeroplane.
      const f = this.flight;
      const p = f.pilot;
      const zoom = this.hud.fly && this.hud.fly.zoom;
      const want = zoom ? 30 : 62;
      cam.fov = lerp(cam.fov || 62, want, 1 - Math.pow(0.0005, Math.min(0.1, dt)));
      cam.updateProjectionMatrix();
      // Off her own span, so the camera stands where she can be seen: a heavy
      // is three times the aeroplane and wants three times the room.
      const { back, up } = this.chaseRig(p);
      const F = f.aimF;
      const U = f.aimU;
      // A little give in the rig, so a burst of buffet or a gust shakes her
      // in the frame instead of shaking the frame.
      const r = f.rig || (f.rig = { x: p.x, y: p.y, z: p.z });
      const kr = 1 - Math.pow(1e-6, Math.min(0.1, dt));
      r.x = lerp(r.x, p.x, kr);
      r.y = lerp(r.y, p.y, kr);
      r.z = lerp(r.z, p.z, kr);
      // Behind her down the line of the view and above her along the view's
      // own up -- which is under her when the view is upside down over the
      // top of a loop, so she stays in the same place in the picture.
      // Turned round her by however far the free camera has been dragged:
      // about the view's own up, then up and down over her.
      let cF = F, cU = U;
      if (f.lookYaw || f.lookPitch) {
        cF = { x: F.x, y: F.y, z: F.z };
        cU = { x: U.x, y: U.y, z: U.z };
        if (f.lookYaw) rotate(cF, U, f.lookYaw);
        if (f.lookPitch) {
          const rx = cF.y * cU.z - cF.z * cU.y, ry = cF.z * cU.x - cF.x * cU.z, rz = cF.x * cU.y - cF.y * cU.x;
          const ax = { x: rx, y: ry, z: rz };
          norm3(ax);
          rotate(cF, ax, -f.lookPitch);
          rotate(cU, ax, -f.lookPitch);
        }
      }
      const ex = r.x - cF.x * back + cU.x * up;
      const ey = Math.max(r.y - cF.y * back + cU.y * up, 3);
      const ez = r.z - cF.z * back + cU.z * up;
      cam.position.set(ex, ey, ez);
      cam.up.set(cU.x, cU.y, cU.z);
      cam.lookAt(ex + cF.x * 1000, ey + cF.y * 1000, ez + cF.z * 1000);
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
      const m = this.input.takeMouse();
      // Round as far as the mounting trains and no further -- and with the
      // stops coming round with her as she turns under him.
      this.gunYaw = this.gunArcYaw(wrapAngle(this.gunYaw + m.x));
      // How far up and down the layer looks. A close-range mounting's sight is
      // its barrels, laid over open sights on an aeroplane, so it goes from
      // its depression stop to its elevation stop; a heavy gun's layer looks
      // at the sea and the ships on it, from a little above the horizon down
      // to the water alongside. (The sight's pitch is down-positive.)
      const st = this.gun.stops;
      const [hi, lo] = this.gun.auto && st ? [-st.max, -st.min] : [-0.30, 0.42];
      this.gunPitch = clamp(this.gunPitch + m.y, hi, lo);
      const eye = this.gunEye();
      if (eye) {
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
        this.applyRecoil(cam);
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
    // Not on the plot: a chart that jumps when the guns go off is not a chart.
    if (this.camMode !== 'tactical') this.applyRecoil(cam);
    cam.updateProjectionMatrix();
  }

  /**
   * Your own guns going off, felt through the camera. One a mounting: the
   * barrels of a turret fire together and kick once.
   */
  kick(cal) {
    const list = this.recoils || (this.recoils = []);
    if (list.length >= 6) list.shift();
    list.push({ at: this.recoilClock || 0, cal, roll: Math.random() < 0.5 ? -1 : 1 });
  }

  /**
   * Lay the kick over wherever the camera has just been put: tipped up a
   * little, rolled a touch, and the view opened out a shade, as if the whole
   * ship had been shoved back under the eye. Every camera is put fresh each
   * frame, so this is laid on fresh each frame and never builds up.
   */
  applyRecoil(cam) {
    const list = this.recoils;
    if (!list || !list.length) return;
    const now = this.recoilClock || 0;
    let k = 0;
    let roll = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const age = now - list[i].at;
      if (age > 1) { list.splice(i, 1); continue; }
      const r = recoilKick(age, list[i].cal);
      k += r;
      roll += r * list[i].roll;
    }
    if (k <= 0) return;
    // A broadside of four turrets is one heavier kick, not four on top of
    // one another.
    const cap = Math.min(1, 1.3 / k);
    k *= cap;
    roll *= cap;
    // In proportion to what the lens takes in, so it is the same slight jolt
    // through a gun sight as on the bridge, not ten times the size.
    const fov = THREE.MathUtils.degToRad(cam.fov);
    cam.rotateX(k * fov * 0.015);
    cam.rotateZ(roll * fov * 0.005);
    cam.fov *= 1 + 0.02 * k;
  }

  render() {
    // Whether the eye is in the water, decided fresh each frame from where the
    // camera actually ended up and what the sea is doing under it.
    const cam = this.scene.camera;
    const sea = this.scene.ocean.heightAt(cam.position.x, cam.position.z);
    // A man swimming has his eye just over the water he is drawn in, on the
    // clock it is drawn at -- not the one his last step was taken on, which a
    // slow frame leaves a wave behind.
    if (this.man && this.man.swimming) cam.position.y = sea + MAN.float;
    // Stood in her wheelhouse or her conning tower he is in a dry room,
    // whatever the sea outside it is doing.
    this.scene.setUnderwater(cam.position.y < sea - 0.2 && !(this.man && this.man.room));
    this.scene.render();
  }

  resize(w, h) { this.scene.resize(w, h); }

  dispose() {
    this.targetView?.dispose();
    // Off her bridge first: the cut round it is on materials the next
    // battle's ships are drawn with too.
    this.leaveMan(true);
    this.penCam?.el.remove();
    this.off.forEach((f) => f());
    this.input.enabled = false;
    this.input.reset();
    this.input.releaseLock();
    audio.stopAmbience();
    this.hud.setSunk(false);
    this.hud.showScoreboard(null, 0, false);
    // And everything the battle put on the GPU, or the next one starts with
    // this one still in memory.
    try { this.scene.dispose(); } catch (e) { console.error('Steel Currents: clearing the battle', e); }
    this.hud.dispose?.();
    this.abort?.abort();
    for (const b of [this.board, this.armsBoard, this.planeBoard]) { try { b?.dispose(); } catch { /* gone */ } }
    this.board = this.armsBoard = this.planeBoard = null;
    // A button's onclick on the page can still reach this battle until the
    // next one takes the button over; let it reach nothing heavy.
    this.snapshots = [];
    this.entities?.clear?.();
  }
}
