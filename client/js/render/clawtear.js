// Monster One's claws in a hull, taking a piece of it.
//
// A piece of a ship does not simply come away in her hand. Her claws go in
// first -- four punctures where her fingers close and one where her thumb
// does, the plating dished in round each -- and then she pulls, and the steel
// between them gives the way steel gives: cracks running out from the holes,
// joining up, and branching away from the piece into the plating round it.
// Only when they have gone all the way round does the piece break off, and
// it comes away in her hand and drops, and the hole it leaves is where the
// cracks ran.
//
// So this is that, over a second and a half, on her own model: the punctures
// and dents straight away (plating.js), the cracks drawn as dark lines laid
// on her plating and growing along their paths, and at the end the tear
// itself (`onBreak`), which is the rent and the slab that the battle's own
// tear has always made. The cracks that ran round the piece go with it; the
// ones that ran out into the plating round it stay.

import * as THREE from '../../../vendor/three.module.js';

/** When the cracks have gone round and the piece breaks off, seconds after her claws go in. */
export const CLAW_BREAK = 1.35;

const CRACK_MAT = new THREE.MeshBasicMaterial({
  color: 0x0b0a09, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});

export class ClawTear {
  /**
   * `view` is the ship's view; (lx, ly, lz) and `r` where on her and how big
   * a piece, in her own frame; `seed` the shape; `onBreak` what tears it out.
   */
  constructor(view, { lx, ly, lz, r, seed = 0, onBreak = null, onDig = null }) {
    this.view = view;
    this.t = 0;
    this.onBreak = onBreak;
    this.onDig = onDig;
    this.broke = false;
    this.r = r;
    let h = ((seed * 2654435761) ^ 0x5bd1e995) >>> 0;
    const rnd = () => { h = (h ^ (h << 13)) >>> 0; h = (h ^ (h >>> 17)) >>> 0; h = (h ^ (h << 5)) >>> 0; return (h % 100000) / 100000; };
    this.rnd = rnd;
    const P = view.plating;
    const near = P ? P.nearest(lx, ly, lz, Math.max(7, r * 3)) : null;
    // The face of her there: a point on it, which way it faces, and two ways
    // across it -- along her, and up her side.
    const c = near ? new THREE.Vector3(near[0], near[1], near[2]) : new THREE.Vector3(lx, ly, lz);
    const n = near ? new THREE.Vector3(near[3], near[4], near[5]) : new THREE.Vector3(lx >= 0 ? 1 : -1, 0, 0);
    if (n.lengthSq() < 1e-6) n.set(lx >= 0 ? 1 : -1, 0, 0);
    n.normalize();
    const a = new THREE.Vector3(0, 0, 1);
    if (Math.abs(n.z) > 0.8) a.set(0, 1, 0);
    a.addScaledVector(n, -a.dot(n)).normalize();
    const b = new THREE.Vector3().crossVectors(n, a).normalize();
    this.c = c; this.n = n; this.a = a; this.b = b;
    // On her face, at (u, v) from the middle of it: lifted onto her plating
    // where there is plating to lift it onto, and just proud of it.
    const onHer = (u, v) => {
      const p = c.clone().addScaledVector(a, u).addScaledVector(b, v);
      const q = P ? P.nearest(p.x, p.y, p.z, 2.6) : null;
      if (q) {
        const qn = new THREE.Vector3(q[3], q[4], q[5]);
        if (qn.dot(n) > 0.5) {
          const off = p.clone().sub(new THREE.Vector3(q[0], q[1], q[2])).dot(qn);
          p.addScaledVector(qn, -off);
          return { p: p.addScaledVector(qn, 0.07), n: qn, ok: true };
        }
      }
      // Off her plating -- past her deck edge, or her bilge: nothing to crack.
      return { p: p.addScaledVector(n, 0.07), n: n.clone(), ok: !P };
    };
    // Where her claws go in: four fingers round one side of the piece, and
    // her thumb across from them.
    const R = r * 0.78;
    this.claws = [];
    const spread = [2.0, 2.55, 3.1, 3.65];
    const turn = rnd() * Math.PI * 2;
    for (const s of spread) {
      const ang = s + turn + (rnd() - 0.5) * 0.15;
      this.claws.push({ u: Math.cos(ang) * R, v: Math.sin(ang) * R * 0.75, at: 0.04 + this.claws.length * 0.06 });
    }
    const th = turn + 0.25 + (rnd() - 0.5) * 0.3;
    this.claws.push({ u: Math.cos(th) * R, v: Math.sin(th) * R * 0.75, at: 0.12 });
    // The cracks. Round the piece from claw to claw -- the line it will
    // break along -- and out from each claw into the plating round it.
    const segs = [];
    const line = (from, to, t0, t1, ring, wide) => {
      const len = Math.hypot(to.u - from.u, to.v - from.v);
      const steps = Math.max(3, Math.round(len / 0.7));
      // Wandering off the straight line the way a crack does, never far.
      const pu = -(to.v - from.v) / (len || 1), pv = (to.u - from.u) / (len || 1);
      let off = 0;
      let prev = onHer(from.u, from.v);
      for (let k = 1; k <= steps; k++) {
        const f = k / steps;
        off = k === steps ? 0 : off * 0.55 + (rnd() - 0.5) * Math.min(1.2, len * 0.22);
        const u = from.u + (to.u - from.u) * f + pu * off;
        const v = from.v + (to.v - from.v) * f + pv * off;
        const cur = onHer(u, v);
        // A crack runs only as far as there is plating: off the edge of her
        // it stops.
        if (!cur.ok || !prev.ok) { if (!ring) break; prev = cur; continue; }
        segs.push({ p0: prev.p, p1: cur.p, n: cur.n, t: t0 + (t1 - t0) * f, ring, w: wide * (1 - 0.5 * f) + 0.05 });
        prev = cur;
      }
    };
    const order = [...this.claws].sort((p, q) => Math.atan2(p.v, p.u) - Math.atan2(q.v, q.u));
    for (let k = 0; k < order.length; k++) {
      const p = order[k], q = order[(k + 1) % order.length];
      line(p, q, 0.3 + rnd() * 0.25, 0.85 + rnd() * 0.4, true, 0.22 + r * 0.012);
    }
    for (const cl of this.claws) {
      const ang = Math.atan2(cl.v, cl.u) + (rnd() - 0.5) * 0.9;
      const L = r * (0.35 + rnd() * 0.55);
      const to = { u: cl.u + Math.cos(ang) * L, v: cl.v + Math.sin(ang) * L };
      const t0 = 0.4 + rnd() * 0.3;
      line(cl, to, t0, t0 + 0.5 + rnd() * 0.4, false, 0.16 + r * 0.008);
      // And one branch off it, part of the way out.
      if (rnd() < 0.7) {
        const mid = { u: cl.u + (to.u - cl.u) * 0.5, v: cl.v + (to.v - cl.v) * 0.5 };
        const ang2 = ang + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.5);
        const L2 = L * (0.3 + rnd() * 0.3);
        line(mid, { u: mid.u + Math.cos(ang2) * L2, v: mid.v + Math.sin(ang2) * L2 }, t0 + 0.4, t0 + 0.9, false, 0.1 + r * 0.005);
      }
    }
    segs.sort((p, q) => p.t - q.t);
    this.segs = segs;
    // Every segment a quad, in the order they appear: the crack grows by
    // drawing more of them.
    const pos = new Float32Array(segs.length * 6 * 3);
    const S = new THREE.Vector3(), D = new THREE.Vector3();
    segs.forEach((s, i) => {
      D.subVectors(s.p1, s.p0);
      S.crossVectors(s.n, D).normalize().multiplyScalar(s.w / 2);
      const q = [
        s.p0.clone().add(S), s.p0.clone().sub(S), s.p1.clone().sub(S.clone().multiplyScalar(0.7)),
        s.p0.clone().add(S), s.p1.clone().sub(S.clone().multiplyScalar(0.7)), s.p1.clone().add(S.clone().multiplyScalar(0.7)),
      ];
      q.forEach((v, k) => { pos[(i * 6 + k) * 3] = v.x; pos[(i * 6 + k) * 3 + 1] = v.y; pos[(i * 6 + k) * 3 + 2] = v.z; });
    });
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setDrawRange(0, 0);
    this.geo.computeBoundingSphere();
    this.mesh = new THREE.Mesh(this.geo, CRACK_MAT);
    this.mesh.renderOrder = 2;
    view.group.add(this.mesh);
    this.onHer = onHer;
  }

  /** Once a frame. False once it is all over and can be let go of. */
  step(dt) {
    this.t += dt;
    const t = this.t;
    const P = this.view.plating;
    // Her claws going in: each finger's point dishes her plating and goes
    // through it.
    for (const cl of this.claws) {
      if (cl.done || t < cl.at) continue;
      cl.done = true;
      const at = this.onHer(cl.u, cl.v).p;
      if (P) {
        P.dent(at.x, at.y, at.z, Math.max(2.4, this.r * 0.32), this.r * 0.09);
        P.punch(at.x, at.y, at.z, Math.max(0.5, this.r * 0.08));
      }
      if (this.onDig) this.onDig(at, this.n);
    }
    // The cracks, as far as they have got.
    if (!this.broke) {
      let shown = 0;
      while (shown < this.segs.length && this.segs[shown].t <= t) shown++;
      this.geo.setDrawRange(0, shown * 6);
    }
    if (!this.broke && t >= CLAW_BREAK) {
      this.broke = true;
      // The piece breaks off along the cracks round it: those go with it,
      // and the ones running out into her plating stay.
      const keep = this.segs.filter((s) => !s.ring);
      const pos = this.geo.attributes.position.array;
      let j = 0;
      this.segs.forEach((s, i) => {
        if (s.ring) return;
        for (let k = 0; k < 18; k++) pos[j * 18 + k] = pos[i * 18 + k];
        j++;
      });
      this.segs = keep;
      this.geo.attributes.position.needsUpdate = true;
      this.geo.setDrawRange(0, keep.length * 6);
      if (this.onBreak) this.onBreak(this.c, this.n);
      this.check = 0.5;
    }
    // A crack is only ever drawn on plating: where what it was on has since
    // been shot away, it goes too, rather than hang in the air.
    if (this.broke && P && this.segs.length) {
      this.check -= dt;
      if (this.check <= 0) {
        this.check = 1;
        const M = new THREE.Vector3();
        const pos = this.geo.attributes.position.array;
        const keep = [];
        let j = 0;
        this.segs.forEach((s, i) => {
          M.addVectors(s.p0, s.p1).multiplyScalar(0.5);
          if (!P.nearest(M.x, M.y, M.z, 1.6)) return;
          for (let k = 0; k < 18; k++) pos[j * 18 + k] = pos[i * 18 + k];
          keep.push(s);
          j++;
        });
        if (keep.length !== this.segs.length) {
          this.segs = keep;
          this.geo.attributes.position.needsUpdate = true;
          this.geo.setDrawRange(0, keep.length * 6);
        }
      }
    }
    return this.segs.length > 0 || !this.broke;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
  }
}
