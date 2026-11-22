// Her plating, and what a shell does to it.
//
// A ship used to be destructible in six pieces. Each of her compartments was
// one welded buffer, and when the simulation said a compartment was gone the
// buffer was hidden: forty metres of hull, deck, guardrails and boats stopped
// existing between one frame and the next. Nothing about that is what happens
// to a ship, and it was the first thing anybody noticed.
//
// What actually happens is local. A shell arrives somewhere in particular,
// and if it gets through it takes a piece of plating with it -- about its own
// bore across for a clean hole, several times that where the burst has blown
// the side in. The hole stays where it was put. Enough of them in the same
// place and there is no side left there, and you are looking into the
// compartment behind it.
//
// So the plating is not six pieces. It is every triangle it is drawn out of --
// twenty to forty thousand of them on a big ship -- and any of them can be
// taken away on its own. That is the "super many pieces" without paying for
// them: the geometry is untouched and the draw calls are unchanged, and a
// triangle is removed by folding its three indices onto one vertex, which
// makes it degenerate. A degenerate triangle covers no pixels. The index
// buffer is the only thing that is written, and only the range that changed.
//
// The consequence worth having is that the hole is a real hole. There is a
// full interior behind the plating (see interior.js), so a shell that opens
// her up shows her frames and her machinery through the gap, and one that
// opens her below the waterline shows it to anybody who puts the camera under.

import * as THREE from '../../../vendor/three.module.js';
import { markable } from './pieces.js';
import { showWhenReady } from './warmgate.js';

// How the triangles are filed for lookup: one bucket per this many metres of
// her length. A hit only ever tests the buckets its own radius reaches, so
// punching a hole costs a few hundred triangle tests rather than forty
// thousand, and a ship being worked over by a secondary battery stays free.
const BUCKET = 6;

/**
 * How fine her plating is cut, in metres, and how far the cutting may go.
 *
 * A ship is drawn out of boxes, and the side of a hull box is two triangles
 * forty metres long. Taking one of those away for a shell hole takes half the
 * side of the ship with it; refusing to take it away leaves a shell that does
 * nothing at all. Both were wrong for the same reason -- the ship was not made
 * of enough pieces to be damaged in.
 *
 * So every piece of plating bigger than a square metre or two is cut down
 * before anybody shoots at it. It costs vertices and nothing else: the draw
 * calls are unchanged, because it is the same buffers with more triangles in
 * them, and the extra vertices are the whole price of a ship that can be holed
 * anywhere rather than in six places.
 *
 * Cut by area rather than by edge, because that is what decides how big a
 * hole looks: a long thin girder is already the width of a shell hole and
 * splitting it buys nothing, while a square of deck plating forty metres
 * across is the whole problem.
 */
const PIECE_AREA = 2.6;        // square metres, unless the settings say finer
const MAX_TRIS = 60000;        // per welded buffer

/**
 * How big a hole a round makes, in metres, and whether it makes one at all.
 *
 * The rule is the simulation's, not a rendering decision: a round that
 * bounced, shattered on the plate or went clean through without bursting has
 * not opened her plating, and nothing comes off her. One that got inside her
 * and burst takes a piece of her away -- about its own bore across for a
 * clean penetration, three or four times that for a burst that blows the side
 * in, and several metres for a magazine or a torpedo.
 *
 * This is the ragged hole in the plating, which is not the same number as the
 * area openHull floods her through: water goes through the effective orifice,
 * which is smaller than the tear because the edges are folded in and the
 * plating is still hanging in the way. The two are proportional -- roughly
 * two to one on the radius -- so a shell that opens a bigger hole in her side
 * also floods her faster, which is the part that has to agree.
 *
 * Returns 0 for anything that did not get through.
 */
export function holeRadius(kind, caliber) {
  const blown = { citadel: 9, he: 3.5, pen: 2.2, overpen: 2.2,
    bomb: 5.5, torpedo: 4.2 }[kind];
  if (!blown) return 0;
  // A floor only so that a round with no calibre on it still does something.
  // How big the hole has to be to be worth drawing is not decided here: the
  // burst is widened at the plating until it has actually taken a patch out
  // (see Plating.punch), which is a question about how finely the ship is cut
  // rather than about the shell.
  return Math.max(0.35, (caliber || 152) / 1000 * blown);
}

/**
 * The torn edge of a hole, and what makes one read as a hole at all.
 *
 * Taking the plating away leaves a clean-edged window into the ship. It is the
 * right hole in the right place and it does not look like one: real plating is
 * a quarter of an inch of steel, and a shell through it leaves a ragged mouth
 * with the metal peeled back off the burst -- bright torn edges, soot round
 * them, and blackness behind. Every one of those three is most of the effect,
 * and the geometry that was removed cannot supply any of them.
 *
 * So each hole gets a collar: a ring of petals standing on her plating, folded
 * inward, cut to no two the same. The soot is written into the plating's own
 * vertex colours by Plating.scorch, and what is behind is her interior, which
 * is already there.
 *
 * All of them on a ship are one batch and one draw call, flat shaded off the
 * screen-space derivatives so the petals catch the light like bent steel
 * without a normal being carried for any of them.
 */
const RIM_PETALS = 9;
const RIM_MAX = 150;

class Rims {
  constructor(group) {
    this.at = 0;
    this.live = 0;
    const n = RIM_MAX * RIM_PETALS * 6;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    // She is turned, heeled and sunk by her parent; the bounds of the batch
    // never help and recomputing them every hit does not pay.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    // Over the plating it stands on, never behind it.
    this.mesh.renderOrder = 2;
    // Her back going puts everything forward of the break in one group and
    // everything abaft it in another; a batch that spans the whole ship
    // belongs to neither. See ShipView.breakHer.
    this.mesh.userData.noSplit = true;
    group.add(this.mesh);
    this.geo = geo;
  }

  /**
   * A hole, at a point on her plating, facing the way that plating faces.
   *
   * `at` is what Plating.nearest handed back: the point and the normal. `r` is
   * how far the burst actually reached, which is how big the mouth is.
   */
  add(at, r) {
    const [x, y, z, nx, ny, nz] = at;
    if (nx === undefined) return;
    // A frame on the plate: the normal, and any two directions across it.
    let ux = 0, uy = 0, uz = 1;
    if (Math.abs(nz) > 0.9) { ux = 1; uy = 0; uz = 0; }
    // Across the normal, then across both: an orthonormal pair lying in the
    // plating whichever way the plating happens to face.
    let ax = uy * nz - uz * ny, ay = uz * nx - ux * nz, az = ux * ny - uy * nx;
    let l = Math.hypot(ax, ay, az) || 1;
    ax /= l; ay /= l; az /= l;
    const bx = ny * az - nz * ay, by = nz * ax - nx * az, bz = nx * ay - ny * ax;

    const slot = this.at % RIM_MAX;
    this.at++;
    this.live = Math.min(RIM_MAX, this.at);
    let w = slot * RIM_PETALS * 6 * 3;
    // Deterministic in the slot and the petal, so nothing here has to be
    // remembered and two clients tear the same ship the same way.
    const wob = (i, k) => {
      const h = ((slot * 73856093) ^ (i * 19349663) ^ (k * 83492791)) >>> 0;
      return (h % 1000) / 1000;
    };
    const put = (px, py, pz, c) => {
      this.pos[w] = px; this.pos[w + 1] = py; this.pos[w + 2] = pz;
      this.col[w] = c[0]; this.col[w + 1] = c[1]; this.col[w + 2] = c[2];
      w += 3;
    };
    for (let i = 0; i < RIM_PETALS; i++) {
      const a0 = (i / RIM_PETALS) * Math.PI * 2;
      const a1 = ((i + 1) / RIM_PETALS) * Math.PI * 2;
      // No two petals the same length and none of them square to the hole:
      // that irregularity is the whole difference between torn steel and a
      // washer.
      const ro0 = r * (1.02 + wob(i, 0) * 0.42);
      const ro1 = r * (1.02 + wob(i + 1, 0) * 0.42);
      const ri = r * (0.46 + wob(i, 1) * 0.24);
      const deep = r * (0.3 + wob(i, 2) * 0.55);
      // Soot at the outer edge where it lies on her paint, torn steel at the
      // lip where the metal has been opened up. Both dark: a shell hole is a
      // dark thing, and plating peeled off a burst is scorched on both faces
      // before it is anything else. Set light, the petals came out as white
      // paper flowers stuck to the side of the ship.
      const sootV = 0.045 + wob(i, 3) * 0.045;
      const soot = [sootV, sootV, sootV * 1.06];
      const tearV = 0.17 + wob(i, 4) * 0.13;
      const tear = [tearV, tearV * 0.93, tearV * 0.84];
      const on = (rad, ang, into) => {
        const c = Math.cos(ang), sn = Math.sin(ang);
        return [
          x + (ax * c + bx * sn) * rad + nx * into,
          y + (ay * c + by * sn) * rad + ny * into,
          z + (az * c + bz * sn) * rad + nz * into,
        ];
      };
      // A hair proud of the plating outside, folded well inside it at the lip.
      const o0 = on(ro0, a0, 0.04);
      const o1 = on(ro1, a1, 0.04);
      const i0 = on(ri, a0, -deep);
      const i1 = on(ri, a1, -deep);
      put(o0[0], o0[1], o0[2], soot);
      put(o1[0], o1[1], o1[2], soot);
      put(i1[0], i1[1], i1[2], tear);
      put(o0[0], o0[1], o0[2], soot);
      put(i1[0], i1[1], i1[2], tear);
      put(i0[0], i0[1], i0[2], tear);
    }
    const from = slot * RIM_PETALS * 6 * 3;
    const count = RIM_PETALS * 6 * 3;
    for (const a of [this.geo.attributes.position, this.geo.attributes.color]) {
      a.addUpdateRange(from, count);
      a.needsUpdate = true;
    }
    this.geo.setDrawRange(0, this.live * RIM_PETALS * 6);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mesh.material.dispose();
  }
}

/**
 * Scrapes and gouges on her paint: what a round that did not get in leaves.
 *
 * A shell that glances off a belt or breaks up on it does not open her, but
 * it does not leave her as she was either. It strips the paint off in a long
 * bright gouge where it skidded, or splashes a starburst of short scrapes
 * round the place it broke up -- bare steel showing through grey, and a darker
 * scuff where it struck. Every one on a ship is one batch and one draw call,
 * laid a hair proud of the plating it is on and moving with her.
 */
const SCAR_MAX = 600;

class Scars {
  constructor(group) {
    this.at = 0;
    this.live = 0;
    const n = SCAR_MAX * 6;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      vertexColors: true, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.renderOrder = 2;
    this.mesh.userData.noSplit = true;
    group.add(this.mesh);
    this.geo = geo;
  }

  /**
   * One strip on the plating: from `p` along `a` for `len`, `w` wide, lying
   * in the plane whose normal is `n`, tapering at both ends. `c` is its colour
   * down the middle; the edges are a little darker, the paint torn back.
   */
  strip(p, n, a, len, w, c) {
    const bx = n[1] * a[2] - n[2] * a[1], by = n[2] * a[0] - n[0] * a[2], bz = n[0] * a[1] - n[1] * a[0];
    const slot = this.at % SCAR_MAX;
    this.at++;
    this.live = Math.min(SCAR_MAX, this.at);
    let w0 = slot * 6 * 3;
    const lift = 0.025;
    const pt = (f, side) => {
      const taper = 1 - Math.abs(f * 2 - 1) * 0.75;
      return [
        p[0] + a[0] * len * f + bx * w * 0.5 * side * taper + n[0] * lift,
        p[1] + a[1] * len * f + by * w * 0.5 * side * taper + n[1] * lift,
        p[2] + a[2] * len * f + bz * w * 0.5 * side * taper + n[2] * lift,
      ];
    };
    const edge = [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55];
    const quad = [pt(0, -1), pt(0, 1), pt(1, 1), pt(0, -1), pt(1, 1), pt(1, -1)];
    const cols = [edge, c, c, edge, c, edge];
    for (let i = 0; i < 6; i++) {
      this.pos[w0] = quad[i][0]; this.pos[w0 + 1] = quad[i][1]; this.pos[w0 + 2] = quad[i][2];
      this.col[w0] = cols[i][0]; this.col[w0 + 1] = cols[i][1]; this.col[w0 + 2] = cols[i][2];
      w0 += 3;
    }
    for (const at of [this.geo.attributes.position, this.geo.attributes.color]) {
      at.addUpdateRange(slot * 18, 18);
      at.needsUpdate = true;
    }
    this.geo.setDrawRange(0, this.live * 6);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mesh.material.dispose();
  }
}

