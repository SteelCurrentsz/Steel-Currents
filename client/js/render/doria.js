// RN Andrea Doria, drawn from the owner's model of her.
//
// A dreadnought of 1916 rebuilt from the keel up in 1937-40: ten 320 mm, a
// triple under a twin at each end, twelve 135 mm grouped round her tower and
// ten 90 mm.
//
// Her hull, her upperworks and her mountings are the model -- "Andrea Doria (World of Warships)" by KojfDiscord,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-doria-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './doriaHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'doria', data: D,
  paints: { steel: 0x9aa0a4, steelDark: 0x575d62, gun: 0x9aa0a4, gunDark: 0x575d62, deckDark: 0x62676b },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-64, 52], deck: 7.0, foot: -3.4, inset: 0.5, barbette: 5.4 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const doriaSurfaceY = SHIP.surfaceY;
export const buildDoria = () => SHIP.build();
export const doriaParts = SHIP.parts;
