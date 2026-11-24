// KMS Beowulf off the owner's model of her -- "The Third Reich Navy large
// cruiser BEOWULF" by 全斗焕 (https://skfb.ly/oHuvu), under Creative Commons
// Attribution 4.0, credited on the game's Credits screen -- through
// build/kriss-hull.mjs: her hull, her tower, her funnel and her masts as one
// mesh, and every mounting of hers that trains cut free of her, each as the
// model drew it. The model names its pieces for what they are (HP_GGM her
// main battery, HP_GGS her secondaries, HP_GGA her light guns, HP_GGT her
// tubes), so each kind is found by its name: her two quadruple 305 mm, fore
// and aft, each with the light guns on its roof, which train with it; her
// eight twin 128 mm; her ten quadruple 20 mm and eight 37 mm about her decks;
// and her two banks of four 533 mm tubes.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-beowulf-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { KM_PAINTS, kmPaint, BOOT } from './kriss-paints.mjs';

const PAINTS = { ...KM_PAINTS, wood: 0x9c8a6a };
const paint = (f) => (f.up && !f.kind && f.cy > 2 && f.cy < 8 && Math.abs(f.ny) > 0.97 ? 'wood' : kmPaint(f));
const named = (names, size, gun, extra = {}) => ({ auto: { regions: [{}], names, size, minFaces: 100, gap: 0.3, ...extra }, gun });

await prepare({
  name: 'Beowulf', script: 'build/prepare-beowulf-hull.mjs',
  src: 'assets/models/the_third_reich_navy_large_cruiser_beowulf-maximum-compressed.glb',
  out: 'client/js/render/beowulfHull.data.js',
  credit: '"The Third Reich Navy large cruiser BEOWULF" by 全斗焕 (https://skfb.ly/oHuvu), CC BY 4.0',
  loa: 238, draught: 8.5, bow: '+z', groupDepth: 2,
  paints: PAINTS, paint, paintLines: [0, BOOT],
  deckFallback: 5, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 14 },
  kinds: {
    // Each quadruple turret and the light guns on its roof, which train with it.
    main: named('^HP_GGM_|^HP_GGS_(008|009|010|1)_|^HP_GGA_02[1-4]_', [10, 30], { whole: true, tris: 4500, error: 0.004 }),
    sec: named('^HP_GGS_', [3, 11], { whole: true, tris: 1400, error: 0.008 }, { byNode: true }),
    aa20: named('^HP_GGA_', [1.5, 4], { whole: true, tris: 700, error: 0.01 }, { byNode: true, minFaces: 1900 }),
    aa37: named('^HP_GGA_', [1.0, 4], { whole: true, tris: 600, error: 0.01 }, { byNode: true, minFaces: 1100, maxFaces: 1400 }),
    tubes: named('^HP_GGT_', [3, 11], { tubes: 4, tris: 900 }, { minFaces: 1000 }),
  },
});
