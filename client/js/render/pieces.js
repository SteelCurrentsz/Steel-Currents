// A ship as the pieces she is actually made of.
//
// Her plating is already destructible triangle by triangle (see plating.js),
// which is what makes a shell hole a hole. But a warship is not only plating.
// She is a funnel, a mast, a crane, a searchlight, two dozen carley floats, a
// motor boat on its chocks, ready-use lockers, davits, a rangefinder on the
// bridge roof -- a few hundred separate things bolted to her, each of which
// was welded into the same buffer as the rest of her so it could be drawn in
// one call. Welding hid them; it did not remove them. `mergeStatic` leaves a
// note on every welded mesh saying which vertices and triangles used to be
// which assembly, and this is what reads that register back and gives every
// one of those pieces a life of its own.
//
// What can happen to a piece:
//
//   dented      a burst close enough to shift it but not to take it away
//               pushes its plating in, away from the blast. The metal is
//               still there and still hers; it is just no longer fair.
//   scorched    fire and blast blacken it. It darkens where the heat was,
//               and stays dark: a ship that has burned looks like one.
//   torn off    a burst near enough and big enough parts it from her. It
//               stops being drawn as part of the ship and becomes a piece of
//               falling geometry with its own gravity -- see wreckage.js.
//   destroyed   the compartment it was standing on has gone, so it goes with
//               it. There is nothing left holding it.
//
// None of this costs a draw call. Dents are written into the position buffer
// the ship is already drawn from, scorch into a byte of colour per vertex,
// and a piece that comes off is removed by folding its triangles onto a
// single vertex -- the same trick plating.js uses for shell holes, because a
// degenerate triangle covers no pixels and the index buffer is the only thing
// that has to be touched.

import * as THREE from '../../../vendor/three.module.js';

/**
 * How hard a burst has to be, at a piece's own distance, to part it from her.
 *
 * Read as: a piece is torn off when the blast reaches it with more than this
 * much left in it. A shell bursting alongside a funnel does not take the
 * funnel off; a torpedo under it does. Between the two, the piece is dented
 * and scorched and stays where it is, which is what most of them did.
 */
const TEAR = 0.62;
// And how far into a burst a thing has to be standing to be torn off it at
// all, as a fraction of the blast radius. Outside that it is dented and
// blackened and stays where it is.
const TEAR_FRAC = 0.45;

/** Below this, a burst only marks a piece: it bends it and blackens it. */
const DENT = 0.12;

/** The deepest a burst will push plating in, in metres. */
const DENT_MAX = 0.9;

/**
 * What counts as a fitting -- a thing that can be knocked off her whole.
 *
 * Bigger than this across and it is structure: a deckhouse, a gun platform,
 * a length of hull. Those are dished and blackened by a burst and stay where
 * they are; a hole in them is plating.js's business, cut hole by hole.
 */
const FITTING_MAX = 9;

/**
 * And smaller than this and it is not worth throwing.
 *
 * A ship is modelled down to rail stanchions and deck bolts, and a burst
 * within a metre and a half of her side is within a metre and a half of two
 * hundred of them. Thrown, they are invisible and they fill the wreckage
 * budget that the boat and the searchlight wanted. They are still dented and
 * still blackened; they simply do not go over the side on their own.
 */
const FITTING_MIN = 0.35;


/**
 * Get a welded mesh ready to be marked.
 *
 * Two things: a byte of colour per vertex, which is what scorching writes
 * into, and her own copy of the material, because materials are shared between
 * every ship of a class and a ship that has been burned would otherwise
 * blacken her sisters.
 *
 * Shared with the plating, which scorches the same buffers round its holes --
 * see plating.js. Idempotent, and either of them may get there first.
 */
export function markable(mesh) {
  const geo = mesh.geometry;
  if (!geo.userData.marked) {
    geo.userData.marked = true;
    const n = geo.attributes.position.count;
    if (!geo.attributes.color) {
      const c = new Uint8Array(n * 3).fill(255);
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3, true));
    }
  }
  if (!mesh.material.userData.perShip) {
    mesh.material = mesh.material.clone();
    mesh.material.userData.perShip = true;
    mesh.material.vertexColors = true;
    mesh.material.needsUpdate = true;
  }
}

/**
 * Every piece of one ship, and what has happened to each.
 *
 * Built from the welded meshes after the ship is assembled. It holds no
 * geometry of its own: it is an index into hers.
 */
