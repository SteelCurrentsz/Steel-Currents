// Recognition silhouettes, the way a ship identification card draws them:
// side-on, filled, no detail that would not survive at thumbnail size. One per
// hull class, so the shape alone tells a captain what they have selected.

const HULLS = {
  // A flush-decked destroyer: low, two stacks, a light director forward.
  fletcher: `
    <path d="M4 30 L96 30 L92 36 L10 36 Z"/>
    <rect x="40" y="22" width="16" height="8"/>
    <rect x="46" y="14" width="4" height="9"/>
    <rect x="60" y="24" width="6" height="6"/>
    <rect x="30" y="24" width="6" height="6"/>
    <rect x="70" y="26" width="9" height="4"/>
    <rect x="20" y="26" width="9" height="4"/>`,
  // A light cruiser: longer, a tower bridge, twin funnels, four turrets.
  cleveland: `
    <path d="M3 30 L97 30 L93 37 L8 37 Z"/>
    <rect x="42" y="18" width="14" height="12"/>
    <rect x="47" y="9" width="4" height="10"/>
    <rect x="34" y="21" width="6" height="9"/>
    <rect x="60" y="21" width="6" height="9"/>
    <rect x="70" y="25" width="11" height="5"/>
    <rect x="16" y="25" width="11" height="5"/>
    <rect x="82" y="26" width="9" height="4"/>`,
  // A heavy cruiser: single trunked funnel, tall tower.
  hipper: `
    <path d="M3 30 L97 30 L93 37 L8 37 Z"/>
    <rect x="40" y="16" width="13" height="14"/>
    <rect x="45" y="7" width="4" height="10"/>
    <rect x="57" y="19" width="9" height="11"/>
    <rect x="70" y="24" width="12" height="6"/>
    <rect x="16" y="24" width="12" height="6"/>
    <rect x="84" y="26" width="8" height="4"/>`,
  // A fast battleship: heavy tower, capped funnels, three main turrets.
  iowa: `
    <path d="M2 29 L98 29 L94 38 L7 38 Z"/>
    <rect x="38" y="12" width="16" height="17"/>
    <rect x="43" y="3" width="5" height="10"/>
    <rect x="58" y="17" width="8" height="12"/>
    <rect x="68" y="21" width="14" height="8"/>
    <rect x="14" y="21" width="14" height="8"/>
    <rect x="30" y="22" width="7" height="7"/>
    <rect x="84" y="24" width="9" height="5"/>`,
  // Yamato: the longest, heaviest gun platform ever built, and unmistakable
  // for it. A raked stem with a hard sheer forward, a pagoda tower stacked
  // amidships with the great rangefinder on top of it, one big funnel raked
  // aft, and three triple 46 cm turrets -- two forward, one aft -- whose
  // barrels are a twelfth of the ship's length apiece. Bow to the left, the way
  // the rest of these are drawn.
  yamato: `
    <path d="M6 27 L11 27 L23 29.5 L97 29.5 L94 38 L12 38 Z"/>
    <rect x="13" y="25.2" width="9" height="2.2"/>
    <rect x="21" y="23.2" width="13" height="6.3"/>
    <rect x="23" y="20" width="9" height="2.2"/>
    <rect x="31" y="18" width="13" height="11.5"/>
    <path d="M44 29.5 L44 17 L47 13 L54 13 L56 17 L56 29.5 Z"/>
    <rect x="47" y="6" width="5" height="8"/>
    <rect x="48" y="2" width="3" height="4.5"/>
    <path d="M57 29.5 L59 14 L67 14 L65 29.5 Z"/>
    <rect x="67" y="23.5" width="6" height="6"/>
    <rect x="69" y="10" width="2.5" height="14"/>
    <rect x="74" y="23.2" width="13" height="6.3"/>
    <rect x="86" y="25.2" width="8" height="2.2"/>`,
  // A carrier: flight deck over everything, island to starboard.
  essex: `
    <path d="M2 26 L98 26 L98 31 L94 37 L8 37 Z"/>
    <rect x="60" y="17" width="9" height="9"/>
    <rect x="63" y="9" width="3" height="9"/>
    <rect x="30" y="22" width="4" height="4"/>
    <rect x="44" y="22" width="4" height="4"/>
    <rect x="78" y="22" width="4" height="4"/>`,
};

// Badges that say what a hull icon does when it is a button rather than a
// portrait: an arrow adds a ship, a cross removes one.
//
// The arrow stands outboard of the hull and points away from the middle of the
// screen -- out to port for your fleet on the left, out to starboard for
// theirs on the right. It is drawn once, on the left, and mirrored: the box is
// symmetrical about the hull's own centre line, so the same flip that turns
// the enemy's hull to face the other way carries her arrow round with it. The
// cross is symmetrical, so it mirrors onto itself and stays where it is.
const BADGES = {
  arrow: `<g class="badge">
    <path d="M-6 30 L-18 30 M-12 24 L-18 30 L-12 36" fill="none"
      stroke="currentColor" stroke-width="3"
      stroke-linecap="square" stroke-linejoin="miter"/>
  </g>`,
  x: `<g class="badge">
    <path d="M45 -14 L55 -4 M55 -14 L45 -4" fill="none"
      stroke="currentColor" stroke-width="3" stroke-linecap="square"/>
  </g>`,
};

