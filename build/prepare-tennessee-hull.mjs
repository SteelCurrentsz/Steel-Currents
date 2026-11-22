// USS Tennessee off the owner's model of her sister -- "USS California" by
// HappySunpore (https://skfb.ly/oP7AS), under Creative Commons Attribution
// 4.0, credited on the game's Credits screen -- through build/kriss-hull.mjs:
// her hull and bulges, her tower bridge, her single funnel and her masts as
// one mesh, and every mounting of hers that trains cut free of her, each as
// the model drew it as the two sisters were rebuilt after Pearl Harbor: her
// four triple 14-inch/50, two forward and two aft; and her eight twin
// 5-inch/38, four a side.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-tennessee-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { light } from './_paint-light.mjs';

const box = (x0, x1, y0, y1, z0, z1) => ({ x: [x0, x1], y: [y0, y1], z: [z0, z1], hullToo: true });
const at = (x, z, r, y0, y1) => box(x - r, x + r, y0, y1, z - r, z + r);
const pair = (x, z, r, y0, y1) => [at(x, z, r, y0, y1), at(-x, z, r, y0, y1)];

await prepare({
  name: 'Tennessee', script: 'build/prepare-tennessee-hull.mjs',
  src: 'assets/models/uss_california-maximum-compressed.glb',
  out: 'client/js/render/tennesseeHull.data.js',
  credit: '"USS California" by HappySunpore (https://skfb.ly/oP7AS), CC BY 4.0',
  // 190.3 m over all (624 ft), 9.2 m deep.
  loa: 190.3, draught: 9.2, bow: '+x', groupDepth: 2,
  ...light,
  deckFallback: 8, hullTris: 90000,
  rigging: { y: 16 },
  kinds: {
    // Her four triple 14-inch/50 Mk 4: No.1 on her forecastle and No.2
    // superfiring over it, trained ahead; No.3 superfiring over No.4 aft,
    // trained astern.
    main: { boxes: [
      box(-6.6, 6.6, 7.0, 12.6, 39.0, 60.0),
      box(-6.6, 6.6, 9.6, 16.4, 25.0, 50.0),
      box(-6.6, 6.6, 8.0, 14.6, -62.0, -32.4),
      box(-6.6, 6.6, 5.4, 12.0, -76.0, -46.0),
    ], gun: { whole: true, tris: 3600, error: 0.005, rests: [0, 0, Math.PI, Math.PI],
      pivots: [[0, 45.6], [0, 32.8], [0, -40.8], [0, -54.3]] } },
    // Her eight twin 5-inch/38 Mk 28, four a side about her superstructure.
    sec: { boxes: [...pair(9.1, 14.8, 3.0, 9.0, 18.0), ...pair(9.5, 10.4, 3.0, 9.0, 18.0), ...pair(6.9, -12.7, 3.0, 9.0, 18.0), ...pair(8.9, -17.5, 3.4, 9.0, 18.0)],
      gun: { whole: true, tris: 1600, error: 0.01 } },
  },
});
