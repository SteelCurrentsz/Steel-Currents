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

/** A four-engined heavy, nose toward +Z. Span is drawn a little over life size
 *  so she still reads as an aeroplane at the range the title screen puts her. */
export function buildBomber(span = 72) {
  const g = new THREE.Group();
  const c = span / 44;   // everything else is drawn in proportion to the span

  // Fuselage: a long faceted tube, tapering to the tail.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.6 * c, 2.4 * c, 34 * c, 8), DARK);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2.3 * c, 10, 8), DARK);
  nose.position.z = 16 * c;
  nose.scale.set(0.9, 0.8, 1.5);
  g.add(nose);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(3.0 * c, 1.7 * c, 6 * c), GLASS);
  canopy.position.set(0, 1.9 * c, 9 * c);
  g.add(canopy);

  // Wing: swept a touch, thinning outboard.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(span, 1.0 * c, 7.5 * c), DARK);
  wing.position.set(0, 0.2 * c, 1.5 * c);
  g.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(span * 0.16, 0.7 * c, 4.4 * c), DARK);
    tip.position.set(side * span * 0.56, 0.2 * c, 0.2 * c);
    g.add(tip);
  }

  // Tailplane and twin fins, which is most of what identifies her head-on.
  const tail = new THREE.Mesh(new THREE.BoxGeometry(span * 0.42, 0.8 * c, 5 * c), DARK);
  tail.position.set(0, 0.6 * c, -14 * c);
  g.add(tail);
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.8 * c, 6.5 * c, 5 * c), DARK);
    fin.position.set(side * span * 0.19, 3.6 * c, -14 * c);
    g.add(fin);
  }

  // Four nacelles, each with a disc where the propeller is.
  const props = [];
  for (const side of [-1, 1]) {
    for (const out of [0.20, 0.38]) {
      const nac = new THREE.Mesh(new THREE.CylinderGeometry(1.7 * c, 1.3 * c, 10 * c, 8), DARK);
      nac.rotation.x = Math.PI / 2;
      nac.position.set(side * span * out, -0.3 * c, 3.5 * c);
      g.add(nac);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(3.4 * c, 12),
        new THREE.MeshBasicMaterial({
          color: 0x9aa6b2, transparent: true, opacity: 0.16, side: THREE.DoubleSide,
        }),
      );
      disc.position.set(side * span * out, -0.3 * c, 9 * c);
      g.add(disc);
      props.push(disc);
    }
  }

  // Navigation lights, the only thing on her that is not a silhouette.
  const port = new THREE.Mesh(new THREE.SphereGeometry(0.7 * c, 6, 5), LAMP_R);
  port.position.set(-span * 0.5, 0.4 * c, 0);
  g.add(port);
  const stbd = new THREE.Mesh(new THREE.SphereGeometry(0.7 * c, 6, 5), LAMP_G);
  stbd.position.set(span * 0.5, 0.4 * c, 0);
  g.add(stbd);

  // Welded down: at the range these are seen from, four turning discs are not
  // worth twenty-odd draw calls an aeroplane.
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

  /** Send one flight across a stretch of the waterfront. */
  launch(flightId) {
    const t = this.target;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const lane = t.z0 + Math.random() * (t.z1 - t.z0);
    // Each flight works its own run rather than the whole island, so a pass is
    // half a minute rather than a minute and a half.
    const span = 1500 + Math.random() * 900;
    const runX0 = t.x0 + Math.random() * (t.x1 - t.x0 - span);
    const runX1 = runX0 + span;
    const startX = dir > 0 ? runX0 - 600 : runX1 + 600;

    for (const a of this.aircraft) {
      if (a.flight !== flightId) continue;
      const i = a.seat;
      // A shallow vic: the leader out front, the wingmen back and to each side.
      const rank = i === 0 ? 0 : 1;
      const wing = i === 0 ? 0 : (i % 2 ? -1 : 1);
      a.alive = true;
      a.group.visible = true;
      a.dir = dir;
      a.stick = 5;
      a.nextDrop = 0;
      a.gap = 0;
      a.runX0 = runX0;
      a.runX1 = runX1;
      a.group.position.set(
        startX - dir * rank * 150 + wing * 20,
        this.altitude + (Math.random() - 0.5) * 50,
        lane + wing * 170 + (Math.random() - 0.5) * 70,
      );
      // Nose along the track: the model is built pointing at +Z.
      a.group.rotation.set(0, dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
    }
  }

  drop(a) {
    const b = this.bombs.find((x) => !x.live);
    if (!b) return;
    const p = a.group.position;
    b.live = true;
    b.group.visible = true;
    b.x = p.x; b.y = p.y - 4; b.z = p.z;
    // It leaves with the aeroplane's speed and keeps it all the way down.
    b.vx = a.dir * this.speed;
    b.vy = 0;
    b.vz = (Math.random() - 0.5) * 6;
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
