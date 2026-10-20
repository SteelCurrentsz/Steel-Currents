// A staged battle: the script a director writes before the guns open.
//
// A staged battle is not fought, it is filmed. Every ship sails where she is
// told when she is told, fires on what she is told to fire on, and goes down
// when the script says she goes down -- and the camera is put where the shot
// wants it at the moment the shot wants it. This file is the script itself:
// what a cue and a shot are, the one place they are checked, and a quick
// reckoning of where every ship will be at any moment so the editor can show
// the director his scene before it is shot.
//
// It is shared because two things read it. The editor in the tab writes it and
// previews it; the room (server/stage.js) carries it out against the real
// simulation. One description of a cue, so the two cannot disagree about what
// a cue means.

import { clamp, dist, headingTo, approachAngle } from './math.js';
import { getClass } from './ships.js';

/** How long a script may run, in seconds of battle. */
export const STAGE_MAX_T = 30 * 60;

/** How many cues and shots a script may carry. */
export const STAGE_MAX_CUES = 400;
export const STAGE_MAX_SHOTS = 200;

/** How many points one course may have laid down it. */
export const STAGE_MAX_PTS = 24;

/**
 * Everything a ship can be told to do, in the order the editor offers them.
 * `at` is whether the order names another unit (a target); `pts` whether it is
 * a course laid down the chart.
 */
export const CUES = {
  path: { label: 'Sail course', pts: true, help: 'Tap the chart to lay her course, point by point.' },
  speed: { label: 'Speed', help: 'Ring up a speed on the telegraph.' },
  fire: { label: 'Open fire on', at: true, help: 'Every gun she has, on one ship.' },
  hold: { label: 'Cease fire', help: 'Every gun aboard her holds its fire.' },
  free: { label: 'Fire at will', help: 'Her gunnery officer picks his own targets again.' },
  torp: { label: 'Torpedoes at', at: true, help: 'Her banks fire as soon as they bear.' },
  strike: { label: 'Air strike on', at: true, help: 'Her air group flies off at the target.' },
  smoke: { label: 'Make smoke', help: 'A smoke screen out of her funnels.' },
  burn: { label: 'Set on fire', outcome: true, help: 'A fire breaks out amidships.' },
  sink: { label: 'Sink', outcome: true, help: 'She is shot to pieces and settles.' },
  break: { label: 'Break in two', outcome: true, help: 'Her back goes and she parts amidships.' },
  blow: { label: 'Magazine explodes', outcome: true, help: 'Her magazine goes up.' },
};

/**
 * The camera's moves. A follow shot rides a unit from one of a handful of
 * stations; a fixed shot stands still somewhere and looks at something; free
 * hands the camera back to whoever is holding it.
 */
export const SHOTS = {
  follow: { label: 'Follow' },
  fixed: { label: 'Fixed camera' },
  free: { label: 'Free camera' },
};

/**
 * Where a follow shot stands off what it is following. `yaw` is off her stern
 * (0 is astern looking forward, PI is ahead looking back), `el` the elevation
 * in radians and `dist` multiples of her length. `pov` stands on her bridge.
 */
export const VIEWS = {
  chase: { label: 'Astern', yaw: 0, el: 0.16, dist: 1.6 },
  quarter: { label: 'Quarter', yaw: 0.7, el: 0.22, dist: 1.8 },
  beam: { label: 'Broadside', yaw: Math.PI / 2, el: 0.08, dist: 1.7 },
  bow: { label: 'Ahead', yaw: Math.PI, el: 0.12, dist: 1.6 },
  low: { label: 'Waterline', yaw: 2.4, el: -0.02, dist: 0.9 },
  high: { label: 'Overhead', yaw: 0, el: 1.1, dist: 3.4 },
  wide: { label: 'Wide', yaw: 0.9, el: 0.35, dist: 5.5 },
  pov: { label: 'Bridge', pov: true },
};

/** A unit's name in a script: its kind, its side and its place in the order of battle. */
export function unitKey(kind, team, index) {
  return `${kind}:${team}:${index}`;
}

export function parseKey(key) {
  const m = /^([sgb]):([01]):(\d{1,3})$/.exec(String(key || ''));
  return m ? { kind: m[1], team: Number(m[2]), index: Number(m[3]) } : null;
}

const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? clamp(Number(v), lo, hi) : d);

/**
 * A script off the wire, checked. Anything that is not the shape of a cue is
 * dropped rather than refused, so one bad line does not lose the director his
 * whole scene; what is kept is sorted by time.
 */
