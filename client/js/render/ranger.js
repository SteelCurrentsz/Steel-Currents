// USS Ranger (CV-4), drawn from the owner's model of her.
//
// The first American ship laid down as a carrier from the keel up: two
// hundred and thirty-four metres, a flush flight deck over an open hangar,
// six small funnels that hinged down out of the way, and seventy aircraft.
// Too slow and too lightly built for the Pacific, she fought in the Atlantic:
// Torch, and the raid on Bodø in 1943.
//
// Her hull, her island and her guns are the model -- "uss Ranger wows" by
// zeek (https://skfb.ly/pNoyx), under Creative Commons Attribution 4.0 -- cut
// by build/prepare-ranger-hull.mjs (see build/kriss-hull.mjs), and put
// together by carrier.js with her runway, her lifts, her hangar and her air
// group, and her deck evolution.
import * as D from './rangerHull.data.js';
import { carrier } from './carrier.js';

const SHIP = carrier({
  id: 'ranger', data: D,
  lifts: [
    // Her forward lift, abreast her island.
    { z: 5, hw: 6.0, hd: 6.0, ch: 0.5 },
    // And her after lift, abaft it: the one that works her launches.
    { z: -21, hw: 6.0, hd: 6.0, ch: 0.5 },
  ],
  hangar: { y: 10.0, z: [-95, 95], hw: 10.5 },
  citadel: { z: [-70, 70], deck: 3.0, top: 3.4, foot: -3.2 },
});

export const { LOA, BEAM, FD, HANGAR, FD_FWD, FD_AFT, SPOT, LIFTS, zAt, keelY, shellAt, fdY, LINES, MOUNT_SEATS, ISLAND, hangarSpots, stepDeck } = SHIP;
export const rangerSurfaceY = SHIP.surfaceY;
export const buildRanger = () => SHIP.build();
export const rangerParts = SHIP.parts;
