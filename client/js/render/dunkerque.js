// FS Dunkerque, drawn from the owner's model of her.
//
// The fast battleship of 1935: two hundred and fifteen metres, eight 330 mm
// in two quadruple turrets both forward, sixteen 130 mm dual-purpose in three
// quadruple turrets aft and two twins amidships, and thirty knots.
//
// Her hull, her tower, her funnel and her hangar, her turrets and her light
// guns are the model -- "French Battleship Dunkerque" by kriss50
// (https://skfb.ly/ptKrU), under Creative Commons Attribution 4.0 -- cut by
// build/prepare-dunkerque-hull.mjs (see build/kriss-hull.mjs), and put
// together by krissShip.js with her armour and her insides.
import * as D from './dunkerqueHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'dunkerque', data: D,
  paints: { steel: 0x8e979e, steelDark: 0x5b6268, gun: 0x8e979e, gunDark: 0x4f555b, deckDark: 0x9a8566 },
  // Her inclined belt over her machinery and her magazines, from abaft her
  // after 130 mm to forward of No.1, her armour deck over it, and the
  // barbettes of her two turrets.
  armour: { citadel: [-62, 64], deck: 5.6, foot: -3.6, inset: 0.6, barbette: 6.0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const dunkerqueSurfaceY = SHIP.surfaceY;
export const buildDunkerque = () => SHIP.build();
export const dunkerqueParts = SHIP.parts;
