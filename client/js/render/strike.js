// The title screen's battle: the last sortie of the Yamato, 7 April 1945 --
// the carriers of Task Force 58 flying off their strikes, and wave after wave
// of Hellcats, Dauntlesses and Avengers going in on her and the destroyers
// screening her, until she rolls over and her magazines go.
//
// Nothing here is simulated. Every ship sails a track laid down before the
// first frame (Track), every aeroplane flies a path through points in time
// (Flight) -- or, on a carrier's deck, is spotted, taxied, run up and flown
// off down it on the game's own integrated take-off run (deckplane.js) --
// and every bomb, torpedo and burst of flak is set off by the script at the
// moment it is due. So the battle is the same battle every time round, the
// camera (see menu.js) always finds what it was sent to look at, and a loop
// of it costs no more than the effects it draws. What is drawn is the
// game's own: the Yamato, her destroyers and the Essexes off their models,
// the aeroplanes off theirs, and the splashes, flak, bombs, fire and smoke a
// battle draws (effects.js, ordnance.js, flames.js).
//
// Most of it is a long way from the camera at any moment, and is drawn
// accordingly: a ship far off is swapped for a welded, simplified stand-in of
// herself (proxy.js), one out of sight is not drawn at all, and nothing far
// off lays its guns.
//
// World frame as everywhere else: +Y up, a heading of 0 runs up +Z, and an
// object turned to heading h has its bow along (sin h, 0, cos h). A ship's own
// frame has +x to port.

import * as THREE from '../../../vendor/three.module.js';
import { buildShip } from './ships.js';
import { muzzleWorld } from './mounts.js';
import { Wake } from './wakefield.js';
import { hellcatModel } from './hellcatModel.js';
import { dauntlessModel } from './dauntlessModel.js';
import { avengerModel } from './avengerModel.js';
import { AERO, launchProfile } from './aero.js';
import { standIn } from './proxy.js';
import * as ESSEX from './essex.js';

/** How long the battle runs before it goes round again, seconds. */
export const LOOP = 300;

const G = 9.81;
const KN = 0.5144;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _u = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const smooth = (k) => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };
const rnd = (a, b) => a + Math.random() * (b - a);
// A fixed sequence, so the battle's choices -- which gun fires at whom, how
// wide a stick falls -- are the same every time it plays.
let seed = 1;
const srand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const sr = (a, b) => a + srand() * (b - a);

/** How far off anything is drawn at all, and how far an aeroplane is. */
const SHIP_FAR = 17000;
const PLANE_FAR = 6500;
/** How far off a ship's guns are laid and fired: beyond it nobody can see them. */
const GUNS_FAR = 9000;

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
    const n = Math.ceil((LOOP + 200) / this.dt);
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
 * fires burning in her, how far she lists, how far down she is. A ship given
 * a `lod` has a welded stand-in of herself (proxy.js) drawn instead whenever
 * the camera is further off than `lodAt`.
 */
class Hull {
  constructor(id, track, ocean, wakes, { lod = 0, lodAt = 900, name = id } = {}) {
    this.id = name;
    this.cls = id;
    this.track = track;
    this.ocean = ocean;
    const built = buildShip(id);
    this.built = built;
    this.group = built.group;
    this.length = built.length;
    this.beam = built.beam;
    this.group.rotation.order = 'YXZ';
    this.proxy = null;
    this.lodAt = lodAt;
    if (lod) {
      this.proxy = standIn(this.group, { minSize: 2.5, cell: lod, key: `${id}:${lod}` });
      this.proxy.rotation.order = 'YXZ';
      this.proxy.visible = false;
    }
    this.wake = new Wake({ length: this.length, beam: this.beam });
    wakes?.add(this.wake);
    this.wakes = wakes;
    this.fires = [];
    this.pose = {};
    // Every gun she has that can be laid on an aeroplane, and when each fires next.
    this.aa = [...(built.secMounts || []), ...(built.aaMounts || [])].map((m) => ({
      m, next: srand() * 2, target: null, cal: built.secMounts?.includes(m) ? 155 : (m.userData.muzzles && m.userData.muzzles.length === 2 ? 127 : 25),
    }));
    // A destroyer's main guns are dual-purpose: they go up at aeroplanes too.
    if (id !== 'yamato') for (const t of built.turrets || []) this.aa.push({ m: t, next: srand() * 3, target: null, cal: 127 });
    this.turrets = built.turrets || [];
    // Where each turret stood when she was built: trained fore and aft.
    this.stowed = this.turrets.map((t) => t.rotation.y);
    this.near = true;
    this.reset();
  }

  addTo(scene) {
    scene.add(this.group);
    if (this.proxy) scene.add(this.proxy);
  }

  reset() {
    this.fires.length = 0;
    this.list = this.listTo = 0;
    this.listRate = 0;
    this.trim = this.trimTo = 0;
    this.sink = this.sinkTo = 0;
    this.sinkRate = 0;
    this.gone = false;
    this.silent = false;
    this.mainTarget = null;
    this.mainTurrets = [];
    this.turrets.forEach((t, i) => {
      t.rotation.y = this.stowed[i];
      const gn = t.userData.gunNode;
      if (gn && gn !== t) gn.rotation.x = t.userData.elevRest || 0;
    });
    for (const g of this.aa) g.target = null;
    this.group.visible = true;
  }

