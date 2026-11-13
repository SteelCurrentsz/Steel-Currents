// IJN Fubuki off the owner's model of her -- "Japanese Destroyer Fubuki" by
// kriss50 (https://skfb.ly/ptWOV), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/kriss-hull.mjs: her
// hull, bridge, funnels, masts and deckhouses as one painted mesh, and her
// three 12.7 cm twins and her three triple banks of 61 cm tubes cut free of
// her, each as the model drew it.
//
//   node build/prepare-fubuki-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { IJN_PAINTS, ijnPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Fubuki', script: 'build/prepare-fubuki-hull.mjs',
  src: 'assets/models/japanese_destroyer_fubuki-maximum-compressed.glb',
  out: 'client/js/render/fubukiHull.data.js',
  credit: '"Japanese Destroyer Fubuki" by kriss50 (https://skfb.ly/ptWOV), CC BY 4.0',
  // 118.41 m over all, 3.2 m draught; the model draws her along X, bow +X.
  loa: 118.41, draught: 3.2, bow: '+x',
  paints: IJN_PAINTS, paint: ijnPaint, paintLines: [0, BOOT],
  deckFallback: 5.5,
  rigging: { faces: 90 },
  hullTris: 45000,
  kinds: {
    // Her three 12.7 cm/50 Type 3 twins: A on her forecastle, and aft No.2
    // superfiring over No.3, both laid astern.
    main: { boxes: [
      { x: [-3.2, 3.2], y: [5.9, 9.8], z: [38, 51], not: [{ x: [-3, 3], y: [5, 7.6], z: [46.3, 53] }] },
      { x: [-3.2, 3.2], y: [5.8, 9.8], z: [-38.9, -27.3], not: [{ x: [-3, 3], y: [5, 6.25], z: [-33.8, -28] }, { x: [-1.4, 1.4], y: [5, 7.2], z: [-38.6, -36.8] }] },
      { x: [-3.2, 3.2], y: [3.9, 7.2], z: [-47.6, -36.4], not: [{ x: [-3, 3], y: [3, 6.2], z: [-47.5, -45.3] }] },
    ], gun: { guns: 2, minLen: 1.5, tris: 1800, barrelTris: 400, rests: [0, Math.PI, Math.PI], footBand: [1.1, 2.2], template: 1 } },
    // Her three triple banks of 61 cm tubes on her centreline: one between
    // her funnels, two abaft them.
    tubes: { boxes: [
      { x: [-3.5, 3.5], y: [5.6, 7.6], z: [7.0, 16.0] },
      { x: [-3.5, 3.5], y: [3.9, 7.0], z: [-15.2, -6.8] },
      { x: [-3.5, 3.5], y: [3.9, 7.0], z: [-25.8, -15.3] },
    ], gun: { tubes: 3, tris: 1200, rest: 0 } },
    screw: { boxes: [
      { x: [-4.5, 0], y: [-4.2, 0], z: [-54, -51] },
      { x: [0, 4.5], y: [-4.2, 0], z: [-54, -51] },
    ], min: 20, hullToo: true },
  },
});

