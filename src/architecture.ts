import type {House,Room,Door,WindowItem} from './model';
export const roomHeight=(r:Room)=>r.height??2.7;
export const doorHeight=(d:Door)=>d.height??2.1;
export const windowHeight=(w:WindowItem)=>w.height??1.35;
export const windowSill=(w:WindowItem)=>w.sill??.85;
export type Wall='north'|'south'|'west'|'east';
/** Solid wall rectangles, with full-height door headers and real window openings. */
export function wallSections(h:House,r:Room,wall:Wall){
 const len=wall==='north'||wall==='south'?r.w:r.d,height=roomHeight(r);
 const holes=[...h.doors.filter(d=>d.roomId===r.id&&d.wall===wall).map(d=>({a:d.offset-d.width/2,b:d.offset+d.width/2,low:0,high:doorHeight(d)})),
  ...h.windows.filter(w=>w.roomId===r.id&&w.wall===wall).map(w=>({a:w.offset-w.width/2,b:w.offset+w.width/2,low:windowSill(w),high:windowSill(w)+windowHeight(w)}))];
 const cuts=[...new Set([-len/2,len/2,...holes.flatMap(o=>[Math.max(-len/2,o.a),Math.min(len/2,o.b)])])].filter(x=>x>=-len/2&&x<=len/2).sort((a,b)=>a-b);
 const sections:{a:number;b:number;low:number;high:number}[]=[];
 for(let i=0;i<cuts.length-1;i++){
  const a=cuts[i],b=cuts[i+1],mid=(a+b)/2;let y=0;
  const spans=holes.filter(o=>mid>o.a&&mid<o.b).sort((a,b)=>a.low-b.low);
  for(const hole of spans){if(hole.low>y)sections.push({a,b,low:y,high:Math.min(hole.low,height)});y=Math.max(y,hole.high);}
  if(y<height)sections.push({a,b,low:y,high:height});
 }
 return sections.filter(s=>s.b>s.a&&s.high>s.low);
}
