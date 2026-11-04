import {useEffect,useRef,useState} from 'react';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {copy,doorFrame,doorPoint,doorSweep,moveItems,roomOf,snap,warnings,type House,type Item,type Room,type Tool} from './model';
import {bindRightOrbit} from './rightOrbit';
import {furnitureDragAction} from './selection';
import {roomTexture} from './materials';
import {furniture as realFurniture,loadFurnitureAssets} from './furniture';
import {roomHeight,doorHeight,windowHeight,windowSill,wallSections,type Wall} from './architecture';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {previewMove} from './placement';

type Props={house:House;draft?:House|null;insets?:{left:number;right:number;top:number;bottom:number};blocked?:boolean;onBusy?:(busy:boolean)=>void;roomId:string;mode:'2d'|'3d';selected:string[];tool:Tool;grid:boolean;measure:boolean;resetKey:number;realistic?:boolean;mini?:boolean;view?:[number,number][];onSelect:(ids:string[])=>void;onCommit:(h:House)=>boolean;onMessage:(s:string)=>void;onPreview?:(h:House|null)=>void;onView?:(p:[number,number][])=>void;onRoom?:(id:string)=>void};
type Engine={rebuild:()=>void;reset:()=>void;outlineView:()=>void;preview:(h:House)=>void;reframe:()=>void};
function dispose(root:T.Object3D){const maps=new Set<T.Texture>();root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line||o instanceof T.Sprite){if('geometry'in o)o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const value of Object.values(m))if(value instanceof T.Texture)maps.add(value);m.dispose();}}});maps.forEach(t=>t.dispose());}
function box(parent:T.Object3D,w:number,h:number,d:number,color:string,x=0,y=0,z=0,round=.025){
 const mesh=new T.Mesh(round?new RoundedBoxGeometry(w,h,d,2,Math.min(round,w/4,h/4,d/4)):new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.8}));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function line(parent:T.Object3D,points:T.Vector3[],color:string,dashed=false){const geo=new T.BufferGeometry().setFromPoints(points);const mat=dashed?new T.LineDashedMaterial({color,dashSize:.12,gapSize:.07}):new T.LineBasicMaterial({color});const l=new T.Line(geo,mat);if(dashed)l.computeLineDistances();parent.add(l);return l;}
