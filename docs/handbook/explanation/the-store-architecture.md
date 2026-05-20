# The store architecture

Where a bead lives physically, how writes commit, how many clones
coexist, and how one Dolt server serves many rigs.

## Dolt is the only backend

As of v1.0+, `metadata.json.backend` has a single supported value:
`"dolt"`. The `backend` field is marked deprecated and `GetBackend`
hard-codes a return of `BackendDolt`
(`internal/configfile/configfile.go:20, 186, 221-223`); no SQLite path
remains. All SQL goes through a local `dolt sql-server` process
managed by beads's doltserver package.

`dolt` is a MySQL-wire-compatible SQL database with commit history.
Every `CREATE TABLE`, `INSERT`, `UPDATE`, `DELETE` is a git-like
revision.

## Directory layout

For a bead project at `/path/to/project`:

```
/path/to/project/
  .beads/
    backup/                  # JSONL snapshots
    config.yaml              # User config (status.custom, dolt.*, …)
    dolt/                    # Dolt data root
      .dolt/                 # Dolt's own metadata
      .doltcfg/
      .dolt_dropped_databases/
      <prefix>/              # The named SQL database; name = issue prefix
        .dolt/
    dolt-server.port         # Port the local sql-server is listening on
    dolt-server.pid          # Server PID
    dolt-server.lock         # Start-guard flock
    dolt-server.log
    formulas/                # Per-project formulas
    hooks/                   # Mutation + git hook scripts
    interactions.jsonl       # Append-only audit log
    last-touched             # Single line: most recent touched bead ID
    metadata.json            # Storage backend + project identity
    push-state.json          # Auto-push state
    README.md                # Optional user readme
    routes.jsonl             # Orchestrator-managed cross-project routing
    .beads-credential-key    # Local key for encrypted federation passwords
    .env                     # Credentials (not committed)
    .gitignore               # Protects local-only files
    .local_version           # Clone-local bd version stamp
```

`metadata.json` is the single source of truth for:

- `backend` (always `"dolt"`).
- `dolt_mode` (`server` or legacy `embedded`).
- Server host/port overrides.
- `dolt_database` — the named SQL database. Normally equals the issue
  prefix after bd-init normalization.
- `project_id` — a stable UUID for workspace identity checks.

## The two tables

Every bead lives in one of two tables — either `issues` or `wisps`.

| Table | Dolt-committed? | When used |
|---|---|---|
| `issues` | **yes** | Normal beads. Every write becomes a `DOLT_COMMIT`. |
| `wisps` | **no** (dolt-ignored) | Ephemerals: `Ephemeral=true` or `NoHistory=true` beads. Also auto-routed infra types (`agent`, `rig`, `role`, `message`). |

The `wisps` table is registered with `dolt_ignore`
(`migrations/0019_wisps_dolt_ignore.up.sql`):

```sql
REPLACE INTO dolt_ignore VALUES ('wisps', true);
REPLACE INTO dolt_ignore VALUES ('wisp_%', true);
```

That single registration is the entire mechanism. Once a table matches
an ignored pattern, Dolt skips it in `dolt status`, `dolt commit -A`,
and fetch/push. The wisp_* pattern covers `wisp_labels`,
`wisp_dependencies`, `wisp_events`, `wisp_comments`.

Both tables share the same schema. `CreateIssue`
(`internal/storage/dolt/issues.go:19-28`) decides at create time:

```go
useWispsTable := issue.Ephemeral || issue.NoHistory ||
                 s.IsInfraTypeCtx(ctx, issue.IssueType)
if useWispsTable && !issue.NoHistory {
    issue.Ephemeral = true
}
```

A `task` with neither flag set goes to `issues`. Setting either flag,
or using an infra type, routes to `wisps`. The infra-type defaults
(`agent`, `rig`, `role`, `message`) live in
`internal/storage/infra_types.go:7`; migration 0035 backfills any
historical infra-typed rows out of `issues` into `wisps`. `molecule`
and `gate` are built-in types but are **not** infra types — they stay
in `issues` unless their `Ephemeral`/`NoHistory` flag is set.

