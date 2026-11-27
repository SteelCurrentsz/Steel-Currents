// Arkhangelsk off the owner's model of her -- "Arkhangelsk (War Thunder)" by
// KojfDiscord (https://skfb.ly/pLH9n), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/kriss-hull.mjs: her
// hull, her bridge, her funnel, her masts and her boats as one mesh, and
// every mounting of hers that trains cut free of her, each as the model drew
// it: her four twin 15-inch turrets, A and B forward and X and Y aft; her
// eight 6-inch in casemates, four a side; her four twin 4-inch HA; and her
// two eight-barrelled pom-poms; and the quadruple .5-inch
// Vickers on B's roof and on X's.
//
// The model is drawn a material to a piece, so every turret of hers is in the
// same few pieces: each mounting is found by where it stands, in those pieces.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-arkhangelsk-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RENOWN_PAINTS, warspitePaint, BOOT } from './kriss-paints.mjs';

// Her gunhouses, their barrels and their rangefinders.
const TURRETS = [36, 42, 43, 61, 64, 76, 91, 92];
// The quadruple .5-inch Vickers on B's roof and on X's.
const MG = [26, 27, 49, 50];
const CASEMATE = [29, 72, 74, 75];
const HA = [87, 88, 89, 90];
const POM = [83, 84, 85, 86];
/** A 6-inch casemate gun about (x, z) in her side, at height y0..y1. */
const cas = (x, z, y0 = 4.5, y1 = 6.6) => ({ x: x > 0 ? [x - 2.6, x + 1.6] : [x - 1.6, x + 2.6], y: [y0, y1], z: [z - 1.8, z + 1.8], nodes: CASEMATE, hullToo: true });
const ha = (x, z) => ({ x: [x - 2.2, x + 2.2], y: [8.6, 11.6], z: [z - 2.2, z + 2.2], nodes: HA, hullToo: true });

await prepare({
  name: 'Arkhangelsk', script: 'build/prepare-arkhangelsk-hull.mjs',
  src: 'assets/models/arkhangelsk_war_thunder-maximum-compressed.glb',
  out: 'client/js/render/arkhangelskHull.data.js',
  credit: '"Arkhangelsk (War Thunder)" by KojfDiscord (https://skfb.ly/pLH9n), CC BY 4.0',
  // 189.2 m over all (620 ft 7 in), 9.0 m deep load draught.
  loa: 189.2, draught: 9.0, bow: '+z', groupDepth: 2,
  paints: RENOWN_PAINTS, paint: warspitePaint, paintLines: [0, BOOT],
  deckFallback: 8, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 16 },
  kinds: {
    // Her four twin 15-inch Mk I: A on her forecastle and B superfiring over
    // it, trained ahead; X superfiring over Y aft, both trained astern. A and
    // Y are taken first, so B and X keep only what stands over them.
    main: { boxes: [
      { x: [-5.2, 5.2], y: [5.2, 11.0], z: [45.0, 68.5], nodes: TURRETS, hullToo: true },
      { x: [-5.2, 5.2], y: [9.4, 17.8], z: [30.0, 57.0], nodes: TURRETS, hullToo: true },
      { x: [-5.2, 5.2], y: [5.0, 8.55], z: [-68.5, -42.0], nodes: TURRETS, hullToo: true },
      { x: [-5.2, 5.2], y: [8.0, 17.8], z: [-57.0, -27.0], nodes: TURRETS, hullToo: true },
    ], gun: { guns: 2, minLen: 2, tris: 3600, barrelTris: 500, rests: [0, 0, Math.PI, Math.PI] } },
    // Her eight 6-inch Mk XII in casemates, four a side in her main deck
    // abreast her bridge, her funnel and her mainmast.
    sec: { boxes: [
      cas(11.5, 4.2), cas(-11.5, 4.2), cas(11.5, -3.8), cas(-11.5, -3.8),
      cas(11.3, -12.4), cas(-11.3, -12.4), cas(10.3, -20.1), cas(-10.3, -20.1),
    ], gun: { whole: true, tris: 900, error: 0.01 }, min: 10 },
    // Her four twin 4-inch Mk XVI HA, two a side abreast her funnel.
    dp: { boxes: [ha(10.5, 9.8), ha(-10.5, 9.8), ha(10.5, -8.75), ha(-10.5, -8.75)],
      gun: { whole: true, tris: 1400, error: 0.01 } },
    // Her two eight-barrelled 2-pounders on platforms abreast her funnel.
    pom: { boxes: [
      { x: [4.6, 9.4], y: [12.2, 15.6], z: [1.2, 6.4], nodes: POM, hullToo: true },
      { x: [-9.4, -4.6], y: [12.2, 15.6], z: [1.2, 6.4], nodes: POM, hullToo: true },
    ], gun: { whole: true, tris: 2000, error: 0.01 } },
    // Her two quadruple .5-inch Vickers, on B's roof and on X's.
    mg: { boxes: [
      { x: [-3.3, 0.5], y: [14.4, 17.8], z: [31.2, 34.8], nodes: MG, hullToo: true },
      { x: [-0.5, 3.3], y: [11.9, 15.2], z: [-32.6, -28.9], nodes: MG, hullToo: true },
    ], gun: { whole: true, tris: 700, error: 0.01 } },
  },
});
