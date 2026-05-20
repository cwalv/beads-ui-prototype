# Dependency types

Beads has 19 well-known `DependencyType` values, grouped by purpose.
Any non-empty string up to 50 chars is legal — `IsValid`
(`internal/types/types.go:810-812`) accepts user-defined types too.
`WellKnownDependencyTypes` / `IsWellKnown` enumerate the constants
(`types.go:816-834`).

All edges are `(issue_id) → depends_on_id` — read as "issue_id
*depends on* depends_on_id."

## What blocks `bd ready`

Only **`blocks`** appears directly in the `ready_issues` view
(`migrations/0025_update_ready_issues_view.up.sql:5-22`).

`AffectsReadyWork` (`types.go:838-840`) claims four types affect ready:
`blocks`, `parent-child`, `conditional-blocks`, `waits-for`. The view
disagrees:

| Type | `AffectsReadyWork` | `ready_issues` view |
|---|---|---|
| `blocks` | true | blocks the bead |
| `parent-child` | true | only deferred-parent suppression (recursive CTE) |
| `conditional-blocks` | true | **not enforced in the view** |
| `waits-for` | true | **not enforced in the view** |

This is a doc/code divergence — see
[../../gaps-audit.md](../../gaps-audit.md) §C1.

Practical consequence: the "unblocked" set surfaced by `bd ready` is
computed purely from open `blocks` deps plus the deferred-parent CTE.
A bead with an open `waits-for` dep WILL appear in `bd ready`.

A second predicate, `IsBlockingEdge` (`types.go:845-847`), narrows
"hard blocker" to `blocks`, `conditional-blocks`, `waits-for` —
i.e., excludes `parent-child` (structural, not blocking). `bd dep
tree` uses it (GH#3565) to decide whether the `[BLOCKED]` badge
applies to the root node.

## Cycle detection

In `AddDependencyInTx` (`internal/storage/issueops/dependencies.go:122-150`):

- Self-deps are rejected outright.
- For `blocks` and `conditional-blocks`, a recursive CTE walks
  reachable nodes from the target; if the source is reachable, the
  edge would create a cycle and is rejected.
- Depth ceiling: 100 levels.
- `waits-for` is NOT cycle-checked.
- Other dep types are not cycle-checked.

## The full catalog

### Workflow (`AffectsReadyWork = true`)

| Type | Blocks ready? | Meaning |
|---|---|---|
| `blocks` | yes (direct) | Target must close before source can progress. Default for `bd dep add`. |
| `parent-child` | indirect | Canonical parent-of relationship. Deferred parent suppresses children. |
| `conditional-blocks` | no (in view) | "B runs only if A fails." Code honors it; view doesn't. |
| `waits-for` | no (in view) | Fanout gate: "wait for all-children / any-children." `WaitsForMeta` JSON on the dep (`types.go:849-857`); gate constants at `types.go:859-863`. |

### Association (non-blocking)

| Type | Meaning |
|---|---|
| `related` | Soft link; no workflow effect. |
| `discovered-from` | "This bead was created while working on that bead." |

### Graph link (non-blocking)

| Type | Meaning |
|---|---|
| `replies-to` | Conversation thread edge. `ThreadID` grouping. |
| `relates-to` | Loose knowledge-graph link. |
| `duplicates` | "This bead duplicates that one." `bd duplicate` adds this + closes the duplicate. |
| `supersedes` | "This bead replaces that one." `bd supersede` adds this + closes the old. |

### Entity (HOP foundation — Decision 004)

| Type | Meaning |
|---|---|
| `authored-by` | Author identity edge. |
| `assigned-to` | Assignee identity edge. |
| `approved-by` | Approval edge. |
| `attests` | Skill attestation. `AttestsMeta` JSON (`types.go:884-898`). |

### Convoy / cross-project

| Type | Meaning |
|---|---|
| `tracks` | "Convoy → issue (non-blocking)." Convoy advances while tracking work. |

### Reference (non-blocking)

| Type | Meaning |
|---|---|
| `until` | "Active until target closes." E.g., mute until issue resolves. |
| `caused-by` | Post-incident causality link. |
| `validates` | Test-for-issue relationship. |

### Delegation

| Type | Meaning |
|---|---|
| `delegated-from` | "Work delegated from the parent issue." |

## Storage

`dependencies` table:

```
PK (issue_id, depends_on_id)
columns: issue_id, depends_on_id, type, created_at, created_by,
         metadata, thread_id
FK: issue_id → issues(id) ON DELETE CASCADE
```

The PK is on the pair alone — *one edge per source/target pair,
regardless of type*. Adding a conflicting type fails:

> dependency A → B already exists with type "blocks" (requested "waits-for");
> remove it first with `bd dep remove` then re-add.

Same-type re-adds are idempotent (they update metadata only).

## Cross-table

Dependency queries UNION `dependencies` and `wisp_dependencies`
(`internal/storage/issueops/dependencies.go:309, 372, 430, 463`). A wisp
can depend on a permanent issue and vice versa. The wisp side has no
FKs, so cross-table edges are unenforced at the DB level.

## Cross-prefix (external targets)

No FK on `depends_on_id`, so targets can be in another rig's database
or entirely non-bd. Two modes:

- `AddDependencyOpts.IsCrossPrefix=true` — caller declares the target
  is in another rig. Target existence is NOT validated; target table
  defaults to `issues`. Cross-type blocking validation skipped.
- `depends_on_id` starting with `external:` — escape hatch for
  non-bd targets (GitHub PRs, gh runs, etc.).

The `routes` table maps `prefix → path` so the runtime can find
another rig's `.beads/` when needed. Both mechanisms rely on
consumer code (reads / gates) to resolve across DBs.

## Edge metadata

`Dependency.Metadata` is a JSON string carrying type-specific data:

- **`waits-for`** — `WaitsForMeta{gate, spawner_id}` where `gate` is
  `all-children` (default), `any-children`, or `children-of(<step>)`.
- **`attests`** — `AttestsMeta{skill, level, date, evidence, notes}`.

`Dependency.ThreadID` groups reply chains.

## `bd dep` subcommands

| Command | Shape |
|---|---|
| `bd dep <blocker> --blocks <blocked>` | Top-level sugar; equivalent to `bd dep add <blocked> <blocker>`. |
| `bd dep add <issue> <depends-on> [--type <type>]` | Adds an edge. Default type `blocks`. |
| `bd dep remove <issue> <depends-on>` | Removes an edge. Alias: `rm`. |
| `bd dep list [issue-id...]` | Lists edges for one or more issues. |
| `bd dep tree <id>` | Walks the graph rooted at `<id>`. Non-root nodes show `[<dep-type>]` next to their parent edge (GH#3565); root shows `[READY]` or `[BLOCKED]` based on `IsBlockingEdge`. |
| `bd dep cycles` | Lists cycles (rare — only for blocks/conditional-blocks, which beads refuses to create). |

## Cross-type validation

`GH#1495` (`internal/storage/issueops/dependencies.go:106-115`): tasks
can only block tasks; epics can only block epics. Checked only when
both sides exist (i.e., not cross-prefix).

## See also

- [bead-schema.md](bead-schema.md) — `dependencies` table columns.
- [../explanation/canonical-vs-vestigial.md](../explanation/canonical-vs-vestigial.md)
  — which dep types orchestrators actually use.
