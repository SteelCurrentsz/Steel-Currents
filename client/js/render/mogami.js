// IJN Mogami, drawn from the owner's model.
//
// The first of her class, re-armed as a heavy cruiser in 1939: ten 203 mm/50
// in five twin turrets -- Nos. 1 and 2 forward and No.3 superfiring over
// them, No.4 superfiring over No.5 aft -- and as the model arms her, four
// twin 100 mm/65 Type 98, ten twin 40 mm Type 5 and twenty-eight single
// 25 mm Type 96; and her sixteen 610 mm tubes in four quadruple banks in her torpedo
// rooms under her upper deck. Sunk in the Surigao Strait in October 1944.
//
// Her hull, her bridge, her funnel, her masts and her boats are the model --
// "Japanese Light Cruiser 9-大井（Ooi）" by 全斗焕 (https://skfb.ly/owptR),
// under Creative Commons Attribution 4.0 -- cut by build/prepare-mogami-
// hull.mjs and put together by texturedShip.js with her armour and her
// insides; every gun of hers is the model's own.
import * as D from './mogamiHull.data.js';
import { texturedShip } from './texturedShip.js';

const SHIP = texturedShip({
  id: 'mogami', name: 'Mogami',
  data: {
    HULL_B64: D.MOGAMI_HULL_B64, SURFACE: D.MOGAMI_SURFACE, GUNS: D.MOGAMI_GUNS,
    MOUNTS: D.MOGAMI_MOUNTS, LINES: D.MOGAMI_LINES, SCREWS: D.SCREWS,
  },
  sec: 'sec',
  // A hundred millimetres of belt from No.1's barbette to No.5's, from her
  // armour deck down two metres under her waterline, and the barbettes of her
  // five turrets down to it.
  armour: { citadel: [-64, 69], deck: 2.2, foot: -2.0, barbette: 2.8 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const mogamiSurfaceY = SHIP.surfaceY;
export const buildMogami = () => SHIP.build();
export const mogamiParts = () => SHIP.parts();
export const SHIP_MOGAMI = SHIP;
