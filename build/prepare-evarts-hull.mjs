// USS Evarts off the owner's model of her -- "Evarts Destroyer Escort" by
// kriss50 (https://skfb.ly/ptByP), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/kriss-hull.mjs: her
// hull, bridge, funnel, mast, deckhouses, Hedgehog, K-guns and racks as one
// mesh painted in Measure 21, and her three 3"/50s and nine Oerlikons cut
// free of her, each as the model drew it.
//
//   node build/prepare-evarts-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { USN_PAINTS, usnPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Evarts', script: 'build/prepare-evarts-hull.mjs',
  src: 'assets/models/evarts_destroyer_escort-maximum-compressed.glb',
  out: 'client/js/render/evartsHull.data.js',
  credit: '"Evarts Destroyer Escort" by kriss50 (https://skfb.ly/ptByP), CC BY 4.0',
  // 289 ft 5 in (88.2 m) stem to stern, 8 ft 3 in (2.51 m) to her keel; her
  // screws hang a hand's breadth under it. The model draws her bow +Z, turned
  // a fifth of a degree off its own axis.
  loa: 88.2, draught: 2.61, bow: '+z', endsBelow: 5.3, yaw: 0.00374,
  paints: USN_PAINTS, paint: usnPaint, paintLines: [0, BOOT],
  deckFallback: 4.6,
  hullTris: 45000,
  kinds: {
    // Her three 3"/50 Mk 22 in their open shielded mounts: No.1 on her
    // forecastle, and aft No.2 on her after deckhouse superfiring over No.3,
    // both laid astern.
    main: { nodes: [9, 11, 161, 163, 197, 199], boxes: [
      { x: [-1.2, 1.2], y: [4.3, 6.5], z: [31.4, 36.8] },
      { x: [-1.2, 1.2], y: [5.4, 7.6], z: [-22, -16.7] },
      { x: [-1.2, 1.2], y: [4.5, 6.8], z: [-30.6, -25.4] },
    ], gun: { guns: 1, minLen: 1.0, tris: 1400, barrelTris: 300, rests: [0, Math.PI, Math.PI] } },
    // Her nine Oerlikons, each stowed trained out on its beam: one forward of
    // her bridge, a pair on her bridge wings, and three pairs at her deck
    // edges along her waist.
    oer: { nodes: [141, 143, 55, 57, 59, 61, 205, 207, 209, 211, 153, 155, 157, 159, 145, 147, 149, 151], boxes: [
      { x: [-1.2, 1.6], y: [8.2, 10.1], z: [21.2, 22.9] },
      { x: [1.9, 4.5], y: [10.2, 12.2], z: [13.6, 15.3] },
      { x: [-4.5, -1.9], y: [10.2, 12.2], z: [13.6, 15.3] },
      { x: [1.9, 4.5], y: [6.0, 8.0], z: [-1.2, 0.5] },
      { x: [-4.5, -1.9], y: [6.0, 8.0], z: [-1.2, 0.5] },
      { x: [1.9, 4.5], y: [5.2, 7.2], z: [-5.3, -3.6] },
      { x: [-4.5, -1.9], y: [5.2, 7.2], z: [-5.3, -3.6] },
      { x: [1.9, 4.5], y: [4.7, 6.7], z: [-11.9, -10.2] },
      { x: [-4.5, -1.9], y: [4.7, 6.7], z: [-11.9, -10.2] },
    ], gun: { whole: true, tris: 900, error: 0.01 } },
    // Her Hedgehog, on its bed on the 01 level forward of her bridge: the
    // cradle and its twenty-four spigots in six rows of four, fixed, laid
    // ahead -- it throws where she is pointing.
    hedgehog: { nodes: [71, 73, 75, 77, 79, 81, 83, 85, 87, 89, 91, 93, 95, 97, 99, 101, 103, 105, 107, 109, 111, 113, 115, 117, 119], boxes: [
      { x: [-1.4, 1.3], y: [5.8, 8.4], z: [24.2, 27.8] },
    ], gun: { whole: true, tris: 3000, error: 0.004, rest: 0 } },
    // Her two screws, under her quarter.
    screw: { nodes: [45, 47], boxes: [
      { x: [0, 3.5], y: [-2.4, -0.2], z: [-37.6, -36.1] },
      { x: [-3.5, 0], y: [-2.4, -0.2], z: [-37.6, -36.1] },
    ], min: 20, hullToo: true },
  },
});
