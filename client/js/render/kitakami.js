// IJN Kitakami, drawn from the owner's model of her.
//
// A Kuma rebuilt in 1941 as a torpedo cruiser: forty 61 cm tubes in ten
// quadruple banks down her waist.
//
// Her hull, her upperworks and her mountings are the model -- "Japanese Cruiser Kitakami" by kriss50,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-kitakami-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './kitakamiHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'kitakami', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x3f4246, deckDark: 0x6b5242 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-48, 40], deck: 4.4, foot: -2.0, inset: 0.5, barbette: 2.0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const kitakamiSurfaceY = SHIP.surfaceY;
export const buildKitakami = () => SHIP.build();
export const kitakamiParts = SHIP.parts;
