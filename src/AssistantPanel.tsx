import {useEffect,useRef,useState} from 'react';
import {ChevronDown,ChevronUp,Send,Sparkles} from 'lucide-react';
import {isMove,isRecord,itemLabel,layoutPreferences,makeLayoutContext,roomObjectives,type Advice,type AdviceDraft,type LayoutPreference,type MoveExplanation,type RoomObjective} from './layoutAdvice';
import {readRoomEdit,roomEditTitle} from './roomEdits';
import type {House} from './model';

type ChatMessage={role:'user'|'assistant';content:string};
type ActiveAdvice={base:House; question:string; advice:Exclude<Advice,{kind:'text'}>; index:number};
type Props={
  house:House; roomId:string; selected:string[]; collapsed:boolean; unavailable:boolean; previewDraft:AdviceDraft|null;
  onToggle:()=>void; onFocus:(id:string)=>void; onPreview:(draft:AdviceDraft|null,base:House)=>boolean; onApply:(draft:AdviceDraft,base:House)=>boolean;
};

function readExplanations(value:unknown,length:number):MoveExplanation[]|undefined {
  if(!Array.isArray(value)||value.length!==length)return;
  if(value.every(entry=>isRecord(entry)&&typeof entry.movement==='string'&&typeof entry.reason==='string'
    &&typeof entry.impact==='string'&&Array.isArray(entry.details)&&entry.details.every(detail=>typeof detail==='string')))
    return value as MoveExplanation[];
}

function readAdvice(value:unknown,house:House,roomId:string):Advice | undefined {
  if(!isRecord(value) || typeof value.reply!=='string' || !value.reply.trim()) return;
  const isItem=(id:unknown)=>house.items.some(item=>item.id===id && item.roomId===roomId);
  if(value.kind==='proposal') {
    if(!Array.isArray(value.moves) || value.moves.length<1 || value.moves.length>2) return;
    if(!value.moves.every(move=>isMove(move)&&isItem(move.itemId)))return;
    const reply=value.reply;
    const explanations=readExplanations(value.explanations,value.moves.length)
      ??value.moves.map(()=>({movement:'移动位置',reason:reply,impact:'其他家具保持原位。',details:[]}));
    return {kind:'proposal',reply,moves:value.moves,explanations};
  }
  if(value.kind==='roomProposal'){
    const {changes,objective,objectiveLabel,preserveIds}=value;
    if(!Array.isArray(changes)||!changes.length||changes.length>60||!changes.every(move=>isMove(move)&&isItem(move.itemId))
      ||new Set(changes.map(move=>move.itemId)).size!==changes.length||!roomObjectives.includes(objective as RoomObjective)
      ||typeof objectiveLabel!=='string'||!Array.isArray(preserveIds)||!preserveIds.every(isItem))return;
    const explanations=readExplanations(value.explanations,changes.length);
    if(!explanations)return;
    return {kind:'roomProposal',reply:value.reply,changes,objective:objective as RoomObjective,objectiveLabel,preserveIds,explanations};
  }
  if(value.kind==='clarify') {
    if(!Array.isArray(value.candidateIds) || value.candidateIds.length<2 || !value.candidateIds.every(isItem)) return;
    return {kind:'clarify',reply:value.reply,candidateIds:value.candidateIds as string[]};
  }
  if(value.kind==='roomEdit'){
    const edit=readRoomEdit(value.edit,roomId);
    if(edit)return {kind:'roomEdit',reply:value.reply,edit};
    return;
  }
  if(value.kind===undefined || value.kind==='text') return {kind:'text',reply:value.reply,keepSuggestion:value.keepSuggestion===true};
}

function messageText(content:string) {
  return content.split(/(\*\*[^*\n]+\*\*)/).map((part,index)=>part.startsWith('**') && part.endsWith('**')
    ? <b key={index}>{part.slice(2,-2)}</b> : part);
}

