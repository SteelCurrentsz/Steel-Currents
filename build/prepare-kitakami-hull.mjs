// IJN Kitakami off the owner's model of her -- "Japanese Cruiser Kitakami" by
// kriss50 (https://skfb.ly/ptTKo), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/kriss-hull.mjs: her
// hull, bridge, three funnels, masts and deckhouses as one painted mesh, and
// every mounting of hers that trains cut free of her, each as the model drew
// it as she was rebuilt in 1941 as a torpedo cruiser: her 14 cm/50 abreast
// her bridge; her ten quadruple banks of 61 cm tubes, five a side on the
// sponsons along her waist; and her twin 25 mm on her bridge.
//
//   node build/prepare-kitakami-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { IJN_PAINTS, ijnPaint, BOOT } from './kriss-paints.mjs';

/** A quadruple bank of 61 cm tubes on her sponson, its housing aft and its tubes reaching forward from z0 to z1. */
const bank = (side, z0, z1) => ({ x: side > 0 ? [2.6, 8.2] : [-8.2, -2.6], y: [4.0, 8.0], z: [z0, z1] });

await prepare({
  name: 'Kitakami', script: 'build/prepare-kitakami-hull.mjs',
  src: 'assets/models/japanese_cruiser_kitakami-maximum-compressed.glb',
  out: 'client/js/render/kitakamiHull.data.js',
  credit: '"Japanese Cruiser Kitakami" by kriss50 (https://skfb.ly/ptTKo), CC BY 4.0',
  // 162.15 m over all, 4.8 m draught.
  loa: 162.15, draught: 4.8, bow: '+z',
  paints: IJN_PAINTS, paint: ijnPaint, paintLines: [0, BOOT],
  deckFallback: 5, decimate: true, hullTris: 50000, hullError: 0.004, amax: 2.0,
  kinds: {
    // Her 14 cm/50 3rd Year Type, a pair abreast her bridge, trained ahead.
    main: { boxes: [
      { x: [2.6, 6.6], y: [6.6, 10.4], z: [35.6, 44.0] },
      { x: [-6.6, -2.6], y: [6.6, 10.4], z: [35.6, 44.0] },
    ], gun: { whole: true, tris: 1400, error: 0.01 } },
    // Her forty 61 cm Type 92 tubes in ten quadruple banks, five a side.
    tubes: { boxes: [[-46.4, -35.4], [-32.0, -21.4], [-18.0, -7.4], [-3.0, 7.6], [11.6, 20.8]].flatMap(([a, b]) => [bank(1, a, b), bank(-1, a, b)]),
      gun: { tubes: 4, tris: 1400, rest: 'axis' } },
    // Her twin 25 mm Type 96, one a side on her bridge.
    aa2: { auto: { regions: [{ y: [11, 15], z: [40, 48] }], nodes: [160], size: [0.8, 3], minFaces: 300, gap: 0.2 },
      gun: { whole: true, tris: 500, error: 0.02 } },
  },
});
