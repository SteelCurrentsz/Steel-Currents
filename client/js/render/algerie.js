// Algérie, drawn from the owner's model of her.
//
// The best-protected treaty cruiser of any navy: eight 203 mm in four twins
// behind a 110 mm belt.
//
// Her hull, her upperworks and her mountings are the model -- "Algerie (War Thunder) Sky Odyssey" by KojfDiscord,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-algerie-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './algerieHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'algerie', data: D,
  paints: { steel: 0x8e979e, steelDark: 0x5b6268, gun: 0x8e979e, gunDark: 0x5b6268, deckDark: 0x9a8566 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-50, 58], deck: 5.8, foot: -2.6, inset: 0.5, barbette: 3.6 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const algerieSurfaceY = SHIP.surfaceY;
export const buildAlgerie = () => SHIP.build();
export const algerieParts = SHIP.parts;
