// HMS Vanguard, drawn from the owner's model of her.
//
// The last battleship ever launched: eight 15-inch in four twins, sixteen
// 5.25-inch and ten sextuple Bofors on a thirty-knot hull.
//
// Her hull, her upperworks and her mountings are the model -- "Vanguard (World of Warships)" by KojfDiscord,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-vanguard-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './vanguardHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'vanguard', data: D,
  paints: { steel: 0x737b81, steelDark: 0x4b5157, gun: 0x737b81, gunDark: 0x4b5157, deckDark: 0x9a8a6c },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-78, 66], deck: 6.0, foot: -4.2, inset: 0.5, barbette: 5.6 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const vanguardSurfaceY = SHIP.surfaceY;
export const buildVanguard = () => SHIP.build();
export const vanguardParts = SHIP.parts;
