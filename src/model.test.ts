import {test} from 'node:test';
import assert from 'node:assert/strict';
import {alternateHouse,initialHouse,warnings,copy,corners,polygonOverlap,doorFrame,doorPoint,moveItems,validHouse,itemInsideRoom,roomOf,constrainHouse,WALL_INSET} from './model';
import {PerspectiveCamera,Vector3} from 'three';
import {bindRightOrbit} from './rightOrbit';
import {defaultWorkspace,restoreWorkspace} from './projects';
import {furnitureDragAction} from './selection';
import {roomHeight,doorHeight,windowHeight,windowSill,wallSections} from './architecture';
import {previewMove,addedConflicts,placeCopies} from './placement';
import {applyLayoutChanges,applyLayoutMove,exactRelativeMove,explicitTargets,findLayoutMoves,itemLabel,makeLayoutContext,makeLayoutProposal,measurePreviousRoomSuggestion,measurePreviousSuggestion,protectedIds,readLayoutContext,wallPlacementAdvice,wallReference} from './layoutAdvice';
import {currentDoorStatus,doorOpeningAdvice} from './doorAdvice';
import {executeLayoutIntent} from '../server/layout-intent';
import {optimizeRoom,roomProposal} from './roomLayout';
import {assessRoomUse,frontClearance,sofaClearance} from './roomUsability';

test('中央腾空也会拒绝朝墙且难以入座的沙发落点',()=>{
 const house=initialHouse(),room=roomOf(house,'living');
 const sofa=house.items.find(item=>item.id==='sofa')!,table=house.items.find(item=>item.id==='table')!;
 house.items=[sofa,table];
 Object.assign(sofa,{x:room.x,z:room.z+.65,rotation:180});
 Object.assign(table,{x:room.x,z:room.z-.75});
 const context=makeLayoutContext(house,'living',[],'balanced','');
 const bad=[{itemId:sofa.id,x:room.x,z:room.z-1.46},{itemId:table.id,x:room.x-1.94,z:room.z+.3}];
 assert.ok('house' in applyLayoutChanges(house,'living',bad));
 assert.ok(frontClearance(sofa,room,house.items)>=sofaClearance);
 const rejected=roomProposal(context,'center',bad,[]);
 assert.equal(rejected.kind,'text');
 assert.match(rejected.reply,/缩小皮木框架沙发前方的可用空间/);
 const result=optimizeRoom(context,'center',[]);
 if(result.kind==='roomProposal'){
  const applied=applyLayoutChanges(house,room.id,result.changes);
  assert.ok('house' in applied);
  const use=assessRoomUse(applied.house,room);
  assert.ok(use.seats[0].depth>=sofaClearance-.01);
  assert.ok(use.table&&use.table.penalty<=.12);
 }
});

test('茶几推到沙发侧面，即使入座宽裕也不能作为中央留白方案',()=>{
 const house=initialHouse(),room=roomOf(house,'living');
 const sofa=house.items.find(item=>item.id==='sofa')!,table=house.items.find(item=>item.id==='table')!;
 house.items=[sofa,table];
 Object.assign(sofa,{x:room.x-0.32,z:room.z+1.06,rotation:180});
 Object.assign(table,{x:sofa.x,z:room.z-.26});
 const context=makeLayoutContext(house,'living',[],'balanced','');
 const changes=[{itemId:table.id,x:room.x+2.09,z:room.z+1.06}];
 assert.ok('house' in applyLayoutChanges(house,room.id,changes));
 const rejected=roomProposal(context,'balanced',changes,[]);
 assert.equal(rejected.kind,'text');
 assert.match(rejected.reply,/茶几偏离沙发正面/);
});

test('进门后遇到狭窄瓶颈会拒绝方案，门扇仍可完全打开',()=>{
 const house=initialHouse(),room=roomOf(house,'living');
 Object.assign(room,{w:4,d:3});
 const door=house.doors.find(item=>item.id==='door-living')!;
 Object.assign(door,{offset:0,inward:false});
 house.doors=[door];
 const cabinet=house.items.find(item=>item.id==='cabinet')!;
 house.items=[cabinet];
 Object.assign(cabinet,{x:room.x+1.45,z:room.z,w:.35,d:2.46,rotation:0});
 const before=assessRoomUse(house,room);
 assert.equal(before.passages[0].reachable,true);
 const desired=[{itemId:cabinet.id,x:room.x-1.05,z:room.z}];
 const geometric=applyLayoutChanges(house,room.id,desired);
 assert.ok('house' in geometric);
 assert.equal(assessRoomUse(geometric.house,room).passages[0].reachable,false);
 const context=makeLayoutContext(house,'living',[],'passage','');
 assert.match(roomProposal(context,'door',desired,[]).reply,/缩窄.*通路/);
 const blockedContext=makeLayoutContext(geometric.house,'living',[],'passage','');
 const repair=optimizeRoom(blockedContext,'door',[]);
 assert.equal(repair.kind,'roomProposal');
 const repaired=applyLayoutChanges(geometric.house,room.id,repair.changes);
 assert.ok('house' in repaired);
 assert.equal(assessRoomUse(repaired.house,room).passages[0].reachable,true);
 assert.match(repair.reply,/从门口到房间中央有至少\s*60\s*厘米\s*宽的通路/);
});

