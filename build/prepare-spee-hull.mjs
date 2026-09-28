// Turn the reference Graf Spee sculpt into what client/js/render/speeHull.js
// actually ships. In order:
//
//   * calibrate it into this game's frame: bow to +Z by a rotation, not a
//     reflection; scaled to her length and fitted to her keel;
//   * put back the few triangles the decimator wound inside out;
//   * carve out every gun the sculpt had cast into her deck, and close each
//     hole, so spee.js can stand a real mounting there that trains and fires;
//   * fair the dents decimation left in her topsides, without moving her
//     lines, and split her normals at every crease so deck, side and belt
//     shade as three surfaces rather than one;
//   * paint her by height and by how much each vertex faces the sky (there is
//     no UV map to paint a texture onto);
//   * read her surface off as a height map, which is what spee.js seats every
//     mounting on;
//   * bucket her into length-wise slices -- so the fleet's own symmetry, hole
//     and floating-part checks, which all reason about one part at a time, see
//     something shaped like what every other builder in spee.js hands them,
//     instead of one part spanning her whole two hundred metres -- and pack it
//     all into one binary blob, base64'd into a source file spee.js decodes
//     synchronously. No loader, no fetch, no async: this ships the same way
//     every other piece of geometry in the game does.
//
// The stages themselves are build/sculpt.mjs, which the Takao's sculpt goes
// through too; what is here is what is hers.
//
//   node build/prepare-spee-hull.mjs
//
// Reads assets/models/spee-hull.glb, writes
// client/js/render/speeHull.data.js. Re-run it whenever the source asset or
// the calibration below changes; the data file is committed, not built on
// every install, so a fresh clone runs without needing this script at all.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readGlb, toGameFrame, bbox, fixWinding, carve, closeHoles, nearestBox,
  recomputeNormals, weld, stations, fair, hardEdges, shadePlating, uvs,
  paletteToLinear, paint, heightmap, heightBytes, pack,
} from './sculpt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || path.join(ROOT, 'assets/models/spee-hull.glb');
const OUT_DATA = process.argv[3]
  || path.join(ROOT, 'client/js/render/speeHull.data.js');

const REAL_LOA = 186;
const REAL_KEEL_Y = -7.44; // spee.js keelY(0)

// ---- read the glb, and put her in the game's frame ---------------------------
// Her bow is the sculpt's -X end: the tall forward control tower, Anton, the
// anchors and the stem are all that side of amidships, and her screws and
// rudder are at +X. So a quarter turn about the vertical -- see toGameFrame.
const raw = readGlb(SRC);
console.log('source', raw.pos.length / 3, 'verts', raw.idx.length / 3, 'tris');
const m = toGameFrame(raw, { length: REAL_LOA, keelY: REAL_KEEL_Y });
console.log('calibration: SCALE', m.frame.SCALE.toFixed(3), 'xc', m.frame.xc.toFixed(4),
  'localKeel', m.frame.localKeel.toFixed(4));
{
  const { lo, hi } = bbox(m);
  console.log('world bbox X', lo[0].toFixed(2), hi[0].toFixed(2));
  console.log('world bbox Y', lo[1].toFixed(2), hi[1].toFixed(2));
  console.log('world bbox Z', lo[2].toFixed(2), hi[2].toFixed(2));
}

// ---- winding ----------------------------------------------------------------
// The sculpt's own winding agrees with its own normals, bar a couple of
// hundred slivers the decimator folded over.
console.log('winding fixed:', fixWinding(m), 'of', m.T.length / 3, 'triangles were backwards');

