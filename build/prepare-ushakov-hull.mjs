// Admiral Ushakov, the Kirov of 1980, off the owner's model of her --
// "Kirov-class cruiser" by SB-129 (https://skfb.ly/pBNos), under Creative
// Commons Attribution 4.0, credited on the game's Credits screen -- through
// build/kriss-hull.mjs: her hull, her two great masts, her superstructure,
// her missile hatches and her hangar as one mesh, and every mounting of hers
// that trains cut free of her, each as the model drew it: her two single
// 100 mm AK-100 aft, superfiring, and her eight AK-630s, four about her
// bridge and four aft.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-ushakov-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RN_PAINTS, rnPaint, BOOT } from './kriss-paints.mjs';

const box = (x0, x1, y0, y1, z0, z1) => ({ x: [x0, x1], y: [y0, y1], z: [z0, z1], hullToo: true });
/** An AK-630 whose dome stands at (x, z), its foot at y. */
const ak = (x, z, y) => box(x - 1.6, x + 1.6, y - 0.3, y + 1.6, z - 1.4, z + 1.4);

await prepare({
  name: 'Admiral Ushakov', script: 'build/prepare-ushakov-hull.mjs',
  src: 'assets/models/kirov-class_cruiser-maximum-compressed.glb',
  out: 'client/js/render/ushakovHull.data.js',
  credit: '"Kirov-class cruiser" by SB-129 (https://skfb.ly/pBNos), CC BY 4.0',
  // 252 m over all, 9.1 m draught.
  loa: 252, draught: 9.1, bow: '+z',
  paints: RN_PAINTS, paint: rnPaint, paintLines: [0, BOOT],
  deckFallback: 10, hullTris: 40000,
  kinds: {
    // Her two single 100 mm/59 AK-100, one superfiring over the other on her
    // after superstructure, both trained astern.
    main: { boxes: [box(-2.6, 2.6, 9.8, 14.2, -88.0, -74.6), box(-2.6, 2.6, 13.2, 17.8, -75.0, -61.5)],
      gun: { whole: true, tris: 900, error: 0.01, rests: [Math.PI, Math.PI] } },
    // Her eight AK-630s: two a side abreast her forward superstructure, and
    // two a side aft by her hangar.
    ciws: { boxes: [
      ak(12.1, 38.0, 13.8), ak(-12.1, 38.0, 13.8), ak(12.1, 33.0, 14.4), ak(-12.1, 33.0, 14.4),
      ak(10.7, -94.8, 10.4), ak(-10.7, -94.8, 10.4), ak(10.7, -99.2, 9.3), ak(-10.7, -99.2, 9.3),
    ], gun: { whole: true, tris: 500, error: 0.01 } },
  },
});
