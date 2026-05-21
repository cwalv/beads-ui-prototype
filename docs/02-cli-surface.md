# 02 — `bd` CLI Surface Reference

> Scope: the `bd` CLI as shipped by `github.com/cwalv/beads` (dogfood fork at
> `github/gastownhall/beads/`). This document is derived from the source
> code — command definitions in `cmd/bd/`, the storage layer in
> `internal/storage/`, and the supporting subsystems in `internal/hooks/`,
> `internal/query/`, `internal/formula/`, `internal/molecules/`, and
> `internal/tracker/`.
>
> `bd --help` is used as scaffolding, not truth. Every non-trivial claim below
> cites `path:line` relative to the workspace root
> `/home/cwa/weaveroot/.workweaves/foundations--fo-city/` — i.e., paths begin
> with `github/gastownhall/beads/…`.
>
> This document feeds the beads-UI prototype
> (`github.com/cwalv/beads-ui-prototype`). Its consumer needs to know: what
> commands exist, what they mutate, what they emit, what the hook and JSON
> contracts look like, and where the teeth are.
>
> Observed bd version at time of writing: **`1.0.0`** (`bd --version`),
> commit build tag `72170267`.

## 1. Reading this document

- Command names are lowercase and listed by their Cobra name. `bd foo bar`
  means subcommand `bar` of parent `foo`.
- JSON examples are realistic, constructed from the structs and
  `json:"…"` tags in the code, not invented.
- "Always" vs "Conditional" refers to whether a JSON field is emitted
  unconditionally or has `omitempty` (or is only set by certain branches).
- Citations are `path:line`. When a range is needed, `path:line-line`.
- Where the code is clear, fields are documented as facts. Where the code is
  ambiguous or only one branch was read, the text says so explicitly.

## 2. Top-level command and persistent behavior

### 2.1 Root command

The root command is declared at `github/gastownhall/beads/cmd/bd/main.go:498`
as a Cobra command with `Use: "bd"`. If no subcommand is given it prints help
(`main.go:509`), or, if `--version` / `-V` is set, prints version and exits
(`main.go:504-507`, `main.go:479`).

The binary name is `BD_NAME`-aware: if `BD_NAME` is set in the environment,
`rootCmd.Use` is rewritten before `Execute()` (`main.go:1162-1164`). This
supports wrapper scripts that rename the binary (`ops`, `rig`, etc.).

### 2.2 Global (persistent) flags

Registered in `init()` at `main.go:464-479`. These flags work with every
subcommand.

| Flag | Type | Default | Source | Description |
|---|---|---|---|---|
| `--db <path>` | string | auto-discover `.beads/*.db` | `main.go:465` | Explicit database path. |
| `--actor <name>` | string | derived (see §2.3) | `main.go:466` | Actor for audit trail. |
| `--json` | bool | `false` | `main.go:467` | JSON output on the root. |
| `--format json` | string | — | `main.go:468-469` | Hidden alias for `--json` (set to "json" enables JSON). |
| `--sandbox` | bool | auto-detect | `main.go:470` | Sandbox mode; disables auto-sync. |
| `--readonly` | bool | `false` | `main.go:471` | Read-only mode: block write ops. |
| `--global` | bool | `false` | `main.go:472` | Use global shared-server database (`beads_global`); requires shared-server mode. |
| `--dolt-auto-commit <off\|on\|batch>` | string | `off` in server mode, else config | `main.go:473` | Controls Dolt auto-commit policy. `batch` defers commits until `bd dolt commit`. SIGTERM/SIGHUP flushes pending batch commits (`main.go:1086-1110`). |
| `--profile` | bool | `false` | `main.go:474` | Emit CPU profile + trace under `bd-profile-<cmd>-<ts>.prof` / `bd-trace-<cmd>-<ts>.out`. |
| `--verbose, -v` | bool | `false` | `main.go:475` | Debug output. |
| `--quiet, -q` | bool | `false` | `main.go:476` | Suppress non-essential output. |
| `--version, -V` | bool | `false` | `main.go:479` | Root-only. Print version info. |

Groups registered for help output (`main.go:482-491`):

- `issues` — Working With Issues
- `views` — Views & Reports
- `deps` — Dependencies & Structure
- `sync` — Sync & Data
- `setup` — Setup & Configuration
- `maint` — Maintenance
- `advanced` — Integrations & Advanced

### 2.3 Actor resolution

`getActorWithGit()` (`main.go:406-435`) resolves the actor in order:

1. `--actor` flag
2. `BEADS_ACTOR` env var
3. `BD_ACTOR` env var (deprecated alias)
4. `git config user.name`
5. `$USER`
6. literal `"unknown"`

`getOwner()` (`main.go:441-456`) resolves the owner (for HOP CV chains):

1. `GIT_AUTHOR_EMAIL`
2. `git config user.email`
3. empty

### 2.4 `PersistentPreRun` flow (every command)

`main.go:511-958` runs on every subcommand before the command body. Key
phases:

1. **Init command context + reset write tracking** (`main.go:512-519`). Two
   atomic flags track whether the command wrote anything or created its own
   Dolt commit; the auto-commit check at post-run uses these.
2. **Signal handler + graceful shutdown** (`main.go:524`, setup at
   `main.go:1061-1081`). Handles SIGINT/SIGTERM/SIGHUP. First signal flushes
   pending batch commits; second forces exit.
3. **Telemetry init** (`main.go:528-540`). OTel is a no-op unless
   `BD_OTEL_METRICS_URL` or `BD_OTEL_STDOUT=true`.
4. **Blocked env var check** (`main.go:547-549`, list at `main.go:1045`).
   `BD_BACKEND` and `BD_DATABASE_BACKEND` are rejected — backend is pinned in
   `.beads/metadata.json`. (Mitigates bd-hevyw.)
5. **`--format json` alias** (`main.go:564-569`). Case-insensitive
   equality on `"json"`.
6. **Viper/config overlay** (`main.go:570-611`). Priority is
   `flags > env > config file > defaults`. `jsonOutput`, `readonlyMode`,
   `dbPath`, `actor`, and `doltAutoCommit` are refreshed from viper only when
   the corresponding flag wasn't explicitly set.
7. **`noDbCommands` fast path** (`main.go:624-708`). Commands that do not
   need the DB: `__complete`, `__completeNoDesc`, `bash`, `bootstrap`,
   `completion`, `context`, `doctor`, `dolt` (parent only; `push/pull/commit`
   subcommands DO need the DB per `main.go:653-658`), `fish`, `help`, `hook`,
   `hooks`, `human`, `init`, `merge`, `onboard`, `powershell`, `prime`,
   `quickstart`, `setup`, `version`, `where`, `zsh`. Root with no subcommand
   also skips store init, as does `--version`.
8. **Sandbox auto-detect** (`main.go:724-729`). Sets `sandboxMode` if
   `isSandboxed()` returns true (checks `.beads/sandbox` marker et al.). On
   auto-detect, prints `"ℹ️  Sandbox detected, using direct mode"` to stderr.
9. **Database discovery** (`main.go:731-775`). If `dbPath` isn't set, calls
   `beads.FindDatabasePath()` (follows `.beads/redirect` files). If not found,
   a fatal error is printed unless the command is `import`, `setup`, or one
   of a short list of `config` subcommands that can run without a store
   (`configCommandCanRunWithoutStore`, `main.go:294-325`: `show`, `validate`,
   `drift`, `apply`, plus `set`/`get`/`unset`/`set-many` when operating on
   yaml-only keys).
