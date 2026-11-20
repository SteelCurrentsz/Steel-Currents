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
export const IJN_BB_PAINTS = { ...IJN_PAINTS, wood: 0x7e705c };
export function ijnBBPaint(f) {
  if (f.kind === 'screw') return 'dark';
  if (f.cy < -0.02) return 'bottom';
  if (f.shell && f.cy < BOOT) return 'boot';
  if (f.kind) return 'grey';
  if (f.up && f.cy > 2 && f.hull) return 'wood';
  return 'grey';
}

// The Royal Navy's carriers in the Pacific in 1945: Admiralty grey over hull
// and island, her steel flight deck and galleries a darker grey, a black boot
// topping and red under water.
export const RN_PAINTS = {
  grey: 0x737b81,
  dark: 0x4b5157,
  deck: 0x565c61,
  boot: 0x16181b,
  bottom: 0x7a3228,
};
export function rnPaint(f) {
  if (f.kind === 'screw') return 'dark';
  if (f.cy < -0.02) return 'bottom';
  if (f.shell && f.cy < BOOT) return 'boot';
  if (f.kind) return 'grey';
  if (f.up && f.cy > 2) return 'deck';
  return 'grey';
}

// The Renown and the Repulse: the carriers' Admiralty grey over hull and
// upperworks, and their weather decks planked where they lie flat and low.
export const RENOWN_PAINTS = { ...RN_PAINTS, wood: 0x9a8a6c };
export const renownPaint = (f) => (f.up && !f.kind && f.cy > 2 && f.cy < 13 && f.ny > 0.97 ? 'wood' : rnPaint(f));

// The Kriegsmarine's destroyers: light grey (Hellgrau 50) over hull and
// upperworks, the steel weather decks dark grey (Dunkelgrau 51), a black
// boot topping and red under water.
export const KM_PAINTS = {
  grey: 0x8b9095,
  dark: 0x50555a,
  deck: 0x5b6065,
  boot: 0x17191b,
  bottom: 0x6e2e26,
};
export function kmPaint(f) {
  if (f.kind === 'screw') return 'dark';
  if (f.cy < -0.02) return 'bottom';
  if (f.shell && f.cy < BOOT) return 'boot';
  if (f.kind) return 'grey';
  if (f.up && f.cy > 2) return 'deck';
  return 'grey';
}

// The Royal Navy's destroyers of 1939-40: Admiralty light grey (507C) over
// hull and upperworks, their steel decks a darker grey, a black boot topping
// and red under water.
export const RN_DD_PAINTS = {
  grey: 0x878e93,
  dark: 0x4f555a,
  deck: 0x5a6065,
  boot: 0x16181b,
  bottom: 0x7a3228,
};
export const rnDDPaint = rnPaint;

// The Regia Marina's destroyers: grigio chiaro over hull and upperworks, the
// steel decks a dark grey, a black boot topping and red under water.
export const RM_PAINTS = {
  grey: 0x9aa0a4,
  dark: 0x575d62,
  deck: 0x62676b,
  boot: 0x17191b,
  bottom: 0x7a3228,
};
export const rmPaint = rnPaint;

// The Kriegsmarine's U-boats: Hellgrau 50 on the tower, the casing sides and
// everything above the tops of the saddle tanks, Dunkelgrau 51 on the tanks
// and the hull below them, the casing's wooden grating darker still, a black
// boot topping at the surfaced waterline and the dull green-black of the
// antifouling under it.
export const KM_SUB_PAINTS = {
  light: 0x8b929a,
  hull: 0x6b727a,
  deck: 0x4c4d48,
  dark: 0x4a5159,
  boot: 0x1a1d21,
  bottom: 0x3d423e,
};
/**
 * `tanks`: the height of the tops of her saddle tanks, where the two greys
 * meet, and `casing` the height of the top of her casing. Painted by height
 * alone, so the layers of her that the model draws one on another -- her
 * outer casing over her pressure hull, each seen through the limber holes of
 * the other -- are the one paint where they lie together, and do not fight.
 */
export const kmSubPaint = (tanks, casing = 2.2) => (f) => {
  if (f.kind === 'screw') return 'dark';
  if (f.kind) return 'light';
  if (f.cy < -0.02) return 'bottom';
  if (f.cy < BOOT) return 'boot';
  if (f.cy < tanks) return 'hull';
  if (f.up && f.cy < casing) return 'deck';
  return 'light';
};

// The Royal Navy's submarines in home waters and the Mediterranean in 1943:
// dark grey over the casing and the tower, a black boot topping, and the
// red-brown of the antifouling under it.
export const RN_SUB_PAINTS = {
  grey: 0x4f565c,
  light: 0x646b71,
  deck: 0x41464b,
  dark: 0x33383c,
  boot: 0x16181b,
  bottom: 0x5c2c25,
};
/** Painted by height alone, as the U-boats are (see kmSubPaint). */
export function rnSubPaint(f) {
  if (f.kind === 'screw') return 'dark';
  if (f.kind) return 'light';
  if (f.cy < -0.02) return 'bottom';
  if (f.cy < BOOT) return 'boot';
  if (f.up && f.cy < 2.0) return 'deck';
  return 'grey';
}

// The Shokaku's paint, as her model is textured and as shokaku.js draws her,
// for the carriers of her navy drawn off untextured models (the Sōryū and the
// Akagi): her grey over hull, island and galleries -- the median of the
// Shokaku's own sides -- her steel decks and gallery floors the grey of hers,
// and the red of her bottom straight up to her waterline, with no band at it.
export const SHOKAKU_PAINTS = {
  grey: 0x898b9f,
  deck: 0x848897,
  dark: 0x55595f,
  bottom: 0xa74535,
};
export function shokakuPaint(f) {
  if (f.kind === 'screw') return 'dark';
  if (f.cy < -0.02) return 'bottom';
  if (f.kind) return 'grey';
  if (f.up && f.cy > 2) return 'deck';
  return 'grey';
}
