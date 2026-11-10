import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialHouse,warnings,copy,corners,polygonOverlap,doorFrame,doorPoint,moveItems,validHouse,itemInsideRoom,roomOf,constrainHouse,WALL_INSET} from './model';
import {PerspectiveCamera,Vector3} from 'three';
import {bindRightOrbit} from './rightOrbit';
import {defaultWorkspace,restoreWorkspace} from './projects';
import {furnitureDragAction} from './selection';
import {roomHeight,doorHeight,windowHeight,windowSill,wallSections} from './architecture';
import {previewMove,addedConflicts,placeCopies} from './placement';
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
