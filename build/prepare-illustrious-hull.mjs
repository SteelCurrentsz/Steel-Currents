// HMS Illustrious off the owner's model of her -- "CV HMS Illustrious (War
// Thunder)" by KojfDiscord, under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/kriss-hull.mjs: her
// hull and her island as one mesh in Admiralty grey; her flight deck taken up
// and its outline kept for carrier.js to lay her runway over with her two
// lifts cut through it; and her eight twin 4.5-inch in their BD gunhouses at
// the four corners of her flight deck and her six eight-barrelled pom-poms,
// about her island and her deck edge, cut free of her, each as the model drew
// it. Her W/T masts, which the model draws lowered flat thirty metres out
// over the water with their aerial strung between them, come off her.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-illustrious-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RN_PAINTS, rnPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Illustrious', script: 'build/prepare-illustrious-hull.mjs',
  src: 'assets/models/cv_hms_illustrious_war_thunder-maximum-compressed.glb',
  out: 'client/js/render/illustriousHull.data.js',
  credit: '"CV HMS Illustrious (War Thunder)" by KojfDiscord (https://sketchfab.com/3d-models/cv-hms-illustrious-war-thunder-472e192959ae49b3b38a0df8c0340a37), CC BY 4.0',
  // 225.6 m (740 ft) over all, 8.8 m draught. Her length and beam are her
  // hull's, measured low, not the reach of her lowered masts.
  loa: 225.6, draught: 8.8, bow: '+z', endsBelow: 15,
  paints: RN_PAINTS, paint: rnPaint, paintLines: [0, BOOT],
  deckFallback: 10, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 14 },
  // Her island to starboard, her funnel built into it.
  // Her lowered W/T masts and their aerial, outboard of her deck edges.
  remove: [{ x: [17.2, 40], y: [5, 14], hullToo: true, wires: true }, { x: [-40, -17.2], y: [5, 14], hullToo: true, wires: true }],
  carrier: { minY: 10, island: { x0: -19.5, x1: -8.4, z0: -6, z1: 44, face: -8.9 } },
  kinds: {
    dp: { auto: { regions: [{}], nodes: [41, 50, 55, 56, 57], size: [3, 8], minFaces: 900, gap: 0.05 }, gun: { whole: true, tris: 1200, error: 0.01 } },
    pp8: { auto: { regions: [{}], nodes: [19, 20, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 77, 82, 83, 88, 91], size: [2.5, 6], minFaces: 5000, gap: 0.05 },
      gun: { whole: true, tris: 1600, error: 0.01 } },
  },
});
