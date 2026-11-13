// USS Pennsylvania (BB-38), drawn from the owner's model of her.
//
// The flagship of the fleet as she was in 1942: a hundred and eighty-five
// metres, twelve 14-inch/45 in four triple turrets, ten 5-inch/51 in
// casemates and eight 5-inch/25, tripod masts and a single funnel.
//
// Her hull, her bridge, her funnel and her masts, her turrets and every gun of
// hers are the model -- "USS Pennsylvania" by kriss50 (https://skfb.ly/ptOoD),
// under Creative Commons Attribution 4.0 -- cut by
// build/prepare-pennsylvania-hull.mjs (see build/kriss-hull.mjs), and put
// together by krissShip.js with her armour and her insides.
import * as D from './pennsylvaniaHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'pennsylvania', data: D,
  paints: { steel: 0x6c7682, steelDark: 0x464d57, gun: 0x6c7682, gunDark: 0x3d434b, deckDark: 0x3e4856 },
  // Her belt from forward of No.1 to abaft No.4, her armour deck over it, and
  // the barbettes of her four turrets.
  armour: { citadel: [-58, 54], deck: 4.8, foot: -2.8, inset: 0.6, barbette: 4.8 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const pennsylvaniaSurfaceY = SHIP.surfaceY;
export const buildPennsylvania = () => SHIP.build();
export const pennsylvaniaParts = SHIP.parts;