export default function AssistantPanel({house,roomId,selected,collapsed,unavailable,previewDraft,onToggle,onFocus,onPreview,onApply}:Props){
  const [text,setText]=useState('');
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [pending,setPending]=useState('');
  const [error,setError]=useState('');
  const [preference,setPreference]=useState<LayoutPreference>('balanced');
  const [custom,setCustom]=useState('');
  const [active,setActive]=useState<ActiveAdvice|null>(null);
  const logRef=useRef<HTMLDivElement>(null),requestRef=useRef<AbortController|null>(null);
  const room=house.rooms.find(value=>value.id===roomId)!;
  const items=house.items.filter(item=>item.roomId===roomId);

  useEffect(()=>()=>requestRef.current?.abort(),[]);
  useEffect(()=>{
    const log=logRef.current;
    if(log?.lastElementChild) log.scrollTop=Math.max(0,(log.lastElementChild as HTMLElement).offsetTop-8);
  },[messages,pending,collapsed]);

  async function send(content=text.trim(),confirmedId?:string){
    if(!content || requestRef.current) return;
    const controller=new AbortController();
    requestRef.current=controller;
    const requestMessages:ChatMessage[]=[...messages.slice(-18),{role:'user',content}];
    const timeout=AbortSignal.timeout(32_000);
    const prior=active?.base===house?active:undefined;
    const priorMove=prior?.advice.kind==='proposal'?prior.advice.moves[prior.index]:undefined;
    const previousRoom=prior?.advice.kind==='roomProposal'?prior.advice:undefined;
    const layout=makeLayoutContext(house,roomId,selected,preference,custom.trim(),confirmedId,
      priorMove?{move:priorMove,state:previewDraft===priorMove?'previewing':'suggested'}:undefined,
      previousRoom?{objective:previousRoom.objective,changes:previousRoom.changes,preserveIds:previousRoom.preserveIds}:undefined);
    onPreview(null,house);
    setActive(null);
    setText('');
    setError('');
    setPending(content);
    if(collapsed) onToggle();
    try {
      const response=await fetch('/api/ai/chat',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:requestMessages,layout}),
        signal:AbortSignal.any([controller.signal,timeout]),
      });
      const result:unknown=await response.json().catch(()=>null);
      if(controller.signal.aborted) return;
      if(!response.ok) {
        setError(isRecord(result)&&typeof result.error==='string'?result.error:'聊天服务暂时不可用，请稍后重试。');
      } else {
        const advice=readAdvice(result,house,roomId);
        if(advice) {
          const historyReply=advice.kind==='proposal'
            ? `建议移动${itemLabel(items,advice.moves[0].itemId)}。${advice.reply}` : advice.reply;
          setMessages(previous=>[...previous,{role:'user',content},{role:'assistant',content:historyReply}]);
          if(advice.kind!=='text') setActive({base:house,question:content,advice,index:0});
          else if(advice.keepSuggestion&&prior) setActive(prior);
          return;
        }
        setError('聊天服务没有返回可显示的回复，请重试。');
      }
    } catch {
      if(controller.signal.aborted) return;
      setError(timeout.aborted?'等待回复超时，请重试。':'暂时无法连接聊天服务，请重试。');
    } finally {
      requestRef.current=null;
      if(!controller.signal.aborted) setPending('');
    }
    if(prior)setActive(prior);
    setText(draft=>draft||content);
  }

  const stale=!!active && active.base!==house;
  const move=active?.advice.kind==='proposal'?active.advice.moves[active.index]:null;
  const explanation=active?.advice.kind==='proposal'?active.advice.explanations[active.index]:null;
  const roomPlan=active?.advice.kind==='roomProposal'?active.advice:null;
  const roomEdit=active?.advice.kind==='roomEdit'?active.advice:null;
  const previewing=previewDraft!==null&&(previewDraft===move||previewDraft===roomPlan||previewDraft===roomEdit);
  const clarifyIds=active?.advice.kind==='clarify'?active.advice.candidateIds:[];
  const confirmed=selected.length===1 && clarifyIds.includes(selected[0])?selected[0]:undefined;

  function ignore(){onPreview(null,house);setActive(null);}
  function preferenceChanged(next:LayoutPreference){
    setPreference(next);
    if(active) {setText(draft=>draft||active.question);ignore();}
  }

  return <section className={'assistant-panel floating '+(collapsed?'compact':'expanded')} aria-label="空间助手">
    <div className="assistant-heading">
      <h2><Sparkles size={19}/>空间助手</h2>
      {!collapsed&&<span className="assistant-room" title={room.name}>{room.name}</span>}
      <button className="icon-button panel-collapse" title={collapsed?'展开空间助手':'收起空间助手'} aria-label={collapsed?'展开空间助手':'收起空间助手'} aria-expanded={!collapsed} onClick={onToggle}>
        {collapsed?<ChevronUp size={18}/>:<ChevronDown size={18}/>}</button>
    </div>
    {!collapsed&&<>
      <div className="assistant-preferences">
        <label>布局偏好 <select aria-label="布局偏好" value={preference} disabled={!!pending} onChange={event=>preferenceChanged(event.target.value as LayoutPreference)}>
          {Object.entries(layoutPreferences).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select></label>
        <input aria-label="自定义布局要求" placeholder="补充要求（例如沙发保持原位）" maxLength={200} value={custom} disabled={!!pending} onChange={event=>{
          setCustom(event.target.value);
          if(active){setText(draft=>draft||active.question);ignore();}
        }}/>
      </div>
      <div className="assistant-chat-log" role="log" aria-label="聊天记录" ref={logRef} tabIndex={0}>
        {!messages.length&&!pending&&<p className="assistant-note">可以请我布置{room.name}、添加家具或换墙面。</p>}
        {(pending?[...messages,{role:'user' as const,content:pending}]:messages).map((message,index)=><div className={'assistant-chat-message '+message.role} key={index}>
          <strong>{message.role==='user'?'你':'空间助手'}</strong><div>{messageText(message.content)}</div>
        </div>)}
        {pending&&<p className="assistant-note" role="status">正在分析当前房间…</p>}
      </div>
      {active&&<div className={`assistant-result${!stale&&(move||roomPlan||roomEdit)?' assistant-result--proposal':''}`} role="region" aria-label="布局建议">
        {stale?<>
          <p>布局已变化，请按当前房间重新生成建议。</p>
          <div className="assistant-actions"><button type="button" onClick={()=>void send(active.question)}>重新生成</button><button type="button" onClick={ignore}>关闭</button></div>
        </>:roomEdit?<>
          <div className="assistant-result-title"><strong>{room.name} · {roomEditTitle(roomEdit.edit)}</strong></div>
          <div className="assistant-actions">
            <button type="button" className="assistant-primary" disabled={unavailable} onClick={()=>{
              if(!previewing){onPreview(roomEdit,active.base);return;}
              if(onApply(roomEdit,active.base))setActive(null);
            }}>{previewing?'应用建议':'预览建议'}</button>
            {previewing&&<button type="button" onClick={()=>onPreview(null,house)}>取消预览</button>}
            <button type="button" onClick={ignore}>忽略建议</button>
          </div>
        </>:roomPlan?<>
          <div className="assistant-result-title"><strong>{room.name} · 建议调整 {roomPlan.changes.length} 件家具</strong></div>
          <dl className="assistant-explanation"><dt>目标</dt><dd>{roomPlan.objectiveLabel}</dd></dl>
          <p>{roomPlan.reply}</p>
          <div className="assistant-actions">
            <button type="button" className="assistant-primary" disabled={unavailable} onClick={()=>{
              if(!previewing){onPreview(roomPlan,active.base);return;}
              if(onApply(roomPlan,active.base))setActive(null);
            }}>{previewing?'应用方案':'预览方案'}</button>
            {previewing&&<button type="button" onClick={()=>onPreview(null,house)}>取消预览</button>}
            <button type="button" onClick={ignore}>保留现状</button>
          </div>
          <details className="assistant-explanation-detail assistant-room-detail">
            <summary>查看每件家具的调整理由和影响</summary>
            <ul>{roomPlan.changes.map((change,index)=>{
              const detail=roomPlan.explanations[index];
              return <li key={change.itemId}>
                <button type="button" className="assistant-item" onClick={()=>onFocus(change.itemId)}>{itemLabel(items,change.itemId)}</button> {detail.movement}
                <dl className="assistant-explanation"><dt>理由</dt><dd>{detail.reason}</dd><dt>影响</dt><dd>{detail.impact}</dd></dl>
              </li>;
            })}</ul>
          </details>
        </>:move&&explanation?<>
          <div className="assistant-result-title"><button className="assistant-item" type="button" aria-label={`在画布定位${itemLabel(items,move.itemId)}`} onClick={()=>onFocus(move.itemId)}>{itemLabel(items,move.itemId)}</button>
          <strong>{explanation.movement}</strong></div>
          <dl className="assistant-explanation">
            <dt>理由</dt><dd>{explanation.reason}</dd>
            <dt>影响</dt><dd>{explanation.impact}</dd>
          </dl>
          <div className="assistant-actions">
            <button type="button" className="assistant-primary" disabled={unavailable} onClick={()=>{
              if(!previewing){onPreview(move,active.base);return;}
              if(onApply(move,active.base))setActive(null);
            }}>{previewing?'应用建议':'预览建议'}</button>
            {previewing&&<button type="button" onClick={()=>onPreview(null,house)}>取消预览</button>}
            {active.advice.kind==='proposal'&&active.index+1<active.advice.moves.length&&<button type="button" onClick={()=>{
              onPreview(null,house);setActive({...active,index:active.index+1});
            }}>换个位置</button>}
            <button type="button" onClick={ignore}>忽略建议</button>
          </div>
          {explanation.details.length>0&&<details className="assistant-explanation-detail" key={active.index}>
            <summary>查看计算详情</summary>
            <ul aria-label="按当前户型模型计算">{explanation.details.map(detail=><li key={detail}>{detail}</li>)}</ul>
          </details>}
        </>:<>
          <p>{active.advice.reply} 可点击名称高亮，也可直接在画布中选中。</p>
          <div className="assistant-actions">
            {clarifyIds.map(id=><button type="button" key={id} aria-pressed={confirmed===id} onClick={()=>onFocus(id)}>{itemLabel(items,id)}</button>)}
            <button type="button" className="assistant-primary" disabled={!confirmed} onClick={()=>void send(active.question,confirmed)}>用这件家具继续</button>
            <button type="button" onClick={ignore}>取消</button>
          </div>
        </>}
      </div>}
      {error&&<p className="assistant-chat-error" role="alert">{error}</p>}
    </>}
    <form className="assistant-form" onSubmit={event=>{event.preventDefault();void send();}}>
      <textarea aria-label="聊天消息" value={text} onChange={event=>setText(event.target.value)} placeholder="例：保留沙发，让房间中央更宽敞" rows={1} maxLength={2000} onKeyDown={event=>{
        if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;
        if(event.key==='Escape'){event.stopPropagation();if(previewDraft)onPreview(null,house);else if(!collapsed)onToggle();else event.currentTarget.blur();}
        if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit();}
      }}/>
      <button className="generate-button" disabled={!text.trim()||!!pending} type="submit"><Send size={16}/>{pending?'等待回复':'发送'}</button>
    </form>
  </section>;
}
