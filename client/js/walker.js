// Human view: a man put down on her deck to walk about her, and over the side
// into the sea if he likes.
//
// The deck he walks on is her own plan from overhead -- the height map the
// searchlights are found off (see render/searchlights.js) -- so wherever there
// is plating there is something to stand on, at the height it is, and a deck
// house or a turret is a thing in the way rather than something he walks
// through. On her he is kept in her own frame, so she can roll and pitch and
// turn and steam at thirty knots and he goes with her; in the water he is kept
// in the world's, and she leaves him behind.

/** Everything about how a man moves, in metres and seconds. */
export const MAN = {
  eye: 1.62,       // his eye over his feet
  walk: 2.6,       // a brisk walk
  run: 5.2,        // and a run, with the stick right over or shift held
  swim: 1.15,      // breaststroke
  step: 0.8,       // the most he goes up without thinking about it
  climb: 3.2,      // the most he can haul himself up, if he keeps at it
  climbHold: 0.35, // how long he has to keep at it
  gravity: 9.8,
  jump: 3.9,       // off the deck, a little under a metre up
  float: 0.22,     // his eye over the water, swimming
  wade: 1.35,      // water deeper than this over the ground and he swims
};

// Pixel to her own frame and back; the same reading of the map the plan is
// drawn with. Column 0 is her port side (+x), row 0 her stern (-z).
// A map may be of only part of her -- the wheelhouse -- centred on (cx, cz).
function cell(map, x, z) {
  return {
    i: Math.round((((-(x - (map.cx || 0)) / map.halfX) + 1) / 2) * map.w - 0.5),
    j: Math.round((((z - (map.cz || 0)) / map.halfZ) + 1) / 2 * map.h - 0.5),
  };
}
function px(map, i, j) {
  if (i < 0 || j < 0 || i >= map.w || j >= map.h) return NaN;
  return map.heights[j * map.w + i];
}

/**
 * What a man standing at (x, z) on her has under his feet, in her frame, or
 * NaN where there is nothing of her.
 *
 * The map is what is uppermost seen from overhead, and some of that is not
 * something anybody stands on: a stay, an aerial, a rail. A line a pixel or
 * two wide -- or a gun barrel -- is read as the deck round it rather than as a
 * wall across it.
 */
export function deckAt(map, x, z) {
  if (!map) return NaN;
  const { i, j } = cell(map, x, z);
  const y = px(map, i, j);
  if (!Number.isFinite(y)) return NaN;
  // A map drawn for walking, not seen from overhead, means what it says.
  if (map.exact) return y;
  // Looked at over a metre or so of her whatever her plan's scale: a gun
  // barrel is half a metre across, and on a destroyer's plan that is three
  // pixels.
  const r = Math.max(1, Math.round(0.45 / ((2 * map.halfX) / map.w)));
  let solid = 0;
  const near = [];
  for (let dj = -r; dj <= r; dj++) {
    for (let di = -r; di <= r; di++) {
      const v = px(map, i + di, j + dj);
      if (!Number.isFinite(v)) continue;
      near.push(v);
      if (v >= y - 0.6) solid++;
    }
  }
  if (solid >= near.length * 0.4) return y;
  // Something thin: what most of the plating round it is at. Not the lowest
  // of it, which at her edge is her side going down to the water.
  near.sort((a, b) => a - b);
  return near[near.length >> 1];
}

/** Whether (x, z) in her frame is anywhere on her plan. */
export function onPlan(map, x, z) {
  return Number.isFinite(deckAt(map, x, z));
}

/** Which way the stick, and the keys, are pushing him, in her frame or the world's. */
export function heading(yaw, fwd, side) {
  // Facing (sin yaw, cos yaw); his right is (-cos yaw, sin yaw).
  return {
    x: Math.sin(yaw) * fwd - Math.cos(yaw) * side,
    z: Math.cos(yaw) * fwd + Math.sin(yaw) * side,
  };
}

/** A man, stood on her at (x, z), facing `yaw` from her bow. */
export function freshMan(map, x, z, yaw = 0) {
  const y = deckAt(map, x, z);
  return {
    aboard: true, x, z, y: Number.isFinite(y) ? y : 0, vy: 0,
    yaw, pitch: 0, grounded: true, held: 0, swimming: false,
  };
}

/**
 * One step of him on her deck. `move` is { fwd, side, run, jump }, each from
 * -1 to 1 (or a flag). Returns 'overboard' the moment he has nothing under
 * him, which is the caller's to turn into the world's frame.
 */
