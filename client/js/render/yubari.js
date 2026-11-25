// IJN Yubari, drawn from the owner's model of her.
//
// Hiraga's experiment of 1923: six 14 cm and four tubes on three thousand
// tons.
//
// Her hull, her upperworks and her mountings are the model -- "IJN Yubari" by 42manako,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-yubari-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './yubariHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'yubari', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x3f4246, deckDark: 0x6b5242 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-44, 40], deck: 3.6, foot: -1.6, inset: 0.5, barbette: 2.4 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const yubariSurfaceY = SHIP.surfaceY;
export const buildYubari = () => SHIP.build();
export const yubariParts = SHIP.parts;
