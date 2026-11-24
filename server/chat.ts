import type {IncomingMessage,ServerResponse} from 'node:http';
import {chatPrompt,layoutDiscussionPrompt,layoutPrompt,roomReviewPrompt} from './chat-prompt';
import {applyLayoutChanges,contextHouse,isRecord,itemLabel,measurePreviousRoomSuggestion,measurePreviousSuggestion,protectedIds,readLayoutContext,type Advice,type LayoutContext} from '../src/layoutAdvice';
import {currentDoorStatus} from '../src/doorAdvice';
import {executeLayoutIntent,readLayoutIntent} from './layout-intent';
import {FLOOR_MATERIALS,WALL_MATERIALS} from '../src/model';
import {maxViewLength,reviewRoom,type RoomViews} from '../src/roomReview';
import {optimizeRoom} from '../src/roomLayout';

const chatPath='/api/ai/chat';
const maxBodyBytes=512*1024;
const maxMessages=19;
const maxUserLength=2000;
const maxReplyLength=4000;

type ChatMessage={role:'user'|'assistant';content:string};
type ContentBlock={type:'text';text:string}|{type:'image_url';image_url:{url:string}};
type UpstreamMessage={role:'user'|'assistant';content:string|ContentBlock[]};

export function readRoomViews(value:unknown):RoomViews|undefined{
 if(!isRecord(value))return;
 const validJpeg=(image:unknown):image is string=>{
  if(typeof image!=='string'||image.length>maxViewLength)return false;
  const match=/^data:image\/jpeg;base64,([A-Za-z\d+/]+={0,2})$/.exec(image);
  if(!match||match[1].length%4!==0)return false;
  const bytes=Buffer.from(match[1],'base64');
  return bytes.length>4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217;
 };
 if(validJpeg(value.plan)&&validJpeg(value.perspective))return {plan:value.plan,perspective:value.perspective};
}

export function readReviewNote(content:string,hasViews=false){
 try{
  const value:unknown=JSON.parse(content);
  if(!isRecord(value))return;
  const fields=[value.keep,value.priority,value.tradeoff];
  if(!fields.every(field=>typeof field==='string'&&field.trim()))return;
  // Geometry measurements are shown by the program. Keep model commentary qualitative.
  if(fields.some(field=>/(?:\d|[零一二三四五六七八九十百千半])[\d.\s一二三四五六七八九十百点-]*(?:平方米|厘米|公分|毫米|米|cm\b|mm\b|m²|m\b)/i.test(field as string)))return;
  if(!hasViews&&fields.some(field=>/(?:截图|图中|图上|画面中|三维图|俯视图)/.test(field as string)))return;
  return fields.map((field,index)=>`${['适合保留','优先关注','调整取舍'][index]} · ${(field as string).trim().slice(0,240)}`).join('\n');
 }catch{return;}
}

function withReviewNote(advice:Advice,note:string):Advice{
 return advice.kind==='roomProposal'?{...advice,reviewNote:note}:{...advice,reply:`${advice.reply}\n\n${note}`};
}

function readMessages(value:unknown):ChatMessage[]|undefined{
 if(!value||typeof value!=='object'||!('messages' in value))return;
 const {messages}=value;
 if(!Array.isArray(messages)||messages.length<1||messages.length>maxMessages||messages.length%2===0)return;
 const result:ChatMessage[]=[];
 for(const [index,message] of messages.entries()){
  const role=index%2===0?'user':'assistant';
  if(!message||message.role!==role||typeof message.content!=='string')return;
  const content=message.content.trim();
  if(!content||content.length>(role==='user'?maxUserLength:maxReplyLength))return;
  result.push({role,content});
 }
 return result;
}

function respond(res:ServerResponse,status:number,body:{reply:string}|{error:string}|Advice){
 if(res.destroyed||res.writableEnded)return;
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
 res.end(JSON.stringify(body));
}

