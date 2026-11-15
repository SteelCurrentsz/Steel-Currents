// USS Louisiana, drawn from the owner's model.
//
// A fast battleship of the United States Navy, here armed as the owner asked
// and as the model draws her: her 16-inch/50 in twin turrets, her 5-inch/54
// twins, her 3-inch/50 twin dual-purpose mountings -- here her 76 mm -- and
// her 20 mm Oerlikons; thirty knots, and sixteen inches of belt.
//
// Her hull, her superstructure, her funnels, her masts and her boats are the
// model -- "US Battleship Louisiana" by 全斗焕 (https://skfb.ly/o6Ant), under
// Creative Commons Attribution 4.0 -- cut by build/prepare-louisiana-hull.mjs
// and put together by texturedShip.js with her armour and her insides; every
// gun of hers is the model's own.
import * as D from './louisianaHull.data.js';
import { texturedShip } from './texturedShip.js';

const SHIP = texturedShip({
  id: 'louisiana', name: 'Louisiana',
  data: {
    HULL_B64: D.LOUISIANA_HULL_B64, SURFACE: D.LOUISIANA_SURFACE, GUNS: D.LOUISIANA_GUNS,
    MOUNTS: D.LOUISIANA_MOUNTS, LINES: D.LOUISIANA_LINES, SCREWS: D.SCREWS,
  },
  sec: 'sec',
  // Sixteen inches of belt from her forward barbette to her after one, from
  // her armour deck down under her waterline, and the barbettes of her
  // turrets down to it.
  armour: { citadel: [-76, 80], deck: 3.2, foot: -4.0, barbette: 6.0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const louisianaSurfaceY = SHIP.surfaceY;
export const buildLouisiana = () => SHIP.build();
export const louisianaParts = () => SHIP.parts();
export const SHIP_LOUISIANA = SHIP;
