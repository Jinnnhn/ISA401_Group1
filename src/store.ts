import { defineStore } from 'pinia';
import { clone,initial,type Furniture } from './layout';
export const useLayout=defineStore('layout',{
 state:()=>({items:clone(initial),history:[] as Furniture[][],selected:'sofa',message:'拖动沙发靠近茶几，体验自动让位。'}),
 actions:{
  commit(next:Furniture[]){if(JSON.stringify(next)===JSON.stringify(this.items))return;this.history.push(clone(this.items));this.items=clone(next);},
  undo(){const previous=this.history.pop();if(previous){this.items=previous;this.message='已撤销整次操作，相关家具一并恢复。';}},
  toggle(){const next=clone(this.items);const f=next.find(f=>f.id===this.selected)!;f.locked=!f.locked;this.commit(next);this.message=f.locked?`${f.name}已锁定`:`${f.name}已解锁`;},
  reset(){this.commit(clone(initial));this.message='已恢复起始布局，可撤销。';}
 }
});