async function requestReply(apiKey:string|undefined,messages:ChatMessage[],res:ServerResponse,context?:LayoutContext,review?:{views?:RoomViews}){
 if(!apiKey){respond(res,503,{error:'未配置 DeepSeek 密钥。保存本地配置后请重启 SpaceMate。'});return;}
 const question=messages[messages.length-1].content;
 let upstreamMessages:UpstreamMessage[]=messages;
 let checked:Advice|undefined;
 if(context){
  const {color:_color,floorMaterial,wallMaterial,...room}=context.room;
  const items=context.items.map(({color:_itemColor,...item})=>({...item,displayName:itemLabel(context.items,item.id)}));
  const layout={...context,room,items,surfaces:{floor:FLOOR_MATERIALS[floorMaterial??'parquet'].name,wall:WALL_MATERIALS[wallMaterial??'damask'].name}};
  const facts={
   question,layout,
   suggestionMeasurements:measurePreviousSuggestion(context),
   roomSuggestionMeasurements:measurePreviousRoomSuggestion(context),
   doorStatus:currentDoorStatus(context).map(({door,blockers})=>({doorId:door.id,wall:door.wall,width:door.width,blockingItemIds:blockers.map(item=>item.id)})),
  };
  if(review){
   const objective=context.preference==='passage'?'door':context.preference==='hosting'?'hosting':'balanced';
   const house=contextHouse(context);
   checked=optimizeRoom(context,objective,[...protectedIds(context,question)]);
   const proposed=checked.kind==='roomProposal'?applyLayoutChanges(house,context.room.id,checked.changes,checked.preserveIds):undefined;
   const candidate=checked.kind==='roomProposal'&&proposed&&'house' in proposed?{
    changes:checked.changes,explanations:checked.explanations,checkedAfter:reviewRoom(proposed.house,context.room),
   }:undefined;
   const payload=JSON.stringify({...facts, checks:reviewRoom(house,context.room), candidate,
    viewLegend:items.map((item,index)=>({label:`F${index+1}`,itemId:item.id}))});
   const {views}=review;
   upstreamMessages=[{role:'user',content:views?[
    {type:'text',text:`${payload}\n接着提供同一房间的北朝上平面图和固定三维斜俯视图，图中 F 编号见 viewLegend。`},
    {type:'image_url',image_url:{url:views.plan}},{type:'image_url',image_url:{url:views.perspective}},
   ]:payload}];
  }else upstreamMessages=[...messages.slice(0,-1),{role:'user',content:JSON.stringify(facts)}];
 }
 const timeout=AbortSignal.timeout(25_000);
 const closed=new AbortController();
 const abort=()=>closed.abort();
 res.once('close',abort);
 try{
  for(let attempt=0;attempt<(review?2:context?3:1);attempt++){
   const structured=!!context&&attempt<2;
   const prompt=review?roomReviewPrompt:structured?layoutPrompt:context?layoutDiscussionPrompt:chatPrompt;
   const response=await fetch('https://api.deepseek.com/chat/completions',{
    method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    signal:AbortSignal.any([timeout,closed.signal]),redirect:'error',
    body:JSON.stringify({model:'deepseek-flash',thinking:{type:'disabled'},stream:false,max_tokens:768,
     ...(structured?{response_format:{type:'json_object'}}:{}),
     messages:[{role:'system',content:prompt},...upstreamMessages],
    }),
   });
   if(!response.ok){
    const error=response.status===401?'DeepSeek 密钥无效，请更新本地密钥后重启。':
     response.status===402?'DeepSeek 账户余额不足。':
     response.status===429?'DeepSeek 请求过多，请稍后再试。':
     `DeepSeek 暂未能处理请求（${response.status}），请稍后再试。`;
    respond(res,response.status===429?429:502,{error});return;
   }
   const result=await response.json() as {choices?:{message?:{content?:unknown}}[]}|null;
   const content=result?.choices?.[0]?.message?.content;
   const reply=typeof content==='string'?content.trim():'';
   if(!reply)continue;
   if(checked){
    const note=readReviewNote(reply,!!review?.views);
    if(!note)continue;
    respond(res,200,withReviewNote(checked,note));return;
   }
   if(context&&structured){
    const intent=readLayoutIntent(reply);
    if(!intent)continue;
    respond(res,200,executeLayoutIntent(intent,context,question));return;
   }
   if(context){
    respond(res,200,{kind:'text',reply:`这轮未生成可预览方案。\n${reply.slice(0,maxReplyLength-20)}`});return;
   }
   respond(res,200,{reply:reply.slice(0,maxReplyLength)});return;
  }
  if(checked){respond(res,200,withReviewNote(checked,'本次 AI 点评格式无法读取，已保留程序检查结果。'));return;}
  respond(res,502,{error:context?'暂时没有收到可读取的布局答复，请重试。':'DeepSeek 没有返回可显示的回复，请重试。'});
 }catch(error){
  if(closed.signal.aborted)return;
  if(timeout.aborted)respond(res,504,{error:'等待 DeepSeek 回复超时，请重试。'});
  else if(error instanceof SyntaxError)respond(res,502,{error:'DeepSeek 返回了无法读取的回复，请重试。'});
  else respond(res,502,{error:'无法连接 DeepSeek，请检查网络后重试。'});
 }finally{
  res.off('close',abort);
 }
}

