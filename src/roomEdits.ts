import {contextHouse,isRecord,placementBounds,type Advice,type LayoutContext} from './layoutAdvice';
import {CATALOG,WALL_MATERIALS,corners,doorSweep,itemInsideRoom,makeItem,polygonOverlap,type Door,type House,type Item,type Kind,type Room} from './model';
import {roomHeight} from './architecture';

type WallMaterial=keyof typeof WALL_MATERIALS;
type RoomEdit=
  | {action:'addFurniture';roomId:string;furnitureKind:Kind;itemId:string;x:number;z:number;rotation:0|90}
  | {action:'wallMaterial';roomId:string;wallMaterial:WallMaterial};
export type RoomEditAdvice={kind:'roomEdit';reply:string;edit:RoomEdit};
type Point={x:number;z:number};
const walls=['north','south','east','west'] as const;
const wallNames={north:'北',south:'南',east:'东',west:'西'} as const;
const materialNames=Object.values(WALL_MATERIALS).map(material=>material.name).join('、');
const furnitureNames=Object.values(CATALOG).map(furniture=>furniture.name).join('、');
const number=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const isKind=(value:unknown):value is Kind=>typeof value==='string'&&Object.hasOwn(CATALOG,value);
const isWallMaterial=(value:unknown):value is WallMaterial=>typeof value==='string'&&Object.hasOwn(WALL_MATERIALS,value);
const text=(reply:string):Advice=>({kind:'text',reply});

export function readRoomEdit(value:unknown,roomId:string):RoomEdit|undefined {
  if(!isRecord(value)||value.roomId!==roomId)return;
  if(value.action==='wallMaterial'&&isWallMaterial(value.wallMaterial)){
    return {action:value.action,roomId,wallMaterial:value.wallMaterial};
  }
  if(value.action==='addFurniture'&&isKind(value.furnitureKind)&&typeof value.itemId==='string'
    &&/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value.itemId)&&number(value.x)&&number(value.z)
    &&(value.rotation===0||value.rotation===90)){
    return {action:value.action,roomId,furnitureKind:value.furnitureKind,itemId:value.itemId,x:value.x,z:value.z,rotation:value.rotation};
  }
}

export function roomEditTitle(edit:RoomEdit){
  return edit.action==='wallMaterial'?`将墙面更换为${WALL_MATERIALS[edit.wallMaterial].name}`:`添加${CATALOG[edit.furnitureKind].name}`;
}

function canPlace(house:House,room:Room,kind:Kind){
  const obstacles=house.items.filter(item=>item.roomId===room.id).map(corners);
  const doorAreas=house.doors.filter(door=>door.roomId===room.id).map(door=>doorSweep(house,door));
  return (item:Item)=>{
    if(CATALOG[kind].h>roomHeight(room)||!itemInsideRoom(item,room))return false;
    const shape=corners(item);
    return !obstacles.some(obstacle=>polygonOverlap(shape,obstacle))&&!doorAreas.some(area=>polygonOverlap(shape,area));
  };
}

export function applyRoomEdit(house:House,roomId:string,proposal:RoomEdit):{house:House}|{error:string}{
  const edit=readRoomEdit(proposal,roomId);
  const room=house.rooms.find(room=>room.id===roomId);
  if(!edit||!room)return {error:'建议与当前房间不匹配，请重新生成。'};
  if(edit.action==='wallMaterial'){
    if((room.wallMaterial??'damask')===edit.wallMaterial)return {error:'当前房间已使用这款墙面材质。'};
    return {house:{...house,rooms:house.rooms.map(value=>value===room?{...room,wallMaterial:edit.wallMaterial}:value)}};
  }
  if([...house.items,...house.rooms,...house.doors,...house.windows].some(value=>value.id===edit.itemId)){
    return {error:'建议中的家具已存在，请重新生成。'};
  }
  const item:Item={id:edit.itemId,roomId,kind:edit.furnitureKind,...CATALOG[edit.furnitureKind],
    x:edit.x,z:edit.z,rotation:edit.rotation,locked:false};
  if(!canPlace(house,room,item.kind)(item))return {error:'这个位置会越界、挡门或与家具重叠，请重新生成。'};
  return {house:{...house,items:[...house.items,item]}};
}

function axisSamples(min:number,max:number,target:number){
  const anchor=Math.max(min,Math.min(max,target));
  const step=Math.max(.1,(max-min)/64);
  const values=new Set([anchor,min,max]);
  for(let index=1;anchor+index*step<max;index++)values.add(anchor+index*step);
  for(let index=1;anchor-index*step>min;index++)values.add(anchor-index*step);
  return [...values];
}

