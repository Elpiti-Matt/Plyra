import { useId, useState } from "react";
import { useI18n } from "../lib/i18n";

export function ConnectionLegend() {
  const {t}=useI18n(),id=useId();
  const [open,setOpen]=useState(false);
  const items=[
    ["local",t("Внутри слоя","Within a layer"),t("Тонкая сплошная стрелка — связь двух разных сущностей на одном холсте.","A thin solid arrow connects two distinct entities on one canvas.")],
    ["external",t("На другой слой","Across layers"),t("Пунктирная стрелка — связь с сущностью другого листа. Если лист закрыт, стрелка ведёт к затухающей карточке-переходу.","A dashed arrow connects to an entity on another sheet. If that sheet is closed, it ends at a faded navigation card.")],
    ["identity",t("Одна сущность · один ID","Same entity · same ID"),t("Бронзово-золотая линия без стрелки объединяет появления одной сущности. Это не новое ребро. Название и тело общие.","An amber-bronze line without an arrow joins appearances of one entity. This is not a new edge. Name and body are shared.")],
  ];
  return <div className="connection-legend" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)} onKeyDown={(e)=>{if(e.key==="Escape"){setOpen(false);e.stopPropagation();}}} onBlur={(e)=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}>
    <button className="legend-trigger" aria-expanded={open} aria-controls={id} onFocus={(e)=>{if(e.currentTarget.matches(":focus-visible"))setOpen(true);}} onClick={()=>setOpen(true)}>{t("Легенда линий","Line legend")} <span aria-hidden="true">ⓘ</span></button>
    {open&&<div id={id} className="legend-panel" role="region" aria-label={t("Обозначения линий","Line meanings")}><button className="legend-close" aria-label={t("Закрыть легенду","Close legend")} onClick={()=>setOpen(false)}>×</button>{items.map(([kind,title,description])=><div className="legend-row" key={kind}><i className={`line-sample line-${kind}`} aria-hidden="true"/><div><b>{title}</b><p>{description}</p></div></div>)}<small>{t("Тип отношения («зависит от», «подтверждает»…) остаётся в свойствах связи.","The relationship type (depends on, supports…) remains in connection properties.")}</small></div>}
  </div>;
}
