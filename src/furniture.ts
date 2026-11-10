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

// ---------------------------------------------------------------- materials
function hash(text:string){let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return h>>>0;}
function random(seed:number){let s=seed||1;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function shade(hex:string,amount:number){const color=new T.Color(hex);color.offsetHSL(0,0,amount);return `#${color.getHexString()}`;}
function canvasMap(size:number,draw:(ctx:CanvasRenderingContext2D)=>void,srgb=false){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d')!;draw(ctx);
 const texture=new T.CanvasTexture(canvas);if(srgb)texture.colorSpace=T.SRGBColorSpace;
 texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=8;return texture;
}
// PBR wood: colour grain + bump for pores + roughness variation + a thin clearcoat.
function woodMaterial(base:string){
 const color=canvasMap(512,ctx=>{
  ctx.fillStyle=base;ctx.fillRect(0,0,512,512);const rand=random(hash(base));
  for(let i=0;i<24;i++){const y=rand()*512,h=6+rand()*46;ctx.fillStyle=rand()>.5?`rgba(72,44,20,${.012+rand()*.022})`:`rgba(255,240,214,${.014+rand()*.024})`;ctx.fillRect(0,y,512,h);}
  for(let i=0;i<170;i++){const y=rand()*512,amp=2+rand()*5;ctx.strokeStyle=rand()>.55?`rgba(255,236,205,${.03+rand()*.05})`:`rgba(62,38,18,${.03+rand()*.08})`;ctx.lineWidth=.4+rand()*1.4;ctx.beginPath();ctx.moveTo(-12,y);ctx.bezierCurveTo(130,y-amp,300,y+amp,524,y+(rand()-.5)*4);ctx.stroke();}
  for(let i=0;i<380;i++){ctx.fillStyle=`rgba(45,28,14,${.05+rand()*.1})`;ctx.fillRect(rand()*512,rand()*512,.6+rand()*1.6,.4+rand()*.7);}
 },true);
 const bump=canvasMap(512,ctx=>{
  ctx.fillStyle='#7d7d7d';ctx.fillRect(0,0,512,512);const rand=random(hash(base)+7);
  for(let i=0;i<150;i++){const y=rand()*512,amp=2+rand()*5;ctx.strokeStyle=rand()>.5?`rgba(232,232,232,${.2+rand()*.25})`:`rgba(42,42,42,${.16+rand()*.25})`;ctx.lineWidth=.6+rand()*1.5;ctx.beginPath();ctx.moveTo(-12,y);ctx.bezierCurveTo(130,y-amp,300,y+amp,524,y+(rand()-.5)*4);ctx.stroke();}
  for(let i=0;i<280;i++){ctx.fillStyle=rand()>.5?'rgba(208,208,208,.3)':'rgba(64,64,64,.26)';ctx.fillRect(rand()*512,rand()*512,1+rand()*2,.7+rand());}
 });
 const rough=canvasMap(512,ctx=>{
  ctx.fillStyle='#c8c8c8';ctx.fillRect(0,0,512,512);const rand=random(hash(base)+13);
  for(let i=0;i<2200;i++){ctx.fillStyle=rand()>.5?'rgba(255,255,255,.16)':'rgba(88,88,88,.15)';ctx.fillRect(rand()*512,rand()*512,2+rand()*8,1+rand()*3);}
 });
 return new T.MeshPhysicalMaterial({map:color,roughnessMap:rough,roughness:.64,bumpMap:bump,bumpScale:.0005,metalness:0,clearcoat:.14,clearcoatRoughness:.5,envMapIntensity:.9});
}
// PBR fabric: woven colour + weave bump + sheen so velvet/cotton catches light.
function fabricMaterial(base:string,sheen=1){
 const color=canvasMap(512,ctx=>{
  ctx.fillStyle=base;ctx.fillRect(0,0,512,512);const rand=random(hash(base)+3);
  for(let i=0;i<40;i++){ctx.fillStyle=rand()>.5?'rgba(255,255,255,.035)':'rgba(0,0,0,.03)';ctx.beginPath();ctx.ellipse(rand()*512,rand()*512,20+rand()*90,12+rand()*50,rand()*3,0,Math.PI*2);ctx.fill();}
  for(let x=0;x<512;x+=3){ctx.fillStyle='rgba(0,0,0,.045)';ctx.fillRect(x,0,1,512);}
  for(let y=0;y<512;y+=3){ctx.fillStyle='rgba(255,255,255,.045)';ctx.fillRect(0,y,512,1);}
  for(let i=0;i<600;i++){ctx.fillStyle=rand()>.5?'rgba(255,255,255,.09)':'rgba(0,0,0,.07)';ctx.fillRect(rand()*512,rand()*512,2+rand()*10,.8+rand());}
 },true);
 const bump=canvasMap(512,ctx=>{
  ctx.fillStyle='#808080';ctx.fillRect(0,0,512,512);
  for(let x=0;x<512;x+=3){ctx.fillStyle='rgba(255,255,255,.34)';ctx.fillRect(x,0,1,512);ctx.fillStyle='rgba(28,28,28,.24)';ctx.fillRect(x+1,0,1,512);}
  for(let y=0;y<512;y+=3){ctx.fillStyle='rgba(255,255,255,.22)';ctx.fillRect(0,y,512,1);}
 });
 const light=new T.Color(base);light.offsetHSL(0,.02,.16);
 return new T.MeshPhysicalMaterial({map:color,bumpMap:bump,bumpScale:.0014,roughness:.93,metalness:0,sheen,sheenColor:light,sheenRoughness:.75,envMapIntensity:.75});
}
function metalMaterial(color='#3c3a36'){return new T.MeshStandardMaterial({color,metalness:.9,roughness:.3,envMapIntensity:1.25});}
function ceramicMaterial(){return new T.MeshPhysicalMaterial({color:'#b9b4a8',roughness:.34,clearcoat:.55,clearcoatRoughness:.24,envMapIntensity:1});}

export function furniture(f:Item,mini=false){
 const g=new T.Group();g.userData.id=f.id;
 const template=templates.get(f.kind);
 if(template){const asset=cloneAsset(template);
  asset.traverse(o=>{if(o instanceof T.Mesh){
   o.castShadow=!mini;o.receiveShadow=true;
   for(const m of Array.isArray(o.material)?o.material:[o.material]){
    if(!(m instanceof T.MeshStandardMaterial))continue;
    m.envMapIntensity=1.2;m.needsUpdate=true;
    if(/fabric|velvet|paisley|striped/i.test(m.name))m.roughness=Math.max(m.roughness,.88);
    if(/frame|wood|metal|brown/i.test(m.name))m.roughness=Math.min(m.roughness,.68);
    for(const texture of textures(m))texture.anisotropy=8;
   }
  }});
  if(f.color!==CATALOG[f.kind].color)asset.traverse(o=>{if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){
   if(m instanceof T.MeshStandardMaterial&&/fabric|brown|paisley|striped|fringe/i.test(m.name))m.color.set(f.color);
  }});
  g.add(asset);
 }
 else{
  const mesh=(geo:T.BufferGeometry,m:T.Material,x=0,y=0,z=0)=>{const o=new T.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=!mini;o.receiveShadow=true;g.add(o);return o;};
  const box=(w:number,h:number,d:number,m:T.Material,x=0,y=0,z=0,r=.015)=>mesh(new RoundedBoxGeometry(w,h,d,4,Math.min(r,w/4,h/4,d/4)),m,x,y,z);
  const panel=(w:number,h:number,d:number,m:T.Material,x=0,y=0,z=0)=>mesh(new T.BoxGeometry(w,h,d),m,x,y,z);
  const cylinder=(top:number,bottom:number,h:number,m:T.Material,x=0,y=0,z=0,segments=32)=>mesh(new T.CylinderGeometry(top,bottom,h,segments),m,x,y,z);
  const leg=(top:number,bottom:number,h:number,m:T.Material,x:number,z:number)=>{const o=cylinder(top,bottom,h,m,x,h/2,z,20);return o;};
  if(f.kind==='table'){
   const wood=woodMaterial(shade(f.color,-.12)),trim=woodMaterial(shade(f.color,-.2));
   const top=cylinder(.5,.48,.062,wood,0,f.h-.031,0,160);top.scale.set(f.w,1,f.d);
      const apron=cylinder(.45,.43,.03,trim,0,f.h-.088,0,96);apron.scale.set(f.w,1,f.d);
   const ph=f.h-.098;
   // Turned pedestal: wider foot, slim waist, flared capital under the top.
   const profile=[[0,0],[.26,0],[.265,.018],[.18,.045],[.105,.09],[.072,.3],[.078,.56],[.105,.78],[.1,.94],[.055,1],[0,1]].map(([r,t])=>new T.Vector2(r,t*ph));
   mesh(new T.LatheGeometry(profile,72),trim,0,0,0);
   cylinder(.27,.27,.012,trim,0,.006,0,72);
  }else if(f.kind==='chair'){
   const fabric=fabricMaterial(f.color),wood=woodMaterial('#8a6746');
   const seat=box(.62,.13,.56,fabric,0,.43,0,.06);seat.rotation.x=-.03;
   const back=box(.62,.54,.1,fabric,0,.63,-.24,.05);back.rotation.x=-.13;
   for(const sign of [-1,1])box(.09,.5,.09,fabric,sign*.3,.5,-.2,.04);
   for(const x of [-.25,.25])for(const z of [-.23,.23]){const l=leg(.016,.011,.42,wood,x,z);l.rotation.z=x>0?-.03:.03;l.rotation.x=z>0?.03:-.03;}
  }else if(f.kind==='bed'){
   const wood=woodMaterial('#7d5d42'),fabric=fabricMaterial(f.color),linen=fabricMaterial('#efe9dd',.55);
   panel(f.w,.18,f.d,wood,0,.16,0);for(const x of [-1,1])for(const z of [-1,1])panel(.075,.07,.075,wood,x*(f.w/2-.11),.035,z*(f.d/2-.1));
   box(f.w-.05,.24,f.d-.05,linen,0,.37,0,.07);
   box(f.w-.02,.1,f.d*.64,fabric,0,.53,f.d*.1,.05);
   box(f.w-.02,.14,.18,fabric,0,.56,f.d*.1-f.d*.32+.09,.05);
   for(const sign of [-1,1])box(.04,.3,f.d*.6,fabric,sign*(f.w/2-.02),.41,f.d*.1,.02);
   box(f.w,.8,.1,fabric,0,.59,-f.d/2+.055,.035);
   for(const x of [-.3,0,.3])box(f.w*.27,.56,.03,linen,x*f.w,.62,-f.d/2+.105,.02);
   for(const sign of [-1,1]){const pillow=box(f.w*.36,.16,.34,linen,sign*f.w*.19,.65,-f.d*.33,.06);pillow.rotation.set(-.14,sign*.05,sign*.02);}
   for(const sign of [-1,1]){const cushion=box(.38,.13,.2,fabric,sign*.12,.68,-f.d*.2,.05);cushion.rotation.set(-.2,sign*.12,0);}
  }else if(f.kind==='desk'){
   const wood=woodMaterial(shade(f.color,-.1)),metal=metalMaterial('#5a544a');
   panel(f.w,.045,f.d,wood,0,f.h-.0225,0);
   panel(f.w-.13,.08,f.d-.11,wood,0,f.h-.08,0);
   for(const x of [-1,1])for(const z of [-1,1]){const l=leg(.02,.013,f.h-.07,wood,x*(f.w/2-.08),z*(f.d/2-.08));l.rotation.z=x*.012;l.rotation.x=z*.012;}
   panel(f.w*.54,.075,f.d*.68,wood,0,f.h-.125,f.d*.16);
   const handle=cylinder(.006,.006,.18,metal,0,f.h-.125,f.d/2+.012,16);handle.rotation.z=Math.PI/2;
  }else if(f.kind==='cabinet'){
   const wood=woodMaterial(shade(f.color,-.12)),light=woodMaterial(shade(f.color,-.03)),metal=metalMaterial('#3b3934');
   const legH=.14,bodyH=f.h-legH-.015;
   panel(f.w-.02,bodyH,f.d,wood,0,legH+bodyH/2,0);
   panel(f.w,.03,f.d+.02,light,0,f.h-.015,.01);
   const doorW=(f.w-.07)/2,doorH=bodyH-.05;
   for(const sign of [-1,1]){
    panel(doorW,doorH,.02,light,sign*(doorW/2+.012),legH+bodyH/2,f.d/2+.006);
    panel(doorW-.05,doorH-.11,.008,wood,sign*(doorW/2+.012),legH+bodyH/2,f.d/2+.017);
    cylinder(.007,.007,.17,metal,sign*.045,legH+bodyH*.6,f.d/2+.04,16);
    for(const dy of [-.06,.06])cylinder(.006,.006,.014,metal,sign*.045,legH+bodyH*.6+dy,f.d/2+.027,12).rotation.x=Math.PI/2;
   }
   for(const x of [-1,1])for(const z of [-1,1])leg(.02,.013,legH,metal,x*(f.w/2-.08),z*(f.d/2-.07));
  }else if(f.kind==='plant'){
   const ceramic=ceramicMaterial();
   const soil=new T.MeshStandardMaterial({color:'#3b3026',roughness:1});
   const stemMat=new T.MeshStandardMaterial({color:'#4e5c3b',roughness:.86});
   const potProfile=[[0,0],[.17,0],[.19,.02],[.225,.27],[.235,.31],[.22,.322],[.208,.3],[0,.3]].map(([r,y])=>new T.Vector2(r,y));
   mesh(new T.LatheGeometry(potProfile,48),ceramic,0,0,0);
   cylinder(.205,.205,.018,soil,0,.302,0,36);
   const leafMats=['#3f5b39','#557044','#6c8552'].map(c=>new T.MeshPhysicalMaterial({color:c,roughness:.66,sheen:.4,sheenColor:new T.Color('#a4b986'),sheenRoughness:.7,clearcoat:.12,side:T.DoubleSide}));
   const rand=random(31);
   for(let i=0;i<24;i++){
    const a=i*2.399+rand()*.3,r=.04+rand()*.13,h=.5+rand()*.72;
    const from=new T.Vector3(0,.3,0),to=new T.Vector3(Math.sin(a)*r*2.2,h,Math.cos(a)*r*2.2);
    const dir=to.clone().sub(from),len=dir.length();
    const stem=mesh(new T.CylinderGeometry(.0028,.0042,len,6),stemMat,from.x+dir.x/2,from.y+dir.y/2,from.z+dir.z/2);
    stem.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir.normalize());
    const size=.16+(i%4)*.035;
    const shape=new T.Shape();shape.moveTo(0,-size);shape.bezierCurveTo(.07,-size*.4,.075,size*.5,0,size);shape.bezierCurveTo(-.075,size*.5,-.07,-size*.4,0,-size);
    const leaf=mesh(new T.ExtrudeGeometry(shape,{depth:.004,bevelEnabled:false}),leafMats[i%3],to.x,to.y,to.z);
    leaf.rotation.set(-.5+rand()*.35,a+(rand()-.5)*.7,.35+rand()*.3);leaf.scale.setScalar(.8+rand()*.35);
   }
  }else{
   const fabric=fabricMaterial(f.color),wood=woodMaterial('#7b5a3c');
   box(f.w,.27,f.d,fabric,0,.35,0,.075);
   const count=f.w>2.2?3:2,seatW=(f.w-.2)/count;
   for(let i=0;i<count;i++){const x=-f.w/2+.1+seatW*(i+.5);box(seatW-.05,.16,f.d*.72,fabric,x,.51,.03,.07);}
   for(let i=0;i<count;i++){const x=-f.w/2+.1+seatW*(i+.5);const back=box(seatW-.06,.42,.16,fabric,x,.78,-f.d/2+.16,.06);back.rotation.x=-.12;}
   for(const sign of [-1,1]){box(.16,.46,f.d*.86,fabric,sign*(f.w/2-.09),.56,0,.065);}
   for(const x of [-1,1])for(const z of [-1,1])leg(.02,.014,.14,wood,x*(f.w/2-.1),z*(f.d/2-.1));
   for(const sign of [-1,1]){const p=box(.34,.32,.12,fabric,sign*.42,.68,-f.d/2+.26,.05);p.rotation.set(-.18,sign*.22,sign*.08);}
  }
 }
 g.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(g),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
 const content=new T.Group();while(g.children.length)content.add(g.children[0]);
 content.position.set(-center.x,-bounds.min.y,-center.z);const fit=new T.Group();fit.add(content);
 fit.scale.set(f.w/Math.max(.001,size.x),f.h/Math.max(.001,size.y),f.d/Math.max(.001,size.z));g.add(fit);
 g.position.set(f.x,0,f.z);g.rotation.y=f.rotation*Math.PI/180;g.userData.asset=!!template;
 return g;
}
