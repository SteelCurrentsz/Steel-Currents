// RF Admiral Ushakov off the owner's model of her -- "Admiral Ushakov" by
// SB-129 (https://skfb.ly/oDLMP), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/kriss-hull.mjs: her
// hull, her tower, her two funnels and her masts as one mesh, and every
// mounting of hers that trains cut free of her, each as the model drew it:
// her three triple 406 mm, two forward and one aft; her eight twin 130 mm,
// four on her centreline and four in her waist; her twelve twin 100 mm about
// her superstructure; and her fourteen quadruple 37 mm.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-ushakov-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RN_PAINTS, rnPaint, BOOT } from './kriss-paints.mjs';

/** A box round a mounting, as the model's plan of her measures it, with `p` metres to spare all round. */
const box = (x0, x1, y0, y1, z0, z1, p = 0.3) => ({ x: [x0 - p, x1 + p], y: [y0 - p, y1 + p], z: [z0 - p, z1 + p], hullToo: true });
const pair = (x0, x1, y0, y1, z0, z1, p) => [box(x0, x1, y0, y1, z0, z1, p), box(-x1, -x0, y0, y1, z0, z1, p)];

await prepare({
  name: 'Admiral Ushakov', script: 'build/prepare-ushakov-hull.mjs',
  src: 'assets/models/admiral_ushakov-maximum-compressed.glb',
  out: 'client/js/render/ushakovHull.data.js',
  credit: '"Admiral Ushakov" by SB-129 (https://skfb.ly/oDLMP), CC BY 4.0',
  // 270 m over all, 10.5 m draught.
  loa: 270, draught: 10.5, bow: '+z', groupDepth: 2,
  paints: RN_PAINTS, paint: rnPaint, paintLines: [0, BOOT],
  deckFallback: 7, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 16 },
  kinds: {
    // Her three triple 406 mm: No.2 superfiring over No.1 forward, trained
    // ahead, and No.3 aft, trained astern.
    main: { boxes: [
      box(-6.9, 6.9, 9.6, 15.6, 26.6, 56.9, 0),
      box(-6.9, 6.9, 6.0, 11.4, 49.5, 81.0, 0),
      box(-6.9, 6.9, 5.5, 10.8, -95.0, -64.0, 0),
    ], gun: { whole: true, tris: 4000, error: 0.004, rests: [0, 0, Math.PI] } },
    // Her eight twin 130 mm: two superfiring over No.2 and two over No.3 on
    // her centreline, and two a side in her waist.
    sec: { boxes: [
      box(-2.53, 2.53, 12.82, 15.87, 18.88, 27.27),
      box(-2.53, 2.53, 14.88, 17.94, 10.63, 19.01),
      ...pair(10.15, 15.2, 5.09, 8.15, -1.38, 7.0),
      ...pair(10.15, 15.2, 5.09, 8.15, -43.21, -34.82),
      box(-2.53, 2.53, 10.93, 13.99, -56.74, -48.36),
      box(-2.53, 2.53, 8.9, 11.96, -65.02, -56.64),
    ], gun: { whole: true, tris: 1800, error: 0.008, rests: [0, 0, undefined, undefined, undefined, undefined, Math.PI, Math.PI] } },
    // Her twelve twin 100 mm, six a side about her superstructure.
    dp: { boxes: [
      ...pair(5.78, 9.82, 6.66, 9.48, 5.82, 9.85),
      ...pair(6.58, 10.62, 8.52, 11.34, -6.2, -2.17),
      ...pair(8.18, 12.21, 8.52, 11.34, -15.25, -11.22),
      ...pair(8.18, 12.21, 8.51, 11.33, -25.76, -21.74),
      ...pair(6.58, 10.62, 8.54, 11.35, -34.79, -30.77),
      ...pair(4.99, 9.02, 6.66, 9.47, -45.3, -41.27),
    ], gun: { whole: true, tris: 1400, error: 0.01 } },
    // Her fourteen quadruple 37 mm.
    aa2: { boxes: [
      ...pair(7.46, 9.93, 4.73, 6.77, 23.64, 26.11, 0.2),
      ...pair(9.21, 11.62, 4.66, 6.7, 16.94, 18.93, 0.2),
      ...pair(5.93, 8.34, 10.37, 12.41, -9.71, -7.73, 0.2),
      ...pair(5.93, 8.34, 11.57, 13.61, -16.48, -14.5, 0.2),
      ...pair(5.93, 8.34, 11.57, 13.61, -22.51, -20.53, 0.2),
      ...pair(5.93, 8.34, 10.37, 12.41, -29.27, -27.29, 0.2),
      ...pair(4.55, 6.53, 6.93, 8.97, -122.88, -120.48, 0.2),
    ], gun: { whole: true, tris: 900, error: 0.01 } },
  },
});
