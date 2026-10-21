// An aeroplane coming apart.
//
// The holes were always there: every round that went through her left one,
// where it went through. What was missing was the other half of being shot
// down -- the wing that folds back and goes, the tail that breaks off at the
// roundel, the panel outboard of a cannon that is simply not there any more
// on the machine that gets home. This is that half.
//
// It is all worked out from what both sides are already told -- the holes and
// how she went -- so every screen breaks the same aeroplane the same way, and
// nothing new crosses the wire.
import * as THREE from '../../../vendor/three.module.js';
import { CUT } from './planes.js';

/** A number from 0 to 1 out of a seed, the same on every screen. */
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * What a machine still flying has lost, off the holes in her.
 *
 * A wing will take a good deal: it is most of what there is to hit, and a
 * burst through the inboard panel is a burst through the spar box. A burst
 * walked out along it is not -- the outer panel is a skin and some ribs, and
 * three or four cannon shells through it take it off. So it is the holes in
 * the outboard part of each wing that clip it, and nothing else does: a
 * machine with her tail or a wing root gone is not flying, and is drawn when
 * she goes down instead (see `breakCut`).
 *
 * `dm` is her own side's report of her, when there is one: a wing at a third
 * of its strength has lost a panel whatever the holes say.
 */
export function cutFromHoles(holes, dm = null) {
  let cut = 0;
  let outL = 0, outR = 0, inL = 0, inR = 0;
  for (const h of (holes || [])) {
    if (h.k !== 'wings') continue;
    const big = h.r > 0.3 ? 2 : 1;
    if (h.x < -0.5) outL += big;
    else if (h.x > 0.5) outR += big;
    else if (h.x < 0) inL += big;
    else inR += big;
  }
  if (outL >= 4) cut |= CUT.wingOutL;
  if (outR >= 4) cut |= CUT.wingOutR;
  if (dm && dm[2] !== undefined && dm[2] < 0.34 && !cut) {
    cut |= (outL + inL >= outR + inR) ? CUT.wingOutL : CUT.wingOutR;
  }
  return cut;
}

/**
 * How a machine that is going down breaks, off how she went and where the
 * rounds were going in. `seed` keeps it the same on every screen.
 *
 *   shot   the structure gave: a wing off at the root on the side most of
 *          the holes are, or her tail off aft of the roundel, or both
 *   fire   a burning wing tank burns through the spar, and the wing goes
 *   others she comes down whole -- out of fuel, or crippled and ditching
 */
export function breakCut(why, holes, seed, had = 0) {
  let cut = had;
  if (why !== 'shot' && why !== 'fire' && why !== 'lost') return cut;
  let wl = 0, wr = 0, tail = 0, body = 0;
  for (const h of (holes || [])) {
    if (h.k === 'wings') { if (h.x < 0) wl++; else wr++; }
    else if (h.k === 'tail') tail++;
    else if (h.k === 'body') body++;
  }
  const r = hash(seed);
  const r2 = hash(seed + 7.3);
  if (why === 'fire') {
    if (r < 0.55) cut |= (wl >= wr ? CUT.wingInL : CUT.wingInR);
    return cut;
  }
  const wings = wl + wr;
  const back = tail + body;
  if (wings > back * 1.3 || (wings === back && r < 0.5)) {
    cut |= (wl > wr || (wl === wr && r2 < 0.5)) ? CUT.wingInL : CUT.wingInR;
    if (r2 < 0.25) cut |= CUT.tail;
  } else {
    cut |= CUT.tail;
    if (r2 < 0.3) cut |= (wl >= wr ? CUT.wingOutL : CUT.wingOutR);
  }
  return cut;
}

/**
 * The pieces a mask takes off her, each as the names it is drawn by: a wing
 * off at the root goes with its outboard panel and its leg still on it.
 * `had` is what she had already lost, which is not lost again.
 */
export function piecesOf(cut, had = 0) {
  const now = cut & ~had;
  const out = [];
  if (now & CUT.tail) out.push(['tail', 'gearT']);
  if (now & CUT.wingInL) out.push((had & CUT.wingOutL) ? ['wingInL', 'gearL'] : ['wingInL', 'wingOutL', 'gearL']);
  else if (now & CUT.wingOutL) out.push(['wingOutL']);
  if (now & CUT.wingInR) out.push((had & CUT.wingOutR) ? ['wingInR', 'gearR'] : ['wingInR', 'wingOutR', 'gearR']);
  else if (now & CUT.wingOutR) out.push(['wingOutR']);
  if (now & CUT.prop) out.push(['prop']);
  return out;
}

const tmpM = new THREE.Matrix4();
const tmpT = new THREE.Matrix4();
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const ONE = new THREE.Vector3(1, 1, 1);

/**
 * The pieces in the air: each one thrown off the aeroplane it was part of at
 * the speed she was going, with a twist from whatever broke it, tumbling on a
 * great deal of drag and no lift into the sea. A wing goes with the fuel that
 * was in it alight for a few seconds; everything trails a little smoke.
 */
