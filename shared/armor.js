// A ship's armour, as the layers it really is.
//
// The datasheet gives one figure for each zone of her -- belt, deck, bow,
// upperworks -- and that figure is the whole of the protection there. A ship
// is not protected by one plate, though: a shell into a battleship's side
// meets her main belt and then, a few metres inboard of it, the torpedo
// bulkhead before it is anywhere near her machinery; one coming down meets
// the weather deck, then the main armoured deck, then the splinter deck under
// it. So each zone's figure is shared out over the plates that make it up, in
// the proportions the ships of the period carried, and a shell is walked
// through them one at a time: each one costs it what that plate is worth at
// the angle it is met, and it stops in the first it cannot beat.
//
// Shared out rather than added to, so the protection a ship has is what her
// datasheet says it is -- the layers decide where a shell stops and what it
// has reached when it bursts, not how much armour she carries.
//
// The same layers, laid out in her section, are what the penetration camera
// draws (client/js/render/pencam.js).

/** What each plate is called, by the one-letter code the wire carries. */
export const LAYER_NAMES = {
  b: 'Main belt', k: 'Torpedo bulkhead', w: 'Weather deck', d: 'Armoured deck',
  s: 'Splinter deck', f: 'Bow plating', a: 'Stern plating', u: 'Superstructure', p: 'Side plating',
};

/** A ship with this much on her belt has an armoured box -- a citadel. */
export const CITADEL_MIN = 25;

/**
 * Her armour laid out in her own section: where each plate is and how thick.
 * Heights are off her waterline and widths off her centreline, in metres;
 * thicknesses in millimetres.
 */
export function armourScheme(cls, freeboard) {
  const A = cls.armor;
  const B2 = cls.hull.beam / 2;
  const draft = cls.hull.draft;
  const fb = freeboard;
  const boxed = A.citadel >= CITADEL_MIN;
  // The belt runs from well below her waterline to a few metres above it; an
  // unarmoured ship's side is all one plate from her bilge to her deck.
  const beltTop = boxed ? Math.min(fb - 1.2, Math.max(2.4, 10 - fb * 0.2)) : fb;
  const beltLow = -draft * 0.62;
  // The armoured deck sits on the top of the belt; the weather deck is the
  // top of her hull; the splinter deck is a deck below the armoured one.
  const mainDeck = boxed ? beltTop : fb;
  return {
    boxed, B2, draft, fb, beltTop, beltLow, mainDeck,
    splinterDeck: mainDeck - 2.4,
    // The torpedo bulkhead: well inboard, from her double bottom to the
    // armoured deck. A sixth of her beam is the depth of her side protection.
    bulkheadX: B2 - cls.hull.beam * 0.16,
    bottom: -draft + 1.2,
    // Each zone's figure, shared out over its plates.
    belt: boxed ? A.belt * 0.9 : A.belt,
    bulkhead: boxed ? A.belt * 0.1 : 0,
    upper: boxed ? Math.max(8, A.belt * 0.12) : A.belt,
    weather: boxed ? A.deck * 0.15 : A.deck,
    deck: boxed ? A.deck * 0.75 : 0,
    splinter: boxed ? A.deck * 0.1 : 0,
    bow: A.bow,
    works: A.superstructure,
  };
}

/**
 * The plates a shell meets, outside in, for the zone it struck.
 *
 * `part` is the simulation's zone (see hitSection): belt, deck, bow, stern,
 * superstructure. Each layer carries the way it faces -- 'side' or 'deck' or
 * 'end' -- because a side plate and a deck plate met by the same shell are
 * met at different angles.
 */
export function layersFor(scheme, part) {
  const S = scheme;
  if (part === 'deck') {
    const out = [{ k: 'w', t: S.weather, face: 'deck' }];
    if (S.deck > 0) out.push({ k: 'd', t: S.deck, face: 'deck' });
    if (S.splinter > 0) out.push({ k: 's', t: S.splinter, face: 'deck' });
    return out;
  }
  if (part === 'bow') return [{ k: 'f', t: S.bow, face: 'end' }];
  if (part === 'stern') return [{ k: 'a', t: S.bow, face: 'end' }];
  if (part === 'superstructure') return [{ k: 'u', t: S.works, face: 'side' }];
  const out = [{ k: S.boxed ? 'b' : 'p', t: S.belt, face: 'side' }];
  if (S.bulkhead > 0) out.push({ k: 'k', t: S.bulkhead, face: 'side' });
  return out;
}

/**
 * Walk a shell through the layers.
 *
 * `pen` is what it can still go through, in millimetres of plate met square;
 * `cosOf(face)` how square it meets a plate facing that way; `fuseArm` the
 * thickness of plate it has to have been through for its fuse to start.
 * Returns where it stopped (the layer index, or -1 if it beat them all), what
 * it had left, whether its fuse is running, and what the first plate was
 * worth against it -- which is what decides a shatter.
 */
export function walkLayers(layers, pen, cosOf, fuseArm = 0) {
  let rem = pen;
  let through = 0;
  let first = 0;
  let total = 0;
  const met = [];
  for (let i = 0; i < layers.length; i++) {
    const L = layers[i];
    const eff = L.t / Math.max(0.18, cosOf(L.face));
    if (i === 0) first = eff;
    met.push(Math.round(eff));
    if (rem < eff) return { stop: i, rem, armed: through >= fuseArm, first, total: total + eff, met };
    rem -= eff;
    total += eff;
    through += L.t;
  }
  return { stop: -1, rem, armed: through >= fuseArm, first, total, met };
}