test('整间客厅一次处理挡门和家具重叠，计划稳定，保留锁定家具及其他房间',()=>{
 const house=initialHouse();
 const items=Object.fromEntries(house.items.map(item=>[item.id,item]));
 [items.plant.x,items.plant.z]=doorPoint(house,house.doors[0],45,.60);
 Object.assign(items.chair,{x:items.table.x,z:items.table.z});
 items.sofa.locked=true;
 const baseline=copy(house);
 const context=makeLayoutContext(house,'living',['chair'],'balanced','');
 const request={mode:'room',reviewOnly:false,objective:'balanced',preserveIds:['cabinet']};
 const result=executeLayoutIntent(request,context,'这里摆得挺乱，帮我整个房间重新排一下。');
 assert.equal(result.kind,'roomProposal');
 assert.ok(result.changes.length>=2);
 assert.deepEqual(executeLayoutIntent(request,context,'麻烦让这一屋摆放得更合理一些。'),result);
 assert.deepEqual(house,baseline);
 assert.equal(result.explanations.length,result.changes.length);
 assert.ok(result.explanations.every(detail=>detail.reason&&detail.impact));
 const after=applyLayoutChanges(house,'living',result.changes,result.preserveIds);
 assert.ok('house' in after);
 assert.ok(!after.house.items.filter(item=>item.roomId==='living').some(item=>warnings(after.house)[item.id]));
 assert.deepEqual(after.house.items.filter(item=>item.roomId!=='living'||item.id==='sofa'||item.id==='cabinet'),
  house.items.filter(item=>item.roomId!=='living'||item.id==='sofa'||item.id==='cabinet'));
 const previous={changes:result.changes,objective:result.objective,preserveIds:result.preserveIds};
 const followup=makeLayoutContext(house,'living',[],'balanced','',undefined,undefined,previous);
 assert.ok(readLayoutContext(followup));
 assert.deepEqual(executeLayoutIntent({mode:'repeat'},followup,'照刚才那套方案预览'),result);
 items[result.changes[0].itemId].locked=true;
 assert.ok(!readLayoutContext(makeLayoutContext(house,'living',[],'balanced','',undefined,undefined,previous)));
});

test('整屋建议区分保留现状、只评估和受锁定约束无法解决的冲突',()=>{
 const house=initialHouse();
 house.items=house.items.filter(item=>item.roomId!=='living'||item.id==='sofa');
 const context=()=>makeLayoutContext(house,'living',[],'balanced','');
 const request={mode:'room',reviewOnly:false,objective:'balanced'};
 const clean=executeLayoutIntent(request,context(),'如果现在摆得合适就保留。');
 assert.equal(clean.kind,'text');
 assert.match(clean.reply,/建议保留现状.*你还想/);
 const sofa=house.items.find(item=>item.id==='sofa')!;
 const room=house.rooms.find(item=>item.id==='living')!;
 Object.assign(sofa,{x:room.x,z:room.z});
 const evaluation=executeLayoutIntent({...request,reviewOnly:true},context(),'先只评价当前布置。');
 assert.equal(evaluation.kind,'text');
 assert.match(evaluation.reply,/可行调整/);
 const clearCenter=executeLayoutIntent(request,context(),'帮我改得开敞一点。');
 assert.equal(clearCenter.kind,'roomProposal');
 assert.match(clearCenter.reply,/中央区域的家具占用估计/);
 Object.assign(sofa,{locked:true});
 [sofa.x,sofa.z]=doorPoint(house,house.doors[0],40,.4);
 const blocked=executeLayoutIntent(request,context(),'只有未锁定的家具可以调整。');
 assert.equal(blocked.kind,'text');
 assert.match(blocked.reply,/皮木框架沙发需要保持原位/);
 assert.doesNotMatch(blocked.reply,/建议保留现状/);
});

test('整套落点按最终占地校验，家具可交换位置，无效改动不会部分生效',()=>{
 const house=initialHouse();
 const first=house.items.find(item=>item.id==='chair')!;
 const second={...first,id:'other-chair',x:-.6,z:-1.25};
 house.items.push(second);
 const initial=copy(house);
 const changes=[{itemId:first.id,x:second.x,z:second.z},{itemId:second.id,x:first.x,z:first.z}];
 assert.ok('error' in applyLayoutMove(house,'living',changes[0]));
 const result=applyLayoutChanges(house,'living',changes);
 assert.ok('house' in result);
 assert.ok(result.house.items.some(item=>item.id===first.id&&item.x===second.x&&item.z===second.z));
 assert.ok(result.house.items.some(item=>item.id===second.id&&item.x===first.x&&item.z===first.z));
 const measurements=measurePreviousRoomSuggestion(makeLayoutContext(house,'living',[],'balanced','',undefined,undefined,
  {changes,objective:'balanced',preserveIds:[]}));
 const gap=measurements?.find(value=>value.itemId===first.id)?.nearbyGaps.find(value=>value.itemId===second.id);
 assert.ok(gap&&gap.beforeCm>0&&gap.beforeCm===gap.afterCm);
 assert.ok('error' in applyLayoutChanges(house,'living',changes,[first.id]));
 assert.ok('error' in applyLayoutChanges(house,'living',[...changes,changes[0]]));
 assert.ok('error' in applyLayoutChanges(house,'living',[changes[0],{...changes[1],x:100}]));
 assert.deepEqual(house,initial);
});

