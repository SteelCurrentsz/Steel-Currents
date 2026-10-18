// Fit each aeroplane's undercarriage stroke to her own skin.
//
// For every type that raises her legs this swings them through their stroke
// for a spread of swings, rises and inboard travels, and keeps the one that
// leaves the least of any leg standing through the top of her -- at any point
// of the stroke, not on average -- and then the one that tucks it furthest up
// into her once it is home. What it prints is what goes into planekit's
// gearRig calls and the sculpts' gear specs.
//
//   node build/fit-gear.mjs [kind ...]
import * as THREE from '../vendor/three.module.js';
import * as K from '../client/js/render/planekit.js';
import { ZERO } from '../client/js/render/zeroModel.js';
import { SUISEI } from '../client/js/render/suiseiModel.js';

const kinds = process.argv.slice(2).length ? process.argv.slice(2)
  : ['wildcat', 'dauntless', 'avenger', 'tenzan', 'zero', 'suisei'];
const ray = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

for (const kind of kinds) {
  const g = new THREE.Group();
  const p = kind === 'avenger' || kind === 'tenzan'
    ? K[kind](g, 0, 0, 0, 0, false, true) : K[kind](g, 0, 0, 0, 0, false, {});
  p.userData.gear(0);
  g.updateMatrixWorld(true);
  const legs = [];
  p.traverse((o) => { if (o.userData.legFoot) legs.push(o.isMesh ? o.parent : o); });
  const isLeg = (o) => {
    for (let n = o; n; n = n.parent) if (legs.includes(n) || legs.includes(n.parent)) return true;
    return false;
  };
  const skin = [];
  p.traverse((o) => { if (o.isMesh && !isLeg(o)) skin.push(o); });
  const cache = new Map();
  const column = (x, z) => {
    const k = `${Math.round(x * 25)}|${Math.round(z * 25)}`;
    if (cache.has(k)) return cache.get(k);
    ray.set(new THREE.Vector3(x, 30, z), DOWN);
    const a = ray.intersectObjects(skin, false);
    ray.set(new THREE.Vector3(x, -30, z), UP);
    const b = ray.intersectObjects(skin, false);
    const c = a.length && b.length ? [b[0].point.y, a[0].point.y] : null;
    cache.set(k, c);
    return c;
  };
  const v = new THREE.Vector3();
  // How far any part of these legs stands through her top, and how far the
  // rest of them hangs under her, at a point of the stroke.
  const measure = (set) => {
    g.updateMatrixWorld(true);
    let above = 0;
    let below = 0;
    let n = 0;
    for (const leg of set) {
      leg.traverse((o) => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position;
        const step = Math.max(1, Math.floor(pos.count / 150));
        for (let i = 0; i < pos.count; i += step) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          const c = column(v.x, v.z);
          n++;
          if (!c) continue;
          above = Math.max(above, v.y - c[1]);
          below += Math.max(0, c[0] - v.y);
        }
      });
    }
    return { above, below: below / Math.max(1, n) };
  };
  const cost = (set) => {
    let worst = 0;
    for (const e of [0.25, 0.45, 0.65, 0.8, 0.9, 0.97]) {
      p.userData.gear(e);
      worst = Math.max(worst, measure(set).above);
    }
    p.userData.gear(0.97);
    return Math.max(0, worst) * 10 + measure(set).below;
  };
  const search = (set, apply, ranges) => {
    let best = null;
    const [A, Y, X] = ranges;
    for (let a = A[0]; a <= A[1] + 1e-9; a += A[2]) {
      for (let y = Y[0]; y <= Y[1] + 1e-9; y += Y[2]) {
        for (let x = X[0]; x <= X[1] + 1e-9; x += X[2]) {
          apply(a, y, x);
          const c = cost(set);
          if (!best || c < best.c) best = { c, a: +a.toFixed(2), y: +y.toFixed(2), x: +x.toFixed(2) };
        }
      }
    }
    apply(best.a, best.y, best.x);
    return best;
  };
  const mains = legs.filter((l) => Math.abs(l.getWorldPosition(new THREE.Vector3()).x) > 0.3);
  const tail = legs.filter((l) => !mains.includes(l));
  if (p.userData.gearFit) {
    const f = p.userData.gearFit;
    const m = search(mains, (a, y, x) => { f.main[0] = a; f.main[1] = y; f.main[2] = x; },
      [[1.2, 2.0, 0.05], [-0.4, 0.6, 0.05], [-0.4, 0.4, 0.1]]);
    const sgn = Math.sign(f.tail[0]) || 1;
    const t = search(tail, (a, y, x) => { f.tail[0] = sgn * a; f.tail[1] = y; f.tail[2] = x; },
      [[1.2, 2.0, 0.05], [-0.2, 0.6, 0.05], [-0.4, 0.4, 0.1]]);
    console.log(kind, `main: [${m.a}, ${m.y}, ${m.x}] (${m.c.toFixed(3)})`,
      `tail: [${sgn * t.a}, ${t.y}, ${t.x}] (${t.c.toFixed(3)})`);
  } else {
    const META = kind === 'zero' ? ZERO : SUISEI;
    for (const [k, set] of [['gearL', mains.filter((l) => l.getWorldPosition(new THREE.Vector3()).x < 0)],
      ['gearR', mains.filter((l) => l.getWorldPosition(new THREE.Vector3()).x > 0)], ['gearT', tail]]) {
      const spec = META[k];
      const sgn = Math.sign(spec.up) || 1;
      const side = k === 'gearT' ? 1 : (k === 'gearL' ? 1 : -1);
      const r = search(set, (a, y, x) => { spec.up = sgn * a; spec.tuck = y; spec.slide = side * x; },
        [[1.2, 2.0, 0.05], [-0.3, 0.6, 0.05], [-0.4, 0.4, 0.1]]);
      console.log(kind, k, `{ up: ${spec.up}, tuck: ${spec.tuck}, slide: ${spec.slide} } (${r.c.toFixed(3)})`);
    }
  }
}
