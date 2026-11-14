// USS Gerald R. Ford, CVN-78, drawn from the owner's model of her.
//
// The first of the new class: a hundred thousand tons, two new reactors with
// three times the electrical power of a Nimitz's, electromagnetic catapults
// and arresting gear, her island smaller and set further aft, and three lifts
// where a Nimitz has four. She went into commission in 2017.
//
// The numbers everything here is built to:
//
//   length overall     337 m             beam at the waterline   41 m
//   draught             12 m
//   flight deck         18.7 m over the water, 78 m across
//   hangar              one, under her flight deck
//   battery             3 Phalanx, 2 Mk 29 Sea Sparrow, 2 Mk 49 RAM (the model's)
//   air wing            90: F/A-18 Super Hornet, F-35C Lightning, E-2D
//                       Hawkeye, MH-60 Seahawk
//
// Her hull, her island, her flight deck with its markings, her lifts, her
// sponsons and every fitting on her are the model -- "Gerald R Ford aircraft
// Carrier" by waelXcm (https://skfb.ly/oEAwB), under Creative Commons
// Attribution 4.0 -- (see build/prepare-ford-hull.mjs), put together by
// supercarrier.js: her mountings training, her hangar with a door to each of
// her three lifts, and her deck cycle off her two bow catapults and her
// helicopter spot.
import { supercarrier } from './supercarrier.js';
import {
  FORD_HULL_B64, FORD_SURFACE, FORD_DECK, FORD_ISLAND, FORD_GUNS, FORD_MOUNTS, FORD_LINES, FORD_LIFTS,
} from './fordHull.data.js';

const SHIP = supercarrier({
  id: 'ford', label: 'Ford',
  data: {
    HULL_B64: FORD_HULL_B64, SURFACE: FORD_SURFACE, DECK: FORD_DECK, ISLAND: FORD_ISLAND,
    GUNS: FORD_GUNS, MOUNTS: FORD_MOUNTS, LINES: FORD_LINES, LIFTS: FORD_LIFTS,
  },
  // Her hangar, on the deck the model's hangar doors open onto, from abaft her
  // port lift to forward of her forward starboard one; each door abreast its
  // lift, where the model cuts it through her side.
  hangar: { y: 6.5, top: 2.6, z: [-125, 35], hw: 18.3, doorTop: 15.0, door: { dz: 0, hd: 10.6, x: 19.3 } },
  citadel: { z: [-95, 95], deck: 4.2, beltTop: 3.2, beltFoot: -4.5 },
  liftDepth: 1.8,
  // Her two bow catapults, where the model paints their tracks: one to
  // starboard and one on her centreline, a hundred metres each to the bow.
  cats: [{ x: -13, z: 60 }, { x: 1.5, z: 60 }], stroke: 100,
  // Her Seahawks' spot, on her centreline amidships, clear of her catapults
  // and of her landing area's roll-out; and where her jets come down, up her
  // deck from the round-down.
  helo: { x: 0, z: -10 }, land: { x: 0, z: -140 },
  // Her two starboard lifts, forward of her island, for a launch; her port
  // lift aft for a recovery.
  prefer: { launch: [0, 1], heloLaunch: [1, 0], recover: [2, 1], heloRecover: [1, 2, 0] },
  kinds: ['f18', 'f35', 'e2d', 'sh60'],
  kindOf: { fighter: 'f18', dive: 'f18', torpedo: 'sh60', aew: 'e2d' },
});

export const {
  LOA, BEAM, DRAFT, FD, HANGAR, LIFTS, LIFT_DROP, HELO, HELO_RISE, LINES, MOUNT_SEATS, ISLAND, CATS, LAND,
  zAt, keelY, shellAt, stepDeck,
} = SHIP;
export const fordSurfaceY = SHIP.surfaceY;
export const fordSeatY = SHIP.seatY;
export const fordMaterials = SHIP.materials;
export const fordGun = SHIP.gun;
export const buildFord = () => SHIP.build();
export const fordParts = SHIP.parts;
