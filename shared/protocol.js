// Wire format. Snapshots are fog-of-war filtered per team: you only ever
// receive the enemies your side can actually see.

import { soldierWire, barracksWire, squadWire } from './infantry.js';
import { getClass } from './ships.js';
import {
  torpedoVisible, SECTIONS, sectionVolume, gunState, sonarContact, dpMounts, lightGunState,
  slotMask, machineSlot, MISSILE_CODE, vlsKinds, samKinds, planeRack, CHAFF_LOAD,
  canCallEscort, escortStrength, dockState, fieldReport, integrityCategories,
} from './sim.js';
import { PARTS } from './airframe.js';
import { lampWire } from './searchlights.js';

/** The part keys, in the order a hole report packs them. */
const PART_KEYS = PARTS.map((p) => p.k);

/** How many of an aeroplane's holes go on the wire: every one she can carry (MAX_HOLES). */
const HOLES_SENT = 16;

const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;
const r4 = (v) => Math.round(v * 10000) / 10000;
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * One ship on the wire.
 *
 * `state` is optional and is only there for the things a ship cannot answer
 * about herself: what her sonar has hold of is a question about the rest of
 * the sea, not about her.
 */
export function shipSnapshot(ship, full, state = null) {
  const cls = getClass(ship.classId);
  const s = {
    i: ship.id, x: r1(ship.x), z: r1(ship.z), h: r3(ship.heading),
    v: r1(ship.speed), hp: Math.round(ship.hp), a: ship.alive ? 1 : 0,
    c: ship.classId, n: ship.name, tm: ship.team,
    // Out of the fight and still going down (go), or gone under (un): the
    // picture draws her as the battle has her until she is under.
    ...(!ship.alive && ship.sinking ? (ship.sinking.under ? { un: 1 } : { go: 1 }) : {}),
    f: ship.fires, fl: ship.flooding,
    tu: ship.turrets.map((t) => r3(t.angle)),
    // How far up the guns are. It is what a turret most obviously does and
    // nothing on the far side of the wire can work it out: a ship hull-down on
    // the horizon shows you her elevation, not her fire-control problem.
    te: ship.turrets.map((t) => r3(t.elev || 0)),
    sm: ship.smokeActive > 0 ? 1 : 0,
    // Her searchlights that are lit, and where they are trained. Anyone who
    // can see her can see those.
    ...(lampWire(ship) ? { lp: lampWire(ship) } : {}),
    // What is left of each of her compartments, in tenths, for everybody.
    //
    // Her own captain gets the full figures below; this is the coarse one, and
    // it goes to anyone who can see her because it is what the renderer opens
    // her up with. A compartment blown out is a hole in the ship you can see
    // from the next ship in the line -- plating gone, frames bare, her decks
    // and her machinery open to the weather -- and that is not private
    // information.
    sk: SECTIONS.map((k) => {
      const c = ship.sections[k.k];
      return Math.round((c.hp / c.max) * 9);
    }),
    // How she is floating: how much deeper the water in her has put her, how
    // far over she is lying, and how far down by the head or the stern. Three
    // numbers, and between them they are the whole of how she sinks -- there
    // is no canned animation for the client to play, only this.
    //
    // Its own key. It used to be `fl`, which is also the number of her
    // compartments that are flooding, two lines above -- so the count was
    // overwritten by the triple every time a snapshot was built, and the ship
    // plate reported "FLOODING x0,0,0" at a captain who wanted to know how
    // many compartments were making water.
    // Her depth to the centimetre: in tenths of a metre a ship settling a few
    // centimetres a second goes down the screen in steps.
    // Riding up on another hull, or up a beach (groundLift, groundTrim), comes
    // out of the same three: she is higher, and down by one end.
    fo: [Math.round(((ship.sink || 0) - (ship.lift || 0) - (ship.groundLift || 0)) * 100) / 100, r3(ship.heel + (ship.liftHeel || 0)), r3(ship.trim + (ship.liftTrim || 0) + (ship.groundTrim || 0) + (ship.groundJolt || 0)), r3(ship.lean || 0), r3(ship.rock || 0)],
    // Aground: how hard, and stranded with her screws out of the water.
    ag: ship.aground ? r3(ship.aground) : undefined,
    sd: ship.stranded ? 1 : undefined,
    // A landing craft's ramp, down on the beach.
    rp: ship.rampDown ? 1 : undefined,
    // And how many men are in her well: anyone can see a boat full of them.
    tr: ship.troops ? ship.troops : undefined,
    // A submarine, and nothing else, carries these: how deep she is and how
    // long her tubes' outer doors have been open. Everybody who can see her
    // gets them -- a boat's depth is not private information to anyone close
    // enough to be reading her at all, and the renderer has to put her where
    // she actually is. Her air is hers alone and goes with the private block.
    d: cls.dive ? r1(ship.depth) : 0,
    to: cls.dive ? r1(ship.tubeOpen) : 0,
    // Which compartments have water in them and which are alight, in tenths,
    // so the fire and the water can be drawn where they actually are.
    wt: SECTIONS.map((k) => {
      const c = ship.sections[k.k];
      const v = sectionVolume(cls, k.k);
      // In hundredths, not ninths. The board draws the water standing in her
      // at this level, and a ninth of a compartment is most of a metre of
      // freeboard: she flooded in visible steps, one jump per ninth, when what
      // is wanted is the sea creeping up her frames while you watch it.
      return v ? Math.round(Math.min(1, (c.wP + c.wS) / v) * 100) : 0;
    }),
    fr: SECTIONS.map((k) => Math.round(ship.sections[k.k].fire * 9)),
    // Where the sea is running, and which way. Positive is water coming in
    // through her plating and negative is water going out through her pumps,
    // in ninths of a good hard inflow -- enough resolution to draw it with and
    // not enough to be worth a float. A damage control officer reads where the
    // water is getting in off this; how much of it is already inside her is
    // `wt` above, and the two are different questions.
    fw: SECTIONS.map((k) => {
      const v = ship.sections[k.k].inflow || 0;
      return Math.max(-9, Math.min(9, Math.round((v / 14) * 9)));
    }),
    // And which side of her each compartment was opened on, so the stream is
    // drawn running in through the plating it actually came through.
    fs: SECTIONS.map((k) => ship.sections[k.k].side || 0),
    // Where her back went, if it went.
    bk: ship.broke == null ? null : r3(ship.broke),
    // And the piece of her that has been cut off, if one has: where she
    // parted and which side of it she still is. See cutHer.
    ct: ship.cut ? [r3(ship.cut.at), ship.cut.keep] : null,
    // Her mountings that have gone down through holes in the deck under
    // them. Anyone can see a gap where a turret was.
    ...(ship.fell ? { dn: Object.keys(ship.fell) } : {}),
    // And the ones a bomb came down on and wrecked where they stand.
    ...(ship.ko ? { wk: Object.keys(ship.ko) } : {}),
  };
  // Where her secondary battery and her torpedo tubes are trained. Everyone
  // sees these, friend or enemy: a destroyer swinging her tubes onto your beam
  // is the most important thing on the horizon, and it is visible through a
  // pair of binoculars.
  if (ship.secMounts.length) {
    s.se = ship.secMounts.map((m) => r3(m.angle));
    s.sl = ship.secMounts.map((m) => r3(m.elev || 0));
  }
  if (ship.torpMounts.length) s.tt = ship.torpMounts.map((m) => r3(m.angle));
  // Where her RBU-1200s are trained, and how far up their tubes are: the
  // launchers come round onto a torpedo or a boat before they fire on it.
  if (ship.rbuMounts && ship.rbuMounts.length) {
    s.rt = ship.rbuMounts.map((m) => r3(m.angle));
    s.rl = ship.rbuMounts.map((m) => r3(m.elev || 0));
  }
  // How far up each of her box launchers is. Anyone can see a battleship
  // raising her Tomahawk boxes, and what it means.
  if (ship.missiles && ship.missiles.boxes.length) s.ml = ship.missiles.boxes.map((b) => r2(b.raise));
  // The mines still on her rails, and how long until the next one is rolled
  // aft. Anyone can count the mines on a boat's stern through a glass.
  // The B-25s still on a carrier's flight deck: anyone can count them.
  if (cls.planes && cls.planes.deckload) s.dl = ship.deckload ?? 0;
  if (cls.mines) {
    s.mnl = ship.mnLeft;
    s.mnc = Math.max(0, Math.round((ship.mnCool || 0) * 10) / 10);
  }
  if (full) {
    s.notch = ship.notch;
    // The fleet she is in, if any, and how many orders it has given her: a
    // captain whose helm was put over by an order to his fleet takes it up.
    if (ship.fleet) s.fg = ship.fleet;
    if (ship.fleetSeq) s.fq = ship.fleetSeq;
    // Which of her mountings her captain has put on which ship by name.
    if (ship.assign && Object.keys(ship.assign).length) s.as = { ...ship.assign };
    // And what the whole of her was ordered onto off the plot, while any of
    // her guns are still on it.
    if (ship.ordered && ship.assign && Object.values(ship.assign).includes(ship.ordered)) s.ot = ship.ordered;
    // Which of them he has switched off, and which are gone for good -- the
    // same keys, so the panel can show both on the key for that mounting.
    if (ship.off && Object.keys(ship.off).length) s.of = Object.keys(ship.off);
    const ko = [];
    ship.turrets.forEach((t) => { if (gunState(ship, cls, cls.turrets[t.id], t) >= 3) ko.push(`main:${t.id}`); });
    if (cls.secondary) {
      ship.secMounts.forEach((m) => { if (gunState(ship, cls, cls.secondary.mounts[m.id], m) >= 3) ko.push(`sec:${m.id}`); });
    }
    for (const d of dpMounts(cls)) if (lightGunState(ship, cls, d.spec) >= 3) ko.push(`dp:${d.i}`);
    ship.torpMounts.forEach((m) => { if (m.lost) ko.push(`torp:${m.id}`); });
    if (ko.length) s.ko = ko;
    s.rud = r3(ship.rudder);
    // How fast she is swinging, which the helm takes time to change; her own
    // bridge predicts the swing and has to start from the server's.
    s.yr = r4(ship.yawRate || 0);
    // How far through going down she is, which takes her way off her.
    if (ship.sinking) s.sn = r3(ship.sinking.t / ship.sinking.T);
    // Her air, and where her captain has ordered her to. Both are her own
    // bridge's business: a boat's remaining oxygen is the one number that
    // decides everything she does next, and it is nobody else's.
    if (cls.dive) {
      s.ox = Math.round(ship.oxygen);
      // `dq` and not `dc`: damage-control stage got that key first, and a
      // boat ordered to thirty metres reading as damage-control stage 30 is
      // the kind of collision that is invisible until something is wrong.
      s.dq = r1(ship.depthCmd);
    }
    s.cd = ship.turrets.map((t) => Math.max(0, Math.round(t.cooldown * 10) / 10));
    // Whether the mounting is laying at this instant. A turret shaken up by a
    // burst alongside is out for a few seconds and comes back; one that is
    // finished, or that is standing over a magazine with the sea in it, is out
    // and stays out. Both read as out here, and `gc` below says which.
    s.dis = ship.turrets.map(
      (t) => (t.disabled > 0 || gunState(ship, cls, cls.turrets[t.id], t) >= 3 ? 1 : 0));
    // What condition each mounting is in: 0 sound, 1 damaged, 2 barely in
    // action, 3 finished. It is not the same question as `dis` above, which is
    // only whether the gun is laying at this instant -- a mounting can be
    // shaken up and still sound, or standing there with nothing wrong with it
    // and its magazine three feet under water.
    s.gc = ship.turrets.map((t) => gunState(ship, cls, cls.turrets[t.id], t));
    if (ship.secMounts.length && cls.secondary) {
      s.sc = ship.secMounts.map((m) => gunState(ship, cls, cls.secondary.mounts[m.id], m));
    }
    s.tp = ship.torpMounts.map((m) => Math.max(0, Math.round(m.cooldown * 10) / 10));
    // And her anti-submarine rocket launchers' reloads, for whoever is laying one.
    if (ship.rbuMounts && ship.rbuMounts.length) {
      s.rr = ship.rbuMounts.map((m) => Math.max(0, Math.round(m.cooldown * 10) / 10));
    }
    // Her missiles: how many of each are left, and how long until the next
    // of each can go, in the order her datasheet lists them (the Missouri's
    // Tomahawk first, then Harpoon); and, if she carries surface-to-air
    // missiles, whether her own fire control may put them up on its own.
    if (ship.missiles && cls.missiles) {
      const kinds = Object.keys(cls.missiles.kinds);
      s.mq = kinds.map((k) => ship.missiles.left[k] ?? 0);
      s.mc = kinds.map((k) => r1(ship.missiles.cool[k] ?? 0));
      if (vlsKinds(cls).length || samKinds(cls).length) s.ma = ship.missiles.auto ? 1 : 0;
    }
    // Which mounting her captain has gone down to, and how long every
    // secondary has to go. Both are his own business and nobody else's, so
    // they ride in the block that only goes to her own bridge.
    if (ship.manned) s.man = [ship.manned.k, ship.manned.i];
    if (ship.secMounts.length) {
      s.sd = ship.secMounts.map((m) => Math.max(0, Math.round(m.cooldown * 10) / 10));
    }
    s.sq = ship.squadrons.map((q) => (q.state === 'deck' ? Math.max(0, Math.round(q.cooldown)) : -1));
    // Whether her air officer is sending them off on his own. See autoLaunch.
    if (ship.autoLaunch) s.al = 1;
    s.rc = Math.max(0, Math.round(ship.repairCd * 10) / 10);
    // Her damage control parties: what each has been told to do, and what it
    // is doing about it this second (empty: nothing).
    if (ship.parties) s.pa = ship.parties.map((p) => [p.job || '', p.on || '']);
    // How far her damage control has got: nothing yet, shored, or pumping.
    // The bridge has to know, because the first call-away only buys her time
    // and it is the second that starts taking the water out of her.
    s.dc = Math.min(2, ship.dcStage || 0);
    // Her integrity, in tenths of a per cent, and the most of it she can ever
    // be brought back to. See stepIntegrity.
    s.ig = Math.round((ship.integrity ?? 1) * 1000);
    s.igc = Math.round((ship.igCap ?? 1) * 1000);
    // And the same in its three parts, for the three bars on her plate:
    // structural, flooding (how full of the sea she is), internal; and
    // whether the water in her is rising (1) or going down (-1).
    {
      const ic = integrityCategories(ship);
      s.ic = [Math.round(ic.structural * 1000), Math.round(ic.flooding * 1000), Math.round(ic.internal * 1000)];
      s.icr = ic.rising;
    }
    // The depth charge gear, for the bridge that works it: how many charges
    // are left in the stowage, what the pistols are wound to, how long each
    // rack and thrower has to go, and whether her own anti-submarine officer
    // has been left to get on with it.
    if (cls.depthCharges) {
      s.dcl = ship.dcLeft;
      s.dcs = ship.dcSet;
      s.dcm = ship.dcMounts.map((m) => Math.max(0, Math.round(m.cooldown * 10) / 10));
      s.dca = ship.dcAuto ? 1 : 0;
      // And what the set has hold of: range in metres and bearing relative to
      // her head. It is her own operator's report and goes nowhere else.
      const ping = state ? sonarContact(state, ship) : null;
      if (ping) s.so = [Math.round(ping.range), r3(ping.bearing)];
    }
    s.smk = ship.smoke;
    s.st = ship.shellType;
    s.ss = ship.secShell || ship.shellType;
    s.ax = Math.round(ship.aimX); s.az = Math.round(ship.aimZ);
    // Who her main battery is laid on, so the bridge you are standing on can
    // name her. It goes to her own side, and to whoever has picked her off
    // the plot and is watching her -- which is the same rule as everything
    // else in here, and is the whole of spectating.
    s.tg = ship.targetId || 0;
    s.eng = ship.engineDamage > 0 ? 1 : 0;
    s.str = ship.steeringDamage > 0 ? 1 : 0;
    s.kills = ship.kills;
    s.dmg = Math.round(ship.damageDealt);
    // The course laid off for her on the chart, if she has one. Only her own
    // side is told: it is an intention, and intentions are not visible to the
    // enemy through a pair of binoculars.
    // Her compartments: what is left of each, and how many holes are in it.
    // This is where her damage is; her integrity (above) is how much of it.
    s.sec = SECTIONS.map((k) => {
      const c = ship.sections[k.k];
      return [Math.round((c.hp / c.max) * 100), c.pens];
    });
    if (ship.wayX !== null && ship.wayZ !== null) {
      s.wx = Math.round(ship.wayX);
      s.wz = Math.round(ship.wayZ);
    }
  }
  // Alongside a harbour's quay, or on her way in to it: anybody can see a
  // ship lying at a quay. 1 on her way in, 2 made fast.
  if (ship.dock) s.dk = dockState(ship);
  return s;
}

