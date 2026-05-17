# JSON output shapes

All `--json` output is emitted through helpers in
`github/gastownhall/beads/cmd/bd/output.go`. Errors in JSON mode use
`cmd/bd/errors.go` and emit:

```json
{"error": "...", "hint": "..."}
```

Fields are `encoding/json.Marshal`'d from typed structs with `omitempty`
where declared.

## `bd show --json`

Args: one or more issue IDs. Output: **JSON array** of issue-detail
objects, even for a single ID.

Implementation: `cmd/bd/show.go`. The emitted struct embeds
`types.Issue` (see [bead-schema.md](bead-schema.md) for the full field
list) and adds labels, dependencies, dependents, comments, and epic
child counts when applicable.

Example (constructed from the struct):

```json
[
  {
    "id": "bd-abc123",
    "title": "Fix authentication bug",
    "description": "Users cannot log in with SSO",
    "status": "open",
    "priority": 1,
    "issue_type": "bug",
    "assignee": "alice",
    "created_at": "2026-03-15T10:30:00Z",
    "updated_at": "2026-04-20T14:22:15Z",
    "labels": ["backend", "auth"],
    "dependencies": [
      {"id":"bd-xyz789","title":"JWT validation","dependency_type":"blocks","status":"in_progress"}
    ],
    "dependents": [
      {"id":"bd-def456","title":"Update auth docs","dependency_type":"blocks","status":"blocked"}
    ],
    "comments": [
      {"id":"cmt-001","issue_id":"bd-abc123","author":"bob","text":"Started","created_at":"2026-04-15T09:00:00Z"}
    ],
    "parent": "bd-epic-001",
    "epic_total_children": 5,
    "epic_closed_children": 2,
    "epic_closeable": false
  }
]
```

Epic fields only on `issue_type=="epic"`. Comments emitted only if any
exist.

## `bd list --json`

Array of `IssueWithCounts`. Implementation: `cmd/bd/list.go`.

Core fields (always emitted unless noted):

| Field | Type | Emission |
|---|---|---|
| `id` | string | always |
| `title` | string | always |
| `description` | string | omitempty |
| `design` | string | omitempty |
| `acceptance_criteria` | string | omitempty |
| `notes` | string | omitempty |
| `spec_id` | string | omitempty |
| `status` | string | usually |
| `priority` | int | **always** (zero = P0) |
| `issue_type` | string | omitempty |
| `assignee` | string | omitempty |
| `owner` | string | omitempty |
| `estimated_minutes` | int | omitempty |
| `created_at` | RFC3339 | always |
| `created_by` | string | omitempty |
| `updated_at` | RFC3339 | always |
| `started_at` | RFC3339 | omitempty |
| `closed_at` | RFC3339 | omitempty |
| `close_reason` | string | omitempty |
| `closed_by_session` | string | omitempty |
| `due_at` | RFC3339 | omitempty |
| `defer_until` | RFC3339 | omitempty |
| `external_ref` | string | omitempty |
| `source_system` | string | omitempty |
| `metadata` | object | omitempty |
| `compaction_level` | int | omitempty |
| `compacted_at` | RFC3339 | omitempty |
| `compacted_at_commit` | string | omitempty |
| `original_size` | int | omitempty |
| `labels` | []string | omitempty |
| `dependencies` | []Dependency | omitempty |
| `comments` | []Comment | omitempty |
| `sender` | string | omitempty (mail) |
| `ephemeral` | bool | omitempty |
| `no_history` | bool | omitempty |
| `wisp_type` | string | omitempty |
| `pinned` | bool | omitempty |
| `is_template` | bool | omitempty |
| `bonded_from` | []... | omitempty (compounds) |
| `await_type` | string | omitempty (gates) |
| `await_id` | string | omitempty |
| `timeout` | duration | omitempty |
| `waiters` | []string | omitempty |
| `source_formula` | string | omitempty |
| `source_location` | string | omitempty |

`IssueWithCounts` adds:

| Field | Emission |
|---|---|
| `dependency_count` | always |
| `dependent_count` | always |
| `comment_count` | always |
| `parent` | omitempty |

