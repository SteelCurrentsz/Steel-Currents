// A fighter pilot's head.
//
// A fighter flight used to fight another one by being near it. Inside four
// hundred and twenty metres both took damage at a steady rate, whichever way
// either of them was pointing -- so there was no such thing as getting on a
// man's tail, no such thing as getting out from under him, and no reason to
// fly a fighter well. The one fighter in the battle that could roll, loop or
// pull lead was the player's, and nothing he fought could do any of it back.
//
// This is the other half. Once a fighter is close enough to fight she is
// flown on the same wing, the same stick and the same instructor as the
// player's aeroplane (shared/pilot.js), and what she does with them is
// decided here, a few times a second, the way a pilot decides it:
//
//   - is anybody on my tail?  Then get out from under him: turn hard into
//     him so he cannot hold his lead, and when he is close and about to fire,
//     roll, break, split-S or scissor to make him overshoot.
//   - am I on his?  Then pull lead -- put the nose where he is going to be,
//     not where he is -- and fire only when the guns will actually hit. Too
//     fast and closing, a high yo-yo out of his plane of turn so as not to
//     overshoot; above him with speed, dive on him and zoom back up.
//   - neither?  Lead-turn him: cut inside his circle to get the angles.
//   - and always: not into the sea, not into him, and not so slow she falls
//     out of the sky.
//
// She shoots real rounds down her real bore (sim.js fireBullet), so she
// misses when the lead is wrong and a man jinking about spoils it -- which is
// how a fighter pilot defends himself, and now it works against her too.

import { stallSpeed } from './aero.js';
import {
  Pilot, AGILITY, instruct, startManeuver, flyManeuver, pathOf, upOf,
} from './pilot.js';

/** How close a fighter has to be to an enemy before the fight starts, slant. */
export const ENGAGE = 2600;
/** And how far apart they have to get before it is over. */
export const DISENGAGE = 4400;
/** How far out she opens fire. Rifle calibre wants to be close. */
export const OPEN_FIRE = 620;
/** Muzzle velocity, the same as sim.js uses for the rounds themselves. */
const BULLET_V = 810;
/** How often she takes a fresh look at the fight, in seconds. */
const THINK = 0.25;
/** Lowest she will willingly fight, above the sea or the ground under her. */
const HARD_DECK = 160;

const norm = (x, y, z) => {
  const l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
};
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

/** Which way, and how fast, any flight is going through the air. */
export function velocityOf(q) {
  if (q.df && q.df.pilot) {
    const p = q.df.pilot;
    const f = pathOf(p);
    return { x: f.x * p.v, y: f.y * p.v, z: f.z * p.v };
  }
  if (q.flown) {
    const v = q.speed || 80;
    const cg = Math.cos(q.pitch || 0);
    return {
      x: Math.sin(q.heading) * cg * v, y: Math.sin(q.pitch || 0) * v, z: Math.cos(q.heading) * cg * v,
    };
  }
  const s = q.speed || 70;
  return { x: Math.sin(q.heading) * s, y: q.vy || 0, z: Math.cos(q.heading) * s };
}

/** Does this flight have guns pointing forward that she can hurt me with? */
export function gunned(q) {
  return q.role === 'fighter' || !!q.flown;
}

/** Take her out of the cruise and put a pilot's hands on her. */
export function enterDogfight(p, frm) {
  const s = p.speed || frm.vMax * 0.7;
  const vy = p.vy || 0;
  const v = Math.max(stallSpeed(frm) * 1.2, Math.hypot(s, vy));
  const pilot = new Pilot(frm, {
    x: p.x, y: p.y ?? 220, z: p.z, heading: p.heading, speed: v,
    // As lively under the simulation's hands as under the player's: the same
    // aeroplane, the same advantage, and nothing taken off for being a bot.
    agility: AGILITY,
  });
  pilot.pitch = Math.atan2(vy, Math.max(1, s));
  pilot.bank = p.bank ?? 0;
  pilot.galeT = 0;
  p.df = {
    pilot,
    think: 0,
    mode: 'neutral',
    aim: pathOf(pilot),
    throttle: 1,
    // Seconds left of a zoom climb after a diving pass.
    zoom: 0,
    // And before she may throw another set piece: a pilot who rolls every
    // half second never points his guns at anybody.
    cool: 0,
    // Whether she was in close on the last look, for spotting a pass.
    close: false,
  };
  return p.df;
}

