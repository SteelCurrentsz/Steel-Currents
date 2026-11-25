// KMS Hildebrand, drawn from the owner's model of her.
//
// A large cruiser of the Kriegsmarine's last plans: eight 38 cm in four twin
// turrets, a battleship's guns on a cruiser's hull of two hundred and fifty
// metres, with tubes and a twin 12.8 cm battery.
//
// Her hull, her upperworks and her mountings are the model -- "The Third Reich Navy large cruiser HILDEBRAND" by 全斗焕,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-hildebrand-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './hildebrandHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'hildebrand', data: D,
  paints: { steel: 0x8b9095, steelDark: 0x50555a, gun: 0x8b9095, gunDark: 0x50555a, deckDark: 0x9c8a6a },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-70, 64], deck: 4.2, foot: -3.8, inset: 0.5, barbette: 5.0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const hildebrandSurfaceY = SHIP.surfaceY;
export const buildHildebrand = () => SHIP.build();
export const hildebrandParts = SHIP.parts;