## `bd ready --json`

Same shape as `bd list --json`: array of `IssueWithCounts`. Always an
array (empty becomes `[]`). `parent` computed from `parent-child` dep
records.

`bd ready --mol <mol-id> --json` — molecule-ready mode, different
shape (see §mol below).

`bd ready --explain --json` — `ReadyExplanation`:

```json
{
  "ready": [...],
  "blocked": [...],
  "cycles": [
    {"cycle": [{"id":"bd-a","title":"..."}, {"id":"bd-b","title":"..."}]}
  ],
  "summary": {"ready_count": 5, "blocked_count": 2, "cycle_count": 0}
}
```

## `bd search --json`

Same shape as `bd list --json`: array of `IssueWithCounts`.

## `bd create --json`

Single issue object (not an array).

## `bd update --json`

**Array** of updated Issue objects (supports batch update).

## `bd close --json`

Shape depends on flags:

| Flag | Output |
|---|---|
| none | `[{...}, {...}]` — array of closed Issue objects. |
| `--suggest-next` | `{"closed": [...], "unblocked": [...]}` |
| `--continue` | `{"closed": [...], "continue": {"root_id": "...", "next_step_id": "...", "step_index": N, "total_steps": N}}` |
| `--claim-next` | `{"closed": [...], "claimed": {...}}` |

`--reason "..."` populates `close_reason`.

## `bd count --json`

Plain: `{"count": 42}`.

With `--by-status` / `--by-type` / `--by-assignee`:

```json
{
  "total": 42,
  "groups": [
    {"group": "open", "count": 30},
    {"group": "in_progress", "count": 12}
  ]
}
```

## `bd dep <sub> --json`

| Subcommand | Output |
|---|---|
| `dep add` | `{"status": "added", "issue_id": "...", "depends_on_id": "...", "type": "blocks"}` |
| `dep rm` | `{"status": "removed", "issue_id": "...", "depends_on_id": "..."}` |
| `dep tree` | nested Issue object with recursively-populated `dependencies` |
| `dep cycles` | `[{"cycle": [{"id":"...","title":"..."}, ...]}]` — first id repeated at end to close the loop |

## `bd graph --json`

```json
{
  "root": {"id": "bd-abc123", "title": "..."},
  "issues": [ ... ],
  "layout": {
    "nodes": {
      "bd-abc123": {"issue": {...}, "layer": 0, "position": 0, "depends_on": []}
    },
    "layers": [["bd-abc123"]],
    "max_layer": 3,
    "root_id": "bd-abc123"
  }
}
```

Alt formats (not JSON): `--dot`, `--compact`, `--box`, `--html`.

## `bd context --json`

`ContextInfo` struct (`cmd/bd/context_cmd.go:14-31`). No DB read — goes
straight to `.beads/metadata.json`.

```json
{
  "beads_dir": "/path/.beads",
  "repo_root": "/path",
  "cwd_repo_root": "/path",
  "is_redirected": false,
  "is_worktree": false,
  "backend": "dolt",
  "dolt_mode": "server",
  "server_host": "127.0.0.1",
  "server_port": 3308,
  "database": "fo",
  "data_dir": "/path/.beads/dolt",
  "project_id": "abc-123",
  "sync_remote": "dolthub://…",
  "role": "maintainer",
  "bd_version": "1.0.0"
}
```

## `bd doctor --json`

```json
{
  "path": "/path/.beads",
  "checks": [
    {"name": "database_exists", "status": "ok", "message": "..."},
    {"name": "schema_version", "status": "ok", "message": "...", "detail": "...", "fix": "...", "category": "database"}
  ],
  "overall_ok": true,
  "cli_version": "1.0.0",
  "timestamp": "2026-04-23T15:00:00Z",
  "platform": {"os": "linux", "arch": "amd64"},
  "suppressed_count": 0
}
```

Per-check `status` is `ok`, `warning`, or `error`. `detail`, `fix`,
`category` are optional.

## `bd config show --json`

