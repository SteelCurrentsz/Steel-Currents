// IJN Shimakaze off the owner's model of her -- "Japanese destroyer
// Shimakaze" by kriss50 (https://skfb.ly/ptTAs), under Creative Commons
// Attribution 4.0, credited on the game's Credits screen -- through
// build/kriss-hull.mjs: her hull, bridge, funnels, masts and deckhouses as one
// painted mesh, and her three 12.7 cm twins, her three quintuple banks of
// 61 cm tubes and her 25 mm cut free of her, each as the model drew it.
//
//   node build/prepare-shimakaze-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { IJN_PAINTS, ijnPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Shimakaze', script: 'build/prepare-shimakaze-hull.mjs',
  src: 'assets/models/japanese_destroyer_shimakaze-maximum-compressed.glb',
  out: 'client/js/render/shimakazeHull.data.js',
  credit: '"Japanese destroyer Shimakaze" by kriss50 (https://skfb.ly/ptTAs), CC BY 4.0',
  // 129.5 m over all, 4.14 m draught; the model's bow is its -Z.
  loa: 129.5, draught: 4.14, bow: '-z',
  paints: IJN_PAINTS, paint: ijnPaint, paintLines: [0, BOOT],
  deckFallback: 6.2,
  hullTris: 45000,
  kinds: {
    // Her three 12.7 cm/50 Type 3 twins: No.1 on her forecastle, No.2
    // superfiring over No.3 on her quarterdeck, both laid aft.
    main: { boxes: [
      { x: [-3.2, 3.2], y: [5.2, 9.8], z: [36.2, 47.5],
        not: [{ x: [-1.2, 0], y: [5, 7], z: [35.2, 36.4] }, { x: [-2.2, 2.2], y: [5, 6.4], z: [44, 46] }] },
      { x: [-3.2, 3.2], y: [5.9, 9.8], z: [-41.6, -29.4] },
      { x: [-3.2, 3.2], y: [3.5, 7.2], z: [-50.5, -39.4],
        // The charges stowed under her barrels and the ventilators round her.
        not: [{ x: [-2.8, -0.3], y: [3, 4.9], z: [-50.4, -46.0] }, { x: [0.8, 2.6], z: [-50.5, -47.0] },
          { x: [-3.4, -2.0], y: [3, 4.9], z: [-43.5, -36] }, { x: [2.0, 3.4], y: [3, 4.9], z: [-43.5, -36] }] },
    ], gun: { guns: 2, minLen: 1.5, tris: 1800, barrelTris: 400, rests: [0, Math.PI, Math.PI], footBand: [0.4, 1.2] } },
    // Her three quintuple banks of 61 cm tubes on her centreline.
    tubes: { boxes: [
      { x: [-3.6, 3.6], y: [3.8, 7.6], z: [0.6, 12.4] },
      { x: [-3.6, 3.6], y: [3.8, 7.4], z: [-15.2, -4.4] },
      { x: [-3.6, 3.6], y: [3.8, 7.4], z: [-27.6, -17.4] },
    ], gun: { tubes: 5, tris: 1600, rest: 0 } },
    // Her 25 mm Type 96 triples: one on the bandstand before her bridge and a
    // pair on the platform abreast her after funnel.
    aa3: { boxes: [
      { x: [-1.5, 1.7], y: [7.5, 10.5], z: [31.3, 34.0], slack: 0.05, not: [{ x: [-1.2, -0.2], z: [30.5, 31.6] }] },
      { x: [-5.2, -2.0], y: [7.5, 10.5], z: [-5.8, -2.4] },
      { x: [2.0, 5.2], y: [7.5, 10.5], z: [-5.8, -2.4] },
    ], gun: { whole: true, tris: 500, error: 0.05 } },
    // And her singles, along her deck edges.
    aa1: { boxes: [
      { x: [-5.8, -2.6], y: [5.4, 8.2], z: [32.7, 35.2] },
      { x: [2.6, 5.8], y: [5.4, 8.2], z: [32.7, 35.2] },
      { x: [-5.8, -2.6], y: [5.4, 8.2], z: [30.0, 32.6] },
      { x: [2.6, 5.8], y: [5.4, 8.2], z: [30.0, 32.6] },
      { x: [-6.6, -3.0], y: [3.4, 6.2], z: [-32.9, -30.4] },
      { x: [3.0, 6.6], y: [3.4, 6.2], z: [-32.9, -30.4] },
      { x: [-6.6, -3.0], y: [3.4, 6.2], z: [-37.9, -35.4] },
      { x: [3.0, 6.6], y: [3.4, 6.2], z: [-37.9, -35.4] },
      { x: [-4.0, -2.3], y: [3.5, 6.2], z: [-53.9, -51.2], minSize: 0.3 },
      { x: [1.7, 4.0], y: [3.5, 6.2], z: [-53.9, -51.2], minSize: 0.3 },
    ], gun: { whole: true, tris: 220, error: 0.05 } },
    screw: { boxes: [
      { x: [-4.5, 0], y: [-4.5, -0.6], z: [-60, -55.5] },
      { x: [0, 4.5], y: [-4.5, -0.6], z: [-60, -55.5] },
    ], min: 20, hullToo: true },
  },
});
