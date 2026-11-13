// The title screen's battle: an American carrier strike on the Yamato and the
// Musashi, played out as a film rather than fought.
//
// Nothing here is simulated. Every ship sails a track laid down before the
// first frame (Track), every aeroplane flies a path through points in time
// (Flight), and every bomb, torpedo and burst of flak is set off by the
// script at the moment it is due -- so the battle is the same battle every
// time round, the camera (see menu.js) always finds what it was sent to look
// at, and a loop of it costs no more than the effects it draws. What is drawn
// is the game's own: the two Yamatos and the Essexes off their models, the
// Hellcats, Dauntlesses and Avengers off theirs, and the splashes, flak,
// bombs, fire and smoke a battle draws (effects.js, ordnance.js, flames.js).
//
// World frame as everywhere else: +Y up, a heading of 0 runs up +Z, and an
// object turned to heading h has its bow along (sin h, 0, cos h).

import * as THREE from '../../../vendor/three.module.js';
import { buildShip } from './ships.js';
import { muzzleWorld } from './mounts.js';
import { Wake } from './wakefield.js';
import { hellcatModel } from './hellcatModel.js';
import { dauntlessModel } from './dauntlessModel.js';
import { avengerModel } from './avengerModel.js';

/** How long the battle runs before it goes round again, seconds. */
export const LOOP = 284;

const G = 9.81;
const KN = 0.5144;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const smooth = (k) => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };
const rnd = (a, b) => a + Math.random() * (b - a);
// A fixed sequence, so the battle's choices -- which gun fires at whom, how
// wide a stick falls -- are the same every time it plays.
let seed = 1;
const srand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const sr = (a, b) => a + srand() * (b - a);

// ------------------------------------------------------------------ ships --

/**
 * Where a ship is at every moment: integrated once from her speed and the
 * rudder orders the script gives her, and read back by time.
 *
 * `turns` are [t, rate, duration]: from t she turns at `rate` radians a
 * second, eased in and out over the first and last few seconds, for that long.
 * `speeds` are [t, knots]: rung down or up from t, taking ten seconds to come.
 */
class Track {
  constructor({ x, z, heading, knots, turns = [], speeds = [] }) {
    this.dt = 0.1;
    const n = Math.ceil((LOOP + 20) / this.dt);
    this.x = new Float64Array(n); this.z = new Float64Array(n);
    this.h = new Float64Array(n); this.r = new Float64Array(n); this.s = new Float64Array(n);
    let px = x, pz = z, ph = heading, sp = knots * KN;
    for (let i = 0; i < n; i++) {
      const t = i * this.dt;
      let rate = 0;
      for (const [t0, r, d] of turns) {
        if (t < t0 || t > t0 + d) continue;
        const ramp = Math.min(4, d / 3);
        rate += r * smooth((t - t0) / ramp) * smooth((t0 + d - t) / ramp);
      }
      let want = knots;
      for (const [t0, k] of speeds) if (t >= t0) want = k;
      sp += (want * KN - sp) * Math.min(1, this.dt / 10);
      this.x[i] = px; this.z[i] = pz; this.h[i] = ph; this.r[i] = rate; this.s[i] = sp;
      ph += rate * this.dt;
      px += Math.sin(ph) * sp * this.dt;
      pz += Math.cos(ph) * sp * this.dt;
    }
  }

  /** Her pose at time t: { x, z, h, rate, speed }. */
  at(t, out = {}) {
    const f = Math.max(0, Math.min(this.x.length - 1.001, t / this.dt));
    const i = Math.floor(f), u = f - i;
    const L = (a) => a[i] + (a[i + 1] - a[i]) * u;
    out.x = L(this.x); out.z = L(this.z); out.h = L(this.h); out.rate = L(this.r); out.speed = L(this.s);
    return out;
  }

  /** A point in her own frame -- +x to port, +z ahead -- in the world, at time t. */
  local(t, lx, ly, lz, out = new THREE.Vector3()) {
    const p = this.at(t, Track._p);
    const c = Math.cos(p.h), s = Math.sin(p.h);
    return out.set(p.x + lx * c + lz * s, ly, p.z - lx * s + lz * c);
  }
}
Track._p = {};

/**
 * One of the ships: her model, her wake, and what has been done to her -- the
 * fires burning in her, how far she lists, how far down she is.
 */
class Hull {
  constructor(id, track, ocean, wakes) {
    this.id = id;
    this.track = track;
    this.ocean = ocean;
    const built = buildShip(id);
    this.built = built;
    this.group = built.group;
    this.length = built.length;
    this.beam = built.beam;
    this.group.rotation.order = 'YXZ';
    this.wake = new Wake({ length: this.length, beam: this.beam });
    wakes?.add(this.wake);
    this.wakes = wakes;
    this.fires = [];
    this.list = 0;
    this.listTo = 0;
    this.trim = 0;
    this.trimTo = 0;
    this.pose = {};
    // Every gun she has that can be laid on an aeroplane, and when each fires next.
    this.aa = [...(built.secMounts || []), ...(built.aaMounts || [])].map((m) => ({
      m, cal: m.userData.cal || 25, next: srand() * 2,
    }));
    this.turrets = built.turrets || [];
  }

