// The named waters of the world.
//
// A pin dropped on the chart has to be able to say where it is, and "somewhere
// in the Pacific" is not an answer a captain would accept. Each entry is a
// representative position and the radius out to which that name is the best
// answer; the smallest matching radius wins, so a pin in the Sea of Marmara is
// in the Sea of Marmara and not in the Mediterranean it opens off.
//
// The oceans sit at the end with very large radii, so anything that falls
// through the seas still comes back with a basin rather than nothing.

/** [name, longitude, latitude, radius in km] */
const SEAS = [
  // -- Mediterranean and the Black Sea ------------------------------------
  ['Alboran Sea', -3.5, 36.0, 170],
  ['Strait of Gibraltar', -5.6, 35.95, 70],
  ['Balearic Sea', 2.0, 40.0, 240],
  ['Gulf of Lion', 4.5, 42.8, 150],
  ['Ligurian Sea', 8.8, 43.5, 160],
  ['Tyrrhenian Sea', 12.4, 39.8, 330],
  ['Strait of Messina', 15.6, 38.2, 60],
  ['Ionian Sea', 18.6, 37.2, 360],
  ['Adriatic Sea', 15.8, 43.0, 390],
  ['Strait of Otranto', 18.9, 40.2, 80],
  ['Aegean Sea', 25.0, 38.8, 280],
  ['Sea of Crete', 25.0, 35.4, 170],
  ['Sea of Marmara', 28.2, 40.7, 120],
  ['Bosphorus', 29.1, 41.1, 40],
  ['Levantine Sea', 31.5, 33.5, 480],
  ['Gulf of Sidra', 18.4, 31.8, 260],
  ['Gulf of Gabes', 10.7, 34.2, 130],
  ['Strait of Sicily', 11.6, 37.0, 160],
  ['Mediterranean Sea', 17.0, 36.5, 1100],
  ['Black Sea', 34.0, 43.3, 620],
  ['Sea of Azov', 36.9, 46.1, 190],

  // -- Northern Europe ------------------------------------------------------
  ['Bay of Biscay', -4.5, 45.4, 380],
  ['Celtic Sea', -8.0, 50.4, 260],
  ['English Channel', -1.0, 50.1, 240],
  ['Strait of Dover', 1.5, 51.0, 60],
  ['Irish Sea', -5.0, 53.7, 190],
  ['North Channel', -5.6, 55.2, 90],
  ['North Sea', 3.0, 56.0, 560],
  ['Skagerrak', 9.5, 58.0, 190],
  ['Kattegat', 11.3, 57.0, 140],
  ['Baltic Sea', 19.0, 57.5, 520],
  ['Gulf of Bothnia', 20.0, 62.5, 340],
  ['Gulf of Finland', 25.5, 60.0, 260],
  ['Gulf of Riga', 23.5, 57.7, 130],
  ['Norwegian Sea', 2.0, 68.0, 760],
  ['Greenland Sea', -5.0, 76.0, 640],
  ['Barents Sea', 40.0, 74.0, 840],
  ['White Sea', 37.0, 65.5, 270],
  ['Denmark Strait', -27.0, 66.5, 320],

  // -- Arctic ---------------------------------------------------------------
  ['Kara Sea', 70.0, 75.0, 820],
  ['Laptev Sea', 128.0, 76.0, 740],
  ['East Siberian Sea', 160.0, 73.0, 740],
  ['Chukchi Sea', -170.0, 70.0, 520],
  ['Bering Strait', -169.0, 65.9, 130],
  ['Beaufort Sea', -140.0, 72.0, 640],
  ['Baffin Bay', -65.0, 74.0, 580],
  ['Davis Strait', -58.0, 65.0, 380],

  // -- North America and the western Atlantic ------------------------------
  ['Hudson Bay', -85.0, 59.0, 720],
  ['Hudson Strait', -72.0, 62.0, 320],
  ['Labrador Sea', -53.0, 58.0, 540],
  ['Gulf of St Lawrence', -62.0, 48.2, 320],
  ['Bay of Fundy', -66.0, 45.0, 110],
  ['Gulf of Maine', -68.5, 43.0, 230],
  ['Sargasso Sea', -60.0, 28.0, 950],
  ['Straits of Florida', -80.4, 24.4, 210],
  ['Gulf of Mexico', -90.0, 25.0, 740],
  ['Yucatan Channel', -85.8, 21.6, 120],
  ['Caribbean Sea', -75.0, 15.0, 950],
  ['Windward Passage', -74.0, 20.0, 130],
  ['Gulf of Honduras', -88.0, 16.3, 160],
  ['Gulf of Venezuela', -71.0, 11.4, 130],
  ['Gulf of Panama', -79.3, 8.0, 140],
  ['Gulf of California', -111.5, 27.5, 380],
  ['Gulf of Tehuantepec', -95.0, 15.0, 190],
  ['Gulf of Alaska', -145.0, 57.0, 540],

  // -- Africa, the Red Sea and the Gulf ------------------------------------
  ['Gulf of Guinea', 2.0, 2.0, 720],
  ['Bight of Benin', 3.0, 5.0, 220],
  ['Bight of Biafra', 8.5, 3.5, 220],
  ['Red Sea', 38.0, 20.0, 720],
  ['Gulf of Suez', 33.0, 28.7, 160],
  ['Gulf of Aqaba', 34.8, 28.8, 100],
  ['Bab el Mandeb', 43.4, 12.6, 70],
  ['Gulf of Aden', 48.0, 12.5, 420],
  ['Persian Gulf', 51.0, 27.0, 470],
  ['Strait of Hormuz', 56.4, 26.6, 90],
  ['Gulf of Oman', 59.0, 24.5, 300],
  ['Mozambique Channel', 41.0, -18.0, 620],

  // -- Indian Ocean and the approaches -------------------------------------
  ['Arabian Sea', 63.0, 15.0, 900],
  ['Laccadive Sea', 74.0, 8.0, 420],
  ['Palk Strait', 79.6, 9.7, 80],
  ['Bay of Bengal', 88.0, 15.0, 900],
  ['Andaman Sea', 95.5, 10.0, 560],
  ['Strait of Malacca', 99.5, 4.0, 360],
  ['Timor Sea', 128.0, -11.0, 420],
  ['Great Australian Bight', 131.0, -36.0, 620],

  // -- the East Indies ------------------------------------------------------
  ['Sunda Strait', 105.5, -6.0, 90],
  ['Java Sea', 110.0, -5.0, 570],
  ['Bali Sea', 116.0, -8.0, 160],
  ['Makassar Strait', 118.0, -2.0, 270],
  ['Flores Sea', 120.5, -7.5, 300],
  ['Savu Sea', 122.0, -9.5, 160],
  ['Banda Sea', 127.0, -5.5, 420],
  ['Ceram Sea', 129.5, -3.0, 230],
  ['Molucca Sea', 125.0, 0.0, 310],
  ['Halmahera Sea', 129.0, 0.0, 230],
  ['Celebes Sea', 121.5, 3.5, 420],
  ['Sulu Sea', 120.0, 8.5, 370],
  ['Arafura Sea', 136.0, -9.0, 520],
  ['Torres Strait', 142.5, -10.0, 130],
  ['Gulf of Carpentaria', 139.5, -14.0, 370],
  ['Gulf of Papua', 145.0, -8.5, 210],

  // -- the China seas and the north-west Pacific ---------------------------
  ['Gulf of Thailand', 101.5, 9.5, 370],
  ['Gulf of Tonkin', 108.0, 20.0, 260],
  ['South China Sea', 114.0, 13.0, 950],
  ['Taiwan Strait', 119.5, 24.5, 160],
  ['Luzon Strait', 121.0, 20.5, 160],
  ['East China Sea', 125.0, 29.0, 520],
  ['Yellow Sea', 123.0, 35.5, 420],
  ['Bohai Sea', 119.5, 38.5, 210],
  ['Korea Strait', 129.0, 34.4, 140],
  ['Sea of Japan', 135.0, 40.0, 620],
  ['Sea of Okhotsk', 150.0, 53.0, 740],
  ['Bering Sea', -178.0, 58.0, 840],
  ['Philippine Sea', 133.0, 18.0, 1200],

  // -- the south-west Pacific ----------------------------------------------
  ['Bismarck Sea', 148.0, -4.0, 320],
  ['Solomon Sea', 154.0, -8.5, 370],
  ['Coral Sea', 155.0, -17.0, 900],
  ['Tasman Sea', 161.0, -38.0, 900],
  ['Bass Strait', 146.0, -39.7, 210],
  ['Cook Strait', 174.5, -41.3, 100],

  // -- the Southern Ocean ---------------------------------------------------
  ['Drake Passage', -63.0, -58.0, 420],
  ['Scotia Sea', -40.0, -57.0, 620],
  ['Weddell Sea', -45.0, -72.0, 820],
  ['Bellingshausen Sea', -85.0, -70.0, 520],
  ['Amundsen Sea', -110.0, -72.0, 620],
  ['Ross Sea', 180.0, -75.0, 720],
];

