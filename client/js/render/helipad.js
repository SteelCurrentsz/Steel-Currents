// A destroyer's or a cruiser's one helicopter, on her pad.
//
// She stands on the spot with her rotors still until she is sent. Then her
// rotors are wound up on the spot, she goes straight up to a hover over it,
// and there she is handed to the sky -- the simulation puts her flight up at
// that hover (see shipHelo in ships.js and launchOffset in sim.js), so the
// machine on the pad and the one in the air are in the same place at the
// hand-over. Coming home she comes down onto the spot (heloHover), and the
// moment her wheels are on it she is the machine on the pad again, her rotors
// running down.
import { navalAirModel, navalAirReady } from './navalAirModel.js';

/** How long she takes to go straight up from the spot to her hover. */
const RISE_T = 3.2;
/** How high that hover is over the spot (PAD_HOVER in ships.js). */
const RISE = 18;
/** How long her rotors take to run down once she is aboard again. */
const RUN_DOWN = 14;
/** Her rotors' pace, in radians of airscrew a second, flat out. */
const SPIN = 32;

const ease = (u) => u * u * (3 - 2 * u);

/**
 * Put her on `g`'s pad: `pad` is the spot in the ship's own frame, `{ x, z,
 * y }` with y the deck under her, and `kind` the machine. Chains onto any
 * `userData.step` the ship already has.
 */
export function fitHelipad(g, { pad, kind }) {
  const deck = { body: null, t0: 0, plan: 'parked', dur: 0, aloft: false, lastT: null };
  const build = () => {
    if (deck.body || !navalAirReady()) return deck.body;
    const p = navalAirModel(kind, { solidGlass: true });
    p.userData.gear(0);
    p.position.set(pad.x, pad.y, pad.z);
    p.visible = !deck.aloft;
    g.add(p);
    deck.body = p;
    return p;
  };
  const before = g.userData.step;
  g.userData.helipad = deck;
  g.userData.step = (t) => {
    const out = before ? before(t) : undefined;
    stepPad(deck, t, pad, build);
    return out;
  };
  // Sent: wound up on the spot and up to the hover, in `dur` seconds from
  // the order, which is what the simulation gives her (`deckRun`).
  g.userData.launch = (t, role, dur) => {
    deck.plan = 'launch';
    deck.t0 = t;
    deck.dur = Math.max(RISE_T + 1, dur || 16);
    deck.aloft = false;
  };
  // Down on the spot: she is the machine on the pad again.
  g.userData.recover = (t) => {
    deck.plan = 'down';
    deck.t0 = t;
    deck.aloft = false;
  };
  // A pad has no hangar to strike her down into: whatever the deck is told
  // to put away is already where it belongs.
  g.userData.stow = () => {};
  return deck;
}

function stepPad(deck, t, pad, build) {
  const p = build();
  const dt = Math.max(0, Math.min(0.5, t - (deck.lastT ?? t)));
  deck.lastT = t;
  if (!p) return;
  const k = t - deck.t0;
  p.rotation.set(0, 0, 0);
  if (deck.plan === 'launch') {
    const wind = deck.dur - RISE_T;
    if (k < wind) {
      // Her rotors wound up on the spot.
      p.visible = true;
      p.position.set(pad.x, pad.y, pad.z);
      p.userData.turn(SPIN * Math.min(1, (k / wind) * 1.2) * dt);
      return;
    }
    const e = Math.min(1, (k - wind) / RISE_T);
    if (e >= 1) {
      // At the hover, and the flight in the air is her from here on.
      deck.plan = 'aloft';
      deck.aloft = true;
      p.visible = false;
      return;
    }
    p.visible = true;
    p.position.set(pad.x, pad.y + RISE * ease(e), pad.z);
    p.rotation.x = -0.04 * e;
    p.userData.turn(SPIN * dt);
    return;
  }
  if (deck.plan === 'aloft') {
    p.visible = false;
    return;
  }
  p.visible = true;
  p.position.set(pad.x, pad.y, pad.z);
  if (deck.plan === 'down' && k < RUN_DOWN) p.userData.turn(SPIN * (1 - k / RUN_DOWN) ** 2 * dt);
}
