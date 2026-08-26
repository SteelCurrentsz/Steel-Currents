// The gun park: one coast battery at a time, in its emplacement, on a headland
// above a beach.
//
// This is the screen a captain reaches from the turret buttons on the briefing,
// and it is the shipyard's opposite number — same canvas, same panels in the
// same corners, same two arrows. The difference is what is being looked at:
// these guns do not go anywhere, so instead of a hull under way there is a
// piece of coast with the sea running up it and a battery dug into the top.

import * as THREE from '../../vendor/three.module.js';
import { Ocean } from './render/ocean.js';
import { skyDome } from './render/scene.js';
import { buildBattery } from './render/battery.js';

// How high the emplacement stands above the water. Coast batteries were sited
// high for the sight line, and it is also what lets the beach and the surf be
// in the frame at the same time as the gun.
const CREST = 26;

// Which way the guns are laid, and where the camera stands to look at them:
// down the beach, and from the landward quarter looking seaward, so the frame
// has the emplacement in it, the bluff behind that, and the surf and the
// horizon behind that again.
const ENFILADE = -1.30;
const VIEW_YAW = 4.35;
const VIEW_PITCH = 0.20;

const MIN_RANGE = 0.5;
const MAX_RANGE = 3.6;
const PITCH_MIN = -0.12;   // no going underground
const PITCH_MAX = 0.95;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (a, b, t) => {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};

/**
 * The shape of the coast, in metres, with the sea at y = 0.
 *
 * Positive z is seaward: a flat crest for the battery to stand on, a bluff
 * falling away from it, a beach at the bottom and then the shelf running out
 * under the water. The ground round the emplacement is held dead flat, because
 * a casemate poured on a slope reads as a mistake rather than as terrain.
 */
export function landY(x, z) {
  let h;
  if (z < -120) h = CREST - smooth(-120, -560, z) * 9;
  else if (z < 72) h = CREST;
  else if (z < 168) h = CREST - smooth(72, 168, z) * (CREST - 2.4);
  else if (z < 216) h = 2.4 - smooth(168, 216, z) * 2.4;
  else h = -smooth(216, 470, z) * 21;

  // Rolling, everywhere except under the guns — and Schwerer Gustav needs
  // ninety metres of level track, so "under the guns" is a good deal of the
  // crest. Two sines and their harmonic: enough to say the ground was not
  // poured flat, not so much that it reads as a pattern.
  const away = smooth(58, 130, Math.hypot(x * 0.52, z * 0.58));
  h += away * (Math.sin(x * 0.017) * 3.4 + Math.sin(x * 0.041 + 1.7) * 1.5
    + Math.sin(z * 0.023 + 0.6) * 2.2) * smooth(180, 60, z);
  // A gully cut down the bluff on one hand, the way water leaves a headland.
  h -= away * 6.5 * Math.exp(-Math.pow((x + 150) / 52, 2)) * smooth(60, 130, z);
  return h;
}

