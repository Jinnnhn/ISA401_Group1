import {applyLayoutChanges,contextHouse,doorLabel,footprintGap,itemLabel,placementBounds,type Advice,type LayoutContext,type Move,type MoveExplanation,type RoomObjective} from './layoutAdvice';
import {corners,doorSweep,itemInsideRoom,polygonOverlap,warnings,type Item} from './model';
import {accessLabel,assessRoomUse,frontTarget,furnitureAccessLoss,isSeat,passageLoss,passageWidth,seatingLoss,seatObstructionPenalty,seatWallPenalty,tableRelationship} from './roomUsability';

const objectiveLabels:Record<RoomObjective,string>={
  balanced:'兼顾家具使用、取放和进出通行',
  center:'保留入座和通行空间，增加中央留白',
  door:'清出门扇开启范围，改善进门通行',
  hosting:'改善入座空间和茶几摆放',
};

type Footprint=ReturnType<typeof corners>;
type Placement={item:Item; shape:Footprint; center:bigint; distance:number; cost:number; wallPenalty:number};
type State={places:Placement[]; center:bigint; cost:number; useCost:number; rank:number};
type RoomUse=ReturnType<typeof assessRoomUse>;
type ChairSurfacePair={chairId:string;surfaceId:string;kind:'table'|'desk';gap:number;facing:boolean;target:number};

const gridSize=12;
const chairReachSlack=.035;
const floorArea=(value:number)=>`${value.toFixed(2)} 平方米`;
const distanceLabel=(value:number)=>value<1?`${Math.round(value*100)} 厘米`:`${value.toFixed(2)} 米`;

function countCells(cells:bigint){
  let count=0;
  for(let value=cells;value;value&=value-1n)count++;
  return count;
}

function centerMeasure(room:LayoutContext['room']){
  const width=room.w*.3, depth=room.d*.3;
  const cells=Array.from({length:gridSize*gridSize},(_,index)=>[
    room.x-width/2+(index%gridSize+.5)*width/gridSize,
    room.z-depth/2+(Math.floor(index/gridSize)+.5)*depth/gridSize,
  ]);
  const mask=(item:Item)=>{
    const angle=item.rotation*Math.PI/180, cos=Math.cos(angle), sin=Math.sin(angle);
    let result=0n;
    for(const [index,[x,z]] of cells.entries()){
      const dx=x-item.x,dz=z-item.z;
      if(Math.abs(dx*cos-dz*sin)<item.w/2&&Math.abs(dx*sin+dz*cos)<item.d/2)result|=1n<<BigInt(index);
    }
    return result;
  };
  return {mask,area:width*depth,occupied:(bits:bigint)=>countCells(bits)*width*depth/cells.length};
}

function facesTable(chair:Item,table:Item){
  const {forward,side}=tableRelationship(chair,table);
  return forward>=side*.18;
}

export function chairSurfacePairs(items:Item[]){
  const surfaces=items.filter(item=>item.kind==='table'||item.kind==='desk');
  const sofas=items.filter(item=>item.kind==='sofa');
  const pairs=new Map<string,ChairSurfacePair>();
  for(const chair of items.filter(item=>item.kind==='chair')){
    const candidates=surfaces.flatMap(surface=>{
      const gap=footprintGap(chair,surface);
      const nearby=gap<=.80||(surface.kind==='table'&&gap<=1.20
        &&sofas.some(sofa=>footprintGap(chair,sofa)<=.85&&footprintGap(sofa,surface)<=.85));
      if(!nearby)return [];
      const facing=facesTable(chair,surface);
      return [{surface,gap,facing,rank:gap+(facing?0:.20)}];
    });
    const nearest=candidates.sort((a,b)=>a.rank-b.rank)[0];
    if(!nearest)continue;
    const kind=nearest.surface.kind==='desk'?'desk':'table';
    pairs.set(chair.id,{chairId:chair.id,surfaceId:nearest.surface.id,kind,gap:nearest.gap,facing:nearest.facing,
      target:kind==='desk'?.42:.72});
  }
  return pairs;
}

