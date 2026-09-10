# Plyra project format — v3

The native `.plyra` file is UTF-8 JSON. Opening replaces the complete project after validation and preview. Legacy v1/v2 JSON remains readable. Saving writes v3 and all dictionaries.

## Dictionaries

`types` contains `nodes`, `edges`, `sheets`, `tags`, `attributes` arrays. Limits: 200 definitions per dictionary. Definition IDs use letters, digits, `_`, `:`, `.`, `-`, at most 60 characters; prototype/internal IDs are rejected. `label` is required (80 characters), `labelEn` and `description` are optional (80 and 2,000).

| Dictionary | Additional fields |
| --- | --- |
| `nodes` | `base`: one of the nine Plyra kinds; `color`: #RRGGBB; optional `notation` and `shape` |
| `edges` | Text relation definitions; `color` is normalized to #475569 for compatibility |
| `sheets` | `color`: #RRGGBB |
| `tags` | `color`: #RRGGBB |
| `attributes` | `dataType`: text, number, boolean, date, url, select; select requires `options` |

Node notation IDs: `plyra`, `flowchart`, `canvas`, `bpmn`, `drawio`. Basic shapes: rectangle, rounded, ellipse, diamond, parallelogram, cylinder, document, text, group. Standard node type IDs use prefixes such as `flowchart:decision`, `canvas:text`, `bpmn:task`. `base` retains the Plyra fallback category.

Legacy glyphs, relation dash/color/direction settings and sheet allowed-type lists are discarded when dictionaries are read. They no longer control rendering or availability. Missing tags/attribute dictionaries receive compatible defaults. Built-in node, relation and sheet definitions remain available.

## Sheets and entities

A sheet has `id`, `name`, `color`, one `typeId`, and a `tags` array. `notation` records source notation independently of classification. If `typeId` is missing, a recognized old `notation` value is migrated; otherwise the free sheet type is used. No sheet type restricts node or edge types.

Optional sheet `overviewPos: {x, y}` places the whole sheet on the Helicopter view canvas. Coordinates must be finite numbers within ±10,000,000. Sheets without a saved position receive a deterministic grid position; the first header move records all current sheet positions so other sheets do not reflow. This field is independent of every node’s `pos`. Native saving, opening, autosave and undo/redo retain it. Camera pan/zoom is session state.

A node has one `id`, `name`, `kind`, `body`, `sheets`, and `pos` keyed by sheet ID. Text, kind and attributes belong to the entity. Each sheet membership has independent coordinates. Native body supports a small safe Markdown subset; raw HTML is not executed and URLs are not fetched.

Optional `attributes` maps definition IDs to values. Numbers must be finite JSON numbers, booleans are true/false, dates use valid YYYY-MM-DD, URLs use http/https, and select values must match an option. `null` means attached but unset; a missing key means not attached. Text values allow 10,000 characters. Unknown definitions and invalid values reject the whole import.

Optional `appearance` maps sheet IDs to `{width,height,shape,fill,stroke,fontColor}` plus font size, stroke width, rotation, bold, alignment, a basic BPMN marker and `sourceType`. Dimensions are positive and bounded; paints are sanitized. A native save retains these appearances. Decorative icon strings are not used.

## Relations and lines

An edge has `id`, `from`, `to`, `kind`, optional `label`, optional `directed` and `sourceType`. Text type expresses the relationship. Imported arrow direction belongs to the edge; there is no visual-style dictionary UI.

`routes[sheetId]` optionally holds `points` and original endpoint rectangles `from`/`to` (x, y, width, height). Import preserves waypoints. Moving nodes reattaches the route ends; interior points remain. Optimizing a sheet replaces its original routes with automatic routing; undo restores the previous graph.

Every renderer supplies the same grammar: solid within a sheet, dashed between sheets, gold for repeated appearances of one ID. Gold identity links are generated from memberships, not stored as relations. The selected-sheet overview uses direct routes from that sheet to every other shared appearance; the general view uses a chain. Selected-sheet focus only filters cross-sheet routes, keeping all sheets and their local relations visible. Filters dim unselected types without dropping objects or changing their geometry and counts.

