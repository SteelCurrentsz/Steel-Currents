// Where each aeroplane of a formation flies, relative to her leader.
//
// Shared because the simulation needs it now as well as the renderer: a
// machine that goes down falls from the place she was drawn flying in, and two
// aeroplanes that touch have to be touching where the screen shows them, not
// at their leaders' positions fifty metres away.

/**
 * A carrier flight: two sections of vics, each machine stepped down from his
 * leader, and the second section the same again outside them. In metres --
 * across, up, along -- and the real spacing.
 */
export const SLOTS = [
  [0, 0, 0],
  [22, -6, -18],
  [-26, -4, -22],
  [-48, -9, -42],
  [46, -11, -40],
  [0, -14, -46],
];

/**
 * A heavy squadron: line astern stepped down and out, far enough apart that
 * one aeroplane blowing up does not take the next with her.
 */
export const VIC = [
  [0, 0, 0],
  [-52, -14, -46],
  [52, -14, -46],
  [-104, -28, -92],
  [104, -28, -92],
  [0, -22, -92],
  [-156, -40, -138],
  [156, -40, -138],
  [0, -44, -184],
];

function place(table, i, heading, out) {
  const [sx, sy, sz] = table[i % table.length];
  const sn = Math.sin(heading);
  const cs = Math.cos(heading);
  out.x = sn * sz + cs * sx;
  out.y = sy;
  out.z = cs * sz - sn * sx;
  return out;
}

/** Where machine `i` of a flight is, off her leader, on `heading`. */
export function slotAt(i, heading, out = { x: 0, y: 0, z: 0 }) {
  return place(SLOTS, i, heading, out);
}

/** The same for a heavy squadron's vic. */
export function vicAt(i, heading, out = { x: 0, y: 0, z: 0 }) {
  return place(VIC, Math.min(i, VIC.length - 1), heading, out);
}

// ---------------------------------------------------------------------------
// Forming up over an airfield
// ---------------------------------------------------------------------------
//
// A heavy squadron off its own airfield does not go off the runway in a
// block. The machines come out of the hangar line onto the perimeter track
// and wait their turn, and each in turn taxies down to the threshold, lines
// up and rolls; the first one off goes round in a wide circle over the field,
// the next one off follows her round it, and when the last is up they close
// up into the vic and only then set course.
//
// The whole of it is a fixed path in time, worked out here from where it
// started -- the same for the simulation, which keeps the squadron's leader
// on it and hits each machine where it is, and for the screen, which draws
// each of them where it is.

/** How fast a heavy taxies, metres a second, and how hard she accelerates down the runway. */
const TAXI = 8;
const ROLL_ACCEL = 2.4;
/** How fast she climbs once she is off, and how much faster she gets until she is at her cruise. */
const CLIMB = 9;
const PICKUP = 1.2;
/** How far in from the threshold the link off the perimeter track meets the runway, and how far out the track is. */
const LINK = 40;
const TRACK = 60;
/** How far apart the machines waiting on the track stand. */
const QUEUE = 36;
/** How long after the next one is off the runway before the one behind her starts rolling. */
const CLEAR = 3;
/** How long the last one off goes round before they close up, and how long closing up takes. */
const ORBIT_MIN = 35;
const JOIN = 45;
/** The circle they go round over the field. */
export const FORM_RADIUS = 1600;

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** How long her roll is, start to unstick, in seconds. */
function rollTime(fm) {
  return fm.lift / ROLL_ACCEL;
}

/** When machine `r` of the take-off order starts her roll, after the forming up began. */
function rollStart(fm, r) {
  return LINK / TAXI + TRACK / TAXI + r * (rollTime(fm) + CLEAR);
}

/** How long the runway is in use from the first of them taxiing to the last of them off it. */
export function formRunwayTime(fm) {
  return rollStart(fm, fm.n - 1) + rollTime(fm) + CLEAR;
}

/** When they have all closed up and the forming up is over. */
export function formDone(fm) {
  // One by herself has nobody to wait for: she sets course once she is off.
  if (fm.n <= 1) return rollStart(fm, 0) + rollTime(fm) + 6;
  return rollStart(fm, fm.n - 1) + rollTime(fm) + ORBIT_MIN + JOIN;
}

/** When they start closing up on the leader. */
function joinStart(fm) {
  return formDone(fm) - JOIN;
}

/**
 * Where machine `r` of the take-off order is a time `t` after the squadron
 * started out of its hangars: `{ x, y, z, h, bank, v, air }` -- `air` false
 * while she is still on the ground. `fm` is the forming up as takeOff laid
 * it out: the threshold (`sx`, `sz`), the way down the runway (`dx`, `dz`),
 * the way across to the perimeter track (`lx`, `lz`), the runway's height
 * `y0`, her unstick speed `lift`, her cruise `v`, her height to climb to
 * `alt`, which way they go round (`turn`, +1 to starboard) and how many of
 * them there are (`n`).
 */
