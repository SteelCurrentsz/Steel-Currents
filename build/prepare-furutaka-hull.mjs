// IJN Furutaka off the owner's model of her -- "IJN Furutaka (War Thunder)" by
// KojfDiscord (https://skfb.ly/pvYqC), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/kriss-hull.mjs: her
// hull, her bridge, her two funnels, her masts, her catapult and crane as one
// mesh, and every mounting of hers that trains cut free of her, each as the
// model drew it after her rebuilding of 1937-39: her three twin 20.3 cm
// turrets, two forward and one aft; her four single 12 cm/45 high-angle guns
// on her upper deck; and her two quadruple banks of 61 cm tubes.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-furutaka-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { IJN_PAINTS, ijnPaint, BOOT } from './kriss-paints.mjs';

/** A 12 cm/45 in her sponson at z, port (+1) or starboard (-1), its barrel trained out on the beam. */
const ha = (side, z) => ({ x: side > 0 ? [4.9, 11.0] : [-11.0, -4.9], y: [4.4, 7.5], z: [z - 1.7, z + 1.7], hullToo: true });

await prepare({
  name: 'Furutaka', script: 'build/prepare-furutaka-hull.mjs',
  src: 'assets/models/ijn_furutaka_war_thunder-maximum-compressed.glb',
  out: 'client/js/render/furutakaHull.data.js',
  credit: '"IJN Furutaka (War Thunder)" by KojfDiscord (https://skfb.ly/pvYqC), CC BY 4.0',
  // 185.17 m over all, 5.6 m draught.
  loa: 185.17, draught: 5.6, bow: '+z', groupDepth: 2,
  // Her decks are planked where they lie flat and low -- her forecastle, her
  // upper deck and her shelter deck -- and grey where they slope or stand
  // high.
  paints: IJN_PAINTS, paintLines: [0, BOOT],
  paint: (f) => (f.up && !f.kind && f.cy > 2 && f.cy < 12 && f.ny > 0.97 ? 'deck' : ijnPaint({ ...f, up: false })),
  deckFallback: 6, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  kinds: {
    // Her three twin 20.3 cm/50: No.1 on her forecastle and No.2 superfiring
    // over it, trained ahead, and No.3 on her quarterdeck, trained astern.
    // Taken in that order, each takes what stands in its own box and none of
    // the next's.
    main: { boxes: [
      { x: [-3.6, 3.6], y: [2.7, 8.7], z: [52.0, 67.2], },
      { x: [-3.6, 3.6], y: [5.1, 11.9], z: [43.9, 59.2], },
      { x: [-3.6, 3.6], y: [0.7, 7.6], z: [-60.6, -44.5], },
    ], gun: { whole: true, tris: 3000, error: 0.005, rests: [0, 0, Math.PI] } },
    // Her four single 12 cm/45 10th Year Type high-angle guns, in sponsons
    // two a side on her upper deck abreast her funnels, trained out on her beam.
    sec: { boxes: [ha(1, 8.0), ha(-1, 8.0), ha(1, 0.2), ha(-1, 0.2)],
      gun: { whole: true, tris: 1600, error: 0.01, rests: [Math.PI / 2, -Math.PI / 2, Math.PI / 2, -Math.PI / 2] } },
    // Her two quadruple banks of 61 cm Type 92 tubes, one a side on her upper
    // deck abaft her mainmast.
    tubes: { boxes: [
      { x: [2.4, 8.2], y: [4.4, 8.2], z: [-27.0, -15.0] },
      { x: [-8.2, -2.4], y: [4.4, 8.2], z: [-27.0, -15.0] },
    ], gun: { tubes: 4, tris: 1500, rest: 'axis' } },
  },
});
