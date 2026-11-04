import {useEffect,useRef,useState} from 'react';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {copy,doorFrame,doorPoint,doorSweep,moveItems,roomOf,snap,warnings,type House,type Item,type Room,type Tool} from './model';
import {bindRightOrbit} from './rightOrbit';
import {furnitureDragAction} from './selection';
import {roomTexture} from './materials';

type Props={house:House;roomId:string;mode:'2d'|'3d';selected:string[];tool:Tool;grid:boolean;measure:boolean;resetKey:number;mini?:boolean;view?:[number,number][];onSelect:(ids:string[])=>void;onCommit:(h:House)=>boolean;onMessage:(s:string)=>void;onView?:(p:[number,number][])=>void;onRoom?:(id:string)=>void};
type Engine={rebuild:()=>void;reset:()=>void;outlineView:()=>void};
function dispose(root:T.Object3D){root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line||o instanceof T.Sprite){if('geometry'in o)o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){if('map'in m&&m.map)m.map.dispose();m.dispose();}}});}
function box(parent:T.Object3D,w:number,h:number,d:number,color:string,x=0,y=0,z=0,round=.025){
 const mesh=new T.Mesh(round?new RoundedBoxGeometry(w,h,d,2,Math.min(round,w/4,h/4,d/4)):new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.8}));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function line(parent:T.Object3D,points:T.Vector3[],color:string,dashed=false){const geo=new T.BufferGeometry().setFromPoints(points);const mat=dashed?new T.LineDashedMaterial({color,dashSize:.12,gapSize:.07}):new T.LineBasicMaterial({color});const l=new T.Line(geo,mat);if(dashed)l.computeLineDistances();parent.add(l);return l;}
