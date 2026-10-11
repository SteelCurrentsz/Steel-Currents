// A ship's searchlights, as the battle knows them.
//
// Where each one stands on her is a matter of her model -- bridge wings and
// the after superstructure, her island, a boat's tower -- and the renderer
// finds that off the model itself (see client/js/render/searchlights.js).
// What the battle keeps is how many she has and what each is doing: on or
// off, and where it is trained. That has to go over the wire, because a
// searchlight is the one thing on a darkened ship that every other ship in the
// action can see.

/**
 * How many she carries: a pair on her bridge and a pair aft, one each side;
 * a carrier a pair on her island; a submarine one, on her tower.
 */
export function lampCount(cls) {
  if (!cls) return 0;
  if (cls.type === 'SS') return 1;
  if (cls.type === 'CV') return 2;
  return 4;
}

/** How far down and up a lamp trains, in radians off the horizontal. */
export const LAMP_PITCH = { min: -0.45, max: 1.1 };

/** A fresh set, all of them dark and trained fore and aft. */
export function freshLamps(cls) {
  return Array.from({ length: lampCount(cls) }, () => ({ on: false, yaw: 0, pitch: -0.04 }));
}

/**
 * An order to one of them: switch it on or off, or train it. `yaw` is off her
 * own bow, so a lamp trained abeam stays abeam as she turns.
 */
export function setLamp(ship, cls, msg) {
  if (!ship || !ship.alive || !msg) return false;
  if (!ship.lamps) ship.lamps = freshLamps(cls);
  const k = msg.k | 0;
  const l = ship.lamps[k];
  if (!l) return false;
  if (typeof msg.on === 'boolean') l.on = msg.on;
  if (Number.isFinite(msg.yaw)) l.yaw = Math.atan2(Math.sin(msg.yaw), Math.cos(msg.yaw));
  if (Number.isFinite(msg.pitch)) l.pitch = Math.min(LAMP_PITCH.max, Math.max(LAMP_PITCH.min, msg.pitch));
  return true;
}

/**
 * Her lit lamps for the wire: [index, yaw, pitch] each, in hundredths of a
 * radian. Nothing at all when none is lit, which is nearly always.
 */
export function lampWire(ship) {
  if (!ship.lamps || !ship.alive) return null;
  const out = [];
  ship.lamps.forEach((l, k) => {
    if (l.on) out.push([k, Math.round(l.yaw * 100), Math.round(l.pitch * 100)]);
  });
  return out.length ? out : null;
}
