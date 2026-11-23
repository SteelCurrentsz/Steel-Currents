// Sevastopol, drawn from the owner's model of her.
//
// The second Project 69 heavy cruiser, taken on the slip in 1941: nine
// 305 mm in three triples on a thirty-three knot hull.
//
// Her hull, her upperworks and her mountings are the model -- "Sevastopol (War Thunder) Leviathans" by KojfDiscord,
// under Creative Commons Attribution 4.0 -- cut by build/prepare-sevastopol-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// armour and her insides.
import * as D from './sevastopolHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'sevastopol', data: D,
  paints: { steel: 0x737b81, steelDark: 0x4b5157, gun: 0x737b81, gunDark: 0x4b5157, deckDark: 0x565c61 },
  // Her belt over her machinery and her magazines, her armour deck over it,
  // and her barbettes.
  armour: { citadel: [-74, 80], deck: 4.4, foot: -3.6, inset: 0.5, barbette: 5.0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const sevastopolSurfaceY = SHIP.surfaceY;
export const buildSevastopol = () => SHIP.build();
export const sevastopolParts = SHIP.parts;
