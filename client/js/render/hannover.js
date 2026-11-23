// KMS Hannover, drawn from the owner's model of her.
//
// The H-class battleship the Kriegsmarine never finished: eight 40.6 cm in
// four twins and sixteen twin 12.8 cm dual-purpose turrets.
//
// Her hull, her upperworks and her mountings are the model -- "Hannover (World of Warships)" by KojfDiscord,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-hannover-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './hannoverHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'hannover', data: D,
  paints: { steel: 0x8b9095, steelDark: 0x50555a, gun: 0x8b9095, gunDark: 0x50555a, deckDark: 0x9c8a6a },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-90, 92], deck: 4.6, foot: -4.2, inset: 0.5, barbette: 6.0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const hannoverSurfaceY = SHIP.surfaceY;
export const buildHannover = () => SHIP.build();
export const hannoverParts = SHIP.parts;
