import {ArrowLeftRight, RotateCw, Sparkles, Trash2} from 'lucide-react';

type Props = {
  itemName: string;
  disabled?: boolean;
  checkDisabled?: boolean;
  onCheck: () => void;
  onRotate: () => void;
  onReplace: () => void;
  onDelete: () => void;
};

export default function SelectionActions({itemName, disabled, checkDisabled, onCheck, onRotate, onReplace, onDelete}: Props) {
  return <div className="selection-actions floating" role="group" aria-label={`家具快捷操作：${itemName}`}>
    <span className="selection-actions-name" title={itemName}>{itemName}</span>
    <button type="button" className="selection-check" disabled={checkDisabled} onClick={onCheck}><Sparkles size={15} aria-hidden="true"/>检查这个位置</button>
    <button type="button" title="顺时针旋转 90°" disabled={disabled} onClick={onRotate}><RotateCw size={15} aria-hidden="true"/>旋转 90°</button>
    <button type="button" disabled={disabled} onClick={onReplace}><ArrowLeftRight size={15} aria-hidden="true"/>替换</button>
    <button type="button" className="danger" disabled={disabled} onClick={onDelete}><Trash2 size={15} aria-hidden="true"/>删除</button>
  </div>;
}
