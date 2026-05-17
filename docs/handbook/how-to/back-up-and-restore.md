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

- `--all` — include infra types (agent / rig / role / message) that
  are excluded by default.
- `--no-memories` — exclude memory lines.
- `--include-infra` — same as `--all`, alternate flag.
- `--scrub` — filter test-issue pollution (detected by
  `bd detect-pollution`).

Timestamps with year 0001 are rewritten to Unix epoch
(`export.go:237-248`) so the JSON marshaling is stable.

## JSONL import

```bash
bd import < beads-export.jsonl
```

Or from a file:

```bash
bd import --file beads-export.jsonl
```

Behavior (`import_shared.go:77-194`):

- Memory records → `store.SetConfig(kv.memory.<k>, v)`.
- Issue records → `store.CreateIssuesWithFullOptions()` with
  orphan handling `allow` and prefix validation skipped.
- If no issue prefix is configured, auto-detect from first issue.
- Single Dolt commit: `bd import: <N> issues, <M> memories from
  <filename>`.

Line size limit: 64MB per line.

## Backward compat

Old `wisp` bool field maps to `ephemeral`. Tombstone entries from
v0.35-v0.37 (`status: "tombstone"`) are silently skipped.

## Dolt backup

Uses `DOLT_BACKUP()` inside the SQL server. `bd backup` wraps it:

```bash
bd backup --path /backup/beads-$(date +%Y%m%d).tar.gz
```

Includes the full Dolt history (commits, branches, all). Binary;
roughly the size of `.beads/dolt/`.

Restore:

```bash
bd restore --path /backup/beads-20260423.tar.gz
```

Caveat: the restore wipes existing `.beads/dolt/`. Back up first.

## Auto-backup

Enable periodic JSONL export to `.beads/backup/`:

```bash
bd config set backup.auto true
bd config set backup.interval "24h"
```

Writes a timestamped JSONL per interval in `.beads/backup/`.

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

## Federation (peer sync)

For distributed setups, Dolt's native federation:

```bash
bd federation add-peer team-sync dolthub://myorg/myproject-beads
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

From JSONL backup:

```bash
grep '"id":"bd-abc123"' .beads/backup/latest.jsonl > recover.jsonl
bd import --file recover.jsonl
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

- **Ephemeral (wisp) beads are NOT in JSONL export by default.**
  `--all` / `--include-infra` includes them. Wisps are often test
  data — be thoughtful about what you export.
- **Memory values commit to Dolt.** A JSONL export includes
  `_type=memory` lines containing the raw value. Don't put secrets
  in memories, and review exports before sharing.
- **`bd backup` includes credentials.** The `.beads/.env` file isn't
  in the Dolt store but IS in the directory. If you back up the whole
  `.beads/` dir, secrets go with it. Use `bd backup --path <>` (which
  wraps Dolt's backup and excludes the .env) rather than `tar cf`.
- **Restore is destructive.** Test in a non-production environment
  first.

## See also

- [../reference/bd-commands.md#maintenance](../reference/bd-commands.md#maintenance)
  — backup/restore/export/import reference.
- [../explanation/the-store-architecture.md](../explanation/the-store-architecture.md)
  — Dolt, wisps, and what's committed.
