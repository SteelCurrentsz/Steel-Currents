// USS Fletcher off the owner's model of her -- "USS Fletcher (War Thunder)"
// by KojfDiscord (https://skfb.ly/pxJuz), under Creative Commons Attribution
// 4.0, credited on the game's Credits screen -- through build/kriss-hull.mjs:
// her hull, her bridge, her funnels and her deckhouses as one mesh painted in
// Measure 22, and her five 5"/38s, her two banks of tubes and her light guns
// cut free of her, each as the model drew it.
//
//   node build/prepare-fletcher-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { USN_PAINTS, BOOT } from './kriss-paints.mjs';

// Measure 22: navy blue up her side to the level of her main deck at its
// lowest, haze grey above, deck blue on her decks.
const M22 = 3.6;
await prepare({
  name: 'Fletcher', script: 'build/prepare-fletcher-hull.mjs',
  src: 'assets/models/uss_fletcher_war_thunder-maximum-compressed.glb',
  out: 'client/js/render/fletcherHull.data.js',
  credit: '"USS Fletcher (War Thunder)" by KojfDiscord (https://skfb.ly/pxJuz), CC BY 4.0',
  // 114.8 m over all, 4.0 m draught (5.4 m to the bottom of her sonar dome).
  loa: 114.8, draught: 4.0, bow: '+z', groupDepth: 2,
  paints: USN_PAINTS,
  paint: (f) => {
    if (f.kind === 'screw') return 'dark';
    if (f.cy < -0.02) return 'bottom';
    if (f.shell && f.cy < BOOT) return 'boot';
    if (f.kind) return 'light';
    if (f.up && f.cy > 2) return 'deck';
    if (f.shell && f.cy < M22) return 'grey';
    return 'light';
  },
  paintLines: [0, BOOT, M22], deckPaints: ['deck'], underPaint: 'light',
  deckFallback: 5.5,
  hullTris: 45000,
  // Her light guns and her depth charge gear are the fleet's own mountings,
  // built in fletcher.js where the model has them; the model's are taken off.
  remove: [
    { x: [2.6, 6.2], y: [4.5, 10], z: [3.3, 6.8] }, { x: [-6.2, -2.6], y: [4.5, 10], z: [3.3, 6.8] },
    { x: [-2, 2], y: [10.5, 13.6], z: [-27.6, -23.4] },
    { x: [3.4, 6.2], y: [4.5, 8], z: [-17.8, -13.4] }, { x: [-6.2, -3.4], y: [4.5, 8], z: [-17.8, -13.4] },
    { x: [3.2, 5.6], y: [4.5, 8], z: [-5.4, -3.2] }, { x: [-5.6, -3.2], y: [4.5, 8], z: [-5.4, -3.2] },
    { x: [3.0, 5.6], y: [5, 10], z: [23.2, 25.6] }, { x: [-5.6, -3.0], y: [5, 10], z: [23.2, 25.6] },
    { x: [3.4, 6.4], y: [3.8, 7], z: [-32, -21.4] }, { x: [-6.4, -3.4], y: [3.8, 7], z: [-32, -21.4] },
    { x: [0.9, 2.7], y: [3.8, 7], z: [-57.6, -51.4] }, { x: [-2.7, -0.9], y: [3.8, 7], z: [-57.6, -51.4] },
  ],
  kinds: {
    // Her five 5"/38s in their Mk 30 base-ring mounts: 51 and 52 forward,
    // 53 on her after deckhouse facing forward, 54 superfiring over 55 aft.
    main: { boxes: [
      { x: [-2.2, 2.2], y: [4.8, 10], z: [34.8, 44] },
      { x: [-2.2, 2.2], y: [7.4, 12.5], z: [27, 37] },
      { x: [-2.2, 2.2], y: [5.4, 11], z: [-22.4, -15.8], hullToo: true },
      { x: [-2.2, 2.2], y: [6.8, 11.5], z: [-41, -29] },
      { x: [-2.3, 2.3], y: [3.9, 8.6], z: [-46, -36.3], hullToo: true },
    ], gun: { guns: 1, minLen: 1.5, tris: 1400, barrelTris: 200, rests: [0, 0, 0, Math.PI, Math.PI],
      // Each about the middle of its gunhouse, over its base ring.
      pivots: [[0.14, 37.65], [0, 30.1], [0, -19.3], [0, -31.4], [0, -39.4]] } },
    // Her two quintuple banks of 21-inch tubes on her centreline.
    tubes: { boxes: [
      { x: [-2.2, 2.2], y: [5, 8.5], z: [-15.2, -6.4] },
      { x: [-2.2, 2.2], y: [5, 8.5], z: [-1.4, 7.4] },
    ], gun: { tubes: 5, tris: 1400, rest: 0 } },
  },
});
