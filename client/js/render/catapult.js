// The catapult evolution, which is the same aboard every ship that has one.
//
// A cruiser and a battleship both fly their scouts off the quarterdeck the same
// way -- train out, wind up, shoot -- and both of them have to do it on the
// simulation's clock, so that the aeroplane leaves the end of the girder on the
// tick her flight goes on the plot. The girders themselves differ from ship to
// ship and each builds her own; what happens on them does not, and this is it.
//
// A `rig` is the handful of figures that describe one ship's installation: how
// far the car sits back at rest, how much track it has ahead of it, how far the
// turntable trains out, and how long each part of the evolution takes.

import { AERO, catapultProfile } from './aero.js';

/** Ease in and out, for anything that starts and stops. */
const smooth = (u) => { const c = Math.min(1, Math.max(0, u)); return c * c * (3 - 2 * c); };

/** The Mark 6 flight-deck catapult, as fitted to a cruiser or a battleship. */
export const RIG = {
  BACK: -5.0,      // the girder, in the turntable's own frame
  FRONT: 14.0,
  A: -3.4,         // where the car sits at rest, near the breech
  STROKE: 17.0,    // and how much track it has ahead of it
  REST: 0.10,      // trained fore and aft
  OUT: 1.16,       // and trained out to shoot
  PLANE_Y: 1.95,   // the aeroplane, on her cradle
  PLANE_Z: 0.2,
  TRAIN: 3.4,      // trained out and pointing off the bow
  RUNUP: 5.0,      // engine wound up, waiting for the flag
  HOME: 4.0,       // and trained back in afterwards
};

/**
 * Her launch, from the order to the aeroplane leaving the end of the track.
 *
 * A gun ship does not have a deck to run down: the catapult trains out on its
 * turntable until it is pointing off the quarter, the pilot winds the engine
 * right up against the holdback, and then a powder charge throws the whole
 * cradle down the girder. The whole thing is played on the same clock the
 * simulation launches on, so what the eye sees leave the ship and what the
 * plot says is in the air are the same event.
 */
export function stepCatapults(deck, t) {
  const R = deck.rig;
  const pr = deck.profile;
  const shot = pr.rows.length * pr.dt;
  // Paced so the aeroplane leaves the track at exactly the moment the
  // simulation puts her squadron up, however long the integrated shot takes.
  const pace = (R.RUNUP + shot) / deck.run;
  const run = deck.launchAt === null ? -1 : (t - deck.launchAt) * pace;
  // Both catapults train out on the order and both come back in afterwards --
  // she is flying off aircraft, and that is a quarterdeck evolution, not one
  // man's job on one girder.
  let out = 0;
  if (run >= 0) {
    if (run < R.TRAIN) out = smooth(run / R.TRAIN);
    else if (run < R.RUNUP + shot) out = 1;
    else out = 1 - smooth((run - R.RUNUP - shot) / R.HOME);
  }
  for (const c of deck.cats) {
    c.group.rotation.y = c.sgn * (R.REST + (R.OUT - R.REST) * out);
    if (deck.live !== c || run < 0) {
      // Sitting on her cradle with the engine ticking over, waiting her turn.
      c.car.position.z = R.A;
      if (!c.gone) {
        c.plane.position.set(0, R.PLANE_Y, R.PLANE_Z);
        c.plane.rotation.set(0, 0, 0);
        if (c.prop) c.prop.rotation.z += 0.04;
      }
      continue;
    }
    let along = R.A;
    let y = 0;
    let pitch = 0;
    let turning = 30;
    if (run < R.TRAIN) {
      // Trained out on the turntable, engine coming up as she goes round.
      turning = 3 + 14 * out;
    } else if (run < R.RUNUP) {
      // Held on the holdback with the engine wound right up: she shakes.
      pitch = 0.005 * Math.sin((run - R.TRAIN) * 26);
    } else if (run < R.RUNUP + shot) {
      // The shot itself, read off the integrated profile.
      turning = 34;
      const i = Math.min(pr.rows.length - 1,
        Math.max(0, Math.round((run - R.RUNUP) / pr.dt)));
      const [s2, h, th] = pr.rows[i];
      along = R.A + s2;
      y = h;
      // Nose up: she is climbing away off the end of the girder.
      pitch = th;
      // Off the end of the girder and climbing away. She is handed over at the
      // end of the profile, which the pacing above puts on the same tick the
      // simulation puts her flight on the plot.
      if (s2 > R.STROKE + 34 && run >= R.RUNUP + shot - pr.dt) {
        deck.airborne = true;
        // Where the shot left her, latched at the moment it did. Whatever
        // flies her next reads this rather than trying to catch the model at
        // that instant -- see startFlyoff.
        c.plane.updateMatrixWorld(true);
        deck.endMatrix = c.plane.matrixWorld.clone();
        c.gone = true;
      }
    } else {
      // Gone. A frame can step clean over the last row of the profile, so the
      // hand-over is latched here as well: past the end of the shot she is
      // away, whether or not a frame landed on the moment she left the track.
      deck.airborne = true;
      c.gone = true;
      turning = 0;
    }
    c.car.position.z = Math.min(R.A + R.STROKE, along);
    if (!c.gone) {
      // Past the end of the girder there is no car under her: she carries on
      // along the line of the track on her own.
      c.plane.position.set(0, R.PLANE_Y + y,
        R.PLANE_Z + Math.max(0, along - (R.A + R.STROKE)));
      c.plane.rotation.set(pitch, 0, 0);
      c.plane.visible = true;
      if (c.prop) c.prop.rotation.z += turning * 0.05;
    } else {
      // She is away, and her flight is being drawn out where the shot left
      // her. The model on the cradle is not a second aeroplane: it is put out
      // of sight until she is craned back aboard.
      //
      // It used simply to stop being positioned, which left it hanging in the
      // air over the quarterdeck exactly where the shot ended -- a scout that
      // took off and then paused, levitating, for the rest of the battle.
      c.plane.visible = false;
    }
  }
}