// ---- carve the guns out of her ----------------------------------------------
// The sculpt is one welded solid: her turrets, her fifteens, her flak and her
// tube banks are lumps of hull with no seam between them and the deck. So they
// are cut away here, down to the deck (or sponson, or platform) each one
// stands on, and spee.js stands a real mounting in each place -- one that
// trains, elevates and fires.
//
// Each cut is a box in her own frame, and a triangle goes if it is inside the
// box and above `floor`, which is a hand's breadth over the deck measured
// beside that mounting. Floors are read off the sculpt: forecastle 5.1 m
// rising to 5.6 m at Anton's muzzles, main deck 4.9 m, superstructure deck
// and the funnel sponsons 7.4-7.55 m, quarterdeck 3.2 m.
const PORT_AND_STARBOARD = (c) => [c, { ...c, name: c.name + ' stbd', x0: -c.x1, x1: -c.x0 }];
const CARVE = process.env.NOCARVE ? [] : [
  // Anton: gunhouse and barbette, then her barrels on their own higher floor so
  // the forecastle under them is left alone.
  { name: 'Anton', x0: -6.6, x1: 6.6, z0: 41.7, z1: 56.4, floor: (z) => 5.25 + (z - 42) * 0.032 },
  { name: 'Anton barrels', x0: -3.8, x1: 3.8, z0: 56.2, z1: 66.6, floor: () => 7.0 },
  // Bruno, likewise; stopping short of the after end of the superstructure.
  { name: 'Bruno', x0: -6.6, x1: 6.6, z0: -50.7, z1: -37.3, floor: () => 5.02 },
  { name: 'Bruno barrels', x0: -3.8, x1: 3.8, z0: -60.3, z1: -50.5, floor: () => 6.4 },
  // The after 10.5 cm twin on the roof of the after superstructure, and the
  // barrel it lays out over Bruno.
  { name: 'after 10.5', x0: -2.6, x1: 2.6, z0: -35.7, z1: -30.9, floor: () => 7.7 },
  { name: 'after 10.5 barrel', x0: -0.9, x1: 0.9, z0: -40.2, z1: -35.6, floor: () => 8.6 },
  // Her fifteens: four a side on the main deck at the deck edge. The forward
  // pair are laid ahead and the after pair astern, and each barrel is cut on
  // its own floor so the deck and the bollards under it stay.
  ...PORT_AND_STARBOARD({ name: '15 cm 1', x0: 7.1, x1: 10.7, z0: 16.8, z1: 20.8, floor: () => 5.05 }),
  ...PORT_AND_STARBOARD({ name: '15 cm 1 barrel', x0: 8.1, x1: 9.6, z0: 20.6, z1: 25.7, floor: () => 6.2 }),
  ...PORT_AND_STARBOARD({ name: '15 cm 2', x0: 7.1, x1: 10.7, z0: 10.3, z1: 13.9, floor: () => 5.05 }),
  ...PORT_AND_STARBOARD({ name: '15 cm 2 barrel', x0: 8.1, x1: 9.6, z0: 13.7, z1: 17.6, floor: () => 6.2 }),
  ...PORT_AND_STARBOARD({ name: '15 cm 3', x0: 7.1, x1: 10.7, z0: -10.7, z1: -6.5, floor: () => 5.05 }),
  ...PORT_AND_STARBOARD({ name: '15 cm 3 barrel', x0: 8.1, x1: 9.6, z0: -14.3, z1: -10.5, floor: () => 6.2 }),
  // The boat on the superstructure deck comes out to 7.7 m beside this one.
  ...PORT_AND_STARBOARD({ name: '15 cm 4', x0: 7.75, x1: 10.7, z0: -17.4, z1: -13.7, floor: () => 5.05 }),
  ...PORT_AND_STARBOARD({ name: '15 cm 4 barrel', x0: 8.1, x1: 9.6, z0: -21.4, z1: -17.2, floor: () => 6.2 }),
  // The waist 10.5 cm twins, on the sponsons abreast the funnel.
  ...PORT_AND_STARBOARD({ name: '10.5 waist', x0: 7.55, x1: 10.8, z0: 3.3, z1: 9.9, floor: () => 7.56 }),
  // The 3.7 cm twins on the funnel platform.
  ...PORT_AND_STARBOARD({ name: '3.7 platform', x0: 3.2, x1: 4.8, z0: 3.2, z1: 4.8, floor: () => 16.62 }),
  // The two quadruple tube banks on the quarterdeck, stowed fore and aft.
  ...PORT_AND_STARBOARD({ name: 'tubes', x0: 1.3, x1: 6.1, z0: -77.3, z1: -67.7, floor: () => 3.38 }),
];
{
  const { keep, cut } = carve(m, CARVE);
  console.log('carved:', [...cut].map(([k, n]) => `${k} ${n}`).join(', '));
  // Each hole is laid flat at the deck its own cut went down to. The port
  // fifteens abreast the funnel were cast against the sponson's forward face,
  // so taking the shield away takes that face with it: the skirt closes the
  // wall and leaves the deck level where a patch straight across it was a
  // ramp from the top of the sponson to the deck.
  const s = closeHoles(m, keep, nearestBox(CARVE));
  console.log('closed', s.loops, 'holes with', s.capped, 'triangles;', s.skirted, 'skirted;',
    s.fanned, 'fanned;', s.chains, 'open chains');
}
recomputeNormals(m);

