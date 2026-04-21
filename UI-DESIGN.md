# UI design notes

A running summary of what we've discussed for the beads / formulas UI. Descriptive, not a spec. Updates as the design evolves.

## Goal

A web UI that makes beads usable by humans the way `bd` makes it usable by agents — read state, edit state, and (most importantly) author and visualize formulas without dropping into raw `.toml`.

## Priority gradient

- **P0** — Formula authoring + visualization. This is the load-bearing feature; everything else can come later.
- **P1+** — Work graph, issue detail, work queue. The broader beads surface; useful, but not what justifies building the UI.

The P0 vs P1 split matters because formula authoring is what flat text loses to the most. Issues are list/form-shaped and `bd list --json` + a textual `bd show` already cover them adequately for most operators. Formulas are graph-shaped, deeply nested, and parameterized — they're where text stops being readable.

## P0: Formula authoring + visualization

### Metaphor

Two-pane synchronized editor in the spirit of Mapbox Studio's style editor or browser devtools' DOM/CSS panes.

| Pane | Mapbox Studio analogue | Devtools analogue | Formula UI |
|------|------------------------|-------------------|------------|
| Visual | Map render | DOM tree + box model | Step DAG + var palette + composition tree |
| Source | Style JSON | CSS source | The `.formula.toml` |
| Sync | Click layer → highlight in JSON; edit JSON → map re-renders | Click element → jump in Sources; edit CSS → page repaints | Click step in DAG → scroll/highlight in TOML; edit TOML → DAG redraws live |

The TOML is the source of truth. The visual representation is a derived view that supports authoring affordances the text can't.

### What the visual pane needs

- **Step DAG** — nodes by step `id`, edges by `needs`. Cycle detection visible immediately.
- **Per-step badges**:
  - Retry policy (`max_attempts`, `on_exhausted`)
  - Metadata keys (`gc.continuation_group`, `gc.session_affinity`, etc.)
  - Idempotency hinges where the formula has them (e.g. `gastownhall-upstream`'s "skip if PR already exists" check)
- **Var palette** — required vs. optional, defaults inline, with a "fill in to cook" form.
- **Composition tree** — `extends` parent + `compose`d formulas as a tree above the steps view, so it's clear what's inherited vs. local.
- **Cook preview** — given var values, render the proto structure that `bd cook` would produce. Round-trip to a fake `mol pour` without committing.

### Sync semantics

- Edit the TOML → the visual updates live (debounced).
- Click a step in the visual → cursor jumps to that step in the TOML, with the step's TOML range highlighted.
- Edit a var/metadata field via the visual affordances → the TOML edit happens at the right location with no surrounding-context churn.
- Invalid TOML still renders the visual where it can, with errors surfaced inline (devtools-style: red squiggle in the source pane, broken-state badge on the affected node).

## P1: the broader beads surface

### Work graph view

DAG renderer over arbitrary `blocks` / `parent-child` / `waits-for` / `conditional-blocks` edges.

- Nodes: issues colored by status (`open`/`in_progress`/`blocked`/`closed`/`deferred`/`tombstone`/...)
- Edges: styled by dep type
- Overlays: ready highlight (computed from the DAG + claim state), phase indicator on the molecule root (proto / mol / wisp)
- Drill-in: click a node → opens the issue detail panel

Important difference from Temporal UI: beads has arbitrary DAGs, not parent-child trees. The graph renderer is the main view, not a side accessory.

### Issue detail panel

Full editor for the issue schema:

- `title`, `description`, `design`, `acceptance_criteria`, `notes`
- `status`, `priority` (0-4), `issue_type`, `assignee`
- `labels`, `external_ref`
- `dependencies` (with their types) and `comments`
- Audit/event timeline (per-issue history)

Larger than Temporal's workflow-attribute surface; closer to GitHub Issues / Linear in scope.

### Work queue view

`bd ready` flattened into cards by priority/assignee. The "what should I do next" view. Filters: status/priority/assignee/type/label/metadata.

Complements (doesn't replace) the work-graph view — graph is "where am I in the pipeline," queue is "what's claimable right now."

## Vocabulary the UI must surface

These show up across views and need consistent visual treatment:

- **Phase metaphor** (chemistry):
  - **Solid / Proto** — frozen template (synced)
  - **Liquid / Mol** — active persistent work (synced)
  - **Vapor / Wisp** — ephemeral, local-only (never synced; often invisible to collaborators)
  - **Digest** — squashed permanent record
- **Dependency types**: `blocks`, `parent-child`, `waits-for`, `conditional-blocks` (blocking) vs. `related`, `discovered-from`, `replies-to` (non-blocking).
- **Status flow**: `open` → `in_progress` → `closed` (and `blocked` / `deferred` / `tombstone` / `pinned` / `hooked`).
- **Issue types**: `bug`, `feature`, `task`, `epic`, `chore`, `message`, `merge-request`, `molecule`, `gate`, `agent`, `role`, `convoy`.

The UI should make wisps visually distinct (badge or watermark) since they don't behave like other beads — invisible to collaborators, hard-deleted on squash.

## Inspirations and what doesn't port

| Tool | What ports | What doesn't |
|------|------------|--------------|
| Mapbox Studio | Two-pane sync model | Map-specific layer semantics |
| Browser devtools | Live source-↔-rendered binding, edit-the-spec affordances | DOM-specific tree model |
| Temporal UI | Per-execution timeline; workflow list with filters | Parent-child workflow tree (beads is general DAG); deterministic replay (not a beads concept) |
| GitHub Issues / Linear | Issue field editor; comment surface | Centralized state model (beads is Dolt-distributed) |

## Out of scope for the design discussion

- Implementation framework choice (React/Svelte/Elm/...).
- The live data API the UI talks to. Tracked separately under `fo-beads-ui-api-spec` in the foundations bead store.
- Auth / multi-writer story. Same bead.
- The phase-1 prototype itself (this repo's purpose). Driven interactively via Claude Design; not agent-actionable.

## Open questions

- Does formula authoring share the bead store, or is it file-system-only? Today formulas live as `.formula.toml` files under `.beads/formulas/` (and other search paths); they're not bd issues. The UI has to hit the filesystem (or a server abstracting it), not just the bead API.
- How does cooking integrate? `bd cook` produces a proto bead; preview should show the proto structure without committing it. Live preview against an ephemeral cook?
- Composition discovery: `extends` and `compose` reference other formulas by name. The UI needs a formula catalog (search paths from `bd formula list`) to resolve and visualize them.