/** The coast as a mesh, coloured by height: turf, then sand, then the shelf. */
function buildLand() {
  const X0 = -900, X1 = 900, Z0 = -560, Z1 = 620;
  const NX = 150, NZ = 118;
  const pos = [];
  const col = [];
  const idx = [];
  const turf = new THREE.Color(0x4f5d38);
  const scrub = new THREE.Color(0x6b6b44);
  const dune = new THREE.Color(0xa89771);
  const sand = new THREE.Color(0xc9b78f);
  const wet = new THREE.Color(0x6e6552);
  const c = new THREE.Color();
  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      // Bunched toward the middle: the interesting ground is the crest, the
      // bluff and the beach, and the far shelf can be coarse.
      const u = i / NX;
      const v = j / NZ;
      const x = X0 + (X1 - X0) * (0.5 + Math.sign(u - 0.5) * Math.pow(Math.abs(u - 0.5) * 2, 1.5) * 0.5);
      const z = Z0 + (Z1 - Z0) * (0.5 + Math.sign(v - 0.5) * Math.pow(Math.abs(v - 0.5) * 2, 1.35) * 0.5);
      const y = landY(x, z);
      pos.push(x, y, z);
      // Colour off the height, with the bands blended into one another rather
      // than drawn at a contour: a beach does not start on a line.
      if (y > 9) c.copy(turf).lerp(scrub, smooth(9, 22, y) * 0.45);
      else if (y > 1.6) c.copy(dune).lerp(turf, smooth(1.6, 9, y));
      else if (y > -0.4) c.copy(sand).lerp(dune, smooth(1.6, 0.2, y) * 0.5);
      else c.copy(wet).lerp(sand, smooth(-3.4, -0.4, y));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i;
      idx.push(a, a + NX + 1, a + 1, a + 1, a + NX + 1, a + NX + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.renderOrder = -1;
  return mesh;
}

/** The line of surf where the water runs up the sand. */
function buildSurf() {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(8, 96);
  for (let y = 0; y < 96; y++) {
    const v = y / 95;
    // Heaviest a little way up the beach, thinning both ways: the break, then
    // the swash running out and the backwash draining away.
    const a = Math.pow(Math.sin(v * Math.PI), 1.4) * (0.55 + 0.45 * Math.sin(v * 9.0));
    for (let x = 0; x < 8; x++) {
      const i = (y * 8 + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 254; img.data[i + 2] = 250;
      img.data[i + 3] = Math.round(clamp(a, 0, 1) * 205);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(28, 1);

  // Laid over the sand rather than flat on it, so the swell does not cut it.
  const geo = new THREE.PlaneGeometry(1700, 52, 90, 6);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setY(i, landY(p.getX(i), p.getZ(i) + 210) + 0.32);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, opacity: 0.85,
  }));
  mesh.position.z = 210;
  mesh.renderOrder = 3;
  return mesh;
}

export class BatteryScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(44, 1, 0.4, 40000);

    this.sky = skyDome('day');
    this.scene.add(this.sky);

    this.ocean = new Ocean('day', 14000, 190);
    const ou = this.ocean.material.uniforms;
    ou.uDeep.value = new THREE.Color(0x0a2b45);
    ou.uShallow.value = new THREE.Color(0x2b7796);
    ou.uSpecular.value = 0.24;
    ou.uLightDir.value.set(-0.70, 0.71, -0.10).normalize();
    this.ocean.setSeaState(2);
    this.scene.add(this.ocean.mesh);

    this.scene.add(buildLand());
    this.scene.add(buildSurf());

    this.hemi = new THREE.HemisphereLight(0xc3daf1, 0x51503f, 0.95);
    this.scene.add(this.hemi);
    // The sun is put where it lights the face the camera is looking at. That
    // face is the one with the embrasure in it, and since the guns lie in
    // enfilade the sun ends up over the camera's shoulder and a little to one
    // side — about thirty degrees off, which is enough for the concrete to
    // have a lit face and a shaded one instead of reading as a flat grey.
    this.sun = new THREE.DirectionalLight(0xfff1d6, 1.5);
    this.sun.position.set(-700, 700, -120);
    this.scene.add(this.sun);
    // And a cool bounce off the water, to keep the shadow side readable.
    const fill = new THREE.DirectionalLight(0x9dc0dc, 0.42);
    fill.position.set(620, 260, 520);
    this.scene.add(fill);

    this.scene.fog = new THREE.FogExp2(0xa9c4d8, 0.00035);

    this.battery = null;
    this.id = null;
    this.time = 0;
    this.orbit = { yaw: VIEW_YAW, pitch: VIEW_PITCH, range: 40, target: 40 };
    this.pointers = new Map();
    this.pinch = 0;
  }

  /** Put a different battery on the headland. */
  setBattery(id) {
    if (this.id === id) return;
    this.id = id;
    if (this.battery) {
      this.scene.remove(this.battery.group);
      this.battery.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.battery = buildBattery(id);
    this.battery.group.position.y = CREST;
    // Trained down the beach rather than straight out to sea. Half the Atlantic
    // Wall was sited that way on purpose — a casemate firing in enfilade shows
    // a blank wall to the ships it is shooting at — and it is also the only
    // arrangement that puts the embrasure and the sea in the same picture.
    this.battery.group.rotation.y = ENFILADE;
    this.scene.add(this.battery.group);

    this.ranged = false;
    this.orbit.range = this.orbit.target = this.fitRange();
    this.orbit.yaw = VIEW_YAW;
    this.orbit.pitch = VIEW_PITCH;
  }

  // -------------------------------------------------------------- camera --

  /** Drag to walk round it, wheel or pinch to close and open the range. */
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
        o.yaw -= dx * 0.006;
        o.pitch = clamp(o.pitch + dy * 0.005, PITCH_MIN, PITCH_MAX);
      } else if (this.pointers.size === 2 && this.pinch > 0) {
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

  /** The range at which the whole emplacement just fits the frame across. An
   *  eighty-eight is six metres over and Gustav is seventy, so this is worked
   *  out from the field of view rather than fixed. */
  fitRange() {
    const S = this.battery?.span || 26;
    const vHalf = (this.camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    // A gun in its emplacement on a headland is the subject, not the gun alone,
    // so this leaves the ground round it in the frame rather than cropping to
    // the concrete.
    return Math.max(S * 1.0, ((S * 0.62) / Math.tan(hHalf)) * 1.22);
  }

  minRange() { return (this.battery?.span || 26) * MIN_RANGE; }
  maxRange() {
    return Math.max((this.battery?.span || 26) * MAX_RANGE, this.fitRange() * 1.7);
  }

  nudge(dir) { this.orbit.yaw += dir * 0.35; }
  zoom(dir) {
    this.orbit.target = clamp(this.orbit.target * (1 + dir * 0.12),
      this.minRange(), this.maxRange());
    this.ranged = true;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.battery && !this.ranged) this.orbit.target = this.fitRange();
  }

  update(dt) {
    this.time += dt;
    const o = this.orbit;
    o.range += (o.target - o.range) * Math.min(1, dt * 6);

    const focusY = CREST + (this.battery?.focusY || 3);
    const cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
    this.camera.position.set(
      Math.sin(o.yaw) * cp * o.range,
      focusY + sp * o.range,
      Math.cos(o.yaw) * cp * o.range,
    );
    // Never underground: the ground is what the battery is standing on, and
    // going through it shows the inside of the headland.
    const floor = landY(this.camera.position.x, this.camera.position.z) + 2.2;
    if (this.camera.position.y < floor) this.camera.position.y = floor;
    this.camera.lookAt(0, focusY, 0);

    this.ocean.update(dt, this.camera.position);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

// ------------------------------------------------------- the datasheets --

const num = (n) => n.toLocaleString('en-US');

/** Seconds as a gun crew would say them: "10 s", "1 min", "40 min". */
function interval(s) {
  if (s < 90) return `${s % 1 ? s.toFixed(1) : s} s`;
  const m = s / 60;
  return `${m % 1 ? m.toFixed(1) : m} min`;
}

/** Metres as kilometres, and the yards beside them, which is how a gunner of
 *  1943 would have had it written on the range card. */
function distance(m) {
  return `${(m / 1000).toFixed(1)} km · ${num(Math.round(m / 0.9144 / 100) * 100)} yd`;
}

/** What the gun stands on, what it weighs, and who fights it. */
export function mountingSheet(b) {
  const rows = [['Mount', b.mount]];
  rows.push(['Weight', b.weight >= 1000
    ? `${num(Math.round(b.weight))} t`
    : `${b.weight >= 10 ? Math.round(b.weight) : b.weight} t`]);
  rows.push([b.armour >= 100 ? 'Turret armour' : 'Shield',
    b.armour ? `${num(b.armour)} mm` : 'None']);
  rows.push(['Crew', `${num(b.crew)} men`]);
  return rows;
}

/** The gun: how big, how often, how far. */
export function ordnanceSheet(b) {
  const rows = [
    ['Calibre', `${b.bore} L/${b.calibers}`],
    ['Barrels', b.barrels === 1 ? 'Single' : b.barrels === 2 ? 'Twin' : `${b.barrels}`],
    ['Reload', interval(b.reload)],
    ['Range', distance(b.range)],
  ];
  if (b.ceiling) rows.push(['Ceiling', `${(b.ceiling / 1000).toFixed(1)} km`]);
  return rows;
}

