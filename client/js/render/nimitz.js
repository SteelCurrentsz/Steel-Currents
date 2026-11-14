// USS Nimitz, CVN-68, drawn from the owner's model of her.
//
// The first of the ten: a hundred thousand tons, two reactors, four screws,
// and three hundred and thirty-three metres of flight deck with its landing
// area angled off to port, four catapults and four lifts at her deck edge.
//
// The numbers everything here is built to:
//
//   length overall     332.8 m           beam at the waterline   40.8 m
//   draught             11.3 m, as the model floats her
//   flight deck         20.1 m over the water, 76.8 m across
//   hangar              one, under the gallery deck
//   battery             2 Phalanx, 4 Mk 29 Sea Sparrow, 2 Mk 49 RAM (the model's)
//   air wing            90: F/A-18 Super Hornet, E-2D Hawkeye, SH-60 Seahawk
//
// Her hull, her island, her flight deck, her lifts, her sponsons and every
// fitting on her are the model -- "USS NIMITZ CVN-68 AIRCRAFT CARRIER" by
// Muhamad Mirza Arrafi, under Creative Commons Attribution 4.0 -- (see
// build/prepare-nimitz-hull.mjs), put together by supercarrier.js: her
// mountings training, her hangar with its four doors, her four lifts, and her
// deck cycle off her two bow catapults and her helicopter spot abreast her
// island.
import { supercarrier } from './supercarrier.js';
import {
  NIMITZ_HULL_B64, NIMITZ_SURFACE, NIMITZ_DECK, NIMITZ_ISLAND, NIMITZ_GUNS, NIMITZ_MOUNTS, NIMITZ_LINES, NIMITZ_LIFTS,
} from './nimitzHull.data.js';

const SHIP = supercarrier({
  id: 'nimitz', label: 'Nimitz',
  data: {
    HULL_B64: NIMITZ_HULL_B64, SURFACE: NIMITZ_SURFACE, DECK: NIMITZ_DECK, ISLAND: NIMITZ_ISLAND,
    GUNS: NIMITZ_GUNS, MOUNTS: NIMITZ_MOUNTS, LINES: NIMITZ_LINES, LIFTS: NIMITZ_LIFTS,
  },
  // One hangar, eight metres high, on the deck the model's hangar doors open
  // onto, from abaft her after lifts to where her bow closes in on it. Each
  // door a little forward of its lift's middle, as the model has it.
  hangar: { y: 7.4, top: 2.6, z: [-121, 62], hw: 18.3, doorTop: 15.8, door: { dz: -2.1, hd: 10.6, x: 19.3 } },
  citadel: { z: [-90, 95], deck: 4.2, beltTop: 3.2, beltFoot: -4.5 },
  liftDepth: 1.83,
  // Her two bow catapults: where each starts, and their stroke.
  cats: [{ x: -5.2, z: 72 }, { x: 6.4, z: 74 }], stroke: 92,
  // Her Seahawks' spot, on her centreline abreast the island; and where her
  // jets come down, up her deck from the round-down.
  helo: { x: 0, z: 2 }, land: { x: 0, z: -138 },
  // Forward lifts for a launch, the after ones for a recovery.
  prefer: { launch: [0, 1], heloLaunch: [1, 0], recover: [2, 3, 1], heloRecover: [1, 2, 0] },
  kinds: ['f18', 'e2d', 'sh60'],
  kindOf: { fighter: 'f18', dive: 'f18', torpedo: 'sh60', aew: 'e2d' },
});

export const {
  LOA, BEAM, DRAFT, FD, HANGAR, LIFTS, LIFT_DROP, HELO, HELO_RISE, LINES, MOUNT_SEATS, ISLAND,
  zAt, keelY, shellAt, stepDeck,
} = SHIP;
export const nimitzSurfaceY = SHIP.surfaceY;
export const nimitzSeatY = SHIP.seatY;
export const nimitzMaterials = SHIP.materials;
export const nimitzGun = SHIP.gun;
export const buildNimitz = () => SHIP.build();
export const nimitzParts = SHIP.parts;
