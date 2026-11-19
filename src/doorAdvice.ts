import {contextHouse,doorLabel,itemLabel,makeLayoutProposal,namedItems,nearestDoorClearanceMove,protectedIds,type Advice,type LayoutContext} from './layoutAdvice';
import {itemBlocksDoor,type Door,type Item} from './model';

const wallWords={北:'north',南:'south',东:'east',西:'west'} as const;
const wallNames={north:'北',south:'南',east:'东',west:'西'};
const openingTopic=/(?:挡(?:住|着)?|卡住|撞到|碰到|磕到).{0,5}门|门.{0,18}(?:挡|撞|碰|磕|卡住|打不开|开不全|开到底|完全打开|开启范围|开启扇区|受阻)|开门.{0,12}(?:范围|扇区|撞|碰|磕|受阻)|门扇.{0,8}(?:开启|开合|旋转)|(?:clear|block(?:ing|ed)?).{0,16}door|door.{0,16}(?:swing|hit|blocked)/i;
const checkOnly=/只(?:想|需要)?(?:检查|看看|看一下|确认|判断)|(?:别|不要|不必|不用)(?:直接|真的|帮我)?(?:移动|调整|挪动?|改布局)\s*(?:任何家具|家具|东西|位置)?\s*(?=[，。！？；,!?;\n]|$)|不动任何|\b(?:just check|only check|don't move anything)\b/i;
const moveRequest=/挪开|移开|移走|让开|腾出|(?:把|帮我|请|能不能|可以|怎么).{0,16}(?:挪|搬|移动|移出|调整家具)|(?:挪|移)(?:动)?(?:多远|多少)|\b(?:move|reposition|clear)\b/i;
const leaveInPlace=/^(?:请|先|暂时)?(?:保留|不动|(?:别|不要|不必|不用)\s*(?:把|帮我|动|移动|挪|搬|调整))|(?:不动|别动|保留|保持)\s*(?:原位)?$/;
const statedDestination=/[往向朝][东南西北左右前后]|(?:放|挪|移|搬)到|(?:靠|贴)[东南西北]?墙|x\s*[:=]|\b(?:against|next to|north by|south by|west by|east by)\b/i;
const numberWithUnit='(\\d+(?:\\.\\d+)?)[ \\t]*(厘米|公分|毫米|米|cm|mm|m)(?![a-z])';
const movementLimit=new RegExp(`(?:最多|不超过|不能超过|至多|只(?:能|允许)?(?:挪|移动))(?:能|再|移动|挪|移|动|开|了|超过|\\s)*${numberWithUnit}`,'i');
const requestedWidth=new RegExp(`(?:至少|不少于|达到|保证|达到不了|能不能有)?\\s*${numberWithUnit}\\s*(?:的)?(?:净宽|通行宽度|门宽|宽度|宽的)`, 'i');

function asMeters(value:string,unit:string){
  return Number(value)/(/^(?:毫米|mm)$/i.test(unit)?1000:/^(?:厘米|公分|cm)$/i.test(unit)?100:1);
}

function statedDistance(question:string,modelValue:number|undefined){
  if(modelValue===undefined)return;
  const measurements=[...question.matchAll(new RegExp(numberWithUnit,'gi'))];
  if(measurements.some(([,number,unit])=>Math.abs(asMeters(number,unit)-modelValue)<1e-7)
    ||/[零〇一二两三四五六七八九十百千万]+\s*(厘米|公分|毫米|米)/.test(question))return modelValue;
}

function formatDistance(meters:number){
  return meters<1?`${Math.round(meters*100)} 厘米`:`${meters.toFixed(2)} 米`;
}

export function currentDoorStatus(context:LayoutContext){
  const house=contextHouse(context);
  return context.doors.map(door=>({door,
    blockers:context.items.filter(item=>itemBlocksDoor(house,item,door)),
  }));
}

function targetedItems(context:LayoutContext,question:string,actionClauses:string[]){
  const confirmed=context.items.find(item=>item.id===context.confirmedId);
  if(confirmed)return [confirmed];
  const named=namedItems(context.items,actionClauses.join('，'));
  const selected=context.items.filter(item=>context.selectedIds.includes(item.id));
  const selectedMatch=selected.filter(item=>named.includes(item));
  if(selectedMatch.length===1)return selectedMatch;
  if(named.length)return named;
  return /这[件个把张]|它|\bthis\b/i.test(question)?selected:[];
}

type DoorRequest={action:'check'|'move'; itemId?:string; wall?:Door['wall']; minimumWidth?:number; maximumMove?:number; preserveIds:string[]};

export function doorOpeningAdvice(context:LayoutContext,question:string,discussionOnly=false,request?:DoorRequest):Advice|undefined {
  const widthMatch=/(?:门洞|门口|房门|推车|轮椅|通行)/.test(question)?question.match(requestedWidth):null;
  const openingQuestion=openingTopic.test(question);
  if(!request&&!openingQuestion&&!widthMatch)return;
  const actionClauses=question.split(/[，。！？；,!?;\n]+/).map(clause=>clause.trim()).filter(clause=>!leaveInPlace.test(clause));
  const wantsMove=request?request.action==='move':!discussionOnly&&!checkOnly.test(question)&&actionClauses.some(clause=>moveRequest.test(clause));
  if(!request&&statedDestination.test(question))return;

  const text=(reply:string):Advice=>({kind:'text',reply});
  const requestedRoom=question.match(/(客厅|书房|主卧|次卧|卧室)(?:的)?(?:房门|门口|门洞|门扇|门)/)?.[1];
  if(!request&&requestedRoom&&!context.room.name.includes(requestedRoom)&&!(requestedRoom==='卧室'&&context.room.name.includes('卧'))){
    return text(`当前正在编辑${context.room.name}。请切换到${requestedRoom}后再检查那里的房门。`);
  }

  const {items,doors,room}=context;
  const direction=question.match(/([北南东西])(?:侧|边|面)?(?:墙(?:上的?)?)?\s*(?:房门|门洞|门扇|门)/)?.[1] as keyof typeof wallWords|undefined;
  const wall=request?request.wall:direction?wallWords[direction]:undefined;
  const statuses=currentDoorStatus(context).filter(({door})=>!wall||door.wall===wall);
  if(!statuses.length)return text(wall?`当前${room.name}的${wallNames[wall]}墙没有已标注的房门。`:`当前${room.name}没有已标注的房门。请先在户型中添加门的位置和开启方向。`);

  const names=(entries:Item[])=>entries.map(item=>itemLabel(items,item.id)).join('、');
  const openingSummary=statuses.map(({door,blockers})=>blockers.length
    ? `${doorLabel(door,doors)}的开启范围被${names(blockers)}占用`
    : `${doorLabel(door,doors)}的开启范围没有被家具占用`).join('。')+'。';
  const minimum=(widthMatch?asMeters(widthMatch[1],widthMatch[2]):undefined)??statedDistance(question,request?.minimumWidth);
  if(minimum!==undefined&&!wantsMove){
    const widths=statuses.map(({door})=>`${doorLabel(door,doors)}标注宽度为 ${formatDistance(door.width)}`).join('，');
    const narrow=statuses.filter(({door})=>door.width<minimum).map(({door})=>doorLabel(door,doors));
    const reason=narrow.length?`${narrow.join('、')}的标注宽度已小于 ${formatDistance(minimum)}，调整家具也无法达到该宽度。`
      :`这项检查只确认房门标注尺寸，门洞实际净宽和进门后的连续通行宽度仍需测量。`;
    return text(`${widths}。${reason}${openingQuestion?openingSummary:''}`);
  }

  const targets=request?items.filter(item=>item.id===request.itemId):targetedItems(context,question,actionClauses);
  const blockers=[...new Set(statuses.flatMap(status=>status.blockers))];
  const namedBlockers=targets.length?blockers.filter(item=>targets.includes(item)):blockers;
  if(!namedBlockers.length&&targets.length)return text(`${names(targets)}没有占用所检查房门的开启范围。${openingSummary}`);
  if(!wantsMove||!blockers.length)return text(openingSummary);
  if(!request&&targets.length>1&&/一起|同时|\btogether\b/i.test(question))return text(`${openingSummary}当前每次只能预览一件家具的位置。你希望先检查哪件家具的移法？`);

  const normalizeKeep=(text:string)=>text.replace(/(?:别|不要|不必|不用)(?:移动|挪|搬)/g,'不要动');
  const blocked=request?new Set([...request.preserveIds,...items.filter(item=>item.locked).map(item=>item.id)]):protectedIds({...context,custom:normalizeKeep(context.custom)},normalizeKeep(question));
  const movable=namedBlockers.filter(item=>!blocked.has(item.id));
  if(!movable.length){
    const reasons=namedBlockers.map(item=>`${itemLabel(items,item.id)}${item.locked?'已锁定':'需保持原位'}`).join('、');
    return text(`${openingSummary}${reasons}。要调整它的位置，请先解锁或修改保留条件。`);
  }
  if(movable.length>1)return {kind:'clarify',reply:`${openingSummary}你想先移哪一件？`,candidateIds:movable.map(item=>item.id)};

  const item=movable[0];
  const name=itemLabel(items,item.id);
  const move=nearestDoorClearanceMove(contextHouse(context),room,item);
  if(!move)return text(`${openingSummary}当前搜索没有找到${name}可以单独移入的合法空位。可以先调整别的家具，再重新检查。`);
  const distance=Math.hypot(move.x-item.x,move.z-item.z);
  const limit=question.match(movementLimit);
  const maxDistance=(limit?asMeters(limit[1],limit[2]):undefined)??statedDistance(question,request?.maximumMove);
  if(maxDistance!==undefined&&distance>maxDistance+1e-7){
    return text(`${openingSummary}找到的最近合法落点需要移动约 ${formatDistance(distance)}，超过你设的 ${formatDistance(maxDistance)}。`);
  }
  const remaining=statuses.flatMap(status=>{
    const other=status.blockers.filter(blocker=>blocker.id!==item.id);
    return other.length?`${doorLabel(status.door,doors)}仍有${names(other)}占用开启范围`:[];
  });
  return makeLayoutProposal(context,{goal:'door'},[move],`将${name}平移约 ${formatDistance(distance)} 后，它会离开房门开启范围。${remaining.length?`${remaining.join('，')}。`:''}`);
}
