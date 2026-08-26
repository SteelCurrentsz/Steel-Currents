// Coast artillery: the guns that were bolted to the ground.
//
// Every one of these existed and most of them are still standing, so the
// figures are the real ones — bore, barrel length, range, rate of fire, what
// the mounting weighed and what shield or turret armour the crew had. Where a
// battery had several guns the entry describes one gun of it, because one gun
// is what a captain is looking at on the selection screen.
//
// Only the client reads this today: emplacements are chosen and counted on the
// briefing, and the simulation does not yet put them on the battlefield. It
// sits beside ships.js because it is the same kind of thing — ordnance data,
// written down once, read by whatever needs it.

/** The order they are stepped through, roughly by bore. */
export const BATTERY_ORDER = [
  'flak88', 'merville', 'longues', 'oscarsborg', 'drum',
  'todt', 'townsley', 'gustav',
];

/**
 * @typedef {object} Battery
 * @property {string} name        what it is called
 * @property {string} place       where it stands
 * @property {string} piece       the gun itself, by its service designation
 * @property {number} caliber     bore in millimetres
 * @property {string} bore        bore as its own service wrote it
 * @property {number} barrels     barrels in this emplacement
 * @property {number} calibers    barrel length in calibres, so L/50 is 50
 * @property {string} mount       what the gun itself stands on
 * @property {string} targets     aircraft | ships | dual, what it can engage
 * @property {number} armour      millimetres of shield or turret armour, 0 if none
 * @property {number} weight      tonnes, gun and mounting
 * @property {number} reload      seconds between rounds
 * @property {number} range       metres, maximum
 * @property {number} [ceiling]   metres, for a gun that shot upward
 * @property {number} crew        men to fight it
 * @property {number} span        metres across the whole emplacement, for the camera
 */

/** @type {Record<string, Battery>} */
export const BATTERIES = {
  // Eight-eight. The one gun on this list that was meant to be moved, and the
  // one that shot at aircraft — which is also why it fired ten times faster
  // than anything else here.
  flak88: {
    name: '88mm Flak Battery',
    place: 'Atlantic Wall · Kriegsmarine and Luftwaffe',
    piece: '8.8 cm Flak 36',
    caliber: 88, bore: '88 mm', barrels: 1,
    calibers: 56,
    // Dual-purpose — it was built to shoot at aircraft and turned out to be
  // the best anti-armour and anti-shipping gun on the wall as well.
    targets: 'dual',
    mount: 'Cruciform platform',
    armour: 10,
    weight: 5.2, reload: 4, range: 14860, ceiling: 8000,
    crew: 10, span: 10,
  },
  // The Merville guns were not the coastal battery the invasion planners
  // feared: four Czech field howitzers, taken in 1939 and left in casemates
  // built for something heavier.
  merville: {
    name: 'Merville Gun Battery',
    place: 'Merville-Franceville, Normandy',
    piece: '10 cm leFH 14/19(t)',
    caliber: 100, bore: '100 mm', barrels: 1,
    calibers: 19,
    // A field howitzer laid on the beaches and the ships off them. No
  // anti-aircraft laying gear and nothing like the ceiling for it.
    targets: 'ships',
    mount: 'Split-trail carriage',
    armour: 4,
    weight: 1.5, reload: 7.5, range: 9970,
    crew: 6, span: 7,
  },
  // Four naval 15 cm in H612 casemates on the cliff above Gold and Omaha, and
  // the only Normandy battery that still has its guns in place.
  longues: {
    name: 'Longues-sur-Mer Battery',
    place: 'Longues-sur-Mer, Normandy',
    piece: '15 cm Tbts KC/36',
    caliber: 150, bore: '150 mm', barrels: 1,
    calibers: 48,
    // A naval low-angle gun in a casemate. Ships, and nothing else.
    targets: 'ships',
    mount: 'Naval pedestal',
    armour: 30,
    weight: 16, reload: 10, range: 19500,
    crew: 8, span: 13,
  },
  // Krupp guns of 1900, in open emplacements cut into the rock of an island in
  // the Drobak Narrows. Two of them sank the Blucher at six hundred yards on
  // the morning of 9 April 1940.
  oscarsborg: {
    name: 'Oscarsborg Fortress',
    place: 'Drobak Sound, Oslofjord',
    piece: '28 cm Krupp L/40',
    caliber: 280, bore: '11 in', barrels: 1,
    calibers: 40,
    // Ships. It was laid on a channel six hundred yards wide.
    targets: 'ships',
    mount: 'Barbette pivot',
    armour: 60,
    weight: 40, reload: 60, range: 21000,
    crew: 12, span: 18,
  },
  // A turret off a battleship, on an island in Manila Bay. Two twin 14-inch
  // mountings that held out until May 1942 and were still there afterwards.
  drum: {
    name: 'Fort Drum',
    place: 'El Fraile Island, Manila Bay',
    piece: '14"/50 M1909 twin turret',
    caliber: 356, bore: '14 in', barrels: 2,
    calibers: 50,
    // Ships. A battleship turret does not train fast enough for anything else.
    targets: 'ships',
    mount: 'Twin turret',
    armour: 457,
    weight: 900, reload: 48, range: 22860,
    crew: 20, span: 27,
  },
  // The heaviest gun the Kriegsmarine put ashore, in three and a half metres
  // of concrete at the narrowest part of the Channel, shooting at Dover.
  todt: {
    name: 'Batterie Todt',
    place: 'Cap Gris-Nez, Pas-de-Calais',
    piece: '38 cm SK C/34',
    caliber: 380, bore: '380 mm', barrels: 1,
    calibers: 52,
    // Ships, and the far side of the Channel.
    targets: 'ships',
    mount: 'Bettungsschiessgeruest',
    armour: 0,
    weight: 337, reload: 26, range: 55700,
    crew: 68, span: 30,
  },
  // The Golden Gate's own answer: two sixteen-inch guns apiece, casemated
  // under twenty feet of concrete and a hill of earth, and never fired in
  // anger at anything.
  townsley: {
    name: 'Battery Townsley & Battery Davis',
    place: 'Marin Headlands and Fort Funston, San Francisco',
    piece: '16"/50 M1919 on barbette carriage',
    caliber: 406, bore: '16 in', barrels: 2,
    calibers: 50,
    // Ships, and only ships: the elevation stops well short of the sky.
    targets: 'ships',
    mount: 'Barbette carriage M1919',
    armour: 0,
    weight: 400, reload: 60, range: 41150,
    crew: 70, span: 36,
  },
  // Eighty centimetres of bore on a gun that took two double railway tracks to
  // stand on, three days to assemble and half an hour to load. It fired
  // forty-eight rounds at Sevastopol and was never much use again.
  gustav: {
    name: 'Schwerer Gustav',
    place: 'Sevastopol, and wherever the track could be laid',
    piece: '80 cm Kanone (E)',
    caliber: 800, bore: '800 mm', barrels: 1,
    calibers: 40,
    // Whatever it was pointed at, and it was pointed at forts and ships.
    targets: 'ships',
    mount: 'Railway carriage, four rails',
    armour: 0,
    weight: 1350, reload: 180, range: 47000,
    crew: 250, span: 54,
  },
};

/** How many barrels the whole emplacement carries. */
export const batteryBarrels = (id) => BATTERIES[id]?.barrels || 0;
