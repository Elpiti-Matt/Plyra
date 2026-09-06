# Plyra


An offline research prototype for reading knowledge graphs as a collection of bounded sheets. A node can appear on several sheets while retaining one identity and one body of text.

**Status: v0.6.1-rc.1.** The stack, spread and navigation have been redesigned. All 55 data and DOM tests pass. Visual browser testing and tests on physical phones are still pending. The interface and built-in example names have RU/ENG translations. Authored bodies remain in their source language. [Russian guide](README.ru.md) · [Redesign notes](docs/REDESIGN.ru.md) · [QA status](docs/AUDIT.ru.md) · [Manual test protocol](docs/QA-MANUAL.md).

<!-- DOWNLOAD_BADGE -->

## Try it

Download `demo/index.html` and open it in a desktop browser. It contains the app and both demonstration datasets; no installation or server is needed. A mobile operating system may open downloaded HTML as a preview instead of executing it: use the hosted demo after deployment in that case.

Start with the coffee map: **42 nodes, 43 edges, seven sheets**. All business figures and requirements are fictional assumptions, not market data or legal guidance. The larger depot scenario has 87 nodes and deliberately includes overloaded sheets.

The release download badge will be configured when a repository owner is chosen. It counts release-asset downloads, not unique users, visits or offline sessions.

## A one-minute walkthrough

1. Switch to **ENG**, then select **Morning espresso blend**. On a phone, use **Читать лист** (read sheet), then select its name from the list.
2. In the right panel, select **Suppliers** or **Money**. The same ID and body appear in another context.
3. Open **Roasting**, then select **process** in **Notation**. Excluded types are dimmed; node names are struck through. The counter describes the cost of this view.
4. Try **Разворот** (spread), **Стопка** (stack), **Оглавление** (contents) and **Одна плоскость** (flat view).
5. Export the native JSON before moving browsers or clearing browser data. Local storage is convenience storage, not a backup.

## What works

- Five graph views plus separate AI-format and FAQ tabs. Persistent map title and RU/ENG interface.
- Inline name/body editing using + on each node; edits are shared across appearances.
- AI generation contracts and downloadable examples in both languages.
- **Optimize layout** below Sheet, Spread and Flat view. It separates cards and tries to reduce edges through nodes, crossings and shared line segments. Spreads include visible inter-layer connections. One-step undo, cancellation and native JSON persistence. [Algorithm and limits (Russian)](docs/LAYOUT.ru.md).
- Per-sheet positions, shared node identity and typed directed edges.
- Quick sheet tabs, previous/next buttons and Alt+Arrow navigation. Each spread pane also has a sheet picker; choosing an occupied sheet swaps the two panes.
- Spreads of 2–6 sheets with adjustable proportions, including a tall first pane in the 3-sheet layout and a wide middle pane in the 5-sheet layout.
- External references beyond a dashed boundary, with fading surfaces and explicit destinations. References disappear when the destination is already visible in another spread layer; the connecting edge remains. Click/tap or keyboard activation navigates to the same entity.
- One continuous spread scene with explicit Layer: headers. Automatic reflow adapts to pane proportions until a manual move or optimization. Saved positions survive Fit, resizing and reopening.
- Tilted stack with selectable layer checkboxes, node labels, spacing, tilt, zoom and connection switches. Thin solid arrows connect nodes inside a layer, dashed arrows cross layers, and amber-bronze lines without arrows join appearances of one ID. Mobile spreads show one selected pane at a time.
- A node creation form under **＋ Добавить**, with name, type, target sheet and note. Double-click creation on the canvas remains available. Import/export and display filters are under **Ещё**.
- Three small notation presets plus a free view. These are reading filters, not BPMN/UML implementations.
- Native JSON and two-file CSV import; native JSON, single-parent JSON and JSON Canvas export.
- Atomic rejection of malformed imports, undo/redo, local autosave and recovery of unreadable saved data.
- Deterministic splitting of oversized sheets, ordered by node ID. It preserves existing memberships and edges; it does not discover meaningful communities.
- Graph lint and a command-line structural diff.

**Limitations:** the flat view uses a different layout from the sheet view; comparing them is not a controlled experiment. The app has no LLM integration, AST extractor, search-timing experiment, collaboration or automatic ontology selection. Mobile diagram gestures require physical-device QA. Many stacked layers or dense spreads still require zoom and selective reading. The spread draws all connecting routes by default, with an explicit switch to hide them and selection to emphasize a node’s edges. The graph schema currently provides nine node types and five edge types.

## Help and the cross-model design case

Hover or tap **Line legend** for the three navigation meanings. A thin frame marks the active spread layer. **Side references** hides external cards and reflows the view without changing the graph. Shared IDs have a separate amber-bronze connector, not a synthetic edge.

FAQ and AI format include three short, user-played GIF walkthroughs and downloadable PNG keyframes, in Russian and English. These are original instructional UI illustrations, not browser screenshots or evidence of browser QA.

The FAQ also includes **One payment, six models**: a three-step design scenario across BPMN, C4, UML classes/states, requirements and risks. It highlights review targets after a provider contract change. The traceability JSON loads into current Plyra cards. Native notation renderers and semantic validators are a proposed next stage. [Design proposal (Russian)](docs/CROSS-NOTATION.ru.md).

## Formats and safety

[Format reference](docs/FORMAT.md). Import supports at most 10 MiB, 1,000 nodes, 5,000 edges and 100 sheets. A `.canvas` file represents appearances as separate cards and does not preserve live shared editing in other apps; keep the native Plyra JSON as your canonical backup.

The release HTML has a restrictive Content Security Policy. It does not send graph data or run analytics. Images in node bodies must be inline raster data URIs. Text is rendered by React, without raw HTML execution. GitHub Pages delivery still has the hosting provider's ordinary security logs; see [privacy notes](docs/PUBLISHING.ru.md).

## Develop and verify

Node 22.12 or newer, npm. Runtime dependencies are bundled into the HTML; they are not downloaded when the demo opens.

```sh
npm ci
npm test
npm run build
```

`npm test` includes DOM unit tests in jsdom, which has no layout engine. It is not a substitute for browser testing. `npm run build` type-checks, builds, and produces `demo/index.html` with a checksum. To regenerate sample files and descriptive graph counts, run `npm run data`.

```sh
node scripts/plyra.mjs inspect data/roastery.json
node scripts/plyra.mjs cut data/depot.json cut.json
node scripts/plyra.mjs canvas data/roastery.json coffee.canvas
node scripts/plyra.mjs diff data/roastery.json edited.json
```

`cut` respects each sheet's configured limit. These commands are Node tools, not dependency-free Python scripts. No Flask graph or real payments board is included.

## Publishing and contributions

[Publishing plan](docs/PUBLISHING.ru.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [Source and asset notices](NOTICE.md).

Code, sample graphs and project documentation: **MIT**. Working article drafts in `articles/` are excluded from the software license and remain reserved for the author. See [article notes](articles/README.md).

Inspired by [Harel's statecharts](https://doi.org/10.1016/0167-6423(87)90035-9), [Alexander's overlapping urban systems](https://www.patternlanguage.com/archive/cityisnotatree.html), and [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f). These are conceptual connections, not claims of mathematical equivalence or measured usability improvements.
