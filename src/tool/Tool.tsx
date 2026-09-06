import { useI18n } from "../lib/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KINDS, PALETTE, type GEdge, type GNode, type Graph, type Mode, type NodeKind, type Sheet, type View, type Pos } from "../model/types";
import { buildIndex, flatten, forceLayout, freeSpot, isCross, lint, loadGraph, stubsForSheet, uid, type LintItem, type Stub } from "../lib/graph";
import { SheetCanvas, type Placed } from "./SheetCanvas";
import { AtlasView } from "./AtlasView";
import { StackView, initialStack, type StackState } from "./StackView";
import { LintPanel, NodePanel, SheetPanel, type Actions } from "./Inspector";
import { useSizes } from "./useSizes";
import { cn } from "../utils/cn";
import { csvGraph, splitSheets, toCanvas } from "../lib/io";
import { notationLoss } from "../lib/notation";
import { makeDemo as makeDepot } from "../data/depot";
import { SheetNavigation } from "./SheetNavigation";
import { MultiSpread, type SpreadLayoutHandle } from "./MultiSpread";
import { applyViewLayout, viewLayoutRequest, type LayoutSnapshot } from "../lib/layoutViews";
import { layoutSteps } from "../lib/optimizeLayout";
import { AddNodeDialog } from "./AddNodeDialog";
import { reconcileSpread, replaceSpreadSlot } from "./spreadLayout";
import { HelpView } from "./HelpView";

interface Props {
  graph: Graph;
  setGraph: (f: (g: Graph) => Graph) => void;
  replaceGraph: (g: Graph) => void;
  demo: () => Graph;
  saveStatus: string;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "sheet", label: "Лист", hint: "один лист, редактирование" },
  { id: "spread", label: "Разворот", hint: "от двух до шести листов, выбор композиции" },
  { id: "stack", label: "Стопка", hint: "слои, наклон и связи между сущностями" },
  { id: "atlas", label: "Оглавление", hint: "листы как узлы" },
  { id: "flat", label: "Одна плоскость", hint: "весь граф — «мёртвый канвас»" },
  { id: "generate", label: "Для ИИ", hint: "Как сгенерировать готовый к загрузке документ?" },
  { id: "faq", label: "FAQ / ЧАВО", hint: "Что, где и как" },
];

const DEFAULT_VIEW: View = { x: 40, y: 40, k: 1 };

