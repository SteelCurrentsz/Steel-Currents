// Condé, drawn from the owner's model of her.
//
// The great cruiser France drew to follow the Algérie: nine 240 mm in
// three triples, sixteen 130 mm and sixteen 100 mm.
//
// Her hull, her upperworks and her mountings are the model -- "Conde" by SB-129,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-conde-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './condeHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'conde', data: D,
  paints: { steel: 0x8e979e, steelDark: 0x5b6268, gun: 0x8e979e, gunDark: 0x5b6268, deckDark: 0x9a8566 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-76, 72], deck: 5.0, foot: -2.8, inset: 0.5, barbette: 4.8 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const condeSurfaceY = SHIP.surfaceY;
export const buildConde = () => SHIP.build();
export const condeParts = SHIP.parts;
