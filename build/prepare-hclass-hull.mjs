// HMS Harvester, an H-class destroyer, off the owner's model of her -- "HMS
// Harvester 1939" by kriss50 (https://skfb.ly/ptKqU), under Creative Commons
// Attribution 4.0, credited on the game's Credits screen -- through
// build/kriss-hull.mjs: her hull, bridge, funnels, masts and deckhouses as one
// painted mesh, and her four 4.7-inch, her two quadruple banks of 21-inch
// tubes and her two quadruple 0.5-inch machine guns cut free of her, each as
// the model drew it.
//
//   node build/prepare-hclass-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RN_DD_PAINTS, rnDDPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'H-Class', script: 'build/prepare-hclass-hull.mjs',
  src: 'assets/models/hms_harvester_1939-maximum-compressed.glb',
  out: 'client/js/render/hclassHull.data.js',
  credit: '"HMS Harvester 1939" by kriss50 (https://skfb.ly/ptKqU), CC BY 4.0',
  // 323 ft (98.45 m) stem to stern and 12 ft 5 in (3.78 m) to her keel; her
  // screws hang three tenths under it. The model draws her bow +Z.
  loa: 98.45, draught: 4.08, bow: '+z', endsBelow: 6.2,
  paints: RN_DD_PAINTS, paint: rnDDPaint, paintLines: [0, BOOT],
  deckFallback: 6.0,
  hullTris: 45000,
  kinds: {
    // Her four 4.7-inch QF Mk IX in their shielded CP XVIII mountings: A and
    // B forward, B superfiring; X on her after deckhouse and Y on her
    // quarterdeck, both laid astern.
    main: { nodes: [86, 82, 84, 80], boxes: [
      { x: [-2, 2], y: [4.1, 7.3], z: [30.9, 38.6] },
      { x: [-2, 2], y: [6.5, 9.7], z: [24.0, 31.6] },
      { x: [-2, 2], y: [4.2, 7.4], z: [-38, -30.4] },
      { x: [-2, 2], y: [1.7, 4.9], z: [-44.7, -37.1] },
    ], gun: { guns: 1, minLen: 1.5, tris: 1800, barrelTris: 300, rests: [0, 0, Math.PI, Math.PI] } },
    // Her two quadruple banks of 21-inch tubes on her centreline abaft her
    // funnels.
    tubes: { nodes: [78, 76], boxes: [
      { x: [-2.3, 2.3], y: [2.2, 4.8], z: [-14.6, -6.2] },
      { x: [-2.3, 2.3], y: [2.1, 4.7], z: [-25.4, -16.9] },
    // Laid square fore and aft: the training gear on one side of each throws
    // the long axis of it a few degrees off.
    ], gun: { tubes: 4, tris: 1600, rest: 0, pivots: [[-0.078, -10.42], [-0.078, -21.14]] } },
    // Her two quadruple 0.5-inch Vickers on the platform between her funnels.
    mg: { nodes: [72], boxes: [
      { x: [2.2, 4.9], y: [4.2, 7.0], z: [1.4, 3.6] },
      { x: [-4.9, -2.2], y: [4.2, 7.0], z: [1.4, 3.6] },
    ], gun: { whole: true, tris: 1400, error: 0.008, rests: [Math.PI / 2, -Math.PI / 2] } },
    screw: { nodes: [62], boxes: [
      { x: [0, 3.3], y: [-4.4, -1.9], z: [-45.2, -43.3] },
      { x: [-3.3, 0], y: [-4.4, -1.9], z: [-45.2, -43.3] },
    ], min: 20, hullToo: true },
  },
});
