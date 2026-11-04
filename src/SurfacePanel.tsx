import {FLOOR_MATERIALS,WALL_MATERIALS,type Room} from './model';

export default function SurfacePanel({room,onChange}:{room:Room;onChange:(patch:Partial<Room>)=>void}){
 return <section className="surface-panel"><div className="panel-heading"><span className="eyebrow">MATERIAL & MOOD</span><h2>{room.name} · 地面与墙面</h2></div><p>只调整当前房间，切换房间或房型会保留选择。</p>
  <h3>地板材质</h3><div className="surface-grid">{(Object.keys(FLOOR_MATERIALS) as (keyof typeof FLOOR_MATERIALS)[]).map(k=><button key={k} className={(room.floorMaterial??'oak')===k?'chosen':''} aria-pressed={(room.floorMaterial??'oak')===k} onClick={()=>onChange({floorMaterial:k})}><span className={'material-swatch floor-'+k} style={{backgroundColor:FLOOR_MATERIALS[k].color}}/><strong>{FLOOR_MATERIALS[k].name}</strong></button>)}</div>
  <h3>墙面材质</h3><div className="surface-grid">{(Object.keys(WALL_MATERIALS) as (keyof typeof WALL_MATERIALS)[]).map(k=><button key={k} className={(room.wallMaterial??'ivory')===k?'chosen':''} aria-pressed={(room.wallMaterial??'ivory')===k} onClick={()=>onChange({wallMaterial:k})}><span className={'material-swatch wall-'+k} style={{backgroundColor:WALL_MATERIALS[k].color}}/><strong>{WALL_MATERIALS[k].name}</strong></button>)}</div><p>可撤销 / 重做。点击“保存布局”后，刷新也会恢复材质。</p>
 </section>;
}
