// HMS U-class III off the owner's model -- "British U-class III" by kriss50
// (https://skfb.ly/pt9xJ), under Creative Commons Attribution 4.0, credited on
// the game's Credits screen -- through build/kriss-hull.mjs: her hull, her
// casing and her tower as one painted mesh, and her 3-inch and her two screws
// cut free of her. Her four bow tubes are in her hull, their outer doors the
// model's own.
//
//   node build/prepare-uclass3-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RN_SUB_PAINTS, rnSubPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'U-class III', script: 'build/prepare-uclass3-hull.mjs',
  src: 'assets/models/ImageToStl.com_british_u-class_iii-maximum-compressed.glb',
  out: 'client/js/render/uclass3Hull.data.js',
  credit: '"British U-class III" by kriss50 (https://skfb.ly/pt9xJ), CC BY 4.0',
  loa: 58.2, draught: 4.6, bow: '+x',
  paints: RN_SUB_PAINTS, paint: rnSubPaint, paintLines: [0, BOOT], deckPaints: ['deck'],
  deckFallback: 1.5, sideIn: 0.35, wound: true, cutAll: true,
  kinds: {
    // Her 3-inch 12 cwt on its bandstand at the forward end of her tower.
    main: { boxes: [{ x: [-0.9, 0.9], y: [1.35, 3.25], z: [1.6, 6.5] }], nodes: [13, 15],
      min: 200, gun: { whole: true, tris: 3000, error: 0.002, pivots: [[-0.05, 3.05]], rests: [0] } },
    // The outer doors of her tubes, each the model's own, cut free so it
    // swings open on its hinge, outboard of its tube, when the tube fires.
    cap: { boxes: [
      { x: [0.2, 0.9], y: [-0.5, 0.05], z: [26.5, 26.7] },
      { x: [0.2, 0.9], y: [-1.45, -0.9], z: [26.1, 26.25] },
      { x: [-0.9, -0.2], y: [-0.5, 0.05], z: [26.5, 26.7] },
      { x: [-0.9, -0.2], y: [-1.45, -0.9], z: [26.1, 26.25] },
    ], nodes: [17, 19, 21, 23], min: 100,
      gun: { whole: true, tris: 1200, error: 0.001, pivots: [[0.79, 26.6], [0.85, 26.18], [-0.8, 26.6], [-0.85, 26.18]], rests: [0, 0, 0, 0] } },
    // Her two screws.
    screw: { boxes: [
      { x: [-1.8, -0.2], y: [-3.0, -1.3], z: [-24, -23] },
      { x: [0.1, 1.8], y: [-3.0, -1.3], z: [-24, -23] },
    ], nodes: [33, 35], min: 20, hullToo: true },
  },
});
