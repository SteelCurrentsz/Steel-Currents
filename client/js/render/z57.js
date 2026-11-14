// KMS Z-57, drawn from the owner's model of a Type 1944 destroyer.
//
// The Kriegsmarine's last destroyer design, never finished: four twin
// gunhouses, a quadruple bank of 53.3 cm tubes, 5.5 cm, 3.7 cm and 3 cm flak,
// and diesels for the Atlantic.
//
// Her hull, bridge, funnels, masts and deckhouses, her gunhouses, her bank of
// tubes and her flak are the model -- "German Destroyer Z-57" by 全斗焕
// (https://skfb.ly/o6KVM), under Creative Commons Attribution 4.0 -- cut by
// build/prepare-z57-hull.mjs (see build/kriss-hull.mjs) and put together by
// krissShip.js with her splinter plating and her insides.
import * as D from './z57Hull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'z57', data: D,
  paints: { steel: 0x8b9095, steelDark: 0x50555a, gun: 0x8b9095, gunDark: 0x50555a, deckDark: 0x5b6065 },
  armour: { citadel: [-26, 22], deck: 1.6, foot: -2.4, inset: 0.3 },
  // Her depth charge gear, where she has any, is the model's own.
  gear: { model: true },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const z57SurfaceY = SHIP.surfaceY;
export const buildZ57 = () => SHIP.build();
export const z57Parts = SHIP.parts;
export const z57Charges = SHIP.charges;
