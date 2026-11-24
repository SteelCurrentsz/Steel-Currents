// IJN Ōyodo off the owner's model of her -- "IJN Oyodo (War Thunder) Line Of
// Contact" by KojfDiscord (https://skfb.ly/pEsIT), under Creative Commons
// Attribution 4.0, credited on the game's Credits screen -- through
// build/kriss-hull.mjs: her hull, her bridge, her trunked funnel, her masts,
// her great hangar and catapult aft as one mesh, and every mounting of hers
// that trains cut free of her, each as the model drew it: her two triple
// 15.5 cm/60 forward, and her four twin 10 cm/65 Type 98 high-angle guns, two
// a side amidships.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-oyodo-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { IJN_PAINTS, ijnPaint, BOOT } from './kriss-paints.mjs';

const box = (x0, x1, y0, y1, z0, z1) => ({ x: [x0, x1], y: [y0, y1], z: [z0, z1], hullToo: true });
const pair = (x0, x1, y0, y1, z0, z1) => [box(x0, x1, y0, y1, z0, z1), box(-x1, -x0, y0, y1, z0, z1)];

await prepare({
  name: 'Oyodo', script: 'build/prepare-oyodo-hull.mjs',
  src: 'assets/models/ijn_oyodo_war_thunder_line_of_contact-maximum-compressed.glb',
  out: 'client/js/render/oyodoHull.data.js',
  credit: '"IJN Oyodo (War Thunder) Line Of Contact" by KojfDiscord (https://skfb.ly/pEsIT), CC BY 4.0',
  // 192.1 m over all, 5.95 m draught.
  loa: 192.1, draught: 5.95, bow: '+z', groupDepth: 2,
  // The model stands her 1.7 m to starboard of its own middle.
  shiftX: -1.7,
  paints: IJN_PAINTS, paintLines: [0, BOOT],
  paint: (f) => (f.up && !f.kind && f.cy > 2 && f.cy < 12 && f.ny > 0.97 ? 'deck' : ijnPaint({ ...f, up: false })),
  deckFallback: 6, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 14 },
  kinds: {
    // Her two triple 15.5 cm/60 3rd Year Type, No.1 on her forecastle and
    // No.2 superfiring over it, both trained ahead.
    main: { boxes: [
      box(-4.6, 4.6, 5.6, 8.8, 44.0, 64.0),
      box(-4.6, 4.6, 7.2, 11.6, 36.2, 55.0),
    ], gun: { whole: true, tris: 2400, error: 0.005 } },
    // Her four twin 10 cm/65 Type 98 high-angle guns, two a side.
    sec: { boxes: [...pair(2.4, 10.4, 5.2, 10.0, 11.1, 17.5), ...pair(2.4, 10.4, 5.2, 10.0, -8.7, -2.3)],
      gun: { whole: true, tris: 1400, error: 0.01 } },
  },
});
