// HMS Fiji, drawn from the owner's model of her.
//
// The name ship of the Royal Navy's Colony-class light cruisers: twelve
// 6-inch in four triple turrets on eight thousand five hundred tons, the
// Southamptons' battery on a smaller hull, completed in 1940 and sunk by the
// Luftwaffe off Crete in May 1941.
//
// Her hull, her upperworks and her mountings are the model -- "HMS Fiji (War
// Thunder) Line Of Contact" by KojfDiscord, under Creative Commons
// Attribution 4.0 -- cut by build/prepare-fiji-hull.mjs (see
// build/kriss-hull.mjs), and put together by krissShip.js with her armour and
// her insides.
import * as D from './fijiHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'fiji', data: D,
  paints: { steel: 0x7c8086, steelDark: 0x55595e, gun: 0x7c8086, gunDark: 0x4a4e53 },
  // Her belt over her machinery and her magazines, her armour deck over it.
  armour: { citadel: [-52, 50], deck: 4.2, foot: -1.5, inset: 0.4, barbette: 3.0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const fijiSurfaceY = SHIP.surfaceY;
export const buildFiji = () => SHIP.build();
export const fijiParts = SHIP.parts;
