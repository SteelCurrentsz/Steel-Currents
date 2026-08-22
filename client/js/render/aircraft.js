// The raid: flights of heavy bombers crossing the island, and the sticks they
// drop on it.
//
// The aircraft are seen from a mile off against a burning sky, so they are
// built as silhouettes — the shape that matters is the planform, not the
// panel lines. Bombs are drawn with a streak behind them, because a 2 m object
// at that range is smaller than a pixel and would otherwise arrive from nowhere.

import * as THREE from '../../../vendor/three.module.js';
import { mergeStatic } from './merge.js';

const DARK = new THREE.MeshLambertMaterial({ color: 0x3d444f });
const GLASS = new THREE.MeshBasicMaterial({ color: 0x2b3a48 });
const LAMP_R = new THREE.MeshBasicMaterial({ color: 0xff4438 });
const LAMP_G = new THREE.MeshBasicMaterial({ color: 0x49ff86 });

/**
 * A B-17G Flying Fortress, nose toward +Z.
 *
 * What identifies her at any range is the planform and the tail: a long
 * slender fuselage, a wing of high aspect ratio tapering to square tips, and
 * that enormous fin with the dorsal fillet running two thirds of the way
 * forward along the spine. The turrets — chin, dorsal, ball, tail — are what
 * separate a Fortress from every other four-engined heavy, so they are on her
 * even though they are a few pixels each at the range this screen puts her.
 *
 * Span is drawn a little over life size (a real one is 31.6 m) so she still
 * reads as an aeroplane from a mile off.
 */
