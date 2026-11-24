import {useEffect,useRef,useState} from 'react';
import {ChevronDown,ChevronUp,Send,Sparkles} from 'lucide-react';
import {isMove,isRecord,itemLabel,layoutPreferences,makeLayoutContext,roomObjectives,type Advice,type AdviceDraft,type LayoutPreference,type MoveExplanation,type RoomObjective} from './layoutAdvice';
import {readRoomEdit} from './roomEdits';
import {CATALOG,WALL_MATERIALS,type House} from './model';
import {useI18n} from './i18n';

type ChatMessage={role:'user'|'assistant';content:string;moveLabel?:string};
type ActiveAdvice={base:House; question:string; advice:Exclude<Advice,{kind:'text'}>; index:number};
const localErrors={
  unavailable:['聊天服务暂时不可用，请稍后重试。','The chat service is unavailable. Try again shortly.'],
  invalid:['聊天服务没有返回可显示的回复，请重试。','The chat service returned an unreadable reply. Please try again.'],
  timeout:['等待回复超时，请重试。','The reply took too long. Please try again.'],
  network:['暂时无法连接聊天服务，请重试。','Could not reach the chat service. Please try again.'],
} as const;
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
  const {language,t,tx}=useI18n();
  const [text,setText]=useState('');
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [pending,setPending]=useState('');
  const [error,setError]=useState<{message:string}|{local:keyof typeof localErrors}|null>(null);
  const [preference,setPreference]=useState<LayoutPreference>('balanced');
  const [custom,setCustom]=useState('');
  const [active,setActive]=useState<ActiveAdvice|null>(null);
  const logRef=useRef<HTMLDivElement>(null),requestRef=useRef<AbortController|null>(null);
  const room=house.rooms.find(value=>value.id===roomId)!;
  const items=house.items.filter(item=>item.roomId===roomId);
  const roomName=t(room.name);
  const nameOf=(id:string)=>t(itemLabel(items,id));
  const toggleLabel=collapsed?tx('展开空间助手','Expand Space Assistant'):tx('收起空间助手','Collapse Space Assistant');
  const previewLabel=tx('预览建议','Preview suggestion');
  const applyLabel=tx('应用建议','Apply suggestion');
  const cancelPreviewLabel=tx('取消预览','Cancel preview');
  const ignoreLabel=tx('忽略建议','Dismiss suggestion');
  const reasonLabel=tx('理由','Reason');
  const impactLabel=tx('影响','Impact');
  const preferenceLabels={balanced:tx(layoutPreferences.balanced,'Follow my request'),passage:tx(layoutPreferences.passage,'Prioritize access'),hosting:tx(layoutPreferences.hosting,'Prioritize seating')};
  const replyText=(message:ChatMessage)=>{
    if(message.role==='user')return message.content;
    const reply=t(message.content);
    if(!message.moveLabel)return reply;
    const name=t(message.moveLabel);
    return tx(`建议移动${name}。${reply}`,`Suggested move: ${name}. ${reply}`);
  };

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
    setError(null);
    setPending(content);
    if(collapsed) onToggle();
    try {
      const response=await fetch('/api/ai/chat',{
        method:'POST',
        headers:{'Content-Type':'application/json','X-SpaceMate-Language':language},
        body:JSON.stringify({messages:requestMessages.map(({role,content,moveLabel})=>({role,content:moveLabel?`建议移动${moveLabel}。${content}`:content})),layout,language}),
        signal:AbortSignal.any([controller.signal,timeout]),
      });
      const result:unknown=await response.json().catch(()=>null);
      if(controller.signal.aborted) return;
      if(!response.ok) {
        setError(isRecord(result)&&typeof result.error==='string'?{message:result.error}:{local:'unavailable'});
      } else {
        const advice=readAdvice(result,house,roomId);
        if(advice) {
          const moveLabel=advice.kind==='proposal'?itemLabel(items,advice.moves[0].itemId):undefined;
          setMessages(previous=>[...previous,{role:'user',content},{role:'assistant',content:advice.reply,moveLabel}]);
          if(advice.kind!=='text') setActive({base:house,question:content,advice,index:0});
          else if(advice.keepSuggestion&&prior) setActive(prior);
          return;
        }
        setError({local:'invalid'});
      }
    } catch {
      if(controller.signal.aborted) return;
      setError({local:timeout.aborted?'timeout':'network'});
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

  return <section className={'assistant-panel floating '+(collapsed?'compact':'expanded')} aria-label={tx('空间助手','Space Assistant')}>
    <div className="assistant-heading">
      <h2><Sparkles size={19}/>{tx('空间助手','Space Assistant')}</h2>
      {!collapsed&&<span className="assistant-room" title={roomName}>{roomName}</span>}
      <button className="icon-button panel-collapse" title={toggleLabel} aria-label={toggleLabel} aria-expanded={!collapsed} onClick={onToggle}>
        {collapsed?<ChevronUp size={18}/>:<ChevronDown size={18}/>}</button>
    </div>
    {!collapsed&&<>
      <div className="assistant-preferences">
        <label>{tx('布局偏好','Layout priority')} <select aria-label={tx('布局偏好','Layout priority')} value={preference} disabled={!!pending} onChange={event=>preferenceChanged(event.target.value as LayoutPreference)}>
          {Object.entries(preferenceLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select></label>
        <input aria-label={tx('自定义布局要求','Additional layout requirements')} placeholder={tx('补充要求（例如沙发保持原位）','Extra requirements (e.g. keep the sofa in place)')} maxLength={200} value={custom} disabled={!!pending} onChange={event=>{
          setCustom(event.target.value);
          if(active){setText(draft=>draft||active.question);ignore();}
        }}/>
      </div>
      <div className="assistant-chat-log" role="log" aria-label={tx('聊天记录','Conversation')} ref={logRef} tabIndex={0}>
        {!messages.length&&!pending&&<p className="assistant-note">{tx(`可以请我布置${roomName}、添加家具或换墙面。`,`Ask me to arrange furniture in ${roomName}, add an item, or change the walls.`)}</p>}
        {(pending?[...messages,{role:'user' as const,content:pending}]:messages).map((message,index)=><div className={'assistant-chat-message '+message.role} key={index}>
          <strong>{message.role==='user'?tx('你','You'):tx('空间助手','Space Assistant')}</strong><div>{messageText(replyText(message))}</div>
        </div>)}
        {pending&&<p className="assistant-note" role="status">{tx('正在分析当前房间…','Analyzing the current room…')}</p>}
      </div>
      {active&&<div className={`assistant-result${!stale&&(move||roomPlan||roomEdit)?' assistant-result--proposal':''}`} role="region" aria-label={tx('布局建议','Layout suggestion')}>
        {stale?<>
          <p>{tx('布局已变化，请按当前房间重新生成建议。','The layout changed. Generate a new suggestion for the current room.')}</p>
          <div className="assistant-actions"><button type="button" onClick={()=>void send(active.question)}>{tx('重新生成','Generate again')}</button><button type="button" onClick={ignore}>{tx('关闭','Close')}</button></div>
        </>:roomEdit?<>
          <div className="assistant-result-title"><strong>{roomName} · {roomEdit.edit.action==='wallMaterial'
            ? `${tx('将墙面更换为','Change walls to ')}${t(WALL_MATERIALS[roomEdit.edit.wallMaterial].name)}`
            : `${tx('添加','Add ')}${t(CATALOG[roomEdit.edit.furnitureKind].name)}`}</strong></div>
          <div className="assistant-actions">
            <button type="button" className="assistant-primary" disabled={unavailable} onClick={()=>{
              if(!previewing){onPreview(roomEdit,active.base);return;}
              if(onApply(roomEdit,active.base))setActive(null);
            }}>{previewing?applyLabel:previewLabel}</button>
            {previewing&&<button type="button" onClick={()=>onPreview(null,house)}>{cancelPreviewLabel}</button>}
            <button type="button" onClick={ignore}>{ignoreLabel}</button>
          </div>
        </>:roomPlan?<>
          <div className="assistant-result-title"><strong>{roomName} · {tx(`建议调整 ${roomPlan.changes.length} 件家具`,`Move ${roomPlan.changes.length} ${roomPlan.changes.length===1?'item':'items'}`)}</strong></div>
          <dl className="assistant-explanation"><dt>{tx('目标','Goal')}</dt><dd>{t(roomPlan.objectiveLabel)}</dd></dl>
          <p>{t(roomPlan.reply)}</p>
          <div className="assistant-actions">
            <button type="button" className="assistant-primary" disabled={unavailable} onClick={()=>{
              if(!previewing){onPreview(roomPlan,active.base);return;}
              if(onApply(roomPlan,active.base))setActive(null);
            }}>{previewing?tx('应用方案','Apply plan'):tx('预览方案','Preview plan')}</button>
            {previewing&&<button type="button" onClick={()=>onPreview(null,house)}>{cancelPreviewLabel}</button>}
            <button type="button" onClick={ignore}>{tx('保留现状','Keep current layout')}</button>
          </div>
          <details className="assistant-explanation-detail assistant-room-detail">
            <summary>{tx('查看每件家具的调整理由和影响','See the reason and impact for each move')}</summary>
            <ul>{roomPlan.changes.map((change,index)=>{
              const detail=roomPlan.explanations[index];
              return <li key={change.itemId}>
                <button type="button" className="assistant-item" onClick={()=>onFocus(change.itemId)}>{nameOf(change.itemId)}</button> {t(detail.movement)}
                <dl className="assistant-explanation"><dt>{reasonLabel}</dt><dd>{t(detail.reason)}</dd><dt>{impactLabel}</dt><dd>{t(detail.impact)}</dd></dl>
              </li>;
            })}</ul>
          </details>
        </>:move&&explanation?<>
          <div className="assistant-result-title"><button className="assistant-item" type="button" aria-label={tx(`在画布定位${nameOf(move.itemId)}`,`Locate ${nameOf(move.itemId)} on the canvas`)} onClick={()=>onFocus(move.itemId)}>{nameOf(move.itemId)}</button>
          <strong>{t(explanation.movement)}</strong></div>
          <dl className="assistant-explanation">
            <dt>{reasonLabel}</dt><dd>{t(explanation.reason)}</dd>
            <dt>{impactLabel}</dt><dd>{t(explanation.impact)}</dd>
          </dl>
          <div className="assistant-actions">
            <button type="button" className="assistant-primary" disabled={unavailable} onClick={()=>{
              if(!previewing){onPreview(move,active.base);return;}
              if(onApply(move,active.base))setActive(null);
            }}>{previewing?applyLabel:previewLabel}</button>
            {previewing&&<button type="button" onClick={()=>onPreview(null,house)}>{cancelPreviewLabel}</button>}
            {active.advice.kind==='proposal'&&active.index+1<active.advice.moves.length&&<button type="button" onClick={()=>{
              onPreview(null,house);setActive({...active,index:active.index+1});
            }}>{tx('换个位置','Try another position')}</button>}
            <button type="button" onClick={ignore}>{ignoreLabel}</button>
          </div>
          {explanation.details.length>0&&<details className="assistant-explanation-detail" key={active.index}>
            <summary>{tx('查看计算详情','See measurements')}</summary>
            <ul aria-label={tx('按当前户型模型计算','Calculated from the current floor plan')}>{explanation.details.map(detail=><li key={detail}>{t(detail)}</li>)}</ul>
          </details>}
        </>:<>
          <p>{t(active.advice.reply)} {tx('可点击名称高亮，也可直接在画布中选中。','Choose a name to highlight it, or select the item on the canvas.')}</p>
          <div className="assistant-actions">
            {clarifyIds.map(id=><button type="button" key={id} aria-pressed={confirmed===id} onClick={()=>onFocus(id)}>{nameOf(id)}</button>)}
            <button type="button" className="assistant-primary" disabled={!confirmed} onClick={()=>void send(active.question,confirmed)}>{tx('用这件家具继续','Continue with this item')}</button>
            <button type="button" onClick={ignore}>{tx('取消','Cancel')}</button>
          </div>
        </>}
      </div>}
      {error&&<p className="assistant-chat-error" role="alert">{'local' in error?localErrors[error.local][language==='en'?1:0]:t(error.message)}</p>}
    </>}
    <form className="assistant-form" onSubmit={event=>{event.preventDefault();void send();}}>
      <textarea aria-label={tx('聊天消息','Chat message')} value={text} onChange={event=>setText(event.target.value)} placeholder={tx('例：保留沙发，让房间中央更宽敞','E.g. keep the sofa and clear the center')} rows={1} maxLength={2000} onKeyDown={event=>{
        if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;
        if(event.key==='Escape'){event.stopPropagation();if(previewDraft)onPreview(null,house);else if(!collapsed)onToggle();else event.currentTarget.blur();}
        if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit();}
      }}/>
      <button className="generate-button" disabled={!text.trim()||!!pending} type="submit"><Send size={16}/>{pending?tx('等待回复','Waiting…'):tx('发送','Send')}</button>
    </form>
  </section>;
}
