// Coast artillery: the guns that were bolted to the ground.
//
// Every one of these existed and most of them are still standing, so the
// figures are the real ones — bore, barrel length, range, rate of fire, what
// the mounting weighed and what shield or turret armour the crew had. Where a
// battery had several guns the entry describes one gun of it, because one gun
// is what a captain is looking at on the selection screen.
//
// The briefing chooses and counts them, the order-of-battle chart sites them,
// and the simulation fights them off these same figures. It sits beside
// ships.js because it is the same kind of thing — ordnance data, written down
// once, read by whatever needs it.

/** The order they are stepped through, roughly by bore. */
export const BATTERY_ORDER = [
  'flak88', 'merville', 'longues', 'katyusha', 'oscarsborg', 'drum',
  'todt', 'townsley', 'karl', 'gustav',
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
 * @property {boolean} [rocket]   a rocket launcher: `barrels` is its rails' load,
 *                                fired as one ripple a `salvo` seconds long
 * @property {number} [salvo]     seconds from the first rocket of a ripple to the last
 * @property {number} [relay]     radians a second it can be swung onto a new
 *                                bearing, for a piece that can drive round
 * @property {boolean} [mortar]   a siege mortar: it is laid on a point on the
 *                                chart rather than on a ship, and throws its
 *                                bomb up and over onto it -- see fireMortar
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
  // Not a gun at all: sixteen rockets on eight rails over the back of a lorry.
  // The Germans heard it before they saw it and called it Stalin's organ; the
  // crews named it after a song. It was never meant to hit one thing — it was
  // meant to cover a grid square in ten seconds and be gone before the answer
  // came back — so each rocket wanders on its own, but a ripple of sixteen
  // lands in a tight enough pattern that a ship inside it is badly hurt.
  katyusha: {
    name: 'Katyusha Rocket Launcher',
    place: 'Guards Mortar Regiments · Red Army',
    piece: 'BM-13-16 on ZiS-6',
    caliber: 132, bore: '132 mm', barrels: 16,
    // An M-13 is 1.41 metres of rocket on a 132 mm body.
    calibers: 11,
    rocket: true,
    // Sixteen rockets away in eight seconds, top and bottom of each rail in
    // turn: the real figure was seven to ten.
    salvo: 8,
    // The rails swing ten degrees either side on the lorry. Past that the
    // driver backs it round, which is quicker than relaying any casemate.
    targets: 'ships',
    traverse: 20,
    relay: 0.12,
    mount: 'ZiS-6 6×4 lorry, eight rails',
    // The armoured shutters that came down over the cab windscreen before a
    // ripple went over the crew's heads. Nothing else on it is armour.
    armour: 6,
    weight: 6.2, reload: 180, range: 8470,
    crew: 6, span: 8,
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
  // Sixty centimetres of mortar on its own tracks: seven of them were built to
  // break the Maginot Line, and they broke Brest-Litovsk, Sevastopol and the
  // Warsaw Old Town instead. A short fat barrel that threw a two-tonne bomb
  // high into the air and down through whatever was under it -- so it is not
  // laid on a ship at all. Its crew plot where she is going to be when the
  // bomb comes down, put a pin in the chart there, and fire at the pin.
  karl: {
    name: 'Karl-Gerät',
    place: 'Brest-Litovsk, Sevastopol and Warsaw · Heer',
    piece: '60 cm Mörser Gerät 040',
    caliber: 600, bore: '600 mm', barrels: 1,
    // A barrel five metres long on a sixty-centimetre bore.
    calibers: 8.4,
    mortar: true,
    targets: 'ships',
    // Four degrees either side on the carriage. Past that the driver slews the
    // whole vehicle round on its tracks, slowly, on its own engine.
    traverse: 8,
    relay: 0.06,
    mount: 'Tracked carriage, Daimler-Benz MB 503',
    armour: 0,
    weight: 124, reload: 120, range: 6640,
    crew: 21, span: 14,
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
 *
 * At twenty-five, every gun on the list covers the whole of any battlefield
 * the game will lay out several times over: the shortest-ranged of them,
 * Merville's field howitzers, carries a quarter of a million metres against a
 * corner-to-corner distance of ninety thousand. Nothing afloat is out of reach
 * of a battery that can bear on it, which is what a coast gun ought to feel
 * like from the water. What is left to range is the arc — see `loftedGun` —
 * and to the mounting is the traverse, which is what decides whether the gun
 * can bear at all.
 */
export const BATTERY_REACH = 25;

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
  if (b.rocket) {
    g = rocketGun(b);
    GUNS.set(id, g);
    return g;
  }
  if (b.mortar) {
    g = mortarGun(b);
    GUNS.set(id, g);
    return g;
  }
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
        fuseArm: Math.round(mm / 6), fireChance: 0.02, drag: 0.0022,
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
 * A rocket launcher's worth of firing solution.
 *
 * A rocket has burnt out a fraction of a second after it leaves the rail and
 * flies the rest of the way as a shell does, so the same solver flies it. What
 * is different is what it carries and how well it holds its line: a thin-cased
 * warhead full of explosive and nothing that will go through a plate, slower
 * than a gun's shell, and a fin-stabilised body that every gust and every
 * small misalignment on the rail turns a little off its bearing. It is the
 * same round whichever is asked for, because there is only one.
 */
function rocketGun(b) {
  const mm = b.caliber;
  const he = {
    type: 'he', caliber: mm, rocket: true,
    // Five kilos of explosive in a thin case: a little more blast than a
    // shell of the same bore, and nothing like its penetration.
    damage: Math.round(heDamage(mm) * 1.1), pen: Math.round(mm / 7), velocity: 640,
    fuseArm: 0, fireChance: 0.16, drag: 0.003,
  };
  return {
    caliber: mm,
    reload: b.reload,
    range: batteryReach(b),
    // How tight a ripple lands. About a bedded gun's 2.4, because the whole
    // ripple is laid on one point and the pattern is what a battery of these
    // was sited and surveyed to put down. Each rocket still wanders across
    // the line more than a shell does (see fireRocket), and it comes down at
    // a steeper angle, so it finds a narrow deck less often than a gun's flat
    // shot finds a side.
    sigma: 2.6,
    // A rocket that leaves its rail badly -- a bent fin, a nozzle burning
    // unevenly -- goes where it likes. One in sixteen or so.
    wild: 0.07,
    salvo: b.salvo || 8,
    rocket: true,
    traverse: 0.5,
    shells: { ap: he, he },
  };
}

/**
 * A siege mortar's worth of firing solution.
 *
 * Nothing like a gun's. The bomb leaves the barrel slowly and very high -- the
 * Gerät 040 fired between fifty-five and seventy degrees -- so it is a long
 * time in the air and comes down nearly vertically, onto a deck rather than
 * into a side. Two rounds, as there were: the heavy concrete-piercing bomb,
 * which goes through a turret roof, and the light one, which is mostly
 * explosive. `mortar` tells the battery to lay it on a point (see fireMortar),
 * which works out its own throw and flight time. `velocity` is a gun's, the
 * same as every other battery's, so anything that asks for this one's flat
 * solution the way it would for any gun gets a sensible answer.
 */
function mortarGun(b) {
  const mm = b.caliber;
  return {
    caliber: mm,
    reload: b.reload,
    range: batteryReach(b),
    // How widely it scatters, in metres at the fall of shot, as a floor and
    // a share of the range. A high-angle bomb is thrown, not aimed down a
    // line, and a sixty-centimetre one was not a precise instrument.
    scatter: { base: 12, perM: 0.0012 },
    sigma: 2.4,
    mortar: true,
    traverse: 0.08,
    shells: {
      ap: {
        type: 'ap', caliber: mm, mortar: true,
        damage: Math.round(apDamage(mm) * 0.8), pen: Math.round(apPen(mm) * 0.7), velocity: 780,
        fuseArm: Math.round(mm / 8), fireChance: 0.04, drag: 0,
      },
      he: {
        type: 'he', caliber: mm, mortar: true,
        damage: Math.round(heDamage(mm) * 1.25), pen: Math.round(mm / 5), velocity: 780,
        fuseArm: 0, fireChance: 0.22, drag: 0,
      },
    },
  };
}

/**
 * How long a mortar bomb is in the air on its way to a point `d` metres off.
 *
 * Shortened like everything else's here: the battlefield runs far past what
 * the mortar could really reach, and a bomb that took the true time to come
 * down from that height would be in the air for minutes. It still takes a
 * great deal longer than a gun's shell, which is the whole problem its crew
 * are solving when they put the pin in ahead of a ship.
 */
export function mortarFlight(d) {
  return Math.max(10, Math.min(40, 8 + d / 1100));
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
