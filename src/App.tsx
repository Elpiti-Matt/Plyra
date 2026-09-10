import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Graph } from "./model/types";
import { loadGraph } from "./lib/graph";
import { makeRoastery as makeDemo } from "./data/roastery";
import { Tool } from "./tool/Tool";
import { LocaleProvider, storedLocale, translate, useI18n } from "./lib/i18n";
import { TypeProvider } from "./lib/TypeContext";

const KEY = "atlas.graph.v2";
const KEY_V1 = "atlas.graph.v1";

function readStored(): Graph | null {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(KEY_V1);
    if (!raw) return null;
    const r = loadGraph(JSON.parse(raw));
    return r.graph;
  } catch {
    return null;
  }
}

class Boundary extends Component<{ children: ReactNode; graphRef: React.MutableRefObject<Graph | null> }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (!this.state.err) return this.props.children;
    const g = this.props.graphRef.current;
    const t=(s:string)=>translate(s,storedLocale());
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-700">
        <div className="text-lg font-semibold">{t("Что-то сломалось")}</div>
        <div className="max-w-md text-slate-500">{this.state.err.message}</div>
        <div className="flex gap-2">
          {g && (
            <button
              className="rounded border border-slate-300 px-3 py-1"
              onClick={() => {
                const blob = new Blob([JSON.stringify(g, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                const url = URL.createObjectURL(blob);
                a.href = url;
                a.download = "plyra-recovery.json";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              {t("Скачать данные")}
            </button>
          )}
          <button
            className="rounded bg-slate-900 px-3 py-1 text-white"
            onClick={() => {
              try {
                localStorage.removeItem(KEY);
                localStorage.removeItem(KEY_V1);
              } catch {
                /* ignore */
              }
              location.reload();
            }}
          >
            {t("Сбросить и перезагрузить")}
          </button>
        </div>
      </div>
    );
  }
}

export default function App() { return <LocaleProvider><AppContent/></LocaleProvider>; }
function AppContent() {
  const {t}=useI18n();
  const [graph, setGraphState] = useState<Graph>(() => readStored() ?? makeDemo());
  const [status, setStatus] = useState("Локальная карта");
  const past = useRef<Graph[]>([]), future = useRef<Graph[]>([]), lastEdit = useRef(0);
  const [storedWarning, setStoredWarning] = useState(() => {
    try { const raw = localStorage.getItem(KEY) ?? localStorage.getItem(KEY_V1); return raw && !readStored() ? raw : null; } catch { return null; }
  });
  const ref = useRef<Graph | null>(graph);
  ref.current = graph;
  const timer = useRef(0);
  const dirty = useRef(false);

  const persist = useCallback(() => {
    if (!dirty.current || !ref.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(ref.current));
      dirty.current = false;
      setStatus("сохранено");
    } catch {
      setStatus("работа только в памяти");
    }
  }, []);

  const apply = useCallback((next: Graph) => {
    ref.current = next; setGraphState(next); dirty.current = true; setStatus("сохранение…");
    window.clearTimeout(timer.current); timer.current = window.setTimeout(persist, 300);
  }, [persist]);
  const setGraph = useCallback((f: (g: Graph) => Graph) => {
    const current = ref.current!;
    const next = f(current);
    if (next === current) return;
    if (Date.now() - lastEdit.current > 600 || !past.current.length) past.current = [...past.current.slice(-29), current];
    lastEdit.current = Date.now(); future.current = []; apply(next);
  }, [apply]);
  const replaceGraph = useCallback((g: Graph) => { lastEdit.current = 0; setGraph(() => g); lastEdit.current = 0; }, [setGraph]);
  const undo = () => {
    const previous = past.current.pop(); if (!previous) return;
    future.current.push(ref.current!); lastEdit.current = 0; apply(previous);
  };
  const redo = () => {
    const next = future.current.pop(); if (!next) return;
    past.current.push(ref.current!); lastEdit.current = 0; apply(next);
  };
  useEffect(() => {
    const flush = () => persist();
    const onVis = () => document.visibilityState === "hidden" && persist();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [persist]);

  return (
    <Boundary graphRef={ref}>
      {storedWarning && <div role="alert" className="recovery-warning">
        {t("Прежнее сохранение не удалось прочитать. Скачайте его перед редактированием новой карты.")}
        <button onClick={() => { const url = URL.createObjectURL(new Blob([storedWarning], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = "plyra-original-recovery.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>{t("Скачать прежнее сохранение")}</button>
        <button onClick={() => setStoredWarning(null)}>{t("Закрыть")}</button>
      </div>}
      <TypeProvider graph={graph}><Tool graph={graph} setGraph={setGraph} replaceGraph={replaceGraph} demo={makeDemo} saveStatus={status} undo={undo} redo={redo} canUndo={past.current.length > 0} canRedo={future.current.length > 0} /></TypeProvider>
    </Boundary>
  );
}
