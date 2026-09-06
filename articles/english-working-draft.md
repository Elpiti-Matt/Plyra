<!-- EDITORIAL WORKING DRAFT, prepared with AI assistance.
Intended as source material for an external essay, not an HN comment to paste.
Publication and source-verification notes are in README.md in this directory.
-->

# A knowledge graph needs more than one view

A knowledge map can become difficult to use while remaining completely correct. Every entity is present. Every connection has a reason. Yet answering a small question requires looking through the entire picture.

I have been exploring a modest alternative: keep one graph, but read it as a collection of bounded sheets. Let entities appear on more than one sheet, and turn connections across a boundary into explicit references.

Plyra is a research prototype for that idea. It is a local HTML application, not an LLM service. The interesting part is the separation between an entity, its appearances, and the rules used to display it.

## An entity is not its position

The example is a fictional coffee roastery. Its research map includes products, suppliers, money, requirements, equipment, people, and roasting. The same blend matters in several of these contexts.

Putting a blend under “Product” is a reasonable filing choice. It becomes a modeling problem only if that choice prevents the supplier or costing view from representing the same entity. Making independent copies introduces a different problem: their descriptions can diverge.

Plyra stores a canonical node and a list of sheet memberships. Position belongs to the appearance:

```json
{
  "id": "blend",
  "name": "Morning blend",
  "sheets": ["product", "suppliers", "money"],
  "pos": {
    "product": {"x": 0, "y": 0},
    "suppliers": {"x": 240, "y": 0},
    "money": {"x": 0, "y": 180}
  }
}
```

This is an excerpt; a full node also has a type and body. Moving an appearance changes one position. Editing the body changes the entity seen from every sheet.

A sheet has a configurable size limit. An edge with exactly one endpoint on the current sheet gets a boundary reference, or stub. The current interface calls it an external reference. It sits beyond a dashed boundary, on a surface that fades outward, and identifies the external node and a sheet containing it. Activating it navigates to that entity. The graph still contains the edge even though this view no longer draws one continuous line between its endpoints.

That exchange has a cost. References require recognition and navigation. A cleaner sheet can still be a worse interface if the reader cannot work out which reference to follow.

## Two useful precedents, with different semantics

