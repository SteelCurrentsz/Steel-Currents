// The battle world: sky, sea, islands, ship view-models and the camera rig.

import * as THREE from '../../../vendor/three.module.js';
import { Ocean, OCEAN_PRESETS } from './ocean.js';
import { Weather } from './weather.js';
import { buildShip } from './ships.js';
import { buildBattery } from './battery.js';
import { Effects } from './effects.js';
import { Wake } from './wake.js';
import { QUALITY } from '../settings.js';
import {
  MAP_HALF, landMask, groundHeight, getWeather, islandRadius, islandHeight,
} from '../../../shared/world.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { makeRng } from '../../../shared/math.js';

const SKY = {
  night: { top: 0x050d1c, bottom: 0x1d3550 },
  dawn: { top: 0x142b4f, bottom: 0xc98a5e },
  dusk: { top: 0x1d2542, bottom: 0x8a5f50 },
  day: { top: 0x2f6ea8, bottom: 0xa8cbe0 },
};

/**
 * The sky. `overcast` is how far to pull it toward the flat grey lid a bad day
 * puts over the sea — 0 leaves the hour's own sky alone, 1 replaces it.
 */
export function skyDome(time, radius = 20000, overcast = 0) {
  const cfg = SKY[time] || SKY.night;
  // Cloud is darker overhead than it is at the horizon, the same way clear sky
  // is, so the dome keeps its gradient rather than going to a flat wall.
  const lidTop = new THREE.Color(0x39434d);
  const lidBot = new THREE.Color(0x6d7a86);
  const geo = new THREE.SphereGeometry(1, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(cfg.top).lerp(lidTop, overcast) },
      bottom: { value: new THREE.Color(cfg.bottom).lerp(lidBot, overcast) },
    },
    vertexShader: `varying vec3 vp; void main(){ vp = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom; varying vec3 vp;
      void main(){
        float h = clamp(vp.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 c = mix(bottom, top, pow(h, 0.65));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.setScalar(radius);
  mesh.frustumCulled = false;
  return mesh;
}

function starField(count = 700) {
  const pos = [];
  for (let i = 0; i < count; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(Math.random() * 0.9 + 0.05);
    const r = 24000;
    pos.push(Math.sin(ph) * Math.cos(th) * r, Math.cos(ph) * r, Math.sin(ph) * Math.sin(th) * r);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcddcf2, size: 42, sizeAttenuation: true, transparent: true, opacity: 0.75 }));
}

/**
 * The real coastline, built as ground.
 *
 * Raised off the same grid the simulation runs its collision against, so what
 * is drawn and what a hull runs aground on are one thing rather than two that
 * agree most of the time. Every cell that is ashore, and a two-cell apron of
 * shallows round it, becomes a quad at the height the sim says the ground is;
 * the coast then falls out of the grid where the height crosses the waterline
 * instead of being drawn as a separate line.
 *
 * One mesh for the lot: a coastal battlefield is fifty thousand cells of land
 * and that is not fifty thousand draw calls.
 */
function buildCoast(world) {
  const m = landMask(world);
  if (!m.any) return null;
  // Drawn at twice the cell the sim collides on. The coastline carries its
  // detail at about seven hundred metres, so three hundred holds all of it,
  // and it is a quarter of the triangles.
  const STEP = 2;
  const cell = m.cell * STEP;
  const n = Math.ceil((m.half * 2) / cell) + 1;
  const half = m.half;
  const at = (i, j) => {
    const x = -half + (i + 0.5) * cell;
    const z = -half + (j + 0.5) * cell;
    const mi = Math.floor((x + half) / m.cell);
    const mj = Math.floor((z + half) / m.cell);
    if (mi < 0 || mj < 0 || mi >= m.n || mj >= m.n) return 0;
    return m.grid[mj * m.n + mi];
  };

  // Height at a grid corner, cached: every corner is asked for by up to four
  // quads and the shore distance behind it is the expensive part.
  const hs = new Float32Array((n + 1) * (n + 1)).fill(NaN);
  const height = (i, j) => {
    const k = j * (n + 1) + i;
    if (!Number.isNaN(hs[k])) return hs[k];
    const x = -half + i * cell;
    const z = -half + j * cell;
    hs[k] = groundHeight(world, x, z);
    return hs[k];
  };

  const pos = [];
  const col = [];
  // Two greens and a sand, picked by height: beach, scrub, high ground.
  const shade = (h) => {
    if (h < 6) return [0.62, 0.58, 0.44];
    if (h < 60) return [0.30, 0.35, 0.22];
    return [0.24, 0.27, 0.20];
  };

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      // Land, or within two cells of it: the apron carries the beach down
      // under the water so the shore does not end in a cliff.
      let near = false;
      for (let dj = -1; dj <= 1 && !near; dj++) {
        for (let di = -1; di <= 1; di++) if (at(i + di, j + dj)) { near = true; break; }
      }
      if (!near) continue;

      const x0 = -half + i * cell;
      const z0 = -half + j * cell;
      const h00 = height(i, j);
      const h10 = height(i + 1, j);
      const h11 = height(i + 1, j + 1);
      const h01 = height(i, j + 1);
      if (h00 < -20 && h10 < -20 && h11 < -20 && h01 < -20) continue;

      // Wound anticlockwise seen from above, so the ground faces the sky.
      pos.push(x0, h00, z0, x0 + cell, h11, z0 + cell, x0 + cell, h10, z0);
      pos.push(x0, h00, z0, x0, h01, z0 + cell, x0 + cell, h11, z0 + cell);
      const a = shade((h00 + h10 + h11 + h01) / 4);
      for (let v = 0; v < 6; v++) col.push(a[0], a[1], a[2]);
    }
  }
  if (!pos.length) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0,
  }));
}

/**
 * The islands, as ground rather than as scenery.
 *
 * Each one is a radial mesh laid on the same rim the simulation collides with:
 * spokes out from the middle, rings along them, the height at every vertex
 * taken from `islandHeight`. So the beach a captain can see is the beach his
 * bow grounds on, and a coast battery placed on the high ground is standing on
 * high ground rather than hovering over a cone.
 *
 * The mesh runs on past the waterline to a shelf twenty-odd metres down, so
 * the island rises out of the seabed instead of out of a hole.
 *
 * All of them are welded into one geometry. A big battlefield carries over a
 * hundred islands, and a hundred islands is two hundred draw calls for
 * something that never moves.
 */
const ISLE_RINGS = [0, 0.16, 0.31, 0.45, 0.58, 0.7, 0.8, 0.88, 0.95, 1, 1.14, 1.32];

/** Two greens, a sand and a seabed, picked by height. */
function isleShade(h) {
  if (h < -2) return [0.19, 0.24, 0.26];
  if (h < 4) return [0.66, 0.61, 0.46];
  if (h < 16) return [0.48, 0.50, 0.35];
  if (h < 95) return [0.30, 0.37, 0.22];
  return [0.26, 0.29, 0.22];
}

function buildIslands(islands) {
  if (!islands.length) return null;
  const g = new THREE.Group();
  const pos = [];
  const col = [];
  const idx = [];
  const foam = [];

  for (const isle of islands) {
    const rng = makeRng(isle.shape || 1);
    const spokes = Math.max(20, Math.min(44, Math.round(isle.r / 22)));
    // A ridge factor per spoke, so the hill has shoulders and gullies instead
    // of being a dome of revolution. It is faded out at the summit and at the
    // waterline, which keeps the top flat enough to build on and the beach at
    // sea level where the collision says it is.
    const ridge = [];
    for (let i = 0; i < spokes; i++) ridge.push(0.84 + rng() * 0.32);

    const nr = ISLE_RINGS.length;
    const px = new Float32Array(spokes * nr);
    const py = new Float32Array(spokes * nr);
    const pz = new Float32Array(spokes * nr);
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const R = islandRadius(isle, a);
      const sn = Math.sin(a);
      const cs = Math.cos(a);
      for (let j = 0; j < nr; j++) {
        const f = ISLE_RINGS[j];
        const x = isle.x + sn * R * f;
        const z = isle.z + cs * R * f;
        let y;
        if (f >= 1) {
          // Off the beach and down onto the shelf.
          const t = (f - 1) / (ISLE_RINGS[nr - 1] - 1);
          y = -24 * t * t;
        } else {
          y = islandHeight(isle, x, z);
          const bump = Math.sin(Math.PI * f);
          y *= 1 + (ridge[i] - 1) * bump * 0.9;
        }
        const k = i * nr + j;
        px[k] = x; py[k] = y; pz[k] = z;
      }
    }

    // Indexed, and with one shared vertex at the summit. Every ring vertex is
    // written once and referred to by all four triangles that meet on it, so
    // the normals average across them and the hill shades as a hill. Written
    // per-triangle instead, it comes out as a fan of hard radial facets --
    // which is what a spoked mesh looks like when nothing is welded.
    const base = pos.length / 3;
    const put = (k) => {
      pos.push(px[k], py[k], pz[k]);
      const c = isleShade(py[k]);
      col.push(c[0], c[1], c[2]);
    };
    put(0);                                  // the summit, once
    const apex = base;
    const ring = (i, j) => base + 1 + i * (nr - 1) + (j - 1);
    for (let i = 0; i < spokes; i++) {
      for (let j = 1; j < nr; j++) put(i * nr + j);
    }
    for (let i = 0; i < spokes; i++) {
      const i2 = (i + 1) % spokes;
      idx.push(apex, ring(i, 1), ring(i2, 1));
      for (let j = 1; j < nr - 1; j++) {
        const a = ring(i, j);
        const b = ring(i, j + 1);
        const c = ring(i2, j);
        const d = ring(i2, j + 1);
        idx.push(a, b, d, a, d, c);
      }
    }

    // Foam at the waterline, following the rim rather than ringing it.
    for (let i = 0; i < spokes; i++) {
      const i2 = (i + 1) % spokes;
      const a0 = (i / spokes) * Math.PI * 2;
      const a1 = (i2 / spokes) * Math.PI * 2;
      const r0 = islandRadius(isle, a0);
      const r1 = islandRadius(isle, a1);
      const p = (a, r) => [isle.x + Math.sin(a) * r, 1.2, isle.z + Math.cos(a) * r];
      const in0 = p(a0, r0 * 0.985);
      const in1 = p(a1, r1 * 0.985);
      const out0 = p(a0, r0 * 1.06);
      const out1 = p(a1, r1 * 1.06);
      foam.push(...in0, ...out1, ...out0);
      foam.push(...in0, ...in1, ...out1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0,
  }));
  land.renderOrder = -1;
  g.add(land);

  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(foam, 3));
  g.add(new THREE.Mesh(fg, new THREE.MeshBasicMaterial({
    color: 0xa8c6d2, transparent: true, opacity: 0.2, depthWrite: false,
    side: THREE.DoubleSide,
  })));
  return g;
}

/**
 * The ground a battery is built on.
 *
 * A gun position is not set down on a hillside, it is cut into one: the pad is
 * levelled at the height of its uphill side and the spoil is thrown out to make
 * up the downhill one. Without that a flat emplacement on a slope has half of
 * it buried and the other half standing in the air, which is what a single
 * height sample gets you.
 *
 * So: a flat platform at the pad height, and a skirt round it falling to meet
 * the terrain. The skirt never rises above the pad — where the hill is higher
 * than the platform it simply carries on through, which is the cutting.
 *
 * `at` is the emplacement's world position; the mesh is built in the view's own
 * local frame, so its origin is the pad and its y is metres above or below it.
 */
function batteryApron(world, at, span) {
  const R = Math.max(9, span * 0.62);
  const RINGS = [1, 1.5, 2.2];
  const SPOKES = 20;
  const pos = [];
  const idx = [];
  const col = [];
  const put = (x, y, z, shade) => {
    pos.push(x, y, z);
    col.push(shade[0], shade[1], shade[2]);
  };
  const PAD = [0.42, 0.40, 0.34];      // levelled earth and rubble
  const FILL = [0.36, 0.36, 0.29];     // the spoil banked round it

  put(0, 0, 0, PAD);                   // the middle of the platform
  for (let i = 0; i < SPOKES; i++) {
    const th = (i / SPOKES) * Math.PI * 2;
    const sn = Math.sin(th);
    const cs = Math.cos(th);
    for (let k = 0; k < RINGS.length; k++) {
      const r = R * RINGS[k];
      const x = sn * r;
      const z = cs * r;
      // Local height: the terrain out there relative to the pad, never above it.
      const y = k === 0 ? 0
        : Math.min(0, groundHeight(world, at.x + x, at.z + z) - at.y);
      put(x, y, z, k === 0 ? PAD : FILL);
    }
  }
  const ring = (i, k) => 1 + i * RINGS.length + k;
  for (let i = 0; i < SPOKES; i++) {
    const j = (i + 1) % SPOKES;
    idx.push(0, ring(i, 0), ring(j, 0));
    for (let k = 0; k < RINGS.length - 1; k++) {
      idx.push(ring(i, k), ring(i, k + 1), ring(j, k + 1));
      idx.push(ring(i, k), ring(j, k + 1), ring(j, k));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0,
  }));
  // Over the hillside it is cut into, so the two do not fight for the same
  // fragments along the join.
  mesh.renderOrder = 1;
  mesh.material.polygonOffset = true;
  mesh.material.polygonOffsetFactor = -2;
  mesh.material.polygonOffsetUnits = -2;
  return mesh;
}

/**
 * The mark that says a battery is there.
 *
 * A lattice observation tower with a platform and a pennant on it. Every one of
 * these emplacements had one — a coast gun is laid by an observer with a
 * rangefinder, not by the men on the breech — and it is the thing about a
 * battery that a ship out at sea could actually pick out, because it is forty
 * metres of steel against the sky rather than a gun down in a pit.
 *
 * Which is the point of it. The gun itself is modelled at its own size and is a
 * handful of pixels from any useful range; the tower is real, it is tall, and
 * it makes the battery findable from the water.
 */
function batteryMark(span, team) {
  const g = new THREE.Group();
  const H = Math.max(26, Math.min(60, span * 1.6));
  const base = Math.max(2.6, span * 0.14);
  const top = base * 0.42;
  const steel = new THREE.MeshStandardMaterial({
    color: 0x6b7076, roughness: 0.85, metalness: 0.35,
  });

  // Four legs, raked in to the platform.
  const legGeo = new THREE.CylinderGeometry(0.42, 0.42, 1, 5);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const bx = Math.sin(a) * base;
    const bz = Math.cos(a) * base;
    const tx = Math.sin(a) * top;
    const tz = Math.cos(a) * top;
    const dx = tx - bx;
    const dz = tz - bz;
    const leg = new THREE.Mesh(legGeo, steel);
    leg.scale.y = Math.hypot(dx, H, dz);
    leg.position.set((bx + tx) / 2, H / 2, (bz + tz) / 2);
    leg.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dx, H, dz).normalize(),
    );
    g.add(leg);
  }

  // Bracing, so it reads as a lattice rather than as four sticks.
  const braceGeo = new THREE.BoxGeometry(1, 0.3, 0.3);
  for (let k = 1; k <= 3; k++) {
    const y = (H * k) / 4;
    const r = base + (top - base) * (k / 4);
    for (let i = 0; i < 4; i++) {
      const a0 = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const a1 = ((i + 1) / 4) * Math.PI * 2 + Math.PI / 4;
      const x0 = Math.sin(a0) * r;
      const z0 = Math.cos(a0) * r;
      const x1 = Math.sin(a1) * r;
      const z1 = Math.cos(a1) * r;
      const bar = new THREE.Mesh(braceGeo, steel);
      bar.scale.x = Math.hypot(x1 - x0, z1 - z0);
      bar.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      bar.rotation.y = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
      g.add(bar);
    }
  }

  // The observation platform, and the rangefinder hood on it.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(top * 2.9, 1.1, top * 2.9), steel);
  deck.position.y = H;
  g.add(deck);
  const hood = new THREE.Mesh(
    new THREE.BoxGeometry(top * 2.1, 2.6, top * 1.5),
    new THREE.MeshStandardMaterial({ color: 0x555c60, roughness: 0.8, metalness: 0.3 }),
  );
  hood.position.y = H + 1.9;
  g.add(hood);

  // The staff, and the pennant whose colour says whose gun this is.
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 11, 5), steel);
  staff.position.y = H + 8.5;
  g.add(staff);
  const fw = Math.max(6, span * 0.36);
  const fh = 3.4;
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, fw, -fh * 0.5, 0, 0, -fh, 0,
  ], 3));
  flagGeo.computeVertexNormals();
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshBasicMaterial({
    color: team === 0 ? 0x6fd3a0 : 0xe2564f,
    side: THREE.DoubleSide, depthWrite: false,
  }));
  flag.position.y = H + 13.4;
  g.add(flag);
  return g;
}

/** A ship as it appears on screen: hull, turrets, wake ribbon, damage state. */
export class ShipView {
  constructor(scene, classId, team, isSelf, ocean = null) {
    const built = buildShip(classId);
    this.group = built.group;
    this.turrets = built.turrets;
    this.classId = classId;
    this.cls = SHIP_CLASSES[classId];
    this.team = team;
    this.isSelf = isSelf;
    this.smokeTimer = 0;
    this.fireTimer = 0;
    this.sinking = 0;
    scene.add(this.group);

    const len = this.cls.hull.length;
    // The wake is laid in the world rather than towed behind her, so it stays
    // where she has been and curves when she does.
    this.wake = new Wake(scene, {
      length: len, beam: this.cls.hull.beam, ocean,
    });

    // A marker so friend and foe are readable at a glance from the bridge.
    const ringGeo = new THREE.RingGeometry(len * 0.62, len * 0.68, 28);
    ringGeo.rotateX(-Math.PI / 2);
    this.marker = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: isSelf ? 0xe6cf9c : team === 0 ? 0x6fd3a0 : 0xe2564f,
      transparent: true, opacity: 0.35, depthWrite: false,
    }));
    this.marker.position.y = 1.5;
    this.group.add(this.marker);
  }

  dispose(scene) {
    scene.remove(this.group);
    this.wake.dispose();
  }
}

export class BattleScene {
  constructor(renderer, world, quality = 'medium') {
    const q = QUALITY[quality] || QUALITY.medium;
    this.q = q;
    this.renderer = renderer;
    this.world = world;
    this.scene = new THREE.Scene();
    this.time = world.time || 'night';

    const preset = OCEAN_PRESETS[this.time] ? this.time : 'night';
    // What the sky is doing. It thickens the air, takes the sun off the water
    // and puts a lid over the whole thing -- and the same numbers shorten the
    // range a lookout can pick a ship up at, over in the simulation.
    const wx = getWeather(world.weather);
    this.wx = wx;
    // How much of the hour's own sky is left. A thunderstorm at noon is not a
    // dark night; it is a grey day, and the two look nothing alike.
    // Curved, because the first tenth of cloud takes far more of the colour
    // out of a sea than the last tenth does.
    const overcast = Math.pow(1 - wx.light, 0.72);

    this.scene.add(skyDome(preset, q.drawDistance * 0.8, overcast));
    // No stars through cloud.
    if (preset === 'night' && overcast < 0.3) this.scene.add(starField(600));

    this.ocean = new Ocean(preset, q.oceanSize, q.oceanSegments);
    this.ocean.setSeaState(world.sea ?? 2);
    // Water under cloud is not blue: it takes its colour off the sky, and the
    // sky has gone grey. Everything the sea reads its colour from is pulled the
    // same way, so the two go on agreeing.
    {
      const u = this.ocean.material.uniforms;
      const dull = (target, k) => (c) => c.lerp(new THREE.Color(target), k);
      dull(0x69747e, overcast)(u.uSkyTint.value);
      dull(0x121a20, overcast * 0.88)(u.uDeep.value);
      dull(0x27343c, overcast * 0.92)(u.uShallow.value);
      dull(0x78838d, overcast * 0.90)(u.uFogColor.value);
      dull(0xb4bdc6, overcast * 0.70)(u.uLightColor.value);
    }
    {
      // The reflected pool sits opposite the light, out toward the horizon.
      const d = OCEAN_PRESETS[preset].lightDir;
      this.ocean.setGlare(-d.x * 5200, -d.z * 5200, 3200);
    }
    this.scene.add(this.ocean.mesh);

    const p = OCEAN_PRESETS[preset];
    const fogCol = new THREE.Color(p.fogColor).lerp(new THREE.Color(0x78838d), overcast * 0.90);
    this.scene.fog = new THREE.FogExp2(fogCol, p.fog * 0.7 * wx.fog);
    // An overcast has no sun path on the water and very little glitter.
    this.ocean.material.uniforms.uSpecular.value = p.specular * (0.22 + 0.78 * wx.light);

    // Warships are grey on a dark sea: without a strong sky term they read as
    // black silhouettes, so the ambient does most of the work at night.
    const sunI = preset === 'day' ? 1.9 : preset === 'dusk' ? 1.15 : 0.85;
    const sun = new THREE.DirectionalLight(p.light, sunI * wx.light);
    sun.position.copy(p.lightDir).multiplyScalar(3000);
    this.scene.add(sun);
    // The sky term is held up more than the sun is: under cloud the light is
    // all sky and no sun, which is why an overcast day is flat rather than dark.
    this.scene.add(new THREE.HemisphereLight(
      preset === 'day' ? 0xa8cee6 : preset === 'dusk' ? 0x7e8fb0 : 0x4a6c9c,
      preset === 'day' ? 0x2c5a72 : 0x111a26,
      (preset === 'day' ? 1.0 : preset === 'dusk' ? 0.7 : 0.55) * (0.45 + 0.55 * wx.light),
    ));

    const isles = buildIslands(world.islands);
    if (isles) this.scene.add(isles);
    // A battlefield has either a real coastline or invented islands, never
    // both, and the islands raise themselves above at their own detail. Running
    // the mask terrain over them as well would lay a hundred-and-fifty-metre
    // staircase on top of a three-hundred-metre island.
    const coast = world.land?.length ? buildCoast(world) : null;
    if (coast) this.scene.add(coast);
    this.addBorder();
    this.addCapRings();

    this.effects = new Effects(this.scene, q.particles);
    this.weather = new Weather(this.scene, wx, { count: Math.round(9000 * q.particles) });

    this.camera = new THREE.PerspectiveCamera(58, 1, 2, q.drawDistance);
    this.shipViews = new Map();
    // The guns ashore. Built the first time one turns up in a snapshot, which
    // is also the first frame of the battle -- both sides sited them before it
    // started, so there is nothing to wait for.
    this.batteryViews = new Map();

    // Shell tracers, drawn as a single instanced batch.
    const tracerGeo = new THREE.SphereGeometry(3.2, 6, 5);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    this.tracers = new THREE.InstancedMesh(tracerGeo, this.tracerMat, 400);
    this.tracers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracers.frustumCulled = false;
    this.scene.add(this.tracers);

    const torpGeo = new THREE.BoxGeometry(2.4, 1.2, 7);
    this.torpMat = new THREE.MeshBasicMaterial({ color: 0xdfe9f2, transparent: true, opacity: 0.75 });
    this.torpedoes = new THREE.InstancedMesh(torpGeo, this.torpMat, 200);
    this.torpedoes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.torpedoes.frustumCulled = false;
    this.scene.add(this.torpedoes);

    const planeGeo = new THREE.ConeGeometry(6, 20, 4);
    planeGeo.rotateX(Math.PI / 2);
    this.planeMat = new THREE.MeshBasicMaterial({ color: 0x2f4d7a });
    this.planeMesh = new THREE.InstancedMesh(planeGeo, this.planeMat, 60);
    this.planeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.planeMesh.frustumCulled = false;
    this.scene.add(this.planeMesh);

    this.dummy = new THREE.Object3D();
  }

  addBorder() {
    const H = this.world?.half || MAP_HALF;
    const pts = [[-H, -H], [H, -H], [H, H], [-H, H], [-H, -H]];
    const pos = [];
    for (let i = 1; i < pts.length; i++) {
      pos.push(pts[i - 1][0], 8, pts[i - 1][1], pts[i][0], 8, pts[i][1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: 0xe2564f, transparent: true, opacity: 0.35,
    })));
  }

  addCapRings() {
    this.capRings = new Map();
    for (const cap of this.world.caps) {
      const geo = new THREE.RingGeometry(cap.r - 18, cap.r, 64);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xcfd8e0, transparent: true, opacity: 0.32, depthWrite: false,
      }));
      mesh.position.set(cap.x, 3, cap.z);
      this.scene.add(mesh);
      this.capRings.set(cap.id, mesh);
    }
  }

  setCapOwner(id, owner, myTeam) {
    const ring = this.capRings.get(id);
    if (!ring) return;
    ring.material.color.set(owner < 0 ? 0xcfd8e0 : owner === myTeam ? 0x6fd3a0 : 0xe2564f);
  }

  getShipView(id, classId, team, isSelf) {
    let v = this.shipViews.get(id);
    if (!v) {
      v = new ShipView(this.scene, classId, team, isSelf, this.ocean);
      this.shipViews.set(id, v);
    }
    return v;
  }

  removeShipView(id) {
    const v = this.shipViews.get(id);
    if (v) { v.dispose(this.scene); this.shipViews.delete(id); }
  }

  /**
   * A coast battery, standing where it was sited.
   *
   * Two nodes: the ground it stands on, and the mounting turning on that
   * ground. With the concrete gone these are open gun pits -- a pedestal, a
   * racer and a revetment of sandbags -- and the pit turns with the gun, which
   * is nearer the truth than swinging a barrel over a revetment that stays put.
   * The observation tower, the pennant and the ring belong to the ground and do
   * not move.
   */
  getBatteryView(id, batteryId, team, at = null) {
    let v = this.batteryViews.get(id);
    if (!v) {
      const built = buildBattery(batteryId);
      const group = new THREE.Group();
      const spin = new THREE.Group();
      spin.add(built.group);
      group.add(spin);
      this.scene.add(group);

      // Whose it is, read from a mile away: the same ring a hull carries.
      const ringGeo = new THREE.RingGeometry(built.span * 0.62, built.span * 0.72, 28);
      ringGeo.rotateX(-Math.PI / 2);
      const marker = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: team === 0 ? 0x6fd3a0 : 0xe2564f,
        transparent: true, opacity: 0.4, depthWrite: false,
      }));
      marker.position.y = 1.5;
      group.add(marker);

      // The observation post, standing clear of the gun pit.
      const mark = batteryMark(built.span, team);
      mark.position.set(built.span * 0.6, 0, -built.span * 0.45);
      group.add(mark);

      // The ground it stands on, cut to fit the hill it stands on.
      if (at) group.add(batteryApron(this.world, at, built.span));

      v = { group, spin, marker, mark, span: built.span, batteryId, team, smokeTimer: 0 };
      this.batteryViews.set(id, v);
    }
    return v;
  }

  removeBatteryView(id) {
    const v = this.batteryViews.get(id);
    if (v) { this.scene.remove(v.group); this.batteryViews.delete(id); }
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.ocean.update(dt, this.camera.position);
    this.effects.update(dt);
    this.weather.update(dt, this.camera.position);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