function label(parent:T.Object3D,text:string,x:number,y:number,z:number,color='#516356',scale=.9){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d')!;ctx.font='500 33px "Microsoft YaHei", sans-serif';const width=Math.min(495,ctx.measureText(text).width+40);ctx.fillStyle='rgba(255,255,255,.94)';ctx.beginPath();ctx.roundRect((512-width)/2,8,width,76,18);ctx.fill();ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,48);const texture=new T.CanvasTexture(canvas);const s=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false,transparent:true}));s.position.set(x,y,z);s.scale.set(2.7*scale,.5*scale,1);s.renderOrder=30;parent.add(s);return s;
}
function furniture(f:Item){
 const g=new T.Group();g.userData.id=f.id;const wood='#a88461',dark='#4b5c50',c=f.color;
 if(f.kind==='sofa'){
  box(g,f.w,.23,f.d,wood,0,.2,0);box(g,f.w-.16,.29,f.d-.17,c,0,.48,.04,.09);box(g,f.w,.53,.18,c,0,.61,-f.d/2+.09,.07);
  for(const x of [-1,1])box(g,.18,.45,f.d,c,x*(f.w/2-.09),.52,0,.06);
  for(const x of [-.53,.53]){const pillow=box(g,.42,.36,.16,'#dbdfcf',x,.72,-.22,.07);pillow.rotation.x=-.18;}
  box(g,.025,.012,.7,'#7b9684',0,.634,.09,.005);
 }else if(f.kind==='bed'){
  box(g,f.w,.24,f.d,wood,0,.2,0,.05);box(g,f.w-.04,.27,f.d-.04,'#f3eee3',0,.46,0,.09);box(g,f.w,.9,.12,c,0,.48,-f.d/2+.06,.05);
  box(g,f.w-.05,.08,f.d*.56,c,0,.63,f.d*.15,.04);for(const x of [-.43,.43])box(g,.67,.13,.42,'#fbf9f1',x,.66,-f.d*.29,.08);
  box(g,f.w-.02,.035,.3,'#9eac94',0,.69,f.d*.28,.01);
 }else if(f.kind==='table'||f.kind==='desk'){
  box(g,f.w,.085,f.d,c,0,f.h-.045,0,.07);for(const x of [-1,1])for(const z of [-1,1])box(g,.065,f.h-.1,.065,wood,x*(f.w/2-.13),(f.h-.1)/2,z*(f.d/2-.13));
  if(f.kind==='table'){box(g,.26,.025,.21,'#eeeadf',.15,f.h+.02,-.05,.008);box(g,.22,.035,.18,'#8a9b84',.13,f.h+.05,-.05,.008);}
  else{box(g,.5,.32,.035,dark,0,f.h+.27,-.15);box(g,.08,.15,.06,dark,0,f.h+.09,-.15);box(g,.45,.025,.16,'#dddcd4',0,f.h+.03,.14);}
 }else if(f.kind==='chair'){
  box(g,f.w,.17,f.d,c,0,.46,0,.07);box(g,f.w,.39,.12,c,0,.7,-f.d/2+.06,.06);for(const x of [-1,1])for(const z of [-1,1])box(g,.05,.4,.05,wood,x*(f.w/2-.1),.2,z*(f.d/2-.1));
 }else if(f.kind==='cabinet'){
  box(g,f.w,f.h-.1,f.d,c,0,f.h/2+.04,0,.025);box(g,.012,f.h-.16,.012,wood,0,f.h/2+.05,f.d/2+.004,.002);for(const x of [-.12,.12])box(g,.025,.09,.025,dark,x,f.h*.57,f.d/2+.025,.006);
  for(const x of [-1,1])for(const z of [-1,1])box(g,.06,.1,.06,wood,x*(f.w/2-.1),.05,z*(f.d/2-.08));
 }else{
  const pot=new T.Mesh(new T.CylinderGeometry(.19,.14,.34,16),new T.MeshStandardMaterial({color:'#d3bc9e',roughness:.9}));pot.position.y=.17;pot.castShadow=true;g.add(pot);
  box(g,.035,.8,.035,wood,0,.6,0);
  for(let i=0;i<8;i++){const a=i*2.4;const leaf=new T.Mesh(new T.SphereGeometry(.19,10,8),new T.MeshStandardMaterial({color:i%2?c:'#66825c',roughness:.8}));leaf.scale.set(.75,1.3,.36);leaf.position.set(Math.sin(a)*.16,.55+i*.075,Math.cos(a)*.13);leaf.rotation.z=Math.sin(a)*.6;leaf.castShadow=true;g.add(leaf);}
 }
 g.position.set(f.x,0,f.z);g.rotation.y=f.rotation*Math.PI/180;return g;
}
export default function Scene(props:Props){
 const host=useRef<HTMLDivElement>(null),latest=useRef(props),engine=useRef<Engine|null>(null);latest.current=props;
 const [error,setError]=useState('');
 useEffect(()=>{
  const el=host.current!;let renderer:T.WebGLRenderer;
  try{renderer=new T.WebGLRenderer({antialias:true,alpha:true});}catch{setError('3D 未能启动，请使用开启硬件加速的 Chrome 或 Edge。');return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=!props.mini;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.setClearColor('#f1f1ea',1);renderer.domElement.setAttribute('aria-label',props.mini?'全屋三维地图':'房间编辑画布');renderer.domElement.style.touchAction='none';el.appendChild(renderer.domElement);
  const scene=new T.Scene();const root=new T.Group(),annotation=new T.Group(),viewRoot=new T.Group(),measureRoot=new T.Group();scene.add(root,annotation,viewRoot,measureRoot);
  scene.add(new T.HemisphereLight('#fffaf0','#a5b2a0',2.6));const sun=new T.DirectionalLight('#fff9ed',3);sun.position.set(4,10,6);sun.castShadow=!props.mini;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-12;sun.shadow.camera.right=12;sun.shadow.camera.top=12;sun.shadow.camera.bottom=-12;sun.shadow.normalBias=.035;sun.shadow.bias=-.0001;scene.add(sun);
  let camera:T.PerspectiveCamera|T.OrthographicCamera=new T.PerspectiveCamera(40,1,.1,200);const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.12;controls.minDistance=4;controls.maxDistance=35;controls.minZoom=.35;controls.maxZoom=5;controls.maxPolarAngle=Math.PI/2.25;controls.minPolarAngle=.08;
  controls.mouseButtons={LEFT:props.mini?T.MOUSE.PAN:null as unknown as T.MOUSE,MIDDLE:T.MOUSE.PAN,RIGHT:props.mini?T.MOUSE.PAN:null as unknown as T.MOUSE};
  const rightOrbit=props.mini?null:bindRightOrbit(renderer.domElement,controls,{canRotate:()=>latest.current.mode==='3d',message:s=>latest.current.onMessage(s),onClick:e=>{const p=latest.current,{id}=hit(e);if(!p.house.items.some(f=>f.id===id)||!p.selected.includes(id))return false;p.onSelect(p.selected.filter(selectedId=>selectedId!==id));p.onMessage('已取消该家具的选择。');return true;}});
  const ray=new T.Raycaster(),pointer=new T.Vector2(),plane=new T.Plane(new T.Vector3(0,1,0),0),objects=new Map<string,T.Group>(),outlines=new Map<string,T.Line>();
  let width=Math.max(1,el.clientWidth),height=Math.max(1,el.clientHeight),activeRoom='',activeMode='',frame=0,hover='',lastView=0,measureStart:T.Vector3|null=null;
  type Drag={startX:number;startY:number;point:T.Vector3;id:string;hitId:string;ids:string[];base:House;preview:House|null;moved:boolean;blocked:boolean;add:boolean;pointerId:number};let drag:Drag|null=null;
  const rect=document.createElement('div');rect.className='selection-marquee';rect.hidden=true;el.appendChild(rect);
  function clear(g:T.Group){dispose(g);g.clear();}
  function project(x:number,y:number,z:number){const v=new T.Vector3(x,y,z).project(camera);return {x:(v.x+1)/2*width,y:(1-v.y)/2*height};}
  function hit(e:PointerEvent){const b=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);ray.setFromCamera(pointer,camera);const hits=ray.intersectObject(root,true);for(const h of hits){let obj:T.Object3D|null=h.object;while(obj&&obj!==root){if(obj.userData.id)return {id:obj.userData.id as string,point:ray.ray.intersectPlane(plane,new T.Vector3())};obj=obj.parent;}}return {id:'',point:ray.ray.intersectPlane(plane,new T.Vector3())};}
  function point(e:PointerEvent){const b=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);ray.setFromCamera(pointer,camera);return ray.ray.intersectPlane(plane,new T.Vector3());}
  function dimensions(r:Room){
   const z=r.z+r.d/2+.35,x=r.x-r.w/2-.35,c='#738573';line(annotation,[new T.Vector3(r.x-r.w/2,.04,z),new T.Vector3(r.x+r.w/2,.04,z)],c);line(annotation,[new T.Vector3(x,.04,r.z-r.d/2),new T.Vector3(x,.04,r.z+r.d/2)],c);
   label(annotation,`${r.w.toFixed(2)} m`,r.x,.08,z,c,.8);label(annotation,`${r.d.toFixed(2)} m`,x,.08,r.z,c,.8);
  }
  function reset(){
   rightOrbit?.cancel();
   const p=latest.current,r=roomOf(p.house,p.roomId),mini=p.mini;
   activeRoom=p.roomId;activeMode=p.mode;
   const ortho=mini||p.mode==='2d',aspect=width/height,span=mini?4.5:Math.max(r.w,r.d)*.74;
   camera=ortho?new T.OrthographicCamera(-span*aspect,span*aspect,span,-span,.1,150):new T.PerspectiveCamera(40,aspect,.1,150);
   const bounds=new T.Box3();for(const room of p.house.rooms){bounds.expandByPoint(new T.Vector3(room.x-room.w/2,0,room.z-room.d/2));bounds.expandByPoint(new T.Vector3(room.x+room.w/2,1.3,room.z+room.d/2));}
   const center=mini?bounds.getCenter(new T.Vector3()):new T.Vector3(r.x,0,r.z);
   if(mini)camera.position.copy(center).add(new T.Vector3(8,13,12));else if(ortho){camera.position.copy(center).add(new T.Vector3(0,15,.001));}else camera.position.copy(center).add(new T.Vector3(7.6,9,10.2).multiplyScalar(Math.max(r.w,r.d)/7.3));
   camera.lookAt(center);
   if(mini&&camera instanceof T.OrthographicCamera){camera.updateMatrixWorld(true);let maxX=0,maxY=0;for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const v=new T.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);maxX=Math.max(maxX,Math.abs(v.x));maxY=Math.max(maxY,Math.abs(v.y));}const fit=Math.max(maxY,maxX/aspect)*1.12;camera.left=-fit*aspect;camera.right=fit*aspect;camera.top=fit;camera.bottom=-fit;camera.updateProjectionMatrix();}
   controls.object=camera;controls.target.copy(center);controls.enableRotate=!ortho;controls.update();emitView(true);
  }
  function outlineView(){clear(viewRoot);const p=latest.current;if(!p.mini||!p.view?.length)return;const outline=line(viewRoot,[...p.view,p.view[0]].map(([x,z])=>new T.Vector3(x,.12,z)),'#557d5f',true);(outline.material as T.LineDashedMaterial).depthTest=false;outline.renderOrder=50;}
  function rebuild(){
   const p=latest.current;if(drag)return;clear(root);clear(annotation);objects.clear();outlines.clear();
   const rooms=p.mini?p.house.rooms:p.house.rooms.filter(r=>r.id===p.roomId);const warn=warnings(p.house);
   for(const r of rooms){
    const floor=box(root,r.w,.15,r.d,'#ffffff',r.x,-.095,r.z,.01);floor.userData.id=r.id;(floor.material as T.MeshStandardMaterial).map=roomTexture(r,'floor');
    const wallTexture=roomTexture(r,'wall');
    for(const wall of ['north','south','west','east'] as const){
     const alongX=wall==='north'||wall==='south',len=alongX?r.w:r.d;
     const fixed=wall==='north'?r.z-r.d/2:wall==='south'?r.z+r.d/2:wall==='west'?r.x-r.w/2:r.x+r.w/2;
     const holes=p.house.doors.filter(d=>d.roomId===r.id&&d.wall===wall).map(d=>({a:d.offset-d.width/2,b:d.offset+d.width/2})).sort((a,b)=>a.a-b.a);
     let start=-len/2;const sections:{a:number;b:number}[]=[];for(const hole of holes){sections.push({a:start,b:hole.a});start=hole.b;}sections.push({a:start,b:len/2});
     const tall=!p.mini&&p.mode==='3d'&&(wall==='north'||wall==='west'),h=tall?1.15:.16;
     for(const s of sections)if(s.b>s.a){const middle=(s.a+s.b)/2;const wallMesh=box(root,alongX?s.b-s.a:.12,h,alongX?.12:s.b-s.a,'#ffffff',alongX?r.x+middle:fixed,h/2,alongX?fixed:r.z+middle,.008);(wallMesh.material as T.MeshStandardMaterial).map=wallTexture;}
    }
    if(!p.mini){const rug=new T.Mesh(new T.PlaneGeometry(Math.min(3.5,r.w*.7),Math.min(2.65,r.d*.7)),new T.MeshStandardMaterial({color:r.id==='living'?'#ece8dc':'#e8e4da',roughness:1}));rug.rotation.x=-Math.PI/2;rug.position.set(r.x,.009,r.z);rug.receiveShadow=true;root.add(rug);if(p.grid){const grid=new T.GridHelper(1,10,'#c6c9ba','#d7d8cc');grid.scale.set(r.w,1,r.d);grid.position.set(r.x,.014,r.z);root.add(grid);}if(p.measure)dimensions(r);}
    else label(annotation,r.name,r.x,.2,r.z,'#57674f',.95);
   }
   for(const f of p.house.items.filter(f=>rooms.some(r=>r.id===f.roomId))){
    const g=furniture(f);root.add(g);objects.set(f.id,g);
    const color=warn[f.id]?'#cc7457':p.selected.includes(f.id)?'#376653':f.locked?'#ab9371':'#a0b296';
    const height=f.kind==='desk'?f.h+.45:f.kind==='bed'?1:f.h+.16;
    const edge=new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(f.w+.09,height,f.d+.09)),new T.LineDashedMaterial({color,dashSize:.11,gapSize:.065,depthTest:false,transparent:true,opacity:.9}));edge.computeLineDistances();edge.position.y=height/2;edge.renderOrder=20;g.add(edge);edge.visible=!p.mini&&(p.selected.includes(f.id)||!!warn[f.id]||f.locked);outlines.set(f.id,edge);
    if(!p.mini&&p.selected.includes(f.id)){label(annotation,`${f.name}${f.locked?' · 已锁定':''}  ${f.w} × ${f.d} m`,f.x,f.h+.4,f.z,'#376653');}
   }
   for(const d of p.house.doors.filter(d=>rooms.some(r=>r.id===d.roomId))){
    const f=doorFrame(p.house,d),g=new T.Group();g.userData.id=d.id;root.add(g);
    const a=doorPoint(p.house,d,d.open?90:0),h=p.mode==='2d'||p.mini?.08:1.05;
    const mesh=box(g,d.width,h,.045,p.selected.includes(d.id)?'#789b83':'#b3916c',(f.hx+a[0])/2,h/2,(f.hz+a[1])/2,.01);mesh.rotation.y=-Math.atan2(a[1]-f.hz,a[0]-f.hx);
    const arc=doorSweep(p.house,d).slice(1).map(([x,z])=>new T.Vector3(x,.035,z));line(g,arc,warn[d.id]?'#cc7457':'#a48a64',true);line(g,[new T.Vector3(f.hx,.04,f.hz),new T.Vector3(a[0],.04,a[1])],p.selected.includes(d.id)?'#376653':'#a48a64');
    if(p.selected.includes(d.id)&&!p.mini)label(annotation,'房门 · '+(d.open?'开启':'关闭'),f.x,1.4,f.z);
   }
   for(const w of p.house.windows.filter(w=>rooms.some(r=>r.id===w.roomId))){
    const r=roomOf(p.house,w.roomId),alongX=w.wall==='north'||w.wall==='south',x=alongX?r.x+w.offset:r.x+(w.wall==='west'?-r.w/2:r.w/2),z=alongX?r.z+(w.wall==='north'?-r.d/2:r.d/2):r.z+w.offset;
    const g=new T.Group();g.userData.id=w.id;root.add(g);const wh=p.mode==='2d'||p.mini?.05:.65,y=p.mode==='2d'||p.mini?.04:.82;
    box(g,alongX?w.width:.16,wh,alongX?.16:w.width,p.selected.includes(w.id)?'#6d9d97':'#b4d0cc',x,y,z,.008);
    if(p.selected.includes(w.id)&&!p.mini)label(annotation,`窗户 · ${w.width} m`,x,1.65,z,'#397c78');
   }
   if(activeRoom!==p.roomId||activeMode!==p.mode)reset();outlineView();
  }
  function emitView(force=false){const p=latest.current;if(p.mini||!p.onView||!force&&performance.now()-lastView<180)return;lastView=performance.now();let points:[number,number][]=[];
   // Project the editing area that is not covered by the property panel onto the floor.
   const right=Math.max(.1,1-2*310/width);
   for(const [x,y] of [[-.88,-.88],[right,-.88],[right,.88],[-.88,.88]]){ray.setFromCamera(new T.Vector2(x,y),camera);const v=ray.ray.intersectPlane(plane,new T.Vector3());if(v&&Math.abs(v.x)<1000&&Math.abs(v.z)<1000)points.push([v.x,v.z]);}
   if(points.length!==4){p.onView([]);return;}
   // Clip to the active room: other rooms are not rendered in the main canvas.
   const r=roomOf(p.house,p.roomId),boundaries:[number,number,number][]=[[0,r.x-r.w/2,1],[0,r.x+r.w/2,-1],[1,r.z-r.d/2,1],[1,r.z+r.d/2,-1]];
   for(const [axis,boundary,sign] of boundaries){const out:[number,number][]=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],insideA=(a[axis]-boundary)*sign>=0,insideB=(b[axis]-boundary)*sign>=0;if(insideA)out.push(a);if(insideA!==insideB){const t=(boundary-a[axis])/(b[axis]-a[axis]);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}points=out;}
   p.onView(points);
  }
  controls.addEventListener('change',()=>emitView());
  function drawPreview(h:House){const warn=warnings(h);for(const f of h.items){const g=objects.get(f.id);if(!g)continue;g.position.set(f.x,0,f.z);const edge=outlines.get(f.id);if(edge){edge.visible=latest.current.selected.includes(f.id)||!!warn[f.id]||drag?.ids.includes(f.id)||f.locked;(edge.material as T.LineBasicMaterial).color.set(warn[f.id]?'#cc7457':'#376653');}}}
  function down(e:PointerEvent){
   if(e.button!==0||drag)return;const p=latest.current,result=hit(e);if(!result.point)return;
   if(p.tool==='measure'&&!p.mini){clear(measureRoot);if(!measureStart){measureStart=result.point.clone();p.onMessage('测量：再点击一个位置，查看两点间距离。');}else{const end=result.point.clone();line(measureRoot,[measureStart.clone().setY(.12),end.clone().setY(.12)],'#b88045');label(measureRoot,`${measureStart.distanceTo(end).toFixed(2)} m`,(measureStart.x+end.x)/2,.35,(measureStart.z+end.z)/2,'#9e6a35');measureStart=null;p.onMessage('测量完成；继续点击可开始下一次测量。');}return;}
   const item=p.house.items.find(f=>f.id===result.id),moving=!p.mini&&furnitureDragAction(item,p.selected,p.tool,e.shiftKey)==='move';
   const id=p.mini?result.id:moving?result.id:'',ids=moving?[...p.selected]:[];
   drag={startX:e.clientX,startY:e.clientY,point:result.point.clone(),id,hitId:result.id,ids,base:copy(p.house),preview:null,moved:false,blocked:false,add:e.shiftKey,pointerId:e.pointerId};
   if(!p.mini){controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);}
  }
  function move(e:PointerEvent){
   if(rightOrbit?.isActive())return;
   const p=latest.current;
   if(!drag){if(p.mini)return;const {id}=hit(e);if(hover!==id){const prev=outlines.get(hover);if(prev&&!p.selected.includes(hover)&&!p.house.items.find(f=>f.id===hover)?.locked&&!warnings(p.house)[hover])prev.visible=false;hover=id;const next=outlines.get(id);if(next)next.visible=true;}const f=p.house.items.find(f=>f.id===id);renderer.domElement.style.cursor=p.tool==='measure'||p.tool==='box'?'crosshair':furnitureDragAction(f,p.selected,p.tool)==='move'?'grab':id?'pointer':'default';return;}
   if(e.pointerId!==drag.pointerId)return;
   const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;if(Math.hypot(dx,dy)>5)drag.moved=true;if(!drag.moved||p.mini)return;
   const item=drag.base.items.find(f=>f.id===drag!.id);
   if(item){if(drag.base.items.some(f=>drag!.ids.includes(f.id)&&f.locked)){p.onMessage('所选家具包含锁定物件，请先解锁或移出选择。');return;}const v=point(e);if(!v)return;drag.preview=moveItems(drag.base,drag.ids,v.x-drag.point.x,v.z-drag.point.z,p.grid);const anchor=drag.base.items.find(f=>drag!.ids.includes(f.id))!,moved=drag.preview.items.find(f=>f.id===anchor.id)!;drag.blocked=Math.abs(moved.x-snap(anchor.x+v.x-drag.point.x,p.grid))>1e-6||Math.abs(moved.z-snap(anchor.z+v.z-drag.point.z,p.grid))>1e-6;if(drag.blocked)p.onMessage('已到墙边 · 家具保持在墙内，可沿墙继续移动。');drawPreview(drag.preview);}
   else if(!drag.id||p.house.rooms.some(r=>r.id===drag!.id)){const bounds=el.getBoundingClientRect();rect.hidden=false;const left=Math.min(e.clientX,drag.startX)-bounds.left,top=Math.min(e.clientY,drag.startY)-bounds.top;Object.assign(rect.style,{left:left+'px',top:top+'px',width:Math.abs(dx)+'px',height:Math.abs(dy)+'px'});let count=0;for(const f of p.house.items.filter(f=>f.roomId===p.roomId)){const v=project(f.x,f.h/2,f.z),inside=!f.locked&&v.x>=left&&v.x<=left+Math.abs(dx)&&v.y>=top&&v.y<=top+Math.abs(dy);if(inside)count++;const edge=outlines.get(f.id);if(edge)edge.visible=inside||p.selected.includes(f.id)||f.locked||!!warnings(p.house)[f.id];}rect.dataset.count=`${count} 件家具`;}
  }
  function finish(cancel=false,e?:PointerEvent){
   if(!drag)return;const d=drag;drag=null;rect.hidden=true;controls.enabled=true;const p=latest.current;
   if(renderer.domElement.hasPointerCapture(d.pointerId))renderer.domElement.releasePointerCapture(d.pointerId);
   if(cancel){drawPreview(p.house);p.onMessage('已取消本次拖动。');rebuild();return;}
   if(p.mini){if(!d.moved&&e){const {id}=hit(e);const r=p.house.rooms.find(r=>r.id===id)||p.house.rooms.find(r=>r.id===p.house.items.find(f=>f.id===id)?.roomId)||p.house.rooms.find(r=>r.id===p.house.doors.find(f=>f.id===id)?.roomId);if(r)p.onRoom?.(r.id);}return;}
   if(d.preview){if(p.onCommit(d.preview)){const warns=warnings(d.preview);const count=d.ids.filter(id=>warns[id]).length;p.onMessage(d.blocked?'已停在墙边，家具不会移出房间。':count?'已移动；橙色轮廓表示家具重叠或挡门，可撤销调整。':p.grid?'已移动家具 · 位置已吸附到 10 cm 网格。':'已移动家具。');}}
   else if(d.moved&&(!d.id||p.house.rooms.some(r=>r.id===d.id))&&e){const b=el.getBoundingClientRect(),x1=Math.min(d.startX,e.clientX)-b.left,x2=Math.max(d.startX,e.clientX)-b.left,y1=Math.min(d.startY,e.clientY)-b.top,y2=Math.max(d.startY,e.clientY)-b.top;const eligible=p.house.items.filter(f=>f.roomId===p.roomId&&!f.locked);const ids=eligible.filter(f=>{const v=project(f.x,f.h/2,f.z);return v.x>=x1&&v.x<=x2&&v.y>=y1&&v.y<=y2;}).map(f=>f.id);const previous=eligible.filter(f=>p.selected.includes(f.id)).map(f=>f.id);p.onSelect(d.add?[...new Set([...previous,...ids])]:ids);p.onMessage(`已框选 ${ids.length} 件家具，已跳过锁定物件。`);}
   else if(!d.moved){const id=d.hitId,f=p.house.items.find(f=>f.id===id);if([...p.house.items,...p.house.doors,...p.house.windows].some(f=>f.id===id)){p.onSelect(d.add&&f&&!f.locked?p.selected.includes(id)?p.selected.filter(x=>x!==id):[...p.selected,id]:[id]);p.onMessage(f?.locked?'已选中锁定家具，可查看属性或解锁。':'已选中；再次按住拖动可移动家具。');}else p.onSelect([]);}
   else if(!d.id||p.house.rooms.some(r=>r.id===d.id))p.onSelect([]);
   rebuild();
  }
  const up=(e:PointerEvent)=>{if(e.button===0)finish(false,e);},cancel=()=>finish(true),key=(e:KeyboardEvent)=>{if(e.key==='Escape'){finish(true);clear(measureRoot);measureStart=null;}};
  const context=(e:Event)=>e.preventDefault();renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',cancel);renderer.domElement.addEventListener('lostpointercapture',cancel);renderer.domElement.addEventListener('contextmenu',context);window.addEventListener('keydown',key);window.addEventListener('blur',cancel);
  const resize=new ResizeObserver(()=>{width=Math.max(1,el.clientWidth);height=Math.max(1,el.clientHeight);renderer.setSize(width,height);if(camera instanceof T.PerspectiveCamera)camera.aspect=width/height;else{const span=(camera.top-camera.bottom)/2;camera.left=-span*width/height;camera.right=span*width/height;}camera.updateProjectionMatrix();emitView(true);});resize.observe(el);
  engine.current={rebuild,reset,outlineView};reset();rebuild();
  function tick(){frame=requestAnimationFrame(tick);controls.update();renderer.render(scene,camera);}tick();
  return()=>{engine.current=null;cancelAnimationFrame(frame);resize.disconnect();window.removeEventListener('keydown',key);window.removeEventListener('blur',cancel);rightOrbit?.dispose();controls.dispose();dispose(scene);renderer.dispose();renderer.domElement.remove();rect.remove();};
 },[]);
 useEffect(()=>{engine.current?.rebuild();},[props.house,props.roomId,props.mode,props.selected,props.grid,props.measure]);
 useEffect(()=>{engine.current?.reset();},[props.resetKey]);
 useEffect(()=>{engine.current?.outlineView();},[props.view]);
 return <div className={'scene-host '+(props.mini?'mini-scene':'')} ref={host}>{error&&<div className="canvas-error" role="alert">{error}</div>}</div>;
}
