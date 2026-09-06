// The shipyard: one hull at a time, under way in open water, with the camera
// free to walk round her.
//
// This is the screen a captain reaches from the fleet buttons on the briefing.
// It draws into the same canvas as the title and the battle, so the panels over
// it are plain DOM and the ship behind them is the real view-model the battle
// will put on the water — not a picture of one.

import * as THREE from '../../vendor/three.module.js';
import { Ocean } from './render/ocean.js';
import { Wake, WakeField } from './render/wakefield.js';
import { Seakeeping } from './render/seakeeping.js';
import { buildShip } from './render/ships.js';
import { buildIowa } from './render/iowa.js';
import { skyDome } from './render/scene.js';
import { SHIP_CLASSES } from '../../shared/ships.js';

// The stops on the range, as multiples of her own length. The rest range is
// worked out from the field of view instead, so a destroyer and a battleship
// both fill about the same part of whatever frame they are shown in.
const MIN_RANGE = 0.55;
const MAX_RANGE = 3.4;

// Straight down is useless and straight up nearly so, so the pitch stops short
// of both. The lower stop is well under the waterline, which is the point.
const PITCH_MIN = -0.85;
const PITCH_MAX = 0.95;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class ShipyardScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.6, 40000);

    this.sky = skyDome('day');
    this.scene.add(this.sky);

    this.ocean = new Ocean('day', 12000, 180);
    // Deeper and less mirror-bright than the battle sea: a hull is being looked
    // at here, and a blown-out glare path across the frame competes with it.
    const ou = this.ocean.material.uniforms;
    ou.uDeep.value = new THREE.Color(0x08243c);
    ou.uShallow.value = new THREE.Color(0x1b5a80);
    ou.uSpecular.value = 0.20;
    // The sun sits abaft the beam rather than over the shoulder, so its path on
    // the water runs away behind her instead of washing out the near field.
    ou.uLightDir.value.set(-0.55, 0.62, -0.55).normalize();
    // Seen from below, a single-sided sea is not there at all — and going under
    // her keel is half the reason for this screen.
    this.ocean.material.side = THREE.DoubleSide;
    this.ocean.setSeaState(1);
    this.scene.add(this.ocean.mesh);

    this.hemi = new THREE.HemisphereLight(0xbcd6ef, 0x2a3742, 1.05);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dc, 1.5);
    this.sun.position.set(-420, 520, 320);
    this.scene.add(this.sun);
    const fill = new THREE.DirectionalLight(0x8fb2d4, 0.45);
    fill.position.set(380, 180, -420);
    this.scene.add(fill);

    // Above water she is seen through clear air; below it, through water.
    this.airFog = new THREE.FogExp2(0x9fbcd4, 0.00007);
    this.seaFog = new THREE.FogExp2(0x0d3348, 0.0013);
    this.scene.fog = this.airFog;

    // What she is doing to that water. She is making way, so she has a wake,
    // and it is the ocean's own surface being moved rather than anything laid
    // on top of it -- exactly as in a battle.
    this.wakes = new WakeField({ size: 1024 });
    this.wake = null;
    this.wakeSpeed = 0;
    // How far she has run since her hull was put on the water. She is drawn
    // where she actually is rather than at the origin, because her wake is
    // laid in the world and has to stay under her.
    this.way = 0;

    this.ship = null;
    this.classId = null;
    this.time = 0;
    this.orbit = { yaw: -0.72, pitch: 0.22, range: 1, target: 1 };
    this.pointers = new Map();
    this.pinch = 0;
    this.under = false;
  }

  /** Put a different hull on the water. */
  setShip(classId) {
    if (this.classId === classId) return;
    this.classId = classId;
    if (this.ship) {
      this.scene.remove(this.ship.group);
      this.ship.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    // The Iowa has a portrait model of her own — every barrel, director and
    // aerial on her. It is far too much geometry for forty ships in a battle,
    // and exactly right for one ship being looked over.
    this.ship = classId === 'iowa' ? buildIowa() : buildShip(classId);
    // Trained a little off the bow so the barrels read as barrels rather than
    // as three dots pointing at the lens.
    // Trained off the centreline so the barrels read as barrels rather than as
    // dots pointing at the lens — but about each turret's own rest bearing, or
    // the after guns would swing round and fire through the bridge.
    const rest = SHIP_CLASSES[classId]?.turrets || [];
    this.ship.turrets.forEach((t, i) => {
      t.rotation.y = (rest[i]?.angle || 0) + (i % 2 ? 0.42 : -0.38);
    });
    this.scene.add(this.ship.group);
    this.addWake();

    this.ranged = false;
    this.orbit.range = this.orbit.target = this.fitRange();
    this.orbit.yaw = -0.72;
    this.orbit.pitch = 0.22;
  }

  /**
   * The white water that says she is making way rather than lying stopped.
   *
   * The same wake the battle draws, and for the same reason: it is not a sheet
   * of painted foam laid over the sea but the sea itself, displaced. She is
   * shown at a steady cruising speed with a track already behind her, so the
   * bow wave is up and the wash astern is settled before anyone looks at her.
   */
  addWake() {
    if (this.wake) this.wakes.remove(this.wake);
    const cls = SHIP_CLASSES[this.classId];
    this.wake = new Wake({ length: this.ship.length, beam: this.ship.beam });
    this.wakes.add(this.wake);
    // Two thirds of her best speed: enough for a proper bow wave, short of the
    // great flat-out wash that would fill the frame behind a destroyer.
    this.wakeSpeed = (cls?.maxSpeed || 15) * 0.66;
    // Steam her far enough for the wake to have reached its full length before
    // the screen is drawn once, rather than growing out behind her while she
    // is being looked over.
    this.way = 0;
    for (let i = 0; i < 900; i++) this.stepWake(1 / 6);
  }

  /** Carry her forward and lay another piece of her track. */
  stepWake(dt) {
    this.way += this.wakeSpeed * dt;
    this.wake.update(dt, 0, this.way, 0, this.wakeSpeed);
  }

  // ------------------------------------------------------------- camera --

  /** Drag to walk round her, wheel or pinch to close and open the range. */
  attach(el) {
    this.el = el;
    const o = this.orbit;

    const down = (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) this.pinch = this.spread();
      try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    };
    const move = (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        o.yaw -= dx * 0.006;
        o.pitch = clamp(o.pitch + dy * 0.005, PITCH_MIN, PITCH_MAX);
      } else if (this.pointers.size === 2 && this.pinch > 0) {
        const now = this.spread();
        o.target = clamp(o.target * (this.pinch / Math.max(1, now)), this.minRange(), this.maxRange());
        this.ranged = true;
        this.pinch = now;
      }
    };
    const up = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = 0;
      try { el.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    };

    this.handlers = { down, move, up };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', this.handlers.wheel = (e) => {
      e.preventDefault();
      o.target = clamp(o.target * (1 + Math.sign(e.deltaY) * 0.12), this.minRange(), this.maxRange());
      this.ranged = true;
    }, { passive: false });
  }

  detach() {
    if (!this.el || !this.handlers) return;
    const { down, move, up, wheel } = this.handlers;
    this.el.removeEventListener('pointerdown', down);
    this.el.removeEventListener('pointermove', move);
    this.el.removeEventListener('pointerup', up);
    this.el.removeEventListener('pointercancel', up);
    this.el.removeEventListener('wheel', wheel);
    this.pointers.clear();
    this.el = null;
  }

  spread() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** The range at which she just fits the frame across. A phone held upright
   *  has a fifth of the horizontal field a laptop does, so a fixed multiple of
   *  her length would put half the ship outside the picture. */
  fitRange() {
    const L = this.ship?.length || 150;
    const vHalf = (this.camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    // Seen on the quarter she is a little shorter than her full length across,
    // and the margin keeps her clear of the frame.
    return Math.max(L * 0.8, ((L * 0.52) / Math.tan(hHalf)) * 1.12);
  }

  minRange() { return (this.ship?.length || 150) * MIN_RANGE; }
  maxRange() { return Math.max((this.ship?.length || 150) * MAX_RANGE, this.fitRange() * 1.6); }

  /** Step the camera round to the next quarter, for the keyboard. */
  nudge(dir) { this.orbit.yaw += dir * 0.35; }
  zoom(dir) {
    this.orbit.target = clamp(this.orbit.target * (1 + dir * 0.12), this.minRange(), this.maxRange());
    this.ranged = true;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Turning a phone sideways changes what fits, so the range follows unless a
    // captain has already closed or opened it themselves.
    if (this.ship && !this.ranged) this.orbit.target = this.fitRange();
  }

  update(dt) {
    this.time += dt;
    if (!this.ship) return;

    // She floats on the water she is actually in.
    //
    // She used to move on three sine waves of her own -- a roll, a pitch and a
    // heave, each on her own period -- with no reference at all to the sea
    // under her. That is the wrong kind of wrong: the swell here is the better
    // part of half a kilometre long, so a hull sits on a face of it that is
    // tilted for tens of seconds at a stretch, and a ship that stays level
    // while the water round her lies over reads as a ship trimmed by the
    // stern. In flat calm, which is what a berth is, she looked as though she
    // were down by the head or the stern for no reason at all.
    //
    // So she takes the same water the battle gives her, through the same
    // spring: her attitude is measured off the sea under her ends, and how
    // much of it reaches her is a matter of her size, exactly as at sea.
    const g = this.ship.group;
    const hull = SHIP_CLASSES[this.classId]?.hull
      || { length: 180, beam: 20 };
    if (!this.sea || this.seaFor !== this.classId) {
      this.sea = new Seakeeping(hull);
      this.seaFor = this.classId;
    }
    // Another few metres of her track, and the water she is now in.
    this.stepWake(dt);
    const att = this.ocean.attitude(0, 0, this.way, hull.length, hull.beam);
    const m = this.sea.step(att, dt);
    g.rotation.order = 'YXZ';
    g.rotation.z = m.roll;
    g.rotation.x = m.pitch;
    g.position.set(0, m.heave, this.way);
    // The sea and the sky are carried along with her, so she never runs out
    // from under either of them however long the screen is left open.
    this.ocean.mesh.position.z = this.way;
    this.sky.position.z = this.way;
    // Her lifts work while she is being looked at, which is the only way to see
    // the hangar under the flight deck. On wall time, so they run at the same
    // speed however fast the yard happens to be drawing.
    g.userData.step?.(performance.now() / 1000);

    const o = this.orbit;
    o.range += (o.target - o.range) * Math.min(1, dt * 6);

    // The camera looks at her waist, a little above the waterline, so she stays
    // centred whether the view is from the masthead or from under the keel.
    const focusY = this.ship.deckY * 0.5;
    const cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
    this.camera.position.set(
      Math.sin(o.yaw) * cp * o.range,
      focusY + sp * o.range,
      this.way + Math.cos(o.yaw) * cp * o.range,
    );
    this.camera.lookAt(0, focusY, this.way);

    // Under the surface the water closes in and the light off the sky goes with
    // it, so the hull is lit from above by what is left of it.
    const under = this.camera.position.y < 0;
    if (under !== this.under) {
      this.under = under;
      this.scene.fog = under ? this.seaFog : this.airFog;
      this.sky.visible = !under;
      this.ocean.setUnder(under);
      this.hemi.intensity = under ? 0.95 : 1.05;
      this.sun.intensity = under ? 1.25 : 1.5;
    }
    this.ocean.update(dt, null);
  }

  render() {
    // The wake map before the water that reads it, so the surface is displaced
    // by where she is now rather than by where she was last frame.
    this.wakes.render(this.renderer, this.camera);
    this.wakes.bind(this.ocean.material.uniforms);
    this.renderer.render(this.scene, this.camera);
  }
}

