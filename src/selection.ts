import type {Item,Tool} from './model';

// The selection tool moves furniture directly; marquee starts on empty space.
export function furnitureDragAction(item:Item|undefined,selected:string[],tool:Tool,shift=false):'move'|'box'{
 return tool==='select'&&!shift&&item&&!item.locked?'move':'box';
}