[Harel's 1987 statecharts paper](https://doi.org/10.1016/0167-6423(87)90035-9) describes hierarchy and orthogonal components for reactive systems. Hierarchy helps express behavior at a group boundary; orthogonality concerns concurrently active components. Neither automatically gives a knowledge node multiple sheet memberships. I borrow a design direction from this work, not its formal semantics.

[Alexander's “A City is Not a Tree”](https://www.patternlanguage.com/archive/cityisnotatree.html) is closer to the overlap question. His semilattice requires intersections of overlapping sets to belong to the collection. Plyra permits overlapping sheets but does not enforce that closure property. Calling the implementation a semilattice would claim more than it implements.

The practical question I take from both is whether a convenient representation has silently become a restriction on what can be represented at all. A tree with cross-links can be a perfectly useful interface. It need not be a complete ontology.

## A notation can be a view policy

Suppose the current task is to understand the roasting process. Weighing, roasting, cooling, tasting, and packaging belong in that view. Gross contribution and moisture loss have different roles. A specialist process diagram is not defective because it abstracts away some of them.

The mistake would be to erase their relationships from the underlying record simply because this diagram has no convenient place for them.

Plyra retains node and edge types in the graph. Small notation presets then determine which types are emphasized on a sheet. Excluded cards are dimmed, their names are struck through, and a counter reports exclusions. Switching back restores the free view without rebuilding the graph.

These presets are intentionally narrow. They are not BPMN or UML validators, and their exclusion counts are not information-theoretic measures. They answer an operational question: how much of the current sheet does this particular preset leave outside its vocabulary?

The coffee example has 42 nodes and 43 edges across seven sheets. Its roasting sheet contains eight nodes; the process preset excludes three. These are facts about a constructed example, not findings from a usability study.

## A bug that clarified the boundary

The prototype offers a sheet, a configurable spread of two to six sheets, a contents view, a flat graph, and a tilted stack. In the spread, a reference card disappears when its destination is visible in another layer; an actual edge takes its place. Layout adapts to the proportions of the layer. The stack places selected sheets above one another, with node labels and controls for tilt, spacing and connections. Amber-bronze lines without arrows join appearances of one ID. Dashed arrows represent cross-sheet relations; thin solid arrows stay within a layer. On narrow screens, the spread shows one selected sheet. These are design choices to evaluate, not measured usability improvements.

While checking the spread, I found an edge case in the model. Imagine an entity on sheets A and C connected to an entity on B and C. Because the endpoints shared C, a global test classified their edge as internal. The spread could then hide the stubs without drawing the A–B connection.

The edge is internal to C and crosses the boundary of A. Both statements can be true. Boundary classification must be relative to the view, rather than a single permanent property of the edge.

The regression test is small, but it captures more of the design than a screenshot of a tidy graph would. Entity identity is global; visibility and boundary crossing are contextual.

## Where an LLM-maintained wiki fits

[Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) proposes maintaining linked Markdown pages over a collection of source material, with conventions and periodic checks. It already allows answers in different forms, including a canvas. My proposal is a narrower extension: make bounded views persistent build artifacts and compare them across changes.

The wiki is already a derived representation. Extracting a graph and generating sheets adds more transformations; it does not move the source of truth away from the original evidence.

For the coffee example, consider a supplier price increase. It changes a costing assumption. A subsequent decision to substitute another origin may also require a recipe and label review. The price change alone does not change the label. A useful map exposes the conditional path and leaves the decision visible.

An agent could help maintain that path, but Plyra does not currently ingest price lists or update wiki pages. It can read a graph someone supplies and compare saved versions. Connecting those steps to a wiki remains proposed work.

The structural diff lists changed nodes, changed edges, and affected sheets. It cannot tell whether an edit is correct. It can also include harmless coordinate changes. Stable identifiers and visible provenance would matter at least as much as a good cutting algorithm.

## What the implementation actually does

The release candidate imports native JSON or two CSV files, validates them, and rejects malformed input without replacing the current graph. Edits are stored in the browser, with undo and redo during the current session. Native JSON export is the backup and interchange format.

There is a deterministic splitter for oversized sheets. It orders entities by ID and divides existing memberships into bounded parts. That makes results reproducible; it does not make the boundaries meaningful. It is a baseline to inspect and improve, not automatic discovery of a domain model.

Two exports deliberately expose their compromises. The single-parent export drops additional memberships but retains edges. JSON Canvas creates separate cards for appearances and includes canonical Plyra IDs as metadata. Another application need not synchronize those cards. The native graph should remain the canonical editable copy.

The app does not make analytics or graph-upload requests. Its release file includes code, styles, sample data, and license notices. Serving that file through GitHub Pages still involves ordinary hosting logs. A release-download counter belongs in the repository, outside the application, and measures downloads rather than users.

RU/ENG translates the interface and built-in example names. A separate AI-format tab provides a generation contract and a downloadable JSON example; FAQ explains the views. Authored node bodies remain in their original language. Source checks and DOM unit tests pass, but real-browser visual checks and physical-phone tests are still pending. A DOM emulator is useful for state transitions and recovery logic; it cannot establish readable typography, usable gestures, or a working iOS file picker.

## The experiment I still owe

I do not have evidence for a universal 200-node threshold. Node count alone ignores label length, task, edge density, familiarity, and screen size.

I also do not present a crossing reduction as a speed improvement. Replacing cross-boundary lines with references reduces the opportunities for geometric crossings. The reader may pay for that reduction with more navigation.

A useful study would hold graph content constant, specify the layouts, counterbalance presentation order, and measure both time and correctness. It would include local lookup and questions that require moving between contexts. Navigation steps, missed references, and participant experience would belong in the results. Multiple graphs would be more convincing than a single carefully constructed demonstration.

The flat view in this prototype uses a different layout from the individual sheets. A side-by-side screenshot therefore cannot isolate the effect of boundaries. The stack is another representation to evaluate, not an independent measurement instrument.

For now the deliverable is smaller: an inspectable implementation of shared identity across bounded views, with explicit rules for what is omitted and what survives export. The [repository]({{REPO_URL}}) contains the code, [demo]({{DEMO_URL}}), sample graphs, tests, and remaining QA work.

If this is useful, I expect the benefit to show up on a particular question: what else becomes relevant when this entity changes? Making the whole graph visible is one possible way to answer. It should not be the only one.
