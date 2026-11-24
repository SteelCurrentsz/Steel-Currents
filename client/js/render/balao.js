// USS Balao, drawn from the owner's model.
//
// The fleet boat of the Pacific war's second half: ninety-five metres, a
// pressure hull of thicker steel than the Gatos' for four hundred feet, six
// tubes forward and four aft, and the patrols that emptied Japan's sea lanes.
//
// Her hull, her casing and her sail are the model -- "Balao (World of
// Warships)" by KojfDiscord, under Creative Commons Attribution 4.0 -- cut by
// build/prepare-balao-hull.mjs (see build/kriss-hull.mjs), and put together by
// krissShip.js. Her tubes are in her hull; she dives as the U-48 does (see
// scene.js).
import * as D from './balaoHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'balao', data: D,
  paints: { steel: 0x3a3d40, steelDark: 0x1e2023, gun: 0x3a3d40, gunDark: 0x1e2023 },
  // Her pressure hull, from her forward torpedo room to her after one.
  armour: { citadel: [-38, 36], deck: 0.8, foot: -4.2, inset: 0.6, barbette: 0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const buildBalao = () => SHIP.build();
export const balaoParts = SHIP.parts;
