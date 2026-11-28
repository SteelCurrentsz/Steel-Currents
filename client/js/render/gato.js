// USS Gato, drawn from the owner's model of her.
//
// The fleet boat that went to war: ninety-five metres, six tubes forward and
// four aft, three hundred feet of test depth, and the class that carried the
// submarine war across the Pacific from 1942.
//
// Her hull, her casing and her conning tower are the model -- "Gato Sub" by
// AcesWild1965, under Creative Commons Attribution 4.0 -- cut by
// build/prepare-gato-hull.mjs (see build/kriss-hull.mjs), and put together by
// krissShip.js. The model draws no guns: her 5"/25 abaft her tower and her
// two Oerlikons on its gun decks are the fleet's own mountings. Her tubes are
// in her hull; she dives as the U-48 does (see scene.js).
import * as D from './gatoHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'gato', data: D,
  paints: { steel: 0x3a3d40, steelDark: 0x1e2023, gun: 0x3a3d40, gunDark: 0x1e2023 },
  // Her pressure hull, from her forward torpedo room to her after one.
  armour: { citadel: [-38, 36], deck: 0.8, foot: -4.2, inset: 0.6, barbette: 0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const buildGato = () => SHIP.build();
export const gatoParts = SHIP.parts;
