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
        { id: 0, x: -4.2, z: -68, angle: -Math.PI / 2, arc: 1.27, tubes: 4, my: 7.49 },
        { id: 1, x: 4.2, z: -68, angle: Math.PI / 2, arc: 1.27, tubes: 4, my: 7.49 },
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
      reach: 7.95,
      caliber: 150, reload: 6.4, traverse: 0.32, range: 9800, sigma: 1.1,
      shells: shells(150, 3100, 2400, 152, 875, 0.11),
      // Four a side in the walkway at the deck edge, spread between the two
      // turrets the way her plan spreads them: abreast the bridge, abreast the
      // funnel, abreast the catapult and abreast the after works.
      mounts: [
        { x: -9.0, z: 36, angle: -Math.PI / 2, arc: 1.36, guns: 1, my: 8.35 },
        { x: 9.0, z: 36, angle: Math.PI / 2, arc: 1.36, guns: 1, my: 8.35 },
        { x: -9.6, z: 16, angle: -Math.PI / 2, arc: 1.29, guns: 1, my: 8.14 },
        { x: 9.6, z: 16, angle: Math.PI / 2, arc: 1.29, guns: 1, my: 8.14 },
        { x: -9.6, z: -12, angle: -Math.PI / 2, arc: 1.29, guns: 1, my: 8.04 },
        { x: 9.6, z: -12, angle: Math.PI / 2, arc: 1.29, guns: 1, my: 8.04 },
        { x: -9.2, z: -32, angle: -Math.PI / 2, arc: 1.36, guns: 1, my: 8.00 },
        { x: 9.2, z: -32, angle: Math.PI / 2, arc: 1.36, guns: 1, my: 8.00 },
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
  u48: {
    // U-48: a Type VIIB, and the most successful submarine of the war --
    // fifty-five ships in twelve patrols, and she survived to be scuttled by
    // her own crew in 1945.
    //
    // Nothing else in this game is like her, and the reason is not the
    // torpedoes. A Type VII is a torpedo boat that can hide under the sea for
    // a while: seven hundred and fifty tonnes, an eighteen-millimetre pressure
    // hull that anything at all goes through, and on the surface she is faster
    // than she is under it by better than two to one. Under it she is nearly
    // blind, nearly deaf, and running out of air the whole time.
    //
    // So she is played the other way round from every other hull here. On the
    // surface she has her guns, her speed and her endurance and can be seen
    // for miles. Under it she has four bow tubes and one stern tube, eight
    // knots, and as long as her air lasts.
    id: 'u48',
    name: 'U-48',
    fullName: 'U-48',
    className: 'Type VIIB',
    type: 'SS',
    typeName: 'Submarine',
    nation: 'ger',
    blurb: 'Fifty-five ships in twelve patrols. Four bow tubes, one aft, and eighteen millimetres of pressure hull between her crew and the sea.',
    hull: { length: 66.5, beam: 6.2, draft: 4.74, superstructure: 0.8 },
    // A boat, not a ship. She has no armour, no subdivision worth the name and
    // seven hundred tonnes of her; one destroyer shell in the pressure hull
    // ends the patrol and very often the boat.
    hp: 6900,
    maxSpeed: 17.9 * KNOTS,
    reverseSpeed: 6 * KNOTS,
    accel: 0.62,
    turnRate: 0.105,
    rudderShift: 3.4,
    speedLossInTurn: 0.18,
    // Low, small and grey, and she trims down until there is nothing of her
    // above water but the tower. Submerged she is not seen at all beyond a
    // mile, which is the whole of what she is for.
    concealment: 3100,
    fireDetectPenalty: 4200,
    radarRange: 0,
    repairCooldown: 96,
    repairHeal: 0.07,
    smokeCharges: 0,
    // Eighteen and a half millimetres of pressure hull, five of free-flooding
    // casing over it. Every one of these numbers is what it actually was, and
    // the consequence is that literally every gun in this game penetrates her
    // everywhere -- which is correct, and is why a boat that is seen is a boat
    // that is finished.
    armor: { belt: 18, deck: 5, citadel: 18, bow: 5, superstructure: 5 },
    // The dive.
    //
    // `depth` is metres below the surface: 0 on the roof, `periscope` with the
    // tower awash and nothing but the attack scope up, `max` with the boat
    // properly down. `rate` is how fast she goes down and `blow` how fast the
    // tanks bring her up, which is quicker -- compressed air is faster than
    // flooding.
    //
    // `oxygen` is how many seconds of it she has below with the hatches shut.
    // Twelve minutes is not the real figure -- a Type VII could stay under for
    // the better part of a day at creeping speed -- it is the figure that makes
    // the decision a decision at the timescale a battle is fought on.
    dive: {
      periscope: 9, max: 34,
      rate: 2.4, blow: 3.6,
      oxygen: 720, recharge: 90,
      // What she can do down there: eight knots flat out, and every mounting
      // on her casing is under water and cannot be fought.
      speed: 8 * KNOTS,
      // And how much harder she is to find once she is under.
      concealment: 1250,
    },
    // The 8.8 cm SK C/35 on the casing forward of the tower. It is a deck gun
    // on a wet mounting with no shield and no director: it is for finishing a
    // merchantman that is not worth a torpedo, and against a warship it is an
    // embarrassment. It cannot be fought at all with the boat under.
    turrets: [
      { id: 0, name: 'Deck gun', x: 0, z: 9.0, angle: 0, arc: 2.79, guns: 1, my: 3.30,
        // No shield, no roof and no gunhouse: an open pedestal on a wet
        // casing, worked by hand by men standing in the sea's way.
        open: true },
    ],
    gun: {
      name: '8.8 cm SK C/35', role: 'surface',
      reach: 4.85,
      caliber: 88, reload: 4.4, traverse: 0.46, range: 11000, sigma: 1.30,
      shells: shells(88, 950, 820, 9, 700, 0.05),
    },
    // Five 53.3 cm tubes: four in the bow and one in the stern, with the
    // reloads in the racks under the deck plates of the fore-ends. They do not
    // train. A Type VII is aimed by pointing the boat.
    torpedoes: {
      mounts: [
        { id: 0, x: 0, z: 28.4, angle: 0, arc: 0.30, tubes: 4, my: -1.55 },
        { id: 1, x: 0, z: -29.0, angle: Math.PI, arc: 0.30, tubes: 1, my: -1.55 },
      ],
      name: 'G7e torpedo', role: 'surface', caliber: 533,
      reach: 0.55,
      // The tubes are in the hull. There is nothing to train, and the fish
      // goes out of the stem or the stern rather than over the side -- which
      // is a different clearance problem, and torpedoClear is told so here.
      inHull: true,
      traverse: 0.0,
      reload: 96, damage: 14200, speed: 30 * KNOTS, range: 5000,
      // Electric, so no wake at all -- which is why she is fired from under.
      detection: 700, arming: 300, spread: 0.035, floodChance: 0.38,
    },
    // The 2 cm C/30 on the Wintergarten abaft the tower. One barrel, and like
    // the deck gun it is on the outside of the pressure hull and drowns.
    secondary: null,
    aa: {
      range: 2200, dps: 9,
      guns: [
        { name: '2 cm C/30', caliber: 20, role: 'aa', reload: 0.30, range: 2200,
          mounts: [
            { x: 0, z: -3.9, angle: Math.PI, arc: 2.79, guns: 1, my: 4.98 },
          ] },
      ],
    },
    planes: null,
    datasheet: {
      displacement: 753,
      aircraft: 0,
      mainRounds: 220,
      torpedoesCarried: 14,
      tertiary: [
        { caliber: 20, label: '2cm', barrels: 1, rounds: 4380 },
      ],
    },
  },

  surcouf: {
    // FS Surcouf: the croiseur sous-marin, and the largest submarine in the
    // world from 1934 until the Japanese built the I-400s.
    //
    // She is here because she is the other answer to the question the U-48
    // answers. A Type VII is a torpedo boat that can hide; the Surcouf was an
    // attempt at a commerce raider that can hide -- three thousand tonnes, a
    // pressure-tight twin turret of eight-inch guns forward of the tower, a
    // hangar abaft it with a floatplane in it, and a cargo hold for the crews
    // of the ships she was to sink.
    //
    // It did not work, and the reasons are all in the numbers below. The
    // turret takes better than two minutes to bring into action from periscope
    // depth and its rangefinder is five metres off the water, so her guns
    // outrange her own ability to see; she takes a long time to dive and turns
    // like a barn; and three thousand tonnes of submarine has the same
    // eighteen millimetres between her crew and the sea that seven hundred
    // tonnes has. She was lost with all hands in 1942, rammed in the dark.
    //
    // What she is worth in a battle: one submarine that can shoot at something
    // bigger than a trawler, and the only one in the game that flies an
    // aeroplane.
    id: 'surcouf',
    name: 'Surcouf',
    fullName: 'FS Surcouf',
    className: 'Surcouf',
    type: 'SS',
    typeName: 'Submarine',
    nation: 'fra',
    blurb: 'The cruiser-submarine: two 8-inch guns in a pressure-tight turret, a floatplane in a hangar abaft the tower, and three thousand tonnes of her.',
    hull: { length: 110.0, beam: 9.0, draft: 7.25, superstructure: 1.5 },
    // Four times the U-48's displacement and no better protected anywhere: a
    // bigger boat is a bigger target and not a tougher one.
    hp: 14800,
    maxSpeed: 18.5 * KNOTS,
    reverseSpeed: 6 * KNOTS,
    accel: 0.38,
    // A hundred and ten metres of submarine on one rudder. She was notorious
    // for it, and it is what killed her: she could not get out of the way.
    turnRate: 0.062,
    rudderShift: 5.2,
    speedLossInTurn: 0.22,
    // Bigger than a Type VII and a good deal easier to see, on the surface and
    // under it: there is more of her to find and the turret stands up.
    concealment: 4400,
    fireDetectPenalty: 5200,
    radarRange: 0,
    repairCooldown: 104,
    repairHeal: 0.06,
    smokeCharges: 0,
    armor: { belt: 18, deck: 6, citadel: 18, bow: 6, superstructure: 10 },
    // The dive. Slower down than a Type VII and slower up: two minutes to get
    // under was the figure that got her a reputation, and it is the one thing
    // about her a captain has to plan around.
    dive: {
      periscope: 11, max: 78,
      rate: 1.5, blow: 2.4,
      oxygen: 900, recharge: 110,
      speed: 8.5 * KNOTS,
      concealment: 1700,
    },
    // The turret: two 20.3 cm M1924 in a pressure-tight mounting forward of
    // the tower, with its own rangefinder on the roof.
    //
    // It is the whole point of her and it is a compromise everywhere. The
    // guns are real eight-inch guns and they hit like a heavy cruiser's; the
    // mounting trains slowly because it has to be watertight, the rangefinder
    // is five metres up so she cannot see as far as she can shoot, and like
    // every gun on a submarine it is outside the pressure hull and cannot be
    // fought with the boat under.
    turrets: [
      // Plus or minus ninety degrees from the centreline, which is what the
      // Modele 1929 mounting trained through and is a good deal less than a
      // cruiser's turret: there is a tower immediately abaft it and a hundred
      // and ten metres of casing ahead, and the mounting is let into the
      // pressure hull rather than standing on a barbette that can turn through
      // it. So she fights on the beam, and to shoot astern she comes round.
      // Right up against the tower, which is where every drawing and every
      // photograph puts her: the barbette's after edge and the tower's forward
      // face are a yard apart, because a turret let into the pressure hull has
      // to be over the one part of her that is deep enough to take it.
      { id: 0, name: 'Tourelle I', x: 0, z: 8.0, angle: 0, arc: 1.5708, guns: 2, my: 4.50 },
    ],
    gun: {
      name: '203 mm/50 Mle 1924', role: 'surface',
      // Ten and a sixth metres of bore, of which about seven and a half stands
      // out of the gunhouse face -- measured off the model, which is what
      // `reach` is for.
      reach: 7.6,
      caliber: 203,
      // Three rounds a minute, which is the figure recorded for this mounting
      // and about two thirds of what the same gun did in a cruiser's turret:
      // the hoists come up out of a pressure hull through a watertight trunk,
      // and the guns are not separately sleeved so they load together or not
      // at all.
      reload: 20.0,
      // And she trains slowly for the same reason she loads slowly.
      traverse: 0.16,
      // Five minutes' worth of gun at a range she can see to. The mounting
      // reached twenty-six kilometres and the gun itself thirty-one at
      // forty-five degrees, and neither number is any use to her: her own
      // rangefinder is five metres off the water, so what she can actually
      // shoot at is what she can see, which is this.
      range: 21000,
      // Minus five to plus thirty, as built. It is why she cannot reach the
      // gun's own maximum range: that wants forty-five.
      elev: { min: -0.087, max: 0.524 },
      sigma: 1.55,
      shells: shells(203, 2870, 820, 118, 850, 0.035),
    },
    // Her tubes, and there is no other submarine in the world with this many.
    //
    // Four 55 cm in the bow inside the pressure hull, and abaft the tower two
    // trainable external mounts, each one carrying a 55 cm tube with a pair of
    // 40 cm alongside it. The external mounts are the reason she can fire a
    // torpedo on a bearing at all without pointing the whole boat: everything
    // else afloat in 1940 aimed its fish by aiming the submarine.
    torpedoes: {
      mounts: [
        // The bow four are inside the pressure hull and fire out of the stem.
        { id: 0, x: 0, z: 40.0, angle: 0, arc: 0.34, tubes: 4, my: -2.5 },
        // The two aft are external mountings standing on the casing, and they
        // go over the side the way a destroyer's bank does -- which is what
        // `inHull: false` says, and why she needs to say it per mounting.
        { id: 1, x: -1.55, z: -17.5, angle: -1.5708, arc: 1.22, tubes: 3, my: 1.55, inHull: false },
        { id: 2, x: 1.55, z: -17.5, angle: 1.5708, arc: 1.22, tubes: 3, my: 1.55, inHull: false },
      ],
      name: '550 mm 1924V', role: 'surface', caliber: 550,
      // Six 55 cm and four 40 cm, which is why she does not say twenty-one inch.
      tubeLabel: '55/40 cm',
      // Nearly three metres from the axis the mount trains about to the mouth
      // of the tube, because an external mount is six metres of tube lying on
      // a ring: the fish leaves at the cap and not at the middle of it.
      reach: 2.9,
      inHull: true,
      traverse: 0.10,
      reload: 104, damage: 15800, speed: 39 * KNOTS, range: 3000,
      detection: 900, arming: 300, spread: 0.04, floodChance: 0.40,
    },
    secondary: null,
    // Her light battery: a 37 mm twin and four 13.2 mm in two twins.
    //
    // They stand on and about the hangar, which is the only flat thing on her
    // above water abaft the tower -- and where they stand is what decides
    // where she can fight. The 37 mm is on the hangar top looking aft and out
    // over both beams; the hangar itself, the crane behind it and eight inches
    // of turret in front shut it off over the bow. The machine guns are in
    // their watertight housings on the after bridge platform, one each side,
    // and each looks out over her own beam and no further across.
    //
    // So an aeroplane over the bow is met by the two Hotchkiss twins, one on
    // the beam by the 37 mm and whichever twin is on that side, and never by
    // the whole battery at once. That is the ordinary condition of a
    // submarine: one small island in the middle of a very long hull, with
    // everything mounted on it and everything in everything else's way.
    aa: {
      range: 3000, dps: 16,
      guns: [
        { name: '37 mm CA Mle 1925', caliber: 37, role: 'aa', reload: 0.9, range: 3000,
          mounts: [
            { x: 0, z: -14.6, angle: Math.PI, arc: 2.00, guns: 2, my: 8.23 },
          ] },
        { name: '13.2 mm Hotchkiss Mle 1929', caliber: 13, role: 'aa', reload: 0.2, range: 1500,
          mounts: [
            { x: -2.15, z: -6.20, angle: -1.5708, arc: 1.75, guns: 2, my: 7.44 },
            { x: 2.15, z: -6.20, angle: 1.5708, arc: 1.75, guns: 2, my: 7.44 },
          ] },
      ],
    },
    // The hangar, and the Besson MB.411 in it.
    //
    // One aeroplane, and she is a pair of eyes rather than a weapon: the whole
    // reason a commerce raider carried one is that the sea is very large and a
    // periscope is a metre above it. She is craned out and craned back, which
    // means the boat is on the surface and helpless for as long as it takes --
    // so flying her off is a decision, not a free look.
    //
    // Getting her into the air is a drill and not a button. The hangar door
    // comes off, she is wheeled aft on her rails, her fuselage is raised, her
    // wings are swung out and pinned, and then the derrick picks her up and
    // puts her in the water: four minutes alongside and twenty at sea, and the
    // whole of that time the boat is on the surface with a hole open in her.
    planes: {
      squadrons: 1,
      perSquadron: 1,
      roles: ['scout'],
      // The Besson MB.411, built for this boat and for nothing else. Nine were
      // made and two of them were hers.
      type: 'besson',
      // And she goes over the side on a derrick, not off a catapult. No
      // submarine ever carried one.
      launcher: 'derrick',
      // The whole evolution, on the clock the model plays it on: the trolley
      // wheeled forward under the boom, hooked on, hoisted off her chocks,
      // swung out over the port side, lowered into the sea, slipped, and then
      // the run. Two thirds of a minute, which is the fastest it was ever done
      // and about a third of what it took her at sea.
      deckRun: 38,
      deckCycle: 74,
      // And she does not go off a deck. She is a float plane that has just
      // unstuck from the water alongside, so her flight starts close to the
      // boat, low, and out on the bow she was lowered over -- not a hundred
      // and fifty metres dead ahead at forty metres, which is where a carrier
      // leaves hers and which is what the default put her.
      runOut: 120, runBearing: 0.20, runSide: -1, runHeight: 15,
      // One aeroplane, and she is a scout with two machine guns and nothing
      // else. The fall-through put four torpedo bombers in the air off a boat
      // that carried one Besson and never flew her with a weapon at all.
      flight: { fighters: 1, dive: 0, torpedo: 0 },
      // How long between her coming back aboard and being fit to go again.
      //
      // `rearm` and not `cooldown`: nothing reads `cooldown`, which is what
      // she had, so the moment her Besson came home her squadron's clock was
      // set to undefined and stayed there. A NaN is not zero and is not
      // greater than zero, so her air group read neither ready nor counting
      // down for the rest of the battle -- nought ready, and a dash where the
      // seconds should be. She could fly once and never again.
      //
      // Three minutes is the derrick both ways with the wings off and on. It
      // was twenty at sea; this is the same scaling every other ship's is on.
      rearm: 190,
      strikeRange: 11000,
      cruiseSpeed: 52,
      // She carries nothing. There were two 75 kg bombs in the drawings and
      // there is no record of her ever having flown with them.
      bombDamage: 0,
      bombHit: 0,
      torpDamage: 0,
      strafeDamage: 70,
      fighterGuns: 18,
      hp: 190,
    },
    datasheet: {
      displacement: 3304,
      aircraft: 1,
      // Sixty rounds a gun, which is all a pressure hull has room for and is
      // about a quarter of what a cruiser carries for the same gun.
      mainRounds: 120,
      // Fourteen tubes' worth in the racks: eight 55 cm and four 40 cm
      // reloads on top of the ten she has in the tubes.
      torpedoesCarried: 22,
      tertiary: [
        { caliber: 37, label: '37mm', barrels: 2, rounds: 2000 },
        { caliber: 13, label: '13.2mm', barrels: 4, rounds: 6000 },
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

  yamato: {
    // Nine 46 cm/45 Type 94 in three triples: the largest naval guns ever
    // mounted, throwing a shell of a tonne and a half twenty-six miles. The
    // turret alone weighs more than a destroyer, and it trains at two degrees
    // a second, which is why the heaviest guns afloat have the least of the
    // horizon to shoot at.
    //
    // She is the 1945 ship. The two beam 15.5 cm triples were landed in 1944
    // to make room for anti-aircraft guns, so she carries two secondary
    // turrets rather than four and is covered end to end in twenty-five
    // millimetre.
    id: 'yamato',
    name: 'Yamato',
    fullName: 'IJN Yamato',
    className: 'Yamato',
    type: 'BB',
    typeName: 'Battleship',
    nation: 'jpn',
    blurb: 'Eighteen-inch guns behind sixteen inches of belt. Nothing afloat out-ranges her and nothing out-weighs her.',
    // Drawn at the same factor the Iowa is, so the two of them read as the
    // same kind of thing in the same water: her lines are her own, she is
    // simply larger. 263 m over all, 38.9 m beam, 10.4 m draft.
    hull: {
      length: 263 * BIG, beam: 38.9 * BIG, draft: 10.4 * BIG, superstructure: 1.45,
    },
    hp: 92400,
    maxSpeed: 27 * KNOTS,
    reverseSpeed: 6 * KNOTS,
    accel: 0.36,
    turnRate: 0.047,
    rudderShift: 15.5,
    speedLossInTurn: 0.16,
    concealment: 16800,
    fireDetectPenalty: 7000,
    radarRange: 9500,       // Type 21: a real set, and not a good one
    repairCooldown: 105,
    repairHeal: 0.13,
    smokeCharges: 0,
    // Four hundred and ten millimetres of belt at twenty degrees, two hundred
    // of armoured deck, and six hundred and fifty on the turret faces. The
    // ends are unarmoured, which is where she was actually hurt.
    armor: { belt: 410, deck: 200, citadel: 410, bow: 50, superstructure: 50 },
    turrets: [
      { id: 0, name: 'No.1', x: 0, z: 78 * BIG, angle: 0, arc: 2.36, guns: 3, my: 25.77 },
      { id: 1, name: 'No.2', x: 0, z: 55 * BIG, angle: 0, arc: 2.27, guns: 3, my: 33.98 },
      { id: 2, name: 'No.3', x: 0, z: -68 * BIG, angle: Math.PI, arc: 2.36, guns: 3, my: 27.34 },
    ],
    gun: {
      name: '46 cm/45 Type 94', role: 'surface',
      reach: 34.25,
      caliber: 460, reload: 29, traverse: 0.06, range: 23800, sigma: 1.30,
      shells: shells(460, 15800, 7400, 760, 780, 0.26),
    },
    torpedoes: null,
    // Two 15.5 cm/60 triples on the centreline, fore and aft. These are
    // Mogami's old main-battery turrets, taken off her when she was re-gunned
    // with eight-inch -- which is how a sixty-five-thousand-tonne battleship
    // comes to carry a light cruiser's turret, armoured like a biscuit tin.
    secondary: {
      name: '15.5 cm/60 Type 3', role: 'surface',
      reach: 17.26,
      caliber: 155, reload: 9.5, traverse: 0.10, range: 14600, sigma: 1.45,
      shells: shells(155, 3100, 2500, 175, 920, 0.12),
      mounts: [
        { x: 0, z: 36 * BIG, angle: 0, arc: 1.92, guns: 3, my: 34.72 },
        { x: 0, z: -48 * BIG, angle: Math.PI, arc: 1.92, guns: 3, my: 34.72 },
      ],
    },
    aa: {
      range: 6800, dps: 176,
      guns: [
        // Twelve 12.7 cm Type 89 twins along the superstructure deck edges,
        // six a side. None can fire across her -- the pagoda and the funnel
        // are in the way -- which is the whole reason there are twelve.
        { name: '12.7 cm Type 89', caliber: 127, role: 'dp', reload: 4.0, range: 6800,
          mounts: [
            { x: -8.4 * BIG, z: 30 * BIG, angle: -Math.PI / 2, arc: 1.48, guns: 2 },
            { x: 8.4 * BIG, z: 30 * BIG, angle: Math.PI / 2, arc: 1.48, guns: 2 },
            { x: -8.4 * BIG, z: 18 * BIG, angle: -Math.PI / 2, arc: 1.40, guns: 2 },
            { x: 8.4 * BIG, z: 18 * BIG, angle: Math.PI / 2, arc: 1.40, guns: 2 },
            { x: -10.4 * BIG, z: 4 * BIG, angle: -Math.PI / 2, arc: 1.31, guns: 2 },
            { x: 10.4 * BIG, z: 4 * BIG, angle: Math.PI / 2, arc: 1.31, guns: 2 },
            { x: -10.4 * BIG, z: -10 * BIG, angle: -Math.PI / 2, arc: 1.31, guns: 2 },
            { x: 10.4 * BIG, z: -10 * BIG, angle: Math.PI / 2, arc: 1.31, guns: 2 },
            { x: -10.4 * BIG, z: -22 * BIG, angle: -Math.PI / 2, arc: 1.40, guns: 2 },
            { x: 10.4 * BIG, z: -22 * BIG, angle: Math.PI / 2, arc: 1.40, guns: 2 },
            { x: -8.2 * BIG, z: -38 * BIG, angle: -Math.PI / 2, arc: 1.48, guns: 2 },
            { x: 8.2 * BIG, z: -38 * BIG, angle: Math.PI / 2, arc: 1.48, guns: 2 },
          ] },
        // And the twenty-five millimetre, which by Okinawa was on every
        // platform and sponson she had. Thirty-six triples and four singles
        // here, laid out where her own model has room for them.
        { name: '25 mm Type 96', caliber: 25, role: 'aa', reload: 0.16, range: 3000,
          mounts: [
            { x: -7.8 * BIG, z: 23 * BIG, angle: -0.90, arc: 1.92, guns: 3 },
            { x: 7.8 * BIG, z: 23 * BIG, angle: 0.90, arc: 1.92, guns: 3 },
            { x: -7.8 * BIG, z: 17 * BIG, angle: -1.40, arc: 1.92, guns: 3 },
            { x: 7.8 * BIG, z: 17 * BIG, angle: 1.40, arc: 1.92, guns: 3 },
            { x: -7.6 * BIG, z: 11 * BIG, angle: -1.90, arc: 1.92, guns: 3 },
            { x: 7.6 * BIG, z: 11 * BIG, angle: 1.90, arc: 1.92, guns: 3 },
            { x: -10.2 * BIG, z: -6 * BIG, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 10.2 * BIG, z: -6 * BIG, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -10.2 * BIG, z: -12 * BIG, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 10.2 * BIG, z: -12 * BIG, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -10.2 * BIG, z: -18 * BIG, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 10.2 * BIG, z: -18 * BIG, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -10.2 * BIG, z: -24 * BIG, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 10.2 * BIG, z: -24 * BIG, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -12.4 * BIG, z: 40 * BIG, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 12.4 * BIG, z: 40 * BIG, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -12.4 * BIG, z: 26 * BIG, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 12.4 * BIG, z: 26 * BIG, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -12.4 * BIG, z: 10 * BIG, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 12.4 * BIG, z: 10 * BIG, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -12.4 * BIG, z: -2 * BIG, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 12.4 * BIG, z: -2 * BIG, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -12.4 * BIG, z: -16 * BIG, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 12.4 * BIG, z: -16 * BIG, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -12.4 * BIG, z: -30 * BIG, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 12.4 * BIG, z: -30 * BIG, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -12.4 * BIG, z: -44 * BIG, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 12.4 * BIG, z: -44 * BIG, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -13.006 * BIG, z: 92 * BIG, angle: -0.50, arc: 1.92, guns: 3 },
            { x: 13.006 * BIG, z: 92 * BIG, angle: 0.50, arc: 1.92, guns: 3 },
            { x: -12.058 * BIG, z: -84 * BIG, angle: -2.30, arc: 1.92, guns: 3 },
            { x: 12.058 * BIG, z: -84 * BIG, angle: 2.30, arc: 1.92, guns: 3 },
            { x: -6.329 * BIG, z: -112 * BIG, angle: -2.60, arc: 1.92, guns: 3 },
            { x: 6.329 * BIG, z: -112 * BIG, angle: 2.60, arc: 1.92, guns: 3 },
            { x: -3.2 * BIG, z: 52 * BIG, angle: -0.40, arc: 1.92, guns: 3 },
            { x: 3.2 * BIG, z: 52 * BIG, angle: 0.40, arc: 1.92, guns: 3 },
            { x: -6.0 * BIG, z: -32 * BIG, angle: -1.20, arc: 1.92, guns: 1 },
            { x: 6.0 * BIG, z: -32 * BIG, angle: 1.20, arc: 1.92, guns: 1 },
            { x: -6.0 * BIG, z: -38 * BIG, angle: -1.90, arc: 1.92, guns: 1 },
            { x: 6.0 * BIG, z: -38 * BIG, angle: 1.90, arc: 1.92, guns: 1 },
          ] },
      ],
    },
    // Seven float planes off two catapults on the quarterdeck, struck below
    // into a hangar under the aircraft deck. She is a battleship: they are her
    // eyes, and the only thing a captain does with them is throw them off and
    // get them back.
    planes: {
      squadrons: 2, perSquadron: 2, cruiseSpeed: 56, strikeRange: 9800,
      rearm: 95, hp: 660, dropSpread: 0.06,
      torpDamage: 0, torpSpeed: 0, torpRange: 0, floodChance: 0,
      bombDamage: 950, bombHit: 0.32, bombFire: 0.1, bombPen: 26, bombBore: 0.2,
      type: 'jake',
      catapult: true, deckRun: 8.6, deckCycle: 30,
      runHeight: 22,
      runOut: 141, runBearing: 1.16,
      flight: { fighters: 0, dive: 2, torpedo: 0 },
    },
    datasheet: {
      // The ship's own tonnage, not the model's.
      displacement: 65000,
      aircraft: 7,
      mainRounds: 900,
      secondary: { caliber: 155, label: '15.5cm', barrels: 6, rounds: 1800 },
      tertiary: [
        { caliber: 127, label: '12.7cm', barrels: 24, rounds: 12000 },
        { caliber: 25, label: '25mm', barrels: 112, rounds: 336000 },
      ],
    },
  },

  takao: {
    // Ten 20.3 cm in five twin turrets -- three forward, two aft -- and
    // sixteen Long Lance tubes. A Japanese heavy cruiser is a torpedo ship
    // with a heavy gun armament bolted on, and the thing that makes her
    // dangerous is not the guns.
    //
    // What you know her by is the bridge: Takao and Atago were given a
    // superstructure so enormous that they were nicknamed after castles, and
    // it is the single most recognisable thing about the class.
    id: 'takao',
    name: 'Takao',
    fullName: 'IJN Takao',
    className: 'Takao',
    type: 'CA',
    typeName: 'Heavy Cruiser',
    nation: 'jpn',
    blurb: 'A castle of a bridge, ten eight-inch guns, and sixteen Long Lances that reach further than anything else afloat.',
    hull: { length: 203.8, beam: 20.4, draft: 6.3, superstructure: 1.5 },
    hp: 33100,
    maxSpeed: 34.2 * KNOTS,
    reverseSpeed: 8 * KNOTS,
    accel: 0.86,
    turnRate: 0.084,
    rudderShift: 6.8,
    speedLossInTurn: 0.21,
    concealment: 11400,
    fireDetectPenalty: 4500,
    radarRange: 8200,
    repairCooldown: 78,
    repairHeal: 0.1,
    smokeCharges: 0,
    // A hundred and twenty-seven millimetres of belt over the machinery and
    // thirty-five of deck. She is built for speed and torpedoes, and anything
    // heavier than a six-inch goes through her.
    armor: { belt: 127, deck: 35, citadel: 127, bow: 25, superstructure: 16 },
    turrets: [
      { id: 0, name: 'No.1', x: 0, z: 64, angle: 0, arc: 2.44, guns: 2, my: 11.40 },
      { id: 1, name: 'No.2', x: 0, z: 53, angle: 0, arc: 2.36, guns: 2, my: 13.96 },
      { id: 2, name: 'No.3', x: 0, z: 42, angle: 0, arc: 2.27, guns: 2, my: 16.31 },
      { id: 3, name: 'No.4', x: 0, z: -56, angle: Math.PI, arc: 2.36, guns: 2, my: 14.53 },
      { id: 4, name: 'No.5', x: 0, z: -68, angle: Math.PI, arc: 2.44, guns: 2, my: 8.27 },
    ],
    gun: {
      name: '20.3 cm/50 Type 3 No.2', role: 'surface',
      reach: 12.29,
      caliber: 203, reload: 12.0, traverse: 0.21, range: 17600, sigma: 1.55,
      shells: shells(203, 5000, 3250, 255, 840, 0.15),
    },
    // Four quadruple Type 92 mounts, two a side on the upper deck, with the
    // reload racks alongside. The Type 93 is oxygen-driven: forty knots,
    // twenty kilometres, and no wake to see it coming.
    torpedoes: {
      mounts: [
        { id: 0, x: -8.4, z: -4, angle: -Math.PI / 2, arc: 1.22, tubes: 4, my: 13.55 },
        { id: 1, x: 8.4, z: -4, angle: Math.PI / 2, arc: 1.22, tubes: 4, my: 13.55 },
        { id: 2, x: -8.4, z: -20, angle: -Math.PI / 2, arc: 1.22, tubes: 4, my: 13.55 },
        { id: 3, x: 8.4, z: -20, angle: Math.PI / 2, arc: 1.22, tubes: 4, my: 13.55 },
      ],
      name: 'Type 93 torpedo', role: 'surface', caliber: 610,
      reach: 4.42,
      traverse: 0.28,
      reload: 84, damage: 17600, speed: 40 * KNOTS, range: 11000,
      // No wake at all, which is the whole point of running one on oxygen:
      // the first anybody knew about a Long Lance was the hit.
      detection: 900, arming: 450, spread: 0.06, floodChance: 0.40,
    },
    secondary: {
      name: '12.7 cm Type 89', role: 'dp',
      reach: 5.62,
      caliber: 127, reload: 4.0, traverse: 0.40, range: 6800, sigma: 1.1,
      shells: shells(127, 1700, 1450, 55, 720, 0.07),
      mounts: [
        { x: -7.6, z: 14, angle: -Math.PI / 2, arc: 1.40, guns: 2, my: 14.65 },
        { x: 7.6, z: 14, angle: Math.PI / 2, arc: 1.40, guns: 2, my: 14.65 },
        { x: -7.6, z: 2, angle: -Math.PI / 2, arc: 1.31, guns: 2, my: 14.65 },
        { x: 7.6, z: 2, angle: Math.PI / 2, arc: 1.31, guns: 2, my: 14.65 },
      ],
    },
    aa: {
      range: 3400, dps: 62,
      guns: [
        { name: '25 mm Type 96', caliber: 25, role: 'aa', reload: 0.16, range: 3000,
          mounts: [
            { x: -6.4, z: 26, angle: -1.10, arc: 1.92, guns: 3 },
            { x: 6.4, z: 26, angle: 1.10, arc: 1.92, guns: 3 },
            { x: -6.4, z: 20, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 6.4, z: 20, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -7.2, z: -8, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 7.2, z: -8, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -7.2, z: -24, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 7.2, z: -24, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -5.6, z: -36, angle: -2.00, arc: 1.92, guns: 3 },
            { x: 5.6, z: -36, angle: 2.00, arc: 1.92, guns: 3 },
            { x: -4.4, z: 34, angle: -0.70, arc: 1.92, guns: 2 },
            { x: 4.4, z: 34, angle: 0.70, arc: 1.92, guns: 2 },
            { x: -5.0, z: -44, angle: -2.40, arc: 1.92, guns: 2 },
            { x: 5.0, z: -44, angle: 2.40, arc: 1.92, guns: 2 },
          ] },
      ],
    },
    planes: {
      squadrons: 1, perSquadron: 2, cruiseSpeed: 56, strikeRange: 8600,
      rearm: 100, hp: 620, dropSpread: 0.07,
      torpDamage: 0, torpSpeed: 0, torpRange: 0, floodChance: 0,
      bombDamage: 820, bombHit: 0.30, bombFire: 0.1, bombPen: 24, bombBore: 0.2,
      type: 'jake',
      catapult: true, deckRun: 8.0, deckCycle: 32,
      runHeight: 18,
      runOut: 120, runBearing: 1.20,
      flight: { fighters: 0, dive: 2, torpedo: 0 },
    },
    datasheet: {
      displacement: 15875,
      aircraft: 3,
      mainRounds: 1200,
      torpedoesCarried: 24,
      secondary: { caliber: 127, label: '12.7cm', barrels: 8, rounds: 1600 },
      tertiary: [
        { caliber: 25, label: '25mm', barrels: 38, rounds: 114000 },
      ],
    },
  },

  shinano: {
    // The third Yamato hull, converted on the slip into an armoured carrier
    // and the largest warship ever built to carry aircraft until the nuclear
    // ones. A seventy-five millimetre armoured flight deck over a hundred and
    // ninety of main deck: she was meant to be a floating supply base that
    // could take a hit nothing else could and go on flying aircraft.
    //
    // She was sunk by a submarine ten days after commissioning, on her first
    // voyage, with the watertight doors untested and half her crew aboard for
    // the first time.
    id: 'shinano',
    name: 'Shinano',
    fullName: 'IJN Shinano',
    className: 'Shinano',
    type: 'CV',
    typeName: 'Aircraft Carrier',
    nation: 'jpn',
    blurb: 'An armoured flight deck on a battleship hull. Slow to hurt, slow to turn, and she carries a strike nothing this side of the horizon can answer.',
    hull: { length: 266, beam: 36.3, draft: 10.3, superstructure: 0.6, flightDeck: true },
    hp: 66400,
    maxSpeed: 27 * KNOTS,
    reverseSpeed: 6 * KNOTS,
    accel: 0.40,
    turnRate: 0.048,
    rudderShift: 14.0,
    speedLossInTurn: 0.16,
    concealment: 15600,
    fireDetectPenalty: 5600,
    radarRange: 9500,
    repairCooldown: 95,
    repairHeal: 0.12,
    smokeCharges: 0,
    // Thinner in the belt than a Yamato -- it was cut to 160 mm to pay for the
    // deck -- and the thickest flight deck ever put to sea over it.
    armor: { belt: 160, deck: 190, citadel: 160, bow: 30, superstructure: 25 },
    // Sixteen 12.7 cm Type 89 in eight twin sponsons, four a side, below the
    // flight-deck edge. None can fire across the ship: the deck is in the way,
    // which is why a carrier is always short of guns on the engaged side.
    turrets: [
      { id: 0, name: 'S1', x: -20.4, z: 84, angle: -Math.PI / 2, arc: 0.61, guns: 2, my: 19.35 },
      { id: 1, name: 'S2', x: -21.2, z: 34, angle: -Math.PI / 2, arc: 0.61, guns: 2, my: 19.35 },
      { id: 2, name: 'S3', x: -21.2, z: -34, angle: -Math.PI / 2, arc: 0.61, guns: 2, my: 19.35 },
      { id: 3, name: 'S4', x: -20.4, z: -84, angle: -Math.PI / 2, arc: 0.61, guns: 2, my: 19.35 },
      { id: 4, name: 'P1', x: 20.4, z: 84, angle: Math.PI / 2, arc: 0.61, guns: 2, my: 19.35 },
      { id: 5, name: 'P2', x: 21.2, z: 34, angle: Math.PI / 2, arc: 0.61, guns: 2, my: 19.35 },
      { id: 6, name: 'P3', x: 21.2, z: -34, angle: Math.PI / 2, arc: 0.61, guns: 2, my: 19.35 },
      { id: 7, name: 'P4', x: 20.4, z: -84, angle: Math.PI / 2, arc: 0.61, guns: 2, my: 19.35 },
    ],
    gun: {
      name: '12.7 cm Type 89', role: 'dp',
      reach: 5.62,
      caliber: 127, reload: 4.2, traverse: 0.40, range: 6800, sigma: 2.1,
      shells: shells(127, 1700, 1450, 55, 720, 0.07),
    },
    torpedoes: null,
    secondary: null,
    aa: {
      range: 6400, dps: 190,
      guns: [
        // Thirty-five 25 mm triples in the galleries down both deck edges and
        // round the island.
        { name: '25 mm Type 96', caliber: 25, role: 'aa', reload: 0.16, range: 3000,
          //
          // Every one of the deck-edge mountings stands at the edge of the
          // flight deck at its own station, which is not a constant: her deck
          // draws in over the last fifth of her length at both ends. Written
          // out as one half-breadth for the whole run, the four mountings
          // nearest the bow and the stern ended up hanging four and six
          // metres outboard of any part of the ship, in tubs that reached
          // nothing.
          mounts: [
            { x: -16.1, z: 104, angle: -1.30, arc: 1.92, guns: 3 },
            { x: 16.1, z: 104, angle: 1.30, arc: 1.92, guns: 3 },
            { x: -18.3, z: 92, angle: -1.45, arc: 1.92, guns: 3 },
            { x: 18.3, z: 92, angle: 1.45, arc: 1.92, guns: 3 },
            { x: -20.1, z: 70, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.1, z: 70, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.4, z: 58, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.4, z: 58, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.5, z: 46, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.5, z: 46, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.6, z: 22, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.6, z: 22, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.6, z: 10, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.6, z: 10, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.6, z: -2, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.6, z: -2, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.6, z: -14, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.6, z: -14, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.6, z: -46, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.6, z: -46, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.6, z: -58, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.6, z: -58, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.6, z: -70, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.6, z: -70, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.5, z: -96, angle: -1.75, arc: 1.92, guns: 3 },
            { x: 20.5, z: -96, angle: 1.75, arc: 1.92, guns: 3 },
            { x: -19.5, z: -110, angle: -1.90, arc: 1.92, guns: 3 },
            { x: 19.5, z: -110, angle: 1.90, arc: 1.92, guns: 3 },
            // The three on the island's own galleries. `where` says so,
            // because their stations are inboard of the deck edge and nothing
            // about the numbers alone distinguishes a gun on the island from
            // a gun on the deck beside it -- and put on the deck they end up
            // inside the island, which is where these three were.
            { x: -19.4, z: 26, angle: -0.80, arc: 1.92, guns: 3, where: 'island' },
            { x: -19.4, z: 8, angle: -2.40, arc: 1.92, guns: 3, where: 'island' },
            { x: -10.0, z: 18, angle: -1.20, arc: 1.92, guns: 3, where: 'island' },
            { x: 0, z: 118, angle: 0.00, arc: 1.92, guns: 3 },
            { x: -6.0, z: 116, angle: -0.35, arc: 1.92, guns: 3 },
            { x: 6.0, z: 116, angle: 0.35, arc: 1.92, guns: 3 },
            { x: 0, z: -120, angle: Math.PI, arc: 1.92, guns: 3 },
          ] },
        // And the twelve 12 cm rocket launchers: twenty-eight tubes apiece,
        // throwing a barrage of incendiary rockets up in front of an attacking
        // formation. Loud, spectacular, and by every account it hit almost
        // nothing.
        { name: '12 cm AA rocket', caliber: 120, role: 'aa', reload: 3.2, range: 3000,
          mounts: [
            { x: -19.5, z: 80, angle: -1.35, arc: 1.75, guns: 28 },
            { x: 19.5, z: 80, angle: 1.35, arc: 1.75, guns: 28 },
            { x: -20.6, z: 34, angle: -1.57, arc: 1.75, guns: 28 },
            { x: 20.6, z: 34, angle: 1.57, arc: 1.75, guns: 28 },
            { x: -20.6, z: -26, angle: -1.57, arc: 1.75, guns: 28 },
            { x: 20.6, z: -26, angle: 1.57, arc: 1.75, guns: 28 },
            { x: -20.6, z: -82, angle: -1.75, arc: 1.75, guns: 28 },
            { x: 20.6, z: -82, angle: 1.75, arc: 1.75, guns: 28 },
            // These two stand on the island's casing, forward of the bridge
            // and abaft the funnel.
            { x: -17.6, z: 32, angle: -0.60, arc: 1.75, guns: 28, where: 'island' },
            { x: -17.6, z: 2, angle: -2.50, arc: 1.75, guns: 28, where: 'island' },
            { x: -5.5, z: 120, angle: -0.20, arc: 1.75, guns: 28 },
            { x: 5.5, z: 120, angle: 0.20, arc: 1.75, guns: 28 },
          ] },
      ],
    },
    planes: {
      squadrons: 3, perSquadron: 6, cruiseSpeed: 82, strikeRange: 15600,
      // What she flies: her own nation's machines, one to a role.
      types: { fighter: 'zero', dive: 'suisei', torpedo: 'tenzan' },
      runOut: 158, runHeight: 43,
      rearm: 40, torpDamage: 9400, torpSpeed: 27 * KNOTS, torpRange: 2800,
      floodChance: 0.27, hp: 1300, dropSpread: 0.05,
      // A Suisei's 500 kg semi-armour-piercing bomb beats about a hundred
      // millimetres of deck: through a destroyer and out of her bottom,
      // through a cruiser's deck to burst below it, and stopped dead on a
      // battleship's armoured deck.
      bombDamage: 4400, bombHit: 0.40, bombFire: 0.36, bombPen: 100, bombBore: 0.38,
      group: {
        total: 18,
        min: { fighters: 0, dive: 0, torpedo: 0 },
        max: { fighters: 12, dive: 12, torpedo: 12 },
        minStrike: 3,
        // Her intended group: a squadron of each, fighters heaviest because
        // by the end of 1944 that is what a Japanese carrier flew.
        default: { fighters: 8, dive: 6, torpedo: 4 },
      },
    },
    datasheet: {
      displacement: 72000,
      aircraft: 0,
      mainRounds: 3200,
      secondary: { caliber: 127, label: '12.7cm', barrels: 16, rounds: 4800 },
      tertiary: [
        { caliber: 25, label: '25mm', barrels: 105, rounds: 315000 },
        { caliber: 120, label: '12cm rocket', barrels: 336, rounds: 4032 },
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

export const SHIP_ORDER = ['fletcher', 'cleveland', 'hipper', 'spee', 'takao', 'u48',
  'surcouf', 'iowa', 'yamato', 'enterprise', 'shinano'];

export function getClass(id) {
  return SHIP_CLASSES[id] || SHIP_CLASSES.fletcher;
}

/** Total number of barrels that can bear, used for the UI salvo readout. */
export function totalGuns(cls) {
  return cls.turrets.reduce((n, t) => n + t.guns, 0);
}

export const SHELL_TYPES = { AP, HE };
