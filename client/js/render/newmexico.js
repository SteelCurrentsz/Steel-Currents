// USS New Mexico (BB-40), drawn from the owner's model of her.
//
// The first turbo-electric battleship, as rebuilt in 1933: a hundred and
// ninety metres, twelve 14-inch/50 in four triple turrets, twelve 5-inch/51
// and eight 5-inch/25, a tower bridge and a single funnel.
//
// Her hull, her bridge, her funnel and her masts, her turrets and every gun of
// hers are the model -- "USS New Mexico" by kriss50 (https://skfb.ly/ptOVP),
// under Creative Commons Attribution 4.0 -- cut by
// build/prepare-newmexico-hull.mjs (see build/kriss-hull.mjs), and put
// together by krissShip.js with her armour and her insides.
import * as D from './newmexicoHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'newmexico', data: D,
  paints: { steel: 0x6c7682, steelDark: 0x464d57, gun: 0x6c7682, gunDark: 0x3d434b, deckDark: 0x3e4856 },
  // Her belt from forward of No.1 to abaft No.4, her armour deck over it, and
  // the barbettes of her four turrets.
  armour: { citadel: [-62, 52], deck: 4.8, foot: -2.8, inset: 0.6, barbette: 4.8 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const newmexicoSurfaceY = SHIP.surfaceY;
export const buildNewMexico = () => SHIP.build();
export const newmexicoParts = SHIP.parts;
