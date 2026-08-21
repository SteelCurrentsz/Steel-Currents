// The battle world: sky, sea, islands, ship view-models and the camera rig.

import * as THREE from '../../../vendor/three.module.js';
import { Ocean, OCEAN_PRESETS } from './ocean.js';
import { buildShip } from './ships.js';
import { Effects } from './effects.js';
import { QUALITY } from '../settings.js';
import { MAP_HALF } from '../../../shared/world.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { makeRng } from '../../../shared/math.js';

const SKY = {
  night: { top: 0x050d1c, bottom: 0x1d3550 },
  dawn: { top: 0x142b4f, bottom: 0xc98a5e },
  dusk: { top: 0x1d2542, bottom: 0x8a5f50 },
  day: { top: 0x2f6ea8, bottom: 0xa8cbe0 },
};

export function skyDome(time, radius = 20000) {
  const cfg = SKY[time] || SKY.night;
  const geo = new THREE.SphereGeometry(1, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(cfg.top) },
      bottom: { value: new THREE.Color(cfg.bottom) },
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

/** Islands: a jagged low-poly cone plus a foam ring at the waterline. */
function buildIsland(isle) {
  const g = new THREE.Group();
  const rng = makeRng(isle.shape || 1);
  const sides = 11;
  const pos = [];
  const rim = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const r = isle.r * (0.78 + rng() * 0.34);
    rim.push([Math.sin(a) * r, Math.cos(a) * r]);
  }
  const peaks = [
    [0, 0, isle.height],
    [isle.r * 0.3, isle.r * 0.2, isle.height * 0.72],
    [-isle.r * 0.35, -isle.r * 0.25, isle.height * 0.6],
  ];
  for (let i = 0; i < sides; i++) {
    const a = rim[i], b = rim[(i + 1) % sides];
    const peak = peaks[i % peaks.length];
    pos.push(a[0], -6, a[1], b[0], -6, b[1], peak[0], peak[2], peak[1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: 0x46503a, flatShading: true, roughness: 0.95, metalness: 0,
  }));
  g.add(land);

  const shore = new THREE.Mesh(
    new THREE.RingGeometry(isle.r * 0.9, isle.r * 1.12, 24),
    new THREE.MeshBasicMaterial({ color: 0x7fa8b8, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  shore.rotation.x = -Math.PI / 2;
  shore.position.y = 1.2;
  g.add(shore);

  g.position.set(isle.x, 0, isle.z);
  return g;
}

/** A ship as it appears on screen: hull, turrets, wake ribbon, damage state. */
export class ShipView {
  constructor(scene, classId, team, isSelf) {
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
    const wakeGeo = new THREE.PlaneGeometry(1, len * 3.4, 1, 12);
    wakeGeo.rotateX(-Math.PI / 2);
    wakeGeo.translate(0, 0, -len * 1.7);
    {
      const pos = wakeGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        const k = Math.min(1, -z / (len * 3.4));
        pos.setX(i, pos.getX(i) * this.cls.hull.beam * (0.9 + k * 3.4));
      }
      pos.needsUpdate = true;
    }
    const c = document.createElement('canvas');
    c.width = 8; c.height = 128;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(226,240,252,0.75)');
    grad.addColorStop(0.35, 'rgba(200,225,245,0.28)');
    grad.addColorStop(1, 'rgba(190,220,245,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 8, 128);
    this.wake = new THREE.Mesh(wakeGeo, new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0,
    }));
    this.wake.position.set(0, 1.4, -len * 0.42);
    this.group.add(this.wake);

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
    this.scene.add(skyDome(preset, q.drawDistance * 0.8));
    if (preset === 'night') this.scene.add(starField(600));

    this.ocean = new Ocean(preset, q.oceanSize, q.oceanSegments);
    this.ocean.setSeaState(world.sea ?? 2);
    {
      // The reflected pool sits opposite the light, out toward the horizon.
      const d = OCEAN_PRESETS[preset].lightDir;
      this.ocean.setGlare(-d.x * 5200, -d.z * 5200, 3200);
    }
    this.scene.add(this.ocean.mesh);

    const p = OCEAN_PRESETS[preset];
    this.scene.fog = new THREE.FogExp2(p.fogColor, p.fog * 0.7);

    // Warships are grey on a dark sea: without a strong sky term they read as
    // black silhouettes, so the ambient does most of the work at night.
    const sun = new THREE.DirectionalLight(p.light, preset === 'day' ? 1.9 : preset === 'dusk' ? 1.15 : 0.85);
    sun.position.copy(p.lightDir).multiplyScalar(3000);
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(
      preset === 'day' ? 0xa8cee6 : preset === 'dusk' ? 0x7e8fb0 : 0x4a6c9c,
      preset === 'day' ? 0x2c5a72 : 0x111a26,
      preset === 'day' ? 1.0 : preset === 'dusk' ? 0.7 : 0.55,
    ));

    for (const isle of world.islands) this.scene.add(buildIsland(isle));
    this.addBorder();
    this.addCapRings();

    this.effects = new Effects(this.scene, q.particles);

    this.camera = new THREE.PerspectiveCamera(58, 1, 2, q.drawDistance);
    this.shipViews = new Map();

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
      v = new ShipView(this.scene, classId, team, isSelf);
      this.shipViews.set(id, v);
    }
    return v;
  }

  removeShipView(id) {
    const v = this.shipViews.get(id);
    if (v) { v.dispose(this.scene); this.shipViews.delete(id); }
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.ocean.update(dt, this.camera.position);
    this.effects.update(dt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
