import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {CATALOG,type Item} from './model';

const templates=new Map<string,T.Group>();let loading:Promise<void>|undefined;
export function loadFurnitureAssets(){
 return loading??=(async()=>{
  const loader=new GLTFLoader();const results=await Promise.allSettled(['sofa','chair'].map(async kind=>{
   const gltf=await loader.loadAsync(`/models/${kind}.glb`);templates.set(kind,gltf.scene);
  }));
  if(results.some(r=>r.status==='rejected'))throw new Error('部分家具模型加载失败，暂用替代形状。');
 })();
}
function textures(material:T.Material){return Object.values(material).filter(v=>v instanceof T.Texture) as T.Texture[];}
function cloneAsset(source:T.Group){
 const group=source.clone(true);
 group.traverse(o=>{if(o instanceof T.Mesh){o.geometry=o.geometry.clone();
  const copy=(material:T.Material)=>{const m=material.clone();for(const [key,value] of Object.entries(m))if(value instanceof T.Texture)(m as unknown as Record<string,unknown>)[key]=value.clone();return m;};
  o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);o.castShadow=true;o.receiveShadow=true;
 }});return group;
}
function grain(color:string,fabric=false){
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d')!;
 ctx.fillStyle=color;ctx.fillRect(0,0,256,256);let seed=19;const rand=()=>((seed=seed*16807%2147483647)/2147483647);
 for(let i=0;i<1600;i++){ctx.strokeStyle=i%2?'#ffffff0c':'#0000000d';ctx.lineWidth=fabric?.45:rand()*.8+.2;const y=rand()*256;ctx.beginPath();ctx.moveTo(rand()*256,y);ctx.lineTo(rand()*256,y+(fabric?rand()*2:rand()*4));ctx.stroke();}
 if(fabric){ctx.fillStyle='#00000008';for(let i=0;i<256;i+=3)ctx.fillRect(i,0,1,256);}
 const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;return map;
}
export function furniture(f:Item,mini=false){
 const g=new T.Group();g.userData.id=f.id;
 const template=templates.get(f.kind);
 if(template){const asset=cloneAsset(template);
  if(f.color!==CATALOG[f.kind].color)asset.traverse(o=>{if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){
   if(m instanceof T.MeshStandardMaterial&&/fabric|brown|paisley|striped|fringe/i.test(m.name))m.color.set(f.color);
  }});
  if(mini)asset.traverse(o=>{if(o instanceof T.Mesh)o.castShadow=false;});
  g.add(asset);
 }
 else{
  const wood=new T.MeshStandardMaterial({map:grain('#8f6c4b'),roughness:.48});
  const fabric=new T.MeshStandardMaterial({map:grain(f.color,true),roughness:.92});
  const metal=new T.MeshStandardMaterial({color:'#333430',roughness:.3,metalness:.65});
  const mat=new T.MeshStandardMaterial({color:f.color,roughness:.68});
  const mesh=(geo:T.BufferGeometry,m:T.Material,x=0,y=0,z=0)=>{const o=new T.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=!mini;o.receiveShadow=true;g.add(o);return o;};
  const box=(w:number,h:number,d:number,m:T.Material,x=0,y=0,z=0,r=.02)=>mesh(new RoundedBoxGeometry(w,h,d,3,Math.min(r,w/4,h/4,d/4)),m,x,y,z);
  const cylinder=(top:number,bottom:number,h:number,m:T.Material,x=0,y=0,z=0)=>mesh(new T.CylinderGeometry(top,bottom,h,40),m,x,y,z);
  if(f.kind==='table'){
   const top=cylinder(.5,.5,.065,wood,0,f.h-.033,0);top.scale.set(f.w,1,f.d);
   cylinder(.19,.25,f.h-.065,wood,0,(f.h-.065)/2,0);
   const rim=new T.Mesh(new T.TorusGeometry(.5,.007,6,64),wood);rim.rotation.x=-Math.PI/2;rim.position.y=f.h-.007;rim.scale.set(f.w,f.d,1);g.add(rim);
  }else if(f.kind==='chair'){
   const seat=mesh(new T.SphereGeometry(.5,28,20),fabric,0,.45,0);seat.scale.set(.75,.15,.75);
   const back=mesh(new T.SphereGeometry(.5,28,20),fabric,0,.7,-.22);back.scale.set(.8,.5,.17);back.rotation.x=-.15;
   for(const x of [-.27,.27])for(const z of [-.25,.25])cylinder(.018,.013,.44,wood,x,.22,z);
  }else if(f.kind==='bed'){
   box(f.w,.19,f.d,wood,0,.22,0,.04);box(f.w-.03,.27,f.d-.06,new T.MeshStandardMaterial({color:'#e5e1d8',roughness:1}),0,.43,0,.09);
   box(f.w,.9,.12,fabric,0,.47,-f.d/2+.06,.045);
   const duvet=mesh(new T.SphereGeometry(.5,32,20),fabric,0,.59,.24);duvet.scale.set(f.w*.98,.17,f.d*.7);
   for(const sign of [-1,1]){const pillow=mesh(new T.SphereGeometry(.5,28,18),new T.MeshStandardMaterial({map:grain('#e5e0d5',true),roughness:.97}),sign*f.w*.23,.64,-f.d*.3);pillow.scale.set(f.w*.43,.16,.43);pillow.rotation.y=sign*.06;}
  }else if(f.kind==='desk'){
   box(f.w,.045,f.d,wood,0,.74,0,.018);
   for(const x of [-1,1])for(const z of [-1,1])cylinder(.025,.016,.71,wood,x*(f.w/2-.1),.355,z*(f.d/2-.1));
  }else if(f.kind==='cabinet'){
   box(f.w,f.h-.16,f.d,wood,0,(f.h-.16)/2+.16,0,.015);
   for(const sign of [-1,1]){box(f.w/2-.018,f.h-.2,.02,wood,sign*f.w/4,f.h/2+.07,f.d/2+.012,.008);const pull=cylinder(.009,.009,.1,metal,sign*.08,f.h*.65,f.d/2+.035);pull.rotation.z=Math.PI/2;}
   for(const x of [-1,1])for(const z of [-1,1])cylinder(.018,.014,.16,metal,x*(f.w/2-.08),.08,z*(f.d/2-.08));
  }else if(f.kind==='plant'){
   const pts=[new T.Vector2(.15,0),new T.Vector2(.18,.03),new T.Vector2(.23,.32),new T.Vector2(.23,.35),new T.Vector2(.21,.35),new T.Vector2(.20,.30)];
   mesh(new T.LatheGeometry(pts,36),new T.MeshStandardMaterial({color:'#acaa9d',roughness:.95}));
   for(let i=0;i<18;i++){const a=i*2.399,y=.4+i*.035,len=.17+(i%4)*.045;
    cylinder(.003,.003,y-.3,wood,Math.sin(a)*.025,(y+.3)/2,Math.cos(a)*.025);
    const shape=new T.Shape();shape.moveTo(0,-len);shape.bezierCurveTo(.085,-len*.4,.09,len*.5,0,len);shape.bezierCurveTo(-.09,len*.5,-.085,-len*.4,0,-len);
    const leaf=mesh(new T.ShapeGeometry(shape,16),new T.MeshStandardMaterial({color:i%2?'#405d3d':'#60764a',roughness:.8,side:T.DoubleSide}),Math.sin(a)*.12,y,Math.cos(a)*.12);leaf.rotation.set(-.55,a,.45);
   }
  }else{
   box(f.w,.29,f.d,fabric,0,.4,0,.1);box(f.w,.5,.17,fabric,0,.66,-f.d/2+.08,.07);
   for(const sign of [-1,1])box(.16,.4,f.d,fabric,sign*(f.w/2-.08),.52,0,.06);
  }
  // Materials not used by a particular procedural shape must not leak.
  const used=new Set<T.Material>();g.traverse(o=>{if(o instanceof T.Mesh)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>used.add(m));});
  for(const m of [wood,fabric,metal,mat])if(!used.has(m)){textures(m).forEach(t=>t.dispose());m.dispose();}
 }
 g.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(g),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
 const content=new T.Group();while(g.children.length)content.add(g.children[0]);
 content.position.set(-center.x,-bounds.min.y,-center.z);const fit=new T.Group();fit.add(content);
 fit.scale.set(f.w/Math.max(.001,size.x),f.h/Math.max(.001,size.y),f.d/Math.max(.001,size.z));g.add(fit);
 g.position.set(f.x,0,f.z);g.rotation.y=f.rotation*Math.PI/180;g.userData.asset=!!template;
 return g;
}