export function formPose(fm, r, t, out = {}) {
  const at = (s, l) => ({ x: fm.sx + fm.dx * s + fm.lx * l, z: fm.sz + fm.dz * s + fm.lz * l });
  const hd = Math.atan2(fm.dx, fm.dz);
  const t0 = rollStart(fm, r);
  const tr = rollTime(fm);
  out.bank = 0;
  out.air = false;
  if (t < t0) {
    // On the perimeter track, waiting her turn, and then down it and up the
    // link onto the runway. Every metre of that is at taxiing speed, so she
    // sets off from her place in the queue in time to be lined up as the one
    // in front of her unsticks.
    const queued = QUEUE * r;
    const path = queued + TRACK;
    const left = (t0 - t) * TAXI;
    out.y = fm.y0;
    out.v = left < path ? TAXI : 0;
    const s = Math.min(left, path);
    if (s > TRACK) {
      const p = at(LINK + (s - TRACK), TRACK);
      out.x = p.x; out.z = p.z;
      out.h = wrapA(hd + Math.PI);
    } else {
      const p = at(LINK, s);
      out.x = p.x; out.z = p.z;
      // Up the link, turning onto the runway as she gets to it.
      const across = Math.atan2(-fm.lx, -fm.lz);
      out.h = wrapA(across + (hd - across) * smooth(1 - s / 12));
    }
    return out;
  }
  const tau = t - t0;
  if (tau < tr) {
    // Down the runway.
    const s = 0.5 * ROLL_ACCEL * tau * tau;
    const p = at(LINK + s, 0);
    out.x = p.x; out.z = p.z; out.y = fm.y0;
    out.h = hd;
    out.v = ROLL_ACCEL * tau;
    return out;
  }
  // Off, and round the circle over the field, climbing as she goes.
  const ta = tau - tr;
  const T1 = Math.max(0, (fm.v - fm.lift) / PICKUP);
  const sa = ta < T1 ? fm.lift * ta + 0.5 * PICKUP * ta * ta : fm.lift * T1 + 0.5 * PICKUP * T1 * T1 + fm.v * (ta - T1);
  const P = at(LINK + 0.5 * ROLL_ACCEL * tr * tr, 0);
  const R = FORM_RADIUS;
  // Straight ahead for the first of it, and then into the turn.
  const straight = 600;
  const th = Math.max(0, sa - straight) / R;
  const s0 = Math.min(sa, straight);
  const h = hd + fm.turn * th;
  out.x = P.x + fm.dx * s0 + fm.turn * R * (Math.cos(hd) - Math.cos(h));
  out.z = P.z + fm.dz * s0 + fm.turn * R * (Math.sin(h) - Math.sin(hd));
  out.y = Math.min(fm.alt, fm.y0 + CLIMB * ta);
  out.h = wrapA(h);
  out.v = ta < T1 ? fm.lift + PICKUP * ta : fm.v;
  const banked = sa > straight ? Math.min(0.45, Math.atan2(out.v * out.v, R * 9.81)) : 0;
  out.bank = fm.turn * banked * smooth((sa - straight) / 200);
  out.air = true;
  return out;
}

/**
 * Every machine of a forming squadron, by her place in the take-off order,
 * where she is now: the leader on her circle, and once they are all up the
 * ones behind her closing on their stations in the vic.
 */
export function formPoses(fm, t, out = []) {
  out.length = fm.n;
  const lead = formPose(fm, 0, t, out[0] || {});
  out[0] = lead;
  const w = smooth((t - joinStart(fm)) / JOIN);
  // Each closes on her own station in the vic, which is where she is drawn
  // once the forming up is over: `st` is the station of each, in the
  // take-off order.
  const st = fm.st || [];
  const slot = { x: 0, y: 0, z: 0 };
  const home = vicAt(st[0] ?? 0, lead.h, { x: 0, y: 0, z: 0 });
  for (let r = 1; r < fm.n; r++) {
    const p = formPose(fm, r, t, out[r] || {});
    if (w > 0) {
      vicAt(st[r] ?? r, lead.h, slot);
      p.x += (lead.x + slot.x - home.x - p.x) * w;
      p.y += (lead.y + slot.y - home.y - p.y) * w;
      p.z += (lead.z + slot.z - home.z - p.z) * w;
      p.h = wrapA(p.h + wrapA(lead.h - p.h) * w);
      p.bank += (lead.bank - p.bank) * w;
    }
    out[r] = p;
  }
  return out;
}
