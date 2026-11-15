// KMS Z1 (Leberecht Maass), drawn from the owner's model of a Type 1934.
//
// The Kriegsmarine's first destroyer: five single 12.7 cm, two quadruple
// banks of 53.3 cm tubes, twin 3.7 cm and 2 cm flak, and thirty-six knots on
// high-pressure boilers.
//
// Her hull, bridge, funnels, masts and deckhouses, her five 12.7 cm, her two
// banks and her flak are the model -- "Type 34 Destroyer" by kriss50
// (https://skfb.ly/ptvyI), under Creative Commons Attribution 4.0 -- cut by
// build/prepare-z1-hull.mjs (see build/kriss-hull.mjs) and put together by
// krissShip.js with her splinter plating and her insides.
import * as D from './z1Hull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'z1', data: D,
  paints: { steel: 0x8b9095, steelDark: 0x50555a, gun: 0x8b9095, gunDark: 0x50555a, deckDark: 0x5b6065 },
  armour: { citadel: [-24, 22], deck: 1.6, foot: -2.6, inset: 0.3 },
  // Her depth charge gear, where she has any, is the model's own.
  gear: { model: true },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const z1SurfaceY = SHIP.surfaceY;
export const buildZ1 = () => SHIP.build();
export const z1Parts = SHIP.parts;
export const z1Charges = SHIP.charges;
