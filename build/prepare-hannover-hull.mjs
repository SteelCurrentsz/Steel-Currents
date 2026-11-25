// KMS Hannover off the owner's model of her -- "Hannover (World of Warships)"
// by KojfDiscord (https://skfb.ly/pz8OU), under Creative Commons Attribution
// 4.0, credited on the game's Credits screen -- through build/kriss-hull.mjs:
// her hull, her tower, her two funnels and her masts as one mesh, and every
// mounting of hers that trains cut free of her, each as the model drew it:
// her four twin 406 mm, two forward and two aft, with the light guns on
// their roofs; her sixteen twin 128 mm, eight a side; and her twelve twin
// 37 mm.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-hannover-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { KM_PAINTS, kmPaint, BOOT } from './kriss-paints.mjs';

/** Her paint: the Kriegsmarine's greys, and her weather deck planked. */
const PAINTS = { ...KM_PAINTS, wood: 0x9c8a6a };
const paint = (f) => (f.up && !f.kind && f.cy > 2 && f.cy < 9 && Math.abs(f.ny) > 0.97 ? 'wood' : kmPaint(f));

/** A box round a mounting, as the model's plan of her measures it, with `p` metres to spare all round. */
const box = (x0, x1, y0, y1, z0, z1, p = 0.3) => ({ x: [x0 - p, x1 + p], y: [y0 - p, y1 + p], z: [z0 - p, z1 + p], hullToo: true });
const pair = (x0, x1, y0, y1, z0, z1, p) => [box(x0, x1, y0, y1, z0, z1, p), box(-x1, -x0, y0, y1, z0, z1, p)];

await prepare({
  name: 'Hannover', script: 'build/prepare-hannover-hull.mjs',
  src: 'assets/models/hannover_world_of_warships-maximum-compressed.glb',
  out: 'client/js/render/hannoverHull.data.js',
  credit: '"Hannover (World of Warships)" by KojfDiscord (https://skfb.ly/pz8OU), CC BY 4.0',
  // 277.8 m over all, 10.5 m draught: the H-39 design's.
  loa: 277.8, draught: 10.5, bow: '+z', groupDepth: 2,
  paints: PAINTS, paint, paintLines: [0, BOOT],
  deckFallback: 5, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 14 },
  kinds: {
    // Her four twin 406 mm: Anton on her forecastle and Bruno superfiring
    // over it, trained ahead; Caesar superfiring over Dora aft, trained
    // astern. Each low turret is taken first, so the one that fires over it
    // keeps only what stands over its roof.
    main: { boxes: [
      box(-6.5, 6.5, 4.9, 8.65, 62.8, 90.5, 0),
      box(-6.5, 6.5, 8.1, 15.2, 43.9, 71.6, 0),
      box(-6.5, 6.5, 4.9, 8.65, -96.2, -68.5, 0),
      box(-6.5, 6.5, 8.1, 15.2, -77.2, -49.6, 0),
    ], gun: { whole: true, tris: 4000, error: 0.004, rests: [0, 0, Math.PI, Math.PI] } },
    // Her sixteen twin 128 mm, eight a side: four on her upper deck and
    // four on her shelter deck over them.
    sec: { boxes: [
      ...pair(6.75, 10.43, 4.15, 7.11, 26.11, 34.18),
      ...pair(7.11, 10.79, 6.49, 9.46, 16.35, 24.41),
      ...pair(13.37, 17.05, 3.97, 6.94, 4.06, 12.12),
      ...pair(9.61, 13.29, 6.49, 9.46, -2.24, 5.82),
      ...pair(8.77, 12.45, 6.49, 9.46, -24.07, -16.0),
      ...pair(13.37, 17.05, 3.98, 6.94, -28.79, -20.73),
      ...pair(6.11, 9.79, 6.49, 9.46, -33.52, -25.46),
      ...pair(8.73, 12.41, 4.09, 7.05, -42.78, -34.71),
    ], gun: { whole: true, tris: 1600, error: 0.008 } },
    // Her twelve twin 37 mm on her decks.
    aa2: { boxes: [
      box(-1.12, 1.12, 4.9, 8.09, 96.06, 100.34, 0.2),
      ...pair(9.49, 11.94, 4.07, 5.77, 67.86, 69.83, 0.2),
      ...pair(10.53, 14.8, 3.98, 7.18, 51.19, 53.43, 0.2),
      ...pair(4.94, 7.38, 6.5, 8.19, 40.7, 42.67, 0.2),
      ...pair(5.11, 7.57, 6.44, 8.14, -47.12, -45.17, 0.2),
      ...pair(6.85, 9.29, 3.98, 5.67, -100.0, -98.04, 0.2),
      box(-1.12, 1.12, 4.18, 7.38, -111.41, -107.14, 0.2),
    ], gun: { whole: true, tris: 900, error: 0.01 } },
  },
});
