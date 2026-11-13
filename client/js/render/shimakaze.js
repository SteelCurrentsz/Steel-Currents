// IJN Shimakaze, drawn from the owner's model of her.
//
// The one ship of her class: a hundred and twenty-nine metres, forty knots on
// trials off high-pressure boilers, three 12.7 cm twins, and fifteen 61 cm
// tubes in three quintuple banks on her centreline -- the heaviest torpedo
// broadside any destroyer ever carried. She led the Second Destroyer Squadron
// at Leyte Gulf and was sunk off Ormoc Bay in November 1944.
//
// Her hull, her bridge, her funnels and masts, her twins, her banks of tubes
// and her 25 mm are the model -- "Japanese destroyer Shimakaze" by kriss50
// (https://skfb.ly/ptTAs), under Creative Commons Attribution 4.0 -- cut by
// build/prepare-shimakaze-hull.mjs (see build/kriss-hull.mjs), and put
// together by krissShip.js with her armour and her insides; her depth
// charge stowage aft is the model's own.
import * as D from './shimakazeHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'shimakaze', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x3f4246, deckDark: 0x6b5242 },
  // Splinter plating round her machinery, and nothing over her magazines.
  armour: { citadel: [-24, 24], deck: 2.6, foot: -1.0, inset: 0.3 },
  // Her depth charge stowage aft is the model's own, where her datasheet stands it.
  gear: { model: true },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const shimakazeSurfaceY = SHIP.surfaceY;
export const buildShimakaze = () => SHIP.build();
export const shimakazeParts = SHIP.parts;
export const shimakazeCharges = SHIP.charges;
