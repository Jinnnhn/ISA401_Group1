import type {IncomingMessage,ServerResponse} from 'node:http';
import {chatPrompt,layoutDiscussionPrompt,layoutPrompt} from './chat-prompt';
import {isRecord,itemLabel,measurePreviousRoomSuggestion,measurePreviousSuggestion,readLayoutContext,type Advice,type LayoutContext} from '../src/layoutAdvice';
import {currentDoorStatus} from '../src/doorAdvice';
import {executeLayoutIntent,readLayoutIntent} from './layout-intent';
import {FLOOR_MATERIALS,WALL_MATERIALS} from '../src/model';

const chatPath='/api/ai/chat';
const maxBodyBytes=256*1024;
const maxMessages=19;
const maxUserLength=2000;
const maxReplyLength=4000;

type ChatMessage={role:'user'|'assistant';content:string};

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

async function requestReply(apiKey:string|undefined,messages:ChatMessage[],res:ServerResponse,context?:LayoutContext){
 if(!apiKey){respond(res,503,{error:'未配置 DeepSeek 密钥。保存本地配置后请重启 SpaceMate。'});return;}
 const question=messages[messages.length-1].content;
 let upstreamMessages=messages;
 if(context){
  const {color:_color,floorMaterial,wallMaterial,...room}=context.room;
  const items=context.items.map(({color:_itemColor,...item})=>({...item,displayName:itemLabel(context.items,item.id)}));
  upstreamMessages=[...messages.slice(0,-1),{role:'user',content:JSON.stringify({question,
   layout:{...context,room,items,surfaces:{floor:FLOOR_MATERIALS[floorMaterial??'parquet'].name,wall:WALL_MATERIALS[wallMaterial??'damask'].name}},
   suggestionMeasurements:measurePreviousSuggestion(context),
   roomSuggestionMeasurements:measurePreviousRoomSuggestion(context),
   doorStatus:currentDoorStatus(context).map(({door,blockers})=>({doorId:door.id,wall:door.wall,width:door.width,blockingItemIds:blockers.map(item=>item.id)})),
  })}];
 }
 const timeout=AbortSignal.timeout(25_000);
 const closed=new AbortController();
 const abort=()=>closed.abort();
 res.once('close',abort);
 try{
  for(let attempt=0;attempt<(context?3:1);attempt++){
   const structured=!!context&&attempt<2;
   const prompt=structured?layoutPrompt:context?layoutDiscussionPrompt:chatPrompt;
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
   void requestReply(apiKey,messages,res,context);
  });
 };
}
