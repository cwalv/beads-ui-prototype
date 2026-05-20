# 2026-05-20 — beads schema + CLI drift

## Scope

Iteration 2 of the catch-up sequence (the earlier `2026-05-20-types-and-claim`
entry covered the three named drift items). This run audits beads
since `c446a2ef` against the documented schema and CLI surface,
focusing on additions that user-facing clients should know about.

199 of 2825 beads commits touched the documented paths
(`internal/types`, `cmd/bd`, schema migrations, etc.). Reviewed
those for handbook-visible change.

## Changes applied

### 1. Type-driven ephemerality (`bead-schema.md`)

Migration `0035_migrate_infra_to_wisps` (introduced post-bootstrap)
routes beads with `issue_type ∈ {agent, rig, role, message}` to the
`wisps` table. Legacy DBs migrate in place with `ephemeral=1` set.
Operational consequence: inter-agent mail no longer commits to Dolt
history. Added an explanatory paragraph at the end of the "Messaging
and ephemerality" section.

### 2. New top-level commands (`bd-commands.md`)

- `bd ping` — lightweight DB-connectivity health check (`cmd/bd/ping.go`).
- `bd prune` — permanently delete closed non-ephemeral beads to
  reclaim space (`cmd/bd/prune.go`).

### 3. `--exclude-label` flag on `bd ready` / `bd list`

Drops issues that have ANY of the listed labels. Added a note to
each row in the Views table.

### 4. `BD_JSON_ENVELOPE=1` env toggle

Wraps every `--json` response in a uniform
`{ ok, data, error, schema_version }` envelope. Opt-in; default off
preserves backward compatibility. Added a new "Environment toggles"
subsection in `bd-commands.md` under Global flags.

## Tips

- beads @ da73b7511ccac8069a53fcb7a8963e8c9c9433a6
- gascity @ 2c27373a92f9568f40935f5c5067bd33b8584ba6

(gastown not tracked in current rwv.lock.)

## Gaps deferred to a future run

- **gascity-side audit** — 418 path-filtered commits in
  `internal/{beads,formula,molecule,convoy,orders,convergence,session,…}`
  and `cmd/gc/`. The `metadata-conventions.md` and
  `convergence-metadata.md` reference pages are most exposed to
  drift; not touched this iteration.
- **`json-outputs.md`** — the BD_JSON_ENVELOPE envelope shape, the
  new structured-error format (`0d4b97935 feat: JSON schema contract,
  bd ping, structured errors, import enhancements`), and any new
  per-command JSON fields haven't been audited yet.
- **`bd init --remote` bootstrap path** (`112be87f8`) — not documented.
- **`bd dolt push/pull --remote`** flag — not documented.
- **`bd dep tree` improvements** — shows dep type (`f0b6d4973`);
  `[BLOCKED]` only for genuine blocking deps (`218349937`).
- **HOP column drop** — migration `0038_drop_hop_columns` removes
  `quality_score` and `crystallizes`. Other HOP cols
  (`hook_bead`, `role_bead`, etc.) still in legacy schemas; gaps-audit
  §V1 partially resolved but not closed.
- **`bd mol *` new subcommands** if any — not audited.

## See also

- `handbook/reference/bead-schema.md` § Messaging and ephemerality
- `handbook/reference/bd-commands.md` § Issue lifecycle, Views and reports, Environment toggles