function reducedRoomUse(context:LayoutContext,before:RoomUse,after:RoomUse,items:Item[],pairs:Iterable<ChairSurfacePair>){
  const seat=seatingLoss(before,after);
  if(seat)return `这个落点会缩小${itemLabel(context.items,seat.item.id)}前方的可用空间。`;
  if(before.table&&after.table&&after.table.penalty>Math.max(.12,before.table.penalty+.045)){
    return '这个方案会让茶几偏离沙发正面，或者变得不方便取放。';
  }
  const lostAccess=furnitureAccessLoss(before.access,after.access);
  if(lostAccess)return `这个方案会挤窄${itemLabel(context.items,lostAccess.item.id)}的${accessLabel[lostAccess.kind]}空间。`;
  for(const pair of pairs){
    const chair=items.find(item=>item.id===pair.chairId)!;
    const table=items.find(item=>item.id===pair.surfaceId)!;
    const gap=footprintGap(chair,table);
    if(gap>Math.max(pair.target,pair.gap)+chairReachSlack||(pair.facing&&!facesTable(chair,table))){
      return `这个方案会让${itemLabel(context.items,chair.id)}与${itemLabel(context.items,table.id)}的相对位置不利于${pair.kind==='desk'?'坐下后使用书桌':'坐下后取放'}。`;
    }
  }
  const lost=passageLoss(before.passages,after.passages);
  if(lost)return `这个方案会缩窄${doorLabel(lost.door,context.doors)}通向房间中央的通路。`;
}

function remainingUseIssues(context:LayoutContext,use:RoomUse){
  const shortSeats=use.seats.filter(({item,depth})=>depth+.01<frontTarget(item));
  const seat=shortSeats.find(({item})=>item.kind==='sofa')??shortSeats[0];
  const route=use.passages.find(({reachable})=>!reachable);
  const notes=[];
  if(seat)notes.push(`${itemLabel(context.items,seat.item.id)}前方可用深度约 ${distanceLabel(seat.depth)}，入座空间仍偏小。`);
  if(use.table&&use.table.penalty>.12)notes.push('茶几与沙发前方的相对位置仍不便于取放。');
  for(const access of use.access)if(access.depth+.01<access.target){
    notes.push(`${itemLabel(context.items,access.item.id)}的${accessLabel[access.kind]}空间仍偏小。`);
  }
  if(route){
    const label=doorLabel(route.door,context.doors);
    notes.push(route.door.width<passageWidth
      ?`${label}的标注门宽约 ${distanceLabel(route.door.width)}，低于本次的 ${distanceLabel(passageWidth)} 通行检查宽度。`
      :`从${label}到房间中央未检出约 ${distanceLabel(passageWidth)} 宽的通路。`);
  }
  return notes.join('');
}

function passageConfirmation(use:RoomUse){
  return use.passages.length&&use.passages.every(result=>result.reachable)
    ?`按户型估计，从门口到房间中央有至少 ${distanceLabel(passageWidth)} 宽的通路。`
    :'';
}

function candidatePoints(item:Item,room:LayoutContext['room'],items:Item[]){
  const bounds=placementBounds(room,item);
  if(!bounds)return [];
  const axis=(min:number,max:number,origin:number)=>{
    const segments=Math.max(1,Math.min(10,Math.ceil((max-min)/.25)));
    return [...new Set([Math.max(min,Math.min(max,origin)),...Array.from({length:segments+1},(_,i)=>min+(max-min)*i/segments)])];
  };
  return [{x:item.x,z:item.z},...items.map(other=>({x:other.x,z:other.z})),
    ...axis(bounds.minX,bounds.maxX,item.x).flatMap(x=>axis(bounds.minZ,bounds.maxZ,item.z).map(z=>({x,z})))];
}

