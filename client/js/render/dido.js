// HMS Dido, drawn from the owner's model of her.
//
// The name ship of the Royal Navy's anti-aircraft cruisers: ten 5.25-inch in
// five twin turrets, three forward and two aft, on a hundred and fifty-six
// metres and thirty-two knots.
//
// Her hull, her upperworks and her mountings are the model -- "British Navy CLAA Tier 6 SIRIUS" by 全斗焕 (her sister Sirius),
// under Creative Commons Attribution 4.0 -- cut by build/prepare-dido-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './didoHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'dido', data: D,
  paints: { steel: 0x8a9196, steelDark: 0x52595e, gun: 0x8a9196, gunDark: 0x52595e },
  // Her belt over her machinery and her magazines, and her deck over it.
  armour: { citadel: [-44, 32], deck: 2.6, foot: -2.4, inset: 0.4, barbette: 2.4 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const didoSurfaceY = SHIP.surfaceY;
export const buildDido = () => SHIP.build();
export const didoParts = SHIP.parts;
