// IJN Yugumo off the owner's model of her -- "Japanese Destroyer Yūgumo" by
// kriss50 (https://skfb.ly/ptTA7), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/kriss-hull.mjs: her
// hull, bridge, funnels, masts and deckhouses as one painted mesh, and her
// three 12.7 cm twins, her two quadruple banks of 61 cm tubes and her 25 mm
// cut free of her, each as the model drew it.
//
//   node build/prepare-yugumo-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { IJN_PAINTS, ijnPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Yugumo', script: 'build/prepare-yugumo-hull.mjs',
  src: 'assets/models/japanese_destroyer_yugumo-maximum-compressed.glb',
  out: 'client/js/render/yugumoHull.data.js',
  credit: '"Japanese Destroyer Yūgumo" by kriss50 (https://skfb.ly/ptTA7), CC BY 4.0',
  // 119.15 m over all, 3.76 m draught; the model's bow is its +Z.
  loa: 119.15, draught: 3.76, bow: '+z',
  paints: IJN_PAINTS, paint: ijnPaint, paintLines: [0, BOOT],
  deckFallback: 6.0,
  hullTris: 45000,
  kinds: {
    // Her three 12.7 cm/50 Type 3 twins: No.1 forward, No.2 superfiring over
    // No.3 aft, both laid astern.
    main: { boxes: [
      { x: [-3.2, 3.2], y: [5.2, 8.8], z: [36, 45.7],
        not: [{ x: [-2.2, -0.8], z: [35.3, 36.6] }, { x: [0.8, 2.2], z: [35.3, 36.6] }, { x: [-2.2, -1.0], z: [43.2, 44.6] }, { x: [1.0, 2.2], z: [43.2, 44.6] }] },
      { x: [-3.2, 3.2], y: [5.3, 9.0], z: [-35, -23.8], not: [{ x: [-3, 3], y: [4.5, 6.8], z: [-33.2, -30.9] }] },
      { x: [-3.2, 3.2], y: [3.6, 6.6], z: [-42.8, -32.4], not: [{ x: [-3.5, 3.5], y: [3, 4.45], z: [-43, -32.5] }] },
    ], gun: { guns: 2, minLen: 1.5, tris: 1800, barrelTris: 400, rests: [0, Math.PI, Math.PI], footBand: [0.4, 1.2] } },
    // Her two quadruple banks of 61 cm tubes, with a reload for each tube.
    tubes: { boxes: [
      { x: [-3.4, 3.4], y: [4.0, 6.8], z: [1.2, 10.3] },
      { x: [-3.4, 3.4], y: [3.8, 6.8], z: [-15.5, -6.6] },
    ], gun: { tubes: 4, tris: 1400, rest: 0 } },
    // Her 25 mm triples: one before her bridge, a pair abreast each funnel on
    // its platform, a pair on her quarterdeck and a pair right aft.
    aa3: { boxes: [
      { x: [-1.6, 1.6], y: [7.4, 10], z: [30.5, 33.3] },
      { x: [-4.0, -1.2], y: [7.4, 9.8], z: [9.2, 12.2] },
      { x: [1.2, 4.0], y: [7.4, 9.8], z: [9.2, 12.2] },
      { x: [-4.0, -1.2], y: [7.0, 9.6], z: [-0.4, 2.6] },
      { x: [1.2, 4.0], y: [7.0, 9.6], z: [-0.4, 2.6] },
      { x: [-3.6, -1.0], y: [3.8, 6.2], z: [-47.8, -44.8], minSize: 0.5 },
      { x: [1.0, 3.6], y: [3.8, 6.2], z: [-47.8, -44.8], minSize: 0.5 },
    ], gun: { whole: true, tris: 500, error: 0.05 } },
    // And four singles round her bridge.
    aa1: { boxes: [
      { x: [-3.2, -0.9], y: [5.4, 8], z: [33.4, 35.4] },
      { x: [0.9, 3.2], y: [5.4, 8], z: [33.4, 35.4] },
      { x: [-4.2, -1.8], y: [5.4, 8], z: [31, 33] },
      { x: [1.8, 4.2], y: [5.4, 8], z: [31, 33] },
    ], gun: { whole: true, tris: 220, error: 0.05 } },
    screw: { boxes: [
      { x: [-4.5, 0], y: [-4.5, -0.8], z: [-52.5, -48.5] },
      { x: [0, 4.5], y: [-4.5, -0.8], z: [-52.5, -48.5] },
    ], min: 20, hullToo: true },
  },
});

