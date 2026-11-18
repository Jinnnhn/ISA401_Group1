import {useEffect,useRef,useState} from 'react';
import {ChevronDown,ChevronUp,Send,Sparkles} from 'lucide-react';

type ChatMessage={role:'user'|'assistant';content:string};
const MAX_INPUT_LENGTH=2000;
const MAX_HISTORY_MESSAGES=18;

export default function AssistantPanel({collapsed,onToggle}:{collapsed:boolean;onToggle:()=>void}){
 const [text,setText]=useState('');
 const [messages,setMessages]=useState<ChatMessage[]>([]);
 const [pending,setPending]=useState('');
 const [error,setError]=useState('');
 const logRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const log=logRef.current;
  if(log)log.scrollTop=log.scrollHeight;
 },[messages,pending,collapsed]);

 async function send(){
  const content=text.trim();
  if(!content||pending)return;
  const requestMessages:ChatMessage[]=[...messages.slice(-MAX_HISTORY_MESSAGES),{role:'user',content}];
  const signal=AbortSignal.timeout(32_000);
  setText('');
  setError('');
  setPending(content);
  if(collapsed)onToggle();
  try{
   const response=await fetch('/api/ai/chat',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:requestMessages}),signal,
   });
   const result:{reply?:unknown;error?:unknown}|null=await response.json().catch(()=>null);
   if(!response.ok){
    setError(typeof result?.error==='string'?result.error:'聊天服务暂时不可用，请稍后重试。');
   }else if(typeof result?.reply!=='string'||!result.reply.trim()){
    setError('聊天服务没有返回可显示的回复，请重试。');
   }else{
    const reply=result.reply;
    setMessages(previous=>[...previous,{role:'user',content},{role:'assistant',content:reply}]);
    return;
   }
  }catch{
   setError(signal.aborted?'等待回复超时，请重试。':'暂时无法连接聊天服务，请重试。');
  }finally{
   setPending('');
  }
  setText(draft=>draft||content);
 }

 const visibleMessages:ChatMessage[]=pending?[...messages,{role:'user',content:pending}]:messages;
 return <section className={'assistant-panel floating '+(collapsed?'compact':'expanded')} aria-label="空间助手">
  <div className="assistant-heading">
   <h2><Sparkles size={19}/>空间助手</h2>
   <span className="demo-badge">聊天测试</span>
   <button className="icon-button panel-collapse" title={collapsed?'展开空间助手':'收起空间助手'} aria-label={collapsed?'展开空间助手':'收起空间助手'} aria-expanded={!collapsed} onClick={onToggle}>{collapsed?<ChevronUp size={18}/>:<ChevronDown size={18}/>}</button>
  </div>
  {!collapsed&&<div className="assistant-chat-log" role="log" aria-label="聊天记录" ref={logRef} tabIndex={0}>
   {!visibleMessages.length&&<p className="assistant-note">你好！可以先打个招呼，或者问我一个关于空间布置的问题。</p>}
   {visibleMessages.map((message,index)=><div className={'assistant-chat-message '+message.role} key={index}>
    <strong>{message.role==='user'?'你':'空间助手'}</strong>
    <div>{message.content}</div>
   </div>)}
   {pending&&<p className="assistant-note" role="status">正在等待回复…</p>}
  </div>}
  {!collapsed&&error&&<p className="assistant-chat-error" role="alert">{error}</p>}
  <form className="assistant-form" onSubmit={e=>{e.preventDefault();void send();}}>
   <textarea aria-label="聊天消息" value={text} onChange={e=>setText(e.target.value)} placeholder="输入消息…" rows={1} maxLength={MAX_INPUT_LENGTH} onKeyDown={e=>{
    if(e.nativeEvent.isComposing||e.nativeEvent.keyCode===229)return;
    if(e.key==='Escape'){e.stopPropagation();if(!collapsed)onToggle();else e.currentTarget.blur();}
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.currentTarget.form?.requestSubmit();}
   }}/>
   <button className="generate-button" disabled={!text.trim()||!!pending} type="submit"><Send size={16}/>{pending?'等待回复':'发送'}</button>
  </form>
 </section>;
}