// ---- fair her sides, and split her normals at her creases -----------------------
// Decimating half a million triangles to thirty thousand left her topsides
// dented: shallow dishes and spikes a few decimetres deep all along the plating
// between the boot topping and the deck edge, which read in any low sun as a
// hull that had been through a collision. See `fair` for what may move and
// what may not; the numbers are hers. Her deck edge amidships is 5.2 m and her
// forecastle at the stem 7.2.
const FAIR = {
  passes: 24, lambda: 0.5, mu: -0.53, max: 0.3, foot: -2.6, midbody: 0.8,
  planZ: [-85, 85, 5], planY: [-6, 4, 1],
};
const canon = weld(m);
const st = stations(m, { length: REAL_LOA, beamCap: 5.2, edgeCap: 7.2 });
fair(m, canon, st, FAIR);
recomputeNormals(m);
const plating = hardEdges(m, canon, st, {
  crease: 44 * Math.PI / 180, plateTilt: 35 * Math.PI / 180, foot: FAIR.foot,
});
shadePlating(m, plating, { along: 3.0, up: 0.5 });

// ---- paint: height/normal -> the hull palette ----
const uvArr = uvs(m, 16.0);
const HULL = paletteToLinear([0x6f, 0x78, 0x83]);
const BOOT = paletteToLinear([0x1d, 0x21, 0x26]);
const ANTI = paletteToLinear([0x71, 0x35, 0x2c]);
const DECK = paletteToLinear([0x6a, 0x61, 0x53]);
const BOOT_LO = -2.2, BOOT_HI = 0.55;
const col = paint(m, (i) => {
  const { P, N } = m;
  const y = P[i * 3 + 1], up = N[i * 3 + 1];
  // A ledge out on her side -- the top of her belt -- faces the sky too, and
  // is still her side: deck colour is for a deck.
  const k = st.zBin(P[i * 3 + 2]);
  const onSide = Math.abs(P[i * 3]) > st.halfB[k] - 1.0 && y < st.edgeY[k] - 0.3;
  if (up > 0.55 && y > BOOT_HI - 0.5 && !onSide) return DECK;
  if (y < BOOT_LO) return ANTI;
  if (y <= BOOT_HI) return BOOT;
  return HULL;
});

// ---- her surface, as a height map -----------------------------------------------
// The highest point of her at every half metre, after the carve. It is what
// spee.js stands a mounting on: a gun is seated on whatever is under its
// pivot, which is her own deck rather than the lines she used to be lofted
// through -- those run two metres higher than this sculpt's decks, and every
// fitting built to them stood two metres in the air.
const HM = { x0: -12, z0: -94, step: 0.5, nx: 49, nz: 377 };
const hmBytes = heightBytes(heightmap(m, HM));

// ---- slice, pack and write -------------------------------------------------------
// Forty-eight slices keeps each under four metres.
const packed = pack(m, col, uvArr, { buckets: 48, length: REAL_LOA });
console.log('buckets', packed.buckets, 'of', 48, 'tris', packed.tris);
const b64 = packed.blob.toString('base64');
console.log('packed blob', packed.blob.length, 'bytes ->', b64.length, 'base64 chars');

writeFileSync(OUT_DATA,
  `// Generated by build/prepare-spee-hull.mjs from the reference sculpt. Do not\n`
  + `// hand-edit -- regenerate from the source asset instead.\n`
  + `export const SPEE_HULL_B64 = ${JSON.stringify(b64)};\n`
  + `// Her surface height, in centimetres, every ${HM.step} m: see speeSurfaceY.\n`
  + `export const SPEE_SURFACE = ${JSON.stringify({ ...HM, b64: hmBytes.toString('base64') })};\n`);
console.log('wrote', OUT_DATA);
