// IJN Fubuki, drawn from the owner's model of her.
//
// The name ship of the Special Type destroyers of 1928: six 12.7 cm in three
// roofed twin gunhouses and nine 61 cm tubes in three triple banks on a
// hundred and eighteen metres. Sunk off Cape Esperance in October 1942.
//
// Her hull, her bridge, her funnels and masts, her twins and her banks of
// tubes are the model -- "Japanese Destroyer Fubuki" by kriss50
// (https://skfb.ly/ptWOV), under Creative Commons Attribution 4.0 -- cut by
// build/prepare-fubuki-hull.mjs (see build/kriss-hull.mjs), and put together
// by krissShip.js with her two Lewis guns, which the model does not draw, her
// armour and her insides; her depth charge stowage aft is the model's own.
import * as D from './fubukiHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'fubuki', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x3f4246, deckDark: 0x6b5242 },
  // Splinter plating round her machinery.
  armour: { citadel: [-22, 22], deck: 2.4, foot: -1.0, inset: 0.3 },
  // Her depth charge stowage aft is the model's own, where her datasheet stands it.
  gear: { model: true },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const fubukiSurfaceY = SHIP.surfaceY;
export const buildFubuki = () => SHIP.build();
export const fubukiParts = SHIP.parts;
export const fubukiCharges = SHIP.charges;
