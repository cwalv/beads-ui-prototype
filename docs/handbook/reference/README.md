# Reference

Structured, information-oriented facts about beads. Read when you know
what you're looking for and need specifics.

## Contents

| Document | Covers |
|---|---|
| [bead-schema.md](bead-schema.md) | Every column of the `issues` / `wisps` tables, with Go-struct field mapping. |
| [status-lifecycle.md](status-lifecycle.md) | The 7 built-in statuses, their categories, and how transitions work. |
| [dependency-types.md](dependency-types.md) | All 20 `DependencyType` values, which block ready, cycle detection rules. |
| [bd-commands.md](bd-commands.md) | Every `bd` subcommand grouped by theme, with what each one does. |
| [json-outputs.md](json-outputs.md) | The JSON shape of each `--json` output. |
| [hook-protocol.md](hook-protocol.md) | The mutation-hook wire protocol and the git-hook shim. |
| [formula-schema.md](formula-schema.md) | `Formula` struct, step fields, compose rules, the four formula types. |
| [metadata-conventions.md](metadata-conventions.md) | Well-known metadata keys — `gc.*`, `gt:*`, label conventions, how to query them. |
| [convergence-metadata.md](convergence-metadata.md) | gascity `convergence.*` namespace — 28 keys for the convergence-loop primitive. |
| [gastown-conventions.md](gastown-conventions.md) | Full gastown catalog — labels, description fields (~65 across 11 bead kinds), `delegated_from` metadata. |
| [prime-contract.md](prime-contract.md) | `bd prime` output format, override chain, MCP mode. |

All docs in this quadrant cite code paths (`path:line`) for non-trivial
claims. Paths are workspace-relative.
