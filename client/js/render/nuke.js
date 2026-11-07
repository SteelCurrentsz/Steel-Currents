// An atomic burst, as it is seen.
//
// In three stages, the order it happens in (see shared/nuke.js):
//
//   1. The flash and the fireball, in the first instant: a flash that whites
//      out the sky and lights every ship on the sea from one side, and a
//      fireball four hundred metres across, white at its heart and going
//      through yellow and orange to a dull, boiling red as it cools.
//   2. The shock, in seconds: a ring of white racing out across the water
//      at many times the speed of sound, the spray dome heaved up off the
//      sea over the burst and slumping back into the base surge, and the
//      condensation cloud blown up behind the shock and gone again.
//   3. The wave: the water the burst shoved aside, coming back as a ring of
//      heavy surface water a great deal slower than the shock -- steep and
//      tall close in, low further out, and nothing like a tsunami.
//
// And over all of it the stem and the cap of the mushroom, climbing for the
// rest of the action, lit red from underneath and going grey as it climbs.
//
// The ring is where the simulation's shock front is and the wave is where
// its wave is -- both read the same functions -- so a ship is seen to be
// struck the moment the white water reaches her, and rolled when the sea does.
//
// Everything here is drawn in one place, the burst point, and goes when it is
// done: a battle may see one of these, and the scene pays nothing for it until
// then.
import * as THREE from '../../../vendor/three.module.js';
import { NUKE, nukeFront, nukeWave, waveHeight } from '../../../shared/nuke.js';

/** A soft round puff, for the cloud: made once, on a canvas. */
let PUFF = null;
function puffTexture() {
  if (PUFF) return PUFF;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  // Lumpy rather than a perfect disc: three overlapping blobs.
  for (const [x, y, r] of [[64, 64, 60], [48, 56, 40], [80, 72, 38]]) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  PUFF = new THREE.CanvasTexture(c);
  PUFF.colorSpace = THREE.SRGBColorSpace;
  return PUFF;
}

/**
 * Billboards, as one instanced batch: each a puff of cloud at a point, so
 * big, so bright, in its own colour. Faces the eye in the vertex shader.
 */
