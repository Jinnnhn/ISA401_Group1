import type {Item,Tool} from './model';

export function furnitureDragAction(item:Item|undefined,selected:readonly string[],tool:Tool,shift=false,clickedItemId?:string):'move'|'box'{
 return tool==='select'&&!shift&&item&&!item.locked&&item.id===clickedItemId&&selected.length===1&&selected[0]===item.id?'move':'box';
}
