// HMS Dido off the owner's model of her sister -- "British Navy CLAA Tier 6
// SIRIUS" by 全斗焕 (https://skfb.ly/oKuwP), under Creative Commons
// Attribution 4.0, credited on the game's Credits screen; the owner sails her
// as the name ship of the class -- through build/kriss-hull.mjs: her hull,
// her bridge, her two funnels and her masts as one mesh, and every mounting
// of hers that trains cut free of her, each as the model drew it. The model
// names its pieces for what they are (HP_BGM her main battery, HP_BGA her
// light guns, HP_BGT her tubes), so each kind is found by its name: her five
// twin 5.25-inch, three forward and two aft; her two quadruple 2-pounders;
// her quadruple 0.5-inch and her single Oerlikons; and her two triple banks
// of 21-inch tubes.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-dido-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RN_PAINTS, rnPaint, BOOT } from './kriss-paints.mjs';

const named = (names, size, gun, extra = {}) => ({ auto: { regions: [{}], names, size, minFaces: 100, gap: 0.2, byNode: true, ...extra }, gun });

await prepare({
  name: 'Dido', script: 'build/prepare-dido-hull.mjs',
  src: 'assets/models/british_navy_claa_tier_6_sirius-maximum-compressed.glb',
  out: 'client/js/render/didoHull.data.js',
  credit: '"British Navy CLAA Tier 6 SIRIUS" by 全斗焕 (https://skfb.ly/oKuwP), CC BY 4.0',
  // 156.1 m over all, 5.1 m draught.
  loa: 156.1, draught: 5.1, bow: '+z', groupDepth: 2,
  paints: RN_PAINTS, paint: rnPaint, paintLines: [0, BOOT],
  deckFallback: 4, decimate: true, hullTris: 50000, hullError: 0.004, amax: 1.5,
  rigging: { y: 10 },
  kinds: {
    main: named('^HP_BGM_', [5, 12], { whole: true, tris: 1300, error: 0.006 }),
    pompom: named('^HP_BGA_(6|7)_', [2, 5], { whole: true, tris: 900, error: 0.01 }),
    mg: named('^HP_BGA_(1|2|8|9)_', [1.5, 4], { whole: true, tris: 500, error: 0.01 }),
    aa1: named('^HP_BGA_(3|4|5)_', [1, 4], { whole: true, tris: 300, error: 0.01 }),
    tubes: named('^HP_BGT_', [3, 10], { tubes: 3, tris: 800 }, { minFaces: 1000 }),
  },
});
