// Ship class catalogue. Every number here is gameplay-tuned rather than strictly
// historical, but the relationships (a Fletcher out-turns an Iowa, an Iowa's
// belt shrugs off 152 mm HE) follow the real vessels they are named for.
//
// Local ship frame: +Z is the bow, +X is starboard. Turret `angle` is the
// rest bearing in that frame (0 = forward, PI = aft) and `arc` is the maximum
// traverse away from that rest bearing.

import { KNOTS } from './math.js';

const AP = 'ap';
const HE = 'he';

/** @typedef {{type:string,damage:number,pen:number,velocity:number,fuseArm:number,fireChance:number,drag:number}} ShellSpec */

// `pen` is armour-piercing penetration in mm of belt at a typical fighting
// range; HE penetration follows the usual caliber/6 rule of thumb.
function shells(caliber, apDamage, heDamage, pen, velocity, fireChance) {
  return {
    [AP]: { type: AP, caliber, damage: apDamage, pen, velocity, fuseArm: caliber * 0.9, fireChance: 0.02, drag: 0.0022 },
    [HE]: { type: HE, caliber, damage: heDamage, pen: Math.round(caliber / 6), velocity: velocity * 0.96, fuseArm: 0, fireChance, drag: 0.0026 },
  };
}

export const SHIP_CLASSES = {
  fletcher: {
    id: 'fletcher',
    name: 'Fletcher',
    type: 'DD',
    typeName: 'Destroyer',
    nation: 'usa',
    blurb: 'Fast, invisible until it wants not to be, and carrying ten torpedo tubes. Dies to a stiff breeze.',
    hull: { length: 114, beam: 12, draft: 5.5, superstructure: 0.9 },
    hp: 15600,
    maxSpeed: 36.5 * KNOTS,
    reverseSpeed: 9 * KNOTS,
    accel: 1.35,          // m/s^2 at full ahead
    turnRate: 0.135,      // rad/s at cruising speed
    rudderShift: 2.6,     // s to swing the rudder hard over
    speedLossInTurn: 0.24,
    concealment: 5800,    // metres before an enemy spots you
    fireDetectPenalty: 3200,
    radarRange: 9000,
    repairCooldown: 60,
    repairHeal: 0.11,
    smokeCharges: 3,
    armor: { belt: 19, deck: 13, citadel: 19, bow: 13, superstructure: 13 },
    turrets: [
      { id: 0, name: 'A', x: 0, z: 34, angle: 0, arc: 2.62, guns: 1 },
      { id: 1, name: 'B', x: 0, z: 24, angle: 0, arc: 2.62, guns: 1 },
      { id: 2, name: 'X', x: 0, z: -18, angle: Math.PI, arc: 2.53, guns: 1 },
      { id: 3, name: 'Y', x: 0, z: -28, angle: Math.PI, arc: 2.53, guns: 1 },
      { id: 4, name: 'Z', x: 0, z: -38, angle: Math.PI, arc: 2.53, guns: 1 },
    ],
    gun: {
      caliber: 127, reload: 3.4, traverse: 0.52, range: 11800, sigma: 1.9,
      shells: shells(127, 2100, 1800, 80, 792, 0.08),
    },
    torpedoes: {
      mounts: [
        { id: 0, x: 0, z: 6, angle: 0, arc: 2.44, tubes: 5 },
        { id: 1, x: 0, z: -6, angle: 0, arc: 2.44, tubes: 5 },
      ],
      reload: 62, damage: 12800, speed: 30 * KNOTS, range: 8500,
      detection: 1100, arming: 400, spread: 0.09, floodChance: 0.32,
    },
    aa: { range: 3500, dps: 128 },
    secondaries: null,
    planes: null,
    // Presentation only: what the shipyard screen lists. Barrel counts for the
    // main battery and the torpedo tubes come from `turrets` and `torpedoes`
    // above, so they can never drift from what the ship actually mounts.
    datasheet: {
      displacement: 2050,
      aircraft: 0,
      mainRounds: 3600,
      torpedoesCarried: 10,
      secondary: null,
      tertiary: [
        { caliber: 40, label: '40mm', barrels: 10, rounds: 12000 },
        { caliber: 20, label: '20mm', barrels: 7, rounds: 16800 },
      ],
    },
  },

  cleveland: {
    id: 'cleveland',
    name: 'Cleveland',
    type: 'CL',
    typeName: 'Light Cruiser',
    nation: 'usa',
    blurb: 'Twelve six-inch rifles on a fast reload. No torpedoes, but nothing lightly armoured survives its rain of HE.',
    hull: { length: 186, beam: 20, draft: 7.5, superstructure: 1.15 },
    hp: 27800,
    maxSpeed: 32.5 * KNOTS,
    reverseSpeed: 8 * KNOTS,
    accel: 0.85,
    turnRate: 0.088,
    rudderShift: 6.4,
    speedLossInTurn: 0.19,
    concealment: 10600,
    fireDetectPenalty: 4200,
    radarRange: 12000,
    repairCooldown: 80,
    repairHeal: 0.09,
    smokeCharges: 0,
    armor: { belt: 127, deck: 51, citadel: 127, bow: 25, superstructure: 16 },
    turrets: [
      { id: 0, name: 'A', x: 0, z: 58, angle: 0, arc: 2.62, guns: 3 },
      { id: 1, name: 'B', x: 0, z: 44, angle: 0, arc: 2.62, guns: 3 },
      { id: 2, name: 'X', x: 0, z: -42, angle: Math.PI, arc: 2.53, guns: 3 },
      { id: 3, name: 'Y', x: 0, z: -56, angle: Math.PI, arc: 2.53, guns: 3 },
    ],
    gun: {
      caliber: 152, reload: 6.4, traverse: 0.31, range: 15400, sigma: 1.7,
      shells: shells(152, 3300, 2500, 165, 812, 0.12),
    },
    torpedoes: null,
    aa: { range: 5200, dps: 310 },
    secondaries: { range: 4800, dps: 190 },
    planes: null,
    datasheet: {
      displacement: 11750,
      aircraft: 4,
      mainRounds: 2400,
      secondary: { caliber: 127, label: '5"', barrels: 12, rounds: 6000 },
      tertiary: [
        { caliber: 40, label: '40mm', barrels: 28, rounds: 33600 },
        { caliber: 20, label: '20mm', barrels: 10, rounds: 24000 },
      ],
    },
  },

  hipper: {
    id: 'hipper',
    name: 'Admiral Hipper',
    type: 'CA',
    typeName: 'Heavy Cruiser',
    nation: 'ger',
    blurb: 'Eight-inch guns, a hard-hitting torpedo broadside and enough belt to bully anything smaller.',
    hull: { length: 203, beam: 21.5, draft: 7.7, superstructure: 1.2 },
    hp: 34400,
    maxSpeed: 32 * KNOTS,
    reverseSpeed: 8 * KNOTS,
    accel: 0.78,
    turnRate: 0.079,
    rudderShift: 7.2,
    speedLossInTurn: 0.2,
    concealment: 11800,
    fireDetectPenalty: 4600,
    radarRange: 11000,
    repairCooldown: 80,
    repairHeal: 0.1,
    smokeCharges: 0,
    armor: { belt: 178, deck: 76, citadel: 178, bow: 30, superstructure: 20 },
    turrets: [
      { id: 0, name: 'A', x: 0, z: 66, angle: 0, arc: 2.62, guns: 2 },
      { id: 1, name: 'B', x: 0, z: 52, angle: 0, arc: 2.62, guns: 2 },
      { id: 2, name: 'X', x: 0, z: -48, angle: Math.PI, arc: 2.53, guns: 2 },
      { id: 3, name: 'Y', x: 0, z: -62, angle: Math.PI, arc: 2.53, guns: 2 },
    ],
    gun: {
      caliber: 203, reload: 11.2, traverse: 0.24, range: 17200, sigma: 1.6,
      shells: shells(203, 5100, 3300, 265, 925, 0.14),
    },
    torpedoes: {
      mounts: [
        { id: 0, x: -8, z: -4, angle: -Math.PI / 2, arc: 1.22, tubes: 3 },
        { id: 1, x: 8, z: -4, angle: Math.PI / 2, arc: 1.22, tubes: 3 },
      ],
      reload: 78, damage: 13700, speed: 32 * KNOTS, range: 6000,
      detection: 1300, arming: 400, spread: 0.07, floodChance: 0.35,
    },
    aa: { range: 4800, dps: 240 },
    secondaries: { range: 5200, dps: 150 },
    planes: null,
    datasheet: {
      displacement: 16170,
      aircraft: 3,
      mainRounds: 1280,
      torpedoesCarried: 12,
      secondary: { caliber: 105, label: '105mm', barrels: 12, rounds: 4800 },
      tertiary: [
        { caliber: 37, label: '37mm', barrels: 12, rounds: 24000 },
        { caliber: 20, label: '20mm', barrels: 28, rounds: 33600 },
      ],
    },
  },

  iowa: {
    id: 'iowa',
    name: 'Iowa',
    type: 'BB',
    typeName: 'Battleship',
    nation: 'usa',
    blurb: 'Nine sixteen-inch guns behind a citadel that laughs at cruisers. Turns like a continent.',
    hull: { length: 270, beam: 33, draft: 11, superstructure: 1.35 },
    hp: 76200,
    maxSpeed: 30 * KNOTS,
    reverseSpeed: 7 * KNOTS,
    accel: 0.44,
    turnRate: 0.052,
    rudderShift: 13.5,
    speedLossInTurn: 0.17,
    concealment: 15900,
    fireDetectPenalty: 6400,
    radarRange: 13500,
    repairCooldown: 100,
    repairHeal: 0.14,
    smokeCharges: 0,
    armor: { belt: 307, deck: 152, citadel: 307, bow: 38, superstructure: 38 },
    turrets: [
      { id: 0, name: 'A', x: 0, z: 78, angle: 0, arc: 2.62, guns: 3 },
      { id: 1, name: 'B', x: 0, z: 58, angle: 0, arc: 2.62, guns: 3 },
      { id: 2, name: 'Y', x: 0, z: -74, angle: Math.PI, arc: 2.53, guns: 3 },
    ],
    gun: {
      caliber: 406, reload: 26, traverse: 0.09, range: 21600, sigma: 1.35,
      shells: shells(406, 13500, 6300, 640, 762, 0.28),
    },
    torpedoes: null,
    aa: { range: 5600, dps: 400 },
    secondaries: { range: 6200, dps: 260 },
    planes: null,
    datasheet: {
      displacement: 45000,
      aircraft: 3,
      mainRounds: 1170,
      secondary: { caliber: 127, label: '5"', barrels: 20, rounds: 9000 },
      tertiary: [
        { caliber: 40, label: '40mm', barrels: 80, rounds: 96000 },
        { caliber: 20, label: '20mm', barrels: 49, rounds: 117600 },
      ],
    },
  },

  essex: {
    id: 'essex',
    name: 'Essex',
    type: 'CV',
    typeName: 'Aircraft Carrier',
    nation: 'usa',
    blurb: 'Fights at ranges nothing else can reach. Caught alone on the surface, it is a very large target.',
    hull: { length: 265, beam: 35, draft: 8.5, superstructure: 0.55, flightDeck: true },
    hp: 55400,
    maxSpeed: 32.7 * KNOTS,
    reverseSpeed: 7 * KNOTS,
    accel: 0.52,
    turnRate: 0.058,
    rudderShift: 11,
    speedLossInTurn: 0.18,
    concealment: 14800,
    fireDetectPenalty: 5200,
    radarRange: 15000,
    repairCooldown: 90,
    repairHeal: 0.1,
    smokeCharges: 0,
    armor: { belt: 102, deck: 76, citadel: 102, bow: 25, superstructure: 20 },
    turrets: [
      { id: 0, name: 'A', x: 15, z: 46, angle: 0, arc: 1.75, guns: 2 },
      { id: 1, name: 'Y', x: 15, z: -46, angle: Math.PI, arc: 1.75, guns: 2 },
    ],
    gun: {
      caliber: 127, reload: 4.2, traverse: 0.44, range: 10600, sigma: 2.2,
      shells: shells(127, 2000, 1750, 80, 792, 0.08),
    },
    torpedoes: null,
    aa: { range: 5800, dps: 470 },
    secondaries: { range: 4200, dps: 120 },
    planes: {
      squadrons: 3, perSquadron: 4, cruiseSpeed: 78, strikeRange: 14000,
      rearm: 42, torpDamage: 8600, torpSpeed: 26 * KNOTS, torpRange: 2600,
      floodChance: 0.25, hp: 1400, dropSpread: 0.05,
    },
    datasheet: {
      displacement: 27100,
      // The air group is the armament that matters; `planes` above carries it.
      aircraft: 0,
      mainRounds: 3200,
      secondary: { caliber: 127, label: '5"', barrels: 8, rounds: 2400 },
      tertiary: [
        { caliber: 40, label: '40mm', barrels: 68, rounds: 81600 },
        { caliber: 20, label: '20mm', barrels: 55, rounds: 132000 },
      ],
    },
  },
};

export const SHIP_ORDER = ['fletcher', 'cleveland', 'hipper', 'iowa', 'essex'];

export function getClass(id) {
  return SHIP_CLASSES[id] || SHIP_CLASSES.fletcher;
}

/** Total number of barrels that can bear, used for the UI salvo readout. */
export function totalGuns(cls) {
  return cls.turrets.reduce((n, t) => n + t.guns, 0);
}

export const SHELL_TYPES = { AP, HE };
