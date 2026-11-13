// How the ships built by build/kriss-hull.mjs are painted, navy by navy: the
// models come untextured, one grey, and each face is given its navy's paint
// by where it is and which way it looks.

// The Imperial Navy's destroyers: Kure grey over everything, the weather
// decks linoleum-brown forward of the funnels and steel aft, red under the
// waterline with a black band at it.
/** The top of the band at her waterline: cut straight along it (paintLines). */
export const BOOT = 0.6;
export const IJN_PAINTS = {
  grey: 0x6e7175,
  dark: 0x4d5155,
  deck: 0x6b5242,
  steel: 0x5d6064,
  boot: 0x1a1b1d,
  bottom: 0x7a3228,
};
export function ijnPaint(f) {
  if (f.kind === 'screw') return 'dark';
  if (f.cy < -0.02) return 'bottom';
  if (f.shell && f.cy < BOOT) return 'boot';
  if (f.kind) return 'grey';
  if (f.up && f.cy > 2) return 'deck';
  return 'grey';
}

// The United States Navy's wartime paint, Measure 21 for a merchant ship
// under the Naval Armed Guard: navy blue on every vertical surface, deck blue
// on her decks, a black boot topping and red under water.
export const USN_PAINTS = {
  grey: 0x323f56,      // 5-N navy blue
  light: 0x87909a,     // 5-H haze grey
  deck: 0x3e4856,      // 20-B deck blue
  wood: 0x8a7458,      // a planked deck, holystoned
  boot: 0x15181c,
  bottom: 0x7a3228,
  dark: 0x4d545c,
};
export function usnPaint(f) {
  if (f.kind === 'screw') return 'dark';
  if (f.cy < -0.02) return 'bottom';
  if (f.shell && f.cy < BOOT) return 'boot';
  if (f.kind) return 'grey';
  if (f.up && f.cy > 2) return 'deck';
  return 'grey';
}

// The Marine nationale's battleships of 1940: a light blue-grey over her hull
// and her upperworks, her teak decks bare, a black boot topping and red
// under water.
export const MN_PAINTS = {
  grey: 0x8e979e,
  dark: 0x5b6268,
  wood: 0x9a8566,
  steel: 0x6f767c,
  boot: 0x1b1d20,
  bottom: 0x7a3228,
};
export function mnPaint(f) {
  if (f.kind === 'screw') return 'dark';
  if (f.cy < -0.02) return 'bottom';
  if (f.shell && f.cy < BOOT) return 'boot';
  if (f.kind) return 'grey';
  if (f.up && f.cy > 2 && f.hull) return 'wood';
  if (f.up && f.cy > 2) return 'steel';
  return 'grey';
}

// The Imperial Navy's battleships: Kure grey over hull, turrets and
// upperworks, their weather decks bare planking -- the hull's own, and none
// of the roofs and platforms over it -- red under the waterline with a black
// band at it.
export const IJN_BB_PAINTS = { ...IJN_PAINTS, wood: 0x8f7a5c };
export function ijnBBPaint(f) {
  if (f.kind === 'screw') return 'dark';
  if (f.cy < -0.02) return 'bottom';
  if (f.shell && f.cy < BOOT) return 'boot';
  if (f.kind) return 'grey';
  if (f.up && f.cy > 2 && f.hull) return 'wood';
  return 'grey';
}