function explainChanges(context:LayoutContext,moves:Move[],after:Item[],beforeUse:RoomUse,afterUse:RoomUse,center:ReturnType<typeof centerMeasure>,pairs:Map<string,ChairSurfacePair>):MoveExplanation[]{
  const house=contextHouse(context), oldWarnings=warnings(house);
  return moves.map(move=>{
    const original=context.items.find(item=>item.id===move.itemId)!;
    const item=after.find(candidate=>candidate.id===move.itemId)!;
    const dx=item.x-original.x,dz=item.z-original.z;
    const direction=(Math.abs(dx)>.005?(dx>0?'东':'西'):'')+(Math.abs(dz)>.005?(dz>0?'南':'北'):'');
    const reasons=oldWarnings[item.id]??[];
    const oldSeat=beforeUse.seats.find(({item:seat})=>seat.id===item.id);
    const newSeat=afterUse.seats.find(({item:seat})=>seat.id===item.id);
    const improvedTable=beforeUse.table&&afterUse.table&&beforeUse.table.penalty>afterUse.table.penalty+.08
      &&(afterUse.sofa?.id===item.id||afterUse.table.item.id===item.id);
    let reason='为同一套摆放方案协调位置，避开其他家具和开门范围。';
    if(reasons.some(value=>value.includes('房门')))reason='原位置占用房门开启范围，移动后门扇可避开这件家具。';
    else if(reasons.some(value=>value.includes('重叠')))reason='原位置与其他家具重叠，移开后消除重叠。';
    else if(reasons.some(value=>value.includes('边界')))reason='移回墙内，留出足够的家具占地。';
    else if(oldSeat&&newSeat&&newSeat.depth>oldSeat.depth+.08)reason='给座位正面留出更多入座空间。';
    else if(improvedTable)reason='让茶几更靠近沙发正前方，方便坐下后取放物品。';
    else if(center.occupied(center.mask(original))-center.occupied(center.mask(item))>.03)reason='减少这件家具在房间中央的占用。';
    const linkedTable=pairs.get(item.id)?.surfaceId??(item.id===beforeUse.sofa?.id?beforeUse.table?.item.id:undefined);
    const linkedChair=[...pairs.values()].find(pair=>pair.surfaceId===item.id)?.chairId;
    const relevantId=linkedTable??linkedChair;
    const closest=after.filter(other=>other.id!==item.id&&(!relevantId||other.id===relevantId))
      .map(other=>({other,gap:footprintGap(item,other)})).sort((a,b)=>a.gap-b.gap)[0];
    let impact='最终位置通过家具重叠、墙内边界和开门范围检查。';
    if(closest&&closest.gap<2){
      const former=context.items.find(other=>other.id===closest.other.id)!;
      const before=footprintGap(original,former);
      impact=`与${itemLabel(context.items,former.id)}的最近间距${Math.abs(before-closest.gap)<.01?'保持约 '+distanceLabel(closest.gap):`从约 ${distanceLabel(before)} 变为 ${distanceLabel(closest.gap)}`}。`;
    }
    return {movement:`向${direction}平移约 ${distanceLabel(Math.hypot(dx,dz))}`,reason,impact,details:[]};
  });
}

export function roomProposal(context:LayoutContext,objective:RoomObjective,changes:Move[],preserveIds:string[]):Advice {
  const final=applyLayoutChanges(contextHouse(context),context.room.id,changes,preserveIds);
  if('error' in final)return {kind:'text',reply:final.error};
  const beforeUse=assessRoomUse(contextHouse(context),context.room);
  const afterUse=assessRoomUse(final.house,context.room);
  const chairPairs=chairSurfacePairs(context.items);
  const worse=reducedRoomUse(context,beforeUse,afterUse,final.house.items,chairPairs.values());
  if(worse)return {kind:'text',reply:`${worse}请按当前布局重新生成方案。`};
  const measure=centerMeasure(context.room);
  const occupied=(items:Item[])=>measure.occupied(items.reduce((mask,item)=>mask|measure.mask(item),0n));
  const before=occupied(context.items),after=occupied(final.house.items);
  const comparison=(objective==='center'||(!beforeUse.table&&!chairPairs.size&&!beforeUse.access.length))&&Math.abs(before-after)>=.025
    ?`中央区域的家具占用估计由 ${floorArea(before)} 变为 ${floorArea(after)}。`:'';
  const sofa=afterUse.seats.find(({item})=>item.id===afterUse.sofa?.id);
  const seat=sofa?`沙发前方可用深度${sofa.depth>=.8?'至少 ': '约 '}${distanceLabel(sofa.depth)}。`:'';
  const route=passageConfirmation(afterUse);
  const movedIds=new Set(changes.map(change=>change.itemId));
  const changedPair=[...chairPairs.values()].find(pair=>movedIds.has(pair.chairId)||movedIds.has(pair.surfaceId));
  const reach=changedPair?`${itemLabel(context.items,changedPair.chairId)}与${itemLabel(context.items,changedPair.surfaceId)}的边缘间距约 ${distanceLabel(footprintGap(
    final.house.items.find(item=>item.id===changedPair.chairId)!,final.house.items.find(item=>item.id===changedPair.surfaceId)!))}。`:'';
  const improvedAccess=beforeUse.access.flatMap(original=>{
    const after=afterUse.access.find(value=>value.item.id===original.item.id)!;
    return original.depth+.08<Math.min(after.depth,after.target)?[{original,after}]:[];
  })[0];
  const access=improvedAccess?`${itemLabel(context.items,improvedAccess.after.item.id)}的${accessLabel[improvedAccess.after.kind]}深度估计由 ${distanceLabel(improvedAccess.original.depth)} 增至${improvedAccess.after.depth>=.8?'至少 ': '约 '}${distanceLabel(improvedAccess.after.depth)}。`:'';
  const notes=remainingUseIssues(context,afterUse);
  return {kind:'roomProposal',objective,objectiveLabel:objectiveLabels[objective],preserveIds,changes,
    reply:`建议调整 ${changes.length} 件家具。${reach}${access}${seat}${route}${notes}${comparison}`,
    explanations:explainChanges(context,changes,final.house.items,beforeUse,afterUse,measure,chairPairs)};
}

