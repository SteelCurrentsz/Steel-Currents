// Lorraine off the owner's model of her -- "French battleship Lorraine" by
// 全斗焕 (https://skfb.ly/o6xMN), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/kriss-hull.mjs: her
// hull, her tower, her funnel, her masts and her flight deck as one mesh, and
// every mounting of hers that trains cut free of her, each as the model drew
// it: her three triple 340 mm, two forward and one aft; her twelve 138.6 mm,
// six a side; her three twin 100 mm on her centreline; her twelve twin
// 37 mm; and her four quadruple 13.2 mm.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-lorraine-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { MN_PAINTS, mnPaint, BOOT } from './kriss-paints.mjs';

/** A box round a mounting, as the model's plan of her measures it, with `p` metres to spare all round. */
const box = (x0, x1, y0, y1, z0, z1, p = 0.3) => ({ x: [x0 - p, x1 + p], y: [y0 - p, y1 + p], z: [z0 - p, z1 + p], hullToo: true });
const pair = (x0, x1, y0, y1, z0, z1, p) => [box(x0, x1, y0, y1, z0, z1, p), box(-x1, -x0, y0, y1, z0, z1, p)];

await prepare({
  name: 'Lorraine', script: 'build/prepare-lorraine-hull.mjs',
  src: 'assets/models/french_battleship_lorraine-maximum-compressed.glb',
  out: 'client/js/render/lorraineHull.data.js',
  credit: '"French battleship Lorraine" by 全斗焕 (https://skfb.ly/o6xMN), CC BY 4.0',
  // 166 m over all. The model's hull is drawn shallower than hers, so she is
  // floated 7 m deep, not her 9.8 m, to keep her freeboard.
  loa: 166, draught: 7, bow: '+z', groupDepth: 2,
  paints: MN_PAINTS, paint: mnPaint, paintLines: [0, BOOT],
  deckFallback: 3, hullTris: 80000,
  rigging: { y: 10 },
  kinds: {
    // Her three triple 340 mm: No.1 on her forecastle and No.2 superfiring
    // over it, trained ahead, and No.3 aft, trained astern. No.1 is taken
    // first.
    main: { boxes: [
      box(-4.8, 4.8, 3.6, 6.55, 32.5, 50.8, 0),
      box(-4.8, 4.8, 4.6, 8.95, 15.4, 36.0, 0),
      box(-4.8, 4.8, 3.6, 6.6, -56.8, -38.5, 0),
    ], gun: { whole: true, tris: 3200, error: 0.005, rests: [0, 0, Math.PI] } },
    // Her twelve 138.6 mm Model 1910, six a side.
    sec: { boxes: [
      ...pair(7.52, 10.17, 3.01, 4.64, 6.16, 10.6),
      ...pair(7.52, 10.17, 3.63, 5.41, 1.21, 5.65),
      ...pair(7.52, 10.17, 4.39, 6.17, -3.77, 0.67),
      ...pair(7.52, 10.17, 4.39, 6.17, -18.56, -14.12),
      ...pair(7.52, 10.17, 3.63, 5.41, -23.54, -19.1),
      ...pair(7.52, 10.17, 3.01, 4.64, -28.49, -24.05),
    ], gun: { whole: true, tris: 900, error: 0.01 } },
    // Her three twin 100 mm on her centreline: one before her tower, trained
    // ahead, and two aft, the one superfiring over the other, trained astern.
    dp: { boxes: [
      box(-2.19, 2.18, 8.18, 9.84, 9.36, 16.45),
      box(-2.19, 2.18, 7.5, 9.16, -33.43, -26.34),
      box(-2.19, 2.18, 5.75, 7.41, -39.64, -32.55),
    ], gun: { whole: true, tris: 1200, error: 0.01, rests: [0, Math.PI, Math.PI] } },
    // Her twelve twin 37 mm along her decks.
    aa2: { boxes: [
      ...pair(6.97, 9.9, 3.16, 5.01, 17.98, 20.31, 0.15),
      ...pair(3.93, 7.4, 4.37, 6.63, 12.19, 14.58, 0.15),
      ...pair(7.85, 11.3, 4.98, 7.24, -7.35, -4.97, 0.15),
      ...pair(7.85, 11.3, 4.98, 7.24, -12.96, -10.58, 0.15),
      ...pair(2.17, 5.75, 4.37, 6.63, -32.8, -30.42, 0.15),
      ...pair(6.97, 9.9, 3.16, 5.01, -35.79, -33.44, 0.15),
    ], gun: { whole: true, tris: 800, error: 0.01 } },
    // Her four quadruple 13.2 mm Hotchkiss about her tower.
    aa3: { boxes: [
      ...pair(3.98, 6.99, 7.33, 9.91, -0.22, 2.83, 0.2),
      ...pair(3.18, 6.19, 9.92, 12.49, -14.21, -11.15, 0.2),
    ], gun: { whole: true, tris: 600, error: 0.01 } },
  },
});
