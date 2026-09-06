import { useI18n } from "../lib/i18n";
import { LINE_STYLE } from "../lib/lineStyles";
import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { CARD_W, EDGE_BY_ID, EDGE_KINDS, STUB_H, type GEdge, type GNode, type NodeKind, type View, type Sheet } from "../model/types";
import { allowsNode, allowsEdge } from "../lib/notation";
import { clamp, edgePath, nodeH, type Sizes, type Stub } from "../lib/graph";
import { NodeCard } from "./NodeCard";

export interface Placed {
  node: GNode;
  x: number;
  y: number;
}

interface Props {
  id: string;
  placed: Placed[];
  edges: GEdge[];
  stubs: Stub[];
  view: View;
  setView: (v: View) => void;
  sizes: Sizes;
  observe: (el: HTMLElement | null, id: string) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onCreate?: (x: number, y: number) => void;
  onStubClick?: (stub: Stub) => void;
  linking: boolean;
  hybrid: boolean;
  showBody: boolean;
  kindFilter: Set<NodeKind>;
  colorOf: (n: GNode) => string;
  sheetName: (id: string) => string;
  extraOf?: (n: GNode) => number;
  fitTick: number;
  header?: ReactNode;
  readOnly?: boolean;
  sheet?: Sheet;
  className?: string;
  layoutKey?: string;
  maxFitScale?: number;
  expanded?:Set<string>;
  onToggleBody?:(id:string)=>void;
  onEditNode?:(id:string,patch:Partial<GNode>)=>void;
}

