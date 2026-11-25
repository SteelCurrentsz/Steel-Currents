// IJN Oyodo, drawn from the owner's model of her.
//
// Six 15.5 cm forward, eight 10 cm high-angle guns and a great hangar aft:
// the Combined Fleet's last flagship.
//
// Her hull, her upperworks and her mountings are the model -- "IJN Oyodo (War Thunder) Line Of Contact" by KojfDiscord,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-oyodo-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './oyodoHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'oyodo', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x3f4246, deckDark: 0x6b5242 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-40, 64], deck: 4.6, foot: -2.4, inset: 0.5, barbette: 4.2 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const oyodoSurfaceY = SHIP.surfaceY;
export const buildOyodo = () => SHIP.build();
export const oyodoParts = SHIP.parts;
