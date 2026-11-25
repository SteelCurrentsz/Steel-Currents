// USS Tennessee, drawn from the owner's model of her.
//
// Rebuilt after Pearl Harbor with bulges, a tower bridge and eight twin
// 5-inch/38: twelve 14-inch in four triples. At Surigao Strait. The model is
// her sister California's.
//
// Her hull, her upperworks and her mountings are the model -- "USS California" by HappySunpore,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-tennessee-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './tennesseeHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'tennessee', data: D,
  paints: { steel: 0x7c858e, steelDark: 0x4d545c, gun: 0x7c858e, gunDark: 0x4d545c, deckDark: 0x3e4856 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-62, 52], deck: 7.4, foot: -3.6, inset: 0.5, barbette: 5.6 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const tennesseeSurfaceY = SHIP.surfaceY;
export const buildTennessee = () => SHIP.build();
export const tennesseeParts = SHIP.parts;
