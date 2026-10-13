// The bridge orders, fetched the first time a battle wants them: half a
// megabyte of recorded voice that the harbour has no use for. Kept here, beside
// the data, so a split build finds the file next to the page the way it finds
// her hulls (see build/standalone.mjs).
let lines = null;

/** The orders by nation and order, as base64 MP3: see build/voice-lines.py. */
export function loadVoiceLines() {
  if (!lines) lines = import('./voices.data.js').then((m) => m.VOICE_LINES).catch(() => { lines = null; return null; });
  return lines;
}
