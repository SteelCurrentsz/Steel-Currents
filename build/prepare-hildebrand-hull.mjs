// KMS Hildebrand off the owner's model of her -- "The Third Reich Navy large
// cruiser HILDEBRAND" by 全斗焕 (https://skfb.ly/oHuvE), under Creative
// Commons Attribution 4.0, credited on the game's Credits screen -- through
// build/kriss-hull.mjs: her hull, her tower, her funnel and her masts as one
// mesh, and every mounting of hers that trains cut free of her, each as the
// model drew it. The model names its pieces for the guns they are, so each
// kind is found by its name: her four twin 380 mm, her eight twin 128 mm, her
// eight twin 55 mm, her twelve 30 mm, her two twin 37 mm and her six
// quadruple 20 mm. Her two banks of four 533 mm tubes stay in her as the model
// draws them, in a torpedo room under her upper deck either side, firing out
// through her side (see `port` in krissShip.js).
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-hildebrand-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { KM_PAINTS, kmPaint, BOOT } from './kriss-paints.mjs';

const PAINTS = { ...KM_PAINTS, wood: 0x9c8a6a };
const paint = (f) => (f.up && !f.kind && f.cy > 2 && f.cy < 8 && Math.abs(f.ny) > 0.97 ? 'wood' : kmPaint(f));
const named = (names, size, gun, extra = {}) => ({ auto: { regions: [{}], names, size, minFaces: 100, gap: 0.3, ...extra }, gun });

await prepare({
  name: 'Hildebrand', script: 'build/prepare-hildebrand-hull.mjs',
  src: 'assets/models/the_third_reich_navy_large_cruiser_hildebrand-maximum-compressed.glb',
  out: 'client/js/render/hildebrandHull.data.js',
  credit: '"The Third Reich Navy large cruiser HILDEBRAND" by 全斗焕 (https://skfb.ly/oHuvE), CC BY 4.0',
  loa: 252, draught: 9, bow: '+z', groupDepth: 2,
  paints: PAINTS, paint, paintLines: [0, BOOT],
  deckFallback: 5, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 14 },
  kinds: {
    main: named('ggm059_', [5, 30], { whole: true, tris: 4000, error: 0.004 }, { byNode: true }),
    sec: named('ggs123_', [3, 11], { whole: true, tris: 1600, error: 0.008 }, { each: 2000 }),
    aa55: named('gga044_', [2, 7], { whole: true, tris: 900, error: 0.01 }),
    aa37: named('gga043_', [1.5, 4], { whole: true, tris: 700, error: 0.01 }),
    aa30: named('gga108_', [1.5, 4], { whole: true, tris: 500, error: 0.01 }),
    aa20: named('gga008_|gga042_', [1.5, 4], { whole: true, tris: 600, error: 0.01 }),
  },
});
