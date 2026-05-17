# Canonical vs vestigial

Beads ships a lot. Not all of it is used. This doc maps which beads
features are load-bearing for the orchestrated ecosystem, which are
shipped-but-unused, and which are dead.

The test: **does either gastown or gascity actually exercise this?** If
yes, it's canonical — the orchestrators are a design constraint on
beads's evolution. If no, it's either vestigial or optional.

The audit at [../../gaps-audit.md](../../gaps-audit.md) documents the
findings; this doc distills them into recommendations.

## Load-bearing (build for these)

### Core data model

- **The Issue row.** All orchestrators store their concepts as
  beads with specific types + metadata + labels.
- **The dependency graph.** `blocks` is the central edge type;
  `parent-child` is the canonical parent relationship.
- **Labels as first-class metadata.** Both orchestrators use labels
  heavily (`thread:<id>`, `gt:agent`, `read`, etc.).
- **The `metadata` JSON column.** Gascity's `gc.*` conventions; both
  orchestrators use this for type-specific data that doesn't warrant
  a dedicated column.
- **Ephemeral / wisp routing.** Operationally critical —
  heartbeats, patrol reports, scheduler contexts are all wisps.

### Storage and sync

- **Dolt as the backend.** Per-write commits, branch/merge/push
  semantics. No SQLite fallback.
- **`.beads/redirect`** for worktree sharing. Heavily used by
  gastown.
- **The wisps table and dolt_ignore mechanism.** This is how
  "ephemeral first-class" actually works.

### CLI surface

- **`bd create / update / close / reopen`** — basic CRUD.
- **`bd ready`** — the unblocked-work query. Workers poll this.
- **`bd list` + `bd search`** — the filter surface.
- **`bd show`** — the issue-detail view.
- **`bd dep add / rm`** — edge CRUD.
- **`bd batch`** — multi-op atomic writes; used by scripts.
- **`bd create --graph`** — atomic multi-bead + multi-edge create.
  Used by gascity's `molecule.Cook`.
- **`bd mol current / progress`** — step workflow runner. Gascity
  explicitly delegates step tracking here.
- **`bd config`** — type/status custom registration.
- **`bd init`** — workspace setup.

### Coordination primitives

- **Mutation hooks** (`on_create`, `on_update`, `on_close`) — the
  event bus for gascity's cache invalidation.
- **`bd prime`** — session-start contract. Orchestrators extend or
  replace but preserve the model.
- **Memory (`bd remember`, etc.)** — stored as config rows; injected
  via `bd prime`.
- **Gates (`await_type`, `await_id`, `bd gate check`)** — the
  async-wait primitive both orchestrators assume is available.
- **Formulas and molecules.** Both orchestrators have their own
  formula compilers but use beads's formula *file format* (TOML).

### Infrastructure-y things

- **Cross-prefix dep references.** Gastown uses extensively; gascity
  uses for convoy-crosses-rig scenarios.
- **Custom types / statuses.** Every orchestrator registers its own
  (`agent`, `rig`, `queue`, `gate`, `molecule`, `message`, …).
- **Metadata validation (`metadata.validation`)** — optional but
  used when enabled.

## Optional (shipped, rarely used)

Features that beads provides but which neither orchestrator exercises
by default. Available if needed; don't design around them.

- **`bd federation`** — peer-to-peer Dolt sync. Neither gastown nor
  gascity uses it. If you want distributed beads, here it is.
- **`bd ado` / `bd jira` / `bd linear` / `bd notion`** — tracker
  integrations. Present in the binary; no orchestrator pulls them
  into the default flow.
- **`bd compact --dolt`** / **`bd flatten`** — Dolt history
  operations. Useful for long-lived projects; no orchestrator
  automates them.
- **`bd find-duplicates --method ai`** — AI-driven semantic dedup.
  Requires `ANTHROPIC_API_KEY`.
- **`bd audit`** — event log viewer for the beads-internal
  `events` table. Table has no writer (§C7), so this is empty.
- **`bd feedback`** — feedback channel to beads maintainers.
- **`bd swarm`** — swarm ops. Niche.
- **`bd sql`** — raw SQL. Dangerous. Rarely used by orchestrators.
- **`bd rename-prefix`** — bulk prefix rename. Single-use.
- **`bd recipes` / `bd setup`** — AI-tool integration
  installers. Useful; not orchestrator-central.

## Vestigial (skip)

Features that exist but shouldn't be built against.

### `bd preflight`

Go-project-specific for the beads repo itself (tests, lint, gofmt,
Nix). Running it in another project emits nonsense. Orchestrators
re-implement "preflight" as generic lint. See
[../../gaps-audit.md](../../gaps-audit.md) §A9.

### `bd gate check` with `await_type="bead"`

