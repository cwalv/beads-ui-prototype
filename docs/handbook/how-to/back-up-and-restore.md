# Back up and restore

Two mechanisms:

- **JSONL export / import** — portable, text-based, diffable. Good for
  version control.
- **Dolt backup / restore** — full binary snapshot including history.
  Good for disaster recovery.

## JSONL export

```bash
bd export > beads-export.jsonl
```

One Issue per line, followed by memory lines:

```
{"id":"bd-abc","title":"...","status":"open",...}
{"id":"bd-def","title":"...",...}
{"_type":"memory","key":"branch-policy","value":"main-only"}
```

Flags:

- `--all` — include everything: infra types (agent / rig / role /
  message), templates, gates, and memories that are excluded by
  default.
- `--include-infra` — include only the infra types (subset of
  `--all`).
- `--include-memories` — include persistent memories (`bd remember`).
  By default memories are excluded because they may contain
  sensitive agent context. The legacy `--no-memories` flag is
  hidden — exclusion is now the default.
- `--scrub` — exclude test/pollution records (`isTestIssue` filter
  in `export.go`).
- `-o / --output <file>` — write to a file via an atomic temp+rename
  rather than stdout.

Timestamps with year 0001 are rewritten to Unix epoch
(`sanitizeZeroTime` in `export.go`) so the JSON marshaling is stable.

Wisps (agent / rig / role / message infra) live in `dolt_ignored`
tables (migration 0035) and are deliberately *not* committed to
Dolt — so even with `--all`, you're exporting the local-only view
of those rows.

## JSONL import

Stdin:

```bash
bd import - < beads-export.jsonl
```

Positional file argument, or the `-i / --input` flag:

```bash
bd import beads-export.jsonl
bd import -i beads-export.jsonl
```

With no source given, `bd import` reads `.beads/issues.jsonl`
(the default location for `export.auto`-managed exports).

Behavior (`import_shared.go`):

- Memory records (`"_type":"memory"`) → `store.SetConfig(kv.memory.<k>, v)`.
- Issue records → `importIssuesCore` → `store.CreateIssuesWithFullOptions()`
  with orphan handling `allow` and prefix validation skipped.
- If no issue prefix is configured, auto-detect from first issue.
- Single Dolt commit: `bd import: <N> issues`.
- Tombstone entries (status `tombstone`, from pre-v0.50 exports)
  are silently skipped.

There is also an `auto-import: ... (upgrade recovery, GH#2994)`
path triggered on first run after an upgrade if `.beads/issues.jsonl`
is present but the Dolt store is empty.

Line size limit: 64MB per line.

Flags:

- `-i / --input <file>` — legacy alias for the positional file.
- `--dry-run` — count what would be imported without writing.
- `--dedup` — skip lines whose title matches an existing open issue.

## Backward compat

The pre-v0.38 `wisp` boolean field maps to `ephemeral` on import.
Pre-v0.50 tombstone rows (`status: "tombstone"`) are silently
skipped — see the "Behavior" list above.

## Dolt backup

`bd backup` is a Dolt-native snapshot to a directory (not a tarball).
The default destination is `.beads/backup/` — or the `backup/`
subdirectory of `backup.git-repo` if that's set to a git checkout.

Subcommands:

```bash
bd backup init <path-or-url>   # Set up a backup destination
bd backup sync                 # Push to the configured destination
bd backup restore [path]       # Restore from a backup directory
bd backup remove               # Remove the destination
bd backup status               # Show last-backup state + config
```

`bd backup init` accepts either a filesystem path or a DoltHub URL
(`https://doltremoteapi.dolthub.com/<user>/<repo>`); for DoltHub
set `DOLT_REMOTE_USER` and `DOLT_REMOTE_PASSWORD`.

Snapshot contents: the full Dolt history (commits, branches). Binary;
roughly the size of `.beads/dolt/`.

Restore (positional path; defaults to `backupDir()`):

```bash
bd backup restore /path/to/backup-dir
bd backup restore --force          # Overwrite existing database
```

Caveat: `--force` overwrites `.beads/dolt/` with the snapshot, then
syncs `metadata.json`'s `_project_id` to match (so the identity
check doesn't reject subsequent connections). Back up first.

