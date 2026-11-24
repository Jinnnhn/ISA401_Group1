import {doorLabel,itemLabel} from './layoutAdvice';
import {warnings,type House,type Room} from './model';
import {accessLabel,assessRoomUse,frontTarget,passageWidth} from './roomUsability';
import {chairSurfacePairs} from './roomLayout';

export type ReviewIssue={id:string; message:string};
export type RoomViews={plan:string; perspective:string};
export const maxViewLength=140_000;
export const roomReviewQuestion='请检查当前房间的整体布局。说明哪些地方适合保留、最值得改的一处和调整的取舍。有可行方案时请提供预览。';

export function reviewRoom(house:House,room:Room){
 const items=house.items.filter(item=>item.roomId===room.id);
 const doors=house.doors.filter(door=>door.roomId===room.id);
 const use=assessRoomUse(house,room);
 const warningsById=warnings({...house,items,doors});
 const issues:ReviewIssue[]=[];
 for(const item of items){
  const reasons=warningsById[item.id];
  if(reasons?.length)issues.push({id:item.id,message:`${itemLabel(items,item.id)}：${reasons.join('、')}`});
 }
 for(const {door,reachable} of use.passages){
  if(reachable)continue;
  const name=doorLabel(door,doors);
  issues.push({id:door.id,message:door.width<passageWidth
   ?`${name}的标注门宽小于 ${Math.round(passageWidth*100)} 厘米。`
   :`从${name}到房间中央未检出约 ${Math.round(passageWidth*100)} 厘米宽的通路。`});
 }
 const seats=use.seats.map(({item,depth})=>({
  itemId:item.id, freeDepthCm:Math.round(depth*100), capped:depth>=.8,
  targetCm:Math.round(frontTarget(item)*100), sufficient:depth+.01>=frontTarget(item),
 }));
 for(const seat of seats){
  if(!seat.sufficient)issues.push({id:seat.itemId,message:`${itemLabel(items,seat.itemId)}前方可用深度约 ${seat.freeDepthCm} 厘米，入座空间偏小。`});
 }
 const furnitureAccess=use.access.map(({item,kind,depth,target})=>({
  itemId:item.id,use:accessLabel[kind],freeDepthCm:Math.round(depth*100),
  targetCm:Math.round(target*100),sufficient:depth+.01>=target,
 }));
 for(const access of furnitureAccess)if(!access.sufficient){
  issues.push({id:access.itemId,message:`${itemLabel(items,access.itemId)}的${access.use}空间偏小，当前约 ${access.freeDepthCm} 厘米。`});
 }
 const surfaces=[...chairSurfacePairs(items).values()];
 const chairToTable=surfaces.filter(pair=>pair.kind==='table').map(({chairId,surfaceId,gap,facing})=>({
  chairId,tableId:surfaceId,edgeGapCm:Math.round(gap*100),facesTable:facing,
 }));
 const chairToDesk=surfaces.filter(pair=>pair.kind==='desk').map(({chairId,surfaceId,gap,facing})=>({
  chairId,deskId:surfaceId,edgeGapCm:Math.round(gap*100),facesDesk:facing,
 }));
 return {issues,seats,furnitureAccess,chairToTable,chairToDesk,passageProbeCm:Math.round(passageWidth*100),
  passages:use.passages.map(({door,reachable})=>({doorId:door.id,reachable})),
  warningItemCount:items.filter(item=>warningsById[item.id]).length};
}
