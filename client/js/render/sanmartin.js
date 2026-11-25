// ARA San Martín, drawn from the owner's model of her.
//
// A light cruiser for the Armada Argentina on the lines of the American
// cruisers of 1945: ten 152 mm and thirty-six Bofors.
//
// Her hull, her upperworks and her mountings are the model -- "San Martín (World of Warships)" by KojfDiscord,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-sanmartin-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './sanmartinHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'sanmartin', data: D,
  paints: { steel: 0x7c858e, steelDark: 0x4d545c, gun: 0x7c858e, gunDark: 0x4d545c, deckDark: 0x3e4856 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-62, 64], deck: 5.4, foot: -2.6, inset: 0.4, barbette: 4.4 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const sanmartinSurfaceY = SHIP.surfaceY;
export const buildSanMartin = () => SHIP.build();
export const sanmartinParts = SHIP.parts;