/** Back to the cruise, flying on where she was going. */
export function leaveDogfight(p) {
  const df = p.df;
  if (!df) return;
  const pl = df.pilot;
  // The right way up and not standing on her tail: the cruise flies a flight
  // path, not an attitude, and rolls her level out of whatever she was in.
  let bank = pl.bank;
  if (Math.abs(bank) > Math.PI / 2) bank = Math.sign(bank) * (Math.PI - Math.abs(bank));
  p.bank = Math.max(-1.2, Math.min(1.2, bank));
  p.roll = 0;
  p.vy = Math.max(-40, Math.min(30, pl.v * Math.sin(pl.pitch)));
  p.speed = Math.max(30, pl.v * Math.cos(pl.pitch));
  p.pitch = 0;
  p.df = null;
}

/**
 * Who she should be fighting, of everybody in reach.
 *
 * Not simply the nearest. The man on her tail comes first, because he is the
 * one who is going to kill her; after him, the one she has the best shot at
 * -- close, and near her nose -- because that is the one she can kill.
 */
export function pickFoe(state, p, mayHurt) {
  const pl = p.df ? p.df.pilot : null;
  const P = { x: p.x, y: p.y ?? 220, z: p.z };
  const fwd = pl ? pathOf(pl) : { x: Math.sin(p.heading), y: 0, z: Math.cos(p.heading) };
  let best = null;
  let bestScore = Infinity;
  for (const q of state.planes) {
    if (q.dead || q.id === p.id || !mayHurt(state, p.team, q)) continue;
    const dx = q.x - P.x, dy = (q.y ?? 220) - P.y, dz = q.z - P.z;
    const R = Math.hypot(dx, dy, dz);
    if (R > ENGAGE * 1.4) continue;
    const u = { x: dx / (R || 1), y: dy / (R || 1), z: dz / (R || 1) };
    const ata = angle(fwd, u);
    let score = R + ata * 600;
    if (gunned(q)) {
      const vq = velocityOf(q);
      const fq = norm(vq.x, vq.y, vq.z);
      // His nose on me, and close: he is the one to deal with.
      const onMe = angle(fq, { x: -u.x, y: -u.y, z: -u.z });
      if (onMe < 0.5 && R < 1400) score -= 1500 * (1 - onMe / 0.5);
    } else {
      // A bomber is worth more than a fighter: it is what the fighters are
      // there to stop. But not worth dying for.
      score -= 250;
    }
    // A little loyalty to the one she is on, so she does not swap from one to
    // the other every look and fight neither.
    if (q.id === p.targetAir) score -= 300;
    if (score < bestScore) { bestScore = score; best = q; }
  }
  return best;
}

/**
 * The most dangerous enemy fighter to her right now: close, behind her, and
 * with his nose on her. Null when nobody is.
 */
function threatTo(state, p, P, fwd, mayHurt) {
  let worst = null;
  let worstScore = 0;
  for (const q of state.planes) {
    if (q.dead || q.id === p.id || !gunned(q) || !mayHurt(state, p.team, q)) continue;
    const dx = P.x - q.x, dy = P.y - (q.y ?? 220), dz = P.z - q.z;
    const R = Math.hypot(dx, dy, dz);
    if (R > 1300 || R < 1) continue;
    const toMe = { x: dx / R, y: dy / R, z: dz / R };
    const vq = velocityOf(q);
    const fq = norm(vq.x, vq.y, vq.z);
    const onMe = angle(fq, toMe);
    if (onMe > 0.6) continue;
    // Behind her 3-9 line: in front of her he is a head-on pass, not a threat
    // to be run from.
    const behind = dot(fwd, toMe) > -0.1;
    if (!behind) continue;
    const score = (1 - onMe / 0.6) * (1 - R / 1300);
    if (score > worstScore) { worstScore = score; worst = { q, R, onMe, from: toMe }; }
  }
  return worst;
}

