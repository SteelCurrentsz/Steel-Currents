// USS New Orleans, drawn from the owner's model of her.
//
// Nine 8-inch in three triples and eight 5-inch/25: the treaty cruiser that
// lost her bow at Tassafaronga and came back.
//
// Her hull, her upperworks and her mountings are the model -- "USS New Orleans (War Thunder)" by KojfDiscord,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-neworleans-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './neworleansHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'neworleans', data: D,
  paints: { steel: 0x7c858e, steelDark: 0x4d545c, gun: 0x7c858e, gunDark: 0x4d545c, deckDark: 0x3e4856 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-62, 60], deck: 5.8, foot: -2.6, inset: 0.5, barbette: 3.8 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const neworleansSurfaceY = SHIP.surfaceY;
export const buildNewOrleans = () => SHIP.build();
export const neworleansParts = SHIP.parts;
