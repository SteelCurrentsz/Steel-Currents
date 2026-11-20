// HMS Illustrious, drawn from the owner's model of her.
//
// The first of the armoured carriers: her hangar a steel box under a
// three-inch flight deck, with four and a half inches at its sides -- fewer
// aircraft than an open-hangared carrier of her size, and a ship that could
// be hit and steam on. Her Swordfish crippled the Italian fleet at Taranto in
// November 1940; in January 1941 the Stukas hit her six times off Malta and
// she got into Grand Harbour and away again. She flew fifty-seven aircraft.
//
// Her hull, her island and her guns are the model -- "CV HMS Illustrious (War
// Thunder)" by KojfDiscord, under Creative Commons Attribution 4.0 -- cut by
// build/prepare-illustrious-hull.mjs (see build/kriss-hull.mjs), and put
// together by carrier.js with her runway, her two lifts -- the forward one
// ahead of her island and the after one, which works her launches -- her
// hangar and her air group, and her deck evolution.
import * as D from './illustriousHull.data.js';
import { carrier } from './carrier.js';

const SHIP = carrier({
  id: 'illustrious', data: D,
  // Admiralty grey, and her armoured flight deck a dark grey steel.
  paints: { steel: 0x5d656b, steelDark: 0x41474c, deckSteel: 0x4e5357, flightDeck: 0x55595c },
  lifts: [
    // Her forward lift, 45 ft by 22, ahead of her island.
    { z: 60, hw: 3.35, hd: 6.85, ch: 0.4 },
    // And her after lift, 45 ft by 22: the one that works her launches.
    { z: -70, hw: 3.35, hd: 6.85, ch: 0.4 },
  ],
  // Her one hangar, 458 ft by 62 and sixteen feet high, under the flight deck.
  hangar: { y: 6.6, z: [-76, 68], hw: 9.4 },
  citadel: { z: [-74, 68], deck: 3.0, top: 3.4, foot: -3.2 },
});

export const { LOA, BEAM, FD, HANGAR, LIFTS, zAt, keelY, shellAt, fdY, LINES, MOUNT_SEATS, ISLAND, hangarSpots, stepDeck } = SHIP;
export const illustriousSurfaceY = SHIP.surfaceY;
export const buildIllustrious = () => SHIP.build();
export const illustriousParts = SHIP.parts;
