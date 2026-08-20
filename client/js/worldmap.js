// A world map for the briefing screens.
//
// Drawn rather than fetched: the standalone build ships as one file and cannot
// pull down a tile server or an image. These are coarse equirectangular
// outlines — enough for a captain to recognise an ocean at a glance, nowhere
// near survey accuracy, and not to be read as a chart.
//
// Coordinates are [longitude, latitude], -180..180 and -90..90.

const LAND = [
  // North America, clockwise from the Bering Strait. Alaska, Baja, the Gulf,
  // Florida and the Maritimes are the shapes that make it read at a glance.
  [[-168, 66], [-164, 64], [-161, 61], [-166, 60], [-162, 58], [-157, 56], [-153, 58],
   [-150, 59], [-146, 60], [-141, 60], [-136, 58], [-132, 55], [-128, 52], [-125, 49],
   [-124, 45], [-124, 41], [-122, 37], [-118, 34], [-117, 32],
   [-115, 30], [-113, 27], [-110, 23], [-112, 26], [-114, 30], [-113, 31],
   [-109, 26], [-106, 23], [-104, 19], [-100, 17], [-97, 16], [-94, 16], [-92, 15],
   [-89, 14], [-87, 13], [-84, 10], [-83, 8], [-79, 8],
   [-79, 10], [-82, 9], [-84, 11], [-87, 13], [-88, 16],
   [-89, 18], [-87, 21], [-90, 21], [-91, 19], [-94, 18], [-97, 21],
   [-97, 26], [-95, 29], [-92, 29], [-89, 29], [-85, 30],
   [-83, 29], [-81, 25], [-80, 27], [-81, 31],
   [-79, 33], [-76, 35], [-75, 38], [-74, 40], [-71, 42], [-70, 43], [-67, 45], [-64, 45],
   [-60, 47], [-56, 51], [-56, 54], [-64, 58], [-68, 58], [-78, 62],
   [-76, 68], [-82, 70], [-90, 70], [-96, 68], [-102, 69], [-110, 68], [-117, 70],
   [-124, 70], [-130, 70], [-140, 70], [-148, 70], [-156, 71], [-164, 68]],

  // Greenland
  [[-45, 60], [-50, 62], [-53, 66], [-55, 70], [-58, 74], [-55, 78], [-48, 82], [-38, 83],
   [-25, 82], [-20, 78], [-22, 74], [-26, 70], [-32, 68], [-38, 66], [-42, 62]],

  // South America, clockwise from the Caribbean coast.
  [[-77, 8], [-72, 12], [-68, 11], [-62, 10], [-60, 8], [-52, 5], [-50, 2], [-48, 0],
   [-44, -2], [-38, -5], [-35, -8], [-37, -12], [-39, -16], [-41, -22], [-48, -25],
   [-53, -33], [-57, -36], [-62, -39], [-65, -45], [-68, -50], [-68, -55], [-73, -53],
   [-75, -48], [-74, -42], [-73, -37], [-71, -30], [-70, -23], [-71, -18], [-76, -14],
   [-79, -8], [-81, -5], [-80, -2], [-78, 1], [-77, 4]],

  // Africa, clockwise from Cap-Vert: Maghreb, Nile delta, Horn, Cape, Gulf of Guinea.
  [[-17, 15], [-17, 21], [-14, 26], [-11, 29], [-9, 32], [-6, 35], [0, 36], [4, 37],
   [10, 34], [17, 31], [25, 32], [30, 31], [32, 31], [34, 28], [37, 22], [39, 15],
   [43, 12], [48, 12], [51, 11], [48, 6], [43, 4], [41, -2], [40, -8], [40, -14],
   [37, -18], [33, -26], [31, -29], [27, -33], [22, -34], [18, -33], [15, -27],
   [13, -22], [12, -17], [13, -12], [12, -6], [9, 0], [9, 4], [3, 6], [-4, 5],
   [-8, 4], [-13, 8], [-16, 12]],

  // Eurasia. One unbroken coast: Iberia, Italy, Greece, the Turkish and Levant
  // shore, north of Arabia to the head of the Gulf, the Iranian and Indian
  // coasts, Indochina, China, Korea, Siberia, then home along the Arctic and
  // down through Scandinavia. It never doubles back on itself, so the Black Sea
  // and the Caspian end up enclosed and are punched out below.
  [[-9, 43], [-9, 39], [-6, 36], [-2, 37], [0, 39], [3, 42], [4, 43], [7, 44], [10, 44],
   [13, 42], [16, 40], [18, 40], [17, 41], [15, 42], [13, 44], [13, 45], [16, 43],
   [19, 42], [20, 40], [23, 40], [24, 38], [27, 37], [30, 37], [33, 36], [36, 36],
   [35, 33], [35, 31], [34, 30], [38, 32], [42, 33], [46, 31], [48, 30],
   [52, 28], [56, 26], [60, 25], [64, 25], [67, 24], [70, 22],
   [73, 16], [76, 9], [80, 13], [84, 19], [88, 22], [92, 21], [95, 17], [97, 17],
   [99, 10], [101, 4], [104, 2], [104, 8], [107, 11], [109, 15], [107, 19], [110, 21],
   [114, 23], [117, 24], [120, 27], [122, 31], [121, 37], [124, 40], [126, 38],
   [129, 36], [129, 40], [127, 42], [130, 43], [135, 46], [141, 46], [143, 50],
   [140, 53], [141, 57], [146, 59], [155, 57], [162, 60], [163, 56], [160, 55],
   [156, 51], [156, 57], [160, 61], [170, 66], [180, 66], [180, 72],
   [170, 70], [160, 71], [150, 72], [140, 73], [130, 72], [120, 74], [110, 76],
   [100, 77], [95, 78], [85, 74], [78, 73], [70, 73], [60, 71], [55, 69], [50, 69],
   [45, 66], [40, 68], [35, 69], [33, 70], [28, 71], [24, 71], [20, 69], [17, 68],
   [14, 66], [12, 64], [10, 63], [7, 62], [5, 60], [8, 58], [10, 57], [12, 55],
   [11, 54], [8, 54], [4, 52], [0, 51], [-2, 49], [-5, 48], [-2, 44]],

  // Arabia, bounded by the Red Sea and the Gulf: both are open water between
  // coastlines, not enclosed basins, so they need no cut-out.
  [[34, 30], [38, 22], [43, 13], [45, 12], [50, 12], [56, 26], [52, 28], [48, 30],
   [46, 31], [42, 33], [38, 32]],

  // Scandinavia is a peninsula, not a bay: the Baltic is punched out below.
  // Britain and Ireland
  [[-5, 50], [-1, 51], [1, 52], [0, 54], [-1, 55], [-3, 56], [-5, 58], [-3, 58],
   [-5, 57], [-5, 55], [-3, 54], [-5, 53], [-4, 52], [-5, 51]],
  [[-10, 52], [-6, 52], [-6, 54], [-7, 55], [-10, 54]],
  // Iceland
  [[-24, 65], [-21, 66], [-16, 66], [-14, 65], [-18, 63], [-22, 64]],
  // Japan: Kyushu through Honshu to Hokkaido
  [[130, 32], [132, 34], [136, 35], [138, 35], [141, 38], [141, 41], [141, 43],
   [145, 44], [145, 43], [142, 42], [140, 40], [137, 37], [133, 35], [131, 33]],
  // Sri Lanka
  [[80, 9], [81, 9], [82, 7], [81, 6], [80, 6], [79, 8]],
  // Madagascar
  [[43, -12], [48, -13], [50, -16], [50, -22], [47, -25], [44, -22], [43, -17]],
  // Australia
  [[113, -22], [114, -26], [115, -32], [118, -35], [123, -34], [129, -32], [134, -33],
   [137, -35], [140, -38], [145, -39], [148, -38], [151, -34], [153, -28], [153, -25],
   [149, -21], [146, -19], [143, -14], [142, -11], [139, -17], [136, -12], [133, -12],
   [130, -11], [127, -14], [123, -17], [118, -20]],
  // Tasmania
  [[145, -41], [148, -41], [148, -43], [146, -43]],
  // New Zealand
  [[173, -35], [175, -37], [178, -38], [176, -41], [174, -41], [173, -39], [172, -37]],
  [[171, -42], [174, -41], [174, -44], [170, -46], [167, -46], [168, -44]],
  // New Guinea
  [[131, -1], [136, -2], [141, -3], [147, -6], [150, -10], [146, -8], [141, -9],
   [136, -8], [132, -4]],
  // Borneo
  [[109, 2], [113, 3], [117, 4], [119, 1], [117, -3], [113, -3], [110, -1]],
  // Sumatra
  [[95, 5], [99, 3], [104, -2], [106, -6], [103, -5], [99, -2], [96, 2]],
  // Java
  [[105, -6], [110, -7], [114, -8], [112, -8], [107, -7]],
  // Sulawesi
  [[119, 1], [124, 1], [125, -2], [123, -5], [121, -4], [120, -2]],
  // Philippines
  [[120, 18], [122, 16], [122, 13], [125, 10], [126, 7], [123, 6], [121, 12], [119, 16]],
  // Cuba and Hispaniola
  [[-85, 22], [-79, 23], [-75, 20], [-79, 20], [-84, 21]],
  [[-74, 20], [-69, 19], [-68, 18], [-73, 18]],
  // Antarctica: the coast, then straight along the foot of the chart. The
  // closing edge must not run back across the map or it cuts a notch out.
  [[-180, -72], [-150, -76], [-120, -74], [-100, -73], [-80, -71], [-63, -65],
   [-58, -62], [-45, -60], [-30, -66], [-20, -70], [0, -70], [15, -69], [35, -68],
   [50, -66], [70, -67], [90, -66], [110, -66], [130, -66], [150, -70], [165, -72],
   [180, -75], [180, -90], [-180, -90]],
];

