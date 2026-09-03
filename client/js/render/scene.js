// The battle world: sky, sea, islands, ship view-models and the camera rig.

import * as THREE from '../../../vendor/three.module.js';
import { Ocean, OCEAN_PRESETS } from './ocean.js';
import { Weather } from './weather.js';
import { buildShip } from './ships.js';
import { buildBattery } from './battery.js';
import { Effects } from './effects.js';
import { Shells, Flak } from './ordnance.js';
import { Torpedoes } from './torpedo.js';
import { Wake } from './wake.js';
import { Seakeeping } from './seakeeping.js';
import { QUALITY } from '../settings.js';
import {
  MAP_HALF, landMask, groundHeight, getWeather, islandRadius, islandHeight,
} from '../../../shared/world.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { makeRng, clamp } from '../../../shared/math.js';

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
// Closer together near the water, where the beach and the first of the slope
// are, and again at the summit; the shelf below the waterline needs only two.
const ISLE_RINGS = [
  0, 0.07, 0.14, 0.21, 0.28, 0.35, 0.42, 0.49, 0.56, 0.63,
  0.70, 0.76, 0.82, 0.87, 0.91, 0.945, 0.972, 0.99, 1, 1.14, 1.32,
];

/**
 * The colour of a piece of ground, by how high it stands and how steep it is.
 *
 * Height alone gives a hill painted in stripes, which is the one thing real
 * land never looks like. What breaks the banding is the slope: anything steeper
 * than about thirty degrees is rock, because soil does not stay on it, and
 * that is true at ten metres and at three hundred. So a cliff at the waterline
 * is grey, the shelf behind the beach is sand, the gentle flanks are scrub and
 * grass, and the tops go bare.
 *
 * `slope` is the fall of the ground, 0 flat and 1 at forty-five degrees.
 */
