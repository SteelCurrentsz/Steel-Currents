// IJN Tosa off the owner's model of her -- "IJN Tosa Free Model (1920
// Japanese Battleship)" by Mixmamo.studio (https://skfb.ly/pBFBZ), under
// Creative Commons Attribution 4.0, credited on the game's Credits screen --
// through build/kriss-hull.mjs: her hull, her tower, her funnel and her masts
// as one mesh, and every mounting of hers that trains cut free of her, each
// as the model drew it: her five twin 41 cm, two forward and three aft; her
// twenty 14 cm in casemates, ten a side; and her four 8 cm high-angle guns.
//
// The model's pieces are not named for what they are, so each mounting is
// the model's pieces that draw it, by number (LIST=1 lists them): a gunhouse
// and its barrels, a casemate's shield and its gun.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-tosa-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { IJN_BB_PAINTS, ijnBBPaint, BOOT } from './kriss-paints.mjs';

/** A mounting: the model's pieces that draw it, wherever they stand. */
const by = (...nodes) => ({ x: [-30, 30], y: [-20, 80], z: [-130, 130], nodes, hullToo: true });
/** A casemate a side: its shield and its gun, starboard then port. */
const pair = (s, p) => [by(...s), by(...p)];

await prepare({
  name: 'Tosa', script: 'build/prepare-tosa-hull.mjs',
  src: 'assets/models/ijn_tosa_free_model_1920_japanese_battleship-maximum-compressed.glb',
  out: 'client/js/render/tosaHull.data.js',
  credit: '"IJN Tosa Free Model (1920 Japanese Battleship)" by Mixmamo.studio (https://skfb.ly/pBFBZ), CC BY 4.0',
  // 234.1 m over all, 9.4 m draught: the Tosa's as designed.
  loa: 234.1, draught: 9.4, bow: '+x', groupDepth: 2,
  paints: IJN_BB_PAINTS, paint: ijnBBPaint, paintLines: [0, BOOT],
  deckFallback: 5, decimate: true, hullTris: 50000, hullError: 0.005, amax: 2.0,
  rigging: { y: 14 },
  kinds: {
    // Her five twin 41 cm/45 3rd Year Type: No.1 on her forecastle and No.2
    // superfiring over it, trained ahead; No.3 abaft her funnel, and No.4
    // superfiring over No.5 on her quarterdeck, trained astern.
    main: { boxes: [by(186, 210), by(140, 184), by(246, 204), by(216, 192), by(230, 264)],
      gun: { whole: true, tris: 3500, error: 0.004, rests: [0, 0, Math.PI, Math.PI, Math.PI] } },
    // Her twenty 14 cm/50 3rd Year Type in casemates, ten a side: six on her
    // main deck and two on her upper deck trained ahead, and two abaft them
    // trained astern.
    sec: { boxes: [
      ...pair([326, 372], [280, 308]),
      ...pair([352, 316], [396, 394]),
      ...pair([332, 368], [392, 390]),
      ...pair([376, 370], [388, 356]),
      ...pair([286, 320], [354, 342]),
      ...pair([314, 300], [340, 294]),
      ...pair([296, 328], [304, 302]),
      ...pair([382, 378], [298, 402]),
      ...pair([288, 318], [400, 290]),
      ...pair([336, 386], [398, 404]),
    ], gun: { whole: true, tris: 500, error: 0.01,
      rests: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, Math.PI, Math.PI, Math.PI, Math.PI] } },
    // Her four 8 cm/40 3rd Year Type high-angle guns abreast her funnel.
    aa: { boxes: [...pair([440, 416], [432, 436]), ...pair([410, 420], [452, 412])],
      gun: { whole: true, tris: 500, error: 0.01 } },
  },
});
