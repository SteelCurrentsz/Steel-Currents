// The mouths of the funnels you could look down. Most models draw a funnel as
// its outside plating and nothing more: from above, the eye goes down past
// the rim, through the backs of the plates on the far side, and finds the
// deck, the boilers' absence or the sea. Each such funnel gets a plate of soot
// just under its rim, the shape of the inside of the funnel at that height,
// measured here off the built ship and written to
// client/js/render/funnelMouths.js for buildShip to lay in.
//
//   node build/funnel-mouths.mjs [ship ...]     (all ships with funnels if none)
//
// A funnel is plated only where you can see down through it: rays straight
// down over it, drawn as the game draws them, that go past a face they only
// see the back of within a few metres of her rim.
import * as THREE from '../vendor/three.module.js';
import { writeFileSync, existsSync } from 'node:fs';
import { buildShipModel, loadShips } from '../client/js/render/ships.js';
import { SHIP_CLASSES } from '../shared/ships.js';

const OUT = new URL('../client/js/render/funnelMouths.js', import.meta.url);
const SAME = { maya: 'takao', tirpitz: 'bismarck', yamato: 'musashi', scheer: 'spee' };
const all = Object.keys(SHIP_CLASSES).filter((id) => SHIP_CLASSES[id].hull.funnels && !SAME[id]);
const ids = process.argv.slice(2).length ? process.argv.slice(2) : all;
const table = existsSync(OUT) ? { ...(await import(OUT.href)).FUNNEL_MOUTHS } : {};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rc = new THREE.Raycaster();

// Every triangle near a funnel, in the ship's frame, each mesh's side kept.
function crop(meshes, fx, fz, fy) {
  const out = []; const a = V(), b = V(), c = V();
  for (const m of meshes) {
    const P = m.geometry.attributes.position, I = m.geometry.index; if (!P) continue;
    const flip = m.matrixWorld.determinant() < 0;
    const pos = [];
    const n = I ? I.count : P.count;
    for (let t = 0; t < n; t += 3) {
      a.fromBufferAttribute(P, I ? I.getX(t) : t).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(P, I ? I.getX(t + 1) : t + 1).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(P, I ? I.getX(t + 2) : t + 2).applyMatrix4(m.matrixWorld);
      if (Math.min(a.x, b.x, c.x) > fx + 9 || Math.max(a.x, b.x, c.x) < fx - 9) continue;
      if (Math.min(a.z, b.z, c.z) > fz + 12 || Math.max(a.z, b.z, c.z) < fz - 12) continue;
      if (Math.max(a.y, b.y, c.y) < fy - 16) continue;
      if (flip) pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
      else pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
    if (!pos.length) continue;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.push(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: [].concat(m.material)[0].side })));
  }
  return out;
}

