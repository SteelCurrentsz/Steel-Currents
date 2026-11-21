// Player preferences, persisted locally.

const KEY = 'steel-currents:settings';

const DEFAULTS = {
  name: 'Captain',
  ship: 'cleveland',
  volume: 70,
  sensitivity: 1,
  quality: 'medium',
  botSkill: 'regular',
  shadows: true,
  // Whether your own guns kick the camera when they fire.
  recoil: true,
  // The penetration camera: the cut to her section when one of your rounds
  // strikes a ship. See render/pencam.js.
  penCam: true,
  // Whether a side's shells, torpedoes, charges, aircraft and stems hurt its
  // own ships. Off until a captain turns it on.
  friendlyFire: false,
  ultraRealism: false,
  // Whether a Monster One nobody is conning -- one on his own side, and one
  // on the enemy's -- uses her atomic breath of her own accord.
  moBreathAlly: true,
  moBreathEnemy: true,
  // Potato mode: everything the picture can give up to keep a slow machine
  // smooth -- a lighter sea, thin smoke, small things not drawn -- while
  // keeping the picture sharp.
  // Over whatever the render quality says.
  potato: false,
  // How a carrier is stored, when a captain has re-balanced her in the yard.
  // Null means she sails with what her datasheet says.
  airGroup: null,
  // How the captain loads a VLS: { kind: cells }, or null for the datasheet's.
  vls: null,
  // How many soldiers the next landing craft commissioned embarks, or null
  // for a full well.
  troops: null,
};

let cache = null;

/**
 * What was stored, over the defaults.
 *
 * The switch for your own guns moving the camera used to be called `shake`,
 * when what it did was shake it. A captain who turned that off did not want
 * the camera moving when their guns fired, and that is still what they get.
 */
export function readSettings(stored = {}) {
  const out = { ...DEFAULTS, ...stored };
  if (stored.recoil === undefined && typeof stored.shake === 'boolean') out.recoil = stored.shake;
  delete out.shake;
  return out;
}

export function getSettings() {
  if (cache) return cache;
  try {
    cache = readSettings(JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch {
    cache = readSettings();
  }
  return cache;
}

export function setSettings(patch) {
  cache = { ...getSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* private mode */ }
  return cache;
}

// `plating` is how small a piece of a ship's side is, in square metres, and so
// how small a hole a shell can make in her. It costs vertices: a fleet carrier
// cut to a metre and a half is a quarter of a million triangles, which is
// nothing on a desktop and a great deal on a telephone.
// `wakeMap` is how many texels square each of the two wake patches gets. The
// near one is a kilometre across, so 1024 is a metre a texel -- fine enough to
// draw the shoulder of a bow wave. It is the one number that decides how
// detailed a wake can be, because a wake is a picture of the water now.
export const QUALITY = {
  low: { oceanSegments: 140, oceanSize: 22000, pixelRatio: 1, shadows: false, particles: 0.5, drawDistance: 26000, plating: 8, wakeMap: 512 },
  medium: { oceanSegments: 260, oceanSize: 26000, pixelRatio: 1.25, shadows: true, particles: 1, drawDistance: 30000, plating: 3, wakeMap: 1024 },
  // Potato: the frame rate over everything else -- but not by drawing fewer
  // pixels. Dropping the resolution is what made it look like a pixelated
  // old game; what it gives up instead is work per pixel and per object. The
  // lightweight sea (fewer octaves of chop and foam), a third of its
  // vertices, a quarter of the smoke and spray, a shorter horizon, coarse
  // plating, small things left out and coarse copies of the rest sooner, and
  // half the wake map's texels. Drawn at the screen's own pixel (never under
  // nine in ten of it), with every frame shown.
  potato: { oceanSegments: 96, oceanSize: 18000, pixelRatio: 1, shadows: false, particles: 0.25, drawDistance: 20000, plating: 14, wakeMap: 256,
    cullPx: 2, lodPx: 3, floor: 0.9, oceanLite: true },
  high: { oceanSegments: 420, oceanSize: 30000, pixelRatio: 1.6, shadows: true, particles: 1.7, drawDistance: 34000, plating: 1.6, wakeMap: 2048 },
};

/** The name of the preset in force: potato mode over the chosen quality. */
export function qualityName(s = getSettings()) {
  return s.potato ? 'potato' : (QUALITY[s.quality] ? s.quality : 'medium');
}

/** The preset in force. */
export function currentQuality(s = getSettings()) {
  return QUALITY[qualityName(s)];
}
