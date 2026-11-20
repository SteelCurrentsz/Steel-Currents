// HMS Renown, drawn from the owner's model of her.
//
// Fisher's battlecruiser of 1916, rebuilt from the waterline up in 1936-39:
// her three twin 15-inch turrets kept, A and B forward and Y aft, and
// everything above her forecastle new -- a tower bridge like the Queen
// Elizabeth's, ten twin 4.5-inch in BD gunhouses, eight-barrelled pom-poms,
// new machinery for thirty knots. She fought the Scharnhorst and the
// Gneisenau off Norway in April 1940, and ran with Force H out of Gibraltar.
//
// Her hull, her bridge, her funnels and masts, her turrets and her light guns
// are the model -- "HMS Renown (War Thunder)" by KojfDiscord, under Creative
// Commons Attribution 4.0 -- cut by build/prepare-renown-hull.mjs (see
// build/kriss-hull.mjs), and put together by krissShip.js with her armour and
// her insides.
import * as D from './renownHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'renown', data: D,
  paints: { steel: 0x737b81, steelDark: 0x4b5157, gun: 0x737b81, gunDark: 0x4b5157, deckDark: 0x7a6c54 },
  // Her belt from abaft Y's barbette to forward of A's, her armour deck over
  // it, and her barbettes.
  armour: { citadel: [-80, 66], deck: 6.0, foot: -3.2, inset: 0.5, barbette: 5.6 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const renownSurfaceY = SHIP.surfaceY;
export const buildRenown = () => SHIP.build();
export const renownParts = SHIP.parts;
