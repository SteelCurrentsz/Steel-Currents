// KMS Type VIIC/41, drawn from the owner's model.
//
// The VIIC built again from 1943 with a thicker pressure hull to go deeper,
// and the flak the Biscay had taught the U-boats they needed: an 8.8 cm on her
// casing forward of the tower, a 2 cm either side of her upper Wintergarten and
// a 3.7 cm on her lower one; four bow tubes and one stern tube in her hull.
//
// Her hull, her casing, her tower and her guns are the model -- "Type VIIC41
// U-boat 3D Model" by kriss50 (https://skfb.ly/pt97Q), under Creative Commons
// Attribution 4.0 -- cut by build/prepare-type7c41-hull.mjs (see
// build/kriss-hull.mjs), and put together by krissShip.js. Her tubes' outer
// doors are the model's own; she dives as the U-48 does (see scene.js).
import * as D from './type7c41Hull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'type7c41', data: D,
  paints: { steel: 0x8b929a, steelDark: 0x4a5159, gun: 0x8b929a, gunDark: 0x3a4046 },
  // Her pressure hull, the only part of her that is watertight, from her
  // fore-ends to her after-ends: everything outside it free-flooding casing
  // and tanks.
  armour: { citadel: [-26, 24], deck: 0.6, foot: -3.6, inset: 0.5, barbette: 0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const buildType7c41 = () => SHIP.build();
export const type7c41Parts = SHIP.parts;
