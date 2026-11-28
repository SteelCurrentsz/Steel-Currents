// IJN Tosa, drawn from the owner's model of her.
//
// The second Kaga: ten 41 cm in five twin turrets and twenty casemate 14 cm,
// launched in 1921 and sunk as a target under the Washington Treaty.
//
// Her hull, her upperworks and her mountings are the model -- "IJN Tosa Free Model (1920 Japanese Battleship)" by Mixmamo.studio,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-tosa-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './tosaHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'tosa', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x4d5155, deckDark: 0x6b5242 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-70, 58], deck: 4.4, foot: -3.0, inset: 0.5, barbette: 4.6 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const tosaSurfaceY = SHIP.surfaceY;
export const buildTosa = () => SHIP.build();
export const tosaParts = SHIP.parts;
