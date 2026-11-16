// IJN Akagi, drawn from the owner's model of her.
//
// Laid down as a battlecruiser of the Eight-Eight fleet and converted on the
// slip after the Washington treaty: two hundred and sixty metres, forty-one
// thousand tonnes at full load, thirty-one knots, and as she was rebuilt in
// 1938 a single flight deck the length of her running down to her stern
// over its last hundred metres, an island amidships to port, her funnel
// trunked down her starboard side and turned out over the water, and the six
// 20 cm guns she kept in casemates on her quarters. Ninety-one aircraft --
// Zeros, Vals and Kates -- and Nagumo's flagship at Pearl Harbor, Darwin and
// in the Indian Ocean; set on fire by a single bomb from Richard Best's
// Dauntless at Midway, and scuttled the next morning.
//
// Her hull, her island, her funnel and her galleries are the model -- "CV IJN
// Akagi (War Thunder)" by KojfDiscord (https://skfb.ly/pGusB), under Creative
// Commons Attribution 4.0 -- cut by build/prepare-akagi-hull.mjs (see
// build/kriss-hull.mjs) and painted as the Shokaku is; her casemate guns are
// the model's own, their barrels turned round, and her high-angle twins and
// her 25 mm the Suzuya's, where the model stands her own (see
// build/borrow-guns.mjs). Put together by carrier.js with her planked
// runway, the Shokaku's, laid along the model's own profile of her flight
// deck, her three lifts cut through it where the model draws them, her
// hangar and her air group, and her deck evolution.
import * as D from './akagiHull.data.js';
import { carrier } from './carrier.js';
import { SHOKAKU_PAINT } from './shokakuPaint.js';

const SHIP = carrier({
  id: 'akagi', data: D,
  // The Shokaku's paint, and her runway the planking hers is laid in.
  paints: SHOKAKU_PAINT,
  lifts: [
    // No.1, forward: the widest, nearly sixteen metres across.
    { z: 47.7, hw: 7.9, hd: 5.9, ch: 0.6 },
    // No.2, abreast the fore end of her island.
    { z: -9.7, hw: 6.5, hd: 5.3, ch: 0.5 },
    // And No.3, aft, on the slope of her flight deck: the one that works her
    // launches and her recoveries.
    { z: -74.6, hw: 4.8, hd: 6.6, ch: 0.5 },
  ],
  // Her upper hangar, under her flight deck.
  hangar: { y: 15.4, top: 20.2, z: [-96, 100], hw: 11.5 },
  citadel: { z: [-70, 76], deck: 4.5, top: 4.9, foot: -3.5 },
});

export const { LOA, BEAM, FD, HANGAR, FD_FWD, FD_AFT, SPOT, LIFTS, zAt, keelY, shellAt, fdY, LINES, MOUNT_SEATS, ISLAND, hangarSpots, stepDeck } = SHIP;
export const akagiSurfaceY = SHIP.surfaceY;
export const buildAkagi = () => SHIP.build();
export const akagiParts = SHIP.parts;
