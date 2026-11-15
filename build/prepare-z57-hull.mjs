// KMS Z-57, a Type 1944 destroyer of the Kriegsmarine's last design, off the
// owner's model of her -- "German Destroyer Z-57" by 全斗焕
// (https://skfb.ly/o6KVM), under Creative Commons Attribution 4.0, credited on
// the game's Credits screen -- through build/kriss-hull.mjs: her hull, bridge,
// funnels, masts and deckhouses as one painted mesh, and her four twin
// 12.7 cm, her quadruple bank of 53.3 cm tubes and her flak cut free of her,
// each as the model drew it.
//
//   node build/prepare-z57-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { KM_PAINTS, kmPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Z-57', script: 'build/prepare-z57-hull.mjs',
  src: 'assets/models/german_destroyer_z-57-maximum-compressed.glb',
  out: 'client/js/render/z57Hull.data.js',
  credit: '"German Destroyer Z-57" by 全斗焕 (https://skfb.ly/o6KVM), CC BY 4.0',
  // 126 m stem to stern and 4.0 m to her keel, which is the lowest of her.
  // The model draws her bow +Z.
  loa: 126.0, draught: 4.0, bow: '+z', endsBelow: 7.0,
  paints: KM_PAINTS, paint: kmPaint, paintLines: [0, BOOT],
  deckFallback: 6.5,
  hullTris: 50000,
  kinds: {
    // Her four twin 12.7 cm SK C/34 in their LC/38 gunhouses: A on her
    // forecastle and B superfiring over it, both laid ahead; Y on her
    // quarterdeck and X superfiring over it, both laid astern.
    main: { nodes: [6], boxes: [
      { x: [-2.4, 2.4], y: [5.5, 9.6], z: [38.2, 48.7] },
      { x: [-2.4, 2.4], y: [7.7, 11.8], z: [30.4, 40.8] },
      { x: [-2.4, 2.4], y: [2.8, 6.9], z: [-50.7, -40.4] },
      { x: [-2.4, 2.4], y: [5.0, 9.3], z: [-41.3, -30.9] },
    ], gun: { guns: 2, minLen: 1.5, tris: 2400, barrelTris: 500, rests: [0, 0, Math.PI, Math.PI] } },
    // Her quadruple bank of 53.3 cm tubes on her centreline between her
    // funnels.
    tubes: { nodes: [53, 51], boxes: [
      { x: [-2.2, 2.2], y: [3.9, 6.8], z: [-6.8, 3.5] },
    ], gun: { tubes: 4, tris: 1800, rest: 0 } },
    // Her twin 5.5 cm Gerät 58 on her bridge front.
    flak55: { nodes: [54], boxes: [
      { x: [-2.2, 2.2], y: [9.6, 13.4], z: [25.6, 32.7] },
    ], gun: { whole: true, tris: 1400, error: 0.006 } },
    // Her two twin 3.7 cm M42 on her bridge wings.
    flak37: { nodes: [56], boxes: [
      { x: [2.2, 6.0], y: [9.6, 12.9], z: [14.6, 17.2] },
      { x: [-6.0, -2.2], y: [9.6, 12.9], z: [14.5, 17.1] },
    ], gun: { whole: true, tris: 1400, error: 0.006 } },
    // Her four twin 3 cm Flak 103/38, two on the platforms abreast her fore
    // funnel and two abreast her after one.
    flak30: { nodes: [55], boxes: [
      { x: [1.7, 5.5], y: [6.6, 9.5], z: [2.6, 5.8] },
      { x: [-5.6, -1.8], y: [6.6, 9.5], z: [2.6, 5.8] },
      { x: [1.7, 5.5], y: [6.1, 9.0], z: [-10.7, -7.5] },
      { x: [-5.6, -1.8], y: [6.1, 9.0], z: [-10.7, -7.5] },
    ], gun: { whole: true, tris: 1400, error: 0.006 } },
    screw: { nodes: [79], boxes: [
      { x: [0, 4.0], y: [-4.2, -0.9], z: [-55.1, -52.7] },
      { x: [-4.0, 0], y: [-4.2, -0.9], z: [-55.1, -52.7] },
    ], min: 20, hullToo: true },
  },
});
