// IJN Ise, drawn from the owner's model of her sister Hyuga.
//
// The second pair of Japan's Great War dreadnoughts as rebuilt in 1937: two
// hundred and sixteen metres, twelve 35.6 cm/45 in six twin turrets -- two
// forward, two back to back amidships and two aft -- a pagoda of a bridge, a
// single funnel and twenty-five knots.
//
// Her hull, her pagoda, her funnel and her mainmast, her turrets and her
// guns are the model -- "Japanese Battleship Hyuga" by kriss50
// (https://skfb.ly/ptuAM), under Creative Commons Attribution 4.0; the two
// sisters were alike to the rivet in 1941 -- cut by
// build/prepare-ise-hull.mjs (see build/kriss-hull.mjs), and put together by
// krissShip.js with her armour and her insides.
//
// The model draws her sixteen 14 cm in the battery under her upper deck, from
// abaft her funnel to No.2's barbette, and cut free of her they train (see
// build/prepare-ise-hull.mjs). But it draws nothing behind them: no inner
// wall to the battery, so that from abeam the sea showed straight through
// her between her two decks, gun to gun, from one side to the other; and
// under her bridge, between the after end of her forward 12.7 cm sponson and
// where the wall of the deck over the battery takes up again, that wall is
// not drawn either. Both are plated here.
import * as D from './iseHull.data.js';
import { krissShip } from './krissShip.js';
import { box } from './shipkit.js';

const SHIP = krissShip({
  id: 'ise', data: D,
  paints: { steel: 0x6e7175, steelDark: 0x4d5155, gun: 0x6e7175, gunDark: 0x4d5155, deckDark: 0x6b5242 },
  // Her belt from forward of No.1 to abaft No.6, her armour deck over it, and
  // the barbettes of her six turrets.
  armour: { citadel: [-70, 65], deck: 4.4, foot: -3.0, inset: 0.6, barbette: 4.4 },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, deckAt, MOUNT_SEATS } = SHIP;
export const iseSurfaceY = SHIP.surfaceY;
/**
 * The wall of the deck over her battery where the model has none, under her
 * bridge: from her upper deck to the deck over it, at the 8.8 m the wall
 * stands out either side, along her the gap's length.
 */
export const BRIDGE_GAP = { x: 8.8, y0: 7.05, y1: 9.56, z0: 25.4, z1: 28.35, t: 0.12 };
/**
 * The inner wall of her battery: from the deck the guns stand on to the deck
 * over them, inboard of every gun's shield however it is trained -- a metre
 * and a half in from the middle of each -- from where the battery opens abaft
 * her funnel to where it closes at No.2's barbette. [z, x] along her, port
 * side; the starboard is its mirror.
 */
export const BATTERY_WALL = {
  y0: 4.35, y1: 7.12, t: 0.1,
  line: [[-9.2, 9.5], [4.8, 9.7], [10.0, 11.0], [19.2, 11.0], [26.5, 10.9], [34.2, 10.5], [41.2, 9.9], [49.0, 8.9], [54.8, 7.2], [57.8, 6.4]],
};
function batteryWalls(g, { M }) {
  const w = BRIDGE_GAP;
  for (const sgn of [-1, 1]) {
    box(g, M.steel, w.t, w.y1 - w.y0, w.z1 - w.z0, sgn * (w.x - w.t / 2), (w.y0 + w.y1) / 2, (w.z0 + w.z1) / 2);
  }
  const b = BATTERY_WALL;
  for (const sgn of [-1, 1]) {
    for (let i = 1; i < b.line.length; i++) {
      const [za, xa] = b.line[i - 1], [zb, xb] = b.line[i];
      const len = Math.hypot(zb - za, xb - xa);
      box(g, M.steel, b.t, b.y1 - b.y0, len + 0.06, sgn * (xa + xb) / 2, (b.y0 + b.y1) / 2, (za + zb) / 2,
        Math.atan2(sgn * (xb - xa), zb - za));
    }
  }
}
export const buildIse = () => SHIP.build(batteryWalls);
export const iseParts = SHIP.parts;
