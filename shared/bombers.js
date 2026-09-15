// The heavy squadrons: the bombers a side can call on, and what they carry.
//
// These are the aircraft nobody flies off a deck. A carrier's group is chosen
// in the yard by role -- so many fighters, so many dive bombers -- because a
// hangar holds a mixture and the captain is balancing it. A bomber squadron is
// not balanced against anything: it is ordered by type, one type at a time,
// and what a commander is choosing is which machine goes over the target.
//
// So they are commissioned the way hulls and coast batteries are, off a screen
// of their own with the aeroplane in the middle of it, and the figures here
// are the ones that screen reads out. They are the real ones: span, length,
// what she weighed loaded, what she did flat out, what armour her crew had
// behind them, what she carried and what she carried it in.
//
// It sits beside ships.js and batteries.js because it is the same kind of
// thing -- a catalogue written down once, read by whatever needs it.

/** The order the bomber yard steps through them. The Lancaster leads. */
export const BOMBER_ORDER = [
  'lancaster', 'fortress', 'heinkel', 'junkers', 'betty',
];

/** How many squadrons one side may have on call. */
export const BOMBER_MAX = 8;

/**
 * @typedef {object} Bomber
 * @property {string} name      what she is called, short
 * @property {string} fullName  her service designation in full
 * @property {string} role      what she was built to do
 * @property {string} nation    whose roundel she wears
 * @property {number} crew      men aboard
 * @property {number} span      metres, wingtip to wingtip
 * @property {number} length    metres
 * @property {number} weight    tonnes, loaded
 * @property {number} empty     tonnes, empty
 * @property {number} speed     mph, maximum
 * @property {number} cruise    mph, cruising
 * @property {number} ceiling   feet, service
 * @property {number} reach     miles, with a normal load
 * @property {number} armour    millimetres of crew armour
 * @property {string} engines   what turns her airscrews
 * @property {number} payload   pounds of bombs, normal maximum
 * @property {string} load      how that load was usually made up
 * @property {number} turrets   powered turrets aboard
 * @property {string} stations  where those turrets are
 * @property {number} guns      barrels, all told
 * @property {string} calibre   what those barrels are
 * @property {string} arcs      how far each mounting trains, in degrees
 * @property {string} blurb     one line, for the roster
 */

