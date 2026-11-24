// USS Iowa, drawn from the owner's model of her.
//
// The name ship of the fast battleships: nine 16-inch in three triple
// turrets, twenty 5"/38 in ten twins, and thirty-three knots on two hundred
// and seventy metres.
//
// Her hull, her upperworks and her mountings are the model -- "USS Missouri (World of Warships)" by KojfDiscord (her sister Missouri),
// under Creative Commons Attribution 4.0 -- cut by build/prepare-iowa-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
// iowa.js, her own hull lofted through her lines, is what she was drawn as
// before; it is kept for the tests of it, and this is what the game draws.
import * as D from './iowaHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'iowa', data: D,
  paints: { steel: 0x7c8086, steelDark: 0x55595e, gun: 0x7c8086, gunDark: 0x4a4e53 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-80, 70], deck: 4.6, foot: -4.6, inset: 0.5, barbette: 6.0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const iowaSurfaceY = SHIP.surfaceY;
export const buildIowaModel = () => SHIP.build();
export const iowaParts = SHIP.parts;
