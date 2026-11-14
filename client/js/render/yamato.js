// IJN Yamato, drawn from the owner's model of her.
//
// Sixty-five thousand tonnes, two hundred and sixty-three metres and nine
// 46 cm guns: the largest battleship ever built, as she sailed on her last
// sortie in April 1945 -- her wing 15.5 cm turrets landed for six more twin
// 12.7 cm high-angle mounts, and forty-six triple 25 mm crowded round her
// superstructure and along her decks.
//
// Her hull, her tower, her funnel and her mainmast, and every gun of hers, are
// the model -- "Yamato" by vvmilleriii (https://skfb.ly/pzJ8Q), under
// Creative Commons Attribution 4.0 -- cut by build/prepare-yamato-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './yamatoHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'yamato', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x4d5155, deckDark: 0x6b5242 },
  // Her 410 mm belt from forward of No.1 to abaft No.3, her 200 mm armour
  // deck over it, and the barbettes of her three turrets.
  armour: { citadel: [-75, 66], deck: 3.2, foot: -3.6, inset: 0.8, barbette: 6.2 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const yamatoSurfaceY = SHIP.surfaceY;
export const buildYamato = () => SHIP.build();
export const yamatoParts = SHIP.parts;
export const yamatoGunPiece = SHIP.gunPiece;