export function buildBomber(span = 72) {
  const g = new THREE.Group();
  // Everything is laid out against the real machine's proportions: 22.7 m long
  // on a 31.6 m span, so length is 0.72 of span.
  const c = span / 31.6;
  const LEN = 22.7 * c;

  // Fuselage: slim, near circular, and drawn out to a long tapered tail cone.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.05 * c, 1.15 * c, LEN * 0.58, 10), DARK);
  body.rotation.x = Math.PI / 2;
  body.position.z = LEN * 0.06;
  g.add(body);
  const tailCone = new THREE.Mesh(new THREE.CylinderGeometry(1.05 * c, 0.42 * c, LEN * 0.40, 10), DARK);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.z = -LEN * 0.42;
  g.add(tailCone);

  // The glazed nose, and the chin turret under it.
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.05 * c, 10, 8), GLASS);
  nose.position.z = LEN * 0.35;
  nose.scale.set(1.0, 0.92, 1.7);
  g.add(nose);
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.62 * c, 8, 6), DARK);
  chin.position.set(0, -0.95 * c, LEN * 0.30);
  g.add(chin);

  // Cockpit: a stepped canopy well forward, ahead of the wing.
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.7 * c, 0.85 * c, 2.6 * c), GLASS);
  canopy.position.set(0, 1.15 * c, LEN * 0.20);
  g.add(canopy);

  // Wing: high aspect ratio, tapering, set a shade below the centreline.
  // Built in three panels so the taper is real rather than a scaled box.
  const root = new THREE.Mesh(new THREE.BoxGeometry(span * 0.30, 0.55 * c, 4.6 * c), DARK);
  root.position.set(0, -0.30 * c, LEN * 0.04);
  g.add(root);
  for (const side of [-1, 1]) {
    const mid = new THREE.Mesh(new THREE.BoxGeometry(span * 0.20, 0.45 * c, 3.6 * c), DARK);
    mid.position.set(side * span * 0.25, -0.30 * c, LEN * 0.02);
    g.add(mid);
    const outer = new THREE.Mesh(new THREE.BoxGeometry(span * 0.15, 0.34 * c, 2.5 * c), DARK);
    outer.position.set(side * span * 0.42, -0.30 * c, LEN * 0.0);
    g.add(outer);
  }

  // The tail that names her: one fin, very tall, with the dorsal fillet
  // sweeping forward off it, and a broad tailplane low on the tail cone.
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.45 * c, 4.6 * c, 3.4 * c), DARK);
  fin.position.set(0, 2.9 * c, -LEN * 0.53);
  g.add(fin);
  // The fillet: a long wedge along the spine. A tapered box turned on its side
  // reads as the triangle it is at this range.
  const fillet = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 1.7 * c, LEN * 0.42, 3), DARK);
  fillet.rotation.set(Math.PI / 2, 0, 0);
  fillet.position.set(0, 1.5 * c, -LEN * 0.30);
  g.add(fillet);
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(span * 0.38, 0.34 * c, 2.4 * c), DARK);
  tailplane.position.set(0, 0.75 * c, -LEN * 0.52);
  g.add(tailplane);
  // Tail gunner's position, under the rudder.
  const stinger = new THREE.Mesh(new THREE.BoxGeometry(0.8 * c, 0.8 * c, 2.2 * c), GLASS);
  stinger.position.set(0, 0.55 * c, -LEN * 0.62);
  g.add(stinger);

  // Dorsal turret behind the cockpit and the ball turret under the belly.
  const dorsal = new THREE.Mesh(new THREE.SphereGeometry(0.6 * c, 8, 6), DARK);
  dorsal.position.set(0, 1.35 * c, LEN * 0.12);
  g.add(dorsal);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.72 * c, 8, 6), DARK);
  ball.position.set(0, -1.15 * c, -LEN * 0.04);
  g.add(ball);
  // Waist gun blisters.
  for (const side of [-1, 1]) {
    const waist = new THREE.Mesh(new THREE.SphereGeometry(0.42 * c, 6, 5), GLASS);
    waist.position.set(side * 1.0 * c, 0.35 * c, -LEN * 0.20);
    g.add(waist);
  }

  // Four Wright Cyclones in long nacelles slung under and ahead of the wing,
  // the inboard pair further forward than the outboard.
  for (const side of [-1, 1]) {
    for (const [out, len] of [[0.155, 5.6], [0.315, 5.0]]) {
      const nac = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85 * c, 0.62 * c, len * c, 8), DARK);
      nac.rotation.x = Math.PI / 2;
      nac.position.set(side * span * out, -0.55 * c, LEN * 0.10);
      g.add(nac);
      // The cowling: fatter than the nacelle behind it, as a radial's is.
      const cowl = new THREE.Mesh(
        new THREE.CylinderGeometry(1.05 * c, 1.05 * c, 1.5 * c, 10), DARK);
      cowl.rotation.x = Math.PI / 2;
      cowl.position.set(side * span * out, -0.55 * c, LEN * 0.10 + (len * c) / 2);
      g.add(cowl);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1.85 * c, 12),
        new THREE.MeshBasicMaterial({
          color: 0x9aa6b2, transparent: true, opacity: 0.15, side: THREE.DoubleSide,
        }),
      );
      disc.position.set(side * span * out, -0.55 * c,
        LEN * 0.10 + (len * c) / 2 + 0.9 * c);
      g.add(disc);
    }
  }

  // Navigation lights, the only thing on her that is not a silhouette.
  const port = new THREE.Mesh(new THREE.SphereGeometry(0.5 * c, 6, 5), LAMP_R);
  port.position.set(-span * 0.5, -0.30 * c, 0);
  g.add(port);
  const stbd = new THREE.Mesh(new THREE.SphereGeometry(0.5 * c, 6, 5), LAMP_G);
  stbd.position.set(span * 0.5, -0.30 * c, 0);
  g.add(stbd);

  // Welded down: at the range these are seen from, four turning discs are not
  // worth thirty-odd draw calls an aeroplane.
  mergeStatic(g);
  return g;
}

const BOMB_MAX = 48;

/**
 * Waves of bombers over a target box, and the bombs they let go.
 *
 * `onImpact(x, y, z)` is called the moment a bomb reaches the ground, which is
 * where the explosion belongs — this module knows about ballistics, not fire.
 */
