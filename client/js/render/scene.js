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

    const push = (k) => { pos.push(px[k], py[k], pz[k]); };
    const shade = (k) => { const c = isleShade(py[k]); col.push(c[0], c[1], c[2]); };
    for (let i = 0; i < spokes; i++) {
      const i2 = (i + 1) % spokes;
      for (let j = 0; j < nr - 1; j++) {
        const a = i * nr + j;
        const b = i * nr + j + 1;
        const c = i2 * nr + j;
        const d = i2 * nr + j + 1;
        if (j === 0) {
          // The summit closes on itself: one fan of triangles, no seam.
          push(a); push(b); push(d);
          shade(a); shade(b); shade(d);
          continue;
        }
        push(a); push(b); push(d);
        push(a); push(d); push(c);
        shade(a); shade(b); shade(d);
        shade(a); shade(d); shade(c);
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
   * The whole emplacement turns with the mounting rather than the barrel alone.
   * With the concrete gone these are open gun pits -- a pedestal, a racer and a
   * revetment of sandbags -- and the pit is what a gun of that kind is trained
   * in, so turning the lot of it is nearer the truth than swinging a barrel
   * over a revetment that stays put.
   */
  getBatteryView(id, batteryId, team) {
    let v = this.batteryViews.get(id);
    if (!v) {
      const built = buildBattery(batteryId);
      const group = new THREE.Group();
      group.add(built.group);
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

      v = { group, marker, span: built.span, batteryId, team, smokeTimer: 0 };
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
