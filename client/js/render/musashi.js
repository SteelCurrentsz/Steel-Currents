// IJN Musashi, drawn from the owner's model of her.
//
// Yamato's sister, the second of the class, as she joined the fleet in 1942:
// nine 46 cm in three triples, all four of her triple 15.5 cm -- the wing
// pair abreast her funnel included -- six twin 12.7 cm in their shields and
// twelve triple 25 mm. She was sunk by aircraft alone in the Sibuyan Sea on
// 24 October 1944, after nineteen torpedoes and seventeen bombs.
//
// Her hull, her tower, her funnel and her mainmast, and every gun of hers, are
// the model -- "IJN Musashi (War Thunder) Spearhead" by KojfDiscord
// (https://skfb.ly/pCEY8), under Creative Commons Attribution 4.0 -- cut by
// build/prepare-musashi-hull.mjs (see build/kriss-hull.mjs), the boats the
// model slings outboard of her and anything it left adrift taken off, and put
// together by krissShip.js with her armour and her insides.
import * as D from './musashiHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'musashi', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x4d5155, deckDark: 0x6b5242 },
  armour: { citadel: [-73, 64], deck: 3.2, foot: -3.6, inset: 0.8, barbette: 6.2 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const musashiSurfaceY = SHIP.surfaceY;
export const buildMusashi = () => SHIP.build();
export const musashiParts = SHIP.parts;
export const musashiGunPiece = SHIP.gunPiece;
