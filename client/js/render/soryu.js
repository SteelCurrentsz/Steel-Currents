// IJN Sōryū, drawn from the owner's model of her.
//
// The first carrier the Navy designed as one from the keel up and to her own
// size: two hundred and twenty-seven metres, thirty-four knots on a cruiser's
// machinery, two hangars one over the other, three lifts down her
// centreline, a small island well forward on her starboard side and her two
// funnels trunked out under her starboard deck edge and curving down to the
// water. Fifty-seven aircraft -- Zeros, Vals and Kates -- at Pearl Harbor,
// Wake, Darwin and in the Indian Ocean, and sunk at Midway on 4 June 1942.
//
// Her hull, her island, her funnels and her galleries are the model -- "IJN
// Soryu" by 42manako (https://skfb.ly/pwnZy), under Creative Commons
// Attribution 4.0 -- cut by build/prepare-soryu-hull.mjs (see
// build/kriss-hull.mjs) and painted as the Shokaku is; her guns stand where
// the model stands its own, and are the Suzuya's 12.7 cm twins and 25 mm
// twins (see build/borrow-guns.mjs). Put together by carrier.js with her
// planked runway, the Shokaku's, laid over the outline of the model's own
// flight deck, her three lifts cut through it where the model draws them,
// her hangar and her air group, and her deck evolution.
import * as D from './soryuHull.data.js';
import { carrier } from './carrier.js';
import { SHOKAKU_PAINT } from './shokakuPaint.js';

const SHIP = carrier({
  id: 'soryu', data: D,
  // The Shokaku's paint, and her runway the planking hers is laid in.
  paints: SHOKAKU_PAINT,
  lifts: [
    // No.1, forward of her island: the biggest, sixteen metres across.
    { z: 36.4, hw: 8.0, hd: 6.0, ch: 0.6 },
    // No.2, amidships.
    { z: -19.9, hw: 6.5, hd: 6.0, ch: 0.5 },
    // And No.3, aft: the one that works her launches and her recoveries.
    { z: -75.0, hw: 5.4, hd: 6.0, ch: 0.5 },
  ],
  // Her upper hangar, under her flight deck, its deckhead the underside of it.
  hangar: { y: 7.5, top: 12.2, z: [-84, 88], hw: 8.6 },
  citadel: { z: [-52, 56], deck: 3.0, top: 3.4, foot: -2.6 },
});

export const { LOA, BEAM, FD, HANGAR, FD_FWD, FD_AFT, SPOT, LIFTS, zAt, keelY, shellAt, fdY, LINES, MOUNT_SEATS, ISLAND, hangarSpots, stepDeck } = SHIP;
export const soryuSurfaceY = SHIP.surfaceY;
export const buildSoryu = () => SHIP.build();
export const soryuParts = SHIP.parts;