function bedroomWithBlockedDoor(){
 const house=initialHouse();
 const door=house.doors.find(item=>item.id==='door-bed')!;
 const cabinet=house.items.find(item=>item.id==='bed-cabinet')!;
 [cabinet.x,cabinet.z]=doorPoint(house,door,45,.52);
 cabinet.rotation=90;
 return {house,door,cabinet,context:()=>makeLayoutContext(house,'bedroom',[],'balanced','')};
}

test('问门会不会碰到边柜时，与画布使用同一个开门范围，关着的门也检查',()=>{
 const {house,door,cabinet,context}=bedroomWithBlockedDoor();
 assert.deepEqual(currentDoorStatus(context())[0].blockers.map(item=>item.id),[cabinet.id]);
 assert.match(warnings(house)[door.id][0],/收纳边柜/);
 const question='卧室门打开会不会磕到边柜？只检查，别移动。';
 assert.match(doorOpeningAdvice(context(),question)?.reply??'',/西墙房门的开启范围被收纳边柜占用/);
 const intent={mode:'door',action:'check',itemId:cabinet.id,minimumWidth:.90};
 const onlyCheck=executeLayoutIntent(intent,context(),question);
 assert.match(onlyCheck.reply,/开启范围被收纳边柜占用/);
 assert.doesNotMatch(onlyCheck.reply,/90 厘米/);
 assert.match(executeLayoutIntent(intent,context(),'卧室门口能不能保证 90 厘米净宽？').reply,/90 厘米.*连续通行宽度仍需测量/);
 assert.equal(doorOpeningAdvice(context(),question)?.kind,'text');
 door.open=true;
 assert.match(doorOpeningAdvice(context(),question)?.reply??'',/被收纳边柜占用/);
 door.inward=false;
 assert.equal(warnings(house)[door.id],undefined);
 assert.match(doorOpeningAdvice(context(),question)?.reply??'',/没有占用/);
});

test('挡门边柜预览选取近处合法位置，遵守锁定、保留及最大移动距离',()=>{
 const {house,door,cabinet,context}=bedroomWithBlockedDoor();
 const initial=copy(house);
 const question='进卧室时门会撞到边柜，帮我挪开，尽量少挪。';
 const advice=doorOpeningAdvice(context(),question);
 assert.ok(advice?.kind==='proposal');
 assert.equal(advice.moves.length,1);
 const move=advice.moves[0];
 assert.equal(move.itemId,cabinet.id);
 const distance=Math.hypot(move.x-cabinet.x,move.z-cabinet.z);
 assert.ok(distance>1.1 && distance<1.3);
 assert.match(advice.reply,/平移约 1\.\d{2} 米/);
 assert.match(advice.explanations[0].reason,/占用西墙房门的开启范围/);
 assert.match(advice.explanations[0].impact,/其他家具保持原位.*开启范围|其他家具保持原位.*开门范围/);
 assert.deepEqual(house,initial);
 const placed=applyLayoutMove(house,'bedroom',move);
 assert.ok('house' in placed);
 assert.equal(warnings(placed.house)[door.id],undefined);
 assert.deepEqual(placed.house.items.filter(item=>item.id!==cabinet.id),house.items.filter(item=>item.id!==cabinet.id));
 const limited=doorOpeningAdvice(context(),'帮我把挡住卧室门的边柜挪开，最多挪30厘米。');
 assert.equal(limited?.kind,'text');
 assert.match(limited.reply,/超过你设的 30 厘米/);
 const keptBed=doorOpeningAdvice(context(),'不要移动床，卧室门会撞到边柜，帮我把边柜挪开。');
 assert.equal(keptBed?.kind,'proposal');
 const checkWithoutMoving=doorOpeningAdvice(context(),'卧室门会不会碰柜子？不要把边柜挪开。');
 assert.equal(checkWithoutMoving?.kind,'text');
 assert.match(checkWithoutMoving.reply,/被收纳边柜占用/);
 const preserved=doorOpeningAdvice({...context(),custom:'边柜保持原位'},question);
 assert.equal(preserved?.kind,'text');
 assert.match(preserved.reply,/需保持原位/);
 cabinet.locked=true;
 const locked=doorOpeningAdvice(context(),question);
 assert.equal(locked?.kind,'text');
 assert.match(locked.reply,/已锁定/);
});

test('门洞尺寸与通行宽度分别说明，小卧室的床无合法空位时只解释原因',()=>{
 const {house,door,context}=bedroomWithBlockedDoor();
 door.width=.72;
 const widthQuestion='推婴儿车从卧室门洞到床边，能不能全程保证 90 厘米净宽？';
 assert.match(doorOpeningAdvice(context(),widthQuestion)?.reply??'',/72 厘米.*小于 90 厘米/);
 door.width=.95;
 assert.match(doorOpeningAdvice(context(),widthQuestion)?.reply??'',/连续通行宽度仍需测量/);

 const room=house.rooms.find(item=>item.id==='bedroom')!;
 const bed=house.items.find(item=>item.id==='bed')!;
 house.items=house.items.filter(item=>item.roomId!==room.id||item===bed);
 Object.assign(room,{w:2.05,d:2.45});
 Object.assign(bed,{x:room.x,z:room.z});
 door.offset=0;
 assert.match(warnings(house)[door.id][0],/双人床/);
 const noPlace=doorOpeningAdvice(context(),'床挡住了卧室门，帮我挪开。');
 assert.equal(noPlace?.kind,'text');
 assert.match(noPlace.reply,/没有找到.*合法空位/);
 assert.match(doorOpeningAdvice({...context(),doors:[]},'床挡住卧室门了吗？')?.reply??'',/没有已标注的房门/);
 assert.equal(doorOpeningAdvice(context(),'把床往北挪30厘米，别挡门。'),undefined);
});

