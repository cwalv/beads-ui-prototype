# UI prototype review

Review of `github.com/cwalv/beads-ui-prototype` (local clone at
`/home/cwa/cloneroot/beads-ui-prototype`), measured against the
beads concepts documented in the [handbook/](handbook/README.md) and
the [gaps-audit.md](gaps-audit.md). Every element in every component
of every view is mapped to a handbook reference entry. Findings
address:

1. Are views surfacing the right concepts at the right hierarchies?
2. Do components expose the right information, nothing extra?
3. Are concept mismatches between the UI's domain model and beads
   proper creating leakage?

## Scope

The shipped SPA at `ui/src/`. Routes enumerated in `ui/src/App.tsx:115-132`:

- `/author` → browse (catalog of formulas).
- `/author/browse`.
- `/author/edit/:formulaName[/:tab]` — source / form / cook / instances.
- `/architecture` — stub.
- `/observe` → fleet.
- `/observe/fleet` — live molecules.
- `/observe/graph/:moleculeId` — DAG.
- `/observe/timeline/:moleculeId` — stub.
- `/observe/queue` — stub.
- `/capture` — new-bead form.
- `/bead/:beadId` — peek only (no dedicated page).
- `/docs`, `/docs/:slug` — docs viewer.

Plus chrome: `TopChrome`, `FootBar`, `CommandPalette`, `PeekDrawer`.

Prototype-v1 HTMLs and the wireframe `.jsx` source trees in `prototype-v1/`
are noted only when the shipped SPA diverges from them materially.

## Overall assessment

### What's working

- **Three-destinations IA (Author · Observe · Capture + Learn) is
  sound.** It maps well to the "author workflow, observe execution,
  capture new work" loop that beads supports. A user who learns the
  destinations learns how beads is used.
- **Formula editor is the strongest surface.** Source / form / cook /
  instances tabs + DAG + vars drawer expose most of the formula
  authoring contract — variables, steps, dependencies,
  cook-with-variables, instance inspection.
- **Capture form maps cleanly to `bd create` flags.** Title,
  description, optional expandables (design / acceptance / notes),
  type, priority, assignee, labels, external_ref, dependencies. Most
  of the schema is here.
- **Peek drawer** consolidates the bead detail view into a shared
  overlay triggered from anywhere (Graph nodes, Fleet rows, etc.) —
  right hierarchy.

### What's wrong at the foundations

The UI's domain model in `ui/src/types/index.ts` is **narrower than
beads-core** in several places, and each gap propagates through the
components:

1. **Status surface is truncated.** `BeadStatus` (`types/index.ts:14`)
   = `'open' | 'in_progress' | 'blocked' | 'deferred' | 'closed'`. Drops
   `pinned` and `hooked` from the 7 beads-core statuses. See
   [handbook/reference/status-lifecycle.md](handbook/reference/status-lifecycle.md).
   Hooked in particular is how orchestrators signal "an agent has
   claimed this" — a UI that hides it hides the claim state.