export function stepDeck(man, move, dt, map) {
  const speed = (move.run ? MAN.run : MAN.walk);
  const d = heading(man.yaw, move.fwd || 0, move.side || 0);
  const mag = Math.hypot(d.x, d.z);
  const k = mag > 1 ? 1 / mag : 1;
  const dx = d.x * k * speed * dt;
  const dz = d.z * k * speed * dt;
  let pushing = false;
  if (dx || dz) {
    // Along each axis on its own as well as both together, so he slides
    // along a bulkhead instead of sticking to it.
    const tries = [[dx, dz], [dx, 0], [0, dz]];
    let moved = false;
    for (const [tx, tz] of tries) {
      if (!tx && !tz) continue;
      const nx = man.x + tx, nz = man.z + tz;
      const g = deckAt(map, nx, nz);
      // Over the edge of her: there is nothing there to stand on.
      if (!Number.isFinite(g)) { man.x = nx; man.z = nz; return 'overboard'; }
      const rise = g - man.y;
      if (rise <= MAN.step) { man.x = nx; man.z = nz; moved = true; break; }
      // Too high to step up: a ladder's worth he can haul himself up if he
      // keeps pushing at it, and anything higher is a wall.
      if (rise <= MAN.climb && tx === dx && tz === dz) pushing = true;
    }
    if (!moved && pushing) {
      man.held += dt;
      if (man.held >= MAN.climbHold) {
        man.x += dx; man.z += dz;
        man.y = deckAt(map, man.x, man.z);
        man.vy = 0;
        man.held = 0;
      }
    }
  }
  if (!pushing) man.held = 0;
  // Feet on whatever is under them now; falling to it if it is lower.
  const floor = deckAt(map, man.x, man.z);
  if (!Number.isFinite(floor)) return 'overboard';
  if (man.grounded && move.jump) { man.vy = MAN.jump; man.grounded = false; }
  if (!man.grounded || man.y > floor + 0.05) {
    man.vy -= MAN.gravity * dt;
    man.y += man.vy * dt;
    if (man.y <= floor) { man.y = floor; man.vy = 0; man.grounded = true; } else man.grounded = false;
  } else if (floor - man.y <= MAN.climb) {
    man.y = floor;
    man.vy = 0;
    man.grounded = true;
  }
  // Higher than that and he has been put inside something, not on it: he
  // stays where he is rather than being stood on top of a wall.
  return null;
}

/**
 * One step of him off her: falling, swimming, or ashore. `env` is
 * { sea(x, z), ground(x, z), blocked(x, z) } -- the water's surface, the land
 * under it (very negative out at sea), and whether her hull is in the way --
 * all in the world's frame.
 */
export function stepWater(man, move, dt, env) {
  const sea = env.sea(man.x, man.z);
  const ground = env.ground(man.x, man.z);
  // Swimming where the water is too deep to stand in; walking where it is not.
  const wading = ground > sea - MAN.wade;
  const speed = wading ? (move.run ? MAN.run : MAN.walk) * (ground < sea ? 0.55 : 1) : MAN.swim * (move.run ? 1.5 : 1);
  const d = heading(man.yaw, move.fwd || 0, move.side || 0);
  const mag = Math.hypot(d.x, d.z);
  const k = mag > 1 ? 1 / mag : 1;
  const dx = d.x * k * speed * dt;
  const dz = d.z * k * speed * dt;
  if (dx || dz) {
    for (const [tx, tz] of [[dx, dz], [dx, 0], [0, dz]]) {
      if (!tx && !tz) continue;
      const nx = man.x + tx, nz = man.z + tz;
      if (env.blocked(nx, nz)) continue;
      // Ashore he walks up a beach, not a cliff.
      const g = env.ground(nx, nz);
      if (g > Math.max(man.y, env.sea(nx, nz) - MAN.wade) + MAN.step * 1.5) continue;
      man.x = nx; man.z = nz;
      break;
    }
  }
  const s2 = env.sea(man.x, man.z);
  const g2 = env.ground(man.x, man.z);
  // Where his feet would be: on the bottom if he can stand, and treading
  // water with his eye just over the surface if he cannot.
  const swimFeet = s2 + MAN.float - MAN.eye;
  const stand = g2 > s2 - MAN.wade;
  const rest = stand ? Math.max(g2, swimFeet) : swimFeet;
  const falling = man.y > rest + 0.05 && !man.swimming && !man.grounded;
  if (falling || (man.y > rest + 0.3 && stand)) {
    man.vy -= MAN.gravity * dt;
    man.y += man.vy * dt;
    if (man.y <= rest) {
      const splash = !stand && man.vy < -3;
      man.y = rest; man.vy = 0;
      man.swimming = !stand;
      man.grounded = stand;
      return splash ? 'splash' : null;
    }
    return null;
  }
  // In the water he rides the swell exactly; on his feet he is eased up the
  // beach rather than snapped up it.
  man.y = stand ? man.y + (rest - man.y) * Math.min(1, dt * 8) : rest;
  man.vy = 0;
  man.swimming = !stand;
  man.grounded = stand;
  if (stand && move.jump) { man.vy = MAN.jump; man.grounded = false; }
  return null;
}

/**
 * A plan for a ship whose model could not be drawn from overhead: her
 * waterplane as an ellipse with a flat deck at her freeboard. Enough to stand
 * on, which is all it is for.
 */
export function roughPlan(length, beam, deck) {
  const halfZ = length * 0.52 + 2, halfX = beam * 0.56 + 1;
  const w = 48, h = Math.max(96, Math.min(512, Math.round(w * (halfZ / halfX))));
  const heights = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = ((i + 0.5) / w * 2 - 1) * -halfX;
      const z = ((j + 0.5) / h * 2 - 1) * halfZ;
      const e = (x / (beam / 2)) ** 2 + (z / (length / 2)) ** 2;
      heights[j * w + i] = e <= 1 ? deck : NaN;
    }
  }
  return { w, h, halfX, halfZ, heights };
}

/** Whereabouts on her a place is, the way a sailor would say it. */
export function placeOn(length, beam, x, z) {
  const f = z / (length / 2);
  const along = f > 0.55 ? 'Forecastle' : f > 0.18 ? 'Forward' : f > -0.18 ? 'Amidships'
    : f > -0.55 ? 'Aft' : 'Quarterdeck';
  const side = x > beam * 0.12 ? ', port side' : x < -beam * 0.12 ? ', starboard side' : '';
  return along + side;
}
