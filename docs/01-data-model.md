# 01 — Beads data model

Authoritative reference for what a "bead" is at the data layer, grounded in
the `beads` repo source. Citations use workspace-relative paths
(`github/gastownhall/beads/...:line`). Read sections in order; later sections
build on earlier ones.

## 1. Overview

A bead is a row in either the `issues` table or the `wisps` table. Both
tables share the same column set; they differ in whether their writes go
into Dolt's commit history. The `issues` table is committed; the `wisps`
table is registered with Dolt's `dolt_ignore` system so writes are kept in
the working set and never become commits
(`github/gastownhall/beads/internal/storage/schema/migrations/0019_wisps_dolt_ignore.up.sql:1-2`).

The storage backend is always Dolt — there is no SQLite path anymore. The
single supported value of `backend` in `metadata.json` is `"dolt"`
(`github/gastownhall/beads/internal/configfile/configfile.go:175`,
`github/gastownhall/beads/internal/configfile/configfile.go:212-214`). All
Dolt access is server-mediated through a local `dolt sql-server` process
(see §7).

The Go type that travels through the API is
`github/gastownhall/beads/internal/types/types.go:16` (`type Issue struct`).
The on-disk SQL schema lives under
`github/gastownhall/beads/internal/storage/schema/migrations/`. The two
diverge on a small set of columns — see §17.

## 2. Schema — the `issues` table

Everything below traces to
`github/gastownhall/beads/internal/storage/schema/migrations/0001_create_issues.up.sql:1-60`
unless otherwise noted. Columns added by later migrations are flagged with
their migration number.

### 2.1 Identification

| Column | Type | Notes |
|---|---|---|
| `id` | `VARCHAR(255)` PK | Issue ID, e.g. `fo-7lc1i` (§4) |
| `content_hash` | `VARCHAR(64)` | SHA-256 of the canonical content fields, recomputed on every write (`internal/types/types.go:118-171`) |

`content_hash` is computed in Go before insert and is not maintained by the
DB; the column is used for change detection and not enforced as unique
(`internal/storage/issueops/create.go:158-160`). It is excluded from JSON
output (`internal/types/types.go:19`).

### 2.2 Body / content

| Column | Type | Default | Field on Issue |
|---|---|---|---|
| `title` | `VARCHAR(500)` NOT NULL | — | `Title` |
| `description` | `TEXT` NOT NULL | `''` | `Description` |
| `design` | `TEXT` NOT NULL | `''` | `Design` |
| `acceptance_criteria` | `TEXT` NOT NULL | `''` | `AcceptanceCriteria` |
| `notes` | `TEXT` NOT NULL | `''` | `Notes` |
| `spec_id` | `VARCHAR(1024)` | `NULL` | `SpecID` |

Title is bounded to 500 chars in code
(`internal/types/types.go:225-227`). The other text fields have no length
ceiling beyond MySQL `TEXT`. `spec_id` is an arbitrary external reference
key with its own index (`migrations/0001_create_issues.up.sql:58`).

Required-section linting (a UI-side concern) is keyed off
`IssueType.RequiredSections()` in `internal/types/types.go:613-643`, which
returns expected H2 headings (`## Steps to Reproduce`,
`## Acceptance Criteria`, etc.) but does not parse the description.

### 2.3 Workflow

| Column | Type | Default | Field |
|---|---|---|---|
| `status` | `VARCHAR(32)` NOT NULL | `'open'` | `Status` |
| `priority` | `INT` NOT NULL | `2` | `Priority` |
| `issue_type` | `VARCHAR(32)` NOT NULL | `'task'` | `IssueType` |

Defaults are also enforced in Go via `Issue.SetDefaults()`
(`internal/types/types.go:309-320`). Note the comment there: "priority 0
(P0) is a valid value, so we can't distinguish between 'explicitly set to
0' and 'omitted'" — `SetDefaults` does NOT default priority. The default
`2` only applies through the SQL `DEFAULT` clause.

### 2.4 Assignment

| Column | Type | Default | Field |
|---|---|---|---|
| `assignee` | `VARCHAR(255)` | `NULL` | `Assignee` |
| `owner` | `VARCHAR(255)` | `''` | `Owner` |
| `estimated_minutes` | `INT` | `NULL` | `EstimatedMinutes` |

`Owner` is documented as "Human owner for CV attribution (git author
email)" in `internal/types/types.go:36`. There is no enforcement that the
owner be a real account.

### 2.5 Timestamps

| Column | Type | Field | Notes |
|---|---|---|---|
| `created_at` | `DATETIME` NOT NULL | `CreatedAt` | DB default `CURRENT_TIMESTAMP` |
| `created_by` | `VARCHAR(255)` | `CreatedBy` | Free-form |
| `updated_at` | `DATETIME` NOT NULL | `UpdatedAt` | DB-managed `ON UPDATE CURRENT_TIMESTAMP` |
| `started_at` | `DATETIME` | `StartedAt` | Added in migration `0027` |
| `closed_at` | `DATETIME` | `ClosedAt` | Set/cleared via Go invariant |
| `close_reason` | `TEXT` | `CloseReason` | Free-form |
| `closed_by_session` | `VARCHAR(255)` | `ClosedBySession` | "Claude Code session that closed this issue" (`internal/types/types.go:46`) |

`closed_at` is enforced by a Go invariant in
`internal/types/types.go:240-246`: it must be set iff `status == 'closed'`.
Close paths back-fill it if missing
(`internal/storage/issueops/create.go:146-153`). The DB schema does not
enforce this with a CHECK constraint.

`updated_at` is managed by both the SQL `ON UPDATE` clause and explicit
writes in code (e.g. `applyUpdatesToIssueStruct` in
`internal/storage/dolt/ephemeral_routing.go:362-363`).

### 2.6 Time-based scheduling

Added in `migrations/0001_create_issues.up.sql:51-52` (live schema; the GH
issue referenced in code is `GH#820`):

| Column | Field | Behavior |
|---|---|---|
| `due_at` | `DueAt` | Free-form; `bd list --overdue` filters where `due_at < NOW()` and not closed |
| `defer_until` | `DeferUntil` | Hides issue from `ready_issues` view until time passes (`migrations/0017_create_ready_issues_view.up.sql:29`) |

The `ready_issues` view in `migrations/0025_update_ready_issues_view.up.sql:32-39`
also walks `parent-child` deps and excludes children whose parent is
deferred — a deferred parent suppresses its subtree until released.

### 2.7 External integration

| Column | Type | Field | Notes |
|---|---|---|---|
| `external_ref` | `VARCHAR(255)` | `ExternalRef` | "gh-9", "jira-ABC" (`internal/types/types.go:53`) |
| `source_system` | `VARCHAR(255)` | `SourceSystem` | "Adapter/system that created this issue (federation)" (`internal/types/types.go:54`) |

`external_ref` has a dedicated index
(`migrations/0001_create_issues.up.sql:59`) for `GetIssueByExternalRef`
lookups (`internal/storage/dolt/issues.go:115-126`).

### 2.8 Custom metadata

| Column | Type | Field |
|---|---|---|
| `metadata` | `JSON` (default `JSON_OBJECT()`) | `Metadata json.RawMessage` |

Validated as well-formed JSON in
`internal/types/types.go:248-252`. Optionally schema-validated against
configured field types in
`internal/storage/metadata.go:77-206` (modes: `none`/`warn`/`error`). See
§12.

### 2.9 Compaction metadata

Set by the AI summarization compactor (§15):

| Column | Type | Field |
|---|---|---|
| `compaction_level` | `INT` | `CompactionLevel` |
| `compacted_at` | `DATETIME` | `CompactedAt` |
| `compacted_at_commit` | `VARCHAR(64)` | `CompactedAtCommit` (Git commit hash at compaction time) |
| `original_size` | `INT` | `OriginalSize` (bytes before compaction) |

### 2.10 Multi-repo / federation routing

