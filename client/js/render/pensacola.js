// USS Pensacola, drawn from the owner's model of her.
//
// The first American treaty cruiser: ten 8-inch, a twin under a triple at
// each end, and eight 5-inch/25.
//
// Her hull, her upperworks and her mountings are the model -- "USS Pensacola (War Thunder)" by KojfDiscord,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-pensacola-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './pensacolaHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'pensacola', data: D,
  paints: { steel: 0x7c858e, steelDark: 0x4d545c, gun: 0x7c858e, gunDark: 0x4d545c, deckDark: 0x3e4856 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-66, 62], deck: 5.8, foot: -2.4, inset: 0.5, barbette: 3.8 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const pensacolaSurfaceY = SHIP.surfaceY;
export const buildPensacola = () => SHIP.build();
export const pensacolaParts = SHIP.parts;
