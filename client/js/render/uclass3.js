// HMS U-class III, drawn from the owner's model.
//
// The Royal Navy's small boats of the third group: fifty-eight metres, a
// round bow with four tubes inside her pressure hull, her tower aft of her
// middle with the 3-inch on its bandstand at the forward end of it, and
// diesel-electric drive that made her nearly as quick under the sea as on it.
//
// Her hull, her casing, her tower and her gun are the model -- "British
// U-class III" by kriss50 (https://skfb.ly/pt9xJ), under Creative Commons
// Attribution 4.0 -- cut by build/prepare-uclass3-hull.mjs (see
// build/kriss-hull.mjs), and put together by krissShip.js. Her tubes' outer
// doors are the model's own; she dives as the U-48 does (see scene.js).
import * as D from './uclass3Hull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'uclass3', data: D,
  paints: { steel: 0x4f565c, steelDark: 0x33383c, gun: 0x646b71, gunDark: 0x33383c },
  // Her pressure hull, the only part of her that is watertight, from her
  // fore-ends to her after-ends: everything outside it free-flooding casing
  // and tanks.
  armour: { citadel: [-22, 22], deck: 0.6, foot: -3.6, inset: 0.5, barbette: 0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const buildUclass3 = () => SHIP.build();
export const uclass3Parts = SHIP.parts;