/**
 * The thickness of her, where she has been opened.
 *
 * A hole -- cut in her shaders (shellholes.js) or taken out of her a triangle
 * at a time (Plating.sweep) -- used to have no edge at all: her paint on one
 * side, the inside of her on the other, and nothing between, so that looking
 * in at an angle her side was a sheet of paper. A ship's side is not that. It
 * is the plate, an inch of it or a foot of armour, and behind the plate the
 * frames and stringers it is built on, half a metre deep, and in a big ship
 * the backing and the inner skin behind those.
 *
 * So every edge of every hole has a face: the cut through her, as deep as she
 * is there, square to the plate. The steel of the plate itself is bright where
 * it was torn; the framing behind it is the dark red of the primer every
 * ship's insides are painted in. One batch for the whole ship, one draw call,
 * written a few quads at a time as she is holed.
 *
 * Two kinds of edge feed it. A shell hole is a ring that follows the ragged
 * outline her shader cuts (see ringOutline, which is FRAG_CUT's, line for
 * line). Plating taken away by the triangle leaves an edge wherever a piece
 * that is gone meets one that is still there; each such edge gets a wall,
 * and the wall goes when the piece it stands on goes in its turn.
 */
const WALL_SLOTS = 2500;
// A slot: up to six quads. An edge wall is two lengths of three bands (the
// plate, the framing, the deep framing); a shell hole's segment is one length
// of those three and two rows of the bent lip round it.
const WALL_VERTS = 48;
const RING_SEGS = 36;

/**
 * How much bigger her shader cuts a shell hole than the hole itself: the
 * ring between is the plate round the hole, torn and bent in, drawn by the
 * walls (see Plating.ring). The same figure as HOLE_LIP in shellholes.js.
 */
export const LIP = 1.2;

/** The cut steel of the plate, and the primed framing behind it. */
const CUT = [0.46, 0.46, 0.47];
const CUT_EDGE = [0.58, 0.57, 0.56];
const FRAME = [0.13, 0.08, 0.065];
const FRAME_MID = [0.09, 0.06, 0.05];
const FRAME_DEEP = [0.05, 0.035, 0.03];
/** Where a lip has been scorched, at the very edge of the hole. */
const SCRAPED = [0.07, 0.065, 0.06];

/**
 * A smooth, irregular figure between 0 and 1 off a point in her frame: the
 * same anywhere two walls meet, so they meet without a step, and rounded
 * rather than random from one corner to the next, so the cut is rough the
 * way torn steel is and never a row of needles.
 */
function wob(x, y, z, k = 0) {
  const a = Math.sin(x * 2.9 + Math.sin(y * 2.1 + z * 1.3 + k) * 2.2 + z * 2.3 + k * 1.7);
  const b = Math.cos(y * 1.9 - x * 0.8 + Math.sin(z * 3.3 + k * 2.1) + k * 0.9);
  return 0.5 + 0.25 * a + 0.25 * b;
}

/**
 * How deep her framing runs at a point, against the plate: deepest at a
 * frame (every 1.2 m along her) or a stringer (every 1.6 m up her side), and
 * rounded off between, so the inside of a cut is the ribs she is built on
 * and not a smooth band.
 */
function framing(x, y, z) {
  const fz = Math.pow(0.5 + 0.5 * Math.cos(z * 5.236), 3);
  const fy = Math.pow(0.5 + 0.5 * Math.cos(y * 3.927), 3);
  const fx = Math.pow(0.5 + 0.5 * Math.cos(x * 3.927), 3);
  return Math.max(fz, fy * 0.8, fx * 0.6);
}

/**
 * How far the shader's hole reaches out along `u` (a unit vector in the
 * plate) for a hole at (x, y, z) of radius r, in a plate facing n -- the same
 * sum as FRAG_CUT in shellholes.js, before its lip is added on.
 */
function ringReach(x, y, z, r, n, u) {
  let s = (x * 0.137 + z * 0.071 + y * 0.29);
  s = (s - Math.floor(s)) * 6.2832;
  const lobe = Math.sin(u[0] * 5 + s) * Math.sin(u[1] * 4 + s * 1.7) * Math.sin(u[2] * 6 + s * 2.3)
    + 0.45 * Math.sin(u[0] * 11 + u[2] * 9 + s * 3.1) * Math.sin(u[1] * 7 + s * 0.6);
  // ax = normalize(cross(n, (sin s, 0.37, cos s)) + 1e-4)
  const vx = Math.sin(s), vy = 0.37, vz = Math.cos(s);
  let ax = n[1] * vz - n[2] * vy + 1e-4, ay = n[2] * vx - n[0] * vz + 1e-4, az = n[0] * vy - n[1] * vx + 1e-4;
  const l = Math.hypot(ax, ay, az) || 1;
  ax /= l; ay /= l; az /= l;
  const along = u[0] * ax + u[1] * ay + u[2] * az;
  return r * (1 + 0.24 * lobe) * (1 + 0.5 * along * along);
}

/** Whether a point is inside the cut of a shader hole `h` ([x, y, z, r, nx, ny, nz, thick]), lip and all. */
function inRing(h, px, py, pz) {
  const dx = px - h[0], dy = py - h[1], dz = pz - h[2];
  const off = dx * h[4] + dy * h[5] + dz * h[6];
  if (Math.abs(off) >= Math.max(0.9, h[3] * 0.6) + (h[7] || 0) + 0.6) return false;
  const qx = dx - h[4] * off, qy = dy - h[5] * off, qz = dz - h[6] * off;
  const d = Math.hypot(qx, qy, qz);
  if (d < 1e-3) return true;
  if (d > h[3] * 2.6) return false;
  return d < ringReach(h[0], h[1], h[2], h[3], [h[4], h[5], h[6]], [qx / d, qy / d, qz / d]) * LIP - 0.05;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dotV = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function wallMaterial() {
  return new THREE.MeshPhongMaterial({ vertexColors: true, side: THREE.DoubleSide, shininess: 6, specular: 0x0c0c0c });
}

/**
 * The faces of a cut edge as the battle first draws them: nothing, with the
 * same material and the same attributes, so their shader is built with
 * everything else when the battle opens and not at the first tear.
 */
export function wallStandIn() {
  const geo = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color']) geo.setAttribute(k, new THREE.BufferAttribute(new Float32Array(9), 3));
  geo.setDrawRange(0, 0);
  const m = new THREE.Mesh(geo, wallMaterial());
  m.frustumCulled = false;
  m.userData.alwaysDraw = true;
  m.castShadow = false;
  return m;
}

class Walls {
  constructor(group) {
    const n = WALL_SLOTS * WALL_VERTS * 3;
    this.pos = new Float32Array(n);
    this.nor = new Float32Array(n);
    this.col = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    // Lit as her plating is lit, so the lip round a hole is the same paint
    // under the same light as the plate it is part of.
    this.mesh = new THREE.Mesh(geo, wallMaterial());
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.userData.noSplit = true;
    this.mesh.userData.inside = true;
    this.mesh.raycast = () => {};
    group.add(this.mesh);
    this.geo = geo;
    this.next = 0;
    this.free = [];
    // Edge walls by the piece of plating they stand on and which of its
    // edges: "part:triangle:edge" to a slot.
    this.edges = new Map();
    this.byTri = new Map();
    // Shader holes' rings: each its hole and its slots, one a segment.
    this.rings = [];
    this.lo = Infinity;
    this.hi = -1;
    this.w = 0;
  }

  alloc() {
    if (this.free.length) return this.free.pop();
    if (this.next >= WALL_SLOTS) return -1;
    return this.next++;
  }

  touch(slot) {
    if (slot < this.lo) this.lo = slot;
    if (slot > this.hi) this.hi = slot;
  }

  /** Start writing a slot: everything left unwritten in it stays folded away. */
  begin(slot) {
    this.pos.fill(0, slot * WALL_VERTS * 3, (slot + 1) * WALL_VERTS * 3);
    this.w = slot * WALL_VERTS * 3;
    this.end = (slot + 1) * WALL_VERTS * 3;
    this.touch(slot);
  }

  /**
   * A quad p0 p1 p2 p3 (round its edge), coloured per corner, lit as the flat
   * face it is -- so the roughness of the cut catches the light -- and facing
   * the way `face` says.
   */
  quad(p0, p1, p2, p3, c0, c1, c2, c3, face) {
    if (this.w + 18 > this.end) return;
    let nn = crossV(sub(p1, p0), sub(p3, p0));
    const m = crossV(sub(p2, p1), sub(p0, p1));
    nn = [nn[0] + m[0], nn[1] + m[1], nn[2] + m[2]];
    let l = Math.hypot(nn[0], nn[1], nn[2]);
    if (l < 1e-9) { nn = face; l = 1; }
    if (dotV(nn, face) < 0) l = -l;
    const N = [nn[0] / l, nn[1] / l, nn[2] / l];
    const P = this.pos, NO = this.nor, C = this.col;
    const v = (p, c) => {
      const w = this.w;
      P[w] = p[0]; P[w + 1] = p[1]; P[w + 2] = p[2];
      NO[w] = N[0]; NO[w + 1] = N[1]; NO[w + 2] = N[2];
      C[w] = c[0]; C[w + 1] = c[1]; C[w + 2] = c[2];
      this.w += 3;
    };
    v(p0, c0); v(p1, c1); v(p2, c2);
    v(p0, c0); v(p2, c2); v(p3, c3);
  }

  /**
   * The cut through her along a line of points on her plating (`edge`, each
   * { p, n } with the way the plate faces there). `f` is the way into the
   * hole.
   *
   * What a hole in a ship shows is not a solid band as deep as she is but
   * how she is built: the plate itself, torn -- a bright ragged line of steel
   * as thick as it is -- and behind it, wherever the hole has crossed one,
   * the frames she is built on (a rib every 1.2 m along her) and the
   * stringers that run along her side or the beams under a deck, each a web
   * of steel standing in from the plate, cut off where the plate was, with
   * the dark of her insides showing between them. All of it off where it is,
   * so walls that meet agree where they meet.
   */
  cut(edge, depth, plate, f) {
    const th = Math.max(0.04, plate);
    const top = edge.map(({ p, n }) => {
      const j = (wob(p[0], p[1], p[2], 3) - 0.5) * 0.03;
      return [p[0] + n[0] * 0.008 + f[0] * j, p[1] + n[1] * 0.008 + f[1] * j, p[2] + n[2] * 0.008 + f[2] * j];
    });
    // The torn plate: its back edge ragged, never in a straight line.
    const back = edge.map(({ p, n }) => {
      const k = th * (0.85 + 0.4 * wob(p[0], p[1], p[2], 1));
      const j = (wob(p[0], p[1], p[2], 4) - 0.5) * 0.06;
      return [p[0] - n[0] * k + f[0] * j, p[1] - n[1] * k + f[1] * j, p[2] - n[2] * k + f[2] * j];
    });
    const shade = (p, c, k) => {
      const t = 0.8 + 0.4 * wob(p[0] * 1.7, p[1] * 1.7, p[2] * 1.7, k);
      return [c[0] * t, c[1] * t, c[2] * t];
    };
    for (let i = 0; i + 1 < edge.length; i++) {
      this.quad(top[i], top[i + 1], back[i + 1], back[i],
        shade(top[i], CUT_EDGE, 7), shade(top[i + 1], CUT_EDGE, 7), shade(back[i + 1], CUT, 8), shade(back[i], CUT, 8), f);
    }
    // The ribs it has crossed: frames athwart her every 1.2 m, and the
    // stringers along her side (or the beams along under a deck).
    const deck = Math.abs(edge[0].n[1]) > 0.6;
    const families = [[2, 1.2, 1], deck ? [0, 1.5, 0.75] : [1, 1.6, 0.7]];
    for (let i = 0; i + 1 < edge.length; i++) {
      const A = edge[i].p, B = edge[i + 1].p;
      for (const [ax, sp, deepK] of families) {
        const a0 = A[ax] / sp, b0 = B[ax] / sp;
        if (Math.abs(b0 - a0) < 1e-6) continue;
        for (let m = Math.floor(Math.min(a0, b0)) + 1; m <= Math.max(a0, b0); m++) {
          const t = (m - a0) / (b0 - a0);
          const c = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
          const na = edge[i].n, nb = edge[i + 1].n;
          let n = [na[0] + (nb[0] - na[0]) * t, na[1] + (nb[1] - na[1]) * t, na[2] + (nb[2] - na[2]) * t];
          const nl = Math.hypot(...n) || 1;
          n = [n[0] / nl, n[1] / nl, n[2] / nl];
          // Along the edge, for the rib's width.
          let tv = sub(B, A);
          const tl = Math.hypot(...tv) || 1;
          tv = [tv[0] / tl, tv[1] / tl, tv[2] / tl];
          const w = 0.07 + 0.03 * wob(c[0], c[1], c[2], 12);
          const D = th + (depth - th) * deepK * (0.85 + 0.15 * wob(c[0], c[1], c[2], 14));
          const at = (base, s, side, back2) => [
            base[0] - n[0] * s + tv[0] * side - f[0] * back2,
            base[1] - n[1] * s + tv[1] * side - f[1] * back2,
            base[2] - n[2] * s + tv[2] * side - f[2] * back2,
          ];
          // Its cut end, facing into the hole: bare steel, a little bent
          // over at its inner edge where it was torn.
          const bendOver = (wob(c[0], c[1], c[2], 15) - 0.5) * 0.05;
          this.quad(at(c, th, -w / 2, 0), at(c, th, w / 2, 0), at(c, D, w / 2, -bendOver), at(c, D, -w / 2, -bendOver),
            shade(c, CUT, 16), shade(c, CUT, 16), FRAME, FRAME, f);
          // And its web, going on in under the plate that is still there.
          // (Short: it is a stub of frame seen in section, and a long web
          // seen across the hole read as a tooth.)
          const L = 0.22;
          this.quad(at(c, th, 0, 0), at(c, th, 0, L), at(c, D, 0, L), at(c, D, 0, -bendOver),
            FRAME, FRAME_MID, FRAME_DEEP, FRAME_MID, tv);
        }
      }
    }
  }

  kill(slot) {
    if (slot < 0) return;
    this.pos.fill(0, slot * WALL_VERTS * 3, (slot + 1) * WALL_VERTS * 3);
    this.free.push(slot);
    this.touch(slot);
  }

  flush() {
    if (this.hi < 0) return;
    const from = this.lo * WALL_VERTS * 3, count = (this.hi - this.lo + 1) * WALL_VERTS * 3;
    for (const a of [this.geo.attributes.position, this.geo.attributes.normal, this.geo.attributes.color]) {
      // Added to whatever is still waiting to go up: two holes in one
      // frame are two ranges, and the first must not be dropped.
      a.addUpdateRange(from, count);
      a.needsUpdate = true;
    }
    this.geo.setDrawRange(0, this.next * WALL_VERTS);
    this.lo = Infinity;
    this.hi = -1;
  }

  /** Move every corner within `r` of a point in along -n, by `push(d2)`: a dent carrying the cut with it. */
  dentAll(cx, cy, cz, r, n, push) {
    const P = this.pos;
    const r2 = r * r;
    let lo = Infinity, hi = -1;
    for (let w = 0; w < this.next * WALL_VERTS * 3; w += 3) {
      const dx = P[w] - cx, dy = P[w + 1] - cy, dz = P[w + 2] - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r2 || (P[w] === 0 && P[w + 1] === 0 && P[w + 2] === 0)) continue;
      const k = push(d2);
      P[w] -= n[0] * k; P[w + 1] -= n[1] * k; P[w + 2] -= n[2] * k;
      if (w < lo) lo = w;
      hi = w;
    }
    if (hi >= 0) {
      const a = this.geo.attributes.position;
      a.addUpdateRange(lo, hi - lo + 3);
      a.needsUpdate = true;
    }
  }

  /** Whether a point is inside the cut of any shader hole (but `skip`). */
  inAnyRing(x, y, z, skip = null) {
    for (const R of this.rings) if (R.h !== skip && inRing(R.h, x, y, z)) return true;
    return false;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mesh.material.dispose();
  }
}