export function createChatMiddleware(apiKey:string|undefined){
 return (req:IncomingMessage,res:ServerResponse,next:()=>void)=>{
  if(req.url?.split('?',1)[0]!==chatPath){next();return;}
  if(req.method!=='POST'){
   res.setHeader('Allow','POST');
   respond(res,405,{error:'聊天接口只支持 POST。'});
   req.resume();
   return;
  }
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){
   respond(res,403,{error:'请从 SpaceMate 页面发起聊天。'});
   req.resume();
   return;
  }
  if(req.headers['content-type']?.split(';',1)[0].trim().toLowerCase()!=='application/json'){
   respond(res,415,{error:'聊天请求必须使用 JSON。'});
   req.resume();
   return;
  }
  if(Number(req.headers['content-length'])>maxBodyBytes){
   respond(res,413,{error:'聊天内容过长，请缩短消息后重试。'});
   req.resume();
   return;
  }
  let size=0,finished=false;
  const chunks:Buffer[]=[];
  req.on('data',(chunk:Buffer)=>{
   if(finished)return;
   size+=chunk.length;
   if(size>maxBodyBytes){
    finished=true;
    chunks.length=0;
    respond(res,413,{error:'聊天内容过长，请缩短消息后重试。'});
    return;
   }
   chunks.push(chunk);
  });
  req.on('error',()=>{
   finished=true;
   respond(res,400,{error:'读取聊天请求失败，请重试。'});
  });
  req.on('end',()=>{
   if(finished)return;
   let payload:unknown;
   try{payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
   catch{respond(res,400,{error:'聊天请求必须是有效的 JSON。'});return;}
   const messages=readMessages(payload);
   if(!messages){respond(res,400,{error:'聊天消息格式有误或内容过长，请修改后重试。'});return;}
   const context=isRecord(payload)&&'layout' in payload?readLayoutContext(payload.layout):undefined;
   if(isRecord(payload)&&'layout' in payload&&!context){respond(res,400,{error:'当前房间数据无法用于布局建议，请检查房间和家具信息。'});return;}
   const reviewBody=isRecord(payload)?payload:undefined;
   const isReview=reviewBody?.checkLayout===true;
   const hasViews=!!reviewBody&&'roomViews' in reviewBody;
   const views=hasViews?readRoomViews(reviewBody?.roomViews):undefined;
   if((isReview&&!context)||(hasViews&&(!isReview||!views))){
    respond(res,400,{error:'布局检查需要当前房间数据，附图须为两张受支持的 JPEG。'});return;
   }
   void requestReply(apiKey,messages,res,context,isReview?{views}:undefined);
  });
 };
}
