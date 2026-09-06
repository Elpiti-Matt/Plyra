# Plyra JSON v2

The canonical representation stores entities once and appearances separately.

```json
{
  "version": 2,
  "title": "Example",
  "sheets": [
    {"id": "product", "name": "Product", "notation": "free", "limit": 15, "color": "#0284c7"},
    {"id": "money", "name": "Money", "notation": "data", "limit": 15, "color": "#d97706"}
  ],
  "nodes": [
    {"id": "blend", "name": "Morning blend", "kind": "entity", "body": "A fictional example.", "sheets": ["product", "money"], "pos": {"product": {"x": 0, "y": 0}, "money": {"x": 200, "y": 50}}}
  ],
  "edges": []
}
```

`sheets[0]` on a node is its primary appearance. Per-sheet `pos` values are independent. Node kinds: `entity`, `process`, `decision`, `hypothesis`, `metric`, `rule`, `risk`, `person`, `note`. Edge kinds: `flow`, `depends`, `supports`, `contradicts`, `ref`. Every edge needs `from` and `to`; IDs can be generated deterministically at import if omitted. Relations are directed. The UI prevents a duplicate default `ref` in the same direction; parallel typed edges are accepted by the format.

Generic JSON may omit the `sheets` array: sheet IDs are inferred from node memberships or a default `main`. Missing coordinates get a grid position. v1 `sheet`, `x`, `y` are migrated. Unknown versions, types, missing endpoints, invalid memberships and duplicate IDs cause atomic rejection. Reserved internal IDs are rejected.

CSV: select **both** `nodes.csv` and `edges.csv`. Node headers: `id,name,kind,sheets,body`. Use `|` between sheet IDs. Edge headers: `id,from,to,kind,label`. UTF-8, BOM, quoted newlines/commas and doubled quotes are supported. Use the supplied examples as a starting point.

Body rendering supports paragraphs, **bold**, bullet lists, pipe tables and raster `data:image/...;base64,...` images. Raw HTML is never executed. URLs are displayed as text; they are not fetched. This is a small Markdown subset.

Limits: import 10 MiB total, 1,000 nodes, 5,000 edges, 100 sheets; body 1,000,000 characters, node name 200, sheet name 80, edge label 120. Export native JSON for backup. Keep the file and browser data private if your graph contains private material.

## Export boundaries

Tree export drops additional memberships and per-sheet positions, retaining the first appearance and **all edges**. It does not delete three quarters of a node's relationships.

[JSON Canvas 1.0](https://jsoncanvas.org/spec/1.0/) has cards and groups. Plyra emits one card per appearance and adds `atlasNodeId`, `atlasSheetId`, `atlasEdgeId` metadata. Every canonical edge is represented at least once; an edge visible on multiple sheets can be exported multiple times. Canvas preserves a readable view, not Plyra's shared-editing semantics. Reverse Canvas import is not implemented.

Node IDs are stable identity; names are editable. The format does not yet have typed provenance records, custom type schemas, historical source revisions or a semantic diff. Source references can be placed in bodies. A structural diff can tell where data changed, not whether a claim is true.

## Generating with an AI

The app’s **AI format** tab provides the full contract and a downloadable example. The same prompts are available as [English](AI-PROMPT.en.txt) and [Russian](AI-PROMPT.ru.txt) files. Reading presets accept `free`, `process`, `data`, `arguments` and the original Russian aliases. The contract must be supplied together with real source material; the app does not call an AI service.

## Saved layouts (optional, v2)

A sheet can include `"layout":"manual"`. Its node `pos[sheetId]` coordinates then remain authoritative in Spread as well as Sheet. Without this flag, Spread may reflow its appearances to suit the pane. Moving a node in Spread commits all currently displayed positions on that sheet; optimizing a spread saves all visible sheets in one undoable action.

The root may also contain `"flatPositions":{"node-id":{"x":0,"y":0}}`. These optional coordinates belong only to Flat view and do not replace per-sheet positions. Missing nodes use the default layout. Stored entries must name existing nodes and contain finite numbers within ±10,000,000. Unknown sheet layout modes and malformed positions cause atomic rejection. Deleting a node removes its flat position.

Both fields are retained by native JSON import, export and browser autosave. Undo/redo includes them. Tree and JSON Canvas exports remain projections; keep native JSON to retain the independent Flat layout. AI-generated source files can omit these optional fields.

## Product rename

Plyra is the current name of Atlas. The native graph remains version 2. Existing `atlas.graph.v2`, `atlas.graph.v1` and `atlas.language` browser-storage keys are retained, as are `atlasNodeId`, `atlasSheetId` and `atlasEdgeId` in Canvas projections. Existing JSON files and saved maps keep their data and IDs.