function findNewPlacement(house:House,room:Room,item:Item,target:Point,wall?:Door['wall'],window?:House['windows'][number]){
  const fits=canPlace(house,room,item.kind);
  const candidates:{x:number;z:number;rotation:0|90;score:number}[]=[];
  for(const rotation of (wall==='west'||wall==='east'?[90,0]:[0,90]) as (0|90)[]){
    const bounds=placementBounds(room,{...item,rotation});
    if(!bounds)continue;
    const {minX,maxX,minZ,maxZ}=bounds;
    const xs=wall==='west'?[minX]:wall==='east'?[maxX]:axisSamples(minX,maxX,target.x);
    const zs=wall==='north'?[minZ]:wall==='south'?[maxZ]:axisSamples(minZ,maxZ,target.z);
    for(const x of xs)for(const z of zs){
      if(window){
        const alongX=wall==='north'||wall==='south';
        const extent=rotation===0?(alongX?item.w:item.d):(alongX?item.d:item.w);
        if(Math.abs((alongX?x:z)-(alongX?target.x:target.z))>window.width/2+extent/2)continue;
      }
      candidates.push({x,z,rotation,score:(x-target.x)**2+(z-target.z)**2});
    }
  }
  candidates.sort((first,second)=>first.score-second.score);
  return candidates.find(({x,z,rotation})=>fits({...item,x,z,rotation}));
}

export function makeRoomEditAdvice(context:LayoutContext,intent:Record<string,unknown>):Advice {
  const {room}=context;
  if(intent.action==='wallMaterial'){
    const wallMaterial=intent.wallMaterial;
    if(!isWallMaterial(wallMaterial))return text(`目前可选择：${materialNames}。你想换成哪一款？`);
    if((room.wallMaterial??'damask')===wallMaterial)return text(`${room.name}已经使用${WALL_MATERIALS[wallMaterial].name}，可以保留现状。`);
    const edit={action:'wallMaterial',roomId:room.id,wallMaterial} as const;
    return {kind:'roomEdit',reply:`${roomEditTitle(edit)}。这个建议只改当前房间的墙面，家具和地板保持原样。`,edit};
  }
  if(intent.action!=='addFurniture')return text('可以建议添加家具或更换当前房间的墙面。你想做哪一种调整？');
  const furnitureKind=intent.furnitureKind;
  if(!isKind(furnitureKind))return text(`家具库目前有：${furnitureNames}。你想添加哪一种？`);
  if(context.items.length>=60)return text('当前房间已达到助手可处理的家具数量，请先移除不需要的家具。');
  const requestedWall=walls.find(wall=>wall===intent.wall);
  const window=context.windows.find(entry=>entry.id===intent.windowId&&(!requestedWall||entry.wall===requestedWall));
  if(intent.windowId!==undefined&&!window)return text('没有找到对应的窗户，请指定当前房间哪一扇窗。');
  if(intent.wall!==undefined&&!requestedWall)return text('请指定要靠近的墙面：东、南、西或北。');
  const wall=window?.wall??requestedWall;
  const position=intent.target;
  if(position!==undefined&&(!isRecord(position)||!number(position.x)||!number(position.z)))return text('请提供有效的家具位置，或让我在当前房间找空位。');
  const target=isRecord(position)&&number(position.x)&&number(position.z)
    ?{x:position.x,z:position.z}:{x:room.x,z:room.z};
  if(window){if(wall==='north'||wall==='south')target.x=room.x+window.offset;else target.z=room.z+window.offset;}
  const item=makeItem(furnitureKind,room.id,target.x,target.z);
  if(item.h>roomHeight(room))return text(`${item.name}高于当前房间的净高，无法添加。`);
  const found=findNewPlacement(contextHouse(context),room,item,target,wall,window);
  if(!found)return text(`在${wall?wallNames[wall]+'墙'+(window?'窗边':''):room.name}没有找到能放下${item.name}且不挡门的空位。`);
  const edit={action:'addFurniture',roomId:room.id,furnitureKind,itemId:item.id,x:found.x,z:found.z,rotation:found.rotation} as const;
  const where=window?`${wallNames[window.wall]}墙窗边`:wall?`${wallNames[wall]}墙边`:'当前房间的空位';
  return {kind:'roomEdit',reply:`建议在${where}添加${item.name}（${item.w} × ${item.d} 米）。现有家具保持原位，可以先在画布预览。`,edit};
}
