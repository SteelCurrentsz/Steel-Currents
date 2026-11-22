// IJN Furutaka, drawn from the owner's model of her.
//
// Hiraga's first heavy cruiser, rebuilt in 1937-39 with three twin 20.3 cm
// turrets and two quadruple banks of Long Lances.
//
// Her hull, her upperworks and her mountings are the model -- "IJN Furutaka (War Thunder)" by KojfDiscord,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-furutaka-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './furutakaHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'furutaka', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x3f4246, deckDark: 0x6b5242 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-56, 64], deck: 4.0, foot: -2.4, inset: 0.5, barbette: 4.2 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const furutakaSurfaceY = SHIP.surfaceY;
export const buildFurutaka = () => SHIP.build();
export const furutakaParts = SHIP.parts;
