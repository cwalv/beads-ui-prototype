# UI design notes

A running summary of what we've discussed for the beads / formulas UI. Descriptive, not a spec. Updates as the design evolves.

## Goal

A web UI that makes beads usable by humans the way `bd` makes it usable by agents — read state, edit state, and (most importantly) author and visualize formulas without dropping into raw `.toml`.

## Architecture: three destinations

Adopted from Claude Design's `prototype-v1/HANDOFF.md`. The UI has three destinations on two axes — **tempo** (slow/fast) and **backend** (filesystem/Dolt):

| Destination | Question | Tempo | Backend |
|-------------|----------|-------|---------|
| **Author**  | What *should* happen? (formulas) | slow, edit-heavy | filesystem `.beads/formulas/` |
| **Observe** | What *is* happening? (molecules, beads) | real-time, read-heavy | Dolt |
| **Capture** | Here's a new bead. | fast, single write | Dolt |

Issue detail, catalog, cook preview, timeline — all modes/layouts/peeks within these destinations, not separate top-level things.

### Shipping order (not the architecture)

- **P0** — Author. Formula authoring is what justifies the UI; ship this first.
- **P1** — Observe. Fleet / Graph / Queue / Timeline layouts + the shared peek drawer.
- **P2** — Capture. Single-bead form. Cheap to add once Observe exists.

## Author

Formulas are filesystem artifacts under `.beads/formulas/` (and other search paths per `bd formula list`). The destination has two modes: **Browse** (catalog) and **Edit** (the two-pane editor).

### Browse

Card grid of available formulas: name, description, var count, step count. Search + filter by type. Click a card → opens Edit.

### Edit — two-pane synchronized editor

In the spirit of Mapbox Studio's style editor or browser devtools' DOM/CSS panes.

| Pane | Mapbox Studio analogue | Devtools analogue | Formula UI |
|------|------------------------|-------------------|------------|
| Visual | Map render | DOM tree + box model | Step DAG + var palette + composition tree |
| Source | Style JSON | CSS source | The `.formula.toml` |
| Sync | Click layer → highlight in JSON; edit JSON → map re-renders | Click element → jump in Sources; edit CSS → page repaints | Click step in DAG → scroll/highlight in TOML; edit TOML → DAG redraws live |

The TOML is the source of truth. The visual representation is a derived view.

Three tabs within Edit:

- **Source** — the TOML↔DAG pair
- **Cook** — renders `{{var}}` interpolations into a proto preview (live, no commit)
- **Instances** — lists molecules poured from this formula

### What the visual pane needs

- Step DAG by `needs` (nodes = step `id`, edges = deps). Cycle detection visible.
- Per-step badges: retry policy (`max_attempts`, `on_exhausted`), `metadata` keys (`gc.continuation_group`, `gc.session_affinity`), idempotency hinges.
- Var palette: required vs. optional, defaults inline, typed form widgets (enum / bool / path / string).
- Composition tree: `extends` parent + `compose`d formulas as a tree above the steps view.
- Cook preview: given var values, render the proto structure that `bd cook` would produce.

### Sync semantics

- Edit TOML → visual updates live (debounced).
- Click step in visual → cursor jumps to that step's `[[steps]]` block in TOML, line highlighted.
- Edit var/metadata via visual affordances → TOML edit at the right location with no surrounding-context churn.
- Invalid TOML still renders the visual where it can, with errors surfaced inline.

## Observe

Three layouts + a shared peek drawer + workspace switcher:

- **Fleet** — cross-molecule view. One row per live molecule, grouped by formula (toggle to workspace/status). Workspace-colored left bar, current phase, progress, status (`running` / `retry N/M` / `at gate` / `blocked`). Answers "what's running right now across the city?" Click row → drops into that molecule's Timeline.
- **Graph** — one molecule's dep shape. Nodes = issues, edges styled by dep type. The "where am I in the pipeline?" view.
- **Timeline** — one molecule's execution history. Events as a timeline; closest analogue to Temporal UI's history view.

Fleet → Graph → Timeline is a zoom-out sequence: many molecules → one molecule's shape → one molecule's history.

### Peek drawer

Shared bead/molecule detail overlay invoked from any layout. Full field surface (title, description, design, acceptance_criteria, notes, status, priority, assignee, labels, external_ref, deps, comments, audit events). Editable.

