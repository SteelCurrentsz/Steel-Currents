// IJN Aoba, drawn from the owner's model of her.
//
// The second of the Furutakas' improved sisters, completed in 1927 and rebuilt
// in 1938-40: three twin 20.3 cm turrets -- two forward, one aft -- four
// single 12 cm high-angle guns in sponsons abreast her two funnels, two
// quadruple banks of 61 cm tubes on her upper deck, and a catapult amidships.
// At Savo Island with Mikawa; wrecked by the Americans' gunfire off Cape
// Esperance, mended, torpedoed, and sunk on the bottom at Kure in July 1945.
//
// Her hull, her bridge, her funnels and masts, her turrets and her light guns
// are the model -- "IJN Aoba (War Thunder)" by KojfDiscord
// (https://skfb.ly/pGu8Y), under Creative Commons Attribution 4.0 -- cut by
// build/prepare-aoba-hull.mjs (see build/kriss-hull.mjs), and put together by
// krissShip.js with her armour and her insides.
import * as D from './aobaHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'aoba', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x3f4246, deckDark: 0x6b5242 },
  // Her belt over her machinery and her magazines, from abaft No.3 to
  // forward of No.1, her armour deck over it, and her barbettes.
  armour: { citadel: [-52, 60], deck: 3.6, foot: -2.4, inset: 0.4, barbette: 4.2 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const aobaSurfaceY = SHIP.surfaceY;
export const buildAoba = () => SHIP.build();
export const aobaParts = SHIP.parts;