export function Tool({ graph, setGraph, replaceGraph, demo, saveStatus, undo, redo, canUndo, canRedo }: Props) {
  const {t,name:displayName,locale,setLocale}=useI18n();

  const idx = useMemo(() => buildIndex(graph), [graph]);
  const [mode, setMode] = useState<Mode>("sheet");
  const [sheetA, setSheetA] = useState(graph.sheets[0]?.id ?? "");
  const [spreadSheets, setSpreadSheets] = useState(() => graph.sheets.slice(0,2).map((s) => s.id));
  const [spreadCount, setSpreadCount] = useState(2);
  const [spreadRatio, setSpreadRatio] = useState(50);
  const visibleSpread = useMemo(() => reconcileSpread(spreadSheets,graph.sheets,spreadCount),[spreadSheets,graph.sheets,spreadCount]);
  const [selected, setSelectedRaw] = useState<string | null>(null);
  const [panel, setPanel] = useState<"node" | "sheet" | "lint">("sheet");
  const [hybrid, setHybrid] = useState(true);
  const [showBody, setShowBody] = useState(false);
  const [expanded,setExpanded]=useState<Set<string>>(()=>new Set());
  const [showStubs, setShowStubs] = useState(true);
  const [kindFilter, setKindFilter] = useState<Set<NodeKind>>(() => new Set(KINDS.map((k) => k.id)));
  const [linking, setLinking] = useState(false);
  const [views, setViews] = useState<Record<string, View>>({});
  const [fitTick, setFitTick] = useState(0);
  const [stack, setStackState] = useState<StackState>(() => initialStack(graph));
  const setStack = useCallback((f: (s: StackState) => StackState) => setStackState(f), []);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sizes, observe] = useSizes();
  const [compact, setCompact] = useState(() => window.innerWidth < 1024);
  const drawers = compact || ["spread","stack","generate","faq","atlas"].includes(mode);
  const [addOpen, setAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const spreadLayoutRef=useRef<SpreadLayoutHandle>(null);
  const graphNow=useRef(graph);graphNow.current=graph;
  const optimization=useRef<{cancel:boolean}|null>(null);
  const [optimizing,setOptimizing]=useState<number|null>(null);
  const cancelLayoutRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>()=>{if(optimization.current)optimization.current.cancel=true;},[]);
  useEffect(()=>{if(optimizing!==null)cancelLayoutRef.current?.focus();},[optimizing===null]);
  const leftRef = useRef<HTMLElement>(null), rightRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setCompact(mq.matches);
    mq.addEventListener("change", update); return () => mq.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!drawers || addOpen || (!leftOpen && !rightOpen)) return;
    const el = (rightOpen ? rightRef : leftRef).current;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () => [...(el?.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, [tabindex="0"]') ?? [])].filter((e) => e.getClientRects().length > 0);
    controls()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const list = controls(), first = list[0], last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    el?.addEventListener("keydown", trap);
    return () => { el?.removeEventListener("keydown", trap); previous?.focus(); };
  }, [drawers, leftOpen, rightOpen, addOpen]);
  const fileRef = useRef<HTMLInputElement>(null);

  // защита от исчезнувших листов
  useEffect(() => {
    if (!idx.sheetById.has(sheetA)) setSheetA(graph.sheets[0]?.id ?? "");
    if (mode === "spread" && !visibleSpread.includes(sheetA)) setSheetA(visibleSpread[0] ?? "");
    setStackState((s) => {
      const ids = s.ids.filter((id) => idx.sheetById.has(id));
      return ids.length === s.ids.length ? s : { ...s, ids, focus: Math.min(s.focus, Math.max(0, ids.length - 1)) };
    });
  }, [graph.sheets, idx, sheetA, mode, visibleSpread]);
  useEffect(() => {
    if (selected && !idx.nodeById.has(selected)) setSelectedRaw(null);
  }, [selected, idx]);

  const say = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((current) => current === m ? null : current), 6000);
  };
  const viewOf = (k: string) => views[k] ?? DEFAULT_VIEW;
  const setViewFor = useCallback((k: string) => (v: View) => setViews((vs) => ({ ...vs, [k]: v })), []);
  const viewSetters = useMemo(() => {
    const m: Record<string, (v: View) => void> = {};
    for (const s of graph.sheets) m[s.id] = setViewFor(s.id);
    m.__flat = setViewFor("__flat");
    return m;
  }, [graph.sheets, setViewFor]);
  const fit = () => setFitTick((t) => t + 1);
  const undoAndFit=()=>{undo();fit();};
  const redoAndFit=()=>{redo();fit();};
  const flatKey=JSON.stringify([graph.nodes.map(n=>n.id),graph.edges.map(e=>[e.from,e.to])]);
  const flatLayout=useMemo(()=>{
    if(mode!=="flat")return new Map<string,Pos>();
    const fallback=graph.nodes.every(n=>graph.flatPositions?.[n.id])?new Map<string,Pos>():forceLayout(graph);
    return new Map(graph.nodes.map(n=>[n.id,graph.flatPositions?.[n.id]??fallback.get(n.id)??{x:0,y:0}]));
  },[mode,flatKey,graph.flatPositions]);
  const optimize=async()=>{
    if(optimization.current)return;
    const previous=document.activeElement as HTMLElement|null;
    const canvas=document.querySelector<HTMLElement>("main [data-canvas-id]");
    const w=canvas?.clientWidth||Math.max(300,window.innerWidth-(drawers?0:496)),h=canvas?.clientHeight||500;
    const snapshot:LayoutSnapshot|undefined=mode==="spread"?spreadLayoutRef.current?.snapshot():{
      flat:mode==="flat",external:mode!=="flat"&&showStubs,
      panes:[{sid:mode==="flat"?"__flat":sheetA,width:w,height:h,positions:mode==="flat"?flatLayout:new Map((idx.bySheet.get(sheetA)??[]).map(n=>[n.id,n.pos[sheetA]]))}],
    };
    if(!snapshot)return;
    const token={cancel:false};optimization.current=token;setOptimizing(0);setToast(null);
    const pause=()=>new Promise<void>(resolve=>window.setTimeout(resolve,0));
    try{
      await pause();
      if(token.cancel||graphNow.current!==graph)return;
      const steps=layoutSteps(viewLayoutRequest(graph,sizes,snapshot));let step=steps.next(),lastYield=performance.now();
      while(!step.done){
        if(token.cancel||graphNow.current!==graph)return;
        if(performance.now()-lastYield>12){setOptimizing(step.value);await pause();lastYield=performance.now();}
        step=steps.next();
      }
      if(token.cancel||graphNow.current!==graph)return;
      const result=step.value;
      if(result.changed){
        replaceGraph(applyViewLayout(graph,snapshot,result));fit();
        const a=result.before,b=result.after;
        say(t(`Готово. Проходов через карточки: ${a.nodeHits} → ${b.nodeHits}; пересечений: ${a.crossings} → ${b.crossings}. Отменить — вернуть позиции.`,`Done. Edges through cards: ${a.nodeHits} → ${b.nodeHits}; crossings: ${a.crossings} → ${b.crossings}. Undo restores positions.`)+(b.sampled?t(" Оценка по выборке связей."," Estimated from an edge sample."):""));
      }else say(t("Более удачное расположение не найдено. Позиции сохранены.","No better arrangement found. Positions were kept."));
    }catch(error){
      say(t("Не удалось рассчитать расположение. Карта сохранена.","Could not calculate a layout. Your map was kept."));
    }finally{
      if(optimization.current===token){optimization.current=null;setOptimizing(null);window.setTimeout(()=>previous?.isConnected&&previous.focus(),0);}
    }
  };

  // ---------- мутации ----------
  const updateNode = (id: string, patch: Partial<GNode>) => setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  const moveNode = (id: string, sid: string, x: number, y: number) =>
    setGraph((g) => ({ ...g, sheets:g.sheets.map(s=>s.id===sid?{...s,layout:"manual"}:s),nodes: g.nodes.map((n) => (n.id === id ? { ...n, pos: { ...n.pos, [sid]: { x, y } } } : n)) }));
  const moveSheet=(sid:string,positions:Map<string,Pos>)=>setGraph(g=>({...g,sheets:g.sheets.map(s=>s.id===sid?{...s,layout:"manual"}:s),nodes:g.nodes.map(n=>positions.has(n.id)?{...n,pos:{...n.pos,[sid]:positions.get(n.id)!}}:n)}));
  const addMembership = (id: string, sid: string) => {
    const p = freeSpot(idx, sid, sizes);
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === id && !n.sheets.includes(sid) ? { ...n, sheets: [...n.sheets, sid], pos: { ...n.pos, [sid]: p } } : n)),
    }));
  };
  const removeMembership = (id: string, sid: string) =>
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => {
        if (n.id !== id || n.sheets.length < 2) return n;
        const pos = { ...n.pos };
        delete pos[sid];
        return { ...n, sheets: n.sheets.filter((s) => s !== sid), pos };
      }),
    }));
  const createNode = (sid: string, x?: number, y?: number, details?: Pick<GNode,"name"|"kind"|"body">) => {
    if (!idx.sheetById.has(sid)) return;
    const p = x === undefined || y === undefined ? freeSpot(idx, sid, sizes) : { x, y };
    const n: GNode = { id: uid("n_"), sheets: [sid], pos: { [sid]: p }, name: t("Новый узел"), kind: "entity", body: "", ...details };
    setGraph((g) => ({ ...g, nodes: [...g.nodes, n] }));
    select(n.id);
    if (drawers) setRightOpen(true);
  };
  const deleteNode = (id: string) => {
    setGraph((g) => ({ ...g, nodes: g.nodes.filter((n) => n.id !== id), edges: g.edges.filter((e) => e.from !== id && e.to !== id),...(g.flatPositions?{flatPositions:Object.fromEntries(Object.entries(g.flatPositions).filter(([key])=>key!==id))}:{}) }));
    setSelectedRaw(null);
    setPanel("sheet");
  };
  const addEdge = (from: string, to: string) => {
    if (from === to) return say("Нельзя связать узел с самим собой");
    if (graph.edges.some((e) => e.from === from && e.to === to && e.kind === "ref")) return say("Между этими узлами уже есть связь");
    setGraph((g) => ({ ...g, edges: [...g.edges, { id: uid("e_"), from, to, kind: "ref" }] }));
    say("Связь создана (тип «см.» — измените в панели узла)");
  };
  const updateEdge = (id: string, patch: Partial<GEdge>) => setGraph((g) => ({ ...g, edges: g.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const deleteEdge = (id: string) => setGraph((g) => ({ ...g, edges: g.edges.filter((e) => e.id !== id) }));
  const addSheet = () => {
    const name = prompt(t("Название листа"))?.trim().slice(0,80);
    if (!name) return;
    const s: Sheet = { id: uid("s_"), name, notation: "свободная", limit: 15, color: PALETTE[graph.sheets.length % PALETTE.length] };
    setGraph((g) => ({ ...g, sheets: [...g.sheets, s] }));
    setSheetA(s.id);
    setMode("sheet");
    setLeftOpen(false);
    if (compact) setRightOpen(true);
    setPanel("sheet");
  };
  const updateSheet = (id: string, patch: Partial<Sheet>) => setGraph((g) => ({ ...g, sheets: g.sheets.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const deleteSheet = (id: string) => {
    if ((idx.bySheet.get(id)?.length ?? 0) > 0 || graph.sheets.length < 2) return;
    setGraph((g) => ({ ...g, sheets: g.sheets.filter((s) => s.id !== id) }));
  };

  // ---------- навигация ----------
  const chooseSpreadSheet = (slot: number, sid: string) => {
    setSpreadSheets(replaceSpreadSlot(visibleSpread, slot, sid));
    setSheetA(sid);
    setPanel("sheet");
  };
  const openAdd = (sid = mode === "stack" ? stack.ids[stack.focus] ?? sheetA : sheetA) => { setSheetA(sid); setLeftOpen(false); setRightOpen(false); setLinking(false); setAddOpen(true); };
  const select = (id: string | null) => {
    setSelectedRaw(id);
    if (id) setPanel("node");
  };
  const onSelectFromCanvas = (id: string | null) => {
    if (linking && selected && id && id !== selected) {
      addEdge(selected, id);
      setLinking(false);
      select(id);
      return;
    }
    if (linking && !id) setLinking(false);
    select(id);
    if (compact && id && !linking) { setLeftOpen(false); setRightOpen(true); }
  };
  const goSheet = (id: string) => {
    if (mode === "spread" && !visibleSpread.includes(id)) setSpreadSheets(replaceSpreadSlot(visibleSpread,Math.max(0,visibleSpread.indexOf(sheetA)),id));
    setSheetA(id);
    if (mode !== "sheet" && mode !== "spread") setMode("sheet");
    setPanel("sheet");
    setLeftOpen(false);
    setRightOpen(false);
    fit();
  };
  const goNode = (id: string, sid: string) => {
    const n = idx.nodeById.get(id);
    if (!n) return;
    const target = n.sheets.includes(sid) ? sid : n.sheets[0];
    if (mode === "stack") {
      setStack((s) => {
        const order = graph.sheets.map((x) => x.id);
        const ids = s.ids.includes(target) ? s.ids : order.filter((x) => s.ids.includes(x) || x === target);
        return { ...s, ids, focus: ids.indexOf(target) };
      });
    } else if (mode === "spread") {
      if (!visibleSpread.includes(target)) setSpreadSheets(replaceSpreadSlot(visibleSpread,Math.max(0,visibleSpread.indexOf(sheetA)),target));
      setSheetA(target);
    } else if (mode !== "flat") {
      setMode("sheet");
      if (target !== sheetA) {
        setSheetA(target);
        fit();
      }
    }
    select(id);
    if (compact) setRightOpen(true);
  };
  const changeMode = (m: Mode) => {
    setMode(m);
    setLinking(false);
    setLeftOpen(false);
    setRightOpen(false);
    if (m === "spread" && !visibleSpread.includes(sheetA)) setSpreadSheets(replaceSpreadSlot(visibleSpread,0,sheetA));
    if (m === "stack" && stack.ids.length === 0) setStack((s) => ({ ...s, ids: graph.sheets.slice(0, 4).map((x) => x.id), focus: 0 }));
    if (m === "stack" && sheetA && !stack.ids.includes(sheetA)) {
      setStack((s) => {
        const order = graph.sheets.map((x) => x.id);
        const ids = order.filter((x) => s.ids.includes(x) || x === sheetA);
        return { ...s, ids, focus: ids.indexOf(sheetA) };
      });
    } else if (m === "stack") setStack((s) => ({ ...s, focus: Math.max(0, s.ids.indexOf(sheetA)) }));
    if (m === "sheet" && mode === "stack" && stack.ids[stack.focus]) setSheetA(stack.ids[stack.focus]);
    fit();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLinking(false);
        setLeftOpen(false);
        setRightOpen(false);
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) setSelectedRaw(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------- импорт / экспорт ----------
  const download = (name: string, data: string) => {
    const blob = new Blob([data], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const slug = () => (graph.title || "plyra").toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-|-$/g, "") + "-" + new Date().toISOString().slice(0, 10);
  const exportJson = () => download(`${slug()}.json`, JSON.stringify(graph, null, 2));
  const exportTree = () => {
    const r = flatten(graph);
    if (r.droppedMemberships > 0 && !confirm(t(`Экспорт в дерево уберёт ${r.droppedMemberships} членств у ${r.affectedNodes} узлов. Останется основной лист; связи сохранятся. Продолжить?`,`Tree export will remove ${r.droppedMemberships} memberships from ${r.affectedNodes} nodes. Each retains its primary sheet; edges are preserved. Continue?`))) return;
    download(`${slug()}-tree.json`, JSON.stringify(r.graph, null, 2));
  };
  const importFiles = async (files: File[]) => {
    try {
      if (files.reduce((sum, f) => sum + f.size, 0) > 10 * 1024 * 1024) throw new Error("Максимум 10 МБ на импорт");
      const data = await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
      const raw = data.length === 1 && !data[0].name.toLowerCase().endsWith(".csv") ? JSON.parse(data[0].text) : csvGraph(data);
      const result = loadGraph(raw);
      if (!result.graph || result.errors.length) { setImportErrors(result.errors); setPanel("lint"); setRightOpen(true); return; }
      replaceGraph(result.graph);
      setImportErrors([]); setSelectedRaw(null); setViews({}); setLinking(false);
      setSheetA(result.graph.sheets[0].id); setSpreadSheets(result.graph.sheets.slice(0,spreadCount).map((s)=>s.id));
      setStackState(initialStack(result.graph)); fit();
      if(mode==="generate"||mode==="faq")setMode("sheet");
      say(t(`Загружено: ${result.graph.nodes.length} узлов. Предыдущая карта доступна через «Отменить».`,`Loaded ${result.graph.nodes.length} nodes. Undo restores the previous map.`));
    } catch (error) { setImportErrors([(error as Error).message]); setPanel("lint"); setRightOpen(true); }
  };
  const reset = (source: () => Graph = demo) => {
    if (!confirm(t("Заменить текущую карту демонстрационным набором? Предыдущую можно вернуть кнопкой «Отменить».","Replace this map with the demo? Undo can restore the previous map."))) return;
    const g = source();
    replaceGraph(g);
    setSelectedRaw(null);
    setSheetA(g.sheets[0].id);
    setSpreadSheets(g.sheets.slice(0,spreadCount).map((s)=>s.id));
    setViews({}); setImportErrors([]);
    setStackState(initialStack(g));
    fit();
  };

  // ---------- производные для холстов ----------
  const lintItems = useMemo(() => lint(graph, idx), [graph, idx]);
  const errs = lintItems.filter((i) => i.level === "error").length;
  const warns = lintItems.filter((i) => i.level === "warn").length;
  const crossEdges = useMemo(() => graph.edges.filter((e) => isCross(e, idx)).length, [graph, idx]);
  const colorOf = (n: GNode) => idx.sheetById.get(n.sheets[0])?.color ?? "#64748b";
  const sheetName = (id: string) => displayName(idx.sheetById.get(id)?.name ?? id);

  const placedOn = (sid: string): Placed[] => (idx.bySheet.get(sid) ?? []).map((n) => ({ node: n, x: n.pos[sid].x, y: n.pos[sid].y }));
  const localEdges = (sid: string) =>
    graph.edges.filter((e) => {
      const f = idx.nodeById.get(e.from),
        t = idx.nodeById.get(e.to);
      return f && t && f.sheets.includes(sid) && t.sheets.includes(sid);
    });
  const stubsOn = (sid: string): Stub[] => {
    if (!showStubs) return [];
    return stubsForSheet(graph, idx, sid, sizes);
  };
  const onStubClick = (st: Stub) => {
    if (linking && selected) {
      addEdge(selected, st.node.id);
      setLinking(false);
      select(st.node.id);
    } else goNode(st.node.id, st.node.sheets[0]);
  };

  const header = (sid: string) => {
    const s = idx.sheetById.get(sid);
    if (!s) return null;
    const c = idx.bySheet.get(sid)?.length ?? 0;
    const lim = s.limit ?? 15;
    const loss = notationLoss(graph, s);
    return (
      <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-slate-200 bg-white/90 px-2.5 py-1.5 shadow-sm backdrop-blur">
        <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
        <button className="text-[13px] font-semibold text-slate-800 hover:underline" onClick={() => { setSheetA(sid); setPanel("sheet"); if (compact) setRightOpen(true); }}>
          {displayName(s.name)}
        </button>
        <span className="text-[11px] text-slate-500">{t(s.notation)}</span>
        <span className={cn("rounded px-1.5 text-[11px] tabular-nums", c > lim ? "bg-red-100 text-red-700" : c > lim * 0.8 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600")}>
          {c}/{lim}
        </span>
        {(loss.nodes > 0 || loss.edges > 0) && <span className="text-[12px] text-amber-800">{t("Вне вида: ")}{loss.nodes}{t(" узл. · ")}{loss.edges}{t(" связ.")}</span>}
      </div>
    );
  };

  const actions: Actions = { updateNode, addMembership, removeMembership, deleteNode, updateEdge, deleteEdge, startLink: () => { setLinking(true); setRightOpen(false); }, goNode, goSheet, updateSheet, deleteSheet };
  const selNode = selected ? idx.nodeById.get(selected) : undefined;
  const curSheet = idx.sheetById.get(mode === "stack" ? stack.ids[stack.focus] ?? sheetA : sheetA);

  const canvasProps = (sid: string) => ({
    sizes,
    observe,
    selected,
    onSelect: (id: string | null) => { if (sid !== "__flat") setSheetA(sid); onSelectFromCanvas(id); },
    linking,
    hybrid,
    showBody,
    expanded,
    onToggleBody:(id:string)=>{setExpanded((old)=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next;});setSelectedRaw(id);setPanel("node");},
    onEditNode:updateNode,
    kindFilter,
    colorOf,
    sheetName,
    extraOf: (n: GNode) => n.sheets.length - 1,
    fitTick,
    view: viewOf(sid),
    setView: viewSetters[sid] ?? setViewFor(sid),
    onMove: (id: string, x: number, y: number) => moveNode(id, sid, x, y),
    onCreate: (x: number, y: number) => createNode(sid, x, y),
    onStubClick,
    header: header(sid),
    sheet: idx.sheetById.get(sid),
  });

  const zoomBy = (m: number) => {
    const k = mode === "flat" ? "__flat" : sheetA;
    const v = viewOf(k);
    const el = document.getElementById(`canvas-${k}`);
    const cw = el?.clientWidth ?? 800,
      ch = el?.clientHeight ?? 600;
    const nk = Math.max(0.15, Math.min(2.5, v.k * m));
    setViewFor(k)({ x: cw / 2 - ((cw / 2 - v.x) / v.k) * nk, y: ch / 2 - ((ch / 2 - v.y) / v.k) * nk, k: nk });
  };

  // ---------- рендер ----------
  return (
    <><div inert={addOpen||optimizing!==null} className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white text-slate-800" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="atlas-titlebar"><span className="atlas-wordmark">Plyra<span> / {t("карта знаний","knowledge map")}</span></span><h1 title={displayName(graph.title)}>{displayName(graph.title)}</h1><div className="language-switch" role="group" aria-label="Interface language / Язык интерфейса"><button lang="ru" aria-pressed={locale==="ru"} onClick={()=>setLocale("ru")}>RU</button><button lang="en" aria-pressed={locale==="en"} onClick={()=>setLocale("en")}>ENG</button></div></div>
      {/* верхняя панель */}
      <header className="atlas-toolbar flex shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-200 bg-white px-2 py-1.5 text-[12px] [scrollbar-width:thin]">
        <div className="flex shrink-0 items-center gap-1.5 pr-1">
          <span role="status" className="save-status text-[12px] text-slate-600">{t(saveStatus)}</span>
        </div>
        <button className={cn("shrink-0 rounded border border-slate-300 px-2 py-0.5",!drawers && "hidden")} aria-expanded={leftOpen} onClick={() => { setRightOpen(false); setLeftOpen(true); }}>{t("листы ")}</button>
        <button className={cn("shrink-0 rounded border border-slate-300 px-2 py-0.5",!drawers && "hidden")} aria-expanded={rightOpen} onClick={() => { setLeftOpen(false); setRightOpen(true); }}>
          {t(selNode ? "узел" : "панель")}
        </button>
        <button disabled={!canUndo} onClick={undoAndFit} aria-label={t("Отменить изменение")} title={t("Отменить изменение")} className="rounded border px-2">↶</button>
        <button disabled={!canRedo} onClick={redoAndFit} aria-label={t("Повторить изменение")} title={t("Повторить изменение")} className="rounded border px-2">↷</button>
        {compact && <select aria-label={t("Режим")} value={mode} onChange={(e) => changeMode(e.target.value as Mode)}>{MODES.map((m) => <option key={m.id} value={m.id}>{t(m.label)}</option>)}</select>}
        <div className={cn("shrink-0 rounded-md border border-slate-300 p-0.5", compact ? "hidden" : "flex")} role="group" aria-label={t("Режим")}>
          {MODES.map((m) => (
            <button key={m.id} title={t(m.hint)} aria-pressed={mode === m.id} onClick={() => changeMode(m.id)} className={cn("rounded px-2 py-0.5", mode === m.id ? "bg-slate-900 text-white" : "hover:bg-slate-100")}>
              {t(m.label)}
            </button>
          ))}
        </div>
        <button className="primary-button toolbar-add" onClick={() => openAdd()}>{t("＋ Добавить")}</button>
        <button className="rounded border px-2" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>{t("Ещё")}</button>
        <div className={cn("toolbar-extra items-center gap-2", moreOpen ? "flex" : "hidden")}>
        <Toggle on={hybrid} set={setHybrid} title={t("Гибридная нотация: форма карточки по типу. Единая: все карточки одинаковые, лист — цветом")}>
          {t(hybrid ? "гибрид" : "единая")}
        </Toggle>
        <Toggle on={showBody} set={setShowBody} title={t("Показывать полное тело узлов")}>{t("тела ")}</Toggle>
        <Toggle on={showStubs} set={(value) => { setShowStubs(value); fit(); }} title={t("Карточки за пунктирной границей — ссылки на сущности с других листов")}>{t("связи за листом ")}</Toggle>
        <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-slate-200 px-1 py-0.5" role="group" aria-label={t("Фильтр типов")}>
          {KINDS.map((k) => (
            <button
              key={k.id}
              title={t(k.label)}
              aria-pressed={kindFilter.has(k.id)}
              onClick={() =>
                setKindFilter((f) => {
                  const n = new Set(f);
                  if (n.has(k.id)) n.delete(k.id);
                  else n.add(k.id);
                  return n;
                })
              }
              className={cn("w-5 rounded text-center text-[11px]", kindFilter.has(k.id) ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-100")}
            >
              {k.glyph}
            </button>
          ))}
          <button onClick={() => setKindFilter(new Set(KINDS.map((k) => k.id)))} className="px-1 text-[10px] text-slate-500 hover:text-slate-800">{t("все ")}</button>
        </div>
        <button
          onClick={() => {
            setPanel("lint");
            if (drawers) setRightOpen(true);
          }}
          aria-pressed={panel === "lint"}
          className={cn("shrink-0 rounded border px-2 py-0.5", panel === "lint" ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 hover:bg-slate-100")}
        >
          lint <span className="text-red-500">✖{errs}</span> <span className="text-amber-500">▲{warns}</span>
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <input ref={fileRef} type="file" multiple accept="application/json,.json,.csv,text/csv" className="hidden" onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) void importFiles(files); }} />
          <Btn onClick={() => fileRef.current?.click()}>{t("импорт")}</Btn>
          <Btn onClick={exportJson} title={t("Полный формат v2 с мультичленством")}>{t("экспорт")}</Btn>
          <Btn onClick={exportTree} title={t("Экспорт в дерево (v1): у узла остаётся только основной лист")}>{t("в дерево")}</Btn>
          <Btn onClick={() => { download(`${slug()}.canvas`, JSON.stringify(toCanvas(graph), null, 2)); say("Canvas сохраняет появления как отдельные карточки. Для редактирования без потерь храните также Plyra JSON."); }}>Canvas</Btn>
          <Btn onClick={() => reset()}>{t("кофе")}</Btn>
          <Btn onClick={() => reset(makeDepot)}>{t("депо")}</Btn>
        </div>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* левая панель */}
        {(
          <aside ref={leftRef} aria-label={t("Листы")} inert={drawers && !leftOpen} role={drawers && leftOpen ? "dialog" : undefined} aria-modal={drawers && leftOpen ? true : undefined}
            className={cn(
              "z-30 flex shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white",
              drawers ? "fixed inset-y-0 left-0 w-[84vw] max-w-[320px] transition-transform" : "static w-[196px]",
              drawers && !leftOpen && "-translate-x-full",
            )}
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t("Листы")}</span>
              <div className="flex gap-1">
                <button onClick={addSheet} className="rounded border border-slate-300 px-1.5 text-[12px] hover:bg-slate-100" aria-label={t("Добавить лист")}>
                  +
                </button>
                <button onClick={() => setLeftOpen(false)} className={cn("rounded px-1.5 text-[14px]",!drawers&&"hidden")} aria-label={t("Закрыть")}>
                  ×
                </button>
              </div>
            </div>
            <ul className="px-1.5">
              {graph.sheets.map((s) => {
                const c = idx.bySheet.get(s.id)?.length ?? 0;
                const lim = s.limit ?? 15;
                const active = mode === "spread" ? visibleSpread.includes(s.id) : mode === "stack" ? stack.ids[stack.focus] === s.id : s.id === sheetA;
                return (
                  <li key={s.id} className={cn("mb-0.5 flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px]", active && "bg-slate-100")}>
                    <button
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      onClick={() => {
                        if (mode === "stack") {
                          setStack((st) => {
                            const order = graph.sheets.map((x) => x.id);
                            const ids = st.ids.includes(s.id) ? st.ids : order.filter((x) => st.ids.includes(x) || x === s.id);
                            return { ...st, ids, focus: ids.indexOf(s.id) };
                          });
                          setSheetA(s.id);
                          setPanel("sheet");
                          setLeftOpen(false);
                        } else goSheet(s.id);
                      }}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{displayName(s.name)}</span>
                        <span className="block truncate text-[10px] text-slate-500">{t(s.notation)}</span>
                      </span>
                    </button>
                    <span className={cn("shrink-0 tabular-nums text-[10.5px]", c > lim ? "font-semibold text-red-600" : "text-slate-500")} title={t("узлов / лимит")}>
                      {c}/{lim}
                    </span>
                    {mode === "spread" && active && <span className="pane-slot-badge">{visibleSpread.indexOf(s.id)+1}</span>}
                  </li>
                );
              })}
            </ul>
            <div className="mt-auto border-t border-slate-200 px-3 py-2 text-[10.5px] text-slate-500">
              <div>{graph.nodes.length}{t(" узлов · ")}{graph.edges.length}{t(" связей")}</div>
              <div>{crossEdges}{t(" межлистовых · ")}{graph.nodes.filter((n) => n.sheets.length > 1).length}{t(" на нескольких листах")}</div>
            </div>
          </aside>
        )}
        {drawers && (leftOpen || rightOpen) && (
          <div
            className="fixed inset-0 z-20 bg-black/30"
            onClick={() => {
              setLeftOpen(false);
              setRightOpen(false);
            }}
          />
        )}

        {/* центр */}
        <main className="relative flex min-w-0 flex-1 flex-col" inert={drawers && (leftOpen || rightOpen)}>
          {linking && (
            <div className="absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-full bg-emerald-600 px-3 py-1 text-[11px] text-white shadow">{t("Выберите узел или карточку за листом, с которой связать «")}{displayName(selNode?.name)}{t("» · Esc — отмена ")}</div>
          )}
          {toast && <div role="status" className="toast absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-full bg-slate-900 px-3 py-1 text-[11px] text-white shadow">{t(toast)}</div>}

          {(mode === "sheet" || mode === "spread") && <SheetNavigation graph={graph} active={sheetA} visible={mode === "spread" ? visibleSpread : [sheetA]} spread={mode === "spread"} count={Math.min(spreadCount,graph.sheets.length)} ratio={spreadRatio} onChoose={goSheet} onCount={(n) => { setSpreadCount(n); setSpreadSheets(reconcileSpread(visibleSpread,graph.sheets,n)); fit(); }} onRatio={setSpreadRatio} onAdd={() => openAdd()} />}
          <div className="relative min-h-0 flex-1">
            {(mode==="generate"||mode==="faq")&&<HelpView page={mode} onImport={()=>fileRef.current?.click()}/>}
            {mode === "sheet" && curSheet && (
              <SheetCanvas key={sheetA} id={sheetA} placed={placedOn(sheetA)} edges={localEdges(sheetA)} stubs={stubsOn(sheetA)} {...canvasProps(sheetA)} />
            )}
            {mode === "spread" && (
              <MultiSpread layoutRef={spreadLayoutRef} ids={visibleSpread} active={sheetA} ratio={spreadRatio} compact={compact} selected={selected} graph={graph} idx={idx} sizes={sizes} views={views} fitTick={fitTick} kindFilter={kindFilter} showExternal={showStubs} onShowExternal={(show)=>{setShowStubs(show);fit();}} onMoveSheet={moveSheet}
                onActive={setSheetA} onReplace={chooseSpreadSheet} onAdd={openAdd} onOpen={(sid) => { setSheetA(sid); changeMode("sheet"); }}
                render={(sid,visible,placed,onMove,layoutKey) => <SheetCanvas key={sid} id={sid} placed={placed} edges={localEdges(sid)} stubs={showStubs?stubsForSheet(graph,idx,sid,sizes,new Map(placed.map((q)=>[q.node.id,{x:q.x,y:q.y}])),visible):[]} {...canvasProps(sid)} onMove={onMove} layoutKey={layoutKey} maxFitScale={1.8} header={undefined} />}
              />
            )}
            {mode === "stack" && <StackView graph={graph} idx={idx} stack={stack} setStack={setStack} selected={selected} onSelect={select} onOpenSheet={(sid) => { changeMode("sheet"); setSheetA(sid); }} onInspect={(id) => { select(id); setRightOpen(true); setLeftOpen(false); }} />}
            {mode === "atlas" && (
              <AtlasView
                graph={graph}
                idx={idx}
                onOpenSheet={goSheet}
                onOpenSpread={(a, b) => {
                  setSheetA(a);
                  changeMode("spread");
                  setSpreadCount(2);
                  setSpreadSheets([a,b]);
                }}
              />
            )}
            {mode === "flat" && <Flat graph={graph} layout={flatLayout} canvasProps={canvasProps} view={viewOf("__flat")} setView={viewSetters.__flat} />}
          </div>

          {(mode === "sheet" || mode === "spread" || mode === "flat") && (
            <div className="canvas-toolbar flex shrink-0 items-center gap-1 overflow-x-auto border-t border-slate-200 bg-white px-2 py-1 text-[11px]" style={{ paddingBottom: "max(4px, env(safe-area-inset-bottom))" }}>
              <Btn className="optimize-button" disabled={graph.nodes.length<2} onClick={()=>void optimize()} title={t("Развести карточки и уменьшить пересечения линий. Разворот учитывает открытые слои и связи между ними. Действие можно отменить.","Separate cards and reduce crossing lines. Spreads include open layers and their connections. This action can be undone.")}>{t("Оптимизировать расположение","Optimize layout")}</Btn>
              {mode !== "flat" && (
                <>
                  <Btn onClick={() => openAdd()}>{t("+ узел")}</Btn>
                  <Btn onClick={() => (selNode ? setLinking(!linking) : say("Сначала выберите узел"))} aria-pressed={linking}>
                    {t(linking ? "отменить связь" : "связать")}
                  </Btn>
                </>
              )}
              <Btn onClick={() => zoomBy(1 / 1.2)} aria-label={t("Уменьшить")}>−</Btn>
              <Btn onClick={() => zoomBy(1.2)} aria-label={t("Увеличить")}>+</Btn>
              <Btn onClick={fit}>{t("вписать")}</Btn>
              <Btn className="bottom-history" disabled={!canUndo} onClick={undoAndFit}>{t("Отменить")}</Btn>
              <Btn className="bottom-history" disabled={!canRedo} onClick={redoAndFit}>{t("Вернуть")}</Btn>
              <Btn onClick={() => { setPanel("sheet"); setRightOpen(true); setLeftOpen(false); }}>{t("Читать лист")}</Btn>
              <span className="ml-auto hidden text-slate-400 sm:inline">
                {t(mode === "flat" ? "только чтение" : "двойной клик — новый узел · drag — перенос · колесо — панорама · Ctrl+колесо — зум")}
              </span>
            </div>
          )}
        </main>

        {/* правая панель */}
        <aside ref={rightRef} aria-label={t("Свойства карты")} inert={drawers && !rightOpen} role={drawers && rightOpen ? "dialog" : undefined} aria-modal={drawers && rightOpen ? true : undefined}
          className={cn(
            "z-30 flex shrink-0 flex-col border-l border-slate-200 bg-white",
            drawers ? "fixed inset-y-0 right-0 w-[90vw] max-w-[360px] transition-transform" : "static w-[300px]",
            drawers && !rightOpen && "translate-x-full",
          )}
        >
          <div className="flex shrink-0 items-center gap-1 border-b border-slate-200 px-2 py-1.5 text-[11px]">
            {(["node", "sheet", "lint"] as const).map((p) => (
              <button key={p} aria-pressed={panel === p} onClick={() => setPanel(p)} className={cn("rounded px-2 py-0.5", panel === p ? "bg-slate-800 text-white" : "hover:bg-slate-100")}>
                {t(p === "node" ? "узел" : p === "sheet" ? "лист" : "lint")}
              </button>
            ))}
            <button onClick={() => setRightOpen(false)} className={cn("ml-auto rounded px-1.5 text-[14px]",!drawers&&"hidden")} aria-label={t("Закрыть")}>
              ×
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            {panel === "node" &&
              (selNode ? (
                <NodePanel node={selNode} graph={graph} idx={idx} a={actions} stackIds={stack.ids} mode={mode} />
              ) : (
                <div className="p-4 text-[12px] text-slate-500">{t("Выберите узел на холсте. Новый узел можно добавить через «＋ Добавить» или двойным кликом по пустому месту.")}</div>
              ))}
            {panel === "sheet" && (curSheet ? <SheetPanel sheet={curSheet} graph={graph} idx={idx} a={actions} /> : <div className="p-4 text-[12px] text-slate-500">{t("Нет листов")}</div>)}
            {panel === "lint" && importErrors.length > 0 && <div role="alert" className="m-3 rounded border border-red-300 bg-red-50 p-3 text-sm"><b>{t("Импорт отклонён. Текущая карта сохранена.")}</b><ul>{importErrors.slice(0, 20).map((e, i) => <li key={i}>{t(e)}</li>)}</ul><button onClick={() => setImportErrors([])}>{t("Закрыть сообщение")}</button></div>}
            {panel === "sheet" && <button className="m-3 rounded border px-2 py-1 text-sm" onClick={() => { try { replaceGraph(splitSheets(graph)); fit(); say("Большие листы разбиты по ID. Проверьте смысл границ; изменение можно отменить."); } catch (e) { say((e as Error).message); } }}>{t("Разбить большие листы")}</button>}
            {panel === "lint" && (
              <LintPanel
                items={lintItems}
                graph={graph}
                onGo={(it: LintItem) => {
                  if (it.nodeId) goNode(it.nodeId, it.sheetId ?? idx.nodeById.get(it.nodeId)?.sheets[0] ?? sheetA);
                  else if (it.sheetId) goSheet(it.sheetId);
                }}
              />
            )}
          </div>
        </aside>
      </div>
    </div>{optimizing!==null&&<div className="layout-progress-backdrop"><div role="dialog" aria-modal="true" aria-labelledby="layout-progress-title" className="layout-progress" onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();if(optimization.current)optimization.current.cancel=true;}if(e.key==="Tab"){e.preventDefault();cancelLayoutRef.current?.focus();}}}>
      <b id="layout-progress-title">{t("Расставляем ноды…","Arranging nodes…")}</b><p role="status">{t(`Проверено вариантов: ${optimizing}`,`Arrangements checked: ${optimizing}`)}</p><p>{t("Ищем меньше пересечений и проходов через карточки.","Looking for fewer crossings and edges through cards.")}</p><button ref={cancelLayoutRef} onClick={()=>{if(optimization.current)optimization.current.cancel=true;}}>{t("Прервать расчёт","Cancel calculation")}</button>
    </div></div>}{addOpen && <AddNodeDialog graph={graph} sheetId={sheetA} onClose={() => setAddOpen(false)} onCreate={(name,kind,sid,body) => { goSheet(sid); createNode(sid,undefined,undefined,{name,kind,body}); setAddOpen(false); }} />}</>
  );
}

// ---------- Одна плоскость ----------
type CanvasBase = Omit<React.ComponentProps<typeof SheetCanvas>, "id" | "placed" | "edges" | "stubs">;
function Flat({ graph, layout, canvasProps, view, setView }: { graph: Graph; layout:Map<string,Pos>;canvasProps: (sid: string) => CanvasBase; view: View; setView: (v: View) => void }) {
  const {t}=useI18n();

  const placed: Placed[] = graph.nodes.map((n) => {
    const p = layout.get(n.id) ?? { x: 0, y: 0 };
    return { node: n, x: p.x, y: p.y };
  });
  const props = canvasProps("__flat");
  return (
    <SheetCanvas
      {...props}
      id="__flat"
      placed={placed}
      edges={graph.edges}
      stubs={[]}
      view={view}
      setView={setView}
      readOnly
      onMove={undefined}
      onCreate={undefined}
      header={
        <div className="pointer-events-auto rounded-lg border border-red-200 bg-red-50/95 px-3 py-1.5 text-[12px] text-red-800 shadow-sm">
          <b>{t("Общий вид.")}</b> {graph.nodes.length}{t(" узлов · ")}{graph.edges.length}{t(" связей. ")}{graph.flatPositions?t("Расположение сохранено. ","Saved layout. "):t(graph.nodes.length > 300 ? "Сетка для больших карт." : "Силовая раскладка.")}{t("Масштаб можно менять. ")}</div>
      }
    />
  );
}

function Toggle({ on, set, children, title }: { on: boolean; set: (v: boolean) => void; children: React.ReactNode; title?: string }) {
  return (
    <button title={title} aria-pressed={on} onClick={() => set(!on)} className={cn("shrink-0 rounded border px-2 py-0.5", on ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 hover:bg-slate-100")}>
      {children}
    </button>
  );
}
function Btn(p: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} className={cn("shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] hover:bg-slate-100", p["aria-pressed"] && "border-emerald-600 bg-emerald-50 text-emerald-800", p.className)} />;
}
