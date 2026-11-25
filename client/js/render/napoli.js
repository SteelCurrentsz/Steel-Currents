// RN Napoli, drawn from the owner's model of her.
//
// The super cruiser the Regia Marina drew and never laid down: nine
// 254 mm in three triples, eight 135 mm and six stabilised 90 mm.
//
// Her hull, her upperworks and her mountings are the model -- "Napoli" by SB-129,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-napoli-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './napoliHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'napoli', data: D,
  paints: { steel: 0x9aa0a4, steelDark: 0x575d62, gun: 0x9aa0a4, gunDark: 0x575d62, deckDark: 0x62676b },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-70, 60], deck: 4.2, foot: -2.8, inset: 0.5, barbette: 4.6 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const napoliSurfaceY = SHIP.surfaceY;
export const buildNapoli = () => SHIP.build();
export const napoliParts = SHIP.parts;