// Inland and enclosed seas, painted back over the land so the coastlines read.
const INLAND = [
  // Hudson Bay
  [[-95, 64], [-88, 63], [-82, 62], [-78, 59], [-80, 55], [-86, 52], [-92, 57]],
  // Baltic
  [[12, 55], [17, 55], [21, 57], [24, 60], [22, 64], [18, 62], [15, 58]],
  // Black Sea
  [[28, 42], [34, 42], [40, 44], [38, 47], [32, 46], [29, 45]],
  // Caspian
  [[48, 39], [52, 41], [53, 45], [50, 47], [47, 43]],
];

const PORTS = [
  ['SCAPA FLOW', -3, 59], ['GIBRALTAR', -5, 36], ['HALIFAX', -63, 45],
  ['NEW YORK', -74, 41], ['DAKAR', -17, 15], ['FREETOWN', -13, 8],
  ['PEARL HARBOR', -158, 21], ['MIDWAY', -177, 28], ['RABAUL', 152, -4],
  ['SINGAPORE', 104, 1], ['TOKYO', 140, 36], ['MURMANSK', 33, 69],
];

/**
 * Paint the map into a canvas. `focus` is [lon, lat] and `zoom` scales the
 * projection, so a screen can sit over one theatre rather than the whole globe.
 */