Array of entries with provenance:

```json
[
  {"key": "create.require-description", "value": "true", "source": "config.yaml"},
  {"key": "validation.on-close", "value": "warn", "source": "env: BD_VALIDATION_ON_CLOSE"}
]
```

`source` values: `default`, `env: <VAR>`, `config.yaml`, `metadata`,
`database`, `git`.

## Memory (`bd remember/memories/recall/forget --json`)

| Cmd | Output |
|---|---|
| `remember` | `{"key": "...", "value": "...", "action": "remembered"\|"updated"}` |
| `memories [search]` | `{"key1": "value1", "key2": "value2", ...}` — plain map |
| `recall <key>` | `{"key": "...", "value": "...", "found": true\|false}` |
| `forget <key>` | `{"key": "...", "deleted": "true"}` on success, or `{"key": "...", "found": "false"}` + exit 1 |

## `bd duplicates --json`

```json
{
  "duplicate_groups": 2,
  "groups": [
    {
      "issues": [{"id":"bd-a","is_merge_target":true}, {"id":"bd-b"}],
      "target": "bd-a",
      "suggested_action": "bd close bd-b && bd dep add bd-b bd-a --type related"
    }
  ],
  "merge_commands": ["..."]
}
```

## `bd export --format=json`

`bd export` defaults to JSONL (one Issue per line). Memory lines use
shape `{"_type": "memory", "key": "...", "value": "..."}`. Whether
`--format=json` emits a single aggregated array vs JSONL is not
verified from source — treat JSONL as the contract.

## Formula / molecule JSON

- `bd formula list --json` — array of `{name, type, description, source, steps, vars}`.
- `bd formula show --json` — full `Formula` struct
  (`internal/formula/types.go`; see [formula-schema.md](formula-schema.md)).
- `bd mol current --json` — "you are here" with step states
  `done`/`current`/`ready`/`blocked`.
- `bd mol progress --json` — `{molecule_id, molecule_title, total, completed, in_progress, current_step_id, percent, rate_per_hour, eta_hours}`.
- `bd mol show --json` — `{root, issues, dependencies, variables, is_compound, bonded_from}`.
- `bd mol last-activity --json` — `{molecule_id, last_activity, source, source_step_id}`.

## No `--json` support

- `bd mail` — delegates; output is whatever the provider returns.
- `bd human` — human-facing escalation text.

## Batch / graph ingestion (input, not output)

`bd create --file <markdown>` format:

```markdown
## Issue Title
Optional description before any section headers...

### Priority
2

### Type
feature

### Description
Detailed description...

### Design
...

### Acceptance Criteria
- ...

### Assignee
username

### Labels
label1, label2

### Dependencies
bd-10, bd-20
```

Sections recognized (markdown.go:68-102): `priority`, `type`, `description`,
`design`, `acceptance criteria`/`acceptance`, `assignee`, `labels`,
`dependencies`/`deps`. Order is arbitrary; body before first `###`
becomes description.

Dependency entries:

```
bd-10                          # defaults to blocks
bd-10, bd-20                   # multiple, all blocks
blocks:bd-10, related:bd-20    # explicit type per entry
```

`bd create --graph <plan>` JSON:

```json
{
  "commit_message": "optional",
  "nodes": [
    {
      "key": "node-1",
      "title": "...",
      "type": "task",
      "description": "...",
      "priority": 2,
      "labels": ["..."],
      "metadata": {...},
      "metadata_refs": {"other": "node-2"},
      "parent_key": "node-parent",
      "assign_after_create": false
    }
  ],
  "edges": [
    {"from_key": "node-1", "to_key": "node-2", "type": "blocks"}
  ]
}
```

`from_key`/`to_key` can be replaced with `from_id`/`to_id` for external
targets. `type` defaults to `blocks`.

## See also

- [bd-commands.md](bd-commands.md) — command catalog.
- [hook-protocol.md](hook-protocol.md) — hook-invocation JSON.
- [../explanation/the-store-architecture.md](../explanation/the-store-architecture.md)
  — where the JSON comes from.
