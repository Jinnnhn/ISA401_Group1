import {corners, doorFrame, itemBlocksDoor, itemInsideRoom, polygonOverlap, validHouse, WALL_INSET, type Door, type House, type Item, type Kind} from './model';

export const layoutPreferences = {balanced:'按本次要求', passage:'通行优先', hosting:'会客优先'} as const;
export type LayoutPreference = keyof typeof layoutPreferences;
export type Goal = 'center' | 'door' | 'conversation' | 'position' | 'align' | 'wall';
export type Move = {itemId:string; x:number; z:number};
export type PreviousSuggestion = {move:Move; state:'suggested'|'previewing'};
export type RoomObjective = 'balanced'|'center'|'door'|'hosting';
export type PreviousRoomSuggestion = {changes:Move[]; objective:RoomObjective; preserveIds:string[]};
export type LayoutContext = {room:House['rooms'][number]; items:Item[]; doors:House['doors']; windows:House['windows']; selectedIds:string[]; preference:LayoutPreference; custom:string; confirmedId?:string; previousSuggestion?:PreviousSuggestion; previousRoomSuggestion?:PreviousRoomSuggestion};
export type MoveExplanation = {movement:string; reason:string; impact:string; details:string[]};
export type RoomProposal = {kind:'roomProposal'; reply:string; objective:RoomObjective; objectiveLabel:string; preserveIds:string[]; changes:Move[]; explanations:MoveExplanation[]};
export type AdviceDraft = Move|RoomProposal;
export type Advice =
  | {kind:'text'; reply:string; keepSuggestion?:boolean}
  | {kind:'clarify'; reply:string; candidateIds:string[]}
  | {kind:'proposal'; reply:string; moves:Move[]; explanations:MoveExplanation[]}
  | RoomProposal;

export function makeLayoutContext(house:House, roomId:string, selectedIds:string[], preference:LayoutPreference, custom:string, confirmedId?:string, previousSuggestion?:PreviousSuggestion, previousRoomSuggestion?:PreviousRoomSuggestion):LayoutContext {
  const {id,name,x,z,w,d,height,floorMaterial,wallMaterial} = house.rooms.find(room=>room.id===roomId)!;
  const items = house.items.filter(item=>item.roomId===roomId).map(({color:_color,...item})=>({...item,color:'#000000'}));
  return {room:{id,name,x,z,w,d,height,floorMaterial,wallMaterial,color:'#000000'}, items, doors:house.doors.filter(door=>door.roomId===roomId), windows:house.windows.filter(window=>window.roomId===roomId),
    selectedIds:selectedIds.filter(itemId=>items.some(item=>item.id===itemId)), preference, custom, confirmedId, previousSuggestion, previousRoomSuggestion};
}

export function contextHouse(context:LayoutContext):House {
  return {version:1,name:context.room.name,rooms:[context.room],items:context.items,doors:context.doors,windows:context.windows};
}

export const isRecord = (value:unknown):value is Record<string,unknown> => !!value && typeof value==='object' && !Array.isArray(value);
export const isMove = (value:unknown):value is Move => isRecord(value)&&typeof value.itemId==='string'&&typeof value.x==='number'&&Number.isFinite(value.x)&&typeof value.z==='number'&&Number.isFinite(value.z);
export const roomObjectives:readonly RoomObjective[]=['balanced','center','door','hosting'];

export function readLayoutContext(value:unknown):LayoutContext | undefined {
  if(!isRecord(value) || !isRecord(value.room) || !Array.isArray(value.items) || !Array.isArray(value.doors) || !Array.isArray(value.windows) || !Array.isArray(value.selectedIds)) return;
  if(value.items.length>60 || value.doors.length>16 || value.windows.length>16 || ![...value.items,...value.doors,...value.windows].every(isRecord)) return;
  if(typeof value.preference!=='string' || !Object.hasOwn(layoutPreferences,value.preference) || typeof value.custom!=='string' || value.custom.length>200) return;
  const entries=[value.room,...value.items,...value.doors,...value.windows].filter(isRecord);
  if(!entries.every(entry=>typeof entry.id==='string' && entry.id.length>0 && entry.id.length<=120)) return;
  if(![value.room,...value.items].every(entry=>typeof entry.name==='string' && entry.name.length<=120)) return;
  const context = value as unknown as LayoutContext;
  if(!validHouse(contextHouse(context))) return;
  const validId = (id:unknown)=>context.items.some(item=>item.id===id);
  if(context.selectedIds.length>context.items.length || !context.selectedIds.every(validId) || new Set(context.selectedIds).size!==context.selectedIds.length) return;
  if(context.confirmedId!==undefined && !validId(context.confirmedId)) return;
  if(value.previousSuggestion!==undefined){
    const suggestion=value.previousSuggestion;
    if(!isRecord(suggestion)||(suggestion.state!=='suggested'&&suggestion.state!=='previewing')||!isRecord(suggestion.move))return;
    const {itemId,x,z}=suggestion.move;
    if(typeof itemId!=='string'||typeof x!=='number'||typeof z!=='number'||placementCheck(contextHouse(context),context.room.id,{itemId,x,z}))return;
  }
  if(value.previousRoomSuggestion!==undefined){
    const prior=value.previousRoomSuggestion;
    if(!isRecord(prior)||!roomObjectives.includes(prior.objective as RoomObjective)||!Array.isArray(prior.changes)
      ||prior.changes.length>context.items.length||!prior.changes.every(isMove)||!Array.isArray(prior.preserveIds)
      ||prior.preserveIds.length>context.items.length||!prior.preserveIds.every(validId))return;
    if('error' in applyLayoutChanges(contextHouse(context),context.room.id,prior.changes,prior.preserveIds))return;
  }
  return context;
}

