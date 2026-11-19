// IJN Sōryū off the owner's model of her -- "IJN Soryu" by 42manako
// (https://skfb.ly/pwnZy), under Creative Commons Attribution 4.0, credited on
// the game's Credits screen -- through build/kriss-hull.mjs: her hull, her
// island, her two funnels trunked down her starboard side and her galleries
// as one mesh in the Shokaku's paint; her flight deck taken up and its
// outline kept, for carrier.js to lay her planked runway over with her three
// lifts cut through it; and every gun the model stands on her cut free of
// her, each where the model put it.
//
// The model draws her guns as a handful of blocks and sticks, so where each
// stood is taken off it and the gun put back in its place is a better one
// the fleet already has (see build/borrow-guns.mjs): her six 12.7 cm/40 Type
// 89 twins and her 25 mm Type 96 twins are the Suzuya's, off "Japanese Light
// Cruiser 7-铃鹿（Suzuka）" by 全斗焕 (https://skfb.ly/owptP), CC BY 4.0.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-soryu-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { SHOKAKU_PAINTS, shokakuPaint } from './kriss-paints.mjs';
import { borrowGuns } from './borrow-guns.mjs';

const OUT = 'client/js/render/soryuHull.data.js';
/** A 12.7 cm twin where the model stands one: its pivot, and the box round it. */
const dp = (x, z) => ({ x: [x - 4.6, x + 4.6], y: [8.75, 12.6], z: [z - 2.6, z + 2.6], pivot: [x, z], hullToo: true });
/** A 25 mm mounting in its tub: the gun stands on the tub's floor at `y`. */
const aa = (x, z, y = 10.7) => ({ x: [x - 2.0, x + 2.0], y: [y, y + 2.6], z: [z - 1.1, z + 1.1], pivot: [x, z], hullToo: true });

await prepare({
  name: 'Soryu', script: 'build/prepare-soryu-hull.mjs',
  src: 'assets/models/ijn_soryu-maximum-compressed.glb',
  out: OUT,
  credit: '"IJN Soryu" by 42manako (https://skfb.ly/pwnZy), CC BY 4.0',
  // 227.5 m over all, 7.62 m draught.
  loa: 227.5, draught: 7.62, bow: '-z', groupDepth: 2,
  paints: SHOKAKU_PAINTS, paint: shokakuPaint, paintLines: [0],
  deckFallback: 9, hullTris: 60000, rigging: { y: 12 },
  // Her island, well forward on her starboard side.
  // Her flight deck is flat but for its after end, which the model rounds
  // down six-tenths of a metre over its last seven: laid along that too.
  carrier: { minY: 9, island: { x0: -20, x1: -8.5, z0: 24, z1: 44, face: -9 }, profile: [[-111.25, 12.15], [-104.55, 12.75], [120, 12.75]] },
  kinds: {
    // Her six 12.7 cm/40 Type 89 twins, in sponsons under her deck edge: two
    // to starboard forward and one aft, one to port forward and two aft.
    dp: { boxes: [
      dp(-14.08, 52.23), dp(-12.2, 65.7), dp(-14.1, -63.15),
      dp(13.19, 52.23), dp(14.8, -43.76), dp(14.21, -63.05),
    ], gun: { whole: true, tris: 400, error: 0.05 } },
    // Her 25 mm Type 96 twins: three on her forecastle under the fore end of
    // her flight deck, and the rest in tubs along her galleries.
    aa2: { boxes: [
      aa(-3.27, 106.9, 10.4), aa(-0.29, 106.9, 10.4), aa(2.68, 106.9, 10.4),
      aa(14.25, 36.27), aa(14.25, 30.23), aa(14.25, 24.32),
      aa(14.6, -3.37), aa(14.25, -7.6), aa(14.25, -15.59), aa(14.25, -21.31),
      aa(-15.74, -25.88), aa(-14.73, -36.16), aa(-14.73, -46.3),
      aa(-14.5, -78.19), aa(-14.5, -84.68),
    ], min: 10, gun: { whole: true, tris: 200, error: 0.05 } },
  },
});
await borrowGuns(OUT, { dp: ['suzuya', 'sec'], aa2: ['suzuya', 'aa2'] });
