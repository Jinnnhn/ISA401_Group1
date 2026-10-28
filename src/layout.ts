export type Furniture = { id:string; name:string; x:number; z:number; w:number; d:number; h:number; color:number; locked:boolean };
export const ROOM={w:6,d:5,step:.25};
export const initial: Furniture[]=[
 {id:'sofa',name:'沙发',x:-1.5,z:-1,w:2,d:.9,h:.65,color:0x91aa99,locked:false},
 {id:'table',name:'茶几',x:0,z:.3,w:1.1,d:.7,h:.42,color:0xcfae83,locked:false},
 {id:'tv',name:'电视柜',x:1.6,z:-1.4,w:1.7,d:.5,h:.45,color:0x9aa7b3,locked:false},
];
export const clone=(items:Furniture[])=>items.map(f=>({...f}));
export const snap=(v:number)=>Math.round(v/ROOM.step)*ROOM.step;
export function overlaps(a:Furniture,b:Furniture){return Math.abs(a.x-b.x)<(a.w+b.w)/2-.001&&Math.abs(a.z-b.z)<(a.d+b.d)/2-.001;}
export function valid(f:Furniture,others:Furniture[]){return Math.abs(f.x)+f.w/2<=ROOM.w/2&&Math.abs(f.z)+f.d/2<=ROOM.d/2&&!others.some(o=>overlaps(f,o));}
export function propose(items:Furniture[],id:string,x:number,z:number):{ok:boolean;items:Furniture[];message:string}{
 const original=items.find(f=>f.id===id);if(!original)return {ok:false,items:clone(items),message:'没有找到家具'};
 const fail=(message:string)=>({ok:false,items:clone(items),message});
 if(original.locked)return fail('家具已锁定');
 const next=clone(items), moving=next.find(f=>f.id===id)!;moving.x=snap(x);moving.z=snap(z);
 if(!valid(moving,[]))return fail('超出房间边界，请换一个位置');
 const hits=next.filter(f=>f.id!==id&&overlaps(moving,f));
 if(!hits.length)return {ok:true,items:next,message:'松手放置家具'};
 if(hits.length>1)return fail('当前位置涉及多件家具，暂不支持连锁让位');
 const other=hits[0];if(other.locked)return fail(`${other.name}已锁定，不能让位`);
 const candidates:{x:number;z:number;distance:number}[]=[];
 for(let cx=-ROOM.w/2;cx<=ROOM.w/2;cx+=ROOM.step)for(let cz=-ROOM.d/2;cz<=ROOM.d/2;cz+=ROOM.step){
  if(valid({...other,x:cx,z:cz},next.filter(f=>f.id!==other.id)))candidates.push({x:cx,z:cz,distance:(cx-other.x)**2+(cz-other.z)**2});
 }
 candidates.sort((a,b)=>a.distance-b.distance||a.x-b.x||a.z-b.z);
 if(!candidates.length)return fail(`${other.name}附近没有有效空位`);
 Object.assign(other,{x:candidates[0].x,z:candidates[0].z});
 return {ok:true,items:next,message:`${other.name}让位预览 · 松手确认，Esc 取消`};
}
