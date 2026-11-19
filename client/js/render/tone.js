// IJN Tone, drawn from the owner's model of her.
//
// The scouting cruiser of 1938: all four of her twin 20.3 cm turrets forward
// of her bridge, the whole of her quarterdeck an aircraft deck with two
// catapults and a crane for her floatplanes, four twin 12.7 cm abreast her
// funnel, her 25 mm in triples and twins, and twelve 61 cm tubes in four
// triple banks under her aircraft deck. Sunk at Kure in July 1945.
//
// Her hull, her bridge, her funnel and masts, her turrets and her light guns
// are the model -- "IJN Tone War Thunder" by Jimphf (https://skfb.ly/pFsv7),
// under Creative Commons Attribution 4.0 -- cut by build/prepare-tone-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './toneHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'tone', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x3f4246, deckDark: 0x6b5242 },
  // Her belt over her machinery and her magazines, from abaft her boiler
  // rooms to forward of No.1, her armour deck over it, and her barbettes.
  armour: { citadel: [-45, 72], deck: 4.0, foot: -2.6, inset: 0.4, barbette: 4.4 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const toneSurfaceY = SHIP.surfaceY;
export const buildTone = () => SHIP.build();
export const toneParts = SHIP.parts;
