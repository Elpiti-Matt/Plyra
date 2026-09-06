import type { EdgeKind, GNode, Graph, NodeKind, Sheet } from "../model/types";

export const NOTATIONS = [
  { id: "свободная", nodes: null, edges: null },
  { id: "процесс", nodes: ["process", "decision", "rule", "risk", "person"], edges: ["flow", "depends", "ref"] },
  { id: "данные", nodes: ["entity", "metric", "rule", "note"], edges: ["depends", "ref"] },
  { id: "аргументы", nodes: ["hypothesis", "decision", "risk", "note", "metric"], edges: ["supports", "contradicts", "ref"] },
] as const;

// Deliberately small reading presets, not BPMN/UML validators.
export function notationFor(sheet?: Sheet) {
  const aliases:Record<string,string>={free:"свободная",process:"процесс",data:"данные",arguments:"аргументы"};
  const id=sheet?.notation??"свободная";
  return NOTATIONS.find((n) => n.id === (Object.prototype.hasOwnProperty.call(aliases,id)?aliases[id]:id)) ?? NOTATIONS[0];
}
export function allowsNode(sheet: Sheet | undefined, node: GNode) {
  const allowed = notationFor(sheet).nodes as readonly NodeKind[] | null;
  return !allowed || allowed.includes(node.kind);
}
export function allowsEdge(sheet: Sheet | undefined, kind: EdgeKind = "flow") {
  const allowed = notationFor(sheet).edges as readonly EdgeKind[] | null;
  return !allowed || allowed.includes(kind);
}
export function notationLoss(g: Graph, sheet: Sheet) {
  const local = new Set(g.nodes.filter((n) => n.sheets.includes(sheet.id)).map((n) => n.id));
  const excluded = new Set(g.nodes.filter((n) => !allowsNode(sheet, n)).map((n) => n.id));
  const edges = g.edges.filter((e) => local.has(e.from) || local.has(e.to));
  return { nodes: [...excluded].filter((id) => local.has(id)).length, totalNodes: local.size,
    edges: edges.filter((e) => !allowsEdge(sheet, e.kind) || excluded.has(e.from) || excluded.has(e.to)).length,
    totalEdges: edges.length };
}
