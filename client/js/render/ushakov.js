// RF Admiral Ushakov, drawn from the owner's model of her.
//
// A Soviet battleship of the Project 24 studies, finished at last: nine
// 406 mm in three triples, sixteen 130 mm and twenty-four 100 mm.
//
// Her hull, her upperworks and her mountings are the model -- "Admiral Ushakov" by SB-129,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-ushakov-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './ushakovHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'ushakov', data: D,
  paints: { steel: 0x737b81, steelDark: 0x4b5157, gun: 0x737b81, gunDark: 0x4b5157, deckDark: 0x565c61 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-88, 72], deck: 6.4, foot: -4.2, inset: 0.5, barbette: 6.4 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const ushakovSurfaceY = SHIP.surfaceY;
export const buildUshakov = () => SHIP.build();
export const ushakovParts = SHIP.parts;
