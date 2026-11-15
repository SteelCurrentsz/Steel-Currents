// KMS Type VIIC, drawn from the owner's model.
//
// The workhorse of the Battle of the Atlantic: sixty-seven metres of her,
// two hulls -- a pressure hull and the free-flooding casing and saddle tanks
// round it -- a tower with the Wintergarten abaft it, four bow tubes and one
// stern tube fixed in her hull. The model has her as she was late in the war,
// her deck gun landed and a single 2 cm on her Wintergarten.
//
// Her hull, her casing, her tower and her gun are the model -- "Type VIIC
// U-boat" by kriss50 (https://skfb.ly/pt9wq), under Creative Commons
// Attribution 4.0 -- cut by build/prepare-type7c-hull.mjs (see
// build/kriss-hull.mjs), and put together by krissShip.js. Her tubes' outer
// doors are the model's own; she dives as the U-48 does (see scene.js).
import * as D from './type7cHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'type7c', data: D,
  paints: { steel: 0x8b929a, steelDark: 0x4a5159, gun: 0x8b929a, gunDark: 0x3a4046 },
  // Her pressure hull, the only part of her that is watertight, from her
  // fore-ends to her after-ends: everything outside it free-flooding casing
  // and tanks.
  armour: { citadel: [-26, 24], deck: 0.6, foot: -3.6, inset: 0.5, barbette: 0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const buildType7c = () => SHIP.build();
export const type7cParts = SHIP.parts;