function hullOf(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const first = (near, o, d, far, nearest = 0) => { rc.set(o, d); rc.far = far; rc.near = nearest; return rc.intersectObjects(near, false)[0]; };
const sides = (near, on) => { for (const m of near) m.material.side = on ? THREE.DoubleSide : m.userData.side; };

for (const id of ids) {
  await loadShips([id]);
  const cls = SHIP_CLASSES[id];
  const g = buildShipModel(id).group; g.updateMatrixWorld(true);
  const meshes = [];
  g.traverse((o) => { if (o.isMesh && o.geometry && !o.userData.inside) meshes.push(o); });
  const mouths = [];
  for (const [fx, fz, fy] of cls.hull.funnels) {
    const near = crop(meshes, fx, fz, fy);
    for (const m of near) m.userData.side = m.material.side;
    // Where the eye goes down into her: open to the sky, inside plating
    // that closes round within a few metres at some height near her top, and
    // what the game draws first straight down is well below that height.
    sides(near, false);
    const cand = [];
    for (let x = fx - 4.5; x <= fx + 4.5; x += 0.2) for (let z = fz - 6.3; z <= fz + 6.3; z += 0.2) {
      const seen = first(near, V(x, fy + 15, z), V(0, -1, 0), 45);
      cand.push([x, z, seen ? seen.point.y : -99]);
    }
    sides(near, true);
    const through = [];
    for (const [x, z, ys] of cand) {
      for (let y = fy + 1.5; y >= fy - 5; y -= 0.5) {
        if (ys > y - 2.5) break;
        const up = first(near, V(x, y, z), V(0, 1, 0), 40);
        if (up) break;
        let enc = true;
        for (let k = 0; k < 8 && enc; k++) { const a2 = (k * Math.PI) / 4; if (!first(near, V(x, y, z), V(Math.sin(a2), 0, Math.cos(a2)), 6, 0.05)) enc = false; }
        if (enc) { through.push([x, z, y]); break; }
      }
    }
    // Each opening the eye gets through on its own: a funnel, or each of the
    // pipes standing up out of a cap.
    const key = (x, z) => `${Math.round((x - fx) / 0.2)},${Math.round((z - fz) / 0.2)}`;
    const cell = new Map(through.map((q) => [key(q[0], q[1]), q]));
    const seen = new Set(); const groups = [];
    for (const [k, q] of cell) {
      if (seen.has(k)) continue;
      const grp = []; const st = [k]; seen.add(k);
      while (st.length) {
        const c = st.pop(); grp.push(cell.get(c)); const [i, j] = c.split(',').map(Number);
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
          const n = `${i + di},${j + dj}`; if (cell.has(n) && !seen.has(n)) { seen.add(n); st.push(n); }
        }
      }
      if (grp.length >= 6) groups.push(grp);
    }
    groups.sort((p, q) => q.length - p.length);
    const N = 72;
    const inRing = (r, x, z) => { let c = false; for (let i = 0, j = N - 1; i < N; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
    const taken = [];
    for (const grp of groups) {
      const left = grp.filter(([x, z]) => !taken.some((m) => inRing(m.ring, x, z)));
      if (left.length < 6) continue;
      let mx = left.reduce((s2, q) => s2 + q[0], 0) / left.length, mz = left.reduce((s2, q) => s2 + q[1], 0) / left.length;
      const near0 = left.reduce((b2, q) => (Math.hypot(q[0] - mx, q[1] - mz) < Math.hypot(b2[0] - mx, b2[1] - mz) ? q : b2));
      const top = Math.max(...left.map((q) => q[2]));
      let found = null;
      for (let y = Math.min(top + 0.6, fy + 1.5); y > Math.max(top - 6, fy - 5) && !found; y -= 0.1) {
        let cx = near0[0], cz = near0[1];
        for (let pass = 0; pass < 4; pass++) {
          const ring = [];
          for (let k = 0; k < N; k++) {
            const th = (2 * Math.PI * k) / N;
            const h = first(near, V(cx, y, cz), V(Math.sin(th), 0, Math.cos(th)), 7, 0.1);
            ring.push(h ? [h.point.x, h.point.z] : null);
          }
          if (ring.filter((q) => !q).length > N / 10) break;
          for (let k = 0; k < N; k++) if (!ring[k]) {
            let p = k, n = k; while (!ring[(p + N) % N]) p--; while (!ring[n % N]) n++;
            const A = ring[(p + N) % N], B = ring[n % N], t = (k - p) / (n - p);
            ring[k] = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
          }
          const ax = ring.reduce((s2, q) => s2 + q[0], 0) / N, az = ring.reduce((s2, q) => s2 + q[1], 0) / N;
          if (pass < 3 && Math.hypot(ax - cx, az - cz) > 0.05) { cx = ax; cz = az; continue; }
          const hit = left.filter(([x, z]) => inRing(ring, x, z)).length;
          const rr = ring.reduce((s2, q) => s2 + Math.hypot(q[0] - cx, q[1] - cz), 0) / N;
          // A funnel's or a pipe's mouth is round or oval: a crescent is the
          // gap between a funnel and the platform round it, which is not.
          const area = (P) => Math.abs(P.reduce((s2, q, i) => { const r2 = P[(i + 1) % P.length]; return s2 + q[0] * r2[1] - r2[0] * q[1]; }, 0)) / 2;
          const convex = area(ring) / area(hullOf(ring));
          if (hit >= left.length / 2 && rr > 0.3 && rr < 6 && convex > 0.85) found = { y, ring, cx, cz };
          break;
        }
      }
      if (!found) { console.log(`${id} z ${fz}: an opening of ${left.length} rays near ${mx.toFixed(1)}, ${mz.toFixed(1)} that no ring closes`); continue; }
      taken.push(found);
      const y = +(found.y - 0.25).toFixed(2), { cx, cz } = found;
      const pts = found.ring.flatMap(([x, z]) => {
        const dx = x - cx, dz = z - cz, r = Math.hypot(dx, dz) || 1, k = (r + 0.03) / r;
        return [+(cx + dx * k).toFixed(2), +(cz + dz * k).toFixed(2)];
      });
      mouths.push([y, +cx.toFixed(2), +cz.toFixed(2), pts]);
      console.log(`${id} z ${fz}: ${left.length} rays through; mouth at ${y} m round ${cx.toFixed(2)}, ${cz.toFixed(2)}`);
    }
  }
  if (mouths.length) table[id] = mouths; else delete table[id];
}

const body = Object.entries(table).sort().map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join('\n');
writeFileSync(OUT, `// Generated by build/funnel-mouths.mjs: the soot plate laid under the rim of
// every funnel a captain could otherwise look straight down through. Each is
// [height, centre x, centre z, [x, z, x, z, ...] round the inside of her plating].
export const FUNNEL_MOUTHS = {
${body}
};
export const MOUTH_SAME = ${JSON.stringify(SAME)};
`);
