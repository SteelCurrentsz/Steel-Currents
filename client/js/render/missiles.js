// Guided missiles in flight: the BGM-109 Tomahawk, the RGM-84 Harpoon, the
// Standards an Aegis ship puts up (SM-2MR, SM-2ER, SM-3), the RUM-139 ASROC,
// the Sovremenny's P-270 Moskit and 9M38 Uragan, and the Slava's P-1000
// Vulcan, S-300F and OSA-M.
//
// A missile is drawn at its own size, which is small -- a Tomahawk is six and
// a quarter metres long and half a metre across -- and what makes it visible
// from anywhere is what it leaves behind it: off the rail, the booster's
// tongue of flame and a thick white column of smoke climbing away from the
// ship; after that, a thin grey line laid along its course a few metres over
// the sea, which hangs there long after it has gone. That line is how anyone
// watching tells where it came from and where it is going.
//
// One small group of meshes a missile, built from lathed profiles and plates,
// and the trail laid into the shared smoke pool (trails.js). Metres
// throughout; the missile points down +Z.

import * as THREE from '../../../vendor/three.module.js';

const MAT = {
  tomahawk: new THREE.MeshLambertMaterial({ color: 0xb9bdc2 }),
  harpoon: new THREE.MeshLambertMaterial({ color: 0xd9dbdc }),
  standard: new THREE.MeshLambertMaterial({ color: 0xeceeef }),
  asroc: new THREE.MeshLambertMaterial({ color: 0x9da39a }),
  moskit: new THREE.MeshLambertMaterial({ color: 0xa7ada3 }),
  uragan: new THREE.MeshLambertMaterial({ color: 0xc9cdc4 }),
  vulcan: new THREE.MeshLambertMaterial({ color: 0x9fa69b }),
  fort: new THREE.MeshLambertMaterial({ color: 0xd6d9d2 }),
  osa: new THREE.MeshLambertMaterial({ color: 0xc3c8bd }),
  nose: new THREE.MeshLambertMaterial({ color: 0x3a3d40 }),
  band: new THREE.MeshLambertMaterial({ color: 0xb08a2e }),
  fin: new THREE.MeshLambertMaterial({ color: 0x8e9297 }),
  flame: new THREE.MeshBasicMaterial({
    color: 0xffb35a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending,
  }),
  core: new THREE.MeshBasicMaterial({
    color: 0xfff1c8, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending,
  }),
};

/** Each missile as built, [length, radius, wing span, wing chord, fin span, where its wings are]. */
export const MISSILE_SHAPES = {
  t: { name: 'Tomahawk', len: 6.25, r: 0.26, span: 2.67, chord: 0.42, fin: 0.42, wingZ: 0.2, body: MAT.tomahawk },
  h: { name: 'Harpoon', len: 4.63, r: 0.17, span: 0.91, chord: 0.5, fin: 0.36, wingZ: 0.1, body: MAT.harpoon },
  // The Standards: long, slim and white, four long low strakes along the
  // body and four tail fins.
  s: { name: 'SM-2MR', len: 4.72, r: 0.17, span: 0.62, chord: 1.6, fin: 0.36, wingZ: -0.2, body: MAT.standard },
  e: { name: 'SM-2ER', len: 6.55, r: 0.17, span: 0.62, chord: 1.6, fin: 0.5, wingZ: 0.4, body: MAT.standard },
  b: { name: 'SM-3', len: 6.55, r: 0.17, span: 0.6, chord: 1.4, fin: 0.5, wingZ: 0.6, body: MAT.standard },
  // ASROC: a rocket motor with a torpedo in front of it, a fat blunt body.
  a: { name: 'ASROC', len: 4.9, r: 0.18, span: 0.7, chord: 0.3, fin: 0.42, wingZ: -0.6, body: MAT.asroc },
  // The Moskit: nearly ten metres of ramjet, fat and long, four short
  // cropped wings well aft and four fins behind them.
  n: { name: 'Moskit', len: 9.75, r: 0.38, span: 2.1, chord: 0.9, fin: 0.5, wingZ: -1.6, body: MAT.moskit },
  // The 9M38 Uragan: long low strakes along its body and four tail fins.
  g: { name: 'Uragan', len: 5.55, r: 0.2, span: 0.86, chord: 1.4, fin: 0.42, wingZ: -0.4, body: MAT.uragan },
  // The P-1000 Vulcan: nearly twelve metres of it, fat, with a pair of
  // swept wings that unfold off the tube and four fins at the tail.
  v: { name: 'Vulcan', len: 11.7, r: 0.44, span: 2.6, chord: 1.3, fin: 0.6, wingZ: -1.2, body: MAT.vulcan },
  // The S-300F: a long slim round with four small fins at its tail.
  f: { name: 'S-300F', len: 7.25, r: 0.26, span: 0.5, chord: 0.5, fin: 0.55, wingZ: -2.9, body: MAT.fort },
  // The OSA-M: short and slim, its four wings well forward.
  m: { name: 'OSA-M', len: 3.16, r: 0.105, span: 0.65, chord: 0.45, fin: 0.3, wingZ: 0.9, body: MAT.osa },
  // The Nimitz's: the Sea Sparrow, slim and white with its wings amidships;
  // the RAM, smaller still, finned at the tail; and the two her aircraft fire
  // at ships -- the Harpoon without its booster, and the Penguin.
  r: { name: 'Sea Sparrow', len: 3.66, r: 0.1, span: 0.8, chord: 0.5, fin: 0.42, wingZ: 0.4, body: MAT.standard },
  x: { name: 'RAM', len: 2.79, r: 0.064, span: 0.3, chord: 0.2, fin: 0.22, wingZ: -1.1, body: MAT.standard },
  q: { name: 'AGM-84', len: 3.84, r: 0.17, span: 0.91, chord: 0.5, fin: 0.36, wingZ: 0.1, body: MAT.harpoon },
  p: { name: 'Penguin', len: 3.0, r: 0.14, span: 1.0, chord: 0.4, fin: 0.3, wingZ: 0.0, body: MAT.harpoon },
  // And what a Hornet's pilot locks on and fires: the Sidewinder, slim with
  // its canards right forward; the AMRAAM, longer, its wings amidships; and
  // the Maverick, short and fat, with long low wings along it.
  w: { name: 'Sidewinder', len: 2.85, r: 0.064, span: 0.64, chord: 0.3, fin: 0.3, wingZ: 1.0, body: MAT.standard },
  u: { name: 'AMRAAM', len: 3.65, r: 0.089, span: 0.53, chord: 0.4, fin: 0.3, wingZ: 0.1, body: MAT.standard },
  k: { name: 'Maverick', len: 2.49, r: 0.15, span: 0.72, chord: 1.0, fin: 0.22, wingZ: -0.3, body: MAT.harpoon },
};
/** A missile code the client has no shape for is drawn as a Harpoon. */
const shapeOf = (k) => (MISSILE_SHAPES[k] ? k : 'h');

