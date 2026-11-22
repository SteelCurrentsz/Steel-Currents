// IJN Tenryū off the owner's model of her sister -- "Japanese Cruiser
// Tatsuta" by kriss50 (https://skfb.ly/ptRpM), under Creative Commons
// Attribution 4.0, credited on the game's Credits screen -- through
// build/kriss-hull.mjs: her hull, bridge, three funnels, masts and deckhouses
// as one painted mesh, and every mounting of hers that trains cut free of
// her, each as the model drew it: her four single 14 cm/50 on her centreline,
// two forward and two aft; and her two triple banks of 53 cm tubes.
//
//   node build/prepare-tenryu-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { IJN_PAINTS, ijnPaint, BOOT } from './kriss-paints.mjs';

/** A 14 cm/50 on her centreline at z, its foot at y. */
const gun = (z, y) => ({ x: [-2.2, 2.2], y: [y - 0.3, y + 3.6], z: [z - 3.4, z + 4.4] });

await prepare({
  name: 'Tenryu', script: 'build/prepare-tenryu-hull.mjs',
  src: 'assets/models/japanese_cruiser_tatsuta-maximum-compressed.glb',
  out: 'client/js/render/tenryuHull.data.js',
  credit: '"Japanese Cruiser Tatsuta" by kriss50 (https://skfb.ly/ptRpM), CC BY 4.0',
  // 142.9 m over all, 4.0 m draught.
  loa: 142.9, draught: 4.0, bow: '+z',
  paints: IJN_PAINTS, paint: ijnPaint, paintLines: [0, BOOT],
  deckFallback: 4.5, hullTris: 45000,
  kinds: {
    // Her four 14 cm/50 3rd Year Type: No.1 on her forecastle and No.2 abaft
    // her bridge, No.3 and No.4 on her after deckhouse and quarterdeck.
    main: { boxes: [gun(51.2, 6.5), gun(33.0, 6.5), gun(-31.8, 6.4), gun(-44.6, 6.4)],
      gun: { whole: true, tris: 1400, error: 0.01 } },
    // Her two triple banks of 53 cm tubes on her centreline.
    tubes: { boxes: [
      { x: [-2.6, 2.6], y: [3.6, 6.6], z: [21.0, 30.0] },
      { x: [-2.6, 2.6], y: [3.6, 6.6], z: [-22.6, -13.8] },
    ], gun: { tubes: 3, tris: 1200, rest: 'axis' } },
  },
});