10. **Read-only command routing** (`main.go:798`; list at `main.go:101-115`).
    The commands `list`, `ready`, `show`, `stats`, `blocked`, `count`,
    `search`, `graph`, `duplicates`, `comments`, `current`, `backup`, and
    `export` open the store in read-only mode by default (GH#804).
    `bd context` is later inserted into this map at `context_cmd.go:166`.
11. **Auto-migrate** (`main.go:806`). Runs `autoMigrateOnVersionBump()` on
    every command, read-only or not — migration opens its own connection.
12. **Store open** (`main.go:813-888`). Loads config, applies CLI auto-start,
    opens Dolt store. `--global` (`main.go:859-864`) requires shared-server
    mode and routes to the `beads_global` DB.
13. **Auto-import JSONL on empty embedded DB** (`main.go:909-911`). Handles
    the 0.56→1.0+ upgrade path (GH#2994). Skipped for `import`.
14. **Workspace identity validation** (`main.go:917-919`, `main.go:1121-
    1156`). For write commands, compares `.beads/metadata.json` `project_id`
    with `_project_id` metadata in the DB; mismatch is fatal, with
    `BEADS_SKIP_IDENTITY_CHECK=1` escape hatch.
15. **Hook runner + hook-firing decorator** (`main.go:921-935`). Unless
    `BD_NO_HOOKS=1` or `no-hooks` config is set, the store is wrapped in a
    `HookFiringStore` that auto-fires `on_create` / `on_update` / `on_close`
    after each mutation.
16. **Multi-database warning** (`main.go:938`). If more than one `.beads/*.db`
    is in the directory hierarchy, a warning is printed.
17. **Molecule template loader** (`main.go:943-951`). Loads YAML/TOML
    formulas from the search path. Skipped for `import`.

### 2.5 `PersistentPostRun` flow

`main.go:959-1039`:

1. **Dolt auto-commit** (`main.go:962-966`). If `commandDidWrite.Load()` is
   true and no explicit Dolt commit was created, fire `maybeAutoCommit()`.
2. **Tip metadata auto-commit** (`main.go:970-993`). A separate commit for
   `tip_*_last_shown` writes, when `dolt.auto-commit=on` — allows tips to
   persist on otherwise read-only commands.
3. **Auto-backup** (`main.go:996`). Export JSONL to `.beads/backup/` if
   enabled and due.
4. **Auto-export** (`main.go:999`). Write git-tracked JSONL if enabled.
5. **Auto-push** (`main.go:1002-1006`). Push to Dolt remote if enabled;
   skipped for read-only commands to avoid unnecessary metadata writes
   (GH#2191).
6. **Telemetry shutdown + profile/trace close** (`main.go:1017-1033`).

## 3. Command catalog

Commands are sourced from `bd help --list` (an auto-generated index from the
Cobra tree, implemented in `cmd/bd/help_all.go`). The tables below group them
the same way `bd help` groups them, but each entry points to the file in
`cmd/bd/` where the command body lives.

### 3.1 Issue lifecycle

| Command | Purpose | File |
|---|---|---|
| `create` | Create issue (flags, markdown, or graph) | `cmd/bd/create.go`, with `create_form.go` |
| `update` | Update issue fields | `cmd/bd/update.go` |
| `show` | Show issue detail | `cmd/bd/show.go`, `show_format.go`, `show_display.go`, `show_children.go`, `show_refs.go`, `show_thread.go` |
| `close` | Close issues, optionally with `--suggest-next` / `--continue` / `--claim-next` | `cmd/bd/close.go` |
| `reopen` | Reopen a closed issue | `cmd/bd/reopen.go` |
| `delete` | Hard delete issues with reference cleanup | `cmd/bd/delete.go` |
| `defer` | Set status=deferred, optional `--until` | `cmd/bd/defer.go` |
| `undefer` | Clear deferral | `cmd/bd/undefer.go` |
| `assign` | Assign/unassign | `cmd/bd/assign.go` |
| `promote` | Promote (e.g. epic) | `cmd/bd/promote.go` |
| `priority` | Set priority | `cmd/bd/priority.go` |
| `label` | Add/remove labels | `cmd/bd/label.go` |
| `state` / `set-state` / `statuses` | Custom status workflow | `cmd/bd/state.go`, `statuses.go`, `status.go` |
| `tag`, `link`, `relate`, `rename` | Label/link/relate/rename | `cmd/bd/tag.go`, `link.go`, `relate.go`, `rename.go` |
| `comment` / `comments` | Add / list comments | `cmd/bd/comment.go`, `comments.go` |
| `note` | Append to `notes` field | `cmd/bd/note.go` |
| `quick` / `quickstart` | Quick create and starter flow | `cmd/bd/quick.go`, `quickstart.go` |

### 3.2 Views and reports

| Command | Purpose | File |
|---|---|---|
| `list` | Broad filter/list with tree format | `cmd/bd/list.go` (1105 lines), `list_format.go`, `list_output.go`, `list_tree.go` |
| `ready` | Unblocked, status=open | `cmd/bd/ready.go` |
| `blocked` | Blocked issues with reason chain | `cmd/bd/blocked_embedded_test.go` (command is embedded; list.go flags drive it) |
| `search` | Title / desc / notes / external search | `cmd/bd/search.go` |
| `query` / `q` | DSL query engine | `cmd/bd/query.go`, `cmd/bd/q` (alias), `internal/query/` |
| `count` | Count with optional grouping | `cmd/bd/count.go` |
| `stats` | Aggregate statistics | — (bound via storage; invoked from `doctor`/`ready` etc.) |
| `graph` | Dep graph with layered layout | `cmd/bd/graph.go`, `graph_visual.go` |
| `diff` | Diff between states | `cmd/bd/diff.go` |
| `children` | Walk parent-child | `cmd/bd/children.go` |
| `duplicates` / `duplicate` / `find-duplicates` | Content-hash, ID-based, and semantic dedup | `cmd/bd/duplicates.go`, `duplicate.go`, `find_duplicates.go` |
| `last-touched` | Most recently touched issues | `cmd/bd/last_touched.go` |
| `history` | Event log | `cmd/bd/history.go` |
| `routed` | Show routed-to targets | `cmd/bd/routed.go`, `routing_read.go` |

### 3.3 Dependencies and structure

| Command | Purpose | File |
|---|---|---|
| `dep` | `dep add` / `dep rm` / `dep tree` / `dep cycles` | `cmd/bd/dep.go` (1141 lines) |
| `epic` | Epic-specific operations | `cmd/bd/epic.go` |
| `flatten` | Flatten hierarchy | `cmd/bd/flatten.go` |
| `orphans` | Dependency orphan detection | `cmd/bd/orphans.go` |

### 3.4 Sync, data, and version control

| Command | Purpose | File |
|---|---|---|
| `export` | JSONL export (`--all`, `--no-memories`, `--scrub`) | `cmd/bd/export.go`, `export_auto.go`, `export_obsidian.go` |
| `import` | JSONL import (GH#2994 upgrade path) | `cmd/bd/import.go`, `import_shared.go`, `auto_import_upgrade.go` |
| `batch` | Multi-op transaction (stdin/file) | `cmd/bd/batch.go` |
| `graph` (apply) | Apply JSON plan | `cmd/bd/graph_apply.go`, `graph_export.go` |
| `dolt` | Dolt subcommands: `show`, `set`, `start`, `stop`, `status`, `test`, `push`, `pull`, `commit`, `remote add/list/remove` | `cmd/bd/dolt.go`, `dolt_autocommit.go`, `dolt_autocommit_config.go`, `dolt_autopush.go` |
| `vc` | High-level VC wrapper | `cmd/bd/vc.go` |
| `federation` | Peer federation (add-peer, sync) | `cmd/bd/federation.go` (with `federation_nocgo.go`) |
| `ado`, `jira`, `linear`, `github`, `gitlab`, `notion` | Tracker integrations | `cmd/bd/<tracker>.go`, `internal/<tracker>/` |

### 3.5 Setup and configuration

| Command | Purpose | File |
|---|---|---|
| `init` family: `init`, `init-agent`, `init-contributor`, `init-stealth`, `init-team`, `init-templates`, `init-git-hooks`, `init-guard` | Initialize workspace, stealth / team variants | `cmd/bd/init.go`, `init_*.go` |
| `bootstrap` | Bootstrap pre-init steps | `cmd/bd/bootstrap.go` |
| `onboard` | Onboarding flow | `cmd/bd/onboard.go` |
| `setup` | Editor integrations | `cmd/bd/setup.go` + `setup/` |
| `quickstart` | First-run friendly flow | `cmd/bd/quickstart.go` |
| `config` | `show` / `get` / `set` / `unset` / `set-many` / `list` / `apply` / `drift` / `validate` | `cmd/bd/config.go`, `config_apply.go`, `config_drift.go`, `config_show.go`, `config_side_effects.go` |
| `context` | Show effective backend identity | `cmd/bd/context.go`, `context_cmd.go` |
| `prime` | Session-start workflow context | `cmd/bd/prime.go` |
| `prompt` | Print an example LLM prompt | `cmd/bd/prompt.go` |
| `where` | Show data locations | `cmd/bd/where.go` |
| `info` | Basic info | `cmd/bd/info.go` |
| `hooks` | Install / uninstall / list / run git hooks | `cmd/bd/hooks.go` (1287 lines) |
| `migrate-hooks` | Migrate legacy hook format | `cmd/bd/migrate_hooks.go`, `migrate_hooks_apply.go` |

### 3.6 Maintenance

| Command | Purpose | File |
|---|---|---|
| `doctor` | Health checks, `--fix`, `--check=*`, `--agent`, `--perf`, `--server`, `--migration` | `cmd/bd/doctor.go` (1255 lines), `doctor_*.go`, `doctor/` |
| `preflight` | Pre-PR contributor checklist | `cmd/bd/preflight.go` |
| `lint` | Template compliance for open issues | `cmd/bd/lint.go` |
| `stale` | List inactive issues | `cmd/bd/stale.go` |
| `audit` | Audit events | `cmd/bd/audit.go` |
| `cleanup` | Bulk-delete closed issues | `cmd/bd/cleanup.go` |
| `purge` | Delete closed ephemeral wisps | `cmd/bd/purge.go` |
| `reset` | Remove `.beads/` workspace | `cmd/bd/reset.go` |
| `compact` / `compact dolt` | Semantic and Dolt history compaction | `cmd/bd/compact.go`, `compact_dolt.go` |
| `migrate` | Metadata/version migration | `cmd/bd/migrate.go`, `migrate_issues.go` |
| `rename-prefix` | Bulk issue prefix rename | `cmd/bd/rename_prefix.go` |
| `upgrade` | Upgrade the CLI | `cmd/bd/upgrade.go` |
| `sql` | Execute raw SQL | `cmd/bd/sql.go` |
| `kv` | KV store (`set/get/clear/list`) | `cmd/bd/kv.go` |
| `detect-pollution` | Test-issue pollution detector | `cmd/bd/detect_pollution.go`, `doctor_pollution.go` |
| `backup`, `restore` | JSONL/Dolt backup and restore | `cmd/bd/backup*.go`, `restore.go` |
| `gate`, `gate-discover` | Async gate workflows | `cmd/bd/gate.go`, `gate_discover.go` |
| `merge-slot` | Allocate a merge slot | `cmd/bd/merge_slot.go` |
| `ship` | Ship helper | `cmd/bd/ship.go` |
| `supersede` | Mark as superseded | handled in `cmd/bd/duplicate.go` family |
| `rules` | Rule engine | `cmd/bd/rules.go` |
| `repo` | Multi-repo hydration | `cmd/bd/repo.go` |

### 3.7 Collaboration primitives

| Command | Purpose | File |
|---|---|---|
| `mail` | Delegates to external provider | `cmd/bd/mail.go` |
| `remember`, `memories`, `recall`, `forget` | Persistent memories | `cmd/bd/memory.go` |
| `human` | Escalate for human decision | `cmd/bd/human.go` |
| `feedback` | Feedback channel | `cmd/bd/feedback.go` |
| `swarm` | Swarm ops | `cmd/bd/swarm.go` |
| `todo` | Quick todo add | `cmd/bd/todo.go` |
| `tips` | Show tips | `cmd/bd/tips.go` |
| `thanks` | Acknowledgement message | `cmd/bd/thanks.go` |

### 3.8 Formulas and molecules

| Command | Purpose | File |
|---|---|---|
| `formula` | `list`, `show`, `convert` | `cmd/bd/formula.go` |
| `cook` | Compile / runtime formula cooking | `cmd/bd/cook.go` |
| `pour` / `mol pour` | Instantiate persistent molecule | `cmd/bd/pour.go`, `mol.go`, `mol_*.go` |
| `mol` | `current`, `progress`, `show`, `bond`, `burn`, `distill`, `last-activity`, `ready-gated`, `seed`, `squash`, `stale` | `cmd/bd/mol.go`, `mol_*.go` |
| `wisp` | Ephemeral molecule instantiation (separate from `bd mol wisp`) | `cmd/bd/wisp.go` |

### 3.9 Introspection / completion / dev

| Command | Purpose | File |
|---|---|---|
| `completion` | Shell completions for `bash`, `zsh`, `fish`, `powershell` | `cmd/bd/completions.go` |
| `docs` | Generate docs | `cmd/bd/docs.md`, plus `markdown.go` |
| `help` | Help; `--all`, `--list`, `--doc` for markdown emission | `cmd/bd/help_all.go`, `main_help.go` |
| `version` | Version / build info | `cmd/bd/version.go`, `version_tracking.go` |
| `admin` | Admin operations | `cmd/bd/admin.go` |
| `types` | Issue types | `cmd/bd/types.go` |

### 3.10 Hidden / not advertised in help overview

`bd help` groups commands under visible titles, but the Cobra tree contains
commands that are either ungrouped, undocumented, or flagged hidden:

- `__complete` / `__completeNoDesc` — Cobra's internal shell-completion
  machinery. Listed in `noDbCommands` (`main.go:625-626`).
- `--format` (persistent flag alias) is marked hidden
  (`main.go:469`).
- `bd hook` (singular) is referenced in `noDbCommands` (`main.go:635`) but
  the actual registered family is `bd hooks` (`hooks.go:416-1287`); the
  singular form is accepted via parent lookup.
- `bd direct-mode` implementation: `cmd/bd/direct_mode.go` (mode switching
  between embedded and server Dolt, used internally).
- `bd protocol` — directory `cmd/bd/protocol/` contains protocol
  definitions (inspected via listing; deferred).
- `bd gc` — `cmd/bd/gc.go`. Name collides with gascity's CLI; this is the
  beads garbage-collect command.
- `bd purge` is marketed for wisps but will hard-delete any closed
  ephemeral bead; treat as destructive.
- `bd dolt` subcommands `push/pull/commit` look like config operations but
  have the `needsStoreDoltSubcommands` exemption (`main.go:653`) — they open
  the store.
- `bd dolt remote add/list/remove` is a grandchild case (`main.go:657-658`).
  Any other grandchild of a `noDbCommands` parent is silently allowed to
  skip init.

## 4. JSON output reference

All JSON output is emitted through helpers in `cmd/bd/output.go`; errors in
JSON mode use `cmd/bd/errors.go` and emit `{"error": "...", "hint": "..."}`.
Fields are produced via `encoding/json.Marshal` of typed structs with
`omitempty` where declared.

### 4.1 `bd show --json`

Args: zero or more issue IDs. Output: JSON **array** of issue-detail objects
(even for a single ID).

Implementation: `cmd/bd/show.go`. The emitted struct (`IssueDetails`, local
to show.go) embeds the core `types.Issue`, adds labels, dependencies,
dependents, comments, and epic child counts if applicable.

The core `types.Issue` fields come from
`github/gastownhall/beads/internal/types/types.go` (see `bd list --json`
below for the exhaustive list of fields and omitempty semantics).

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
      {
        "id": "bd-xyz789",
        "title": "Implement JWT validation",
        "dependency_type": "blocks",
        "status": "in_progress",
        "priority": 1,
        "issue_type": "task"
      }
    ],
    "dependents": [
      {
        "id": "bd-def456",
        "title": "Update auth docs",
        "dependency_type": "blocks",
        "status": "blocked"
      }
    ],
    "comments": [
      {
        "id": "cmt-001",
        "issue_id": "bd-abc123",
        "author": "bob",
        "text": "Started on this",
        "created_at": "2026-04-15T09:00:00Z"
      }
    ],
    "parent": "bd-epic-001",
    "epic_total_children": 5,
    "epic_closed_children": 2,
    "epic_closeable": false
  }
]
```

Epic-only fields (`epic_total_children`, `epic_closed_children`,
`epic_closeable`) are emitted only when `issue_type == "epic"`. Comments are
emitted if any exist.

### 4.2 `bd list --json`

Implementation: `cmd/bd/list.go`. Output: JSON array of `IssueWithCounts`.

The underlying Issue struct is defined in
`internal/types/types.go` (around line 14+). Fields, with emission policy:

| Field | Type | Emission |
|---|---|---|
| `id` | string | always |
| `title` | string | always |
| `description` | string | omitempty |
| `design` | string | omitempty |
| `acceptance_criteria` | string | omitempty |
| `notes` | string | omitempty |
| `spec_id` | string | omitempty |
| `status` | string | omitempty (usually present) |
| `priority` | int | always (zero is P0) |
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
| `bonded_from` | []…  | omitempty (compounds) |
| `await_type` | string | omitempty (gates) |
| `await_id` | string | omitempty |
| `timeout` | duration | omitempty |
| `waiters` | []string | omitempty |
| `source_formula` | string | omitempty |
| `source_location` | string | omitempty |

`IssueWithCounts` wraps the issue with:

| Field | Type | Emission |
|---|---|---|
| `dependency_count` | int | always |
| `dependent_count` | int | always |
| `comment_count` | int | always |
| `parent` | string | omitempty |

Populated via `GetLabelsForIssues`, `GetDependencyCounts`, and
`GetDependencyRecordsForIssues` (`ready.go:188-220` shows the same
population pattern for `bd ready`).

### 4.3 `bd ready --json`

Implementation: `cmd/bd/ready.go:178-224`. Same shape as `bd list --json`: an
array of `IssueWithCounts`. Always an array (empty list becomes `[]`, see
`ready.go:180-182`). Parent is computed from `DepParentChild` dependency
records (`ready.go:206-212`).

`bd ready --mol <mol-id> --json`: different shape — molecule-ready output
(see §10.3). `bd ready --explain --json`: a `ReadyExplanation` with
`Ready[]`, `Blocked[]`, `Cycles[]`, and `Summary` fields.

### 4.4 `bd search --json`

Implementation: `cmd/bd/search.go:246-288`. Array of `IssueWithCounts`, same
shape as `bd list --json`. Limit is enforced in SQL; when `--sort` is not
used, limit+1 fetch detects truncation (list.go also uses this).

### 4.5 `bd create --json`

Implementation: `cmd/bd/create.go`. Single issue object.

### 4.6 `bd update --json`

Implementation: `cmd/bd/update.go`. Array of updated issue objects (to
support batch updates).

### 4.7 `bd close --json`

Implementation: `cmd/bd/close.go`. The shape depends on flags:

- No extra flags: JSON array of closed Issue objects.
- `--suggest-next`: `{"closed": [...], "unblocked": [...]}` — unblocked is
  newly-ready issues after closing.
- `--continue`: `{"closed": [...], "continue": {"root_id": "...",
  "next_step_id": "...", "step_index": N, "total_steps": N}}` — next step in
  a molecule.
- `--claim-next`: `{"closed": [...], "claimed": {...}}` — claim the next
  ready bead after closing.

`--reason="..."` is stored into `close_reason`.

### 4.8 `bd count --json`

Implementation: `cmd/bd/count.go`.

Plain: `{"count": 42}`.

With `--by-status` / `--by-type` / `--by-assignee`: a grouped shape:

```json
{
  "total": 42,
  "groups": [
    {"group": "open", "count": 30},
    {"group": "in_progress", "count": 12}
  ]
}
```

### 4.9 `bd dep <sub> --json`

- `bd dep add --json` → `{"status": "added", "issue_id": "...",
  "depends_on_id": "...", "type": "blocks"}`.
- `bd dep rm --json` → `{"status": "removed", "issue_id": "...",
  "depends_on_id": "..."}`.
- `bd dep tree --json` → nested tree (Issue wrapper, with `dependencies`
  array recursively populated).
- `bd dep cycles --json` → array of `{"cycle": [ {id, title}, ... ]}`. Each
  cycle is the ordered chain; the first ID appears again at the end to
  close the loop.

All implementations are in `cmd/bd/dep.go` (1141 lines).

### 4.10 `bd graph --json`

Implementation: `cmd/bd/graph.go`. Shape:

```json
{
  "root": {"id": "bd-abc123", "title": "..."},
  "issues": [ ... ],
  "layout": {
    "nodes": {"bd-abc123": {"issue": {...}, "layer": 0, "position": 0,
      "depends_on": []}},
    "layers": [["bd-abc123"]],
    "max_layer": 3,
    "root_id": "bd-abc123"
  }
}
```

`--dot`, `--compact`, `--box`, `--html` produce non-JSON visualizations;
`bd graph -f dot` emits Graphviz DOT directly.

### 4.11 `bd context --json`

Implementation: `cmd/bd/context_cmd.go:14-31`. Struct:

```go
type ContextInfo struct {
    BeadsDir      string `json:"beads_dir"`              // always
    RepoRoot      string `json:"repo_root"`              // always
    CWDRepoRoot   string `json:"cwd_repo_root,omitempty"`
    IsRedirected  bool   `json:"is_redirected"`          // always
    IsWorktree    bool   `json:"is_worktree"`            // always
    Backend       string `json:"backend"`                // always ("dolt")
    DoltMode      string `json:"dolt_mode"`              // always
    ServerHost    string `json:"server_host,omitempty"`
    ServerPort    int    `json:"server_port,omitempty"`
    Database      string `json:"database"`               // always
    DataDir       string `json:"data_dir,omitempty"`
    ProjectID     string `json:"project_id,omitempty"`
    SyncRemote    string `json:"sync_remote,omitempty"`
    SyncGitRemote string `json:"sync_git_remote,omitempty"` // deprecated
    Role          string `json:"role,omitempty"`
    BdVersion     string `json:"bd_version"`             // always
}
```

`bd context` is in `noDbCommands` (`main.go:630`) and does not open the DB;
it reads `.beads/metadata.json` directly (`context_cmd.go:80-103`). It's
also added to `readOnlyCommands` via `context_cmd.go:166` for belt-and-
suspenders.

### 4.12 `bd doctor --json`

Implementation: `cmd/bd/doctor.go`. Shape:

```json
{
  "path": "/path/.beads",
  "checks": [
    {"name": "database_exists", "status": "ok", "message": "..."},
    {"name": "schema_version", "status": "ok", "message": "...",
     "detail": "...", "fix": "...", "category": "database"}
  ],
  "overall_ok": true,
  "cli_version": "1.0.0",
  "timestamp": "2026-04-23T15:00:00Z",
  "platform": {"os": "linux", "arch": "amd64"},
  "suppressed_count": 0
}
```

Per-check fields: `name`, `status` (`ok`/`warning`/`error`), `message`,
`detail` (omitempty), `fix` (omitempty), `category` (omitempty).

### 4.13 `bd config show --json`

Implementation: `cmd/bd/config_show.go`. Array of entries:

```json
[
  {"key": "create.require-description", "value": "true",
   "source": "config.yaml"},
  {"key": "validation.on-close", "value": "warn",
   "source": "env: BD_VALIDATION_ON_CLOSE"}
]
```

`source` values include: `default`, `env: <VAR>`, `config.yaml`,
`metadata`, `database`, `git`.

### 4.14 `bd remember --json`, `bd memories --json`, `bd recall --json`, `bd forget --json`

Implementation: `cmd/bd/memory.go`.

- `remember` → `{"key": "...", "value": "...", "action": "remembered"|"updated"}` (`memory.go:99-103`). `updated` when a prior memory with the same key existed (`memory.go:86-89`).
- `memories [search]` → plain `{"key": "value", ...}` map, filtered by
  substring (`memory.go:148-157`) on both key and value, lower-cased
  (`memory.go:151-152`). Missing search text lists all.
- `recall <key>` → `{"key": "...", "value": "...", "found": true|false}`
  (`memory.go:277-281`). Exits 1 if not found (`memory.go:283-285`).
- `forget <key>` → `{"key": "...", "deleted": "true"}` on success
  (`memory.go:241-244`). If not found in JSON mode: `{"key": "...",
  "found": "false"}` with exit 1 (`memory.go:223-228`).

Memory storage is `store.SetConfig(kv.memory.<key>, value)`
(`memory.go:80, 91`). Keys are slugified from the first ~8 words by
`slugify()` (`memory.go:21-42`): lower-cased, non-alphanumeric collapsed to
hyphens, truncated to 60 chars. Auto-commit after set and delete
(`memory.go:94-96`, `memory.go:236-238`).

### 4.15 `bd duplicates --json`

Implementation: `cmd/bd/duplicates.go`. Shape:

```json
{
  "duplicate_groups": 2,
  "groups": [
    {"issues": [ {"id":"bd-a","is_merge_target":true}, {"id":"bd-b"} ],
     "target": "bd-a",
     "suggested_action": "bd close bd-b && bd dep add bd-b bd-a --type related"}
  ],
  "merge_commands": [ "..." ]
}
```

### 4.16 `bd export --format=json`

`bd export` emits JSONL by default (one Issue per line, plus memory lines
of shape `{"_type": "memory", "key": "...", "value": "..."}`). Whether
`--format=json` emits a single JSON array or JSONL: source tree check
pending — treat JSONL as the contract.

### 4.17 `bd formula list --json` / `bd formula show --json`

Implementation: `cmd/bd/formula.go`.

`list --json`: array of entries with `name`, `type`
(`workflow`/`expansion`/`aspect`/`convoy`), `description`, `source` (path
to the formula file), `steps` (count), `vars` (count).

`show --json`: the full `Formula` struct (from `internal/formula/types.go`).

### 4.18 `bd mol <sub> --json`

- `mol current --json` — shows "you are here" in a molecule; step states
  `done`/`current`/`ready`/`blocked`.
- `mol progress --json` — `{"molecule_id","molecule_title","total",
  "completed","in_progress","current_step_id","percent","rate_per_hour",
  "eta_hours"}` (`mol_progress.go`).
- `mol show --json` — `{"root": Issue, "issues": [...],
  "dependencies": [...], "variables": {...}, "is_compound": bool,
  "bonded_from": [...]}`.
- `mol last-activity --json` — `{"molecule_id", "last_activity",
  "source", "source_step_id"}`.

### 4.19 Commands without `--json`

- `bd mail <…>` delegates (DisableFlagParsing at `mail.go:38`); all output
  shapes are the provider's.
- `bd human` — human-facing escalation text.
- `bd children` / `bd blocked` — usually use underlying `list` JSON.

## 5. Hook interface

Beads has two distinct hook families, both under `bd hooks`:

1. **Git hooks** — `.git/hooks/<name>` or, more recently, `.beads/hooks/` and
   `.beads-hooks/`. Managed by `bd hooks install/uninstall/list/run`.
2. **Mutation hooks** — `on_create`, `on_update`, `on_close` executables in
   `.beads/hooks/`, wrapped around the store via `HookFiringStore`.

### 5.1 `bd hooks install | uninstall | list | run`

Implementation: `cmd/bd/hooks.go` (1287 lines). Five git-hook types are
managed (`hooks.go:22, 281`): `pre-commit`, `post-merge`, `pre-push`,
`post-checkout`, `prepare-commit-msg`.

- `bd hooks install` (`hooks.go:430-489`): default installs to
  `.git/hooks/`. `--beads` installs to `.beads/hooks/` and sets
  `core.hooksPath=.beads/hooks`; `--shared` installs to `.beads-hooks/`
  (versioned / committable). `--force` overwrites without preserving user
  content; otherwise section markers preserve anything outside the managed
  block. `--chain` renames existing hooks to `.old` for manual chaining (now
  also done automatically via section markers).
- `bd hooks uninstall` (`hooks.go:491-511`) removes the managed section
  between markers, preserving user content.
- `bd hooks list` (`hooks.go:513-542`) reports per-hook `Installed`,
  `Version`, `IsShim`, `Outdated`. Emits JSON with `--json`.
- `bd hooks run <name> [args...]` (`hooks.go:1227-1273`) is called by the
  shim; executes the actual hook logic. Exit 3 means "DB not initialized",
  which the shim translates to success.

Hooks execute real work:

- `runPreCommitHook` (`hooks.go:1045-1057`) runs chained user hook, then
  `exportJSONLForCommit` if `export.auto` is on (`hooks.go:1064-1102`).
- `runPostMergeHook` (`hooks.go:1120-1126`) always returns 0.
- `runPrePushHook` (`hooks.go:1130-1136`) can block push via chained hook.
- `runPostCheckoutHook` (`hooks.go:1143-1149`) always returns 0.
- `runPrepareCommitMsgHook` (`hooks.go:1156-1210`) adds an `Executed-By:`
  trailer from `BD_ACTOR` for forensics; skips on merge; never blocks.

**Section marker format** (`hooks.go:33-44`): the shim block begins with
`# --- BEGIN BEADS INTEGRATION vX.Y.Z ---` and ends with
`# --- END BEADS INTEGRATION vX.Y.Z ---`. Inside: sets `BD_GIT_HOOK=1`, uses
`timeout $BEADS_HOOK_TIMEOUT` (default `300`s), converts exit 124 (timeout)
to 0, and translates exit 3 (no DB) to success.

### 5.2 `bd prime`

Implementation: `cmd/bd/prime.go` (515 lines). Purpose: emit a
"session-start" markdown preamble for AI agents to recover context after
compaction or between sessions.

Exit behavior is quiet: if not in a beads project (`FindBeadsDir()` empty),
exits 0 with no output (`prime.go:70-75`). All errors during output are
silenced (`prime.go:122-125`) — the command is designed to be wired into
`SessionStart` hooks and never crash the session.

Flag surface (`prime.go:130-133`):

- `--full` — force CLI mode (ignore MCP detection).
- `--mcp` — force MCP mode (brief).
- `--stealth` — no-git-ops session-close protocol. Also triggered by
  `no-git-ops: true` in config (`prime.go:88`).
- `--export` — emit the default content ignoring `PRIME.md` overrides.

**MCP auto-detect** (`prime.go:138-176`): reads `~/.claude/settings.json`,
walks `mcpServers`, and if any key contains `"beads"` (case-insensitive),
activates MCP mode.

**PRIME.md override chain** (`prime.go:94-118`):

1. `./.beads/PRIME.md` (cwd, clone-specific)
2. `<resolvedBeadsDir>/PRIME.md` (shared workspace)
3. `~/.config/beads/PRIME.md` (via `resolveGlobalPrimePath`, `prime.go:28-
   44`)

If any override is present and `--export` isn't set, prime prints it
verbatim and exits. Otherwise the default preamble is generated with
`outputPrimeContext(stdout, mcpMode, stealthMode)` (`prime.go:121`).

Memory injection (stated by the subsystem scan): memories stored under
`kv.memory.<key>` (see §4.14) are emitted at the bottom of the preamble.
MCP mode truncates values to ~150 chars; CLI mode writes full content.

### 5.3 Mutation hooks (`on_create`, `on_update`, `on_close`)

Implementation: `internal/hooks/hooks.go` (entire file, 136 lines).

Events are declared at `internal/hooks/hooks.go:13-18`:

```go
const (
    EventCreate = "create"
    EventUpdate = "update"
    EventClose  = "close"
)
```

Hook file names: `on_create`, `on_update`, `on_close` (`hooks.go:20-25`).

The `Runner` struct is at `hooks.go:27-31`, constructed via
`NewRunner(hooksDir)` (`hooks.go:35-40`) or
`NewRunnerFromWorkspace(root)` (`hooks.go:43-45`). The timeout is
hard-coded to 10 seconds (`hooks.go:38`).

`Run(event, issue)` (`hooks.go:49-72`) is asynchronous and fire-and-
forget: it stats the hook file, checks executable bit (`0111`), and spawns
a goroutine to invoke it. It never blocks or returns a value.

`RunSync(event, issue)` (`hooks.go:76-95`) is the synchronous variant for
tests. `HookExists(event)` (`hooks.go:98-111`) is a pure check.

Hook output: stdout/stderr is captured; anything over 1024 bytes is
truncated (`hooks.go:115`, `truncateOutput` at `hooks.go:118-123`). The
truncated output is attached to the OTel span but not printed to the user.

### 5.4 Hook invocation protocol

Hooks are invoked as:

```bash
/path/to/.beads/hooks/on_create <issue-id> <event-type>
```

The `types.Issue` struct is serialized as JSON on stdin. (Confirmed by the
subsystem agent reading `internal/hooks/hooks_unix.go:54`.) The exact JSON
fields match §4.2.

Unix specifics (from `internal/hooks/hooks_unix.go`):

- The child process is placed in its own process group (`Setpgid: true`);
  on timeout the whole group is killed with `syscall.Kill(-pid, SIGKILL)`.
- Context-based timeout is 10s per hook (fixed).
- OTel span `hook.exec` with attributes `hook.event`, `hook.path`,
  `bd.issue_id`; stdout/stderr captured as span events.

### 5.5 `HookFiringStore` wrapping

Implementation: `internal/storage/hook_decorator.go`. Wrapping point:
`cmd/bd/main.go:921-935`.

Operations that fire hooks (from subsystem scan at
`internal/storage/hook_decorator.go:59-167`):

| Operation | Event |
|---|---|
| `CreateIssue`, `CreateIssues` | `on_create` |
| `UpdateIssue`, `ReopenIssue`, `UpdateIssueType` | `on_update` |
| `CloseIssue` | `on_close` |
| `AddDependency`, `RemoveDependency` | `on_update` |
| `AddLabel`, `RemoveLabel` | `on_update` |
| `AddIssueComment` | `on_update` |

`DeleteIssue` does NOT fire hooks (the issue no longer exists).

Transactions (`hook_decorator.go:175-189`): inside
`RunInTransaction`, pending hook events accumulate and fire only after the
Dolt commit succeeds. On rollback, no hooks fire.

### 5.6 Disabling hooks

- `BD_NO_HOOKS=1` env var — simplest kill-switch. Checked at
  `main.go:933` via `config.GetBool("no-hooks")`.
- `bd config set no-hooks true` — persistent.

When disabled, the store is not wrapped; all mutations bypass
`HookFiringStore` entirely.

### 5.7 Migration from legacy hooks

Implementation: `cmd/bd/migrate_hooks.go`, `cmd/bd/migrate_hooks_apply.go`,
`cmd/bd/init_git_hooks.go`. Each existing hook is categorized by the
subsystem scan (see §hygiene below for states); legacy hooks become
`.old.migrated` or are rewritten with section markers.

## 6. Search, filter, and ready semantics

Four commands expose query surface: `bd list`, `bd search`, `bd ready`,
`bd query` (alias `bd q`). Each has a different filter language.

### 6.1 `bd search`

Implementation: `cmd/bd/search.go`. Primary query routed to title + ID by
default; descriptions, notes, and external refs require explicit flags.

| Flag | Behavior |
|---|---|
| `--status, -s` (search.go:347) | `open/in_progress/blocked/deferred/closed/all`. Defaults exclude closed; `all` includes them. |
| `--type, -t` (search.go:349) | Issue type filter (`bug/feature/task/epic/chore/decision/merge-request/molecule/gate`). |
| `--label, -l` (search.go:351) | Repeatable; AND across labels. |
| `--label-any` | Repeatable; OR across labels. |
| `--assignee, -a` | Exact match. |
| `--priority-min/--priority-max` | Inclusive range; accepts `0-4` or `P0-P4`. |
| `--created-after/before`, `--updated-after/before`, `--closed-after/before` | YYYY-MM-DD or RFC3339. |
| `--desc-contains`, `--notes-contains`, `--external-contains` | Case-insensitive substring. |
| `--empty-description`, `--no-assignee`, `--no-labels` | Existence checks. |
| `--metadata-field key=value`, `--has-metadata-key key` | JSON metadata; key validated by `storage.ValidateMetadataKey`. |
| `--sort` (search.go:354) | `priority/created/updated/closed/status/id/title/type/assignee`. |
| `--reverse, -r` | Reverse sort. |
| `--limit, -n` | Default 50. |
| `--long` / `--json` | Output modes. |

All matching uses SQL `LIKE` (case-insensitive under MySQL/Dolt
collation). IDs match exact-or-prefix (search.go:19-22).

### 6.2 `bd list`

Implementation: `cmd/bd/list.go` (1105 lines). The most feature-rich filter
surface.

Status is comma-separable for OR (`--status open,in_progress`,
list.go:489; GH#2846). Default excludes `closed` and `pinned`
(list.go:529-540). `--all` overrides.

`--ready` (list.go:419) filters only by `status=open`. It is NOT the same
as `bd ready`, which is blocker-aware (ready.go:21-26, 104).

Extra filters beyond `bd search`:

- `--label-pattern <glob>` / `--label-regex <re>` — glob and regex label
  matching.
- `--id <id1,id2,...>` — comma-separated exact IDs.
- `--spec <prefix>` — spec_id prefix.
- `--parent <id>` / `--filter-parent <id>` / `--no-parent` — parent/child
  filtering via parent-child dep or dotted ID prefix.
- `--exclude-type <t>` — repeatable or comma-separated.
- `--include-templates`, `--include-gates`, `--include-infra` — opt-in to
  normally-hidden classes.
- `--mol-type swarm|patrol|work`, `--wisp-type ...`.
- `--deferred`, `--defer-after <time>`, `--defer-before <time>`,
  `--due-after`, `--due-before`, `--overdue` — time-based (GH#820).
- `--format digraph|dot|<go-template>`, `--pretty`, `--tree`, `--flat`,
  `--long`, `--watch`.
- `--no-pager` (bd-jdz3).
- `--limit`/`-n` default 50 (list.go:452 shows agent mode default 20);
  `--all` overrides.
- When `--sort` is set, limit is enforced in Go after sort to avoid SQL
  truncation (list.go:468-472); fetch `limit+1` detects truncation.

Directory-aware labels (list.go:432-436): if no labels are provided and
`directory.labels` is configured for the CWD, they are applied with OR
semantics (GH#541).

### 6.3 `bd ready` semantics

Implementation: `cmd/bd/ready.go`. Unlike `bd list --ready`, `bd ready`
uses `GetReadyWork`, which applies blocker-aware logic.

**Fixed filters** (ready.go:103-114):

- `Status = "open"` (not `in_progress`, not `blocked`).
- Default excludes merge-request / gate / molecule / message / agent / role
  / rig (inferred from subsystem query of
  `internal/storage/dolt/queries.go:61-85`).
- Default excludes wisps unless `--include-ephemeral` (bd-i5k5x).
- Default excludes `defer_until > NOW()` unless `--include-deferred`
  (GH#820, ready.go:69).

**Blocker semantics** (from subsystem scan of
`internal/storage/issueops/blocked.go`):

- Active blockers are the dependency types `blocks`, `conditional-blocks`,
  and `waits-for`.
- A dependency is "active" only if BOTH the blocker and blockee have
  status ≠ `closed`, ≠ `pinned`.
- Soft relationship types (`parent-child`, `related`, `discovered-from`,
  `replies-to`, `relates-to`, `duplicates`, `supersedes`, `authored-by`,
  `assigned-to`, `approved-by`, `attests`) do NOT block.

Flag surface specific to `bd ready`:

- `--mol <mol-id>` (ready.go:44-48) — switches to molecule-ready mode
  (`runMoleculeReady`). Output gains `parallel_groups` data.
- `--gated` (ready.go:37-41) — runs `runMolReadyGated` to find molecules
  eligible for gate-resume dispatch.
- `--explain` (ready.go:51-55) — runs `runReadyExplain`. JSON is a
  `ReadyExplanation` containing `Ready[]`, `Blocked[]`, `Cycles[]`,
  `Summary`. Uses `DetectCycles` for cycle reporting.
- `--sort` is a `SortPolicy`: `priority`, `oldest`, `hybrid` (default).
  Validated via `SortPolicy.IsValid()` (ready.go:157-159). No `--reverse`.

### 6.4 `bd query` / `bd q` DSL

Implementation: `cmd/bd/query.go`, parser + lexer + evaluator under
`internal/query/`.

Grammar (summarized from subsystem scan of
`internal/query/parser.go:91-301`):

```
expr     := or_expr
or_expr  := and_expr ( OR and_expr )*
and_expr := not_expr ( AND not_expr )*
not_expr := NOT not_expr | cmp
cmp      := IDENT OP value | "(" expr ")"
OP       := = | != | < | <= | > | >=
value    := STRING | NUMBER | DURATION
DURATION := \d+[hdwmy]
```

`AND`, `OR`, `NOT` are case-insensitive. `NOT` has the highest precedence
(right-assoc), then `AND`, then `OR` (lowest, left-assoc) — per the
subsystem scan of `internal/query/parser.go:153-193`.

Fields (from `internal/query/parser.go:305-341`): `id`, `title`,
`description`/`desc`, `status`, `priority`, `type`, `assignee`, `owner`,
`created`/`created_at`, `updated`/`updated_at`, `closed`/`closed_at`,
`started`/`started_at`, `label`/`labels`, `pinned`, `ephemeral`,
`template`, `spec`/`spec_id`, `parent`, `mol_type`, `notes`,
`has_metadata_key`, `metadata.<key>`.

Date values (from `internal/timeparsing/parser.go:135-180`): compact
duration `[+-]?\d+[hdwmy]` first, then absolute (`YYYY-MM-DD`, RFC3339,
ISO 8601, space-datetime), then natural language via
`github.com/olebedev/when` (tomorrow, next monday, in 3 days, etc.).

Evaluator chooses strategy automatically (from subsystem scan of
`internal/query/evaluator.go:72-154`): AND chains of simple comparisons
and OR-on-labels run in filter-only mode; mixed-field ORs and complex
NOTs fall back to predicate mode that fetches `limit*3` results (min 100)
and filters in Go.

`--all` (`-a`) or an explicit `status=closed` in the query is required to
include closed issues; otherwise closed is excluded (`query.go:121`).
`--parse-only` prints the AST and exits (useful for debugging).

### 6.5 Label matching summary

- AND on list/search/ready: `--label X --label Y` (repeatable).
- OR: `--label-any X --label-any Y`.
- Glob / regex: `--label-pattern`, `--label-regex` (list only).
- In `bd query`: `label=X` in an AND chain AND's; in OR it becomes
  `LabelsAny` (optimized to filter-only).
- `--no-labels` matches issues with empty label set.
- Normalization: `utils.NormalizeLabels` trims, dedupes, removes empty
  entries (search.go:90-91, list.go:432, ready.go:83-84).

## 7. Batch, graph, import, export

### 7.1 `bd batch` grammar

Implementation: `cmd/bd/batch.go`. Single-transaction multi-op runner for
shell-script drivers. Read from stdin (default) or `-f/--file`. All
operations run in one Dolt transaction; on any error the whole batch rolls
back (batch.go:17-28).

Grammar (batch.go:45-54):

```
close <id> [reason...]
update <id> <key>=<value> [<key>=<value> ...]
create <type> <priority> <title...>
dep add <from-id> <to-id> [type]
dep remove <from-id> <to-id>
#comment
```

Blank lines and `# comments` are ignored. Tokenization is
whitespace-separated with support for `"quoted strings"` (embedded spaces),
`\"`, `\\`.

Accepted `update` keys (batch.go:425-463): `status`, `priority`, `title`,
`assignee`. Anything else errors out loudly.

Dep types (from `internal/types/types.go:768-801`): `blocks` (default),
`related`, `parent-child`, `discovered-from`, `waits-for`, `replies-to`,
`relates-to`, `duplicates`, `supersedes`, `authored-by`, `assigned-to`,
`approved-by`, `attests`, `tracks`, `until`, `caused-by`, `validates`,
`delegated-from`.

Execution (batch.go:141-156): single transaction ends with
`bd: batch <N> ops by <actor>` (customizable via `--message`).

### 7.2 `bd create --file <markdown>` format

Implementation: `cmd/bd/markdown.go`, `cmd/bd/create.go`.

Grammar (markdown.go:133-163):

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
- …

### Assignee
username

### Labels
label1, label2

### Dependencies
bd-10, bd-20
```

Sections (markdown.go:68-102): `priority`, `type`, `description`, `design`,
`acceptance criteria`/`acceptance`, `assignee`, `labels`,
`dependencies`/`deps`. Section order is arbitrary. Body content before the
first `###` becomes description.

Dependency entries (markdown.go:44-66, 345-376):

```
bd-10                       # defaults to blocks
bd-10, bd-20                # multiple, all blocks
blocks:bd-10, related:bd-20 # explicit type per entry
```

All issues created in a single `store.CreateIssues()` inside one Dolt
commit (`bd: create <N> issue(s) from <filename>`).

### 7.3 `bd create --graph <json>` schema

Implementation: `cmd/bd/graph_apply.go` (334 lines). See graph_apply.go:15-
45 for the plan struct, graph_apply.go:88-173 for validation,
graph_apply.go:175-324 for atomic apply.

Top-level:

```json
{
  "commit_message": "optional custom commit message",
  "nodes": [ /* PlanNode */ ],
  "edges": [ /* PlanEdge */ ]
}
```

`PlanNode` (graph_apply.go:22-36):

| Field | Required | Notes |
|---|---|---|
| `key` | yes | Unique within plan. |
| `title` | yes | ≤ 500 chars. |
| `type` | no | Defaults to `task`. |
| `description` | no | |
| `assignee` | no | |
| `assign_after_create` | no | If true, assignee set AFTER deps/labels. |
| `priority` | no | 0–4; defaults to 2 when omitted (null). |
| `labels` | no | Applied to created issue. |
| `metadata` | no | Arbitrary JSON. |
| `metadata_refs` | no | map[string]string → issue IDs resolved after node creation. |
| `parent_key` | no | Reference to another node's key; creates parent-child dep. |
| `parent_id` | no | Explicit external parent ID. |

`PlanEdge` (graph_apply.go:38-45): `from_key`/`from_id` and
`to_key`/`to_id` (either side can be a plan key or an external ID). `type`
defaults to `blocks`.

Apply order (graph_apply.go:175-324):

1. Create all issues via `store.CreateIssues()`.
2. Add labels for each node.
3. Resolve `metadata_refs` now that IDs are known.
4. Add edges (plan + parent-child).
5. Assign deferred assignees.
6. Single Dolt commit (`bd: graph-apply <N> nodes` or the `commit_message`
   override).

### 7.4 `bd import` JSONL

Implementation: `cmd/bd/import.go`, `cmd/bd/import_shared.go`,
`cmd/bd/auto_import_upgrade.go`.

Each line is either an Issue (field set per §4.2) or a memory record:

```json
{"_type": "memory", "key": "<k>", "value": "<v>"}
```

Import behavior (import_shared.go:77-194):

1. Parse each line.
2. Memory records → `store.SetConfig(kv.memory.<k>, v)`.
3. Issue records → `store.CreateIssuesWithFullOptions()` with
   `OrphanHandling: allow`, `SkipPrefixValidation: true`.
4. If no issue prefix is configured, auto-detect from first issue.
5. Single Dolt commit: `bd import: <N> issues, <M> memories from <filename>`.

Backward compatibility (import_shared.go:145-150):

- Old `wisp` field (bool) is mapped to `ephemeral`.
- Tombstone entries (`status: "tombstone"` from v0.35–v0.37) are skipped.

Line size limit: 64KB by default (batch.go:210). For JSONL specifically
the bufio buffer is expanded to 64MB max per the subsystem scan.

### 7.5 `bd export`

Implementation: `cmd/bd/export.go` (plus `export_auto.go` for auto-export
and `export_obsidian.go` for Obsidian format). JSONL output, one Issue per
line, followed by memory lines. Default excludes infra types (agent, rig,
role, message) unless `--all` or `--include-infra`. `--no-memories`
suppresses memory lines; `--scrub` filters pollution (see §9).

Zero-value timestamps (year 0001) are rewritten to Unix epoch
(`export.go:237-248`) to keep marshaling stable.

### 7.6 `bd flatten`

Implementation: `cmd/bd/flatten.go`. Squashes Dolt history into a single
commit by creating a new branch, soft-resetting, recommitting, and
swapping main. Irreversible; `--dry-run` and `--force` guards.

### 7.7 `bd kv`

Implementation: `cmd/bd/kv.go`. Key prefix `kv.` in the config table. Keys
must not be empty, whitespace-only, or start with `kv.`, `sync.`,
`conflict.`, `federation.`, `jira.`, `linear.`, or `export.`
(kv.go:17-35). Subcommands: `set`, `get`, `clear`, `list`.

## 8. Destructive commands

Uniform pattern: every destructive command calls
`CheckReadonly("<name>")` early and emits JSON when `--json` is set.
The commands below are listed with their safety model.

### 8.1 `bd delete`

Implementation: `cmd/bd/delete.go` (621 lines).

Phases (delete.go:18-237):

1. Rewrite text references in other issues to `[deleted:<ID>]`.
2. Remove all dependency edges (in + out, all types).
3. Delete the issue row.

Safety: preview by default; requires `--force` to actually delete. With a
single issue, interactive preview (delete.go:131-167). With a batch,
numbered dry-run or error if dependents outside the batch exist.

Flags: `--force`/`-f`, `--from-file <path>`, `--dry-run`, `--cascade`.
Not soft-delete — no recovery.

JSON output (delete.go:225-230):

```json
{"deleted":["bd-1"],"deleted_count":1,"dependencies_removed":2,
 "labels_removed":0,"events_removed":5,"references_updated":3,
 "orphaned_issues":[]}
```

### 8.2 `bd reset`

Implementation: `cmd/bd/reset.go`. Removes `.beads/`, git hooks that bd
installed (detected via `bd-hooks-version:` or `beads` marker,
reset.go:132-149), and sync branch worktrees. Preview by default; requires
`--force`. Restores `.hook.backup` if present (reset.go:192-196).

### 8.3 `bd purge`

Implementation: `cmd/bd/purge.go`. Deletes only **closed ephemeral** beads
(pinned are protected, purge.go:88-93). `--force`, `--dry-run`,
`--older-than <duration>` (parsed by `parseHumanDuration` at
purge.go:213-254; accepts `7d`, `2w`, `24h`, plain number = days),
`--pattern <glob>`.

### 8.4 `bd cleanup`

Implementation: `cmd/bd/cleanup.go`. Deletes closed issues (non-ephemeral
too). Pinned protected (cleanup.go:88-98). `--older-than <days>`,
`--ephemeral` (wisps-only variant), `--cascade`.

### 8.5 `bd supersede`

Implementation: `cmd/bd/duplicate.go:27-194` (it's filed with the duplicate
command family, not a standalone file).

1. Adds `supersedes` dep (old → new).
2. Closes the old issue.

`--with <new-id>` required; self-superseding rejected (line 146-154).

### 8.6 `bd duplicate` vs `bd duplicates` vs `bd find-duplicates`

- `bd duplicate <id> --of <canonical>` (`cmd/bd/duplicate.go:12-125`) —
  manual single marking; adds `duplicates` dep and closes the duplicate.
- `bd duplicates` (`cmd/bd/duplicates.go:13-156`) — exact content-hash
  detection; groups duplicates and suggests merge targets (scored by
  structural weight × 3 for children + text reference count + lexicographic
  ID tiebreaker, duplicates.go:252-309). `--auto-merge` is required to
  apply; `--dry-run` previews. Merge re-parents children of source to
  target before closing.
- `bd find-duplicates` (`cmd/bd/find_duplicates.go`) — semantic similarity.
  Methods: `mechanical` (default, Jaccard over tokens) and `ai` (requires
  `ANTHROPIC_API_KEY` or `ai.api_key`). `--threshold 0.0-1.0`,
  `--method mechanical|ai`, `--model`.

### 8.7 `bd undefer`, `bd defer`

- `bd defer <id> --until <time>` (`cmd/bd/defer.go:15-116`) — sets status
  to `deferred` and `defer_until` to the parsed time. `--until` optional;
  when omitted, it's just a status change. Warns on past dates
  (defer.go:44-48).
- `bd undefer <id>` (`cmd/bd/undefer.go:13-116`) — sets status back to
  `open` and clears `defer_until`. No-op on non-deferred issues.

### 8.8 `bd rename-prefix`

Implementation: `cmd/bd/rename_prefix.go:22-207`.

Prefix validation (rename_prefix.go:73-75): max 8 chars, lowercase letters
/ digits / hyphens only; must start with a letter, end with a hyphen.
Multiple existing prefixes are detected (rename_prefix.go:84-118) and
require `--repair` to consolidate (rename_prefix.go:108).

### 8.9 `bd compact` / `bd compact dolt`

- `bd compact --dolt` (`cmd/bd/compact_dolt.go:17-100`) — squashes Dolt
  commits older than `--days` (default 30) into one; cherry-picks recent
  on top. `--dry-run` / `--force`.
- `bd compact --analyze` / `--apply` (`cmd/bd/compact.go`) — agent-driven
  semantic compaction of closed issues.

### 8.10 `bd vc commit` / `bd dolt commit`

- `bd vc commit -m "…"` (`cmd/bd/vc.go:109-169`) — high-level wrapper;
  sets `commandDidExplicitDoltCommit` to suppress auto-commit (vc.go:137).
  Requires `-m`, `--message`, or `--stdin`.
- `bd dolt commit` — direct Dolt passthrough in `cmd/bd/dolt.go`.

### 8.11 Safety summary

| Command | Preview by default | `--force` | `--dry-run` | Confirmation |
|---|---|---|---|---|
| `bd delete` | yes | yes | yes | required for destruction |
| `bd reset` | yes | yes | yes | required |
| `bd purge` | yes | yes | yes | required |
| `bd cleanup` | yes | yes | yes | required |
| `bd supersede` | no | no | no | none (status change only) |
| `bd undefer`, `bd defer` | no | no | no | status change only |
| `bd rename-prefix` | no | (not via `--force`) | yes | dry-run recommended |
| `bd compact --dolt` | yes | yes | yes | required |
| `bd vc commit` | no | no | no | message required |
| `bd duplicates` (auto) | no | `--auto-merge` | yes | opt-in |
| `bd doctor --fix` | no | (interactive) | yes | interactive/`--yes` |

## 9. Lifecycle hygiene

### 9.1 `bd stale`

Implementation: `cmd/bd/stale.go:12-79`. Default threshold 30 days
(`--days`/`-d`), limit 50 (`--limit`/`-n`), optional `--status`. Read-only.

### 9.2 `bd orphans`

Implementation: `cmd/bd/orphans.go:29-207`. An issue is "orphan" if it's
referenced in a git commit message but still open or in_progress.
Interactive `--fix` (orphans.go:82-91) prompts before closing. Filters
include `--label` (AND), `--label-any` (OR), `--details`.

### 9.3 `bd lint`

Implementation: `cmd/bd/lint.go:22-165`. Template compliance per type
(lint.go:31-35):

- `bug` → Steps to Reproduce, Acceptance Criteria
- `task` → Acceptance Criteria
- `feature` → Acceptance Criteria
- `epic` → Success Criteria
- `chore` → none

Advisory only. `--type`, `--status` (default open). JSON shape includes
`total`, `issues`, `results` array (each: `id`, `title`, `type`,
`missing`, `warnings`).

### 9.4 `bd preflight`

Implementation: `cmd/bd/preflight.go:34-150`. Static pre-PR checklist
(tests, lint, gofmt, beads pollution, nix hash, version.go vs
default.nix). `--check` actually runs the checks (preflight.go:78-123) and
auto-detects non-interactive stdin (preflight.go:84).

### 9.5 `bd doctor`

Implementation: `cmd/bd/doctor.go` (1255 lines) plus `doctor_agent.go`,
`doctor_artifacts.go`, `doctor_conventions.go`, `doctor_fix.go`,
`doctor_gastown_guard.go`, `doctor_health.go`, `doctor_pollution.go`,
`doctor_validate.go`, `cmd/bd/doctor/`.

Core modes (from subsystem scan):

- Default: matrix of checks (database, schema, dependencies, hooks,
  permissions).
- `--perf` — timings + profile.
- `--output <file>` — dump diagnostics JSON.
- `--check=<type>`:
  - `artifacts` — stale JSONL, SQLite cruft. `--clean` removes.
  - `conventions` — composite lint + stale + orphans (all advisory).
  - `pollution` — test-issue detection; `--clean` removes.
  - `validate` — data integrity (duplicates, orphaned deps).
- `--deep` — full graph integrity (parent consistency, epic completeness,
  agent bead state, mail thread integrity, molecule structures).
- `--server` — Dolt server health.
- `--migration=pre|post` — pre- or post-migration validation.
- `--agent` — ZFC-compliant diagnostic output for AI agents
  (severity: `blocking`/`degraded`/`advisory`; includes observed vs
  expected state and remediation commands).

Fix mode (`--fix`, doctor_fix.go):

- `--dry-run` previews.
- `--interactive` / `-i` per-fix prompt.
- `--yes` / `-y` auto-accept.
- Non-interactive stdin auto-detected (doctor.go:84-90 hint).

### 9.6 `bd doctor --check=conventions`

Implementation: `cmd/bd/doctor_conventions.go`. Composite advisory:

- `conventions.lint` — calls `validation.LintIssue` per open issue
  (doctor_conventions.go:83-128).
- `conventions.stale` — 14-day threshold via `store.GetStaleIssues`
  (doctor_conventions.go:131-169).
- `conventions.orphans` — scans git log (doctor_conventions.go:172-200).

Each check reports `ok`/`warning` only — never errors.

### 9.7 `bd detect-pollution` / `bd doctor --check=pollution`

Implementation: `cmd/bd/detect_pollution.go`, `doctor_pollution.go`.
Signals (doctor_pollution.go:50-84):

- Test prefix: `test-`, `benchmark-`, `sample-`, `tmp-`, `debug-`,
  `dummy-` → +0.7.
- Sequential + minimal description → +0.4.
- No description → +0.2.
- Very short description (<20 chars) → +0.1.
- Created with ≥10 siblings in the same minute → +0.3.
- Generic test title → +0.5.

Threshold: 0.7 to report. Confidence: ≥0.9 high, 0.7–0.9 medium
(doctor_pollution.go:46-55). `--clean` backs up to JSONL
(detect_pollution.go:99-121) before deleting.

## 10. Mail, memory, formulas, molecules

### 10.1 `bd mail`

Implementation: `cmd/bd/mail.go` (110 lines). `DisableFlagParsing: true`
(mail.go:38) — everything is forwarded verbatim to the delegate after
handling `--help`/`-h` inline (mail.go:41-46).

Delegate lookup (`findMailDelegate`, mail.go:88-106):

1. `BEADS_MAIL_DELEGATE` env.
2. `BD_MAIL_DELEGATE` env.
3. `mail.delegate` config (requires store).

Delegate is split on whitespace (mail.go:60) and exec'd with stdin/stdout/
stderr pinned to the bd process. Exit code is preserved
(mail.go:76-82).

`--notify` and any other flags (`inbox`, `send`, `read`, `reply`, `thread`)
have no implementation in bd — the provider (e.g. `gt mail`) owns them.
`bd show-thread` (`cmd/bd/show_thread.go`) is a local exception that walks
`replies-to` dependencies (show_thread.go:31-52) and emits a thread view.

### 10.2 Memory family

Implementation: `cmd/bd/memory.go` (314 lines). Storage key format:
`kv.memory.<user-key>`. Auto-commit after each mutation.

- `bd remember "<text>" [--key <k>]` (memory.go:45-108):
  - Requires direct mode (memory.go:62).
  - Rejects empty content (memory.go:67-69).
  - Derives key from content via `slugify()` (memory.go:21-42) unless
    `--key` overrides.
  - `Remembered` → `Updated` when the key already exists (memory.go:86-89).
  - Commits to Dolt on success (memory.go:94).
- `bd memories [search]` (memory.go:110-192):
  - Fetches `GetAllConfig`, filters by prefix (memory.go:134-140).
  - Search filters both key and value, case-insensitive (memory.go:148-
    157).
  - Sorted keys for output stability (memory.go:173-178).
- `bd forget <key>` (memory.go:195-249):
  - Checks existence, exits 1 if missing (memory.go:220-231).
  - `DeleteConfig` + commit (memory.go:233-238).
- `bd recall <key>` (memory.go:251-294):
  - Returns the raw value. Exits 1 if missing (memory.go:287-289).
  - JSON emits `{"key","value","found"}` (memory.go:277-281).

### 10.3 Formulas

Implementation: `cmd/bd/formula.go`, `cmd/bd/cook.go`, `cmd/bd/pour.go`,
and the core package `internal/formula/`.

Files are `<name>.formula.toml` or `<name>.formula.json`
(formula.go:370-372). Search path (formula.go:350-353):

1. `<beads-dir>/formulas/` (project).
2. `~/.beads/formulas/` (user).
3. `$GT_ROOT/.beads/formulas/` (orchestrator, if set).

Formula struct (subsystem scan of `internal/formula/types.go:65-120`):

```
formula     string    # name
type        enum      # workflow | expansion | aspect | convoy
description string
version     int       # currently 1
extends     []string  # inheritance parents
vars        map       # VarDef values (name → desc/default/required/enum/pattern/type)
steps       []Step
template    []Step    # for expansion formulas
compose     ComposeRules
advice      []Advice
pointcuts   []Pointcut # for aspect formulas
phase       enum       # liquid (pour) | vapor (wisp)
pour        bool       # materialize on cook
```

`Step` fields (types.go:190-269): `id`, `title`, `description`, `notes`,
`type`, `priority`, `labels`, `depends_on`, `needs`, `waits_for`,
`assignee`, `children` (nested), `expand`, `expand_vars`, `condition`,
`gate`, `loop`, `on_complete`.

`ComposeRules` fields (types.go:385-414): `bond_points`, `expand`, `map`,
`branch`, `gate`, `aspects`.

Commands:

- `bd formula list [--type …]` — listing with optional type filter.
- `bd formula show <name>` — details (tree + variables + composition).
- `bd formula convert <name|path> [--all] [--delete] [--stdout]` — JSON →
  TOML (formula.go:468-563).

### 10.4 `bd cook`

Implementation: `cmd/bd/cook.go:37-89`. Compiles a formula into a proto.
Modes:

- Compile (default, unless `--var` provided): keep `{{variable}}`
  placeholders. Used for planning / estimation / contractor handoff.
- Runtime (`--var` provided or `--mode=runtime`): substitute variables;
  error on missing required ones (cook.go:294-303).

Flags: `--var k=v` (repeatable), `--mode compile|runtime`, `--dry-run`,
`--persist`, `--force`, `--search-path <dir>` (repeatable), `--prefix
<prefix>`.

Transformation pipeline (cook.go:152-219): inheritance → control flow →
advice → inline expansions → expansions (map) → aspects → condition
filtering → expansion materialization.

`--persist` writes a proto bead with `template` label and children for
each step; single transaction (cook.go:313-354).

### 10.5 `bd pour` / `bd mol pour`

Implementation: `cmd/bd/pour.go`. Instantiates a proto (from formula or DB)
as a persistent molecule.

Flags: `--var k=v`, `--assignee <n>`, `--attach <proto-id>` (repeatable)
with `--attach-type sequential|parallel|conditional`, `--dry-run`.

Warns if the formula's `phase` is `vapor` (pour.go:92-102) — suggesting
`bd mol wisp` instead.

Output: `InstantiateResult` with `NewEpicID`, `Created`, `IDMapping`
(step ID → spawned ID).

### 10.6 `bd mol` subcommands

Implementation: `cmd/bd/mol.go`, `mol_*.go`.

- `mol show <id> [--parallel]` (`mol_show.go`).
- `mol current <id>` — "you are here" in workflow; reports step states
  `done`/`current`/`ready`/`blocked`.
- `mol progress [<id>]` (`mol_progress.go:14-100`) — counts via indexed
  queries; computes rate and ETA from close timestamps (mol_progress.go:
  85-91). JSON: `{molecule_id, molecule_title, total, completed,
  in_progress, current_step_id, percent, rate_per_hour, eta_hours}`.
- `mol bond <A> <B> [--type …] [--as …] [--var …] [--ephemeral/--pour]
  [--ref <ref>] [--dry-run]` (`mol_bond.go:16-82`). Polymorphic over
  (formula|proto|mol) × (formula|proto|mol) and supports dynamic references
  with `{{var}}` substitution (the "Christmas Ornament" pattern,
  mol_bond.go:49-56).
- `mol burn <wisp-id>` — hard-delete wisp without digest.
- `mol distill <epic-id>` — extract an ad-hoc epic into a proto.
- `mol squash <mol-id>` — condense to digest (promote/summarize).
- `mol ready-gated` — gate-resume discovery.
- `mol seed <proto-id> <count>` — spawn N instances.
- `mol last-activity [<id>]` — `{molecule_id, last_activity, source,
  source_step_id}` (types.go:~648-655).
- `mol stale <days>` — stale-check.

### 10.7 `bd wisp` / `bd mol wisp`

Implementation: `cmd/bd/wisp.go:27-70`. Same spawn model as `pour` but with
`Ephemeral=true`, subject to `WispType` for TTL. Subcommands include
`list` (`WispListItem`/`WispListResult` at wisp.go:72-93) and `gc`. Old
threshold for "stale wisp" is 24h (wisp.go:92-93).

**Root-only default (since c459812e, 2026-03-02):** `bd mol wisp` creates
**only the root issue** unless the formula declares `pour: true` at the top
level (wisp.go:249-251). Without `pour=true`, child step issues are NOT
materialized; they are read inline at prime time instead. The `--root-only`
flag (wisp.go:811,816) can force root-only even on a `pour=true` formula.
`bd mol pour` always materializes all children regardless of the `pour` field.

This differs from `bd mol pour`, which warns when a formula's `phase` is
`"vapor"` (pour.go:92-102) but has no equivalent silent override for
root-only. Wisp does NOT warn when a formula's `phase` is `"liquid"`;
it silently creates root-only unless `pour=true` is set (see gaps-audit.md
C12).

## 11. Config

### 11.1 Command surface

Implementation: `cmd/bd/config.go` + siblings.

- `bd config set <k> <v>` (config.go:78-167) — routes by key: yaml-only
  keys → config.yaml; `beads.role` → git config; everything else → DB
  (auto-committed). Prints post-set side-effect hints.
- `bd config get <k>` (config.go:169-251) — checks yaml-only first, then
  git, then DB. Prints `(not set)` if missing.
- `bd config list` (config.go:253-296) — DB-backed entries only; warns
  when a key is also set elsewhere.
- `bd config show` (config_show.go:23-64) — unified view across all
  sources with provenance.
- `bd config unset <k>` (config.go:370-439) — comment-out in yaml, remove
  from git, delete from DB.
- `bd config set-many <k=v>…` (config.go:593-715) — validate then write
  in one pass; single auto-commit for DB keys.
- `bd config validate` (config.go:441-498) — checks `federation.*`,
  `routing.*`, remote URL pattern allow-lists; exit 0 if valid, 1 otherwise.
- `bd config apply` (config_apply.go:32-66) — reconcile hooks, Dolt remote,
  server state to match config. `--dry-run` available.
- `bd config drift` (config_drift.go:35-84) — read-only inverse of
  `apply`; exit 1 if drift detected.

### 11.2 Storage locations

Config values flow through multiple backends:

- **config.yaml** files, loaded low-priority to high (from subsystem scan
  of `internal/config/config.go:224-259`):
  1. `~/.beads/config.yaml` (legacy user).
  2. `~/.config/bd/config.yaml` (XDG).
  3. `.beads/config.yaml` (project, walked from cwd).
  4. `$BEADS_DIR/config.yaml` (explicit).
  5. `config.local.yaml` (machine-specific overrides).
- **Git config** — `beads.role` only.
- **`.beads/metadata.json`** — Dolt mode, project_id, database name.
- **DB config table** — integration settings (Jira, Linear, GitHub,
  GitLab, ADO, Notion), sync state (`*.last_sync`), suppressions
  (`doctor.suppress.*`).

### 11.3 YAML-only keys

Keys that must be readable before the DB is opened. From the subsystem
scan of `internal/config/yaml_config.go:21-76`:

- Startup: `no-db`, `json`, `db`, `actor`, `identity`.
- Git: `git.author`, `git.no-gpg-sign`, `no-push`, `no-git-ops`.
- Sync: `sync.remote`, `sync.git-remote`,
  `sync.require_confirmation_on_mass_delete`.
- Routing: `routing.*`.
- Create: `create.require-description`.
- Validation: `validation.*`.
- Hierarchy: `hierarchy.max-depth`.
- Backup, Export: `backup.*`, `export.*`.
- Dolt: `dolt.auto-commit`, `dolt.idle-timeout`, `dolt.shared-server`,
  `dolt.max-conns`.
- Federation: `federation.*`.
- Directory, repos, external_projects, AI: `directory.*`, `repos.*`,
  `external_projects.*`, `ai.*`.
- Secrets: `github.token`, `linear.api_key`, `jira.api_token`,
  `gitlab.token`, `ado.pat` — secrets live in yaml, never in DB.

`config.IsYamlOnlyKey(key)` returns true by prefix match on the above
category prefixes plus specific standalone keys. Used by
`configCommandCanRunWithoutStore` (main.go:294-325) to allow config
operations on yaml-only keys without opening the DB.

### 11.4 Env var binding

Prefix `BD_` (primary) and `BEADS_` (legacy alias for a few keys). Dots
and hyphens convert to underscores, so `federation.remote` becomes
`BD_FEDERATION_REMOTE`. Bound via viper's `AutomaticEnv` — no manual
registration.

### 11.5 Blocked env vars

`BD_BACKEND` and `BD_DATABASE_BACKEND` are rejected at startup
(`main.go:1045` + checker at `main.go:1047-1056`). Storage backend is
pinned in `.beads/metadata.json`; the only way to change it is
`bd migrate dolt`.

### 11.6 Validation

- `validation.on-create`, `validation.on-close`, `validation.on-sync` —
  values `none`/`warn`/`error` (config.go:173-175).
- `bd create --validate` triggers required-sections check
  (config key `create.require-description`, config.go:166).
- Custom schema validation: `validation.metadata.mode =
  none|warn|error` (config.go:181).

## 12. Tracker integrations

All tracker integrations share the engine in `internal/tracker/` (subsystem
scan: shared `IssueTracker` interface, `SyncEngine`, `TrackerIssue`,
`FieldMapper`). Push/pull shorthands (`bd <tracker> push <id>`, `bd
<tracker> pull <ref>`) exist for every tracker
(`cmd/bd/sync_push_pull.go`).

Each tracker's command lives under `cmd/bd/<tracker>.go` and its engine
under `internal/<tracker>/`.

| Tracker | File | Auth | Direction | Secret key | Env vars |
|---|---|---|---|---|---|
| Jira | `cmd/bd/jira.go` | email + API token | bidirectional | `jira.api_token` (yaml) | `JIRA_API_TOKEN`, `JIRA_USERNAME`, `JIRA_PROJECTS` |
| Linear | `cmd/bd/linear.go` | GraphQL API key | bidirectional | `linear.api_key` (yaml) | `LINEAR_API_KEY`, `LINEAR_TEAM_ID`, `LINEAR_TEAM_IDS` |
| GitHub | `cmd/bd/github.go` | PAT (`repo` scope) | bidirectional | `github.token` (yaml) | `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_REPOSITORY`, `GITHUB_API_URL` |
| GitLab | `cmd/bd/gitlab.go` | PAT (`api` scope) | bidirectional | `gitlab.token` (yaml) | `GITLAB_URL`, `GITLAB_TOKEN`, `GITLAB_PROJECT_ID`, `GITLAB_GROUP_ID`, `GITLAB_DEFAULT_PROJECT_ID` |
| Azure DevOps | `cmd/bd/ado.go` | PAT | bidirectional | `ado.pat` (yaml) | `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PAT`, `AZURE_DEVOPS_URL` |
| Notion | `cmd/bd/notion.go` | integration token | bidirectional | (env) | — |

Per-tracker subcommand set is generally:

```
<tracker> sync [--pull] [--push] [--dry-run]
<tracker> status
<tracker> push <bd-id>
<tracker> pull <ext-ref>
<tracker> [teams|projects|repos]           # tracker-specific discovery
```

With integration-specific flags (Linear's `--type`/`--parent`, ADO's
`--area-path`/`--iteration-path`, Notion's `init`/`connect`).

Conflict resolution is uniformly timestamp-based by default, with
`--prefer-local` and `--prefer-<tracker>` overrides where the integration
supports them.

## 13. Sync, federation, repo

### 13.1 `bd sync`

Implementation: `cmd/bd/sync_git.go`, `sync_push_pull.go`, `sync_remote.go`,
`sync_flags.go`. Pulls from and pushes to the configured Dolt remote
(`sync.remote` or `federation.remote`). `--dry-run` and
`--strategy ours|theirs` are accepted.

### 13.2 `bd federation`

Implementation: `cmd/bd/federation.go`. Peer-to-peer Dolt federation.

Subcommands: `federation sync [--peer <name>] [--strategy ours|theirs]`,
`federation status [--peer <name>]`, `federation add-peer <name> <url>
[--user <u>] [--password <p>] [--sovereignty <tier>]`,
`federation remove-peer <name>`, `federation list-peers`.

Peer URLs: `dolthub://org/repo`, `host:port/database`, `file:///…`.
Sovereignty tiers: `T1` (public), `T2` (org), `T3` (pseudonymous),
`T4` (anonymous). `no-cgo` variant at
`cmd/bd/federation_nocgo.go`.

### 13.3 `bd repo`

Implementation: `cmd/bd/repo.go`. Multi-repo hydration.

Config (project `.beads/config.yaml`):

```yaml
repos:
  primary: "."
  additional:
    - ~/beads-planning
    - ../other-project
```

Subcommands: `repo add <path>`, `repo remove <path>`, `repo list`,
`repo sync`.

## 14. Init family

Implementation in `cmd/bd/init*.go`:

- `init` (`init.go`) — main flow: detect/create `.beads/`, initialize
  Dolt, write `config.yaml`, install git hooks, prompt for actor, offer
  tracker setup.
- `init-agent` (`init_agent.go`) — non-interactive, agent-friendly.
- `init-contributor` (`init_contributor.go`) — contributor workspace
  (routing mode).
- `init-stealth` (`init_stealth.go`) — read-only workspace.
- `init-team` (`init_team.go`) — shared team workspace.
- `init-templates` (`init_templates.go`) — import issue templates from a
  remote.
- `init-git-hooks` (`init_git_hooks.go`) — dedicated hook installer.
- `init-guard` (`init_guard.go`) — init guard.

Related: `bootstrap` (`bootstrap.go`), `onboard` (`onboard.go`), `setup`
(`setup.go` + `setup/`), `quickstart` (`quickstart.go`).

## 15. Completions, help, version

- `bd completion bash|zsh|fish|powershell` — `cmd/bd/completions.go`.
  These are listed in `noDbCommands` (main.go:626-647).
- `bd help` — defaults to per-command help. `--all` (help_all.go:24-56)
  emits a full markdown reference built from the Cobra tree. `--list`
  (help_all.go:303-309) prints one command per line. `--doc <cmd>`
  (help_all.go:226-259) emits Docusaurus-frontmatter markdown for a single
  command (used by the website generator).
- `bd version` / `bd --version` / `bd -V` — prints
  `bd version <X> (<build>)` (`main.go:504`).

## 16. Introspection / utility

- `bd sql` (`cmd/bd/sql.go`) — raw SQL execution against the Dolt database.
  Dangerous; no schema validation. Available only in direct mode.
- `bd where` (`cmd/bd/where.go`) — prints effective data locations
  (.beads dir, database path, config sources). In `noDbCommands`
  (main.go:646).
- `bd info` (`cmd/bd/info.go`) — quick info summary.
- `bd statuses` / `bd status` — status workflow configuration.
- `bd types` (`cmd/bd/types.go`) — issue type listing / config.
- `bd upgrade` (`cmd/bd/upgrade.go`) — self-updating installer flow.
- `bd docs` (`cmd/bd/docs.md`, `cmd/bd/markdown.go`) — doc generation
  helpers.

## 17. Known safety and behavior notes

- **`--readonly`** is enforced by calls to `CheckReadonly(name)` at the top
  of every write-capable command (e.g. `delete.go:51`, `defer.go:33`,
  `undefer.go:26`, `remember` at `memory.go:60`, `forget` at
  `memory.go:208`). Bypasses are not supported.
- **Workspace identity check** (main.go:1121-1156) prevents cross-project
  writes when `metadata.json`'s `project_id` diverges from the DB's
  `_project_id`. `BEADS_SKIP_IDENTITY_CHECK=1` escapes.
- **SIGTERM/SIGHUP/SIGINT** flush pending batch Dolt commits
  (main.go:1061-1110). A second signal forces exit.
- **`--dolt-auto-commit=batch`** defers Dolt commits until an explicit
  `bd dolt commit`; pending changes persist only in the working set.
  Crashes before a flush lose writes.
- **Hook timeouts**: 10s per mutation hook (internal/hooks/hooks.go:38),
  300s per git hook shim (configurable via `BEADS_HOOK_TIMEOUT`,
  hooks.go:33-44). Exceeding the shim timeout yields exit 124 and is
  translated to 0.
- **`ephemeral` vs `no_history`**: mutually exclusive
  (internal/types/types.go:209-257). Ephemeral issues skip git tracking;
  no_history issues live in the wisps table and are GC-eligible.
- **`bd purge` despite the wisp-oriented UX is hard destruction** of any
  closed ephemeral (pinned skipped). No recovery.
- **`bd rename-prefix` without `--repair`** refuses to proceed if multiple
  prefixes exist (rename_prefix.go:84-118); `--repair` consolidates all
  prefixes to the new one. Preview with `--dry-run` first.

## 18. Gaps and contradictions

Items where the current source disagreed with documented or expected
behavior, or where `--help` is misleading:

1. `bd list --ready` is NOT equivalent to `bd ready`. Help text for
   `ready.go:26` says so explicitly; we surface it in §6.3 because multiple
   tools treat them as synonyms.
2. `bd ready` defaults to excluding infra / gate / molecule / message /
   agent / role / rig types. Help does not spell this out. Source
   evidence is in the subsystem scan of
   `internal/storage/dolt/queries.go:61-85` — direct verification pending.
3. `bd hooks run` is not shown in the top-level help; it is mentioned
   only under `bd help hooks`. It is the canonical entry point that shims
   call back into.
4. The `BD_ACTOR` env var is documented as deprecated in
   `cmd/bd/main.go:417-420` yet is still the recommended override in a
   number of places. The non-deprecated alias is `BEADS_ACTOR`
   (main.go:413-416).
5. `bd hook` (singular) is accepted because `noDbCommands` contains
   `"hook"` but the real command is `bd hooks`. The singular form is
   effectively a no-op unless the user runs it as a parent lookup.
6. Line numbers in `bd help --all` output are auto-generated from Cobra
   and can drift across minor versions; use source citations, not help
   line numbers, for any automation.
7. `bd export --format=json` behavior vs plain JSONL is not verified from
   the source directly. Treat JSONL as authoritative and do not rely on
   an aggregated JSON array.
8. `bd formula show --json` emits the full `Formula` struct. The exact
   JSON field spelling is governed by tags in `internal/formula/types.go`
   which weren't transcribed end-to-end; consumers should double-check
   field names before building against them.
9. `bd mol` step states returned by `mol current` — `done`/`current`/
   `ready`/`blocked` — come from the subsystem scan. The corresponding
   JSON key/field names in output were not transcribed verbatim from the
   source; validate with a live run before wiring UI state.
10. The tracker-specific push/pull shorthand output shape (`bd jira push
    <id>`, etc.) depends on the engine in `internal/tracker/` and may
    differ from the core `bd sync` output. Treat each tracker's JSON as
    its own contract.

## Appendix A. Source map for ongoing reference

For the beads-UI prototype, these paths are the load-bearing ones to watch
for breaking changes:

- `github/gastownhall/beads/cmd/bd/main.go` — global flags, PersistentPreRun/PostRun.
- `github/gastownhall/beads/cmd/bd/output.go`, `cmd/bd/errors.go` — JSON helpers and error envelope.
- `github/gastownhall/beads/cmd/bd/show.go`, `cmd/bd/list.go`, `cmd/bd/ready.go` — core read surface.
- `github/gastownhall/beads/internal/types/types.go` — Issue and Dependency schema (JSON tags).
- `github/gastownhall/beads/internal/query/` — DSL parser/lexer/evaluator.
- `github/gastownhall/beads/internal/hooks/hooks.go` + `internal/storage/hook_decorator.go` — hook protocol.
- `github/gastownhall/beads/cmd/bd/prime.go` — session-start contract.
- `github/gastownhall/beads/cmd/bd/batch.go`, `cmd/bd/graph_apply.go`, `cmd/bd/markdown.go` — write ingestion.
- `github/gastownhall/beads/cmd/bd/memory.go` — memory CLI contract.
- `github/gastownhall/beads/internal/formula/types.go` — formula schema.
- `github/gastownhall/beads/internal/tracker/` — tracker abstraction.
- `github/gastownhall/beads/cmd/bd/doctor.go` + `doctor_*.go` — diagnostics shape.

End of reference.
