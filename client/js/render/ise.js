// IJN Ise, drawn from the owner's model of her sister Hyuga.
//
// The second pair of Japan's Great War dreadnoughts as rebuilt in 1937: two
// hundred and sixteen metres, twelve 35.6 cm/45 in six twin turrets -- two
// forward, two back to back amidships and two aft -- a pagoda of a bridge, a
// single funnel and twenty-five knots.
//
// Her hull, her pagoda, her funnel and her mainmast, her turrets and her
// guns are the model -- "Japanese Battleship Hyuga" by kriss50
// (https://skfb.ly/ptuAM), under Creative Commons Attribution 4.0; the two
// sisters were alike to the rivet in 1941 -- cut by
// build/prepare-ise-hull.mjs (see build/kriss-hull.mjs), and put together by
// krissShip.js with her armour and her insides.
import * as D from './iseHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'ise', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x4d5155, deckDark: 0x6b5242 },
  // Her belt from forward of No.1 to abaft No.6, her armour deck over it, and
  // the barbettes of her six turrets.
  armour: { citadel: [-70, 65], deck: 4.4, foot: -3.0, inset: 0.6, barbette: 4.4 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const iseSurfaceY = SHIP.surfaceY;
export const buildIse = () => SHIP.build();
export const iseParts = SHIP.parts;
