// The United States Navy's cruisers of 1943-45 in Measure 22 or the like: haze
// grey over hull and upperworks, deck blue on her decks, a black boot topping
// and red under water -- shared by the cruisers drawn off the owner's models
// by build/kriss-hull.mjs.
import { BOOT } from './kriss-paints.mjs';
export const USN_CRUISER_PAINTS = { grey: 0x7c858e, deck: 0x3e4856, boot: 0x15181c, bottom: 0x7a3228, dark: 0x4d545c };
export function usnCruiserPaint(f) {
  if (f.kind === 'screw') return 'dark';
  if (f.cy < -0.02) return 'bottom';
  if (f.shell && f.cy < BOOT) return 'boot';
  if (f.kind) return 'grey';
  if (f.up && f.cy > 2 && Math.abs(f.ny) > 0.9) return 'deck';
  return 'grey';
}
export const light = { paints: USN_CRUISER_PAINTS, paint: usnCruiserPaint, paintLines: [0, BOOT] };
