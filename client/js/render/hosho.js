// IJN Hōshō, drawn from the owner's model of her.
//
// The first carrier built as one: a hundred and eighty metres of flight deck
// over a light cruiser's hull, twenty-five knots, a hangar under her flight
// deck and nineteen aircraft in it, flush-decked -- her island came off in
// 1924 -- and her flight deck carried out over her bow and her stern on
// trusses, as it was in 1944, its after end running down to her stern.
//
// Her hull, her galleries and her guns are the model -- "Japanese Aircraft
// Carrier Hōshō" by kriss50 (https://skfb.ly/ptTKX), under Creative Commons
// Attribution 4.0 -- cut by build/prepare-hosho-hull.mjs (see
// build/kriss-hull.mjs), and put together by carrier.js with her planked
// runway laid along the model's own profile of her flight deck, her two lifts
// cut through it -- the forward one, and the after one that works her
// launches and her recoveries, big enough to take a B4Y's span -- her hangar
// and her air group, and her deck evolution.
import * as D from './hoshoHull.data.js';
import { carrier } from './carrier.js';

const SHIP = carrier({
  id: 'hosho', data: D,
  // Kure grey, and her flight deck the planking it was laid in.
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, deckSteel: 0x5d6064, hangar: 0x737980, flightDeck: 0x9a9179, armour: 0x55595d },
  lifts: [
    // Her forward lift, forward of amidships.
    { z: 30, hw: 5.2, hd: 4.2, ch: 0.4 },
    // And her after lift, the one that works her deck: wide enough for a
    // B4Y spread, which a lift has to be for a biplane that does not fold.
    { z: -44, hw: 7.2, hd: 5.6, ch: 0.5 },
  ],
  // Her hangar, on her upper deck under her flight deck, its deckhead the
  // underside of her flight deck.
  hangar: { y: 7.72, top: 11.3, z: [-56, 44], hw: 7.3 },
  citadel: { z: [-48, 48], deck: 3.0, top: 3.2, foot: -2.8 },
});

export const { LOA, BEAM, FD, HANGAR, FD_FWD, FD_AFT, SPOT, LIFTS, zAt, keelY, shellAt, fdY, LINES, MOUNT_SEATS, ISLAND, hangarSpots, stepDeck } = SHIP;
export const hoshoSurfaceY = SHIP.surfaceY;
export const buildHosho = () => SHIP.build();
export const hoshoParts = SHIP.parts;
