// The three hulls on the gate, as themselves.
//
// The gate's buttons were drawn as flat silhouettes in the ship's grey. They
// are her now: her own model, the one she fights in, lit as the yard lights
// her and turned a little off the beam -- bow toward the right and toward the
// eye -- so she reads as a ship standing in the water rather than a profile
// or a bow-on dot.
//
// Each is drawn once, as a still, by a small renderer of its own with a
// clear background, so the button's chart shows round her; the renderer is
// let go of as soon as the last of the three is painted. Until a hull's model
// has come down her silhouette stays where it is, so the gate is never empty.

import * as THREE from '../../vendor/three.module.js';
import { loadShips, buildShip } from './render/ships.js';

/** Which ship stands on which button. */
const HULLS = [
  { button: 'gate-apple', classId: 'enterprise' },
  { button: 'gate-guest', classId: 'grafzeppelin' },
  { button: 'gate-google', classId: 'shinano' },
];

// The still's size in pixels, about twice what a button shows it at.
const W = 720, H = 300;
// How far off her bow the eye stands (0 is dead ahead, a right angle is on
// her beam), and how far above her.
const YAW = -0.9;
const PITCH = 0.25;
// A long lens, as the yard uses: her proportions, not a wide angle's.
const FOV = 24;

let started = false;

/** Put each ship on her button, as her model comes in. Safe to call again. */
export function paintGateHulls() {
  if (started || typeof document === 'undefined') return;
  started = true;
  let painter = null;
  let left = HULLS.length;
  const done = () => {
    if (--left > 0 || !painter) return;
    painter.dispose();
    painter = null;
  };
  for (const h of HULLS) {
    const btn = document.getElementById(h.button);
    if (!btn) { done(); continue; }
    loadShips([h.classId], null, { quiet: true }).then(() => {
      try {
        painter = painter || makePainter();
        if (painter) painter.paint(btn, h.classId);
      } catch (e) {
        console.warn('Steel Currents: gate hull', h.classId, e);
      }
      done();
    }, () => done());
  }
}

function makePainter() {
  let r;
  try {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  r.setPixelRatio(1);
  r.setSize(W, H, false);
  r.setClearColor(0x000000, 0);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.1;
  // The sea is not drawn, so what is under it is not either: she is cut at
  // her waterline and sits on the button as she sits in the water.
  r.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.05)];

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xb4c0c9, 0x2a3138, 1.15));
  const sun = new THREE.DirectionalLight(0xf0e6d4, 1.6);
  sun.position.set(-420, 520, 380);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8496a6, 0.5);
  fill.position.set(380, 180, -420);
  scene.add(fill);
  const camera = new THREE.PerspectiveCamera(FOV, W / H, 1, 20000);

  return {
    paint(btn, classId) {
      const built = buildShip(classId);
      const g = built.group;
      g.position.y = -(g.userData.floatDown || 0);
      // Her mountings at rest, her lifts where they stand.
      g.userData.step?.(0);
      scene.add(g);
      g.updateMatrixWorld(true);
      // Framed on what is above the water: her length across the still.
      const box = new THREE.Box3();
      g.traverse((o) => {
        if (!o.isMesh || !o.visible || !o.geometry) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
        if (Number.isFinite(b.min.x) && Number.isFinite(b.max.x)) box.union(b);
      });
      box.min.y = Math.max(box.min.y, 0);
      const c = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const dir = new THREE.Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH));
      // Back far enough that her whole length, seen from here, fits across
      // the still with a little sea either side, and her masts fit under the top.
      const vHalf = (FOV * Math.PI) / 360;
      const hHalf = Math.atan(Math.tan(vHalf) * (W / H));
      const across = Math.abs(size.z * Math.sin(-YAW)) + Math.abs(size.x * Math.cos(YAW));
      const up = size.y * Math.cos(PITCH) + across * Math.sin(PITCH) * 0.5;
      const range = Math.max((across * 0.52) / Math.tan(hHalf), (up * 0.62) / Math.tan(vHalf), 30);
      camera.position.copy(c).addScaledVector(dir, range);
      camera.near = Math.max(0.5, range - size.length());
      camera.far = range + size.length() * 2;
      camera.updateProjectionMatrix();
      camera.lookAt(c);
      r.render(scene, camera);

      const out = document.createElement('canvas');
      out.width = W;
      out.height = H;
      out.className = 'hull hull-3d';
      out.setAttribute('aria-hidden', 'true');
      out.getContext('2d').drawImage(r.domElement, 0, 0);
      scene.remove(g);
      const flat = btn.querySelector('svg.hull');
      if (flat) flat.replaceWith(out);
      else btn.prepend(out);
    },
    dispose() {
      r.dispose();
      r.forceContextLoss?.();
    },
  };
}
