// KMS Admiral Hipper, drawn from the owner's model of her.
//
// Six hundred and seventy-five feet of German heavy cruiser as she went to
// war: eight 20.3 cm in four twin turrets, twelve 10.5 cm in six stabilised
// twins, four triple banks of tubes, a flush deck from her raked Atlantic bow
// to her transom, a tower bridge with the biggest rangefinder anybody put on
// a cruiser on top of it, and the flat cap on her funnel that kept her own
// smoke out of her foretop.
//
// Her hull, her tower, her funnel and mainmast, her catapult and her boats,
// and every gun of hers, are the model -- "Admiral Hipper" by pepijn.dv
// (https://skfb.ly/oo7OI), under Creative Commons Attribution 4.0 -- cut by
// build/prepare-hipper-hull.mjs (see build/kriss-hull.mjs), and put together
// by krissShip.js with her armour and her insides.
import * as D from './hipperHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'hipper', data: D,
  paints: { steel: 0x8b9095, steelDark: 0x50555a, gun: 0x8b9095, gunDark: 0x50555a, deckDark: 0x5b6065 },
  // Her belt from abaft Dora to forward of Anton, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-64, 64], deck: 3.4, foot: -2.8, inset: 0.4, barbette: 4.0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const hipperSurfaceY = SHIP.surfaceY;
export const buildHipper = () => SHIP.build();
export const hipperParts = SHIP.parts;
