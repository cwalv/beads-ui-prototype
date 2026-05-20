# `bd` command reference

Every `bd` subcommand grouped by theme. Short description per command
plus the implementation file for anything you'd need to dig into.

Detailed JSON shapes are in [json-outputs.md](json-outputs.md).

## Global flags

Work on any subcommand. Registered at
`github/gastownhall/beads/cmd/bd/main.go:464-479`.

| Flag | Purpose |
|---|---|
| `--db <path>` | Explicit database path (bypass auto-discovery). |
| `--actor <name>` | Actor for audit trail. |
| `--json` | JSON output. |
| `--sandbox` | Sandbox mode; disables auto-sync. |
| `--readonly` | Block write ops. |
| `--global` | Use `beads_global` shared-server DB. |
| `--dolt-auto-commit off\|on\|batch` | Commit policy. `batch` defers until `bd dolt commit`. |
| `--profile` | Emit CPU profile + trace. |
| `--verbose, -v` | Debug output. |
| `--quiet, -q` | Suppress non-essential output. |
| `-V, --version` | Print version and exit. |

Actor resolution order (`main.go:406-435`): `--actor` → `BEADS_ACTOR` →
`BD_ACTOR` (deprecated) → `git config user.name` → `$USER` → `unknown`.

## Read-only commands

The following default to read-only: `list`, `ready`, `show`, `stats`,
`blocked`, `count`, `search`, `graph`, `duplicates`, `comments`,
`current`, `backup`, `export`, `context`.

## Issue lifecycle

| Command | Purpose | File |
|---|---|---|
| `bd create` | Create an issue (flags, markdown, or graph). | `cmd/bd/create.go` |
| `bd update` | Update fields. Includes `--claim` atomic claim. | `cmd/bd/update.go` |
| `bd show` | Show issue detail (JSON array even for one ID). | `cmd/bd/show.go` |
| `bd close` | Close, optionally with `--suggest-next` / `--continue` / `--claim-next`. | `cmd/bd/close.go` |
| `bd reopen` | Reopen closed issue. | `cmd/bd/reopen.go` |
| `bd delete` | Hard delete with reference cleanup (preview-by-default). | `cmd/bd/delete.go` |
| `bd defer` | Set `status=deferred`, optional `--until`. | `cmd/bd/defer.go` |
| `bd undefer` | Clear deferral. | `cmd/bd/undefer.go` |
| `bd assign` | Assign / unassign. | `cmd/bd/assign.go` |
| `bd promote` | Promote (e.g. epic). | `cmd/bd/promote.go` |
| `bd priority` | Set priority. | `cmd/bd/priority.go` |
| `bd label` | Add / remove labels. | `cmd/bd/label.go` |
| `bd state`, `bd set-state`, `bd statuses` | Custom status workflow. | `cmd/bd/state.go` |
| `bd tag`, `bd link`, `bd relate`, `bd rename` | Smaller single-purpose wrappers. | each file named after the command |
| `bd comment`, `bd comments` | Add / list comments. | `cmd/bd/comment.go` |
| `bd note` | Append to `notes` field. | `cmd/bd/note.go` |
| `bd quick`, `bd quickstart` | Fast create + starter flow. | `cmd/bd/quick.go` |

### `bd update --claim` (atomic claim)

The canonical "I'm starting this work" signal. `bd update <id> --claim`
in one atomic step:

