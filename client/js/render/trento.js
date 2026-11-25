// RN Trento, drawn from the owner's model of her.
//
// Italy's first treaty cruiser: eight 203 mm in four twins on a fast,
// lightly protected hull.
//
// Her hull, her upperworks and her mountings are the model -- "RN Trento (War Thunder)" by KojfDiscord,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-trento-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './trentoHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'trento', data: D,
  paints: { steel: 0x9aa0a4, steelDark: 0x575d62, gun: 0x9aa0a4, gunDark: 0x575d62, deckDark: 0x62676b },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-62, 60], deck: 6.0, foot: -2.6, inset: 0.5, barbette: 3.6 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const trentoSurfaceY = SHIP.surfaceY;
export const buildTrento = () => SHIP.build();
export const trentoParts = SHIP.parts;
