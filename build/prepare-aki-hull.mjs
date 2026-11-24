// IJN Aki off the owner's model of her -- "Japan Hybrid Warship Dewa(近江)"
// by 全斗焕 (https://skfb.ly/psZAH), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen; the owner sails her as the Aki --
// through build/kriss-hull.mjs: her hull, her pagoda, her funnel, her flight
// deck and the aircraft parked on it as one mesh, and every mounting of hers
// that trains cut free of her, each as the model drew it. The model names its
// pieces for what they are (HP_JGM her main battery, HP_JGS her secondaries,
// HP_JGA her light guns), so each kind is found by its name: her two triple
// 46 cm forward; her triple 15.5 cm, six twin 12.7 cm and four twin 10 cm
// about her bridge and funnel; and her triple and twin 25 mm.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-aki-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { IJN_PAINTS, ijnPaint, BOOT } from './kriss-paints.mjs';

const num = (re) => (name) => (name.match(re) || [null, name])[1];
const named = (names, size, gun, extra = {}) => ({ auto: { regions: [{ z: [-100, 140] }], names, size, minFaces: 100, gap: 0.3, ...extra }, gun });

await prepare({
  name: 'Aki', script: 'build/prepare-aki-hull.mjs',
  src: 'assets/models/japan_hybrid_warship_dewa-maximum-compressed.glb',
  out: 'client/js/render/akiHull.data.js',
  credit: '"Japan Hybrid Warship Dewa(近江)" by 全斗焕 (https://skfb.ly/psZAH), CC BY 4.0',
  loa: 263, draught: 10.5, bow: '+z', groupDepth: 2,
  paints: IJN_PAINTS, paint: ijnPaint, paintLines: [0, BOOT],
  deckFallback: 6, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 16 },
  kinds: {
    // Her two triple turrets, the second firing over the first.
    main: named('^HP_JGM_1\\.', [10, 35], { whole: true, tris: 5000, error: 0.004 }, { byNode: true }),
    // Her secondaries, each mounting drawn in a piece or two named alike: the
    // triple 15.5 cm before her bridge; her six twin 12.7 cm in her waist; and
    // her four twin 10 cm on the deck over them.
    sec: named('^HP_JGS_1_', [3, 15], { whole: true, tris: 2000, error: 0.008 }),
    ha127: named('^HP_JGS_(2|3|6|7|10|11)_', [3, 12], { whole: true, tris: 1600, error: 0.008 }, { group: num(/^HP_JGS_(\d+)_/) }),
    ha100: named('^HP_JGS_(4|5|8|9)_', [3, 12], { whole: true, tris: 1800, error: 0.008 }, { group: num(/^HP_JGS_(\d+)_/) }),
    // Her triple 25 mm -- two of them on the roof of her second turret,
    // which train for themselves -- and her twin 25 mm.
    aa3: named('^HP_JGA_[1-6]_|^HP_JGM_2_', [1.5, 3], { whole: true, tris: 800, error: 0.01 }, { byNode: true, minFaces: 2000 }),
    aa2: named('^HP_JGA_', [2, 5], { whole: true, tris: 500, error: 0.01 }, { group: num(/^HP_JGA_(\d+)_/), minFaces: 400 }),
  },
});
