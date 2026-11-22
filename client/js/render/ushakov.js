// Admiral Ushakov, drawn from the owner's model of her.
//
// The lead ship of Project 1144, commissioned as Kirov in 1980: twenty
// Granits, ninety-six S-300F, two AK-100 and eight AK-630s on a nuclear
// hull.
//
// Her hull, her upperworks and her mountings are the model -- "Kirov-class cruiser" by SB-129,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-ushakov-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './ushakovHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'ushakov', data: D,
  paints: { steel: 0x737b81, steelDark: 0x4b5157, gun: 0x737b81, gunDark: 0x4b5157, deckDark: 0x7a6c54 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-90, 90], deck: 9.0, foot: -4.0, inset: 0.5, barbette: 2.4 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const ushakovSurfaceY = SHIP.surfaceY;
export const buildUshakov = () => SHIP.build();
export const ushakovParts = SHIP.parts;
