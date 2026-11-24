// USS Iowa off the owner's model of her sister -- "USS Missouri (World of
// Warships)" by KojfDiscord (https://skfb.ly/ptpCu), under Creative Commons
// Attribution 4.0, credited on the game's Credits screen; the four Iowas were
// built to the one set of drawings, and the owner sails this model as the
// name ship -- through build/kriss-hull.mjs: her hull, her two tower masts,
// her funnels and her masts as one mesh painted in Measure 22, and every
// mounting of hers that trains cut free of her, each as the model drew it:
// her three triple 16-inch, her ten twin 5"/38 in their Mk 28 gunhouses, her
// quadruple Bofors and her Oerlikons.
//
// The model draws every one of her secondaries and light guns as a piece of
// its own, so each kind is found by its pieces; her turrets are drawn in a
// great many small pieces among her decks, so each is found by a box round
// it, the superfiring turret's box leaving out the roof of the one under it.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-iowa-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { USN_PAINTS, usnPaint, BOOT } from './kriss-paints.mjs';

const box = (x0, x1, y0, y1, z0, z1, not) => ({ x: [x0, x1], y: [y0, y1], z: [z0, z1], hullToo: true, faces: true, ...(not ? { not } : {}) });
const range = (a, b) => [...Array(b - a + 1)].map((_, i) => a + i);

await prepare({
  name: 'Iowa', script: 'build/prepare-iowa-hull.mjs',
  src: 'assets/models/uss_missouri_world_of_warships-maximum-compressed.glb',
  out: 'client/js/render/iowaHull.data.js',
  credit: '"USS Missouri (World of Warships)" by KojfDiscord (https://skfb.ly/ptpCu), CC BY 4.0',
  // 270.4 m over all, 11 m draught.
  loa: 270.4, draught: 11, bow: '+z', groupDepth: 2,
  paints: USN_PAINTS, paint: usnPaint, paintLines: [0, BOOT],
  deckFallback: 5, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 14 },
  kinds: {
    main: { boxes: [
      // Turret I on her forecastle and Turret II over it, trained ahead.
      box(-7.6, 7.6, 5.1, 8.7, 50.5, 80),
      box(-8.2, 8.2, 7.0, 14, 28.8, 57.5, [{ z: [49, 66], y: [0, 8.8] }]),
      // Turret III aft, trained astern.
      box(-8.4, 8.4, 5.6, 13, -86.5, -55.8),
    ], gun: { whole: true, tris: 4500, error: 0.004, rests: [0, 0, Math.PI] } },
    // Her ten twin 5"/38, five a side.
    sec: { auto: { regions: [{}], nodes: range(113, 117), size: [3, 9], minFaces: 2000, byNode: false, gap: 0.05 },
      gun: { whole: true, tris: 1600, error: 0.008 } },
    // Her quadruple Bofors.
    aa4: { auto: { regions: [{}], nodes: range(94, 100), size: [2.5, 5], minFaces: 1200, gap: 0.05 },
      gun: { whole: true, tris: 800, error: 0.01 } },
    // And her Oerlikons.
    aa1: { auto: { regions: [{}], nodes: range(77, 80), size: [1, 2.6], minFaces: 450, maxFaces: 800, gap: 0.05 },
      gun: { whole: true, tris: 250, error: 0.03 } },
  },
});
