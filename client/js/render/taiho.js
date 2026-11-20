// IJN Taihō, drawn from the owner's model of her design.
//
// The armoured carrier of 1944: a hangar under a flight deck plated with
// seventy-five millimetres of steel between her two lifts, a big island to
// starboard with her funnel raked out over the water, a flush hurricane bow,
// and a hundred and twenty-six aircraft. Ozawa's flagship in the Philippine
// Sea, torpedoed by the Albacore and blown up by her own petrol vapour six
// and a half hours later, on 19 June 1944.
//
// Her hull, her island and her galleries are the model -- "IJN Hakuryuu" by
// SB-129 (https://skfb.ly/oEKon), the Taihō as she was to have been repeated,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-taiho-
// hull.mjs (see build/kriss-hull.mjs) and painted as the Shokaku is; her
// twin 10 cm and her 25 mm triples are the model's own. Put together by
// carrier.js with her planked runway, her two lifts cut through it, her
// hangar and her air group, and her deck evolution.
import * as D from './taihoHull.data.js';
import { carrier } from './carrier.js';
import { SHOKAKU_PAINT } from './shokakuPaint.js';

const SHIP = carrier({
  id: 'taiho', data: D,
  // The Shokaku's paint, and her runway the planking hers is laid in.
  paints: SHOKAKU_PAINT,
  lifts: [
    // No.1, forward, at the fore end of her armoured deck.
    { z: 78.0, hw: 7.0, hd: 7.0, ch: 0.5 },
    // And No.2, aft, at the after end of it: the one that works her
    // launches and her recoveries.
    { z: -88.0, hw: 7.0, hd: 7.0, ch: 0.5 },
  ],
  // Her hangar, under her flight deck.
  hangar: { y: 6.3, top: 10.4, z: [-104, 104], hw: 10.0 },
  citadel: { z: [-72, 72], deck: 5.0, top: 5.6, foot: -3.6 },
});

export const { LOA, BEAM, FD, HANGAR, FD_FWD, FD_AFT, SPOT, LIFTS, zAt, keelY, shellAt, fdY, LINES, MOUNT_SEATS, ISLAND, hangarSpots, stepDeck } = SHIP;
export const taihoSurfaceY = SHIP.surfaceY;
export const buildTaiho = () => SHIP.build();
export const taihoParts = SHIP.parts;
