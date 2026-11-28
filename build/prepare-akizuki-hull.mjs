// IJN Akizuki off the owner's model of her -- "IJN Akizuki (War Thunder)" by
// KojfDiscord (https://skfb.ly/pLHuN), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/kriss-hull.mjs: her
// hull, her bridge, her trunked funnel, her masts and her deckhouses as one
// mesh, and every mounting of hers that trains cut free of her, each as the
// model drew it: her four twin 10 cm/65 Type 98, A and B forward and X and Y
// aft; her quadruple bank of 61 cm tubes abaft her funnel; and her four triple
// 25 mm, two a side.
//
// The model is drawn a material to a piece, so every turret of hers is in the
// same few pieces: each mounting is found by where it stands, in those pieces.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-akizuki-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { IJN_PAINTS, ijnPaint, BOOT } from './kriss-paints.mjs';

// Her gunhouses, their trunnions and their barrels.
const TURRETS = [15, 17, 18, 19, 24, 43, 44, 45, 48, 54];
const TUBES = [12, 13, 65, 66];
const AA = [20, 21, 22, 23];
/** A triple 25 mm at (x, z) on its platform. */
const aa = (x, z) => ({ x: [x - 1.4, x + 1.4], y: [7.3, 9.6], z: [z - 1.6, z + 1.6], nodes: AA, hullToo: true });

await prepare({
  name: 'Akizuki', script: 'build/prepare-akizuki-hull.mjs',
  src: 'assets/models/ijn_akizuki_war_thunder-maximum-compressed.glb',
  out: 'client/js/render/akizukiHull.data.js',
  credit: '"IJN Akizuki (War Thunder)" by KojfDiscord (https://skfb.ly/pLHuN), CC BY 4.0',
  // 134.2 m over all, 4.15 m draught.
  loa: 134.2, draught: 4.15, bow: '+z', groupDepth: 2,
  paints: IJN_PAINTS, paint: ijnPaint, paintLines: [0, BOOT],
  deckFallback: 6.0, hullTris: 50000, decimate: true, hullError: 0.005, amax: 2.0,
  rigging: { y: 10 },
  kinds: {
    // Her four twin 10 cm/65 Type 98: A on her forecastle and B superfiring
    // over it, trained ahead; X superfiring over Y aft, both trained astern.
    // A and Y are taken first, so B and X keep only what stands over them.
    main: { boxes: [
      { x: [-3, 3], y: [5.3, 9.4], z: [36.5, 50.5], nodes: TURRETS, hullToo: true },
      { x: [-3, 3], y: [7.8, 12.6], z: [29.0, 46.0], nodes: TURRETS, hullToo: true },
      { x: [-3, 3], y: [3.9, 7.7], z: [-51.0, -35.5], nodes: TURRETS, hullToo: true },
      { x: [-3, 3], y: [6.2, 12.0], z: [-38.6, -26.5], nodes: TURRETS, hullToo: true },
    ], gun: { guns: 2, minLen: 1.5, tris: 2400, barrelTris: 400, rests: [0, 0, Math.PI, Math.PI] } },
    // Her quadruple bank of 61 cm tubes on her centreline abaft her funnel.
    tubes: { boxes: [{ x: [-3.2, 3.2], y: [3.9, 7.4], z: [-14.6, -4.0], nodes: TUBES, hullToo: true }],
      gun: { tubes: 4, tris: 1600, rest: 'axis' } },
    // Her four triple 25 mm Type 96, a pair a side on platforms abreast her
    // tubes and abreast her funnel.
    aa3: { boxes: [aa(3.85, -3.7), aa(-3.85, -3.7), aa(3.67, 6.7), aa(-3.67, 6.7)],
      gun: { whole: true, tris: 600, error: 0.03 } },
  },
});
