// HMS Warspite off the owner's model of her -- "HMS Warspite (War Thunder)" by
// KojfDiscord (https://skfb.ly/pHUJr), under Creative Commons Attribution
// 4.0, credited on the game's Credits screen -- through build/kriss-hull.mjs:
// her hull, her tower bridge of 1937, her single funnel, her masts, her
// hangars and her boats as one mesh, and every mounting of hers that trains
// cut free of her, each as the model drew it: her four twin 15-inch turrets,
// A and B forward and X and Y aft; her eight 6-inch in their casemates, four
// a side under her forecastle deck; her four twin 4-inch HA on her shelter
// deck; her four eight-barrelled pom-poms abreast her funnel; her seventeen
// Oerlikons; and her four screws.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-warspite-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RENOWN_PAINTS, warspitePaint, BOOT } from './kriss-paints.mjs';

const TURRETS = [34, 49, 63, 64, 80, 134, 135, 136];
const CASEMATE = [109, 110, 111, 112, 113];
const HA = [53, 54, 61, 70, 90, 91, 92, 93, 127, 128];
/** A 6-inch casemate gun pivoted at (x, z) in her side, trained ahead. */
const cas = (x, z, aft = 1.6) => ({ x: x > 0 ? [x - 1.6, x + 3.2] : [x - 3.2, x + 1.6], y: [4.1, 6.9], z: [z - aft, z + 5.6], nodes: CASEMATE, hullToo: true });
/** A twin 4-inch HA at (x, z) on her shelter deck. */
const ha = (x, z) => ({ x: [x - 2.0, x + 2.0], y: [6.5, 9.4], z: [z - 1.9, z + 1.9], nodes: HA, hullToo: true });

await prepare({
  name: 'Warspite', script: 'build/prepare-warspite-hull.mjs',
  src: 'assets/models/hms_warspite_war_thunder-maximum-compressed.glb',
  out: 'client/js/render/warspiteHull.data.js',
  credit: '"HMS Warspite (War Thunder)" by KojfDiscord (https://skfb.ly/pHUJr), CC BY 4.0',
  // 196.8 m over all (639 ft 5 in), 9.6 m deep load draught after her rebuild.
  loa: 196.8, draught: 9.6, bow: '+z', groupDepth: 2,
  paints: RENOWN_PAINTS, paint: warspitePaint, paintLines: [0, BOOT],
  deckFallback: 8, hullTris: 90000,
  rigging: { y: 16 },
  kinds: {
    // Her four twin 15-inch Mk I: A on her forecastle and B superfiring over
    // it, trained ahead; X superfiring over Y on her quarterdeck, both
    // trained astern. B's barrels run out over A's roof, X's over Y's.
    main: { boxes: [
      { x: [-4.8, 4.8], y: [7.2, 10.9], z: [44.5, 68.5], nodes: TURRETS },
      { x: [-4.8, 4.8], y: [10.9, 15.0], z: [30.0, 61.0], nodes: TURRETS },
      { x: [-4.8, 4.8], y: [8.95, 12.4], z: [-62.0, -37.5], nodes: TURRETS },
      { x: [-4.8, 4.8], y: [5.2, 8.95], z: [-76.0, -52.3], nodes: TURRETS },
    ], gun: { guns: 2, minLen: 2, tris: 3600, barrelTris: 500, rests: [0, 0, Math.PI, Math.PI] } },
    // Her eight 6-inch Mk XII in casemates, four a side in her forecastle
    // side abreast B turret and her bridge, trained ahead; the aftmost pair's
    // barrels drawn trained out on her beam, reaching back past their pivots.
    sec: { boxes: [
      cas(10.1, 29.2), cas(-10.1, 29.2), cas(11.9, 21.3), cas(-11.9, 21.3),
      cas(12.2, 13.5), cas(-12.2, 13.5), cas(12.3, 5.6, 2.8), cas(-12.3, 5.6, 2.8),
    ], gun: { whole: true, tris: 900, error: 0.01 }, min: 10 },
    // Her four twin 4-inch Mk XVI HA on her shelter deck, two a side.
    dp: { boxes: [ha(10.76, 8.7), ha(-10.76, 8.7), ha(12.36, -7.46), ha(-12.36, -7.46)],
      gun: { whole: true, tris: 1400, error: 0.01 } },
    // Her four eight-barrelled 2-pounders, two a side abreast her funnel.
    pom: { auto: { regions: [{ y: [12, 17], z: [-5, 8] }], nodes: [50, 65, 71, 72, 82, 83, 84, 85, 86, 87, 88, 89], size: [3, 6], minFaces: 2000, gap: 0.05 },
      gun: { whole: true, tris: 2000, error: 0.01 } },
    // Her seventeen Oerlikons: on B's and X's roofs, about her bridge, on her
    // after superstructure and one right aft on her quarterdeck.
    aa1: { auto: { regions: [{}], nodes: [57, 94, 95, 132, 133], size: [0.8, 3], minFaces: 500, gap: 0.1 },
      gun: { whole: true, tris: 400, error: 0.02 } },
    // Her four screws: the wing pair forward of the inner.
    screw: { boxes: [
      { x: [4.1, 8.2], y: [-9.0, -4.9], z: [-74.6, -72.9], nodes: [51] },
      { x: [-8.2, -4.1], y: [-9.0, -4.9], z: [-74.6, -72.9], nodes: [51] },
      { x: [0.4, 4.4], y: [-9.1, -5.1], z: [-81.6, -80.0], nodes: [51] },
      { x: [-4.4, -0.4], y: [-9.1, -5.1], z: [-81.6, -80.0], nodes: [51] },
    ], min: 20, hullToo: true },
  },
});
