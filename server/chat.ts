import type {IncomingMessage,ServerResponse} from 'node:http';
import {chatPrompt,layoutDiscussionPrompt,layoutPrompt,withReplyLanguage,type ChatLanguage} from './chat-prompt';
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
const localize=(language:ChatLanguage,zh:string,en:string)=>language==='en'?en:zh;

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

async function requestReply(apiKey:string|undefined,messages:ChatMessage[],res:ServerResponse,language:ChatLanguage,context?:LayoutContext){
 const t=(zh:string,en:string)=>localize(language,zh,en);
 if(!apiKey){respond(res,503,{error:t('未配置 DeepSeek 密钥。保存本地配置后请重启 SpaceMate。','Add a DeepSeek API key to your local configuration and restart SpaceMate.')});return;}
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
   const prompt=withReplyLanguage(structured?layoutPrompt:context?layoutDiscussionPrompt:chatPrompt,language);
   const response=await fetch('https://api.deepseek.com/chat/completions',{
    method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    signal:AbortSignal.any([timeout,closed.signal]),redirect:'error',
    body:JSON.stringify({model:'deepseek-flash',thinking:{type:'disabled'},stream:false,max_tokens:768,
     ...(structured?{response_format:{type:'json_object'}}:{}),
     messages:[{role:'system',content:prompt},...upstreamMessages],
    }),
   });
   if(!response.ok){
    const error=response.status===401?t('DeepSeek 密钥无效，请更新本地密钥后重启。','The DeepSeek API key is invalid. Update your local key and restart SpaceMate.'):
     response.status===402?t('DeepSeek 账户余额不足。','The DeepSeek account has insufficient balance.'):
     response.status===429?t('DeepSeek 请求过多，请稍后再试。','DeepSeek is receiving too many requests. Try again shortly.'):
     t(`DeepSeek 暂未能处理请求（${response.status}），请稍后再试。`,`DeepSeek could not process the request (${response.status}). Try again shortly.`);
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
    const note=t('这轮未生成可预览方案。','No preview was generated for this request.');
    respond(res,200,{kind:'text',reply:`${note}\n${reply}`.slice(0,maxReplyLength)});return;
   }
   respond(res,200,{reply:reply.slice(0,maxReplyLength)});return;
  }
  respond(res,502,{error:context
   ? t('暂时没有收到可读取的布局答复，请重试。','The assistant did not return a readable layout response. Please try again.')
   : t('DeepSeek 没有返回可显示的回复，请重试。','DeepSeek did not return a readable reply. Please try again.')});
 }catch(error){
  if(closed.signal.aborted)return;
  if(timeout.aborted)respond(res,504,{error:t('等待 DeepSeek 回复超时，请重试。','DeepSeek took too long to reply. Please try again.')});
  else if(error instanceof SyntaxError)respond(res,502,{error:t('DeepSeek 返回了无法读取的回复，请重试。','DeepSeek returned an unreadable response. Please try again.')});
  else respond(res,502,{error:t('无法连接 DeepSeek，请检查网络后重试。','Could not reach DeepSeek. Check your connection and try again.')});
 }finally{
  res.off('close',abort);
 }
}

export function createChatMiddleware(apiKey:string|undefined){
 return (req:IncomingMessage,res:ServerResponse,next:()=>void)=>{
  if(req.url?.split('?',1)[0]!==chatPath){next();return;}
  let language:ChatLanguage=req.headers['x-spacemate-language']==='en'?'en':'zh';
  const t=(zh:string,en:string)=>localize(language,zh,en);
  const bodyTooLong=()=>respond(res,413,{error:t('聊天内容过长，请缩短消息后重试。','The chat request is too long. Shorten your message and try again.')});
  if(req.method!=='POST'){
   res.setHeader('Allow','POST');
   respond(res,405,{error:t('聊天接口只支持 POST。','The chat endpoint requires POST.')});
   req.resume();
   return;
  }
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){
   respond(res,403,{error:t('请从 SpaceMate 页面发起聊天。','Please start the chat from the SpaceMate page.')});
   req.resume();
   return;
  }
  if(req.headers['content-type']?.split(';',1)[0].trim().toLowerCase()!=='application/json'){
   respond(res,415,{error:t('聊天请求必须使用 JSON。','Chat requests must use JSON.')});
   req.resume();
   return;
  }
  if(Number(req.headers['content-length'])>maxBodyBytes){
   bodyTooLong();
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
    bodyTooLong();
    return;
   }
   chunks.push(chunk);
  });
  req.on('error',()=>{
   finished=true;
   respond(res,400,{error:t('读取聊天请求失败，请重试。','The chat request could not be read. Please try again.')});
  });
  req.on('end',()=>{
   if(finished)return;
   let payload:unknown;
   try{payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
   catch{respond(res,400,{error:t('聊天请求必须是有效的 JSON。','Chat requests must contain valid JSON.')});return;}
   if(isRecord(payload)&&(payload.language==='en'||payload.language==='zh'))language=payload.language;
   const messages=readMessages(payload);
   if(!messages){respond(res,400,{error:t('聊天消息格式有误或内容过长，请修改后重试。','The chat message is invalid or too long. Edit it and try again.')});return;}
   const context=isRecord(payload)&&'layout' in payload?readLayoutContext(payload.layout):undefined;
   if(isRecord(payload)&&'layout' in payload&&!context){
    respond(res,400,{error:t('当前房间数据无法用于布局建议，请检查房间和家具信息。','Could not read the current room layout. Check the room and furniture details and try again.')});return;
   }
   void requestReply(apiKey,messages,res,language,context);
  });
 };
}
