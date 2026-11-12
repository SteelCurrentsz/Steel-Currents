// Locking on, from the cockpit of a modern aeroplane.
//
// A Hornet's missiles are not let go at whatever is about. The pilot puts her
// nose on something -- an aeroplane, a ship, a gun position ashore -- and the
// seeker takes it: a box goes round it, and after a moment it closes and says
// LOCK. From then on the missile key sends the missile that suits it (a
// Sidewinder close in and an AMRAAM further out for an aeroplane, a Harpoon or
// a Penguin for a ship, a Maverick for a gun) at that one thing, and the
// simulation checks the lock was one she could have had (see fireLocked in
// sim.js).
//
// The seeker looks down her flight path, inside LOCK_CONE of it, and out to
// the reach of the longest missile on her rails for that kind of target. It
// takes whatever is nearest the middle of that by itself; the lock key steps
// it on to the next.

import { AIR_MISSILES, AIR_MISSILE_HITS } from '../../shared/ships.js';
import { LOCK_CONE } from '../../shared/sim.js';

/** How long the seeker has to hold something before it is locked, in seconds. */
export const LOCK_TIME = 0.9;

/** Which missile on her rails goes at a `tk` target `d` metres off, or null. */
export function pickLockKind(rack, tk, d) {
  // The one best suited first, then anything else on her rails that is
  // built to go for that kind of target (AIR_MISSILE_HITS says which).
  const best = tk === 'a' ? (d < AIR_MISSILES.aim9.range * 0.85 ? ['aim9', 'aim120'] : ['aim120', 'aim9'])
    : tk === 's' ? ['agm84', 'penguin', 'agm65'] : ['agm65'];
  // (A B-52's AGM-86B goes at any of them: it is found among her rails below.)
  const order = [...best, ...Object.keys(rack || {}).filter((k) => !best.includes(k))];
  for (const k of order) {
    const K = AIR_MISSILES[k];
    if (!K || !(rack?.[k] > 0) || !(AIR_MISSILE_HITS[k] || []).includes(tk)) continue;
    if (d <= K.range) return k;
  }
  return null;
}

/** How far the longest missile on her rails for a `tk` target reaches; 0 for none. */
function reachFor(rack, tk) {
  let best = 0;
  for (const [k, n] of Object.entries(rack || {})) {
    if (!(n > 0) || !(AIR_MISSILE_HITS[k] || []).includes(tk)) continue;
    best = Math.max(best, AIR_MISSILES[k]?.range || 0);
  }
  return best;
}

/** Whether she has anything on her rails to lock on with. */
export function hasRack(rack) {
  return !!rack && Object.values(rack).some((n) => n > 0);
}

/**
 * Everything of the enemy's the seeker can see from where she is: inside the
 * cone off her flight path, and inside the reach of a missile she has for it.
 * Nearest the middle of the cone first.
 */
export function lockCandidates(game, f, p) {
  const out = [];
  const rack = f.rack;
  const reach = { a: reachFor(rack, 'a'), s: reachFor(rack, 's'), b: reachFor(rack, 'b') };
  if (!reach.a && !reach.s && !reach.b) return out;
  // A B-52 is high over everything she wants: her seeker takes the bearing
  // she is flying, whatever is below it (see alcmLocked in sim.js).
  const flat = !!f.flat;
  const pt = flat ? 0 : p.pitch || 0;
  const fx = Math.sin(p.heading) * Math.cos(pt), fy = Math.sin(pt), fz = Math.cos(p.heading) * Math.cos(pt);
  const cos = Math.cos(LOCK_CONE);
  const consider = (tk, id, x, y, z, name) => {
    if (!reach[tk]) return;
    const dx = x - p.x, dy = flat ? 0 : y - p.y, dz = z - p.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < (flat ? 400 : 150) || d > reach[tk]) return;
    const c = (dx * fx + dy * fy + dz * fz) / d;
    if (c < cos) return;
    out.push({ tk, id, x, y, z, d, off: Math.acos(Math.min(1, c)), name });
  };
  for (const q of game.planesNow || []) {
    if (q.tm === game.team || q.i === f.id) continue;
    consider('a', q.i, q.x, game.planeHeight(q), q.z, 'AIR');
  }
  const snap = game.snapshots[game.snapshots.length - 1];
  for (const q of (snap && snap.bombers) || []) {
    if (q.tm === game.team) continue;
    consider('a', q.i, q.x, q.y, q.z, 'AIR');
  }
  for (const q of (snap && snap.ships) || []) {
    if (!q.a || q.tm === game.team) continue;
    consider('s', q.i, q.x, 6, q.z, 'SHIP');
  }
  for (const q of (snap && snap.batteries) || []) {
    if (!q.al || q.tm === game.team) continue;
    consider('b', q.i, q.x, (q.y ?? 0) + 1.5, q.z, 'GROUND');
  }
  out.sort((a, b) => a.off - b.off);
  return out;
}

/**
 * The seeker, a frame: keep what it has while it can still see it, or take
 * the best there is; and count up to the lock.
 */
export function stepLock(game, f, p, dt) {
  if (!hasRack(f.rack)) { f.lock = null; return; }
  const list = lockCandidates(game, f, p);
  let cur = f.lock ? list.find((c) => c.tk === f.lock.tk && c.id === f.lock.id) : null;
  if (!cur) {
    // Lost: it went out of the cone or out of reach, or it is gone.
    if (f.lock && f.lock.locked) game.hud.alert('Lock lost');
    f.lock = null;
    cur = list[0] || null;
    if (cur) f.lock = { tk: cur.tk, id: cur.id, since: 0, locked: false };
  }
  if (!f.lock || !cur) return;
  f.lock.since += dt;
  const was = f.lock.locked;
  f.lock.locked = f.lock.since >= LOCK_TIME;
  f.lock.at = cur;
  f.lock.kind = pickLockKind(f.rack, cur.tk, cur.d);
  if (f.lock.locked && !was) game.lockTone?.();
}

/** Step the seeker on to the next thing in its cone. */
export function nextLock(game, f, p) {
  const list = lockCandidates(game, f, p);
  if (!list.length) { f.lock = null; return false; }
  const at = f.lock ? list.findIndex((c) => c.tk === f.lock.tk && c.id === f.lock.id) : -1;
  const c = list[(at + 1) % list.length];
  f.lock = { tk: c.tk, id: c.id, since: 0, locked: false, at: c, kind: pickLockKind(f.rack, c.tk, c.d) };
  return true;
}

/** What the box round the target says. */
export function lockLabel(lock) {
  if (!lock || !lock.at) return '';
  const km = (lock.at.d / 1000).toFixed(1);
  if (!lock.locked) return `LOCKING ${lock.at.name} ${km} km`;
  const K = lock.kind ? AIR_MISSILES[lock.kind] : null;
  return K ? `LOCK ${K.short} ${km} km` : `LOCK ${lock.at.name} — NO MISSILE IN REACH`;
}

/** Her rails, as the missile key reads: `AIM-120 2 · AIM-9 2`. */
export function rackLabel(rack) {
  return Object.entries(rack || {}).filter(([, n]) => n > 0)
    .map(([k, n]) => `${AIR_MISSILES[k]?.short || k} ${n}`).join(' · ');
}
