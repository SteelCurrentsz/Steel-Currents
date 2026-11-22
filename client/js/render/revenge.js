// HMS Revenge, drawn from the owner's model of her.
//
// The last of the Grand Fleet's battleships, completed in 1916: eight 15-inch in
// four twin turrets and twelve 6-inch in casemates. At Jutland a month after
// she commissioned.
//
// Her hull, her upperworks and her mountings are the model -- "HMS Revenge 1915" by martyn169,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-revenge-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './revengeHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'revenge', data: D,
  paints: { steel: 0x737b81, steelDark: 0x4b5157, gun: 0x737b81, gunDark: 0x4b5157, deckDark: 0x7a6c54 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-66, 60], deck: 6.0, foot: -3.6, inset: 0.5, barbette: 5.2 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const revengeSurfaceY = SHIP.surfaceY;
export const buildRevenge = () => SHIP.build();
export const revengeParts = SHIP.parts;
