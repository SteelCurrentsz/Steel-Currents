// Arkhangelsk, drawn from the owner's model of her.
//
// HMS Royal Sovereign of 1916, an R-class battleship of the Grand Fleet, lent
// to the Soviet Union in May 1944 as Arkhangelsk and handed back in 1949:
// eight 15-inch in four twin turrets, eight 6-inch in casemates and the
// Royal Navy's twin 4-inch HA and pom-poms, escorting the Arctic convoys'
// last legs from the Kola Inlet.
//
// Her hull, her bridge, her funnel and masts, her turrets and her light guns
// are the model -- "Arkhangelsk (War Thunder)" by KojfDiscord, under Creative
// Commons Attribution 4.0 -- cut by build/prepare-arkhangelsk-hull.mjs (see
// build/kriss-hull.mjs), and put together by krissShip.js with her armour and
// her insides.
import * as D from './arkhangelskHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'arkhangelsk', data: D,
  paints: { steel: 0x737b81, steelDark: 0x4b5157, gun: 0x737b81, gunDark: 0x4b5157, deckDark: 0x7a6c54 },
  // Her belt from abaft Y's barbette to forward of A's, her armour deck over
  // it, and her barbettes.
  armour: { citadel: [-58, 58], deck: 5.5, foot: -3.6, inset: 0.5, barbette: 5.4 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const arkhangelskSurfaceY = SHIP.surfaceY;
export const buildArkhangelsk = () => SHIP.build();
export const arkhangelskParts = SHIP.parts;
