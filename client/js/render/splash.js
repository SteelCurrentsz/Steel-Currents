// Shell and bomb splashes: the column of water a round throws up when it
// misses, and the swell that runs out from it.
//
// These are meshes rather than billboards. A splash is the one effect in a
// naval action that a captain reads for *information* -- how far off the salvo
// fell, and whether it was straddling -- so it has to sit in the world
// convincingly from any angle, including from a masthead looking straight down
// at it. A sprite column is a painted flat that turns to face you; a real cone
// of water stays where the shell landed.
//
// Everything here is driven off one number: the bore of the gun that fired.
//
//   bore     column      swell        who fires it
//   127 mm    ~20 m      ~110 m       a destroyer's 5-inch
//   203 mm    ~35 m      ~190 m       a heavy cruiser's 8-inch
//   356 mm    ~63 m      ~350 m       a King George V's 14-inch
//   460 mm    ~83 m      ~460 m       Yamato
//
// Which is about right: a 5-inch splash is a spout you can lose in the swell
// and an 18-inch splash is taller than the ship that fired it, which is what
// made spotting the fall of shot possible at all.

import * as THREE from '../../../vendor/three.module.js';

/** The reference bore all the scaling hangs off: a 5-inch destroyer gun. */
const REF_BORE = 127;

/**
 * How big a splash a bore throws.
 *
 * Height goes up a little faster than the bore because the shell's mass goes
 * up as its cube, and the water thrown is mass times velocity; the exponents
 * are fitted to the four figures in the table above rather than derived, which
 * is honest about what they are.
 */
export function splashSize(bore = REF_BORE) {
  const k = Math.max(0.35, bore / REF_BORE);
  return {
    height: 20 * Math.pow(k, 1.1),
    radius: 4.2 * Math.pow(k, 1.05),
  };
}

/** A soft vertical gradient: dense at the foot of the column, mist at the head. */
function columnTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0.00, 'rgba(255,255,255,0.00)'); // the very base, hidden in the sea
  g.addColorStop(0.10, 'rgba(255,255,255,0.80)');
  g.addColorStop(0.42, 'rgba(240,248,255,0.46)');
  g.addColorStop(0.74, 'rgba(228,240,252,0.20)');
  g.addColorStop(1.00, 'rgba(220,236,250,0.00)'); // torn to mist at the top
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 128);
  // A little streaking across the column, so it is water and not a cone.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.10 + Math.random() * 0.35})`;
    ctx.fillRect(Math.random() * 16, Math.random() * 128, 1 + Math.random() * 3, 5 + Math.random() * 30);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/**
 * One splash's worth of geometry, built once and shared.
 *
 * The column is an open cone standing on the water, drawn from both sides so
 * you can see the far wall of it through the near one -- which is what stops
 * it reading as a solid traffic cone.
 */
function makeGeometry() {
  const column = new THREE.CylinderGeometry(0.42, 1, 1, 20, 5, true);
  column.translate(0, 0.5, 0);
  // Water does not come up as a cone. The wall is pushed in and out around the
  // circumference and up the height, so the silhouette is ragged from every
  // bearing -- and since each splash is turned to a random heading, the same
  // shape never reads as the same shape twice.
  const p = column.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    const a = Math.atan2(x, z);
    const wob = 1
      + 0.20 * Math.sin(a * 3 + y * 7.1)
      + 0.13 * Math.sin(a * 5 - y * 4.3)
      + 0.09 * Math.sin(a * 8 + y * 11.7);
    p.setX(i, x * wob);
    p.setZ(i, z * wob);
  }
  column.computeVertexNormals();
  // The crown: the collar of water thrown out sideways at the moment of impact,
  // leaning outwards. Short, wide, and gone in under a second.
  const crown = new THREE.CylinderGeometry(2.1, 0.75, 1, 20, 1, true);
  crown.translate(0, 0.5, 0);
  return { column, crown };
}