export function optimizeRoom(context:LayoutContext,objective:RoomObjective,preserveIds:string[],evaluateOnly=false):Advice {
  const {room,items}=context,house=contextHouse(context);
  const text=(reply:string):Advice=>({kind:'text',reply});
  const baseline=warnings(house);
  const hasConflicts=Object.keys(baseline).length>0;
  const beforeUse=assessRoomUse(house,room);
  const chairPairs=chairSurfacePairs(items);
  const distantPair=[...chairPairs.values()].find(pair=>pair.gap>pair.target+.06);
  const pairIssue=distantPair?`${itemLabel(items,distantPair.chairId)}与${itemLabel(items,distantPair.surfaceId)}的间距偏大。`:'';
  const useIssues=remainingUseIssues(context,beforeUse)+pairIssue;
  const summary=hasConflicts?`当前${room.name}有 ${items.filter(item=>baseline[item.id]).length} 件家具涉及重叠、越界或挡门。`:'当前家具通过墙内边界、重叠和开门范围检查。';
  const fixed=items.filter(item=>item.locked||preserveIds.includes(item.id));
  const fixedWarnings=warnings({...house,items:fixed});
  const fixedIssue=fixed.find(item=>fixedWarnings[item.id]);
  if(fixedIssue)return text(`${summary}${itemLabel(items,fixedIssue.id)}需要保持原位，${fixedWarnings[fixedIssue.id][0]}。要消除这处冲突，请先调整它的保留条件。`);
  const label=objectiveLabels[objective];
  const keep=()=>text(useIssues
    ?`${summary}${useIssues}按当前朝向和保留条件，没有找到更合适的平移方案。可先调整朝向或重新指定要保留的家具。`
    :`${summary}${objective==='door'?passageConfirmation(beforeUse):''}按「${label}」检查，未找到明显改善，建议保留现状。你还想检查哪件家具，或看看其他摆法？`);
  const movable=items.filter(item=>!fixed.includes(item));
  if(objective==='hosting'&&!hasConflicts&&!items.some(isSeat))
    return text(`${summary}当前房间缺少可同时比较的座椅和桌几。你想先改善门口空间还是中央留白？`);
  if(!hasConflicts&&(!movable.length||(objective==='door'&&beforeUse.passages.every(result=>result.reachable))))return keep();

  const center=centerMeasure(room);
  const beforeBits=items.reduce((mask,item)=>mask|center.mask(item),0n);
  if(!hasConflicts&&objective!=='hosting'&&beforeBits===0n&&!useIssues)return keep();
  const doorShapes=context.doors.map(door=>doorSweep(house,door));
  const fixedShapes=fixed.map(corners);
  const hasFunction=!!beforeUse.table||chairPairs.size>0||beforeUse.access.length>0;
  const centerWeight=objective==='center'?.65:objective==='balanced'?hasFunction?.06:.45:0;
  const width=items.length>20?12:44;
  const fixedBits=fixed.reduce((mask,item)=>mask|center.mask(item),0n);
  const isMainPair=(first:Item,second:Item)=>first.id===beforeUse.sofa?.id&&second.id===beforeUse.table?.item.id;
  const pairPenalty=(first:Item,firstShape:Footprint,second:Item,secondShape:Footprint)=>{
    const tablePenalty=isMainPair(first,second)?tableRelationship(first,second).penalty
      :isMainPair(second,first)?tableRelationship(second,first).penalty:0;
    const firstPair=chairPairs.get(first.id),secondPair=chairPairs.get(second.id);
    const pair=firstPair?.surfaceId===second.id?firstPair:secondPair?.surfaceId===first.id?secondPair:undefined;
    const chair=pair?.chairId===first.id?first:second;
    const table=chair===first?second:first;
    const reachCost=pair?Math.max(0,footprintGap(chair,table)-pair.target)*.9+
      (pair.facing&&!facesTable(chair,table)?.5:0):0;
    return seatObstructionPenalty(first,firstShape,second,secondShape)*.8+Math.min(2,tablePenalty)+reachCost;
  };
  let states:State[]=[{places:[],center:fixedBits,cost:0,useCost:0,rank:centerWeight*center.occupied(fixedBits)}];
  const ordered=[...movable].sort((a,b)=>Number(!!baseline[b.id])-Number(!!baseline[a.id])||b.w*b.d-a.w*a.d);
  for(const item of ordered){
    const seen=new Set<string>();
    const candidates:Placement[]=[];
    for(const point of candidatePoints(item,room,items)){
      const key=`${point.x.toFixed(5)}:${point.z.toFixed(5)}`;
      if(seen.has(key))continue;
      seen.add(key);
      const candidate={...item,x:point.x,z:point.z},shape=corners(candidate);
      if(!itemInsideRoom(candidate,room)||doorShapes.some(door=>polygonOverlap(shape,door))||fixedShapes.some(obstacle=>polygonOverlap(shape,obstacle)))continue;
      const distance=Math.hypot(item.x-point.x,item.z-point.z);
      const cost=distance>.001?.12+.075*distance:0;
      candidates.push({item:candidate,shape,center:center.mask(candidate),distance,cost,wallPenalty:seatWallPenalty(candidate,room)});
    }
    const next:State[]=[];
    for(const state of states)for(const candidate of candidates){
      if(state.places.some(placed=>polygonOverlap(placed.shape,candidate.shape)))continue;
      const bits=state.center|candidate.center,cost=state.cost+candidate.cost;
      const places=[...state.places,candidate];
      const useCost=state.useCost+candidate.wallPenalty
        +fixed.reduce((sum,item,index)=>sum+pairPenalty(item,fixedShapes[index],candidate.item,candidate.shape),0)
        +state.places.reduce((sum,place)=>sum+pairPenalty(place.item,place.shape,candidate.item,candidate.shape),0);
      next.push({places,center:bits,cost,useCost,rank:cost+useCost+centerWeight*center.occupied(bits)});
    }
    next.sort((a,b)=>a.rank-b.rank||a.cost-b.cost);
    states=next.slice(0,width);
    if(!states.length)break;
  }
  const unresolved=()=>text(`${summary}在当前尺寸、朝向和保留条件下，这次搜索未找到整套合法位置。可以先处理${itemLabel(items,items.find(item=>baseline[item.id])!.id)}的冲突。`);
  if(!states.length)return hasConflicts?unresolved():keep();

  const minimumGain=Math.max(.12,center.area*.06);
  let candidate:State|undefined,bestScore=Infinity;
  for(const state of states){
    if(!state.places.some(place=>place.distance>.001))continue;
    const placed=[...fixed,...state.places.map(place=>place.item)];
    const afterUse=assessRoomUse({...house,items:placed},room);
    if(reducedRoomUse(context,beforeUse,afterUse,placed,chairPairs.values()))continue;
    const restored=afterUse.passages.filter(({door,reachable})=>reachable&&beforeUse.passages.some(result=>result.door.id===door.id&&!result.reachable)).length;
    const seatGain=afterUse.seats.reduce((sum,{item,depth})=>{
      const original=beforeUse.seats.find(seat=>seat.item.id===item.id)!.depth;
      return sum+Math.min(depth,frontTarget(item))-Math.min(original,frontTarget(item));
    },0);
    const tableGain=(beforeUse.table?.penalty??0)-(afterUse.table?.penalty??0);
    const chairGain=[...chairPairs.values()].reduce((sum,pair)=>{
      const chair=placed.find(item=>item.id===pair.chairId)!;
      const table=placed.find(item=>item.id===pair.surfaceId)!;
      return sum+Math.max(0,pair.gap-pair.target)-Math.max(0,footprintGap(chair,table)-pair.target);
    },0);
    const accessGain=afterUse.access.reduce((sum,result)=>{
      const original=beforeUse.access.find(value=>value.item.id===result.item.id)!;
      return sum+Math.min(result.depth,result.target)-Math.min(original.depth,original.target);
    },0);
    const centerGain=center.occupied(beforeBits)-center.occupied(state.center);
    const score=state.cost+state.useCost-centerWeight*centerGain-restored*2-seatGain-chairGain-accessGain;
    const prioritizeCenter=objective==='center'||(objective==='balanced'&&!hasFunction);
    const improves=(prioritizeCenter&&centerGain>=minimumGain&&centerWeight*centerGain>state.cost)
      ||seatGain>.08||tableGain>.18||chairGain>.15||accessGain>.10||restored>0;
    if((hasConflicts||improves)&&score<bestScore){candidate=state;bestScore=score;}
  }
  if(!candidate)return hasConflicts?unresolved():keep();
  const changes=candidate.places.filter(place=>place.distance>.001).map(({item})=>({itemId:item.id,x:item.x,z:item.z}));
  if(evaluateOnly)return text(`${summary}${useIssues}按「${label}」找到了一个可行调整，涉及 ${changes.length} 件家具。你想预览这套方案吗？`);
  return roomProposal(context,objective,changes,preserveIds);
}
