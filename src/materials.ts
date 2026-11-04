import * as T from 'three';
import {FLOOR_MATERIALS,WALL_MATERIALS,type Room} from './model';

// Local procedural textures: no remote assets, downloads, or model services.
export function roomTexture(room:Room,surface:'floor'|'wall'){
 const key=surface==='floor'?(room.floorMaterial??'oak'):(room.wallMaterial??'ivory');
 const palette:Record<string,{color:string}>=surface==='floor'?FLOOR_MATERIALS:WALL_MATERIALS;
 const color=palette[key]?.color??(surface==='floor'?'#d5bb92':'#f2eee3');
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const c=canvas.getContext('2d')!;
 let seed=13;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 c.fillStyle=color;c.fillRect(0,0,512,512);
 if(key==='oak'||key==='walnut'){
  for(let row=0;row<8;row++){c.fillStyle=row%2?'#ffffff0b':'#00000006';c.fillRect(0,row*64,512,64);c.fillStyle='#57412a25';c.fillRect(0,row*64,512,2);const seam=(row%3)*155+45;c.fillRect(seam,row*64,2,64);}
  for(let i=0;i<1400;i++){const x=random()*512,y=random()*512;c.strokeStyle=i%2?'#fff8e918':'#432d1610';c.lineWidth=.5;c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+25,y-1,x+50,y+2,x+80,y);c.stroke();}
 }else if(key==='tile'){
  c.strokeStyle='#9a9f942e';c.lineWidth=4;for(let n=0;n<=512;n+=256){c.beginPath();c.moveTo(n,0);c.lineTo(n,512);c.moveTo(0,n);c.lineTo(512,n);c.stroke();}
 }else if(key==='stone'){
  for(let i=0;i<1500;i++){const x=random()*512,y=random()*512;c.fillStyle=['#eeede8','#8d978b','#9da699','#d7c8b2'][i%4];c.beginPath();c.ellipse(x,y,1+random()*3,1+random()*2,random()*3,0,Math.PI*2);c.fill();}
 }else if(key==='brick'){
  c.strokeStyle='#a9ad9f55';c.lineWidth=4;for(let row=0;row<8;row++){const y=row*64;c.beginPath();c.moveTo(0,y);c.lineTo(512,y);c.stroke();for(let x=(row%2)*128;x<512;x+=256){c.beginPath();c.moveTo(x,y);c.lineTo(x,y+64);c.stroke();}}
 }
 if(key!=='stone')for(let i=0;i<5000;i++){c.fillStyle=i%2?'#ffffff09':'#24372507';c.fillRect(random()*512,random()*512,1,1);}
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;
 if(surface==='floor')texture.repeat.set(room.w/2,room.d/2);else texture.repeat.set(2,1);
 texture.anisotropy=4;return texture;
}