export class Pieces {
  constructor(max = 48) {
    this.max = max;
    this.list = [];
  }

  /**
   * Throw `groups` -- see piecesOf -- off a machine of type `kind` whose whole attitude is
   * `matrix` (her world matrix) and who was going at `vel`. `flights` says
   * where each piece's middle is on her. `burst` throws them hard outwards,
   * which is a machine blown apart rather than one that broke.
   */
  spawn(flights, kind, groups, matrix, vel, { burst = false, seed = Math.random() * 1000 } = {}) {
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    matrix.decompose(pos, q, scl);
    groups.forEach((names, i) => {
      const name = names[0];
      const c = flights.centerOf(kind, name);
      if (!c) return;
      if (this.list.length >= this.max) this.list.shift();
      const at = c.clone().applyMatrix4(matrix);
      // Out from her middle, so a wing goes off its own side.
      const out = at.clone().sub(pos);
      const len = out.length() || 1;
      out.multiplyScalar(1 / len);
      const kick = burst ? 18 + hash(seed + i) * 22 : 2 + hash(seed + i) * 5;
      const heavy = name.startsWith('gear') || name === 'prop';
      // The fuselage is most of the weight of her and has no wing left on it.
      // Damped like a loose panel it stopped dead in the air and sank at
      // twenty metres a second -- an aeroplane hanging over the sea for most
      // of a minute. It keeps its way and falls like the lump it is.
      const body = name === 'body';
      this.list.push({
        kind, name, names, center: c.clone(),
        p: at,
        v: new THREE.Vector3(vel.x, vel.y, vel.z).addScaledVector(out, kick)
          .add(new THREE.Vector3(0, burst ? 6 : 1.5, 0)),
        q: q.clone(),
        // Tumbling: a wing cartwheels about its own span, a tail goes end
        // over end, and an airscrew spins on.
        w: new THREE.Vector3(
          (hash(seed + i * 3.1) - 0.5) * (burst ? 9 : 5),
          (hash(seed + i * 5.7) - 0.5) * (burst ? 7 : 3),
          (hash(seed + i * 9.3) - 0.5) * (burst ? 12 : 7),
        ),
        // A wing has the most drag for its weight and stops dead in the air;
        // a leg or an airscrew is a lump of steel and falls like one.
        drag: heavy ? 0.55 : body ? 0.7 : name.startsWith('wing') ? 0.18 : 0.3,
        // And how hard the air holds up its fall, a second: it comes down at
        // no more than about 9.8 / -ln(fall) metres a second.
        fall: heavy || body ? 0.85 : name.startsWith('wing') ? 0.6 : 0.75,
        burn: name.startsWith('wing') && hash(seed + i * 2.2) < 0.75 ? 2.5 + hash(seed + i) * 3 : 0,
        smoke: 0,
        age: 0,
      });
    });
  }

  /** Fly them down. `sea(x, z)` is the height of the water. */
  step(dt, fx, sea) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const k = this.list[i];
      k.age += dt;
      const d = Math.pow(k.drag, dt);
      k.v.x *= d; k.v.z *= d;
      k.v.y = k.v.y * Math.pow(k.fall ?? Math.min(0.95, k.drag + 0.35), dt) - 9.81 * dt;
      k.p.addScaledVector(k.v, dt);
      const wl = k.w.length();
      if (wl > 1e-4) {
        tmpQ.setFromAxisAngle(tmpV.copy(k.w).multiplyScalar(1 / wl), wl * dt);
        k.q.premultiply(tmpQ);
      }
      // The trail off her, laid along the way she went: see smokeRun.
      if (fx) {
        k.run = k.run || {};
        fx.smokeRun(k.run, k.p.x, k.p.y, k.p.z, { fire: k.burn > 0 ? 0.7 : 0, thick: k.burn > 0 ? 0.6 : 0.4 });
      }
      k.burn = Math.max(0, k.burn - dt);
      const s = sea ? sea(k.p.x, k.p.z) : 0;
      if (k.p.y <= s + 0.5 || k.age > 60) {
        if (fx && k.age <= 60) fx.splash(k.p.x, k.p.z, k.name.startsWith('wing') || k.name === 'tail' ? 90 : 40);
        this.list.splice(i, 1);
      }
    }
  }

  /** Put them in the batches. Call between the flights' begin and end. */
  draw(flights) {
    for (const k of this.list) {
      // About its own middle: placed so the point that was its middle on her
      // is where it now is, turned as it now lies.
      tmpM.compose(k.p, k.q, ONE);
      tmpT.makeTranslation(-k.center.x, -k.center.y, -k.center.z);
      tmpM.multiply(tmpT);
      for (const n of k.names) flights.piece(k.kind, n, tmpM);
    }
  }
}
