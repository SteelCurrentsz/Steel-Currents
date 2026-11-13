import { prepare } from './kriss-hull.mjs';
import { RN_PAINTS, rnPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Implacable', script: 'build/prepare-implacable-hull.mjs',
  src: 'assets/models/hms_implacable-maximum-compressed.glb',
  out: 'client/js/render/implacableHull.data.js',
  credit: '"HMS Implacable" by kriss50 (https://skfb.ly/ptKt7), CC BY 4.0',
  loa: 233.6, draught: 8.9, bow: '+z',
  paints: RN_PAINTS, paint: rnPaint, paintLines: [0, BOOT],
  deckFallback: 10, hullTris: 80000,
  rigging: { y: 14 },
  // Her island to starboard, her funnel built into it.
  carrier: { minY: 10, island: { x0: -23, x1: -10.6, z0: -10, z1: 40, face: -11.2 },
    // Her flight deck, 760 ft by 90: rounded down aft, narrowing to her bow.
    outline: (z) => (z < -109.5 || z > 111.5 ? 0 : z < -99 ? 9.2 + (3.6 * (z + 109.5)) / 10.5
      : z < 86 ? 12.8 : 12.8 - (3.4 * (z - 86)) / 25.5) },
  kinds: {
    dp: { auto: { regions: [{}], nodes: [103, 105, 107, 119, 121], size: [3, 7], minFaces: 3000, gap: 0.02 }, gun: { whole: true, tris: 1600, error: 0.01 } },
    pp8: { auto: { regions: [{}], nodes: [65, 99], size: [2.5, 6], minFaces: 2000, gap: 0.02 }, gun: { whole: true, tris: 1000, error: 0.02 } },
    aa40: { auto: { regions: [{}], nodes: [109, 111, 113, 115, 117], size: [2.5, 4.5], minFaces: 1500, maxFaces: 2000, gap: 0.01, each: 1866 }, gun: { whole: true, tris: 600, error: 0.02 } },
    aa2: { auto: { regions: [{}], nodes: [91], size: [2, 3.5], minFaces: 1500, gap: 0.01 }, gun: { whole: true, tris: 500, error: 0.03 } },
    aa1: { auto: { regions: [{}], nodes: [93, 145, 147], size: [0.6, 3], minFaces: 500, gap: 0.01 }, gun: { whole: true, tris: 220, error: 0.04 } },
  },
});
