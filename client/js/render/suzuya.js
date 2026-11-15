// IJN Suzuya, drawn from the owner's model.
//
// A Mogami-class cruiser of the 1930s, completed as a light cruiser to the
// London Treaty's limits and here armed as the owner asked and as the model
// draws her: twelve 155 mm/60 in four triple turrets -- two forward, No.2
// superfiring, and two aft, No.3 superfiring over No.4 -- eight 127 mm/40
// Type 89 in four twin high-angle mountings, and 25 mm Type 96 in twins,
// triples and singles; and her sixteen 610 mm tubes in four quadruple banks
// in her torpedo rooms under her upper deck. Sunk off Samar in October 1944.
//
// Her hull, her bridge, her funnel, her masts and her boats are the model --
// "Japanese Light Cruiser 7-铃鹿（Suzuka）" by 全斗焕 (https://skfb.ly/owptP),
// under Creative Commons Attribution 4.0 -- cut by build/prepare-suzuya-
// hull.mjs and put together by texturedShip.js with her armour and her
// insides; every gun of hers is the model's own.
import * as D from './suzuyaHull.data.js';
import { texturedShip } from './texturedShip.js';

const SHIP = texturedShip({
  id: 'suzuya', name: 'Suzuya',
  data: {
    HULL_B64: D.SUZUYA_HULL_B64, SURFACE: D.SUZUYA_SURFACE, GUNS: D.SUZUYA_GUNS,
    MOUNTS: D.SUZUYA_MOUNTS, LINES: D.SUZUYA_LINES, SCREWS: D.SCREWS,
  },
  sec: 'sec',
  // A hundred millimetres of belt from No.1's barbette to No.4's, from her
  // armour deck down two metres under her waterline, and the barbettes of her
  // four turrets down to it.
  armour: { citadel: [-61, 62], deck: 2.2, foot: -2.0, barbette: 3.2 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const suzuyaSurfaceY = SHIP.surfaceY;
export const buildSuzuya = () => SHIP.build();
export const suzuyaParts = () => SHIP.parts();
export const SHIP_SUZUYA = SHIP;
