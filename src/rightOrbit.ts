import {MathUtils,Spherical,Vector3} from 'three';
import type {OrbitControls} from 'three/addons/controls/OrbitControls.js';

type Orbit = Pick<OrbitControls,'object'|'target'|'enabled'|'enableDamping'|'minPolarAngle'|'maxPolarAngle'|'update'>;

// Own the right-button gesture before OrbitControls sees it. Left-button editing
// and middle-button panning keep their own pointer lifecycles.
export function bindRightOrbit(canvas:HTMLElement,controls:Orbit,options:{
 canRotate:()=>boolean;
 message:(text:string)=>void;
}) {
 let gesture:{id:number;x:number;y:number;startX:number;startY:number;damping:boolean;moved:boolean;rotate:boolean}|null=null;
 const sphere=new Spherical(),offset=new Vector3();
 function finish(){
  if(!gesture)return;
  const previous=gesture;gesture=null;
  controls.enabled=true;controls.enableDamping=previous.damping;
  canvas.style.cursor='';
  if(canvas.hasPointerCapture(previous.id))canvas.releasePointerCapture(previous.id);
 }
 function down(event:PointerEvent){
  if(event.button!==2)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(gesture||!controls.enabled)return;
  const rotate=options.canRotate();
  const damping=controls.enableDamping;
  // Flush residual zoom/pan damping before starting a separate orbit gesture.
  controls.enableDamping=false;controls.update();controls.enabled=false;
  gesture={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,damping,moved:false,rotate};
  canvas.setPointerCapture(event.pointerId);
 }
 function move(event:PointerEvent){
  if(!gesture||event.pointerId!==gesture.id)return;
  event.preventDefault();event.stopImmediatePropagation();
  if((event.buttons&2)===0){finish();return;}
  if(!gesture.moved){if(Math.hypot(event.clientX-gesture.startX,event.clientY-gesture.startY)<=5)return;gesture.moved=true;canvas.style.cursor='grabbing';options.message(gesture.rotate?'正在旋转视角 · 松开右键结束。':'2D 模式保持俯视；请切换到 3D 空间后按住右键旋转。');}
  if(!gesture.rotate)return;
  const scale=2*Math.PI/Math.max(canvas.clientHeight,1);
  offset.copy(controls.object.position).sub(controls.target);sphere.setFromVector3(offset);
  sphere.theta-=(event.clientX-gesture.x)*scale;
  sphere.phi=MathUtils.clamp(sphere.phi-(event.clientY-gesture.y)*scale,controls.minPolarAngle,controls.maxPolarAngle);
  sphere.makeSafe();
  controls.object.position.copy(controls.target).add(offset.setFromSpherical(sphere));
  controls.object.lookAt(controls.target);controls.update();
  gesture.x=event.clientX;gesture.y=event.clientY;
 }
 function up(event:PointerEvent){if(!gesture||event.pointerId!==gesture.id||event.button!==2)return;event.preventDefault();event.stopImmediatePropagation();const {moved,rotate}=gesture;finish();options.message(moved?(rotate?'视角已调整 · 家具位置保持不变。':'2D 模式保持俯视；请切换到 3D 后旋转。'):'右键用于旋转视角；点击空白处或按 Esc 可取消选择。');}
 function lost(event:PointerEvent){if(gesture?.id===event.pointerId)finish();}
 function key(event:KeyboardEvent){if(event.key==='Escape')finish();}
 canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true);canvas.addEventListener('pointerup',up,true);canvas.addEventListener('pointercancel',lost,true);canvas.addEventListener('lostpointercapture',lost,true);window.addEventListener('blur',finish);window.addEventListener('keydown',key);
 return {isActive:()=>gesture!==null,cancel:finish,dispose(){finish();canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointermove',move,true);canvas.removeEventListener('pointerup',up,true);canvas.removeEventListener('pointercancel',lost,true);canvas.removeEventListener('lostpointercapture',lost,true);window.removeEventListener('blur',finish);window.removeEventListener('keydown',key);}};
}
