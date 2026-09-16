// What a wing does in air.
//
// The aircraft used to be moved along a path: so many metres of deck in so many
// seconds, and a height curve fitted to look right. Nothing about it knew what
// an aeroplane is, so nothing about it could be right for the wrong reasons --
// she left the deck at the same point whatever she weighed, and turned as fast
// as the script said rather than as fast as her wing would let her.
//
// This is the small amount of aerodynamics it takes to fix that: lift and drag
// off a real wing area, thrust from a propeller that makes less of it the faster
// she goes, and a turn rate that falls out of the bank angle the way a
// coordinated turn actually does. The coefficients are the real machines'.
//
// It lives in `shared` because both sides of the game fly on it. It used to be
// a client module, so the aeroplane under the player's hands was flown on this
// and every other aeroplane in the battle was flown on a flat turn rate per
// role: a Wildcat and an Avenger came round at a number somebody had chosen,
// the same at a hundred knots as at three hundred, and a formation turned no
// better empty than loaded. The same wing does for both now.

/** Wrap to -PI..PI, so a heading can be added to for ever. */
export function wrapAngle(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

export const RHO = 1.225;              // kg/m3, sea level
export const G = 9.80665;

/**
 * Wind over the deck.
 *
 * This is the whole reason a loaded Avenger gets off five hundred feet of deck.
 * A carrier turns into wind and works up to thirty knots to launch, so the air
 * is already going past the wing before she has moved: her airspeed on the deck
 * is her speed over it plus this.
 *
 * Thirty knots is a launching carrier's own speed through the water with very
 * little natural wind in it, which is the honest figure. It used to be
 * forty-three, and that is a great deal of free airspeed: a loaded Avenger
 * unstuck in fifty-eight metres, which is a fifth of the Enterprise's flight
 * deck. She takes the whole of it now, as she did.
 */
export const WIND_OVER_DECK = 15.4;    // m/s, thirty knots

/**
 * The three types, to their own weights and wings.
 *
 * `thrust` is static thrust at full power; it falls away with speed, which is
 * what a propeller does. `vMax` is level top speed.
 */
export const AERO = {
  wildcat: {
    mass: 3610, wing: 24.2, span: 11.58, clMax: 1.55, cd0: 0.0250,
    thrust: 15600, vMax: 143, name: 'F4F-4',
    // How she handles, as two numbers about the aeroplane rather than two
    // numbers about how she ought to feel. `helix` is the helix angle her
    // ailerons will wind up -- pb/2V, the standard measure of roll power, and
    // about 0.09 for a good fighter and half that for a bomber -- which turns
    // into a roll rate out of her own span and her own speed. `gLimit` is the
    // limit load factor her structure was stressed to.
    helix: 0.085, gLimit: 6.0,
  },
  dauntless: {
    mass: 4320, wing: 30.2, span: 12.66, clMax: 1.50, cd0: 0.0300,
    thrust: 15200, vMax: 125, name: 'SBD-3',
    helix: 0.062, gLimit: 5.0,
  },
  avenger: {
    mass: 7210, wing: 45.5, span: 16.51, clMax: 1.60, cd0: 0.0310,
    thrust: 22400, vMax: 130, name: 'TBF-1',
    // A loaded torpedo bomber is a bus. She rolls slowly and she will not be
    // hauled about, which is exactly why she needs the fighters.
    helix: 0.050, gLimit: 4.0,
  },
  // The German cruiser's scout: an Arado 196, a low-wing monoplane on two big
  // floats with a nine-hundred-horsepower radial. Faster and a good deal
  // stronger than a Kingfisher -- she was armed well enough to take a
  // submarine on -- and still far too draggy on those floats to get herself
  // off anything without a catapult under her.
  arado: {
    mass: 3300, wing: 28.4, span: 12.44, clMax: 1.48, cd0: 0.0390,
    thrust: 12600, vMax: 86, name: 'Ar 196A-3',
    helix: 0.058, gLimit: 4.5,
  },
  // The Surcouf's own aeroplane, and the smallest thing in the air in this
  // game by a long way: two tonnes loaded, a hundred and seventy-five
  // horsepower, and a hundred and eighteen miles an hour flat out.
  //
  // Everything about her is the hangar she folds into. She is light because
  // two men have to handle the pieces on a wet casing, she is slow because a
  // hundred and seventy-five horsepower is what a Salmson nine gives and
  // because she is carrying a float half as long as she is, and she turns
  // beautifully because a big thick wing on a very light aeroplane always
  // does. What she cannot do is get away from anything: a Wildcat closes on
  // her at twice her speed, and she has one flexible gun aft.
  besson: {
    mass: 2083, wing: 22.0, span: 12.00, clMax: 1.58, cd0: 0.0465,
    thrust: 5200, vMax: 53, name: 'MB.411',
    helix: 0.050, gLimit: 3.8,
  },
  // The cruiser's scout. Four hundred and fifty horsepower and a great float
  // hung under her, so she is slow and draggy -- and much too slow to get off
  // anything, which is exactly why she is shot off a catapult instead.
  kingfisher: {
    mass: 2600, wing: 24.3, span: 10.95, clMax: 1.50, cd0: 0.0410,
    thrust: 9000, vMax: 74, name: 'OS2U-3',
    helix: 0.054, gLimit: 4.0,
  },
  // And the Japanese three. The Zero is the lightest fighter of the war and
  // handles like it: she out-climbs and out-turns anything, and at four
  // hundred kilos less than a Wildcat she has no armour and no self-sealing
  // tanks to show for it. Anything that hits her, kills her.
  zero: {
    mass: 2733, wing: 21.3, span: 11.00, clMax: 1.60, cd0: 0.0215,
    thrust: 13400, vMax: 155, name: 'A6M5',
    helix: 0.080, gLimit: 7.0,
  },
  // The Suisei: an inline-engined dive bomber, faster than most fighters of
  // her generation, with an internal bomb bay and dive brakes under the wing.
  suisei: {
    mass: 3650, wing: 23.6, span: 11.50, clMax: 1.48, cd0: 0.0255,
    thrust: 14800, vMax: 156, name: 'D4Y3',
    helix: 0.060, gLimit: 5.5,
  },
  // The Tenzan: bigger than an Avenger, carrying one eighteen-inch torpedo
  // under her belly, and handling exactly the way a loaded torpedo bomber
  // handles -- which is to say not much.
  tenzan: {
    mass: 5650, wing: 37.2, span: 14.89, clMax: 1.58, cd0: 0.0300,
    thrust: 19600, vMax: 133, name: 'B6N2',
    helix: 0.050, gLimit: 4.2,
  },
  // The battleship's and the cruiser's scout: three seats, fifteen hours'
  // endurance, and two great floats that cost her every knot she has.
  jake: {
    mass: 3640, wing: 36.0, span: 14.50, clMax: 1.50, cd0: 0.0395,
    thrust: 11800, vMax: 80, name: 'E13A1',
    helix: 0.052, gLimit: 4.0,
  },
};

/**
 * And the heavy squadrons, which are flown by the same wing and the same
 * engine and are simply a great deal bigger.
 *
 * Loaded weights, wing areas and spans off the machines themselves. What they
 * fly like falls out of those three numbers and needs no separate rules: a
 * thirty-tonne aeroplane on a hundred and twenty square metres of wing stalls
 * at ninety knots, turns like a barn and cannot be hauled about, and a pilot
 * who tries to throw one around finds that out in the first turn.
 *
 * The same two handling numbers everything else has, and they do the rest on
 * their own: a helix angle about half a fighter's, wound up over thirty-one
 * metres of span instead of eleven, comes out at a roll rate of thirteen
 * degrees a second. And `gLimit` is the limit load factor she was stressed to
 * with fourteen thousand pounds of bombs in the bay -- two and a half, not the
 * six a fighter will take -- so full back stick on a Lancaster is a good deal
 * less than full back stick on a Wildcat, which is the whole difference.
 *
 * She will roll right over if you hold the stick there long enough. It takes
 * about twenty-five seconds and it is a bad idea.
 */
export const HEAVY_AERO = {
  lancaster: {
    mass: 30000, wing: 120.5, span: 31.09, clMax: 1.55, cd0: 0.0270,
    thrust: 52000, vMax: 128, name: 'Lancaster B.I',
    helix: 0.040, gLimit: 2.5,
  },
  fortress: {
    mass: 29700, wing: 131.9, span: 31.62, clMax: 1.58, cd0: 0.0255,
    thrust: 50000, vMax: 128, name: 'B-17G',
    helix: 0.038, gLimit: 2.7,
  },
  heinkel: {
    mass: 14000, wing: 87.6, span: 22.60, clMax: 1.52, cd0: 0.0285,
    thrust: 26000, vMax: 120, name: 'He 111H-6',
    helix: 0.046, gLimit: 3.0,
  },
  junkers: {
    mass: 14000, wing: 54.5, span: 20.08, clMax: 1.48, cd0: 0.0250,
    thrust: 28000, vMax: 142, name: 'Ju 88A-4',
    helix: 0.055, gLimit: 4.0,
  },
  betty: {
    mass: 12500, wing: 78.1, span: 24.88, clMax: 1.50, cd0: 0.0265,
    thrust: 24000, vMax: 119, name: 'G4M1',
    helix: 0.044, gLimit: 2.6,
  },
};

/**
 * The roll rate she will settle at with the stick hard over, in radians a
 * second.
 *
 * `pb/2V` is the helix angle the wing tip describes as she rolls, and it is
 * the standard measure of how much roll an aeroplane has: it is very nearly
 * constant for a given set of ailerons, so the rate itself is the helix angle
 * times twice the airspeed over the span.
 *
 * Which is the whole answer to why a bomber does not roll like a fighter. It
 * is not that somebody decided she should be slow: it is that the same helix
 * angle wound up over thirty-one metres of wing instead of eleven gives a
 * third of the rate, and she is slower as well, which takes another third
 * off. A Wildcat at cruise comes round at ninety degrees a second and a
 * Lancaster at thirteen, and neither number was chosen.
 *
 * It also means she rolls faster the faster she is going, which is what
 * killed people in dives: the rate used to be a constant and she rolled the
 * same at fifty knots as at three hundred.
 */
export function rollRate(a, v) {
  return (2 * Math.max(8, v) * (a.helix ?? 0.06)) / Math.max(1, a.span);
}

/**
 * How long she takes to get there, and to answer the elevator, in seconds.
 *
 * An aeroplane has mass and it is spread out along her wing and her fuselage,
 * so a control does not put her where you want it -- it starts her moving and
 * the air damps her into a steady rate. That time is the roll mode and the
 * short period, and both of them come out of inertia over aerodynamic
 * damping: mass over dynamic pressure times wing area, to within the constant.
 *
 * This is what "she should not react so suddenly" is: the stick used to be the
 * rate, so a fighter and a thirty-tonne bomber both snapped to full deflection
 * inside one frame. Now a Wildcat takes about a sixth of a second to wind up
 * to her roll rate and a Lancaster the better part of a third of a second, and
 * both of them take longer again when they are slow -- because that is where
 * the damping comes from.
 */
export function rollTau(a, v) {
  return Math.min(1.3, Math.max(0.08,
    a.mass / (7.2 * RHO * Math.max(12, v) * a.wing)));
}

/** And the same for the elevator, which is slower: a longer arm, more inertia. */
export function pitchTau(a, v) {
  return Math.min(1.6, Math.max(0.10,
    a.mass / (5.4 * RHO * Math.max(12, v) * a.wing)));
}

/**
 * How fast her nose will swing in the vertical, in radians a second.
 *
 * A long aeroplane swings her nose more slowly than a short one for the same
 * reason a long ship answers her helm more slowly: there is more of her, and
 * it is further from the middle. Off her span, so it is one number about the
 * aeroplane rather than a number per type that somebody had to choose.
 */
export function pitchRate(a) {
  return 26.4 / (12 + a.span);
}

/** Aspect ratio: span squared over wing area, which is where induced drag comes from. */
export function aspect(a) { return (a.span * a.span) / a.wing; }

/** The speed below which the wing will not hold her up. */
export function stallSpeed(a, flaps = 1) {
  return Math.sqrt((2 * a.mass * G) / (RHO * a.wing * a.clMax * flaps));
}

/** Lift, in newtons. */
export function lift(a, v, cl) { return 0.5 * RHO * v * v * a.wing * cl; }

/** Drag, in newtons: what she has at zero lift, plus what the lift costs her. */
export function drag(a, v, cl) {
  const cd = a.cd0 + (cl * cl) / (Math.PI * aspect(a) * 0.78);
  return 0.5 * RHO * v * v * a.wing * cd;
}

/** Thrust, in newtons. A propeller makes most of it standing still. */
export function thrust(a, v, throttle = 1) {
  return a.thrust * throttle * Math.max(0.28, 1 - 0.52 * (v / a.vMax));
}

/** The lift coefficient she needs to hold her weight up at this speed. */
export function clFor(a, v, load = 1) {
  if (v < 1) return a.clMax;
  return Math.min(a.clMax, (2 * a.mass * G * load) / (RHO * v * v * a.wing));
}

/**
 * The angle her nose sits at above her own flight path.
 *
 * A wing makes lift by meeting the air at an angle, and how big that angle has
 * to be depends on how hard the wing is working: heavy and slow it is a great
 * deal, fast and light it is almost nothing. That difference is the whole of
 * why a loaded torpedo bomber climbing out looks as though she is hanging on
 * her propeller while a fighter at speed looks level.
 *
 * Lift-curve slope of a thin aerofoil, corrected for the aspect ratio she
 * actually has, plus the couple of degrees the wing is rigged at.
 */
export function alphaFor(a, v, load = 1) {
  const cl = clFor(a, Math.max(1, v), load);
  const AR = aspect(a);
  const slope = (2 * Math.PI * AR) / (AR + 2);
  return Math.min(0.32, (a.rig ?? 0.03) + cl / slope);
}

/**
 * The attitude to draw a flight at, from what is known about her.
 *
 * Her flight path is her rate of climb over her speed across the ground, and
 * her nose sits above it by the angle of attack her wing is working at. Both
 * halves used to be missing: the path was her rate of climb over a fixed
 * seventy-eight metres a second whatever she was actually doing, and there was
 * no angle of attack at all -- so every aeroplane in the game was an arrow
 * pointing exactly down its own track, and a torpedo bomber running in slow and
 * level was drawn dead level instead of hanging on her propeller.
 */
export function flightAttitude(a, groundSpeed, climbRate, load = 1) {
  const gs = Math.max(12, groundSpeed);
  const gamma = Math.atan2(climbRate, gs);
  const alpha = alphaFor(a, Math.hypot(gs, climbRate), load);
  return Math.max(-1.25, Math.min(0.6, gamma + alpha));
}

/**
 * Which way something falling out of the sky is pointing.
 *
 * What is left of an aeroplane has no lift and a great deal of drag, so she
 * weathercocks into her own path -- and that path steepens as she loses her way
 * and keeps her fall, which is why a wreck goes in nearly vertically however
 * level she was when she was hit. Wound down at a fixed rate instead she
 * pointed at the sea a second or two after being hit whatever she was doing,
 * which is the one thing that makes a falling aeroplane read as a falling
 * marker.
 */
export function weathercock(pitch, groundSpeed, climbRate, dt, rate = 2.0) {
  const want = Math.atan2(climbRate, Math.max(4, groundSpeed));
  const d = Math.max(-rate * dt, Math.min(rate * dt, want - pitch));
  return Math.max(-1.45, Math.min(0.5, pitch + d));
}

/**
 * The bank a level turn is flown at, and what the wing will give.
 *
 * A coordinated turn is the horizontal part of the lift pulling her round, so
 * the rate falls out of the bank and the speed and nothing else: g tan(phi)
 * over v. Everything about how well an aeroplane turns is therefore about how
 * much bank she can hold -- and that is limited twice over, by the spar she
 * was stressed to and by the wing, which near the stall runs out first.
 *
 * `holdBank` is the steepest turn this machine can hold at this speed;
 * `turnFor` is the rate she comes round at when she is in it.
 *
 * These are the same two lines the Pilot flies on. They are here rather than
 * in the cockpit because the simulation turns its own aeroplanes with them: an
 * aeroplane nobody is flying is still an aeroplane.
 */
export function holdBank(a, v) {
  const vs = stallSpeed(a);
  const speed = Math.max(12, v);
  // What the wing can pull at this speed, and what the structure will stand.
  const wingG = Math.max(0.15, (speed * speed) / (vs * vs));
  const maxG = Math.min(wingG, a.gLimit ?? 5.5);
  // A level turn at load factor n is flown at a bank of arccos(1/n). Below one
  // g the wing cannot hold her up at all, let alone turn her.
  if (maxG <= 1.02) return 0;
  return Math.acos(1 / maxG);
}

/** The rate she comes round at, in radians a second, at this bank and speed. */
export function turnFor(v, bank) {
  const c = Math.cos(bank);
  if (Math.abs(c) < 1e-3) return 0;
  return (G * Math.tan(bank)) / Math.max(18, v);
}

/**
 * Which machine a flight actually is.
 *
 * Her type if her ship flies one, and otherwise whatever her job takes: a
 * carrier's fighters are Wildcats and her torpedo squadron is Avengers, and a
 * cruiser's one scout is a float plane and nothing else. The same rule the
 * client draws her by, so the aeroplane the simulation turns and the aeroplane
 * on the screen are the same aeroplane.
 */
export function airframeOf(type, role) {
  if (type && AERO[type]) return AERO[type];
  const byRole = {
    fighter: 'wildcat', dive: 'dauntless', torpedo: 'avenger', scout: 'dauntless',
  };
  return AERO[byRole[role] || 'avenger'] || AERO.avenger;
}

/**
 * The steepest turn she can hold without losing speed.
 *
 * `holdBank` above is what the wing and the spar will give for a moment. This
 * is the different and harder question: at what bank does the drag of the turn
 * eat exactly the thrust she has, so that she comes round at a steady rate at
 * a steady speed instead of winding down and falling out of it?
 *
 * It matters because an aeroplane nobody is flying is flown at a cruise: the
 * simulation does not model her energy, so given the instantaneous limit she
 * would hold six g for ever and a formation of Wildcats would come round at
 * thirty-one degrees a second and never slow down. Thirty-one is a real
 * number -- for about four seconds. Her sustained rate is a third of that, and
 * it is the one a squadron actually manoeuvres at.
 *
 * Solved by walking the load factor up until the drag passes the thrust, which
 * is a dozen multiplications and needs no algebra anybody has to check.
 */
export function sustainBank(a, v, throttle = 1) {
  const speed = Math.max(12, v);
  const T = thrust(a, speed, throttle);
  const ceiling = holdBank(a, speed);
  if (ceiling <= 0) return 0;
  let best = 0;
  for (let n = 1.05; n <= 8; n += 0.05) {
    const bank = Math.acos(1 / n);
    if (bank > ceiling) break;
    const cl = clFor(a, speed, n);
    if (cl > a.clMax) break;
    if (drag(a, speed, cl) > T) break;
    best = bank;
  }
  // And she can always turn something.
  //
  // A machine with no thrust margin at all -- shot about, slowed down, or
  // simply heavy and low -- comes out of the loop above with nothing, and
  // nothing means an aeroplane that cannot alter course: a damaged flight flew
  // dead straight out of her formation and off the edge of the battle. That is
  // not what a pilot does. He turns anyway and accepts that he is going
  // downhill, which is what a turn with no thrust for it is -- and what he has
  // left to turn with then is the wing, not the engine. So the floor is a
  // fraction of what the wing will still give rather than a fixed angle: a
  // machine at cruise sits well above it, and one slowed right down turns as
  // hard as her wing still allows and loses height for it.
  return Math.max(best, ceiling * 0.65);
}