  reset() {
    this.fires.length = 0;
    this.list = this.listTo = 0;
    this.trim = this.trimTo = 0;
    for (const t of this.turrets) t.rotation.y = 0;
  }

  /** A fire burning at a place in her, her own frame. */
  burn(lx, ly, lz, heat, span = 12) {
    this.fires.push({ lx, ly, lz, heat, span, key: `${this.id}:${this.fires.length}` });
  }

  update(t, dt, flames, effects) {
    const p = this.track.at(t, this.pose);
    const g = this.group;
    this.list += (this.listTo - this.list) * Math.min(1, dt / 12);
    this.trim += (this.trimTo - this.trim) * Math.min(1, dt / 12);
    const att = this.ocean.attitude(p.x, p.z, p.h, this.length, this.beam);
    g.position.set(p.x, att.heave * 0.6 - this.trim * 0.2, p.z);
    g.rotation.set(att.pitch * 0.6 + this.trim * 0.01, p.h, att.roll * 0.5 + this.list - p.rate * 2.2);
    g.updateMatrixWorld(true);
    this.wake.update(dt, p.x, p.z, p.h, p.speed);
    for (const f of this.fires) {
      _v.set(f.lx, f.ly, f.lz).applyMatrix4(g.matrixWorld);
      flames.at(f.key, _v.x, _v.y, _v.z, f.heat, f.span);
    }
  }

  /** A point of her own frame, where it is now. */
  world(lx, ly, lz, out = new THREE.Vector3()) {
    return out.set(lx, ly, lz).applyMatrix4(this.group.matrixWorld);
  }

  dispose() {
    this.wakes?.remove(this.wake);
    this.wake.dispose();
  }
}

// --------------------------------------------------------------- aircraft --

const MODELS = { hellcat: hellcatModel, dauntless: dauntlessModel, avenger: avengerModel };

/**
 * An aeroplane's path: points in time, joined so her speed and her heading
 * both run on smoothly through every one of them (a cubic Hermite through
 * each point, its tangents taken off its neighbours by time -- not by index,
 * or a short leg after a long one would kick).
 */
class Path {
  constructor(pts) {
    this.pts = pts.slice().sort((a, b) => a.t - b.t);
    const P = this.pts;
    this.m = P.map((p, i) => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      const d = Math.max(1e-3, b.t - a.t);
      return new THREE.Vector3().subVectors(b.p, a.p).divideScalar(d);
    });
  }

  get t0() { return this.pts[0].t; }
  get t1() { return this.pts[this.pts.length - 1].t; }

  at(t, out = new THREE.Vector3(), vel = null) {
    const P = this.pts;
    if (t <= P[0].t) { out.copy(P[0].p); if (vel) vel.copy(this.m[0]); return out; }
    if (t >= P[P.length - 1].t) { out.copy(P[P.length - 1].p); if (vel) vel.copy(this.m[P.length - 1]); return out; }
    let i = 0;
    while (P[i + 1].t < t) i++;
    const a = P[i], b = P[i + 1], d = b.t - a.t;
    const u = (t - a.t) / d, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const ma = this.m[i], mb = this.m[i + 1];
    out.set(
      h00 * a.p.x + h10 * d * ma.x + h01 * b.p.x + h11 * d * mb.x,
      h00 * a.p.y + h10 * d * ma.y + h01 * b.p.y + h11 * d * mb.y,
      h00 * a.p.z + h10 * d * ma.z + h01 * b.p.z + h11 * d * mb.z,
    );
    if (vel) {
      const d00 = (6 * u2 - 6 * u) / d, d10 = 3 * u2 - 4 * u + 1, d01 = (-6 * u2 + 6 * u) / d, d11 = 3 * u2 - 2 * u;
      vel.set(
        d00 * a.p.x + d10 * ma.x + d01 * b.p.x + d11 * mb.x,
        d00 * a.p.y + d10 * ma.y + d01 * b.p.y + d11 * mb.y,
        d00 * a.p.z + d10 * ma.z + d01 * b.p.z + d11 * mb.z,
      );
    }
    return out;
  }
}

/**
 * One aeroplane. Laid along her path, banked into her turns by what the turn
 * asks of her wings (her lift has to hold her up and pull her round, so it
 * leans the way she is being pulled), her airscrew turning. Shot down, she
 * comes off her path and falls burning into the sea.
 */
class Flight {
  constructor(kind, pts, { kill = null, events = [] } = {}) {
    this.kind = kind;
    this.path = new Path(pts);
    this.kill = kill;
    this.events = events.sort((a, b) => a.t - b.t);
    this.model = null;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.acc = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.live = false;
    this.down = null;
  }

  make(scene) {
    if (this.model) return;
    this.model = MODELS[this.kind]();
    this.model.traverse((o) => { if (o.isMesh) o.frustumCulled = true; });
    this.model.userData.gear?.(1);
    this.model.visible = false;
    scene.add(this.model);
  }

  reset() {
    this.down = null;
    this.next = 0;
    this.live = false;
    this.quat.identity();
    if (this.model) {
      this.model.visible = false;
      this.model.rotation.set(0, 0, 0);
      this.model.userData.bay?.(0);
      if (this.model.userData.store) this.model.userData.store.visible = true;
      for (const s of this.model.userData.wingStores || []) s.visible = true;
    }
  }