  /**
   * Lay a mounting on a point in the world: train it round at `rate` radians
   * a second and elevate its guns at `up`, never faster -- forty-six
   * centimetre turrets go round at two degrees a second and look it. Whether
   * it is on yet.
   */
  layOn(m, world, dt, rate, up = 0.5) {
    const local = this.group.worldToLocal(_w.copy(world));
    const dx = local.x - m.position.x, dz = local.z - m.position.z, dy = local.y - m.position.y;
    let d = Math.atan2(dx, dz) - m.rotation.y;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    m.rotation.y += Math.max(-rate * dt, Math.min(rate * dt, d));
    const gn = m.userData.gunNode;
    if (gn && gn !== m) {
      const el = Math.max(-0.08, Math.min(1.35, Math.atan2(dy, Math.hypot(dx, dz))));
      gn.rotation.x += Math.max(-up * dt, Math.min(up * dt, -el - gn.rotation.x));
    }
    return Math.abs(d) < 0.12;
  }

  /** A fire burning at a place in her, her own frame. */
  burn(lx, ly, lz, heat, span = 12) {
    this.fires.push({ lx, ly, lz, heat, span, key: `${this.id}:${this.fires.length}` });
  }

  /** Which of her is drawn, from where the camera is. */
  cull(eye) {
    const d = Math.hypot(this.pose.x - eye.x, this.pose.z - eye.z);
    const shown = d < SHIP_FAR && !this.gone;
    const far = !!this.proxy && d > this.lodAt;
    this.group.visible = shown && !far;
    if (this.proxy) this.proxy.visible = shown && far;
    this.near = d < GUNS_FAR && !this.gone;
    this.dist = d;
  }

  update(t, dt, flames) {
    const p = this.track.at(t, this.pose);
    const g = this.group;
    const ease = (v, to, rate, tau) => (rate ? v + Math.max(-rate * dt, Math.min(rate * dt, to - v)) : v + (to - v) * Math.min(1, dt / tau));
    this.list = ease(this.list, this.listTo, this.listRate, 12);
    this.trim = ease(this.trim, this.trimTo, 0, 12);
    this.sink = ease(this.sink, this.sinkTo, this.sinkRate, 10);
    const att = this.ocean.attitude(p.x, p.z, p.h, this.length, this.beam);
    const settle = 1 - smooth(Math.abs(this.list) / 0.6);
    g.position.set(p.x, att.heave * 0.6 * settle - this.trim * 0.2 - this.sink, p.z);
    g.rotation.set(att.pitch * 0.6 * settle + this.trim * 0.01, p.h, att.roll * 0.5 * settle + this.list - p.rate * 2.2);
    if (g.visible || this.near) g.updateMatrixWorld(true);
    else g.updateMatrix();
    if (this.proxy?.visible) {
      this.proxy.position.copy(g.position);
      this.proxy.rotation.copy(g.rotation);
    }
    this.wake.update(dt, p.x, p.z, p.h, this.gone ? 0 : p.speed);
    if (this.mainTarget && g.visible) {
      const at = this.mainTarget(t + 6);
      for (const i of this.mainTurrets) if (this.turrets[i]) this.layOn(this.turrets[i], at, dt, 0.11, 0.12);
    }
    if (!this.gone) {
      for (const f of this.fires) {
        _v.set(f.lx, f.ly, f.lz).applyMatrix4(g.matrix);
        flames.at(f.key, _v.x, _v.y, _v.z, f.heat, f.span);
      }
    }
  }

