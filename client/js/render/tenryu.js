// IJN Tenryu, drawn from the owner's model of her.
//
// The Imperial Navy's first light cruiser: four 14 cm and two triple banks
// of tubes on her centreline. At Savo Island with Mikawa.
//
// Her hull, her upperworks and her mountings are the model -- "Japanese Cruiser Tatsuta" by kriss50,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-tenryu-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './tenryuHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'tenryu', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x3f4246, deckDark: 0x6b5242 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-40, 40], deck: 4.0, foot: -1.8, inset: 0.5, barbette: 2.0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const tenryuSurfaceY = SHIP.surfaceY;
export const buildTenryu = () => SHIP.build();
export const tenryuParts = SHIP.parts;
