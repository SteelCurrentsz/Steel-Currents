import { generateWorld } from '../shared/world.js';
import { createState, addShip, step, fireGuns, DT } from '../shared/sim.js';
const world = generateWorld(4242,'open_ocean'); world.islands=[];
const st = createState(world,{mode:'deathmatch'});
const a = addShip(st,{name:'A',classId:'iowa',team:0,index:0});
const b = addShip(st,{name:'B',classId:'cleveland',team:1,index:0});
a.x=0;a.z=-4000;a.heading=Math.PI/2;a.notch=1;
b.x=0;b.z=4000;b.heading=Math.PI/2;b.notch=1;
a.shellType='ap';
const kinds={};
for(let i=0;i<90*30;i++){ a.aimX=b.x;a.aimZ=b.z; if(i>60) fireGuns(st,a);
  for(const ev of step(st,DT)) if(ev.e==='hit'){kinds[ev.kind]=(kinds[ev.kind]||0)+1; console.log(ev.kind,'y',ev.y.toFixed(1),'dmg',ev.dmg);} }
console.log(kinds, 'b.hp', Math.round(b.hp), 'alive', b.alive);
