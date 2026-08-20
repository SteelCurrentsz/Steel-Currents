// Fullscreen and orientation.
//
// Browsers only grant fullscreen from inside a user gesture, so every entry
// point here is called straight from a click or a tap — never from a timer or
// a network reply. Support is uneven (iPhone Safari has no element fullscreen
// at all), so every call is best-effort and the game plays on without it.

const doc = () => document;

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

export function supported() {
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

/** Go fullscreen. Must be called synchronously from a user gesture. */
export async function enter(el = document.documentElement) {
  if (isFullscreen()) return true;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return false;
  try {
    await req.call(el, { navigationUI: 'hide' });
    return true;
  } catch {
    return false;
  }
}

export async function exit() {
  if (!isFullscreen()) return;
  const fn = doc().exitFullscreen || doc().webkitExitFullscreen;
  try { await fn?.call(doc()); } catch { /* already out */ }
}

export async function toggle(el = document.documentElement) {
  if (isFullscreen()) { await exit(); return false; }
  return enter(el);
}

/** Ask the device to stay landscape. Only works once fullscreen, and only on
 *  browsers that implement it — a refusal is not a problem worth reporting. */
export async function lockLandscape() {
  try { await screen.orientation?.lock?.('landscape'); } catch { /* not permitted */ }
}

/** What a captain going into battle wants: the whole screen, the right way up. */
export async function enterBattleView(el) {
  const ok = await enter(el);
  if (ok) await lockLandscape();
  return ok;
}

/** Keep a toggle button's label honest as the state changes, including when the
 *  user leaves fullscreen with Escape rather than the button. */
export function onChange(fn) {
  document.addEventListener('fullscreenchange', () => fn(isFullscreen()));
  document.addEventListener('webkitfullscreenchange', () => fn(isFullscreen()));
}