  /** Where she is pointing: forward along her path, her wings level to what her lift wants. */
  orient(dt) {
    const fwd = _v.copy(this.vel);
    if (fwd.lengthSq() < 1) return;
    fwd.normalize();
    // Her lift: what holds her up and what turns her.
    const up = _w.copy(this.acc).add(new THREE.Vector3(0, G, 0));
    up.addScaledVector(fwd, -up.dot(fwd));
    if (up.lengthSq() < 1e-4) up.set(0, 1, 0);
    up.normalize();
    const side = new THREE.Vector3().crossVectors(up, fwd).normalize();
    up.crossVectors(fwd, side);
    _m.makeBasis(side, up, fwd);
    _q.setFromRotationMatrix(_m);
    // Eased onto it, so a sharp corner in the path is a roll, not a snap.
    this.quat.slerp(_q, this.quat.lengthSq() ? Math.min(1, dt * 4) : 1);
  }
}

// --------------------------------------------------------------- torpedoes --

/**
 * The tracks of torpedoes running: a fish is under the water and all that
 * shows of it is the line of bubbles from its exhaust, a pale streak a couple
 * of metres wide, freshest at the head and fading out behind. One ribbon of
 * quads per fish, laid on the sea.
 */
class TorpTracks {
  constructor(scene, ocean, max = 16, pts = 48) {
    this.ocean = ocean;
    this.max = max;
    this.pts = pts;
    this.n = max * pts;
    const pos = new Float32Array(this.n * 2 * 3), alpha = new Float32Array(this.n * 2);
    const idx = [];
    for (let k = 0; k < max; k++) for (let i = 0; i < pts - 1; i++) {
      const a = (k * pts + i) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      vertexShader: `attribute float alpha; varying float vA;
        #include <fog_pars_vertex>
        void main() { vA = alpha; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `varying float vA;
        #include <fog_pars_fragment>
        void main() { gl_FragColor = vec4(0.9, 0.95, 0.97, vA);
        #include <fog_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  /** Lay every fish's track this frame: `list` of { trail: [[x, z, t]...] }. */
  update(list, now) {
    const P = this.geo.attributes.position.array, A = this.geo.attributes.alpha.array;
    A.fill(0);
    list.slice(0, this.max).forEach((tp, k) => {
      const tr = tp.trail;
      for (let i = 0; i < this.pts; i++) {
        const j = tr.length - 1 - i;
        const base = (k * this.pts + i) * 2;
        if (j < 0) { A[base] = A[base + 1] = 0; continue; }
        const [x, z, t] = tr[j];
        const [x2, z2] = tr[Math.max(0, j - 1)];
        let dx = x - x2, dz = z - z2;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        const age = now - t;
        const w = 1.6 + Math.min(3.4, age * 0.3);
        const y = (this.ocean.heightAt ? this.ocean.heightAt(x, z) : 0) + 0.35;
        P[base * 3] = x - dz * w; P[base * 3 + 1] = y; P[base * 3 + 2] = z + dx * w;
        P[base * 3 + 3] = x + dz * w; P[base * 3 + 4] = y; P[base * 3 + 5] = z - dx * w;
        const a = Math.max(0, 0.9 * (1 - age / 26)) * (tp.gone ? Math.max(0, 1 - (now - tp.gone) / 6) : 1);
        A[base] = A[base + 1] = a;
      }
    });
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ script --

/** A formation's slots, metres right, up and astern of its leader, in his frame. */
const VIC = [[0, 0, 0], [-28, -4, -26], [28, -4, -26], [-56, -8, -52], [56, -8, -52], [0, -10, -60]];

export class Strike {
  /**
   * `scene` the title scene's, `ocean` its sea (ships ride its waves), `wakes`
   * the map their wakes are drawn into; `fx` is { effects, flak, bombs,
   * flames }, the battle's own effects systems.
   */
  constructor(scene, ocean, wakes, fx) {
    this.scene = scene;
    this.ocean = ocean;
    this.wakes = wakes;
    this.fx = fx;
    this.t = 0;
    this.fired = new Set();
    seed = 1;

    // The Japanese force: the Yamato leading, her sister on her port quarter,
    // steaming north at twenty-five knots and turning to comb the attacks.
    this.yamatoTrack = new Track({
      x: 0, z: 0, heading: 0, knots: 25,
      turns: [[66, -0.022, 26], [150, 0.026, 30], [195, -0.03, 30], [238, 0.018, 24]],
    });
    this.musashiTrack = new Track({
      x: 1300, z: -1500, heading: 0, knots: 25,
      turns: [[70, 0.02, 24], [124, -0.016, 26], [176, 0.012, 30]],
      // She is hit, and slows.
      speeds: [[106, 20], [118, 16], [205, 13]],
    });
    // And the carriers, a long way east: two Essexes into the wind, launching.
    this.cvTrack = new Track({ x: 26000, z: -4000, heading: Math.PI * 0.5, knots: 28 });
    this.cv2Track = new Track({ x: 25300, z: -2600, heading: Math.PI * 0.5, knots: 28 });

    this.yamato = new Hull('yamato', this.yamatoTrack, ocean, wakes);
    this.musashi = new Hull('musashi', this.musashiTrack, ocean, wakes);
    this.essex = new Hull('essex', this.cvTrack, ocean, wakes);
    this.essex2 = new Hull('essex', this.cv2Track, ocean, wakes);
    this.essex2.id = 'essex2';
    this.ships = [this.yamato, this.musashi, this.essex, this.essex2];
    for (const s of this.ships) scene.add(s.group);
    // The flight deck: how high it stands, and how far it runs.
    this.deckY = this.essex.built.flightDeckY || this.essex.group.userData.flightDeckY || 17.5;

    this.tracks = new TorpTracks(scene, ocean);
    this.flights = [];
    // The aeroplanes the camera is sent after, by part.
    this.cast = {};
    this.torps = [];
    this.events = [];
    this.writeScript();
    for (const f of this.flights) f.make(scene);
    this.reset();
  }

  // --- the script -------------------------------------------------------

  writeScript() {
    const Y = this.yamatoTrack, M = this.musashiTrack;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const at = (t, p) => ({ t, p });

    // ---- the launch: eight off each deck, a few seconds apart.
    const launch = (track, t0, kind, i) => {
      const deck = this.deckY + 2.6;
      const p = [];
      // Spotted aft, run up the deck, off the bow and climbing away to
      // starboard to form up.
      p.push(at(t0 - 2, track.local(t0 - 2, 0, deck, -90)));
      p.push(at(t0, track.local(t0, 0, deck, -88)));
      p.push(at(t0 + 4.2, track.local(t0 + 4.2, 0, deck + 0.6, 40)));
      p.push(at(t0 + 6.5, track.local(t0 + 6.5, -4, deck + 14, 160)));
      p.push(at(t0 + 12, track.local(t0 + 12, -60, deck + 90, 520)));
      p.push(at(t0 + 22, track.local(t0 + 22, -500, 420, 1300)));
      p.push(at(t0 + 40, track.local(t0 + 40, -1800 - i * 60, 1100, 2200)));
      return new Flight(kind, p, { events: [{ t: t0 + 9, k: 'gearUp' }] });
    };
    const order = ['hellcat', 'hellcat', 'dauntless', 'dauntless', 'avenger', 'avenger', 'dauntless', 'hellcat'];
    order.forEach((k, i) => this.flights.push(launch(this.cvTrack, 1.5 + i * 3.1, k, i)));
    this.cast.launch = this.flights[0];
    order.forEach((k, i) => this.flights.push(launch(this.cv2Track, 2.6 + i * 3.4, k, i)));

    // ---- the first wave, on the Musashi.
    // The formation comes in from the east at ten thousand feet, over the
    // cloud, and breaks up over the Japanese force.
    const leadA = (t) => {
      const k = (t - 20) / 50;
      return V(14000 - 10500 * k, 2700 - 250 * k, 900 + 400 * k);
    };
    const formation = (lead, t0, t1, slot, ox = 0, oz = 0) => {
      const out = [];
      for (let t = t0; t <= t1; t += 10) {
        const p = lead(t);
        const s = VIC[slot % VIC.length];
        // Flying west: her right is +z, astern is +x.
        out.push(at(t, V(p.x - s[2] + ox, p.y + s[1], p.z + s[0] + oz)));
      }
      return out;
    };

    // Four Avengers in an anvil: two from either bow.
    const torpRun = (track, t0, side, lz, hit, slot) => {
      const L = (dt, lx, ly, z) => at(t0 + dt, track.local(t0 + dt, side * lx, ly, z));
      return [
        L(-26, 4200, 900, lz + 1500),
        L(-16, 2400, 160, lz + 700),
        L(-8, 1150, 45, lz + 260),
        L(0, 640, 32, lz + 80),
        L(4, 260, 40, lz + 10),
        L(7.5, -60, 70, lz - 60),
        L(12, -700, 120, lz - 260),
        L(26, -2800, 650, lz - 1400),
      ].concat([at(t0 + 60, V(16000, 2400, 3000 + slot * 120))]);
    };
    const anvil = [[1, 30, true], [1, -20, true], [-1, 40, false], [-1, -10, true]];
    anvil.forEach(([side, lz, hit], i) => {
      const t0 = 78 + i * 2;
      const pts = [...formation(leadA, 20, 50, i, 0, -140), ...torpRun(M, t0, side, lz, hit, i)];
      this.flights.push(new Flight('avenger', pts, { events: [{ t: t0, k: 'torp', track: M, ship: 'musashi', side, lz, hit }] }));
      if (i === 0) this.cast.torpA = this.flights[this.flights.length - 1];
    });

    // Six Dauntlesses, rolling in from astern one after another.
    const dive = (track, t0, lx, lz, hit, slot) => {
      const L = (dt, x, y, z) => at(t0 + dt, track.local(t0 + dt, x, y, z));
      return [
        L(-34, 900 + slot * 40, 2900, -5200),
        L(-20, 300, 2800, -1500),
        L(-15, 120, 2700, -1050),
        L(-7, 40, 1500, -420),
        L(0, lx * 0.4, 600, lz - 150),
        L(2.2, lx * 0.2, 330, lz - 30),
        L(5, 0, 160, lz + 280),
        L(14, -600, 220, lz + 1700),
        L(30, -2500, 900, lz + 4200),
      ].concat([at(t0 + 70, V(16000, 2600, 3400 + slot * 100))]);
    };
    const divesA = [[118, 2, 10, true], [120.5, -4, -40, true], [123, 8, 70, false], [125.5, 0, -70, true], [128, 6, 30, false]];
    divesA.forEach(([t0, lx, lz, hit], i) => {
      const pts = [...formation(leadA, 20, 60, i + 1, -400, 300), ...dive(M, t0, lx, lz, hit, i)];
      this.flights.push(new Flight('dauntless', pts, { events: [{ t: t0, k: 'bomb', track: M, ship: 'musashi', lx, lz, hit }] }));
      if (i === 0) this.cast.diveA = this.flights[this.flights.length - 1];
      if (i === 2) this.cast.escortA = this.flights[this.flights.length - 1];
    });

    // Hellcats, ahead of the bombers, strafing her gun crews.
    const strafe = (track, t0, side, lz, slot) => {
      const L = (dt, x, y, z) => at(t0 + dt, track.local(t0 + dt, x, y, z));
      return [
        L(-22, side * 3000, 2200, lz + 2600),
        L(-10, side * 1300, 700, lz + 1100),
        L(-3, side * 420, 140, lz + 360),
        L(0, side * 120, 60, lz + 90),
        L(2, -side * 120, 55, lz - 120),
        L(8, -side * 1000, 260, lz - 700),
        L(24, -side * 3200, 1500, lz - 1800),
      ].concat([at(t0 + 60, V(16000, 2800, 2600 + slot * 150))]);
    };
    [[134, 1, 20], [136, -1, -30]].forEach(([t0, side, lz], i) => {
      const pts = [...formation(leadA, 20, 50, i + 3, 300, 200), ...strafe(M, t0, side, lz, i)];
      this.flights.push(new Flight('hellcat', pts, { events: [{ t: t0 - 3, k: 'guns', dur: 3.2 }] }));
    });
    // One of them does not come back off his run.
    {
      const t0 = 139;
      const pts = [...formation(leadA, 20, 50, 5, 500, 260), ...strafe(M, t0, 1, 60, 3)];
      this.flights.push(new Flight('hellcat', pts, { kill: { t: t0 + 1.2 }, events: [{ t: t0 - 3, k: 'guns', dur: 3 }] }));
    }

    // ---- the second wave, on the Yamato.
    const leadB = (t) => {
      const k = (t - 110) / 50;
      return V(15000 - 10500 * k, 2800 - 200 * k, 3400 + 300 * k);
    };
    [[152, 1, 40], [155, -1, -10], [158, 1, -60]].forEach(([t0, side, lz], i) => {
      const pts = [...formation(leadB, 110, 130, i, 200, 0), ...strafe(Y, t0, side, lz, i)];
      this.flights.push(new Flight('hellcat', pts, { events: [{ t: t0 - 3, k: 'guns', dur: 3.2 }] }));
      if (i === 0) this.cast.strafeB = this.flights[this.flights.length - 1];
    });
    const divesB = [[184, 4, 40, false], [187, -2, -20, true], [190, 6, -60, false], [193, -6, 70, false]];
    divesB.forEach(([t0, lx, lz, hit], i) => {
      const pts = [...formation(leadB, 110, 150, i + 1, -300, 400), ...dive(Y, t0, lx, lz, hit, i)];
      this.flights.push(new Flight('dauntless', pts, { events: [{ t: t0, k: 'bomb', track: Y, ship: 'yamato', lx, lz, hit }] }));
      if (i === 1) this.cast.diveB = this.flights[this.flights.length - 1];
    });
    // The Avengers go for her, and she combs their tracks: every fish misses.
    const anvilB = [[1, 140], [1, 60], [-1, 120], [-1, 30]];
    anvilB.forEach(([side, lz], i) => {
      const t0 = 198 + i * 1.6;
      const kill = i === 2 ? { t: 228 } : null;
      const pts = [...formation(leadB, 110, 150, i + 2, 0, -300), ...torpRun(Y, t0, side, lz, false, i)];
      this.flights.push(new Flight('avenger', pts, { kill, events: [{ t: t0, k: 'torp', track: Y, ship: 'yamato', side, lz, hit: false }] }));
    });
    // And one of the Avengers off the first wave, holed, goes down astern of her.
    {
      const pts = [at(214, Y.local(214, 3600, 700, -2600)), at(222, Y.local(222, 1500, 320, -900)),
        at(228, Y.local(228, 600, 220, -250)), at(236, Y.local(236, -800, 200, 600))];
      this.flights.push(new Flight('avenger', pts, { kill: { t: 226.5 } }));
      this.cast.downed = this.flights[this.flights.length - 1];
    }

    // ---- what the ships do back.
    // The Yamato's main battery, firing Type 3 shell into the formation as it
    // comes in: two salvoes, the bursts a few seconds after each.
    // Laid on the dive bombers, where they will be when the shell gets there.
    const on = (f) => (t) => f.path.at(t, new THREE.Vector3());
    this.events.push({ t: 53, k: 'salvo', ship: 'yamato', turrets: [0, 1], target: on(this.cast.diveA) });
    this.events.push({ t: 58, k: 'salvo', ship: 'yamato', turrets: [0, 1, 2], target: on(this.cast.diveA) });
    this.events.push({ t: 61, k: 'salvo', ship: 'musashi', turrets: [0, 1], target: on(this.cast.diveA) });
    this.events.push({ t: 64.5, k: 'salvo', ship: 'yamato', turrets: [0, 1], target: on(this.cast.diveA) });
    this.events.push({ t: 142, k: 'salvo', ship: 'yamato', turrets: [0, 1], target: on(this.cast.diveB) });
    this.events.sort((a, b) => a.t - b.t);
    this.leadA = leadA;
    this.leadB = leadB;
  }

  reset() {
    seed = 7;
    this.t = 0;
    for (const s of this.ships) s.reset();
    for (const f of this.flights) f.reset();
    this.torps.length = 0;
    this.ev = 0;
  }

  // --- what happens ------------------------------------------------------

  ship(id) { return id === 'yamato' ? this.yamato : this.musashi; }

  /** A torpedo off an Avenger's bay: it runs at the ship and hits her or passes. */
  dropTorpedo(f, e) {
    const { effects } = this.fx;
    const p = f.pos.clone();
    const SPEED = 24;
    // Where she will be when it gets there: a few rounds of guessing do it.
    const aimZ = e.lz + (e.hit ? 0 : (e.lz > 0 ? 95 : -95) + 40 * e.side);
    let tHit = this.t + 20;
    const tgt = new THREE.Vector3();
    for (let k = 0; k < 4; k++) {
      e.track.local(tHit, e.side * 17, 0, aimZ, tgt);
      tHit = this.t + 1.2 + Math.hypot(tgt.x - p.x, tgt.z - p.z) / SPEED;
    }
    const dir = new THREE.Vector3(tgt.x - p.x, 0, tgt.z - p.z).normalize();
    // The fish goes in nose first: a short white burst and it is running.
    effects.splash(p.x + dir.x * 40, p.z + dir.z * 40, 140, { kind: 'drop' });
    this.torps.push({
      x: p.x + dir.x * 40, z: p.z + dir.z * 40, dir, t0: this.t + 1.2, tHit: e.hit ? tHit : tHit + 30, hit: e.hit,
      ship: this.ship(e.ship), side: e.side, lz: e.lz, trail: [], done: false, gone: 0,
    });
    f.model?.userData.bay?.(1);
    if (f.model?.userData.store) f.model.userData.store.visible = false;
  }

  torpedoHit(tp) {
    const { effects } = this.fx;
    const s = tp.ship;
    const hp = s.world(tp.side * (s.beam / 2 + 2), 0, tp.lz, new THREE.Vector3());
    effects.splash(hp.x, hp.z, 620, { kind: 'torp' });
    this.later(0.25, () => effects.splash(hp.x + rnd(-6, 6), hp.z + rnd(-6, 6), 520, { kind: 'torp', child: true }));
    effects.explosion(hp.x, 4, hp.z, 1.1);
    // She takes water on that side, and goes over towards it.
    s.listTo += -tp.side * 0.035;
    s.trimTo += tp.lz > 0 ? 1 : -0.5;
    s.burn(tp.side * (s.beam / 2 - 3), 9, tp.lz, 0.55, 10);
  }

  dropBomb(f, e) {
    const { effects, bombs } = this.fx;
    const p = f.pos, v = f.vel;
    const y1 = e.hit ? 14 : 0;
    const a = 0.5 * G, b = -v.y, c = -(p.y - y1);
    const T = (b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
    const land = e.track.local(this.t + T, e.lx + (e.hit ? 0 : sr(-1, 1) > 0 ? 34 : -34), 0, e.lz + (e.hit ? 0 : sr(-30, 30)), new THREE.Vector3());
    const s = this.ship(e.ship);
    bombs.drop(p.x, p.y, p.z, land.x, land.z, e.hit, effects, 1.6, v.length(), {
      p: p.clone(), v: v.clone(), len: 1.6, r: 0.18,
      land: (x, z) => {
        if (e.hit) {
          effects.explosion(x, 14, z, 1.6);
          effects.debris?.(x, 14, z, 14, 1);
          s.burn(e.lx, 12, e.lz, 0.8, 14);
        } else {
          effects.splash(x, z, 330, { kind: 'bomb' });
        }
      },
    });
    for (const st of f.model?.userData.wingStores || []) st.visible = false;
    if (f.model?.userData.store) f.model.userData.store.visible = false;
  }

  /** A salvo of Type 3 shell, and its bursts in among the formation. */
  salvo(e) {
    const { effects } = this.fx;
    const s = this.ship(e.ship);
    const tgt = e.target(this.t + 6);
    for (const i of e.turrets) {
      const m = s.turrets[i];
      if (!m) continue;
      for (let k = 0; k < 3; k++) {
        const mp = muzzleWorld(m, k, new THREE.Vector3());
        const aim = new THREE.Vector3().subVectors(tgt, mp).normalize();
        effects.muzzle(mp.x, mp.y, mp.z, Math.atan2(aim.x, aim.z), 460, aim);
      }
    }
    // The bursts: ahead of and about the formation, a pattern a few hundred
    // metres across, which is what the shell was for.
    for (let k = 0; k < e.turrets.length * 3; k++) {
      const d = 5.2 + k * 0.12 + srand() * 0.5;
      const along = sr(450, 950), across = sr(-240, 240), up = sr(-60, 110);
      this.later(d, () => {
        const q = e.target(this.t), q2 = e.target(this.t + 1);
        const fw = q2.clone().sub(q).setY(0).normalize();
        this.sanshiki(q.x + fw.x * along - fw.z * across, q.y + up, q.z + fw.z * along + fw.x * across);
      });
    }
  }

  /**
   * A Type 3 shell bursting: a flash, a cone of burning incendiary streamers
   * thrown forward and down out of it, and the smoke that hangs afterwards.
   */
  sanshiki(x, y, z) {
    const { effects } = this.fx;
    effects.bursts?.blast(x, y, z, { size: 70, duration: 1.4, debris: 160, light: false, plume: false, ring: false, linger: 6 });
    effects.flakBurst(x, y, z, 460);
    effects.flash(x, y, z, 4);
  }

  later(d, fn) { this.events.push({ t: this.t + d, fn, once: true }); this.events.sort((a, b) => a.t - b.t); }

  // --- every frame --------------------------------------------------------

  update(dt) {
    this.t += dt;
    const t = this.t;
    const { effects, flames } = this.fx;

    for (const s of this.ships) s.update(t, dt, flames, effects);

    // The script's own moments.
    while (this.ev < this.events.length && this.events[this.ev].t <= t) {
      const e = this.events[this.ev++];
      if (e.fn) e.fn();
      else if (e.k === 'salvo') this.salvo(e);
    }
    // Spent one-off moments come off, so the list does not grow round the loop.
    if (this.ev > 64) { this.events.splice(0, this.ev); this.ev = 0; }

    // The aircraft.
    const live = [];
    for (const f of this.flights) {
      const m = f.model;
      if (!m) continue;
      if (f.down) { this.fall(f, dt); if (!f.down.gone) live.push(f); continue; }
      const inAir = t >= f.path.t0 && t <= f.path.t1;
      m.visible = inAir;
      f.live = inAir;
      if (!inAir) continue;
      const v0 = f.vel.clone();
      f.path.at(t, f.pos, f.vel);
      f.acc.subVectors(f.vel, v0).divideScalar(Math.max(1e-3, dt));
      f.acc.clampLength(0, 60);
      f.orient(dt);
      m.position.copy(f.pos);
      m.quaternion.copy(f.quat);
      if (m.userData.prop) m.userData.prop.rotation.z += dt * 60;
      while (f.next < f.events.length && f.events[f.next].t <= t) {
        const e = f.events[f.next++];
        if (e.k === 'gearUp') { f.gearAt = t; }
        else if (e.k === 'torp') this.dropTorpedo(f, e);
        else if (e.k === 'bomb') this.dropBomb(f, e);
        else if (e.k === 'guns') f.gunsTill = t + e.dur;
      }
      if (f.gearAt !== undefined) m.userData.gear?.(1 - (t - f.gearAt) / 3);
      if (f.gunsTill && t < f.gunsTill) this.strafeBurst(f, dt);
      if (f.kill && t >= f.kill.t) this.shoot(f);
      live.push(f);
    }

    // The torpedoes, running.
    for (const tp of this.torps) {
      if (tp.done || t < tp.t0) continue;
      tp.x += tp.dir.x * 24 * dt;
      tp.z += tp.dir.z * 24 * dt;
      const last = tp.trail[tp.trail.length - 1];
      if (!last || Math.hypot(tp.x - last[0], tp.z - last[1]) > 5) tp.trail.push([tp.x, tp.z, t]);
      if (tp.trail.length > 60) tp.trail.shift();
      if (t >= tp.tHit) {
        tp.done = true;
        tp.gone = t;
        if (tp.hit) this.torpedoHit(tp);
      }
    }
    // Spent fish whose tracks have faded come off.
    for (let i = this.torps.length - 1; i >= 0; i--) if (this.torps[i].done && t - this.torps[i].gone > 7) this.torps.splice(i, 1);
    this.tracks.update(this.torps.filter((tp) => t >= tp.t0), t);

    // The guns of both ships at whatever is in reach of them.
    this.antiAircraft(this.yamato, live, dt);
    this.antiAircraft(this.musashi, live, dt);
  }

  /** A fighter's six fifties: the flicker on her wings and the sea torn up ahead of her. */
  strafeBurst(f, dt) {
    const { effects } = this.fx;
    const fwd = _v.set(0, 0, 1).applyQuaternion(f.quat);
    if (srand() < dt * 30) {
      for (const sx of [-4.2, 4.2]) {
        const w = _w.set(sx, -0.2, 1.5).applyQuaternion(f.quat).add(f.pos);
        effects.wingGun(w.x, w.y, w.z, fwd.x, fwd.y, fwd.z);
      }
    }
    // Where the rounds are going in: the sea, or her decks.
    if (srand() < dt * 18 && fwd.y < -0.05) {
      const k = -f.pos.y / fwd.y;
      const x = f.pos.x + fwd.x * k + sr(-8, 8), z = f.pos.z + fwd.z * k + sr(-8, 8);
      effects.spout(x, z, 12.7);
      for (const s of [this.yamato, this.musashi]) {
        if (Math.hypot(s.pose.x - x, s.pose.z - z) < s.length / 2) effects.strike(x, 12, z, 12.7);
      }
    }
  }

  /** Hit: she comes off her path, burning, and goes in. */
  shoot(f) {
    const { effects } = this.fx;
    f.down = { vel: f.vel.clone(), spin: sr(1.4, 2.6) * (srand() < 0.5 ? -1 : 1), t: 0, gone: false };
    effects.strike(f.pos.x, f.pos.y, f.pos.z, 127);
    effects.explosion(f.pos.x, f.pos.y, f.pos.z, 0.35, f.vel);
  }

  fall(f, dt) {
    const { effects } = this.fx;
    const d = f.down, m = f.model;
    if (d.gone) { m.visible = false; return; }
    d.t += dt;
    d.vel.y -= G * dt * 0.8;
    d.vel.multiplyScalar(1 - dt * 0.05);
    f.pos.addScaledVector(d.vel, dt);
    m.position.copy(f.pos);
    _q.setFromAxisAngle(_v.set(0, 0, 1), d.spin * dt);
    f.quat.multiply(_q);
    m.quaternion.copy(f.quat);
    // Burning, and the smoke streaming back.
    effects.air.puff(f.pos.x, f.pos.y, f.pos.z, -d.vel.x * 0.1, 1, -d.vel.z * 0.1, { life: 0.6, size: 2.2, grow: 5, burn: 0.95, tone: 0.1 });
    effects.air.puff(f.pos.x, f.pos.y, f.pos.z, -d.vel.x * 0.05, 2, -d.vel.z * 0.05, { life: 7, size: 4, grow: 14, burn: 0, tone: 0.18 });
    const sea = this.ocean.heightAt ? this.ocean.heightAt(f.pos.x, f.pos.z) : 0;
    if (f.pos.y <= sea + 1) {
      d.gone = true;
      m.visible = false;
      effects.splash(f.pos.x, f.pos.z, 300, { kind: 'bomb' });
      effects.explosion(f.pos.x, 2, f.pos.z, 0.5, d.vel);
    }
  }

  /**
   * A ship's guns at the aeroplanes in reach: each mounting laid on the
   * nearest and putting up a burst at where she will be -- the light guns
   * hosing tracer, the 12.7s and the 15.5s bursting black.
   */
  antiAircraft(s, live, dt) {
    const { effects, flak } = this.fx;
    const sp = s.group.position;
    const near = live.filter((f) => !f.down && f.pos.distanceToSquared(sp) < 4600 * 4600 && f.pos.y > 20 && f.pos.x < 12000);
    if (!near.length) return;
    for (const g of s.aa) {
      g.next -= dt;
      if (g.next > 0) continue;
      const m = g.m;
      const cal = s.built.secMounts.includes(m) ? 155 : (m.userData.muzzles && m.userData.muzzles.length === 2 ? 127 : 25);
      g.next = cal >= 127 ? sr(1.4, 2.6) : sr(0.25, 0.7);
      const mp = muzzleWorld(m, 0, new THREE.Vector3());
      let best = null, bd = Infinity;
      for (const f of near) {
        const d = f.pos.distanceToSquared(mp);
        if (d < bd) { bd = d; best = f; }
      }
      if (!best) continue;
      const range = Math.sqrt(bd);
      if (cal < 75 && range > 2600) continue;
      // Train it round onto her.
      const local = s.group.worldToLocal(_w.copy(best.pos));
      const mpos = m.position;
      const want = Math.atan2(local.x - mpos.x, local.z - mpos.z);
      m.rotation.y = want;
      // Lead her by the time of flight, and miss -- nearly every burst does.
      const tof = range / (cal < 75 ? 900 : 700);
      const spread = cal < 75 ? 30 + range * 0.03 : 60 + range * 0.05;
      flak.fire(mp.x, mp.y, mp.z,
        best.pos.x + best.vel.x * tof, best.pos.y + best.vel.y * tof, best.pos.z + best.vel.z * tof,
        cal, cal < 75 ? 9 : 6, effects, spread, 4);
      if (cal >= 127 && srand() < 0.5) effects.muzzle(mp.x, mp.y, mp.z, s.pose.h + want, cal, _v.subVectors(best.pos, mp).normalize());
    }
  }

  /** Something the camera can be sent to look at, by name. */
  flight(i) { return this.flights[i]; }

  dispose() {
    for (const s of this.ships) { this.scene.remove(s.group); s.dispose(); }
    for (const f of this.flights) if (f.model) this.scene.remove(f.model);
    this.scene.remove(this.tracks.mesh);
  }
}