/**
 * Wire a ship's catapults up: what a launch is, and what comes after one.
 *
 * The scene only tells her when the order was given. She knows what a launch
 * looks like, plays it herself, and says when the aeroplane has left the track
 * -- which is the only moment the simulation and the model have to agree on.
 */
export function fitCatapults(g, {
  cats, rig = RIG, deckY, catX, catZ, run, aero, scale = 1,
}) {
  const deck = {
    cats, rig, live: null, launchAt: null, airborne: false, plane: null,
    // Which flight in the air the aeroplane off the catapult is.
    flightId: 0,
    // Flights whose wheels have left the track and are waiting for a model to
    // be handed to them. A queue, because the order can arrive a frame either
    // side of the evolution ending.
    pending: [],
    endMatrix: null,
    aero, run,
    profile: catapultProfile(AERO[aero], rig.STROKE),
  };
  g.userData.deck = deck;
  g.userData.catapults = cats;
  g.userData.deckPlane = cats.length ? cats[0].plane : null;
  g.userData.step = (t) => stepCatapults(deck, t);
  g.userData.launch = (t) => {
    // The two catapults are used turn and turn about, which is what keeps one
    // of them free while the other is being reloaded by the crane.
    const next = cats.find((c) => !c.gone && c !== deck.live) || deck.live;
    deck.live = next;
    deck.launchAt = t;
    deck.airborne = false;
    if (next) {
      next.gone = false;
      next.plane.visible = true;
      g.userData.deckPlane = next.plane;
      g.userData.deckPlaneOwner = next;
      deck.plane = { group: next.plane, prop: next.prop };
      // Where she comes back to: her own cradle, not a spot on the deck.
      // In the ship's own frame. A ship drawn larger than she was built has
      // her girders scaled with her, so the offsets along one are too.
      g.userData.landingSpot = [next.sgn * catX,
        deckY + (rig.PLANE_Y + 0.6) * scale, catZ + rig.A * scale];
    }
  };
  // Whatever was flying her is finished with her: she is back on her cradle,
  // craned aboard and bolted down for the next shot.
  g.userData.recover = () => {
    const c = g.userData.deckPlaneOwner || deck.live;
    deck.airborne = false;
    deck.launchAt = null;
    if (!c) return;
    c.gone = false;
    if (c.plane.parent !== c.car) c.car.add(c.plane);
    c.plane.position.set(0, rig.PLANE_Y, rig.PLANE_Z);
    c.plane.rotation.set(0, 0, 0);
    c.plane.visible = true;
    c.car.position.z = rig.A;
    c.group.rotation.y = c.sgn * rig.REST;
  };
  // A gun ship has no hangar and no lift: there is nowhere for a scout to go
  // but back on her cradle, so being struck below and being craned aboard are
  // the same evolution. The carrier tells the two apart; she does not.
  g.userData.stow = g.userData.recover;
  return deck;
}
