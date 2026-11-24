import {corners,doorFrame,doorSweep,type House,type Room} from './model';
import {maxViewLength} from './roomReview';

export const viewWidth=768;
export const viewHeight=560;

export function encodeRoomView(canvas:HTMLCanvasElement){
 for(const quality of [.82,.65,.48]){
  const image=canvas.toDataURL('image/jpeg',quality);
  if(image.startsWith('data:image/jpeg;base64,')&&image.length<=maxViewLength)return image;
 }
 throw new Error('Room view could not be encoded within the request budget.');
}

export function captureRoomPlan(house:House,room:Room,selected:string[]){
 const canvas=document.createElement('canvas');
 canvas.width=viewWidth;canvas.height=viewHeight;
 const ctx=canvas.getContext('2d')!;
 const doors=house.doors.filter(door=>door.roomId===room.id);
 const sweeps=doors.map(door=>doorSweep(house,door));
 const points=[...corners({x:room.x,z:room.z,w:room.w,d:room.d,rotation:0}),...sweeps.flat()];
 const xs=points.map(point=>point[0]),zs=points.map(point=>point[1]);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
 const scale=Math.min((viewWidth-100)/(maxX-minX),(viewHeight-94)/(maxZ-minZ));
 const centerX=(minX+maxX)/2,centerZ=(minZ+maxZ)/2;
 const project=(x:number,z:number)=>[viewWidth/2+(x-centerX)*scale,viewHeight/2+(z-centerZ)*scale] as const;
 const trace=(points:readonly (readonly [number,number])[],color:string,width:number,fill?:string)=>{
  ctx.beginPath();
  for(const [index,[x,z]] of points.entries())index===0?ctx.moveTo(...project(x,z)):ctx.lineTo(...project(x,z));
  if(fill){ctx.closePath();ctx.fillStyle=fill;ctx.fill();}
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
 };
 ctx.fillStyle='#fcfcf8';ctx.fillRect(0,0,viewWidth,viewHeight);
 ctx.textBaseline='middle';ctx.font='600 16px sans-serif';ctx.fillStyle='#214037';
 ctx.fillText('N ↑',18,24);
 const [left,top]=project(room.x-room.w/2,room.z-room.d/2);
 ctx.fillStyle='#f0f2eb';ctx.fillRect(left,top,room.w*scale,room.d*scale);
 ctx.lineWidth=4;ctx.strokeStyle='#486052';ctx.strokeRect(left,top,room.w*scale,room.d*scale);
 for(const [index,door] of doors.entries()){
  const {hx,hz,ux,uz,side}=doorFrame(house,door);
  trace([[hx,hz],[hx+ux*side*door.width,hz+uz*side*door.width]],'#fcfcf8',6);
  trace(sweeps[index],'#a76d3a',2,'#f4e1c5');
 }
 for(const window of house.windows.filter(window=>window.roomId===room.id)){
  const alongX=window.wall==='north'||window.wall==='south';
  const x=room.x+(alongX?window.offset:(window.wall==='east'?1:-1)*room.w/2);
  const z=room.z+(alongX?(window.wall==='south'?1:-1)*room.d/2:window.offset);
  const dx=alongX?window.width/2:0,dz=alongX?0:window.width/2;
  trace([[x-dx,z-dz],[x+dx,z+dz]],'#4388a8',5);
 }
 ctx.textAlign='center';
 for(const [index,item] of house.items.filter(item=>item.roomId===room.id).entries()){
  const chosen=selected.includes(item.id);
  trace(corners(item),chosen?'#005991':'#47745c',chosen?4:2,chosen?'#a9d9ee':'#cfe0ce');
  ctx.fillStyle='#132b24';ctx.font='bold 14px sans-serif';
  ctx.fillText(`F${index+1}`,...project(item.x,item.z));
 }
 return encodeRoomView(canvas);
}