/** The colour she is painted at a piece of plating, as near as can be said. */
function paintOf(part, t) {
  const mesh = part.mesh;
  const geo = mesh.geometry;
  const mm = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const v = t != null ? part.idx.array[t * 3] : 0;
  // Her paint is her material's colour; a texture on it is the rivets and
  // the seams of her plates, a little darker on the whole.
  let c = mm && mm.color ? [mm.color.r, mm.color.g, mm.color.b] : [0.3, 0.32, 0.34];
  if (mm && mm.map) c = [c[0] * 0.85, c[1] * 0.85, c[2] * 0.85];
  const ca = geo.attributes.color;
  if (ca && t != null) {
    const div = ca.array instanceof Uint8Array && !ca.normalized ? 255 : 1;
    c = [c[0] * ca.getX(v) / div, c[1] * ca.getY(v) / div, c[2] * ca.getZ(v) / div];
  }
  return c;
}

/** Bare steel, where the paint has been taken off it. */
const STEEL = [0.62, 0.63, 0.64];
/** A scuff: steel bruised dark by the blow. */
const SCUFF = [0.2, 0.2, 0.21];

/**
 * Which way a piece of her plating faces.
 *
 * Off the normals she is drawn with, averaged over the triangle's three
 * corners. Those are the ones the light is already worked out from, so they
 * point out of the ship by construction -- which is the thing that matters
 * here, because a hole with its torn edges folded the wrong side of the plate
 * has them inside the ship where nobody can see them. Working the normal out
 * from the winding instead means guessing which side is outside, and every
 * guess that can be made from the geometry alone is wrong somewhere: her
 * forecastle deck is below the average height of her plating, so a guess made
 * off that folds the whole of her bow the wrong way.
 */