2. **Type surface is both wrong and incomplete.** `BeadType`
   (`types/index.ts:15`) = `bug | feature | task | epic | chore |
   message | merge-request | molecule | gate | agent | role | convoy`.
   Drops **built-ins** `decision`, `story`, `milestone`, `spike`.
   Includes **customs** `merge-request`, `agent`, `role`, `convoy`,
   `gate`, `molecule` as if they were built-ins (they aren't; must be
   registered via `bd config set types.custom "…"`). See
   [handbook/reference/bead-schema.md#core-identity](handbook/reference/bead-schema.md)
   and [gaps-audit.md §C3](gaps-audit.md#c3-gate-type-is-custom-but-required).
3. **Dependency types are heavily truncated.** `DepType`
   (`types/index.ts:29`) = 7 of the 20 well-known types. Drops
   `replies-to`, `relates-to`, `duplicates`, `supersedes`, the four
   HOP entity types (`authored-by` / `assigned-to` / `approved-by` /
   `attests`), `until`, `caused-by`, `validates`, `delegated-from`.
   See [handbook/reference/dependency-types.md](handbook/reference/dependency-types.md).
4. **No labels / metadata in the `Bead` interface anywhere with
   type-specific meaning.** `labels` and `metadata` are present as
   opaque fields. Orchestrators layer their own conventions on top:
   gascity writes `gc.routed_to`, `gc.kind`, `gc.continuation_group`
   metadata and `thread:<id>` / `read` labels; gastown uses
   `hook_bead` description key:value fields and `gt:agent` / `gt:channel`
   / `gt:escalation` / `gt:group` / `gt:queue` / `gt:rig` labels. Neither
   convention set is privileged — the UI needs a pluggable way to
   render orchestrator-specific keys (see cross-cutting finding §2).
   See [handbook/reference/metadata-conventions.md](handbook/reference/metadata-conventions.md).
5. **Events shape is invented.** `BeadEvent` (`types/index.ts:34`) has
   `kind / message / author / created_at`. Beads has TWO event
   concepts: the `events` table (per-issue change history; **no writer
   in shipped bd**) and `type=event` beads
   (`event_kind / actor / target / payload`). The UI's `events` field
   likely maps to the former, which isn't populated by bd proper. See
   [gaps-audit.md §A10](gaps-audit.md#a10-events-three-parallel-logs-no-single-source).

These model mismatches propagate — the peek drawer's Events tab is
empty by default in a fresh bd install because no writer populates
the source it queries.

### What's missing entirely

- **Gates** as first-class surface. Gates are a beads-core coordination
  primitive (`await_type`, `await_id`, `bd gate check`), but no view
  shows "gates blocking my work." The prototype treats gates as
  generic `BeadType="gate"` nodes in the graph, not as actionable
  objects. See [handbook/reference/bead-schema.md#gate-fields-async-coordination](handbook/reference/bead-schema.md).
- **(Not included: hooks, memories, prime.)** These three are agent
  plumbing rather than operator surfaces. Hooks install once and run
  automatically; memories are written by agents and consumed via
  prime; prime output is agent-targeted. If surfaced at all, they
  belong in a secondary diagnostics area, not alongside Author /
  Observe / Capture. See cross-cutting finding §5.
- **Mail** has no surface. Messages (`type=message`) exist as beads
  but aren't surfaced as mail — no inbox, no thread view (the
  `thread:<id>` label is invisible). See
  [handbook/tutorials/04-exchanging-mail.md](handbook/tutorials/04-exchanging-mail.md).
- **Trackers** (Jira / Linear / GitHub Issues / …) have no surface.
  `external_ref` is displayed as plain text; no push/pull action.
  See [handbook/how-to/push-to-github.md](handbook/how-to/push-to-github.md).
- **Ready view** is stubbed. `/observe/queue` shows a placeholder
  banner. Arguably the most common operator query ("what's next for
  me?") is unwired.

### Hierarchy mismatches

- **Fleet groups "in progress molecules"** as the default top-level
  Observe view. This is a useful slice, but a general operator's top
  question is usually "what can I work on now?" — served by `bd ready`
  on individual beads. The hierarchy should be *beads first, molecules
  as a lens over them*, not the other way around. The current Fleet-at-root
  nests beads one level deeper than needed.
- **Bead detail lives only inside a peek drawer.** There's no
  dedicated `/bead/:id` page — route 128 opens a peek on top of
  whatever's behind it (and route 12 on `/bead/:id` with no referrer
  context shows only the drawer chrome). For deep-linking a bead for
  review / handoff / external reference, a full page with URL state
  is needed.
- **Capture is siloed.** It's a destination, not a mode on top of
  other views. The common "I'm looking at a list, I want to add one"
  pattern isn't served.
- **Docs are at the same level as Author / Observe / Capture.** Calling
  them "Learn" in the nav blurs them with *doing*; they're support
  material. This may be deliberate given the tutorial-forward design,
  but flag the prototype's blending here.

## Method

Each view is walked below. For every component the view uses, a table
maps each visible element to (a) what it shows, (b) its handbook
reference, (c) notes on accuracy or gaps.

Where an element doesn't have a clean handbook mapping, the table flags
it. Where multiple elements collapse into one concept (e.g., status
chip + color + text = `Status`), the row is keyed by the concept.

## View 1 — Author · Browse (`/author/browse`)

**Route**: `ui/src/routes/author/browse.tsx` (151 lines). The formula
catalog — how a user discovers what workflows exist.

**Components**:
- `FormulaCard` (inline in `browse.tsx:22-37`).
- `useFormulaList` hook (not inspected; presumed to call
  `bd formula list --json` via bd-server).
- `LoadingFailedBanner`, shared chrome.

### Element inventory

| Element | What it shows | Handbook reference | Notes |
|---|---|---|---|
| Card `name` | `formula.name` | [formula-schema.md](handbook/reference/formula-schema.md) — Root struct, `formula` field | ✅ |
| Card `description` | `formula.description` | [formula-schema.md](handbook/reference/formula-schema.md) — Root struct, `description` field | ✅ |
| Type chip | `formula.type` | [formula-schema.md#the-four-formula-types](handbook/reference/formula-schema.md) | ✅ |
| Step count chip | `formula.steps` (number) | [formula-schema.md#step-schema](handbook/reference/formula-schema.md) | ✅ |
| Var count chip | `formula.vars` (number) | [formula-schema.md#variable-definitions](handbook/reference/formula-schema.md) | ✅ |
| Source pill | Formula file path (shortened) | [formula-schema.md#search-paths](handbook/reference/formula-schema.md) | ✅ — good: surfaces which search path the formula came from. |
| Search input | Free-text filter by name/description | — | No beads concept. Client-side filter. |
| Type filter chips (`all`, `workflow`, `expansion`, `aspect`, `convoy`) | Filter by formula type | [formula-schema.md#the-four-formula-types](handbook/reference/formula-schema.md) | ✅ |
| Per-type count | Count of formulas with that type | Derived. | ✅ |

### Findings

- **Covers the formula-file identity well.** Name, type, steps, vars,
  source are exactly what the handbook surfaces as the formula's
  identifying properties.
- **Missing: `version`.** `Formula.version` is a schema field but not
  displayed. Cheap to add. See
  [formula-schema.md](handbook/reference/formula-schema.md).
- **Missing: `extends` chain.** If a formula extends another, you
  can't see it from the browse view. The Edit page shows it; browse
  doesn't.
- **Missing: `phase` (`liquid` / `vapor`).** Tells the user whether
  this formula is meant to pour (persistent) or wisp (ephemeral). See
  [formula-schema.md](handbook/reference/formula-schema.md) and
  [explanation/the-pour-pipeline.md#wisp](handbook/explanation/the-pour-pipeline.md).
  Worth a chip.
- **Type filter includes `aspect` and `expansion` as if they were
  choosable workflows.** These are authoring primitives, not
  workflows the user pours. The filter should either group them as
  "meta" or hide them from the default view.

## View 2 — Author · Edit (`/author/edit/:formulaName[/:tab]`)

**Route**: `ui/src/routes/author/edit.tsx` (316 lines). The hi-fi
formula editor. Four tabs: Source, Form, Cook, Instances.

**Components**:
- `SourcePane` — text editor with syntax highlighting + error
  markers.
- `DAG` — visual step graph.
- `VarsDrawer` — per-variable input widgets.
- `FormView` (form.tsx, 345 lines) — structured alternative to the
  Source tab.
- `CookView` — live cook preview.
- `InstancesView` — lists molecules poured from this formula.
- `SaveBanner`, `ConflictBanner`.

### Element inventory — Source tab

| Element | What it shows | Handbook reference | Notes |
|---|---|---|---|
| Formula name | `parsed.header.formula` | [formula-schema.md#root-struct](handbook/reference/formula-schema.md) | ✅ |
| Version chip | `parsed.header.version` | [formula-schema.md#root-struct](handbook/reference/formula-schema.md) | ✅ |
| Extends chip | `parsed.header.extends` | [formula-schema.md#with-extends-inheritance](handbook/how-to/write-a-formula.md) | ✅ — clickable to navigate to parent. Good. |
| Save banner | Save state / dirty flag / error | — | UI-specific state, no beads concept. |
| Source pane (TOML text) | Raw formula file | [formula-schema.md#files](handbook/reference/formula-schema.md) | ✅ |
| Step count (tab) | Number of top-level steps | [formula-schema.md#step-schema](handbook/reference/formula-schema.md) | ✅ |
| DAG canvas | Step graph with deps | [formula-schema.md#step-schema](handbook/reference/formula-schema.md), [dependency-types.md](handbook/reference/dependency-types.md) | ✅ |
| DAG edges count | `layout.edges.length` | [dependency-types.md](handbook/reference/dependency-types.md) | ✅ |
| Parse error badge | Count of parse errors | — | Editor state, no beads concept. |
| VarsDrawer | List of formula vars | [formula-schema.md#variable-definitions](handbook/reference/formula-schema.md) | ✅ |
| Var `name` | VarDef name | [formula-schema.md](handbook/reference/formula-schema.md) | ✅ |
| Var `required` pill | Var is required | [formula-schema.md](handbook/reference/formula-schema.md) | ✅ |
| Var `wired` pill | UI-specific hint (var has custom widget) | — | Not a beads concept. |
| Var `default` | VarDef default value | [formula-schema.md](handbook/reference/formula-schema.md) | ✅ |
| Var `description` | VarDef description | [formula-schema.md](handbook/reference/formula-schema.md) | ✅ |
| Var widget (kind segmented) | Type-specific input (enum / string / bool) | [formula-schema.md](handbook/reference/formula-schema.md) — `type` field | ⚠️ Partial: only 4 vars have wired widgets (hardcoded `WIRED` set in `VarsDrawer.tsx:7`). |

### Element inventory — Form tab

| Element | What it shows | Handbook reference | Notes |
|---|---|---|---|
| Header fields (formula, description, kind, extends, contract, phase, pour, version) | Top-level Formula struct fields | [formula-schema.md#root-struct](handbook/reference/formula-schema.md) | ✅ — schema-driven form mirrors the struct. |
| Vars section | Variable CRUD with per-var fields (description, default, required, enum, pattern, type) | [formula-schema.md#variable-definitions](handbook/reference/formula-schema.md) | ✅ |
| Add var / remove var | CRUD on vars array | [formula-schema.md](handbook/reference/formula-schema.md) | ✅ |
| Steps section | Per-step rows with ID, title, type, dep refs | [formula-schema.md#step-schema](handbook/reference/formula-schema.md) | ⚠️ Editable-steps work filed as `fo-totkk` (per SME briefing — not yet shipped). Currently read-only with "jump to source" links. |

### Element inventory — Cook tab

| Element | What it shows | Handbook reference | Notes |
|---|---|---|---|
| "Cook with…" var inputs | Runtime var values | [bd-commands.md#formulas-and-molecules](handbook/reference/bd-commands.md) — `bd cook --var` | ✅ |
| Step list (compiled) | Cooked step titles with `{{var}}` → resolved value | [the-pour-pipeline.md#cook](handbook/explanation/the-pour-pipeline.md) | ✅ — highlighted resolved values are a nice touch. |
| "bd-server not reachable" banner | Degraded-mode indicator | — | Infrastructure state; no beads concept. |

### Element inventory — Instances tab

| Element | What it shows | Handbook reference | Notes |
|---|---|---|---|
| Stub / placeholder | (Not deeply inspected but the SME briefing flagged Instances tab as stubbed) | [the-pour-pipeline.md#pour](handbook/explanation/the-pour-pipeline.md) | ⚠️ Partial — would surface "molecules poured from this formula." |

### Findings

- **The source / form / cook split is excellent.** Each tab
  corresponds to a step in the author's mental pipeline:
  - Source = I edit the TOML.
  - Form = I edit the struct with schema-validated widgets.
  - Cook = I preview what the compiled proto looks like.
  - Instances = I see what's running.
- **Strong coverage of the Formula schema.** Virtually every field in
  `internal/formula/types.go:64-120` has a surface here.
- **The DAG ↔ source click-through is partially wired** (per the
  `fo-zz4pz §9` TODO comment in edit.tsx:61). Clicking a DAG node
  should scroll + highlight the matched `[[steps]]` block; currently
  `selected` state is partial.
- **`compose` rules (bond points, expand, map, branch, aspects,
  hooks) are not surfaced.** The edit view covers header + vars +
  steps; composition is the next tier of formula power and is absent.
  See [formula-schema.md#composition-rules](handbook/reference/formula-schema.md#composition-rules).
- **`advice` / `pointcuts` (aspect formulas) are absent.** If a user
  opens an aspect formula, they see fewer fields than the schema has.
- **`on_complete` and `loop` on steps are absent.** Graph-v2 features
  that the formula schema supports but the Form view doesn't render.
  See [formula-schema.md#step-schema](handbook/reference/formula-schema.md).
- **Cook view only surfaces step titles.** The handbook notes that
  cook produces a full Recipe with typed steps, dependencies, and
  metadata. The UI's cook view simplifies this to a flat list.

## View 3 — Observe · Fleet (`/observe/fleet`)

**Route**: `ui/src/routes/observe/fleet.tsx` (180 lines). Live list of
in-progress molecules.

**Components**:
- `FleetSummary` — aggregate counts + group-by controls.
- `FleetGroupHeader` — per-group header bar.
- `FleetRow` — per-molecule row.
- `ObserveNav` — tab bar (fleet / graph / timeline / queue).
- `useFleetPoll` hook (polling loop).

### Element inventory — FleetRow

| Element | What it shows | Handbook reference | Notes |
|---|---|---|---|
| Workspace color bar | `molecule.workspace` as a color | — | Cross-workspace navigation affordance; no direct beads concept. |
| Workspace name | `molecule.workspace` | Implicitly [the-store-architecture.md](handbook/explanation/the-store-architecture.md) — but this is a bd-server concept, not a beads concept. | UI-specific. |
| Molecule id | `molecule.id` | [bead-schema.md#core-identity](handbook/reference/bead-schema.md) — `id` column | ✅ |
| Title | `molecule.title` | [bead-schema.md#body-content](handbook/reference/bead-schema.md) — `title` | ✅ |
| Kind badge | `molecule.agg.kindBadge` (== 'workflow') | [metadata-conventions.md](handbook/reference/metadata-conventions.md) — `gc.kind` metadata | ⚠️ Only shows `'workflow'`; other kinds (`fanout`, `scope-check`, `workflow-finalize`, `retry`, `ralph`) not surfaced but are present in the metadata. |
| "at ·" phase | `molecule.agg.currentPhase` (from `gc.step_ref` metadata) | [metadata-conventions.md#step-identity](handbook/reference/metadata-conventions.md) — `gc.step_ref` | ✅ |
| Progress bar | `molecule.agg.progress` (fraction of closed steps) | [the-pour-pipeline.md](handbook/explanation/the-pour-pipeline.md) — step lifecycle | ✅ |
| Status label | `molecule.agg.statusRollup` ∈ `running / retry / at-gate / blocked` | Multiple: [status-lifecycle.md](handbook/reference/status-lifecycle.md) (`blocked`), [explanation/agent-coordination.md#gates](handbook/explanation/agent-coordination.md) (`at-gate`), [metadata-conventions.md](handbook/reference/metadata-conventions.md) (`gc.attempt` for retry) | ⚠️ The `running` status isn't a beads-core status; it's a UI rollup. Clear when you know the rollup logic, confusing when you don't. |
| Age | `formatAge(molecule.createdAt)` | [bead-schema.md#timestamps](handbook/reference/bead-schema.md) — `created_at` | ✅ |
| Wisp badge slot | Reserved placeholder | [bead-schema.md#messaging-and-ephemerality](handbook/reference/bead-schema.md) — `ephemeral` flag | ⚠️ Per `fo-zz4pz §6` + SME briefing, empty slot is intentional — open design question on the beads-ui bead Q3. |

### Element inventory — FleetSummary

| Element | What it shows | Handbook reference | Notes |
|---|---|---|---|
| "in progress" count | Count of molecules where rollup = running | Derived: `status_in_progress` subset. [status-lifecycle.md](handbook/reference/status-lifecycle.md) | ⚠️ "in progress" here means "the UI's rollup treats this as actively running"; it's NOT `status=in_progress` on the root bead. Easy confusion point. |
| "retrying" count | Molecules with `gc.attempt ≥ 2` on an in_progress step | [metadata-conventions.md#retry--control-loop](handbook/reference/metadata-conventions.md) — `gc.attempt` | ✅ |
| "at gate" count | Molecules with a `type=gate` step in progress | [explanation/agent-coordination.md#gates](handbook/explanation/agent-coordination.md) | ⚠️ The heuristic "gate-typed step in_progress" is close to but not identical to "has a pending await" — see finding below. |
| "blocked" count | Molecules with any `status=blocked` child | [dependency-types.md](handbook/reference/dependency-types.md) | ⚠️ Manual `status=blocked` vs. computed-blocked by `ready_issues` view are different things. |
| Group-by buttons (`formula / workspace / status`) | Re-group the list | [bead-schema.md#workflow](handbook/reference/bead-schema.md) — `status`, `type` | ✅ |

### Findings

- **Fleet treats molecules as the unit of fleet observation.** This
  is a sensible choice when workflows are the primary driver, but
  hides the underlying bead set. A "fleet of beads" (individual open
  work items) view is missing, and this conflates "what's running"
  with "what's ready." See hierarchy mismatch note above.
- **Status rollup terminology diverges from beads.** `running` isn't
  a beads status. The UI is inventing a fleet-level rollup that
  collapses many underlying states. Document this explicitly — it's
  non-obvious.
- **Retry / at-gate signals lean on metadata** — `gc.step_ref`,
  `gc.attempt`, `gc.max_attempts` etc. These now live in
  [metadata-conventions.md](handbook/reference/metadata-conventions.md)
  (via the gascity metadata deep-dive). Documented; the prototype's
  concern shifts to rendering them consistently.
- **Workspace color + cross-workspace bar:** good affordance for
  multi-city operation. Not a beads concept per se; a bd-server
  / gascity `workspaces` concept.
- **`type=molecule` filter on the fleet query** (`fleet.ts:20`):
  `bd list --type=molecule --status=in_progress`. Correct for
  gascity's convention (root beads have `type="molecule"`). Would
  miss gastown's different root-bead conventions. See
  [explanation/beads-and-orchestrators.md](handbook/explanation/beads-and-orchestrators.md).
- **No way to see individual beads from this view.** Clicking a
  row → `/observe/graph/<id>` shows the DAG, not a list. If an
  operator wants "list the non-closed children of this molecule" they
  can't get there.

## View 4 — Observe · Graph (`/observe/graph/:moleculeId`)

**Route**: `ui/src/routes/observe/graph.tsx` (150 lines). DAG of beads
in a molecule.

**Components**:
- `GraphCanvas` — pan/zoom SVG canvas.
- `GraphNode` — per-bead node.
- `GraphFilterRail` — status/type filters.
- `ObserveNav` — tab bar.
- `PeekDrawer` + `IssuePeekBody` — bead detail when a node is clicked.

### Element inventory — GraphNode

| Element | What it shows | Handbook reference | Notes |
|---|---|---|---|
| Status dot (color) | `bead.status` ∈ `open / in_progress / blocked / deferred / closed` | [status-lifecycle.md](handbook/reference/status-lifecycle.md) | ⚠️ Missing `pinned`, `hooked`, and any custom statuses. Consistent with the truncated `BeadStatus` type. |
| Bead id | `bead.id` | [bead-schema.md#core-identity](handbook/reference/bead-schema.md) | ✅ |
| Priority pill | `bead.priority` (`p0` .. `p4`) | [bead-schema.md#workflow](handbook/reference/bead-schema.md) — `priority` | ✅ |
| Title | `bead.title` | [bead-schema.md#body-content](handbook/reference/bead-schema.md) | ✅ |
| Type pill | `bead.type` | [bead-schema.md](handbook/reference/bead-schema.md) | ⚠️ Uses the UI's narrow `BeadType` — won't show `decision`, `story`, etc. |
| Continuation group chip | `node.continuationGroup` (from `gc.continuation_group`) | [metadata-conventions.md](handbook/reference/metadata-conventions.md) | ✅ — good: makes continuation chains legible. |
| Ghost styling | `node.isGhost` (placeholder for non-resolved parent?) | Not documented. | ⚠️ UI concept; the handbook has no "ghost node" concept. Unclear what it represents from the code alone. |
| Ready border (accent) | `node.isReady` | [dependency-types.md#what-blocks-bd-ready](handbook/reference/dependency-types.md) | ✅ |
| Selected border | UI state | — | UI-local. |

### Element inventory — GraphFilterRail

Not deeply inspected, but visible per `graph.tsx:75-89`:

- Status filter toggles
- Type filter toggles

Both map to the narrow `BeadStatus` / `BeadType` enums — same truncation.

### Element inventory — footer summary

| Element | What it shows | Handbook reference | Notes |
|---|---|---|---|
| Total beads | `graph.nodes.length` | — | Derived. |
| Blocked count | `status === 'blocked'` | [status-lifecycle.md](handbook/reference/status-lifecycle.md) | ✅ |
| In progress count | `status === 'in_progress'` | [status-lifecycle.md](handbook/reference/status-lifecycle.md) | ✅ |
| Ready count | `isReady` | [dependency-types.md](handbook/reference/dependency-types.md) | ✅ |

### Findings

- **Handles the "what am I looking at?" question well.** Status
  colors, priority, continuation groups, ready indicators together
  give a quick read of DAG health.
- **Missing: dependency types on edges.** The DAG draws edges but
  doesn't visually distinguish `blocks` from `waits-for`, `tracks`,
  `parent-child`, etc. See
  [dependency-types.md#workflow-affectsreadywork--true](handbook/reference/dependency-types.md).
  Especially important for `tracks` (non-blocking convoy edges) vs
  `blocks` — they have different semantics.
- **Missing: gate call-outs.** A gate bead is a regular node with a
  `gate` type. Nothing distinguishes "this is the reason the next
  step is blocked." A gate-specific visual would be high-value.
- **"Show more (depth N → N+3)" button**: reasonable ergonomics.
  Matches the handbook's note that dep graphs can be deep.
- **Missing: workspace context.** Unlike the Fleet row, the Graph
  view doesn't show the workspace. Cross-workspace deps (via
  `external:` or cross-prefix) would be invisible.

## View 5 — Observe · Queue (`/observe/queue`)

**Route**: `ui/src/routes/observe/queue.tsx` (26 lines). **Stub** —
shows a `StubBanner` pointing at `prototype-v1/wf-views.jsx:WorkQueue`.

### Findings

- **This is the most important missing view.** `bd ready` is beads's
  primary "what can I work on?" query. The handbook's lifecycle story
  centers on `bd ready` → claim → work → close (see
  [handbook/tutorials/01-your-first-bead.md](handbook/tutorials/01-your-first-bead.md),
  [handbook/tutorials/02-working-with-dependencies.md](handbook/tutorials/02-working-with-dependencies.md)).
  Without a Queue view, the UI doesn't support this core loop.
- **When built, the Queue must surface**:
  - Bead id, title, priority, type, assignee, labels (standard bead
    columns from [bead-schema.md](handbook/reference/bead-schema.md)).
  - Status + a claim affordance (sets `status=in_progress` atomically —
    see [status-lifecycle.md#transitions](handbook/reference/status-lifecycle.md)).
  - Why it's ready (or what's blocking it) — the dependency chain
    from [dependency-types.md](handbook/reference/dependency-types.md).
  - Deferred-until filter (`--include-deferred`), overdue filter
    (`--overdue`), unclaimed filter (`--unassigned`). The stub's
    description hints at these.
  - `gc.routed_to` metadata column if present (for pool membership);
    see [metadata-conventions.md](handbook/reference/metadata-conventions.md).

## View 6 — Observe · Timeline (`/observe/timeline/:moleculeId`)

**Route**: `ui/src/routes/observe/timeline.tsx` (28 lines). **Stub.**

### Findings

- **Legitimate future view**, but low priority — per-molecule execution
  history maps to beads's `events` table, which has **no writer**
  (see [gaps-audit.md §C7](gaps-audit.md#c7-interactions-table-has-no-writer)).
  The data source doesn't exist in beads proper. Gascity has
  `.gc/events.jsonl`; gastown has no equivalent.
- **If built, pick a data source explicitly.** Recommend gascity's
  `.gc/events.jsonl` since it has a registry (see
  [05-gascity-integration.md §11.1](05-gascity-integration.md) in the raw
  material). Document that this view is gascity-only.

## View 7 — Capture (`/capture`)

**Route**: `ui/src/routes/capture/index.tsx` (594 lines). New-bead
form.

### Element inventory — main form

| Element | What it shows / does | Handbook reference | Notes |
|---|---|---|---|
| Title | `bead.title` (required) | [bead-schema.md#body-content](handbook/reference/bead-schema.md) | ✅ |
| Description | `bead.description` | [bead-schema.md#body-content](handbook/reference/bead-schema.md) | ✅ |
| `design` (optional, collapsed) | `bead.design` | [bead-schema.md#body-content](handbook/reference/bead-schema.md) | ✅ |
| `acceptance_criteria` (optional, collapsed) | `bead.acceptance_criteria` | [bead-schema.md#body-content](handbook/reference/bead-schema.md) | ✅ |
| `notes` (optional, collapsed) | `bead.notes` | [bead-schema.md#body-content](handbook/reference/bead-schema.md) | ✅ |
| Dependencies — existing chips + id | User-added `blocks` / `parent-child` / `waits-for` / `related` / `discovered-from` | [dependency-types.md](handbook/reference/dependency-types.md) | ⚠️ Only 5 of 20 dep types exposed. Most common 5, but `supersedes`, `duplicates`, `tracks`, and the 4 HOP types are invisible. |
| Dep-type picker chips | Choose type for new dep | [dependency-types.md](handbook/reference/dependency-types.md) | ⚠️ Same as above. |
| Dep id input | Target bead id | [dependency-types.md](handbook/reference/dependency-types.md) — cross-prefix deps are legal | ⚠️ No validation / autocomplete; no `external:` escape hatch surfaced. |
| "Expand to epic" (stub) | Dialog to pour a formula from this bead | [explanation/the-pour-pipeline.md](handbook/explanation/the-pour-pipeline.md) | ⚠️ Stubbed. The concept is correct — capturing a bead then pouring a formula onto it is the natural second-click action. |

### Element inventory — right rail

| Element | What it shows / does | Handbook reference | Notes |
|---|---|---|---|
| Type chips (`bug`, `feature`, `task`, `chore`, `epic`, `message`) | `bead.type` | [bead-schema.md#workflow](handbook/reference/bead-schema.md) | ⚠️ Missing core types `decision`, `story`, `milestone`, `spike`. |
| Priority chips (P0..P4) | `bead.priority` | [bead-schema.md#workflow](handbook/reference/bead-schema.md) | ✅ |
| Assignee input | `bead.assignee` | [bead-schema.md#assignment](handbook/reference/bead-schema.md) | ✅ |
| Labels + add label | `bead.labels` | [bead-schema.md#derived--auxiliary-tables](handbook/reference/bead-schema.md) — `labels` table | ✅ |
| External ref | `bead.external_ref` | [bead-schema.md#external-integration](handbook/reference/bead-schema.md) | ✅ |
| Destination chip | Current workspace | — | UI concept. |

### Element inventory — mode bar

| Element | Purpose | Handbook reference |
|---|---|---|
| Save & new button | `bd create` then reset form | [bd-commands.md#issue-lifecycle](handbook/reference/bd-commands.md) — `bd create` |
| Create bead button | `bd create` then navigate to `/bead/:id` | [bd-commands.md#issue-lifecycle](handbook/reference/bd-commands.md) |
| Destination chip | Target workspace | — |

### Findings

- **Covers ~90% of `bd create` flag surface.** Title, description,
  design, acceptance, notes, type, priority, assignee, labels,
  external_ref, dependencies are all here.
- **Missing fields** (minor):
  - `--spec-id` — spec_id.
  - `--estimate` — estimated_minutes.
  - `--due` — due_at.
  - `--defer` — defer_until.
  - `--metadata` — arbitrary metadata.
  - `--parent` — hierarchical parent via ID (the UI surfaces
    `parent-child` via dep but not the `bd-a.1` hierarchical ID form).
  - `--ephemeral` / `--no-history` — ephemeral flags.
  - `--mol-type` — molecule type (swarm / patrol / work).
- **Missing type coverage** — core types `decision`, `story`,
  `milestone`, `spike` aren't in the chip set.
- **Dep type coverage** is pragmatic (5 common types) but limiting
  for advanced users. Consider an "advanced" expander.
- **"Expand to epic" stub** is conceptually sound — the second-click
  pour is the right pattern for growing a single bead into a
  molecule. See [explanation/the-pour-pipeline.md](handbook/explanation/the-pour-pipeline.md).
- **No Required Sections validation preview.** For types with
  required markdown sections (bug → Steps to Reproduce + Acceptance
  Criteria, epic → Success Criteria), see
  [status-lifecycle.md#required-sections-authoritative-per-type](handbook/reference/status-lifecycle.md).

## View 8 — Bead (peek drawer `IssuePeekBody`)

**Context**: No dedicated page; shown as a drawer from `/observe/graph`
or linked from a list. See `components/peek/IssuePeekBody.tsx`.

**Tabs**: Overview, Deps, Comments, Events.

### Element inventory — Overview tab (read mode)

| Element | What it shows | Handbook reference | Notes |
|---|---|---|---|
| id | `bead.id` | [bead-schema.md#core-identity](handbook/reference/bead-schema.md) | ✅ |
| title | `bead.title` | [bead-schema.md#body-content](handbook/reference/bead-schema.md) | ✅ |
| status | `bead.status` | [status-lifecycle.md](handbook/reference/status-lifecycle.md) | ⚠️ UI dropdown offers 5 values; beads has 7 + customs. |
| type | `bead.type` | [bead-schema.md#workflow](handbook/reference/bead-schema.md) | ⚠️ Same narrow type union. |
| priority | `bead.priority` | [bead-schema.md#workflow](handbook/reference/bead-schema.md) | ✅ |
| assignee | `bead.assignee` | [bead-schema.md#assignment](handbook/reference/bead-schema.md) | ✅ |
| labels | `bead.labels.join(', ')` | [bead-schema.md](handbook/reference/bead-schema.md) — labels | ✅ |
| external ref | `bead.external_ref` | [bead-schema.md#external-integration](handbook/reference/bead-schema.md) | ✅ |
| description | `bead.description` | [bead-schema.md#body-content](handbook/reference/bead-schema.md) | ✅ |
| design | `bead.design` | [bead-schema.md#body-content](handbook/reference/bead-schema.md) | ✅ |
| acceptance | `bead.acceptance_criteria` | [bead-schema.md#body-content](handbook/reference/bead-schema.md) | ✅ |
| notes | `bead.notes` | [bead-schema.md#body-content](handbook/reference/bead-schema.md) | ✅ |

**Missing fields**:

- `owner`, `estimated_minutes`, `created_at`, `updated_at`,
  `started_at`, `closed_at`, `close_reason`, `closed_by_session`.
- `due_at`, `defer_until`.
- `source_system`.
- `metadata` — not displayed at all.
- `compaction_level` / `compacted_at` / `original_size` — context on
  whether the bead has been AI-summarized.
- `sender` (for message-type beads).
- `ephemeral` / `no_history` / `wisp_type` — ephemeral state.
- `pinned` (the bool column).
- `is_template` — marks protos.
- `await_type` / `await_id` / `timeout` / `waiters` — gate fields,
  critical if the bead is a gate.
- `mol_type`, `work_type` — molecule classification.
- `event_kind` / `actor` / `target` / `payload` — event fields.
- `source_formula` / `source_location` — provenance for beads created
  by a formula.

That's ~25 schema columns not exposed. Most are cold (most beads
don't have a `due_at`), but the gate fields and metadata are
load-bearing for several views.

### Element inventory — Deps tab

| Element | What it shows | Handbook reference | Notes |
|---|---|---|---|
| "depends on" list (→) | `bead.dependencies` | [dependency-types.md](handbook/reference/dependency-types.md) | ✅ |
| "depended on by" list (←) | `bead.dependents` | [dependency-types.md](handbook/reference/dependency-types.md) | ✅ |
| Add dependency (target id + type) | `bd dep add` | [dependency-types.md](handbook/reference/dependency-types.md), [bd-commands.md](handbook/reference/bd-commands.md) | ⚠️ 7 dep types in the picker (matches `DepType`); the other 13 are missing. |
| Remove dep button | `bd dep rm` | [bd-commands.md](handbook/reference/bd-commands.md) | ✅ |

### Element inventory — Comments tab

| Element | What it shows | Handbook reference | Notes |
|---|---|---|---|
| Comment author / timestamp / body | `bead.comments` | [bead-schema.md#derived--auxiliary-tables](handbook/reference/bead-schema.md) — `comments` table | ✅ |
| Add comment | `bd comment` | [bd-commands.md](handbook/reference/bd-commands.md) | ✅ |

### Element inventory — Events tab

| Element | What it shows | Handbook reference | Notes |
|---|---|---|---|
| Event kind / author / timestamp / message | `bead.events` | — | ⚠️ Source unclear — either the `events` table (no writer) or the `events` JSON array on the Issue JSON. Per [gaps-audit.md §A10](gaps-audit.md), neither is canonical. Empty by default on a bare bd install. |

### Findings

- **Overview is the right concept at the right level,** but the
  field coverage is thin — critical cold-path fields (gate, metadata,
  ephemeral) are invisible. Most load-bearing UI surfaces (Observe ·
  Graph for gates, Fleet for `gc.kind`) depend on information that
  isn't in the peek.
- **Edit mode is scope-limited** to the common fields: title,
  status, priority, assignee, description, design, acceptance,
  notes. Labels are NOT editable here — the user sees them in view
  mode but can't modify (only visible edit is in the Capture form).
  See [bd-commands.md#issue-lifecycle](handbook/reference/bd-commands.md) —
  `bd update`, which does support label edits.
- **Deps tab allows add/remove but with truncated type set.** Same
  criticism as Capture.
- **Comments tab is right.** Full read + add.
- **Events tab is almost certainly showing empty data.** Beads's
  `events` table has no writer; `bd show --json` doesn't populate an
  `events` array by default. Either hide the tab on empty, or rename
  it to point at the specific source (e.g., "Event beads linked to
  this one").
- **No Overview editing of labels / external_ref.** Visible but
  read-only. See "Add label" in Capture — should be shared UX here.
- **No `owner` vs `assignee` distinction.** Beads has both; UI
  conflates.

## View 9 — Docs (`/docs`, `/docs/:slug`)

**Routes**: `ui/src/routes/docs/index.tsx`, `docs/file.tsx`. Markdown
viewer for embedded docs.

**Findings**:
- **Right destination** for in-app learning material. Tutorial-forward
  approach.
- **Content source**: `/docs/*.md` in the prototype repo. These should
  — eventually — be the handbook I've written (or derivatives thereof).
- **Not reviewed in detail** — this is a content viewer, not a
  data-surfacing view. Scope out of this audit.

## View 10 — Architecture (`/architecture`)

Stub per `architecture/index.tsx`. Per the concepts doc:

**Findings**:
- **Probably should move.** It's a one-page explanatory view; makes
  more sense as a child of Docs (the Learn destination), not a
  sibling of Author / Observe / Capture.

## Chrome (TopChrome, FootBar, CommandPalette)

### TopChrome

| Element | What it shows | Handbook reference | Notes |
|---|---|---|---|
| "beads" mark | Home link | — | UI chrome. |
| Workspace pill | Current workspace name + color | — | bd-server concept. |
| "+ consolidated" badge | Multi-workspace mode | — | UI-specific. |
| Stub dot | bd-server unreachable | — | Infrastructure state. |
| Destination tabs (Author / Observe / Capture / Learn) | IA | — | UI-specific. |
| Breadcrumb | Current URL path | — | UI chrome. |
| Dirty indicator (●) | Unsaved form state | — | UI-specific. |
| Doc mode toggle (?) | Toggle hint-dots | — | UI-specific. |
| Search pill (⌘K) | Command palette | — | UI-specific. |

### Findings

- **Workspace pill** is the right place for the workspace selector,
  but consider surfacing bd-server connection status more prominently.
  "Stub dot" is small and easy to miss.

### CommandPalette

Not read in detail. Listed in App.tsx:8. The handbook doesn't have a
concept for command palette per se — it's a pure UI affordance. But
if it exposes beads verbs, those should map to `bd-commands.md`
entries.

### PeekDrawer

Shared drawer shell used by the Bead route + Graph view. Same
concerns as Bead Peek tab inventory above.

## Cross-cutting findings

> **2026-04-25 update**: §1, §2, and §6 below are addressed by
> [`architecture-decisions.md`](architecture-decisions.md). The cross-cutting
> findings remain as the *problem statements*; the decisions doc carries
> the *resolutions*. §3, §4, §5, §7 still stand as catalog inputs.

### 1. The domain model is the bottleneck

`ui/src/types/index.ts` defines narrower enums than beads-core. This
propagates: every component that renders a status, type, or dep type
uses these enums. Fixing at the source unlocks every downstream view.

**Fix**: Broaden the enums to match
[handbook/reference/bead-schema.md](handbook/reference/bead-schema.md),
[handbook/reference/status-lifecycle.md](handbook/reference/status-lifecycle.md),
[handbook/reference/dependency-types.md](handbook/reference/dependency-types.md).
Add a "custom" variant for user-configured types/statuses. Display
"unknown" or a debug-only color for values outside the enum rather
than hiding them.

### 2. Metadata needs convention packs, not hard-coded keys

`Bead.metadata` is a free-form JSON blob. The prototype renders only
a few specific keys in Fleet aggregation (`gc.step_ref`, `gc.attempt`,
`gc.continuation_group`, `gc.kind`). These are **gascity conventions**
— load-bearing in a gascity-orchestrated workspace, meaningless
elsewhere.

Gastown uses a different convention set entirely — **three substrates**
per the [gastown-conventions-deep-dive](gastown-conventions-deep-dive.md)
(~65 description-field keys across 11 bead kinds, ~60 label patterns,
one metadata key):

- **Dispatch signal**: `hook_bead: <id>` as a key:value line in the
  bead's **description**, NOT metadata (see `04-gastown-integration.md`
  §6 — `fields.go` is the parsing substrate).
- **Type discriminators**: `gt:agent`, `gt:channel`, `gt:escalation`,
  `gt:group`, `gt:merge-slot`, `gt:queue`, `gt:rig`,
  `gt:merge-request`, `gt:sling-context` labels.
- **Threading**: `thread:<id>` label on `gt:message` beads — SAME as
  gascity, not different.
- **JSON descriptions**: `gt:merge-slot` and `gt:sling-context` beads
  use pure JSON (not key:value) inside their description. Parser must
  detect before splitting.
- **Metadata column**: one convention only — `metadata.delegated_from`
  (JSON `Delegation` record).

A generic beads-ui shouldn't privilege either set. The UI needs a
pluggable way to render orchestrator-specific conventions.
Recommended shape:

1. **Orchestrator convention packs** — a typed module per orchestrator
   (`packs/gascity.ts`, `packs/gastown.ts`) declaring display rules:
   "for metadata key `gc.routed_to`, render as 'routed to pool' chip;
   for label pattern `gt:*`, group as 'gastown type'." The UI detects
   the active orchestrator via workspace presence markers (`.gc/` vs.
   `mayor/town.json`) or reads a workspace-level config field.
2. **Declarative conventions file** — a user-editable
   `conventions.yaml` mapping metadata keys and label patterns to
   display rules. Good for user-level conventions (`sprint:q2-push`,
   `epic:auth`). Less code, more config.
3. **Generic + overrides** — render all metadata as raw key:value
   by default; conventions are overrides that promote specific keys
   to chips / panels.

**Recommendation**: hybrid. Ship gastown and gascity packs as defaults
with auto-detection. Fall back to generic key:value rendering for
unrecognized workspaces / unknown keys. Allow user overrides via a
conventions file. A bare `bd` user sees raw metadata; a gastown or
gascity user sees orchestrator-aware rendering; any user can extend.

**Fix**: Add a "Metadata" section to the Peek Overview tab that
consults the active convention pack. Group well-known keys with
friendly labels + handbook ref links; show raw JSON for unknown keys
(collapsed). Same approach for `bead.labels` — most labels are
orchestrator or user conventions, not free-form strings.

**Pack-shape implication** (from the two deep-dives):

- **gascity pack** is primarily a metadata-key catalog
  (~60 `gc.*` + 28 `convergence.*`) plus a small label catalog.
- **gastown pack** is primarily a description-field parser
  (per-bead-kind field catalog, plus JSON-description detection for
  `gt:merge-slot` / `gt:sling-context`) plus a large label catalog.
  Only one metadata key (`delegated_from`).

The two packs have very different internal shapes. A generic
convention-pack interface should let packs declare all three
substrates (labels, description-fields, metadata-keys) — gastown uses
all three; gascity uses two. See
[handbook/reference/gastown-conventions.md](handbook/reference/gastown-conventions.md)
and [handbook/reference/metadata-conventions.md](handbook/reference/metadata-conventions.md)
for concrete content.

### 3. The "molecule" frame is stronger than the "bead" frame

Fleet treats molecules as the primary object. Graph shows a molecule's
DAG. Timeline (stub) is per-molecule. These are all *molecule-first*
views. But a user who isn't working with molecules (bare bd install,
or a team that uses bd without pouring formulas) has very little
surface:

- No plain bead list (beyond `/observe/queue` stub).
- No "all beads in workspace" browser.
- No search UI (the command palette may serve this, but it's a
  fallback).

**Fix**: Add a bead-centric view to Observe (maybe `/observe/beads`?)
that lists beads without the molecule frame. This is the natural
companion to `/observe/queue` (ready) — it's "all of them."

### 4. Gates as first-class objects

Gates are coordination primitives, not just "beads with type=gate."
They have auto-resolution semantics (`bd gate check`), waiter lists,
timeouts, and failure modes — none of which surface.

**Fix**: Dedicated gate rendering:
- In Graph: visual distinction (diamond shape, "awaiting" badge).
- In Peek: expand `await_type` / `await_id` / `timeout` / `waiters`
  to a dedicated panel. Surface `bd gate resolve` as a button for
  human gates.
- In Fleet summary: "N gates awaiting" separate from "at gate" count
  (since "at gate" is a rollup; explicit gate count is more actionable).
- In the Queue (once built): a "gates" filter.

See [handbook/how-to/add-a-gate.md](handbook/how-to/add-a-gate.md),
[handbook/reference/bead-schema.md#gate-fields-async-coordination](handbook/reference/bead-schema.md).

### 5. Hooks / memories / prime are agent plumbing, not primary surfaces

Three coordination primitives (`bd hooks`, `bd remember / memories /
recall / forget`, `bd prime`) support the agent loop but aren't
primary operator surfaces. The audience pattern is the same for all
three:

- **Hooks**: operator installs once via `bd hooks install`; hooks run
  automatically on every subsequent agent operation.
- **Memories**: agent writes after corrections (`bd remember`); flows
  back via `bd prime` into the next session. Human touch is occasional.
- **Prime**: generated at agent session start; consumed by the agent.
  Humans don't read prime output; if they want to customize what
  agents see, they edit `.beads/PRIME.md` directly.

A primary UI (Author / Observe / Capture) for these isn't justified.
At most, these deserve a **secondary diagnostics destination** —
"System" or "Diagnostics":

- Hook health: list installed hooks, versions, whether outdated
  (`bd hooks list --json` returns this).
- Memory inspector: list memories with delete / edit.
- Prime preview: show what the next agent session will see — a
  debugging view.

**Recommendation**: out of scope for v1. If added later, group them
in a single diagnostics area, clearly separated from the core
destinations.

### 6. The Queue view is urgent

`/observe/queue` is the missing link for the "find work → claim → do
→ close" loop that the handbook teaches. A stub is worse than absent
here because it signals the concept exists but obscures what the
right query shape should be.

**Priority**: implement this next. It's the most common bd use (`bd
ready`) and the most common agent-level query.

### 7. Tie the UI to the handbook

This review maps each element to a handbook entry. To keep the tie
alive, consider:

- **Inline hint dots** already shipping (per the SME briefing) —
  these are exactly the right affordance. Wire them to handbook
  anchors.
- **Tooltips on field labels** pointing at the handbook entry (e.g.,
  priority → bead-schema.md#workflow).
- **A "docs" button in the peek drawer** that jumps to the bead
  section of the handbook.

## Recommended changes, ranked

### Must-fix (prerequisite for a canonical UI)

1. **Broaden the domain model.** `BeadStatus`, `BeadType`, `DepType`
   in `types/index.ts` to match the handbook.
2. **Implement `/observe/queue`.** `bd ready` surface with claim
   affordance. The primary operator loop.
3. **Expose metadata.** At least the well-known `gc.*` keys in the
   Peek drawer and graph rendering.
4. **First-class gate rendering.** Diamond shape on graph; dedicated
   panel in peek; "gates awaiting" count in Fleet.

### Should-fix (unlocks handbook fidelity)

5. **Complete field coverage in peek.** The 25 missing schema columns
   — particularly `closed_at`, `close_reason`, `due_at`,
   `defer_until`, `mol_type`, `work_type`, and the gate fields.
6. **Dedicated `/bead/:id` page.** Full-page bead detail for deep
   linking; peek drawer remains for in-context use.
7. **All 20 dep types.** Via an "advanced" expander if chip crowding
   is a concern.
8. **Labels / external_ref editing in peek.** Shared UX with Capture.
9. **Required Sections validation** (`bd lint` preview) in Capture.

### Nice-to-have (rounds out the concept)

10. **Diagnostics destination** — optional secondary area for
    hook health, memory inspector, and prime preview. Low priority;
    defers cleanly.
11. **Bead-centric list view** (not molecule-first) in Observe.
12. **Timeline view** (source: `.gc/events.jsonl`) with explicit
    "gascity-only" label.
13. **Tracker push/pull** UI for `external_ref`.
14. **Mail view** (inbox of `type=message` beads, with `thread:<id>`
    label grouping).
15. **Command palette**: ensure its verbs map 1:1 to
    [bd-commands.md](handbook/reference/bd-commands.md).

### Metadata additions to the handbook

Review flagged two under-documented keys used by Fleet (`gc.step_ref`,
`gc.attempt`). The gascity metadata deep-dive at
[gascity-metadata-deep-dive.md](gascity-metadata-deep-dive.md)
expanded the handbook catalog from ~25 to ~60 `gc.*` keys and added
the `convergence.*` namespace (28 keys, now at
[handbook/reference/convergence-metadata.md](handbook/reference/convergence-metadata.md)).
Resolved.

## Provenance

Read in full:
- `App.tsx`, `types/index.ts`
- Routes: author/{browse, edit, form}, observe/{fleet, graph, queue,
  timeline, index}, capture, bead, architecture, author/index
- Components: `chrome/TopChrome`, `observe/FleetRow`, `observe/FleetSummary`,
  `observe/GraphNode`, `peek/IssuePeekBody`, `editor/VarsDrawer`,
  `editor/CookView` (partial)
- Clients / libs: `client/fleet.ts`, `lib/molecule-agg.ts`

Skimmed / referenced but not fully read:
- `CommandPalette`, `PeekDrawer`, `StubBanner`, `SourcePane`, `DAG`,
  `SaveBanner`, `ConflictBanner`, form sub-components, remaining
  hooks.

The review's claims cite file:line where the code is authoritative.
Where the claim is about absence ("no view for X"), the absence is
verified against the route table in `App.tsx:115-132` plus the
components directory listing.
