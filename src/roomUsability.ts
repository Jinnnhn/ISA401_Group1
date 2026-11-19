import {corners,doorFrame,itemInsideRoom,polygonOverlap,WALL_INSET,type House,type Item,type Room} from './model';

export const passageWidth=.60;
export const sofaClearance=.42;
const chairClearance=.30;
const epsilon=.01;

export const isSeat=(item:Item)=>item.kind==='sofa'||item.kind==='chair';

type Box=Pick<Item,'x'|'z'|'w'|'d'|'rotation'>;
type Footprint=ReturnType<typeof corners>;

function facing(seat:Item){
  const angle=seat.rotation*Math.PI/180;
  return {s:Math.sin(angle),c:Math.cos(angle)};
}

function frontSpace(seat:Item,depth:number):Box {
  const {s,c}=facing(seat),offset=(seat.d+depth)/2;
  return {x:seat.x+s*offset,z:seat.z+c*offset,w:seat.w*.8,d:depth,rotation:seat.rotation};
}

export function frontTarget(seat:Item){
  return seat.kind==='sofa'?sofaClearance:chairClearance;
}

function frontClear(seat:Item,depth:number,room:Room,others:Footprint[]){
  const front=frontSpace(seat,depth),shape=corners(front);
  return itemInsideRoom(front,room)&&!others.some(other=>polygonOverlap(shape,other));
}

export function frontClearance(seat:Item,room:Room,items:Item[]){
  const others=items.filter(item=>item.id!==seat.id).map(corners);
  if(frontClear(seat,.8,room,others))return .8;
  let low=0,high=.8;
  while(high-low>.005){
    const middle=(low+high)/2;
    if(frontClear(seat,middle,room,others))low=middle;
    else high=middle;
  }
  return low;
}

// In both seat models the front points along local positive Z.
export function tableRelationship(seat:Item,table:Item) {
  const {s,c}=facing(seat);
  const dx=table.x-seat.x,dz=table.z-seat.z;
  const forward=dx*s+dz*c,side=Math.abs(dx*c-dz*s);
  const angle=(table.rotation-seat.rotation)*Math.PI/180;
  const halfDepth=(Math.abs(Math.sin(angle))*table.w+Math.abs(Math.cos(angle))*table.d)/2;
  const gap=forward-seat.d/2-halfDepth;
  const sideLimit=Math.max(.22,seat.w*.42);
  const penalty=Math.max(0,sofaClearance-gap,gap-.72)+Math.max(0,side-sideLimit);
  return {gap,side,penalty};
}

function roomPassages(house:House,room:Room){
  const doors=house.doors.filter(door=>door.roomId===room.id);
  if(!doors.length)return [];
  const radius=passageWidth/2;
  const margin=radius+WALL_INSET;
  const left=room.x-room.w/2+margin,top=room.z-room.d/2+margin;
  const w=room.w-2*margin,d=room.d-2*margin;
  if(w<=0||d<=0)return doors.map(door=>({door,reachable:false}));
  const nx=Math.min(151,Math.ceil(w/.1)+1),nz=Math.min(151,Math.ceil(d/.1)+1);
  const dx=w/(nx-1),dz=d/(nz-1);
  const obstacles:Box[]=house.items.filter(item=>item.roomId===room.id);
  for(const door of doors.filter(door=>door.inward)){
    const {hx,hz,vx,vz}=doorFrame(house,door);
    obstacles.push({x:hx+vx*door.width/2,z:hz+vz*door.width/2,w:vx?door.width:.04,d:vz?door.width:.04,rotation:0});
  }
  const free=new Uint8Array(nx*nz).fill(1);
  const buffer=Math.hypot(dx,dz)/2;
  for(const item of obstacles){
    const shape=corners(item),xs=shape.map(p=>p[0]),zs=shape.map(p=>p[1]);
    const reach=radius+buffer;
    const minX=Math.max(0,Math.ceil((Math.min(...xs)-reach-left)/dx));
    const maxX=Math.min(nx-1,Math.floor((Math.max(...xs)+reach-left)/dx));
    const minZ=Math.max(0,Math.ceil((Math.min(...zs)-reach-top)/dz));
    const maxZ=Math.min(nz-1,Math.floor((Math.max(...zs)+reach-top)/dz));
    const angle=item.rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
    for(let iz=minZ;iz<=maxZ;iz++)for(let ix=minX;ix<=maxX;ix++){
      const x=left+ix*dx-item.x,z=top+iz*dz-item.z;
      const a=Math.max(0,Math.abs(x*cos-z*sin)-item.w/2);
      const b=Math.max(0,Math.abs(x*sin+z*cos)-item.d/2);
      if(a*a+b*b<reach*reach)free[iz*nx+ix]=0;
    }
  }
  // Flood from all free cells in the central area, then check each door's entry strip.
  const queue=new Int32Array(free.length),visited=new Uint8Array(free.length);
  let end=0;
  const visit=(index:number)=>{
    if(!free[index]||visited[index])return;
    visited[index]=1;queue[end++]=index;
  };
  for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){
    if(Math.abs(left+ix*dx-room.x)<=room.w*.15&&Math.abs(top+iz*dz-room.z)<=room.d*.15)visit(iz*nx+ix);
  }
  for(let start=0;start<end;start++){
    const index=queue[start],ix=index%nx,iz=Math.floor(index/nx);
    if(ix>0)visit(index-1);
    if(ix<nx-1)visit(index+1);
    if(iz>0)visit(index-nx);
    if(iz<nz-1)visit(index+nx);
  }
  return doors.map(door=>{
    const frame=doorFrame(house,door);
    const alongX=!!frame.ux,steps=alongX?nx:nz;
    const edge=door.wall==='north'||door.wall==='west'?0:alongX?nz-1:nx-1;
    const allowance=door.width/2-radius;
    for(let i=0;i<steps;i++){
      const offset=alongX?left+i*dx-frame.x:top+i*dz-frame.z;
      if(Math.abs(offset)<=allowance&&visited[alongX?edge*nx+i:i*nx+edge])return {door,reachable:true};
    }
    return {door,reachable:false};
  });
}

export function assessRoomUse(house:House,room:Room) {
  const items=house.items.filter(item=>item.roomId===room.id);
  const seats=items.filter(isSeat).map(item=>({item,depth:frontClearance(item,room,items)}));
  const sofa=seats.filter(({item})=>item.kind==='sofa').sort((a,b)=>b.item.w-a.item.w)[0]?.item;
  const table=sofa&&items.filter(item=>item.kind==='table')
    .map(item=>({item,...tableRelationship(sofa,item)})).sort((a,b)=>a.penalty-b.penalty)[0];
  return {seats,sofa,table,passages:roomPassages(house,room)};
}

export function seatingLoss(before:ReturnType<typeof assessRoomUse>,after:ReturnType<typeof assessRoomUse>){
  return after.seats.find(({item,depth})=>{
    const original=before.seats.find(seat=>seat.item.id===item.id);
    return !!original&&depth+epsilon<Math.min(original.depth,frontTarget(item));
  });
}

export function seatWallPenalty(item:Item,room:Room){
  return isSeat(item)&&!frontClear(item,frontTarget(item),room,[])?1:0;
}

export function seatObstructionPenalty(first:Item,firstShape:Footprint,second:Item,secondShape:Footprint){
  const blocks=(seat:Item,obstacle:Footprint)=>isSeat(seat)&&polygonOverlap(corners(frontSpace(seat,frontTarget(seat))),obstacle);
  return Number(blocks(first,secondShape))+Number(blocks(second,firstShape));
}
