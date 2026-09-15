// The bomber yard: one heavy at a time, over a burning city, with the flak up.
//
// The shipyard's and the gun park's opposite number, and deliberately the same
// screen: the name and the two arrows in one corner, a datasheet in each of the
// bottom two, the back button in the fourth, and the thing itself behind all of
// them. The difference is where it is. A hull is looked at from a boat
// alongside and a coast battery from the landward side, but nobody ever looked
// at a heavy bomber from anywhere except the air -- so this one is aloft, at
// night, over the target, with her bay open and the stick going down.
//
// Everything in the frame is doing its job rather than decorating: the bay
// doors are the model's own, the bombs come out of her bay and fall under
// gravity, the fires are where the earlier sticks went, and the flak is
// bursting at her height because that is what the batteries below are laid for.

import * as THREE from '../../vendor/three.module.js';
import { skyDome } from './render/scene.js';
import { heavyBomber, HEAVY, layTurret } from './render/planekit.js';
import { BOMBERS } from '../../shared/bombers.js';

// How far under her the city is. A heavy bombed from eighteen thousand feet --
// five and a half thousand metres -- at which height a city is a texture and
// nothing in it has a shape. This is a fifth of that, which is the distance
// that puts both in the frame: far enough that the blocks read as blocks and
// the fires as fires, near enough that they light her from below.
const DOWN = 1150;

// Bombs fall at a fifth of the height, so they fall at five times the weight.
// Compressing the altitude and leaving gravity alone would have the stick
// taking fifteen seconds to arrive from a height it should take thirty from;
// scaled with the scene it arrives in about seven, which is what the drop
// looks like from up here.
const DROP_G = 9.81 * 5;

// How fast the ground goes past. Two hundred miles an hour is ninety metres a
// second, which from this height is a slow drift -- which is exactly what it
// looked like from the astrodome, and why the run-up was the longest four
// minutes of the war.
const GROUND = 78;

/**
 * A soft round fall-off, as a texture.
 *
 * A fire drawn as a flat disc of one colour is a coin lying on the roofs, and
 * three dozen coins is what the target looked like. One radial gradient --
 * white in the middle, nothing at the rim -- turns the same disc into
 * something burning, and it is the same texture for the burst of a bomb
 * arriving because that is the same thing a second old.
 */
let GLOW = null;
function glowMap() {
  if (GLOW) return GLOW;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.28, 'rgba(255,238,206,0.72)');
  grad.addColorStop(0.62, 'rgba(255,170,74,0.26)');
  grad.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  GLOW = new THREE.CanvasTexture(c);
  GLOW.colorSpace = THREE.SRGBColorSpace;
  return GLOW;
}

