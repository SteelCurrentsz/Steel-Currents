// IJN Yūgumo, drawn from the owner's model of her.
//
// The last class of Japanese fleet destroyers: three 12.7 cm twins in
// high-angle D-type gunhouses, eight 61 cm tubes in two quadruple banks with
// a reload for each, and thirty-five knots. Sunk off Vella Lavella in
// October 1943.
//
// Her hull, her bridge, her funnels and masts, her twins, her banks of tubes
// and her 25 mm are the model -- "Japanese Destroyer Yūgumo" by kriss50
// (https://skfb.ly/ptTA7), under Creative Commons Attribution 4.0 -- cut by
// build/prepare-yugumo-hull.mjs (see build/kriss-hull.mjs), and put together
// by krissShip.js with her depth charge gear, her armour and her insides.
import * as D from './yugumoHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'yugumo', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x3f4246, deckDark: 0x6b5242 },
  // Splinter plating round her machinery.
  armour: { citadel: [-22, 22], deck: 2.5, foot: -1.0, inset: 0.3 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const yugumoSurfaceY = SHIP.surfaceY;
export const buildYugumo = () => SHIP.build();
export const yugumoParts = SHIP.parts;
export const yugumoCharges = SHIP.charges;
