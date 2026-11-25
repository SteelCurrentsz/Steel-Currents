// USS Atlanta, drawn from the owner's model of her.
//
// The anti-aircraft cruiser: sixteen 5-inch/38 in eight twin mounts and two
// quadruple banks of tubes on a destroyer leader's hull.
//
// Her hull, her upperworks and her mountings are the model -- "USS Atlanta (War Thunder)" by KojfDiscord,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-atlanta-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './atlantaHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'atlanta', data: D,
  paints: { steel: 0x7c858e, steelDark: 0x4d545c, gun: 0x7c858e, gunDark: 0x4d545c, deckDark: 0x3e4856 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-55, 57], deck: 5.0, foot: -2.4, inset: 0.5, barbette: 2.6 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const atlantaSurfaceY = SHIP.surfaceY;
export const buildAtlanta = () => SHIP.build();
export const atlantaParts = SHIP.parts;
