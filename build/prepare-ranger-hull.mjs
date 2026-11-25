// USS Ranger (CV-4) off the owner's model of her -- "uss Ranger wows" by zeek
// (https://skfb.ly/pNoyx), under Creative Commons Attribution 4.0, credited
// on the game's Credits screen -- through build/kriss-hull.mjs: her hull, her
// island and her six hinged funnels as one mesh painted in Measure 21; her
// flight deck taken up and its outline kept, for carrier.js to lay her runway
// over with her lifts cut through it; and her guns cut free of her, each as
// the model drew it. The model draws every gun as a piece of its own, so each
// kind is found by its pieces: her eight 5"/25 singles at the corners of her
// flight deck, her five quadruple Bofors and her Oerlikons along her
// galleries.
//
//   node build/prepare-ranger-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { USN_PAINTS, usnPaint, BOOT } from './kriss-paints.mjs';

const range = (a, b) => [...Array((b - a) / 2 + 1)].map((_, i) => a + i * 2);

await prepare({
  name: 'Ranger', script: 'build/prepare-ranger-hull.mjs',
  src: 'assets/models/uss_ranger_wows-maximum-compressed.glb',
  out: 'client/js/render/rangerHull.data.js',
  credit: '"uss Ranger wows" by zeek (https://skfb.ly/pNoyx), CC BY 4.0',
  // 234.4 m over all, 6.8 m draught.
  loa: 234.4, draught: 6.8, bow: '+z', groupDepth: 2,
  paints: USN_PAINTS, paint: usnPaint, paintLines: [0, BOOT],
  deckFallback: 9,
  decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 20 },
  // The model's middle is a metre and a third to port of her hull's, her
  // galleries hung out further that side.
  shiftX: 1.37,
  // Her small island to starboard.
  carrier: { minY: 12, island: { x0: -21.4, x1: -7.8, z0: -25, z1: 16, face: -9.4 } },
  kinds: {
    // Her eight 5"/25 singles, two at each corner of her flight deck.
    dp: { auto: { regions: [{}], nodes: range(84, 98), size: [2, 6], minFaces: 1000, byNode: true },
      gun: { whole: true, tris: 1000, error: 0.01 } },
    // Her quadruple Bofors: at her bow, in her forward sponsons, and fore and
    // aft of her island.
    aa4: { auto: { regions: [{}], nodes: range(20, 28), size: [2, 5], minFaces: 2000, byNode: true },
      gun: { whole: true, tris: 800, error: 0.02 } },
    // And her Oerlikons, along her galleries and on her stern.
    aa1: { auto: { regions: [{}], nodes: range(30, 82), size: [0.6, 3], minFaces: 500, byNode: true },
      gun: { whole: true, tris: 200, error: 0.05 } },
  },
});