function puffBatch(max) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const at = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);   // xyz, size
  const col = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);  // rgb, alpha
  at.setUsage(THREE.DynamicDrawUsage);
  col.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('at', at);
  geo.setAttribute('tint', col);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: puffTexture() } },
    vertexShader: /* glsl */`
      attribute vec4 at;
      attribute vec4 tint;
      varying vec2 vUv;
      varying vec4 vTint;
      void main() {
        vUv = uv;
        vTint = tint;
        vec4 mv = modelViewMatrix * vec4(at.xyz, 1.0);
        mv.xy += position.xy * at.w;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      varying vec2 vUv;
      varying vec4 vTint;
      void main() {
        float a = texture2D(map, vUv).a * vTint.a;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vTint.rgb, a);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, at, col, n: 0, max };
}

function setPuff(b, x, y, z, size, r, g, bl, a) {
  if (b.n >= b.max) return;
  const i = b.n++;
  b.at.array.set([x, y, z, size], i * 4);
  b.col.array.set([r, g, bl, a], i * 4);
}

// The fireball's colour as it cools, white to a dull red, by how far it has.
const HOT = [
  [1.00, 1.00, 0.96], [1.00, 0.93, 0.62], [1.00, 0.66, 0.24], [0.92, 0.34, 0.10], [0.46, 0.14, 0.06],
];
function heat(k, out) {
  const u = Math.max(0, Math.min(0.9999, k)) * (HOT.length - 1);
  const i = Math.floor(u), f = u - i;
  for (let c = 0; c < 3; c++) out[c] = HOT[i][c] + (HOT[i + 1][c] - HOT[i][c]) * f;
  return out;
}

/** A small, repeatable pseudo-random number for puff `i` of a burst. */
const hash = (i, k) => {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

export class Nukes {
  constructor(scene) {
    this.scene = scene;
    this.live = [];
    this.tmp = [0, 0, 0];
  }

  /**
   * A burst at (x, y, z). `land` when it went off on the ground rather than
   * the sea: no wall of water then, and a dirtier cloud.
   */
  add(x, y, z, land = false) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    this.scene.add(g);
    // The fireball.
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(1, 40, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, fog: false }),
    );
    ball.position.y = Math.max(0, y);
    g.add(ball);
    // The glow round it, and the flash: additive, so it only ever brightens.
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: puffTexture(), color: 0xfff2d0, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
    }));
    glow.position.y = Math.max(0, y) + 40;
    glow.renderOrder = 9;
    g.add(glow);
    // What the flash lights: everything on the sea, from the burst.
    const lamp = new THREE.PointLight(0xfff0d0, 0, 0, 2);
    lamp.position.y = 300;
    g.add(lamp);
    // The shock on the water, a ring of white.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1, 160, 1),
      new THREE.MeshBasicMaterial({
        color: 0xf4f8fb, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 1.2;
    g.add(ring);
    // The wave: a wall of water standing up off the sea, its face leaning
    // out the way it is going, and the foam of its crest breaking behind it.
    const wave = new THREE.Mesh(
      new THREE.CylinderGeometry(0.994, 1, 1, 180, 1, true),
      new THREE.MeshLambertMaterial({
        color: 0x5f8aa0, emissive: 0x1d2c36, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    wave.visible = !land;
    g.add(wave);
    const foam = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1, 180, 1),
      new THREE.MeshBasicMaterial({ color: 0xeef4f7, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
    );
    foam.rotation.x = -Math.PI / 2;
    foam.visible = !land;
    g.add(foam);
    // The spray dome: the sea over the burst heaved up into a white dome in
    // the first seconds, and slumping back into the base surge.
    const spray = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({
        color: 0xf3f6f8, emissive: 0x3c444a, transparent: true, opacity: 0, depthWrite: false,
      }),
    );
    spray.visible = false;
    g.add(spray);
    // The condensation cloud: a dome of white blown up off the sea behind the
    // shock, and gone in a couple of seconds.
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({
        color: 0xffffff, emissive: 0x6a7076, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    g.add(dome);
    // The cloud: the column, the cap, the skirt round the foot of it.
    const puffs = puffBatch(900);
    g.add(puffs.mesh);
    this.live.push({ g, ball, glow, lamp, ring, wave, foam, spray, dome, puffs, y: Math.max(0, y), t: 0, land });
    this.flash = 1;
  }

  /** How bright the whole sky is, 0..1, for whatever is drawing a white-out over the screen. */
  get whiteOut() { return this.flash || 0; }

  update(dt, camera) {
    this.flash = Math.max(0, (this.flash || 0) - dt * 0.9);
    for (let i = this.live.length - 1; i >= 0; i--) {
      const n = this.live[i];
      n.t += dt;
      const t = n.t;
      if (t > NUKE.life) {
        this.scene.remove(n.g);
        n.g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
        this.live.splice(i, 1);
        continue;
      }
      // The fireball: out to its full size in a second and a half, then
      // lifting off the sea as it cools, until it is the heart of the cap.
      const grow = 1 - Math.exp(-t / 0.45);
      const rise = Math.max(0, t - 1.5);
      const capY = n.y + NUKE.fireball * 0.8 + 3200 * (1 - Math.exp(-rise / 26));
      const R = NUKE.fireball * grow * (1 + Math.min(0.6, rise * 0.03));
      n.ball.scale.setScalar(Math.max(1, R));
      n.ball.position.y = Math.max(n.y + R * 0.6, t < 1.5 ? n.y + R * 0.6 : capY);
      heat(Math.min(1, t / 9), this.tmp);
      n.ball.material.color.setRGB(this.tmp[0], this.tmp[1], this.tmp[2]);
      n.ball.material.opacity = Math.max(0, 1 - Math.max(0, t - 6) / 10);
      n.ball.visible = n.ball.material.opacity > 0.01;
      // The flash and the glow.
      const f = Math.exp(-t / 0.35) + 0.25 * Math.exp(-t / 4);
      n.glow.scale.setScalar(NUKE.fireball * (4 + 10 * Math.exp(-t / 0.5)));
      n.glow.position.y = n.ball.position.y;
      n.glow.material.opacity = Math.min(1, f);
      n.lamp.intensity = 3e7 * Math.exp(-t / 0.6) + 2e6 * Math.exp(-t / 5);
      n.lamp.position.y = n.ball.position.y;
      // The shock on the water, where the simulation has it.
      const front = nukeFront(t);
      n.ring.scale.setScalar(Math.max(1, front));
      n.ring.material.opacity = 0.95 * Math.max(0, 1 - t / 18);
      n.ring.visible = n.ring.material.opacity > 0.01;
      // Stage 2's water: the spray dome, heaved up off the sea in a couple
      // of seconds and slumping back into the surge over the next dozen.
      if (!n.land) {
        const up = 1 - Math.exp(-t / 0.9);
        const slump = Math.max(0, t - 4);
        const sr = Math.max(1, 720 * up + slump * 25);
        const sh = Math.max(1, 1050 * up * Math.exp(-slump / 6));
        n.spray.scale.set(sr, sh, sr);
        n.spray.material.opacity = Math.min(0.92, t * 2) * Math.max(0, 1 - Math.max(0, t - 6) / 10);
        n.spray.visible = n.spray.material.opacity > 0.01;
      }
      // Stage 3: the wave, where the simulation has it, slower than the shock
      // by a long way: tall close in, and lower the further it has run. Drawn
      // a little taller than it is, or at the range a battle is watched from
      // a twenty-metre sea is a line.
      if (!n.land) {
        const wr = Math.max(1, nukeWave(t));
        const wh = waveHeight(wr) * 1.6;
        n.wave.scale.set(wr, wh, wr);
        n.wave.position.y = wh / 2 - 2;
        const fade = Math.max(0, 1 - t / NUKE.life) * Math.min(1, t * 2);
        n.wave.material.opacity = 0.9 * fade;
        n.wave.visible = n.wave.material.opacity > 0.01;
        n.foam.scale.setScalar(wr);
        n.foam.position.y = 1.4;
        n.foam.material.opacity = 0.8 * fade;
        n.foam.visible = n.wave.visible;
      }
      // The condensation cloud, out behind the shock and gone.
      const dr = Math.max(1, front * 0.75);
      n.dome.scale.set(dr, dr * 0.55, dr);
      n.dome.material.opacity = t < 0.4 ? 0 : 0.55 * Math.max(0, Math.sin(Math.min(Math.PI, (t - 0.4) / 3.2 * Math.PI)));
      n.dome.visible = n.dome.material.opacity > 0.01;
      // The cloud.
      this.cloud(n, t, capY, R);
    }
  }

  /** The column and the cap and the skirt, puff by puff, for this moment. */
  cloud(n, t, capY, R) {
    const b = n.puffs;
    b.n = 0;
    if (t < 0.8) { b.mesh.geometry.instanceCount = 0; return; }
    const c = this.tmp;
    const age = t - 0.8;
    const fade = Math.min(1, age / 2.5);
    const dirt = n.land ? [0.58, 0.48, 0.40] : [0.86, 0.86, 0.84];
    // The cap: a ring of turning cloud round the fireball, rolling over on
    // itself the way a vortex ring does, and widening as it climbs.
    const capR = R * 0.9 + 900 * (1 - Math.exp(-age / 30));
    for (let i = 0; i < 360; i++) {
      const a = hash(i, 1) * Math.PI * 2;
      const roll = hash(i, 2) * Math.PI * 2 + age * 0.25;
      const tube = capR * (0.42 + 0.2 * hash(i, 3));
      const rr = capR * 0.75 + Math.cos(roll) * tube;
      const y = capY + Math.sin(roll) * tube * 0.7;
      const size = capR * (0.55 + 0.45 * hash(i, 4));
      // Lit from within at first, and cooling to cloud.
      const hot = Math.max(0, 1 - age / 14) * (0.5 + 0.5 * Math.cos(roll));
      heat(0.35 + age / 20, c);
      const k = Math.min(1, hot * 1.4);
      setPuff(b, Math.cos(a) * rr, y, Math.sin(a) * rr, size,
        dirt[0] * (1 - k) + c[0] * k, dirt[1] * (1 - k) + c[1] * k, dirt[2] * (1 - k) + c[2] * k,
        0.55 * fade);
    }
    // The stem: drawn up off the sea into the cap, narrower in the middle.
    const top = capY - capR * 0.3;
    const base = n.y;
    const stemN = 220;
    for (let i = 0; i < stemN; i++) {
      const u = hash(i, 5);
      const y = base + (top - base) * Math.min(1, u * Math.min(1, age / 6));
      const waist = 0.55 + 0.45 * Math.abs(u - 0.5) * 2;
      const rr = (NUKE.fireball * 0.5 + 120) * waist * Math.sqrt(hash(i, 6));
      const a = hash(i, 7) * Math.PI * 2 + age * 0.1 * (u - 0.5);
      const size = 260 + 220 * hash(i, 8);
      const hot = Math.max(0, 1 - age / 8) * (1 - u);
      heat(0.5 + age / 16, c);
      setPuff(b, Math.cos(a) * rr, y, Math.sin(a) * rr, size,
        dirt[0] * (1 - hot) + c[0] * hot, dirt[1] * (1 - hot) + c[1] * hot, dirt[2] * (1 - hot) + c[2] * hot,
        0.5 * fade);
    }
    // The skirt: spray and cloud rolling out along the sea at the foot of the
    // column -- the base surge -- slower than the shock and much slower than
    // the flash.
    const surge = Math.min(nukeFront(t) * 0.7, 2600 * (1 - Math.exp(-age / 14)));
    for (let i = 0; i < 300; i++) {
      const a = hash(i, 9) * Math.PI * 2;
      const rr = surge * (0.55 + 0.45 * hash(i, 10));
      const size = 180 + 240 * hash(i, 11) + surge * 0.08;
      const alpha = 0.5 * Math.max(0, 1 - age / 50) * Math.min(1, age / 2);
      const w = n.land ? dirt : [0.94, 0.95, 0.96];
      setPuff(b, Math.cos(a) * rr, n.y + 40 + 120 * hash(i, 12), Math.sin(a) * rr, size, w[0], w[1], w[2], alpha);
    }
    b.mesh.geometry.instanceCount = b.n;
    b.at.needsUpdate = true;
    b.col.needsUpdate = true;
  }
}
