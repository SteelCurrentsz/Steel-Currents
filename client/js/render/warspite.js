// HMS Warspite, drawn from the owner's model of her.
//
// A Queen Elizabeth of 1915, the first fast battleship: eight 15-inch in four
// twin turrets on a twenty-four knot hull burning oil. She was hit fifteen
// times at Jutland and came home; rebuilt from the keel up in 1934-37 -- new
// machinery, a tower bridge, her turrets given thirty degrees of elevation,
// four twin 4-inch HA and her pom-poms -- she went into Narvik fjord in April
// 1940, hit the Giulio Cesare at twenty-four thousand metres off Calabria,
// sank two cruisers at Matapan, and was hit by a Fritz X off Salerno and
// still fired at Normandy. The Grand Old Lady: more battle honours than any
// ship of the Royal Navy.
//
// Her hull, her bridge, her funnel and masts, her turrets and her light guns
// are the model -- "HMS Warspite (War Thunder)" by KojfDiscord, under Creative
// Commons Attribution 4.0 -- cut by build/prepare-warspite-hull.mjs (see
// build/kriss-hull.mjs), and put together by krissShip.js with her armour and
// her insides.
import * as D from './warspiteHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'warspite', data: D,
  paints: { steel: 0x737b81, steelDark: 0x4b5157, gun: 0x737b81, gunDark: 0x4b5157, deckDark: 0x7a6c54 },
  // Her belt from abaft Y's barbette to forward of A's, her armour deck over
  // it, and her barbettes.
  armour: { citadel: [-66, 58], deck: 5.5, foot: -3.6, inset: 0.5, barbette: 5.4 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const warspiteSurfaceY = SHIP.surfaceY;
export const buildWarspite = () => SHIP.build();
export const warspiteParts = SHIP.parts;
