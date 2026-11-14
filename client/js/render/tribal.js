// HMS Tribal, drawn from the owner's model of a Tribal-class destroyer of 1936.
//
// Built to out-gun the big foreign destroyers: eight 4.7-inch in four twin
// gunhouses, A and B forward, X and Y aft, a single bank of tubes amidships,
// and thirty-six knots.
//
// Her hull, bridge, funnels, masts and deckhouses, her four twins, her bank of
// tubes and her Oerlikons are the model -- "Tribal-class Destroyer (1936)" by
// kriss50 (https://skfb.ly/ptwqF), under Creative Commons Attribution 4.0 --
// cut by build/prepare-tribal-hull.mjs (see build/kriss-hull.mjs) and put
// together by krissShip.js with her splinter plating and her insides.
import * as D from './tribalHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'tribal', data: D,
  paints: { steel: 0x878e93, steelDark: 0x4f555a, gun: 0x878e93, gunDark: 0x4f555a, deckDark: 0x5a6065 },
  armour: { citadel: [-24, 20], deck: 1.4, foot: -2.4, inset: 0.3 },
  // Her depth charge gear, where she has any, is the model's own.
  gear: { model: true },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const tribalSurfaceY = SHIP.surfaceY;
export const buildTribal = () => SHIP.build();
export const tribalParts = SHIP.parts;
export const tribalCharges = SHIP.charges;
