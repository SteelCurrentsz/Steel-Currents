// RN Roma, drawn from the owner's model of her.
//
// The third Littorio: nine 381 mm/50, twelve 152 mm, twelve stabilised 90 mm
// and Breda 37 mm on a thirty-knot hull. Sunk by Fritz X guided bombs on her
// way to Malta on 9 September 1943.
//
// Her hull, her upperworks and her mountings are the model -- "RN Roma (War Thunder) Leviathans" by KojfDiscord,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-roma-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './romaHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'roma', data: D,
  paints: { steel: 0x9aa0a4, steelDark: 0x575d62, gun: 0x9aa0a4, gunDark: 0x575d62, deckDark: 0x62676b },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-70, 62], deck: 8.0, foot: -3.8, inset: 0.5, barbette: 6.2 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const romaSurfaceY = SHIP.surfaceY;
export const buildRoma = () => SHIP.build();
export const romaParts = SHIP.parts;
