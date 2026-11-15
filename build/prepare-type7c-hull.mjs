// KMS Type VIIC off the owner's model -- "Type VIIC U-boat" by kriss50
// (https://skfb.ly/pt9wq), under Creative Commons Attribution 4.0, credited
// on the game's Credits screen -- through build/kriss-hull.mjs: her pressure
// hull, her saddle tanks, her casing and her tower as one painted mesh, and
// the 2 cm on her Wintergarten and her two screws cut free of her. The model
// draws her as she was late in the war, her deck gun landed; her five tubes
// are in her hull, their outer doors the model's own.
//
//   node build/prepare-type7c-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { KM_SUB_PAINTS, kmSubPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Type VIIC', script: 'build/prepare-type7c-hull.mjs',
  src: 'assets/models/type_viic_u-boat-maximum-compressed.glb',
  out: 'client/js/render/type7cHull.data.js',
  credit: '"Type VIIC U-boat" by kriss50 (https://skfb.ly/pt9wq), CC BY 4.0',
  loa: 67.1, draught: 4.74, bow: '+z',
  paints: KM_SUB_PAINTS, paint: kmSubPaint(1.05), paintLines: [0, BOOT, 1.05], deckPaints: ['deck'],
  deckFallback: 1.8, sideIn: 0.35, wound: true, cutAll: true,
  kinds: {
    // Her single 2 cm C/30 on the Wintergarten abaft her bridge.
    aa: { boxes: [{ x: [-0.6, 0.6], y: [3.65, 5.5], z: [-3.1, -0.3] }], nodes: [13, 15, 17, 19, 21, 23, 25, 27, 29, 31],
      min: 200, gun: { whole: true, tris: 3000, error: 0.002, pivots: [[0, -1.64]], rests: [Math.PI] } },
    // The outer doors of her tubes, each the model's own, cut free so it
    // swings open on its hinge, outboard of its tube, when the tube fires.
    cap: { boxes: [
      { x: [0.1, 0.95], y: [-0.7, 0.1], z: [28.1, 28.35] },
      { x: [0.1, 0.95], y: [-1.7, -0.9], z: [28.1, 28.35] },
      { x: [-0.85, 0], y: [-0.7, 0.1], z: [28.1, 28.35] },
      { x: [-0.85, 0], y: [-1.7, -0.9], z: [28.1, 28.35] },
      { x: [-0.4, 0.4], y: [-1.5, -0.6], z: [-29.85, -29.65] },
    ], nodes: [83, 85, 87, 97, 101], min: 100,
      gun: { whole: true, tris: 1200, error: 0.001, pivots: [[0.91, 28.25], [0.89, 28.26], [-0.81, 28.25], [-0.8, 28.26], [0.34, -29.75]], rests: [0, 0, 0, 0, 0] } },
    // Her two screws.
    screw: { boxes: [
      { x: [-1.8, -0.2], y: [-3.5, -1.8], z: [-28.4, -27.3] },
      { x: [0.2, 1.8], y: [-3.5, -1.8], z: [-28.4, -27.3] },
    ], nodes: [75, 77], min: 20, hullToo: true },
  },
});
