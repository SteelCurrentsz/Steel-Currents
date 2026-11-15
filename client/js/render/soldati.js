// RN Soldati, drawn from the owner's model of a Soldati-class destroyer.
//
// The Regia Marina's fleet destroyer of 1937-42: three twin 120 mm, two triple
// banks of 533 mm tubes, Breda 20 mm and 13.2 mm, and thirty-eight knots under
// a single funnel.
//
// Her hull, bridge, funnel, masts and deckhouses, her three twins, her two
// banks and her light guns are the model -- "Soldati Destroyer" by kriss50
// (https://skfb.ly/ptBxW), under Creative Commons Attribution 4.0 -- cut by
// build/prepare-soldati-hull.mjs (see build/kriss-hull.mjs) and put together
// by krissShip.js with her splinter plating and her insides.
import * as D from './soldatiHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'soldati', data: D,
  paints: { steel: 0x9aa0a4, steelDark: 0x575d62, gun: 0x9aa0a4, gunDark: 0x575d62, deckDark: 0x62676b },
  armour: { citadel: [-22, 18], deck: 1.5, foot: -2.2, inset: 0.3 },
  // Her depth charge gear, where she has any, is the model's own.
  gear: { model: true },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const soldatiSurfaceY = SHIP.surfaceY;
export const buildSoldati = () => SHIP.build();
export const soldatiParts = SHIP.parts;
export const soldatiCharges = SHIP.charges;
