// A Victory ship, drawn from the owner's model of one.
//
// The VC2 emergency cargo ship of 1944: the Liberty ship's successor, a
// hundred and thirty-nine metres, a geared turbine and fifteen and a half
// knots, armed by the Naval Armed Guard with a 5"/38 on her poop, a 3"/50 on
// her forecastle and eight Oerlikons.
//
// Her hull, her house, her masts, booms and kingposts, and her two guns are
// the model -- "Victory Cargo" by kriss50 (https://skfb.ly/pt9CU), under
// Creative Commons Attribution 4.0 -- cut by build/prepare-victory-hull.mjs
// (see build/kriss-hull.mjs), and put together by krissShip.js with her
// Oerlikons, her insides and the splinter plating round her engine room.
import * as D from './victoryHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'victory', data: D,
  paints: { steel: 0x323f56, steelDark: 0x2a3343, gun: 0x87909a, gunDark: 0x4d545c, deckDark: 0x3e4856 },
  armour: { citadel: [-30, 10], deck: 4.0, foot: -2.0, inset: 0.4 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const victorySurfaceY = SHIP.surfaceY;
export const buildVictory = () => SHIP.build();
export const victoryParts = SHIP.parts;
