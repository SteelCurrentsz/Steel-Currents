// The bridge orders: half a megabyte of recorded voice. Kept here, beside the
// data, so a split build finds the file next to the page the way it finds her
// hulls (see build/standalone.mjs).
//
// Fetched as the game starts rather than the first time a battle wants them.
// The game plays with no connection at all, and a page that has loaded is all
// the connection it gets: an order shouted twenty minutes into an action, with
// the wifi off, has to come out of something that was fetched while there was
// still wifi to fetch it with.
let lines = null;

/** The orders by nation and order, as base64 MP3: see build/voice-lines.py. */
export function loadVoiceLines() {
  if (!lines) lines = import('./voices.data.js').then((m) => m.VOICE_LINES).catch(() => { lines = null; return null; });
  return lines;
}

loadVoiceLines();
