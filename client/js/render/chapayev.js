// Chapayev, drawn from the owner's model of her.
//
// The Project 68 light cruiser, finished in 1950: twelve 152 mm in four
// triples and eight stabilised 100 mm.
//
// Her hull, her upperworks and her mountings are the model -- "Chapayev (War Thunder)" by KojfDiscord,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-chapayev-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './chapayevHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'chapayev', data: D,
  paints: { steel: 0x737b81, steelDark: 0x4b5157, gun: 0x737b81, gunDark: 0x4b5157, deckDark: 0x565c61 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-66, 70], deck: 5.2, foot: -2.4, inset: 0.4, barbette: 4.0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const chapayevSurfaceY = SHIP.surfaceY;
export const buildChapayev = () => SHIP.build();
export const chapayevParts = SHIP.parts;
