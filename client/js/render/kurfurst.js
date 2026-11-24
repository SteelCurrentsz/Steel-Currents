// KMS Großer Kurfürst, drawn from the owner's model of her.
//
// The last and largest of the H-class studies, the H-41: twelve 42 cm in four
// triple turrets on two hundred and eighty-two metres, a battleship Germany
// drew and never laid down.
//
// Her hull, her upperworks and her mountings are the model -- "G.kurfürst" by Hhikj789,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-kurfurst-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './kurfurstHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'kurfurst', data: D,
  paints: { steel: 0x8b9095, steelDark: 0x50555a, gun: 0x8b9095, gunDark: 0x50555a, deckDark: 0x9c8a6a },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-80, 68], deck: 4.4, foot: -4.6, inset: 0.5, barbette: 6.4 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const kurfurstSurfaceY = SHIP.surfaceY;
export const buildKurfurst = () => SHIP.build();
export const kurfurstParts = SHIP.parts;
