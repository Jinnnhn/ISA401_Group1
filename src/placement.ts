import {copy,corners,doorSweep,itemInsideRoom,moveItems,polygonOverlap,roomOf,warnings,type House,type Item} from './model';

export function addedConflicts(before:House,after:House){
 const previous=warnings(before),current=warnings(after);
 return [...new Set(Object.entries(current).flatMap(([id,texts])=>texts.filter(t=>!previous[id]?.includes(t))))];
}
function clear(f:Item,h:House){
 return itemInsideRoom(f,roomOf(h,f.roomId))&&
  !h.items.some(o=>o.id!==f.id&&o.roomId===f.roomId&&polygonOverlap(corners(f),corners(o)))&&
  !h.doors.some(d=>d.roomId===f.roomId&&polygonOverlap(corners(f),doorSweep(h,d)));
}
export type Placement={house:House;valid:boolean;yieldId?:string;message:string};
export function previewMove(base:House,ids:string[],dx:number,dz:number,grid:boolean):Placement{
 if(!ids.length||base.items.some(f=>ids.includes(f.id)&&f.locked))return {house:copy(base),valid:false,message:'所选家具包含锁定物件，请先解锁。'};
 const next=moveItems(base,ids,dx,dz,grid),conflicts=addedConflicts(base,next);
 if(!conflicts.length)return {house:next,valid:true,message:'松手放置 · Esc 取消'};
 if(ids.length===1){
  const moving=next.items.find(f=>f.id===ids[0]);
  if(moving&&!next.doors.some(d=>d.roomId===moving.roomId&&polygonOverlap(corners(moving),doorSweep(next,d)))){
   const hits=next.items.filter(o=>o.id!==moving.id&&o.roomId===moving.roomId&&polygonOverlap(corners(moving),corners(o)));
   if(hits.length===1&&!hits[0].locked){
    const other=hits[0],r=roomOf(next,other.roomId),positions:{x:number;z:number;distance:number}[]=[];
    for(let x=Math.ceil((r.x-r.w/2)*10)/10;x<r.x+r.w/2;x+=.1)for(let z=Math.ceil((r.z-r.d/2)*10)/10;z<r.z+r.d/2;z+=.1)
     positions.push({x:+x.toFixed(3),z:+z.toFixed(3),distance:(x-other.x)**2+(z-other.z)**2});
    positions.sort((a,b)=>a.distance-b.distance||a.x-b.x||a.z-b.z);
    const spot=positions.find(p=>clear({...other,x:p.x,z:p.z},next));
    if(spot){Object.assign(other,{x:spot.x,z:spot.z});if(!addedConflicts(base,next).length)return {house:next,valid:true,yieldId:other.id,message:`${other.name}将让位 · 松手一起确认，Esc 一起取消`};}
   }
  }
 }
 return {house:moveItems(base,ids,dx,dz,grid),valid:false,message:`${conflicts[0]} · 松手将恢复原位`};
}

/** Find space for new copies as one group, without changing the existing objects. */
export function placeCopies(base:House,source:Item[]):House|null{
 const anchor=source[0];if(!anchor)return null;const r=roomOf(base,anchor.roomId);
 const copies=source.map(f=>({...copy(f),id:crypto.randomUUID(),locked:false}));
 const offsets:{x:number;z:number;d:number}[]=[];
 for(let x=-r.w;x<=r.w;x+=.2)for(let z=-r.d;z<=r.d;z+=.2)offsets.push({x,z,d:x*x+z*z});
 offsets.sort((a,b)=>a.d-b.d||a.x-b.x||a.z-b.z);
 for(const p of offsets){const items=copies.map(f=>({...f,x:f.x+p.x,z:f.z+p.z})),candidate={...base,items:[...base.items,...items]};
  if(items.every(f=>clear(f,candidate)))return candidate;
 }return null;
}
