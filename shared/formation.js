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
