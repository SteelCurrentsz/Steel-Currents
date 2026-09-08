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
    // `fuseArm` is the plate an armour-piercing shell has to meet to start its
    // fuse at all. Anything thinner and the shell goes in one side and out the
    // other with the fuse still asleep, and bursts in the sea beyond -- which
    // is the overpenetration, and it is why a battleship firing armour-piercing
    // at a destroyer does almost nothing to her. About a sixth of the bore is
    // the figure the fuses were actually set to.
    [AP]: { type: AP, caliber, damage: apDamage, pen, velocity, fuseArm: Math.round(caliber / 6), fireChance: 0.02, drag: 0.0022 },
    [HE]: { type: HE, caliber, damage: heDamage, pen: Math.round(caliber / 6), velocity: velocity * 0.96, fuseArm: 0, fireChance, drag: 0.0026 },
  };
}

// Where a gun's muzzle is.
//
// `reach` is how far the muzzle stands out from the axis the mounting trains
// about, and each mounting's `my` is the height of its own muzzle above the
// waterline. Both are measured off the built model -- there is a check that
// walks every ship and compares the two -- because the simulation has no model
// and has to put the shell somewhere. It used to put it at the middle of the
// mounting, eleven metres up plus a fudge for how tall her superstructure is,
// which on a heavy cruiser was six metres above the gun and on a destroyer a
// good deal forward of it. A shell now leaves the muzzle it was fired from.