// ------------------------------------------------------- the datasheets --

const WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
  'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];

/** "Nine", "Twenty", "80" — a gun count reads as a word until it stops being
 *  shorter than the numeral. */
const count = (n) => WORDS[n] || String(n);

const num = (n) => n.toLocaleString('en-US');

/** Inch guns for the navies that ordered them that way, millimetres for the
 *  ones that did not. */
function gunLabel(caliber, nation) {
  if (nation === 'ger' || caliber < 100) return `${caliber}mm`;
  const inches = caliber / 25.4;
  const shown = Math.abs(inches - Math.round(inches)) < 0.06
    ? Math.round(inches) : inches.toFixed(1);
  return `${shown}"`;
}

const barrels = (cls) => cls.turrets.reduce((n, t) => n + t.guns, 0);
const tubes = (cls) => (cls.torpedoes?.mounts || []).reduce((n, m) => n + m.tubes, 0);

/** Weight, speed, aircraft and how thick she is where it counts. */
export function hullSheet(cls, group = null) {
  const d = cls.datasheet;
  const rows = [
    ['Displacement', `${num(d.displacement)} t`],
    ['Top speed', `${Math.round(cls.maxSpeed / 0.5144)} kn`],
  ];
  // A carrier's group is hers to balance; a cruiser's floatplanes are simply
  // what she has, so a class with aircraft and no hangar to re-stow says so.
  const spec = cls.planes && cls.planes.group;
  const g = spec ? (group || spec.default) : null;
  const air = g ? g.fighters + g.dive + g.torpedo : d.aircraft;
  rows.push(['Aircraft', air
    ? `${air} ${spec ? 'carrier aircraft' : 'sea planes'}`
    : 'None embarked']);
  rows.push(
    ['Belt', `${cls.armor.belt} mm`],
    ['Deck', `${cls.armor.deck} mm`],
    ['Turret face', `${cls.armor.citadel} mm`],
    ['Bow', `${cls.armor.bow} mm`],
  );
  return rows;
}

