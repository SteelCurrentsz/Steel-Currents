// FS Charles de Gaulle, R91, drawn from the owner's model of her.
//
// The French Navy's carrier, and the only nuclear-powered carrier that is not
// American: forty-two thousand tons, two K15 reactors on two shafts, her
// flight deck angled to port, two C-13-3 steam catapults -- one on her bow,
// one in her waist -- and two deck-edge lifts to starboard abaft her island.
// She went into commission in 2001.
//
// The numbers everything here is built to:
//
//   length overall     261.5 m           draught                  9.4 m
//   flight deck         18 m over the water, 82 m across her sponsons
//   hangar              one, under her flight deck
//   battery             4 Sylver A43 (32 Aster 15), 6 Sadral (Mistral) -- the
//                       model's; no gun
//   air wing            40: Rafale M, E-2 Hawkeye, NH90 Caiman
//
// Her hull, her island, her flight deck with its markings, her lifts, her
// sponsons and every fitting on her are the model -- "Charles De Gaulle
// Aircraft Carrier" by Muhamad Mirza Arrafi (https://skfb.ly/pLzwC), under
// Creative Commons Attribution 4.0 -- (see build/prepare-cdg-hull.mjs), put
// together by supercarrier.js: her Sadrals training, her hangar with a door to
// each of her lifts, and her deck cycle off her two catapults and her
// helicopter spot.
import { supercarrier } from './supercarrier.js';
import {
  CDG_HULL_B64, CDG_SURFACE, CDG_DECK, CDG_ISLAND, CDG_GUNS, CDG_MOUNTS, CDG_LINES, CDG_LIFTS,
} from './cdgHull.data.js';

const SHIP = supercarrier({
  id: 'cdg', label: 'Charles de Gaulle',
  data: {
    HULL_B64: CDG_HULL_B64, SURFACE: CDG_SURFACE, DECK: CDG_DECK, ISLAND: CDG_ISLAND,
    GUNS: CDG_GUNS, MOUNTS: CDG_MOUNTS, LINES: CDG_LINES, LIFTS: CDG_LIFTS,
  },
  // Her hangar, under her flight deck from abaft her after lift to forward of
  // her forward one; each door abreast its lift, where the lift's inboard
  // edge comes down past her side.
  hangar: { y: 7.0, top: 1.6, z: [-80, 40], hw: 13.5, doorTop: 16.0, door: { dz: 0, hd: 10.3, x: 14.3 } },
  citadel: { z: [-80, 80], deck: 3.6, beltTop: 2.8, beltFoot: -4.0 },
  liftDepth: 0.6,
  // Her bow catapult, up her starboard bow where the model paints its track;
  // and her waist catapult, on her angled deck to port.
  cats: [{ x: -5, z: 52 }, { x: 13, z: 10 }], stroke: 75,
  // Her Caimans' spot aft on her angled deck, clear of her lifts and her
  // landing area's roll-out; and where her jets come down, up her angled deck
  // from the round-down.
  helo: { x: 10, z: -60 }, land: { x: 4, z: -100 },
  // Her forward lift for a launch, her after one for a recovery.
  // Her forward lift (the second, abreast her island's after end) for a
  // launch, her after one for a recovery.
  prefer: { launch: [1, 0], heloLaunch: [1, 0], recover: [0, 1], heloRecover: [0, 1] },
  kinds: ['rafale', 'e2d', 'nh90'],
  kindOf: { fighter: 'rafale', dive: 'rafale', torpedo: 'nh90', aew: 'e2d' },
  railPiece: { mistral: 'sadral' },
});

export const {
  LOA, BEAM, DRAFT, FD, HANGAR, LIFTS, LIFT_DROP, HELO, HELO_RISE, LINES, MOUNT_SEATS, ISLAND, CATS, LAND,
  zAt, keelY, shellAt, stepDeck,
} = SHIP;
export const cdgSurfaceY = SHIP.surfaceY;
export const cdgSeatY = SHIP.seatY;
export const cdgMaterials = SHIP.materials;
export const buildCdg = () => SHIP.build();
export const cdgParts = SHIP.parts;
