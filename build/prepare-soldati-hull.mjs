// RN Soldati-class destroyer off the owner's model of her -- "Soldati
// Destroyer" by kriss50 (https://skfb.ly/ptBxW), under Creative Commons
// Attribution 4.0, credited on the game's Credits screen -- through
// build/kriss-hull.mjs: her hull, bridge, funnel, masts and deckhouses as one
// painted mesh, and her three twin 120 mm, her two triple banks of 533 mm
// tubes and her light guns cut free of her, each as the model drew it.
//
//   node build/prepare-soldati-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RM_PAINTS, rmPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Soldati', script: 'build/prepare-soldati-hull.mjs',
  src: 'assets/models/soldati_destroyer-maximum-compressed.glb',
  out: 'client/js/render/soldatiHull.data.js',
  credit: '"Soldati Destroyer" by kriss50 (https://skfb.ly/ptBxW), CC BY 4.0',
  // 106.7 m stem to stern and 3.6 m to her keel; her screws hang three
  // tenths under it. The model draws her bow -X, a sixth of a degree off its
  // own axis.
  loa: 106.7, draught: 3.9, bow: '-x', endsBelow: 6.7, yaw: 0.00265,
  paints: RM_PAINTS, paint: rmPaint, paintLines: [0, BOOT],
  deckFallback: 5.6,
  hullTris: 45000,
  kinds: {
    // Her three twin 120 mm/50 OTO 1936: No.1 on her forecastle, No.2 on the
    // platform between her banks of tubes, both laid ahead, and No.3 on her
    // after deckhouse laid astern.
    main: { nodes: [19, 21, 33, 35, 27, 29], boxes: [
      { x: [-2, 2], y: [4.5, 7.9], z: [34.3, 41] },
      { x: [-2, 2], y: [4.7, 8.1], z: [-16.1, -9.4] },
      { x: [-2, 2], y: [5.1, 8.5], z: [-39.1, -32.4] },
    ], gun: { guns: 2, minLen: 1.5, tris: 2000, barrelTris: 400, rests: [0, 0, Math.PI] } },
    // Her two triple banks of 533 mm tubes on her centreline abaft her funnel.
    tubes: { nodes: [37, 31], boxes: [
      { x: [-1.4, 1.6], y: [2.8, 5.3], z: [-7.1, 1.3] },
      { x: [-1.4, 1.5], y: [2.8, 5.2], z: [-24.7, -16.3] },
    ], gun: { tubes: 3, tris: 1600, rest: 0 } },
    // Her four 20 mm/65 Breda singles at her deck edges, abreast her bridge
    // and her funnel, stowed laid fore and aft.
    aa20: { nodes: [67, 69, 71, 73, 47, 49, 51, 53], boxes: [
      { x: [3.3, 5.2], y: [4.6, 6.8], z: [14.8, 17.7] },
      { x: [-5.0, -3.0], y: [4.6, 6.8], z: [14.8, 17.7] },
      { x: [2.3, 4.2], y: [4.5, 6.7], z: [2.5, 5.3] },
      { x: [-4.3, -2.3], y: [4.5, 6.7], z: [2.5, 5.3] },
    ], gun: { whole: true, tris: 900, error: 0.01 } },
    // And her two 13.2 mm Breda on her bridge wings.
    mg: { nodes: [55, 57, 59, 61], boxes: [
      { x: [-3.9, -2.0], y: [8.8, 11.1], z: [18.1, 20.9] },
      { x: [2.1, 4.1], y: [8.8, 11.1], z: [18.1, 20.9] },
    ], gun: { whole: true, tris: 700, error: 0.01 } },
    screw: { nodes: [11, 13], boxes: [
      { x: [-3.0, -0.1], y: [-4.2, -1.3], z: [-49.9, -48.3] },
      { x: [-0.1, 2.8], y: [-4.2, -1.3], z: [-49.9, -48.3] },
    ], min: 20, hullToo: true },
  },
});
