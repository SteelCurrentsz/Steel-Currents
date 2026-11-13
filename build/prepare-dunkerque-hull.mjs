// FS Dunkerque off the owner's model of her -- "French Battleship Dunkerque"
// by kriss50 (https://skfb.ly/ptKrU), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/kriss-hull.mjs: her
// hull, her tower, her funnel and her hangar as one painted mesh, and her
// turrets and her light guns cut free of her, each as the model drew it.
//
//   node build/prepare-dunkerque-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { MN_PAINTS, mnPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Dunkerque', script: 'build/prepare-dunkerque-hull.mjs',
  src: 'assets/models/french_battleship_dunkerque-maximum-compressed.glb',
  out: 'client/js/render/dunkerqueHull.data.js',
  credit: '"French Battleship Dunkerque" by kriss50 (https://skfb.ly/ptKrU), CC BY 4.0',
  // 215.14 m over all, 8.7 m draught.
  loa: 215.14, draught: 8.7, bow: '+z',
  paints: MN_PAINTS, paint: mnPaint, paintLines: [0, BOOT], deckPaints: ['wood', 'steel'],
  deckFallback: 8.5,
  hullTris: 70000,
  kinds: {
    // Her two quadruple 330 mm turrets, both forward, No.2 superfiring.
    main: { boxes: [
      { x: [-7.5, 7.5], y: [6.0, 12.6], z: [45, 69] },
      { x: [-7.5, 7.5], y: [9.0, 14.8], z: [16.4, 41.5] },
    ], gun: { guns: 4, minLen: 3, tris: 3000, barrelTris: 800, rests: [0, 0], pivots: [[0, 52.0], [0, 23.4]] } },
    // Her three quadruple 130 mm aft, one on her centreline and one either
    // side of it, all laid astern.
    sec4: { boxes: [
      { x: [-4.2, 4.2], y: [10.4, 14.6], z: [-64.6, -52], not: [{ x: [-1.7, 1.7], y: [12.6, 16], z: [-55.7, -53.4] }] },
      { x: [-12.2, -4.8], y: [8.0, 12.4], z: [-57, -44], not: [{ x: [-10.2, -6.6], y: [10.6, 14], z: [-48.2, -45.2] }] },
      { x: [4.8, 12.2], y: [8.0, 12.4], z: [-57, -44], not: [{ x: [6.6, 10.2], y: [10.6, 14], z: [-48.2, -45.2] }] },
    ], gun: { guns: 4, minLen: 2, tris: 1600, barrelTris: 500, rests: [Math.PI, Math.PI, Math.PI], footBand: [0.4, 1.4],
      // Its barrels: the long, slim runs of it, four abreast out of its face.
      test: (p) => p.pz1 - p.pz0 > 3 && p.px1 - p.px0 < 0.6 && p.py1 - p.py0 < 0.6, face: 0.6 } },
    // And her two twin 130 mm on her beam amidships.
    sec2: { boxes: [
      { x: [-15.2, -10], y: [8, 13], z: [-11.5, -3.6] },
      { x: [10, 15.2], y: [8, 13], z: [-11.5, -3.6] },
    ], gun: { guns: 2, minLen: 2, tris: 1200, barrelTris: 300, rests: [0, 0], footBand: [0.4, 1.4],
      test: (p) => p.pz1 - p.pz0 > 3 && p.px1 - p.px0 < 0.6 && p.py1 - p.py0 < 0.6, face: -0.6 } },
    // Her 37 mm twins, abreast No.2 turret and abreast her funnel.
    aa37: { boxes: [
      { x: [-14.4, -10.4], y: [6, 9.5], z: [23.4, 27] },
      { x: [10.4, 14.4], y: [6, 9.5], z: [23.4, 27] },
      { x: [-13.2, -9.8], y: [7.5, 12.5], z: [-23.8, -20.4] },
      { x: [9.8, 13.2], y: [7.5, 12.5], z: [-23.8, -20.4] },
    ], gun: { whole: true, tris: 500, error: 0.05 } },
    // Her 13.2 mm quadruple Hotchkiss on her after superstructure.
    aa13: { boxes: [
      { x: [-12.2, -9.2], y: [7.5, 12.5], z: [-34.8, -31.8] },
      { x: [9.2, 12.2], y: [7.5, 12.5], z: [-34.8, -31.8] },
    ], gun: { whole: true, tris: 400, error: 0.05 } },
  },
});
