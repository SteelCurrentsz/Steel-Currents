// USS Lexington (CV-2), drawn from the owner's model of her.
//
// A battlecruiser's hull and turbo-electric machinery under a flight deck:
// two hundred and seventy metres, thirty-three knots, ninety aircraft, and as
// she was at the Coral Sea in May 1942, her 8-inch turrets landed for
// quadruple 1.1-inch.
//
// Her hull, her island and her great funnel and her guns are the model --
// "USS Lexington" by kriss50 (https://skfb.ly/ptOWO), under Creative Commons
// Attribution 4.0 -- cut by build/prepare-lexington-hull.mjs (see
// build/kriss-hull.mjs), and put together by carrier.js with her runway, her
// two lifts on her centreline, her hangar and her air group, and her deck
// evolution.
import * as D from './lexingtonHull.data.js';
import { carrier } from './carrier.js';

const SHIP = carrier({
  id: 'lexington', data: D,
  lifts: [
    // Her forward lift, the big one, ahead of her island.
    { z: 84, hw: 5.5, hd: 4.6, ch: 0.4 },
    // And her small after lift, which works her launches.
    { z: -86, hw: 5.2, hd: 2.5, ch: 0.3 },
  ],
  hangar: { y: 8.2, z: [-92, 92], hw: 11.0 },
  citadel: { z: [-80, 80], deck: 3.0, top: 3.4, foot: -4.0 },
});

export const { LOA, BEAM, FD, HANGAR, LIFTS, zAt, keelY, shellAt, fdY, LINES, MOUNT_SEATS, ISLAND, hangarSpots, stepDeck } = SHIP;
export const lexingtonSurfaceY = SHIP.surfaceY;
export const buildLexington = () => SHIP.build();
export const lexingtonParts = SHIP.parts;
