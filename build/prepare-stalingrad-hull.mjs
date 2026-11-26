// RF Stalingrad off the owner's model of her -- "Project 82 "Stalingrad"
// battlecruiser model" by Lanko Mykhailo (https://skfb.ly/pKArr), under
// Creative Commons Attribution 4.0, credited on the game's Credits screen --
// through build/kriss-hull.mjs: her hull, her tower, her funnel and her masts
// as one mesh, and every mounting of hers that trains cut free of her, each
// as the model drew it: her three triple 305 mm, two forward and one aft; her
// six twin 130 mm, two superfiring over No.2 and two a side; her six
// quadruple 45 mm and her ten quadruple 25 mm.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-stalingrad-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RN_PAINTS, rnPaint, BOOT } from './kriss-paints.mjs';

/** A box round a mounting, as the model's plan of her measures it, with `p` metres to spare all round. */
const box = (x0, x1, y0, y1, z0, z1, p = 0.3) => ({ x: [x0 - p, x1 + p], y: [y0 - p, y1 + p], z: [z0 - p, z1 + p], hullToo: true });
const pair = (x0, x1, y0, y1, z0, z1, p) => [box(x0, x1, y0, y1, z0, z1, p), box(-x1, -x0, y0, y1, z0, z1, p)];

await prepare({
  name: 'Stalingrad', script: 'build/prepare-stalingrad-hull.mjs',
  src: 'assets/models/project_82_stalingrad_battlecruiser_model-maximum-compressed.glb',
  out: 'client/js/render/stalingradHull.data.js',
  credit: '"Project 82 \\"Stalingrad\\" battlecruiser model" by Lanko Mykhailo (https://skfb.ly/pKArr), CC BY 4.0',
  // 273.5 m over all, 9.2 m draught: the Project 82's.
  loa: 273.5, draught: 9.2, bow: '+z', groupDepth: 2,
  paints: RN_PAINTS, paint: rnPaint, paintLines: [0, BOOT],
  deckFallback: 6, decimate: true, hullTris: 50000, hullError: 0.005, amax: 2.0,
  rigging: { y: 14 },
  kinds: {
    // Her three triple 305 mm/61 SM-31: No.1 on her forecastle and No.2
    // superfiring over it, trained ahead, and No.3 aft, trained astern. No.1
    // is taken first, so No.2 keeps only what stands over its roof.
    main: { boxes: [
      box(-6.5, 6.5, 6.3, 10.7, 57.0, 81.0, 0.2),
      box(-6.5, 6.5, 9.6, 13.9, 37.6, 61.6, 0.2),
      // Not the fittings on her quarterdeck under No.3's muzzles.
      { ...box(-6.5, 6.5, 5.9, 10.2, -89.4, -65.4, 0.2), not: [{ x: [-9, 9], y: [3, 6.2], z: [-91, -80] }] },
    ], gun: { whole: true, tris: 4000, error: 0.004, rests: [0, 0, Math.PI] } },
    // Her six twin 130 mm/58 BL-109A: two on her centreline before her
    // tower, the upper over the lower, and two a side.
    sec: { boxes: [
      box(-2.2, 2.2, 13.5, 16.2, 29.8, 39.2),
      box(-2.2, 2.2, 15.1, 17.8, 23.2, 32.5),
      ...pair(10.8, 15.2, 5.7, 8.4, 6.5, 15.8),
      ...pair(10.8, 15.2, 5.7, 8.4, -39.8, -30.4),
    ], gun: { whole: true, tris: 1600, error: 0.008, rests: [0, 0, 0, 0, Math.PI, Math.PI] } },
    // Her six quadruple 45 mm SM-20-ZIF: two pairs abreast her funnel and two
    // on her centreline aft, the upper over the lower.
    aa45: { boxes: [
      ...pair(5.8, 10.7, 7.9, 10.2, 1.7, 7.1),
      ...pair(5.8, 10.7, 9.8, 12.2, -6.4, -1.0),
      box(-2.4, 2.4, 12.2, 14.6, -57.8, -52.4),
      box(-2.4, 2.4, 9.9, 12.2, -63.9, -58.5),
    ], gun: { whole: true, tris: 1000, error: 0.01, rests: [0, 0, 0, 0, Math.PI, Math.PI] } },
    // Her ten quadruple 25 mm about her after superstructure.
    aa25: { boxes: [
      ...pair(7.8, 10.3, 9.8, 11.6, -13.7, -10.6, 0.2),
      ...pair(7.8, 10.3, 10.9, 12.7, -19.2, -16.1, 0.2),
      ...pair(7.1, 9.6, 10.9, 12.7, -29.3, -26.2, 0.2),
      ...pair(7.1, 9.6, 9.8, 11.6, -34.8, -31.7, 0.2),
      ...pair(5.9, 8.5, 9.8, 11.6, -41.4, -38.3, 0.2),
    ], gun: { whole: true, tris: 700, error: 0.01 } },
  },
});