/** Bits of a tank's state of repair, for TANK_BITS on the client. */
export const TANK_BITS = {
  engine: 1, transmission: 2, trackL: 4, trackR: 8, breech: 16, ring: 32,
  engineHit: 64, ringHit: 128, breechHit: 256,
};
export const CREW_BITS = { driver: 1, codriver: 2, gunner: 4, commander: 8, loader: 16 };

/** [broken, crew alive, seconds until a track is back on] -- see TANK_BITS and CREW_BITS. */
function tankReport(b) {
  const P = b.tk.parts;
  let m = 0;
  for (const k of ['engine', 'transmission', 'trackL', 'trackR', 'breech', 'ring']) if (P[k] >= 1) m |= TANK_BITS[k];
  if (P.engine >= 0.5) m |= TANK_BITS.engineHit;
  if (P.ring >= 0.5) m |= TANK_BITS.ringHit;
  if (P.breech >= 0.4) m |= TANK_BITS.breechHit;
  let c = 0;
  for (const [k, bit] of Object.entries(CREW_BITS)) if (P[k] < 1) c |= bit;
  const mend = (P.trackL >= 1 || P.trackR >= 1) ? Math.max(0, Math.ceil(20 - (b.tk.repair || 0))) : 0;
  return [m, c, mend];
}

