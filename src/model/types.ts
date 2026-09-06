export type NodeKind =
  | "entity"
  | "process"
  | "decision"
  | "hypothesis"
  | "metric"
  | "rule"
  | "risk"
  | "person"
  | "note";

export type EdgeKind = "flow" | "depends" | "supports" | "contradicts" | "ref";

export interface Sheet {
  id: string;
  name: string;
  notation: string;
  color: string;
  limit?: number;
  description?: string;
  /** Keep the authored/optimized positions in spreads; otherwise reflow to fit. */
  layout?: "manual";
}

export interface Pos {
  x: number;
  y: number;
}

/** Узел второй версии: стоит на одном или нескольких листах, координаты свои на каждом. */
export interface GNode {
  id: string;
  sheets: string[]; // [0] — основной лист
  pos: Record<string, Pos>;
  name: string;
  kind: NodeKind;
  body: string;
  tags?: string[];
}

export interface GEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  kind?: EdgeKind;
}

export interface Graph {
  version: 2;
  title: string;
  description?: string;
  sheets: Sheet[];
  nodes: GNode[];
  edges: GEdge[];
  /** Independent positions for the all-nodes canvas; native JSON round-trips. */
  flatPositions?: Record<string, Pos>;
}

export interface View {
  x: number;
  y: number;
  k: number;
}

export type Mode = "sheet" | "spread" | "stack" | "atlas" | "flat" | "generate" | "faq";

export const KINDS: { id: NodeKind; label: string; glyph: string }[] = [
  { id: "entity", label: "Сущность", glyph: "▭" },
  { id: "process", label: "Процесс", glyph: "⟶" },
  { id: "decision", label: "Решение", glyph: "◇" },
  { id: "hypothesis", label: "Гипотеза", glyph: "?" },
  { id: "metric", label: "Метрика", glyph: "#" },
  { id: "rule", label: "Требование", glyph: "§" },
  { id: "risk", label: "Риск", glyph: "!" },
  { id: "person", label: "Человек / роль", glyph: "☺" },
  { id: "note", label: "Заметка", glyph: "✎" },
];

export const KIND_BY_ID = Object.fromEntries(KINDS.map((k) => [k.id, k])) as Record<
  NodeKind,
  (typeof KINDS)[number]
>;

export const EDGE_KINDS: {
  id: EdgeKind;
  label: string;
  color: string;
  dash?: string;
}[] = [
  { id: "flow", label: "затем", color: "#475569" },
  { id: "depends", label: "зависит от", color: "#475569", dash: "6 4" },
  { id: "supports", label: "подтверждает", color: "#059669" },
  { id: "contradicts", label: "противоречит", color: "#dc2626", dash: "2 4" },
  { id: "ref", label: "см.", color: "#94a3b8", dash: "1 5" },
];

export const EDGE_BY_ID = Object.fromEntries(EDGE_KINDS.map((k) => [k.id, k])) as Record<
  EdgeKind,
  (typeof EDGE_KINDS)[number]
>;

export const CARD_W = 208;
export const CARD_H_DEFAULT = 64;
export const STUB_H = 88;

export const PALETTE = [
  "#0ea5e9",
  "#84cc16",
  "#f97316",
  "#a855f7",
  "#14b8a6",
  "#f43f5e",
  "#eab308",
];
