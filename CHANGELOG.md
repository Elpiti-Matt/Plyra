# Changelog

## Unreleased — 2026-09-06

- Added the Vite core MIT notice for the modulepreload polyfill included in the standalone HTML.
- Added a dependency license inventory and a Russian publication/licensing audit; documented Apache-2.0 as a proposed option while retaining the current MIT license.
- Updated publication instructions for the current release candidate and clarified download versus page-visit counters.

## 0.6.1-rc.1 — 2026-09-05

- Renamed the product from Atlas to **Plyra** in both interface languages, browser title, help, generation contracts, illustrations, downloads and article drafts.
- Updated the package name and proposed repository name to `plyra`.
- Existing browser storage keys, graph version and Canvas metadata stay compatible. The old CLI command forwards to `scripts/plyra.mjs`.

## 0.6.0-rc.1 — 2026-09-05

- Added **Optimize layout** to Sheet, Spread and Flat view with deterministic adjacency-based seeds, card separation and geometric swap search.
- Scores curved links through cards, crossing pairs and shared line runs, including visible spread routes and shared identities. Dense scenes disclose a stable sample of up to 400 edges.
- Preserves optimized and manually arranged sheet positions across fitting and reopening. Flat view has independent saved positions; native JSON, autosave, undo and redo retain both.
- Added cooperative calculation with cancellation and a mobile button on its own row. Mobile spreads optimize only the visible sheet.
- Added bilingual FAQ guidance, algorithm notes, reproducible geometry metrics and 12 additional automated tests (55 total). Browser and physical-device QA remain pending.

## 0.5.0-rc.1 — 2026-09-05

- Added a thin active-layer frame and a local Side references switch with automatic reflow.
- Unified navigation lines: thin solid within a sheet, dashed across sheets, amber-bronze without arrows for shared identity. Identity paths do not create graph edges.
- Added hover, keyboard and touch line legends, with independent identity visibility.
- Added three original PNG/GIF instructional walkthroughs in RU/ENG, embedded offline and played only on request. They are illustrated UI frames, not browser screenshots.
- Added a three-step cross-model payment scenario, two validated traceability datasets and a design proposal for notation adapters and typed mappings.
- 43 data/DOM checks pass. Browser screenshot capture and physical-device QA remain blocked by unavailable preview infrastructure.

## 0.4.0-rc.1 — 2026-09-05

- Added persistent RU/ENG controls and translated UI and built-in example names; graph content and IDs remain unchanged on language switches.
- Added separate AI-format and FAQ tabs, bilingual generation contracts and validated downloadable examples.
- Added expandable inline name/body editors sharing one canonical node across all appearances.
- Unified the spread scene, added explicit layer headings, removed external duplicates for visible destinations and retained their connecting routes.
- Added view reflow and automatic fit using actual pane proportions, including the wide middle layer.
- Restored tilted stacked layers, layer checkboxes, labels, spacing/tilt/scale controls, connection toggles and pinch/pan handling.
- Added a persistent map title and a prominent gradient title in Contents.
- Browser visual and physical-device QA remain pending because the preview service is unavailable.

## 0.3.0-rc.1 — 2026-09-05

- Replaced the free-camera stack with a focused sheet, neighboring context layers, entity memberships and an explicit identity trail.
- Added quick sheet tabs, paging buttons, Alt+Arrow shortcuts and per-pane sheet pickers.
- Added 2–6 sheet compositions, tall and wide featured panels, adjustable proportions and occupied-slot swapping.
- Replaced ghost-node styling with labeled external references beyond a dashed boundary and fading surface.
- Added a node creation form with target sheet, type and optional note; retained canvas double-click creation.
- Added a one-pane mobile spread and a readable mobile stack; desktop spread/stack sidebars now open as drawers.
- All 28 data and DOM tests pass. Browser visual QA and physical-device testing remain pending.

## 0.2.0-rc.1 — 2026-09-05

- Selected the v2 React/TypeScript source as the maintained implementation.
- Added a fictional coffee map, actual notation filters, CSV and Canvas, deterministic sheet splitting and structural-diff CLI.
- Fixed atomic imports, long-body retention, empty-map recovery, shared-sheet boundary edges, duplicate-neighbor lint and unsafe image sources.
- Added undo/redo, keyboard node activation, mobile reading panels, focus handling and stack scale controls.
- Added tests, build checks, license notices, manual QA and publication documentation.
- Browser visual QA, actual mobile gestures and Obsidian integration are pending. No 200-node threshold or 50× usability improvement is claimed.
