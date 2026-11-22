// Admiral Nakhimov, drawn from the owner's model of her class.
//
// A Project 1144 nuclear battlecruiser, as the model draws the class: twenty
// Granits, ninety-six S-300F, two AK-100 and eight AK-630s on a nuclear
// hull.
//
// Her hull, her upperworks and her mountings are the model -- "Kirov-class cruiser" by SB-129,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-nakhimov-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './nakhimovHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'nakhimov', data: D,
  paints: { steel: 0x737b81, steelDark: 0x4b5157, gun: 0x737b81, gunDark: 0x4b5157, deckDark: 0x7a6c54 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-90, 90], deck: 9.0, foot: -4.0, inset: 0.5, barbette: 2.4 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const nakhimovSurfaceY = SHIP.surfaceY;
export const buildNakhimov = () => SHIP.build();
export const nakhimovParts = SHIP.parts;
