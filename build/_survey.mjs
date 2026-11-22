import { readFileSync } from 'node:fs';
import { flatten } from './glb-flatten.mjs';
for (const f of process.argv.slice(2)) {
  const m = await flatten(readFileSync(f), 2);
  const lo=[1e9,1e9,1e9], hi=[-1e9,-1e9,-1e9];
  for (let t=0;t<m.T.length;t++){const i=m.T[t]*3;for(let c=0;c<3;c++){lo[c]=Math.min(lo[c],m.P[i+c]);hi[c]=Math.max(hi[c],m.P[i+c]);}}
  console.log(f.split('/').pop(), 'tris', m.T.length/3, 'nodes', m.j.nodes.length, 'ext', hi.map((h,c)=>((h-lo[c])/(hi[2]-lo[2])).toFixed(3)).join(' '), 'lo', lo.map(v=>v.toFixed(1)).join(' '));
}