export class Fittings {
  constructor(group, { detail = 1 } = {}) {
    this.group = group;
    this.detail = detail;
    // One entry per assembly, gathered across every buffer it was welded
    // into: a funnel whose steel and whose black cap are different materials
    // is one funnel, and comes off as one.
    this.pieces = [];
    const byOwner = new Map();

    // The whole tree, not just the top of it: the Iowa is modelled inside a
    // scaled group and her welded buffers hang under it rather than on her.
    //
    // Anything that trains is left alone. A turret's pieces are recorded in
    // the frame it was built in, and a turret that has swung onto the beam is
    // no longer there -- so a burst would dent a piece of empty air where the
    // gunhouse used to be pointing. A mounting goes with the compartment it
    // is bolted to, which the ship view already does.
    const welded = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.userData.dynamic) continue;
        if (child.isMesh && child.userData.pieces) welded.push(child);
        walk(child);
      }
    };
    walk(group);

    for (const mesh of welded) {
      const list = mesh.userData.pieces;
      if (!list.length || !mesh.geometry.index) continue;
      this.prepare(mesh);
      for (const p of list) {
        let piece = byOwner.get(p.owner);
        if (!piece) {
          piece = {
            id: p.owner, name: p.name, spans: [],
            cx: 0, cy: 0, cz: 0, r: 0, weight: 0,
            // How badly it has been marked, 0 to 1, and whether it is still
            // on her at all.
            burn: 0, bent: 0, on: true,
          };
          byOwner.set(p.owner, piece);
          this.pieces.push(piece);
        }
        piece.spans.push({ mesh, v0: p.v0, vn: p.vn, i0: p.i0, ic: p.ic });
        // The assembly's centre is its parts' centres weighted by how big
        // they are, so a funnel's middle is the middle of the funnel and not
        // the middle of whichever ring happened to be welded first.
        const w = Math.max(0.05, p.r * p.r);
        piece.cx += p.cx * w; piece.cy += p.cy * w; piece.cz += p.cz * w;
        piece.weight += w;
      }
    }

    for (const piece of this.pieces) {
      const w = piece.weight || 1;
      piece.cx /= w; piece.cy /= w; piece.cz /= w;
      // And its radius is the furthest of its parts, measured from that
      // centre rather than from each part's own.
      let r = 0;
      for (const s of piece.spans) {
        const pos = s.mesh.geometry.attributes.position.array;
        for (let i = s.v0; i < s.v0 + s.vn; i++) {
          const o = i * 3;
          r = Math.max(r, Math.hypot(pos[o] - piece.cx, pos[o + 1] - piece.cy,
            pos[o + 2] - piece.cz));
        }
      }
      piece.r = r;
      // Structure stays. The hull bands and the deck are pieces like anything
      // else in the register, and a shell must not take forty metres of ship
      // off in one go -- that is what plating.js is for, hole by hole.
      piece.fitting = r >= FITTING_MIN && r <= FITTING_MAX;
    }

    // Filed by where they are along her, so a burst tests a few pieces rather
    // than all four hundred.
    this.buckets = new Map();
    for (const piece of this.pieces) {
      const b = Math.round(piece.cz / 8);
      if (!this.buckets.has(b)) this.buckets.set(b, []);
      this.buckets.get(b).push(piece);
    }
  }

  /** Get one of her welded buffers ready to be marked. See markable. */
  prepare(mesh) { markable(mesh); }

  /**
   * A burst on her, in her own frame.
   *
   * `power` is the blast in ship terms, the same scale the wreckage and the
   * explosions use: 1 a shell bursting inside her, 3 a torpedo, 6 a
   * compartment letting go, 10 a magazine. `r` is how far it reaches.
   *
   * Returns the pieces it tore off her, so the caller can throw them into the
   * air. Nothing else here has any effect, so it is safe to call on every hit.
   */
  blast(x, y, z, r, power = 1) {
    let shed = null;
    const r2 = r * r;
    // How many things one burst can take off her. A shell bursting on the
    // boat deck takes the boat, the davits and a couple of lockers -- not
    // every one of the two hundred separate objects modelled within a metre
    // and a half of it. A magazine takes everything it reaches.
    let budget = Math.round(Math.min(40, 3 + power * 3));
    const lo = Math.round((z - r) / 8);
    const hi = Math.round((z + r) / 8);
    for (let b = lo; b <= hi; b++) {
      const list = this.buckets.get(b);
      if (!list) continue;
      for (const piece of list) {
        if (!piece.on) continue;
        const d = Math.hypot(piece.cx - x, piece.cy - y, piece.cz - z);
        // Measured to the piece rather than to its centre: a burst against
        // the foot of a mast is against the mast.
        const gap = Math.max(0, d - piece.r);
        if (gap * gap > r2) continue;
        // What is left of the blast when it gets there. It falls off with the
        // square of the distance, because that is how a blast falls off.
        const reach = 1 - gap / r;
        const hit = power * reach * reach;
        if (hit < DENT) continue;
        // Big enough, close enough, and it comes off her -- if it is a thing
        // that can come off her. Her plating and her deckhouses are dished and
        // blackened by the same burst and stay where they are; a hole in them
        // is plating.js's business, hole by hole.
        //
        // Close enough as well as hard enough, because a burst blackens and
        // dishes a long way further than it tears. A shell on the boat deck
        // used to strip the searchlights, the ready-use lockers and the
        // whaler's davits out to the full radius of the blast, so one hit
        // cleared thirty feet of deck and the ship came apart at the edges
        // rather than where she was being hit.
        const near = gap <= r * TEAR_FRAC;
        if (hit > TEAR && near && piece.fitting && budget > 0) {
          budget--;
          (shed || (shed = [])).push(this.shed(piece, x, y, z, hit));
          continue;
        }
        this.dent(piece, x, y, z, Math.min(1, hit / TEAR));
        this.scorchPiece(piece, Math.min(0.85, hit * 0.5));
      }
    }
    return shed;
  }

  /**
   * Push a piece's plating in, away from the blast.
   *
   * Every vertex of it moves along the line from the burst, by how close it
   * was and how hard the burst was -- so the near side of a locker is stoved
   * in and the far side hardly moves, which is what a near miss does to a
   * ship's side. It is measured from the shape she was built with, so a piece
   * hit twice is dented twice rather than dented and then straightened.
   */
  dent(piece, x, y, z, force) {
    if (force < 0.03) return;
    piece.bent = Math.min(1, piece.bent + force);
    const depth = DENT_MAX * force * this.detail;
    // How far a burst is felt along a piece. A locker is dished all over; a
    // forty-metre hull band is dished where the shell was and is fair either
    // side of it, which is what a ship that has been hit looks like.
    const spread = Math.max(2.5, Math.min(9, piece.r * 1.6));
    for (const s of piece.spans) {
      const geo = s.mesh.geometry;
      const pos = geo.attributes.position;
      const arr = pos.array;
      // The shape she was built with, kept so that dent upon dent cannot walk
      // a piece off the ship: each one moves the metal further in, and the
      // total is held to how deep a burst can dish plate.
      const fair = fairShape(geo);
      let any = false;
      for (let i = s.v0; i < s.v0 + s.vn; i++) {
        const o = i * 3;
        const dx = arr[o] - x;
        const dy = arr[o + 1] - y;
        const dz = arr[o + 2] - z;
        const d = Math.hypot(dx, dy, dz) || 1;
        const near = Math.max(0, 1 - d / spread);
        if (near <= 0) continue;
        const k = (depth * near * near) / d;
        let nx = arr[o] - dx * k;
        let ny = arr[o + 1] - dy * k;
        let nz = arr[o + 2] - dz * k;
        // And never further from where it was built than plate will go.
        const ox = nx - fair[o];
        const oy = ny - fair[o + 1];
        const oz = nz - fair[o + 2];
        const off = Math.hypot(ox, oy, oz);
        if (off > DENT_MAX) {
          const t = DENT_MAX / off;
          nx = fair[o] + ox * t;
          ny = fair[o + 1] + oy * t;
          nz = fair[o + 2] + oz * t;
        }
        arr[o] = nx; arr[o + 1] = ny; arr[o + 2] = nz;
        any = true;
      }
      if (!any) continue;
      // Only the piece's own vertices go back to the card: a battleship's
      // buffer is most of a megabyte and re-uploading all of it for a dent a
      // metre across is the whole cost of this.
      touch(pos, s.v0, s.vn);
      // The bounding sphere has moved with it, and a stale one culls a ship
      // that is still on screen.
      geo.boundingSphere = null;
    }
  }

  /** Blacken a piece, and keep it blackened. */
  scorchPiece(piece, amount) {
    const want = Math.min(1, piece.burn + amount);
    if (want <= piece.burn + 0.02) return;
    piece.burn = want;
    // Soot is not black paint: it takes the colour down and the life out of
    // it, so a scorched grey goes to a dead charcoal rather than to nothing.
    const v = Math.round(255 * (1 - 0.78 * want));
    for (const s of piece.spans) {
      const geo = s.mesh.geometry;
      const col = geo.attributes.color;
      const arr = col.array;
      let any = false;
      for (let i = s.v0; i < s.v0 + s.vn; i++) {
        const o = i * 3;
        if (arr[o] <= v) continue;
        arr[o] = v; arr[o + 1] = v; arr[o + 2] = v;
        any = true;
      }
      if (any) touch(col, s.v0, s.vn);
    }
  }

  /**
   * Fire on her: everything within reach of it blackens, over time.
   *
   * A fire does not take anything off her and does not bend anything. It
   * blackens what is standing in it, and goes on blackening it for as long as
   * it burns -- which is why a ship that has been alight amidships for two
   * minutes is black amidships when it is out.
   */
  scorch(x, y, z, r, amount) {
    const lo = Math.round((z - r) / 8);
    const hi = Math.round((z + r) / 8);
    for (let b = lo; b <= hi; b++) {
      const list = this.buckets.get(b);
      if (!list) continue;
      for (const piece of list) {
        if (!piece.on) continue;
        const gap = Math.max(0, Math.hypot(piece.cx - x, piece.cy - y, piece.cz - z) - piece.r);
        if (gap > r) continue;
        this.scorchPiece(piece, amount * (1 - gap / r));
      }
    }
  }

  /**
   * Take a piece off her, and hand back what it was.
   *
   * The triangles are folded onto one vertex so they cover no pixels, and the
   * geometry is copied out first -- positions and colours as they stand,
   * dents and scorching and all, in the piece's own frame with its centre at
   * the origin so it can be spun about itself as it falls.
   */
  shed(piece, x = piece.cx, y = piece.cy, z = piece.cz, force = 1) {
    piece.on = false;
    const pos = [];
    const col = [];
    const idx = [];
    for (const s of piece.spans) {
      const geo = s.mesh.geometry;
      const P = geo.attributes.position.array;
      const C = geo.attributes.color ? geo.attributes.color.array : null;
      const I = geo.index.array;
      // The vertices, moved so the piece's own centre is the origin.
      const base = pos.length / 3;
      for (let i = s.v0; i < s.v0 + s.vn; i++) {
        const o = i * 3;
        pos.push(P[o] - piece.cx, P[o + 1] - piece.cy, P[o + 2] - piece.cz);
        col.push(C ? C[o] / 255 : 0.55, C ? C[o + 1] / 255 : 0.58, C ? C[o + 2] / 255 : 0.6);
      }
      // And its triangles, renumbered into the copy, before they are folded
      // away in the ship.
      for (let i = s.i0; i < s.i0 + s.ic; i++) {
        const v = I[i] - s.v0;
        if (v >= 0 && v < s.vn) idx.push(base + v);
      }
      const first = I[s.i0];
      for (let i = s.i0; i < s.i0 + s.ic; i++) I[i] = first;
      touch(geo.index, s.i0, s.ic);
    }
    return {
      pos: new Float32Array(pos), col: new Float32Array(col),
      idx: new Uint16Array(idx),
      x: piece.cx, y: piece.cy, z: piece.cz,
      // Thrown away from the burst, and harder the harder it was hit.
      from: { x, y, z }, force,
    };
  }

  /**
   * Everything standing on a compartment that has gone.
   *
   * There is nothing holding it any more, so it goes over the side with the
   * piece of deck it was bolted to.
   */
  shedSection(z0, z1) {
    let shed = null;
    for (const piece of this.pieces) {
      if (!piece.on || !piece.fitting) continue;
      if (piece.cz < z0 || piece.cz > z1) continue;
      (shed || (shed = [])).push(this.shed(piece, piece.cx, piece.cy - 4, piece.cz, 0.8));
    }
    return shed;
  }

  /** How much of her fittings she has left, for anyone who wants to know. */
  intact() {
    let on = 0;
    let all = 0;
    for (const p of this.pieces) {
      if (!p.fitting) continue;
      all++;
      if (p.on) on++;
    }
    return all ? on / all : 1;
  }
}

/**
 * Mark a range of a buffer dirty, whichever way this Three knows how.
 *
 * Ranges are added rather than replaced: a salvo can dent four pieces of the
 * same buffer between two frames, and keeping only the last of them would
 * upload one dent and leave the other three on the card as they were. The
 * renderer clears the list once it has uploaded them.
 */
function touch(attr, from, count) {
  if (attr.addUpdateRange) attr.addUpdateRange(from, count);
  else if (attr.updateRange) { attr.updateRange.offset = from; attr.updateRange.count = count; }
  attr.needsUpdate = true;
}

/**
 * The shape a buffer was built with.
 *
 * Kept beside the live positions so every dent is measured from the fair hull
 * rather than from the last dent -- otherwise a piece hit twice in the same
 * place walks away from the ship a little further each time.
 */
function fairShape(geo) {
  if (!geo.userData.fair) {
    geo.userData.fair = new Float32Array(geo.attributes.position.array);
  }
  return geo.userData.fair;
}
