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
    let minZ = Infinity, maxZ = -Infinity;
    for (const child of group.children) {
      if (!child.isMesh || !child.geometry || !child.geometry.index) continue;
      const key = child.userData.mergeKey;
      if (typeof key !== 'string' || !key.startsWith('out:')) continue;
      const part = buildPart(child, key.slice(4), piece);
      if (!part) continue;
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
  punch(x, y, z, r, soft = 0) {
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
  tear(x, y, z, r, seed = 0) {
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
  dent(x, y, z, r, depth) {
    // No smaller than the plating is cut: a dish narrower than the pieces
    // she is made of has no corner inside it to push in.
    r = Math.max(r, 2.4);
    const near = this.nearest(x, y, z, Math.max(5, r * 3));
    if (!near) return false;
    const [cx, cy, cz, nx, ny, nz] = near;
    const r2 = r * r;
    let any = false;
    for (const part of this.parts) {
      if (cz + r < part.minZ || cz - r > part.maxZ) continue;
      const geo = part.mesh.geometry;
      const P = geo.attributes.position;
      const N = geo.attributes.normal;
      const pa = P.array, na = N ? N.array : null;
      const ia = part.idx.array;
      const lo = Math.max(0, Math.floor((cz - r - 3 - part.minZ) / BUCKET));
      const hi = Math.min(part.buckets.length - 1, Math.floor((cz + r + 3 - part.minZ) / BUCKET));
      const seen = new Set();
      let vmin = Infinity, vmax = -1;
      for (let b = lo; b <= hi; b++) {
        const list = part.buckets[b];
        if (!list) continue;
        for (const t of list) {
          if (part.dead[t]) continue;
          for (let k = 0; k < 3; k++) {
            const v = ia[t * 3 + k];
            if (seen.has(v)) continue;
            seen.add(v);
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
  islands(x, y, z, r) {
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
      loose.forEach((t, i) => {
        const o = t * 3;
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
    for (const part of this.parts) {
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
    }
    this.torn += went;
    return went;
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
      at.push(n[0], n[1], n[2]);
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
    for (const part of this.parts) {
      if (z + r < part.minZ || z - r > part.maxZ) continue;
      markable(part.mesh);
      const col = part.mesh.geometry.attributes.color;
      if (!col) continue;
      const pos = part.mesh.geometry.attributes.position.array;
      const ca = col.array;
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
          const dx = part.cent[o] - x;
          const dy = part.cent[o + 1] - y;
          const dz = part.cent[o + 2] - z;
          if (dx * dx + dy * dy + dz * dz > r2) continue;
          for (let k = 0; k < 3; k++) {
            const v = part.idx.array[o + k];
            const p = v * 3;
            const d = Math.hypot(pos[p] - x, pos[p + 1] - y, pos[p + 2] - z);
            // Darkest at the lip and fading out, so the ring has an edge to it
            // rather than being a disc of grey.
            const want = 1 - 0.82 * amount * Math.max(0, 1 - d / r) ** 1.4;
            const q = v * 3;
            for (let c = 0; c < 3; c++) {
              const was = ca[q + c];
              const now = Math.min(was, Math.round(255 * want));
              if (now === was) continue;
              ca[q + c] = now;
              if (q < from) from = q;
              if (q + 3 > to) to = q + 3;
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
    for (const part of this.parts) {
      if (key !== null && part.key !== key) continue;
      if (z1 < part.minZ || z0 > part.maxZ) continue;
      let from = Infinity, to = -1;
      for (let t = 0; t < part.count; t++) {
        if (part.dead[t]) continue;
        const o = t * 3;
        const cz = part.cent[o + 2];
        if (cz < z0 || cz > z1) continue;
        part.dead[t] = 1;
        const a = part.idx.array[o];
        part.idx.array[o + 1] = a;
        part.idx.array[o + 2] = a;
        if (o < from) from = o;
        if (o + 3 > to) to = o + 3;
        went++;
      }
      if (to > 0) flush(part, from, to);
    }
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
  // (the Graf Spee's sculpt: see speeHull.js). Left behind, it is the uv
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
    idx.clearUpdateRanges?.();
    idx.addUpdateRange(from, to - from);
  } else if (idx.updateRange) {
    idx.updateRange.offset = from;
    idx.updateRange.count = to - from;
  }
  idx.needsUpdate = true;
}