test('布局上下文仅包含当前房间，能区分同名家具并使用已选对象',()=>{
 const house=initialHouse();
 const chair=house.items.find(item=>item.id==='chair')!;
 house.items.push({...chair,id:'second-chair',x:0,z:-1.5});
 const context=makeLayoutContext(house,'living',[],'balanced','');
 assert.ok(readLayoutContext(context));
 assert.equal(context.items.some(item=>item.id==='bed'),false);
 assert.equal(context.doors.length,1);
 assert.deepEqual(explicitTargets(context,'把椅子挪到沙发旁边').map(item=>item.id),['chair','second-chair']);
 assert.notEqual(itemLabel(context.items,'chair'),itemLabel(context.items,'second-chair'));
 assert.deepEqual(explicitTargets({...context,selectedIds:['second-chair']},'把这把椅子挪开').map(item=>item.id),['second-chair']);
 assert.deepEqual(explicitTargets(context,'把它往南挪一点'),[]);
 assert.deepEqual(explicitTargets({...context,confirmedId:'chair'},'把椅子挪开').map(item=>item.id),['chair']);
 assert.equal(readLayoutContext({...context,selectedIds:['bed']}),undefined);
 assert.equal(readLayoutContext({...context,items:[null]}),undefined);
});

test('建议优先从可用家具中选，规则拦截锁定、跨房、越界、重叠和挡门',()=>{
 const house=initialHouse(),chair=house.items.find(item=>item.id==='chair')!,table=house.items.find(item=>item.id==='table')!;
 house.items.find(item=>item.id==='sofa')!.locked=true;
 const context=makeLayoutContext(house,'living',[],'balanced','茶几保持原位');
 assert.deepEqual([...protectedIds(context,'让中央更宽敞')].sort(),['sofa','table']);
 assert.deepEqual([...protectedIds({...context,custom:''},'移动椅子但保留沙发')],['sofa']);
 assert.match(assertError({itemId:'sofa',x:0,z:0}),/锁定/);
 assert.match(assertError({itemId:'bed',x:0,z:0}),/没有/);
 assert.match(assertError({itemId:chair.id,x:-10,z:0}),/边界/);
 assert.match(assertError({itemId:chair.id,x:table.x,z:table.z}),/重叠/);
 assert.match(assertError({itemId:chair.id,x:-3.9,z:-1.52}),/房门开启/);

 function assertError(move:{itemId:string;x:number;z:number}){
  const outcome=applyLayoutMove(house,'living',move);
  assert.ok('error' in outcome);
  return outcome.error;
 }
});

test('按不同房间的目标生成可验证方案，保留其他家具并报告无解',()=>{
 const original=initialHouse();
 for(const [roomId,itemId,goal] of [['living','chair','center'],['bedroom','bed-cabinet','door']] as const){
  const result=findLayoutMoves(makeLayoutContext(original,roomId,[],'balanced',''),{itemId,goal});
  assert.ok(result.moves.length);
  for(const move of result.moves){
   const update=applyLayoutMove(original,roomId,move);
   assert.ok('house' in update);
   assert.deepEqual(warnings(update.house),{});
   assert.deepEqual(update.house.items.filter(item=>item.id!==itemId),original.items.filter(item=>item.id!==itemId));
  }
 }
 const context=makeLayoutContext(original,'living',[],'balanced','');
 const item=context.items[0];
 const atTarget=findLayoutMoves(context,{itemId:item.id,goal:'position',target:{x:item.x,z:item.z}});
 assert.equal(atTarget.moves.length,0);
 assert.match(atTarget.reply,/没有找到/);
});

test('对话上下文传达实际材质和仍有效的未提交预览',()=>{
 const house=initialHouse();
 Object.assign(house.rooms[0],{wallMaterial:'ivory',floorMaterial:'oak'});
 const preview={move:{itemId:'chair',x:-1.65,z:0},state:'previewing'} as const;
 const context=makeLayoutContext(house,'living',['chair'],'hosting','',undefined,preview);
 const received=readLayoutContext(JSON.parse(JSON.stringify(context)));
 assert.deepEqual(received?.previousSuggestion,preview);
 assert.equal(received?.room.wallMaterial,'ivory');
 assert.equal(received?.room.floorMaterial,'oak');
 assert.equal(received?.items.find(item=>item.id==='chair')?.z,.3);
 const measurements=measurePreviousSuggestion(context);
 assert.deepEqual([measurements?.eastCm,measurements?.southCm],[0,-30]);
 const tableGap=measurements?.nearbyGaps.find(value=>value.itemId==='table');
 assert.ok(tableGap && tableGap.beforeCm===tableGap.afterCm);
 assert.equal(readLayoutContext({...context,previousSuggestion:{...preview,move:{...preview.move,itemId:'bed'}}}),undefined);
 assert.equal(readLayoutContext({...context,previousSuggestion:{...preview,move:{...preview.move,x:99}}}),undefined);
});

