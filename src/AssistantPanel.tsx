import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {ChevronLeft,ChevronRight,Sparkles} from 'lucide-react';

export default function AssistantPanel({room,selectedCount,collapsed,onToggle,onMessage}:{room:string;selectedCount:number;collapsed:boolean;onToggle:()=>void;onMessage:(s:string)=>void}){
 const [text,setText]=useState(''),[scope,setScope]=useState('room');
 const panelRef=useRef<HTMLElement>(null),gesture=useRef<{id:number;offsetX:number;offsetY:number}|null>(null),[position,setPosition]=useState<{x:number;y:number}|null>(null);
 function constrain(x:number,y:number){const panel=panelRef.current!,parent=panel.parentElement!;return {x:Math.max(12,Math.min(x,parent.clientWidth-panel.offsetWidth-12)),y:Math.max(12,Math.min(y,parent.clientHeight-panel.offsetHeight-12))};}
 useEffect(()=>{const panel=panelRef.current;if(!panel||collapsed)return;const observer=new ResizeObserver(()=>setPosition(p=>{if(!p)return p;const next=constrain(p.x,p.y);return next.x===p.x&&next.y===p.y?p:next;}));observer.observe(panel);if(panel.parentElement)observer.observe(panel.parentElement);return()=>observer.disconnect();},[collapsed]);
 function startMove(e:ReactPointerEvent<HTMLElement>){if(e.button!==0||(e.target as HTMLElement).closest('button,input,textarea,select,label'))return;const panel=panelRef.current!,rect=panel.getBoundingClientRect(),parent=panel.parentElement!.getBoundingClientRect();gesture.current={id:e.pointerId,offsetX:e.clientX-rect.left,offsetY:e.clientY-rect.top};setPosition(constrain(rect.left-parent.left,rect.top-parent.top));e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();}
 function move(e:ReactPointerEvent<HTMLElement>){const drag=gesture.current;if(!drag||drag.id!==e.pointerId)return;const parent=panelRef.current!.parentElement!.getBoundingClientRect();setPosition(constrain(e.clientX-parent.left-drag.offsetX,e.clientY-parent.top-drag.offsetY));e.preventDefault();e.stopPropagation();}
 function endMove(e:ReactPointerEvent<HTMLElement>){if(gesture.current?.id!==e.pointerId)return;gesture.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}
 useEffect(()=>{if(!selectedCount)setScope('room');},[selectedCount]);
 if(collapsed)return <button className="panel-reopen assistant-reopen floating" aria-label="展开空间助手" onClick={onToggle}><Sparkles size={17}/> 空间助手 <ChevronLeft size={16}/></button>;
 return <section ref={panelRef} className="assistant-panel floating" aria-label="空间助手" style={position?{left:position.x,top:position.y,bottom:'auto',right:'auto',transform:'none'}:undefined}>
  <div className="assistant-heading" title="拖动标题栏移动空间助手" onPointerDown={startMove} onPointerMove={move} onPointerUp={endMove} onPointerCancel={endMove} onLostPointerCapture={endMove}><h2><Sparkles size={21}/>空间助手</h2><span className="demo-badge">界面预览</span><label>作用范围<select aria-label="建议作用范围" value={scope} onChange={e=>setScope(e.target.value)}><option value="room">整个{room}</option><option value="selected" disabled={!selectedCount}>选中家具（{selectedCount}）</option></select></label><button className="icon-button panel-collapse" title="收起空间助手" aria-label="收起空间助手" aria-expanded="true" onClick={onToggle}><ChevronRight size={19}/></button></div>
  <form className="assistant-form" onSubmit={e=>{e.preventDefault();onMessage('AI 建议暂未接入，当前仅展示输入和操作界面。');}}><textarea aria-label="布局需求" value={text} onChange={e=>setText(e.target.value)} placeholder="例如：沙发不动，茶几靠近沙发" rows={1}/><button className="generate-button" disabled={!text.trim()} type="submit"><Sparkles size={17}/>生成建议</button></form>
  <div className="assistant-examples"><span>试试看</span>{['茶几靠近沙发','中央留出活动空间','选中家具向右移动0.5米'].map(s=><button key={s} onClick={()=>setText(s)}>{s}</button>)}</div>
  <p className="assistant-note">仅界面占位，尚未接入 AI 服务；输入内容不会提交。</p>
 </section>;
}
