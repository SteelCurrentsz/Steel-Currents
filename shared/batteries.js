// Coast artillery: the guns that were bolted to the ground.
//
// Every one of these existed and most of them are still standing, so the
// figures are the real ones — bore, range, rate of fire, what the mounting
// weighed and how much concrete or armour was in front of the crew. Where a
// battery had several guns the entry describes one emplacement of it, because
// one emplacement is what a captain is looking at on the selection screen.
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
 * @property {string} mount       casemate | turret | barbette | ringstand | railway
 * @property {string} cover       what the crew stood behind, in words
 * @property {number} concrete    millimetres of concrete over the chamber
 * @property {number} armour      millimetres of face armour, 0 if none
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
    mount: 'ringstand',
    cover: 'Open ringstand, earth and sandbag revetment',
    concrete: 400, armour: 10,
    weight: 5.2, reload: 4, range: 14860, ceiling: 8000,
    crew: 10, span: 15,
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
    mount: 'casemate',
    cover: 'Type H611 casemate, earth-banked',
    concrete: 2000, armour: 0,
    weight: 1.5, reload: 7.5, range: 9970,
    crew: 6, span: 22,
  },
  // Four naval 15 cm in H612 casemates on the cliff above Gold and Omaha, and
  // the only Normandy battery that still has its guns in place.
  longues: {
    name: 'Longues-sur-Mer Battery',
    place: 'Longues-sur-Mer, Normandy',
    piece: '15 cm Tbts KC/36',
    caliber: 150, bore: '150 mm', barrels: 1,
    calibers: 48,
    mount: 'casemate',
    cover: 'Type H612 casemate with blast wings',
    concrete: 2000, armour: 30,
    weight: 16, reload: 10, range: 19500,
    crew: 8, span: 26,
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
    mount: 'barbette',
    cover: 'Open barbette in a rock-cut pit',
    concrete: 1200, armour: 60,
    weight: 40, reload: 60, range: 21000,
    crew: 12, span: 26,
  },
  // A turret off a battleship, on an island in Manila Bay. Two twin 14-inch
  // mountings that held out until May 1942 and were still there afterwards.
  drum: {
    name: 'Fort Drum',
    place: 'El Fraile Island, Manila Bay',
    piece: '14"/50 M1909 twin turret',
    caliber: 356, bore: '14 in', barrels: 2,
    calibers: 50,
    mount: 'turret',
    cover: 'Armoured turret, 14 in roof and 18 in face',
    concrete: 0, armour: 457,
    weight: 900, reload: 48, range: 22860,
    crew: 20, span: 30,
  },
  // The heaviest gun the Kriegsmarine put ashore, in three and a half metres
  // of concrete at the narrowest part of the Channel, shooting at Dover.
  todt: {
    name: 'Batterie Todt',
    place: 'Cap Gris-Nez, Pas-de-Calais',
    piece: '38 cm SK C/34',
    caliber: 380, bore: '380 mm', barrels: 1,
    calibers: 52,
    mount: 'casemate',
    cover: 'Casemate, 3.5 m of reinforced concrete',
    concrete: 3500, armour: 0,
    weight: 337, reload: 26, range: 55700,
    crew: 68, span: 58,
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
    mount: 'casemate',
    cover: 'Casemate, 20 ft of concrete under earth',
    concrete: 6100, armour: 0,
    weight: 400, reload: 60, range: 41150,
    crew: 70, span: 64,
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
    mount: 'railway',
    cover: 'None. It stood in a cutting on four rails',
    concrete: 0, armour: 0,
    weight: 1350, reload: 2400, range: 47000,
    crew: 250, span: 70,
  },
};

/** How many barrels the whole emplacement carries. */
export const batteryBarrels = (id) => BATTERIES[id]?.barrels || 0;