| Column | Type | Field | JSON | Notes |
|---|---|---|---|---|
| `source_repo` | `VARCHAR(512)` | `SourceRepo` | `-` (not exported) | "Which repo owns this issue (multi-repo support)" (`internal/types/types.go:68`) |
| `IDPrefix` | (Go-only) | — | `-` | Per-issue prefix appended to config prefix |
| `PrefixOverride` | (Go-only) | — | `-` | Wholly replaces config prefix |

`IDPrefix` and `PrefixOverride` are control fields used at create time
only — they have no column and are not persisted. They drive ID generation
in `internal/storage/issueops/create.go:62-69`.

### 2.11 Messaging / ephemerality

| Column | Type | Default | Field | Migration |
|---|---|---|---|---|
| `sender` | `VARCHAR(255)` | `''` | `Sender` | 0001 |
| `ephemeral` | `TINYINT(1)` | `0` | `Ephemeral` | 0001 |
| `no_history` | `TINYINT(1)` | `0` | `NoHistory` | 0023 |
| `wisp_type` | `VARCHAR(32)` | `''` | `WispType` | 0001 |

`Ephemeral` and `NoHistory` are mutually exclusive
(`internal/types/types.go:254-256`). `Ephemeral` means "store in wisps
table, do not Dolt-commit"; `NoHistory` means "store in wisps table, do not
Dolt-commit, but is not GC-eligible by TTL". See §16 for the routing
matrix.

`WispType` is one of the constants in
`internal/types/types.go:668-681` and selects a TTL band — heartbeat/ping
(6h), patrol/gc_report (24h), recovery/error/escalation (7d). The TTL
itself is not stored; it's policy applied by an external compactor
referenced as "WISP-COMPACTION-POLICY.md" (`internal/types/types.go:667`).

### 2.12 Context markers

| Column | Type | Default | Field |
|---|---|---|---|
| `pinned` | `TINYINT(1)` | `0` | `Pinned` (the bool) |
| `is_template` | `TINYINT(1)` | `0` | `IsTemplate` |

The boolean `pinned` (column) is *separate from* the status `'pinned'`
(value of `status`). The status `'pinned'` causes the `ready_issues` view
to skip an issue as if it were closed
(`migrations/0017_create_ready_issues_view.up.sql:10`,
`migrations/0026_update_blocked_issues_view.up.sql:12`). The boolean
`pinned` column is documented as "Persistent context marker, not a work
item" (`internal/types/types.go:86`) but is not consulted by any built-in
view in the schema migrations.

### 2.13 Gate fields (async coordination)

| Column | Type | Default | Field |
|---|---|---|---|
| `await_type` | `VARCHAR(32)` | `''` | `AwaitType` |
| `await_id` | `VARCHAR(255)` | `''` | `AwaitID` |
| `timeout_ns` | `BIGINT` | `0` | `Timeout time.Duration` |
| `waiters` | `TEXT` | `''` | `Waiters []string` (mail addresses) |

These columns exist for async coordination primitives (see
`internal/types/types.go:92-96`). `await_type` examples in code:
`gh:run`, `gh:pr`, `timer`, `human`, `mail`. The bead concepts using these
fields (gates, waits-for, etc.) are first-class deps too — see §6.

### 2.14 Molecule / work classification

| Column | Type | Default | Field |
|---|---|---|---|
| `mol_type` | `VARCHAR(32)` | `''` | `MolType` |
| `work_type` | `VARCHAR(32)` | `'mutex'` | `WorkType` |

`mol_type` is one of `swarm`, `patrol`, `work`, or empty (defaults to
work) (`internal/types/types.go:649-652`). `work_type` is one of `mutex`
or `open_competition` — "One worker, exclusive assignment" vs "Many
submit, buyer picks" (`internal/types/types.go:697-700`). Empty defaults
to mutex.

### 2.15 Event fields (operational state changes)

| Column | Type | Default | Field |
|---|---|---|---|
| `event_kind` | `VARCHAR(32)` | `''` | `EventKind` |
| `actor` | `VARCHAR(255)` | `''` | `Actor` |
| `target` | `VARCHAR(255)` | `''` | `Target` |
| `payload` | `TEXT` | `''` | `Payload` (JSON string) |

These are used by issues with `issue_type = 'event'` (the system-internal
type — `internal/types/types.go:541`). They duplicate names with the
separate `events` table (§3.4); the event-bead pattern is used as audit
trail and the `events` table is for per-issue change history.

### 2.16 Indexes on `issues`

From `migrations/0001_create_issues.up.sql:53-59`:

- `idx_issues_status (status)`
- `idx_issues_priority (priority)`
- `idx_issues_issue_type (issue_type)`
- `idx_issues_assignee (assignee)`
- `idx_issues_created_at (created_at)`
- `idx_issues_spec_id (spec_id)`
- `idx_issues_external_ref (external_ref)`

## 3. Auxiliary tables

### 3.1 `dependencies`

`migrations/0002_create_dependencies.up.sql:1-15`:

```
PRIMARY KEY (issue_id, depends_on_id)
columns: issue_id, depends_on_id, type, created_at, created_by, metadata, thread_id
indexes: issue, depends_on, (depends_on, type), thread_id
FK: issue_id -> issues(id) ON DELETE CASCADE
```

The FK only constrains the source side. The target (`depends_on_id`) is
NOT a foreign key — this is intentional, to allow cross-prefix references
(§9). `type` defaults to `'blocks'`. `metadata` is a JSON blob carrying
edge-specific data (see `WaitsForMeta`, `AttestsMeta` in
`internal/types/types.go:830-878`).

### 3.2 `labels`

`migrations/0003_create_labels.up.sql:1-7`:

```
PRIMARY KEY (issue_id, label)
columns: issue_id, label
index: idx_labels_label (label)
FK: issue_id -> issues(id) ON DELETE CASCADE
```

Free-form strings; no canonical list. There is no inheritance machinery in
the schema.

### 3.3 `comments`

`migrations/0004_create_comments.up.sql:1-10`:

```
PRIMARY KEY id (CHAR(36) UUID)
columns: id, issue_id, author, text, created_at
indexes: issue, created_at
FK: issue_id -> issues(id) ON DELETE CASCADE
```

The Go `Comment` type
(`internal/types/types.go:919-925`) carries a backward-compat
`UnmarshalJSON` that accepts both string and integer `id` (pre-v1.0
exported `id` as int64 — `internal/types/types.go:927-952`).

### 3.4 `events`

`migrations/0005_create_events.up.sql:1-13`:

```
PRIMARY KEY id (CHAR(36) UUID)
columns: id, issue_id, event_type, actor, old_value, new_value, comment, created_at
indexes: issue, created_at
FK: issue_id -> issues(id) ON DELETE CASCADE
```

Event types come from `internal/types/types.go:970-982` (created, updated,
status_changed, commented, closed, reopened, dependency_added,
dependency_removed, label_added, label_removed, compacted).

### 3.5 Key-value tables

- **`config`**
  (`migrations/0006_create_config.up.sql`) — `(key VARCHAR(255) PK, value
  TEXT)`. User-facing settings: `issue_prefix`, `status.custom`,
  `types.custom`, `issue_id_mode`, `compaction_*` tunables (seeded by
  `migrations/0016_default_config.up.sql:1-10`), `dolt.*`, etc.
- **`metadata`** (`migrations/0007_create_metadata.up.sql`) — same
  shape; internal state (`_project_id`, etc.). Committed; not
  dolt-ignored.
- **`local_metadata`** — same shape, but dolt-ignored
  (`migrations/0028_local_state_dolt_ignore.up.sql:1-41`,
  `migrations/0029_create_local_metadata.up.sql:7-10`). Stores
  per-clone state: tip timestamps, version stamps, tracker sync
  cursors. The `Storage` contract is "Data is ephemeral — callers
  must handle ('', nil) as the normal case"
  (`internal/storage/storage.go:90-91`).
  `migrations/0030_migrate_local_metadata_keys.up.sql:1-28` migrates
  `tip_*`, `bd_version*`, `*.last_sync` keys out of `metadata` and
  `config` into `local_metadata`.
- **`repo_mtimes`** — also dolt-ignored. Mtime cache for JSONL repo
  scanners.

### 3.6 Counter and snapshot tables

