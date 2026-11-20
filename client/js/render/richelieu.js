// FS Richelieu, drawn from the owner's model of her.
//
// The French answer to the Littorios: two quadruple 380 mm turrets, both
// forward, on a thirty-two knot hull, three triple 152 mm aft, and her
// funnel and mainmast in one -- the mack -- raked aft over her after
// superstructure. Escaped unfinished from Brest in June 1940, shot at by the
// British at Dakar, and refitted in New York in 1943 with American radar and
// American light guns: fifty-six Bofors in quadruple mounts and fifty
// Oerlikons.
//
// Her hull, her tower, her mack, her after superstructure and her boats, and
// every gun of hers, are the model -- "Richelieu" by SB-129
// (https://skfb.ly/oEK7F), under Creative Commons Attribution 4.0 -- cut by
// build/prepare-richelieu-hull.mjs (see build/kriss-hull.mjs), and put
// together by krissShip.js with her armour and her insides.
import * as D from './richelieuHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'richelieu', data: D,
  paints: { steel: 0x7d8288, steelDark: 0x4f545a, gun: 0x7d8288, gunDark: 0x4f545a, deckDark: 0x6e6252 },
  // Her belt from abaft her after 152 mm to forward of I, her armour deck
  // over it, and her barbettes.
  armour: { citadel: [-78, 62], deck: 5.6, foot: -3.8, inset: 0.6, barbette: 6.4 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const richelieuSurfaceY = SHIP.surfaceY;
export const buildRichelieu = () => SHIP.build();
export const richelieuParts = SHIP.parts;
