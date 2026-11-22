// USS Wichita, drawn from the owner's model of her.
//
// A Brooklyn's hull with three triple 8-inch turrets on it: the treaty
// cruiser that led on to the Baltimores.
//
// Her hull, her upperworks and her mountings are the model -- "USS Wichita WoWS" by Jimphf,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-wichita-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './wichitaHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'wichita', data: D,
  paints: { steel: 0x7c858e, steelDark: 0x4d545c, gun: 0x7c858e, gunDark: 0x4d545c, deckDark: 0x3e4856 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-60, 58], deck: 5.8, foot: -2.8, inset: 0.5, barbette: 4.0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const wichitaSurfaceY = SHIP.surfaceY;
export const buildWichita = () => SHIP.build();
export const wichitaParts = SHIP.parts;
