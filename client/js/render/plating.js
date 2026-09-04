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

export class Plating {
  /**
   * `group` is the ship, already welded. Everything in her that is plating --
   * anything mergeStatic gave an `out:` key to, which is her hull, her decks
   * and her upperworks -- is taken apart into triangles and filed by where it
   * is along her. Her insides are left alone: they are what shows through.
   */
  constructor(group, piece = PIECE_AREA) {
    this.parts = [];
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
    for (let pass = 0; pass < 3 && went < 3; pass++) {
      went += this.sweep(near, r * (1 + pass * 0.55), pass === 0 ? soft : 0);
    }
    return went;
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
   * rather than in the air beside it.
   */
  nearest(x, y, z, within) {
    let best = within * within;
    let at = null;
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
        }
      }
    }
    return at;
  }

  /**
   * Everything of hers between two stations, gone.
   *
   * This is a compartment being blown out of her rather than holed, and it is
   * the only wholesale removal left. It is still done as triangles, so it can
   * be run a slice at a time and read as the section coming apart instead of
   * vanishing -- see ShipView.setCondition.
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
  const i0 = geo.index;
  if (!i0 || !p0) return;
  const pos = Array.from(p0.array);
  const nor = n0 ? Array.from(n0.array) : null;
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