/** An aeroplane's rack on the wire: `{ kind: n }`, or nothing when it is empty. */
function rackWire(p) {
  const r = planeRack(p);
  return Object.keys(r).length ? r : undefined;
}

export function buildSnapshot(state, team, viewerShipId, watchId = 0, all = false) {
  const ships = [];
  // What a captain can see out of the bridge windows, and what the plot knows.
  //
  // The two are not the same thing. `ships` is what his lookouts have actually
  // sighted -- it is what the renderer draws and what his guns can be laid on.
  // `contacts` is the rest of the order of battle, position and heading only,
  // and it goes nowhere but the plot: a fleet action is fought off a plot that
  // has everybody's last known position on it, and a captain who cannot see
  // where the enemy line is cannot manoeuvre against it.
  //
  // With one exception, and it is the whole of spectating: the ship the viewer
  // has picked off the plot and is watching comes through in full, spotted or
  // not. Watching a contact used to put the camera over an empty patch of sea
  // -- there was no hull in the snapshot to draw, because nobody had sighted
  // her -- and a captain looking at a ship through his own periscope of a
  // camera is entitled to see her.
  const contacts = [];
  // Once the action is over there is nothing left to conceal. Every hull comes
  // through in full, sunk or afloat, either side: the guns are finished and
  // what is left is a sea with wrecks burning on it, which is the one thing
  // everybody wants to look at and used to be the one thing the wire dropped.
  // And a staged battle's director, or a replay being recorded, is shown the
  // whole of it from the first tick: there is nobody to conceal it from.
  const ended = !!state.over || all;
  for (const s of state.ships) {
    const friendly = s.team === team || ended;
    const watched = s.id === watchId;
    // A wreck is still there to be seen by whoever had her in sight, for as
    // long as she is going down -- and after, flagged as under, so the
    // picture of her last moments plays out to the end rather than being cut
    // off the tick the battle stops counting her.
    const wreck = !s.alive && !!s.sinking && !!s.wreckSeen?.[team];
    if (!s.alive && !friendly && !watched && !wreck) continue;
    if (!friendly && !watched && !wreck && !s.spottedBy[team]) {
      contacts.push({
        i: s.id, x: Math.round(s.x), z: Math.round(s.z), h: r3(s.heading),
        tm: s.team, c: s.classId, n: s.name,
      });
      continue;
    }
    ships.push(shipSnapshot(s, friendly || s.id === viewerShipId || watched, state));
  }
  const visibleOwners = new Set(ships.map((s) => s.i));
  const shells = [];
  for (const sh of state.shells) {
    // A gun ashore is on both sides' charts from the start (see `batteries`
    // below), so what it fires is seen like anything else in the air.
    if (sh.team !== team && !sh.fromBattery && !visibleOwners.has(sh.owner)) continue;
    // `o` is the ship that fired her. Without it there is no way to tell one
    // ship's salvo from another's in the air, and the shell camera has to
    // follow the rounds from the ship you are actually watching.
    shells.push({
      i: sh.id, x: r1(sh.x), y: r1(sh.y), z: r1(sh.z),
      c: sh.caliber, tm: sh.team, o: sh.owner,
      // And the formation that let her go, when she is a bomb rather than a
      // round of gunfire. A bomb has no gun and no ship behind it, so `o` is
      // nothing: without this there is no way to tell one squadron's stick
      // from another's, and no way for a camera to follow one down.
      bm: sh.bomber || sh.plane || undefined,
      // A rocket rather than a shell: drawn with fins and a motor burning.
      rk: sh.rocket ? 1 : undefined,
      // An atomic bomb: drawn as itself, and followed down by anyone watching.
      nk: sh.atomic ? 1 : undefined,
    });
  }
  const torps = [];
  for (const tp of state.torps) {
    if (!all && !torpedoVisible(state, tp, team)) continue;
    torps.push({
      i: tp.id, x: r1(tp.x), z: r1(tp.z), h: r3(tp.heading), tm: tp.team,
      // Who let her go: the ship whose tubes she came out of, or whose
      // aeroplane dropped her.
      o: tp.owner,
      // Which torpedo she is, so she is drawn as herself: see torpedoKind.
      k: tp.kind || undefined,
      // Still aboard: in its tube or in the air off her side, which her model
      // draws (see fireTorpedoes) -- or falling from the aeroplane that let
      // it go, which the client draws off her rack. Nothing is in the water
      // yet.
      a: tp.aboard || tp.air > 0 ? 1 : undefined,
    });
  }
  // The missiles in the air, and on their rails. Everybody gets them: a
  // missile at three hundred feet is on every radar in the sea, and the
  // ship it is coming for has to be able to see it to do anything about it.
  const missiles = (state.missiles || []).map((m) => ({
    i: m.id, x: r1(m.x), y: r1(m.y), z: r1(m.z), h: r3(m.heading), p: r3(m.pitch),
    k: MISSILE_CODE[m.kind] || 'h', tm: m.team, o: m.owner,
    // The ship it is laid on; an interceptor's quarry is in the air, not a ship.
    tg: m.tk === 'm' || m.tk === 'a' || m.tk === 'b' ? undefined : m.target,
    // Still aboard, on its rail: drawn in its box or its canister.
    a: m.aboard ? 1 : undefined,
    // How long since it left, for its booster's flame.
    ag: m.aboard ? 0 : r1(m.age),
  }));
  // The depth charges going down. Everybody gets them, whoever dropped them:
  // eight charges going into the sea off a destroyer's quarter is eight
  // columns of white water and then a noise that is heard from the far side of
  // the action, and a boat that could not tell she was being attacked would be
  // a boat with nothing to decide.
  const charges = (state.charges || []).map((c) => ({
    i: c.id, x: r1(c.x), y: r1(c.y), z: r1(c.z), tm: c.team,
  }));
  // The mines, to the side that laid them and nobody else. A mine on its
  // mooring is under the sea and nobody can see it; the side that laid it
  // knows where, because the boat that laid it wrote it down.
  const mines = (state.mines || [])
    .filter((m) => m.team === team || ended)
    .map((m) => ({ i: m.id, x: r1(m.x), z: r1(m.z), tm: m.team, ar: m.age >= m.arming ? 1 : 0 }));
  /**
   * How the leading aeroplane of a flight has been knocked about.
   *
   * The one the player is in when he takes the flight, so it is the one his
   * damage board draws. Six parts as fractions of whole, then how hard she is
   * burning, how fast she is losing fuel, and how much of it is left.
   */
  const machineReport = (p) => {
    const a = (p.machines || []).find((m) => m.alive && !m.left) || (p.machines || [])[0];
    if (!a || !a.parts) return undefined;
    const f = (k) => r2(Math.max(0, a.parts[k].hp) / a.parts[k].max);
    return [f('engine'), f('tanks'), f('wings'), f('tail'), f('crew'), f('body'),
      r2(a.fire || 0), r2(a.leak || 0), r2(a.fuel ?? 1)];
  };

  /**
   * Where she has been shot through, for whoever can see her.
   *
   * Flat and small on purpose: five numbers a hole, packed as integers, and
   * nothing at all until something has hit her. A flight is drawn as up to
   * four machines and this is the leader's skin -- the client turns the list
   * a different way for each of the others, so no two aeroplanes in a
   * formation carry the same holes.
   *
   * Unlike the damage report above, this goes to both sides. A gunner walking
   * his tracer onto a torpedo bomber is entitled to see what he is doing to
   * her; that is the whole of what he has to go on.
   */
  const holeReport = (p) => {
    const a = (p.machines || []).find((m) => m.alive && !m.left) || (p.machines || [])[0];
    if (!a || !a.holes || !a.holes.length) return undefined;
    const out = [];
    const from = Math.max(0, a.holes.length - HOLES_SENT);
    for (let i = from; i < a.holes.length; i++) {
      const h = a.holes[i];
      out.push(
        Math.max(0, PART_KEYS.indexOf(h.k)),
        Math.round(h.x * 50), Math.round(h.y * 50), Math.round(h.z * 50),
        Math.round(h.r * 20),
      );
    }
    return out;
  };

  // Which stations of a formation are still flying, when that is not simply
  // the first so many: a machine shot out of the middle leaves a gap where she
  // was, and the gap is drawn as a gap.
  /**
   * Which machines are streaming fuel, and from where.
   *
   * Four numbers a machine: her station in the formation, and where on her
   * the hole in her tank is, in the airframe's own normalised frame (see
   * PART_BOX) in hundredths. The plume comes out of that hole, not out of the
   * middle of the formation. A machine that is alight is not on it: hers is
   * fire, not vapour. One whose tank has been holed without the hole being
   * recorded -- a till that has not yet filled -- leaks from the middle of
   * the tank on her right wing.
   */
  // A forming squadron's stations: `[station, dx, dy, dz, heading, bank, ...]`.
  const formReport = (b) => {
    if (!b.fm || !b.fmPose) return undefined;
    const out = [];
    for (const k in b.fmPose) {
      const f = b.fmPose[k];
      out.push(Number(k), r1(f.x), r1(f.y), r1(f.z), r3(f.h), r3(f.bank));
    }
    return out;
  };
  const leakReport = (p) => {
    const out = [];
    for (const a of p.machines || []) {
      if (!a.alive || a.left || !(a.leak > 0.02) || a.fire > 0.05) continue;
      let h = null;
      for (const q of a.holes || []) if (q.k === 'tanks') h = q;
      out.push(machineSlot(p, a),
        Math.round((h ? h.x : 0.24) * 100), Math.round((h ? h.y : 0) * 100),
        Math.round((h ? h.z : 0.18) * 100));
    }
    return out.length ? out : undefined;
  };

  const gaps = (p) => {
    if (!(p.machines || []).length) return undefined;
    const m = slotMask(p);
    return m === (1 << p.count) - 1 ? undefined : m;
  };

  // Not one that went down this tick after her own turn of it -- to a gunner,
  // or flown into somebody -- which stays in the array until the next tick so
  // that whatever got her can still find her, and is not an aeroplane.
  const planes = state.planes
    .filter((p) => !p.dead)
    // Once the battle is over every aeroplane still up stays on the wire, both
    // sides: they used to vanish the tick a side lost its last ship.
    .filter((p) => ended || p.team === team || state.ships.some((s) => s.team === team && s.alive))
    // `o` is the carrier she flew off and `a` is how long she has been up:
    // between them the client can put the aeroplane it watched leave the deck
    // on the squadron the simulation is flying, and climb her out rather than
    // having her appear at cruising height the instant the button is pressed.
    .map((p) => ({
      i: p.id, x: r1(p.x), z: r1(p.z), h: r3(p.heading), n: p.count, tm: p.team,
      o: p.owner, a: r1(p.life), sl: gaps(p),
      // The squadron she was formed into off the plot, to her own side only,
      // and where it has been sent.
      wg: p.wing && p.team === team ? p.wing : undefined,
      vx: p.vec && p.team === team ? Math.round(p.vec.x) : undefined,
      vz: p.vec && p.team === team ? Math.round(p.vec.z) : undefined,
      // What she has been ordered to attack off the plot, to her own side.
      ot: p.order && p.team === team ? p.order.id : undefined,
      // How high she is, and how fast she is going up or down. The client used
      // to work her height out from how long she had been up, which made every
      // aeroplane climb at the same rate to the same altitude whatever she was
      // and whatever she was doing.
      y: r1(p.y ?? 220), vy: r1(p.vy ?? 0),
      // How hard she is turning, so the client can bank her properly instead
      // of differencing two headings five times a second.
      b: r3(p.turn || 0),
      // And, when somebody is actually flying her -- a player, or one of the
      // simulation's own fighter pilots in a fight -- her real bank and the
      // pitch of her flight path. A roll, a loop or a split-S cannot be drawn
      // from a turn rate: she goes past the vertical and over on her back.
      bk: p.df || p.flown ? r3(p.bank || 0) : p.show !== undefined ? r3(p.show) : undefined,
      pt: p.df || p.flown ? r3(p.pitch || 0)
        // A dive bomber in her attack -- rolling in over the top, down the
        // dive and out of it at the bottom: the pitch of the path she is on,
        // off her climb and her speed, for the bank to go with.
        : p.show !== undefined ? r3(Math.atan2(p.vy || 0, Math.max(1, p.speed || 0))) : undefined,
      // How far her dive brakes are out, on a dive bomber in her attack or a
      // pilot who has them selected: the client opens them on her wings.
      db: p.brk > 0.01 ? Math.round(p.brk * 100) / 100 : undefined,
      // What she is: it decides what she is drawn as and what she is after.
      r: p.role || 'torpedo',
      // And which machine, where her ship flies one particular type. A
      // cruiser's scout is a float plane and nothing else, and her role says
      // only what she has been sent to do.
      k: p.type || undefined,
      // How fast she is going through the air. Her attitude is worked out
      // from this and her rate of climb -- the angle of her own flight path --
      // and without it the client had to guess a speed, so every aeroplane in
      // the game was drawn at the pitch a seventy-eight metre a second
      // aeroplane would have been at whatever she was actually doing.
      s: r1(p.speed ?? 0),
      // Whether she still has anything to drop, so a pilot's release button
      // can go dead once she has let go of it.
      d: p.dropped ? 1 : 0,
      // What is on her rack to drop, to her own side: bombs and torpedoes,
      // so a pilot's drop key is there on whatever is carrying something --
      // a Hornet with bombs under her as much as a Dauntless.
      bm: p.team === team && !p.dropped && p.bomb > 0 ? p.bomb : undefined,
      tq: p.team === team && !p.dropped && p.torp > 0 ? p.torp : undefined,
      // The missiles still on her rails, kind by kind, to her own side: what
      // a pilot has to lock on and fire (see fireLocked).
      rk: p.team === team && (p.rack || p.standoff) ? rackWire(p) : undefined,
      // The salvos of flares and chaff left in her dispenser, on a modern
      // aeroplane, to her own side: what the pilot's chaff key counts down.
      cf: p.team === team && CHAFF_LOAD[p.type] ? (p.chaff ?? CHAFF_LOAD[p.type]) : undefined,
      // Her wheels down and her hook out: in the groove coming in to land.
      gd: p.land && (p.land.leg === 'final' || p.land.leg === 'base') ? 1 : undefined,
      // How she has been knocked about: how many of her machines are trailing
      // smoke, and how much aeroplane the flight has left. A formation coming
      // out of the flak with one of its number burning is the whole of what a
      // captain sees for his close-range battery, and there was no way to draw
      // it because there was nothing behind it -- a flight was one hit-point
      // bar and every machine in it was in identical condition by definition.
      sm: p.wear && p.wear.smoking ? p.wear.smoking : undefined,
      fb: p.wear && p.wear.burning ? p.wear.burning : undefined,
      lp: leakReport(p),
      wr: p.wear && p.wear.speed < 0.995 ? r3(p.wear.speed) : undefined,
      // Which ship is flying her by hand, if anybody is. A flight has one
      // pilot: without this the plot could offer a squadron to two captains
      // at once and neither would know why she would not answer.
      pi: p.pilot || undefined,
      // And how she has been knocked about, part by part, for the pilot's own
      // damage board -- her leader's, which is the aeroplane he is in. Only
      // her own side is told: it is what a squadron reports, not what the
      // enemy can see.
      dm: p.team === team ? machineReport(p) : undefined,
      // And where she has been shot through, which both sides can see.
      hl: holeReport(p),
    }));

  // The heavy squadrons, to whoever can see them -- which at four thousand
  // feet is very nearly everybody.
  //
  // Where she is, what she is, how many of her are left and what she is doing
  // with her doors. Her orders are not here and never will be: which ship her
  // side's staff has sent her after is the plan, and a plan the other side can
  // read off the wire is not a plan. See `stepBombers`.
  const canEscort = (state.bombers || []).some((b) => b.alive && b.team === team)
    && canCallEscort(state, team);
  const bombers = (state.bombers || [])
    .filter((b) => b.alive && (b.team === team || b.spottedBy[team] || ended))
    .map((b) => ({
      i: b.id, b: b.bomberId, tm: b.team,
      x: r1(b.x), y: r1(b.y), z: r1(b.z), h: r3(b.heading),
      n: b.count, sl: gaps(b), tn: r3(b.turn || 0), s: r1(b.speed),
      // Open on the run and shut everywhere else, which is the one thing about
      // her that anybody watching can actually see.
      d: b.phase === 'run' || b.doors ? 1 : 0,
      hp: Math.round(b.hp), mx: b.maxHp,
      // Forming up over her airfield, each machine on her own: where each
      // station is off her position, which way she is heading and how she is
      // banked. See formPose.
      fp: formReport(b),
      // Which of her are streaming fuel from a holed tank, and from where.
      lp: leakReport(b),
      // Which of her gun positions have been shot out, one bit each in the
      // order of her `posts`.
      tg: (b.posts || []).reduce((m, g, k) => (g.hp <= 0 ? m | (1 << k) : m), 0) || undefined,
      // What she has left to drop, so a captain flying her can see whether
      // there is another run in her.
      ld: b.loads || 0,
      // Who has her, so nobody takes a formation somebody else is flying.
      pi: b.pilot || 0,
      // What her own side ordered her onto off the plot. The staff's choice
      // stays off the wire (see above); a player's own order is his to see.
      ot: b.order && b.team === team ? b.order.id : undefined,
      // Which squadron she is in, and where it has been sent, to her own side.
      wg: b.wing && b.team === team ? b.wing : undefined,
      // Her fighter escort, to her own side: whether she has called for one,
      // how many fighters are with her, and whether her side has a carrier
      // that could send one at all.
      ec: b.team === team && b.escortCall ? 1 : undefined,
      en: b.team === team && b.escortCall ? escortStrength(state, b) : undefined,
      ca: b.team === team && canEscort ? 1 : undefined,
      vx: b.vec && b.team === team ? Math.round(b.vec.x) : undefined,
      vz: b.vec && b.team === team ? Math.round(b.vec.z) : undefined,
      // And her leading machine's condition, for the damage board -- the same
      // nine numbers a flight sends, out of the same airframe model. Her own
      // side only: what a formation reports is not what the enemy can see.
      dm: b.team === team ? machineReport(b) : undefined,
      hl: holeReport(b),
    }));

  // The guns ashore. Both sides put them on the chart before the battle, so
  // neither is being told anything it did not already know -- what changes is
  // where each one is trained and whether it is still in action.
  const batteries = state.batteries.map((b) => ({
    i: b.id, b: b.batteryId, tm: b.team,
    // A tank to the centimetre: it moves, and a metre's rounding fifteen
    // times a second is a hull that judders across the ground.
    x: b.tank ? r2(b.x) : Math.round(b.x), z: b.tank ? r2(b.z) : Math.round(b.z), y: b.tank ? r2(b.y) : r1(b.y),
    h: r3(b.heading), a: r3(b.angle),
    hp: Math.round(b.hp), mx: b.maxHp,
    al: b.alive ? 1 : 0,
    // A rocket launcher's rails: how many rockets are on them, and whether a
    // ripple is winding up (1) or going (2) -- which is what raises the rails
    // and drops the cab shutters on the model.
    rl: b.rails ?? undefined,
    fs: b.salvo ? (b.salvo.wind > 0 ? 1 : 2) : undefined,
    // Whose hands its guns are in, if a player has taken them.
    pc: b.ctl || undefined,
    // A tank: how fast it is going, and the landing craft it is riding in
    // and where in her well, if it has not gone ashore yet.
    sp: b.tank ? r1(b.speed) : undefined,
    // Burning, which anybody can see: 1 a fire in it, 2 its ammunition.
    fi: b.tank && b.tk?.fire ? (b.tk.fire.where === 'ammo' ? 2 : 1) : undefined,
    // And what its own side knows about it: what is broken in it, who of its
    // crew is still alive, and how long until a broken track is back on.
    td: b.tank && b.team === team && b.tk ? tankReport(b) : undefined,
    ab: b.aboard || undefined,
    sl: b.aboard ? b.slot : undefined,
    // How far forward of its place in her well it has driven, going out
    // over her ramp.
    ox: b.aboard && b.out ? r2(b.out) : undefined,
    // And what only its own side is told: the mortar's pin -- where it is,
    // whose plot put it there ('h' a player's; 's', 'm' or 't' its crew's,
    // for a ship stopped, steaming straight or turning) and on which ship --
    // where the last bomb is coming down and in how long, what a battery laid
    // by hand is laid on, and how long it has still to load.
    pn: b.team === team && b.pin
      ? [Math.round(b.pin.x), Math.round(b.pin.z), b.pin.m[0], b.pin.tid || 0] : undefined,
    st: b.team === team && b.shot && b.shot.at > state.t
      ? [Math.round(b.shot.x), Math.round(b.shot.z), r1(b.shot.at - state.t)] : undefined,
    tg: b.team === team && b.ctl ? (b.ctlTarget || 0) : undefined,
    // What it has been ordered onto off the plot, left to its own crew.
    ot: b.team === team && !b.ctl && b.ordered ? b.ordered : undefined,
    cd: b.team === team && b.ctl ? r1(Math.max(0, b.cooldown)) : undefined,
  }));

  return {
    t: 'snap',
    tick: state.tick,
    time: r1(state.t),
    ships, contacts, shells, torps, missiles, charges, mines, planes, batteries, bombers,
    // The soldiers, as rows of numbers (see soldierWire), the barracks they
    // came out of, and the orders this side's squads are under.
    sd: state.inf ? soldierWire(state, team, ended) : undefined,
    bk: state.inf?.barracks?.length ? barracksWire(state) : undefined,
    sq: state.inf ? squadWire(state, team) : undefined,
    // What this side's air bases are keeping in their hangars.
    af: fieldReport(state, team),
    over: state.over ? { winner: state.winner, reason: state.reason } : null,
  };
}

export function scoreboard(state) {
  return state.ships.map((s) => ({
    id: s.id, name: s.name, team: s.team, cls: s.classId, bot: !!s.isBot,
    alive: s.alive, hp: Math.round(s.hp), maxHp: s.maxHp,
    kills: s.kills, dmg: Math.round(s.damageDealt),
    hits: s.ribbons.hits, cits: s.ribbons.cits, torps: s.ribbons.torps,
    type: getClass(s.classId).type,
  }));
}
