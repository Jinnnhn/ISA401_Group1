import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import {toEnglish} from './english';

export type Language='zh'|'en';
type Messages={language:Language;setLanguage:(language:Language)=>void;t:(text:string)=>string;tx:(zh:string,en:string)=>string};
const storageKey='spacemate-language';
const I18nContext=createContext<Messages|null>(null);

const editorMessages:Record<string,string>={
 '无法读取本地保存，已载入示例户型。':'Could not read the saved layout. Loaded the sample floor plan.',
 '已恢复上次保存的房型布局。':'Restored your saved layout.',
 '左键拖动框选；先单击选中一件家具，再拖动它移动。':'Drag to box-select. Click a piece of furniture before dragging to move it.',
 '室内预览只读，请返回编辑后调整。':'Interior preview is read-only. Return to editing to make changes.',
 '这个位置或尺寸会穿墙，请先移动或缩小家具。':'This position or size crosses a wall. Move or resize the furniture first.',
 '正在预览建议。虚线标出家具原位置，应用后会记录到撤销历史。':'Previewing the suggestion. Dashed outlines show original positions. Apply to record the change in undo history.',
 '已应用布局建议，可撤销恢复。':'Layout suggestion applied. You can undo it.',
 '已返回编辑，恢复之前的视角和选择。':'Editing resumed with your previous view and selection.',
 '室内预览只读 · 右键环视，中键平移；Esc 返回编辑。':'Interior preview is read-only. Right-drag to look around, middle-drag to pan, or press Esc to edit.',
 '已撤销上一步操作。':'Undid the last action.',
 '已重做。':'Redid the last action.',
 '两个房型的全屋布局已保存，刷新后可恢复。':'Both floor plans were saved and will be restored after refresh.',
 '本地保存失败，请分别切换房型并导出 JSON 备份。':'Could not save locally. Switch to each floor plan and export a JSON backup.',
 '已删除选中的家具，可通过撤销恢复。':'Selected furniture deleted. You can undo it.',
 '已调整朝向并检查墙内边界；多选时各家具围绕自身中心旋转。':'Furniture rotated and checked against walls. Each item rotates around its own center.',
 '已解锁家具。':'Furniture unlocked.',
 '已锁定家具，不能移动、旋转、替换或删除。':'Locked furniture cannot be moved, rotated, replaced, or deleted.',
 '已替换家具并保留朝向，靠墙时自动移入墙内。':'Furniture replaced without changing its orientation. The replacement was checked against walls.',
 '当前房间没有足够空位，请先调整家具。':'There is not enough space in this room. Try rearranging the furniture first.',
 '已添加家具。先单击家具，再拖动它调整位置。':'Furniture added. Click it before dragging to move it.',
 '没有足够空位放置副本，原布局保持不变。':'There is not enough room for a copy. The layout is unchanged.',
 '已在附近空位放置副本，可撤销。':'Placed a copy in a nearby free spot. You can undo it.',
 '已沿 Z 中心线对齐，靠墙物件优先保持在墙内。':'Aligned along the Z center line, keeping furniture within the walls.',
 '已导出全屋布局 JSON。':'Exported the floor plan as JSON.',
 '已导入布局并校正墙内边界，可撤销恢复导入前状态。':'Layout imported and checked against walls. You can undo the import.',
 '导入失败：请选择本工具导出的有效布局 JSON（小于 2 MB）。':'Import failed. Choose a valid SpaceMate JSON export under 2 MB.',
 '已取消建议预览。':'Suggestion preview canceled.',
 '已返回选择工具。':'Returned to the selection tool.',
 '测量工具：在地面点击两个位置。':'Measure: click two points on the floor.',
 '已恢复当前房型示例，另一房型不受影响，可撤销。':'Restored the sample for this floor plan. The other plan is unchanged. You can undo it.',
 '上次保存':'Last saved',
 '尚未保存':'Not yet saved',
 '未应用，请检查空间限制；Esc 恢复原值。':'Change not applied. Check space constraints or press Esc to restore the value.',
};

export function translate(language:Language,text:string):string{
 if(language==='zh')return text;
 const message=editorMessages[text];
 if(Object.hasOwn(editorMessages,text))return message;
 const dynamic=[
  [/^正在编辑(.+)，其他房间的布局已保留。$/, (name:string)=>`Editing ${toEnglish(name)}. Other rooms are unchanged.`],
  [/^已切换到(.+)；两个房型的布局和撤销记录分别保留。$/, (name:string)=>`Switched to ${toEnglish(name)}. Each floor plan keeps its own layout and undo history.`],
  [/^已更新(.+)材质，可撤销或保存。$/, (name:string)=>`Updated materials in ${toEnglish(name)}. You can undo or save the change.`],
  [/^正在预览：(.+)。点击应用后才会修改布局。$/, (name:string)=>`Preview: ${toEnglish(name)}. Click Apply to change the layout.`],
  [/^已应用：(.+)。可撤销恢复。$/, (name:string)=>`Applied: ${toEnglish(name)}. You can undo it.`],
  [/^(.+)，未应用本次修改。$/, (name:string)=>`${toEnglish(name)}. The change was not applied.`],
  [/^请输入 (.+) 至 (.+)，Esc 可取消。$/, (min:string,max:string)=>`Enter a value from ${min} to ${max}. Press Esc to cancel.`],
 ] as const;
 for(const [pattern,format] of dynamic){
  const match=text.match(pattern);
  if(match)return format(match[1],match[2]);
 }
 return toEnglish(text);
}

export function LanguageProvider({children}:{children:ReactNode}){
 const [language,setLanguage]=useState<Language>(()=>{
  try{return localStorage.getItem(storageKey)==='en'?'en':'zh';}catch{return 'zh';}
 });
 useEffect(()=>{
  document.documentElement.lang=language==='zh'?'zh-CN':'en';
  document.title=language==='zh'?'SpaceMate · 空间布局工作室':'SpaceMate · Room Layout Studio';
  try{localStorage.setItem(storageKey,language);}catch{}
 },[language]);
 const value=useMemo<Messages>(()=>({language,setLanguage,t:text=>translate(language,text),tx:(zh,en)=>language==='zh'?zh:en}),[language]);
 return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(){
 const value=useContext(I18nContext);
 if(!value)throw new Error('LanguageProvider is required');
 return value;
}
