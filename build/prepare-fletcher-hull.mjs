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
  // Her light guns are cut free of her as the model draws them; her depth
  // charge racks and K-guns stay on her as it draws them.
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
    // Her twin Bofors on its tub on her after deckhouse.
    bofors: { boxes: [
      { x: [-1.4, 1.4], y: [10.45, 13], z: [-26.8, -24.4] },
    ], gun: { whole: true, tris: 4000, error: 0.01 } },
    // Her six Oerlikons: a pair on her bridge wings, two pairs abreast her
    // after deckhouse.
    oer: { boxes: [
      { x: [3.3, 4.0], y: [8.0, 9.6], z: [24.3, 25.8] }, { x: [-4.0, -3.3], y: [8.0, 9.6], z: [24.3, 25.8] },
      { x: [3.8, 5.2], y: [4.1, 5.6], z: [-14.45, -13.5] }, { x: [-5.2, -3.8], y: [4.1, 5.6], z: [-14.45, -13.5] },
      { x: [3.8, 5.2], y: [4.1, 5.6], z: [-17.2, -16.3] }, { x: [-5.2, -3.8], y: [4.1, 5.6], z: [-17.2, -16.3] },
    ], gun: { whole: true, tris: 2000, error: 0.01, rests: [0, 0, Math.PI / 2, -Math.PI / 2, Math.PI / 2, -Math.PI / 2] } },
    // Her two quintuple banks of 21-inch tubes on her centreline.
    tubes: { boxes: [
      { x: [-2.2, 2.2], y: [5, 8.5], z: [-15.2, -6.4] },
      { x: [-2.2, 2.2], y: [5, 8.5], z: [-1.4, 7.4] },
    ], gun: { tubes: 5, tris: 1400, rest: 0 } },
  },
});