## Diagrams

| Input | Mapping and limits |
| --- | --- |
| draw.io | Plain/compressed mxfile pages or mxGraphModel; pages become sheets, basic shapes and nested coordinates, dimensions, colors, text and connector waypoints are retained |
| JSON Canvas 1.0 | One canvas becomes one sheet; text, file, link and group nodes retain coordinates/sizes; groups remain frames; edge sides are retained |
| BPMN 2.0 DI | Each BPMNDiagram becomes a sheet; source element IDs/type names, Bounds and waypoints are retained; shared IDs across diagrams remain shared entities |

These imports append namespaced sheets and entities after preview. Matching names never merge entities. Multiple files are staged atomically; conflicting custom definition IDs are remapped with their values/references. Native `.plyra` opens a complete project instead.

Unsupported complex draw.io shapes become rectangles; images and attachments are not loaded. Plain draw.io connectors without Plyra metadata receive the reference type: their labels are retained, and the preview asks the user to review relation semantics. Canvas preset colors and text appearance may differ, and file/link contents and group backgrounds are not loaded. Canvas bidirectional arrows are reduced to the forward direction with a preview warning. BPMN special markers, pools/lanes, annotations and label placement are simplified; DI is mandatory. Normalized solid intra-sheet lines are not strict BPMN/UML visual semantics: retain source relation types and labels. No direct Miro backup importer exists.

Own draw.io exports carry `plyraTypes`, sheet classification, shared node/edge IDs, body, attributes, appearance and route metadata. Reimport recognizes shared entities inside that file; adding it does not merge it with existing project nodes. draw.io and Canvas are editable projections, not a substitute for native backups; whole-sheet overview positions and the All-to-1 arrangement are not retained by these exports. Canvas export creates one card per appearance and retains `atlasNodeId`, `atlasSheetId`, `atlasEdgeId` metadata; reverse Canvas import treats these as ordinary separate Canvas nodes.

## Layout and compatibility

`layout:"manual"` makes per-sheet positions authoritative in both Sheet and Spread. Imported sheets use it. Optional root `flatPositions` belongs to All-to-1, which shows each entity once without merging or removing its sheet memberships. Dragging or optimizing this projection only changes `flatPositions`; text and attributes remain shared. The line grammar reflects the original sheet memberships. Dragging a node in Helicopter view updates only that sheet appearance and marks its sheet layout as manual; it never transfers memberships. Stack presentation, grouping, positions and type filters last for the current session and do not alter source sheets.

Browser storage keys `atlas.graph.v2`, `atlas.graph.v1`, `atlas.language` remain for compatibility. Undo/redo includes project dictionaries, attributes, imports and native geometry. Tree export omits v3 data and is blocked in the UI for v3 projects.

CSV still accepts nodes.csv plus edges.csv, including quoted commas/newlines and BOM. Legacy generic JSON can infer missing sheets, edge IDs and coordinates. Invalid versions, IDs, dangling ends, memberships, definitions, values or geometry reject the entire project.

Limits: 10 MiB combined input and decompressed data; 100 sheets, 1,000 entities, 5,000 edges; name 200, sheet name 80, edge label 120, body 1,000,000 characters. Existing IDs and content are not rewritten by interface translation.

## Format references

JSON Canvas node types, geometry and edge sides follow [JSON Canvas 1.0](https://jsoncanvas.org/spec/1.0/). BPMN source and diagram geometry use the [OMG BPMN 2.0.2 specification and DI schemas](https://www.omg.org/spec/BPMN/2.0.2). The supported draw.io XML source is described in [draw.io documentation](https://www.drawio.com/docs/manual/advanced/diagram-source-edit/). Consulted on 2026-09-09; import coverage and simplifications above describe this implementation.

## AI generation

The application and downloadable AI prompts use v3 with all five dictionaries and the six attribute data types. `npm run ai:docs` regenerates `docs/AI-PROMPT.*.txt` and `data/ai-example-*.json` from `src/lib/generation.ts`. Tests validate both examples and require exact agreement with the downloadable files. Existing v1/v2 inputs remain readable.
