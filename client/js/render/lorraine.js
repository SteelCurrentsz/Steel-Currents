// Lorraine, drawn from the owner's model of her.
//
// The third Bretagne, as the owner's model draws her rebuilt: nine 340 mm
// in three triples and her twelve 138.6 mm in casemates.
//
// Her hull, her upperworks and her mountings are the model -- "French battleship Lorraine" by 全斗焕,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-lorraine-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './lorraineHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'lorraine', data: D,
  paints: { steel: 0x8e979e, steelDark: 0x5b6268, gun: 0x8e979e, gunDark: 0x5b6268, deckDark: 0x9a8566 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-56, 50], deck: 2.6, foot: -3.4, inset: 0.5, barbette: 4.6 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const lorraineSurfaceY = SHIP.surfaceY;
export const buildLorraine = () => SHIP.build();
export const lorraineParts = SHIP.parts;
