// KMS Frithjof off the owner's model of her -- "The Third Reich Navy large
// cruiser FRITHJOF" by 全斗焕 (https://skfb.ly/oHuvz), under Creative Commons
// Attribution 4.0, credited on the game's Credits screen -- through
// build/kriss-hull.mjs: her hull, her tower, her funnel and her masts as one
// mesh, and every mounting of hers that trains cut free of her, each as the
// model drew it. The model names its pieces for the guns they are, so each
// kind is found by its name: her three triple 28.3 cm, her seven twin 15 cm,
// her twin 5.5 cm, her 3 cm and her two quintuple banks of 533 mm tubes.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-frithjof-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { KM_PAINTS, kmPaint, BOOT } from './kriss-paints.mjs';

const PAINTS = { ...KM_PAINTS, wood: 0x9c8a6a };
const paint = (f) => (f.up && !f.kind && f.cy > 2 && f.cy < 8 && Math.abs(f.ny) > 0.97 ? 'wood' : kmPaint(f));
const named = (names, size, gun, extra = {}) => ({ auto: { regions: [{}], names, size, minFaces: 100, gap: 0.3, ...extra }, gun });

await prepare({
  name: 'Frithjof', script: 'build/prepare-frithjof-hull.mjs',
  src: 'assets/models/the_third_reich_navy_large_cruiser_frithjof-maximum-compressed.glb',
  out: 'client/js/render/frithjofHull.data.js',
  credit: '"The Third Reich Navy large cruiser FRITHJOF" by 全斗焕 (https://skfb.ly/oHuvz), CC BY 4.0',
  loa: 240, draught: 8.8, bow: '+z', groupDepth: 2,
  paints: PAINTS, paint, paintLines: [0, BOOT],
  deckFallback: 5, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 14 },
  kinds: {
    // Each triple turret, and on the roofs of Bruno and Caesar the twin 5.5 cm
    // and its director, which train with it.
    main: named('^HP_GGM_|^gga044_55mm_gerat_twin[37]_|^gm2001_|^gm20011_', [5, 30], { whole: true, tris: 4500, error: 0.004 }, {
      group: (n) => (/^HP_GGM_\d/.test(n) ? n.slice(0, 8) : /twin7|gm20011/.test(n) ? 'HP_GGM_2' : 'HP_GGM_3'),
    }),
    sec: named('^HP_GGS_(3|4|7|8|11|12|15)_', [3, 11], { whole: true, tris: 1600, error: 0.008 }, { byNode: true }),
    aa55: named('^gga044_55mm_gerat_twin0', [2, 7], { whole: true, tris: 900, error: 0.01 }, { byNode: true }),
    aa30: named('^gga108_', [1.5, 4], { whole: true, tris: 500, error: 0.01 }, { byNode: true }),
    tubes: named('ggt114_533mm_torpedo_tubes_five', [3, 11], { tubes: 5, tris: 900 }, { minFaces: 1000 }),
  },
});
