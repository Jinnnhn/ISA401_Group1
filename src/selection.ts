import type {Item,Tool} from './model';

// Decide from the selection BEFORE pointer-down. A drag over an unselected
// object is a marquee; it must never select-and-move in the same gesture.
export function furnitureDragAction(item:Item|undefined,selected:string[],tool:Tool,shift=false):'move'|'box'{
 return tool==='select'&&!shift&&item&&!item.locked&&selected.includes(item.id)?'move':'box';
}
