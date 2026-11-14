// HMS H-Class (the Harvester), drawn from the owner's model of her.
//
// The last of the Royal Navy's interwar standard destroyers: four single
// 4.7-inch, two quadruple banks of 21-inch tubes, two quadruple 0.5-inch
// machine guns and thirty-six knots.
//
// Her hull, bridge, funnels, masts and deckhouses, her four 4.7-inch, her two
// banks and her machine guns are the model -- "HMS Harvester 1939" by kriss50
// (https://skfb.ly/ptKqU), under Creative Commons Attribution 4.0 -- cut by
// build/prepare-hclass-hull.mjs (see build/kriss-hull.mjs) and put together
// by krissShip.js with her splinter plating and her insides.
import * as D from './hclassHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'hclass', data: D,
  paints: { steel: 0x878e93, steelDark: 0x4f555a, gun: 0x878e93, gunDark: 0x4f555a, deckDark: 0x5a6065 },
  armour: { citadel: [-20, 18], deck: 1.4, foot: -2.2, inset: 0.3 },
  // Her depth charge gear, where she has any, is the model's own.
  gear: { model: true },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const hclassSurfaceY = SHIP.surfaceY;
export const buildHClass = () => SHIP.build();
export const hclassParts = SHIP.parts;
export const hclassCharges = SHIP.charges;
