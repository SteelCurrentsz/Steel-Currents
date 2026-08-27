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
 * @property {number} traverse    degrees of training, 360 for a full circle
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
    traverse: 360,
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
    traverse: 60,
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
    traverse: 120,
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
    traverse: 360,
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
    traverse: 360,
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
    traverse: 120,
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
    traverse: 145,
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
    traverse: 0,
    mount: 'Railway carriage, four rails',
    armour: 0,
    weight: 1350, reload: 180, range: 47000,
    crew: 250, span: 54,
  },
};

/** How many barrels the whole emplacement carries. */
export const batteryBarrels = (id) => BATTERIES[id]?.barrels || 0;

// ---------------------------------------------------------------------------
// What the gun does when it is fired
// ---------------------------------------------------------------------------
//
// The figures above are what a battery *is*. Everything below is what it takes
// to put a shell in the air, worked out from them rather than written down
// twice — so a battery's reach, its rate of fire and the weight of what it
// throws all come from the same numbers the selection screen shows a captain.

// The ships' own guns, as four points to fit against: bore in millimetres
// against what one shell does. A coast gun of a given bore throws the same
// shell a ship of that bore does, because it is very often literally the same
// shell — Fort Drum's fourteen-inch came off a battleship.
//
//   127 mm  2100 AP  1800 HE   80 mm penetration
//   152 mm  3300     2500     165
//   203 mm  5100     3300     265
//   406 mm 13500     6300     640
//
// Which are power laws in the bore to within a few per cent.
/**
 * How much further a coast gun shoots here than it did in life.
 *
 * The figures in the table above are the real ones and stay that way — that is
 * what the gun park puts in front of a captain, and a datasheet that lies is
 * worth nothing. But a battlefield in this game runs to seventy thousand yards
 * across, and a gun laid on one end of it that reaches ten thousand metres is
 * scenery. So the *reach* is the real range with a multiplier on it, and every
 * battery gets the same one: what a captain reads off the sheet still tells him
 * which of these outranges which, and by how much.
 */
export const BATTERY_REACH = 3;

/** How far the battery actually shoots on this battlefield, in metres. */
export const batteryReach = (b) => b.range * BATTERY_REACH;

const REF_BORE = 127;
const curve = (at127, power) => (mm) => Math.round(at127 * (mm / REF_BORE) ** power);
const apDamage = curve(2100, 1.62);
const heDamage = curve(1800, 1.08);
const apPen = curve(80, 1.79);

const GUNS = new Map();

/**
 * A firing solution's worth of gun, in the shape `solveBallistic` and the shell
 * step expect from a ship.
 *
 * `range` here is the battery's reach — its real maximum with the battlefield's
 * multiplier on it, see BATTERY_REACH — and the ballistics are solved against
 * it: a gun that reaches sixty thousand metres throws its shell flatter and
 * further than one that reaches thirty. That is what makes range mean something
 * rather than being a number on a datasheet. The number on the datasheet stays
 * the real one; this is the one the shells obey.
 */
export function batteryGun(id) {
  let g = GUNS.get(id);
  if (g) return g;
  const b = BATTERIES[id] || BATTERIES.longues;
  const mm = b.caliber;
  const velocity = 780;
  g = {
    caliber: mm,
    reload: b.reload,
    range: batteryReach(b),
    // Bedded in concrete or on a barbette, a coast gun does not roll, and a gun
    // that does not roll shoots tighter than the same gun at sea.
    sigma: 2.4,
    // How fast it comes round, in radians a second. A hand-cranked flak mount
    // is round in ten seconds; a fourteen-inch turret takes a minute and a half.
    traverse: 0.6 / (1 + b.weight / 60),
    shells: {
      ap: {
        type: 'ap', caliber: mm,
        damage: apDamage(mm), pen: apPen(mm), velocity,
        fuseArm: mm * 0.9, fireChance: 0.02, drag: 0.0022,
      },
      he: {
        type: 'he', caliber: mm,
        damage: heDamage(mm), pen: Math.round(mm / 6), velocity: velocity * 0.96,
        fuseArm: 0, fireChance: 0.1 + mm / 4000, drag: 0.0026,
      },
    },
  };
  GUNS.set(id, g);
  return g;
}

/**
 * The half-angle either side of the bearing the battery was laid on, in
 * radians — the same convention a ship's turret uses.
 *
 * A gun with no traverse at all still gets a couple of degrees: Gustav was
 * trained by walking it along a curved siding, which is not nothing, and a
 * battery that can never bear on anything is not a battery.
 */
export function batteryArc(b) {
  return Math.max(0.05, ((b.traverse || 0) / 2) * (Math.PI / 180));
}

/**
 * What it takes to put the battery out of action.
 *
 * Mostly the weight of the mounting — there is a great deal of steel in a
 * fourteen-inch turret and very little in a field howitzer — plus what the
 * crew has over their heads.
 */
export function batteryHp(b) {
  return Math.round(600 + b.weight * 4 + b.armour * 6);
}

/**
 * What a battery that shoots upward does to aircraft, or null.
 *
 * Anti-aircraft reach is left alone. A flak battery's ceiling is set by how
 * long the fuse burns and how high the shell still has the speed to matter,
 * and no amount of battlefield makes that further.
 */
export function batteryAa(b) {
  if (b.targets === 'ships') return null;
  return { range: Math.min(b.range, 7000), dps: Math.round(b.caliber * 1.7) };
}