test('明确的单方向距离用原文计算，精确落点冲突时不换到附近',()=>{
 const context=makeLayoutContext(initialHouse(),'living',[],'balanced','');
 const exact=exactRelativeMove(context,'chair','把单椅往北平移30厘米，东西位置不变。');
 assert.ok(exact?.kind==='proposal');
 assert.deepEqual(exact.moves,[{itemId:'chair',x:-1.65,z:0}]);
 assert.match(exact.explanations[0].movement,/向北 30 厘米/);
 assert.match(exact.explanations[0].impact,/与椭圆茶几最近间距仍约 22 厘米/);
 const collision=exactRelativeMove(context,'chair','把单椅向西挪1.1米。');
 assert.equal(collision?.kind,'text');
 assert.match(collision.reply,/椭圆茶几重叠/);
});

test('备选落点分别计算与参照家具的影响',()=>{
 const house=initialHouse();
 const context=makeLayoutContext(house,'living',[],'balanced','');
 const choices=[{itemId:'chair',x:-1.65,z:0},{itemId:'chair',x:-1.2,z:0}];
 assert.ok(choices.every(move=>'house' in applyLayoutMove(house,'living',move)));
 const proposal=makeLayoutProposal(context,{goal:'conversation',anchorId:'table'},choices,'调整会客间距。');
 assert.ok(proposal.kind==='proposal');
 assert.match(proposal.explanations[0].impact,/椭圆茶几.*仍约 22 厘米/);
 assert.match(proposal.explanations[1].impact,/椭圆茶几.*约 22 厘米 变为 67 厘米/);
});

test('书桌靠西窗时沿窗墙避开单椅，就近无空间时说明冲突',()=>{
 const house=initialHouse();
 const context=()=>makeLayoutContext(house,'study',[],'balanced','');
 const reference=wallReference(context(),'把书桌移到西窗旁边');
 assert.deepEqual(reference,{wall:'west',windowId:'window-study'});
 const request={goal:'wall',itemId:'desk',...reference} as const;
 const advice=wallPlacementAdvice(context(),request);
 assert.ok(advice.kind==='proposal');
 const move=advice.moves[0];
 assert.ok(Math.abs(move.x-(-.839))<1e-7);
 assert.ok(move.z<=2.42&&move.z+.325>2.65);
 assert.match(advice.explanations[0].reason,/西墙窗口一侧/);
 const applied=applyLayoutMove(house,'study',move);
 assert.ok('house' in applied);
 assert.deepEqual(warnings(applied.house),{});
 assert.deepEqual(applied.house.items.filter(item=>item.id!=='desk'),house.items.filter(item=>item.id!=='desk'));

 const plant=house.items.find(item=>item.id==='study-plant')!;
 house.items=house.items.filter(item=>item!==plant);
 house.items.unshift({...plant,id:'fixed-cabinet',kind:'cabinet',name:'固定柜',x:-1.28,z:3.2,w:.4,d:2.2,rotation:0,locked:true});
 const failure=wallPlacementAdvice(context(),request);
 assert.ok(failure.kind==='text');
 assert.match(failure.reply,/西墙窗口一侧.*固定柜重叠/);
});

test('会客微调保留沙发与茶几原有相对位置，不能改善时保留原位',()=>{
 const current=makeLayoutContext(initialHouse(),'living',[],'balanced','');
 const noMove=findLayoutMoves(current,{itemId:'sofa',goal:'conversation'});
 assert.deepEqual(noMove.moves,[]);
 assert.match(noMove.reply,/没有找到.*小幅移动/);
 const other=alternateHouse();
 const context=makeLayoutContext(other,'sky-living',[],'hosting','');
 const sofa=context.items.find(item=>item.id==='sky-sofa')!,table=context.items.find(item=>item.id==='sky-table')!;
 const result=findLayoutMoves(context,{itemId:sofa.id,goal:'conversation'});
 assert.ok(result.moves.length);
 for(const move of result.moves){
  assert.ok(move.z<table.z && move.z>sofa.z);
  assert.ok(Math.abs(move.x-sofa.x)<=.25);
  assert.ok(Math.hypot(move.x-sofa.x,move.z-sofa.z)<=.85);
  const update=applyLayoutMove(other,'sky-living',move);
  assert.ok('house' in update);
  assert.deepEqual(warnings(update.house),{});
 }
});

test('对齐只平移请求中的对象，并且可以使用锁定家具当参照',()=>{
 const house=initialHouse();
 house.items=house.items.filter(item=>item.id==='sofa'||item.id==='table');
 const sofa=house.items[0],table=house.items[1];
 sofa.locked=true;
 const request={itemId:table.id,anchorId:sofa.id,goal:'align'} as const;
 const context=()=>makeLayoutContext(house,'living',[],'balanced','');
 assert.match(findLayoutMoves(context(),request).reply,/已经基本对齐/);
 table.x+=.5;
 const proposal=findLayoutMoves(context(),request);
 const best=proposal.moves[0];
 assert.deepEqual(best,{itemId:table.id,x:sofa.x,z:table.z});
 const update=applyLayoutMove(house,'living',best);
 assert.ok('house' in update);
 assert.deepEqual(update.house.items[0],sofa);
 assert.match(findLayoutMoves(context(),{...request,anchorId:'bed'}).reply,/与哪件家具对齐/);
});

