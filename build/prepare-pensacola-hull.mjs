// USS Pensacola off the owner's model of her -- "USS Pensacola (War Thunder)"
// by KojfDiscord (https://skfb.ly/pLHuu), under Creative Commons Attribution
// 4.0, credited on the game's Credits screen -- through build/kriss-hull.mjs:
// her hull, her tripods, her two funnels and her catapults as one mesh, and
// every mounting of hers that trains cut free of her, each as the model drew
// it: her ten 8-inch/55, a twin turret low and a triple superfiring over it
// forward and the same aft; and her eight single 5-inch/25 high-angle guns,
// four a side.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-pensacola-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { USN_CRUISER_PAINTS, usnCruiserPaint, BOOT } from './kriss-paints.mjs';

const box = (x0, x1, y0, y1, z0, z1) => ({ x: [x0, x1], y: [y0, y1], z: [z0, z1], hullToo: true });
const five = (x, z, y0 = 5.4, y1 = 10.6) => box(x - 2.6, x + 2.6, y0, y1, z - 2.6, z + 2.6);

await prepare({
  name: 'Pensacola', script: 'build/prepare-pensacola-hull.mjs',
  src: 'assets/models/uss_pensacola_war_thunder-maximum-compressed.glb',
  out: 'client/js/render/pensacolaHull.data.js',
  credit: '"USS Pensacola (War Thunder)" by KojfDiscord (https://skfb.ly/pLHuu), CC BY 4.0',
  // 178.5 m over all (585 ft 6 in), 5.9 m deep.
  loa: 178.5, draught: 5.9, bow: '+z', groupDepth: 2,
  paints: USN_CRUISER_PAINTS, paint: usnCruiserPaint, paintLines: [0, BOOT],
  deckFallback: 6, hullTris: 80000,
  rigging: { y: 14 },
  kinds: {
    // Her 8-inch/55 Mk 14: the twin No.1 with the triple No.2 superfiring
    // over it forward, trained ahead; the triple No.3 over the twin No.4 aft,
    // trained astern.
    main: { boxes: [
      box(-5.2, 5.2, 6.6, 11.0, 44.0, 68.0),
      box(-5.6, 5.6, 9.4, 14.6, 33.0, 57.0),
      box(-5.6, 5.6, 7.8, 14.6, -60.0, -35.5),
      box(-5.2, 5.2, 4.7, 9.4, -74.0, -49.0),
    ], gun: { whole: true, tris: 2600, error: 0.005, rests: [0, 0, Math.PI, Math.PI] } },
    // Her eight single 5-inch/25 Mk 19 high-angle guns, four a side: a pair
    // abreast her foremast and a pair abaft her after funnel.
    sec: { boxes: [[31.4, 7.0], [22.7, 7.0]].flatMap(([z, x]) => [five(x, z, 9.4, 13.6), five(-x, z, 9.4, 13.6)])
      .concat([-17.0, -24.5].flatMap((z) => [five(6.3, z), five(-6.3, z)])),
      gun: { whole: true, tris: 1200, error: 0.01 } },
  },
});
