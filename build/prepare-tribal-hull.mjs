// HMS Tribal-class destroyer of 1936 off the owner's model of her --
// "Tribal-class Destroyer (1936)" by kriss50 (https://skfb.ly/ptwqF), under
// Creative Commons Attribution 4.0, credited on the game's Credits screen --
// through build/kriss-hull.mjs: her hull, bridge, funnels, masts and
// deckhouses as one painted mesh, and her four twin 4.7-inch, her quadruple
// bank of 21-inch tubes and her light guns cut free of her, each as the model
// drew it.
//
//   node build/prepare-tribal-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RN_DD_PAINTS, rnDDPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Tribal', script: 'build/prepare-tribal-hull.mjs',
  src: 'assets/models/tribal-class_destroyer_1936-maximum-compressed.glb',
  out: 'client/js/render/tribalHull.data.js',
  credit: '"Tribal-class Destroyer (1936)" by kriss50 (https://skfb.ly/ptwqF), CC BY 4.0',
  // 377 ft (114.9 m) stem to stern and 13 ft (3.96 m) to her keel; her
  // screws hang three tenths under it. The model draws her bow +Z, turned a
  // degree and a half off its own axis: her forward guns stood a metre to one
  // side of her centreline and her after guns a metre to the other.
  loa: 114.9, draught: 4.26, bow: '+z', endsBelow: 6.6, yaw: -0.02438,
  paints: RN_DD_PAINTS, paint: rnDDPaint, paintLines: [0, BOOT],
  deckFallback: 6.0,
  hullTris: 45000,
  kinds: {
    // Her four twin 4.7-inch QF Mk XII in their CP XIX gunhouses: A and B
    // forward, B superfiring; X on her after deckhouse superfiring over Y on
    // her quarterdeck, both laid astern.
    main: { nodes: [61, 63, 57, 59, 91, 93, 87, 89], boxes: [
      { x: [-1.8, 1.8], y: [4.7, 7.8], z: [37.6, 43.4] },
      { x: [-1.8, 1.8], y: [6.7, 9.8], z: [27.4, 33.1] },
      { x: [-1.8, 1.8], y: [4.4, 7.5], z: [-39, -33.3] },
      { x: [-1.8, 1.8], y: [2.1, 5.2], z: [-47.3, -41.6] },
    ], gun: { guns: 2, minLen: 1.5, tris: 2200, barrelTris: 500, rests: [0, 0, Math.PI, Math.PI] } },
    // Her bank of 21-inch tubes on her centreline abaft her funnels. The
    // class carried a quadruple bank; the model draws three tubes in it, and
    // she fires the three it draws.
    tubes: { nodes: [107], boxes: [
      { x: [-1.4, 1.4], y: [1.9, 4.2], z: [-17, -8.8] },
    ], gun: { tubes: 3, tris: 1600, rest: 0 } },
    // Her four Oerlikons, as the model has them: a pair on the platform
    // between her funnels stowed laid astern, a pair on her after shelter
    // deck trained out on their beams.
    oer: { nodes: [109, 111, 113, 115, 99, 101, 103, 105], boxes: [
      { x: [3.0, 4.8], y: [4.4, 6.6], z: [-1.8, 1.1] },
      { x: [-4.9, -3.2], y: [4.4, 6.6], z: [-1.8, 1.1] },
      { x: [1.6, 4.4], y: [4.8, 7.0], z: [-17.6, -15.7] },
      { x: [-4.3, -1.6], y: [4.8, 7.0], z: [-17.6, -15.7] },
    ], gun: { whole: true, tris: 900, error: 0.01, rests: [Math.PI, Math.PI, Math.PI / 2, -Math.PI / 2] } },
    screw: { nodes: [41, 47], boxes: [
      { x: [-3.3, -0.9], y: [-4.6, -2.1], z: [-52.8, -51.5] },
      { x: [0.9, 3.4], y: [-4.6, -2.1], z: [-52.8, -51.5] },
    ], min: 20, hullToo: true },
  },
});
