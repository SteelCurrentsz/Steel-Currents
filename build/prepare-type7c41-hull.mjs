// KMS Type VIIC/41 off the owner's model -- "Type VIIC41 U-boat 3D Model" by
// kriss50 (https://skfb.ly/pt97Q), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/kriss-hull.mjs: her
// pressure hull, her saddle tanks, her casing and her tower as one painted
// mesh, and her 8.8 cm deck gun, the two 2 cm on her upper Wintergarten, the
// 3.7 cm on her lower one and her two screws cut free of her. Her five tubes
// are in her hull, their outer doors the model's own.
//
//   node build/prepare-type7c41-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { KM_SUB_PAINTS, kmSubPaint, BOOT } from './kriss-paints.mjs';

const odd = (a, b) => Array.from({ length: (b - a) / 2 + 1 }, (_, i) => a + 2 * i);

await prepare({
  name: 'Type VIIC/41', script: 'build/prepare-type7c41-hull.mjs',
  src: 'assets/models/type_viic41_u-boat_3d_model-maximum-compressed.glb',
  out: 'client/js/render/type7c41Hull.data.js',
  credit: '"Type VIIC41 U-boat 3D Model" by kriss50 (https://skfb.ly/pt97Q), CC BY 4.0',
  loa: 67.2, draught: 4.74, bow: '+z',
  paints: KM_SUB_PAINTS, paint: kmSubPaint(1.05), paintLines: [0, BOOT, 1.05], deckPaints: ['deck'],
  deckFallback: 1.8, sideIn: 0.35, wound: true, cutAll: true,
  kinds: {
    // Her 8.8 cm SK C/35 on the casing forward of her tower.
    main: { boxes: [{ x: [-1.5, 1.5], y: [1.3, 3.2], z: [6.3, 10.9] }], nodes: odd(107, 143),
      min: 200, gun: { whole: true, tris: 6000, error: 0.002, pivots: [[0.05, 7.95]], rests: [0] } },
    // Her two 2 cm on her upper Wintergarten, one a side.
    aa: { boxes: [
      { x: [-1.65, -0.55], y: [3.65, 5.55], z: [-1.95, 0.8] },
      { x: [0.55, 1.65], y: [3.65, 5.55], z: [-1.95, 0.8] },
    ], nodes: [...odd(7, 31), ...odd(35, 59)],
      min: 200, gun: { whole: true, tris: 3000, error: 0.002, pivots: [[-1.02, -0.6], [1.02, -0.6]], rests: [Math.PI, Math.PI] } },
    // And her 3.7 cm on the lower one.
    aa37: { boxes: [{ x: [-1.2, 1.2], y: [2.6, 4.9], z: [-7.2, -2.85] }], nodes: odd(61, 81),
      min: 200, gun: { whole: true, tris: 4000, error: 0.002, pivots: [[0, -4.1]], rests: [Math.PI] } },
    // Her two screws.
    screw: { boxes: [
      { x: [-1.9, -0.3], y: [-2.8, -1.0], z: [-28.5, -27.3] },
      { x: [0.2, 1.8], y: [-2.8, -1.0], z: [-28.5, -27.3] },
    ], nodes: [155, 157], min: 20, hullToo: true },
  },
});
