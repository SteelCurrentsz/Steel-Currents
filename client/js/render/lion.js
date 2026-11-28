// HMS Lion, drawn from the owner's model of her.
//
// The King George Vs' successor as designed in 1938: nine 16-inch in three
// triple turrets, sixteen 5.25-inch in eight twins and six eight-barrelled
// pom-poms on forty thousand tons. Two were laid down in 1939; work stopped
// in 1940 and they were broken up on the slip.
//
// Her hull, her upperworks and her mountings are the model -- "HMS Lion (War
// Thunder) Sky Odyssey" by KojfDiscord, under Creative Commons Attribution
// 4.0 -- cut by build/prepare-lion-hull.mjs (see build/kriss-hull.mjs), and
// put together by krissShip.js with her armour and her insides.
import * as D from './lionHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'lion', data: D,
  paints: { steel: 0x7c8086, steelDark: 0x55595e, gun: 0x7c8086, gunDark: 0x4a4e53, deckDark: 0x7a6c54 },
  // Her belt from abaft X's barbette to forward of A's, her armour deck over
  // it, and her barbettes.
  armour: { citadel: [-72, 60], deck: 6.0, foot: -3.8, inset: 0.5, barbette: 6.0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const lionSurfaceY = SHIP.surfaceY;
export const buildLion = () => SHIP.build();
export const lionParts = SHIP.parts;