- **`child_counters`**
  (`migrations/0008_create_child_counters.up.sql:1-6`) —
  `(parent_id PK, last_child INT)`. FK to `issues(id)` ON DELETE
  CASCADE. Per-parent counter for hierarchical IDs (§13);
  `GetNextChildIDTx`
  (`internal/storage/issueops/child_id.go:15-64`) reconciles with
  existing children (GH#2166) before incrementing.
- **`issue_counter`**
  (`migrations/0013_create_issue_counter.up.sql:1-4`) —
  `(prefix PK, last_id INT)`. Drives counter-mode ID generation (§4.3).
- **`issue_snapshots`**
  (`migrations/0009_create_issue_snapshots.up.sql:1-13`) — pre-compaction
  text content and archived events. Cascades on issue delete.
- **`compaction_snapshots`**
  (`migrations/0010_create_compaction_snapshots.up.sql:1-9`) — pre-
  compaction issue state as JSON BLOB. Cascades.

### 3.7 Action log and routing

- **`interactions`**
  (`migrations/0014_create_interactions.up.sql:1-21`) — generic action
  log (LLM calls, tool calls, labeling). `id VARCHAR(32)` (not UUID);
  `extra JSON`. The on-disk `.beads/interactions.jsonl` (§7.1) is a
  parallel file; `internal/audit/audit.go:82-129` writes only to the
  JSONL, so the table is either populated elsewhere or currently
  unused (no writer found).
- **`routes`**
  (`migrations/0012_create_routes.up.sql:1-6`) — `(prefix PK, path,
  created_at, updated_at)`. Cross-project routing (prefix → path).
  Parallel to the orchestrator-managed `.beads/routes.jsonl`, which
  bd treats as a sentinel for "orchestrator workspace"
  (`cmd/bd/doctor_gastown_guard.go:21-29`).
- **`federation_peers`**
  (`migrations/0015_create_federation_peers.up.sql:1-11`) — Dolt
  remote mirrors. `password_encrypted BLOB`, `sovereignty VARCHAR(8)`.
  Used by `FederationStore` (`internal/storage/federation.go:6-10`).

### 3.8 Custom-status / type tables

`migrations/0024_create_custom_status_type_tables.up.sql:1-8`:
`custom_statuses(name PK, category VARCHAR(32) DEFAULT 'unspecified')`,
`custom_types(name PK)`. Both views read these:
`ready_issues` filters `category='active'`
(`migrations/0025_update_ready_issues_view.up.sql:28`); `blocked_issues`
excludes `category IN ('done', 'frozen')`
(`migrations/0026_update_blocked_issues_view.up.sql:2-4`).

### 3.9 `wisps` and the `wisp_*` family

`migrations/0020_create_wisps.up.sql:1-60` mirrors the `issues` schema
exactly. `wisp_labels`, `wisp_dependencies`, `wisp_events`, `wisp_comments`
mirror their non-wisp counterparts
(`migrations/0021_create_wisp_auxiliary.up.sql:1-39`), with these
differences:

- Wisp aux tables have NO foreign keys (so wisps can reference each other
  freely without FK constraints).
- `idx_wisp_dep_type` and `idx_wisp_dep_type_depends`
  (`migrations/0022_wisp_dep_type_index.up.sql:1-2`) are added to support
  wisp-side dependency queries.

The wisps tables are dolt-ignored
(`migrations/0019_wisps_dolt_ignore.up.sql:1-2`):

```sql
REPLACE INTO dolt_ignore VALUES ('wisps', true);
REPLACE INTO dolt_ignore VALUES ('wisp_%', true);
```

This is the entire mechanism that makes wisps non-versioned. Once those
patterns are committed, Dolt skips the matching tables in `dolt status`
and `dolt commit -A`. All operations still go through the same SQL
connection — there is no separate store
(`internal/storage/dolt/wisps.go:15-18`).

### 3.10 Views

Two views drive ready-work and blocked-work computation:

- `ready_issues` — `migrations/0017_create_ready_issues_view.up.sql:1-37`,
  rewritten in `migrations/0025_update_ready_issues_view.up.sql:1-40` to
  honor custom-status `category='active'`. The view excludes ephemeral
  rows, deferred rows whose `defer_until` is in the future, and
  transitively-blocked rows via a recursive CTE that walks `parent-child`
  edges to depth 50.
- `blocked_issues` — `migrations/0018_create_blocked_issues_view.up.sql:1-25`,
  rewritten in `migrations/0026_update_blocked_issues_view.up.sql:1-31` to
  exclude custom statuses with category `done` or `frozen`. Computes
  `blocked_by_count` per row via correlated subquery.

Critically, both views look only at the `issues` table. There are no
analogous wisp views — wisp ready/blocked computation goes through code
paths in `internal/storage/issueops/`.

## 4. IDs

### 4.1 Format

Default format: `<prefix>-<short-hash>`, e.g. `fo-7lc1i`. The short hash
uses base36 (0-9, a-z) — `internal/idgen/hash.go:11-12`.

Hierarchical (child) format: `<parent-id>.<n>`, e.g.
`fo-a3f2dd.1.2` (`internal/types/id_generator.go:48-50`). Maximum depth
is 3 levels (`internal/types/id_generator.go:104-105`).

Wisp prefix variant: `<config-prefix>-wisp-<short-hash>`, when an issue is
ephemeral and no explicit `IDPrefix` is set
(`internal/storage/issueops/create.go:67-69`). The `-wisp-` substring is
later used as a fast-path routing hint
(`internal/storage/dolt/ephemeral_routing.go:16-18`).

### 4.2 Prefix resolution

In `internal/storage/issueops/create.go:60-79`, prefix is resolved with
priority:

1. `issue.PrefixOverride` (if set) — completely replaces config prefix.
2. `bc.ConfigPrefix + "-" + issue.IDPrefix` — appends.
3. `bc.ConfigPrefix + "-wisp"` — for wisps (only when no IDPrefix set).
4. `bc.ConfigPrefix` — default.

`bc.ConfigPrefix` is read from the `config` table key `issue_prefix`
(`internal/storage/issueops/helpers.go:499-505`) and trailing hyphens are
normalized off (`internal/storage/issueops/config_metadata.go:11-13`).

The `issue_prefix` is set by `bd init`. Resolution order in init:
flag → config file → directory name (`cmd/bd/init.go:237-251`). After
resolution it's normalized: leading dots stripped, trailing hyphens
stripped, dots replaced with underscores
(`cmd/bd/init.go:258-260`), and prefixed with `bd_` if the first character
is not a letter or underscore (so it can be used as a MySQL database name)
(`cmd/bd/init.go:265-267`).

The Dolt SQL database name defaults to the (normalized) prefix
(`internal/configfile/configfile.go:227` defines `DefaultDoltDatabase =
"beads"`, but in practice `metadata.json` writes it as the prefix). For
the `fo` workspace, `metadata.json` has `"dolt_database": "fo"` and the
on-disk dolt subdir is `.beads/dolt/fo/` — the dolt server discovers
databases by directory name (`internal/storage/dolt/bootstrap.go:88-113`).

### 4.3 Generation

Two modes, gated on `config` key `issue_id_mode`
(`internal/storage/issueops/helpers.go:165-172`):

**Counter mode** (`issue_id_mode = 'counter'`):
`internal/storage/issueops/helpers.go:175-211`. Atomic `UPDATE
issue_counter SET last_id = last_id + 1 WHERE prefix = ?`. If no row, the
counter is seeded from the highest existing numeric suffix in the issues
table
(`internal/storage/issueops/helpers.go:215-258`). Result: `fo-1`, `fo-2`,
... Counter mode applies only to the `issues` table — wisps always use
hash mode (`internal/storage/issueops/helpers.go:122-132`).

**Hash mode** (default):
`internal/storage/issueops/helpers.go:135-161`. Hash inputs:

```go
content := fmt.Sprintf("%s|%s|%s|%d|%d",
    title, description, creator, timestamp.UnixNano(), nonce)
hash := sha256.Sum256([]byte(content))
```

(`internal/idgen/hash.go:55-61`). The first N bytes are encoded into
base36 to produce a string of length L:

| L | bytes used |
|---|---|
| 3 | 2 |
| 4 | 3 |
| 5 | 4 |
| 6 | 4 |
| 7 | 5 |
| 8 | 5 |

(`internal/idgen/hash.go:64-80`).

### 4.4 Adaptive hash length and collision handling

`GetAdaptiveIDLengthTx`
(`internal/storage/issueops/helpers.go:264-278`) counts existing top-level
issues with the given prefix (suffixes without a `.` are top-level), then
picks a length via the birthday paradox
(`internal/storage/issueops/helpers.go:329-339`):

```
totalPossibilities = 36 ^ length
prob_collision     = 1 - exp(-N^2 / (2 * totalPossibilities))
return smallest length where prob <= max_collision_prob
```

Defaults: `min_hash_length=3`, `max_hash_length=8`,
`max_collision_prob=0.25`
(`internal/storage/issueops/helpers.go:288-293`). All three are config
keys.

On generation, the loop tries lengths from the adaptive base up to 8, and
within each length tries 10 nonces before extending
(`internal/storage/issueops/helpers.go:145-159`). Each candidate is
checked against the same table for collisions before being accepted.

### 4.5 Explicit IDs

If `issue.ID` is non-empty at create time, generation is skipped
(`internal/storage/issueops/create.go:61`). Unless
`SkipPrefixValidation` is set, the explicit ID is validated against the
configured prefix or `allowed_prefixes`
(`internal/storage/issueops/create.go:75-79`,
`internal/storage/issueops/create.go:166-179`). The single-issue
`CreateIssue` path skips prefix validation
(`internal/storage/dolt/issues.go:33-35`); the bulk path does not, by
default.

### 4.6 ID extraction helpers

`types.ExtractPrefix(id)`
(`internal/types/id_generator.go:95-101`) returns everything up to and
including the first hyphen (`fo-` from `fo-7lc1i`); returns `""` for IDs
without a hyphen.

`types.ParseHierarchicalID(id)`
(`internal/types/id_generator.go:60-90`) returns `(rootID, parentID,
depth)` based on dot count.

### 4.7 Two ID generators — only one is live

There are two implementations of `GenerateHashID`:

- `internal/idgen/hash.go:55-85` — base36, used by all production paths.
- `internal/types/id_generator.go:29-41` — hex, returns the full
  64-char SHA256. Has documented progressive-length collision strategy
  (6 → 7 → 8 chars). No call sites were found in the repo (search:
  `grep -rn "types.GenerateHashID"`).

The hex version appears to be unused dead code or kept for an external
consumer; the live ID format is base36 from `idgen`.

## 5. Status / lifecycle

### 5.1 Built-in statuses

From `internal/types/types.go:326-334`:

```go
StatusOpen       Status = "open"
StatusInProgress Status = "in_progress"
StatusBlocked    Status = "blocked"
StatusDeferred   Status = "deferred"
StatusClosed     Status = "closed"
StatusPinned     Status = "pinned"
StatusHooked     Status = "hooked"
```

`hooked` is documented as "Work actively claimed by a worker" but no
state-transition code or view enforces it. Its only consumer is
`validation.NotHooked` which blocks edits when an issue is hooked unless
`--force` is set
(`internal/validation/issue.go:78-88`). The schema views treat it the
same as `in_progress` (i.e., not closed, not pinned).

### 5.2 Status categories (built-in)

`BuiltInStatusCategory` in `internal/types/types.go:503-516`:

| Status | Category |
|---|---|
| `open` | active |
| `in_progress`, `blocked`, `hooked` | wip |
| `closed` | done |
| `deferred`, `pinned` | frozen |

These categories drive view inclusion
(`internal/types/types.go:374-389`):

- **active** — appears in `bd ready` and default `bd list`.
- **wip** — excluded from `bd ready`; visible in default `bd list`.
- **done**, **frozen** — excluded from both.

### 5.3 Custom statuses

Configured via `bd config set status.custom "name1:active,name2:wip,..."`
and parsed by `ParseCustomStatusConfig`
(`internal/types/types.go:420-476`). Names must match
`^[a-z][a-z0-9_-]*$`, can't collide with built-ins, max 50 distinct
custom statuses.

Custom statuses are persisted in two places: the `config` row
`status.custom`, and the `custom_statuses` table (with their category) —
the views read from the table
(`migrations/0025_update_ready_issues_view.up.sql:28`,
`migrations/0026_update_blocked_issues_view.up.sql:2-4`).

### 5.4 Transitions

Transitions are not modeled as a state machine. `UpdateIssue` accepts any
status string that is in the built-in set or a configured custom status
(`internal/types/types.go:347-359`). Specific code paths:

- **claim**: `ClaimIssue`
  (`internal/storage/dolt/issues.go:196-230`) sets `assignee = actor` and
  `status = 'in_progress'` only if the issue currently has no assignee
  (compare-and-swap), returning `ErrAlreadyClaimed` otherwise.
- **close**: `CloseIssue`
  (`internal/storage/dolt/issues.go:260-`) sets `status = 'closed'` and
  back-fills `closed_at` if missing.
- **reopen**: `ReopenIssue`
  (`internal/storage/dolt/issues.go:235-249`) sets `status = 'open'` and
  clears `defer_until`. If a reason is provided, it's added as a comment.

There is no automatic `blocked` transition driven by deps. A row's
"blocked" state is computed by the `blocked_issues` view as a function of
its dependencies; a row whose status is `'open'` can still appear under
"blocked" in `bd list`. The status field and the view are independent.

## 6. Dependency graph

### 6.1 Dependency types

From `internal/types/types.go:768-801`, grouped by purpose:

**Workflow** (affect ready-work calc):

- `blocks`
- `parent-child`
- `conditional-blocks` ("B runs only if A fails")
- `waits-for` ("Fanout gate: wait for dynamic children")

**Association** (don't block):

- `related`
- `discovered-from`

**Graph link**:

- `replies-to` (conversation threading)
- `relates-to` (loose knowledge graph)
- `duplicates`
- `supersedes`

**Entity** (HOP foundation, Decision 004):

- `authored-by`
- `assigned-to`
- `approved-by`
- `attests` (skill attestation)

**Convoy / cross-project**:

- `tracks` (non-blocking)

**Reference**:

- `until` ("Active until target closes — e.g. muted until issue resolved")
- `caused-by`
- `validates`

**Delegation**:

- `delegated-from`

`IsValid` accepts any non-empty string up to 50 chars
(`internal/types/types.go:806-808`); `IsWellKnown` returns true for the
listed constants (`internal/types/types.go:812-821`). User-defined types
are stored as-is.

### 6.2 What blocks ready

`AffectsReadyWork`
(`internal/types/types.go:825-827`):

```go
return d == DepBlocks || d == DepParentChild ||
       d == DepConditionalBlocks || d == DepWaitsFor
```

But the live `ready_issues` view only checks `type = 'blocks'` for the
direct blocking, with `parent-child` used only for transitive deferral
suppression
(`migrations/0025_update_ready_issues_view.up.sql:5-22, 31-39`).
`conditional-blocks` and `waits-for` are not enforced in SQL — they're
honored by code paths that read deps explicitly (`AddDependencyInTx` does
cycle detection across both `blocks` and `conditional-blocks` —
`internal/storage/issueops/dependencies.go:122-150`).

This is a contradiction with the comment: code says four types affect
ready, but the view enforces only one. See §17.

### 6.3 Storage

Single `dependencies` table per database (plus `wisp_dependencies` for
the wisps side). Each row is one directed edge `(issue_id) → depends_on_id`
of a given `type`. The PK is `(issue_id, depends_on_id)` — there can be
at most one edge between any source/target pair regardless of type. The
add path detects type conflict and refuses
(`internal/storage/issueops/dependencies.go:155-171`):

> dependency %s -> %s already exists with type %q (requested %q); remove
> it first with 'bd dep remove' then re-add

Same-type re-adds are idempotent (they update only the metadata field).

### 6.4 Cross-table dependencies

Dependency queries always UNION across `dependencies` and
`wisp_dependencies`
(`internal/storage/issueops/dependencies.go:309, 372, 430, 463`). This
lets a wisp depend on a permanent issue and vice versa. The
`wisp_dependencies` table has no FK constraints, so cross-table edges are
unenforced at the DB level.

### 6.5 Cycle detection

In `AddDependencyInTx`
(`internal/storage/issueops/dependencies.go:122-150`):

- Self-deps rejected outright.
- For `blocks` and `conditional-blocks`, a recursive CTE walks reachable
  nodes from `dep.DependsOnID` across both dep tables; if `dep.IssueID`
  is reachable, the new edge would create a cycle.
- Depth ceiling: 100 levels.
- Other dep types are not checked for cycles.

### 6.6 `parent-child` and the `DependencyType` direction

The convention reads "child depends on parent": the child issue is in
`issue_id`, the parent is in `depends_on_id`. This shows up in
`ready_issues` view
(`migrations/0025_update_ready_issues_view.up.sql:18-22`,
`migrations/0025_update_ready_issues_view.up.sql:32-39`), in the
molecule progress query
(`internal/storage/issueops/molecule.go:32-34`), and in the
`ReadyExplanation` parent computation
(`internal/types/types.go:1063-1069`).

### 6.7 Cross-type blocking validation

GH#1495: tasks can only block tasks; epics can only block epics
(`internal/storage/issueops/dependencies.go:106-115`). The check fires
only when source and target both exist (i.e., not external/cross-prefix).

### 6.8 Edge metadata

`Dependency.Metadata` is a JSON string carrying type-specific data.
Documented uses:

- `WaitsForMeta` (`internal/types/types.go:830-837`): `{ gate, spawner_id }`
  where gate is `"all-children"` (default) or `"any-children"`.
- `AttestsMeta` (`internal/types/types.go:864-878`): `{ skill, level,
  date, evidence, notes }`.

`Dependency.ThreadID` (`internal/types/types.go:723`) groups
conversation edges so reply chains can be queried efficiently.

## 7. Storage model — on-disk layout under `.beads/`

### 7.1 Directories and files

Observed in `/home/cwa/weaveroot/foundations/projects/foundations/.beads/`
(a live workspace):

```
.beads/
├── backup/                       # Backup snapshots
├── config.yaml                   # User-facing config (status.custom, dolt.*, etc.)
├── dolt/                         # Dolt data root (see §7.2)
│   ├── .dolt/                    # Dolt's own metadata (commits, etc.)
│   ├── .doltcfg/
│   ├── .dolt_dropped_databases/
│   └── fo/                       # The named SQL database — name = issue prefix
│       └── .dolt/
├── dolt-server.port              # Listening port of the running dolt server
├── formulas/                     # Formula definitions (per project)
├── hooks/                        # Hook scripts
├── interactions.jsonl            # Append-only audit log (see §7.2)
├── last-touched                  # ID of the last-touched issue (see §7.2)
├── metadata.json                 # Storage / project identity config
├── push-state.json               # Auto-push state (last_push, last_commit)
├── README.md                     # User-facing readme
├── routes.jsonl                  # Cross-project routing (orchestrator)
├── .beads-credential-key         # Local key for credential file decryption
├── .env                          # Credentials (not committed)
├── .gitignore                    # Protects local-only files
└── .local_version                # bd version stamp (clone-local)
```

Key code references:

- `metadata.json` — schema in
  `internal/configfile/configfile.go:14-55`. Single source of truth for
  storage backend, dolt mode, server host/port, database name, project
  ID. `ConfigFileName = "metadata.json"`
  (`internal/configfile/configfile.go:14`).
- `.dolt/` server data — created by `dolt init` in `<doltDir>/<dbName>/`
  (`internal/doltserver/doltserver.go:1208-1232`). The marker file
  `.bd-dolt-ok` is written after init to flag database compatibility
  (`internal/doltserver/doltserver.go:1198-1199`).
- `dolt-server.port` — written by Start
  (`internal/doltserver/doltserver.go:79-81`,
  `internal/doltserver/doltserver.go:388-391`). Used by the CLI to
  reconnect to a running server — readPortFile is consulted before any
  config-derived port (`internal/doltserver/doltserver.go:438-455`).
- `dolt-server.pid`, `dolt-server.lock`, `dolt-server.log` — server
  lifecycle state (`internal/doltserver/doltserver.go:280-283`).
- `interactions.jsonl` — append-only audit log
  (`internal/audit/audit.go:18, 82-129`). Survives Dolt GC because it's
  on disk, not in the database.
- `last-touched` — single line containing the most recent touched issue
  ID (`cmd/bd/last_touched.go:11-44`).
- `push-state.json` — observed JSON `{ last_push, last_commit }` —
  written by an auto-push code path; current location not surfaced by
  search but referenced in
  `internal/storage/dolt/migrations/009_cleanup_autopush_metadata.go:11`.
- `routes.jsonl` — orchestrator-level routing config; bd uses its
  presence (along with `mayor/town.json`) only to detect "this is an
  orchestrator workspace" and refuse `bd doctor --fix` there
  (`cmd/bd/doctor_gastown_guard.go:12-32`).
- `.beads-credential-key` — local key for the encrypted
  `federation_peers.password_encrypted` blob
  (`internal/storage/dolt/credentials.go:27`).
- `.local_version` — clone-local bd version stamp; replaces the
  deprecated `last_bd_version` field in metadata.json
  (`internal/configfile/configfile.go:50-54`).

### 7.2 Dolt server vs embedded

The current production model is "dolt server" mode: bd manages a local
`dolt sql-server` process and connects to it via MySQL protocol. The
server's lifecycle is managed by
`internal/doltserver/doltserver.go:564-619` (`EnsureRunning`).

There is also an `embeddeddolt/` directory referenced as a fallback
location when the embedded driver is in use
(`internal/beads/beads.go:436-444`), but the server-only architecture
since v0.56 (`internal/doltserver/doltserver.go:1196-1198`) is the
expected layout. The marker file `.bd-dolt-ok` distinguishes new
databases from incompatible pre-0.56 ones.

Server start uses an OS-allocated ephemeral port by default
(`internal/doltserver/doltserver.go:7-13`), with the resolution chain
env var → port file → config.yaml → metadata.json → ephemeral
(`internal/doltserver/doltserver.go:425-489`). The port file is the
primary persistent source.

### 7.3 Shared-server mode

When `BEADS_DOLT_SHARED_SERVER=1` or `dolt.shared-server: true`, all
projects on the machine share one server at `~/.beads/shared-server/`,
each with its own SQL database
(`internal/doltserver/doltserver.go:111-116, 175-189`). Default port:
`3308` (`internal/doltserver/doltserver.go:88-89`).

The `beads_global` database is special: a project-agnostic SQL database
created in shared mode
(`internal/doltserver/doltserver.go:91-101`,
`internal/doltserver/doltserver.go:879-911`).

### 7.4 Path discovery

`FindBeadsDir`
(`internal/beads/beads.go:573-712`) implements a multi-pass walk:

1. `BEADS_DIR` env var.
2. Walk up from CWD checking each `.beads/` (with redirect support and
   `hasBeadsProjectFiles` validation), stopping at the worktree or git
   root.
3. Worktree-specific fallback: per-worktree redirect,
   worktree-local `.beads/`, then shared `.beads/` via
   `git --git-common-dir`.
4. Extended walk from the worktree boundary to the main repo root.

`hasBeadsProjectFiles`
(`internal/beads/beads.go:527-554`) validates that a `.beads/` actually
has project files (metadata.json, config.yaml, dolt/, embeddeddolt/, or
*.db) — preventing it from latching onto `~/.beads/` which only has
`registry.json`.

### 7.5 Redirects

A `.beads/redirect` file (`RedirectFileName` —
`internal/beads/beads.go:31`) contains a single path (relative or absolute)
to the actual `.beads/` directory. Resolution rules in
`FollowRedirect`
(`internal/beads/beads.go:103-158`):

- Comments (`#`) and blank lines skipped; first non-blank line wins.
- Relative paths resolved against the parent of the `.beads/` directory.
- Worktree-aware canonicalization via
  `preferStableBranchWorktreeBeadsDir`
  (`internal/beads/beads.go:176-231`): if the redirect points to a
  detached-commit worktree (`refs/commits/`), prefer a stable branch
  worktree at the same SHA.
- Single-level only — chains are not followed.

`ResolveRedirect`
(`internal/beads/beads.go:64-91`) preserves the source's
`dolt_database` field across the redirect, so a source workspace's
database identity survives a redirect to a shared `.beads/` that lists a
different database name.

## 8. Versioning

### 8.1 Per-write Dolt commits

Every CRUD on the `issues` table is followed by a `CALL DOLT_COMMIT(...)`:

- `CreateIssue`:
  `internal/storage/dolt/issues.go:46-49` —
  `bd: create <id>`, on tables `issues, events`.
- `UpdateIssue`:
  `internal/storage/dolt/issues.go:172-178` —
  `bd: update <id>`, on `issues, events`.
- `ClaimIssue`:
  `internal/storage/dolt/issues.go:215-222` —
  `bd: claim <id>`, on `issues, events`.
- `CloseIssue`:
  `internal/storage/dolt/issues.go:278-280+` —
  `bd: close <id>`.
- `CreateIssues` (bulk):
  `internal/storage/dolt/issues.go:96-99` —
  `bd: create N issue(s)`, on
  `issues, events, labels, comments, dependencies, child_counters`.

Tables are explicitly staged via `CALL DOLT_ADD(...)` (not `dolt add
-A`) — GH#2455 — so that ignored tables and unrelated dirty state
don't sneak into commits.

The commit `--author` argument comes from
`s.commitAuthorString()` (private; uses git identity).
`isDoltNothingToCommit` swallows the no-op commit error
(`internal/storage/dolt/issues.go:178-179`).

### 8.2 Wisps skip versioning

If `issue.Ephemeral || issue.NoHistory`, the issue is routed to the
`wisps` table, and the `DOLT_COMMIT` step is skipped entirely
(`internal/storage/dolt/issues.go:24-50`). Because `wisps` and `wisp_*`
are dolt-ignored, even if commit were run nothing would be staged.

### 8.3 `ephemeral` vs `no_history`

Both flags route to the `wisps` table
(`internal/storage/dolt/issues.go:25-28`). The differences:

- `ephemeral=true` flips `Ephemeral` and the issue is treated as a "wisp"
  for all purposes — included in `bd ready` only when
  `WorkFilter.IncludeEphemeral` is set
  (`internal/types/types.go:1310-1313`).
- `no_history=true` keeps the issue in the wisps table to skip Dolt
  commits, but is "stored in wisps table but NOT GC-eligible"
  (`internal/types/types.go:80`). Mutually exclusive with `ephemeral`
  (`internal/types/types.go:254-256`).

The intent: `no_history` is for issues that you want to keep but don't
want cluttering Dolt history; `ephemeral` is for wisps that should be
GC'd by TTL.

### 8.4 Branches

The Storage interface exposes branch ops
(`internal/storage/storage.go:30-49`): `Branch`, `Checkout`,
`CurrentBranch`, `DeleteBranch`, `ListBranches`, `Commit`,
`CommitWithConfig`, `Merge`, `GetConflicts`, `ResolveConflicts`. These
go through Dolt's MySQL extension surface.

`CommitWithConfig` (vs `Commit`) — added per GH#3216 to ensure
`bootstrap paths must use this to commit issue_prefix`
(`internal/storage/storage.go:39-40`). The plain `Commit` excludes the
config table, so a plain commit after `bd config set` would not propagate
the config change.

### 8.5 Demote/promote

`DemoteToWisp`
(`internal/storage/dolt/ephemeral_routing.go:267-356`) moves a permanent
issue to the wisps table — copies the row, copies labels/deps/events/
comments to the wisp_* counterparts, deletes from the originals, then
`DOLT_COMMIT`s the deletions so the row vanishes from history going
forward.

`PromoteFromEphemeral`
(`internal/storage/dolt/ephemeral_routing.go:184-259`) is the inverse:
clears `Ephemeral`, re-creates in the issues table (which triggers Dolt
commit), copies labels/deps/events/comments back, then deletes the
wisp.

## 9. Cross-DB references

### 9.1 No FK on the target

`dependencies.depends_on_id` is NOT a foreign key
(`migrations/0002_create_dependencies.up.sql:1-15`). Only the source
side (`issue_id`) has a FK to `issues(id)`. This is what enables
cross-prefix references at the schema level.

### 9.2 The cross-prefix code path

`AddDependencyOpts.IsCrossPrefix`
(`internal/storage/issueops/dependencies.go:31-33`) is set by the
caller when source and target have different prefixes. When set:

- Target routing is not auto-detected — `targetTable` defaults to
  `"issues"`
  (`internal/storage/issueops/dependencies.go:62-70`).
- Target existence is NOT validated
  (`internal/storage/issueops/dependencies.go:92-102`).
- Cross-type blocking validation (epic/task) is skipped when
  `targetType == ""`
  (`internal/storage/issueops/dependencies.go:106-115`).

The semantics: "the target lives in another rig's database"
(`internal/storage/issueops/dependencies.go:32-33`). The dependency row
is still inserted; consumers are responsible for resolving the target
across DBs at read time.

### 9.3 `external:` prefix sentinel

Any `depends_on_id` starting with `external:` skips both target routing
and target validation
(`internal/storage/issueops/dependencies.go:64-67, 94`). This is the
escape hatch for references to non-bd targets (PRs, GitHub runs, etc.).

### 9.4 Routes table

The in-DB `routes` table
(`migrations/0012_create_routes.up.sql:1-6`) maps `prefix → path`,
giving the runtime the information to find another rig's `.beads/`. This
is parallel to the orchestrator-managed `.beads/routes.jsonl` file (§7).

There is no enforcement that a cross-prefix target actually exists in the
other DB at the time the edge is added — validation, if any, happens at
read time via the routes table.

## 10. Issue types

### 10.1 Built-in core types

`internal/types/types.go:523-535`: `bug`, `feature`, `task`, `epic`,
`chore`, `decision`, `message`, `molecule`, `spike`, `story`,
`milestone`.

`event` is an additional system-internal built-in
(`internal/types/types.go:541`), accepted by `IsValidWithCustom` and
`IsBuiltIn` but NOT by the strict `IsValid`. It is the type for
set-state audit-trail beads and uses the `event_kind`, `actor`,
`target`, `payload` columns (§2.15).

### 10.2 Custom and removed types

User-defined types come from `bd config set types.custom
"type1,type2,..."`, stored in both the `config` row `types.custom` and
the `custom_types` table. `IsValidWithCustom`
(`internal/types/types.go:571-582`) accepts built-ins or any configured
custom type.

A comment in `internal/types/types.go:543-547` records that `molecule,
gate, convoy, merge-request, slot, agent, role, rig` were formerly
built-in but were removed; they're now custom types only. `message` was
re-promoted to built-in for inter-agent communication (GH#1347).

`Normalize` (`internal/types/types.go:587-602`) maps aliases:
`enhancement|feat → feature`, `dec|adr → decision`,
`investigation|timebox → spike`, `user-story|user_story → story`, `ms →
milestone`.

`SetDefaults` (`internal/types/types.go:309-320`) sets `IssueType =
TypeTask` if empty.

### 10.3 Type-specific columns and routing

The `event_kind, actor, target, payload` columns are meaningful only
for type `event`. The `await_*, timeout_ns, waiters` columns matter
when `await_type` is set. `mol_type` matters for molecule-type issues.
None of these are enforced as conditional constraints — every column is
optional on every row.

`storage.DefaultInfraTypes` (`internal/storage/infra_types.go:7`):
`agent, rig, role, message`. These auto-route to the wisps table at
create time (`internal/storage/dolt/issues.go:25-28`); they get marked
`Ephemeral=true` unless `NoHistory` is set. Override via DB config
`types.infra` / config file
(`internal/storage/dolt/ephemeral_routing.go:34-36`).

## 11. Priority

`INT NOT NULL DEFAULT 2`
(`migrations/0001_create_issues.up.sql:10`). Validated `0 ≤ priority ≤ 4`
(`internal/types/types.go:228-230`): 0=critical (P0), 1=high, 2=medium
(default), 3=low, 4=backlog. The `Pn` form is display-only; storage is
the integer. The `priority` JSON field is `Priority int` without
omitempty (`internal/types/types.go:31`) — `omitempty` would treat P0 as
missing, which is wrong.

`SortPolicy` (`internal/types/types.go:1257-1278`) drives ready ordering:

- `hybrid` — recent by priority, older by age (default).
- `priority` — priority always wins.
- `oldest` — creation date wins (backlog clearing).

## 12. Metadata

### 12.1 Storage and validation

`metadata` is a per-issue JSON column with default `JSON_OBJECT()`
(`migrations/0001_create_issues.up.sql:34`). Validated as well-formed
JSON before insert (`internal/types/types.go:248-252`).

`NormalizeMetadataValue`
(`internal/storage/metadata.go:16-36`) accepts string, []byte, or
json.RawMessage and produces a validated JSON string for SQL writes.

### 12.2 Schema validation (optional)

`ValidateMetadataSchema`
(`internal/storage/metadata.go:77-206`) supports schema-constrained
field types: `string`, `int`, `float`, `bool`, `enum`. Fields can be
required, have min/max for numerics, or have an allowed value list for
enums. Enabled by `metadata.validation` config: `none`, `warn`, `error`.

`ValidateMetadataKey`
(`internal/storage/metadata.go:215-220`) requires keys match
`^[a-zA-Z_][a-zA-Z0-9_.]*$` for safe use in JSON path expressions.

### 12.3 Querying — IssueFilter

`IssueFilter.MetadataFields` (top-level key=value, AND semantics) and
`HasMetadataKey` (existence check)
(`internal/types/types.go:1245-1247`). Same fields on `WorkFilter`
(`internal/types/types.go:1320-1322`).

The CLI `--metadata-field key=value` and `--metadata-key key` flags map
to these. `JSONMetadataPath`
(`internal/storage/metadata.go:226-231`) constructs the SQL JSON path —
keys with dots are quoted: `gc.routed_to` becomes `$."gc.routed_to"` so
Dolt doesn't interpret the dot as path nesting.

### 12.4 Well-known keys observed in the wild

These are convention, not schema:

- `gc.routed_to` — work-pool routing (e.g., `foundations/worker`).
  Observed in the live `.beads` and used by the gc dispatch model. The
  pool-worker prompt uses
  `bd ready --metadata-field gc.routed_to=$GC_TEMPLATE --unassigned`.

The codebase does not enumerate well-known keys; they are an
orchestrator-side convention.

## 13. Hierarchy / parent

### 13.1 Two parent mechanisms

There are two parent mechanisms in the data model:

**(a) Dependency-based parent** — a `parent-child` dependency edge.
This is the canonical "parent" relationship. The `Parent` field on
`IssueWithCounts`
(`internal/types/types.go:744-746`) and `ReadyItem`
(`internal/types/types.go:1063-1069`) is computed by scanning deps for a
`parent-child` edge.

**(b) Hierarchical ID-based parent** — `parent.N` ID format. Tracked by
the `child_counters` table (§3.7). This is independent of dependency
edges; the relationship is encoded in the ID string itself.

These two can coexist or diverge. Code that needs "the parent" generally
uses the dep edge.

### 13.2 Hierarchical IDs

`GenerateChildID(parentID, n)`
(`internal/types/id_generator.go:48-50`): returns `<parent>.<n>`.
`MaxHierarchyDepth = 3` (`internal/types/id_generator.go:104-105`).

`CheckHierarchyDepth`
(`internal/types/id_generator.go:110-127`) counts dots and rejects
adding a child that would exceed the depth.

### 13.3 Status rollup

There is no automatic status rollup from children to parents. Compare:
`EpicsEligibleForClosure` and `EpicStatus`
(`internal/types/types.go:1361-1366`) compute eligibility for closure
(all children closed), but do not auto-close. Closure is operator-driven
via `bd close --suggest-next`.

### 13.4 Molecule progress

`GetMoleculeProgressInTx`
(`internal/storage/issueops/molecule.go:16-109`) walks `parent-child`
dependencies (not hierarchical IDs) to compute child completion stats.
The first `in_progress` child becomes `CurrentStepID`. The whole query
auto-routes to wisp tables when the molecule itself is a wisp.

## 14. Compaction / GC

### 14.1 Two notions of "compaction"

1. **Issue-content compaction** — AI summarization replacing
   description/design/notes with a Tier 1 summary, then a Tier 2 summary
   later. Operates on the `issues` table.
2. **Dolt history compaction** — squash old commits or run
   `DOLT_GC()`. Exposed via `Compactor`, `Flattener`, and
   `GarbageCollector` interfaces
   (`internal/storage/storage.go:172-187`).

### 14.2 Issue-content compaction tiers

`internal/compact/compactor.go:12-15` defines `defaultTier1Days = 30`
and `defaultTier2Days = 90`, overridable via config keys
`compact_tier1_days` / `compact_tier2_days`
(`internal/storage/issueops/compaction.go:18-36`).

Eligibility (`internal/storage/issueops/compaction.go:38-86`): Tier 1
needs status `closed`, `closed_at + tier1_days` past, and
`compaction_level = 0`. Tier 2 needs the same plus `compaction_level =
1`.

Application
(`internal/compact/compactor.go:87-157`): fetch → summarize via Haiku →
abort if summary is not shorter → `UPDATE issues SET description =
summary, design='', notes='', acceptance=''` → write compaction metadata
(`compaction_level`, `compacted_at`, `compacted_at_commit`,
`original_size`) → add a comment recording bytes saved.

`compaction_enabled` and `auto_compact_enabled` config keys gate the
process (`migrations/0016_default_config.up.sql:2, 10`).

### 14.3 Snapshots and wisp TTL

Two snapshot tables retain pre-compaction state for restoration:
`issue_snapshots`
(`migrations/0009_create_issue_snapshots.up.sql:1-13`) keeps original
content + archived events; `compaction_snapshots`
(`migrations/0010_create_compaction_snapshots.up.sql:1-9`) keeps a JSON
BLOB. Both cascade on issue delete.

Wisp GC is distinct: wisps are evicted based on `wisp_type` TTL bands
(§2.11). The TTL itself is policy ("WISP-COMPACTION-POLICY.md"), not
schema. `ephemeral=true` is GC-eligible; `no_history=true` opts out.

### 14.4 Other Dolt operations

`DoltGC` (`internal/storage/storage.go:172-175`) reclaims chunks via
Dolt's `DOLT_GC()`. `Flatten` squashes all commits to one.
`Compact(initial, boundary, oldCommits, recent)` selectively squashes
ranges. `BackupDatabase`/`RestoreDatabase`
(`internal/storage/storage.go:208-212`) use `CALL DOLT_BACKUP(...)` to
a `file://` remote, preserving history.

## 15. Wisps and ephemeral storage — the routing table

`CreateIssue` (`internal/storage/dolt/issues.go:24-28`) decides at
create time:

```go
useWispsTable := issue.Ephemeral || issue.NoHistory ||
                 s.IsInfraTypeCtx(ctx, issue.IssueType)
if useWispsTable && !issue.NoHistory {
    issue.Ephemeral = true
}
```

A `task` with neither flag set goes to `issues`. Setting either flag,
or using an infra type, sends the row to `wisps`. Infra-type creation
sets `Ephemeral=true` unless `NoHistory` is set.

`IsEphemeralID` (`internal/storage/dolt/ephemeral_routing.go:16-18`)
fast-paths IDs containing `-wisp-`. Explicit-ID ephemerals (created
with `--id=<custom>`) don't match the pattern, so `isActiveWisp`
(`internal/storage/dolt/ephemeral_routing.go:46-66`) falls back to
`SELECT 1 FROM wisps WHERE id = ?` (GH#2053).

A wisp can be promoted to a permanent issue via `PromoteFromEphemeral`
(§8.5). The promoted issue keeps its `-wisp-` ID but lives in the
issues table. `partitionByWispStatus`
(`internal/storage/dolt/ephemeral_routing.go:95-138`) checks the wisps
table for actual existence rather than relying on ID pattern, so reads
against promoted wisps are routed correctly.

Both source and target of a dependency can independently be in either
table. `WispTableRouting` decides per-side which table to scan; read
queries always UNION across `dependencies` and `wisp_dependencies`
(§6.4).

## 16. Non-persisted fields on `Issue`

The Issue struct carries control-only fields not stored as columns:
`IDPrefix`, `PrefixOverride` (generation-time only), and `BondedFrom
[]BondRef` (compound molecule lineage; included in `ComputeContentHash`
but its persistence path was not traced here). `Dependencies`,
`Comments`, `Labels` are populated for export/import; they are not on
the issue row. `IssueFilter` and `WorkFilter`
(`internal/types/types.go:1167-1323`) carry many query-time fields with
no schema counterpart (label patterns/regex, date ranges, empty checks).

## 17. Gaps & contradictions

Things found while reading code that disagree with comments, with each
other, or with what the schema implies.

### 17.1 Schema columns not in the Issue struct (orphaned)

Both `migrations/0001_create_issues.up.sql:45-50` and
`migrations/0020_create_wisps.up.sql:45-50` declare:
`hook_bead, role_bead, agent_state, last_activity, role_type, rig`.
The `Issue` struct (`internal/types/types.go:16-113`) and
`IssueSelectColumns` (`internal/storage/issueops/scan.go:14-23`) do
NOT include any of these. They appear vestigial — kept in the schema
but no longer written or read by the storage layer. (The
`MoleculeLastActivity.LastActivity` field at
`internal/types/types.go:1147` is on the molecule type, not the
issues column.)

### 17.2 `AffectsReadyWork` says four types affect ready, but the view enforces only one

`AffectsReadyWork`
(`internal/types/types.go:825-827`) returns true for `blocks`,
`parent-child`, `conditional-blocks`, `waits-for`. The actual
`ready_issues` view
(`migrations/0025_update_ready_issues_view.up.sql:5-22`) only checks
`type = 'blocks'` for the direct blocking calculation. `parent-child`
appears only in the recursive CTE and the deferred-parent suppression;
`conditional-blocks` and `waits-for` are not in the view at all.

The cycle-detection path
(`internal/storage/issueops/dependencies.go:124-128`) enforces
`type IN ('blocks', 'conditional-blocks')`, agreeing partly with the
comment, but `waits-for` is unprotected from cycles.

### 17.3 Status `hooked` is defined but barely used

`StatusHooked`
(`internal/types/types.go:333`) is declared "Work actively claimed by a
worker" but no code transitions to/from it except a single
`validation.NotHooked` guard
(`internal/validation/issue.go:78-88`). The views treat it identically
to `in_progress`. Either it's experimental (not yet wired up) or it's a
client-driven status used by orchestrators.

### 17.4 Two `pinned` concepts

`Status = 'pinned'` (string) is a row state used by views to skip the
issue. `pinned` (TINYINT(1) column, `internal/types/types.go:86`) is a
boolean "Persistent context marker, not a work item". The code treats
them differently and the views only consult the status. The naming
collision is a hazard — operator might expect `bd update <id> --pinned
true` to change the status, but it changes the column.

### 17.5 Two ID generators

`internal/idgen/hash.go:55-85` (base36) and
`internal/types/id_generator.go:29-41` (hex/full SHA256) both export
`GenerateHashID` with the same name but different return contracts.
Production calls the base36 one; the hex one has documentation
referencing a "progressive collision strategy" with 6/7/8 char hex IDs
that does not match what production does. It's either dead code or
intended for an external consumer.

### 17.6 Two ID generation helpers in dolt/

`internal/storage/issueops/helpers.go:122-162` defines
`GenerateIssueIDInTable` (exported) used by the CRUD path.
`internal/storage/dolt/wisps.go:45-86` defines
`generateIssueIDInTable` (lowercase, dolt-package-local) used only by
`internal/storage/dolt/transaction.go:169`. They have nearly identical
logic but the dolt one uses a hardcoded length-by-count step
function (`<100 → 4, <1000 → 5, <10000 → 6, else 7`) instead of the
adaptive birthday-paradox formula. Two paths with subtly different ID
length strategies depending on how a write enters.

### 17.7 `interactions` table has no writer

`migrations/0014_create_interactions.up.sql:1-21` defines the
`interactions` table. The `audit.Append` function
(`internal/audit/audit.go:82-129`) writes to `interactions.jsonl` (the
file), not the table. Search for direct INSERTs into `interactions`
turned up nothing. Either the writer lives in code I didn't read, or the
table is an unfinished migration target.

### 17.8 `metadata` is local but is not dolt-ignored

The `metadata` table
(`migrations/0007_create_metadata.up.sql:1-4`) is committed to Dolt.
Migration `0030_migrate_local_metadata_keys.up.sql:11-27` migrates
local-only keys (`tip_*`, `bd_version*`, `*.last_sync`) out of `metadata`
into `local_metadata` to prevent merge conflicts. Any remaining
`metadata` entries are still part of Dolt history. The interface comment
on `Storage.GetMetadata`/`SetMetadata` (Transaction interface,
`internal/storage/storage.go:271-272`) describes them as for "internal
state like import hashes" — these are meant to be globally consistent
across clones, distinct from `local_metadata`'s clone-local intent.
Worth surfacing in UI as: "metadata = consistent across clones,
local_metadata = per-clone".

### 17.9 `DefaultDoltDatabase = "beads"` but in practice it's the prefix

`internal/configfile/configfile.go:227` defines
`DefaultDoltDatabase = "beads"`. But `bd init` writes
`metadata.json.dolt_database` to the configured prefix
(`cmd/bd/init.go:265-267` enforces prefix-as-MySQL-identifier
conventions). The constant default applies only when `dolt_database` is
absent from metadata.json, which is the cold-start case during
bootstrap. In every initialized workspace, the database name is the
prefix.

### 17.10 The `hidden` HOP-column drop migration only drops `quality_score` and `crystallizes`

`internal/storage/dolt/migrations/012_drop_hop_columns.go:11-29`
drops only `quality_score` and `crystallizes`, not the orphaned
`hook_bead, role_bead, agent_state, last_activity, role_type, rig`
columns from §17.1. So the cleanup was partial.

### 17.11 Two migration systems

SQL migrations under `internal/storage/schema/migrations/` (61 files)
are the embedded source of truth driven by `MigrateUp`
(`internal/storage/schema/schema.go:107-143`). Go migrations under
`internal/storage/dolt/migrations/` (16 files) call into the SQL ones via
`schema.ReadMigrationSQL(version)` plus extra logic (e.g. table-exists
checks before re-running DDL — see
`internal/storage/dolt/migrations/004_wisps_table.go:18-29`). It is not
obvious from naming which is canonical; in practice both run, with the
SQL files providing DDL and the Go files providing additional
imperative steps.

### 17.12 Smaller items

- **Metadata `null` is valid JSON.**
  `internal/types/types.go:248-252` accepts any well-formed JSON, so
  `metadata = "null"` passes. Queries against `metadata.foo` then
  silently return NULL.
- **`wisps` dolt_ignore ordering** — SQL migrations 0019
  (`REPLACE INTO dolt_ignore`) and 0020 (`CREATE TABLE wisps`) rely on
  file-number ordering. The Go migration
  `internal/storage/dolt/migrations/004_wisps_table.go:30-47` explicitly
  commits dolt_ignore before creating the table because "dolt_ignore
  only works on untracked tables. Once a table has been committed, the
  ignore pattern has no effect." Whether the SQL-only path commits
  between 0019 and 0020 was not verified — potential cold-start hazard.
- **Wisp tables have no FKs**, so any cross-table delete/cascade logic
  must live in code; orphan wisp aux rows are possible if the issue
  delete path misses one of `wisp_labels, wisp_dependencies, wisp_events,
  wisp_comments`.

---

End of document. Source of truth is the code; flag anything that drifts.
