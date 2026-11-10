import {alternateHouse,constrainHouse,initialHouse,validHouse,type House} from './model';

export const PLAN_OPTIONS=[{id:'forest',name:'林间公寓',description:'客厅 + 卧室 + 书房 · 46.6 m²'},{id:'sky',name:'晴空两居',description:'横厅 + 主卧 + 次卧 · 56.0 m²'}] as const;
export type PlanId=typeof PLAN_OPTIONS[number]['id'];
export type Workspace={version:2;activePlanId:PlanId;projects:Record<PlanId,House>};
export function defaultWorkspace():Workspace{return {version:2,activePlanId:'forest',projects:{forest:initialHouse(),sky:alternateHouse()}};}
export function restoreWorkspace(raw:unknown,legacy:unknown):{workspace:Workspace;recovered:boolean;error?:string}{
 const defaults=defaultWorkspace();let workspace=defaults,recovered=false;
 if(raw&&typeof raw==='object'&&'version'in raw&&raw.version===2){
  const candidate=raw as Workspace;
  if(candidate.projects&&PLAN_OPTIONS.every(p=>validHouse(candidate.projects[p.id]))&&PLAN_OPTIONS.some(p=>p.id===candidate.activePlanId)){workspace=candidate;recovered=true;}
  else return {workspace:defaults,recovered:false,error:'房型存档格式不匹配，已载入示例；原存档未改写。'};
 }else if(validHouse(legacy)){workspace.projects.forest=legacy;recovered=true;}
 let adjusted=false,error:string|undefined;
 for(const p of PLAN_OPTIONS){const bounded=constrainHouse(workspace.projects[p.id]);workspace.projects[p.id]=bounded.house;adjusted||=bounded.adjusted;error??=bounded.error;}
 return {workspace,recovered:recovered&&!adjusted,error:error??(adjusted?'检测到存档家具越界，已移回墙内，请重新保存。':undefined)};
}
