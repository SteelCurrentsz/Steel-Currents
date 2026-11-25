// KMS Beowulf, drawn from the owner's model of her.
//
// A large cruiser of the Kriegsmarine's last plans: eight 30.5 cm in two
// quadruple turrets, one forward and one aft, on two hundred and thirty-eight
// metres, with tubes and a twin 12.8 cm battery.
//
// Her hull, her upperworks and her mountings are the model -- "The Third Reich Navy large cruiser BEOWULF" by 全斗焕,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-beowulf-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './beowulfHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'beowulf', data: D,
  paints: { steel: 0x8b9095, steelDark: 0x50555a, gun: 0x8b9095, gunDark: 0x50555a, deckDark: 0x9c8a6a },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-68, 66], deck: 4.0, foot: -3.6, inset: 0.5, barbette: 6.0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const beowulfSurfaceY = SHIP.surfaceY;
export const buildBeowulf = () => SHIP.build();
export const beowulfParts = SHIP.parts;