export class BomberRaid {
  constructor(scene, {
    onImpact,
    groundY = 0,
    // Where the ground is under a falling bomb. An island is not flat, and a
    // stick walking up the hillside has to burst on the hillside.
    groundAt = null,
    // The box they aim at, in world metres.
    target = { x0: -700, x1: 700, z0: 430, z1: 1100 },
    altitude = 430,
    speed = 132,
    gravity = 45,
    interval = 5,
    flight = 4,
    // Two flights in the air at once, each working its own stretch of the
    // waterfront: one formation crossing a five-kilometre island leaves most of
    // the frame quiet most of the time.
    flights = 2,
  } = {}) {
    this.scene = scene;
    this.onImpact = onImpact;
    this.groundY = groundY;
    this.groundAt = groundAt || (() => groundY);
    this.target = target;
    this.altitude = altitude;
    this.speed = speed;
    this.gravity = gravity;
    this.interval = interval;
    this.flightSize = flight;

    this.aircraft = [];
    this.bombs = [];
    this.time = 0;

    for (let f = 0; f < flights; f++) {
      for (let i = 0; i < flight; i++) {
        const g = buildBomber();
        g.visible = false;
        scene.add(g);
        this.aircraft.push({
          group: g, flight: f, seat: i, alive: false, dir: 1,
          stick: 0, nextDrop: 0, gap: 0, runX0: 0, runX1: 0,
        });
      }
    }
    this.flights = flights;
    this.waveDue = [1.5, 6.5].slice(0, flights);
    // A point somebody wants hit. The next flight to go takes it, lays its run
    // over it, and its leader holds his stick until the sight is on.
    this.aim = null;
    // Each flight keeps its own height band and its own stretch of the
    // waterfront, so two formations in the air at once can never arrive in the
    // same piece of sky however their runs are drawn.
    this.lift = 130;

    // Bombs, pooled: a dart with a streak behind it so it can be followed down.
    const bombGeo = new THREE.CylinderGeometry(0.9, 0.45, 4.6, 6);
    bombGeo.rotateX(Math.PI / 2);
    const streakGeo = new THREE.PlaneGeometry(1.6, 34);
    for (let i = 0; i < BOMB_MAX; i++) {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(bombGeo, DARK));
      const streak = new THREE.Mesh(streakGeo, new THREE.MeshBasicMaterial({
        color: 0xc8d2dc, transparent: true, opacity: 0.22, depthWrite: false,
        side: THREE.DoubleSide,
      }));
      streak.position.y = 17;
      group.add(streak);
      group.visible = false;
      scene.add(group);
      this.bombs.push({ group, live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    }
  }

  /**
   * Where a seat sits in the formation, in metres: back along the track, out to
   * one side, and up or down. A combat box is flown to fixed spacings, and
   * fixing them here is also what guarantees no two aircraft ever occupy the
   * same piece of air — every seat has its own station and keeps it.
   */
  station(seat) {
    // Leader, two wingmen echeloned back either side, and the slot man tucked
    // in behind and below: a four-plane element, flown as one.
    const box = [
      { back: 0, side: 0, up: 0 },
      { back: 1, side: -1, up: -0.35 },
      { back: 1, side: 1, up: 0.35 },
      { back: 2, side: 0, up: -0.75 },
      { back: 2, side: -2, up: 0.6 },
      { back: 3, side: 1.5, up: -1.1 },
    ];
    const p = box[seat % box.length];
    // Two spans across and two and a half along: wider than a real box, but a
    // real box is flown by men who can see each other.
    return { back: p.back * 170, side: p.side * 155, up: p.up * 40 };
  }

  /**
   * Put a flight over a particular spot. If one is on the ground it goes at
   * once; otherwise the next to go takes the job.
   */
  strike(x, z) {
    this.aim = { x, z };
    for (let f = 0; f < this.flights; f++) {
      if (this.aircraft.some((a) => a.alive && a.flight === f)) continue;
      this.waveDue[f] = 0;
      break;
    }
  }

  /** Send one flight across its own stretch of the waterfront. */
  launch(flightId) {
    const t = this.target;
    const dir = Math.random() < 0.5 ? 1 : -1;

    // Its own lane, out of its own third of the target box, and its own height
    // band. Two flights can be over the island at once without ever crossing.
    const slice = (t.z1 - t.z0) / this.flights;
    const height = this.altitude + flightId * this.lift;
    const aim = this.aim;
    this.aim = null;
    const lane = aim ? aim.z : t.z0 + slice * (flightId + 0.15 + Math.random() * 0.7);

    // Each flight works its own run rather than the whole island, so a pass is
    // half a minute rather than a minute and a half.
    const span = 1500 + Math.random() * 900;
    let runX0 = t.x0 + Math.random() * (t.x1 - t.x0 - span);
    if (aim) runX0 = aim.x - span * (dir > 0 ? 0.72 : 0.28);
    const runX1 = runX0 + span;
    const startX = dir > 0 ? runX0 - 600 : runX1 + 600;

    // Where the leader has to let go for one to arrive on the spot: a bomb
    // keeps the aeroplane's speed all the way down, so the release is a full
    // fall's run short of the target.
    let releaseX = null;
    if (aim) {
      const fall = Math.sqrt((2 * Math.max(10, height - this.groundY)) / this.gravity);
      releaseX = aim.x - dir * this.speed * fall;
    }

    for (const a of this.aircraft) {
      if (a.flight !== flightId) continue;
      const st = this.station(a.seat);
      a.alive = true;
      a.group.visible = true;
      a.dir = dir;
      a.stick = 5;
      a.nextDrop = 0;
      a.gap = 0;
      a.runX0 = runX0;
      a.runX1 = runX1;
      // The leader carries the aimed one; the rest of the box works normally.
      a.aimX = (releaseX !== null && a.seat === 0) ? releaseX : null;
      a.group.position.set(
        startX - dir * st.back,
        height + st.up,
        lane + st.side,
      );
      // Nose along the track: the model is built pointing at +Z.
      a.group.rotation.set(0, dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
    }
  }

  drop(a, spread = 6) {
    const b = this.bombs.find((x) => !x.live);
    if (!b) return;
    const p = a.group.position;
    b.live = true;
    b.group.visible = true;
    b.x = p.x; b.y = p.y - 4; b.z = p.z;
    // It leaves with the aeroplane's speed and keeps it all the way down.
    b.vx = a.dir * this.speed;
    b.vy = 0;
    b.vz = (Math.random() - 0.5) * spread;
    b.group.position.set(b.x, b.y, b.z);
  }

  update(dt) {
    this.time += dt;

    // Each flight goes again as soon as the last one is clear and its interval
    // has run, so there is nearly always something over the island.
    for (let f = 0; f < this.flights; f++) {
      this.waveDue[f] -= dt;
      if (this.waveDue[f] > 0) continue;
      if (this.aircraft.some((a) => a.alive && a.flight === f)) continue;
      this.launch(f);
      this.waveDue[f] = this.interval + Math.random() * 4;
    }

    for (const a of this.aircraft) {
      if (!a.alive) continue;
      const p = a.group.position;
      p.x += a.dir * this.speed * dt;

      // Over the target she works in sticks: five away one after another, a
      // pause while the bay is reloaded, then another stick — so bombs are
      // coming down for as long as she is over the island, not once a pass.
      // The aimed release, if this one is carrying it: the moment the sight
      // comes on, whatever else the bomb bay is doing.
      if (a.aimX !== null && a.aimX !== undefined
          && ((a.dir > 0 && p.x >= a.aimX) || (a.dir < 0 && p.x <= a.aimX))) {
        a.aimX = null;
        this.drop(a, 0);
      }

      const over = p.x > a.runX0 && p.x < a.runX1;
      if (over) {
        if (a.gap > 0) {
          a.gap -= dt;
          if (a.gap <= 0) a.stick = 4 + Math.floor(Math.random() * 3);
        } else {
          a.nextDrop -= dt;
          if (a.nextDrop <= 0) {
            this.drop(a);
            a.nextDrop = 0.32 + Math.random() * 0.2;
            if (--a.stick <= 0) a.gap = 2.4 + Math.random() * 1.6;
          }
        }
      }

      // Clear of the island, she is done.
      if ((a.dir > 0 && p.x > a.runX1 + 700) || (a.dir < 0 && p.x < a.runX0 - 700)) {
        a.alive = false;
        a.group.visible = false;
      }
    }

    for (const b of this.bombs) {
      if (!b.live) continue;
      b.vy -= this.gravity * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.group.position.set(b.x, b.y, b.z);
      // Nose into the airflow, so she tips over as the fall steepens.
      b.group.rotation.set(Math.atan2(-b.vy, Math.abs(b.vx)) - Math.PI / 2, 0, 0);
      const ground = this.groundAt(b.x, b.z);
      if (b.y <= ground) {
        b.live = false;
        b.group.visible = false;
        this.onImpact?.(b.x, ground, b.z);
      }
    }
  }
}
