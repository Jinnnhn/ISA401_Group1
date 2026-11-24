import {ArrowLeftRight, RotateCw, Trash2} from 'lucide-react';
import {useI18n} from './i18n';

type Props = {
  itemName: string;
  disabled?: boolean;
  onRotate: () => void;
  onReplace: () => void;
  onDelete: () => void;
};

export default function SelectionActions({itemName, disabled, onRotate, onReplace, onDelete}: Props) {
  const {t,tx}=useI18n();
  const name=t(itemName);
  return <div className="selection-actions floating" role="group" aria-label={tx(`家具快捷操作：${name}`,`Furniture shortcuts: ${name}`)}>
    <span className="selection-actions-name" title={name}>{name}</span>
    <button type="button" title={tx('顺时针旋转 90°','Rotate 90° clockwise')} disabled={disabled} onClick={onRotate}><RotateCw size={15} aria-hidden="true"/>{tx('旋转 90°','Rotate 90°')}</button>
    <button type="button" disabled={disabled} onClick={onReplace}><ArrowLeftRight size={15} aria-hidden="true"/>{tx('替换','Replace')}</button>
    <button type="button" className="danger" disabled={disabled} onClick={onDelete}><Trash2 size={15} aria-hidden="true"/>{tx('删除','Delete')}</button>
  </div>;
}
