// USS Puerto Rico, drawn from the owner's model of her.
//
// The Alaskas grown a turret: twelve 12-inch in four triple turrets on the
// large cruisers' hull of two hundred and forty-six metres, the third of a
// class of six of which two were finished.
//
// Her hull, her upperworks and her mountings are the model -- "Puerto Rico B (World of Warships)" by KojfDiscord,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-puertorico-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
// Her guns are the Alaska's, as the owner asked: the model draws her without
// any, and build/prepare-puertorico-hull.mjs sets the Alaska's own turrets,
// twin 5"/38 and quadruple Bofors in their places (see build/borrow-guns.mjs).
import * as D from './puertoricoHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'puertorico', data: D,
  paints: { steel: 0x7c8086, steelDark: 0x55595e, gun: 0x7c8086, gunDark: 0x4a4e53 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-72, 72], deck: 4.0, foot: -3.6, inset: 0.5, barbette: 4.6 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const puertoricoSurfaceY = SHIP.surfaceY;
export const buildPuertoRico = () => SHIP.build();
export const puertoricoParts = SHIP.parts;
