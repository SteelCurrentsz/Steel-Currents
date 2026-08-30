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
    height: 23 * Math.pow(k, 1.12),
    // A splash is a *mass* of water, not a spout: the column that comes up off
    // a heavy shell is nearly half as wide as it is tall, boiling outwards as
    // it rises. A narrow spike is what a stone dropped in a pond does.
    radius: 5.4 * Math.pow(k, 1.02),
  };
}

/** A soft vertical gradient: dense at the foot of the column, mist at the head. */
function columnTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0.00, 'rgba(255,255,255,0.00)'); // the very base, hidden in the sea
  g.addColorStop(0.07, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.30, 'rgba(245,251,255,0.74)');
  g.addColorStop(0.55, 'rgba(238,248,255,0.44)');
  g.addColorStop(0.78, 'rgba(232,245,255,0.18)');
  g.addColorStop(1.00, 'rgba(226,242,255,0.00)'); // torn to nothing at the top
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 128);
  // A little streaking across the column, so it is water and not a cone.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i++) {
    // Long and thin, and thinning towards the top: the water leaves the sea in
    // ropes, and it is the gaps between them that make a column look like it is
    // going somewhere rather than just sitting there.
    const y = Math.random() * 128;
    ctx.fillStyle = `rgba(0,0,0,${(0.08 + Math.random() * 0.3) * (0.35 + y / 128)})`;
    ctx.fillRect(Math.random() * 16, y, 0.8 + Math.random() * 2, 12 + Math.random() * 48);
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
/**
 * The billowing profile of the column, as a multiple of its base radius.
 *
 * Water thrown up by a shell does not taper away like a cone. It leaves the sea
 * as a wide skirt, boils *outwards* as it rises -- the mass is widest around a
 * third of the way up, where it has had time to spread and has not yet run out
 * of momentum -- and only then tears apart into a head of spray. That shape,
 * more than anything else, is what makes a splash read as tons of water rather
 * than as a plume of smoke.
 */
function billow(t) {
  if (t < 0.16) return 1.06 - t * 0.9;                  // the skirt at the sea
  if (t < 0.48) return 0.92 + (t - 0.16) * 1.25;        // boiling outward
  if (t < 0.78) return 1.32 - (t - 0.48) * 0.5;         // the shoulder of it
  return 1.17 - (t - 0.78) * 3.4;                       // torn away at the head
}

