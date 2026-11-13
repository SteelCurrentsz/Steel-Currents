// USS Maryland (BB-46), drawn from the owner's model of her.
//
// The first American battleship with sixteen-inch guns, as she fought in
// 1944: a hundred and ninety metres, eight 16-inch/45 in four twin turrets,
// eight 5-inch/51 and eight 5-inch/25, cage foremast and two funnels.
//
// Her hull, her bridge, her funnels and her masts, her turrets and every gun of
// hers are the model -- "USS Maryland" by kriss50 (https://skfb.ly/ptOoS),
// under Creative Commons Attribution 4.0 -- cut by
// build/prepare-maryland-hull.mjs (see build/kriss-hull.mjs), and put
// together by krissShip.js with her armour and her insides.
import * as D from './marylandHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'maryland', data: D,
  paints: { steel: 0x6c7682, steelDark: 0x464d57, gun: 0x6c7682, gunDark: 0x3d434b, deckDark: 0x3e4856 },
  // Her belt from forward of No.1 to abaft No.4, her armour deck over it, and
  // the barbettes of her four turrets.
  armour: { citadel: [-62, 52], deck: 4.8, foot: -2.8, inset: 0.6, barbette: 4.8 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const marylandSurfaceY = SHIP.surfaceY;
export const buildMaryland = () => SHIP.build();
export const marylandParts = SHIP.parts;
