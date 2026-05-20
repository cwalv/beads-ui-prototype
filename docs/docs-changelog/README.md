# Docs changelog

Each entry records a run of `mol-docs-refresh` — see the formula at
`projects/foundations/formulas/mol-docs-refresh.formula.toml`.

The **latest entry's `## Tips` section is the state** for the next
run. There's no separate state file.

## Runs

| Date | Label | Summary |
|---|---|---|
| 2026-04-23 | bootstrap | bootstrap entry, no changes applied |
| 2026-05-20 | types-and-claim | gate/molecule are built-in; new Type taxonomy section; documented `bd update --claim` atomic-claim semantics |
| 2026-05-20 | beads-schema-and-cli | migration 0035 type-driven ephemerality; new `bd ping` / `bd prune`; `--exclude-label`; `BD_JSON_ENVELOPE` env toggle |
| 2026-05-20 | gate-await-and-key-count | formula gate `await_id` preferred over `id`; gc.* key count 60 → 85 |
| 2026-05-20 | json-envelope | `BD_JSON_ENVELOPE=1` opt-in envelope shape; structured-error category field |
| 2026-05-20 | reference-sweep | 5-way parallel audit across status-lifecycle, dependency-types, hook-protocol, prime-contract, metadata-conventions, gaps-audit |
| 2026-05-20 | explanation-sweep | 5-way parallel audit across all 6 explanation pages + convergence-metadata + gastown snapshot framing |
| 2026-05-20 | cli-flags | `bd init --remote` (GH#3527); `bd dolt push/pull --remote` (GH#3211); `bd dep tree` GH#3565 rendering |
| 2026-05-20 | tutorials-and-how-to | 5-way parallel audit across all 5 tutorial pages + all 7 how-to pages — major rewrites on `back-up-and-restore`, `push-to-github`, `create-a-graph` against fabricated commands/flags |
| 2026-05-20 | gastown-re-audit | corrects iter-6 false-premise ("gastown pruned") — removed the snapshot block from `gastown-conventions.md`, replaced with verified-against-tip note; catalog spot-checked accurate |
