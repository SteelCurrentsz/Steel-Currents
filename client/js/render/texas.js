// USS Texas (BB-35), drawn from the owner's model of her.
//
// The last of the dreadnoughts as she fought in 1944 and 1945: a hundred and
// seventy-five metres, ten 14-inch/45 in five twin turrets, six 5-inch/51 in
// casemates, ten 3-inch/50, ten quadruple Bofors and forty-four Oerlikons,
// tripod masts and a single funnel, and twenty-one knots.
//
// Her hull, her masts, her funnel and her deckhouses, her turrets and every
// gun of hers are the model -- "USS Texas" by kriss50 (https://skfb.ly/ptOpy),
// under Creative Commons Attribution 4.0 -- cut by
// build/prepare-texas-hull.mjs (see build/kriss-hull.mjs), and put together by
// krissShip.js with her armour and her insides.
import * as D from './texasHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'texas', data: D,
  paints: { steel: 0x6c7682, steelDark: 0x464d57, gun: 0x6c7682, gunDark: 0x3d434b, deckDark: 0x3e4856 },
  // Her belt from forward of No.1 to abaft No.5, her armour deck over it, and
  // the barbettes of her five turrets.
  armour: { citadel: [-63, 55], deck: 4.6, foot: -2.6, inset: 0.6, barbette: 4.6 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const texasSurfaceY = SHIP.surfaceY;
export const buildTexas = () => SHIP.build();
export const texasParts = SHIP.parts;
