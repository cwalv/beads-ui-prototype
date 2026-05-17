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

`PlanNode` (`graph_apply.go:22-36`):

| Field | Required | Purpose |
|---|---|---|
| `key` | yes | Unique within plan. Symbolic name for edge refs + parent refs. |
| `title` | yes | ≤ 500 chars. |
| `type` | no | Defaults to `task`. |
| `description` | no | |
| `priority` | no | 0-4. Default 2 when omitted. |
| `assignee` | no | |
| `assign_after_create` | no | If true, assignee is set AFTER deps/labels apply. |
| `labels` | no | Applied to created issue. |
| `metadata` | no | Arbitrary JSON. |
| `metadata_refs` | no | `{"key": "node-id"}` — resolved after node creation. |
| `parent_key` | no | Reference to another node's key; creates `parent-child` dep. |
| `parent_id` | no | Explicit external parent ID (if not in this plan). |

## Edge fields

`PlanEdge` (`graph_apply.go:38-45`):

| Field | Required | Purpose |
|---|---|---|
| `from_key` or `from_id` | yes | Source: plan key OR external ID. |
| `to_key` or `to_id` | yes | Target: plan key OR external ID. |
| `type` | no | Dep type. Default `blocks`. |
| `metadata` | no | Edge metadata JSON. |

## Apply order

`graph_apply.go:175-324`:

1. Create all issues via `store.CreateIssues()`.
2. Add labels for each node.
3. Resolve `metadata_refs` now that IDs are known.
4. Add edges (plan + parent-child).
5. Assign deferred assignees.
6. Single Dolt commit.

All-or-nothing: if any step fails, the whole commit aborts.

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

Refer to beads not in this plan:

```json
{
  "edges": [
    {"from_key": "task-local", "to_id": "bd-foreign-abc123", "type": "blocks"},
    {"from_id": "external:gh-run-5678", "to_key": "task-local", "type": "blocks"}
  ]
}
```

`external:` prefix is the escape hatch for non-bd targets.

## Dry run

Validates the plan without creating:

```bash
bd create --graph plan.json --dry-run
```

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