### Workspace switcher

Consolidated-view pattern: color-bar-per-workspace appears in result rows so it's clear which workspace a bead/molecule belongs to without context-switching.

## Capture

Single-bead form: title, description, type, priority, assignee, labels, external_ref, deps (with a dep-type picker). Fast path for "here's a new bead."

"Turn this into an epic with phases" belongs on the bead as a second-click action (**Expand to epic**) — it pours a formula, and happens after capture.

**Not** a DSL or batch-paste surface. An earlier prototype iteration had that; rejected as reinventing formulas in a second syntax.

## Vocabulary the UI must surface

Consistent visual treatment across destinations:

- **Phase metaphor** (chemistry):
  - **Solid / Proto** — frozen template (synced)
  - **Liquid / Mol** — active persistent work (synced)
  - **Vapor / Wisp** — ephemeral, local-only (never synced; often invisible to collaborators)
  - **Digest** — squashed permanent record
- **Dependency types**: `blocks`, `parent-child`, `waits-for`, `conditional-blocks` (blocking) vs. `related`, `discovered-from`, `replies-to` (non-blocking).
- **Status flow**: `open` → `in_progress` → `closed` (and `blocked` / `deferred` / `tombstone` / `pinned` / `hooked`).
- **Issue types**: `bug`, `feature`, `task`, `epic`, `chore`, `message`, `merge-request`, `molecule`, `gate`, `agent`, `role`, `convoy`.

Wisps need a visible distinguishing mark (badge or watermark) since they don't behave like other beads — invisible to collaborators, hard-deleted on squash.

## Inspirations and what doesn't port

| Tool | What ports | What doesn't |
|------|------------|--------------|
| Mapbox Studio | Two-pane sync model | Map-specific layer semantics |
| Browser devtools | Live source-↔-rendered binding, edit-the-spec affordances | DOM-specific tree model |
| Temporal UI | Per-execution timeline; workflow list with filters | Parent-child workflow tree (beads is general DAG); deterministic replay (not a beads concept) |
| GitHub Issues / Linear | Issue field editor; comment surface | Centralized state model (beads is Dolt-distributed) |

## Out of scope

- Implementation framework choice (React/Svelte/Elm/...).
- Live data API the UI talks to. Tracked under `fo-beads-ui-api-spec`.
- Auth / multi-writer story. Same bead.
- The interactive prototype itself. Driven via Claude Design; see `prototype-v1/`.

## Prototype iterations

- **v1** (`prototype-v1/`, 2026-04-21) — Claude Design output. Pan/zoom wireframe canvas covers all surfaces; hi-fi interactive editor (`Beads · Formula Editor.html`) renders `gastownhall-upstream.formula.toml` with live TOML↔DAG sync, form-wired vars, cook preview, instances tab stub. See `prototype-v1/HANDOFF.md` for architecture, punts, and blocking questions.

## Open questions

- **Formula filesystem vs bead store.** Formulas are `.formula.toml` files under `.beads/formulas/` (and other search paths); they're not bd issues. Likely shape: `bd formula list/show --json` as the server surface; UI hits that, not the FS directly. Factored into `fo-beads-ui-api-spec`.
- **Wisp visibility in Fleet.** Row-level badge is the default; dedicated toggle deferred — operator wants hands-on time with the prototype before deciding.
- **Gate interactions.** Human gates (`type="human"`) — approve in UI, or link out to where they're resolved (Slack/mail/CLI)? Also deferred pending hands-on time with the prototype.
- **Continuation groups as swimlanes.** `gc.continuation_group` metadata groups steps into logical runs. Probably render as colored bands in the DAG (or swimlanes in a layered layout). Worth prototyping.
- **TOML range tracking in the editor.** Incremental parse + source maps vs rebuild-on-edit. Likely rebuild-on-edit is fine for <2k-line files.
- **Var form schema.** Form widgets are ad-hoc today. A `[vars.X.ui]` block in the formula spec (hint `type="path"` / `"enum"` / `"bool"`) would let authors drive the form.
- **Cook preview vs `bd pour --dry-run`.** Shell out to `bd` for correctness, or reimplement cook in-browser for responsiveness.