- Sets `status='in_progress'`.
- Sets `assignee` to the current operator (per `bd config get user` /
  the agent's session identity).
- Sets `started_at` to now.

The atomicity matters in multi-agent settings: two agents racing on
`bd ready` can both pull the same id, but only one's `--claim` will
win the in-process transition (the second sees a no-op or a guard
error, depending on storage backend). Without `--claim`, the
equivalent three-call sequence (`assign` + `state in_progress` +
field update) has a window where another worker can also claim.

Pairs with `bd close --claim-next` for the close → next-claim flow
that the prime contract teaches.

## Views and reports

| Command | Purpose | File |
|---|---|---|
| `bd list` | Broad filter/list with tree format. Feature-rich. | `cmd/bd/list.go` |
| `bd ready` | Unblocked, status=open, infra-type-excluded. | `cmd/bd/ready.go` |
| `bd blocked` | Blocked issues with reason chain. | embedded in `list.go` |
| `bd search` | Title / desc / notes / external-ref search. | `cmd/bd/search.go` |
| `bd query` / `bd q` | DSL query engine. | `cmd/bd/query.go` |
| `bd count` | Counts, optionally grouped. | `cmd/bd/count.go` |
| `bd stats` | Aggregate statistics. | — |
| `bd graph` | Dep graph with layered layout; supports `dot`, `html`, `json`. | `cmd/bd/graph.go` |
| `bd diff` | Diff between states. | `cmd/bd/diff.go` |
| `bd children` | Walk parent-child. | `cmd/bd/children.go` |
| `bd duplicates`, `bd duplicate`, `bd find-duplicates` | Content-hash + ID-based + semantic dedup. | see dedup section below |
| `bd last-touched` | Most recently touched issues. | `cmd/bd/last_touched.go` |
| `bd history` | Event log. | `cmd/bd/history.go` |
| `bd routed` | Show routed-to targets. | `cmd/bd/routed.go` |

### Duplicate detection variants

- **`bd duplicates`** — content-hash grouping. `--auto-merge` to apply;
  `--dry-run` to preview.
- **`bd duplicate <id> --of <canonical>`** — manual marking; adds
  `duplicates` dep + closes.
- **`bd find-duplicates`** — semantic: `--method mechanical` (default,
  Jaccard tokens) or `--method ai` (needs `ANTHROPIC_API_KEY`);
  `--threshold 0.0-1.0`.

## Dependencies and structure

| Command | Purpose | File |
|---|---|---|
| `bd dep add/rm/tree/cycles` | Dep edge CRUD + inspection. | `cmd/bd/dep.go` |
| `bd epic` | Epic-specific operations. | `cmd/bd/epic.go` |
| `bd flatten` | Flatten Dolt history (IRREVERSIBLE). | `cmd/bd/flatten.go` |
| `bd orphans` | Issues referenced in git commits but still open. `--fix` to close. | `cmd/bd/orphans.go` |

## Sync and data

| Command | Purpose | File |
|---|---|---|
| `bd export` | JSONL export (`--all`, `--no-memories`, `--scrub`). | `cmd/bd/export.go` |
| `bd import` | JSONL import (GH#2994 upgrade path). | `cmd/bd/import.go` |
| `bd batch` | Multi-op single-transaction (stdin or file). | `cmd/bd/batch.go` |
| `bd create --graph <path>` | Apply JSON bead-graph plan. | `cmd/bd/graph_apply.go` |
| `bd dolt <sub>` | Dolt passthrough: `show`, `set`, `start`, `stop`, `status`, `test`, `push`, `pull`, `commit`, `remote add/list/remove`. | `cmd/bd/dolt.go` |
| `bd vc commit -m "msg"` | High-level VC wrapper; marks an explicit Dolt commit. | `cmd/bd/vc.go` |
| `bd federation` | Peer-to-peer Dolt federation — `add-peer`, `list-peers`, `sync`, `status`. | `cmd/bd/federation.go` |
| `bd ado`, `bd jira`, `bd linear`, `bd github`, `bd gitlab`, `bd notion` | Tracker integrations (sync, push, pull). | `cmd/bd/<tracker>.go` |

## Setup and configuration

| Command | Purpose | File |
|---|---|---|
| `bd init` | Main init flow. | `cmd/bd/init.go` |
| `bd init-agent`, `bd init-contributor`, `bd init-stealth`, `bd init-team`, `bd init-templates`, `bd init-git-hooks`, `bd init-guard` | Variants. | `cmd/bd/init_*.go` |
| `bd bootstrap` | Pre-init steps. | `cmd/bd/bootstrap.go` |
| `bd onboard` | Onboarding flow. | `cmd/bd/onboard.go` |
| `bd setup` | Editor integrations (Cursor / Claude / Gemini / Aider / …). | `cmd/bd/setup.go` |
| `bd quickstart` | First-run friendly flow. | `cmd/bd/quickstart.go` |
| `bd config show/get/set/unset/set-many/list/apply/drift/validate` | Config surface. | `cmd/bd/config.go` |
| `bd context` | Show effective backend identity. | `cmd/bd/context_cmd.go` |
| `bd prime` | Session-start workflow context (wired to `SessionStart` hook). | `cmd/bd/prime.go` |
| `bd prompt` | Print example LLM prompt. | `cmd/bd/prompt.go` |
| `bd where` | Show data locations. | `cmd/bd/where.go` |
| `bd info` | Basic info. | `cmd/bd/info.go` |
| `bd hooks install/uninstall/list/run` | Git hooks manager. | `cmd/bd/hooks.go` |
| `bd migrate-hooks` | Migrate legacy hooks. | `cmd/bd/migrate_hooks.go` |

## Maintenance

| Command | Purpose | File |
|---|---|---|
| `bd doctor` | Health checks (`--fix`, `--check=<type>`, `--agent`, `--perf`, `--server`, `--migration`). | `cmd/bd/doctor.go` |
| `bd preflight` | **Go-specific** pre-PR checklist for the beads repo itself (tests, lint, gofmt, nix hash). Not a generic lint. | `cmd/bd/preflight.go` |
| `bd lint` | Template compliance (Required Sections) per type. | `cmd/bd/lint.go` |
| `bd stale` | List inactive issues (default 30 days). | `cmd/bd/stale.go` |
| `bd audit` | Audit events. | `cmd/bd/audit.go` |
| `bd cleanup` | Bulk-delete closed issues. | `cmd/bd/cleanup.go` |
| `bd purge` | Delete closed *ephemeral* beads (hard destruction). | `cmd/bd/purge.go` |
| `bd reset` | Remove `.beads/` workspace. | `cmd/bd/reset.go` |
| `bd compact` | Agent-driven semantic compaction. | `cmd/bd/compact.go` |
| `bd compact --dolt` | Squash Dolt history. | `cmd/bd/compact_dolt.go` |
| `bd migrate` | Metadata / version migration. | `cmd/bd/migrate.go` |
| `bd rename-prefix` | Bulk prefix rename (use `--dry-run`). | `cmd/bd/rename_prefix.go` |
| `bd upgrade` | Self-updating installer. | `cmd/bd/upgrade.go` |
| `bd sql` | Raw SQL. No schema validation; dangerous. | `cmd/bd/sql.go` |
| `bd kv` | `set/get/clear/list` with `kv.` prefix. | `cmd/bd/kv.go` |
| `bd detect-pollution` | Test-issue detector (prefix heuristics). | `cmd/bd/detect_pollution.go` |
| `bd backup`, `bd restore` | JSONL / Dolt backup and restore. | `cmd/bd/backup*.go` |
| `bd gate <sub>` | Async gates (`list`, `check`, `resolve`, `add-waiter`, `show`). | `cmd/bd/gate.go` |
| `bd gate-discover` | Gate discovery helper. | `cmd/bd/gate_discover.go` |
| `bd merge-slot` | Allocate a merge slot (legacy — see note below). | `cmd/bd/merge_slot.go` |
| `bd ship` | Ship helper. | `cmd/bd/ship.go` |
| `bd supersede` | `bd dep add supersedes` + close. Lives in `cmd/bd/duplicate.go`. | `cmd/bd/duplicate.go` |
| `bd rules` | Rule engine. | `cmd/bd/rules.go` |
| `bd repo` | Multi-repo hydration. | `cmd/bd/repo.go` |

## Collaboration primitives

| Command | Purpose | File |
|---|---|---|
| `bd mail <sub>` | Delegates all args to `BEADS_MAIL_DELEGATE` / `BD_MAIL_DELEGATE` / `mail.delegate`. | `cmd/bd/mail.go` |
| `bd remember`, `bd memories`, `bd recall`, `bd forget` | Persistent memories (stored as `kv.memory.<slug>` in `config` table). | `cmd/bd/memory.go` |
| `bd human list/respond/dismiss` | Surface issues with `human` label. | `cmd/bd/human.go` |
| `bd feedback` | Feedback channel. | `cmd/bd/feedback.go` |
| `bd swarm` | Swarm ops. | `cmd/bd/swarm.go` |
| `bd todo` | Quick todo add. | `cmd/bd/todo.go` |
| `bd tips` | Show tips. | `cmd/bd/tips.go` |
| `bd thanks` | Acknowledgement message. | `cmd/bd/thanks.go` |

## Formulas and molecules

| Command | Purpose | File |
|---|---|---|
| `bd formula list/show/convert` | List, show, and convert between TOML / JSON formulas. | `cmd/bd/formula.go` |
| `bd cook` | Compile a formula to a proto. `--var k=v`, `--persist`, `--force`. | `cmd/bd/cook.go` |
| `bd pour`, `bd mol pour` | Instantiate a proto as a persistent molecule (root + child step beads, IDs prefixed `bd-mol-`). | `cmd/bd/pour.go` |
| `bd wisp` | Ephemeral molecule instantiation (opposite of pour; IDs prefixed `bd-wisp-`). | `cmd/bd/wisp.go` |
| `bd mol current <mol-id>` | Step state per child: `done`/`current`/`ready`/`blocked`. | `cmd/bd/mol_current.go` |
| `bd mol progress <mol-id>` | Aggregate counts + ETA from close timestamps. | `cmd/bd/mol_progress.go` |
| `bd mol show <mol-id>` | Full molecule subgraph dump. | `cmd/bd/mol_show.go` |
| `bd mol bond <A> <B>` | Combine two protos / molecules into a compound (`--type=sequential\|parallel\|conditional\|root`). | `cmd/bd/mol_bond.go` |
| `bd mol distill <epic-id>` | Extract a reusable proto from an ad-hoc epic. | `cmd/bd/mol_distill.go` |
| `bd mol squash <mol-id>` | Promote a wisp to persistent + produce a digest (or compact a persistent molecule). | `cmd/bd/mol_squash.go` |
| `bd mol burn <mol-id>` | Delete a wisp without producing a digest. | `cmd/bd/mol_burn.go` |
| `bd mol stale` | Find stale molecules (epic-eligible-for-close + blocking heuristics). | `cmd/bd/mol_stale.go` |
| `bd mol last-activity <mol-id>` | Most-recent activity timestamp across the molecule's children. | `cmd/bd/mol_last_activity.go` |
| `bd mol seed <formula-name>` | Seed-flow utility (formula-driven). | `cmd/bd/mol_seed.go` |
| `bd mol ready --gated` | Ready-set restricted to gated workflows. | `cmd/bd/mol_ready_gated.go` |

**Note: `bd mol list` does NOT exist.** A stale string in
`cmd/bd/doctor/agent.go:520` references it as advice text, but no
implementation. To discover running molecules, see
[the-pour-pipeline.md § "Discovering running molecules"](../explanation/the-pour-pipeline.md#discovering-running-molecules)
— there's no canonical one-liner; the answer is a multi-tier heuristic.

See [formula-schema.md](formula-schema.md) for the Formula struct.

## Introspection

| Command | Purpose | File |
|---|---|---|
| `bd completion bash\|zsh\|fish\|powershell` | Shell completions. | `cmd/bd/completions.go` |
| `bd help [--all] [--list] [--doc <cmd>]` | Help surface; markdown generator. | `cmd/bd/help_all.go` |
| `bd version` | Build info. | `cmd/bd/version.go` |
| `bd admin` | Admin ops. | `cmd/bd/admin.go` |
| `bd types` | Issue types listing / config. | `cmd/bd/types.go` |
| `bd docs` | Docs generation helpers. | `cmd/bd/docs.md` |

## Vestigial / watch out

- `bd preflight` is **Go-project-specific for the beads repo itself**.
  Running it elsewhere emits nonsense. See
  [../../gaps-audit.md](../../gaps-audit.md) §A9.
- `bd merge-slot` was re-implemented in gastown/gascity. The beads-side
  command exists but neither orchestrator uses it.
- `bd gate check` on gates with `await_type=bead` always fails
  (multi-rig routing was removed). See §C4.
- `bd federation` is full-featured but neither gastown nor gascity
  uses it. §V8.
- `bd mail` is a delegate shell — without a delegate configured, it
  exits 1 with setup instructions. §A4.

## Destructive commands

Preview-by-default; require `--force` to actually destroy:

- `bd delete <id>` — hard delete + dep/reference cleanup.
- `bd reset` — removes `.beads/` and installed git hooks.
- `bd purge` — deletes closed ephemeral beads.
- `bd cleanup` — deletes closed issues (non-ephemeral too).
- `bd compact --dolt` — squashes Dolt commits.
- `bd flatten` — squashes all Dolt history to one commit. **IRREVERSIBLE.**
- `bd rename-prefix` — accepts `--repair` to consolidate multiple
  prefixes.

## See also

- [json-outputs.md](json-outputs.md) — JSON shape per command.
- [hook-protocol.md](hook-protocol.md) — git + mutation hooks.
- [prime-contract.md](prime-contract.md) — `bd prime` details.
