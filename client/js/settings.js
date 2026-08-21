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

export const QUALITY = {
  low: { oceanSegments: 140, oceanSize: 22000, pixelRatio: 1, shadows: false, particles: 0.5, drawDistance: 26000 },
  medium: { oceanSegments: 260, oceanSize: 26000, pixelRatio: 1.25, shadows: true, particles: 1, drawDistance: 30000 },
  high: { oceanSegments: 420, oceanSize: 30000, pixelRatio: 1.6, shadows: true, particles: 1.7, drawDistance: 34000 },
};
