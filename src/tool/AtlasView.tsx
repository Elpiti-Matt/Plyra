import { useMemo } from "react";
import type { Graph } from "../model/types";
import { edgesBetweenSheets, type Index } from "../lib/graph";
import { useI18n } from "../lib/i18n";

interface Props {
  graph: Graph;
  idx: Index;
  onOpenSheet: (id: string) => void;
  onOpenSpread: (a: string, b: string) => void;
}

const W = 900,
  H = 560,
  CW = 176,
  CH = 62;

export function AtlasView({ graph, idx, onOpenSheet, onOpenSpread }: Props) {
  const {t,name}=useI18n();
  const n = graph.sheets.length;
  const centers = useMemo(() => {
    const r = Math.min(W, H) / 2 - 80;
    return graph.sheets.map((s, i) => {
      const a = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2;
      return { id: s.id, x: W / 2 + Math.cos(a) * r * 1.35, y: H / 2 + Math.sin(a) * r };
    });
  }, [graph.sheets, n]);
  const links = useMemo(() => {
    const out: { a: string; b: string; c: number }[] = [];
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const c = edgesBetweenSheets(graph, idx, graph.sheets[i].id, graph.sheets[j].id).length;
        if (c > 0) out.push({ a: graph.sheets[i].id, b: graph.sheets[j].id, c });
      }
    return out;
  }, [graph, idx, n]);
  const shared = (sid: string) => (idx.bySheet.get(sid) ?? []).filter((x) => x.sheets.length > 1).length;
  const cross = graph.edges.filter((e) => {
    const f = idx.nodeById.get(e.from),
      t = idx.nodeById.get(e.to);
    return f && t && !f.sheets.some((s) => t.sheets.includes(s));
  }).length;
  const C = (id: string) => centers.find((c) => c.id === id)!;

  return (
    <div className={"overview-scene h-full w-full overflow-auto"+(n>10?" overview-large":"")}>
      <div className="overview-reader"><h2 className="overview-title">{name(graph.title)}</h2><ul className="reader-list">{graph.sheets.map((s) => <li key={s.id}><button onClick={() => onOpenSheet(s.id)}>{name(s.name)} · {idx.bySheet.get(s.id)?.length ?? 0} {t("узлов","nodes")}</button></li>)}</ul><h3 className="my-3 font-semibold">{t("Переходы между листами")}</h3><ul className="reader-list">{links.map((l) => <li key={JSON.stringify([l.a, l.b])}><button onClick={() => onOpenSpread(l.a, l.b)}>{name(idx.sheetById.get(l.a)?.name)} / {name(idx.sheetById.get(l.b)?.name)} · {l.c}</button></li>)}</ul></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="overview-map mx-auto block h-full min-w-[720px] w-full max-w-[1400px]" aria-label={t("Оглавление карты")}>
        {links.map((l) => {
          const a = C(l.a),
            b = C(l.b);
          const mx = (a.x + b.x) / 2,
            my = (a.y + b.y) / 2;
          return (
            <g key={JSON.stringify([l.a,l.b])} role="button" tabIndex={0} aria-label={`${name(idx.sheetById.get(l.a)?.name)} / ${name(idx.sheetById.get(l.b)?.name)}`} onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onOpenSpread(l.a,l.b);}}} className="cursor-pointer" onClick={() => onOpenSpread(l.a, l.b)}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#94a3b8" strokeWidth={Math.min(10, 1 + l.c * 0.9)} strokeOpacity={0.55} />
              <circle cx={mx} cy={my} r={10} fill="#fff" stroke="#94a3b8" />
              <text x={mx} y={my} fontSize={10} textAnchor="middle" dominantBaseline="middle" fill="#334155" fontWeight={600}>
                {l.c}
              </text>
            </g>
          );
        })}
        {graph.sheets.map((s) => {
          const c = C(s.id);
          const cnt = idx.bySheet.get(s.id)?.length ?? 0;
          const over = cnt > (s.limit ?? 15);
          return (
            <g key={s.id} role="button" tabIndex={0} aria-label={name(s.name)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenSheet(s.id); } }} className="cursor-pointer" onClick={() => onOpenSheet(s.id)}><title>{name(s.name)}</title>
              <rect x={c.x - CW / 2} y={c.y - CH / 2} width={CW} height={CH} rx={8} fill="#fff" stroke={s.color} strokeWidth={2} />
              <rect x={c.x - CW / 2} y={c.y - CH / 2} width={8} height={CH} rx={4} fill={s.color} />
              <text x={c.x - CW / 2 + 16} y={c.y - 10} fontSize={12.5} fontWeight={650} fill="#0f172a">
                {name(s.name).length > 23 ? name(s.name).slice(0, 22) + "…" : name(s.name)}
              </text>
              <text x={c.x - CW / 2 + 16} y={c.y + 6} fontSize={10} fill="#64748b">
                {t(s.notation)}
              </text>
              <text x={c.x - CW / 2 + 16} y={c.y + 21} fontSize={10} fill={over ? "#dc2626" : "#475569"}>
                {cnt}/{s.limit ?? 15} {t("узлов · общих:","nodes · shared:")} {shared(s.id)}
              </text>
            </g>
          );
        })}
        <foreignObject x={W/2-168} y={H/2-79} width={336} height={158}><div className="overview-heart"><span>Plyra</span><h2>{name(graph.title)}</h2><p>{graph.nodes.length} {t("узлов","nodes")} · {graph.edges.length} {t("связей","edges")}<br/>{cross} {t("между листами","between sheets")}</p></div></foreignObject>
      </svg>
    </div>
  );
}
