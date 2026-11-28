// RF Stalingrad, drawn from the owner's model of her.
//
// Project 82: nine 305 mm in three triple turrets on a cruiser's hull of two
// hundred and seventy metres, laid down in 1951 and never finished.
//
// Her hull, her upperworks and her mountings are the model -- "Project 82 "Stalingrad" battlecruiser model" by Lanko Mykhailo,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-stalingrad-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './stalingradHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'stalingrad', data: D,
  paints: { steel: 0x737b81, steelDark: 0x4b5157, gun: 0x737b81, gunDark: 0x4b5157, deckDark: 0x565c61 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-82, 72], deck: 4.4, foot: -3.6, inset: 0.5, barbette: 5.5 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const stalingradSurfaceY = SHIP.surfaceY;
export const buildStalingrad = () => SHIP.build();
export const stalingradParts = SHIP.parts;