export function drawWorld(canvas, opts = {}) {
  const {
    focus = [0, 8], zoom = 1,
    sea = '#0a1826', land = '#273c4e', coast = '#4a6a80',
    grid = 'rgba(130, 165, 190, 0.12)', label = 'rgba(165, 190, 210, 0.55)',
    equator = 'rgba(150, 185, 210, 0.22)', tropic = 'rgba(140, 175, 200, 0.14)',
    shelf = 'rgba(90, 140, 175, 0.5)',
    dot = '#9c4747', showPorts = true,
    marker = null, markerName = '',
  } = opts;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 1200;
  const h = canvas.clientHeight || 800;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Equirectangular, scaled so the whole world spans the width at zoom 1.
  const scale = (w / 360) * zoom;
  const project = ([lon, lat]) => [
    w / 2 + (lon - focus[0]) * scale,
    h / 2 - (lat - focus[1]) * scale,
  ];

  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, w, h);

  // Graticule every 15 degrees, with the equator and the tropics picked out —
  // the lines a navigator would actually reference.
  const meridian = (lon) => { const [x] = project([lon, 0]); ctx.moveTo(x, 0); ctx.lineTo(x, h); };
  const parallel = (lat) => { const [, y] = project([0, lat]); ctx.moveTo(0, y); ctx.lineTo(w, y); };

  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let lon = -180; lon <= 180; lon += 15) if (lon !== 0) meridian(lon);
  for (let lat = -75; lat <= 75; lat += 15) if (![0, 23.5, -23.5].includes(lat)) parallel(lat);
  ctx.stroke();

  ctx.strokeStyle = tropic;
  ctx.setLineDash([5, 5]);
  ctx.beginPath(); parallel(23.5); parallel(-23.5); ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = equator;
  ctx.beginPath(); parallel(0); meridian(0); ctx.stroke();

  const trace = (poly, shift) => {
    ctx.beginPath();
    poly.forEach(([lon, lat], i) => {
      const [x, y] = project([lon + shift, lat]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };

  // Landmasses, drawn three times across so the map wraps at the dateline
  // instead of ending in open sea. Land first, then the enclosed seas painted
  // back over it, then the coastline on top of both so it outlines each.
  for (const shift of [-360, 0, 360]) {
    // A soft shelf under each coast, the way a chart shades shallow water.
    ctx.save();
    ctx.shadowColor = shelf;
    ctx.shadowBlur = 18;
    ctx.fillStyle = land;
    for (const poly of LAND) { trace(poly, shift); ctx.fill(); }
    ctx.restore();

    ctx.fillStyle = sea;
    for (const poly of INLAND) { trace(poly, shift); ctx.fill(); }

    ctx.strokeStyle = coast;
    ctx.lineWidth = 1.1;
    for (const poly of LAND) { trace(poly, shift); ctx.stroke(); }
    for (const poly of INLAND) { trace(poly, shift); ctx.stroke(); }
  }

  // The theatre the briefing is set in, ringed on the chart.
  if (marker) {
    const [mx, my] = project(marker);
    ctx.strokeStyle = '#e6cf9c';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(mx, my, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.arc(mx, my, 27, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(mx - 24, my); ctx.lineTo(mx - 8, my);
    ctx.moveTo(mx + 8, my); ctx.lineTo(mx + 24, my);
    ctx.moveTo(mx, my - 24); ctx.lineTo(mx, my - 8);
    ctx.moveTo(mx, my + 8); ctx.lineTo(mx, my + 24);
    ctx.stroke();
    if (markerName) {
      ctx.font = '600 13px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.fillStyle = '#e6cf9c';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(markerName.toUpperCase(), mx, my + 32);
      ctx.textAlign = 'start';
    }
  }

  if (!showPorts) return;
  ctx.font = '11px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.fillStyle = label;
  ctx.textBaseline = 'middle';
  for (const [name, lon, lat] of PORTS) {
    for (const shift of [-360, 0, 360]) {
      const [x, y] = project([lon + shift, lat]);
      if (x < -60 || x > w + 60 || y < -20 || y > h + 20) continue;
      ctx.fillStyle = dot;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = label;
      ctx.fillText(name, x + 6, y);
    }
  }
}
