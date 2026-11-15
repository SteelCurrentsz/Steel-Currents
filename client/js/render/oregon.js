// USS Oregon, drawn from the owner's model.
//
// A super battleship of the United States Navy, here armed as the owner
// asked and as the model draws her: fifteen 18-inch guns in five triple
// turrets -- A and B forward, B superfiring; X, Y and Z aft, Y superfiring
// over the other two -- sixteen 5-inch/54 in eight twins, four a side, 40 mm
// Bofors quadruples and 20 mm Oerlikons; twenty-seven knots, and sixteen
// inches of belt.
//
// Her hull, her superstructure, her funnels, her masts and her boats are the
// model -- "US Super Battleship Oregon" by 全斗焕 (https://skfb.ly/oHGQC),
// under Creative Commons Attribution 4.0 -- cut by build/prepare-oregon-
// hull.mjs and put together by texturedShip.js with her armour and her
// insides; every gun of hers is the model's own.
import * as D from './oregonHull.data.js';
import { texturedShip } from './texturedShip.js';

const SHIP = texturedShip({
  id: 'oregon', name: 'Oregon',
  data: {
    HULL_B64: D.OREGON_HULL_B64, SURFACE: D.OREGON_SURFACE, GUNS: D.OREGON_GUNS,
    MOUNTS: D.OREGON_MOUNTS, LINES: D.OREGON_LINES, SCREWS: D.SCREWS,
  },
  sec: 'sec',
  // Sixteen inches of belt from A's barbette to Z's, from her armour deck down
  // under her waterline, and the barbettes of her five turrets down to it.
  armour: { citadel: [-92, 87], deck: 3.4, foot: -4.5, barbette: 6.5 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const oregonSurfaceY = SHIP.surfaceY;
export const buildOregon = () => SHIP.build();
export const oregonParts = () => SHIP.parts();
export const SHIP_OREGON = SHIP;