/**
 * The swell: a band of water with a raised crest that runs outward.
 *
 * Built by hand rather than taken from `RingGeometry` because that is flat, and
 * a flat ring seen from a bridge is an invisible ring. Three rings of vertices
 * -- trough, crest, trough -- give it a section, so it catches the light and
 * reads as water moving rather than a decal on it. Scaled wide in x and z and
 * separately in y, so the wave can spread without the crest growing taller.
 */
function makeSwellGeometry(seg = 56) {
  const pos = [];
  const uv = [];
  const idx = [];
  const bands = [[0.80, 0], [1.0, 1], [1.22, 0]];
  for (let b = 0; b < bands.length; b++) {
    const [r, y] = bands[b];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos.push(Math.sin(a) * r, y, Math.cos(a) * r);
      uv.push(i / seg, b / (bands.length - 1));
    }
  }
  const row = seg + 1;
  for (let b = 0; b < bands.length - 1; b++) {
    for (let i = 0; i < seg; i++) {
      const a = b * row + i;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Foam along the crest and nothing at the troughs. */
function swellTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0.00, 'rgba(255,255,255,0)');
  g.addColorStop(0.38, 'rgba(246,252,255,0.40)');
  g.addColorStop(0.52, 'rgba(255,255,255,0.78)');
  g.addColorStop(0.70, 'rgba(238,248,255,0.30)');
  g.addColorStop(1.00, 'rgba(226,240,252,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 64);
  return new THREE.CanvasTexture(c);
}

// A full salvo from a battleship is nine shells and a fleet action has several
// ships firing at once, so the pool has to take a couple of straddles at a time
// without a splash going missing. They are cheap: one shared geometry, one draw
// call each, and culled when they are over the horizon.
const COLUMNS = 30;
const SWELLS = 72;

export class Splashes {
  /**
   * `intensity` is the graphics quality dial the rest of the effects use: it
   * thins the number of swells per splash on a slow machine, never the column,
   * because the column is the part that carries the information.
   */
  constructor(scene, intensity = 1) {
    this.scene = scene;
    this.intensity = intensity;
    const geo = makeGeometry();
    this.colTex = columnTexture();
    this.swellTex = swellTexture();
    this.swellGeo = makeSwellGeometry();

    const colMat = new THREE.MeshBasicMaterial({
      map: this.colTex, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, color: 0xeaf4ff,
    });
    const swellMat = new THREE.MeshBasicMaterial({
      map: this.swellTex, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, color: 0xe8f3ff,
    });

    this.colPool = [];
    this.crownPool = [];
    this.swellPool = [];
    for (let i = 0; i < COLUMNS; i++) {
      const m = new THREE.Mesh(geo.column, colMat.clone());
      m.visible = false; m.renderOrder = 3;
      scene.add(m); this.colPool.push(m);
      const c = new THREE.Mesh(geo.crown, colMat.clone());
      c.visible = false; c.renderOrder = 3;
      scene.add(c); this.crownPool.push(c);
    }
    for (let i = 0; i < SWELLS; i++) {
      const m = new THREE.Mesh(this.swellGeo, swellMat.clone());
      m.visible = false; m.renderOrder = 2;
      scene.add(m); this.swellPool.push(m);
    }
    this.columns = [];
    this.swells = [];
  }

  /**
   * A round in the water at (x, z).
   *
   * `bore` is the gun's calibre in millimetres; a torpedo or a bomb passes the
   * equivalent bore for the size of hole it makes in the sea.
   */
  splash(x, z, bore = REF_BORE) {
    const { height, radius } = splashSize(bore);
    const col = this.colPool.pop();
    if (col) {
      const crown = this.crownPool.pop();
      col.position.set(x, 0, z);
      col.rotation.y = Math.random() * Math.PI * 2;
      col.material.opacity = 1;
      col.visible = true;
      if (crown) {
        crown.position.set(x, 0, z);
        crown.rotation.y = Math.random() * Math.PI * 2;
        crown.material.opacity = 0.6;
        crown.visible = true;
      }
      // A tall column takes longer to go up and much longer to come down: an
      // 18-inch splash stands for the better part of four seconds, which is
      // what makes it possible to spot a straddle at twenty thousand yards.
      const rise = 0.22 + height * 0.006;
      this.columns.push({
        col, crown, x, z, h: height, r: radius,
        life: 0, rise, ttl: rise + 1.3 + height * 0.022,
      });
    }
    // And the swell that runs out from it. Three crests, thrown in order, each
    // one lower and slower than the one in front: the size of the wave follows
    // the size of the splash, because it is the same water.
    const rings = Math.max(1, Math.round(3 * this.intensity));
    for (let i = 0; i < rings; i++) {
      this.swell(x, z, radius, height, i);
    }
  }

  swell(x, z, radius, height, i) {
    const m = this.swellPool.pop();
    if (!m) return;
    m.position.set(x, 0.35, z);
    m.rotation.y = Math.random() * Math.PI * 2;
    m.visible = true;
    m.material.opacity = 0;
    this.swells.push({
      m, x, z,
      delay: i * 0.16,
      r0: radius * (1.15 + i * 0.5),
      // Deep-water waves run at a speed set by their length, and a bigger
      // splash makes a longer wave; this is that, flattened into something a
      // battle can be read through.
      speed: 9 + height * 0.16 - i * 1.1,
      crest: Math.max(0.2, height * 0.038) * (1 - i * 0.22),
      peak: 0.34 - i * 0.075,
      life: 0,
      ttl: 1.9 + height * 0.032 + i * 0.25,
    });
  }

  update(dt) {
    for (let i = this.columns.length - 1; i >= 0; i--) {
      const c = this.columns[i];
      c.life += dt;
      const k = c.life / c.ttl;
      if (k >= 1) {
        c.col.visible = false; this.colPool.push(c.col);
        if (c.crown) { c.crown.visible = false; this.crownPool.push(c.crown); }
        this.columns.splice(i, 1);
        continue;
      }
      // Up fast, easing off at the top of its throw; then it sags back into the
      // sea rather than shrinking, which is the difference between water
      // falling and a cone being scaled down.
      let f;
      let spread;
      if (c.life < c.rise) {
        const u = c.life / c.rise;
        f = Math.sin(u * Math.PI * 0.5);
        spread = 0.55 + u * 0.45;
      } else {
        const u = (c.life - c.rise) / (c.ttl - c.rise);
        f = (1 - u) * (1 - u * u * 0.3);
        spread = 1 + u * 0.5;
        // And it goes back where it came from: the foot of the column settles
        // under the surface as it falls, so what is left at the end is a patch
        // of disturbed water rather than a slab standing on it.
        c.col.position.y = -c.h * 0.05 * u;
      }
      c.col.scale.set(c.r * spread, Math.max(0.6, c.h * f), c.r * spread);
      c.col.material.opacity = 0.9 * (1 - k) * (1 - k * k);
      if (c.crown) {
        // The collar is thrown out in the first fifth of a second and is gone
        // before the column has finished rising.
        const u = Math.min(1, c.life / (c.rise * 1.6));
        c.crown.scale.set(c.r * (1 + u * 2.6), c.h * 0.16 * (1 - u * 0.5), c.r * (1 + u * 2.6));
        c.crown.material.opacity = 0.6 * (1 - u) * (1 - u);
        if (u >= 1 && c.crown.visible) { c.crown.visible = false; this.crownPool.push(c.crown); c.crown = null; }
      }
    }

    for (let i = this.swells.length - 1; i >= 0; i--) {
      const s = this.swells[i];
      s.life += dt;
      if (s.life < s.delay) continue;
      const t = s.life - s.delay;
      const k = t / s.ttl;
      if (k >= 1) {
        s.m.visible = false; this.swellPool.push(s.m);
        this.swells.splice(i, 1);
        continue;
      }
      const r = s.r0 + s.speed * t;
      // The crest flattens as the ring spreads: the same water round a longer
      // circumference. That is also what keeps a big splash's wave readable
      // out to a couple of hundred metres and a small one's gone in thirty.
      const decay = s.r0 / r;
      s.m.scale.set(r, s.crest * Math.max(0.15, Math.pow(decay, 0.6)), r);
      s.m.material.opacity = s.peak * Math.min(1, t * 6) * (1 - k) * (1 - k);
    }
  }
}
