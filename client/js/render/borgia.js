// RN Cesare Borgia, drawn from the owner's model of her.
//
// A big Italian light cruiser of the last design studies, "Plan B": two
// hundred and twenty-nine metres, twelve 152 mm/55 in four triple turrets --
// A and B forward, B superfiring; X superfiring over Y aft -- twenty 75 mm
// dual-purpose guns down her sides, fourteen 37 mm Breda twins, two
// quadruple banks of 533 mm tubes, and the red and white stripes Italian ships
// wore on their forecastles and quarterdecks, for their own aircraft to know
// them by.
//
// Her hull, her bridge, her funnels, her masts and her boats are the model --
// "Italian Light Cruiser Cesare Borgia(Plan B) -T10" by 全斗焕
// (https://skfb.ly/prA87), under Creative Commons Attribution 4.0 -- (see
// borgiaHull.js and build/prepare-borgia-hull.mjs). Every gun of hers is the
// model's own. What is built here is everything that moves or fires:
//
//   * her four 152 mm triples, the model's gunhouses on their barbettes, their
//     barrels on a cradle that elevates;
//   * her twelve 75 mm in their round shields, six a side abreast her bridge
//     and her funnels, and her eight 75 mm in open-backed shields on their
//     pedestals, their barrels on cradles that elevate;
//   * her fourteen 37 mm Breda twins, about her forecastle, her superstructure
//     and her quarterdeck;
//   * her two quadruple banks of 533 mm tubes, one a side abreast her
//     mainmast, which train out under the overhang of her boat deck and fire;
//   * her four screws, the model's, which turn;
//
// and, inside her, her armour and her interior, fitted to her own lines.
// (Her boats, her catapult and her cranes are the model's and stay where it
// put them.)
//
// Local frame, as everywhere else: +Z is the bow, +Y is up, y = 0 is the
// waterline.

import * as D from './borgiaHull.data.js';
import { texturedShip } from './texturedShip.js';

const SHIP = texturedShip({
  id: 'borgia', name: 'Borgia',
  data: {
    HULL_B64: D.BORGIA_HULL_B64, SURFACE: D.BORGIA_SURFACE, GUNS: D.BORGIA_GUNS,
    MOUNTS: D.BORGIA_MOUNTS, LINES: D.BORGIA_LINES, SCREWS: D.SCREWS,
  },
  // A hundred millimetres of belt from A's barbette to Y's, from her armour
  // deck down two and a half metres under her waterline, fifty of armour deck
  // at its top, and the barbettes of her four turrets down to it.
  armour: { citadel: [-60, 54], deck: 2.4, foot: -2.5, barbette: 3.0 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const DRAFT = 6.6;
export const buildBorgia = () => SHIP.build();
export const borgiaParts = () => SHIP.parts();
export const SHIP_BORGIA = SHIP;
