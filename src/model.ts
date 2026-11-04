export type Kind = 'sofa' | 'table' | 'bed' | 'desk' | 'chair' | 'cabinet' | 'plant';
export type Item = {id:string; roomId:string; kind:Kind; name:string; x:number; z:number; w:number; d:number; h:number; rotation:number; color:string; locked:boolean};
export type Door = {id:string; roomId:string; wall:'north'|'south'|'east'|'west'; offset:number; width:number; height?:number;hinge:'left'|'right'; inward:boolean; open:boolean};
export type WindowItem = {id:string; roomId:string; wall:'north'|'south'|'east'|'west'; offset:number; width:number;height?:number;sill?:number};
export const FLOOR_MATERIALS={oak:{name:'浅橡木',color:'#d5bb92'},walnut:{name:'深胡桃木',color:'#8e6348'},stone:{name:'水磨石',color:'#bdc1b9'},tile:{name:'哑光瓷砖',color:'#deddd4'}} as const;
export const WALL_MATERIALS={ivory:{name:'暖白漆',color:'#f2eee3'},sage:{name:'鼠尾草绿',color:'#b8c8ad'},concrete:{name:'微水泥',color:'#afb5af'},brick:{name:'白色砖墙',color:'#e7e2d6'}} as const;
export type Room = {id:string; name:string; x:number; z:number; w:number; d:number; height?:number;color:string;floorMaterial?:keyof typeof FLOOR_MATERIALS;wallMaterial?:keyof typeof WALL_MATERIALS};
export type House = {version:1; name:string; rooms:Room[]; items:Item[]; doors:Door[]; windows:WindowItem[]};
export type Tool = 'select'|'box'|'measure';
export const CATALOG:Record<Kind,{name:string;w:number;d:number;h:number;color:string}> = {
 sofa:{name:'皮木框架沙发',w:2.73,d:.93,h:1.12,color:'#8eaa99'},
 table:{name:'椭圆茶几',w:1.2,d:.7,h:.4,color:'#bc9470'},
 bed:{name:'织物软包双人床',w:1.8,d:2.15,h:1,color:'#e3d9c5'},
 desk:{name:'原木书桌',w:1.4,d:.65,h:.76,color:'#b38e68'},
 chair:{name:'曲面织物单椅',w:.83,d:.57,h:.69,color:'#c9a07f'},
 cabinet:{name:'收纳边柜',w:1.6,d:.42,h:.68,color:'#b99a78'},
 plant:{name:'绿植',w:.48,d:.48,h:1.25,color:'#7f9b70'}
};
export const copy = <T,>(x:T):T => structuredClone(x);
export function makeItem(kind:Kind,roomId:string,x:number,z:number):Item {return {id:crypto.randomUUID(),roomId,kind,...CATALOG[kind],x,z,rotation:0,locked:false};}
export function initialHouse():House {
 const seed=(kind:Kind,id:string,roomId:string,x:number,z:number,rotation=0):Item=>({id,roomId,kind,...CATALOG[kind],x,z,rotation,locked:false});
 return {version:1,name:'林间公寓',rooms:[
  {id:'living',name:'客厅',x:0,z:0,w:6,d:6,color:'#e7ddc9'},
  {id:'bedroom',name:'卧室',x:5.3,z:-1.5,w:4.4,d:3,color:'#e9dfd3'},
  {id:'study',name:'书房',x:5.3,z:1.6,w:4.4,d:3,color:'#dddcc9'}
 ],items:[
 seed('sofa','sofa','living',-.65,-1.9),seed('table','table','living',-.6,-.25),seed('chair','chair','living',1.55,-.55,270),seed('cabinet','cabinet','living',-2.55,.2,90),seed('plant','plant','living',-2.3,-2.3),
 seed('bed','bed','bedroom',5.25,-1.45),seed('cabinet','bed-cabinet','bedroom',7.1,-1.4,90),seed('plant','bed-plant','bedroom',3.6,-2.5),
 seed('desk','desk','study',5.3,.6),seed('chair','desk-chair','study',5.3,1.65),seed('cabinet','study-cabinet','study',7.1,1.65,90),seed('plant','study-plant','study',3.6,.55)
 ],doors:[{id:'door-living',roomId:'living',wall:'south',offset:1.8,width:1,hinge:'left',inward:true,open:true},{id:'door-bed',roomId:'bedroom',wall:'west',offset:.6,width:.9,hinge:'left',inward:true,open:false},{id:'door-study',roomId:'study',wall:'west',offset:.6,width:.9,hinge:'right',inward:true,open:true}],windows:[{id:'window-living',roomId:'living',wall:'north',offset:.2,width:2.4},{id:'window-bed',roomId:'bedroom',wall:'north',offset:0,width:1.6},{id:'window-study',roomId:'study',wall:'east',offset:0,width:1.3}]};
}
export function roomOf(h:House,id:string){return h.rooms.find(r=>r.id===id)!;}
export function alternateHouse():House {
 const seed=(kind:Kind,id:string,roomId:string,x:number,z:number,rotation=0):Item=>({id,roomId,kind,...CATALOG[kind],x,z,rotation,locked:false});
 return {version:1,name:'晴空两居',rooms:[
  {id:'sky-living',name:'客厅',x:0,z:0,w:7,d:4.5,color:'#e2d8c8'},
  {id:'sky-master',name:'主卧',x:-1.75,z:4.1,w:3.5,d:3.5,color:'#e8ddd4'},
  {id:'sky-second',name:'次卧',x:1.85,z:4.1,w:3.5,d:3.5,color:'#dce2d2'}
 ],items:[
  seed('sofa','sky-sofa','sky-living',-1,-1.35),seed('table','sky-table','sky-living',-1,.2),seed('chair','sky-chair','sky-living',1,.2,270),seed('cabinet','sky-cabinet','sky-living',2.95,-.25,90),seed('plant','sky-plant','sky-living',-2.95,-1.65),
  seed('bed','sky-bed','sky-master',-1.8,4.55),seed('cabinet','sky-master-cabinet','sky-master',-3.1,4.5,90),seed('plant','sky-master-plant','sky-master',-.45,2.85),
  seed('bed','sky-second-bed','sky-second',2.25,4.55),seed('cabinet','sky-second-cabinet','sky-second',.48,4.5,90),seed('plant','sky-second-plant','sky-second',3.15,2.9)
 ],doors:[
  {id:'sky-door-living',roomId:'sky-living',wall:'south',offset:-2.4,width:.95,hinge:'left',inward:true,open:true},
  {id:'sky-door-master',roomId:'sky-master',wall:'north',offset:-1,width:.85,hinge:'left',inward:true,open:false},
  {id:'sky-door-second',roomId:'sky-second',wall:'north',offset:-.7,width:.85,hinge:'left',inward:true,open:true}
 ],windows:[
  {id:'sky-window-living',roomId:'sky-living',wall:'north',offset:.6,width:2.6},
  {id:'sky-window-master',roomId:'sky-master',wall:'west',offset:0,width:1.2},
  {id:'sky-window-second',roomId:'sky-second',wall:'east',offset:0,width:1.2}
 ]};
}
export function corners(f:Pick<Item,'x'|'z'|'w'|'d'|'rotation'>):[number,number][] {
 const a=f.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 return [[-f.w/2,-f.d/2],[f.w/2,-f.d/2],[f.w/2,f.d/2],[-f.w/2,f.d/2]].map(([x,z])=>[f.x+x*c+z*s,f.z-x*s+z*c]);
}
export function polygonOverlap(a:[number,number][],b:[number,number][]) {
 for(const poly of [a,b])for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length],axis=[-(q[1]-p[1]),q[0]-p[0]];
  const pa=a.map(v=>v[0]*axis[0]+v[1]*axis[1]),pb=b.map(v=>v[0]*axis[0]+v[1]*axis[1]);
  if(Math.max(...pa)<=Math.min(...pb)+.0001||Math.max(...pb)<=Math.min(...pa)+.0001)return false;
 }return true;
}
// Door coordinates: u runs along the wall, v points into the room.
export function doorFrame(h:House,d:Door){
 const r=roomOf(h,d.roomId);
 const basis={north:{x:r.x+d.offset,z:r.z-r.d/2,ux:1,uz:0,vx:0,vz:1},south:{x:r.x+d.offset,z:r.z+r.d/2,ux:1,uz:0,vx:0,vz:-1},west:{x:r.x-r.w/2,z:r.z+d.offset,ux:0,uz:1,vx:1,vz:0},east:{x:r.x+r.w/2,z:r.z+d.offset,ux:0,uz:1,vx:-1,vz:0}}[d.wall];
 const side=d.hinge==='left'?1:-1;
 return {...basis,hx:basis.x-basis.ux*d.width/2*side,hz:basis.z-basis.uz*d.width/2*side,side};
}
export function doorPoint(h:House,d:Door,angle:number,radius=d.width):[number,number]{
 const f=doorFrame(h,d),a=angle*Math.PI/180,dir=d.inward?1:-1;
 return [f.hx+radius*(f.ux*f.side*Math.cos(a)+f.vx*dir*Math.sin(a)),f.hz+radius*(f.uz*f.side*Math.cos(a)+f.vz*dir*Math.sin(a))];
}
export function doorSweep(h:House,d:Door):[number,number][]{const f=doorFrame(h,d);return [[f.hx,f.hz],...Array.from({length:25},(_,i)=>doorPoint(h,d,i*90/24))];}
export function warnings(h:House):Record<string,string[]> {
 const out:Record<string,string[]>={};const add=(id:string,text:string)=>{(out[id]??=[]).push(text);};
 for(const f of h.items){const r=roomOf(h,f.roomId);if(!itemInsideRoom(f,r))add(f.id,'超出房间边界');
 for(const d of h.doors.filter(d=>d.roomId===f.roomId))if(polygonOverlap(corners(f),doorSweep(h,d))){add(f.id,'占用房门开启区域');add(d.id,`${f.name}挡住开门范围`);}}
 for(let i=0;i<h.items.length;i++)for(let j=i+1;j<h.items.length;j++){const a=h.items[i],b=h.items[j];if(a.roomId===b.roomId&&polygonOverlap(corners(a),corners(b))){add(a.id,`与${b.name}重叠`);add(b.id,`与${a.name}重叠`);}}
 return out;
}
export const snap=(n:number,enabled:boolean)=>enabled?Math.round(n*10)/10:n;
// Walls are centred on the room boundary and are 12 cm thick. Keep the complete
// rotated footprint inside their inner faces, with a small numerical clearance.
export const WALL_INSET=.061;
export function itemInsideRoom(f:Item,r:Room){return corners(f).every(([x,z])=>x>=r.x-r.w/2+WALL_INSET-1e-7&&x<=r.x+r.w/2-WALL_INSET+1e-7&&z>=r.z-r.d/2+WALL_INSET-1e-7&&z<=r.z+r.d/2-WALL_INSET+1e-7);}
export function constrainHouse(h:House):{house:House;adjusted:boolean;error?:string}{
 const next=copy(h);let adjusted=false;
 for(const r of next.rooms){
  const height=r.height??2.7;
  if(!Number.isFinite(height)||height<2||height>5)return {house:h,adjusted:false,error:'房间净高请填写 2 至 5 米范围内的实测值。'};
  if(next.items.some(f=>f.roomId===r.id&&f.h>height))return {house:h,adjusted:false,error:`${r.name}中有家具高于房间净高，请先修改家具尺寸。`};
  for(const d of next.doors.filter(d=>d.roomId===r.id)){
   const span=d.wall==='north'||d.wall==='south'?r.w:r.d;
   if((d.height??2.1)>height||Math.abs(d.offset)+d.width/2>span/2)return {house:h,adjusted:false,error:`${r.name}的门洞超出墙面，请先调整门洞位置或尺寸。`};
  }
  for(const w of next.windows.filter(w=>w.roomId===r.id)){
   const span=w.wall==='north'||w.wall==='south'?r.w:r.d;
   if((w.sill??.85)+(w.height??1.35)>height||Math.abs(w.offset)+w.width/2>span/2)return {house:h,adjusted:false,error:`${r.name}的窗洞超出墙面，请先调整窗台、位置或尺寸。`};
  }
 }
 for(const f of next.items){const r=roomOf(next,f.roomId);const points=corners(f),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  if(maxX-minX>r.w-2*WALL_INSET+1e-7||maxZ-minZ>r.d-2*WALL_INSET+1e-7)return {house:h,adjusted:false,error:`${f.name}在当前朝向放不进${r.name}，请先调整尺寸或朝向。`};
  const dx=Math.min(Math.max(0,r.x-r.w/2+WALL_INSET-minX),r.x+r.w/2-WALL_INSET-maxX),dz=Math.min(Math.max(0,r.z-r.d/2+WALL_INSET-minZ),r.z+r.d/2-WALL_INSET-maxZ);
  if(Math.abs(dx)>1e-7||Math.abs(dz)>1e-7){if(f.locked)return {house:h,adjusted:false,error:`调整会使已锁定的${f.name}穿墙，请先解锁或增大房间。`};f.x+=dx;f.z+=dz;adjusted=true;}
 }return {house:next,adjusted};
}
export function moveItems(h:House,ids:string[],dx:number,dz:number,grid:boolean):House {
 const next=copy(h);if(h.items.some(f=>ids.includes(f.id)&&f.locked))return next;const anchor=h.items.find(f=>ids.includes(f.id));if(!anchor)return next;
 let minX=-Infinity,maxX=Infinity,minZ=-Infinity,maxZ=Infinity;
 for(const f of h.items.filter(f=>ids.includes(f.id))){const r=roomOf(h,f.roomId),points=corners(f),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);minX=Math.max(minX,r.x-r.w/2+WALL_INSET-Math.min(...xs));maxX=Math.min(maxX,r.x+r.w/2-WALL_INSET-Math.max(...xs));minZ=Math.max(minZ,r.z-r.d/2+WALL_INSET-Math.min(...zs));maxZ=Math.min(maxZ,r.z+r.d/2-WALL_INSET-Math.max(...zs));}
 if(minX>maxX||minZ>maxZ)return next;
 const x=Math.max(minX,Math.min(maxX,snap(anchor.x+dx,grid)-anchor.x)),z=Math.max(minZ,Math.min(maxZ,snap(anchor.z+dz,grid)-anchor.z));
 for(const f of next.items)if(ids.includes(f.id)){f.x+=x;f.z+=z;}return next;
}
export function validHouse(value:unknown):value is House {
 if(!value||typeof value!=='object')return false;const h=value as House;
 const num=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<10000;
 if(h.version!==1||typeof h.name!=='string'||!Array.isArray(h.rooms)||!h.rooms.length||h.rooms.length>40||!Array.isArray(h.items)||h.items.length>500||!Array.isArray(h.doors)||h.doors.length>100||!Array.isArray(h.windows)||h.windows.length>100)return false;
 const ids=new Set<string>();const id=(x:{id:string})=>typeof x.id==='string'&&!ids.has(x.id)&&(ids.add(x.id),true);
 if(!h.rooms.every(r=>id(r)&&typeof r.name==='string'&&[r.x,r.z,r.w,r.d].every(num)&&r.w>.5&&r.d>.5&&(r.height===undefined||num(r.height)&&r.height>=2&&r.height<=5)&&typeof r.color==='string'&&(r.floorMaterial===undefined||Object.hasOwn(FLOOR_MATERIALS,r.floorMaterial))&&(r.wallMaterial===undefined||Object.hasOwn(WALL_MATERIALS,r.wallMaterial))))return false;
 const room=(r:string)=>h.rooms.some(x=>x.id===r);
 const opening=(d:Door|WindowItem)=>id(d)&&room(d.roomId)&&['north','south','east','west'].includes(d.wall)&&num(d.offset)&&num(d.width)&&d.width>.1&&d.width<20;
 return h.items.every(f=>id(f)&&room(f.roomId)&&Object.hasOwn(CATALOG,f.kind)&&typeof f.name==='string'&&/^#[0-9a-f]{6}$/i.test(f.color)&&[f.x,f.z,f.w,f.d,f.h,f.rotation].every(num)&&f.w>0&&f.d>0&&f.h>0&&f.h<=(roomOf(h,f.roomId).height??2.7)&&typeof f.locked==='boolean')&&h.doors.every(d=>opening(d)&&['left','right'].includes(d.hinge)&&typeof d.inward==='boolean'&&typeof d.open==='boolean'&&(d.height===undefined||num(d.height)&&d.height>=1.8&&d.height<=(roomOf(h,d.roomId).height??2.7)))&&h.windows.every(w=>opening(w)&&(w.height===undefined||num(w.height)&&w.height>.1)&&(w.sill===undefined||num(w.sill)&&w.sill>=0)&&(w.height??1.35)+(w.sill??.85)<=(roomOf(h,w.roomId).height??2.7));
}
