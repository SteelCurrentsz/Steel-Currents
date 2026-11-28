// IJN Akizuki, drawn from the owner's model of her.
//
// The anti-aircraft destroyer: eight 10 cm/65 Type 98 in four twin turrets,
// the best high-angle gun Japan built, a single quadruple bank of Long
// Lances, and a hundred and thirty-four metres -- the largest destroyers of
// the Imperial Navy, built to screen its carriers.
//
// Her hull, her upperworks and her mountings are the model -- "IJN Akizuki
// (War Thunder)" by KojfDiscord, under Creative Commons Attribution 4.0 -- cut
// by build/prepare-akizuki-hull.mjs (see build/kriss-hull.mjs), and put
// together by krissShip.js with her armour and her insides.
import * as D from './akizukiHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'akizuki', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x4d5155, deckDark: 0x6b5242 },
  // A destroyer's: no belt, a splinter deck over her machinery.
  armour: { citadel: [-26, 24], deck: 3.0, foot: -1.0, inset: 0.3 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const akizukiSurfaceY = SHIP.surfaceY;
export const buildAkizuki = () => SHIP.build();
export const akizukiParts = SHIP.parts;
