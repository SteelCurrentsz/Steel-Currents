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
  shake: true,
  metric: true,
  // How a carrier is stored, when a captain has re-balanced her in the yard.
  // Null means she sails with what her datasheet says.
  airGroup: null,
};

let cache = null;

export function getSettings() {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    cache = { ...DEFAULTS };
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
  high: { oceanSegments: 420, oceanSize: 30000, pixelRatio: 1.6, shadows: true, particles: 1.7, drawDistance: 34000, plating: 1.6, wakeMap: 2048 },
};