// How much bigger than her real self the Iowa is drawn and fought.
const BIG = 1.55;

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
      { id: 0, name: 'A', x: 0, z: 32, angle: 0, arc: 2.46, guns: 1, my: 7.36 },
      { id: 1, name: 'B', x: 0, z: 24, angle: 0, arc: 2.39, guns: 1, my: 9.64 },
      { id: 2, name: 'X', x: 0, z: -28, angle: Math.PI, arc: 2.44, guns: 1, my: 8.55 },
      { id: 3, name: 'Y', x: 0, z: -37, angle: Math.PI, arc: 2.36, guns: 1, my: 9.40 },
      { id: 4, name: 'Z', x: 0, z: -45, angle: Math.PI, arc: 2.27, guns: 1, my: 5.93 },
    ],
    gun: {
      name: '5"/38 Mk 30', role: 'dp',
      reach: 6.87,
      caliber: 127, reload: 3.4, traverse: 0.52, range: 11800, sigma: 1.9,
      shells: shells(127, 2100, 1800, 80, 792, 0.08),
    },
    torpedoes: {
      mounts: [
        { id: 0, x: 0, z: -3, angle: 0, arc: 2.44, tubes: 5, my: 5.99 },
        { id: 1, x: 0, z: -19, angle: 0, arc: 2.44, tubes: 5, my: 5.81 },
      ],
      name: 'Mk 15 torpedo', role: 'surface', caliber: 533,
      reach: 3.97,
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
        // Seven single Oerlikons: four round the bridge on the 01 level, two
        // in the waist at the deck edge, one right forward on the forecastle.
        // Written one mounting to a gun, because that is how she carried them
        // and how a captain picks one out of the arsenal.
        { name: '20mm Oerlikon', caliber: 20, role: 'aa', reload: 0.12, range: 1800,
          mounts: [
            { x: -3.5, z: 19, angle: -1.1, arc: 1.92, guns: 1 },
            { x: 3.5, z: 19, angle: 1.1, arc: 1.92, guns: 1 },
            { x: -3.5, z: 7, angle: -1.1, arc: 1.92, guns: 1 },
            { x: 3.5, z: 7, angle: 1.1, arc: 1.92, guns: 1 },
            { x: -3.75, z: -24, angle: -1.1, arc: 1.83, guns: 1 },
            { x: 3.75, z: -24, angle: 1.1, arc: 1.83, guns: 1 },
            { x: 0, z: 28, angle: 0, arc: 2.09, guns: 1 },
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
      { id: 0, name: 'A', x: 0, z: 58, angle: 0, arc: 2.62, guns: 3, my: 12.46 },
      { id: 1, name: 'B', x: 0, z: 44, angle: 0, arc: 2.62, guns: 3, my: 15.56 },
      { id: 2, name: 'X', x: 0, z: -42, angle: Math.PI, arc: 2.53, guns: 3, my: 14.16 },
      { id: 3, name: 'Y', x: 0, z: -56, angle: Math.PI, arc: 2.44, guns: 3, my: 10.36 },
    ],
    gun: {
      name: '6"/47 Mk 16', role: 'surface',
      reach: 11.43,
      caliber: 152, reload: 6.4, traverse: 0.31, range: 15400, sigma: 1.7,
      shells: shells(152, 3300, 2500, 165, 812, 0.12),
    },
    torpedoes: null,
    // Twelve five-inch in six twin mounts: one superfiring forward, one aft,
    // and four in the waist that can only fire on their own side.
    secondary: {
      name: '5"/38 Mk 32', role: 'dp',
      reach: 7.34,
      caliber: 127, reload: 4.0, traverse: 0.44, range: 8200, sigma: 1.15,
      shells: shells(127, 1900, 1650, 76, 792, 0.07),
      mounts: [
        { x: 0, z: 32.5, angle: 0, arc: 2.44, guns: 2, my: 15.05 },
        { x: 0, z: -27.0, angle: Math.PI, arc: 2.36, guns: 2, my: 17.95 },
        { x: -6.7, z: 6.0, angle: -Math.PI / 2, arc: 1.40, guns: 2, my: 15.05 },
        { x: 6.7, z: 6.0, angle: Math.PI / 2, arc: 1.40, guns: 2, my: 15.05 },
        { x: -6.7, z: -8.5, angle: -Math.PI / 2, arc: 1.40, guns: 2, my: 15.05 },
        { x: 6.7, z: -8.5, angle: Math.PI / 2, arc: 1.40, guns: 2, my: 15.05 },
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
            // Abreast turret 2 and abreast turret 4, both at the deck edge
            // as it actually runs -- her quarterdeck is narrower than her
            // forecastle, so the after pair stands further in.
            { x: -6.98, z: 50.0, angle: -0.8, arc: 1.92, guns: 2 },
            { x: 6.98, z: 50.0, angle: 0.8, arc: 1.92, guns: 2 },
            { x: -6.28, z: -50.0, angle: -2.3, arc: 1.92, guns: 2 },
            { x: 6.28, z: -50.0, angle: 2.3, arc: 1.92, guns: 2 },
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
      // A scout carries a couple of hundred pounds under each wing. It will
      // beat a destroyer's deck and it will not beat anything else's.
      bombDamage: 900, bombHit: 0.32, bombFire: 0.1, bombPen: 25, bombBore: 0.2,
      // Off a catapult, not down a flight deck: the whole evolution is the
      // catapult training out, the engine running up and the shot itself.
      // What she actually flies. A cruiser's scout is a float plane on a
      // catapult, and drawing her as whatever the carrier happens to have in
      // the same role -- which is what happened, and the role is `dive` -- put
      // a Dauntless dive bomber in the air off a battleship's quarterdeck.
      type: 'kingfisher',
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
      { id: 0, name: 'A', x: 0, z: 56.6, angle: 0, arc: 2.44, guns: 2, my: 7.98 },
      { id: 1, name: 'B', x: 0, z: 46.3, angle: 0, arc: 2.36, guns: 2, my: 11.08 },
      { id: 2, name: 'X', x: 0, z: -48.9, angle: Math.PI, arc: 2.36, guns: 2, my: 11.78 },
      { id: 3, name: 'Y', x: 0, z: -62.2, angle: Math.PI, arc: 2.27, guns: 2, my: 7.78 },
    ],
    gun: {
      name: '20.3 cm SK C/34', role: 'surface',
      reach: 13.06,
      caliber: 203, reload: 11.2, traverse: 0.24, range: 17200, sigma: 1.6,
      shells: shells(203, 5100, 3300, 265, 925, 0.14),
    },
    torpedoes: {
      mounts: [
        { id: 0, x: -8, z: -4, angle: -Math.PI / 2, arc: 1.22, tubes: 3, my: 7.17 },
        { id: 1, x: 8, z: -4, angle: Math.PI / 2, arc: 1.22, tubes: 3, my: 7.17 },
      ],
      name: 'G7a torpedo', role: 'surface', caliber: 533,
      reach: 4.55,
      traverse: 0.26,
      reload: 78, damage: 13700, speed: 32 * KNOTS, range: 6000,
      detection: 1300, arming: 400, spread: 0.07, floodChance: 0.35,
    },
    // Six twin 10.5 cm on the beam: three a side, and none of them can fire
    // across her.
    secondary: {
      name: '10.5 cm SK C/33', role: 'dp',
      reach: 5.38,
      caliber: 105, reload: 4.6, traverse: 0.40, range: 7600, sigma: 1.05,
      shells: shells(105, 1500, 1300, 62, 900, 0.06),
      // Abreast the bridge, abreast the funnel and abreast the after tower,
      // which is where her drawing puts the three pairs.
      mounts: [
        { x: -8.4, z: 32, angle: -Math.PI / 2, arc: 1.40, guns: 2, my: 14.35 },
        { x: 8.4, z: 32, angle: Math.PI / 2, arc: 1.40, guns: 2, my: 14.35 },
        { x: -8.6, z: 0, angle: -Math.PI / 2, arc: 1.31, guns: 2, my: 14.33 },
        { x: 8.6, z: 0, angle: Math.PI / 2, arc: 1.31, guns: 2, my: 14.33 },
        { x: -8.2, z: -40, angle: -Math.PI / 2, arc: 1.40, guns: 2, my: 14.33 },
        { x: 8.2, z: -40, angle: Math.PI / 2, arc: 1.40, guns: 2, my: 14.33 },
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
      bombDamage: 700, bombHit: 0.28, bombFire: 0.12, bombPen: 22, bombBore: 0.18,
      type: 'arado',
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

  // The odd ship out, and she was built to be. A Panzerschiff is a cruiser
  // hull carrying a battleship's guns, at a range no cruiser can answer: two
  // triple eleven-inch turrets on twelve and a half thousand tons, diesel
  // engines to give her the endurance to be a nuisance in the South Atlantic,
  // and just enough belt to keep six-inch out. What she cannot do is take a
  // hit. Anything that gets through her eighty millimetres is in her
  // machinery, and the Exeter proved it.
  spee: {
    id: 'spee',
    name: 'Admiral Graf Spee',
    type: 'CA',
    typeName: 'Panzerschiff',
    nation: 'ger',
    blurb: 'Eleven-inch guns on a cruiser hull: she outranges anything that can catch her and outruns anything that can hurt her.',
    hull: { length: 186, beam: 21.6, draft: 7.4, superstructure: 1.35 },
    hp: 31600,
    maxSpeed: 28.5 * KNOTS,
    reverseSpeed: 8 * KNOTS,
    accel: 0.7,
    turnRate: 0.076,
    rudderShift: 7.6,
    speedLossInTurn: 0.21,
    concealment: 12600,
    fireDetectPenalty: 5200,
    // She carried the first seagoing radar set in service, and it is the one
    // thing she has that nothing else on this list does.
    radarRange: 14000,
    repairCooldown: 84,
    repairHeal: 0.1,
    smokeCharges: 0,
    // Thin. Eighty millimetres keeps six-inch out at a decent range and does
    // nothing whatever about eight-inch, which is the whole argument about the
    // type -- and her turret faces are thicker than her belt.
    armor: { belt: 80, deck: 40, citadel: 80, bow: 18, superstructure: 15 },
    turrets: [
      // Two triples, one forward and one aft, both at upper deck level: there
      // is no superfiring turret on her, because there is no second turret at
      // either end to superfire over.
      //
      // Stations read off the profile in her plan rather than off a scale bar:
      // Anton's roof runs from forty-five metres forward of amidships to
      // fifty-one, her sloped face from fifty-two to fifty-five, and her rear
      // plate stands at forty-three with a notch of open deck between it and
      // the bridge block. That puts her roller path at forty-eight and a half,
      // four metres abaft where a reading off the scale bar had put it, and it
      // is what closed the strip of bare deck that used to show between her
      // and the bridge. Bruno's roof runs from forty to forty-five abaft.
      { id: 0, name: 'Anton', x: 0, z: 48.5, angle: 0, arc: 2.48, guns: 3, my: 10.49 },
      { id: 1, name: 'Bruno', x: 0, z: -42.0, angle: Math.PI, arc: 2.44, guns: 3, my: 9.86 },
    ],
    gun: {
      name: '28 cm SK C/34', role: 'surface',
      reach: 14.6,
      // Slow, because eleven-inch bag charges are slow, and the whole of her
      // tactics follow from it: she has to hit at a range where the answer
      // cannot reach her, because she cannot afford a gunnery duel.
      caliber: 283, reload: 16.5, traverse: 0.18, range: 19800, sigma: 1.72,
      shells: shells(283, 8200, 5100, 372, 910, 0.16),
    },
    torpedoes: {
      // Two quadruple banks on the quarterdeck, abaft the after turret. An
      // afterthought on a commerce raider and a real threat at close quarters.
      mounts: [
        { id: 0, x: -4.2, z: -68, angle: -Math.PI / 2, arc: 1.27, tubes: 4, my: 6.28 },
        { id: 1, x: 4.2, z: -68, angle: Math.PI / 2, arc: 1.27, tubes: 4, my: 6.28 },
      ],
      name: 'G7a torpedo', role: 'surface', caliber: 533,
      reach: 4.6,
      traverse: 0.24,
      reload: 84, damage: 13700, speed: 32 * KNOTS, range: 6000,
      detection: 1300, arming: 400, spread: 0.07, floodChance: 0.35,
    },
    // Eight single 15 cm in open shielded mounts, four a side along her upper
    // deck. They are surface guns and nothing else: the mounting will not
    // elevate to an aeroplane, which is exactly why she carries a separate
    // heavy anti-aircraft battery and the Hipper does not.
    secondary: {
      name: '15 cm SK C/28', role: 'surface',
      reach: 6.6,
      caliber: 150, reload: 6.4, traverse: 0.32, range: 9800, sigma: 1.1,
      shells: shells(150, 3100, 2400, 152, 875, 0.11),
      // Four a side in the walkway at the deck edge, spread between the two
      // turrets the way her plan spreads them: abreast the bridge, abreast the
      // funnel, abreast the catapult and abreast the after works.
      mounts: [
        { x: -9.0, z: 36, angle: -Math.PI / 2, arc: 1.36, guns: 1, my: 6.48 },
        { x: 9.0, z: 36, angle: Math.PI / 2, arc: 1.36, guns: 1, my: 6.48 },
        { x: -9.6, z: 16, angle: -Math.PI / 2, arc: 1.29, guns: 1, my: 6.42 },
        { x: 9.6, z: 16, angle: Math.PI / 2, arc: 1.29, guns: 1, my: 6.42 },
        { x: -9.6, z: -12, angle: -Math.PI / 2, arc: 1.29, guns: 1, my: 6.42 },
        { x: 9.6, z: -12, angle: Math.PI / 2, arc: 1.29, guns: 1, my: 6.42 },
        { x: -9.2, z: -32, angle: -Math.PI / 2, arc: 1.36, guns: 1, my: 6.44 },
        { x: 9.2, z: -32, angle: Math.PI / 2, arc: 1.36, guns: 1, my: 6.44 },
      ],
    },
    aa: {
      range: 6000, dps: 46,
      guns: [
        // Three twin 10.5 cm: one each side abreast the funnel and one right
        // aft. These are her long-range flak, because her fifteens will not
        // point up.
        // Three twin 10.5 cm: one each side abreast the funnel, on sponsons
        // off the superstructure deck, and one right aft on the roof of the
        // after control position. These are her long-range flak, because her
        // fifteens will not point up.
        { name: '10.5 cm SK C/33', caliber: 105, role: 'aa', reload: 4.2, range: 6000,
          mounts: [
            { x: -7.6, z: 5, angle: -Math.PI / 2, arc: 1.66, guns: 2 },
            { x: 7.6, z: 5, angle: Math.PI / 2, arc: 1.66, guns: 2 },
            { x: 0, z: -27, angle: Math.PI, arc: 2.09, guns: 2 },
          ] },
        // Two on the funnel platform, where her profile stands them, and two
        // on the after superstructure.
        { name: '3.7 cm SK C/30', caliber: 37, role: 'aa', reload: 0.7, range: 3000,
          mounts: [
            { x: -3.9, z: 10, angle: -1.15, arc: 1.92, guns: 2 },
            { x: 3.9, z: 10, angle: 1.15, arc: 1.92, guns: 2 },
            { x: -5.4, z: -22, angle: -1.85, arc: 1.92, guns: 2 },
            { x: 5.4, z: -22, angle: 1.85, arc: 1.92, guns: 2 },
          ] },
        // Ten single 2 cm, spread from the forecastle to the quarterdeck the
        // way the plan spreads them.
        { name: '2 cm Flak 30', caliber: 20, role: 'aa', reload: 0.1, range: 1700,
          mounts: [
            { x: -5.4, z: 40, angle: -1.0, arc: 1.83, guns: 1 },
            { x: 5.4, z: 40, angle: 1.0, arc: 1.83, guns: 1 },
            { x: -6.2, z: 18, angle: -1.5, arc: 1.83, guns: 1 },
            { x: 6.2, z: 18, angle: 1.5, arc: 1.83, guns: 1 },
            { x: -6.2, z: -6, angle: -1.5, arc: 1.83, guns: 1 },
            { x: 6.2, z: -6, angle: 1.5, arc: 1.83, guns: 1 },
            { x: -5.8, z: -32, angle: -1.9, arc: 1.83, guns: 1 },
            { x: 5.8, z: -32, angle: 1.9, arc: 1.83, guns: 1 },
            { x: -4.0, z: -55, angle: -2.1, arc: 1.83, guns: 1 },
            { x: 4.0, z: -55, angle: 2.1, arc: 1.83, guns: 1 },
          ] },
      ],
    },
    // Two Arados off a single catapult abaft the funnel. A commerce raider
    // lives by seeing further than she is seen, so they go out to look.
    planes: {
      squadrons: 1, perSquadron: 2, cruiseSpeed: 54, strikeRange: 9200,
      rearm: 120, hp: 600, dropSpread: 0.07,
      torpDamage: 0, torpSpeed: 0, torpRange: 0, floodChance: 0,
      bombDamage: 700, bombHit: 0.26, bombFire: 0.12, bombPen: 22, bombBore: 0.18,
      type: 'arado',
      catapult: true, deckRun: 9.4, deckCycle: 36,
      runHeight: 19,
      runOut: 122, runBearing: 1.42,
      flight: { fighters: 0, dive: 2, torpedo: 0 },
    },
    datasheet: {
      displacement: 16020,
      aircraft: 2,
      mainRounds: 600,
      torpedoesCarried: 8,
      secondary: { caliber: 150, label: '150mm', barrels: 8, rounds: 6400 },
      tertiary: [
        { caliber: 105, label: '105mm', barrels: 6, rounds: 12000 },
        { caliber: 37, label: '37mm', barrels: 8, rounds: 16000 },
        { caliber: 20, label: '20mm', barrels: 10, rounds: 12000 },
      ],
    },
  },

  // She is drawn a third again as big as the ship that was built, and the
  // simulation has to agree with the model about how big that is: her lines,
  // her stations and every mounting on her carry the same factor. It lives in
  // one place here and one in her renderer, and the two are checked against
  // each other.
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
    hull: {
      length: 270 * BIG, beam: 33 * BIG, draft: 11 * BIG, superstructure: 1.35,
    },
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
      { id: 0, name: 'A', x: 0, z: 78 * BIG, angle: 0, arc: 2.36, guns: 3, my: 19.69 },
      { id: 1, name: 'B', x: 0, z: 58 * BIG, angle: 0, arc: 2.27, guns: 3, my: 25.19 },
      { id: 2, name: 'Y', x: 0, z: -74 * BIG, angle: Math.PI, arc: 2.36, guns: 3, my: 16.70 },
    ],
    gun: {
      name: '16"/50 Mk 7', role: 'surface',
      reach: 27.87,
      caliber: 406, reload: 26, traverse: 0.09, range: 21600, sigma: 1.35,
      shells: shells(406, 13500, 6300, 640, 762, 0.28),
    },
    torpedoes: null,
    // Twenty five-inch in ten twin mounts, five a side. A battleship's
    // secondary battery is a destroyer's main one, and it fires on its own.
    secondary: {
      name: '5"/38 Mk 28', role: 'dp',
      // She is drawn a half again life size, hull and battery together, so a
      // 5"/38's muzzle stands eleven and a third metres out from the trunnion
      // rather than the seven and a third it did.
      reach: 11.37,
      caliber: 127, reload: 3.8, traverse: 0.44, range: 8600, sigma: 1.2,
      shells: shells(127, 2000, 1750, 80, 792, 0.08),
      // On sponsons off the 01 deck, five a side, spaced so no mount is
      // inside the next one's blast and every one of them has the deck edge
      // to itself. Her light battery goes between them, on the weather deck.
      mounts: [
        { x: -11.2 * BIG, z: 38 * BIG, angle: -Math.PI / 2, arc: 1.48, guns: 2, my: 22.35 },
        { x: 11.2 * BIG, z: 38 * BIG, angle: Math.PI / 2, arc: 1.48, guns: 2, my: 22.35 },
        { x: -11.6 * BIG, z: 22 * BIG, angle: -Math.PI / 2, arc: 1.40, guns: 2, my: 22.35 },
        { x: 11.6 * BIG, z: 22 * BIG, angle: Math.PI / 2, arc: 1.40, guns: 2, my: 22.35 },
        { x: -11.6 * BIG, z: 2 * BIG, angle: -Math.PI / 2, arc: 1.31, guns: 2, my: 22.35 },
        { x: 11.6 * BIG, z: 2 * BIG, angle: Math.PI / 2, arc: 1.31, guns: 2, my: 22.35 },
        { x: -11.6 * BIG, z: -18 * BIG, angle: -Math.PI / 2, arc: 1.40, guns: 2, my: 22.35 },
        { x: 11.6 * BIG, z: -18 * BIG, angle: Math.PI / 2, arc: 1.40, guns: 2, my: 22.35 },
        { x: -11.4 * BIG, z: -40 * BIG, angle: -Math.PI / 2, arc: 1.48, guns: 2, my: 22.35 },
        { x: 11.4 * BIG, z: -40 * BIG, angle: Math.PI / 2, arc: 1.48, guns: 2, my: 22.35 },
      ],
    },
    aa: {
      range: 5600, dps: 100,
      guns: [
        { name: '40mm Bofors', caliber: 40, role: 'aa', reload: 0.24, range: 3600,
          // Twenty quads. Two abreast turret two on the raised forecastle
          // deck, seven pairs down the weather deck outboard of her house,
          // and two on the centreline -- one on the forecastle clear of
          // turret A's muzzles, one on the fantail clear of turret Y's.
          mounts: [
            { x: -7.0 * BIG, z: 48 * BIG, angle: -1.0, arc: 2.09, guns: 4 },
            { x: 7.0 * BIG, z: 48 * BIG, angle: 1.0, arc: 2.09, guns: 4 },
            { x: -11.7 * BIG, z: 30 * BIG, angle: -Math.PI / 2, arc: 1.75, guns: 4 },
            { x: 11.7 * BIG, z: 30 * BIG, angle: Math.PI / 2, arc: 1.75, guns: 4 },
            { x: -12.6 * BIG, z: 12 * BIG, angle: -Math.PI / 2, arc: 1.75, guns: 4 },
            { x: 12.6 * BIG, z: 12 * BIG, angle: Math.PI / 2, arc: 1.75, guns: 4 },
            { x: -13.2 * BIG, z: -8 * BIG, angle: -Math.PI / 2, arc: 1.75, guns: 4 },
            { x: 13.2 * BIG, z: -8 * BIG, angle: Math.PI / 2, arc: 1.75, guns: 4 },
            { x: -13.2 * BIG, z: -28 * BIG, angle: -Math.PI / 2, arc: 1.75, guns: 4 },
            { x: 13.2 * BIG, z: -28 * BIG, angle: Math.PI / 2, arc: 1.75, guns: 4 },
            { x: -12.5 * BIG, z: -50 * BIG, angle: -2.1, arc: 2.09, guns: 4 },
            { x: 12.5 * BIG, z: -50 * BIG, angle: 2.1, arc: 2.09, guns: 4 },
            { x: -9.0 * BIG, z: -84 * BIG, angle: -2.4, arc: 2.09, guns: 4 },
            { x: 9.0 * BIG, z: -84 * BIG, angle: 2.4, arc: 2.09, guns: 4 },
            { x: 0, z: 100 * BIG, angle: 0, arc: 2.36, guns: 4 },
            { x: 0, z: -104 * BIG, angle: Math.PI, arc: 2.36, guns: 4 },
            { x: -5.7 * BIG, z: 69 * BIG, angle: -0.7, arc: 2.09, guns: 4 },
            { x: 5.7 * BIG, z: 69 * BIG, angle: 0.7, arc: 2.09, guns: 4 },
            { x: -6.0 * BIG, z: -64 * BIG, angle: -2.4, arc: 2.09, guns: 4 },
            { x: 6.0 * BIG, z: -64 * BIG, angle: 2.4, arc: 2.09, guns: 4 },
          ] },
        { name: '20mm Oerlikon', caliber: 20, role: 'aa', reload: 0.1, range: 1800,
          // Seven galleries of them: three a side along the 01 deck edge,
          // between the five-inch mounts and the house, and one across the
          // fantail. A gallery is a row of guns, and it is drawn as one.
          mounts: [
            { x: -7.8 * BIG, z: 30 * BIG, angle: -Math.PI / 2, arc: 1.83, guns: 7 },
            { x: 7.8 * BIG, z: 30 * BIG, angle: Math.PI / 2, arc: 1.83, guns: 7 },
            { x: -7.8 * BIG, z: -4 * BIG, angle: -Math.PI / 2, arc: 1.83, guns: 7 },
            { x: 7.8 * BIG, z: -4 * BIG, angle: Math.PI / 2, arc: 1.83, guns: 7 },
            { x: -7.8 * BIG, z: -32 * BIG, angle: -Math.PI / 2, arc: 1.83, guns: 7 },
            { x: 7.8 * BIG, z: -32 * BIG, angle: Math.PI / 2, arc: 1.83, guns: 7 },
            { x: 0, z: -114 * BIG, angle: Math.PI, arc: 2.27, guns: 7 },
          ] },
      ],
    },
    // Three Kingfishers off the two catapults on her quarterdeck. She is a
    // battleship rather than a carrier: they are her eyes, and the only thing
    // a captain does with them is throw them off and get them back.
    planes: {
      squadrons: 2, perSquadron: 2, cruiseSpeed: 58, strikeRange: 9600,
      rearm: 95, hp: 640, dropSpread: 0.06,
      torpDamage: 0, torpSpeed: 0, torpRange: 0, floodChance: 0,
      // A scout carries a couple of hundred pounds under each wing. It will
      // beat a destroyer's deck and it will not beat anything else's.
      bombDamage: 900, bombHit: 0.32, bombFire: 0.1, bombPen: 25, bombBore: 0.2,
      // Off a catapult, not down a flight deck: the whole evolution is the
      // catapult training out, the engine running up and the shot itself.
      type: 'kingfisher',
      catapult: true, deckRun: 8.6, deckCycle: 30,
      runHeight: 22,
      runOut: 141, runBearing: 1.16,
      flight: { fighters: 0, dive: 2, torpedo: 0 },
    },
    datasheet: {
      // Her tonnage is the ship's own, not the model's: she is drawn larger
      // than she was built, and 45,000 tons is what she displaced.
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
    //
    // Thirty degrees each way, which is what the gallery leaves them. It was
    // seventy-six, and a gun swung that far came round into the flight deck
    // over its own head and into the sponson coaming beside it: the mounting
    // was training through the ship. The number is what her own model has room
    // for, measured off it rather than guessed.
    turrets: [
      { id: 0, name: 'S1', x: -15.4, z: 82.0, angle: -Math.PI / 2, arc: 0.52, guns: 1, my: 16.10 },
      { id: 1, name: 'S2', x: -15.4, z: 75.2, angle: -Math.PI / 2, arc: 0.52, guns: 1, my: 16.10 },
      { id: 2, name: 'S3', x: -15.4, z: -59.5, angle: -Math.PI / 2, arc: 0.52, guns: 1, my: 16.10 },
      { id: 3, name: 'S4', x: -15.4, z: -66.3, angle: -Math.PI / 2, arc: 0.52, guns: 1, my: 16.10 },
      { id: 4, name: 'P1', x: 15.4, z: 71.5, angle: Math.PI / 2, arc: 0.52, guns: 1, my: 16.10 },
      { id: 5, name: 'P2', x: 15.4, z: 64.7, angle: Math.PI / 2, arc: 0.52, guns: 1, my: 16.10 },
      { id: 6, name: 'P3', x: 15.4, z: -70.0, angle: Math.PI / 2, arc: 0.52, guns: 1, my: 16.10 },
      { id: 7, name: 'P4', x: 15.4, z: -76.8, angle: Math.PI / 2, arc: 0.52, guns: 1, my: 16.10 },
    ],
    gun: {
      name: '5"/38 Mk 21', role: 'dp',
      reach: 4.88,
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
        // Eight quads in their own tubs on the gallery deck: a pair right
        // forward on the bow gallery where a Yorktown was blindest, a pair
        // behind them, two abaft the island on the starboard deck edge, and
        // two aft. Where each stands is read off her model, because on a
        // carrier what is possible is decided by where the flight deck ends
        // and where the five-inch sponsons already are.
        { name: '40mm Bofors', caliber: 40, role: 'aa', reload: 0.24, range: 3600,
          mounts: [
            { x: 8.0, z: 119.2, angle: 0.00, arc: 2.09, guns: 4 },
            { x: -8.0, z: 119.2, angle: 0.00, arc: 2.09, guns: 4 },
            { x: 11.1, z: 104.8, angle: 0.00, arc: 2.09, guns: 4 },
            { x: -11.1, z: 104.8, angle: 0.00, arc: 2.09, guns: 4 },
            { x: -13.4, z: -1.3, angle: 3.14, arc: 2.09, guns: 4 },
            { x: -13.4, z: -14.4, angle: 3.14, arc: 2.09, guns: 4 },
            { x: 11.6, z: -107.4, angle: 3.14, arc: 2.09, guns: 4 },
            { x: -12.1, z: -104.8, angle: 3.14, arc: 2.09, guns: 4 },
          ] },
        // Forty-six Oerlikons in twenty-three positions, two guns to a
        // position: four positions in the island's own galleries and the rest
        // down both catwalks, wherever the sponsons and the forty-millimetre
        // tubs leave room. The two sides do not match, and on a Yorktown they
        // did not -- the island takes the room out of the starboard catwalk.
        { name: '20mm Oerlikon', caliber: 20, role: 'aa', reload: 0.1, range: 1800,
          mounts: [
            { x: -18.9, z: 22.5, angle: -1.40, arc: 1.92, guns: 2 },
            { x: -18.9, z: 26.3, angle: -1.40, arc: 1.92, guns: 2 },
            { x: -19.2, z: 5.9, angle: -1.40, arc: 1.92, guns: 2 },
            { x: -19.2, z: 12.3, angle: -1.40, arc: 1.92, guns: 2 },
            { x: -13.3, z: -112.1, angle: -1.50, arc: 1.92, guns: 2 },
            { x: -14.4, z: -95.6, angle: -1.50, arc: 1.92, guns: 2 },
            { x: -14.4, z: -79.2, angle: -1.50, arc: 1.92, guns: 2 },
            { x: -14.4, z: -46.2, angle: -1.50, arc: 1.92, guns: 2 },
            { x: -14.4, z: -29.8, angle: -1.50, arc: 1.92, guns: 2 },
            { x: -14.4, z: 19.6, angle: -1.50, arc: 1.92, guns: 2 },
            { x: -14.4, z: 36.1, angle: -1.50, arc: 1.92, guns: 2 },
            { x: -14.4, z: 52.5, angle: -1.50, arc: 1.92, guns: 2 },
            { x: -14.4, z: 69.0, angle: -1.50, arc: 1.92, guns: 2 },
            { x: 14.4, z: -95.6, angle: 1.50, arc: 1.92, guns: 2 },
            { x: 14.4, z: -62.7, angle: 1.50, arc: 1.92, guns: 2 },
            { x: 14.4, z: -46.2, angle: 1.50, arc: 1.92, guns: 2 },
            { x: 14.4, z: -29.8, angle: 1.50, arc: 1.92, guns: 2 },
            { x: 14.4, z: -13.3, angle: 1.50, arc: 1.92, guns: 2 },
            { x: 14.4, z: 3.1, angle: 1.50, arc: 1.92, guns: 2 },
            { x: 14.4, z: 19.6, angle: 1.50, arc: 1.92, guns: 2 },
            { x: 14.4, z: 36.1, angle: 1.50, arc: 1.92, guns: 2 },
            { x: 14.4, z: 52.5, angle: 1.50, arc: 1.92, guns: 2 },
            { x: 14.4, z: 85.5, angle: 1.50, arc: 1.92, guns: 2 },
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
      // What a dive bomber does when it gets there. A thousand-pound
      // semi-armour-piercing bomb released at ten thousand feet beats about
      // ninety millimetres of deck, and `bombPen` is the whole story of dive
      // bombing in one number: through a destroyer and out of her bottom,
      // which floods her as surely as a torpedo would; through a cruiser's
      // deck to burst in the compartment below it; and stopped dead on a
      // battleship's armoured deck, which is what the weight of it was for.
      bombDamage: 4200, bombHit: 0.42, bombFire: 0.34, bombPen: 92, bombBore: 0.36,
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

export const SHIP_ORDER = ['fletcher', 'cleveland', 'hipper', 'spee', 'iowa', 'enterprise'];

export function getClass(id) {
  return SHIP_CLASSES[id] || SHIP_CLASSES.fletcher;
}

/** Total number of barrels that can bear, used for the UI salvo readout. */
export function totalGuns(cls) {
  return cls.turrets.reduce((n, t) => n + t.guns, 0);
}

export const SHELL_TYPES = { AP, HE };