test('示例户型无家具重叠、越界或挡门',()=>{assert.deepEqual(warnings(initialHouse()),{});});
test('新增两居房型格式有效且无重叠、穿墙或挡门',()=>{const w=defaultWorkspace();assert.ok(validHouse(w.projects.sky));assert.deepEqual(warnings(w.projects.sky),{});assert.notDeepEqual(w.projects.forest.rooms,w.projects.sky.rooms);});
test('两个房型编辑和存档独立，保存后恢复当前房型',()=>{const w=defaultWorkspace(),original=copy(w.projects.sky);w.projects.forest=moveItems(w.projects.forest,['sofa'],.2,.2,true);assert.deepEqual(w.projects.sky,original);w.activePlanId='sky';const restored=restoreWorkspace(JSON.parse(JSON.stringify(w)),null);assert.equal(restored.recovered,true);assert.equal(restored.workspace.activePlanId,'sky');assert.deepEqual(restored.workspace.projects,w.projects);});
test('旧单房型存档迁移时保留原家具并补充第二房型',()=>{const old=initialHouse();old.name='我的旧布局';old.items[0].locked=true;const restored=restoreWorkspace(null,old);assert.equal(restored.workspace.projects.forest.name,'我的旧布局');assert.equal(restored.workspace.projects.forest.items[0].locked,true);assert.equal(restored.workspace.projects.sky.name,'晴空两居');});
test('选择工具直接拖动家具，专用框选工具从任意位置框选',()=>{const f=initialHouse().items[0];assert.equal(furnitureDragAction(f,[],'select'),'move');assert.equal(furnitureDragAction(f,[f.id],'select'),'move');assert.equal(furnitureDragAction(f,[f.id],'box'),'box');assert.equal(furnitureDragAction(undefined,[f.id],'select'),'box');});
test('锁定或按住 Shift 时不触发家具移动',()=>{const f=initialHouse().items[0];assert.equal(furnitureDragAction(f,[f.id],'select',true),'box');f.locked=true;assert.equal(furnitureDragAction(f,[f.id],'select'),'box');});
test('房间材质随房型存档往返且不污染其他房间',()=>{const w=defaultWorkspace(),other=copy(w.projects.forest.rooms[1]);w.projects.forest.rooms[0].floorMaterial='walnut';w.projects.forest.rooms[0].wallMaterial='brick';const restored=restoreWorkspace(JSON.parse(JSON.stringify(w)),null);assert.equal(restored.workspace.projects.forest.rooms[0].floorMaterial,'walnut');assert.equal(restored.workspace.projects.forest.rooms[0].wallMaterial,'brick');assert.deepEqual(restored.workspace.projects.forest.rooms[1],other);assert.equal(restored.workspace.projects.sky.rooms[0].floorMaterial,undefined);});
test('旧版无材质字段兼容，非法材质拒绝导入',()=>{const h=initialHouse();assert.ok(validHouse(h));(h.rooms[0] as unknown as {floorMaterial:string}).floorMaterial='remote-url';assert.equal(validHouse(h),false);});

test('单件冲突预览让一件家具就近让位，输入和其他家具保持不变',()=>{
 const base=initialHouse(),table=base.items.find(f=>f.id==='table')!,chair=base.items.find(f=>f.id==='chair')!;
 const dx=chair.x-table.x,dz=chair.z-table.z,r=previewMove(base,['table'],dx,dz,true);assert.ok(r.valid);assert.equal(r.yieldId,'chair');assert.deepEqual(warnings(r.house),{});
 assert.deepEqual(base,initialHouse());for(const f of base.items.filter(f=>!['table','chair'].includes(f.id)))assert.deepEqual(r.house.items.find(o=>o.id===f.id),f);
 assert.deepEqual(previewMove(base,['table'],dx,dz,true),r);
});
test('锁定、挡门和多选冲突拒绝，不连锁让位',()=>{
 const base=initialHouse(),table0=base.items.find(f=>f.id==='table')!,chair0=base.items.find(f=>f.id==='chair')!;
 const dx=chair0.x-table0.x,dz=chair0.z-table0.z;
 base.items.find(f=>f.id==='chair')!.locked=true;assert.equal(previewMove(base,['table'],dx,dz,true).valid,false);
 const h=initialHouse(),table=h.items.find(f=>f.id==='table')!,p=doorPoint(h,h.doors[0],45,.5);
 assert.equal(previewMove(h,['table'],p[0]-table.x,p[1]-table.z,false).valid,false);
 const group=previewMove(h,['sofa','table'],1.6,0,true);assert.equal(group.valid,false);assert.equal(group.yieldId,undefined);
});
test('没有可让位空位时返回无效预览',()=>{
 const h=initialHouse(),r=h.rooms[0];h.rooms=[{...r,w:2,d:2}];h.doors=[];h.windows=[];
 h.items=[{...h.items[1],id:'small',w:.2,d:.2,x:r.x-.8,z:r.z-.8},{...h.items[2],id:'large',w:1.4,d:1.4,x:r.x,z:r.z,rotation:0}];
 assert.deepEqual(warnings(h),{});assert.equal(previewMove(h,['small'],.8,.8,false).valid,false);
});
test('新冲突检测与复制空位搜索不破坏原布局',()=>{
 const h=initialHouse(),next=copy(h);next.items[1].x=next.items[0].x;next.items[1].z=next.items[0].z;assert.ok(addedConflicts(h,next).length);
 const placed=placeCopies(h,[h.items[1]]);assert.ok(placed);assert.equal(placed.items.length,h.items.length+1);assert.deepEqual(warnings(placed),{});assert.deepEqual(placed.items.slice(0,h.items.length),h.items);
});