## Auto-backup

```bash
bd config set backup.enabled true
bd config set backup.interval "24h"
```

Periodic Dolt backups land in `backupDir()`. `bd backup status`
reports the last-committed Dolt hash and the elapsed time since.

## Auto-export to git

For beads that should live in version control alongside code:

```bash
bd config set export.auto true
```

On `pre-commit`, beads exports JSONL to a project-tracked file (default
`.beads/issues.jsonl`). The file gets committed with your code; a fresh
`git clone` + `bd init` + `bd import` recreates the beads store.

This is how a small team can put their beads store in the repo without
needing a shared Dolt server.

## Dolt remote push / pull

Below `bd backup`, the underlying Dolt remote is reachable directly:

```bash
bd dolt push                       # push to the default remote
bd dolt push --remote <name>       # push to a specific named remote
bd dolt pull                       # pull from the default remote
bd dolt pull --remote <name>       # pull from a specific named remote
```

`--remote <name>` (GH#3211) is useful when you have more than one
Dolt remote configured — e.g. a DoltHub origin plus a side mirror.

## Federation (peer sync)

For distributed setups, Dolt's native federation:

```bash
bd federation add-peer team-sync file:///path/to/peer-checkout
bd federation sync --peer team-sync
```

See [../reference/bd-commands.md#sync-and-data](../reference/bd-commands.md#sync-and-data)
for the federation family. Not used by default by either orchestrator.

## Migration between backends

Historical: there used to be a SQLite backend. That path is removed
(`backend` is always `dolt`). If you have a pre-1.0 SQLite export,
first upgrade that install to the last SQLite-capable version, export
JSONL, then import into a fresh 1.0+ Dolt install.

## Recovery scenarios

### I deleted a bead and want it back

From a JSONL export of the deleted state:

```bash
grep '"id":"bd-abc123"' old-export.jsonl > recover.jsonl
bd import recover.jsonl
```

From Dolt history:

```bash
cd .beads/dolt/bd-tutorial
dolt sql -q "SELECT * FROM issues AS OF 'HEAD~3' WHERE id = 'bd-abc123'"
```

Use `dolt checkout` or `dolt revert` to roll back history.

### I closed a bead and want to reopen

```bash
bd reopen <id> --reason "closed in error"
```

Preserves history; doesn't require restore.

### My DB is corrupt

```bash
bd doctor --check artifacts
bd doctor --fix
```

`bd doctor` probes integrity; `--fix` repairs common issues. For deep
corruption, restore from the last Dolt backup.

## Gotchas

- **Wisps are dolt-ignored.** Since migration 0035, infra types
  (agent / rig / role / message) route to the `wisps` table, which
  Dolt does not commit. "Everything in the DB" is only true for the
  `issues` side — wisp rows are local-only and won't survive a
  `bd backup` / `bd backup restore` round-trip across machines.
- **UUID PKs on auxiliary tables.** Migration 0037 added UUID
  primary keys to `events`, `comments`, `issue_snapshots`,
  `compaction_snapshots`, `wisp_events`, and `wisp_comments`.
  `issues.id` is unchanged (still the base36 hash from
  `idgen/hash.go`), but if you have tooling that joins against
  the PK of those auxiliary tables, the shape changed.
- **JSONL export excludes infra + memories by default.** Use
  `--all` / `--include-infra` / `--include-memories` to override.
  Be thoughtful — wisps may be test data and memories may carry
  agent context.
- **Memory values commit to Dolt.** A JSONL export with
  `--include-memories` emits `_type:memory` lines containing the
  raw value. Don't put secrets in memories, and review exports
  before sharing.
- **Dolt backup is a directory, not a tarball.** Don't `tar` the
  result and expect `bd backup restore` to accept it.
- **Restore is destructive.** `--force` overwrites the local Dolt
  store. Test in a non-production environment first.

## See also

- [../reference/bd-commands.md#maintenance](../reference/bd-commands.md#maintenance)
  — backup/restore/export/import reference.
- [../explanation/the-store-architecture.md](../explanation/the-store-architecture.md)
  — Dolt, wisps, and what's committed.