Always returns false — "cross-rig bead gate cannot be checked
(multi-rig routing removed)" (`cmd/bd/gate.go:726-734`). `bd gate
--help` still documents the type as valid. See §C4.

### Orphaned HOP schema columns

`hook_bead`, `role_bead`, `agent_state`, `last_activity`, `role_type`,
`rig` exist in the `issues` / `wisps` tables. NOT in the `Issue` Go
struct or `IssueSelectColumns`. Legacy remnants from a partial drop
(§V1).

Orchestrators that use `hook_bead` use it as a **description field**,
not the column.

### `interactions` table

Migration 0014 creates the table. `audit.Append` writes to
`interactions.jsonl` (file) instead. No direct INSERTs found. See §C7.

### Hex ID generator

`internal/types/id_generator.go:29-41` exports `GenerateHashID` (hex),
but production uses `internal/idgen/hash.go:55-85` (base36). Hex
version has documentation referring to a "progressive collision
strategy" that doesn't match what's shipped. Dead. See §C5.

### Unexported `generateIssueIDInTable`

`internal/storage/dolt/wisps.go:45-86` duplicates most of
`GenerateIssueIDInTable`'s logic with a hardcoded length-by-count step
function. Only called from `internal/storage/dolt/transaction.go:169`.
Two paths with subtly different strategies. See §V4.

### Built-in molecule registry

`getBuiltinMolecules()` returns `nil` with a TODO (`internal/molecules/molecules.go:243-252`).
README-level material talks about "built-in molecules" as a concept, but
the binary ships zero. See §C6.

### `bd merge-slot`

Removed from bd v0.62+. Both orchestrators re-implemented it (gastown's
`beads_merge_slot.go`; gascity's doesn't use the concept). Command still
exists in bd; nothing sensible happens if you use it. See §V7.

### Schema field: `pinned` bool (column)

Separate from `status='pinned'`. Documented as "persistent context
marker, not a work item" but no view or code path consults it. Favor
the status value. See §B5.

### `bd mail` without a delegate

Exits 1 with setup instructions. Both orchestrators bypass it entirely
— `gt mail` and `gc mail` use the Store interface directly.

### Double pinned concept

Per §B5, `status='pinned'` is the lifecycle meaning; `pinned` bool is
orphaned. Skip the bool.

### `bd purge`

Not vestigial but **deceptively named** — it hard-deletes any closed
ephemeral bead (pinned protected). The "wisps-oriented UX" makes it
look safe; it's not. Document this prominently if you expose it.

## Doc-only (don't believe it)

Things that beads docs claim that code doesn't support:

### Thread shape via `DepRepliesTo` + `ThreadID`

Schema supports it; `bd mail` is pass-through and creates no edges;
neither orchestrator produces them. The documented threading mechanism
has no producer in any shipped code path. The de facto threading is
the `thread:<id>` label. See §A3.

### Events table

The `events` table (migration 0005) is part of the schema. No writer
exists in the codebase. `bd audit` reads from it, so it returns empty
data. Don't surface it. See §C7.

### `AffectsReadyWork` claims four dep types block ready

Code helper says `blocks`, `parent-child`, `conditional-blocks`,
`waits-for`. The SQL view (`ready_issues`) enforces only `blocks`.
`parent-child` participates only through the deferred-parent CTE. See
§C1.

If you're showing "what's blocking this bead" in the UI, use the view
(authoritative) rather than walking deps in Go.

### `hooked` status is "barely used"

Doc 01 says beads-core doesn't transition to `hooked`. True within
beads. But gastown **does** transition (via `bd update --status=hooked`)
on sling. The status is meaningful orchestrator convention, not dead.
See §A1.

## Recommendations for beads-ui

If building a generic beads UI:

1. **Build against the load-bearing list first.** Issue, deps, ready,
   show, list, search, mail (via beads), gates, hooks, memory, prime.
   That's the canonical coverage.
2. **Hide optional features behind an "advanced" mode.**
   `bd federation`, trackers, `bd audit`, `bd sql`.
3. **Don't surface vestigial features.** `bd preflight`, `bd gate
   check --type=bead`, the `pinned` bool column, orphaned HOP
   columns.
4. **Don't build threading on `DepRepliesTo`.** Use the label
   convention that gascity established.
5. **Treat gastown's `hook_bead` field (description) and gascity's
   `gc.routed_to` (metadata) as two equivalent dispatch signals.**
   Surface whichever is set; prefer metadata for canonical UX.
6. **Pick metadata conventions as canonical.** Gascity's `gc.*` keys
   are load-bearing. Gastown's description-field conventions are
   gastown-specific; don't privilege them.

## See also

- [../../gaps-audit.md](../../gaps-audit.md) — full audit.
- [beads-and-orchestrators.md](beads-and-orchestrators.md) — how the
  pieces relate.
- [why-beads.md](why-beads.md) — why the design ended up this way.
