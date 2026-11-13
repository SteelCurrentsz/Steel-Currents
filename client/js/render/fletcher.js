// USS Fletcher, drawn from the owner's model of her.
//
// The destroyer the United States built a hundred and seventy-five of: a
// flush-decked hull of a hundred and fifteen metres, five single 5"/38s in
// enclosed base-ring mounts -- 51 and 52 forward, 53 on her after deckhouse,
// 54 superfiring over 55 aft -- two quintuple banks of 21-inch tubes on her
// centreline, thirty-six and a half knots, and the depth charge racks and
// K-guns that made her as much a submarine killer as a fleet destroyer.
//
// Her hull, her bridge, her funnels and deckhouses, her five 5"/38s and her
// two banks of tubes are the model -- "USS Fletcher (War Thunder)" by
// KojfDiscord (https://skfb.ly/pxJuz), under Creative Commons Attribution
// 4.0 -- cut by build/prepare-fletcher-hull.mjs (see build/kriss-hull.mjs),
// and put together by krissShip.js with her twin Bofors and her Oerlikons cut
// from the model too, her depth charge racks and K-guns left on her as the
// model draws them, her splinter plating and her insides.
import * as D from './fletcherHull.data.js';
import { krissShip } from './krissShip.js';

const SHIP = krissShip({
  id: 'fletcher', data: D,
  // Measure 22's haze grey on her guns and her gear.
  paints: { steel: 0x87909a, steelDark: 0x5c646d, gun: 0x87909a, gunDark: 0x4d545c, deckDark: 0x3e4856 },
  armour: { citadel: [-24, 22], deck: 1.2, foot: -2.6, inset: 0.3 },
  // Her racks and her K-guns are the model's own, where her datasheet stands them.
  gear: { model: true },
});

export const { LOA, BEAM, zAt, keelY, deckOver, shellAt, LINES, MOUNT_SEATS } = SHIP;
export const FLETCHER_LOA = LOA;
export const FLETCHER_BEAM = BEAM;
export const DRAFT = SHIP.CLS.hull.draft;
export const FLETCHER_DRAFT = DRAFT;
/** Her weather deck at z, a metre in from her side: under her guns, her tubes and her deckhouses. */
export const deckAt = (z) => {
  const t = (2 * z) / LOA;
  return SHIP.surfaceY(Math.max(0.5, shellAt(t, deckOver(t) - 0.3) - 1.0), z);
};
/** The deck over her insides at station t (bow +1). */
export const sheer = deckOver;
/** How far out from her centreline her side is at z, at her deck. */
export const halfDeck = (z) => shellAt((2 * z) / LOA, deckOver((2 * z) / LOA) - 0.3);
export const fletcherSurfaceY = SHIP.surfaceY;
export const buildFletcher = () => SHIP.build();
export const fletcherParts = SHIP.parts;
export const fletcherCharges = SHIP.charges;