function faceNormal(part, t) {
  const geo = part.mesh.geometry;
  const ia = part.idx.array;
  const o = t * 3;
  const nrm = geo.attributes.normal;
  if (nrm) {
    const na = nrm.array;
    const a = ia[o] * 3, b = ia[o + 1] * 3, c = ia[o + 2] * 3;
    const nx = na[a] + na[b] + na[c];
    const ny = na[a + 1] + na[b + 1] + na[c + 1];
    const nz = na[a + 2] + na[b + 2] + na[c + 2];
    const l = Math.hypot(nx, ny, nz);
    if (l > 1e-4) return [nx / l, ny / l, nz / l];
  }
  // No normals on the buffer: fall back to the winding, which is right
  // wherever the mesh was wound the usual way round.
  const pa = geo.attributes.position.array;
  const a = ia[o] * 3, b = ia[o + 1] * 3, c = ia[o + 2] * 3;
  const ux = pa[b] - pa[a], uy = pa[b + 1] - pa[a + 1], uz = pa[b + 2] - pa[a + 2];
  const vx = pa[c] - pa[a], vy = pa[c + 1] - pa[a + 1], vz = pa[c + 2] - pa[a + 2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

export class Plating {
  /**
   * `group` is the ship, already welded. Everything in her that is plating --
   * anything mergeStatic gave an `out:` key to, which is her hull, her decks
   * and her upperworks -- is taken apart into triangles and filed by where it
   * is along her. Her insides are left alone: they are what shows through.
   */
  constructor(group, piece = PIECE_AREA) {
    this.parts = [];
    // Every hole's torn edge, in one batch on the ship herself.
    this.rims = new Rims(group);
    // And every scrape and gouge, in another.
    this.scars = new Scars(group);
    // Every triangle that has been taken out of her, so the damage survives a
    // rebuild and so we can say how open she is.
    this.torn = 0;
    this.total = 0;
    // The faces of her cut edges (see Walls): made the first time she is
    // opened, so a ship that is never holed carries none of it.
    this.group = group;
    this.cut = null;
    // How deep she is where she is cut, and how much of that is the plate:
    // (y, z, ny) to { depth, plate }, in metres. The ship's view sets it off
    // her armour; this is a light hull's.
    this.thickAt = () => ({ depth: 0.32, plate: 0.06 });
    let minZ = Infinity, maxZ = -Infinity;
    for (const child of group.children) {
      if (!child.isMesh || !child.geometry || !child.geometry.index) continue;
      const key = child.userData.mergeKey;
      if (typeof key !== 'string' || !key.startsWith('out:')) continue;
      const part = buildPart(child, key.slice(4), piece);
      if (!part) continue;
      part.pi = this.parts.length;
      this.parts.push(part);
      this.total += part.count;
      minZ = Math.min(minZ, part.minZ);
      maxZ = Math.max(maxZ, part.maxZ);
    }
    this.minZ = minZ === Infinity ? -1 : minZ;
    this.maxZ = maxZ === -Infinity ? 1 : maxZ;
  }

  /**
   * Take a piece out of her at a point in her own frame.
   *
   * Returns the number of triangles that went, which is how much of a hole it
   * actually made -- a shell into the middle of her side opens plating and
   * deck and reports it; the same shell into thin air abreast of her reports
   * nothing, and the caller can tell the difference.
   *
   * `soft` is for a burst that scorches rather than opens: the triangles at
   * the edge of the radius are kept, so a near miss does not take a neat
   * sphere out of her.
   */
  punch(...a) { return this.batch(() => this.punchNow(...a)); }

  /**
   * `fn`, with the faces of every edge it opens made once at the end rather
   * than after each of its sweeps. Working out the edge of a hole -- every
   * side of every piece of plating round it, as a string, in every buffer --
   * is most of what a hole costs, and a rent torn by her jaws or her claws is
   * a dozen sweeps laid over one another: done for each, it was a stall of a
   * tenth of a second in the middle of her biting. Nests: only the outermost
   * call does the work.
   */
  batch(fn, later = null) {
    if (this.pendingCuts) return fn();
    this.pendingCuts = [];
    try { return fn(); } finally {
      const all = this.pendingCuts;
      this.pendingCuts = null;
      if (all.length) {
        const by = new Map();
        for (const c of all) {
          const k = by.get(c.part);
          if (k) { for (const v of c.killed) k.push(v); } else by.set(c.part, c.killed.slice());
        }
        const cuts = [...by].map(([part, killed]) => ({ part, killed }));
        // Given `later`, the edge is handed to it to be made on a frame of
        // its own: the hole is there at once, its torn lip a frame after.
        if (later) later(() => this.edgeWalls(cuts)); else this.edgeWalls(cuts);
      }
    }
  }

  punchNow(x, y, z, r, soft = 0) {
    // Where the shell actually met her.
    //
    // The impact point comes from the simulation, which fights the battle on
    // hull boxes: length by beam by draught. The model is not a box -- she is
    // finer forward, she tumblehomes below the waterline and her upperworks
    // are a third of her beam -- so the point can be a metre or two outboard
    // of any plating, and a hole punched at it takes nothing off her at all.
    // That was every hit on a cruiser's bow and every hit on anybody's
    // superstructure.
    //
    // So the burst is centred on the nearest plating to where the shell was
    // reported, which is where the shell stopped. Beyond a few metres there
    // was nothing there to hit and nothing comes off.
    const near = this.nearest(x, y, z, Math.max(7, r * 3));
    if (!near) return 0;
    // A hole has to be a hole.
    //
    // Plating is cut into pieces of a couple of square metres, and a burst
    // that happens to sit inside one of them takes exactly one triangle off
    // her -- a sliver of daylight, not damage. So the burst is widened until
    // it has taken a patch out rather than a splinter, and no further: a
    // five-inch shell still does not open her like a torpedo does.
    let went = 0;
    let cut = r;
    for (let pass = 0; pass < 3 && went < 3; pass++) {
      cut = r * (1 + pass * 0.55);
      went += this.sweep(near, cut, pass === 0 ? soft : 0);
    }
    // And the plate round it dished in by the blow.
    if (went) this.dish(near[0], near[1], near[2], cut * 1.9, Math.min(0.5, 0.06 + cut * 0.08));
    // A hole, and only a hole: no collar of torn plating stood round the mouth
    // of it and no soot on her paint. Only a torpedo opens her now, and what
    // it leaves is the opening in her side with the inside of her showing
    // through it.
    return went;
  }

  /**
   * A hull torn open by another hull: not a round hole but a rent, longer one
   * way than the other and ragged all round, made of a few overlapping tears
   * of different sizes laid along her plating from where the two met. `seed`
   * makes the shape, so the same collision tears her the same way on every
   * client.
   */
  tear(...a) { return this.batch(() => this.tearNow(...a)); }

  tearNow(x, y, z, r, seed = 0) {
    const near = this.nearest(x, y, z, Math.max(7, r * 3));
    if (!near) return 0;
    let h = (seed * 2654435761 + 97) >>> 0;
    const rnd = () => { h = (h ^ (h << 13)) >>> 0; h = (h ^ (h >>> 17)) >>> 0; h = (h ^ (h << 5)) >>> 0; return (h % 10000) / 10000; };
    // Two directions in the face of the plating: along her, and across that.
    const nx = near[3] || 0, ny = near[4] || 0, nz = near[5] || 0;
    let ax = 0, ay = 0, az = 1;
    if (Math.abs(nz) > 0.8) { ax = 0; ay = 1; az = 0; }
    const dot = ax * nx + ay * ny + az * nz;
    ax -= nx * dot; ay -= ny * dot; az -= nz * dot;
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    const bx = ny * az - nz * ay, by = nz * ax - nx * az, bz = nx * ay - ny * ax;
    // Longer along her than up and down, by an amount of its own, and lopsided.
    const stretch = 1.3 + rnd() * 1.2;
    const lean = (rnd() - 0.5) * 0.8;
    const lobes = 3 + Math.floor(rnd() * 3);
    let went = this.sweep(near, r * (0.55 + rnd() * 0.2), 0.45);
    for (let i = 0; i < lobes; i++) {
      const along = (rnd() * 2 - 1) * r * stretch * 0.75;
      const across = (rnd() * 2 - 1) * r * 0.45 + along * lean;
      const p = [near[0] + ax * along + bx * across, near[1] + ay * along + by * across, near[2] + az * along + bz * across];
      went += this.sweep(p, r * (0.25 + rnd() * 0.4), 0.5);
    }
    // However it fell, some of her is gone.
    for (let pass = 1; pass < 3 && went < 2; pass++) went += this.sweep(near, r * (0.6 + pass * 0.4), 0);
    // And the plate round the rent pushed in, buckled by whatever did it.
    if (went) this.dish(near[0], near[1], near[2], r * 1.7, Math.min(0.6, 0.08 + r * 0.07));
    return went;
  }

  /**
   * A scrape along her: a ragged streak of plating stripped off her for
   * `len` metres, the tears no bigger than `w`. A small ship's stem on a
   * big ship's belt leaves this and nothing more.
   */
  scratch(x, y, z, len, w, seed = 0) {
    const near = this.nearest(x, y, z, 6);
    if (!near) return 0;
    let h = (seed * 2246822519 + 13) >>> 0;
    const rnd = () => { h = (h ^ (h << 13)) >>> 0; h = (h ^ (h >>> 17)) >>> 0; h = (h ^ (h << 5)) >>> 0; return (h % 10000) / 10000; };
    const n = Math.max(2, Math.round(len / Math.max(0.3, w)));
    const slope = (rnd() - 0.5) * 0.25;
    let went = 0;
    for (let i = 0; i < n; i++) {
      const f = (i / (n - 1) - 0.5) * len;
      const p = [near[0], near[1] + f * slope + (rnd() - 0.5) * w * 0.4, near[2] + f];
      went += this.sweep(p, w * (0.5 + rnd() * 0.6), 0.6);
    }
    if (!went) went = this.sweep(near, Math.max(0.5, w * 1.6), 0);
    return went;
  }

  /**
   * A dent: her plating pushed in round a point, deepest in the middle and
   * fairing out to nothing at `r`, and its light bent with it so it reads as
   * a dish in the steel. The plating is still there and still whole.
   */
  dent(x, y, z, r, depth, at = null) {
    // No smaller than the plating is cut: a dish narrower than the pieces
    // she is made of has no corner inside it to push in.
    r = Math.max(r, 2.4);
    const near = at || this.nearest(x, y, z, Math.max(5, r * 3));
    if (!near) return false;
    const [cx, cy, cz, nx, ny, nz] = near;
    const r2 = r * r;
    let any = false;
    // The cut faces of holes in it go in with it (see Walls).
    if (this.cut) this.cut.dentAll(cx, cy, cz, r, [nx, ny, nz], (d2) => { const f = 1 - d2 / r2; return depth * f * f; });
    for (const part of this.parts) {
      if (cz + r < part.minZ || cz - r > part.maxZ) continue;
      const geo = part.mesh.geometry;
      const P = geo.attributes.position;
      const N = geo.attributes.normal;
      const pa = P.array, na = N ? N.array : null;
      const ia = part.idx.array;
      const lo = Math.max(0, Math.floor((cz - r - 3 - part.minZ) / BUCKET));
      const hi = Math.min(part.buckets.length - 1, Math.floor((cz + r + 3 - part.minZ) / BUCKET));
      // Each corner once, though it is listed once per triangle it is in:
      // marked with this dent's number, not kept in a set made for it.
      const seen = part.seen || (part.seen = new Uint32Array(P.count));
      const stamp = (this.dentN = ((this.dentN || 0) + 1) >>> 0) || (this.dentN = 1);
      let vmin = Infinity, vmax = -1;
      for (let b = lo; b <= hi; b++) {
        const list = part.buckets[b];
        if (!list) continue;
        for (const t of list) {
          if (part.dead[t]) continue;
          for (let k = 0; k < 3; k++) {
            const v = ia[t * 3 + k];
            if (seen[v] === stamp) continue;
            seen[v] = stamp;
            const o = v * 3;
            const dx = pa[o] - cx, dy = pa[o + 1] - cy, dz = pa[o + 2] - cz;
            // Only plating facing the same way: a dent in her side does not
            // push her deck in, and it does not dish the other side of her.
            if (na && na[o] * nx + na[o + 1] * ny + na[o + 2] * nz < 0.6) continue;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= r2) continue;
            const f = 1 - d2 / r2;
            const push = depth * f * f;
            pa[o] -= nx * push; pa[o + 1] -= ny * push; pa[o + 2] -= nz * push;
            if (na) {
              // The slope of the dish, leaned into the normal: the side of it
              // toward the light is lit and the side away is dark.
              const d = Math.sqrt(d2) || 1;
              const slope = (4 * depth * f * d) / r2;
              na[o] += (dx / d) * slope; na[o + 1] += (dy / d) * slope; na[o + 2] += (dz / d) * slope;
              const l = Math.hypot(na[o], na[o + 1], na[o + 2]) || 1;
              na[o] /= l; na[o + 1] /= l; na[o + 2] /= l;
            }
            if (v < vmin) vmin = v;
            if (v > vmax) vmax = v;
            any = true;
          }
        }
      }
      if (vmax >= 0) {
        P.addUpdateRange(vmin * 3, (vmax - vmin + 1) * 3);
        P.needsUpdate = true;
        if (N) { N.addUpdateRange(vmin * 3, (vmax - vmin + 1) * 3); N.needsUpdate = true; }
        // Where her pieces are now, for the next hit to find them.
        for (let b = lo; b <= hi; b++) {
          const list = part.buckets[b];
          if (!list) continue;
          for (const t of list) {
            if (part.dead[t]) continue;
            const o = t * 3;
            const A = ia[o] * 3, B = ia[o + 1] * 3, C = ia[o + 2] * 3;
            part.cent[o] = (pa[A] + pa[B] + pa[C]) / 3;
            part.cent[o + 1] = (pa[A + 1] + pa[B + 1] + pa[C + 1]) / 3;
            part.cent[o + 2] = (pa[A + 2] + pa[B + 2] + pa[C + 2]) / 3;
          }
        }
      }
    }
    return any;
  }

  /**
   * The mark a round leaves that did not get through, at a point on her.
   *
   * `kind` is the simulation's: a ricochet is a long gouge where it skidded
   * along her, the way it was going (`dir`, in her frame), and nothing else;
   * a shatter is a dent where it struck and a starburst of short scrapes
   * round it; a shell that went clean through, or one that burst against her
   * without getting in, dents her round where it went. `bore` is its calibre
   * in metres. `seed` makes the shape the same on every client.
   */
  mark(x, y, z, kind, dir, bore, seed = 0) {
    const near = this.nearest(x, y, z, 6);
    if (!near) return false;
    let h = (seed * 2654435761 + 7) >>> 0;
    const rnd = () => { h = (h ^ (h << 13)) >>> 0; h = (h ^ (h >>> 17)) >>> 0; h = (h ^ (h << 5)) >>> 0; return (h % 10000) / 10000; };
    const n = [near[3], near[4], near[5]];
    const p = [near[0], near[1], near[2]];
    // A direction lying in the plating: the shell's own, flattened onto it.
    const inPlane = (v) => {
      const d = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
      const a = [v[0] - n[0] * d, v[1] - n[1] * d, v[2] - n[2] * d];
      const l = Math.hypot(a[0], a[1], a[2]);
      return l > 1e-3 ? [a[0] / l, a[1] / l, a[2] / l] : null;
    };
    const spin = (a, ang) => {
      const c = Math.cos(ang), sn = Math.sin(ang);
      const b = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
      return [a[0] * c + b[0] * sn, a[1] * c + b[1] * sn, a[2] * c + b[2] * sn];
    };
    let along = (dir && inPlane(dir)) || inPlane([0, 0, 1]) || inPlane([1, 0, 0]);
    if (!along) return false;
    const b = Math.max(0.04, bore || 0.15);
    if (kind === 'ricochet') {
      // It skidded: a gouge the way it was going, starting where it struck,
      // with a thinner scrape beside it where the driving band dragged.
      const len = 1.5 + b * 10 * (0.7 + rnd() * 0.6);
      along = spin(along, (rnd() - 0.5) * 0.25);
      // A dark groove where it bit in, the bright steel either side of it
      // where the paint was ploughed off.
      this.scars.strip(p, n, along, len, b * 1.8, STEEL);
      this.scars.strip(p, n, along, len * 0.85, b * 0.6, SCUFF);
      const off = spin(along, Math.PI / 2);
      const q = [p[0] + off[0] * b * 1.3, p[1] + off[1] * b * 1.3, p[2] + off[2] * b * 1.3];
      this.scars.strip(q, n, spin(along, (rnd() - 0.5) * 0.15), len * (0.3 + rnd() * 0.4), b * 0.4, STEEL);
      // And a shallow dent at the start of it, where it first bit.
      this.dent(p[0], p[1], p[2], b * 4, b * 0.25);
      return true;
    }
    if (kind === 'shatter') {
      // It broke up on her: a dish where it struck, a dark bruise in it, and
      // the pieces of it scraping away from there in every direction.
      this.dent(p[0], p[1], p[2], b * 6, b * 0.7);
      // The bruise where it struck: a dark, scraped patch, irregular.
      for (let i = 0; i < 3; i++) {
        const a = spin(along, rnd() * Math.PI);
        const back = b * (0.8 + rnd() * 0.8);
        this.scars.strip([p[0] - a[0] * back, p[1] - a[1] * back, p[2] - a[2] * back], n, a, back * 2,
          b * (1.6 + rnd() * 1.4), SCUFF);
      }
      // And a few of its pieces dragged off across her, mostly the way it
      // was going, none of them alike.
      const k = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < k; i++) {
        const a = spin(along, (rnd() - 0.5) * 2.4);
        const start = [p[0] + a[0] * b, p[1] + a[1] * b, p[2] + a[2] * b];
        this.scars.strip(start, n, a, b * (1.5 + rnd() * 3), b * (0.4 + rnd() * 0.5), STEEL);
      }
      return true;
    }
    // Through and out, or burst against her: dished in round where it went,
    // the paint scraped off round the mouth of it.
    this.dent(p[0], p[1], p[2], b * 7, b * 0.9);
    for (let i = 0; i < 3; i++) {
      const a = spin(along, rnd() * Math.PI * 2);
      this.scars.strip(p, n, a, b * (2 + rnd() * 3), b * 0.25, STEEL);
    }
    return true;
  }

  /**
   * Plating round a hole that is no longer joined to the rest of her.
   *
   * Two holes close together, or one that takes a ring out of a plate, can
   * leave a patch of plating standing in the air with nothing round it: a
   * sliver between holes, the middle of a plate whose edges have gone. Steel
   * does not hang there. So after a hole the plating near it is walked, corner
   * to shared corner, outward from where it is still joined to her; whatever
   * is not reached is cut out of her and handed back as pieces, in her own
   * frame, for the wreckage to drop into the sea.
   */
  islands(...a) { return this.batch(() => this.islandsNow(...a)); }

  islandsNow(x, y, z, r) {
    const zone = r * 2.2, ring = zone + 2.5;
    const zone2 = zone * zone, ring2 = ring * ring;
    const out = [];
    for (const part of this.parts) {
      if (z + ring < part.minZ || z - ring > part.maxZ) continue;
      const ia = part.idx.array;
      const lo = Math.max(0, Math.floor((z - ring - part.minZ) / BUCKET));
      const hi = Math.min(part.buckets.length - 1, Math.floor((z + ring - part.minZ) / BUCKET));
      const inner = [];
      const anchor = new Set();
      for (let b = lo; b <= hi; b++) {
        const list = part.buckets[b];
        if (!list) continue;
        for (const t of list) {
          if (part.dead[t]) continue;
          const o = t * 3;
          const dx = part.cent[o] - x, dy = part.cent[o + 1] - y, dz = part.cent[o + 2] - z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < zone2) inner.push(t);
          else if (d2 < ring2) { anchor.add(ia[o]); anchor.add(ia[o + 1]); anchor.add(ia[o + 2]); }
        }
      }
      // A buffer with nothing of it outside the zone is a whole small thing
      // standing there, not a patch of a bigger plate; it is left alone.
      if (!inner.length || !anchor.size) continue;
      const byVert = new Map();
      for (const t of inner) {
        for (let k = 0; k < 3; k++) {
          const v = ia[t * 3 + k];
          let l = byVert.get(v);
          if (!l) byVert.set(v, (l = []));
          l.push(t);
        }
      }
      const held = new Set();
      const queue = [];
      for (const t of inner) {
        const o = t * 3;
        if (anchor.has(ia[o]) || anchor.has(ia[o + 1]) || anchor.has(ia[o + 2])) { held.add(t); queue.push(t); }
      }
      while (queue.length) {
        const t = queue.pop();
        for (let k = 0; k < 3; k++) {
          for (const u of byVert.get(ia[t * 3 + k]) || []) {
            if (!held.has(u)) { held.add(u); queue.push(u); }
          }
        }
      }
      const loose = inner.filter((t) => !held.has(t));
      if (!loose.length) continue;
      // Cut out of her, and kept as a piece of geometry of its own.
      const pa = part.mesh.geometry.attributes.position.array;
      const ca = part.mesh.geometry.attributes.color;
      let cx = 0, cy = 0, cz = 0;
      for (const t of loose) { cx += part.cent[t * 3]; cy += part.cent[t * 3 + 1]; cz += part.cent[t * 3 + 2]; }
      cx /= loose.length; cy /= loose.length; cz /= loose.length;
      const pos = new Float32Array(loose.length * 9);
      const col = new Float32Array(loose.length * 9);
      const idx = new Uint16Array(loose.length * 3);
      let from = Infinity, to = -1;
      const killed = [];
      loose.forEach((t, i) => {
        const o = t * 3;
        killed.push(t, ia[o], ia[o + 1], ia[o + 2]);
        for (let k = 0; k < 3; k++) {
          const v = ia[o + k] * 3;
          const w = (i * 3 + k) * 3;
          pos[w] = pa[v] - cx; pos[w + 1] = pa[v + 1] - cy; pos[w + 2] = pa[v + 2] - cz;
          const c = ca ? [ca.getX(ia[o + k]), ca.getY(ia[o + k]), ca.getZ(ia[o + k])] : [0.5, 0.52, 0.54];
          const div = ca && ca.array instanceof Uint8Array && !ca.normalized ? 255 : 1;
          col[w] = c[0] / div; col[w + 1] = c[1] / div; col[w + 2] = c[2] / div;
          idx[i * 3 + k] = i * 3 + k;
        }
        part.dead[t] = 1;
        const a = ia[o];
        ia[o + 1] = a; ia[o + 2] = a;
        if (o < from) from = o;
        if (o + 3 > to) to = o + 3;
      });
      flush(part, from, to);
      if (this.pendingCuts) this.pendingCuts.push({ part, killed }); else this.edgeWalls([{ part, killed }]);
      this.torn += loose.length;
      out.push({ pos, col, idx, x: cx, y: cy, z: cz, from: { x: cx, y: cy + 1, z: cz }, force: 0, drop: true });
    }
    return out;
  }

  /** One burst, of one size, centred on a piece of her plating. */
  sweep(near, r, soft) {
    const x = near[0], y = near[1], z = near[2];
    const r2 = r * r;
    let went = 0;
    const cuts = [];
    for (const part of this.parts) {
      const killed = [];
      if (z + r < part.minZ || z - r > part.maxZ) continue;
      const lo = Math.max(0, Math.floor((z - r - part.minZ) / BUCKET));
      const hi = Math.min(part.buckets.length - 1,
        Math.floor((z + r - part.minZ) / BUCKET));
      let dirty = false;
      let from = Infinity, to = -1;
      for (let b = lo; b <= hi; b++) {
        const list = part.buckets[b];
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const t = list[i];
          if (part.dead[t]) continue;
          const o = t * 3;
          const dx = part.cent[o] - x;
          const dy = part.cent[o + 1] - y;
          const dz = part.cent[o + 2] - z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r2) continue;
          // The ragged edge: near the rim of the burst, plating is torn away
          // in patches rather than in a circle. Deterministic in the triangle
          // number so two clients tear the same ship the same way.
          if (soft > 0 && d2 > r2 * soft && ((t * 2654435761) >>> 0) % 100 < 55) continue;
          part.dead[t] = 1;
          killed.push(t, part.idx.array[o], part.idx.array[o + 1], part.idx.array[o + 2]);
          // Kept, when someone wants what was taken (see take).
          if (this.capture) this.keep(part, t);
          const a = part.idx.array[o];
          part.idx.array[o + 1] = a;
          part.idx.array[o + 2] = a;
          dirty = true;
          if (o < from) from = o;
          if (o + 3 > to) to = o + 3;
          went++;
        }
      }
      if (dirty) flush(part, from, to);
      if (killed.length) cuts.push({ part, killed });
    }
    if (this.pendingCuts) { for (const c of cuts) this.pendingCuts.push(c); } else this.edgeWalls(cuts);
    this.torn += went;
    if (went) this.checkRings(x, y, z, r);
    return went;
  }

  /** A triangle of her as it stands -- corners and paint -- into `capture`. */
  keep(part, t) {
    const pa = part.mesh.geometry.attributes.position.array;
    const ia = part.idx.array;
    const o = t * 3;
    const c = paintOf(part, t);
    const tri = new Float32Array(9);
    for (let k = 0; k < 3; k++) {
      const v = ia[o + k] * 3;
      tri[k * 3] = pa[v]; tri[k * 3 + 1] = pa[v + 1]; tri[k * 3 + 2] = pa[v + 2];
    }
    this.capture.push({ tri, c });
  }

  /**
   * `fn` run with everything it cuts out of her kept: the very plating that
   * came away, corner for corner and in her own paint, so that what is torn
   * out of her and carried off is that piece of her and nothing made up.
   * Returns [what fn returned, [{ tri, c }, ...]].
   */
  take(fn) {
    const was = this.capture;
    const got = [];
    this.capture = got;
    let r;
    try { r = fn(); } finally { this.capture = was; }
    if (was) for (const k of got) was.push(k);
    return [r, got];
  }

  /** The faces of her cut edges, made when first wanted. */
  get walls() {
    if (!this.cut) {
      this.cut = new Walls(this.group);
      showWhenReady(this.cut.mesh);
    }
    return this.cut;
  }

  /** How deep she is at a point with a plate facing n there: { depth, plate }. */
  depthAt(y, z, n) {
    const t = this.thickAt(y, z, n[1]) || {};
    const depth = Math.max(0.08, t.depth || 0.3);
    return { depth, plate: Math.min(depth * 0.8, Math.max(0.025, t.plate || 0.03)) };
  }

  /**
   * Every corner of her plating numbered, once: corners at the same point in
   * different buffers (her paints, her compartments) get the same number.
   * Worked out from where they stand the first time a hole's edge is made,
   * and good for the rest of the battle -- every dent and every bend moves a
   * corner in every buffer that shares it, by the same amount, so what was
   * one corner stays one corner. Edges matched on these numbers, rather than
   * on text made out of each corner's position every time, cost a fraction
   * of what they did. Returns a Map from each buffer's positions to its numbers.
   */
  cornerIds() {
    const byPos = this.cornerMap || (this.cornerMap = new Map());
    const out = this.cornerOf || (this.cornerOf = new Map());
    for (const part of this.parts) {
      const pa = part.mesh.geometry.attributes.position.array;
      if (out.has(pa)) continue;
      const n = pa.length / 3;
      const a = new Int32Array(n);
      for (let v = 0; v < n; v++) {
        const k = (Math.round(pa[v * 3] * 64) + 65536) * 17179869184
          + (Math.round(pa[v * 3 + 1] * 64) + 65536) * 131072
          + (Math.round(pa[v * 3 + 2] * 64) + 65536);
        let id = byPos.get(k);
        if (id === undefined) { id = byPos.size; byPos.set(k, id); }
        a[v] = id;
      }
      out.set(pa, a);
    }
    return out;
  }

  /**
   * After pieces have been taken out of her: tidy the edge they left, bend
   * it, and give it its face.
   *
   * Tidied: a piece still there with two of its edges open is a sliver or a
   * point standing out into the hole -- her plating is cut into long thin
   * strips, and a hole across them leaves their ends sticking out like
   * needles -- and it goes too. Bent: every corner along the edge is pushed
   * in, a little more here and a little less there, so the plate round a hole
   * is torn and folded in as plate is and not a clean-cut window; armour too
   * thick to bend bends less. And then the face (see Walls.cut).
   *
   * Works across her buffers, because her plating is cut into one per paint
   * and per compartment and a hole runs across those as it likes. `cuts` is
   * [{ part, killed }], `killed` [triangle, a, b, c, ...] with the corners it
   * had before it was folded away.
   */
  edgeWalls(cuts) {
    cuts = cuts.filter((c) => c.killed.length);
    if (!cuts.length) return;
    const W = this.walls;
    // The same corner in every buffer that has it, by number (see cornerIds);
    // an edge, by its two corners.
    const ids = this.cornerIds();
    const key3 = (pa, v) => ids.get(pa)[v];
    const ek = (A, B) => (A < B ? A * 67108864 + B : B * 67108864 + A);
    let zlo = Infinity, zhi = -Infinity;
    // And how far across her and up and down her it runs: the edge of a hole
    // is near the hole, and only what is near it is looked at -- not every
    // piece of her, both sides and her deck, along the length the hole spans.
    let xlo = Infinity, xhi = -Infinity, ylo = Infinity, yhi = -Infinity;
    const remember = (part, killed) => {
      const gone = part.gone || (part.gone = new Map());
      for (let i = 0; i < killed.length; i += 4) {
        const t = killed[i];
        gone.set(t, [killed[i + 1], killed[i + 2], killed[i + 3]]);
        const cz = part.cent[t * 3 + 2];
        if (cz < zlo) zlo = cz;
        if (cz > zhi) zhi = cz;
        const cx = part.cent[t * 3], cy = part.cent[t * 3 + 1];
        if (cx < xlo) xlo = cx;
        if (cx > xhi) xhi = cx;
        if (cy < ylo) ylo = cy;
        if (cy > yhi) yhi = cy;
        // The walls the pieces that have gone stood on go with them.
        const key = `${part.pi}:${t}`;
        const had = W.byTri.get(key);
        if (!had) continue;
        for (const k of had) {
          const slot = W.edges.get(k);
          if (slot !== undefined) { W.kill(slot); W.edges.delete(k); }
        }
        W.byTri.delete(key);
      }
    };
    for (const { part, killed } of cuts) remember(part, killed);
    const near = this.parts.filter((part) => !(zhi + 3 < part.minZ || zlo - 3 > part.maxZ));
    const range = (part) => [Math.max(0, Math.floor((zlo - 3 - part.minZ) / BUCKET)),
      Math.min(part.buckets.length - 1, Math.floor((zhi + 3 - part.minZ) / BUCKET))];
    const far = (part, t) => {
      const cx = part.cent[t * 3], cy = part.cent[t * 3 + 1];
      return cx < xlo - 4 || cx > xhi + 4 || cy < ylo - 4 || cy > yhi + 4;
    };
    // Every edge of what has gone near here, and of what is still there.
    let open, live;
    // The corners on the edge of any hole near here: only plating with one
    // of those can have an open edge, and only those corners get bent.
    let rim;
    const survey = () => {
      open = new Map();
      live = [];
      rim = new Set();
      // What has gone, first: every edge of it is open...
      for (const part of near) {
        if (!part.gone) continue;
        const pa = part.mesh.geometry.attributes.position.array;
        const [lo, hi] = range(part);
        for (let b = lo; b <= hi; b++) {
          const list = part.buckets[b];
          if (!list) continue;
          for (const t of list) {
            if (!part.dead[t] || far(part, t)) continue;
            const c = part.gone.get(t);
            if (!c) continue;
            const A = key3(pa, c[0]), B = key3(pa, c[1]), C = key3(pa, c[2]);
            rim.add(A); rim.add(B); rim.add(C);
            const g = [part, t];
            open.set(ek(A, B), g); open.set(ek(B, C), g); open.set(ek(C, A), g);
          }
        }
      }
      // ...and of what is still there, what touches it.
      for (const part of near) {
        const pa = part.mesh.geometry.attributes.position.array;
        const ia = part.idx.array;
        const [lo, hi] = range(part);
        for (let b = lo; b <= hi; b++) {
          const list = part.buckets[b];
          if (!list) continue;
          for (const t of list) {
            if (part.dead[t] || far(part, t)) continue;
            const o = t * 3;
            const A = key3(pa, ia[o]), B = key3(pa, ia[o + 1]), C = key3(pa, ia[o + 2]);
            if (!rim.has(A) && !rim.has(B) && !rim.has(C)) continue;
            live.push([part, t, [ek(A, B), ek(B, C), ek(C, A)]]);
          }
        }
      }
    };
    // The slivers and points left standing out into the hole.
    for (let pass = 0; pass < 2; pass++) {
      survey();
      const more = new Map();
      for (const [part, t, keys] of live) {
        let n = 0;
        for (const k of keys) if (open.has(k)) n++;
        if (n < 2) continue;
        const o = t * 3;
        const ia = part.idx.array;
        const pa = part.mesh.geometry.attributes.position.array;
        // Only a small or a thin piece: a big plate with two sides gone is
        // still a plate.
        const A = [pa[ia[o] * 3], pa[ia[o] * 3 + 1], pa[ia[o] * 3 + 2]];
        const B = [pa[ia[o + 1] * 3], pa[ia[o + 1] * 3 + 1], pa[ia[o + 1] * 3 + 2]];
        const C = [pa[ia[o + 2] * 3], pa[ia[o + 2] * 3 + 1], pa[ia[o + 2] * 3 + 2]];
        const area2 = Math.hypot(...crossV(sub(B, A), sub(C, A)));
        const longest = Math.max(Math.hypot(...sub(B, A)), Math.hypot(...sub(C, B)), Math.hypot(...sub(A, C)));
        if (area2 > 8 && area2 / longest > 1.2) continue;
        let list = more.get(part);
        if (!list) more.set(part, (list = []));
        list.push(t, ia[o], ia[o + 1], ia[o + 2]);
        part.dead[t] = 1;
        if (this.capture) this.keep(part, t);
        const a0 = ia[o];
        ia[o + 1] = a0; ia[o + 2] = a0;
        flush(part, o, o + 3);
        this.torn++;
      }
      if (!more.size) break;
      for (const [part, killed] of more) remember(part, killed);
    }
    survey();
    // Every corner on the edge, bent in once: the same corner in every
    // buffer that shares it, so no seam opens between her paints.
    const corners = new Map();
    for (const part of near) {
      const pa = part.mesh.geometry.attributes.position.array;
      const ia = part.idx.array;
      const [lo, hi] = range(part);
      for (let b = lo; b <= hi; b++) {
        const list = part.buckets[b];
        if (!list) continue;
        for (const t of list) {
          if (part.dead[t] || far(part, t)) continue;
          for (let k = 0; k < 3; k++) {
            const v = ia[t * 3 + k];
            const key = key3(pa, v);
            if (!rim.has(key)) continue;
            let c = corners.get(key);
            if (!c) corners.set(key, (c = []));
            c.push(part, v, t);
          }
        }
      }
    }
    const bent = this.bent || (this.bent = new Set());
    const bend = (key, n, depth, plate) => {
      if (bent.has(key)) return;
      bent.add(key);
      const c = corners.get(key);
      if (!c) return;
      const pa0 = c[0].mesh.geometry.attributes.position.array;
      const x = pa0[c[1] * 3], y = pa0[c[1] * 3 + 1], z = pa0[c[1] * 3 + 2];
      // Thin plate folds; a foot of armour barely gives.
      const give = Math.min(1, Math.max(0.2, 1 - (plate - 0.03) * 3));
      const k = (0.08 + 0.32 * wob(x, y, z, 11)) * give;
      for (let i = 0; i < c.length; i += 3) {
        const part = c[i], v = c[i + 1], t = c[i + 2];
        const P = part.mesh.geometry.attributes.position;
        const pa = P.array;
        // (Once per vertex, though it is listed once per triangle.)
        if (pa[v * 3] !== x || pa[v * 3 + 1] !== y || pa[v * 3 + 2] !== z) continue;
        pa[v * 3] -= n[0] * k; pa[v * 3 + 1] -= n[1] * k; pa[v * 3 + 2] -= n[2] * k;
        P.addUpdateRange(v * 3, 3);
        P.needsUpdate = true;
        void t;
      }
    };
    for (const [part, t, keys] of live) {
      for (let e = 0; e < 3; e++) {
        const g = open.get(keys[e]);
        if (!g) continue;
        const key = `${part.pi}:${t}:${e}`;
        if (W.edges.has(key)) continue;
        const pa = part.mesh.geometry.attributes.position.array;
        const ia = part.idx.array;
        const o = t * 3;
        const va = ia[o + e], vb = ia[o + (e + 1) % 3];
        const mid = [(pa[va * 3] + pa[vb * 3]) / 2, (pa[va * 3 + 1] + pa[vb * 3 + 1]) / 2, (pa[va * 3 + 2] + pa[vb * 3 + 2]) / 2];
        // Inside a shell hole her shader has already cut away, there is no
        // edge to show: the ring round that hole is the edge.
        if (W.rings.length && W.inAnyRing(mid[0], mid[1], mid[2])) continue;
        const n = faceNormal(part, t);
        const d = this.depthAt(mid[1], mid[2], n);
        bend(key3(pa, va), n, d.depth, d.plate);
        bend(key3(pa, vb), n, d.depth, d.plate);
        const a = [pa[va * 3], pa[va * 3 + 1], pa[va * 3 + 2]];
        const b = [pa[vb * 3], pa[vb * 3 + 1], pa[vb * 3 + 2]];
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        // Facing the gap: across the plate, toward where the piece was.
        const [gp, gt] = g;
        let fv = crossV(n, sub(b, a));
        const gv = sub([gp.cent[gt * 3], gp.cent[gt * 3 + 1], gp.cent[gt * 3 + 2]], m);
        if (dotV(fv, gv) < 0) fv = [-fv[0], -fv[1], -fv[2]];
        const fl = Math.hypot(...fv) || 1;
        fv = [fv[0] / fl, fv[1] / fl, fv[2] / fl];
        const slot = W.alloc();
        if (slot < 0) { W.flush(); return; }
        W.begin(slot);
        // The plate along the edge is not cut off clean but torn, and folded
        // in: a flap of her, in her paint, reaching out over the hole by its
        // own amount at every point and bent in toward her insides by more
        // where it reaches further -- rounded from one point to the next, so
        // the edge is ragged without being a row of teeth.
        const give = Math.min(1, Math.max(0.15, 1 - (d.plate - 0.03) * 3));
        const flap = (q) => {
          const reach = (0.08 + 0.45 * wob(q[0], q[1], q[2], 21)) * give;
          const sink = reach * (0.4 + 0.9 * wob(q[0], q[1], q[2], 22));
          return [q[0] + fv[0] * reach - n[0] * sink, q[1] + fv[1] * reach - n[1] * sink, q[2] + fv[2] * reach - n[2] * sink];
        };
        const ta = flap(a), tm = flap(m), tb = flap(b);
        const paint = paintOf(part, t);
        const sc = (k) => [paint[0] * k + SCRAPED[0] * (1 - k), paint[1] * k + SCRAPED[1] * (1 - k), paint[2] * k + SCRAPED[2] * (1 - k)];
        W.quad(a, m, tm, ta, paint, paint, sc(0.5), sc(0.5), n);
        W.quad(m, b, tb, tm, paint, paint, sc(0.5), sc(0.5), n);
        W.cut([{ p: ta, n }, { p: tm, n }, { p: tb, n }], d.depth, d.plate, fv);
        W.edges.set(key, slot);
        const tk = `${part.pi}:${t}`;
        const list = W.byTri.get(tk);
        if (list) list.push(key); else W.byTri.set(tk, [key]);
      }
    }
    W.flush();
  }

  /**
   * The edge of a shell hole cut in her shaders: the plate round it torn and
   * bent in toward the hole, ragged and folded more in some places than
   * others, and then the cut through her at its edge, as deep as she is
   * there. `h` is the hole as shellholes.js keeps it: [x, y, z, r, nx, ny,
   * nz, thick]. Her shader cuts LIP times the hole; the ring between is
   * this lip, so the plate there is drawn bent rather than flat.
   */
  ring(h) {
    const W = this.walls;
    const n = [h[4], h[5], h[6]];
    // Two ways across the plate.
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(n[1]) > 0.8) { ux = 1; uy = 0; uz = 0; }
    let ax = uy * n[2] - uz * n[1], ay = uz * n[0] - ux * n[2], az = ux * n[1] - uy * n[0];
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    const bx = n[1] * az - n[2] * ay, by = n[2] * ax - n[0] * az, bz = n[0] * ay - n[1] * ax;
    const d = this.depthAt(h[1], h[2], n);
    const depth = Math.max(d.depth, (h[7] || 0) + 0.12);
    const plate = Math.min(depth * 0.8, Math.max(d.plate, h[7] || 0));
    // How far the plate is folded in at the hole: a fair way for thin
    // plating, hardly at all for heavy armour.
    const give = Math.min(1, Math.max(0.15, 1 - (plate - 0.03) * 3));
    const fold = Math.min(0.55, 0.06 + h[3] * 0.16) * give;
    const slab = Math.max(0.9, h[3] * 0.6) + (h[7] || 0);
    // On her plating where it is, not on the flat plane of the hole: her side
    // curves away under her. The cut is a slab either side of that plane, so
    // where she is inside it the edge is on her.
    const onHer = (p) => {
      const at = this.nearest(p[0], p[1], p[2], 2.2);
      if (!at) return null;
      const k = (p[0] - at[0]) * at[3] + (p[1] - at[1]) * at[4] + (p[2] - at[2]) * at[5];
      if (Math.abs(k) > slab) return null;
      // Plating turned away from the plate that was struck -- round her
      // bilge, over her deck edge -- is not the edge of this hole.
      if (at[3] * n[0] + at[4] * n[1] + at[5] * n[2] < 0.75) return null;
      return { p: [p[0] - at[3] * k, p[1] - at[4] * k, p[2] - at[5] * k], n: [at[3], at[4], at[5]], at };
    };
    const pts = [];
    for (let i = 0; i <= RING_SEGS; i++) {
      const th = (i / RING_SEGS) * Math.PI * 2;
      const u = [ax * Math.cos(th) + bx * Math.sin(th), ay * Math.cos(th) + by * Math.sin(th), az * Math.cos(th) + bz * Math.sin(th)];
      const rr = ringReach(h[0], h[1], h[2], h[3], n, u);
      const at = (k) => [h[0] + u[0] * rr * k, h[1] + u[1] * rr * k, h[2] + u[2] * rr * k];
      const outer = onHer(at(LIP));
      const midR = onHer(at(1 + (LIP - 1) * 0.5));
      const edge = onHer(at(1));
      if (!outer || !midR || !edge) { pts.push(null); continue; }
      const nn = edge.n;
      // Folded in by its own amount at every point round it: torn petals,
      // some folded well in and some hardly at all, and not a neat dish --
      // rounded off between, never a spike.
      const petals = 5 + Math.floor(wob(h[0], h[1], h[2], 13) * 4);
      const pet = Math.pow(Math.abs(Math.sin(th * petals * 0.5 + h[0] * 3.1 + h[2] * 1.7)), 0.8);
      const f = fold * (0.15 + 0.85 * pet) * (0.7 + 0.3 * wob(edge.p[0], edge.p[1], edge.p[2], 5));
      const sinkE = f, sinkM = f * (0.3 + 0.2 * wob(edge.p[0], edge.p[1], edge.p[2], 6));
      const e = [edge.p[0] - nn[0] * sinkE, edge.p[1] - nn[1] * sinkE, edge.p[2] - nn[2] * sinkE];
      const m = [midR.p[0] - nn[0] * sinkM, midR.p[1] - nn[1] * sinkM, midR.p[2] - nn[2] * sinkM];
      // A hair proud at its outside, where it meets her paint.
      const o = [outer.p[0] + outer.n[0] * 0.006, outer.p[1] + outer.n[1] * 0.006, outer.p[2] + outer.n[2] * 0.006];
      pts.push({ u, e, m, o, n: nn, paint: paintOf(this.parts[outer.at[6]], outer.at[7]) });
    }
    // Anything of the older rings this one has cut through goes.
    for (const R of W.rings) {
      for (let i = 0; i < R.slots.length; i++) {
        const sl = R.slots[i];
        if (sl < 0) continue;
        const m = R.mid[i];
        if (inRing(h, m[0], m[1], m[2])) { W.kill(sl); R.slots[i] = -1; }
      }
    }
    const R = { h, slots: [], mid: [] };
    for (let i = 0; i < RING_SEGS; i++) {
      const a = pts[i], b = pts[i + 1];
      if (!a || !b) { R.mid.push([h[0], h[1], h[2]]); R.slots.push(-1); continue; }
      const mid = [(a.e[0] + b.e[0]) / 2, (a.e[1] + b.e[1]) / 2, (a.e[2] + b.e[2]) / 2];
      R.mid.push(mid);
      let slot = -1;
      if (!W.inAnyRing(mid[0], mid[1], mid[2])) {
        slot = W.alloc();
        if (slot >= 0) {
          const f = [-(a.u[0] + b.u[0]) / 2, -(a.u[1] + b.u[1]) / 2, -(a.u[2] + b.u[2]) / 2];
          const fl = Math.hypot(...f) || 1;
          const fv = [f[0] / fl, f[1] / fl, f[2] / fl];
          W.begin(slot);
          // The lip: her paint at its outside, scraped and blackened where
          // it was torn, bent in toward the hole.
          const scuff = (c, k) => [c[0] * k + SCRAPED[0] * (1 - k), c[1] * k + SCRAPED[1] * (1 - k), c[2] * k + SCRAPED[2] * (1 - k)];
          const out = [a.n[0] + b.n[0], a.n[1] + b.n[1], a.n[2] + b.n[2]];
          W.quad(a.o, b.o, b.m, a.m, a.paint, b.paint, scuff(b.paint, 0.9), scuff(a.paint, 0.9), out);
          W.quad(a.m, b.m, b.e, a.e, scuff(a.paint, 0.9), scuff(b.paint, 0.9), scuff(b.paint, 0.45), scuff(a.paint, 0.45), out);
          // And the cut through her, from the bent edge in.
          W.cut([{ p: a.e, n: a.n }, { p: b.e, n: b.n }], depth, plate, fv);
        }
      }
      R.slots.push(slot);
    }
    W.rings.push(R);
    W.flush();
  }

  /** A shell hole's ring taken down: it has been cut out of her the old way instead. */
  unring(h) {
    if (!this.cut) return;
    const W = this.cut;
    const i = W.rings.findIndex((R) => R.h === h || (R.h[0] === h[0] && R.h[1] === h[1] && R.h[2] === h[2]));
    if (i < 0) return;
    for (const sl of W.rings[i].slots) W.kill(sl);
    W.rings.splice(i, 1);
    W.flush();
  }

  /** Rings standing where the plating round them has since gone. */
  checkRings(x, y, z, r) {
    if (!this.cut || !this.cut.rings.length) return;
    const W = this.cut;
    let any = false;
    for (const R of W.rings) {
      const dx = R.h[0] - x, dy = R.h[1] - y, dz = R.h[2] - z;
      if (dx * dx + dy * dy + dz * dz > (r + R.h[3] * 2.6 + 2) ** 2) continue;
      for (let i = 0; i < R.slots.length; i++) {
        if (R.slots[i] < 0) continue;
        const m = R.mid[i];
        if (!this.nearest(m[0], m[1], m[2], 1.9)) { W.kill(R.slots[i]); R.slots[i] = -1; any = true; }
      }
    }
    if (any) W.flush();
  }

  /**
   * The plate round a hole dished in by what made it: everything within `r`
   * of it pushed in along the way it faces, most at the hole and fairing out
   * to nothing, and the edge of the hole and its lip carried in with it.
   */
  dish(x, y, z, r, depth) {
    const near = this.nearest(x, y, z, Math.max(5, r));
    if (!near) return;
    this.dent(x, y, z, r, depth, near);
  }

  /**
   * What of her is under a point, in her own frame: the highest of her live
   * plating straight below (x, z) that is no higher than `y + above`, and
   * facing more up than sideways -- a deck, a deckhouse roof, the top of a
   * gun platform. Something loose lands on it, lies on it, and slides on it.
   *
   * Returns [y, nx, ny, nz] with the normal turned to face up, or null where
   * there is nothing of her under it (over the side, or over a hole).
   */
  floorUnder(x, y, z, above = 0.5) {
    const top = y + above;
    let bestY = -Infinity;
    let best = null;
    for (const part of this.parts) {
      if (z + BUCKET < part.minZ || z - BUCKET > part.maxZ) continue;
      const pa = part.mesh.geometry.attributes.position.array;
      const ia = part.idx.array;
      const cb = Math.floor((z - part.minZ) / BUCKET);
      for (let b = Math.max(0, cb - 1); b <= Math.min(part.buckets.length - 1, cb + 1); b++) {
        const list = part.buckets[b];
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const t = list[i];
          if (part.dead[t]) continue;
          const o = t * 3;
          // Cheap reject: its middle well off to the side, or above the top.
          if (Math.abs(part.cent[o] - x) > 4 || Math.abs(part.cent[o + 2] - z) > 4) continue;
          const a = ia[o] * 3, bb = ia[o + 1] * 3, c = ia[o + 2] * 3;
          const ax = pa[a], az = pa[a + 2];
          const bx = pa[bb], bz = pa[bb + 2];
          const cx = pa[c], cz = pa[c + 2];
          // Straight down onto it: inside the triangle seen from above.
          const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
          if (Math.abs(d) < 1e-6) continue;
          const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
          const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
          const l3 = 1 - l1 - l2;
          if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
          const hy = l1 * pa[a + 1] + l2 * pa[bb + 1] + l3 * pa[c + 1];
          if (hy > top || hy <= bestY) continue;
          // Its slope off the corners, not her shading normals: a deck
          // cambered for drainage is a slope a loose thing slides down.
          const ux = bx - ax, uy = pa[bb + 1] - pa[a + 1], uz = bz - az;
          const vx = cx - ax, vy = pa[c + 1] - pa[a + 1], vz = cz - az;
          let nx = uy * vz - uz * vy;
          let ny = uz * vx - ux * vz;
          let nz = ux * vy - uy * vx;
          const nl = Math.hypot(nx, ny, nz) || 1;
          nx /= nl; ny /= nl; nz /= nl;
          if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
          // A wall is not a floor.
          if (ny < 0.35) continue;
          bestY = hy;
          best = [hy, nx, ny, nz];
        }
      }
    }
    return best;
  }

  /**
   * The nearest piece of plating still on her to a point, or null.
   *
   * Returned as the triangle's own centre, so a burst is put on the plating
   * rather than in the air beside it, and with the way that plating faces --
   * which is what tells a hole whether it is in her side, her deck or the
   * front of her bridge, and which way to fold its edges.
   */
  nearest(x, y, z, within) {
    let best = within * within;
    let at = null;
    let won = null;
    for (const part of this.parts) {
      if (z + within < part.minZ || z - within > part.maxZ) continue;
      const lo = Math.max(0, Math.floor((z - within - part.minZ) / BUCKET));
      const hi = Math.min(part.buckets.length - 1,
        Math.floor((z + within - part.minZ) / BUCKET));
      for (let b = lo; b <= hi; b++) {
        const list = part.buckets[b];
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const t = list[i];
          if (part.dead[t]) continue;
          const o = t * 3;
          const dx = part.cent[o] - x;
          const dy = part.cent[o + 1] - y;
          const dz = part.cent[o + 2] - z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= best) continue;
          best = d2;
          at = [part.cent[o], part.cent[o + 1], part.cent[o + 2]];
          won = [part, t];
        }
      }
    }
    if (at && won) {
      const n = faceNormal(won[0], won[1]);
      // And which piece of her it is: [x, y, z, nx, ny, nz, part, triangle].
      at.push(n[0], n[1], n[2], won[0].pi, won[1]);
    }
    return at;
  }

  /**
   * Soot on the plating round a burst.
   *
   * A hole in a painted side is not a hole in a painted side for long: the
   * burst blackens two or three times its own radius of her, and that ring of
   * soot is most of what makes a hole read as damage rather than as a window.
   * Written into the same byte of colour per vertex the fittings are scorched
   * through -- see pieces.js -- so it costs a partial buffer upload and
   * nothing else.
   */
  scorch(x, y, z, r, amount = 0.75) {
    const r2 = r * r;
    const dark = 0.82 * amount;
    for (const part of this.parts) {
      if (z + r < part.minZ || z - r > part.maxZ) continue;
      markable(part.mesh);
      const col = part.mesh.geometry.attributes.color;
      if (!col) continue;
      const pos = part.mesh.geometry.attributes.position.array;
      const ca = col.array;
      const cent = part.cent;
      const ia = part.idx.array;
      let from = Infinity, to = -1;
      const lo = Math.max(0, Math.floor((z - r - part.minZ) / BUCKET));
      const hi = Math.min(part.buckets.length - 1,
        Math.floor((z + r - part.minZ) / BUCKET));
      for (let b = lo; b <= hi; b++) {
        const list = part.buckets[b];
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const t = list[i];
          const o = t * 3;
          const dx = cent[o] - x;
          const dy = cent[o + 1] - y;
          const dz = cent[o + 2] - z;
          if (dx * dx + dy * dy + dz * dz > r2) continue;
          for (let k = 0; k < 3; k++) {
            const v = ia[o + k];
            const p = v * 3;
            const ex = pos[p] - x, ey = pos[p + 1] - y, ez = pos[p + 2] - z;
            const e2 = ex * ex + ey * ey + ez * ez;
            // Outside the ring: nothing to darken (the shade would be white).
            if (e2 >= r2) continue;
            // Darkest at the lip and fading out, so the ring has an edge to it
            // rather than being a disc of grey.
            const want = 1 - dark * (1 - Math.sqrt(e2) / r) ** 1.4;
            const shade = Math.round(255 * want);
            for (let c = 0; c < 3; c++) {
              const q = p + c;
              if (ca[q] <= shade) continue;
              ca[q] = shade;
              if (p < from) from = p;
              if (p + 3 > to) to = p + 3;
            }
          }
        }
      }
      if (to > 0) {
        col.addUpdateRange(from, to - from);
        col.needsUpdate = true;
      }
    }
  }

  /**
   * Everything of hers between two stations, gone.
   *
   * Nothing in the game takes a compartment out of her wholesale any more --
   * her plating comes off where shells took it off, a hit at a time. This is
   * what is left of that: her back going. When she breaks, a few metres of her
   * either side of the break are torn away with it, and there is no way to
   * express that as a burst because it was not one.
   */
  strip(z0, z1, key = null) {
    let went = 0;
    const cuts = [];
    for (const part of this.parts) {
      if (key !== null && part.key !== key) continue;
      if (z1 < part.minZ || z0 > part.maxZ) continue;
      let from = Infinity, to = -1;
      const killed = [];
      for (let t = 0; t < part.count; t++) {
        if (part.dead[t]) continue;
        const o = t * 3;
        const cz = part.cent[o + 2];
        if (cz < z0 || cz > z1) continue;
        part.dead[t] = 1;
        killed.push(t, part.idx.array[o], part.idx.array[o + 1], part.idx.array[o + 2]);
        const a = part.idx.array[o];
        part.idx.array[o + 1] = a;
        part.idx.array[o + 2] = a;
        if (o < from) from = o;
        if (o + 3 > to) to = o + 3;
        went++;
      }
      if (to > 0) flush(part, from, to);
      if (killed.length) cuts.push({ part, killed });
    }
    this.edgeWalls(cuts);
    this.torn += went;
    return went;
  }

  /** How much of her plating has been shot off her, 0 to 1. */
  get openness() {
    return this.total ? this.torn / this.total : 0;
  }
}

