// A world map for the briefing screens.
//
// Drawn rather than fetched: the standalone build ships as one file and cannot
// pull down a tile server or an image. These are coarse equirectangular
// outlines — enough for a captain to recognise an ocean at a glance, nowhere
// near survey accuracy, and not to be read as a chart.
//
// Coordinates are [longitude, latitude], -180..180 and -90..90.

const LAND = [
  // North America
  [[-168, 65], [-165, 60], [-158, 57], [-153, 57], [-148, 60], [-140, 60], [-133, 54],
   [-125, 49], [-124, 43], [-121, 35], [-117, 32], [-110, 23], [-105, 20], [-97, 16],
   [-92, 15], [-87, 13], [-83, 8], [-79, 9], [-82, 15], [-88, 21], [-91, 19], [-94, 18],
   [-97, 26], [-94, 29], [-89, 29], [-84, 30], [-81, 25], [-80, 32], [-76, 35], [-74, 40],
   [-67, 45], [-60, 47], [-56, 51], [-64, 60], [-78, 62], [-76, 68], [-85, 70], [-95, 68],
   [-105, 69], [-115, 70], [-125, 70], [-140, 70], [-156, 71], [-166, 68]],
  // Greenland
  [[-45, 60], [-52, 65], [-55, 70], [-58, 75], [-50, 82], [-32, 83], [-20, 80], [-22, 73],
   [-28, 68], [-38, 65], [-43, 60]],
  // South America
  [[-81, 0], [-80, -5], [-76, -14], [-70, -18], [-71, -30], [-73, -40], [-75, -50],
   [-68, -55], [-65, -48], [-62, -40], [-57, -35], [-53, -33], [-48, -25], [-40, -20],
   [-35, -8], [-44, -2], [-50, 0], [-52, 5], [-60, 8], [-70, 12], [-77, 8], [-79, 2]],
  // Africa and Arabia
  [[-17, 15], [-16, 12], [-13, 8], [-8, 4], [0, 5], [8, 4], [9, 0], [12, -5], [13, -12],
   [15, -18], [18, -23], [19, -34], [26, -34], [32, -29], [35, -24], [40, -16], [40, -10],
   [40, -3], [43, 0], [51, 12], [45, 12], [43, 12], [39, 15], [37, 22], [34, 28], [33, 31],
   [25, 32], [17, 31], [10, 34], [0, 36], [-6, 36], [-10, 30], [-13, 25], [-16, 20]],
  // Arabia
  [[35, 30], [43, 30], [48, 30], [56, 26], [59, 22], [55, 17], [50, 13], [45, 13], [43, 17],
   [39, 21], [35, 28]],
  // Europe and Asia
  [[-10, 43], [-2, 43], [3, 43], [10, 44], [15, 40], [19, 40], [24, 40], [26, 36], [30, 36],
   [36, 36], [36, 40], [40, 41], [50, 44], [52, 42], [61, 44], [70, 42], [77, 35], [72, 26],
   [70, 22], [73, 16], [76, 9], [80, 13], [84, 19], [88, 22], [92, 21], [93, 22], [97, 17],
   [99, 10], [104, 2], [110, 3], [117, 5], [122, 11],
   [110, 20], [108, 22], [113, 23], [120, 30], [122, 37], [126, 40], [130, 43], [135, 46],
   [142, 46], [143, 53], [140, 59], [150, 60], [160, 61], [170, 66], [180, 66], [180, 72],
   [160, 71], [140, 73], [130, 72], [110, 76], [95, 78], [80, 76], [70, 73], [60, 71],
   [50, 69], [40, 68], [33, 70], [28, 71], [20, 70], [12, 65], [5, 62], [8, 58], [10, 57],
   [12, 55], [8, 54], [4, 52], [0, 51], [-2, 49], [-5, 48], [-2, 44]],
  // British Isles
  [[-6, 50], [-3, 51], [1, 52], [0, 54], [-2, 56], [-5, 58], [-6, 57], [-5, 54], [-6, 52]],
  [[-10, 52], [-6, 52], [-6, 55], [-8, 55], [-10, 54]],
  // Japan
  [[130, 32], [134, 34], [138, 35], [141, 39], [141, 43], [145, 44], [143, 42], [140, 37],
   [136, 35], [132, 33]],
  // Madagascar
  [[43, -12], [50, -15], [50, -24], [45, -25], [43, -20]],
  // Australia
  [[113, -22], [114, -28], [118, -34], [125, -32], [131, -31], [137, -34], [141, -38],
   [147, -38], [150, -35], [153, -28], [146, -19], [142, -11], [136, -12], [130, -11],
   [125, -14], [120, -18]],
  // New Zealand
  [[172, -34], [175, -37], [178, -38], [176, -41], [173, -42], [171, -44], [167, -46],
   [166, -45], [170, -42], [172, -38]],
  // Iceland
  [[-24, 65], [-18, 66], [-14, 65], [-18, 63], [-22, 64]],
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
    grid = 'rgba(130, 165, 190, 0.13)', label = 'rgba(165, 190, 210, 0.55)',
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

  // Graticule every 15 degrees.
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let lon = -180; lon <= 180; lon += 15) {
    const [x] = project([lon, 0]);
    ctx.moveTo(x, 0); ctx.lineTo(x, h);
  }
  for (let lat = -90; lat <= 90; lat += 15) {
    const [, y] = project([0, lat]);
    ctx.moveTo(0, y); ctx.lineTo(w, y);
  }
  ctx.stroke();

  // Landmasses. Each is drawn three times across so the map wraps at the
  // dateline instead of ending in open sea.
  for (const shift of [-360, 0, 360]) {
    ctx.fillStyle = land;
    ctx.strokeStyle = coast;
    ctx.lineWidth = 1;
    for (const poly of LAND) {
      ctx.beginPath();
      poly.forEach(([lon, lat], i) => {
        const [x, y] = project([lon + shift, lat]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
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