export function cleanScript(raw, half = 40000) {
  const out = { cues: [], shots: [] };
  if (!raw || typeof raw !== 'object') return out;
  const H = Math.max(1000, Number(half) || 40000);
  const cues = Array.isArray(raw.cues) ? raw.cues.slice(0, STAGE_MAX_CUES) : [];
  for (const c of cues) {
    if (!c || !CUES[c.a] || !parseKey(c.u)) continue;
    const cue = { t: num(c.t, 0, STAGE_MAX_T, 0), u: c.u, a: c.a };
    if (CUES[c.a].at) {
      if (!parseKey(c.at)) continue;
      cue.at = c.at;
    }
    if (CUES[c.a].pts) {
      const pts = (Array.isArray(c.pts) ? c.pts : []).slice(0, STAGE_MAX_PTS)
        .filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.z)))
        .map((p) => ({ x: Math.round(num(p.x, -H, H, 0)), z: Math.round(num(p.z, -H, H, 0)) }));
      if (!pts.length) continue;
      cue.pts = pts;
    }
    if (c.a === 'speed' || (c.a === 'path' && c.n != null)) cue.n = Math.round(num(c.n, 0, 5, 4));
    out.cues.push(cue);
  }
  const shots = Array.isArray(raw.shots) ? raw.shots.slice(0, STAGE_MAX_SHOTS) : [];
  for (const s of shots) {
    if (!s || !SHOTS[s.k]) continue;
    const shot = { t: num(s.t, 0, STAGE_MAX_T, 0), k: s.k, glide: num(s.glide, 0, 30, 0) };
    if (s.k === 'follow') {
      if (!parseKey(s.u)) continue;
      shot.u = s.u;
      shot.view = VIEWS[s.view] ? s.view : 'quarter';
      // Turn slowly round her while the shot runs, in degrees a second.
      shot.spin = num(s.spin, -30, 30, 0);
    } else if (s.k === 'fixed') {
      shot.x = Math.round(num(s.x, -H, H, 0));
      shot.z = Math.round(num(s.z, -H, H, 0));
      shot.y = Math.round(num(s.y, 2, 3000, 40));
      if (parseKey(s.look)) shot.look = s.look;
      else {
        shot.lx = Math.round(num(s.lx, -H, H, 0));
        shot.lz = Math.round(num(s.lz, -H, H, 0));
      }
      shot.fov = num(s.fov, 8, 80, 50);
    }
    out.shots.push(shot);
  }
  out.cues.sort((a, b) => a.t - b.t);
  out.shots.sort((a, b) => a.t - b.t);
  return out;
}

/** Seconds as the editor writes them: m:ss. */
export function clockOf(t) {
  const s = Math.max(0, Math.round(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// What a notch on the telegraph is worth, as a fraction of her top speed. The
// same ladder the simulation runs (THROTTLE_NOTCHES in sim.js): astern, stop,
// slow, half, three-quarters, full.
const NOTCH = [-0.3, 0, 0.25, 0.5, 0.75, 1];

/** Close enough to a point on her course to go on to the next one. */
const REACHED = 260;

/**
 * Where everything will be, roughly, at a moment in the script.
 *
 * Not the simulation: a ship here turns at her own rate and makes the speed on
 * her telegraph, and nothing hits her. It is what a director wants from a
 * storyboard -- where she is meant to be when the shot is taken -- and it is
 * worked out in a few hundred steps, so the editor can scrub through a whole
 * scene as fast as a finger moves.
 *
 * `units` is every ship as the chart has her: `{ key, classId, x, z, heading }`.
 * Returns a Map of key -> `{ x, z, heading, speed, gone, track }`, where
 * `track` is the line she has sailed to get there.
 */
export function previewAt(units, script, T, step = 2) {
  const out = new Map();
  const cues = (script?.cues || []).filter((c) => c.t <= T);
  for (const u of units) {
    const cls = getClass(u.classId);
    const mine = cues.filter((c) => c.u === u.key);
    let x = u.x, z = u.z, h = u.heading, v = 0, notch = 1;
    let pts = null, at = 0, gone = false;
    const track = [{ x, z }];
    let k = 0;
    for (let t = 0; t <= T + 1e-6; t += step) {
      while (k < mine.length && mine[k].t <= t) {
        const c = mine[k++];
        if (c.a === 'speed') notch = c.n;
        else if (c.a === 'path') {
          pts = c.pts;
          at = 0;
          if (c.n != null) notch = c.n;
          else if (notch <= 1) notch = 4;
        } else if (c.a === 'sink' || c.a === 'break' || c.a === 'blow') gone = true;
      }
      if (gone) { v = Math.max(0, v - cls.accel * 1.6 * step); }
      if (pts && at < pts.length) {
        if (dist(x, z, pts[at].x, pts[at].z) < REACHED) at++;
        if (at < pts.length) {
          const want = headingTo(x, z, pts[at].x, pts[at].z);
          // Her turn comes with her way: stopped, she does not answer the helm.
          const rate = cls.turnRate * clamp(Math.abs(v) / Math.max(1, cls.maxSpeed * 0.5), 0.15, 1);
          h = approachAngle(h, want, rate * step);
        }
      }
      if (!gone) {
        const target = NOTCH[notch] * cls.maxSpeed;
        const accel = cls.accel * (target < v ? 1.6 : 1);
        v = v < target ? Math.min(target, v + accel * step) : Math.max(target, v - accel * step);
      }
      x += Math.sin(h) * v * step;
      z += Math.cos(h) * v * step;
      if (t % 10 < step) track.push({ x, z });
    }
    track.push({ x, z });
    out.set(u.key, { x, z, heading: h, speed: v, gone, track });
  }
  return out;
}
