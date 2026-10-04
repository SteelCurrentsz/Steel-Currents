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
            { x: -4.28, z: -11.2, angle: -0.45, arc: 2.09, guns: 2 },
            { x: 4.28, z: -11.2, angle: 0.45, arc: 2.09, guns: 2 },
            { x: -2.15, z: -32.2, angle: -2.6, arc: 2.09, guns: 2 },
            { x: 2.15, z: -32.2, angle: 2.6, arc: 2.09, guns: 2 },
            { x: 0, z: -54.8, angle: Math.PI, arc: 2.27, guns: 2 },
          ] },
        // Seven single Oerlikons: four round the bridge on the 01 level, two
        // in the waist at the deck edge, one right forward on the forecastle.
        // Written one mounting to a gun, because that is how she carried them
        // and how a captain picks one out of the arsenal.
        { name: '20mm Oerlikon', caliber: 20, role: 'aa', reload: 0.12, range: 1800,
          mounts: [
            { x: -3.5, z: 8.2, angle: -1.1, arc: 1.92, guns: 1 },
            { x: 3.5, z: 8.2, angle: 1.1, arc: 1.92, guns: 1 },
            { x: -4.5, z: 19.2, angle: -0.8, arc: 1.92, guns: 1 },
            { x: 4.5, z: 19.2, angle: 0.8, arc: 1.92, guns: 1 },
            { x: -3.9, z: -24, angle: -1.1, arc: 1.83, guns: 1 },
            { x: 3.9, z: -24, angle: 1.1, arc: 1.83, guns: 1 },
            { x: 0, z: 28, angle: 0, arc: 2.09, guns: 1 },
          ] },
      ],
    },
    // Two Mk 3 stern racks and six Mk 6 K-guns, with fifty-six Mk 6 charges
    // between them. This is the other half of what a Fletcher is for, and it
    // is fought quite unlike everything else on her: there is no laying and no
    // trigger, because a depth charge is not aimed. A pattern is put in the
    // water where the boat was a minute ago, it sinks at a known rate, and the
    // pistols fire at whatever depth the racks were set to on the way out.
    //
    // Every number here is the real gear's.
    depthCharges: {
      name: 'Mk 6 depth charge', role: 'sub',
      // Fifty-six charges, which is eight complete patterns and a spare.
      carried: 56,
      // Three hundred pounds of TNT going off against a pressure hull. A
      // submarine that takes one inside the lethal radius does not come up.
      damage: 10400,
      // How fast a Mk 6 sinks, in metres a second: the drum was ballasted for
      // about eight and a half feet a second, and everything about the attack
      // -- how far ahead of the boat to drop, how long to wait -- comes off it.
      sink: 2.6,
      // Metres of water before the pistol arms. It is what keeps a charge from
      // going off under the quarterdeck that rolled it, and it is why a ship
      // attacking wants steerage way: the arithmetic below is unforgiving of a
      // destroyer sitting still over her own pattern.
      arming: 9,
      // What the racks can be set to, and where they sit unless somebody says
      // otherwise. Shallow for a boat caught on the surface or diving, deep
      // for one that has had time to get down.
      settings: [15, 30, 55],
      set: 30,
      // Inside this the hull is opened; out to `hurt` she is shaken, sprung
      // and started, which is most of what depth charging actually did.
      lethal: 8.5,
      hurt: 22,
      // Seconds for a rack or a thrower to be reloaded by hand, which is what
      // decides how often a pattern can be put down.
      reload: 12,
      // How far a K-gun throws a charge out on the beam. The arbor was fired
      // by a powder cartridge and the charge went between fifty and a hundred
      // and fifty yards; the six throwers are loaded to three different
      // distances so the pattern comes down as a band across the boat's track
      // rather than a line down the ship's own wake. This is the default; each
      // thrower carries its own below.
      throw: 58,
      // What her QC sonar hears a submerged boat at. It is a searchlight and
      // not a radar: it gives a bearing and a range and nothing else, and it
      // is deaf astern where her own screws are.
      sonar: 2400,
      // And what it cannot do, which decides the whole of how an attack is
      // fought. The beam will not depress far enough to follow a boat under
      // the forefoot, so contact is lost at about a hundred and fifty metres
      // and the last part of every run is made blind on the plot; and the set
      // is drowned by her own flow noise above about twenty-four knots, so a
      // ship holding contact cannot also be going fast -- while a ship
      // dropping shallow charges had better be.
      sonarMin: 150,
      sonarSpeed: 24 * KNOTS,
      // The gear itself, where it stands on her. The model is built to these
      // stations and there is a check that walks both and compares, the same
      // way her guns and her tubes are held to her datasheet.
      racks: [
        { id: 0, x: -2.0, z: -55.0, my: 5.06, angle: Math.PI, arc: 0.45 },
        { id: 1, x: 2.0, z: -55.0, my: 5.06, angle: Math.PI, arc: 0.45 },
      ],
      throwers: [
        { id: 0, x: -4.35, z: -29.0, my: 5.42, angle: -Math.PI / 2, arc: 0.45, throw: 82 },
        { id: 1, x: 4.35, z: -29.0, my: 5.42, angle: Math.PI / 2, arc: 0.45, throw: 82 },
        { id: 2, x: -4.05, z: -34.0, my: 5.40, angle: -Math.PI / 2, arc: 0.45, throw: 58 },
        { id: 3, x: 4.05, z: -34.0, my: 5.40, angle: Math.PI / 2, arc: 0.45, throw: 58 },
        { id: 4, x: -3.62, z: -39.0, my: 5.36, angle: -Math.PI / 2, arc: 0.45, throw: 34 },
        { id: 5, x: 3.62, z: -39.0, my: 5.36, angle: Math.PI / 2, arc: 0.45, throw: 34 },
      ],
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
      //
      // Each trains a hundred and forty degrees either side of her centreline
      // and no further, the arc build/survey-spee-arcs.mjs finds clear of her
      // own tower and after superstructure at the height of the barrels. `my`
      // is the height of the muzzles over her waterline, off the same model.
      { id: 0, name: 'Anton', x: 0, z: 48.5, angle: 0, arc: 2.44, guns: 3, my: 8.63 },
      { id: 1, name: 'Bruno', x: 0, z: -42.0, angle: Math.PI, arc: 2.44, guns: 3, my: 8.17 },
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
        // On the lower quarterdeck abaft the break, a deck below the one the
        // after turret stands on, stowed fore and aft where the sculpt has them.
        //
        // Each bank fires from twenty-two degrees abaft her bow round to
        // twenty-two off her stern on its own side: forward, the break of her
        // quarterdeck stops the tubes; aft, her own stern stops the fish,
        // which would run into her counter laid any further round. Surveyed
        // off her model by build/survey-spee-arcs.mjs, and stowed at the
        // after end of it.
        { id: 0, x: -3.65, z: -72.5, angle: -Math.PI / 2, rest: -2.76, arc: 1.19, tubes: 4, my: 4.21 },
        { id: 1, x: 3.65, z: -72.5, angle: Math.PI / 2, rest: 2.76, arc: 1.19, tubes: 4, my: 4.18 },
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
      // Four a side on the main deck at the deck edge, outboard of the
      // superstructure: a pair abreast the tower and a pair abreast the boats
      // abaft the funnel, where the reference sculpt of her carries them.
      //
      // `angle` is the middle of what a mounting can be laid through, which
      // for a gun in the waist is the beam. `rest` is where it sits when it
      // has nothing to shoot at, which is a different thing: a wing mounting
      // is stowed trained fore and aft along her side, not out over it -- the
      // forward pair ahead and the after pair astern, as far round as her own
      // structure and the next mounting along let each of them go.
      //
      // Those arcs are not guessed: build/survey-spee-arcs.mjs lays each gun
      // round a degree at a time on the model she is drawn with and stops it
      // two degrees short of the first bearing its barrel would meet her own
      // steel. What stops each one is the next shield along her side, or the
      // sponson of the waist 10.5 cm between the two pairs: the foremost gun
      // each side trains from right ahead to eighteen degrees off her stern,
      // the aftermost from right astern to sixteen off her bow, and the two
      // between them cover the beam. Each pair port and starboard is given the
      // tighter of its two arcs, mirrored.
      mounts: [
        { x: -8.65, z: 18.75, angle: -1.42, rest: -0.02, arc: 1.4, guns: 1, my: 6.32 },
        { x: 8.65, z: 18.75, angle: 1.42, rest: 0.02, arc: 1.4, guns: 1, my: 6.33 },
        { x: -8.65, z: 11.75, angle: -1.3, rest: -0.26, arc: 1.04, guns: 1, my: 6.29 },
        { x: 8.65, z: 11.75, angle: 1.3, rest: 0.26, arc: 1.04, guns: 1, my: 6.3 },
        { x: -8.65, z: -8.6, angle: -1.54, rest: -2.84, arc: 1.3, guns: 1, my: 6.29 },
        { x: 8.65, z: -8.6, angle: 1.54, rest: 2.84, arc: 1.3, guns: 1, my: 6.29 },
        { x: -8.85, z: -15.55, angle: -1.73, rest: Math.PI, arc: 1.45, guns: 1, my: 6.29 },
        { x: 8.85, z: -15.55, angle: 1.73, rest: Math.PI, arc: 1.45, guns: 1, my: 6.31 },
      ],
    },
    aa: {
      range: 6000, dps: 46,
      guns: [
        // Three twin 10.5 cm: one each side abreast the funnel, on the sponsons
        // off the superstructure deck, and one on the after superstructure
        // forward of Bruno. These are her long-range flak, because her
        // fifteens will not point up.
        //
        // Every flak arc on her is surveyed the way her fifteens' are, with the
        // gun laid five degrees up -- a torpedo bomber low on the water, the
        // lowest it will ever be laid -- so wherever in its arc it follows an
        // aeroplane it is never laid through her own funnel or tower. The one
        // on her centreline stands over Bruno and fires over his roof, laid
        // fifteen up. `elev` is each gun's own stops.
        { name: '10.5 cm SK C/33', caliber: 105, role: 'aa', reload: 4.2, range: 6000,
          elev: { min: -0.14, max: 1.40 },
          mounts: [
            { x: -8.85, z: 6.6, angle: -1.63, arc: 1.63, guns: 2 },
            { x: 8.85, z: 6.6, angle: 1.63, arc: 1.63, guns: 2 },
            // Stowed on the beam: trained astern, her barrels are into
            // Bruno's rangefinder.
            { x: 0, z: -33.3, angle: Math.PI, arc: 2.74, rest: Math.PI / 2, guns: 2 },
          ] },
        // Two on the funnel platform, where her profile stands them, and two
        // on the after superstructure.
        { name: '3.7 cm SK C/30', caliber: 37, role: 'aa', reload: 0.7, range: 3000,
          elev: { min: -0.157, max: 1.48 },
          mounts: [
            { x: -4.0, z: 4.0, angle: -1.72, arc: 1.74, guns: 2 },
            { x: 4.0, z: 4.0, angle: 1.72, arc: 1.74, guns: 2 },
            { x: -5.4, z: -22, angle: -2.03, arc: 1.4, guns: 2 },
            { x: 5.4, z: -22, angle: 2.03, arc: 1.4, guns: 2 },
          ] },
        // Ten single 2 cm, spread from the forecastle to the quarterdeck.
        { name: '2 cm Flak 30', caliber: 20, role: 'aa', reload: 0.1, range: 1700,
          elev: { min: -0.19, max: 1.57 },
          mounts: [
            { x: -5.4, z: 40, angle: -1.46, arc: 1.49, guns: 1 },
            { x: 5.4, z: 40, angle: 1.46, arc: 1.49, guns: 1 },
            { x: -7.2, z: 27, angle: -1.33, arc: 1.4, guns: 1 },
            { x: 7.2, z: 27, angle: 1.33, arc: 1.4, guns: 1 },
            { x: -6.2, z: -6, angle: -1.18, arc: 0.64, guns: 1 },
            { x: 6.2, z: -6, angle: 1.18, arc: 0.64, guns: 1 },
            { x: -5.8, z: -32, angle: -1.72, arc: 1.49, guns: 1 },
            { x: 5.8, z: -32, angle: 1.72, arc: 1.49, guns: 1 },
            { x: -4.0, z: -55, angle: -2.8, arc: 2.68, guns: 1 },
            { x: 4.0, z: -55, angle: 2.8, arc: 2.68, guns: 1 },
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

  rodney: {
    // HMS Rodney, the second of the two Nelsons: nine 16-inch in three
    // triples, all of them forward of her bridge -- the whole of her main
    // battery on the forecastle, so that the belt over her magazines and
    // machinery could be short and thick inside the Washington limit. Her
    // twelve 6-inch are all aft, in six twin turrets round her after
    // superstructure, and she carries two 24.5-inch torpedo tubes in her bow,
    // which is how she became the only battleship ever to torpedo another.
    //
    // She is drawn from the owner's sculpt of her in her 1942 Admiralty
    // disruptive scheme (see rodney.js), at her own size: 216.4 m, 33.8 m
    // across the sculpt's widest, floated on the waterline its paint draws.
    id: 'rodney',
    name: 'Rodney',
    fullName: 'HMS Rodney',
    className: 'Nelson',
    type: 'BB',
    typeName: 'Battleship',
    nation: 'gbr',
    blurb: 'Nine sixteen-inch guns, every one of them forward of her bridge. She closed Bismarck to three miles and took her apart.',
    hull: { length: 216.4, beam: 33.8, draft: 8.6, superstructure: 1.45 },
    hp: 66800,
    // Twenty-three knots, and a tower like a sail on a short hull: she was a
    // handful at low speed and in a wind, and she turned like a block of flats.
    maxSpeed: 23 * KNOTS,
    reverseSpeed: 6 * KNOTS,
    accel: 0.36,
    turnRate: 0.049,
    rudderShift: 14.5,
    speedLossInTurn: 0.17,
    concealment: 15200,
    fireDetectPenalty: 6800,
    // Type 279 for aircraft and Type 284 for her main battery, by 1942.
    radarRange: 12500,
    repairCooldown: 100,
    repairHeal: 0.14,
    smokeCharges: 0,
    // Fourteen inches of belt over her magazines and thirteen over her
    // machinery, inclined eighteen degrees inside her plating, and six and a
    // quarter of deck over the magazines -- an all-or-nothing scheme on a
    // citadel short enough to afford it. Her ends are soft.
    armor: { belt: 356, deck: 159, citadel: 356, bow: 25, superstructure: 25 },
    turrets: [
      // A low on her forecastle, B superfiring over it, and X low again abaft
      // B and in front of her tower -- which could not fire past B's barbette
      // over the bow, nor back into her own bridge. Arcs and sectors are
      // measured off the model by build/survey-arcs.mjs (see layFloor in
      // sim.js).
      { id: 0, name: 'A', x: 0, z: 40.4, angle: 0.01, arc: 2.64, guns: 3, my: 11.72,
        lift: [[-2.63, -2.52, 0], [2.59, 2.67, 0]],
        mask: [[-2.61, -2.53, 0], [-0.22, -0.13, -0.008], [-0.14, 0.15, 0], [0.14, 0.21, -0.008],
          [2.6, 2.67, 0]] },
      { id: 1, name: 'B', x: 0, z: 21.9, angle: 0, arc: 3.03, guns: 3, my: 15.03,
        mask: [[-3.05, -2.99, 0.437], [-3, -2.95, 0.105], [-2.96, -2.94, 0.088],
          [-2.95, -2.92, -0.008], [2.92, 2.96, 0.088], [2.95, 3, 0.105], [2.99, 3.05, 0.437]] },
      { id: 2, name: 'X', x: 0, z: -1.1, angle: 0, arc: 2.63, guns: 3, my: 11.64,
        lift: [[-2.65, -2.57, 0.044], [-2.58, -2.55, 0.018]],
        mask: [[-2.65, -2.59, 0.044], [-2.6, -2.55, 0.018], [-0.38, -0.35, 0.105],
          [-0.36, -0.3, 0.35], [-0.31, -0.28, 0.262], [-0.29, -0.27, 0.35], [-0.28, -0.18],
          [-0.19, -0.16, 0.35], [-0.17, -0.07], [-0.08, 0.08, 0.35], [0.07, 0.17],
          [0.16, 0.19, 0.35], [0.18, 0.28], [0.27, 0.31, 0.262], [0.3, 0.36, 0.35],
          [2.39, 2.42, 0.009], [2.41, 2.44, 0.018], [2.43, 2.65, 0.027]] },
    ],
    gun: {
      name: '16"/45 Mk I', role: 'surface',
      // Three below the horizontal to forty up.
      elev: { min: -0.052, max: 0.70 },
      // Pivot to muzzle, the three turrets' mean: A's barrels are longest out
      // of her gunhouse and X's shortest, as the sculpt drew them.
      reach: 17.5,
      caliber: 406, reload: 30, traverse: 0.055, range: 20800, sigma: 1.45,
      // The light, fast 2,048 lb shell the Nelsons were given: 823 m/s.
      shells: shells(406, 13200, 6100, 610, 823, 0.26),
    },
    // Two 24.5-inch tubes under water in her bow, angled ten degrees off the
    // stem either side and fired on the bearing she is pointing, with a few
    // degrees of gyro angle. At the end against Bismarck she fired from both.
    torpedoes: {
      mounts: [
        { id: 0, x: 2.4, z: 72.0, angle: 0.17, arc: 0.3, tubes: 1, my: -3.6 },
        { id: 1, x: -2.4, z: 72.0, angle: -0.17, arc: 0.3, tubes: 1, my: -3.6 },
      ],
      name: '24.5" Mk I torpedo', role: 'surface', caliber: 622,
      tubeLabel: '24.5"',
      // Breech to the sluice door in her side the fish leaves by.
      reach: 8.1,
      inHull: true,
      // The tube does not train. What does is the gyro angle set on the fish
      // before it goes, which is a few seconds' work on a dial and turns it
      // up to seventeen degrees off the line of the tube once it is out.
      traverse: 0.35,
      // Oxygen-enriched air: fifteen thousand yards at thirty-five knots, and
      // much less of a wake than a cold-air fish.
      reload: 150, damage: 15600, speed: 35 * KNOTS, range: 13700,
      detection: 1300, arming: 450, spread: 0.05, floodChance: 0.40,
    },
    // Twelve 6-inch in six twin turrets, three a side round her after
    // superstructure: the forward and after pair on her upper deck, the middle
    // pair superfiring over them. The turret is the owner's own sculpt of it.
    // Arcs and sectors surveyed off the model as her turrets' are: none of
    // them bears across her on to the other beam.
    secondary: {
      name: '6"/50 Mk XXII', role: 'surface',
      // Five below the horizontal to sixty up, in the Mk XVIII turret.
      elev: { min: -0.087, max: 1.05 },
      reach: 8.4,
      caliber: 152, reload: 7.5, traverse: 0.14, range: 14000, sigma: 1.35,
      shells: shells(152, 2900, 2300, 150, 898, 0.10),
      mounts: [
        { x: 11.2, z: -60.4, angle: 1.09, arc: 1.57, rest: 0, guns: 2, my: 12.77,
          lift: [[-0.5, -0.44, -0.008]],
          mask: [[-0.5, -0.44], [-0.45, -0.32, 1.222], [-0.33, -0.27, 0.96], [-0.28, -0.25, 0.873],
            [-0.26, -0.21, 0.786], [-0.22, -0.11, 0.611], [-0.12, -0.07, 0.437],
            [-0.08, -0.06, 0.35], [-0.07, -0.04, 0.21], [-0.05, 0.05, 0.175], [0.04, 0.1, 0.14],
            [0.09, 0.12, 0.123], [0.11, 0.14, 0.088], [0.14, 0.21, -0.008]] },
        { x: -11.2, z: -60.4, angle: -1.09, arc: 1.57, rest: 0, guns: 2, my: 12.77,
          lift: [[0.44, 0.5, -0.008]],
          mask: [[-0.21, -0.14, -0.008], [-0.14, -0.11, 0.088], [-0.12, -0.09, 0.123],
            [-0.1, -0.04, 0.14], [-0.05, 0.05, 0.175], [0.04, 0.07, 0.21], [0.06, 0.08, 0.35],
            [0.07, 0.12, 0.437], [0.11, 0.22, 0.611], [0.21, 0.26, 0.786], [0.25, 0.28, 0.873],
            [0.27, 0.33, 0.96], [0.32, 0.45, 1.222], [0.44, 0.5]] },
        { x: 10.9, z: -69.7, angle: 1.4, arc: 1.98, rest: 0, guns: 2, my: 14.57,
          lift: [[-0.61, -0.54, 0.018]],
          mask: [[-0.61, -0.54, 0.611], [-0.55, -0.46, 0.786], [-0.47, -0.35, 0.699],
            [-0.36, -0.3, 0.96], [-0.31, -0.25, 1.048], [-0.26, -0.23, 0.96], [-0.24, -0.21, 0.786],
            [-0.22, -0.18, 0.699], [-0.19, -0.16, 0.611], [-0.17, -0.14, 0.524],
            [-0.15, -0.07, 0.437], [-0.08, -0.02, 0.21], [-0.03, 0, 0.035], [-0.01, 0.05, 0],
            [0.04, 0.08, -0.008]] },
        { x: -10.9, z: -69.7, angle: -1.4, arc: 1.98, rest: 0, guns: 2, my: 14.57,
          lift: [[0.54, 0.61, 0.018]],
          mask: [[-0.08, -0.04, -0.008], [-0.05, 0.01, 0], [0, 0.03, 0.035], [0.02, 0.08, 0.21],
            [0.07, 0.15, 0.437], [0.14, 0.17, 0.524], [0.16, 0.19, 0.611], [0.18, 0.22, 0.699],
            [0.21, 0.24, 0.786], [0.23, 0.26, 0.96], [0.25, 0.31, 1.048], [0.3, 0.36, 0.96],
            [0.35, 0.47, 0.699], [0.46, 0.55, 0.786], [0.54, 0.61, 0.611]] },
        { x: 9.05, z: -78.1, angle: 2.35, arc: 1.42, rest: Math.PI, guns: 2, my: 11.27,
          lift: [[-2.7, -2.66, 0.027], [-2.67, -2.55, 0.035], [-2.56, -2.5, 0.044]],
          mask: [[2.9, 2.93, 0], [2.92, 3, 0.035], [3.06, 3.14, 0.044], [3.13, -3.11, 0.035],
            [-3.12, -2.92, 0.044], [-2.93, -2.9, 0.027], [-2.91, -2.85, 0.262],
            [-2.86, -2.83, 0.14], [-2.84, -2.81, 0.009], [-2.82, -2.76, 0.21],
            [-2.77, -2.74, 0.123], [-2.75, -2.71, 0.035], [-2.72, -2.64, 0.044],
            [-2.65, -2.57, 0.035], [-2.58, -2.5, 0.262]] },
        { x: -9.05, z: -78.1, angle: -2.35, arc: 1.42, rest: Math.PI, guns: 2, my: 11.27,
          lift: [[2.5, 2.56, 0.044], [2.55, 2.67, 0.035], [2.66, 2.7, 0.027]],
          mask: [[2.5, 2.58, 0.262], [2.57, 2.65, 0.035], [2.64, 2.72, 0.044], [2.71, 2.75, 0.035],
            [2.74, 2.77, 0.123], [2.76, 2.82, 0.21], [2.81, 2.84, 0.009], [2.83, 2.86, 0.14],
            [2.85, 2.91, 0.262], [2.9, 2.93, 0.027], [2.92, 3.12, 0.044], [3.11, -3.13, 0.035],
            [-3.14, -3.06, 0.044], [-3, -2.92, 0.035], [-2.93, -2.9, 0]] },
      ],
    },
    // And her light battery's, the same way: a high-angle gun has most of the
    // sky, and is held up over her where its barrels would go into her.
    aa: {
      range: 5200, dps: 78,
      guns: [
        // Six 4.7-inch HA singles on her upper deck either side of her after
        // superstructure, where the sculpt stands them.
        { name: '4.7" QF Mk VIII', caliber: 120, role: 'dp', reload: 3.6, range: 5200,
          elev: { min: -0.087, max: 1.57 },
          mounts: [
            { x: 10.5, z: -48.3, angle: 2.41, arc: 1.83, rest: Math.PI / 2, guns: 1, my: 11.16,
              lift: [[0.56, 0.62, 0.123], [0.61, 0.64, 0.044], [0.63, 0.66, -0.008],
                [-2.81, -2.76, 0.07], [-2.77, -2.64, 0.088], [-2.65, -2.59, 0.262],
                [-2.6, -2.17, 0.35], [-2.18, -2.15, 0.262], [-2.16, -2.13, 0.175],
                [-2.14, -2.1, 0.35], [-2.11, -2.03, 0.437]],
              mask: [[0.56, 0.61, 0.123], [0.6, 0.62, 0.044], [0.61, 0.64, -0.008],
                [2.81, 2.84, 0.027], [2.83, -2.95, 0.35], [-2.96, -2.85, 0.437],
                [-2.86, -2.8, 0.786], [-2.81, -2.76, 0.524], [-2.77, -2.74, 0.699],
                [-2.75, -2.71, 0.786], [-2.72, -2.66, 1.397], [-2.67, -2.59, 1.222],
                [-2.6, -2.52, 1.048], [-2.53, -2.48, 0.96], [-2.49, -2.41, 1.048],
                [-2.42, -2.39, 0.96], [-2.4, -2.38, 0.611], [-2.39, -2.19, 0.524],
                [-2.2, -2.03, 0.611]] },
            { x: -10.5, z: -48.3, angle: -2.41, arc: 1.83, rest: -Math.PI / 2, guns: 1, my: 11.13,
              lift: [[2.03, 2.11, 0.437], [2.1, 2.14, 0.35], [2.13, 2.16, 0.175],
                [2.15, 2.18, 0.262], [2.17, 2.6, 0.35], [2.59, 2.65, 0.262], [2.64, 2.77, 0.088],
                [2.76, 2.81, 0.07], [-0.66, -0.63, -0.008], [-0.64, -0.61, 0.044],
                [-0.62, -0.56, 0.123]],
              mask: [[2.03, 2.2, 0.611], [2.19, 2.39, 0.524], [2.38, 2.4, 0.611],
                [2.39, 2.42, 0.96], [2.41, 2.49, 1.048], [2.48, 2.53, 0.96], [2.52, 2.6, 1.048],
                [2.59, 2.67, 1.222], [2.66, 2.72, 1.397], [2.71, 2.75, 0.786], [2.74, 2.77, 0.699],
                [2.76, 2.81, 0.524], [2.8, 2.86, 0.786], [2.85, 2.96, 0.437], [2.95, -2.83, 0.35],
                [-2.84, -2.81, 0.027], [-0.64, -0.61, -0.008], [-0.62, -0.6, 0.044],
                [-0.61, -0.56, 0.123]] },
            { x: 11, z: -39.3, angle: 0.73, arc: 3.03, rest: Math.PI / 2, guns: 1, my: 11.04,
              lift: [[-2.32, -2.26, 0.009], [-1.92, -1.89, 0.175], [-1.9, -1.87, 0.21],
                [-1.88, -1.84, 0.262], [-1.85, -1.73, 0.35], [-1.74, -1.37, 0.437],
                [-1.38, -1.31, 0.35], [-1.32, -1.28, 0.262], [-1.29, -1.26, -0.008],
                [-1.27, -1.16, -0.026], [-1.17, -1.02, 0.35], [-1.03, -1, 0.262],
                [-1.01, -0.98, 0.175], [-0.99, -0.96, 0.14], [-0.97, -0.95, 0.044],
                [-2.72, -2.62, -0.026], [-2.58, -2.55, 0.009], [-2.56, -2.5, 0.044]],
              mask: [[-2.32, -2.1, 1.397], [-2.11, -1.91, 1.571], [-1.92, -1.66, 1.397],
                [-1.67, -1.21, 0.873], [-1.22, -1.19, 0.96], [-1.2, -1.14, 1.222],
                [-1.15, -1.12, 1.048], [-1.13, -1.09, 0.96], [-1.1, -0.72, 1.397],
                [-0.73, -0.56, 1.222], [-0.57, -0.54, 1.048], [-0.55, -0.49, 1.222],
                [-0.5, -0.35, 1.048], [-0.36, -0.2, 0.524], [-0.21, -0.07, 0.262],
                [-0.08, -0.06, 0.21], [-0.07, -0.04, 0.175], [-0.05, 0.03, 0.14],
                [0.02, 0.05, 0.027], [0.04, 0.12, 0.009], [0.11, 0.15, -0.008], [0.14, 0.17, 0.044],
                [0.16, 0.38, 0.07], [2.85, 2.88, -0.026], [2.87, 2.98, -0.008], [2.97, 3.03, 0.175],
                [3.02, -3.06, 0.21], [-3.07, -3.04, 0.262], [-3.05, -2.99, 0.524],
                [-3, -2.95, 0.262], [-2.96, -2.87, 0.786], [-2.88, -2.85, 0.611],
                [-2.86, -2.83, 0.96], [-2.84, -2.71, 1.222], [-2.72, -2.69, 1.048],
                [-2.7, -2.67, 1.222], [-2.68, -2.5, 1.397]] },
            { x: -11, z: -39.3, angle: -0.73, arc: 3.03, rest: -Math.PI / 2, guns: 1, my: 11.05,
              lift: [[2.5, 2.56, 0.044], [2.55, 2.58, 0.009], [2.62, 2.72, -0.026],
                [0.95, 0.97, 0.044], [0.96, 0.99, 0.14], [0.98, 1.01, 0.175], [1, 1.03, 0.262],
                [1.02, 1.17, 0.35], [1.16, 1.27, -0.026], [1.26, 1.29, -0.008], [1.28, 1.32, 0.262],
                [1.31, 1.38, 0.35], [1.37, 1.74, 0.437], [1.73, 1.85, 0.35], [1.84, 1.88, 0.262],
                [1.87, 1.9, 0.21], [1.89, 1.92, 0.175], [2.26, 2.32, 0.009]],
              mask: [[2.5, 2.68, 1.397], [2.67, 2.7, 1.222], [2.69, 2.72, 1.048],
                [2.71, 2.84, 1.222], [2.83, 2.86, 0.96], [2.85, 2.88, 0.611], [2.87, 2.96, 0.786],
                [2.95, 3, 0.262], [2.99, 3.05, 0.524], [3.04, 3.07, 0.262], [3.06, -3.02, 0.21],
                [-3.03, -2.97, 0.175], [-2.98, -2.87, -0.008], [-2.88, -2.85, -0.026],
                [-0.38, -0.16, 0.07], [-0.17, -0.14, 0.044], [-0.15, -0.11, -0.008],
                [-0.12, -0.04, 0.009], [-0.05, -0.02, 0.027], [-0.03, 0.05, 0.14],
                [0.04, 0.07, 0.175], [0.06, 0.08, 0.21], [0.07, 0.21, 0.262], [0.2, 0.36, 0.524],
                [0.35, 0.5, 1.048], [0.49, 0.55, 1.222], [0.54, 0.57, 1.048], [0.56, 0.73, 1.222],
                [0.72, 1.1, 1.397], [1.09, 1.13, 0.96], [1.12, 1.15, 1.048], [1.14, 1.2, 1.222],
                [1.19, 1.22, 0.96], [1.21, 1.67, 0.873], [1.66, 1.92, 1.397], [1.91, 2.11, 1.571],
                [2.1, 2.32, 1.397]] },
            { x: 10, z: -30.4, angle: 2.07, arc: 1.84, rest: Math.PI / 2, guns: 1, my: 11.18,
              mask: [[0.21, 0.33, -0.026], [0.46, 0.48, 0.044], [0.47, 0.5, 0.07],
                [0.49, 0.52, 0.088], [0.51, 0.54, 0.105], [0.53, 0.64, 0.123], [0.63, 0.85, 0.105],
                [2.83, 2.86, -0.026], [2.85, 2.88, 0.027], [2.87, 2.96, 0.123], [2.95, 2.98, 0.105],
                [2.97, 3.03, 0.123], [3.02, 3.05, 0.14], [3.04, 3.09, 0.21], [3.08, -3.09, 0.262],
                [-3.1, -3.06, 0.35], [-3.07, -3.02, 0.524], [-3.03, -3.01, 0.611],
                [-3.02, -2.97, 0.873], [-2.98, -2.92, 0.96], [-2.93, -2.87, 1.048],
                [-2.88, -2.81, 1.222], [-2.82, -2.76, 0.873], [-2.77, -2.74, 0.786],
                [-2.75, -2.64, 0.873], [-2.65, -2.5, 0.96], [-2.51, -2.43, 1.048],
                [-2.44, -2.41, 0.96], [-2.42, -2.36, 0.873]] },
            { x: -10, z: -30.4, angle: -2.07, arc: 1.84, rest: -Math.PI / 2, guns: 1, my: 11.2,
              mask: [[2.36, 2.42, 0.873], [2.41, 2.44, 0.96], [2.43, 2.51, 1.048],
                [2.5, 2.65, 0.96], [2.64, 2.75, 0.873], [2.74, 2.77, 0.786], [2.76, 2.82, 0.873],
                [2.81, 2.88, 1.222], [2.87, 2.93, 1.048], [2.92, 2.98, 0.96], [2.97, 3.02, 0.873],
                [3.01, 3.03, 0.611], [3.02, 3.07, 0.524], [3.06, 3.1, 0.35], [3.09, -3.08, 0.262],
                [-3.09, -3.04, 0.21], [-3.05, -3.02, 0.14], [-3.03, -2.97, 0.123],
                [-2.98, -2.95, 0.105], [-2.96, -2.87, 0.123], [-2.88, -2.85, 0.027],
                [-2.86, -2.83, -0.026], [-0.85, -0.63, 0.105], [-0.64, -0.53, 0.123],
                [-0.54, -0.51, 0.105], [-0.52, -0.49, 0.088], [-0.5, -0.47, 0.07],
                [-0.48, -0.46, 0.044], [-0.33, -0.21, -0.026]] },
          ] },
        // Her pom-poms: an eight-barrelled Mk VI on each of the platforms
        // either side of her funnel, and a four-barrelled Mk VII in each of
        // the tubs abreast her mainmast.
        { name: '2-pdr Mk VIII', caliber: 40, role: 'aa', reload: 0.5, range: 3400,
          elev: { min: -0.17, max: 1.40 },
          mounts: [
            { x: 6.2, z: -43.3, angle: 1.35, arc: 1.89, rest: Math.PI / 2, guns: 8, my: 18.93,
              lift: [[-0.21, -0.18, 0.262], [-0.19, 0.1, 0.35], [0.09, 0.12, 0.262]],
              mask: [[-0.55, -0.2], [-0.21, -0.18, 1.571], [-0.19, -0.16, 1.222], [-0.17, 0, 0.786],
                [-0.01, 0.03, 0.699], [0.02, 0.08, 0.35], [0.07, 0.1, 0.262], [0.09, 0.12, 0.175],
                [0.11, 0.29, 0.088], [0.28, 0.48, 0.07], [0.47, 0.54, 0.044], [0.53, 0.59, 0.027],
                [0.58, 0.61, -0.008], [0.6, 0.62, -0.026], [2.83, 2.86, -0.026],
                [2.85, 2.88, -0.008], [2.87, 2.89, 0.009], [2.88, 2.91, 0.044], [2.9, 2.93, 0.07],
                [2.92, 2.95, 0.105], [2.94, 2.96, 0.14], [2.95, 3, 0.175], [2.99, 3.03, 0.262],
                [3.02, 3.05, 0.437], [3.04, -3.02, 0.699]] },
            { x: -6.2, z: -43.3, angle: -1.35, arc: 1.89, rest: -Math.PI / 2, guns: 8, my: 17.97,
              lift: [[-0.12, -0.09, 0.262], [-0.1, 0.19, 0.35], [0.18, 0.21, 0.262]],
              mask: [[3.02, -3.04, 0.699], [-3.05, -3.02, 0.437], [-3.03, -2.99, 0.262],
                [-3, -2.95, 0.175], [-2.96, -2.94, 0.14], [-2.95, -2.92, 0.105],
                [-2.93, -2.9, 0.07], [-2.91, -2.88, 0.044], [-2.89, -2.87, 0.009],
                [-2.88, -2.85, -0.008], [-2.86, -2.83, -0.026], [-0.62, -0.6, -0.026],
                [-0.61, -0.58, -0.008], [-0.59, -0.53, 0.027], [-0.54, -0.47, 0.044],
                [-0.48, -0.28, 0.07], [-0.29, -0.11, 0.088], [-0.12, -0.09, 0.175],
                [-0.1, -0.07, 0.262], [-0.08, -0.02, 0.35], [-0.03, 0.01, 0.699], [0, 0.17, 0.786],
                [0.16, 0.19, 1.222], [0.18, 0.21, 1.571], [0.2, 0.55]] },
            { x: 7.4, z: -72.8, angle: 0.03, arc: 2.43, rest: Math.PI / 2, guns: 4, my: 16.49,
              lift: [[2.31, 2.34, -0.026], [2.33, 2.35, 0.027], [2.34, 2.37, 0.105],
                [2.36, 2.39, 0.175], [2.38, 2.4, 0.262], [2.39, 2.47, 0.35]],
              mask: [[-2.42, -2.33, 0.07], [-2.34, -2.27, 0.044], [-2.28, -2.22, 0.07],
                [-2.23, -2.2, 0.044], [-2.21, -2.15, -0.008], [-2.09, -2.03, 0.027],
                [-2.04, -1.98, -0.026], [-1.99, -1.92, 0.027], [-1.93, -1.87, -0.026],
                [-1.78, -1.75, -0.026], [-1.76, -1.66, 0.105], [-1.67, -1.59, 0.175],
                [-1.6, -1.57, 0.262], [-1.58, -1.54, 0.35], [-1.55, -1.5, 0.437],
                [-1.51, -1.49, 1.222], [-1.5, -1.14], [-1.15, -1.02, 1.571], [-1.03, -0.23],
                [-0.24, -0.02, 1.397], [-0.03, 0.03, 0.123], [0.02, 0.05, 0.088],
                [0.04, 0.08, 0.044], [0.07, 0.12, -0.026], [2.33, 2.35, -0.026],
                [2.34, 2.37, 0.027], [2.36, 2.39, 0.105], [2.38, 2.4, 0.175], [2.39, 2.42, 0.262],
                [2.41, 2.47, 0.35]] },
            { x: -7.4, z: -72.8, angle: -0.03, arc: 2.43, rest: -Math.PI / 2, guns: 4, my: 16.46,
              lift: [[-2.47, -2.39, 0.35], [-2.4, -2.38, 0.262], [-2.39, -2.36, 0.175],
                [-2.37, -2.34, 0.105], [-2.35, -2.33, 0.027], [-2.34, -2.31, -0.026]],
              mask: [[-2.47, -2.41, 0.35], [-2.42, -2.39, 0.262], [-2.4, -2.38, 0.175],
                [-2.39, -2.36, 0.105], [-2.37, -2.34, 0.027], [-2.35, -2.33, -0.026],
                [-0.12, -0.07, -0.026], [-0.08, -0.04, 0.044], [-0.05, -0.02, 0.088],
                [-0.03, 0.03, 0.123], [0.02, 0.24, 1.397], [0.23, 1.03], [1.02, 1.15, 1.571],
                [1.14, 1.5], [1.49, 1.51, 1.222], [1.5, 1.55, 0.437], [1.54, 1.58, 0.35],
                [1.57, 1.6, 0.262], [1.59, 1.67, 0.175], [1.66, 1.76, 0.105], [1.75, 1.78, -0.026],
                [1.87, 1.93, -0.026], [1.92, 1.99, 0.027], [1.98, 2.04, -0.026],
                [2.03, 2.09, 0.027], [2.15, 2.21, -0.008], [2.2, 2.23, 0.044], [2.22, 2.28, 0.07],
                [2.27, 2.34, 0.044], [2.33, 2.42, 0.07]] },
          ] },
        // And the Oerlikons she had by 1942: on her forecastle clear of A's
        // muzzles, on the platforms either side of her tower, and on her
        // quarterdeck.
        { name: '20mm Oerlikon', caliber: 20, role: 'aa', reload: 0.12, range: 1800,
          elev: { min: -0.17, max: 1.48 },
          mounts: [
            { x: 5.5, z: 66, angle: 1.98, arc: 3, rest: 0.6, guns: 1, my: 11.34,
              mask: [[-1.04, -0.81, 0.027], [-0.82, -0.35, 0.044], [-0.36, -0.32, 0.027],
                [-0.33, -0.2, 0.009], [-0.21, -0.11, 0.027], [-0.12, 0.17, 0.009],
                [0.16, 0.31, -0.008], [0.3, 0.66, -0.026], [2.34, 2.7, -0.026],
                [2.69, 2.88, -0.008], [2.87, 3, 0.009], [2.99, 3.07, 0.027], [3.06, 3.1, 0.044],
                [3.09, 3.12, 0.105], [3.11, 3.14, 0.262], [3.13, -3.11, 0.35],
                [-3.12, -3.06, 0.437], [-3.07, -3.01, 0.35], [-3.02, -2.71, 0.175],
                [-2.72, -2.69, 0.123], [-2.7, -2.67, 0.088], [-2.68, -2.66, 0.027],
                [-2.67, -2.59, 0.009], [-2.6, -1.59, -0.008], [-1.6, -1.54, 0.009],
                [-1.55, -1.52, -0.008], [-1.53, -1.43, 0.262], [-1.44, -1.33, -0.008],
                [-1.34, -1.3, 0.437]] },
            { x: -5.5, z: 66, angle: -1.98, arc: 3, rest: -0.6, guns: 1, my: 11.3,
              mask: [[1.3, 1.34, 0.437], [1.33, 1.44, -0.008], [1.43, 1.53, 0.262],
                [1.52, 1.55, -0.008], [1.54, 1.6, 0.009], [1.59, 2.6, -0.008], [2.59, 2.67, 0.009],
                [2.66, 2.68, 0.027], [2.67, 2.7, 0.088], [2.69, 2.72, 0.123], [2.71, 3.02, 0.175],
                [3.01, 3.07, 0.35], [3.06, 3.12, 0.437], [3.11, -3.13, 0.35], [-3.14, -3.11, 0.262],
                [-3.12, -3.09, 0.105], [-3.1, -3.06, 0.044], [-3.07, -2.99, 0.027],
                [-3, -2.87, 0.009], [-2.88, -2.69, -0.008], [-2.7, -2.34, -0.026],
                [-0.66, -0.3, -0.026], [-0.31, -0.16, -0.008], [-0.17, 0.12, 0.009],
                [0.11, 0.21, 0.027], [0.2, 0.33, 0.009], [0.32, 0.36, 0.027], [0.35, 0.82, 0.044],
                [0.81, 1.04, 0.027]] },
            { x: 6.3, z: -16.4, angle: 1.27, arc: 1.88, rest: Math.PI / 2, guns: 1, my: 12.54,
              mask: [[-0.62, -0.56, 0.35], [-0.57, -0.54, 0.175], [-0.55, -0.53, 0.21],
                [-0.54, -0.25, 0.437], [-0.26, -0.23, 0.35], [-0.24, -0.06, 0.262],
                [-0.07, -0.02, 0.21], [-0.03, 0, 0.123], [-0.01, 0.01, 0.088], [0, 0.03, 0.009],
                [0.02, 0.15, -0.008], [0.14, 0.38, -0.026], [2.08, 2.14, -0.026],
                [2.13, 2.18, -0.008], [2.17, 2.39, 0.009], [2.74, 2.77, 0.14], [2.76, 2.89, 0.175],
                [2.88, 2.91, 0.262], [2.9, 2.95, 0.35], [2.94, 3.03, 0.873], [3.02, 3.09, 0.35],
                [3.08, -3.11, 0.96]] },
            { x: -6.3, z: -16.4, angle: -1.27, arc: 1.88, rest: -Math.PI / 2, guns: 1, my: 12.53,
              mask: [[3.11, -3.08, 0.96], [-3.09, -3.02, 0.35], [-3.03, -2.94, 0.873],
                [-2.95, -2.9, 0.35], [-2.91, -2.88, 0.262], [-2.89, -2.76, 0.175],
                [-2.77, -2.74, 0.14], [-2.39, -2.17, 0.009], [-2.18, -2.13, -0.008],
                [-2.14, -2.08, -0.026], [-0.38, -0.14, -0.026], [-0.15, -0.02, -0.008],
                [-0.03, 0, 0.009], [-0.01, 0.01, 0.088], [0, 0.03, 0.123], [0.02, 0.07, 0.21],
                [0.06, 0.24, 0.262], [0.23, 0.26, 0.35], [0.25, 0.54, 0.437], [0.53, 0.55, 0.21],
                [0.54, 0.57, 0.175], [0.56, 0.62, 0.35]] },
            { x: 4.5, z: -93, angle: 2.94, arc: 3.08, rest: 2.4, guns: 1, my: 11.21,
              mask: [[-0.15, -0.11, 0.96], [-0.12, -0.09, 0.699], [-0.1, 0.05, 0.96],
                [0.04, 0.07, 0.35], [0.06, 0.12, 0.437], [0.11, 0.17, 0.524], [0.16, 0.19, 0.437],
                [0.18, 0.42, 0.35], [0.41, 0.5, 0.14], [0.51, 0.64, -0.026], [0.63, 0.66, -0.008],
                [0.65, 0.68, 0.027], [0.67, 0.69, 0.07], [0.68, 0.71, 0.105], [0.7, 0.76, 0.175],
                [0.75, 0.83, 0.21], [0.82, 0.85, 0.027], [0.84, 0.87, -0.008], [0.86, 0.89, 0.009],
                [0.88, 0.94, 0.175], [2.99, -2.97, -0.026], [-2.98, -2.88, -0.008],
                [-2.89, -2.87, 0.044], [-2.88, -2.85, 0.35], [-2.86, -2.78, 0.524],
                [-2.79, -2.76, 0.35], [-2.77, -2.74, 0.07], [-2.75, -2.73, 0.009],
                [-2.74, -2.69, -0.008], [-2.7, -2.67, 0.044], [-2.68, -2.43, 0.07],
                [-2.44, -2.38, 0.044], [-2.39, -2.34, 0.07], [-2.35, -2.29, 0.088],
                [-2.3, -2.24, 0.105], [-2.25, -2.2, 0.123], [-2.21, -2.06, 0.262],
                [-2.07, -2.05, 0.21], [-2.06, -1.98, 0.175], [-1.99, -1.94, 0.21],
                [-1.95, -1.85, 0.262], [-1.86, -1.54, 0.35], [-1.55, -1.49, 0.262],
                [-1.5, -1.47, 0.21], [-1.48, -1.42, 0.175], [-1.43, -1.4, 0.14],
                [-1.41, -1.38, 0.123], [-1.39, -1.33, 0.105], [-1.34, -1.26, 0.262],
                [-1.27, -1.17, 0.21], [-1.18, -0.89, 0.105], [-0.9, -0.81, 0.175],
                [-0.82, -0.79, 0.35], [-0.8, -0.65, 0.699], [-0.66, -0.51, 0.611],
                [-0.52, -0.47, 0.524], [-0.48, -0.42, 0.699], [-0.43, -0.39, 0.611],
                [-0.4, -0.34, 0.786], [-0.35, -0.32, 0.611], [-0.33, -0.3, 0.699],
                [-0.31, -0.23, 0.96]] },
            { x: -4.5, z: -93, angle: -2.94, arc: 3.08, rest: -2.4, guns: 1, my: 11.19,
              mask: [[0.23, 0.31, 0.96], [0.3, 0.33, 0.699], [0.32, 0.35, 0.611],
                [0.34, 0.4, 0.786], [0.39, 0.43, 0.611], [0.42, 0.48, 0.699], [0.47, 0.52, 0.524],
                [0.51, 0.66, 0.611], [0.65, 0.8, 0.699], [0.79, 0.82, 0.35], [0.81, 0.9, 0.175],
                [0.89, 1.18, 0.105], [1.17, 1.27, 0.21], [1.26, 1.34, 0.262], [1.33, 1.39, 0.105],
                [1.38, 1.41, 0.123], [1.4, 1.43, 0.14], [1.42, 1.48, 0.175], [1.47, 1.5, 0.21],
                [1.49, 1.55, 0.262], [1.54, 1.86, 0.35], [1.85, 1.95, 0.262], [1.94, 1.99, 0.21],
                [1.98, 2.06, 0.175], [2.05, 2.07, 0.21], [2.06, 2.21, 0.262], [2.2, 2.25, 0.123],
                [2.24, 2.3, 0.105], [2.29, 2.35, 0.088], [2.34, 2.39, 0.07], [2.38, 2.44, 0.044],
                [2.43, 2.68, 0.07], [2.67, 2.7, 0.044], [2.69, 2.74, -0.008], [2.73, 2.75, 0.009],
                [2.74, 2.77, 0.07], [2.76, 2.79, 0.35], [2.78, 2.86, 0.524], [2.85, 2.88, 0.35],
                [2.87, 2.89, 0.044], [2.88, 2.98, -0.008], [2.97, -2.99, -0.026],
                [-0.94, -0.88, 0.175], [-0.89, -0.86, 0.009], [-0.87, -0.84, -0.008],
                [-0.85, -0.82, 0.027], [-0.83, -0.75, 0.21], [-0.76, -0.7, 0.175],
                [-0.71, -0.68, 0.105], [-0.69, -0.67, 0.07], [-0.68, -0.65, 0.027],
                [-0.66, -0.63, -0.008], [-0.64, -0.51, -0.026], [-0.5, -0.41, 0.14],
                [-0.42, -0.18, 0.35], [-0.19, -0.16, 0.437], [-0.17, -0.11, 0.524],
                [-0.12, -0.06, 0.437], [-0.07, -0.04, 0.35], [-0.05, 0.1, 0.96],
                [0.09, 0.12, 0.699], [0.11, 0.15, 0.96]] },
          ] },
      ],
    },
    planes: null,
    datasheet: {
      displacement: 33900,
      aircraft: 0,
      mainRounds: 900,
      torpedoesCarried: 12,
      secondary: { caliber: 152, label: '6"', barrels: 12, rounds: 1800 },
      tertiary: [
        { caliber: 120, label: '4.7"', barrels: 6, rounds: 1200 },
        { caliber: 40, label: '2-pdr', barrels: 24, rounds: 43200 },
        { caliber: 20, label: '20mm', barrels: 6, rounds: 14400 },
      ],
    },
  },

  massachusetts: {
    // USS Massachusetts, the third of the four South Dakotas: nine 16-inch/45
    // in three triple turrets on a hull thirty-five metres shorter than an
    // Iowa's, with her belt inclined inside her so that twelve inches of it
    // would do the work of more. Twenty 5-inch in ten twin mounts, five a
    // side round her single funnel, and by 1945 a light battery of quad
    // Bofors and Oerlikons on every deck that would take one.
    //
    // She is drawn from the owner's sculpt of her (see massachusetts.js), at
    // her own length -- 207.26 m -- and across the sculpt's widest, floated at
    // 9.0 m, in Measure 22.
    id: 'massachusetts',
    name: 'Massachusetts',
    fullName: 'USS Massachusetts',
    className: 'South Dakota',
    type: 'BB',
    typeName: 'Battleship',
    nation: 'usa',
    blurb: 'Nine sixteen-inch guns and an inclined belt on a hull built short to carry them. Big Mamie fired the first and the last American sixteen-inch shells of the war.',
    hull: { length: 207.26, beam: 28.1, draft: 9.0, superstructure: 1.4 },
    hp: 66000,
    // Twenty-seven and a half knots, and a short hull that turned tighter than
    // anything else in the battle line.
    maxSpeed: 27.5 * KNOTS,
    reverseSpeed: 6.5 * KNOTS,
    accel: 0.40,
    turnRate: 0.056,
    rudderShift: 13.0,
    speedLossInTurn: 0.17,
    concealment: 15300,
    fireDetectPenalty: 6400,
    // SK and SG search sets, and a Mk 8 on each main battery director.
    radarRange: 13500,
    repairCooldown: 100,
    repairHeal: 0.14,
    smokeCharges: 0,
    // Twelve and a quarter inches of belt, inclined nineteen degrees inside
    // her plating, over her magazines and machinery, and six inches of deck
    // over it; seventeen and a quarter on her barbettes and eighteen on her
    // turret faces. An all-or-nothing citadel: her ends are soft.
    armor: { belt: 310, deck: 152, citadel: 310, bow: 38, superstructure: 38 },
    turrets: [
      // No.1 on her forecastle, No.2 superfiring over it, and No.3 on her
      // quarterdeck facing astern -- each on the middle of the barbette the
      // sculpt drew it on. Arcs and sectors are measured off the model by
      // build/survey-arcs.mjs (see layFloor in sim.js).
      { id: 0, name: 'No.1', x: 0.1, z: 44.75, angle: -0.04, arc: 2.73, guns: 3, my: 8.45,
        lift: [[-2.79, -2.64, 0.175], [-2.65, -2.6, 0.123], [2.6, 2.65, 0.123], [2.64, 2.7, 0.175]],
        mask: [[-2.79, -2.66, 0.175], [-2.67, -2.62, 0.123], [-2.63, -2.48, 0.018],
          [-2.49, -2.46, 0], [-2.47, -2.45, -0.008], [-0.36, -0.34, -0.008], [-0.35, -0.32, 0.009],
          [-0.33, -0.3, 0.027], [-0.31, -0.28, 0.044], [-0.29, -0.04, 0.07], [-0.05, 0.05, 0.053],
          [0.04, 0.29, 0.07], [0.28, 0.33, 0.044], [0.32, 0.35, 0.009], [0.34, 0.36, -0.008],
          [2.46, 2.49, -0.008], [2.48, 2.51, 0], [2.5, 2.63, 0.018], [2.62, 2.67, 0.123],
          [2.66, 2.7, 0.175]] },
      { id: 1, name: 'No.2', x: 0, z: 23.9, angle: 0, arc: 2.53, guns: 3, my: 9.96,
        lift: [[-2.54, -2.27, 0.035], [-2.28, -2.26, 0.027], [-2.27, -2.22, 0], [-0.71, -0.42, 0],
          [-0.43, -0.41, 0.009], [-0.42, -0.3, 0.044], [-0.31, -0.27, 0.035], [-0.28, -0.16, 0.044],
          [-0.17, -0.13, 0.035], [-0.14, -0.04, 0.044], [-0.05, -0.02, 0.035], [-0.03, 0.05, 0.009],
          [0.04, 0.15, 0.035], [0.14, 0.17, 0.018], [0.16, 0.26, 0.035], [0.25, 0.29, 0.027],
          [0.28, 0.38, 0.035], [0.37, 0.42, 0.018], [0.41, 0.55, 0], [0.54, 0.68, 0.009],
          [0.67, 0.82, 0], [2.22, 2.25, -0.017], [2.24, 2.27, 0.018], [2.26, 2.54, 0.044]],
        mask: [[-2.54, -2.34, 0.088], [-2.35, -2.33, 0.07], [-2.34, -2.31, 0.053],
          [-2.32, -2.29, 0.035], [-2.3, -2.27, 0.027], [-2.28, -2.24, 0], [-0.69, -0.42, 0],
          [-0.43, -0.41, -0.008], [-0.42, -0.39, 0.009], [-0.4, -0.32, 0.044],
          [-0.33, -0.25, 0.035], [-0.26, -0.18, 0.044], [-0.19, -0.14, 0.035],
          [-0.15, -0.11, 0.009], [-0.12, -0.06, 0.044], [-0.07, -0.04, 0.035], [-0.05, 0.05, 0.018],
          [0.04, 0.07, 0.009], [0.06, 0.14, 0.035], [0.13, 0.17, 0.009], [0.16, 0.19, 0.018],
          [0.18, 0.24, 0.035], [0.23, 0.26, 0.027], [0.25, 0.28, 0.009], [0.27, 0.29, 0.018],
          [0.28, 0.31, 0.027], [0.3, 0.36, 0.035], [0.35, 0.4, 0.018], [0.39, 0.57, 0],
          [0.56, 0.66, 0.009], [0.65, 0.8, 0], [2.24, 2.27, -0.017], [2.26, 2.28, 0.018],
          [2.27, 2.32, 0.044], [2.31, 2.34, 0.053], [2.33, 2.37, 0.07], [2.36, 2.54, 0.088]] },
      { id: 2, name: 'No.3', x: 0, z: -49.75, angle: 3.13, arc: 2.6, guns: 3, my: 8.95,
        mask: [[0.51, 0.55, 0.035], [0.54, 0.71, 0], [2.66, 2.89, 0], [2.88, 2.91, 0.027],
          [2.9, 2.96, 0.105], [2.95, 3, 0.035], [2.99, 3.05, 0.105], [3.04, 3.07, 0.035],
          [3.06, 3.12, 0.21], [3.11, -3.11, 0.175], [-3.12, -3.06, 0.123], [-3.07, -2.94, 0.105],
          [-2.95, -2.9, 0.035], [-2.91, -2.88, 0.027], [-2.89, -2.66, 0], [-0.71, -0.53, 0]] },
    ],
    gun: {
      name: '16"/45 Mk 6', role: 'surface',
      // Two below the horizontal to forty-five up.
      elev: { min: -0.035, max: 0.785 },
      // Pivot to muzzle, the three turrets' mean, as the sculpt drew them.
      reach: 17.0,
      // The 2,700 lb super-heavy shell: slow, and very hard to keep out.
      caliber: 406, reload: 30, traverse: 0.07, range: 21000, sigma: 1.4,
      shells: shells(406, 13800, 6300, 620, 701, 0.28),
    },
    torpedoes: null,
    // Twenty 5-inch in ten twin Mk 28 mounts, five a side: on each side one on
    // her 01 level forward with one on the deck over it superfiring, one on
    // her main deck amidships, and one on her main deck aft with one on the 01
    // level forward of it superfiring. The mount is the owner's own sculpt of
    // it, the Baltimore's, drawn to the gunhouses her sculpt drew for it.
    secondary: {
      name: '5"/38 Mk 12', role: 'dp',
      // Fifteen below the horizontal to eighty-five up.
      elev: { min: -0.26, max: 1.48 },
      reach: 3.6,
      caliber: 127, reload: 4.0, traverse: 0.44, range: 8200, sigma: 1.15,
      shells: shells(127, 1900, 1650, 76, 792, 0.07),
      mounts: [
        { x: 11.5, z: 7.6, angle: 1.61, arc: 2.75, rest: 0, guns: 2, my: 9.1,
          lift: [[-2.72, -1.91, 0.053]],
          mask: [[-1.17, -0.91, 0.786], [-0.92, -0.86, 0.699], [-0.87, -0.77, 0.786],
            [-0.78, -0.65, 0.262], [-0.66, -0.6, 0.21], [-0.61, -0.53, 0.123],
            [-0.54, -0.42, 0.105], [-0.43, -0.35, 0.088], [-0.36, -0.32, 0.07],
            [-0.33, -0.3, 0.053], [-0.31, -0.18, 0], [-0.19, -0.16, -0.008], [-0.17, -0.07, 0.009],
            [-0.08, -0.04, -0.008], [3.09, -3.02, 0.07], [-3.03, -2.87, 0.35],
            [-2.88, -2.83, 0.437], [-2.84, -2.81, 0.524], [-2.82, -2.74, 0.699],
            [-2.75, -2.73, 0.96], [-2.74, -2.67, 1.048], [-2.68, -2.64, 0.96],
            [-2.65, -2.59, 1.048], [-2.6, -1.91, 1.222]] },
        { x: -11.45, z: 7.6, angle: -1.3, arc: 2.45, rest: 0, guns: 2, my: 9.1,
          lift: [[2.52, 2.6, 0.07], [2.59, 2.61, 0.044], [2.6, 2.63, 0.027], [2.62, 2.65, 0.018],
            [2.64, 2.67, 0.009], [2.66, 2.68, 0], [2.67, 2.7, -0.017]],
          mask: [[2.52, 2.54, 0.96], [2.53, 2.61, 1.222], [2.6, 2.63, 1.048], [2.62, 2.65, 0.96],
            [2.64, 2.7, 0.873], [2.69, 2.77, 0.786], [2.76, 2.81, 0.699], [2.8, 2.82, 0.611],
            [2.81, 2.84, 0.524], [2.83, 2.88, 0.437], [2.87, 2.91, 0.35], [2.9, 2.98, 0.437],
            [2.97, 3.03, 0.35], [3.02, 3.07, 0.123], [3.06, -3.06, 0.07], [0.04, 0.08, -0.008],
            [0.07, 0.17, 0.009], [0.16, 0.29, 0], [0.28, 0.31, 0.027], [0.3, 0.38, 0.07],
            [0.37, 0.48, 0.088], [0.47, 0.52, 0.105], [0.51, 0.55, 0.123], [0.54, 0.61, 0.21],
            [0.6, 0.78, 0.262], [0.77, 0.8, 0.611], [0.79, 0.82, 0.699], [0.81, 1.17, 0.786]] },
        { x: 7.6, z: -0.5, angle: 1.17, arc: 1.91, rest: 0, guns: 2, my: 10.8,
          lift: [[2.87, 2.89, -0.008], [2.88, 2.91, 0.018], [2.9, 2.93, 0.035], [2.92, 2.95, 0.053],
            [2.94, 2.96, 0.07], [2.95, 2.98, 0.105], [2.97, 3.09, 0.123], [3.08, 3.1, 0.088]],
          mask: [[-0.76, -0.18, 1.222], [-0.19, -0.16, 1.048], [-0.17, -0.14, 0.437],
            [-0.15, 0, 0.35], [-0.01, 0.01, 0.437], [0, 0.12, 0.524], [2.8, 2.82, 0.035],
            [2.81, 2.84, 0.044], [2.83, 2.86, 0.088], [2.85, 2.88, 0.123], [2.87, 2.89, 0.21],
            [2.88, 2.91, 0.35], [2.9, 2.95, 0.524], [2.94, 3.1, 0.611]] },
        { x: -7.55, z: -0.5, angle: -1.17, arc: 1.91, rest: 0, guns: 2, my: 10.8,
          lift: [[-3.1, -3.08, 0.088], [-3.09, -2.97, 0.123], [-2.98, -2.95, 0.105],
            [-2.96, -2.94, 0.07], [-2.95, -2.92, 0.053], [-2.93, -2.9, 0.035],
            [-2.91, -2.88, 0.018], [-2.89, -2.87, -0.008]],
          mask: [[-3.1, -2.94, 0.611], [-2.95, -2.9, 0.524], [-2.91, -2.88, 0.35],
            [-2.89, -2.87, 0.21], [-2.88, -2.85, 0.123], [-2.86, -2.83, 0.088],
            [-2.84, -2.81, 0.044], [-2.82, -2.8, 0.035], [-0.12, 0, 0.524], [-0.01, 0.01, 0.437],
            [0, 0.15, 0.35], [0.14, 0.17, 0.437], [0.16, 0.19, 1.048], [0.18, 0.76, 1.222]] },
        { x: 12.25, z: -4.35, angle: 2.3, arc: 2.76, rest: Math.PI / 2, guns: 2, my: 7.3,
          lift: [[-0.48, -0.42, 0.14], [-0.43, -0.37, 0.123], [-0.38, -0.32, 0.105],
            [-0.33, -0.14, 0.088], [-0.15, -0.11, 0.105], [-0.12, -0.09, 0.14], [-0.1, 0.08, 0.175],
            [0.07, 0.1, 0.14], [0.09, 0.42, 0.175], [0.41, 0.45, 0.14], [0.56, 0.61, 0.105],
            [0.6, 0.66, 0.123], [0.65, 0.71, 0.14], [0.7, 0.89, 0.175], [0.88, 0.92, 0.14],
            [0.91, 0.94, 0.035], [3.01, 3.03, 0.018], [3.02, 3.09, 0.027], [3.08, 3.1, 0.035],
            [3.09, 3.12, 0.044], [3.11, -3.08, 0.053], [-3.09, -3.02, 0.035], [-3.03, -2.9, 0.044],
            [-2.91, -2.74, 0.053], [-2.75, -2.33, 0.07], [-2.34, -1.98, 0.088],
            [-1.99, -1.21, 0.105]],
          mask: [[-0.48, -0.39, 0.96], [-0.4, -0.37, 0.786], [-0.38, -0.35, 0.699],
            [-0.36, -0.34, 0.611], [-0.35, -0.27, 0.524], [-0.28, -0.23, 0.437],
            [-0.24, 0.19, 0.35], [0.18, 0.4, 0.175], [0.39, 0.43, 0.14], [0.58, 0.62, 0.105],
            [0.61, 0.68, 0.123], [0.67, 0.73, 0.14], [0.72, 0.87, 0.175], [0.86, 0.9, 0.14],
            [0.89, 0.92, 0.035], [2.95, 3.14, 0.088], [3.13, -3.13, 0.437], [-3.14, -2.69, 0.524],
            [-2.7, -2.62, 0.611], [-2.63, -2.57, 0.699], [-2.58, -2.55, 0.873],
            [-2.56, -2.48, 0.96], [-2.49, -1.84, 1.222], [-1.85, -1.78, 1.397],
            [-1.79, -1.73, 1.222], [-1.74, -1.61, 1.397], [-1.62, -1.49, 1.571],
            [-1.5, -1.35, 1.397], [-1.36, -1.28, 1.571], [-1.29, -1.21, 1.397]] },
        { x: -12.15, z: -4.35, angle: -2.25, arc: 1.48, rest: -Math.PI / 2, guns: 2, my: 7.3,
          lift: [[2.53, 2.6, 0.044], [2.59, 2.75, 0.035], [2.74, 2.82, 0.027], [2.81, 3.03, 0.044],
            [3.02, -3.09, 0.035], [-3.1, -2.97, 0.027], [-2.98, -2.87, 0.018],
            [-2.88, -2.78, 0.009], [-0.83, -0.81, 0.07], [-0.82, -0.75, 0.175]],
          mask: [[2.53, 2.6, 0.96], [2.59, 2.65, 0.873], [2.64, 2.67, 0.699], [2.66, -3.13, 0.611],
            [-3.14, -3.06, 0.524], [-3.07, -3.01, 0.105], [-3.02, -2.94, 0.088],
            [-2.95, -2.88, 0.018], [-2.89, -2.8, 0.009], [-0.82, -0.79, 0.07], [-0.8, -0.75, 0.175]] },
        { x: 9.55, z: -12.15, angle: 2.06, arc: 2.16, rest: Math.PI, guns: 2, my: 9.1,
          lift: [[-2.16, -2.13, 0.07], [-2.14, -2.12, 0.105], [-2.13, -2.1, 0.14],
            [-2.11, -2.05, 0.175]],
          mask: [[-0.12, 0.08, 0.35], [0.07, 0.24, 0.07], [3.02, 3.14, 0], [3.13, -3.09, 0.035],
            [-3.1, -3.06, 0.07], [-3.07, -2.99, 0.088], [-3, -2.92, 0.07], [-2.93, -2.88, 0.088],
            [-2.89, -2.85, 0.175], [-2.86, -2.78, 0.262], [-2.79, -2.76, 0.35],
            [-2.77, -2.73, 0.699], [-2.74, -2.71, 0.786], [-2.72, -2.64, 0.873],
            [-2.65, -2.6, 0.786], [-2.61, -2.55, 0.873], [-2.56, -2.53, 0.786],
            [-2.54, -2.45, 0.96], [-2.46, -2.36, 1.048], [-2.37, -2.27, 1.222],
            [-2.28, -2.26, 1.048], [-2.27, -2.13, 1.222], [-2.14, -2.05, 1.397]] },
        { x: -9.95, z: -12.15, angle: -2.29, arc: 2.28, rest: Math.PI, guns: 2, my: 9.15,
          lift: [[1.7, 1.76, 0.175], [1.75, 1.78, 0.123], [1.77, 1.79, 0.053], [1.78, 1.81, 0.044],
            [1.8, 1.83, 0.009], [-0.08, -0.06, 0.044], [-0.07, 0.01, 0.175]],
          mask: [[1.7, 1.78, 1.222], [1.77, 2.13, 1.397], [2.12, 2.27, 1.048], [2.26, 2.28, 0.96],
            [2.27, 2.34, 1.048], [2.33, 2.44, 0.96], [2.43, 2.49, 0.873], [2.48, 2.65, 0.786],
            [2.64, 2.68, 0.699], [2.67, 2.75, 0.611], [2.74, 2.86, 0.35], [2.85, 2.88, 0.21],
            [2.87, 2.89, 0.175], [2.88, 2.91, 0.105], [2.9, 2.95, 0.088], [2.94, 2.96, 0.07],
            [2.95, 2.98, 0.053], [2.97, 3.07, 0.07], [3.06, 3.09, 0.053], [3.08, 3.12, 0.027],
            [3.11, -3.04, -0.008], [-0.22, -0.04, 0.07], [-0.05, -0.02, 0.21], [-0.03, 0.01, 0.35]] },
        { x: 12.45, z: -19.9, angle: 2.24, arc: 2.48, rest: Math.PI, guns: 2, my: 7.3,
          lift: [[-0.26, -0.2, 0.07], [-0.21, -0.07, 0.053], [-0.08, 0.07, 0.044],
            [0.06, 0.17, 0.035], [0.16, 0.19, 0.027], [0.18, 0.22, -0.017], [-2.98, -2.92, 0.035],
            [-2.93, -2.6, 0.044], [-2.61, -1.78, 0.053], [-1.79, -1.54, 0.07]],
          mask: [[-0.26, -0.02, 0.437], [-0.03, 0, 0.175], [-0.01, 0.01, 0.14], [0, 0.08, 0.123],
            [0.07, 0.19, 0.088], [0.18, 0.21, -0.008], [3.11, -3.13, -0.017],
            [-3.14, -3.09, -0.008], [-3.1, -3.06, 0.018], [-3.07, -3.02, 0.053],
            [-3.03, -3.01, 0.088], [-3.02, -2.94, 0.123], [-2.95, -2.92, 0.035],
            [-2.93, -2.62, 0.35], [-2.63, -2.48, 0.437], [-2.49, -2.41, 0.524],
            [-2.42, -2.24, 0.611], [-2.25, -2.12, 0.699], [-2.13, -2.05, 0.786],
            [-2.06, -1.99, 0.873], [-2, -1.92, 0.786], [-1.93, -1.85, 0.873], [-1.86, -1.57, 0.786],
            [-1.58, -1.54, 0.96]] },
        { x: -12.2, z: -19.9, angle: -2.5, arc: 3.05, rest: Math.PI, guns: 2, my: 7.3,
          lift: [[0.72, 1.99, 0.088], [1.98, 2.3, 0.07], [2.29, 2.72, 0.053], [2.71, 2.96, 0.044],
            [2.95, 3.02, 0.035], [3.01, 3.03, -0.008], [-0.22, -0.09, 0.027], [-0.1, 0.03, 0.035],
            [0.02, 0.19, 0.044], [0.18, 0.42, 0.053], [0.41, 0.57, 0.07]],
          mask: [[0.72, 0.78, 1.222], [0.77, 1.17, 1.048], [1.16, 1.22, 1.397], [1.21, 1.24, 1.222],
            [1.23, 1.29, 1.397], [1.28, 1.31, 1.048], [1.3, 1.32, 1.222], [1.31, 1.39, 1.397],
            [1.38, 1.44, 1.048], [1.43, 1.5, 1.397], [1.49, 1.51, 1.048], [1.5, 1.58, 0.96],
            [1.57, 2.07, 0.786], [2.06, 2.27, 0.699], [2.26, 2.42, 0.611], [2.41, 2.56, 0.524],
            [2.55, 2.7, 0.437], [2.69, 3, 0.35], [2.99, 3.02, 0.262], [3.01, 3.03, 0.088],
            [3.02, 3.05, 0.018], [3.04, 3.1, 0.07], [3.09, -3.09, 0], [-3.1, -3.08, -0.008],
            [-0.26, -0.21, 0], [-0.22, -0.16, 0.21], [-0.17, -0.14, 0.14], [-0.15, -0.13, 0.123],
            [-0.14, -0.11, 0.105], [-0.12, -0.07, 0.088], [-0.08, -0.06, 0.123],
            [-0.07, 0.22, 0.437], [0.21, 0.24, 0.524], [0.23, 0.36, 0.611], [0.35, 0.38, 0.699],
            [0.37, 0.4, 0.786], [0.39, 0.42, 0.873], [0.41, 0.57, 1.048]] },
      ],
    },
    aa: {
      range: 5600, dps: 95,
      guns: [
        // Seventeen quads besides the two on her turret roofs: a pair on her
        // forecastle, a pair abreast No.2, four up on the platform round her
        // tower, a pair on her 01 level and a pair on her main deck abreast
        // her after superstructure, one on the end of it over No.3, and a
        // pair on her quarterdeck and another on her fantail.
        { name: '40mm Bofors', caliber: 40, role: 'aa', reload: 0.26, range: 3400,
          elev: { min: -0.26, max: 1.57 },
          mounts: [
            { x: 4.7, z: 73.85, angle: 0.06, arc: 3.06, rest: 0, guns: 4, my: 7.83,
              lift: [[-2.95, -2.9, 0.027], [-2.91, -2.2, 0.07], [-2.21, -2.19, 0.044],
                [-2.2, -1.52, 0.07], [-1.53, -1.47, 0.027], [-1.48, -1.43, -0.026],
                [1.43, 1.48, -0.026], [1.47, 1.53, 0.027], [1.52, 2.2, 0.07], [2.19, 2.21, 0.044],
                [2.2, 2.91, 0.07], [2.9, 2.95, 0.027]],
              mask: [[-3.02, -2.97, 0.21], [-2.98, -2.94, 0.175], [-2.95, -2.92, 0.14],
                [-2.93, -2.22, 0.07], [-2.23, -2.17, 0.044], [-2.18, -1.78, 0.07],
                [-1.79, -1.45, 0.088], [-1.46, -1.37, 0.027], [-1.38, -1.19, -0.026],
                [-0.99, -0.58, -0.026], [-0.59, -0.54, -0.008], [-0.55, -0.41, 0.027],
                [-0.42, -0.27, 0.044], [-0.28, -0.25, 0.027], [-0.26, -0.07, 0.07],
                [-0.08, 0.01, 0.044], [0, 0.08, 0.027], [0.07, 0.17, -0.026], [1.45, 1.5, -0.026],
                [1.49, 1.55, 0.027], [1.54, 2.18, 0.07], [2.17, 2.23, 0.044], [2.22, 2.89, 0.07],
                [2.88, 2.93, 0.027], [2.92, 2.96, -0.026], [2.95, 2.98, -0.008], [2.97, 3, 0.009],
                [2.99, 3.05, 0.07], [3.04, 3.07, 0.088], [3.06, 3.09, 0.105], [3.08, 3.1, 0.175],
                [3.09, 3.14, 0.21]] },
            { x: -4.7, z: 73.85, angle: -0.06, arc: 3.06, rest: 0, guns: 4, my: 7.83,
              lift: [[-2.95, -2.9, 0.027], [-2.91, -2.2, 0.07], [-2.21, -2.19, 0.044],
                [-2.2, -1.52, 0.07], [-1.53, -1.47, 0.027], [-1.48, -1.43, -0.026],
                [1.43, 1.48, -0.026], [1.47, 1.53, 0.027], [1.52, 2.2, 0.07], [2.19, 2.21, 0.044],
                [2.2, 2.91, 0.07], [2.9, 2.95, 0.027]],
              mask: [[-3.14, -3.09, 0.21], [-3.1, -3.08, 0.175], [-3.09, -3.06, 0.105],
                [-3.07, -3.04, 0.088], [-3.05, -2.99, 0.07], [-3, -2.97, 0.009],
                [-2.98, -2.95, -0.008], [-2.96, -2.92, -0.026], [-2.93, -2.88, 0.027],
                [-2.89, -2.22, 0.07], [-2.23, -2.17, 0.044], [-2.18, -1.54, 0.07],
                [-1.55, -1.49, 0.027], [-1.5, -1.45, -0.026], [-0.17, -0.07, -0.026],
                [-0.08, 0, 0.027], [-0.01, 0.08, 0.044], [0.07, 0.26, 0.07], [0.25, 0.28, 0.027],
                [0.27, 0.42, 0.044], [0.41, 0.55, 0.027], [0.54, 0.59, -0.008],
                [0.58, 0.99, -0.026], [1.19, 1.38, -0.026], [1.37, 1.46, 0.027],
                [1.45, 1.79, 0.088], [1.78, 2.18, 0.07], [2.17, 2.23, 0.044], [2.22, 2.93, 0.07],
                [2.92, 2.95, 0.14], [2.94, 2.98, 0.175], [2.97, 3.02, 0.21]] },
            { x: 9.45, z: 27.7, angle: 0.35, arc: 3, rest: Math.PI / 2, guns: 4, my: 6.66,
              lift: [[-2.67, -2.52, 0.07], [-2.53, -2.5, 0.044], [-2.51, -1.8, 0.07],
                [-1.81, -1.77, 0.027], [-1.38, -1.33, 0.027], [-1.34, -0.63, 0.07],
                [-0.64, -0.61, 0.044], [-0.62, 0.05, 0.07], [0.04, 0.1, 0.027],
                [0.09, 0.14, -0.026], [3.01, 3.05, -0.026], [3.04, 3.1, 0.027], [3.09, -2.92, 0.07]],
              mask: [[-2.67, -2.52, 0.786], [-2.53, -2.17, 0.699], [-2.18, -2.08, 0.786],
                [-2.09, -2.05, 0.699], [-2.06, -1.96, 0.786], [-1.97, -1.91, 0.699],
                [-1.92, -1.84, 0.786], [-1.85, -1.77, 0.699], [-1.78, -1.71, 0.786],
                [-1.72, -1.31, 0.699], [-1.32, -1.28, 0.611], [-1.29, -1.21, 0.524],
                [-1.22, -1.19, 0.437], [-1.2, -1.09, 0.35], [-1.1, -1.07, 0.262],
                [-1.08, -0.98, 0.21], [-0.99, -0.77, 0.175], [-0.78, -0.72, 0.21],
                [-0.73, -0.35, 0.262], [-0.36, -0.34, 0.21], [-0.35, -0.2, 0.175],
                [-0.21, -0.14, 0.07], [-0.15, -0.09, 0.088], [-0.1, 0.03, 0.07],
                [0.02, 0.08, 0.027], [0.07, 0.22, -0.026], [2.73, 2.79, -0.026],
                [2.78, 2.81, 0.088], [2.8, 2.84, 0.105], [2.83, 2.88, 0.123], [2.87, 3, 0.21],
                [2.99, 3.14, 0.262], [3.13, -3.06, 0.35], [-3.07, -3.02, 0.524],
                [-3.03, -2.92, 0.786]] },
            { x: -9.45, z: 27.7, angle: -0.35, arc: 3, rest: -Math.PI / 2, guns: 4, my: 6.66,
              lift: [[2.92, -3.09, 0.07], [-3.1, -3.04, 0.027], [-3.05, -3.01, -0.026],
                [-0.14, -0.09, -0.026], [-0.1, -0.04, 0.027], [-0.05, 0.62, 0.07],
                [0.61, 0.64, 0.044], [0.63, 1.34, 0.07], [1.33, 1.38, 0.027], [1.77, 1.81, 0.027],
                [1.8, 2.51, 0.07], [2.5, 2.53, 0.044], [2.52, 2.67, 0.07]],
              mask: [[2.92, 3.03, 0.786], [3.02, 3.07, 0.524], [3.06, -3.13, 0.35],
                [-3.14, -2.99, 0.262], [-3, -2.87, 0.21], [-2.88, -2.83, 0.123],
                [-2.84, -2.8, 0.105], [-2.81, -2.78, 0.088], [-2.79, -2.73, -0.026],
                [-0.22, -0.07, -0.026], [-0.08, -0.02, 0.027], [-0.03, 0.1, 0.07],
                [0.09, 0.15, 0.088], [0.14, 0.21, 0.07], [0.2, 0.35, 0.175], [0.34, 0.36, 0.21],
                [0.35, 0.73, 0.262], [0.72, 0.78, 0.21], [0.77, 0.99, 0.175], [0.98, 1.08, 0.21],
                [1.07, 1.1, 0.262], [1.09, 1.2, 0.35], [1.19, 1.22, 0.437], [1.21, 1.29, 0.524],
                [1.28, 1.32, 0.611], [1.31, 1.72, 0.699], [1.71, 1.78, 0.786], [1.77, 1.85, 0.699],
                [1.84, 1.92, 0.786], [1.91, 1.97, 0.699], [1.96, 2.06, 0.786], [2.05, 2.09, 0.699],
                [2.08, 2.18, 0.786], [2.17, 2.53, 0.699], [2.52, 2.67, 0.786]] },
            { x: 4.1, z: 8.1, angle: 1.8, arc: 2.53, rest: Math.PI / 2, guns: 4, my: 17.88,
              lift: [[-0.75, -0.46, 0.07], [-0.47, 0.05, 0.088], [0.04, 0.36, 0.105],
                [0.35, 0.45, 0.027], [2.52, 2.56, 0.07], [2.55, 2.79, 0.088], [2.78, 2.82, 0.105],
                [2.81, 2.84, 0.14], [2.83, 2.86, 0.262], [2.85, 2.98, 0.35], [2.97, -2.69, 0.262],
                [-2.7, -2.59, 0.35], [-2.6, -2.41, 0.262], [-2.42, -2.27, 0.14],
                [-2.28, -2.24, 0.105], [-2.25, -2.19, 0.088], [-2.2, -2.12, 0.07],
                [-2.13, -2.08, 0.088], [-2.09, -2.06, 0.123], [-2.07, -2.05, 0.21],
                [-2.06, -2.01, 0.35], [-2.02, -1.94, 0.437]],
              mask: [[-0.75, -0.7, 0.786], [-0.71, -0.68, 0.699], [-0.69, -0.54, 1.048],
                [-0.55, -0.44, 0.07], [-0.45, 0.07, 0.088], [0.06, 0.35, 0.105],
                [0.34, 0.43, 0.027], [2.53, 2.58, 0.07], [2.57, 2.81, 0.088], [2.8, 2.84, 0.105],
                [2.83, 2.86, 0.14], [2.85, 2.88, 0.262], [2.87, 2.96, 0.35], [2.95, 3.02, 0.262],
                [3.01, 3.12, 0.35], [3.11, -3.13, 0.96], [-3.14, -3.11, 1.048],
                [-3.12, -3.02, 1.222], [-3.03, -2.85, 1.397], [-2.86, -2.83, 1.222],
                [-2.84, -2.69, 1.397], [-2.7, -2.6, 1.222], [-2.61, -2.48, 1.397],
                [-2.49, -2.38, 1.222], [-2.39, -2.03, 1.397], [-2.04, -1.99, 1.222],
                [-2, -1.94, 1.397]] },
            { x: -4.1, z: 8.1, angle: -1.8, arc: 2.53, rest: -Math.PI / 2, guns: 4, my: 17.88,
              lift: [[1.94, 2.02, 0.437], [2.01, 2.06, 0.35], [2.05, 2.07, 0.21],
                [2.06, 2.09, 0.123], [2.08, 2.13, 0.088], [2.12, 2.2, 0.07], [2.19, 2.25, 0.088],
                [2.24, 2.28, 0.105], [2.27, 2.42, 0.14], [2.41, 2.6, 0.262], [2.59, 2.7, 0.35],
                [2.69, -2.97, 0.262], [-2.98, -2.85, 0.35], [-2.86, -2.83, 0.262],
                [-2.84, -2.81, 0.14], [-2.82, -2.78, 0.105], [-2.79, -2.55, 0.088],
                [-2.56, -2.52, 0.07], [-0.45, -0.35, 0.027], [-0.36, -0.04, 0.105],
                [-0.05, 0.47, 0.088], [0.46, 0.75, 0.07]],
              mask: [[1.94, 2, 1.397], [1.99, 2.04, 1.222], [2.03, 2.39, 1.397],
                [2.38, 2.49, 1.222], [2.48, 2.61, 1.397], [2.6, 2.7, 1.222], [2.69, 2.84, 1.397],
                [2.83, 2.86, 1.222], [2.85, 3.03, 1.397], [3.02, 3.12, 1.222], [3.11, 3.14, 1.048],
                [3.13, -3.11, 0.96], [-3.12, -3.01, 0.35], [-3.02, -2.95, 0.262],
                [-2.96, -2.87, 0.35], [-2.88, -2.85, 0.262], [-2.86, -2.83, 0.14],
                [-2.84, -2.8, 0.105], [-2.81, -2.57, 0.088], [-2.58, -2.53, 0.07],
                [-0.43, -0.34, 0.027], [-0.35, -0.06, 0.105], [-0.07, 0.45, 0.088],
                [0.44, 0.55, 0.07], [0.54, 0.69, 1.048], [0.68, 0.71, 0.699], [0.7, 0.75, 0.786]] },
            { x: 4, z: 4.4, angle: 0.34, arc: 2.74, rest: Math.PI / 2, guns: 4, my: 17.77,
              lift: [[-2.42, -2.34, 0.437], [-2.35, -2.29, 0.35], [-2.3, -2.27, 0.262],
                [-2.28, -2.26, 0.21], [-2.27, -2.24, 0.175], [-2.25, -2.19, 0.088],
                [-2.2, -2.12, 0.07], [-2.13, -1.91, 0.088], [-1.92, -1.63, 0.105],
                [-1.64, -1.61, 0.088], [-1.62, -1.52, 0.027], [-1.53, -1.5, 0.088],
                [-1.51, -1.23, 0.105], [-1.24, -1.02, 0.088], [-1.03, -0.95, 0.07],
                [-0.96, -0.88, 0.088], [-0.89, -0.82, 0.105], [-0.83, -0.79, 0.175],
                [-0.8, -0.7, 0.21], [-0.71, -0.67, 0.262], [-0.68, 0.4, 0.35], [0.39, 0.43, 0.262],
                [0.42, 0.47, 0.175], [0.46, 0.66, 0.14], [0.65, 0.69, 0.123], [2.69, 2.79, 0.027],
                [2.78, 3.1, 0.105]],
              mask: [[-2.42, -2.01, 1.571], [-2.02, -1.91, 1.397], [-1.92, -1.8, 0.262],
                [-1.81, -1.66, 0.105], [-1.67, -1.64, 0.699], [-1.65, -1, 1.397],
                [-1.01, -0.98, 1.222], [-0.99, -0.72, 0.699], [-0.73, -0.63, 0.786],
                [-0.64, -0.6, 0.699], [-0.61, -0.54, 0.786], [-0.55, -0.51, 0.699],
                [-0.52, -0.49, 0.524], [-0.5, -0.42, 0.611], [-0.43, -0.41, 0.524],
                [-0.42, -0.39, 0.611], [-0.4, -0.34, 0.699], [-0.35, -0.32, 0.611],
                [-0.33, -0.25, 0.524], [-0.26, -0.16, 0.611], [-0.17, -0.14, 0.437],
                [-0.15, 0.38, 0.35], [0.37, 0.42, 0.262], [0.41, 0.45, 0.175], [0.44, 0.64, 0.14],
                [0.63, 0.68, 0.123], [2.71, 2.81, 0.027], [2.8, 2.98, 0.105], [2.97, 3.1, 0.437]] },
            { x: -4, z: 4.4, angle: -0.34, arc: 2.74, rest: -Math.PI / 2, guns: 4, my: 17.88,
              lift: [[-3.1, -2.78, 0.105], [-2.79, -2.69, 0.027], [-0.69, -0.65, 0.123],
                [-0.66, -0.46, 0.14], [-0.47, -0.42, 0.175], [-0.43, -0.39, 0.262],
                [-0.4, 0.68, 0.35], [0.67, 0.71, 0.262], [0.7, 0.8, 0.21], [0.79, 0.83, 0.175],
                [0.82, 0.89, 0.105], [0.88, 0.96, 0.088], [0.95, 1.03, 0.07], [1.02, 1.24, 0.088],
                [1.23, 1.51, 0.105], [1.5, 1.53, 0.088], [1.52, 1.62, 0.027], [1.61, 1.64, 0.088],
                [1.63, 1.92, 0.105], [1.91, 2.13, 0.088], [2.12, 2.2, 0.07], [2.19, 2.25, 0.088],
                [2.24, 2.27, 0.175], [2.26, 2.28, 0.21], [2.27, 2.3, 0.262], [2.29, 2.35, 0.35],
                [2.34, 2.42, 0.437]],
              mask: [[-3.1, -2.97, 0.437], [-2.98, -2.8, 0.105], [-2.81, -2.71, 0.027],
                [-0.68, -0.63, 0.123], [-0.64, -0.44, 0.14], [-0.45, -0.41, 0.175],
                [-0.42, -0.37, 0.262], [-0.38, 0.15, 0.35], [0.14, 0.17, 0.437],
                [0.16, 0.26, 0.611], [0.25, 0.33, 0.524], [0.32, 0.35, 0.611], [0.34, 0.4, 0.699],
                [0.39, 0.42, 0.611], [0.41, 0.43, 0.524], [0.42, 0.5, 0.611], [0.49, 0.52, 0.524],
                [0.51, 0.55, 0.699], [0.54, 0.61, 0.786], [0.6, 0.64, 0.699], [0.63, 0.73, 0.786],
                [0.72, 0.99, 0.699], [0.98, 1.01, 1.222], [1, 1.65, 1.397], [1.64, 1.67, 0.699],
                [1.66, 1.81, 0.105], [1.8, 1.92, 0.262], [1.91, 2.02, 1.397], [2.01, 2.42, 1.571]] },
            { x: 8, z: -26.7, angle: 2.46, arc: 3.01, rest: Math.PI / 2, guns: 4, my: 9.67,
              lift: [[-0.57, 0.05, 0.07], [0.04, 0.1, 0.027], [0.09, 0.14, -0.026],
                [3.01, 3.05, -0.026], [3.04, 3.1, 0.027], [3.09, -2.52, 0.07], [-2.53, -2.5, 0.044],
                [-2.51, -1.8, 0.07], [-1.81, -1.77, 0.027], [-1.78, -1.73, 0.009],
                [-1.74, -1.33, 0.027], [-1.34, -0.79, 0.07]],
              mask: [[-0.57, -0.54, 0.96], [-0.55, -0.51, 1.048], [-0.52, -0.46, 1.397],
                [-0.47, -0.3, 1.048], [-0.31, -0.23, 0.96], [-0.24, -0.13, 0.873],
                [-0.14, -0.09, 0.699], [-0.1, -0.04, 0.524], [-0.05, 0, 0.437], [-0.01, 0.08, 0.35],
                [0.07, 0.12, 0.175], [0.11, 0.14, 0.088], [0.13, 0.35, 0.07], [0.34, 0.36, 0.044],
                [3.02, 3.07, -0.026], [3.06, 3.12, 0.027], [3.11, -3.06, 0.07],
                [-3.07, -2.99, 0.105], [-3, -2.87, 0.07], [-2.88, -2.85, 0.088],
                [-2.86, -2.81, 0.123], [-2.82, -2.8, 0.14], [-2.81, -2.69, 0.175],
                [-2.7, -2.62, 0.262], [-2.63, -2.6, 0.35], [-2.61, -2.55, 0.437],
                [-2.56, -2.53, 0.524], [-2.54, -2.52, 0.611], [-2.53, -2.5, 0.699],
                [-2.51, -2.31, 0.786], [-2.32, -1.52, 0.873], [-1.53, -1.49, 0.96],
                [-1.5, -1.09, 1.048], [-1.1, -0.95, 0.96], [-0.96, -0.93, 0.873],
                [-0.94, -0.79, 0.96]] },
            { x: -8, z: -26.7, angle: -2.46, arc: 3.01, rest: -Math.PI / 2, guns: 4, my: 9.68,
              lift: [[0.79, 1.34, 0.07], [1.33, 1.74, 0.027], [1.73, 1.78, 0.009],
                [1.77, 1.81, 0.027], [1.8, 2.51, 0.07], [2.5, 2.53, 0.044], [2.52, -3.09, 0.07],
                [-3.1, -3.04, 0.027], [-3.05, -3.01, -0.026], [-0.14, -0.09, -0.026],
                [-0.1, -0.04, 0.027], [-0.05, 0.57, 0.07]],
              mask: [[0.79, 0.94, 0.96], [0.93, 0.96, 0.873], [0.95, 1.1, 0.96], [1.09, 1.5, 1.048],
                [1.49, 1.53, 0.96], [1.52, 2.32, 0.873], [2.31, 2.51, 0.786], [2.5, 2.53, 0.699],
                [2.52, 2.54, 0.611], [2.53, 2.56, 0.524], [2.55, 2.61, 0.437], [2.6, 2.63, 0.35],
                [2.62, 2.7, 0.262], [2.69, 2.81, 0.175], [2.8, 2.82, 0.14], [2.81, 2.86, 0.123],
                [2.85, 2.88, 0.088], [2.87, 3, 0.07], [2.99, 3.07, 0.105], [3.06, -3.11, 0.07],
                [-3.12, -3.06, 0.027], [-3.07, -3.02, -0.026], [-0.36, -0.34, 0.044],
                [-0.35, -0.13, 0.07], [-0.14, -0.11, 0.088], [-0.12, -0.07, 0.175],
                [-0.08, 0.01, 0.35], [0, 0.05, 0.437], [0.04, 0.1, 0.524], [0.09, 0.14, 0.699],
                [0.13, 0.24, 0.873], [0.23, 0.31, 0.96], [0.3, 0.47, 1.048], [0.46, 0.52, 1.397],
                [0.51, 0.55, 1.048], [0.54, 0.57, 0.96]] },
            { x: 10.35, z: -33, angle: 2.57, arc: 3.04, rest: Math.PI / 2, guns: 4, my: 6.68,
              lift: [[-0.48, -0.41, 0.262], [-0.42, -0.39, 0.21], [-0.4, -0.35, 0.175],
                [-0.36, -0.34, 0.123], [-0.35, -0.32, 0.105], [-0.33, 0.05, 0.07],
                [0.04, 0.1, 0.027], [0.09, 0.14, -0.026], [3.01, 3.05, -0.026], [3.04, 3.1, 0.027],
                [3.09, -2.52, 0.07], [-2.53, -2.5, 0.044], [-2.51, -1.8, 0.07],
                [-1.81, -1.77, 0.027], [-1.67, -1.64, 0.044], [-1.65, -1.63, 0.105],
                [-1.64, -1.61, 0.14], [-1.62, -1.59, 0.175], [-1.6, -1.57, 0.21],
                [-1.58, -1.52, 0.262], [-1.53, -1.09, 0.35], [-1.1, -1.03, 0.262],
                [-1.04, -1.02, 0.21], [-1.03, -0.96, 0.175], [-0.97, -0.95, 0.21],
                [-0.96, -0.89, 0.262], [-0.9, -0.65, 0.35]],
              mask: [[-0.48, -0.3, 0.96], [-0.31, -0.23, 0.873], [-0.24, -0.07, 0.786],
                [-0.08, 0.01, 0.699], [0, 0.14, 0.611], [0.13, 0.15, 0.524], [0.14, 0.21, 0.21],
                [0.2, 0.36, 0.175], [0.35, 0.4, -0.026], [2.94, 3.07, -0.026], [3.06, 3.12, 0.027],
                [3.11, -3.11, 0.07], [-3.12, -3.09, 0.088], [-3.1, -3.04, 0.105],
                [-3.05, -3.02, 0.088], [-3.03, -3.01, 0.14], [-3.02, -2.94, 0.175],
                [-2.95, -2.92, 0.07], [-2.93, -2.9, 0.088], [-2.91, -2.88, 0.105],
                [-2.89, -2.87, 0.123], [-2.88, -2.71, 0.175], [-2.72, -2.64, 0.21],
                [-2.65, -2.62, 0.262], [-2.63, -2.52, 0.35], [-2.53, -2.29, 0.437],
                [-2.3, -2.26, 0.524], [-2.27, -2.05, 0.611], [-2.06, -1.77, 0.699],
                [-1.78, -1.57, 0.786], [-1.58, -1.56, 0.873], [-1.57, -1.16, 0.96],
                [-1.17, -0.95, 0.873], [-0.96, -0.82, 0.96], [-0.83, -0.7, 1.048],
                [-0.71, -0.67, 0.873], [-0.68, -0.65, 0.786]] },
            { x: -10.35, z: -33, angle: -2.57, arc: 3.04, rest: -Math.PI / 2, guns: 4, my: 6.68,
              lift: [[0.65, 0.9, 0.35], [0.89, 0.96, 0.262], [0.95, 0.97, 0.21],
                [0.96, 1.03, 0.175], [1.02, 1.04, 0.21], [1.03, 1.1, 0.262], [1.09, 1.53, 0.35],
                [1.52, 1.58, 0.262], [1.57, 1.6, 0.21], [1.59, 1.62, 0.175], [1.61, 1.64, 0.14],
                [1.63, 1.65, 0.105], [1.64, 1.67, 0.044], [1.77, 1.81, 0.027], [1.8, 2.51, 0.07],
                [2.5, 2.53, 0.044], [2.52, -3.09, 0.07], [-3.1, -3.04, 0.027],
                [-3.05, -3.01, -0.026], [-0.14, -0.09, -0.026], [-0.1, -0.04, 0.027],
                [-0.05, 0.33, 0.07], [0.32, 0.35, 0.105], [0.34, 0.36, 0.123], [0.35, 0.4, 0.175],
                [0.39, 0.42, 0.21], [0.41, 0.48, 0.262]],
              mask: [[0.65, 0.68, 0.786], [0.67, 0.71, 0.873], [0.7, 0.83, 1.048],
                [0.82, 0.96, 0.96], [0.95, 1.17, 0.873], [1.16, 1.57, 0.96], [1.56, 1.58, 0.873],
                [1.57, 1.78, 0.786], [1.77, 2.06, 0.699], [2.05, 2.27, 0.611], [2.26, 2.3, 0.524],
                [2.29, 2.53, 0.437], [2.52, 2.63, 0.35], [2.62, 2.65, 0.262], [2.64, 2.72, 0.21],
                [2.71, 2.88, 0.175], [2.87, 2.89, 0.123], [2.88, 2.91, 0.105], [2.9, 2.93, 0.088],
                [2.92, 2.95, 0.07], [2.94, 3.02, 0.175], [3.01, 3.03, 0.14], [3.02, 3.05, 0.088],
                [3.04, 3.1, 0.105], [3.09, 3.12, 0.088], [3.11, -3.11, 0.07], [-3.12, -3.06, 0.027],
                [-3.07, -2.94, -0.026], [-0.4, -0.35, -0.026], [-0.36, -0.2, 0.175],
                [-0.21, -0.14, 0.21], [-0.15, -0.13, 0.524], [-0.14, 0, 0.611],
                [-0.01, 0.08, 0.699], [0.07, 0.24, 0.786], [0.23, 0.31, 0.873], [0.3, 0.48, 0.96]] },
            { x: 0.1, z: -35.7, angle: 3.08, arc: 2.43, rest: Math.PI, guns: 4, my: 12.13,
              lift: [[0.63, 0.75, 0.437], [0.74, 1.04, 0.35], [1.03, 1.06, 0.262],
                [1.05, 1.08, 0.21], [1.07, 1.1, 0.175], [1.09, 1.11, 0.14], [1.1, 1.13, 0.105],
                [1.12, 1.15, 0.07], [1.14, 1.17, 0.044], [1.16, 1.18, 0.027], [1.17, 1.2, 0.009],
                [1.19, 1.22, -0.008], [-1.79, -1.77, -0.026], [-1.78, -1.71, 0.027],
                [-1.72, -1.5, 0.088], [-1.51, -1.17, 0.07], [-1.18, -1.16, 0.105],
                [-1.17, -1.14, 0.123], [-1.15, -1.09, 0.14], [-1.1, -1.05, 0.175],
                [-1.06, -1.03, 0.21], [-1.04, -0.96, 0.262], [-0.97, -0.75, 0.35]],
              mask: [[0.63, 0.73, 0.437], [0.72, 1.03, 0.35], [1.02, 1.04, 0.262],
                [1.03, 1.06, 0.21], [1.05, 1.08, 0.175], [1.07, 1.1, 0.14], [1.09, 1.11, 0.105],
                [1.1, 1.13, 0.07], [1.12, 1.15, 0.044], [1.14, 1.17, 0.027], [1.16, 1.18, 0.009],
                [1.17, 1.2, -0.008], [2.97, 3.07, -0.008], [3.09, -3.09, 0.088],
                [-3.07, -2.97, -0.008], [-1.78, -1.75, -0.026], [-1.76, -1.7, 0.027],
                [-1.71, -1.52, 0.088], [-1.53, -1.16, 0.07], [-1.17, -1.14, 0.105],
                [-1.15, -1.12, 0.123], [-1.13, -1.07, 0.14], [-1.08, -1.03, 0.175],
                [-1.04, -1.02, 0.21], [-1.03, -0.95, 0.262], [-0.96, -0.88, 0.35],
                [-0.89, -0.82, 0.524], [-0.83, -0.75, 0.611]] },
            { x: 7.1, z: -69.65, angle: 3.01, arc: 3.08, rest: Math.PI / 2, guns: 4, my: 6.7,
              lift: [[-0.08, 0.05, 0.07], [0.04, 0.1, 0.027], [0.09, 0.14, -0.026],
                [2.55, 2.58, -0.026], [2.57, 3.05, -0.008], [3.04, 3.1, 0.027], [3.09, -2.52, 0.07],
                [-2.53, -2.5, 0.044], [-2.51, -1.8, 0.07], [-1.81, -1.77, 0.027],
                [-1.38, -1.33, 0.027], [-1.34, -0.63, 0.07], [-0.64, -0.61, 0.044],
                [-0.62, -0.18, 0.07]],
              mask: [[-0.08, -0.02, 0.437], [-0.03, 0, 0.35], [-0.01, 0.01, 0.21], [0, 0.05, 0.175],
                [0.04, 0.07, 0.123], [0.06, 0.08, 0.105], [0.07, 0.12, 0.088], [0.11, 0.19, 0.07],
                [0.18, 0.21, 0.009], [0.2, 0.24, -0.008], [0.23, 0.31, -0.026],
                [2.26, 2.77, -0.008], [2.76, 3.07, 0.009], [3.06, 3.1, 0.044], [3.09, 3.14, 0.262],
                [3.13, -3.08, 0.35], [-3.09, -3.01, 0.262], [-3.02, -2.99, 0.088],
                [-3, -2.97, 0.14], [-2.98, -2.95, 0.262], [-2.96, -2.92, 0.35],
                [-2.93, -2.83, 0.437], [-2.84, -2.67, 0.07], [-2.68, -2.62, 0.088],
                [-2.63, -2.38, 0.21], [-2.39, -2.36, 0.123], [-2.37, -1.82, 0.07],
                [-1.83, -1.73, 0.027], [-1.74, -1.4, 0.07], [-1.41, -1.31, 0.027],
                [-1.32, -0.65, 0.07], [-0.66, -0.63, 0.088], [-0.64, -0.6, 0.123],
                [-0.61, -0.41, 0.14], [-0.42, -0.35, 0.175], [-0.36, -0.3, 0.21],
                [-0.31, -0.25, 0.262], [-0.26, -0.23, 0.35], [-0.24, -0.18, 0.437]] },
            { x: -7.1, z: -69.65, angle: -3.01, arc: 3.08, rest: -Math.PI / 2, guns: 4, my: 6.7,
              lift: [[0.18, 0.62, 0.07], [0.61, 0.64, 0.044], [0.63, 1.34, 0.07],
                [1.33, 1.38, 0.027], [1.77, 1.81, 0.027], [1.8, 2.51, 0.07], [2.5, 2.53, 0.044],
                [2.52, -3.09, 0.07], [-3.1, -3.04, 0.027], [-3.05, -2.57, -0.008],
                [-2.58, -2.55, -0.026], [-0.14, -0.09, -0.026], [-0.1, -0.04, 0.027],
                [-0.05, 0.08, 0.07]],
              mask: [[0.18, 0.24, 0.437], [0.23, 0.26, 0.35], [0.25, 0.31, 0.262],
                [0.3, 0.36, 0.21], [0.35, 0.42, 0.175], [0.41, 0.61, 0.14], [0.6, 0.64, 0.123],
                [0.63, 0.66, 0.088], [0.65, 1.32, 0.07], [1.31, 1.41, 0.027], [1.4, 1.74, 0.07],
                [1.73, 1.83, 0.027], [1.82, 2.37, 0.07], [2.36, 2.39, 0.123], [2.38, 2.63, 0.21],
                [2.62, 2.68, 0.088], [2.67, 2.84, 0.07], [2.83, 2.93, 0.437], [2.92, 2.96, 0.35],
                [2.95, 2.98, 0.262], [2.97, 3, 0.14], [2.99, 3.02, 0.088], [3.01, 3.09, 0.262],
                [3.08, -3.13, 0.35], [-3.14, -3.09, 0.262], [-3.1, -3.06, 0.044],
                [-3.07, -2.76, 0.009], [-2.77, -2.26, -0.008], [-0.31, -0.23, -0.026],
                [-0.24, -0.2, -0.008], [-0.21, -0.18, 0.009], [-0.19, -0.11, 0.07],
                [-0.12, -0.07, 0.088], [-0.08, -0.06, 0.105], [-0.07, -0.04, 0.123],
                [-0.05, 0, 0.175], [-0.01, 0.01, 0.21], [0, 0.03, 0.35], [0.02, 0.08, 0.437]] },
            { x: 5.1, z: -100.45, angle: 1.71, arc: 2.86, rest: Math.PI, guns: 4, my: 6.68,
              lift: [[-1.17, -0.95, 0.07], [-0.96, -0.93, 0.044], [-0.94, -0.23, 0.07],
                [-0.24, -0.2, 0.027], [0.2, 0.24, 0.027], [0.23, 0.94, 0.07], [0.93, 0.96, 0.044],
                [0.95, 1.62, 0.07], [1.61, 1.67, 0.027], [1.66, 1.71, -0.026]],
              mask: [[-1.17, -1.09, 0.088], [-1.1, -0.95, 0.14], [-0.96, -0.67, 0.35],
                [-0.68, -0.65, 0.123], [-0.66, -0.6, 0.105], [-0.61, -0.34, 0.07],
                [-0.35, -0.2, 0.088], [-0.21, -0.13, 0.175], [-0.14, -0.11, 0.21],
                [-0.12, -0.09, 0.437], [-0.1, 0.05, 0.611], [0.04, 0.19, 0.524],
                [0.18, 0.24, 0.611], [0.23, 0.26, 0.524], [0.25, 0.28, 0.262], [0.27, 0.36, 0.175],
                [0.35, 0.5, 0.088], [0.49, 0.92, 0.07], [0.91, 0.97, 0.044], [0.96, 1.6, 0.07],
                [1.59, 1.65, 0.027], [1.64, 1.69, -0.026], [-2.11, -2.01, 0.524],
                [-2.02, -1.92, 0.611], [-1.93, -1.87, 0.524], [-1.88, -1.82, 0.699],
                [-1.83, -1.8, 0.611], [-1.81, -1.75, 0.786], [-1.76, -1.7, 0.699]] },
            { x: -5.1, z: -100.45, angle: -1.71, arc: 2.86, rest: Math.PI, guns: 4, my: 6.68,
              lift: [[-1.71, -1.66, -0.026], [-1.67, -1.61, 0.027], [-1.62, -0.95, 0.07],
                [-0.96, -0.93, 0.044], [-0.94, -0.23, 0.07], [-0.24, -0.2, 0.027],
                [0.2, 0.24, 0.027], [0.23, 0.94, 0.07], [0.93, 0.96, 0.044], [0.95, 1.17, 0.07]],
              mask: [[1.7, 1.76, 0.699], [1.75, 1.81, 0.786], [1.8, 1.83, 0.611],
                [1.82, 1.88, 0.699], [1.87, 1.93, 0.524], [1.92, 2.02, 0.611], [2.01, 2.11, 0.524],
                [-1.69, -1.64, -0.026], [-1.65, -1.59, 0.027], [-1.6, -0.96, 0.07],
                [-0.97, -0.91, 0.044], [-0.92, -0.49, 0.07], [-0.5, -0.35, 0.088],
                [-0.36, -0.27, 0.175], [-0.28, -0.25, 0.262], [-0.26, -0.23, 0.524],
                [-0.24, -0.18, 0.611], [-0.19, -0.04, 0.524], [-0.05, 0.1, 0.611],
                [0.09, 0.12, 0.437], [0.11, 0.14, 0.21], [0.13, 0.21, 0.175], [0.2, 0.35, 0.088],
                [0.34, 0.61, 0.07], [0.6, 0.66, 0.105], [0.65, 0.68, 0.123], [0.67, 0.96, 0.35],
                [0.95, 1.1, 0.14], [1.09, 1.17, 0.088]] },
          ] },
        // Her Oerlikons on her quarterdeck, five a side, where the sculpt drew
        // them -- the forward three of each five a tub's width apart.
        { name: '20mm Oerlikon', caliber: 20, role: 'aa', reload: 0.12, range: 1800,
          elev: { min: -0.17, max: 1.48 },
          mounts: [
            { x: 7.9, z: -66, angle: 2.98, arc: 3.1, rest: Math.PI / 2, guns: 1, my: 6.46,
              lift: [[2.78, 2.81, 0.027], [2.8, 2.89, 0.07], [2.88, -2.43, 0.088],
                [-2.44, -2.38, 0.07], [-2.39, -2.36, 0.044]],
              mask: [[-0.14, -0.07, 0.524], [-0.08, -0.06, 0.437], [-0.07, -0.02, 0.35],
                [-0.03, 0.03, 0.175], [0.02, 0.1, 0.105], [0.09, 0.15, 0.07], [0.14, 0.17, 0.044],
                [0.16, 0.26, -0.008], [0.25, 0.35, -0.026], [2.67, 2.82, 0.027], [2.81, 2.91, 0.07],
                [2.9, -3.11, 0.088], [-3.12, -3.09, 0.105], [-3.1, -2.92, 0.262],
                [-2.93, -2.88, 0.35], [-2.89, -2.64, 0.437], [-2.65, -2.46, 0.35],
                [-2.47, -2.45, 0.21], [-2.46, -2.39, 0.262], [-2.4, -2.24, 0.21],
                [-2.25, -2.19, 0.027], [-2.2, -2.01, -0.026], [-2.02, -1.98, 0.027],
                [-1.99, -1.91, 0.044], [-1.92, -1.71, 0.088], [-1.72, -1.68, 0.07],
                [-1.69, -1.64, 0.009], [-1.65, -1.59, -0.008], [-1.6, -1.54, 0.009],
                [-1.55, -1.45, -0.008], [-1.46, -1.4, 0.009], [-1.41, -1.31, -0.008],
                [-1.32, -1.26, 0.009], [-1.27, -1.21, -0.008], [-1.22, -1.17, -0.026],
                [-1.18, -1.07, -0.008], [-1.08, -1.02, 0.009], [-1.03, -0.96, -0.008],
                [-0.97, -0.95, -0.026], [-0.96, -0.93, -0.008], [-0.94, -0.79, 0.009],
                [-0.8, -0.77, 0.07], [-0.78, -0.75, 0.105], [-0.76, -0.74, 0.14],
                [-0.75, -0.7, 0.175], [-0.71, -0.63, 0.21], [-0.64, -0.58, 0.175],
                [-0.59, -0.46, 0.21], [-0.47, -0.32, 0.262], [-0.33, -0.25, 0.35],
                [-0.26, -0.18, 0.437]] },
            { x: -7.9, z: -66, angle: -2.98, arc: 3.1, rest: -Math.PI / 2, guns: 1, my: 6.46,
              lift: [[2.36, 2.39, 0.044], [2.38, 2.44, 0.07], [2.43, -2.88, 0.088],
                [-2.89, -2.8, 0.07], [-2.81, -2.78, 0.027]],
              mask: [[0.18, 0.26, 0.437], [0.25, 0.33, 0.35], [0.32, 0.47, 0.262],
                [0.46, 0.59, 0.21], [0.58, 0.64, 0.175], [0.63, 0.71, 0.21], [0.7, 0.75, 0.175],
                [0.74, 0.76, 0.14], [0.75, 0.78, 0.105], [0.77, 0.8, 0.07], [0.79, 0.94, 0.009],
                [0.93, 0.96, -0.008], [0.95, 0.97, -0.026], [0.96, 1.03, -0.008],
                [1.02, 1.08, 0.009], [1.07, 1.18, -0.008], [1.17, 1.22, -0.026],
                [1.21, 1.27, -0.008], [1.26, 1.32, 0.009], [1.31, 1.41, -0.008], [1.4, 1.46, 0.009],
                [1.45, 1.55, -0.008], [1.54, 1.6, 0.009], [1.59, 1.65, -0.008], [1.64, 1.69, 0.009],
                [1.68, 1.72, 0.07], [1.71, 1.92, 0.088], [1.91, 1.99, 0.044], [1.98, 2.02, 0.027],
                [2.01, 2.2, -0.026], [2.19, 2.25, 0.027], [2.24, 2.4, 0.21], [2.39, 2.46, 0.262],
                [2.45, 2.47, 0.21], [2.46, 2.65, 0.35], [2.64, 2.89, 0.437], [2.88, 2.93, 0.35],
                [2.92, 3.1, 0.262], [3.09, 3.12, 0.105], [3.11, -2.9, 0.088], [-2.91, -2.81, 0.07],
                [-2.82, -2.67, 0.027], [-0.35, -0.25, -0.026], [-0.26, -0.16, -0.008],
                [-0.17, -0.14, 0.044], [-0.15, -0.09, 0.07], [-0.1, -0.02, 0.105],
                [-0.03, 0.03, 0.175], [0.02, 0.07, 0.35], [0.06, 0.08, 0.437], [0.07, 0.14, 0.524]] },
            { x: 7.6, z: -63.8, angle: 2.98, arc: 3.1, rest: Math.PI / 2, guns: 1, my: 6.47,
              mask: [[-0.14, -0.09, 0.524], [-0.1, -0.06, 0.437], [-0.07, -0.02, 0.35],
                [-0.03, 0, 0.21], [-0.01, 0.03, 0.175], [0.02, 0.05, 0.123], [0.04, 0.1, 0.105],
                [0.09, 0.17, 0.07], [0.16, 0.19, 0.009], [0.18, 0.28, -0.008], [0.27, 0.35, -0.026],
                [2.8, 2.96, 0.027], [2.95, 3.14, 0.044], [3.13, -3.13, 0.175],
                [-3.14, -3.08, 0.262], [-3.09, -3.06, 0.21], [-3.07, -3.02, 0.175],
                [-3.03, -2.94, 0.262], [-2.95, -2.87, 0.35], [-2.88, -2.85, 0.262],
                [-2.86, -2.83, 0.175], [-2.84, -2.74, 0.14], [-2.75, -2.66, 0.175],
                [-2.67, -2.6, 0.21], [-2.61, -2.59, 0.175], [-2.6, -2.55, -0.026],
                [-2.56, -2.5, 0.027], [-2.51, -2.33, -0.026], [-2.34, -2.27, 0.027],
                [-2.28, -2.22, -0.026], [-2.23, -2.17, 0.027], [-2.18, -2.15, -0.026],
                [-2.16, -2.12, 0.027], [-2.13, -2.05, 0.044], [-2.06, -1.87, 0.088],
                [-1.88, -1.84, 0.07], [-1.85, -1.82, 0.044], [-1.83, -1.78, 0.009],
                [-1.79, -1.73, -0.008], [-1.74, -1.68, 0.009], [-1.69, -1.59, -0.008],
                [-1.6, -1.54, 0.009], [-1.55, -1.45, -0.008], [-1.46, -1.4, 0.009],
                [-1.41, -1.33, -0.008], [-1.34, -1.23, -0.026], [-1.24, -1.17, -0.008],
                [-1.18, -1.1, 0.009], [-1.11, -1.05, -0.008], [-1.06, -1.02, -0.026],
                [-1.03, -0.96, -0.008], [-0.97, -0.91, 0.009], [-0.92, -0.89, -0.008],
                [-0.9, -0.88, 0.027], [-0.89, -0.86, 0.07], [-0.87, -0.84, 0.123],
                [-0.85, -0.77, 0.175], [-0.78, -0.7, 0.262], [-0.71, -0.65, 0.21],
                [-0.66, -0.51, 0.262], [-0.52, -0.27, 0.35], [-0.28, -0.18, 0.437]] },
            { x: -7.6, z: -63.8, angle: -2.98, arc: 3.1, rest: -Math.PI / 2, guns: 1, my: 6.47,
              mask: [[0.18, 0.28, 0.437], [0.27, 0.52, 0.35], [0.51, 0.66, 0.262],
                [0.65, 0.71, 0.21], [0.7, 0.78, 0.262], [0.77, 0.85, 0.175], [0.84, 0.87, 0.123],
                [0.86, 0.89, 0.07], [0.88, 0.9, 0.027], [0.89, 0.92, -0.008], [0.91, 0.97, 0.009],
                [0.96, 1.03, -0.008], [1.02, 1.06, -0.026], [1.05, 1.11, -0.008],
                [1.1, 1.18, 0.009], [1.17, 1.24, -0.008], [1.23, 1.34, -0.026],
                [1.33, 1.41, -0.008], [1.4, 1.46, 0.009], [1.45, 1.55, -0.008], [1.54, 1.6, 0.009],
                [1.59, 1.69, -0.008], [1.68, 1.74, 0.009], [1.73, 1.79, -0.008],
                [1.78, 1.83, 0.009], [1.82, 1.85, 0.044], [1.84, 1.88, 0.07], [1.87, 2.06, 0.088],
                [2.05, 2.13, 0.044], [2.12, 2.16, 0.027], [2.15, 2.18, -0.026], [2.17, 2.23, 0.027],
                [2.22, 2.28, -0.026], [2.27, 2.34, 0.027], [2.33, 2.51, -0.026], [2.5, 2.56, 0.027],
                [2.55, 2.6, -0.026], [2.59, 2.61, 0.175], [2.6, 2.67, 0.21], [2.66, 2.75, 0.175],
                [2.74, 2.84, 0.14], [2.83, 2.86, 0.175], [2.85, 2.88, 0.262], [2.87, 2.95, 0.35],
                [2.94, 3.03, 0.262], [3.02, 3.07, 0.175], [3.06, 3.09, 0.21], [3.08, 3.14, 0.262],
                [3.13, -3.13, 0.175], [-3.14, -2.95, 0.044], [-2.96, -2.8, 0.027],
                [-0.35, -0.27, -0.026], [-0.28, -0.18, -0.008], [-0.19, -0.16, 0.009],
                [-0.17, -0.09, 0.07], [-0.1, -0.04, 0.105], [-0.05, -0.02, 0.123],
                [-0.03, 0.01, 0.175], [0, 0.03, 0.21], [0.02, 0.07, 0.35], [0.06, 0.1, 0.437],
                [0.09, 0.14, 0.524]] },
            { x: 7.7, z: -61.6, angle: 2.97, arc: 3.1, rest: Math.PI / 2, guns: 1, my: 6.46,
              mask: [[-0.15, -0.06, 0.524], [-0.07, -0.02, 0.437], [-0.03, 0, 0.21],
                [-0.01, 0.03, 0.175], [0.02, 0.05, 0.14], [0.04, 0.1, 0.105], [0.09, 0.19, 0.07],
                [0.18, 0.24, 0.009], [0.23, 0.29, -0.008], [0.28, 0.43, -0.026],
                [2.81, 2.91, -0.026], [2.9, 3, 0.027], [2.99, 3.12, 0.044], [3.11, 3.14, 0.027],
                [3.13, -3.13, 0.105], [-3.14, -3.11, 0.175], [-3.12, -3.06, 0.21],
                [-3.07, -2.97, 0.175], [-2.98, -2.9, 0.262], [-2.91, -2.78, 0.088],
                [-2.79, -2.76, 0.044], [-2.77, -2.73, 0.07], [-2.74, -2.71, 0.088],
                [-2.72, -2.62, 0.175], [-2.63, -2.6, 0.027], [-2.61, -2.59, -0.026],
                [-2.6, -2.5, 0.027], [-2.51, -2.39, -0.026], [-2.4, -2.34, 0.027],
                [-2.35, -2.26, -0.026], [-2.27, -2.22, 0.027], [-2.23, -2.17, 0.044],
                [-2.18, -2.13, 0.07], [-2.14, -1.99, 0.088], [-2, -1.96, 0.044],
                [-1.97, -1.91, 0.009], [-1.92, -1.87, -0.008], [-1.88, -1.82, 0.009],
                [-1.83, -1.73, -0.008], [-1.74, -1.68, 0.009], [-1.69, -1.59, -0.008],
                [-1.6, -1.54, 0.009], [-1.55, -1.47, -0.008], [-1.48, -1.37, -0.026],
                [-1.38, -1.3, -0.008], [-1.31, -1.23, 0.009], [-1.24, -1.17, -0.008],
                [-1.18, -1.12, -0.026], [-1.13, -1.07, -0.008], [-1.08, -1.02, 0.009],
                [-1.03, -1, 0.07], [-1.01, -0.98, 0.088], [-0.99, -0.93, 0.175],
                [-0.94, -0.89, 0.21], [-0.9, -0.7, 0.262], [-0.71, -0.28, 0.35],
                [-0.29, -0.2, 0.437]] },
            { x: -7.7, z: -61.6, angle: -2.97, arc: 3.1, rest: -Math.PI / 2, guns: 1, my: 6.47,
              mask: [[0.2, 0.29, 0.437], [0.28, 0.71, 0.35], [0.7, 0.9, 0.262], [0.89, 0.94, 0.21],
                [0.93, 0.99, 0.175], [0.98, 1.01, 0.088], [1, 1.03, 0.07], [1.02, 1.08, 0.009],
                [1.07, 1.13, -0.008], [1.12, 1.18, -0.026], [1.17, 1.24, -0.008],
                [1.23, 1.31, 0.009], [1.3, 1.38, -0.008], [1.37, 1.48, -0.026],
                [1.47, 1.55, -0.008], [1.54, 1.6, 0.009], [1.59, 1.69, -0.008], [1.68, 1.74, 0.009],
                [1.73, 1.83, -0.008], [1.82, 1.88, 0.009], [1.87, 1.92, -0.008],
                [1.91, 1.97, 0.009], [1.96, 2, 0.044], [1.99, 2.14, 0.088], [2.13, 2.18, 0.07],
                [2.17, 2.23, 0.044], [2.22, 2.27, 0.027], [2.26, 2.35, -0.026], [2.34, 2.4, 0.027],
                [2.39, 2.51, -0.026], [2.5, 2.6, 0.027], [2.59, 2.61, -0.026], [2.6, 2.63, 0.027],
                [2.62, 2.72, 0.175], [2.71, 2.74, 0.088], [2.73, 2.77, 0.07], [2.76, 2.79, 0.044],
                [2.78, 2.91, 0.088], [2.9, 2.98, 0.262], [2.97, 3.07, 0.175], [3.06, 3.12, 0.21],
                [3.11, 3.14, 0.175], [3.13, -3.13, 0.105], [-3.14, -3.11, 0.027],
                [-3.12, -2.99, 0.044], [-3, -2.9, 0.027], [-2.91, -2.81, -0.026],
                [-0.43, -0.28, -0.026], [-0.29, -0.23, -0.008], [-0.24, -0.18, 0.009],
                [-0.19, -0.09, 0.07], [-0.1, -0.04, 0.105], [-0.05, -0.02, 0.14],
                [-0.03, 0.01, 0.175], [0, 0.03, 0.21], [0.02, 0.07, 0.437], [0.06, 0.15, 0.524]] },
            { x: 8.7, z: -56.4, angle: 2.97, arc: 3.1, rest: Math.PI / 2, guns: 1, my: 6.46,
              mask: [[-0.15, -0.06, 0.524], [-0.07, -0.02, 0.262], [-0.03, 0.01, 0.21],
                [0, 0.03, 0.14], [0.02, 0.08, 0.123], [0.07, 0.1, 0.105], [0.09, 0.17, 0.088],
                [0.16, 0.19, 0.009], [0.18, 0.26, -0.008], [0.25, 0.42, -0.026],
                [3.02, 3.07, -0.026], [3.06, 3.1, 0.009], [3.09, -3.11, 0.027],
                [-3.12, -3.09, 0.044], [-3.1, -3.04, 0.175], [-3.05, -3.01, 0.088],
                [-3.02, -2.97, 0.123], [-2.98, -2.95, 0.175], [-2.96, -2.9, 0.262],
                [-2.91, -2.85, 0.044], [-2.86, -2.81, 0.027], [-2.82, -2.78, 0.044],
                [-2.79, -2.74, 0.07], [-2.75, -2.67, 0.14], [-2.68, -2.59, 0.027],
                [-2.6, -2.57, -0.026], [-2.58, -2.45, 0.027], [-2.46, -2.43, -0.026],
                [-2.44, -2.36, 0.027], [-2.37, -2.34, 0.044], [-2.35, -2.22, 0.07],
                [-2.23, -2.19, 0.044], [-2.2, -2.13, 0.009], [-2.14, -2.12, -0.008],
                [-2.13, -2.06, 0.009], [-2.07, -2.03, -0.008], [-2.04, -1.96, 0.009],
                [-1.97, -1.91, -0.008], [-1.92, -1.84, 0.009], [-1.85, -1.78, -0.008],
                [-1.79, -1.64, -0.026], [-1.65, -1.59, -0.008], [-1.6, -1.54, 0.009],
                [-1.55, -1.49, -0.008], [-1.5, -1.42, -0.026], [-1.43, -1.38, 0.21],
                [-1.39, -1.33, 0.262], [-1.34, -1.14, 0.35], [-1.15, -0.49, 0.437],
                [-0.5, -0.39, 0.35], [-0.4, -0.37, 0.437], [-0.38, -0.28, 0.524],
                [-0.29, -0.2, 0.437]] },
            { x: -8.7, z: -56.4, angle: -2.97, arc: 3.1, rest: -Math.PI / 2, guns: 1, my: 6.46,
              mask: [[0.2, 0.29, 0.437], [0.28, 0.38, 0.524], [0.37, 0.4, 0.437], [0.39, 0.5, 0.35],
                [0.49, 1.15, 0.437], [1.14, 1.34, 0.35], [1.33, 1.39, 0.262], [1.38, 1.43, 0.21],
                [1.42, 1.5, -0.026], [1.49, 1.55, -0.008], [1.54, 1.6, 0.009], [1.59, 1.65, -0.008],
                [1.64, 1.79, -0.026], [1.78, 1.85, -0.008], [1.84, 1.92, 0.009],
                [1.91, 1.97, -0.008], [1.96, 2.04, 0.009], [2.03, 2.07, -0.008],
                [2.06, 2.13, 0.009], [2.12, 2.14, -0.008], [2.13, 2.2, 0.009], [2.19, 2.23, 0.044],
                [2.22, 2.35, 0.07], [2.34, 2.37, 0.044], [2.36, 2.44, 0.027], [2.43, 2.46, -0.026],
                [2.45, 2.58, 0.027], [2.57, 2.6, -0.026], [2.59, 2.68, 0.027], [2.67, 2.75, 0.14],
                [2.74, 2.79, 0.07], [2.78, 2.82, 0.044], [2.81, 2.86, 0.027], [2.85, 2.91, 0.044],
                [2.9, 2.96, 0.262], [2.95, 2.98, 0.175], [2.97, 3.02, 0.123], [3.01, 3.05, 0.088],
                [3.04, 3.1, 0.175], [3.09, 3.12, 0.044], [3.11, -3.09, 0.027], [-3.1, -3.06, 0.009],
                [-3.07, -3.02, -0.026], [-0.42, -0.25, -0.026], [-0.26, -0.18, -0.008],
                [-0.19, -0.16, 0.009], [-0.17, -0.09, 0.088], [-0.1, -0.07, 0.105],
                [-0.08, -0.02, 0.123], [-0.03, 0, 0.14], [-0.01, 0.03, 0.21], [0.02, 0.07, 0.262],
                [0.06, 0.15, 0.524]] },
            { x: 8.1, z: -52.3, angle: 1.81, arc: 2.78, rest: Math.PI / 2, guns: 1, my: 6.48,
              mask: [[-0.99, -0.58, 0.524], [-0.59, -0.42, 0.437], [-0.43, -0.25, 0.524],
                [-0.26, -0.2, 0.786], [-0.21, -0.14, 0.699], [-0.15, -0.07, 0.524],
                [-0.08, -0.06, 0.437], [-0.07, -0.04, 0.35], [-0.05, 0.01, 0.262], [0, 0.03, 0.21],
                [0.02, 0.07, 0.175], [0.06, 0.1, 0.14], [0.09, 0.12, 0.123], [0.11, 0.21, 0.088],
                [0.2, 0.22, 0.07], [0.21, 0.26, 0.009], [0.25, 0.33, -0.008], [0.32, 0.54, -0.026],
                [2.71, 2.95, -0.026], [2.94, 3.09, 0.009], [3.08, -3.13, 0.027],
                [-3.14, -3.11, 0.07], [-3.12, -3.06, 0.14], [-3.07, -3.01, 0.088],
                [-3.02, -2.99, 0.14], [-3, -2.94, 0.21], [-2.95, -2.85, 0.027],
                [-2.86, -2.8, 0.044], [-2.81, -2.78, 0.123], [-2.79, -2.73, 0.14],
                [-2.74, -2.5, 0.027], [-2.51, -2.48, 0.044], [-2.49, -2.38, 0.07],
                [-2.39, -2.34, 0.044], [-2.35, -2.17, 0.009], [-2.18, -2.13, -0.008],
                [-2.14, -2.06, 0.009], [-2.07, -2.03, -0.008], [-2.04, -2.01, 0.105],
                [-2.02, -1.99, 0.14], [-2, -1.98, 0.175], [-1.99, -1.85, 0.35],
                [-1.86, -1.78, 0.437], [-1.79, -1.68, 0.524]] },
            { x: -8.1, z: -52.3, angle: -1.81, arc: 2.78, rest: -Math.PI / 2, guns: 1, my: 6.46,
              mask: [[1.68, 1.79, 0.524], [1.78, 1.86, 0.437], [1.85, 1.99, 0.35], [1.98, 2, 0.175],
                [1.99, 2.02, 0.14], [2.01, 2.04, 0.105], [2.03, 2.07, -0.008], [2.06, 2.14, 0.009],
                [2.13, 2.18, -0.008], [2.17, 2.35, 0.009], [2.34, 2.39, 0.044], [2.38, 2.49, 0.07],
                [2.48, 2.51, 0.044], [2.5, 2.74, 0.027], [2.73, 2.79, 0.14], [2.78, 2.81, 0.123],
                [2.8, 2.86, 0.044], [2.85, 2.95, 0.027], [2.94, 3, 0.21], [2.99, 3.02, 0.14],
                [3.01, 3.07, 0.088], [3.06, 3.12, 0.14], [3.11, 3.14, 0.07], [3.13, -3.08, 0.027],
                [-3.09, -2.94, 0.009], [-2.95, -2.71, -0.026], [-0.54, -0.32, -0.026],
                [-0.33, -0.25, -0.008], [-0.26, -0.21, 0.009], [-0.22, -0.2, 0.07],
                [-0.21, -0.11, 0.088], [-0.12, -0.09, 0.123], [-0.1, -0.06, 0.14],
                [-0.07, -0.02, 0.175], [-0.03, 0, 0.21], [-0.01, 0.05, 0.262], [0.04, 0.07, 0.35],
                [0.06, 0.08, 0.437], [0.07, 0.15, 0.524], [0.14, 0.21, 0.699], [0.2, 0.26, 0.786],
                [0.25, 0.43, 0.524], [0.42, 0.59, 0.437], [0.58, 0.99, 0.524]] },
          ] },
      ],
    },
    // Her Kingfishers, off the two catapults on her fantail either side of
    // her crane; the evolution is the Cleveland's.
    planes: {
      squadrons: 2, perSquadron: 2, cruiseSpeed: 58, strikeRange: 9600,
      rearm: 95, hp: 640, dropSpread: 0.06,
      torpDamage: 0, torpSpeed: 0, torpRange: 0, floodChance: 0,
      bombDamage: 900, bombHit: 0.32, bombFire: 0.1, bombPen: 25, bombBore: 0.2,
      type: 'kingfisher',
      catapult: true, deckRun: 8.6, deckCycle: 30,
      // Where the shot leaves her, off the integrated shot from her own
      // girders: trained out over her quarter from turntables right aft, a
      // hundred and thirty-seven metres out and abaft her beam, twenty-two
      // and a half metres up.
      runHeight: 22.5,
      runOut: 137.5, runBearing: 1.83,
      flight: { fighters: 0, dive: 2, torpedo: 0 },
    },
    datasheet: {
      displacement: 35000,
      aircraft: 3,
      mainRounds: 1170,
      secondary: { caliber: 127, label: '5"', barrels: 20, rounds: 9000 },
      tertiary: [
        { caliber: 40, label: '40mm', barrels: 68, rounds: 81600 },
        { caliber: 20, label: '20mm', barrels: 10, rounds: 24000 },
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

  musashi: {
    // IJN Musashi, Yamato's sister and the second of the class: nine 46 cm/45
    // in three triples behind a 410 mm belt, and the only battleship of either
    // side sunk by aircraft alone while under way at sea -- at Sibuyan Sea, on
    // 24 October 1944, after nineteen torpedoes and seventeen bombs.
    //
    // She is drawn from the owner's sculpts of her (see musashi.js): her hull,
    // her superstructure, her bridge and her guns, at her own length -- 263 m
    // -- and floated at 10.4 m. She keeps all four 15.5 cm triples, the wing
    // pair abreast her tower included, with a 25 mm battery round them as she
    // carried it by 1944.
    id: 'musashi',
    name: 'Musashi',
    fullName: 'IJN Musashi',
    className: 'Yamato',
    type: 'BB',
    typeName: 'Battleship',
    nation: 'jpn',
    blurb: 'Yamato\'s sister, with all four of her 15.5 cm turrets. It took nineteen torpedoes and seventeen bombs to sink her.',
    hull: { length: 263, beam: 38.9, draft: 10.4, superstructure: 1.45 },
    hp: 92400,
    maxSpeed: 27 * KNOTS,
    reverseSpeed: 6 * KNOTS,
    accel: 0.36,
    turnRate: 0.05,
    rudderShift: 15.5,
    speedLossInTurn: 0.16,
    concealment: 16800,
    fireDetectPenalty: 7000,
    radarRange: 9500,
    repairCooldown: 105,
    repairHeal: 0.13,
    smokeCharges: 0,
    // As Yamato: 410 mm of belt inclined twenty degrees, 200 mm of deck, 650
    // on the turret faces, and soft ends.
    armor: { belt: 410, deck: 200, citadel: 410, bow: 50, superstructure: 50 },
    turrets: [
      // No.1 on her forecastle, No.2 superfiring over it, and No.3 on her
      // quarterdeck facing astern, each on the middle of the barbette the
      // sculpt drew it on.
      { id: 0, name: 'No.1', x: 0, z: 53.9, angle: 0, arc: 2.47, guns: 3, my: 8.55,
        lift: [[-2.49, -2.43, 0.123], [-2.44, -2.41, 0.088], [-2.42, -2.39, -0.008],
          [-1.9, -1.8, 0.009], [-1.71, -1.61, 0.018], [-1.51, -1.42, 0.018], [-1.43, -1.4, -0.008],
          [-0.69, -0.67, 0.027], [-0.68, -0.65, 0.053], [-0.66, -0.56, 0.088], [-0.57, -0.51, 0.07],
          [-0.52, -0.49, 0.053], [-0.5, -0.47, 0.044], [-0.48, -0.46, 0.035], [-0.47, -0.44, 0.044],
          [-0.45, -0.35, 0.088], [-0.36, -0.32, 0.07], [-0.33, -0.28, 0.053], [-0.29, -0.27, 0.044],
          [-0.28, -0.25, 0.035], [-0.26, -0.23, 0.044], [-0.24, -0.14, 0.088], [-0.15, -0.11, 0.07],
          [-0.12, -0.09, 0.053], [-0.1, -0.06, 0.044], [-0.07, -0.04, 0.035], [-0.05, -0.02, 0.018],
          [-0.03, 0.35, 0.009], [0.34, 0.45, 0], [1.02, 1.11, 0], [1.21, 1.31, -0.008],
          [1.42, 1.51, 0], [1.61, 1.71, 0.009], [1.8, 1.9, 0], [2.39, 2.42, 0.044],
          [2.41, 2.44, 0.088], [2.43, 2.49, 0.14]],
        mask: [[-2.49, -2.45, 0.123], [-2.46, -2.43, 0.088], [-2.44, -2.41, -0.008],
          [-1.88, -1.82, 0.009], [-1.69, -1.63, 0.018], [-1.5, -1.43, 0.018],
          [-1.44, -1.42, -0.008], [-0.68, -0.65, 0.027], [-0.66, -0.63, 0.053],
          [-0.64, -0.58, 0.088], [-0.59, -0.53, 0.07], [-0.54, -0.51, 0.053], [-0.52, -0.49, 0.044],
          [-0.5, -0.47, 0.035], [-0.48, -0.46, 0.027], [-0.47, -0.44, 0.018], [-0.45, -0.42, 0.044],
          [-0.43, -0.37, 0.088], [-0.38, -0.34, 0.07], [-0.35, -0.3, 0.053], [-0.31, -0.28, 0.044],
          [-0.29, -0.27, 0.035], [-0.28, -0.23, 0.027], [-0.24, -0.21, 0.044],
          [-0.22, -0.16, 0.088], [-0.17, -0.13, 0.07], [-0.14, -0.11, 0.053], [-0.12, -0.07, 0.044],
          [-0.08, -0.06, 0.035], [-0.07, 0.1, 0.027], [0.09, 0.17, 0.018], [0.16, 0.24, 0.009],
          [0.23, 0.26, 0], [0.25, 0.33, 0.009], [0.32, 0.36, 0], [0.35, 0.38, -0.008],
          [0.37, 0.43, 0], [1.03, 1.1, 0], [1.23, 1.29, -0.008], [1.43, 1.5, 0],
          [1.63, 1.69, 0.009], [1.82, 1.88, 0], [2.39, 2.42, -0.008], [2.41, 2.44, 0.044],
          [2.43, 2.46, 0.088], [2.45, 2.49, 0.14]] },
      { id: 1, name: 'No.2', x: 0, z: 30.75, angle: 0, arc: 2.72, guns: 3, my: 11.19,
        lift: [[-0.55, -0.51, -0.008], [-0.52, -0.32, 0], [-0.33, -0.2, 0.009], [-0.21, -0.16, 0],
          [-0.17, -0.02, 0.009], [-0.03, 0.01, 0], [0, 0.15, 0.009], [0.14, 0.54, 0]],
        mask: [[-2.74, -2.67, 0.14], [-2.68, -2.5, 0.035], [-0.54, -0.49, -0.008], [-0.5, -0.3, 0],
          [-0.31, -0.21, 0.009], [-0.22, -0.14, 0], [-0.15, -0.04, 0.009], [-0.05, 0.03, 0],
          [0.02, 0.14, 0.009], [0.13, 0.52, 0], [2.52, 2.68, 0.035], [2.67, 2.74, 0.14]] },
      { id: 2, name: 'No.3', x: 0, z: -64.25, angle: 3.13, arc: 2.34, guns: 3, my: 10.24,
        lift: [[0.96, 0.99, 0.009], [0.98, 1.1, 0.018], [1.09, 1.11, -0.008], [1.12, 1.15, -0.008],
          [1.14, 1.25, 0.018], [1.24, 1.27, 0], [1.26, 1.31, 0.009], [1.3, 1.41, 0.018],
          [1.4, 1.43, 0.009], [2.81, 2.98, -0.008], [2.99, -2.95, -0.008], [-1.43, -1.4, 0.009],
          [-1.41, -1.3, 0.018], [-1.31, -1.24, 0.009], [-1.25, -1.14, 0.018],
          [-1.15, -1.12, -0.008], [-1.11, -1.09, -0.008], [-1.1, -0.98, 0.018],
          [-0.99, -0.96, 0.009]],
        mask: [[0.98, 1.01, 0.009], [1, 1.08, 0.018], [1.07, 1.1, -0.008], [1.14, 1.17, -0.008],
          [1.16, 1.24, 0.018], [1.23, 1.25, 0], [1.28, 1.32, 0.009], [1.31, 1.39, 0.018],
          [1.38, 1.41, 0.009], [2.55, 2.74, -0.008], [2.73, 2.82, 0], [2.81, 2.93, 0.009],
          [2.92, 3.05, 0.018], [3.04, -3.13, 0.088], [-3.14, -3.11, 0.035], [-3.12, -3.06, 0.21],
          [-3.07, -3.04, 0.088], [-3.05, -2.92, 0.018], [-2.93, -2.87, 0.009], [-2.88, -2.73, 0],
          [-2.74, -2.64, -0.008], [-1.41, -1.38, 0.009], [-1.39, -1.31, 0.018],
          [-1.32, -1.28, 0.009], [-1.25, -1.23, 0.009], [-1.24, -1.16, 0.018],
          [-1.17, -1.14, -0.008], [-1.1, -1.07, -0.008], [-1.08, -1, 0.018], [-1.01, -0.98, 0.009]] },
    ],
    gun: {
      name: '46 cm/45 Type 94', role: 'surface',
      // Five below the horizontal to forty-five up.
      elev: { min: -0.087, max: 0.785 },
      reach: 18.2,
      caliber: 460, reload: 29, traverse: 0.06, range: 23800, sigma: 1.30,
      shells: shells(460, 15800, 7400, 760, 780, 0.26),
    },
    torpedoes: null,
    // Four 15.5 cm/60 triples, Mogami's old main-battery turrets: one on her
    // centreline forward of her tower, one at the after end of her
    // superstructure, and one either side abreast her tower.
    secondary: {
      name: '15.5 cm/60 Type 3', role: 'surface',
      elev: { min: -0.122, max: 1.309 },
      reach: 8.7,
      caliber: 155, reload: 9.5, traverse: 0.10, range: 14600, sigma: 1.45,
      shells: shells(155, 3100, 2500, 175, 920, 0.12),
      mounts: [
        { x: 0, z: 14.6, angle: -0.04, arc: 2.31, rest: 0, guns: 3, my: 13.98,
          lift: [[-2.37, -2.24, 0.088], [-2.25, -2.13, 0.07], [-2.14, -2.12, 0.044],
            [-2.13, -2.1, 0.018], [-0.69, -0.61, 0.009], [-0.62, -0.54, 0.018],
            [-0.55, -0.47, 0.027], [-0.48, -0.42, 0.035], [-0.43, -0.41, 0.044],
            [-0.42, -0.37, 0.053], [-0.38, -0.28, 0.07], [-0.29, -0.27, 0.088],
            [-0.28, -0.25, 0.105], [-0.26, 0.26, 0.123], [0.25, 0.28, 0.105], [0.27, 0.31, 0.07],
            [0.3, 0.35, 0.053], [0.34, 0.4, 0.044], [0.39, 0.45, 0.035], [0.44, 0.52, 0.027],
            [0.51, 0.59, 0.018], [0.58, 0.66, 0.009], [0.65, 0.68, 0], [2.1, 2.13, 0.018],
            [2.12, 2.14, 0.044], [2.13, 2.23, 0.07], [2.22, 2.28, 0.088]],
          mask: [[-2.37, -2.26, 0.088], [-2.27, -2.15, 0.07], [-2.16, -2.13, 0.044],
            [-2.14, -2.12, 0.018], [-0.68, -0.6, 0.009], [-0.61, -0.53, 0.018],
            [-0.54, -0.49, 0.027], [-0.5, -0.47, 0.044], [-0.48, -0.41, 0.07],
            [-0.42, -0.35, 0.053], [-0.36, -0.27, 0.07], [-0.28, -0.25, 0.088],
            [-0.26, -0.23, 0.105], [-0.24, -0.09, 0.123], [-0.1, -0.07, 0.105],
            [-0.08, -0.06, 0.088], [-0.07, 0.07, 0.123], [0.06, 0.08, 0.088], [0.07, 0.1, 0.105],
            [0.09, 0.24, 0.123], [0.23, 0.26, 0.105], [0.25, 0.31, 0.088], [0.3, 0.33, 0.07],
            [0.32, 0.42, 0.088], [0.41, 0.43, 0.07], [0.42, 0.47, 0.053], [0.46, 0.48, 0.044],
            [0.47, 0.5, 0.035], [0.49, 0.52, 0.027], [0.51, 0.57, 0.018], [0.56, 0.64, 0.009],
            [0.63, 0.66, 0], [2.12, 2.14, 0.018], [2.13, 2.16, 0.044], [2.15, 2.25, 0.07],
            [2.24, 2.28, 0.088]] },
        { x: 0, z: -50, angle: -3.14, arc: 2.87, rest: Math.PI, guns: 3, my: 14.03,
          lift: [[2.46, 2.51, -0.008], [2.5, 2.53, 0.07], [2.52, 3.1, 0.105], [3.09, 3.12, 0.07],
            [3.11, 3.14, 0.035], [3.13, -3.13, -0.008], [-3.14, -3.11, 0], [-3.12, -3.09, 0.027],
            [-3.1, -2.52, 0.053], [-2.53, -2.5, 0.027]],
          mask: [[0.25, 0.38, 0.699], [0.37, 0.45, 0.786], [0.44, 0.57, 0.07], [0.56, 0.62, 0.053],
            [2.48, 2.53, -0.008], [2.52, 2.54, 0.07], [2.53, 2.72, 0.105], [2.71, 2.75, 0.088],
            [2.74, 2.89, 0.105], [2.88, 2.93, 0.088], [2.92, 3.09, 0.105], [3.08, 3.1, 0.07],
            [3.09, 3.12, 0.035], [3.11, 3.14, 0.018], [3.13, -3.13, 0.009], [-3.14, -3.08, 0.027],
            [-3.09, -2.53, 0.053], [-2.54, -2.52, 0.027], [-0.62, -0.6, 0.044],
            [-0.61, -0.56, 0.053], [-0.57, -0.44, 0.07], [-0.45, -0.37, 0.786],
            [-0.38, -0.25, 0.699]] },
        { x: -16, z: -0.9, angle: -1.27, arc: 2.05, rest: 0, guns: 3, my: 10.13,
          lift: [[2.95, 3.02, 0.175], [3.01, 3.03, 0.14], [0.65, 0.68, 0.07], [0.67, 0.71, 0.088],
            [0.7, 0.75, 0.105], [0.74, 0.8, 0.123]],
          mask: [[2.95, 3, 0.437], [2.99, 3.03, 0.175], [3.02, -3.13, 0.14], [-3.14, -3.06, 0.088],
            [-3.07, -3.04, 0.07], [-3.05, -3.02, 0], [-3.03, -3.01, -0.008], [0.04, 0.07, -0.008],
            [0.06, 0.15, 0.009], [0.14, 0.17, 0.018], [0.16, 0.21, 0.027], [0.2, 0.22, 0.035],
            [0.21, 0.24, 0.053], [0.23, 0.29, 0.123], [0.28, 0.55, 0.175], [0.54, 0.59, 0.262],
            [0.58, 0.64, 0.35], [0.63, 0.71, 0.437], [0.7, 0.8, 0.524]] },
        { x: 16, z: -0.9, angle: 1.27, arc: 2.05, rest: 0, guns: 3, my: 10.13,
          lift: [[-0.8, -0.74, 0.123], [-0.75, -0.7, 0.105], [-0.71, -0.67, 0.088],
            [-0.68, -0.65, 0.07], [-3.03, -3.01, 0.14], [-3.02, -2.95, 0.175]],
          mask: [[-0.8, -0.7, 0.524], [-0.71, -0.63, 0.437], [-0.64, -0.58, 0.35],
            [-0.59, -0.54, 0.262], [-0.55, -0.28, 0.175], [-0.29, -0.23, 0.123],
            [-0.24, -0.21, 0.053], [-0.22, -0.2, 0.035], [-0.21, -0.16, 0.027],
            [-0.17, -0.14, 0.018], [-0.15, -0.06, 0.009], [-0.07, -0.04, -0.008],
            [3.01, 3.03, -0.008], [3.02, 3.05, 0], [3.04, 3.07, 0.07], [3.06, 3.14, 0.088],
            [3.13, -3.02, 0.14], [-3.03, -2.99, 0.175], [-3, -2.95, 0.437]] },
      ],
    },
    aa: {
      range: 6800, dps: 150,
      guns: [
        // Six 12.7 cm Type 89 twins in their shields, three a side abreast her
        // funnel, the middle pair a deck higher.
        { name: '12.7 cm Type 89', caliber: 127, role: 'dp', reload: 4.0, range: 6800,
          elev: { min: -0.14, max: 1.57 },
          mounts: [
            { x: -8.23, z: -9.41, angle: -2.33, arc: 0.74, rest: -Math.PI / 2, guns: 2, my: 11.78,
              lift: [[-3.09, -3.02, 0.21], [-3.03, -3.01, 0.175], [-3.02, -2.99, 0.105],
                [-3, -2.97, 0.07], [-1.67, -1.64, 0.088], [-1.65, -1.63, 0.35],
                [-1.64, -1.57, 0.437]],
              mask: [[-3.09, -3.04, 0.786], [-3.05, -3.02, 0.699], [-3.03, -3.01, 0.524],
                [-3.02, -2.99, 0.07], [-3, -2.78, 0.018], [-2.79, -2.76, 0], [-2.77, -2.73, 0.018],
                [-2.74, -2.64, 0.524], [-2.65, -2.57, 0.611], [-2.58, -2.48, 0.524],
                [-2.49, -2.46, 0.07], [-2.47, -2.45, 0], [-1.65, -1.63, 0.088],
                [-1.64, -1.61, 0.35], [-1.62, -1.57, 0.437]] },
            { x: 8.23, z: -9.41, angle: 2.33, arc: 0.74, rest: Math.PI / 2, guns: 2, my: 11.78,
              lift: [[1.57, 1.64, 0.437], [1.63, 1.65, 0.35], [1.64, 1.67, 0.088], [2.97, 3, 0.07],
                [2.99, 3.02, 0.105], [3.01, 3.03, 0.175], [3.02, 3.09, 0.21]],
              mask: [[1.57, 1.62, 0.437], [1.61, 1.64, 0.35], [1.63, 1.65, 0.088], [2.45, 2.47, 0],
                [2.46, 2.49, 0.07], [2.48, 2.58, 0.524], [2.57, 2.65, 0.611], [2.64, 2.74, 0.524],
                [2.73, 2.77, 0.018], [2.76, 2.79, 0], [2.78, 3, 0.018], [2.99, 3.02, 0.07],
                [3.01, 3.03, 0.524], [3.02, 3.05, 0.699], [3.04, 3.09, 0.786]] },
            { x: -8.1, z: -18.4, angle: -2.71, arc: 1.43, rest: -Math.PI / 2, guns: 2, my: 12.98,
              lift: [[2.13, 2.27, 0.437], [2.26, 2.34, 0.35], [2.33, 2.37, 0.262],
                [2.36, 2.39, 0.21], [2.38, 2.4, 0.175], [2.39, 2.42, 0.14], [2.41, 2.44, 0.105],
                [2.43, 2.46, 0.07], [2.45, 2.47, 0.035], [2.46, 2.49, -0.017], [2.9, 2.93, 0.175],
                [2.92, 2.95, 0.262], [2.94, 3.05, 0.35], [3.04, 3.07, 0.262], [3.06, -3.11, 0.35],
                [-1.32, -1.26, 0.437]],
              mask: [[2.13, 2.3, 1.397], [2.29, 2.49, 0.524], [2.48, 2.58, 0.611],
                [2.57, 2.81, 0.699], [2.8, 3.14, 0.786], [3.13, -3.13, 0.524], [-3.14, -2.97, 0.35],
                [-2.98, -2.95, 0.21], [-2.96, -2.94, 0.105], [-2.95, -2.92, 0.07],
                [-2.93, -2.9, 0.053], [-2.91, -2.88, 0.035], [-2.89, -2.87, 0.018],
                [-1.31, -1.26, 0.437]] },
            { x: 8.1, z: -18.4, angle: 2.71, arc: 1.43, rest: Math.PI / 2, guns: 2, my: 12.98,
              lift: [[1.26, 1.32, 0.437], [3.11, -3.06, 0.35], [-3.07, -3.04, 0.262],
                [-3.05, -2.94, 0.35], [-2.95, -2.92, 0.262], [-2.93, -2.9, 0.175],
                [-2.49, -2.46, -0.017], [-2.47, -2.45, 0.035], [-2.46, -2.43, 0.07],
                [-2.44, -2.41, 0.105], [-2.42, -2.39, 0.14], [-2.4, -2.38, 0.175],
                [-2.39, -2.36, 0.21], [-2.37, -2.33, 0.262], [-2.34, -2.26, 0.35],
                [-2.27, -2.13, 0.437]],
              mask: [[1.26, 1.31, 0.437], [2.87, 2.89, 0.018], [2.88, 2.91, 0.035],
                [2.9, 2.93, 0.053], [2.92, 2.95, 0.07], [2.94, 2.96, 0.105], [2.95, 2.98, 0.21],
                [2.97, 3.14, 0.35], [3.13, -3.13, 0.524], [-3.14, -2.8, 0.786],
                [-2.81, -2.57, 0.699], [-2.58, -2.48, 0.611], [-2.49, -2.29, 0.524],
                [-2.3, -2.13, 1.397]] },
            { x: -8.58, z: -28.97, angle: -2.16, arc: 1.69, rest: -Math.PI / 2, guns: 2, my: 11.73,
              lift: [[2.9, 2.93, 0], [2.92, 3.03, 0.018], [3.02, 3.05, 0.035], [3.04, 3.14, 0.053],
                [3.13, -3.13, 0.07], [-3.14, -2.83, 0.088], [-2.84, -2.81, 0.07],
                [-2.82, -2.73, 0.053], [-2.74, -2.71, 0.035], [-2.72, -2.69, -0.017],
                [-2.7, -2.67, -0.026], [-2.4, -2.38, 0], [-2.39, -2.36, 0.035],
                [-2.37, -2.31, 0.105], [-2.32, -2.15, 0.14], [-2.16, -1.8, 0.175],
                [-1.81, -1.68, 0.14], [-1.69, -1.57, 0.123], [-1.58, -1.54, 0.105],
                [-1.55, -1.52, 0.07], [-1.53, -1.5, 0.035], [-0.57, -0.54, 0.14],
                [-0.55, -0.53, 0.21], [-0.54, -0.46, 0.35]],
              mask: [[2.41, 2.47, 0.524], [2.46, 2.58, 1.222], [2.57, 3.03, 0.699],
                [3.02, 3.05, 0.524], [3.04, 3.09, 0.105], [3.08, -3.13, 0.053],
                [-3.14, -3.11, 0.07], [-3.12, -3.01, 0.088], [-3.02, -2.99, 0.07],
                [-3, -2.92, 0.088], [-2.93, -2.9, 0.07], [-2.91, -2.85, 0.088],
                [-2.86, -2.83, 0.07], [-2.84, -2.74, 0.053], [-2.75, -2.73, 0.035],
                [-2.74, -2.71, -0.017], [-2.72, -2.69, -0.026], [-2.39, -2.36, 0],
                [-2.37, -2.34, 0.035], [-2.35, -2.29, 0.105], [-2.3, -2.13, 0.14],
                [-2.14, -1.82, 0.175], [-1.83, -1.7, 0.14], [-1.71, -1.59, 0.123],
                [-1.6, -1.56, 0.105], [-1.57, -1.54, 0.07], [-1.55, -1.52, 0.035],
                [-1.48, -1.4, -0.026], [-1.39, -1.37, -0.026], [-1.38, -1.31, -0.017],
                [-1.32, -1.3, -0.026], [-0.59, -0.54, 0.035], [-0.55, -0.53, 0.14],
                [-0.54, -0.51, 0.21], [-0.52, -0.46, 0.35]] },
            { x: 8.58, z: -28.97, angle: 2.16, arc: 1.69, rest: Math.PI / 2, guns: 2, my: 11.73,
              lift: [[0.46, 0.54, 0.35], [0.53, 0.55, 0.21], [0.54, 0.57, 0.14], [1.5, 1.53, 0.035],
                [1.52, 1.55, 0.07], [1.54, 1.58, 0.105], [1.57, 1.69, 0.123], [1.68, 1.81, 0.14],
                [1.8, 2.16, 0.175], [2.15, 2.32, 0.14], [2.31, 2.37, 0.105], [2.36, 2.39, 0.035],
                [2.38, 2.4, 0], [2.67, 2.7, -0.026], [2.69, 2.72, -0.017], [2.71, 2.74, 0.035],
                [2.73, 2.82, 0.053], [2.81, 2.84, 0.07], [2.83, 3.14, 0.088], [3.13, -3.13, 0.07],
                [-3.14, -3.04, 0.053], [-3.05, -3.02, 0.035], [-3.03, -2.92, 0.018],
                [-2.93, -2.9, 0]],
              mask: [[0.46, 0.52, 0.35], [0.51, 0.54, 0.21], [0.53, 0.55, 0.14],
                [0.54, 0.59, 0.035], [1.3, 1.32, -0.026], [1.31, 1.38, -0.017],
                [1.37, 1.39, -0.026], [1.4, 1.48, -0.026], [1.52, 1.55, 0.035], [1.54, 1.57, 0.07],
                [1.56, 1.6, 0.105], [1.59, 1.71, 0.123], [1.7, 1.83, 0.14], [1.82, 2.14, 0.175],
                [2.13, 2.3, 0.14], [2.29, 2.35, 0.105], [2.34, 2.37, 0.035], [2.36, 2.39, 0],
                [2.69, 2.72, -0.026], [2.71, 2.74, -0.017], [2.73, 2.75, 0.035],
                [2.74, 2.84, 0.053], [2.83, 2.86, 0.07], [2.85, 2.91, 0.088], [2.9, 2.93, 0.07],
                [2.92, 3, 0.088], [2.99, 3.02, 0.07], [3.01, 3.12, 0.088], [3.11, 3.14, 0.07],
                [3.13, -3.08, 0.053], [-3.09, -3.04, 0.105], [-3.05, -3.02, 0.524],
                [-3.03, -2.57, 0.699], [-2.58, -2.46, 1.222], [-2.47, -2.41, 0.524]] },
          ] },
        // Thirty triple 25 mm Type 96: round her superstructure and the four
        // right aft in their shields, the rest -- on her forecastle, abreast
        // No.2 and No.3 and on her quarterdeck -- open on their pedestals.
        // Where the sculpts drew one each.
        { name: '25 mm Type 96', caliber: 25, role: 'aa', reload: 0.16, range: 3000,
          elev: { min: -0.175, max: 1.396 },
          mounts: [
            { x: -11.73, z: 17.62, angle: -0.64, arc: 2.85, rest: -1.5708, guns: 3, pod: true, my: 8.34,
              mask: [[2.78, 2.82, 0.873], [2.81, 2.88, 0.786], [2.87, 2.89, 0.699],
                [2.88, 2.96, 0.611], [2.95, 3.09, 0.524], [3.08, 3.12, 0.437], [3.11, -3.06, 0.262],
                [-3.07, -2.71, 0.21], [-2.72, -2.6, 0], [-2.61, -2.46, -0.026],
                [-1.38, -1.26, -0.026], [-1.24, -1.17, -0.026], [-0.47, -0.23, -0.026],
                [-0.22, -0.14, -0.026], [-0.15, -0.09, -0.017], [-0.1, 0.05, 0],
                [0.04, 0.12, 0.018], [0.11, 0.17, 0.053], [0.16, 0.22, 0.088], [0.21, 0.28, 0.105],
                [0.27, 0.29, 0.123], [0.28, 0.31, 0.21], [0.3, 0.35, 0.262], [0.34, 0.45, 0.35],
                [0.44, 0.5, 0.524], [0.49, 0.59, 0.611], [0.58, 1.17, 0.699], [1.16, 1.24, 0.611],
                [1.23, 1.32, 0.524], [1.31, 1.38, 0.437], [1.37, 1.39, 0.35], [1.38, 1.41, 0.262],
                [1.4, 1.43, 0.14], [1.42, 1.46, 0.105], [1.45, 1.48, 0.088], [1.47, 1.5, 0.07],
                [1.49, 1.57, 0.018], [1.56, 1.62, 0.699], [1.61, 1.9, 0.786], [1.89, 1.93, 0.699],
                [1.92, 2.02, 0.786], [2.01, 2.09, 0.873], [2.08, 2.11, 0.786], [2.1, 2.14, 0.873],
                [2.13, 2.2, 0.96], [2.19, 2.23, 1.048]] },
            { x: 11.73, z: 17.62, angle: 0.64, arc: 2.85, rest: 1.5708, guns: 3, pod: true, my: 8.35,
              mask: [[-2.23, -2.19, 1.048], [-2.2, -2.13, 0.96], [-2.14, -2.1, 0.873],
                [-2.11, -2.08, 0.786], [-2.09, -2.01, 0.873], [-2.02, -1.92, 0.786],
                [-1.93, -1.89, 0.699], [-1.9, -1.61, 0.786], [-1.62, -1.56, 0.699],
                [-1.57, -1.49, 0.018], [-1.5, -1.47, 0.07], [-1.48, -1.45, 0.088],
                [-1.46, -1.42, 0.105], [-1.43, -1.4, 0.14], [-1.41, -1.38, 0.262],
                [-1.39, -1.37, 0.35], [-1.38, -1.31, 0.437], [-1.32, -1.23, 0.524],
                [-1.24, -1.16, 0.611], [-1.17, -0.58, 0.699], [-0.59, -0.49, 0.611],
                [-0.5, -0.44, 0.524], [-0.45, -0.34, 0.35], [-0.35, -0.3, 0.262],
                [-0.31, -0.28, 0.21], [-0.29, -0.27, 0.123], [-0.28, -0.21, 0.105],
                [-0.22, -0.16, 0.088], [-0.17, -0.11, 0.053], [-0.12, -0.04, 0.018],
                [-0.05, 0.1, 0], [0.09, 0.15, -0.017], [0.14, 0.22, -0.026], [0.23, 0.47, -0.026],
                [1.17, 1.24, -0.026], [1.26, 1.38, -0.026], [2.46, 2.61, -0.026], [2.6, 2.72, 0],
                [2.71, 3.07, 0.21], [3.06, -3.11, 0.262], [-3.12, -3.08, 0.437],
                [-3.09, -2.95, 0.524], [-2.96, -2.88, 0.611], [-2.89, -2.87, 0.699],
                [-2.88, -2.81, 0.786], [-2.82, -2.78, 0.873]] },
            { x: -13.16, z: 9.48, angle: -1.1, arc: 2.79, rest: -1.5708, guns: 3, pod: true, my: 9.1,
              mask: [[2.38, 2.4, 1.048], [2.39, 2.47, 1.222], [2.46, 2.51, 0.873],
                [2.5, 2.88, 0.786], [2.87, 2.95, 0.699], [2.94, 2.96, 0.35], [2.95, 3, 0.262],
                [2.99, -2.88, 0.35], [-2.89, -2.59, -0.026], [-1.93, -1.75, -0.026],
                [-0.12, -0.02, -0.026], [-0.03, 0.05, -0.017], [0.04, 0.14, 0.018],
                [0.13, 0.17, 0.035], [0.16, 0.24, 0.053], [0.23, 0.26, 0.07], [0.25, 0.28, 0.105],
                [0.27, 0.29, 0.14], [0.28, 0.31, 0.175], [0.3, 0.38, 0.262], [0.37, 0.9, 0.35],
                [0.89, 1.11, 0.524], [1.1, 1.22, 0.699], [1.21, 1.24, 0.35], [1.23, 1.43, 0.786],
                [1.42, 1.46, 0.699], [1.45, 1.6, 0.786], [1.59, 1.64, 0.96], [1.63, 1.71, 1.048]] },
            { x: 13.16, z: 9.48, angle: 1.1, arc: 2.79, rest: 1.5708, guns: 3, pod: true, my: 9.1,
              mask: [[-1.71, -1.63, 1.048], [-1.64, -1.59, 0.96], [-1.6, -1.45, 0.786],
                [-1.46, -1.42, 0.699], [-1.43, -1.23, 0.786], [-1.24, -1.21, 0.35],
                [-1.22, -1.1, 0.699], [-1.11, -0.89, 0.524], [-0.9, -0.37, 0.35],
                [-0.38, -0.3, 0.262], [-0.31, -0.28, 0.175], [-0.29, -0.27, 0.14],
                [-0.28, -0.25, 0.105], [-0.26, -0.23, 0.07], [-0.24, -0.16, 0.053],
                [-0.17, -0.13, 0.035], [-0.14, -0.04, 0.018], [-0.05, 0.03, -0.017],
                [0.02, 0.12, -0.026], [1.75, 1.93, -0.026], [2.59, 2.89, -0.026],
                [2.88, -2.99, 0.35], [-3, -2.95, 0.262], [-2.96, -2.94, 0.35],
                [-2.95, -2.87, 0.699], [-2.88, -2.5, 0.786], [-2.51, -2.46, 0.873],
                [-2.47, -2.39, 1.222], [-2.4, -2.38, 1.048]] },
            { x: -18.39, z: -22.4, angle: -1.57, arc: 2.6, rest: -1.5708, guns: 3, my: 8.92, pod: true },
            { x: 18.39, z: -22.4, angle: 1.57, arc: 2.6, rest: 1.5708, guns: 3, my: 8.92, pod: true },
            { x: -12.63, z: -24.59, angle: -1.57, arc: 2.6, rest: -1.5708, guns: 3, my: 11.65, pod: true },
            { x: 12.63, z: -24.59, angle: 1.57, arc: 2.6, rest: 1.5708, guns: 3, my: 11.65, pod: true },
            { x: -14.27, z: -31.2, angle: -1.57, arc: 2.6, rest: -1.5708, guns: 3, my: 11.55, pod: true },
            { x: 14.27, z: -31.2, angle: 1.57, arc: 2.6, rest: 1.5708, guns: 3, my: 11.55, pod: true },
            { x: -9.7, z: -35.28, angle: -1.57, arc: 2.6, rest: -1.5708, guns: 3, my: 11.35, pod: true },
            { x: 9.7, z: -35.28, angle: 1.57, arc: 2.6, rest: 1.5708, guns: 3, my: 11.35, pod: true },
            { x: -12.05, z: -41.17, angle: -2.48, arc: 3.1, rest: -1.5708, guns: 3, pod: true, my: 9.22,
              mask: [[0.68, 0.75, 0.96], [0.74, 0.76, 0.873], [0.75, 0.85, 0.96],
                [0.84, 0.9, 1.048], [0.89, 0.96, 1.222], [0.95, 1.71, 0.96], [1.7, 1.76, 0.873],
                [1.75, 1.78, 0.175], [1.77, 1.92, 0.786], [1.91, 1.97, 0.699], [1.96, 2.04, 0.611],
                [2.03, 2.34, 0.699], [2.33, 2.42, 0.524], [2.41, 2.47, 0.437], [2.46, 2.53, 0.262],
                [2.52, 2.72, 0.35], [2.71, 2.84, 0.262], [2.83, 2.88, 0.175], [2.87, 2.91, 0.14],
                [2.9, 2.93, 0.088], [2.92, 2.96, 0.053], [2.95, 2.98, 0.123], [2.97, 3.03, 0.175],
                [3.02, 3.1, 0.035], [3.09, -3.02, 0.053], [-3.03, -2.6, 0.035],
                [-2.61, -2.41, 0.018], [-2.37, -2.34, 0], [-2.35, -2.17, 0.035],
                [-2.18, -1.8, 0.053], [-1.81, -1.7, 0.035], [-1.71, -1.68, 0.018],
                [-1.69, -1.66, 0], [-1.67, -1.61, -0.017], [-1.62, -1.43, 0], [-1.17, -1.02, 0],
                [-0.57, -0.42, 0.018], [-0.43, -0.27, 0.35], [-0.28, -0.11, 0.437],
                [-0.12, 0.05, 0.35], [0.04, 0.15, 0.437], [0.14, 0.26, 0.699], [0.25, 0.33, 0.786],
                [0.32, 0.4, 0.699], [0.39, 0.64, 0.786]] },
            { x: 12.05, z: -41.17, angle: 2.22, arc: 3.1, rest: 1.5708, guns: 3, pod: true, my: 9.22,
              mask: [[-0.9, -0.84, 1.048], [-0.85, -0.75, 0.96], [-0.76, -0.74, 0.873],
                [-0.75, -0.68, 0.96], [-0.69, -0.63, 1.222], [-0.64, -0.39, 0.786],
                [-0.4, -0.32, 0.699], [-0.33, -0.25, 0.786], [-0.26, -0.14, 0.699],
                [-0.15, -0.04, 0.437], [-0.05, 0.12, 0.35], [0.11, 0.28, 0.437], [0.27, 0.43, 0.35],
                [0.42, 0.57, 0.018], [1.02, 1.17, 0], [1.43, 1.62, 0], [1.61, 1.67, -0.017],
                [1.66, 1.69, 0], [1.68, 1.71, 0.018], [1.7, 1.81, 0.035], [1.8, 2.18, 0.053],
                [2.17, 2.35, 0.035], [2.34, 2.37, 0], [2.41, 2.61, 0.018], [2.6, 3.03, 0.035],
                [3.02, -3.09, 0.053], [-3.1, -3.02, 0.035], [-3.03, -2.97, 0.175],
                [-2.98, -2.95, 0.123], [-2.96, -2.92, 0.053], [-2.93, -2.9, 0.088],
                [-2.91, -2.87, 0.14], [-2.88, -2.83, 0.175], [-2.84, -2.71, 0.262],
                [-2.72, -2.52, 0.35], [-2.53, -2.46, 0.262], [-2.47, -2.41, 0.437],
                [-2.42, -2.33, 0.524], [-2.34, -2.03, 0.699], [-2.04, -1.96, 0.611],
                [-1.97, -1.91, 0.699], [-1.92, -1.77, 0.786], [-1.78, -1.75, 0.175],
                [-1.76, -1.7, 0.873], [-1.71, -0.95, 0.96]] },
            { x: -18.81, z: -44.35, angle: -2.06, arc: 2.96, rest: -1.5708, guns: 3, pod: true, my: 9.22,
              mask: [[1.24, 1.51, 0.611], [1.5, 1.53, 0.524], [1.52, 1.69, 0.437],
                [1.68, 1.88, 0.524], [1.87, 1.93, 0.437], [1.92, 2.06, 0.175], [2.05, 2.07, 0.21],
                [2.06, 2.2, 0.262], [2.19, 2.34, 0.35], [2.33, 2.49, 0.262], [2.48, 2.54, 0.175],
                [2.53, 2.58, 0.14], [2.57, 2.61, 0.123], [2.6, 2.63, 0.105], [2.62, 2.65, 0.088],
                [2.64, 2.67, 0.07], [2.66, 2.7, 0.018], [2.69, 2.79, 0.035], [2.78, 2.88, 0.053],
                [2.87, 2.93, 0.175], [2.92, 2.95, 0.14], [2.94, 3.09, 0.053], [3.08, 3.14, 0.018],
                [3.13, -3.13, 0], [-3.14, -3.09, -0.026], [-0.07, -0.04, 0], [-0.05, -0.02, 0.018],
                [-0.03, 0.14, 0.088], [0.13, 0.15, 0.123], [0.14, 0.19, 0.175], [0.18, 0.24, 0.21],
                [0.23, 0.28, 0.35], [0.27, 0.45, 0.699], [0.44, 0.55, 0.611], [0.54, 0.75, 0.699],
                [0.74, 0.92, 0.524]] },
            { x: 18.81, z: -44.35, angle: 2.06, arc: 2.96, rest: 1.5708, guns: 3, pod: true, my: 9.22,
              mask: [[-0.92, -0.74, 0.524], [-0.75, -0.54, 0.699], [-0.55, -0.44, 0.611],
                [-0.45, -0.27, 0.699], [-0.28, -0.23, 0.35], [-0.24, -0.18, 0.21],
                [-0.19, -0.14, 0.175], [-0.15, -0.13, 0.123], [-0.14, 0.03, 0.088],
                [0.02, 0.05, 0.018], [0.04, 0.07, 0], [3.09, 3.14, -0.026], [3.13, -3.13, 0],
                [-3.14, -3.08, 0.018], [-3.09, -2.94, 0.053], [-2.95, -2.92, 0.14],
                [-2.93, -2.87, 0.175], [-2.88, -2.78, 0.053], [-2.79, -2.69, 0.035],
                [-2.7, -2.66, 0.018], [-2.67, -2.64, 0.07], [-2.65, -2.62, 0.088],
                [-2.63, -2.6, 0.105], [-2.61, -2.57, 0.123], [-2.58, -2.53, 0.14],
                [-2.54, -2.48, 0.175], [-2.49, -2.33, 0.262], [-2.34, -2.19, 0.35],
                [-2.2, -2.06, 0.262], [-2.07, -2.05, 0.21], [-2.06, -1.92, 0.175],
                [-1.93, -1.87, 0.437], [-1.88, -1.68, 0.524], [-1.69, -1.52, 0.437],
                [-1.53, -1.5, 0.524], [-1.51, -1.24, 0.611]] },
            { x: -12.67, z: -49.56, angle: -2.56, arc: 3.09, rest: -1.5708, guns: 3, pod: true, my: 9.22,
              mask: [[0.61, 0.66, 0.699], [0.65, 1.03, 0.786], [1.02, 1.06, 0.699],
                [1.05, 1.25, 0.611], [1.24, 1.57, 0.786], [1.56, 1.6, 0.699], [1.59, 1.81, 0.611],
                [1.8, 1.85, 0.262], [1.84, 1.97, 0.35], [1.96, 2.56, 0.437], [2.55, 2.61, 0.35],
                [2.6, 2.67, 0.262], [2.66, 2.7, 0.21], [2.69, 2.75, 0.175], [2.74, 2.77, 0.14],
                [2.76, 2.79, 0.123], [2.78, 2.81, 0.088], [2.8, 2.82, 0.07], [2.81, 2.91, 0.018],
                [2.9, 2.93, 0], [2.92, 2.95, 0.088], [2.94, 3, 0.175], [2.99, 3.02, 0.123],
                [3.01, 3.07, -0.017], [3.06, -3.02, 0.018], [-3.03, -2.97, 0],
                [-2.98, -2.85, -0.017], [-2.86, -2.78, -0.026], [-2.79, -2.76, 0.018],
                [-2.77, -2.74, 0.035], [-2.75, -2.71, 0.053], [-2.72, -2.5, 0.07],
                [-2.51, -2.31, 0.053], [-2.32, -1.89, 0.07], [-1.9, -1.82, 0.053],
                [-1.83, -1.26, 0.035], [-1.27, -1.21, 0.018], [-1.22, -1.17, -0.017],
                [-1.18, -1.16, 0], [-1.17, -1.05, 0.035], [-1.06, -0.93, 0.053],
                [-0.94, -0.61, 0.035], [-0.62, -0.54, 0.018], [-0.55, -0.49, 0],
                [-0.33, -0.21, 0.018], [-0.22, -0.2, 0.105], [-0.21, 0.1, 0.175],
                [0.09, 0.12, 0.21], [0.11, 0.14, 0.35], [0.13, 0.22, 0.611], [0.21, 0.29, 0.699],
                [0.28, 0.35, 0.611], [0.34, 0.45, 0.699], [0.44, 0.54, 0.786], [0.53, 0.55, 0.699]] },
            { x: 12.67, z: -49.56, angle: 2.56, arc: 3.09, rest: 1.5708, guns: 3, pod: true, my: 9.22,
              mask: [[-0.55, -0.53, 0.699], [-0.54, -0.44, 0.786], [-0.45, -0.34, 0.699],
                [-0.35, -0.28, 0.611], [-0.29, -0.21, 0.699], [-0.22, -0.13, 0.611],
                [-0.14, -0.11, 0.35], [-0.12, -0.09, 0.21], [-0.1, 0.21, 0.175], [0.2, 0.22, 0.105],
                [0.21, 0.33, 0.018], [0.49, 0.55, 0], [0.54, 0.62, 0.018], [0.61, 0.94, 0.035],
                [0.93, 1.06, 0.053], [1.05, 1.17, 0.035], [1.16, 1.18, 0], [1.17, 1.22, -0.017],
                [1.21, 1.27, 0.018], [1.26, 1.83, 0.035], [1.82, 1.9, 0.053], [1.89, 2.32, 0.07],
                [2.31, 2.51, 0.053], [2.5, 2.72, 0.07], [2.71, 2.75, 0.053], [2.74, 2.77, 0.035],
                [2.76, 2.79, 0.018], [2.78, 2.86, -0.026], [2.85, 2.98, -0.017], [2.97, 3.03, 0],
                [3.02, -3.06, 0.018], [-3.07, -3.01, -0.017], [-3.02, -2.99, 0.123],
                [-3, -2.94, 0.175], [-2.95, -2.92, 0.088], [-2.93, -2.9, 0], [-2.91, -2.81, 0.018],
                [-2.82, -2.8, 0.07], [-2.81, -2.78, 0.088], [-2.79, -2.76, 0.123],
                [-2.77, -2.74, 0.14], [-2.75, -2.69, 0.175], [-2.7, -2.66, 0.21],
                [-2.67, -2.6, 0.262], [-2.61, -2.55, 0.35], [-2.56, -1.96, 0.437],
                [-1.97, -1.84, 0.35], [-1.85, -1.8, 0.262], [-1.81, -1.59, 0.611],
                [-1.6, -1.56, 0.699], [-1.57, -1.24, 0.786], [-1.25, -1.05, 0.611],
                [-1.06, -1.02, 0.699], [-1.03, -0.65, 0.786], [-0.66, -0.61, 0.699]] },
            { x: -13.16, z: -62.09, angle: -1.77, arc: 2.85, rest: -1.5708, guns: 3, my: 9.19,
              mask: [[1.64, 1.88, 0.524], [1.87, 2.14, 0.437], [2.13, 2.27, 0.35],
                [2.26, 2.34, 0.262], [2.33, 2.35, 0.21], [2.34, 2.37, 0.07], [2.36, 2.63, 0.053],
                [2.62, 2.68, 0.035], [2.67, 2.74, 0.053], [2.73, 2.84, 0.035], [2.83, 2.89, 0.088],
                [2.88, 2.91, 0.21], [2.9, 2.96, 0.262], [2.95, 2.98, 0.14], [2.97, 3.02, -0.017],
                [3.01, 3.03, 0], [3.02, 3.05, 0.018], [3.04, -3.01, 0.035], [-3.02, -2.95, 0.018],
                [-2.96, -2.9, 0], [-2.91, -2.85, -0.026], [-2.86, -2.74, -0.017], [-2.75, -2.39, 0],
                [-2.37, -2.31, 0], [-1.72, -1.45, 0], [-1.46, -1.31, 0.018], [-0.87, -0.84, 0.018],
                [-0.85, -0.6, 0.175], [-0.61, -0.54, 0.14], [-0.55, -0.47, 0.123],
                [-0.48, -0.42, 0.105], [-0.43, -0.32, 0.088], [-0.33, -0.28, 0.07],
                [-0.29, -0.16, 0.053], [-0.17, -0.13, 0.035], [-0.14, -0.11, 0.088],
                [-0.12, -0.09, 0.105], [-0.1, 0, 0.123], [-0.01, 0.08, 0.14], [0.07, 0.1, 0.175],
                [0.09, 0.12, 0.35], [0.11, 0.14, 0.437], [0.13, 0.69, 0.524], [0.68, 1.01, 0.437],
                [1, 1.1, 0.524]] },
            { x: 13.16, z: -62.09, angle: 1.77, arc: 2.85, rest: 1.5708, guns: 3, my: 9.17,
              mask: [[-1.1, -1, 0.524], [-1.01, -0.68, 0.437], [-0.69, -0.13, 0.524],
                [-0.14, -0.11, 0.437], [-0.12, -0.09, 0.35], [-0.1, -0.07, 0.175],
                [-0.08, 0.01, 0.14], [0, 0.1, 0.123], [0.09, 0.12, 0.105], [0.11, 0.14, 0.088],
                [0.13, 0.17, 0.035], [0.16, 0.29, 0.053], [0.28, 0.33, 0.07], [0.32, 0.43, 0.088],
                [0.42, 0.48, 0.105], [0.47, 0.55, 0.123], [0.54, 0.61, 0.14], [0.6, 0.85, 0.175],
                [0.84, 0.87, 0.018], [1.31, 1.46, 0.018], [1.45, 1.72, 0], [2.31, 2.37, 0],
                [2.39, 2.75, 0], [2.74, 2.86, -0.017], [2.85, 2.91, -0.026], [2.9, 2.96, 0],
                [2.95, 3.02, 0.018], [3.01, -3.04, 0.035], [-3.05, -3.02, 0.018], [-3.03, -3.01, 0],
                [-3.02, -2.97, -0.017], [-2.98, -2.95, 0.14], [-2.96, -2.9, 0.262],
                [-2.91, -2.88, 0.21], [-2.89, -2.83, 0.088], [-2.84, -2.73, 0.035],
                [-2.74, -2.67, 0.053], [-2.68, -2.62, 0.035], [-2.63, -2.36, 0.053],
                [-2.37, -2.34, 0.07], [-2.35, -2.33, 0.21], [-2.34, -2.26, 0.262],
                [-2.27, -2.13, 0.35], [-2.14, -1.87, 0.437], [-1.88, -1.64, 0.524]] },
            { x: -15, z: -89.6, angle: -0.43, arc: 3.09, rest: -1.5708, guns: 3, my: 9.08,
              lift: [[2.74, -2.85, 0.35], [-2.86, -2.83, 0.262], [2.59, 2.68, 0.35]],
              mask: [[2.74, -2.87, 0.35], [-2.88, -2.71, 0.262], [-2.72, -2.67, 0.21],
                [-2.68, -2.57, 0.175], [-2.58, -2.55, 0.14], [-2.56, -2.53, 0.105],
                [-2.54, -2.52, 0.088], [-2.53, -2.5, 0.07], [-2.51, -2.48, 0.035],
                [-0.92, -0.6, -0.017], [-0.57, -0.51, -0.017], [-0.52, -0.49, 0.053],
                [-0.5, -0.47, 0.175], [-0.48, -0.42, 0.21], [-0.43, 0, 0.262], [-0.01, 0.01, 0.07],
                [0, 0.05, 0.088], [0.04, 0.08, 0.105], [0.07, 0.1, 0.262], [0.09, 0.15, 0.35],
                [0.14, 0.21, 0.437], [0.2, 0.33, 0.35], [0.32, 0.4, 0.262], [0.39, 0.43, 0.21],
                [0.42, 0.66, 0.175], [0.65, 0.73, 0.14], [0.72, 0.78, 0.123], [0.77, 0.87, 0.105],
                [0.86, 0.92, 0.053], [0.91, 1.08, 0.07], [1.07, 1.15, 0.053], [1.14, 1.17, 0.035],
                [1.16, 1.18, 0.018], [1.17, 1.43, -0.017], [1.42, 1.48, 0], [1.47, 1.53, 0.018],
                [1.52, 1.62, 0], [1.61, 1.65, -0.017], [1.64, 1.67, 0.018], [1.66, 2.02, 0.035],
                [2.01, 2.04, -0.017], [2.03, 2.07, 0], [2.06, 2.2, 0.035], [2.19, 2.3, 0.053],
                [2.29, 2.47, 0.035], [2.46, 2.68, 0.35]] },
            { x: 15, z: -89.6, angle: 0.43, arc: 3.09, rest: 1.5708, guns: 3, my: 9.11,
              lift: [[-2.68, -2.59, 0.35], [2.83, 2.86, 0.262], [2.85, -2.74, 0.35]],
              mask: [[-2.68, -2.46, 0.35], [-2.47, -2.29, 0.035], [-2.3, -2.19, 0.053],
                [-2.2, -2.06, 0.035], [-2.07, -2.03, 0], [-2.04, -2.01, -0.017],
                [-2.02, -1.66, 0.035], [-1.67, -1.64, 0.018], [-1.65, -1.61, -0.017],
                [-1.62, -1.52, 0], [-1.53, -1.47, 0.018], [-1.48, -1.42, 0], [-1.43, -1.17, -0.017],
                [-1.18, -1.16, 0.018], [-1.17, -1.14, 0.035], [-1.15, -1.07, 0.053],
                [-1.08, -0.91, 0.07], [-0.92, -0.86, 0.053], [-0.87, -0.77, 0.105],
                [-0.78, -0.72, 0.123], [-0.73, -0.65, 0.14], [-0.66, -0.42, 0.175],
                [-0.43, -0.39, 0.21], [-0.4, -0.32, 0.262], [-0.33, -0.2, 0.35],
                [-0.21, -0.14, 0.437], [-0.15, -0.09, 0.35], [-0.1, -0.07, 0.262],
                [-0.08, -0.04, 0.105], [-0.05, 0, 0.088], [-0.01, 0.01, 0.07], [0, 0.43, 0.262],
                [0.42, 0.48, 0.21], [0.47, 0.5, 0.175], [0.49, 0.52, 0.053], [0.51, 0.57, -0.017],
                [0.6, 0.92, -0.017], [2.48, 2.51, 0.035], [2.5, 2.53, 0.07], [2.52, 2.54, 0.088],
                [2.53, 2.56, 0.105], [2.55, 2.58, 0.14], [2.57, 2.68, 0.175], [2.67, 2.72, 0.21],
                [2.71, 2.88, 0.262], [2.87, -2.74, 0.35]] },
            { x: -16.45, z: -95.26, angle: -0.54, arc: 3.08, rest: -1.5708, guns: 3, pod: true, my: 9.1,
              mask: [[2.64, 2.68, 0.14], [2.67, 2.96, 0.053], [2.95, 2.98, 0.035], [2.97, 3, 0],
                [2.99, 3.02, -0.017], [3.01, 3.03, -0.026], [-0.17, -0.09, -0.026],
                [-0.1, -0.04, 0.018], [-0.05, 0, 0.035], [-0.01, 0.03, 0.053], [0.02, 0.05, 0.07],
                [0.04, 0.08, 0.088], [0.07, 0.1, 0.105], [0.09, 0.15, 0.35], [0.14, 0.24, 0.437],
                [0.23, 0.29, 0.35], [0.28, 0.31, 0.262], [0.3, 0.35, 0.21], [0.34, 0.38, 0.175],
                [0.37, 0.59, 0.14], [0.58, 0.61, 0.123], [0.6, 0.66, 0.105], [0.65, 0.69, 0.088],
                [0.68, 0.76, 0.07], [0.75, 0.94, 0.035], [0.93, 0.96, 0.018], [0.95, 1.03, 0],
                [1.02, 1.1, -0.017], [1.09, 1.27, -0.026], [1.26, 1.44, 0], [1.43, 1.48, -0.026],
                [1.47, 1.83, 0.018], [1.82, 1.92, -0.017], [1.91, 1.97, 0.018],
                [1.96, 1.99, -0.017], [1.98, 2.06, 0.018], [2.05, 2.13, 0.035],
                [2.12, 2.18, -0.026], [2.2, 2.27, 0.018], [2.26, 2.28, 0.035], [2.27, 2.44, 0.175],
                [2.43, 2.46, 0.14], [2.45, 2.47, 0.123], [2.46, 2.51, 0.105], [2.5, 2.53, 0.14],
                [2.52, 2.56, 0.262]] },
            { x: 16.45, z: -95.26, angle: 0.54, arc: 3.08, rest: 1.5708, guns: 3, pod: true, my: 9.1,
              mask: [[-2.56, -2.52, 0.262], [-2.53, -2.5, 0.14], [-2.51, -2.46, 0.105],
                [-2.47, -2.45, 0.123], [-2.46, -2.43, 0.14], [-2.44, -2.27, 0.175],
                [-2.28, -2.26, 0.035], [-2.27, -2.2, 0.018], [-2.18, -2.12, -0.026],
                [-2.13, -2.05, 0.035], [-2.06, -1.98, 0.018], [-1.99, -1.96, -0.017],
                [-1.97, -1.91, 0.018], [-1.92, -1.82, -0.017], [-1.83, -1.47, 0.018],
                [-1.48, -1.43, -0.026], [-1.44, -1.26, 0], [-1.27, -1.09, -0.026],
                [-1.1, -1.02, -0.017], [-1.03, -0.95, 0], [-0.96, -0.93, 0.018],
                [-0.94, -0.75, 0.035], [-0.76, -0.68, 0.07], [-0.69, -0.65, 0.088],
                [-0.66, -0.6, 0.105], [-0.61, -0.58, 0.123], [-0.59, -0.37, 0.14],
                [-0.38, -0.34, 0.175], [-0.35, -0.3, 0.21], [-0.31, -0.28, 0.262],
                [-0.29, -0.23, 0.35], [-0.24, -0.14, 0.437], [-0.15, -0.09, 0.35],
                [-0.1, -0.07, 0.105], [-0.08, -0.04, 0.088], [-0.05, -0.02, 0.07],
                [-0.03, 0.01, 0.053], [0, 0.05, 0.035], [0.04, 0.1, 0.018], [0.09, 0.17, -0.026],
                [-3.03, -3.01, -0.026], [-3.02, -2.99, -0.017], [-3, -2.97, 0],
                [-2.98, -2.95, 0.035], [-2.96, -2.67, 0.053], [-2.68, -2.64, 0.14]] },
            { x: -14.25, z: -100.09, angle: -0.56, arc: 3.07, rest: -1.5708, guns: 3, pod: true, my: 9.1,
              mask: [[2.64, 3.05, 0.088], [-0.89, -0.82, 0], [-0.83, -0.81, 0.018],
                [-0.82, -0.65, 0.053], [-0.66, -0.61, 0.07], [-0.62, -0.51, 0.088],
                [-0.52, -0.46, 0.07], [-0.47, -0.41, 0.088], [-0.42, -0.35, 0.07],
                [-0.36, -0.3, 0.088], [-0.31, 0, 0.053], [-0.01, 0.03, 0.07], [0.02, 0.07, 0.088],
                [0.06, 0.08, 0.105], [0.07, 0.1, 0.262], [0.09, 0.24, 0.35], [0.23, 0.28, 0.21],
                [0.27, 0.33, 0.175], [0.32, 0.36, 0.14], [0.35, 0.48, 0.123], [0.47, 0.52, 0.105],
                [0.51, 0.55, 0.088], [0.54, 0.61, 0.07], [0.6, 0.66, 0.035], [0.65, 0.75, 0.018],
                [0.74, 0.85, 0], [0.84, 0.96, -0.017], [0.95, 1.01, 0], [1, 1.11, -0.026],
                [1.1, 1.29, 0], [1.28, 1.32, -0.026], [1.31, 1.67, 0.018], [1.66, 1.78, -0.017],
                [1.77, 1.79, -0.026], [1.78, 1.85, 0.018], [1.84, 1.88, -0.017],
                [1.87, 1.95, -0.026], [1.94, 2, 0.035], [2.24, 2.27, 0.035], [2.26, 2.35, 0.262],
                [2.34, 2.37, 0.21], [2.36, 2.4, 0.175], [2.45, 2.47, 0.053], [2.46, 2.49, 0.175],
                [2.48, 2.53, 0.262]] },
            { x: 14.25, z: -100.09, angle: 0.56, arc: 3.07, rest: 1.5708, guns: 3, pod: true, my: 9.1,
              mask: [[-2.53, -2.48, 0.262], [-2.49, -2.46, 0.175], [-2.47, -2.45, 0.053],
                [-2.4, -2.36, 0.175], [-2.37, -2.34, 0.21], [-2.35, -2.26, 0.262],
                [-2.27, -2.24, 0.035], [-2, -1.94, 0.035], [-1.95, -1.87, -0.026],
                [-1.88, -1.84, -0.017], [-1.85, -1.78, 0.018], [-1.79, -1.77, -0.026],
                [-1.78, -1.66, -0.017], [-1.67, -1.31, 0.018], [-1.32, -1.28, -0.026],
                [-1.29, -1.1, 0], [-1.11, -1, -0.026], [-1.01, -0.95, 0], [-0.96, -0.84, -0.017],
                [-0.85, -0.74, 0], [-0.75, -0.65, 0.018], [-0.66, -0.6, 0.035],
                [-0.61, -0.54, 0.07], [-0.55, -0.51, 0.088], [-0.52, -0.47, 0.105],
                [-0.48, -0.35, 0.123], [-0.36, -0.32, 0.14], [-0.33, -0.27, 0.175],
                [-0.28, -0.23, 0.21], [-0.24, -0.09, 0.35], [-0.1, -0.07, 0.262],
                [-0.08, -0.06, 0.105], [-0.07, -0.02, 0.088], [-0.03, 0.01, 0.07], [0, 0.31, 0.053],
                [0.3, 0.36, 0.088], [0.35, 0.42, 0.07], [0.41, 0.47, 0.088], [0.46, 0.52, 0.07],
                [0.51, 0.62, 0.088], [0.61, 0.66, 0.07], [0.65, 0.82, 0.053], [0.81, 0.83, 0.018],
                [0.82, 0.89, 0], [-3.05, -2.64, 0.088]] },
            { x: -8, z: 65.3, angle: -2.33, arc: 2.87, rest: -1.5708, guns: 3, my: 7.91,
              lift: [[1.12, 1.24, -0.026]],
              mask: [[1.07, 1.17, 0.35], [1.16, 1.2, 0.262], [1.19, 1.22, 0.21],
                [1.21, 1.25, 0.175], [1.24, 1.44, 0.14], [1.43, 1.48, 0.088], [1.47, 1.57, 0.07],
                [1.56, 1.69, 0], [1.68, 1.76, -0.017], [1.75, 1.83, 0], [1.82, 1.92, 0.018],
                [1.91, 1.93, 0], [1.92, 1.99, 0.175], [1.98, 2, 0.21], [1.99, 2.16, 0.262],
                [2.15, 2.67, 0.35], [2.66, 2.82, 0.437], [2.81, 2.91, 0.35], [2.9, 2.93, 0.437],
                [2.92, 3.1, 0.524], [3.09, -3.09, 0.175], [-3.1, -3.08, 0.14],
                [-3.09, -3.06, 0.123], [-3.07, -3.04, 0.088], [-3.05, -2.97, 0.07],
                [-2.98, -2.9, 0.035], [-2.91, -2.73, 0.018], [-2.74, -2.64, 0],
                [-2.65, -2.59, 0.018], [-2.6, -2.53, 0], [-2.54, -2.45, -0.017], [-2.46, -2.41, 0],
                [-2.42, -2.39, 0.018], [-2.4, -2.34, 0.035], [-2.35, -2.31, 0.018],
                [-2.32, -2.29, 0], [-2.3, -2.17, -0.026], [-1.88, -1.84, -0.026],
                [-1.85, -1.82, -0.017], [-1.83, -1.56, 0], [-1.57, -1.52, -0.017],
                [-1.53, -1.47, -0.026], [-1.43, -1.4, -0.017], [-1.41, -1.19, 0],
                [-1.2, -1.14, 0.018], [-1.15, -1.1, 0], [-1.11, -1.09, -0.017],
                [-0.92, -0.72, -0.026], [-0.73, -0.7, -0.017], [-0.71, -0.53, 0.035],
                [-0.54, -0.51, 0], [-0.52, -0.3, -0.017], [-0.31, -0.27, 0], [-0.28, -0.14, 0.018],
                [-0.15, -0.13, 0], [-0.14, -0.07, 0.018], [-0.08, -0.04, 0], [-0.05, 0.01, 0.018],
                [0, 0.07, 0.035], [0.06, 0.12, 0.053], [0.11, 0.14, 0.035], [0.13, 0.19, 0.053],
                [0.18, 0.31, 0.035], [0.3, 0.5, 0.018], [0.49, 0.52, 0.123], [0.51, 0.55, 0.262]] },
            { x: 8, z: 65.3, angle: 2.33, arc: 2.87, rest: 1.5708, guns: 3, my: 7.91,
              lift: [[-1.24, -1.12, -0.026]],
              mask: [[-0.55, -0.51, 0.262], [-0.52, -0.49, 0.123], [-0.5, -0.3, 0.018],
                [-0.31, -0.18, 0.035], [-0.19, -0.13, 0.053], [-0.14, -0.11, 0.035],
                [-0.12, -0.06, 0.053], [-0.07, 0, 0.035], [-0.01, 0.05, 0.018], [0.04, 0.08, 0],
                [0.07, 0.14, 0.018], [0.13, 0.15, 0], [0.14, 0.28, 0.018], [0.27, 0.31, 0],
                [0.3, 0.52, -0.017], [0.51, 0.54, 0], [0.53, 0.71, 0.035], [0.7, 0.73, -0.017],
                [0.72, 0.92, -0.026], [1.09, 1.11, -0.017], [1.1, 1.15, 0], [1.14, 1.2, 0.018],
                [1.19, 1.41, 0], [1.4, 1.43, -0.017], [1.47, 1.53, -0.026], [1.52, 1.57, -0.017],
                [1.56, 1.83, 0], [1.82, 1.85, -0.017], [1.84, 1.88, -0.026], [2.17, 2.3, -0.026],
                [2.29, 2.32, 0], [2.31, 2.35, 0.018], [2.34, 2.4, 0.035], [2.39, 2.42, 0.018],
                [2.41, 2.46, 0], [2.45, 2.54, -0.017], [2.53, 2.6, 0], [2.59, 2.65, 0.018],
                [2.64, 2.74, 0], [2.73, 2.91, 0.018], [2.9, 2.98, 0.035], [2.97, 3.05, 0.07],
                [3.04, 3.07, 0.088], [3.06, 3.09, 0.123], [3.08, 3.1, 0.14], [3.09, -3.09, 0.175],
                [-3.1, -2.92, 0.524], [-2.93, -2.9, 0.437], [-2.91, -2.81, 0.35],
                [-2.82, -2.66, 0.437], [-2.67, -2.15, 0.35], [-2.16, -1.99, 0.262],
                [-2, -1.98, 0.21], [-1.99, -1.92, 0.175], [-1.93, -1.91, 0], [-1.92, -1.82, 0.018],
                [-1.83, -1.75, 0], [-1.76, -1.68, -0.017], [-1.69, -1.56, 0], [-1.57, -1.47, 0.07],
                [-1.48, -1.43, 0.088], [-1.44, -1.24, 0.14], [-1.25, -1.21, 0.175],
                [-1.22, -1.19, 0.21], [-1.2, -1.16, 0.262], [-1.17, -1.07, 0.35]] },
            { x: -8.1, z: 42.3, angle: -2.54, arc: 2.76, rest: -1.5708, guns: 3, my: 7.62,
              mask: [[0.96, 1.06, 1.048], [1.05, 1.11, 0.96], [1.1, 1.32, 0.873],
                [1.31, 1.48, 0.786], [1.47, 1.5, 0.699], [1.49, 1.53, 0.611], [1.52, 1.57, 0.524],
                [1.56, 1.6, 0.437], [1.59, 1.62, 0.35], [1.61, 1.64, 0.262], [1.63, 1.65, 0.123],
                [1.64, 1.67, 0.053], [1.66, 1.69, 0.018], [1.68, 1.74, 0.035], [1.73, 1.79, 0.053],
                [1.78, 1.83, 0.018], [1.82, 1.85, 0], [1.84, 1.92, 0.018], [1.91, 1.95, 0.524],
                [1.94, 2.09, 0.611], [2.08, 2.11, 0.699], [2.1, 2.58, 0.786], [2.57, 2.88, 0.699],
                [2.87, 3.07, 0.786], [3.06, 3.1, 0.699], [3.09, 3.14, 0.437], [3.13, -3.09, 0.35],
                [-3.1, -3.06, 0.262], [-3.07, -3.04, 0.21], [-3.05, -2.88, 0.123],
                [-2.89, -2.81, 0.035], [-2.82, -2.67, 0.053], [-2.68, -2.43, 0.035],
                [-2.44, -2.38, 0.07], [-2.39, -2.22, 0.14], [-2.23, -2.1, 0.123],
                [-2.11, -2.08, 0.088], [-2.09, -2.06, 0.053], [-2.07, -1.75, 0.035],
                [-1.76, -1.73, -0.017], [-1.48, -1.43, -0.026], [-1.44, -1.26, 0.07],
                [-1.27, -1.23, 0.018], [-1.24, -1.05, 0], [-1.06, -0.68, 0.018],
                [-0.69, -0.54, 0.07], [-0.55, -0.47, 0.018], [-0.48, -0.44, 0],
                [-0.45, -0.42, 0.018], [-0.43, -0.32, 0.035], [-0.33, -0.28, 0],
                [-0.29, 0.01, 0.018], [0, 0.05, 0.035], [0.04, 0.12, 0.07], [0.11, 0.14, 0.123],
                [0.13, 0.15, 0.175], [0.14, 0.17, 0.21], [0.16, 0.21, 0.262], [0.2, 0.24, 0.35]] },
            { x: 8.1, z: 42.3, angle: 2.54, arc: 2.76, rest: 1.5708, guns: 3, my: 7.61,
              mask: [[-0.24, -0.2, 0.35], [-0.21, -0.16, 0.262], [-0.17, -0.14, 0.21],
                [-0.15, -0.13, 0.175], [-0.14, -0.11, 0.123], [-0.12, -0.04, 0.07],
                [-0.05, 0, 0.035], [-0.01, 0.29, 0.018], [0.28, 0.33, 0], [0.32, 0.43, 0.035],
                [0.42, 0.45, 0.018], [0.44, 0.48, 0], [0.47, 0.55, 0.018], [0.54, 0.69, 0.07],
                [0.68, 1.06, 0.018], [1.05, 1.24, 0], [1.23, 1.27, 0.018], [1.26, 1.44, 0.07],
                [1.43, 1.48, -0.026], [1.73, 1.76, -0.017], [1.75, 2.07, 0.035],
                [2.06, 2.09, 0.053], [2.08, 2.11, 0.088], [2.1, 2.23, 0.123], [2.22, 2.39, 0.14],
                [2.38, 2.44, 0.07], [2.43, 2.68, 0.035], [2.67, 2.82, 0.053], [2.81, 2.89, 0.035],
                [2.88, 3.05, 0.123], [3.04, 3.07, 0.21], [3.06, 3.1, 0.262], [3.09, -3.13, 0.35],
                [-3.14, -3.09, 0.437], [-3.1, -3.06, 0.699], [-3.07, -2.87, 0.786],
                [-2.88, -2.57, 0.699], [-2.58, -2.1, 0.786], [-2.11, -2.08, 0.699],
                [-2.09, -1.94, 0.611], [-1.95, -1.91, 0.524], [-1.92, -1.84, 0.018],
                [-1.85, -1.82, 0], [-1.83, -1.78, 0.018], [-1.79, -1.73, 0.053],
                [-1.74, -1.68, 0.035], [-1.69, -1.66, 0.018], [-1.67, -1.64, 0.053],
                [-1.65, -1.63, 0.123], [-1.64, -1.61, 0.262], [-1.62, -1.59, 0.35],
                [-1.6, -1.56, 0.437], [-1.57, -1.52, 0.524], [-1.53, -1.49, 0.611],
                [-1.5, -1.47, 0.699], [-1.48, -1.31, 0.786], [-1.32, -1.1, 0.873],
                [-1.11, -1.05, 0.96], [-1.06, -0.96, 1.048]] },
          ] },
      ],
    },
    // Seven float planes off the two catapults on her aircraft deck, either
    // side of her crane, which train out over her quarters to shoot.
    planes: {
      squadrons: 2, perSquadron: 2, cruiseSpeed: 56, strikeRange: 9800,
      rearm: 95, hp: 660, dropSpread: 0.06,
      torpDamage: 0, torpSpeed: 0, torpRange: 0, floodChance: 0,
      bombDamage: 950, bombHit: 0.32, bombFire: 0.1, bombPen: 26, bombBore: 0.2,
      type: 'jake',
      catapult: true, deckRun: 8.6, deckCycle: 30,
      // Where the shot leaves her, off the integrated shot from her own
      // girders: trained out over her quarter from turntables right aft.
      runHeight: 27,
      runOut: 152.5, runBearing: 2.03,
      flight: { fighters: 0, dive: 2, torpedo: 0 },
    },
    datasheet: {
      displacement: 65000,
      aircraft: 7,
      mainRounds: 900,
      secondary: { caliber: 155, label: '15.5cm', barrels: 12, rounds: 3600 },
      tertiary: [
        { caliber: 127, label: '12.7cm', barrels: 12, rounds: 6000 },
        { caliber: 25, label: '25mm', barrels: 90, rounds: 270000 },
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
      // Where the sculpt she is drawn from has them (see takao.js): No.1 low
      // on the forecastle, No.2 superfiring over it, No.3 low again at the
      // foot of the bridge and facing aft, and No.4 superfiring over No.5 aft.
      //
      // Arcs and sectors are measured off the model by build/survey-arcs.mjs
      // (see layFloor in sim.js): `lift` where her guns have to be laid up
      // to clear her, `mask` where they cannot fire lower than that without
      // hitting her -- No.1 over her stem, No.2 and No.3 back into her
      // bridge, which is dead to both of them (anywhere they would have to
      // go up past twenty-five degrees to clear it is firing over it, and the
      // blast would take it apart), the after pair past her catapults -- in
      // radians.
      { id: 0, name: 'No.1', x: 0, z: 61.3, angle: 0.01, arc: 2.67, guns: 2, my: 7.7,
        mask: [[-0.47, -0.41, -0.008], [-0.42, -0.35, 0], [-0.36, -0.32, 0.009],
          [-0.33, -0.27, 0.018], [-0.28, -0.23, 0.027], [-0.24, -0.2, 0.035], [-0.21, -0.18, 0.044],
          [-0.19, -0.02, 0.088], [-0.03, 0.03, 0.07], [0.02, 0.19, 0.088], [0.18, 0.21, 0.044],
          [0.2, 0.24, 0.035], [0.23, 0.28, 0.027], [0.27, 0.31, 0.018], [0.3, 0.35, 0.009],
          [0.34, 0.4, 0], [0.39, 0.47, -0.008]] },
      { id: 1, name: 'No.2', x: 0, z: 51.9, angle: 0, arc: 2.94, guns: 2, my: 10.11,
        lift: [[-2.96, -2.88, -0.008], [-2.81, -2.71, -0.008], [-0.43, -0.41, -0.008],
          [-0.42, -0.32, 0], [-0.33, -0.3, -0.008], [-0.26, -0.14, 0]],
        mask: [[-2.96, -2.85, 0.35], [-2.86, -2.83, 0.14], [-2.84, -2.76, 0.088],
          [-2.77, -2.73, -0.008], [-0.42, -0.39, -0.008], [-0.4, -0.34, 0], [-0.35, -0.32, -0.008],
          [-0.24, -0.16, 0], [-0.12, -0.09, -0.008], [-0.1, 0.08, 0], [0.07, 0.1, -0.008],
          [2.76, 2.82, 0.088], [2.81, 2.84, 0.105], [2.83, 2.86, 0.14], [2.85, 2.88, 0.262],
          [2.87, 2.91, 0.35], [2.9, 2.96, 0.437]] },
      { id: 2, name: 'No.3', x: 0, z: 43.1, angle: Math.PI, arc: 2.6, guns: 2, my: 7.8,
        lift: [[2.81, 2.84, -0.008], [2.83, 2.86, 0.035], [2.85, 2.88, 0.07], [2.87, 2.96, 0.088],
          [2.95, 3, 0.035], [2.99, 3.02, 0.044], [3.01, 3.1, 0.088], [3.09, 3.14, 0.07],
          [-3.1, -3.01, 0], [-2.96, -2.87, -0.008], [-2.28, -2.17, -0.008], [-2.16, -2.03, -0.008]],
        mask: [[2.43, 2.54, -0.008], [2.53, 2.61, 0], [2.6, 2.72, 0.35], [2.71, -2.71],
          [-2.72, -2.6, 0.35], [-2.61, -2.59, 0.105], [-2.6, -2.57, 0], [-2.58, -2.39, -0.008],
          [-2.27, -2.19, -0.008], [-2.14, -2.05, -0.008]] },
      { id: 3, name: 'No.4', x: 0, z: -49.05, angle: Math.PI, arc: 2.67, guns: 2, my: 10.17,
        mask: [[0.46, 0.52, 0.088], [0.51, 0.55, -0.008], [-0.54, -0.46, 0.105]] },
      { id: 4, name: 'No.5', x: 0, z: -57.95, angle: 3.13, arc: 2.64, guns: 2, my: 7.58,
        mask: [[0.47, 0.52, 0.105], [0.51, 0.55, -0.008], [0.54, 0.76, 0.07], [2.5, 2.53, -0.008],
          [2.52, 2.63, 0], [2.62, 2.65, -0.008], [2.64, 2.75, 0], [2.74, 2.77, -0.008],
          [2.94, 2.96, -0.008], [2.95, 3.1, 0.009], [-3.1, -2.95, 0.009], [-2.96, -2.94, -0.008],
          [-2.79, -2.74, -0.008], [-2.75, -2.52, 0], [-2.53, -2.5, -0.008], [-0.76, -0.54, 0.07],
          [-0.55, -0.49, -0.008]] },
    ],
    gun: {
      name: '20.3 cm/50 Type 3 No.2', role: 'surface',
      // Five below the horizontal to fifty-five up, which is what her E2
      // turrets were left with after the refit took the seventy-degree
      // anti-aircraft elevation out of them.
      elev: { min: -0.087, max: 0.96 },
      reach: 9.2,
      caliber: 203, reload: 12.0, traverse: 0.21, range: 17600, sigma: 1.55,
      shells: shells(203, 5000, 3250, 255, 840, 0.15),
    },
    // Four quadruple Type 92 mounts, two a side on the upper deck, each
    // training out through its own opening in her side, with the reloads
    // racked behind the forward opening. The Type 93 is oxygen-driven: forty
    // knots, twenty kilometres, and no wake to see it coming. How far each
    // can be trained and fire through its opening is measured off the model.
    torpedoes: {
      mounts: [
        { id: 0, x: -7.2, z: -4.1, angle: -1.57, arc: 0.68, tubes: 4, my: 7.91 },
        { id: 1, x: 7.2, z: -4.1, angle: 1.57, arc: 0.68, tubes: 4, my: 7.91 },
        { id: 2, x: -7.0, z: -17.95, angle: -1.61, arc: 0.45, rest: -Math.PI / 2, tubes: 4, my: 7.94 },
        { id: 3, x: 7.0, z: -17.95, angle: 1.61, arc: 0.45, rest: Math.PI / 2, tubes: 4, my: 7.94 },
      ],
      name: 'Type 93 torpedo', role: 'surface', caliber: 610,
      reach: 5.3,
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
      // In the sculpt's own tubs on her shelter deck, two a side abreast the
      // funnels, each on a pedestal that puts its guns over the rim (see
      // takao.js). Stowed on the beam; arcs and sectors surveyed off the model
      // as her turrets' are -- across her own deck, past her bridge and her
      // funnels, they are anti-aircraft guns only.
      mounts: [
        { x: -6.85, z: 9.8, angle: -1.32, arc: 2.13, rest: -Math.PI / 2, guns: 2, my: 12.24,
          lift: [[2.85, 2.93, -0.017], [2.92, 2.98, -0.008], [2.97, 3.05, 0], [3.04, 3.12, 0.009],
            [3.11, -3.13, 0.018], [-3.14, -3.11, 0.027], [-3.12, -3.08, 0.035],
            [-3.09, -3.04, 0.044], [-3.05, -3.01, 0.053], [-3.02, -2.94, 0.07],
            [-2.95, -2.85, 0.088], [-2.86, -2.76, 0.105], [-2.77, -2.64, 0.123],
            [-2.65, -2.62, 0.088], [-2.63, -2.57, 0.07], [-2.58, -2.5, 0.088],
            [-2.51, -2.39, 0.105], [-0.64, -0.54, 0.053], [-0.55, -0.53, 0.018],
            [-0.54, -0.51, -0.008], [-0.24, -0.21, -0.017], [-0.22, -0.2, -0.008],
            [-0.21, -0.16, 0], [-0.17, -0.14, 0.009], [-0.15, -0.13, 0.018], [-0.14, -0.09, 0.027],
            [-0.1, -0.07, 0.035], [-0.08, 0.01, 0.044], [0, 0.03, 0], [0.11, 0.21, 0.044],
            [0.2, 0.22, 0.018], [0.21, 0.24, -0.008], [0.51, 0.54, -0.017], [0.53, 0.55, -0.008],
            [0.54, 0.59, 0], [0.58, 0.61, 0.009], [0.6, 0.62, 0.018], [0.61, 0.64, 0.027],
            [0.63, 0.66, 0.035], [0.65, 0.75, 0.044]],
          mask: [[2.81, 2.89, 0.611], [2.88, 3.07, 0.524], [3.06, 3.09, 0.14], [3.08, 3.1, 0.105],
            [3.09, -3.11, 0.07], [-3.12, -3.02, 0.088], [-3.03, -2.92, 0.07], [-2.93, -2.83, 0.088],
            [-2.84, -2.74, 0.105], [-2.75, -2.66, 0.123], [-2.67, -2.64, 0.088],
            [-2.65, -2.62, 0.053], [-2.63, -2.55, 0.07], [-2.56, -2.48, 0.088],
            [-2.49, -2.41, 0.105], [-0.62, -0.56, 0.053], [-0.57, -0.54, 0.018],
            [-0.55, -0.53, -0.008], [-0.29, -0.27, 0.044], [-0.28, -0.16, 0.123],
            [-0.17, 0.22, 0.786], [0.21, 0.28, 1.571], [0.27, 0.38, 1.397], [0.37, 0.4, 1.222],
            [0.39, 0.64, 1.397], [0.63, 0.68, 1.222], [0.67, 0.83, 1.397]] },
        { x: 6.85, z: 9.8, angle: 1.32, arc: 2.13, rest: Math.PI / 2, guns: 2, my: 12.24,
          lift: [[-0.75, -0.65, 0.044], [-0.66, -0.63, 0.035], [-0.64, -0.61, 0.027],
            [-0.62, -0.6, 0.018], [-0.61, -0.58, 0.009], [-0.59, -0.54, 0], [-0.55, -0.53, -0.008],
            [-0.54, -0.51, -0.017], [-0.24, -0.21, -0.008], [-0.22, -0.2, 0.018],
            [-0.21, -0.11, 0.044], [-0.03, 0, 0], [-0.01, 0.08, 0.044], [0.07, 0.1, 0.035],
            [0.09, 0.14, 0.027], [0.13, 0.15, 0.018], [0.14, 0.17, 0.009], [0.16, 0.21, 0],
            [0.2, 0.22, -0.008], [0.21, 0.24, -0.017], [0.51, 0.54, -0.008], [0.53, 0.55, 0.018],
            [0.54, 0.64, 0.053], [2.39, 2.51, 0.105], [2.5, 2.58, 0.088], [2.57, 2.63, 0.07],
            [2.62, 2.65, 0.088], [2.64, 2.77, 0.123], [2.76, 2.86, 0.105], [2.85, 2.95, 0.088],
            [2.94, 3.02, 0.07], [3.01, 3.05, 0.053], [3.04, 3.09, 0.044], [3.08, 3.12, 0.035],
            [3.11, 3.14, 0.027], [3.13, -3.11, 0.018], [-3.12, -3.04, 0.009], [-3.05, -2.97, 0],
            [-2.98, -2.92, -0.008], [-2.93, -2.85, -0.017]],
          mask: [[-0.83, -0.67, 1.397], [-0.68, -0.63, 1.222], [-0.64, -0.39, 1.397],
            [-0.4, -0.37, 1.222], [-0.38, -0.27, 1.397], [-0.28, -0.21, 1.571],
            [-0.22, 0.17, 0.786], [0.16, 0.28, 0.123], [0.27, 0.29, 0.044], [0.53, 0.55, -0.008],
            [0.54, 0.57, 0.018], [0.56, 0.62, 0.053], [2.41, 2.49, 0.105], [2.48, 2.56, 0.088],
            [2.55, 2.63, 0.07], [2.62, 2.65, 0.053], [2.64, 2.67, 0.088], [2.66, 2.75, 0.123],
            [2.74, 2.84, 0.105], [2.83, 2.93, 0.088], [2.92, 3.03, 0.07], [3.02, 3.12, 0.088],
            [3.11, -3.09, 0.07], [-3.1, -3.08, 0.105], [-3.09, -3.06, 0.14], [-3.07, -2.88, 0.524],
            [-2.89, -2.81, 0.611]] },
        { x: -7.25, z: -9.8, angle: -1.1, arc: 1.5, rest: -Math.PI / 2, guns: 2, my: 12.25,
          lift: [[-0.66, -0.53, 0.14], [-0.54, -0.46, 0.123], [-0.47, -0.39, 0.105],
            [-0.4, -0.18, 0.14], [-0.19, -0.09, 0.123], [-0.1, -0.04, 0.105], [-0.05, 0, 0.088],
            [-0.01, 0.17, 0.105], [0.16, 0.19, 0.088], [0.18, 0.21, 0.053], [0.2, 0.24, 0.027],
            [0.23, 0.26, 0.07], [0.25, 0.28, 0.088], [0.27, 0.29, 0.105], [0.28, 0.31, 0.123],
            [0.3, 0.33, 0.14], [0.32, 0.42, 0.175]],
          mask: [[-0.64, -0.54, 0.14], [-0.55, -0.47, 0.123], [-0.48, -0.44, 0.105],
            [-0.45, -0.41, 0.088], [-0.42, -0.37, 0.105], [-0.38, -0.2, 0.14],
            [-0.21, -0.11, 0.123], [-0.12, -0.06, 0.105], [-0.07, -0.04, 0.088], [-0.05, 0, 0.21],
            [-0.01, 0.07, 0.262], [0.06, 0.17, 0.699], [0.16, 0.21, 0.611], [0.2, 0.36, 0.699],
            [0.35, 0.42, 0.611]] },
        { x: 7.25, z: -9.8, angle: 1.1, arc: 1.5, rest: Math.PI / 2, guns: 2, my: 12.25,
          lift: [[-0.42, -0.32, 0.175], [-0.33, -0.3, 0.14], [-0.31, -0.28, 0.123],
            [-0.29, -0.27, 0.105], [-0.28, -0.25, 0.088], [-0.26, -0.23, 0.07],
            [-0.24, -0.2, 0.027], [-0.21, -0.18, 0.053], [-0.19, -0.16, 0.088],
            [-0.17, 0.01, 0.105], [0, 0.05, 0.088], [0.04, 0.1, 0.105], [0.09, 0.19, 0.123],
            [0.18, 0.4, 0.14], [0.39, 0.47, 0.105], [0.46, 0.54, 0.123], [0.53, 0.66, 0.14]],
          mask: [[-0.42, -0.35, 0.611], [-0.36, -0.2, 0.699], [-0.21, -0.16, 0.611],
            [-0.17, -0.06, 0.699], [-0.07, 0.01, 0.262], [0, 0.05, 0.21], [0.04, 0.07, 0.088],
            [0.06, 0.12, 0.105], [0.11, 0.21, 0.123], [0.2, 0.38, 0.14], [0.37, 0.42, 0.105],
            [0.41, 0.45, 0.088], [0.44, 0.48, 0.105], [0.47, 0.55, 0.123], [0.54, 0.64, 0.14]] },
      ],
    },
    aa: {
      range: 3400, dps: 62,
      guns: [
        // Ten triples and four twins: in the tubs on her bridge wings, along
        // her shelter deck abreast the funnels, on her aircraft deck, and on
        // her open decks fore and aft of the superstructure. Surveyed like
        // the rest of her battery: the ones out in the open train all the way
        // round, lifting their guns over whatever of her is in the way, and
        // `mask` is where they cannot fire through her lower than that.
        { name: '25 mm Type 96', caliber: 25, role: 'aa', reload: 0.16, range: 3000,
          elev: { min: -0.17, max: 1.40 },
          mounts: [
            { x: -7.25, z: 20.1, angle: -1.58, arc: 1.8, rest: -1.57, guns: 3, my: 12.5,
              lift: [[2.88, 2.95, 0.437], [2.94, 3, 0.35], [2.99, 3.02, 0.262], [3.01, 3.03, 0.175],
                [3.02, 3.07, 0.088], [3.06, 3.09, 0.07], [3.08, -3.11, 0.105],
                [-3.12, -3.09, 0.088], [-3.1, -3.08, 0.105], [-3.09, -2.99, 0.123],
                [-3, -2.94, 0.105], [-2.95, -2.88, 0.088], [-2.89, -2.83, 0.07],
                [-2.84, -2.81, 0.044], [-2.82, -2.8, 0.027], [-2.81, -2.76, 0.009],
                [-2.77, -2.74, -0.008], [-2.75, -2.71, -0.026], [-2.7, -2.66, -0.008],
                [-2.67, -2.57, 0.009], [-2.58, -2.53, -0.008], [-2.54, -2.48, -0.026],
                [-2.49, -2.39, 0.027], [-2.4, -2.38, 0.009], [-2.39, -2.31, -0.008],
                [-2.32, -1.33, 0.009], [-1.34, -0.86, 0.027], [-0.87, -0.72, 0.044],
                [-0.73, -0.63, 0.027], [-0.64, -0.53, 0.044], [-0.54, -0.46, 0.027],
                [-0.47, -0.34, 0.044], [-0.35, -0.21, 0.027], [-0.22, -0.18, -0.008],
                [0.14, 0.17, 0.105], [0.16, 0.19, 0.262], [0.18, 0.24, 0.35]],
              mask: [[2.88, 3.05, 1.397], [3.04, -2.99, 1.222], [-3, -2.92, 0.105],
                [-2.93, -2.83, 0.088], [-2.84, -2.78, 0.07], [-2.79, -2.76, -0.008],
                [-2.77, -2.73, -0.026], [-2.68, -2.64, -0.008], [-2.65, -2.59, 0.009],
                [-2.6, -2.55, -0.008], [-2.56, -2.52, -0.026], [-2.49, -2.46, -0.026],
                [-2.47, -2.41, 0.027], [-2.42, -2.39, 0.009], [-2.4, -2.36, -0.008],
                [-2.37, -2.33, -0.026], [-2.34, -2.29, -0.008], [-2.3, -1.31, 0.009],
                [-1.32, -0.84, 0.027], [-0.85, -0.74, 0.044], [-0.75, -0.61, 0.027],
                [-0.62, -0.54, 0.044], [-0.55, -0.44, 0.027], [-0.45, -0.35, 0.044],
                [-0.36, -0.34, 0.009], [-0.35, -0.23, 0.027], [-0.24, -0.21, 0.009],
                [-0.22, -0.16, 0.027], [-0.17, -0.09, 0.044], [-0.1, -0.02, 0.07],
                [-0.03, 0.03, 0.088], [0.02, 0.05, 0.105], [0.04, 0.07, 0.175], [0.06, 0.08, 0.35],
                [0.07, 0.1, 0.524], [0.09, 0.12, 0.611], [0.11, 0.14, 0.699], [0.13, 0.15, 0.786],
                [0.14, 0.19, 0.96], [0.18, 0.24, 1.048]] },
            { x: 7.25, z: 20.1, angle: 1.58, arc: 1.8, rest: 1.57, guns: 3, my: 12.56,
              lift: [[-0.24, -0.18, 0.35], [-0.19, -0.16, 0.262], [-0.17, -0.14, 0.105],
                [0.18, 0.22, -0.008], [0.21, 0.35, 0.027], [0.34, 0.47, 0.044], [0.46, 0.54, 0.027],
                [0.53, 0.64, 0.044], [0.63, 0.73, 0.027], [0.72, 0.87, 0.044], [0.86, 1.34, 0.027],
                [1.33, 2.32, 0.009], [2.31, 2.39, -0.008], [2.38, 2.4, 0.009], [2.39, 2.49, 0.027],
                [2.48, 2.54, -0.026], [2.53, 2.58, -0.008], [2.57, 2.67, 0.009],
                [2.66, 2.7, -0.008], [2.71, 2.75, -0.026], [2.74, 2.77, -0.008],
                [2.76, 2.81, 0.009], [2.8, 2.82, 0.027], [2.81, 2.84, 0.044], [2.83, 2.89, 0.07],
                [2.88, 2.95, 0.088], [2.94, 3, 0.105], [2.99, 3.09, 0.123], [3.08, 3.1, 0.105],
                [3.09, 3.12, 0.088], [3.11, -3.08, 0.105], [-3.09, -3.06, 0.07],
                [-3.07, -3.02, 0.088], [-3.03, -3.01, 0.175], [-3.02, -2.99, 0.262],
                [-3, -2.94, 0.35], [-2.95, -2.88, 0.437]],
              mask: [[-0.24, -0.18, 1.048], [-0.19, -0.14, 0.96], [-0.15, -0.13, 0.786],
                [-0.14, -0.11, 0.699], [-0.12, -0.09, 0.611], [-0.1, -0.07, 0.524],
                [-0.08, -0.06, 0.35], [-0.07, -0.04, 0.175], [-0.05, -0.02, 0.105],
                [-0.03, 0.03, 0.088], [0.02, 0.1, 0.07], [0.09, 0.17, 0.044], [0.16, 0.22, 0.027],
                [0.21, 0.24, 0.009], [0.23, 0.35, 0.027], [0.34, 0.36, 0.009], [0.35, 0.45, 0.044],
                [0.44, 0.55, 0.027], [0.54, 0.62, 0.044], [0.61, 0.75, 0.027], [0.74, 0.85, 0.044],
                [0.84, 1.32, 0.027], [1.31, 2.3, 0.009], [2.29, 2.34, -0.008], [2.33, 2.37, -0.026],
                [2.36, 2.4, -0.008], [2.39, 2.42, 0.009], [2.41, 2.47, 0.027], [2.46, 2.49, -0.026],
                [2.52, 2.56, -0.026], [2.55, 2.6, -0.008], [2.59, 2.65, 0.009],
                [2.64, 2.68, -0.008], [2.73, 2.77, -0.026], [2.76, 2.79, -0.008],
                [2.78, 2.84, 0.07], [2.83, 2.93, 0.088], [2.92, 3, 0.105], [2.99, -3.04, 1.222],
                [-3.05, -2.88, 1.397]] },
            { x: -7.3, z: 2.5, angle: -1.26, arc: 2.5, rest: -1.57, guns: 3, my: 11.06,
              lift: [[-1.92, -1.8, -0.026], [-1.81, -1.68, -0.008], [-1.69, -1.57, -0.026],
                [-1.57, -1.45, -0.026], [-1.46, -1.33, -0.008], [-1.34, -1.23, -0.026],
                [-0.07, 0.03, 0.009], [0.02, 0.12, 0.027], [0.11, 0.14, 0.009], [0.13, 0.28, 0.044],
                [0.27, 0.33, 0.027], [0.32, 0.42, -0.008], [0.41, 0.48, -0.026], [1.1, 1.13, 0.21],
                [1.12, 1.18, 0.35], [1.17, 1.25, 0.437]],
              mask: [[2.5, 2.54, 1.222], [2.53, 2.6, 1.048], [2.59, 2.65, 0.873],
                [2.64, 2.67, 0.699], [2.66, 2.68, 0.611], [2.67, 2.7, 0.524], [2.69, 2.88, 0.437],
                [2.87, 2.89, 0.35], [2.88, 2.95, 0.524], [2.94, 3.02, 0.611], [3.01, 3.03, 0.524],
                [3.02, 3.07, 0.437], [3.06, -2.78, 0.262], [-2.79, -2.46, 0.009],
                [-2.47, -1.87, -0.008], [-1.88, -1.78, -0.026], [-1.79, -1.7, -0.008],
                [-1.71, -1.43, -0.026], [-1.44, -1.35, -0.008], [-1.36, -1, -0.026],
                [-0.57, -0.54, -0.008], [-0.55, -0.53, 0.044], [-0.54, -0.51, 0.123],
                [-0.52, -0.46, 0.14], [-0.47, -0.04, 0.437], [-0.05, 0.12, 0.524],
                [0.11, 0.15, 0.611], [0.14, 0.24, 1.222], [0.23, 0.29, 1.048], [0.28, 0.31, 0.96],
                [0.3, 0.4, 0.873], [0.39, 0.64, 1.048], [0.63, 0.66, 0.96], [0.65, 0.68, 0.873],
                [0.67, 0.76, 0.96], [0.75, 0.89, 1.048], [0.88, 1.25, 1.222]] },
            { x: 7.3, z: 2.5, angle: 1.26, arc: 2.5, rest: 1.57, guns: 3, my: 11.04,
              lift: [[-1.25, -1.17, 0.437], [-1.18, -1.12, 0.35], [-1.13, -1.1, 0.21],
                [-0.48, -0.41, -0.026], [-0.42, -0.32, -0.008], [-0.33, -0.27, 0.027],
                [-0.28, -0.13, 0.044], [-0.14, -0.11, 0.009], [-0.12, -0.02, 0.027],
                [-0.03, 0.07, 0.009], [1.23, 1.34, -0.026], [1.33, 1.46, -0.008],
                [1.45, 1.57, -0.026], [1.57, 1.69, -0.026], [1.68, 1.81, -0.008],
                [1.8, 1.92, -0.026]],
              mask: [[-1.25, -0.88, 1.222], [-0.89, -0.75, 1.048], [-0.76, -0.67, 0.96],
                [-0.68, -0.65, 0.873], [-0.66, -0.63, 0.96], [-0.64, -0.39, 1.048],
                [-0.4, -0.3, 0.873], [-0.31, -0.28, 0.96], [-0.29, -0.23, 1.048],
                [-0.24, -0.14, 1.222], [-0.15, -0.11, 0.611], [-0.12, 0.05, 0.524],
                [0.04, 0.47, 0.437], [0.46, 0.52, 0.14], [0.51, 0.54, 0.123], [0.53, 0.55, 0.044],
                [0.54, 0.57, -0.008], [1, 1.36, -0.026], [1.35, 1.44, -0.008], [1.43, 1.71, -0.026],
                [1.7, 1.79, -0.008], [1.78, 1.88, -0.026], [1.87, 2.47, -0.008],
                [2.46, 2.79, 0.009], [2.78, -3.06, 0.262], [-3.07, -3.02, 0.437],
                [-3.03, -3.01, 0.524], [-3.02, -2.94, 0.611], [-2.95, -2.88, 0.524],
                [-2.89, -2.87, 0.35], [-2.88, -2.69, 0.437], [-2.7, -2.67, 0.524],
                [-2.68, -2.66, 0.611], [-2.67, -2.64, 0.699], [-2.65, -2.59, 0.873],
                [-2.6, -2.53, 1.048], [-2.54, -2.5, 1.222]] },
            { x: -7.3, z: -3.0, angle: -1.03, arc: 1.86, rest: -1.57, guns: 3, my: 11.06,
              lift: [[-2.91, -2.8, 0.437], [-2.07, -1.89, -0.026], [-1.9, -1.84, -0.008],
                [-1.85, -1.64, 0.009], [-1.65, -1.59, -0.008], [-1.6, -1.54, -0.026],
                [-1.55, -1.5, -0.008], [-1.51, -1.3, 0.009], [-1.31, -1.26, -0.008],
                [-1.27, -1.1, -0.026], [0.63, 0.66, 0.262], [0.65, 0.73, 0.35], [0.72, 0.85, 0.437]],
              mask: [[-2.91, -2.6, 0.524], [-2.61, -2.59, 0.088], [-2.6, -2.57, 0.07],
                [-2.58, -2.55, 0.027], [-2.56, -2.53, -0.026], [-2.49, -2.31, -0.026],
                [-2.32, -1.82, -0.008], [-1.83, -1.66, 0.009], [-1.67, -1.49, -0.008],
                [-1.5, -1.31, 0.009], [-1.32, -0.35, -0.008], [-0.36, -0.11, 0.21],
                [-0.12, -0.02, 0.262], [-0.03, 0.08, 0.437], [0.07, 0.1, 0.524], [0.09, 0.15, 0.96],
                [0.14, 0.21, 0.873], [0.2, 0.29, 0.786], [0.28, 0.33, 0.873], [0.32, 0.85, 0.96]] },
            { x: 7.3, z: -3.0, angle: 1.03, arc: 1.86, rest: 1.57, guns: 3, my: 11.04,
              lift: [[-0.85, -0.72, 0.437], [-0.73, -0.65, 0.35], [-0.66, -0.63, 0.262],
                [1.1, 1.27, -0.026], [1.26, 1.31, -0.008], [1.3, 1.51, 0.009], [1.5, 1.55, -0.008],
                [1.54, 1.6, -0.026], [1.59, 1.65, -0.008], [1.64, 1.85, 0.009], [1.84, 1.9, -0.008],
                [1.89, 2.07, -0.026], [2.8, 2.91, 0.437]],
              mask: [[-0.85, -0.32, 0.96], [-0.33, -0.28, 0.873], [-0.29, -0.2, 0.786],
                [-0.21, -0.14, 0.873], [-0.15, -0.09, 0.96], [-0.1, -0.07, 0.524],
                [-0.08, 0.03, 0.437], [0.02, 0.12, 0.262], [0.11, 0.36, 0.21], [0.35, 1.32, -0.008],
                [1.31, 1.5, 0.009], [1.49, 1.67, -0.008], [1.66, 1.83, 0.009], [1.82, 2.32, -0.008],
                [2.31, 2.49, -0.026], [2.53, 2.56, -0.026], [2.55, 2.58, 0.027], [2.57, 2.6, 0.07],
                [2.59, 2.61, 0.088], [2.6, 2.91, 0.524]] },
            { x: -6.0, z: -37.0, angle: -0.92, arc: 2.75, rest: -1.9, guns: 3, my: 9.11,
              lift: [[0.77, 0.96, -0.026], [0.95, 1.17, -0.008], [1.16, 1.74, 0.009],
                [1.73, 1.83, 0.027], [1.82, 1.85, -0.008]],
              mask: [[2.59, 2.95, 0.437], [2.94, 2.96, 0.21], [2.95, 2.98, 0.175], [2.97, 3, 0.14],
                [2.99, 3.02, 0.027], [3.01, 3.09, 0.009], [3.08, -2.67, -0.026],
                [-0.99, -0.56, -0.026], [-0.57, -0.54, 0.175], [-0.55, -0.39, 0.437],
                [-0.4, -0.28, 0.35], [-0.29, -0.23, 0.262], [-0.24, -0.21, 0.21],
                [-0.22, -0.11, 0.175], [-0.12, 0, 0.21], [-0.01, 0.17, 0.437], [0.16, 0.24, 0.524],
                [0.23, 0.29, 0.437], [0.28, 0.33, 0.524], [0.32, 0.4, 0.611], [0.39, 0.48, 0.437],
                [0.47, 0.59, 0.524], [0.58, 0.64, 0.088], [0.63, 0.66, 0.044], [0.65, 0.68, 0.07],
                [0.67, 0.73, 0.088], [0.72, 0.82, 0.07], [0.81, 1.01, 0.873], [1, 1.11, 0.699],
                [1.1, 1.13, 0.611], [1.12, 1.18, 0.044], [1.17, 1.24, 0.437], [1.23, 1.25, 0.027],
                [1.24, 1.27, 0.009], [1.26, 1.32, 0.027], [1.31, 1.38, 0.437], [1.37, 1.48, 0.009],
                [1.47, 1.72, 0.088], [1.71, 1.76, 0.009], [1.75, 1.81, 0.027], [1.8, 1.85, 0.21]] },
            { x: 6.0, z: -37.0, angle: 0.92, arc: 2.75, rest: 1.9, guns: 3, my: 9.16,
              lift: [[-1.85, -1.82, -0.008], [-1.83, -1.73, 0.027], [-1.74, -1.16, 0.009],
                [-1.17, -0.95, -0.008], [-0.96, -0.77, -0.026]],
              mask: [[-1.85, -1.8, 0.21], [-1.81, -1.75, 0.027], [-1.76, -1.71, 0.009],
                [-1.72, -1.47, 0.088], [-1.48, -1.37, 0.009], [-1.38, -1.31, 0.437],
                [-1.32, -1.26, 0.027], [-1.27, -1.24, 0.009], [-1.25, -1.23, 0.027],
                [-1.24, -1.17, 0.437], [-1.18, -1.12, 0.044], [-1.13, -1.1, 0.611],
                [-1.11, -1, 0.699], [-1.01, -0.81, 0.873], [-0.82, -0.72, 0.07],
                [-0.73, -0.67, 0.088], [-0.68, -0.65, 0.07], [-0.66, -0.63, 0.044],
                [-0.64, -0.58, 0.088], [-0.59, -0.47, 0.524], [-0.48, -0.39, 0.437],
                [-0.4, -0.32, 0.611], [-0.33, -0.28, 0.524], [-0.29, -0.23, 0.437],
                [-0.24, -0.16, 0.524], [-0.17, 0.01, 0.437], [0, 0.12, 0.21], [0.11, 0.22, 0.175],
                [0.21, 0.24, 0.21], [0.23, 0.29, 0.262], [0.28, 0.4, 0.35], [0.39, 0.55, 0.437],
                [0.54, 0.57, 0.175], [0.56, 0.99, -0.026], [2.67, -3.08, -0.026],
                [-3.09, -3.01, 0.009], [-3.02, -2.99, 0.027], [-3, -2.97, 0.14],
                [-2.98, -2.95, 0.175], [-2.96, -2.94, 0.21], [-2.95, -2.59, 0.437]] },
            { x: -6.3, z: -48.15, angle: -2, arc: 2.5, rest: -1.9, guns: 3, my: 7.17,
              mask: [[1.77, 2.14, 1.048], [2.13, 2.39, 0.96], [2.38, 2.65, 0.437],
                [2.64, 2.81, 0.35], [2.8, 2.86, 0.262], [2.85, 2.88, 0.21], [2.87, 2.89, 0.175],
                [2.88, 2.91, 0.123], [2.9, 2.93, 0.07], [2.92, 2.95, 0.027], [2.94, 3, -0.026],
                [2.99, 3.05, 0.044], [3.04, -3.13, 0.027], [-3.14, -2.78, -0.008],
                [-2.79, -1.87, -0.026], [-1.86, -0.81, -0.026], [-0.82, -0.49, -0.008],
                [-0.5, -0.37, 0.009], [-0.38, -0.35, 0.044], [-0.36, -0.21, 0.786],
                [-0.22, -0.16, 0.699], [-0.17, -0.14, 0.611], [-0.15, 0.36, 0.524],
                [0.35, 0.42, 0.611], [0.41, 0.43, 0.437], [0.42, 0.45, 0.96], [0.44, 0.48, 1.048],
                [0.47, 0.52, 1.222]] },
            { x: 6.3, z: -48.15, angle: 2, arc: 2.5, rest: 1.9, guns: 3, my: 7.18,
              mask: [[-0.52, -0.47, 1.222], [-0.48, -0.44, 1.048], [-0.45, -0.42, 0.96],
                [-0.43, -0.41, 0.437], [-0.42, -0.35, 0.611], [-0.36, 0.15, 0.524],
                [0.14, 0.17, 0.611], [0.16, 0.22, 0.699], [0.21, 0.36, 0.786], [0.35, 0.38, 0.044],
                [0.37, 0.5, 0.009], [0.49, 0.82, -0.008], [0.81, 1.86, -0.026],
                [1.87, 2.79, -0.026], [2.78, 3.14, -0.008], [3.13, -3.04, 0.027],
                [-3.05, -2.99, 0.044], [-3, -2.94, -0.026], [-2.95, -2.92, 0.027],
                [-2.93, -2.9, 0.07], [-2.91, -2.88, 0.123], [-2.89, -2.87, 0.175],
                [-2.88, -2.85, 0.21], [-2.86, -2.8, 0.262], [-2.81, -2.64, 0.35],
                [-2.65, -2.38, 0.437], [-2.39, -2.13, 0.96], [-2.14, -1.77, 1.048]] },
            { x: -6.15, z: 33.75, angle: -0.65, arc: 2.45, rest: -1.2, guns: 2, my: 6.97,
              lift: [[-2.21, -2.17, 0.027], [-2.18, -2.1, 0.07], [-2.11, -1.92, 0.088],
                [-1.93, -1.3, 0.105], [-1.31, -1.02, 0.088], [-1.03, -0.95, 0.07],
                [-0.96, -0.89, 0.044], [-0.9, -0.84, 0.027], [-0.85, -0.82, 0.009],
                [-0.83, -0.81, -0.008], [-0.82, -0.79, -0.026]],
              mask: [[-3.12, -3.08, 1.048], [-3.09, -3.06, 0.96], [-3.07, -3.01, 0.873],
                [-3.02, -2.76, 0.786], [-2.77, -2.74, 0.35], [-2.75, -2.45, 0.044],
                [-2.46, -2.08, 0.07], [-2.09, -1.91, 0.088], [-1.92, -1.31, 0.105],
                [-1.32, -1.03, 0.088], [-1.04, -0.96, 0.07], [-0.97, -0.91, 0.044],
                [-0.92, -0.67, 0.027], [-0.68, -0.16, 0.009], [-0.17, -0.14, -0.008],
                [-0.15, 0, 0.009], [-0.01, 0.01, 0.027], [0, 0.07, 0.044], [0.06, 0.12, 0.105],
                [0.11, 0.14, 0.175], [0.13, 0.15, 0.262], [0.14, 0.55, 0.437], [0.54, 0.61, 0.35],
                [0.6, 0.78, 0.262], [0.77, 0.82, 0.21], [0.81, 0.89, 0.175], [0.88, 0.9, 0.14],
                [0.89, 0.92, 0.105], [0.91, 0.94, 0.088], [0.93, 0.96, 0.044], [0.95, 1.48, 0.009],
                [1.47, 1.53, 0.027], [1.52, 1.55, 0.105], [1.54, 1.57, 0.175], [1.56, 1.58, 0.35],
                [1.57, 1.62, 0.437], [1.61, 1.64, 0.524], [1.63, 1.65, 0.611], [1.64, 1.69, 0.699],
                [1.68, 1.72, 0.786], [1.71, 1.74, 0.873], [1.73, 1.78, 0.96], [1.77, 1.81, 1.048]] },
            { x: 6.15, z: 33.75, angle: 0.65, arc: 2.45, rest: 1.2, guns: 2, my: 6.98,
              lift: [[0.79, 0.82, -0.026], [0.81, 0.83, -0.008], [0.82, 0.85, 0.009],
                [0.84, 0.9, 0.027], [0.89, 0.96, 0.044], [0.95, 1.03, 0.07], [1.02, 1.31, 0.088],
                [1.3, 1.93, 0.105], [1.92, 2.11, 0.088], [2.1, 2.18, 0.07], [2.17, 2.21, 0.027]],
              mask: [[-1.81, -1.77, 1.048], [-1.78, -1.73, 0.96], [-1.74, -1.71, 0.873],
                [-1.72, -1.68, 0.786], [-1.69, -1.64, 0.699], [-1.65, -1.63, 0.611],
                [-1.64, -1.61, 0.524], [-1.62, -1.57, 0.437], [-1.58, -1.56, 0.35],
                [-1.57, -1.54, 0.175], [-1.55, -1.52, 0.105], [-1.53, -1.47, 0.027],
                [-1.48, -0.95, 0.009], [-0.96, -0.93, 0.044], [-0.94, -0.91, 0.088],
                [-0.92, -0.89, 0.105], [-0.9, -0.88, 0.14], [-0.89, -0.81, 0.175],
                [-0.82, -0.77, 0.21], [-0.78, -0.6, 0.262], [-0.61, -0.54, 0.35],
                [-0.55, -0.14, 0.437], [-0.15, -0.13, 0.262], [-0.14, -0.11, 0.175],
                [-0.12, -0.06, 0.105], [-0.07, 0, 0.044], [-0.01, 0.01, 0.027], [0, 0.15, 0.009],
                [0.14, 0.17, -0.008], [0.16, 0.68, 0.009], [0.67, 0.92, 0.027], [0.91, 0.97, 0.044],
                [0.96, 1.04, 0.07], [1.03, 1.32, 0.088], [1.31, 1.92, 0.105], [1.91, 2.09, 0.088],
                [2.08, 2.46, 0.07], [2.45, 2.75, 0.044], [2.74, 2.77, 0.35], [2.76, 3.02, 0.786],
                [3.01, 3.07, 0.873], [3.06, 3.09, 0.96], [3.08, 3.12, 1.048]] },
            { x: -5.2, z: -70.0, angle: -2.96, arc: 3.08, rest: -2.2, guns: 2, my: 7.08,
              lift: [[0.23, 0.48, 0.175], [0.47, 0.52, 0.14], [-0.29, -0.27, 0.175],
                [-0.28, -0.07, 0.21], [-0.08, 0.03, 0.262], [0.02, 0.14, 0.21]],
              mask: [[0.23, 0.28, 0.524], [0.27, 0.36, 0.35], [0.35, 0.52, 0.262],
                [0.51, 0.57, 0.21], [0.56, 0.66, 0.175], [0.65, 0.68, 0.14], [0.67, 0.69, 0.123],
                [0.68, 1.06, 0.009], [1.05, 1.22, -0.008], [1.21, 1.25, 0.027], [1.24, 1.43, 0.044],
                [1.42, 1.5, 0.027], [1.49, 1.9, -0.008], [1.89, 2.53, -0.026], [2.52, 2.68, 0.027],
                [2.67, 2.7, 0.009], [2.69, 2.75, -0.026], [2.87, 2.91, -0.026], [2.9, 2.93, 0.009],
                [2.92, 2.95, 0.027], [2.94, 3.02, 0.088], [3.01, 3.09, 0.027], [3.08, 3.1, 0.009],
                [3.09, 3.12, -0.026], [-3.07, -3.01, -0.026], [-0.87, -0.51, -0.026],
                [-0.52, -0.32, -0.008], [-0.33, -0.28, 0.009], [-0.29, -0.27, 0.21],
                [-0.28, -0.21, 0.262], [-0.22, -0.16, 0.21], [-0.17, -0.09, 0.35],
                [-0.1, -0.07, 0.262], [-0.08, -0.06, 0.21], [-0.07, -0.02, 0.262],
                [-0.03, 0.07, 0.35], [0.06, 0.12, 0.524], [0.11, 0.14, 0.437]] },
            { x: 5.2, z: -70.0, angle: 2.96, arc: 3.08, rest: 2.2, guns: 2, my: 7.08,
              lift: [[-0.14, -0.02, 0.21], [-0.03, 0.08, 0.262], [0.07, 0.28, 0.21],
                [0.27, 0.29, 0.175], [-0.52, -0.47, 0.14], [-0.48, -0.23, 0.175]],
              mask: [[-0.14, -0.11, 0.437], [-0.12, -0.06, 0.524], [-0.07, 0.03, 0.35],
                [0.02, 0.07, 0.262], [0.06, 0.08, 0.21], [0.07, 0.1, 0.262], [0.09, 0.17, 0.35],
                [0.16, 0.22, 0.21], [0.21, 0.28, 0.262], [0.27, 0.29, 0.21], [0.28, 0.33, 0.009],
                [0.32, 0.52, -0.008], [0.51, 0.87, -0.026], [3.01, 3.07, -0.026],
                [-3.12, -3.09, -0.026], [-3.1, -3.08, 0.009], [-3.09, -3.01, 0.027],
                [-3.02, -2.94, 0.088], [-2.95, -2.92, 0.027], [-2.93, -2.9, 0.009],
                [-2.91, -2.87, -0.026], [-2.75, -2.69, -0.026], [-2.7, -2.67, 0.009],
                [-2.68, -2.52, 0.027], [-2.53, -1.89, -0.026], [-1.9, -1.49, -0.008],
                [-1.5, -1.42, 0.027], [-1.43, -1.24, 0.044], [-1.25, -1.21, 0.027],
                [-1.22, -1.05, -0.008], [-1.06, -0.68, 0.009], [-0.69, -0.67, 0.123],
                [-0.68, -0.65, 0.14], [-0.66, -0.56, 0.175], [-0.57, -0.51, 0.21],
                [-0.52, -0.35, 0.262], [-0.36, -0.27, 0.35], [-0.28, -0.23, 0.524]] },
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

  baltimore: {
    // USS Baltimore, the name ship of the heavy cruisers the United States
    // built once the treaties were gone: nine 8-inch/55 in three triple
    // turrets, two forward and one aft, twelve 5-inch/38 in six twin mounts,
    // and a light battery of forty-eight 40 mm barrels -- a Cleveland stretched
    // by twenty metres and given the guns and the belt to fight a Takao.
    //
    // She is drawn from the owner's sculpt of her (see baltimore.js), at her
    // own size -- 205.3 m -- floated at her 7.3 m draft, in Measure 22.
    id: 'baltimore',
    name: 'Baltimore',
    fullName: 'USS Baltimore',
    className: 'Baltimore',
    type: 'CA',
    typeName: 'Heavy Cruiser',
    nation: 'usa',
    blurb: 'Nine eight-inch rifles with super-heavy shells, radar-directed, and more 40 mm than a battleship. The treaty cruisers\' answer.',
    hull: { length: 205.3, beam: 21.6, draft: 7.3, superstructure: 1.25 },
    hp: 35600,
    maxSpeed: 33 * KNOTS,
    reverseSpeed: 8 * KNOTS,
    accel: 0.8,
    turnRate: 0.08,
    rudderShift: 7.0,
    speedLossInTurn: 0.2,
    concealment: 11700,
    fireDetectPenalty: 4600,
    // SG and SK search sets, and a Mk 13 on each main battery director.
    radarRange: 13000,
    repairCooldown: 80,
    repairHeal: 0.1,
    smokeCharges: 0,
    // Six inches of belt over her machinery and magazines, tapering below, and
    // two and a half of armoured deck: enough against eight-inch at the ranges
    // she was meant to fight at, and eight inches on her turret faces.
    armor: { belt: 152, deck: 64, citadel: 152, bow: 25, superstructure: 20 },
    turrets: [
      // No.1 low on her forecastle, No.2 superfiring over it, and No.3 on her
      // quarterdeck facing astern -- where the sculpt has them, a hand or two
      // off her centreline as it drew them.
      { id: 0, name: 'No.1', x: 0.25, z: 57.8, angle: 0.04, arc: 2.81, guns: 3, my: 7.93,
        lift: [[2.81, 2.88, 0.044]],
        mask: [[-2.79, -2.69], [-0.4, -0.37, 0], [-0.38, -0.34, 0.035], [-0.35, 0.35, 0.07],
          [0.34, 0.38, 0.035], [0.37, 0.4, 0.027], [2.76, 2.88]] },
      { id: 1, name: 'No.2', x: 0.05, z: 44.4, angle: 0, arc: 2.98, guns: 3, my: 11.04,
        mask: [[-3, -2.94, 0.437], [-2.95, -2.85, 0.35], [-2.86, -2.83, 0.044],
          [-2.84, -2.81, 0.035], [-2.82, -2.73, 0.027], [-2.74, -2.69, 0.018], [2.69, 2.72, 0.009],
          [2.71, 2.74, 0.018], [2.73, 2.82, 0.027], [2.81, 2.84, 0.035], [2.83, 2.86, 0.044],
          [2.85, 2.95, 0.35], [2.94, 3, 0.437]] },
      { id: 2, name: 'No.3', x: -0.15, z: -55.5, angle: -3.14, arc: 2.96, guns: 3, my: 7.47,
        mask: [[0.16, 0.21, 0.437], [0.2, 0.33, 0.35], [0.32, 0.38, 0.21], [0.37, 0.4, 0.175],
          [0.39, 0.42, 0.14], [0.41, 0.5, 0.035], [0.49, 0.52, 0.027], [0.51, 0.54, 0.009],
          [0.53, 0.55, 0], [2.48, 2.54, 0], [2.53, 2.56, 0.044], [2.55, 2.6, 0.088],
          [2.59, 2.67, 0.105], [2.66, 2.75, 0.35], [2.74, 2.79, 0.262], [2.78, 2.86, 0.35],
          [2.85, 2.91, 0.262], [2.9, 2.93, 0.105], [2.92, 2.96, 0.009], [2.95, 3.03, 0],
          [3.02, 3.05, -0.008], [3.06, 3.12, -0.008], [3.11, -3.08, 0], [-3.09, -3.06, -0.008],
          [-3.07, -2.97, 0], [-2.98, -2.94, 0.009], [-2.95, -2.8, 0.105], [-2.81, -2.67, 0.262],
          [-2.68, -2.62, 0.105], [-2.63, -2.59, 0.088], [-2.6, -2.55, 0.053], [-2.56, -2.5, 0.009],
          [-0.55, -0.51, 0], [-0.52, -0.49, 0.027], [-0.5, -0.41, 0.035], [-0.42, -0.39, 0.175],
          [-0.4, -0.32, 0.21], [-0.33, -0.3, 0.262], [-0.31, -0.16, 0.35]] },
    ],
    gun: {
      name: '8"/55 Mk 15', role: 'surface',
      // Five below the horizontal to forty-one up, in the Mk 14 turret.
      elev: { min: -0.087, max: 0.72 },
      reach: 10.0,
      // The 335 lb super-heavy shell: slower than anyone else's eight-inch and
      // a good deal harder to keep out.
      caliber: 203, reload: 11.5, traverse: 0.22, range: 18200, sigma: 1.5,
      shells: shells(203, 5400, 3200, 290, 762, 0.13),
    },
    torpedoes: null,
    // Twelve 5-inch in six twin Mk 38 mounts: No.51 superfiring over No.2 and
    // No.56 over No.3, on her centreline, and two a side -- abreast her bridge
    // facing ahead and abreast her after superstructure facing astern. The
    // mount is the owner's own sculpt of it.
    secondary: {
      name: '5"/38 Mk 12', role: 'dp',
      // Fifteen below the horizontal to eighty-five up.
      elev: { min: -0.26, max: 1.48 },
      reach: 4.3,
      caliber: 127, reload: 4.0, traverse: 0.44, range: 8200, sigma: 1.15,
      shells: shells(127, 1900, 1650, 76, 792, 0.07),
      mounts: [
        { x: 0, z: 31, angle: -0.01, arc: 2.69, rest: 0, guns: 2, my: 10.42,
          mask: [[-2.72, -2.59, 0.96], [-2.6, -2.57, 0.14], [-2.58, -2.41, 0.07],
            [-2.42, -2.38, 0.053], [-2.39, -2.36, 0.027], [-2.37, -2.34, 0.009], [-2.35, -1.66, 0],
            [-0.5, -0.47, 0.018], [-0.48, -0.46, 0.21], [-0.47, -0.2, 0.35], [-0.21, -0.06, 0.437],
            [-0.07, 0.05, 0.35], [0.04, 0.19, 0.437], [0.18, 0.47, 0.35], [0.46, 0.52, 0.262],
            [1.66, 2.35, 0], [2.34, 2.37, 0.009], [2.36, 2.39, 0.027], [2.38, 2.42, 0.053],
            [2.41, 2.51, 0.07], [2.5, 2.61, 0.873], [2.6, 2.7, 0.96]] },
        { x: 7.3, z: 18.45, angle: 1.57, arc: 1.98, rest: 0, guns: 2, my: 10.22,
          mask: [[-0.43, -0.25, 0.14], [-0.26, -0.13, 0.123], [-0.14, -0.09, 0.105],
            [-0.1, -0.07, 0.035], [-0.08, -0.04, 0], [-0.05, -0.02, -0.008], [-0.03, 0, -0.017],
            [2.99, 3.03, -0.017], [3.02, 3.09, 0.105], [3.08, 3.1, 0.123], [3.09, 3.14, 0.14],
            [3.13, -3.08, 0.175], [-3.09, -3.04, 0.21], [-3.05, -3.01, 0.524],
            [-3.02, -2.99, 0.611], [-3, -2.97, 0.699], [-2.98, -2.94, 0.786], [-2.95, -2.92, 0.873],
            [-2.93, -2.88, 0.96], [-2.89, -2.87, 1.048], [-2.88, -2.76, 1.397],
            [-2.77, -2.71, 1.571]] },
        { x: -7.3, z: 18.45, angle: -1.57, arc: 1.98, rest: 0, guns: 2, my: 10.22,
          mask: [[2.71, 2.77, 1.571], [2.76, 2.88, 1.397], [2.87, 2.89, 1.048], [2.88, 2.93, 0.96],
            [2.92, 2.95, 0.873], [2.94, 2.98, 0.786], [2.97, 3, 0.699], [2.99, 3.02, 0.611],
            [3.01, 3.05, 0.524], [3.04, 3.09, 0.21], [3.08, -3.13, 0.175], [-3.14, -3.09, 0.14],
            [-3.1, -3.08, 0.123], [-3.09, -3.02, 0.105], [-3.03, -2.99, -0.017], [0, 0.03, -0.017],
            [0.02, 0.05, -0.008], [0.04, 0.08, 0], [0.07, 0.1, 0.035], [0.09, 0.14, 0.105],
            [0.13, 0.26, 0.123], [0.25, 0.43, 0.14]] },
        { x: 7.5, z: -27.45, angle: 1.61, arc: 2.32, rest: Math.PI, guns: 2, my: 10.26,
          lift: [[-2.47, -2.43, -0.008], [-2.44, -2.41, 0.105], [-2.42, -2.39, 0.14],
            [-2.4, -2.34, 0.175]],
          mask: [[-0.73, -0.68, 1.397], [-0.69, -0.6, 0.96], [-0.61, -0.42, 1.048],
            [-0.43, -0.34, 0.96], [-0.35, -0.14, 0.699], [-0.15, -0.13, 0.611],
            [-0.14, -0.11, 0.524], [-0.12, -0.06, 0.437], [-0.07, -0.02, 0.35],
            [-0.03, 0.05, 0.175], [0.04, 0.12, 0.105], [0.11, 0.17, 0.009], [0.16, 0.21, -0.017],
            [3.13, -3.11, 0.009], [-3.12, -3.09, 0.027], [-3.1, -3.04, 0.175], [-3.05, -2.69, 0.21],
            [-2.7, -2.67, 0.262], [-2.68, -2.5, 0.786], [-2.51, -2.41, 0.873], [-2.42, -2.34, 0.96]] },
        { x: -7.5, z: -27.45, angle: -1.61, arc: 2.32, rest: Math.PI, guns: 2, my: 10.26,
          lift: [[2.34, 2.4, 0.175], [2.39, 2.42, 0.14], [2.41, 2.44, 0.105], [2.43, 2.47, -0.008]],
          mask: [[2.34, 2.42, 0.96], [2.41, 2.51, 0.873], [2.5, 2.68, 0.786], [2.67, 2.7, 0.262],
            [2.69, 3.05, 0.21], [3.04, 3.1, 0.175], [3.09, 3.12, 0.027], [3.11, -3.13, 0.009],
            [-0.21, -0.16, -0.017], [-0.17, -0.11, 0.009], [-0.12, -0.04, 0.105],
            [-0.05, 0.03, 0.175], [0.02, 0.07, 0.35], [0.06, 0.12, 0.437], [0.11, 0.14, 0.524],
            [0.13, 0.15, 0.611], [0.14, 0.35, 0.699], [0.34, 0.43, 0.96], [0.42, 0.61, 1.048],
            [0.6, 0.69, 0.96], [0.68, 0.73, 1.397]] },
        { x: 0, z: -41.35, angle: 2.92, arc: 2.88, rest: Math.PI, guns: 2, my: 10.25,
          mask: [[0.02, 0.15, 1.048], [0.14, 0.52, 1.222], [0.51, 0.54, 1.048], [0.53, 0.68, 0.123],
            [0.67, 0.69, 0.07], [0.68, 0.75, 0.105], [0.74, 0.76, 0.053], [0.75, 0.9, 0.123],
            [2.88, 2.95, 0.035], [2.95, 3.02, 0.035], [3.11, -3.11, 0], [-3.02, -2.95, 0.035],
            [-2.95, -2.88, 0.035], [-0.85, -0.82, 0.14], [-0.83, -0.65, 0.175],
            [-0.66, -0.56, 0.14], [-0.57, -0.49, 0.175], [-0.5, -0.46, 1.048]] },
      ],
    },
    aa: {
      range: 5400, dps: 70,
      guns: [
        // Twelve quads: a pair side by side on her forecastle, a pair abreast
        // No.51, a pair abreast each funnel -- the pair between them up on
        // bandstands over her boats -- and a pair on her main deck abreast her
        // after superstructure.
        { name: '40mm Bofors', caliber: 40, role: 'aa', reload: 0.26, range: 3400,
          elev: { min: -0.26, max: 1.57 },
          mounts: [
            { x: 2.5, z: 75, angle: 0.04, arc: 3.08, rest: 0, guns: 4, my: 8.48,
              lift: [[-2.95, -2.9, 0.027], [-2.91, -2.2, 0.07], [-2.21, -2.19, 0.044],
                [-2.2, -1.52, 0.07], [-1.53, -1.47, 0.027], [-1.48, -1.43, -0.026],
                [1.43, 1.48, -0.026], [1.47, 1.53, 0.027], [1.52, 2.2, 0.07], [2.19, 2.21, 0.044],
                [2.2, 2.91, 0.07], [2.9, 2.95, 0.027]],
              mask: [[-3.05, -2.97, 0.262], [-2.98, -2.88, 0.175], [-2.89, -2.83, 0.14],
                [-2.84, -2.71, 0.123], [-2.72, -2.69, 0.105], [-2.7, -2.22, 0.07],
                [-2.23, -2.17, 0.044], [-2.18, -2.03, 0.07], [-2.04, -1.37, 0.175],
                [-1.38, -1.35, 0.07], [-1.36, -1.16, 0.044], [-1.17, -0.98, -0.026],
                [-0.71, -0.58, -0.026], [-0.59, -0.47, -0.008], [-0.48, -0.39, 0.009],
                [-0.4, -0.32, 0.027], [-0.33, -0.18, 0.044], [-0.19, -0.14, 0.07],
                [-0.15, -0.02, 0.14], [-0.03, 0.01, 0.07], [0, 0.1, 0.044], [0.09, 0.14, 0.027],
                [0.13, 0.17, 0.009], [0.16, 0.22, -0.008], [0.21, 0.29, -0.026],
                [1.45, 1.5, -0.026], [1.49, 1.55, 0.027], [1.54, 2.18, 0.07], [2.17, 2.23, 0.044],
                [2.22, 2.89, 0.07], [2.88, 2.93, 0.027], [2.92, 2.98, -0.026], [2.97, 3, -0.008],
                [2.99, 3.02, 0.088], [3.01, 3.03, 0.105], [3.02, 3.05, 0.123], [3.04, 3.07, 0.175],
                [3.06, 3.14, 0.262]] },
            { x: -2.5, z: 75, angle: -0.04, arc: 3.08, rest: 0, guns: 4, my: 8.49,
              lift: [[-2.95, -2.9, 0.027], [-2.91, -2.2, 0.07], [-2.21, -2.19, 0.044],
                [-2.2, -1.52, 0.07], [-1.53, -1.47, 0.027], [-1.48, -1.43, -0.026],
                [1.43, 1.48, -0.026], [1.47, 1.53, 0.027], [1.52, 2.2, 0.07], [2.19, 2.21, 0.044],
                [2.2, 2.91, 0.07], [2.9, 2.95, 0.027]],
              mask: [[-3.14, -3.06, 0.262], [-3.07, -3.04, 0.175], [-3.05, -3.02, 0.123],
                [-3.03, -3.01, 0.105], [-3.02, -2.99, 0.088], [-3, -2.97, -0.008],
                [-2.98, -2.92, -0.026], [-2.93, -2.88, 0.027], [-2.89, -2.22, 0.07],
                [-2.23, -2.17, 0.044], [-2.18, -1.54, 0.07], [-1.55, -1.49, 0.027],
                [-1.5, -1.45, -0.026], [-0.29, -0.21, -0.026], [-0.22, -0.16, -0.008],
                [-0.17, -0.13, 0.009], [-0.14, -0.09, 0.027], [-0.1, 0, 0.044], [-0.01, 0.03, 0.07],
                [0.02, 0.15, 0.14], [0.14, 0.19, 0.07], [0.18, 0.33, 0.044], [0.32, 0.4, 0.027],
                [0.39, 0.48, 0.009], [0.47, 0.59, -0.008], [0.58, 0.71, -0.026],
                [0.98, 1.17, -0.026], [1.16, 1.36, 0.044], [1.35, 1.38, 0.07], [1.37, 2.04, 0.175],
                [2.03, 2.18, 0.07], [2.17, 2.23, 0.044], [2.22, 2.7, 0.07], [2.69, 2.72, 0.105],
                [2.71, 2.84, 0.123], [2.83, 2.89, 0.14], [2.88, 2.98, 0.175], [2.97, 3.05, 0.262]] },
            { x: 5.2, z: 28.4, angle: 0.76, arc: 2.55, rest: Math.PI / 2, guns: 4, my: 10.25,
              lift: [[-1.38, -1.33, 0.027], [-1.34, -1.09, 0.07], [-1.1, -0.98, 0.175],
                [-0.99, -0.91, 0.14], [-0.92, -0.89, 0.088], [-0.9, -0.63, 0.07],
                [-0.64, -0.61, 0.044], [-0.62, 0.05, 0.07], [0.04, 0.1, 0.027],
                [0.09, 0.14, -0.026], [3.01, 3.05, -0.026], [3.04, 3.1, 0.027], [3.09, -2.95, 0.07]],
              mask: [[-1.81, -1.77, 0.699], [-1.78, -1.75, 0.611], [-1.76, -0.7, 0.524],
                [-0.71, -0.51, 0.437], [-0.52, -0.13, 0.35], [-0.14, -0.02, 0.262],
                [-0.03, 0.03, 0.07], [0.02, 0.08, 0.027], [0.07, 0.12, -0.026],
                [2.53, 2.56, -0.026], [2.55, 2.58, 0.027], [2.57, 2.6, 0.105], [2.59, 2.82, 0.14],
                [2.81, 3.09, 0.175], [3.08, -2.95, 1.048]] },
            { x: -5.2, z: 28.4, angle: -0.76, arc: 2.55, rest: -Math.PI / 2, guns: 4, my: 10.26,
              lift: [[2.95, -3.09, 0.07], [-3.1, -3.04, 0.027], [-3.05, -3.01, -0.026],
                [-0.14, -0.09, -0.026], [-0.1, -0.04, 0.027], [-0.05, 0.62, 0.07],
                [0.61, 0.64, 0.044], [0.63, 0.9, 0.07], [0.89, 0.92, 0.088], [0.91, 0.99, 0.14],
                [0.98, 1.1, 0.175], [1.09, 1.34, 0.07], [1.33, 1.38, 0.027]],
              mask: [[2.95, -3.08, 1.048], [-3.09, -2.81, 0.175], [-2.82, -2.59, 0.14],
                [-2.6, -2.57, 0.105], [-2.58, -2.55, 0.027], [-2.56, -2.53, -0.026],
                [-0.12, -0.07, -0.026], [-0.08, -0.02, 0.027], [-0.03, 0.03, 0.07],
                [0.02, 0.14, 0.262], [0.13, 0.52, 0.35], [0.51, 0.71, 0.437], [0.7, 1.76, 0.524],
                [1.75, 1.78, 0.611], [1.77, 1.81, 0.699]] },
            { x: 7.5, z: 7.8, angle: 1.66, arc: 2, rest: Math.PI / 2, guns: 4, my: 10.13,
              lift: [[-0.36, 0.05, 0.07], [0.04, 0.1, 0.027], [0.09, 0.14, -0.026],
                [3.01, 3.05, -0.026], [3.04, 3.1, 0.027], [3.09, -2.6, 0.07]],
              mask: [[-0.36, -0.2, 1.048], [-0.21, -0.18, 0.786], [-0.19, -0.07, 0.699],
                [-0.08, -0.06, 0.35], [-0.07, 0.31, 0.262], [0.3, 0.33, 0.21], [2.62, 2.74, -0.026],
                [2.74, 2.95, -0.026], [2.94, 2.96, 0.044], [2.95, 3, 0.262], [2.99, -3.01, 0.35],
                [-3.02, -2.99, 0.437], [-3, -2.95, 0.524], [-2.96, -2.94, 0.699],
                [-2.95, -2.81, 0.786], [-2.82, -2.76, 0.96], [-2.77, -2.66, 1.048],
                [-2.67, -2.6, 0.262]] },
            { x: -7.5, z: 7.8, angle: -1.66, arc: 2, rest: -Math.PI / 2, guns: 4, my: 10.13,
              lift: [[2.6, -3.09, 0.07], [-3.1, -3.04, 0.027], [-3.05, -3.01, -0.026],
                [-0.14, -0.09, -0.026], [-0.1, -0.04, 0.027], [-0.05, 0.36, 0.07]],
              mask: [[2.6, 2.67, 0.262], [2.66, 2.77, 1.048], [2.76, 2.82, 0.96],
                [2.81, 2.95, 0.786], [2.94, 2.96, 0.699], [2.95, 3, 0.524], [2.99, 3.02, 0.437],
                [3.01, -2.99, 0.35], [-3, -2.95, 0.262], [-2.96, -2.94, 0.044],
                [-2.95, -2.74, -0.026], [-2.74, -2.62, -0.026], [-0.33, -0.3, 0.21],
                [-0.31, 0.07, 0.262], [0.06, 0.08, 0.35], [0.07, 0.19, 0.699], [0.18, 0.21, 0.786],
                [0.2, 0.36, 1.048]] },
            { x: 6.25, z: -4.65, angle: 2.66, arc: 2.95, rest: Math.PI / 2, guns: 4, my: 12.98,
              lift: [[-0.31, 0.05, 0.07], [0.04, 0.1, 0.027], [0.09, 0.14, -0.026],
                [3.01, 3.05, -0.026], [3.04, 3.1, 0.027], [3.09, -2.52, 0.07], [-2.53, -2.5, 0.044],
                [-2.51, -1.8, 0.07], [-1.81, -1.77, 0.027], [-1.38, -1.33, 0.027],
                [-1.34, -0.65, 0.07]],
              mask: [[-0.31, -0.18, 0.786], [-0.19, -0.09, 0.699], [-0.1, -0.07, 0.611],
                [-0.08, -0.06, 0.437], [-0.07, 0, 0.262], [-0.01, 0.01, 0.21], [0, 0.03, 0.07],
                [0.02, 0.08, 0.027], [0.07, 0.21, -0.026], [2.92, 3.07, -0.026], [3.06, 3.1, 0.175],
                [3.09, -2.95, 0.35], [-2.96, -2.94, 0.437], [-2.95, -2.9, 0.699],
                [-2.91, -2.85, 0.873], [-2.86, -2.69, 1.048], [-2.7, -2.31, 0.96],
                [-2.32, -2.26, 0.873], [-2.27, -2.22, 0.786], [-2.23, -2.13, 0.175],
                [-2.14, -2.08, 0.123], [-2.09, -2.01, 0.105], [-2.02, -1.82, 0.07],
                [-1.83, -1.75, 0.027], [-1.76, -1.38, 0.07], [-1.39, -1.31, 0.027],
                [-1.32, -1.3, 0.262], [-1.31, -1.17, 0.35], [-1.18, -1.14, 0.699],
                [-1.15, -1.05, 0.786], [-1.06, -1, 1.048], [-1.01, -0.91, 1.222],
                [-0.92, -0.75, 1.048], [-0.76, -0.68, 1.222], [-0.69, -0.65, 1.048]] },
            { x: -6.25, z: -4.65, angle: -2.66, arc: 2.95, rest: -Math.PI / 2, guns: 4, my: 12.98,
              lift: [[0.65, 1.34, 0.07], [1.33, 1.38, 0.027], [1.77, 1.81, 0.027],
                [1.8, 2.51, 0.07], [2.5, 2.53, 0.044], [2.52, -3.09, 0.07], [-3.1, -3.04, 0.027],
                [-3.05, -3.01, -0.026], [-0.14, -0.09, -0.026], [-0.1, -0.04, 0.027],
                [-0.05, 0.31, 0.07]],
              mask: [[0.65, 0.69, 1.048], [0.68, 0.76, 1.222], [0.75, 0.92, 1.048],
                [0.91, 1.01, 1.222], [1, 1.06, 1.048], [1.05, 1.15, 0.786], [1.14, 1.18, 0.699],
                [1.17, 1.31, 0.35], [1.3, 1.32, 0.262], [1.31, 1.39, 0.027], [1.38, 1.76, 0.07],
                [1.75, 1.83, 0.027], [1.82, 2.02, 0.07], [2.01, 2.09, 0.105], [2.08, 2.14, 0.123],
                [2.13, 2.23, 0.175], [2.22, 2.27, 0.786], [2.26, 2.32, 0.873], [2.31, 2.7, 0.96],
                [2.69, 2.86, 1.048], [2.85, 2.91, 0.873], [2.9, 2.95, 0.699], [2.94, 2.96, 0.437],
                [2.95, -3.09, 0.35], [-3.1, -3.06, 0.175], [-3.07, -2.92, -0.026],
                [-0.21, -0.07, -0.026], [-0.08, -0.02, 0.027], [-0.03, 0, 0.07],
                [-0.01, 0.01, 0.21], [0, 0.07, 0.262], [0.06, 0.08, 0.437], [0.07, 0.1, 0.611],
                [0.09, 0.19, 0.699], [0.18, 0.31, 0.786]] },
            { x: 8.35, z: -15.3, angle: 1.57, arc: 1.85, rest: Math.PI / 2, guns: 4, my: 10.13,
              lift: [[-0.29, 0.05, 0.07], [0.04, 0.1, 0.027], [0.09, 0.14, -0.026],
                [3.01, 3.05, -0.026], [3.04, 3.1, 0.027], [3.09, -2.9, 0.07], [-2.91, -2.85, 0.262]],
              mask: [[-0.29, -0.25, 0.96], [-0.26, -0.21, 0.699], [-0.22, -0.2, 0.611],
                [-0.21, -0.18, 0.524], [-0.19, -0.02, 0.437], [-0.03, 0.14, 0.35],
                [0.13, 0.17, -0.008], [0.16, 0.19, -0.026], [2.88, 2.93, -0.026],
                [2.92, 2.98, 0.175], [2.97, 3.1, 0.21], [3.09, -3.13, 0.262], [-3.14, -3.01, 0.21],
                [-3.02, -2.85, 0.35]] },
            { x: -8.35, z: -15.3, angle: -1.57, arc: 1.85, rest: -Math.PI / 2, guns: 4, my: 10.13,
              lift: [[2.85, 2.91, 0.262], [2.9, -3.09, 0.07], [-3.1, -3.04, 0.027],
                [-3.05, -3.01, -0.026], [-0.14, -0.09, -0.026], [-0.1, -0.04, 0.027],
                [-0.05, 0.29, 0.07]],
              mask: [[2.85, 3.02, 0.35], [3.01, 3.14, 0.21], [3.13, -3.09, 0.262],
                [-3.1, -2.97, 0.21], [-2.98, -2.92, 0.175], [-2.93, -2.88, -0.026],
                [-0.19, -0.16, -0.026], [-0.17, -0.13, -0.008], [-0.14, 0.03, 0.35],
                [0.02, 0.19, 0.437], [0.18, 0.21, 0.524], [0.2, 0.22, 0.611], [0.21, 0.26, 0.699],
                [0.25, 0.29, 0.96]] },
            { x: 8, z: -36.3, angle: 2.12, arc: 2.46, rest: Math.PI / 2, guns: 4, my: 7.68,
              lift: [[-0.36, 0.05, 0.07], [0.04, 0.1, 0.027], [0.09, 0.14, -0.026],
                [3.01, 3.05, -0.026], [3.04, 3.1, 0.027], [3.09, -2.52, 0.07], [-2.53, -2.5, 0.044],
                [-2.51, -1.8, 0.07], [-1.81, -1.77, 0.027]],
              mask: [[-0.36, -0.28, 1.048], [-0.29, -0.14, 0.873], [-0.15, -0.13, 0.699],
                [-0.14, 0.36, 0.524], [0.35, 0.69, 0.35], [0.68, 0.71, 0.262], [0.7, 0.73, 0.009],
                [3.02, 3.07, -0.026], [3.06, 3.12, 0.027], [3.11, 3.14, 0.07], [3.13, -3.04, 0.14],
                [-3.05, -2.97, 0.175], [-2.98, -2.95, 0.088], [-2.96, -2.92, 0.105],
                [-2.93, -2.67, 0.123], [-2.68, -2.64, 0.105], [-2.65, -2.52, 0.123],
                [-2.53, -2.46, 0.14], [-2.47, -2.38, 0.524], [-2.39, -2.29, 0.611],
                [-2.3, -1.98, 0.699], [-1.99, -1.94, 0.786], [-1.95, -1.89, 0.873],
                [-1.9, -1.71, 0.96], [-1.72, -1.68, 0.175]] },
            { x: -8, z: -36.3, angle: -2.12, arc: 2.46, rest: -Math.PI / 2, guns: 4, my: 7.68,
              lift: [[1.77, 1.81, 0.027], [1.8, 2.51, 0.07], [2.5, 2.53, 0.044],
                [2.52, -3.09, 0.07], [-3.1, -3.04, 0.027], [-3.05, -3.01, -0.026],
                [-0.14, -0.09, -0.026], [-0.1, -0.04, 0.027], [-0.05, 0.36, 0.07]],
              mask: [[1.68, 1.72, 0.175], [1.71, 1.9, 0.96], [1.89, 1.95, 0.873],
                [1.94, 1.99, 0.786], [1.98, 2.3, 0.699], [2.29, 2.39, 0.611], [2.38, 2.47, 0.524],
                [2.46, 2.53, 0.14], [2.52, 2.65, 0.123], [2.64, 2.68, 0.105], [2.67, 2.93, 0.123],
                [2.92, 2.96, 0.105], [2.95, 2.98, 0.088], [2.97, 3.05, 0.175], [3.04, -3.13, 0.14],
                [-3.14, -3.11, 0.07], [-3.12, -3.06, 0.027], [-3.07, -3.02, -0.026],
                [-0.73, -0.7, 0.009], [-0.71, -0.68, 0.262], [-0.69, -0.35, 0.35],
                [-0.36, 0.14, 0.524], [0.13, 0.15, 0.699], [0.14, 0.29, 0.873], [0.28, 0.36, 1.048]] },
          ] },
        // Her Oerlikons along the edge of her 01 level, in pairs, where the
        // sculpt drew them.
        { name: '20mm Oerlikon', caliber: 20, role: 'aa', reload: 0.12, range: 1800,
          elev: { min: -0.17, max: 1.48 },
          mounts: [
            { x: 8.9, z: 2.8, angle: 1.54, arc: 2.85, rest: Math.PI / 2, guns: 1, my: 10.01,
              lift: [[2.97, 3.02, -0.008], [3.01, 3.03, 0.027], [3.02, -3.02, 0.044],
                [-3.03, -3.01, 0.027], [-3.02, -2.97, -0.008]],
              mask: [[-1.32, -1.26, 1.048], [-1.27, -1.19, 0.96], [-1.2, -1.12, 1.048],
                [-1.13, -1.1, 1.222], [-1.11, -1.05, 1.397], [-1.06, -0.98, 1.048],
                [-0.99, -0.93, 1.397], [-0.94, -0.88, 0.21], [-0.89, -0.7, 0.873],
                [-0.71, -0.56, 1.048], [-0.57, -0.41, 0.873], [-0.42, -0.32, 0.786],
                [-0.33, -0.16, 0.524], [-0.17, 0.07, 0.175], [0.06, 0.12, 0.009],
                [0.11, 0.21, -0.008], [2.99, 3.03, -0.008], [3.02, 3.05, 0.027], [3.04, 3.1, 0.044],
                [3.09, -3.11, 0.088], [-3.12, -3.09, 0.21], [-3.1, -3.08, 0.437],
                [-3.09, -2.81, 0.524], [-2.82, -2.8, 0.786], [-2.81, -2.74, 0.873],
                [-2.75, -2.55, 0.786], [-2.56, -2.48, 0.611], [-2.49, -2.45, 0.35],
                [-2.46, -2.39, 0.123], [-2.4, -2.36, 0.105], [-2.37, -2.34, 0.044],
                [-2.35, -2.31, 0.027], [-2.32, -2.22, 0.009], [-2.23, -2.19, -0.008],
                [-2.2, -2.17, 0.123], [-2.18, -2.06, 0.262], [-2.07, -2.05, 0.35],
                [-2.06, -1.98, 0.699], [-1.99, -1.91, 0.96], [-1.92, -1.87, 1.048]] },
            { x: -8.9, z: 2.8, angle: -1.54, arc: 2.85, rest: -Math.PI / 2, guns: 1, my: 10.01,
              lift: [[2.97, 3.02, -0.008], [3.01, 3.03, 0.027], [3.02, -3.02, 0.044],
                [-3.03, -3.01, 0.027], [-3.02, -2.97, -0.008]],
              mask: [[1.87, 1.92, 1.048], [1.91, 1.99, 0.96], [1.98, 2.06, 0.699],
                [2.05, 2.07, 0.35], [2.06, 2.18, 0.262], [2.17, 2.2, 0.123], [2.19, 2.23, -0.008],
                [2.22, 2.32, 0.009], [2.31, 2.35, 0.027], [2.34, 2.37, 0.044], [2.36, 2.4, 0.105],
                [2.39, 2.46, 0.123], [2.45, 2.49, 0.35], [2.48, 2.56, 0.611], [2.55, 2.75, 0.786],
                [2.74, 2.81, 0.873], [2.8, 2.82, 0.786], [2.81, 3.09, 0.524], [3.08, 3.1, 0.437],
                [3.09, 3.12, 0.21], [3.11, -3.09, 0.088], [-3.1, -3.04, 0.044],
                [-3.05, -3.02, 0.027], [-3.03, -2.99, -0.008], [-0.21, -0.11, -0.008],
                [-0.12, -0.06, 0.009], [-0.07, 0.17, 0.175], [0.16, 0.33, 0.524],
                [0.32, 0.42, 0.786], [0.41, 0.57, 0.873], [0.56, 0.71, 1.048], [0.7, 0.89, 0.873],
                [0.88, 0.94, 0.21], [0.93, 0.99, 1.397], [0.98, 1.06, 1.048], [1.05, 1.11, 1.397],
                [1.1, 1.13, 1.222], [1.12, 1.2, 1.048], [1.19, 1.27, 0.96], [1.26, 1.32, 1.048]] },
            { x: 8.9, z: 1.1, angle: 1.76, arc: 2.82, rest: Math.PI / 2, guns: 1, my: 9.99,
              lift: [[-0.17, -0.13, 0.009], [-0.14, 0.14, 0.044], [0.13, 0.17, 0.009]],
              mask: [[-1.08, -0.96, 1.048], [-0.97, -0.95, 0.96], [-0.96, -0.89, 1.397],
                [-0.9, -0.88, 0.873], [-0.89, -0.86, 0.96], [-0.87, -0.77, 1.397],
                [-0.78, -0.74, 0.873], [-0.75, -0.65, 0.786], [-0.66, -0.63, 0.873],
                [-0.64, -0.6, 0.96], [-0.61, -0.53, 1.048], [-0.54, -0.49, 0.873],
                [-0.5, -0.3, 0.786], [-0.31, -0.28, 0.699], [-0.29, -0.25, 0.524],
                [-0.26, -0.16, 0.437], [-0.17, -0.14, 0.262], [-0.15, -0.04, 0.175],
                [-0.05, 0.05, 0.14], [0.04, 0.12, 0.044], [0.11, 0.15, 0.009], [3.02, 3.09, 0.009],
                [3.08, 3.1, 0.027], [3.09, -3.11, 0.088], [-3.12, -3.09, 0.105],
                [-3.1, -3.08, 0.524], [-3.09, -3.02, 0.611], [-3.03, -2.83, 0.699],
                [-2.84, -2.78, 0.786], [-2.79, -2.73, 0.873], [-2.74, -2.67, 0.786],
                [-2.68, -2.5, 0.873], [-2.51, -2.46, 0.786], [-2.47, -2.33, 0.699],
                [-2.34, -2.31, 0.611], [-2.32, -2.27, 0.35], [-2.28, -2.26, 0.105],
                [-2.27, -2.12, 0.009], [-2.13, -2.08, -0.008], [-2.09, -2.03, 0.262],
                [-2.04, -1.89, 0.35], [-1.9, -1.8, 0.699], [-1.81, -1.77, 0.96],
                [-1.78, -1.68, 1.048]] },
            { x: -8.9, z: 1.1, angle: -1.76, arc: 2.82, rest: -Math.PI / 2, guns: 1, my: 10.01,
              lift: [[-0.17, -0.13, 0.009], [-0.14, 0.14, 0.044], [0.13, 0.17, 0.009]],
              mask: [[1.68, 1.78, 1.048], [1.77, 1.81, 0.96], [1.8, 1.9, 0.699], [1.89, 2.04, 0.35],
                [2.03, 2.09, 0.262], [2.08, 2.13, -0.008], [2.12, 2.27, 0.009], [2.26, 2.28, 0.105],
                [2.27, 2.32, 0.35], [2.31, 2.34, 0.611], [2.33, 2.47, 0.699], [2.46, 2.51, 0.786],
                [2.5, 2.68, 0.873], [2.67, 2.74, 0.786], [2.73, 2.79, 0.873], [2.78, 2.84, 0.786],
                [2.83, 3.03, 0.699], [3.02, 3.09, 0.611], [3.08, 3.1, 0.524], [3.09, 3.12, 0.105],
                [3.11, -3.09, 0.088], [-3.1, -3.08, 0.027], [-3.09, -3.02, 0.009],
                [-0.15, -0.11, 0.009], [-0.12, -0.04, 0.044], [-0.05, 0.05, 0.14],
                [0.04, 0.15, 0.175], [0.14, 0.17, 0.262], [0.16, 0.26, 0.437], [0.25, 0.29, 0.524],
                [0.28, 0.31, 0.699], [0.3, 0.5, 0.786], [0.49, 0.54, 0.873], [0.53, 0.61, 1.048],
                [0.6, 0.64, 0.96], [0.63, 0.66, 0.873], [0.65, 0.75, 0.786], [0.74, 0.78, 0.873],
                [0.77, 0.87, 1.397], [0.86, 0.89, 0.96], [0.88, 0.9, 0.873], [0.89, 0.96, 1.397],
                [0.95, 0.97, 0.96], [0.96, 1.08, 1.048]] },
            { x: 8.9, z: -10.35, angle: 1.2, arc: 2.87, rest: Math.PI / 2, guns: 1, my: 9.94,
              lift: [[2.94, 2.98, -0.008], [2.97, 3, 0.027], [2.99, -2.99, 0.044],
                [-3, -2.97, 0.027], [-2.98, -2.94, -0.008]],
              mask: [[-1.69, -1.64, 1.048], [-1.65, -1.63, 0.175], [-1.64, -1.61, 0.009],
                [-1.62, -1.59, -0.008], [-1.6, -1.54, 0.009], [-1.55, -1.49, -0.008],
                [-1.34, -1.31, 0.262], [-1.32, -1.1, 0.35], [-1.11, -1.05, 0.262],
                [-1.06, -1.03, 0.123], [-1.04, -0.86, 0.009], [-0.87, -0.84, -0.008],
                [-0.85, -0.82, 0.437], [-0.83, -0.72, 0.699], [-0.73, -0.56, 0.96],
                [-0.57, -0.51, 1.048], [-0.52, -0.47, 0.873], [-0.48, -0.39, 1.048],
                [-0.4, -0.28, 0.786], [-0.29, -0.09, 0.699], [-0.1, -0.06, 0.611],
                [-0.07, -0.04, 0.524], [-0.05, -0.02, 0.105], [-0.03, 0.05, 0.088],
                [0.04, 0.07, 0.009], [0.06, 0.12, -0.008], [2.74, 3, 0.009], [2.99, 3.02, 0.027],
                [3.01, 3.09, 0.044], [3.08, -3.02, 0.175], [-3.03, -3.01, 0.21],
                [-3.02, -2.87, 0.262], [-2.88, -2.83, 0.35], [-2.84, -2.81, 0.437],
                [-2.82, -2.78, 0.524], [-2.79, -2.71, 0.611], [-2.72, -2.67, 0.786],
                [-2.68, -2.59, 0.873], [-2.6, -2.53, 0.96], [-2.54, -2.46, 1.048],
                [-2.47, -2.38, 1.222], [-2.39, -2.34, 1.048], [-2.35, -2.26, 0.96],
                [-2.27, -2.19, 1.048]] },
            { x: -8.9, z: -10.35, angle: -1.2, arc: 2.87, rest: -Math.PI / 2, guns: 1, my: 9.94,
              lift: [[2.94, 2.98, -0.008], [2.97, 3, 0.027], [2.99, -2.99, 0.044],
                [-3, -2.97, 0.027], [-2.98, -2.94, -0.008]],
              mask: [[2.19, 2.27, 1.048], [2.26, 2.35, 0.96], [2.34, 2.39, 1.048],
                [2.38, 2.47, 1.222], [2.46, 2.54, 1.048], [2.53, 2.6, 0.96], [2.59, 2.68, 0.873],
                [2.67, 2.72, 0.786], [2.71, 2.79, 0.611], [2.78, 2.82, 0.524], [2.81, 2.84, 0.437],
                [2.83, 2.88, 0.35], [2.87, 3.02, 0.262], [3.01, 3.03, 0.21], [3.02, -3.08, 0.175],
                [-3.09, -3.01, 0.044], [-3.02, -2.99, 0.027], [-3, -2.74, 0.009],
                [-0.12, -0.06, -0.008], [-0.07, -0.04, 0.009], [-0.05, 0.03, 0.088],
                [0.02, 0.05, 0.105], [0.04, 0.07, 0.524], [0.06, 0.1, 0.611], [0.09, 0.29, 0.699],
                [0.28, 0.4, 0.786], [0.39, 0.48, 1.048], [0.47, 0.52, 0.873], [0.51, 0.57, 1.048],
                [0.56, 0.73, 0.96], [0.72, 0.83, 0.699], [0.82, 0.85, 0.437], [0.84, 0.87, -0.008],
                [0.86, 1.04, 0.009], [1.03, 1.06, 0.123], [1.05, 1.11, 0.262], [1.1, 1.32, 0.35],
                [1.31, 1.34, 0.262], [1.49, 1.55, -0.008], [1.54, 1.6, 0.009], [1.59, 1.62, -0.008],
                [1.61, 1.64, 0.009], [1.63, 1.65, 0.175], [1.64, 1.69, 1.048]] },
            { x: 8.9, z: -11.75, angle: 1.28, arc: 2.78, rest: Math.PI / 2, guns: 1, my: 9.94,
              lift: [[-0.21, -0.16, 0.009], [-0.17, -0.14, 0.027], [-0.15, 0.15, 0.07],
                [0.14, 0.17, 0.027], [0.16, 0.21, 0.009], [2.62, 2.65, 0.009], [2.64, 2.67, 0.027],
                [2.66, 2.72, 0.044], [2.71, -2.41, 0.07], [-2.42, -2.36, 0.044],
                [-2.37, -2.34, 0.027]],
              mask: [[-1.51, -1.47, 0.21], [-1.48, -1.45, 0.009], [-1.46, -1.4, -0.008],
                [-1.29, -1.26, -0.026], [-1.27, -1.19, 0.262], [-1.2, -1.03, 0.35],
                [-1.04, -0.96, 0.262], [-0.97, -0.95, 0.027], [-0.96, -0.75, 0.009],
                [-0.76, -0.74, 0.088], [-0.75, -0.67, 0.611], [-0.68, -0.65, 0.699],
                [-0.66, -0.46, 0.873], [-0.47, -0.42, 0.786], [-0.43, -0.37, 1.048],
                [-0.38, -0.35, 0.96], [-0.36, -0.27, 0.786], [-0.28, -0.21, 0.611],
                [-0.22, -0.04, 0.524], [-0.05, 0.05, 0.088], [0.04, 0.14, 0.07],
                [0.13, 0.15, 0.027], [0.14, 0.19, 0.009], [2.57, 2.61, 0.009], [2.6, 2.68, 0.027],
                [2.67, 2.74, 0.044], [2.73, 3.07, 0.07], [3.06, 3.09, 0.123], [3.08, 3.14, 0.175],
                [3.13, -3.13, 0.21], [-3.14, -2.97, 0.262], [-2.98, -2.88, 0.35],
                [-2.89, -2.76, 0.437], [-2.77, -2.74, 0.611], [-2.75, -2.66, 0.699],
                [-2.67, -2.59, 0.786], [-2.6, -2.55, 0.873], [-2.56, -2.45, 0.96],
                [-2.46, -2.26, 1.222], [-2.27, -2.2, 1.048]] },
            { x: -8.9, z: -11.75, angle: -1.28, arc: 2.78, rest: -Math.PI / 2, guns: 1, my: 9.92,
              lift: [[2.34, 2.37, 0.027], [2.36, 2.42, 0.044], [2.41, -2.71, 0.07],
                [-2.72, -2.66, 0.044], [-2.67, -2.64, 0.027], [-2.65, -2.62, 0.009],
                [-0.21, -0.16, 0.009], [-0.17, -0.14, 0.027], [-0.15, 0.15, 0.07],
                [0.14, 0.17, 0.027], [0.16, 0.21, 0.009]],
              mask: [[2.2, 2.27, 1.048], [2.26, 2.46, 1.222], [2.45, 2.56, 0.96],
                [2.55, 2.6, 0.873], [2.59, 2.67, 0.786], [2.66, 2.75, 0.699], [2.74, 2.77, 0.611],
                [2.76, 2.89, 0.437], [2.88, 2.98, 0.35], [2.97, 3.14, 0.262], [3.13, -3.13, 0.21],
                [-3.14, -3.08, 0.175], [-3.09, -3.06, 0.123], [-3.07, -2.73, 0.07],
                [-2.74, -2.67, 0.044], [-2.68, -2.6, 0.027], [-2.61, -2.57, 0.009],
                [-0.19, -0.14, 0.009], [-0.15, -0.13, 0.027], [-0.14, -0.04, 0.07],
                [-0.05, 0.05, 0.088], [0.04, 0.22, 0.524], [0.21, 0.28, 0.611], [0.27, 0.36, 0.786],
                [0.35, 0.38, 0.96], [0.37, 0.43, 1.048], [0.42, 0.47, 0.786], [0.46, 0.66, 0.873],
                [0.65, 0.68, 0.699], [0.67, 0.75, 0.611], [0.74, 0.76, 0.088], [0.75, 0.96, 0.009],
                [0.95, 0.97, 0.027], [0.96, 1.04, 0.262], [1.03, 1.2, 0.35], [1.19, 1.27, 0.262],
                [1.26, 1.29, -0.026], [1.4, 1.46, -0.008], [1.45, 1.48, 0.009], [1.47, 1.51, 0.21]] },
            { x: 8.9, z: -22.4, angle: 1.58, arc: 3.09, rest: Math.PI / 2, guns: 1, my: 9.94,
              lift: [[2.94, 2.98, -0.008], [2.97, 3, 0.027], [2.99, -2.99, 0.044],
                [-3, -2.97, 0.027], [-2.98, -2.94, -0.008]],
              mask: [[-1.53, -1.49, 0.524], [-1.5, -1.43, 0.873], [-1.44, -1.42, 0.786],
                [-1.43, -1.23, 0.35], [-1.24, -1.21, 0.262], [-1.22, -1.16, 0.35],
                [-1.17, -1.09, 0.524], [-1.1, -1.03, 0.611], [-1.04, -1.02, 0.524],
                [-1.03, -0.95, 1.222], [-0.96, -0.68, 1.048], [-0.69, -0.63, 0.96],
                [-0.64, -0.53, 0.873], [-0.54, -0.47, 0.786], [-0.48, -0.32, 0.699],
                [-0.33, -0.23, 0.786], [-0.24, -0.2, 0.611], [-0.21, -0.18, 0.437],
                [-0.19, -0.09, 0.35], [-0.1, 0, 0.21], [-0.01, 0.01, 0.105], [0, 0.03, 0.07],
                [0.02, 0.28, 0.009], [2.92, 3.09, 0.699], [3.08, -2.5, 0.786],
                [-2.51, -2.24, 0.699], [-2.25, -2.12, 0.786], [-2.13, -1.59, 1.048]] },
            { x: -8.9, z: -22.4, angle: -2.16, arc: 3.09, rest: -Math.PI / 2, guns: 1, my: 9.94,
              lift: [[2.94, 2.98, -0.008], [2.97, 3, 0.027], [2.99, -2.99, 0.044],
                [-3, -2.97, 0.027], [-2.98, -2.94, -0.008]],
              mask: [[1.02, 1.04, 0.524], [1.03, 1.1, 0.611], [1.09, 1.17, 0.524],
                [1.16, 1.22, 0.35], [1.21, 1.24, 0.262], [1.23, 1.43, 0.35], [1.42, 1.44, 0.786],
                [1.43, 1.5, 0.873], [1.49, 1.51, 0.524], [1.5, 1.53, 0.873], [1.52, 1.6, 1.222],
                [1.59, 2.13, 1.048], [2.12, 2.25, 0.786], [2.24, 2.51, 0.699], [2.5, -3.08, 0.786],
                [-3.09, -2.92, 0.699], [-0.28, -0.02, 0.009], [-0.03, 0, 0.07],
                [-0.01, 0.01, 0.105], [0, 0.1, 0.21], [0.09, 0.19, 0.35], [0.18, 0.21, 0.437],
                [0.2, 0.24, 0.611], [0.23, 0.33, 0.786], [0.32, 0.48, 0.699], [0.47, 0.54, 0.786],
                [0.53, 0.64, 0.873], [0.63, 0.69, 0.96], [0.68, 0.96, 1.048]] },
            { x: 8.9, z: -23.8, angle: 0.38, arc: 2.39, rest: Math.PI / 2, guns: 1, my: 9.94,
              lift: [[-0.21, -0.16, -0.008], [-0.17, -0.14, 0.027], [-0.15, 0.15, 0.044],
                [0.14, 0.17, 0.027], [0.16, 0.21, -0.008]],
              mask: [[-2.04, -1.99, 0.873], [-2, -1.87, 1.048], [-1.88, -1.77, 1.222],
                [-1.78, -1.68, 1.048], [-1.69, -1.61, 0.96], [-1.62, -1.26, 1.048],
                [-1.27, -1.05, 0.35], [-1.06, -0.98, 0.437], [-0.99, -0.93, 0.524],
                [-0.94, -0.91, 0.437], [-0.92, -0.68, 1.048], [-0.69, -0.6, 0.96],
                [-0.61, -0.42, 0.786], [-0.43, -0.32, 0.611], [-0.33, -0.27, 0.96],
                [-0.28, -0.23, 0.786], [-0.24, -0.21, 0.611], [-0.22, -0.2, 0.524],
                [-0.21, -0.18, 0.437], [-0.19, -0.07, 0.35], [-0.08, -0.04, 0.21],
                [-0.05, 0, 0.175], [-0.01, 0.01, 0.088], [0, 0.03, 0.07], [0.02, 0.14, 0.044],
                [0.13, 0.15, 0.027], [0.14, 0.24, 0.009]] },
            { x: -8.9, z: -23.8, angle: -0.38, arc: 2.39, rest: -Math.PI / 2, guns: 1, my: 9.94,
              lift: [[-0.21, -0.16, -0.008], [-0.17, -0.14, 0.027], [-0.15, 0.15, 0.044],
                [0.14, 0.17, 0.027], [0.16, 0.21, -0.008]],
              mask: [[-0.24, -0.14, 0.009], [-0.15, -0.13, 0.027], [-0.14, -0.02, 0.044],
                [-0.03, 0, 0.07], [-0.01, 0.01, 0.088], [0, 0.05, 0.175], [0.04, 0.08, 0.21],
                [0.07, 0.19, 0.35], [0.18, 0.21, 0.437], [0.2, 0.22, 0.524], [0.21, 0.24, 0.611],
                [0.23, 0.28, 0.786], [0.27, 0.33, 0.96], [0.32, 0.43, 0.611], [0.42, 0.61, 0.786],
                [0.6, 0.69, 0.96], [0.68, 0.92, 1.048], [0.91, 0.94, 0.437], [0.93, 0.99, 0.524],
                [0.98, 1.06, 0.437], [1.05, 1.27, 0.35], [1.26, 1.62, 1.048], [1.61, 1.69, 0.96],
                [1.68, 1.78, 1.048], [1.77, 1.88, 1.222], [1.87, 2, 1.048], [1.99, 2.04, 0.873]] },
          ] },
      ],
    },
    // Her Kingfishers, off the two catapults on her fantail. Hers point aft
    // and train out over her quarters, and a scout goes off the quarter the
    // catapult is on; otherwise the evolution is the Cleveland's.
    planes: {
      squadrons: 2, perSquadron: 2, cruiseSpeed: 58, strikeRange: 9000,
      rearm: 95, hp: 640, dropSpread: 0.06,
      torpDamage: 0, torpSpeed: 0, torpRange: 0, floodChance: 0,
      bombDamage: 900, bombHit: 0.32, bombFire: 0.1, bombPen: 25, bombBore: 0.2,
      type: 'kingfisher',
      catapult: true, deckRun: 8.6, deckCycle: 30,
      // Where the shot leaves her, off the integrated shot from her own
      // girders: trained out over her quarter, a hundred and eighty metres
      // out and well abaft the beam, twenty-three metres up.
      runHeight: 23,
      runOut: 184, runBearing: 2.33,
      flight: { fighters: 0, dive: 2, torpedo: 0 },
    },
    datasheet: {
      displacement: 14472,
      aircraft: 4,
      mainRounds: 1200,
      secondary: { caliber: 127, label: '5"', barrels: 12, rounds: 6000 },
      tertiary: [
        { caliber: 40, label: '40mm', barrels: 48, rounds: 57600 },
        { caliber: 20, label: '20mm', barrels: 12, rounds: 28800 },
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
    // Two hundred and seventy-six metres on the waterline she is drawn to.
    //
    // Shinano's length overall is 265.8 m. She is drawn a little over it, for
    // the reason her own sister is drawn a great deal over hers: Yamato is the
    // same hull and this game draws her at 263 m x 1.55, so at her book length
    // Shinano came out two-thirds the size of the ship she was built from. Ten
    // metres does not close that, but it takes the worst of it out and it is
    // what makes her read as the long fine-ended hull she was rather than a
    // flight deck on a barge.
    hull: { length: 276, beam: 36.3, draft: 10.3, superstructure: 0.6, flightDeck: true },
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
    // Two at each corner, which is how her sixteen barrels were arranged, and
    // every one of them well outboard of the deck edge. Set any closer in and
    // two metres of the shield stands under the flight deck -- and for a
    // mounting whose muzzles are level with the deck, that is a gun through
    // her runway.
    turrets: [
      { id: 0, name: 'S1', x: -19.1, z: 95, angle: -Math.PI / 2, arc: 0.61, guns: 2, my: 19.35 },
      { id: 1, name: 'S2', x: -20.1, z: 77, angle: -Math.PI / 2, arc: 0.61, guns: 2, my: 19.35 },
      { id: 2, name: 'S3', x: -20.5, z: -77, angle: -Math.PI / 2, arc: 0.61, guns: 2, my: 19.35 },
      { id: 3, name: 'S4', x: -19.6, z: -95, angle: -Math.PI / 2, arc: 0.61, guns: 2, my: 19.35 },
      { id: 4, name: 'P1', x: 19.1, z: 95, angle: Math.PI / 2, arc: 0.61, guns: 2, my: 19.35 },
      { id: 5, name: 'P2', x: 20.1, z: 77, angle: Math.PI / 2, arc: 0.61, guns: 2, my: 19.35 },
      { id: 6, name: 'P3', x: 20.5, z: -77, angle: Math.PI / 2, arc: 0.61, guns: 2, my: 19.35 },
      { id: 7, name: 'P4', x: 19.6, z: -95, angle: Math.PI / 2, arc: 0.61, guns: 2, my: 19.35 },
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
          //
          // Every one of the deck-edge mountings stands at the edge of the
          // flight deck at its own station, and not one of them stands on the
          // deck itself. Shinano carried no gun anywhere on her runway: a tub
          // in the middle of a flight deck is a tub an aeroplane taxis into.
          // They are sponsons scalloped into her deck edge, the pair right
          // forward and the pair right aft included, and their stations are
          // laid clear of the eight 12.7 cm sponsons above.
          mounts: [
            { x: -15.7, z: 115, angle: -1.3, arc: 1.92, guns: 3 },
            { x: 15.7, z: 115, angle: 1.3, arc: 1.92, guns: 3 },
            { x: -20, z: 68, angle: -1.45, arc: 1.92, guns: 3 },
            { x: 20, z: 68, angle: 1.45, arc: 1.92, guns: 3 },
            { x: -20.2, z: 60, angle: -1.45, arc: 1.92, guns: 3 },
            { x: 20.2, z: 60, angle: 1.45, arc: 1.92, guns: 3 },
            { x: -20.3, z: 43, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.3, z: 43, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.3, z: 34, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.3, z: 34, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.3, z: 26, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.3, z: 26, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.3, z: 17, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.3, z: 17, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.3, z: 0, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.3, z: 0, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.3, z: -9, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.3, z: -9, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.3, z: -17, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.3, z: -17, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.3, z: -26, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.3, z: -26, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.3, z: -43, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.3, z: -43, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.3, z: -51, angle: -1.57, arc: 1.92, guns: 3 },
            { x: 20.3, z: -51, angle: 1.57, arc: 1.92, guns: 3 },
            { x: -20.3, z: -60, angle: -1.68, arc: 1.92, guns: 3 },
            { x: 20.3, z: -60, angle: 1.68, arc: 1.92, guns: 3 },
            { x: -20.3, z: -68, angle: -1.68, arc: 1.92, guns: 3 },
            { x: 20.3, z: -68, angle: 1.68, arc: 1.92, guns: 3 },
            { x: -16.4, z: -120, angle: -1.85, arc: 1.92, guns: 3 },
            { x: 16.4, z: -120, angle: 1.85, arc: 1.92, guns: 3 },
            // The three on the island's own galleries. `where` says so,
            // because their stations are inboard of the deck edge and nothing
            // about the numbers alone tells a gun on the island from a gun on
            // the deck beside it -- and put at the deck edge they end up inside
            // the island, which is where these three were.
            { x: -19.4, z: 27, angle: -0.80, arc: 1.92, guns: 3, where: 'island' },
            { x: -19.4, z: 9, angle: -2.40, arc: 1.92, guns: 3, where: 'island' },
            { x: -10.0, z: 19, angle: -1.20, arc: 1.92, guns: 3, where: 'island' },
          ] },
        // And the twelve 12 cm rocket launchers: twenty-eight tubes apiece,
        // throwing a barrage of incendiary rockets up in front of an attacking
        // formation. Loud, spectacular, and by every account it hit almost
        // nothing.
        { name: '12 cm AA rocket', caliber: 120, role: 'aa', reload: 3.2, range: 3000,
          mounts: [
            { x: -17.8, z: 104, angle: -1.35, arc: 1.75, guns: 28 },
            { x: 17.8, z: 104, angle: 1.35, arc: 1.75, guns: 28 },
            { x: -20.2, z: 51, angle: -1.57, arc: 1.75, guns: 28 },
            { x: 20.2, z: 51, angle: 1.57, arc: 1.75, guns: 28 },
            { x: -20.3, z: 9, angle: -1.57, arc: 1.75, guns: 28 },
            { x: 20.3, z: 9, angle: 1.57, arc: 1.75, guns: 28 },
            { x: -20.3, z: -34, angle: -1.57, arc: 1.75, guns: 28 },
            { x: 20.3, z: -34, angle: 1.57, arc: 1.75, guns: 28 },
            { x: -18.5, z: -104, angle: -1.78, arc: 1.75, guns: 28 },
            { x: 18.5, z: -104, angle: 1.78, arc: 1.75, guns: 28 },
            // These two stand on the island's casing, forward of the bridge
            // and abaft the funnel.
            { x: -17.6, z: 33, angle: -0.60, arc: 1.75, guns: 28, where: 'island' },
            { x: -17.6, z: 2, angle: -2.50, arc: 1.75, guns: 28, where: 'island' },
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
            { x: 9.3, z: 113, angle: 0.00, arc: 2.09, guns: 4 },
            { x: -9.3, z: 113, angle: 0.00, arc: 2.09, guns: 4 },
            { x: 11.8, z: 99, angle: 0.00, arc: 2.09, guns: 4 },
            { x: -11.8, z: 99, angle: 0.00, arc: 2.09, guns: 4 },
            { x: -14.8, z: -3, angle: 3.14, arc: 2.09, guns: 4 },
            { x: -14.8, z: -16, angle: 3.14, arc: 2.09, guns: 4 },
            { x: -12.4, z: -100, angle: 3.14, arc: 2.09, guns: 4 },
            { x: 12, z: -104, angle: 3.14, arc: 2.09, guns: 4 },
          ] },
        // Forty-four Oerlikons in twenty-two positions, two guns to a
        // position: four positions in the island's own galleries and the rest
        // down both catwalks, wherever the sponsons and the forty-millimetre
        // tubs leave room. The two sides do not match, and on a Yorktown they
        // did not -- the island takes the room out of the starboard catwalk.
        { name: '20mm Oerlikon', caliber: 20, role: 'aa', reload: 0.1, range: 1800,
          mounts: [
            { x: 12.6, z: 86, angle: 1.50, arc: 1.92, guns: 2 },
            { x: -13.6, z: 69, angle: -1.50, arc: 1.92, guns: 2 },
            { x: -14.1, z: 53, angle: -1.50, arc: 1.92, guns: 2 },
            { x: 14.1, z: 53, angle: 1.50, arc: 1.92, guns: 2 },
            { x: -14.3, z: 36, angle: -1.50, arc: 1.92, guns: 2 },
            { x: 14.3, z: 36, angle: 1.50, arc: 1.92, guns: 2 },
            { x: -13.8, z: 22.4, angle: -1.45, arc: 1.92, guns: 2 },
            { x: -14.3, z: 20, angle: -1.50, arc: 1.92, guns: 2 },
            { x: 14.3, z: 20, angle: 1.50, arc: 1.92, guns: 2 },
            { x: -13.8, z: 12.3, angle: -1.45, arc: 1.92, guns: 2 },
            { x: -13.8, z: 5.9, angle: -1.45, arc: 1.92, guns: 2 },
            { x: 14.3, z: 3, angle: 1.50, arc: 1.92, guns: 2 },
            { x: 14.3, z: -13, angle: 1.50, arc: 1.92, guns: 2 },
            { x: -14.3, z: -30, angle: -1.50, arc: 1.92, guns: 2 },
            { x: 14.3, z: -30, angle: 1.50, arc: 1.92, guns: 2 },
            { x: -14.3, z: -46, angle: -1.50, arc: 1.92, guns: 2 },
            { x: 14.3, z: -46, angle: 1.50, arc: 1.92, guns: 2 },
            { x: 13.9, z: -63, angle: 1.50, arc: 1.92, guns: 2 },
            { x: -13.2, z: -79, angle: -1.50, arc: 1.92, guns: 2 },
            { x: -12.6, z: -91, angle: -1.50, arc: 1.92, guns: 2 },
            { x: 12.2, z: -96, angle: 1.50, arc: 1.92, guns: 2 },
            { x: -10.7, z: -112, angle: -1.50, arc: 1.92, guns: 2 },
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
        { caliber: 20, label: '20mm', barrels: 44, rounds: 105600 },
      ],
    },
  },
};

export const SHIP_ORDER = ['fletcher', 'cleveland', 'hipper', 'spee', 'takao', 'baltimore', 'u48',
  'surcouf', 'rodney', 'massachusetts', 'iowa', 'yamato', 'musashi', 'enterprise', 'shinano'];

export function getClass(id) {
  return SHIP_CLASSES[id] || SHIP_CLASSES.fletcher;
}

/** Total number of barrels that can bear, used for the UI salvo readout. */
export function totalGuns(cls) {
  return cls.turrets.reduce((n, t) => n + t.guns, 0);
}

export const SHELL_TYPES = { AP, HE };