/** @type {Record<string, Bomber>} */
export const BOMBERS = {
  // The one that carried the war to Germany, and the only aeroplane of the war
  // with a bomb bay long enough to take a twelve-thousand-pound bomb without
  // being cut about for it. Thirty-three feet of unobstructed bay is the whole
  // design: everything else about her is arranged round not interrupting it.
  lancaster: {
    name: 'Avro Lancaster',
    fullName: 'Avro Lancaster B.I',
    role: 'Heavy night bomber',
    nation: 'raf',
    crew: 7,
    span: 31.09, length: 21.18,
    weight: 30.8, empty: 16.8,
    speed: 282, cruise: 200,
    ceiling: 21400, reach: 2530,
    armour: 9,
    engines: '4 × Merlin XX, 1,280 hp',
    payload: 14000,
    load: '1 × 4,000 lb cookie + 12 SBC',
    turrets: 3,
    stations: 'Nose, dorsal, tail',
    guns: 8,
    calibre: '.303 in Browning',
    arcs: 'Nose 190°, dorsal 360°, tail 188°',
    blurb: 'Thirty-three feet of bomb bay, and nothing in it.',
  },

  // The other half of the round-the-clock offensive: she flew by day, which is
  // why she is the most heavily gunned aeroplane on this list by a long way.
  // Thirteen fifties, and a chin turret added on the G because the head-on
  // pass was killing the earlier marks.
  fortress: {
    name: 'B-17 Fortress',
    fullName: 'Boeing B-17G Flying Fortress',
    role: 'Heavy day bomber',
    nation: 'usaaf',
    crew: 10,
    span: 31.62, length: 22.66,
    weight: 29.7, empty: 16.4,
    speed: 287, cruise: 182,
    ceiling: 35600, reach: 2000,
    armour: 13,
    engines: '4 × R-1820 Cyclone, 1,200 hp',
    payload: 8000,
    load: '8 × 1,000 lb GP',
    turrets: 4,
    stations: 'Chin, dorsal, ball, tail',
    guns: 13,
    calibre: '.50 in Browning M2',
    arcs: 'Chin 174°, dorsal 360°, ball 360°, tail 90°',
    blurb: 'Thirteen fifties, and she flew in daylight.',
  },

  // The Luftwaffe's medium, and the one that could be hung with torpedoes --
  // which is what makes her worth having over a fleet. That glazed nose with
  // no step in front of the pilot is the one thing about her nobody else had.
  heinkel: {
    name: 'He 111',
    fullName: 'Heinkel He 111 H-6',
    role: 'Medium bomber and torpedo carrier',
    nation: 'luftwaffe',
    crew: 5,
    span: 22.60, length: 16.40,
    weight: 14.0, empty: 8.7,
    speed: 270, cruise: 227,
    ceiling: 21300, reach: 1750,
    armour: 8,
    engines: '2 × Jumo 211F, 1,340 hp',
    payload: 4400,
    load: '2 × LT F5b torpedoes, or 8 × SC 250',
    turrets: 1,
    stations: 'Dorsal',
    guns: 6,
    calibre: '20 mm MG FF, 7.92 mm MG 15',
    arcs: 'Dorsal 200°, nose 80°, gondola 70°',
    blurb: 'A glazed nose with no step, and a torpedo under each wing.',
  },

  // The maid of all work: bomber, dive bomber, night fighter and everything
  // between. Fast enough that the early marks outran the fighters sent up to
  // stop them, and the only machine here with dive brakes under the wing.
  junkers: {
    name: 'Ju 88',
    fullName: 'Junkers Ju 88 A-4',
    role: 'Fast medium bomber',
    nation: 'luftwaffe',
    crew: 4,
    span: 20.08, length: 14.36,
    weight: 14.0, empty: 8.6,
    speed: 317, cruise: 248,
    ceiling: 27900, reach: 1430,
    armour: 8,
    engines: '2 × Jumo 211J, 1,420 hp',
    payload: 6600,
    load: '4 × SC 500 under the wing, 28 × SC 50 within',
    turrets: 0,
    stations: 'Flexible mountings only',
    guns: 5,
    calibre: '13 mm MG 131, 7.92 mm MG 81',
    arcs: 'Dorsal 110°, gondola 70° — hand-held',
    blurb: 'Fast enough that the fighters sent up could not catch her.',
  },

  // The long-legged one. She would fly a thousand miles out, put a torpedo
  // into a battleship and fly a thousand miles home, and she did exactly that
  // to Prince of Wales and Repulse -- with no armour and no sealing in her
  // tanks, which is the other half of her reputation.
  betty: {
    name: 'G4M Betty',
    fullName: 'Mitsubishi G4M1 Model 11',
    role: 'Land-based torpedo bomber',
    nation: 'ijn',
    crew: 7,
    span: 24.89, length: 20.00,
    weight: 9.5, empty: 6.8,
    speed: 266, cruise: 196,
    ceiling: 27890, reach: 3250,
    armour: 0,
    engines: '2 × Kasei 11 radials, 1,530 hp',
    payload: 2200,
    load: '1 × Type 91 torpedo, or 12 × 60 kg',
    turrets: 2,
    stations: 'Dorsal, tail',
    guns: 5,
    calibre: '20 mm Type 99, 7.7 mm Type 92',
    arcs: 'Dorsal 360°, tail 60°',
    blurb: 'Two thousand miles of legs, and not an ounce of armour.',
  },
};

const num = (n) => n.toLocaleString('en-US');

/**
 * What she is, what she weighs and what she will do: the sheet in the lower
 * left of the bomber yard.
 *
 * Weight, speed and armour lead it, because those are the three a commander
 * is actually trading off when he picks one of these over another.
 */
export function airframeSheet(b) {
  return [
    ['Weight', `${b.weight.toFixed(1)} t loaded`],
    ['Speed', `${num(b.speed)} mph`],
    ['Armour', b.armour ? `${b.armour} mm crew` : 'None fitted'],
    ['Ceiling', `${num(b.ceiling)} ft`],
    ['Range', `${num(b.reach)} miles`],
    ['Crew', `${b.crew} men`],
    ['Engines', b.engines],
  ];
}

/**
 * What she carries and what she defends herself with: the sheet in the lower
 * right. Payload, then the turrets, then what is in them.
 */
export function payloadSheet(b) {
  return [
    ['Payload', `${num(b.payload)} lb`],
    ['Bomb load', b.load],
    ['Turrets', b.turrets ? `${b.turrets} powered` : 'None'],
    ['Stations', b.stations],
    ['Guns', `${b.guns} barrels`],
    ['Calibre', b.calibre],
    // How far each mounting trains. It is the figure that decides where a
    // fighter attacks from: a Fortress was taken from dead astern because the
    // Cheyenne in her tail had ninety degrees and nothing either side of it.
    ['Arcs', b.arcs],
  ];
}