test('旧存档兼容米制净高与门窗高度默认值',()=>{const h=initialHouse();assert.equal(roomHeight(h.rooms[0]),2.7);assert.equal(doorHeight(h.doors[0]),2.1);assert.equal(windowHeight(h.windows[0]),1.35);assert.equal(windowSill(h.windows[0]),.85);assert.ok(validHouse(h));});
test('实测净高和门窗尺寸随存档往返，非法值拒绝导入',()=>{
 const h=initialHouse();h.rooms[0].height=2.85;h.doors[0].height=2.2;h.windows[0].height=1.4;h.windows[0].sill=.9;
 const saved=JSON.parse(JSON.stringify(h));assert.ok(validHouse(saved));assert.equal(saved.rooms[0].height,2.85);
 saved.windows[0].sill=2;assert.equal(validHouse(saved),false);saved.windows[0].sill=.9;saved.rooms[0].height=NaN;assert.equal(validHouse(saved),false);
});
test('完整墙面扣除窗洞并保留窗台与窗上墙',()=>{
 const h=initialHouse(),r=h.rooms[0],w=h.windows[0];const parts=wallSections(h,r,'north');
 const area=parts.reduce((sum,p)=>sum+(p.b-p.a)*(p.high-p.low),0);
 assert.ok(Math.abs(area-(r.w*2.7-w.width*1.35))<1e-8);
 assert.ok(parts.some(p=>p.low===0&&p.high===.85));assert.ok(parts.some(p=>p.low===2.2&&p.high===2.7));
});
test('门洞保留真实高度门楣，降低净高不允许截断门窗',()=>{
 const h=initialHouse(),r=h.rooms[0],d=h.doors[0],parts=wallSections(h,r,d.wall);
 assert.ok(parts.some(p=>p.low===2.1&&p.high===2.7));
 const span=d.wall==='north'||d.wall==='south'?r.w:r.d,area=parts.reduce((sum,p)=>sum+(p.b-p.a)*(p.high-p.low),0);assert.ok(Math.abs(area-(span*2.7-d.width*2.1))<1e-8);
 r.height=2.1;assert.ok(constrainHouse(h).error?.includes('窗洞'));
});
test('旋转后的占地用于边界和重叠检测',()=>{const h=initialHouse(),f=h.items[0],r=h.rooms[0];f.w=2.4;f.d=.6;f.x=r.x+r.w/2-WALL_INSET-1.2+.2;f.z=r.z;f.rotation=0;assert.ok(warnings(h)[f.id].includes('超出房间边界'));f.rotation=90;assert.ok(!warnings(h)[f.id]?.includes('超出房间边界'));assert.equal(polygonOverlap(corners({...f,x:r.x,z:r.z}),corners({...f,x:r.x,z:r.z})),true);});
test('门关闭时仍检查完整开启区域',()=>{const h=initialHouse(),d=h.doors[0],f=h.items[0];d.open=false;const pivot=doorFrame(h,d),p=doorPoint(h,d,45,.5);f.x=p[0];f.z=p[1];f.w=.15;f.d=.15;assert.ok(pivot);assert.ok(warnings(h)[f.id].includes('占用房门开启区域'));d.inward=false;assert.ok(!warnings(h)[f.id]?.includes('占用房门开启区域'));});
test('多选吸附保留相对位置且不修改其他房间',()=>{const h=initialHouse(),ids=h.items.slice(0,2).map(f=>f.id),next=moveItems(h,ids,.36,.24,true);assert.ok(Math.abs((next.items[0].x-next.items[1].x)-(h.items[0].x-h.items[1].x))<1e-8);assert.deepEqual(next.items.filter(f=>f.roomId==='bedroom'),h.items.filter(f=>f.roomId==='bedroom'));assert.notDeepEqual(next,h);assert.deepEqual(h,initialHouse());});
test('含锁定家具的批量移动不发生部分修改',()=>{const h=initialHouse();h.items[0].locked=true;assert.deepEqual(moveItems(h,h.items.slice(0,2).map(f=>f.id),1,1,true),h);});
test('保存格式支持往返并拒绝无效数据',()=>{const h=initialHouse();assert.equal(validHouse(JSON.parse(JSON.stringify(h))),true);const bad=copy(h);bad.items[0].x=NaN;assert.equal(validHouse(bad),false);assert.equal(validHouse({}),false);bad.items[0].x=0;bad.items[0].roomId='missing';assert.equal(validHouse(bad),false);});
test('向四面墙拖动时完整家具占地始终在墙内',()=>{for(const rotation of [0,45,90,135,270])for(const [dx,dz] of [[100,0],[-100,0],[0,100],[0,-100],[100,-100]])for(const grid of [false,true]){const h=initialHouse();h.items[0].rotation=rotation;const start=constrainHouse(h).house,next=moveItems(start,['sofa'],dx,dz,grid),f=next.items[0];assert.ok(itemInsideRoom(f,roomOf(next,f.roomId)),JSON.stringify({rotation,dx,dz,grid,f}));}});
test('多选家具整体停在墙边，距离和其他房间不变',()=>{const h=initialHouse(),ids=['sofa','table'],next=moveItems(h,ids,100,100,true);for(const f of next.items.filter(f=>ids.includes(f.id)))assert.ok(itemInsideRoom(f,roomOf(next,f.roomId)));assert.ok(Math.abs((next.items[0].x-next.items[1].x)-(h.items[0].x-h.items[1].x))<1e-9);assert.ok(Math.abs((next.items[0].z-next.items[1].z)-(h.items[0].z-h.items[1].z))<1e-9);assert.deepEqual(next.items.filter(f=>!ids.includes(f.id)),h.items.filter(f=>!ids.includes(f.id)));});
test('旋转、替换和坐标输入统一校正墙内边界，过大家具拒绝提交',()=>{const h=initialHouse();h.items[0].x=99;h.items[0].z=-99;h.items[0].rotation=45;const fixed=constrainHouse(h);assert.equal(fixed.adjusted,true);assert.ok(itemInsideRoom(fixed.house.items[0],fixed.house.rooms[0]));assert.equal(h.items[0].x,99);h.items[0].w=20;assert.ok(constrainHouse(h).error);});
test('锁定家具不能因房间缩小被隐式移动',()=>{const h=initialHouse();h.items[0].locked=true;h.doors=[];h.windows=[];h.rooms[0].d=2;assert.ok(constrainHouse(h).error?.includes('锁定'));});
test('墙内边界包含 12 cm 墙厚，不允许压进墙体',()=>{const h=initialHouse(),r=h.rooms[0];h.items[0].x=r.x;const result=moveItems(h,['sofa'],100,0,false);const right=Math.max(...corners(result.items[0]).map(p=>p[0]));assert.ok(Math.abs(right-(r.x+r.w/2-WALL_INSET))<1e-8);});