/** The same fall-off again, in smoke: dark in the middle, gone at the rim. */
let SMOKE = null;
function smokeMap() {
  if (SMOKE) return SMOKE;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(30, 28, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(96,86,74,0.95)');
  grad.addColorStop(0.45, 'rgba(74,66,57,0.74)');
  grad.addColorStop(0.78, 'rgba(52,46,40,0.28)');
  grad.addColorStop(1, 'rgba(40,35,30,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  SMOKE = new THREE.CanvasTexture(c);
  SMOKE.colorSpace = THREE.SRGBColorSpace;
  return SMOKE;
}

const PITCH_MIN = -0.85;
const PITCH_MAX = 1.05;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// A repeatable scatter. The city has to be the same city every time the screen
// is opened, or stepping from one bomber to the next rebuilds the target.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * The city: blocks of buildings on a grid of streets, with a river through it.
 *
 * Built as one instanced box for the whole town -- three thousand buildings in
 * one draw call -- because from three hundred metres up what a city is is a
 * texture of roofs with the streets showing black between them, and every
 * building in it is the same building at a different size.
 */
function buildCity(seed = 7) {
  const rand = rng(seed);
  const EXT = 8800;          // how far the town runs, each way
  const BLOCK = 118;         // block pitch, street to street
  const N = Math.floor((EXT * 2) / BLOCK);

  // Where the river runs: a curve across the town, and nothing is built in it.
  const riverAt = (z) => Math.sin(z * 0.00052) * 1400 + Math.sin(z * 0.0014 + 1.2) * 420;
  const RIVER = 420;

  const group = new THREE.Group();

  // The ground itself: roofs are what you see, and between them the streets.
  // One dark plane under the lot, with the river cut into it as its own quad
  // strip so the water catches the fires.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(EXT * 3.2, EXT * 3.2),
    new THREE.MeshLambertMaterial({ color: 0x191d23 }),
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  const rpos = [];
  const ridx = [];
  for (let i = 0; i <= 48; i++) {
    const z = -EXT * 1.6 + (EXT * 3.2) * (i / 48);
    const x = riverAt(z);
    rpos.push(x - RIVER, 0.4, z, x + RIVER, 0.4, z);
    if (i) {
      const a = (i - 1) * 2;
      ridx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const rgeo = new THREE.BufferGeometry();
  rgeo.setAttribute('position', new THREE.Float32BufferAttribute(rpos, 3));
  rgeo.setIndex(ridx);
  rgeo.computeVertexNormals();
  group.add(new THREE.Mesh(rgeo, new THREE.MeshLambertMaterial({ color: 0x2c4256 })));

  // The buildings. Taller and denser toward the middle, the way a town is,
  // thinning to suburbs at the edges and stopping at the water.
  const MAX = N * N;
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
    MAX,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  let n = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = -EXT + (i + 0.5) * BLOCK + (rand() - 0.5) * 10;
      const z = -EXT + (j + 0.5) * BLOCK + (rand() - 0.5) * 10;
      if (Math.abs(x - riverAt(z)) < RIVER * 0.92) continue;
      const out = Math.hypot(x, z) / EXT;
      if (rand() < out * 0.75) continue;
      const tall = (1 - out) ** 1.6;
      const h = 14 + rand() * 20 + tall * (rand() < 0.08 ? 70 : 26);
      const w = BLOCK * (0.42 + rand() * 0.32);
      const d = BLOCK * (0.42 + rand() * 0.32);
      pos.set(x, h / 2, z);
      sc.set(w, h, d);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() < 0.12 ? rand() * 0.3 : 0);
      mesh.setMatrixAt(n, m.compose(pos, q, sc));
      // Roofs, in slate and tile and tar, and every one of them a shade off
      // its neighbour -- a city drawn in one colour is a chequerboard.
      const g = 0.22 + rand() * 0.16;
      col.setRGB(g * (1 + rand() * 0.22), g * (1 + rand() * 0.10), g * (1.05 + rand() * 0.08));
      mesh.setColorAt(n, col);
      n += 1;
    }
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  group.add(mesh);
  group.userData.block = BLOCK;
  return group;
}

/**
 * What is already burning down there.
 *
 * A raid is not one aeroplane: by the time this one is over the target the
 * markers have gone down and half the town is alight. The fires are additive
 * discs lying on the roofs with a column of smoke standing off each of the big
 * ones, and between them they are the only light in the scene that reaches the
 * aeroplane -- which is why a night bomber is lit from underneath.
 */
function buildFires(city, seed = 11) {
  const rand = rng(seed);
  const group = new THREE.Group();
  const glow = new THREE.MeshBasicMaterial({
    map: glowMap(), color: 0xff8a2e, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const core = new THREE.MeshBasicMaterial({
    map: glowMap(), color: 0xffe0b0, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const smoke = new THREE.MeshBasicMaterial({
    color: 0x1a1714, transparent: true, opacity: 0.32, depthWrite: false,
    side: THREE.DoubleSide,
  });
  const seats = [];
  for (let i = 0; i < 74; i++) {
    const a = rand() * Math.PI * 2;
    const r = 240 + rand() ** 0.55 * 5600;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const big = 26 + rand() * 62;
    // A square, not a circle: the fall-off is in the texture, and a quad is
    // two triangles where a fourteen-sided disc is fourteen.
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(big * 2.6, big * 2.6), glow);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(x, 3 + rand() * 20, z);
    group.add(disc);
    const hot = new THREE.Mesh(new THREE.PlaneGeometry(big * 0.9, big * 0.9), core);
    hot.rotation.x = -Math.PI / 2;
    hot.position.set(x, 5 + rand() * 20, z);
    group.add(hot);
    seats.push({ disc, hot, phase: rand() * 6.28, rate: 0.7 + rand() * 1.5 });
    // The column over the big ones, leaning off downwind and spreading as it
    // climbs. Four out of five fires get none: a sky full of columns is a
    // forest, and what a burning city actually has is a few big ones.
    if (rand() < 0.22) {
      const h = 180 + rand() * 340;
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(big * 1.5, big * 0.5, h, 9, 1, true), smoke,
      );
      col.position.set(x + h * 0.16, h / 2, z);
      col.rotation.z = -0.16;
      group.add(col);
    }
  }
  group.userData.seats = seats;
  city.add(group);
  return group;
}

/** Searchlights: a cone of light standing off the ground and sweeping. */
function buildLights(city, seed = 19) {
  const rand = rng(seed);
  const group = new THREE.Group();
  const beam = new THREE.MeshBasicMaterial({
    color: 0xbcd2ea, transparent: true, opacity: 0.030,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beams = [];
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2;
    const r = 900 + rand() * 5000;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    // The cone is built pointing up with its apex on the ground, so swinging
    // the pivot swings the beam about the lamp rather than about its middle.
    const cone = new THREE.Mesh(new THREE.ConeGeometry(40, 900, 10, 1, true), beam);
    cone.position.y = 450;
    cone.rotation.x = Math.PI;
    pivot.add(cone);
    group.add(pivot);
    beams.push({ pivot, phase: rand() * 6.28, rate: 0.14 + rand() * 0.16,
      lean: 0.20 + rand() * 0.30 });
  }
  group.userData.beams = beams;
  city.add(group);
  return group;
}

/**
 * The flak: a burst is a flash, then a puff, then nothing.
 *
 * Heavy anti-aircraft fire at eighteen thousand feet looked like this and only
 * like this -- a red-orange wink, a black ball of smoke standing where it was,
 * and the ball drifting aft relative to you at your own airspeed because it is
 * the air that is standing still, not you. So the puffs are put in the
 * aeroplane's frame and carried aft at the same rate the ground goes past.
 */
class Flak {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    // Both as sprites, so they face the camera wherever it has walked round to
    // and a burst is a ball of smoke rather than an icosahedron.
    this.puffMat = new THREE.SpriteMaterial({
      map: smokeMap(), color: 0xffffff, transparent: true, opacity: 0.85,
      depthWrite: false,
    });
    this.flashMat = new THREE.SpriteMaterial({
      map: glowMap(), color: 0xffc061, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.live = [];
    this.next = 0.4;
    this.rand = rng(23);
    // The tracer coming up: light flak cannot reach this height, but it is
    // firing anyway and the streams of it going up from the town are half of
    // what a raid looked like. Down there with the guns, not up here with her:
    // started forty metres under her wing they were two cream columns three
    // hundred pixels tall standing through the middle of the frame.
    this.tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffd089, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.tracerGeo = new THREE.CylinderGeometry(1.6, 1.6, 70, 5);
    this.tracers = [];
    this.nextTracer = 0.2;
  }

  /** One burst, somewhere round her but never on her. */
  burst(span) {
    const r = this.rand;
    // Round the aeroplane in a shell: near enough to be frightening, far
    // enough that a puff is never drawn inside a wing.
    const a = r() * Math.PI * 2;
    const rad = span * (0.95 + r() * 1.9);
    const at = new THREE.Vector3(
      Math.cos(a) * rad,
      (r() - 0.45) * span * 0.7,
      Math.sin(a) * rad * 1.5 - span * 0.2,
    );
    const size = span * (0.10 + r() * 0.09);
    const puff = new THREE.Sprite(this.puffMat.clone());
    puff.position.copy(at);
    puff.scale.setScalar(size * 0.4);
    this.group.add(puff);
    const flash = new THREE.Sprite(this.flashMat.clone());
    flash.position.copy(at);
    flash.scale.setScalar(size * 1.4);
    this.group.add(flash);
    this.live.push({ puff, flash, t: 0, size, drift: GROUND * 0.16 });
    return at;
  }

  update(dt, span) {
    this.next -= dt;
    if (this.next <= 0) {
      this.next = 0.18 + this.rand() * 0.55;
      this.burst(span);
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const b = this.live[i];
      b.t += dt;
      // The puff grows fast and then stops, and drifts aft on the airflow.
      const grow = 1 - Math.exp(-b.t * 3.4);
      b.puff.scale.setScalar(b.size * (0.4 + grow * 1.6));
      b.puff.position.z -= b.drift * dt;
      b.puff.material.opacity = 0.85 * Math.max(0, 1 - b.t / 7);
      b.flash.position.copy(b.puff.position);
      b.flash.scale.setScalar(b.size * (1.6 + b.t * 5));
      b.flash.material.opacity = Math.max(0, 1 - b.t * 3.2);
      if (b.t > 7) {
        this.group.remove(b.puff);
        this.group.remove(b.flash);
        b.puff.material.dispose();
        b.flash.material.dispose();
        this.live.splice(i, 1);
      }
    }
    // And the light stuff, climbing past her from below.
    this.nextTracer -= dt;
    if (this.nextTracer <= 0) {
      this.nextTracer = 0.04 + this.rand() * 0.11;
      const t = new THREE.Mesh(this.tracerGeo, this.tracerMat.clone());
      t.position.set((this.rand() - 0.5) * 1800, -DOWN * (0.55 + this.rand() * 0.3),
        (this.rand() - 0.5) * 1800);
      t.rotation.z = (this.rand() - 0.5) * 0.35;
      this.group.add(t);
      this.tracers.push({ m: t, t: 0, up: 320 + this.rand() * 260 });
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t += dt;
      t.m.position.y += t.up * dt;
      t.m.position.z -= GROUND * dt;
      t.m.material.opacity = Math.max(0, 0.8 * (1 - t.t / 1.5));
      if (t.t > 1.5) {
        this.group.remove(t.m);
        t.m.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  clear() {
    for (const b of this.live) {
      this.group.remove(b.puff); this.group.remove(b.flash);
      b.puff.material.dispose(); b.flash.material.dispose();
    }
    for (const t of this.tracers) { this.group.remove(t.m); t.m.material.dispose(); }
    this.live.length = 0;
    this.tracers.length = 0;
  }
}

export class BomberScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 30000);

    this.sky = skyDome('dusk');
    this.scene.add(this.sky);
    // Thin enough that the town three miles out is still a town, thick enough
    // that it has an end to it somewhere short of the horizon.
    this.scene.fog = new THREE.FogExp2(0x1b2230, 0.000105);

    // The city, hung under her. Everything down there lives in one group so the
    // whole town can be scrolled aft past a bomber that never moves -- which is
    // the only way to fly for four minutes without the camera having to chase
    // her across a world.
    this.city = buildCity();
    this.city.position.y = -DOWN;
    this.scene.add(this.city);
    this.fires = buildFires(this.city);
    this.lights = buildLights(this.city);

    // Night: a cold quarter moon over her shoulder, a very dark sky bounce, and
    // the fires underneath. The orange one points up, which is what makes a
    // night bomber look like a night bomber.
    // It is night, but this is a screen a commander is choosing an aeroplane
    // off: she has to be legible. So it is a clear night with the moon up,
    // which is the night Bomber Command hated and flew in anyway.
    // How far up the cutaway has lifted the scene, nought to one.
    this.hemiLift = 0;
    this.hemi = new THREE.HemisphereLight(0x8098b8, 0x3a3026, 1.50);
    this.scene.add(this.hemi);
    // The last of the daylight, low and off the beam, so she has a lit side
    // and a shaded one instead of reading as one flat green shape.
    this.moon = new THREE.DirectionalLight(0xffd9ac, 2.10);
    this.moon.position.set(-520, 200, -300);
    this.scene.add(this.moon);
    this.burn = new THREE.DirectionalLight(0xff8b3a, 0.95);
    this.burn.position.set(40, -300, 60);
    this.scene.add(this.burn);
    // The lamp in the bay. A night bomber is matt black underneath -- that is
    // the whole point of her -- so from below she is a silhouette and the work
    // going on in her bay is a shadow inside one. The armourers had an
    // inspection lamp on a lead for exactly this reason, and it is the only
    // thing that makes a bombing-up something you can watch.
    this.lamp = new THREE.PointLight(0xffd7a0, 0, 14, 2);
    this.scene.add(this.lamp);
    // And the draughtsman's lamp: a light over the viewer's shoulder, on only
    // while her skin is off. Lit by the scene alone the inside of her is back
    // to front -- the sun is on the far side of the fuselage and every frame,
    // seat and man in there shows as a silhouette against a bright sky.
    this.draw = new THREE.DirectionalLight(0xfff0dc, 0);
    this.scene.add(this.draw);

    this.flak = new Flak(this.scene);

    this.plane = null;
    this.id = null;
    this.span = 31;
    this.time = 0;
    this.phase = 'in';
    this.clock = 2.5;
    this.bay = 0;
    this.bombs = [];
    this.doors = [];
    this.rack = [];
    this.props = [];
    this.turrets = [];
    this.lays = [];
    this.hoist = [];
    this.hits = [];
    this.cut = false;
    // Looking down on her a little more than the shipyard looks down on a hull:
    // the target has to be in the frame as well, and at fourteen degrees the
    // city is edge-on and reads as a dark field rather than as a town.
    this.orbit = { yaw: 2.35, pitch: 0.42, range: 60, target: 60 };
    this.pointers = new Map();
    this.pinch = 0;
    this.ranged = false;
  }

  /** Put a different bomber over the target. */
  setBomber(id) {
    if (this.id === id) return;
    this.id = id;
    if (this.plane) {
      this.scene.remove(this.plane);
      this.plane.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.plane = heavyBomber(id);
    this.scene.add(this.plane);
    const spec = HEAVY[id] || HEAVY.lancaster;
    this.span = spec.span;
    this.cl = spec.cl;
    // Her own bay doors and her own stick, off the model rather than guessed:
    // `bombBay` registers the two doors as moving parts and the rack is the
    // bombs on the crutches inside.
    this.doors = (this.plane.userData.parts || [])
      .filter((q) => q.name === 'bayPort' || q.name === 'bayStbd');
    this.rack = this.plane.userData.rack || [];
    this.props = this.plane.userData.props || [];
    this.turrets = this.plane.userData.turrets || [];
    this.cut = false;
    this.clearBombs();
    this.flak.clear();
    this.phase = 'in';
    this.clock = 2.5;
    this.bay = 0;
    // The winch tackle over every station in her bay: two cables off the
    // carrier, which is how a four-thousand-pound cookie got up there. They
    // are only rigged while she is being bombed up.
    this.hoist = this.rack.map((cr) => {
      const home = cr.position.clone();
      const tack = new THREE.Group();
      tack.position.copy(home);
      tack.visible = false;
      this.plane.add(tack);
      for (const sd of [-1, 1]) {
        const c = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.012, 1, 5),
          new THREE.MeshLambertMaterial({ color: 0x8c8477 }),
        );
        c.position.set(sd * 0.13, 0, 0);
        tack.add(c);
      }
      return { cr, home, tack };
    });
    // And what each gunner is doing with his turret, which is his own to
    // decide: they do not all point the same way.
    this.lays = this.turrets.map((t, i) => ({ t, az: 0, el: 0, phase: i * 1.7 }));
    // Where the lamp hangs: just under the open bay, on the centreline.
    this.bayAt = this.hoist.length
      ? new THREE.Vector3(0, this.hoist[0].home.y - 0.9, spec.bay.z)
      : null;
    for (const cr of this.rack) cr.visible = true;
    this.orbit.range = this.orbit.target = this.fitRange();
    this.orbit.yaw = 2.35;
    this.orbit.pitch = 0.42;
    this.ranged = false;
    this.touched = false;
  }

  clearBombs() {
    for (const b of this.bombs) this.scene.remove(b.m);
    this.bombs.length = 0;
  }

  // -------------------------------------------------------------- camera --

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
        this.touched = true;
        o.yaw -= dx * 0.006;
        o.pitch = clamp(o.pitch + dy * 0.005, PITCH_MIN, PITCH_MAX);
      } else if (this.pointers.size === 2 && this.pinch > 0) {
        this.touched = true;
        const now = this.spread();
        o.target = clamp(o.target * (this.pinch / Math.max(1, now)),
          this.minRange(), this.maxRange());
        this.ranged = true;
        this.pinch = now;
      }
    };
    const up = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = 0;
      try { el.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    };
    const wheel = (e) => {
      e.preventDefault();
      this.touched = true;
      o.target = clamp(o.target * (1 + Math.sign(e.deltaY) * 0.12),
        this.minRange(), this.maxRange());
      this.ranged = true;
    };
    this.handlers = { down, move, up, wheel };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
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

  /** The range at which her whole span just fits the frame across. */
  fitRange() {
    const vHalf = (this.camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    return Math.max(this.span * 0.8, ((this.span * 0.60) / Math.tan(hHalf)) * 1.18);
  }

  minRange() { return this.span * 0.34; }
  maxRange() { return Math.max(this.span * 3.4, this.fitRange() * 1.8); }

  nudge(dir) { this.touched = true; this.orbit.yaw += dir * 0.35; }
  zoom(dir) {
    this.touched = true;
    this.orbit.target = clamp(this.orbit.target * (1 + dir * 0.12),
      this.minRange(), this.maxRange());
    this.ranged = true;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.plane && !this.ranged) this.orbit.target = this.fitRange();
  }

  update(dt) {
    this.time += dt;
    const o = this.orbit;
    o.range += (o.target - o.range) * Math.min(1, dt * 6);

    // The ground goes past. Wrapped on the block pitch: the town is a grid, so
    // sliding it aft by exactly one block puts it back where it started and
    // there is no seam to find. The town is three miles of it either way, so
    // nothing ever runs out of city underneath her either.
    if (this.city) {
      const blk = this.city.userData.block;
      this.city.position.z = ((this.city.position.z - GROUND * dt) % blk + blk) % blk - blk / 2;
    }
    // The fires breathe, and the searchlights sweep.
    for (const f of (this.fires?.userData.seats || [])) {
      const k = 0.72 + 0.28 * Math.sin(this.time * f.rate + f.phase);
      f.disc.material.opacity = 0.85 * k;
      f.hot.scale.setScalar(0.85 + 0.25 * k);
    }
    for (const b of (this.lights?.userData.beams || [])) {
      b.pivot.rotation.z = Math.sin(this.time * b.rate + b.phase) * b.lean;
      b.pivot.rotation.x = Math.cos(this.time * b.rate * 0.7 + b.phase) * b.lean * 0.6;
    }
    // A cutaway is a drawing, and a drawing is lit. With her skin off the
    // scene comes up a stop and a half, because the structure and the crew
    // inside her are grey-green in a fuselage at dusk and there is nothing in
    // there for the target to light.
    const lift = this.cut ? 1 : 0;
    this.hemiLift += (lift - this.hemiLift) * Math.min(1, dt * 3);
    this.hemi.intensity = 1.50 + this.hemiLift * 1.1;
    this.moon.intensity = 2.10 + this.hemiLift * 0.6;
    this.draw.intensity = this.hemiLift * 2.0;
    this.draw.position.copy(this.camera.position);

    // And the fires' light on her underside comes and goes with them.
    // Her belly is lit by the target and by nothing else, so it has to be lit
    // properly: from below she is otherwise a black shape against the dusk and
    // the open bay is a hole in it.
    this.burn.intensity = 0.88 + 0.18 * Math.sin(this.time * 1.7);

    this.runIn(dt);
    this.flak.update(dt, this.span);
    this.manTurrets(dt);
    // On while she is being bombed up, off the moment the doors start to shut.
    const want = this.phase === 'load' ? 5.5 : 0;
    this.lamp.intensity += (want - this.lamp.intensity) * Math.min(1, dt * 2.2);
    if (this.bayAt) this.lamp.position.copy(this.bayAt);

    // Bombing up happens under her belly, and the view she is shown from is
    // over her shoulder: from up there the whole evolution is behind the wing.
    // So if nobody has taken hold of the camera, it goes where the work is and
    // comes back afterwards. A captain who has moved it keeps it where he put
    // it -- being dragged somewhere else while you are looking at something is
    // worse than missing the loading.
    if (!this.touched) {
      // Low on the quarter rather than straight underneath: from dead below
      // she is a silhouette against the sky and the work in the bay is a
      // shadow inside a shadow.
      const want = this.phase === 'load' || this.phase === 'shutup' ? -0.24 : 0.42;
      o.pitch += (want - o.pitch) * Math.min(1, dt * 1.1);
    }

    // The camera walks round her, always looking at the aeroplane.
    const focusY = this.cl || 2.4;
    const cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
    this.camera.position.set(
      Math.sin(o.yaw) * cp * o.range,
      focusY + sp * o.range,
      Math.cos(o.yaw) * cp * o.range,
    );
    this.camera.lookAt(0, focusY, 0);
    this.sky.position.copy(this.camera.position);
  }

  /**
   * The bombing run, on a loop: doors open, the stick goes down one at a time,
   * doors shut, and a minute later she is over the target again.
   */
  runIn(dt) {
    // The airscrews, at the rate her own cruising speed decides.
    const b = BOMBERS[this.id];
    const turn = dt * (9 + ((b?.cruise || 200) / 300) * 22);
    for (const disc of this.props) disc.rotation.z += turn;

    // The run, as a loop of states: in (doors shut), doors open, the stick
    // going down one at a time, doors shut, home, bombed up again, and round
    // for another target. Written as states rather than as one clock counting
    // through negative numbers, because the only thing that has to be true is
    // that the doors are open before a bomb moves and shut after the last one
    // has stopped.
    this.clock -= dt;
    if (this.clock <= 0) {
      if (this.phase === 'in') { this.phase = 'open'; this.clock = 1.5; }
      else if (this.phase === 'open') { this.phase = 'drop'; this.clock = 0; }
      else if (this.phase === 'drop') {
        const cr = this.rack.find((c) => c.visible);
        if (cr) { cr.visible = false; this.release(cr); this.clock = 0.55; }
        else { this.phase = 'shut'; this.clock = 1.8; }
      } else if (this.phase === 'shut') { this.phase = 'home'; this.clock = 3.5; }
      else if (this.phase === 'home') {
        // Bombed up again. The armourers load from the after station forward,
        // because that is the end the trolley comes up to.
        this.phase = 'load';
        this.clock = 1.2;
        this.next = this.rack.length - 1;
        this.lift = 0;
      } else if (this.phase === 'load') {
        if (this.next >= 0) {
          this.rack[this.next].visible = true;
          this.next -= 1;
          this.lift = 0;
          this.clock = 1.2;
        } else { this.phase = 'shutup'; this.clock = 1.6; }
      } else { this.phase = 'in'; this.clock = 8; }
    }
    // Her doors, swung about their own hinges -- which is what `bombBay`
    // registered them as moving parts for. Open for the drop and open for the
    // loading, because a bomb goes in the same way it comes out.
    const working = this.phase === 'open' || this.phase === 'drop'
      || this.phase === 'load' || this.phase === 'shutup';
    this.bay += ((working ? 1 : 0) - this.bay) * Math.min(1, dt * 2.4);
    for (const d of this.doors) d.node.rotation.z = d.open * this.bay;

    // The bombing-up. Each one rises out of the dark under her on its winch,
    // swinging a little as it comes, and stops when its lugs meet the carrier.
    this.lift = Math.min(1.2, (this.lift || 0) + dt);
    for (const [i, h] of this.hoist.entries()) {
      const loading = this.phase === 'load';
      const rising = loading && i === this.next + 1;
      if (!loading) {
        h.cr.position.copy(h.home);
        h.cr.rotation.z = 0;
        h.tack.visible = false;
        continue;
      }
      if (rising) {
        // Three metres up, easing to a stop the way a hand winch does.
        const k = Math.min(1, this.lift / 1.1);
        const e = k * k * (3 - 2 * k);
        const fall = 3.0 * (1 - e);
        h.cr.position.set(h.home.x, h.home.y - fall, h.home.z);
        h.cr.rotation.z = Math.sin(this.time * 3.4) * 0.05 * (1 - e);
        h.tack.visible = true;
        for (const c of h.tack.children) {
          c.scale.y = Math.max(0.01, fall);
          c.position.y = -fall / 2;
        }
      } else {
        h.cr.position.copy(h.home);
        h.cr.rotation.z = 0;
        h.tack.visible = false;
      }
    }

    // And the bombs themselves: released with her speed, so in her own frame
    // they fall almost straight down and only slowly drift aft, nosing over as
    // they go the way a bomb does once the air gets hold of its tail.
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const q = this.bombs[i];
      q.t += dt;
      q.vy -= DROP_G * dt;
      q.m.position.y += q.vy * dt;
      q.m.position.z -= q.drag * dt;
      q.drag += 2.2 * dt;
      // Nose into the airstream. Relative to the air she is doing her own
      // forward speed and whatever she has picked up falling, and a bomb with
      // a tail on it points along that -- which is why a stick photographed
      // from the aeroplane above is a row of them all at the same angle.
      q.m.rotation.x = clamp(-Math.atan2(-q.vy, GROUND), -1.45, 0);
      if (q.m.position.y < -DOWN + 20) {
        this.strike(q.m.position.x, q.m.position.z);
        this.scene.remove(q.m);
        this.bombs.splice(i, 1);
      }
    }
    this.burstUpdate(dt);
  }

  /**
   * The gunners, laying their own turrets.
   *
   * Each of them takes the nearest burst and tries to put his guns on it, and
   * each of them is stopped by his own arcs: a mid-upper can follow one all
   * the way round but cannot depress into his own fuselage, and a Cheyenne
   * tail turret with forty-five degrees either side gives up on anything off
   * the beam. Nothing on any of these aeroplanes trains through her own tail.
   */
  manTurrets(dt) {
    const at = new THREE.Vector3();
    for (const q of this.lays) {
      const t = q.t;
      // The nearest thing worth looking at, or a slow search if there is not
      // one: a gunner does not sit still.
      let best = null;
      let near = Infinity;
      for (const b of this.flak.live) {
        const d = b.puff.position.lengthSq();
        if (d < near) { near = d; best = b.puff.position; }
      }
      let wantAz;
      let wantEl;
      if (best) {
        at.copy(best).sub(new THREE.Vector3(t.at[0], t.at[1], t.at[2]));
        wantAz = Math.atan2(at.x, at.z);
        wantEl = Math.atan2(at.y, Math.hypot(at.x, at.z));
      } else {
        q.phase += dt * 0.5;
        wantAz = t.home + Math.sin(q.phase) * t.arc * 0.7;
        wantEl = (t.up - t.down) * 0.5 + Math.sin(q.phase * 0.7) * (t.up + t.down) * 0.2;
      }
      // A turret is a heavy thing on a hydraulic motor: it swings at about a
      // right angle a second, not instantly.
      const RATE = 1.6;
      let d = wantAz - q.az;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      q.az += Math.max(-RATE * dt, Math.min(RATE * dt, d));
      q.el += Math.max(-RATE * dt, Math.min(RATE * dt, wantEl - q.el));
      layTurret(t, q.az, q.el);
    }
  }

  /** Her skin off, so what is inside her reads. */
  setCutaway(on) {
    this.cut = !!on;
    this.plane?.userData.cutaway?.(this.cut);
  }

  /** A bomb, copied off the crutch it was hanging on and let go. */
  release(cr) {
    cr.updateMatrixWorld(true);
    const at = new THREE.Vector3().setFromMatrixPosition(cr.matrixWorld);
    const m = cr.clone(true);
    m.visible = true;
    m.position.copy(at);
    m.rotation.set(0, 0, 0);
    this.scene.add(m);
    this.bombs.push({ m, t: 0, vy: -1.5, drag: 0 });
  }

  /** Where one went in: a flash on the roofs, and a new fire where it was. */
  strike(x, z) {
    this.hitGeo = this.hitGeo || new THREE.PlaneGeometry(1, 1);
    const flash = new THREE.Mesh(
      this.hitGeo,
      new THREE.MeshBasicMaterial({
        map: glowMap(), color: 0xffe3a8, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    flash.rotation.x = -Math.PI / 2;
    flash.position.set(x, -DOWN + 24, z);
    flash.scale.setScalar(14);
    this.scene.add(flash);
    this.hits.push({ m: flash, t: 0 });
  }

  burstUpdate(dt) {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      h.t += dt;
      h.m.scale.setScalar(14 + h.t * 260);
      h.m.material.opacity = Math.max(0, 1 - h.t * 1.6);
      if (h.t > 0.7) {
        this.scene.remove(h.m);
        h.m.material.dispose();
        this.hits.splice(i, 1);
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