function lathe(profile, seg = 14) {
  const geo = new THREE.LatheGeometry(profile.map(([z, r]) => new THREE.Vector2(r, z)), seg);
  geo.rotateX(Math.PI / 2);
  return geo;
}

/** A plate standing off the body at `angle` round it: a wing or a fin. */
function plate(angle, r0, span, chord, z, t = 0.03) {
  const geo = new THREE.BoxGeometry(t, span, chord);
  geo.translate(0, r0 + span / 2, z);
  geo.rotateZ(angle);
  return geo;
}

const GEO = new Map();
function geometryOf(k) {
  k = shapeOf(k);
  if (GEO.has(k)) return GEO.get(k);
  const S = MISSILE_SHAPES[k];
  const L = S.len, R = S.r;
  const body = lathe([
    [-L / 2, 0], [-L / 2, R * 0.82], [-L / 2 + 0.12, R], [L / 2 - R * 3.2, R], [L / 2 - R * 1.6, R * 0.82],
    [L / 2 - R * 0.5, R * 0.42], [L / 2, 0],
  ]);
  const nose = lathe([[L / 2 - R * 1.65, 0], [L / 2 - R * 1.65, R * 0.84], [L / 2 - R * 0.5, R * 0.43], [L / 2, 0]]);
  const band = lathe([[L / 2 - R * 4.2, 0], [L / 2 - R * 4.2, R * 1.02], [L / 2 - R * 3.6, R * 1.02], [L / 2 - R * 3.6, 0]]);
  // Its wings: a Tomahawk's pair, out flat either side; a Harpoon's four,
  // cruciform. Its tail fins: four, in an X.
  const wings = k === 't'
    ? [plate(Math.PI / 2, R * 0.6, S.span / 2, S.chord, S.wingZ, 0.04), plate(-Math.PI / 2, R * 0.6, S.span / 2, S.chord, S.wingZ, 0.04)]
    : [0, 1, 2, 3].map((i) => plate(Math.PI / 4 + (i * Math.PI) / 2, R * 0.8, S.span / 2 - R, S.chord, S.wingZ));
  const fins = [0, 1, 2, 3].map((i) => plate(Math.PI / 4 + (i * Math.PI) / 2, R * 0.7, S.fin, 0.34, -L / 2 + 0.3));
  // The flame out of its tail: a bright core inside a longer glow, both
  // pointing aft; scaled each frame with how hard the motor is burning.
  const flame = new THREE.ConeGeometry(R * 1.05, 1, 10, 1, true);
  flame.rotateX(-Math.PI / 2);
  flame.translate(0, 0, -0.5);
  const core = new THREE.ConeGeometry(R * 0.6, 1, 8, 1, true);
  core.rotateX(-Math.PI / 2);
  core.translate(0, 0, -0.5);
  const out = { body, nose, band, wings, fins, flame, core };
  GEO.set(k, out);
  return out;
}

