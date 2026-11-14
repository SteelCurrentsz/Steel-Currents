// KMS Z1 Leberecht Maass off the owner's model of her -- "Type 34 Destroyer"
// by kriss50 (https://skfb.ly/ptvyI), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/kriss-hull.mjs: her
// hull, bridge, funnels, masts and deckhouses as one painted mesh, and her
// five 12.7 cm, her two quadruple banks of 53.3 cm tubes and her light flak
// cut free of her, each as the model drew it.
//
//   node build/prepare-z1-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { KM_PAINTS, kmPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Z1', script: 'build/prepare-z1-hull.mjs',
  src: 'assets/models/type_34_destroyer-maximum-compressed.glb',
  out: 'client/js/render/z1Hull.data.js',
  credit: '"Type 34 Destroyer" by kriss50 (https://skfb.ly/ptvyI), CC BY 4.0',
  // 119.0 m stem to stern and 4.23 m to her keel; her screws hang four
  // tenths under it. The model draws her bow -X.
  loa: 119.0, draught: 4.63, bow: '-x', endsBelow: 6.8,
  paints: KM_PAINTS, paint: kmPaint, paintLines: [0, BOOT],
  deckFallback: 6.5,
  hullTris: 45000,
  kinds: {
    // Her five 12.7 cm SK C/34 in their shielded single mountings: 1 on her
    // forecastle and 2 superfiring over it; 3 on her after deckhouse facing
    // forward; 4 superfiring over 5 on her quarterdeck, both laid astern.
    main: { nodes: [65, 67, 61, 63, 25, 27, 21, 23, 29, 31], boxes: [
      { x: [-1.6, 1.6], y: [4.6, 7.8], z: [41, 47.4] },
      { x: [-1.6, 1.6], y: [6.8, 10], z: [35.9, 42.4] },
      { x: [-1.6, 1.6], y: [4.0, 7.2], z: [-28.6, -22.1] },
      { x: [-1.6, 1.6], y: [4.0, 7.2], z: [-42.2, -35.6] },
      { x: [-1.6, 1.6], y: [2.1, 5.3], z: [-49.9, -43.3] },
    ], gun: { guns: 1, minLen: 1.5, tris: 1800, barrelTris: 300, rests: [0, 0, 0, Math.PI, Math.PI] } },
    // Her two quadruple banks of 53.3 cm tubes on her centreline, between her
    // funnels and abaft her second.
    tubes: { nodes: [45, 93], boxes: [
      { x: [-2.4, 2.4], y: [3.0, 6.0], z: [3.8, 14.3] },
      { x: [-2.4, 2.4], y: [3.0, 6.0], z: [-20.7, -10.2] },
    ], gun: { tubes: 4, tris: 1600, rest: 'axis' } },
    // Her two twin 3.7 cm SK C/30 on her after deckhouse, one laid forward
    // and one astern.
    flak37: { nodes: [13, 15, 17, 19], boxes: [
      { x: [-1.3, 1.3], y: [6.3, 8.7], z: [-32.2, -28.9] },
      { x: [-1.3, 1.3], y: [6.2, 8.7], z: [-35.7, -32.5] },
    ], gun: { whole: true, tris: 1600, error: 0.008 } },
    // Her 2 cm C/30: one on her bridge front over No.2, a pair on her bridge
    // wings, and a pair on the platforms abreast her second funnel.
    flak20: { nodes: [69, 71, 53, 55, 57, 59, 83, 85, 89, 91], boxes: [
      { x: [-1.4, 1.2], y: [6.8, 9.3], z: [32.2, 35.4] },
      { x: [3.2, 6.5], y: [4.6, 7.1], z: [32.4, 35] },
      { x: [-6.6, -3.3], y: [4.6, 7.1], z: [32.4, 35] },
      { x: [3.2, 6.5], y: [4.5, 7.0], z: [-4.7, -2.1] },
      { x: [-6.5, -3.3], y: [4.5, 7.0], z: [-3.1, -0.5] },
    ], gun: { whole: true, tris: 1600, error: 0.008 } },
    screw: { nodes: [35, 37], boxes: [
      { x: [-3.8, -0.8], y: [-4.9, -2.0], z: [-50.7, -49.1] },
      { x: [0.9, 3.9], y: [-4.9, -2.0], z: [-50.7, -49.1] },
    ], min: 20, hullToo: true },
  },
});
