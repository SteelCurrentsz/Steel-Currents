// USS Essex (CV-9), drawn from the owner's model of her.
//
// The name ship of the Essex class: two hundred and sixty-six metres, a
// hundred aircraft, thirty-three knots, four twin 5"/38s fore and aft of her
// island and a gallery of Bofors and Oerlikons all round her.
//
// Her hull, her island and her guns are the model -- "USS Essex (CV-9)" by
// kriss50 (https://skfb.ly/p9vxQ), under Creative Commons Attribution 4.0 --
// cut by build/prepare-essex-hull.mjs (see build/kriss-hull.mjs), and put
// together by carrier.js with her runway, her three lifts -- one forward and
// one aft on her centreline, and her deck-edge lift to port abreast her
// island, which runs up and down the outside of her hull -- her hangar and
// her air group, and her deck evolution.
import * as D from './essexHull.data.js';
import { carrier } from './carrier.js';

const SHIP = carrier({
  id: 'essex', data: D,
  lifts: [
    // No.1, forward on her centreline.
    { z: 78, hw: 7.3, hd: 6.7, ch: 0.6 },
    // No.2, her deck-edge lift to port, where the model drew it.
    { x: 17.9, z: 15.0, hw: 6.0, hd: 9.2, ch: 0.3 },
    // No.3, aft on her centreline: the one that works her launches.
    { z: -72, hw: 7.3, hd: 6.7, ch: 0.6 },
  ],
  hangar: { y: 10.2, z: [-100, 104], hw: 12.0 },
  citadel: { z: [-70, 76], deck: 4.0, top: 4.2, foot: -3.2 },
});

export const { LOA, BEAM, FD, HANGAR, LIFTS, zAt, keelY, shellAt, fdY, LINES, MOUNT_SEATS, ISLAND, hangarSpots, stepDeck } = SHIP;
export const essexSurfaceY = SHIP.surfaceY;
export const buildEssex = () => SHIP.build();
export const essexParts = SHIP.parts;