function buildMissile(k) {
  k = shapeOf(k);
  const S = MISSILE_SHAPES[k];
  const G = geometryOf(k);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(G.body, S.body));
  g.add(new THREE.Mesh(G.nose, MAT.nose));
  g.add(new THREE.Mesh(G.band, MAT.band));
  for (const w of G.wings) g.add(new THREE.Mesh(w, MAT.fin));
  for (const f of G.fins) g.add(new THREE.Mesh(f, MAT.fin));
  const flame = new THREE.Mesh(G.flame, MAT.flame);
  const core = new THREE.Mesh(G.core, MAT.core);
  flame.position.z = core.position.z = -S.len / 2;
  flame.renderOrder = core.renderOrder = 3;
  g.add(flame, core);
  g.userData = { flame, core, k };
  return g;
}

/** How long a missile's booster burns after it leaves its rail, in seconds. */
export const BOOST = 2.6;

export class Missiles {
  constructor(scene, trails) {
    this.scene = scene;
    this.trails = trails;
    this.live = new Map();
    this.spare = {};
    for (const k of Object.keys(MISSILE_SHAPES)) this.spare[k] = [];
  }

  /** Put a missile group into the scene, from the spares if there is one. */
  take(k) {
    k = shapeOf(k);
    const g = this.spare[k].pop() || buildMissile(k);
    g.visible = true;
    this.scene.add(g);
    return g;
  }

  /**
   * The missiles this frame, interpolated, in world coordinates: { i, x, y,
   * z, h, p, k, a, ag }. Each one is put where it is and pointed along its
   * course, its flame lit while its motor burns, and its trail laid from where
   * it was last frame to where it is now.
   */
  update(list, dt) {
    const seen = new Set();
    for (const m of list) {
      seen.add(m.i);
      let e = this.live.get(m.i);
      if (!e) {
        e = { g: this.take(m.k), last: null, k: shapeOf(m.k), lay: 0 };
        this.live.set(m.i, e);
      }
      const g = e.g;
      // Aboard: in its box or its canister, out of sight.
      g.visible = !m.a;
      if (m.a) { e.last = null; continue; }
      g.position.set(m.x, m.y, m.z);
      g.rotation.set(-(m.p || 0), m.h || 0, 0, 'YXZ');
      const S = MISSILE_SHAPES[e.k];
      const boost = (m.ag ?? 9) < BOOST;
      const flicker = 0.85 + Math.random() * 0.3;
      const fl = (boost ? 5.5 : 1.6) * flicker;
      g.userData.flame.scale.set(boost ? 1.5 : 0.8, boost ? 1.5 : 0.8, fl);
      g.userData.core.scale.set(1, 1, fl * 0.55);
      // The trail: a puff every few metres along the way it came, thick and
      // white off the booster, thin and grey after.
      const tail = { x: m.x - Math.sin(m.h) * Math.cos(m.p) * S.len * 0.55, y: m.y - Math.sin(m.p) * S.len * 0.55, z: m.z - Math.cos(m.h) * Math.cos(m.p) * S.len * 0.55 };
      if (e.last && this.trails) {
        const dx = tail.x - e.last.x, dy = tail.y - e.last.y, dz = tail.z - e.last.z;
        const run = Math.hypot(dx, dy, dz);
        const gap = boost ? 2.2 : 4.5;
        const n = Math.min(boost ? 12 : 6, Math.floor((run + e.lay) / gap));
        for (let i = 1; i <= n; i++) {
          const u = i / n;
          this.trails.puff(e.last.x + dx * u, e.last.y + dy * u, e.last.z + dz * u,
            (Math.random() - 0.5) * 0.6, (Math.random() - 0.3) * 0.5, (Math.random() - 0.5) * 0.6, boost ? {
              life: 9 + Math.random() * 4, size: 2.4 + Math.random(), grow: 4.2, burn: 0.06, tone: 0.9,
            } : {
              life: 8 + Math.random() * 3, size: 1.6 + Math.random() * 0.5, grow: 2.6, burn: 0.02, tone: 0.8,
            });
        }
        e.lay = n ? 0 : e.lay + run;
      }
      e.last = tail;
    }
    for (const [i, e] of this.live) {
      if (seen.has(i)) continue;
      this.scene.remove(e.g);
      this.spare[e.k].push(e.g);
      this.live.delete(i);
    }
  }

  /**
   * The cloud a missile leaves its launcher in: the booster lighting off, the
   * box or canister full of fire for an instant, and a great deal of white
   * smoke rolling over the deck.
   */
  launch(x, y, z) {
    if (!this.trails) return;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 5;
      this.trails.puff(x + (Math.random() - 0.5) * 2, y + Math.random() * 1.5, z + (Math.random() - 0.5) * 2,
        Math.cos(a) * s, Math.random() * 2.5, Math.sin(a) * s, {
          life: 6 + Math.random() * 5, size: 3 + Math.random() * 2.5, grow: 5, burn: i < 6 ? 0.12 : 0, tone: 0.92,
        });
    }
  }
}