class TestCanvas extends EventTarget {
 style={cursor:''};clientHeight=600;capture=new Set<number>();
 setPointerCapture(id:number){this.capture.add(id);}hasPointerCapture(id:number){return this.capture.has(id);}releasePointerCapture(id:number){this.capture.delete(id);}
}
function orbitFixture(mode='3d'){
 if(typeof window==='undefined')Object.defineProperty(globalThis,'window',{value:new EventTarget(),configurable:true});
 const canvas=new TestCanvas(),camera=new PerspectiveCamera();camera.position.set(7,9,10);const controls={object:camera,target:new Vector3(),enabled:true,enableDamping:true,minPolarAngle:.08,maxPolarAngle:Math.PI/2.25,update:()=>false};let message='',clicks=0;
 const bound=bindRightOrbit(canvas as unknown as HTMLElement,controls,{canRotate:()=>mode==='3d',message:s=>{message=s;}});
 const send=(type:string,values:Record<string,number>)=>{const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:1,button:2,buttons:2,clientX:300,clientY:300},values);canvas.dispatchEvent(event);return event;};
 return {canvas,camera,controls,bound,send,message:()=>message,clicks:()=>clicks};
}
test('右键拖动实际改变相机环绕和俯仰，半径与目标点不变',()=>{const f=orbitFixture(),before=f.camera.position.clone(),radius=before.length();const event=f.send('pointerdown',{});assert.ok(event.defaultPrevented);assert.equal(f.controls.enabled,false);f.send('pointermove',{clientX:420,clientY:340});assert.ok(f.camera.position.distanceTo(before)>1);assert.ok(Math.abs(f.camera.position.length()-radius)<1e-8);assert.deepEqual(f.controls.target,new Vector3());f.send('pointerup',{buttons:0});assert.equal(f.bound.isActive(),false);assert.equal(f.controls.enabled,true);assert.equal(f.controls.enableDamping,true);assert.equal(f.canvas.capture.size,0);f.bound.dispose();});
test('右键俯仰有限制，相机不会钻入地面',()=>{const f=orbitFixture();f.send('pointerdown',{});f.send('pointermove',{clientY:-10000});assert.ok(f.camera.position.y>0);f.send('pointermove',{clientY:10000});assert.ok(f.camera.position.y>0);f.bound.dispose();});
test('左键不会启动右键旋转，2D 模式提示切换到 3D',()=>{const f=orbitFixture('2d'),before=f.camera.position.clone();f.send('pointerdown',{button:0,buttons:1});assert.equal(f.bound.isActive(),false);f.send('pointerdown',{});f.send('pointermove',{clientX:450});assert.deepEqual(f.camera.position,before);assert.ok(f.message().includes('3D'));f.bound.dispose();});
test('家具拖动期间右键不抢占；失去焦点后解除旋转并恢复控制',()=>{const f=orbitFixture();f.controls.enabled=false;f.send('pointerdown',{});assert.equal(f.bound.isActive(),false);f.controls.enabled=true;f.send('pointerdown',{});window.dispatchEvent(new Event('blur'));assert.equal(f.bound.isActive(),false);assert.equal(f.controls.enabled,true);f.send('pointerdown',{});f.send('pointermove',{buttons:0});assert.equal(f.bound.isActive(),false);f.bound.dispose();});
test('右键单击和轻微手抖不改变选择，不旋转相机',()=>{for(const mode of ['2d','3d']){const f=orbitFixture(mode),before=f.camera.position.clone();f.send('pointerdown',{});f.send('pointermove',{clientX:303,clientY:302});f.send('pointerup',{buttons:0,clientX:303,clientY:302});assert.equal(f.clicks(),0);assert.deepEqual(f.camera.position,before);assert.equal(f.controls.enabled,true);f.bound.dispose();}});
test('右键拖动旋转后不误触取消选择，取消手势也不触发单击',()=>{const f=orbitFixture();f.send('pointerdown',{});f.send('pointermove',{clientX:340});f.send('pointerup',{buttons:0,clientX:340});assert.equal(f.clicks(),0);f.send('pointerdown',{});window.dispatchEvent(new Event('blur'));f.send('pointerup',{buttons:0});assert.equal(f.clicks(),0);f.bound.dispose();});
