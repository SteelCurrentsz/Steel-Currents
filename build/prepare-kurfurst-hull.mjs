// KMS Großer Kurfürst off the owner's model of her -- "G.kurfürst" by
// Hhikj789 (https://skfb.ly/o7DPp), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/kriss-hull.mjs: her
// hull, her tower, her funnel and her masts as one mesh, and every mounting
// of hers that trains cut free of her, each as the model drew it: her four
// triple 42 cm, Anton and Bruno forward and Caesar and Dora aft, with the
// light guns on their roofs; her six twin 12.8 cm along her sides; and her
// twin 5.5 cm and quadruple 2 cm about her upperworks.
//
// The model is drawn in a handful of pieces with no names, its guns run in
// among her decks, so every turret is found by a box round it, as the model's
// plan of her measures it; a superfiring turret's box leaves out the roof of
// the one under it, over which its barrels reach.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-kurfurst-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { KM_PAINTS, kmPaint, BOOT } from './kriss-paints.mjs';

const PAINTS = { ...KM_PAINTS, wood: 0x9c8a6a };
const paint = (f) => (f.up && !f.kind && f.cy > 2 && f.cy < 9 && Math.abs(f.ny) > 0.97 ? 'wood' : kmPaint(f));
const box = (x0, x1, y0, y1, z0, z1, not, faces = false) => ({ x: [x0, x1], y: [y0, y1], z: [z0, z1], hullToo: true, faces, ...(not ? { not } : {}) });

await prepare({
  name: 'Großer Kurfürst', script: 'build/prepare-kurfurst-hull.mjs',
  src: 'assets/models/g.kurfurst-maximum-compressed.glb',
  out: 'client/js/render/kurfurstHull.data.js',
  credit: '"G.kurfürst" by Hhikj789 (https://skfb.ly/o7DPp), CC BY 4.0',
  // 282 m over all and 11.1 m draught: the H-41 design's.
  loa: 282, draught: 11.1, bow: '+z', groupDepth: 2,
  paints: PAINTS, paint, paintLines: [0, BOOT],
  deckFallback: 5, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 14 },
  kinds: {
    main: { boxes: [
      // Anton on her forecastle, trained ahead.
      box(-7.5, 7.5, 4.3, 8.0, 55, 83, null, true),
      // Bruno over it, whose barrels reach out over Anton's roof.
      box(-8, 8, 7.6, 16.5, 32, 61, [{ z: [54, 74], y: [0, 8.0] }], true),
      // Caesar superfiring aft over Dora, trained astern.
      // Their gunhouses are run in with her decks, so they are taken face by face.
      box(-8, 8, 7.0, 16.5, -71.5, -42.4, [{ z: [-83, -63], y: [0, 8.8] }], true),
      box(-7.5, 7.5, 4.2, 8.8, -93.5, -63, null, true),
    ], gun: { whole: true, tris: 4500, error: 0.004, rests: [0, 0, Math.PI, Math.PI] } },
    sec: { auto: { regions: [{ x: [10.5, 18], y: [4, 12] }, { x: [-18, -10.5], y: [4, 12] }], size: [3, 10], minFaces: 300, gap: 0.12 },
      gun: { whole: true, tris: 1600, error: 0.008 } },
    // Her twin 5.5 cm and her quadruple 2 cm about her tower, her funnel and
    // her after deckhouse, each found by its size and how finely it is drawn.
    aa55: { auto: { regions: [{ x: [-14, 14], y: [7, 30], z: [-45, 32] }], size: [3.5, 5.5], height: [1.5, 4.5], minFaces: 1550, maxFaces: 2500, gap: 0.1 },
      gun: { whole: true, tris: 800, error: 0.01 } },
    aa20: { auto: { regions: [{ x: [-14, 14], y: [7, 30], z: [-45, 32] }], size: [1.5, 3.5], height: [1.5, 4.5], minFaces: 1900, maxFaces: 2300, gap: 0.1 },
      gun: { whole: true, tris: 700, error: 0.01 } },
  },
});
