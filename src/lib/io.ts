import { CARD_W, PALETTE, type Graph, type Sheet } from "../model/types";

/** RFC-style quoted CSV, including newlines and doubled quotes. UTF-8/BOM supported. */
export function parseCSV(input: string): Record<string, string>[] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else value += c;
    } else if (c === '"' && value === "" && !closed) quoted = true;
    else if (c === "," || c === "\n" || c === "\r") {
      row.push(value); value = ""; closed = false;
      if (c !== ",") {
        if (row.some((v) => v !== "")) rows.push(row);
        row = [];
        if (c === "\r" && text[i + 1] === "\n") i++;
      }
    } else {
      if (closed || c === '"') throw new Error("Некорректные кавычки в CSV");
      value += c;
    }
  }
  if (quoted) throw new Error("Незакрытая кавычка в CSV");
  row.push(value); if (row.some((v) => v !== "")) rows.push(row);
  const header = rows.shift()?.map((h) => h.trim());
  if (!header?.length || header.some((h) => !h) || new Set(header).size !== header.length)
    throw new Error("В CSV нужны непустые уникальные заголовки");
  return rows.map((r, i) => {
    if (r.length !== header.length) throw new Error(`CSV, строка ${i + 2}: число столбцов не совпадает с заголовком`);
    return Object.fromEntries(header.map((h, j) => [h, r[j]]));
  });
}

export function csvGraph(files: { name: string; text: string }[]) {
  if (files.length !== 2) throw new Error("Выберите вместе nodes.csv и edges.csv");
  const n = files.find((f) => f.name.toLowerCase() === "nodes.csv");
  const e = files.find((f) => f.name.toLowerCase() === "edges.csv");
  if (!n || !e) throw new Error("Файлы должны называться nodes.csv и edges.csv");
  const nodes = parseCSV(n.text).map((r) => ({ ...r, sheets: r.sheets?.split("|").filter(Boolean) ?? ["main"] }));
  return { title: "Импорт CSV", nodes, edges: parseCSV(e.text) };
}

/** Canvas has appearances, Plyra has canonical entities. Native JSON remains lossless. */
export function toCanvas(g: Graph) {
  const nodes: Record<string, unknown>[] = [], edges: Record<string, unknown>[] = [];
  const appearances = new Map<string, Map<string, string>>();
  let offsetX = 0, serial = 0;
  for (const sheet of g.sheets) {
    const local = g.nodes.filter((n) => n.sheets.includes(sheet.id));
    const minX = Math.min(0, ...local.map((n) => n.pos[sheet.id].x));
    const minY = Math.min(0, ...local.map((n) => n.pos[sheet.id].y));
    const width = Math.max(400, ...local.map((n) => n.pos[sheet.id].x - minX + CARD_W + 100));
    const height = Math.max(300, ...local.map((n) => n.pos[sheet.id].y - minY + 320));
    nodes.push({ id: `group-${serial++}`, type: "group", label: sheet.name, x: offsetX, y: 0, width, height, color: sheet.color });
    for (const n of local) {
      const id = `node-${serial++}`;
      if (!appearances.has(n.id)) appearances.set(n.id, new Map());
      appearances.get(n.id)!.set(sheet.id, id);
      nodes.push({ id, type: "text", text: `# ${n.name}\n\n${n.body}\n\nPlyra ID: ${n.id}`, x: offsetX + n.pos[sheet.id].x - minX + 40,
        y: n.pos[sheet.id].y - minY + 60, width: CARD_W, height: 220, color: sheet.color, atlasNodeId: n.id, atlasSheetId: sheet.id });
    }
    offsetX += width + 160;
  }
  for (const e of g.edges) {
    const from = appearances.get(e.from), to = appearances.get(e.to);
    if (!from || !to) continue;
    const common = [...from.keys()].filter((s) => to.has(s));
    const pairs = common.length ? common.map((s) => [from.get(s)!, to.get(s)!]) : [[from.values().next().value!, to.values().next().value!]];
    for (const [fromNode, toNode] of pairs) edges.push({ id: `edge-${serial++}`, fromNode, toNode, toEnd: "arrow", label: e.label || e.kind || "flow", atlasEdgeId: e.id });
  }
  return { nodes, edges };
}

/** Stable chunking within existing sheets. Does not infer an ontology. */
export function splitSheets(g: Graph): Graph {
  const sheets: Sheet[] = [], mapping = new Map<string, Map<string, string>>();
  const ids = new Set(g.sheets.map((s) => s.id));
  for (const s of g.sheets) {
    const local = g.nodes.filter((n) => n.sheets.includes(s.id)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const limit = Math.max(3, Math.floor(s.limit ?? 15));
    const map = new Map<string, string>(); mapping.set(s.id, map);
    if (local.length <= limit) { sheets.push(s); local.forEach((n) => map.set(n.id, s.id)); continue; }
    for (let i = 0; i < local.length; i += limit) {
      let id = `${s.id}-part-${1 + i / limit}`;
      while (ids.has(id)) id += "-";
      ids.add(id);
      sheets.push({ ...s, overviewPos:undefined, id, name: `${s.name} · ${1 + i / limit}`, color: s.color || PALETTE[sheets.length % PALETTE.length] });
      local.slice(i, i + limit).forEach((n) => map.set(n.id, id));
    }
  }
  if (sheets.length > 100) throw new Error("После разбиения получилось бы больше 100 листов");
  return { ...g, sheets, edges:g.edges.map(e=>e.routes?{...e,routes:Object.fromEntries(Object.entries(e.routes).flatMap(([sid,route])=>{const from=mapping.get(sid)?.get(e.from),to=mapping.get(sid)?.get(e.to);return from&&from===to?[[from,route]]:[];}))}:e), nodes: g.nodes.map((n) => {
    const memberships = n.sheets.map((s) => mapping.get(s)!.get(n.id)!);
    return { ...n, sheets: memberships, pos: Object.fromEntries(n.sheets.map((s, i) => [memberships[i], n.pos[s]])),...(n.appearance?{appearance:Object.fromEntries(n.sheets.flatMap((sid,i)=>n.appearance?.[sid]?[[memberships[i],n.appearance[sid]]]:[]))}:{}) };
  }) };
}
