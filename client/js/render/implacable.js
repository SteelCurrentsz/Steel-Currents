// HMS Implacable, drawn from the owner's model of her.
//
// The last of the armoured carriers: two hundred and thirty-three metres, two
// hangars one over the other under an armoured flight deck, eighty-one
// aircraft, thirty-two knots, eight twin 4.5-inch at the edges of her flight
// deck and pom-poms, Bofors and Oerlikons all round her.
//
// Her hull, her island and her guns are the model -- "HMS Implacable" by
// kriss50 (https://skfb.ly/ptKt7), under Creative Commons Attribution 4.0 --
// cut by build/prepare-implacable-hull.mjs (see build/kriss-hull.mjs), and put
// together by carrier.js with her runway, her two lifts -- the forward one, the
// bigger, ahead of her island, and the after one, which works her launches --
// her hangar and her air group, and her deck evolution.
import * as D from './implacableHull.data.js';
import { carrier } from './carrier.js';

const SHIP = carrier({
  id: 'implacable', data: D,
  // Admiralty grey, and her armoured flight deck a dark grey steel.
  paints: { steel: 0x5d656b, steelDark: 0x41474c, deckSteel: 0x4e5357, flightDeck: 0x55595c },
  lifts: [
    // Her forward lift, 45 ft by 33, ahead of her island.
    { z: 58, hw: 5.0, hd: 6.85, ch: 0.5 },
    // And her after lift, 45 ft by 22: the one that works her launches.
    { z: -76, hw: 3.35, hd: 6.85, ch: 0.4 },
  ],
  // Her upper hangar, 458 ft by 62 under the flight deck.
  hangar: { y: 8.0, z: [-82, 72], hw: 9.4 },
  citadel: { z: [-76, 72], deck: 3.0, top: 3.4, foot: -3.2 },
});

export const { LOA, BEAM, FD, HANGAR, LIFTS, zAt, keelY, shellAt, fdY, LINES, MOUNT_SEATS, ISLAND, hangarSpots, stepDeck } = SHIP;
export const implacableSurfaceY = SHIP.surfaceY;
export const buildImplacable = () => SHIP.build();
export const implacableParts = SHIP.parts;
