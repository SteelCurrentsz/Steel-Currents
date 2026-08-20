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
  // A carrier: flight deck over everything, island to starboard.
  essex: `
    <path d="M2 26 L98 26 L98 31 L94 37 L8 37 Z"/>
    <rect x="60" y="17" width="9" height="9"/>
    <rect x="63" y="9" width="3" height="9"/>
    <rect x="30" y="22" width="4" height="4"/>
    <rect x="44" y="22" width="4" height="4"/>
    <rect x="78" y="22" width="4" height="4"/>`,
};

/** SVG for one hull, sized to fill its box. `flip` faces her the other way. */
export function silhouette(classId, { flip = false, cls = '' } = {}) {
  const body = HULLS[classId] || HULLS.fletcher;
  return `<svg class="sil ${cls}" viewBox="0 0 100 40" preserveAspectRatio="xMidYMid meet"
    role="img" aria-hidden="true"${flip ? ' style="transform:scaleX(-1)"' : ''}>
    <g fill="currentColor">${body}</g>
  </svg>`;
}
