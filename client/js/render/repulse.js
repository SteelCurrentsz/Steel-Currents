// HMS Repulse, drawn from the owner's model of her.
//
// The Renown's sister, given a refit in the 1930s and never the rebuilding:
// her three twin 15-inch turrets, her old tripod and conning tower, her
// triple 4-inch on their shelter deck, and an aircraft hangar abreast her
// after funnel. Sunk with the Prince of Wales by Japanese land-based
// bombers off Kuantan on 10 December 1941.
//
// Her hull, her bridge, her funnels and masts, her turrets and her light guns
// are the model -- "HMS Repulse (War Thunder)" by KojfDiscord, under Creative
// Commons Attribution 4.0 -- cut by build/prepare-repulse-hull.mjs (see
// build/kriss-hull.mjs), and put together by krissShip.js with her armour and
// her insides.
import * as D from './repulseHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'repulse', data: D,
  paints: { steel: 0x737b81, steelDark: 0x4b5157, gun: 0x737b81, gunDark: 0x4b5157, deckDark: 0x7a6c54 },
  // Her belt from abaft Y's barbette to forward of A's, her armour deck over
  // it, and her barbettes.
  armour: { citadel: [-80, 66], deck: 6.0, foot: -3.2, inset: 0.5, barbette: 5.6 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const repulseSurfaceY = SHIP.surfaceY;
export const buildRepulse = () => SHIP.build();
export const repulseParts = SHIP.parts;
