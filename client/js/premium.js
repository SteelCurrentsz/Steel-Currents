// The Premium Equipment store: what it takes to sail one of its hulls.
//
// While the game is in development every premium hull is free to sail, for
// anybody. Once it is published, a captain unlocks one by watching an
// advertisement: set ADS_REQUIRED to true, and wire an ad network's rewarded
// video into `playRewardedAd` below. A hull once unlocked stays unlocked on
// that device.

/** Whether a premium hull has to be unlocked before she can sail. */
export const ADS_REQUIRED = false;

const KEY = 'steel-currents:premium-unlocked';

function unlockedSet() {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

/** Whether this captain can sail the premium hull `id` now. */
export function premiumUnlocked(id) {
  return !ADS_REQUIRED || unlockedSet().has(id);
}

/**
 * The advertisement, played through to the end. Resolves true once the
 * captain has watched it all and earned the reward, false otherwise. There is
 * no ad network in the game yet, so for now nothing plays and nothing is
 * earned.
 */
async function playRewardedAd() {
  return false;
}

/**
 * Watch an ad to unlock the premium hull `id`. Resolves whether she is
 * unlocked afterwards.
 */
export async function unlockWithAd(id) {
  if (premiumUnlocked(id)) return true;
  if (!(await playRewardedAd())) return false;
  const set = unlockedSet();
  set.add(id);
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify([...set])); } catch { /* private mode */ }
  return true;
}