/** The same question from outside a fight: is anybody about to shoot her? */
export function threatOn(state, p, mayHurt) {
  const P = { x: p.x, y: p.y ?? 220, z: p.z };
  const fwd = p.df ? pathOf(p.df.pilot) : { x: Math.sin(p.heading), y: 0, z: Math.cos(p.heading) };
  return threatTo(state, p, P, fwd, mayHurt);
}

/** Where to put the nose so the rounds arrive where he will be. */
export function leadPoint(P, v, T, VT) {
  let t = Math.hypot(T.x - P.x, T.y - P.y, T.z - P.z) / (BULLET_V + v);
  let L = T;
  for (let i = 0; i < 3; i++) {
    L = { x: T.x + VT.x * t, y: T.y + VT.y * t, z: T.z + VT.z * t };
    t = Math.hypot(L.x - P.x, L.y - P.y, L.z - P.z) / (BULLET_V + v);
  }
  return L;
}

/**
 * A tick of a fighter in a fight.
 *
 * `foe` is the flight she is after, `ctx` what the simulation lends her: its
 * dice, the height of the ground under a point, who may hurt whom, and how
 * badly she is shot about. Moves her, and returns whether her guns are on and
 * she is firing this tick.
 */
export function stepDogfight(state, p, foe, dt, ctx) {
  const df = p.df;
  const pl = df.pilot;
  const rng = ctx.rng;
  // Whatever the simulation has done to her since the last tick -- she is
  // where it says she is.
  pl.x = p.x; pl.y = p.y ?? pl.y; pl.z = p.z;

  const P = { x: pl.x, y: pl.y, z: pl.z };
  const fwd = pathOf(pl);
  const up = upOf(pl);
  const v = pl.v;
  const vs = stallSpeed(pl.a);
  const ground = Math.max(0, ctx.groundAt(pl.x, pl.z));
  const agl = pl.y - ground;

  const T = { x: foe.x, y: foe.y ?? 220, z: foe.z };
  const VT = velocityOf(foe);
  const dx = T.x - P.x, dy = T.y - P.y, dz = T.z - P.z;
  const R = Math.max(1, Math.hypot(dx, dy, dz));
  const u = { x: dx / R, y: dy / R, z: dz / R };
  // How far he is off her nose, and how far she is off his tail.
  const ata = angle(fwd, u);
  const sT = Math.hypot(VT.x, VT.y, VT.z) || 1;
  const fT = { x: VT.x / sT, y: VT.y / sT, z: VT.z / sT };
  const aa = angle(fT, u);
  const closure = (fwd.x * v - VT.x) * u.x + (fwd.y * v - VT.y) * u.y + (fwd.z * v - VT.z) * u.z;
  const L = leadPoint(P, v, T, VT);
  const lead = norm(L.x - P.x, L.y - P.y, L.z - P.z);

  df.cool = Math.max(0, df.cool - dt);
  df.zoom = Math.max(0, df.zoom - dt);

  // ---- deciding ---------------------------------------------------------
  df.think -= dt;
  if (df.think <= 0) {
    // A quarter of a second, give or take: what it takes to see and decide.
    df.think = THINK * (0.8 + rng() * 0.4);
    const threat = threatTo(state, p, P, fwd, ctx.mayHurt);
    let aim = null;
    let mode = 'neutral';
    let throttle = 1;

    if (threat && !pl.man) {
      mode = 'defend';
      // Which side of her he is on, across her own wings.
      const right = { x: fwd.y * up.z - fwd.z * up.y, y: fwd.z * up.x - fwd.x * up.z, z: fwd.x * up.y - fwd.y * up.x };
      const away = threat.from;
      // `away` points from him to her, so the side he is on is the other way.
      const side = dot(right, away) > 0 ? -1 : 1;
      if (threat.R < 520 && threat.onMe < 0.18 && df.cool <= 0) {
        // He is about to fire. Throw something he cannot follow: each of these
        // takes her out of the line of his guns faster than he can bring them
        // back, and the one she picks depends on what she has to spend.
        const r = rng();
        const fast = v > vs * 1.9;
        let kind;
        if (agl > 1100 && fast && r < 0.18) kind = 'splitS';
        else if (r < 0.45) kind = 'barrel';
        else if (r < 0.75) kind = 'break';
        else if (r < 0.9) kind = 'scissors';
        else kind = 'roll';
        startManeuver(pl, kind, side);
        df.cool = 4 + rng() * 2;
      } else {
        // Turn hard into him. A man turning across your nose is the hardest
        // deflection shot there is, and every second of it costs him angle.
        const s = { x: right.x * side, y: right.y * side, z: right.z * side };
        const lat = norm(s.x - fwd.x * dot(s, fwd), s.y - fwd.y * dot(s, fwd), s.z - fwd.z * dot(s, fwd));
        // Nose a little low when she is slow, to keep her speed up while she
        // turns: a defensive turn that bleeds to the stall is a dead pilot.
        const sink = v < vs * 1.6 ? -0.25 : 0;
        aim = norm(fwd.x * 0.25 + lat.x, fwd.y * 0.25 + lat.y + sink, fwd.z * 0.25 + lat.z);
      }
    } else if (df.zoom > 0) {
      // Zooming back up after a diving pass, to come down on him again.
      mode = 'zoom';
      const hz = norm(fwd.x, 0, fwd.z);
      aim = norm(hz.x, 0.75, hz.z);
    } else {
      const hisNoseOnMe = gunned(foe) ? angle(fT, { x: -u.x, y: -u.y, z: -u.z }) : Math.PI;
      if (ata < 0.5 && hisNoseOnMe < 0.5 && R < 1600) {
        // Head-on. Shoot, and then do not hit him: at a combined three hundred
        // knots there is about a second between the two.
        mode = 'headon';
        if (R < 260) {
          // Over the top of him, out of his line.
          aim = norm(fwd.x + up.x * 1.2, fwd.y + up.y * 1.2, fwd.z + up.z * 1.2);
        } else aim = lead;
      } else if (P.y > T.y + 450 && R > 700 && ata < 1.2) {
        // Height on a fighter: come down on him with it and go back up. It is
        // the one way to fight a better-turning aeroplane.
        mode = 'boom';
        aim = lead;
      } else if (ata < 1.3 || aa < 1.4) {
        mode = 'attack';
        if (R > 900) {
          // Closing from a long way out. Aim a little behind him -- lag -- so
          // she arrives on his tail rather than across it.
          const lag = { x: T.x - VT.x * 0.8, y: T.y - VT.y * 0.8, z: T.z - VT.z * 0.8 };
          aim = norm(lag.x - P.x, lag.y - P.y, lag.z - P.z);
        } else {
          aim = lead;
        }
        // Coming in too fast on a turning target: a high yo-yo, out of his
        // plane of turn, trades the speed for height instead of overshooting.
        if (R < 480 && closure > 40 && ata > 0.35) {
          mode = 'yoyo';
          aim = norm(aim.x + up.x * 0.7, aim.y + up.y * 0.7 + 0.2, aim.z + up.z * 0.7);
          throttle = 0.55;
        } else if (R < 220 && closure > 25) {
          // About to fly through him. Off the power, and out of his plane.
          throttle = 0.3;
        } else if (R < 360 && closure < -12) {
          // He is pulling away: everything she has.
          throttle = 1.1;
        }
      } else {
        // Neither on the other: lead-turn him, cutting across inside his
        // circle to where he is going to be in a couple of seconds.
        mode = 'turn';
        const ahead = { x: T.x + VT.x * 2.2, y: T.y + VT.y * 2.2, z: T.z + VT.z * 2.2 };
        aim = norm(ahead.x - P.x, ahead.y - P.y, ahead.z - P.z);
      }
      // A pass made: she has gone through him and out the other side.
      if (df.close && R > 260 && ata > 1.7 && mode !== 'turn' && P.y > T.y - 100) {
        df.zoom = 3 + rng() * 2;
      }
    }
    df.close = R < 220;
    // Her hands are not perfect. Every look she holds her aim a little off
    // where it should be -- more on a target crossing fast, which is the
    // hardest shot there is, and next to nothing on one sitting dead astern.
    const VR = { x: VT.x - fwd.x * v, y: VT.y - fwd.y * v, z: VT.z - fwd.z * v };
    const across = Math.hypot(VR.x - u.x * dot(VR, u), VR.y - u.y * dot(VR, u), VR.z - u.z * dot(VR, u));
    const shake = 0.004 + Math.min(0.03, (across / Math.max(80, R)) * 0.35);
    df.wobble = {
      x: (rng() + rng() - 1) * shake, y: (rng() + rng() - 1) * shake, z: (rng() + rng() - 1) * shake,
    };
    // Too slow to fight: unload. Nose down a little and let her get her
    // speed back before she asks the wing for anything.
    if (aim && v < vs * 1.25) aim = norm(aim.x, Math.min(aim.y, -0.15), aim.z);
    if (aim) df.aim = aim;
    df.mode = mode;
    df.throttle = throttle;
  }

  // ---- staying alive -----------------------------------------------------
  // The hard deck, looked at every tick rather than every think: the sea comes
  // up faster than a quarter of a second.
  const sink = -fwd.y * v;
  const floor = HARD_DECK + Math.max(0, sink) * 3.2;
  if (agl < floor) {
    // A set piece that is going downhill is abandoned on the spot.
    if (pl.man && (pl.man.kind === 'splitS' || pl.man.kind === 'loop' || fwd.y < -0.1)) pl.man = null;
    const how = Math.min(1, (floor - agl) / floor);
    const a = df.aim;
    df.aim = norm(a.x, Math.max(a.y, 0.15 + how * 0.7), a.z);
  }
  // And not into him.
  if (R < 45) df.aim = norm(-u.x + up.x, -u.y + up.y, -u.z + up.z);

  // ---- flying ------------------------------------------------------------
  const wear = ctx.wear || { speed: 1, turn: 1 };
  if (!flyManeuver(pl, dt)) {
    // Her nose on the mark, not her flight path: the guns are along the one
    // and the instructor flies the other, so the angle her wing is working at
    // is taken off the way the player's ring is.
    const aoa = Math.max(-0.3, Math.min(0.3, pl.attitude - pl.pitch));
    const a = df.aim;
    // The bore is her heading at the attitude of her nose, so the correction
    // is in the vertical.
    const w = df.wobble || { x: 0, y: 0, z: 0 };
    const aimed = (df.mode === 'attack' || df.mode === 'headon' || df.mode === 'boom')
      ? norm(a.x + w.x, a.y - aoa + w.y, a.z + w.z) : a;
    instruct(pl, aimed);
  }
  pl.stickPitch *= wear.turn;
  pl.stickRoll *= wear.turn;
  pl.stickYaw *= wear.turn;
  pl.throttle = Math.min(1.1, df.throttle) * (wear.speed ?? 1);
  pl.step(dt, ground);
  if (!pl.alive) {
    // Into the sea. It happens to good pilots too.
    return { fire: false, crashed: true };
  }

  // ---- shooting ----------------------------------------------------------
  // Down the bore, which is her heading and the attitude of her nose. Only
  // when the burst will arrive on him: inside range and within the width of
  // an aeroplane of the lead point. A pilot spraying at a crossing target from
  // a kilometre out tells him he is there and hits nothing.
  const att = pl.attitude;
  const ca = Math.cos(att);
  const bore = { x: Math.sin(pl.heading) * ca, y: Math.sin(att), z: Math.cos(pl.heading) * ca };
  const off = angle(bore, lead);
  const window = Math.max(0.012, Math.atan(16 / R));
  // Head-on she holds her fire until it is worth it: at a combined closing
  // speed of five hundred knots the first second of it is wasted ammunition.
  const reach = df.mode === 'headon' ? OPEN_FIRE * 0.65 : OPEN_FIRE;
  const fire = R < reach && off < window && pl.alive;
  return { fire, crashed: false, R, mode: df.mode };
}
