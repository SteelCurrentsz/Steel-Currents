// Admiral Kuznetsov, drawn from the owner's model of her.
//
// The Russian Navy's one aircraft-carrying cruiser, Project 1143.5: fifty-
// eight thousand tons, three hundred and five metres, steam turbines on four
// shafts, and no catapult at all -- her aircraft go off a fourteen-degree
// ski-jump over her bow under their own power, and come back to the wires on
// her angled deck. Two deck-edge lifts to starboard, either side of her
// island, serve her hangar. She went into commission in 1990.
//
// The numbers everything here is built to:
//
//   length overall     305 m             draught                  10.5 m
//   flight deck         18.8 m over the water, the ski-jump over her bow
//   hangar              one, 153 m by 26, under her flight deck
//   battery             6 AK-630, 8 Kashtan, 12 P-700 Granit under hatches
//                       forward, 24 Kinzhal launchers, 2 RBU-12000
//   air wing            52: Su-33, MiG-29K, Su-25, Ka-27, Ka-52K
//
// Her hull, her island, her flight deck with its markings, her lifts, her
// sponsons, her Kashtans and her RBU-12000s are the model -- "CV Admiral
// Kuznetsov (War Thunder)" by KojfDiscord, under Creative Commons Attribution
// 4.0 -- (see build/prepare-kuznetsov-hull.mjs); her AK-630s are the owner's
// own model of one (see ak630.data.js). All put together by supercarrier.js:
// her guns training, her hangar with a door to each of her lifts, and her
// deck cycle up her ski-jump and onto her helicopter spot aft.
import { supercarrier } from './supercarrier.js';
import { AK630 } from './ak630.data.js';
import {
  KUZ_HULL_B64, KUZ_SURFACE, KUZ_DECK, KUZ_ISLAND, KUZ_GUNS, KUZ_MOUNTS, KUZ_LINES, KUZ_LIFTS,
} from './kuznetsovHull.data.js';

const SHIP = supercarrier({
  id: 'kuznetsov', label: 'Admiral Kuznetsov',
  data: {
    HULL_B64: KUZ_HULL_B64, SURFACE: KUZ_SURFACE, DECK: KUZ_DECK, ISLAND: KUZ_ISLAND,
    GUNS: KUZ_GUNS, MOUNTS: KUZ_MOUNTS, LINES: KUZ_LINES, LIFTS: KUZ_LIFTS,
  },
  // Her AK-630s are her battery, the owner's model of one; her Kashtans are
  // the model's own.
  mainPiece: 'ak630',
  guns: { ak630: AK630 },
  // Her hangar, under her flight deck from abaft her after lift to forward
  // of her forward one; each door abreast its lift, where the lift's inboard
  // edge comes down past her side.
  hangar: { y: 10.8, top: 1.7, z: [-100, 36], hw: 13, doorTop: 16.9, door: { dz: 0, hd: 8.2, x: 15.2 } },
  citadel: { z: [-100, 90], deck: 4.0, beltTop: 3.0, beltFoot: -4.5 },
  liftDepth: 0.6,
  // No catapults: her two forward take-off positions either side of her
  // centreline, and from each a run of ninety-eight metres up to the lip of
  // her ski-jump, in a little over three seconds.
  cats: [{ x: -4, z: 52 }, { x: 4, z: 52 }], stroke: 97, skiJump: true, runT: 3.2,
  // Her helicopters' spot aft, to starboard of her angled deck; and where
  // her jets come down, on her angled deck from the round-down.
  helo: { x: -8, z: -128 }, land: { x: 6, z: -112 },
  // Her forward lift (abreast her island's forward end) for a launch, her
  // after one for a recovery.
  prefer: { launch: [1, 0], heloLaunch: [0, 1], recover: [0, 1], heloRecover: [0, 1] },
  kinds: ['su33', 'mig29k', 'su25', 'ka27', 'ka52'],
  kindOf: { fighter: 'su33', dive: 'su25', torpedo: 'ka27' },
});

export const {
  LOA, BEAM, DRAFT, FD, HANGAR, LIFTS, LIFT_DROP, HELO, HELO_RISE, LINES, MOUNT_SEATS, ISLAND, CATS, LAND,
  zAt, keelY, shellAt, stepDeck,
} = SHIP;
export const kuznetsovSurfaceY = SHIP.surfaceY;
export const kuznetsovSeatY = SHIP.seatY;
export const kuznetsovMaterials = SHIP.materials;
export const buildKuznetsov = () => SHIP.build();
export const kuznetsovParts = SHIP.parts;
