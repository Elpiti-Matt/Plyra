import { memo, useId } from "react";
import { CARD_W, KIND_BY_ID, type GNode, type NodeKind } from "../model/types";
import { Body, firstLine } from "../lib/Body";
import { cn } from "../utils/cn";
import { useI18n } from "../lib/i18n";

const HYBRID: Record<NodeKind, string> = {
  entity: "bg-white border-2 border-slate-800 rounded-md",
  process: "bg-white border border-slate-400 rounded-[22px]",
  decision: "bg-amber-50 border-4 border-double border-amber-500 rounded-md",
  hypothesis: "bg-white border-2 border-dashed border-slate-500 rounded-full px-5",
  metric: "bg-slate-900 text-slate-100 font-mono border border-slate-700 rounded-md",
  rule: "bg-white border border-slate-500 rounded-none",
  risk: "bg-red-50 border border-red-200 border-l-[6px] border-l-red-600 rounded-md",
  person: "bg-pink-50 border border-pink-300 rounded-full px-5",
  note: "bg-yellow-200 border border-yellow-300 shadow-md -rotate-[1.5deg]",
};

interface Props {
  node: GNode;
  color: string; // цвет листа
  hybrid: boolean;
  showBody: boolean;
  selected: boolean;
  dimmed: boolean;
  linkTarget?: boolean;
  extraSheets?: number; // на скольких ещё листах стоит
  ghost?: boolean; // стаб
  ghostSheet?: string;
  style?: React.CSSProperties;
  measureRef?: (el: HTMLDivElement | null) => void;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDoubleClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onClick?: () => void;
  onActivate?: () => void;
  excluded?: boolean;
  expanded?: boolean;
  onToggle?:()=>void;
  onEdit?:(patch:Partial<GNode>)=>void;
}

export const NodeCard = memo(function NodeCard({
  node,
  color,
  hybrid,
  showBody,
  selected,
  dimmed,
  linkTarget,
  extraSheets = 0,
  ghost,
  ghostSheet,
  style,
  measureRef,
  onPointerDown,
  onDoubleClick,
  onClick,
  onActivate,
  excluded,
  expanded=false,
  onToggle,
  onEdit,
}: Props) {
  const {t,name}=useI18n();
  const editorId=useId();
  const k = KIND_BY_ID[node.kind];
  const snippet = firstLine(node.body);
  return (
    <div
      ref={measureRef}
      data-nid={node.id}
      role="group"
      tabIndex={0}
      aria-label={`${ghost ? t("Перейти: ","Go to: ") : ""}${name(node.name)}${excluded ? t(", вне выбранной нотации",", excluded by notation") : ""}`}
      onKeyDown={(e) => { if (e.target===e.currentTarget&&(e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); onActivate?.(); } }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
      title={name(node.name)}
      className={cn(
        "absolute select-none text-[14px] px-3 py-2 transition-[opacity,box-shadow] duration-150 cursor-grab active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-blue-600",
        hybrid && node.kind === "metric" ? "text-slate-100" : "text-slate-800",
        hybrid ? HYBRID[node.kind] : "bg-white border border-slate-300 rounded-md",
        ghost && "opacity-70 border-dashed cursor-pointer",
        dimmed && "opacity-25",
        excluded && "opacity-50",
        selected && "ring-2 ring-blue-500 ring-offset-2 shadow-lg",
        linkTarget && "ring-2 ring-emerald-500 ring-offset-1 cursor-crosshair",
        expanded && "node-card-expanded",
      )}
      style={{ width: CARD_W, ...style }}
    >
      {!hybrid && <div className="absolute left-0 right-0 top-0 h-1.5 rounded-t-md" style={{ background: color }} />}
      {hybrid && node.kind === "rule" && (
        <span
          aria-hidden
          className="absolute right-0 top-0 h-0 w-0 border-l-[10px] border-b-[10px] border-l-transparent border-b-slate-500"
          style={{ borderTopRightRadius: 0 }}
        />
      )}
      <div className={cn("flex items-start gap-1.5", !hybrid && "mt-1")}>
        <span className={cn("shrink-0 text-[11px] leading-4 opacity-70", node.kind === "metric" ? "text-slate-300" : "text-slate-500")} aria-label={t(k.label)}>
          {k.glyph}
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn("font-semibold leading-5 break-words", excluded && "line-through")}>{name(node.name)}</div>
          {ghost ? (
            <div className="mt-0.5 text-[10px] text-slate-500 truncate">лист: {ghostSheet}</div>
          ) : expanded ? null : showBody ? (
            node.body.trim() && (
              <div className={cn("mt-1 text-[11px]", node.kind === "metric" ? "text-slate-300" : "text-slate-600")}>
                <Body text={node.body} compact />
              </div>
            )
          ) : (
            snippet && (
              <div className={cn("mt-0.5 text-[11px] leading-[14px] line-clamp-2", node.kind === "metric" ? "text-slate-400" : "text-slate-500")}>{snippet}</div>
            )
          )}
        </div>
        <span className="shrink-0 mt-0.5 flex items-center gap-0.5">
          {extraSheets > 0 && (
            <span
              className="rounded-full border border-violet-500 bg-white px-1 text-[9px] leading-[12px] font-semibold text-violet-700"
              title={t(`Стоит ещё на ${extraSheets} лист.`,`Also appears on ${extraSheets} sheets`)}
            >
              +{extraSheets}
            </span>
          )}
          <span className="h-2 w-2 rounded-full ring-1 ring-white" style={{ background: color }} />
          {onToggle&&<button className="node-expand-button" aria-expanded={expanded} aria-controls={editorId} aria-label={expanded?t(`Свернуть тело ${name(node.name)}`,`Collapse body of ${name(node.name)}`):t(`Раскрыть тело ${name(node.name)}`,`Expand body of ${name(node.name)}`)} title={t("Название и тело узла","Node name and body")} onPointerDown={(e)=>e.stopPropagation()} onDoubleClick={(e)=>e.stopPropagation()} onClick={(e)=>{e.stopPropagation();onToggle();}}>{expanded?"−":"+"}</button>}
        </span>
      </div>
      {expanded&&onEdit&&<div id={editorId} className="node-inline-editor" onPointerDown={(e)=>e.stopPropagation()} onDoubleClick={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()} onKeyDown={(e)=>e.stopPropagation()}>
        <label htmlFor={editorId+"-name"}>{t("Название")}</label><input id={editorId+"-name"} data-node-name-editor={node.id} maxLength={200} value={name(node.name)} onChange={(e)=>onEdit({name:e.target.value})}/>
        <label htmlFor={editorId+"-body"}>{t("Тело","Body")}</label><textarea id={editorId+"-body"} data-node-body-editor={node.id} maxLength={1000000} value={node.body} rows={5} placeholder={t("Текст, заметка, таблица Markdown…","Text, notes, a Markdown table…")} onChange={(e)=>onEdit({body:e.target.value})}/>
        <small>{t("Сохраняется сразу · общее для всех слоёв","Saved as you type · shared across all layers")}</small>
      </div>}
    </div>
  );
});
