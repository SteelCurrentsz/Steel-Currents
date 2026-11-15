// IJN Amagi, drawn from the owner's model.
//
// The battlecruiser the Washington Treaty and the Great Kanto earthquake
// between them kept from the sea, as she would have been finished: two
// hundred and fifty-two metres, ten 41 cm/45 in five twin turrets -- two
// forward, one abaft her mainmast facing aft and two aft -- a pagoda of a
// bridge, two funnels, sixteen 14 cm in casemates in her side and eight
// twin 100 mm about her funnels.
//
// Her hull, her pagoda, her funnels and her mainmast, her turrets and her
// guns are the model -- "Japanese Battlecruiser Amagi" by MPonceE
// (https://skfb.ly/6Utus), under Creative Commons Attribution 4.0 -- cut by
// build/prepare-amagi-hull.mjs (see build/kriss-hull.mjs), and put together
// by krissShip.js with her armour and her insides. The triple 25 mm on the
// roofs of her three superfiring turrets are their turrets' own, and train
// with them.
import * as D from './amagiHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'amagi', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x4d5155, deckDark: 0x6b5242 },
  // Her belt from forward of No.1's barbette to abaft No.5's, her armour deck
  // over it, and the barbettes of her five turrets.
  armour: { citadel: [-75, 71], deck: 4.4, foot: -3.0, inset: 0.6, barbette: 4.6 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const amagiSurfaceY = SHIP.surfaceY;
export const buildAmagi = () => SHIP.build();
export const amagiParts = SHIP.parts;
