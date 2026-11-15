// IJN Yodo, drawn from the owner's model.
//
// A big light cruiser of the last Japanese design studies, here armed as the
// owner asked and as the model draws her: twelve 150 mm in four triple
// turrets -- two forward, No.2 superfiring, and two aft, No.3 superfiring
// over No.4 -- twelve 127 mm in six twin high-angle turrets, twenty twin
// 40 mm Type 5 and twenty single 25 mm Type 96; and her sixteen 610 mm tubes
// in four quadruple banks in her torpedo rooms aft.
//
// Her hull, her bridge, her funnels, her masts and her boats are the model --
// "Japanese Light Cruiser X-九头龙（Kuzuryu）" by 全斗焕 (https://skfb.ly/owptS),
// under Creative Commons Attribution 4.0 -- cut by build/prepare-yodo-hull.mjs
// and put together by texturedShip.js with her armour and her insides; every
// gun of hers is the model's own.
import * as D from './yodoHull.data.js';
import { texturedShip } from './texturedShip.js';

const SHIP = texturedShip({
  id: 'yodo', name: 'Yodo',
  data: {
    HULL_B64: D.YODO_HULL_B64, SURFACE: D.YODO_SURFACE, GUNS: D.YODO_GUNS,
    MOUNTS: D.YODO_MOUNTS, LINES: D.YODO_LINES, SCREWS: D.SCREWS,
  },
  sec: 'sec',
  // A hundred and twenty-seven millimetres of belt from No.1's barbette to
  // No.4's, from her armour deck down two metres and more under her
  // waterline, and the barbettes of her four turrets down to it.
  armour: { citadel: [-56, 64], deck: 2.3, foot: -2.2, barbette: 3.2 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const yodoSurfaceY = SHIP.surfaceY;
export const buildYodo = () => SHIP.build();
export const yodoParts = () => SHIP.parts();
export const SHIP_YODO = SHIP;
