// IJN B-65, drawn from the owner's model of her.
//
// The super cruiser the Imperial Navy designed in 1941 and never laid
// down: nine 31 cm in three triples and twelve 10 cm/65.
//
// Her hull, her upperworks and her mountings are the model -- "IJN Super heavy Cruiser KUMOTORI（くもとり/雲取）" by 全斗焕,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-b65-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './b65Hull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'b65', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x4d5155, deckDark: 0x7e705c },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-62, 72], deck: 4.4, foot: -3.4, inset: 0.5, barbette: 5.0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const b65SurfaceY = SHIP.surfaceY;
export const buildB65 = () => SHIP.build();
export const b65Parts = SHIP.parts;