/**
 * One welded buffer, taken apart into triangles.
 *
 * The centroids are worked out once and kept; they are what a hit is tested
 * against. Storing them costs twelve bytes a triangle -- half a megabyte for
 * a big ship, once, shared by nothing else -- which is the whole price of
 * this.
 */
function buildPart(mesh, key, piece = PIECE_AREA) {
  refine(mesh.geometry, piece, MAX_TRIS);
  const geo = mesh.geometry;
  const idx = geo.index;
  const pos = geo.attributes.position;
  const count = Math.floor(idx.count / 3);
  if (!count) return null;
  const cent = new Float32Array(count * 3);
  const pa = pos.array;
  const ia = idx.array;
  let minZ = Infinity, maxZ = -Infinity;
  for (let t = 0; t < count; t++) {
    const o = t * 3;
    const a = ia[o] * 3, b = ia[o + 1] * 3, c = ia[o + 2] * 3;
    const cx = (pa[a] + pa[b] + pa[c]) / 3;
    const cy = (pa[a + 1] + pa[b + 1] + pa[c + 1]) / 3;
    const cz = (pa[a + 2] + pa[b + 2] + pa[c + 2]) / 3;
    cent[o] = cx; cent[o + 1] = cy; cent[o + 2] = cz;
    if (cz < minZ) minZ = cz;
    if (cz > maxZ) maxZ = cz;
  }
  const nb = Math.max(1, Math.ceil((maxZ - minZ) / BUCKET) + 1);
  const buckets = new Array(nb);
  for (let t = 0; t < count; t++) {
    const b = Math.min(nb - 1, Math.floor((cent[t * 3 + 2] - minZ) / BUCKET));
    (buckets[b] || (buckets[b] = [])).push(t);
  }
  idx.setUsage(THREE.DynamicDrawUsage);
  return { mesh, key, idx, cent, count, minZ, maxZ, buckets,
    dead: new Uint8Array(count) };
}