const kindWords:Record<Kind,RegExp> = {
  sofa:/沙发|\bsofas?\b|\bcouches?\b/i, table:/茶几|餐桌|边几|\b(?:coffee |dining )?tables?\b/i,
  bed:/床|\bbeds?\b/i, desk:/书桌|办公桌|\bdesks?\b/i, chair:/椅|\bchairs?\b/i,
  cabinet:/柜|\bcabinets?\b|\bwardrobes?\b/i, plant:/绿植|盆栽|\bplants?\b/i,
};

function moveClause(text:string) {
  const clauses=splitClauses(text);
  return clauses.find(clause=>!/(?:不动|不要|别动|不用动|保持|保留|原位|\bkeep\b|\bleave\b|\bdon't\b|\bdo not\b)/i.test(clause)
    && /移动|平移|调整|挪|移到|搬|移开|换个位置|放到|\bmove\b|\bplace\b|\breposition\b/i.test(clause)) ?? '';
}

function splitClauses(text:string) {
  return text.split(/[，。！？；,!?;\n]+|但(?:是)?|并且|同时|\bbut\b|\band\s+(?=keep\b|leave\b|move\b)/i);
}

export function namedItems(items:Item[], text:string):Item[] {
  const exact = items.filter(item=>item.name.trim() && text.toLowerCase().includes(item.name.toLowerCase()));
  return exact.length ? exact : items.filter(item=>kindWords[item.kind].test(text));
}

export function explicitTargets(context:LayoutContext,text:string):Item[] {
  const identified=context.items.find(item=>item.id===context.confirmedId);
  if(identified) return [identified];
  const selected=context.items.filter(item=>context.selectedIds.includes(item.id));
  const clause=moveClause(text);
  if(!clause) return [];
  const objectPhrase=clause.match(/把\s*(.+?)(?:移动|平移|调整|挪|移到|移开|搬|放到|换个位置)/)?.[1]
    ?? clause.split(/(?:到|至|靠近|离开|远离|\s(?:next to|closer to|away from|near|to|beside)\s)/i)[0];
  const matches=namedItems(context.items,objectPhrase);
  const selectedMatch=selected.filter(item=>matches.some(match=>match.id===item.id));
  if(selectedMatch.length===1) return selectedMatch;
  if(!matches.length && /这[个件把张套只]|它|\bthis\b|\bit\b/i.test(objectPhrase))return selected;
  return matches;
}

export function protectedIds(context:LayoutContext,text:string) {
  const preserves = splitClauses(`${text}，${context.custom}`)
    .filter(clause=>/(?:不动|不移|不要动|别动|不移动|不用动|保持|保留|原位|\bkeep\b|\bleave\b|\bdon't move\b|\bdo not move\b)/i.test(clause));
  const mentioned = preserves.flatMap(clause=>{
    const matches=namedItems(context.items,clause);
    return matches.length ? matches : /这[个件把张套只]|它|\bthis\b|\bit\b/i.test(clause)
      ? context.items.filter(item=>context.selectedIds.includes(item.id)) : [];
  });
  return new Set([...context.items.filter(item=>item.locked),...mentioned].map(item=>item.id));
}

/** Human-facing labels stay unique even when names repeat. The ID is the action target. */
export function itemLabel(items:Item[],id:string) {
  const item=items.find(candidate=>candidate.id===id);
  if(!item) return '家具';
  const group=items.filter(candidate=>candidate.name===item.name);
  return group.length===1 ? item.name : `${item.name} ${group.findIndex(candidate=>candidate.id===id)+1}`;
}

export function doorLabel(door:Door,doors:Door[]) {
  const sameWall=doors.filter(candidate=>candidate.wall===door.wall).sort((a,b)=>a.offset-b.offset);
  const name=`${wallLabels[door.wall]}墙房门`;
  return sameWall.length===1?name:`${name} ${sameWall.findIndex(candidate=>candidate.id===door.id)+1}`;
}

function placementCheck(house:House,roomId:string,move:Move):string | undefined {
  const room=house.rooms.find(candidate=>candidate.id===roomId);
  const item=house.items.find(candidate=>candidate.id===move.itemId && candidate.roomId===roomId);
  if(!room || !item) return '当前房间里没有这件家具。';
  if(item.locked) return '这件家具已锁定。';
  if(!Number.isFinite(move.x) || !Number.isFinite(move.z)) return '目标位置无效。';
  const target={...item,x:move.x,z:move.z};
  if(!itemInsideRoom(target,room)) return '目标位置超出墙内边界。';
  const footprint=corners(target);
  const hit=house.items.find(other=>other.id!==item.id && other.roomId===roomId && polygonOverlap(footprint,corners(other)));
  if(hit) return `目标位置与${hit.name}重叠。`;
  if(house.doors.some(door=>itemBlocksDoor(house,target,door))) return '目标位置占用房门开启区域。';
}

export function applyLayoutMove(house:House,roomId:string,move:Move):{house:House} | {error:string} {
  const error=placementCheck(house,roomId,move);
  if(error) return {error};
  return {house:{...house,items:house.items.map(item=>item.id===move.itemId?{...item,x:move.x,z:move.z}:item)}};
}

/** Validate all final positions together so that exchanges and shared moves are atomic. */
export function applyLayoutChanges(house:House,roomId:string,changes:readonly Move[],preserveIds:readonly string[]=[]):{house:House}|{error:string} {
  if(!changes.length)return {error:'这套方案没有可应用的位置变化。'};
  const room=house.rooms.find(candidate=>candidate.id===roomId);
  if(!room)return {error:'找不到当前房间。'};
  if(!changes.every(isMove))return {error:'方案包含无效位置。'};
  const byId=new Map(changes.map(move=>[move.itemId,move]));
  if(byId.size!==changes.length)return {error:'方案包含重复家具。'};
  const items=house.items.filter(item=>item.roomId===roomId);
  for(const id of byId.keys()){
    const item=items.find(candidate=>candidate.id===id);
    if(!item)return {error:'方案包含其他房间或已删除的家具。'};
    if(item.locked||preserveIds.includes(id))return {error:`${itemLabel(items,id)}需要保持原位。`};
  }
  const next={...house,items:house.items.map(item=>{
    const move=byId.get(item.id);
    return move?{...item,x:move.x,z:move.z}:item;
  })};
  const finalItems=next.items.filter(item=>item.roomId===roomId);
  for(const [index,item] of finalItems.entries()){
    if(!itemInsideRoom(item,room))return {error:`${itemLabel(items,item.id)}超出墙内边界。`};
    if(next.doors.some(door=>itemBlocksDoor(next,item,door)))return {error:`${itemLabel(items,item.id)}占用房门开启范围。`};
    const overlap=finalItems.slice(index+1).find(other=>polygonOverlap(corners(item),corners(other)));
    if(overlap)return {error:`${itemLabel(items,item.id)}与${itemLabel(items,overlap.id)}重叠。`};
  }
  return {house:next};
}

export function exactRelativeMove(context:LayoutContext,itemId:string,question:string):Advice|undefined {
  const directions={东:[1,0],西:[-1,0],南:[0,1],北:[0,-1]} as const;
  const offsets=[...question.matchAll(/(?:往|向|朝)\s*([东西南北])(?:面|边|侧)?\s*(?:平移|移动|挪动?|移)?\s*(\d+(?:\.\d+)?)\s*(毫米|厘米|公分|米|mm|cm|m)(?![a-z])/gi)];
  const item=context.items.find(candidate=>candidate.id===itemId);
  if(!item||offsets.length!==1)return;
  const offset=offsets[0],start=offset.index;
  if(/最多|至多|至少|不超过|大约|大概/.test(question.slice(Math.max(0,start-8),start))||/^\s*(?:以内|左右)/.test(question.slice(start+offset[0].length)))return;
  const [,direction,quantity,unit]=offset;
  const meters=Number(quantity)/(/^(毫米|mm)$/i.test(unit)?1000:/^(厘米|公分|cm)$/i.test(unit)?100:1);
  const [east,south]=directions[direction as keyof typeof directions];
  const name=itemLabel(context.items,item.id);
  if(!meters)return {kind:'text',reply:`${name}已在指定位置。`};
  const move={itemId,x:item.x+east*meters,z:item.z+south*meters};
  const error=placementCheck(contextHouse(context),context.room.id,move);
  if(error)return {kind:'text',reply:`无法按指定距离移动${name}。${error}`};
  return makeLayoutProposal(context,{goal:'position'},[move],`向${direction}平移 ${quantity} ${unit}，其他位置和朝向保持原样。`);
}

export function placementBounds(room:LayoutContext['room'],item:Item) {
  const footprint=corners({...item,x:0,z:0});
  const xOffsets=footprint.map(point=>point[0]),zOffsets=footprint.map(point=>point[1]);
  const minX=room.x-room.w/2+WALL_INSET-Math.min(...xOffsets);
  const maxX=room.x+room.w/2-WALL_INSET-Math.max(...xOffsets);
  const minZ=room.z-room.d/2+WALL_INSET-Math.min(...zOffsets);
  const maxZ=room.z+room.d/2-WALL_INSET-Math.max(...zOffsets);
  if(minX>maxX||minZ>maxZ)return;
  return {minX,maxX,minZ,maxZ};
}

export function nearestDoorClearanceMove(house:House,room:LayoutContext['room'],item:Item):Move|undefined {
  const bounds=placementBounds(room,item);
  if(!bounds)return;
  const {minX,maxX,minZ,maxZ}=bounds;
  // Bound the search in large imported rooms and include the legal positions flush with a wall.
  const step=Math.max(.025,(maxX-minX)/100,(maxZ-minZ)/100);
  function axis(min:number,max:number,origin:number){
    const coordinates=new Set([min,max]);
    for(let offset=Math.ceil((min-origin)/step);offset<=Math.floor((max-origin)/step);offset++){
      coordinates.add(origin+offset*step);
    }
    return [...coordinates];
  }
  const candidates=axis(minX,maxX,item.x).flatMap(x=>axis(minZ,maxZ,item.z).map(z=>({
    move:{itemId:item.id,x,z},distance:Math.hypot(x-item.x,z-item.z),
  })));
  candidates.sort((first,second)=>first.distance-second.distance);
  return candidates.find(({move})=>!placementCheck(house,room.id,move))?.move;
}

export type GoalRequest = {goal:Goal; itemId:string; anchorId?:string; target?:{x:number;z:number}; wall?:Door['wall']; windowId?:string};
type MovePurpose = Omit<GoalRequest,'itemId'>;

const wallLabels={north:'北',south:'南',east:'东',west:'西'} as const;
const wallWords={北:'north',南:'south',东:'east',西:'west'} as const;

export function wallReference(context:LayoutContext,text:string):Pick<GoalRequest,'wall'|'windowId'>|undefined {
  const window=text.match(/([东西南北])(?:墙|侧|面|边)?(?:的)?(?:窗户|窗口|窗)|(?:窗户|窗口|窗)(?:边|旁|附近|一侧)|(?:靠近|靠|贴|到)窗(?:户|口)?/);
  const wall=text.match(/([东西南北])墙/)?.[1];
  if(window){
    const direction=window[1]??wall;
    const targetWall=direction?wallWords[direction as keyof typeof wallWords]:undefined;
    const matches=context.windows.filter(candidate=>!targetWall||candidate.wall===targetWall);
    return {wall:targetWall,windowId:matches.length===1?matches[0].id:''};
  }
  if(wall)return {wall:wallWords[wall as keyof typeof wallWords]};
}

export function wallPlacementAdvice(context:LayoutContext,request:GoalRequest):Advice {
  const text=(reply:string):Advice=>({kind:'text',reply});
  const {room,items,windows}=context;
  const item=items.find(candidate=>candidate.id===request.itemId);
  if(!item||item.locked)return text('这件家具当前不可移动。请选择未锁定的家具。');
  const window=windows.find(candidate=>candidate.id===request.windowId);
  if(request.windowId!==undefined&&!window){
    const matches=windows.filter(candidate=>!request.wall||candidate.wall===request.wall);
    return text(matches.length?'请确认你想靠哪一扇窗。':`当前房间${request.wall?`${wallLabels[request.wall]}墙`:''}没有已标注的窗口。`);
  }
  const wall=window?.wall??request.wall;
  if(!wall)return text('请指出家具要靠哪一侧墙面或哪一扇窗。');
  const name=itemLabel(items,item.id);
  const label=`${wallLabels[wall]}墙${window?'窗口一侧':''}`;
  const bounds=placementBounds(room,item);
  if(!bounds)return text(`${name}以当前朝向放不进墙内。`);
  const alongX=wall==='north'||wall==='south';
  const normal={north:bounds.minZ,south:bounds.maxZ,east:bounds.maxX,west:bounds.minX}[wall];
  const alongOriginal=alongX?item.x:item.z;
  const desired=window?(alongX?room.x:room.z)+window.offset:alongOriginal;
  const minimum=alongX?bounds.minX:bounds.minZ;
  const maximum=alongX?bounds.maxX:bounds.maxZ;
  const anchor=Math.max(minimum,Math.min(maximum,desired));
  const step=Math.max(.025,(maximum-minimum)/150);
  const points=new Set([minimum,maximum,anchor]);
  for(let offset=Math.ceil((minimum-anchor)/step);offset<=Math.floor((maximum-anchor)/step);offset++)points.add(anchor+offset*step);
  const makeMove=(position:number):Move=>({itemId:item.id,x:alongX?position:normal,z:alongX?normal:position});
  const coversWindow=(position:number)=>{
    if(!window)return true;
    const outline=corners({...item,...makeMove(position)}).map(point=>point[alongX?0:1]);
    return Math.min(...outline)<desired+window.width/2-.05&&Math.max(...outline)>desired-window.width/2+.05;
  };
  const house=contextHouse(context);
  const neighbors=items.filter(other=>other.id!==item.id);
  const candidates=[...points].flatMap(position=>{
    const move=makeMove(position);
    if(!coversWindow(position)||placementCheck(house,room.id,move))return [];
    const candidate={...item,...move};
    const nearestGap=Math.min(...neighbors.map(other=>footprintGap(candidate,other)));
    // Prefer a little room between furniture while keeping every legal point eligible.
    const score=Math.abs(position-desired)+1.5*Math.max(0,.15-nearestGap);
    return [{move,score}];
  });
  candidates.sort((a,b)=>a.score-b.score||Math.hypot(a.move.x-item.x,a.move.z-item.z)-Math.hypot(b.move.x-item.x,b.move.z-item.z));
  const move=candidates[0]?.move;
  if(!move){
    const conflict=placementCheck(house,room.id,makeMove(anchor));
    return text(`在${label}没有找到能放下${name}的落点。${conflict?`最接近目标的点：${conflict}`:'可以试其他墙面，或先腾出该处空间。'}`);
  }
  if(Math.hypot(move.x-item.x,move.z-item.z)<.015)return text(`${name}已经在${label}，可以保留原位。`);
  return makeLayoutProposal(context,{goal:'wall',wall,windowId:window?.id},[move],`已找到${label}可放下${name}的位置，可以预览。`);
}

function distanceToItem(x:number,z:number,item:Item) {
  const angle=item.rotation*Math.PI/180,dx=x-item.x,dz=z-item.z;
  const localX=Math.abs(dx*Math.cos(angle)-dz*Math.sin(angle))-item.w/2;
  const localZ=Math.abs(dx*Math.sin(angle)+dz*Math.cos(angle))-item.d/2;
  return Math.hypot(Math.max(0,localX),Math.max(0,localZ))+Math.min(0,Math.max(localX,localZ));
}

function toFrame(anchor:Item,x:number,z:number) {
  const angle=anchor.rotation*Math.PI/180;
  const dx=x-anchor.x,dz=z-anchor.z;
  return {lateral:dx*Math.cos(angle)-dz*Math.sin(angle),depth:dx*Math.sin(angle)+dz*Math.cos(angle)};
}

export function footprintGap(first:Item,second:Item) {
  const firstCorners=corners(first),secondCorners=corners(second);
  if(polygonOverlap(firstCorners,secondCorners))return 0;
  return Math.max(0,Math.min(...firstCorners.map(([x,z])=>distanceToItem(x,z,second)),...secondCorners.map(([x,z])=>distanceToItem(x,z,first))));
}

const centimeters=(meters:number)=>Math.round(meters*100+1e-7);

function measureMove(items:Item[],item:Item,move:Move,finalPositions?:ReadonlyMap<string,Move>) {
  const projected={...item,x:move.x,z:move.z};
  return {
    itemId:item.id,
    eastCm:centimeters(move.x-item.x),
    southCm:centimeters(move.z-item.z),
    nearbyGaps:items.filter(other=>other.id!==item.id).map(other=>({
      itemId:other.id,
      beforeCm:centimeters(footprintGap(item,other)),
      afterCm:centimeters(footprintGap(projected,{...other,...finalPositions?.get(other.id)})),
    })).filter(gap=>Math.min(gap.beforeCm,gap.afterCm)<=200),
  };
}

export function measurePreviousSuggestion(context:LayoutContext) {
  const move=context.previousSuggestion?.move;
  const item=context.items.find(candidate=>candidate.id===move?.itemId);
  if(move&&item)return measureMove(context.items,item,move);
}

export function measurePreviousRoomSuggestion(context:LayoutContext) {
  const plan=context.previousRoomSuggestion;
  if(!plan)return;
  const finalPositions=new Map(plan.changes.map(move=>[move.itemId,move]));
  return context.items.flatMap(item=>{
    const move=finalPositions.get(item.id);
    return move?[measureMove(context.items,item,move,finalPositions)]:[];
  });
}

function cmLabel(value:number) {
  return value>=100?`${+(value/100).toFixed(2)} 米`:`${value} 厘米`;
}

export function makeLayoutProposal(context:LayoutContext,purpose:MovePurpose,moves:Move[],reply:string):Advice {
  const house=contextHouse(context);
  const {room,items,doors}=context;
  const explanations=moves.map((move):MoveExplanation=>{
    const item=items.find(candidate=>candidate.id===move.itemId);
    if(!item)return {movement:'移动家具',reason:reply,impact:'其他家具保持原位。',details:[]};

    const {eastCm,southCm,nearbyGaps}=measureMove(items,item,move);
    const horizontal=eastCm>0?'东':'西';
    const vertical=southCm>0?'南':'北';
    const directions=[
      eastCm?`向${horizontal} ${cmLabel(Math.abs(eastCm))}`:'',
      southCm?`向${vertical} ${cmLabel(Math.abs(southCm))}`:'',
    ].filter(Boolean);
    const total=centimeters(Math.hypot(move.x-item.x,move.z-item.z));
    const movement=directions.length>1?`向${horizontal}${vertical}平移约 ${cmLabel(total)}`:directions[0]??'微调位置';
    const projected={...item,x:move.x,z:move.z};
    const reference=items.find(other=>other.id===purpose.anchorId);
    const cleared=doors.filter(door=>itemBlocksDoor(house,item,door)&&!itemBlocksDoor(house,projected,door));
    const affectedDoors=cleared.map(door=>doorLabel(door,doors));
    const remaining=[...new Set(cleared.flatMap(door=>items.filter(other=>other.id!==item.id&&itemBlocksDoor(house,other,door))))];

    let reason=reply;
    if(cleared.length){
      const label=affectedDoors.length===1?affectedDoors[0]:`${cleared.length} 扇房门`;
      reason=`当前位置占用${label}的开启范围，移动后可避开门扇。`;
    }else if(purpose.goal==='center'){
      const before=centimeters(Math.max(0,distanceToItem(room.x,room.z,item)));
      const after=centimeters(Math.max(0,distanceToItem(room.x,room.z,projected)));
      reason=`房间中心到家具占地的距离由 ${cmLabel(before)} 增至 ${cmLabel(after)}。`;
    }else if(purpose.goal==='door'){
      const distanceToDoor=(candidate:Item)=>centimeters(Math.max(0,Math.min(...doors.map(door=>{
        const frame=doorFrame(house,door);
        return distanceToItem(frame.x,frame.z,candidate);
      }))));
      if(doors.length)reason=`放置后离最近门口更远，地面距离由 ${cmLabel(distanceToDoor(item))} 增至 ${cmLabel(distanceToDoor(projected))}。`;
    }else if(purpose.goal==='position'){
      const target=purpose.target;
      const offset=target?centimeters(Math.hypot(move.x-target.x,move.z-target.z)):0;
      reason=offset?`这个位置更接近目标点，距目标约 ${cmLabel(offset)}，且可放下这件家具。`
        :'这个位置符合指定的移动要求，且通过墙内边界、重叠和挡门检查。';
    }else if(purpose.goal==='wall'&&purpose.wall){
      reason=`落点位于${wallLabels[purpose.wall]}墙${purpose.windowId?'窗口一侧':'内侧'}，已通过重叠和挡门检查。`;
    }else if(purpose.goal==='align'&&reference){
      const before=centimeters(Math.abs(toFrame(reference,item.x,item.z).lateral));
      const after=centimeters(Math.abs(toFrame(reference,move.x,move.z).lateral));
      reason=`与${itemLabel(items,reference.id)}的中心线偏差由 ${cmLabel(before)} 降至 ${cmLabel(after)}。`;
    }else if(purpose.goal==='conversation'&&reference){
      reason=`调整与${itemLabel(items,reference.id)}的会客间距，保留原来的相对方位。`;
    }

    const orderedGaps=nearbyGaps.sort((a,b)=>a.afterCm-b.afterCm);
    const namedGap=orderedGaps.find(gap=>gap.itemId===purpose.anchorId)??orderedGaps[0];
    const gapText=({itemId,beforeCm,afterCm}:typeof nearbyGaps[number])=>{
      const name=itemLabel(items,itemId);
      return `与${name}最近间距${beforeCm===afterCm?`仍约 ${cmLabel(afterCm)}`:`由约 ${cmLabel(beforeCm)} 变为 ${cmLabel(afterCm)}`}。`;
    };
    const remainingNames=remaining.map(other=>itemLabel(items,other.id));
    const impact=remainingNames.length
      ? `其他家具保持原位，${remainingNames.length===1?remainingNames[0]:`另有 ${remainingNames.length} 件家具`}仍占用开门范围。`
      : cleared.length?'其他家具保持原位，涉及的开门范围已释放。'
      : namedGap?`其他家具保持原位，${gapText(namedGap)}`
      : '其他家具保持原位，目标位置已通过重叠和挡门检查。';
    const details=[
      `位移约 ${cmLabel(total)}${directions.length===2?`（${directions.join('、')}）`:''}，朝向保持原样。`,
      ...orderedGaps.slice(0,3).map(gapText),
    ];
    if(remainingNames.length)details.push(`${remainingNames.join('、')}仍占用相关开门范围。`);
    return {movement,reason,impact,details};
  });
  return {kind:'proposal',reply,moves,explanations};
}

function wallGaps(item:Item,room:LayoutContext['room']) {
  const points=corners(item),x=points.map(point=>point[0]),z=points.map(point=>point[1]);
  return [Math.min(...x)-(room.x-room.w/2),room.x+room.w/2-Math.max(...x),
    Math.min(...z)-(room.z-room.d/2),room.z+room.d/2-Math.max(...z)];
}

export function findLayoutMoves(context:LayoutContext, request:GoalRequest & {goal:Exclude<Goal,'wall'>}) {
  const {room,items,doors,preference}=context;
  const item=items.find(candidate=>candidate.id===request.itemId);
  if(!item || item.locked) return {reply:'这件家具当前不可移动。请选择未锁定的家具。',moves:[]};
  const house=contextHouse(context);
  const entrances=doors.map(door=>doorFrame(house,door));
  const seats=items.filter(other=>other.id!==item.id && (other.kind==='sofa' || other.kind==='chair'));
  const furnitureInUse=item.kind==='sofa' || item.kind==='chair' || item.kind==='table';
  const tables=items.filter(other=>other.id!==item.id && other.kind==='table');
  const arrangementAnchors=item.kind==='sofa'||item.kind==='chair' ? (tables.length?tables:seats) : seats;
  const closest=(objects:Item[])=>objects.reduce<Item|undefined>((best,other)=>
    !best||footprintGap(item,other)<footprintGap(item,best)?other:best,undefined);
  const socialAnchor=furnitureInUse?closest(arrangementAnchors):undefined;
  const alignAnchor=items.find(other=>other.id===request.anchorId && other.id!==item.id);
  const center=(candidate:Item)=>distanceToItem(room.x,room.z,candidate);
  const entry=(candidate:Item)=>entrances.length ? Math.min(...entrances.map(door=>distanceToItem(door.x,door.z,candidate))) : 0;
  // This interval is a ranking heuristic for the example furniture, not a walkway standard.
  const social=(candidate:Item)=>{
    if(!socialAnchor)return 0;
    const gap=footprintGap(candidate,socialAnchor);
    return -Math.max(0,.35-gap,gap-.65);
  };
  const originalSide=socialAnchor?toFrame(socialAnchor,item.x,item.z):undefined;
  const sideAxis=originalSide&&Math.abs(originalSide.depth)>=Math.abs(originalSide.lateral)?'depth':'lateral';
  const crossAxis=sideAxis==='depth'?'lateral':'depth';
  const originalWallGaps=wallGaps(item,room);
  function preservesArrangement(candidate:Item) {
    if(socialAnchor&&originalSide){
      const nextSide=toFrame(socialAnchor,candidate.x,candidate.z);
      if(Math.abs(originalSide[sideAxis])>=.1 && originalSide[sideAxis]*nextSide[sideAxis]<=0) return false;
      if(Math.abs(nextSide[crossAxis]-originalSide[crossAxis])>.25 && Math.abs(nextSide[crossAxis])>Math.abs(originalSide[crossAxis])) return false;
    }
    const gaps=wallGaps(candidate,room);
    return originalWallGaps.every((gap,index)=>gap>.30 || gaps[index]<=gap+.20);
  }
  if(request.goal==='door' && !entrances.length) return {reply:'当前房间没有已标注的房门。请先添加门的位置。',moves:[]};
  if(request.goal==='conversation' && !socialAnchor) return {reply:'当前家具缺少可参照的会客座位或桌几。请选择一件会客区家具，或指定落点。',moves:[]};
  if(request.goal==='align' && !alignAnchor) return {reply:'请说明要把哪件家具与哪件家具对齐。',moves:[]};
  if(request.goal==='position' && !request.target) return {reply:'请告诉我希望移到哪个位置，例如靠北墙或靠近窗边。',moves:[]};
  if(request.goal==='position' && request.target && (Math.abs(request.target.x-room.x)>room.w/2 || Math.abs(request.target.z-room.z)>room.d/2))
    return {reply:'目标位置超出当前房间。请指出房间内的墙面、窗边或家具作为参照。',moves:[]};
  const alignment=(candidate:Item)=>alignAnchor?-Math.abs(toFrame(alignAnchor,candidate.x,candidate.z).lateral):0;
  if(request.goal==='align' && alignAnchor && alignment(item)>=-.08)return {reply:`${itemLabel(items,item.id)}与${itemLabel(items,alignAnchor.id)}的中心线已经基本对齐，可以保留原位。`,moves:[]};
  const quality = request.goal==='center'?center : request.goal==='door'?entry : request.goal==='conversation'?social : request.goal==='align'?alignment
    : (candidate:Item)=>-Math.hypot(candidate.x-request.target!.x,candidate.z-request.target!.z);
  const previous=quality(item);
  const localAdjustment=request.goal==='align'||request.goal==='conversation';
  const score=(candidate:Item,distance:number)=>4*(quality(candidate)-previous)-(localAdjustment?1.5:.18)*distance
    +(preference==='passage'&&!localAdjustment?.9*(entry(candidate)-entry(item))+.35*(center(candidate)-center(item)):0)
    +(preference==='hosting'&&request.goal!=='align'?2*(social(candidate)-social(item)):0);
  const step=Math.max(.2,Math.max(room.w,room.d)/30);
  const points:{x:number;z:number}[]=[];
  if(request.target) points.push(request.target);
  if(request.goal==='align'&&alignAnchor){
    const radians=alignAnchor.rotation*Math.PI/180;
    const offset=toFrame(alignAnchor,item.x,item.z).lateral;
    points.push({x:item.x-offset*Math.cos(radians),z:item.z+offset*Math.sin(radians)});
  }
  if(request.goal==='conversation') {
    for(let dx=-8;dx<=8;dx++) {
      for(let dz=-8;dz<=8;dz++) points.push({x:item.x+dx/10,z:item.z+dz/10});
    }
  } else {
    for(let x=room.x-room.w/2;x<=room.x+room.w/2;x+=step) {
      for(let z=room.z-room.d/2;z<=room.z+room.d/2;z+=step) points.push({x,z});
    }
  }
  const candidates: {move:Move; score:number}[]=[];
  const initiallyBlocksDoor=doors.some(door=>itemBlocksDoor(house,item,door));
  for(const point of points) {
    const move={itemId:item.id,x:+point.x.toFixed(3),z:+point.z.toFixed(3)};
    const distance=Math.hypot(move.x-item.x,move.z-item.z);
    if(distance<(request.goal==='align'?.08:.15)) continue;
    if(request.goal==='position' && request.target && Math.hypot(move.x-request.target.x,move.z-request.target.z)>1) continue;
    const candidate={...item,x:move.x,z:move.z};
    if(request.goal==='conversation'&&(distance>.85||!preservesArrangement(candidate)))continue;
    if(request.goal==='align'&&(distance>1||alignment(candidate)<-.08))continue;
    if(!(request.goal==='door' && initiallyBlocksDoor) && quality(candidate)<previous+.05) continue;
    if(!placementCheck(house,room.id,move)) candidates.push({move,score:score(candidate,distance)});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const best=candidates[0]?.move;
  if(!best){
    const name=itemLabel(items,item.id);
    const reply=request.goal==='conversation'
      ? `${name}在保持原来这一侧的前提下，没有找到能改善会客间距的小幅移动。可以保留现状，或指定另一件家具。`
      : request.goal==='align' ? `在${name}附近没有找到能对齐且不挡门、不重叠的位置。可以保留现状，或换一个对齐参照。`
      : `${name}没有找到能改善这个目标的空位。墙边界、开门范围和其他家具需要同时留出。可以换一件家具或调整目标。`;
    return {reply,moves:[]};
  }
  const alternate=request.goal==='align'?undefined:candidates.find(candidate=>Math.hypot(candidate.move.x-best.x,candidate.move.z-best.z)>.45)?.move;
  const reason={center:'把这件家具移离房间中央，为中央活动区留出空间。',door:'把这件家具移到开门范围以外，为房门留出空间。',
    conversation:`小幅调整与${itemLabel(items,socialAnchor?.id??'')}的距离，家具仍在原来这一侧。`,
    align:`将这件家具和${itemLabel(items,alignAnchor?.id??'')}的中心线对齐。`,position:'在目标附近找一处容得下这件家具的空位。'}[request.goal];
  const anchorId=request.goal==='conversation'?socialAnchor?.id:request.anchorId;
  return {reply:reason,moves:alternate?[best,alternate]:[best],anchorId};
}
