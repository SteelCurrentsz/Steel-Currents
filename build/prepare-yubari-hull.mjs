// IJN Yūbari off the owner's model of her -- "IJN Yubari" by 42manako
// (https://skfb.ly/pwovz), under Creative Commons Attribution 4.0, credited on
// the game's Credits screen -- through build/kriss-hull.mjs: her hull, her
// bridge, her single trunked funnel and her masts as one mesh, and every
// mounting of hers that trains cut free of her, each as the model drew it:
// her six 14 cm/50 on her centreline, a single and a superfiring twin forward
// and the same aft; and her two twin banks of 61 cm tubes.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-yubari-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { IJN_PAINTS, ijnPaint, BOOT } from './kriss-paints.mjs';

const box = (x0, x1, y0, y1, z0, z1) => ({ x: [x0, x1], y: [y0, y1], z: [z0, z1], hullToo: true });

await prepare({
  name: 'Yubari', script: 'build/prepare-yubari-hull.mjs',
  src: 'assets/models/ijn_yubari-maximum-compressed.glb',
  out: 'client/js/render/yubariHull.data.js',
  credit: '"IJN Yubari" by 42manako (https://skfb.ly/pwovz), CC BY 4.0',
  // 139.5 m over all, 3.6 m draught.
  loa: 139.5, draught: 3.6, bow: '+z', groupDepth: 2,
  paints: IJN_PAINTS, paintLines: [0, BOOT],
  paint: (f) => (f.up && !f.kind && f.cy > 2 && f.cy < 10 && f.ny > 0.97 ? 'deck' : ijnPaint({ ...f, up: false })),
  deckFallback: 5, hullTris: 50000,
  rigging: { y: 10 },
  kinds: {
    // Her two twin 14 cm/50: No.2 forward and No.3 aft, each superfiring
    // over a single.
    main: { boxes: [
      box(-3.6, 3.6, 7.2, 11.2, 28.0, 41.0),
      box(-3.6, 3.6, 6.0, 10.2, -47.5, -35.2),
    ], gun: { whole: true, tris: 1800, error: 0.005, rests: [0, Math.PI] } },
    // Her two single 14 cm/50 in their shields: No.1 on her forecastle and
    // No.4 on her quarterdeck.
    sec: { boxes: [box(-3.0, 3.0, 5.2, 8.6, 40.0, 48.5), box(-2.6, 2.6, 4.2, 7.4, -48.0, -42.4)],
      gun: { whole: true, tris: 1200, error: 0.01, rests: [0, Math.PI] } },
    // Her two twin banks of 61 cm tubes on her centreline amidships.
    tubes: { boxes: [box(-2.4, 2.4, 3.8, 7.0, -31.0, -22.4), box(-2.4, 2.4, 3.8, 7.0, -18.0, -10.2)],
      gun: { tubes: 2, tris: 1000, rest: 'axis' } },
  },
});
