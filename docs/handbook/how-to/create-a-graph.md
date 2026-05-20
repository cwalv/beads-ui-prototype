# Create a bead graph atomically

`bd create --graph <path>` applies a JSON plan — a set of nodes
(beads) plus edges (deps) — in one Dolt commit. Used by gascity's
`molecule.Cook` to instantiate formulas atomically.

Unlike `bd create --file` (markdown), the graph format handles
explicit IDs, metadata, and external references (beads in other
databases).

## Plan format

```json
{
  "commit_message": "bd: create roadmap for Q2",
  "nodes": [
    {
      "key": "epic-sso",
      "title": "Implement SSO",
      "type": "epic",
      "priority": 1,
      "labels": ["auth", "q2"],
      "metadata": {"gc.routed_to": "foundations/worker"}
    },
    {
      "key": "task-saml",
      "title": "Parse SAML response",
      "type": "task",
      "parent_key": "epic-sso",
      "priority": 2
    },
    {
      "key": "task-session",
      "title": "Create SSO session",
      "type": "task",
      "parent_key": "epic-sso",
      "priority": 2,
      "assignee": "alice",
      "assign_after_create": true
    }
  ],
  "edges": [
    {"from_key": "task-session", "to_key": "task-saml", "type": "blocks"}
  ]
}
```

Apply:

```bash
bd create --graph plan.json
```

## Node fields

`GraphApplyNode` (`graph_apply.go`):

| Field | Required | Purpose |
|---|---|---|
| `key` | yes | Unique within plan. Symbolic name for edge refs + parent refs. |
| `title` | yes | Non-empty. |
| `type` | no | Validated against built-in types + `types.custom` config. Defaults to `task`. |
| `description` | no | |
| `priority` | no | 0-4 (pointer; `null`/omitted defaults to 2). |
| `assignee` | no | |
| `assign_after_create` | no | If true, assignee is set AFTER labels + metadata-refs + edges apply. |
| `labels` | no | Applied to created issue. |
| `metadata` | no | `map[string]string` (note: string values only, not arbitrary JSON). |
| `metadata_refs` | no | `{"meta_key": "node_key"}` — resolved to the created node's ID after creation. |
| `parent_key` | no | Reference to another node's key; creates a `parent-child` dep. |
| `parent_id` | no | Explicit external parent ID (if not in this plan). |

## Edge fields

`GraphApplyEdge` (`graph_apply.go`):

| Field | Required | Purpose |
|---|---|---|
| `from_key` or `from_id` | yes | Source: plan key OR existing-bead ID. |
| `to_key` or `to_id` | yes | Target: plan key OR existing-bead ID. |
| `type` | no | Dep type. Default `blocks`. |

There's no `metadata` field on edges in the current schema —
dependency metadata lives on the underlying `types.Dependency`
row created from the edge.

## Apply order

`executeGraphApply` in `graph_apply.go`:

1. Build `[]*types.Issue` from nodes (with assignees deferred when
   `assign_after_create` is set) and call `tx.CreateIssues` once.
2. Persist labels per node via `tx.AddLabel`.
3. Resolve `metadata_refs` now that IDs are known; rewrite each
   node's metadata via `tx.UpdateIssue`.
4. Add edges via `tx.AddDependency` (using `resolveEdgeRef`).
5. Add `parent-child` deps from `parent_key` / `parent_id`.
6. Apply deferred assignees via `tx.UpdateIssue`.

The whole sequence runs inside `store.RunInTransaction` with a
commit message of `plan.commit_message` (or
`"bd: graph-apply <N> nodes"` if unset). All-or-nothing: if any
step fails, the transaction aborts and nothing is committed.

## When to use `metadata_refs`

When a bead's metadata needs to reference another bead created in the
same plan (whose ID isn't known until create):

```json
{
  "nodes": [
    {"key": "parent", "title": "Parent"},
    {
      "key": "child",
      "title": "Child",
      "metadata_refs": {"primary_sibling": "other"}
    },
    {"key": "other", "title": "Other"}
  ]
}
```

After create, `child.metadata.primary_sibling` is set to the real ID
of `other`.

## External targets

Refer to beads not in this plan via `from_id` / `to_id` with the
existing bead's ID (no special prefix — `resolveEdgeRef` just passes
the ID through to `tx.AddDependency`):

```json
{
  "edges": [
    {"from_key": "task-local", "to_id": "bd-foreign-abc123", "type": "blocks"}
  ]
}
```

If the ID doesn't resolve at dependency-add time, the transaction
aborts.

## Programmatic generation

This is how gascity assembles a molecule (see
`internal/beads/graph_apply.go` and `internal/molecule/molecule.go`):
compile a formula into step metadata, build a plan, apply atomically.
Safer than creating steps one-by-one (no partial molecule if beads
crashes mid-way).

## See also

- [create-from-markdown.md](create-from-markdown.md) — simpler format
  for human-authored batches.
- [../reference/bd-commands.md#issue-lifecycle](../reference/bd-commands.md#issue-lifecycle)
  — `bd create` flags.
- [write-a-formula.md](write-a-formula.md) — the higher-level
  workflow abstraction that compiles to a graph.