const GROUND = {
  seabed: [0.17, 0.22, 0.25],
  sand: [0.71, 0.66, 0.50],
  dune: [0.62, 0.60, 0.44],
  scrub: [0.40, 0.44, 0.28],
  grass: [0.24, 0.33, 0.18],
  upland: [0.30, 0.32, 0.23],
  rock: [0.40, 0.39, 0.36],
  crag: [0.30, 0.30, 0.29],
};

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function isleShade(h, slope = 0, grain = 0) {
  if (h < -1.5) return GROUND.seabed;
  // The soil line: steep ground is bare whatever height it is at.
  const bare = clamp((slope - 0.52) / 0.5, 0, 1);
  let soil;
  if (h < 1.5) soil = GROUND.sand;
  else if (h < 6) soil = mix(GROUND.sand, GROUND.dune, (h - 1.5) / 4.5);
  else if (h < 20) soil = mix(GROUND.dune, GROUND.scrub, (h - 6) / 14);
  else if (h < 75) soil = mix(GROUND.scrub, GROUND.grass, (h - 20) / 55);
  else soil = mix(GROUND.grass, GROUND.upland, Math.min(1, (h - 75) / 170));
  const stone = h > 120 ? mix(GROUND.rock, GROUND.crag, Math.min(1, (h - 120) / 160)) : GROUND.rock;
  const c = mix(soil, stone, bare);
  // A little variation vertex to vertex, so a flank is not one flat wash.
  const g = 1 + grain;
  return [clamp(c[0] * g, 0, 1), clamp(c[1] * g, 0, 1), clamp(c[2] * g, 0, 1)];
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
    // Enough spokes that the ridges and gullies the height field carries are
    // actually resolved rather than aliased into facets.
    const spokes = Math.max(48, Math.min(120, Math.round(isle.r / 8)));

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
          // Straight off the shared height field and nothing added: the hill
          // on the screen has to be the hill the shells and the gun platforms
          // are working from, or a battery cut to one stands in the other.
          y = islandHeight(isle, x, z);
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
    // How steep the ground is at a vertex, from its neighbours along the spoke
    // and round the ring: the rise over the run between the samples either
    // side of it. It is what decides whether a piece of ground is soil or rock.
    const fall = (a, b) => {
      const run = Math.hypot(px[a] - px[b], pz[a] - pz[b]);
      return run > 1 ? (py[a] - py[b]) / run : 0;
    };
    const slopeAt = (i, j) => {
      const along = fall(i * nr + Math.min(nr - 1, j + 1), i * nr + Math.max(0, j - 1));
      const round = fall((i + 1) % spokes * nr + j, ((i - 1) + spokes) % spokes * nr + j);
      return Math.hypot(along, round);
    };
    const grain = (k) => (((k * 2654435761) >>> 0) % 1000) / 1000 * 0.17 - 0.085;
    const put = (i, j) => {
      const k = i * nr + j;
      pos.push(px[k], py[k], pz[k]);
      const c = isleShade(py[k], slopeAt(i, j), grain(k + isle.shape));
      col.push(c[0], c[1], c[2]);
    };
    put(0, 0);                               // the summit, once
    const apex = base;
    const ring = (i, j) => base + 1 + i * (nr - 1) + (j - 1);
    for (let i = 0; i < spokes; i++) {
      for (let j = 1; j < nr; j++) put(i, j);
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
function batteryApron(world, at, span, foot = 0) {
  // The levelled ground is the emplacement's own size and no more -- but it is
  // its whole size. The platform has to carry everything the gun is built with,
  // outriggers, revetment, ready racks and all, or the pieces at the edge of it
  // hang off the side of the mound with nothing under them. `foot` is what the
  // model actually measures across the ground; the datasheet span is the floor
  // under that, for a piece whose model happens to be compact.
  const R = Math.max(3, span * 0.5, foot * 1.14);
  // How far the mound has to reach before it meets the ground again.
  //
  // The platform is cut at the height of the highest ground under it, so on a
  // slope the downhill side of it stands over a gap -- and how big that gap is
  // depends entirely on the hill. A fixed skirt was fine on a shoulder and
  // ended in mid-air on anything steeper, with the emplacement apparently
  // floating off the side of the hill. So the drop is measured, and the mound
  // is banked out far enough to come down it at about one in one and a quarter,
  // which is roughly the angle loose spoil stands at before it slides.
  let drop = 0;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const g0 = groundHeight(world, at.x + Math.sin(a) * R * 2.2, at.z + Math.cos(a) * R * 2.2);
    if (at.y - g0 > drop) drop = at.y - g0;
  }
  // Banked out to meet the ground, but not without limit: a gun sited on the
  // lip of a cliff would otherwise grow a ramp a hundred metres across.
  const reach = Math.min(R * 6, Math.max(R * 2.6, R + drop * 1.25));
  const OUT = reach / R;
  const RINGS = [1, ...[0.11, 0.26, 0.45, 0.68, 1].map((t) => 1 + (OUT - 1) * t)];
  const SPOKES = 40;
  const pos = [];
  const idx = [];
  const col = [];
  const put = (x, y, z, shade) => {
    pos.push(x, y, z);
    col.push(shade[0], shade[1], shade[2]);
  };
  // Spoil out of the hill it was dug from, not a slab of concrete. The pad was
  // a fixed pale grey that came out brighter than any ground in the game, so an
  // emplacement on a green headland sat on what looked like a golf ball. It
  // takes the colour of the ground at its own height and darkens it: bare
  // trodden earth on the platform, banked spoil round that, and the hillside's
  // own colour where the two meet, so the mound belongs to the hill.
  const here = isleShade(at.y, 0, 0);
  const tone = (k, g) => [
    Math.min(1, here[0] * k + g), Math.min(1, here[1] * k + g), Math.min(1, here[2] * k + g),
  ];
  const PAD = tone(0.70, 0.055);       // levelled earth and rubble
  const FILL = tone(0.85, 0.025);      // the spoil banked round it
  const EDGE = here;                   // where it meets the hill again
  // And an outline that is not a turned circle: spoil is thrown, not moulded.
  const seed = Math.abs(Math.round(at.x * 0.37 + at.z * 0.11));
  const ph = [(seed % 61) / 61 * 6.28, (seed % 37) / 37 * 6.28, (seed % 23) / 23 * 6.28];
  const wob = (th) => 1
    + 0.14 * Math.sin(th * 3 + ph[0])
    + 0.085 * Math.sin(th * 5 - ph[1])
    + 0.05 * Math.sin(th * 8 + ph[2]);

  put(0, 0, 0, PAD);                   // the middle of the platform
  for (let i = 0; i < SPOKES; i++) {
    const th = (i / SPOKES) * Math.PI * 2;
    const sn = Math.sin(th);
    const cs = Math.cos(th);
    const rough = wob(th);
    for (let k = 0; k < RINGS.length; k++) {
      // The platform itself stays a clean working circle -- it was levelled --
      // and everything banked outside it is ragged.
      const r = R * RINGS[k] * (k === 0 ? 1 : 1 + (rough - 1) * ((k - 1) / (RINGS.length - 2)));
      const x = sn * r;
      const z = cs * r;
      // Local height: the terrain out there relative to the pad, never above
      // it. Taken as the highest of the point itself and a small ring round it,
      // because what matters is not the ground at the sample but the ground
      // between the samples -- a spur that rises between two of them would come
      // up through the flat the two of them span.
      let y = 0;
      if (k > 0) {
        const wx = at.x + x;
        const wz = at.z + z;
        const near = R * 0.2;
        let g = groundHeight(world, wx, wz);
        for (let q = 0; q < 4; q++) {
          const th2 = (q / 4) * Math.PI * 2 + 0.7;
          const h = groundHeight(world, wx + Math.cos(th2) * near, wz + Math.sin(th2) * near);
          if (h > g) g = h;
        }
        y = Math.min(0, g - at.y);
        // The outermost ring is driven into the hillside rather than left
        // sitting on it, so the earthwork ends buried instead of in mid-air.
        if (k === RINGS.length - 1) y -= Math.max(3, span * 0.2);
      }
      const shade = k === 0 ? PAD
        : k >= RINGS.length - 2 ? EDGE
          : FILL;
      put(x, y, z, shade);
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

/** A ship as it appears on screen: hull, turrets, wake ribbon, damage state. */
/**
 * Weld a handful of geometries into one, for a shape that has to be instanced.
 *
 * Instancing draws a single geometry many times, so a shape made of four boxes
 * has to become one box-worth of triangles first. Positions and normals only:
 * nothing here is textured.
 */
/**
 * The same weld, but keeping the parts in material groups.
 *
 * Takes `[geometry, materialIndex]` pairs and returns one geometry with a
 * group per index, so an instanced mesh can be painted in more than one colour
 * -- which is the difference between an aeroplane and a silhouette.
 */
function weldGroups(parts) {
  const pos = [];
  const nrm = [];
  const groups = [];
  for (const [g, mi] of parts) {
    const flat = g.index ? g.toNonIndexed() : g;
    const start = pos.length / 3;
    pos.push(...flat.getAttribute('position').array);
    nrm.push(...flat.getAttribute('normal').array);
    groups.push([start, pos.length / 3 - start, mi]);
    if (flat !== g) flat.dispose();
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  for (const [s2, c, mi] of groups) out.addGroup(s2, c, mi);
  return out;
}

function weld(parts) {
  const pos = [];
  const nrm = [];
  for (const g of parts) {
    const flat = g.index ? g.toNonIndexed() : g;
    pos.push(...flat.getAttribute('position').array);
    nrm.push(...flat.getAttribute('normal').array);
    if (flat !== g) flat.dispose();
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return out;
}

export class ShipView {
  constructor(scene, classId, team, isSelf, ocean = null) {
    const built = buildShip(classId);
    this.group = built.group;
    this.turrets = built.turrets;
    // Everything else aboard that trains. The main battery is laid off the
    // snapshot; so are the secondary mountings and the tubes, because the
    // simulation trains those too. The light battery is laid here, off the
    // aircraft the scene is already drawing: a Bofors is not worth a wire
    // message and there are sixty of them on a battleship.
    this.secMounts = built.secMounts || [];
    this.aaMounts = built.aaMounts || [];
    this.torpMounts = built.torpMounts || [];
    this.classId = classId;
    this.cls = SHIP_CLASSES[classId];
    this.team = team;
    this.isSelf = isSelf;
    this.smokeTimer = 0;
    this.fireTimer = 0;
    this.sinking = 0;
    // Her own motion in the water, which is hers and not the sea's.
    this.sea = new Seakeeping(this.cls.hull);
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


  /**
   * Lay everything on her that trains.
   *
   * `sec` and `torp` are the bearings the simulation has her mountings on, in
   * her own frame. The light battery has no such list -- it follows whatever
   * aircraft is nearest and inside its own sector, and goes back to its rest
   * bearing when the sky is empty, which is what a gun crew does.
   */
  layMounts(sec, torp, planes, dt) {
    const lay = (node, want, rate) => {
      const rest = node.userData.rest || 0;
      const target = want - rest;
      let d = target - node.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      node.rotation.y += Math.max(-rate, Math.min(rate, d));
    };
    if (sec) {
      for (let i = 0; i < this.secMounts.length && i < sec.length; i++) {
        lay(this.secMounts[i], sec[i], 1);
      }
    }
    if (torp) {
      for (let i = 0; i < this.torpMounts.length && i < torp.length; i++) {
        lay(this.torpMounts[i], torp[i], 1);
      }
    }
    if (!this.aaMounts.length) return;
    // The nearest squadron, in her own frame.
    let want = null;
    let best = Infinity;
    for (const p of planes || []) {
      if (p.tm === this.team) continue;
      const dx = p.x - this.group.position.x;
      const dz = p.z - this.group.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > best || d2 > 36e6) continue;
      best = d2;
      want = Math.atan2(dx, dz) - this.group.rotation.y;
    }
    const rate = 1.6 * dt;
    for (const m of this.aaMounts) {
      const rest = m.userData.rest || 0;
      let aim = rest;
      if (want !== null) {
        let off = want - rest;
        while (off > Math.PI) off -= Math.PI * 2;
        while (off < -Math.PI) off += Math.PI * 2;
        // Round as far as her own structure lets her, and no further.
        aim = rest + Math.max(-1.9, Math.min(1.9, off));
      }
      lay(m, aim, rate);
    }
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

    // The sky rides with the camera.
    //
    // It used to be pinned to the middle of the battlefield, which is up to
    // sixteen thousand metres from wherever a captain actually is; the far side
    // of the dome then stood further off than the far plane and was clipped
    // clean away, and what showed through the hole was the black behind the
    // world -- a hard-edged wedge of night sitting over the sea in broad
    // daylight. Carried on the camera it is always the same distance off in
    // every direction, which is what a sky is.
    this.sky = skyDome(preset, q.drawDistance * 0.8, overcast);
    this.scene.add(this.sky);
    // No stars through cloud.
    this.stars = (preset === 'night' && overcast < 0.3) ? starField(600) : null;
    if (this.stars) this.scene.add(this.stars);

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
    // Kept, so the view can be put back the way it was when the camera comes up.
    this.airFog = { color: fogCol.clone(), density: this.scene.fog.density,
      sky: this.scene.background || null };
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

    this.effects = new Effects(this.scene, q.particles);
    this.weather = new Weather(this.scene, wx, { count: Math.round(9000 * q.particles) });

    this.camera = new THREE.PerspectiveCamera(58, 1, 2, q.drawDistance);
    this.shipViews = new Map();
    // The guns ashore. Built the first time one turns up in a snapshot, which
    // is also the first frame of the battle -- both sides sited them before it
    // started, so there is nothing to wait for.
    this.batteryViews = new Map();

    // The shells in the air: real projectiles, laid along their own line of
    // flight and sized off the bore that fired them. See ordnance.js.
    // Room for a fleet action: five ships with secondary batteries in local
    // control put a great many small shells in the air at once, and a shell
    // that is not drawn is a salvo the spotter cannot see.
    this.shells = new Shells(this.scene, 900);
    // The light battery's tracer and the black puffs it leaves behind.
    this.flak = new Flak(this.scene, 900);

    // The fish in the water and the rope of bubbles behind each of them.
    // See torpedo.js: the track is the weapon, as far as anybody conning a
    // ship is concerned.
    this.torpedoes = new Torpedoes(this.scene, this.ocean, 48);

    // A squadron in the air. Painted the way her aircraft actually were --
    // blue-grey over light grey -- and not in one colour: a single dark tone on
    // every face makes an aeroplane a black cut-out from every angle except
    // straight down-sun, which is the all-black aircraft you used to see come
    // off a carrier.
    const planeGeo = weldGroups([
      // Upper surfaces.
      [new THREE.BoxGeometry(2.9, 1.9, 13.6).translate(0, 0.55, 1), 0],
      [new THREE.BoxGeometry(17.5, 0.7, 4.0).translate(0, 0.35, 1.4), 0],
      [new THREE.BoxGeometry(7.4, 0.6, 2.4).translate(0, 0.5, -5.8), 0],
      [new THREE.BoxGeometry(0.7, 3.6, 2.6).translate(0, 2.0, -6.2), 0],
      [new THREE.BoxGeometry(2.0, 1.3, 2.4).translate(0, 1.5, 0.6), 0],
      // And the undersides, which is what you see of her most of the time.
      [new THREE.BoxGeometry(2.9, 1.5, 13.6).translate(0, -0.6, 1), 1],
      [new THREE.BoxGeometry(17.5, 0.55, 4.0).translate(0, -0.15, 1.4), 1],
      [new THREE.BoxGeometry(7.4, 0.5, 2.4).translate(0, 0.05, -5.8), 1],
    ]);
    this.planeMat = [
      new THREE.MeshLambertMaterial({ color: 0x4a617c }),
      new THREE.MeshLambertMaterial({ color: 0x9aa4ad }),
    ];
    this.planeMesh = new THREE.InstancedMesh(planeGeo, this.planeMat, 60);
    this.planeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.planeMesh.frustumCulled = false;
    this.scene.add(this.planeMesh);

    this.dummy = new THREE.Object3D();
  }

  /**
   * Put the camera under the water, or take it back out.
   *
   * Underwater is not just a camera position: the light goes green and stops
   * carrying, the surface becomes a ceiling you look up through rather than an
   * opaque sheet, and the sky is not there any more.
   */
  setUnderwater(on) {
    if (this.under === on) return;
    this.under = on;
    this.ocean.setUnder(on);
    // The sky is a dome, not a background colour, so it has to be taken away
    // rather than painted over -- and there is no sky under water.
    if (this.sky) this.sky.visible = !on;
    if (this.stars) this.stars.visible = !on;
    if (!this.airFog) return;
    if (on) {
      const deep = new THREE.Color(0x0a2531);
      this.scene.fog = new THREE.FogExp2(deep, 0.011);
      this.scene.background = deep;
    } else {
      this.scene.fog = new THREE.FogExp2(this.airFog.color, this.airFog.density);
      this.scene.background = this.airFog.sky || null;
    }
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
   * The apron and the ring belong to the ground and do not move.
   */
  getBatteryView(id, batteryId, team, at = null) {
    let v = this.batteryViews.get(id);
    if (!v) {
      const built = buildBattery(batteryId);
      const group = new THREE.Group();
      group.add(built.group);
      this.scene.add(group);
      // What turns is the mounting, not the emplacement. The whole model used
      // to be hung in a spinning group, so a battery coming onto a target
      // dragged its revetment, its decking and its ammunition round with the
      // barrel -- everything in the pit orbiting the pintle, which is what a
      // gun training at an odd angle looked like. A piece whose model has no
      // separate mounting falls back to turning the lot, which is right for a
      // field carriage and harmless for anything else.
      const spin = built.turn.length ? built.turn : [built.group];

      // Whose it is, read from a mile away: the same ring a hull carries.
      const ringGeo = new THREE.RingGeometry(built.span * 0.62, built.span * 0.72, 28);
      ringGeo.rotateX(-Math.PI / 2);
      const marker = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: team === 0 ? 0x6fd3a0 : 0xe2564f,
        transparent: true, opacity: 0.4, depthWrite: false,
      }));
      marker.position.y = 1.5;
      group.add(marker);

      // The ground it stands on, cut to fit the hill it stands on.
      if (at) group.add(batteryApron(this.world, at, built.span, built.foot));

      v = { group, spin, marker, span: built.span, batteryId, team, smokeTimer: 0 };
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
    const eye = this.camera.position;
    // Height is left alone: a dome that rose and fell with the bridge would
    // slide the horizon up and down the sky as the camera climbed.
    if (this.sky) this.sky.position.set(eye.x, 0, eye.z);
    if (this.stars) this.stars.position.set(eye.x, 0, eye.z);
    this.ocean.update(dt, eye);
    this.effects.update(dt);
    this.flak.update(dt);
    this.torpedoes.update(dt, this.torpsNow || [],
      (x, z) => this.ocean.heightAt(x, z));
    this.weather.update(dt, eye);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
