import {doorOpeningAdvice} from '../src/doorAdvice';
import {exactRelativeMove,findLayoutMoves,isRecord,itemLabel,makeLayoutProposal,protectedIds,roomObjectives,wallPlacementAdvice,type Advice,type Goal,type LayoutContext,type RoomObjective} from '../src/layoutAdvice';
import {optimizeRoom,roomProposal} from '../src/roomLayout';

const modes=['discuss','clarify','single','room','repeat','door'] as const;
const goals:readonly Goal[]=['center','door','conversation','position','align','wall'];
const walls=['north','south','east','west'] as const;
const directions={north:'北',south:'南',east:'东',west:'西'};

export function readLayoutIntent(content:string):Record<string,unknown>|undefined {
  try{
    const value:unknown=JSON.parse(content);
    if(isRecord(value)&&modes.some(mode=>mode===value.mode)
      &&(value.mode!=='room'||typeof value.reviewOnly==='boolean'))return value;
  }catch{return;}
}

function idsFrom(value:unknown,context:LayoutContext):string[]|undefined {
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>context.items.length
    ||!value.every(id=>typeof id==='string'&&context.items.some(item=>item.id===id)))return;
  return [...new Set(value as string[])];
}

const distance=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1000?value:undefined;

export function executeLayoutIntent(intent:Record<string,unknown>,context:LayoutContext,question:string):Advice {
  const text=(reply:string):Advice=>({kind:'text',reply});
  const reply=typeof intent.reply==='string'?intent.reply.trim().slice(0,4000):'';
  if(intent.mode==='discuss')return {kind:'text',reply:reply||'你想先了解当前布局的哪一部分？',
    keepSuggestion:!!(context.previousSuggestion||context.previousRoomSuggestion)};
  if(intent.mode==='clarify'){
    const candidates=idsFrom(intent.candidateIds,context);
    return candidates&&candidates.length>1
      ? {kind:'clarify',candidateIds:candidates,reply:reply||'你指的是哪件家具？'}
      : text(reply||'请告诉我想调整哪件家具或优先改善哪块空间。');
  }

  const namedPreserve=idsFrom(intent.preserveIds,context);
  const namedTargets=idsFrom(intent.itemIds,context);
  if(!namedPreserve||!namedTargets)return text('有家具无法对应到当前房间，请先在画布确认对象。');
  // Locks and explicit keep-in-place wording protect items even if the model omits a constraint.
  const blocked=new Set([...protectedIds(context,question),...namedPreserve]);
  const preserveIds=[...blocked];
  const selectedObjective=context.preference==='passage'?'door':context.preference==='hosting'?'hosting':'balanced';
  const objective=roomObjectives.find(value=>value===intent.objective)??selectedObjective;

  if(intent.mode==='room'){
    if(namedTargets.length){
      for(const item of context.items)if(!namedTargets.includes(item.id))blocked.add(item.id);
    }
    return optimizeRoom(context,objective,[...blocked],intent.reviewOnly===true);
  }
  if(intent.mode==='repeat'){
    const room=context.previousRoomSuggestion;
    if(room)return roomProposal(context,room.objective,room.changes,[...new Set([...room.preserveIds,...preserveIds])]);
    const move=context.previousSuggestion?.move;
    if(move&&!blocked.has(move.itemId))return makeLayoutProposal(context,{goal:'position',target:move},[move],'请预览上一次建议。');
    return text('当前没有可以继续的预览。请说明想调整哪件家具或哪块空间。');
  }

  const itemId=context.confirmedId??(typeof intent.itemId==='string'?intent.itemId:undefined);
  const item=context.items.find(value=>value.id===itemId);
  const wall=walls.find(value=>value===intent.wall);
  if(intent.mode==='door'){
    if(itemId&&!item)return text('当前房间找不到这件家具。');
    if(intent.action!=='check'&&intent.action!=='move')return text('你是想检查挡门情况，还是试着腾出开门范围？');
    return doorOpeningAdvice(context,question,intent.action==='check',{
      action:intent.action,itemId,wall,preserveIds,minimumWidth:distance(intent.minimumWidth),maximumMove:distance(intent.maximumMove),
    })??text('当前房间没有可以检查的房门。');
  }
  if(!item)return text('请告诉我想调整哪件家具，也可以先在画布选中它。');
  if(blocked.has(item.id))return text(`${itemLabel(context.items,item.id)}${item.locked?'已锁定':'需要保持原位'}。你可以选择其他家具。`);
  const goal=goals.find(value=>value===intent.goal);
  if(!goal)return text('请说明怎么调整，例如靠墙、给中央留空，或给出移动方向和距离。');
  const exact=exactRelativeMove(context,item.id,question);
  if(exact)return exact;
  if(goal==='wall'){
    const windowId=typeof intent.windowId==='string'?intent.windowId:undefined;
    return wallPlacementAdvice(context,{goal,itemId:item.id,wall,windowId});
  }
  if(goal==='position'&&wall&&distance(intent.distance)!==undefined){
    const relative=exactRelativeMove(context,item.id,`向${directions[wall]}平移${intent.distance}米`);
    if(relative)return relative;
  }
  const target=isRecord(intent.target)&&typeof intent.target.x==='number'&&Number.isFinite(intent.target.x)
    &&typeof intent.target.z==='number'&&Number.isFinite(intent.target.z)?{x:intent.target.x,z:intent.target.z}:undefined;
  const anchorId=typeof intent.anchorId==='string'?intent.anchorId:undefined;
  const result=findLayoutMoves(context,{itemId:item.id,goal,anchorId,target});
  return result.moves.length?makeLayoutProposal(context,{goal,anchorId:result.anchorId,target},result.moves,result.reply):text(result.reply);
}
