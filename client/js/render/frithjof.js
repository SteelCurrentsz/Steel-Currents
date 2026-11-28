// KMS Frithjof, drawn from the owner's model of her.
//
// A large cruiser of the Kriegsmarine's last plans: nine 28.3 cm in three
// triple turrets, the Scharnhorst's guns, with her 15 cm in seven twins.
//
// Her hull, her upperworks and her mountings are the model -- "The Third Reich Navy large cruiser FRITHJOF" by 全斗焕,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-frithjof-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './frithjofHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'frithjof', data: D,
  paints: { steel: 0x8b9095, steelDark: 0x50555a, gun: 0x8b9095, gunDark: 0x50555a, deckDark: 0x9c8a6a },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-75, 70], deck: 4.2, foot: -3.8, inset: 0.5, barbette: 6.0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const frithjofSurfaceY = SHIP.surfaceY;
export const buildFrithjof = () => SHIP.build();
export const frithjofParts = SHIP.parts;
