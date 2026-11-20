// IJN Agano, drawn from the owner's model of her class.
//
// The destroyer flotillas' leader of 1942: a long, light, fast hull with
// three twin 15.2 cm turrets -- two forward, one aft -- a single raked funnel,
// a catapult amidships, two quadruple banks of 61 cm tubes on her centreline
// and, by 1944, her decks crowded with 25 mm. Torpedoed by the submarine
// Skate north of Truk in February 1944.
//
// Her hull, her bridge, her funnel and masts, her turrets and her light guns
// are the model -- "Japanese Light Cruiser 5-阿贺野（Agano）" by 全斗焕
// (https://skfb.ly/owptN), under Creative Commons Attribution 4.0 -- cut by
// build/prepare-agano-hull.mjs (see build/kriss-hull.mjs), and put together
// by krissShip.js with her armour and her insides.
import * as D from './aganoHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'agano', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x3f4246, deckDark: 0x6b5242 },
  // Her thin belt over her machinery, from abaft No.3 to forward of No.1,
  // her armour deck over it, and her barbettes.
  armour: { citadel: [-50, 52], deck: 4.4, foot: -2.2, inset: 0.4, barbette: 3.2 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const aganoSurfaceY = SHIP.surfaceY;
export const buildAgano = () => SHIP.build();
export const aganoParts = SHIP.parts;