/**
 * Cut a welded buffer down until no piece of it is bigger than `area`.
 *
 * Midpoint subdivision: a big triangle becomes four, and the new corners are
 * shared with whatever was on the other side of each edge -- the midpoints
 * are looked up by the pair of vertices they sit between -- so two plates that
 * were welded together stay welded.
 *
 * Done once, when the ship is built. Nothing here runs while she is being shot
 * at.
 */
function refine(geo, area, cap) {
  const p0 = geo.attributes.position;
  const n0 = geo.attributes.normal;
  // Her texture coordinates go through this as well. They were an
  // afterthought once, and the cost of forgetting them was the whole ship:
  // every vertex the subdivision added had no `uv`, so the attribute came out
  // shorter than the position it belongs to, and a plated mesh drawn with a
  // short buffer is drawn black. In battle -- and only in battle, because
  // nothing else refines her -- a ship was a black outline with her own decks
  // and frames showing through where the plating should have been.
  const u0 = geo.attributes.uv;
  // And her paint, for the one hull in the fleet that carries it per vertex
  // (every sculpted hull: see scheerHull.js). Left behind, it is the uv
  // fault again in a different buffer -- shorter than the positions, so the
  // whole of her plating was dropped from the draw and she went into battle
  // as her frames and her machinery with nothing round them.
  const c0 = geo.attributes.color;
  const i0 = geo.index;
  if (!i0 || !p0) return;
  const pos = Array.from(p0.array);
  const nor = n0 ? Array.from(n0.array) : null;
  const uvs = u0 ? Array.from(u0.array) : null;
  const cols = c0 ? Array.from(c0.array) : null;
  const cw = c0 ? c0.itemSize : 0;
  let tris = [];
  for (let i = 0; i < i0.count; i += 3) {
    tris.push(i0.array[i], i0.array[i + 1], i0.array[i + 2]);
  }
  const mid = new Map();
  const key = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  const midpoint = (a, b) => {
    const k = key(a, b);
    const had = mid.get(k);
    if (had !== undefined) return had;
    const m = pos.length / 3;
    pos.push((pos[a * 3] + pos[b * 3]) / 2,
      (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2,
      (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2);
    if (nor) {
      const x = (nor[a * 3] + nor[b * 3]) / 2;
      const y = (nor[a * 3 + 1] + nor[b * 3 + 1]) / 2;
      const z = (nor[a * 3 + 2] + nor[b * 3 + 2]) / 2;
      const l = Math.hypot(x, y, z) || 1;
      nor.push(x / l, y / l, z / l);
    }
    if (uvs) {
      uvs.push((uvs[a * 2] + uvs[b * 2]) / 2,
        (uvs[a * 2 + 1] + uvs[b * 2 + 1]) / 2);
    }
    if (cols) {
      for (let j = 0; j < cw; j++) cols.push((cols[a * cw + j] + cols[b * cw + j]) / 2);
    }
    mid.set(k, m);
    return m;
  };
  // Twice the area, which is the cross product's length: the factor of two
  // is constant on both sides and there is no reason to pay for it per
  // triangle.
  const big2 = (area * 2) * (area * 2);
  const wants = (a, b, c) => {
    const ax = pos[b * 3] - pos[a * 3];
    const ay = pos[b * 3 + 1] - pos[a * 3 + 1];
    const az = pos[b * 3 + 2] - pos[a * 3 + 2];
    const bx = pos[c * 3] - pos[a * 3];
    const by = pos[c * 3 + 1] - pos[a * 3 + 1];
    const bz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    return cx * cx + cy * cy + cz * cz > big2;
  };

  for (let pass = 0; pass < 7; pass++) {
    let split = false;
    const next = [];
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i], b = tris[i + 1], c = tris[i + 2];
      if (next.length / 3 + (tris.length - i) / 3 > cap || !wants(a, b, c)) {
        next.push(a, b, c);
        continue;
      }
      split = true;
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    tris = next;
    if (!split) break;
  }
  if (tris.length === i0.count) return;

  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (nor) geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (uvs) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (cols) {
    // Same array type and the same normalisation it came in with: scorch
    // writes bytes into it, and a colour that went in as bytes has to stay
    // bytes. Midpoints of two bytes are rounded back to one.
    const Arr = c0.array.constructor;
    const out = new Arr(cols.length);
    const whole = !(out instanceof Float32Array || out instanceof Float64Array);
    for (let j = 0; j < cols.length; j++) out[j] = whole ? Math.round(cols[j]) : cols[j];
    geo.setAttribute('color', new THREE.BufferAttribute(out, cw, c0.normalized));
  }
  const n = pos.length / 3;
  geo.setIndex(n > 65535
    ? new THREE.Uint32BufferAttribute(tris, 1)
    : new THREE.Uint16BufferAttribute(tris, 1));
  geo.computeBoundingSphere();
}

/**
 * Send the piece of the index buffer that changed, and only that piece.
 *
 * A ship's index buffer is a quarter of a megabyte; re-uploading all of it
 * for a single shell hole would cost more than everything else in the frame
 * put together. Three's update range does the arithmetic for us.
 */
function flush(part, from, to) {
  const idx = part.idx;
  if (idx.addUpdateRange) {
    // Added to what is already waiting to go up, not in place of it: a hole
    // is several sweeps in the one frame, and dropping the earlier ranges
    // left pieces of her standing that had been taken away.
    idx.addUpdateRange(from, to - from);
  } else if (idx.updateRange) {
    idx.updateRange.offset = from;
    idx.updateRange.count = to - from;
  }
  idx.needsUpdate = true;
}
