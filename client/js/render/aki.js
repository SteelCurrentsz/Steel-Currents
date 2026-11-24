// IJN Aki, drawn from the owner's model of her.
//
// A hybrid battleship: six 46 cm in two triple turrets forward of a pagoda
// bridge, and abaft her funnel a flight deck over her quarter where her after
// turrets would have stood, her dive bombers thrown off by catapult.
//
// Her hull, her upperworks and her mountings are the model -- "Japan Hybrid Warship Dewa(近江)" by 全斗焕,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-aki-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './akiHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'aki', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x4d5155, deckDark: 0x6b5242 },
  // Her belt from forward of her first turret to under her flight deck, her
  // armour deck over it, and her barbettes.
  armour: { citadel: [-60, 66], deck: 5.0, foot: -4.0, inset: 0.6, barbette: 6.6 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const akiSurfaceY = SHIP.surfaceY;
export const buildAki = () => SHIP.build();
export const akiParts = SHIP.parts;