// The basins, for anything that falls through the seas. Several anchors carry
// the same name so that an ocean which spans a third of the planet is still
// nearer to one of its own anchors than to a neighbouring ocean's.
const OCEANS = [
  ['Arctic Ocean', 0.0, 88.0, 1600],
  ['Arctic Ocean', -150.0, 83.0, 1600],
  ['North Atlantic Ocean', -40.0, 38.0, 4200],
  ['North Atlantic Ocean', -25.0, 12.0, 2600],
  ['South Atlantic Ocean', -15.0, -25.0, 4200],
  ['Indian Ocean', 78.0, -25.0, 4200],
  ['Indian Ocean', 68.0, 3.0, 2600],
  ['North Pacific Ocean', -165.0, 30.0, 5000],
  ['North Pacific Ocean', 170.0, 25.0, 3200],
  ['South Pacific Ocean', -140.0, -25.0, 5400],
  ['South Pacific Ocean', 175.0, -20.0, 3400],
  ['Southern Ocean', 0.0, -63.0, 2400],
  ['Southern Ocean', 90.0, -60.0, 2400],
  ['Southern Ocean', 180.0, -62.0, 2400],
  ['Southern Ocean', -90.0, -62.0, 2400],
];

const R_EARTH = 6371;
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in km. Handles the dateline without special cases. */
export function haversine(lon1, lat1, lon2, lat2) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * The name of the water at a point: the most specific sea whose radius reaches
 * it, or failing that the basin it sits in.
 */
export function waterName(lon, lat) {
  let best = null;
  let bestR = Infinity;
  for (const [name, wlon, wlat, r] of SEAS) {
    if (r >= bestR) continue;
    if (haversine(lon, lat, wlon, wlat) <= r) { best = name; bestR = r; }
  }
  if (best) return best;

  let ocean = 'Open Ocean';
  let near = Infinity;
  for (const [name, olon, olat, r] of OCEANS) {
    const d = haversine(lon, lat, olon, olat);
    if (d <= r && d < near) { ocean = name; near = d; }
  }
  return ocean;
}

/** Every named sea, for labelling the chart. */
export function seaLabels() {
  return SEAS.map(([name, lon, lat, r]) => ({ name, lon, lat, r }));
}

export function oceanLabels() {
  // One label per basin, at its principal anchor.
  const seen = new Set();
  const out = [];
  for (const [name, lon, lat, r] of OCEANS) {
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, lon, lat, r });
  }
  return out;
}
