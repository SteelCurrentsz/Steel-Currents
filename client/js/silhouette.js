// Recognition silhouettes, the way a ship identification card draws them:
// side-on, filled, no detail that would not survive at thumbnail size. One per
// hull class, so the shape alone tells a captain what they have selected.

const HULLS = {
  // A Higgins boat: a low open box, her ramp standing square at her bow, her
  // coxswain's shield and the two Brownings aft.
  higgins: `
    <path d="M6 24 L86 22 L90 22 L90 34 L84 37 L10 37 L5 33 Z"/>
    <rect x="86" y="12" width="5" height="12"/>
    <rect x="20" y="16" width="9" height="7"/>
    <rect x="12" y="18" width="6" height="5"/>
    <rect x="31" y="18" width="6" height="5"/>
    <rect x="11" y="15.5" width="9" height="1.4"/>
    <rect x="30" y="15.5" width="9" height="1.4"/>`,
  // A Landing Craft Mechanized: a long open box, her ramp raked up at her
  // bow, and her coxswain's deckhouse aft.
  lcm: `
    <path d="M4 24 L78 24 L92 12 L95 14 L84 37 L8 37 L4 33 Z"/>
    <rect x="10" y="12" width="14" height="12"/>
    <rect x="12" y="8" width="8" height="4"/>
    <rect x="15" y="3" width="1.4" height="5"/>`,
  // A Liberty ship: a long, low three-island merchantman -- forecastle, the
  // house amidships with its one funnel, poop -- two masts forward of the
  // house and one abaft it, and a gun at either end.
  liberty: `
    <path d="M3 28 L97 26 L94 36 L6 36 Z"/>
    <rect x="36" y="20" width="19" height="8"/>
    <rect x="38" y="16" width="11" height="4"/>
    <rect x="43" y="10" width="5" height="6"/>
    <rect x="76" y="7" width="1.6" height="20"/>
    <rect x="65" y="10" width="1.6" height="17"/>
    <rect x="23" y="9" width="1.6" height="19"/>
    <rect x="73" y="12" width="7.6" height="1.4"/>
    <rect x="62" y="14" width="7.6" height="1.4"/>
    <rect x="20" y="13" width="7.6" height="1.4"/>
    <rect x="86" y="22" width="8" height="4"/>
    <rect x="89" y="20.5" width="7" height="1.4"/>
    <rect x="4" y="24" width="10" height="4"/>
    <rect x="1" y="22.5" width="7" height="1.4"/>`,
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
  // The six destroyers off the owner's models -- the Evarts, the H-class,
  // the Tribal, the Z1, the Z-57 and the Soldati -- each off her own side
  // elevation (build/prepare-<ship>-hull.mjs), her bow to the left.
  evarts: `
    <path d="M2.0 26.9 L98.0 28.6 L95.0 36 L7.0 36 Z"/>
    <rect x="23.9" y="24.7" width="17.4" height="6.3"/>
    <rect x="29.3" y="22.4" width="8.7" height="8.6"/>
    <rect x="47.3" y="22.6" width="3.2" height="8.4"/>
    <rect x="53.3" y="26.4" width="31.5" height="4.6"/>
    <rect x="10.8" y="26.8" width="5.5" height="4.2"/>
    <rect x="68.5" y="25.8" width="4.9" height="5.2"/>
    <rect x="78.1" y="26.4" width="4.6" height="4.6"/>
    <rect x="37.7" y="13.5" width="1.6" height="17.5"/>`,
  hclass: `
    <path d="M2.0 27.5 L98.0 29.2 L95.0 36 L7.0 36 Z"/>
    <rect x="20.3" y="25.1" width="18.0" height="5.9"/>
    <rect x="27.6" y="22.2" width="9.7" height="8.8"/>
    <rect x="40.6" y="23.2" width="2.2" height="7.8"/>
    <rect x="52.3" y="23.4" width="2.2" height="7.6"/>
    <rect x="12.8" y="26.1" width="6.7" height="4.9"/>
    <rect x="19.8" y="24.4" width="6.4" height="6.6"/>
    <rect x="79.7" y="26.0" width="6.9" height="5.0"/>
    <rect x="86.6" y="27.8" width="6.3" height="3.2"/>
    <rect x="75.4" y="26.9" width="7.8" height="4.1"/>
    <rect x="62.7" y="26.4" width="5.8" height="4.6"/>
    <rect x="39.3" y="15.3" width="1.6" height="15.7"/>
    <rect x="78.9" y="18.4" width="1.6" height="12.6"/>`,
  tribal: `
    <path d="M2.0 26.8 L98.0 28.9 L95.0 36 L7.0 36 Z"/>
    <rect x="20.8" y="24.4" width="16.7" height="6.6"/>
    <rect x="29.1" y="22.2" width="6.7" height="8.8"/>
    <rect x="44.2" y="23.0" width="2.3" height="8.0"/>
    <rect x="54.2" y="23.0" width="2.5" height="8.0"/>
    <rect x="15.7" y="25.8" width="2.6" height="5.2"/>
    <rect x="24.1" y="24.4" width="2.7" height="6.6"/>
    <rect x="65.9" y="25.8" width="11.7" height="5.2"/>
    <rect x="78.2" y="26.0" width="2.5" height="5.0"/>
    <rect x="85.1" y="27.5" width="2.5" height="3.5"/>
    <rect x="40.7" y="16.0" width="1.6" height="15.0"/>
    <rect x="67.4" y="21.9" width="1.6" height="9.1"/>`,
  z1: `
    <path d="M2.0 26.8 L98.0 28.9 L95.0 36 L7.0 36 Z"/>
    <rect x="24.2" y="24.0" width="16.1" height="7.0"/>
    <rect x="29.8" y="22.6" width="9.7" height="8.4"/>
    <rect x="35.9" y="21.6" width="3.2" height="9.4"/>
    <rect x="49.6" y="22.2" width="3.2" height="8.8"/>
    <rect x="58.9" y="25.4" width="10.5" height="5.6"/>
    <rect x="69.4" y="26.2" width="6.0" height="4.8"/>
    <rect x="14.5" y="25.8" width="2.2" height="5.2"/>
    <rect x="18.5" y="24.2" width="2.1" height="6.8"/>
    <rect x="70.6" y="26.2" width="2.0" height="4.8"/>
    <rect x="79.2" y="26.1" width="2.0" height="4.9"/>
    <rect x="85.5" y="27.5" width="2.0" height="3.5"/>
    <rect x="34.3" y="12.8" width="1.6" height="18.2"/>
    <rect x="65.3" y="20.5" width="1.6" height="10.5"/>`,
  z57: `
    <path d="M2.0 26.6 L98.0 28.9 L95.0 36 L7.0 36 Z"/>
    <rect x="27.1" y="23.3" width="16.0" height="7.7"/>
    <rect x="32.5" y="21.2" width="6.8" height="9.8"/>
    <rect x="43.1" y="22.0" width="4.2" height="9.0"/>
    <rect x="58.4" y="22.0" width="4.6" height="9.0"/>
    <rect x="65.2" y="25.1" width="6.1" height="5.9"/>
    <rect x="16.2" y="24.7" width="4.2" height="6.3"/>
    <rect x="22.3" y="23.1" width="4.1" height="7.9"/>
    <rect x="73.9" y="24.8" width="4.3" height="6.2"/>
    <rect x="81.2" y="26.5" width="4.2" height="4.5"/>
    <rect x="39.1" y="10.0" width="1.6" height="21.0"/>
    <rect x="69.8" y="21.2" width="1.6" height="9.8"/>`,
  soldati: `
    <path d="M2.0 27.1 L98.0 28.7 L95.0 36 L7.0 36 Z"/>
    <rect x="23.0" y="24.4" width="18.9" height="6.6"/>
    <rect x="30.2" y="21.6" width="6.3" height="9.4"/>
    <rect x="37.0" y="22.5" width="5.1" height="8.5"/>
    <rect x="16.0" y="25.7" width="2.8" height="5.3"/>
    <rect x="61.3" y="25.5" width="2.8" height="5.5"/>
    <rect x="65.3" y="26.8" width="5.4" height="4.2"/>
    <rect x="79.5" y="25.3" width="2.9" height="5.7"/>
    <rect x="76.1" y="26.4" width="9.9" height="4.6"/>
    <rect x="34.8" y="12.5" width="1.6" height="18.5"/>
    <rect x="74.8" y="15.6" width="1.6" height="15.4"/>`,

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
  // The Louisiana: a long flush deck, two twin turrets forward with B
  // superfiring, a tall tower and two capped funnels amidships, and X
  // superfiring over Y aft.
  louisiana: `
    <path d="M2 29 L98 28 L94 38 L7 38 Z"/>
    <rect x="71" y="23" width="8" height="6"/>
    <rect x="63.5" y="20" width="8" height="9"/>
    <rect x="30" y="20" width="8" height="9"/>
    <rect x="22.5" y="23" width="8" height="6"/>
    <rect x="40" y="18" width="21" height="11"/>
    <rect x="55" y="8" width="5" height="11"/>
    <rect x="56.8" y="2" width="1.4" height="7"/>
    <rect x="51" y="11" width="4" height="8"/>
    <rect x="43" y="12" width="4" height="7"/>
    <rect x="47.5" y="5" width="1.2" height="13"/>`,
  // The Oregon: a super battleship, longer and lower, two twin turrets
  // forward with B superfiring, her tower and lattice masts amidships, and
  // three twin turrets aft, Y superfiring over Z.
  oregon: `
    <path d="M2 29 L98 28.5 L95 38 L6 38 Z"/>
    <rect x="73" y="23" width="8" height="6"/>
    <rect x="65.5" y="20" width="8" height="9"/>
    <rect x="34" y="23" width="8" height="6"/>
    <rect x="24.5" y="20" width="8" height="9"/>
    <rect x="17" y="23.5" width="8" height="5.5"/>
    <rect x="43" y="18" width="20" height="11"/>
    <rect x="56" y="8" width="5" height="11"/>
    <rect x="57.8" y="2" width="1.4" height="7"/>
    <rect x="47" y="12" width="5" height="7"/>
    <rect x="52.5" y="6" width="1.2" height="12"/>`,
  // The North Carolina: a long flush deck with a sheer up to her bow, two
  // triple turrets forward, No.2 superfiring, a tall tower forward of her two
  // funnels, a tripod abaft them, and No.3 aft.
  northcarolina: `
    <path d="M2 27 L20 29 L98 29 L95 38 L7 38 Z"/>
    <rect x="21" y="24" width="10" height="5"/>
    <rect x="31" y="21" width="10" height="5"/>
    <rect x="41" y="15" width="12" height="14"/>
    <rect x="45" y="5" width="4" height="10"/>
    <rect x="53" y="13" width="5" height="16"/>
    <rect x="59" y="14" width="5" height="15"/>
    <rect x="64.5" y="9" width="1.4" height="20"/>
    <rect x="62" y="20" width="10" height="9"/>
    <rect x="71" y="24" width="10" height="5"/>`,
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
  // The Amagi as she would have been finished: a long battlecruiser's hull
  // sheering up to her bow, two twin turrets forward -- No.2 superfiring --
  // a pagoda bridge, two funnels and a tall mainmast amidships, No.3 abaft
  // it facing aft, and two twin turrets aft, No.4 superfiring.
  amagi: `
    <path d="M3 28.6 L20 30 L96 31 L94 38 L10 38 Z"/>
    <rect x="24" y="28.6" width="4.4" height="1.8"/>
    <rect x="19.8" y="28.9" width="4.4" height="0.7"/>
    <rect x="29.4" y="26.8" width="4.3" height="3.6"/>
    <rect x="25.6" y="27.2" width="4" height="0.7"/>
    <rect x="33.5" y="27.6" width="24" height="2.9"/>
    <path d="M33.8 27.8 L35 18.4 L43 18.4 L43.4 27.8 Z"/>
    <rect x="37.4" y="11" width="2.8" height="7.6"/>
    <path d="M40.4 27.8 L41 19.7 L43.8 19.7 L43.6 27.8 Z"/>
    <path d="M45.3 27.8 L45.8 21.2 L48.6 21.2 L48.4 27.8 Z"/>
    <rect x="53" y="1.2" width="1.1" height="26.8"/>
    <rect x="57.6" y="27.3" width="4.3" height="3.2"/>
    <rect x="61.8" y="27.7" width="4" height="0.7"/>
    <rect x="67.8" y="27.3" width="4.2" height="3.4"/>
    <rect x="73" y="29.4" width="4.3" height="1.8"/>
    <rect x="77.2" y="29.7" width="4" height="0.7"/>`,
  // A Type VIIC: the long low casing of a sea-going U-boat, her saddle tanks
  // swelling her amidships under it, her tower a little forward of her
  // middle with the Wintergarten abaft it, and her periscope standards.
  viic: `
    <path d="M3 27 L8 26.6 L93 27.4 L97 27.9 L92 33 L62 38.6 L20 38.6 L6 32 Z"/>
    <path d="M43.6 27 L44.4 21 L53.4 21 L53.6 27 Z"/>
    <rect x="53.4" y="23.2" width="4.8" height="3.9"/>
    <rect x="45.4" y="12.6" width="0.9" height="8.6"/>
    <rect x="50" y="18.4" width="0.7" height="2.8"/>`,
  // The VIIC/41: the same boat, with her 8.8 cm on her casing forward of the
  // tower and her flak on the two galleries abaft it.
  viic41: `
    <path d="M3 27 L8 26.6 L93 27.4 L97 27.9 L92 33 L62 38.6 L20 38.6 L6 32 Z"/>
    <path d="M43.6 27 L44.4 21.6 L52 21.6 L52.2 27 Z"/>
    <rect x="51.8" y="22.6" width="3.6" height="4.6"/>
    <rect x="55.2" y="24.2" width="4.4" height="3"/>
    <rect x="45.2" y="14.2" width="0.9" height="7.6"/>
    <rect x="37.4" y="24.8" width="2.6" height="2.4"/>
    <rect x="34.6" y="25.1" width="4" height="0.7"/>`,
  // A U-class III: a short, round-bowed coastal boat, her tower aft of her
  // middle, her 3-inch on a bandstand at its forward end, and the tall
  // standards of her periscopes.
  uclass: `
    <path d="M2 30 C2 26.8 6 26.4 10 26.4 L80 27.2 L97 28.8 L96 30 L82 33.6 L56 38.8 L18 38.8 C8 38 2 35 2 30 Z"/>
    <path d="M49.2 26.6 L49.2 22.6 L56.8 22.2 L58.4 24.2 L58.4 26.8 Z"/>
    <rect x="52.4" y="9.4" width="0.8" height="13"/>
    <rect x="54.6" y="19.6" width="0.7" height="3"/>
    <rect x="44.6" y="24.6" width="3" height="2.2"/>
    <rect x="40.8" y="25" width="4.4" height="0.6"/>`,
  // A carrier: flight deck over everything, island to starboard.
  enterprise: `
    <path d="M2 26 L98 26 L98 31 L94 37 L8 37 Z"/>
    <rect x="60" y="17" width="9" height="9"/>
    <rect x="63" y="9" width="3" height="9"/>
    <rect x="30" y="22" width="4" height="4"/>
    <rect x="44" y="22" width="4" height="4"/>
    <rect x="78" y="22" width="4" height="4"/>`,
  // The Graf Zeppelin: her flight deck stops short of her stem, over an open
  // forecastle, and her island is a long low block amidships with the funnel
  // in it, a tall mast over it and the jib of her crane raked up abaft it.
  // Her 10.5 cm turrets stand on the deck in line with it, three a side of it.
  grafzeppelin: `
    <path d="M3 30 L8 31 L95 31 L93 37 L9 37 Z"/>
    <path d="M10 26 L97 26 L97 31 L10 31 Z"/>
    <rect x="42" y="19" width="17" height="7"/>
    <rect x="47" y="13" width="8" height="7"/>
    <rect x="50" y="3" width="1.6" height="11"/>
    <path d="M58 21 L65 12 L66 13 L60 22 Z"/>
    <rect x="24" y="23.5" width="3.5" height="2.5"/>
    <rect x="30" y="23.5" width="3.5" height="2.5"/>
    <rect x="36" y="23.5" width="3.5" height="2.5"/>
    <rect x="63" y="23.5" width="3.5" height="2.5"/>
    <rect x="69" y="23.5" width="3.5" height="2.5"/>
    <rect x="75" y="23.5" width="3.5" height="2.5"/>`,
  // The Cesare Borgia: a long cruiser hull, her forecastle deck carried aft
  // to abreast her fore funnel, two triple turrets at each end -- B and X
  // superfiring -- a tall round bridge tower with its mast, two funnels, her
  // dual-purpose guns' shields down her side between them, and a tower
  // mainmast aft.
  borgia: `
    <path d="M2 27 L45 27 L46 29 L98 29 L95 37 L6 37 Z"/>
    <rect x="26.5" y="24" width="5" height="3"/>
    <rect x="32.5" y="21" width="5" height="4"/>
    <rect x="38" y="15" width="5.5" height="12"/>
    <rect x="39" y="12" width="3.5" height="3"/>
    <rect x="40.2" y="4" width="1.4" height="8"/>
    <rect x="38.5" y="25" width="14" height="4"/>
    <rect x="44.5" y="19" width="3.3" height="8"/>
    <rect x="52" y="19.5" width="3.2" height="9.5"/>
    <rect x="57" y="19" width="3.5" height="10"/>
    <rect x="58.1" y="9" width="1.4" height="10"/>
    <rect x="66" y="22" width="5" height="4"/>
    <rect x="71.5" y="25.5" width="5" height="3.5"/>`,
  // The Suzuya: a Mogami, a long low flush-decked cruiser hull sheering up
  // to her bow, two triple turrets at each end -- No.2 and No.3 superfiring
  // -- her tall pagoda bridge with its mast, two raked funnels, the fore one
  // trunked, a tripod mainmast between them and her aircraft deck aft.
  suzuya: `
    <path d="M2 28.5 L20 30 L80 30.5 L98 31 L95 37 L6 37 Z"/>
    <rect x="21" y="27.5" width="4.2" height="3.2"/>
    <rect x="26.7" y="25.5" width="4.2" height="5.2"/>
    <rect x="31" y="27.5" width="27" height="3.2"/>
    <rect x="33.1" y="19.6" width="6" height="8.7"/>
    <rect x="34.6" y="15.8" width="3.6" height="4.7"/>
    <rect x="37.8" y="12.4" width="1.2" height="8.7"/>
    <path d="M41.5 28.6 L45.5 21.2 L49 21.6 L48.5 28.6 Z"/>
    <rect x="51.7" y="22" width="3.3" height="6.7"/>
    <rect x="55.9" y="8.4" width="1.2" height="20.7"/>
    <rect x="58" y="27" width="11" height="3.7"/>
    <rect x="69.9" y="25.1" width="4.2" height="5.7"/>
    <rect x="74.2" y="27.5" width="4.2" height="3.7"/>`,
  // The Yodo: a big flush-decked cruiser hull with a long forecastle, two
  // triple turrets at each end -- the inner ones superfiring -- a tall tower
  // bridge and its mast, one great trunked funnel raked aft, a tall mainmast
  // and an after control tower, and her crane at her stern.
  yodo: `
    <path d="M2 27 L20 29 L78 29 L80 31.7 L98 31.7 L95 37 L6 37 Z"/>
    <rect x="23.3" y="26.6" width="4.2" height="2.5"/>
    <rect x="29.1" y="24" width="4.2" height="5"/>
    <rect x="33.5" y="26" width="32" height="3"/>
    <rect x="36.2" y="15" width="4.7" height="11"/>
    <rect x="37" y="11.9" width="3.2" height="3.5"/>
    <rect x="39.4" y="7" width="1.2" height="9"/>
    <path d="M42.5 26 L47.4 17.3 L51.5 17.3 L52 26 Z"/>
    <rect x="58.4" y="1.2" width="1.2" height="25"/>
    <rect x="60.2" y="15" width="4.1" height="11"/>
    <rect x="64.5" y="24" width="4.2" height="5"/>
    <rect x="69.8" y="26.7" width="4.2" height="2.5"/>
    <path d="M93 31.7 L96.4 18 L97.1 18.3 L94.3 31.7 Z"/>`,
  // The Mogami as a heavy cruiser: her long low hull sheering up to her bow,
  // three twin turrets forward -- No.3 superfiring over No.2 -- her pagoda
  // bridge and its tripod, one great trunked funnel raked aft, a tall
  // mainmast, and two twin turrets aft, No.4 superfiring.
  mogami: `
    <path d="M2 28 L14 30 L94 30 L98 31.4 L95 37 L6 37 Z"/>
    <rect x="16.8" y="27.4" width="4.2" height="2.6"/>
    <rect x="23.6" y="27.6" width="4.2" height="2.4"/>
    <rect x="28" y="25.2" width="4.2" height="4.8"/>
    <rect x="32.5" y="26.2" width="37" height="3.8"/>
    <rect x="35.7" y="18.5" width="4.3" height="8"/>
    <rect x="36.6" y="15.6" width="3" height="3.2"/>
    <rect x="38.6" y="10.8" width="1.2" height="9"/>
    <path d="M43.5 26.2 L48 18.2 L52 18.2 L51.5 26.2 Z"/>
    <rect x="69" y="2" width="1.2" height="25"/>
    <rect x="71.6" y="24.8" width="4.2" height="5.2"/>
    <rect x="76.1" y="26.9" width="4.2" height="3.1"/>`,
  // The Renown as rebuilt: a long battlecruiser hull with a raised
  // forecastle, A and B forward, a tower bridge, two widely spaced funnels,
  // a pole mainmast with her hangar and crane abaft the after funnel, and Y
  // aft.
  renown: `
    <path d="M2 27 L50 28.6 L50 30 L94 30 L98 31.2 L95 37 L6 37 Z"/>
    <rect x="18.5" y="24.5" width="5" height="3.2"/>
    <rect x="24.5" y="22" width="5" height="4"/>
    <rect x="31" y="21.5" width="10" height="7"/>
    <rect x="32.5" y="12.5" width="6.5" height="9.5"/>
    <rect x="33.6" y="9.5" width="4" height="3.2"/>
    <rect x="36.4" y="3.5" width="1.1" height="6.5"/>
    <rect x="43" y="16.6" width="4.6" height="9"/>
    <rect x="52" y="17.2" width="4.6" height="8.8"/>
    <rect x="45" y="25" width="23" height="4"/>
    <rect x="60" y="5" width="1.1" height="21"/>
    <rect x="76" y="26.6" width="5" height="3.4"/>`,
  // The Repulse: the same long battlecruiser hull, A and B forward, her old
  // tripod foremast over a stepped bridge, two funnels, her hangar between
  // them and the mainmast, a tripod mainmast, and Y aft.
  repulse: `
    <path d="M2 27 L50 28.6 L50 30 L94 30 L98 31.2 L95 37 L6 37 Z"/>
    <rect x="18.5" y="24.5" width="5" height="3.2"/>
    <rect x="24.5" y="22" width="5" height="4"/>
    <rect x="31" y="19.5" width="9" height="9"/>
    <rect x="32.5" y="15.5" width="5.5" height="4.5"/>
    <path d="M34 15.6 L35.8 3 L37 3 L39 15.6 Z"/>
    <rect x="33.6" y="2.4" width="5" height="2.4"/>
    <rect x="43" y="15.5" width="4.6" height="10"/>
    <rect x="52" y="16.5" width="4.6" height="9.5"/>
    <rect x="45" y="25" width="23" height="4"/>
    <path d="M60 26 L61.2 7 L62.2 7 L63.8 26 Z"/>
    <rect x="76" y="26.6" width="5" height="3.4"/>`,
  // The Warspite as rebuilt: a short battleship hull with her forecastle
  // carried well aft, A and B forward, a tower bridge, one broad funnel, a
  // pole mainmast over her hangars, and X and Y aft.
  warspite: `
    <path d="M2 27 L58 28.4 L58 30 L94 30 L98 31.2 L95 37 L6 37 Z"/>
    <rect x="18" y="24.6" width="5.5" height="3"/>
    <rect x="25" y="22" width="5.5" height="4"/>
    <rect x="32.5" y="15" width="9" height="13.5"/>
    <rect x="33.6" y="11.5" width="6" height="4"/>
    <rect x="37" y="3" width="1.1" height="9"/>
    <rect x="44.5" y="14.5" width="6" height="11.5"/>
    <rect x="42" y="24.5" width="22" height="4.5"/>
    <rect x="59" y="9" width="1.1" height="16"/>
    <rect x="66" y="25" width="5.5" height="3.8"/>
    <rect x="73" y="26.8" width="5.5" height="3.2"/>`,
  // The Agano: a long, slim, flush-sided light cruiser hull with a sheer
  // up to her bow, two twin turrets forward -- No.2 superfiring -- a compact
  // tower bridge, one tall raked funnel, her catapult and tube banks
  // amidships, a tripod mainmast, and one turret aft.
  agano: `
    <path d="M2 27.5 L40 29.5 L94 30 L98 31.2 L95 37 L6 37 Z"/>
    <rect x="17.5" y="26.2" width="4" height="2.6"/>
    <rect x="22" y="24.2" width="4" height="3.4"/>
    <rect x="29" y="23.5" width="11" height="6"/>
    <rect x="31" y="16.5" width="5.5" height="7.5"/>
    <rect x="32" y="13.5" width="3.4" height="3.2"/>
    <rect x="34.6" y="6.5" width="1.1" height="7.5"/>
    <path d="M42 24.5 L45 14.6 L49.5 14.6 L47.6 24.5 Z"/>
    <rect x="49" y="27" width="20" height="2.6"/>
    <rect x="66" y="8" width="1.1" height="19"/>
    <rect x="76" y="26.6" width="4" height="3"/>`,
  // The Aoba: a short cruiser hull with a raised forecastle, two twin
  // turrets forward -- No.2 superfiring -- a tall pagoda bridge, two raked
  // funnels, the fore one the bigger, a tripod mainmast with her crane and
  // catapult abaft it, and one turret aft.
  aoba: `
    <path d="M2 28 L46 29 L46 30.5 L94 30.5 L98 31.6 L95 37 L6 37 Z"/>
    <rect x="18.5" y="25.6" width="4.4" height="2.8"/>
    <rect x="22.8" y="23.3" width="4.4" height="3.6"/>
    <rect x="30" y="24" width="12" height="5"/>
    <rect x="32" y="16.5" width="5.6" height="8"/>
    <rect x="33" y="13.2" width="3.6" height="3.4"/>
    <rect x="35.2" y="7.5" width="1.1" height="6"/>
    <path d="M43 25 L45.4 17.2 L49.4 17.2 L48.2 25 Z"/>
    <path d="M51 25 L52.8 18.6 L56 18.6 L55.2 25 Z"/>
    <rect x="45" y="24.5" width="16" height="4.6"/>
    <rect x="59.6" y="6" width="1.1" height="19"/>
    <path d="M60.4 21 L69 15 L69.5 15.7 L60.8 22.2 Z"/>
    <rect x="64" y="27.8" width="11" height="1.6"/>
    <rect x="73.6" y="27.4" width="4.4" height="3.1"/>`,
  // The Tone: a cruiser's long low hull with all four of her twin turrets
  // forward -- No.2 superfiring over No.1, Nos.3 and 4 behind them trained
  // astern -- her pagoda bridge, one great trunked funnel raked aft, a
  // mainmast with her aircraft crane, and her whole after part a flat
  // aircraft deck.
  tone: `
    <path d="M2 28 L14 30 L94 30 L98 31.4 L95 37 L6 37 Z"/>
    <rect x="12" y="27.4" width="4.2" height="2.6"/>
    <rect x="17" y="25.2" width="4.2" height="4.8"/>
    <rect x="22" y="27.4" width="4.2" height="2.6"/>
    <rect x="28.5" y="27.4" width="4.2" height="2.6"/>
    <rect x="34" y="26.2" width="24" height="3.8"/>
    <rect x="35.5" y="18.5" width="4.3" height="8"/>
    <rect x="36.4" y="15.6" width="3" height="3.2"/>
    <rect x="38.4" y="9.8" width="1.2" height="9"/>
    <path d="M42.5 26.2 L47 18.2 L51 18.2 L50.5 26.2 Z"/>
    <rect x="56" y="5" width="1.2" height="22"/>
    <path d="M57 24 L65 19.5 L65.6 20.2 L57.4 25.2 Z"/>
    <rect x="58" y="28.2" width="36" height="1.8"/>`,
  // The Ajax: a Leander, a low cruiser hull with two twin turrets at each
  // end, the inner ones superfiring, a tall bridge forward, one great
  // trunked funnel amidships and a tripod mast at each end of her.
  ajax: `
    <path d="M2 29 L98 29 L94 37 L7 37 Z"/>
    <rect x="10" y="25" width="7" height="4"/>
    <rect x="18" y="22" width="7" height="4"/>
    <rect x="29" y="16" width="9" height="13"/>
    <rect x="32" y="10" width="3" height="7"/>
    <rect x="40" y="6" width="1.6" height="23"/>
    <path d="M47 29 L49 17 L56 17 L59 29 Z"/>
    <rect x="70" y="8" width="1.6" height="21"/>
    <rect x="74" y="22" width="7" height="4"/>
    <rect x="83" y="25" width="7" height="4"/>`,
  // The Brooklyn: a long flush-decked cruiser hull, three triple turrets
  // forward -- No.2 superfiring, No.3 low abaft it -- a tall bridge with the
  // foremast over it, two upright funnels close together, a short mainmast,
  // two turrets aft, No.4 superfiring, and her crane right aft.
  brooklyn: `
    <path d="M2 28 L98 28 L95 37 L6 37 Z"/>
    <rect x="18.5" y="24" width="5" height="4"/>
    <rect x="24.5" y="21" width="5" height="4"/>
    <rect x="30.5" y="24" width="5" height="4"/>
    <rect x="37" y="17" width="7" height="11"/>
    <rect x="39" y="11" width="4" height="7"/>
    <rect x="44" y="5" width="1.6" height="13"/>
    <rect x="46.5" y="15" width="3.6" height="13"/>
    <rect x="53" y="16" width="3.6" height="12"/>
    <rect x="57.5" y="9" width="1.4" height="12"/>
    <rect x="58" y="21" width="8" height="7"/>
    <rect x="70.5" y="21" width="5" height="4"/>
    <rect x="76" y="24" width="5" height="4"/>
    <rect x="93" y="19" width="1.2" height="9"/>
    <path d="M93 19 L89 18 L89 19 L93 20 Z"/>`,
  // The County: a tall flush-decked cruiser hull, two twin turrets at each
  // end, the inner ones superfiring, a tall bridge forward, three tall raked
  // funnels amidships and a tripod mast at each end of her.
  county: `
    <path d="M2 27 L98 27 L95 37 L6 37 Z"/>
    <rect x="9" y="23" width="7" height="4"/>
    <rect x="17" y="20" width="7" height="4"/>
    <rect x="27" y="15" width="9" height="12"/>
    <rect x="30" y="9" width="3" height="7"/>
    <rect x="37" y="5" width="1.6" height="22"/>
    <path d="M42 27 L44 12 L48 12 L47 27 Z"/>
    <path d="M51 27 L53 12 L57 12 L56 27 Z"/>
    <path d="M60 27 L62 12 L66 12 L65 27 Z"/>
    <rect x="72" y="6" width="1.6" height="21"/>
    <rect x="76" y="20" width="7" height="4"/>
    <rect x="84" y="23" width="7" height="4"/>`,
  // The Indianapolis: a long forecastle with two triple turrets forward, the
  // inner one superfiring, a tall bridge and tripod foremast, two funnels,
  // a tripod mainmast and one triple turret aft on her quarterdeck.
  indianapolis: `
    <path d="M2 28 L60 28 L60 30 L98 30 L95 37 L6 37 Z"/>
    <rect x="10" y="24" width="8" height="4"/>
    <rect x="19" y="21" width="8" height="4"/>
    <rect x="28" y="15" width="9" height="13"/>
    <rect x="31" y="7" width="3" height="9"/>
    <path d="M38 28 L39 13 L43 13 L43 28 Z"/>
    <rect x="50" y="9" width="1.6" height="19"/>
    <path d="M54 28 L55 15 L59 15 L59 28 Z"/>
    <rect x="62" y="22" width="9" height="8"/>
    <rect x="80" y="26" width="8" height="4"/>`,
  // The Alaska: a long, low flush deck sheered up to a clipper bow, two
  // triple turrets forward, the inner one superfiring with a twin 5 in over
  // it, a tall tower bridge with its pole mast, one big funnel with a
  // mainmast beside it, the after superstructure under a twin 5 in, and one
  // triple turret aft on her quarterdeck.
  alaska: `
    <path d="M2 26 L18 29 L98 29 L95 37 L6 37 Z"/>
    <rect x="23" y="25" width="8" height="4"/>
    <rect x="30" y="22" width="8" height="4"/>
    <rect x="37" y="19" width="4" height="4"/>
    <rect x="41" y="12" width="9" height="17"/>
    <rect x="44" y="4" width="3" height="9"/>
    <rect x="45" y="1" width="1" height="4"/>
    <path d="M53 29 L54 13 L60 13 L60 29 Z"/>
    <rect x="61" y="8" width="1.4" height="21"/>
    <rect x="62" y="20" width="8" height="9"/>
    <rect x="68" y="18" width="4" height="3"/>
    <rect x="71" y="25" width="8" height="4"/>`,
  // The Des Moines: a long flush deck sheered up to her bow, two triple
  // turrets forward, the inner one superfiring with a twin 5 in over it, a
  // tall block bridge, a lattice-topped foremast, two funnels close together
  // with a mainmast between them, and one triple turret aft under a twin 5 in.
  desmoines: `
    <path d="M2 27 L20 29 L98 29 L95 37 L6 37 Z"/>
    <rect x="20" y="25" width="8" height="4"/>
    <rect x="27" y="22" width="8" height="4"/>
    <rect x="34" y="19" width="5" height="4"/>
    <rect x="38" y="14" width="10" height="15"/>
    <rect x="49" y="5" width="1.8" height="14"/>
    <path d="M51 29 L52 15 L56 15 L56 29 Z"/>
    <rect x="58" y="10" width="1.6" height="19"/>
    <path d="M61 29 L62 17 L65 17 L65 29 Z"/>
    <rect x="66" y="22" width="9" height="7"/>
    <rect x="67" y="19" width="5" height="4"/>
    <rect x="73" y="25" width="8" height="4"/>`,
  // The Leviathan: a long cruiser hull, a tall bridge forward, two big
  // funnels with a lattice mast abaft each, and four quadruple turrets, two
  // at each end, the inner ones superfiring.
  leviathan: `
    <path d="M2 29 L98 29 L94 37 L7 37 Z"/>
    <rect x="9" y="25" width="10" height="4"/>
    <rect x="18" y="22" width="9" height="4"/>
    <rect x="30" y="15" width="12" height="14"/>
    <rect x="34" y="9" width="3" height="7"/>
    <rect x="43" y="16" width="6" height="13"/>
    <rect x="57" y="16" width="6" height="13"/>
    <rect x="50" y="12" width="2" height="17"/>
    <rect x="64" y="12" width="2" height="17"/>
    <rect x="72" y="22" width="9" height="4"/>
    <rect x="81" y="25" width="10" height="4"/>`,
  // A Panzerschiff, the Graf Spee or the Admiral Scheer: a long low cruiser
  // hull, a triple turret at each end on her upper deck, the tall tower
  // forward of her single raked funnel, and a light mainmast aft.
  scheer: `
    <path d="M2 29 L98 29 L94 36 L7 36 Z"/>
    <rect x="10" y="24" width="11" height="5"/>
    <rect x="24" y="25" width="8" height="4"/>
    <rect x="31" y="11" width="7" height="18"/>
    <rect x="29" y="9" width="11" height="3"/>
    <rect x="44" y="17" width="7" height="12"/>
    <rect x="52" y="23" width="14" height="6"/>
    <rect x="62" y="12" width="2" height="11"/>
    <rect x="68" y="24" width="8" height="5"/>
    <rect x="79" y="24" width="11" height="5"/>`,
  // The Shokaku: her flight deck overhanging both ends of her, a small island
  // well forward, and her funnels trunked out of her side under her deck and
  // curving down to the water abaft it.
  // The Taihō: a long carrier hull with a flush hurricane bow closed up to
  // her flight deck, the deck running the whole of her, and a big island
  // amidships with her funnel raked out from it and a mast over it.
  taiho: `
    <path d="M2 23 L97 23 L97 25 L94 31 L95 37 L7 37 L3 27 Z"/>
    <rect x="2" y="21.6" width="95" height="1.6"/>
    <rect x="40" y="12.5" width="14" height="9.3"/>
    <path d="M44 12.6 L46 7.4 L51 7.4 L50 12.6 Z"/>
    <rect x="47.5" y="2.5" width="1.1" height="5.2"/>
    <rect x="13" y="25" width="5" height="2"/>
    <rect x="80" y="25" width="5" height="2"/>`,
  shokaku: `
    <path d="M2 29 L9 30 L95 30 L93 37 L11 37 Z"/>
    <path d="M5 26 L97 26 L97 29.5 L5 29.5 Z"/>
    <rect x="30" y="19" width="8" height="7"/>
    <rect x="32" y="15" width="4" height="4"/>
    <rect x="33.4" y="7" width="1.4" height="8"/>
    <path d="M41 30 L49 30 L50 34 L42 34 Z"/>`,
  // The Soryu: a light, fine hull under a long flight deck overhanging both
  // ends of her, a small island forward of amidships, and her two funnels
  // trunked out of her side under her deck and curving down abaft it.
  soryu: `
    <path d="M97 29.5 L90 30.5 L6 30.5 L8 37 L88 37 Z"/>
    <path d="M96 27 L3 27 L3 30 L96 30 Z"/>
    <rect x="34" y="21" width="6" height="6"/>
    <rect x="35.5" y="17.5" width="3" height="3.5"/>
    <rect x="36.2" y="10" width="1.2" height="7.5"/>
    <path d="M53 30.5 L46 30.5 L45 34 L52 34 Z"/>`,
  // The Akagi: a battlecruiser's long hull built up two hangars high under
  // her flight deck, which runs down to her stern; her island amidships, her
  // great funnel trunked out of her side and turned down to the water, and
  // her casemate guns low aft.
  akagi: `
    <path d="M96 26 L88 26.5 L10 26.5 L4 25 L7 37 L91 37 Z"/>
    <path d="M98 24.6 L88 23.2 L2 23.2 L2 26 L88 26 L98 27 Z"/>
    <rect x="44.5" y="17" width="6.5" height="6.2"/>
    <rect x="46" y="13" width="3.5" height="4"/>
    <rect x="47.2" y="6" width="1.2" height="7"/>
    <path d="M60 27 L51 27 L50 32 L59 32 Z"/>
    <rect x="85" y="30" width="3" height="1.2"/>
    <rect x="80" y="30" width="3" height="1.2"/>
    <rect x="75" y="30" width="3" height="1.2"/>`,
  // The Hosho: flush-decked, no island, her flight deck carried out over her
  // bow and her stern on trusses and running down to her stern, and the
  // radio mast at its forward end.
  hosho: `
    <path d="M12 29 L91 29 L89 36 L15 36 Z"/>
    <path d="M11 26.2 L91 26.2 L91 29.2 L11 29.2 Z"/>
    <path d="M3 27.6 L12 24.2 L98 24.2 L98 25.9 L12 25.9 L3 28.8 Z"/>
    <path d="M5 28.4 L12 25.9 L12 27 Z"/>
    <path d="M91 25.9 L96 25.9 L91 28 Z"/>
    <rect x="77.4" y="9" width="1.1" height="15.2"/>
    <rect x="75" y="12" width="6" height="0.8"/>`,
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
  // A ship drawn off her sister's lines: the Spee off the Scheer, the
  // Maya off the Takao, the Missouri off the Iowa, which she is with missiles
  // on her, and the Hornet off the Enterprise, the Yorktown she was built to
  // the drawings of.
  const body = HULLS[{ kurfurst: 'iowa', hildebrand: 'hipper', beowulf: 'hipper', aki: 'yamato', dido: 'cleveland', puertorico: 'alaska', balao: 'viic', ranger: 'enterprise', hannover: 'bismarck', ushakov: 'soyuz', sevastopol: 'alaska', chapayev: 'cleveland', vanguard: 'kgv', b65: 'alaska', napoli: 'county', sanmartin: 'cleveland', conde: 'hipper', lorraine: 'warspite', revenge: 'warspite', doria: 'warspite', roma: 'iowa', maine: 'iowa', tennessee: 'northcarolina', wichita: 'brooklyn', fargo: 'cleveland', atlanta: 'cleveland', pensacola: 'indianapolis', neworleans: 'indianapolis', furutaka: 'aoba', kitakami: 'agano', tenryu: 'agano', oyodo: 'agano', yubari: 'agano', kirov: 'borgia', algerie: 'hipper', trento: 'county', nakhimov: 'leviathan', spee: 'scheer', maya: 'takao', missouri: 'iowa', hornet: 'enterprise', nimitz: 'enterprise', ford: 'enterprise', cdg: 'enterprise', kuznetsov: 'enterprise', essex: 'enterprise', lexington: 'enterprise', fubuki: 'yukikaze', shimakaze: 'yukikaze', yugumo: 'yukikaze', victory: 'liberty', dunkerque: 'richelieu', texas: 'northcarolina', newmexico: 'northcarolina', maryland: 'northcarolina', pennsylvania: 'northcarolina', ise: 'yamato', implacable: 'enterprise', illustrious: 'enterprise', uclass3: 'uclass', type7c: 'viic', type7c41: 'viic41' }[classId] || classId] || HULLS.fletcher;
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

/**
 * A B-29 Superfortress, drawn in planform: from above, nose to the right.
 *
 * The hulls and the turret on this screen are side on, and the first draft of
 * this was too. It does not work. What identifies a B-29 is four engines and
 * a wing of enormous span -- forty-three metres on thirty of length, the
 * highest aspect ratio of any bomber of the war -- and from the beam none of
 * that survives: the outer pair of engines hide behind the inner pair, the
 * wing is edge on and invisible, and every part of her runs into every other
 * part in one flat colour. It came out a blob with a fin on it.
 *
 * From above she is unmistakable, and there is nothing else she could be: a
 * very slender spindle of a fuselage, the long tapered wing, and the four
 * nacelles standing well forward of its leading edge with their airscrews
 * ahead of them. The box is taller than the turret's because she is; the arrow
 * off her nose is drawn to come out the same size on the glass, so the two
 * rows of controls still read as one column.
 *
 * She flies to the right; `flip` turns her round.
 */
export function bomber({ flip = false } = {}) {
  // One side of her, drawn for the port wing and mirrored for the starboard:
  // the two nacelles and their airscrews and the tailplane half go with it, so
  // the pair are the same aerofoil rather than two drawings that happen to
  // look alike.
  //
  // Proportioned off the aeroplane. Span 43.05 m, length 30.18, root chord
  // about 6.1 and tip 2.1, engines at three-tenths and a half of the
  // semi-span, airscrews 5.05 m across. That root chord is a seventh of the
  // span, which is the number that matters: drawn any fatter she stops being
  // the highest-aspect-ratio bomber of the war and becomes a delta.
  const side = `
      <path d="M103 71 L109 12 L116 12 L122 71 Z"/>
      <path d="M111 42.5 L127 42.5 L127 47.5 L111 47.5 Z"/>
      <rect x="127" y="37" width="4" height="16" rx="2"/>
      <path d="M110 54.5 L128 54.5 L128 59.5 L110 59.5 Z"/>
      <rect x="128" y="49" width="4" height="16" rx="2"/>
      <path d="M54 78 L58 55 L64 55 L67 78 Z"/>`;
  return `<svg class="bomber-art" viewBox="0 0 200 150" role="img" aria-hidden="true"
    preserveAspectRatio="xMidYMid meet"${flip ? ' style="transform:scaleX(-1)"' : ''}>
    <g fill="currentColor">
      <!-- the port side, and the same again mirrored about her centre line -->
      <g>${side}</g>
      <g transform="translate(0 150) scale(1 -1)">${side}</g>
      <!-- the fin, which from above is only the sliver of it you can see -->
      <path d="M49 75 L58 71.5 L70 73.2 L70 76.8 L58 78.5 Z"/>
      <!-- and the fuselage over all of it: a spindle running out to the glazed
           bubble nose, which has no step in front of the pilots and is the one
           thing about her nobody else in the war had -->
      <path d="M52 75 L62 70.5 L124 70.5 Q140 71.5 146 75 Q140 78.5 124 79.5 L62 79.5 Z"/>
      <!-- the dorsal turret abaft the cockpit -->
      <circle cx="104" cy="75" r="4.6"/>
    </g>
    <path d="M160 75 L194 75 M177 58 L194 75 L177 92" fill="none"
      stroke="currentColor" stroke-width="8.5"
      stroke-linecap="square" stroke-linejoin="miter"/>
  </svg>`;
}
