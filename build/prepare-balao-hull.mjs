// USS Balao off the owner's model of her -- "Balao (World of Warships)" by
// KojfDiscord (https://skfb.ly/pwTJX), under Creative Commons Attribution
// 4.0, credited on the game's Credits screen -- through build/kriss-hull.mjs:
// her pressure hull, her casing and her sail as one painted mesh, and her two
// screws cut free of her. The model draws her with no deck gun; her ten tubes,
// six forward and four aft, are in her hull.
//
//   node build/prepare-balao-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { BOOT } from './kriss-paints.mjs';

// Measure 9: the fleet boats' black, their decks a little lighter.
const PAINTS = { light: 0x3a3d40, hull: 0x2a2c2f, deck: 0x45474a, dark: 0x1e2023, boot: 0x16181a, bottom: 0x2b2d2b };
const paint = (f) => {
  if (f.kind === 'screw') return 'dark';
  if (f.kind) return 'light';
  if (f.cy < -0.02) return 'bottom';
  if (f.cy < BOOT) return 'boot';
  if (f.up && f.cy < 2.6) return 'deck';
  return f.cy < 2.0 ? 'hull' : 'light';
};

await prepare({
  name: 'Balao', script: 'build/prepare-balao-hull.mjs',
  src: 'assets/models/balao_world_of_warships-maximum-compressed.glb',
  out: 'client/js/render/balaoHull.data.js',
  credit: '"Balao (World of Warships)" by KojfDiscord (https://skfb.ly/pwTJX), CC BY 4.0',
  // 95 m over all, 5.1 m draught surfaced.
  loa: 95, draught: 5.1, bow: '+z', groupDepth: 2,
  paints: PAINTS, paint, paintLines: [0, BOOT, 2.0], deckPaints: ['deck'],
  deckFallback: 2.0, sideIn: 0.4, cutAll: true, hullTris: 30000,
  kinds: {
    // Her two screws.
    screw: { boxes: [
      { x: [-2.8, -0.7], y: [-4.2, -2.0], z: [-43, -41.2] },
      { x: [0.7, 2.8], y: [-4.2, -2.0], z: [-43, -41.2] },
    ], nodes: [2, 5], min: 20, hullToo: true },
  },
});
