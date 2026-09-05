// Ship class catalogue. Every number here is gameplay-tuned rather than strictly
// historical, but the relationships (a Fletcher out-turns an Iowa, an Iowa's
// belt shrugs off 152 mm HE) follow the real vessels they are named for.
//
// Local ship frame: +Z is the bow, +X is starboard. A mounting's `angle` is the
// rest bearing in that frame (0 = forward, PI = aft) and `arc` is the maximum
// traverse away from that rest bearing -- so `arc` of PI is a gun that trains
// right round and nothing is that. Every gun on every ship here is blocked by
// her own structure over some sector: an A turret cannot fire through her own
// bridge, a waist mounting cannot fire across her own deck, and a gun laid on
// a bearing it cannot reach does not fire at all.
//
// `role` says what a mounting may engage: 'surface' for a gun that cannot
// elevate to an aeroplane, 'aa' for one that cannot depress to a ship, and
// 'dp' for a dual-purpose mounting that does both.

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
    // Five single 5"/38 dual-purpose mounts, quick-training and unobstructed on a
    // flush deck: `arc` is the half-angle either side of a mount's rest bearing,
    // so PI is a gun that trains right round. These are the ones that do.
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
      { id: 0, name: 'A', x: 0, z: 32, angle: 0, arc: 2.46, guns: 1 },
      { id: 1, name: 'B', x: 0, z: 24, angle: 0, arc: 2.39, guns: 1 },
      { id: 2, name: 'X', x: 0, z: -28, angle: Math.PI, arc: 2.44, guns: 1 },
      { id: 3, name: 'Y', x: 0, z: -37, angle: Math.PI, arc: 2.36, guns: 1 },
      { id: 4, name: 'Z', x: 0, z: -45, angle: Math.PI, arc: 2.27, guns: 1 },
    ],
    gun: {
      name: '5"/38 Mk 30', role: 'dp',
      caliber: 127, reload: 3.4, traverse: 0.52, range: 11800, sigma: 1.9,
      shells: shells(127, 2100, 1800, 80, 792, 0.08),
    },
    torpedoes: {
      mounts: [
        { id: 0, x: 0, z: -3, angle: 0, arc: 2.44, tubes: 5 },
        { id: 1, x: 0, z: -19, angle: 0, arc: 2.44, tubes: 5 },
      ],
      name: 'Mk 15 torpedo', role: 'surface', caliber: 533,
      // How fast the bank comes round on its training gear. A quintuple mount
      // is fifteen tons of tubes and it does not swing quickly.
      traverse: 0.30,
      reload: 62, damage: 12800, speed: 30 * KNOTS, range: 8500,
      detection: 1100, arming: 400, spread: 0.09, floodChance: 0.32,
    },
    // Her own five-inch is the anti-aircraft battery -- a Fletcher's main
    // armament is dual-purpose -- and the light guns are what she has left when
    // an aeroplane is inside the five-inch minimum.
    // `dps` is the whole battery firing. What actually reaches an aeroplane is
    // that, times the share of the barrels that can bear on her -- so the
    // figure here is larger than the damage anyone ever takes from it.
    aa: {
      range: 3500, dps: 15,
      guns: [
        { name: '40mm Bofors', caliber: 40, role: 'aa', reload: 0.28, range: 3200,
          mounts: [
            { x: -3.9, z: -11.2, angle: -0.45, arc: 2.09, guns: 2 },
            { x: 3.9, z: -11.2, angle: 0.45, arc: 2.09, guns: 2 },
            { x: -2.5, z: -32.2, angle: -2.6, arc: 2.09, guns: 2 },
            { x: 2.5, z: -32.2, angle: 2.6, arc: 2.09, guns: 2 },
            { x: 0, z: -54.8, angle: Math.PI, arc: 2.27, guns: 2 },
          ] },
        { name: '20mm Oerlikon', caliber: 20, role: 'aa', reload: 0.12, range: 1800,
          mounts: [
            { x: -3.2, z: 14, angle: -1.3, arc: 1.92, guns: 2 },
            { x: 3.2, z: 14, angle: 1.3, arc: 1.92, guns: 2 },
            { x: -3.4, z: -24, angle: -1.5, arc: 1.83, guns: 1 },
            { x: 3.4, z: -24, angle: 1.5, arc: 1.83, guns: 1 },
            { x: 0, z: -41, angle: Math.PI, arc: 2.09, guns: 1 },
          ] },
      ],
    },
    // Two stern racks and six K-guns. There is nothing under the sea in this
    // war to drop them on, so they are listed and carried and never used.
    depthCharges: {
      name: 'Mk 6 depth charge', role: 'sub', racks: 2, throwers: 6, carried: 56,
    },
    secondary: null,
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
    // Four triple 6" turrets, superfiring fore and aft. Wide arcs, but the
    // superstructure takes a bite out of each of them.
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
      { id: 3, name: 'Y', x: 0, z: -56, angle: Math.PI, arc: 2.44, guns: 3 },
    ],
    gun: {
      name: '6"/47 Mk 16', role: 'surface',
      caliber: 152, reload: 6.4, traverse: 0.31, range: 15400, sigma: 1.7,
      shells: shells(152, 3300, 2500, 165, 812, 0.12),
    },
    torpedoes: null,
    // Twelve five-inch in six twin mounts: one superfiring forward, one aft,
    // and four in the waist that can only fire on their own side.
    secondary: {
      name: '5"/38 Mk 32', role: 'dp',
      caliber: 127, reload: 4.0, traverse: 0.44, range: 8200, sigma: 1.15,
      shells: shells(127, 1900, 1650, 76, 792, 0.07),
      mounts: [
        { x: 0, z: 32.5, angle: 0, arc: 2.44, guns: 2 },
        { x: 0, z: -27.0, angle: Math.PI, arc: 2.36, guns: 2 },
        { x: -6.7, z: 6.0, angle: -Math.PI / 2, arc: 1.40, guns: 2 },
        { x: 6.7, z: 6.0, angle: Math.PI / 2, arc: 1.40, guns: 2 },
        { x: -6.7, z: -8.5, angle: -Math.PI / 2, arc: 1.40, guns: 2 },
        { x: 6.7, z: -8.5, angle: Math.PI / 2, arc: 1.40, guns: 2 },
      ],
    },
    aa: {
      range: 5200, dps: 52,
      guns: [
        { name: '40mm Bofors', caliber: 40, role: 'aa', reload: 0.26, range: 3400,
          mounts: [
            { x: -6.6, z: 33.5, angle: -0.5, arc: 2.09, guns: 4 },
            { x: 6.6, z: 33.5, angle: 0.5, arc: 2.09, guns: 4 },
            { x: 0, z: -33.0, angle: Math.PI, arc: 2.44, guns: 4 },
            { x: 0, z: -80.0, angle: Math.PI, arc: 2.27, guns: 4 },
            { x: -7.85, z: 10.5, angle: -Math.PI / 2, arc: 1.75, guns: 2 },
            { x: 7.85, z: 10.5, angle: Math.PI / 2, arc: 1.75, guns: 2 },
            { x: -7.6, z: 50.0, angle: -0.8, arc: 1.92, guns: 2 },
            { x: 7.6, z: 50.0, angle: 0.8, arc: 1.92, guns: 2 },
            { x: -7.6, z: -50.0, angle: -2.3, arc: 1.92, guns: 2 },
            { x: 7.6, z: -50.0, angle: 2.3, arc: 1.92, guns: 2 },
          ] },
        { name: '20mm Oerlikon', caliber: 20, role: 'aa', reload: 0.12, range: 1800,
          mounts: [
            { x: -4.6, z: 12.0, angle: -1.1, arc: 1.83, guns: 1 },
            { x: 4.6, z: 12.0, angle: 1.1, arc: 1.83, guns: 1 },
            { x: -7.2, z: 24.0, angle: -1.1, arc: 1.83, guns: 1 },
            { x: 7.2, z: 24.0, angle: 1.1, arc: 1.83, guns: 1 },
            { x: -7.6, z: -3.0, angle: -1.5, arc: 1.83, guns: 1 },
            { x: 7.6, z: -3.0, angle: 1.5, arc: 1.83, guns: 1 },
            { x: -3.2, z: 66.0, angle: -0.9, arc: 1.92, guns: 1 },
            { x: 3.2, z: 66.0, angle: 0.9, arc: 1.92, guns: 1 },
            { x: -3.6, z: -64.0, angle: -2.2, arc: 1.92, guns: 1 },
            { x: 3.6, z: -64.0, angle: 2.2, arc: 1.92, guns: 1 },
          ] },
      ],
    },
    // Her four Kingfishers, off the two catapults on the quarterdeck. They are
    // not a strike group and this does not pretend they are: a cruiser's
    // floatplanes went up to spot her fall of shot and to look over the horizon
    // for her, and the two hundred pounds of bomb one of them could carry was
    // for a submarine caught on the surface. So she puts up one aeroplane at a
    // time, it stings rather than strikes, and getting it back aboard by crane
    // keeps the catapult busy long after the shot itself.
    planes: {
      squadrons: 2, perSquadron: 2, cruiseSpeed: 58, strikeRange: 9000,
      rearm: 95, hp: 640, dropSpread: 0.06,
      torpDamage: 0, torpSpeed: 0, torpRange: 0, floodChance: 0,
      bombDamage: 900, bombHit: 0.32, bombFire: 0.1,
      // Off a catapult, not down a flight deck: the whole evolution is the
      // catapult training out, the engine running up and the shot itself.
      catapult: true, deckRun: 8.6, deckCycle: 30,
      // The height the catapult shot leaves her at, off the integrated
      // profile: a scout is thrown off level and climbs from there.
      runHeight: 22,
      // Where the shot leaves her: a hundred and forty metres out, on the
      // bearing the catapult was trained to, which is well round on the bow.
      // Measured off the integrated catapult shot, not guessed.
      runOut: 141, runBearing: 1.16,
      // Nothing for a captain to balance -- she embarks scouts and that is all
      // there is aboard -- so there is no hangar to re-stow and no `group`.
      flight: { fighters: 0, dive: 2, torpedo: 0 },
    },
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
    // Four twin 8" turrets. Heavier than a light cruiser's and correspondingly
    // slower and narrower in their training.
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
      // Stations off her own profile: Anton forty-five and a half metres abaft
      // the stem, Bruno ten metres behind her, and the after pair the same
      // spacing from the transom.
      { id: 0, name: 'A', x: 0, z: 56.6, angle: 0, arc: 2.44, guns: 2 },
      { id: 1, name: 'B', x: 0, z: 46.3, angle: 0, arc: 2.36, guns: 2 },
      { id: 2, name: 'X', x: 0, z: -48.9, angle: Math.PI, arc: 2.36, guns: 2 },
      { id: 3, name: 'Y', x: 0, z: -62.2, angle: Math.PI, arc: 2.27, guns: 2 },
    ],
    gun: {
      name: '20.3 cm SK C/34', role: 'surface',
      caliber: 203, reload: 11.2, traverse: 0.24, range: 17200, sigma: 1.6,
      shells: shells(203, 5100, 3300, 265, 925, 0.14),
    },
    torpedoes: {
      mounts: [
        { id: 0, x: -8, z: -4, angle: -Math.PI / 2, arc: 1.22, tubes: 3 },
        { id: 1, x: 8, z: -4, angle: Math.PI / 2, arc: 1.22, tubes: 3 },
      ],
      name: 'G7a torpedo', role: 'surface', caliber: 533,
      traverse: 0.26,
      reload: 78, damage: 13700, speed: 32 * KNOTS, range: 6000,
      detection: 1300, arming: 400, spread: 0.07, floodChance: 0.35,
    },
    // Six twin 10.5 cm on the beam: three a side, and none of them can fire
    // across her.
    secondary: {
      name: '10.5 cm SK C/33', role: 'dp',
      caliber: 105, reload: 4.6, traverse: 0.40, range: 7600, sigma: 1.05,
      shells: shells(105, 1500, 1300, 62, 900, 0.06),
      // Abreast the bridge, abreast the funnel and abreast the after tower,
      // which is where her drawing puts the three pairs.
      mounts: [
        { x: -8.4, z: 32, angle: -Math.PI / 2, arc: 1.40, guns: 2 },
        { x: 8.4, z: 32, angle: Math.PI / 2, arc: 1.40, guns: 2 },
        { x: -8.6, z: 0, angle: -Math.PI / 2, arc: 1.31, guns: 2 },
        { x: 8.6, z: 0, angle: Math.PI / 2, arc: 1.31, guns: 2 },
        { x: -8.2, z: -40, angle: -Math.PI / 2, arc: 1.40, guns: 2 },
        { x: 8.2, z: -40, angle: Math.PI / 2, arc: 1.40, guns: 2 },
      ],
    },
    aa: {
      range: 4800, dps: 58,
      guns: [
        { name: '3.7 cm SK C/30', caliber: 37, role: 'aa', reload: 0.7, range: 3000,
          mounts: [
            { x: -7.8, z: 30, angle: -1.2, arc: 1.92, guns: 2 },
            { x: 7.8, z: 30, angle: 1.2, arc: 1.92, guns: 2 },
            { x: -8.0, z: -6, angle: -Math.PI / 2, arc: 1.75, guns: 2 },
            { x: 8.0, z: -6, angle: Math.PI / 2, arc: 1.75, guns: 2 },
            { x: -7.4, z: -34, angle: -1.9, arc: 1.92, guns: 2 },
            { x: 7.4, z: -34, angle: 1.9, arc: 1.92, guns: 2 },
          ] },
        { name: '2 cm Flak 38', caliber: 20, role: 'aa', reload: 0.1, range: 1700,
          mounts: [
            { x: -6.4, z: 40, angle: -1.0, arc: 1.83, guns: 4 },
            { x: 6.4, z: 40, angle: 1.0, arc: 1.83, guns: 4 },
            { x: -7.2, z: 14, angle: -1.5, arc: 1.83, guns: 4 },
            { x: 7.2, z: 14, angle: 1.5, arc: 1.83, guns: 4 },
            { x: -6.8, z: -26, angle: -1.9, arc: 1.83, guns: 4 },
            { x: 6.8, z: -26, angle: 1.9, arc: 1.83, guns: 4 },
            { x: 0, z: -34, angle: Math.PI, arc: 2.27, guns: 4 },
          ] },
      ],
    },
    // Three Arado 196s, worked off a single athwartships catapult abaft her
    // funnel, with a hangar forward of it and a heavy crane to starboard to
    // fish them out of the water again. She flew them as scouts -- which is
    // what a heavy cruiser's aircraft were for -- so they go out to look, and
    // what they carry is enough to be a nuisance to a destroyer rather than a
    // threat to anything bigger.
    planes: {
      squadrons: 2, perSquadron: 2, cruiseSpeed: 54, strikeRange: 8500,
      rearm: 110, hp: 620, dropSpread: 0.07,
      torpDamage: 0, torpSpeed: 0, torpRange: 0, floodChance: 0,
      bombDamage: 700, bombHit: 0.28, bombFire: 0.12,
      catapult: true, deckRun: 9.4, deckCycle: 34,
      runHeight: 20,
      // Where the shot leaves her. Her catapult lies across the ship, so her
      // scouts go off the beam, not off the bow -- measured off the same
      // integrated shot the model on deck flies.
      runOut: 128, runBearing: 1.42,
      flight: { fighters: 0, dive: 2, torpedo: 0 },
    },
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
    // Three 16"/50 triples. A turret this size is blast-limited as much as it is
    // structurally limited, so the heaviest guns on the list have the least of
    // the horizon to shoot at.
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
      { id: 0, name: 'A', x: 0, z: 78, angle: 0, arc: 2.36, guns: 3 },
      { id: 1, name: 'B', x: 0, z: 58, angle: 0, arc: 2.27, guns: 3 },
      { id: 2, name: 'Y', x: 0, z: -74, angle: Math.PI, arc: 2.36, guns: 3 },
    ],
    gun: {
      name: '16"/50 Mk 7', role: 'surface',
      caliber: 406, reload: 26, traverse: 0.09, range: 21600, sigma: 1.35,
      shells: shells(406, 13500, 6300, 640, 762, 0.28),
    },
    torpedoes: null,
    // Twenty five-inch in ten twin mounts, five a side. A battleship's
    // secondary battery is a destroyer's main one, and it fires on its own.
    secondary: {
      name: '5"/38 Mk 28', role: 'dp',
      caliber: 127, reload: 3.8, traverse: 0.44, range: 8600, sigma: 1.2,
      shells: shells(127, 2000, 1750, 80, 792, 0.08),
      mounts: [
        { x: -11.2, z: 42, angle: -Math.PI / 2, arc: 1.48, guns: 2 },
        { x: 11.2, z: 42, angle: Math.PI / 2, arc: 1.48, guns: 2 },
        { x: -11.6, z: 24, angle: -Math.PI / 2, arc: 1.40, guns: 2 },
        { x: 11.6, z: 24, angle: Math.PI / 2, arc: 1.40, guns: 2 },
        { x: -11.6, z: 4, angle: -Math.PI / 2, arc: 1.31, guns: 2 },
        { x: 11.6, z: 4, angle: Math.PI / 2, arc: 1.31, guns: 2 },
        { x: -11.4, z: -16, angle: -Math.PI / 2, arc: 1.40, guns: 2 },
        { x: 11.4, z: -16, angle: Math.PI / 2, arc: 1.40, guns: 2 },
        { x: -10.8, z: -38, angle: -Math.PI / 2, arc: 1.48, guns: 2 },
        { x: 10.8, z: -38, angle: Math.PI / 2, arc: 1.48, guns: 2 },
      ],
    },
    aa: {
      range: 5600, dps: 100,
      guns: [
        { name: '40mm Bofors', caliber: 40, role: 'aa', reload: 0.24, range: 3600,
          mounts: [
            { x: -13.0, z: 62, angle: -1.0, arc: 2.09, guns: 4 },
            { x: 13.0, z: 62, angle: 1.0, arc: 2.09, guns: 4 },
            { x: -14.0, z: 34, angle: -Math.PI / 2, arc: 1.75, guns: 4 },
            { x: 14.0, z: 34, angle: Math.PI / 2, arc: 1.75, guns: 4 },
            { x: -14.2, z: 12, angle: -Math.PI / 2, arc: 1.75, guns: 4 },
            { x: 14.2, z: 12, angle: Math.PI / 2, arc: 1.75, guns: 4 },
            { x: -14.0, z: -10, angle: -Math.PI / 2, arc: 1.75, guns: 4 },
            { x: 14.0, z: -10, angle: Math.PI / 2, arc: 1.75, guns: 4 },
            { x: -13.4, z: -30, angle: -Math.PI / 2, arc: 1.75, guns: 4 },
            { x: 13.4, z: -30, angle: Math.PI / 2, arc: 1.75, guns: 4 },
            { x: -12.0, z: -52, angle: -2.1, arc: 2.09, guns: 4 },
            { x: 12.0, z: -52, angle: 2.1, arc: 2.09, guns: 4 },
            { x: -9.0, z: -84, angle: -2.4, arc: 2.09, guns: 4 },
            { x: 9.0, z: -84, angle: 2.4, arc: 2.09, guns: 4 },
            { x: 0, z: 92, angle: 0, arc: 2.36, guns: 4 },
            { x: 0, z: -96, angle: Math.PI, arc: 2.36, guns: 4 },
            { x: -6.0, z: 74, angle: -0.7, arc: 2.09, guns: 4 },
            { x: 6.0, z: 74, angle: 0.7, arc: 2.09, guns: 4 },
            { x: -6.0, z: -68, angle: -2.4, arc: 2.09, guns: 4 },
            { x: 6.0, z: -68, angle: 2.4, arc: 2.09, guns: 4 },
          ] },
        { name: '20mm Oerlikon', caliber: 20, role: 'aa', reload: 0.1, range: 1800,
          mounts: [
            { x: -14.6, z: 50, angle: -Math.PI / 2, arc: 1.83, guns: 7 },
            { x: 14.6, z: 50, angle: Math.PI / 2, arc: 1.83, guns: 7 },
            { x: -15.0, z: 20, angle: -Math.PI / 2, arc: 1.83, guns: 7 },
            { x: 15.0, z: 20, angle: Math.PI / 2, arc: 1.83, guns: 7 },
            { x: -14.8, z: -12, angle: -Math.PI / 2, arc: 1.83, guns: 7 },
            { x: 14.8, z: -12, angle: Math.PI / 2, arc: 1.83, guns: 7 },
            { x: 0, z: -78, angle: Math.PI, arc: 2.27, guns: 7 },
          ] },
      ],
    },
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

  enterprise: {
    // Five-inch singles in galleries down both sides of the flight deck, which
    // is why the two mountings here fire outboard and nowhere else: the deck is
    // in the way of everything across the ship.
    //
    // The Big E: Yorktown class, three of which were built and one of which
    // came home. She was at Midway, at the Eastern Solomons, at Santa Cruz and
    // at Guadalcanal, and by the end of 1942 she was the only American carrier
    // left afloat in the Pacific -- with a sign on the hangar deck that read
    // "Enterprise vs Japan".
    id: 'enterprise',
    name: 'Enterprise',
    fullName: 'USS Enterprise CV-6',
    className: 'Yorktown',
    type: 'CV',
    typeName: 'Aircraft Carrier',
    nation: 'usa',
    blurb: 'Fights at ranges nothing else can reach. Caught alone on the surface, it is a very large target.',
    hull: { length: 262, beam: 26, draft: 7.9, superstructure: 0.55, flightDeck: true },
    hp: 48200,
    maxSpeed: 32.5 * KNOTS,
    reverseSpeed: 7 * KNOTS,
    accel: 0.54,
    turnRate: 0.062,
    rudderShift: 10.5,
    speedLossInTurn: 0.18,
    concealment: 14400,
    fireDetectPenalty: 5200,
    radarRange: 15000,
    repairCooldown: 90,
    repairHeal: 0.1,
    smokeCharges: 0,
    // Thinner than an Essex everywhere: the Yorktowns were built to a treaty
    // displacement and paid for their speed and their air group in plating.
    armor: { belt: 102, deck: 60, citadel: 102, bow: 19, superstructure: 16 },
    // Eight 5"/38 singles in four sponsons at the corners of the flight deck,
    // where they actually were. None of them can fire across the ship -- the
    // deck is in the way -- so each is laid abeam and stops well short of the
    // centreline, which is why a Yorktown was always short of guns on the
    // engaged side and had to turn to bring the other four to bear.
    turrets: [
      { id: 0, name: 'S1', x: -15.4, z: 82.0, angle: -Math.PI / 2, arc: 1.32, guns: 1 },
      { id: 1, name: 'S2', x: -15.4, z: 75.2, angle: -Math.PI / 2, arc: 1.32, guns: 1 },
      { id: 2, name: 'S3', x: -15.4, z: -59.5, angle: -Math.PI / 2, arc: 1.32, guns: 1 },
      { id: 3, name: 'S4', x: -15.4, z: -66.3, angle: -Math.PI / 2, arc: 1.32, guns: 1 },
      { id: 4, name: 'P1', x: 15.4, z: 71.5, angle: Math.PI / 2, arc: 1.32, guns: 1 },
      { id: 5, name: 'P2', x: 15.4, z: 64.7, angle: Math.PI / 2, arc: 1.32, guns: 1 },
      { id: 6, name: 'P3', x: 15.4, z: -70.0, angle: Math.PI / 2, arc: 1.32, guns: 1 },
      { id: 7, name: 'P4', x: 15.4, z: -76.8, angle: Math.PI / 2, arc: 1.32, guns: 1 },
    ],
    gun: {
      name: '5"/38 Mk 21', role: 'dp',
      caliber: 127, reload: 4.2, traverse: 0.44, range: 10600, sigma: 2.2,
      shells: shells(127, 2000, 1750, 80, 792, 0.08),
    },
    torpedoes: null,
    // Her eight five-inch are the main battery above; there is no secondary
    // gun on a carrier, only the light battery round her galleries.
    secondary: null,
    aa: {
      range: 5800, dps: 152,
      guns: [
        { name: '40mm Bofors', caliber: 40, role: 'aa', reload: 0.24, range: 3600,
          mounts: [
            { x: -14.0, z: 66, angle: -1.0, arc: 2.09, guns: 4 },
            { x: 14.0, z: 66, angle: 1.0, arc: 2.09, guns: 4 },
            { x: -15.6, z: 30, angle: -Math.PI / 2, arc: 1.75, guns: 4 },
            { x: 15.6, z: 30, angle: Math.PI / 2, arc: 1.75, guns: 4 },
            { x: -15.8, z: 0, angle: -Math.PI / 2, arc: 1.75, guns: 4 },
            { x: 15.8, z: 0, angle: Math.PI / 2, arc: 1.75, guns: 4 },
            { x: -15.4, z: -34, angle: -Math.PI / 2, arc: 1.75, guns: 4 },
            { x: 15.4, z: -34, angle: Math.PI / 2, arc: 1.75, guns: 4 },
          ] },
        { name: '20mm Oerlikon', caliber: 20, role: 'aa', reload: 0.1, range: 1800,
          mounts: [
            { x: -16.0, z: 78, angle: -0.9, arc: 1.92, guns: 6 },
            { x: 16.0, z: 78, angle: 0.9, arc: 1.92, guns: 6 },
            { x: -16.6, z: 46, angle: -Math.PI / 2, arc: 1.83, guns: 6 },
            { x: 16.6, z: 46, angle: Math.PI / 2, arc: 1.83, guns: 6 },
            { x: -16.8, z: -16, angle: -Math.PI / 2, arc: 1.83, guns: 6 },
            { x: 16.8, z: -16, angle: Math.PI / 2, arc: 1.83, guns: 6 },
            { x: -15.0, z: -70, angle: -2.3, arc: 1.92, guns: 5 },
            { x: 15.0, z: -70, angle: 2.3, arc: 1.92, guns: 5 },
          ] },
      ],
    },
    planes: {
      squadrons: 3, perSquadron: 4, cruiseSpeed: 78, strikeRange: 14000,
      // Where and how high her deck run leaves an aeroplane, measured off the
      // integrated launch the model on her deck actually flies -- so the
      // aeroplane the formation starts drawing is the one that just went off
      // the bow, in the same place at the same height.
      runOut: 156, runHeight: 41,
      rearm: 42, torpDamage: 8600, torpSpeed: 26 * KNOTS, torpRange: 2600,
      floodChance: 0.25, hp: 1400, dropSpread: 0.05,
      // What a dive bomber does when it gets there: a thousand-pound bomb is
      // not a torpedo -- less damage, no flooding, but it does not have to get
      // down on the water to deliver it, and it starts fires.
      bombDamage: 4200, bombHit: 0.42, bombFire: 0.34,
      // The air group she sails with. A captain may re-balance it in the yard
      // between fighters, dive bombers and torpedo bombers, inside these
      // limits: twelve aircraft in all, and she must embark something that can
      // hit a ship or there is no point sending her.
      group: {
        total: 12,
        min: { fighters: 0, dive: 0, torpedo: 0 },
        max: { fighters: 8, dive: 8, torpedo: 8 },
        minStrike: 2,
        // Her Midway loadout: a squadron of each.
        default: { fighters: 4, dive: 4, torpedo: 4 },
      },
    },
    datasheet: {
      displacement: 19800,
      // The air group is the armament that matters; `planes` above carries it.
      aircraft: 0,
      mainRounds: 3200,
      secondary: { caliber: 127, label: '5"', barrels: 8, rounds: 2400 },
      tertiary: [
        { caliber: 40, label: '40mm', barrels: 32, rounds: 38400 },
        { caliber: 20, label: '20mm', barrels: 46, rounds: 110400 },
      ],
    },
  },
};

export const SHIP_ORDER = ['fletcher', 'cleveland', 'hipper', 'iowa', 'enterprise'];

export function getClass(id) {
  return SHIP_CLASSES[id] || SHIP_CLASSES.fletcher;
}

/** Total number of barrels that can bear, used for the UI salvo readout. */
export function totalGuns(cls) {
  return cls.turrets.reduce((n, t) => n + t.guns, 0);
}

export const SHELL_TYPES = { AP, HE };
