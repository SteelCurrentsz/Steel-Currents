// USS Maine, drawn from the owner's model of her.
//
// A Montana as the owner arms her: sixteen 16-inch in four quadruple
// turrets, twin 5-inch/54 and twin 3-inch/50 dual-purpose mounts and
// Oerlikons.
//
// Her hull, her upperworks and her mountings are the model -- "Maine" by vvmilleriii,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-maine-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './maineHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'maine', data: D,
  paints: { steel: 0x7c858e, steelDark: 0x4d545c, gun: 0x7c858e, gunDark: 0x4d545c, deckDark: 0x3e4856 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-86, 80], deck: 7.6, foot: -4.6, inset: 0.5, barbette: 7.2 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const maineSurfaceY = SHIP.surfaceY;
export const buildMaine = () => SHIP.build();
export const maineParts = SHIP.parts;