/** SVG for one hull, sized to fill its box. `flip` faces her the other way,
 *  and `badge` marks the icon as an add or a remove control. */
export function silhouette(classId, { flip = false, cls = '', badge = null } = {}) {
  const body = HULLS[classId] || HULLS.fletcher;
  const mark = badge ? BADGES[badge] || '' : '';
  // Room either side for the arrow, and above for the cross. Equal margins, so
  // the box's centre line is the hull's centre line and the mirror below maps
  // the hull onto itself and the arrow across to the other side. Both badges
  // share the box, so the hull is drawn at one size whichever mark it carries.
  const box = badge ? '-22 -18 144 58' : '0 0 100 40';
  // The badge goes inside the flipped group on purpose: what a captain reads
  // off the arrow is which way is *out*, and that is the one thing about it
  // that has to turn round with the fleet it belongs to.
  //
  // The mirror is written out as a transform rather than left to a CSS
  // transform-origin: it has to fold about the hull's own centre line, x = 50,
  // and `50%` of a box whose left edge is negative is not that line in every
  // engine. `x -> 100 - x` is, everywhere.
  return `<svg class="sil ${cls}" viewBox="${box}" preserveAspectRatio="xMidYMid meet"
    role="img" aria-hidden="true">
    <g fill="currentColor"${flip ? ' transform="translate(100 0) scale(-1 1)"' : ''}>${body}${mark}</g>
  </svg>`;
}

/**
 * Iowa's main battery: one 16"/50 Mark 7 triple, drawn the way the recognition
 * cards draw a hull — flat, one colour, no detail that would not survive at
 * thumbnail size.
 *
 * Not quite side-on. She is trained a little toward the bow of the ship she
 * stands on, which is what a battery looks like a moment before it opens: the
 * long side of the gunhouse foreshortens, the sloped face plate comes round
 * into view, and a strip of roof shows over the top. In one flat colour the
 * only way to say "these are three different planes" is to leave a gap between
 * them, so the roof, the side and the face are drawn as three shapes with air
 * between them rather than as one outline.
 *
 * The turn is also why the three rifles are staggered rather than stacked
 * evenly: the near one is lower, longer and heavier and the far one higher,
 * shorter and finer, which is what perspective does to three barrels eleven
 * metres apart. Proportioned off the real mounting — a gunhouse about twelve
 * metres long with better than twenty metres of rifle outside it, which is why
 * the barrels take up half the drawing.
 *
 * It points to the right; `flip` trains it round to the left. The arrow off the
 * muzzles is the same mark the hull icons carry, drawn at the same size on
 * screen and mirrored with the guns, so it always points outboard.
 */
export function turret({ flip = false } = {}) {
  return `<svg class="turret-art" viewBox="0 0 248 92" role="img" aria-hidden="true"
    preserveAspectRatio="xMidYMid meet"${flip ? ' style="transform:scaleX(-1)"' : ''}>
    <g fill="currentColor">
      <!-- the deck she stands on, and the barbette she trains in -->
      <rect x="6" y="85" width="112" height="6"/>
      <path d="M20 85 L25 64 L92 64 L100 85 Z"/>
      <!-- the roof, receding up and away: its near edge is the top of the side
           plate and its far edge is that same edge carried round by the turn -->
      <path d="M21 22 L80 22 L110 14 L51 14 Z"/>
      <!-- sighting hood and the periscope standing on the roof -->
      <rect x="44" y="7" width="16" height="9"/>
      <rect x="72" y="8" width="6" height="7"/>
      <!-- the long side of the gunhouse: overhanging rear, flat roof line, and
           its front edge running down the slope of the face plate -->
      <path d="M12 64 L12 34 L21 26 L80 26 L92 46 L92 64 Z"/>
      <!-- the rangefinder ear out the back -->
      <rect x="1" y="36" width="13" height="11"/>
      <!-- the face come round into view: the sloped armour plate above and the
           flat front below it, both foreshortened by the turn -->
      <path d="M85 26 L115 18 L127 38 L127 56 L97 64 L97 46 Z"/>
      <!-- three rifles run out through the ports, each with its muzzle swell.
           The near one is lower, longer and heavier and the far one higher,
           shorter and finer: that is what the turn does to three barrels
           eleven metres apart. -->
      <rect x="124" y="38" width="52" height="5"/><rect x="172" y="36" width="8" height="9"/>
      <rect x="124" y="45" width="58" height="6"/><rect x="178" y="43" width="9" height="10"/>
      <rect x="124" y="53" width="64" height="7"/><rect x="184" y="50" width="10" height="13"/>
    </g>
    <path d="M206 46 L236 46 M221 31 L236 46 L221 61" fill="none"
      stroke="currentColor" stroke-width="7.5"
      stroke-linecap="square" stroke-linejoin="miter"/>
  </svg>`;
}
