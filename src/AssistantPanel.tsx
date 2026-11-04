import {useEffect,useState} from 'react';
import {ChevronDown,ChevronUp,Sparkles} from 'lucide-react';

export default function AssistantPanel({room,selectedCount,collapsed,onToggle,onMessage}:{room:string;selectedCount:number;collapsed:boolean;onToggle:()=>void;onMessage:(s:string)=>void}){
 const [text,setText]=useState(''),[scope,setScope]=useState('room');
 useEffect(()=>{if(!selectedCount)setScope('room');},[selectedCount]);
 return <section className={'assistant-panel floating '+(collapsed?'compact':'expanded')} aria-label="空间助手">
  <div className="assistant-heading"><h2><Sparkles size={19}/>空间助手</h2><span className="demo-badge">尚未接入 AI</span>{!collapsed&&<label>作用范围<select aria-label="建议作用范围" value={scope} onChange={e=>setScope(e.target.value)}><option value="room">整个{room}</option><option value="selected" disabled={!selectedCount}>选中家具（{selectedCount}）</option></select></label>}<button className="icon-button panel-collapse" title={collapsed?'展开空间助手':'收起空间助手'} aria-label={collapsed?'展开空间助手':'收起空间助手'} aria-expanded={!collapsed} onClick={onToggle}>{collapsed?<ChevronUp size={18}/>:<ChevronDown size={18}/>}</button></div>
  <form className="assistant-form" onSubmit={e=>{e.preventDefault();onMessage('AI 服务尚未接入，此处仅保留需求输入，不会生成或修改布局。');}}><textarea aria-label="布局需求" value={text} onChange={e=>setText(e.target.value)} placeholder="描述你的布局想法…" rows={1} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();if(!collapsed)onToggle();else e.currentTarget.blur();}}}/><button className="generate-button" disabled title="AI 服务尚未接入" type="submit"><Sparkles size={16}/>生成建议</button></form>
  {!collapsed&&<><div className="assistant-examples"><span>需求示例</span>{['沙发保持原位','中央留出活动空间'].map(s=><button key={s} onClick={()=>setText(s)}>{s}</button>)}</div><p className="assistant-note">目前仅可记录输入，内容不会提交给模型；切换房间前请明确需求作用对象。</p></>}
 </section>;
}