  /** A point of her own frame, where it is now. */
  world(lx, ly, lz, out = new THREE.Vector3()) {
    return out.set(lx, ly, lz).applyMatrix4(this.group.matrix);
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
 * or a short leg after a long one would kick). A point may carry its own
 * velocity `v`, which then is its tangent.
 */
class Path {
  constructor(pts) {
    this.pts = pts.slice().sort((a, b) => a.t - b.t);
    const P = this.pts;
    this.m = P.map((p, i) => {
      if (p.v) return p.v.clone();
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
 *
 * One that starts on a carrier's deck (`deck`) is spotted there with her
 * wings folded from the first frame, taxied up to the launching position when
 * her turn comes, spreads her wings and runs up, and flies off down the deck
 * on the take-off run integrated for her type off that deck -- then is handed
 * to her path at the speed and height the run left her at.
 */
class Flight {
  constructor(kind, pts, { kill = null, events = [], deck = null } = {}) {
    this.kind = kind;
    this.path = new Path(pts);
    this.kill = kill;
    this.deck = deck;
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
    this.model.visible = false;
    scene.add(this.model);
    this.reset();
  }

  reset() {
    this.down = null;
    this.next = 0;
    this.live = false;
    this.gunsTill = 0;
    this.quat.identity();
    this.fresh = true;
    if (this.model) {
      const u = this.model.userData;
      this.model.visible = false;
      this.model.rotation.set(0, 0, 0);
      u.bay?.(0);
      // Wheels down and wings folded on a deck; up and spread in the air.
      u.gear?.(this.deck ? 0 : 1);
      u.fold?.(this.deck ? 1 : 0);
      if (u.store) u.store.visible = true;
      for (const s of u.wingStores || []) s.visible = true;
    }
  }

  /** Where she is pointing: forward along her path, her wings level to what her lift wants. */
  orient(dt) {
    const fwd = _v.copy(this.vel);
    if (fwd.lengthSq() < 1) return;
    fwd.normalize();
    // Her lift: what holds her up and what turns her.
    const up = _w.copy(this.acc).add(_u.set(0, G, 0));
    up.addScaledVector(fwd, -up.dot(fwd));
    if (up.lengthSq() < 1e-4) up.set(0, 1, 0);
    up.normalize();
    const side = _u.crossVectors(up, fwd).normalize();
    up.crossVectors(fwd, side);
    _m.makeBasis(side, up, fwd);
    _q.setFromRotationMatrix(_m);
    // Eased onto it, so a sharp corner in the path is a roll, not a snap.
    this.quat.slerp(_q, this.fresh ? 1 : Math.min(1, dt * 4));
    this.fresh = false;
  }
}

/**
 * Her place on the deck at time t: in the carrier's own frame, `{ x, y, z,
 * yaw, pitch, fold, prop, airborne }` -- parked, taxiing, running up, or on
 * her take-off run.
 */
function deckPose(d, t, out) {
  const { x0, z0, L0, taxiAt, arriveAt, rollAt, pr } = d;
  out.airborne = false;
  out.y = 0;
  out.pitch = 0;
  if (t < taxiAt) {
    out.x = x0; out.z = z0; out.yaw = 0; out.fold = 1; out.prop = 9;
    return out;
  }
  if (t < arriveAt) {
    // Up the deck in her own column, swinging onto the centreline for the
    // last of it; the plane handlers walk her, so it is a slow, even pace.
    const u = (t - taxiAt) / (arriveAt - taxiAt);
    const at = (k) => [x0 * (1 - smooth((k - 0.5) / 0.5)), z0 + (L0 - z0) * smooth(k)];
    const [x, z] = at(u);
    const [x2, z2] = at(Math.min(1, u + 0.02));
    out.x = x; out.z = z;
    out.yaw = Math.hypot(x2 - x, z2 - z) > 1e-4 ? Math.atan2(x2 - x, z2 - z) : 0;
    out.fold = 1;
    out.prop = 20;
    return out;
  }
  if (t < rollAt) {
    // On the spot: wings spreading and locking, the engine run up against the brakes.
    const u = (t - arriveAt) / (rollAt - arriveAt);
    out.x = 0; out.z = L0; out.yaw = 0;
    out.fold = 1 - smooth(u / 0.7);
    out.prop = 20 + 50 * smooth((u - 0.6) / 0.4);
    return out;
  }
  const i = Math.min(pr.rows.length - 1, Math.max(0, Math.round((t - rollAt) / pr.dt)));
  const [s, h, th, up] = pr.rows[i];
  out.x = 0; out.z = L0 + s; out.y = h; out.yaw = 0; out.pitch = th;
  out.fold = 0;
  out.prop = 75;
  out.airborne = !!up;
  return out;
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
/** And vics of them: a strike is several, stepped down and back from the lead. */
const slotOf = (i) => {
  const v = VIC[i % VIC.length];
  const g = Math.floor(i / VIC.length);
  const off = [[0, 0, 0], [-170, -40, -150], [170, -40, -150], [0, -70, -300], [-340, -80, -300], [340, -80, -300]][g % 6];
  return [v[0] + off[0], v[1] + off[1], v[2] + off[2]];
};

/** Where the carriers' aeroplanes are spotted: metres to port and ahead of midships, her own frame. */
const PARK = [[-6.5, -46], [6.5, -46], [-6.5, -60], [6.5, -60], [-6.5, -74], [6.5, -74], [-6.5, -88], [6.5, -88], [0, -102]];
/** The deck load, in the order it goes off: fighters first, then the bombers. */
const DECKLOAD = ['hellcat', 'hellcat', 'hellcat', 'dauntless', 'dauntless', 'dauntless', 'avenger', 'avenger', 'avenger'];
/** Where each goes from: the launching position, abaft the island. */
const LAUNCH_Z = -30;
/** Seconds between one aeroplane leaving the deck and the next. */
const LAUNCH_EVERY = 5.5;

export class Strike {
  /**
   * `scene` the title scene's, `ocean` its sea (ships ride its waves), `wakes`
   * the map their wakes are drawn into; `fx` is { effects, flak, bombs,
   * flames, bursts }, the battle's own effects systems.
   */
  constructor(scene, ocean, wakes, fx) {
    this.scene = scene;
    this.ocean = ocean;
    this.wakes = wakes;
    this.fx = fx;
    this.t = 0;
    this.eye = new THREE.Vector3();
    seed = 1;

    // The Yamato, steaming south-west at twenty-two knots in the middle of her
    // ring of destroyers, turning hard to comb each attack as it comes.
    const yTurns = [[86, -0.024, 24], [130, 0.03, 24], [178, -0.026, 26], [212, 0.02, 20]];
    this.yamatoTrack = new Track({
      x: 0, z: 0, heading: 0, knots: 24, turns: yTurns,
      // Holed, she slows; then she stops.
      speeds: [[150, 20], [222, 14], [248, 6], [262, 0]],
    });
    this.yamato = new Hull('yamato', this.yamatoTrack, ocean, wakes);

    // Her screen: six destroyers in a ring a mile and a half out -- Yukikaze
    // and her sisters, and two Yugumos -- turning with her.
    const ring = [['yukikaze', 0], ['yugumo', 60], ['yukikaze', 120], ['yukikaze', 180], ['yugumo', 240], ['yukikaze', 300]];
    this.escorts = ring.map(([cls, deg], i) => {
      const a = (deg * Math.PI) / 180;
      const r = 1500 + (i % 2) * 250;
      const track = new Track({
        x: Math.sin(a) * r, z: Math.cos(a) * r, heading: 0, knots: 26,
        turns: yTurns.map(([t, rr, d]) => [t + 1 + i * 0.4, rr * 1.15, d]),
        speeds: [[230, 22]],
      });
      return new Hull(cls, track, ocean, wakes, { lod: 0.4, lodAt: 650, name: `${cls}${i}` });
    });

    // And far to the east, four Essexes in a box, into the wind and launching.
    const CX = 26000, CZ = -3000, CH = -0.75;
    const box = [[0, 0], [1500, -400], [-200, -1600], [1400, -2100]];
    this.carriers = box.map(([port, aft], i) => {
      const c = Math.cos(CH), s = Math.sin(CH);
      const lz = -aft;
      const track = new Track({ x: CX + port * c + lz * s, z: CZ - port * s + lz * c, heading: CH, knots: 28 });
      return new Hull('essex', track, ocean, wakes, { lod: 0.5, lodAt: 700, name: `essex${i}` });
    });
    this.carrierTracks = this.carriers.map((c) => c.track);
    this.cvTrack = this.carrierTracks[0];

    this.ships = [this.yamato, ...this.escorts, ...this.carriers];
    for (const s of this.ships) s.addTo(scene);
    this.deckY = ESSEX.FD;

    this.tracks = new TorpTracks(scene, ocean);
    this.flights = [];
    // The aeroplanes and moments the camera is sent after, by part.
    this.cast = {};
    this.torps = [];
    this.events = [];
    this.writeScript();
    for (const f of this.flights) f.make(scene);
    this.reset();
  }

  // --- the script -------------------------------------------------------

  writeScript() {
    const Y = this.yamatoTrack;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const at = (t, p, v) => ({ t, p, v });

    // ---- the launch: a deck load off each carrier, one every few seconds.
    const profiles = {};
    for (const k of ['hellcat', 'dauntless', 'avenger']) profiles[k] = launchProfile(AERO[k], ESSEX.FD_FWD - LAUNCH_Z);
    this.carriers.forEach((cv, c) => {
      const T = cv.track;
      const first = 3.5 + c * 1.3;
      DECKLOAD.forEach((kind, i) => {
        const pr = profiles[kind];
        const [x0, z0] = PARK[i];
        const rollAt = first + i * LAUNCH_EVERY;
        // She waits for the aeroplane ahead of her in her column to go.
        const taxiAt = i < 2 ? -10 : first + (i - 2) * LAUNCH_EVERY + 0.5;
        const arriveAt = rollAt - 2.6;
        const endT = rollAt + pr.rows.length * pr.dt;
        const last = pr.rows[pr.rows.length - 1];
        const prev = pr.rows[Math.max(0, pr.rows.length - 13)];
        const climb = (last[1] - prev[1]) / (12 * pr.dt);
        const lift = pr.rows.findIndex((r) => r[3]);
        // Off her bow, and handed over to a path: on out ahead and climbing,
        // round to port onto the rendezvous over the force, and away west.
        const p0 = T.local(endT, 0, this.deckY + last[1], LAUNCH_Z + last[0]);
        const h = T.at(endT).h;
        const vf = T.at(endT).speed + last[4];
        const v0 = V(Math.sin(h) * vf, climb, Math.cos(h) * vf);
        const pts = [
          at(endT, p0, v0),
          at(endT + 8, T.local(endT + 8, 0, this.deckY + last[1] + 60, LAUNCH_Z + last[0] + last[4] * 8)),
          at(endT + 24, T.local(endT + 24, 700 + i * 30, 380, 1900)),
          at(endT + 44, T.local(endT + 44, 1500 + i * 40, 800, 900)),
          at(endT + 70, T.local(endT + 70, 900 + c * 300, 1300 + i * 20, -2600)),
          at(endT + 200, V(T.at(0).x - 18000 - i * 60, 2600, T.at(0).z + c * 400 + i * 50)),
        ];
        const f = new Flight(kind, pts, {
          deck: { track: T, hull: cv, x0, z0, L0: LAUNCH_Z, taxiAt, arriveAt, rollAt, endT, pr, liftAt: rollAt + lift * pr.dt },
        });
        this.flights.push(f);
        if (c === 0 && i === 0) this.cast.launch = f;
        if (c === 0 && i === 1) this.cast.launch2 = f;
        if (c === 0 && i === 2) this.cast.launch3 = f;
        if (c === 1 && i === 3) this.cast.launch4 = f;
      });
    });

    // ---- the first wave. Over the cloud from the east at ten thousand
    // feet, breaking up over her.
    const leadA = (t) => {
      const k = (t - 20) / 50;
      return V(13500 - 10000 * k, 2700 - 250 * k, 1200 + 300 * k);
    };
    const formation = (lead, t0, t1, slot, ox = 0, oz = 0) => {
      const out = [];
      const s = slotOf(slot);
      for (let t = t0; t <= t1; t += 10) {
        const p = lead(t);
        // Flying west: her right is +z, astern is +x.
        out.push(at(t, V(p.x - s[2] + ox, p.y + s[1], p.z + s[0] + oz)));
      }
      return out;
    };
    this.leadA = leadA;

    // Avengers in an anvil: from either bow, low, dropping inside a mile.
    const torpRun = (track, t0, side, lz, slot) => {
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
        L(60, -7000, 1800, lz - 5000 + slot * 100),
      ];
    };
    // Dauntlesses rolling in from astern one after another, seventy degrees down.
    const dive = (track, t0, lx, lz, slot) => {
      const L = (dt, x, y, z) => at(t0 + dt, track.local(t0 + dt, x, y, z));
      return [
        L(-34, 900 + slot * 40, 2900, -5200),
        L(-20, 300, 2800, -1500),
        L(-15, 120, 2700, -1050),
        L(-7, 40, 1500, -420),
        L(0, lx * 0.4, 480, lz - 130),
        L(2.2, lx * 0.2, 240, lz - 10),
        L(5, 0, 130, lz + 280),
        L(14, -600, 220, lz + 1700),
        L(30, -2500, 900, lz + 4200),
        L(70, -6000, 2400, lz + 9000 + slot * 100),
      ];
    };
    // Hellcats ahead of the bombers, strafing the gun crews.
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
        L(60, -side * 7000, 2600, lz - 4000 - slot * 120),
      ];
    };
    // A Hellcat's run on one of the destroyers.
    const strafeShip = (hull, t0, slot) => {
      const tr = hull.track;
      const L = (dt, x, y, z) => at(t0 + dt, tr.local(t0 + dt, x, y, z));
      return [
        L(-20, 2400, 2000, 2600), L(-8, 900, 500, 900), L(-2, 160, 70, 200),
        L(0, 30, 40, 40), L(2, -120, 45, -160), L(8, -900, 300, -900), L(40, -5000, 2400, -3000 - slot * 100),
      ];
    };

    // Strafers first: two on the Yamato, one on a destroyer.
    [[86, 1, 30], [89, -1, -40]].forEach(([t0, side, lz], i) => {
      const pts = [...formation(leadA, 20, 50, 1 + i, 300, 200), ...strafe(Y, t0, side, lz, i)];
      this.flights.push(new Flight('hellcat', pts, { events: [{ t: t0 - 3, k: 'guns', dur: 3.4 }] }));
      if (i === 0) this.cast.strafeA = this.flights[this.flights.length - 1];
    });
    {
      const t0 = 84;
      const pts = [...formation(leadA, 20, 50, 3, 300, 200), ...strafeShip(this.escorts[1], t0, 2)];
      this.flights.push(new Flight('hellcat', pts, { events: [{ t: t0 - 2.5, k: 'guns', dur: 3 }] }));
    }
    // The dive bombers. The first is the one the camera rides down.
    const divesA = [[103.5, 2, 20, true], [107.5, -4, -50, true], [111, 8, 70, false], [114.5, 0, -80, true], [118, 6, 40, false]];
    divesA.forEach(([t0, lx, lz, hit], i) => {
      const pts = [...formation(leadA, 20, 60, 6 + i, -300, 300), ...dive(Y, t0, lx, lz, i)];
      // The third does not come out of his dive.
      const kill = i === 2 ? { t: t0 - 6 } : null;
      this.flights.push(new Flight('dauntless', pts, { kill, events: [{ t: t0, k: 'bomb', track: Y, lx, lz, hit, hero: i === 0 }] }));
      if (i === 0) this.cast.diveA = this.flights[this.flights.length - 1];
      if (i === 1) this.cast.diveA2 = this.flights[this.flights.length - 1];
    });
    // And the Avengers: six, both bows, three fish into her port side.
    const anvilA = [[1, 40, true], [1, -20, true], [1, 90, false], [-1, 30, false], [-1, -40, false], [1, 0, true]];
    anvilA.forEach(([side, lz, hit], i) => {
      const t0 = 132 + i * 1.3;
      const pts = [...formation(leadA, 20, 60, 12 + i, 0, -200), ...torpRun(Y, t0, side, lz, i)];
      this.flights.push(new Flight('avenger', pts, { events: [{ t: t0, k: 'torp', track: Y, side, lz, hit }] }));
      if (i === 0) this.cast.torpA = this.flights[this.flights.length - 1];
    });
    // The lead aeroplane of the formation, for the camera to fly with.
    this.cast.lead = this.flights[this.flights.length - 6];

    // ---- the second wave.
    const leadB = (t) => {
      const k = (t - 120) / 50;
      return V(14500 - 10500 * k, 2800 - 200 * k, 3600 + 300 * k);
    };
    this.leadB = leadB;
    [[168, 1, 50], [171, -1, -20]].forEach(([t0, side, lz], i) => {
      const pts = [...formation(leadB, 120, 140, i, 200, 0), ...strafe(Y, t0, side, lz, 4 + i)];
      this.flights.push(new Flight('hellcat', pts, { events: [{ t: t0 - 3, k: 'guns', dur: 3.2 }] }));
    });
    {
      const t0 = 176;
      const pts = [...formation(leadB, 120, 140, 2, 200, 0), ...strafeShip(this.escorts[3], t0, 5)];
      this.flights.push(new Flight('hellcat', pts, { events: [{ t: t0 - 2.5, k: 'guns', dur: 3 }] }));
      this.cast.strafeB = this.flights[this.flights.length - 1];
    }
    const divesB = [[194, 4, 40, true], [197, -2, -30, true], [200, 6, -70, false], [203, -6, 75, true]];
    divesB.forEach(([t0, lx, lz, hit], i) => {
      const pts = [...formation(leadB, 120, 150, 3 + i, -300, 400), ...dive(Y, t0, lx, lz, 5 + i)];
      this.flights.push(new Flight('dauntless', pts, { events: [{ t: t0, k: 'bomb', track: Y, lx, lz, hit }] }));
      if (i === 0) this.cast.diveB = this.flights[this.flights.length - 1];
      if (i === 1) this.cast.diveB2 = this.flights[this.flights.length - 1];
    });
    const anvilB = [[1, 60, true], [1, -10, true], [-1, 40, true], [1, 120, false], [-1, -30, false]];
    anvilB.forEach(([side, lz, hit], i) => {
      const t0 = 207 + i * 1.4;
      const pts = [...formation(leadB, 120, 150, 8 + i, 0, -300), ...torpRun(Y, t0, side, lz, 6 + i)];
      this.flights.push(new Flight('avenger', pts, { events: [{ t: t0, k: 'torp', track: Y, side, lz, hit }] }));
      if (i === 0) this.cast.torpB = this.flights[this.flights.length - 1];
    });
    // And one Avenger, holed, going in astern of her.
    {
      const pts = [at(214, Y.local(214, 3600, 700, -2600)), at(222, Y.local(222, 1500, 320, -900)),
        at(228, Y.local(228, 600, 220, -250)), at(236, Y.local(236, -800, 200, 600))];
      this.flights.push(new Flight('avenger', pts, { kill: { t: 225 } }));
      this.cast.downed = this.flights[this.flights.length - 1];
    }
    // The last of them: two Avengers on her starboard side as she slows, and
    // aeroplanes circling over her to watch her go.
    [[1, 20, true], [-1, -20, true]].forEach(([side, lz, hit], i) => {
      const t0 = 244 + i * 2;
      const pts = torpRun(Y, t0, -1, lz, 11 + i);
      this.flights.push(new Flight('avenger', pts, { events: [{ t: t0, k: 'torp', track: Y, side: -1, lz, hit }] }));
      if (i === 0) this.cast.torpC = this.flights[this.flights.length - 1];
    });
    for (let i = 0; i < 6; i++) {
      const pts = [];
      const r = 1600 + i * 180, y = 900 + i * 90, w = 0.05 * (i % 2 ? 1 : -1);
      for (let t = 236; t <= LOOP + 4; t += 8) {
        const a = i + (t - 236) * w;
        pts.push(at(t, Y.local(t, Math.sin(a) * r, y, Math.cos(a) * r)));
      }
      this.flights.push(new Flight(i % 3 === 0 ? 'hellcat' : i % 3 === 1 ? 'dauntless' : 'avenger', pts));
    }

    // ---- what she does back.
    // Her main battery, firing Type 3 shell into the formation as it comes
    // in, laid where the bombers will be when the shell gets there.
    const on = (f) => (t) => f.path.at(t, new THREE.Vector3());
    const tgtA = on(this.cast.diveA), tgtB = on(this.cast.diveB);
    this.events.push({ t: 46, k: 'train', turrets: [0, 1, 2], target: tgtA });
    this.events.push({ t: 63.5, k: 'salvo', turrets: [0, 1], target: tgtA });
    this.events.push({ t: 68.5, k: 'salvo', turrets: [0, 1, 2], target: tgtA });
    this.events.push({ t: 74.5, k: 'salvo', turrets: [0, 1], target: tgtA });
    this.events.push({ t: 168, k: 'train', turrets: [0, 1, 2], target: tgtB });
    this.events.push({ t: 182.5, k: 'salvo', turrets: [0, 1, 2], target: tgtB });
    this.events.push({ t: 187.5, k: 'salvo', turrets: [0, 1], target: tgtB });
    // Her end: she goes over to port, stops, and rolls over, and as she goes
    // her forward magazines explode.
    this.events.push({ t: 236, k: 'list', to: -0.32, rate: 0.012 });
    this.events.push({ t: 252, k: 'list', to: -1.35, rate: 0.055 });
    this.events.push({ t: 256, k: 'silent' });
    this.events.push({ t: 270.5, k: 'magazine' });
    this.events.push({ t: 271, k: 'sink', to: 40, rate: 5 });
    this.events.push({ t: 279, k: 'gone' });
    this.events.sort((a, b) => a.t - b.t);
  }

  reset() {
    seed = 7;
    this.t = 0;
    for (const s of this.ships) s.reset();
    for (const f of this.flights) f.reset();
    this.torps.length = 0;
    this.ev = 0;
    // Spent one-off moments from the last time round go.
    this.events = this.events.filter((e) => !e.once);
    this.cast.bomb = null;
    this.cast.magazine = null;
  }

  // --- what happens ------------------------------------------------------

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
    const tp = {
      x: p.x + dir.x * 40, z: p.z + dir.z * 40, dir, t0: this.t + 1.2, tHit: e.hit ? tHit : tHit + 30, hit: e.hit,
      ship: this.yamato, side: e.side, lz: e.lz, trail: [], done: false, gone: 0,
    };
    this.torps.push(tp);
    if (f === this.cast.torpA) this.cast.fishA = tp;
    if (f === this.cast.torpB) this.cast.fishB = tp;
    f.model?.userData.bay?.(1);
    if (f.model?.userData.store) f.model.userData.store.visible = false;
  }

  torpedoHit(tp) {
    const { effects } = this.fx;
    const s = tp.ship;
    if (s.gone) return;
    const hp = s.world(tp.side * (s.beam / 2 + 2), 0, tp.lz, new THREE.Vector3());
    effects.splash(hp.x, hp.z, 640, { kind: 'torp' });
    this.later(0.25, () => effects.splash(hp.x + rnd(-6, 6), hp.z + rnd(-6, 6), 540, { kind: 'torp', child: true }));
    effects.explosion(hp.x, 4, hp.z, 1.2);
    // She takes water on that side, and goes over towards it.
    if (!s.listRate) s.listTo += -tp.side * 0.04;
    s.trimTo += tp.lz > 0 ? 1 : -0.5;
    s.burn(tp.side * (s.beam / 2 - 3), 9, tp.lz, 0.55, 10);
  }

  dropBomb(f, e) {
    const { effects, bombs, bursts } = this.fx;
    const p = f.pos, v = f.vel;
    const y1 = e.hit ? 14 : 0;
    const a = 0.5 * G, b = -v.y, c = -(p.y - y1);
    const T = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
    const land = e.track.local(this.t + T, e.lx + (e.hit ? 0 : sr(-1, 1) > 0 ? 34 : -34), 0, e.lz + (e.hit ? 0 : sr(-30, 30)), new THREE.Vector3());
    const s = this.yamato;
    const hero = e.hero;
    bombs.drop(p.x, p.y, p.z, land.x, land.z, e.hit, effects, 1.6, v.length(), {
      p: p.clone(), v: v.clone(), len: 1.6, r: 0.18,
      land: (x, z) => {
        if (s.gone) return;
        if (e.hit) {
          const y = 14;
          effects.explosion(x, y, z, 1.8);
          effects.debris?.(x, y, z, 16, 1.2);
          bursts?.blast(x, y + 4, z, { size: 34, duration: 1.6, debris: 60, light: false, plume: true, ring: false, linger: 2 });
          s.burn(e.lx, 12, e.lz, 0.85, 14);
        } else {
          effects.splash(x, z, 340, { kind: 'bomb' });
        }
        if (hero && this.cast.bomb) this.cast.bomb.landed = this.t;
      },
    });
    if (hero && bombs.live.length) this.cast.bomb = { b: bombs.live[bombs.live.length - 1], t0: this.t, T, landed: 0 };
    for (const st of f.model?.userData.wingStores || []) st.visible = false;
    if (f.model?.userData.store) f.model.userData.store.visible = false;
  }

  /** A salvo of Type 3 shell, and its bursts in among the formation. */
  salvo(e) {
    const { effects } = this.fx;
    const s = this.yamato;
    if (s.silent) return;
    const tgt = e.target(this.t + 6);
    for (const i of e.turrets) {
      const m = s.turrets[i];
      if (!m) continue;
      for (let k = 0; k < 3; k++) {
        const mp = muzzleWorld(m, k, new THREE.Vector3());
        const aim = new THREE.Vector3().subVectors(tgt, mp).normalize();
        effects.muzzle(mp.x, mp.y, mp.z, Math.atan2(aim.x, aim.z), 460, aim);
      }
      // The blast flattening the sea alongside her.
      const mp = muzzleWorld(m, 1, new THREE.Vector3());
      effects.flash(mp.x, mp.y, mp.z, 5);
    }
    this.cast.salvoAt = this.t;
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
    const { effects, bursts } = this.fx;
    bursts?.blast(x, y, z, { size: 70, duration: 1.4, debris: 160, light: false, plume: false, ring: false, linger: 6 });
    effects.flakBurst(x, y, z, 460);
    effects.flash(x, y, z, 4);
  }

  /** Her forward magazines going up as she rolls over. */
  magazine() {
    const { effects, bursts } = this.fx;
    const s = this.yamato;
    const p = s.world(0, 6, 40, new THREE.Vector3());
    effects.flash(p.x, 40, p.z, 8);
    effects.explosion(p.x, 20, p.z, 4);
    effects.debris?.(p.x, 20, p.z, 40, 3);
    // And what is left burning on the water where she was, putting up the
    // column (see update).
  }

  later(d, fn) {
    const e = { t: this.t + d, fn, once: true };
    // Into its place among those still to come.
    let i = this.ev;
    while (i < this.events.length && this.events[i].t <= e.t) i++;
    this.events.splice(i, 0, e);
  }

  // --- every frame --------------------------------------------------------

  /** `eye` is where the camera is: what is far from it is drawn cheaply or not at all. */
  update(dt, eye = null) {
    this.t += dt;
    const t = this.t;
    if (eye) this.eye.copy(eye);
    const { flames } = this.fx;

    for (const s of this.ships) { s.cull(this.eye); s.update(t, dt, flames); }

    // The script's own moments.
    while (this.ev < this.events.length && this.events[this.ev].t <= t) {
      const e = this.events[this.ev++];
      const Y = this.yamato;
      if (e.fn) e.fn();
      else if (e.k === 'salvo') this.salvo(e);
      else if (e.k === 'train') { Y.mainTarget = e.target; Y.mainTurrets = e.turrets; }
      else if (e.k === 'list') { Y.listTo = e.to; Y.listRate = e.rate; }
      else if (e.k === 'silent') { Y.silent = true; Y.mainTarget = null; }
      else if (e.k === 'magazine') this.magazine();
      else if (e.k === 'sink') { Y.sinkTo = e.to; Y.sinkRate = e.rate; }
      else if (e.k === 'gone') Y.gone = true;
    }
    // Spent one-off moments come off, so the list does not grow round the loop.
    if (this.ev > 64) {
      const keep = this.events.slice(0, this.ev).filter((e) => !e.once);
      this.events.splice(0, this.ev, ...keep);
      this.ev = keep.length;
    }

    // The aircraft.
    const live = [];
    for (const f of this.flights) {
      const m = f.model;
      if (!m) continue;
      if (f.down) { this.fall(f, dt); if (!f.down.gone) live.push(f); continue; }
      if (f.deck && t < f.deck.endT) { this.onDeck(f, t, dt); continue; }
      const inAir = t >= f.path.t0 && t <= f.path.t1;
      f.live = inAir;
      if (!inAir) { m.visible = false; continue; }
      const v0 = f.vel.clone();
      f.path.at(t, f.pos, f.vel);
      f.acc.subVectors(f.vel, v0).divideScalar(Math.max(1e-3, dt));
      f.acc.clampLength(0, 60);
      f.orient(dt);
      m.visible = f.pos.distanceToSquared(this.eye) < PLANE_FAR * PLANE_FAR;
      if (m.visible) {
        m.position.copy(f.pos);
        m.quaternion.copy(f.quat);
        if (m.userData.prop) m.userData.prop.rotation.z += dt * 60;
      }
      while (f.next < f.events.length && f.events[f.next].t <= t) {
        const e = f.events[f.next++];
        if (e.k === 'torp') this.dropTorpedo(f, e);
        else if (e.k === 'bomb') this.dropBomb(f, e);
        else if (e.k === 'guns') f.gunsTill = t + e.dur;
      }
      if (f.deck) m.userData.gear?.(Math.min(1, (t - f.deck.liftAt - 1.2) / 2.5));
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

    // Where she went: oil and wreckage burning on the sea, and the column of
    // smoke standing over it.
    const mg = this.cast.magazine;
    if (mg && t - mg.t < 40) {
      const k = Math.min(1, (t - mg.t) / 2) * (1 - smooth((t - mg.t - 28) / 12));
      flames.at('magazine0', mg.p.x, 6, mg.p.z, 1.0 * k, 70);
      flames.at('magazine1', mg.p.x + 50, 4, mg.p.z - 30, 0.8 * k, 50);
      flames.at('magazine2', mg.p.x - 45, 4, mg.p.z + 35, 0.8 * k, 50);
    }

    // Every gun in reach of the camera at whatever is in reach of it.
    for (const s of [this.yamato, ...this.escorts]) if (s.near && !s.silent) this.antiAircraft(s, live, dt);
  }

  /** An aeroplane on a carrier's deck, from her spot to the end of her take-off run. */
  onDeck(f, t, dt) {
    const d = f.deck, m = f.model, u = m.userData;
    const hull = d.hull;
    const pose = deckPose(d, t, f.deckPose || (f.deckPose = {}));
    // Drawn only when her carrier is drawn in full: from further off she is
    // a speck on a stand-in.
    m.visible = hull.group.visible && t >= 0;
    f.live = pose.airborne;
    if (!m.visible && !pose.airborne) return;
    const g = hull.group;
    // On her carrier's deck, riding with her; once off it, on the line the
    // carrier is steaming, clear of her pitching.
    const y = this.deckY + pose.y;
    const prev = f.pos.clone();
    if (pose.airborne) d.track.local(t, pose.x, y, pose.z, f.pos);
    else f.pos.set(pose.x, y, pose.z).applyMatrix4(g.matrix);
    f.vel.subVectors(f.pos, prev).divideScalar(Math.max(1e-3, dt));
    _e.set(-pose.pitch, pose.yaw, 0, 'YXZ');
    _q.setFromEuler(_e);
    if (pose.airborne) { _e.set(0, d.track.at(t).h, 0, 'YXZ'); _q2.setFromEuler(_e); }
    else _q2.copy(g.quaternion);
    f.quat.multiplyQuaternions(_q2, _q);
    f.fresh = false;
    m.position.copy(f.pos);
    m.quaternion.copy(f.quat);
    u.fold?.(pose.fold);
    u.gear?.(t > d.liftAt + 1.2 ? Math.min(1, (t - d.liftAt - 1.2) / 2.5) : 0);
    if (u.prop) u.prop.rotation.z += dt * pose.prop;
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
      for (const s of [this.yamato, ...this.escorts]) {
        if (Math.hypot(s.pose.x - x, s.pose.z - z) < s.length / 2) effects.strike(x, 10, z, 12.7);
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
    f.vel.copy(d.vel);
    m.position.copy(f.pos);
    _q.setFromAxisAngle(_v.set(0, 0, 1), d.spin * dt);
    f.quat.multiply(_q);
    m.quaternion.copy(f.quat);
    m.visible = f.pos.distanceToSquared(this.eye) < PLANE_FAR * PLANE_FAR;
    // Burning, and the smoke streaming back.
    if (m.visible) {
      effects.air.puff(f.pos.x, f.pos.y, f.pos.z, -d.vel.x * 0.1, 1, -d.vel.z * 0.1, { life: 0.6, size: 2.2, grow: 5, burn: 0.95, tone: 0.1 });
      effects.air.puff(f.pos.x, f.pos.y, f.pos.z, -d.vel.x * 0.05, 2, -d.vel.z * 0.05, { life: 7, size: 4, grow: 14, burn: 0, tone: 0.18 });
    }
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
    const near = live.filter((f) => !f.down && !f.deck && f.pos.distanceToSquared(sp) < 4600 * 4600 && f.pos.y > 20);
    const shown = s.group.visible;
    for (const g of s.aa) {
      const m = g.m;
      const cal = g.cal;
      // Every frame, laid on whatever it is engaging: round and up after her.
      if (g.target && (g.target.down || !g.target.live)) g.target = null;
      if (g.target && shown) {
        const tof = g.target.pos.distanceTo(sp) / (cal < 75 ? 900 : 700);
        _v.copy(g.target.vel).multiplyScalar(tof).add(g.target.pos);
        s.layOn(m, _v, dt, cal < 75 ? 1.6 : 0.7, cal < 75 ? 1.4 : 0.6);
      }
      g.next -= dt;
      if (g.next > 0 || !near.length) continue;
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
      g.target = best;
      // Lead her by the time of flight, and miss -- nearly every burst does.
      const tof = range / (cal < 75 ? 900 : 700);
      const spread = cal < 75 ? 30 + range * 0.03 : 60 + range * 0.05;
      flak.fire(mp.x, mp.y, mp.z,
        best.pos.x + best.vel.x * tof, best.pos.y + best.vel.y * tof, best.pos.z + best.vel.z * tof,
        cal, cal < 75 ? 9 : 6, effects, spread, 4);
      if (cal >= 127 && shown && srand() < 0.5) effects.muzzle(mp.x, mp.y, mp.z, s.pose.h + m.rotation.y, cal, _v.subVectors(best.pos, mp).normalize());
    }
  }

  dispose() {
    for (const s of this.ships) {
      this.scene.remove(s.group);
      if (s.proxy) this.scene.remove(s.proxy);
      s.dispose();
    }
    for (const f of this.flights) if (f.model) this.scene.remove(f.model);
    this.scene.remove(this.tracks.mesh);
  }
}
