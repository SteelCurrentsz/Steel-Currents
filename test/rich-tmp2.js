import { buildShip } from '../client/js/render/ships.js';
import { measureLines, halfBeamAt } from '../client/js/render/damageboard.js';
const g = buildShip('richelieu').group; g.updateMatrixWorld(true);
const lines = measureLines(g);
const mid = halfBeamAt(lines, 0, -0.4);
for (const f of [0.3, 0.5, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0]) console.log(f, halfBeamAt(lines, 0, lines.keel * f).toFixed(2), (halfBeamAt(lines, 0, lines.keel * f) / mid).toFixed(3));
console.log('mid', mid);
