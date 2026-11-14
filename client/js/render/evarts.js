// USS Evarts, drawn from the owner's model of her.
//
// The name ship of the short-hulled diesel-electric destroyer escorts of
// 1942-43: three 3"/50s, nine Oerlikons, a Hedgehog, eight K-guns and two
// racks, and twenty-one knots on eighty-eight metres.
//
// Her hull, bridge, funnel, mast, deckhouses and anti-submarine gear, her
// three 3"/50s and her Oerlikons are the model -- "Evarts Destroyer Escort" by
// kriss50 (https://skfb.ly/ptByP), under Creative Commons Attribution 4.0 --
// cut by build/prepare-evarts-hull.mjs (see build/kriss-hull.mjs) and put
// together by krissShip.js with her splinter plating and her insides.
import * as D from './evartsHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'evarts', data: D,
  paints: { steel: 0x323f56, steelDark: 0x262f40, gun: 0x323f56, gunDark: 0x262f40, deckDark: 0x3e4856 },
  armour: { citadel: [-16, 14], deck: 1.2, foot: -1.6, inset: 0.3 },
  // Her depth charge gear, where she has any, is the model's own.
  gear: { model: true },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const evartsSurfaceY = SHIP.surfaceY;
export const buildEvarts = () => SHIP.build();
export const evartsParts = SHIP.parts;
export const evartsCharges = SHIP.charges;
