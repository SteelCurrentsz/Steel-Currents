// Kirov, drawn from the owner's model of her.
//
// The first Soviet cruiser of her own design, to Italian lines: nine 180 mm
// in three triples. Her guns defended Leningrad through the siege.
//
// Her hull, her upperworks and her mountings are the model -- "Soviet Cruiser Voroshilov" by kriss50,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-kirov-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './kirovHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'kirov', data: D,
  paints: { steel: 0x737b81, steelDark: 0x4b5157, gun: 0x737b81, gunDark: 0x4b5157, deckDark: 0x7a6c54 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-62, 68], deck: 5.4, foot: -2.4, inset: 0.5, barbette: 4.0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const kirovSurfaceY = SHIP.surfaceY;
export const buildKirov = () => SHIP.build();
export const kirovParts = SHIP.parts;
