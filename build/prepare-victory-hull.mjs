// A Victory ship off the owner's model of one -- "Victory Cargo" by kriss50
// (https://skfb.ly/pt9CU), under Creative Commons Attribution 4.0, credited
// on the game's Credits screen -- through build/kriss-hull.mjs: her hull, her
// midships house, her masts, her booms and her kingposts as one painted mesh,
// and her guns cut free of her, each as the model drew it.
//
//   node build/prepare-victory-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { USN_PAINTS, usnPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Victory', script: 'build/prepare-victory-hull.mjs',
  src: 'assets/models/victory_cargo-maximum-compressed.glb',
  out: 'client/js/render/victoryHull.data.js',
  credit: '"Victory Cargo" by kriss50 (https://skfb.ly/pt9CU), CC BY 4.0',
  // 138.8 m over all, 8.7 m load draught.
  loa: 138.8, draught: 8.7, bow: '+z',
  paints: USN_PAINTS, paint: usnPaint, paintLines: [0, BOOT],
  deckFallback: 12,
  hullTris: 50000,
  kinds: {
    // Her 5"/38 on her poop, laid astern.
    main: { boxes: [{ x: [-2.6, 2.6], y: [7.4, 11.5], z: [-70.2, -62.4] }],
      gun: { guns: 1, minLen: 1.5, tris: 1400, barrelTris: 200, rests: [Math.PI] } },
    // Her 3"/50 on her forecastle.
    sec: { boxes: [{ x: [-2.2, 2.2], y: [7.8, 11.5], z: [60.4, 66.6] }],
      gun: { guns: 1, minLen: 1.2, tris: 1000, barrelTris: 200, rests: [0] } },
    // Her four Oerlikons as the model has them: a pair in the tubs on her
    // poop and a pair on her midships house.
    oer: { boxes: [
      { x: [5.6, 7.7], y: [7.0, 9.2], z: [-56.6, -54.9] }, { x: [-7.7, -5.6], y: [7.0, 9.2], z: [-56.6, -54.9] },
      { x: [3.2, 4.9], y: [12.3, 14.2], z: [-9.6, -8.2] }, { x: [-4.9, -3.2], y: [12.3, 14.2], z: [-9.6, -8.2] },
    ], gun: { whole: true, tris: 2000, error: 0.01 } },
    // Her one screw.
    screw: { boxes: [{ x: [-2.5, 2.5], y: [-5.8, -0.6], z: [-65.6, -62.8] }], min: 20, hullToo: true },
  },
});