export function SheetCanvas(p: Props) {
  const {t,name:displayName}=useI18n();

  const ref = useRef<HTMLDivElement>(null);
  const viewRef = useRef(p.view);
  viewRef.current = p.view;
  const setView = p.setView;

  // ---- вписать ----
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const cw = el.clientWidth,
      ch = el.clientHeight;
    if (cw < 40 || ch < 40) return;
    const rects = [
      ...p.placed.map((q) => ({ x: q.x, y: q.y, w: CARD_W, h: nodeH(p.sizes, q.node.id) })),
      ...p.stubs.map((s) => ({ x: s.x, y: s.y, w: CARD_W, h: STUB_H })),
    ];
    if (rects.length === 0) {
      setView({ x: 40, y: 40, k: 1 });
      return;
    }
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const r of rects) {
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.w);
      y1 = Math.max(y1, r.y + r.h);
    }
    const w = x1 - x0 + 80,
      h = y1 - y0 + 80;
    let k = Math.min(cw / w, ch / h, p.maxFitScale ?? 1.1);
    if (!Number.isFinite(k) || k <= 0) k = 1;
    k = Math.max(0.15, k);
    setView({ x: (cw - (x1 - x0) * k) / 2 - x0 * k, y: (ch - (y1 - y0) * k) / 2 - y0 * k, k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.placed, p.stubs, p.sizes, setView]);

  const fitRef = useRef(fit);
  fitRef.current = fit;
  useLayoutEffect(() => {
    fitRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.fitTick, p.id, p.layoutKey]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = { w: el.clientWidth, h: el.clientHeight };
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (Math.abs(w - last.w) > 8 || Math.abs(h - last.h) > 8) {
        last = { w, h };
        fitRef.current();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- панорама / зум / пинч ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ kind: "pan" | "pinch"; sx: number; sy: number; ox: number; oy: number; d0?: number; k0?: number; moved: boolean } | null>(null);

  const onBgDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const v = viewRef.current;
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      gesture.current = { kind: "pinch", sx: (a.x + b.x) / 2, sy: (a.y + b.y) / 2, ox: v.x, oy: v.y, d0: Math.hypot(a.x - b.x, a.y - b.y), k0: v.k, moved: true };
    } else {
      gesture.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: v.x, oy: v.y, moved: false };
    }
  };
  const onBgMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const k = clamp((g.k0 ?? 1) * (d / (g.d0 || 1)), 0.15, 2.5);
      const rect = ref.current!.getBoundingClientRect();
      const cx = (a.x + b.x) / 2 - rect.left,
        cy = (a.y + b.y) / 2 - rect.top;
      const wx = (g.sx - rect.left - g.ox) / (g.k0 ?? 1),
        wy = (g.sy - rect.top - g.oy) / (g.k0 ?? 1);
      setView({ x: cx - wx * k, y: cy - wy * k, k });
      return;
    }
    const dx = e.clientX - g.sx,
      dy = e.clientY - g.sy;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    g.moved = true;
    setView({ ...viewRef.current, x: g.ox + dx, y: g.oy + dy });
  };
  const onBgUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g && !g.moved && e.type !== "pointercancel" && e.target === e.currentTarget) p.onSelect(null);
    const remaining = [...pointers.current.values()][0];
    gesture.current = remaining ? { kind: "pan", sx: remaining.x, sy: remaining.y, ox: viewRef.current.x, oy: viewRef.current.y, moved: true } : null;
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left,
          my = e.clientY - rect.top;
        const k = clamp(v.k * Math.exp(-e.deltaY * 0.0022), 0.15, 2.5);
        setView({ x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k, k });
      } else {
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setView]);

  // ---- перетаскивание узла ----
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const onCardDown = (q: Placed) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.stopPropagation();
    if (p.linking) {
      p.onSelect(q.node.id);
      return;
    }
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    drag.current = { id: q.node.id, sx: e.clientX, sy: e.clientY, ox: q.x, oy: q.y, moved: false };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = ev.clientX - d.sx,
        dy = ev.clientY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      if (p.readOnly || !p.onMove) return;
      const k = viewRef.current.k;
      p.onMove(d.id, Math.round(d.ox + dx / k), Math.round(d.oy + dy / k));
    };
    const up = (ev: PointerEvent) => {
      const d = drag.current;
      if (ev.type !== "pointercancel" && d && !d.moved) p.onSelect(p.selected === d.id ? null : d.id);
      drag.current = null;
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const onDbl = (e: React.MouseEvent) => {
    if (!p.onCreate || p.readOnly || e.target !== e.currentTarget) return;
    const rect = ref.current!.getBoundingClientRect();
    const v = viewRef.current;
    p.onCreate(Math.round((e.clientX - rect.left - v.x) / v.k - CARD_W / 2), Math.round((e.clientY - rect.top - v.y) / v.k - 20));
  };

  // ---- геометрия для рёбер ----
  const rectOf = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const q of p.placed) rectOf.set(q.node.id, { x: q.x, y: q.y, w: CARD_W, h: nodeH(p.sizes, q.node.id) });
  const stubRect = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const s of p.stubs) stubRect.set(s.key, { x: s.x, y: s.y, w: CARD_W, h: STUB_H });

  const isDim = (n: GNode) => !p.kindFilter.has(n.kind) || !allowsNode(p.sheet, n);
  const sel = p.selected;
  const { view } = p;
  const localLeft = p.placed.length ? Math.min(...p.placed.map((q) => q.x)) : 0;
  const localRight = p.placed.length ? Math.max(...p.placed.map((q) => q.x + CARD_W)) : CARD_W;
  const allY = [...p.placed.map((q) => q.y), ...p.stubs.map((s) => s.y)];
  const borderTop = Math.min(0,...allY)-68;
  const borderBottom = Math.max(0,...p.placed.map((q) => q.y+nodeH(p.sizes,q.node.id)),...p.stubs.map((s) => s.y+STUB_H))+40;
  const sides = (["left","right"] as const).filter((side) => p.stubs.some((s) => s.side===side));

  const edgeEl = (e: GEdge, a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, ghost = false) => {
    const ek = EDGE_BY_ID[e.kind ?? "flow"];
    const { d, mid } = edgePath(a, b);
    const hi = sel && (e.from === sel || e.to === sel);
    const fromN = p.placed.find((q) => q.node.id === e.from)?.node;
    const toN = p.placed.find((q) => q.node.id === e.to)?.node;
    const dim = !allowsEdge(p.sheet, e.kind) || (fromN && isDim(fromN)) || (toN && isDim(toN));
    const op = dim ? 0.12 : hi ? 1 : sel ? 0.22 : ghost ? 0.55 : 0.85;
    return (
      <g key={e.id} opacity={op} data-line-kind={ghost?"external":"local"}>
        <path d={d} fill="none" stroke={ghost?LINE_STYLE.external.color:ek.color} strokeWidth={hi ? 1.7 : ghost?LINE_STYLE.external.width:LINE_STYLE.local.width} strokeDasharray={ghost?LINE_STYLE.external.dash:undefined} markerEnd={`url(#arr-${p.id}-${ek.id})`} vectorEffect="non-scaling-stroke" />
        {e.label && (
          <text x={mid.x} y={mid.y} fontSize={10} textAnchor="middle" dominantBaseline="middle" fill="#334155" paintOrder="stroke" stroke="#f8fafc" strokeWidth={3} style={{ fontWeight: 500 }}>
            {t(e.label)}
          </text>
        )}
      </g>
    );
  };

  return (
    <div
      ref={ref}
      id={`canvas-${p.id}`}
      data-canvas-id={p.id}
      className={"relative h-full w-full overflow-hidden bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:22px_22px] bg-slate-50 outline-none " + (p.className ?? "")}
      style={{ touchAction: "none" }}
      onPointerDown={onBgDown}
      onPointerMove={onBgMove}
      onPointerUp={onBgUp}
      onPointerCancel={onBgUp}
      onDoubleClick={onDbl}
      tabIndex={-1}
    >
      <svg className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden>
        <defs>
          {sides.map((side) => <linearGradient key={side} id={`outside-${p.id}-${side}`} x1={side==="right"?"0":"1"} y1="0" x2={side==="right"?"1":"0"} y2="0"><stop stopColor="#e5eaf4" stopOpacity=".9"/><stop offset="1" stopColor="#f8fafc" stopOpacity="0"/></linearGradient>)}
          {EDGE_KINDS.map((k) => (
            <marker key={k.id} id={`arr-${p.id}-${k.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill={k.color} />
            </marker>
          ))}
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {sides.map((side) => {
            const boundary = side === "right" ? localRight+46 : localLeft-46;
            return <g key={side}>
              <rect x={side==="right"?boundary:boundary-320} y={borderTop} width="320" height={borderBottom-borderTop} fill={`url(#outside-${p.id}-${side})`}/>
              <line x1={boundary} x2={boundary} y1={borderTop} y2={borderBottom} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="7 7"/>
              <text x={side==="right"?boundary+16:boundary-16} y={borderTop+23} textAnchor={side==="right"?"start":"end"} fill="#64748b" fontSize="11" fontWeight="600" letterSpacing="1.3">{t("НА ДРУГОМ ЛИСТЕ")}</text>
            </g>;
          })}
          {p.edges.map((e) => {
            const a = rectOf.get(e.from),
              b = rectOf.get(e.to);
            return a && b ? edgeEl(e, a, b) : null;
          })}
          {p.stubs.map((s) =>
            s.edges.map((e) => {
              const local = rectOf.get(s.side === "right" ? e.from : e.to);
              const sr = stubRect.get(s.key)!;
              if (!local) return null;
              return s.side === "right" ? edgeEl({ ...e, id: e.id + s.key }, local, sr, true) : edgeEl({ ...e, id: e.id + s.key }, sr, local, true);
            }),
          )}
        </g>
      </svg>
      <div className="absolute left-0 top-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: "0 0" }}>
        {p.stubs.map((s) => <button key={s.key} data-external-node={s.node.id} className={`external-reference external-${s.side}${sel===s.node.id?" is-selected":""}`} aria-label={t(`${p.linking?"Связать с":"Перейти к"} ${displayName(s.node.name)}, на листе ${p.sheetName(s.node.sheets[0])}`,`${p.linking?"Connect to":"Go to"} ${displayName(s.node.name)} on ${p.sheetName(s.node.sheets[0])}`)} title={`${displayName(s.node.name)} · ${p.sheetName(s.node.sheets[0])}`} style={{left:s.x,top:s.y,width:CARD_W,height:STUB_H,opacity:isDim(s.node)?.35:undefined}} onPointerDown={(e)=>e.stopPropagation()} onClick={(e)=>{e.stopPropagation();p.onStubClick?.(s);}}>
          <span className="external-destination"><i style={{background:p.colorOf(s.node)}}/>{p.sheetName(s.node.sheets[0])}<b>↗</b></span>
          <span className="external-name">{displayName(s.node.name)}</span>
          <span className="external-action">{s.edges.length}{t(" связ. · ")}{t(p.linking?"связать":"перейти на лист")}</span>
        </button>)}
        {p.placed.map((q) => (
          <NodeCard
            key={q.node.id}
            node={q.node}
            color={p.colorOf(q.node)}
            hybrid={p.hybrid}
            showBody={p.showBody}
            selected={sel === q.node.id}
            dimmed={isDim(q.node)}
            excluded={!allowsNode(p.sheet, q.node)}
            onActivate={() => p.onSelect(q.node.id)}
            linkTarget={p.linking && sel !== q.node.id}
            extraSheets={p.extraOf ? p.extraOf(q.node) : 0}
            style={{ left: q.x, top: q.y }}
            measureRef={(el) => p.observe(el, JSON.stringify([p.id,q.node.id]))}
            onPointerDown={onCardDown(q)}
            expanded={!p.readOnly&&p.expanded?.has(q.node.id)}
            onToggle={!p.readOnly&&p.onToggleBody?()=>p.onToggleBody!(q.node.id):undefined}
            onEdit={!p.readOnly&&p.onEditNode?(patch)=>p.onEditNode!(q.node.id,patch):undefined}
          />
        ))}
      </div>
      {p.header && <div className="pointer-events-none absolute left-3 top-3 z-10">{p.header}</div>}
      {!!p.stubs.length && <div className="sheet-boundary-legend" aria-hidden="true"><i/>{t("За пунктиром — ссылки на другие листы")}</div>}
    </div>
  );
}
