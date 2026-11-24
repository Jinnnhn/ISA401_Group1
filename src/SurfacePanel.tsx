import {FLOOR_MATERIALS,WALL_MATERIALS,type Room} from './model';
import {useI18n} from './i18n';

export default function SurfacePanel({room,onChange}:{room:Room;onChange:(patch:Partial<Room>)=>void}){
 const {t,tx}=useI18n();
 return <section className="surface-panel"><div className="panel-heading"><span className="eyebrow">{tx('材质与氛围','MATERIAL & MOOD')}</span><h2>{t(room.name)} · {tx('地面与墙面','Floors and walls')}</h2></div><p>{tx('只调整当前房间，切换房间或房型会保留选择。','Changes affect this room only and stay when you switch rooms or floor plans.')}</p>
  <h3>{tx('地板材质','Floor material')}</h3><div className="surface-grid">{(Object.keys(FLOOR_MATERIALS) as (keyof typeof FLOOR_MATERIALS)[]).map(k=><button key={k} className={(room.floorMaterial??'parquet')===k?'chosen':''} aria-pressed={(room.floorMaterial??'parquet')===k} onClick={()=>onChange({floorMaterial:k})}><span className={'material-swatch floor-'+k} style={{backgroundColor:FLOOR_MATERIALS[k].color}}/><strong>{t(FLOOR_MATERIALS[k].name)}</strong></button>)}</div>
  <h3>{tx('墙面材质','Wall material')}</h3><div className="surface-grid">{(Object.keys(WALL_MATERIALS) as (keyof typeof WALL_MATERIALS)[]).map(k=><button key={k} className={(room.wallMaterial??'damask')===k?'chosen':''} aria-pressed={(room.wallMaterial??'damask')===k} onClick={()=>onChange({wallMaterial:k})}><span className={'material-swatch wall-'+k} style={{backgroundColor:WALL_MATERIALS[k].color}}/><strong>{t(WALL_MATERIALS[k].name)}</strong></button>)}</div><p>{tx('可撤销 / 重做。点击“保存布局”后，刷新也会恢复材质。','You can undo or redo changes. Save the layout to restore materials after refresh.')}</p>
 </section>;
}