function makeGeometry() {
  const column = new THREE.CylinderGeometry(1, 1, 1, 28, 16, true);
  column.translate(0, 0.5, 0);
  // Water does not come up as a cone. On top of the billowing profile the wall
  // is pushed in and out around the circumference and up the height, in three
  // frequencies, so the silhouette is lumpy from every bearing -- and since
  // each splash is turned to a random heading, the same shape never reads as
  // the same shape twice.
  const p = column.attributes.position;
  const col = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    const a = Math.atan2(x, z);
    const wob = billow(y) * (1
      + 0.19 * Math.sin(a * 3 + y * 6.4)
      + 0.13 * Math.sin(a * 5 - y * 9.1)
      + 0.09 * Math.sin(a * 8 + y * 14.3)
      + 0.11 * Math.sin(y * 12.0 + a));
    p.setX(i, x * wob);
    p.setZ(i, z * wob);
    // What comes up out of the sea is sea. The foot of the column carries the
    // water's own colour and only the top of the throw -- where it has been
    // torn apart and is more air than water -- goes white. A column that is
    // white all the way down reads as a sheet of paper standing on the swell.
    const up = Math.min(1, y * 1.35);
    col.push(
      0.62 + 0.38 * up,
      0.76 + 0.24 * up,
      0.84 + 0.16 * up,
    );
  }
  column.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  column.computeVertexNormals();
  // The crown: the collar of water thrown out sideways at the moment of impact,
  // leaning outwards. Short, wide, and gone in under a second.
  const crown = new THREE.CylinderGeometry(2.6, 0.8, 1, 24, 1, true);
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
function makeSwellGeometry(seg = 108) {
  const pos = [];
  const uv = [];
  const idx = [];
  // Trough behind, crest, and a short steep face in front: a wave running
  // outward is not symmetrical, and the steep side is the side it is going.
  const bands = [[0.62, 0], [0.86, 0.55], [1.0, 1], [1.07, 0.5], [1.13, 0]];
  for (let b = 0; b < bands.length; b++) {
    const [r, y] = bands[b];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      // Nor is it a circle. The ring is pushed in and out around its
      // circumference so it spreads unevenly, the way water does when it is
      // running out across a sea that already has a swell on it.
      const wob = 1
        + 0.034 * Math.sin(a * 2 + 0.7)
        + 0.021 * Math.sin(a * 3 - 1.9);
      pos.push(Math.sin(a) * r * wob, y, Math.cos(a) * r * wob);
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
  c.width = 8; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0.00, 'rgba(255,255,255,0)');
  g.addColorStop(0.20, 'rgba(244,251,255,0.14)');
  g.addColorStop(0.40, 'rgba(248,253,255,0.42)');
  g.addColorStop(0.53, 'rgba(255,255,255,0.66)');
  g.addColorStop(0.68, 'rgba(242,250,255,0.34)');
  g.addColorStop(0.86, 'rgba(232,245,255,0.10)');
  g.addColorStop(1.00, 'rgba(226,240,252,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 128);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return t;
}

// A full salvo from a battleship is nine shells and a fleet action has several
// ships firing at once, so the pool has to take a couple of straddles at a time
// without a splash going missing. They are cheap: one shared geometry, one draw
// call each, and culled when they are over the horizon.
/**
 * The patch of churned water a splash leaves behind: torn foam, not a ring.
 *
 * Drawn as blobs rather than a gradient because foam is lumpy, and a soft
 * circle on the sea reads as a lens flare rather than as water.
 */
function foamTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2;
    // Packed towards the middle, thinning out to nothing at the rim.
    const rr = Math.pow(Math.random(), 0.6) * 0.46;
    const x = size / 2 + Math.cos(a) * rr * size;
    const y = size / 2 + Math.sin(a) * rr * size;
    const r = (2 + Math.random() * 9) * (1 - rr);
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1.5, r));
    const alpha = 0.5 * (1 - rr / 0.46);
    g.addColorStop(0, `rgba(255,255,255,${alpha.toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.5, r), 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}

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
    this.foamTex = foamTexture();
    this.swellGeo = makeSwellGeometry();
    this.foamGeo = new THREE.PlaneGeometry(2, 2);

    const colMat = new THREE.MeshBasicMaterial({
      map: this.colTex, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, color: 0xf2f8ff, vertexColors: true,
    });
    const swellMat = new THREE.MeshBasicMaterial({
      map: this.swellTex, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, color: 0xe8f3ff,
    });

    const crownMat = new THREE.MeshBasicMaterial({
      map: this.colTex, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, color: 0xdcecfa,
    });
    const foamMat = new THREE.MeshBasicMaterial({
      map: this.foamTex, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, color: 0xeef6ff,
    });

    this.colPool = [];
    this.corePool = [];
    this.crownPool = [];
    this.swellPool = [];
    this.foamPool = [];
    for (let i = 0; i < COLUMNS; i++) {
      const m = new THREE.Mesh(geo.column, colMat.clone());
      m.visible = false; m.renderOrder = 3;
      scene.add(m); this.colPool.push(m);
      // The same wall again, inside and turned the other way. Where the two
      // overlap -- the middle of the mass -- the water is opaque; at the edges
      // only one of them is in the way, and it feathers.
      const core = new THREE.Mesh(geo.column, colMat.clone());
      core.visible = false; core.renderOrder = 3;
      scene.add(core); this.corePool.push(core);
      const c = new THREE.Mesh(geo.crown, crownMat.clone());
      c.visible = false; c.renderOrder = 3;
      scene.add(c); this.crownPool.push(c);
      const f = new THREE.Mesh(this.foamGeo, foamMat.clone());
      f.visible = false; f.renderOrder = 1; f.rotation.x = -Math.PI / 2;
      scene.add(f); this.foamPool.push(f);
    }
    for (let i = 0; i < SWELLS; i++) {
      const m = new THREE.Mesh(this.swellGeo, swellMat.clone());
      m.visible = false; m.renderOrder = 2;
      scene.add(m); this.swellPool.push(m);
    }
    this.columns = [];
    this.swells = [];
    this.foams = [];
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
      const core = this.corePool.pop();
      col.position.set(x, 0, z);
      col.rotation.y = Math.random() * Math.PI * 2;
      col.material.opacity = 1;
      col.visible = true;
      if (core) {
        core.position.set(x, 0, z);
        core.rotation.y = col.rotation.y + 1.9 + Math.random();
        core.visible = true;
      }
      // Leaned a few degrees off the vertical and squashed slightly on one
      // axis: a shell arrives on a slant and throws the water the way it was
      // going, so a column standing dead upright looks like a prop.
      col.rotation.z = (Math.random() - 0.5) * 0.20;
      col.rotation.x = (Math.random() - 0.5) * 0.20;
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
        col, core, crown, x, z, h: height, r: radius,
        squash: 0.82 + Math.random() * 0.36,
        life: 0, rise, ttl: rise + 1.3 + height * 0.022,
      });
    }
    // The patch of churned water underneath it, which is what actually marks
    // where the round went in: it is still there long after the column has
    // fallen, and it is the last thing to go.
    const foam = this.foamPool.pop();
    if (foam) {
      foam.position.set(x, 0.28, z);
      foam.rotation.z = Math.random() * Math.PI * 2;
      foam.material.opacity = 0;
      foam.visible = true;
      this.foams.push({
        m: foam, r0: radius * 1.5, r1: radius * 4.2,
        life: 0, ttl: 3.4 + height * 0.05, peak: 0.62,
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
        if (c.core) { c.core.visible = false; this.corePool.push(c.core); }
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
        spread = 1 + u * 0.34;
        // And it goes back where it came from: the foot of the column settles
        // under the surface as it falls, so what is left at the end is a patch
        // of disturbed water rather than a slab standing on it.
        c.col.position.y = -c.h * 0.05 * u;
      }
      c.col.scale.set(c.r * spread, Math.max(0.6, c.h * f), c.r * spread * c.squash);
      c.col.material.opacity = 0.9 * (1 - k) * (1 - k * k);
      if (c.core) {
        // A shade shorter and narrower, so its own lumps sit inside the outer
        // wall's rather than fighting with them along the silhouette.
        c.core.position.y = c.col.position.y;
        c.core.scale.set(c.r * spread * 0.74, Math.max(0.5, c.h * f * 0.88), c.r * spread * 0.74 * c.squash);
        c.core.rotation.z = c.col.rotation.z * 0.6;
        c.core.rotation.x = c.col.rotation.x * 0.6;
        c.core.material.opacity = c.col.material.opacity * 0.85;
      }
      if (c.crown) {
        // The collar is thrown out in the first fifth of a second and is gone
        // before the column has finished rising.
        const u = Math.min(1, c.life / (c.rise * 1.6));
        c.crown.scale.set(c.r * (1 + u * 2.6), c.h * 0.16 * (1 - u * 0.5), c.r * (1 + u * 2.6));
        c.crown.material.opacity = 0.6 * (1 - u) * (1 - u);
        if (u >= 1 && c.crown.visible) { c.crown.visible = false; this.crownPool.push(c.crown); c.crown = null; }
      }
    }

    for (let i = this.foams.length - 1; i >= 0; i--) {
      const f = this.foams[i];
      f.life += dt;
      const k = f.life / f.ttl;
      if (k >= 1) {
        f.m.visible = false; this.foamPool.push(f.m);
        this.foams.splice(i, 1);
        continue;
      }
      // Spreads quickly at first and then drifts, the way a patch of aerated
      // water does before the sea closes over it again.
      const r = f.r0 + (f.r1 - f.r0) * Math.pow(k, 0.45);
      f.m.scale.set(r, r, 1);
      f.m.material.opacity = f.peak * Math.min(1, f.life * 5) * (1 - k) * (1 - k);
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
      // Easing off as it goes: a ring of water leaves the splash fast and then
      // settles into the sea's own motion, and a crest travelling at a constant
      // speed to the end of its life reads as a shockwave rather than a swell.
      const r = s.r0 + s.speed * t * (1 - 0.28 * k);
      // The crest flattens as the ring spreads: the same water round a longer
      // circumference. That is also what keeps a big splash's wave readable
      // out to a couple of hundred metres and a small one's gone in thirty.
      const decay = s.r0 / r;
      s.m.scale.set(r, s.crest * Math.max(0.15, Math.pow(decay, 0.6)), r);
      // Smoothstep in and out, so neither end of its life has a corner in it.
      const rise = Math.min(1, t * 3.5);
      const fade = (1 - k) * (1 - k) * (1 - k * 0.4);
      s.m.material.opacity = s.peak * rise * rise * (3 - 2 * rise) * fade;
    }
  }
}