function label(parent:T.Object3D,text:string,x:number,y:number,z:number,color='#516356',scale=.9){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d')!;ctx.font='500 33px "Microsoft YaHei", sans-serif';const width=Math.min(495,ctx.measureText(text).width+40);ctx.fillStyle='rgba(255,255,255,.94)';ctx.beginPath();ctx.roundRect((512-width)/2,8,width,76,18);ctx.fill();ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,48);const texture=new T.CanvasTexture(canvas);const s=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false,transparent:true}));s.position.set(x,y,z);s.scale.set(2.7*scale,.5*scale,1);s.renderOrder=30;parent.add(s);return s;
}
export default function Scene(props:Props){
 const host=useRef<HTMLDivElement>(null),latest=useRef(props),engine=useRef<Engine|null>(null);latest.current=props;
 const [error,setError]=useState(''),[modelStatus,setModelStatus]=useState('loading');
 useEffect(()=>{
  const el=host.current!;let renderer:T.WebGLRenderer;
  try{renderer=new T.WebGLRenderer({antialias:true,alpha:true});}catch{setError('3D 未能启动，请使用开启硬件加速的 Chrome 或 Edge。');return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=!props.mini;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.setClearColor('#e7e6e1',1);renderer.domElement.setAttribute('aria-label',props.mini?'全屋三维地图':'房间编辑画布');renderer.domElement.style.touchAction='none';el.appendChild(renderer.domElement);
  const scene=new T.Scene();let disposed=false;const facades:{group:T.Group;r:Room;wall:Wall}[]=[];const root=new T.Group(),annotation=new T.Group(),viewRoot=new T.Group(),measureRoot=new T.Group();scene.add(root,annotation,viewRoot,measureRoot);
  const environment=new RoomEnvironment();const pmrem=new T.PMREMGenerator(renderer);const envTarget=pmrem.fromScene(environment,.04);scene.environment=envTarget.texture;scene.environmentIntensity=.65;environment.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight('#edf3ff','#9c9082',1));const sun=new T.DirectionalLight('#fff5e5',2.5);sun.position.set(-3,8,-5);sun.castShadow=!props.mini;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-12;sun.shadow.camera.right=12;sun.shadow.camera.top=12;sun.shadow.camera.bottom=-12;sun.shadow.normalBias=.035;sun.shadow.bias=-.0001;scene.add(sun);
  let camera:T.PerspectiveCamera|T.OrthographicCamera=new T.PerspectiveCamera(40,1,.1,200);const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.12;controls.minDistance=4;controls.maxDistance=35;controls.minZoom=.35;controls.maxZoom=5;controls.maxPolarAngle=Math.PI/2.25;controls.minPolarAngle=.08;
  controls.mouseButtons={LEFT:props.mini?T.MOUSE.PAN:null as unknown as T.MOUSE,MIDDLE:T.MOUSE.PAN,RIGHT:props.mini?T.MOUSE.PAN:null as unknown as T.MOUSE};
  const rightOrbit=props.mini?null:bindRightOrbit(renderer.domElement,controls,{canRotate:()=>latest.current.mode==='3d',message:s=>latest.current.onMessage(s),});
  const ray=new T.Raycaster(),pointer=new T.Vector2(),plane=new T.Plane(new T.Vector3(0,1,0),0),objects=new Map<string,T.Group>(),outlines=new Map<string,T.Line>();
  const poses=new Map<string,{position:T.Vector3;target:T.Vector3;zoom:number}>();const targets=new Map<string,T.Vector3>();const clock=new T.Clock();
  let activeRealistic=false;let width=Math.max(1,el.clientWidth),height=Math.max(1,el.clientHeight),activeRoom='',activeMode='',frame=0,hover='',lastView=0,measureStart:T.Vector3|null=null;
  type Drag={startX:number;startY:number;point:T.Vector3;id:string;hitId:string;ids:string[];base:House;preview:House|null;moved:boolean;blocked:boolean;valid:boolean;yieldId?:string;reason:string;add:boolean;pointerId:number};let drag:Drag|null=null;
  const rect=document.createElement('div');rect.className='selection-marquee';rect.hidden=true;el.appendChild(rect);
  function clear(g:T.Group){dispose(g);g.clear();}
  function project(x:number,y:number,z:number){const v=new T.Vector3(x,y,z).project(camera);return {x:(v.x+1)/2*width,y:(1-v.y)/2*height};}
  function hit(e:PointerEvent){const b=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);ray.setFromCamera(pointer,camera);const hits=ray.intersectObject(root,true);for(const h of hits){let ancestor:T.Object3D|null=h.object,hidden=false;while(ancestor){if(!ancestor.visible){hidden=true;break;}ancestor=ancestor.parent;}if(hidden)continue;let obj:T.Object3D|null=h.object;while(obj&&obj!==root){if(obj.userData.id)return {id:obj.userData.id as string,point:ray.ray.intersectPlane(plane,new T.Vector3())};obj=obj.parent;}}return {id:'',point:ray.ray.intersectPlane(plane,new T.Vector3())};}
  function point(e:PointerEvent){const b=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);ray.setFromCamera(pointer,camera);return ray.ray.intersectPlane(plane,new T.Vector3());}
  function dimensions(r:Room){
   const z=r.z+r.d/2+.35,x=r.x-r.w/2-.35,c='#738573';line(annotation,[new T.Vector3(r.x-r.w/2,.04,z),new T.Vector3(r.x+r.w/2,.04,z)],c);line(annotation,[new T.Vector3(x,.04,r.z-r.d/2),new T.Vector3(x,.04,r.z+r.d/2)],c);
   label(annotation,`${r.w.toFixed(2)} m`,r.x,.08,z,c,.8);label(annotation,`${r.d.toFixed(2)} m`,x,.08,r.z,c,.8);
  }
  function frameView(fit=false){
   const p=latest.current;if(p.mini||p.realistic){camera.clearViewOffset();return;}
   const v=p.insets??{left:80,right:20,top:82,bottom:100};
   const freeW=Math.max(160,width-v.left-v.right),freeH=Math.max(140,height-v.top-v.bottom);
   camera.setViewOffset(width,height,width/2-(v.left+freeW/2),height/2-(v.top+freeH/2),width,height);
   if(fit&&camera instanceof T.PerspectiveCamera){
    const r=roomOf(p.house,p.roomId),direction=camera.position.clone().sub(controls.target).normalize();
    camera.lookAt(controls.target);camera.updateMatrixWorld(true);const inverse=camera.quaternion.clone().invert(),tan=Math.tan(camera.fov*Math.PI/360);let distance=4;
    for(const x of [r.x-r.w/2,r.x+r.w/2])for(const y of [0,roomHeight(r)])for(const z of [r.z-r.d/2,r.z+r.d/2]){
     const point=new T.Vector3(x,y,z).sub(controls.target).applyQuaternion(inverse);
     distance=Math.max(distance,Math.abs(point.x)/(tan*(width/height)*(freeW/width))+point.z,Math.abs(point.y)/(tan*(freeH/height))+point.z);
    }
    camera.position.copy(controls.target).addScaledVector(direction,distance*1.07);
   }
   if(fit&&camera instanceof T.OrthographicCamera){const r=roomOf(p.house,p.roomId),span=Math.max(r.d*height/freeH,r.w*height/freeW)*.57;camera.top=span;camera.bottom=-span;camera.left=-span*width/height;camera.right=span*width/height;camera.zoom=1;}
   camera.updateProjectionMatrix();controls.update();emitView(true);
  }
  function reset(){
   rightOrbit?.cancel();
   const p=latest.current,r=roomOf(p.house,p.roomId),mini=p.mini;
   const nextKey=p.roomId+'|'+p.mode+'|'+!!p.realistic,oldKey=activeRoom+'|'+activeMode+'|'+activeRealistic;
   if(activeRoom&&nextKey!==oldKey&&!mini)poses.set(oldKey,{position:camera.position.clone(),target:controls.target.clone(),zoom:camera.zoom});
   const remembered=nextKey!==oldKey&&!mini?poses.get(nextKey):undefined;
   activeRoom=p.roomId;activeMode=p.mode;activeRealistic=!!p.realistic;
   const ortho=mini||p.mode==='2d',aspect=width/height,span=mini?4.5:Math.max(r.w,r.d)*.74;
   camera=ortho?new T.OrthographicCamera(-span*aspect,span*aspect,span,-span,.1,150):new T.PerspectiveCamera(40,aspect,.1,150);
   const bounds=new T.Box3();for(const room of p.house.rooms){bounds.expandByPoint(new T.Vector3(room.x-room.w/2,0,room.z-room.d/2));bounds.expandByPoint(new T.Vector3(room.x+room.w/2,1.3,room.z+room.d/2));}
   const center=mini?bounds.getCenter(new T.Vector3()):new T.Vector3(r.x,p.mode==='3d'?roomHeight(r)*.2:0,r.z);
   if(mini)camera.position.copy(center).add(new T.Vector3(8,13,12));else if(ortho){camera.position.copy(center).add(new T.Vector3(0,15,.001));}else if(p.realistic){center.y=1.45;camera.position.set(r.x+r.w*.2,1.6,r.z+r.d*.35);}else camera.position.copy(center).add(new T.Vector3(7.6,8,10.2).multiplyScalar(Math.max(r.w,r.d)/7.3));
   if(remembered){camera.position.copy(remembered.position);center.copy(remembered.target);camera.zoom=remembered.zoom;}
   camera.lookAt(center);
   if(mini&&camera instanceof T.OrthographicCamera){camera.updateMatrixWorld(true);let maxX=0,maxY=0;for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const v=new T.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);maxX=Math.max(maxX,Math.abs(v.x));maxY=Math.max(maxY,Math.abs(v.y));}const fit=Math.max(maxY,maxX/aspect)*1.12;camera.left=-fit*aspect;camera.right=fit*aspect;camera.top=fit;camera.bottom=-fit;camera.updateProjectionMatrix();}
   controls.object=camera;controls.target.copy(center);controls.minDistance=p.realistic ? .35 : 4;controls.maxPolarAngle=p.realistic ? Math.PI*.495 : Math.PI/2.25;controls.maxDistance=p.realistic?Math.max(r.w,r.d)*1.5:35;controls.enableRotate=!ortho;controls.update();frameView(!remembered);emitView(true);
  }
  function outlineView(){clear(viewRoot);const p=latest.current;if(!p.mini||!p.view?.length)return;const outline=line(viewRoot,[...p.view,p.view[0]].map(([x,z])=>new T.Vector3(x,.12,z)),'#557d5f',true);(outline.material as T.LineDashedMaterial).depthTest=false;outline.renderOrder=50;}
  function rebuild(){
   targets.clear();const p=latest.current;if(drag)return;clear(root);clear(annotation);objects.clear();outlines.clear();facades.length=0;
   const rooms=p.mini?p.house.rooms:p.house.rooms.filter(r=>r.id===p.roomId);const warn=warnings(p.house);
   for(const r of rooms){
    const floor=box(root,r.w,.15,r.d,'#ffffff',r.x,-.095,r.z,.01);floor.userData.id=r.id;const floorMat=floor.material as T.MeshStandardMaterial;floorMat.map=roomTexture(r,'floor');floorMat.roughness=.58;floorMat.bumpMap=floorMat.map;floorMat.bumpScale=.009;
    if(p.realistic&&!p.mini&&p.mode==='3d')box(root,r.w,.04,r.d,'#efeee8',r.x,roomHeight(r)+.02,r.z,.001);
    for(const wall of ['north','south','west','east'] as const){
     const alongX=wall==='north'||wall==='south',len=alongX?r.w:r.d;
     const fixed=wall==='north'?r.z-r.d/2:wall==='south'?r.z+r.d/2:wall==='west'?r.x-r.w/2:r.x+r.w/2;
     const shell=new T.Group();root.add(shell);facades.push({group:shell,r,wall});
     const full=!p.mini&&p.mode==='3d';
     const sections=full?wallSections(p.house,r,wall):[{a:-len/2,b:len/2,low:0,high:.12}];
     for(const section of sections){const middle=(section.a+section.b)/2,height=section.high-section.low;
      const panel=box(shell,alongX?section.b-section.a:.12,height,alongX?.12:section.b-section.a,'#ffffff',alongX?r.x+middle:fixed,section.low+height/2,alongX?fixed:r.z+middle,.003);
      const mat=panel.material as T.MeshStandardMaterial;mat.map=roomTexture(r,'wall');mat.roughness=.9;
     }
     // Skirting remains at floor level even when the near wall is cut away.
     const doorHoles=p.house.doors.filter(d=>d.roomId===r.id&&d.wall===wall).map(d=>({a:d.offset-d.width/2,b:d.offset+d.width/2})).sort((a,b)=>a.a-b.a);
     let start=-len/2;const edges:{a:number;b:number}[]=[];for(const hole of doorHoles){edges.push({a:start,b:hole.a});start=hole.b;}edges.push({a:start,b:len/2});
     for(const edge of edges)if(edge.b>edge.a){const middle=(edge.a+edge.b)/2;box(root,alongX?edge.b-edge.a:.025,.085,alongX?.025:edge.b-edge.a,'#d2cdc2',alongX?r.x+middle:fixed,.043,alongX?fixed:r.z+middle,.002);}
    }
    if(!p.mini){if(p.grid&&!p.realistic&&(p.selected.length||p.tool!=='select')){const grid=new T.GridHelper(1,10,'#a6aaa1','#c0c2ba');grid.scale.set(r.w,1,r.d);grid.position.set(r.x,.014,r.z);root.add(grid);}if(p.measure&&!p.realistic)dimensions(r);}
    else label(annotation,r.name,r.x,.2,r.z,'#57674f',.95);
   }
   for(const f of p.house.items.filter(f=>rooms.some(r=>r.id===f.roomId))){
    const g=realFurniture(f,!!p.mini);root.add(g);objects.set(f.id,g);
    const color=warn[f.id]?'#cc7457':p.selected.includes(f.id)?'#376653':f.locked?'#ab9371':'#a0b296';
    const height=f.kind==='desk'?f.h+.45:f.kind==='bed'?1:f.h+.16;
    const edge=new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(f.w+.09,height,f.d+.09)),new T.LineDashedMaterial({color,dashSize:.11,gapSize:.065,depthTest:false,transparent:true,opacity:.9}));edge.computeLineDistances();edge.position.y=height/2;edge.renderOrder=20;g.add(edge);edge.visible=!p.mini&&!p.realistic&&(p.selected.includes(f.id)||!!warn[f.id]||f.locked);outlines.set(f.id,edge);
    if(!p.mini&&!p.realistic&&p.selected.includes(f.id)){label(annotation,`${f.name}${f.locked?' · 已锁定':''}  ${f.w} × ${f.d} m`,f.x,f.h+.4,f.z,'#376653');}
   }
   for(const d of p.house.doors.filter(d=>rooms.some(r=>r.id===d.roomId))){
    const r=roomOf(p.house,d.roomId),f=doorFrame(p.house,d),g=new T.Group();g.userData.id=d.id;root.add(g);
    facades.push({group:g,r,wall:d.wall});
    const end=doorPoint(p.house,d,d.open?90:0),h=p.mode==='2d'||p.mini?.08:doorHeight(d);
    const leaf=new T.Group();leaf.position.set(f.hx,0,f.hz);leaf.rotation.y=-Math.atan2(end[1]-f.hz,end[0]-f.hx);g.add(leaf);
    box(leaf,d.width-.015,h,.04,p.selected.includes(d.id)?'#8d9b91':'#b7a086',d.width/2,h/2,0,.004);
    if(h>.2){
     for(const side of [-1,1]){box(leaf,d.width-.18,h*.35,.006,'#ac9479',d.width/2,h*.7,side*.023,.007);box(leaf,d.width-.18,h*.35,.006,'#ac9479',d.width/2,h*.27,side*.023,.007);
      const knob=box(leaf,.12,.018,.022,'#6f6d63',d.width-.13,1.02,side*.045,.006);(knob.material as T.MeshStandardMaterial).metalness=.8;}
     const alongX=d.wall==='north'||d.wall==='south';
     for(const sign of [-1,1])box(g,alongX?.055:.16,h+.05,alongX?.16:.055,'#ded9cf',f.x+f.ux*sign*(d.width/2+.018),(h+.05)/2,f.z+f.uz*sign*(d.width/2+.018),.003);
     box(g,alongX?d.width+.09:.16,.065,alongX?.16:d.width+.09,'#ded9cf',f.x,h+.03,f.z,.003);
    }
    if(!p.realistic){const arc=doorSweep(p.house,d).slice(1).map(([x,z])=>new T.Vector3(x,.035,z));line(g,arc,warn[d.id]?'#ad6754':'#a3947e',true);}
    if(p.selected.includes(d.id)&&!p.mini&&!p.realistic)label(annotation,`房门 · ${d.width} × ${doorHeight(d)} m`,f.x,h+.25,f.z);
   }
   for(const w of p.house.windows.filter(w=>rooms.some(r=>r.id===w.roomId))){
    const r=roomOf(p.house,w.roomId),alongX=w.wall==='north'||w.wall==='south',x=alongX?r.x+w.offset:r.x+(w.wall==='west'?-r.w/2:r.w/2),z=alongX?r.z+(w.wall==='north'?-r.d/2:r.d/2):r.z+w.offset;
    const g=new T.Group();g.userData.id=w.id;root.add(g);facades.push({group:g,r,wall:w.wall});
    const flat=p.mode==='2d'||p.mini,h=flat?.05:windowHeight(w),y=flat?.04:windowSill(w)+h/2;
    const glass=box(g,alongX?w.width:.02,h,alongX?.02:w.width,'#b7c6c7',x,y,z,.001);const mat=glass.material as T.MeshStandardMaterial;
    mat.transparent=true;mat.opacity=.23;mat.roughness=.12;mat.metalness=.2;glass.castShadow=false;
    const color=p.selected.includes(w.id)?'#647c76':'#b6b3a9';
    for(const sign of [-1,1])box(g,alongX?w.width+.08:.14,.045,alongX?.14:w.width+.08,color,x,y+sign*h/2,z,.002);
    for(const sign of [-1,0,1])box(g,alongX?.035:.12,h,alongX?.12:.035,color,x+(alongX?sign*w.width/2:0),y,z+(alongX?0:sign*w.width/2),.002);
    if(!flat)box(g,alongX?w.width+.16:.24,.04,alongX?.24:w.width+.16,'#d4d1c7',x,windowSill(w)-.025,z,.003);
    if(p.selected.includes(w.id)&&!p.mini&&!p.realistic)label(annotation,`窗户 · ${w.width} × ${windowHeight(w)} m`,x,y+h/2+.2,z,'#397c78');
   }
   if(activeRoom!==p.roomId||activeMode!==p.mode||activeRealistic!==!!p.realistic)reset();outlineView();if(p.mini&&p.draft)drawPreview(p.draft);
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
  function drawPreview(h:House,yieldId?:string){targets.clear();const warn=warnings(h);for(const f of h.items){const g=objects.get(f.id);if(!g)continue;if(f.id===yieldId)targets.set(f.id,new T.Vector3(f.x,0,f.z));else g.position.set(f.x,0,f.z);g.rotation.y=f.rotation*Math.PI/180;const edge=outlines.get(f.id);if(edge){edge.visible=!latest.current.mini&&!latest.current.realistic&&(latest.current.selected.includes(f.id)||!!warn[f.id]||!!drag?.ids.includes(f.id)||f.locked);(edge.material as T.LineBasicMaterial).color.set(warn[f.id]?'#cc7457':'#376653');}}}
  function down(e:PointerEvent){
   if(e.button!==0||drag||latest.current.blocked||latest.current.realistic&&!latest.current.mini)return;const p=latest.current,result=hit(e);if(!result.point)return;
   if(p.tool==='measure'&&!p.mini){clear(measureRoot);if(!measureStart){measureStart=result.point.clone();p.onMessage('测量：再点击一个位置，查看两点间距离。');}else{const end=result.point.clone();line(measureRoot,[measureStart.clone().setY(.12),end.clone().setY(.12)],'#b88045');label(measureRoot,`${measureStart.distanceTo(end).toFixed(2)} m`,(measureStart.x+end.x)/2,.35,(measureStart.z+end.z)/2,'#9e6a35');measureStart=null;p.onMessage('测量完成；继续点击可开始下一次测量。');}return;}
   const item=p.house.items.find(f=>f.id===result.id),moving=!p.mini&&furnitureDragAction(item,p.selected,p.tool,e.shiftKey)==='move';
   if(!p.mini&&p.tool==='select'&&item?.locked&&!e.shiftKey){if(!p.selected.includes(item.id))p.onSelect([item.id]);p.onMessage('家具已锁定，请先解锁；拖动不会启动框选。');return;}
   const id=p.mini?result.id:moving?result.id:'',ids=moving?(p.selected.includes(result.id)?[...p.selected]:[result.id]):[];
   if(moving&&!p.selected.includes(result.id))p.onSelect(ids);
   drag={startX:e.clientX,startY:e.clientY,point:result.point.clone(),id,hitId:result.id,ids,base:copy(p.house),preview:null,moved:false,blocked:false,valid:true,reason:'',add:e.shiftKey,pointerId:e.pointerId};
   if(!p.mini){p.onBusy?.(true);controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);}
  }
  function move(e:PointerEvent){
   if(rightOrbit?.isActive())return;
   const p=latest.current;
   if(!drag){if(p.mini||p.realistic)return;const {id}=hit(e);if(hover!==id){const prev=outlines.get(hover);if(prev&&!p.selected.includes(hover)&&!p.house.items.find(f=>f.id===hover)?.locked&&!warnings(p.house)[hover])prev.visible=false;hover=id;const next=outlines.get(id);if(next)next.visible=true;}const f=p.house.items.find(f=>f.id===id);renderer.domElement.style.cursor=p.tool==='measure'||p.tool==='box'?'crosshair':furnitureDragAction(f,p.selected,p.tool)==='move'?'grab':id?'pointer':'default';return;}
   if(e.pointerId!==drag.pointerId)return;
   const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;if(Math.hypot(dx,dy)>5)drag.moved=true;if(!drag.moved||p.mini)return;
   const item=drag.base.items.find(f=>f.id===drag!.id);
   if(item){
    const v=point(e);if(!v)return;const result=previewMove(drag.base,drag.ids,v.x-drag.point.x,v.z-drag.point.z,p.grid);
    drag.preview=result.house;drag.valid=result.valid;drag.yieldId=result.yieldId;drag.reason=result.message;
    const anchor=drag.base.items.find(f=>drag!.ids.includes(f.id))!,moved=drag.preview.items.find(f=>f.id===anchor.id)!;
    drag.blocked=Math.abs(moved.x-snap(anchor.x+v.x-drag.point.x,p.grid))>1e-6||Math.abs(moved.z-snap(anchor.z+v.z-drag.point.z,p.grid))>1e-6;
    p.onMessage(result.valid&&drag.blocked?'已到墙边，松手放置或沿墙移动。':result.message);drawPreview(result.house,result.yieldId);p.onPreview?.(result.house);
   }
   else if(!drag.id||p.house.rooms.some(r=>r.id===drag!.id)){const bounds=el.getBoundingClientRect();rect.hidden=false;const left=Math.min(e.clientX,drag.startX)-bounds.left,top=Math.min(e.clientY,drag.startY)-bounds.top;Object.assign(rect.style,{left:left+'px',top:top+'px',width:Math.abs(dx)+'px',height:Math.abs(dy)+'px'});let count=0;for(const f of p.house.items.filter(f=>f.roomId===p.roomId)){const v=project(f.x,f.h/2,f.z),inside=!f.locked&&v.x>=left&&v.x<=left+Math.abs(dx)&&v.y>=top&&v.y<=top+Math.abs(dy);if(inside)count++;const edge=outlines.get(f.id);if(edge)edge.visible=inside||p.selected.includes(f.id)||f.locked||!!warnings(p.house)[f.id];}rect.dataset.count=`${count} 件家具`;}
  }
  function finish(cancel=false,e?:PointerEvent){
   if(!drag)return;const d=drag;drag=null;rect.hidden=true;controls.enabled=true;const p=latest.current;if(!p.mini){p.onPreview?.(null);p.onBusy?.(false);}
   if(renderer.domElement.hasPointerCapture(d.pointerId))renderer.domElement.releasePointerCapture(d.pointerId);
   if(cancel){drawPreview(p.house);p.onMessage('已取消本次拖动。');rebuild();return;}
   if(p.mini){if(!d.moved&&e){const {id}=hit(e);const r=p.house.rooms.find(r=>r.id===id)||p.house.rooms.find(r=>r.id===p.house.items.find(f=>f.id===id)?.roomId)||p.house.rooms.find(r=>r.id===p.house.doors.find(f=>f.id===id)?.roomId);if(r)p.onRoom?.(r.id);}return;}
   if(d.preview){if(!d.valid){drawPreview(p.house);p.onMessage(d.reason.replace('松手将恢复原位','已恢复拖动前的位置'));}
    else if(p.onCommit(d.preview))p.onMessage(d.yieldId?'已确认移动及让位，一次撤销可全部恢复。':d.blocked?'已停在墙内边界。':'已放置家具，可撤销调整。');}
   else if(d.moved&&(!d.id||p.house.rooms.some(r=>r.id===d.id))&&e){const b=el.getBoundingClientRect(),x1=Math.min(d.startX,e.clientX)-b.left,x2=Math.max(d.startX,e.clientX)-b.left,y1=Math.min(d.startY,e.clientY)-b.top,y2=Math.max(d.startY,e.clientY)-b.top;const eligible=p.house.items.filter(f=>f.roomId===p.roomId&&!f.locked);const ids=eligible.filter(f=>{const v=project(f.x,f.h/2,f.z);return v.x>=x1&&v.x<=x2&&v.y>=y1&&v.y<=y2;}).map(f=>f.id);const previous=eligible.filter(f=>p.selected.includes(f.id)).map(f=>f.id);p.onSelect(d.add?[...new Set([...previous,...ids])]:ids);p.onMessage(`已框选 ${ids.length} 件家具，已跳过锁定物件。`);}
   else if(!d.moved){const id=d.hitId,f=p.house.items.find(f=>f.id===id);if([...p.house.items,...p.house.doors,...p.house.windows].some(f=>f.id===id)){p.onSelect(d.add&&f?p.selected.includes(id)?p.selected.filter(x=>x!==id):[...p.selected,id]:[id]);p.onMessage(f?.locked?'已选中锁定家具，可查看属性或解锁。':'已选中，直接拖动可移动家具。');}else p.onSelect([]);}
   else if(!d.id||p.house.rooms.some(r=>r.id===d.id))p.onSelect([]);
   rebuild();
  }
  const up=(e:PointerEvent)=>{if(e.button===0)finish(false,e);},cancel=()=>finish(true),key=(e:KeyboardEvent)=>{
   if(e.key!=='Escape'||latest.current.mini||latest.current.blocked||(e.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable]'))return;
   if(drag||rightOrbit?.isActive()||measureStart||measureRoot.children.length){e.preventDefault();e.stopImmediatePropagation();if(drag)finish(true);else if(rightOrbit?.isActive())rightOrbit.cancel();else{clear(measureRoot);measureStart=null;latest.current.onMessage('已取消测量。');}}
  };
  const context=(e:Event)=>e.preventDefault();renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',cancel);renderer.domElement.addEventListener('lostpointercapture',cancel);renderer.domElement.addEventListener('contextmenu',context);window.addEventListener('keydown',key,true);window.addEventListener('blur',cancel);
  const resize=new ResizeObserver(()=>{width=Math.max(1,el.clientWidth);height=Math.max(1,el.clientHeight);renderer.setSize(width,height);if(camera instanceof T.PerspectiveCamera)camera.aspect=width/height;else{const span=(camera.top-camera.bottom)/2;camera.left=-span*width/height;camera.right=span*width/height;}camera.updateProjectionMatrix();frameView(true);emitView(true);});resize.observe(el);
  engine.current={rebuild,reset,outlineView,preview:drawPreview,reframe:()=>frameView(false)};reset();rebuild();
  function tick(){frame=requestAnimationFrame(tick);controls.update();const dt=Math.min(clock.getDelta(),.05);for(const [id,target] of targets){objects.get(id)?.position.lerp(target,matchMedia('(prefers-reduced-motion: reduce)').matches?1:1-Math.exp(-20*dt));}
   const p=latest.current;
   if(p.realistic&&!p.mini){const r=roomOf(p.house,p.roomId),height=roomHeight(r);
    camera.position.x=T.MathUtils.clamp(camera.position.x,r.x-r.w/2+.18,r.x+r.w/2-.18);
    camera.position.z=T.MathUtils.clamp(camera.position.z,r.z-r.d/2+.18,r.z+r.d/2-.18);
    camera.position.y=T.MathUtils.clamp(camera.position.y,.45,height-.12);
    controls.target.x=T.MathUtils.clamp(controls.target.x,r.x-r.w/2+.2,r.x+r.w/2-.2);
    controls.target.z=T.MathUtils.clamp(controls.target.z,r.z-r.d/2+.2,r.z+r.d/2-.2);
    controls.target.y=T.MathUtils.clamp(controls.target.y,.6,height-.25);camera.lookAt(controls.target);
   }
   for(const {group,r,wall} of facades){
    if(p.mini||p.mode==='2d'){group.visible=true;continue;}
    group.visible=!(wall==='south'&&camera.position.z>r.z+r.d/2||wall==='north'&&camera.position.z<r.z-r.d/2||wall==='east'&&camera.position.x>r.x+r.w/2||wall==='west'&&camera.position.x<r.x-r.w/2);
   }
   renderer.render(scene,camera);
  }tick();
  loadFurnitureAssets().then(()=>{if(!disposed){setModelStatus('ready');rebuild();}}).catch(()=>{if(!disposed){setModelStatus('partial');rebuild();}});
  return()=>{disposed=true;envTarget.dispose();engine.current=null;cancelAnimationFrame(frame);resize.disconnect();window.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancel);rightOrbit?.dispose();controls.dispose();dispose(scene);renderer.dispose();renderer.domElement.remove();rect.remove();};
 },[]);
 useEffect(()=>{engine.current?.rebuild();},[props.house,props.roomId,props.mode,props.mini?null:props.selected,props.mini?false:props.grid,props.mini?false:props.measure,props.realistic]);
 useEffect(()=>{engine.current?.reset();},[props.resetKey]);
 useEffect(()=>{engine.current?.reframe();},[props.insets]);
 useEffect(()=>{engine.current?.outlineView();},[props.view]);
 useEffect(()=>{if(props.mini)engine.current?.preview(props.draft??props.house);},[props.draft,props.house,props.mini]);
 return <div className={'scene-host '+(props.mini?'mini-scene':'')} data-models={modelStatus} ref={host}>{!props.mini&&modelStatus!=='ready'&&<div className="model-loading">{modelStatus==='loading'?'正在载入真实家具模型…':'部分模型未能载入，暂用替代形状。'}</div>}{error&&<div className="canvas-error" role="alert">{error}</div>}</div>;
}
