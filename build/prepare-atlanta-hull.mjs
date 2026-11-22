// USS Atlanta off the owner's model of her -- "USS Atlanta (War Thunder)" by
// KojfDiscord (https://skfb.ly/pLHuw), under Creative Commons Attribution
// 4.0, credited on the game's Credits screen -- through build/kriss-hull.mjs:
// her hull, her bridge, her two funnels and her masts as one mesh, and every
// mounting of hers that trains cut free of her, each as the model drew it:
// her eight twin 5-inch/38, three forward and three aft stepped up on her
// centreline and two waist mounts aft; and her two quadruple banks of 21-inch
// tubes.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-atlanta-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { light } from './_paint-light.mjs';

const box = (x0, x1, y0, y1, z0, z1) => ({ x: [x0, x1], y: [y0, y1], z: [z0, z1], hullToo: true });
const pair = (x0, x1, y0, y1, z0, z1) => [box(x0, x1, y0, y1, z0, z1), box(-x1, -x0, y0, y1, z0, z1)];

await prepare({
  name: 'Atlanta', script: 'build/prepare-atlanta-hull.mjs',
  src: 'assets/models/uss_atlanta_war_thunder-maximum-compressed.glb',
  out: 'client/js/render/atlantaHull.data.js',
  credit: '"USS Atlanta (War Thunder)" by KojfDiscord (https://skfb.ly/pLHuw), CC BY 4.0',
  // 165.1 m over all (541 ft 6 in), 6.2 m deep.
  loa: 165.1, draught: 6.2, bow: '+z', groupDepth: 2,
  ...light,
  deckFallback: 5, hullTris: 70000,
  rigging: { y: 14 },
  kinds: {
    // Her eight twin 5-inch/38 Mk 29: Nos.1-3 stepped up forward, trained
    // ahead; Nos.4-6 stepped down aft, trained astern; Nos.7 and 8 in her
    // waist aft, one a side.
    main: { boxes: [
      box(-3.2, 3.2, 5.4, 10.2, 47.5, 59.0),
      box(-3.2, 3.2, 7.0, 11.8, 37.5, 49.0),
      box(-3.2, 3.2, 8.8, 13.8, 29.0, 40.0),
      box(-3.2, 3.2, 8.8, 13.8, -38.0, -29.6),
      box(-3.2, 3.2, 7.0, 11.8, -47.5, -36.5),
      box(-3.2, 3.2, 5.4, 9.6, -57.0, -47.0),
      ...pair(2.4, 9.4, 5.2, 11.6, -29.4, -22.4),
    ], gun: { whole: true, tris: 1600, error: 0.005, rests: [0, 0, 0, Math.PI, Math.PI, Math.PI, Math.PI / 2, -Math.PI / 2] } },
    // Her two quadruple banks of 21-inch tubes, one a side on her main deck
    // abaft her after funnel.
    tubes: { boxes: pair(3.8, 9.8, 4.4, 8.4, -20.2, -9.4), gun: { tubes: 4, tris: 1200, rest: 'axis' } },
  },
});