## Ephemeral vs no_history

| Flag | Stored in | Dolt-committed? | GC-eligible? |
|---|---|---|---|
| (neither) | issues | yes | no (retained indefinitely) |
| `ephemeral=true` | wisps | no | yes (TTL via `wisp_type`) |
| `no_history=true` | wisps | no | no |

`NoHistory` is for beads you want to keep locally but never commit —
for instance, personal notes that shouldn't propagate to collaborators.
`Ephemeral` is for short-lived infrastructure beads (heartbeats, patrol
reports).

## Per-write Dolt commits

Every CRUD op on `issues` triggers a `DOLT_COMMIT`:

| Operation | Commit message | Tables |
|---|---|---|
| `CreateIssue` | `bd: create <id>` | issues, events |
| `UpdateIssue` | `bd: update <id>` | issues, events |
| `ClaimIssue` | `bd: claim <id>` | issues, events |
| `CloseIssue` | `bd: close <id>` | issues, events |
| `CreateIssues` (bulk) | `bd: create N issue(s)` | issues, events, labels, comments, dependencies, child_counters |

Tables are staged via explicit `CALL DOLT_ADD(...)` (not
`dolt add -A`) so dolt-ignored tables and unrelated dirty state don't
sneak in (GH#2455).

Wisp writes skip the commit step entirely.

## Issue ID generation

Default format: `<prefix>-<short-hash>` — e.g. `fo-7lc1i`. Base36
(0-9, a-z).

Two modes, gated on the `issue_id_mode` config key:

- **Hash mode** (default): SHA-256 of
  `title|description|creator|nanos|nonce`, first N bytes encoded
  base36.
- **Counter mode**: atomic `UPDATE issue_counter SET last_id = last_id + 1`
  per prefix; seeded from existing max. Result: `fo-1`, `fo-2`, …
  Wisps always use hash mode regardless.

**Adaptive length**: `GetAdaptiveIDLengthTx` uses the birthday paradox
to pick the shortest length with < 25% collision probability at the
current count. Defaults: min=3 chars, max=8 chars.

Hierarchical IDs: `<parent>.<n>`, max depth 3.

Prefix resolution (`internal/storage/issueops/create.go:60-79`):

1. `issue.PrefixOverride` (if set) — fully replaces.
2. `config_prefix + "-" + issue.IDPrefix` — appends (for infra types).
3. `config_prefix + "-wisp"` — for wisps.
4. `config_prefix` — default.

The config prefix lives in the `config` table under `issue_prefix`,
seeded by `bd init` from the project directory name (with
normalization).

## `.beads/redirect` — worktree sharing

Multiple worktrees of the same repo can point at a single `.beads/`
via redirect files. A `.beads/redirect` contains a path; when beads's
discovery walks into a worktree, it follows the redirect to the
canonical location.

Used heavily by gastown: polecats / refinery / crew worktrees all
redirect to the rig's central `.beads/`.

- `FollowRedirect` (`internal/beads/beads.go:103-158`) resolves
  paths, rejects cycles, and preserves the database name across
  redirects.
- Single-level only — chains are not followed.
- Worktree-aware canonicalization prefers a stable branch worktree
  over a detached-commit one.

The redirect has no effect on Dolt itself — it's purely a discovery
shortcut. All agents that resolve to the same `.beads/` share the
same SQL database.

## `dolt sql-server` lifecycle

Beads manages the local SQL server process. `EnsureRunning`
(`internal/doltserver/doltserver.go:564-619`) handles start,
health-check, restart.

Key files:

- `dolt-server.port` — listening port (OS-ephemeral by default).
- `dolt-server.pid` — server PID.
- `dolt-server.lock` — advisory flock; prevents double-start.
- `dolt-server.log` — server's own stdout/stderr.

Port resolution priority (`doltserver.go:425-489`):
env var → port file → `config.yaml` → `metadata.json` → ephemeral.
The port file is authoritative once the server is running.

### Shared-server mode

`BEADS_DOLT_SHARED_SERVER=1` (or `dolt.shared-server: true`) points
all projects on the machine at one server in `~/.beads/shared-server/`,
each with its own named database. Default port: 3308.

A special database `beads_global` is created in shared mode for
project-agnostic queries — `--global` uses it.

## Cross-prefix dependencies

`dependencies.depends_on_id` is NOT a foreign key. The source
(`issue_id`) has an FK to `issues(id)`, but the target is free. This
is what enables **cross-prefix references**.

- `AddDependencyOpts.IsCrossPrefix=true` — caller declares target is
  in another rig; skip target validation.
- `depends_on_id` starting with `external:` — escape hatch for
  non-bd references (GitHub PRs, gh runs, etc.).

The `routes` table maps `prefix → path` so the runtime can find
another rig's `.beads/` when it needs to resolve a cross-prefix
reference.

## Migration system

SQL-only. Migrations live at
`internal/storage/schema/migrations/NNNN_*.up.sql` (39 up files as of
the current tip, numbered through 0039). Files are embedded at build
time; `MigrateUp` (`internal/storage/schema/schema.go:109-131`) reads
`schema_migrations` for the current version and applies any pending
`.up.sql` files in numeric order. Data migrations that need control
flow (existence checks, conditional ALTERs) inline the logic with
`SET @needs_migration = ...` + `PREPARE/EXECUTE` guards in SQL — see
0037 (UUID PKs) and 0038 (HOP column drops) for the pattern.

Highlights to know:

- **0019** registers `wisps` / `wisp_%` in `dolt_ignore`.
- **0030** moves clone-local keys (tip timestamps, `bd_version*`,
  tracker `*.last_sync`) out of the committed `metadata` / `config`
  tables into the dolt-ignored `local_metadata` table.
- **0035** moves any existing `agent` / `rig` / `role` / `message`
  rows from `issues` to `wisps` (matching `CreateIssue`'s runtime
  routing for new rows).
- **0037** converts auxiliary tables (`events`, `comments`,
  `issue_snapshots`, `compaction_snapshots`, `wisp_events`,
  `wisp_comments`) from `BIGINT AUTO_INCREMENT` to `CHAR(36)` UUIDs.
  `issues.id` is **not** touched — it remains the base36 hash from
  `internal/idgen/hash.go`.
- **0038** drops the legacy HOP-only columns (`quality_score`,
  `crystallizes`) from `issues` and `wisps` if present.

## Versioning: what Dolt gives you

Because every issues-table write is a commit, beads inherits:

- **`dolt log`** — see the history of every bead change.
- **`dolt diff`** — see what changed between two points in time.
- **`dolt branch` / `dolt merge`** — try an experiment on a branch,
  merge or abandon it.
- **`bd flatten`** — squash all history to one commit (IRREVERSIBLE).
- **`bd compact --dolt`** — squash old commits; cherry-pick recent
  on top.

Wisps are NOT in this history — they're whatever the working set
happens to contain.

## Context validation

On every write-capable command, beads checks `.beads/metadata.json`'s
`project_id` against the database's `_project_id` metadata. Mismatch
is fatal. Prevents a command run in workdir A from writing to the DB
of workdir B if a redirect goes wrong.

Escape hatch: `BEADS_SKIP_IDENTITY_CHECK=1`.

## See also

- [../reference/bead-schema.md](../reference/bead-schema.md) — table
  columns.
- [the-pour-pipeline.md](the-pour-pipeline.md) — how formulas become
  beads in the store.
- [../../gaps-audit.md](../../gaps-audit.md) §C7, §C8, §C9, §C10 —
  vestigial schema and migration oddities.