/**
 * How far a mounting can be trained off its rest bearing, in words.
 *
 * `arc` is the half-angle either side, so a mount with PI can be laid anywhere
 * on the horizon. The narrowest mounting on a ship is the one that decides
 * whether she can fight without turning, so that is the one quoted.
 */
function traverse(cls) {
  const tightest = cls.turrets.reduce((a, t) => Math.min(a, t.arc), Math.PI);
  if (tightest >= Math.PI - 0.01) return '360°';
  return `${Math.round((tightest * 180) / Math.PI) * 2}°`;
}

/** Every barrel she carries, with the magazine behind it. */
export function armsSheet(cls, group = null) {
  const d = cls.datasheet;
  const rows = [];
  rows.push([`${count(barrels(cls))} ${gunLabel(cls.gun.caliber, cls.nation)} main`,
    `${num(d.mainRounds)} rds`]);
  rows.push(['Main battery training', traverse(cls)]);
  if (d.secondary) {
    rows.push([`${count(d.secondary.barrels)} ${d.secondary.label} secondary`,
      `${num(d.secondary.rounds)} rds`]);
  }
  for (const t of d.tertiary || []) {
    rows.push([`${count(t.barrels)} ${t.label} AA`, `${num(t.rounds)} rds`]);
  }
  if (cls.torpedoes) {
    rows.push([`${count(tubes(cls))} 21" tubes`,
      `${num(d.torpedoesCarried ?? tubes(cls))} fish`]);
  }
  if (cls.planes && cls.planes.group) {
    // Both of these open the air group panel: what she is carrying is the one
    // thing on a carrier's sheet a captain gets to decide.
    const g = group || cls.planes.group.default;
    const air = g.fighters + g.dive + g.torpedo;
    rows.push([`${cls.planes.squadrons} strike squadrons`, `${air} aircraft`, 'airgroup']);
    rows.push(['Air group',
      `${g.fighters}F &middot; ${g.dive}D &middot; ${g.torpedo}T`, 'airgroup']);
  } else if (cls.planes) {
    rows.push([`${cls.planes.squadrons} catapults`, `${d.aircraft} sea planes`]);
  }
  return rows;
}
